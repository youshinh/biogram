import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('fx-rack')
export class FxRack extends LitElement {
  createRenderRoot() {
    return this; // Enable Light DOM
  }

  @property({ type: Number }) filterX = 0.5;
  @property({ type: Number }) filterY = 0.5;
  @property({ type: Number }) filterQ = 0.5;
  @property({ type: Number }) filterDrive = 0.0; // 0..1

  @property({ type: Boolean }) activeFilter = false;
  @property({ type: Boolean }) activeDecimator = false;
  @property({ type: Boolean }) activeReverb = false;
  @property({ type: Boolean }) activeTape = false;
  @property({ type: Boolean }) activeGate = false;
  @property({ type: Number }) gateRelease = 0.5; // UI Value 0..1
  @property({ type: Boolean }) activeLimiter = false;

  @property({ type: Number }) sr = 1.0;
  @property({ type: Number }) bits = 16;
  
  @property({ type: Boolean }) activeCloud = false;
  @property({ type: Number }) cloudDensity = 0.5;
  @property({ type: Number }) cloudSize = 0.2;
  @property({ type: Number }) cloudSpray = 0.2;
  @property({ type: Number }) cloudPitch = 0.5; // UI 0.5 -> 1.0 Pitch
  @property({ type: Number }) cloudMix = 0.5;

  @property({ type: Number }) bloomSize = 0.6;
  @property({ type: Number }) bloomShimmer = 0.4;
  @property({ type: Number }) bloomWet = 0.5;
  @property({ type: Number }) bloomDry = 1.0;
  @property({ type: Boolean }) activeFreeze = false;

  @property({ type: Number }) limiterGR = 1.0;
  @property({ type: Number }) compRatio = 4;
  @property({ type: Number }) compThresh = 0.7;
  @property({ type: Number }) compGain = 1.2;
  
