import * as THREE from 'three';

/**
 * Suibokuga (Ink Wash Painting) - Chaos Theory Fusion
 * Style: "Deep Water / Frosted Glass"
 * 
 * Logic:
 * 1. Audio Input -> Band Energy
 * 2. Agent Update -> Blending between Curl Noise (Fluid) and Clifford Attractor (Chaos)
 * 3. Ink Emission -> Soft Radial Gradients for "Deep Water" glow
 * 4. 3D Terrain -> Larger Plane for Full Screen Height
 */

// --- Noise Module (Reused for Natural Rhythm) ---
const PERM = new Uint8Array(512);
const GRAD3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
for(let i=0; i<512; i++) PERM[i] = Math.floor(Math.random()*255);
function dot(g: number[], x: number, y: number) { return g[0]*x + g[1]*y; }
function noise2D(x: number, y: number) {
    const F2 = 0.5*(Math.sqrt(3.0)-1.0);
    const s = (x+y)*F2;
    const i = Math.floor(x+s);
    const j = Math.floor(y+s);
    const G2 = (3.0-Math.sqrt(3.0))/6.0;
    const t = (i+j)*G2;
    const X0 = i-t;
    const Y0 = j-t;
    const x0 = x-X0;
    const y0 = y-Y0;
    let i1, j1;
    if(x0>y0) {i1=1; j1=0;} else {i1=0; j1=1;}
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0*G2;
    const y2 = y0 - 1.0 + 2.0*G2;
    const ii = i & 255;
    const jj = j & 255;
    const gi0 = PERM[ii+PERM[jj]] % 12;
    const gi1 = PERM[ii+i1+PERM[jj+j1]] % 12;
    const gi2 = PERM[ii+1+PERM[jj+1]] % 12;
    let t0 = 0.5 - x0*x0 - y0*y0;
    let n0 = 0, n1 = 0, n2 = 0;
    if(t0>=0) { t0 *= t0; n0 = t0 * t0 * dot(GRAD3[gi0], x0, y0); }
    let t1 = 0.5 - x1*x1 - y1*y1;
    if(t1>=0) { t1 *= t1; n1 = t1 * t1 * dot(GRAD3[gi1], x1, y1); }
    let t2 = 0.5 - x2*x2 - y2*y2;
    if(t2>=0) { t2 *= t2; n2 = t2 * t2 * dot(GRAD3[gi2], x2, y2); }
    return 70.0 * (n0 + n1 + n2);
}

function curlNoise(x: number, y: number, time: number) {
    const eps = 0.1;
    const n1 = noise2D(x + eps, y + time);
    const n2 = noise2D(x - eps, y + time);
    const n3 = noise2D(x, y + eps + time);
    const n4 = noise2D(x, y - eps + time);
    const a = (n1 - n2) / (2 * eps);
    const b = (n3 - n4) / (2 * eps);
    return { x: b, y: -a }; 
}

// --- CHAOS THEORY: Clifford Attractor Vector Field ---
function cliffordField(x: number, y: number, a: number, b: number, c: number, d: number) {
    const scale = 0.005; 
    const sx = (x - 512) * scale;
    const sy = (y - 512) * scale;
    
    const vx = Math.sin(a * sy) + c * Math.cos(a * sx);
    const vy = Math.sin(b * sx) + d * Math.cos(b * sy);
    
    return { x: vx, y: vy };
}

class BrushAgent {
    x: number;
    y: number;
    vx: number;
    vy: number;
    band: 'low' | 'mid' | 'high' | 'kick';
    brushSize: number = 5.0;
    
    a: number = 1.5;
    b: number = -1.8;
    c: number = 1.6;
    d: number = 0.9;

    constructor(width: number, height: number, band: 'low' | 'mid' | 'high' | 'kick') {
        this.band = band;
        this.spawn(width, height);
    }
    
    spawn(width: number, height: number) {
        const angle = Math.random() * Math.PI * 2;
        const rad = Math.random() * (height * 0.4); 
        this.x = (width/2) + Math.cos(angle) * rad;
        this.y = (height/2) + Math.sin(angle) * rad;
        this.vx = 0;
        this.vy = 0;
        // Larger base size for "Blurry/Frosted" look
        this.brushSize = (this.band === 'kick' || this.band === 'low') ? 8.0 : 4.0;
        
        this.a = 1.5 + (Math.random()-0.5) * 0.2;
        this.b = -1.8 + (Math.random()-0.5) * 0.2;
        this.c = 1.6 + (Math.random()-0.5) * 0.2;
        this.d = 0.9 + (Math.random()-0.5) * 0.2;
    }

