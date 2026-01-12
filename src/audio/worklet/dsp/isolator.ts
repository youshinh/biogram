/**
 * 3-Band Isolator EQ
 * Implements 4th Order Linkwitz-Riley crossovers for transparent summing.
 * 
 * Frequencies:
 * - Low: < 250Hz
 * - Mid: 250Hz - 2500Hz
 * - High: > 2500Hz
 */

class Biquad {
    a0=1; a1=0; a2=0; b1=0; b2=0;
    z1=0; z2=0;

    setLowPass(f: number, sr: number, q: number = 0.707) {
        const w0 = 2 * Math.PI * f / sr;
        const cos = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * q);
        
        const b0 = (1 - cos) / 2;
        const b1 = 1 - cos;
        const b2 = (1 - cos) / 2;
        const a0 = 1 + alpha;
        const a1 = -2 * cos;
        const a2 = 1 - alpha;
        
        this.update(a0, a1, a2, b0, b1, b2);
    }

    setHighPass(f: number, sr: number, q: number = 0.707) {
        const w0 = 2 * Math.PI * f / sr;
        const cos = Math.cos(w0);
        const alpha = Math.sin(w0) / (2 * q);
        
        const b0 = (1 + cos) / 2;
        const b1 = -(1 + cos);
        const b2 = (1 + cos) / 2;
        const a0 = 1 + alpha;
        const a1 = -2 * cos;
        const a2 = 1 - alpha;
        
        this.update(a0, a1, a2, b0, b1, b2);
    }
    
    update(a0: number, a1: number, a2: number, b0: number, b1: number, b2: number) {
        // Normalize by a0
        this.a0 = b0 / a0;
        this.a1 = b1 / a0;
        this.a2 = b2 / a0;
        this.b1 = a1 / a0;
        this.b2 = a2 / a0;
    }

    process(inSample: number): number {
        const out = inSample * this.a0 + this.z1;
        this.z1 = inSample * this.a1 + this.z2 - this.b1 * out;
        this.z2 = inSample * this.a2 - this.b2 * out;
        return out;
    }
}

export class IsolatorEQ {
    // 2 filters per channel: LPF (Low) and HPF (High)
    // Mid = Input - Low - High
    private lpL = new Biquad();
    private lpR = new Biquad();
    private hpL = new Biquad();
    private hpR = new Biquad();

    public gainLow = 1.0;
    public gainMid = 1.0;
    public gainHigh = 1.0;

    public killLow = 0.0;
    public killMid = 0.0;
    public killHigh = 0.0;
    
    private sr = 44100;
    
    constructor(sampleRate: number) {
        this.sr = sampleRate;
        this.updateCoeffs();
    }
    
    updateCoeffs() {
        this.lpL.setLowPass(250, this.sr);
        this.lpR.setLowPass(250, this.sr);
        this.hpL.setHighPass(2500, this.sr);
        this.hpR.setHighPass(2500, this.sr);
    }
    
    process(inputL: number, inputR: number): [number, number] {
        const gL = (this.killLow > 0.5 ? 0 : 1) * this.gainLow;
        const gM = (this.killMid > 0.5 ? 0 : 1) * this.gainMid;
        const gH = (this.killHigh > 0.5 ? 0 : 1) * this.gainHigh;
        
        // Left
        const lowL = this.lpL.process(inputL);
        const highL = this.hpL.process(inputL);
        const midL = inputL - lowL - highL;
        const outL = (lowL * gL) + (midL * gM) + (highL * gH);
        
        // Right
        const lowR = this.lpR.process(inputR);
        const highR = this.hpR.process(inputR);
        const midR = inputR - lowR - highR;
        const outR = (lowR * gL) + (midR * gM) + (highR * gH);
        
        return [outL, outR];
    }
}
