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
  // private slicerStep: number = 0; // Unused
  // private slicerGate: number = 1.0; // Unused 
  
  // Master BPM for SLICER sync
  private masterBpm: number = 120; 

  // TRIM / DRIVE
  private trimA: number = 1.0;
  private trimB: number = 1.0;
  private driveA: number = 0.0;
  private driveB: number = 0.0;
  
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

  constructor() {
    super();
    this.hpf.setParams(this.hpfFreq, this.filterQ); 
    this.lpf.setParams(this.lpfFreq, this.filterQ); 
    this.limiter.setParams(1.0, 20.0, 1.0, 100);

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_SAB') {
        this.sab = event.data.payload;
        this.initBuffer();
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

          if (param === 'FILTER_ACTIVE') this.filterActive = value > 0.5;
          if (param === 'DECIMATOR_ACTIVE') this.decimatorActive = value > 0.5;
          if (param === 'TAPE_ACTIVE') this.tapeActive = value > 0.5;
          if (param === 'REVERB_ACTIVE') this.reverbActive = value > 0.5;
          if (param === 'COMP_ACTIVE') this.compActive = value > 0.5;

          if (param === 'HPF') { this.hpfFreq = 20 * Math.pow(1000, value); this.hpf.setParams(this.hpfFreq, this.filterQ); }
          if (param === 'LPF') { this.lpfFreq = 20 * Math.pow(1000, value); this.lpf.setParams(this.lpfFreq, this.filterQ); }
          if (param === 'FILTER_Q') { this.filterQ = 0.1 + (value * 9.9); this.hpf.setParams(this.hpfFreq, this.filterQ); this.lpf.setParams(this.lpfFreq, this.filterQ); }
          
          if (param === 'DUB') this.dubFeedback = value * 0.95;
          if (param === 'NOISE_LEVEL') this.noiseLevel = value;
          
          if (param === 'BLOOM_SIZE') this.bloom.setParams(value, this.bloom.shimmer, this.bloom.mix);
          if (param === 'BLOOM_SHIMMER') this.bloom.setParams(this.bloom.size, value, this.bloom.mix);
          if (param === 'BLOOM_MIX') this.bloom.setParams(this.bloom.size, this.bloom.shimmer, value);

          if (param === 'GHOST_ACTIVE') this.ghostActive = value > 0.5;
          if (param === 'GHOST_TARGET') this.ghostTarget = value > 0.5 ? 'B' : 'A'; 
          
          if (param === 'SLICER_ACTIVE') this.slicerActive = value > 0.5;
          if (param === 'SLICER_TARGET') this.slicerTarget = value > 0.5 ? 'B' : 'A'; 
          if (param === 'CHOPPER_ACTIVE') this.slicerActive = value > 0.5;
          if (param === 'MASTER_BPM') this.masterBpm = Math.max(60, Math.min(200, value));
          
          // SLAM DESTRUCTION PARAMETERS
          if (param === 'GATE_THRESH') this.spectralGate.setThreshold(value);
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
    };
  }

  private initBuffer() {
    if (!this.sab) return;
    this.headerView = new Int32Array(this.sab, 0, 32); 
    this.audioData = new Float32Array(this.sab, 128); // Offset 128 BYTES
    this.floatView = new Float32Array(this.sab, 0, 32);
    this.port.postMessage({ type: 'INIT_COMPLETE' }); 
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
            // A
            const idxA = ((Math.floor(ptrA) % halfSize) + halfSize) % halfSize;
            let sampleA = this.audioData[idxA] || 0;
            
            // B
            const idxB = ((Math.floor(ptrB) % halfSize) + halfSize) % halfSize; 
            // Correct indexing for Deck B requires offsetB added to the modulo result?
            // Wait, previous logic was: const idxB = ... ; sampleB = audioData[idxB + offsetB];
            // Let's check original.
            // Original: const idxB = ...; sampleB = this.audioData[idxB + offsetB] || 0;
            // My code misses offsetB addition?
            const dbIdx = idxB + offsetB;
            let sampleB = this.audioData[dbIdx] || 0;

            sampleA = sampleA * this.trimA;
            if (this.driveA > 0) sampleA = Math.tanh(sampleA * (1.0 + this.driveA * 4.0));

            sampleB = sampleB * this.trimB;
            if (this.driveB > 0) sampleB = Math.tanh(sampleB * (1.0 + this.driveB * 4.0));

            const [eqAL, eqAR] = this.eqA.process(sampleA, sampleA); 
            const [eqBL, eqBR] = this.eqB.process(sampleB, sampleB);

            // Mixer
            const volA = Math.min(1.0, (1.0 - this.crossfader) * 2.0); 
            const volB = Math.min(1.0, this.crossfader * 2.0);         
            
            let mixL = (eqAL * volA) + (eqBL * volB);
            let mixR = (eqAR * volA) + (eqBR * volB);
            
            mixL = Math.tanh(mixL);
            mixR = Math.tanh(mixR);
            
            if (this.ghostActive) {
                const targetPtr = (this.ghostTarget === 'A') ? ptrA : ptrB;
                const offset = 44100 * 2; 
                let gP = targetPtr - offset;
                this.ghostPtr = gP;
                const bufferIdx = ((Math.floor(gP) % halfSize) + halfSize) % halfSize;
                const finalIdx = bufferIdx + ((this.ghostTarget === 'B') ? offsetB : 0);
                const rawGhost = this.audioData[finalIdx] || 0;
                
                // Apply Ghost EQ (simple one-pole LPF for dark/bright control)
                this.ghostLpfState += this.ghostLpfCoeff * (rawGhost - this.ghostLpfState);
                const filteredGhost = this.ghostLpfState;
                
                let ghostSample = filteredGhost * this.ghostMix;
                mixL += ghostSample;
                mixR += ghostSample;
            }

            if (this.slicerActive) {
                const bpm = this.masterBpm; // Use master BPM instead of hardcoded 120
                const samplesPerSlice = (44100 * 60) / (bpm * 4);
                const sliceState = Math.floor((currentFrame + i) / samplesPerSlice) % 2;
                
                if (sliceState === 0) { 
                     if (this.slicerTarget === 'A' && this.crossfader < 0.9) {
                         mixL *= 0.0; mixR *= 0.0; 
                     }
                     if (this.slicerTarget === 'B' && this.crossfader > 0.1) {
                         mixL *= 0.0; mixR *= 0.0;
                     }
                }
            }
            
            let sample = mixL; 
            
            if (this.filterActive) {
                sample = this.hpf.process(sample, 'HP');
                sample = this.lpf.process(sample, 'LP');
            }

            if (this.tapeActive) {
                 const bpm = 120;
                 const delayTime = (60 / bpm) * 0.75; 
                 this.delay.setParams(delayTime, this.dubFeedback, 0.002); 
                 sample += this.delay.process(sample) * (this.dubFeedback * 0.5);
            }
            if (this.decimatorActive) sample = this.decimator.process(sample);
            sample = this.spectralGate.process(sample);
            if (this.reverbActive) sample = this.bloom.process(sample);
            if (this.compActive) sample = this.limiter.process(sample);

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
