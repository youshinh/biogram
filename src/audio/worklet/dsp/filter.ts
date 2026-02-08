export class SvfFilter {
    private sampleRate: number;
    private low: number = 0.0;
    private band: number = 0.0;
    private high: number = 0.0;
    private notch: number = 0.0;
    
    // Params
    private cutoff: number = 1000.0;
    private q: number = 0.5; // Resonance
    
    // Coefficients
    private f: number = 0.0;
    private qCoeff: number = 0.0;
    
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.calcCoeffs();
    }
    
    setParams(cutoff: number, q: number) {
        this.cutoff = Math.max(20, Math.min(this.sampleRate / 2, cutoff));
        this.q = Math.max(0.1, q);
        this.calcCoeffs();
    }
    
    private calcCoeffs() {
        // Chamberlin SVF
        // f = 2 * sin(pi * cutoff / fs)
        this.f = 2 * Math.sin(Math.PI * this.cutoff / this.sampleRate);
        this.qCoeff = 1.0 / this.q;
    }
    
    process(input: number, type: 'LP' | 'HP' | 'BP'): number {
        // Oversampling loop could happen here if unstable, but at 44.1k usually okay for low f
        // Note: Chamberlin can blow up > fs/4.
        
        // Basic Iteration
        this.low = this.low + this.f * this.band;
        this.high = this.qCoeff * input - this.low - this.qCoeff * this.band; // Wait, qCoeff placement
        
        // Correct Standard Chamberlin:
        // low += f * band
        // high = input - low - q*band
        // band += f * high
        
        this.low += this.f * this.band;
        this.high = input - this.low - (this.q * this.band); // Q is damping here? 1/Q usually.
        // Let's use standard form: 
        // q is damping factor (1/Q). q=0 (res) to q=2 (no res uses q=0??)
        // With Q parameter: damping = 1/Q. 
        
        const damping = 1.0 / this.q;
        
        // Re-calc Loop using stable form (Andrew Simper? No, keep it simple)
        // low += f * band
        // high = input - low - damping * band
        // band += f * high
        
        // Note: Stability constraint f < 2, damping > 0
        
        // Reset if NaN
        if (isNaN(this.low)) { this.low = 0; this.band = 0; this.high = 0; }

        this.high = input - this.low - (damping * this.band);
        this.band += this.f * this.high;
        
        // Output
        if (type === 'LP') return this.low;
        if (type === 'HP') return this.high;
        if (type === 'BP') return this.band;
        return input;
    }
    
    // Process Dual (HP + LP Series)
    // We can simulate XY pad:
    // X = HPF Cutoff (Low to High)
    // Y = LPF Cutoff (High to Low)
    // We need TWO filters if we want simultaneous bandpass-ish window.
}
