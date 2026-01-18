
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
      padding: 16px;
      box-sizing: border-box;
    }

    .container {
      display: grid;
      grid-template-columns: 300px 1fr 300px;
      gap: 24px;
      height: 100%;
    }

    .panel {
      background: rgba(20, 20, 25, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      backdrop-filter: blur(10px);
      overflow-y: auto; /* Safety for small screens */
    }
    
    .panel-header {
      font-size: 0.75rem;
      color: #71717a;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      padding-bottom: 8px;
    }

    /* CONTROLS */
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    label {
      font-size: 0.7rem;
      color: #a1a1aa;
    }

    select, input[type="text"] {
      background: #18181b;
      border: 1px solid #3f3f46;
      color: white;
      padding: 8px;
      border-radius: 4px;
      font-family: inherit;
      outline: none;
    }
    
    select:focus, input:focus {
      border-color: #2dd4bf; 
    }

    .trigger-btn {
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border: 1px solid #334155;
      color: #e2e8f0;
      padding: 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
      font-weight: bold;
      text-align: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .trigger-btn:hover:not(:disabled) {
      border-color: #2dd4bf;
      box-shadow: 0 0 15px rgba(45, 212, 191, 0.2);
    }
    .trigger-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
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

  @property({ type: Boolean }) isGenerating = false;
  @property({ type: Boolean }) isPlaying = false;
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
               <button class="trigger-btn" 
                  @click="${() => this.triggerMix('A->B')}"
                  ?disabled="${this.isGenerating || this.isPlaying}">
                  <span>DECK A &rarr; B</span>
               </button>
               <button class="trigger-btn" 
                  @click="${() => this.triggerMix('B->A')}"
                  ?disabled="${this.isGenerating || this.isPlaying}">
                  <span>DECK B &rarr; A</span>
               </button>
           </div>
        </div>

        <!-- 2. PROGRESS MONITOR -->
        <div class="panel">
            <div class="panel-header">VISUALIZER</div>
            <div class="monitor-display">
                ${this.isGenerating ? html`
                    <div class="phase-text phase-active" style="font-size:1rem; animation: pulse 1s infinite;">
                        ARCHITECTING MIX...
                    </div>
                ` : html`
                    <div class="phase-text ${this.currentPhase === 'PRESENCE' ? 'phase-active' : ''}">PRESENCE</div>
                    <div class="phase-text ${this.currentPhase === 'HANDOFF' ? 'phase-active' : ''}">HANDOFF</div>
                    <div class="phase-text ${this.currentPhase === 'WASH_OUT' ? 'phase-active' : ''}">WASH OUT</div>
                    
                    <div class="progress-bar">
                        <div class="progress-fill" style="width: ${this.progress * 100}%"></div>
                    </div>
                    
                    <div style="margin-top:16px; font-size:0.8rem; color:#71717a;">
                        BAR: ${this.currentBar.toFixed(1)} / ${this.duration}
                    </div>
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
            ${this.isPlaying ? html`
                <button class="trigger-btn" style="background: #ef4444; border-color:#991b1b; padding:8px;"
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
  
  stopMix() {
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
