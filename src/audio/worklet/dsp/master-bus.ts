import { Compressor } from './compressor';
import { Limiter } from './limiter';
import { BiquadFilter } from './biquad-filter';

/**
 * MasterBus
 * Handles the final stereo mix processing.
 * Chain: Enhancer -> Glue Compressor -> Saturation -> Limiter
 */
export class MasterBus {
    private sampleRate: number;
    
    // Modules
    public compressor: Compressor;
    public limiterL: Limiter;
    public limiterR: Limiter;
    
    // Enhancer Filters (Stereo)
    private subL: BiquadFilter; private subR: BiquadFilter;
    private bassL: BiquadFilter; private bassR: BiquadFilter;
    private highL: BiquadFilter; private highR: BiquadFilter;
    
    // Params
    public saturation: number = 0.0;
    public enhance: number = 0.5; // Default ON (Music Mode)

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        
        this.compressor = new Compressor(sampleRate);
        this.compressor.setParams(-4.0, 2.0, 30, 100, 0, 6.0); 
        
        this.limiterL = new Limiter(sampleRate);
        this.limiterR = new Limiter(sampleRate);
        this.limiterL.setParams(0.95, 100, 1.0, 50);
        this.limiterR.setParams(0.95, 100, 1.0, 50);
        
        // Init Filters
        this.subL = new BiquadFilter(); this.subR = new BiquadFilter();
        this.bassL = new BiquadFilter(); this.bassR = new BiquadFilter();
        this.highL = new BiquadFilter(); this.highR = new BiquadFilter();
        
        // Initial Config
        this.updateEnhance();
    }
    
    setEnhance(amount: number) {
        this.enhance = Math.max(0, Math.min(1, amount));
        this.updateEnhance();
    }
    
    private updateEnhance() {
        // 1. Subsonic Protection (Always ON to clean mud)
        this.subL.update(30, 0.707, this.sampleRate, 'HP');
        this.subR.update(30, 0.707, this.sampleRate, 'HP');
        
        // 2. Bass Thickness (LowShelf 100Hz)
        // Range: 0dB to +6dB
        const bassGain = this.enhance * 6.0;
        this.bassL.update(100, 0.707, this.sampleRate, 'LS', bassGain);
        this.bassR.update(100, 0.707, this.sampleRate, 'LS', bassGain);
        
        // 3. High End Clarity (HighShelf 10kHz) - "Air"
        // Range: 0dB to +4dB
        const highGain = this.enhance * 4.0;
        this.highL.update(10000, 0.707, this.sampleRate, 'HS', highGain);
        this.highR.update(10000, 0.707, this.sampleRate, 'HS', highGain);
    }
    
    setGlue(active: boolean) {
        if (active) {
            this.compressor.setParams(-12.0, 4.0, 10, 100, 2.0, 6.0);
        } else {
            this.compressor.setParams(0, 1.0, 30, 100, 0, 0);
        }
    }

    process(inL: number, inR: number): [number, number] {
        let l = inL;
        let r = inR;
        
        // 0. Sonic Enhancer (EQ before Dynamics)
        // Sub Filter
        l = this.subL.process(l);
        r = this.subR.process(r);
        
        // Bass Enhance
        l = this.bassL.process(l);
        r = this.bassR.process(r);
        
        // High Enhance
        l = this.highL.process(l);
        r = this.highR.process(r);
        
        // 1. Bus Compressor (Glue)
        const [compL, compR] = this.compressor.process(l, r);
        l = compL;
        r = compR;
        
        // 2. Saturation (Soft Clipper)
        if (this.saturation > 0) {
            const sat = 1.0 + this.saturation * 2.0;
            l = Math.tanh(l * sat);
            r = Math.tanh(r * sat);
        }
        
        // 3. Brickwall Limiter
        l = this.limiterL.process(l);
        r = this.limiterR.process(r);
        
        return [l, r];
    }
}
