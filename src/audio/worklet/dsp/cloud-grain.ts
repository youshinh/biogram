/**
 * CloudGrain.ts
 * Granular Delay / Texture Generator
 * 
 * Concept:
 * - Writes input to a circular buffer (2s).
 * - Read heads (Grains) spawn periodically.
 * - Each grain plays a segment of the buffer with a window envelope.
 * - Parameters: Density (Spawn Rate), Size (Window), Spray (Position Jitter), Pitch (Speed), Mix.
 */

export class CloudGrain {
    private buffer: Float32Array;
    private writePtr: number = 0;
    private size: number;
    
    // Params
    private density: number = 0.5; // 0..1 (Low to High density)
    private grainSize: number = 0.2; // 0..1 (50ms to 500ms)
    private spray: number = 0.2; // 0..1 (Jitter amount)
    private pitch: number = 1.0; // Playback rate
    private mix: number = 0.5;
    
    // Grains
    private grains: Grain[] = [];
    private maxGrains: number = 16;
    private spawnPhase: number = 0;
    private sampleRate: number = 44100;

    constructor(sampleRate: number = 44100) {
        this.sampleRate = sampleRate;
        this.size = sampleRate * 2; // 2 seconds buffer
        this.buffer = new Float32Array(this.size);
        
        // Initialize pool
        for (let i = 0; i < this.maxGrains; i++) {
            this.grains.push({
                active: false,
                pos: 0,
                startPos: 0,
                speed: 1.0,
                duration: 0,
                age: 0,
                windowScale: 0
            });
        }
    }

    setParams(density: number, size: number, spray: number, pitch: number, mix: number) {
        this.density = density;
        this.grainSize = size;
        this.spray = spray;
        this.pitch = pitch;
        this.mix = mix;
    }

    process(input: number): number {
        // Write to buffer
        this.buffer[this.writePtr] = input;
        
        // Spawn Logic
        // Rate depends on Density & GrainSize.
        // Higher Density = More overlaps.
        // Base Interval = Duration / (Density * 4 + 1) ?
        // Let's say Density 0 = 1 grain at a time (Interval = Duration).
        // Density 1 = 8 grains overlapping (Interval = Duration / 8).
        
        // Map UI 0..1 to ms
        const durationSamples = Math.floor((0.05 + this.grainSize * 0.45) * this.sampleRate); // 50ms - 500ms
        const overlap = 1.0 + (this.density * 7.0); // 1 to 8 overlaps
        const uniqueSpawnInterval = durationSamples / overlap;
        
        this.spawnPhase++;
        if (this.spawnPhase >= uniqueSpawnInterval) {
            this.spawnPhase = 0;
            this.spawnGrain(durationSamples);
        }

        // Process Grains
        let wet = 0.0;
        let activeCount = 0;
        
        for (let i = 0; i < this.maxGrains; i++) {
            const g = this.grains[i];
            if (g.active) {
                // Read from buffer
                // pos is floating point
                const rInt = Math.floor(g.pos);
                let idx = rInt % this.size;
                if (idx < 0) idx += this.size;
                const sample = this.buffer[idx]; // No interpolation for now to save cycles, or linear?
                
                // Window (Hanning-ish: 0.5 - 0.5*cos(2pi * age/dur))
                // Or Triangle for speed:
                // 0..0.5 -> Up, 0.5..1 -> Down
                const normAge = g.age / g.duration;
                let win = 0;
                if (normAge < 0.5) win = normAge * 2;
                else win = (1.0 - normAge) * 2;
                
                wet += sample * win;
                
                // Advance
                g.pos += g.speed;
                g.age++;
                
                if (g.age >= g.duration) {
                    g.active = false;
                } else {
                    activeCount++;
                }
            }
        }
        
        // Soft normalization to prevent massive clipping with high density
        wet = wet * (1.0 / Math.sqrt(Math.max(1, activeCount)));

        // Advance Write Ptr
        this.writePtr++;
        if (this.writePtr >= this.size) this.writePtr = 0;
        
        return (input * (1.0 - this.mix)) + (wet * this.mix * 1.5); // Boost wet slightly
    }

    private spawnGrain(duration: number) {
        // Find inactive grain
        const g = this.grains.find(g => !g.active);
        if (!g) return; // Max polyphony reached
        
        g.active = true;
        g.age = 0;
        g.duration = duration;
        g.speed = this.pitch; // TODO: Randomize pitch slightly?
        
        // Random Start Position
        // "Spray" controls how far back from writePtr we read.
        // Base delay should be enough to not hit write ptr immediately.
        // Latency = 20ms minimum.
        // Max Delay = 2s.
        // delay = 20ms + (Spray * 1000ms * random).
        
        const minDelay = 0.02 * this.sampleRate;
        const sprayRange = this.spray * (this.size * 0.5); // Up to 1s spray
        const delay = minDelay + Math.random() * sprayRange;
        
        g.startPos = this.writePtr - delay;
        g.pos = g.startPos;
    }
}

interface Grain {
    active: boolean;
    pos: number; // Current Read Ptr
    startPos: number;
    speed: number; // Playback rate
    duration: number; // Duration in samples
    age: number; // Current sample count
    windowScale: number; // Amplitude scale
}
