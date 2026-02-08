export class BloomReverb {
    private sampleRate: number;
    public size: number = 0.5; // Room Size
    public shimmer: number = 0.5; // Brightness / Modulation
    public wet: number = 0.5;
    public dry: number = 1.0;
    
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
    
    public freeze: boolean = false;
    
    setParams(size: number, shimmer: number, wet: number, dry: number, freeze: boolean = false) {
        this.size = size;     // Feedback amount (Decay time)
        this.shimmer = shimmer; // HF Damping or Modulation Speed
        this.wet = wet;
        this.dry = dry;
        this.freeze = freeze;
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
        // Bypass if levels are negligible
        if (this.wet < 0.01 && this.dry > 0.99) return input;
        
        // Wet Path
        let wetSig = input;
        
        // 1. Diffusion
        for (let i = 0; i < 4; i++) {
            wetSig = this.processAllpass(wetSig, i);
        }
        
        // 2. Tank (FDN-ish)
        let tankOut = 0;
        
        let feedback = 0.5 + (this.size * 0.48); // 0.5 to 0.98
        if (this.freeze) feedback = 1.0; // Infinite Decay
        
        // When frozen, Damping should strictly be user controlled, but usually we open it up 
        // to prevent the loop from becoming dull, OR we keep it to freeze the "Darkness".
        // FIX: If we want "Eternal", we must disable damping loss.
        let damping = 1.0 - (this.shimmer * 0.5); 
        if (this.freeze) damping = 1.0; // Force lossless loop for infinity 
        
        // Update LFO
        this.lfoPhase += 0.0001 + (this.shimmer * 0.001);
        if (this.lfoPhase > Math.PI * 2) this.lfoPhase -= Math.PI * 2;
        // Reduce modulation depth when frozen to avoid pitch sickness? Or keep it?
        // Keep it for "Eternal" shifting textures.
        const mod = Math.sin(this.lfoPhase) * 20 * this.shimmer; 
        
        for (let i = 0; i < 4; i++) {
            const buf = this.feedbackDelays[i];
            const ptr = this.feedbackPointers[i];
            
            // ... (Read logic is same)
            const maxLen = buf.length; 
            const baseLen = [1557, 1617, 1491, 1422][i];
            let readPos = ptr - baseLen - mod;
            while(readPos < 0) readPos += maxLen;
            while(readPos >= maxLen) readPos -= maxLen;
            const rInt = Math.floor(readPos);
            const rFrac = readPos - rInt;
            const rNext = (rInt + 1) % maxLen;
            const delayVal = buf[rInt] * (1 - rFrac) + buf[rNext] * rFrac;
            
            // Filter
            this.feedbackGains[i] = (this.feedbackGains[i] * damping) + (delayVal * (1 - damping));
            const filtered = this.feedbackGains[i];
            
            tankOut += filtered;
            
            // Feedback
            // If Frozen, Input is 0
            const inputFeed = this.freeze ? 0.0 : wetSig;
            const fbIn = inputFeed + (filtered * feedback);
            buf[ptr] = fbIn; // Soft clip? No, pure math.

            
            this.feedbackPointers[i] = (ptr + 1) % maxLen;
        }
        
        tankOut = tankOut * 0.25; // Average
        
        // Independent Wet/Dry Mix
        return (input * this.dry) + (tankOut * this.wet);
    }
}
