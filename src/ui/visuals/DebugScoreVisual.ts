import * as THREE from 'three';
import { VisualState } from './ScoreManager';

export class DebugScoreVisual {
    public mesh: THREE.Group;
    private cubeA: THREE.Mesh;
    private cubeB: THREE.Mesh;
    private textGroup: THREE.Group; // Placeholder if we had text, using sphere for event indicator

    private sphereA: THREE.Mesh;
    private sphereB: THREE.Mesh;

    constructor() {
        this.mesh = new THREE.Group();

        // Deck A (Left) - Red Base
        this.cubeA = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true })
        );
        this.cubeA.position.set(-3, 0, 0);
        this.mesh.add(this.cubeA);

        this.sphereA = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        this.sphereA.position.set(-3, 2, 0);
        this.mesh.add(this.sphereA);

        // Deck B (Right) - Blue Base
        this.cubeB = new THREE.Mesh(
            new THREE.BoxGeometry(1, 1, 1),
            new THREE.MeshBasicMaterial({ color: 0x0000ff, wireframe: true })
        );
        this.cubeB.position.set(3, 0, 0);
        this.mesh.add(this.cubeB);

        this.sphereB = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        this.sphereB.position.set(3, 2, 0);
        this.mesh.add(this.sphereB);
    }

    public update(stateA: VisualState, stateB: VisualState) {
        // Update A
        // Scale Y based on Energy
        this.cubeA.scale.y = 1 + stateA.energy * 5; 
        this.cubeA.scale.x = 1 + stateA.chaos;
        this.cubeA.scale.z = 1 + stateA.chaos;
        
        // Rotation based on Energy
        this.cubeA.rotation.x += 0.01 + stateA.energy * 0.1;
        this.cubeA.rotation.y += 0.01 + stateA.chaos * 0.1;

        // Color mix based on mood/cloud?
        // Just flash white on event
        if (stateA.event && stateA.event !== 'NONE') {
            (this.cubeA.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
            this.sphereA.scale.setScalar(2.0);
        } else {
            (this.cubeA.material as THREE.MeshBasicMaterial).color.setHex(0xff0000);
            (this.cubeA.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(0xffff00), stateA.chaos);
            this.sphereA.scale.setScalar(1.0);
        }
        
        // Cloud = Opacity/Brightness?
        (this.sphereA.material as THREE.MeshBasicMaterial).color.setScalar(stateA.cloud);


        // Update B
        this.cubeB.scale.y = 1 + stateB.energy * 5;
        this.cubeB.scale.x = 1 + stateB.chaos;
        this.cubeB.scale.z = 1 + stateB.chaos;

        this.cubeB.rotation.x += 0.01 + stateB.energy * 0.1;
        this.cubeB.rotation.y -= 0.01 + stateB.chaos * 0.1; // Reverse spin

        if (stateB.event && stateB.event !== 'NONE') {
            (this.cubeB.material as THREE.MeshBasicMaterial).color.setHex(0xffffff);
             this.sphereB.scale.setScalar(2.0);
        } else {
            (this.cubeB.material as THREE.MeshBasicMaterial).color.setHex(0x0000ff);
            (this.cubeB.material as THREE.MeshBasicMaterial).color.lerp(new THREE.Color(0x00ffff), stateB.chaos);
             this.sphereB.scale.setScalar(1.0);
        }
        (this.sphereB.material as THREE.MeshBasicMaterial).color.setScalar(stateB.cloud);
    }

    public setVisible(visible: boolean) {
        this.mesh.visible = visible;
    }
}
