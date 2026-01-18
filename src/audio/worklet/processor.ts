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

// ... SvfFilter Code ... (Keep SvfFilter class as is, it's fine)
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
  private decimator: Decimator = new Decimator(44100);
  private noiseLevel: number = 0.0;
  
  private delay: TapeDelay = new TapeDelay(44100, 2.0);
  private dubFeedback: number = 0.0;
  
  private spectralGate: SpectralGate = new SpectralGate(44100);
  private bloom: BloomReverb = new BloomReverb(44100);
  private limiter: Limiter = new Limiter(44100);
  private hpf: SvfFilter = new SvfFilter(44100);
  private lpf: SvfFilter = new SvfFilter(44100);

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
  
  // Transport State
  private baseSpeedA: number = 1.0;
  private baseSpeedB: number = 1.0;

  // GHOST & SLICER STATE
  private ghostActive: boolean = false;
  private ghostTarget: 'A' | 'B' = 'A'; // Which deck to shadow
  private ghostOffset: number = 44100; // 1 second behind default
  private ghostPtr: number = 0;
  private ghostMix: number = 0.6; // Ghost volume (controlled by GHOST_FADE)
  private ghostLpfCoeff: number = 0.5; // Ghost EQ LPF coefficient
  private ghostLpfState: number = 0; // Ghost EQ LPF state
  
  private slicerActive: boolean = false;
  private slicerTarget: 'A' | 'B' = 'B';
  
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
  private dcPrevInA: number = 0;
  private dcPrevOutA: number = 0;
  private dcPrevInB: number = 0;
  private dcPrevOutB: number = 0;
  
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
    this.hpf.setParams(this.hpfFreq, this.filterQ); 
    this.lpf.setParams(this.lpfFreq, this.filterQ); 
    this.updateLimiter();
    
    this.cloud = new CloudGrain(44100); // TODO: pass actual sampleRate if available? 
    // AudioWorkletGlobalScope.sampleRate is available but I'll assume 44100 or fix later.
    // Actually `sampleRate` global is available in Worklet.
    
    this.tapeSendSmooth = new SmoothValue(0, 0.9995);
    this.reverbSendSmooth = new SmoothValue(0, 0.9995);

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_SAB') {
        this.sab = event.data.payload;
        this.initBuffer();
      }
      
      if (event.data.type === 'CONFIG_LOOP') {
          const { deck, start, end, crossfade, count, active } = event.data;
          // console.log(`[Processor] CONFIG_LOOP Deck ${deck} Active:${active} Start:${start} End:${end}`);
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
              if (deck === 'A') this.tapeA.setTargetSpeed(value > 0.5 ? 0 : this.baseSpeedA);
              if (deck === 'B') this.tapeB.setTargetSpeed(value > 0.5 ? 0 : this.baseSpeedB);
          }
          if (param === 'SPEED') {
               if (deck === 'B') {
                   this.baseSpeedB = value;
                   this.tapeB.setTargetSpeed(value);
               } else {
                   this.baseSpeedA = value;
                   this.tapeA.setTargetSpeed(value);
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
          if (param === 'CLOUD_PITCH') this.cloudPitch = value; // 0.5 .. 2.0 mapped in UI?
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

          if (param === 'HPF') { this.hpfFreq = 20 * Math.pow(1000, value); this.hpf.setParams(this.hpfFreq, this.filterQ); }
          if (param === 'LPF') { this.lpfFreq = 20 * Math.pow(1000, value); this.lpf.setParams(this.lpfFreq, this.filterQ); }
          if (param === 'FILTER_Q') { this.filterQ = 0.1 + (value * 9.9); this.hpf.setParams(this.hpfFreq, this.filterQ); this.lpf.setParams(this.lpfFreq, this.filterQ); }
          
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
          
          // SLAM DESTRUCTION PARAMETERS
          if (param === 'SPECTRAL_GATE_ACTIVE') this.spectralGateActive = value > 0.5;
          if (param === 'GATE_THRESH') this.spectralGate.setThreshold(value);
          if (param === 'GATE_RELEASE') this.spectralGate.setRelease(value);
          if (param === 'SR') this.decimator.setSampleRate(value);
          if (param === 'BITS') this.decimator.setBitDepth(value);
          
          // GHOST PARAMETERS
          if (param === 'GHOST_EQ') {
            // Map 0..1 to dark..bright (LPF coeff: 0.1=dark, 0.95=bright)
            this.ghostLpfCoeff = 0.1 + (value * 0.85);
          }
          if (param === 'GHOST_FADE') {
            // Map 0..1 to ghost volume
            this.ghostMix = value * 0.8; // Max 80% mix
          }
          
          // TRIM / DRIVE
          if (param === 'TRIM_A') this.trimA = value;
          if (param === 'TRIM_B') this.trimB = value;
          if (param === 'DRIVE_A') this.driveA = value;
          if (param === 'DRIVE_B') this.driveB = value;
          
          // EQ (HI/MID/LOW for A and B)
          if (param === 'EQ_A_HI') this.eqAHi = value;
          if (param === 'EQ_A_MID') this.eqAMid = value;
          if (param === 'EQ_A_LOW') this.eqALow = value;
          if (param === 'EQ_B_HI') this.eqBHi = value;
          if (param === 'EQ_B_MID') this.eqBMid = value;
          if (param === 'EQ_B_LOW') this.eqBLow = value;
          
          // KILL (Mute) - Set on IsolatorEQ instances directly
          if (param === 'KILL_A_HI') this.eqA.killHigh = value;
          if (param === 'KILL_A_MID') this.eqA.killMid = value;
          if (param === 'KILL_A_LOW') this.eqA.killLow = value;
          if (param === 'KILL_B_HI') this.eqB.killHigh = value;
          if (param === 'KILL_B_MID') this.eqB.killMid = value;
          if (param === 'KILL_B_LOW') this.eqB.killLow = value;
          
          // EQ Gain - Set on IsolatorEQ instances directly  
          if (param === 'EQ_A_HI') this.eqA.gainHigh = value;
          if (param === 'EQ_A_MID') this.eqA.gainMid = value;
          if (param === 'EQ_A_LOW') this.eqA.gainLow = value;
          if (param === 'EQ_B_HI') this.eqB.gainHigh = value;
          if (param === 'EQ_B_MID') this.eqB.gainMid = value;
          if (param === 'EQ_B_LOW') this.eqB.gainLow = value;
      }
      
      if (event.data.type === 'SKIP_TO_LATEST') {
          const { deck } = event.data;
          // Safe jump logic inside Audio Thread
          const writeOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
          const writePtr = Atomics.load(this.headerView!, writeOffset / 4);
          
          const safetySamples = 44100 * 2.0; 
          const newPtr = Math.max(0, writePtr - safetySamples);
          
          if (deck === 'A') {
              // Reset loop state on manual skip? Probably safe to keep active but update pointers.
              Atomics.store(this.headerView!, OFFSETS.READ_POINTER_A / 4, newPtr);
          } else {
              Atomics.store(this.headerView!, OFFSETS.READ_POINTER_B / 4, newPtr);
          }
      }
      
      // Jump to specific position (for new track start)
      if (event.data.type === 'SKIP_TO_POSITION') {
          const { deck, position } = event.data;
          const offset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
          Atomics.store(this.headerView!, offset / 4, Math.floor(position));
      }

      if (event.data.type === 'CLEAR_BUFFER') {
          if (!this.audioData) return;
          
          const { deck } = event.data;
          const writeOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
          const writePtr = Atomics.load(this.headerView!, writeOffset / 4);
          
          const totalSize = this.audioData.length;
          const halfSize = Math.floor(totalSize / 2);
          const offsetStep = deck === 'A' ? 0 : halfSize;
          
          const silenceLen = 44100 * 4;
          
          for(let i=1; i<silenceLen; i++) {
              let relativeIdx = writePtr - i;
              while (relativeIdx < 0) relativeIdx += halfSize;
              relativeIdx = relativeIdx % halfSize;
              
              const absoluteIdx = relativeIdx + offsetStep;
              this.audioData[absoluteIdx] = 0;
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
      this.limiter.setParams(Math.max(0.001, this.compThresh), this.compRatio, this.compMakeup, 100);
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    try {
        const output = outputs[0];
        if (!output || output.length === 0) return true;
        const leftChannel = output[0];
        const rightChannel = output[1] || leftChannel;
        
        if (!this.audioData || !this.headerView) return true;

        const bufferSize = this.audioData.length;
        const halfSize = Math.floor(bufferSize / 2);
        const offsetB = halfSize;

        const readPtrA = Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
        const readPtrB = Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
        
        const velA = this.tapeA.process();
        const velB = this.tapeB.process();

        let ptrA = readPtrA;
        let ptrB = readPtrB;

        for (let i = 0; i < leftChannel.length; i++) {
            // --- LOOP LOGIC A ---
            if (this.loopActiveA && this.loopStartA !== this.loopEndA) {
                 if (ptrA >= this.loopEndA) {
                     if (this.loopCountA === -1 || this.loopRemainingA > 0) {
                         if (this.loopCountA > 0) this.loopRemainingA--;
                         ptrA = this.loopStartA;
                         // console.log(`[Processor] Loop A Jump -> ${ptrA}`);
                     } else {
                         // Loop finished, disable
                         this.loopActiveA = false;
                     }
                 }
            }
            
            // --- LOOP LOGIC B ---
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
            
            // --- A ---
            const idxA = ((Math.floor(ptrA) % halfSize) + halfSize) % halfSize;
            let sampleA = this.audioData[idxA] || 0;
            
            // Crossfade Logic A (Reads ahead if near end)
            if (this.loopActiveA && this.loopCrossfadeA > 0) {
                const distToEnd = this.loopEndA - ptrA;
                if (distToEnd > 0 && distToEnd < this.loopCrossfadeA) {
                    const fade = distToEnd / this.loopCrossfadeA; // 0..1 (0 at end)
                    // Mix with Start
                    const startPtr = this.loopStartA + (this.loopCrossfadeA - distToEnd);
                    const idxStart = ((Math.floor(startPtr) % halfSize) + halfSize) % halfSize;
                    const sampleStart = this.audioData[idxStart] || 0;
                    
                    // Equal Power Crossfade? Or Linear for now.
                    // Fade OUT current, Fade IN start.
                    // sampleA = (sampleA * fade) + (sampleStart * (1.0 - fade));
                    
                    // Improved Crossfade (fading out the end, fading in the start)
                    sampleA = sampleA * fade + sampleStart * (1.0 - fade);
                }
            }

            // --- B ---
            const idxB = ((Math.floor(ptrB) % halfSize) + halfSize) % halfSize; 
            const dbIdx = idxB + offsetB;
            let sampleB = this.audioData[dbIdx] || 0;

            // Crossfade Logic B
            if (this.loopActiveB && this.loopCrossfadeB > 0) {
                const distToEnd = this.loopEndB - ptrB;
                if (distToEnd > 0 && distToEnd < this.loopCrossfadeB) {
                    const fade = distToEnd / this.loopCrossfadeB; 
                    const startPtr = this.loopStartB + (this.loopCrossfadeB - distToEnd);
                    const idxStart = ((Math.floor(startPtr) % halfSize) + halfSize) % halfSize;
                    const dbIdxStart = idxStart + offsetB;
                    const sampleStart = this.audioData[dbIdxStart] || 0;
                    sampleB = sampleB * fade + sampleStart * (1.0 - fade);
                }
            }

            // Smooth Mute Ramp (Apply fade to avoid pops)
            this.muteCurrentA += (this.muteTargetA - this.muteCurrentA) * 0.01; // ~100-200 samples fade
            this.muteCurrentB += (this.muteTargetB - this.muteCurrentB) * 0.01;

            sampleA = sampleA * this.trimA;
            if (this.driveA > 0) sampleA = Math.tanh(sampleA * (1.0 + this.driveA * 4.0));
            sampleA *= this.muteCurrentA;
            
            // DC Blocker A (Removes Low Freq / Static Offset when stopped)
            const dcOutA = sampleA - this.dcPrevInA + (0.995 * this.dcPrevOutA);
            this.dcPrevInA = sampleA; // Store INPUT
            this.dcPrevOutA = dcOutA; // Store OUTPUT
            sampleA = dcOutA;

            sampleB = sampleB * this.trimB;
            if (this.driveB > 0) sampleB = Math.tanh(sampleB * (1.0 + this.driveB * 4.0));
            sampleB *= this.muteCurrentB;
            
            // DC Blocker B
            const dcOutB = sampleB - this.dcPrevInB + (0.995 * this.dcPrevOutB);
            this.dcPrevInB = sampleB;
            this.dcPrevOutB = dcOutB;
            sampleB = dcOutB;

            // --- FX INSERTPOINT (Pre-Mixer) ---

            // 1. GHOST (Shadows)
            if (this.ghostActive) {
                const targetPtr = (this.ghostTarget === 'A') ? ptrA : ptrB;
                const offset = 44100 * 2; 
                let gP = targetPtr - offset;
                this.ghostPtr = gP;
                const bufferIdx = ((Math.floor(gP) % halfSize) + halfSize) % halfSize;
                const finalIdx = bufferIdx + ((this.ghostTarget === 'B') ? offsetB : 0);
                const rawGhost = this.audioData[finalIdx] || 0;
                
                // Apply Ghost EQ
                this.ghostLpfState += this.ghostLpfCoeff * (rawGhost - this.ghostLpfState);
                const filteredGhost = this.ghostLpfState;
                const ghostSample = filteredGhost * this.ghostMix;

                // Add to Target Deck
                if (this.ghostTarget === 'A') sampleA += ghostSample;
                else sampleB += ghostSample;
            }

            // 2. SMOOTH SLICER
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
                
                // Apply to Target Deck
                if (this.slicerTarget === 'A') sampleA *= this.slicerCurrentGain;
                else sampleB *= this.slicerCurrentGain;
            } else {
                this.slicerCurrentGain = 1.0; 
            }

            const [eqAL, eqAR] = this.eqA.process(sampleA, sampleA); 
            const [eqBL, eqBR] = this.eqB.process(sampleB, sampleB);

            // Mixer
            const volA = Math.min(1.0, (1.0 - this.crossfader) * 2.0); 
            const volB = Math.min(1.0, this.crossfader * 2.0);         
            
            let mixL = (eqAL * volA) + (eqBL * volB);
            let mixR = (eqAR * volA) + (eqBR * volB);
            
            mixL = Math.tanh(mixL);
            mixR = Math.tanh(mixR);
            



            
            // sample is already defined above as 'let sample = mixL;' defined at line ~570
            // Wait, previous tool removed the definition of 'sample = mixL', leaving only the *usage*.
            // But 'mixL' is used above.
            // Check context:
            // "let sample = mixL;" was at line 570.
            // Step 104 removed the *second* definition.
            // But now I am replacing the block *before* line 570 (Slicer block)?
            // Lines 555-568.
            // Line 570 is AFTER Slicer.
            // So 'sample' initialized at 570 is correct.
            // But wait, my previous Replace (Step 99) removed `let sample = mixL;` at line 579 (which was inside the block).
            // Line 570 still contains `let sample = mixL;` ?
            // I need to be careful not to delete line 570 if I am replacing 555-568.
            // I will replace up to line 569.
            
            let sample = mixL; 
            
            // 1. GHOST (Already mixed above)
            
            // 2. SLICER (Already applied above via mixL/R gain, effective here)
            // (Code at lines 555-568 handles this by modifying mixL/R directly)

            // sample is already defined above as 'let sample = mixL;' defined at line ~570

            // 3. FILTER_XY
            if (this.filterActive) {
                // Analog Drive (Saturation) & Resonance Compensation
                const gainComp = 1.0 + (this.filterQ * 0.5); // Boost volume with Q
                const driveInput = sample * gainComp * (1.0 + this.filterDrive * 3.0);
                
                // Hard Tanh Saturation (Analog Clip)
                sample = Math.tanh(driveInput);

                sample = this.hpf.process(sample, 'HP');
                sample = this.lpf.process(sample, 'LP');
            }

            // 4. DECIMATOR (Texture)
            if (this.decimatorActive) sample = this.decimator.process(sample);
            
            // 7. (Moved) CLOUD GRAIN (Texture)
            if (this.cloudActive) {
                this.cloud.setParams(this.cloudDensity, this.cloudSize, this.cloudSpray, this.cloudPitch, this.cloudMix);
                sample = this.cloud.process(sample);
            }
            
            // 5. SPECTRAL GATE (Texture/Reduction)
            if (this.spectralGateActive) sample = this.spectralGate.process(sample);
            
            // 6. DYNAMICS (Compression/Limiter - MOD06)
            if (this.compActive) sample = this.limiter.process(sample);

            // 7. TAPE ECHO (Spatial 1 - Send/Return)
            // Always process to allow tails (Post-Fader / Dub Style)
            const bpm = 120; // TODO: Use masterBpm
            const delayTime = (60 / bpm) * 0.75; 
            this.delay.setParams(delayTime, this.dubFeedback, 0.002); 
            
            // Smoothed Send
            const tapeSendAmount = this.tapeSendSmooth.process();
            const tapeSend = sample * tapeSendAmount;
            
            const tapeOut = this.delay.process(tapeSend);
            sample += tapeOut * (this.dubFeedback * 0.5); // Wet Add
            
            // 8. BLOOM REVERB (Spatial 2 - Send/Return)
            // Smoothed Send
            const bloomSendAmount = this.reverbSendSmooth.process();
            
            // Bloom Hybrid Mode:
            // If we want "Insert" behavior when fully active (Wet+Dry), and "Send" behavior when fading out?
            // "bloom.process" returns (Input*Dry + Tank*Wet).
            // If Input decreases, Dry output decreases.
            // If we want to simulate "Switch Off Send", we reduce Input.
            // Bloom output will naturally reduce Dry part and keep Tails.
            // This works perfectly for "Post-Fader"!
            // Because Bloom implementation calculates Dry from Input.
            // If Input is 0, Dry is 0, only Wet (Tails) remains.
            // So we just feed `sample * amount`.
            // But wait...
            // If `bloomSendAmount` is 0, input to Bloom is 0.
            // Output of Bloom is Tails.
            // Sample is `sample`.
            // If we do `sample = bloom.process(...)`, then `sample` becomes Tails.
            // Original `sample` (Dry) is lost!
            // We want `sample` to remain `sample` (MixL).
            // And add Tails.
            // 8. BLOOM REVERB (Spatial 2 - Send/Return)
            // Smoothed Send
            const reverbSendAmount = this.reverbSendSmooth.process();
            
            // --- NOISE INJECTION (For Slam) ---
            if (this.noiseLevel > 0.0) {
                 const noise = (Math.random() * 2.0 - 1.0) * this.noiseLevel;
                 sample += noise;
            }
            
            // Logic: `sample = (sample * (1.0 - reverbSendAmount)) + this.bloom.process(sample * reverbSendAmount);`
            
            const bloomIn = sample * reverbSendAmount;
            const bloomOut = this.bloom.process(bloomIn);
            sample = (sample * (1.0 - reverbSendAmount)) + bloomOut;
            
            // Standard Send/Return mix topology:
            // Master = Dry + AuxReturn.
            // AuxSend = Dry * SendLevel.
            // AuxReturn = Reverb(AuxSend) [100% Wet].
            
            // Our Bloom class is an Insert Effect (Dry/Wet knob).
            // To use it as Send/Return, we should set Bloom's internal Dry to 0?
            // But we don't control that here (params are set elsewhere).
            
            // If we use it as Insert `sample = bloom.process(sample)`, we can't have "Post Fader Tails" easily
            // because if we "Bypass" it (`sample = sample`), we lose tails.
            // If we "Input 0" (`sample = bloom(0)`), we generate tails, but lose Dry.
            
            // SOLUTION:
            // Additive Mixing.
            // We need to SUBTRACT the Dry part computed by Bloom if we want to keep original Sample?
            // Or just rely on Bloom being 100% Wet?
            // User can set Dry/Wet in UI.
            // If user sets Dry=100, Wet=50.
            // If we use `sample = bloom(sample)`, we get Dry+Wet.
            // If we switch OFF (Send=0):
            // We want `sample + Tails`.
            // `bloom(0)` gives Tails (Wet only, since Input=0 -> Dry=0).
            // So `sample += bloom(0)` gives Dry + Tails. Perfect!
            // BUT:
            // If we switch ON (Send=1):
            // `sample += bloom(sample)`.
            // `bloom(sample)` = Dry + Wet.
            // Result = Sample + (Sample + Wet) = 2xDry + Wet.
            // Volume doubling!
            
            // We need to CROSSFADE logic?
            // If On: `sample = bloom(sample)`. (Insert)
            // If Off: `sample = sample + bloom(0)`. (Additive Tails)
            // While fader moves 1->0:
            // `amount` goes 1->0.
            // `bloomIn = sample * amount`.
            // `bloomOut = bloom.process(bloomIn)`. -> `(sample*amount)*Dry + Tank*Wet`.
            // `sample = (sample * (1-amount)) + bloomOut` ?
            // Let's trace:
            // amount=1: `0 + (Sample*Dry + Wet)`. Correct Insert.
            // amount=0: `Sample + (0 + Wet)`. Correct Additive Tails.
            // amount=0.5: `0.5*Sample + (0.5*Sample*Dry + Wet)`.
            // = `Sample*(0.5 + 0.5*Dry) + Wet`.
            // If Dry=1.0. `Sample*(1.0) + Wet`. Constant Dry level.
            // This assumes `bloom.process` is linear for Dry generation.
            


            // 9. FINAL PROTECTION (Hard Clip)
            sample = Math.max(-1.0, Math.min(1.0, sample)); 

            leftChannel[i] = sample;
            rightChannel[i] = sample; 
            
            // Viz Outputs
            if (outputs[1] && outputs[1].length >= 2) {
                outputs[1][0][i] = eqAL;
                outputs[1][1][i] = eqAR;
            }
            if (outputs[2] && outputs[2].length >= 2) {
                outputs[2][0][i] = eqBL;
                outputs[2][1][i] = eqBR;
            }
            
            ptrA += velA;
            ptrB += velB;
        }

        Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, Math.floor(ptrA));
        Atomics.store(this.headerView, OFFSETS.READ_POINTER_B / 4, Math.floor(ptrB));
        
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
