import * as THREE from 'three';
import { MetaballVertexShader, MetaballFragmentShader } from './shaders/MetaballShader';
import { BlurVertexShader, BlurFragmentShaderH, BlurFragmentShaderV } from './shaders/BlurShader';
import { SweepLineTransitionVertexShader, SweepLineTransitionFragmentShader } from './shaders/SweepLineTransitionShader';
import { TextureManager } from './TextureManager';
import { MonochromeFlow } from './MonochromeFlow';
import { RingDimensions } from './RingDimensions';
import { WaveTerrain } from './WaveTerrain';
import { SuibokugaViz } from './SuibokugaViz';
import { SpectrumGrid } from './SpectrumGrid';
import { AiDynamicGrid } from './AiDynamicGrid';

import { ScoreManager } from './ScoreManager';
import { TestScoreVisual } from './TestScoreVisual';
import { DebugScoreVisual } from './DebugScoreVisual';
import { VisualChunk } from '../../ai/visual-analyzer';
import type { VisualMode } from './modes';

type InternalVisualMode = VisualMode | 'test_score' | 'debug_ai';
type VisualizerController = {
    mesh: { visible: boolean };
    update: (dt: number, data: unknown) => void;
    setOpacity?: (alpha: number) => void;
    setVisible?: (visible: boolean) => void;
    setParams?: (params: unknown) => void;
};
type MatrixMode =
    | 'organic'
    | 'math'
    | 'gnosis_glaze'
    | 'halid'
    | 'waves'
    | 'rings'
    | 'particles'
    | 'other';
