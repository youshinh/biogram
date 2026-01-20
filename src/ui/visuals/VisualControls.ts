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
            padding: 8px; /* Reduce padding to allow content to fit flush */
            box-sizing: border-box;
            font-family: 'JetBrains Mono', monospace;
            color: #ccc;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr); /* 4 Columns for 4 Panels */
            gap: 12px;
            height: 100%;
        }

        /* Mobile responsive for the grid */
        @media (max-width: 1024px) {
            .grid {
                display: flex; /* Scrolling strip on mobile */
                overflow-x: auto;
                width: 100%;
            }
            .control-group {
                min-width: 240px;
            }
        }

        .control-group {
            background: rgba(0, 0, 0, 0.4);
            padding: 16px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            height: 100%;
            box-sizing: border-box;
            transition: all 0.3s ease;
        }
        
        .control-group:hover {
            border-color: rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
        }

        .label {
            font-size: 11px;
            font-weight: 700;
            color: #666;
            margin-bottom: 12px;
            display: block;
            letter-spacing: 0.1em;
        }

        /* Custom File Input Styling */
        .file-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #18181b;
            border: 1px solid #333;
            color: #a1a1aa;
            padding: 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
        }

        .file-btn:hover {
            border-color: #555;
            color: #fff;
            background: #27272a;
        }

        .file-btn:active {
            transform: scale(0.98);
        }

        button {
            background: #18181b;
            border: 1px solid #333;
            color: #a1a1aa;
            padding: 12px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 11px;
            font-weight: 600;
            transition: all 0.2s;
            width: 100%;
            margin-bottom: 4px;
        }
        
        button:hover {
            background: #27272a;
            border-color: #555;
            color: #fff;
        }
        
        button.active {
            background: #be123c; /* Rose-700 */
            border-color: #f43f5e;
            color: white;
            box-shadow: 0 0 15px rgba(225, 29, 72, 0.4);
        }

        .status {
            font-size: 9px;
            color: #555;
            margin-top: 8px;
            font-family: 'Inter', sans-serif;
            min-height: 14px;
        }
        
        .btn-group {
            display: flex;
            gap: 8px;
            width: 100%;
        }
    `;

    @state() webcamActive = false;

    render() {
        return html`
            <div class="grid">
                <!-- Deck A Texture -->
                <div class="control-group">
                    <div>
                        <span class="label">DECK A TEXTURE</span>
                        <label class="file-btn">
                            SELECT FILE
                            <input type="file" hidden accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'A')}" />
                        </label>
                    </div>
                    <div class="status" id="status-a">DEFAULT SKIN</div>
                </div>

                <!-- Deck B Texture -->
                <div class="control-group">
                    <div>
                        <span class="label">DECK B TEXTURE</span>
                        <label class="file-btn">
                            SELECT FILE
                            <input type="file" hidden accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'B')}" />
                        </label>
                    </div>
                    <div class="status" id="status-b">DEFAULT SKIN</div>
                </div>

                <!-- Webcam Override -->
                <div class="control-group">
                    <div>
                        <span class="label">CAMERA OVERRIDE</span>
                        <button class="${this.webcamActive ? 'active' : ''}" @click="${this.toggleWebcam}">
                            ${this.webcamActive ? 'LIVE RELAY ACTIVE' : 'ACTIVATE CAMERA'}
                        </button>
                    </div>
                    <div class="status">
                        Triplanar Mapping Override
                    </div>
                </div>

                <!-- Global Params -->
                <div class="control-group">
                    <div>
                        <span class="label">VISUAL MIX MODE</span>
                        <div class="btn-group">
                            <button @click="${() => this.setMode('organic')}">ORGANIC</button>
                            <button @click="${() => this.setMode('wireframe')}">PARTICLES</button>
                        </div>
                    </div>
                    <div class="status">Auto-controlled by AI Mix</div>
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
