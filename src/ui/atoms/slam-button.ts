import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('slam-button')
export class SlamButton extends LitElement {
  createRenderRoot() {
    return this;
  }

  @state() private isActive = false;

  private handleClick = (e: MouseEvent) => {
    // Toggle active state
    this.isActive = !this.isActive;
    
    if (this.isActive) {
      // Dispatch start event with center of button as default position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.dispatchEvent(new CustomEvent('slam-start', {
        bubbles: true,
        composed: true,
        detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }));
    } else {
      // Dispatch end event
      this.dispatchEvent(new CustomEvent('slam-end', {
        bubbles: true,
        composed: true
      }));
    }
  };

  render() {
    return html`
      <button
        class="group relative w-full h-full min-h-[80px] overflow-hidden border border-zinc-800 bg-black/40 backdrop-blur-sm transition-all duration-200 hover:border-zinc-500 hover:bg-zinc-900 focus:outline-none ${this.isActive ? 'border-white bg-white/10' : ''}"
        @pointerdown=${this.handlePointerDown}
        @pointermove=${this.handlePointerMove}
        @pointerup=${this.handlePointerUp}
        @pointerget=${this.handlePointerUp}
        @pointercancel=${this.handlePointerUp}
      >
        <!-- Background Grid Pattern -->
        <div class="absolute inset-0 opacity-10 pointer-events-none" 
             style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 8px 8px;">
        </div>

        <!-- Active Border Glow -->
        <div class="absolute inset-0 transition-opacity duration-300 pointer-events-none ${this.isActive ? 'opacity-100 shadow-[inset_0_0_20px_rgba(255,255,255,0.2)]' : 'opacity-0'}"></div>

        <!-- Content (Label) -->
        <div class="relative z-10 flex flex-col items-center justify-center gap-1 transition-transform duration-100 active:scale-95 pointer-events-none select-none">
             <div class="text-xl font-bold tracking-widest text-zinc-300 group-hover:text-white transition-colors uppercase">
                ${this.isActive ? 'ACTIVE' : 'SLAM'}
             </div>
             <div class="text-[0.6rem] font-mono tracking-[0.2em] text-zinc-600 group-hover:text-signal-emerald transition-colors uppercase">
                ${this.isActive ? 'ENERGY RISER' : 'HOLD TO RISE'}
             </div>
        </div>
        
        <!-- XY Visualizer Dot -->
        ${this.isActive ? html`
            <div class="absolute w-4 h-4 rounded-full bg-signal-emerald shadow-[0_0_15px_#10b981] pointer-events-none transform -translate-x-1/2 -translate-y-1/2"
                 style="left: ${this.x * 100}%; top: ${this.y * 100}%;">
            </div>
            <div class="absolute w-[1px] h-full bg-signal-emerald/20 pointer-events-none" style="left: ${this.x * 100}%;"></div>
            <div class="absolute h-[1px] w-full bg-signal-emerald/20 pointer-events-none" style="top: ${this.y * 100}%;"></div>
        ` : ''}
      </button>
    `;
  }
  
  @state() private x = 0.5;
  @state() private y = 0.5;

  private handlePointerDown = (e: PointerEvent) => {
    e.preventDefault(); // Prevent scrolling on touch
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    this.isActive = true;
    this.updateXY(e);
    
    // Dispatch Start
    this.dispatchEvent(new CustomEvent('slam-start', {
        bubbles: true,
        composed: true,
        detail: { x: (e.currentTarget as HTMLElement).getBoundingClientRect().left + (e.currentTarget as HTMLElement).offsetWidth/2, y: 0 } 
        // Note: main.ts calculates relative X/Y from this event, so we can just send the event.
        // But main.ts logic uses e.detail.x/y.
        // Let's pass the raw event coordinates for consistency with main.ts existing logic, 
        // OR update main.ts to rely on our normalized X/Y?
        // Existing main.ts: `updateSlamParams` takes normalized X/Y from `handleSlamMove`.
        // `handleSlamMove` in main.ts calculates normalized X/Y from `e.detail`.
        // We should send `e.clientX` / `e.clientY` in detail if we want main.ts to calculate, 
        // OR we just dispatch 'slam-move' with normalized X/Y if main.ts supports it?
        // Main.ts: `handleSlamMove` expects `e.detail` to have x,y (screen coords).
        // Let's send screen coords.
    }));
    
    // Trigger initial move
    this.dispatchEvent(new CustomEvent('slam-move', {
        bubbles: true,
        composed: true,
        detail: { x: e.clientX, y: e.clientY }
    }));
  };

  private handlePointerMove = (e: PointerEvent) => {
      if (!this.isActive) return;
      e.preventDefault();
      this.updateXY(e);
      
      this.dispatchEvent(new CustomEvent('slam-move', {
          bubbles: true,
          composed: true,
          detail: { x: e.clientX, y: e.clientY }
      }));
  };

  private handlePointerUp = (e: PointerEvent) => {
      if (!this.isActive) return;
      this.isActive = false;
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      
      this.dispatchEvent(new CustomEvent('slam-end', {
          bubbles: true,
          composed: true
      }));
  };

  private updateXY(e: PointerEvent) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
  }
}
