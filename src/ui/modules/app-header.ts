import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('app-header')
export class AppHeader extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  @state() currentView: 'DECK' | 'RACK' = 'DECK';

  render() {
    return html`
      <div class="flex justify-between items-center border-b border-white/10 px-4 py-2 bg-black/90 backdrop-blur z-50 h-[40px]">
          <div class="flex items-baseline">
              <h1 class="text-sm font-bold text-white tracking-[0.2em]">BIO:GRAM</h1>
              <span class="text-[10px] text-zinc-500 ml-2 font-mono">v2.1</span>
          </div>
          <div class="flex gap-2">
              <button 
                class="text-[10px] font-mono px-3 py-1 border transition-all duration-200 uppercase tracking-wider
                ${this.currentView === 'DECK' 
                    ? 'bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.3)]' 
                    : 'bg-black text-zinc-600 border-zinc-800 hover:text-zinc-300 hover:border-zinc-600'}"
                @click="${() => this.switchView('DECK')}">
                DECK_VIEW
              </button>
              <button 
                class="text-[10px] font-mono px-3 py-1 border transition-all duration-200 uppercase tracking-wider
                ${this.currentView === 'RACK' 
                    ? 'bg-tech-cyan text-black border-tech-cyan shadow-[0_0_10px_cyan]' 
                    : 'bg-black text-zinc-600 border-zinc-800 hover:text-zinc-300 hover:border-zinc-600'}"
                @click="${() => this.switchView('RACK')}">
                FX_RACK
              </button>
          </div>
      </div>
    `;
  }

  private switchView(view: 'DECK' | 'RACK') {
    this.currentView = view;
    this.dispatchEvent(new CustomEvent('view-change', {
      detail: { view },
      bubbles: true,
      composed: true
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
