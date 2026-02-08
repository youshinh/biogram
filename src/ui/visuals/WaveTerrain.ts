import * as THREE from 'three';

/**
 * Wave Terrain -> Harmonic Chaos Surface
 * Refined for "Healing" Calmness, "Nebula" Glow, and "Scattered" Motion.
 * 
 * Frequency Mapping (using Spectrum Texture):
 * - Kick (Low): Gentle Vertical Swell (No sharp burst)
 * - Bass (Low-Mid): Slow Breathing (Horizontal expansion)
 * - Snare (Mid): Soft Ripple
 * - Pad (High-Mid): Slow Flow
 * - Hat (High): Subtle Sparkle
 */
export class WaveTerrain {
    public mesh: THREE.Group;
    private terrain: THREE.Points;
    private uniforms: { [key: string]: THREE.IUniform };
    
    // Beat Detection State
    private kickActive: boolean = false;
    private kickCounter: number = 0;
    private burstValue: number = 0;
    private impulseValue: number = 0;
    
    // Time Smoothing - Prevents abrupt speed changes
    private currentTimeScale: number = 0.5;
    
    // View Mode: interpolated by crossfader
    // Bird's-eye (俯瞰): rotation.x = -1.2 (~-70deg), y = 5, z = -30
    // Horizon (地平線): rotation.x = -0.4 (~-23deg), y = -15, z = -60
    private currentRotX: number = -0.8;
    private currentPosY: number = -5;
    private currentPosZ: number = -45;



    constructor(spectrumTexture: THREE.DataTexture) {
        this.init(spectrumTexture);
    }

