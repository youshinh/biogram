// @ts-ignore
import { TapeTransport } from './dsp/tape-model';
// @ts-ignore
import { Decimator } from './dsp/decimator';
// @ts-ignore
import { TapeDelay } from './dsp/tape-delay';
// @ts-ignore
import { SpectralGate } from './dsp/spectral-gate';
// @ts-ignore
import { BloomReverb } from './dsp/bloom-reverb';
// @ts-ignore
import { Limiter } from './dsp/limiter';
// @ts-ignore
import { IsolatorEQ } from './dsp/isolator';
// @ts-ignore
import { SmoothValue } from './dsp/smooth-value';
// @ts-ignore
import { CloudGrain } from './dsp/cloud-grain';
// @ts-ignore
import { PinkNoise } from './dsp/pink-noise';
import { BiquadFilter } from './dsp/biquad-filter';


declare const AudioWorkletProcessor: any;
declare const registerProcessor: any;
declare const currentFrame: number;

// INLINED CONSTANTS
const OFFSETS = {
  WRITE_POINTER_A: 0,   // Int32: Deck A Write Head
  WRITE_POINTER_B: 4,   // Int32: Deck B Write Head
  READ_POINTER_A: 8,    // Int32: Deck A Play Head
  READ_POINTER_B: 12,   // Int32: Deck B Play Head
  STATE_FLAGS: 16,     // Int32: Bitmask
  TAPE_VELOCITY: 20,   // Float32: Current physics velocity
  BPM: 24,             // Float32: Global BPM
  GHOST_POINTER: 28,   // Int32: Ghost Play Head Position
  SLICER_ACTIVE: 32,   // Int32: Slicer Active State
};

// ... SvfFilter Code ...
class SvfFilter {
    private sampleRate: number;
    private s1: number = 0.0;
    private s2: number = 0.0;
    private g: number = 0.0;
    private k: number = 0.0;
    private a1: number = 0.0;
    private a2: number = 0.0;
    private a3: number = 0.0;
    private cutoff: number = 1000;
    private q: number = 0.7;

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.calcCoeffs();
    }
    setParams(cutoff: number, q: number) {
        this.cutoff = Math.max(20, Math.min(this.sampleRate * 0.49, cutoff));
        this.q = Math.max(0.1, q);
        this.calcCoeffs();
    }
    private calcCoeffs() {
        this.g = Math.tan(Math.PI * this.cutoff / this.sampleRate);
        this.k = 1.0 / this.q;
        this.a1 = 1.0 / (1.0 + this.g * (this.g + this.k));
        this.a2 = this.g * this.a1;
        this.a3 = this.g * this.a2;
    }
    process(input: number, type: 'LP' | 'HP' | 'BP'): number {
         if (isNaN(input)) input = 0;
         
         const v3 = input - this.s2;
        const v1 = this.a1 * this.s1 + this.a2 * v3;
        const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
        this.s1 = 2 * v1 - this.s1;
        this.s2 = 2 * v2 - this.s2;
        if (type === 'LP') return v2;
        if (type === 'BP') return v1;
        if (type === 'HP') return input - this.k * v1 - v2;
        return input;
    }
}

class GhostProcessor extends AudioWorkletProcessor {
  private sab: SharedArrayBuffer | null = null;
  private headerView: Int32Array | null = null;
  private floatView: Float32Array | null = null;
  private audioData: Float32Array | null = null;
  
  // DUAL DECKS
  private tapeA: TapeTransport = new TapeTransport();
  private tapeB: TapeTransport = new TapeTransport();
  private eqA: IsolatorEQ = new IsolatorEQ(44100);
  private eqB: IsolatorEQ = new IsolatorEQ(44100);
  
  // MIXER
  private crossfader: number = 0.5; // 0.0 = A, 1.0 = B
  
  // FX (Master Chain)
  // Stereo Instances
  private decimatorL: Decimator = new Decimator(44100);
  private decimatorR: Decimator = new Decimator(44100);
  private noiseLevel: number = 0.0;
  
  private delay: TapeDelay = new TapeDelay(44100, 2.0); // Mono Send for efficiency
  private dubFeedback: number = 0.0;
  
  private spectralGateL: SpectralGate = new SpectralGate(44100);
  private spectralGateR: SpectralGate = new SpectralGate(44100);
  
  private bloom: BloomReverb = new BloomReverb(44100); // Mono Send for efficiency
  
  private limiterL: Limiter = new Limiter(44100);
  private limiterR: Limiter = new Limiter(44100);
  
  private hpfL: SvfFilter = new SvfFilter(44100);
  private hpfR: SvfFilter = new SvfFilter(44100);
  private lpfL: SvfFilter = new SvfFilter(44100);
  private lpfR: SvfFilter = new SvfFilter(44100);

  // States
  private filterActive: boolean = false;
  private decimatorActive: boolean = false;
  private tapeActive: boolean = false;
  private reverbActive: boolean = false;
  private compActive: boolean = false;
  private spectralGateActive: boolean = false;
  
  private hpfFreq: number = 20;
  private lpfFreq: number = 14000;
  private filterQ: number = 0.7;
  private filterDrive: number = 0.0;
  private filterDrift: number = 0.0;
  
