import { OFFSETS } from '../types/shared';

type DeckId = 'A' | 'B';

type LoopBlendConfig = {
    active: boolean;
    startFrame: number;
    endFrame: number;
    overlapFrames: number;
    bpm: number;
    offsetSeconds: number;
    sampleRate: number;
};

type LoopBlendState = {
    active: boolean;
    startFrame: number;
    endFrame: number;
    overlapFrames: number;
    beatFrames: number;
    beatToleranceFrames: number;
    offsetFrames: number;
    inOverlap: boolean;
    overlapAlignment: number;
};

/**
 * Main Thread helper to write linear PCM chunks into the Ring Buffer
 */
export class StreamAdapter {
    // Loop overwrite blend tuning:
    // - Wider beat tolerance improves stability with generation jitter.
    // - Lower off-beat floor reduces unnatural phasey overwrite when timing is off-grid.
    private readonly LOOP_BEAT_TOLERANCE_RATIO = 0.12; // was 0.08
    private readonly LOOP_OFFBEAT_MIN_ALIGNMENT = 0.08; // was 0.15

    private sab: SharedArrayBuffer;
    private headerView: Int32Array;
    private floatView: Float32Array;
    private audioData: Float32Array;
    private loopBlendByDeck: Record<DeckId, LoopBlendState> = {
        A: this.createLoopBlendState(),
        B: this.createLoopBlendState()
    };
    
    constructor(sab: SharedArrayBuffer) {
        this.sab = sab;
        // Re-construct views on Main Thread side
        // Re-construct views on Main Thread side
        // HEADER_SIZE_BYTES is 128.
        this.headerView = new Int32Array(this.sab, 0, 32);
        this.floatView = new Float32Array(this.sab, 0, 32);
        
        // Fix: Float32Array constructor takes BYTE offset, not ELEMENT offset.
        // We want to start at byte 128 (after header). 
        // passing 128 / 4 = 32 meant we started at byte 32 (inside header).
        // Correct is 128.
        this.audioData = new Float32Array(this.sab, 128);
    }

    configureLoopBlend(deck: DeckId, config: LoopBlendConfig | null) {
        const state = this.loopBlendByDeck[deck];
        if (!config || !config.active) {
            this.resetLoopBlendState(state);
            return;
        }

        const startFrame = Math.floor(config.startFrame);
        const endFrame = Math.floor(config.endFrame);
        const loopLength = endFrame - startFrame;
        if (!Number.isFinite(loopLength) || loopLength <= 1) {
            this.resetLoopBlendState(state);
            return;
        }

        const sampleRate = Math.max(1, Math.floor(config.sampleRate || 48000));
        const bpm = Number.isFinite(config.bpm) && config.bpm > 0 ? config.bpm : 120;
        const beatFrames = (sampleRate * 60) / bpm;
        const beatQuantum = Math.max(1, Math.floor(beatFrames / 16));

        const maxOverlap = Math.max(1, Math.floor(loopLength * 0.5));
        let overlapFrames = Math.max(0, Math.floor(config.overlapFrames || 0));
        overlapFrames = Math.min(maxOverlap, overlapFrames);
        if (overlapFrames > 0) {
            overlapFrames = Math.max(beatQuantum, Math.floor(overlapFrames / beatQuantum) * beatQuantum);
            overlapFrames = Math.min(maxOverlap, overlapFrames);
        }

        state.active = true;
        state.startFrame = startFrame;
        state.endFrame = endFrame;
        state.overlapFrames = overlapFrames;
        state.beatFrames = beatFrames;
        state.beatToleranceFrames = Math.max(8, Math.floor(beatFrames * this.LOOP_BEAT_TOLERANCE_RATIO));
        state.offsetFrames = Math.floor((config.offsetSeconds || 0) * sampleRate);
        state.inOverlap = false;
        state.overlapAlignment = 1;
    }

    private createLoopBlendState(): LoopBlendState {
        return {
            active: false,
            startFrame: 0,
            endFrame: 0,
            overlapFrames: 0,
            beatFrames: 0,
            beatToleranceFrames: 0,
            offsetFrames: 0,
            inOverlap: false,
            overlapAlignment: 1
        };
    }

    private resetLoopBlendState(state: LoopBlendState) {
        state.active = false;
        state.startFrame = 0;
        state.endFrame = 0;
        state.overlapFrames = 0;
        state.beatFrames = 0;
        state.beatToleranceFrames = 0;
        state.offsetFrames = 0;
        state.inOverlap = false;
        state.overlapAlignment = 1;
    }

    private positiveMod(value: number, mod: number): number {
        const r = value % mod;
        return r < 0 ? r + mod : r;
    }

