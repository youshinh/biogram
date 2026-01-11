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
    
    setParams(threshold: number, mix: number) {
        this.threshold = threshold;
        this.mix = mix;
    }
    
    process(input: number): number {
        // 1. Crossover (State Variable or Simple One Pole)
        
        // Low Band (LPF)
        // y = y_prev + coeff * (x - y_prev)
        this.lowState += this.lowCoeff * (input - this.lowState);
        const low = this.lowState;
        
        // High Band (HPF)
        // y = x - lpf(x)
        // Let's use a separate state for high split to be cleaner
        this.highState += this.highCoeff * (input - this.highState);
        const high = input - this.highState;
        
        // Mid Band (Remainder)
        // This is imperfect (phase cancellation) but creates "spectral" holes which is desired
        // Mid = Input - Low - High? 
        // Logic: Low contains <300. High contains >3000.
        // Input - Low removes Bass. Then removing High removes Treble.
        // Result is Mid.
        const mid = input - low - high; 
        
        // 2. Gating
        // Release coefficient
        const release = 0.9995; // Slow release
        
        // Envelope Followers (Absolute)
        this.envL = Math.max(Math.abs(low), this.envL * release);
        this.envM = Math.max(Math.abs(mid), this.envM * release);
        this.envH = Math.max(Math.abs(high), this.envH * release);
        
        // Apply Gate
        // If Env < Threshold, gain = 0. Else gain = 1. (Hard Gate)
        // Soften it slightly? No, "Spectral Gate" implies cutting bands.
        
        const gL = this.envL > this.threshold ? 1.0 : 0.0;
        const gM = this.envM > this.threshold ? 1.0 : 0.0;
        const gH = this.envH > this.threshold ? 1.0 : 0.0;
        
        const gatedLow = low * gL;
        const gatedMid = mid * gM;
        const gatedHigh = high * gH;
        
        const gatedOutput = gatedLow + gatedMid + gatedHigh;
        
        // 3. Mix
        return (input * (1.0 - this.mix)) + (gatedOutput * this.mix);
    }
}
