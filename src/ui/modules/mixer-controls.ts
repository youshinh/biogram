import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('mixer-controls')
export class MixerControls extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM for Tailwind
  }

  @state() crossfader = 0.5; // 0 (A) to 1 (B)
  @state() bpm = 120;
  @state() beatActive = false;
  private animId = 0;

  connectedCallback() {
      super.connectedCallback();
      this.animateValues();
      this.animId = window.setInterval(this.animateValues, 500);
      
      // Listen for sync events
      window.addEventListener('mixer-update', this.handleMidiUpdate);
      window.addEventListener('bpm-change', this.handleBpmSync);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.clearInterval(this.animId);
      window.removeEventListener('mixer-update', this.handleMidiUpdate);
      window.removeEventListener('bpm-change', this.handleBpmSync);
  }

  private handleMidiUpdate = (e: any) => {
      const { parameter, value } = e.detail;
      if (parameter === 'crossfader') {
          this.crossfader = value;
          // dispatchParam not needed as we just received it? 
          // But main.ts listens to mixer-change. MidiManager dispatches mixer-update.
          // We need to update UI.
      }
  }

  private handleBpmSync = (e: any) => {
      this.bpm = e.detail;
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

  private handleCrossfader(e: any) {
      this.crossfader = parseFloat(e.target.value);
      this.dispatchParam('CROSSFADER', this.crossfader);
  }

  private changeBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      window.dispatchEvent(new CustomEvent('bpm-change', { detail: this.bpm }));
  }

  private dispatchParam(id: string, val: any) {
      this.dispatchEvent(new CustomEvent('mixer-change', {
          detail: { id, val },
          bubbles: true,
          composed: true
      }));
  }

  render() {
    return html`
      <div class="w-full flex flex-col items-center gap-2 p-2" style="background: transparent;">
           
           <!-- MASTER BPM SECTION -->
           <div class="flex-shrink-0 flex items-center gap-4 p-3 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 w-full justify-center shadow-lg">
                <div class="w-4 h-4 md:w-3 md:h-3 rounded-full transition-all duration-75 ${this.beatActive ? 'bg-signal-emerald shadow-[0_0_12px_#10b981] scale-125' : 'bg-zinc-700'}"></div>
                <div class="slider-value text-4xl md:text-3xl text-white">
                    ${Math.round(this.bpm)} <span class="text-base md:text-sm text-zinc-400 font-sans font-normal">BPM</span>
                </div>
                <div class="flex flex-col gap-1">
                    <button class="w-8 h-8 md:w-6 md:h-6 rounded-full border border-zinc-600 flex items-center justify-center text-base md:text-sm text-zinc-400 hover:text-white hover:border-white hover:bg-white/10 transition-all active:scale-95"
                            @click="${() => this.changeBpm(1)}">+</button>
                    <button class="w-8 h-8 md:w-6 md:h-6 rounded-full border border-zinc-600 flex items-center justify-center text-base md:text-sm text-zinc-400 hover:text-white hover:border-white hover:bg-white/10 transition-all active:scale-95"
                            @click="${() => this.changeBpm(-1)}">-</button>
                </div>
           </div>

           <!-- CROSSFADER -->
           <div class="flex-shrink-0 w-full p-3 rounded-xl bg-black/50 backdrop-blur-md border border-white/10 shadow-lg flex flex-col items-center">
               <div class="text-[10px] tracking-[0.3em] text-zinc-400 mb-2 uppercase font-semibold">Collider // X-Fader</div>
               
               <input type="range" 
                      class="w-full h-4 bg-zinc-800 rounded-full appearance-none outline-none cursor-ew-resize accent-zinc-300 [&::-webkit-slider-thumb]:w-8 [&::-webkit-slider-thumb]:h-8 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(255,255,255,0.6)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:cursor-ew-resize"
                      min="0" max="1" step="0.01"
                      .value="${this.crossfader}"
                      @input="${this.handleCrossfader}" 
               />
               
               <div class="flex justify-between w-full mt-2 text-sm font-bold font-mono">
                   <span class="text-tech-cyan">A</span>
                   <span class="text-signal-emerald">B</span>
               </div>
           </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'mixer-controls': MixerControls;
  }
}