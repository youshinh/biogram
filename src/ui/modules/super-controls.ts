
import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('super-controls')
export class SuperControls extends LitElement {
  static styles = css`
    :host {
      display: block;
      height: 100%;
      background: rgba(0,0,0,0.5);
      color: white;
      font-family: 'JetBrains Mono', monospace;
      padding: 4px;
      padding-top: 0; /* Minimize top clearance specifically */
      box-sizing: border-box;
    }

    .container {
      display: grid;
      grid-template-columns: 300px 1fr 300px;
      gap: 24px;
      height: 100%;
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
      padding: 12px; /* Reduced from 16px */
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
    }
    
    .phase-text {
      font-size: 2rem;
      font-weight: bold;
      color: rgba(255,255,255,0.1);
      transition: color 0.3s;
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
  `;

  @property({ type: String }) mixState = 'IDLE'; // IDLE, GENERATING, READY, MIXING
  @property({ type: Number }) progress = 0; // 0..1
  @property({ type: Number }) currentBar = 0;
  @property({ type: String }) currentPhase = "READY"; // READY, PRESENCE, HANDOFF, WASH_OUT, DONE

  @state() duration = 64;
  @state() mood = "Organic Deep";
  @state() logs: string[] = [];

  render() {
    return html`
      <div class="container">
        <!-- 1. DIRECTOR PANEL -->
        <div class="panel">
           <div class="panel-header">AI DIRECTOR</div>
           
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
               <label>MOOD / STYLE</label>
               <select .value="${this.mood}" @change="${(e:any) => this.mood = e.target.value}">
                   <option value="Organic Deep">Organic Deep (Sigmoid Handoff)</option>
                   <option value="Rhythmic Swap">Rhythmic Swap (Slicer Cut)</option>
                   <option value="Chaos Gen">Chaos Gen (Noise/Glitch)</option>
                   <option value="Cinema">Cinema (Reverb Wash)</option>
               </select>
           </div>
           
           <div style="flex-grow:1"></div>

           <div class="control-group">
               <button class="trigger-btn trigger-ab" 
                  @click="${() => this.triggerMix('A->B')}"
                  ?disabled="${this.mixState !== 'IDLE'}">
                  <span>DECK A &rarr; B</span>
               </button>
               <button class="trigger-btn trigger-ba" 
                  @click="${() => this.triggerMix('B->A')}"
                  ?disabled="${this.mixState !== 'IDLE'}">
                  <span>DECK B &rarr; A</span>
               </button>
           </div>
        </div>

        <!-- 2. PROGRESS MONITOR -->
        <div class="panel">
            <div class="panel-header">VISUALIZER</div>
            <div class="monitor-display">
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
                    <div class="phase-text ${this.currentPhase === 'WASH_OUT' ? 'phase-active' : ''}">WASH OUT</div>
                    
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${this.progress * 100}%"></div>
                    </div>
                    
                    <div style="margin-top:16px; font-size:0.8rem; color:#71717a;">
                        BAR: ${this.currentBar.toFixed(1)} / ${this.duration}
                    </div>
                ` : html`
                    <div style="color:rgba(255,255,255,0.2);">IDLE</div>
                `}
            </div>
        </div>

        <!-- 3. LOGS / STATUS -->
        <div class="panel">
            <div class="panel-header">SYSTEM LOG</div>
            <div style="overflow-y:auto; flex-grow:1; display:flex; flex-direction:column-reverse;">
                ${this.logs.map(log => html`
                    <div class="log-entry">${log}</div>
                `)}
            </div>
            
            ${this.mixState === 'READY' ? html`
                <button class="trigger-btn" style="background: #059669; border-color:#047857; padding:12px;"
                   @click="${this.startMix}">
                   START MIX
                </button>
            ` : this.mixState === 'MIXING' ? html`
                <button class="trigger-btn" style="background: #ef4444; border-color:#991b1b; padding:12px;"
                   @click="${this.stopMix}">
                   ABORT MIX
                </button>
            ` : ''}
        </div>
      </div>
    `;
  }

  triggerMix(direction: 'A->B' | 'B->A') {
      this.addLog(`Requesting Mix: ${direction} (${this.duration} bars, ${this.mood})`);
      this.mixState = 'GENERATING'; // Optimistic update
      
      this.dispatchEvent(new CustomEvent('ai-mix-trigger', {
          detail: {
              direction,
              duration: this.duration,
              mood: this.mood
          },
          bubbles: true,
          composed: true
      }));
  }
  
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

  addLog(msg: string) {
      const time = new Date().toLocaleTimeString();
      this.logs = [`[${time}] ${msg}`, ...this.logs].slice(0, 50); // Keep last 50
  }
  
  updateStatus(bar: number, phase: string, totalBars: number) {
      this.currentBar = bar;
      this.currentPhase = phase;
      this.progress = Math.min(1.0, Math.max(0, bar / totalBars));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'super-controls': SuperControls;
  }
}
