import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('hydra-visualizer')
export class HydraVisualizer extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  @property({ type: String }) deckId = 'A';
  @property({ type: Object }) sab: SharedArrayBuffer | null = null;
  @property({ type: String }) currentPrompt = ''; // Prompt to display on waveform
  
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
  
  // Performance: Cached ImageData for spectrogram
  private spectrogramImageData: ImageData | null = null;
  
  // Performance: Cached DOM state to avoid unnecessary updates
  private lastInfoState = { isGenerating: false, isScratching: false, totalTimeSec: 0 };

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
              // Dispatch UI sync event to update deck controller
              window.dispatchEvent(new CustomEvent('deck-play-sync', { 
                  detail: { deck: this.deckId, playing: true }
              }));
          } else {
              engine.updateDspParam('SCRATCH_SPEED', 0.0, this.deckId as 'A'|'B');
              // Ensure we stay stopped, forcing Engine to Stopped state
              engine.setTapeStop(this.deckId as 'A'|'B', true);
              // Dispatch UI sync event to update deck controller
              window.dispatchEvent(new CustomEvent('deck-play-sync', { 
                  detail: { deck: this.deckId, playing: false }
              }));
          }
      }
  }

  public clear() {
      if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      // Reset Spectrogram
      if(this.spectrogramHistory) {
        for (let i = 0; i < this.spectrogramHistory.length; i++) {
          if (this.spectrogramHistory[i]) this.spectrogramHistory[i].fill(0);
        }
      }
      this.zoomScale = 1.0; 
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

    let spectrum = engine.getSpectrum(this.deckId as 'A' | 'B'); 
    
    // User requested to NOT hide spectrum.
    // DC Offset/Low Freq visual will be fixed in Audio Processor via DC Blocker.

    const audioData = engine.getAudioData(); 
    
    // Select Head based on Deck ID
    const isDeckB = this.deckId === 'B';
    let headPos = isDeckB ? engine.getHeadB() : engine.getReadPointer();
    
    // Latency Compensation
    // headPos is where the processor IS. Output is where the speaker WAS.
    // robust visual sync: subtract output latency
    const latencySec = engine.getOutputLatency ? engine.getOutputLatency() : 0.0;
    const latencySamples = Math.floor(latencySec * 44100);
    headPos -= latencySamples;
    
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
    
     // Time & Info (Performance: Only update DOM when state changes)
     const totalSamples = w * this.zoomScale;
     const totalTimeSec = Math.round(totalSamples / 44100 * 100) / 100; // Round to 2 decimals
     const infoEl = this.querySelector('.info-display');
     
     // Check GEN Status
     const isGenerating = engine.isGenerating(this.deckId) && (Date.now() % 1000 < 500); // Blink
     
     // Performance: Only update DOM if state actually changed
     const stateChanged = 
       this.lastInfoState.isGenerating !== isGenerating ||
       this.lastInfoState.isScratching !== this.isScratching ||
       Math.abs(this.lastInfoState.totalTimeSec - totalTimeSec) > 0.5; // Only update time display when significant
     
     if (infoEl && stateChanged) {
         this.lastInfoState = { isGenerating, isScratching: this.isScratching, totalTimeSec };
         infoEl.innerHTML = `
            <span>WIN: ${totalTimeSec.toFixed(2)}s</span>
            ${isGenerating ? '<span class="text-signal-emerald">GENERATING</span>' : ''}
         `;
     }

    // Bar Markers
    this.drawBarMarkers(w, h, headPos);

    // Loop Seam
    this.drawHead(w, h, headPos, 0, '#fbbf24', 0.8); // Amber

    // GEN Indicator (Moved to HTML Overlay)
    // if (this.deckId && engine.isGenerating(this.deckId)) {
    //    this.drawGenIndicator(w, h);
    // }

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
    
    // Performance: Use ImageData for batch pixel manipulation instead of fillRect
    const imgW = Math.floor(w);
    const imgH = Math.floor(h);
    
    // Create or resize ImageData cache
    if (!this.spectrogramImageData || 
        this.spectrogramImageData.width !== imgW || 
        this.spectrogramImageData.height !== imgH) {
      this.spectrogramImageData = this.ctx.createImageData(imgW, imgH);
    }
    
    const data = this.spectrogramImageData.data;
    
    // Clear to transparent
    data.fill(0);
    
    const historyLen = this.spectrogramHistory.length;
    const colWidth = imgW / this.spectrogramWidth;
    
    // Logarithmic Y-axis setup
    const minFreq = 20;
    const maxFreq = 22050;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const scale = (logMax - logMin) / imgH;
    const totalBins = this.spectrogramHistory[0].length;
    const freqPerBin = maxFreq / totalBins;

    // Pre-calculate bin mappings (cache for performance)
    const binMappings: { startBin: number; endBin: number }[] = new Array(imgH);
    for (let row = 0; row < imgH; row++) {
      const fStart = Math.pow(10, logMin + row * scale);
      const fEnd = Math.pow(10, logMin + (row + 1) * scale);
      let startBin = Math.floor(fStart / freqPerBin);
      let endBin = Math.floor(fEnd / freqPerBin);
      if (startBin < 0) startBin = 0;
      if (endBin >= totalBins) endBin = totalBins - 1;
      if (startBin > endBin) startBin = endBin;
      binMappings[row] = { startBin, endBin };
    }

    for (let col = 0; col < historyLen; col++) {
      const spectrum = this.spectrogramHistory[col];
      const xStart = Math.floor(col * colWidth);
      const xEnd = Math.floor((col + 1) * colWidth);
      
      for (let row = 0; row < imgH; row++) {
        const { startBin, endBin } = binMappings[row];
        
        let value = 0;
        if (endBin === startBin) {
          value = spectrum[startBin];
        } else {
          // Max pool
          let max = 0;
          for (let b = startBin; b <= endBin; b++) {
            if (spectrum[b] > max) max = spectrum[b];
          }
          value = max;
        }
        
        if (value < 5) continue;
        
        const alpha = Math.floor((value / 255.0) * 204); // 0.8 * 255 = 204
        const y = imgH - 1 - row;
        
        // Draw pixels for this cell
        for (let x = xStart; x < xEnd && x < imgW; x++) {
          const idx = (y * imgW + x) * 4;
          // Dark gray color: rgb(60, 60, 60)
          data[idx] = 60;      // R
          data[idx + 1] = 60;  // G
          data[idx + 2] = 60;  // B
          data[idx + 3] = alpha; // A
        }
      }
    }
    
    this.ctx.putImageData(this.spectrogramImageData, 0, 0);
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
    // Adjusted bands: Removed 40Hz (often empty), Added more mid-high detail
    // 60, 100, 160, 250, 400, 630, 1k, 1.6k, 2.5k, 4k, 6.3k, 10k, 16k
    const bands = [60, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000];
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
    // Display full prompt text, wrap to multiple lines
    const promptColor = this.deckId === 'A' ? 'text-tech-cyan/60' : 'text-signal-emerald/60';
    
    return html`
      <div class="relative w-full h-full bg-deep-void/50 overflow-hidden rounded-lg border border-white/5">
         <div class="info-display absolute top-0 left-0 right-0 p-2 text-[10px] font-mono text-zinc-500 bg-black/50 backdrop-blur-sm z-10 flex justify-between border-b border-white/5">
            <span></span>
         </div>
         
         <canvas class="block w-full h-full touch-none cursor-crosshair"></canvas>
         
         <!-- Prompt Display Overlay -->
         ${this.currentPrompt ? html`
           <div class="absolute bottom-0 left-0 right-0 px-3 py-2 bg-gradient-to-t from-black/70 via-black/40 to-transparent pointer-events-none">
             <div class="${promptColor} text-[12px] font-mono leading-relaxed tracking-wide select-none whitespace-pre-wrap">
               ${this.currentPrompt}
             </div>
           </div>
         ` : ''}
      </div>
    `;
  }
}
