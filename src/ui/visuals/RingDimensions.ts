import * as THREE from 'three';

/**
 * RingDimensions (Genome Ring) - Score Style
 * "Minimal Music Score" Circular Visualization.
 * 
 * Concept:
 * - 5 Concentric Rings (Bass -> High)
 * - Time Axis: Circumference represents a timeline (History).
 * - Width: Expands based on volume value stored in history texture.
 * - Gap: Threshold cuts off low volume, creating "broken" rings.
 * - Depth: Crossfader expands ring spacing in Z.
 * - Monochrome: Strict Grey/White palette.
 */
export class RingDimensions {
    public mesh: THREE.Group;
    
    // Components
    private ringMeshes: THREE.Mesh[] = [];
    private cilia: THREE.LineSegments;
    private particulates: THREE.Points;

    // Data/State
    private historySize = 256; // Timeline resolution (segments)
    private historyData: Uint8Array;
    private historyTexture: THREE.DataTexture;
    
    // Uniforms
    private uniforms: { [key: string]: THREE.IUniform };
    private ringUniforms: {
        uHistory: { value: THREE.DataTexture };
        uTime: { value: number };
        uSpacing: { value: number }; // Controlled by Crossfader
        uGlobalOpacity: { value: number };
    };

    constructor(spectrumTexture: THREE.DataTexture) {
        this.mesh = new THREE.Group();
        
        // 1. Setup History Texture (5 Bands x 256 Time steps)
        // 5 rows, 256 cols.
        this.historyData = new Uint8Array(256 * 5); // 5 Rows
        this.historyTexture = new THREE.DataTexture(
            this.historyData, 
            256, 
            5, 
            THREE.RedFormat, 
            THREE.UnsignedByteType
        );
        this.historyTexture.magFilter = THREE.NearestFilter;
        this.historyTexture.minFilter = THREE.NearestFilter;
        this.historyTexture.needsUpdate = true;

        this.ringUniforms = {
            uHistory: { value: this.historyTexture },
            uTime: { value: 0 },
            uSpacing: { value: 0.5 }, 
            uGlobalOpacity: { value: 0.0 }
        };

        // Shared API Uniforms
        this.uniforms = {
            uTime: this.ringUniforms.uTime,
            uGlobalOpacity: this.ringUniforms.uGlobalOpacity
        };

        this.initRings();
        this.initCilia();
        this.initParticulates();
        
        this.mesh.rotation.x = 0; 
    }

    private initRings() {
        const bands = 5;
        this.ringMeshes = [];

        // Colors (Monochrome - Darker Highs)
        const colors = [
            new THREE.Color(0x111111), // Bass (Very dark)
            new THREE.Color(0x333333),
            new THREE.Color(0x555555),
            new THREE.Color(0x777777),
            new THREE.Color(0x999999)  // High (Not pure white)
        ];

        // Base Radii (All inside Cilia r=2.0)
        // Cilia is 2.0.
        const radii = [0.7, 0.9, 1.1, 1.3, 1.5];

        const segments = 256; 

        for(let i=0; i<bands; i++) {
            // ... (Geometry creation same as before)
            const geometry = new THREE.BufferGeometry();
            const indices = [];
            const positions = [];
            const uvs = [];

            for(let s=0; s<=segments; s++) {
                const u = s / segments;
                const angle = u * Math.PI * 2;
                positions.push(angle, -0.5, 0);
                positions.push(angle,  0.5, 0);
                uvs.push(u, 0);
                uvs.push(u, 1);
                if(s < segments) {
                    const base = s * 2;
                    indices.push(base, base+1, base+2);
                    indices.push(base+2, base+1, base+3);
                }
            }
            
            geometry.setIndex(indices);
            geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));

