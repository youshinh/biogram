import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('slam-button')
export class SlamButton extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 80px;
      user-select: none;
      -webkit-user-select: none;
      touch-action: none;
    }

    button {
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(
        45deg,
        #000,
        #000 2px,
        #111 2px,
        #111 4px
      );
      border: 1px solid white;
      color: white;
      font-family: inherit;
      position: relative;
      cursor: pointer;
      overflow: hidden;
      transition: all 0.1s;
      user-select: none;
      -webkit-user-select: none;
    }

    /* Hover: gray instead of white */
    button:hover {
      background: #333;
      color: #ccc;
    }
    
    /* Active state: white (toggled on) */
    button.active {
      background: white;
      color: black;
    }

    button:active {
      transform: scale(0.98);
    }

    .content-default {
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 10;
    }

    .content-active {
        position: absolute;
        inset: 0;
        display: flex;
        justify-content: center;
        align-items: center;
        opacity: 0;
        background: white;
        color: black;
        font-weight: bold;
        letter-spacing: 0.2em;
        transition: opacity 0.1s;
    }

    button.active .content-active {
        opacity: 1;
    }
    
    button.active .content-default {
        opacity: 0;
    }
  `;

  @state() private isActive = false;

  private handleClick = (e: MouseEvent) => {
    // Toggle active state
    this.isActive = !this.isActive;
    
    if (this.isActive) {
      // Dispatch start event with center of button as default position
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      this.dispatchEvent(new CustomEvent('slam-start', {
        bubbles: true,
        composed: true,
        detail: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      }));
    } else {
      // Dispatch end event
      this.dispatchEvent(new CustomEvent('slam-end', {
        bubbles: true,
        composed: true
      }));
    }
  };

  render() {
    return html`
      <button
        class="${this.isActive ? 'active' : ''}"
        @click=${this.handleClick}
      >
        <div class="content-default">
            <span style="font-size: 1.5rem; font-weight: bold; letter-spacing: 0.1em;">SLAM</span>
            <span style="font-size: 0.6rem; letter-spacing: 0.3em;">INJECT_NOISE</span>
        </div>
        <div class="content-active">
            ACTIVE
        </div>
        <slot></slot>
      </button>
    `;
  }
}
