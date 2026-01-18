export class SpectralGate {
    private sampleRate: number;
    private lowState: number = 0;
    private highState: number = 0;
    
    // Crossover Frequencies (Simple One-pole RC)
    // Low Split: ~300Hz
    // High Split: ~3000Hz
    private lowCoeff: number;
    private highCoeff: number;
    
    // Gate Params
    private threshold: number = 0.0;
    private mix: number = 0.0; // 0 = Dry, 1 = Gated
    private release: number = 0.9995;

    // Envelopes
    private envL: number = 0.0;
    private envM: number = 0.0;
    private envH: number = 0.0;
    
    constructor(sampleRate: number = 44100) {
        this.sampleRate = sampleRate;
        // Calculate approx coeffs for 1-pole Lowpass
        // Coeff = 2 * PI * Freq / SR
        this.lowCoeff = Math.min(1.0, (2 * Math.PI * 300) / sampleRate);
        this.highCoeff = Math.min(1.0, (2 * Math.PI * 3000) / sampleRate);
    }
    
    setParams(threshold: number, release: number) {
        this.threshold = threshold;
        this.release = release;
        this.mix = threshold > 0 ? 1.0 : 0.0;
    }
    
    setThreshold(threshold: number) {
        this.threshold = threshold;
        this.mix = threshold > 0 ? 1.0 : 0.0; 
    }

    setRelease(release: number) {
        this.release = release;
    }
    
    // Smoothing State
    private gainL: number = 1.0;
    private gainM: number = 1.0;
    private gainH: number = 1.0;

    process(input: number): number {
        // 1. Crossover (State Variable or Simple One Pole)
        
        // Low Band (LPF)
        this.lowState += this.lowCoeff * (input - this.lowState);
        const low = this.lowState;
        
        // High Band (HPF)
        this.highState += this.highCoeff * (input - this.highState);
        const high = input - this.highState;
        
        // Mid Band
        const mid = input - low - high; 
        
        // 2. Gating
        const release = this.release;
        
        // Envelope Followers (Absolute)
        this.envL = Math.max(Math.abs(low), this.envL * release);
        this.envM = Math.max(Math.abs(mid), this.envM * release);
        this.envH = Math.max(Math.abs(high), this.envH * release);
        
        // Target Gain (Hard Decision)
        const targetL = this.envL > this.threshold ? 1.0 : 0.0;
        const targetM = this.envM > this.threshold ? 1.0 : 0.0;
        const targetH = this.envH > this.threshold ? 1.0 : 0.0;
        
        // Smooth Gain Transition (Attack/Release of the gate itself)
        // Attack (Open) should be fast (e.g. 0.001s = ~44 samples)
        // Release (Close) can be slightly slower to avoid zipper
        const smoothAttack = 0.5; // Very fast
        const smoothRelease = 0.99; // ~2ms
        
        this.gainL = (targetL > this.gainL) 
            ? this.gainL + (targetL - this.gainL) * smoothAttack 
            : this.gainL + (targetL - this.gainL) * (1 - smoothRelease);

        this.gainM = (targetM > this.gainM) 
            ? this.gainM + (targetM - this.gainM) * smoothAttack 
            : this.gainM + (targetM - this.gainM) * (1 - smoothRelease);

        this.gainH = (targetH > this.gainH) 
            ? this.gainH + (targetH - this.gainH) * smoothAttack 
            : this.gainH + (targetH - this.gainH) * (1 - smoothRelease);
        
        const gatedLow = low * this.gainL;
        const gatedMid = mid * this.gainM;
        const gatedHigh = high * this.gainH;
        
        const gatedOutput = gatedLow + gatedMid + gatedHigh;
        
        // 3. Mix
        return (input * (1.0 - this.mix)) + (gatedOutput * this.mix);
    }
}
