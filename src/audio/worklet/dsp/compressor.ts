export class Compressor {
    private sampleRate: number;
    private threshold: number = 0.0; // dB
    private ratio: number = 2.0;    // Ratio
    private attack: number = 0.0;   // Coeff
    private release: number = 0.0;  // Coeff
    private makeup: number = 1.0;   // Linear
    private knee: number = 0.0;     // dB
    
    // Runtime
    private envelope: number = 0.0;
    
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.setParams(-20, 4.0, 10, 100, 0, 0);
    }
    
    setParams(threshDb: number, ratio: number, attackMs: number, releaseMs: number, makeupDb: number, kneeDb: number = 0) {
        this.threshold = threshDb;
        this.ratio = Math.max(1.0, ratio);
        this.knee = Math.max(0.0, kneeDb);
        
        // Convert Attack/Release to coefficients
        // t = 1 - e^(-1 / (time * sr))
        this.attack = Math.exp(-1.0 / (Math.max(0.001, attackMs * 0.001) * this.sampleRate));
        this.release = Math.exp(-1.0 / (Math.max(0.001, releaseMs * 0.001) * this.sampleRate));
        
        this.makeup = Math.pow(10, makeupDb / 20.0);
    }
    
    process(inputL: number, inputR: number): [number, number] {
        // RMS Detection (simpler for glue) or Peak? Glue is usually VCA style (Peak-ish)
        // Let's use simple Peak for mobile efficiency
        const absL = Math.abs(inputL);
        const absR = Math.abs(inputR);
        const inputMax = Math.max(absL, absR);
        
        // Envelope Follower (Attack/Release)
        // Analog style: Attack on rise, Release on fall
        if (inputMax > this.envelope) {
            this.envelope = this.attack * this.envelope + (1.0 - this.attack) * inputMax;
        } else {
            this.envelope = this.release * this.envelope + (1.0 - this.release) * inputMax;
        }
        
        // Gain Calculation
        // 1. Convert Env to dB
        // Optim: approx log? or just standard Math.log10
        // Mobile JS engines are fast, Math.log10 is fine.
        const envDb = 20.0 * Math.log10(Math.max(1e-6, this.envelope));
        
        // 2. Calculate Gain Reduction in dB
        let gainDb = 0.0;
        
        // 3. Soft Knee Logic
        if (this.knee > 0) {
            if (envDb > this.threshold + this.knee / 2) {
                 // Above knee
                 gainDb = (this.threshold - envDb) * (1.0 - 1.0 / this.ratio);
            } else if (envDb > this.threshold - this.knee / 2) {
                 // In knee
                 const x = envDb - (this.threshold - this.knee / 2);
                 const slope = (1.0 / this.ratio) - 1.0; // Negative slope
                 // Quadratic knee interpolation
                 // This is a simplified "over the knee" formula
                 // Gain reduction = slope * (x^2 / (2*knee)) 
                 gainDb = slope * ((x * x) / (2.0 * this.knee));
            }
        } else {
            // Hard Knee
            if (envDb > this.threshold) {
                gainDb = (this.threshold - envDb) * (1.0 - 1.0 / this.ratio);
            }
        }
        
        // 4. Convert Gain Reduction to Linear
        const gain = Math.pow(10, gainDb / 20.0);
        
        // 5. Apply
        return [
            inputL * gain * this.makeup,
            inputR * gain * this.makeup
        ];
    }
}
