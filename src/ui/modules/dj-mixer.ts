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
      padding: 4px;
      box-sizing: border-box;
      font-family: 'Verdana', sans-serif;
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

    /* Simple CSS Range as Knob for now */
    input[type=range].eq-slider {
        -webkit-appearance: slider-vertical; 
        width: 8px;
        height: 60px;
        background: transparent;
    }

    .kill-btn {
        width: 100%;
        font-size: 0.6rem;
        background: #222;
        border: 1px solid #444;
        color: #888;
        cursor: pointer;
        padding: 2px 0;
    }
    .kill-btn.active {
        background: #ff0000;
        color: white;
        box-shadow: 0 0 5px red;
        border-color: red;
    }

    .fader-section {
        height: 80px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: #0a0a0a;
        margin-top: 8px;
        border: 1px solid #333;
    }

    .crossfader {
        -webkit-appearance: none;
        width: 90%;
        height: 12px;
        background: linear-gradient(90deg, #ff0000, #00ffff);
        border-radius: 6px;
        outline: none;
        margin: 14px 0;
        box-shadow: inset 0 1px 3px rgba(0,0,0,0.5);
    }
    .crossfader::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 36px;
        background: var(--thumb-color, #888);
        border: 2px solid #fff;
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

  @state() bpm = 120;
  @state() beatActive = false;
  private animId = 0;

  connectedCallback() {
      super.connectedCallback();
      this.animateValues();
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      cancelAnimationFrame(this.animId);
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
          <div style="flex:1; padding-left:8px; font-weight:900; font-size:1.5rem; color:#333;">A</div>
          
          <div style="display:flex; align-items:center;">
              <div class="beat-led ${this.beatActive ? 'active' : ''}"></div>
              <button class="bpm-btn" @click="${() => this.changeBpm(-1)}">-</button>
              <span style="font-family:'Space Mono', monospace; font-size:1.2rem; margin:0 8px;">
                  ${this.bpm}
              </span>
              <button class="bpm-btn" @click="${() => this.changeBpm(1)}">+</button>
          </div>
          
          <div style="flex:1; padding-right:8px; text-align:right; font-weight:900; font-size:1.5rem; color:#333;">B</div>
      </div>

      <div class="eq-section">
          <!-- CHANNEL A -->
          ${this.renderChannel('A', this.eqA, this.killA)}
          <!-- CHANNEL B -->
          ${this.renderChannel('B', this.eqB, this.killB)}
      </div>

      <div class="fader-section">
          <div style="font-size:0.6rem; color:#666;">CROSSFADER (COLLIDER)</div>
          <input type="range" class="crossfader"
                 min="0" max="1" step="0.01"
                 .value="${this.crossfader}"
                 style="--thumb-color: rgb(${255 * (1 - this.crossfader)}, ${255 * this.crossfader}, ${255 * this.crossfader})"
                 @input="${this.handleCrossfader}" />
          <div style="display:flex; justify-content:space-between; width:90%; font-size:0.6rem;">
             <span>A</span><span>MIX</span><span>B</span>
          </div>
      </div>
    `;
  }

  private renderChannel(deck: 'A'|'B', eq: any, kill: any) {
      return html`
        <div class="channel-strip">
            <div style="font-size:1.5rem; font-weight:bold; color:#444;">${deck}</div>
            
            ${this.renderKnob(deck, 'HI', eq.hi, kill.hi)}
            ${this.renderKnob(deck, 'MID', eq.mid, kill.mid)}
            ${this.renderKnob(deck, 'LOW', eq.low, kill.low)}
        </div>
      `;
  }

  private renderKnob(deck: string, band: 'HI'|'MID'|'LOW', val: number, isKill: boolean) {
      const key = band.toLowerCase();
      return html`
        <div class="knob-row">
            <span class="knob-label">${band}</span>
            <input type="range" class="eq-slider" 
                   min="0" max="1.5" step="0.01" 
                   .value="${val}" 
                   @input="${(e:any) => this.handleEq(deck, key, e.target.value)}"/>
            <button class="kill-btn ${isKill ? 'active' : ''}" 
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
