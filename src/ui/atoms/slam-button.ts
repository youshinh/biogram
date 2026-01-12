import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

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
      touch-action: none; /* Important for preventing scroll/zoom while holding */
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

    button:hover {
      background: white;
      color: black;
    }

    button:active {
      transform: scale(0.98);
      background: white;
      color: black;
    }

    .content-default {
      display: flex;
      flex-direction: column;
      align-items: center;
      z-index: 10;
    }

    .content-hover {
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
    }

    button:hover .content-hover {
        opacity: 1;
    }
    
    button:hover .content-default {
        opacity: 0;
    }
  `;

  render() {
    return html`
      <button>
        <div class="content-default">
            <span style="font-size: 1.5rem; font-weight: bold; letter-spacing: 0.1em;">SLAM</span>
            <span style="font-size: 0.6rem; letter-spacing: 0.3em;">INJECT_NOISE</span>
        </div>
        <div class="content-hover">
            RELEASE
        </div>
        <slot></slot>
      </button>
    `;
  }
}
