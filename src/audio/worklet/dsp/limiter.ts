export class Limiter {
    private sampleRate: number;
    private threshold: number = 0.95; // -0.5dB
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
    
    setParams(threshold: number, releaseMs: number) {
        this.threshold = threshold;
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
        // If envelope > threshold, we need to attenuate
        let gain = 1.0;
        if (this.envelope > this.threshold) {
             gain = this.threshold / this.envelope;
        }
        
        this.currentReduction = gain;

        // 3. Write to delay buffer
        this.buffer[this.writePtr] = input;
        
        // 4. Read from delay buffer
        // Note: In a real lookahead, we'd apply the gain computed *now* to the signal *delayed*.
        // The peak we detected 'now' will arrive at the output 'lookahead' samples later.
        // Wait, lookahead means we see the peak *before* it happens.
        // So we delay the AUDIO, but we apply the GAIN envelope immediately?
        // Yes, aligning the "Attack" of the gain envelope with the "Peak" of the audio.
        // Simple implementation: 
        // Delay Line: [ ... ... Peak ... ... ]
        // Control:    [ ... ... Gain ... ... ]
        // We actually want the gain reduction to ramp down *before* the peak hits?
        // For brickwall, Instant Attack on the *lookahead* signal is sufficient if we apply it to the *delayed* signal.
        
        const delayedSample = this.buffer[this.readPtr];
        
        // Apply Gain
        const output = delayedSample * gain;
        
        // Update pointers
        this.writePtr++;
        if (this.writePtr >= this.buffer.length) this.writePtr = 0;
        
        this.readPtr++;
        if (this.readPtr >= this.buffer.length) this.readPtr = 0;
        
        return output;
    }
}
