export class BiquadFilter {
  // 状態変数
  private x1: number = 0;
  private x2: number = 0;
  private y1: number = 0;
  private y2: number = 0;
  
  // 係数
  private b0: number = 0;
  private b1: number = 0;
  private b2: number = 0;
  private a1: number = 0;
  private a2: number = 0;
  private q: number = 0.7;

  // 係数更新
  update(cutoff: number, q: number, sampleRate: number, type: 'LP'|'HP'|'LS'|'HS', dbGain: number = 0) {
    // 安定性のための制限
    const frequency = Math.max(20, Math.min(cutoff, sampleRate / 2.1));
    const omega = 2 * Math.PI * frequency / sampleRate;
    const sin = Math.sin(omega);
    const cos = Math.cos(omega);
    
    // Q to Alpha
    const alpha = sin / (2 * q);
    
    // For Shelving
    const A = Math.pow(10, dbGain / 40);
    const S = 1; // Shelf Slope 1 is steep enough
    // Alpha for shelf (Slope based) - usually slightly different but using Q-based alpha for consistency or simple formula
    // RBJ: alpha = sin(w0)/2 * sqrt( (A + 1/A)*(1/S - 1) + 2 )
    // Let's stick to standard Q-based for simple peak/pass filters. 
    // For Shelf, we usually use S. Let's use simplified alpha for shelf if needed or just use Q=0.707
    const beta = Math.sqrt(A) / q; // alternative shelf param?
    
    let a0 = 1, a1 = 0, a2 = 0, b0 = 1, b1 = 0, b2 = 0;

    switch (type) {
        case 'LP':
            a0 = 1 + alpha;
            b0 = (1 - cos) / 2;
            b1 = 1 - cos;
            b2 = (1 - cos) / 2;
            a1 = -2 * cos;
            a2 = 1 - alpha;
            break;
            
        case 'HP':
            a0 = 1 + alpha;
            b0 = (1 + cos) / 2;
            b1 = -(1 + cos);
            b2 = (1 + cos) / 2;
            a1 = -2 * cos;
            a2 = 1 - alpha;
            break;

        case 'LS': // Low Shelf
            // alpha for shelf should ideally use S, but here we reuse 'alpha' var calculated with Q
            // It works reasonably well as a shape control.
            // RBJ LowShelf:
            // b0 =    A*( (A+1) - (A-1)*cos + 2*sqrt(A)*alpha )
            const sqrtA_alpha = 2 * Math.sqrt(A) * alpha;
            b0 =     A * ((A + 1) - (A - 1) * cos + sqrtA_alpha);
            b1 = 2 * A * ((A - 1) - (A + 1) * cos);
            b2 =     A * ((A + 1) - (A - 1) * cos - sqrtA_alpha);
            a0 =         (A + 1) + (A - 1) * cos + sqrtA_alpha;
            a1 =    -2 * ((A - 1) + (A + 1) * cos);
            a2 =         (A + 1) + (A - 1) * cos - sqrtA_alpha;
            break;

        case 'HS': // High Shelf
            const sqrtA_alpha_hs = 2 * Math.sqrt(A) * alpha;
            b0 =     A * ((A + 1) + (A - 1) * cos + sqrtA_alpha_hs);
            b1 = -2 * A * ((A - 1) + (A + 1) * cos);
            b2 =     A * ((A + 1) + (A - 1) * cos - sqrtA_alpha_hs);
            a0 =         (A + 1) - (A - 1) * cos + sqrtA_alpha_hs;
            a1 =     2 * ((A - 1) - (A + 1) * cos);
            a2 =         (A + 1) - (A - 1) * cos - sqrtA_alpha_hs;
            break;
    }

    // Normalize
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = a1 / a0;
    this.a2 = a2 / a0;
    
    this.q = q;
  }

  process(input: number): number {
    const output = this.b0 * input + this.b1 * this.x1 + this.b2 * this.x2 
                   - this.a1 * this.y1 - this.a2 * this.y2;
    
    // 状態更新
    this.x2 = this.x1;
    this.x1 = input;
    this.y2 = this.y1;
    this.y1 = output;

    return output;
  }

  isResonant(): boolean {
      return this.q > 0.71; 
  }
}
