import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import '../atoms/bio-slider';

@customElement('dj-mixer')
export class DjMixer extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  @state() crossfader = 0.5; // 0 (A) to 1 (B)
  
  // EQ States (Gain 0.0-1.0)
  // Actually EQ range is typically 0 to 1.5 or 2.0 (Boost)
  @state() eqA = { hi: 1.0, mid: 1.0, low: 1.0 };
  @state() eqB = { hi: 1.0, mid: 1.0, low: 1.0 };
  
  // Kill States
  @state() killA = { hi: false, mid: false, low: false };
  @state() killB = { hi: false, mid: false, low: false };

  // PRE-AMP
  @state() trimA = 1.0; @state() driveA = 0.0;
  @state() trimB = 1.0; @state() driveB = 0.0;

  @state() bpm = 120;
  @state() beatActive = false;
  private animId = 0;

  connectedCallback() {
      super.connectedCallback();
      // Performance: Changed from requestAnimationFrame to setInterval (500ms)
      // Beat blinking doesn't need 60fps
      this.animateValues();
      this.animId = window.setInterval(this.animateValues, 500);
      window.addEventListener('mixer-update', this.handleMidiUpdate);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.clearInterval(this.animId);
      window.removeEventListener('mixer-update', this.handleMidiUpdate);
  }

  private handleMidiUpdate = (e: any) => {
      const { parameter, value } = e.detail;
      
      if (parameter === 'crossfader') {
          this.crossfader = value;
          this.dispatchParam('CROSSFADER', this.crossfader);
      } else if (parameter === 'volumeA') {
          this.handlePreAmp('A', 'TRIM', value * 2.0);
      } else if (parameter === 'volumeB') {
          // Sync UI is tricky if we don't distinguish source.
          // Assuming value is 0-1
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

  private animateValues = () => {
      const engine = (window as any).engine;
      if (!engine || !engine.context) return;
      
      const time = engine.context.currentTime;
      const beatDur = 60.0 / this.bpm;
      const phase = time % beatDur;
      const isActive = phase < 0.1;
      
      if (this.beatActive !== isActive) {
          this.beatActive = isActive;
      }
  }

  render() {
    return html`
      <div class="h-full w-full flex flex-col items-center justify-between p-2">
           
           <!-- MASTER BPM SECTION -->
           <div class="flex items-center gap-4 mb-2 p-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/5 w-full justify-center shadow-lg">
                <div class="w-2 h-2 rounded-full transition-all duration-75 ${this.beatActive ? 'bg-signal-emerald shadow-[0_0_10px_#10b981] scale-125' : 'bg-zinc-800'}"></div>
                <div class="font-mono text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-zinc-200 to-zinc-500">
                    ${this.bpm.toFixed(1)} <span class="text-xs text-zinc-600">BPM</span>
                </div>
                <div class="flex flex-col gap-1">
                    <button class="w-4 h-4 rounded-full border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-500 hover:text-white hover:border-white transition-colors"
                            @click="${() => this.changeBpm(1)}">+</button>
                    <button class="w-4 h-4 rounded-full border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-500 hover:text-white hover:border-white transition-colors"
                            @click="${() => this.changeBpm(-1)}">-</button>
                </div>
           </div>

           <!-- CHANNELS -->
           <div class="flex-grow w-full grid grid-cols-2 gap-2 h-full min-h-0">
               <!-- DECK A STRIP -->
               <div class="rounded-2xl border border-white/5 bg-black/20 p-2 flex flex-col items-center gap-2 group hover:border-tech-cyan/20 transition-colors">
                   <div class="text-[10px] font-mono text-tech-cyan tracking-widest opacity-50 mb-1">CH.A</div>
                   
                   <!-- PRE-AMP -->
                   <div class="flex gap-2 w-full justify-center border-b border-white/5 pb-2 mb-1">
                       <bio-slider label="TRIM" .value="${this.trimA}" min="0" max="2" step="0.01" class="h-24 w-8"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('A', 'TRIM', e.detail)}"></bio-slider>
                       <bio-slider label="DRV" .value="${this.driveA}" min="0" max="1" step="0.01" class="h-24 w-8"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('A', 'DRIVE', e.detail)}"></bio-slider>
                   </div>
                   
                   <!-- EQ -->
                   <div class="flex-grow flex flex-col justify-between w-full items-center gap-1">
                       ${this.renderEqBand('A', 'HI', this.eqA.hi, this.killA.hi)}
                       ${this.renderEqBand('A', 'MID', this.eqA.mid, this.killA.mid)}
                       ${this.renderEqBand('A', 'LOW', this.eqA.low, this.killA.low)}
                   </div>
               </div>

               <!-- DECK B STRIP -->
               <div class="rounded-2xl border border-white/5 bg-black/20 p-2 flex flex-col items-center gap-2 group hover:border-signal-emerald/20 transition-colors">
                   <div class="text-[10px] font-mono text-signal-emerald tracking-widest opacity-50 mb-1">CH.B</div>
                   
                   <!-- PRE-AMP -->
                   <div class="flex gap-2 w-full justify-center border-b border-white/5 pb-2 mb-1">
                       <bio-slider label="TRIM" .value="${this.trimB}" min="0" max="2" step="0.01" class="h-24 w-8"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('B', 'TRIM', e.detail)}"></bio-slider>
                       <bio-slider label="DRV" .value="${this.driveB}" min="0" max="1" step="0.01" class="h-24 w-8"
                                   @change="${(e: CustomEvent) => this.handlePreAmp('B', 'DRIVE', e.detail)}"></bio-slider>
                   </div>
                   
                   <!-- EQ -->
                   <div class="flex-grow flex flex-col justify-between w-full items-center gap-1">
                       ${this.renderEqBand('B', 'HI', this.eqB.hi, this.killB.hi)}
                       ${this.renderEqBand('B', 'MID', this.eqB.mid, this.killB.mid)}
                       ${this.renderEqBand('B', 'LOW', this.eqB.low, this.killB.low)}
                   </div>
               </div>
           </div>

           <!-- CROSSFADER -->
           <div class="w-full mt-4 p-2 rounded-xl bg-black/40 backdrop-blur-md border border-white/5 shadow-lg flex flex-col items-center">
               <div class="text-[8px] tracking-[0.3em] text-zinc-600 mb-2 uppercase">Collider // X-Fader</div>
               
               <input type="range" 
                      class="w-full h-2 bg-zinc-900 rounded-full appearance-none outline-none cursor-ew-resize accent-zinc-400 hover:accent-white active:accent-tech-cyan"
                      min="0" max="1" step="0.01"
                      .value="${this.crossfader}"
                      @input="${this.handleCrossfader}" 
               />
               
               <div class="flex justify-between w-full mt-2 text-[10px] font-bold font-mono opacity-50">
                   <span class="text-tech-cyan">A</span>
                   <span class="text-signal-emerald">B</span>
               </div>
           </div>
      </div>
    `;
  }

  private renderEqBand(deck: 'A'|'B', band: 'HI'|'MID'|'LOW', val: number, isKill: boolean) {
      // Color based on deck
      const accent = deck === 'A' ? 'hover:text-tech-cyan' : 'hover:text-signal-emerald';
      const killActive = deck === 'A' ? 'bg-tech-cyan text-black border-tech-cyan' : 'bg-signal-emerald text-black border-signal-emerald';
      
      return html`
         <div class="flex flex-col items-center w-full gap-1 flex-1 min-h-0 border-b border-white/5 last:border-0 pb-1">
             <div class="flex items-center justify-between w-full px-2">
                 <span class="text-[8px] font-mono text-zinc-500 w-6 text-left">${band}</span>
                 <button class="text-[8px] px-1 rounded border border-zinc-800 text-zinc-600 transition-colors ${isKill ? killActive : `hover:border-zinc-500 ${accent} hover:text-white`}"
                         @click="${() => this.toggleKill(deck, band)}">
                     K
                 </button>
             </div>
             <bio-slider label="" .value="${val}" min="0" max="1.5" step="0.01" class="w-8 flex-grow"
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

  private toggleKill(deck: string, band: 'HI'|'MID'|'LOW') {
      const targetState = deck === 'A' ? this.killA : this.killB;
      const key = band.toLowerCase() as 'hi'|'mid'|'low';
      targetState[key] = !targetState[key];
      this.requestUpdate();
      
      const val = targetState[key] ? 1.0 : 0.0;
      this.dispatchParam(`KILL_${deck}_${band}`, val);
  }

  private handleCrossfader(e: any) {
      this.crossfader = parseFloat(e.target.value);
      this.dispatchParam('CROSSFADER', this.crossfader);
  }

  private dispatchParam(id: string, val: any) {
      this.dispatchEvent(new CustomEvent('mixer-change', {
          detail: { id, val },
          bubbles: true,
          composed: true
      }));
  }

  private changeBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      window.dispatchEvent(new CustomEvent('bpm-change', { detail: this.bpm }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dj-mixer': DjMixer;
  }
}
