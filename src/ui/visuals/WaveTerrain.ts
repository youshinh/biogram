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
    public mesh: THREE.Points;
    private uniforms: { [key: string]: THREE.IUniform };
    
    constructor(spectrumTexture: THREE.DataTexture) {
        this.init(spectrumTexture);
    }

    private init(spectrumTexture: THREE.DataTexture) {
        // High density grid
        const geometry = new THREE.PlaneGeometry(240, 240, 200, 200);

        this.uniforms = {
            uTime: { value: 0 },
            uSpectrum: { value: spectrumTexture },
            uGlobalOpacity: { value: 1.0 },
            uColor1: { value: new THREE.Color(0x00aaff) }, 
            uColor2: { value: new THREE.Color(0xffffff) }  
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform float uTime;
                uniform sampler2D uSpectrum;
                
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
                    
                    // --- Sample Spectrum Bands ---
                    float kick = texture2D(uSpectrum, vec2(0.05, 0.5)).r;
                    float bass = texture2D(uSpectrum, vec2(0.15, 0.5)).r;
                    float hat = texture2D(uSpectrum, vec2(0.9, 0.5)).r;

                    // --- CHAIN REACTION (Domain Warping) ---
                    // 1. Base "Dark Matter" Movement
                    // This invisible flow drags the visible particles
                    vec2 flowBase = vec2(pos.x * 0.01 + uTime * 0.02, pos.y * 0.01);
                    float influence = snoise(flowBase) * 10.0;
                    
                    // Warp the coordinate space for subsequent layers
                    vec2 warpedPos = pos.xy + vec2(influence, influence * 0.5);
                    
                    // --- MOVEMENT ---
                    // 2. Breath (Swelling) uses warped coordinates
                    float breath = 1.0 + (bass * 2.0); 
                    float sway = snoise(warpedPos * 0.02) * 10.0 * breath;
                    pos.x += sway;
                    pos.y += sway;

                    // 3. Shockwave (Kick Propagation)
                    float d = length(pos.xy);
                    float pulse = sin(d * 0.1 - uTime * 1.5);
                    float shock = pulse * kick * 15.0 * smoothstep(100.0, 0.0, d); // Stronger at center

                    // 4. Resonance (Chain Reaction Jitter)
                    float resonance = snoise(warpedPos * 0.1 + uTime) * hat * 3.0;

                    // Combine Elevation
                    float w1 = sin(warpedPos.x * 0.03 + uTime * 0.5) * 5.0;
                    float w2 = cos(warpedPos.y * 0.03 + uTime * 0.3) * 5.0;
                    
                    float elevation = w1 + w2 + shock + resonance;
                    pos.z += elevation;
                    
                    vElevation = elevation;
                    vHigh = hat;
                    vKick = kick;

                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    vDepth = -mvPosition.z; 
                    
                    // Sparkle Size
                    float randomSize = 1.0 + snoise(pos.xy * 0.5) * 0.5;
                    float sparkle = 1.0 + (hat * 4.0 * randomSize);
                    
                    float baseSize = 15.0; 
                    gl_PointSize = (baseSize * sparkle) * ( 60.0 / vDepth );

                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform vec3 uColor1;
                uniform vec3 uColor2;
                uniform float uGlobalOpacity;
                
                varying float vElevation;
                varying float vHigh;
                varying float vKick;
                varying float vDepth;

                void main() {
                    vec2 uv = gl_PointCoord - 0.5;
                    float r = length(uv);
                    if (r > 0.5) discard;
                    
                    // Gaussian Blur Glow
                    float glow = exp(-(r*r) * 16.0); 

                    // Color
                    float mixVal = smoothstep(-10.0, 30.0, vElevation);
                    vec3 col = mix(uColor1, uColor2, mixVal);
                    
                    col += vec3(vHigh * 0.4); 
                    col += vec3(vKick * 0.3);
                    
                    // --- Depth Fog ---
                    float fog = smoothstep(120.0, 40.0, vDepth); 
                    
                    gl_FragColor = vec4(col, glow * uGlobalOpacity * 0.15 * fog); 
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending 
        });

        this.mesh = new THREE.Points(geometry, material);
        
        this.mesh.rotation.x = -Math.PI / 2.5; 
        this.mesh.position.y = -20;
        this.mesh.position.z = -50; 
    }

    public update(dt: number, audioData: { low: number, high: number, kick: boolean }) {
        this.uniforms.uTime.value += dt;
        this.mesh.rotation.z += 0.002 * dt; 
    }

    public setOpacity(alpha: number) {
        this.uniforms.uGlobalOpacity.value = alpha;
    }
}
