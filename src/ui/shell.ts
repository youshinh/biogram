import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background-color: #0a0a0c; /* deep-void */
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
      top: 8px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.65rem;
      color: #3f3f46;
      pointer-events: none;
      z-index: 20;
    }
    .label-left { left: 16px; }
    .label-right { right: 16px; }

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
      padding: 16px;
      display: flex;
      gap: 16px;
      overflow-x: auto;
      overflow-y: hidden;
      align-items: center;
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
    slot[name="deck-a"], slot[name="deck-b"], slot[name="mixer"], slot[name="fx-rack"] {
      display: block;
      height: 100%;
      width: 100%;
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `;

  @property({ type: String }) status = "OFFLINE";
  @property({ type: String }) view: 'DECK' | 'RACK' | 'SUPER' = 'DECK';

  render() {
    return html`
      <div class="shell-container">
        <!-- Background Layer -->
        <div class="bg-layer">
            <!-- Hydra Placeholder -->
        </div>

        <!-- MAIN LAYOUT -->
        <main>
          
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
                <div class="controls-row">
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
                <div class="rack-panel">
                    <slot name="super"></slot>
                </div>
             ` : html`
                <div class="rack-panel">
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
