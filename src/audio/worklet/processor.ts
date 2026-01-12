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

// Polyfill for TypeScript environment where AudioWorkletProcessor might be undefined in 'lib'
declare const AudioWorkletProcessor: any;
declare const registerProcessor: any;

// INLINED CONSTANTS
const OFFSETS = {
  WRITE_POINTER_A: 0,   // Int32: Deck A Write Head
  WRITE_POINTER_B: 4,   // Int32: Deck B Write Head
  READ_POINTER_A: 8,    // Int32: Deck A Play Head
  READ_POINTER_B: 12,   // Int32: Deck B Play Head
  STATE_FLAGS: 16,     // Int32: Bitmask
  TAPE_VELOCITY: 20,   // Float32: Current physics velocity
  BPM: 24,             // Float32: Global BPM
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
  
  // Envelopes & States
  private envB: number = 0.0; // Wait, Head B is now Deck B. 
  // "Chopper" was Head B (Rhythmic Slice).
  // "Ghost" was Head C (Random).
  // Strategy: Deck A is MAIN. Deck B is SECOND Stream.
  // The "Chopper" and "Ghost" were interesting effects. 
  // Let's migrate them:
  // - Chopper: Apply to *Master* or keep on Deck B?
  // - Ghost: Apply to Deck A?
  // For simplicity NOW:
  // Deck A: Standard Playback + Internal Ghost (optional)
  // Deck B: Standard Playback
  // Leaving Chopper logic out for Phase 5 initial Mixer implementation to reduce complexity.
  // Re-enable Ghost on Deck A later.

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
          
          // MIXER: CROSSFADER
          if (param === 'CROSSFADER') this.crossfader = value;

          // DECK TRANSPORT
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
              // Direct override (Scratch doesn't update base speed persistence usually, or does it?)
              // Scratch is usually temporary.
              // But for now, direct control.
              if (deck === 'B') this.tapeB.setTargetSpeed(value);
              else this.tapeA.setTargetSpeed(value);
          }
          
          // EQ & KILLS
          const targetEq = (deck === 'B') ? this.eqB : this.eqA;
          if (param === 'EQ_HI') targetEq.gainHigh = value; 
          if (param === 'EQ_MID') targetEq.gainMid = value;
          if (param === 'EQ_LOW') targetEq.gainLow = value;
          if (param === 'KILL_HI') targetEq.killHigh = value;
          if (param === 'KILL_MID') targetEq.killMid = value;
          if (param === 'KILL_LOW') targetEq.killLow = value;

          // MASTER FX (Same as before)
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
          
           // BLOOM REVERB
          if (param === 'BLOOM_SIZE') this.bloom.setParams(value, this.bloom.shimmer, this.bloom.mix);
          if (param === 'BLOOM_SHIMMER') this.bloom.setParams(this.bloom.size, value, this.bloom.mix);
          if (param === 'BLOOM_MIX') this.bloom.setParams(this.bloom.size, this.bloom.shimmer, value);
      }
    };
  }

  private initBuffer() {
    if (!this.sab) return;
    this.headerView = new Int32Array(this.sab, 0, 32); 
    this.audioData = new Float32Array(this.sab, 128 / 4); 
    this.port.postMessage({ type: 'INIT_COMPLETE' }); 
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const leftChannel = output[0];
    const rightChannel = output[1] || leftChannel;
    
    if (!this.audioData || !this.headerView) return true;

    const bufferSize = this.audioData.length;
    const halfSize = Math.floor(bufferSize / 2);
    const offsetB = halfSize;

    // Load Pointers
    const readPtrA = Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
    const readPtrB = Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
    
    // Process Physics
    const velA = this.tapeA.process();
    const velB = this.tapeB.process();

    let ptrA = readPtrA;
    let ptrB = readPtrB;

    for (let i = 0; i < leftChannel.length; i++) {
        // --- DECK A READING ---
        // Handle negative pointers (Reverse/Scratch)
        const idxA = ((Math.floor(ptrA) % halfSize) + halfSize) % halfSize;
        let sampleA = this.audioData[idxA] || 0;
        
        // --- DECK B READING ---
        const idxB = ((Math.floor(ptrB) % halfSize) + halfSize) % halfSize;
        let sampleB = this.audioData[offsetB + idxB] || 0;
        
        // --- ISOLATOR EQ ---
        const [eqAL, eqAR] = this.eqA.process(sampleA, sampleA); // Mono to Stereo
        const [eqBL, eqBR] = this.eqB.process(sampleB, sampleB);

        // --- MIXER (Crossfader) ---
        // Simple Linear: A * (1-x) + B * x
        // Or Equal Power for better volume? Linear for now.
        // Actually, DJ Crossfaders usually maintain full volume at center.
        // Let's use a "Constant Power" approx or simple mix for now.
        
        // Curve:
        // 0.0 -> A=1, B=0
        // 0.5 -> A=1, B=1 (If "Dipping" style is Off) or A=0.7, B=0.7 (Equal Power)
        // Let's do simple Linear for safety first:
        // A * (1 - x) + B * x -> Dips at center.
        
        // Better:
        // VolA = cos(x * PI/2)
        // VolB = sin(x * PI/2) -- Equal Power
        
        // But for aggressive cutting (Scratch style), we want sharpness.
        // Let's stick to Linear for this iteration to verify functionality.
        const volA = Math.min(1.0, (1.0 - this.crossfader) * 2.0); // 1.0 until 0.5, then fade out
        const volB = Math.min(1.0, this.crossfader * 2.0);         // 0.0 until 0.5, then 1.0?
        // Wait, standard curve:
        // Left (0): A=1, B=0
        // Center (0.5): A=1, B=1
        // Right (1): A=0, B=1
        
        let mixL = (eqAL * volA) + (eqBL * volB);
        let mixR = (eqAR * volA) + (eqBR * volB);
        
        // --- ANALOG SUMMING (Tanh Saturation) ---
        // Saturated Sum to glue tracks
        // Soft Clip: tanh(x)
        mixL = Math.tanh(mixL);
        mixR = Math.tanh(mixR);
        
        // --- MASTER FX CHAIN ---
        let sample = mixL; // Mono processing for FX for now (optimized)
        
        if (this.filterActive) {
            sample = this.hpf.process(sample, 'HP');
            sample = this.lpf.process(sample, 'LP');
        }
        if (this.tapeActive) {
             const bpm = 120; // TODO: Fetch from SAB
             const delayTime = (60 / bpm) * 0.75; 
             this.delay.setParams(delayTime, this.dubFeedback, 0.002); 
             sample += this.delay.process(sample) * (this.dubFeedback * 0.5);
        }
        if (this.decimatorActive) sample = this.decimator.process(sample);
        sample = this.spectralGate.process(sample);
        if (this.reverbActive) sample = this.bloom.process(sample);
        if (this.compActive) sample = this.limiter.process(sample);

        leftChannel[i] = sample;
        rightChannel[i] = sample; // Mono Master for now, Stereo support later
        
        // --- VISUALIZATION OUTPUTS ---
        // Output 1: Deck A (Stereo)
        if (outputs[1] && outputs[1].length >= 2) {
            outputs[1][0][i] = eqAL;
            outputs[1][1][i] = eqAR;
        }
        
        // Output 2: Deck B (Stereo)
        if (outputs[2] && outputs[2].length >= 2) {
            outputs[2][0][i] = eqBL;
            outputs[2][1][i] = eqBR;
        }
        
        // Advance Pointers
        ptrA += velA;
        // if (ptrA < 0) ptrA += halfSize; // Handle reverse separately if needed, but for now allow neg
        
        ptrB += velB;
        // if (ptrB < 0) ptrB += halfSize; 

    }

    // Store state back (Monotonic)
    // Note: This relies on StreamAdapter also managing pointers monotonically until Int32 overflow (>12h).
    Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, Math.floor(ptrA));
    Atomics.store(this.headerView, OFFSETS.READ_POINTER_B / 4, Math.floor(ptrB));
    
    // Update Velocity Global
    if (this.floatView) this.floatView[OFFSETS.TAPE_VELOCITY / 4] = (velA + velB) / 2; // Avg for visual?

    return true;
  }
}

registerProcessor('ghost-processor', GhostProcessor);
