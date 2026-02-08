import * as THREE from 'three';

export class TestScoreVisual {
    public mesh: THREE.Group;
    private sphere: THREE.Mesh;
    private cube: THREE.Mesh;
    private scoreText: HTMLDivElement;

    constructor(container: HTMLElement) {
        this.mesh = new THREE.Group();

        // 1. Sphere (Represents Energy) - DECK A
        const sphereGeo = new THREE.SphereGeometry(1, 32, 32);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Yellow
        this.sphere = new THREE.Mesh(sphereGeo, sphereMat);
        this.sphere.position.set(-2, 0, 0);
        this.mesh.add(this.sphere);

        // 2. Cube (Represents Chaos) - DECK B
        const cubeGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
        const cubeMat = new THREE.MeshBasicMaterial({ color: 0x00ffff }); // Cyan
        this.cube = new THREE.Mesh(cubeGeo, cubeMat);
        this.cube.position.set(2, 0, 0);
        this.mesh.add(this.cube);

        // 3. Debug Text Overlay
        this.scoreText = document.createElement('div');
        Object.assign(this.scoreText.style, {
            position: 'absolute',
            bottom: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#0f0',
            fontFamily: 'monospace',
            backgroundColor: 'rgba(0,0,0,0.7)',
            padding: '10px',
            fontSize: '12px',
            pointerEvents: 'none',
            whiteSpace: 'pre',
            zIndex: '999999',
            border: '2px solid red'
        });
        container.appendChild(this.scoreText);
    }

    public update(stateA: any, stateB: any, time: number) {
        // --- DECK A VISUALIZATION (Mainly Sphere) ---
        // Energy -> Scale
        const s = 0.5 + stateA.energy * 1.5;
        this.sphere.scale.set(s, s, s);
        
        // Chaos -> Shake
        if (stateA.chaos > 0) {
            this.sphere.position.x = -2 + (Math.random() - 0.5) * stateA.chaos;
            this.sphere.position.y = (Math.random() - 0.5) * stateA.chaos;
        } else {
            this.sphere.position.set(-2, 0, 0);
        }

        // Event Flash
        if (stateA.event !== 'NONE') {
            (this.sphere.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
        } else {
            (this.sphere.material as THREE.MeshBasicMaterial).color.setHex(0xffff00); // Back to Yellow (A)
        }

        // --- DECK B VISUALIZATION (Mainly Cube) ---
        // Energy -> Rotation Speed reference? 
        this.cube.rotation.x += 0.01 + stateB.energy * 0.1;
        this.cube.rotation.y += 0.01 + stateB.energy * 0.1;

        // Chaos -> Color Glitch
        if (stateB.chaos > 0.5) {
             (this.cube.material as THREE.MeshBasicMaterial).color.setHex(Math.random() * 0xffffff);
        } else {
             (this.cube.material as THREE.MeshBasicMaterial).color.setHex(0x00ffff); // Back to Cyan (B)
        }

        // --- DEBUG TEXT ---
        this.scoreText.innerText = 
            `TIME: ${time.toFixed(3)}s\n` +
            `[A] E:${stateA.energy.toFixed(2)} C:${stateA.chaos.toFixed(2)} EVT:${stateA.event}\n` + 
            `[B] E:${stateB.energy.toFixed(2)} C:${stateB.chaos.toFixed(2)} EVT:${stateB.event}`;
            
        // Console Debug Throtthle (every ~1s)
        if (Math.floor(time) !== Math.floor(time - 0.016)) {
             console.log('[TestScoreVisual] Update', time.toFixed(2));
        }
    }

    public setVisible(visible: boolean) {
        this.mesh.visible = visible;
        this.scoreText.style.display = visible ? 'block' : 'none';
    }

    public dispose() {
        if (this.scoreText && this.scoreText.parentNode) {
            this.scoreText.parentNode.removeChild(this.scoreText);
        }
    }
}
