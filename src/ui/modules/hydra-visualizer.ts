import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('hydra-visualizer')
export class HydraVisualizer extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

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
    this.canvas = this.querySelector('canvas');
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
      if (!this.canvas) return;
      this.canvas.setPointerCapture(e.pointerId);
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
    
    // Clear
    this.ctx.clearRect(0, 0, w, h);

    // Get Data from Engine
    const engine = (window as any).engine;
    if (!engine || !engine.masterAnalyser) {
        return;
    }

    const spectrum = engine.getSpectrum(this.deckId as 'A' | 'B'); 
    const audioData = engine.getAudioData(); 
    
    // Select Head based on Deck ID
    const isDeckB = this.deckId === 'B';
    const headPos = isDeckB ? engine.getHeadB() : engine.getReadPointer();
    
    // Draw Spectrogram (Behind Waveform)
    this.updateSpectrogram(spectrum);
    this.drawSpectrogram(w, h); 
    
    // Draw Waveform
    const step = Math.ceil(this.zoomScale); 
    
    // Color Palette based on deck
    // Deck A: Tech Cyan (hsl(200, 80%, 60%)) -> rgba(77, 196, 255, 1)
    // Deck B: Signal Emerald (hsl(150, 80%, 40%))? Or maybe kept Red for differentiation?
    // Design spec says "Tech Cyan" is base. But we need to distinguish decks.
    // Let's use Cyan for A, and maybe a Magenta or "Deep Red" for B, or just Emerald for consistency.
    // BIO:GRAM Spec: "Signal Emerald: Emerald-500". "Tech Cyan".
    // Let's use Cyan for A, Emerald for B.
    
    const waveColor = isDeckB ? '#10b981' : '#22d3ee'; 
    this.ctx.strokeStyle = waveColor;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    
    const bufferLen = audioData.length;
    const halfSize = Math.floor(bufferLen / 2);
    const startOffset = isDeckB ? halfSize : 0;
    
    for (let x = 0; x < w; x++) {
        const relativeSampleIndex = (x - w/2) * step; 
        
        let idx = Math.floor(headPos + relativeSampleIndex) % halfSize;
        if (idx < 0) idx += halfSize;
        
        const sample = audioData[startOffset + idx] || 0;
        const y = (h * 0.5) + (sample * (h * 0.4)); // Centered
        
        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    
    // Center Head Line
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#ffffff';
    this.ctx.beginPath();
    this.ctx.moveTo(w/2, 0);
    this.ctx.lineTo(w/2, h);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    
    // Ghost Head
    if (engine && engine.getGhostPointer) {
        const gp = engine.getGhostPointer();
        if (gp >= 0) {
            this.drawHead(w, h, headPos, gp, '#ffffff', 0.5);
        }
    }

    // Spectrum Bars (Overlay)
    const isPlaying = engine.getIsPlaying ? engine.getIsPlaying() : true;
    if (isPlaying) {
        this.drawSpectrum(w, h, spectrum);
    }
    
    // Time & Info
    const totalSamples = w * this.zoomScale;
    const totalTimeSec = totalSamples / 44100;
    const infoEl = this.querySelector('.info-display');
    if (infoEl) {
        infoEl.innerHTML = `
           <div class="flex justify-between w-full">
              <span>BIO_WAVE // ${this.deckId}</span>
              <span>WIN: ${totalTimeSec.toFixed(2)}s</span>
              <span class="${this.isScratching ? 'text-signal-emerald animate-pulse' : ''}">${this.isScratching ? 'SCRATCHING' : 'MONITORING'}</span>
           </div>
        `;
    }

    // Bar Markers
    this.drawBarMarkers(w, h, headPos);

    // Loop Seam
    this.drawHead(w, h, headPos, 0, '#fbbf24', 0.8); // Amber

    // GEN Indicator
    if (this.deckId && engine.isGenerating(this.deckId)) {
       this.drawGenIndicator(w, h);
    }

    // Broadcast
    this.vjChannel.postMessage({ type: 'FRAME', headPos: headPos, spectrum: spectrum });  
  }

  // --- Sub-draw methods ---

  private drawGenIndicator(w: number, h: number) {
      if (!this.ctx) return;
      const now = Date.now();
      if (now % 1000 < 500) {
          this.ctx.fillStyle = '#10b981';
          this.ctx.font = 'bold 12px "JetBrains Mono"';
          this.ctx.textAlign = 'right';
          this.ctx.fillText('GENERATING...', w - 10, 20);
      }
  }

  private updateSpectrogram(spectrum: Uint8Array) {
    const copy = new Uint8Array(spectrum.length);
    copy.set(spectrum);
    this.spectrogramHistory.push(copy);
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
    
    for (let col = 0; col < historyLen; col++) {
      const spectrum = this.spectrogramHistory[col];
      const x = col * colWidth;
      for (let bin = 0; bin < binCount; bin++) {
        const value = spectrum[bin] / 255.0;
        if (value < 0.05) continue; 
        
        // BIO:GRAM Palette: Darker, cleaner
        const alpha = value * 0.5;
        // Cyan-ish tint
        this.ctx.fillStyle = `rgba(34, 211, 238, ${alpha})`; 
        
        const y = h - ((bin + 1) * rowHeight);
        this.ctx.fillRect(x, y, colWidth + 1, rowHeight + 1);
      }
    }
  }

  private drawHead(w: number, h: number, mainHeadPos: number, targetHeadPos: number, color: string, alpha: number) {
      if (!this.ctx) return;
      const step = Math.ceil(this.zoomScale);
      let diff = targetHeadPos - mainHeadPos;
      const bufferLen = (window as any).engine.getBufferSize?.() || 12*1024*1024/4;
      if (diff > bufferLen / 2) diff -= bufferLen;
      if (diff < -bufferLen / 2) diff += bufferLen;
      const x = (w/2) + (diff / step);
      if (x >= 0 && x <= w) {
          this.ctx.strokeStyle = color;
          this.ctx.globalAlpha = alpha;
          this.ctx.lineWidth = 1;
          this.ctx.setLineDash([4, 4]); 
          this.ctx.beginPath();
          this.ctx.moveTo(x, 0);
          this.ctx.lineTo(x, h);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
          this.ctx.globalAlpha = 1.0;
      }
  }

  private drawBarMarkers(w: number, h: number, headPos: number) {
      if (!this.ctx) return;
      const engine = (window as any).engine;
      if (!engine) return;
      const isDeckA = this.deckId === 'A';
      const deckBpm = isDeckA ? engine.bpmA : engine.bpmB;
      const deckOffset = isDeckA ? engine.offsetA : engine.offsetB;
      const bpm = deckBpm || engine.masterBpm || 120;
      const samplesPerBar = (44100 * 60 * 4) / bpm;
      const offsetSamples = (deckOffset || 0) * 44100;
      const step = Math.ceil(this.zoomScale);
      const totalSamplesOnScreen = w * step;
      const barsOnScreen = Math.ceil(totalSamplesOnScreen / samplesPerBar) + 2;
      const n = Math.floor((headPos - offsetSamples) / samplesPerBar);
      const nearestBarSample = offsetSamples + (n * samplesPerBar);
      
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; 
      this.ctx.lineWidth = 1;
      
      for (let i = -barsOnScreen / 2; i <= barsOnScreen / 2; i++) {
          const barSample = nearestBarSample + (i * samplesPerBar);
          const diff = barSample - headPos;
          const x = (w / 2) + (diff / step);
          if (x >= 0 && x <= w) {
              this.ctx.beginPath();
              this.ctx.moveTo(x, 0);
              this.ctx.lineTo(x, h);
              this.ctx.stroke();
          }
      }
  }

  private drawSpectrum(w: number, h: number, spectrum: Uint8Array) {
    if (!this.ctx) return;
    const bands = [40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
    const bandWidth = w / bands.length;
    const nyquist = 22050;
    
    for (let i = 0; i < bands.length; i++) {
        const fc = bands[i];
        const startBin = Math.floor((fc / Math.pow(2, 1/6) / nyquist) * spectrum.length);
        const endBin = Math.floor((fc * Math.pow(2, 1/6) / nyquist) * spectrum.length);
        let sum = 0, count = 0;
        
        for (let j = Math.max(1, startBin); j <= endBin; j++) if(j < spectrum.length) { sum += spectrum[j]; count++; }
        
        const val = (count > 0 ? sum / count : 0) / 255.0;
        const hVal = val * (h * 0.3); 
        const x = i * bandWidth;
        
        this.ctx.fillStyle = `rgba(255, 255, 255, ${0.1 + val * 0.4})`;
        this.ctx.fillRect(x, h - hVal, bandWidth - 1, hVal);
    }
  }

  render() {
    return html`
      <div class="relative w-full h-full bg-deep-void/50 overflow-hidden rounded-lg border border-white/5">
         <!-- Overlay Info -->
         <div class="info-display absolute top-0 left-0 right-0 p-2 text-[10px] font-mono text-zinc-500 bg-black/50 backdrop-blur-sm z-10 flex justify-between border-b border-white/5">
            <span>initializing...</span>
         </div>
         
         <canvas class="block w-full h-full touch-none cursor-crosshair"></canvas>
      </div>
    `;
  }
}
