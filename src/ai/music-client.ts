import type { LiveMusicSession, LiveMusicServerMessage } from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { StreamAdapter } from '../audio/stream-adapter';
import { LibraryStore } from '../audio/db/library-store';
import { AudioAnalyser } from '../audio/analysis/analyser';

// Helper: Decode Base64 to Uint8Array
function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Helper: Convert Int16 PCM to Float32
function convertInt16ToFloat32(data: Uint8Array): Float32Array {
    const dataInt16 = new Int16Array(data.buffer);
    const l = dataInt16.length;
    const float32 = new Float32Array(l);
    for (let i = 0; i < l; i++) {
        float32[i] = dataInt16[i] / 32768.0;
    }
    return float32;
}

export class MusicClient {
    private ai: GoogleGenAI;
    private session: LiveMusicSession | null = null;
    private adapter: StreamAdapter;
    private isConnected = false;

    // Ghost System
    private library: LibraryStore;
    private archiveBuffer: Float32Array[] = [];
    private archiveSampleCount = 0;
    private readonly ARCHIVE_THRESHOLD = 44100 * 4; // ~4 seconds chunk size
    private savedChunksCount = 0;

    constructor(adapter: StreamAdapter, apiKey: string) {
        this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
        this.adapter = adapter;
        this.library = new LibraryStore();
        this.library.init().then(() => {
             this.library.getCount().then(c => this.savedChunksCount = c || 0);
        }).catch(e => console.error("Library Init Failed", e));
    }

    async connect() {
        if (this.isConnected) return;

        console.log("MusicClient: Connecting to Gemini...");
        this.session = await this.ai.live.music.connect({
            model: 'lyria-realtime-exp',
            callbacks: {
                onmessage: async (e: LiveMusicServerMessage) => {
                    if (e.setupComplete) {
                        console.log("MusicClient: Session Setup Complete");
                        this.isConnected = true;
                    }
                    if (e.serverContent?.audioChunks) {
                        const chunk = e.serverContent.audioChunks[0];
                        if (chunk && chunk.data) {
                            const bytes = decodeBase64(chunk.data);
                            const pcmAll = convertInt16ToFloat32(bytes);
                            
                            // Downmix to Mono
                            const mono = new Float32Array(pcmAll.length / 2);
                            for(let i=0; i<mono.length; i++) {
                                const l = pcmAll[i*2];
                                const r = pcmAll[i*2+1];
                                mono[i] = (l + r) * 0.5;
                            }
                            
                            // 1. Playback
                            this.adapter.writeChunk(mono);

                            // 2. Ghost System Archiving
                            this.archiveBuffer.push(mono);
                            this.archiveSampleCount += mono.length;
                            
                            if (this.archiveSampleCount >= this.ARCHIVE_THRESHOLD) {
                                this.flushArchive();
                            }
                        }
                    }
                },
                onerror: () => {
                    console.error("MusicClient: Connection Error");
                    this.isConnected = false;
                },
                onclose: () => {
                    console.warn("MusicClient: Closed");
                    this.isConnected = false;
                }
            }
        });
    }

    private async flushArchive() {
        if (this.archiveBuffer.length === 0) return;
        
        // Merge chunks
        const totalLen = this.archiveSampleCount;
        const merged = new Float32Array(totalLen);
        let offset = 0;
        for (const chunk of this.archiveBuffer) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        
        // Reset buffer immediately
        this.archiveBuffer = [];
        this.archiveSampleCount = 0;
        
        // Analyze & Save (Async)
        const stats = AudioAnalyser.analyze(merged);
        await this.library.saveChunk(merged, stats);
        this.savedChunksCount++;
    }

    public getArchiveCount(): number {
        return this.savedChunksCount;
    }

    async start(autoPlay: boolean = true) {
        if (!this.session) await this.connect();
        // Default prompts to get silence or initial sound
        await this.updatePrompt("Techno ambient background", 1.0);
        
        if (autoPlay) {
            this.session?.play();
        }
        
        this.startHealthCheck();
    }

    async updatePrompt(text: string, weight: number = 1.0) {
        if (!this.session) return;
        try {
            await this.session.setWeightedPrompts({
                weightedPrompts: [{ text, weight }]
            });
            console.log(`MusicClient: Prompt updated: ${text}`);
        } catch(e) {
            console.warn("MusicClient: Failed to update prompt", e);
        }
    }

    pause() {
        this.session?.pause();
    }

    resume() {
        this.session?.play();
    }

    async setConfig(config: { bpm?: number }) {
        if (!this.session) return;
        try {
            // @ts-ignore - API signature might vary in alpha
            if (this.session.setMusicGenerationConfig) {
                 // @ts-ignore
                await this.session.setMusicGenerationConfig({ musicGenerationConfig: config });
                console.log(`MusicClient: Config updated`, config);
            }
        } catch(e) {
            console.warn("MusicClient: Failed to update config", e);
        }
    }

    // --- Smart Buffer Management ---
    private healthCheckInterval: number = 0;
    private isSmartPaused = false;
    private bufferHealth = 0; // 0..100% (based on 50s target)

    private startHealthCheck() {
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = window.setInterval(() => this.checkBufferHealth(), 100);
    }

    private checkBufferHealth() {
        if (!this.isConnected || !this.session) return;

        const write = this.adapter.getWritePointer();
        const read = this.adapter.getReadPointer();
        
        // Assuming linear pointers (safe for long duration)
        const samplesBuffered = write - read;
        const secondsBuffered = samplesBuffered / 44100; // Mono
        
        // Target: 12s = 100% (User requested lower latency)
        // Ideally 10-15s is good balance between responsiveness and safety.
        this.bufferHealth = Math.min(100, Math.max(0, (secondsBuffered / 12) * 100));

        // Logic
        if (secondsBuffered > 12 && !this.isSmartPaused) {
            console.log(`[SmartSaver] Buffer Full (${secondsBuffered.toFixed(1)}s). Pausing API.`);
            this.session.pause();
            this.isSmartPaused = true;
        } else if (secondsBuffered < 5 && this.isSmartPaused) {
            console.log(`[SmartSaver] Buffer Low (${secondsBuffered.toFixed(1)}s). Resuming API.`);
            this.session.play();
            this.isSmartPaused = false;
        }
    }

    public getBufferHealth(): number {
        return this.bufferHealth;
    }

    public getSmartStatus(): string {
        return this.isSmartPaused ? 'SAVING' : 'GENERATING';
    }
}
