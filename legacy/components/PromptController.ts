/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { css, html, LitElement } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';

import type { MidiDispatcher } from '../utils/MidiDispatcher';
import type { Prompt, ControlChange } from '../types';

/** A single prompt input associated with a MIDI CC. */
@customElement('prompt-controller')
export class PromptController extends LitElement {
  static override styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    .prompt {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: space-between;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 10px;
      box-sizing: border-box;
      background: rgba(0, 0, 0, 0.4);
      transition: border-color 0.2s;
    }
    .prompt:hover {
      border-color: #666;
    }
    
    /* Vertical Slider */
    .slider-container {
      flex: 1;
      width: 100%;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
      margin: 10px 0;
    }
    input[type=range] {
      -webkit-appearance: none;
      width: 120px; /* Height becomes width when rotated */
      height: 4px;
      background: transparent;
      outline: none;
      transform: rotate(-90deg);
      cursor: pointer;
    }
    /* Slider Track */
    input[type=range]::-webkit-slider-runnable-track {
      width: 100%;
      height: 4px;
      background: #333;
      border-radius: 2px;
    }
    /* Slider Thumb */
    input[type=range]::-webkit-slider-thumb {
      -webkit-appearance: none;
      height: 30px; /* Width in vertical mode */
      width: 16px; /* Height in vertical mode */
      border-radius: 2px;
      background: #000;
      margin-top: -6px; /* align center */
      border: 1px solid #888;
      box-shadow: 0 0 5px rgba(0, 0, 0, 0.5);
      cursor: grab;
    }
    input[type=range]:active::-webkit-slider-thumb {
      cursor: grabbing;
      background: #222;
      border-color: #fff;
    }
    :host([filtered]) input[type=range]::-webkit-slider-thumb {
      background: #000;
      border-color: #0ff;
      box-shadow: 0 0 8px rgba(0, 255, 255, 0.5);
    }
    
    #midi {
      font-family: 'Courier New', monospace;
      font-size: 10px;
      color: #666;
      cursor: pointer;
      user-select: none;
      margin-top: 5px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    #midi:hover {
      color: #fff;
    }
    .learn-mode #midi {
      color: #ff9900;
    }

    #text {
      font-family: 'Helvetica Neue', Arial, sans-serif;
      font-weight: 300;
      font-size: 12px;
      width: 100%;
      text-align: center;
      color: #eee;
      background: transparent;
      border: none;
      outline: none;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      margin-top: 5px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    /* Filtered State (Active) */
    :host([filtered]) .prompt {
      border-color: #fff;
      box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.1);
    }
    :host([filtered]) input[type=range]::-webkit-slider-thumb {
      background: #0ff; /* Cyan for active */
      box-shadow: 0 0 10px #0ff;
    }
  `;

  @property({ type: String }) promptId = '';
  @property({ type: String }) text = '';
  @property({ type: Number }) weight = 0;
  @property({ type: String }) color = '';
  @property({ type: Boolean, reflect: true }) filtered = false;

  @property({ type: Number }) cc = 0;
  @property({ type: Number }) channel = 0; // Not currently used

  @property({ type: Boolean }) learnMode = false;
  @property({ type: Boolean }) showCC = false;

  @query('input[type="range"]') private weightInput!: HTMLInputElement;
  @query('#text') private textInput!: HTMLInputElement;

  @property({ type: Object })
  midiDispatcher: MidiDispatcher | null = null;

  @property({ type: Number }) audioLevel = 0;

  private lastValidText!: string;

  override connectedCallback() {
    super.connectedCallback();
    this.midiDispatcher?.addEventListener('cc-message', (e: Event) => {
      const customEvent = e as CustomEvent<ControlChange>;
      const { channel, cc, value } = customEvent.detail;
      if (this.learnMode) {
        this.cc = cc;
        this.channel = channel;
        this.learnMode = false;
        this.dispatchPromptChange();
      } else if (cc === this.cc) {
        // Value 0-127 mapped to 0-1
        this.weight = value / 127;
        this.dispatchPromptChange();
      }
    });
  }

  override firstUpdated() {
    this.textInput.setAttribute('contenteditable', 'plaintext-only');
    this.textInput.textContent = this.text;
    this.lastValidText = this.text;
  }

  update(changedProperties: Map<string, unknown>) {
    if (changedProperties.has('showCC') && !this.showCC) {
      this.learnMode = false;
    }
    if (changedProperties.has('text') && this.textInput) {
      this.textInput.textContent = this.text;
    }
    super.update(changedProperties);
  }

  private dispatchPromptChange() {
    this.dispatchEvent(
      new CustomEvent<Prompt>('prompt-changed', {
        detail: {
          promptId: this.promptId,
          text: this.text,
          weight: this.weight,
          cc: this.cc,
          color: this.color,
        },
      }),
    );
  }

  private onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      this.textInput.blur();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      this.resetText();
      this.textInput.blur();
    }
  }

  private resetText() {
    this.text = this.lastValidText;
    this.textInput.textContent = this.lastValidText;
  }

  private async updateText() {
    const newText = this.textInput.textContent?.trim();
    if (!newText) {
      this.resetText();
    } else {
      this.text = newText;
      this.lastValidText = newText;
    }
    this.dispatchPromptChange();
    this.textInput.scrollLeft = 0;
  }

  private onFocus() {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(this.textInput);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  private updateWeight() {
    this.weight = parseFloat(this.weightInput.value);
    this.dispatchPromptChange();
  }

  private toggleLearnMode() {
    this.learnMode = !this.learnMode;
  }

  override render() {
    const classes = classMap({
      'prompt': true,
      'learn-mode': this.learnMode,
    });
    return html`<div class=${classes}>
       <span
        id="text"
        spellcheck="false"
        @focus=${this.onFocus}
        @keydown=${this.onKeyDown}
        @blur=${this.updateText}></span>

      <div class="slider-container">
        <input 
          type="range" 
          min="0" 
          max="1" 
          step="0.01" 
          .value=${this.weight.toString()} 
          @input=${this.updateWeight}
        >
      </div>

      <div id="midi" @click=${this.toggleLearnMode}>
        ${this.learnMode ? 'Lrn' : `CC ${this.cc}`}
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'prompt-controller': PromptController;
  }
}