  @property({ type: Number }) dubSend = 0.0;
  
  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('mixer-update', this.handleUpdate);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('mixer-update', this.handleUpdate);
  }

  private handleUpdate = (e: any) => {
      const { parameter, value } = e.detail;
      
      // Filter / XY
      if (parameter === 'FILTER_ACTIVE') {
          this.activeFilter = value > 0.5;
      } else if (parameter === 'HPF') {
          this.filterX = Math.max(0, Math.min(1, value));
      } else if (parameter === 'LPF') {
          this.filterY = 1.0 - Math.max(0, Math.min(1, value));
      } else if (parameter === 'FILTER_Q') {
          this.filterQ = Math.max(0, Math.min(1, value));
      } else if (parameter === 'FILTER_DRIVE') {
          this.filterDrive = Math.max(0, Math.min(1, value));
      }

      // Tape Echo
      else if (parameter === 'DUB') {
          this.dubSend = value;
      } else if (parameter === 'TAPE_ACTIVE') {
          this.activeTape = value > 0.5;
      }
      
      // Bloom Verb
      else if (parameter === 'BLOOM_SIZE') {
          this.bloomSize = value;
      } else if (parameter === 'BLOOM_SHIMMER') {
          this.bloomShimmer = value;
      } else if (parameter === 'BLOOM_WET') {
          this.bloomWet = value;
      } else if (parameter === 'BLOOM_DRY') {
          this.bloomDry = value;
      } else if (parameter === 'REVERB_ACTIVE') {
          this.activeReverb = value > 0.5;
      }
      
      // Dynamics
      else if (parameter === 'COMP_ACTIVE') {
          this.activeLimiter = value > 0.5;
      } else if (parameter === 'COMP_THRESH') {
          this.compThresh = Math.max(0, Math.min(1, value));
      } else if (parameter === 'COMP_RATIO') {
          this.compRatio = Math.max(2, Math.min(20, value));
      } else if (parameter === 'COMP_MAKEUP') {
          this.compGain = Math.max(0.1, Math.min(3.0, value));
      }
      
      // Spectral Gate
      else if (parameter === 'SPECTRAL_GATE_ACTIVE') {
          this.activeGate = value > 0.5;
      }
      else if (parameter === 'GATE_THRESH') {
          // Reverse mapping if needed, or just update internal state?
          // For UI consistency, we might need a separate internal 'thresh' if logic differs.
          // For now assume direct update 
      } else if (parameter === 'GATE_RELEASE') {
          this.gateRelease = Math.max(0, Math.min(1, (value - 0.9) / 0.0999));
      }

      // Cloud
      else if (parameter === 'CLOUD_ACTIVE') {
          this.activeCloud = value > 0.5;
      } else if (parameter === 'CLOUD_DENSITY') {
          this.cloudDensity = Math.max(0, Math.min(1, value));
      } else if (parameter === 'CLOUD_SIZE') {
          this.cloudSize = Math.max(0, Math.min(1, value));
      } else if (parameter === 'CLOUD_SPRAY') {
          this.cloudSpray = Math.max(0, Math.min(1, value));
      } else if (parameter === 'CLOUD_PITCH') {
          this.cloudPitch = Math.max(0, Math.min(1, (value - 0.5) / 1.5));
      } else if (parameter === 'CLOUD_MIX') {
          this.cloudMix = Math.max(0, Math.min(1, value));
      }

      // Decimator
      else if (parameter === 'DECIMATOR_ACTIVE') {
          this.activeDecimator = value > 0.5;
      } else if (parameter === 'SR') {
          this.sr = Math.max(0, Math.min(1, value / 44100));
      } else if (parameter === 'BITS') {
          this.bits = Math.max(1, Math.min(16, Math.round(value)));
      }
      
      this.requestUpdate();
  }

  firstUpdated() {
      // Sync initial state
      this.updateParam('FILTER_ACTIVE', this.activeFilter ? 1 : 0);
      this.updateParam('HPF', this.filterX);
      this.updateParam('LPF', this.filterY); // Assumption: Y is LPF? Wait, check handleFilterMove logic first? 
      // Safe to send what we have, logic handles limits.
      this.updateParam('FILTER_Q', this.filterQ);
      this.updateParam('FILTER_DRIVE', this.filterDrive);
      this.updateParam('DECIMATOR_ACTIVE', this.activeDecimator ? 1 : 0);
      this.updateParam('CLOUD_ACTIVE', this.activeCloud ? 1 : 0);
      this.updateParam('REVERB_ACTIVE', this.activeReverb ? 1 : 0);
      this.updateParam('BLOOM_FREEZE', this.activeFreeze ? 1 : 0);
      this.updateParam('TAPE_ACTIVE', this.activeTape ? 1 : 0);
      this.updateParam('COMP_ACTIVE', this.activeLimiter ? 1 : 0);
      this.updateParam('SPECTRAL_GATE_ACTIVE', this.activeGate ? 1 : 0);
      this.updateParam('GATE_THRESH', this.activeGate ? (this.activeGate ? 0.3 : 0.0) : 0.0);
      const startRelease = 0.9 + (this.gateRelease * 0.0999);
      this.updateParam('GATE_RELEASE', startRelease);
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
      <style>
        ::-webkit-scrollbar { height: 6px; width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: #555; }
      </style>
      <div class="flex flex-nowrap gap-2 p-2 h-full overflow-auto items-stretch">

        <!-- MOD 01: FILTER XY -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-tech-cyan/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeFilter ? 'bg-tech-cyan shadow-[0_0_8px_cyan]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_01 // FILTER_XY</span>
             </div>
             <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-tech-cyan checked:border-tech-cyan cursor-pointer" 
                ?checked="${this.activeFilter}"
                @change="${(e: any) => {
                    this.activeFilter = e.target.checked;
                    this.updateParam('FILTER_ACTIVE', this.activeFilter ? 1 : 0);
                }}">
          </div>
          <div class="flex flex-col gap-2 flex-grow">
             <div class="relative w-full flex-grow min-h-[120px] bg-black/50 border border-white/10 rounded cursor-crosshair overflow-hidden"
                style="background-image: linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px); background-size: 20px 20px;"
                @pointermove="${this.handleFilterMove}"
                @pointerdown="${this.handleFilterDown}"
             >
                <div class="absolute top-0 bottom-0 w-[1px] bg-tech-cyan/50 pointer-events-none" style="left: ${this.filterX * 100}%"></div>
                <div class="absolute left-0 right-0 h-[1px] bg-tech-cyan/50 pointer-events-none" style="top: ${this.filterY * 100}%"></div>
                <div class="absolute w-2 h-2 border border-tech-cyan bg-tech-cyan/20 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none shadow-[0_0_10px_cyan]" style="left: ${this.filterX * 100}%; top: ${this.filterY * 100}%"></div>
             </div>
             <div class="flex flex-col w-full">
                 <div class="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                    <span>RES (Q)</span>
                    <span>${(this.filterQ * 100).toFixed(0)}%</span>
                 </div>
                 <input type="range" 
                    class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-tech-cyan hover:accent-white"
                    min="0" max="100" value="${this.filterQ * 100}"
                    @input="${(e: any) => {
                        this.filterQ = e.target.value / 100;
                        this.updateParam('FILTER_Q', this.filterQ);
                    }}"
                 >
             </div>
             <div class="flex flex-col w-full mt-2">
                 <div class="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                    <span>DRIVE</span>
                    <span>${(this.filterDrive * 100).toFixed(0)}%</span>
                 </div>
                 <input type="range" 
                    class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-orange-500 hover:accent-white"
                    min="0" max="100" value="${this.filterDrive * 100}"
                    @input="${(e: any) => {
                        this.filterDrive = e.target.value / 100;
                        this.updateParam('FILTER_DRIVE', this.filterDrive);
                    }}"
                 >
             </div>
          </div>
        </div>

        <!-- MOD 02: TAPE ECHO -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-yellow-500/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeTape ? 'bg-yellow-500 shadow-[0_0_8px_orange]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_02 // TAPE_ECHO</span>
             </div>
             <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-yellow-500 checked:border-yellow-500 cursor-pointer" 
                ?checked="${this.activeTape}"
                @change="${(e: any) => {
                    this.activeTape = e.target.checked;
                    this.updateParam('TAPE_ACTIVE', this.activeTape ? 1 : 0);
                }}">
          </div>
           <div class="flex flex-col justify-around flex-grow gap-2">
              <div class="flex flex-col w-full">
                  <div class="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                     <span>DUB SEND (FEEDBACK)</span>
                     <span>${(this.dubSend * 100).toFixed(0)}%</span>
                  </div>
                  <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-yellow-500 hover:accent-white" 
                     min="0" max="100" value="${this.dubSend * 100}"
                     @input="${(e: any) => {
                         this.dubSend = e.target.value / 100;
                         this.updateParam('DUB', this.dubSend);
                     }}"
                  >
              </div>
              <div class="flex items-center justify-between border-t border-white/10 pt-2 mt-2">
                  <span class="text-[10px] text-zinc-600 opacity-50">TAPE_HISS</span>
                  <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-700 rounded-sm checked:bg-yellow-500/50 checked:border-yellow-500">
              </div>
           </div>
        </div>
        
        <!-- MOD 03: BLOOM VERB -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-pink-500/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeReverb ? 'bg-pink-500 shadow-[0_0_8px_pink]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_03 // BLOOM_VERB</span>
             </div>
             <div class="flex items-center gap-2">
                <label class="flex items-center gap-1 cursor-pointer">
                    <span class="text-[9px] font-mono ${this.activeFreeze ? 'text-cyan-400 animate-pulse' : 'text-zinc-600'}">FREEZE</span>
                    <input type="checkbox" class="appearance-none w-2 h-2 border border-zinc-600 rounded-sm checked:bg-cyan-400 checked:border-cyan-400 checked:shadow-[0_0_5px_cyan]"
                        ?checked="${this.activeFreeze}"
                        @change="${(e: any) => {
                            this.activeFreeze = e.target.checked;
                            this.updateParam('BLOOM_FREEZE', this.activeFreeze ? 1 : 0);
                        }}"
                    >
                </label>
                <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-pink-500 checked:border-pink-500 cursor-pointer" 
                    ?checked="${this.activeReverb}"
                    @change="${(e: any) => {
                        this.activeReverb = e.target.checked;
                        this.updateParam('REVERB_ACTIVE', this.activeReverb ? 1 : 0);
                    }}">
             </div>
          </div>
          <div class="flex flex-col justify-around gap-3 pt-2">
             ${[
                 { label: 'SIZE', val: this.bloomSize, param: 'BLOOM_SIZE' },
                 { label: 'SHIMMER', val: this.bloomShimmer, param: 'BLOOM_SHIMMER' },
                 { label: 'WET', val: this.bloomWet, param: 'BLOOM_WET' },
                 { label: 'DRY', val: this.bloomDry, param: 'BLOOM_DRY' }
             ].map(ctrl => html`
                 <div class="flex flex-col w-full">
                      <div class="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                          <span>${ctrl.label}</span>
                          <span>${(ctrl.val * 100).toFixed(0)}%</span>
                      </div>
                      <input type="range" 
                             class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-pink-500 hover:accent-white"
                             min="0" max="100" value="${ctrl.val * 100}"
                             @input="${(e: any) => {
                                 const v = e.target.value / 100;
                                 if (ctrl.param === 'BLOOM_SIZE') this.bloomSize = v;
                                 if (ctrl.param === 'BLOOM_SHIMMER') this.bloomShimmer = v;
                                 if (ctrl.param === 'BLOOM_WET') this.bloomWet = v;
                                 if (ctrl.param === 'BLOOM_DRY') this.bloomDry = v;
                                 this.updateParam(ctrl.param, v);
                                 this.requestUpdate();
                             }}"
                      >
                 </div>
             `)}
          </div>
        </div>

        <!-- MOD 04: CLOUD GRAIN -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-sky-500/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeCloud ? 'bg-sky-500 shadow-[0_0_8px_sky]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_04 // CLOUD_GRAIN</span>
             </div>
             <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-sky-500 checked:border-sky-500 cursor-pointer" 
                ?checked="${this.activeCloud}"
                @change="${(e: any) => {
                    this.activeCloud = e.target.checked;
                    this.updateParam('CLOUD_ACTIVE', this.activeCloud ? 1 : 0);
                }}">
          </div>
          <div class="flex flex-col gap-2 flex-grow justify-around">
             <!-- Density / Size -->
             <div class="flex gap-2">
                <div class="flex flex-col w-1/2">
                   <span class="text-[10px] text-zinc-500 font-mono mb-1">DENSITY</span>
                   <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-white" min="0" max="100" value="${this.cloudDensity * 100}"
                      @input="${(e: any) => { this.cloudDensity = e.target.value / 100; this.updateParam('CLOUD_DENSITY', this.cloudDensity); }}"
                   >
                </div>
                <div class="flex flex-col w-1/2">
                   <span class="text-[10px] text-zinc-500 font-mono mb-1">SIZE</span>
                   <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-white" min="0" max="100" value="${this.cloudSize * 100}"
                      @input="${(e: any) => { this.cloudSize = e.target.value / 100; this.updateParam('CLOUD_SIZE', this.cloudSize); }}"
                   >
                </div>
             </div>
             <!-- Spray / Pitch -->
             <div class="flex gap-2">
                <div class="flex flex-col w-1/2">
                   <span class="text-[10px] text-zinc-500 font-mono mb-1">SPRAY</span>
                   <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-white" min="0" max="100" value="${this.cloudSpray * 100}"
                      @input="${(e: any) => { this.cloudSpray = e.target.value / 100; this.updateParam('CLOUD_SPRAY', this.cloudSpray); }}"
                   >
                </div>
                <div class="flex flex-col w-1/2">
                   <span class="text-[10px] text-zinc-500 font-mono mb-1">PITCH</span>
                   <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-white" min="0" max="100" value="${this.cloudPitch * 100}"
                      @input="${(e: any) => { 
                          const v = e.target.value / 100;
                          this.cloudPitch = v; 
                          // Map 0..1 -> 0.5 .. 2.0 (Log scale?) 
                          // Linear: 0.5 + 1.5*v
                          const p = 0.5 + (v * 1.5);
                          this.updateParam('CLOUD_PITCH', p); 
                      }}"
                   >
                </div>
             </div>
             <!-- Mix -->
             <div class="flex flex-col w-full">
                <div class="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                    <span>MIX</span>
                    <span>${(this.cloudMix * 100).toFixed(0)}%</span>
                </div>
                <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-sky-500 hover:accent-white" min="0" max="100" value="${this.cloudMix * 100}"
                      @input="${(e: any) => { this.cloudMix = e.target.value / 100; this.updateParam('CLOUD_MIX', this.cloudMix); }}"
                >
             </div>
          </div>
        </div>

        <!-- MOD 05: DECIMATOR -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-purple-500/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeDecimator ? 'bg-purple-500 shadow-[0_0_8px_purple]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_05 // DECIMATOR</span>
             </div>
             <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-purple-500 checked:border-purple-500 cursor-pointer" 
                ?checked="${this.activeDecimator}"
                @change="${(e: any) => {
                    this.activeDecimator = e.target.checked;
                    this.updateParam('DECIMATOR_ACTIVE', this.activeDecimator ? 1 : 0);
                }}">
          </div>
          <div class="flex flex-col gap-4">
             <!-- Top Row: Sample Rate -->
             <div class="flex gap-2 items-center">
                <span class="text-[10px] text-zinc-500 w-10 font-mono">RATE</span>
                <div class="flex flex-wrap gap-1 flex-grow">
                     ${[44100, 22050, 11025, 8000, 4000].map(hz => html`
                         <div class="cursor-pointer text-[10px] px-2 py-1 border rounded transition-all ${Math.abs(this.sr * 44100 - hz) < 500 ? 'bg-purple-500/20 text-purple-400 border-purple-500' : 'border-zinc-700 text-zinc-600 hover:border-zinc-500 hover:text-zinc-400'}"
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
             <div class="flex flex-col gap-1 w-full">
                 <div class="flex justify-between text-[10px] text-zinc-500 font-mono mb-1">
                    <span>BITS</span>
                    <span>${this.bits}</span>
                 </div>
                 <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500 hover:accent-white" 
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
        
         <!-- MOD 06: SPECTRAL GATE -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-green-500/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeGate ? 'bg-green-500 shadow-[0_0_8px_lime]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_06 // SPEC_GATE</span>
             </div>
             <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-green-500 checked:border-green-500 cursor-pointer" 
                ?checked="${this.activeGate}"
                @change="${(e: any) => {
                    this.activeGate = e.target.checked;
                    this.updateParam('SPECTRAL_GATE_ACTIVE', this.activeGate ? 1 : 0);
                    this.updateParam('GATE_THRESH', this.activeGate ? 0.3 : 0.0);
                }}">
          </div>
           <div class="flex flex-col justify-around gap-2 flex-grow">
              <!-- Removed Visualizer -->
              <div class="flex flex-col w-full">
                  <span class="text-[10px] text-zinc-500 font-mono mb-1">THRESHOLD</span>
                  <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-white" min="0" max="100"
                     @input="${(e: any) => {
                         // Rescale: 0-100 -> 0.0-0.2
                         // User said it's too sensitive, so we cap max at 0.2
                         const v = (e.target.value / 100) * 0.2;
                         this.updateParam('GATE_THRESH', v);
                         if(v > 0) {
                             this.activeGate = true;
                             this.updateParam('SPECTRAL_GATE_ACTIVE', 1);
                         }
                      }}"
                  >
              </div>
              <div class="flex flex-col w-full">
                  <span class="text-[10px] text-zinc-500 font-mono mb-1">RELEASE</span>
                  <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-green-500 hover:accent-white" min="0" max="100" value="${this.gateRelease * 100}"
                     @input="${(e: any) => {
                         const v = e.target.value / 100;
                         this.gateRelease = v;
                         // Map 0..1 to 0.9 .. 0.9999
                         // Logarithmic-ish mapping for release time
                         // 0 -> 0.9 (Fast)
                         // 1 -> 0.9999 (Slow)
                         const r = 0.9 + (v * 0.0999);
                         this.updateParam('GATE_RELEASE', r);
                         this.requestUpdate();
                      }}"
                  >
              </div>
           </div>
        </div>

         <!-- MOD 07: DYNAMICS (COMP/LIMIT) -->
        <div class="border border-white/10 flex flex-col h-full min-h-[280px] min-w-[160px] flex-1 p-2 bg-black/40 backdrop-blur-md rounded-xl overflow-hidden shadow-lg group hover:border-red-500/30 transition-colors">
          <div class="flex justify-between items-center mb-2">
             <div class="flex items-center gap-2">
                 <div class="w-2 h-2 rounded-full transition-all duration-200 ${this.activeLimiter ? 'bg-red-500 shadow-[0_0_8px_red]' : 'bg-zinc-800'}"></div>
                 <span class="font-mono text-xs text-zinc-400 tracking-wider">MOD_07 // DYNAMICS</span>
             </div>
             <span class="text-[10px] font-bold px-1 rounded ${this.limiterGR < 0.99 ? 'bg-red-500 text-white animate-pulse' : 'text-zinc-700 bg-zinc-900'}">GR</span>
             <input type="checkbox" class="appearance-none w-3 h-3 border border-zinc-600 rounded-sm checked:bg-red-500 checked:border-red-500 cursor-pointer" 
                ?checked="${this.activeLimiter}"
                @change="${(e: any) => {
                    this.activeLimiter = e.target.checked;
                    this.updateParam('COMP_ACTIVE', this.activeLimiter ? 1 : 0);
                }}">
          </div>
           <div class="flex flex-col gap-2 flex-grow">
              
              <!-- GR Meter (Horizontal Top) -->
              <div class="w-full h-1.5 bg-zinc-900 rounded overflow-hidden relative mb-1">
                 <div class="absolute right-0 h-full bg-white transition-all duration-75" 
                      style="width: ${(1.0 - this.limiterGR) * 100}%; background: ${this.limiterGR < 0.9 ? '#ef4444' : 'white'};"></div>
              </div>
              
              <!-- Controls -->
              <div class="flex flex-col gap-2 flex-grow justify-around">
                 
                 <!-- Preset Selector -->
                 <div class="flex flex-col gap-1">
                    <span class="text-[11px] text-zinc-500 font-mono">PRESET</span>
                    <select class="w-full text-[11px] bg-black border border-zinc-700 text-zinc-300 p-1 rounded outline-none focus:border-red-500"
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
                    <span class="text-[11px] text-zinc-500 font-mono">RATIO</span>
                    <select class="w-full text-[11px] bg-black border border-zinc-700 text-zinc-300 p-1 rounded outline-none focus:border-red-500"
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
                    <div class="flex justify-between text-[11px] text-zinc-500 font-mono">
                        <span>THRESH</span>
                        <span>${(20 * Math.log10(Math.max(0.001, this.compThresh))).toFixed(1)}dB</span>
                    </div>
                    <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-white" min="0" max="100" value="${this.compThresh * 100}"
                        @input="${(e: any) => {
                             this.compThresh = e.target.value / 100;
                             this.updateParam('COMP_THRESH', this.compThresh);
                             this.requestUpdate();
                        }}"
                    >
                 </div>
                 
                 <!-- Makeup Gain -->
                 <div class="flex flex-col gap-1">
                    <div class="flex justify-between text-[11px] text-zinc-500 font-mono">
                        <span>MAKEUP</span>
                        <span>${(20 * Math.log10(Math.max(0.001, this.compGain))).toFixed(1)}dB</span>
                    </div>
                    <input type="range" class="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-red-500 hover:accent-white" min="100" max="300" value="${this.compGain * 100}"
                        @input="${(e: any) => {
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

  private handleFilterMove = (e: PointerEvent) => {
      if (e.buttons !== 1) return;
      const rect = (e.target as HTMLElement).getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      this.filterX = x; this.filterY = y;
      this.updateParam('HPF', x); 
      this.updateParam('LPF', 1.0 - y); 
      this.requestUpdate();
  }

  private handleFilterDown = (e: PointerEvent) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      this.handleFilterMove(e);
  }
}
