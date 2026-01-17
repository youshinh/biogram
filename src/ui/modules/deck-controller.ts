import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './hydra-visualizer';

@customElement('deck-controller')
export class DeckController extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  @property({ type: String, reflect: true }) deckId = "A"; 
  @property({ type: Boolean, reflect: true }) isPlaying = false; // Public for external sync
  @state() isSync = false;
  @state() prompt = "";
  @state() generatedPrompt = ""; // Full prompt sent to AI (displayed on waveform)
  @state() bpm = 120.0;
  @state() isManaul = false;

  public clearVisualizer() {
      const viz = this.shadowRoot?.querySelector('hydra-visualizer') as any;
      if (viz && viz.clear) {
          viz.clear();
      }
  }
  
  // Custom Color per deck for accents
  get deckColorClass() {
      return this.deckId === 'A' ? 'text-tech-cyan' : 'text-signal-emerald';
  }

  get borderFocusClass() {
      return this.deckId === 'A' ? 'focus-within:border-tech-cyan/50' : 'focus-within:border-signal-emerald/50';
  }

  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('deck-bpm-update', this.onBpmUpdate);
      window.addEventListener('deck-action', this.handleMidiAction);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('deck-bpm-update', this.onBpmUpdate);
      window.removeEventListener('deck-action', this.handleMidiAction);
  }

  private handleMidiAction = (e: any) => {
      const { deck, action } = e.detail;
      if (deck !== this.deckId) return;

      if (action === 'toggle-play') this.togglePlay();
      else if (action === 'toggle-sync') this.toggleSync();
      else if (action === 'load-random') this.loadRandom();
  };

  private onBpmUpdate = (e: any) => {
      const { deck, bpm } = e.detail;
      if (deck === this.deckId) {
          this.bpm = parseFloat(bpm.toFixed(1));
          this.requestUpdate();
      }
  };

  render() {
      // Layout: Visualizer on top, Controls on bottom
      // Deck A: Play Right, Deck B: Play Left (as per previous logic, but simplified for cleaner UI? Let's keep symmetry)
      // Actually, standard DJ layout usually puts Play/CUE at bottom corners closest to mixer or outside.
      // Let's use a symmetric layout for now using Flexbox order or just Grid.
      
      const isDeckA = this.deckId === 'A';

    return html`
      <div class="flex flex-col h-full w-full relative">
          <!-- VISUALIZER AREA -->
          <div class="flex-grow relative min-h-0 border-b border-white/5 bg-black/20">
              <hydra-visualizer .deckId="${this.deckId}" .currentPrompt="${this.generatedPrompt}"></hydra-visualizer>
              
              <!-- DECK LABEL OVERLAY -->
              <div class="absolute top-10 left-2 text-[4rem] font-black opacity-10 pointer-events-none select-none leading-none ${this.deckColorClass}">
                  ${this.deckId}
              </div>
          </div>

          <!-- CONTROLS CONTAINER -->
          <div class="h-[80px] shrink-0 flex gap-1 p-1 bg-black/40 backdrop-blur-md">
              
              <!-- LEFT GROUP (Transport or Tools based on Deck) -->
              ${!isDeckA ? this.renderTransport() : this.renderTools()}

              <!-- CENTER: BPM & INPUT -->
              <div class="flex-grow flex flex-col gap-1 min-w-0">
                  <!-- BPM ROW -->
                  <div class="flex items-center justify-between bg-black/20 rounded border border-white/5 px-2 h-[34px]">
                       <button class="text-zinc-500 hover:text-white text-xs px-1" @click="${() => this.adjustBpm(-1.0)}">&laquo;</button>
                       <button class="text-zinc-500 hover:text-white text-xs px-1" @click="${() => this.adjustBpm(-0.1)}">&lsaquo;</button>
                       
                       <div class="font-mono text-lg font-bold tracking-tighter ${this.deckColorClass}">
                           ${this.bpm.toFixed(1)}
                       </div>
                       
                       <button class="text-zinc-500 hover:text-white text-xs px-1" @click="${() => this.adjustBpm(0.1)}">&rsaquo;</button>
                       <button class="text-zinc-500 hover:text-white text-xs px-1" @click="${() => this.adjustBpm(1.0)}">&raquo;</button>
                       <button class="text-[10px] font-mono border border-zinc-700 rounded px-1 ml-1 hover:border-zinc-500 hover:text-white text-zinc-500" @click="${this.tapBpm}">TAP</button>
                  </div>

                  <!-- PROMPT/GRID ROW -->
                  <div class="flex gap-1 h-[34px]">
                      <!-- GRID SHIFT -->
                      <div class="flex flex-col justify-center items-center px-1 bg-black/20 rounded border border-white/5 w-[50px]">
                          <span class="text-[8px] text-zinc-600 font-mono scale-75 origin-center">GRID</span>
                          <div class="flex w-full justify-between">
                             <button class="text-zinc-500 hover:text-white text-[10px]" @click="${() => this.adjustGrid(-1)}">&lt;</button>
                             <button class="text-zinc-500 hover:text-white text-[10px]" @click="${() => this.adjustGrid(1)}">&gt;</button>
                          </div>
                      </div>

                      <!-- PROMPT INPUT -->
                      <div class="flex-grow relative bg-black/20 rounded border border-white/5 ${this.borderFocusClass} transition-colors">
                          <input class="w-full h-full bg-transparent border-none outline-none px-2 text-[10px] font-mono text-zinc-300 placeholder-zinc-700" 
                                 type="text" 
                                 placeholder="Enter prompt..." 
                                 .value="${this.prompt}"
                                 @change="${this.handlePromptChange}"
                          />
                      </div>
                  </div>
              </div>

              <!-- RIGHT GROUP (Tools or Transport based on Deck) -->
              ${isDeckA ? this.renderTransport() : this.renderTools()}
          </div>
      </div>
    `;
  }

  private renderTransport() {
      return html`
        <div class="w-[70px] flex flex-col gap-1">
             <button class="flex-grow flex items-center justify-center border border-white/10 rounded overflow-hidden transition-all duration-150 active:scale-95 ${this.isPlaying ? 'bg-white/10 border-white/20' : 'bg-black/30 hover:bg-white/5'}"
                     @click="${this.togglePlay}">
                  ${this.isPlaying 
                    ? html`<div class="w-3 h-3 bg-white shadow-[0_0_10px_white]"></div>` // Stop Square? Or Pause. Let's do Stop/Pause aesthetic
                    : html`<div class="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-zinc-400 border-b-[6px] border-b-transparent ml-1 group-hover:border-l-white"></div>` // Play Triangle
                  }
             </button>
             <div class="text-[8px] text-center font-mono text-zinc-600 tracking-widest uppercase">
                 ${this.isPlaying ? 'PLAYING' : 'STOPPED'}
             </div>
        </div>
      `;
  }

  private renderTools() {
      return html`
         <div class="w-[50px] flex flex-col gap-1">
             <button class="flex-1 border border-white/10 rounded text-[10px] font-mono transition-colors ${this.isSync ? 'bg-tech-cyan/20 text-tech-cyan border-tech-cyan/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'}"
                     @click="${this.toggleSync}">
                 SYNC
             </button>
             <button class="flex-1 border border-white/10 rounded text-[10px] font-mono text-zinc-500 hover:text-signal-emerald hover:border-signal-emerald/50 transition-colors"
                     @click="${this.loadRandom}">
                 GEN
             </button>
         </div>
      `;
  }

  private adjustGrid(beats: number) {
      const engine = (window as any).engine;
      if (engine && engine.shiftGrid) {
          engine.shiftGrid(this.deckId, beats);
      }
  }

  private adjustBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      this.isManaul = true;
      this.dispatchBpm();
  }
  
  private lastTap = 0;
  private tapBpm() {
      const now = performance.now();
      if (now - this.lastTap < 2000) {
          const interval = now - this.lastTap;
          const newBpm = 60000 / interval;
          this.bpm = Math.round(newBpm * 10) / 10;
          this.isManaul = true;
          this.dispatchBpm();
      }
      this.lastTap = now;
  }
  
  private dispatchBpm() {
      this.dispatchEvent(new CustomEvent('deck-bpm-change', {
          detail: { deck: this.deckId, bpm: this.bpm },
          bubbles: true,
          composed: true
      }));
  }

  private togglePlay() {
      this.isPlaying = !this.isPlaying;
      this.dispatchEvent(new CustomEvent('deck-play-toggle', { 
          detail: { deck: this.deckId, playing: this.isPlaying },
          bubbles: true,
          composed: true
      }));
  }

  private toggleSync() {
      this.isSync = !this.isSync;
      this.dispatchEvent(new CustomEvent('deck-sync-toggle', {
          detail: { deck: this.deckId, sync: this.isSync },
          bubbles: true,
          composed: true
      }));
  }

  private handlePromptChange(e: any) {
      this.prompt = e.target.value;
      this.dispatchEvent(new CustomEvent('deck-prompt-change', {
          detail: { deck: this.deckId, prompt: this.prompt },
          bubbles: true,
          composed: true
      }));
  }
  
  private loadRandom() {
       this.dispatchEvent(new CustomEvent('deck-load-random', {
          detail: { deck: this.deckId },
          bubbles: true,
          composed: true
      }));
  }
}
