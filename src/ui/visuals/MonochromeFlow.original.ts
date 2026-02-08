import * as THREE from 'three';

/**
 * Monochrome Flow -> Deep Flow
 * Complex vector field simulation (Curl Noise approximation).
 * Distinct behaviors for different frequency bands (Bass vs Treble particles).
 */
export class MonochromeFlow {
    public mesh: THREE.Points;
    
    private particles: THREE.Points;
    private particleCount = 6000;
    
    // 5 Bands:
    // 0: Low (0-10%)
    // 1: Low-Mid (10-30%)
    // 2: Mid (30-50%)
    // 3: Mid-High (50-70%)
    // 4: High (70-100%)
    private velocities: { 
        band: number; // 0..4
        baseSpeed: number; 
        life: number; 
    }[];
    
    private time = 0;

    constructor() {
        this.init();
    }

    private init() {
        // Soft Glow Texture
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
            const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1.0)');
            grad.addColorStop(0.2, 'rgba(200, 220, 255, 0.5)'); // Slightly blueish tint
            grad.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 64, 64);
        }
        const tex = new THREE.CanvasTexture(canvas);

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(this.particleCount * 3);
        const colors = new Float32Array(this.particleCount * 3);
        const sizes = new Float32Array(this.particleCount); // PointsMaterial doesn't support attr size, but we keep it just in case
        
        this.velocities = [];

        for (let i = 0; i < this.particleCount; i++) {
            // Spawn in a larger volume based on user request for "Drifting"
            const r = 150 * Math.cbrt(Math.random());
            const theta = Math.random() * 2 * Math.PI;
            const phi = Math.acos(2 * Math.random() - 1);
            
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);

            // Assign Band (0..4)
            // Weight towards lower bands for "Atmosphere"
            const rand = Math.random();
            let band = 0;
            if (rand < 0.2) band = 0;      // Low (Heavy)
            else if (rand < 0.4) band = 1; // Low-Mid
            else if (rand < 0.6) band = 2; // Mid
            else if (rand < 0.8) band = 3; // Mid-High
            else band = 4;                 // High (Sparkle)

            this.velocities.push({
                band: band,
                baseSpeed: 0.1 + Math.random() * 0.2 + (band * 0.1), // Higher bands faster
                life: Math.random()
            });
            
            // Base Color
            const c = 0.5 + Math.random() * 0.5;
            colors[i*3] = c; colors[i*3+1] = c; colors[i*3+2] = c;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.PointsMaterial({
            size: 2.0,
            map: tex,
            vertexColors: true,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        });

        this.particles = new THREE.Points(geometry, material);
        this.mesh = this.particles;
    }

    // Curl Noise Helper
    private curl(x: number, y: number, z: number, time: number): THREE.Vector3 {
        const s = 0.01; // Large, slow swirls (Drift feel)
        const tx = x * s + time * 0.02; 
        const ty = y * s;
        const tz = z * s;
        
        const vx = Math.sin(ty) - Math.cos(tz);
        const vy = Math.sin(tz) - Math.cos(tx);
        const vz = Math.sin(tx) - Math.cos(ty);
        
        return new THREE.Vector3(vx, vy, vz);
    }

    public update(dt: number, audioData: { low: number, high: number, kick: boolean, spectrum?: any, ai?: any }) {
        this.time += dt;
        
        // Calculate Band Intensities
        // Spectrum is 128 bins.
        const levels = [0, 0, 0, 0, 0];
        if (audioData.spectrum) {
            const s = audioData.spectrum; // Uint8Array or similar
            // Helper to avg
            const avg = (start: number, end: number) => {
                let sum = 0;
                const count = end - start;
                if (count <= 0) return 0;
                for(let i=start; i<end; i++) sum += s[i];
                return (sum / count) / 255.0;
            };
            // Boost Gain by 2.5x to ensure visible reaction
            const GAIN = 2.5; 
            levels[0] = Math.min(avg(0, 5) * GAIN, 1.0);    // Deep Bass (0-5)
            levels[1] = Math.min(avg(5, 20) * GAIN, 1.0);   // Bass/Low-Mid
            levels[2] = Math.min(avg(20, 50) * GAIN, 1.0);  // Mids
            levels[3] = Math.min(avg(50, 90) * GAIN, 1.0);  // High-Mids
            levels[4] = Math.min(avg(90, 128) * GAIN, 1.0); // Highs
        } else {
            // Fallback
            levels[0] = audioData.low; 
            levels[4] = audioData.high;
        }
        
        // AI Param Extraction
        let aiEnergy = 0;
        let aiChaos = 0;
        if (audioData.ai) {
             aiEnergy = audioData.ai.energy || 0;
             aiChaos = audioData.ai.chaos || 0;
        }

        const posAttr = this.particles.geometry.attributes.position;
        const colAttr = this.particles.geometry.attributes.color;
        
        // "Blue Flash" logic for High Band
        // More sensitive threshold + AI Chaos
        const isBlueFlash = levels[4] > 0.4 || aiChaos > 0.7; 
        const isRedFlash = levels[0] > 0.6 || aiEnergy > 0.8; // Deep bass rumble OR High Energy

        for (let i = 0; i < this.particleCount; i++) {
            const meta = this.velocities[i];
            const bandLevel = levels[meta.band];
            
            // Movement Logic
            const ix = i * 3;
            const x = posAttr.array[ix];
            const y = posAttr.array[ix+1];
            const z = posAttr.array[ix+2];
            
            // Dynamic Curl Scale based on Low Band (Turbulence)
            // If Bass is high, eddies get smaller and tighter (more chaos)
            // Default 0.01 -> 0.03 + AI Chaos
            const turbulence = 0.01 + (levels[0] * 0.03) + (aiChaos * 0.02);
            
            // Re-implement curl inline with dynamic scale
            // V = ( sin(y) - cos(z), sin(z) - cos(x), sin(x) - cos(y) )
            const s = turbulence;
            const tx = x * s + this.time * 0.05; 
            const ty = y * s;
            const tz = z * s;
            const vx = Math.sin(ty) - Math.cos(tz);
            const vy = Math.sin(tz) - Math.cos(tx); 
            const vz = Math.sin(tx) - Math.cos(ty);
            
            // Band-specific behavior
            let speed = meta.baseSpeed;
            let jitter = 0;
            
            if (meta.band === 0) {
                // Low: Heavy, slow, but reacts to Bass with sudden "Stops" or "Reverses"? 
                // Let's make them FLOW faster on Bass.
                // Huge multiplier: 1x -> 6x + AI Energy
                speed *= (1.0 + bandLevel * 5.0 + aiEnergy * 3.0);
            } else if (meta.band === 4) {
                // High: Jittery
                speed *= (1.0 + bandLevel * 2.0);
                // Jitter
                if (bandLevel > 0.1 || aiChaos > 0.3) {
                    jitter = bandLevel * 0.8 + aiChaos * 0.5; 
                }
            } else {
                // Mids: Standard flow acceleration
                speed *= (1.0 + bandLevel * 3.0 + aiEnergy * 1.0);
            }
            
            // Apply Velocity
            posAttr.array[ix]   += vx * 10.0 * speed * dt + (Math.random()-0.5)*jitter;
            posAttr.array[ix+1] += vy * 10.0 * speed * dt + (Math.random()-0.5)*jitter;
            posAttr.array[ix+2] += vz * 10.0 * speed * dt + (Math.random()-0.5)*jitter;
            
            // Respawn / Bounds
            const limit = 250;
            if (Math.abs(x) > limit || Math.abs(y) > limit || Math.abs(z) > limit) {
                posAttr.array[ix] = (Math.random()-0.5) * 200;
                posAttr.array[ix+1] = (Math.random()-0.5) * 200;
                posAttr.array[ix+2] = (Math.random()-0.5) * 200;
            }
            
            // Color Logic
            // Default: White/Grey based on band level
            let targetR = 0.5 + bandLevel * 0.5;
            let targetG = 0.5 + bandLevel * 0.5;
            let targetB = 0.5 + bandLevel * 0.5;
            
            // Blue Flash for High/MidHigh
            if (isBlueFlash && (meta.band === 4 || meta.band === 3)) {
                // Cyan Electric
                targetR = 0.0;
                targetG = 0.8;
                targetB = 1.0; 
            } 
            // Red/Deep Purple Flash for Bass (Subtle)
            else if (isRedFlash && meta.band === 0) {
                 targetR = 0.8;
                 targetG = 0.1;
                 targetB = 0.2;
            }
            
            // Smooth lerp color - Faster reaction (0.1 -> 0.2)
            const lerp = 0.2;
            colAttr.array[ix] += (targetR - colAttr.array[ix]) * lerp;
            colAttr.array[ix+1] += (targetG - colAttr.array[ix+1]) * lerp;
            colAttr.array[ix+2] += (targetB - colAttr.array[ix+2]) * lerp;
        }

        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
    }
    public setOpacity(alpha: number) {
        if (!this.mesh) return;
        const mat = this.mesh.material as THREE.PointsMaterial;
        mat.opacity = 0.8 * alpha;
    }
}
