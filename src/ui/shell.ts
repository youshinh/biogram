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
      grid-template-rows: 3fr 2fr;
      gap: 16px;
      min-height: 0;
    }

    .row-top {
      display: grid;
      grid-template-columns: 3fr 1fr;
      gap: 16px;
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

  render() {
    return html`
      <header>
        <div class="flex flex-col">
            <div class="title">PROMPT_DJ<span style="font-size: 0.75rem; margin-left: 4px; font-weight: normal;">v2.0</span></div>
            <div class="subtitle">SYS.BIO.GRAM // USER: GUEST</div>
        </div>
        <div style="font-size: 0.75rem; text-align: right;">
             <div>STATUS: ${this.status}</div>
        </div>
      </header>

      <main>
        <!-- UPPER ROW: Visualizer & Master -->
        <div class="row-top">
            <div class="b-all" style="position: relative;">
                <!-- HOST: Hydra Visualizer -->
                <slot name="visualizer"></slot>
            </div>
            <div class="flex flex-col gap-4">
                <div class="flex-grow">
                    <slot name="master"></slot>
                </div>
                <div class="b-all p-2 flex-grow" style="min-height: 100px;">
                    <div style="font-size: 0.7rem; font-weight: bold;">BUFFER_HEALTH</div>
                    <div style="margin-top: 8px; font-size: 2rem; color: #0f0;">100%</div>
                </div>
            </div>
        </div>

        <!-- LOWER ROW: Sliders & Actions -->
        <div class="row-bottom">
            <div class="b-all p-2">
                <!-- HOST: Bio Sliders -->
                <slot name="controls"></slot>
            </div>
            <div class="flex flex-col gap-4">
               <!-- HOST: Actions & SLAM -->
               <slot name="actions"></slot>
            </div>
        </div>
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
