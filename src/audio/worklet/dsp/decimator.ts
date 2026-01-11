/**
 * Decimator.ts
 * Variable Sample Rate & Bit Depth Reducer
 * Spec: 4.2 DSP Modules & 1.2 VSR Decimator
 */

export class Decimator {
    // Parameters
    sampleRate: number = 44100; // Target rate
    bitDepth: number = 32;      // 32 = Bypass (float), 4 = Low fin
    
    // Internal State
    private phasor: number = 0.0;
    private lastSample: number = 0.0;
    private systemRate: number = 44100;

    constructor(systemRate: number = 44100) {
        this.systemRate = systemRate;
    }

    setParams(rate: number, bits: number) {
        this.sampleRate = Math.max(100, Math.min(this.systemRate, rate));
        this.bitDepth = Math.max(1, Math.min(32, bits));
    }

    process(input: number): number {
        // 1. Bit Reduction (Quantization)
        let processed = input;
        
        if (this.bitDepth < 32) {
            const steps = Math.pow(2, this.bitDepth);
            processed = Math.floor(input * steps) / steps;
        }

        // 2. Sample Rate Reduction (Sample & Hold)
        // If target rate == system rate, bypass S&H
        if (this.sampleRate >= this.systemRate) {
            return processed;
        }

        this.phasor += this.sampleRate / this.systemRate;
        
        if (this.phasor >= 1.0) {
            this.phasor -= 1.0;
            this.lastSample = processed; // Capture new sample
        }
        
        // Return held sample
        return this.lastSample;
    }
}
