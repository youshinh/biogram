import type { LiveMusicSession, LiveMusicServerMessage } from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { StreamAdapter } from '../audio/stream-adapter';
import { LibraryStore } from '../audio/db/library-store';
import { AudioAnalyser } from '../audio/analysis/analyser';
import { BeatDetector } from '../audio/analysis/beat-detector';

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
    
    // Control Flags
    public isAnalysisEnabled = true; // Gate BPM detection (only analyze when playing)
    private pendingJump = false; // Flag to skip buffer on next chunk
    private isResetBuffering = false; // New: Wait for buffer to fill before jumping
    private resetBufferCount = 0;
    private resetStartWritePtr = 0; // Track where new audio started being written
    private readonly RESET_THRESHOLD = 44100 * 1.5; // Wait for 1.5s of new audio (reduced from 3s)
    
    // Performance: Skip BPM detection if already have high confidence result
    private hasHighConfidenceBpm = false;
    
    private deckId: 'A' | 'B';
    private onAnalysis?: (bpm: number, offset: number) => void;
    private onTrackStart?: (startPosition: number) => void; // Now receives start position

    constructor(
        adapter: StreamAdapter, 
        apiKey: string, 
        deckId: 'A' | 'B' = 'A', 
        onAnalysis?: (bpm: number, offset: number) => void,
        onTrackStart?: (startPosition: number) => void // Now receives start position
    ) {
        this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' });
        this.adapter = adapter;
        this.deckId = deckId;
        this.onAnalysis = onAnalysis;
        this.onTrackStart = onTrackStart;
        this.library = new LibraryStore();
        this.library.init().then(() => {
             this.library.getCount().then(c => this.savedChunksCount = c || 0);
        }).catch(e => console.error("Library Init Failed", e));
    }

    async connect() {
        if (this.isConnected) return;

        console.log(`MusicClient[${this.deckId}]: Connecting to Gemini...`);
        this.session = await this.ai.live.music.connect({
            model: 'lyria-realtime-exp',
            callbacks: {
                onmessage: async (e: LiveMusicServerMessage) => {
                    if (e.setupComplete) {
                        console.log(`MusicClient[${this.deckId}]: Session Setup Complete`);
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
                            this.adapter.writeChunk(mono, this.deckId);
                            
                             // Handle Reset Buffering
                            if (this.isResetBuffering) {
                                // Record the start position of new audio (first chunk after reset)
                                if (this.resetBufferCount === 0) {
                                    this.resetStartWritePtr = this.adapter.getWritePointer(this.deckId) - mono.length;
                                }
                                
                                this.resetBufferCount += mono.length;
                                // Wait for enough data to ensure smooth playback start
                                if (this.resetBufferCount >= this.RESET_THRESHOLD) { 
                                    if (import.meta.env.DEV) {
                                        console.log(`[MusicClient] Reset Threshold Met -> Jumping to start position`);
                                    }
                                    this.pendingJump = true; 
                                    this.isResetBuffering = false; 
                                }
                            }

                            // Check for Pending Jump (Instant Playback)
                            if (this.pendingJump) {
                                if (this.onTrackStart) this.onTrackStart(this.resetStartWritePtr);
                                this.pendingJump = false;
                            }

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

        // Detect BPM (Experimental)
        // Performance: Skip if already have high confidence BPM, or low energy
        if (stats.energy > 0.05 && this.isAnalysisEnabled && !this.hasHighConfidenceBpm) {
            try {
                const analysis = await BeatDetector.analyze(merged, 44100);
                
                if (import.meta.env.DEV) {
                    console.log(`[BPM-DETECT:${this.deckId}] Detected: ${analysis.bpm} (Conf: ${analysis.confidence})`);
                }
                
                if (analysis.confidence > 0.5 && analysis.bpm > 0 && this.onAnalysis) {
                    this.onAnalysis(analysis.bpm, analysis.offset);
                    this.hasHighConfidenceBpm = true; // Skip further analysis until reset
                }
            } catch (err) {
                if (import.meta.env.DEV) console.warn("Analysis failed", err);
            }
        }
    }

    public getArchiveCount(): number {
        return this.savedChunksCount;
    }

    async start(autoPlay: boolean = true, initialPrompt: string = "120 BPM, minimal ambient") {
        if (!this.session) await this.connect();
        // Default prompts to get silence or initial sound
        await this.updatePrompt(initialPrompt, 1.0);
        
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
            this.lastPromptChange = Date.now(); // Trigger Burst Mode
            // We rely on onTrackStart to jump, but if we want strictly "Reset" behavior, 
            // we will handle it in clearBuffer via Engine.
            // this.pendingJump = true; // REMOVED to prevent clicking on slider drag 
        } catch(e) {
            console.warn("MusicClient: Failed to update prompt", e);
        }
    }
    
    clearBuffer() {
        // Start Reset Mode
        this.isResetBuffering = true;
        this.resetBufferCount = 0;
        this.hasHighConfidenceBpm = false; // Reset BPM detection state
        if (import.meta.env.DEV) console.log("[MusicClient] Clear Buffer -> Waiting for New Data...");
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
        // Performance: Reduced from 100ms to 500ms for mobile
        this.healthCheckInterval = window.setInterval(() => this.checkBufferHealth(), 500);
    }

    private lastPromptChange = 0;

    private checkBufferHealth() {
        if (!this.isConnected || !this.session) return;

        const write = this.adapter.getWritePointer(this.deckId);
        const read = this.adapter.getReadPointer(this.deckId);
        
        // Assuming linear pointers (safe for long duration)
        // Note: write/read are strictly increasing in AudioEngine/Adapter logic?
        // Let's verify: AudioEngine uses modulo for audioData access, but the pointers in SAB (header) are monotonic?
        // Yes, processor.ts increments them monotonically: ptrA += velA.
        // So subtraction is valid.
        const samplesBuffered = write - read;
        const secondsBuffered = samplesBuffered / 44100; // Mono
        
        // Target: 12s = 100% (User requested lower latency)
        this.bufferHealth = Math.min(100, Math.max(0, (secondsBuffered / 12) * 100));

        // Logic
        const now = Date.now();
        const timeSincePrompt = now - this.lastPromptChange;
        const isBursting = timeSincePrompt < 5000; // Allow 5s burst after prompt change including GEN button

        // Pause Condition: Buffer > 12s AND NOT Bursting
        if (secondsBuffered > 12 && !this.isSmartPaused && !isBursting) {
            if (import.meta.env.DEV) console.log(`[SmartSaver] Buffer Full (${secondsBuffered.toFixed(1)}s). Pausing API.`);
            this.session.pause();
            this.isSmartPaused = true;
        } 
        // Resume Condition: Buffer < 5s OR Bursting (Prompt Updated)
        else if ((secondsBuffered < 5 || isBursting) && this.isSmartPaused) {
            if (import.meta.env.DEV) console.log(`[SmartSaver] Buffer Low/Burst (${secondsBuffered.toFixed(1)}s). Resuming API.`);
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

    public isGenerating(): boolean {
        return this.isConnected && !this.isSmartPaused;
    }

    async resetSession() {
        if (this.session) {
            console.log(`MusicClient[${this.deckId}]: Resetting session...`);
            // @ts-ignore - Check if close exists or just rely on disconnect
            if (this.session.close) {
                 // @ts-ignore
                this.session.close();
            }
            this.session = null;
            this.isConnected = false;
        }
        
        // Clear internal logic state
        this.archiveBuffer = [];
        this.archiveSampleCount = 0;
        this.isResetBuffering = true; // Enable buffering logic to trigger jump
        this.resetBufferCount = 0;
        this.hasHighConfidenceBpm = false;
        this.pendingJump = false;
        
        // Reconnect (which creates new session)
        await this.connect();
    }
}
