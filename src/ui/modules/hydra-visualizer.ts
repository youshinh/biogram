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

  @property({ type: String }) deckId = 'A';
  @property({ type: Object }) sab: SharedArrayBuffer | null = null;
  
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationId: number = 0;
  private vjChannel: BroadcastChannel = new BroadcastChannel('vj_link');

  // Interaction State
  private isScratching = false;
  private wasPlaying = false;
  private lastX = 0;
  
  // Zoom State
  private zoomScale = 100; 
  
  // Spectrogram History
  private spectrogramHistory: Uint8Array[] = [];
  private spectrogramWidth = 256; // History depth (columns) 

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
      const zoomFactor = 1.1;
      if (e.deltaY > 0) this.zoomScale *= zoomFactor;
      else this.zoomScale /= zoomFactor;
      this.zoomScale = Math.max(1, Math.min(this.zoomScale, 5000));
  }

  private onPointerDown = (e: PointerEvent) => {
      this.canvas?.setPointerCapture(e.pointerId);
      this.isScratching = true;
      this.lastX = e.clientX;
      const engine = (window as any).engine;
      if(engine) {
          this.wasPlaying = engine.getIsPlaying();
          engine.updateDspParam('SCRATCH_SPEED', 0.0, this.deckId as 'A'|'B');
      }
  }

  private onPointerMove = (e: PointerEvent) => {
      if (!this.isScratching) return;
      const deltaX = e.clientX - this.lastX;
      this.lastX = e.clientX;
      const speed = deltaX * -0.15; 
      const engine = (window as any).engine;
      // Invert Logic?
      if(engine) engine.updateDspParam('SCRATCH_SPEED', speed, this.deckId as 'A'|'B');
  }

  private onPointerUp = (e: PointerEvent) => {
      if (!this.isScratching) return;
      this.canvas?.releasePointerCapture(e.pointerId);
      this.isScratching = false;
      const engine = (window as any).engine;
      if(engine) {
          if (this.wasPlaying) {
              engine.updateDspParam('SPEED', 1.0, this.deckId as 'A'|'B');
          } else {
              engine.updateDspParam('SCRATCH_SPEED', 0.0, this.deckId as 'A'|'B');
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
    if (!engine || !engine.masterAnalyser) {
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0,0,w,h);
        return;
    }

    const spectrum = engine.getSpectrum(this.deckId as 'A' | 'B'); 
    const audioData = engine.getAudioData(); 
    
    // Select Head based on Deck ID
    const isDeckB = this.deckId === 'B';
    const headPos = isDeckB ? engine.getHeadB() : engine.getReadPointer();
    
    // Ghost Logic
    // Read Shared Ghost Pointer (Global)
    // If SAB available
    let ghostPos = -1;
    if (this.sab) {
        // Direct read via Int32 View if helper unavailable?
        // engine has `headerView`.
        // Let's assume engine getter.
        if (engine.getGhostPointer) ghostPos = engine.getGhostPointer(); // Need to add to engine?
        // Fallback: Read manually if needed, but Engine wrapper is safer.
        // Actually, Engine class needs `getGhostPointer`. I'll assume I add it or read directly.
        // Let's rely on Engine method update.
    }
    
    // Check pause state (Global for now)
    const isPlaying = engine.getIsPlaying ? engine.getIsPlaying() : true;

    // 1. Clear
    this.ctx.clearRect(0, 0, w, h);
    
    // 1.5 Update and Draw Spectrogram (Behind Waveform)
    this.updateSpectrogram(spectrum);
    this.drawSpectrogram(w, h); 
    
    // 2. Draw Waveform (Windowed centered on Head)
    const step = Math.ceil(this.zoomScale); 
    
    this.ctx.strokeStyle = isDeckB ? '#ff0000' : '#00ffff'; // Red (B) or Cyan (A)
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    
    const bufferLen = audioData.length;
    const halfSize = Math.floor(bufferLen / 2);
    const startOffset = isDeckB ? halfSize : 0;
    
    // Draw
    for (let x = 0; x < w; x++) {
        const relativeSampleIndex = (x - w/2) * step; 
        
        // Wrap within Half Size
        let idx = Math.floor(headPos + relativeSampleIndex) % halfSize;
        if (idx < 0) idx += halfSize;
        
        // Access Data with Offset
        const sample = audioData[startOffset + idx] || 0;

        const y = (h * 0.4) + (sample * (h * 0.3)); 
        
        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    
    // 3. Draw Heads (Hydra)
    // MAIN HEAD (Center Line)
    this.ctx.strokeStyle = '#ffffff'; // Solid White
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(w/2, 0);
    this.ctx.lineTo(w/2, h);
    this.ctx.stroke();
    
    // Ghost Head
    if (engine && engine.getGhostPointer) {
        const gp = engine.getGhostPointer();
        if (gp >= 0) {
            // Only draw if within reasonable distance?
            // Or just draw relative to Main.
            this.drawHead(w, h, headPos, gp, '#ffffff', 0.8);
        }
    }
    
    // ... Spectrum (Keep as is, it visualizes Master Output)


    // 4. Draw Spectrum (1/3 Octave Bands, Reduced Lo-End)
    // Only draw if playing to avoid stuck ghost spectrum
    if (isPlaying) {
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
    } // End if (isPlaying)
    
    // Calculate Window Time for UI
    // Total samples shown = w * zoomScale
    // Time = Samples / 44100
    const totalSamples = w * this.zoomScale;
    const totalTimeSec = totalSamples / 44100;
    
    this.shadowRoot!.querySelector('.time-scale')!.textContent = `WINDOW: ${totalTimeSec.toFixed(2)}s`;

    // 5. Bar Markers (1 bar = 4 beats)
    this.drawBarMarkers(w, h, headPos);

    // 6. Loop Seam (Start/End of Ring Buffer)
    // Draw a line at Index 0 relative to current position to show the "Seam"
    this.drawHead(w, h, headPos, 0, '#ffff00', 0.5); // Yellow Line for Seam

    // 6. GEN Indicator (Flashing)
    if (this.deckId && engine.isGenerating(this.deckId)) {
        const now = Date.now();
        if (now % 1000 < 500) { // 500ms Flash
            this.ctx.fillStyle = '#00ff00';
            this.ctx.font = 'bold 24px monospace';
            this.ctx.textAlign = 'right';
            this.ctx.fillText('GEN', w - 10, 30);
        }
    }

    // Broadcast state to VJ window
    this.vjChannel.postMessage({ type: 'FRAME', headPos: headPos, spectrum: spectrum });  
  }

  // --- Spectrogram Methods ---
  private updateSpectrogram(spectrum: Uint8Array) {
    // Add current spectrum to history (rightmost column)
    const copy = new Uint8Array(spectrum.length);
    copy.set(spectrum);
    this.spectrogramHistory.push(copy);
    
    // Limit history size
    while (this.spectrogramHistory.length > this.spectrogramWidth) {
      this.spectrogramHistory.shift();
    }
  }

  private drawSpectrogram(w: number, h: number) {
    if (!this.ctx || this.spectrogramHistory.length === 0) return;
    
    const historyLen = this.spectrogramHistory.length;
    const binCount = this.spectrogramHistory[0].length;
    
    const colWidth = w / this.spectrogramWidth;
    const rowHeight = h / binCount;
    
    // Draw from left (oldest) to right (newest)
    for (let col = 0; col < historyLen; col++) {
      const spectrum = this.spectrogramHistory[col];
      const x = col * colWidth;
      
      for (let bin = 0; bin < binCount; bin++) {
        const value = spectrum[bin] / 255.0; // Normalize 0..1
        if (value < 0.05) continue; // Skip very quiet bins
        
        // Map frequency bin to color (Bass=Red, Mid=Purple, Treble=Blue)
        const freqRatio = bin / binCount;
        const color = this.frequencyToColor(freqRatio, value);
        
        // Y: Low frequencies at bottom, high at top
        const y = h - ((bin + 1) * rowHeight);
        
        this.ctx.fillStyle = color;
        this.ctx.fillRect(x, y, colWidth + 1, rowHeight + 1);
      }
    }
  }

  private frequencyToColor(freqRatio: number, intensity: number): string {
    // freqRatio: 0 = lowest, 1 = highest
    // Color mapping: Red (low) -> Purple (mid) -> Blue (high)
    let r: number, g: number, b: number;
    
    if (freqRatio < 0.33) {
      // Bass: Red to Orange-Red
      r = 255;
      g = Math.floor(freqRatio * 3 * 100); // 0..100
      b = 50;
    } else if (freqRatio < 0.66) {
      // Mid: Purple-Magenta
      const t = (freqRatio - 0.33) / 0.33;
      r = Math.floor(255 - t * 100); // 255..155
      g = Math.floor(50 * (1 - t));    // 50..0
      b = Math.floor(100 + t * 155);   // 100..255
    } else {
      // Treble: Blue
      const t = (freqRatio - 0.66) / 0.34;
      r = Math.floor(155 - t * 155); // 155..0
      g = Math.floor(t * 100);         // 0..100
      b = 255;
    }
    
    // Apply intensity as alpha
    const alpha = 0.2 + (intensity * 0.6); // Range 0.2..0.8
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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

  private drawBarMarkers(w: number, h: number, headPos: number) {
      if (!this.ctx) return;
      
      const engine = (window as any).engine;
      if (!engine) return;
      
      // Get BPM & Offset from engine
      // Assuming engine tracks bpmA/bpmB separately?
      // For Master View, usually use Master BPM. 
      // But for Deck View, ideally use Deck's BPM grid.
      // Let's use Deck BPM if available to show "Track Grid"
      
      const isDeckA = this.deckId === 'A';
      const deckBpm = isDeckA ? engine.bpmA : engine.bpmB;
      const deckOffset = isDeckA ? engine.offsetA : engine.offsetB;
      
      const bpm = deckBpm || engine.masterBpm || 120;
      const sampleRate = 44100;
      
      // Samples per bar (1 bar = 4 beats)
      const samplesPerBar = (sampleRate * 60 * 4) / bpm;
      const offsetSamples = (deckOffset || 0) * sampleRate;
      
      const step = Math.ceil(this.zoomScale);
      
      // Calculate how many bars fit on screen
      const totalSamplesOnScreen = w * step;
      const barsOnScreen = Math.ceil(totalSamplesOnScreen / samplesPerBar) + 2;
      
      // Find the nearest bar boundary relative to headPos (shifted by offset)
      // T_bar = Offset + n * BarLen
      // n = floor((Head - Offset) / BarLen)
      const n = Math.floor((headPos - offsetSamples) / samplesPerBar);
      const nearestBarSample = offsetSamples + (n * samplesPerBar);
      
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; // Brighter
      this.ctx.lineWidth = 1;
      this.ctx.setLineDash([2, 6]);
      
      // Draw bars
      for (let i = -barsOnScreen / 2; i <= barsOnScreen / 2; i++) {
          const barSample = nearestBarSample + (i * samplesPerBar);
          const diff = barSample - headPos;
          const x = (w / 2) + (diff / step);
          
          if (x >= 0 && x <= w) {
              this.ctx.beginPath();
              this.ctx.moveTo(x, 0);
              this.ctx.lineTo(x, h);
              this.ctx.stroke();
              
              // Bar Number (Relative)
              // this.ctx.fillStyle = '#aaa';
              // this.ctx.fillText(`${n+i}`, x + 4, 10);
          }
      }
      
      this.ctx.setLineDash([]);
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
