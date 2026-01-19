import * as THREE from 'three';
import { MetaballVertexShader, MetaballFragmentShader } from './shaders/MetaballShader';
import { TextureManager } from './TextureManager';

export class VisualEngine {
    private container: HTMLElement;
    private renderer!: THREE.WebGLRenderer;
    private scene!: THREE.Scene;
    private camera!: THREE.PerspectiveCamera;
    
    private material!: THREE.ShaderMaterial;
    private mesh!: THREE.Mesh;
    private textureManager: TextureManager;
    private spectrumTexture!: THREE.DataTexture;
    
    private requestID: number = 0;
    private startTime: number = 0;

    // State
    private uniforms: { [uniform: string]: THREE.IUniform } = {};

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

        // 3. Camera
        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
        this.camera.position.set(0, 0, 6); // Slightly further back for rotation room

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
            uMode: { value: 0.0 }, // 0: Organic, 1: Particles
            uSpectrum: { value: null }, // Data map
            
            // FX Uniforms
            uDub: { value: 0.0 },
            uGate: { value: 0.0 },
            uCloud: { value: 0.0 }, // Mix/Strength
            uCloudDensity: { value: 0.5 },
            uDecimator: { value: 0.0 } // 0 = off, 1 = max chaos
        };

        // Initialize Spectrum Texture (128 bins for visualization is enough detail)
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
            side: THREE.FrontSide // Camera is outside, so we render front face to start raymarch
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.scene.add(this.mesh);

        // Start Loop
        this.startTime = performance.now();
        this.animate();
        
        console.log("[VisualEngine] Initialized. Camera Z:", this.camera.position.z);
        
        // Resize Listener
        window.addEventListener('resize', this.onResize);
        
        // Init MIDI / Audio Listeners (To be wired in externally or here)
        this.setupListeners();
    }

    private setupListeners() {
        // Listeners handled by ThreeViz bridge
    }

    private onResize = () => {
        if (!this.container) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    };

    private animate = () => {
        this.requestID = requestAnimationFrame(this.animate);
        
        const now = performance.now();
        const elapsed = (now - this.startTime) * 0.001;
        
        this.uniforms.uTime.value = elapsed;

        // --- Camera Crossfader Rotation ---
        // Rotate camera around center based on Crossfader
        // CF 0.0 (Deck A) -> Angle -1.4 rad (~80 deg)
        // CF 1.0 (Deck B) -> Angle +1.4 rad
        // Radius = 6.0
        const cf = this.uniforms.uCrossfade.value;
        const angle = (cf - 0.5) * 2.8; 
        const rad = 6.0;
        
        this.camera.position.x = Math.sin(angle) * rad;
        this.camera.position.z = Math.cos(angle) * rad;
        this.camera.lookAt(0, 0, 0);

        this.uniforms.uCameraPos.value.copy(this.camera.position); // Sync uniform
        
        // --- Chaos / FX Simulation ---
        // Map High Frequency to "Chaos" (Displacement / Noise)
        // If we had a specific "Chaos Mode" boolean, we'd use that.
        // For now, let's make it reactive to high energy.
        // const chaos = Math.max(this.uniforms.uHighA.value, this.uniforms.uHighB.value);
        // this.uniforms.uChaos.value = chaos; // Need to add this uniform if we use it
        
        // --- Trails / Echo Effect ---
        // Instead of clearing, we draw a semi-transparent black quad to fade out the previous frame.
        // This fails if preserveDrawingBuffer or autoClear is wrong, but we set autoClear=false.
        
        // We need a way to draw a fullscreen quad. 
        // Quickest way in ThreeJS without full Composer is to use a 2nd Ortho Camera and a Plane.
        // But for simply keeping the buffer, we just DON'T clear. 
        // BUT we need to fade it. 
        // Actually, with `alpha: true`, the background of the DOM is visible.
        // If we don't clear, we paint OVER the previous frame. 
        // To FADE, we need to draw a black rect with alpha 0.1 on top? 
        // No, that just darkens. 
        // If we want "Trails", we want the old pixel to persist but get dimmer.
        // Since `alpha:true` and we want to see the HTML background, we actually CANNOT easily do "trails" 
        // involving the background unless we render the background IN WebGL.
        // Current Setup: Background is HTML (Transparent Canvas). 
        // If we want trails of the 3D object, we must NOT clear, but the background will accumulate? 
        // No, the background is empty (0,0,0,0).
        // If we don't clear, the 3D object smears. 
        // To fade the smear, we need to manually attenuate alpha of the buffer? Hard in basic WebGL.
        
        // Alternative: "Echo" using multiple draw calls (Ghosting)? Too heavy.
        
        // Compromise for "Living Biogram" on Transparent Background:
        // We accept that "Trails" might look messy over transparent background if not careful.
        // Let's stick to standard clear for clean cut, BUT...
        // The user asked for "Tape Echo".
        // Let's implement a "Motion Blur" uniform in the shader? No.
        
        // Let's try the simple "Feedback" approach if we were opaque, but since we are transparent:
        // We can just skip clearing? 
        // Let's stick to `renderer.clear()` to be safe for now, as transparency + trails is a can of worms.
        // Wait, I can enable trails by just changing opacity of the clear color?
        // renderer.setClearColor(0x000000, 0.1); renderer.clear(); -> No, that clears to a color.
        
        // Let's REVERT the 'manual clear' to standard `autoClear=true` behavior via clear() 
        // unless I implement a FullscreenQuad.
        // Given complexity and "allow implementation to proceed", I will just clear for now to ensure sharpness.
        // If I leave trails on transparent bg, it becomes an opaque smudge quickly.
        
        this.renderer.clear(); 
        this.renderer.render(this.scene, this.camera);
    };

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
        // Tape Echo -> uDub (Echo/Trails)
        if (data.DUB !== undefined) this.uniforms.uDub.value = data.DUB;
        if (data.TAPE_ACTIVE !== undefined && data.TAPE_ACTIVE === 0) this.uniforms.uDub.value = 0;

        // Spectral Gate -> uGate (Stutter/Flash)
        // Uses Threshold or Active state
        if (data.SPECTRAL_GATE_ACTIVE !== undefined) {
             // If active, use threshold for intensity, or just full on?
             // Let's rely on GATE_THRESH passing through
        }
        if (data.GATE_THRESH !== undefined) {
             // If GATE ACTIVE is forwarded as 1 or 0 we can gate this
             // Simpler: Just map Thresh directly to visual gate
             this.uniforms.uGate.value = data.GATE_THRESH * 5.0; // Boost sensitivity
        }

        // Cloud Grain -> uCloud (Noise Dissolve)
        if (data.CLOUD_MIX !== undefined) {
             this.uniforms.uCloud.value = data.CLOUD_MIX;
        }
        if (data.CLOUD_ACTIVE !== undefined) {
             // If inactive, force 0? 
             if (data.CLOUD_ACTIVE === 0) this.uniforms.uCloud.value = 0;
             else if (this.uniforms.uCloud.value === 0) this.uniforms.uCloud.value = 0.5; // Default if active but no mix sent
        }
        if (data.CLOUD_DENSITY !== undefined) this.uniforms.uCloudDensity.value = data.CLOUD_DENSITY;


        // Decimator -> uDecimator (Pixel/Glitch)
        if (data.DECIMATOR_ACTIVE !== undefined) {
             this.uniforms.uDecimator.value = data.DECIMATOR_ACTIVE ? 1.0 : 0.0;
        }
        // If we had BITS param, we could modulate intensity
        if (data.BITS !== undefined) {
             // Lower bits = Higher distortion visually
             // 16 bits -> 0 effect, 1 bit -> 1.0 effect
             const norm = 1.0 - (data.BITS / 16.0);
             if (this.uniforms.uDecimator.value > 0.5) {
                 this.uniforms.uDecimator.value = 0.5 + (norm * 0.5);
             }
        }
    }

    public randomizeColor(deck: 'A' | 'B') {
        const h = Math.random();
        const s = 0.5 + Math.random() * 0.5;
        const l = 0.5 + Math.random() * 0.5;
        const color = new THREE.Color().setHSL(h, s, l);
        
        if (deck === 'A') {
            this.uniforms.uColorA.value = color;
        } else {
            this.uniforms.uColorB.value = color;
        }
    }

    public setMode(mode: 'organic' | 'wireframe') {
        this.uniforms.uMode.value = (mode === 'wireframe') ? 1.0 : 0.0;
        // Also reset wireframe on material if it was set
        if (this.material) this.material.wireframe = false;
    }

    public async updateTexture(deck: 'A' | 'B', url: string, type: 'video' | 'image') {
        let tex: THREE.Texture;
        
        if (type === 'video') {
            tex = this.textureManager.createVideoTexture(url);
        } else {
            tex = await this.textureManager.loadTexture(url);
        }

        if (deck === 'A') {
            this.uniforms.uTextureA.value = tex;
        } else {
            this.uniforms.uTextureB.value = tex;
        }
    }

    public async toggleWebcam(active: boolean) {
        if (active) {
            try {
                const tex = await this.textureManager.createWebcamTexture();
                // Override both for now, or just overlay?
                // For "Living Biogram", let's make it the "fused" texture 
                // but technically we have A and B. Let's set both or add a mix uniform?
                // Simplest: Set both to Webcam.
                this.uniforms.uTextureA.value = tex;
                this.uniforms.uTextureB.value = tex;
            } catch (e) {
                console.error("Webcam failed", e);
            }
        } else {
            // Revert? For now we don't store history. User has to reload file.
            // Or we could store 'default'
        }
    }

    public dispose() {
        cancelAnimationFrame(this.requestID);
        window.removeEventListener('resize', this.onResize);
        this.container.removeChild(this.renderer.domElement);
        this.renderer.dispose();
        this.textureManager.dispose();
    }
}
