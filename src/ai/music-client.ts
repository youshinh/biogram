import type { LiveMusicSession, LiveMusicServerMessage } from '@google/genai';
import { GoogleGenAI } from '@google/genai';
import { StreamAdapter } from '../audio/stream-adapter';
import type { LibraryStore } from '../audio/db/library-store';
import { getLibraryStore } from '../audio/db/library-store-singleton';
import { AudioAnalyser } from '../audio/analysis/analyser';
import { BeatDetector } from '../audio/analysis/beat-detector';
import { VisualAnalyzer } from './visual-analyzer';

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
    private library: LibraryStore | null = null;
    private archiveBuffer: Float32Array[] = [];
    private archiveSampleCount = 0;
    private readonly ARCHIVE_THRESHOLD = 48000 * 4; // ~4 seconds chunk size
    private savedChunksCount = 0;
    
    // Control Flags
    public isAnalysisEnabled = true; // Gate BPM detection (only analyze when playing)
    private pendingJump = false; // Flag to skip buffer on next chunk
    private isResetBuffering = false; // New: Wait for buffer to fill before jumping
    private resetBufferCount = 0;
    private resetStartWritePtr = 0; // Track where new audio started being written
    private readonly RESET_THRESHOLD = 48000 * 0.5; // Wait for 0.5s of new audio for faster jump
    
    // Auto-Reconnect
    private lastPromptText: string = '';
    private lastPromptWeight: number = 1.0;
    private lastSentPromptText: string = '';
    private lastSentPromptWeight: number = 1.0;
    private lastSentPromptAt: number = 0;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private reconnectTimer: number = 0;
    private isIntentionalClose = false;
    
    // Performance: Skip BPM detection if already have high confidence result
    private hasHighConfidenceBpm = false;
    
    private deckId: 'A' | 'B';
    private onAnalysis?: (bpm: number, offset: number) => void;
    private onTrackStart?: (startPosition: number) => void; // Now receives start position
    
    private visualAnalyzer: VisualAnalyzer;

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
        this.visualAnalyzer = new VisualAnalyzer();
        getLibraryStore().then((store) => {
             this.library = store;
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
                            
                            // Raw Stereo PCM (Interleaved)
                            // pcmAll is Float32Array [L, R, L, R...]
                            
                            // 1. Playback
                            this.adapter.writeChunk(pcmAll, this.deckId);
                            
                             // Handle Reset Buffering
                            if (this.isResetBuffering) {
                                // Record the start position of new audio (first chunk after reset)
                                // Note: getWritePointer returns FRAME index. 
                                // pcmAll.length is SAMPLES. Frames = Samples / 2.
                                const framesWritten = pcmAll.length / 2;
                                
                                if (this.resetBufferCount === 0) {
                                    this.resetStartWritePtr = this.adapter.getWritePointer(this.deckId) - framesWritten;
                                }
                                
                                this.resetBufferCount += framesWritten; // Count FRAMES
                                // Wait for enough data to ensure smooth playback start
                                // RESET_THRESHOLD should be in FRAMES (e.g. 44100 frames = 1 sec)
                                // Assuming existing constant was adjusted or is interpreted as frames?
                                // If original was samples (mono), 1 buffer was ~44k samples?
                                // Let's check logic later or assume consistency.
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

                            // 2. Ghost System Archiving (Keep simple for now, maybe store stereo or mono sum?)
                            // Ghost processor currently might expect mono in archive buffer for simplicity?
                            // Actually archiveBuffer is just pushing Float32Array.
                            // If we push stereo, memory usage doubles.
                            // For Ghost "Shadow", maybe we only need Mono Sum to save memory?
                            // Or keep stereo. Let's keep stereo for fidelity.
                            this.archiveBuffer.push(pcmAll);
                            this.archiveSampleCount += pcmAll.length;
                            
                            if (this.archiveSampleCount >= this.ARCHIVE_THRESHOLD) {
                                this.flushArchive();
                            }
                        }
                    }
                },
                onerror: () => {
                    console.error(`MusicClient[${this.deckId}]: Connection Error`);
                    this.isConnected = false;
                },
                onclose: () => {
                    console.warn(`MusicClient[${this.deckId}]: WebSocket Closed`);
                    this.isConnected = false;
                    this.isSmartPaused = false;
                    
                    // Auto-reconnect unless intentionally closed or manually paused
                    if (!this.isIntentionalClose && !this.isManuallyPaused) {
                        this.scheduleReconnect();
                    }
                    this.isIntentionalClose = false;
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

        // Capture audio-frame timing at chunk creation time.
        // This avoids drift caused by async visual analysis latency.
        const endFrame = this.adapter.getWritePointer(this.deckId);
        const chunkFrames = Math.floor(totalLen / 2); // Stereo interleaved -> frames
        const startFrame = Math.max(0, endFrame - chunkFrames);
        
    // Analyze & Save (Async)
        if (!this.library) {
            this.library = await getLibraryStore();
        }

        const stats = AudioAnalyser.analyze(merged);
        await this.library.saveChunk(merged, stats);
        this.savedChunksCount++;

        // --- VISUAL ANALYSIS (Look-Ahead) ---
        if (this.isAnalysisEnabled && this.visualAnalyzer) {
            // Fire and forget (don't await to block next playback ops, unless strict sync needed?)
            // Actually this happens in background callback, so awaiting is fine-ish but parallel is better.
            this.visualAnalyzer.analyze(merged, 48000).then(visualScore => {
                if (visualScore) {
                     // Tag with a timestamp or ID so we know WHEN to play this?
                     // Currently 'merged' is the just-received chunk. 
                     // We need to know where it maps to within the track.
                     // The adapter's WritePointer is effectively "Future".
                     // This chunk ends at `this.adapter.getWritePointer()`.
                     // So start time is `(writePtr - merged.length) / 44100`.
                     
                     // NOTE: This logic assumes flushArchive receives the *latest* data immediately.
                     // archiveBuffer collects chunks AS they arrive from Gemini.
                     
                     // Dispatch to System
                     if (import.meta.env.DEV) console.log(`[MusicClient] Visual Score Ready for Deck ${this.deckId}`, visualScore.timeline.length);
                     
                     window.dispatchEvent(new CustomEvent('visual-score-update', {
                         detail: {
                             deck: this.deckId,
                             score: visualScore,
                             timestamp: Date.now(), // Legacy debug field
                             startFrame,
                             endFrame
                         }
                     }));
                }
            });
        }

        // Detect BPM (Experimental)
        // Performance: Skip if already have high confidence BPM, or low energy
        if (stats.energy > 0.05 && this.isAnalysisEnabled && !this.hasHighConfidenceBpm) {
            try {
                const analysis = await BeatDetector.analyze(merged, 48000);
                
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
            this.isManuallyPaused = false;
            this.session?.play();
        } else {
            this.isManuallyPaused = true;
            this.session?.pause();
        }

        this.startHealthCheck();
    }

    async updatePrompt(text: string, weight: number = 1.0) {
        // Always track last prompt for reconnect recovery
        this.lastPromptText = text;
        this.lastPromptWeight = weight;
        
        if (!this.session) return;
        const now = Date.now();
        const isDuplicate =
            this.lastSentPromptText === text &&
            this.lastSentPromptWeight === weight &&
            (now - this.lastSentPromptAt) < 1000;
        if (isDuplicate) return;
        try {
            await this.session.setWeightedPrompts({
                weightedPrompts: [{ text, weight }]
            });
            this.lastSentPromptText = text;
            this.lastSentPromptWeight = weight;
            this.lastSentPromptAt = now;
            console.log(`MusicClient: Prompt updated: ${text}`);
            this.lastPromptChange = Date.now(); // Trigger Burst Mode
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
        this.isManuallyPaused = true;
        // Cancel any pending reconnect when user explicitly pauses
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = 0;
        }
        this.session?.pause();
    }

    resume() {
        this.isManuallyPaused = false;
        
        // If session is dead, trigger reconnect instead of sending to dead socket
        if (!this.isConnected || !this.session) {
            console.warn(`MusicClient[${this.deckId}]: Session dead on resume -> scheduling reconnect`);
            this.scheduleReconnect();
            return;
        }
        this.session?.play();
    }

    // AI Configuration State
    private currentConfig: { bpm?: number; density?: number } = {
        bpm: 120, // Default
        density: 0.5, // Default density if needed?
        // Add other defaults if known, or rely on merging
    };

    async setConfig(config: { bpm?: number }) {
        if (!this.session) return;
        try {
            const session = this.session as LiveMusicSession & {
                setMusicGenerationConfig?: (payload: { musicGenerationConfig: { bpm?: number } }) => Promise<void>;
            };
            if (session.setMusicGenerationConfig) {
                await session.setMusicGenerationConfig({ musicGenerationConfig: config });
                console.log(`MusicClient[${this.deckId}]: Config updated`, config);
            }
        } catch(e) {
            console.warn("MusicClient: Failed to update config", e);
        }
    }

    // --- Smart Buffer Management ---
    private healthCheckInterval: number = 0;
    private isSmartPaused = false;
    private isManuallyPaused = false;
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
        const secondsBuffered = samplesBuffered / 48000; // Mono
        
        // Target: 12s = 100% (User requested lower latency)
        this.bufferHealth = Math.min(100, Math.max(0, (secondsBuffered / 12) * 100));
        if (this.isManuallyPaused) return;

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
        if (this.isManuallyPaused) return 'PAUSED';
        return this.isSmartPaused ? 'SAVING' : 'GENERATING';
    }

    public isGenerating(): boolean {
        return this.isConnected && !this.isSmartPaused && !this.isManuallyPaused;
    }

    public isConnectedState(): boolean {
        return this.isConnected;
    }

    async resetSession() {
        // Cancel any pending reconnect
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = 0;
        }
        this.reconnectAttempts = 0;
        
        if (this.session) {
            console.log(`MusicClient[${this.deckId}]: Resetting session...`);
            this.isIntentionalClose = true; // Prevent onclose from triggering auto-reconnect
            const session = this.session as LiveMusicSession & { close?: () => void };
            if (session.close) {
                session.close();
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
        this.isManuallyPaused = false;
        
        // Reconnect (which creates new session)
        await this.connect();
        
        // Restore Config (BPM, etc.)
        await this.setConfig(this.currentConfig);
    }

    // --- Auto-Reconnect ---
    
    private scheduleReconnect() {
        // Don't schedule if already pending or max attempts reached
        if (this.reconnectTimer) return;
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) {
            console.error(`MusicClient[${this.deckId}]: Max reconnect attempts (${this.MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`);
            window.dispatchEvent(new CustomEvent('ai-connection-lost', { detail: { deck: this.deckId } }));
            return;
        }

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 8000);
        this.reconnectAttempts++;
        console.log(`MusicClient[${this.deckId}]: Auto-reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.MAX_RECONNECT_ATTEMPTS})...`);
        
        this.reconnectTimer = window.setTimeout(() => {
            this.reconnectTimer = 0;
            this.autoReconnect();
        }, delay);
    }

    private async autoReconnect() {
        try {
            // Close stale session reference
            this.session = null;
            this.isConnected = false;
            
            await this.connect();
            await this.setConfig(this.currentConfig);

            // Restore last prompt
            if (this.lastPromptText) {
                await this.updatePrompt(this.lastPromptText, this.lastPromptWeight);
            }

            // Resume generation if not manually paused
            if (!this.isManuallyPaused) {
                this.session?.play();
            }

            this.reconnectAttempts = 0;
            console.log(`MusicClient[${this.deckId}]: Auto-reconnect successful.`);
        } catch (e) {
            console.error(`MusicClient[${this.deckId}]: Auto-reconnect failed:`, e);
            this.scheduleReconnect();
        }
    }
}