  // Transport State
  private baseSpeedA: number = 1.0;
  private baseSpeedB: number = 1.0;
  // Track stop state internally to prevent speed updates from overriding stop
  private tapeStopA: boolean = true; 
  private tapeStopB: boolean = true;

  // GHOST & SLICER STATE
  private ghostActive: boolean = false;
  private ghostTarget: 'A' | 'B' = 'A'; // Which deck to shadow
  private ghostOffset: number = 44100; // 1 second behind default
  private ghostPtr: number = 0;
  private ghostMix: number = 0.6; // Ghost volume (controlled by GHOST_FADE)
  private ghostLpfCoeff: number = 0.5; // Ghost EQ LPF coefficient
  private ghostLpfStateL: number = 0;
  private ghostLpfStateR: number = 0;
  
  private slicerActive: boolean = false;
  private slicerTarget: 'A' | 'B' = 'B';
  
  // SLAM (Energy Riser) Components
  private pinkNoise = new PinkNoise();
  private filterL = new BiquadFilter();
  private filterR = new BiquadFilter();
  
  // SONIC ENHANCER (Master Polish)
  private enhanceActive: boolean = true;
  private enhanceAmount: number = 0.5; // Default to beneficial level
  private subL: BiquadFilter = new BiquadFilter(); private subR: BiquadFilter = new BiquadFilter();
  private bassL: BiquadFilter = new BiquadFilter(); private bassR: BiquadFilter = new BiquadFilter();
  private highL: BiquadFilter = new BiquadFilter(); private highR: BiquadFilter = new BiquadFilter();
  
  // SLAM Parameters
  private slamCutoff: number = 20.0;
  private slamRes: number = 0.0; // Default to 0 to keep isResonant() false (Inactive)
  private slamDrive: number = 1.0;
  private slamNoise: number = 0.0; // 0..1
  
  // SLICER PARAMS
  private slicerPattern: number = 0.25;
  private slicerGate: number = 0.5; // 0..1 duty cycle
  private slicerSpeed: number = 0.5; // Speed divisor
  private slicerSmooth: number = 0.1; // 0..1 UI param
  private slicerRandom: number = 0.0; // 0..1 Jitter amount

  private slicerCurrentGain: number = 1.0; // DSP State
  private slicerStepIndex: number = -1;
  private slicerStepGate: number = 0.5; // Current step's gate width
  
  // Master BPM for SLICER sync
  private masterBpm: number = 120; 

  // TRIM / DRIVE
  private trimA: number = 1.0;
  private trimB: number = 1.0;
  private driveA: number = 0.0;
  private driveB: number = 0.0;
  
  // Smooth Mute State (1.0 = Unmuted, 0.0 = Muted)
  private muteTargetA: number = 1.0;
  private muteCurrentA: number = 1.0;
  private muteTargetB: number = 1.0;
  private muteCurrentB: number = 1.0;

  // DC Blocker State
  private dcPrevInAL: number = 0;
  private dcPrevOutAL: number = 0;
  private dcPrevInAR: number = 0;
  private dcPrevOutAR: number = 0;
  
  private dcPrevInBL: number = 0;
  private dcPrevOutBL: number = 0;
  private dcPrevInBR: number = 0;
  private dcPrevOutBR: number = 0;
  
  // EQ (Multipliers 0-1.5)
  private eqAHi: number = 1.0;
  private eqAMid: number = 1.0;
  private eqALow: number = 1.0;
  private eqBHi: number = 1.0;
  private eqBMid: number = 1.0;
  private eqBLow: number = 1.0;
  
  // KILL (Mute, 0 or 1)
  private killAHi: boolean = false;
  private killAMid: boolean = false;
  private killALow: boolean = false;
  private killBHi: boolean = false;
  private killBMid: boolean = false;
  private killBLow: boolean = false;

  // LOOP STATE
  private loopActiveA: boolean = false;
  private loopStartA: number = 0;
  private loopEndA: number = 0;
  private loopCrossfadeA: number = 0; // Samples
  private loopCountA: number = -1; // -1 = Infinite
  private loopRemainingA: number = -1;

  private loopActiveB: boolean = false;
  private loopStartB: number = 0;
  private loopEndB: number = 0;
  private loopCrossfadeB: number = 0;
  private loopCountB: number = -1;
  private loopRemainingB: number = -1;

  // CLOUD GRAIN STATE
  private cloudActive: boolean = false;
  private cloud: CloudGrain;
  // Params
  private cloudDensity: number = 0.5;
  private cloudSize: number = 0.2;
  private cloudSpray: number = 0.2;
  private cloudPitch: number = 1.0;
  private cloudMix: number = 0.5;

  // DYNAMICS STATE
  private compThresh: number = 0.95;
  private compRatio: number = 4.0;
  private compMakeup: number = 1.0;

  // SMOOTHING
  private tapeSendSmooth: SmoothValue;
  private reverbSendSmooth: SmoothValue;

