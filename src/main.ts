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
import './ui/modules/fx-rack';
import './ui/modules/app-header';
import './ui/modules/loop-library-panel';
import type { AppShell } from './ui/shell';
import type { FxRack } from './ui/modules/fx-rack';
import type { DeckController } from './ui/modules/deck-controller';
import type { DjMixer } from './ui/modules/dj-mixer';
import { 
    createAiSlider, 
    createComboSlot, 
    createCustomSlot, 
    createFxModule, 
    mkOverlay, 
    mkSliderHelper 
} from './ui/ui-helpers';
import { generatePrompt, generateNegativePrompt, getDisplayPromptParts, PromptState } from './ai/prompt-generator';

console.log("Prompt-DJ v2.0 'Ghost in the Groove' initializing...");

// Init Engine Early (but don't start audio context yet)
const engine = new AudioEngine();
window.engine = engine;

// Init MIDI
const midiManager = new MidiManager();
window.midiManager = midiManager;

// ROUTING LOGIC
const urlParams = new URLSearchParams(window.location.search);
const isVizMode = urlParams.get('mode') === 'viz';

if (isVizMode) {
    // --- VJ Projector Mode ---
    document.title = "Bio:gram [PROJECTION]";
    const receiver = document.createElement('hydra-receiver');
    document.body.appendChild(receiver);
    
} else {
    // --- Main Controller Mode ---
    document.title = "Bio:gram [CONTROLLER]";
    // Reset Body
    document.body.style.margin = "0";
    document.body.style.overflow = "hidden";
    document.body.style.background = "#000";
    document.body.style.color = "#fff";
    
    // VIEW CONTAINER
    const viewContainer = document.createElement('div');
    viewContainer.style.height = 'calc(100vh - 30px)'; // Subtract header
    viewContainer.style.position = 'relative';
    viewContainer.style.overflow = 'hidden';
    viewContainer.style.display = 'flex';
    viewContainer.style.flexDirection = 'column';

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
        theme: ""
    };

    let isSlamming = false;

    // Helper to Regenerate and Send
    const updatePrompts = () => {
        const currentBpm = engine.masterBpm; 

        // DECK A
        const stateA = {
            ...uiState,
            deckId: 'A' as const,
            deckPrompt: uiState.theme,
            currentBpm,
            isSlamming
        };
        const promptA = generatePrompt(stateA);
        engine.updateAiPrompt('A', promptA, 1.0);
        if (import.meta.env.DEV) console.log(`[GEN A] ${promptA}`);

        // DECK B
        const stateB = {
            ...uiState,
            deckId: 'B' as const,
            deckPrompt: uiState.theme,
            currentBpm,
            isSlamming
        };
        const promptB = generatePrompt(stateB);
        engine.updateAiPrompt('B', promptB, 1.0);
        if (import.meta.env.DEV) console.log(`[GEN B] ${promptB}`);
    };
    
    // 1. HEADER (Navigation)
    const header = document.createElement('app-header');
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
    shell.style.height = "100%";
    shell.style.display = "flex"; // Ensure it takes space
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

    // 2. Deck B
    const deckB = document.createElement('deck-controller') as DeckController;
    deckB.deckId = "B";
    deckB.slot = 'deck-b';
    shell.appendChild(deckB);
    
    // Listen for Deck Events
    window.addEventListener('deck-play-toggle', (e:any) => {
        // TEMPORARY: Deck A Play = Check Resume
        const deck = e.detail.deck as 'A' | 'B';
        if (e.detail.playing) {
             engine.setTapeStop(deck, false);
             engine.unmute(deck); // Ensure we are unmuted (fixes GEN silence bug)
             engine.resume();
        } else {
             engine.setTapeStop(deck, true);
        }
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
        updatePrompts();
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
        } else {
             if (import.meta.env.DEV) console.log(`[GEN HANDLER] Deck ${deck} is PLAYING -> No forced clear.`);
        }
        
        // Trigger Generation
        const currentBpm = engine.masterBpm;
        const state = {
            ...uiState,
            deckId: deck,
            deckPrompt: uiState.theme,
            currentBpm,
            isSlamming
        };
        const prompt = generatePrompt(state);
        engine.updateAiPrompt(deck, prompt, 1.0);
        
        // Update deck to display the dynamic prompt parts on waveform
        const targetDeck = deck === 'A' ? deckA : deckB;
        const displayParts = getDisplayPromptParts(state);
        targetDeck.generatedPrompt = displayParts.join(' • ');
        
        if (import.meta.env.DEV) console.log(`[GEN ${deck} (Reset)] ${prompt}`);
    };

    // Attach specifically to deck instances to avoid global bubbling confusion (though window bubbling should work if deckId is correct)
    deckA.addEventListener('deck-load-random', handleLoadRandom as EventListener);
    deckB.addEventListener('deck-load-random', handleLoadRandom as EventListener);
    
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

    const handleSaveLoop = async (e: CustomEvent) => {
        const deck = e.detail.deck as 'A' | 'B';
        if (import.meta.env.DEV) console.log(`[SAVE HANDLER] Saving loop from Deck ${deck}`);

        // Extract 8 bars from buffer
        const loopData = engine.extractLoopBuffer(deck, 8);
        if (!loopData) {
            console.warn('[SAVE HANDLER] Failed to extract loop data');
            return;
        }

        // Get current prompt for metadata
        const targetDeck = deck === 'A' ? deckA : deckB;
        const prompt = (targetDeck as any).generatedPrompt || uiState.theme || 'Unknown';

        // Analyze audio for vector (simple RMS-based)
        let brightness = 0, energy = 0, rhythm = 0;
        const samples = loopData.pcmData;
        for (let i = 0; i < samples.length; i++) {
            const s = Math.abs(samples[i]);
            energy += s * s;
            // Simple brightness estimation (higher frequency = more zero crossings)
            if (i > 0 && Math.sign(samples[i]) !== Math.sign(samples[i-1])) {
                brightness += 1;
            }
        }
        energy = Math.sqrt(energy / samples.length);
        brightness = brightness / samples.length * 100; // Normalize
        rhythm = 0.5; // Placeholder - could be derived from beat detection

        // Generate default name from timestamp
        const now = new Date();
        const defaultName = `Loop_${deck}_${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}`;

        // Prompt user for name
        const name = window.prompt('ループの名前を入力:', defaultName);
        if (!name) {
            console.log('[SAVE HANDLER] Save cancelled by user');
            return;
        }

        // Save to library
        try {
            const store = await getLibraryStore();
            await store.saveSample({
                name,
                prompt,
                duration: loopData.duration,
                bpm: loopData.bpm,
                tags: [],
                vector: { brightness, energy, rhythm },
                pcmData: loopData.pcmData
            });
            console.log(`[SAVE HANDLER] Loop saved: ${name} (${loopData.duration.toFixed(1)}s @ ${loopData.bpm} BPM)`);
            
            // Visual feedback (could be enhanced with toast notification)
            alert(`ループを保存しました: ${name}`);
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



    // --- AI PARAMETER GRID (7 SLOTS + Custom) ---
    // Grid Need: 8 slots? 
    // Current layout: 'repeat(6, 1fr)'. We need more space or redefine.
    // User asked for "7 UI parameters" + Custom.
    // Ambient, Minimal, Dub, Impact, Color (5 Sliders)
    // Texture (Combo)
    // Pulse (Combo)
    // Custom (Combo/Input)
    // Total 8 slots. 4 columns x 2 rows? Or 8 columns?
    // Let's try 8 columns for now to fit wide.
    controlsContainer.style.gridTemplateColumns = 'repeat(8, 1fr)';

    // 1. AMBIENT
    controlsContainer.appendChild(createAiSlider('AMBIENT', (v) => {
        uiState.valAmbient = v;
        updatePrompts();
    }));
    
    // 2. MINIMAL
    controlsContainer.appendChild(createAiSlider('MINIMAL', (v) => {
        uiState.valMinimal = v;
        updatePrompts();
    }));
    
    // 3. DUB
    controlsContainer.appendChild(createAiSlider('DUB', (v) => {
        uiState.valDub = v;
        updatePrompts();
    }));

    // 4. IMPACT (New)
    controlsContainer.appendChild(createAiSlider('IMPACT', (v) => {
        uiState.valImpact = v;
        updatePrompts();
    }));

    // 5. COLOR (New)
    controlsContainer.appendChild(createAiSlider('COLOR', (v) => {
        uiState.valColor = v;
        updatePrompts();
    }));

    // 6. TEXTURE (Combo)
    controlsContainer.appendChild(createComboSlot('TEXTURE', [
        'Field Recordings Nature', 
        'Industrial Factory Drone', 
        'Tape Hiss Lo-Fi', 
        'Underwater Hydrophone'
    ], (sel, val) => {
        uiState.typeTexture = sel;
        uiState.valTexture = val; // Note: Spec says Ambient overrides intensity in text, but we store it just in case logic needs it
        updatePrompts();
    }));

    // 7. PULSE (Renamed from RHYTHM)
    controlsContainer.appendChild(createComboSlot('PULSE', [
        'Sub-bass Pulse', 
        'Granular Clicks', 
        'Deep Dub Tech Rhythm', 
        'Industrial Micro-beats'
    ], (sel, val) => {
        uiState.typePulse = sel;
        uiState.valPulse = val;
        updatePrompts();
    }));

    // 8. CUSTOM
    controlsContainer.appendChild(createCustomSlot((text, val) => {
        uiState.theme = text;
        // val is 0-100, might imply theme weight?
        // Spec says "deckPrompt (Theme)" is strictly the text.
        // We'll ignore val for text generation logic for now, or use it?
        // For now just text triggers update.
        updatePrompts();
    }));

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

        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white/20 p-2 mt-2";
        close.onclick = () => toggleSlicerEditor();
        slicerOverlay.appendChild(close);
        
        document.body.appendChild(slicerOverlay);
    };

    const slicerModule = createFxModule("SLICER", "SLICER", () => toggleSlicerEditor(), engine);
    gridControls.appendChild(slicerModule);


    // --- SLAM EDITOR ---
    let slamOverlay: HTMLElement | null = null;
    const toggleSlamEditor = () => {
         if (slamOverlay) { slamOverlay.remove(); slamOverlay = null; return; }
         
         slamOverlay = mkOverlay("SLAM CONFIG", "#ef4444"); // Red
         
         mkSliderHelper(slamOverlay, "NOISE FLOOR", 'NOISE_LEVEL', 0.1, 0, 1, engine);
         mkSliderHelper(slamOverlay, "CRUSH PRE-GAIN", 'CRUSH_GAIN', 1.0, 0, 2, engine); // 0..200%
         mkSliderHelper(slamOverlay, "TARGET MIX", 'SLAM_MIX', 1.0, 0, 1, engine);

         const close = document.createElement('button');
         close.textContent = "CLOSE";
         close.className = "b-all font-mono text-xs hover:bg-white hover:text-black transition-colors border border-white/20 p-2 mt-2";
         close.onclick = () => toggleSlamEditor();
         slamOverlay.appendChild(close);
         
         document.body.appendChild(slamOverlay);
    };
    
    // Pass toggleSlamEditor to specific usage if needed, but here we just needed the function definition.
    // The SlamButton uses toggleDestEditor in original code, so we map it there.
    const toggleDestEditor = toggleSlamEditor;

    actionsContainer.appendChild(gridControls);

    const slamBtn = document.createElement('slam-button');
    slamBtn.style.flex = "1"; // Fill remaining
    slamBtn.style.position = "relative"; // For Edit button
    slamBtn.setAttribute('label', 'SLAM // MASTER FX'); // Clarify Master Context
    
    // SLAM MACRO: Maximize Destruction with XY Control
    const updateSlamParams = (x: number, y: number) => {
        // Clamp 0..1
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        
        // Y-Axis (Vertical): Intensity / Destruction
        const intensity = 1.0 - y;
        
        // Map Intensity to Bitcrush - Primary effect
        const sr = 22000 - (intensity * 18000); 
        const bits = 16 - (intensity * 12);
        
        engine.updateDspParam('SR', sr);
        engine.updateDspParam('BITS', bits);
        
        // Spectral Gate
        const thresh = 0.01 + (intensity * 0.04);
        engine.updateDspParam('GATE_THRESH', thresh);
        
        // Add noise injection for classic SLAM texture
        const noiseLevel = intensity * 0.15; // Up to 15% noise
        engine.updateDspParam('NOISE_LEVEL', noiseLevel);

        // X-Axis (Horizontal): Tone / Space
        engine.updateDspParam('GHOST_EQ', x);
    };
    
    // RELEASE: Return to Clean / Safe State
    // let isSlamming = false; // (Defined at top)
    const releaseSlam = () => {
        if (!isSlamming) return; // Only release if actually slamming
        isSlamming = false;
        
        engine.updateDspParam('GATE_THRESH', 0.0); 
        engine.updateDspParam('SR', 44100); 
        engine.updateDspParam('BITS', 32); 
        engine.updateDspParam('GHOST_EQ', 0.5);
    };

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

    // Library Button
    const libLink = document.createElement('div');
    libLink.textContent = "💾 LOOP LIBRARY";
    libLink.style.textAlign = "center";
    libLink.style.fontSize = "0.6rem";
    libLink.style.padding = "6px";
    libLink.style.cursor = "pointer";
    libLink.style.opacity = "0.7";
    libLink.style.border = "1px solid #333";
    libLink.style.borderRadius = "4px";
    libLink.style.marginTop = "4px";
    libLink.onmouseenter = () => libLink.style.opacity = "1";
    libLink.onmouseleave = () => libLink.style.opacity = "0.7";
    libLink.onclick = toggleLibraryPanel;
    actionsContainer.appendChild(libLink);

    // Open Projector (Small Text Link below Actions)
    const projLink = document.createElement('div');
    projLink.textContent = "> OPEN_PROJECTOR";
    projLink.style.textAlign = "center";
    projLink.style.fontSize = "0.6rem";
    projLink.style.padding = "4px";
    projLink.style.cursor = "pointer";
    projLink.style.opacity = "0.5";
    projLink.onclick = () => window.open('/?mode=viz', 'biogram_viz');
    actionsContainer.appendChild(projLink);

    // Handle Loop Load from Library
    window.addEventListener('loop-load', (e: any) => {
        const { sample, deck } = e.detail;
        console.log(`[LIBRARY] Loading ${sample.name} to Deck ${deck}`);
        
        // Write sample PCM data to deck buffer
        // For now, just provide feedback - full playback integration would require
        // writing to the SharedArrayBuffer which is complex
        alert(`"${sample.name}" をデッキ ${deck} にロードしました\n(BPM: ${sample.bpm}, ${sample.duration.toFixed(1)}秒)`);
        
        // Close panel after load
        toggleLibraryPanel();
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
}


// End of file