            const material = new THREE.ShaderMaterial({
                uniforms: {
                    ...this.ringUniforms,
                    uColor: { value: colors[i] },
                    uBandRow: { value: (i + 0.5) / 5.0 }, 
                    uBaseRadius: { value: radii[i] },
                    uBaseZ: { value: 0 }, 
                },
                vertexShader: `
                    uniform sampler2D uHistory;
                    uniform float uBandRow;
                    uniform float uBaseRadius;
                    uniform float uBaseZ;
                    
                    varying float vVol;
                    varying vec2 vUv;
                    
                    void main() {
                        vUv = uv;
                        // Nearest sampling for sharp barcode edges
                        float vol = texture2D(uHistory, vec2(uv.x, uBandRow)).r;
                        vVol = vol;
                        float angle = position.x; 
                        float widthInfo = position.y; 
                        
                        // Fixed Thickness for "Stave" look (Circular Staff)
                        float thickness = 0.12; 
                        float r = uBaseRadius + widthInfo * thickness;
                        vec3 pos = vec3(cos(angle) * r, sin(angle) * r, uBaseZ);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                    }
                `,
                fragmentShader: `
                    uniform vec3 uColor;
                    uniform float uGlobalOpacity;
                    varying float vVol;
                    varying vec2 vUv;
                    
                    void main() {
                        // 1. Center Guide Line (Always Visible) - Pure White
                        float centerDist = abs(vUv.y - 0.5);
                        float line = 1.0 - smoothstep(0.02, 0.025, centerDist); // Sharp 1px-ish line
                        
                        // 2. Barcode Segments (Thresholded)
                        float threshold = 0.15; 
                        float isBar = step(threshold, vVol);
                        
                        // 3. Color/Brightness Logic
                        // Base Color (Frequency Gray) + Volume boost
                        // We want high volume to be brighter gray/white.
                        vec3 barColor = uColor + vec3(vVol * 0.6); 
                        
                        // Combine: Line is white, Bar is Gray-ish
                        // Line overlays bar.
                        vec3 finalColor = mix(barColor, vec3(1.0), line);
                        
                        // Alpha:
                        // Line is always visible (alpha ~0.4 base)
                        // Bar is visible only if > threshold
                        float lineVisibility = 0.4;
                        float finalAlpha = max(line * lineVisibility, isBar);
                        
                        // Time Fade at edges (Timeline loop)
                        float timeFade = min(smoothstep(0.0, 0.05, vUv.x), smoothstep(1.0, 0.95, vUv.x));
                        finalAlpha *= timeFade * uGlobalOpacity;

                        if (finalAlpha < 0.01) discard;

                        gl_FragColor = vec4(finalColor, finalAlpha);
                    }
                `,
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false, 
                blending: THREE.AdditiveBlending 
            });
            
