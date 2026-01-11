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
      font-family: 'Courier New', monospace;
      border: 1px solid #333;
    }

    .top-section {
        flex-grow: 1;
        display: flex;
        border-bottom: 1px solid #333;
    }

    .bpm-display {
        flex: 1; /* Large area */
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 3.5rem;
        font-weight: bold;
        color: white;
        border-right: 1px solid #333;
    }

    .tap-btn {
        width: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.5rem;
        font-weight: bold;
        color: white;
        background: black;
        border: none;
        border-right: 1px solid #333;
        cursor: pointer;
    }
    .tap-btn:active { background: white; color: black; }

    .inc-dec {
        width: 60px;
        display: flex;
        flex-direction: column;
    }
    
    .adj-btn {
        flex: 1;
        border: none;
        background: black;
        color: white;
        font-size: 1.5rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .adj-btn.up { border-bottom: 1px solid #333; }
    .adj-btn:active { background: white; color: black; }
    
    .status-bar {
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px;
        font-size: 0.7rem;
        background: #111;
        color: #888;
    }
    .play-btn {
        width: 100%;
        flex: 1;
        min-height: 60px;
        border: none;
        border-top: 1px solid #333;
        background: black;
        color: white;
        font-size: 2rem;
        font-weight: bold;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    .play-btn:hover { background: #222; }
    .play-btn.playing { background: white; color: black; }
  `;

  @property({ type: Number }) bpm = 120;
  @state() isPlaying = false;
  @state() bufferHealth = 100;
  @state() ghostCount = 1104; // Dummy/Real
  @state() saveStatus = "SAVING"; // Dummy

  private timer = 0;
  private tapTimes: number[] = [];

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
          this.bufferHealth = Math.round(engine.getBufferHealth() || 100);
          this.ghostCount = engine.getLibraryCount ? engine.getLibraryCount() : 1104;
          // this.saveStatus = ...
      }
  }

  private changeBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      this.dispatchBpm();
  }
  
  private tapBpm() {
      const now = performance.now();
      this.tapTimes = this.tapTimes.filter(t => now - t < 2000);
      this.tapTimes.push(now);
      
      if (this.tapTimes.length > 1) {
          let totalInterval = 0;
          for (let i = 1; i < this.tapTimes.length; i++) {
              totalInterval += (this.tapTimes[i] - this.tapTimes[i-1]);
          }
          const avgInterval = totalInterval / (this.tapTimes.length - 1);
          if (avgInterval > 0) {
              const newBpm = Math.round(60000 / avgInterval);
              this.bpm = Math.max(60, Math.min(200, newBpm));
              this.dispatchBpm();
          }
      }
  }
  
  private dispatchBpm() {
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

  render() {
    return html`
      <div class="top-section">
          <div style="position: absolute; top:0; left:0; font-size:0.6rem; padding:2px; pointer-events:none; opacity:0.8; color: black; background: white; font-weight: bold;">MASTER_CLOCK</div>
          
          <div class="bpm-display">${this.bpm}</div>
          
          <button class="tap-btn" @click="${this.tapBpm}">TAP</button>
          
          <div class="inc-dec">
             <button class="adj-btn up" @click="${() => this.changeBpm(1)}">+</button>
             <button class="adj-btn down" @click="${() => this.changeBpm(-1)}">-</button>
          </div>
      </div>
      
      <div class="status-bar">
          <span>BUF: ${this.bufferHealth}%</span>
          <span>GHOST: <span class="highlight">${this.ghostCount}</span></span>
          <span class="status-ok">${this.saveStatus}</span>
      </div>

      <button class="play-btn ${this.isPlaying ? 'playing' : ''}" @click="${this.togglePlay}">
          ${this.isPlaying 
            ? html`<svg width="32" height="32" viewBox="0 0 32 32" fill="currentcolor"><rect x="6" y="6" width="20" height="20" /></svg>` 
            : html`<svg width="32" height="32" viewBox="0 0 32 32" fill="currentcolor"><path d="M8,6 L28,16 L8,26 Z" /></svg>`
          }
      </button>
    `;
  }
}
