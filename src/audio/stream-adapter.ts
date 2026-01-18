import { OFFSETS } from '../types/shared';

/**
 * Main Thread helper to write linear PCM chunks into the Ring Buffer
 */
export class StreamAdapter {
    private sab: SharedArrayBuffer;
    private headerView: Int32Array;
    private floatView: Float32Array;
    private audioData: Float32Array;
    
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

    /**
     * Write a chunk of Float32 PCM data into the buffer
     * @param chunk Float32Array of samples (monophonic for now)
     */
    writeChunk(chunk: Float32Array, deck: 'A' | 'B' = 'A') {
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
             const right = chunk[i+1] || left; // Safety fallback

             // Circular buffer within the half-zone
             const localFrameIndex = writePtr % maxFrames; 
             const baseIndex = offset + (localFrameIndex * 2);
             
             this.audioData[baseIndex] = left;
             this.audioData[baseIndex + 1] = right;
             
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
