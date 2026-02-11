import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import type { VisualMode } from './modes';

type TransitionPreset =
    | 'auto_matrix'
    | 'crossfade'
    | 'sweep_line_smear'
    | 'soft_overlay';
type FxMode = 'OFF' | 'AUTO' | 'MANUAL';
type TransitionMode = 'AUTO' | 'MANUAL';

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
                font-size: 13px;
            }
            
            .gnosis-wrapper {
                font-size: 13px;
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

            /* Hide non-essential panels on mobile */
            .system-panel {
                display: none;
            }
            .stack-col {
                display: none;
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

        .panel {
            scrollbar-width: thin;
            scrollbar-color: #333 transparent;
        }

        .panel::-webkit-scrollbar {
            width: 4px;
        }

        .panel::-webkit-scrollbar-track {
            background: transparent;
        }

        .panel::-webkit-scrollbar-thumb {
            background: #333;
            border-radius: 3px;
        }

        .panel::-webkit-scrollbar-thumb:hover {
            background: #555;
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
            overflow-y: auto;
        }

        .visual-pattern-panel,
        .transition-panel {
            overflow-y: auto !important;
        }

        .visual-pattern-panel {
            min-height: 170px;
        }

        .transition-panel {
            min-height: 170px;
        }

        .scene-fx-panel {
            flex: 0 0 auto !important;
        }

        .fx-combined-panel {
            flex: 1.2 !important;
            min-height: 260px;
        }

        .zen-panel {
            flex: 0 0 auto !important;
            min-height: 86px;
        }

        .system-panel {
            flex: 0 0 auto !important;
            min-height: 156px;
        }

        .panel-header {
            font-size: 11px;
            font-weight: 700;
            color: #666;
            margin-bottom: 4px;
            letter-spacing: 0.1em;
            text-transform: uppercase;
        }

        .visual-row {
            display: grid;
            grid-template-columns: 1.25fr 1fr;
            gap: 8px;
            height: 100%;
            min-height: 0;
            overflow: hidden;
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
            background: linear-gradient(180deg, rgba(34, 24, 30, 0.9) 0%, rgba(24, 18, 24, 0.95) 100%);
            border-color: rgba(251, 113, 133, 0.88);
            color: #fff1f2;
            box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.28), 0 8px 16px rgba(159, 18, 57, 0.28);
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

        .auto-texture-preview {
            border: 1px solid #2d2d30;
            border-radius: 8px;
            background: #0c0c0d;
            min-height: 130px;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
        }

        .auto-texture-preview img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .auto-texture-placeholder {
            font-size: 9px;
            color: #4b5563;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .auto-texture-meta {
            font-size: 9px;
            color: #6b7280;
            line-height: 1.4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .auto-texture-input {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #333;
            border-radius: 6px;
            background: #0f1012;
            color: #e4e4e7;
            padding: 8px 10px;
            font-size: 10px;
            font-family: inherit;
            outline: none;
        }

        .auto-texture-input:focus {
            border-color: #be123c;
            box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.35);
        }

        .auto-texture-input::placeholder {
            color: #6b7280;
        }

        .mini-select {
            width: 100%;
            box-sizing: border-box;
            border: 1px solid #333;
            border-radius: 6px;
            background: #0f1012;
            color: #e4e4e7;
            padding: 8px 10px;
            font-size: 10px;
            font-family: inherit;
            outline: none;
        }

        .mini-select:focus {
            border-color: #be123c;
            box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.35);
        }

        .panel-note {
            font-size: 9px;
            color: #6b7280;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .section-card {
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 10px;
            padding: 10px;
            background: rgba(10, 10, 14, 0.5);
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .section-title {
            font-size: 11px;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #9ca3af;
            font-weight: 700;
        }

        .kv {
            font-size: 11px;
            color: #cbd5e1;
            letter-spacing: 0.04em;
            text-transform: uppercase;
        }

        .segmented {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 6px;
        }

        .segmented.three {
            grid-template-columns: repeat(3, 1fr);
        }

        .primary-btn {
            min-height: 44px;
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            background: linear-gradient(180deg, rgba(32, 35, 40, 0.94) 0%, rgba(20, 23, 28, 0.98) 100%);
            border-color: rgba(203, 213, 225, 0.46);
            color: #e5e7eb;
            box-shadow: 0 0 0 1px rgba(148, 163, 184, 0.2), 0 8px 16px rgba(10, 14, 20, 0.3);
        }

        .primary-btn:hover {
            filter: brightness(1.08);
            border-color: rgba(226, 232, 240, 0.75);
        }

        .zen-mode-btn {
            width: 74px;
            min-width: 74px;
            height: 74px;
            min-height: 74px;
            padding: 0;
            border-radius: 50%;
            align-self: center;
            font-size: 12px;
            font-weight: 800;
            letter-spacing: 0.1em;
            text-transform: uppercase;
            background: linear-gradient(180deg, rgba(251, 251, 251, 1) 0%, rgba(232, 232, 232, 1) 100%);
            border-color: rgba(255, 255, 255, 0.9);
            color: #0b0b0d;
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.55), 0 10px 18px rgba(0, 0, 0, 0.35);
        }

        .zen-mode-btn:hover {
            border-color: rgba(255, 255, 255, 1);
            color: #fff;
            filter: brightness(1.03);
            box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.75), 0 12px 20px rgba(0, 0, 0, 0.38);
        }

        .zen-mode-btn.active {
            border-color: rgba(244, 63, 94, 0.95);
            box-shadow: 0 0 0 1px rgba(244, 63, 94, 0.3), 0 12px 22px rgba(159, 18, 57, 0.32);
        }

        .range-wrap {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .range-wrap input[type="range"] {
            width: 100%;
            accent-color: #e5e7eb;
        }

        .range-value {
            width: 52px;
            text-align: right;
            font-size: 11px;
            color: #e5e7eb;
            font-weight: 700;
        }

        /* Visual Mode Grid */
        .viz-grid {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            grid-template-rows: repeat(2, minmax(62px, 1fr));
            gap: 6px;
            flex-grow: 1;
            min-height: 136px;
        }
        
        .viz-grid button {
            height: 100%;
            min-height: 62px;
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px;
            border-radius: 10px;
            border: 1px solid rgba(82, 82, 91, 0.85);
            background: linear-gradient(180deg, rgba(31, 31, 38, 0.92) 0%, rgba(17, 17, 21, 0.95) 100%);
            color: #a1a1aa;
            font-size: clamp(10px, 0.78vw, 14px);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 16px rgba(0, 0, 0, 0.25);
        }

        .viz-grid button:hover {
            border-color: rgba(113, 113, 122, 0.95);
            color: #f4f4f5;
            background: linear-gradient(180deg, rgba(45, 45, 54, 0.95) 0%, rgba(23, 23, 29, 0.98) 100%);
            transform: translateY(-1px);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 12px 20px rgba(0, 0, 0, 0.34);
        }

        .viz-grid button.active {
            background: linear-gradient(180deg, rgba(34, 24, 30, 0.9) 0%, rgba(24, 18, 24, 0.95) 100%);
            border-color: rgba(251, 113, 133, 0.88);
            color: #fff1f2;
            box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.28), 0 8px 16px rgba(159, 18, 57, 0.28);
        }

        .gnosis-wrapper {
            background: linear-gradient(180deg, rgba(31, 31, 38, 0.92) 0%, rgba(17, 17, 21, 0.95) 100%);
            border: 1px solid rgba(82, 82, 91, 0.85);
            color: #a1a1aa;
            border-radius: 10px;
            cursor: pointer;
            font-size: clamp(10px, 0.78vw, 14px);
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
            position: relative;
            height: 100%;
            width: 100%;
            box-sizing: border-box;
            text-shadow: 0 1px 0 rgba(0, 0, 0, 0.45);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 16px rgba(0, 0, 0, 0.25);
        }

        .gnosis-wrapper:hover {
            border-color: rgba(113, 113, 122, 0.95);
            color: #f4f4f5;
            background: linear-gradient(180deg, rgba(45, 45, 54, 0.95) 0%, rgba(23, 23, 29, 0.98) 100%);
            transform: translateY(-1px);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 12px 20px rgba(0, 0, 0, 0.34);
        }

        .gnosis-wrapper.active {
            background: linear-gradient(180deg, rgba(34, 24, 30, 0.9) 0%, rgba(24, 18, 24, 0.95) 100%);
            border-color: rgba(251, 113, 133, 0.88);
            color: #fff1f2;
            box-shadow: 0 0 0 1px rgba(251, 113, 133, 0.28), 0 8px 16px rgba(159, 18, 57, 0.28);
        }

        .gen-mini-btn {
            position: absolute;
            bottom: 6px;
            right: 6px;
            width: 34px;
            height: 22px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;

            background: linear-gradient(180deg, rgba(42, 42, 49, 0.95) 0%, rgba(21, 21, 25, 0.98) 100%);
            border: 1px solid rgba(113, 113, 122, 0.8);
            font-size: 8px;
            letter-spacing: 0.06em;
            font-weight: 700;
            color: #a1a1aa;
            
            z-index: 10;
            transition: all 0.2s;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 10px rgba(0, 0, 0, 0.32);
        }

        .mode-mini-btn {
            position: absolute;
            bottom: 6px;
            right: 6px;
            width: 34px;
            height: 22px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(180deg, rgba(42, 42, 49, 0.95) 0%, rgba(21, 21, 25, 0.98) 100%);
            border: 1px solid rgba(113, 113, 122, 0.8);
            color: #a1a1aa;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            z-index: 10;
            cursor: pointer;
            transition: all 0.2s;
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 6px 10px rgba(0, 0, 0, 0.32);
        }

        .mode-mini-btn:hover {
            color: #fff;
            border-color: #a1a1aa;
            background: linear-gradient(180deg, rgba(61, 61, 71, 0.98) 0%, rgba(33, 33, 40, 1) 100%);
        }

        .organic-modal-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.55);
            z-index: 2100;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            box-sizing: border-box;
        }

        .organic-modal {
            width: min(760px, 100%);
            max-height: 86vh;
            overflow-y: auto;
            background: rgba(6, 8, 12, 0.96);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 14px;
            padding: 14px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 12px;
        }

        .modal-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }

        .modal-title {
            font-size: 12px;
            color: #e2e8f0;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            font-weight: 700;
        }

        .modal-close {
            width: 36px;
            min-width: 36px;
            height: 36px;
            min-height: 36px;
            padding: 0;
            border-radius: 999px;
        }

        .gen-mini-btn:hover {
            color: #fff;
            border-color: #a1a1aa;
            background: linear-gradient(180deg, rgba(61, 61, 71, 0.98) 0%, rgba(33, 33, 40, 1) 100%);
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
                width: 32px;
                height: 20px;
            }
            .mode-mini-btn {
                width: 32px;
                height: 20px;
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
                width: 30px;
                height: 18px;
                font-size: 7px;
            }
            .mode-mini-btn {
                width: 30px;
                height: 18px;
                font-size: 7px;
            }
        }

        @media (max-width: 1400px) {
            .visual-row {
                grid-template-columns: 1fr;
            }
        }
    `;

    @state() webcamActive = false;
    @state() renderingEnabled = true;
    @state() currentMode: VisualMode = 'organic';
    @state() zenModeActive = false;
    @state() autoTextureGenerating = false;
    @state() autoTexturePreviewUrl: string | null = null;
    @state() autoTexturePrompt = '';
    @state() autoTextureStatus = 'READY';
    @state() autoTextureError = '';
    @state() autoTextureModel = '';
    @state() autoTextureKeyword = '';
    @state() organicPanelOpen = false;
    @state() transitionMode: TransitionMode = 'AUTO';
    @state() transitionPreset: TransitionPreset = 'auto_matrix';
    @state() nextObjectMode: VisualMode = 'rings';
    @state() fadeDurationSec = 1.0;
    @state() fxMode: FxMode = 'OFF';
    @state() fxIntensity = 0.55;

    render() {
        return html`
            <div class="main-layout">
                
                <!-- PANEL 1: SYSTEM -->
                <div class="panel system-panel">
                    <div class="sub-section">
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
                    <div class="sub-section">
                        <div class="panel-header">ZEN MODE</div>
                        <button class="zen-mode-btn ${this.zenModeActive ? 'active' : ''}" @click="${this.toggleZenMode}">ZEN</button>
                    </div>
                </div>

                <!-- PANEL 2: FX + ZEN -->
                <div class="stack-col">

                    <div class="panel fx-combined-panel">
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

                        <div class="sub-section">
                            <div class="panel-header">SCENE FX</div>
                            <div class="segmented three">
                                <button class="${this.fxMode === 'OFF' ? 'active' : ''}" @click="${() => this.setFxMode('OFF')}">OFF</button>
                                <button class="${this.fxMode === 'AUTO' ? 'active' : ''}" @click="${() => this.setFxMode('AUTO')}">AUTO</button>
                                <button class="${this.fxMode === 'MANUAL' ? 'active' : ''}" @click="${() => this.setFxMode('MANUAL')}">MANUAL</button>
                            </div>
                            <div class="row-group">
                                <button class="${this.fxIntensity < 0.35 ? 'active' : ''}" @click="${() => this.setFxIntensity(0.25)}">LOW</button>
                                <button class="${this.fxIntensity >= 0.35 && this.fxIntensity < 0.75 ? 'active' : ''}" @click="${() => this.setFxIntensity(0.55)}">MID</button>
                                <button class="${this.fxIntensity >= 0.75 ? 'active' : ''}" @click="${() => this.setFxIntensity(0.85)}">HIGH</button>
                            </div>
                            <button ?disabled=${this.fxMode === 'OFF'} @click=${this.triggerSceneFx}>TRIGGER FX</button>
                        </div>
                    </div>

                </div>

                <!-- PANEL 3: VISUAL / TRANSITION -->
                <div class="visual-row">
                    <div class="panel visual-pattern-panel">
                        <div class="panel-header">VISUAL PATTERN</div>
                        <div class="viz-grid">
                            <button class="${this.currentMode === 'organic' ? 'active' : ''}" @click="${() => this.setMode('organic')}">
                                ORGANIC
                                <span class="mode-mini-btn" @click="${(e: Event) => { e.stopPropagation(); this.toggleOrganicPanel(); }}">SET</span>
                            </button>
                            <button class="${this.currentMode === 'wireframe' ? 'active' : ''}" @click="${() => this.setMode('wireframe')}">MATH</button>
                            <button class="${this.currentMode === 'monochrome' ? 'active' : ''}" @click="${() => this.setMode('monochrome')}">PARTICLES</button>
                            <button class="${this.currentMode === 'rings' ? 'active' : ''}" @click="${() => this.setMode('rings')}">RINGS</button>
                            
                            <button class="${this.currentMode === 'waves' ? 'active' : ''}" @click="${() => this.setMode('waves')}">WAVES</button>
                            <button class="${this.currentMode === 'halid' || this.currentMode === 'suibokuga' ? 'active' : ''}" @click="${() => this.setMode('halid')}">HALID</button>
                            <button class="${this.currentMode === 'glaze' || this.currentMode === 'grid' ? 'active' : ''}" @click="${() => this.setMode('glaze')}">GLAZE</button>
                            
                            <div class="gnosis-wrapper ${this.currentMode === 'gnosis' || this.currentMode === 'ai_grid' ? 'active' : ''}" @click="${() => this.setMode('gnosis')}">
                                GNOSIS
                                <div class="gen-mini-btn" @click="${(e: Event) => { e.stopPropagation(); this.handleAiGridGen(); }}">GEN</div>
                            </div>
                        </div>
                    </div>

                    <div class="panel transition-panel">
                        <div class="panel-header">TRANSITIONS</div>
                        <div class="sub-section">
                            <div class="section-card">
                                <div class="section-title">Object</div>
                                <div class="kv">Current: ${this.getModeLabel(this.currentMode)}</div>
                                <select class="mini-select" .value="${this.nextObjectMode}" @change="${this.handleNextObjectModeChange}">
                                    <option value="organic">ORGANIC</option>
                                    <option value="wireframe">MATH</option>
                                    <option value="monochrome">PARTICLES</option>
                                    <option value="rings">RINGS</option>
                                    <option value="waves">WAVES</option>
                                    <option value="halid">HALID</option>
                                    <option value="glaze">GLAZE</option>
                                    <option value="gnosis">GNOSIS</option>
                                </select>
                            </div>
                            <div class="section-card">
                                <div class="section-title">Transition</div>
                                <div class="segmented">
                                    <button class="${this.transitionMode === 'AUTO' ? 'active' : ''}" @click="${() => this.setTransitionMode('AUTO')}">AUTO MATRIX</button>
                                    <button class="${this.transitionMode === 'MANUAL' ? 'active' : ''}" @click="${() => this.setTransitionMode('MANUAL')}">MANUAL</button>
                                </div>
                                <select class="mini-select" .value="${this.transitionPreset}" ?disabled=${this.transitionMode === 'AUTO'} @change="${this.handleTransitionPresetChange}">
                                    <option value="crossfade">FADE CROSS</option>
                                    <option value="sweep_line_smear">SMEAR</option>
                                    <option value="soft_overlay">SOFT OVERLAY</option>
                                </select>
                                <div class="range-wrap">
                                    <input type="range" min="0.3" max="3.0" step="0.1" .value="${String(this.fadeDurationSec)}" @input="${this.handleFadeDurationInput}" />
                                    <div class="range-value">${this.fadeDurationSec.toFixed(1)}s</div>
                                </div>
                                <button class="primary-btn" @click="${this.applyNextObjectTransition}">
                                    APPLY TO NEXT OBJECT
                                </button>
                            </div>
                            <div class="panel-note">
                                ${this.transitionMode === 'AUTO'
                                    ? 'Auto matrix selects transition from mode pairing.'
                                    : 'Manual preset applies once on next object switch.'}
                            </div>
                        </div>
                    </div>

                </div>

            </div>
            ${this.organicPanelOpen ? html`
                <div class="organic-modal-backdrop" @click="${this.closeOrganicPanel}">
                    <div class="organic-modal" @click="${(e: Event) => e.stopPropagation()}">
                        <div class="modal-head">
                            <div class="modal-title">Organic Input Set</div>
                            <button class="modal-close" @click="${this.closeOrganicPanel}">×</button>
                        </div>

                        <div class="sub-section">
                            <div class="panel-header">INPUTS</div>
                            <div class="row-group">
                                <div>
                                    <label class="file-btn">
                                        DECK A
                                        <input type="file" hidden accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'A')}" />
                                    </label>
                                    <div class="status-text" id="status-a">DEFAULT</div>
                                </div>
                                <div>
                                    <label class="file-btn">
                                        DECK B
                                        <input type="file" hidden accept="image/*,video/*" @change="${(e: any) => this.handleFile(e, 'B')}" />
                                    </label>
                                    <div class="status-text" id="status-b">DEFAULT</div>
                                </div>
                                <div>
                                    <button class="${this.webcamActive ? 'active' : ''}" @click="${this.toggleWebcam}">
                                        CAM
                                    </button>
                                    <div class="status-text">${this.webcamActive ? 'ON' : 'OFF'}</div>
                                </div>
                            </div>
                        </div>

                        <div class="sub-section">
                            <div class="panel-header">AUTO TEXTURE</div>
                            <input
                                class="auto-texture-input"
                                type="text"
                                placeholder="TEXTURE WORDS (e.g. rusty metal, wet concrete)"
                                .value=${this.autoTextureKeyword}
                                ?disabled=${this.autoTextureGenerating}
                                @input=${this.handleAutoTextureInput}
                                @keydown=${this.handleAutoTextureKeydown}
                            />
                            <button
                                class="${this.autoTextureGenerating ? 'active' : ''}"
                                ?disabled=${this.autoTextureGenerating}
                                @click="${this.handleAutoTextureGenerate}"
                            >
                                ${this.autoTextureGenerating ? 'AUTO TEXTURE RUNNING...' : 'AUTO TEXTURE'}
                            </button>
                            <div class="auto-texture-preview">
                                ${this.autoTexturePreviewUrl
                                    ? html`<img src="${this.autoTexturePreviewUrl}" alt="Auto texture preview" />`
                                    : html`<div class="auto-texture-placeholder">NO PREVIEW</div>`}
                            </div>
                            <div class="row-group">
                                <button
                                    ?disabled=${!this.autoTexturePreviewUrl || this.autoTextureGenerating}
                                    @click="${() => this.applyAutoTexture('A')}"
                                >
                                    APPLY A
                                </button>
                                <button
                                    ?disabled=${!this.autoTexturePreviewUrl || this.autoTextureGenerating}
                                    @click="${() => this.applyAutoTexture('B')}"
                                >
                                    APPLY B
                                </button>
                            </div>
                            <div class="status-text">${this.autoTextureError || this.autoTextureStatus}</div>
                            ${this.autoTextureModel
                                ? html`<div class="auto-texture-meta">MODEL: ${this.autoTextureModel}</div>`
                                : null}
                            ${this.autoTexturePrompt
                                ? html`<div class="auto-texture-meta" title="${this.autoTexturePrompt}">PROMPT: ${this.autoTexturePrompt}</div>`
                                : null}
                        </div>
                    </div>
                </div>
            ` : null}
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

    private toggleOrganicPanel() {
        this.organicPanelOpen = !this.organicPanelOpen;
    }

    private closeOrganicPanel() {
        this.organicPanelOpen = false;
    }

    private getModeLabel(mode: VisualMode): string {
        if (mode === 'wireframe') return 'MATH';
        if (mode === 'monochrome') return 'PARTICLES';
        if (mode === 'suibokuga') return 'HALID';
        if (mode === 'grid') return 'GLAZE';
        if (mode === 'ai_grid') return 'GNOSIS';
        return String(mode).toUpperCase();
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

    private handleAutoTextureGenerate() {
        this.autoTextureGenerating = true;
        this.autoTextureError = '';
        this.autoTextureStatus = 'GENERATING...';
        const keyword = this.autoTextureKeyword.trim();
        this.dispatchEvent(new CustomEvent('auto-texture-generate', {
            detail: { keyword },
            bubbles: true,
            composed: true
        }));
    }

    private handleAutoTextureInput(e: Event) {
        const input = e.target as HTMLInputElement;
        this.autoTextureKeyword = input.value;
    }

    private handleAutoTextureKeydown(e: KeyboardEvent) {
        if (e.key !== 'Enter' || this.autoTextureGenerating) return;
        e.preventDefault();
        this.handleAutoTextureGenerate();
    }

    private applyAutoTexture(deck: 'A' | 'B') {
        if (!this.autoTexturePreviewUrl) return;
        this.dispatchEvent(new CustomEvent('visual-texture-change', {
            detail: { deck, url: this.autoTexturePreviewUrl, type: 'image' },
            bubbles: true,
            composed: true
        }));
        const statusEl = this.shadowRoot?.getElementById(`status-${deck.toLowerCase()}`);
        if (statusEl) statusEl.innerText = 'AUTO TEXTURE';
        this.autoTextureStatus = `APPLIED TO DECK ${deck}`;
    }

    public setAutoTextureState(patch: {
        generating?: boolean;
        previewUrl?: string | null;
        prompt?: string;
        status?: string;
        error?: string;
        model?: string;
    }) {
        if (typeof patch.generating === 'boolean') this.autoTextureGenerating = patch.generating;
        if (patch.previewUrl !== undefined) this.autoTexturePreviewUrl = patch.previewUrl;
        if (patch.prompt !== undefined) this.autoTexturePrompt = patch.prompt;
        if (patch.status !== undefined) this.autoTextureStatus = patch.status;
        if (patch.error !== undefined) this.autoTextureError = patch.error;
        if (patch.model !== undefined) this.autoTextureModel = patch.model;
    }

    private handleAiGridGen() {
        this.dispatchEvent(new CustomEvent('ai-grid-gen-trigger', {
            bubbles: true,
            composed: true
        }));
    }

    private handleTransitionPresetChange(e: Event) {
        const select = e.target as HTMLSelectElement;
        this.transitionPreset = select.value as TransitionPreset;
    }

    private handleNextObjectModeChange(e: Event) {
        const select = e.target as HTMLSelectElement;
        this.nextObjectMode = select.value as VisualMode;
    }

    private applyNextObjectTransition() {
        this.currentMode = this.nextObjectMode;
        this.dispatchEvent(new CustomEvent('visual-next-object', {
            detail: {
                mode: this.nextObjectMode,
                transitionPreset: this.transitionMode === 'AUTO' ? 'auto_matrix' : this.transitionPreset
            },
            bubbles: true,
            composed: true
        }));
    }

    private setTransitionMode(mode: TransitionMode) {
        this.transitionMode = mode;
    }

    private handleFadeDurationInput(e: Event) {
        const input = e.target as HTMLInputElement;
        const value = Math.max(0.3, Math.min(3.0, Number(input.value) || 1.0));
        this.fadeDurationSec = value;
        this.dispatchEvent(new CustomEvent('visual-transition-config', {
            detail: { fadeDurationSec: value },
            bubbles: true,
            composed: true
        }));
    }

    private setFxMode(mode: FxMode) {
        this.fxMode = mode;
        this.dispatchFxConfig();
    }

    private setFxIntensity(intensity: number) {
        this.fxIntensity = intensity;
        this.dispatchFxConfig();
    }

    private dispatchFxConfig() {
        this.dispatchEvent(new CustomEvent('visual-fx-config', {
            detail: { mode: this.fxMode, intensity: this.fxIntensity },
            bubbles: true,
            composed: true
        }));
    }

    private triggerSceneFx() {
        this.dispatchEvent(new CustomEvent('visual-fx-trigger', {
            detail: { intensity: this.fxIntensity },
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
