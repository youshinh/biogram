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
        @click=${this.handleClick}
      >
        <!-- Background Grid Pattern -->
        <div class="absolute inset-0 opacity-10 pointer-events-none" 
             style="background-image: radial-gradient(circle, #fff 1px, transparent 1px); background-size: 8px 8px;">
        </div>

        <!-- Active Border Glow -->
        <div class="absolute inset-0 transition-opacity duration-300 pointer-events-none ${this.isActive ? 'opacity-100 shadow-[inset_0_0_20px_rgba(255,255,255,0.2)]' : 'opacity-0'}"></div>

        <!-- Content -->
        <div class="relative z-10 flex flex-col items-center justify-center gap-1 transition-transform duration-100 active:scale-95">
             <div class="text-xl font-bold tracking-widest text-zinc-300 group-hover:text-white transition-colors uppercase">
                ${this.isActive ? 'ACTIVE' : 'SLAM'}
             </div>
             <div class="text-[0.6rem] font-mono tracking-[0.2em] text-zinc-600 group-hover:text-signal-emerald transition-colors uppercase">
                ${this.isActive ? 'INJECTING...' : 'INJECT_NOISE'}
             </div>
        </div>
        
        <!-- Active Indicator Dot -->
        <div class="absolute top-2 right-2 w-1.5 h-1.5 rounded-full transition-colors duration-300 ${this.isActive ? 'bg-signal-emerald animate-pulse shadow-[0_0_8px_#10b981]' : 'bg-zinc-800'}"></div>
      </button>
    `;
  }
}