  constructor() {
    super();
    this.hpfL.setParams(this.hpfFreq, this.filterQ); 
    this.hpfR.setParams(this.hpfFreq, this.filterQ); 
    this.lpfL.setParams(this.lpfFreq, this.filterQ); 
    this.lpfR.setParams(this.lpfFreq, this.filterQ); 
    this.updateLimiter();
    
    this.cloud = new CloudGrain(44100); 
    
    this.tapeSendSmooth = new SmoothValue(0, 0.9995);
    this.reverbSendSmooth = new SmoothValue(0, 0.9995);

    // Init Sonic Enhancer
    this.updateEnhance();

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_SAB') {
        this.sab = event.data.payload;
        this.initBuffer();
      }
      
      if (event.data.type === 'CONFIG_LOOP') {
          const { deck, start, end, crossfade, count, active } = event.data;
          // Frames should be consistent with main thread
          if (deck === 'A') {
              this.loopActiveA = active;
              this.loopStartA = start;
              this.loopEndA = end;
              this.loopCrossfadeA = crossfade || 0;
              this.loopCountA = count ?? -1;
              this.loopRemainingA = this.loopCountA;
          } else {
              this.loopActiveB = active;
              this.loopStartB = start;
              this.loopEndB = end;
              this.loopCrossfadeB = crossfade || 0;
              this.loopCountB = count ?? -1;
              this.loopRemainingB = this.loopCountB;
          }
      }

