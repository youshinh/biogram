import { SAB_SIZE_BYTES, HEADER_SIZE_BYTES, OFFSETS, WorkletMessage, MainThreadMessage } from '../types/shared';
// Import the processor as a raw URL for Vite to handle
import processorUrl from './worklet/processor.ts?worker&url'; 
import { StreamAdapter } from './stream-adapter';
import { MusicClient } from '../ai/music-client';

export class AudioEngine {
  private context: AudioContext;
  private workletNode: AudioWorkletNode | null = null;
  private sab: SharedArrayBuffer;
  
  // Views
  private headerView: Int32Array;
  private floatView: Float32Array;
  private audioData: Float32Array;

  private adapter: StreamAdapter;
  public musicClient: MusicClient;
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
    // Use env var for key. Note: Vite uses import.meta.env, BUT strict defines might use process.env replacement.
    // Let's safe check both or use what vite config defined.
    // Vite config defined 'process.env.GEMINI_API_KEY'.
    const apiKey = process.env.GEMINI_API_KEY || '';
    this.musicClient = new MusicClient(this.adapter, apiKey);
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
        numberOfOutputs: 1,
        outputChannelCount: [2]
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
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 256;
      this.workletNode.connect(this.analyser);
      this.analyser.connect(this.context.destination);

      console.log('AudioEngine Initialized');
      
      // Start AI Connection
      await this.musicClient.connect();

    } catch (e) {
      console.error('Failed to initialize AudioEngine:', e);
    }
  }

  startAI() {
      this.musicClient.start();
  }

  /**
   * Update DSP parameters in the AudioWorklet
   */
  updateDspParam(effect: string, value: number) {
      if (!this.workletNode) return;
      this.workletNode.port.postMessage({
          type: 'CONFIG_UPDATE',
          param: effect,
          value: value
      });
  }

  /**
   * Update AI Prompt Weights
   */
  updateAiPrompt(genre: string, weight: number) {
      this.musicClient?.updatePrompt(genre, weight);
  }

  pause() {
      this.musicClient?.pause();
      // Send Stop command to Physics
      this.updateDspParam('TAPE_STOP', 1);
      this.isPlaying = false;
  }

  resume() {
      this.musicClient?.resume();
      // Send Resume command (Target speed 1.0)
      this.updateDspParam('TAPE_STOP', 0);
      this.isPlaying = true;
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
      this.musicClient?.setConfig({ bpm: bpm });
      
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

  // Visualization Support
  public analyser: AnalyserNode | null = null;
  private spectrumData: Uint8Array = new Uint8Array(128);

  getSpectrum(): Uint8Array {
      if (!this.analyser) return this.spectrumData;
      this.analyser.getByteFrequencyData(this.spectrumData);
      return this.spectrumData;
  }
  
  getAudioData(): Float32Array {
      return this.audioData;
  }

  getReadPointer(): number {
      return Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
  }

  getWritePointer(): number {
      return Atomics.load(this.headerView, OFFSETS.WRITE_POINTER / 4);
  }

  // AI Status
  getBufferHealth(): number {
      return this.musicClient ? this.musicClient.getBufferHealth() : 0;
  }
  
  getAiStatus(): string {
      return this.musicClient ? this.musicClient.getSmartStatus() : 'OFFLINE';
  }

  // Hydra Heads (Visuals)
  getHeadB(): number {
      // For now, read from SAB or shared memory if implemented in Processor
      // Assuming Processor updates READ_POINTER_B and C
      return Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
  }

  getHeadC(): number {
      return Atomics.load(this.headerView, OFFSETS.READ_POINTER_C / 4);
  }

  getLibraryCount(): number {
      return this.musicClient ? this.musicClient.getArchiveCount() : 0;
  }
}