            const mesh = new THREE.Mesh(geometry, material);
            this.ringMeshes.push(mesh);
            this.mesh.add(mesh);
        }
    }

    private scrollAcc: number = 0;

    public update(dt: number, audioData: { low: number, high: number, kick: boolean, spectrum?: any, crossfader?: number, ai?: any }) {
        this.uniforms.uTime.value += dt;
        
        // 1. Calculate 5 Current Levels
        const currentLevels = [0,0,0,0,0];
        if (audioData.spectrum) {
            const s = audioData.spectrum; 
            const avg = (start: number, end: number) => {
                let sum = 0; const count = end-start;
                if(count<=0)return 0;
                for(let i=start; i<end; i++) sum += s[i];
                return (sum/count)/255.0;
            };
            currentLevels[0] = avg(0, 5);
            currentLevels[1] = avg(5, 20);
            currentLevels[2] = avg(20, 50);
            currentLevels[3] = avg(50, 90);
            currentLevels[4] = avg(90, 128);
        } else {
             currentLevels[0] = audioData.low; 
             currentLevels[4] = audioData.high;
        }

        // 2. Update History Texture (Fixed Step for Stability)
        // User asked if BPM synced - we simulate a stable "Clock" here.
        this.scrollAcc += dt;
        const step = 0.03; // ~33 FPS update rate for history (Slower scroll)
        
        if (this.scrollAcc >= step) {
            this.scrollAcc = 0; // Reset
            
            const w = 256;
            const d = this.historyData;
            
            for(let i=0; i<5; i++) {
                const rowOffset = i * w;
                // Shift Left
                d.copyWithin(rowOffset, rowOffset + 1, rowOffset + w);
                // Write Newest at End
                d[rowOffset + w - 1] = Math.floor(currentLevels[i] * 255);
            }
            this.historyTexture.needsUpdate = true;
        }

        // 3. Update Radius Pulse & Z-Spacing
        let spacing = 0.5;
        if (audioData.crossfader !== undefined) {
             this.ringUniforms.uSpacing.value = audioData.crossfader * 5.0; 
             spacing = this.ringUniforms.uSpacing.value;
        }
        
        // AI Param Extraction
        let aiEnergy = 0;
        let aiChaos = 0;
        if (audioData.ai) {
            aiEnergy = audioData.ai.energy || 0;
            aiChaos = audioData.ai.chaos || 0;
        }

        this.ringMeshes.forEach((mesh, i) => {
            const mat = mesh.material as THREE.ShaderMaterial;
            
            // Z-Spacing
            mat.uniforms.uBaseZ.value = (i - 2) * spacing;
            
            // Radius Pulse
            const baseR = 0.7 + i * 0.2; // New Smaller Radii
            const vol = currentLevels[i];
            
            // Dynamic expansion: Audio Vol + AI Energy
            const pulse = vol * 0.3 + (aiEnergy * 0.2); 
            mat.uniforms.uBaseRadius.value = baseR + pulse;

            // --- Rotation Logic ---
            const dir = (i % 2 === 0) ? 1 : -1;
            const baseSpeed = 0.05 * dir; // Slower Base Speed
            
            // Boost speed with energy
            // Mix Audio and AI Energy
            let speed = baseSpeed + (vol * 2.0 * dir) + (aiEnergy * 0.5 * dir);
            
            // "Reverse Rotation" on high energy
            if (vol > 0.7 || aiChaos > 0.6) {
                speed *= -1.5; 
            }
            
            mesh.rotation.z += speed * dt;
        });

        // 4. Update Cilia/Particles (Optimized Shader Animation)
        if (this.cilia) {
            this.cilia.rotation.z += 0.005 * dt + (aiEnergy * 0.02 * dt); // AI Drift
            
            const mat = this.cilia.material as THREE.ShaderMaterial;
            if (mat.uniforms) {
                mat.uniforms.uLow.value = currentLevels[0] + aiEnergy * 0.2;
                mat.uniforms.uHigh.value = currentLevels[4] + aiChaos * 0.2;
            }
        }
        
        if (this.particulates) {
             this.particulates.rotation.z += (0.02 + aiEnergy * 0.1) * dt;
        }
    }

    private initCilia() {
        // "Delicate hairs" - Optimized with Shader
        const count = 1200;
        const r = 2.0; 
        
        const positions = [];
        const tips = [];
        
        for(let i=0; i<count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const len = 0.1 + Math.random() * 0.15;
            
            // p1 (Root)
            const x1 = Math.cos(angle)*r;
            const y1 = Math.sin(angle)*r;
            const z1 = 0;
            
            // p2 (Tip)
            const x2 = Math.cos(angle)*(r+len);
            const y2 = Math.sin(angle)*(r+len);
            const z2 = 0;
            
            positions.push(x1, y1, z1);
            tips.push(0.0);
            
            positions.push(x2, y2, z2);
            tips.push(1.0);
        }
        
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('aTip', new THREE.Float32BufferAttribute(tips, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: new THREE.Color(0x88ccff) },
                uGlobalOpacity: this.ringUniforms.uGlobalOpacity,
                uTime: this.uniforms.uTime,
                uLow: { value: 0 },
                uHigh: { value: 0 }
            },
            vertexShader: `
                attribute float aTip;
                uniform float uTime;
                uniform float uLow;
                uniform float uHigh;
                
                vec3 hash(vec3 p) {
                    p = vec3( dot(p,vec3(127.1,311.7, 74.7)),
                              dot(p,vec3(269.5,183.3,246.1)),
                              dot(p,vec3(113.5,271.9,124.6)));
                    return -1.0 + 2.0*fract(sin(p)*43758.5453123);
                }

                void main() {
                    vec3 pos = position;
                    
                    if (aTip > 0.5) {
                        float extend = uLow * 0.3; 
                        vec3 dir = normalize(pos); // Radial direction
                        pos += dir * extend;
                        
                        float jitterAmt = 0.02 + uHigh * 0.1;
                        vec3 noise = hash(position + vec3(0,0,uTime * 10.0)) * jitterAmt;
                        pos += noise;
                    }
                    
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 uColor;
                uniform float uGlobalOpacity;
                
                void main() {
                    gl_FragColor = vec4(uColor, 0.15 * uGlobalOpacity);
                }
            `,
            transparent: true,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        
        this.cilia = new THREE.LineSegments(geometry, material);
        this.mesh.add(this.cilia);
    }

    private initParticulates() {
        // "Fuzzy/Hazy feel" - Twinkling
        const count = 500;
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(count * 3);
        const sizes = new Float32Array(count);
        const bandPos = new Float32Array(count);
        
        for(let i=0; i<count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const rBase = 2.0;
            const rOffset = (Math.random() - 0.5) * 0.8; 
            const r = rBase + rOffset;
            
            positions[i*3+0] = Math.cos(angle) * r;
            positions[i*3+1] = Math.sin(angle) * r;
            positions[i*3+2] = (Math.random() - 0.5) * 0.5; 
            
            sizes[i] = Math.random();
            
            // Assign random band (0..4) -> Texture V coord (0.1, 0.3...)
            const band = Math.floor(Math.random() * 5);
            bandPos[i] = (band + 0.5) / 5.0;
        }
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        geometry.setAttribute('aBandPos', new THREE.BufferAttribute(bandPos, 1));
        
        const material = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0xffffff) },
                uGlobalOpacity: this.ringUniforms.uGlobalOpacity,
                uHistory: { value: this.historyTexture }
            },
            vertexShader: `
                attribute float size;
                attribute float aBandPos;
                uniform float uGlobalOpacity;
                uniform sampler2D uHistory;
                varying float vVol;
                
                void main() {
                    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
                    gl_PointSize = size * ( 20.0 / -mvPosition.z );
                    gl_Position = projectionMatrix * mvPosition;
                    
                    // Sample current volume from history (newest pixel at UV.x=1.0)
                    vVol = texture2D(uHistory, vec2(1.0, aBandPos)).r;
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                uniform float uGlobalOpacity;
                varying float vVol;
                
                void main() {
                    float r = distance(gl_PointCoord, vec2(0.5));
                    if(r > 0.5) discard;
                    
                    // Twinkle Logic
                    // Large volume -> High Opacity "Sparkle"
                    float flash = vVol * 3.0; 
                    float intensity = 0.2 + flash; 
                    
                    float alpha = (1.0 - (r*2.0)) * intensity * uGlobalOpacity;
                    gl_FragColor = vec4( color, clamp(alpha, 0.0, 1.0) );
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending
        });
        
        this.particulates = new THREE.Points(geometry, material);
        this.mesh.add(this.particulates);
    }

    public setOpacity(alpha: number) {
        this.ringUniforms.uGlobalOpacity.value = alpha;
        
        if (this.cilia) (this.cilia.material as THREE.LineBasicMaterial).opacity = 0.15 * alpha;
        // Particulates use uniform uGlobalOpacity linked above
    }
}
