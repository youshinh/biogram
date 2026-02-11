import { SAB_SIZE_BYTES, HEADER_SIZE_BYTES, OFFSETS, WorkletMessage, MainThreadMessage } from '../types/shared';
import processorUrl from './worklet/processor.ts?worker&url';
import { StreamAdapter } from './stream-adapter';
import { MusicClient } from '../ai/music-client';

export class AudioEngine {
  private params = new Map<string, number>();
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private sab: SharedArrayBuffer;
  
  // Views
  private headerView: Int32Array;
  private floatView: Float32Array;
  private audioData: Float32Array;

  private adapter: StreamAdapter;
  public musicClientA: MusicClient;
  public musicClientB: MusicClient;
  private isPlaying = false;
  private deckTrackStartFrame: { A: number | null; B: number | null } = { A: null, B: null };
  private loopAutoStopByDeck: {
      A: { armed: boolean; armedWritePtr: number; loopLengthFrames: number; overlapFrames: number; autoStopped: boolean };
      B: { armed: boolean; armedWritePtr: number; loopLengthFrames: number; overlapFrames: number; autoStopped: boolean };
  } = {
      A: { armed: false, armedWritePtr: 0, loopLengthFrames: 0, overlapFrames: 0, autoStopped: false },
      B: { armed: false, armedWritePtr: 0, loopLengthFrames: 0, overlapFrames: 0, autoStopped: false }
  };
  private loopAutoStopInterval: number = 0;
  private deckSourceMode: { A: 'ai' | 'sample'; B: 'ai' | 'sample' } = {
      A: 'ai',
      B: 'ai'
  };

