import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { VisualEngine } from './VisualEngine';
import type { VisualMode } from './modes';

@customElement('three-viz')
export class ThreeViz extends LitElement {
    static styles = css`
        :host {
            display: block;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #000;
        }
        #viz-container {
            width: 100%;
            height: 100%;
        }
    `;

    @property({ type: String }) mode: 'MASTER' | 'SLAVE' = 'MASTER';
    
    private engine: VisualEngine | null = null;
    private broadcast: BroadcastChannel = new BroadcastChannel('bio_viz_link');
    private loopId = 0;

    firstUpdated() {
        const container = this.shadowRoot?.getElementById('viz-container');
        if (container) {
            this.engine = new VisualEngine(container);
            this.runLoop();
        }
    }

    private runLoop = () => {
        this.loopId = requestAnimationFrame(this.runLoop);

        if (this.mode === 'MASTER') {
            // 1. Pull Data from AudioEngine
            const engine = window.engine;
            let specA, specB, cf;
            
            const isEngineAvailable = !!engine && typeof engine.getSpectrum === 'function';

            if (isEngineAvailable) {
                specA = engine.getSpectrum('A');
                specB = engine.getSpectrum('B');
                cf = engine.getDspParam('CROSSFADER') ?? 0.5;
            } else {
                // Default to silence/empty if engine missing
                specA = new Uint8Array(1024);
                specB = new Uint8Array(1024);
                cf = 0.5;
            }

            if (!this.engine) return;
            
            const lowA = this.getAvg(specA, 0, 5) / 255.0;
            const highA = this.getAvg(specA, 100, 200) / 255.0;
            const lowB = this.getAvg(specB, 0, 5) / 255.0;
            const highB = this.getAvg(specB, 100, 200) / 255.0;

            // Mix Spectrum for Visualization (Reduce bandwidth: 128 bins)
            const mixedSpectrum = new Uint8Array(128);
            for(let i=0; i<128; i++) {
                // Simple approx of indices from 0..1024 to 0..128
                const idx = Math.floor(i * 4); // 128 * 4 = 512 (covers lower half, mostly bass/mids)
                const valA = specA[idx] || 0;
                const valB = specB[idx] || 0;
                // Linear blend of spectrums
                mixedSpectrum[i] = valA * (1.0 - cf) + valB * cf;
            }

            // Precise Time from Audio Engine (if available)
            let currentTime = 0;
            if (engine && typeof engine.getReadPointer === 'function') {
                currentTime = engine.getReadPointer() / 44100.0;
            } else {
                 currentTime = performance.now() / 1000.0;
            }

            // Fetch Score State for Sync
            let debugState = null;
            if (this.engine) {
                debugState = this.engine.getInterpolatedState(currentTime);
            }

            const payload = {
                crossfader: cf,
                lowA, highA, lowB, highB,
                spectrum: mixedSpectrum,
                mode: this.engine?.mode || 'organic', // Sync Mode constantly
                time: currentTime,      // <--- SYNC TIME
                debugState,             // <--- SYNC SCORE STATE
                ...this.fxParams // Inject FX State
            };

            // 2. Update Local Engine
            this.engine.updateUniforms(payload);

            // 3. Broadcast to Projector
            this.broadcast.postMessage(payload);

        } else {
            // SLAVE Mode: Do nothing here, waiting for message event
        }
    };

    public sendMessage(id: string, val: any) {
        // Store FX params locally to send in the loop
        this.fxParams[id] = val;
        
        // Also direct update for immediate response if needed (optional)
        // this.engine?.updateUniforms({ [id]: val });
    }

    private fxParams: any = {};

    private cachedTextures = {
        A: { url: null as string | null, type: 'image' as 'image' | 'video' },
        B: { url: null as string | null, type: 'image' as 'image' | 'video' }
    };

