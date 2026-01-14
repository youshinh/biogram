export interface BeatInfo {
    bpm: number;
    offset: number; // Seconds to first beat
    confidence: number;
}

export class BeatDetector {
    /**
     * Advanced Beat Detection using Autocorrelation & Phase Alignment
     * @param data AudioBuffer or Float32Array (Mono)
     * @param sampleRate Sample Rate (default 44100)
     */
    static analyze(data: Float32Array, sampleRate: number = 44100): BeatInfo {
        // 1. Pre-processing: Low Pass Filter & Downsampling
        // Isolate kick drums (< 150Hz) and reduce data size for correlation speed
        const downsampleRatio = 10;
        const targetSr = sampleRate / downsampleRatio; // ~4410Hz
        const envelope = this.getLowPassEnvelope(data, sampleRate, downsampleRatio);
        
        // 2. Tempo Estimation via Autocorrelation
        const bpm = this.estimateTempo(envelope, targetSr);
        if (bpm === 0) return { bpm: 0, offset: 0, confidence: 0 };

        // 3. Phase Alignment (Offset Correlator)
        // Find best offset that aligns grid with actual peaks in the envelope
        const offset = this.findBestOffset(envelope, bpm, targetSr);

        return {
            bpm: bpm,
            offset: offset,
            confidence: 0.9
        };
    }

    private static getLowPassEnvelope(data: Float32Array, srcSr: number, ratio: number): Float32Array {
        const len = Math.floor(data.length / ratio);
        const envelope = new Float32Array(len);
        
        // Simple One-pole LPF (Cutoff ~120Hz)
        let lpfOut = 0;
        const alpha = 0.15; 
        
        for (let i = 0, k = 0; i < len; i++, k += ratio) {
            // Process block for LPF (approximation: just process strides or avg)
            // Better: run LPF on full rate, then pick sample
            let maxVal = 0;
            // Scan the stride window for peak (envelope followerish)
            for(let j=0; j<ratio && (k+j)<data.length; j++) {
                const s = Math.abs(data[k+j]);
                lpfOut += alpha * (s - lpfOut);
                if (lpfOut > maxVal) maxVal = lpfOut;
            }
            envelope[i] = maxVal;
        }
        return envelope;
    }

    private static estimateTempo(data: Float32Array, sr: number): number {
        // BPM Range: 70 - 180 (Relaxed from 105-165)
        // Lag Range in samples
        const minLag = Math.floor(60 * sr / 180); 
        const maxLag = Math.floor(60 * sr / 70);
        
        // We calculate ACF for lags in range
        // Just store them to find peak and neighbors
        // Since lag range is large (~3000 samples @ 4410Hz), we just iterate.
        
        let maxCorr = -1;
        let bestLag = 0;
        
        // We need the correlation array to do interpolation, or at least neighbors of max
        // Let's store neighbors of the current max found.
        let prevCorr = 0; // corr at bestLag - 1
        let nextCorr = 0; // corr at bestLag + 1 (will check during search? No, need random access)
        
        // Optimization: Full array is needed for interpolation if we don't know where peak is.
        // But we can just find integer peak first.
        
        const stride = 1; // Use stride 1 for accuracy (low SR is cheap enough)
        
        // Calculate ACF for range
        // Note: For parabolic interpolation, we need the value at bestLag-1 and bestLag+1.
        // We will just re-calculate those specific lags after finding the integer peak.
        
        for (let lag = minLag; lag <= maxLag; lag += stride) {
            let corr = 0;
            // Shorter loop for speed
            for (let i = 0; i < data.length - lag; i += 4) {
                corr += data[i] * data[i + lag];
            }
            
            if (corr > maxCorr) {
                maxCorr = corr;
                bestLag = lag;
            }
        }
        
        if (bestLag === 0) return 120; // Fail safe
        
        // --- Parabolic Interpolation ---
        // Refine peak estimation: f(x) = a(x-p)^2 + b
        // delta = (y_left - y_right) / (2 * (y_left - 2*y_center + y_right))
        // We need correlations at bestLag-1 and bestLag+1
        
        const calcLagCorr = (l: number) => {
            let c = 0;
            for (let i = 0; i < data.length - l; i += 4) c += data[i] * data[i + l];
            return c;
        };
        
        const yCenter = maxCorr;
        const yLeft = calcLagCorr(bestLag - 1);
        const yRight = calcLagCorr(bestLag + 1);
        
        let delta = 0;
        const denominator = 2 * (yLeft - 2 * yCenter + yRight);
        if (denominator !== 0) {
             delta = (yLeft - yRight) / denominator;
        }
        
        const trueLag = bestLag + delta;
        let bpm = 60 * sr / trueLag;
        
        // Relaxed Constraint (70-180) - Allow Halftime/Doubletime if strong
        // Only clamp extreme values
        while (bpm < 70) bpm *= 2;
        while (bpm > 180) bpm /= 2;
        
        return Math.round(bpm * 100) / 100; // 2 decimal places
    }