    private getBeatAlignment(writePtr: number, state: LoopBlendState): number {
        if (!Number.isFinite(state.beatFrames) || state.beatFrames <= 1) return 1;
        const anchor = state.startFrame - state.offsetFrames;
        const phase = this.positiveMod(writePtr - anchor, state.beatFrames);
        const distanceToBeat = Math.min(phase, state.beatFrames - phase);
        if (state.beatToleranceFrames <= 0) return 1;
        const strictAlign = Math.max(0, 1 - distanceToBeat / state.beatToleranceFrames);
        // Keep slight morphing even when off-grid, but strongly favor on-beat overwrites.
        const minAlign = this.LOOP_OFFBEAT_MIN_ALIGNMENT;
        return minAlign + strictAlign * (1 - minAlign);
    }

    private applyLoopBlendOnWrite(
        deck: DeckId,
        writePtr: number,
        localFrameIndex: number,
        maxFrames: number,
        baseIndex: number,
        left: number,
        right: number
    ): [number, number] {
        const state = this.loopBlendByDeck[deck];
        if (!state.active || state.overlapFrames <= 0 || maxFrames <= 0) {
            if (state.inOverlap) {
                state.inOverlap = false;
                state.overlapAlignment = 1;
            }
            return [left, right];
        }

        const localStart = this.positiveMod(state.startFrame, maxFrames);
        const distFromStart = this.positiveMod(localFrameIndex - localStart, maxFrames);
        const inOverlap = distFromStart < state.overlapFrames;

        if (inOverlap && !state.inOverlap) {
            state.inOverlap = true;
            state.overlapAlignment = this.getBeatAlignment(writePtr, state);
        } else if (!inOverlap && state.inOverlap) {
            state.inOverlap = false;
            state.overlapAlignment = 1;
        }

        if (!inOverlap) return [left, right];

        const oldL = this.audioData[baseIndex] || 0;
        const oldR = this.audioData[baseIndex + 1] || 0;

        const overlapDenom = Math.max(1, state.overlapFrames - 1);
        const progress = distFromStart / overlapDenom;
        const theta = progress * (Math.PI / 2);
        const newGain = Math.min(1, Math.max(0, Math.sin(theta) * state.overlapAlignment));
        const oldGain = Math.sqrt(Math.max(0, 1 - newGain * newGain));

        return [
            oldL * oldGain + left * newGain,
            oldR * oldGain + right * newGain
        ];
    }

    /**
     * Write a chunk of Float32 PCM data into the buffer
     * @param chunk Float32Array of samples (monophonic for now)
     */
    writeChunk(chunk: Float32Array, deck: DeckId = 'A') {
        const totalSize = this.audioData.length;
        const halfSize = Math.floor(totalSize / 2);
        const offset = deck === 'A' ? 0 : (halfSize & ~1); // Align to stereo pairs
        const writePtrOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
        
        // Get Write Pointer
        let writePtr = Atomics.load(this.headerView, writePtrOffset / 4);

        // Stereo: chunk contains L, R, L, R...
        // writePtr is now FRAME index (1 frame = 2 floats)
        
        // Calculate max frames per deck
        const maxFrames = Math.floor(halfSize / 2);

        for (let i = 0; i < chunk.length; i += 2) {
             const left = chunk[i];
             const right = chunk[i+1] ?? left; // Use nullish coalescing - don't replace 0 values!

             // Circular buffer within the half-zone
             const localFrameIndex = this.positiveMod(writePtr, maxFrames);
             const baseIndex = offset + (localFrameIndex * 2);

             const [mixedL, mixedR] = this.applyLoopBlendOnWrite(
                deck,
                writePtr,
                localFrameIndex,
                maxFrames,
                baseIndex,
                left,
                right
             );

             this.audioData[baseIndex] = mixedL;
             this.audioData[baseIndex + 1] = mixedR;
             
             writePtr++;
        }

        // Store updated pointer
        Atomics.store(this.headerView, writePtrOffset / 4, writePtr);
    }

    /**
     * Debug: get read/write distance
     */
    getLag(deck: 'A' | 'B' = 'A'): number {
        const writeOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
        const readOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
        
        const write = Atomics.load(this.headerView, writeOffset / 4);
        const read = Atomics.load(this.headerView, readOffset / 4);
        return write - read;
    }

    // Accessors for Smart Buffer Management
    getWritePointer(deck: 'A' | 'B' = 'A'): number {
        const offset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
        return Atomics.load(this.headerView, offset / 4);
    }

    getReadPointer(deck: 'A' | 'B' = 'A'): number {
         const offset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
        return Atomics.load(this.headerView, offset / 4);
    }

    getBufferSize(): number {
        // Return size PER DECK (half buffer)
        return Math.floor(this.audioData.length / 2);
    }
    
    /**
     * Jumps the read pointer to the latest write position minus safety buffer
     */
    skipToLatest(deck: 'A' | 'B') {
        const readOffset = deck === 'A' ? OFFSETS.READ_POINTER_A : OFFSETS.READ_POINTER_B;
        const writeOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
        const writePtr = Atomics.load(this.headerView, writeOffset / 4);
        const safetySamples = 44100 * 2.0; // 2s Safety
        const newReadPtr = Math.max(0, writePtr - safetySamples);
        console.log(`[StreamAdapter] Skipping ${deck} to latest.`);
        Atomics.store(this.headerView, readOffset / 4, newReadPtr);
    }
}
