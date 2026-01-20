import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: transparent; /* Allow Three.js Viz to show through */
      color: #d4d4d8; /* zinc-300 */
      font-family: 'Inter', sans-serif;
    }

    .shell-container {
      display: flex;
      flex-direction: column;
      height: 100%;
      width: 100%;
      padding: 16px;
      box-sizing: border-box;
      position: relative;
    }

    .bg-layer {
      position: absolute;
      inset: 0;
      z-index: 0;
      pointer-events: none;
    }

    /* REMOVED INTERNAL HEADER - Use AppHeader in Main.ts */

    /* MAIN LAYOUT */
    main {
      flex-grow: 1;
      display: grid;
      grid-template-rows: minmax(0, 60vh) minmax(100px, 1fr);
      gap: 16px;
      min-height: 0;
      position: relative;
      z-index: 10;
      width: 100%;
      max-width: 1920px;
      margin: 0 auto;
    }

    main.view-super {
      gap: 0px; /* Minimize clearance fully */
    }

    /* DECK ROW */
    .deck-row {
      display: grid;
      grid-template-columns: 1fr 260px 1fr;
      gap: 16px;
      height: 100%;
      min-height: 0;
    }

    .deck-container {
      display: flex;
      flex-direction: column;
      position: relative;
      overflow: hidden;
      border-radius: 1.5rem;
      background: rgba(0, 0, 0, 0.2);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
      padding: 4px;
      transition: border-color 0.5s;
    }

    .deck-label {
      position: absolute;
      top: 32px; /* Significant clearance from top */
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      color: #3f3f46;
      pointer-events: none;
      z-index: 20;
    }
    .label-left { left: 32px; }
    .label-right { left: 32px; /* Move to left to avoid Loop Icon at top-right */ }

    /* MIXER CONTAINER */
    .mixer-container {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow-y: auto; /* ALLOW SCROLL */
      overflow-x: hidden;
      border-radius: 1.5rem;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 4px;
      z-index: 20;
    }

    .mixer-container::-webkit-scrollbar {
        width: 0px;
        background: transparent;
    }

    .mixer-divider {
      height: 16px;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
    }
    .mixer-divider-line { width: 32px; height: 2px; background: #27272a; }

    /* LOWER ROW CONTAINER */
    .bottom-row {
      min-height: 0;
      height: 100%;
      overflow: hidden;
    }

    @keyframes slide-in-right {
      0% { opacity: 0; transform: translateX(20px); }
      100% { opacity: 1; transform: translateX(0); }
    }

    @keyframes slide-in-left {
      0% { opacity: 0; transform: translateX(-20px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    
    .anim-next {
       animation: slide-in-right 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
    }
    
    .anim-prev {
       animation: slide-in-left 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
    }

    /* CONTROLS ROW */
    .controls-row {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
      height: 100%;
    }

    .controls-panel {
      border-radius: 1.5rem;
      background: rgba(0, 0, 0, 0.1);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.05);
      padding: 4px 16px 16px 16px;
      display: flex;
      gap: 16px;
      overflow-x: auto;
      overflow-y: hidden;
      align-items: stretch;
      justify-content: space-around;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    .actions-panel {
      display: flex;
      flex-direction: column;
      gap: 8px;
      justify-content: center;
      padding: 8px;
    }

    /* RACK ROW */
    .rack-panel {
        height: 100%;
        width: 100%;
        overflow: hidden;
    }

    /* FOOTER */
    footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 0.65rem;
      font-family: 'JetBrains Mono', monospace;
      color: #3f3f46;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 8px;
      margin-top: auto;
      position: relative;
      z-index: 10;
      user-select: none;
    }

    /* SLOTS - CRITICAL: Ensure they fill height */
    slot[name="deck-a"], slot[name="deck-b"], slot[name="mixer"], slot[name="fx-rack"], slot[name="visual-controls"] {
      display: block;
      height: 100%;
      width: 100%;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* --- MOBILE RESPONSIVE OVERRIDES --- */
    @media (max-width: 1024px) {
      .shell-container {
         overflow-y: auto; /* Enable full page scroll on mobile */
         -webkit-overflow-scrolling: touch;
      }

      main {
        display: flex;
        flex-direction: column;
        height: auto;
        overflow: visible;
        gap: 24px;
        padding-bottom: 80px; /* Space for footer */
      }
      
      /* Deck Row becomes responsive vertical stack */
      .deck-row {
        display: flex;
        flex-direction: column;
        grid-template-columns: none; /* Reset grid */
        height: auto;
        gap: 24px;
      }

      /* Adjust individual deck containers for mobile height */
      .deck-container {
        height: 60vh; /* Fixed height for decks on mobile to keep visualizer visible */
        min-height: 400px;
        width: 100%;
      }
      
      /* Adjust Mixer for mobile */
      .mixer-container {
        height: auto;
        min-height: 300px;
        width: 100%;
        overflow: visible; 
      }

      /* Control Row changes */
      .bottom-row {
        height: auto;
        overflow: visible;
      }

      .controls-row {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .controls-panel {
        /* On mobile, we want this to wrap or scroll horizontally? 
           Let's standardise on horizontal scroll for controls to keep them accessible */
        overflow-x: auto;
        justify-content: flex-start;
        min-height: 140px; 
        padding-bottom: 8px;
      }

      .rack-panel {
        height: 60vh; /* Give rack space on mobile */
      }

      /* Footer adjustments */
      footer {
        flex-direction: column;
        gap: 4px;
        text-align: center;
        padding-bottom: 16px;
      }
    }
    /* --- NAVIGATION TRIGGERS --- */
    .nav-trigger {
      position: fixed;
      top: 0;
      bottom: 0;
      width: 120px;
      height: 100%; /* Full height */
      z-index: 1000;
      display: flex;
      align-items: flex-end; /* Keep buttons at bottom */
      padding: 0 20px 20px 20px;
      box-sizing: border-box;
      pointer-events: none; /* ALLOW CLICK THROUGH */
      /* Visual Hint Area (invisible usually) */
    }

    .nav-trigger.left {
      left: 0;
      justify-content: flex-start;
    }

    .nav-trigger.right {
      right: 0;
      justify-content: flex-end;
    }

    /* TRIGGER VISIBILITY CONTROLLED BY JS STATE */
    .nav-trigger.visible .nav-btn {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    }

    .nav-btn {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05); 
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #e4e4e7; /* Zinc-200 */
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-size: 1.5rem;
      backdrop-filter: blur(8px);
      box-shadow: 0 0 20px rgba(0, 0, 0, 0.3);
      
      /* Animation State */
      opacity: 0;
      transform: translateY(20px) scale(0.8);
      transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      pointer-events: none; /* Ignore clicks when hidden */
    }
    
    /* Reveal on Hover - REMOVED CSS HOVER TO ALLOW CLICK THROUGH */
    /* .nav-trigger:hover .nav-btn {
      opacity: 1;
      transform: translateY(0) scale(1);
      pointer-events: auto;
    } */

    .nav-btn:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
      box-shadow: 0 0 30px rgba(255, 255, 255, 0.1);
      transform: scale(1.1);
      color: #fff;
    }
    
    .nav-btn:active {
      transform: scale(0.95);
    }

  `;

  @property({ type: String }) status = "OFFLINE";
  @property({ type: String }) view: 'DECK' | 'RACK' | 'SUPER' | 'VISUAL' = 'DECK';
  
  @state() private _animClass = ''; // Transient animation class
  
  @state() private _showNavLeft = false;
  @state() private _showNavRight = false;
  
  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('mousemove', this._handleGlobalMouseMove);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('mousemove', this._handleGlobalMouseMove);
  }

  // Navigation Logic
  private _viewOrder: Array<'DECK' | 'RACK' | 'VISUAL' | 'SUPER'> = ['DECK', 'RACK', 'VISUAL', 'SUPER'];

  private _nextTab() {
    this._animClass = 'anim-next';
    const idx = this._viewOrder.indexOf(this.view);
    const nextIdx = (idx + 1) % this._viewOrder.length;
    this.view = this._viewOrder[nextIdx];
    this._emitChange();
  }

  private _prevTab() {
    this._animClass = 'anim-prev';
    const idx = this._viewOrder.indexOf(this.view);
    const prevIdx = (idx - 1 + this._viewOrder.length) % this._viewOrder.length;
    this.view = this._viewOrder[prevIdx];
    this._emitChange();
  }

  private _emitChange() {
    this.dispatchEvent(new CustomEvent('view-change', { 
        detail: { view: this.view },
        bubbles: true,
        composed: true 
    }));
  }
  
  private _onAnimEnd() {
      this._animClass = ''; // Reset after animation
  }

  private _handleGlobalMouseMove = (e: MouseEvent) => {
      const TRIGGER_WIDTH = 120;
      const x = e.clientX;
      const width = window.innerWidth;
      
      this._showNavLeft = x < TRIGGER_WIDTH;
      this._showNavRight = x > (width - TRIGGER_WIDTH);
  }

  render() {
    return html`
      <div class="shell-container">
        <!-- Background Layer -->
        <div class="bg-layer">
            <!-- Hydra Placeholder -->
        </div>

        <!-- NAVIGATION TRIGGERS (Hover Zones) -->
        <div class="nav-trigger left ${this._showNavLeft ? 'visible' : ''}">
            <div class="nav-btn" @click="${this._prevTab}">
               <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z"/></svg>
            </div>
        </div>

        <div class="nav-trigger right ${this._showNavRight ? 'visible' : ''}">
            <div class="nav-btn" @click="${this._nextTab}">
               <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>
            </div>
        </div>

        <!-- MAIN LAYOUT -->
        <main class="${this.view === 'SUPER' ? 'view-super' : ''}">
          
          <!-- UPPER ROW: Dual Decks & Mixer -->
          <div class="deck-row">
             <!-- DECK A -->
              <div class="deck-container">
                  <div class="deck-label label-left">DECK_A // 001</div>
                  <slot name="deck-a"></slot>
              </div>

              <!-- MIXER -->
              <div class="mixer-container">
                  <div class="mixer-divider"><div class="mixer-divider-line"></div></div>
                  <slot name="mixer"></slot>
                  <div class="mixer-divider"><div class="mixer-divider-line"></div></div>
              </div>

              <!-- DECK B -->
              <div class="deck-container">
                  <div class="deck-label label-right">DECK_B // 002</div>
                  <slot name="deck-b"></slot>
              </div>
          </div>

          <!-- LOWER ROW: Switches between Sliders/Actions OR FX Rack -->
          <div class="bottom-row">
             ${this.view === 'DECK' ? html`
                <div class="controls-row ${this._animClass}" @animationend="${this._onAnimEnd}">
                    <!-- CONTROLS SLOT -->
                    <div class="controls-panel">
                        <slot name="controls"></slot>
                    </div>

                    <!-- ACTIONS SLOT -->
                    <div class="actions-panel">
                       <slot name="actions"></slot>
                    </div>
                </div>
             ` : this.view === 'SUPER' ? html`
                <div class="rack-panel ${this._animClass}" @animationend="${this._onAnimEnd}">
                    <slot name="super"></slot>
                </div>
             ` : this.view === 'VISUAL' ? html`
                <div class="rack-panel ${this._animClass}" @animationend="${this._onAnimEnd}">
                    <slot name="visual-controls"></slot>
                </div>
             ` : html`
                <div class="rack-panel ${this._animClass}" @animationend="${this._onAnimEnd}">
                    <slot name="fx-rack"></slot>
                </div>
             `}
          </div>
        </main>
        
        <!-- FOOTER -->
        <footer>
          <span style="display:flex; gap:8px;">
            > AUDIO_ENGINE_READY... 
            <span style="color: ${this.status === 'LIVE' ? '#a1a1aa' : '#27272a'}">
              [ ${this.status === 'LIVE' ? 'OK' : 'WAITING'} ]
            </span>
          </span>
          <span>SESSION_ID: 0xGHOST</span>
        </footer>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
