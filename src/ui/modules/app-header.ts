import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('app-header')
export class AppHeader extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 48px;
      z-index: 1000;
      position: relative;
    }
    
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0 16px;
      height: 100%;
      background: rgba(0, 0, 0, 0.9);
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
    }

    .logo {
      font-size: 0.875rem;
      font-weight: bold;
      color: white;
      letter-spacing: 0.2em;
    }

    .right-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .api-btn {
      min-height: 30px;
      padding: 0 10px;
      border-radius: 8px;
      border: 1px solid #333;
      background: #0b0b0b;
      color: #9ca3af;
      font-family: monospace;
      font-size: 10px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: all 0.2s;
    }

    .api-btn:hover {
      color: #fff;
      border-color: #06b6d4;
      box-shadow: 0 0 10px rgba(6, 182, 212, 0.2);
    }

    /* DESKTOP NAV */
    .desktop-nav {
      display: none;
      gap: 8px;
      /* Absolute Center */
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
    }

    @media (min-width: 1025px) {
      .desktop-nav {
        display: flex;
      }
      .mobile-menu-btn {
        display: none !important; /* Force hide */
      }
      :host {
        height: 40px; 
      }
    }

    .nav-btn {
      font-family: monospace;
      font-size: 10px;
      padding: 4px 12px;
      border: 1px solid #333;
      background: #000;
      color: #888;
      cursor: pointer;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      transition: all 0.2s;
    }

    .nav-btn:hover {
      color: #ddd;
      border-color: #555;
    }

    .nav-btn.active {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    
    .nav-btn.active-rack {
      background: cyan;
      color: black;
      border-color: cyan;
      box-shadow: 0 0 10px cyan;
    }
    
    .nav-btn.active-visual {
      background: crimson;
      color: black;
      border-color: crimson;
      box-shadow: 0 0 10px crimson;
    }
    
    .nav-btn.active-super {
      background: purple;
      color: black;
      border-color: purple;
      box-shadow: 0 0 10px purple;
    }

    /* MOBILE MENU BTN */
    .mobile-menu-btn {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      width: 40px;
      height: 40px;
      background: transparent;
      border: none;
      cursor: pointer;
      gap: 5px;
      padding: 0;
    }

    .bar {
      width: 20px;
      height: 2px;
      background-color: #aaa;
      transition: all 0.3s;
    }

    .mobile-menu-btn.open .bar:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }
    .mobile-menu-btn.open .bar:nth-child(2) {
      opacity: 0;
    }
    .mobile-menu-btn.open .bar:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    /* MOBILE OVERLAY */
    .mobile-menu-overlay {
      position: fixed;
      top: 48px; /* Below header */
      left: 0;
      width: 100vw;
      height: calc(100vh - 48px);
      background: rgba(0, 0, 0, 0.95);
      backdrop-filter: blur(20px);
      z-index: 999;
      display: flex;
      flex-direction: column;
      padding: 20px;
      gap: 16px;
      box-sizing: border-box;
      transform: translateX(100%);
      transition: transform 0.3s ease-in-out;
    }

    .mobile-menu-overlay.open {
      transform: translateX(0);
    }

    .mobile-nav-item {
      width: 100%;
      padding: 16px;
      background: #111;
      border: 1px solid #333;
      color: #888;
      font-size: 1rem;
      font-family: monospace;
      text-transform: uppercase;
      text-align: left;
      cursor: pointer;
      border-radius: 8px;
    }

    .mobile-nav-item.active {
      background: #fff;
      color: #000;
      border-color: #fff;
    }
    .mobile-nav-item.active-rack { background: cyan; color: black; }
    .mobile-nav-item.active-visual { background: crimson; color: black; }
    .mobile-nav-item.active-super { background: purple; color: black; }

    .menu-header {
      color: #fff;
      font-size: 1.2rem;
      font-weight: bold;
      border-bottom: 1px solid #333;
      padding-bottom: 10px;
      margin-bottom: 10px;
    }
    
    .mixer-toggle {
      margin-top: auto;
      text-align: center;
      background: #222;
    }
    .mixer-toggle.active {
      background: #059669;
      color: white;
      border-color: #059669;
    }

    .mobile-tabbar {
      display: none;
    }

    .mobile-tab-btn {
      min-height: 54px;
      border-radius: 12px;
      border: 1px solid #2a2a2a;
      background: #0c0c0c;
      color: #8b8b8b;
      font-family: monospace;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      transition: all 0.2s ease;
      cursor: pointer;
    }

    .mobile-tab-btn:active {
      transform: scale(0.97);
    }

    .mobile-tab-btn.active {
      background: #ffffff;
      border-color: #ffffff;
      color: #000000;
    }

    .mobile-tab-btn.active-rack {
      background: #22d3ee;
      border-color: #22d3ee;
      color: #000;
      box-shadow: 0 0 12px rgba(34, 211, 238, 0.35);
    }

    .mobile-tab-btn.active-visual {
      background: #f43f5e;
      border-color: #f43f5e;
      color: #000;
      box-shadow: 0 0 12px rgba(244, 63, 94, 0.35);
    }

    .mobile-tab-btn.active-super {
      background: #a855f7;
      border-color: #a855f7;
      color: #000;
      box-shadow: 0 0 12px rgba(168, 85, 247, 0.35);
    }

    @media (max-width: 1024px) {
      .mobile-menu-btn,
      .mobile-menu-overlay {
        display: none !important;
      }

      .mobile-tabbar {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 8px;
        padding: 10px 10px calc(10px + env(safe-area-inset-bottom));
        background: linear-gradient(180deg, rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.95));
        backdrop-filter: blur(14px);
        border-top: 1px solid rgba(255, 255, 255, 0.08);
        z-index: 1200;
      }
    }
  `;

  @state() currentView: 'DECK' | 'RACK' | 'SUPER' | 'VISUAL' = 'DECK';
  @state() mobileMenuOpen = false;
  @state() mixerExpanded = false;

  connectedCallback() {
      super.connectedCallback();
      window.addEventListener('view-change', this.handleViewChange);
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('view-change', this.handleViewChange);
  }

  private handleViewChange = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.view) {
          this.currentView = detail.view;
      }
  }

  private toggleMenu() {
      this.mobileMenuOpen = !this.mobileMenuOpen;
  }

  private closeMenu() {
      this.mobileMenuOpen = false;
  }

  private switchView(view: 'DECK' | 'RACK' | 'SUPER' | 'VISUAL') {
    if (this.currentView === view) {
        this.closeMenu();
        return;
    }
    this.currentView = view;
    this.dispatchEvent(new CustomEvent('view-change', {
      detail: { view },
      bubbles: true,
      composed: true
    }));
    this.closeMenu();
  }
  
  private toggleMixer() {
      this.mixerExpanded = !this.mixerExpanded;
      window.dispatchEvent(new CustomEvent('mobile-mixer-toggle', {
          detail: { expanded: this.mixerExpanded },
          bubbles: true,
          composed: true
      }));
      // Don't close menu, user might want to toggle back
  }
  
  private scrollToGen() {
      this.switchView('DECK');
      this.closeMenu();
      // Dispatch async to allow view switch render
      setTimeout(() => {
          window.dispatchEvent(new CustomEvent('request-scroll-to-gen', {
              bubbles: true,
              composed: true
          }));
      }, 100);
  }

  private openApiSettings() {
      this.dispatchEvent(new CustomEvent('api-settings-open', {
          bubbles: true,
          composed: true
      }));
  }

  render() {
    return html`
      <div class="header-container">
          <div class="logo">Bio:gram</div>
          
          <!-- DESKTOP NAV -->
          <div class="desktop-nav">
              <button class="nav-btn ${this.currentView === 'DECK' ? 'active' : ''}" 
                      @click="${() => this.switchView('DECK')}">DECK_VIEW</button>
              <button class="nav-btn ${this.currentView === 'RACK' ? 'active-rack' : ''}" 
                      @click="${() => this.switchView('RACK')}">FX_RACK</button>
              <button class="nav-btn ${this.currentView === 'VISUAL' ? 'active-visual' : ''}" 
                      @click="${() => this.switchView('VISUAL')}">VISUAL</button>
              <button class="nav-btn ${this.currentView === 'SUPER' ? 'active-super' : ''}" 
                      @click="${() => this.switchView('SUPER')}">AI_MIX</button>
          </div>

          <div class="right-controls">
              <button class="api-btn" @click="${this.openApiSettings}">API KEY</button>
          </div>

      </div>

      <!-- MOBILE TAB BAR -->
      <div class="mobile-tabbar">
          <button class="mobile-tab-btn ${this.currentView === 'DECK' ? 'active' : ''}"
                  @click="${() => this.switchView('DECK')}">Deck</button>
          <button class="mobile-tab-btn ${this.currentView === 'RACK' ? 'active-rack' : ''}"
                  @click="${() => this.switchView('RACK')}">FX</button>
          <button class="mobile-tab-btn ${this.currentView === 'VISUAL' ? 'active-visual' : ''}"
                  @click="${() => this.switchView('VISUAL')}">Visual</button>
          <button class="mobile-tab-btn ${this.currentView === 'SUPER' ? 'active-super' : ''}"
                  @click="${() => this.switchView('SUPER')}">AI Mix</button>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