    update(dt: number, width: number, height: number, energy: number, data: any, noiseTime: number) {
        const chaosLevel = (data.ai?.chaos || 0) * 0.8 + (data.high * 0.4); 

        // Curl Noise
        const scale = 0.003;
        const curl = curlNoise(this.x * scale, this.y * scale, noiseTime);
        
        // Clifford Attractor
        const timeFactor = noiseTime * 0.1;
        const ca = this.a + Math.sin(timeFactor) * 0.2;
        const cb = this.b + Math.cos(timeFactor * 0.9) * 0.2;
        const cc = this.c + energy * 0.5;
        const cd = this.d + energy * 0.5;
        
        const cliff = cliffordField(this.x, this.y, ca, cb, cc, cd);
        
        const blend = Math.min(Math.max((chaosLevel - 0.2) * 2.0, 0), 1.0);
        
        let fx = curl.x * (1.0 - blend) + cliff.x * blend;
        let fy = curl.y * (1.0 - blend) + cliff.y * blend;
        
        const forceScale = 200.0 + (energy * 300.0);
        fx *= forceScale;
        fy *= forceScale;

        if (this.band === 'kick' && data.kick) {
             fx += (Math.random()-0.5) * 3000;
             fy += (Math.random()-0.5) * 3000;
        }

        const friction = 0.92;
        this.vx += fx * dt;
        this.vy += fy * dt;
        this.vx *= friction;
        this.vy *= friction;
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        
        if (this.x < 0 || this.x > width || this.y < 0 || this.y > height) {
            this.spawn(width, height);
        }
    }

    draw(ctx: CanvasRenderingContext2D, energy: number, data: any) {
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        const maxSpeed = 400;
        const normSpeed = Math.min(speed / maxSpeed, 1.0);
        const chaos = (data.ai?.chaos || 0);

        // "Frosted Glass" = Soft Radial Gradients
        // Increase size significantly
        let size = this.brushSize * (2.0 + normSpeed * 2.0); 
        size *= (1 + energy * 2.0); // Pulse large
        
        // Very low alpha for "Deep Water" glow accumulation
        const alpha = 0.05 + (normSpeed * 0.1); 

        ctx.beginPath();
        const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, size);
        grad.addColorStop(0.0, `rgba(200, 220, 255, ${alpha})`); // Cyan/White tint for "Deep Water"
        grad.addColorStop(0.5, `rgba(100, 150, 255, ${alpha * 0.5})`);
        grad.addColorStop(1.0, `rgba(0, 0, 50, 0)`);
        
        ctx.fillStyle = grad;
        ctx.fillRect(this.x - size, this.y - size, size * 2, size * 2);
    }
}

export class SuibokugaViz {
    public mesh: THREE.Mesh;
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private texture: THREE.CanvasTexture;
    private uniforms: { [key: string]: THREE.IUniform };
    
    private agents: BrushAgent[] = [];
    private width: number = 1024;
    private height: number = 1024;
    private noiseTime: number = 0;
    
