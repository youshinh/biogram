import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import '../atoms/bio-slider';

@customElement('dj-mixer')
export class DjMixer extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  // EQ States (Gain 0.0-1.0)
  @state() eqA = { hi: 1.0, mid: 1.0, low: 1.0 };
  @state() eqB = { hi: 1.0, mid: 1.0, low: 1.0 };
  
  // Kill States
  @state() killA = { hi: false, mid: false, low: false };
  @state() killB = { hi: false, mid: false, low: false };

  // PRE-AMP
  @state() trimA = 1.0; @state() driveA = 0.0;
  @state() trimB = 1.0; @state() driveB = 0.0;

  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('mixer-update', this.handleMidiUpdate);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('mixer-update', this.handleMidiUpdate);
  }
  
  private handleMidiUpdate = (e: any) => {
      const { parameter, value } = e.detail;
      
      if (parameter === 'volumeA') {
          this.handlePreAmp('A', 'TRIM', value * 2.0);
      } else if (parameter === 'volumeB') {
          this.handlePreAmp('B', 'TRIM', value * 2.0);
      }
      else {
           // param: lowA, midB etc.
           const deck = parameter.slice(-1); // 'A' or 'B'
           const key = parameter.slice(0, -1); // 'low'
           
           if ((deck === 'A' || deck === 'B') && ['low', 'mid', 'high', 'hi'].includes(key)) {
               const band = key === 'high' ? 'HI' : key.toUpperCase();
               this.handleEq(deck, band as 'HI'|'MID'|'LOW', value * 1.5);
           }
      }
  }

  render() {
    return html`
      <div class="h-full w-full flex flex-col items-center p-2 md:p-2 overflow-hidden">
           
           <!-- CHANNELS (Grid layout, single column on mobile) -->
           <div class="flex-grow w-full grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-2 min-h-0 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-zinc-700/50 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-zinc-600 mb-2">
               <!-- DECK A STRIP -->
               <div class="rounded-2xl border border-tech-cyan/20 bg-black/30 p-3 md:p-2 flex flex-col items-center gap-2 md:gap-1 group hover:border-tech-cyan/40 transition-colors min-w-0">
                   <div class="text-base md:text-xs font-mono text-tech-cyan tracking-widest font-bold">CH.A</div>
                   
                   <!-- PRE-AMP Section (DRIVE hidden on mobile) -->
                   <div class="flex gap-3 md:gap-2 w-full justify-center border-b-2 border-white/10 pb-3 md:pb-2 mb-2">
                       <bio-slider label="TRIM" .value="${this.trimA}" min="0" max="2" step="0.01" class="h-32 md:h-24"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('A', 'TRIM', e.detail)}"></bio-slider>
                       <bio-slider label="DRV" .value="${this.driveA}" min="0" max="1" step="0.01" class="hidden md:block h-32 md:h-24"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('A', 'DRIVE', e.detail)}"></bio-slider>
                   </div>
                   
                   <!-- EQ Section -->
                   <div class="flex-grow flex flex-col justify-start w-full items-center gap-2">
                       ${this.renderEqBand('A', 'HI', this.eqA.hi, this.killA.hi)}
                       ${this.renderEqBand('A', 'MID', this.eqA.mid, this.killA.mid)}
                       ${this.renderEqBand('A', 'LOW', this.eqA.low, this.killA.low)}
                   </div>
               </div>

               <!-- DECK B STRIP -->
               <div class="rounded-2xl border border-signal-emerald/20 bg-black/30 p-3 md:p-2 flex flex-col items-center gap-2 md:gap-1 group hover:border-signal-emerald/40 transition-colors min-w-0">
                   <div class="text-base md:text-xs font-mono text-signal-emerald tracking-widest font-bold">CH.B</div>
                   
                   <!-- PRE-AMP Section (DRIVE hidden on mobile) -->
                   <div class="flex gap-3 md:gap-2 w-full justify-center border-b-2 border-white/10 pb-3 md:pb-2 mb-2">
                       <bio-slider label="TRIM" .value="${this.trimB}" min="0" max="2" step="0.01" class="h-32 md:h-24"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('B', 'TRIM', e.detail)}"></bio-slider>
                       <bio-slider label="DRV" .value="${this.driveB}" min="0" max="1" step="0.01" class="hidden md:block h-32 md:h-24"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('B', 'DRIVE', e.detail)}"></bio-slider>
                   </div>
                   
                   <!-- EQ Section -->
                   <div class="flex-grow flex flex-col justify-start w-full items-center gap-2">
                       ${this.renderEqBand('B', 'HI', this.eqB.hi, this.killB.hi)}
                       ${this.renderEqBand('B', 'MID', this.eqB.mid, this.killB.mid)}
                       ${this.renderEqBand('B', 'LOW', this.eqB.low, this.killB.low)}
                   </div>
               </div>
           </div>
      </div>
    `;
  }

  private renderEqBand(deck: 'A'|'B', band: 'HI'|'MID'|'LOW', val: number, isKill: boolean) {
      // Color based on deck (Keep deck accents for Kill/Hover to distinguish decks)
      const accent = deck === 'A' ? 'hover:text-tech-cyan hover:border-tech-cyan/50' : 'hover:text-signal-emerald hover:border-signal-emerald/50';
      const killActive = deck === 'A' ? 'bg-tech-cyan text-black border-tech-cyan shadow-[0_0_8px_rgba(6,182,212,0.5)]' : 'bg-signal-emerald text-black border-signal-emerald shadow-[0_0_8px_rgba(16,185,129,0.5)]';
      
      // Band identification background (Solid Gray - 3 distinct shades)
      // HI: Light Gray, MID: Medium Gray, LOW: Dark Gray
      const bgClass = band === 'HI' ? 'bg-zinc-600/40' :
                      band === 'MID' ? 'bg-zinc-700/40' :
                      'bg-zinc-800/40';

      const labelText = band === 'HI' ? 'High' : band === 'MID' ? 'Mid' : 'Low';

      return html`
         <div class="relative overflow-hidden flex flex-col items-center w-full gap-1 flex-1 min-h-0 border-b border-white/5 last:border-0 py-1 ${bgClass}">
             <!-- Background Text -->
             <div class="absolute inset-0 flex items-center justify-center pointer-events-none select-none overflow-hidden">
                 <span class="text-[1.5rem] font-bold text-white/5 tracking-wider transform scale-y-150">${labelText}</span>
             </div>

              <!-- Top row: Reset + Kill (larger targets on mobile) -->
              <div class="relative z-10 flex items-center justify-between w-full px-1">
                  <button class="text-xs md:text-[8px] font-mono px-2 md:px-1 py-2 md:py-0.5 min-h-[44px] md:min-h-0 text-zinc-500 hover:text-white hover:bg-zinc-600 rounded transition-all"
                          @click="${() => this.resetEq(deck, band)}">
                      RESET
                  </button>
                  <button class="btn-3d text-xs md:text-[8px] px-3 md:px-1.5 py-2 md:py-0.5 min-h-[44px] md:min-h-0 ${isKill ? killActive : `text-zinc-500 ${accent}`}"
                          @click="${() => this.toggleKill(deck, band)}">
                      KILL
                  </button>
              </div>
             <!-- Slider -->
             <bio-slider label="" .value="${val}" min="0" max="1.5" step="0.01" class="relative z-10 w-full h-32"
                         @change="${(e: CustomEvent) => this.handleEq(deck, band, e.detail)}"></bio-slider>
         </div>
      `;
  }

  private handlePreAmp(deck: 'A'|'B', param: 'TRIM'|'DRIVE', val: number) {
      if (deck === 'A') {
          if (param === 'TRIM') this.trimA = val; else this.driveA = val;
      } else {
          if (param === 'TRIM') this.trimB = val; else this.driveB = val;
      }
      this.dispatchParam(`${param}_${deck}`, val);
  }

  private handleEq(deck: string, band: 'HI'|'MID'|'LOW', val: number) {
      const targetState = deck === 'A' ? this.eqA : this.eqB;
      const key = band.toLowerCase() as 'hi'|'mid'|'low';
      targetState[key] = val;
      this.requestUpdate();
      
      this.dispatchParam(`EQ_${deck}_${band}`, val);
  }

  private resetEq(deck: string, band: 'HI'|'MID'|'LOW') {
      this.handleEq(deck, band, 1.0);
  }

  private toggleKill(deck: string, band: 'HI'|'MID'|'LOW') {
      const targetState = deck === 'A' ? this.killA : this.killB;
      const key = band.toLowerCase() as 'hi'|'mid'|'low';
      targetState[key] = !targetState[key];
      this.requestUpdate();
      
      const val = targetState[key] ? 1.0 : 0.0;
      this.dispatchParam(`KILL_${deck}_${band}`, val);
  }

  private dispatchParam(id: string, val: any) {
      this.dispatchEvent(new CustomEvent('mixer-change', {
          detail: { id, val },
          bubbles: true,
          composed: true
      }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dj-mixer': DjMixer;
  }
}
