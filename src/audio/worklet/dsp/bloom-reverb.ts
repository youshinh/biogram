export class BloomReverb {
    private sampleRate: number;
    private size: number = 0.5; // Room Size
    private shimmer: number = 0.5; // Brightness / Modulation
    private mix: number = 0.5;
    
    // Diffusion steps (Allpass filters)
    private allpassDelays: Float32Array[] = [];
    private allpassPointers: number[] = [];
    
    // FDN / Tank
    private feedbackDelays: Float32Array[] = [];
    private feedbackPointers: number[] = [];
    private feedbackGains: number[] = [];
    
    // Modulation
    private lfoPhase: number = 0.0;
    
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.initDelays();
    }
    
    private initDelays() {
        // 4 Allpass stages for diffusion
        const apLengths = [225, 556, 441, 341]; 
        for (let l of apLengths) {
            this.allpassDelays.push(new Float32Array(l));
            this.allpassPointers.push(0);
        }
        
        // 4 Delay lines for Tank (prime numbers)
        const fbLengths = [1557, 1617, 1491, 1422]; // ~35ms
        for (let l of fbLengths) {
            this.feedbackDelays.push(new Float32Array(l * 10)); // Allow size modulation
            this.feedbackPointers.push(0);
            this.feedbackGains.push(0.0);
        }
    }
    
    setParams(size: number, shimmer: number, mix: number) {
        this.size = size;     // Feedback amount (Decay time)
        this.shimmer = shimmer; // HF Damping or Modulation Speed
        this.mix = mix;
    }
    
    private processAllpass(input: number, index: number): number {
        const buffer = this.allpassDelays[index];
        const ptr = this.allpassPointers[index];
        const len = buffer.length;
        
        const delayOut = buffer[ptr];
        const feed = input - delayOut * 0.5;
        
        buffer[ptr] = feed;
        // Output = delay + feed * 0.5
        // Standard Schroeder Allpass
        const out = delayOut + feed * 0.5;
        
        this.allpassPointers[index] = (ptr + 1) % len;
        return out;
    }
    
    process(input: number): number {
        if (this.mix < 0.01) return input;
        
        let wet = input;
        
        // 1. Diffusion
        for (let i = 0; i < 4; i++) {
            wet = this.processAllpass(wet, i);
        }
        
        // 2. Tank (FDN-ish)
        // Simple parallel comb filters with matrix mixing would be better,
        // but let's do a recirculating loop.
        
        let tankOut = 0;
        const feedback = 0.5 + (this.size * 0.48); // 0.5 to 0.98
        const damping = 1.0 - (this.shimmer * 0.5); // Lowpass
        
        // Update LFO for modulation (Shimmer-ish warble)
        this.lfoPhase += 0.0001 + (this.shimmer * 0.001);
        if (this.lfoPhase > Math.PI * 2) this.lfoPhase -= Math.PI * 2;
        const mod = Math.sin(this.lfoPhase) * 20 * this.shimmer; // Modulate delay length
        
        for (let i = 0; i < 4; i++) {
            const buf = this.feedbackDelays[i];
            const ptr = this.feedbackPointers[i];
            // Modulated Read
            const maxLen = buf.length; // actually using fixed sizes defined earlier? 
            // The buffers were init with size * 10.
            // Let's use the prime lengths as base.
            const baseLen = [1557, 1617, 1491, 1422][i];
            
            // Calc read pos
            let readPos = ptr - baseLen - mod;
            while(readPos < 0) readPos += maxLen;
            while(readPos >= maxLen) readPos -= maxLen;
            
            const rInt = Math.floor(readPos);
            const rFrac = readPos - rInt;
            const rNext = (rInt + 1) % maxLen;
            
            // Linear Interpolation
            const delayVal = buf[rInt] * (1 - rFrac) + buf[rNext] * rFrac;
            
            // Filter (Damping)
            this.feedbackGains[i] = (this.feedbackGains[i] * damping) + (delayVal * (1 - damping));
            const filtered = this.feedbackGains[i];
            
            tankOut += filtered;
            
            // Feedback with mix from other tap? (Householder matrix is expensive)
            // Simple self-feedback
            const fbIn = wet + (filtered * feedback);
            buf[ptr] = fbIn;
            
            this.feedbackPointers[i] = (ptr + 1) % maxLen;
        }
        
        tankOut = tankOut * 0.25; // Average
        
        return (input * (1 - this.mix)) + (tankOut * this.mix);
    }
}
