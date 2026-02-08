export class TapeDelay {
    private buffer: Float32Array;
    private writeIndex: number = 0;
    private sampleRate: number;
    
    // Params
    private time: number = 0.5; // Sec
    private feedback: number = 0.5;
    private wow: number = 0.0;
    
    private phase: number = 0;

    constructor(sampleRate: number = 44100, maxDelaySeconds: number = 2.0) {
        this.sampleRate = sampleRate;
        this.buffer = new Float32Array(sampleRate * maxDelaySeconds);
    }
    
    setParams(time: number, feedback: number, wow: number) {
        this.time = Math.max(0.01, Math.min(2.0, time));
        this.feedback = Math.max(0.0, Math.min(1.1, feedback)); // Allow slight self-oscillation
        this.wow = wow;
    }
    
    process(input: number): number {
        // LFO for Wow (Tape Flutter)
        this.phase += 0.05; // Rate
        const flutter = Math.sin(this.phase) * (this.wow * 10); // Depth in samples
        
        // Calculate Read Position
        const delaySamples = (this.time * this.sampleRate) + flutter;
        let readPos = this.writeIndex - delaySamples;
        while (readPos < 0) readPos += this.buffer.length;
        
        // Linear Interpolation
        const i1 = Math.floor(readPos);
        const i2 = (i1 + 1) % this.buffer.length;
        const frac = readPos - i1;
        
        const s1 = this.buffer[i1];
        const s2 = this.buffer[i2];
        const delayedSample = s1 + (s2 - s1) * frac;
        
        // Feedback Loop (with Soft saturation)
        let feedbackSignal = delayedSample * this.feedback;
        // Simple Tanh-like limiter
        feedbackSignal = Math.max(-1.0, Math.min(1.0, feedbackSignal)); // Hard clip for safety first
        
        this.buffer[this.writeIndex] = input + feedbackSignal;
        
        this.writeIndex++;
        if (this.writeIndex >= this.buffer.length) this.writeIndex = 0;
        
        return delayedSample;
    }
}
