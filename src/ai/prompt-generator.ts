export interface PromptState {
    // UI Parameters
    valAmbient: number;   // 0-100
    valMinimal: number;   // 0-100
    valDub: number;       // 0-100
    valImpact: number;    // 0-100
    valColor: number;     // 0-100
    typeTexture: string;
    typePulse: string;
    
    // New Scale Parameters
    keyRoot: string;      // e.g. "C", "F#"
    // scaleType removed (using scalePrompt/scaleLabel directly)
    scaleLabel: string;   // For display: "MINOR"
    scalePrompt: string;  // For generation: "Minor scale, emotional..."

    // System Context
    deckId: 'A' | 'B';
    deckPrompt: string;   // User input theme
    currentBpm: number;
    isSlamming: boolean;
}

export const generatePrompt = (state: PromptState): string => {
    const {
        valAmbient, valMinimal, valDub, valImpact, valColor,
        typeTexture, typePulse,
        keyRoot, scalePrompt,
        deckId, deckPrompt, currentBpm, isSlamming
    } = state;

    // --- Step 0: SLAM Override Check (Refined Hybrid Mode) ---
    // Instead of completely replacing the prompt, we now Inject intense characteristics 
    // into the existing theme to prevent "too harsh" or "lost context" issues.
    let slamModifier = "";
    if (isSlamming) {
        slamModifier = "Heavily distorted, bitcrushed, aggressive compression, chaotic intense energy";
    }

    // --- Step 1: Deck Personality Injection ---
    let personality = "";
    if (deckId === 'A') {
        personality = "Solid low end, rhythmic focus";
    } else {
        personality = "Airy textures, melodic focus";
    }

    // Weakening personality if user has specific prompt? 
    // Spec says: "If user enters prompt, weaken this".
    // Implementation: If deckPrompt is present, we append personality at the end or with less weight representation effectively.
    // For now, let's keep it as a base layer context.

    // --- Step 2: Base Theme & BPM ---
    // If deckPrompt is empty, use default foundation
    const theme = deckPrompt && deckPrompt.trim().length > 0 
        ? deckPrompt 
        : "Meditative deep ambient drone";
    
    // Change format to "X BPM"
    const timeContext = `${currentBpm} BPM`;

    // --- Step 2.5: Key & Scale ---
    let keyContext = "";
    if (keyRoot && scalePrompt) {
        keyContext = `Key of ${keyRoot}, ${scalePrompt}`;
    }

    // --- Step 3: Mode & Elements Assembly ---
    
    // 3.1 Minimal (The Switch)
    let minimalDesc = "";
    if (valMinimal === 0) {
        // Orchestra Mode
        minimalDesc = "Contemporary classical minimalism, Steve Reich style, repetitive acoustic woodwinds and marimba, staccato strings";
    } else if (valMinimal <= 40) {
        minimalDesc = "Sparse micro-clicks";
    } else if (valMinimal <= 70) {
        minimalDesc = "Steady micro-house groove";
    } else {
        minimalDesc = "Intricate IDM texture, granular editing";
    }

    // 3.2 Atmosphere (Ambient + Dub + Color)
    // Ambient
    let ambientDesc = "";
    if (valAmbient <= 20) ambientDesc = "Silence, sparse atmosphere";
    else if (valAmbient <= 60) ambientDesc = "Warm analog pads, deep drone layers";
    else ambientDesc = "Massive wall of sound, oceanic immersive soundscape";

    // Dub
    let dubDesc = "";
    if (valDub <= 20) dubDesc = "Dry mix";
    else if (valDub <= 60) dubDesc = "Basic Channel style dub chords";
    else dubDesc = "Infinite feedback loop, washed out dub textures";

    // Color
    let colorDesc = "";
    if (valColor <= 30) colorDesc = "Dark underwater atmosphere, low-pass filtered, murky";
    else if (valColor <= 70) colorDesc = "Neutral balanced spectrum";
    else colorDesc = "Bright shimmering high-end, crystalline, icy texture";

    // 3.3 Kick (Impact)
    let kickDesc = "";
    if (valImpact <= 30) kickDesc = "Soft sine-wave heartbeat kick, deep sub-bass";
    else if (valImpact <= 70) kickDesc = "Punchy round kick drum";
    else kickDesc = "Dry clicky industrial kick, hard transient";

    // --- Step 4: Texture & Pulse ---
    
    // Texture
    let texturePhrase = "";
    const cleanTexture = typeTexture || "Silence"; // Default
    if (valAmbient < 30) {
        texturePhrase = `Featuring subtle ${cleanTexture}`;
    } else if (valAmbient > 70) {
        texturePhrase = `Featuring dominant heavy ${cleanTexture}`;
    } else {
        texturePhrase = `Featuring ${cleanTexture}`;
    }

    // Pulse
    const cleanPulse = typePulse || "Rhythm";
    const pulsePhrase = `Driven by ${cleanPulse} rhythm`;

    // --- Step 5: Quality Tags ---
    const qualityTags = "High fidelity, wide stereo field";

    // --- Assembly ---
    // If Minimal is 0 (Orchestra), we might suppress some electronic elements or change the assembly.
    // The spec says "Minimal/Orchestra Switch" logic applied in Step 3.
    // We will combine them.
    
    const parts = [
        timeContext, // Moved to Start
        keyContext,  // Add Key/Scale context
        theme,
        slamModifier, // Add Modifier here
        personality,
        minimalDesc,
        ambientDesc,
        dubDesc,
        colorDesc,
        kickDesc,
        texturePhrase,
        pulsePhrase,
        qualityTags
    ];

    // Filter out empty strings and join
    return parts.filter(p => p && p.trim().length > 0).join(", ");
};

