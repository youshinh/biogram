/**
 * TapeTransport.ts
 * Physics-based model for tape movement (Inertia, Wow/Flutter, Friction)
 * Spec: 3.2 Physics Transport & 1.1 DSP Algorithms
 */

export class TapeTransport {
    private velocity = 0.0;
    private targetVelocity = 1.0; // 1.0 = Normal Speed
    
    // Physics Constants
    private mass = 20.0;            // "Weight" of the reels
    private friction = 0.1;         // Resistance
    private motorForce = 0.5;       // Torque to reach target
    
    // Wow & Flutter State
    private flutterPhase = 0;
    
    constructor() {
        this.velocity = 0.0;
    }

    setTargetSpeed(speed: number) {
        this.targetVelocity = speed;
    }

    /**
     * Process one frame of physics
     * @returns current velocity factor (e.g. 1.0 is normal play)
     */
    process(): number {
        // 1. Calculate Forces
        // Force to push towards target
        const diff = this.targetVelocity - this.velocity;
        const driveForce = diff * this.motorForce;
        
        // Friction opposes movement
        const resistance = -this.velocity * this.friction;
        
        const totalForce = driveForce + resistance;

        // 2. Integration (Euler)
        // a = F / m
        const acceleration = totalForce / this.mass;
        this.velocity += acceleration;

        // 3. Add Wow & Flutter (Analog instability)
        this.flutterPhase += 0.05; // ~3Hz flutter LFO
        const flutter = Math.sin(this.flutterPhase) * 0.002; // 0.2% fluctuation
        
        // Deadzone / Stop logic to prevent micro-oscillation at 0
        if (Math.abs(this.velocity) < 0.001 && this.targetVelocity === 0) {
            this.velocity = 0;
            return 0;
        }

        return this.velocity + flutter;
    }

    /**
     * "Scrub" interference (User manually grabbing the tape)
     * @param force Force applied by user hand
     */
    applyExternalForce(force: number) {
        this.velocity += force / this.mass;
    }
}