    private init(spectrumTexture: THREE.DataTexture) {
        this.mesh = new THREE.Group();

        // Optimized grid density (was 200x200, now 120x120 for better perf)
        const geometry = new THREE.PlaneGeometry(240, 240, 120, 120);

        this.uniforms = {
            uTime: { value: 0 },
            uSpectrum: { value: spectrumTexture },
            uGlobalOpacity: { value: 1.0 },
            uColor1: { value: new THREE.Color(0x00aaff) }, 
            uColor2: { value: new THREE.Color(0xffffff) },
            uKickImpulse: { value: 0.0 },
            uOrigins: { value: [
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0)
            ]},
            uRandomBurst: { value: 0.0 } // Kept to avoid breaking any lingering refs, though unused
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform float uTime;
                uniform sampler2D uSpectrum;
                uniform float uKickImpulse;
                uniform float uRandomBurst;
                uniform vec2 uOrigins[5]; // CPU-driven origins
                
                varying float vElevation;
                varying float vHigh;
                varying float vKick;
                varying float vDepth;
                
                // Simplex Noise
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
                float snoise(vec2 v) {
                    const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
                    vec2 i  = floor(v + dot(v, C.yy) );
                    vec2 x0 = v -   i + dot(i, C.xx);
                    vec2 i1;
                    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
                    vec4 x12 = x0.xyxy + C.xxzz;
                    x12.xy -= i1;
                    i = mod289(i);
                    vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 ));
                    vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
                    m = m*m ;
                    m = m*m ;
                    vec3 x = 2.0 * fract(p * C.www) - 1.0;
                    vec3 h = abs(x) - 0.5;
                    vec3 ox = floor(x + 0.5);
                    vec3 a0 = x - ox;
                    m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
                    vec3 g;
                    g.x  = a0.x  * x0.x  + h.x  * x0.y;
                    g.yz = a0.yz * x12.xz + h.yz * x12.yw;
                    return 130.0 * dot(m, g);
                }

                void main() {
                    vec3 pos = position;
                    
                    // --- OPTIMIZED: Single texture sample, extract 5 bands ---
                    // Sample at 5 positions but use interpolation trick
                    float b1 = smoothstep(0.05, 1.0, texture2D(uSpectrum, vec2(0.05, 0.5)).r); // Sub-Bass
                    float b2 = smoothstep(0.05, 1.0, texture2D(uSpectrum, vec2(0.20, 0.5)).r); // Low-Mid
                    float b3 = smoothstep(0.05, 1.0, texture2D(uSpectrum, vec2(0.40, 0.5)).r); // Mid
                    float b4 = smoothstep(0.05, 1.0, texture2D(uSpectrum, vec2(0.65, 0.5)).r); // High-Mid
                    float b5 = smoothstep(0.05, 1.0, texture2D(uSpectrum, vec2(0.90, 0.5)).r); // High

                // --- OPTIMIZED WAVE LAYERS ---
                // Use squared distance (dot product) instead of distance() to avoid sqrt()
                
                // Band 1: Deep Swell (Sub-Bass)
                vec2 diff1 = pos.xy - uOrigins[0];
                float d1sq = dot(diff1, diff1);
                float d1 = sqrt(d1sq); // Need actual distance for sin phase
                float att1 = 1.0 / (1.0 + d1 * 0.015);
                float w1 = sin(d1 * 0.15 - uTime * 5.0) * (b1 * 10.0 + uKickImpulse * 10.0) * att1;
                
                // Band 2: Rhythmic Pulse (Low-Mid)
                vec2 diff2 = pos.xy - uOrigins[1];
                float d2 = sqrt(dot(diff2, diff2));
                float w2 = sin(d2 * 0.2 - uTime * 4.0) * (b2 * 10.0) / (1.0 + d2 * 0.03);
                
                // Band 3: Sharp Ripples (Mid)
                vec2 diff3 = pos.xy - uOrigins[2];
                float d3 = sqrt(dot(diff3, diff3));
                float w3 = sin(d3 * 0.5 - uTime * 6.0) * (b3 * 5.0) / (1.0 + d3 * 0.1);
                
                // Band 4: Choppy Water (High-Mid) - SIMPLIFIED
                // Use simple sin-based noise instead of expensive snoise
                vec2 diff4 = pos.xy - uOrigins[3];
                float d4 = sqrt(dot(diff4, diff4));
                float att4 = 1.0 / (1.0 + d4 * 0.05);
                // Cheap pseudo-noise using sin combination
                float cheapNoise = sin(pos.x * 0.3 + uTime * 2.0) * sin(pos.y * 0.3 - uTime * 1.5);
                float shakeStrength = (b4 * 8.0) * att4;
                float w4 = cheapNoise * (b4 * 2.0) * att4;
                
                // Band 5: Sazanami (Hi-Hat) - SINGLE LAYER (removed sazanami2)
                vec2 diff5 = pos.xy - uOrigins[4];
                float d5 = sqrt(dot(diff5, diff5));
                float w5 = sin(d5 * 0.8 - uTime * 18.0) * (b5 * 3.0) / (1.0 + d5 * 0.15);

                // INTERFERENCE SUMMATION
                float elevation = w1 + w2 + w3 + w4 + w5;

                // APPLY DISPLACEMENT
                pos.z += elevation;
                
                // SIMPLIFIED Horizontal Shake - Use cheap sin-based displacement
                float shakeX = sin(pos.y * 0.15 + uTime * 3.0) * shakeStrength * 0.3;
                float shakeY = sin(pos.x * 0.15 - uTime * 2.5) * shakeStrength * 0.3;
                pos.x += shakeX;
                pos.y += shakeY;
                
                vElevation = elevation;
                vHigh = b5;
                vKick = b1;

                vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                vDepth = -mvPosition.z; 
                
                // Point Size - SIMPLIFIED (removed snoise)
                float energy = b1 + b2 + b3 + b4 + b5;
                // Use position-based variation instead of noise
                float pseudoRandom = 1.0 + sin(pos.x * 5.0) * sin(pos.y * 5.0) * 0.3;
                float sizeMod = 1.0 + (energy * 0.5) + (uKickImpulse * 1.5);
                
                gl_PointSize = (6.0 * pseudoRandom * sizeMod) * (60.0 / vDepth);

                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform float uGlobalOpacity;
            uniform float uKickImpulse;
            
            varying float vElevation;
            varying float vHigh;
            varying float vKick;
            varying float vDepth;

            void main() {
                vec2 uv = gl_PointCoord - 0.5;
                float r = length(uv);
                if (r > 0.5) discard;
                
                // Soft Glow
                float glow = exp(-(r*r) * 12.0); 

                // Color Mixing
                // Kick makes it redder/warmer (uColor1), Highs make it whiter/cooler (uColor2)
                float mixVal = smoothstep(-20.0, 50.0, vElevation + (vKick * 20.0));
                vec3 col = mix(uColor1, uColor2, mixVal);
                
                // --- BRIGHTNESS DRIVER ---
                // Global brightness is boosted by High Frequencies (vHigh = b5)
                float brightness = 1.0 + (vHigh * 5.0) + (uKickImpulse * 3.0);
                vec3 finalCol = col * brightness;
                
                // Deep Fog
                float fog = smoothstep(150.0, 20.0, vDepth); 
                
                gl_FragColor = vec4(finalCol, glow * uGlobalOpacity * 0.3 * fog); 
            }
        `,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending 
    });

    this.terrain = new THREE.Points(geometry, material);
    
    // Initial position (will be updated by crossfader in update())
    this.terrain.rotation.x = -0.8;
    this.terrain.position.y = -5;
    this.terrain.position.z = -45; 
    
    this.mesh.add(this.terrain);


}



    public update(dt: number, audioData: { low: number, high: number, kick: boolean, ai?: any, crossfader?: number }) {
        // --- CROSSFADER VIEW INTERPOLATION ---
        // Left (0): Bird's-eye view (俯瞰) - Looking down at the grid
        // Right (1): Horizon view (地平線) - Looking across the grid
        const cf = audioData.crossfader ?? 0.5;
        
        // Target values for each view
        // Bird's-eye: steep angle, higher position, closer
        const birdRotX = -1.3;  // ~-75 degrees
        const birdPosY = 10;
        const birdPosZ = -25;
        
        // Horizon: shallow angle, lower position, further
        const horizonRotX = -0.35; // ~-20 degrees
        const horizonPosY = -12;
        const horizonPosZ = -70;
        
        // Interpolate based on crossfader
        const targetRotX = birdRotX + (horizonRotX - birdRotX) * cf;
        const targetPosY = birdPosY + (horizonPosY - birdPosY) * cf;
        const targetPosZ = birdPosZ + (horizonPosZ - birdPosZ) * cf;
        
        // Smooth interpolation for camera movement
        const viewLerp = 0.05;
        this.currentRotX += (targetRotX - this.currentRotX) * viewLerp;
        this.currentPosY += (targetPosY - this.currentPosY) * viewLerp;
        this.currentPosZ += (targetPosZ - this.currentPosZ) * viewLerp;
        
        this.terrain.rotation.x = this.currentRotX;
        this.terrain.position.y = this.currentPosY;
        this.terrain.position.z = this.currentPosZ;
        
        // --- AUDIO-DRIVEN TIME with SMOOTHING ---
        // Smooth the time scale to prevent abrupt speed changes that cause jerky motion.
        const audioEnergy = Math.max(audioData.low, audioData.high);
        const targetTimeScale = 0.05 + audioEnergy * 0.95; // 5% base motion, 95% audio-driven
        
        // Smooth interpolation: 0.08 = ~12 frames to reach target (60fps)
        // This prevents sudden jumps in wave propagation speed
        this.currentTimeScale += (targetTimeScale - this.currentTimeScale) * 0.08;
        this.uniforms.uTime.value += dt * this.currentTimeScale;

        // --- IMPULSE LOGIC ---
        // Slower decay (0.94) allows the wave ripple to propagate further before fading
        this.impulseValue *= 0.94;
        
        // Kick Trigger
        if (audioData.low > 0.65) { 
            if (!this.kickActive) {
                this.kickActive = true;
                this.impulseValue = 1.0;
            }
        } else {
            this.kickActive = false;
        }
        
        // AI Energy Boost
        if (audioData.ai) {
             const { energy, cloud } = audioData.ai;
             // Add AI energy to impulse (subtle base swell)
             this.impulseValue = Math.max(this.impulseValue, energy * 0.5); 
        }

        // --- CPU-Side Wandering Origins ---
        // Spatially SEPARATED by frequency band for visual distinction
        const t = this.uniforms.uTime.value * 0.2; // Slow drift
        
        const origins = this.uniforms.uOrigins.value as THREE.Vector2[];
        
        // 1. KICK (Sub-Bass): Center area, circular orbit
        origins[0].set(
            Math.sin(t * 0.8) * 25,
            Math.cos(t * 0.6) * 25
        );
        
        // 2. BASS (Low-Mid): Left side, vertical drift
        origins[1].set(
            -70 + Math.sin(t * 0.5) * 15,
            Math.sin(t * 1.2) * 50
        );
        
        // 3. MID (Snare/Vox): Right side, vertical drift
        origins[2].set(
            70 + Math.sin(t * 0.6) * 15,
            Math.cos(t * 1.3) * 50
        );
        
        // 4. HIGH-MID (Lead): Top-left quadrant, diagonal drift
        origins[3].set(
            -50 + Math.sin(t * 1.0) * 30,
            60 + Math.cos(t * 0.9) * 25
        );
        
        // 5. HIGH (Hi-Hat): Bottom-right quadrant, diagonal drift
        origins[4].set(
            50 + Math.cos(t * 1.1) * 30,
            -60 + Math.sin(t * 1.0) * 25
        );

        // Send to Shader
        this.uniforms.uKickImpulse.value = this.impulseValue;
    }

    public setOpacity(alpha: number) {
        this.uniforms.uGlobalOpacity.value = alpha;

    }
}
