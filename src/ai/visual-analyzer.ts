import { postBackendJson } from '../api/backend-client';

export interface VisualEvent {
    time: number;
    energy: number;
    brightness: number;
    event: 'NONE' | 'KICK' | 'SNARE' | 'BUILD' | 'DROP' | 'BREAK';
}

export interface VisualChunk {
    chunk_id?: string;
    bpm: number;
    mood: string;
    timeline: VisualEvent[];
}

export class VisualAnalyzer {
    private static lastGlobalAnalysisTime = 0;
    private static MIN_INTERVAL_MS = 30000; // Throttle to 30s (User Request)

    constructor() {}

    /**
     * Encodes Float32 PCM to WAV (Int16) for Gemini
     */
    private encodeWav(samples: Float32Array, sampleRate: number = 48000): ArrayBuffer {
        const buffer = new ArrayBuffer(44 + samples.length * 2);
        const view = new DataView(buffer);

        // RIFF chunk descriptor
        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + samples.length * 2, true);
        this.writeString(view, 8, 'WAVE');

        // fmt sub-chunk
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
        view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
        view.setUint16(22, 1, true); // NumChannels (Mono)
        view.setUint32(24, sampleRate, true); // SampleRate
        view.setUint32(28, sampleRate * 2, true); // ByteRate
        view.setUint16(32, 2, true); // BlockAlign
        view.setUint16(34, 16, true); // BitsPerSample

        // data sub-chunk
        this.writeString(view, 36, 'data');
        view.setUint32(40, samples.length * 2, true);

        // Write PCM samples
        this.floatTo16BitPCM(view, 44, samples);

        return buffer;
    }

    private floatTo16BitPCM(output: DataView, offset: number, input: Float32Array) {
        for (let i = 0; i < input.length; i++, offset += 2) {
            const s = Math.max(-1, Math.min(1, input[i]));
            output.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
        }
    }

    private writeString(view: DataView, offset: number, string: string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    /**
     * Analyzes an audio chunk (PCM Float32)
     */
    public async analyze(pcmData: Float32Array, sampleRate: number = 48000): Promise<VisualChunk | null> {
        // 0. Rate Limiting (Global)
        const now = Date.now();
        if (now - VisualAnalyzer.lastGlobalAnalysisTime < VisualAnalyzer.MIN_INTERVAL_MS) {
            // console.log('[VisualAnalyzer] Throttled (Quota Protection)');
            return null;
        }

        // 1. Encode to WAV (Gemini requires container format)
        const wavBuffer = this.encodeWav(pcmData, sampleRate);
        const wavBase64 = this.arrayBufferToBase64(wavBuffer);
        
        // 2. Prompt
        const prompt = `
        Analyze this audio chunk (part of a continuous DJ mix) for real-time visual visualization.
        Generate a JSON object containing a time-series analysis.
        
        Structure:
        {
          "bpm": number (estimate),
          "mood": string (e.g., "Energetic", "Dark", "Ethereal"),
          "timeline": [
            {
              "time": number (seconds from start of chunk),
              "energy": number (0.0-1.0),
              "brightness": number (0.0-1.0),
              "event": string ("NONE" | "KICK" | "SNARE" | "BUILD" | "DROP" | "BREAK")
            },
            ...
          ]
        }
        
        Output data roughly every 0.1 seconds.
        `;

        try {
            // console.log(`[VisualAnalyzer] Sending ${pcmData.length} samples to ${this.model}...`);
            const start = performance.now();
            
            // Reserve slot
            VisualAnalyzer.lastGlobalAnalysisTime = Date.now();

            const response = await postBackendJson<{
                analysis: VisualChunk | null;
            }>('/api/ai/visual-analyze', {
                wavBase64,
                prompt
            });

            // const end = performance.now();
            // console.log(`[VisualAnalyzer] Analysis complete in ${(end - start).toFixed(0)}ms`);
            return response.analysis ?? null;

        } catch (e) {
            console.warn("[VisualAnalyzer] Analysis Failed", e);
            return null;
        }
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
}
