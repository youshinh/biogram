import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('hydra-visualizer')
export class HydraVisualizer extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }
    canvas {
      width: 100%;
      height: 100%;
      display: block;
      background: var(--bg-color);
    }
    .overlay {
        position: absolute;
        top: 0; left: 0; right: 0;
        display: flex;
        justify-content: space-between;
        padding: 4px;
        font-size: 0.6rem;
        border-bottom: 1px solid rgba(255,255,255,0.2);
        background: rgba(0,0,0,0.5);
    }
  `;

  @property({ type: Object }) sab: SharedArrayBuffer | null = null;
  
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationId: number = 0;
  private vjChannel: BroadcastChannel = new BroadcastChannel('vj_link');

  // Scratch Interaction State
  private isScratching = false;
  private wasPlaying = false;
  private lastX = 0;
  
  // Zoom State (Samples per pixel)
  // Default: ~300 samples/px (At 1000px width -> 300k samples ~ 6-7 seconds)
  private zoomScale = 100; 

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector('canvas');
    if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        
        // Interaction Listeners
        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointerleave', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        
        // Resize observer
        new ResizeObserver(() => {
            if(this.canvas) {
                this.canvas.width = this.canvas.clientWidth;
                this.canvas.height = this.canvas.clientHeight;
            }
        }).observe(this.canvas);
        
        this.runLoop();
    }
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      cancelAnimationFrame(this.animationId);
      this.vjChannel.close();
      if (this.canvas) {
          this.canvas.removeEventListener('pointerdown', this.onPointerDown);
          this.canvas.removeEventListener('pointermove', this.onPointerMove);
          this.canvas.removeEventListener('pointerup', this.onPointerUp);
          this.canvas.removeEventListener('pointerleave', this.onPointerUp);
          this.canvas.removeEventListener('wheel', this.onWheel);
      }
  }

  // --- Interaction Handlers ---
  private onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Zoom In/Out
      // DeltaY > 0 : Zoom Out (See more) -> Increase Scale
      // DeltaY < 0 : Zoom In (See less) -> Decrease Scale
      
      const zoomFactor = 1.1;
      if (e.deltaY > 0) {
          this.zoomScale *= zoomFactor;
      } else {
          this.zoomScale /= zoomFactor;
      }
      
      // Clamp
      // Min: 1 sample/px (Ultra Zoom)
      // Max: 5000 samples/px (Full buffer view approx)
      this.zoomScale = Math.max(1, Math.min(this.zoomScale, 5000));
  }

  private onPointerDown = (e: PointerEvent) => {
      this.canvas?.setPointerCapture(e.pointerId);
      this.isScratching = true;
      this.lastX = e.clientX;
      
      const engine = (window as any).engine;
      if(engine) {
          this.wasPlaying = engine.getIsPlaying();
          // Always stop tape physics (motor) when touching vinyl
          engine.updateDspParam('SPEED', 0.0);
      }
  }

  private onPointerMove = (e: PointerEvent) => {
      if (!this.isScratching) return;
      
      const deltaX = e.clientX - this.lastX;
      this.lastX = e.clientX;
      
      // Map pixel delta to Speed. 
      // Right = Forward, Left = Backward.
      // User Request: Invert direction (Pulling right = Rewind?)
      const speed = deltaX * -0.15; 
      
      const engine = (window as any).engine;
      if(engine) engine.updateDspParam('SPEED', speed);
  }

  private onPointerUp = (e: PointerEvent) => {
      if (!this.isScratching) return;
      this.canvas?.releasePointerCapture(e.pointerId);
      this.isScratching = false;
      
      const engine = (window as any).engine;
      if(engine) {
          // Resume ONLY if it was playing before scratch
          if (this.wasPlaying) {
              engine.updateDspParam('SPEED', 1.0);
          } else {
              // Ensure it stays stopped (Speed 0 or Tape Stop?)
              // Speed 0 maintains the physics state but zero velocity.
              engine.updateDspParam('SPEED', 0.0);
          }
      }
  }

  private runLoop = () => {
    this.animationId = requestAnimationFrame(this.runLoop);
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Get Data from Engine
    const engine = (window as any).engine;
    if (!engine || !engine.analyser) {
        // Fallback / Loading
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0,0,w,h);
        return;
    }

    const spectrum = engine.getSpectrum(); // Uint8Array(128)
    const audioData = engine.getAudioData(); // Float32Array (SAB)
    const headPos = engine.getReadPointer(); // Int index
    const velocity = engine.getTapeSpeed ? Math.abs(engine.getTapeSpeed()) : 1.0;
    const isStopped = velocity < 0.01;

    // 1. Clear
    this.ctx.clearRect(0, 0, w, h); 
    
    // If stopped, force silence in visualization
    // (Actual buffer might have DC offset, we don't want to show it)
    if (isStopped) {
         // Optionally draw a "PAUSED" line or just nothing
         return; 
    }

    // 2. Draw Waveform (Windowed centered on Head)
    // Scale = samples per pixel.
    const step = Math.ceil(this.zoomScale); 
    
    this.ctx.strokeStyle = '#00ff88'; // "Bio" Green
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    const bufferLen = audioData.length;
    const writePos = engine.getWritePointer ? engine.getWritePointer() : Number.MAX_SAFE_INTEGER;
    
    for (let x = 0; x < w; x++) {
        // Calculate sample index relative to head
        // Center of screen (x = w/2) is HEAD position
        const relativeSampleIndex = (x - w/2) * step; 
        
        const linearIndex = Math.floor(headPos + relativeSampleIndex);
        let sample = 0;

        // Linear Masking: Only show valid data range [0, writePos]
        if (linearIndex >= 0 && linearIndex < writePos) {
            let actualIndex = linearIndex % bufferLen;
            // Handle javascript negative modulo quirk just in case, though linearIndex >= 0 prevents it here
            if (actualIndex < 0) actualIndex += bufferLen; 
            
            sample = audioData[actualIndex];
        } else {
            // Out of bounds (Past before 0, or Future after Write)
            sample = 0;
        }

        // Scale -1..1 to 0..h
        const y = (h * 0.4) + (sample * (h * 0.3)); // Shift up slightly to leave room for spectrum
        
        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    
    // 3. Draw Heads (Hydra)
    
    // Head C (Ghost/Cloud) - Purple
    const headCPos = engine.getHeadC();
    this.drawHead(w, h, headPos, headCPos, '#bd00ff', 1);

    // Head B (Slice) - Cyan
    const headBPos = engine.getHeadB();
    this.drawHead(w, h, headPos, headBPos, '#00ffff', 1);

    // Head A (Live) - Red (Main)
    this.ctx.strokeStyle = '#ff0055';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(w/2, 0);
    this.ctx.lineTo(w/2, h);
    this.ctx.stroke();

    // 4. Draw Spectrum (1/3 Octave Bands, Reduced Lo-End)
    // Removed 20, 25, 31.5 to reduce low-end clutter
    const bands = [
        40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 
        800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000
    ];
    
    // Reserve bottom space for labels
    const labelHeight = 14;
    const chartHeight = h - labelHeight; 

    const nyquist = 22050;
    const bandWidth = w / bands.length;
    const gap = 1;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    this.ctx.font = '9px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    for (let i = 0; i < bands.length; i++) {
        const fc = bands[i];
        
        // 1/3 Octave Limits
        const fMin = fc / Math.pow(2, 1/6);
        const fMax = fc * Math.pow(2, 1/6);
        
        const startBin = Math.floor((fMin / nyquist) * spectrum.length);
        const endBin = Math.floor((fMax / nyquist) * spectrum.length);
        
        // Sum Energies
        let sum = 0;
        let count = 0;
        
        // Ensure we check at least one bin (or interpolating point)
        const iStart = Math.max(1, startBin); // Skip DC
        const iEnd = Math.max(iStart, endBin);
        
        for (let j = iStart; j <= iEnd; j++) {
            if (j < spectrum.length) {
               sum += spectrum[j];
               count++;
            }
        }
        
        let avg = count > 0 ? sum / count : 0;
        
        // Normalize 0..1
        let val = avg / 255.0;
        
        // Apply Pink Noise Compensation (Tilt)
        const p = i / bands.length;
        const weight = 0.5 + (0.9 * p); // Range 0.5 .. 1.4
        val *= weight;
        
        // Draw Bar
        const hVal = Math.min(1.0, val) * (chartHeight * 0.5); // Max 50% of chart area
        const x = i * bandWidth;
        
        // Color: Transparent Light Gray, Brighter (more opaque) = Higher Energy
        const alpha = 0.2 + (val * 0.8); 
        this.ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`; 
        
        // Draw from chartHeight upwards
        this.ctx.fillRect(x, chartHeight - hVal, bandWidth - gap, hVal);
        
        // Labels for key bands (Below bars)
        if ([50, 100, 200, 500, 1000, 2000, 5000, 10000].includes(fc)) {
             this.ctx.fillStyle = 'rgba(255,255,255,0.6)';
             const label = fc >= 1000 ? (fc/1000) + 'k' : fc;
             this.ctx.fillText(String(label), x + bandWidth/2, chartHeight + (labelHeight/2));
             // Optional tick?
             // this.ctx.fillRect(x + bandWidth/2, chartHeight, 1, 2);
        }
    }
    
    // Calculate Window Time for UI
    // Total samples shown = w * zoomScale
    // Time = Samples / 44100
    const totalSamples = w * this.zoomScale;
    const totalTimeSec = totalSamples / 44100;
    
    this.shadowRoot!.querySelector('.time-scale')!.textContent = `WINDOW: ${totalTimeSec.toFixed(2)}s`;

    // Broadcast state to VJ window
    this.vjChannel.postMessage({ type: 'FRAME', headPos: headPos, spectrum: spectrum }); 
  }

  private drawHead(w: number, h: number, mainHeadPos: number, targetHeadPos: number, color: string, alpha: number) {
      if (!this.ctx) return;
      
      const step = Math.ceil(this.zoomScale);
      
      // Calculate screen X relative to Main Head (Center)
      // relativeSamples = target - main
      let diff = targetHeadPos - mainHeadPos;
      const bufferLen = (window as any).engine.getBufferSize?.() || 12*1024*1024/4;
      
      // Shortest path wrapping
      if (diff > bufferLen / 2) diff -= bufferLen;
      if (diff < -bufferLen / 2) diff += bufferLen;
      
      // x = center + (diff / scale)
      const x = (w/2) + (diff / step);
      
      if (x >= 0 && x <= w) {
          this.ctx.strokeStyle = color;
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([4, 4]); // Dashed for Ghosts
          this.ctx.beginPath();
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x, h);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
      }
  }

  render() {
    return html`
      <div class="overlay">
        <span>BIO_WAVEFORM</span>
        <span class="time-scale">WINDOW: 1.0s</span>
        <span>${this.isScratching ? 'SCRATCH_MODE' : 'PLAY_MODE'}</span>
      </div>
      <canvas style="touch-action: none;"></canvas>
    `;
  }
}
