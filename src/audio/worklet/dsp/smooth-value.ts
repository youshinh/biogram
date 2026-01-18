/**
 * SmoothValue.ts
 * Simple One-pole filter (Leaky Integrator) for parameter smoothing
 */

export class SmoothValue {
    private value: number;
    private target: number;
    private factor: number;

    constructor(initialValue: number = 0, factor: number = 0.995) {
        this.value = initialValue;
        this.target = initialValue;
        this.factor = factor;
    }

    set(target: number) {
        this.target = target;
    }

    // Force immediate value
    reset(value: number) {
        this.value = value;
        this.target = value;
    }

    setFactor(factor: number) {
        this.factor = factor;
    }

    process(): number {
        if (Math.abs(this.target - this.value) < 0.00001) {
            this.value = this.target;
        } else {
            this.value = this.value * this.factor + this.target * (1.0 - this.factor);
        }
        return this.value;
    }
    
    get(): number {
        return this.value;
    }
}
