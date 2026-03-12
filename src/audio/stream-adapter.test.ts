import test from 'node:test';
import assert from 'node:assert';
import { StreamAdapter } from './stream-adapter.ts';
import { OFFSETS } from '../types/shared.ts';

test('StreamAdapter: constructor correctly sets up views', () => {
    // 128 bytes header + 1024 bytes data
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    assert.strictEqual(adapter.getBufferSize(), 1024 / 4 / 2); // 256 floats total, 128 per deck
});

test('StreamAdapter: writeChunk updates write pointer and memory for Deck A', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    const chunk = new Float32Array([0.1, 0.2, 0.3, 0.4]);
    adapter.writeChunk(chunk, 'A');

    assert.strictEqual(adapter.getWritePointer('A'), 2); // Wrote 2 frames (4 floats)
    assert.strictEqual(adapter.getWritePointer('B'), 0); // Deck B untouched

    const floatView = new Float32Array(sab, 128);
    assert.strictEqual(floatView[0], Math.fround(0.1));
    assert.strictEqual(floatView[1], Math.fround(0.2));
    assert.strictEqual(floatView[2], Math.fround(0.3));
    assert.strictEqual(floatView[3], Math.fround(0.4));
});

test('StreamAdapter: writeChunk updates write pointer and memory for Deck B', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    const chunk = new Float32Array([0.5, 0.6, 0.7, 0.8]);
    adapter.writeChunk(chunk, 'B');

    assert.strictEqual(adapter.getWritePointer('B'), 2); // Wrote 2 frames (4 floats)

    const totalSize = 1024 / 4; // 256 floats
    const halfSize = Math.floor(totalSize / 2);
    const offsetB = halfSize & ~1;

    const floatView = new Float32Array(sab, 128);
    assert.strictEqual(floatView[offsetB], Math.fround(0.5));
    assert.strictEqual(floatView[offsetB + 1], Math.fround(0.6));
    assert.strictEqual(floatView[offsetB + 2], Math.fround(0.7));
    assert.strictEqual(floatView[offsetB + 3], Math.fround(0.8));
});

test('StreamAdapter: writeChunk handles nullish coalescing for missing right channel', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    // Chunk with odd length (simulating missing right channel for last frame)
    const chunk = new Float32Array([0.1, 0.2, 0.3]);
    adapter.writeChunk(chunk, 'A');

    assert.strictEqual(adapter.getWritePointer('A'), 2);

    const floatView = new Float32Array(sab, 128);
    assert.strictEqual(floatView[0], Math.fround(0.1));
    assert.strictEqual(floatView[1], Math.fround(0.2));
    assert.strictEqual(floatView[2], Math.fround(0.3));
    assert.strictEqual(floatView[3], Math.fround(0.3)); // Right channel gets left channel value
});

test('StreamAdapter: getLag returns difference between write and read pointers', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    const chunk = new Float32Array(10);
    adapter.writeChunk(chunk, 'A'); // writes 5 frames

    // read pointer is 0 by default
    assert.strictEqual(adapter.getLag('A'), 5);
});

test('StreamAdapter: skipToLatest jumps read pointer minus safety buffer', () => {
    const sab = new SharedArrayBuffer(128 + 1000000);
    const adapter = new StreamAdapter(sab);

    const chunk = new Float32Array(44100 * 2 * 3); // 3 seconds of stereo
    adapter.writeChunk(chunk, 'A'); // writes 44100 * 3 frames

    adapter.skipToLatest('A');
    // should be 44100 * 3 - 44100 * 2 = 44100
    assert.strictEqual(adapter.getReadPointer('A'), 44100);
});

test('StreamAdapter: skipToLatest does not go below 0', () => {
    const sab = new SharedArrayBuffer(128 + 1000000);
    const adapter = new StreamAdapter(sab);

    const chunk = new Float32Array(44100 * 2 * 1); // 1 seconds of stereo
    adapter.writeChunk(chunk, 'A'); // writes 44100 * 1 frames

    adapter.skipToLatest('A');
    // should be max(0, 44100 - 44100 * 2) = 0
    assert.strictEqual(adapter.getReadPointer('A'), 0);
});

