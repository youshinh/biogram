import { SAB_SIZE_BYTES, HEADER_SIZE_BYTES, OFFSETS, WorkletMessage, MainThreadMessage } from '../types/shared';
// Import the processor as a raw URL for Vite to handle
import processorUrl from './worklet/processor.ts?url'; 
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

  constructor() {
    this.context = new AudioContext({ 
        sampleRate: 44100,
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
    // Support both Vite env and process.env (legacy/fallback)
    // @ts-ignore
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    
    this.musicClientA = new MusicClient(this.adapter, apiKey, 'A', (bpm, offset) => {
        if (import.meta.env.DEV) console.log(`[Engine] Auto-detected BPM for A: ${bpm}`);
        this.setDeckBpm('A', bpm);
        // Notify UI
        window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: 'A', bpm: bpm, offset: offset } 
        }));
    }, (startPosition: number) => {
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
        this.skipToPosition('B', startPosition);
        setTimeout(() => this.unmute('B'), 150);
    });
  }

  async init() {
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      if (import.meta.env.DEV) console.log('Loading AudioWorklet from:', processorUrl);
      await this.context.audioWorklet.addModule(processorUrl);

      this.workletNode = new AudioWorkletNode(this.context, 'ghost-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 3, // 0:Master, 1:DeckA, 2:DeckB
        outputChannelCount: [2, 2, 2]
      });

      // Force Pause State (Stop Tape)
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
      
      // Start AI Connection
      // Note: Concurrent connections might be rate-limited, but let's try.
      await this.musicClientA.connect();
      await this.musicClientB.connect();

    } catch (e) {
      console.error('Failed to initialize AudioEngine:', e);
    }
  }

  startAI(autoPlay: boolean = true) {
      const initPrompt = `${this.masterBpm} BPM, minimal ambient`;
      this.musicClientA?.start(autoPlay, initPrompt);
      // Give Deck B a slightly different seed/personality or same? Using same for now.
      // Maybe vary description slightly to ensure separation? "minimal ambient B"
      this.musicClientB?.start(autoPlay, initPrompt);
  }

  setLoop(deck: 'A' | 'B', start: number, end: number, crossfade: number, count: number, active: boolean) {
     if (this.workletNode) {
         this.workletNode.port.postMessage({
             type: 'CONFIG_LOOP',
             deck,
             start,
             end,
             crossfade,
             count,
             active
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
  
  setTapeStop(deck: 'A' | 'B', isStopped: boolean) {
      this.deckStopped[deck] = isStopped;
      this.updateDspParam('TAPE_STOP', isStopped ? 1.0 : 0.0, deck);
      
      // Toggle Analysis based on Play State (Stop = Disable Analysis)
      if (deck === 'A' && this.musicClientA) {
          this.musicClientA.isAnalysisEnabled = !isStopped;
      } else if (deck === 'B' && this.musicClientB) {
          this.musicClientB.isAnalysisEnabled = !isStopped;
      }
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
      if (deck === 'B') this.musicClientB?.updatePrompt(text, weight);
      else this.musicClientA?.updatePrompt(text, weight);
  }

  /**
   * Hard Reset AI Session (Disconnect & Reconnect)
   * Used when GEN is pressed on a STOPPED deck to guarantee fresh context.
   */
  async resetAiSession(deck: 'A' | 'B', prompt: string) {
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
      this.musicClientA?.resume();
      this.musicClientB?.resume();
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
      const beatsPerBar = 4;
      const spbOther = (44100 * 60) / bpmOther;
      const samplesPerBarOther = spbOther * beatsPerBar;
      
      const barProgressOther = ((ptrOther - (offsetOther * 44100)) % samplesPerBarOther) / samplesPerBarOther;
      
      const spbSelf = (44100 * 60) / bpmSelf;
      const samplesPerBarSelf = spbSelf * beatsPerBar;
      
      const currentBarStartSelf = ptrSelf - ((ptrSelf - (offsetSelf * 44100)) % samplesPerBarSelf);
      
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
  private spectrumData: Uint8Array = new Uint8Array(2048); // Match 4096 / 2

  getSpectrum(deck: 'A' | 'B' | 'MASTER' = 'MASTER'): Uint8Array {
      const target = deck === 'A' ? this.analyserA : deck === 'B' ? this.analyserB : this.masterAnalyser;
      if (!target) return this.spectrumData;
      target.getByteFrequencyData(this.spectrumData);
      return this.spectrumData;
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

  // AI Status
  getBufferHealth(): number {
      const healthA = this.musicClientA ? this.musicClientA.getBufferHealth() : 0;
      const healthB = this.musicClientB ? this.musicClientB.getBufferHealth() : 0;
      return Math.min(healthA, healthB);
  }
  
  getAiStatus(): string {
      const a = this.musicClientA ? (this.musicClientA as any).isConnected ? 'ON' : 'OFF' : 'OFF';
      const b = this.musicClientB ? (this.musicClientB as any).isConnected ? 'ON' : 'OFF' : 'OFF';
      return `A:${a} B:${b}`; 
  }

  isDeckStopped(deck: 'A' | 'B'): boolean {
      return this.deckStopped[deck];
  }

  isGenerating(deck: 'A'|'B'): boolean {
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
      const samplesToExtract = Math.floor(totalSeconds * 44100);

      // Get current read pointer
      const readPtrOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
      const currentPtr = Atomics.load(this.headerView, readPtrOffset / 4);
      
      // Calculate start position (go back from current position)
      const bufferSize = this.audioData.length / 2; // Half buffer per deck
      const deckOffset = deck === 'A' ? 0 : bufferSize;
      
      // Extract samples from ring buffer
      const result = new Float32Array(samplesToExtract);
      const startPtr = currentPtr - samplesToExtract;
      
      for (let i = 0; i < samplesToExtract; i++) {
          // Handle wrap-around in ring buffer
          let srcIdx = ((startPtr + i) % bufferSize);
          if (srcIdx < 0) srcIdx += bufferSize;
          result[i] = this.audioData[deckOffset + srcIdx];
      }

      if (import.meta.env.DEV) {
          console.log(`[Engine] Extracted ${bars} bars (${totalSeconds.toFixed(2)}s) at ${bpm} BPM`);
      }

      return {
          pcmData: result,
          duration: totalSeconds,
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
      // Calculate buffer positions
      const bufferSize = this.audioData.length / 2; // Half buffer per deck
      const deckOffset = deck === 'A' ? 0 : bufferSize;
      
      // Fill entire buffer with looped sample data
      const sampleLength = pcmData.length;
      for (let i = 0; i < bufferSize; i++) {
          // Loop the sample to fill the entire buffer
          this.audioData[deckOffset + i] = pcmData[i % sampleLength];
      }
      
      // Set write pointer to a very high value to allow continuous looping
      // The AudioWorklet processor will read up to writePtr, so we set it very high
      const writePtrOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
      const loopWritePtr = bufferSize * 1000; // Allow many loops before potential wrap
      Atomics.store(this.headerView, writePtrOffset / 4, loopWritePtr);
      
      // Reset read pointer to start of buffer
      const readPtrOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
      Atomics.store(this.headerView, readPtrOffset / 4, 0);
      
      // Store sample length for potential beat-sync calculations
      // (The buffer wraps at bufferSize, so pointer % bufferSize gives actual position)
      
      // Update BPM for this deck
      this.setDeckBpm(deck, bpm);
      
      // Notify UI of BPM update
      window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
          detail: { deck, bpm, offset: 0 } 
      }));
      
      if (import.meta.env.DEV) {
          console.log(`[Engine] Loaded sample to Deck ${deck}: ${sampleLength} samples (${(sampleLength/44100).toFixed(2)}s) at ${bpm} BPM, buffer filled with loops`);
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
}
