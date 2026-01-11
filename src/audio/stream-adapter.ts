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
    writeChunk(chunk: Float32Array) {
        const bufferSize = this.audioData.length;
        
        // Get Write Pointer
        let writePtr = Atomics.load(this.headerView, OFFSETS.WRITE_POINTER / 4);

        for (let i = 0; i < chunk.length; i++) {
            const index = writePtr % bufferSize;
            this.audioData[index] = chunk[i];
            
            writePtr++;
            // Removed manual reset to ensure linear time calculation for buffer health.
            // Number.MAX_SAFE_INTEGER is sufficient for centuries of audio.
        }

        // Store updated pointer
        Atomics.store(this.headerView, OFFSETS.WRITE_POINTER / 4, writePtr);
    }

    /**
     * Debug: get read/write distance
     */
    getLag(): number {
        const write = Atomics.load(this.headerView, OFFSETS.WRITE_POINTER / 4);
        const read = Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
        return write - read;
    }

    // Accessors for Smart Buffer Management
    getWritePointer(): number {
        return Atomics.load(this.headerView, OFFSETS.WRITE_POINTER / 4);
    }

    getReadPointer(): number {
        return Atomics.load(this.headerView, OFFSETS.READ_POINTER_A / 4);
    }

    getBufferSize(): number {
        return this.audioData.length;
    }
}
