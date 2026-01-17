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
    // Normalize value to 0-100 range based on max
    const displayValue = Math.round((this.value / this.max) * 100);

    return html`
      <div class="flex flex-col items-center h-full w-full group select-none touch-none"
           @mouseenter=${() => this.isHovered = true}
           @mouseleave=${() => this.isHovered = false}>
           
        <!-- LABEL -->
        <div class="text-[11px] font-mono text-zinc-400 mb-2 tracking-wider opacity-80 group-hover:opacity-100 transition-opacity uppercase text-center w-full truncate font-semibold">
            ${this.label}
        </div>

        <!-- TRACK AREA -->
        <div class="relative flex-grow w-full flex justify-center slider-track cursor-ns-resize py-2"
             @pointerdown="${this.handlePointerDown}"
             @pointermove="${this.handlePointerMove}"
             @pointerup="${this.handlePointerUp}">
             
             <!-- Track Line -->
             <div class="h-full w-[3px] bg-zinc-700/60 rounded-full"></div>

             <!-- Active Fill -->
             <div class="absolute bottom-2 w-[3px] bg-gradient-to-t from-zinc-500 to-zinc-400 rounded-full pointer-events-none transition-all duration-75 ease-out shadow-[0_0_6px_rgba(161,161,170,0.4)]"
                  style="height: calc(${percentage}% - 16px);"></div>

             <!-- THUMB (Always visible with glow) -->
             <div class="absolute w-8 h-1.5 bg-zinc-300 rounded-sm pointer-events-none transition-all duration-100 ease-out ${this.isDragging ? 'bg-white shadow-[0_0_12px_rgba(255,255,255,0.8)] scale-110' : this.isHovered ? 'bg-zinc-200 shadow-[0_0_8px_rgba(255,255,255,0.5)]' : 'shadow-[0_0_4px_rgba(255,255,255,0.3)]'}"
                  style="bottom: calc(${percentage}% - 3px);">
             </div>

             <!-- HIT AREA (Invisible, wider) -->
             <div class="absolute inset-0 z-10"></div>
        </div>

        <!-- VALUE -->
        <div class="slider-value mt-2 text-[14px] ${this.isDragging ? 'text-white' : 'text-zinc-400'} transition-colors">
            ${displayValue.toString().padStart(3, '0')}
        </div>
      </div>
    `;
  }
}
