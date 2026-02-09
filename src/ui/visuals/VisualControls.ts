import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { VisualMode } from './modes';

@customElement('visual-controls')
export class VisualControls extends LitElement {
    static styles = css`
        :host {
            display: block;
            height: 100%;
            min-height: 0;
            background: rgba(0, 0, 0, 0.4);
            border-radius: 8px;
            padding: 8px;
            box-sizing: border-box;
            font-family: 'JetBrains Mono', monospace;
            color: #ccc;
            overflow: hidden;
        }

        .main-layout {
            display: grid;
            grid-template-columns: 300px 280px 1fr;
            gap: 12px;
            height: 100%;
            min-height: 0;
        }

        /* TABLET Layout */
        @media (max-width: 1200px) {
            .main-layout {
                grid-template-columns: 1fr 1fr 1fr;
            }
        }

        /* MOBILE Layout */
        @media (max-width: 768px) {
            :host {
                padding: 0;
                height: auto;
                min-height: 100%;
                background: rgba(0, 0, 0, 0.9);
                overflow-y: auto;
                -webkit-overflow-scrolling: touch;
            }

            .main-layout {
                display: flex;
                flex-direction: column;
                gap: 16px;
                padding: 12px;
                height: auto;
            }
            
            .panel {
                padding: 16px;
                border-radius: 16px;
            }
            
            .panel-header {
                font-size: 14px;
                margin-bottom: 12px;
            }
            
            button {
                min-height: 48px;
                font-size: 14px;
                padding: 14px;
            }
            
            .file-btn {
                min-height: 48px;
                font-size: 14px;
                padding: 14px;
            }
            
            .viz-grid {
                grid-template-columns: repeat(2, 1fr);
                grid-template-rows: repeat(4, 1fr);
                gap: 10px;
            }
            
            .viz-grid button {
                min-height: 64px;
                font-size: 16px;
            }
            
            .gnosis-wrapper {
                font-size: 16px;
                min-height: 64px;
            }
            
            .gen-mini-btn {
                width: 44px;
                height: 44px;
            }
            
            .row-group {
                flex-direction: column;
                gap: 10px;
            }
            
            .row-group > * {
                flex: none;
            }
        }
        
        /* Panel Containers */
        .panel {
            background: rgba(0, 0, 0, 0.4);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.05);
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 12px;
            height: 100%;
            min-height: 0;
            overflow-y: auto;
            box-sizing: border-box;
        }

        .stack-col {
            display: flex;
            flex-direction: column;
            gap: 8px;
            height: 100%;
            min-height: 0;
            overflow: hidden;
        }

        .stack-col .panel {
            height: auto;
            overflow: hidden;
        }

        .panel-header {
            font-size: 11px;
            font-weight: 700;
            color: #666;
            margin-bottom: 4px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        /* Sub-sections within panels */
        .sub-section {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        
        .row-group {
            display: flex;
            gap: 8px;
        }
        
        .row-group > * {
            flex: 1;
        }

        /* Custom File Input Styling */
        .file-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            background: #18181b;
            border: 1px solid #333;
            color: #a1a1aa;
            padding: 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            text-align: center;
            width: 100%;
            box-sizing: border-box;
            transition: all 0.2s;
        }
        
        .file-btn:hover {
            border-color: #555;
            color: #fff;
            background: #27272a;
        }

        button {
            background: #18181b;
            border: 1px solid #333;
            color: #a1a1aa;
            padding: 10px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 10px;
            font-weight: 600;
            transition: all 0.2s;
            width: 100%;
        }
        
        button:hover {
            background: #27272a;
            border-color: #555;
            color: #fff;
        }
        
        button.active {
            background: #be123c;
            border-color: #f43f5e;
            color: white;
            box-shadow: 0 0 10px rgba(225, 29, 72, 0.4);
        }

        .status-text {
            font-size: 9px;
            color: #555;
            margin-top: 2px;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* Visual Mode Grid */
        .viz-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            grid-template-rows: 1fr 1fr;
            gap: 6px;
            flex-grow: 1;
        }
        
        .viz-grid button {
            height: 100%;
            font-size: clamp(14px, 2.2vh, 20px); /* Match Effector Buttons text-xl */
            font-weight: bold;
            letter-spacing: 0.1em;
        }

        .gnosis-wrapper {
            background: #18181b;
            border: 1px solid #333;
            color: #a1a1aa;
            border-radius: 6px;
            cursor: pointer;
            font-size: clamp(14px, 2.2vh, 20px); /* Match Effector Buttons text-xl */
            font-weight: bold;
            letter-spacing: 0.1em;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            position: relative;
            height: 100%;
            width: 100%;
            box-sizing: border-box;
        }

        .gnosis-wrapper:hover {
            background: #27272a;
            border-color: #555;
            color: #fff;
        }

        .gnosis-wrapper.active {
            background: #be123c;
            border-color: #f43f5e;
            color: white;
            box-shadow: 0 0 10px rgba(225, 29, 72, 0.4);
        }

        .gen-mini-btn {
            position: absolute;
            bottom: 4px;
            right: 4px;
            width: 52px;
            height: 52px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            
            /* Match deck-controller GEN button: bg-zinc-800 border-zinc-600 */
            background: #27272a; 
            border: 1px solid #52525b;
            
            /* Text style: text-[10px] font-bold text-zinc-400 */
            font-size: 10px;
            font-weight: bold;
            color: #a1a1aa;
            
            z-index: 10;
            transition: all 0.2s;
            box-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }

        .gen-mini-btn:hover {
            color: white;
            background: #3f3f46; /* zinc-700 */
            border-color: #71717a; /* zinc-500 */
        }

        .gen-mini-btn:active {
            transform: scale(0.95);
        }

        @media (max-height: 920px) {
            :host {
                padding: 6px;
            }
            .main-layout {
                gap: 8px;
            }
            .panel {
                padding: 10px;
                gap: 8px;
            }
            .panel-header {
                font-size: 10px;
            }
            button, .file-btn {
                padding: 8px;
                font-size: 9px;
            }
            .gen-mini-btn {
                width: 44px;
                height: 44px;
            }
        }

        @media (max-height: 820px) {
            :host {
                padding: 4px;
            }
            .main-layout {
                gap: 6px;
            }
            .panel {
                padding: 8px;
                gap: 6px;
            }
            .sub-section {
                gap: 4px;
            }
            .row-group {
                gap: 6px;
            }
            .panel-header {
                font-size: 9px;
                margin-bottom: 2px;
            }
            button, .file-btn {
                padding: 7px;
                font-size: 8.5px;
            }
            .status-text {
                font-size: 8px;
            }
            .gen-mini-btn {
                width: 40px;
                height: 40px;
                font-size: 9px;
            }
        }
    `;

