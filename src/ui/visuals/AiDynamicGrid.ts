import * as THREE from 'three';

// --- Type Definitions based on Design Proposal ---

export type GridShape = "sphere" | "torus" | "cylinder" | "wobble";

export type WaveFunc = "sine" | "sawtooth" | "noise" | "pulse";

export type ColorScheme = "monochrome" | "complementary" | "gradient";

export interface AiGridParams {
    geometry: {
        shape: GridShape;
        radius: number;
        twist: number; // Y-axis twist amount
    };
    wave: {
        func: WaveFunc;
        frequency: number; // Space frequency
        speed: number;     // Time frequency
        amplitude: number; // Strength
        complexity: number; // Harmonics or Noise detail
    };
    material: {
        blurStrength: number; // 0.0 (Sharp) - 1.0 (Fuzzy)
        coreOpacity: number;
        glowOpacity: number;
        color: string; // Hex color for primary
        secondaryColor?: string; // Hex color for secondary (used in gradient)
    };
}

// Default Configuration
const DEFAULT_PARAMS: AiGridParams = {
    geometry: {
        shape: "sphere",
        radius: 2.0,
        twist: 0.0,
    },
    wave: {
        func: "sine",
        frequency: 4.0,
        speed: 1.0,
        amplitude: 0.1,
        complexity: 0.0,
    },
    material: {
        blurStrength: 0.5,
        coreOpacity: 0.2,
        glowOpacity: 0.5,
        color: "#ffffff",
    }
};

/**
 * AiDynamicGrid
 * 
 * 構造化されたパラメータ(JSON)によって、
 * 形状・動き・質感をリアルタイムに変容させるビジュアライザー。
 * 
 * SpectrumGridのトポロジー(Line Loop)を再利用し、
 * Vertex Shader的な座標変換をCPU側(JS)で実行して形状モーフィングを行う。
 */
export class AiDynamicGrid {
    public mesh: THREE.Group;
    
    private coreLines: THREE.Line[] = [];
    private glowLines: THREE.Line[] = [];
    
    // Topology Constants
    private lineCount = 64; 
    private pointsPerLine = 128; 
    
    // State
    private time = 0;
    private params: AiGridParams = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    
    // Transition Target (for smooth parameter morphing)
    private targetParams: AiGridParams = JSON.parse(JSON.stringify(DEFAULT_PARAMS));
    
    // Base coordinates repository (Normalized UV: [u, v])
    // u: 0->1 (along line), v: 0->1 (line index)
    private baseUVs: {u: number, v: number}[][] = [];

    // Helper Objects
    private rotVelocity = new THREE.Vector3();
    private kickImpulse = 0;

    constructor() {
        this.mesh = new THREE.Group();
        this.init();
    }

