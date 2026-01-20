import { Compressor } from './compressor';
import { Limiter } from './limiter';

/**
 * MasterBus
 * Handles the final stereo mix processing.
 * Chain: Summing -> Bus Compressor -> Saturation -> Limiter
 */
export class MasterBus {
    private sampleRate: number;
    
    // Modules
    public compressor: Compressor;
    public limiterL: Limiter;
    public limiterR: Limiter;
    
    // Params
    public saturation: number = 0.0; // 0..1 Soft clipping amount
    
    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        
        this.compressor = new Compressor(sampleRate);
        // "Glue" Presets: Slow Attack, Fast-ish Release, Low Ratio
        this.compressor.setParams(-4.0, 2.0, 30, 100, 0, 6.0); 
        
        this.limiterL = new Limiter(sampleRate);
        this.limiterR = new Limiter(sampleRate);
        // Brickwall settings - threshold is LINEAR (0.95 = ~-0.5dB)
        // setParams(threshold, ratio, makeup, releaseMs)
        this.limiterL.setParams(0.95, 100, 1.0, 50);
        this.limiterR.setParams(0.95, 100, 1.0, 50);
    }
    
    setGlue(active: boolean) {
        // Simple toggle for now, could be detailed params
        if (active) {
            this.compressor.setParams(-12.0, 4.0, 10, 100, 2.0, 6.0);
        } else {
             // Transparent
             this.compressor.setParams(0, 1.0, 30, 100, 0, 0);
        }
    }

    process(inL: number, inR: number): [number, number] {
        let l = inL;
        let r = inR;
        
        // 1. Bus Compressor (Glue)
        const [compL, compR] = this.compressor.process(l, r);
        l = compL;
        r = compR;
        
        // 2. Saturation (Soft Clipper)
        // Adds warmth and controls peaks before limiter
        if (this.saturation > 0) {
            const sat = 1.0 + this.saturation * 2.0;
            // Native tanh for soft clipping (saturation)
            l = Math.tanh(l * sat);
            r = Math.tanh(r * sat);
            
            // Normalize slightly to keep volume roughly consistent?
            // Usually drive increases volume. We might want to compensate but
            // for now let's behave like a standard Saturator.
        }
        
        // 3. Brickwall Limiter (Final Safety)
        l = this.limiterL.process(l);
        r = this.limiterR.process(r);
        
        return [l, r];
    }
}
