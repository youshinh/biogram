import { SAB_SIZE_BYTES, HEADER_SIZE_BYTES, OFFSETS, WorkletMessage, MainThreadMessage } from '../types/shared';
// Import the processor as a raw URL for Vite to handle
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
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
    
    this.musicClientA = new MusicClient(this.adapter, apiKey, 'A');
    this.musicClientB = new MusicClient(this.adapter, apiKey, 'B');
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

  setMasterBpm(bpm: number) {
      this.masterBpm = bpm;
      // Ideally propagate to synced decks immediately?
      // For now, relies on UI calling syncDeck again or continuous loop.
      // But let's verify if we should auto-update.
      // DJ Software usually keeps "Sync" active.
      // Implementation: Check active sync state (not stored here yet).
  }

  setDeckBpm(deck: 'A' | 'B', bpm: number) {
      if (deck === 'A') this.bpmA = bpm;
      else this.bpmB = bpm;
  }

  syncDeck(deck: 'A' | 'B') {
      const sourceBpm = deck === 'A' ? this.bpmA : this.bpmB;
      if (sourceBpm <= 0) return;
      
      const ratio = this.masterBpm / sourceBpm;
      console.log(`Syncing Deck ${deck}: Source=${sourceBpm} -> Master=${this.masterBpm} (Speed=${ratio.toFixed(3)})`);
      this.updateDspParam('SPEED', ratio, deck);
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

  // Hydra Heads (Visuals)
  getHeadB(): number {
      // For now, read from SAB or shared memory if implemented in Processor
      // Assuming Processor updates READ_POINTER_B and C
      return Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
  }

  getHeadC(): number {
      return 0; // Deprecated
  }

  getLibraryCount(): number {
      const countA = this.musicClientA ? this.musicClientA.getArchiveCount() : 0;
      const countB = this.musicClientB ? this.musicClientB.getArchiveCount() : 0;
      return countA + countB;
  }
}
