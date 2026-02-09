
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { VisualMode } from '../visuals/modes';

@customElement('super-controls')
export class SuperControls extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      min-height: 0;
      background: rgba(0,0,0,0.5);
      color: white;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px;
      padding-top: 0; /* Minimize top clearance specifically */
      box-sizing: border-box;
    }

    .container {
      display: grid;
      grid-template-columns: minmax(320px, 420px) minmax(260px, 0.82fr) minmax(320px, 420px);
      gap: 14px;
      height: 100%;
      min-height: 0;
    }

    .panel {
      background: rgba(0, 0, 0, 0.4); 
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 1.5rem; 
      padding: 12px; /* Reduced from 16px */
      display: flex;
      flex-direction: column;
      gap: 8px; /* Reduced from 16px to fit without scroll */
      backdrop-filter: blur(12px);
      overflow-y: auto; 
      min-height: 0;
    }

    .panel-monitor {
      overflow: hidden;
    }

    .status-strip {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .chip {
      font-size: 0.62rem;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid #2a2a2a;
      background: rgba(0, 0, 0, 0.45);
      color: #cfcfcf;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .chip.active {
      border-color: #0ea5e9;
      color: #e0f2fe;
      box-shadow: 0 0 10px rgba(14, 165, 233, 0.2);
    }

    .policy-box {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      background: rgba(8, 8, 8, 0.55);
      padding: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .policy-title {
      font-size: 0.62rem;
      color: #7dd3fc;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .policy-line {
      font-size: 0.65rem;
      color: #94a3b8;
      line-height: 1.4;
    }
    
    .panel-header {
      font-size: 0.75rem;
      color: #71717a;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      padding-bottom: 6px; /* Reduced */
    }

    /* CONTROLS */
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 4px; /* Reduced from 8px */
    }

    label {
      font-size: 0.7rem;
      color: #a1a1aa;
    }

    select, input[type="text"] {
      background: rgba(0,0,0,0.5); 
      border: 1px solid #27272a;
      color: #d4d4d8;
      padding: 6px; /* Reduced from 8px */
      border-radius: 8px; 
      font-family: inherit;
      outline: none;
    }
    
    select:focus, input:focus {
      border-color: #2dd4bf; 
    }
    
    option {
      background-color: #000;
      color: #fff;
    }

    .trigger-btn {
      background: #18181b; 
      border: 1px solid #334155;
      color: #ffffff; /* Brighter text */
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: bold;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5); /* Readable text on bright bg */
    }

    .mix-actions {
      gap: 10px;
    }

    .mix-actions .trigger-btn {
      min-height: clamp(44px, 6vh, 56px);
      padding: 14px 12px;
      font-size: 0.95rem;
    }

    .mix-actions .trigger-btn:last-child {
      min-height: clamp(40px, 5.2vh, 48px);
      font-size: 0.82rem;
    }

    .trigger-ab {
      /* Cyan (#22d3ee) -> Black -> Green (#10b981) */
      background: linear-gradient(90deg, #22d3ee, #000000, #10b981); 
      border-color: #083344; 
    }
    .trigger-ab:hover:not(:disabled) {
      background: linear-gradient(90deg, #22d3ee, #111, #10b981);
      box-shadow: 0 0 15px rgba(34, 211, 238, 0.3);
    }

    .trigger-ba {
       /* Green (#10b981) -> Black -> Cyan (#22d3ee) */
      background: linear-gradient(90deg, #10b981, #000000, #22d3ee);
      border-color: #064e3b;
    }
    .trigger-ba:hover:not(:disabled) {
      background: linear-gradient(90deg, #10b981, #111, #22d3ee);
      box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
    }

    .trigger-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      filter: grayscale(0.8);
    }
    
    /* MONITOR */
    .monitor-display {
      flex-grow: 1;
      background: #000;
      border-radius: 8px;
      border: 1px solid #333;
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      min-height: 244px;
      height: 100%;
    }

    .monitor-display.state-idle { border-color: #3f3f46; }
    .monitor-display.state-generating { border-color: #0369a1; box-shadow: inset 0 0 24px rgba(2, 132, 199, 0.18); }
    .monitor-display.state-ready { border-color: #0f766e; box-shadow: inset 0 0 24px rgba(20, 184, 166, 0.16); }
    .monitor-display.state-mixing { border-color: #0e7490; box-shadow: inset 0 0 24px rgba(14, 116, 144, 0.2); }
    .monitor-display.state-post { border-color: #a16207; box-shadow: inset 0 0 24px rgba(202, 138, 4, 0.18); }
    .monitor-display.state-wait { border-color: #6d28d9; box-shadow: inset 0 0 24px rgba(124, 58, 237, 0.16); }
    .monitor-display.state-complete { border-color: #15803d; box-shadow: inset 0 0 24px rgba(22, 163, 74, 0.14); }
    
    .phase-text {
      font-size: 1.6rem;
      font-weight: bold;
      color: rgba(255,255,255,0.1);
      transition: color 0.3s;
      letter-spacing: 0.06em;
    }
    .phase-active {
      color: #2dd4bf;
      text-shadow: 0 0 20px rgba(45,212,191,0.5);
    }
    
    .progress-bar {
      width: 80%;
      height: 4px;
      background: #333;
      border-radius: 2px;
      margin-top: 16px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      background: #2dd4bf;
      width: 0%;
      transition: width 0.1s linear;
    }

    .progress-fill.state-generating { background: linear-gradient(90deg, #0ea5e9, #38bdf8); }
    .progress-fill.state-ready { background: linear-gradient(90deg, #14b8a6, #2dd4bf); }
    .progress-fill.state-mixing { background: linear-gradient(90deg, #0891b2, #22d3ee); }
    .progress-fill.state-post { background: linear-gradient(90deg, #d97706, #f59e0b); }
    .progress-fill.state-wait { background: linear-gradient(90deg, #7c3aed, #a78bfa); }
    .progress-fill.state-complete { background: linear-gradient(90deg, #16a34a, #4ade80); }

    .state-pill {
      position: absolute;
      top: 8px;
      right: 8px;
      font-size: 0.62rem;
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid #3a3a3a;
      background: rgba(0,0,0,0.5);
      color: #a1a1aa;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .state-pill.live {
      border-color: #14b8a6;
      color: #99f6e4;
      box-shadow: 0 0 10px rgba(20,184,166,0.25);
    }

    .state-pill.state-idle { border-color: #3f3f46; color: #a1a1aa; }
    .state-pill.state-generating { border-color: #0284c7; color: #bae6fd; }
    .state-pill.state-ready { border-color: #14b8a6; color: #99f6e4; }
    .state-pill.state-mixing { border-color: #06b6d4; color: #cffafe; }
    .state-pill.state-post { border-color: #f59e0b; color: #fde68a; }
    .state-pill.state-wait { border-color: #8b5cf6; color: #ddd6fe; }
    .state-pill.state-complete { border-color: #22c55e; color: #dcfce7; }

    @keyframes pulse {
      0% { opacity: 0.6; }
      50% { opacity: 1.0; }
      100% { opacity: 0.6; }
    }

    /* HISTORY */
    .log-entry {
      font-size: 0.7rem;
      padding: 4px 0;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      color: #a1a1aa;
    }
    .log-time { color: #52525b; margin-right: 8px; }

    /* Custom Scrollbar */
    *::-webkit-scrollbar {
      width: 4px;
    }
    *::-webkit-scrollbar-track {
      background: rgba(0,0,0,0.1);
    }
    *::-webkit-scrollbar-thumb {
      background: #333;
      border-radius: 2px;
    }
    *::-webkit-scrollbar-thumb:hover {
      background: #555;
    }

    @media (max-width: 1280px) {
      .container {
        grid-template-columns: 1fr;
        grid-auto-rows: minmax(220px, auto);
      }
      .panel {
        max-height: 36vh;
      }
      .monitor-display {
        min-height: 200px;
      }
    }

    @media (max-height: 920px) {
      .container {
        gap: 10px;
      }
      .panel {
        padding: 10px;
        gap: 6px;
      }
      .monitor-display {
        min-height: 208px;
      }
      .phase-text {
        font-size: 1.35rem;
      }
    }

    @media (max-height: 820px) {
      .container {
        gap: 8px;
      }
      .panel {
        padding: 8px;
        gap: 5px;
      }
      .panel-header {
        font-size: 0.68rem;
        padding-bottom: 4px;
      }
      .status-strip {
        gap: 4px;
      }
      .chip {
        font-size: 0.58rem;
        padding: 3px 6px;
      }
      .control-group {
        gap: 3px;
      }
      select, input[type="text"] {
        padding: 5px;
      }
      .monitor-display {
        min-height: 184px;
      }
      .phase-text {
        font-size: 1.1rem;
      }
      .progress-bar {
        margin-top: 10px;
      }
      .log-entry {
        font-size: 0.64rem;
        padding: 3px 0;
      }
    }
  `;

  @property({ type: String }) mixState = 'IDLE'; // IDLE, GENERATING, READY, MIXING
  @property({ type: Number }) progress = 0; // 0..1
  @property({ type: Number }) currentBar = 0;
  @property({ type: String }) currentPhase = "READY"; // READY, PRESENCE, HANDOFF, WASH_OUT, DONE

  @state() duration = 64;
  @state() mood = "Organic Deep";
  @state() preferredVisual: VisualMode = 'organic';
  @state() sessionMode: 'single' | 'free' = 'single';
  @state() maxRuntimeMin = 60;
  @state() aiVisualsEnabled = false;
  @state() logs: string[] = [];

	  render() {
      const stateClass = this.getStateClass();
	    return html`
      <div class="container">
        <!-- 1. DIRECTOR PANEL -->
        <div class="panel">
           <div class="panel-header">AI DIRECTOR</div>
           <div class="status-strip">
               <span class="chip ${this.sessionMode === 'single' ? 'active' : ''}">Single</span>
               <span class="chip ${this.sessionMode === 'free' ? 'active' : ''}">Free</span>
               <span class="chip ${this.aiVisualsEnabled ? 'active' : ''}">Visual AI ${this.aiVisualsEnabled ? 'ON' : 'OFF'}</span>
           </div>
           
           <div class="control-group">
               <label>DURATION (BARS)</label>
               <select .value="${String(this.duration)}" @change="${(e:any) => this.duration = Number(e.target.value)}">
                   <option value="16">16 - Short Cut</option>
                   <option value="32">32 - Standard</option>
                   <option value="64">64 - Long Mix</option>
                   <option value="128">128 - Extended</option>
               </select>
           </div>

           <div class="control-group">
               <label>SESSION MODE</label>
               <select .value="${this.sessionMode}" @change="${(e:any) => this.sessionMode = e.target.value}">
                   <option value="single">SINGLE MIX</option>
                   <option value="free">FREE MODE</option>
               </select>
           </div>

           ${this.sessionMode === 'free' ? html`
               <div class="policy-box">
                   <div class="policy-title">FREE LOOP CONFIG</div>
                   <div class="control-group">
                       <label>MAX RUNTIME (MIN)</label>
                       <select .value="${String(this.maxRuntimeMin)}" @change="${(e:any) => this.maxRuntimeMin = Number(e.target.value)}">
                           <option value="15">15</option>
                           <option value="30">30</option>
                           <option value="45">45</option>
                           <option value="60">60</option>
                       </select>
                   </div>
                   <div class="policy-line">Mood / Visualは現在のDeck Prompt文脈に自動追従</div>
                   <div class="policy-line">DirectionはPINGPONG (A↔B) で自動運転</div>
               </div>
           ` : ''}

           ${this.sessionMode === 'single' ? html`
               <div class="control-group">
                   <label>MOOD / STYLE</label>
                   <select .value="${this.mood}" @change="${(e:any) => this.mood = e.target.value}">
                       <option value="Organic Deep">Organic Deep (Sigmoid Handoff)</option>
                       <option value="Rhythmic Swap">Rhythmic Swap (Slicer Cut)</option>
                       <option value="Chaos Gen">Chaos Gen (Noise/Glitch)</option>
                       <option value="Cinema">Cinema (Reverb Wash)</option>
                   </select>
               </div>

               <div class="control-group">
                   <label>VISUAL STYLE</label>
                   <select .value="${this.preferredVisual}" @change="${(e:any) => this.preferredVisual = e.target.value as VisualMode}">
                       <option value="organic">ORGANIC</option>
                       <option value="wireframe">MATH</option>
                       <option value="monochrome">PARTICLES</option>
                       <option value="rings">RINGS</option>
                       <option value="waves">WAVES</option>
                       <option value="suibokuga">HALID</option>
                       <option value="grid">GLAZE</option>
                       <option value="ai_grid">GNOSIS</option>
                   </select>
               </div>
           ` : ''}

           <div class="policy-box">
               <div class="policy-title">TRANSITION POLICY</div>
               <div class="policy-line">Allowed: fade_in / fade_out / crossfade / soft_overlay / sweep_line_smear</div>
               <div class="policy-line">Intensity: 0.0 - 1.0 (default 0.35)</div>
               <div class="policy-line">No hard flash / no aggressive glitch / no strobe</div>
           </div>
           
           <div style="flex-grow:1"></div>

           <div class="control-group mix-actions">
               ${this.sessionMode === 'single' ? html`
                   <button class="trigger-btn trigger-ab" 
                      @click="${() => this.triggerSingleMix('A->B')}"
                      ?disabled="${this.mixState !== 'IDLE'}">
                      <span>DECK A &rarr; B</span>
                   </button>
                   <button class="trigger-btn trigger-ba" 
                      @click="${() => this.triggerSingleMix('B->A')}"
                      ?disabled="${this.mixState !== 'IDLE'}">
                      <span>DECK B &rarr; A</span>
                   </button>
               ` : html`
                   <button class="trigger-btn trigger-ab" 
                      @click="${this.startFreeMode}"
                      ?disabled="${this.mixState !== 'IDLE' && this.mixState !== 'COMPLETE'}">
                      <span>START FREE MODE</span>
                   </button>
               `}
               
               <button class="trigger-btn" 
                       style="margin-top: 8px; border: 1px solid ${this.aiVisualsEnabled ? '#10b981' : '#333'}; color: ${this.aiVisualsEnabled ? '#10b981' : '#666'};"
                       @click="${this.toggleAiVisuals}">
                   ${this.aiVisualsEnabled ? 'AI AUTO-MIX: ON' : 'AI AUTO-MIX: OFF'}
               </button>
           </div>
        </div>

        <!-- 2. PROGRESS MONITOR -->
        <div class="panel panel-monitor">
            <div class="panel-header">MIX MONITOR</div>
            <div class="monitor-display ${stateClass}">
                <div class="state-pill ${stateClass} ${this.mixState === 'MIXING' || this.mixState === 'WAIT_NEXT' ? 'live' : ''}">
                    ${this.mixState}
                </div>
                ${this.mixState === 'GENERATING' ? html`
                    <div class="phase-text phase-active" style="font-size:1rem; animation: pulse 1s infinite;">
                        ARCHITECTING MIX...
                    </div>
                ` : this.mixState === 'READY' ? html`
                     <div class="phase-text phase-active" style="font-size:1.5rem; color:#2dd4bf;">
                        MIX READY
                     </div>
                     <div style="margin-top:10px; font-size:0.8rem; color:#71717a;">
                        Press START to Execute
                     </div>
                ` : this.mixState === 'MIXING' ? html`
                    <div class="phase-text ${this.currentPhase === 'PRESENCE' ? 'phase-active' : ''}">PRESENCE</div>
                    <div class="phase-text ${this.currentPhase === 'HANDOFF' ? 'phase-active' : ''}">HANDOFF</div>
                    <div class="phase-text ${(this.currentPhase === 'WASH_OUT' || this.currentPhase === 'WASH OUT') ? 'phase-active' : ''}">WASH OUT</div>
                    
                    <div class="progress-bar">
                        <div class="progress-fill ${stateClass}" style="width: ${this.progress * 100}%"></div>
                    </div>
                    
                    <div style="margin-top:16px; font-size:0.8rem; color:#71717a;">
                        BAR: ${this.currentBar.toFixed(1)} / ${this.duration}
                    </div>
                ` : this.mixState === 'WAIT_NEXT' ? html`
                    <div class="phase-text phase-active" style="font-size:1.2rem;">WAIT NEXT</div>
                    <div style="margin-top:10px; font-size:0.8rem; color:#71717a;">
                        Free Mode trigger standby...
                    </div>
                ` : this.mixState === 'POST_REGEN' ? html`
                    <div class="phase-text phase-active" style="font-size:1.2rem;">POST REGEN</div>
                    <div style="margin-top:10px; font-size:0.8rem; color:#71717a;">
                        Regenerating stopped deck.
                    </div>
                ` : this.mixState === 'COMPLETE' ? html`
                    <div class="phase-text phase-active" style="font-size:1.2rem;">COMPLETE</div>
                ` : html`
                    <div style="color:rgba(255,255,255,0.2);">IDLE</div>
                `}
            </div>
        </div>

        <!-- 3. LOGS / STATUS -->
        <div class="panel">
            <div class="panel-header">SYSTEM LOG / ACTION</div>
            <div class="status-strip">
                <span class="chip">Mode ${this.sessionMode.toUpperCase()}</span>
                <span class="chip">${this.sessionMode === 'free' ? 'PINGPONG AUTO' : 'ONE SHOT'}</span>
                <span class="chip">Bars ${this.duration}</span>
            </div>
            <div style="overflow-y:auto; flex-grow:1; display:flex; flex-direction:column-reverse;">
                ${this.logs.map(log => html`
                    <div class="log-entry">${log}</div>
                `)}
            </div>
            
            ${this.mixState === 'READY' ? html`
                <div style="display: flex; gap: 8px;">
                    <button class="trigger-btn" style="background: #059669; border-color:#047857; padding:14px; min-height:56px; flex:1;"
                       @click="${this.startMix}">
                       START MIX
                    </button>
                    <button class="trigger-btn" style="background: #71717a; border-color:#52525b; padding:14px; min-height:56px; flex:1;"
                       @click="${this.cancelMix}">
                       CANCEL
                    </button>
                </div>
            ` : (this.mixState === 'MIXING' || this.mixState === 'WAIT_NEXT' || this.mixState === 'POST_REGEN') ? html`
                <button class="trigger-btn" style="background: #7f1d1d; border-color:#450a0a; color: #fca5a5; padding:14px; min-height:56px;"
                   @click="${this.stopMix}">
                   STOP
                </button>
            ` : ''}
        </div>
      </div>
    `;
  }

  toggleAiVisuals() {
      this.aiVisualsEnabled = !this.aiVisualsEnabled;
      this.dispatchEvent(new CustomEvent('visual-ai-toggle', {
          detail: { enabled: this.aiVisualsEnabled },
          bubbles: true,
          composed: true
      }));
  }

  triggerSingleMix(direction: 'A->B' | 'B->A') {
      this.addLog(`Requesting Mix: ${direction} (${this.duration} bars, ${this.mood})`);
      this.mixState = 'GENERATING'; // Optimistic update
      
      this.dispatchEvent(new CustomEvent('ai-mix-trigger', {
          detail: {
              direction,
              duration: this.duration,
              mood: this.mood,
              preferredVisual: this.preferredVisual,
              sessionMode: 'single',
              maxRuntimeMin: this.maxRuntimeMin
          },
          bubbles: true,
          composed: true
      }));
  }

  startFreeMode = () => {
      this.addLog(`Requesting FREE MODE: runtime ${this.maxRuntimeMin}min (Prompt Adaptive)`);
      this.mixState = 'GENERATING';
      this.dispatchEvent(new CustomEvent('ai-mix-trigger', {
          detail: {
              direction: 'A->B',
              duration: this.duration,
              mood: 'Prompt Adaptive',
              preferredVisual: 'organic',
              sessionMode: 'free',
              maxRuntimeMin: this.maxRuntimeMin
          },
          bubbles: true,
          composed: true
      }));
  };
  
  startMix() {
      // Logic handled in main.ts listener
      this.dispatchEvent(new CustomEvent('ai-mix-start', {
          bubbles: true,
          composed: true
      }));
  }
  
  stopMix() {
      // Logic handled in main.ts listener
      this.dispatchEvent(new CustomEvent('ai-mix-abort', {
          bubbles: true,
          composed: true
      }));
  }
  
  cancelMix() {
      // Cancel the generated mix without starting it
      this.addLog('Mix cancelled by user');
      this.dispatchEvent(new CustomEvent('ai-mix-cancel', {
          bubbles: true,
          composed: true
      }));
  }

  addLog(msg: string) {
      const time = new Date().toLocaleTimeString();
      this.logs = [`[${time}] ${msg}`, ...this.logs].slice(0, 50); // Keep last 50
  }
  
	  updateStatus(bar: number, phase: string, totalBars: number) {
	      this.currentBar = bar;
	      this.currentPhase = phase;
	      this.progress = Math.min(1.0, Math.max(0, bar / totalBars));
	  }

    private getStateClass(): string {
      switch (this.mixState) {
        case 'GENERATING': return 'state-generating';
        case 'READY': return 'state-ready';
        case 'MIXING': return 'state-mixing';
        case 'POST_REGEN': return 'state-post';
        case 'WAIT_NEXT': return 'state-wait';
        case 'COMPLETE': return 'state-complete';
        case 'IDLE':
        default:
          return 'state-idle';
      }
    }
}

declare global {
  interface HTMLElementTagNameMap {
    'super-controls': SuperControls;
  }
}
