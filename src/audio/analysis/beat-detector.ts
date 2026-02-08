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
        
        // Simple One-pole LPF (Cutoff ~100Hz for kick/bass focus)
        let lpfOut = 0;
        const alpha = 0.1; 
        
        for (let i = 0, k = 0; i < len; i++, k += ratio) {
            let maxVal = 0;
            for(let j=0; j<ratio && (k+j)<data.length; j++) {
                const s = Math.abs(data[k+j]);
                lpfOut += alpha * (s - lpfOut);
                if (lpfOut > maxVal) maxVal = lpfOut;
            }
            envelope[i] = maxVal;
        }

        // Apply first-order difference (Simplified Spectral Flux) to emphasize onsets
        const flux = new Float32Array(len);
        for (let i = 1; i < len; i++) {
            flux[i] = Math.max(0, envelope[i] - envelope[i - 1]);
        }
        return flux;
    }

    // estimateTempo is no longer used, replaced by library
    // private static estimateTempo... (Removed)

    private static findBestOffset(flux: Float32Array, bpm: number, sr: number): number {
        const samplesPerBeat = (60 * sr) / bpm;
        const samplesPerBar = samplesPerBeat * 4;
        
        // Strategy: Grid Correlation
        // We test multiple offset candidates and see which one correlates best with 
        // a pulse grid at the detected BPM.
        
        const numCandidates = Math.floor(samplesPerBar); // Scan up to 1 bar
        let bestOffsetSamples = 0;
        let maxCorrelation = -1;

        // Scan every sample in the first bar for best grid alignment
        for (let offset = 0; offset < numCandidates; offset++) {
            let correlation = 0;
            // Test correlation over 8 beats (2 bars)
            for (let beat = 0; beat < 8; beat++) {
                const beatPos = Math.floor(offset + beat * samplesPerBeat);
                if (beatPos < flux.length) {
                    let beatEnergy = 0;
                    const win = Math.floor(sr * 0.02); // 20ms window
                    for (let w = -win; w <= win; w++) {
                        const idx = beatPos + w;
                        if (idx >= 0 && idx < flux.length) {
                            beatEnergy = Math.max(beatEnergy, flux[idx]);
                        }
                    }
                    const weight = (beat % 4 === 0) ? 1.5 : 1.0;
                    correlation += beatEnergy * weight;
                }
            }

            if (correlation > maxCorrelation) {
                maxCorrelation = correlation;
                bestOffsetSamples = offset;
            }
        }

        // Refine to exact attack start
        let refinedIdx = bestOffsetSamples;
        let peakVal = flux[bestOffsetSamples];
        const searchWin = Math.floor(sr * 0.05); // 50ms refinement
        for (let i = 1; i < searchWin && (bestOffsetSamples + i) < flux.length; i++) {
            if (flux[bestOffsetSamples + i] > peakVal) {
                peakVal = flux[bestOffsetSamples + i];
                refinedIdx = bestOffsetSamples + i;
            }
        }

        let attackIdx = refinedIdx;
        const backtrackLimit = Math.floor(sr * 0.05);
        const attackThreshold = peakVal * 0.15;
        for (let k = 0; k < backtrackLimit && (refinedIdx - k) > 0; k++) {
            const idx = refinedIdx - k;
            if (flux[idx] < attackThreshold) {
                attackIdx = idx;
                break;
            }
            if (k > 0 && flux[idx] > flux[idx + 1]) {
                attackIdx = idx + 1;
                break;
            }
        }

        const detectedOffset = attackIdx / sr;
        if (import.meta.env.DEV) {
            console.log(`[BeatDetector] Grid Correlation Result: ${detectedOffset.toFixed(4)}s (Corr: ${maxCorrelation.toFixed(2)})`);
        }
        return detectedOffset;
    }
}