  constructor(apiKey: string = '') {
    this.context = new AudioContext({ 
        sampleRate: 48000, // Updated to match Gemini Model Output Spec
        latencyHint: 'interactive' 
    });
    
    // Initialize Memory
    this.sab = new SharedArrayBuffer(SAB_SIZE_BYTES + HEADER_SIZE_BYTES);
    this.headerView = new Int32Array(this.sab, 0, HEADER_SIZE_BYTES / 4);
    this.floatView = new Float32Array(this.sab, 0, HEADER_SIZE_BYTES / 4);
    // Fix: Constructor takes BYTE offset.
    this.audioData = new Float32Array(this.sab, HEADER_SIZE_BYTES);
    
    // Init Defaults
    this.floatView[OFFSETS.TAPE_VELOCITY / 4] = 1.0;
    this.floatView[OFFSETS.BPM / 4] = 120.0;

    // Initialize adapters
    this.adapter = new StreamAdapter(this.sab);
    this.musicClientA = new MusicClient(this.adapter, apiKey, 'A', (bpm, offset) => {
        if (import.meta.env.DEV) console.log(`[Engine] Auto-detected BPM for A: ${bpm}`);
        this.setDeckBpm('A', bpm);
        // Notify UI
        window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: 'A', bpm: bpm, offset: offset } 
        }));
    }, (startPosition: number) => {
        this.deckTrackStartFrame.A = Math.floor(startPosition);
        // Reset any stale auto-stop state (but do NOT arm — arming is only for explicit loops via setLoop)
        this.resetLoopAutoStop('A');
        this.skipToPosition('A', startPosition);
        setTimeout(() => this.unmute('A'), 150); // Delay unmute to ensure silence
    });
    this.musicClientB = new MusicClient(this.adapter, apiKey, 'B', (bpm, offset) => {
        if (import.meta.env.DEV) console.log(`[Engine] Auto-detected BPM for B: ${bpm}`);
        this.setDeckBpm('B', bpm);
        window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: 'B', bpm: bpm, offset: offset } 
        }));
    }, (startPosition: number) => {
        this.deckTrackStartFrame.B = Math.floor(startPosition);
        // Reset any stale auto-stop state (but do NOT arm — arming is only for explicit loops via setLoop)
        this.resetLoopAutoStop('B');
        this.skipToPosition('B', startPosition);
        setTimeout(() => this.unmute('B'), 150); // Delay unmute to ensure silence
    });
  }

  private withTimeout<T>(label: string, task: Promise<T>, timeoutMs: number): Promise<T> {
      return new Promise<T>((resolve, reject) => {
          const timeoutId = window.setTimeout(() => {
              reject(new Error(`${label} timeout (${timeoutMs}ms)`));
          }, timeoutMs);
          task.then((value) => {
              window.clearTimeout(timeoutId);
              resolve(value);
          }).catch((error) => {
              window.clearTimeout(timeoutId);
              reject(error);
          });
      });
  }

  private async connectMusicClientWithTimeout(
      client: MusicClient,
      deck: 'A' | 'B',
      timeoutMs: number = 8000
  ): Promise<void> {
      const timeoutPromise = new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error(`MusicClient[${deck}] connect timeout (${timeoutMs}ms)`)), timeoutMs);
      });
      await Promise.race([client.connect(), timeoutPromise]);
  }

  async init() {
    try {
      if (this.context.state === 'suspended') {
        try {
          await this.withTimeout('AudioContext.resume', this.context.resume(), 8000);
        } catch (resumeError) {
          console.warn('[AudioEngine] Resume retry after first failure:', resumeError);
          await this.withTimeout('AudioContext.resume(retry)', this.context.resume(), 12000);
        }
      }

      if (import.meta.env.DEV) console.log('Loading AudioWorklet from:', processorUrl);
      try {
        await this.withTimeout(
            'AudioWorklet.addModule',
            this.context.audioWorklet.addModule(processorUrl),
            20000
        );
      } catch (workletError) {
        console.warn('[AudioEngine] Worklet load retry after first failure:', workletError);
        await this.withTimeout(
            'AudioWorklet.addModule(retry)',
            this.context.audioWorklet.addModule(processorUrl),
            45000
        );
      }

      this.workletNode = new AudioWorkletNode(this.context, 'ghost-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 3, // 0:Master, 1:DeckA, 2:DeckB
        outputChannelCount: [2, 2, 2]
      });

      // This ensures we buffer content but don't play it until user asks.
      // Force Pause State (Stop Tape)
      // This ensures we buffer content but don't play it until user asks.
      this.updateDspParam('TAPE_STOP', 1.0, 'A');
      this.updateDspParam('TAPE_STOP', 1.0, 'B');
      
      // Explicitly initialize FX Targets to match UI Defaults
      this.updateDspParam('SLICER_TARGET', 0.0); // 0.0 = A
      this.updateDspParam('GHOST_TARGET', 0.0);  // 0.0 = A
      this.updateDspParam('SLICER_ACTIVE', 0.0);
      this.updateDspParam('GHOST_ACTIVE', 0.0);
      
      // Initialize SLAM (Ensure Silent)
      this.updateDspParam('SLAM_NOISE', 0.0);
      this.updateDspParam('SLAM_DRIVE', 1.0);
      
      this.isPlaying = false;

      // Handle Messages from Worklet
      this.workletNode.port.onmessage = (event: MessageEvent<MainThreadMessage>) => {
        this.handleMessage(event.data);
      };

      // Send SAB to Worklet
      this.workletNode.port.postMessage({
        type: 'INIT_SAB',
        payload: this.sab
      });

      // Wire up Analyser for Visualization
      const setupAnalyser = () => {
          const a = this.context.createAnalyser();
          a.fftSize = 4096; // Better low-end resolution
          a.smoothingTimeConstant = 0.85;
          return a;
      }
      
      this.masterAnalyser = setupAnalyser();
      this.analyserA = setupAnalyser();
      this.analyserB = setupAnalyser();
      
      // Route Worklet Outputs
      // Output 0 -> Master -> Destination
      this.workletNode.connect(this.masterAnalyser, 0, 0);
      this.masterAnalyser.connect(this.context.destination);
      
      // Output 1 -> Deck A Analyser (No destination, just viz)
      this.workletNode.connect(this.analyserA, 1, 0);
      
      // Output 2 -> Deck B Analyser
      this.workletNode.connect(this.analyserB, 2, 0);

      if (import.meta.env.DEV) console.log('AudioEngine Initialized');
      
      // Start AI connections in a non-blocking/safe way.
      // Mobile environments can stall on live socket setup; boot must still finish.
      const connectionResults = await Promise.allSettled([
          this.connectMusicClientWithTimeout(this.musicClientA, 'A'),
          this.connectMusicClientWithTimeout(this.musicClientB, 'B')
      ]);
      connectionResults.forEach((result, index) => {
          if (result.status === 'rejected') {
              const deck = index === 0 ? 'A' : 'B';
              console.warn(`[AudioEngine] Deferred live connection for Deck ${deck}:`, result.reason);
          }
      });
      this.startLoopAutoStopMonitor();

    } catch (e) {
      console.error('Failed to initialize AudioEngine:', e);
      throw e;
    }
  }

  startAI(autoPlay: boolean = true) {
      const initPrompt = `${this.masterBpm} BPM, minimal ambient`;
      this.musicClientA?.start(autoPlay, initPrompt);
      // Give Deck B a slightly different seed/personality or same? Using same for now.
      // Maybe vary description slightly to ensure separation? "minimal ambient B"
      this.musicClientB?.start(autoPlay, initPrompt);
  }

  private positiveMod(value: number, mod: number): number {
      const r = value % mod;
      return r < 0 ? r + mod : r;
  }

  private getDeckBpmValue(deck: 'A' | 'B'): number {
      const detected = deck === 'A' ? this.bpmA : this.bpmB;
      return detected > 0 ? detected : this.masterBpm || 120;
  }

  private getDeckOffsetSeconds(deck: 'A' | 'B'): number {
      return deck === 'A' ? this.offsetA : this.offsetB;
  }

  private snapToBeatGrid(frame: number, bpm: number, offsetSeconds: number): number {
      const sampleRate = this.getSampleRate();
      const beatFrames = (sampleRate * 60) / Math.max(1, bpm);
      const beatAnchor = offsetSeconds * sampleRate;
      const n = Math.round((frame - beatAnchor) / beatFrames);
      return Math.floor(beatAnchor + n * beatFrames);
  }

  getSampleRate(): number {
      return this.context.sampleRate || 48000;
  }

  private getDeckRingFrames(): number {
      return Math.max(1, Math.floor(this.audioData.length / 4));
  }

  private resetLoopAutoStop(deck: 'A' | 'B') {
      this.loopAutoStopByDeck[deck] = {
          armed: false,
          armedWritePtr: 0,
          loopLengthFrames: 0,
          overlapFrames: 0,
          autoStopped: false
      };
  }

  private armLoopAutoStop(deck: 'A' | 'B', loopLengthFrames: number, overlapFrames: number = 0) {
      this.loopAutoStopByDeck[deck] = {
          armed: true,
          armedWritePtr: this.adapter.getReadPointer(deck),
          loopLengthFrames: Math.max(1, Math.floor(loopLengthFrames)),
          overlapFrames: Math.max(0, Math.floor(overlapFrames)),
          autoStopped: false
      };
  }

  private maybeResumeAfterLoopDisable(deck: 'A' | 'B') {
      const state = this.loopAutoStopByDeck[deck];
      if (!state.autoStopped) return;
      if (this.deckSourceMode[deck] === 'ai' && !this.deckStopped[deck]) {
          this.getMusicClient(deck)?.resume();
      }
      this.resetLoopAutoStop(deck);
  }

  private startLoopAutoStopMonitor() {
      if (this.loopAutoStopInterval) {
          window.clearInterval(this.loopAutoStopInterval);
      }
      this.loopAutoStopInterval = window.setInterval(() => {
          (['A', 'B'] as const).forEach((deck) => {
              const state = this.loopAutoStopByDeck[deck];
              if (!state.armed || state.autoStopped) return;
              if (this.deckSourceMode[deck] !== 'ai' || this.deckStopped[deck]) return;

              const readPtr = this.adapter.getReadPointer(deck);
              const playedFrames = readPtr - state.armedWritePtr;
              const thresholdFrames = state.loopLengthFrames + state.overlapFrames;
              if (playedFrames < thresholdFrames) return;

              this.getMusicClient(deck)?.pause();
              state.autoStopped = true;
              state.armed = false;
              if (import.meta.env.DEV) {
                  console.log(`[Engine] Auto-stopped generation on deck ${deck} after loop + fade tail.`);
              }
          });
      }, 120);
  }

  setLoop(deck: 'A' | 'B', start: number, end: number, crossfade: number, count: number, active: boolean) {
     const bpm = this.getDeckBpmValue(deck);
     const offsetSeconds = this.getDeckOffsetSeconds(deck);
     const sampleRate = this.getSampleRate();
     const beatFrames = Math.max(1, (sampleRate * 60) / Math.max(1, bpm));

     const safeCount = count === -1 ? -1 : Math.max(0, Math.floor(count || 0));
     let safeStart = Math.floor(start || 0);
     let safeEnd = Math.floor(end || 0);
     let safeCrossfade = Math.max(0, Math.floor(crossfade || 0));
     let safeActive = active;

     if (safeActive) {
         safeStart = this.snapToBeatGrid(safeStart, bpm, offsetSeconds);
         safeEnd = this.snapToBeatGrid(safeEnd, bpm, offsetSeconds);

         if (safeEnd <= safeStart) {
             safeEnd = safeStart + Math.floor(beatFrames);
         }

         // Guardrail: loop points must stay within currently generated contiguous window.
         // This prevents selecting future/unwritten frames that can produce silent segments.
         if (this.deckSourceMode[deck] === 'ai') {
             const writePtr = this.adapter.getWritePointer(deck);
             const ringFrames = this.getDeckRingFrames();
             const maxLoopEnd = Math.max(1, writePtr - Math.floor(sampleRate * 0.02));
             const minLoopStart = Math.max(0, writePtr - ringFrames);
             safeStart = Math.max(minLoopStart, Math.min(safeStart, maxLoopEnd - 1));
             safeEnd = Math.max(safeStart + 1, Math.min(safeEnd, maxLoopEnd));
         }

         const loopLengthFrames = safeEnd - safeStart;
         if (loopLengthFrames <= 1) {
             safeActive = false;
             safeCrossfade = 0;
         } else if (safeCrossfade > 0) {
             const maxCrossfade = Math.max(0, Math.floor(loopLengthFrames * 0.25));
             const minCrossfade = Math.floor(sampleRate * 0.02);
             const fadeQuantum = Math.max(1, Math.floor(beatFrames / 32));
             safeCrossfade = Math.max(minCrossfade, safeCrossfade);
             safeCrossfade = Math.min(maxCrossfade, safeCrossfade);
             if (safeCrossfade > 0) {
                 safeCrossfade = Math.max(fadeQuantum, Math.floor(safeCrossfade / fadeQuantum) * fadeQuantum);
                 safeCrossfade = Math.min(maxCrossfade, safeCrossfade);
             }
         }
     } else {
         safeCrossfade = 0;
     }

     if (safeActive) this.armLoopAutoStop(deck, safeEnd - safeStart, safeCrossfade);
     else this.maybeResumeAfterLoopDisable(deck);

     this.adapter.configureLoopBlend(
        deck,
        safeActive
            ? {
                  active: true,
                  startFrame: safeStart,
                  endFrame: safeEnd,
                  overlapFrames: safeCrossfade,
                  bpm,
                  offsetSeconds,
                  sampleRate
              }
            : null
     );

     if (this.workletNode) {
         this.workletNode.port.postMessage({
             type: 'CONFIG_LOOP',
             deck,
             start: safeStart,
             end: safeEnd,
             crossfade: safeCrossfade,
             count: safeCount,
             active: safeActive
         });
         // console.log(`[Engine] Set Loop ${deck}: ${active ? 'ON' : 'OFF'} [${start}-${end}]`);
     }
  }

  /**
   * Update DSP parameters in the AudioWorklet
   */
  updateDspParam(param: string, value: number, deck?: 'A' | 'B') {
    // Cache for UI persistence
    this.params.set(param, value);
    
    if (!this.workletNode) return;
    this.workletNode.port.postMessage({
      type: 'CONFIG_UPDATE',
      param,
      value,
      deck // Optional
    });
  }

  setCrossfader(value: number) {
      this.updateDspParam('CROSSFADER', value);
  }
  
  setDeckVolume(deck: 'A' | 'B', value: number) {
      this.updateDspParam('VOLUME', value, deck);
  }
  
  setBiFilter(deck: 'A' | 'B', value: number) {
       this.updateDspParam('FILTER', value, deck);
  }

  setEq(deck: 'A' | 'B', band: 'HI' | 'MID' | 'LOW', value: number) {
      this.updateDspParam(`EQ_${band}`, value, deck);
  }

  setKill(deck: 'A' | 'B', band: 'HI' | 'MID' | 'LOW', value: boolean) {
      this.updateDspParam(`KILL_${band}`, value ? 1.0 : 0.0, deck);
  }

  // Track stopped state for "Reset on Gen" feature
  private deckStopped = { A: true, B: true };

  mute(deck: 'A' | 'B') {
      this.updateDspParam(`MUTE_${deck}`, 1.0);
  }

  unmute(deck: 'A' | 'B') {
      this.updateDspParam(`MUTE_${deck}`, 0.0);
  }
  
  // Global flag for AI Analysis (User Override)
  public isAiAnalysisEnabled = true;

  setAiAnalysisEnabled(enabled: boolean) {
      if (import.meta.env.DEV) console.log(`[Engine] Global AI Analysis: ${enabled}`);
      this.isAiAnalysisEnabled = enabled;
      
      // Update current state based on Playing status + Global Flag
      this.setTapeStop('A', this.deckStopped['A']);
      this.setTapeStop('B', this.deckStopped['B']);
  }

  setTapeStop(deck: 'A' | 'B', isStopped: boolean) {
      this.deckStopped[deck] = isStopped;
      this.updateDspParam('TAPE_STOP', isStopped ? 1.0 : 0.0, deck);
      
      // Toggle Analysis based on Play State AND Global User Setting
      // Logic: Analysis ON if (Deck Playing) AND (Global AI Enabled)
      const shouldAnalyze = !isStopped && this.isAiAnalysisEnabled;

      if (deck === 'A' && this.musicClientA) {
          this.musicClientA.isAnalysisEnabled = shouldAnalyze;
      } else if (deck === 'B' && this.musicClientB) {
          this.musicClientB.isAnalysisEnabled = shouldAnalyze;
      }

      this.applyDeckGenerationState(deck);
  }

  setScratch(deck: 'A' | 'B', speed: number) {
      this.updateDspParam('SCRATCH_SPEED', speed, deck);
  }

  getDspParam(effect: string): number | undefined {
      return this.params.get(effect);
  }

  /**
   * Update AI Prompt Weights
   */
  updateAiPrompt(deck: 'A' | 'B', text: string, weight: number = 1.0) {
      this.deckSourceMode[deck] = 'ai';
      this.updateDspParam('SOURCE_MODE', 0.0, deck);
      this.applyDeckGenerationState(deck);
      if (deck === 'B') this.musicClientB?.updatePrompt(text, weight);
      else this.musicClientA?.updatePrompt(text, weight);
  }

  /**
   * Hard Reset AI Session (Disconnect & Reconnect)
   * Used when GEN is pressed on a STOPPED deck to guarantee fresh context.
   */
  async resetAiSession(deck: 'A' | 'B', prompt: string) {
      this.deckSourceMode[deck] = 'ai';
      this.updateDspParam('SOURCE_MODE', 0.0, deck);
      // 1. Clear physical buffer and visual state immediately
      this.clearBuffer(deck);
      this.updateDspParam('TAPE_STOP', 1.0, deck); // Ensure tape is stopped until we are ready
      
      if (deck === 'A') {
          if (this.musicClientA) {
              await this.musicClientA.resetSession();
              // After reset, we need to send the prompt (resetSession calls connect -> we need to start/prompt)
              // actually start() handles connect? resetSession handles connect.
              // We need to send the prompt to the new session.
              this.musicClientA.updatePrompt(prompt, 1.0);
              // Ensure it's playing if we want it to verify connection, 
              // but deck is stopped so we might just want it ready?
              // The original logic was: if autoPlay=true it plays.
              // We probably want it to start generating immediately into the buffer even if stopped?
              // Wait, if deck is STOPPED, we want to buffer but NOT play audio output yet.
              // Engine.setTapeStop handles the audio output mute.
              // The session needs to be "playing" (generating) to fill the buffer.
              this.musicClientA.resume(); 
          }
      } else {
          if (this.musicClientB) {
              await this.musicClientB.resetSession();
              this.musicClientB.updatePrompt(prompt, 1.0);
              this.musicClientB.resume();
          }
      }
  }

  pause() {
      this.isPlaying = false;
      this.context.suspend();
      this.musicClientA?.pause();
      this.musicClientB?.pause();
  }

  resume() {
      if (this.context.state === 'suspended') {
          this.context.resume();
      }
      this.isPlaying = true;
      this.applyDeckGenerationState('A');
      this.applyDeckGenerationState('B');
  }

  callGhost() {
      if (!this.workletNode) return;
      this.workletNode.port.postMessage({ type: 'JUMP_GHOST' });
  }

  startGhost() {
      if (!this.workletNode) return;
      this.workletNode.port.postMessage({ type: 'GHOST_START' });
  }

  stopGhost() {
      if (!this.workletNode) return;
      this.workletNode.port.postMessage({ type: 'GHOST_STOP' });
  }

  getIsPlaying(): boolean {
      return this.isPlaying;
  }
  
  getOutputLatency(): number {
      // Total Latency = Processing (base) + Hardware (output)
      return (this.context.baseLatency || 0.0) + (this.context.outputLatency || 0.0);
  }

  setBpm(bpm: number) {
      // 1. Update SAB (Visuals only, actually processor overwrites this)
      this.floatView[OFFSETS.BPM / 4] = bpm;
      
      // 2. Update AI Generation
      this.musicClientA?.setConfig({ bpm: bpm });
      this.musicClientB?.setConfig({ bpm: bpm });
      
      // 3. Update Tape Speed via Message
      const ratio = bpm / 120.0;
      this.updateDspParam('SPEED', ratio);
  }

  private handleMessage(msg: MainThreadMessage) {
    switch (msg.type) {
        case 'INIT_COMPLETE':
            if (import.meta.env.DEV) console.log('Worklet confirmed initialization');
            break;
        case 'BUFFER_UNDERRUN':
            console.warn('Audio Buffer Underrun');
            break;
        default:
            if (import.meta.env.DEV) console.log('Worklet Message:', msg);
            break;
    }
  }

  // Debug Method to write noise into buffer to verify playback
  testAudio() {
    if (import.meta.env.DEV) console.log('Injecting test noise into buffer...');
    for (let i = 0; i < this.audioData.length; i += 100) {
        // Create a blip every 100 samples - Reduced volume
        this.audioData[i] = (Math.random() * 2 - 1) * 0.1;
    }
    // Also reset read pointer
    Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, 0);
  }


  // --- BPM & SYNC LINK ---
  public masterBpm = 120;
  public bpmA = 120;
  public bpmB = 120;
  public offsetA = 0;
  public offsetB = 0;
  private syncA = false;
  private syncB = false;

  setMasterBpm(bpm: number) {
      this.masterBpm = bpm;
      // Send to processor for SLICER sync
      this.updateDspParam('MASTER_BPM', bpm);
      
      // Enforce AI Generation BPM to match Master
      this.musicClientA?.setConfig({ bpm: bpm });
      this.musicClientB?.setConfig({ bpm: bpm });
      
      // Auto-update synced decks when Master BPM changes
      if (this.syncA) this.syncDeck('A');
      if (this.syncB) this.syncDeck('B');
  }

  setDeckBpm(deck: 'A' | 'B', bpm: number, offset: number = 0) {
      if (deck === 'A') { this.bpmA = bpm; this.offsetA = offset; }
      else { this.bpmB = bpm; this.offsetB = offset; }
  }

  syncDeck(deck: 'A' | 'B') {
      const sourceBpm = deck === 'A' ? this.bpmA : this.bpmB;
      if (sourceBpm <= 0) return;
      
      // Track sync state
      if (deck === 'A') this.syncA = true;
      else this.syncB = true;
      
      const ratio = this.masterBpm / sourceBpm;
      if (import.meta.env.DEV) console.log(`Syncing Deck ${deck}: Source=${sourceBpm} -> Master=${this.masterBpm} (Speed=${ratio.toFixed(3)})`);
      this.updateDspParam('SPEED', ratio, deck);
      
      // PHASE SYNC (Align to nearest beat)
      this.alignPhase(deck);
  }

  alignPhase(deck: 'A' | 'B') {
      if (!this.headerView) return;
      
      const targetBpm = this.masterBpm;
      
      const otherDeck = deck === 'A' ? 'B' : 'A';
      const offsetSelf = deck === 'A' ? this.offsetA : this.offsetB;
      const offsetOther = deck === 'A' ? this.offsetB : this.offsetA;
      
      const ptrSelf = Atomics.load(this.headerView, (deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B) / 4);
      const ptrOther = Atomics.load(this.headerView, (deck === 'A' ? OFFSETS.READ_POINTER_B : OFFSETS.READ_POINTER_A) / 4);
      
      const bpmSelf = deck === 'A' ? this.bpmA : this.bpmB;
      const bpmOther = deck === 'A' ? this.bpmB : this.bpmA;
      
      // Valid BPM check
      if (bpmSelf < 1 || bpmOther < 1) return;
      
      // BAR Phase Logic
      const sampleRate = this.getSampleRate();
      const beatsPerBar = 4;
      const spbOther = (sampleRate * 60) / bpmOther;
      const samplesPerBarOther = spbOther * beatsPerBar;
      
      const barProgressOther =
          this.positiveMod(ptrOther - (offsetOther * sampleRate), samplesPerBarOther) / samplesPerBarOther;
      
      const spbSelf = (sampleRate * 60) / bpmSelf;
      const samplesPerBarSelf = spbSelf * beatsPerBar;
      
      const currentBarStartSelf = ptrSelf - this.positiveMod(ptrSelf - (offsetSelf * sampleRate), samplesPerBarSelf);
      
      let targetPtr = currentBarStartSelf + (samplesPerBarSelf * barProgressOther);
      
      if (!isNaN(targetPtr)) {
           if (import.meta.env.DEV) console.log(`Bar Sync ${deck}: Ptr ${ptrSelf} -> ${targetPtr} (Phase ${barProgressOther.toFixed(2)})`);
           Atomics.store(this.headerView, (deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B) / 4, Math.floor(targetPtr));
      }
  }

  /**
   * Jumps the playhead close to the write head to minimize latency
   */
  skipToLatest(deck: 'A' | 'B') {
      if (this.workletNode) {
          if (import.meta.env.DEV) console.log(`[Engine] Requesting Skip to Latest for ${deck}`);
          this.workletNode.port.postMessage({ type: 'SKIP_TO_LATEST', deck });
      }
  }
  
  /**
   * Jumps the playhead to a specific position (for new track start)
   */
  skipToPosition(deck: 'A' | 'B', position: number) {
      if (this.workletNode) {
          if (import.meta.env.DEV) console.log(`[Engine] Deck ${deck} skipping to position: ${position} (Frames)`);
          this.workletNode.port.postMessage({ type: 'SKIP_TO_POSITION', deck, position });
      }
  }

  // --- Grid Management ---
  
  shiftGrid(deck: 'A' | 'B', beats: number) {
      const bpm = deck === 'A' ? this.bpmA : this.bpmB;
      const beatDur = 60 / bpm;
      
      if (deck === 'A') {
          this.offsetA = (this.offsetA + (beats * beatDur));
          // Normalize to positive range 0..beatDur (Optional, but keeps offset clean)
          // while (this.offsetA < 0) this.offsetA += beatDur; 
          // while (this.offsetA >= beatDur) this.offsetA -= beatDur;
      } else {
          this.offsetB = (this.offsetB + (beats * beatDur));
      }
      
      if (import.meta.env.DEV) console.log(`Grid Shift ${deck}: ${beats > 0 ? '+' : ''}${beats} beat(s)`);
      
      // Notify UI for redraw
      window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: deck, bpm: bpm, offset: deck === 'A' ? this.offsetA : this.offsetB } 
      }));
  }

  tapBpm(deck: 'A' | 'B') {
      // Basic TAP Logic placeholder
      // Could maintain a list of tap times
      if (import.meta.env.DEV) console.log(`TAP ${deck}`);
  }
  
  unsyncDeck(deck: 'A' | 'B') {
      if (deck === 'A') this.syncA = false;
      else this.syncB = false;
      this.updateDspParam('SPEED', 1.0, deck);
  }

  // Visualization Support
  public masterAnalyser: AnalyserNode | null = null;
  public analyserA: AnalyserNode | null = null;
  public analyserB: AnalyserNode | null = null;

  private spectrumDataMaster: Uint8Array = new Uint8Array(2048);
  private spectrumDataA: Uint8Array = new Uint8Array(2048);
  private spectrumDataB: Uint8Array = new Uint8Array(2048);

  getSpectrum(deck: 'A' | 'B' | 'MASTER' = 'MASTER'): Uint8Array {
      if (deck === 'A') {
          if (this.analyserA) this.analyserA.getByteFrequencyData(this.spectrumDataA);
          return this.spectrumDataA;
      } else if (deck === 'B') {
          if (this.analyserB) this.analyserB.getByteFrequencyData(this.spectrumDataB);
          return this.spectrumDataB;
      } else {
          if (this.masterAnalyser) this.masterAnalyser.getByteFrequencyData(this.spectrumDataMaster);
          return this.spectrumDataMaster;
      }
  }
  
  getAudioData(): Float32Array {
      return this.audioData;
  }

  getReadPointer(): number {
      return Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
  }

  getWritePointer(): number {
      return Atomics.load(this.headerView, OFFSETS.WRITE_POINTER_A / 4);
  }

  getDeckTrackStartFrame(deck: 'A' | 'B'): number | null {
      return this.deckTrackStartFrame[deck];
  }

  // AI Status
  getBufferHealth(): number {
      const healthA = this.musicClientA ? this.musicClientA.getBufferHealth() : 0;
      const healthB = this.musicClientB ? this.musicClientB.getBufferHealth() : 0;
      return Math.min(healthA, healthB);
  }
  
  getAiStatus(): string {
      const a = this.musicClientA?.isConnectedState() ? 'ON' : 'OFF';
      const b = this.musicClientB?.isConnectedState() ? 'ON' : 'OFF';
      return `A:${a} B:${b}`; 
  }

  isDeckStopped(deck: 'A' | 'B'): boolean {
      return this.deckStopped[deck];
  }

  isGenerating(deck: 'A'|'B'): boolean {
      if (this.deckSourceMode[deck] !== 'ai') return false;
      if (deck === 'A') return this.musicClientA?.isGenerating() || false;
      return this.musicClientB?.isGenerating() || false;
  }

  // Hydra Heads (Visuals)
  getHeadB(): number {
      // For now, read from SAB or shared memory if implemented in Processor
      // Assuming Processor updates READ_POINTER_B and C
      return Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
  }
  
  getHeadC(): number {
      return 0; // Deprecated
  }
  
  getGhostPointer(): number {
      return Atomics.load(this.headerView, OFFSETS.GHOST_POINTER / 4);
  }

  getLibraryCount(): number {
      const countA = this.musicClientA ? this.musicClientA.getArchiveCount() : 0;
      const countB = this.musicClientB ? this.musicClientB.getArchiveCount() : 0;
      return countA + countB;
  }
  
  clearBuffer(deck: 'A' | 'B') {
      if (import.meta.env.DEV) console.log(`[Engine] Clearing Buffer for Deck ${deck}`);
      if (deck === 'A') this.musicClientA?.clearBuffer();
      else this.musicClientB?.clearBuffer();
      this.deckTrackStartFrame[deck] = null;
      this.resetLoopAutoStop(deck);
      this.setLoop(deck, 0, 0, 0, -1, false);
      
      // Silence the audio buffer to prevent "Old Tail" pops
      if (this.workletNode) {
          this.workletNode.port.postMessage({ type: 'CLEAR_BUFFER', deck });
      }

      // Do NOT jump immediately. 
      // MusicClient will trigger skipToLatest() once it has buffered enough NEW data.
      // this.skipToLatest(deck);
  }

  /**
   * Extract audio from deck buffer for saving as loop
   * @param deck Deck to extract from
   * @param bars Number of bars to extract (default 8)
   * @returns Object with PCM data, duration, and BPM
   */
  extractLoopBuffer(deck: 'A' | 'B', bars: number = 8): { 
    pcmData: Float32Array; 
    duration: number; 
    bpm: number 
  } | null {
      const bpm = deck === 'A' ? this.bpmA : this.bpmB;
      if (bpm <= 0) {
          console.warn('[Engine] Cannot extract loop: Invalid BPM');
          return null;
      }

      // Calculate samples needed
      const beatsPerBar = 4;
      const secondsPerBeat = 60 / bpm;
      const secondsPerBar = secondsPerBeat * beatsPerBar;
      const totalSeconds = secondsPerBar * bars;
      const sampleRate = this.context.sampleRate || 48000;
      const requestedFrames = Math.floor(totalSeconds * sampleRate);

      // Anchor extraction at the playhead while playing, but at write head when stopped.
      // Stopped decks often keep readPtr static, which can otherwise produce stale/silent exports.
      const readPtrOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
      const writePtrOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
      const readPtr = Atomics.load(this.headerView, readPtrOffset / 4);
      const writePtr = Atomics.load(this.headerView, writePtrOffset / 4);
      const anchorPtr = this.deckStopped[deck] ? writePtr : readPtr;
      
      // Calculate start position (go back from current position)
      const floatsPerDeck = this.audioData.length / 2; // Half buffer per deck
      const framesPerDeck = Math.floor(floatsPerDeck / 2);
      const deckOffset = deck === 'A' ? 0 : floatsPerDeck;
      
      // Avoid exporting long leading silence when requested length exceeds generated audio.
      // This can happen right after a reset/start when writePtr is still short.
      let framesToExtract = requestedFrames;
      if (this.deckSourceMode[deck] === 'ai') {
          const maxContiguousAvailable = Math.max(0, Math.min(writePtr, framesPerDeck));
          framesToExtract = Math.min(framesToExtract, maxContiguousAvailable);
      }
      if (framesToExtract <= 0) {
          console.warn('[Engine] Cannot extract loop: no generated frames available yet');
          return null;
      }

      // Extract samples from ring buffer
      const result = new Float32Array(framesToExtract);
      const startPtr = anchorPtr - framesToExtract;
      
      for (let i = 0; i < framesToExtract; i++) {
          // Read LEFT channel per frame as mono export source.
          let frameIdx = ((startPtr + i) % framesPerDeck);
          if (frameIdx < 0) frameIdx += framesPerDeck;
          const srcIdx = deckOffset + frameIdx * 2;
          result[i] = this.audioData[srcIdx] || 0;
      }

      if (import.meta.env.DEV) {
          const actualSeconds = framesToExtract / sampleRate;
          console.log(`[Engine] Extracted ${bars} bars request -> ${actualSeconds.toFixed(2)}s actual at ${bpm} BPM`);
      }

      return {
          pcmData: result,
          duration: framesToExtract / sampleRate,
          bpm
      };
  }

  /**
   * Load a sample from library into deck buffer for playback
   * @param deck Deck to load into
   * @param pcmData The audio data to load
   * @param bpm The BPM of the sample (for sync)
   */
  loadSampleToBuffer(deck: 'A' | 'B', pcmData: Float32Array, bpm: number) {
      if (!pcmData || pcmData.length === 0) {
          console.warn(`[Engine] Failed to load sample on Deck ${deck}: empty pcmData`);
          return;
      }

      this.deckSourceMode[deck] = 'sample';
      this.updateDspParam('SOURCE_MODE', 1.0, deck);
      this.applyDeckGenerationState(deck);
      this.setLoop(deck, 0, 0, 0, -1, false);

      // Calculate buffer positions
      // Each deck buffer is interleaved stereo: [L, R, L, R, ...]
      const bufferSize = this.audioData.length / 2; // Float count per deck
      const framesPerDeck = Math.floor(bufferSize / 2);
      const deckOffset = deck === 'A' ? 0 : bufferSize;
      
      // Fill entire deck buffer with duplicated mono signal (L/R)
      // to match the worklet's stereo-interleaved read path.
      const sampleLength = pcmData.length;
      for (let frame = 0; frame < framesPerDeck; frame++) {
          const s = pcmData[frame % sampleLength];
          const idx = deckOffset + frame * 2;
          this.audioData[idx] = s;
          this.audioData[idx + 1] = s;
      }
      
      // Sample mode wraps read pointers in the worklet, so we only need one deck-length readable window.
      const writePtrOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
      const minWritePtr = Math.max(4, framesPerDeck + 2);
      Atomics.store(this.headerView, writePtrOffset / 4, minWritePtr);
      
      // Reset read pointer to start of buffer
      const readPtrOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
      Atomics.store(this.headerView, readPtrOffset / 4, 0);
      this.deckTrackStartFrame[deck] = 0;
      
      // Store sample length for potential beat-sync calculations
      // (The buffer wraps at bufferSize, so pointer % bufferSize gives actual position)
      
      // Update BPM for this deck
      this.setDeckBpm(deck, bpm);
      
      // Notify UI of BPM update
      window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
          detail: { deck, bpm, offset: 0 } 
      }));
      
      if (import.meta.env.DEV) {
          const sr = this.context.sampleRate || 44100;
          console.log(`[Engine] Loaded sample to Deck ${deck}: ${sampleLength} mono samples (${(sampleLength/sr).toFixed(2)}s) at ${bpm} BPM, buffer filled with loops`);
      }
  }

  /**
   * Get current audio characteristics from deck (for recommendation matching)
   * Analyzes recent audio from the read buffer to extract features
   */
  getCurrentVector(deck: 'A' | 'B'): { brightness: number; energy: number; rhythm: number } {
      const bufferSize = this.audioData.length / 2;
      const deckOffset = deck === 'A' ? 0 : bufferSize;
      const readPtrOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
      const currentPtr = Atomics.load(this.headerView, readPtrOffset / 4);
      
      // Analyze last ~2 seconds of audio
      const samplesToAnalyze = Math.min(44100 * 2, bufferSize);
      const startPtr = Math.max(0, currentPtr - samplesToAnalyze);
      
      let energy = 0;
      let brightness = 0;
      let zeroCrossings = 0;
      
      for (let i = 0; i < samplesToAnalyze; i++) {
          const idx = ((startPtr + i) % bufferSize);
          const sample = this.audioData[deckOffset + idx];
          const absSample = Math.abs(sample);
          
          energy += absSample * absSample;
          
          // Count zero crossings for brightness estimation
          if (i > 0) {
              const prevIdx = ((startPtr + i - 1) % bufferSize);
              const prevSample = this.audioData[deckOffset + prevIdx];
              if (Math.sign(sample) !== Math.sign(prevSample)) {
                  zeroCrossings++;
              }
          }
      }
      
      // Normalize values to 0-1 range
      energy = Math.min(1, Math.sqrt(energy / samplesToAnalyze) * 3); // Amplify for visibility
      brightness = Math.min(1, (zeroCrossings / samplesToAnalyze) * 20); // Normalize
      const rhythm = 0.5; // Placeholder - would need beat detection
      
      return { brightness, energy, rhythm };
  }

  private getMusicClient(deck: 'A' | 'B'): MusicClient | null {
      return deck === 'A' ? this.musicClientA : this.musicClientB;
  }

  private applyDeckGenerationState(deck: 'A' | 'B') {
      const client = this.getMusicClient(deck);
      if (!client) return;
      const loopAutoStopped = this.loopAutoStopByDeck[deck].autoStopped;
      const shouldGenerate =
          this.deckSourceMode[deck] === 'ai' &&
          !this.deckStopped[deck] &&
          !loopAutoStopped;
      if (shouldGenerate) client.resume();
      else client.pause();
  }
}
