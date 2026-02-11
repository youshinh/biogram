
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
      gap: 14px;
      height: 100%;
      min-height: 0;
    }

    .container.layout-idle {
      grid-template-columns: minmax(420px, 1.45fr) minmax(240px, 0.85fr) minmax(340px, 1.15fr);
    }

    .container.layout-live {
      grid-template-columns: minmax(360px, 1.15fr) minmax(320px, 1.1fr) minmax(320px, 1fr);
    }

    .panel {
      background: rgba(0, 0, 0, 0.4); 
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 1.5rem; 
      padding: 12px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      backdrop-filter: blur(12px);
      overflow-y: auto; 
      min-height: 0;
    }

    .panel-director {
      padding: 14px;
      gap: 10px;
    }

    .panel-monitor {
      overflow: hidden;
      padding-bottom: 10px;
    }

    .panel-log {
      min-width: 0;
    }

    .status-strip {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .mode-switch {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: 8px;
      align-items: center;
    }

    .mode-tab {
      min-height: 42px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #18181b;
      color: #e4e4e7;
      font-family: inherit;
      font-size: 0.75rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s;
    }

    .mode-tab:hover:not(:disabled) {
      background: #27272a;
      border-color: #475569;
    }

    .mode-tab.active {
      border-color: #0ea5e9;
      color: #e0f2fe;
      background: rgba(3, 105, 161, 0.18);
      box-shadow: 0 0 10px rgba(14, 165, 233, 0.18);
    }

    .mode-tab:disabled {
      opacity: 0.55;
      cursor: not-allowed;
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

    .mode-analysis-btn {
      min-height: 42px;
      border: 1px solid #334155;
      border-radius: 8px;
      background: #18181b;
      color: #e4e4e7;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      font-family: inherit;
      font-size: 0.62rem;
      padding: 4px 10px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .mode-analysis-btn:hover:not(:disabled) {
      background: #27272a;
      border-color: #475569;
    }

    .mode-analysis-btn.active {
      border-color: #10b981;
      color: #d1fae5;
      background: rgba(6, 78, 59, 0.28);
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.18);
    }

    .mode-analysis-btn:disabled {
      opacity: 0.55;
      cursor: not-allowed;
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
      padding: 9px 10px;
      border-radius: 8px; 
      font-family: inherit;
      min-height: 42px;
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
      min-height: 228px;
      height: 100%;
    }

    .container.layout-idle .monitor-display {
      min-height: 148px;
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

    .action-hint {
      font-size: 0.68rem;
      line-height: 1.45;
      color: #94a3b8;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 8px 10px;
      background: rgba(8,8,8,0.5);
    }

    .action-hint strong {
      color: #e4e4e7;
      font-weight: 700;
      letter-spacing: 0.04em;
    }

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
        grid-auto-rows: auto;
      }
      .panel {
        max-height: none;
      }
      .panel-director { order: 1; }
      .panel-monitor { order: 2; }
      .panel-log { order: 3; }
      .monitor-display {
        min-height: 170px;
      }
    }

    @media (max-width: 820px) {
      :host {
        padding: 6px 4px 4px 4px;
      }
      .panel {
        border-radius: 1rem;
      }
      .panel-director {
        padding: 10px;
      }
      .mode-switch {
        grid-template-columns: 1fr 1fr;
      }
      .mode-switch .chip {
        grid-column: 1 / -1;
        justify-self: start;
      }
      .mix-actions .trigger-btn {
        min-height: 52px;
        font-size: 0.9rem;
      }
      .monitor-display {
        min-height: 150px;
      }
      .phase-text {
        font-size: 1rem;
      }
      .action-hint {
        font-size: 0.64rem;
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
  @state() aiVisualsEnabled = true;
  @state() promptAutoEnabled = true;
  @state() promptAutoCurve: 'BALANCED' | 'AGGRESSIVE' | 'CINEMATIC' = 'BALANCED';
  @state() logs: string[] = [];

	  render() {
      const stateClass = this.getStateClass();
      const liveStates = new Set(['GENERATING', 'MIXING', 'WAIT_NEXT', 'POST_REGEN']);
      const layoutClass = liveStates.has(this.mixState) ? 'layout-live' : 'layout-idle';
      const canChangeMode = this.mixState === 'IDLE' || this.mixState === 'COMPLETE';
      const actionHint = this.getActionHint();
	    return html`
      <div class="container ${layoutClass}">
        <!-- 1. DIRECTOR PANEL -->
        <div class="panel panel-director">
           <div class="panel-header">AI DIRECTOR</div>
           <div class="mode-switch">
               <button class="mode-tab ${this.sessionMode === 'single' ? 'active' : ''}"
                       @click="${() => this.setSessionMode('single')}"
                       ?disabled="${!canChangeMode}">
                   SINGLE
               </button>
               <button class="mode-tab ${this.sessionMode === 'free' ? 'active' : ''}"
                       @click="${() => this.setSessionMode('free')}"
                       ?disabled="${!canChangeMode}">
                   FREE
               </button>
               <button
                   class="mode-analysis-btn ${this.aiVisualsEnabled ? 'active' : ''}"
                   @click="${this.toggleAiVisuals}"
                   ?disabled="${!canChangeMode}">
                   Analysis ${this.aiVisualsEnabled ? 'ON' : 'OFF'}
               </button>
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
                   <div class="policy-line">Mood / Visual automatically follow current deck prompt context</div>
                   <div class="policy-line">Direction runs in PINGPONG mode (A↔B)</div>
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
                       <option value="halid">HALID</option>
                       <option value="glaze">GLAZE</option>
                       <option value="gnosis">GNOSIS</option>
                   </select>
               </div>
           ` : ''}

           <div class="policy-box">
               <div class="policy-title">TRANSITION POLICY</div>
               <div class="policy-line">Allowed: fade_in / fade_out / crossfade / soft_overlay / sweep_line_smear</div>
               <div class="policy-line">Intensity: 0.0 - 1.0 (default 0.35)</div>
               <div class="policy-line">No hard flash / no aggressive glitch / no strobe</div>
               <div class="policy-line">AI Analysis controls BPM/visual analysis pipeline only (not mix planner).</div>
           </div>

           <div class="policy-box">
               <div class="policy-title">PROMPT AUTO CONTROL</div>
               <div class="control-group">
                   <label>AUTO PROMPT</label>
                   <select .value="${this.promptAutoEnabled ? 'ON' : 'OFF'}"
                           @change="${(e: any) => this.promptAutoEnabled = e.target.value === 'ON'}">
                       <option value="ON">ON</option>
                       <option value="OFF">OFF</option>
                   </select>
               </div>
               <div class="control-group">
                   <label>CURVE</label>
                   <select .value="${this.promptAutoCurve}"
                           @change="${(e: any) => this.promptAutoCurve = e.target.value as 'BALANCED' | 'AGGRESSIVE' | 'CINEMATIC'}">
                       <option value="BALANCED">BALANCED</option>
                       <option value="AGGRESSIVE">AGGRESSIVE</option>
                       <option value="CINEMATIC">CINEMATIC</option>
                   </select>
               </div>
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
        <div class="panel panel-log">
            <div class="panel-header">SYSTEM LOG / ACTION</div>
            <div class="status-strip">
                <span class="chip">Mode ${this.sessionMode.toUpperCase()}</span>
                <span class="chip">${this.sessionMode === 'free' ? 'PINGPONG AUTO' : 'ONE SHOT'}</span>
                <span class="chip">Bars ${this.duration}</span>
            </div>
            <div class="action-hint">${actionHint}</div>
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

  private setSessionMode(mode: 'single' | 'free') {
      this.sessionMode = mode;
      if (mode === 'free') {
          this.preferredVisual = 'organic';
      }
  }

  private getActionHint() {
      if (this.mixState === 'READY') {
          return html`<strong>NEXT:</strong> Press <strong>START MIX</strong> to execute the generated plan.`;
      }
      if (this.mixState === 'MIXING') {
          return html`<strong>LIVE:</strong> Mix is running. Press <strong>STOP</strong> only if you need to abort.`;
      }
      if (this.mixState === 'WAIT_NEXT') {
          return html`<strong>AUTO:</strong> Free mode will trigger the next mix automatically after standby.`;
      }
      if (this.mixState === 'POST_REGEN') {
          return html`<strong>POST:</strong> Regenerating the stopped deck. Mix chain will resume automatically in Free mode.`;
      }
      if (this.sessionMode === 'single') {
          return html`<strong>NEXT:</strong> Choose <strong>DECK A→B</strong> or <strong>DECK B→A</strong> to run a one-shot mix.`;
      }
      return html`<strong>NEXT:</strong> Press <strong>START FREE MODE</strong>. The system will continue in ping-pong automation.`;
  }

  toggleAiVisuals() {
      this.aiVisualsEnabled = !this.aiVisualsEnabled;
      this.addLog(`AI ANALYSIS ${this.aiVisualsEnabled ? 'ENABLED' : 'DISABLED'}`);
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
              maxRuntimeMin: this.maxRuntimeMin,
              promptAutoEnabled: this.promptAutoEnabled,
              promptAutoCurve: this.promptAutoCurve
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
              maxRuntimeMin: this.maxRuntimeMin,
              promptAutoEnabled: this.promptAutoEnabled,
              promptAutoCurve: this.promptAutoCurve
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