    connectedCallback() {
        super.connectedCallback();
        if (import.meta.env.DEV) console.log(`[ThreeViz] Connected. Mode: ${this.mode}`);
        this.broadcast.onmessage = (ev) => {
            const data = ev.data;
            if (!data) return;

            // MASTER Logic: Respond to Sync Requests
            if (this.mode === 'MASTER') {
                if (data.type === 'SYNC_REQ') {
                    if (import.meta.env.DEV) console.log('[ThreeViz] Received SYNC_REQ from Slave. Sending state...');
                    // Send current textures if they exist
                    if (this.cachedTextures.A.url) {
                        this.broadcast.postMessage({
                            type: 'TEXTURE',
                            deck: 'A',
                            url: this.cachedTextures.A.url,
                            mimeType: this.cachedTextures.A.type
                        });
                    }
                    if (this.cachedTextures.B.url) {
                        this.broadcast.postMessage({
                            type: 'TEXTURE',
                            deck: 'B',
                            url: this.cachedTextures.B.url,
                            mimeType: this.cachedTextures.B.type
                        });
                    }
                    // Also send current visual mode
                    if (this.engine) {
                        this.broadcast.postMessage({
                            type: 'MODE',
                            mode: this.engine.mode
                        });
                        this.broadcast.postMessage({
                            type: 'TRANSITION_TYPE',
                            transitionType: this.engine.transitionType
                        });
                    }
                }
                return;
            }

            // SLAVE Logic
            if (this.mode === 'SLAVE' && this.engine) {
                
                // Continuous Sync
                if (data.mode && data.mode !== this.engine.mode) {
                    this.engine.setMode(data.mode);
                }
                
                // 1. Texture Update
                if (data.type === 'TEXTURE') {
                    this.engine.updateTexture(data.deck, data.url, data.mimeType);
                } 
                else if (data.type === 'TRANSITION_TYPE' && typeof data.transitionType === 'string') {
                    this.engine.setTransitionType(data.transitionType);
                }
                // 2. Webcam Update
                else if (data.type === 'WEBCAM') {
                    this.engine.toggleWebcam(data.active);
                }
                // 3. Param Update (Default)
                else if (data.type === 'COLOR_RND') {
                    this.engine.randomizeColor(data.deck);
                }
                else if (data.type === 'AI_GRID_PARAMS') {
                    this.engine.setAiGridParams(data.params);
                }
                else {
                     this.engine.updateUniforms(data);
                }
            }
        };

        // If SLAVE, Request Sync immediately
        if (this.mode === 'SLAVE') {
            if (import.meta.env.DEV) console.log('[ThreeViz] Slave sending SYNC_REQ...');
            this.broadcast.postMessage({ type: 'SYNC_REQ' });
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        cancelAnimationFrame(this.loopId);
        this.broadcast.close();
        if (this.engine) {
            this.engine.dispose();
        }
    }

    private getAvg(data: Uint8Array, start: number, end: number): number {
        let sum = 0;
        for(let i=start; i<end; i++) {
            sum += data[i] || 0;
        }
        return sum / Math.max(1, end - start);
    }

    public updateTexture(deck: 'A' | 'B', url: string, type: 'video' | 'image') {
        this.engine?.updateTexture(deck, url, type);
        
        // Cache for Sync
        this.cachedTextures[deck] = { url, type };

        // Broadcast to Slave
        if (this.mode === 'MASTER') {
            this.broadcast.postMessage({
                type: 'TEXTURE',
                deck,
                url,
                mimeType: type // Rename to avoid conflict with 'type'
            });
        }
    }

    public randomizeColor(deck: 'A' | 'B') {
        this.engine?.randomizeColor(deck);
        if (this.mode === 'MASTER') {
             this.broadcast.postMessage({
                type: 'COLOR_RND',
                deck
            });
        }
    }

    public toggleWebcam(active: boolean) {
        this.engine?.toggleWebcam(active);
        // Webcam stream cannot be broadcasted easily.
        // Slave must open its own webcam? 
        // Or we just send a "WEBCAM_ACTIVE" command and Slave opens its own camera.
        if (this.mode === 'MASTER') {
            this.broadcast.postMessage({
                type: 'WEBCAM',
                active
            });
        }
    }

    public setMode(mode: VisualMode) {
        this.engine?.setMode(mode);
        if (this.mode === 'MASTER') {
             this.broadcast.postMessage({
                type: 'MODE',
                mode
            });
        }
    }

    public setTransitionType(type: string) {
        this.engine?.setTransitionType(type);
        if (this.mode === 'MASTER') {
             this.broadcast.postMessage({
                type: 'TRANSITION_TYPE',
                transitionType: type
            });
        }
    }

    public setAiGridParams(params: any) {
        this.engine?.setAiGridParams(params);
        if (this.mode === 'MASTER') {
            this.broadcast.postMessage({
                type: 'AI_GRID_PARAMS',
                params
            });
        }
    }

    public setRendering(active: boolean) {
        this.engine?.setRendering(active);
    }

    public addVisualScore(deck: 'A' | 'B', chunk: any, timestamp: number) {
        this.engine?.addVisualScore(deck, chunk, timestamp);
    }

    public clearVisualScore(deck: 'A' | 'B') {
        this.engine?.clearVisualScore(deck);
    }

    public get visualMode(): string {
        return this.engine?.mode || 'organic';
    }

    render() {
        return html`<div id="viz-container"></div>`;
    }
}
