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

// Polyfill for TypeScript environment where AudioWorkletProcessor might be undefined in 'lib'
declare const AudioWorkletProcessor: any;
declare const registerProcessor: any;

// INLINED CONSTANTS
const OFFSETS = {
  WRITE_POINTER: 0,    // Int32: Current write index (frames)
  READ_POINTER_A: 4,   // Int32: Head A play index
  READ_POINTER_B: 8,   // Int32: Head B play index (Slice)
  READ_POINTER_C: 12,  // Int32: Head C play index (Cloud)
  STATE_FLAGS: 16,     // Int32: Bitmask
  TAPE_VELOCITY: 20,   // Float32: Current physics velocity
  BPM: 24,             // Float32: Global BPM
};

class SvfFilter {
    private sampleRate: number;
    private s1: number = 0.0;
    private s2: number = 0.0;
    
    // TPT Coeffs
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
        // TPT is stable up to Nyquist, so 20kHz is fine.
        this.cutoff = Math.max(20, Math.min(this.sampleRate * 0.49, cutoff));
        this.q = Math.max(0.1, q);
        this.calcCoeffs();
    }
    
    private calcCoeffs() {
        // TPT (Trapezoidal Integrator) SVF
        // g = tan(pi * fc / fs)
        this.g = Math.tan(Math.PI * this.cutoff / this.sampleRate);
        this.k = 1.0 / this.q;
        this.a1 = 1.0 / (1.0 + this.g * (this.g + this.k));
        this.a2 = this.g * this.a1;
        this.a3 = this.g * this.a2;
    }
    
    process(input: number, type: 'LP' | 'HP' | 'BP'): number {
        // Solving implicit equations for linear TPT SVF:
        // v1 = a1 * (input - s1 * (g + k) - s2) [Not quite, let's use the explicit loop form]
        
        // Simper's form:
        const v3 = input - this.s2;
        const v1 = this.a1 * this.s1 + this.a2 * v3;
        const v2 = this.s2 + this.a2 * this.s1 + this.a3 * v3;
        
        this.s1 = 2 * v1 - this.s1;
        this.s2 = 2 * v2 - this.s2;
        
        // v1 = BP, v2 = LP, Input - k*v1 - v2 = HP
        
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
  
  private tape: TapeTransport = new TapeTransport();
  private decimator: Decimator = new Decimator(44100);
  private noiseLevel: number = 0.0;
  private sampleCounter: number = 0;
  
  // Envelopes
  private envB: number = 0.0; // Chopper Envelope
  private envC: number = 0.0; // Ghost Envelope
  private targetEnvC: number = 0.0; // Target for Ghost Envelope

  // Chopper Params
  private chopperActive: boolean = false;
  private chopperDecay: number = 0.9992;
  private chopperMix: number = 0.5;
  private chopperEq: number = 0.5;
  private chopperPrev: number = 0.0;

  private delay: TapeDelay = new TapeDelay(44100, 2.0);
  private dubFeedback: number = 0.0;
  
  // Ghost Params
  private ghostFadeIn: number = 0.0005; 
  private ghostFadeOut: number = 0.0002; 
  private ghostEq: number = 0.5; 
  private ghostPrev: number = 0.0; 
  private ghostDelaySend: number = 1.0; 
  
  private spectralGate: SpectralGate = new SpectralGate(44100);
  private bloom: BloomReverb = new BloomReverb(44100);
  private limiter: Limiter = new Limiter(44100);
  private hpf: SvfFilter = new SvfFilter(44100);
  private lpf: SvfFilter = new SvfFilter(44100);

  // Params Cache
  private bloomSize: number = 0.5;
  private bloomShimmer: number = 0.5;
  private bloomMix: number = 0.0;
  
  private filterActive: boolean = false;
  private decimatorActive: boolean = false;
  private tapeActive: boolean = false;
  private reverbActive: boolean = false;
  private compActive: boolean = false;
  
  // Tims for params
  private compThresh: number = 1.0;
  private compRatio: number = 20.0; // Limiter default
  private compMakeup: number = 1.0;
  
  // Filter State
  private hpfFreq: number = 20;
  private lpfFreq: number = 14000;
  private filterQ: number = 0.7;

  // State for Transport Logic
  private internalSpeed: number = 1.0;
  private isStopping: boolean = false;

  constructor() {
    super();
    this.hpf.setParams(this.hpfFreq, this.filterQ); 
    this.lpf.setParams(this.lpfFreq, this.filterQ); 
    
    // Init Limiter
    this.limiter.setParams(1.0, 20.0, 1.0, 100);

    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_SAB') {
        this.sab = event.data.payload;
        this.initBuffer();
      }
      
      if (event.data.type === 'CONFIG_UPDATE') {
          // DECIMATOR
          if (event.data.param === 'SR') this.decimator.setParams(event.data.value, this.decimator.bitDepth);
          if (event.data.param === 'BITS') this.decimator.setParams(this.decimator.sampleRate, event.data.value);
          
          // TAPE TRANSPORT LOGIC (Fixed Conflict)
          if (event.data.param === 'TAPE_STOP') {
              this.isStopping = event.data.value > 0.5;
              this.tape.setTargetSpeed(this.isStopping ? 0.0 : this.internalSpeed);
          }
          if (event.data.param === 'SPEED') {
              this.internalSpeed = event.data.value;
              if (!this.isStopping) this.tape.setTargetSpeed(this.internalSpeed);
          }
          if (event.data.param === 'SCRATCH_SPEED') {
              // Bypass isStopping check for manual scratch interaction
              this.tape.setTargetSpeed(event.data.value);
          }
          
          if (event.data.param === 'NOISE_LEVEL') this.noiseLevel = event.data.value;

          // ACTIVE FLAGS
          if (event.data.param === 'FILTER_ACTIVE') this.filterActive = event.data.value > 0.5;
          if (event.data.param === 'DECIMATOR_ACTIVE') this.decimatorActive = event.data.value > 0.5;
          if (event.data.param === 'TAPE_ACTIVE') this.tapeActive = event.data.value > 0.5;
          if (event.data.param === 'REVERB_ACTIVE') this.reverbActive = event.data.value > 0.5;
          if (event.data.param === 'COMP_ACTIVE') this.compActive = event.data.value > 0.5;
          if (event.data.param === 'CHOPPER_ACTIVE') this.chopperActive = event.data.value > 0.5;

          // COMPRESSOR / LIMITER
          if (event.data.param === 'COMP_THRESH') this.compThresh = event.data.value;
          if (event.data.param === 'COMP_RATIO') this.compRatio = event.data.value;
          if (event.data.param === 'COMP_MAKEUP') {
               this.compMakeup = event.data.value; 
               this.limiter.setParams(this.compThresh, this.compRatio, this.compMakeup, 100);
          }

          // CHOPPER (HEAD B)
          if (event.data.param === 'CHOPPER_DECAY') this.chopperDecay = 0.99 + (event.data.value * 0.0099);
          if (event.data.param === 'CHOPPER_MIX') this.chopperMix = event.data.value;
          if (event.data.param === 'CHOPPER_EQ') this.chopperEq = event.data.value;
          
          // GLOBALS / GHOST
          if (event.data.param === 'DUB') this.dubFeedback = event.data.value * 0.95;
          if (event.data.param === 'RESET') {
              if (this.headerView) Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, 0);
          }
          if (event.data.param === 'GHOST_FADE') {
              const val = 1.0 - event.data.value; 
              this.ghostFadeIn = 0.0001 + (val * 0.01);
              this.ghostFadeOut = 0.00005 + (val * 0.005);
          }
          if (event.data.param === 'GHOST_EQ') this.ghostEq = event.data.value;
          
          if (event.data.param === 'GATE_THRESH') {
              const thresh = event.data.value * 0.3; 
              const mix = event.data.value > 0.01 ? 1.0 : 0.0;
              this.spectralGate.setParams(thresh, mix);
          }
          
          // BLOOM REVERB
          if (event.data.param === 'BLOOM_SIZE') this.bloomSize = event.data.value;
          if (event.data.param === 'BLOOM_SHIMMER') this.bloomShimmer = event.data.value;
          if (event.data.param === 'BLOOM_MIX') this.bloomMix = event.data.value;
          this.bloom.setParams(this.bloomSize, this.bloomShimmer, this.bloomMix);
          
          // FILTER
          if (event.data.param === 'FILTER_Q') {
              this.filterQ = 0.1 + (event.data.value * 9.9);
              this.hpf.setParams(this.hpfFreq, this.filterQ);
              this.lpf.setParams(this.lpfFreq, this.filterQ);
          }
          if (event.data.param === 'HPF') {
              this.hpfFreq = 20 * Math.pow(1000, event.data.value);
              this.hpf.setParams(this.hpfFreq, this.filterQ);
          }
          if (event.data.param === 'LPF') {
              this.lpfFreq = 20 * Math.pow(1000, event.data.value);
              this.lpf.setParams(this.lpfFreq, this.filterQ);
          }
      }
      
      if (event.data.type === 'GHOST_START') {
          this.targetEnvC = 1.0;
          if (this.envC < 0.1) this.triggerGhostJump();
      }
      if (event.data.type === 'GHOST_STOP') {
          this.targetEnvC = 0.0;
      }
      
      if (event.data.type === 'JUMP_GHOST') {
         this.triggerGhostJump();
      }
    };
  }
  
  private triggerGhostJump() {
      if (this.headerView && this.audioData) {
          const writePtr = Atomics.load(this.headerView, OFFSETS.WRITE_POINTER / 4);
          const bufferLen = this.audioData.length;
          const startPos = Math.max(0, writePtr - bufferLen);
          const validLength = writePtr - startPos;
          
          if (validLength > 0) {
              const randomOffset = Math.floor(Math.random() * validLength);
              const targetPtr = startPos + randomOffset;
              Atomics.store(this.headerView, OFFSETS.READ_POINTER_C / 4, targetPtr);
          }
      }
  }

  private initBuffer() {
    if (!this.sab) return;
    this.headerView = new Int32Array(this.sab, 0, 32); 
    this.floatView = new Float32Array(this.sab, 0, 32); 
    this.audioData = new Float32Array(this.sab, 128 / 4); 
    this.port.postMessage({ type: 'INIT_COMPLETE' }); 
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const leftChannel = output[0];
    const rightChannel = output[1] || leftChannel;
    
    if (!this.audioData || !this.headerView || !this.floatView) return true;

    const bufferSize = this.audioData.length;
    const readPtrA = Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
    let readPtrC = Atomics.load(this.headerView, OFFSETS.READ_POINTER_C / 4);
    let readPtrB = Atomics.load(this.headerView, OFFSETS.READ_POINTER_B / 4);
    const velocity = this.tape.process();
    this.floatView[OFFSETS.TAPE_VELOCITY / 4] = velocity;

    let currentPtr = readPtrA;
    let currentPtrC = readPtrC;
    let currentPtrB = readPtrB;
    const ghostVelocity = velocity * 0.5; // Half speed
    const bpm = this.floatView[OFFSETS.BPM / 4] || 120;
    const samplesPerBeat = (44100 * 60) / bpm;
    const distancePer16th = samplesPerBeat / 4;
    const isMoving = Math.abs(velocity) > 0.05;
    const writePtr = Atomics.load(this.headerView, OFFSETS.WRITE_POINTER / 4);

    for (let i = 0; i < leftChannel.length; i++) {
        // --- HEAD A (MAIN) ---
        const indexA = Math.floor(currentPtr) % bufferSize;
        let sample = this.audioData[indexA] || 0;
        
        if (this.noiseLevel > 0) {
            sample += (Math.random() * 2 - 1) * this.noiseLevel;
        }

        // --- HEAD B ---
        this.envB *= this.chopperDecay; 
        if (isMoving && this.chopperActive) {
            this.sampleCounter += Math.abs(velocity); 
            if (this.sampleCounter >= distancePer16th) {
                this.sampleCounter -= distancePer16th;
                const range = samplesPerBeat * 8;
                const validEnd = writePtr;
                const validStart = Math.max(0, validEnd - range);
                const jumpTarget = validStart + Math.random() * (validEnd - validStart);
                currentPtrB = jumpTarget;
                this.envB = 1.0;
            }
            const indexB = Math.floor(currentPtrB) % bufferSize;
            let sampleB = this.audioData[indexB] || 0;
            
            // HEAD B EQ
            if (this.chopperEq > 0.55) {
                 const coeff = (this.chopperEq - 0.5) * 1.8; 
                 const low = this.chopperPrev + coeff * (sampleB - this.chopperPrev);
                 this.chopperPrev = low;
                 sampleB = sampleB - low; // High pass
            } else if (this.chopperEq < 0.45) {
                const coeff = this.chopperEq * 2.0; 
                const low = this.chopperPrev + coeff * (sampleB - this.chopperPrev);
                this.chopperPrev = low;
                sampleB = low; // Low pass
            } else {
                this.chopperPrev = sampleB;
            }

            sample = sample + (sampleB * this.chopperMix * this.envB);
            currentPtrB += velocity; 
            if (currentPtrB >= bufferSize) currentPtrB -= bufferSize;
            if (currentPtrB < 0) currentPtrB += bufferSize;
        }

        // --- HEAD C ---
        if (this.envC < this.targetEnvC) this.envC += this.ghostFadeIn; 
        else if (this.envC > this.targetEnvC) this.envC -= this.ghostFadeOut; 
        
        if (isMoving && this.envC > 0.001) {
            const indexC = Math.floor(currentPtrC) % bufferSize;
            let ghostSample = this.audioData[indexC] || 0;
            
            if (this.ghostEq > 0.55) {
                 const coeff = (this.ghostEq - 0.5) * 1.8; 
                 const low = this.ghostPrev + coeff * (ghostSample - this.ghostPrev);
                 this.ghostPrev = low;
                 ghostSample = ghostSample - low; 
            } else if (this.ghostEq < 0.45) {
                const coeff = this.ghostEq * 2.0; 
                const low = this.ghostPrev + coeff * (ghostSample - this.ghostPrev);
                this.ghostPrev = low;
                ghostSample = low;
            } else {
                this.ghostPrev = ghostSample;
            }
            sample = sample + (ghostSample * 0.7 * this.envC);
            currentPtrC += ghostVelocity;
            if (currentPtrC >= bufferSize) currentPtrC -= bufferSize;
            if (currentPtrC < 0) currentPtrC += bufferSize;
        }

        // --- FX CHAIN: MOD 01 FILTER ---
        if (this.filterActive) {
            sample = this.hpf.process(sample, 'HP');
            sample = this.lpf.process(sample, 'LP');
        }

        // --- FX CHAIN: MOD 04 TAPE ECHO ---
        if (this.tapeActive) {
            const delayTime = (60 / bpm) * 0.75; 
            this.delay.setParams(delayTime, this.dubFeedback, 0.002); 
            const wetDelay = this.delay.process(sample);
            const wetMix = (this.dubFeedback / 0.95) * 0.5;
            if (wetMix > 0.001) sample += wetDelay * wetMix; 
        }

        // --- FX CHAIN: MOD 02 DECIMATOR ---
        if (this.decimatorActive) {
            sample = this.decimator.process(sample);
        }
        
        // --- FX CHAIN: MOD 05 GATE ---
        sample = this.spectralGate.process(sample);
        
        // --- FX CHAIN: MOD 03 BLOOM ---
        if (this.reverbActive) {
            sample = this.bloom.process(sample);
        }

        // --- FX CHAIN: MOD 06 DYNAMICS ---
        if (this.compActive) {
            sample = this.limiter.process(sample);
        }

        leftChannel[i] = sample;
        rightChannel[i] = sample;

        currentPtr += velocity;
        if (currentPtr >= bufferSize) currentPtr -= bufferSize;
        if (currentPtr < 0) currentPtr += bufferSize;
        
        currentPtrC += ghostVelocity;
        if (currentPtrC >= bufferSize) currentPtrC -= bufferSize;
        if (currentPtrC < 0) currentPtrC += bufferSize;
    }

    Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, Math.floor(currentPtr));
    Atomics.store(this.headerView, OFFSETS.READ_POINTER_C / 4, Math.floor(currentPtrC));
    Atomics.store(this.headerView, OFFSETS.READ_POINTER_B / 4, Math.floor(currentPtrB));
    
    // Metering Feedback (Throttle?)
    if (Math.random() > 0.99) {
        // Send meter update
        // We can't really postMessage every frame.
        // The Limiter has `currentReduction`.
    }

    return true;
  }
}

registerProcessor('ghost-processor', GhostProcessor);
