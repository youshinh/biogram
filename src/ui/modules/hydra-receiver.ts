import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('hydra-receiver')
export class HydraReceiver extends LitElement {
  static styles = css`
    :host {
      display: block;
      width: 100vw;
      height: 100vh;
      background: black;
      overflow: hidden;
      cursor: none; /* Hide cursor for projection */
    }
    
    canvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .debug-info {
        position: absolute;
        top: 10px;
        right: 10px;
        color: rgba(255,255,255,0.3);
        font-family: monospace;
        font-size: 0.8rem;
    }
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private vjChannel: BroadcastChannel = new BroadcastChannel('vj_link');
  private animationId: number = 0;

  // State from Controller
  private headAPos: number = 0;
  private frameCount: number = 0;
  
  connectedCallback() {
      super.connectedCallback();
      this.vjChannel.onmessage = (event) => {
          if (event.data.type === 'FRAME') {
              this.headAPos = event.data.headPos;
              // We could also drive animation directly here, but rAF is smoother
          }
      };
  }

  firstUpdated() {
    this.canvas = this.renderRoot.querySelector('canvas');
    if (this.canvas) {
        this.ctx = this.canvas.getContext('2d');
        // Fullscreen resize handling
        const resize = () => {
            if(this.canvas) {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
            }
        };
        window.addEventListener('resize', resize);
        resize();
        
        this.runLoop();
    }
  }

  disconnectedCallback() {
      super.disconnectedCallback();
      cancelAnimationFrame(this.animationId);
      this.vjChannel.close();
  }

  private runLoop = () => {
    this.animationId = requestAnimationFrame(this.runLoop);
    this.frameCount++;
    if (!this.ctx || !this.canvas) return;

    const w = this.canvas.width;
    const h = this.canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    // --- VJ ART ---
    // Pure visual output, no UI chrome.
    
    // 1. Fade Trail
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
    this.ctx.fillRect(0, 0, w, h);

    // 2. Rotating Grid based on Head Position (Simulating tape movement)
    this.ctx.save();
    this.ctx.translate(cx, cy);
    this.ctx.rotate(this.headAPos * Math.PI * 2); // Rotate 360 over 1 cycle
    
    this.ctx.strokeStyle = `hsl(0, 0%, ${50 + Math.random() * 50}%)`;
    this.ctx.lineWidth = 2;
    
    // Draw expanding circle
    const radius = (this.headAPos * Math.min(w,h)) / 2;
    this.ctx.beginPath();
    this.ctx.arc(0, 0, radius, 0, Math.PI * 2);
    this.ctx.stroke();

    // Glitch lines
    if (Math.random() > 0.9) {
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect((Math.random()-0.5)*w, (Math.random()-0.5)*h, Math.random()*100, 2);
    }
    
    this.ctx.restore();
    
    // 3. Center Fixation
    this.ctx.fillStyle = 'white';
    this.ctx.fillRect(cx-2, cy-2, 4, 4);
  }

  render() {
    return html`
      <canvas></canvas>
      <div class="debug-info">PROJECTION_MODE // LINK_ACTIVE</div>
    `;
  }
}
