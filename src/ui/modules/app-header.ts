import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { sharedStyles } from '../styles/theme';

@customElement('app-header')
export class AppHeader extends LitElement {
  static styles = [
    sharedStyles,
    css`
      :host {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        border-bottom: 1px dashed #333;
        padding-bottom: 8px;
        margin-bottom: 8px;
        padding: 8px;
        height: 30px;
        box-sizing: border-box;
        background: #000;
        z-index: 1001;
        position: relative;
      }
      
      h1 {
        font-size: 0.8rem;
        line-height: 1;
        color: #fff;
        margin: 0;
        font-weight: bold;
        letter-spacing: -0.05em;
      }
      
      .version {
        font-size: 0.5rem;
        opacity: 0.7;
        font-weight: normal;
        vertical-align: top;
        margin-left: 4px;
      }

      .btn-group {
        display: flex;
        gap: 8px;
      }

      button {
        font-size: 0.6rem;
        padding: 2px 4px;
        font-weight: bold;
        cursor: pointer;
        border: 1px solid #333;
      }
      
      button.active {
        background: #fff;
        color: #000;
      }
      
      button.inactive {
        background: #000;
        color: #888;
      }
    `
  ];

  @state() currentView: 'DECK' | 'RACK' = 'DECK';

  render() {
    return html`
      <div class="flex flex-col">
          <h1>BIO:GRAM<span class="version">v2.1</span></h1>
      </div>
      <div class="btn-group">
          <button 
            class="${this.currentView === 'DECK' ? 'active' : 'inactive'}"
            @click="${() => this.switchView('DECK')}">
            DECK
          </button>
          <button 
            class="${this.currentView === 'RACK' ? 'active' : 'inactive'}"
            @click="${() => this.switchView('RACK')}">
            FX_RACK
          </button>
      </div>
    `;
  }

  private switchView(view: 'DECK' | 'RACK') {
    this.currentView = view;
    this.dispatchEvent(new CustomEvent('view-change', {
      detail: { view },
      bubbles: true,
      composed: true
    }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'app-header': AppHeader;
  }
}
