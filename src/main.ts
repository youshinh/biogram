import '../index.css';
import { AudioEngine } from './audio/engine';
import { MidiManager } from './midi/midi-manager';
import './ui/shell';
import './ui/atoms/bio-slider';
import './ui/atoms/slam-button';
import './ui/modules/hydra-visualizer';
import './ui/modules/hydra-receiver';
import './ui/modules/deck-controller';
import './ui/modules/dj-mixer';
import './ui/modules/mixer-controls';
import './ui/modules/fx-rack';
import './ui/modules/app-header';
import './ui/modules/loop-library-panel';
import './ui/modules/super-controls';
import './ui/visuals/ThreeViz';
import './ui/visuals/VisualControls';
import type { ThreeViz } from './ui/visuals/ThreeViz';
import { AutomationEngine } from './ai/automation-engine';
import { MixGenerator } from './ai/mix-generator';
import { GridGenerator } from './ai/grid-generator';
import type { AppShell } from './ui/shell';
import type { FxRack } from './ui/modules/fx-rack';
import type { DeckController } from './ui/modules/deck-controller';
import type { DjMixer } from './ui/modules/dj-mixer';
import type { SuperControls } from './ui/modules/super-controls';
import { 
    createAiSlider, 
    createComboSlot, 
    createCustomSlot, 
    createDualSelectorSlot,
    createFxModule, 
    mkOverlay, 
    mkSliderHelper 
} from './ui/ui-helpers';
import { generatePrompt, generateNegativePrompt, getDisplayPromptParts, PromptState } from './ai/prompt-generator';

// 1. ROOT (基音) のリスト
const ROOT_OPTIONS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"
];

// 2. TYPE (スケール・響きの種類) のリスト
const SCALE_OPTIONS = [
  // --- 基本 ---
  { label: "MAJOR",      prompt: "Major scale, uplifting, happy" },
  { label: "MINOR",      prompt: "Minor scale, emotional, sad" },
  
  // --- チャーチ・モード（雰囲気重視） ---
  { label: "DORIAN",     prompt: "Dorian mode, jazzy, soulful" },
  { label: "PHRYGIAN",   prompt: "Phrygian mode, spanish, exotic tension" },
  { label: "LYDIAN",     prompt: "Lydian mode, dreamy, floating" },
  { label: "WHOLE TONE", prompt: "Whole tone scale, dreamy, mysterious, floating" },
  
  // --- 沖縄 / 12音 ---
  { label: "RYUKYU",     prompt: "Ryukyu pentatonic scale, Okinawan, peaceful, island breeze" },
  { label: "12-TONE",    prompt: "12-tone serialism, atonal, avant-garde, chaotic" },

  // --- 不協和音・実験的 ---
  { label: "DISSONANT",  prompt: "Dissonant harmony, tension, anxiety, clash" }, // 不協和音
  { label: "NOISE",      prompt: "Noise music, texture, glitch, harsh" },        // ノイズ的アプローチ
  { label: "ATONAL",     prompt: "Atonal, no key, chaotic, avant-garde" }
];


console.log("Bio:gram v2.0 'Ghost in the Groove' initializing...");

// Init Engine Early (but don't start audio context yet)
const engine = new AudioEngine();
window.engine = engine;

// Init MIDI
// Init MIDI
const midiManager = new MidiManager();
window.midiManager = midiManager;

// Init AI Mix Engine
const autoEngine = new AutomationEngine(engine);
// @ts-ignore
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
const mixGen = new MixGenerator(apiKey);
const gridGen = new GridGenerator(apiKey);

// ROUTING LOGIC
const urlParams = new URLSearchParams(window.location.search);
const isVizMode = urlParams.get('mode') === 'viz';

