import * as THREE from 'three';

/**
 * SpectrumGrid - Geometric Grid Mode
 * 
 * 幾何学的・ミニマルアプローチ：
 * - 水平ラインのグリッドで波形ディスプレイ風
 * - 各ラインがスペクトラム周波数帯に対応
 * - シャープなエッジ、高コントラストモノクロ
 * - CoreとGlowの2層ラインにより光沢感を強化
 */
export class SpectrumGrid {
    public mesh: THREE.Group;
    
    private coreLines: THREE.Line[] = [];
    private glowLines: THREE.Line[] = [];
    private lineCount = 80;           // 水平ライン数 (さらに密度アップ)
    private pointsPerLine = 128;      // 各ラインの解像度
    
    // ...


    private basePositions: Float32Array[] = []; 
    private baseYPositions: number[] = [];      
    private time = 0;      
    
    // モーフィング用
    private blendFactor = 0; // 0.0: Sharp Line, 1.0: Fuzzy Hair
    
    // 物理回転用
    private rotVelocity = new THREE.Vector3();
    
    // 半径アニメーション用
    private kickExpansion = 0;

    constructor() {
        this.mesh = new THREE.Group();
        this.init();
    }

    private init() {
        // Core Material: Sharp, bright, opaque
        const coreMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 1.0, 
            blending: THREE.AdditiveBlending,
        });

        // Glow Material: Softer, translucent, adds halo
        const glowMaterial = new THREE.LineBasicMaterial({
            color: 0xaaddff,
            transparent: true,
            opacity: 0.4, 
            blending: THREE.AdditiveBlending,
        });

        const radius = 2.0; 

        for (let lineIdx = 0; lineIdx < this.lineCount; lineIdx++) {
            
            // Map lineIdx to Latitude (Phi): -PI/2 to PI/2
            const t = lineIdx / (this.lineCount - 1);
            // Reduced from 0.9 to 0.7 to avoid extreme pole regions where lines clump
            const phi = (t - 0.5) * Math.PI * 0.7; 
            
            // --- Fixed Resolution ---
            const pts = this.pointsPerLine;
            
            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array((pts + 1) * 3); 
            
            // Initial positions on Sphere Surface
            for (let i = 0; i <= pts; i++) {
                // Map i to Longitude (Theta): 0 to 2PI
                const u = i / pts;
                const theta = u * Math.PI * 2;
                
                // Converting Spherical to Cartesian
                const x = radius * Math.cos(phi) * Math.cos(theta);
                const y = radius * Math.sin(phi);
                const z = radius * Math.cos(phi) * Math.sin(theta);

                positions[i * 3] = x;
                positions[i * 3 + 1] = y;
                positions[i * 3 + 2] = z;
            }
            
            geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            
            // Store base spherical coordinates 
            const basePos = new Float32Array((pts + 1) * 3);
            basePos.set(positions);
            this.basePositions.push(basePos);
            this.baseYPositions.push(0); 
            
            // Create Core Line
            const coreLine = new THREE.Line(geometry.clone(), coreMaterial.clone());
            this.coreLines.push(coreLine);
            this.mesh.add(coreLine);

            // Create Glow Line
            const glowLine = new THREE.Line(geometry.clone(), glowMaterial.clone());
            this.glowLines.push(glowLine);
            this.mesh.add(glowLine);
        }
    }

    public update(dt: number, audioData: { low: number, high: number, kick: boolean, spectrum?: any, ai?: any }) {
        this.time += dt;
        
        // --- AUDIO-DRIVEN ROTATION ---
        // Slow base drift + audio acceleration for organic feel
        const baseDrift = 0.03; // Very slow constant movement
        
        // Add smooth Torque based on Audio (gradual acceleration)
        // Y-axis rotation driven by low frequencies
        if (audioData.low > 0.05) {
            this.rotVelocity.y += audioData.low * 0.5 * dt;
        }
        
        // X/Z tilt driven by high frequencies (restored stronger effect)
        if (audioData.high > 0.05) {
            this.rotVelocity.x += (Math.random() - 0.5) * audioData.high * 1.5 * dt;
            this.rotVelocity.z += (Math.random() - 0.5) * audioData.high * 1.5 * dt;
        }
        
        // Kick adds impulse to all axes
        if (audioData.kick) {
            this.rotVelocity.y += 0.1;
            this.rotVelocity.x += (Math.random() - 0.5) * 0.3;
            this.rotVelocity.z += (Math.random() - 0.5) * 0.3;
        }
        
        // Apply Velocity with moderate max speed
        const maxSpeed = 1.2;
        this.rotVelocity.clampLength(0, maxSpeed);
        
        // Apply rotation with base drift on all axes
        this.mesh.rotation.x += this.rotVelocity.x * dt + baseDrift * dt * 0.3;
        this.mesh.rotation.y += this.rotVelocity.y * dt + baseDrift * dt;
        this.mesh.rotation.z += this.rotVelocity.z * dt + baseDrift * dt * 0.2;
        
        // Slower Damping for momentum feel
        this.rotVelocity.multiplyScalar(0.95);
        
        // --- DYNAMIC POLE WOBBLE ---
        // Slowly tilt the axis so the pole (line convergence point) moves around
        // This distributes the density over time instead of accumulating at one spot
        const wobbleSpeed = 0.15;
        const wobbleAmount = 0.4; // ~23 degrees tilt
        this.mesh.rotation.x += Math.sin(this.time * wobbleSpeed * 1.3) * wobbleAmount * dt;
        this.mesh.rotation.z += Math.cos(this.time * wobbleSpeed) * wobbleAmount * 0.7 * dt;
        
        // --- Radius Dynamics ---
        // 1. 高音で縮む (High freq compresses grid -> Higher density feel)
        // audioData.high (0.0~1.0) -> Scale down
        const compression = audioData.high * 0.5; // Up to 50% smaller
        const targetScale = 1.0 - compression;
        
        // 2. キックで「ふわっと」広がる (Kick expansion)
        if (audioData.kick) {
            this.kickExpansion = 0.8; // Impulse
        }
        // Decay (Spring-like or simple exponential)
        this.kickExpansion *= 0.9;
        
        // Effective Radius Multiplier relative to original 2.0 radius
        // We modify the effective radius, then add wave displacement
        
        // スペクトラムからバンドレベルを計算
        const levels: number[] = [];
        if (audioData.spectrum) {
            const s = audioData.spectrum;
            const binSize = Math.floor(128 / this.lineCount);
            
            for (let lineIdx = 0; lineIdx < this.lineCount; lineIdx++) {
                const start = lineIdx * binSize;
                const end = Math.min(start + binSize, 128);
                let sum = 0;
                for (let i = start; i < end; i++) {
                    sum += s[i];
                }
                const avg = (sum / (end - start)) / 255.0;
                // ゲインをさらに強化
                levels.push(Math.min(avg * 3.0, 1.0));
            }
        } else {
            // フォールバック
            for (let lineIdx = 0; lineIdx < this.lineCount; lineIdx++) {
                const t = lineIdx / (this.lineCount - 1);
                levels.push(audioData.low * (1 - t) + audioData.high * t);
            }
        }

        // AI パラメータ
        let aiEnergy = 0;
        let aiChaos = 0;
        if (audioData.ai) {
            aiEnergy = audioData.ai.energy || 0;
            aiChaos = audioData.ai.chaos || 0;
        }
        
        // --- Morphing Logic ---
        // 高音が強い (High Energy) -> Fuzzy (1.0)
        // 静か (Low Energy) -> Sharp (0.0)
        const targetBlend = audioData.high > 0.3 ? 1.0 : 0.0;
        this.blendFactor += (targetBlend - this.blendFactor) * 0.05;

        // 各ラインを更新
        for (let lineIdx = 0; lineIdx < this.lineCount; lineIdx++) {
            const coreLine = this.coreLines[lineIdx];
            const glowLine = this.glowLines[lineIdx];
            
            const corePos = coreLine.geometry.attributes.position;
            const glowPos = glowLine.geometry.attributes.position;
            
            const basePos = this.basePositions[lineIdx]; // This contains [x, y, z] for each point
            const level = levels[lineIdx];
            
            // ラインごとの位相オフセット
            const phaseOffset = lineIdx * 0.5;
            
            // 波の振幅
            const amplitude = 0.05 + level * 0.6 + aiEnergy * 0.2; 
            
            // --- FIX: INTEGER FREQUENCY ---
            // Force waveFreq to be an integer to ensure continuity at theta=0 / theta=2PI
            // If it's a float, sin(0) != sin(2PI * freq), creating a seam.
            const waveFreq = Math.round(4 + aiChaos * 5); 
            
            // Get actual point count for this line (Adaptive Resolution)
            const pts = (corePos.count) - 1;

            for (let i = 0; i <= pts; i++) {
                // Base Coordinates on Sphere Surface
                const bx = basePos[i * 3];
                const by = basePos[i * 3 + 1];
                const bz = basePos[i * 3 + 2];
                
                // Normal Vector
                const len = Math.sqrt(bx*bx + by*by + bz*bz);
                const nx = bx / len;
                const ny = by / len;
                const nz = bz / len;
                
                // --- Radius Adjustment ---
                // Modulate Base Position by Scale and Expansion
                // Original r = 2.0 approx.
                // New r = r * targetScale + kickExpansion
                const dynamicRadiusOffset = (len * targetScale - len) + this.kickExpansion;
                
                // Calculate Wave (Radial Displacement)
                const angle = (i / pts) * Math.PI * 2;
                const mainWave = Math.sin(angle * waveFreq + this.time * 2 + phaseOffset) * amplitude;
                const breathing = Math.sin(this.time * 0.5) * 0.1;
                const noise = aiChaos > 0.3 ? (Math.random() - 0.5) * aiChaos * 0.1 : 0;
                
                // Total Displacement from Original Surface (radius 2.0)
                const totalDisplacement = dynamicRadiusOffset + mainWave + breathing + noise;
                
                // --- DYNAMIC SHAPE TRANSFORMS ---
                
                // 1. Bass Stretch (Squash & Stretch)
                // Low freq stretches the sphere vertically
                const stretch = 1.0 + (audioData.low * 0.8); 
                const invStretch = 1.0 / Math.max(0.1, stretch); // Preserve Volume approx
                
                // Apply Base Displacement
                let tx = (bx + nx * totalDisplacement) * invStretch; // X/Z shrink
                let ty = (by + ny * totalDisplacement) * stretch;    // Y stretch
                let tz = (bz + nz * totalDisplacement) * invStretch; // X/Z shrink
                
                // 2. High-Freq Twist
                // Twist the sphere around Y axis based on height and high freq energy
                const twistAmount = (audioData.high * 0.5) + (audioData.ai?.chaos || 0) * 0.5;
                if (twistAmount > 0.05) {
                    const twistAngle = ty * twistAmount * 1.5; // Twist depends on Height (Y)
                    const cosT = Math.cos(twistAngle);
                    const sinT = Math.sin(twistAngle);
                    
                    const twistedX = tx * cosT - tz * sinT;
                    const twistedZ = tx * sinT + tz * cosT;
                    
                    tx = twistedX;
                    tz = twistedZ;
                }
                
                // --- KICK CHAOS ---
                // If kicking (expanding), apply random chaos to target position
                // Reverted chaos amount to 0.5 as per user request
                // Raised threshold to 0.3 so it only triggers on strong kicks
                if (this.kickExpansion > 0.3) {
                    const chaosAmount = this.kickExpansion * 0.5; 
                    
                    tx += (Math.random() - 0.5) * chaosAmount;
                    ty += (Math.random() - 0.5) * chaosAmount;
                    tz += (Math.random() - 0.5) * chaosAmount;
                }
                
                // --- Core Line Update ---
                const cx = corePos.array[i * 3];
                const cy = corePos.array[i * 3 + 1];
                const cz = corePos.array[i * 3 + 2];
                
                corePos.array[i * 3]     = cx + (tx - cx) * 0.3; // Responsive smoothing
                corePos.array[i * 3 + 1] = cy + (ty - cy) * 0.3;
                corePos.array[i * 3 + 2] = cz + (tz - cz) * 0.3;

                // --- Glow Line Update (Blended) ---
                // Sharp Mode: Jitter small (0.02), Fuzzy Mode: Jitter large (0.25)
                // const baseJitter = 0.02 + this.blendFactor * 0.23;
                const baseJitter = 0.01 + this.blendFactor * 0.20; // Slightly reduced jitter
                const jitterAmount = baseJitter * (0.5 + level); 

                const glowDisp = totalDisplacement + 0.15 + (Math.sin(angle * 10 + this.time * 5) * 0.05);
                const gx = bx + nx * glowDisp;
                const gy = by + ny * glowDisp;
                const gz = bz + nz * glowDisp;

                const jitterX = (Math.random() - 0.5) * jitterAmount;
                const jitterY = (Math.random() - 0.5) * jitterAmount;
                const jitterZ = (Math.random() - 0.5) * jitterAmount;
                
                glowPos.array[i * 3]     = gx + jitterX;
                glowPos.array[i * 3 + 1] = gy + jitterY;
                glowPos.array[i * 3 + 2] = gz + jitterZ;
            }
            
            // --- FIX: Close the loop seamlessly ---
            // Copy first point to last point to eliminate seam
            corePos.array[pts * 3]     = corePos.array[0];
            corePos.array[pts * 3 + 1] = corePos.array[1];
            corePos.array[pts * 3 + 2] = corePos.array[2];
            
            glowPos.array[pts * 3]     = glowPos.array[0];
            glowPos.array[pts * 3 + 1] = glowPos.array[1];
            glowPos.array[pts * 3 + 2] = glowPos.array[2];
            
            corePos.needsUpdate = true;
            glowPos.needsUpdate = true;
            
        // Update Material (Blended)
            const coreMat = coreLine.material as THREE.LineBasicMaterial;
            const glowMat = glowLine.material as THREE.LineBasicMaterial;
            
            const brightness = 0.6 + level * 0.4; 
            
            // Blend Opacity
            // Sharp Mode (0.0): Core strong (0.8), Glow moderate
            // Fuzzy Mode (1.0): Core weak (0.02), Glow scatter
            
            const sharpCoreOp = 0.6 + level * 0.4;
            const fuzzyCoreOp = 0.02 + level * 0.05;
            let baseCoreOp = sharpCoreOp * (1.0 - this.blendFactor) + fuzzyCoreOp * this.blendFactor;
            
            // --- FIX: MODERATE POLAR FADE ---
            // Reduce opacity near the poles to prevent "whiteout"
            const t = lineIdx / (this.lineCount - 1);
            const distFromEquator = Math.abs(t - 0.5) * 2.0; // 0.0 at equator, 1.0 at poles
            // Stronger fade: 80% reduction at extreme poles
            const polarFade = 1.0 - Math.pow(distFromEquator, 2) * 0.8;
            
            baseCoreOp *= polarFade;
            
            coreMat.opacity = baseCoreOp;
            coreMat.color.setRGB(brightness, brightness, brightness);

            const glowIntensity = 0.2 + level * 0.5;
            glowMat.opacity = glowIntensity * 0.4 * polarFade; 
            
            // キック時
            if (audioData.kick && lineIdx < 8) {
                coreMat.color.setRGB(1.0, 1.0, 1.0);
                // Reduced opacity to avoid "white line" artifact (was 0.8)
                coreMat.opacity = 0.6 * polarFade; 
                glowMat.color.setRGB(0.5, 0.8, 1.0);
                glowMat.opacity = 0.6 * polarFade;
            } else {
                 glowMat.color.setRGB(brightness * 0.5, brightness * 0.7, brightness * 0.9);
            }
        }
    }

    public setOpacity(alpha: number) {
        for (let i = 0; i < this.lineCount; i++) {
            const coreMat = this.coreLines[i].material as THREE.LineBasicMaterial;
            const glowMat = this.glowLines[i].material as THREE.LineBasicMaterial;
            
            // Update base opacity logic (relative to current state is hard, so just clamp max)
            // Just scalar for fade transitions
            coreMat.opacity = Math.min(coreMat.opacity, alpha); // This might be buggy during update loop reset
            // Better: Store transition alpha in class and apply in update?
            // For now, simplicity: Just modulate global alpha multiplier?
            // No, THREE materials don't work that way easily without custom shader.
            // Let's rely on update() setting opacity based on audio, 
            // and apply 'alpha' as a limiter?
            
            // Actually, transition calls setOpacity.
            // If alpha < 1.0, we override.
            if (alpha < 0.99) {
                coreMat.opacity = alpha;
                glowMat.opacity = alpha * 0.5;
            }
        }
    }
}

