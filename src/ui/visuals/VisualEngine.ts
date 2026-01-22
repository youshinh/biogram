import * as THREE from 'three';
import { MetaballVertexShader, MetaballFragmentShader } from './shaders/MetaballShader';
import { TextureManager } from './TextureManager';
import { MonochromeFlow } from './MonochromeFlow';
import { RingDimensions } from './RingDimensions';
import { WaveTerrain } from './WaveTerrain';

export class VisualEngine {
    private container: HTMLElement;
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    
    private material!: THREE.ShaderMaterial;
    private mesh!: THREE.Mesh;
    private textureManager: TextureManager;
    private spectrumTexture!: THREE.DataTexture;
    
    // Modes
    private monochromeFlow!: MonochromeFlow;
    private ringDimensions!: RingDimensions;
    private waveTerrain!: WaveTerrain;

    private requestID: number = 0;
    private startTime: number = 0;

    // State
    private uniforms: { [uniform: string]: THREE.IUniform } = {};

    // --- Blending State Machine ---
    private activeModes: Set<any> = new Set();
    private currentModeName: string = 'organic'; // active target
    
    // We map string names to instances
    private modeMap: { [key: string]: any } = {};
    
    // Transition
    private transition = {
        active: false,
        fromMode: null as any,
        toMode: null as any,
        progress: 0.0,
        speed: 1.5 // Transition speed
    };

    constructor(container: HTMLElement) {
        this.container = container;
        this.textureManager = new TextureManager();
        this.init();
    }