if (isVizMode) {
    // --- VJ Projector Mode ---
    document.title = "Bio:gram [PROJECTION]";
    // Reset Body for Fullscreen
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "#000";

    const viz = document.createElement('three-viz') as ThreeViz;
    viz.mode = 'SLAVE';
    viz.style.width = '100vw';
    viz.style.height = '100vh';
    viz.style.display = 'block';
    
    document.body.appendChild(viz);
    
} else {
    // --- Main Controller Mode ---
    document.title = "Bio:gram [CONTROLLER]";
    // Reset Body
    document.body.style.margin = "0";
    document.body.style.background = "#000"; // Keep black background for canvas
    document.body.style.color = "#fff";
    
    // VIEW CONTAINER
    const viewContainer = document.createElement('div');
    viewContainer.id = "app-root"; // Control via CSS instead of inline styles

    // --- PROMPT STATE MANAGEMENT (Centralized) ---
    // Central State (UI Values are shared, Context is per-deck)
    const uiState = {
        valAmbient: 0,
        valMinimal: 0,
        valDub: 0,
        valImpact: 0,
        valColor: 0,
        typeTexture: 'Field Recordings Nature', 
        valTexture: 0, 
        typePulse: 'Sub-bass Pulse',
        valPulse: 0,
        // Scale Params
        // Scale Params
        keyRoot: "",
        scaleLabel: "",
        scalePrompt: "",
        theme: "",
        deckAPrompt: "", // Independent Prompt for A
        deckBPrompt: ""  // Independent Prompt for B
    };

    let isSlamming = false;

    // Listen for Deck Prompt Updates
    window.addEventListener('deck-prompt-change', (e: any) => {
        const { deck, prompt } = e.detail;
        if (deck === 'A') uiState.deckAPrompt = prompt;
        if (deck === 'B') uiState.deckBPrompt = prompt;
        // Optional: Trigger update if playing? 
        // For now, just update state. The GEN button will pick it up.
        // If we want instant update on Enter/Blur:
        // updatePrompts(); // Latch: Wait for GEN
    });

    // Helper to Regenerate and Send
    const updatePrompts = () => {
        const currentBpm = engine.masterBpm; 

        // DECK A
        const stateA = {
            ...uiState,
            deckId: 'A' as const,
            deckPrompt: uiState.deckAPrompt || uiState.theme, // Use Deck Prompt, fallback to Global
            currentBpm,
            keyRoot: uiState.keyRoot,
            scalePrompt: uiState.scalePrompt,
            scaleLabel: uiState.scaleLabel,
            isSlamming
        };
        const promptA = generatePrompt(stateA);
        engine.updateAiPrompt('A', promptA, 1.0);
        if (import.meta.env.DEV) console.log(`[GEN A] ${promptA}`);

        // DECK B
        const stateB = {
            ...uiState,
            deckId: 'B' as const,
            deckPrompt: uiState.deckBPrompt || uiState.theme, // Use Deck Prompt, fallback to Global
            currentBpm,
            keyRoot: uiState.keyRoot,
            scalePrompt: uiState.scalePrompt,
            scaleLabel: uiState.scaleLabel,
            isSlamming
        };
        const promptB = generatePrompt(stateB);
        engine.updateAiPrompt('B', promptB, 1.0);
        if (import.meta.env.DEV) console.log(`[GEN B] ${promptB}`);
    };
    
    // 1. HEADER (Navigation)
    const header = document.createElement('app-header');
    header.style.flexShrink = '0';
    viewContainer.appendChild(header);

    // View State
    header.addEventListener('view-change', (e: any) => {
         const view = e.detail.view;
         shell.view = view; // Update Shell View State
    });
    
    // 2. VIEWS
    // A. Main Shell (Default Full)
    const shell = document.createElement('app-shell') as AppShell;
    shell.view = 'DECK'; // Init
    shell.style.flexGrow = '1';
    shell.style.height = '0'; // Allow shrinking
    shell.style.minHeight = '0';
    shell.style.borderBottom = "1px solid #333";
    viewContainer.appendChild(shell);
    
    // B. FX Rack
    const fxRack = document.createElement('fx-rack') as FxRack;
    fxRack.slot = 'fx-rack'; // Mount to Shell Slot
    // Ensure height is managed by slot
    fxRack.style.display = 'block'; 
    fxRack.style.height = "100%";
    
    fxRack.addEventListener('param-change', (e: any) => {
        engine.updateDspParam(e.detail.id, e.detail.val);
    });
    shell.appendChild(fxRack); // Append TO SHELL, not viewContainer
    
    document.body.appendChild(viewContainer);
    
    // -- Mount UI Modules (to shell) --

    // 0. Deck A
    const deckA = document.createElement('deck-controller') as DeckController;
    deckA.deckId = "A";
    deckA.slot = 'deck-a';
    shell.appendChild(deckA);

    // 1. Mixer
    const mixer = document.createElement('dj-mixer') as DjMixer;
    mixer.slot = 'mixer';
    mixer.addEventListener('mixer-change', (e: any) => {
        const { id, val } = e.detail;
            
        if (id === 'CROSSFADER') {
            engine.setCrossfader(val);
            return;
        }

        // Handle TRIM_A, TRIM_B, DRIVE_A, DRIVE_B directly
        if (id.startsWith('TRIM_') || id.startsWith('DRIVE_')) {
            engine.updateDspParam(id, parseFloat(val));
            return;
        }

        // Parse EQ_A_HI or KILL_B_LOW
        const parts = id.split('_'); // [TYPE, DECK, BAND]
        const type = parts[0];
        const deck = parts[1] as 'A' | 'B';
        const band = parts[2] as 'HI' | 'MID' | 'LOW';

        if (type === 'EQ') {
            engine.setEq(deck, band, val);
        } else if (type === 'KILL') {
            engine.setKill(deck, band, val > 0.5);
        }
    });
    shell.appendChild(mixer);

    // 1.5 Mixer Controls (BPM & Crossfader)
    const mixerControls = document.createElement('mixer-controls');
    mixerControls.slot = 'mixer-controls';
    shell.appendChild(mixerControls);

    // 2. Deck B
    const deckB = document.createElement('deck-controller') as DeckController;
    deckB.deckId = "B";
    deckB.slot = 'deck-b';
    shell.appendChild(deckB);

    // 3. Super Controls (AI Mix)
    const superCtrl = document.createElement('super-controls') as SuperControls;
    superCtrl.slot = 'super';
    shell.appendChild(superCtrl);

    // 4. Visual Controls (Tab)
    const vizControls = document.createElement('visual-controls');
    vizControls.slot = 'visual-controls'; // Correct slot name
    shell.appendChild(vizControls);

    // 5. Visual Engine (Background)
    // We need to inject this into the shadow DOM of app-shell? 
    // NO, app-shell uses slots for content, but .bg-layer is internal.
    // However, app-shell renders children in Light DOM if we put them there?
    // Actually, app-shell.ts has <div class="bg-layer">...</div> but it doesn't have a slot for it.
    // Strategy: We can query the app-shell shadowRoot after it mounts, OR we can modify AppShell to accept a 'background' slot.
    // Let's modify AppShell to have a 'background' slot for cleanliness in a separate step?
    // User wants us to "Continue" and I already modified AppShell but didn't add a background slot.
    // Let's do a quick hack: Insert ThreeViz Absolute Positioned *behind* everything in ViewContainer.
    
    const threeViz = document.createElement('three-viz') as ThreeViz;
    threeViz.style.position = 'absolute';
    threeViz.style.top = '0';
    threeViz.style.left = '0';
    threeViz.style.width = '100%';
    threeViz.style.height = '100%';
    threeViz.style.zIndex = '0'; // Behind Shell which has z-index 10 for main
    threeViz.style.pointerEvents = 'none'; // Let clicks pass through
    
    // Insert ThreeViz as the first child of viewContainer so it sits behind shell?
    // Shell has a background color... we need to make Shell transparent?
    // Shell CSS has `background-color: #0a0a0c`. We need to remove that or make it transparent.
    // Let's append to body directly underneath viewContainer?
    // viewContainer has `background: #000`.
    viewContainer.style.background = 'transparent'; // Allow viz to show
    viewContainer.style.background = 'transparent'; // Allow viz to show
    
    // Move threeViz to Body (Behind ViewContainer)
    document.body.insertBefore(threeViz, viewContainer);
    // viewContainer.insertBefore(threeViz, viewContainer.firstChild); // OLD

    // Event Wiring: Controls -> Viz
    vizControls.addEventListener('visual-texture-change', (e: any) => {
        const { deck, url, type } = e.detail;
        threeViz.updateTexture(deck, url, type);
    });

    vizControls.addEventListener('visual-webcam-toggle', (e: any) => {
        threeViz.toggleWebcam(e.detail.active);
    });

    vizControls.addEventListener('visual-color-random', (e: any) => {
        threeViz.randomizeColor(e.detail.deck);
    });

    vizControls.addEventListener('visual-mode-change', (e: any) => {
        threeViz.setMode(e.detail.mode);
    });

    vizControls.addEventListener('visual-blur-change', (e: any) => {
        // Forward as shader update payload
        // VisualEngine.updateUniforms handles { blurActive, blurFeedback, blurTint }
        threeViz.sendMessage("blurActive", e.detail.active);
        threeViz.sendMessage("blurFeedback", e.detail.feedback);
        threeViz.sendMessage("blurTint", e.detail.tint);
    });

    vizControls.addEventListener('visual-render-toggle', (e: any) => {
        if (threeViz.setRendering) {
            threeViz.setRendering(e.detail.active);
            if (import.meta.env.DEV) console.log(`[Main] Visual Rendering: ${e.detail.active}`);
        }
    });

    superCtrl.addEventListener('visual-ai-toggle', (e: any) => {
        engine.setAiAnalysisEnabled(e.detail.enabled);
    });

    vizControls.addEventListener('ai-grid-gen-trigger', async () => {
        console.log('[Main] Generating AI Grid Params...');
        // Context: Current BPM, Mood from UI State?
        const context = `BPM: ${engine.masterBpm}, Mood: ${uiState.theme || 'Dynamic Flow'}`;
        
        try {
            const params = await gridGen.generateParams(context);
            if (params) {
                console.log('[Main] AI Grid Params Applied:', params);
                threeViz.setAiGridParams(params);
            }
        } catch (e) {
            console.error('[Main] AI Grid Gen Failed', e);
        }
    });


    // AI Mix Event Handling
    let pendingMixContext: { sourceId: string, targetId: string } | null = null;

    // AI Mix Event Handling
    superCtrl.addEventListener('ai-mix-trigger', async (e: any) => {
        const { direction, duration, mood, preferredVisual } = e.detail;
        
        // Optimistic update in UI sets state to GENERATING, so we must allow it.
        // if (superCtrl.mixState !== 'IDLE') return; <--- REMOVED BLOCKER

        // 1. Identify Decks
        // UI sends 'A->B' or 'B->A' (no spaces)
        const sourceId = direction.includes("A->") ? "A" : "B";
        const targetId = sourceId === "A" ? "B" : "A";
        
        pendingMixContext = { sourceId, targetId };

        // 2. Playback Check (Context for AI)
        const isAStopped = engine.isDeckStopped('A');
        const isBStopped = engine.isDeckStopped('B');

        // Verify audio context
        if (engine['context'].state === 'suspended') {
            await engine['context'].resume();
        }

        superCtrl.mixState = 'GENERATING';
        superCtrl.addLog(`ARCHITECTING MIX: ${direction} (${duration} Bars)`);
        
        // Construct Prompt & Inject Context
        const req = `Mix from ${direction}. Duration: ${duration} Bars. Mood: ${mood}.`;
        
        try {
            // Pass Context to MixGenerator
            const score = await mixGen.generateScore(req, engine.masterBpm, { isAStopped, isBStopped });
            
            if (score) {
                superCtrl.addLog(`SCORE RECEIVED. Tracks: ${score.tracks.length}`);
                autoEngine.loadScore(score);
                
                autoEngine.setOnProgress((bar, phase) => {
                     superCtrl.updateStatus(bar, phase, duration);
                     
                     if (threeViz.visualMode !== 'debug_ai') { 
                         // Automate Visual Mode based on musical phase
                         // BREAK / BUILDUP -> PARTICLES (Tension) [mapped to wireframe in this engine]
                         // DROP / BODY / INTRO / OUTRO -> Preferred Visual (Release/Flow)
                         const p = phase.toUpperCase();
                         if (p.includes('BREAK') || p.includes('BUILD')) {
                             threeViz.setMode('wireframe'); // Maps to Particles/Tension
                         } else {
                             // Use user-selected preferred visual, fallback to organic
                             threeViz.setMode(preferredVisual || 'organic');
                         }
                     }

                     // If mix is done
                     if (bar >= duration) {
                         superCtrl.mixState = 'IDLE';
                         superCtrl.addLog(`MIX COMPLETE.`);
                     }
                });
                
                superCtrl.mixState = 'READY';
                superCtrl.addLog(`READY TO START.`);
            } else {
                throw new Error("Empty Score Returned");
            }
        } catch (e: any) {
             console.error("[main] Mix Generation Error:", e);
             superCtrl.mixState = 'IDLE';
             superCtrl.addLog(`ERROR: ${e.message}`);
        }
    });

    superCtrl.addEventListener('ai-mix-start', () => {
        if (superCtrl.mixState !== 'READY') return;
        
        console.log(`[AI Mix] Starting Mix...`);
        superCtrl.mixState = 'MIXING';
        superCtrl.addLog(`MIX STARTED.`);

        // --- SAFETY NET: Force Play if Stopped ---
        if (pendingMixContext) {
            const { sourceId, targetId } = pendingMixContext;
            
            // Visuals: Randomize Skin for the Incoming Track
            threeViz.randomizeColor(targetId as 'A' | 'B');

            // 1. Force Source Deck to Play (The track leaving)
            // Always force play state to ensure sync
            console.log(`[SafetyNet] Force Ensuring Source Deck ${sourceId} Playing`);
            window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deckId: sourceId, playing: true } }));
            
            // 2. Force Target Deck to Play (The track entering)
            console.log(`[SafetyNet] Force Ensuring Target Deck ${targetId} Playing`);
            window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deckId: targetId, playing: true } }));
        }

        // Delay AutomationEngine start to ensure SafetyNet transport commands are fully processed
        // This prevents AI score's Bar 0 transport commands from immediately overriding SafetyNet
        setTimeout(() => {
            autoEngine.start();
        }, 200);
    });

    superCtrl.addEventListener('ai-mix-abort', () => {
        autoEngine.stop();
        superCtrl.mixState = 'IDLE';
        superCtrl.addLog(`MIX ABORTED.`);
    });

    superCtrl.addEventListener('ai-mix-cancel', () => {
        // Cancel the generated mix without starting - just reset state
        superCtrl.mixState = 'IDLE';
        pendingMixContext = null;
    });

    
    // Listen for Deck Events
    // Listen for Deck Events
    window.addEventListener('deck-play-toggle', (e:any) => {
        // Support both manual (deck, playing) and AI (deckId) events
        const deckId = e.detail.deck || e.detail.deckId;
        console.log(`[Main] deck-play-toggle received: ${deckId}, playing: ${e.detail.playing}`);
        if (!deckId) return;

        const deck = deckId as 'A' | 'B';
        let playing = e.detail.playing;

        // If playing state is not specified (e.g. from AI Automation), toggle based on current engine state
        if (playing === undefined) {
            playing = engine.isDeckStopped(deck);
        }

        if (playing) {
             engine.setTapeStop(deck, false);
             engine.unmute(deck); // Ensure we are unmuted (fixes GEN silence bug)
             engine.resume();
             console.log('[Main] Engine Resumed (Sync)');
        } else {
             engine.setTapeStop(deck, true);
        }

        // Sync UI (DeckController listens to this)
        window.dispatchEvent(new CustomEvent('deck-play-sync', {
            detail: { deck: deck, playing: playing }
        }));
    });

    window.addEventListener('deck-bpm-change', (e:any) => {
        const { deck, bpm } = e.detail;
        if (import.meta.env.DEV) console.log(`Deck ${deck} BPM: ${bpm}`);
        engine.setDeckBpm(deck as 'A' | 'B', bpm);
    });
    
    window.addEventListener('deck-sync-toggle', (e:any) => {
        const { deck, sync } = e.detail;
        // Access specific instances directly to guarantee correctness
        const deckEl = deck === 'A' ? deckA : deckB;
        
        if (sync) {
            // Sync implies Play in this workflow? User says "auto plays".
            // Let's enforce Play state to match user experience & fix UI Sync.
            if (deckEl) {
                deckEl.isPlaying = true; // Update UI
                if (import.meta.env.DEV) console.log(`[UI SYNC] Set Deck ${deck} UI to PLAYING`);
            } else {
                console.warn(`[UI SYNC] Could not find deck element for ${deck}`);
            }
            engine.setTapeStop(deck as 'A' | 'B', false); // Update Engine check
            engine.syncDeck(deck as 'A' | 'B');
        } else {
            engine.unsyncDeck(deck as 'A' | 'B');
            // Do we stop on unsync? Usually no, just decouple.
        }
    });

    window.addEventListener('bpm-change', (e:any) => {
        const bpm = e.detail;
        engine.setMasterBpm(bpm);
    });

    window.addEventListener('deck-prompt-change', (e: any) => {
        const { deck, prompt } = e.detail;
        uiState.theme = prompt; // Use as theme
        // updatePrompts(); // Latch: Wait for GEN
    });

    // Shared Handler
    const handleLoadRandom = (e: CustomEvent) => {
        const deck = e.detail.deck as 'A' | 'B';
        if (import.meta.env.DEV) console.log(`[GEN HANDLER] Event received for Deck ${deck}`);

        // Instant Reset Logic
        // If Deck is STOPPED, we want to clear the old buffer and start fresh.
        if (engine.isDeckStopped(deck)) {
             if (import.meta.env.DEV) console.log(`[GEN HANDLER] Deck ${deck} is STOPPED -> Clearing Buffer & Visuals`);
             engine.mute(deck); // FORCE MUTE
             engine.clearBuffer(deck);
             
             // Visual Clear
             if (deck === 'A') {
                 if (import.meta.env.DEV) console.log('[GEN HANDLER] Clearing Visualizer A');
                 deckA.clearVisualizer();
             } else {
                 if (import.meta.env.DEV) console.log('[GEN HANDLER] Clearing Visualizer B');
                 deckB.clearVisualizer();
             }
             
            // TRIGGER HARD RESET
            const currentBpm = engine.masterBpm;
            const state = {
                ...uiState,
                deckId: deck,
                deckPrompt: deck === 'A' ? (uiState.deckAPrompt || uiState.theme) : (uiState.deckBPrompt || uiState.theme),
                currentBpm,
                keyRoot: uiState.keyRoot,
                scalePrompt: uiState.scalePrompt,
                scaleLabel: uiState.scaleLabel,
                isSlamming
            };
            const prompt = generatePrompt(state);
            
            engine.resetAiSession(deck, prompt);

             // Update deck to display the dynamic prompt parts on waveform
            const targetDeck = deck === 'A' ? deckA : deckB;
            const displayParts = getDisplayPromptParts(state);
            targetDeck.generatedPrompt = displayParts.join(' • ');
            
            if (import.meta.env.DEV) console.log(`[GEN ${deck} (HARD RESET)] ${prompt}`);
            return; // EXIT EARLY - resetAiSession handles the prompt update
        } else {
             if (import.meta.env.DEV) console.log(`[GEN HANDLER] Deck ${deck} is PLAYING -> No forced clear.`);
        }
        
        // Trigger Generation (Normal Flow for Playing Deck)
        const currentBpm = engine.masterBpm;
        const state = {
            ...uiState,
            deckId: deck,
            deckPrompt: deck === 'A' ? (uiState.deckAPrompt || uiState.theme) : (uiState.deckBPrompt || uiState.theme),
            currentBpm,
            keyRoot: uiState.keyRoot,
            scalePrompt: uiState.scalePrompt,
            scaleLabel: uiState.scaleLabel,
            isSlamming
        };
        const prompt = generatePrompt(state);
        engine.updateAiPrompt(deck, prompt, 1.0);
        
        // Update deck to display the dynamic prompt parts on waveform
        const targetDeck = deck === 'A' ? deckA : deckB;
        const displayParts = getDisplayPromptParts(state);
        targetDeck.generatedPrompt = displayParts.join(' • ');
        
        if (import.meta.env.DEV) console.log(`[GEN ${deck} (Update)] ${prompt}`);
    };

    // --- VISUAL / FX SYNC ---
    // Forward FX Rack changes to Visual Engine
    window.addEventListener('param-change', (e: any) => {
        const { id, val } = e.detail;
        // console.log(`[FX->VIZ] ${id}: ${val}`);
        
        // Forward as a generic message to ThreeViz
        // ThreeViz will need to handle these IDs
        // Map common IDs to visual friendly names if needed, or just pass through
        threeViz.sendMessage(id, val);
    });

    // Forward Mixer changes (EQ, Crossfader)
    window.addEventListener('mixer-change', (e: any) => {
        const { id, val } = e.detail;
        threeViz.sendMessage(id, val);
    });

    // Attach specifically to deck instances to avoid global bubbling confusion (though window bubbling should work if deckId is correct)
    deckA.addEventListener('deck-load-random', handleLoadRandom as EventListener);
    deckB.addEventListener('deck-load-random', handleLoadRandom as EventListener);
    
    // --- LOOK-AHEAD VISUAL SYNC ---
    window.addEventListener('visual-score-update', (e: any) => {
        const { deck, score } = e.detail;
        
        // Calculate Stream Time
        // The chunk just arrived at the WRITE buffer.
        // So its start time is (writePointer - offset) / 44100 ?
        // Actually, let's assume the score corresponds to the *latest* audio written.
        // AudioEngine write pointer is global for the circular buffer (infinite stream simulation?)
        // Actually AudioEngine uses Read/Write pointers on SAB.
        
        // We need the Write Pointer converted to seconds.
        // Note: MusicClient logic in flushArchive() processes 'merged' chunk.
        // It pushes to 'archiveBuffer' as it plays? No, MusicClient writes to SAB.
        // 'archiveBuffer' accumulates what WAS written.
        // So this chunk represents the audio ending at Current Write Pointer.
        
        const writePtr = engine.getWritePointer(); // Frames?
        // AudioEngine.getWritePointer returns index.
        // Since it's a ring buffer, the index wraps.
        // BUT MusicClient tracks "Total Samples Written"? No.
        
        // Simpler approach for now:
        // Use `audioContext.currentTime` + BufferLatency?
        // Or assumes 'writePtr' is monotonically increasing in the underlying engine/processor?
        // Processor usually increments monotonic pointers.
        
        // Let's use `engine.getWritePointer()` assuming it's monotonic (from Processor logic).
        // If it wraps, we have a problem. 
        // Processor usually: `Atomics.store(..., ptr + 128)`. It does NOT wrap in value, only in access.
        // So it is monotonic.
        
        const endFrame = engine.getWritePointer();
        // The chunk size ... we don't know exact chunk size here unless passed.
        // VisualChunk doesn't have duration? It has timeline events with 'time'.
        // Assuming chunk is recent.
        // Let's rely on MusicClient to eventually pass exact timestamp or we approximate.
        
        // Approximation: This chunk ends NOW at the write head.
        // So Start Time = End Time - (Duration of Chunk).
        // Duration ~ 4 seconds (from MusicClient constant).
        
        const nowSeconds = endFrame / 44100.0;
        const estimatedDuration = 4.0; // Fixed in MusicClient
        const startTime = Math.max(0, nowSeconds - estimatedDuration);
        
        if (import.meta.env.DEV) {
            // console.log(`[Main] Visual Update [${deck}] @ ${startTime.toFixed(2)}s`);
        }
        
        threeViz.addVisualScore(deck, score, startTime);
    });

    // --- SAVE LOOP HANDLER ---
    // Import LibraryStore dynamically to avoid circular deps
    let libraryStore: any = null;
    const getLibraryStore = async () => {
        if (!libraryStore) {
            const { LibraryStore } = await import('./audio/db/library-store');
            libraryStore = new LibraryStore();
            await libraryStore.init();
        }
        return libraryStore;
    };

    // Create Save Dialog Helper
    const showSaveDialog = (): Promise<{ bars: number; name: string } | null> => {
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
                background: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', 
                alignItems: 'center', zIndex: '2000'
            });

            const dialog = document.createElement('div');
            Object.assign(dialog.style, {
                background: '#111', border: '1px solid #333', borderRadius: '8px',
                padding: '20px', width: '300px', color: '#ccc', fontFamily: 'monospace'
            });

            const now = new Date();
            const defaultName = `Loop_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;

            dialog.innerHTML = `
                <h3 style="margin: 0 0 16px 0; color: #10b981; font-size: 14px;">💾 SAVE LOOP</h3>
                
                <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #888;">小節数</label>
                <select id="save-bars" style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; margin-bottom: 12px; font-size: 14px;">
                    <option value="8">8 小節</option>
                    <option value="16">16 小節</option>
                    <option value="32" selected>32 小節</option>
                    <option value="64">64 小節</option>
                    <option value="128">128 小節</option>
                </select>
                
                <label style="display: block; margin-bottom: 4px; font-size: 11px; color: #888;">名前</label>
                <input id="save-name" type="text" value="${defaultName}" 
                       style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #fff; border-radius: 4px; margin-bottom: 16px; box-sizing: border-box;">
                
                <div style="display: flex; gap: 8px;">
                    <button id="save-cancel" style="flex: 1; padding: 10px; background: #333; border: 1px solid #444; color: #888; border-radius: 4px; cursor: pointer;">CANCEL</button>
                    <button id="save-confirm" style="flex: 1; padding: 10px; background: #10b981; border: none; color: #000; border-radius: 4px; cursor: pointer; font-weight: bold;">SAVE</button>
                </div>
            `;

            overlay.appendChild(dialog);
            document.body.appendChild(overlay);

            const barsSelect = dialog.querySelector('#save-bars') as HTMLSelectElement;
            const nameInput = dialog.querySelector('#save-name') as HTMLInputElement;
            const cancelBtn = dialog.querySelector('#save-cancel') as HTMLButtonElement;
            const confirmBtn = dialog.querySelector('#save-confirm') as HTMLButtonElement;

            nameInput.focus();
            nameInput.select();

            const cleanup = () => overlay.remove();

            cancelBtn.onclick = () => { cleanup(); resolve(null); };
            overlay.onclick = (e) => { if (e.target === overlay) { cleanup(); resolve(null); } };

            confirmBtn.onclick = () => {
                const bars = parseInt(barsSelect.value);
                const name = nameInput.value.trim() || defaultName;
                cleanup();
                resolve({ bars, name });
            };

            nameInput.onkeydown = (e) => { if (e.key === 'Enter') confirmBtn.click(); };
        });
    };


    const handleSaveLoop = async (e: CustomEvent) => {
        const deck = e.detail.deck as 'A' | 'B';
        if (import.meta.env.DEV) console.log(`[SAVE HANDLER] Saving loop from Deck ${deck}`);

        // Show save dialog
        const result = await showSaveDialog();
        if (!result) {
            console.log('[SAVE HANDLER] Save cancelled by user');
            return;
        }
        const { bars, name } = result;

        // Extract selected bars from buffer
        const loopData = engine.extractLoopBuffer(deck, bars);
        if (!loopData) {
            console.warn('[SAVE HANDLER] Failed to extract loop data');
            return;
        }

        // --- Audio Validity Check ---
        const { analyzeAudioValidity } = await import('./audio/utils/audio-analysis');
        const validityResult = analyzeAudioValidity(loopData.pcmData, 44100, 0.001, 0.8);
        
        if (!validityResult.hasEnoughAudio) {
            const validPercent = Math.round(validityResult.validRatio * 100);
            const proceed = confirm(
                `⚠️ 警告: オーディオの ${validPercent}% しか有効な音声がありません。\n` +
                `(${100 - validPercent}% が無音部分です)\n\n` +
                `このまま保存しますか？`
            );
            if (!proceed) {
                console.log('[SAVE HANDLER] Save cancelled due to insufficient audio');
                return;
            }
        }

        // Get current prompt for metadata
        const targetDeck = deck === 'A' ? deckA : deckB;
        const prompt = (targetDeck as any).generatedPrompt || uiState.theme || 'Unknown';

        // --- Auto-generate tags from UI state ---
        const currentBpm = engine.masterBpm;
        const promptState = {
            ...uiState,
            deckId: deck,
            deckPrompt: uiState.theme,
            currentBpm,
            keyRoot: uiState.keyRoot,
            scalePrompt: uiState.scalePrompt,
            scaleLabel: uiState.scaleLabel,
            isSlamming
        };
        const tags = getDisplayPromptParts(promptState);
        if (import.meta.env.DEV) console.log('[SAVE HANDLER] Auto-generated tags:', tags);

        // Analyze audio for vector (simple RMS-based)
        let brightness = 0, energy = 0, rhythm = 0;
        const samples = loopData.pcmData;
        for (let i = 0; i < samples.length; i++) {
            const s = Math.abs(samples[i]);
            energy += s * s;
            if (i > 0 && Math.sign(samples[i]) !== Math.sign(samples[i-1])) {
                brightness += 1;
            }
        }
        energy = Math.sqrt(energy / samples.length);
        brightness = brightness / samples.length * 100;
        rhythm = 0.5;

        // Save to library
        try {
            const store = await getLibraryStore();
            await store.saveSample({
                name,
                prompt,
                duration: loopData.duration,
                bpm: loopData.bpm,
                tags,
                vector: { brightness, energy, rhythm },
                pcmData: loopData.pcmData,
                validAudioRatio: validityResult.validRatio
            });
            console.log(`[SAVE HANDLER] Loop saved: ${name} (${loopData.duration.toFixed(1)}s @ ${loopData.bpm} BPM) [Valid: ${Math.round(validityResult.validRatio * 100)}%] [Tags: ${tags.join(', ')}]`);
            
            // Visual feedback
            alert(`ループを保存しました: ${name}\nタグ: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);
        } catch (err) {
            console.error('[SAVE HANDLER] Failed to save loop:', err);
            alert('保存に失敗しました');
        }
    };

    deckA.addEventListener('deck-save-loop', handleSaveLoop as EventListener);
    deckB.addEventListener('deck-save-loop', handleSaveLoop as EventListener);
    
    // Also keep window listener for other events, but remove the global 'deck-load-random' block.



    // 2. Controls (Bio Sliders)
    const controlsContainer = document.createElement('div');
    controlsContainer.slot = 'controls';
    controlsContainer.style.display = 'grid';
    // (State definitions moved to top)



    // --- AI PARAMETER GRID (7 SLOTS + Custom + KEY/SCALE w/RANDOM) ---
    // controlsContainer.style.height = '100%'; // Handled by class
    // controlsContainer.style.alignItems = 'stretch';
    // 9 columns: 5 sliders + 2 combos + 1 custom + 1 key/scale with random
    // controlsContainer.style.gridTemplateColumns = 'repeat(9, 1fr)';
    controlsContainer.className = 'controls-grid';

    // Store references to sliders for randomization
    const sliderRefs: { name: string, wrapper: HTMLElement, slider: HTMLElement }[] = [];
    const comboRefs: { name: string, wrapper: HTMLElement, select: HTMLSelectElement, slider: HTMLElement }[] = [];

    // Helper to create slider with reference
    const createAiSliderWithRef = (label: string, onChange: (val: number) => void): HTMLElement => {
        const wrapper = createAiSlider(label, onChange);
        const slider = wrapper.querySelector('bio-slider') as HTMLElement;
        if (slider) {
            sliderRefs.push({ name: label, wrapper, slider });
        }
        return wrapper;
    };

    // Helper to create combo slot with reference
    const createComboSlotWithRef = (label: string, options: string[], onChange: (sel: string, val: number) => void): HTMLElement => {
        const wrapper = createComboSlot(label, options, onChange);
        const select = wrapper.querySelector('select') as HTMLSelectElement;
        const slider = wrapper.querySelector('bio-slider') as HTMLElement;
        if (select && slider) {
            comboRefs.push({ name: label, wrapper, select, slider });
        }
        return wrapper;
    };

    // 1. AMBIENT
    controlsContainer.appendChild(createAiSliderWithRef('AMBIENT', (v) => {
        uiState.valAmbient = v;
        // updatePrompts(); // Latch: Only update on GEN
    }));
    
    // 2. MINIMAL
    controlsContainer.appendChild(createAiSliderWithRef('MINIMAL', (v) => {
        uiState.valMinimal = v;
        // updatePrompts();
    }));
    
    // 3. DUB
    controlsContainer.appendChild(createAiSliderWithRef('DUB', (v) => {
        uiState.valDub = v;
        // updatePrompts();
    }));

    // 4. IMPACT
    controlsContainer.appendChild(createAiSliderWithRef('IMPACT', (v) => {
        uiState.valImpact = v;
        // updatePrompts();
    }));

    // 5. COLOR
    controlsContainer.appendChild(createAiSliderWithRef('COLOR', (v) => {
        uiState.valColor = v;
        // updatePrompts();
    }));

    // TEXTURE options array for combo slot
    const textureOptions = [
        'Field Recordings Nature', 
        'Industrial Factory Drone', 
        'Tape Hiss Lo-Fi', 
        'Underwater Hydrophone'
    ];

    // 6. TEXTURE (Combo)
    controlsContainer.appendChild(createComboSlotWithRef('TEXTURE', textureOptions, (sel, val) => {
        uiState.typeTexture = sel;
        uiState.valTexture = val;
        // updatePrompts();
    }));

    // PULSE options array for combo slot
    const pulseOptions = [
        'Sub-bass Pulse', 
        'Granular Clicks', 
        'Deep Dub Tech Rhythm', 
        'Industrial Micro-beats'
    ];

    // 7. PULSE (Renamed from RHYTHM)
    controlsContainer.appendChild(createComboSlotWithRef('PULSE', pulseOptions, (sel, val) => {
        uiState.typePulse = sel;
        uiState.valPulse = val;
        // updatePrompts();
    }));

    // 8. CUSTOM
    controlsContainer.appendChild(createCustomSlot((text, val) => {
        uiState.theme = text;
        // updatePrompts();
    }));

    // 9. KEY / SCALE + RANDOM (Combined Slot)
    const scaleLabels = SCALE_OPTIONS.map(o => o.label);
    
    // Create combined wrapper for KEY/SCALE/RANDOM
    const keyScaleRandomWrapper = document.createElement('div');
    keyScaleRandomWrapper.className = "flex flex-col flex-1 border border-white/20 bg-black/40 rounded-lg overflow-hidden";
    
    // Helper to create select - returns { container, sel } for reference
    const createInlineSelect = (lbl: string, opts: string[], onUpdate: (val: string) => void) => {
        const container = document.createElement('div');
        // Increased vertical padding (py-1.5) and bottom margin for clearance
        container.className = "flex flex-col border-b border-white/10 py-1 mb-1";
        
        const header = document.createElement('div');
        header.textContent = lbl;
        header.className = "bg-black/50 text-zinc-500 text-[9px] px-1.5 py-0.5 font-mono tracking-wider mb-1";
        container.appendChild(header);

        const sel = document.createElement('select');
        sel.className = "bg-transparent text-white text-[11px] p-1.5 font-mono outline-none w-full appearance-none cursor-pointer hover:bg-white/5";
        
        // Add "None" option
        const noneOpt = document.createElement('option');
        noneOpt.value = "";
        noneOpt.textContent = "---";
        noneOpt.style.backgroundColor = "#000";
        noneOpt.style.color = "#fff";
        sel.appendChild(noneOpt);

        opts.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt;
            el.textContent = opt.split(' ').slice(0, 2).join(' ').toUpperCase();
            el.style.backgroundColor = "#000";
            el.style.color = "#fff";
            sel.appendChild(el);
        });
        
        sel.onchange = (e: any) => onUpdate(e.target.value);
        container.appendChild(sel);
        return { container, sel };
    };

    // KEY selector
    const keySelect = createInlineSelect('KEY', ROOT_OPTIONS, (root) => {
        uiState.keyRoot = root;
        // updatePrompts();
    });
    keyScaleRandomWrapper.appendChild(keySelect.container);

    // SCALE selector
    const scaleSelect = createInlineSelect('SCALE', scaleLabels, (scaleLbl) => {
        const opt = SCALE_OPTIONS.find(o => o.label === scaleLbl);
        if (opt) {
            uiState.scaleLabel = opt.label;
            uiState.scalePrompt = opt.prompt;
        } else {
            uiState.scaleLabel = "";
            uiState.scalePrompt = "";
        }
        // updatePrompts();
    });
    keyScaleRandomWrapper.appendChild(scaleSelect.container);

    // RANDOM button (below KEY/SCALE)
    const randomBtnContainer = document.createElement('div');
    randomBtnContainer.className = "flex-1 flex items-center justify-center py-2";

    const randomBtn = document.createElement('button');
    randomBtn.textContent = 'RANDOM';
    
    // Increased size to 80px (w-20 -> ~80px) and font size (text-xs / 12px)
    randomBtn.style.width = '80px';
    randomBtn.style.height = '80px';
    randomBtn.style.borderRadius = '50%';
    
    randomBtn.className = "bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white font-mono text-xs font-bold border border-white/10 transition-all duration-150 cursor-pointer flex items-center justify-center shadow-lg active:scale-95 active:border-tech-cyan/50 tracking-wider";
    
    randomBtn.onclick = () => {
        // Randomize all main sliders (0-100)
        sliderRefs.forEach(ref => {
            const randomVal = Math.floor(Math.random() * 100);
            (ref.slider as any).value = randomVal;
            ref.slider.dispatchEvent(new CustomEvent('change', { 
                detail: randomVal, 
                bubbles: true, 
                composed: true 
            }));
        });

        // Randomize combo slot types and values
        comboRefs.forEach(ref => {
            const optionCount = ref.select.options.length;
            const randomIndex = Math.floor(Math.random() * optionCount);
            ref.select.selectedIndex = randomIndex;
            ref.select.dispatchEvent(new Event('change', { bubbles: true }));

            const randomVal = Math.floor(Math.random() * 100);
            (ref.slider as any).value = randomVal;
            ref.slider.dispatchEvent(new CustomEvent('change', { 
                detail: randomVal, 
                bubbles: true, 
                composed: true 
            }));
        });

        // Randomize KEY
        // includes empty option? maybe skip it. options[0] is ---.
        // Let's pick a valid key/scale usually.
        const keyOpts = keySelect.sel.options;
        if (keyOpts.length > 1) {
             const rKey = Math.floor(Math.random() * (keyOpts.length - 1)) + 1;
             keySelect.sel.selectedIndex = rKey;
             keySelect.sel.dispatchEvent(new Event('change'));
        }

        // Randomize SCALE
        const scaleOpts = scaleSelect.sel.options;
        if (scaleOpts.length > 1) {
             const rScale = Math.floor(Math.random() * (scaleOpts.length - 1)) + 1;
             scaleSelect.sel.selectedIndex = rScale;
             scaleSelect.sel.dispatchEvent(new Event('change'));
        }

        // Visual feedback
        randomBtn.style.color = '#fff';
        randomBtn.style.borderColor = '#fff';
        setTimeout(() => {
            randomBtn.style.color = '';
            randomBtn.style.borderColor = '';
        }, 150);
    };

    randomBtnContainer.appendChild(randomBtn);
    keyScaleRandomWrapper.appendChild(randomBtnContainer);
    controlsContainer.appendChild(keyScaleRandomWrapper); // Ensure it's appended

    shell.appendChild(controlsContainer);

    // 3. Actions Panel (Right Bottom)
    // Structure: Grid of small controls (Top) + Slam Button (Bottom)
    const actionsContainer = document.createElement('div');
    actionsContainer.slot = 'actions';
    actionsContainer.style.height = '100%';
    actionsContainer.style.display = 'flex';
    actionsContainer.style.flexDirection = 'column';
    actionsContainer.style.gap = '8px';

    const gridControls = document.createElement('div');
    gridControls.style.display = 'grid';
    gridControls.style.gridTemplateColumns = '1fr 1fr';
    gridControls.style.gap = '8px';
    gridControls.style.height = '40%'; // Occupy top part

    // --- GHOST EDITOR ---
    let ghostEditorOverlay: HTMLElement | null = null;
    const toggleGhostEditor = () => {
         if (ghostEditorOverlay) {
            ghostEditorOverlay.remove();
            ghostEditorOverlay = null;
            return;
        }
        
        ghostEditorOverlay = mkOverlay("GHOST PARAMETERS", "#00ffff"); // Cyan theme
        
        mkSliderHelper(ghostEditorOverlay, "FADE LENGTH", 'GHOST_FADE', 0.5, 0, 1, engine);
        mkSliderHelper(ghostEditorOverlay, "EQUALIZER (Dark<>Bright)", 'GHOST_EQ', 0.5, 0, 1, engine);
        mkSliderHelper(ghostEditorOverlay, "TAPE ECHO SEND", 'DUB', 0.0, 0, 1, engine);
        
        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all";
        close.style.padding = "8px";
        close.style.marginTop = "8px";
        close.style.cursor = "pointer";
        close.onclick = () => toggleGhostEditor();
        ghostEditorOverlay.appendChild(close);
        
        document.body.appendChild(ghostEditorOverlay);
    };

    // --- GHOST MODULE ---
    const ghostModule = createFxModule("GHOST", "GHOST", () => toggleGhostEditor(), engine);
    gridControls.appendChild(ghostModule);

    // --- SLICER EDITOR (Formerly Head B) ---
    let slicerOverlay: HTMLElement | null = null;
    const toggleSlicerEditor = () => {
        if (slicerOverlay) { slicerOverlay.remove(); slicerOverlay = null; return; }
        
        slicerOverlay = mkOverlay("SLICER PARAMS", "#10b981"); // Emerald
        
        // Slicer Params
        mkSliderHelper(slicerOverlay, "PATTERN LENGTH", 'SLICER_PATTERN', 0.25, 0, 1, engine);
        mkSliderHelper(slicerOverlay, "GATE TIME", 'SLICER_GATE', 0.5, 0, 1, engine);
        mkSliderHelper(slicerOverlay, "SPEED DIV", 'SLICER_SPEED', 0.5, 0, 1, engine);
        mkSliderHelper(slicerOverlay, "SMOOTHING", 'SLICER_SMOOTH', 0.1, 0, 0.99, engine);
        mkSliderHelper(slicerOverlay, "RANDOMIZE", 'SLICER_RANDOM', 0, 0, 1, engine);

        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white/20 p-2 mt-2";
        close.onclick = () => toggleSlicerEditor();
        slicerOverlay.appendChild(close);
        
        document.body.appendChild(slicerOverlay);
    };

    const slicerModule = createFxModule("SLICER", "SLICER", () => toggleSlicerEditor(), engine);
    gridControls.appendChild(slicerModule);
    
    actionsContainer.appendChild(gridControls);
    


    // 4. SLAM BUTTON & WRAPPER
    // Create Button First
    const slamBtn = document.createElement('slam-button');
    slamBtn.style.flex = "1";
    slamBtn.style.position = "relative";
    slamBtn.setAttribute('label', 'SLAM // MASTER FX');


    // SLAM CONFIGURATION (Customizable)
    const slamConfig = {
        maxCutoff: 10000,
        maxRes: 15.0,
        maxDrive: 4.0, // Reduced from 10.0 (User req: Milder default)
        maxNoise: 0.1, // Reduced from 0.2 (User req: Milder default)
        
        // Base values (Safe state)
        baseCutoff: 20.0,
        baseRes: 1.0, 
        baseDrive: 1.0,
        baseNoise: 0.0
    };

    // SLAM MACRO: Energy Riser (Resonance HPF + Saturation + Noise)
    const updateSlamParams = (x: number, y: number) => {
        // Clamp 0..1
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        
        // Y-Axis (Vertical): Intensity / Energy
        // Top (Y=0) is Max Energy
        const intensity = 1.0 - y; 
        
        // 1. Filter Cutoff (Exponential Sweep 20Hz -> Config Max)
        // const minFreq = 20;
        // const maxFreq = 10000;
        const cutoff = slamConfig.baseCutoff * Math.pow(slamConfig.maxCutoff / slamConfig.baseCutoff, intensity);
        
        // 2. Filter Resonance (X-Axis)
        // Left(0) = Low Res(1.0), Right(1) = High Res(Config Max)
        const resonance = 1.0 + (x * (slamConfig.maxRes - 1.0));

        // 3. Drive (Saturation)
        // Linked to Intensity (Energy)
        const drive = 1.0 + (intensity * (slamConfig.maxDrive - 1.0));

        // 4. Noise Level (Pink Noise)
        // Linked to Intensity
        const noiseLevel = intensity * slamConfig.maxNoise;

        engine.updateDspParam('SLAM_CUTOFF', cutoff);
        engine.updateDspParam('SLAM_RES', resonance);
        engine.updateDspParam('SLAM_DRIVE', drive);
        engine.updateDspParam('SLAM_NOISE', noiseLevel);
    };

    // --- SLAM EDITOR ---
    let slamOverlay: HTMLElement | null = null;
    const toggleSlamEditor = () => {
         if (slamOverlay) { slamOverlay.remove(); slamOverlay = null; return; }
         
         slamOverlay = mkOverlay("SLAM CONFIG", "#ef4444"); // Red
         
         // Helper to update config and engine param via existing slider helper logic?
         // mkSliderHelper calls engine.updateDspParam directly.
         // We need it to update slamConfig.
         // Let's use a wrapper function or modify mkSliderHelper usage pattern if possible,
         // OR just create a slider manually here since it's just 4 params.
         // Actually, let's just make a little helper function here to avoid reinventing wheel.
         
         const mkConfigSlider = (label: string, configKey: keyof typeof slamConfig, min: number, max: number, step: number = 0.01) => {
             const container = document.createElement('div');
             container.className = "flex flex-col gap-1 mb-2";
             
             const header = document.createElement('div');
             header.className = "flex justify-between text-[0.6rem] font-mono text-zinc-400";
             const title = document.createElement('span');
             title.textContent = label;
             const valSpan = document.createElement('span');
             valSpan.textContent = slamConfig[configKey].toFixed(2);
             
             header.appendChild(title);
             header.appendChild(valSpan);
             
             const slider = document.createElement('input');
             slider.type = "range";
             slider.min = String(min);
             slider.max = String(max);
             slider.step = String(step);
             slider.value = String(slamConfig[configKey]);
             slider.className = "w-full h-1 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full";
             
             slider.oninput = (e: any) => {
                 const v = parseFloat(e.target.value);
                 // @ts-ignore
                 slamConfig[configKey] = v;
                 valSpan.textContent = v.toFixed(2);
             };
             
             container.appendChild(header);
             container.appendChild(slider);
             slamOverlay!.appendChild(container);
         };

         mkConfigSlider("MAX DRIVE", 'maxDrive', 1.0, 20.0, 0.1);
         mkConfigSlider("MAX NOISE", 'maxNoise', 0.0, 1.0, 0.01);
         mkConfigSlider("MAX RES", 'maxRes', 1.0, 30.0, 0.5);
         mkConfigSlider("MAX CUTOFF", 'maxCutoff', 1000, 20000, 100);

         const close = document.createElement('button');
         close.textContent = "CLOSE";
         close.className = "b-all font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white/20 p-2 mt-2 w-full text-center";
         close.onclick = () => toggleSlamEditor();
         slamOverlay.appendChild(close);
         
         document.body.appendChild(slamOverlay);
    };
    
    // RELEASE: Return to Clean State
    const releaseSlam = () => {
        if (!isSlamming) return;
        isSlamming = false;
        
        // Reset Params to Safe Defaults
        engine.updateDspParam('SLAM_CUTOFF', 20.0); // Open/Low HPF (Pass-through if logic dictates, but HPF @ 20Hz is safe)
        engine.updateDspParam('SLAM_RES', 1.0);
        engine.updateDspParam('SLAM_DRIVE', 1.0);
        engine.updateDspParam('SLAM_NOISE', 0.0);
        
        // Safety: Reset Legacy SLAM params to ensure no artifacts
        engine.updateDspParam('BITS', 32);
        
        // Note: New SLAM implementation in processor executes always if noise/drive/filter are active?
        // Or we should verify if we need to bypass it?
        // In this Energy Riser design, setting Noise=0, Drive=1, Cutoff=20 effectively bypasses it.
        // HPF @ 20Hz is transparent. Drive @ 1.0 is transparent (if tanh(x) ~ x for small x, wait. tanh(x) is linear near 0).
        // Yes, tanh(x) ~ x. So Drive=1 is linear? No, Drive should be gain?
        // If Drive param is 'PreScan', then 1.0 means no boost.
        // math.tanh(input * 1.0) is slightly saturated for high inputs.
        // But for normal signals < 1.0 it's close to linear.
        // Ideally we should disable the effect block if not slamming?
        // Let's rely on parameters for now as per design "Continuous".
        // But to be safe, we can set NOISE=0.
    };
    const toggleDestEditor = toggleSlamEditor;

    const handleSlamMove = (e: CustomEvent) => {
        const rect = slamBtn.getBoundingClientRect();
        const x = (e.detail.x - rect.left) / rect.width;
        const y = (e.detail.y - rect.top) / rect.height;
        updateSlamParams(x, y);
    };

    slamBtn.addEventListener('slam-start', (e: Event) => {
        isSlamming = true;
        
        updatePrompts(); // Trigger Slam Prompt
        handleSlamMove(e as CustomEvent); // Trigger immediately
    });
    
    slamBtn.addEventListener('slam-move', (e: Event) => {
        if (isSlamming) handleSlamMove(e as CustomEvent);
    });

    slamBtn.addEventListener('slam-end', () => {
        releaseSlam();
        isSlamming = false;
        updatePrompts(); // Revert Prompt
    });

    // SLAM Wrapper to hold Button + Edit Overlay
    const slamWrapper = document.createElement('div');
    slamWrapper.style.flex = "1";
    slamWrapper.style.position = "relative"; // Anchor for absolute children
    slamWrapper.style.display = "flex"; // Ensure button fills it
    slamWrapper.appendChild(slamBtn);

    const slamEdit = document.createElement('div');
    slamEdit.textContent = "EDIT";
    slamEdit.style.position = "absolute";
    slamEdit.style.top = "10px"; 
    slamEdit.style.left = "10px";
    slamEdit.style.fontSize = "0.7rem";
    slamEdit.style.color = "white"; 
    slamEdit.style.border = "1px solid white";
    slamEdit.style.padding = "4px 8px";
    slamEdit.style.backgroundColor = "rgba(0,0,0,0.8)"; 
    slamEdit.style.cursor = "pointer";
    slamEdit.style.zIndex = "100";

    slamEdit.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); 
    });
    slamEdit.onclick = (e) => {
        e.stopPropagation();
        toggleDestEditor();
    };
    slamWrapper.appendChild(slamEdit);

    actionsContainer.appendChild(slamWrapper);

    // --- LOOP LIBRARY PANEL ---
    let libraryPanelVisible = false;
    const libraryPanel = document.createElement('loop-library-panel') as any;
    const libraryPanelContainer = document.createElement('div');
    Object.assign(libraryPanelContainer.style, {
        position: 'fixed',
        top: '0',
        right: '-300px', // Start off-screen
        width: '300px',
        height: '100vh',
        background: '#0a0a0a',
        borderLeft: '1px solid #222',
        zIndex: '500',
        transition: 'right 0.3s ease-in-out',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.5)'
    });
    libraryPanelContainer.appendChild(libraryPanel);
    document.body.appendChild(libraryPanelContainer);

    const toggleLibraryPanel = () => {
        libraryPanelVisible = !libraryPanelVisible;
        libraryPanelContainer.style.right = libraryPanelVisible ? '0' : '-300px';
        if (libraryPanelVisible) {
            libraryPanel.refresh?.();
        }
    };

    // --- SIDE TOGGLE BUTTON (Right Edge) ---
    const sideToggleBtn = document.createElement('button');
    sideToggleBtn.innerHTML = `
        <span style="writing-mode: vertical-rl; text-orientation: mixed; transform: rotate(180deg);">LIBRARY</span>
    `;
    Object.assign(sideToggleBtn.style, {
        position: 'fixed',
        top: '160px', // Higher up (below header area)
        right: '0',
        // transform: 'translateY(-50%)', // Removed centering
        padding: '24px 8px', // Larger click area
        background: '#18181b', // zinc-900
        color: '#a1a1aa', // zinc-400
        border: '1px solid #27272a', // zinc-800
        borderRight: 'none',
        borderRadius: '8px 0 0 8px', // Slightly more rounded
        cursor: 'pointer',
        zIndex: '499', // Just below panel
        fontSize: '12px', // Larger text
        fontFamily: 'monospace',
        letterSpacing: '3px',
        boxShadow: '-2px 0 10px rgba(0,0,0,0.5)',
        transition: 'right 0.3s ease-in-out, background 0.2s'
    });
    
    sideToggleBtn.onmouseenter = () => { sideToggleBtn.style.background = '#27272a'; sideToggleBtn.style.color = 'white'; };
    sideToggleBtn.onmouseleave = () => { sideToggleBtn.style.background = '#18181b'; sideToggleBtn.style.color = '#a1a1aa'; };
    sideToggleBtn.onclick = toggleLibraryPanel;
    document.body.appendChild(sideToggleBtn);

    // --- CLOSE BUTTON (Inside Panel) ---
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    Object.assign(closeBtn.style, {
        position: 'absolute',
        top: '10px',
        right: '10px',
        width: '24px',
        height: '24px',
        background: 'transparent',
        border: 'none',
        color: '#71717a', // zinc-500
        fontSize: '20px',
        cursor: 'pointer',
        zIndex: '501',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: '4px'
    });
    closeBtn.onmouseenter = () => { closeBtn.style.color = 'white'; closeBtn.style.background = '#7f1d1d'; }; // Dark Red
    closeBtn.onmouseleave = () => { closeBtn.style.color = '#71717a'; closeBtn.style.background = 'transparent'; };
    closeBtn.onclick = toggleLibraryPanel;
    
    // Prepend close button to container so it stays on top/accessible
    libraryPanelContainer.appendChild(closeBtn);
    // Panel logic updates toggle
    // We also need to update side button visibility/position if needed?
    // Actually, when panel is open (right=0), it covers the button if button is right=0.
    // The spec says "Open button... change to Close button?" No, "× to close".
    // So if panel covers the button, that's fine.
    
    // Also remove the old link from actionsContainer if it was added there in previous lines
    // (The replace logic removes the creation lines of libLink, so we just don't add it)



    // Handle Loop Load from Library
    window.addEventListener('loop-load', (e: any) => {
        const { sample, deck } = e.detail;
        console.log(`[LIBRARY] Loading ${sample.name} to Deck ${deck}`);
        
        // Load sample PCM data into deck buffer
        engine.loadSampleToBuffer(deck as 'A' | 'B', sample.pcmData, sample.bpm);
        
        // Update deck UI - set BPM display
        const targetDeck = deck === 'A' ? deckA : deckB;
        (targetDeck as any).bpm = sample.bpm;
        (targetDeck as any).generatedPrompt = `[LOOP] ${sample.name}`;
        
        // Close panel after load
        toggleLibraryPanel();
        
        console.log(`[LIBRARY] Loaded "${sample.name}" to Deck ${deck}`);
    });
    
    shell.appendChild(actionsContainer);

    // Initialization Overlay
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh',
        background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center',
        zIndex: 1000
    });
    const startBtn = document.createElement('button');
    startBtn.textContent = "INITIALIZE SYSTEM";
    startBtn.style.padding = "20px";
    startBtn.style.fontFamily = "monospace";
    overlay.appendChild(startBtn);
    document.body.appendChild(overlay);

    startBtn.onclick = async () => {
        startBtn.textContent = "INITIALIZING...";
        await engine.init();
        engine.startAI(true); // Start Server Stream
        
        // Explicitly Stop Both Decks
        engine.setTapeStop('A', true);
        engine.setTapeStop('B', true);

        // Lyria: Send Initial Prompts (Ensures BPM 120 is set)
        updatePrompts();
        
        // Notify UI components
        window.dispatchEvent(new CustomEvent('playback-toggled', { detail: false }));
        
        shell.status = "LIVE (READY)";
        overlay.remove();
    };

    // Global Key Handlers
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault(); 
            if (engine.getIsPlaying()) {
                engine.pause(); // Suspends Context
                window.dispatchEvent(new CustomEvent('playback-toggled', { detail: false }));
            } else {
                engine.resume();
                window.dispatchEvent(new CustomEvent('playback-toggled', { detail: true }));
            }
        }
    });
    // --- ZEN MODE OVERLAY ---
    const zenOverlay = document.createElement('div');
    Object.assign(zenOverlay.style, {
        position: 'fixed', top: '0', left: '0',
        width: '100vw', height: '100vh',
        pointerEvents: 'none',
        display: 'none',
        zIndex: '1500'
    });

    // OFF BUTTON (Bottom Right)
    const zenOffBtn = document.createElement('button');
    zenOffBtn.textContent = 'OFF';
    Object.assign(zenOffBtn.style, {
        position: 'absolute', bottom: '20px', right: '20px',
        padding: '10px 20px',
        background: 'rgba(0,0,0,0.6)',
        color: '#fff',
        border: '1px solid rgba(255,255,255,0.3)',
        borderRadius: '6px',
        cursor: 'pointer',
        pointerEvents: 'auto',
        opacity: '0',
        transition: 'opacity 0.3s',
        fontFamily: 'monospace',
        fontWeight: 'bold',
        zIndex: '1501',
        fontSize: '12px',
        letterSpacing: '1px'
    });
    zenOffBtn.onclick = () => {
        // Toggle back via VisualControls
        (vizControls as any).toggleZenMode();
    };
    zenOverlay.appendChild(zenOffBtn);

    // VISUAL PATTERN BUTTONS (Above OFF Button)
    const zenPatternContainer = document.createElement('div');
    Object.assign(zenPatternContainer.style, {
        position: 'absolute', bottom: '70px', right: '20px',
        display: 'flex', flexDirection: 'column', gap: '6px',
        pointerEvents: 'auto',
        opacity: '0',
        transition: 'opacity 0.3s'
    });

    const patterns: Array<{id: 'organic' | 'wireframe' | 'monochrome' | 'rings' | 'suibokuga' | 'waves' | 'grid', label: string}> = [
        { id: 'organic', label: 'ORG' },
        { id: 'wireframe', label: 'MTH' },
        { id: 'monochrome', label: 'PRT' },
        { id: 'rings', label: 'RNG' },
        { id: 'suibokuga', label: 'INK' },
        { id: 'waves', label: 'WAV' },
        { id: 'grid', label: 'GRZ' }
    ];

    let currentZenPattern = 'organic';

    // Function to update zen pattern button styles
    const updateZenPatternButtons = (activeId: string) => {
        currentZenPattern = activeId;
        zenPatternContainer.querySelectorAll('button').forEach((b: any) => {
            b.style.color = b.dataset.pattern === activeId ? '#fff' : '#888';
            b.style.borderColor = b.dataset.pattern === activeId ? '#06b6d4' : 'rgba(255,255,255,0.2)';
        });
    };

    patterns.forEach(p => {
        const btn = document.createElement('button');
        btn.textContent = p.label;
        btn.dataset.pattern = p.id;
        Object.assign(btn.style, {
            padding: '10px 20px', // Same as OFF button
            fontSize: '12px',
            fontFamily: 'monospace',
            fontWeight: 'bold',
            letterSpacing: '1px',
            background: 'rgba(0,0,0,0.6)',
            color: '#888',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '6px', // Same as OFF button
            cursor: 'pointer',
            transition: 'all 0.2s'
        });
        btn.onclick = () => {
            // Call threeViz.setMode directly
            threeViz.setMode(p.id);
            // Update zen pattern button styles
            updateZenPatternButtons(p.id);
            // Sync with VisualControls
            (vizControls as any).currentMode = p.id === 'wireframe' ? 'wireframe' : p.id;
            (vizControls as any).requestUpdate?.();
        };
        zenPatternContainer.appendChild(btn);
    });

    zenOverlay.appendChild(zenPatternContainer);

    // Listen for visual mode changes from VisualControls to sync Zen buttons
    vizControls.addEventListener('visual-mode-change', (e: any) => {
        updateZenPatternButtons(e.detail.mode);
    });

    // MINI CONTROLLER (Bottom Center)
    const zenMiniCtrl = document.createElement('div');
    Object.assign(zenMiniCtrl.style, {
        position: 'absolute', bottom: '30px', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', gap: '30px', alignItems: 'center',
        padding: '12px 40px',
        background: 'rgba(0,0,0,0.3)',
        borderRadius: '40px',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.1)',
        pointerEvents: 'auto',
        opacity: '0',
        transition: 'opacity 0.3s'
    });

    // Play A
    const zenPlayA = document.createElement('button');
    zenPlayA.innerHTML = '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
    Object.assign(zenPlayA.style, {
        width: '40px', height: '40px', borderRadius: '50%',
        background: '#18181b', border: '1px solid #333',
        display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
        transition: 'all 0.2s'
    });
    const updateZenPlayA = (playing: boolean) => {
        zenPlayA.style.borderColor = playing ? '#06b6d4' : '#333';
        zenPlayA.style.boxShadow = playing ? '0 0 10px rgba(6,182,212,0.4)' : 'none';
        zenPlayA.innerHTML = playing 
            ? '<div style="width: 10px; height: 10px; background: #06b6d4; border-radius: 2px;"></div>'
            : '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
    };
    zenPlayA.onclick = () => {
        // Toggle A: if stopped, play; if playing, stop
        const shouldPlay = engine.isDeckStopped('A');
        window.dispatchEvent(new CustomEvent('deck-play-toggle', { 
            detail: { deck: 'A', playing: shouldPlay } 
        }));
    };

    // Crossfader
    const zenFader = document.createElement('input');
    zenFader.type = 'range';
    zenFader.min = '0'; zenFader.max = '1'; zenFader.step = '0.01'; zenFader.value = '0.5'; // 0=A, 1=B, center=0.5
    Object.assign(zenFader.style, {
        width: '180px', height: '4px', appearance: 'none', background: '#333', borderRadius: '2px', cursor: 'pointer',
        accentColor: '#ccc' // Simple styling
    });
    zenFader.oninput = (e: any) => {
        const val = parseFloat(e.target.value);
        engine.setCrossfader(val);
        // Sync Mixer Controls UI via event
        window.dispatchEvent(new CustomEvent('mixer-update', {
            detail: { parameter: 'crossfader', value: val }
        }));
    };

    // Play B
    const zenPlayB = document.createElement('button');
    zenPlayB.innerHTML = '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
    Object.assign(zenPlayB.style, {
        width: '40px', height: '40px', borderRadius: '50%',
        background: '#18181b', border: '1px solid #333',
        display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer',
        transition: 'all 0.2s'
    });
    const updateZenPlayB = (playing: boolean) => {
        zenPlayB.style.borderColor = playing ? '#10b981' : '#333';
        zenPlayB.style.boxShadow = playing ? '0 0 10px rgba(16,185,129,0.4)' : 'none';
        zenPlayB.innerHTML = playing 
            ? '<div style="width: 10px; height: 10px; background: #10b981; border-radius: 2px;"></div>'
            : '<div style="width: 0; height: 0; border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #ccc;"></div>';
    };
    zenPlayB.onclick = () => {
        window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deck: 'B', playing: engine.isDeckStopped('B') } }));
    };

    zenMiniCtrl.appendChild(zenPlayA);
    zenMiniCtrl.appendChild(zenFader);
    zenMiniCtrl.appendChild(zenPlayB);
    zenOverlay.appendChild(zenMiniCtrl);

    document.body.appendChild(zenOverlay);

    // Sync crossfader: Mixer Controls -> Zen Fader
    window.addEventListener('mixer-change', (e: any) => {
        if (e.detail.id === 'CROSSFADER') {
            zenFader.value = String(e.detail.val);
        }
    });

    // ZEN MODE TOGGLE LOGIC
    console.log('[Main] Registering zen-mode-toggle listener on window...');
    window.addEventListener('zen-mode-toggle', (e: any) => {
        console.log('[Main] Zen Mode Toggle:', e.detail.active);
        const isActive = e.detail.active;
        
        if (isActive) {
            viewContainer.style.display = 'none';
            // Hide Library Controls
            sideToggleBtn.style.display = 'none';
            libraryPanelContainer.style.display = 'none'; // Force hide panel if open
            
            zenOverlay.style.display = 'block';
            document.body.style.cursor = 'none'; 
        } else {
            viewContainer.style.display = 'flex';
            // Show Library Controls
            sideToggleBtn.style.display = 'block';
            // Restore library panel only if it was supposed to be visible? 
            // Actually libraryPanelVisible tracks state. 
            // If it was open, we should check `libraryPanelVisible`.
            // But simplify: valid state is panel hidden, button visible.
            // If user had panel open, effectively close it or restore state?
            // Let's rely on libraryPanelVisible state variable?
            // libraryPanelContainer.style.right is used for visibility.
            // libraryPanelContainer.style.display was not toggled before.
            // Let's just toggle the button visibility. The panel is "off screen" if closed.
            // If it was OPEN, we should hide it.
            
            if (libraryPanelVisible) {
                 libraryPanelContainer.style.display = 'block';
            } else {
                 libraryPanelContainer.style.display = 'block'; // It's usually block but off-screen.
            }
            
            zenOverlay.style.display = 'none';
            document.body.style.cursor = 'auto';
        }
    });

    // MOUSE HOVER LOGIC for OFF Button, Mini Controller, and Pattern Buttons
    let zenMouseTimer: any;
    window.addEventListener('mousemove', () => {
        if (zenOverlay.style.display === 'block') {
            zenOffBtn.style.opacity = '1';
            zenMiniCtrl.style.opacity = '1';
            zenPatternContainer.style.opacity = '1';
            document.body.style.cursor = 'auto'; // Show cursor
            
            clearTimeout(zenMouseTimer);
            zenMouseTimer = setTimeout(() => {
                if (zenOverlay.style.display === 'block') {
                    zenOffBtn.style.opacity = '0';
                    zenMiniCtrl.style.opacity = '0';
                    zenPatternContainer.style.opacity = '0';
                    document.body.style.cursor = 'none'; // Hide cursor for full immersion
                }
            }, 1000); // 1 second timeout
        }
    });

    // Sync Zen Buttons with Engine State
    window.addEventListener('deck-play-sync', (e: any) => {
        if (e.detail.deck === 'A') updateZenPlayA(e.detail.playing);
        if (e.detail.deck === 'B') updateZenPlayB(e.detail.playing);
    });

}


// End of file