/**
 * Returns only the dynamic parameter parts for display (no fixed theme, BPM, or quality tags)
 */
export const getDisplayPromptParts = (state: PromptState): string[] => {
    const {
        valAmbient, valMinimal, valDub, valImpact, valColor,
        typeTexture, typePulse,
        keyRoot, scaleLabel,
        deckId, deckPrompt, isSlamming
    } = state;

    const parts: string[] = [];

    // Scale Display
    if (keyRoot && scaleLabel) {
        parts.push(`Key: ${keyRoot} ${scaleLabel}`);
    }

    // SLAM
    if (isSlamming) {
        parts.push("SLAM: Distorted, Bitcrushed, Aggressive");
    }

    // Deck Personality
    if (deckId === 'A') {
        parts.push("BASS FOCUS");
    } else {
        parts.push("MELODY FOCUS");
    }

    // Minimal Mode
    if (valMinimal === 0) {
        parts.push("Orchestra Mode");
    } else if (valMinimal <= 40) {
        parts.push("Sparse clicks");
    } else if (valMinimal <= 70) {
        parts.push("Micro-house groove");
    } else {
        parts.push("IDM texture");
    }

    // Ambient
    if (valAmbient <= 20) {
        parts.push("Sparse");
    } else if (valAmbient <= 60) {
        parts.push("Warm pads");
    } else {
        parts.push("Wall of sound");
    }

    // Dub
    if (valDub <= 20) {
        parts.push("Dry");
    } else if (valDub <= 60) {
        parts.push("Dub chords");
    } else {
        parts.push("Infinite dub");
    }

    // Color
    if (valColor <= 30) {
        parts.push("Dark");
    } else if (valColor <= 70) {
        parts.push("Neutral");
    } else {
        parts.push("Bright");
    }

    // Impact/Kick
    if (valImpact <= 30) {
        parts.push("Soft kick");
    } else if (valImpact <= 70) {
        parts.push("Punchy kick");
    } else {
        parts.push("Industrial kick");
    }

    // Texture type
    if (typeTexture && typeTexture !== 'Field Recordings Nature') {
        parts.push(typeTexture);
    }

    // Pulse type
    if (typePulse && typePulse !== 'Sub-bass Pulse') {
        parts.push(typePulse);
    }

    // User Theme
    if (deckPrompt && deckPrompt.trim().length > 0) {
        parts.push(`"${deckPrompt}"`);
    }

    return parts;
};

export const generateNegativePrompt = (state: PromptState): string => {
    const { isSlamming, valMinimal, deckId } = state;
    
    let neg = ["Vocals", "lyrics", "speech", "EDM drops", "trap beats", "heavy metal", "low quality"];
    
    if (isSlamming) {
        // Remove distortion related negatives if slamming (spec says "Remove distorted, noise")
        // My list above doesn't have "distorted" except "distorted guitar".
        // Let's add standard clean negatives if NOT slamming.
        // If slamming, we allow noise.
    } else {
        neg.push("distorted", "clipping", "noise artifacts", "glitch");
        neg.push("distorted guitar"); // Ensure this is definitely there
    }

    if (valMinimal === 0) {
        neg.push("synthesizer", "drum machine");
    }

    if (deckId === 'A') {
        neg.push("high pitched whine");
    } else if (deckId === 'B') {
        neg.push("muddy bass");
    }

    return neg.join(", ");
};
