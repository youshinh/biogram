/**
 * TapeTransport.ts
 * Physics-based model for tape/vinyl movement (Inertia, Wow/Flutter, Friction)
 * Spec: 3.2 Physics Transport & 1.1 DSP Algorithms
 * 
 * Implements authentic analog vinyl/tape stop simulation:
 * - Gradual deceleration with proper inertia curve
 * - No pitch warping ("punyon" sound) at low speeds
 * - Flutter disabled during slowdown to prevent artifacts
 */

export class TapeTransport {
    private velocity = 0.0;
    private targetVelocity = 0.0; // Stopped by default
    
    // Physics Constants - tuned for authentic vinyl feel
    private mass = 25.0;            // "Weight" of the platter (heavier = slower deceleration)
    private friction = 0.08;        // Resistance (lower = more gradual stop)
    private motorForce = 0.5;       // Torque to reach target
    
    // Wow & Flutter State
    private flutterPhase = 0;
    
    // Stop behavior constants
    private readonly STOP_THRESHOLD = 0.02;      // Speed below which we snap to zero
    private readonly FLUTTER_THRESHOLD = 0.15;   // Speed below which flutter is disabled
    private readonly MIN_PLAYBACK_SPEED = 0.05;  // Minimum speed before complete stop (prevents pitch warping)
    
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
        const diff = this.targetVelocity - this.velocity;
        
        // When stopping (target = 0), use a more gradual deceleration curve
        // This simulates the platter's inertia as it spins down
        const isStopping = this.targetVelocity === 0 && this.velocity > 0;
        
        let effectiveFriction = this.friction;
        let effectiveMotorForce = this.motorForce;
        
        if (isStopping) {
            // Progressive braking: slower deceleration as speed decreases
            // This creates the characteristic vinyl "wind-down" sound
            const speedRatio = Math.min(1.0, this.velocity);
            effectiveFriction = this.friction * (0.5 + 0.5 * speedRatio);
            effectiveMotorForce = this.motorForce * 0.3; // Reduced motor influence during stop
        }
        
        // Feedforward Friction Compensation
        const frictionComp = this.velocity * effectiveFriction;
        const driveForce = (diff * effectiveMotorForce) + frictionComp;
        
        // Friction opposes movement
        const resistance = -this.velocity * effectiveFriction;
        const totalForce = driveForce + resistance;

        // 2. Integration (Euler)
        const acceleration = totalForce / this.mass;
        this.velocity += acceleration;
        
        // Clamp negative velocity (no reverse when stopping)
        if (isStopping && this.velocity < 0) {
            this.velocity = 0;
        }

        // 3. Deadzone / Stop logic
        // Use larger threshold to prevent the "punyon" sound caused by 
        // very low playback rates creating pitch-shifted artifacts
        if (Math.abs(this.velocity) < this.STOP_THRESHOLD && this.targetVelocity === 0) {
            this.velocity = 0;
            return 0;
        }
        
        // 4. Add Wow & Flutter (Analog instability)
        // IMPORTANT: Disable flutter at low speeds to prevent pitch artifacts
        // Real vinyl players don't exhibit flutter during stop - the motor disengages
        let flutter = 0;
        if (this.velocity > this.FLUTTER_THRESHOLD) {
            this.flutterPhase += 0.05; // ~3Hz flutter LFO
            // Scale flutter by velocity - less flutter as we slow down
            const flutterScale = Math.min(1.0, (this.velocity - this.FLUTTER_THRESHOLD) / (1.0 - this.FLUTTER_THRESHOLD));
            flutter = Math.sin(this.flutterPhase) * 0.002 * flutterScale;
        }
        
        // 5. Return final velocity
        // When stopping at very low speeds, snap output to MIN_PLAYBACK_SPEED
        // to prevent extreme pitch-down artifacts before full stop
        if (isStopping && this.velocity < this.MIN_PLAYBACK_SPEED && this.velocity > this.STOP_THRESHOLD) {
            // Gradual fade to zero without pitch warping
            return this.velocity; // Return actual velocity, let the audio fade naturally
        }

        return this.velocity + flutter;
    }

    /**
     * Force the tape to stop immediately, bypassing inertia/physics.
     * Used for hard resets to prevent "old tail" audio.
     */
    forceStop() {
        this.velocity = 0;
        this.targetVelocity = 0;
    }

    /**
     * "Scrub" interference (User manually grabbing the tape)
     * @param force Force applied by user hand
     */
    applyExternalForce(force: number) {
        this.velocity += force / this.mass;
    }
}