    @state() webcamActive = false;
    @state() renderingEnabled = true;
    @state() currentMode: VisualMode = 'organic';
    @state() zenModeActive = false;

    render() {
        return html`
            <div class="main-layout">
                
                <!-- PANEL 1: INPUTS & SYSTEM -->
                <div class="panel">
                    <!-- Inputs -->
                    <div class="sub-section">
                        <div class="panel-header">INPUTS</div>
                        <div class="row-group">
                            <!-- Deck A -->
                            <div>
                                <label class="file-btn">
                                    DECK A
                                    <input type="file" hidden accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'A')}" />
                                </label>
                                <div class="status-text" id="status-a">DEFAULT</div>
                            </div>

                            <!-- Deck B -->
                            <div>
                                <label class="file-btn">
                                    DECK B
                                    <input type="file" hidden accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'B')}" />
                                </label>
                                <div class="status-text" id="status-b">DEFAULT</div>
                            </div>

                            <!-- Camera -->
                            <div>
                                <button class="${this.webcamActive ? 'active' : ''}" @click="${this.toggleWebcam}">
                                    CAM
                                </button>
                                <div class="status-text">${this.webcamActive ? 'ON' : 'OFF'}</div>
                            </div>
                        </div>
                    </div>

                    <!-- System -->
                     <div class="sub-section" style="margin-top: auto;">
                        <div class="panel-header">SYSTEM</div>
                        <div class="row-group">
                             <!-- Projector -->
                            <button class="${this._projectorWin && !this._projectorWin.closed ? 'active' : ''}" 
                                    @click="${this.toggleProjector}">
                                ${this._projectorWin && !this._projectorWin.closed ? 'CLOSE PROJ' : 'PROJECTOR'}
                            </button>
                            
                            <!-- Master Engine -->
                            <button class="${this.renderingEnabled ? 'active' : ''}" @click="${this.toggleRendering}">
                                ${this.renderingEnabled ? 'ENGINE: ON' : 'ENGINE: OFF'}
                            </button>
                        </div>
                    </div>
                </div>

                <!-- PANEL 2: BLUR FX -->
                <!-- PANEL 2: BLUR FX & ZEN MODE -->
                <div class="stack-col">
                    
                    <!-- BLUR FX -->
                    <div class="panel" style="flex: 1;">
                        <div class="panel-header">BLUR FX</div>
                        
                        <button class="${this.blurActive ? 'active' : ''}" @click="${this.toggleBlur}" style="margin-bottom: 8px;">
                            ${this.blurActive ? 'ENABLED' : 'DISABLED'}
                        </button>

                        <!-- Feedback -->
                        <div class="sub-section">
                            <div class="panel-header" style="font-size: 9px; margin: 0;">FEEDBACK</div>
                            <div class="row-group">
                                <button class="${this.blurFeedback < 0.3 ? 'active' : ''}" 
                                        @click="${() => this.setBlurFeedback(0.1)}">SHORT</button>
                                <button class="${this.blurFeedback >= 0.3 && this.blurFeedback < 0.7 ? 'active' : ''}" 
                                        @click="${() => this.setBlurFeedback(0.5)}">MID</button>
                                <button class="${this.blurFeedback >= 0.7 ? 'active' : ''}" 
                                        @click="${() => this.setBlurFeedback(0.9)}">LONG</button>
                            </div>
                        </div>
                    </div>

                    <!-- ZEN MODE -->
                    <div class="panel">
                        <div class="panel-header">ZEN MODE</div>
                        <button class="${this.zenModeActive ? 'active' : ''}" @click="${this.toggleZenMode}">
                            ${this.zenModeActive ? 'ON' : 'OFF'}
                        </button>
                    </div>

                </div>

                <!-- PANEL 3: VISUAL MIX MODE -->
                <div class="panel">
                    <div class="panel-header">VISUAL PATTERN</div>
                    
                    <div class="viz-grid">
                        <button class="${this.currentMode === 'organic' ? 'active' : ''}" @click="${() => this.setMode('organic')}">ORGANIC</button>
                        <button class="${this.currentMode === 'wireframe' ? 'active' : ''}" @click="${() => this.setMode('wireframe')}">MATH</button>
                        <button class="${this.currentMode === 'monochrome' ? 'active' : ''}" @click="${() => this.setMode('monochrome')}">PARTICLES</button>
                        <button class="${this.currentMode === 'rings' ? 'active' : ''}" @click="${() => this.setMode('rings')}">RINGS</button>
                        
                        <button class="${this.currentMode === 'waves' ? 'active' : ''}" @click="${() => this.setMode('waves')}">WAVES</button>
                        <button class="${this.currentMode === 'suibokuga' ? 'active' : ''}" @click="${() => this.setMode('suibokuga')}">HALID</button>
                        <button class="${this.currentMode === 'grid' ? 'active' : ''}" @click="${() => this.setMode('grid')}">GLAZE</button>
                        
                        <div class="gnosis-wrapper ${this.currentMode === 'ai_grid' ? 'active' : ''}" @click="${() => this.setMode('ai_grid')}">
                            GNOSIS
                            <div class="gen-mini-btn" @click="${(e: Event) => { e.stopPropagation(); this.handleAiGridGen(); }}">GEN</div>
                        </div>
                    </div>
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

    private toggleWebcam() {
        this.webcamActive = !this.webcamActive;
        // Dispatch Event
        this.dispatchEvent(new CustomEvent('visual-webcam-toggle', {
            detail: { active: this.webcamActive },
            bubbles: true,
            composed: true
        }));
    }

    private toggleRendering() {
        this.renderingEnabled = !this.renderingEnabled;
        this.setMainRendering(this.renderingEnabled);
    }

    private handleAiGridGen() {
        this.dispatchEvent(new CustomEvent('ai-grid-gen-trigger', {
            bubbles: true,
            composed: true
        }));
    }

    private setMode(mode: VisualMode) {
        this.currentMode = mode;
        this.dispatchEvent(new CustomEvent('visual-mode-change', {
            detail: { mode },
            bubbles: true,
            composed: true
        }));
    }

    @state() blurActive = false;
    @state() blurFeedback = 0.5;
    @state() blurTint = '#000000';

    private toggleBlur() {
        this.blurActive = !this.blurActive;
        this.dispatchBlurUpdate();
    }

    private setBlurFeedback(val: number) {
        this.blurFeedback = val;
        this.dispatchBlurUpdate();
    }

    private dispatchBlurUpdate() {
        this.dispatchEvent(new CustomEvent('visual-blur-change', {
            detail: {
                active: this.blurActive,
                feedback: this.blurFeedback,
                tint: this.blurTint
            },
            bubbles: true,
            composed: true
        }));
    }

    private _projectorWin: Window | null = null;

    private toggleProjector() {
        if (this._projectorWin && !this._projectorWin.closed) {
            this._projectorWin.close();
            this._projectorWin = null;
            this.setMainRendering(this.renderingEnabled);
        } else {
            // Open Projector
            const width = 800;
            const height = 600;
            const left = (window.screen.width - width) / 2;
            const top = (window.screen.height - height) / 2;
            
            this._projectorWin = window.open(
                '/?mode=viz', 
                'biogram-projector', 
                `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
            );
            
            // Disable Main Rendering to save GPU
            this.setMainRendering(false);
            
            // Check for close
            const timer = setInterval(() => {
                if (!this._projectorWin || this._projectorWin.closed) {
                    clearInterval(timer);
                    this._projectorWin = null;
                    this.setMainRendering(this.renderingEnabled);
                    this.requestUpdate();
                }
            }, 1000);
        }
        this.requestUpdate();
    }

    private toggleZenMode() {
        if (import.meta.env.DEV) console.log('[VisualControls] toggleZenMode called, current state:', this.zenModeActive);
        this.zenModeActive = !this.zenModeActive;
        if (import.meta.env.DEV) console.log('[VisualControls] Dispatching zen-mode-toggle to WINDOW, new state:', this.zenModeActive);
        // Dispatch to window to ensure event reaches main.ts listener
        window.dispatchEvent(new CustomEvent('zen-mode-toggle', {
            detail: { active: this.zenModeActive }
        }));
    }

    private setMainRendering(active: boolean) {
         this.dispatchEvent(new CustomEvent('visual-render-toggle', {
            detail: { active },
            bubbles: true,
            composed: true
        }));
    }
}