type TransitionBehavior = 'morph' | 'smear_then_fade' | 'particle_bridge' | 'radial_collapse' | 'slice' | 'fade';
type TransitionPlan = {
    behavior: TransitionBehavior;
    transitionType: 'crossfade' | 'sweep_line_smear';
    speed: number;
};

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
    private suibokuga!: SuibokugaViz;
    private spectrumGrid!: SpectrumGrid;
    private aiDynamicGrid!: AiDynamicGrid;

    // Custom Visualizers
    private scoreManager: ScoreManager;
    private testScoreVisual!: TestScoreVisual;
    private debugVisual!: DebugScoreVisual;

    private requestID: number = 0;
    private startTime: number = 0;

    // State
    private uniforms: { [uniform: string]: THREE.IUniform } = {};
    private cameraDistanceOffset: number = 0; // Driven by AI Energy

    // --- Blending State Machine ---
    private currentModeName: InternalVisualMode = 'organic'; // active target
    
    // We map string names to instances
    private modeMap: Partial<Record<InternalVisualMode, VisualizerController>> = {};
    
    // Transition
    private transition = {
        active: false,
        fromMode: null as VisualizerController | null,
        toMode: null as VisualizerController | null,
        progress: 0.0,
        speed: 1.5 // Transition speed
    };

    // Trails / Fade
    private fadeScene!: THREE.Scene;
    private fadeCamera!: THREE.OrthographicCamera;
    private fadePlaneMesh!: THREE.Mesh;
    private isTrailsActive: boolean = false;

    // Resize Observer
    private resizeObserver: ResizeObserver | null = null;
    
    // AI State (Shared across visualizers)
    private currentAiParams: unknown = null;

    // --- Post-Processing Blur (Math Mode) ---
    private blurRenderTarget1!: THREE.WebGLRenderTarget;
    private blurRenderTarget2!: THREE.WebGLRenderTarget;
    private blurMaterialH!: THREE.ShaderMaterial;
    private blurMaterialV!: THREE.ShaderMaterial;
    private blurQuad!: THREE.Mesh;
    private blurScene!: THREE.Scene;
    private blurCamera!: THREE.OrthographicCamera;
    private blurAmount: number = 8.0; // Base blur strength (strong frosted glass)
    private blurHoldTimer: number = 0; // Timer to hold blur reduction
    private currentBlurLevel: number = 2.0; // Smoothed blur level
    
    // Kick Impulse for Organic Mode
    private kickImpulse: number = 0;
    private lastKickState: boolean = false;

    // Sweep transition post-process
    private transitionRenderTarget!: THREE.WebGLRenderTarget;
    private transitionScene!: THREE.Scene;
    private transitionCamera!: THREE.OrthographicCamera;
    private transitionMaterial!: THREE.ShaderMaterial;
    private transitionQuad!: THREE.Mesh;
    private transitionDirection: 0 | 1 = 0;
    private currentTransitionType: string = 'crossfade';
    private activeTransitionType: string = 'crossfade';
    private oneShotTransitionType: string | null = null;
    private pendingShaderMode: 'organic' | 'wireframe' | null = null;
    private pendingShaderApplied = false;
    private shaderBlendFrom: number | null = null;
    private shaderBlendTo: number | null = null;
    private shaderBlendStrategy: 'none' | 'midpoint' | 'lerp' | 'fade_swap' = 'none';
    private fadeTransitionDurationSec = 1.0;
    private static readonly DEFAULT_TRANSITION_SPEED = 1.4;
    private static readonly SWEEP_TRANSITION_SPEED = 0.12;

    constructor(container: HTMLElement) {
        this.container = container;
        this.textureManager = new TextureManager();
        this.scoreManager = new ScoreManager();
        this.init();
    }

    private init() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        // 1. Renderer (Optimized for transparency)
        this.renderer = new THREE.WebGLRenderer({ 
            alpha: false, // Set to false to allow trails to accumulate on black background
            antialias: false, 
            powerPreference: 'high-performance',
            preserveDrawingBuffer: true // Required for trails
        });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(1); // Force standard DPR for performance
        this.renderer.autoClear = false; // Manual clear for trails
        this.container.appendChild(this.renderer.domElement);

        // --- FADE PLANE (Trails) ---
        this.fadeScene = new THREE.Scene();
        this.fadeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const fadeGeo = new THREE.PlaneGeometry(2, 2);
        const fadeMat = new THREE.MeshBasicMaterial({
            color: 0x000000,
            transparent: true,
            opacity: 0.15, // Default Feedback
            blending: THREE.NormalBlending, // Important: Normal blending darkens the accumulation
            depthTest: false,
            depthWrite: false
        });
        this.fadePlaneMesh = new THREE.Mesh(fadeGeo, fadeMat);
        this.fadeScene.add(this.fadePlaneMesh);

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
        this.camera.position.set(0, 0, 10); 

        // 4. Object (Bounded Box for Raymarching)
        // const geometry = new THREE.BoxGeometry(6, 4, 4);
        const geometry = new THREE.SphereGeometry(2, 32, 32);
        
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
            uDecimator: { value: 0.0 },
            uKickImpulse: { value: 0.0 },
            uOrigins: { value: [
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0)
            ]},

            uRandomBurst: { value: 0.0 },
            uGloss: { value: 0.5 }, // New Gloss Control
            uChaos: { value: 0.0 }  // New Chaos Control
        };
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
        
        // Used for 'organic' and 'wireframe' modes (Shader-based)
        // We treat it as one visualizer instance
        const standardVisualizer: VisualizerController = {
            mesh: this.mesh,
            update: (_dt: number, _data: unknown) => {}, // Logic is in shader
            setOpacity: (alpha: number) => {
                this.material.opacity = Math.max(0.0, Math.min(1.0, alpha));
            }
        };

        const noOpVisualizer: VisualizerController = {
            mesh: { visible: false },
            update: () => {}
        };

        const noOpFadeVisualizer: VisualizerController = {
            mesh: { visible: false },
            update: () => {},
            setOpacity: () => {}
        };

        // Initialize Custom Visualizers
        // Create Test Visual
        this.testScoreVisual = new TestScoreVisual(this.container);
        this.testScoreVisual.setVisible(false);
        this.scene.add(this.testScoreVisual.mesh);
        this.loadTestScore();

        // Create Debug Visual
        this.debugVisual = new DebugScoreVisual();
        this.debugVisual.setVisible(false);
        this.scene.add(this.debugVisual.mesh);

        // INIT MONOCHROME FLOW
        try {
            this.monochromeFlow = new MonochromeFlow();
            this.monochromeFlow.mesh.visible = false;
            this.scene.add(this.monochromeFlow.mesh);
        } catch (e) {
            console.error("Failed to init MonochromeFlow", e);
            this.monochromeFlow = noOpFadeVisualizer as unknown as MonochromeFlow;
        }

        try {
            this.ringDimensions = new RingDimensions(this.spectrumTexture);
            this.ringDimensions.mesh.visible = false; 
            this.scene.add(this.ringDimensions.mesh);
        } catch (e) {
            console.error("Failed to init RingDimensions", e);
            this.ringDimensions = noOpFadeVisualizer as unknown as RingDimensions;
        }

        try {
            this.waveTerrain = new WaveTerrain(this.spectrumTexture);
            this.waveTerrain.mesh.visible = false;
            this.scene.add(this.waveTerrain.mesh);
        } catch (e) {
             console.error("Failed to init WaveTerrain", e);
             this.waveTerrain = noOpVisualizer as unknown as WaveTerrain;
        }

        // INIT Suibokuga
        try {
            this.suibokuga = new SuibokugaViz(this.spectrumTexture);
            this.suibokuga.setVisible(false);
            this.scene.add(this.suibokuga.mesh);
        } catch (e) {
            console.error("Failed to init SuibokugaViz", e);
            this.suibokuga = { ...noOpVisualizer, setVisible: () => {} } as unknown as SuibokugaViz;
        }

        // INIT SpectrumGrid
        try {
            this.spectrumGrid = new SpectrumGrid();
            this.spectrumGrid.mesh.visible = false;
            this.scene.add(this.spectrumGrid.mesh);
        } catch (e) {
            console.error("Failed to init SpectrumGrid", e);
            this.spectrumGrid = noOpFadeVisualizer as unknown as SpectrumGrid;
        }

        // INIT AiDynamicGrid
        try {
            this.aiDynamicGrid = new AiDynamicGrid();
            this.aiDynamicGrid.mesh.visible = false;
            this.scene.add(this.aiDynamicGrid.mesh);
        } catch (e) {
            console.error("Failed to init AiDynamicGrid", e);
            this.aiDynamicGrid = { ...noOpVisualizer, setParams: () => {} } as unknown as AiDynamicGrid;
        }

        // Setup Mode Map
        this.modeMap = {
            'organic': standardVisualizer,
            'wireframe': standardVisualizer, // Share same mesh
            'monochrome': this.monochromeFlow,
            'rings': this.ringDimensions,
            'waves': this.waveTerrain,
            'halid': this.suibokuga,
            'glaze': this.spectrumGrid,
            'gnosis': this.aiDynamicGrid,
            'suibokuga': this.suibokuga,
            'grid': this.spectrumGrid,
            'ai_grid': this.aiDynamicGrid,
            'test_score': this.testScoreVisual,
            'debug_ai': this.debugVisual
        };
        
        // Initial State: Show ORGANIC mode with random texture
        this.mesh.visible = true; 
        this.uniforms.uMode.value = 0.0;
        this.currentModeName = 'organic';
        this.loadRandomInitialTexture();

        // --- BLUR POST-PROCESSING SETUP ---
        const rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat
        };
        this.blurRenderTarget1 = new THREE.WebGLRenderTarget(w, h, rtOptions);
        this.blurRenderTarget2 = new THREE.WebGLRenderTarget(w, h, rtOptions);
        
        this.blurScene = new THREE.Scene();
        this.blurCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        const blurGeo = new THREE.PlaneGeometry(2, 2);
        
        this.blurMaterialH = new THREE.ShaderMaterial({
            vertexShader: BlurVertexShader,
            fragmentShader: BlurFragmentShaderH,
            uniforms: {
                tDiffuse: { value: null },
                resolution: { value: new THREE.Vector2(w, h) },
                blurAmount: { value: this.blurAmount }
            }
        });
        
        this.blurMaterialV = new THREE.ShaderMaterial({
            vertexShader: BlurVertexShader,
            fragmentShader: BlurFragmentShaderV,
            uniforms: {
                tDiffuse: { value: null },
                resolution: { value: new THREE.Vector2(w, h) },
                blurAmount: { value: this.blurAmount }
            }
        });
        
        this.blurQuad = new THREE.Mesh(blurGeo, this.blurMaterialH);
        this.blurScene.add(this.blurQuad);

        this.transitionRenderTarget = new THREE.WebGLRenderTarget(w, h, rtOptions);
        this.transitionScene = new THREE.Scene();
        this.transitionCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.transitionMaterial = new THREE.ShaderMaterial({
            vertexShader: SweepLineTransitionVertexShader,
            fragmentShader: SweepLineTransitionFragmentShader,
            uniforms: {
                tDiffuse: { value: null },
                uProgress: { value: 0.0 },
                uDirection: { value: 0.0 }
            }
        });
        this.transitionQuad = new THREE.Mesh(blurGeo, this.transitionMaterial);
        this.transitionScene.add(this.transitionQuad);

        // PRE-COMPILE SHADERS to prevent freeze on first use
        if (import.meta.env.DEV) console.log('[VisualEngine] Pre-compiling shaders...');
        this.renderer.compile(this.scene, this.camera);
        this.renderer.compile(this.blurScene, this.blurCamera);
        // Force GPU upload for blur materials
        this.blurMaterialH.uniforms.tDiffuse.value = this.blurRenderTarget1.texture;
        this.blurMaterialV.uniforms.tDiffuse.value = this.blurRenderTarget2.texture;
        // Warm up render targets with a dummy render
        this.renderer.setRenderTarget(this.blurRenderTarget1);
        this.renderer.clearColor();
        this.renderer.render(this.scene, this.camera);
        this.renderer.setRenderTarget(this.blurRenderTarget2);
        this.blurQuad.material = this.blurMaterialH;
        this.renderer.render(this.blurScene, this.blurCamera);
        this.blurQuad.material = this.blurMaterialV;
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.blurScene, this.blurCamera);
        if (import.meta.env.DEV) console.log('[VisualEngine] Shader pre-compilation complete.');

        // Start Loop
        this.startTime = performance.now();
        this.animate();
        
        // ROBUST SIZING: Use ResizeObserver
        this.resizeObserver = new ResizeObserver(() => {
            this.onResize();
        });
        this.resizeObserver.observe(this.container);
        
        // Also keep window listener for good measure
        window.addEventListener('resize', this.onResize);
    }

    private loadTestScore() {
        // Dummy Score matching the schema sample
        const dummyScore = {
            version: "1.0",
            bpm: 128.0,
            duration: 60.0,
            tracks: {
                A: [
                    { time: 0.0, state: { mode: "organic", theme: "default", energy: 0.0, chaos: 0.0, distortion: 0.0, cloud: 0.0, event: "NOTE_ON" } },
                    { time: 0.1, state: { mode: "organic", theme: "default", energy: 0.8, chaos: 0.1, distortion: 0.0, cloud: 0.0, event: "NONE" } },
                    { time: 0.5, state: { mode: "organic", theme: "default", energy: 0.4, chaos: 0.0, distortion: 0.0, cloud: 0.0, event: "NONE" } },
                    { time: 1.0, state: { mode: "organic", theme: "default", energy: 0.0, chaos: 0.0, distortion: 0.0, cloud: 0.0, event: "NOTE_OFF" } },
                    { time: 2.5, state: { mode: "wireframe", theme: "neon", energy: 1.0, chaos: 1.0, distortion: 0.5, cloud: 0.2, event: "DROP_IMPACT" } },
                    { time: 3.0, state: { mode: "wireframe", theme: "neon", energy: 0.8, chaos: 0.5, distortion: 0.3, cloud: 0.1, event: "NONE" } },
                    { time: 5.0, state: { mode: "organic", theme: "default", energy: 0.2, chaos: 0.0, distortion: 0.0, cloud: 0.0, event: "FADE_OUT" } }
                ],
                B: [
                    { time: 0.0, state: { mode: "organic", theme: "default", energy: 0.5, chaos: 0.2, distortion: 0.0, cloud: 0.0, event: "NONE" } },
                    { time: 2.0, state: { mode: "organic", theme: "default", energy: 1.0, chaos: 0.8, distortion: 0.2, cloud: 0.0, event: "BUILD" } }
                ]
            }
        };
        this.scoreManager.loadScore(dummyScore);
    }

    private onResize = () => {
        if (!this.container || !this.renderer) return;
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        
        if (w === 0 || h === 0) return; // Ignore invisible state

        this.renderer.setSize(w, h);
        
        if (this.camera) {
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
        }
        
        // Resize blur RenderTargets
        if (this.blurRenderTarget1) {
            this.blurRenderTarget1.setSize(w, h);
            this.blurRenderTarget2.setSize(w, h);
            this.transitionRenderTarget.setSize(w, h);
            this.blurMaterialH.uniforms.resolution.value.set(w, h);
            this.blurMaterialV.uniforms.resolution.value.set(w, h);
        }
    };

    private lastTime: number = 0;


    private animate = () => {
        this.requestID = requestAnimationFrame(this.animate);
        
        const now = performance.now();
        const elapsed = (now - this.startTime) * 0.001;
        const delta = Math.min((now - this.lastTime) * 0.001, 0.1); 
        this.lastTime = now;
        
        this.uniforms.uTime.value = elapsed;

        // --- Camera Crossfader Rotation (DISABLED for Rings Depth Control) ---
        // const cf = this.uniforms.uCrossfade.value;
        // const angle = (cf - 0.5) * 2.8; 
        // const rad = 6.0;
        // this.camera.position.x = Math.sin(angle) * rad;
        // this.camera.position.z = Math.cos(angle) * rad;
        // const angle = (cf - 0.5) * 2.8; 
        // const rad = 6.0;
        // this.camera.position.x = Math.sin(angle) * rad;
        // this.camera.position.z = Math.cos(angle) * rad;
        const baseDist = 6.0;
        const zoom = this.cameraDistanceOffset;
        this.camera.position.set(0, 0, baseDist - zoom); // Zoom in on high energy
        this.camera.lookAt(0, 0, 0);
        this.uniforms.uCameraPos.value.copy(this.camera.position);

        // --- Transition Logic ---
        if (this.transition.active) {
            this.transition.progress += delta * this.transition.speed;
            const t = Math.min(this.transition.progress, 1.0);

            if (this.shaderBlendStrategy === 'lerp' && this.shaderBlendFrom !== null && this.shaderBlendTo !== null) {
                this.uniforms.uMode.value = this.shaderBlendFrom + (this.shaderBlendTo - this.shaderBlendFrom) * t;
            }

            // Two-step fallback for shader-family transitions:
            // fade out current mode -> swap mode at midpoint -> fade in target mode.
            if (this.shaderBlendStrategy === 'fade_swap' && this.pendingShaderMode) {
                if (t < 0.5) {
                    this.material.opacity = 1.0 - (t * 2.0);
                } else {
                    if (!this.pendingShaderApplied) {
                        this.uniforms.uMode.value = (this.pendingShaderMode === 'wireframe') ? 1.0 : 0.0;
                        this.pendingShaderApplied = true;
                    }
                    this.material.opacity = (t - 0.5) * 2.0;
                }
            }

            // For shader-mode-to-shader-mode transitions, switch mode at midpoint
            // while sweep transition is visually active.
            if (this.shaderBlendStrategy === 'midpoint' && this.pendingShaderMode && !this.pendingShaderApplied && t >= 0.5) {
                this.uniforms.uMode.value = (this.pendingShaderMode === 'wireframe') ? 1.0 : 0.0;
                this.pendingShaderApplied = true;
            }
            
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
                if (this.transition.fromMode && this.transition.fromMode !== this.transition.toMode) {
                    this.transition.fromMode.mesh.visible = false;
                }
                this.transition.fromMode = null;
                this.transition.toMode = null;
                this.pendingShaderMode = null;
                this.pendingShaderApplied = false;
                this.shaderBlendFrom = null;
                this.shaderBlendTo = null;
                this.shaderBlendStrategy = 'none';
                this.material.opacity = 1.0;
                this.activeTransitionType = 'crossfade';
            }
        }

        // --- Update Active Visualizers ---
        const low = Math.max(this.uniforms.uLowA.value, this.uniforms.uLowB.value);
        const high = Math.max(this.uniforms.uHighA.value, this.uniforms.uHighB.value);
        const kick = low > 0.6; // Lowered threshold for better responsiveness
        const spectrum = this.spectrumTexture.image.data;
        const audioData = { low, high, kick, spectrum };
        
        // --- KICK IMPULSE LOGIC ---
        // Trigger on rising edge, then decay
        if (kick && !this.lastKickState) {
            this.kickImpulse = 1.0; // Trigger
        }
        this.lastKickState = kick;
        this.kickImpulse *= 0.92; // Decay (~8 frames to reach 50%)
        this.uniforms.uKickImpulse.value = this.kickImpulse;

        // --- Use Shared AI Params (Updated in updateUniforms) ---
        const crossfader = this.uniforms.uCrossfade.value;
        const vizUpdateData = { ...audioData, ai: this.currentAiParams, crossfader };
        
        // Update visualizers with AI + Audio data
        if (this.monochromeFlow.mesh.visible) this.monochromeFlow.update(delta, vizUpdateData);
        if (this.ringDimensions.mesh.visible) this.ringDimensions.update(delta, vizUpdateData);
        if (this.waveTerrain.mesh.visible) this.waveTerrain.update(delta, vizUpdateData);
        if (this.suibokuga.mesh.visible) this.suibokuga.update(delta, vizUpdateData);
        if (this.spectrumGrid.mesh.visible) this.spectrumGrid.update(delta, vizUpdateData);
        if (this.aiDynamicGrid.mesh.visible) this.aiDynamicGrid.update(delta, vizUpdateData);

        if (this.isRendering) {
            
            // --- BLUR POST-PROCESSING FOR MATH MODE (WIREFRAME) ---
            const isShaderFamilyMode = this.currentModeName === 'wireframe' || this.currentModeName === 'organic';
            const modeValue = Number(this.uniforms.uMode.value ?? 0);
            // During wireframe -> organic transitions, keep math post-process until blend crosses midpoint.
            const isMathMode = isShaderFamilyMode && modeValue > 0.55;
            
            if (isMathMode && this.blurRenderTarget1) {
                // Hi-hat trigger: When highs exceed threshold, reduce blur and HOLD it
                const hihatThreshold = 0.15;
                const hihatTrigger = Math.max(0, high - hihatThreshold) / (1.0 - hihatThreshold);
                
                // When hi-hat triggers, reset hold timer to 0.5 seconds
                if (hihatTrigger > 0.4) {
                    this.blurHoldTimer = 0.5; // Hold for 0.5 second
                }
                
                // Decay the hold timer
                this.blurHoldTimer = Math.max(0, this.blurHoldTimer - delta);
                
                // Target blur: low when triggered or holding, high otherwise
                const isHolding = this.blurHoldTimer > 0;
                const targetBlur = isHolding ? 0.3 : 2.0;
                
                // Smooth transition to target blur
                const blurSpeed = isHolding ? 10.0 : 2.0; // Fast down, slow up
                this.currentBlurLevel += (targetBlur - this.currentBlurLevel) * Math.min(1.0, delta * blurSpeed);
                
                this.blurMaterialH.uniforms.blurAmount.value = this.currentBlurLevel;
                this.blurMaterialV.uniforms.blurAmount.value = this.currentBlurLevel;
                
                // 1. Render scene to RenderTarget1
                this.renderer.setRenderTarget(this.blurRenderTarget1);
                this.renderer.clearColor();
                this.renderer.clearDepth();
                this.renderer.render(this.scene, this.camera);
                
                // MULTI-PASS BLUR (2 iterations = 4 passes total for smooth result)
                for (let i = 0; i < 2; i++) {
                    // Horizontal Blur: RT1 -> RT2
                    this.blurQuad.material = this.blurMaterialH;
                    this.blurMaterialH.uniforms.tDiffuse.value = this.blurRenderTarget1.texture;
                    this.renderer.setRenderTarget(this.blurRenderTarget2);
                    this.renderer.clearColor();
                    this.renderer.render(this.blurScene, this.blurCamera);
                    
                    // Vertical Blur: RT2 -> RT1
                    this.blurQuad.material = this.blurMaterialV;
                    this.blurMaterialV.uniforms.tDiffuse.value = this.blurRenderTarget2.texture;
                    this.renderer.setRenderTarget(this.blurRenderTarget1);
                    this.renderer.clearColor();
                    this.renderer.render(this.blurScene, this.blurCamera);
                }
                
                // Final output to screen
                if (this.transition.active && this.activeTransitionType === 'sweep_line_smear') {
                    this.renderSweepTransition(this.blurRenderTarget1.texture, this.transition.progress);
                } else {
                    this.blurMaterialV.uniforms.tDiffuse.value = this.blurRenderTarget1.texture;
                    this.renderer.setRenderTarget(null); // Back to screen
                    
                    if (this.isTrailsActive && this.fadePlaneMesh) {
                        this.renderer.render(this.fadeScene, this.fadeCamera);
                    } else {
                        this.renderer.clearColor();
                    }
                    this.renderer.clearDepth();
                    this.renderer.render(this.blurScene, this.blurCamera);
                }
                
            } else {
                // Normal rendering (no blur)
                if (this.transition.active && this.activeTransitionType === 'sweep_line_smear') {
                    this.renderer.setRenderTarget(this.transitionRenderTarget);
                    this.renderer.clearColor();
                    this.renderer.clearDepth();
                    this.renderer.render(this.scene, this.camera);
                    this.renderSweepTransition(this.transitionRenderTarget.texture, this.transition.progress);
                } else {
                    if (this.isTrailsActive && this.fadePlaneMesh) {
                        // TRAILS ENABLED: Render Fade Plane instead of Clearing
                        this.renderer.render(this.fadeScene, this.fadeCamera);
                    } else {
                        // TRAILS DISABLED: Clear screen normally
                        this.renderer.clearColor();
                    }

                    this.renderer.clearDepth();
                    this.renderer.render(this.scene, this.camera);
                }
            }
        }
    };

    private renderSweepTransition(texture: THREE.Texture, progress: number) {
        this.transitionMaterial.uniforms.tDiffuse.value = texture;
        this.transitionMaterial.uniforms.uProgress.value = Math.min(1.0, Math.max(0.0, progress));
        this.transitionMaterial.uniforms.uDirection.value = this.transitionDirection;
        this.renderer.setRenderTarget(null);
        this.renderer.clearColor();
        this.renderer.clearDepth();
        this.renderer.render(this.transitionScene, this.transitionCamera);
    }

    // --- BLUR CONTROLS ---
    public setBlur(active: boolean, feedback: number, tintHex: string) {
        this.isTrailsActive = active;
        
        if (this.fadePlaneMesh) {
            // Feedback controls opacity.
            // Low Feedback (Slider Left) = Trails Disappear Quickly = HIGH Opacity of Black Plane
            // High Feedback (Slider Right) = Trails Linger = LOW Opacity of Black Plane
            // User UI: "FEEDBACK" -> 0 (No Trails) to 1 (Infinite)
            // Logic: Opacity = 1.0 - Feedback
            // However, we want safe bounds. 
            // Range: 0.7 (Fast Fade) to 0.05 (Long Fade)
            // Map 0..1 to 0.7..0.05
            
            const opacity = 0.7 - (feedback * 0.65);
            (this.fadePlaneMesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.01, Math.min(1.0, opacity));
            
            // Tint Color
            (this.fadePlaneMesh.material as THREE.MeshBasicMaterial).color.setStyle(tintHex);
        }
    }

    public setAiGridParams(params: any) {
        if (this.aiDynamicGrid && this.aiDynamicGrid.setParams) {
            this.aiDynamicGrid.setParams(params);
        }
    }

    private isShaderFamilyMode(mode: string): mode is 'organic' | 'wireframe' {
        return mode === 'organic' || mode === 'wireframe';
    }

    private normalizeModeForMatrix(mode: string): MatrixMode {
        switch (mode) {
            case 'wireframe':
                return 'math';
            case 'monochrome':
                return 'particles';
            case 'suibokuga':
            case 'halid':
                return 'halid';
            case 'grid':
            case 'glaze':
            case 'ai_grid':
            case 'gnosis':
            case 'gnosis_glaze':
                return 'gnosis_glaze';
            case 'organic':
            case 'waves':
            case 'rings':
                return mode;
            default:
                return 'other';
        }
    }

    private resolveTransitionPlan(fromMode: string, toMode: string): TransitionPlan {
        const from = this.normalizeModeForMatrix(fromMode);
        const to = this.normalizeModeForMatrix(toMode);

        const matrix: Partial<Record<MatrixMode, Partial<Record<MatrixMode, TransitionBehavior>>>> = {
            organic: {
                math: 'morph',
                gnosis_glaze: 'morph',
                halid: 'slice',
                waves: 'smear_then_fade',
                rings: 'radial_collapse',
                particles: 'particle_bridge'
            },
            math: {
                organic: 'morph',
                gnosis_glaze: 'morph',
                halid: 'slice',
                waves: 'smear_then_fade',
                rings: 'radial_collapse',
                particles: 'particle_bridge'
            },
            gnosis_glaze: {
                organic: 'morph',
                math: 'morph',
                halid: 'slice',
                waves: 'smear_then_fade',
                rings: 'radial_collapse',
                particles: 'particle_bridge'
            },
            halid: {
                organic: 'slice',
                math: 'slice',
                gnosis_glaze: 'slice',
                waves: 'fade',
                rings: 'radial_collapse',
                particles: 'particle_bridge'
            },
            waves: {
                organic: 'smear_then_fade',
                math: 'smear_then_fade',
                gnosis_glaze: 'smear_then_fade',
                halid: 'fade',
                rings: 'fade',
                particles: 'fade'
            },
            rings: {
                organic: 'radial_collapse',
                math: 'radial_collapse',
                gnosis_glaze: 'radial_collapse',
                halid: 'radial_collapse',
                waves: 'fade',
                particles: 'particle_bridge'
            },
            particles: {
                organic: 'particle_bridge',
                math: 'particle_bridge',
                gnosis_glaze: 'particle_bridge',
                halid: 'particle_bridge',
                waves: 'fade',
                rings: 'particle_bridge'
            }
        };

        const behavior = matrix[from]?.[to] ?? 'fade';
        switch (behavior) {
            case 'morph':
                return { behavior, transitionType: 'crossfade', speed: 1.7 };
            case 'smear_then_fade':
                return { behavior, transitionType: 'sweep_line_smear', speed: VisualEngine.SWEEP_TRANSITION_SPEED };
            case 'particle_bridge':
                return { behavior, transitionType: 'crossfade', speed: 1.25 };
            case 'radial_collapse':
                return { behavior, transitionType: 'crossfade', speed: 1.1 };
            case 'slice':
                return { behavior, transitionType: 'crossfade', speed: 1.0 };
            case 'fade':
            default: {
                const preferred = this.currentTransitionType === 'sweep_line_smear' ? 'sweep_line_smear' : 'crossfade';
                return { behavior: 'fade', transitionType: preferred, speed: this.getTransitionSpeed(preferred) };
            }
        }
    }

    public setMode(mode: VisualMode) {
        if (mode === this.currentModeName) return;

        if (import.meta.env.DEV) console.log(`[VisualEngine] Switching: ${this.currentModeName} -> ${mode}`);

        // FIX: If transition is already active, force clean up previous state
        if (this.transition.active) {
            // Force hide the 'from' mode of the interrupted transition
            if (this.transition.fromMode && this.transition.fromMode !== this.transition.toMode) {
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

        const oldViz = this.modeMap[this.currentModeName] ?? null;
        // If we were transitioning, the 'oldViz' based on name might be wrong if we hadn't finished swapping names?
        // No, we update currentModeName at end? No, we updated it at start in previous code?
        // In previous code: this.currentModeName = mode; (at end).
        // So oldViz is correct.
        
        // However, if transition active, 'oldViz' (currentModeName) is actually the one FADING IN. 
        // The one fading OUT (transition.fromMode) needs to be killed immediately.
        if (this.transition.active && this.transition.fromMode) {
             if (this.transition.fromMode !== this.transition.toMode) {
                this.transition.fromMode.mesh.visible = false;
             }
        }

        const newViz = this.modeMap[mode] ?? null;
        if (!newViz) return;
        const oneShotType = this.oneShotTransitionType;
        this.oneShotTransitionType = null;
        const baseTransitionPlan = this.resolveTransitionPlan(this.currentModeName, mode);
        const transitionPlan: TransitionPlan = oneShotType
            ? {
                behavior: 'fade',
                transitionType: oneShotType === 'sweep_line_smear' ? 'sweep_line_smear' : 'crossfade',
                speed: this.getTransitionSpeed(oneShotType)
            }
            : baseTransitionPlan;
        const resolvedTransitionType = oneShotType || transitionPlan.transitionType;
        
        // Handle Shader Modes separately?
        if (this.isShaderFamilyMode(mode) && this.isShaderFamilyMode(this.currentModeName)) {
             const targetModeValue = (mode === 'wireframe') ? 1.0 : 0.0;
             this.activeTransitionType = resolvedTransitionType;

             // sweep_line_smear on shader-family transitions causes black-frame artifacts.
             // Fallback to two-step fade (fade out/in) for stable visual handoff.
             if (this.activeTransitionType === 'sweep_line_smear' || transitionPlan.behavior !== 'morph') {
                 this.transition.fromMode = oldViz;
                 this.transition.toMode = newViz;
                 this.transition.active = true;
                 this.transition.progress = 0.0;
                 this.transition.speed = Math.max(0.9, transitionPlan.speed);
                 this.transitionDirection = Math.random() < 0.5 ? 0 : 1;
                 this.pendingShaderMode = mode;
                 this.pendingShaderApplied = false;
                 this.shaderBlendFrom = this.uniforms.uMode.value as number;
                 this.shaderBlendTo = targetModeValue;
                 this.shaderBlendStrategy = 'fade_swap';
                 // Disable sweep post-process for this special case.
                 this.activeTransitionType = 'crossfade';
                 this.currentModeName = mode;
                 newViz.mesh.visible = true;
                 return;
             }
             // Default mode switching is crossfade (lerp uMode).
             this.transition.fromMode = oldViz;
             this.transition.toMode = newViz;
             this.transition.active = true;
             this.transition.progress = 0.0;
             this.transition.speed = transitionPlan.speed;
             this.currentModeName = mode;
             newViz.mesh.visible = true;
             this.pendingShaderMode = mode;
             this.pendingShaderApplied = true;
             this.shaderBlendFrom = this.uniforms.uMode.value as number;
             this.shaderBlendTo = targetModeValue;
             this.shaderBlendStrategy = 'lerp';
             return;
        }
        
        // Standard Transition
        this.transition.fromMode = oldViz;
        this.transition.toMode = newViz;
        this.transition.active = true;
        this.transition.progress = 0.0;
        this.activeTransitionType = resolvedTransitionType;
        this.transition.speed = transitionPlan.speed;
        this.transitionDirection = Math.random() < 0.5 ? 0 : 1;
        
        // Ensure new viz is visible for fade in
        if (newViz) {
            newViz.mesh.visible = true;
            
            // Explicitly ensure the main shader mesh is visible if we are switching to organic/wireframe
            if (mode === 'organic' || mode === 'wireframe') {
                 this.mesh.visible = true;
                 this.uniforms.uMode.value = (mode === 'wireframe') ? 1.0 : 0.0;
            }

            if (newViz.setOpacity) newViz.setOpacity(0.0);
            
            // Special handling for Visualizers with external overlays (like TestScoreVisual)
            if (typeof newViz.setVisible === 'function') {
                newViz.setVisible(true);
            }
        }
        
        // Hide overlay of old viz immediately (if it has one)
        if (oldViz && typeof oldViz.setVisible === 'function' && oldViz !== newViz) {
            oldViz.setVisible(false);
        }

        this.currentModeName = mode;
    }

    public setTransitionType(type: string) {
        this.currentTransitionType = type;
    }

    public setTransitionTypeOnce(type: string) {
        this.oneShotTransitionType = type;
    }

    public setFadeTransitionDurationSec(seconds: number) {
        const s = Number(seconds);
        if (!Number.isFinite(s)) return;
        this.fadeTransitionDurationSec = Math.max(0.25, Math.min(4.0, s));
    }

    private getTransitionSpeed(type: string): number {
        if (type === 'sweep_line_smear') return VisualEngine.SWEEP_TRANSITION_SPEED;
        const base = 1.0 / Math.max(0.25, this.fadeTransitionDurationSec);
        if (type === 'soft_overlay') return base * 1.2;
        if (type === 'fade_in' || type === 'fade_out' || type === 'crossfade') return base;
        return base;
    }

    // Helper to extract current state for Sync
    public getInterpolatedState(time: number) {
        return {
            A: this.scoreManager.getInterpolatedState('A', time),
            B: this.scoreManager.getInterpolatedState('B', time)
        };
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

        // --- SCORE SYNC UPDATE ---
        // Debug Log (Throttled)
        if (this.uniforms.uTime.value % 1.0 < 0.02) {
             // console.log(`[VisualEngine] Update. Mode: ${this.currentModeName} Time: ${this.uniforms.uTime.value.toFixed(2)}`);
        }

        if (this.currentModeName === 'test_score') {
            const time = data.time || this.uniforms.uTime.value; 
            const stateA = this.scoreManager.getInterpolatedState('A', time % 5.0); // Loop 5s for test
            const stateB = this.scoreManager.getInterpolatedState('B', time % 5.0);
            
            this.testScoreVisual.update(stateA, stateB, time % 5.0);
        } else if (this.currentModeName === 'debug_ai') {
             // Use Injected State (Slave) OR Calculate Local (Master)
             let stateA, stateB;

             if (data.debugState) {
                 // Slave Mode: Use trusted state from Master
                 stateA = data.debugState.A;
                 stateB = data.debugState.B;
             } else {
                 // Master Mode: Calculate from local ScoreManager
                 const time = data.time || this.uniforms.uTime.value;
                 stateA = this.scoreManager.getInterpolatedState('A', time);
                 stateB = this.scoreManager.getInterpolatedState('B', time);
             }

             if (stateA && stateB) {
                 this.debugVisual.update(stateA, stateB);
             }



        } 
        

        // --- AI PARAMETER MAPPING & STATE STORAGE ---
        const time = data.time || this.uniforms.uTime.value;
        let stateA, stateB;
        if (data.debugState) {
            stateA = data.debugState.A;
            stateB = data.debugState.B;
        } else {
            stateA = this.scoreManager.getInterpolatedState('A', time);
            stateB = this.scoreManager.getInterpolatedState('B', time);
        }

        if (stateA && stateB) {
            const cf = this.uniforms.uCrossfade.value;
            const avgEnergy = stateA.energy * (1-cf) + stateB.energy * cf;
            const avgChaos = stateA.chaos * (1-cf) + stateB.chaos * cf;
            const avgCloud = stateA.cloud * (1-cf) + stateB.cloud * cf;
            
            this.currentAiParams = {
                energy: avgEnergy,
                chaos: avgChaos,
                cloud: avgCloud,
                mood: (cf < 0.5) ? stateA.theme : stateB.theme,
                stateA,
                stateB
            };

            // Apply directly to Organic Shader (if active)
            if (this.currentModeName === 'organic' || this.currentModeName === 'wireframe') {
                 this.uniforms.uGloss.value = 0.3 + avgEnergy * 0.7; 
                 this.uniforms.uChaos.value = avgChaos;

                 const colA = new THREE.Color().setHSL(0.0 + stateA.chaos * 0.2, 1.0, 0.5 + stateA.energy * 0.4); 
                 const colB = new THREE.Color().setHSL(0.6 + stateB.chaos * 0.2, 1.0, 0.5 + stateB.energy * 0.4); 
                 this.uniforms.uColorA.value.lerp(colA, 0.1); 
                 this.uniforms.uColorB.value.lerp(colB, 0.1);
                 this.cameraDistanceOffset = avgEnergy * 0.5;
            }
        } else {
            this.currentAiParams = null;
        }

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
        
        // BLUR Control (If receiving from Broadcast/UI directly via uniforms update payload)
        if (data.blurActive !== undefined) {
            this.setBlur(data.blurActive, data.blurFeedback, data.blurTint);
        }
        if (data.VISUAL_TRANSITION_TYPE !== undefined && typeof data.VISUAL_TRANSITION_TYPE === 'string') {
            this.currentTransitionType = data.VISUAL_TRANSITION_TYPE;
        }
    }

    private isRendering: boolean = true;

    public setRendering(active: boolean) {
        this.isRendering = active;
    }

    public get mode(): InternalVisualMode {
        return this.currentModeName;
    }

    public get transitionType(): string {
        return this.currentTransitionType;
    }

    public addVisualScore(deck: 'A' | 'B', chunk: VisualChunk, startTimeSec: number) {
        this.scoreManager.addChunk(deck, chunk, startTimeSec);
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

    private loadRandomInitialTexture() {
        const images = [
            'Venus.png', 'butterfly.png', 'commet.png', 'corn.png', 'dragon fish.png',
            'grape.png', 'ice.png', 'iguana.png', 'jupitar.png', 'jupiter.png',
            'mars.png', 'mush.png', 'octopus.png', 'orora.png', 'orstrich.png',
            'peach.png', 'planet.png', 'poteto.png', 'strawberry.png', 'strawberry2.png',
            'tomato.png', 'tomato2.png'
        ];
        const randomIndex = Math.floor(Math.random() * images.length);
        const randomImage = images[randomIndex];
        const url = `./img/${randomImage}`;
        this.textureManager.loadTexture(url).then(tex => {
            this.uniforms.uTextureA.value = tex;
            this.uniforms.uTextureB.value = tex;
        }).catch(e => {
            console.warn('Failed to load initial random texture:', e);
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

    public clearVisualScore(deck: 'A' | 'B') {
        this.scoreManager.clearTrack(deck);
    }

    public dispose() {
        cancelAnimationFrame(this.requestID);
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.renderer.dispose();
        this.blurRenderTarget1?.dispose();
        this.blurRenderTarget2?.dispose();
        this.transitionRenderTarget?.dispose();
        this.blurMaterialH?.dispose();
        this.blurMaterialV?.dispose();
        this.transitionMaterial?.dispose();
        // Dispose textures/materials if needed
        this.textureManager.dispose();
        
        // Remove listeners
        window.removeEventListener('resize', this.onResize);
    }
}
