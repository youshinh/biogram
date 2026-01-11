import { LitElement, html, css, PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('bio-slider')
export class BioSlider extends LitElement {
  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      height: 100%;
      min-height: 150px;
      user-select: none;
      touch-action: none;
    }

    .track-container {
      flex-grow: 1;
      width: 100%;
      border: 1px solid rgba(255, 255, 255, 0.3);
      position: relative;
    }

    .track {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column-reverse; /* Bottom to top */
      gap: 2px;
      box-sizing: border-box;
      cursor: ns-resize;
    }

    .segment {
      flex-grow: 1;
      width: 100%;
      background-color: #333;
      transition: background-color 0.1s;
      min-height: 2px;
      pointer-events: none; /* Crucial: clicks go to track */
    }

    .segment.active {
      background-color: white;
      box-shadow: 0 0 4px rgba(255,255,255,0.8);
    }

    .touch-overlay {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        cursor: ns-resize;
        z-index: 10;
    }

    .label {
      font-size: 0.6rem;
      margin-top: 4px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      font-weight: bold;
    }

    .value {
      font-size: 0.6rem;
      opacity: 0.5;
    }
  `;

  @property({ type: String }) label = "PARAM";
  @property({ type: Number, reflect: true }) value = 0;
  @property({ type: Number }) min = 0;
  @property({ type: Number }) max = 100;

  @state() private segments: number[] = Array.from({ length: 20 });
  @state() private isDragging = false;

  private handlePointerDown(e: PointerEvent) {
      this.isDragging = true;
      const overlay = this.shadowRoot?.querySelector('.touch-overlay') as HTMLElement;
      overlay.setPointerCapture(e.pointerId);
      this.updateValue(e);
  }

  private handlePointerMove(e: PointerEvent) {
      if (!this.isDragging) return;
      this.updateValue(e);
  }

  private handlePointerUp(e: PointerEvent) {
      this.isDragging = false;
      const overlay = this.shadowRoot?.querySelector('.touch-overlay') as HTMLElement;
      overlay.releasePointerCapture(e.pointerId);
  }

  private updateValue(e: PointerEvent) {
      const overlay = this.shadowRoot?.querySelector('.touch-overlay') as HTMLElement;
      const rect = overlay.getBoundingClientRect();
      const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
      const normalized = 1.0 - (y / rect.height);
      const newVal = Math.round(normalized * (this.max - this.min) + this.min);
      
      if (this.value !== newVal) {
          this.value = newVal;
          this.dispatchEvent(new CustomEvent('change', { 
              detail: this.value,
              bubbles: true,
              composed: true 
          }));
      }
  }

  render() {
    // 0-100 logic
    const activeCount = Math.floor((this.value / this.max) * 20);

    return html`
      <div class="track-container">
        <div class="touch-overlay"
             @pointerdown="${this.handlePointerDown}"
             @pointermove="${this.handlePointerMove}"
             @pointerup="${this.handlePointerUp}">
        </div>
        <div class="track">
           ${this.segments.map((_, i) => html`
             <div class="segment ${i < activeCount ? 'active' : ''}"></div>
           `)}
        </div>
      </div>
      <div class="label">${this.label}</div>
      <div class="value">${this.value.toString().padStart(3, '0')}</div>
    `;
  }
}
