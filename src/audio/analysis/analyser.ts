/**
 * Real-time Audio Feature Extractor
 * Calculates basic spectral features for the Ghost System Vector DB.
 */
export class AudioAnalyser {
    
    /**
     * Extracts feature vector from a PCM chunk
     * @param pcm Float32Array of audio samples (Mono)
     */
    static analyze(pcm: Float32Array): { brightness: number; energy: number; rhythm: number } {
        // 1. RMS (Energy)
        let sum = 0;
        for (let i = 0; i < pcm.length; i++) {
            sum += pcm[i] * pcm[i];
        }
        const rms = Math.sqrt(sum / pcm.length);
        
        // 2. Zero Crossing Rate (Proxy for Brightness/Frequency)
        let zeroCrossings = 0;
        for (let i = 1; i < pcm.length; i++) {
            if ((pcm[i-1] > 0 && pcm[i] <= 0) || (pcm[i-1] <= 0 && pcm[i] > 0)) {
                zeroCrossings++;
            }
        }
        // Normalize ZCR (Max possible is 1.0 per sample, usually much lower)
        // For music, ZCR is often < 0.1
        const brightness = Math.min(1.0, zeroCrossings / pcm.length * 10); 

        // 3. Rhythm (Simplified Pulse Clarity)
        // True rhythm analysis needs longer windows, but for chunk-based, 
        // we can look at peak-to-average ratio (Crest Factor)
        let peak = 0;
        for (let i = 0; i < pcm.length; i++) {
             if (Math.abs(pcm[i]) > peak) peak = Math.abs(pcm[i]);
        }
        const crest = rms > 0.001 ? peak / rms : 0;
        // Normalize crest (1 -> 1, 10 -> 1)
        const rhythm = Math.min(1.0, (crest - 1) / 10);

        return {
            energy: Math.min(1.0, rms * 5), // Boost for normalization
            brightness: brightness,
            rhythm: rhythm
        };
    }
}