    private init() {
        // Materials (Initial setup)
        const coreMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
        });

        const glowMaterial = new THREE.LineBasicMaterial({
            color: 0xaaddff,
            transparent: true,
            opacity: 0.5,
            blending: THREE.AdditiveBlending,
        });

        // Create Grid Topology
        for (let lineIdx = 0; lineIdx < this.lineCount; lineIdx++) {
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array((this.pointsPerLine + 1) * 3);
            
            const lineUVs: {u: number, v: number}[] = [];
            
            // Normalized V coordinate (0.0 to 1.0)
            const v = lineIdx / (this.lineCount - 1);

            for (let i = 0; i <= this.pointsPerLine; i++) {
                // Normalized U coordinate (0.0 to 1.0)
                const u = i / this.pointsPerLine;
                lineUVs.push({u, v});

                // Init with zero positions, will be set in update()
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
            }
            this.baseUVs.push(lineUVs);

            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

            // Core
            const coreLine = new THREE.Line(geometry.clone(), coreMaterial.clone());
            this.coreLines.push(coreLine);
            this.mesh.add(coreLine);

            // Glow
            const glowLine = new THREE.Line(geometry.clone(), glowMaterial.clone());
            this.glowLines.push(glowLine);
            this.mesh.add(glowLine);
        }
    }

    /**
     * 外部からJSONパラメータを受け取るメソッド
     * 
     * @param newParams Partial override of parameters
     */
    public setParams(newParams: Partial<AiGridParams>) { // Using DeepPartial ideally
        // Simple distinct merge for levels
        if (newParams.geometry) Object.assign(this.targetParams.geometry, newParams.geometry);
        if (newParams.wave) Object.assign(this.targetParams.wave, newParams.wave);
        if (newParams.material) Object.assign(this.targetParams.material, newParams.material);
        
        // Note: In a real implementation, we should lerp values in update()
        // but for boolean/string switches, we might switch immediately or handled specially.
        // For now, strings are switched immediately in update logic if we implemented smooth strings? (No, strings distinct).
        
        // Immediate apply for non-numeric types for safety, or handle in update
        this.targetParams.geometry.shape = newParams.geometry?.shape || this.targetParams.geometry.shape;
        this.targetParams.wave.func = newParams.wave?.func || this.targetParams.wave.func;
        this.targetParams.material.color = newParams.material?.color || this.targetParams.material.color;
        this.targetParams.material.secondaryColor = newParams.material?.secondaryColor || this.targetParams.material.secondaryColor;
    }

    /**
     * パラメータを徐々にターゲットに近づける (Lerp)
     */
    private updateParamsLerp(dt: number) {
        const lerpFactor = dt * 2.0; // Speed of morphing

        // Geometry
        this.params.geometry.radius += (this.targetParams.geometry.radius - this.params.geometry.radius) * lerpFactor;
        this.params.geometry.twist += (this.targetParams.geometry.twist - this.params.geometry.twist) * lerpFactor;
        this.params.geometry.shape = this.targetParams.geometry.shape; // String switch immediate

        // Wave
        this.params.wave.frequency += (this.targetParams.wave.frequency - this.params.wave.frequency) * lerpFactor;
        this.params.wave.speed += (this.targetParams.wave.speed - this.params.wave.speed) * lerpFactor;
        this.params.wave.amplitude += (this.targetParams.wave.amplitude - this.params.wave.amplitude) * lerpFactor;
        this.params.wave.complexity += (this.targetParams.wave.complexity - this.params.wave.complexity) * lerpFactor;
        this.params.wave.func = this.targetParams.wave.func;

        // Material
        this.params.material.blurStrength += (this.targetParams.material.blurStrength - this.params.material.blurStrength) * lerpFactor;
        this.params.material.coreOpacity += (this.targetParams.material.coreOpacity - this.params.material.coreOpacity) * lerpFactor;
        this.params.material.glowOpacity += (this.targetParams.material.glowOpacity - this.params.material.glowOpacity) * lerpFactor;
        // Color lerp is complex, skipping for now (just immediate switch)
        this.params.material.color = this.targetParams.material.color;
    }

    public update(dt: number, audioData: { low: number, high: number, kick: boolean, spectrum?: any }) {
        this.time += dt;
        this.updateParamsLerp(dt); // Morph parameters

        // --- Physics & Audio Reaction ---
        // Audio Level Map (Simplified)
        let levels: number[] = [];
        if (audioData.spectrum) {
            const binSize = Math.floor(128 / this.lineCount);
            for(let i=0; i<this.lineCount; i++) {
                let sum = 0;
                for(let k=0; k<binSize; k++) sum += audioData.spectrum[i*binSize + k] || 0;
                levels.push((sum/binSize)/255.0);
            }
        } else {
             // Fallback
             levels = new Array(this.lineCount).fill(audioData.low);
        }

        // Kick Impulse
        if (audioData.kick) {
            this.kickImpulse = 1.0;
        }
        this.kickImpulse *= 0.9; // Decay

        // Rotation
        this.mesh.rotation.y += dt * 0.1;

        // --- Geometry Generation ---
        const p = this.params;
        const colorObj = new THREE.Color(p.material.color);

        for (let lineIdx = 0; lineIdx < this.lineCount; lineIdx++) {
            const coreLine = this.coreLines[lineIdx];
            const glowLine = this.glowLines[lineIdx];
            const corePos = coreLine.geometry.attributes.position;
            const glowPos = glowLine.geometry.attributes.position;

            const uvs = this.baseUVs[lineIdx];
            const level = levels[lineIdx] || 0;

            // Material Update
            const coreMat = coreLine.material as THREE.LineBasicMaterial;
            const glowMat = glowLine.material as THREE.LineBasicMaterial;
            
            // Blur / Fuzzy Logic
            // If blurStrength is high, core opacity drops, glow jitter increases
            const fuzziness = p.material.blurStrength;
            
            coreMat.color = colorObj;
            coreMat.opacity = p.material.coreOpacity * (1.0 - fuzziness * 0.8) + (level * 0.2);
            
            glowMat.color = colorObj;
            glowMat.opacity = p.material.glowOpacity * (0.5 + level * 0.5);

            for (let i = 0; i <= this.pointsPerLine; i++) {
                // UV
                const u = uvs[i].u; // 0..1 around shape
                const v = uvs[i].v; // 0..1 vertical steps

                // 1. Calculate Base Position based on Shape
                let x=0, y=0, z=0;
                let nx=0, ny=1, nz=0; // Normal

                if (p.geometry.shape === 'sphere') {
                    // Sphere Mapping
                    const phi = (v - 0.5) * Math.PI * 0.95; // Latitude
                    const theta = u * Math.PI * 2;          // Longitude
                    const r = p.geometry.radius;

                    x = r * Math.cos(phi) * Math.cos(theta);
                    y = r * Math.sin(phi);
                    z = r * Math.cos(phi) * Math.sin(theta);
                    
                    // Sphere Normal is just normalized pos
                    nx = x/r; ny = y/r; nz = z/r;

                } else if (p.geometry.shape === 'torus') {
                    // Torus Mapping
                    const R = p.geometry.radius;     // Major Radius
                    const r = p.geometry.radius * 0.3; // Minor Radius
                    const tubeAngle = v * Math.PI * 2;
                    const mainAngle = u * Math.PI * 2;
                    
                    x = (R + r * Math.cos(tubeAngle)) * Math.cos(mainAngle);
                    z = (R + r * Math.cos(tubeAngle)) * Math.sin(mainAngle);
                    y = r * Math.sin(tubeAngle);
                    
                    // Normal approx (radial from tube center)
                    const cx = R * Math.cos(mainAngle);
                    const cz = R * Math.sin(mainAngle);
                    nx = x - cx; ny = y; nz = z - cz;
                    const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
                    nx/=nLen; ny/=nLen; nz/=nLen;

                } else if (p.geometry.shape === 'cylinder') {
                     // Cylinder
                     const r = p.geometry.radius;
                     const theta = u * Math.PI * 2;
                     const height = p.geometry.radius * 2.5;
                     
                     x = r * Math.cos(theta);
                     z = r * Math.sin(theta);
                     y = (v - 0.5) * height;
                     
                     nx = Math.cos(theta); ny = 0; nz = Math.sin(theta);
                } else {
                    // Wobble / Abstract
                    x = (u - 0.5) * 10;
                    y = (v - 0.5) * 5;
                    z = 0;
                    nx = 0; ny = 0; nz = 1;
                }

                // Apply Twist
                if (p.geometry.twist !== 0) {
                    const twistAngle = y * p.geometry.twist;
                    const tx = x * Math.cos(twistAngle) - z * Math.sin(twistAngle);
                    const tz = x * Math.sin(twistAngle) + z * Math.cos(twistAngle);
                    x = tx; z = tz;
                }

                // 2. Calculate Wave Displacement
                // Use Function Composer logic
                let waveVal = 0;
                const phase = this.time * p.wave.speed + v * 2.0; // Base phase animation
                const space = u * p.wave.frequency * Math.PI * 2; // Spatial frequency

                if (p.wave.func === 'sine') {
                    waveVal = Math.sin(space + phase);
                } else if (p.wave.func === 'sawtooth') {
                    // Approx sawtooth
                    waveVal = (space + phase) % (Math.PI*2) / Math.PI - 1.0;
                } else if (p.wave.func === 'noise') {
                    // Simple pseudo-random noise
                    waveVal = Math.sin(space * 3.4 + phase) * 0.5 + Math.cos(space * 1.5 - phase * 0.5) * 0.5;
                } else if (p.wave.func === 'pulse') {
                    waveVal = Math.sin(space + phase) > 0.0 ? 1.0 : -1.0;
                }

                // Audio Modulation
                const audioMod = level * 2.0 + this.kickImpulse * (v > 0.4 && v < 0.6 ? 2.0 : 0.5);
                
                const displacement = waveVal * p.wave.amplitude * audioMod;

                // Apply Displacement along Normal
                const dx = nx * displacement;
                const dy = ny * displacement;
                const dz = nz * displacement;

                // 3. Update Buffers
                
                // Core Position
                corePos.array[i * 3]     = x + dx;
                corePos.array[i * 3 + 1] = y + dy;
                corePos.array[i * 3 + 2] = z + dz;

                // Glow Position (with fuzziness jitter)
                const jitterAmp = fuzziness * (0.1 + level * 0.2);
                const jx = (Math.random() - 0.5) * jitterAmp;
                const jy = (Math.random() - 0.5) * jitterAmp;
                const jz = (Math.random() - 0.5) * jitterAmp;

                // Glow is displaced slightly more/differently
                const glowOffset = displacement * 1.2 + 0.05;

                glowPos.array[i * 3]     = x + nx * glowOffset + jx;
                glowPos.array[i * 3 + 1] = y + ny * glowOffset + jy;
                glowPos.array[i * 3 + 2] = z + nz * glowOffset + jz;
            }
            corePos.needsUpdate = true;
            glowPos.needsUpdate = true;
        }
    }
}
