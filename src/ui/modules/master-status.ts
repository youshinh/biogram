import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('master-status')
export class MasterStatus extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: black;
      border: 1px solid white;
      font-family: inherit;
    }

    .header {
        background: white;
        color: black;
        padding: 4px;
        font-size: 0.7rem;
        font-weight: bold;
        letter-spacing: 0.1em;
    }

    .main-display {
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        font-size: 3rem;
        font-weight: bold;
        color: white;
        position: relative;
    }
    
    .bpm-controls {
        display: flex;
        flex-direction: column;
        height: 100%;
        width: 60px; /* Increased width */
        border-left: 1px solid white;
    }
    
    .bpm-btn {
        flex: 1;
        border: none;
        border-bottom: 1px solid white;
        background: black;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem; /* Larger font */
        font-weight: bold;
    }
    .bpm-btn:last-child { border-bottom: none; }
    .bpm-btn:hover { background: #333; }
    .bpm-btn:active { background: white; color: black; }

    .transport-btn {
        width: 100%;
        height: 50px;
        border: none;
        border-top: 1px solid white;
        background: black;
        color: white;
        font-size: 1.2rem;
        font-weight: bold;
        cursor: pointer;
        letter-spacing: 0.1em;
    }
    .transport-btn.active {
        background: white;
        color: black;
    }
    .transport-btn:hover {
        background: #222;
    }
  `;

  @property({ type: Number }) bpm = 120;
  @state() isPlaying = false;
  @state() bufferHealth = 0;
  @state() aiStatus = 'IDLE';
  @state() ghostCount = 0;

  private timer = 0;

  connectedCallback() {
      super.connectedCallback();
      this.timer = window.setInterval(() => this.updateStatus(), 500);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      clearInterval(this.timer);
  }

  private updateStatus() {
      const engine = (window as any).engine;
      if (engine) {
          this.bufferHealth = Math.round(engine.getBufferHealth());
          this.aiStatus = engine.getAiStatus();
          this.ghostCount = engine.getLibraryCount();
      }
  }

  private changeBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      this.dispatchEvent(new CustomEvent('bpm-change', { 
          detail: this.bpm, 
          bubbles: true, 
          composed: true 
      }));
  }

  private togglePlay() {
      this.isPlaying = !this.isPlaying;
      this.dispatchEvent(new CustomEvent(this.isPlaying ? 'play' : 'pause', {
          bubbles: true,
          composed: true
      }));
  }

  public forceUpdateState(isPlaying: boolean) {
      this.isPlaying = isPlaying;
      this.updateStatus(); // Immediate poll
  }

  render() {
    return html`
      <div class="header">MASTER_CLOCK</div>
      
      <div class="main-display">
        <!-- Removed BPM Label -->
        <span>${this.bpm}</span>
        
        <div class="bpm-controls">
            <button class="bpm-btn" @click="${() => this.changeBpm(1)}">+</button>
            <button class="bpm-btn" @click="${() => this.changeBpm(-1)}">-</button>
        </div>
      </div>

      <div style="background: #222; color: #aaa; font-size: 0.7rem; padding: 4px; display: flex; justify-content: space-between;">
         <span>BUF: ${this.bufferHealth}%</span>
         <span style="color: #bd00ff">GHOST: ${this.ghostCount}</span>
         <span style="color: ${this.aiStatus === 'SAVING' ? '#00ff88' : '#ffaa00'}">${this.aiStatus}</span>
      </div>

      <button class="transport-btn ${this.isPlaying ? 'active' : ''}" @click="${this.togglePlay}">
        ${this.isPlaying ? 'STOP_SYSTEM' : 'INITIATE_PLAY'}
      </button>
    `;
  }
}
