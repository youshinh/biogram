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

  // 係数更新 (High Pass)
  update(cutoff: number, q: number, sampleRate: number) {
    // 不安定にならないよう制限
    const frequency = Math.max(20, Math.min(cutoff, sampleRate / 2.1));
    const omega = 2 * Math.PI * frequency / sampleRate;
    const alpha = Math.sin(omega) / (2 * q);
    const cos = Math.cos(omega);

    const a0 = 1 + alpha;
    
    // HPF Coefficients
    this.b0 = (1 + cos) / 2 / a0;
    this.b1 = -(1 + cos) / a0;
    this.b2 = (1 + cos) / 2 / a0;
    this.a1 = (-2 * cos) / a0;
    this.a2 = (1 - alpha) / a0;
    
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
