import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('bio-slider')
export class BioSlider extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM for Tailwind
  }

  @property({ type: String }) label = "PARAM";
  @property({ type: Number, reflect: true }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;

  @property({ type: Number }) step = 1;

  @state() private isDragging = false;
  @state() private isHovered = false;

  private handlePointerDown(e: PointerEvent) {
      this.isDragging = true;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      this.updateValue(e);
  }

  private handlePointerMove(e: PointerEvent) {
      if (!this.isDragging) return;
      this.updateValue(e);
  }

  private handlePointerUp(e: PointerEvent) {
      this.isDragging = false;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  private updateValue(e: PointerEvent) {
      const track = this.querySelector('.slider-track') as HTMLElement;
      if (!track) return;

      const rect = track.getBoundingClientRect();
      // Reverse logic: Bottom is 0, Top is 100 (height - y)
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const normalized = 1.0 - (y / rect.height);
      
      let rawVal = normalized * (this.max - this.min) + this.min;
      
      // Quantize to step
      if (this.step > 0) {
          rawVal = Math.round(rawVal / this.step) * this.step;
      }
      
      // Clamp
      const newVal = Math.max(this.min, Math.min(this.max, rawVal));
      
      // Handle precision issues (e.g. 1.000000002)
      const roundedVal = parseFloat(newVal.toFixed(2)); // hardcoded to 2 decimals for now
      
      if (this.value !== roundedVal) {
          this.value = roundedVal;
          this.dispatchEvent(new CustomEvent('change', { 
              detail: this.value,
              bubbles: true,
              composed: true 
          }));
      }
  }

  render() {
    const percentage = ((this.value - this.min) / (this.max - this.min)) * 100;

    return html`
      <div class="flex flex-col items-center h-full min-h-[160px] w-12 group select-none touch-none"
           @mouseenter=${() => this.isHovered = true}
           @mouseleave=${() => this.isHovered = false}>
           
        <!-- LABEL -->
        <div class="text-[10px] font-mono text-zinc-500 mb-2 tracking-wider opacity-60 group-hover:opacity-100 transition-opacity uppercase text-center w-full truncate">
            ${this.label}
        </div>

        <!-- TRACK AREA -->
        <div class="relative flex-grow w-full flex justify-center slider-track cursor-ns-resize py-2"
             @pointerdown="${this.handlePointerDown}"
             @pointermove="${this.handlePointerMove}"
             @pointerup="${this.handlePointerUp}">
             
             <!-- Track Line -->
             <div class="h-full w-[2px] bg-zinc-800 rounded-full bg-opacity-50"></div>

             <!-- Active Fill (Optional, maybe for EQ) -->
             <div class="absolute bottom-2 w-[2px] bg-zinc-600 rounded-full pointer-events-none transition-all duration-75 ease-out"
                  style="height: calc(${percentage}% - 16px);"></div>

             <!-- THUMB (Hidden by default, visible on hover/drag) -->
             <div class="absolute w-8 h-1 bg-zinc-400 group-hover:bg-white rounded-sm shadow-[0_0_10px_rgba(255,255,255,0.5)] pointer-events-none transition-all duration-150 ease-out ${this.isDragging || this.isHovered ? 'scale-110 opacity-100' : 'opacity-0 scale-75'}"
                  style="bottom: calc(${percentage}% - 0.5px);">
             </div>

             <!-- HIT AREA (Invisible, wider) -->
             <div class="absolute inset-0 z-10"></div>
        </div>

        <!-- VALUE -->
        <div class="mt-2 text-[10px] font-mono ${this.isDragging ? 'text-white' : 'text-zinc-600'} transition-colors">
            ${this.value.toString().padStart(3, '0')}
        </div>
      </div>
    `;
  }
}
