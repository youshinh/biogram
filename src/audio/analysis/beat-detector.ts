import { analyzeFullBuffer } from 'realtime-bpm-analyzer';

export interface BeatInfo {
    bpm: number;
    offset: number; // Seconds to first beat
    confidence: number;
}

export class BeatDetector {
    /**
     * Advanced Beat Detection using 'realtime-bpm-analyzer'
     * @param data AudioBuffer or Float32Array (Mono)
     * @param sampleRate Sample Rate (default 44100)
     */
    static async analyze(data: Float32Array, sampleRate: number = 44100): Promise<BeatInfo> {
        // 1. Wrap Float32Array into AudioBuffer
        // We use the AudioBuffer constructor which is supported in all modern browsers
        const audioBuffer = new AudioBuffer({
            length: data.length,
            numberOfChannels: 1,
            sampleRate: sampleRate
        });
        
        // Fix: Explicitly create a standard Float32Array/ArrayBuffer copy to avoid SharedArrayBuffer issues
        // and ensure type compatibility with copyToChannel
        const dataCopy = new Float32Array(data);
        audioBuffer.copyToChannel(dataCopy, 0);

        // 2. BPM Estimation via Library
        // This handles low-pass filtering and peak counting more robustly than my custom logic
        let bpm = 0;
        let confidence = 0;

        try {
            const candidates = await analyzeFullBuffer(audioBuffer);
            if (candidates.length > 0) {
                // Library returns candidates sorted by count (confidence)
                bpm = candidates[0].tempo;
                confidence = 0.9; // Library is generally high confidence
                if (import.meta.env.DEV) console.log(`[BeatDetector] Library Detected: ${bpm} BPM (Count: ${candidates[0].count})`);
            }
        } catch (e) {
            console.warn("[BeatDetector] Library analysis failed, falling back/defaulting", e);
        }

        if (bpm === 0) return { bpm: 0, offset: 0, confidence: 0 };

        // 3. Phase Alignment (Offset Correlator)
        // Find best offset that aligns grid with actual peaks in the envelope
        // For offset detection, we still need an envelope. 
        // We can reuse the lowpass envelope logic from before or just use raw data (findBestOffset handles raw somewhat)
        // But findBestOffset expects an envelope or raw? It takes 'data'.
        // In previous code:
        // const envelope = this.getLowPassEnvelope(data, sampleRate, downsampleRatio);
        // const offset = this.findBestOffset(envelope, bpm, targetSr);
        
        // Let's use the raw data on findBestOffset but maybe doing the lowpass first is better?
        // The original code did LowPass+Downsample before offset search.
        // Let's keep the LowPass/Downsample logic JUST for offset finding to ensure consistency with previous phase logic.
        
        const downsampleRatio = 10;
        const targetSr = sampleRate / downsampleRatio; 
        const envelope = this.getLowPassEnvelope(data, sampleRate, downsampleRatio);
        const offset = this.findBestOffset(envelope, bpm, targetSr);

        return {
            bpm: bpm,
            offset: offset,
            confidence: confidence
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

    // estimateTempo is no longer used, replaced by library
    // private static estimateTempo... (Removed)

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

                let k = 0;
                for (; k < backtrackLimit && (peakIdx - k) > 0; k++) {
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
                if (import.meta.env.DEV) console.log(`[BeatDetector] Found Offset: ${detectedOffset.toFixed(4)}s (Peak: ${(peakIdx/sr).toFixed(4)}s, Backtrack: ${k} samples, Val: ${data[attackIdx].toFixed(4)})`);
                return detectedOffset;
            }
        }
        
        if (import.meta.env.DEV) console.warn(`[BeatDetector] No clear onset found. MaxVal: ${maxVal}`);
        return 0; // Default to 0 if no clear peak found
    }
}