      if (event.data.type === 'CONFIG_UPDATE') {
          const { param, value, deck } = event.data;
          
          if (param === 'CROSSFADER') this.crossfader = value;

          if (param === 'TAPE_STOP') {
              if (deck === 'A') {
                  this.tapeStopA = value > 0.5;
                  this.tapeA.setTargetSpeed(this.tapeStopA ? 0 : this.baseSpeedA);
              }
              if (deck === 'B') {
                  this.tapeStopB = value > 0.5;
                  this.tapeB.setTargetSpeed(this.tapeStopB ? 0 : this.baseSpeedB);
              }
          }
          if (param === 'SPEED') {
               if (deck === 'B') {
                   this.baseSpeedB = value;
                   // Only apply speed update if NOT stopped
                   if (!this.tapeStopB) {
                       this.tapeB.setTargetSpeed(value);
                   }
               } else {
                   this.baseSpeedA = value;
                   if (!this.tapeStopA) {
                       this.tapeA.setTargetSpeed(value);
                   }
               }
          }
          if (param === 'SCRATCH_SPEED') {
              if (deck === 'B') this.tapeB.setTargetSpeed(value);
              else this.tapeA.setTargetSpeed(value);
          }
          
          const targetEq = (deck === 'B') ? this.eqB : this.eqA;
          if (param === 'EQ_HI') targetEq.gainHigh = value; 
          if (param === 'EQ_MID') targetEq.gainMid = value;
          if (param === 'EQ_LOW') targetEq.gainLow = value;
          if (param === 'KILL_HI') targetEq.killHigh = value;
          if (param === 'KILL_MID') targetEq.killMid = value;
          if (param === 'KILL_LOW') targetEq.killLow = value;

          if (param === 'TRIM') { if (deck === 'A') this.trimA = value; else this.trimB = value; }
          if (param === 'DRIVE') { if (deck === 'A') this.driveA = value; else this.driveB = value; }
          if (param === 'TRIM_A') this.trimA = value;
          if (param === 'TRIM_B') this.trimB = value;
          if (param === 'DRIVE_A') this.driveA = value;
          if (param === 'DRIVE_B') this.driveB = value;

          if (param === 'MUTE_A') this.muteTargetA = (value > 0.5) ? 0.0 : 1.0; 
          if (param === 'MUTE_B') this.muteTargetB = (value > 0.5) ? 0.0 : 1.0;

          if (param === 'FILTER_ACTIVE') this.filterActive = value > 0.5;
          if (param === 'FILTER_DRIVE') this.filterDrive = value;
          if (param === 'FILTER_DRIFT') this.filterDrift = value;
          
          if (param === 'DECIMATOR_ACTIVE') this.decimatorActive = value > 0.5;
          
          if (param === 'CLOUD_ACTIVE') this.cloudActive = value > 0.5;
          if (param === 'CLOUD_DENSITY') this.cloudDensity = value;
          if (param === 'CLOUD_SIZE') this.cloudSize = value;
          if (param === 'CLOUD_SPRAY') this.cloudSpray = value;
          if (param === 'CLOUD_PITCH') this.cloudPitch = value; 
          if (param === 'CLOUD_MIX') this.cloudMix = value;
          
          if (param === 'TAPE_ACTIVE') {
              this.tapeActive = value > 0.5;
              this.tapeSendSmooth.set(this.tapeActive ? 1.0 : 0.0);
          }
          if (param === 'REVERB_ACTIVE') {
              this.reverbActive = value > 0.5;
              this.reverbSendSmooth.set(this.reverbActive ? 1.0 : 0.0);
          }
          if (param === 'COMP_ACTIVE') this.compActive = value > 0.5;
          if (param === 'COMP_THRESH') {
                this.compThresh = value;
                this.updateLimiter();
          }
          if (param === 'COMP_RATIO') {
                this.compRatio = value;
                this.updateLimiter();
          }
          if (param === 'COMP_MAKEUP') {
                this.compMakeup = value;
                this.updateLimiter();
          }

          if (param === 'HPF') { 
              this.hpfFreq = 20 * Math.pow(1000, value); 
              this.hpfL.setParams(this.hpfFreq, this.filterQ); 
              this.hpfR.setParams(this.hpfFreq, this.filterQ); 
          }
          if (param === 'LPF') { 
              this.lpfFreq = 20 * Math.pow(1000, value); 
              this.lpfL.setParams(this.lpfFreq, this.filterQ); 
              this.lpfR.setParams(this.lpfFreq, this.filterQ); 
          }
          if (param === 'FILTER_Q') { 
              this.filterQ = 0.1 + (value * 9.9); 
              this.hpfL.setParams(this.hpfFreq, this.filterQ); 
              this.hpfR.setParams(this.hpfFreq, this.filterQ); 
              this.lpfL.setParams(this.lpfFreq, this.filterQ); 
              this.lpfR.setParams(this.lpfFreq, this.filterQ); 
          }
          
          if (param === 'DUB') this.dubFeedback = value * 0.95;
          if (param === 'NOISE_LEVEL') this.noiseLevel = value;
          
          if (param === 'BLOOM_SIZE') this.bloom.setParams(value, this.bloom.shimmer, this.bloom.wet, this.bloom.dry);
          if (param === 'BLOOM_SHIMMER') this.bloom.setParams(this.bloom.size, value, this.bloom.wet, this.bloom.dry);
          if (param === 'BLOOM_WET') this.bloom.setParams(this.bloom.size, this.bloom.shimmer, value, this.bloom.dry);
          if (param === 'BLOOM_DRY') this.bloom.setParams(this.bloom.size, this.bloom.shimmer, this.bloom.wet, value);

          if (param === 'GHOST_ACTIVE') this.ghostActive = value > 0.5;
          if (param === 'GHOST_TARGET') this.ghostTarget = value > 0.5 ? 'B' : 'A'; 
          
          if (param === 'SLICER_ACTIVE') this.slicerActive = value > 0.5;
          if (param === 'SLICER_TARGET') this.slicerTarget = value > 0.5 ? 'B' : 'A'; 
          if (param === 'CHOPPER_ACTIVE') this.slicerActive = value > 0.5;
          
          if (param === 'SLICER_PATTERN') this.slicerPattern = value;
          if (param === 'SLICER_GATE') this.slicerGate = value; 
          if (param === 'SLICER_SPEED') this.slicerSpeed = value;
          if (param === 'SLICER_SMOOTH') this.slicerSmooth = value;
          if (param === 'SLICER_RANDOM') this.slicerRandom = value;

          if (param === 'MASTER_BPM') this.masterBpm = Math.max(60, Math.min(200, value));
          
          // SLAM PARAMS
          if (param === 'SPECTRAL_GATE_ACTIVE') this.spectralGateActive = value > 0.5;
          if (param === 'GATE_THRESH') { this.spectralGateL.setThreshold(value); this.spectralGateR.setThreshold(value); }
          if (param === 'GATE_RELEASE') { this.spectralGateL.setRelease(value); this.spectralGateR.setRelease(value); }
          if (param === 'SR') { this.decimatorL.setSampleRate(value); this.decimatorR.setSampleRate(value); }
          if (param === 'BITS') { this.decimatorL.setBitDepth(value); this.decimatorR.setBitDepth(value); }
          
          if (param === 'SLAM_CUTOFF') this.slamCutoff = value;
          if (param === 'SLAM_RES') this.slamRes = value;
          if (param === 'SLAM_DRIVE') this.slamDrive = value;
          if (param === 'SLAM_NOISE') this.slamNoise = value;
          
          if (param === 'GHOST_EQ') {
            this.ghostLpfCoeff = 0.1 + (value * 0.85);
          }
          if (param === 'GHOST_FADE') {
            this.ghostMix = value * 0.8; 
          }
          
          // TRIM / DRIVE
          if (param === 'TRIM_A') this.trimA = value;
          if (param === 'TRIM_B') this.trimB = value;
          if (param === 'DRIVE_A') this.driveA = value;
          if (param === 'DRIVE_B') this.driveB = value;
          
          if (param === 'EQ_A_HI') this.eqA.gainHigh = value;
          if (param === 'EQ_A_MID') this.eqA.gainMid = value;
          if (param === 'EQ_A_LOW') this.eqA.gainLow = value;
          if (param === 'EQ_B_HI') this.eqB.gainHigh = value;
          if (param === 'EQ_B_MID') this.eqB.gainMid = value;
          if (param === 'EQ_B_LOW') this.eqB.gainLow = value;
          if (param === 'KILL_A_HI') this.eqA.killHigh = value;
          if (param === 'KILL_A_MID') this.eqA.killMid = value;
          if (param === 'KILL_A_LOW') this.eqA.killLow = value;
          if (param === 'KILL_B_HI') this.eqB.killHigh = value;
          if (param === 'KILL_B_MID') this.eqB.killMid = value;
          if (param === 'KILL_B_MID') this.eqB.killMid = value;
          if (param === 'KILL_B_LOW') this.eqB.killLow = value;
          
          if (param === 'MASTER_ENHANCE') {
              this.enhanceAmount = value;
              this.updateEnhance();
          }
      }
      
