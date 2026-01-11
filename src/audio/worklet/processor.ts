import { OFFSETS } from '../../types/shared';
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
import { SvfFilter } from './dsp/filter';

// Polyfill for TypeScript environment where AudioWorkletProcessor might be undefined in 'lib'
declare const AudioWorkletProcessor: any;
declare const registerProcessor: any;

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
  
  private filterActive: boolean = true;
  
  constructor() {
    super();
    this.hpf.setParams(20, 0.7); // Open
    this.lpf.setParams(20000, 0.7); // Open
    
    this.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'INIT_SAB') {
        this.sab = event.data.payload;
        this.initBuffer();
      }
      
      if (event.data.type === 'CONFIG_UPDATE') {
          if (event.data.param === 'SR') this.decimator.setParams(event.data.value, this.decimator.bitDepth);
          if (event.data.param === 'BITS') this.decimator.setParams(this.decimator.sampleRate, event.data.value);
          
          if (event.data.param === 'TAPE_STOP') {
              this.tape.setTargetSpeed(event.data.value > 0.5 ? 0.0 : 1.0);
          }
          if (event.data.param === 'SPEED') {
              this.tape.setTargetSpeed(event.data.value);
          }
          if (event.data.param === 'NOISE_LEVEL') {
              this.noiseLevel = event.data.value;
          }
          if (event.data.param === 'CHOPPER_ACTIVE') {
              this.chopperActive = event.data.value > 0.5;
          }
          if (event.data.param === 'CHOPPER_DECAY') {
               this.chopperDecay = 0.99 + (event.data.value * 0.0099);
          }
          if (event.data.param === 'CHOPPER_MIX') {
              this.chopperMix = event.data.value;
          }
           if (event.data.param === 'DUB') {
              this.dubFeedback = event.data.value * 0.95;
          }
          if (event.data.param === 'RESET') {
              if (this.headerView) {
                  Atomics.store(this.headerView, OFFSETS.READ_POINTER_A / 4, 0);
              }
          }
          if (event.data.param === 'GHOST_FADE') {
              const val = 1.0 - event.data.value; 
              this.ghostFadeIn = 0.0001 + (val * 0.01);
              this.ghostFadeOut = 0.00005 + (val * 0.005);
          }
          if (event.data.param === 'GHOST_EQ') {
              this.ghostEq = event.data.value;
          }
          if (event.data.param === 'GATE_THRESH') {
              const thresh = event.data.value * 0.3; 
              const mix = event.data.value > 0.01 ? 1.0 : 0.0;
              this.spectralGate.setParams(thresh, mix);
          }
          
          // BLOOM REVERB PARAMS
          if (event.data.param === 'BLOOM_SIZE') this.bloomSize = event.data.value;
          if (event.data.param === 'BLOOM_SHIMMER') this.bloomShimmer = event.data.value;
          if (event.data.param === 'BLOOM_MIX') this.bloomMix = event.data.value;
          
          this.bloom.setParams(this.bloomSize, this.bloomShimmer, this.bloomMix);
          
          // FILTER PARAMS
          if (event.data.param === 'FILTER_ACTIVE') {
              this.filterActive = event.data.value > 0.5;
          }
          if (event.data.param === 'HPF') {
              // Map 0..1 -> 20..20000 (Log)
              // 20 * (1000^val)
              const freq = 20 * Math.pow(1000, event.data.value);
              this.hpf.setParams(freq, 0.7);
          }
          if (event.data.param === 'LPF') {
              // Map 0..1 -> 20..20000 (Log)
              const freq = 20 * Math.pow(1000, event.data.value);
              this.lpf.setParams(freq, 0.7);
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
    const ghostVelocity = velocity * 0.9; 
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
            const sampleB = this.audioData[indexB] || 0;
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

        // --- FX CHAIN: MOD 04 TAPE ECHO (Pre or Post?) ---
        // Modules usually series.
        const delayTime = (60 / bpm) * 0.75; 
        this.delay.setParams(delayTime, this.dubFeedback, 0.002); 
        const wetDelay = this.delay.process(sample);
        const wetMix = (this.dubFeedback / 0.95) * 0.5;
        if (wetMix > 0.001) sample += wetDelay * wetMix; 

        // --- FX CHAIN: MOD 02 DECIMATOR ---
        sample = this.decimator.process(sample);
        
        // --- FX CHAIN: MOD 05 GATE ---
        sample = this.spectralGate.process(sample);
        
        // --- FX CHAIN: MOD 03 BLOOM ---
        sample = this.bloom.process(sample);

        // --- FX CHAIN: MOD 06 LIMITER ---
        sample = this.limiter.process(sample);

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
