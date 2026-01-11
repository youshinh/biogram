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
      min-height: 180px; /* Allow growth */
      padding: 8px;
      background: #000;
      box-sizing: border-box;
      overflow: hidden; /* Clip internal overflows */
    }

    /* ... (keep other styles) ... */

    /* Toggle / LED Styles */
    .module-header {
      justify-content: space-between;
      margin-bottom: 8px;
    }
    
    .led {
      width: 8px; height: 8px;
      background: #333;
      border-radius: 50%;
      margin-right: 6px;
      transition: all 0.2s ease;
    }
    .led.on {
      background: #f00;
      box-shadow: 0 0 5px #f00, 0 0 10px #800;
    }

    .toggle-rect {
       appearance: none;
       width: 12px; height: 12px;
       border: 1px solid #fff;
       background: transparent;
       cursor: pointer;
    }
    .toggle-rect:checked {
        background: #fff;
    }

    /* XY Pad */
    .xy-grid {
        background-image: 
            linear-gradient(var(--grid-color) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid-color) 1px, transparent 1px);
        background-size: 20px 20px;
        cursor: crosshair;
        flex-grow: 1; 
        min-height: 120px;
        position: relative;
        border: 1px solid rgba(255,255,255,0.3);
    }
    .crosshair-x { position: absolute; top: 0; bottom: 0; width: 1px; background: #fff; pointer-events: none; }
    .crosshair-y { position: absolute; left: 0; right: 0; height: 1px; background: #fff; pointer-events: none; }
    .crosshair-pt { position: absolute; width: 6px; height: 6px; border: 1px solid #fff; transform: translate(-50%, -50%); pointer-events: none; }

    /* Bitcrusher */
    /* ... */
  `;

  @property({ type: Number }) filterX = 0.5;
  @property({ type: Number }) filterY = 0.5;
  @property({ type: Number }) filterQ = 0.5;

  @property({ type: Boolean }) activeFilter = false;
  @property({ type: Boolean }) activeDecimator = false;
  @property({ type: Boolean }) activeReverb = false;
  @property({ type: Boolean }) activeTape = false;
  @property({ type: Boolean }) activeGate = false;
  @property({ type: Boolean }) activeLimiter = false;

  @property({ type: Number }) sr = 1.0;
  @property({ type: Number }) bits = 16;
  
  @property({ type: Number }) bloomSize = 0.6;
  @property({ type: Number }) bloomShimmer = 0.4;
  @property({ type: Number }) bloomMix = 0.3;

  @property({ type: Number }) limiterGR = 1.0;
  @property({ type: Number }) compRatio = 4;
  @property({ type: Number }) compThresh = 0.7;
  @property({ type: Number }) compGain = 1.2;
  
  @property({ type: Number }) dubSend = 0.0;

  firstUpdated() {
      // Sync initial state
      this.updateParam('FILTER_ACTIVE', this.activeFilter ? 1 : 0);
      this.updateParam('DECIMATOR_ACTIVE', this.activeDecimator ? 1 : 0);
      this.updateParam('REVERB_ACTIVE', this.activeReverb ? 1 : 0);
      this.updateParam('TAPE_ACTIVE', this.activeTape ? 1 : 0);
      this.updateParam('COMP_ACTIVE', this.activeLimiter ? 1 : 0);
      this.updateParam('GATE_THRESH', this.activeGate ? this.compThresh : 0.0);
  }

  updateParam(id: string, val: number) {
    this.dispatchEvent(new CustomEvent('param-change', {
        detail: { id, val },
        bubbles: true,
        composed: true
    }));
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
          <div class="module-content flex flex-col gap-2">
             <div class="xy-grid w-full"
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
                @pointerdown="${(e: PointerEvent) => {
                    (e.target as HTMLElement).setPointerCapture(e.pointerId);
                    const rect = (e.target as HTMLElement).getBoundingClientRect();
                    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
                    this.filterX = x; this.filterY = y;
                    this.updateParam('HPF', x); 
                    this.updateParam('LPF', 1.0 - y); 
                    this.requestUpdate();
                }}"
             >
                <div class="crosshair-x" style="left: ${this.filterX * 100}%"></div>
                <div class="crosshair-y" style="top: ${this.filterY * 100}%"></div>
                <div class="crosshair-pt" style="left: ${this.filterX * 100}%; top: ${this.filterY * 100}%"></div>
             </div>
             <div class="flex flex-col w-full">
                 <div class="flex justify-between text-xxs">
                    <span>RES (Q)</span>
                    <span>${(this.filterQ * 100).toFixed(0)}%</span>
                 </div>
                 <input type="range" 
                    class="w-full"
                    min="0" max="100" value="${this.filterQ * 100}"
                    @input="${(e: any) => {
                        this.filterQ = e.target.value / 100;
                        this.updateParam('FILTER_Q', this.filterQ);
                    }}"
                 >
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
                    this.updateParam('DECIMATOR_ACTIVE', this.activeDecimator ? 1 : 0);
                }}">
          </div>
          <div class="module-content flex flex-col gap-2">
             <!-- Top Row: Sample Rate -->
             <div class="flex gap-2">
                <span class="text-xxs w-12 pt-1">RATE</span>
                <div class="flex flex-wrap gap-1 flex-grow">
                     ${[44100, 22050, 11025, 8000, 4000].map(hz => html`
                         <div class="cursor-pointer text-xxs px-2 border ${Math.abs(this.sr * 44100 - hz) < 500 ? 'bg-white text-black' : 'border-gray-600 hover:border-white'}"
                              @click="${() => { 
                                  this.sr = hz / 44100;
                                  this.updateParam('SR', hz);
                                  this.requestUpdate();
                              }}"
                         >${(hz/1000).toFixed(1)}k</div>
                     `)}
                </div>
             </div>
             
             <!-- Bottom Row: Bits -->
             <div class="flex flex-col gap-1 w-full mt-2">
                 <div class="flex justify-between text-xxs">
                    <span>BITS</span>
                    <span>${this.bits}</span>
                 </div>
                 <input type="range" class="w-full" 
                    min="1" max="16" step="1" value="${this.bits / 2}"
                    @input="${(e: any) => {
                        const b = Number(e.target.value) * 2;
                        this.bits = b;
                        this.updateParam('BITS', b);
                        this.requestUpdate();
                    }}"
                 >
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
                @change="${(e: any) => {
                    this.activeReverb = e.target.checked;
                    this.updateParam('REVERB_ACTIVE', this.activeReverb ? 1 : 0);
                }}">
          </div>
          <div class="module-content flex flex-col justify-around p-1 gap-2">
             <!-- 3 Horizontal Sliders -->
             ${[
                 { label: 'SIZE', val: this.bloomSize, param: 'BLOOM_SIZE' },
                 { label: 'SHIMMER', val: this.bloomShimmer, param: 'BLOOM_SHIMMER' },
                 { label: 'MIX', val: this.bloomMix, param: 'BLOOM_MIX' }
             ].map(ctrl => html`
                 <div class="flex flex-col w-full">
                      <div class="flex justify-between text-xxs">
                          <span>${ctrl.label}</span>
                          <span>${(ctrl.val * 100).toFixed(0)}%</span>
                      </div>
                      <input type="range" 
                             class="w-full"
                             min="0" max="100" value="${ctrl.val * 100}"
                             @input="${(e: any) => {
                                 const v = e.target.value / 100;
                                 if (ctrl.param === 'BLOOM_SIZE') this.bloomSize = v;
                                 if (ctrl.param === 'BLOOM_SHIMMER') this.bloomShimmer = v;
                                 if (ctrl.param === 'BLOOM_MIX') this.bloomMix = v;
                                 this.updateParam(ctrl.param, v);
                                 this.requestUpdate();
                             }}"
                      >
                 </div>
             `)}
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
                @change="${(e: any) => {
                    this.activeTape = e.target.checked;
                    this.updateParam('TAPE_ACTIVE', this.activeTape ? 1 : 0);
                }}">
          </div>
           <div class="module-content flex flex-col justify-around">
              <div class="flex justify-between text-xxs">
                 <span>DUB SEND (FEEDBACK)</span>
                 <span>${(this.dubSend * 100).toFixed(0)}%</span>
              </div>
              <input type="range" class="w-full" min="0" max="100" value="${this.dubSend * 100}"
                 @input="${(e: any) => {
                     this.dubSend = e.target.value / 100;
                     this.updateParam('DUB', this.dubSend);
                 }}"
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

         <!-- MOD 06: DYNAMICS (COMP/LIMIT) -->
        <div class="module">
          <div class="module-header flex items-center">
             <div class="flex items-center">
                 <div class="led ${this.activeLimiter ? 'on' : ''}"></div>
                 <span>MOD_06 // DYNAMICS</span>
             </div>
             <span class="text-xxs ${this.limiterGR < 0.99 ? 'bg-red-500 text-white' : 'opacity-20'} px-1">GR</span>
             <input type="checkbox" class="toggle-rect" ?checked="${this.activeLimiter}"
                @change="${(e: any) => {
                    this.activeLimiter = e.target.checked;
                    this.updateParam('COMP_ACTIVE', this.activeLimiter ? 1 : 0);
                }}">
          </div>
           <div class="module-content flex flex-col gap-2">
              
              <!-- GR Meter (Horizontal Top) -->
              <div class="w-full h-2 bg-[#222] border relative mb-1">
                 <div class="h-full bg-white transition-all opacity-80" 
                      style="width: ${(1.0 - this.limiterGR) * 100}%; background: ${this.limiterGR < 0.9 ? 'red' : 'white'};"></div>
              </div>
              
              <!-- Controls -->
              <div class="flex flex-col gap-2 flex-grow">
                 
                 <!-- Preset Selector -->
                 <div class="flex flex-col gap-1">
                    <span class="text-xxs">PRESET</span>
                    <select class="w-full text-xs bg-black border text-white p-1"
                        @change="${(e: any) => {
                             const p = e.target.value;
                             // Apply Preset
                             if (p === 'LIMIT') { this.compRatio = 20; this.compThresh = 1.0; this.compGain = 1.0; }
                             if (p === 'SMASH') { this.compRatio = 8; this.compThresh = 0.6; this.compGain = 1.5; }
                             if (p === 'VOCAL') { this.compRatio = 4; this.compThresh = 0.7; this.compGain = 1.2; }
                             if (p === 'GLUE') { this.compRatio = 2; this.compThresh = 0.5; this.compGain = 1.1; }
                             
                             this.updateParam('COMP_RATIO', this.compRatio);
                             this.updateParam('COMP_THRESH', this.compThresh);
                             this.updateParam('COMP_MAKEUP', this.compGain);
                             this.requestUpdate();
                        }}"
                    >
                        <option value="LIMIT">MASTER_LIMIT</option>
                        <option value="SMASH">DRUM_SMASH</option>
                        <option value="VOCAL">VOCAL_LEVEL</option>
                        <option value="GLUE">SUB_GLUE</option>
                    </select>
                 </div>

                 <!-- Ratio Selector -->
                 <div class="flex flex-col gap-1">
                    <span class="text-xxs">RATIO</span>
                    <select class="w-full text-xs bg-black border text-white p-1"
                        .value="${this.compRatio}"
                        @change="${(e: any) => {
                            this.compRatio = Number(e.target.value);
                            this.updateParam('COMP_RATIO', this.compRatio);
                            this.requestUpdate();
                        }}"
                    >
                        <option value="2">2:1</option>
                        <option value="4">4:1</option>
                        <option value="8">8:1</option>
                        <option value="20">INF:1</option>
                    </select>
                 </div>

                 <!-- Threshold -->
                 <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-xxs">
                        <span>THRESH</span>
                        <span>${(20 * Math.log10(Math.max(0.001, this.compThresh))).toFixed(1)}dB</span>
                    </div>
                    <input type="range" class="w-full" min="0" max="100" value="${this.compThresh * 100}"
                        @input="${(e: any) => {
                             this.compThresh = e.target.value / 100;
                             this.updateParam('COMP_THRESH', this.compThresh);
                             this.requestUpdate();
                        }}"
                    >
                 </div>
                 
                 <!-- Makeup Gain -->
                 <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-xxs">
                        <span>MAKEUP</span>
                        <span>${(20 * Math.log10(Math.max(0.001, this.compGain))).toFixed(1)}dB</span>
                    </div>
                    <input type="range" class="w-full" min="100" max="300" value="${this.compGain * 100}"
                        @input="${(e: any) => {
                             // 1.0 to 3.0
                             this.compGain = e.target.value / 100;
                             this.updateParam('COMP_MAKEUP', this.compGain);
                             this.requestUpdate();
                        }}"
                    >
                 </div>

              </div>
           </div>
        </div>
      </div>
    `;
  }
}
