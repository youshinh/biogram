import * as THREE from 'three';

export class TextureManager {
    private textureLoader: THREE.TextureLoader;
    private videoTextures: Map<string, THREE.VideoTexture> = new Map();
    
    constructor() {
        this.textureLoader = new THREE.TextureLoader();
    }
    
    // Load Static Image
    public loadTexture(url: string): Promise<THREE.Texture> {
        return new Promise((resolve, reject) => {
            this.textureLoader.load(
                url, 
                (tex) => {
                    tex.wrapS = THREE.RepeatWrapping;
                    tex.wrapT = THREE.RepeatWrapping;
                    resolve(tex);
                },
                undefined,
                (err) => reject(err)
            );
        });
    }

    // Load Video File
    public createVideoTexture(url: string): THREE.VideoTexture {
        const video = document.createElement('video');
        video.src = url;
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.play();
        
        const tex = new THREE.VideoTexture(video);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        
        return tex;
    }

    // Load Webcam
    public async createWebcamTexture(): Promise<THREE.VideoTexture> {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Webcam not supported");
        }

        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();
        
        const tex = new THREE.VideoTexture(video);
        tex.generateMipmaps = false; 
        tex.minFilter = THREE.LinearFilter;
        
        return tex;
    }
    
    public dispose() {
        // Cleanup textures if needed
        this.videoTextures.forEach(t => t.dispose());
        this.videoTextures.clear();
    }
}
