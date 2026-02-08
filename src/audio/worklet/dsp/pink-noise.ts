export class PinkNoise {
  private b0: number = 0;
  private b1: number = 0;
  private b2: number = 0;
  private b3: number = 0;
  private b4: number = 0;
  private b5: number = 0;
  private b6: number = 0;

  // -1.0 〜 1.0 のピンクノイズを出力
  process(): number {
    const white = Math.random() * 2 - 1;
    
    this.b0 = 0.99886 * this.b0 + white * 0.0555179;
    this.b1 = 0.99332 * this.b1 + white * 0.0750759;
    this.b2 = 0.96900 * this.b2 + white * 0.1538520;
    this.b3 = 0.86650 * this.b3 + white * 0.3104856;
    this.b4 = 0.55000 * this.b4 + white * 0.5329522;
    this.b5 = -0.7616 * this.b5 - white * 0.0168980;
    
    const pink = this.b0 + this.b1 + this.b2 + this.b3 + this.b4 + this.b5 + this.b6 + white * 0.5362;
    this.b6 = white * 0.115926;
    
    // おおよそ -1.0 〜 1.0 に収まるよう正規化（少し余裕を持たせる）
    return pink * 0.11; 
  }
}
