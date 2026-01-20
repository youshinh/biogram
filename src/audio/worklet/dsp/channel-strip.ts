import { IsolatorEQ } from './isolator';
import { BiquadFilter } from './biquad-filter';
import { SmoothValue } from './smooth-value';

/**
 * ChannelStrip
 * Represents a single deck's signal chain.
 * Order: Input -> Trim -> Drive -> EQ -> Filter -> Fader
 */
export class ChannelStrip {
    private sampleRate: number;
    
    // Modules
    public eq: IsolatorEQ;
    private filterL: BiquadFilter;
    private filterR: BiquadFilter;
    private faderSmooth: SmoothValue;
    
    // Params
    public trim: number = 1.0;
    public drive: number = 0.0;
    public fader: number = 1.0; // Crossfader/Volume combined
    
    // Filter State
    private filterActive: boolean = false;
    private hpFreq: number = 20;
    private lpFreq: number = 20000;
    private filterRes: number = 0.7;
    
    // DC Blocker State
    private dcPrevInL: number = 0;
    private dcPrevOutL: number = 0;
    private dcPrevInR: number = 0;
    private dcPrevOutR: number = 0;

    constructor(sampleRate: number) {
        this.sampleRate = sampleRate;
        this.eq = new IsolatorEQ(sampleRate);
        this.filterL = new BiquadFilter();
        this.filterR = new BiquadFilter();
        this.faderSmooth = new SmoothValue(1.0, 0.995);
        this.resetFilter();
    }
    
    setTrim(value: number) {
        this.trim = value;
    }
    
    setDrive(value: number) {
        this.drive = value;
    }
    
    setFader(value: number) {
        this.faderSmooth.set(value);
    }
    
    setFilter(hpFreq: number, lpFreq: number, resonance: number) {
        this.hpFreq = hpFreq;
        this.lpFreq = lpFreq;
        this.filterRes = resonance;
        
        // Determine if filters are effectively active
        // HPF > 20Hz or LPF < 20kHz
        const hpActive = this.hpFreq > 30; // some margin
        const lpActive = this.lpFreq < 18000;
        this.filterActive = hpActive || lpActive;
        
        // Note: For simplicity in this specific "Combo Filter" knob design (Bi-Filter),
        // we usually toggle between HPF and LPF mode.
        // Assuming the main processor calculates these freqs.
        
        // Update coefficients immediately? 
        // BiquadFilter update() is cheap.
        if (hpActive) {
            this.filterL.update(this.hpFreq, this.filterRes, this.sampleRate, 'HP');
            this.filterR.update(this.hpFreq, this.filterRes, this.sampleRate, 'HP');
        } else if (lpActive) {
            this.filterL.update(this.lpFreq, this.filterRes, this.sampleRate, 'LP');
            this.filterR.update(this.lpFreq, this.filterRes, this.sampleRate, 'LP');
        }
    }
    
    resetFilter() {
        this.hpFreq = 20;
        this.lpFreq = 22000;
        this.filterActive = false;
        this.filterL.reset();
        this.filterR.reset();
    }

    process(inL: number, inR: number): [number, number] {
        let l = inL;
        let r = inR;

        // 1. Trim
        l *= this.trim;
        r *= this.trim;
        
        // 2. DC Blocker (Essential before non-linearities)
        const l_dc = l - this.dcPrevInL + (0.995 * this.dcPrevOutL);
        this.dcPrevInL = l; this.dcPrevOutL = l_dc; l = l_dc;

        const r_dc = r - this.dcPrevInR + (0.995 * this.dcPrevOutR);
        this.dcPrevInR = r; this.dcPrevOutR = r_dc; r = r_dc;
        
        // 3. Drive (Saturation)
        // Optimized Tanh/Soft-Clip
        if (this.drive > 0) {
            const driveAmount = 1.0 + (this.drive * 4.0);
            // Simple Soft Clip: x / (1 + |x|) or tanh
            // Math.tanh is native code, usually fast enough.
            // For extreme mobile opt, could use polynomial approximation.
            l = Math.tanh(l * driveAmount);
            r = Math.tanh(r * driveAmount);
        }
        
        // 4. EQ (Isolator)
        // Returns tuple [l, r]
        const [eqL, eqR] = this.eq.process(l, r);
        l = eqL;
        r = eqR;
        
        // 5. Filter (Bi-Filter Style)
        if (this.filterActive) {
             // We currently only support one active filter type per bi-filter knob
             // either HPF or LPF. logic handled in setFilter.
             l = this.filterL.process(l);
             r = this.filterR.process(r);
        }
        
        // 6. Fader
        const faderVol = this.faderSmooth.process();
        l *= faderVol;
        r *= faderVol;
        
        return [l, r];
    }
}