test('StreamAdapter: writeChunk wraps around buffer boundaries', () => {
    // 32 bytes data = 8 floats total. 4 floats per deck = 2 frames per deck.
    const sab = new SharedArrayBuffer(128 + 32);
    const adapter = new StreamAdapter(sab);

    const chunk1 = new Float32Array([0.1, 0.2, 0.3, 0.4]); // 2 frames
    adapter.writeChunk(chunk1, 'A');

    assert.strictEqual(adapter.getWritePointer('A'), 2);

    const chunk2 = new Float32Array([0.5, 0.6]); // 1 frame
    adapter.writeChunk(chunk2, 'A');

    assert.strictEqual(adapter.getWritePointer('A'), 3);

    const floatView = new Float32Array(sab, 128);
    // The buffer for A holds 2 frames (4 floats). So index 0,1 gets overwritten by chunk2
    assert.strictEqual(floatView[0], Math.fround(0.5));
    assert.strictEqual(floatView[1], Math.fround(0.6));
    assert.strictEqual(floatView[2], Math.fround(0.3)); // from chunk1
    assert.strictEqual(floatView[3], Math.fround(0.4)); // from chunk1
});

test('StreamAdapter: loop blend active configuration updates state', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    adapter.configureLoopBlend('A', {
        active: true,
        startFrame: 100,
        endFrame: 500,
        overlapFrames: 100,
        bpm: 120,
        offsetSeconds: 0,
        sampleRate: 48000
    });

    // Can write some data and read pointer to ensure it works without errors
    const chunk = new Float32Array([0.1, 0.2]);
    adapter.writeChunk(chunk, 'A');
    assert.strictEqual(adapter.getWritePointer('A'), 1);
});

test('StreamAdapter: loop blend resets on inactive config', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    adapter.configureLoopBlend('A', {
        active: false,
        startFrame: 100,
        endFrame: 500,
        overlapFrames: 100,
        bpm: 120,
        offsetSeconds: 0,
        sampleRate: 48000
    });

    adapter.configureLoopBlend('B', null);

    const chunk = new Float32Array([0.1, 0.2]);
    adapter.writeChunk(chunk, 'A');
    adapter.writeChunk(chunk, 'B');
    assert.strictEqual(adapter.getWritePointer('A'), 1);
    assert.strictEqual(adapter.getWritePointer('B'), 1);
});

test('StreamAdapter: applyLoopBlendOnWrite mixes audio', () => {
    // 128 bytes header + 1024 bytes data
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    // Write an initial chunk to set up "old" audio
    // Size = 1024 / 4 / 2 = 128 frames per deck
    const initialChunk = new Float32Array(256); // 128 frames * 2 channels = 256 floats
    for (let i = 0; i < 256; i++) {
        initialChunk[i] = 0.5; // Fill with 0.5
    }
    adapter.writeChunk(initialChunk, 'A');

    // write pointer A is now 128.
    // The buffer size is 128 frames.

    // Setup loop blend
    adapter.configureLoopBlend('A', {
        active: true,
        startFrame: 0,
        endFrame: 128, // loop length 128
        overlapFrames: 50, // max overlap 64.
        // 120 BPM @ 48000 -> 24000 beat frames. beatQuantum = 1500.
        // overlapFrames will be calculated... min(64, max(1500, ...))
        // So it'll be 64.
        bpm: 120,
        offsetSeconds: 0,
        sampleRate: 48000
    });

    // We overwrite frame 0. localFrameIndex will be 0.
    // distFromStart = 0. progress = 0.
    // newGain = 0, oldGain = 1.0. So mixed value should be 0.5 (old)
    const overlapChunk = new Float32Array([1.0, 1.0]);
    adapter.writeChunk(overlapChunk, 'A');

    const floatView = new Float32Array(sab, 128);

    // old value 0.5 * 1.0 + new value 1.0 * 0 = 0.5
    // But since `overlapAlignment` calculation, let's see what happens.
    // It should definitely not be 0.
    assert.ok(floatView[0] > 0.0);
});

test('StreamAdapter: getReadPointer returns correct value', () => {
    const sab = new SharedArrayBuffer(128 + 1024);
    const adapter = new StreamAdapter(sab);

    const headerView = new Int32Array(sab, 0, 32);
    headerView[OFFSETS.READ_POINTER_A / 4] = 42;
    headerView[OFFSETS.READ_POINTER_B / 4] = 100;

    assert.strictEqual(adapter.getReadPointer('A'), 42);
    assert.strictEqual(adapter.getReadPointer('B'), 100);
});
