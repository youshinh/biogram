import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { VisualEngine } from './VisualEngine';

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
            const engine = (window as any).engine;
            if (!engine || !this.engine) return;

            const cf = engine.getDspParam('CROSSFADER') ?? 0.5;
            const specA = engine.getSpectrum('A');
            const specB = engine.getSpectrum('B');
            
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

            const payload = {
                crossfader: cf,
                lowA, highA, lowB, highB,
                spectrum: mixedSpectrum,
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

    connectedCallback() {
        super.connectedCallback();
        console.log(`[ThreeViz] Connected. Mode: ${this.mode}`);
        this.broadcast.onmessage = (ev) => {
            if (this.mode === 'SLAVE' && this.engine) {
                const data = ev.data;
                // 1. Texture Update
                if (data.type === 'TEXTURE') {
                    this.engine.updateTexture(data.deck, data.url, data.mimeType);
                } 
                // 2. Webcam Update
                else if (data.type === 'WEBCAM') {
                    this.engine.toggleWebcam(data.active);
                }
                // 3. Param Update (Default)
                else if (data.type === 'COLOR_RND') {
                    this.engine.randomizeColor(data.deck);
                }
                else if (data.type === 'MODE') {
                    this.engine.setMode(data.mode);
                }
                else {
                     this.engine.updateUniforms(data);
                }
            }
        };
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

    public setMode(mode: 'organic' | 'wireframe') {
        this.engine?.setMode(mode);
        if (this.mode === 'MASTER') {
             this.broadcast.postMessage({
                type: 'MODE',
                mode
            });
        }
    }

    render() {
        return html`<div id="viz-container"></div>`;
    }
}
