import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('fx-rack')
export class FxRack extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: #000;
      color: #fff;
      font-family: 'Courier New', monospace;
      --fg-color: #fff;
      --grid-color: #333;
    }

    /* Utilities */
    .flex { display: flex; }
    .flex-col { flex-direction: column; }
    .justify-between { justify-content: space-between; }
    .items-center { align-items: center; }
    .items-end { align-items: flex-end; }
    .gap-1 { gap: 4px; }
    .gap-2 { gap: 8px; }
    .gap-4 { gap: 16px; }
    .p-2 { padding: 8px; }
    .border { border: 1px solid var(--fg-color); }
    .border-b { border-bottom: 1px solid rgba(255,255,255,0.3); }
    .text-xxs { font-size: 0.6rem; opacity: 0.7; }
    .font-bold { font-weight: bold; }
    .w-full { width: 100%; }
    .h-full { height: 100%; }
    .text-center { text-align: center; }
    .relative { position: relative; }
    .cursor-pointer { cursor: pointer; }
    .opacity-50 { opacity: 0.5; }

    .rack-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 12px;
      padding: 12px;
      height: 100%;
      overflow-y: auto;
      box-sizing: border-box;
    }

    .module {
      border: 1px solid var(--fg-color);
      display: flex;
      flex-direction: column;
      height: 180px;
      padding: 8px;
      background: #000;
      box-sizing: border-box;
    }

    .module-header {
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255,255,255,0.2);
      padding-bottom: 4px;
      margin-bottom: 8px;
      font-size: 0.6rem;
      flex-shrink: 0;
    }

    .module-content {
      flex-grow: 1;
      position: relative;
      display: flex;
      flex-direction: column;
    }

    /* Toggle Switch */
    .toggle-rect {
        appearance: none;
        width: 30px; height: 16px;
        border: 1px solid var(--fg-color);
        position: relative;
        cursor: pointer;
        outline: none;
    }
    .toggle-rect::after {
        content: ''; position: absolute; top: 1px; left: 1px;
        width: 12px; height: 12px; background-color: var(--fg-color);
        transition: transform 0.2s;
    }
    .toggle-rect:checked::after { transform: translateX(14px); }

    /* XY Pad */
    .xy-grid {
        background-image: 
            linear-gradient(var(--grid-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
        background-size: 20px 20px;
        cursor: crosshair;
        flex-grow: 1;
        position: relative;
        border: 1px solid rgba(255,255,255,0.3);
    }
    .crosshair-x { position: absolute; top: 0; bottom: 0; width: 1px; background: #fff; pointer-events: none; }
    .crosshair-y { position: absolute; left: 0; right: 0; height: 1px; background: #fff; pointer-events: none; }
    .crosshair-pt { position: absolute; width: 6px; height: 6px; border: 1px solid #fff; transform: translate(-50%, -50%); pointer-events: none; }

    /* Bitcrusher */
    .bit-step {
        flex-grow: 1; border-right: 1px solid #333; cursor: pointer; opacity: 0.3;
        background: #333; transition: all 0.1s;
    }
    .bit-step.active { opacity: 1; background: #fff; }
    .bit-step:hover { background: #666; }

    /* Knob SVG */
    .knob-svg { width: 50px; height: 50px; transform: rotate(-90deg); cursor: ns-resize; }
    .knob-circle { transition: stroke-dashoffset 0.1s; }

    /* Meter */
    /* LED Indicator */
    .led {
        width: 8px; height: 8px;
        background: #333;
        border-radius: 50%;
        margin-right: 8px;
        transition: all 0.2s;
        box-shadow: inset 0 0 2px #000;
    }
    .led.on {
        background: #ff0000;
        box-shadow: 0 0 10px #ff0000, inset 0 0 2px #ffcccc;
    }
  `;

  // State
  @property({ type: Number }) bits = 32;
  @property({ type: Number }) sr = 1.0; // Normalized 0-1
  @property({ type: Number }) filterX = 0.5;
  @property({ type: Number }) filterY = 0.5;
  @property({ type: Number }) bloomSize = 0.5;
  @property({ type: Number }) bloomShimmer = 0.5;
  @property({ type: Number }) limiterGR = 0.0; // Gain Reduction dB (visual)
  
  // Active States
  @property({ type: Boolean }) activeFilter = true;
  @property({ type: Boolean }) activeDecimator = true;
  @property({ type: Boolean }) activeReverb = true;
  @property({ type: Boolean }) activeTape = true;
  @property({ type: Boolean }) activeGate = false;
  @property({ type: Boolean }) activeLimiter = true;

  // Handlers
  private updateParam(name: string, val: number) {
      // @ts-ignore
      if (window.engine) window.engine.updateDspParam(name, val);
  }

  render() {
    return html`
      <div class="rack-grid">
        
        <!-- MOD 01: FILTER XY -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeFilter ? 'on' : ''}"></div>
                 <span>MOD_01 // FILTER_XY</span>
             </div>
             <input type="checkbox" class="toggle-rect" ?checked="${this.activeFilter}"
                @change="${(e: any) => {
                    this.activeFilter = e.target.checked;
                    this.updateParam('FILTER_ACTIVE', this.activeFilter ? 1 : 0);
                }}">
          </div>
          <div class="module-content">
             <div class="xy-grid"
                @pointermove="${(e: PointerEvent) => {
                    if (e.buttons !== 1) return;
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    this.filterX = x; this.filterY = y;
                    this.updateParam('HPF', x); 
                    this.updateParam('LPF', 1.0 - y); 
                    this.requestUpdate();
                }}"
                @pointerdown="${(e: PointerEvent) => (e.target as HTMLElement).setPointerCapture(e.pointerId)}"
             >
                <div class="crosshair-x" style="left: ${this.filterX * 100}%"></div>
                <div class="crosshair-y" style="top: ${this.filterY * 100}%"></div>
                <div class="crosshair-pt" style="left: ${this.filterX * 100}%; top: ${this.filterY * 100}%"></div>
             </div>
             <div class="flex justify-between text-xxs mt-1">
                <span>HPF: ${(this.filterX * 20000).toFixed(0)}Hz</span>
                <span>LPF: ${(20000 - this.filterY * 20000).toFixed(0)}Hz</span>
             </div>
          </div>
        </div>

        <!-- MOD 02: DECIMATOR -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeDecimator ? 'on' : ''}"></div>
                 <span>MOD_02 // DECIMATOR</span>
             </div>
             <input type="checkbox" class="toggle-rect" ?checked="${this.activeDecimator}"
                @change="${(e: any) => {
                    this.activeDecimator = e.target.checked;
                    // TODO: Implement Active logic in DSP if needed, currently assumes always processing or mix logic
                }}">
          </div>
          <div class="module-content flex gap-4">
             <!-- Sample Rate -->
             <div class="flex-col flex gap-1 w-full">
                <span class="text-xxs">RATE</span>
                <div class="flex border text-xxs h-6">
                    ${[44, 22, 11, 4].map(k => html`
                        <div class="flex-1 flex items-center justify-center cursor-pointer hover:bg-white hover:text-black
                                    ${this.sr * 44100 < (k*1000 + 1000) && this.sr * 44100 > (k*1000 - 1000) ? 'bg-white text-black' : ''}"
                             @click="${() => { 
                                 const hz = k * 1000;
                                 this.sr = hz / 44100;
                                 this.updateParam('SR', hz);
                                 this.requestUpdate();
                             }}"
                        >${k}k</div>
                    `)}
                </div>
             </div>
             <!-- Bits -->
             <div class="flex-col flex gap-1 w-full flex-grow">
                <span class="text-xxs">BITS</span>
                <div class="flex border h-10">
                    ${Array.from({length: 16}).map((_, i) => html`
                        <div class="bit-step ${i < (this.bits/2) ? 'active' : ''}"
                             @click="${() => {
                                 const b = (i + 1) * 2;
                                 this.bits = b;
                                 this.updateParam('BITS', b);
                                 this.requestUpdate();
                             }}"
                        ></div>
                    `)}
                </div>
                <span class="text-xxs text-center">${this.bits} bit</span>
             </div>
          </div>
        </div>

        <!-- MOD 03: BLOOM VERB -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeReverb ? 'on' : ''}"></div>
                 <span>MOD_03 // BLOOM_VERB</span>
             </div>
             <input type="checkbox" class="toggle-rect" ?checked="${this.activeReverb}"
                @change="${(e: any) => this.activeReverb = e.target.checked}">
          </div>
          <div class="module-content flex items-center justify-around">
            <!-- Knob 1 Size -->
            <div class="flex flex-col items-center">
                <svg class="knob-svg" viewBox="0 0 100 100"
                    @pointermove="${(e: PointerEvent) => {
                        if(e.buttons!==1) return;
                        this.bloomSize = Math.max(0, Math.min(1, this.bloomSize - e.movementY * 0.01));
                        this.updateParam('BLOOM_SIZE', this.bloomSize);
                        this.requestUpdate();
                    }}"
                >
                    <circle cx="50" cy="50" r="40" stroke="#333" stroke-width="8" fill="none" />
                    <circle cx="50" cy="50" r="40" stroke="#fff" stroke-width="8" fill="none" class="knob-circle"
                        stroke-dasharray="${251}" stroke-dashoffset="${251 * (1 - this.bloomSize)}" />
                </svg>
                <span class="text-xxs mt-1">SIZE</span>
            </div>
            <!-- Knob 2 Shimmer -->
             <div class="flex flex-col items-center">
                <svg class="knob-svg" viewBox="0 0 100 100"
                    @pointermove="${(e: PointerEvent) => {
                        if(e.buttons!==1) return;
                        this.bloomShimmer = Math.max(0, Math.min(1, this.bloomShimmer - e.movementY * 0.01));
                        this.updateParam('BLOOM_SHIMMER', this.bloomShimmer);
                        this.requestUpdate();
                    }}"
                >
                    <circle cx="50" cy="50" r="40" stroke="#333" stroke-width="8" fill="none" />
                    <circle cx="50" cy="50" r="40" stroke="#fff" stroke-width="8" fill="none" class="knob-circle"
                        stroke-dasharray="${251}" stroke-dashoffset="${251 * (1 - this.bloomShimmer)}" />
                </svg>
                 <span class="text-xxs mt-1">SHIMMER</span>
            </div>
          </div>
          <!-- Mix Slider -->
          <div class="p-2">
             <input type="range" class="w-full" min="0" max="100" 
                @input="${(e: any) => this.updateParam('BLOOM_MIX', e.target.value / 100)}" 
             >
          </div>
        </div>
        
         <!-- MOD 04: TAPE ECHO -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeTape ? 'on' : ''}"></div>
                 <span>MOD_04 // TAPE_ECHO</span>
             </div>
             <input type="checkbox" class="toggle-rect" ?checked="${this.activeTape}"
                @change="${(e: any) => this.activeTape = e.target.checked}">
          </div>
           <div class="module-content flex flex-col justify-around">
              <div class="flex justify-between text-xxs">
                 <span>FEEDBACK</span>
              </div>
              <input type="range" class="w-full" min="0" max="100"
                 @input="${(e: any) => this.updateParam('DUB', e.target.value / 100)}"
              >
              <div class="flex items-center justify-between border-t border-white/20 pt-2 mt-2">
                  <span class="text-xxs opacity-50">TAPE_HISS</span>
                  <input type="checkbox">
              </div>
           </div>
        </div>
        
         <!-- MOD 05: SPECTRAL GATE -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeGate ? 'on' : ''}"></div>
                 <span>MOD_05 // SPEC_GATE</span>
             </div>
             <input type="checkbox" class="toggle-rect" ?checked="${this.activeGate}"
                @change="${(e: any) => {
                    this.activeGate = e.target.checked;
                    this.updateParam('GATE_THRESH', this.activeGate ? 0.3 : 0.0);
                }}">
          </div>
           <div class="module-content flex flex-col justify-end">
              <div class="flex items-end gap-1 h-20 border-b border-white mb-2 pb-1 relative">
                  <!-- Fake Visualizer Bars -->
                  ${[20, 60, 10, 80, 40, 50].map(h => html`<div style="width:16%; height:${h}%; background:#fff;"></div>`)}
                  <div class="absolute w-full border-t border-dashed border-white opacity-50" style="top: 40%"></div>
              </div>
              <span class="text-xxs">THRESHOLD</span>
              <input type="range" class="w-full" min="0" max="100"
                 @input="${(e: any) => {
                     const v = e.target.value / 100;
                     this.updateParam('GATE_THRESH', v);
                     if(v > 0) this.activeGate = true;
                  }}"
              >
           </div>
        </div>
        
         <!-- MOD 06: MASTER LIMITER -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeLimiter ? 'on' : ''}"></div>
                 <span>MOD_06 // LIMITER</span>
             </div>
             <span style="color:red; background:white; padding:0 2px; font-weight:bold;">CLIP</span>
          </div>
           <div class="module-content flex gap-4 items-center">
              <div class="h-full w-6 border bg-[#333] relative">
                 <div class="absolute top-0 w-full bg-white transition-all" style="height: ${this.limiterGR * 100}%"></div>
              </div>
              <div class="flex flex-col text-xxs gap-2">
                 <div>
                    <div class="opacity-50">RATIO</div>
                    <div class="text-lg font-bold">INF:1</div>
                 </div>
                 <div>
                    <div class="opacity-50">GAIN</div>
                    <div class="text-lg font-bold">+0dB</div>
                 </div>
              </div>
           </div>
        </div>
      </div>
    `;
  }
}
