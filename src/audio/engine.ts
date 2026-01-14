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
        latencyHint: 'playback' 
    });
    
    // Initialize Memory
    this.sab = new SharedArrayBuffer(SAB_SIZE_BYTES + HEADER_SIZE_BYTES);
    this.headerView = new Int32Array(this.sab, 0, HEADER_SIZE_BYTES / 4);
    this.floatView = new Float32Array(this.sab, 0, HEADER_SIZE_BYTES / 4);
    this.audioData = new Float32Array(this.sab, HEADER_SIZE_BYTES / 4);
    
    // Init Defaults
    this.floatView[OFFSETS.TAPE_VELOCITY / 4] = 1.0;
    this.floatView[OFFSETS.BPM / 4] = 120.0;

    // Initialize adapters
    this.adapter = new StreamAdapter(this.sab);
    // Support both Vite env and process.env (legacy/fallback)
    // @ts-ignore
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    
    this.musicClientA = new MusicClient(this.adapter, apiKey, 'A', (bpm, offset) => {
        console.log(`[Engine] Auto-detected BPM for A: ${bpm}`);
        this.setDeckBpm('A', bpm);
        // Notify UI
        window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: 'A', bpm: bpm, offset: offset } 
        }));
    });
    this.musicClientB = new MusicClient(this.adapter, apiKey, 'B', (bpm, offset) => {
        console.log(`[Engine] Auto-detected BPM for B: ${bpm}`);
        this.setDeckBpm('B', bpm);
        window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: 'B', bpm: bpm, offset: offset } 
        }));
    });
  }

  async init() {
    try {
      if (this.context.state === 'suspended') {
        await this.context.resume();
      }

      console.log('Loading AudioWorklet from:', processorUrl);
      await this.context.audioWorklet.addModule(processorUrl);

      this.workletNode = new AudioWorkletNode(this.context, 'ghost-processor', {
        numberOfInputs: 1,
        numberOfOutputs: 3, // 0:Master, 1:DeckA, 2:DeckB
        outputChannelCount: [2, 2, 2]
      });

      // Force Pause State (Stop Tape)
      // This ensures we buffer content but don't play it until user asks.
      this.updateDspParam('TAPE_STOP', 1.0);
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
          a.fftSize = 2048;
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

      console.log('AudioEngine Initialized');
      
      // Start AI Connection
      // Note: Concurrent connections might be rate-limited, but let's try.
      await this.musicClientA.connect();
      await this.musicClientB.connect();

    } catch (e) {
      console.error('Failed to initialize AudioEngine:', e);
    }
  }

  startAI(autoPlay: boolean = true) {
      this.musicClientA?.start(autoPlay);
      this.musicClientB?.start(autoPlay);
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

  setEq(deck: 'A' | 'B', band: 'HI' | 'MID' | 'LOW', value: number) {
      this.updateDspParam(`EQ_${band}`, value, deck);
  }

  setKill(deck: 'A' | 'B', band: 'HI' | 'MID' | 'LOW', value: boolean) {
      this.updateDspParam(`KILL_${band}`, value ? 1.0 : 0.0, deck);
  }

  setTapeStop(deck: 'A' | 'B', stop: boolean) {
      this.updateDspParam('TAPE_STOP', stop ? 1.0 : 0.0, deck);
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
            console.log('Worklet confirmed initialization');
            break;
        case 'BUFFER_UNDERRUN':
            console.warn('Audio Buffer Underrun');
            break;
        default:
            console.log('Worklet Message:', msg);
            break;
    }
  }

  // Debug Method to write noise into buffer to verify playback
  testAudio() {
    console.log('Injecting test noise into buffer...');
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
      console.log(`Syncing Deck ${deck}: Source=${sourceBpm} -> Master=${this.masterBpm} (Speed=${ratio.toFixed(3)})`);
      this.updateDspParam('SPEED', ratio, deck);
      
      // PHASE SYNC (Align to nearest beat)
      this.alignPhase(deck);
  }

  alignPhase(deck: 'A' | 'B') {
      if (!this.headerView) return;
      
      const targetBpm = this.masterBpm;
      
      // Let's align to the "Other" deck if it is playing
      const otherDeck = deck === 'A' ? 'B' : 'A';
      
      const offsetSelf = deck === 'A' ? this.offsetA : this.offsetB;
      const offsetOther = deck === 'A' ? this.offsetB : this.offsetA;
      
      const ptrSelf = Atomics.load(this.headerView, (deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B) / 4);
      const ptrOther = Atomics.load(this.headerView, (deck === 'A' ? OFFSETS.READ_POINTER_B : OFFSETS.READ_POINTER_A) / 4);
      
      const bpmSelf = deck === 'A' ? this.bpmA : this.bpmB;
      const bpmOther = deck === 'A' ? this.bpmB : this.bpmA;
      
      // Valid BPM check
      if (bpmSelf < 1 || bpmOther < 1) return;
      
      // BAR Sync Logic (Assuming 4/4 time signature)
      const beatsPerBar = 4;
      
      // Samples per beat & bar
      const spbOther = (44100 * 60) / bpmOther;
      const samplesPerBarOther = spbOther * beatsPerBar;
      
      // Calculate Phase of Other relative to BAR (0..1)
      // Phase = How far into the BAR are we?
      const barProgressOther = ((ptrOther - (offsetOther * 44100)) % samplesPerBarOther) / samplesPerBarOther;
      
      // We want Self to have the same BAR phase
      const spbSelf = (44100 * 60) / bpmSelf;
      const samplesPerBarSelf = spbSelf * beatsPerBar;
      
      const currentBarStartSelf = ptrSelf - ((ptrSelf - (offsetSelf * 44100)) % samplesPerBarSelf);
      
      // Target position = Current Bar Start + (samplesPerBarSelf * barProgressOther)
      // This matches the relative position within the BAR
      let targetPtr = currentBarStartSelf + (samplesPerBarSelf * barProgressOther);
      
      // NOTE: Because we are jumping to a specific phase in the bar, 
      // the target pointer might be BEHIND the current pointer (rewind) or AHEAD (skip).
      // This creates the "Cueing" effect.
      
      // Write back
      if (!isNaN(targetPtr)) {
           console.log(`Bar Sync ${deck}: Ptr ${ptrSelf} -> ${targetPtr} (Match ${otherDeck} Bar Phase ${barProgressOther.toFixed(2)})`);
           Atomics.store(this.headerView, (deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B) / 4, Math.floor(targetPtr));
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
      
      console.log(`Grid Shift ${deck}: ${beats > 0 ? '+' : ''}${beats} beat(s)`);
      
      // Notify UI for redraw
      window.dispatchEvent(new CustomEvent('deck-bpm-update', { 
            detail: { deck: deck, bpm: bpm, offset: deck === 'A' ? this.offsetA : this.offsetB } 
      }));
  }

  tapBpm(deck: 'A' | 'B') {
      // Basic TAP Logic placeholder
      // Could maintain a list of tap times
      console.log(`TAP ${deck}`);
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
  private spectrumData: Uint8Array = new Uint8Array(128);

  getSpectrum(deck: 'A' | 'B' | 'MASTER' = 'MASTER'): Uint8Array {
      const target = deck === 'A' ? this.analyserA : deck === 'B' ? this.analyserB : this.masterAnalyser;
      if (!target) return this.spectrumData;
      // @ts-ignore
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
}
