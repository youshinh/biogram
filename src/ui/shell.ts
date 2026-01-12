import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('app-shell')
export class AppShell extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      width: 100vw;
      padding: var(--spacing-base, 4px);
      box-sizing: border-box;
      background: var(--bg-color, black);
      color: var(--fg-color, white);
    }

    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1px solid white;
      padding-bottom: 8px;
      margin-bottom: 16px;
    }
    
    .title { font-size: 1.25rem; font-weight: bold; letter-spacing: -0.05em; }
    .subtitle { font-size: 0.6rem; opacity: 0.6; }

    main {
      flex-grow: 1;
      display: grid;
      /* Fixed Top Row (500px) per user request */
      grid-template-rows: 500px minmax(0, 1fr); 
      gap: 8px;
      min-height: 0;
      overflow: hidden;
    }
    
    /* main.minimal-mode removed to enforce consistent 350px Top Row */

    .row-top {
      display: grid;
      grid-template-columns: 1fr 240px 1fr;
      gap: 8px; /* Separator gap */
      height: 100%;
      min-height: 0; /* Allow shrink */
    }

    .deck-container {
        border: 1px solid #333;
        background: #050505;
        position: relative;
        display: flex;
        flex-direction: column;
        overflow: hidden; /* Fix overlap */
    }

    .mixer-container {
        border: 1px solid #444;
        background: #111;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        overflow: hidden; /* Fix overlap */
    }

    .row-bottom {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 16px;
    }

    footer {
      font-size: 0.6rem;
      border-top: 1px solid white;
      padding-top: 8px;
      margin-top: auto;
      display: flex;
      justify-content: space-between;
      opacity: 0.5;
    }
  `;

  @property({ type: String }) status = "OFFLINE";
  @property({ type: Boolean, reflect: true }) minimal = false;

  render() {
    return html`
      <header>
        <div class="flex flex-col">
            <!-- Title -->
        </div>
        <div style="font-size: 0.75rem; text-align: right;">
             <div>STATUS: ${this.status}</div>
        </div>
      </header>

      <main class="${this.minimal ? 'minimal-mode' : ''}">
        <!-- UPPER ROW: Dual Decks & Mixer -->
        <div class="row-top">
            <!-- DECK A -->
            <div class="deck-container">
                <slot name="deck-a"></slot>
            </div>

            <!-- MIXER (The Abyss) -->
            <div class="mixer-container">
                <slot name="mixer"></slot>
            </div>

            <!-- DECK B -->
            <div class="deck-container">
                <slot name="deck-b"></slot>
            </div>
        </div>

        <!-- LOWER ROW: Sliders & Actions (Global FX) -->
        ${this.minimal ? null : html`
        <div class="row-bottom">
            <div class="b-all p-2">
                <slot name="controls"></slot>
            </div>
            <div class="flex flex-col gap-4">
               <slot name="actions"></slot>
            </div>
        </div>
        `}
      </main>

      <footer>
        <span>> AUDIO_ENGINE_READY... ${this.status === 'LIVE' ? 'OK' : 'WAITING'}</span>
        <span>SESSION_ID: 0xGHOST</span>
      </footer>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-shell': AppShell;
  }
}