    constructor(spectrumTexture: THREE.DataTexture) {
        this.width = 1024;
        this.height = 1024;

        this.canvas = document.createElement('canvas');
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
        
        // DEEP WATER BACKGROUND
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        
        // --- SANSUIGA FUSION: 3D Terrain ---
        // Adjusted for proper Camera Frustum fit at Z = -60
        // Camera at Z=10. Dist = 70.
        // Vertical FOV 45. Visible Height approx 2 * 70 * tan(22.5) = ~58.
        // Plane needs to be roughly 100x70 to cover screen with buffer.
        // We use 140x100 to be safe and allow for some tilt.
        const geometry = new THREE.PlaneGeometry(160, 120, 100, 100);
        
        this.uniforms = {
            uTime: { value: 0 },
            uTexture: { value: this.texture },
            uSpectrum: { value: spectrumTexture },
            uGlobalOpacity: { value: 1.0 },
            uOrigins: { value: [
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0),
                new THREE.Vector2(0,0)
            ]}
        };

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: `
                uniform float uTime;
                uniform sampler2D uSpectrum;
                uniform sampler2D uTexture;
                uniform vec2 uOrigins[3];
                
                varying float vElevation;
                varying float vDepth;
                varying vec2 vUv;
                varying float vInk;

                void main() {
                    vUv = uv;
                    vec3 pos = position;
                    
                    float ink = texture2D(uTexture, uv).r;
                    vInk = ink;

                    // Wave motion
                    float b1 = texture2D(uSpectrum, vec2(0.05, 0.5)).r;
                    float b3 = texture2D(uSpectrum, vec2(0.40, 0.5)).r;
                    
                    // Subtle Breathing Undulation
                    float d1 = distance(pos.xy, uOrigins[0]);
                    float w1 = sin(d1 * 0.05 - uTime * 0.8) * (b1 * 5.0 + 2.0) * (1.0 / (1.0 + d1 * 0.01));
                    
                    float d3 = distance(pos.xy, uOrigins[1]);
                    float w3 = sin(d3 * 0.1 - uTime * 1.5) * (b3 * 4.0) * (1.0 / (1.0 + d3 * 0.04));
                    
                    float elevation = w1 + w3;
                    pos.z += elevation * (0.3 + ink * 0.5); // Less displacement
                    
                    vElevation = elevation;
                    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
                    vDepth = -mvPosition.z;
                    gl_Position = projectionMatrix * mvPosition;
                }
            `,
            fragmentShader: `
                uniform float uGlobalOpacity;
                uniform sampler2D uTexture;
                varying float vElevation;
                varying float vDepth;
                varying vec2 vUv;
                varying float vInk;

                void main() {
                    vec4 inkCol = texture2D(uTexture, vUv);
                    
                    // Fog start further back
                    float fog = smoothstep(120.0, 40.0, vDepth);
                    
                    // Subtler Highlights
                    float brightness = 0.9 + smoothstep(0.0, 10.0, vElevation) * 0.2;
                    
                    vec3 finalCol = inkCol.rgb * brightness;
                    
                    // Frosted Glow
                    float glow = 0.5 + vInk * 0.8;
                    
                    gl_FragColor = vec4(finalCol, inkCol.a * uGlobalOpacity * fog * glow);
                }
            `,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide
        });
        
        this.mesh = new THREE.Mesh(geometry, material);
        
        // Face camera directly (Wall) to ensure full height coverage without perspective skew clipping
        // Slight tilt for depth hint
        this.mesh.rotation.x = -Math.PI / 18.0; // -10 deg
        
        // Centered
        this.mesh.position.y = 0; 
        
        // Standard depth
        this.mesh.position.z = -60; 

        this.initAgents();
    }

    private initAgents() {
        this.agents = [];
        for(let i=0; i<8; i++) this.agents.push(new BrushAgent(this.width, this.height, 'kick'));
        for(let i=0; i<12; i++) this.agents.push(new BrushAgent(this.width, this.height, 'low'));
        for(let i=0; i<10; i++) this.agents.push(new BrushAgent(this.width, this.height, 'mid'));
        for(let i=0; i<10; i++) this.agents.push(new BrushAgent(this.width, this.height, 'high'));
    }
    
    public update(dt: number, audioData: { low: number, high: number, kick: boolean, ai?: any }) {
        const { low, high, kick } = audioData;
        const energy = (low + high) * 0.5;
        
        this.uniforms.uTime.value += dt;

        this.ctx.globalCompositeOperation = 'source-over';
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.03)';
        this.ctx.fillRect(0,0, this.width, this.height);
        
        this.texture.needsUpdate = true;

        // Origins for 3D Displacement (Wander)
        this.updateOrigins();

        if (energy < 0.002 && !kick && low < 0.002) return;
        
        this.noiseTime += dt * (0.1 + energy * 0.2);

        this.ctx.globalCompositeOperation = 'screen'; 
        this.agents.forEach(agent => {
            agent.update(dt, this.width, this.height, energy, audioData, this.noiseTime);
            agent.draw(this.ctx, energy, audioData);
        });
        
        this.ctx.globalCompositeOperation = 'source-over';
    }

    private updateOrigins() {
        const t = this.uniforms.uTime.value * 0.2;
        const origins = this.uniforms.uOrigins.value as THREE.Vector2[];
        origins[0].set(Math.sin(t * 0.8) * 20, Math.cos(t * 0.6) * 20);
        origins[1].set(40 + Math.sin(t * 0.5) * 15, Math.sin(t * 1.2) * 30);
        origins[2].set(-40 + Math.cos(t * 1.1) * 20, -30 + Math.sin(t * 1.0) * 20);
    }
    
    public setOpacity(alpha: number) {
        this.uniforms.uGlobalOpacity.value = alpha;
    }
    
    public setVisible(visible: boolean) {
        this.mesh.visible = visible;
    }
}
