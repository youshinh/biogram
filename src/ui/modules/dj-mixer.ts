import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('dj-mixer')
export class DjMixer extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #111;
      color: #fff;
      padding: 2px;
      box-sizing: border-box;
      font-family: 'Verdana', sans-serif;
      overflow-y: auto; /* Fallback scroll */
    }

    .eq-section {
        flex-grow: 1;
        display: grid;
        grid-template-columns: 1fr 1fr; /* Deck A EQ | Deck B EQ */
        gap: 4px;
        border-bottom: 1px solid #333;
        padding-bottom: 8px;
    }

    .channel-strip {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-around;
        background: #000;
        padding: 4px;
        border: 1px solid #222;
    }

    .knob-row {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        width: 100%;
    }

    .knob-label {
        font-size: 0.6rem;
        color: #888;
        font-weight: bold;
    }

    /* Tactile Slider - EXPANDED VERTICAL */
    input[type=range].eq-slider {
        -webkit-appearance: none;
        appearance: none;
        writing-mode: vertical-lr; /* CRITICAL: Enables vertical drag */
        direction: rtl; /* Top = max, Bottom = min */
        width: 40px; 
        height: 80px;
        background: #1a1a1a;
        cursor: pointer;
        margin: 2px 0;
        border: 1px solid #333;
        border-radius: 2px;
    }
    input[type=range].eq-slider::-webkit-slider-runnable-track {
        width: 100%;
        height: 100%;
        background: #1a1a1a;
    }
    input[type=range].eq-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        height: 16px;
        width: 100%;
        background: var(--slider-color, #888);
        border: 1px solid #fff;
        border-radius: 2px;
    }

    .kill-btn {
        width: 100%;
        font-size: 0.6rem;
        background: #222;
        border: 1px solid #444;
        color: #888;
        cursor: pointer;
        padding: 2px 0;
        margin-top: 2px;
    }
    .kill-btn.active {
        background: #ff0000;
        color: white;
        box-shadow: 0 0 5px red;
        border-color: red;
    }
    .kill-btn.active.cyan {
        background: #00ffff;
        box-shadow: 0 0 5px #00ffff;
        border-color: #00ffff;
        color: black;
    }

    .fader-section {
        height: 50px; /* Reduced from 100px */
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #0a0a0a;
        margin-top: 2px;
        border-top: 1px solid #333;
        flex-shrink: 0; /* Prevent shrinking */
    }

    .crossfader {
        -webkit-appearance: none;
        width: 90%;
        height: 10px;
        background: linear-gradient(90deg, #00ffff, #333 50%, #ff0000);
        border-radius: 5px;
        outline: none;
        margin: 14px 0;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
    }
    .crossfader::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 30px;
        height: 40px;
        background: #fff;
        border: 2px solid #555;
        border-radius: 4px;
        cursor: pointer;
        box-shadow: 0 2px 5px rgba(0,0,0,0.5);
    }

    .master-section {
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-bottom: 1px solid #333;
        background: #000;
        font-family: monospace;
        font-size: 1.2rem;
        font-weight: bold;
    }
    .beat-led {
        width: 12px; height: 12px;
        background: #300;
        border-radius: 50%;
        margin-right: 8px;
        transition: background 0.05s;
    }
    .beat-led.active {
        background: #f00;
        box-shadow: 0 0 8px #f00;
    }
    .bpm-btn {
        background: #333;
        border: 1px solid #555;
        color: white;
        font-size: 0.8rem;
        width: 24px;
        height: 24px;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        margin: 0 4px;
        user-select: none;
    }
    .bpm-btn:active {
        background: #666;
    }
  `;

  @state() crossfader = 0.5; // 0 (A) to 1 (B)
  
  // EQ States (Gain 0.0-1.0)
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
      this.animateValues();
      window.addEventListener('mixer-update', this.handleMidiUpdate);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      cancelAnimationFrame(this.animId);
      window.removeEventListener('mixer-update', this.handleMidiUpdate);
  }

  private handleMidiUpdate = (e: any) => {
      const { parameter, value } = e.detail;
      
      if (parameter === 'crossfader') {
          this.crossfader = value;
          this.dispatchParam('CROSSFADER', this.crossfader);
      } else if (parameter === 'volumeA') {
          // Map Volume Fader to TRIM for now (since no Channel Fader in UI)
          // Scale 0-1 to 0-2 (Trim Range)
          this.handlePreAmp('A', 'TRIM', (value * 2.0).toString());
      } else if (parameter === 'volumeB') {
          this.handlePreAmp('B', 'TRIM', (value * 2.0).toString());
      }
      // EQ Mappings
      else {
           // param: lowA, midB etc.
           // extract deck A/B
           const deck = parameter.slice(-1); // 'A' or 'B'
           const key = parameter.slice(0, -1); // 'low'
           
           if ((deck === 'A' || deck === 'B') && ['low', 'mid', 'high', 'hi'].includes(key)) {
               const band = key === 'high' ? 'HI' : key.toUpperCase();
               // EQ Range 0-1.5
               this.handleEq(deck, band, (value * 1.5));
           }
      }
  }

  private animateValues = () => {
      this.animId = requestAnimationFrame(this.animateValues);
      
      const engine = (window as any).engine;
      if (!engine || !engine.context) return;
      
      // Drive LED from Audio Context Time for sync
      const time = engine.context.currentTime;
      const beatDur = 60.0 / this.bpm;
      const phase = time % beatDur;
      
      // Flash for 100ms
      const isActive = phase < 0.1;
      
      if (this.beatActive !== isActive) {
          this.beatActive = isActive;
      }
  }

  render() {
    return html`
      <div class="master-section">
          <div class="beat-led ${this.beatActive ? 'active' : ''}"></div>
          
          <button class="bpm-btn" @click="${() => this.changeBpm(-1)}">-</button>
          <span>${this.bpm.toFixed(1)} BPM</span>
          <button class="bpm-btn" @click="${() => this.changeBpm(1)}">+</button>
      </div>

      <div class="eq-section">
          <!-- CHANNEL A -->
          ${this.renderChannel('A', this.eqA, this.killA)}
          <!-- CHANNEL B -->
          ${this.renderChannel('B', this.eqB, this.killB)}
      </div>

      <div class="fader-section">
          <div style="font-size:0.6rem; color:#666; letter-spacing:0.2em;">COLLIDER / CROSSFADER</div>
          <input type="range" class="crossfader"
                 min="0" max="1" step="0.01"
                 .value="${this.crossfader}"
                 @input="${this.handleCrossfader}" />
          <div style="display:flex; justify-content:space-between; width:90%; font-size:0.7rem; font-weight:bold; font-family:monospace;">
             <span style="color:#00ffff;">DECK A</span><span style="color:#666;">MIX</span><span style="color:#ff0000;">DECK B</span>
          </div>
      </div>
    `;
  }

  private renderChannel(deck: 'A'|'B', eq: any, kill: any) {
      return html`
        <div class="channel-strip">
            <!-- Channel Label Removed -->
            
            <!-- PRE-AMP -->
            ${this.renderPreAmp(deck)}
            
            ${this.renderKnob(deck, 'HI', eq.hi, kill.hi)}
            ${this.renderKnob(deck, 'MID', eq.mid, kill.mid)}
            ${this.renderKnob(deck, 'LOW', eq.low, kill.low)}
        </div>
      `;
  }

  private renderPreAmp(deck: 'A'|'B') {
      const trim = deck === 'A' ? this.trimA : this.trimB;
      const drive = deck === 'A' ? this.driveA : this.driveB;
      
      return html`
        <div class="pre-amp-section" style="border-bottom:1px solid #333; margin-bottom:2px; padding-bottom:2px;">
            <!-- TRIM -->
            <div class="knob-row">
                <span class="knob-label" style="color:#aaa;">TRM</span>
                <input type="range" class="eq-slider" style="height:30px;"
                       min="0" max="2" step="0.01" .value="${trim}"
                       @input="${(e:any) => this.handlePreAmp(deck, 'TRIM', e.target.value)}"/>
            </div>
            <!-- DRIVE -->
            <div class="knob-row">
                <span class="knob-label" style="color:#ff4400;">DRV</span>
                <input type="range" class="eq-slider" style="height:30px; --thumb-color: #ff4400;"
                       min="0" max="1" step="0.01" .value="${drive}"
                       @input="${(e:any) => this.handlePreAmp(deck, 'DRIVE', e.target.value)}"/>
            </div>
        </div>
      `;
  }

  private handlePreAmp(deck: 'A'|'B', param: 'TRIM'|'DRIVE', val: string) {
      const v = parseFloat(val);
      if (deck === 'A') {
          if (param === 'TRIM') this.trimA = v; else this.driveA = v;
      } else {
          if (param === 'TRIM') this.trimB = v; else this.driveB = v;
      }
      this.dispatchParam(`${param}_${deck}`, v);
  }

  private renderKnob(deck: string, band: 'HI'|'MID'|'LOW', val: number, isKill: boolean) {
      const key = band.toLowerCase();
      const color = deck === 'A' ? '#00ffff' : '#ff0000';
      return html`
        <div class="knob-row" style="margin-top: 4px;">
            <span class="knob-label" style="color: ${color}; opacity: 0.8;">${band}</span>
            <!-- Value Display -->
            <span style="font-size:0.7rem; font-family:'Space Mono'; color:${color}; margin-bottom:2px;">
                ${val.toFixed(2)}
            </span>
            
            <input type="range" class="eq-slider" 
                   min="0" max="1.5" step="0.01" 
                   .value="${val}" 
                   style="--slider-color: ${color}"
                   @input="${(e:any) => this.handleEq(deck, key, e.target.value)}"/>
                   
            <button class="kill-btn ${isKill ? 'active' : ''} ${deck === 'A' ? 'cyan' : ''}" 
                    @click="${() => this.toggleKill(deck, key)}">
                KILL
            </button>
        </div>
      `;
  }

  private handleEq(deck: string, band: string, val: number) {
      const targetState = deck === 'A' ? this.eqA : this.eqB;
      // @ts-ignore
      targetState[band] = parseFloat(val);
      this.requestUpdate();
      
      this.dispatchParam(`EQ_${deck}_${band.toUpperCase()}`, val);
  }

  private toggleKill(deck: string, band: string) {
      const targetState = deck === 'A' ? this.killA : this.killB;
      // @ts-ignore
      targetState[band] = !targetState[band];
      this.requestUpdate();
      
      // Dispatch KILL event
      // Param: KILL_A_HI = 1.0 (Active) / 0.0 (Inactive)
      // @ts-ignore
      const val = targetState[band] ? 1.0 : 0.0;
      this.dispatchParam(`KILL_${deck}_${band.toUpperCase()}`, val);
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
      // Dispatch global change
      window.dispatchEvent(new CustomEvent('bpm-change', { detail: this.bpm }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'dj-mixer': DjMixer;
  }
}
