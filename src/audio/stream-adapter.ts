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
        this.headerView = new Int32Array(this.sab, 0, 32);
        this.floatView = new Float32Array(this.sab, 0, 32);
        this.audioData = new Float32Array(this.sab, 128 / 4);
    }

    /**
     * Write a chunk of Float32 PCM data into the buffer
     * @param chunk Float32Array of samples (monophonic for now)
     */
    writeChunk(chunk: Float32Array, deck: 'A' | 'B' = 'A') {
        const totalSize = this.audioData.length;
        const halfSize = Math.floor(totalSize / 2);
        const offset = deck === 'A' ? 0 : halfSize;
        const writePtrOffset = deck === 'A' ? OFFSETS.WRITE_POINTER_A : OFFSETS.WRITE_POINTER_B;
        
        // Get Write Pointer
        let writePtr = Atomics.load(this.headerView, writePtrOffset / 4);

        for (let i = 0; i < chunk.length; i++) {
            // Circular buffer within the half-zone
            const localIndex = writePtr % halfSize; 
            const index = offset + localIndex;
            
            this.audioData[index] = chunk[i];
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
}