    private static findBestOffset(data: Float32Array, bpm: number, sr: number): number {
        const samplesPerBeat = (60 * sr) / bpm;
        
        // Strategy: First Onset Detection
        // AI generated music usually starts at beat 1.
        // We look for the first significant peak in the first 4 beats.
        
        // Scan first 4 beats (1 bar)
        const scanLen = Math.floor(samplesPerBeat * 4);
        const limit = Math.min(data.length, scanLen);
        
        let maxVal = 0;
        // Find global max in first bar to set absolute threshold
        for(let i=0; i<limit; i++) {
            if (data[i] > maxVal) maxVal = data[i];
        }
        
        const threshold = maxVal * 0.5; // 50% of max peak
        
        // Find first peak that crosses threshold
        for (let i = 0; i < limit; i++) {
            if (data[i] > threshold) {
                // Found onset start? Find local peak nearby to be precise
                let peakIdx = i;
                let peakVal = data[i];
                // Search forward small window (e.g. 100ms) for the actual peak top
                const searchWindow = Math.floor(sr * 0.1); 
                for(let j=1; j<searchWindow && (i+j)<limit; j++) {
                    if (data[i+j] > peakVal) {
                        peakVal = data[i+j];
                        peakIdx = i+j;
                    }
                }

                // --- BACKTRACKING FOR ATTACK START ---
                // The peak is the loudest point, but the visual/auditory "start" is the attack.
                // We backtrack from peak until value drops significantly (e.g. < 15% of peak)
                // or we hit a valley.
                let attackIdx = peakIdx;
                const backtrackLimit = Math.floor(sr * 0.08); // Max 80ms backtrack (Wide search)
                const attackThreshold = peakVal * 0.15; // Lower threshold (Catch early attack)

                for (let k = 0; k < backtrackLimit && (peakIdx - k) > 0; k++) {
                    const idx = peakIdx - k;
                    if (data[idx] < attackThreshold) {
                        attackIdx = idx;
                        break;
                    }
                    // Also stop if slope turns positive (we hit a valley/previous sound)
                    if (k > 0 && data[idx] > data[idx + 1]) {
                         attackIdx = idx + 1; // Use the bottom of valley
                         break;
                    }
                }
                
                // Return start of the attack
                const detectedOffset = attackIdx / sr;
                console.log(`[BeatDetector] Found Offset: ${detectedOffset.toFixed(4)}s (Peak: ${(peakIdx/sr).toFixed(4)}s, Backtrack: ${k} samples, Val: ${data[attackIdx].toFixed(4)})`);
                return detectedOffset;
            }
        }
        
        console.warn(`[BeatDetector] No clear onset found. MaxVal: ${maxVal}`);
        return 0; // Default to 0 if no clear peak found
    }
}