    private init() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        // 1. Renderer (Optimized for transparency)
        this.renderer = new THREE.WebGLRenderer({ 
            alpha: true, 
            antialias: false, 
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true // Required for trails
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // Limit DPR
        this.renderer.autoClear = false; // Manual clear for trails
        this.container.appendChild(this.renderer.domElement);

        // 2. Scene
        this.scene = new THREE.Scene();

        // Lights for Physical Materials (Organdy)
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);

        const pointLight = new THREE.PointLight(0xffffff, 1.0);
        pointLight.position.set(10, 20, 20);
        this.scene.add(pointLight);
        
        const blueLight = new THREE.PointLight(0x00ffff, 0.8);
        blueLight.position.set(-20, -10, 10);
        this.scene.add(blueLight);

        // 3. Camera
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        this.camera.position.set(0, 0, 6); 

        // 4. Object (Bounded Box for Raymarching)
        const geometry = new THREE.BoxGeometry(6, 4, 4);
        
        // Placeholder Textures
        const placeholderTex = new THREE.DataTexture(new Uint8Array([100, 100, 100, 255]), 1, 1);
        placeholderTex.needsUpdate = true;

        this.uniforms = {
            uTime: { value: 0 },
            uCrossfade: { value: 0.5 },
            uTextureA: { value: placeholderTex },
            uTextureB: { value: placeholderTex },
            uColorA: { value: new THREE.Color(0xff0000) },
            uColorB: { value: new THREE.Color(0x0000ff) },
            uLowA: { value: 0 },
            uHighA: { value: 0 },
            uLowB: { value: 0 },
            uHighB: { value: 0 },
            uCameraPos: { value: this.camera.position },
            uMode: { value: 0.0 }, // 0: Organic, 1: Particles (Shader Mode)
            uSpectrum: { value: null }, 
            
            // FX Uniforms
            uDub: { value: 0.0 },
            uGate: { value: 0.0 },
            uCloud: { value: 0.0 },
            uCloudDensity: { value: 0.5 },
            uDecimator: { value: 0.0 }
        };

        // Initialize Spectrum Texture (128 bins)
        const size = 128;
        const data = new Uint8Array(size);
        this.spectrumTexture = new THREE.DataTexture(data, size, 1, THREE.RedFormat);
        this.spectrumTexture.needsUpdate = true;
        this.uniforms.uSpectrum.value = this.spectrumTexture;

        this.material = new THREE.ShaderMaterial({
            vertexShader: MetaballVertexShader,
            fragmentShader: MetaballFragmentShader,
            uniforms: this.uniforms,
            transparent: true,
            side: THREE.FrontSide
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);
        
        // DEBUG CUBE (To verify renderer works on Projector)
        // const debugGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        // const debugMat = new THREE.MeshBasicMaterial({ color: 0x00ff00, wireframe: true });
        // this.debugMesh = new THREE.Mesh(debugGeo, debugMat);
        // this.debugMesh.position.set(3, 3, 0); // Corner
        // this.scene.add(this.debugMesh);
        
        // Used for 'organic' and 'wireframe' modes (Shader-based)
        // We treat it as one visualizer instance
        const standardVisualizer = {
            mesh: this.mesh,
            update: (dt: number, data: any) => {}, // Logic is in shader
            setOpacity: (alpha: number) => { 
                // We don't have global opacity uniform in shader yet?
                // Let's just hack visible/hidden or let it stay 1.0 for now if active.
                // Or better, set uCloud to 1.0-alpha? No.
                // For now, standard visualizer just Pops in/out or we ignore opacity.
                // Actually, let's keep it simple: Standard modes just stay fully opaque if "active".
            } 
        };

        // Initialize Custom Visualizers
        try {
            this.monochromeFlow = new MonochromeFlow();
            this.monochromeFlow.mesh.visible = false; 
            this.scene.add(this.monochromeFlow.mesh);
        } catch (e) {
            console.error("Failed to init MonochromeFlow", e);
            this.monochromeFlow = { mesh: { visible: false }, update: () => {} } as any;
        }
        
        try {
            this.ringDimensions = new RingDimensions(this.spectrumTexture);
            this.ringDimensions.mesh.visible = false; 
            this.scene.add(this.ringDimensions.mesh);
        } catch (e) {
            console.error("Failed to init RingDimensions", e);
            this.ringDimensions = { mesh: { visible: false }, update: () => {}, setOpacity: () => {} } as any;
        }

        try {
            this.waveTerrain = new WaveTerrain(this.spectrumTexture);
            this.waveTerrain.mesh.visible = false;
            this.scene.add(this.waveTerrain.mesh);
        } catch (e) {
             console.error("Failed to init WaveTerrain", e);
             this.waveTerrain = { mesh: { visible: false }, update: () => {} } as any;
        }

        // Setup Mode Map
        this.modeMap = {
            'organic': standardVisualizer,
            'wireframe': standardVisualizer, // Share same mesh
            'monochrome': this.monochromeFlow,
            'rings': this.ringDimensions,
            'waves': this.waveTerrain
        };
        
        // Initial State: Force Organic
        // We manually ensure correct initial visibility
        this.mesh.visible = true; // Standard shader mesh
        this.uniforms.uMode.value = 0.0;
        this.currentModeName = 'organic';

        // Start Loop
        this.startTime = performance.now();
        this.animate();
        
        window.addEventListener('resize', this.onResize);
    }

    private setupListeners() {
        // ...
    }

    private onResize = () => {
        if (!this.container) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    };

    private lastTime: number = 0;

    private animate = () => {
        this.requestID = requestAnimationFrame(this.animate);
        
        const now = performance.now();
        const elapsed = (now - this.startTime) * 0.001;
        const delta = Math.min((now - this.lastTime) * 0.001, 0.1); 
        this.lastTime = now;
        
        this.uniforms.uTime.value = elapsed;

        this.uniforms.uTime.value = elapsed;

        // --- Camera Crossfader Rotation (DISABLED for Rings Depth Control) ---
        // const cf = this.uniforms.uCrossfade.value;
        // const angle = (cf - 0.5) * 2.8; 
        // const rad = 6.0;
        // this.camera.position.x = Math.sin(angle) * rad;
        // this.camera.position.z = Math.cos(angle) * rad;
        this.camera.position.set(0, 0, 6); // Fixed Camera
        this.camera.lookAt(0, 0, 0);
        this.uniforms.uCameraPos.value.copy(this.camera.position);

        // --- Transition Logic ---
        if (this.transition.active) {
            this.transition.progress += delta * this.transition.speed;
            const t = Math.min(this.transition.progress, 1.0);
            
            // Fade Out From
            if (this.transition.fromMode && this.transition.fromMode.setOpacity) {
                this.transition.fromMode.setOpacity(1.0 - t);
            }
            
            // Fade In To
            if (this.transition.toMode && this.transition.toMode.setOpacity) {
                this.transition.toMode.setOpacity(t);
            }
            
            if (t >= 1.0) {
                // Done
                this.transition.active = false;
                if (this.transition.fromMode) {
                    this.transition.fromMode.mesh.visible = false;
                }
                this.transition.fromMode = null;
                this.transition.toMode = null;
            }
        }

        // --- Update Active Visualizers ---
        const low = Math.max(this.uniforms.uLowA.value, this.uniforms.uLowB.value);
        const high = Math.max(this.uniforms.uHighA.value, this.uniforms.uHighB.value);
        const kick = low > 0.7;
        const spectrum = this.spectrumTexture.image.data;
        const audioData = { low, high, kick, spectrum };

        // Update all visible meshes in map (brute force or just smart check)
        // We iterate "activeModes"? No, let's just update all known visualizers if visible
        
        if (this.monochromeFlow.mesh.visible) this.monochromeFlow.update(delta, audioData);
        if (this.ringDimensions.mesh.visible) this.ringDimensions.update(delta, audioData);
        if (this.waveTerrain.mesh.visible) this.waveTerrain.update(delta, audioData);

        if (this.isRendering) {
            this.renderer.clear(); 
            this.renderer.render(this.scene, this.camera);
            
            // if (this.debugMesh) {
            //    this.debugMesh.rotation.x += 0.01;
            //    this.debugMesh.rotation.y += 0.01;
            // }
        }
    };

    // private debugMesh: THREE.Mesh | null = null;

    public setMode(mode: 'organic' | 'wireframe' | 'monochrome' | 'rings' | 'waves') {
        if (mode === this.currentModeName) return;

        console.log(`[VisualEngine] Switching: ${this.currentModeName} -> ${mode}`);

        // FIX: If transition is already active, force clean up previous state
        if (this.transition.active) {
            // Force hide the 'from' mode of the interrupted transition
            if (this.transition.fromMode) {
                this.transition.fromMode.mesh.visible = false;
                if (this.transition.fromMode.setOpacity) this.transition.fromMode.setOpacity(0.0);
            }
            // The 'to' mode of the interrupted transition becomes the 'from' mode?
            // Or just force everything off except current target?
            // Safer: Just force hide everything except the one we are switching TO (which handles fade in)
            // But we want to smooth blend from 'current visible'.
            // If interrupted, 'toMode' (partial opacity) is the new 'oldViz'.
            
            // Actually, simplest fix for "Everything Displayed" bug:
            // Ensure we update 'fromMode' to be the currently active visualizer.
        }

        let oldViz = this.modeMap[this.currentModeName];
        // If we were transitioning, the 'oldViz' based on name might be wrong if we hadn't finished swapping names?
        // No, we update currentModeName at end? No, we updated it at start in previous code?
        // In previous code: this.currentModeName = mode; (at end).
        // So oldViz is correct.
        
        // However, if transition active, 'oldViz' (currentModeName) is actually the one FADING IN. 
        // The one fading OUT (transition.fromMode) needs to be killed immediately.
        if (this.transition.active && this.transition.fromMode) {
             this.transition.fromMode.mesh.visible = false;
        }

        const newViz = this.modeMap[mode];
        
        // Handle Shader Modes separately?
        if ((mode === 'organic' || mode === 'wireframe') && (this.currentModeName === 'organic' || this.currentModeName === 'wireframe')) {
             this.uniforms.uMode.value = (mode === 'wireframe') ? 1.0 : 0.0;
             this.currentModeName = mode;
             newViz.mesh.visible = true;
             // Ensure transition is killed if we were doing one?
             this.transition.active = false;
             return;
        }
        
        // Standard Transition
        this.transition.fromMode = oldViz;
        this.transition.toMode = newViz;
        this.transition.active = true;
        this.transition.progress = 0.0;
        
        // Ensure new viz is visible for fade in
        if (newViz) {
            newViz.mesh.visible = true;
            if (newViz.setOpacity) newViz.setOpacity(0.0);
        }
        
        this.currentModeName = mode;
    }

    public updateUniforms(data: any) {
        if (data.crossfader !== undefined) this.uniforms.uCrossfade.value = data.crossfader;
        if (data.lowA !== undefined) this.uniforms.uLowA.value = data.lowA;
        if (data.highA !== undefined) this.uniforms.uHighA.value = data.highA;
        if (data.lowB !== undefined) this.uniforms.uLowB.value = data.lowB;
        if (data.highB !== undefined) this.uniforms.uHighB.value = data.highB;
        
        // Spectrum
        if (data.spectrum) {
            this.spectrumTexture.image.data.set(data.spectrum);
            this.spectrumTexture.needsUpdate = true;
        }

        // FX Mappings
        if (data.DUB !== undefined) this.uniforms.uDub.value = data.DUB;
        if (data.TAPE_ACTIVE !== undefined && data.TAPE_ACTIVE === 0) this.uniforms.uDub.value = 0;
        if (data.GATE_THRESH !== undefined) this.uniforms.uGate.value = data.GATE_THRESH * 5.0; 
        if (data.CLOUD_MIX !== undefined) this.uniforms.uCloud.value = data.CLOUD_MIX;
        if (data.CLOUD_ACTIVE !== undefined) {
             if (data.CLOUD_ACTIVE === 0) this.uniforms.uCloud.value = 0;
             else if (this.uniforms.uCloud.value === 0) this.uniforms.uCloud.value = 0.5;
        }
        if (data.CLOUD_DENSITY !== undefined) this.uniforms.uCloudDensity.value = data.CLOUD_DENSITY;
        if (data.DECIMATOR_ACTIVE !== undefined) this.uniforms.uDecimator.value = data.DECIMATOR_ACTIVE ? 1.0 : 0.0;
        if (data.BITS !== undefined) {
             const norm = 1.0 - (data.BITS / 16.0);
             if (this.uniforms.uDecimator.value > 0.5) {
                 this.uniforms.uDecimator.value = 0.5 + (norm * 0.5);
             }
        }
    }

    private isRendering: boolean = true;

    public setRendering(active: boolean) {
        this.isRendering = active;
    }

    public get mode(): string {
        return this.currentModeName;
    }

    public updateTexture(id: 'A' | 'B', url: string, mimeType: string) {
        this.textureManager.loadTexture(url).then(tex => {
            if (id === 'A') {
                this.uniforms.uTextureA.value = tex;
            } else {
                this.uniforms.uTextureB.value = tex;
            }
        });
    }

    public toggleWebcam(active: boolean) {
        if (active) {
            this.textureManager.createWebcamTexture().then(tex => {
                this.uniforms.uTextureA.value = tex; 
                this.uniforms.uTextureB.value = tex;
            });
        }
    }

    public randomizeColor(deck: 'A' | 'B') {
        const r = Math.random();
        const g = Math.random();
        const b = Math.random();
        const col = new THREE.Color(r, g, b);
        
        if (deck === 'A') {
            this.uniforms.uColorA.value = col;
        } else {
            this.uniforms.uColorB.value = col;
        }
    }

    public dispose() {
        cancelAnimationFrame(this.requestID);
        this.renderer.dispose();
        // Dispose textures/materials if needed
        this.textureManager.dispose();
        
        // Remove listeners
        window.removeEventListener('resize', this.onResize);
    }
}