      if (event.data.type === 'SKIP_TO_LATEST') {
          const { deck } = event.data;
          // Safe jump logic inside Audio Thread
          // frame-based pointers
          const writeOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
          const writePtr = Atomics.load(this.headerView!, writeOffset / 4);
          
          const safetyFrames = 44100 * 2.0; 
          const newPtr = Math.max(0, writePtr - safetyFrames);
          
          if (deck === 'A') {
              Atomics.store(this.headerView!, OFFSETS.READ_POINTER_A / 4, newPtr);
          } else {
              Atomics.store(this.headerView!, OFFSETS.READ_POINTER_B / 4, newPtr);
          }
      }
      
      if (event.data.type === 'SKIP_TO_POSITION') {
          const { deck, position } = event.data;
          const offset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
          Atomics.store(this.headerView!, offset / 4, Math.floor(position));
      }

      if (event.data.type === 'CLEAR_BUFFER') {
          if (!this.audioData || !this.headerView) return;
          
          const { deck } = event.data;
          const writeOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
          const readOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
          
          // Reset BOTH pointers to 0 for a clean slate
          // This fixes the issue where writePtr might be a huge value from file loading
          Atomics.store(this.headerView!, writeOffset / 4, 0);
          Atomics.store(this.headerView!, readOffset / 4, 0);
          
          const bufferSize = this.audioData.length;
          const halfSize = Math.floor(bufferSize / 2);
          const offsetStep = deck === 'A' ? 0 : halfSize;
          
          // Clear the entire deck buffer
          for (let i = 0; i < halfSize; i++) {
              this.audioData[offsetStep + i] = 0;
          }
      }
    };
  }

  private initBuffer() {
    if (!this.sab) return;
    this.headerView = new Int32Array(this.sab, 0, 32); 
    this.audioData = new Float32Array(this.sab, 128); // Offset 128 BYTES
    this.floatView = new Float32Array(this.sab, 0, 32);
    this.port.postMessage({ type: 'INIT_COMPLETE' }); 
  }

  private updateLimiter() {
      this.limiterL.setParams(Math.max(0.001, this.compThresh), this.compRatio, this.compMakeup, 100);
      this.limiterR.setParams(Math.max(0.001, this.compThresh), this.compRatio, this.compMakeup, 100);
  }

  private updateEnhance() {
      // 1. Subsonic Protection (Always ON to clean mud)
      this.subL.update(30, 0.707, 44100, 'HP');
      this.subR.update(30, 0.707, 44100, 'HP');
      
      // 2. Bass Thickness (LowShelf 100Hz) - Range: 0dB to +6dB
      const bassGain = this.enhanceAmount * 6.0;
      this.bassL.update(100, 0.707, 44100, 'LS', bassGain);
      this.bassR.update(100, 0.707, 44100, 'LS', bassGain);
      
      // 3. High End Clarity (HighShelf 10kHz) - Range: 0dB to +4dB
      const highGain = this.enhanceAmount * 4.0;
      this.highL.update(10000, 0.707, 44100, 'HS', highGain);
      this.highR.update(10000, 0.707, 44100, 'HS', highGain);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    try {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        
        // Stereo Output Support
        const leftChannel = output[0];
        const rightChannel = output[1]; // Can be undefined

        if (!this.audioData || !this.headerView) return true;

        const bufferSize = this.audioData.length;
        const halfSize = Math.floor(bufferSize / 2);
        
        // FRAME MATH: 1 Frame = 2 Floats (L, R)
        const maxFrames = Math.floor(halfSize / 2); // Frames per deck
        const offsetB = halfSize & ~1; // Ensure even alignment for stereo pairs

        const readPtrA = Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
        const readPtrB = Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
        
        const velA = this.tapeA.process();
        const velB = this.tapeB.process();

        let ptrA = readPtrA;
        let ptrB = readPtrB;

        for (let i = 0; i < leftChannel.length; i++) {
            // --- LOOP LOGIC A (Frames) ---
            if (this.loopActiveA && this.loopStartA !== this.loopEndA) {
                 if (ptrA >= this.loopEndA) {
                     if (this.loopCountA === -1 || this.loopRemainingA > 0) {
                         if (this.loopCountA > 0) this.loopRemainingA--;
                         ptrA = this.loopStartA;
                     } else {
                         this.loopActiveA = false;
                     }
                 }
            }
            
            // --- LOOP LOGIC B (Frames) ---
            if (this.loopActiveB && this.loopStartB !== this.loopEndB) {
                 if (ptrB >= this.loopEndB) {
                     if (this.loopCountB === -1 || this.loopRemainingB > 0) {
                         if (this.loopCountB > 0) this.loopRemainingB--;
                         ptrB = this.loopStartB;
                     } else {
                         this.loopActiveB = false;
                     }
                 }
            }
            
            // --- READ A (Stereo) ---
            const localFrameA = ((Math.floor(ptrA) % maxFrames) + maxFrames) % maxFrames;
            const idxA = localFrameA * 2;
            
            let sampleAL = this.audioData[idxA] || 0;
            let sampleAR = this.audioData[idxA + 1] || 0;
            
            // Crossfade Logic A
            if (this.loopActiveA && this.loopCrossfadeA > 0) {
                const distToEnd = this.loopEndA - ptrA;
                if (distToEnd > 0 && distToEnd < this.loopCrossfadeA) {
                    const fade = distToEnd / this.loopCrossfadeA;
                    const startPtr = this.loopStartA + (this.loopCrossfadeA - distToEnd);
                    
                    const localStartFrame = ((Math.floor(startPtr) % maxFrames) + maxFrames) % maxFrames;
                    const idxStart = localStartFrame * 2;
                    
                    const sStartL = this.audioData[idxStart] || 0;
                    const sStartR = this.audioData[idxStart + 1] || 0;
                    
                    sampleAL = sampleAL * fade + sStartL * (1.0 - fade);
                    sampleAR = sampleAR * fade + sStartR * (1.0 - fade);
                }
            }

            // --- READ B (Stereo) ---
            const localFrameB = ((Math.floor(ptrB) % maxFrames) + maxFrames) % maxFrames;
            const idxB = (localFrameB * 2 + offsetB) & ~1; // Force align
            
            let sampleBL = this.audioData[idxB];
            let sampleBR = this.audioData[idxB + 1];

            // NaN Safety Rail
            if (!Number.isFinite(sampleBL)) sampleBL = 0;
            if (!Number.isFinite(sampleBR)) sampleBR = 0;

            // Crossfade Logic B
            if (this.loopActiveB && this.loopCrossfadeB > 0) {
                const distToEnd = this.loopEndB - ptrB;
                if (distToEnd > 0 && distToEnd < this.loopCrossfadeB) {
                    const fade = distToEnd / this.loopCrossfadeB; 
                    const startPtr = this.loopStartB + (this.loopCrossfadeB - distToEnd);
                    
                    const localStartFrame = ((Math.floor(startPtr) % maxFrames) + maxFrames) % maxFrames;
                    const idxStart = (localStartFrame * 2) + offsetB; // Offset for B
                    
                    const sStartL = this.audioData[idxStart] || 0;
                    const sStartR = this.audioData[idxStart + 1] || 0;
                    
                    sampleBL = sampleBL * fade + sStartL * (1.0 - fade);
                    sampleBR = sampleBR * fade + sStartR * (1.0 - fade);
                }
            }

            // Smooth Mute
            this.muteCurrentA += (this.muteTargetA - this.muteCurrentA) * 0.01;
            this.muteCurrentB += (this.muteTargetB - this.muteCurrentB) * 0.01;

            // --- PROCESS DECK A ---
            sampleAL *= this.trimA;
            sampleAR *= this.trimA;
            if (this.driveA > 0) {
                const drv = 1.0 + this.driveA * 4.0;
                sampleAL = Math.tanh(sampleAL * drv);
                sampleAR = Math.tanh(sampleAR * drv);
            }
            sampleAL *= this.muteCurrentA;
            sampleAR *= this.muteCurrentA;
            
            // DC Blocker A (Stereo)
            const dcOutAL = sampleAL - this.dcPrevInAL + (0.995 * this.dcPrevOutAL);
            this.dcPrevInAL = sampleAL; this.dcPrevOutAL = dcOutAL; sampleAL = dcOutAL;
            
            const dcOutAR = sampleAR - this.dcPrevInAR + (0.995 * this.dcPrevOutAR);
            this.dcPrevInAR = sampleAR; this.dcPrevOutAR = dcOutAR; sampleAR = dcOutAR;

            // --- PROCESS DECK B ---
            sampleBL *= this.trimB;
            sampleBR *= this.trimB;
            if (this.driveB > 0) {
                const drv = 1.0 + this.driveB * 4.0;
                sampleBL = Math.tanh(sampleBL * drv);
                sampleBR = Math.tanh(sampleBR * drv);
            }
            sampleBL *= this.muteCurrentB;
            sampleBR *= this.muteCurrentB;
            
            // DC Blocker B (Stereo)
            const dcOutBL = sampleBL - this.dcPrevInBL + (0.995 * this.dcPrevOutBL);
            this.dcPrevInBL = sampleBL; this.dcPrevOutBL = dcOutBL; sampleBL = dcOutBL;
            
            const dcOutBR = sampleBR - this.dcPrevInBR + (0.995 * this.dcPrevOutBR);
            this.dcPrevInBR = sampleBR; this.dcPrevOutBR = dcOutBR; sampleBR = dcOutBR;

            // Update SLAM Filters once per block
            if (i === 0) {
                 this.filterL.update(this.slamCutoff, this.slamRes, 44100, 'LP');
                 this.filterR.update(this.slamCutoff, this.slamRes, 44100, 'LP');
            }

            // 1. GHOST (Shadows) - Stereo
            if (this.ghostActive) {
                const targetPtr = (this.ghostTarget === 'A') ? ptrA : ptrB;
                const offset = 44100 * 2; // 2 seconds delay
                let gP = targetPtr - offset;
                this.ghostPtr = gP;
                
                const localFrameG = ((Math.floor(gP) % maxFrames) + maxFrames) % maxFrames;
                const baseIdxG = ((localFrameG * 2) + ((this.ghostTarget === 'B') ? offsetB : 0)) & ~1;
                
                let rawGhostL = this.audioData[baseIdxG];
                let rawGhostR = this.audioData[baseIdxG + 1];
                
                if (!Number.isFinite(rawGhostL)) rawGhostL = 0;
                if (!Number.isFinite(rawGhostR)) rawGhostR = 0;
                
                // Apply Ghost EQ (L/R)
                this.ghostLpfStateL += this.ghostLpfCoeff * (rawGhostL - this.ghostLpfStateL);
                this.ghostLpfStateR += this.ghostLpfCoeff * (rawGhostR - this.ghostLpfStateR);
                
                const ghostSampleL = this.ghostLpfStateL * this.ghostMix;
                const ghostSampleR = this.ghostLpfStateR * this.ghostMix;

                if (this.ghostTarget === 'A') {
                    sampleAL += ghostSampleL; sampleAR += ghostSampleR;
                } else {
                    sampleBL += ghostSampleL; sampleBR += ghostSampleR;
                }
            }

            // 2. SMOOTH SLICER (Applied to both channels equally)
            if (this.slicerActive) {
                const bpm = Math.max(60, this.masterBpm); 
                const speedFactor = Math.pow(2, (this.slicerSpeed - 0.5) * 4); 
                const samplesPerStep = (44100 * 60) / (bpm * 4 * speedFactor);
                
                const globalStep = Math.floor((currentFrame + i) / samplesPerStep);
                
                if (globalStep !== this.slicerStepIndex) {
                    this.slicerStepIndex = globalStep;
                    if (this.slicerRandom > 0.0) {
                        const jitter = (Math.random() - 0.5) * this.slicerRandom; 
                        this.slicerStepGate = Math.max(0.05, Math.min(0.95, this.slicerGate + jitter));
                    } else {
                        this.slicerStepGate = this.slicerGate;
                    }
                }

                const phase = ((currentFrame + i) % samplesPerStep) / samplesPerStep;
                const gateOpen = phase < this.slicerStepGate;
                const targetGain = gateOpen ? 1.0 : 0.0;
                const smoothFactor = 1.0 - Math.pow(this.slicerSmooth, 0.25) * 0.999;
                
                this.slicerCurrentGain += (targetGain - this.slicerCurrentGain) * smoothFactor;
                
                if (this.slicerTarget === 'A') {
                    sampleAL *= this.slicerCurrentGain;
                    sampleAR *= this.slicerCurrentGain;
                } else {
                    sampleBL *= this.slicerCurrentGain;
                    sampleBR *= this.slicerCurrentGain;
                }
            } else {
                this.slicerCurrentGain = 1.0; 
            }

            // EQ (IsolatorEQ is Stereo)
            this.eqA.process(sampleAL, sampleAR);
            const eqAL_Out = this.eqA.outL;
            const eqAR_Out = this.eqA.outR;

            this.eqB.process(sampleBL, sampleBR);
            const eqBL_Out = this.eqB.outL;
            const eqBR_Out = this.eqB.outR;

            // Mixer
            const volA = Math.min(1.0, (1.0 - this.crossfader) * 2.0); 
            const volB = Math.min(1.0, this.crossfader * 2.0);         
            
            let mixL = (eqAL_Out * volA) + (eqBL_Out * volB);
            let mixR = (eqAR_Out * volA) + (eqBR_Out * volB);
            
            mixL = Math.tanh(mixL);
            mixR = Math.tanh(mixR);
            
            let sampleL = mixL;
            let sampleR = mixR;

            // 3. FILTER_XY (Dual Mono)
            if (this.filterActive) {
                const gainComp = 1.0 + (this.filterQ * 0.5);
                const driveInputL = sampleL * gainComp * (1.0 + this.filterDrive * 3.0);
                const driveInputR = sampleR * gainComp * (1.0 + this.filterDrive * 3.0);
                
                sampleL = Math.tanh(driveInputL);
                sampleR = Math.tanh(driveInputR);

                sampleL = this.hpfL.process(sampleL, 'HP');
                sampleR = this.hpfR.process(sampleR, 'HP');
                sampleL = this.lpfL.process(sampleL, 'LP');
                sampleR = this.lpfR.process(sampleR, 'LP');
            }

            // 4. DECIMATOR (Dual Mono)
            if (this.decimatorActive) {
                sampleL = this.decimatorL.process(sampleL);
                sampleR = this.decimatorR.process(sampleR);
            }
            
            // 5. CLOUD GRAIN (Mono Sum -> Cloud -> Mix Back)
            if (this.cloudActive) {
                // Update params once per block, not per sample
                if (i === 0) {
                    this.cloud.setParams(this.cloudDensity, this.cloudSize, this.cloudSpray, this.cloudPitch, this.cloudMix);
                }
                const monoIn = (sampleL + sampleR) * 0.5;
                const out = this.cloud.process(monoIn); 
                sampleL = out; 
                sampleR = out;
            }
            
            // 6. SPECTRAL GATE (Dual Mono)
            if (this.spectralGateActive) {
                sampleL = this.spectralGateL.process(sampleL);
                sampleR = this.spectralGateR.process(sampleR);
            }
            
            // 7. DYNAMICS (Dual Mono Limiter)
            if (this.compActive) {
                sampleL = this.limiterL.process(sampleL);
                sampleR = this.limiterR.process(sampleR);
            }

            // 8. TAPE ECHO (Mono Send -> Mono Return -> Center)
            // Update params once per block for performance
            if (i === 0) {
                const bpm = 120; 
                const delayTime = (60 / bpm) * 0.75; 
                this.delay.setParams(delayTime, this.dubFeedback, 0.002);
            }
            
            const tapeSendAmount = this.tapeSendSmooth.process();
            const monoSum = (sampleL + sampleR) * 0.5;
            const tapeSend = monoSum * tapeSendAmount;
            
            const tapeOut = this.delay.process(tapeSend);
            sampleL += tapeOut * (this.dubFeedback * 0.5);
            sampleR += tapeOut * (this.dubFeedback * 0.5);
            
            // 9. BLOOM REVERB (Mono Send -> Mono Return -> Center)
            const reverbSendAmount = this.reverbSendSmooth.process();
            const bloomIn = monoSum * reverbSendAmount;
            const bloomOut = this.bloom.process(bloomIn);
            sampleL = (sampleL * (1.0 - reverbSendAmount)) + bloomOut;
            sampleR = (sampleR * (1.0 - reverbSendAmount)) + bloomOut;

            // 10. SLAM (Master Energy Riser - Injection)
            // Signal Flow: PinkNoise -> Drive -> Filter -> Mix
            // Only process if parameters indicate activity to save CPU and reduce noise risk
            if (this.slamNoise > 0.001 || this.filterL.isResonant()) {
                 const pNoise = this.pinkNoise.process() * this.slamNoise;
                 
                 // Apply to both channels (Stereo Injection)
                 let slamL = sampleL + pNoise;
                 let slamR = sampleR + pNoise; // Correlated noise for riser (center focus)
                 
                 if (this.slamDrive > 1.0) {
                     const d = this.slamDrive;
                     slamL = Math.tanh(slamL * d);
                     slamR = Math.tanh(slamR * d);
                 }
                 
                 // Filter (Already updated per block)
                 // NOTE: FilterLinkage update at block start is crucial
                 slamL = this.filterL.process(slamL);
                 slamR = this.filterR.process(slamR); // Ensure filterR state is current
                 
                 sampleL = slamL;
                 sampleR = slamR;
            } else {
                // Ensure Filter state is advanced even if effect "off" to prevent click on toggle?
                // Or just reset?
                // For performance, we skip. But if filter is high-pass, engaging it might click.
                // Assuming "SLAM" is a momentary effect, it's fine.
            }
            
            // 11. SONIC ENHANCER (Master Polish)
            if (this.enhanceActive) {
                // Sub Filter
                sampleL = this.subL.process(sampleL);
                sampleR = this.subR.process(sampleR);
                // Bass
                sampleL = this.bassL.process(sampleL);
                sampleR = this.bassR.process(sampleR);
                // Highs
                sampleL = this.highL.process(sampleL);
                sampleR = this.highR.process(sampleR);
            }

            // Final Safety Clip
            sampleL = Math.max(-1.0, Math.min(1.0, sampleL));
            sampleR = Math.max(-1.0, Math.min(1.0, sampleR));

            // Update Read Pointers (accumulate within loop)
            ptrA += velA; 
            ptrB += velB;

            // Output to AudioContext
            leftChannel[i] = sampleL;
            if (rightChannel) rightChannel[i] = sampleR; // Normal stereo output
            
             // Viz Outputs. Use eqAL_Out etc.
            if (outputs[1] && outputs[1].length >= 2) {
                outputs[1][0][i] = eqAL_Out;
                outputs[1][1][i] = eqAR_Out;
            }
            if (outputs[2] && outputs[2].length >= 2) {
                outputs[2][0][i] = eqBL_Out;
                outputs[2][1][i] = eqBR_Out;
            }
        }

        // === BLOCK-LEVEL UPDATES (Outside sample loop for performance) ===
        // Write pointers to shared memory once per block instead of per sample
        Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, ptrA);
        Atomics.store(this.headerView, OFFSETS.READ_POINTER_B / 4, ptrB);
        
        if (this.ghostActive) {
             Atomics.store(this.headerView, OFFSETS.GHOST_POINTER / 4, Math.floor(this.ghostPtr));
        } else {
             Atomics.store(this.headerView, OFFSETS.GHOST_POINTER / 4, -1);
        }
        
        Atomics.store(this.headerView, OFFSETS.SLICER_ACTIVE / 4, (this.slicerActive) ? 1 : 0);
        
        if (this.floatView) this.floatView[OFFSETS.TAPE_VELOCITY / 4] = (velA + velB) / 2;

        return true;
    } catch (e) {
        console.error('Processor Crash:', e);
        return false; 
    }
  }
}

registerProcessor('ghost-processor', GhostProcessor);
