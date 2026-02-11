import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { AudioEngine } from '../../audio/engine';

@customElement('hydra-visualizer')
export class HydraVisualizer extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  @property({ type: String }) deckId = 'A';
  @property({ type: Object }) sab: SharedArrayBuffer | null = null;
  @property({ type: String }) currentPrompt = ''; 
  
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationId: number = 0;
  private vjChannel: BroadcastChannel = new BroadcastChannel('vj_link');
  private resizeObserver: ResizeObserver | null = null;
  private lastCanvasWidth = 0;
  private lastCanvasHeight = 0;

  // Interaction State
  private isScratching = false;
  private wasPlaying = false;
  private lastX = 0;
  private clickStartX = 0;
  private hasDragged = false;
  private activeTouchPointers = new Map<number, { x: number; y: number }>();
  private isPinching = false;
  private pinchStartDistance = 0;
  private pinchStartZoom = 100;
  
  // Zoom State
  private zoomScale = 100; 
  private lastStableZoom = 100;
  private static zoomByDeck: Record<string, number> = {};
  
  // Spectrogram History
  private spectrogramHistory: Uint8Array[] = [];
  private spectrogramWidth = 256; 
  
  // Performance: Cached ImageData
  private spectrogramImageData: ImageData | null = null;
  
  // Performance: Cached DOM state
  private lastInfoState = { isGenerating: false, isScratching: false, totalTimeSec: 0 };

  // LOOP STATE
  @state() private isLoopMode = false;
  @state() private loopStart: number | null = null;
  @state() private loopEnd: number | null = null;
  @state() private loopCrossfadeVal = 0; 
  @state() private loopCount = -1; 
  @state() private hasLoopConfigured = false;

  private getEngine(): AudioEngine | null {
      return window.engine ?? null;
  }

  private getCurrentDeck(): 'A' | 'B' {
      return this.deckId === 'B' ? 'B' : 'A';
  }

  private getSampleRate(engine?: AudioEngine | null): number {
      return engine?.getSampleRate?.() || 48000;
  }

  private projectToNearestCycle(anchor: number, reference: number, cycle: number): number {
      if (!Number.isFinite(cycle) || cycle <= 0) return anchor;
      const k = Math.round((reference - anchor) / cycle);
      return anchor + (k * cycle);
  }

  firstUpdated() {
    this.canvas = this.querySelector('canvas');
    if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        this.applyCanvasSize(this.canvas.clientWidth, this.canvas.clientHeight, true);
        
        // Restore previous zoom for this deck if available.
        // This prevents GEN/reset flows from collapsing the window scale.
        const savedZoom = HydraVisualizer.zoomByDeck[this.deckId];
        if (savedZoom && Number.isFinite(savedZoom)) {
            this.zoomScale = savedZoom;
            this.lastStableZoom = savedZoom;
        } else {
            // Initial Zoom to 16 seconds
            const initialWidth = this.canvas.clientWidth;
            if (initialWidth > 0) {
                const sampleRate = this.getSampleRate(this.getEngine());
                this.zoomScale = (16 * sampleRate) / initialWidth;
                this.lastStableZoom = this.zoomScale;
            }
            HydraVisualizer.zoomByDeck[this.deckId] = this.zoomScale;
        }

        this.canvas.addEventListener('pointerdown', this.onPointerDown);
        this.canvas.addEventListener('pointermove', this.onPointerMove);
        this.canvas.addEventListener('pointerup', this.onPointerUp);
        this.canvas.addEventListener('pointerleave', this.onPointerUp);
        this.canvas.addEventListener('pointercancel', this.onPointerUp);
        this.canvas.addEventListener('wheel', this.onWheel, { passive: false });
        
        this.resizeObserver = new ResizeObserver((entries) => {
            const entry = entries[0];
            if (!entry) return;
            this.applyCanvasSize(entry.contentRect.width, entry.contentRect.height);
        });
        this.resizeObserver.observe(this.canvas);
        
        this.runLoop();
    }
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      HydraVisualizer.zoomByDeck[this.deckId] = this.zoomScale;
      cancelAnimationFrame(this.animationId);
      this.vjChannel.close();
      if (this.resizeObserver) {
          this.resizeObserver.disconnect();
          this.resizeObserver = null;
      }
      if (this.canvas) {
          this.canvas.removeEventListener('pointerdown', this.onPointerDown);
          this.canvas.removeEventListener('pointermove', this.onPointerMove);
          this.canvas.removeEventListener('pointerup', this.onPointerUp);
          this.canvas.removeEventListener('pointerleave', this.onPointerUp);
          this.canvas.removeEventListener('pointercancel', this.onPointerUp);
          this.canvas.removeEventListener('wheel', this.onWheel);
      }
  }

  private getTouchDistance(): number {
      const pts = Array.from(this.activeTouchPointers.values());
      if (pts.length < 2) return 0;
      const dx = pts[0].x - pts[1].x;
      const dy = pts[0].y - pts[1].y;
      return Math.hypot(dx, dy);
  }

  private applyCanvasSize(width: number, height: number, force = false) {
      if (!this.canvas) return;
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;
      if (width <= 0 || height <= 0) return;

      // Ignore transient tiny sizes during GEN/render churn.
      // Keep the last known good canvas size to avoid WIN collapsing to ~0s.
      const hasStableSize = this.lastCanvasWidth > 0 && this.lastCanvasHeight > 0;
      const isTinyTransient = width < 100 || height < 40;
      if (!force && hasStableSize && isTinyTransient) return;

      const nextW = Math.round(width);
      const nextH = Math.round(height);
      if (nextW <= 0 || nextH <= 0) return;

      this.canvas.width = nextW;
      this.canvas.height = nextH;
      this.lastCanvasWidth = nextW;
      this.lastCanvasHeight = nextH;
  }

  // --- LOOP LOGIC ---

  private toggleLoopMode() {
      this.isLoopMode = !this.isLoopMode;
      if (!this.isLoopMode) {
          this.hasLoopConfigured = false;
          const engine = this.getEngine();
          if (engine) engine.setLoop(this.getCurrentDeck(), 0, 0, 0, -1, false);
      }
  }
  
  private onLoopIconClick(e: Event) {
      e.stopPropagation();
      this.toggleLoopMode();
  }

  private setLoopPoint(sampleIndex: number) {
      if (!this.isLoopMode) return;
      
      const engine = this.getEngine();
      if (!engine) return;
      
      const isDeckA = this.deckId === 'A';
      const deckBpm = isDeckA ? engine.bpmA : engine.bpmB;
      const deckOffset = isDeckA ? engine.offsetA : engine.offsetB;
      const bpm = deckBpm || engine.masterBpm || 120;
      const sampleRate = this.getSampleRate(engine);
      const samplesPerBar = (sampleRate * 60 * 4) / bpm;
      const offsetSamples = (deckOffset || 0) * sampleRate;
      
      const n = Math.round((sampleIndex - offsetSamples) / samplesPerBar);
      const quantizedSample = Math.floor(offsetSamples + (n * samplesPerBar));
      
      if (this.loopStart === null) {
          this.loopStart = quantizedSample;
          this.loopEnd = null;
          this.hasLoopConfigured = false; 
      } else if (this.loopEnd === null) {
          if (quantizedSample < this.loopStart) {
              this.loopEnd = this.loopStart;
              this.loopStart = quantizedSample;
          } else {
              this.loopEnd = quantizedSample;
          }
          this.updateEngineLoop();
      } else {
          this.loopStart = quantizedSample;
          this.loopEnd = null;
          this.hasLoopConfigured = false;
          engine.setLoop(this.getCurrentDeck(), 0, 0, 0, -1, false);
      }
      this.requestUpdate();
  }
  
  private updateEngineLoop() {
      const engine = this.getEngine();
      if (!engine || this.loopStart === null || this.loopEnd === null) return;
      
      const isDeckA = this.deckId === 'A';
      const deckBpm = isDeckA ? engine.bpmA : engine.bpmB;
      const bpm = deckBpm || engine.masterBpm || 120;
      const sampleRate = this.getSampleRate(engine);
      const samplesPerBeat = (sampleRate * 60) / Math.max(1, bpm);
      const fadeSamples = this.loopCrossfadeVal > 0
          ? Math.floor(Math.max(sampleRate * 0.02, samplesPerBeat * 0.5))
          : 0;
      
      this.hasLoopConfigured = true;
      engine.setLoop(
          this.getCurrentDeck(), 
          this.loopStart, 
          this.loopEnd, 
          fadeSamples, 
          this.loopCount, 
          true
      );
  }

  // --- Handlers ---

  private onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.1;
      if (e.deltaY > 0) this.zoomScale *= zoomFactor;
      else this.zoomScale /= zoomFactor;
      this.zoomScale = Math.max(1, Math.min(this.zoomScale, 5000));
      this.lastStableZoom = this.zoomScale;
      HydraVisualizer.zoomByDeck[this.deckId] = this.zoomScale;
  }

  private onPointerDown = (e: PointerEvent) => {
      if (!this.canvas) return;
      if (e.pointerType === 'touch') {
          this.activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
          if (this.activeTouchPointers.size >= 2) {
              this.isPinching = true;
              this.pinchStartDistance = this.getTouchDistance();
              this.pinchStartZoom = this.zoomScale;
              this.isScratching = false;
              return;
          }
      } else {
          this.canvas.setPointerCapture(e.pointerId);
      }
      
      if (this.isLoopMode) {
           const rect = this.canvas.getBoundingClientRect();
           const x = e.clientX - rect.left;
           const w = rect.width;
           const step = Math.ceil(this.zoomScale);
           const engine = this.getEngine();
           if (!engine) return;
           const headPos = this.deckId === 'B' ? engine.getHeadB() : engine.getReadPointer();
           
           const center = w / 2;
           const diffPixels = x - center;
           const diffSamples = diffPixels * step;
           const targetPos = headPos + diffSamples;
           
           this.setLoopPoint(targetPos);
           return; 
      }
      
      this.isScratching = true;
      this.lastX = e.clientX;
      this.clickStartX = e.clientX;
      this.hasDragged = false;
      const engine = this.getEngine();
      
      if(engine) {
          this.wasPlaying = !engine.isDeckStopped(this.getCurrentDeck());
          engine.updateDspParam('SCRATCH_SPEED', 0.0, this.getCurrentDeck());
      }
  }

  private onPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && this.activeTouchPointers.has(e.pointerId)) {
          this.activeTouchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (this.isPinching) {
          const distance = this.getTouchDistance();
          if (distance > 0 && this.pinchStartDistance > 0) {
              const ratio = distance / this.pinchStartDistance;
              this.zoomScale = Math.max(1, Math.min(this.pinchStartZoom / ratio, 5000));
              this.lastStableZoom = this.zoomScale;
              HydraVisualizer.zoomByDeck[this.deckId] = this.zoomScale;
          }
          e.preventDefault();
          return;
      }

      if (!this.isScratching) return;
      
      if (Math.abs(e.clientX - this.clickStartX) > 5) {
          this.hasDragged = true;
      }

      const deltaX = e.clientX - this.lastX;
      this.lastX = e.clientX;
      const speed = deltaX * -0.1; 
      const engine = this.getEngine();
      if(engine) engine.updateDspParam('SCRATCH_SPEED', speed, this.getCurrentDeck());
  }

  private onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') {
          this.activeTouchPointers.delete(e.pointerId);
          if (this.isPinching && this.activeTouchPointers.size < 2) {
              this.isPinching = false;
              this.pinchStartDistance = 0;
              return;
          }
      }

      if (!this.isScratching) return;
      if (e.pointerType !== 'touch') {
          this.canvas?.releasePointerCapture(e.pointerId);
      }
      this.isScratching = false;
      const engine = this.getEngine();
      if(engine) {
          if (this.wasPlaying) {
              engine.updateDspParam('SPEED', 1.0, this.getCurrentDeck());
              window.dispatchEvent(new CustomEvent('deck-play-sync', { 
                  detail: { deck: this.deckId, playing: true }
              }));
          } else {
              engine.updateDspParam('SCRATCH_SPEED', 0.0, this.getCurrentDeck());
              engine.setTapeStop(this.getCurrentDeck(), true);
              window.dispatchEvent(new CustomEvent('deck-play-sync', { 
                  detail: { deck: this.deckId, playing: false }
              }));
              
              if (!this.hasDragged) {
                   const rect = this.canvas!.getBoundingClientRect();
                   const x = e.clientX - rect.left;
                   const w = rect.width;
                   
                   const step = Math.ceil(this.zoomScale);
                   const headPos = this.deckId === 'B' ? engine.getHeadB() : engine.getReadPointer();
                   
                   const center = w / 2;
                   const diffPixels = x - center;
                   const diffSamples = diffPixels * step;
                   
                   let targetPos = headPos + diffSamples;
                   engine.skipToPosition(this.deckId, Math.floor(targetPos));
              }
          }
      }
  }

  public clear() {
      const keepZoom = this.zoomScale;
      if (this.ctx && this.canvas) {
          this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      if(this.spectrogramHistory) {
        for (let i = 0; i < this.spectrogramHistory.length; i++) {
          if (this.spectrogramHistory[i]) this.spectrogramHistory[i].fill(0);
        }
      }
      // Keep current zoom/time window. GEN reset should not change user-selected scale.
      this.zoomScale = keepZoom;
      this.lastStableZoom = keepZoom;
      HydraVisualizer.zoomByDeck[this.deckId] = this.zoomScale;
  }

  private runLoop = () => {
    this.animationId = requestAnimationFrame(this.runLoop);
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // Guard: Skip rendering if canvas has no size (mobile layout transition)
    if (w <= 0 || h <= 0) return;

    // Guard: if GEN/reset flow accidentally collapses scale, restore last known value.
    if (this.zoomScale <= 1.001) {
      const savedZoom = HydraVisualizer.zoomByDeck[this.deckId];
      const fallbackZoom = savedZoom && savedZoom > 1.001 ? savedZoom : this.lastStableZoom;
      if (fallbackZoom > 1.001) {
        this.zoomScale = fallbackZoom;
      }
    } else {
      this.lastStableZoom = this.zoomScale;
      HydraVisualizer.zoomByDeck[this.deckId] = this.zoomScale;
    }
    
    this.ctx.clearRect(0, 0, w, h);

    const engine = this.getEngine();
    if (!engine || !engine.masterAnalyser) {
        return;
    }

    let spectrum = engine.getSpectrum(this.getCurrentDeck()); 
    const audioData = engine.getAudioData(); 
    
    const isDeckB = this.deckId === 'B';
    let headPos = isDeckB ? engine.getHeadB() : engine.getReadPointer();
    
    const latencySec = engine.getOutputLatency ? engine.getOutputLatency() : 0.0;
    const sampleRate = this.getSampleRate(engine);
    const latencySamples = Math.floor(latencySec * sampleRate);
    
    // FIX: Only compensate latency when playing to avoid jitter when stopped
    if (!engine.isDeckStopped(this.getCurrentDeck())) {
        headPos -= latencySamples;
    }
    
    this.updateSpectrogram(spectrum);
    this.drawSpectrogram(w, h); 
    
    // Draw Waveform
    const step = Math.ceil(this.zoomScale); 
    const waveColor = isDeckB ? '#10b981' : '#22d3ee'; 
    this.ctx.strokeStyle = waveColor;
    this.ctx.lineWidth = 1.5;
    this.ctx.beginPath();
    
    const bufferLen = audioData.length;
    const halfSize = Math.floor(bufferLen / 2);
    const maxFrames = Math.floor(halfSize / 2);
    const startOffset = isDeckB ? halfSize : 0;
    
    for (let x = 0; x < w; x++) {
        // step is frames-per-pixel
        const relativeFrameIndex = (x - w/2) * step; 
        
        let frameIdx = Math.floor(headPos + relativeFrameIndex) % maxFrames;
        if (frameIdx < 0) frameIdx += maxFrames;
        
        // Frames -> Sample Index (Stereo Interleaved)
        const sampleIdx = frameIdx * 2;
        
        const sample = audioData[startOffset + sampleIdx] || 0;
        const y = (h * 0.5) + (sample * (h * 0.4)); 
        
        if (x === 0) this.ctx.moveTo(x, y);
        else this.ctx.lineTo(x, y);
    }
    this.ctx.stroke();
    
    // Center Head
    this.ctx.strokeStyle = '#ffffff';
    this.ctx.lineWidth = 2;
    this.ctx.shadowBlur = 10;
    this.ctx.shadowColor = '#ffffff';
    this.ctx.beginPath();
    this.ctx.moveTo(w/2, 0);
    this.ctx.lineTo(w/2, h);
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
    
    // Ghost
    if (engine && engine.getGhostPointer) {
        const gp = engine.getGhostPointer();
        if (gp >= 0) {
            this.drawHead(w, h, headPos, gp, '#ffffff', 0.5);
        }
    }

    // Spectrum Bars
    const isPlaying = engine.getIsPlaying ? engine.getIsPlaying() : true;
    if (isPlaying) {
        this.drawSpectrum(w, h, spectrum);
    }
    
     // Performance: DOM Updates
     const totalSamples = w * this.zoomScale;
     const totalTimeSec = Math.round((totalSamples / sampleRate) * 100) / 100;
     const infoEl = this.querySelector('.info-display');
     const isGenerating = engine.isGenerating(this.getCurrentDeck()) && (Date.now() % 1000 < 500);
     
     const stateChanged = 
       this.lastInfoState.isGenerating !== isGenerating ||
       this.lastInfoState.isScratching !== this.isScratching ||
       Math.abs(this.lastInfoState.totalTimeSec - totalTimeSec) > 0.5;
     
     if (infoEl && stateChanged) {
         this.lastInfoState = { isGenerating, isScratching: this.isScratching, totalTimeSec };
         infoEl.innerHTML = `
            <span>WIN: ${totalTimeSec.toFixed(2)}s</span>
            ${isGenerating ? '<span class="text-signal-emerald">GENERATING</span>' : ''}
         `;
     }

    this.drawBarMarkers(w, h, headPos);
    
    // NEW: Draw Loop Region
    this.drawLoopRegion(w, h, headPos);

    this.vjChannel.postMessage({ type: 'FRAME', headPos: headPos, spectrum: spectrum });  
  }

  // --- Sub-draw methods ---
  
  private drawLoopRegion(w: number, h: number, headPos: number) {
      if ((!this.isLoopMode && !this.hasLoopConfigured) || this.loopStart === null) return;
      if (!this.ctx) return;
      
      const step = Math.ceil(this.zoomScale);
      
      const drawMarker = (pos: number, label: string) => {
          const diff = pos - headPos;
          const x = (w/2) + (diff / step);
          if (x >= -50 && x <= w + 50) {
              this.ctx!.strokeStyle = '#fbbf24'; 
              this.ctx!.lineWidth = 2;
              this.ctx!.beginPath();
              this.ctx!.moveTo(x, 0);
              this.ctx!.lineTo(x, h);
              this.ctx!.stroke();
              
              this.ctx!.fillStyle = '#fbbf24';
              this.ctx!.font = '10px monospace';
              this.ctx!.fillText(label, x + 4, 12);
          }
          return x;
      };

      let startX = drawMarker(this.loopStart, 'START');
      let endX = -9999;
      
      if (this.loopEnd !== null) {
          endX = drawMarker(this.loopEnd, 'END');
          
          const l = Math.min(startX, endX);
          const r = Math.max(startX, endX);
          const rW = r - l;
          
          if (rW > 0) {
              this.ctx.fillStyle = 'rgba(255, 255, 255, 0.15)'; 
              this.ctx.fillRect(l, 0, rW, h);
          }
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
    
    const imgW = Math.floor(w);
    const imgH = Math.floor(h);
    
    // Guard: Prevent createImageData with zero dimensions
    if (imgW <= 0 || imgH <= 0) return;
    
    if (!this.spectrogramImageData || 
        this.spectrogramImageData.width !== imgW || 
        this.spectrogramImageData.height !== imgH) {
      this.spectrogramImageData = this.ctx.createImageData(imgW, imgH);
    }
    
    const data = this.spectrogramImageData.data;
    data.fill(0);
    
    const historyLen = this.spectrogramHistory.length;
    const colWidth = imgW / this.spectrogramWidth;
    
    const minFreq = 20;
    const maxFreq = 22050;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);
    const scale = (logMax - logMin) / imgH;
    const totalBins = this.spectrogramHistory[0].length;
    const freqPerBin = maxFreq / totalBins;

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
          let max = 0;
          for (let b = startBin; b <= endBin; b++) {
            if (spectrum[b] > max) max = spectrum[b];
          }
          value = max;
        }
        
        if (value < 5) continue;
        
        const alpha = Math.floor((value / 255.0) * 204); 
        const y = imgH - 1 - row;
        
        for (let x = xStart; x < xEnd && x < imgW; x++) {
          const idx = (y * imgW + x) * 4;
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
      
      const engine = this.getEngine();
      if (!engine) return;
      const bufferLen = engine.getAudioData().length;
      const maxFrames = Math.floor(bufferLen / 4); // Total samples / 4 (2 decks * 2 channels)
      
      if (diff > maxFrames / 2) diff -= maxFrames;
      if (diff < -maxFrames / 2) diff += maxFrames;
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
      const engine = this.getEngine();
      if (!engine) return;
      const isDeckA = this.deckId === 'A';
      const deckBpm = isDeckA ? engine.bpmA : engine.bpmB;
      const deckOffset = isDeckA ? engine.offsetA : engine.offsetB;
      const bpm = deckBpm || engine.masterBpm || 120;
      const sampleRate = this.getSampleRate(engine);
      const samplesPerBar = (sampleRate * 60 * 4) / bpm;
      const offsetSamples = (deckOffset || 0) * sampleRate;
      const step = Math.ceil(this.zoomScale);
      const totalSamplesOnScreen = w * step;
      const barsOnScreen = Math.ceil(totalSamplesOnScreen / samplesPerBar) + 2;
      const n = Math.floor((headPos - offsetSamples) / samplesPerBar);
      const nearestBarSample = offsetSamples + (n * samplesPerBar);

      const audioData = engine.getAudioData();
      const ringFrames = Math.max(1, Math.floor(audioData.length / 4));
      const deckStartFrame = engine.getDeckTrackStartFrame(this.getCurrentDeck());
      const hasTrackStart = deckStartFrame !== null && Number.isFinite(deckStartFrame);
      const projectedTrackStart = hasTrackStart
          ? this.projectToNearestCycle(deckStartFrame as number, headPos, ringFrames)
          : null;

      const hasLoopStart = this.loopStart !== null;
      const loopStartSample = this.loopStart ?? 0;
      const loopStartTolerance = Math.max(4, samplesPerBar * 0.015);
      
      for (let i = -barsOnScreen / 2; i <= barsOnScreen / 2; i++) {
          const barSample = nearestBarSample + (i * samplesPerBar);
          const diff = barSample - headPos;
          const x = (w / 2) + (diff / step);
          if (x >= 0 && x <= w) {
              const isLoopStartBar =
                  hasLoopStart && Math.abs(barSample - loopStartSample) <= loopStartTolerance;
              if (isLoopStartBar) {
                  this.ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
                  this.ctx.lineWidth = 2;
              } else {
                  this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
                  this.ctx.lineWidth = 1;
              }
              this.ctx.beginPath();
              this.ctx.moveTo(x, 0);
              this.ctx.lineTo(x, h);
              this.ctx.stroke();
          }
      }

      if (projectedTrackStart !== null) {
          const trackStartX = (w / 2) + ((projectedTrackStart - headPos) / step);
          if (trackStartX >= 0 && trackStartX <= w) {
              this.ctx.strokeStyle = 'rgba(16, 185, 129, 0.95)';
              this.ctx.lineWidth = 2;
              this.ctx.beginPath();
              this.ctx.moveTo(trackStartX, 0);
              this.ctx.lineTo(trackStartX, h);
              this.ctx.stroke();

              const labelX = Math.min(Math.max(trackStartX + 6, 6), Math.max(6, w - 110));
              const labelY = 58; // Keep clearly below top overlays.
              this.ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
              this.ctx.fillRect(labelX - 4, labelY - 12, 78, 16);
              this.ctx.fillStyle = 'rgba(16, 185, 129, 0.98)';
              this.ctx.font = '10px monospace';
              this.ctx.fillText('GEN START', labelX, labelY);
          }
      }
  }

  private drawSpectrum(w: number, h: number, spectrum: Uint8Array) {
    if (!this.ctx) return;
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
    const promptColor = this.deckId === 'A' ? 'text-tech-cyan/60' : 'text-signal-emerald/60';
    
    return html`
      <div class="relative w-full h-full bg-deep-void/50 overflow-hidden rounded-lg border border-white/5">
         
         <div class="absolute top-2 right-2 z-20 flex gap-2">
             <button class="w-8 h-8 flex items-center justify-center rounded bg-black/50 border border-white/10 hover:bg-white/10 ${this.isLoopMode ? 'text-amber-400 border-amber-400' : 'text-zinc-500'}"
                     @click="${this.onLoopIconClick}">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                   <path d="M17 2l4 4-4 4" />
                   <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                   <path d="M7 22l-4-4 4-4" />
                   <path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
             </button>
         </div>

         ${this.isLoopMode ? html`
             <div class="absolute top-12 right-2 z-20 p-3 bg-zinc-900/90 backdrop-blur border border-zinc-700 rounded shadow-xl w-48 text-[10px]">
                 <div class="flex justify-between mb-2">
                    <span class="text-amber-400 font-bold">LOOP EDIT</span>
                    <button class="text-zinc-500 hover:text-white" @click="${() => this.isLoopMode = false}">×</button>
                 </div>
                 
                 <div class="mb-2">
                     <label class="block text-zinc-500 mb-1">CROSSFADE</label>
                     <div class="flex gap-2">
                         <button class="flex-1 py-1 rounded border border-zinc-700 ${this.loopCrossfadeVal === 0 ? 'bg-amber-900/50 border-amber-500/50 text-white' : 'bg-transparent text-zinc-400'}"
                                 @click="${() => { this.loopCrossfadeVal = 0; this.updateEngineLoop(); }}">OFF</button>
                         <button class="flex-1 py-1 rounded border border-zinc-700 ${this.loopCrossfadeVal > 0 ? 'bg-amber-900/50 border-amber-500/50 text-white' : 'bg-transparent text-zinc-400'}"
                                 @click="${() => { this.loopCrossfadeVal = 1; this.updateEngineLoop(); }}">ON</button>
                     </div>
                 </div>

                 <div class="mb-2">
                     <label class="block text-zinc-500 mb-1">COUNT</label>
                     <div class="flex gap-2">
                         <button class="flex-1 py-1 rounded border border-zinc-700 ${this.loopCount === -1 ? 'bg-amber-900/50 border-amber-500/50 text-white' : 'bg-transparent text-zinc-400'}"
                                 @click="${() => { this.loopCount = -1; this.updateEngineLoop(); }}">∞</button>
                         <input type="number" class="w-12 bg-black border border-zinc-700 rounded text-center text-white" 
                                .value="${this.loopCount === -1 ? '' : this.loopCount}"
                                placeholder="#"
                                @change="${(e: any) => { 
                                   const val = parseInt(e.target.value);
                                   this.loopCount = isNaN(val) ? -1 : val;
                                   this.updateEngineLoop();
                                }}" />
                     </div>
                 </div>
                 
                 <div class="text-zinc-500 italic mt-2 text-[9px]">
                    ${this.loopStart === null ? 'Click waveform to set Start' : 
                      this.loopEnd === null ? 'Click waveform to set End' : 'Loop Active'}
                 </div>
             </div>
         ` : ''}

         <div class="info-display absolute top-0 left-0 right-12 p-2 text-[10px] font-mono text-zinc-500 bg-black/50 backdrop-blur-sm z-10 flex justify-between border-b border-white/5 pointer-events-none">
            <span></span>
         </div>
         
         <canvas class="block w-full h-full touch-none cursor-crosshair"></canvas>
         
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
