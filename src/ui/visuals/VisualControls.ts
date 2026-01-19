import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

@customElement('visual-controls')
export class VisualControls extends LitElement {
    static styles = css`
        :host {
            display: block;
            height: 100%;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
            padding: 16px;
            box-sizing: border-box;
            font-family: 'JetBrains Mono', monospace;
            color: #ccc;
        }

        h2 {
            font-size: 10px;
            color: #555;
            letter-spacing: 0.2em;
            margin: 0 0 16px 0;
            border-bottom: 1px solid #333;
            padding-bottom: 4px;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: 16px;
        }

        .control-group {
            background: rgba(255, 255, 255, 0.03);
            padding: 12px;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.05);
        }

        .label {
            font-size: 10px;
            color: #888;
            margin-bottom: 8px;
            display: block;
        }

        input[type="file"] {
            font-size: 10px;
            color: #888;
        }

        button {
            background: #222;
            border: 1px solid #444;
            color: #ccc;
            padding: 4px 8px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 10px;
            transition: all 0.2s;
        }
        button:hover {
            background: #333;
            border-color: #666;
            color: #fff;
        }
        button.active {
            background: #e11d48;
            border-color: #fb7185;
            color: white;
            box-shadow: 0 0 10px rgba(225, 29, 72, 0.5);
        }

        .status {
            font-size: 9px;
            color: #666;
            margin-top: 4px;
        }
    `;

    @state() webcamActive = false;

    render() {
        return html`
            <div class="grid">
                <!-- Deck A Texture -->
                <div class="control-group">
                    <span class="label">DECK A TEXTURE</span>
                    <input type="file" accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'A')}" />
                    <div class="status" id="status-a">DEFAULT SKIN</div>
                </div>

                <!-- Deck B Texture -->
                <div class="control-group">
                    <span class="label">DECK B TEXTURE</span>
                    <input type="file" accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'B')}" />
                    <div class="status" id="status-b">DEFAULT SKIN</div>
                </div>

                <!-- Webcam Override -->
                <div class="control-group">
                    <span class="label">CAMERA OVERRIDE</span>
                    <button class="${this.webcamActive ? 'active' : ''}" @click="${this.toggleWebcam}">
                        ${this.webcamActive ? 'LIVE RELAY ACTIVE' : 'ACTIVATE CAMERA'}
                    </button>
                    <div class="status">
                        Overrides both textures with live feed triplanar mapping.
                    </div>
                </div>

                <!-- Global Params -->
                <div class="control-group">
                    <span class="label">VISUAL MIX MODE</span>
                    <button @click="${() => this.setMode('organic')}">ORGANIC</button>
                    <button @click="${() => this.setMode('wireframe')}">PARTICLES</button>
                    <div class="status">AI Mix automates this during transitions.</div>
                </div>
            </div>
        `;
    }

    private handleFile(e: Event, deck: 'A' | 'B') {
        const input = e.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;

        // Use FileReader to get Base64 DataURL (Sharable across tabs via string)
        const reader = new FileReader();
        reader.onload = (ev) => {
            const url = ev.target?.result as string;
            const type = file.type.startsWith('video') ? 'video' : 'image';

            // Dispatch Event to Main -> VisualEngine
            this.dispatchEvent(new CustomEvent('visual-texture-change', {
                detail: { deck, url, type }, // URL is now data:image/png;base64...
                bubbles: true,
                composed: true
            }));

            // Update Status Text
            const statusEl = this.shadowRoot?.getElementById(`status-${deck.toLowerCase()}`);
            if (statusEl) statusEl.innerText = `${type.toUpperCase()} LOADED`;
        };
        reader.readAsDataURL(file);
    }

    private randomizeColor(deck: 'A' | 'B') {
        this.dispatchEvent(new CustomEvent('visual-color-random', {
            detail: { deck },
            bubbles: true,
            composed: true
        }));
    }

    private toggleWebcam() {
        this.webcamActive = !this.webcamActive;
        // Dispatch Event
        this.dispatchEvent(new CustomEvent('visual-webcam-toggle', {
            detail: { active: this.webcamActive },
            bubbles: true,
            composed: true
        }));
    }

    private setMode(mode: 'organic' | 'wireframe') {
        this.dispatchEvent(new CustomEvent('visual-mode-change', {
            detail: { mode },
            bubbles: true,
            composed: true
        }));
    }
}
