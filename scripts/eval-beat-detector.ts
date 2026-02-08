// Mock realtime-bpm-analyzer if it fails to import or for simpler baseline
const analyzeFullBuffer = async (buffer: any) => {
    // Current behavior fallback simulation: simple peak counting might be what the library does
    // But for evaluation, we want to test OUR findBestOffset logic. 
    // We'll mock the library to return the GROUND TRUTH BPM so we can isolate the OFFSET accuracy.
    return [{ tempo: global.lastTestBpm || 120, count: 100 }];
};

// @ts-ignore
global.lastTestBpm = 120;

// Re-defining the BeatDetector part we want to test if imports are tricky, 
// OR just fixing the script to be more robust.

async function runEval() {
    console.log("=== BEATDETECTOR EVALUATION (BASELINE) ===");
    
    const sampleRate = 44100;
    const duration = 4; // 4 seconds
    const length = sampleRate * duration;
    
    const testCases = [
        { name: "Standard 120BPM", bpm: 120, offset: 0 },
        { name: "Delayed 124BPM", bpm: 124, offset: 0.120 },
        { name: "Syncopated 120BPM", bpm: 120, offset: 0, syncopated: true }
    ];

    for (const tc of testCases) {
        // @ts-ignore
        global.lastTestBpm = tc.bpm;
        const data = new Float32Array(length);
        const interval = (60 / tc.bpm) * sampleRate;
        
        for (let i = 0; i < 8; i++) {
            const pos = Math.floor(tc.offset * sampleRate + i * interval);
            if (pos < length) {
                const pulseLen = Math.floor(sampleRate * 0.05);
                for (let j = 0; j < pulseLen && (pos + j) < length; j++) {
                    const amplitude = (tc.syncopated && i % 4 !== 0) ? 1.0 : (i % 4 === 0 ? 1.0 : 0.6);
                    data[pos + j] = (Math.random() * 2 - 1) * amplitude * Math.exp(-j / (pulseLen / 3));
                }
            }
        }

        const result = await BeatDetector.analyze(data, sampleRate);
        const bpmError = Math.abs(result.bpm - tc.bpm);
        const offsetError = Math.abs(result.offset - tc.offset) * 1000;

        console.log(`[${tc.name}]`);
        console.log(`  Expected BPM: ${tc.bpm}, Detected: ${result.bpm.toFixed(2)}`);
        console.log(`  Expected Offset: ${tc.offset.toFixed(4)}s, Detected: ${result.offset.toFixed(4)}s`);
        console.log(`  Offset Error: ${offsetError.toFixed(2)}ms`);
        
        const passed = bpmError < 0.2 && offsetError < 15;
        console.log(`  Result: ${passed ? "PASS" : "FAIL"}`);
    }
}

runEval().catch(console.error);
