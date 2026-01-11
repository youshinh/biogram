export class Limiter {
    private sampleRate: number;
    private threshold: number = 0.95; // -0.5dB
    private ratio: number = 1.0; // 1:1 (No compression) -> Inf:1
    private makeup: number = 1.0; // Linear gain
    private release: number = 0.9995; // ~100ms at 44.1k
    private envelope: number = 0.0;
    
    // Lookahead
    private buffer: Float32Array;
    private writePtr: number = 0;
    private readPtr: number = 0;
    private lookaheadMs: number = 5;
    
    // Metering
    public currentReduction: number = 0.0; // 0..1 (1 = No reduction)
    
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        const frames = Math.ceil((this.lookaheadMs / 1000) * sampleRate);
        this.buffer = new Float32Array(frames);
    }
    
    setParams(threshold: number, ratio: number, makeup: number, releaseMs: number) {
        this.threshold = threshold;
        this.ratio = Math.max(1, ratio);
        this.makeup = makeup;
        this.release = Math.exp(-1.0 / (releaseMs * 0.001 * this.sampleRate));
    }
    
    process(input: number): number {
        // 1. Analyze Input (Sidechain)
        const absIn = Math.abs(input);
        
        if (absIn > this.envelope) {
            this.envelope = absIn; // Instant Attack
        } else {
            this.envelope = this.envelope * this.release; // Smooth Release
        }
        
        // 2. Calculate Gain Reduction needed
        let gain = 1.0;
        
        if (this.envelope > this.threshold && this.ratio > 1.0) {
             // Linear Domain Compression?
             // It's easier in dB.
             // But log/exp every sample is heavy?
             // Approximation: 
             // Gain = (Threshold / Envelope) ^ (1 - 1/Ratio)
             // If Ratio is Inf (very large), exponent -> 1. Gain -> Th/Env (Limiter)
             // If Ratio is 1, exponent -> 0. Gain -> 1.
             
             // Optimized Power calculation valid for Ratio >= 1
             const slope = 1.0 - (1.0 / this.ratio);
             gain = Math.pow(this.threshold / this.envelope, slope);
        }
        
        this.currentReduction = gain;

        // 3. Write to delay buffer
        this.buffer[this.writePtr] = input;
        
        // 4. Read from delayed buffer
        const delayedSample = this.buffer[this.readPtr];
        
        // Apply Gain & Makeup
        const output = delayedSample * gain * this.makeup;
        
        // Update pointers
        this.writePtr++;
        if (this.writePtr >= this.buffer.length) this.writePtr = 0;
        
        this.readPtr++;
        if (this.readPtr >= this.buffer.length) this.readPtr = 0;
        
        return output;
    }
}
