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

    /* MIXER WRAPPER */
    .mixer-column-wrapper {
        display: flex;
        flex-direction: column;
        height: 100%;
        gap: 8px;
        min-height: 0;
    }

    /* MIXER CONTAINER */
    .mixer-container {
      display: flex;
      flex-direction: column;
      flex-grow: 1; /* Fill available space */
      overflow: hidden;
      border-radius: 1.5rem;
      background: rgba(0, 0, 0, 0.4);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      padding: 4px;
      z-index: 20;
    }
    
    .mixer-controls-static {
        flex-shrink: 0;
        width: 100%;
    }

    /* Desktop: Hide Mobile Header, Show Content */
    .mixer-header {
      display: none;
    }
    .mixer-content {
      flex: 1;
      width: 100%;
      min-height: 0;
      opacity: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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

    /* ... Animations ... */
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
    
    slot[name="mixer-controls"] {
        display: block;
        width: 100%;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* --- MOBILE DECK SWITCHER --- */
    .mobile-deck-switcher {
      display: none; /* Hidden on desktop */
    }

    /* --- MOBILE RESPONSIVE OVERRIDES (1024px and below) --- */
    @media (max-width: 1024px) {
      :host {
        --mobile-header-height: 48px;
        height: auto;
        min-height: 100vh;
        min-height: 100dvh;
        overflow: visible;
      }

      .shell-container {
        display: flex;
        flex-direction: column;
        padding: 0;
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
      }

      main {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        padding-bottom: calc(80px + env(safe-area-inset-bottom)); /* Tab bar space */
      }

      /* --- DECK VIEW: Single Deck + Switcher --- */
      .deck-row {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        padding: 0;
        gap: 0;
      }

      /* Pin order: switcher -> crossfader -> active deck */
      .mobile-deck-switcher { order: 1; }
      .mixer-column-wrapper { order: 2; }
      .deck-container { order: 3; }

      /* Mobile Deck A/B Switcher */
      .mobile-deck-switcher {
        display: flex;
        gap: 0;
        padding: 6px 8px;
        background: rgba(0, 0, 0, 0.6);
        flex-shrink: 0;
      }

      .mobile-deck-tab {
        flex: 1;
        min-height: 40px;
        border: 1px solid #27272a;
        background: #0c0c0c;
        color: #71717a;
        font-family: 'JetBrains Mono', monospace;
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .mobile-deck-tab:first-child {
        border-radius: 10px 0 0 10px;
      }

      .mobile-deck-tab:last-child {
        border-radius: 0 10px 10px 0;
      }

      .mobile-deck-tab:active {
        transform: scale(0.97);
      }

      .mobile-deck-tab.active-a {
        background: rgba(6, 182, 212, 0.15);
        border-color: rgba(6, 182, 212, 0.5);
        color: #22d3ee;
        box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
      }

      .mobile-deck-tab.active-b {
        background: rgba(16, 185, 129, 0.15);
        border-color: rgba(16, 185, 129, 0.5);
        color: #10b981;
        box-shadow: 0 0 10px rgba(16, 185, 129, 0.2);
      }

      /* Single deck takes all available space */
      .deck-container {
        flex: 1;
        width: 100%;
        height: auto;
        min-height: 0;
        border-radius: 0;
        border: none;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.2);
        margin: 0;
        position: relative;
        z-index: 10;
        overflow: hidden;
      }

      /* Hide inactive deck on mobile */
      .deck-container.mobile-hidden {
        display: none;
      }

      /* Mixer column: compact inline strip, pinned above deck */
      .mixer-column-wrapper {
        width: 100%;
        height: auto;
        gap: 0;
        flex-shrink: 0;
      }

      /* Mixer EQ: completely hidden on DECK view (accessible via FX tab) */
      .mixer-container {
        display: none;
      }

      .mixer-header { display: none; }
      .mixer-divider { display: none; }
      
      /* Mixer controls (BPM/Crossfader): always visible compact strip */
      .mixer-controls-static {
        flex-shrink: 0;
        width: 100%;
      }

      /* Deck fills remaining height below crossfader */
      .deck-container:not(.mobile-hidden) {
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      /* -- MOBILE VIEW SWITCHING LOGIC -- */

      /* DECK VIEW: Show Decks, Hide Bottom Row */
      :host([view="DECK"]) .deck-row {
        display: flex;
      }
      :host([view="DECK"]) .bottom-row {
        display: none; /* Hide controls-row on mobile DECK view — deck has own overlay */
      }

      /* PANEL VIEWS (RACK, VISUAL, SUPER): Hide Decks, Show Bottom */
      :host(:not([view="DECK"])) .deck-row {
        display: none;
      }
      :host(:not([view="DECK"])) .bottom-row {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        width: 100%;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
        padding: 8px;
        padding-bottom: 20px;
        box-sizing: border-box;
      }

      /* SUPER (AI Mix): make panels scrollable and visible */
      :host([view="SUPER"]) .bottom-row {
        overflow-y: auto;
      }
      
      /* Ensure main is always visible */
      :host([view="RACK"]) main,
      :host([view="VISUAL"]) main,
      :host([view="SUPER"]) main {
         display: flex;
      }
      
      /* Mobile Controls Styling (hidden on DECK view, shown on panel views) */
      .controls-row {
        display: flex;
        flex-direction: column;
        gap: 16px;
        padding: 0;
      }
      
      .controls-panel {
        display: flex;
        flex-direction: column;
        overflow-x: auto;
        padding: 16px;
        background: rgba(0,0,0,0.5);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        min-height: 200px;
      }
      
      .actions-panel {
        display: flex;
        gap: 8px;
        justify-content: center;
        flex-wrap: wrap;
      }

      /* Rack panel fill */
      .rack-panel {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        -webkit-overflow-scrolling: touch;
      }
      
      /* Hide desktop-only elements */
      .nav-trigger { display: none; }
      footer { display: none; }
      
      /* Adjusted labels */
      .deck-label { top: 6px; left: 8px; font-size: 12px; }
    }

    /* Tablet and Mobile share the same vertical layout now (handled by 1024px breakpoint above) */
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
  @property({ type: String, reflect: true }) view: 'DECK' | 'RACK' | 'SUPER' | 'VISUAL' = 'DECK';
  
  @state() private _animClass = ''; // Transient animation class
  
  @state() private _showNavLeft = false;
  @state() private _showNavRight = false;
  
  @state() private _mixerExpanded = false;
  
  @state() private _activeDeck: 'A' | 'B' = 'A'; // Mobile: which deck is visible
  
  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('mousemove', this._handleGlobalMouseMove);
      window.addEventListener('mobile-mixer-toggle', this._handleMixerToggle as EventListener);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('mousemove', this._handleGlobalMouseMove);
      window.removeEventListener('mobile-mixer-toggle', this._handleMixerToggle as EventListener);
  }
  
  private _handleMixerToggle = (e: CustomEvent) => {
      this._mixerExpanded = e.detail.expanded;
  }
  
  private _toggleMixerDirect() {
      this._mixerExpanded = !this._mixerExpanded;
      window.dispatchEvent(new CustomEvent('mobile-mixer-toggle', {
          detail: { expanded: this._mixerExpanded },
          bubbles: true,
          composed: true
      }));
  }
  
  private _switchDeck(deck: 'A' | 'B') {
      this._activeDeck = deck;
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
             <!-- MOBILE: Deck A/B Switcher -->
             <div class="mobile-deck-switcher">
                 <button class="mobile-deck-tab ${this._activeDeck === 'A' ? 'active-a' : ''}"
                         @click="${() => this._switchDeck('A')}">DECK A</button>
                 <button class="mobile-deck-tab ${this._activeDeck === 'B' ? 'active-b' : ''}"
                         @click="${() => this._switchDeck('B')}">DECK B</button>
             </div>

             <!-- DECK A -->
              <div class="deck-container ${this._activeDeck !== 'A' ? 'mobile-hidden' : ''}">
                  <div class="deck-label label-left">DECK_A // 001</div>
                  <slot name="deck-a"></slot>
              </div>

              <!-- MIXER -->
              <!-- MIXER COLUMN -->
              <div class="mixer-column-wrapper">
                  <!-- MIXER (EQ) -->
                  <div class="mixer-container ${this._mixerExpanded ? 'mixer-expanded' : ''}">
                      <div class="mixer-header" @click="${this._toggleMixerDirect}">
                          <div class="mixer-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/></svg>
                          </div>
                          <span class="mixer-label">MIXER / EQ</span>
                          <div class="mixer-icon">
                            <svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M480-345 240-585l56-56 184 184 184-184 56 56-240 240Z"/></svg>
                          </div>
                      </div>
                      <div class="mixer-content">
                          <div class="mixer-divider"><div class="mixer-divider-line"></div></div>
                          <slot name="mixer"></slot>
                          <div class="mixer-divider"><div class="mixer-divider-line"></div></div>
                      </div>
                  </div>

                  <!-- MIXER CONTROLS (BPM & X-FADER) - ALWAYS VISIBLE -->
                  <div class="mixer-controls-static">
                      <slot name="mixer-controls"></slot>
                  </div>
              </div>

              <!-- DECK B -->
              <div class="deck-container ${this._activeDeck !== 'B' ? 'mobile-hidden' : ''}">
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
