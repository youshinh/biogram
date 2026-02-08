import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './hydra-visualizer';
import type { HydraVisualizer } from './hydra-visualizer';

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
  @state() isManual = false;
  @state() genPulse = false;

  public clearVisualizer() {
      const viz = this.querySelector('hydra-visualizer') as HydraVisualizer | null;
      viz?.clear();
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
      window.addEventListener('deck-play-sync', this.onPlaySync);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('deck-bpm-update', this.onBpmUpdate);
      window.removeEventListener('deck-action', this.handleMidiAction);
      window.removeEventListener('deck-play-sync', this.onPlaySync);
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

  private onPlaySync = (e: any) => {
      const { deck, playing } = e.detail;
      if (deck === this.deckId) {
          this.isPlaying = playing;
          this.requestUpdate();
      }
  };

  render() {
      const isDeckA = this.deckId === 'A';
      return html`
      <div class="flex flex-col h-full w-full relative">
          <!-- VISUALIZER AREA - Maximized on mobile -->
          <div class="flex-grow relative min-h-0 bg-black/20">
              <hydra-visualizer .deckId="${this.deckId}" .currentPrompt="${this.generatedPrompt}"></hydra-visualizer>
              
              <!-- DECK LABEL OVERLAY -->
              <div class="absolute top-2 left-2 md:top-10 text-[3rem] md:text-[4rem] font-black opacity-10 pointer-events-none select-none leading-none ${this.deckColorClass}">
                  ${this.deckId}
              </div>

              <!-- MOBILE: Floating mini controls overlay (visible only on mobile) -->
              <div class="md:hidden absolute bottom-0 left-0 right-0 px-4 pb-4 pt-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent">
                  <div class="flex items-end justify-between gap-3">
                      <!-- Play button - Large touch target -->
                      <button class="w-16 h-16 rounded-full flex items-center justify-center transition-all active:scale-95
                                   ${this.isPlaying 
                                     ? 'bg-tech-cyan/20 border-2 border-tech-cyan shadow-[0_0_15px_rgba(6,182,212,0.3)]' 
                                     : 'bg-zinc-800/80 border border-zinc-600'}"
                              @click="${this.togglePlay}">
                          ${this.isPlaying 
                            ? html`<div class="w-5 h-5 bg-tech-cyan rounded-sm"></div>`
                            : html`<div class="w-0 h-0 border-t-[10px] border-t-transparent border-l-[16px] border-l-zinc-300 border-b-[10px] border-b-transparent ml-1"></div>`
                          }
                      </button>

                      <!-- BPM Display - Tappable -->
                      <button class="flex-1 h-16 bg-black/65 backdrop-blur rounded-2xl border border-zinc-700 flex items-center justify-center gap-3 px-3"
                              @click="${this.tapBpm}">
                          <span class="text-[1.9rem] leading-none font-bold text-zinc-200 font-mono">${this.bpm.toFixed(1)}</span>
                          <span class="text-[11px] tracking-wide text-zinc-400 font-semibold">BPM</span>
                      </button>

                      <div class="flex flex-col items-end gap-2">
                          <!-- Sync button -->
                          <button class="w-14 h-10 rounded-xl flex items-center justify-center text-[10px] font-bold font-mono tracking-wide transition-all active:scale-95
                                       ${this.isSync 
                                         ? 'bg-tech-cyan/20 text-tech-cyan border-2 border-tech-cyan shadow-[0_0_10px_rgba(6,182,212,0.3)]' 
                                         : 'bg-zinc-800/80 text-zinc-300 border border-zinc-600'}"
                                  @click="${this.toggleSync}">
                              SYNC
                          </button>
                          
                          <!-- GEN button -->
                          <button class="w-16 h-16 rounded-full bg-zinc-800/85 border border-zinc-500 flex items-center justify-center text-[11px] font-bold tracking-wide text-zinc-100 shadow-[0_8px_22px_rgba(0,0,0,0.45)] active:scale-95 transition-all ${this.genPulse ? 'ring-2 ring-white/70 shadow-[0_0_20px_rgba(255,255,255,0.35)]' : ''}"
                                  @click="${this.triggerGen}">
                              GEN
                          </button>
                      </div>
                  </div>
              </div>
              
              <!-- SAVE ICON (bottom-right of waveform) - Hidden on mobile, shown on tablet+ -->
              <button class="hidden md:flex absolute bottom-2 right-2 w-8 h-8 rounded bg-zinc-900/80 border border-zinc-700 items-center justify-center hover:bg-zinc-800 hover:border-signal-emerald/50 active:scale-95 transition-all"
                      @click="${this.saveLoop}"
                      title="Save Loop">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-signal-emerald/70">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                  </svg>
              </button>
          </div>

          <!-- CONTROLS CONTAINER - Hidden on mobile, shown on tablet+ -->
          <div class="hidden md:flex shrink-0 gap-2 p-2 bg-[#18181b] border-t border-white/5 items-center justify-center lg:h-[140px] lg:flex-nowrap flex-wrap h-auto">
              
              <!-- DECK A LAYOUT: TAP -> CENTER -> TOOLS -> PLAY -->
              ${isDeckA ? this.renderTapSection() : this.renderPlaySection()}

              <!-- DECK A: CENTER is 2nd. DECK B: TOOLS is 2nd -->
              ${isDeckA ? this.renderCenterSection() : this.renderToolsSection()}

              <!-- DECK A: TOOLS is 3rd. DECK B: CENTER is 3rd -->
              ${isDeckA ? this.renderToolsSection() : this.renderCenterSection()}

              <!-- DECK A: PLAY is 4th. DECK B: TAP is 4th -->
              ${isDeckA ? this.renderPlaySection() : this.renderTapSection()}

          </div>
      </div>
    `;
  }

  private renderTapSection() {
      // 120px square container (Invisible, layout only)
      return html`
        <div class="shrink-0 w-[120px] h-[120px] flex items-center justify-center">
             <button class="w-[100px] h-[100px] rounded-full bg-zinc-900 border border-zinc-700 flex items-center justify-center shadow-lg active:scale-95 transition-all group hover:text-zinc-300"
                     @click="${this.tapBpm}">
                  <span class="text-xl font-bold text-zinc-500 tracking-widest font-mono group-active:text-tech-cyan group-hover:text-zinc-300">TAP</span>
             </button>
        </div>
      `;
  }

  private renderCenterSection() {
      // Maximize width, 120px height, rounded corners
      return html`
        <div class="flex-grow h-[120px] flex flex-col bg-black border border-zinc-800 rounded-xl overflow-hidden min-w-[300px]">
            <!-- ROW 1: BUTTONS & BPM (60px) -->
            <div class="flex h-[60px] w-full border-b border-zinc-800">
                <!-- |< -->
                <button class="shrink-0 w-[42px] h-full border-r border-zinc-800 text-[12px] text-zinc-500 hover:text-white hover:bg-zinc-900" 
                        @click="${() => this.adjustGrid(-1)}">|&lt;</button>
                
                <!-- -1.0 -->
                <button class="shrink-0 w-[42px] h-full border-r border-zinc-800 text-[14px] text-zinc-500 hover:text-white hover:bg-zinc-900" 
                        @click="${() => this.adjustBpm(-1.0)}">-</button>
                
                <!-- -0.1 -->
                <button class="shrink-0 w-[42px] h-full border-r border-zinc-800 text-[12px] text-zinc-500 hover:text-white hover:bg-zinc-900" 
                        @click="${() => this.adjustBpm(-0.1)}">.1</button>

                <!-- BPM DISPLAY (Flex Grow) -->
                <div class="flex-grow h-full flex items-center justify-center relative bg-black border-r border-zinc-800 group cursor-ns-resize" title="Drag to adjust BPM">
                     <span class="text-4xl font-bold tracking-tighter text-zinc-400 font-sans">${this.bpm.toFixed(1)}</span>
                     <span class="absolute top-1 right-2 text-[9px] text-zinc-600 font-mono">BPM</span>
                </div>

                <!-- +0.1 -->
                <button class="shrink-0 w-[42px] h-full border-r border-zinc-800 text-[12px] text-zinc-500 hover:text-white hover:bg-zinc-900" 
                        @click="${() => this.adjustBpm(0.1)}">.1</button>

                <!-- +1.0 -->
                <button class="shrink-0 w-[42px] h-full border-r border-zinc-800 text-[14px] text-zinc-500 hover:text-white hover:bg-zinc-900" 
                        @click="${() => this.adjustBpm(1.0)}">+</button>

                <!-- >| -->
                <button class="shrink-0 w-[42px] h-full text-[12px] text-zinc-500 hover:text-white hover:bg-zinc-900" 
                        @click="${() => this.adjustGrid(1)}">&gt;|</button>
            </div>

            <!-- ROW 2: PROMPT INPUT (60px) -->
            <div class="flex-grow w-full bg-[#0a0a0a]">
                <input class="w-full h-full bg-transparent border-none outline-none px-4 text-[14px] font-bold font-mono text-zinc-400 placeholder-zinc-800 text-center tracking-wider" 
                       type="text" 
                       placeholder="PROMPT" 
                       .value="${this.prompt}"
                       @change="${this.handlePromptChange}"
                />
            </div>
        </div>
      `;
  }

  private renderToolsSection() {
      // Height 120px, 2 buttons stacked (SYNC square, GEN circle)
      return html`
        <div class="shrink-0 w-[56px] h-[120px] flex flex-col gap-1 justify-center items-center">
             <!-- SYNC (rounded square) -->
             <button class="w-[52px] h-[52px] rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-[10px] font-bold font-mono ${this.isSync ? 'text-tech-cyan border-tech-cyan/50 shadow-[0_0_8px_rgba(6,182,212,0.4)]' : 'text-zinc-500 hover:text-zinc-300'}"
                     @click="${this.toggleSync}">
                 SYNC
             </button>
             
             <!-- GEN (round button) -->
             <button class="w-[52px] h-[52px] rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center text-[10px] font-bold text-zinc-400 hover:text-white hover:bg-zinc-700 hover:border-zinc-500 shadow-sm active:scale-95 transition-all ${this.genPulse ? 'ring-2 ring-white/60 shadow-[0_0_16px_rgba(255,255,255,0.3)] text-white' : ''}"
                     @click="${this.triggerGen}">
                 GEN
             </button>
        </div>
      `;
  }

  private renderPlaySection() {
       return html`
        <div class="shrink-0 w-[120px] h-[120px] flex items-center justify-center">
             <button class="w-[100px] h-[100px] rounded-full bg-zinc-800 border border-zinc-600 flex items-center justify-center shadow-lg active:scale-95 transition-all group ${this.isPlaying ? 'border-tech-cyan/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]' : 'hover:bg-zinc-700 hover:border-zinc-500'}"
                     @click="${this.togglePlay}">
                  ${this.isPlaying 
                    ? html`<div class="w-8 h-8 bg-zinc-400 rounded-sm"></div>`
                    : html`<div class="w-0 h-0 border-t-[16px] border-t-transparent border-l-[26px] border-l-zinc-400 border-b-[16px] border-b-transparent ml-3 group-hover:border-l-zinc-300"></div>`
                  }
             </button>
        </div>
      `;
  }

  private adjustGrid(beats: number) {
      const engine = window.engine;
      if (engine && engine.shiftGrid) {
          engine.shiftGrid(this.deckId, beats);
      }
  }

  private adjustBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      this.isManual = true;
      this.dispatchBpm();
  }
  
  private lastTap = 0;
  private tapBpm() {
      const now = performance.now();
      if (now - this.lastTap < 2000) {
          const interval = now - this.lastTap;
          const newBpm = 60000 / interval;
          this.bpm = Math.round(newBpm * 10) / 10;
          this.isManual = true;
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
      if (import.meta.env.DEV) console.log(`[DeckController] togglePlay clicked for Deck ${this.deckId}. Current: ${this.isPlaying}`);
      this.isPlaying = !this.isPlaying;
      this.dispatchEvent(new CustomEvent('deck-play-toggle', { 
          detail: { deck: this.deckId, playing: this.isPlaying },
          bubbles: true,
          composed: true
      }));
  }

  private toggleSync() {
      if (import.meta.env.DEV) console.log(`[DeckController] toggleSync clicked for Deck ${this.deckId}`);
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

  private triggerGen = () => {
      this.genPulse = true;
      this.loadRandom();
      window.setTimeout(() => {
          this.genPulse = false;
      }, 180);
  };

  private saveLoop() {
       this.dispatchEvent(new CustomEvent('deck-save-loop', {
          detail: { deck: this.deckId },
          bubbles: true,
          composed: true
      }));
  }
}
