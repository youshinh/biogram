import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import './hydra-visualizer';

@customElement('deck-controller')
export class DeckController extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #000;
      color: #fff;
      font-family: 'Space Mono', monospace;
      --deck-color: #00ffff;
    }

    .visualizer-area {
        flex-grow: 1;
        position: relative;
        border-bottom: 1px solid #333;
        min-height: 0;
    }

    /* Main Container: Flex Row */
    .controls-container {
        display: flex;
        height: 80px; /* Fixed height for consistency */
        background: #000;
        border-top: 1px solid #333;
        padding: 4px;
        gap: 4px;
    }

    /* SECTION 1: Main (BPM + Input) */
    .section-main {
        flex-grow: 1;
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0; /* Prevent toggle overflow */
    }
    
    .row-bpm {
        display: flex;
        flex: 1;
        gap: 2px;
    }
    
    .row-input {
        display: flex;
        flex: 1;
        border: 1px solid #333;
        background: #0a0a0a;
    }

    /* SECTION 2: Tools (Sync + Gen) */
    .section-tools {
        display: flex;
        flex-direction: column;
        width: 50px;
        gap: 4px;
    }

    /* SECTION 3: Transport (Play) */
    .section-play {
        width: 70px;
        display: flex;
    }

    /* Elements */
    button {
        background: #1a1a1a;
        border: 1px solid #333;
        color: #888;
        cursor: pointer;
        font-family: inherit;
        font-weight: bold;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        font-size: 0.8rem;
    }
    button:hover { background: #333; color: #fff; }
    button:active { background: #555; }

    /* BPM Controls */
    .bpm-display {
        flex-grow: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        font-weight: 900;
        color: var(--deck-color);
        font-family: 'Verdana', sans-serif; /* Override for better digit legibility */
    }
    
    .nav-btn { width: 28px; font-size: 0.8rem; }
    .tap-btn { width: 40px; font-size: 0.9rem; }

    /* Input */
    .prompt-input {
        width: 100%;
        height: 100%;
        background: transparent;
        border: none;
        color: #fff;
        font-family: inherit;
        padding: 0 8px;
        font-size: 0.8rem;
        outline: none;
    }
    .prompt-input::placeholder { color: #444; }

    /* Tools */
    .tool-btn {
        flex: 1;
        font-size: 0.8rem;
    }
    .sync-btn.active {
        background: #003333;
        border-color: var(--deck-color);
        color: var(--deck-color);
    }

    /* Play */
    .play-btn {
        width: 100%;
        height: 100%;
        background: #000;
        border: none; 
        /* Optional: Border on side facing deck? */
    }
    .play-btn svg {
        width: 40px; height: 40px;
        fill: #fff;
    }
    .play-btn.playing svg {
        fill: var(--deck-color);
    }

    .deck-label {
        position: absolute;
        top: 4px; left: 4px;
        font-size: 2rem;
        font-weight: 900;
        color: var(--deck-color);
        opacity: 0.2;
        pointer-events: none;
        z-index: 10;
    }
  `;

  @property({ type: String }) deckId = "A"; 
  @state() isPlaying = false;
  @state() isSync = false;
  @state() prompt = "";
  @state() bpm = 120.0;
  @state() isManaul = false;

  updated(changed: Map<string, any>) {
      if (changed.has('deckId')) {
          const col = this.deckId === 'A' ? '#00ffff' : '#ff0000';
          this.style.setProperty('--deck-color', col);
      }
  }

  connectedCallback() {
      super.connectedCallback();
      const col = this.deckId === 'A' ? '#00ffff' : '#ff0000';
      this.style.setProperty('--deck-color', col);
      
      window.addEventListener('deck-bpm-update', this.onBpmUpdate);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('deck-bpm-update', this.onBpmUpdate);
  }

  private onBpmUpdate = (e: any) => {
      const { deck, bpm } = e.detail;
      if (deck === this.deckId) {
          this.bpm = parseFloat(bpm.toFixed(1));
          this.requestUpdate();
      }
  };

  render() {
      // Determine Order
      // Deck A: Main(1) Tools(2) Play(3) -> Play on Right
      // Deck B: Play(1) Tools(2) Main(3) -> Play on Left
      const orderMain = this.deckId === 'A' ? 1 : 3;
      const orderTools = 2;
      const orderPlay = this.deckId === 'A' ? 3 : 1;

    return html`
      <div class="visualizer-area">
          <!-- <div class="deck-label">${this.deckId}</div> -->
          <hydra-visualizer .deckId="${this.deckId}"></hydra-visualizer>
      </div>

      <div class="controls-container">
          
          <!-- SECTION MAIN -->
          <div class="section-main" style="order: ${orderMain}">
              <div class="row-bpm">
                  <button class="nav-btn" @click="${() => this.adjustBpm(-1.0)}">&laquo;</button>
                  <button class="nav-btn" @click="${() => this.adjustBpm(-0.1)}">&lsaquo;</button>
                  
                  <div class="bpm-display">${this.bpm.toFixed(1)}</div>
                  
                  <button class="nav-btn" @click="${() => this.adjustBpm(0.1)}">&rsaquo;</button>
                  <button class="nav-btn" @click="${() => this.adjustBpm(1.0)}">&raquo;</button>
                  <button class="tap-btn" @click="${this.tapBpm}">TAP</button>
              </div>
              
              <div class="row-grid" style="display:flex; justify-content:center; gap:4px; margin-top:4px; align-items:center;">
                  <span style="font-size:0.6rem; color:#666; font-family:'Space Mono'; margin-right:4px;">GRID</span>
                  <button class="nav-btn" style="font-size:0.7rem; padding:2px 6px; height:20px;" @click="${() => this.adjustGrid(-1)}">&lt; BAR</button>
                  <button class="nav-btn" style="font-size:0.7rem; padding:2px 6px; height:20px;" @click="${() => this.adjustGrid(1)}">BAR &gt;</button>
              </div>

              <div class="row-input">
                  <input class="prompt-input" 
                         type="text" 
                         placeholder="Enter prompt text..." 
                         .value="${this.prompt}"
                         @change="${this.handlePromptChange}"
                  />
              </div>
          </div>

          <!-- SECTION TOOLS -->
          <div class="section-tools" style="order: ${orderTools}">
               <button class="tool-btn sync-btn ${this.isSync ? 'active' : ''}" @click="${this.toggleSync}">
                   SYNC
               </button>
               <button class="tool-btn" @click="${this.loadRandom}">
                   GEN
               </button>
          </div>

          <!-- SECTION PLAY -->
          <div class="section-play" style="order: ${orderPlay}">
               <button class="play-btn ${this.isPlaying ? 'playing' : ''}" @click="${this.togglePlay}">
                  ${this.isPlaying 
                    ? html`<svg viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12"/></svg>` 
                    : html`<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`
                  }
               </button>
          </div>

      </div>
    `;
  }

  private adjustGrid(beats: number) {
      const engine = (window as any).engine;
      if (engine && engine.shiftGrid) {
          engine.shiftGrid(this.deckId, beats);
      }
  }

  private adjustBpm(delta: number) {
      this.bpm = Math.max(60, Math.min(200, this.bpm + delta));
      this.isManaul = true;
      this.dispatchBpm();
  }
  
  private lastTap = 0;
  private tapBpm() {
      const now = performance.now();
      if (now - this.lastTap < 2000) {
          const interval = now - this.lastTap;
          const newBpm = 60000 / interval;
          this.bpm = Math.round(newBpm * 10) / 10;
          this.isManaul = true;
          this.dispatchBpm();
      }
      this.lastTap = now;
  }
  
  private dispatchBpm() {
      this.dispatchEvent(new CustomEvent('deck-bpm-change', {
          detail: { deck: this.deckId, bpm: this.bpm },
          bubbles: true,
          composed: true
      }));
  }

  private togglePlay() {
      this.isPlaying = !this.isPlaying;
      this.dispatchEvent(new CustomEvent('deck-play-toggle', { 
          detail: { deck: this.deckId, playing: this.isPlaying },
          bubbles: true,
          composed: true
      }));
  }

  private toggleSync() {
      this.isSync = !this.isSync;
      this.dispatchEvent(new CustomEvent('deck-sync-toggle', {
          detail: { deck: this.deckId, sync: this.isSync },
          bubbles: true,
          composed: true
      }));
  }

  private handlePromptChange(e: any) {
      this.prompt = e.target.value;
      this.dispatchEvent(new CustomEvent('deck-prompt-change', {
          detail: { deck: this.deckId, prompt: this.prompt },
          bubbles: true,
          composed: true
      }));
  }
  
  private loadRandom() {
       this.dispatchEvent(new CustomEvent('deck-load-random', {
          detail: { deck: this.deckId },
          bubbles: true,
          composed: true
      }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'deck-controller': DeckController;
  }
}
