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
    
    // 1. HEADER (Navigation)
    const header = document.createElement('app-header');
    viewContainer.appendChild(header);

    // View State
    header.addEventListener('view-change', (e: any) => {
         const view = e.detail.view;
         if (view === 'RACK') {
             // Rack Mode (Split) -> Hide Shell Bottom, Show FX Rack
             shell.minimal = true; // Hides controls/actions
             shell.style.height = "60%"; // Shrink Shell (Decks only)
             
             // FX Rack takes bottom 40%
             fxRack.style.display = "block";
             fxRack.style.height = "40%";
             fxRack.style.borderTop = "1px solid #444";
         } else {
             // Deck Mode (Full) -> Show Shell Bottom, Hide FX Rack
             shell.minimal = false; // Shows controls/actions
             shell.style.height = "100%";
             
             fxRack.style.display = "none";
         }
    });
    
    // 2. VIEWS
    // A. Main Shell (Default Full)
    const shell = document.createElement('app-shell') as AppShell;
    shell.style.height = "100%";
    shell.style.display = "flex"; // Ensure it takes space
    shell.style.borderBottom = "1px solid #333";
    viewContainer.appendChild(shell);
    
    // B. FX Rack (Bottom 35%)
    const fxRack = document.createElement('fx-rack') as FxRack;
    fxRack.style.display = 'none'; // Default Hidden
    fxRack.style.height = "40%";
    fxRack.addEventListener('param-change', (e: any) => {
        engine.updateDspParam(e.detail.id, e.detail.val);
    });
    viewContainer.appendChild(fxRack);
    
    document.body.appendChild(viewContainer);
    
    // -- Mount UI Modules (to shell) --

    // 0. Deck A
    const deckA = document.createElement('deck-controller');
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
    const deckB = document.createElement('deck-controller');
    deckB.deckId = "B";
    deckB.slot = 'deck-b';
    shell.appendChild(deckB);
    
    // Listen for Deck Events
    window.addEventListener('deck-play-toggle', (e:any) => {
        // TEMPORARY: Deck A Play = Check Resume
        const deck = e.detail.deck as 'A' | 'B';
        if (e.detail.playing) {
             engine.setTapeStop(deck, false);
             engine.resume();
        } else {
             engine.setTapeStop(deck, true);
        }
    });

    window.addEventListener('deck-bpm-change', (e:any) => {
        const { deck, bpm } = e.detail;
        console.log(`Deck ${deck} BPM: ${bpm}`);
        engine.setDeckBpm(deck as 'A' | 'B', bpm);
    });
    
    window.addEventListener('deck-sync-toggle', (e:any) => {
        const { deck, sync } = e.detail;
        if (sync) {
            engine.syncDeck(deck as 'A' | 'B');
        } else {
            engine.unsyncDeck(deck as 'A' | 'B');
        }
    });

    window.addEventListener('bpm-change', (e:any) => {
        const bpm = e.detail;
        engine.setMasterBpm(bpm);
    });

    window.addEventListener('deck-prompt-change', (e: any) => {
        const { deck, prompt } = e.detail;
        engine.updateAiPrompt(deck as 'A' | 'B', prompt, 1.0);
    });

    window.addEventListener('deck-load-random', (e: any) => {
        const { deck } = e.detail;
        
        // Debug: Check API Key
        // @ts-ignore
        const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            alert("⚠️ API KEY MISSING\n\nPlease set VITE_GEMINI_API_KEY in .env.local to generate audio.");
            console.error("GEN Error: No API Key found.");
            return;
        }

        const genres = [
            "Acid Techno 135BPM", "Deep House 122BPM", "Drum and Bass 174BPM", 
            "Dub Techno 120BPM", "Industrial Techno 140BPM", "Minimal Microhouse 125BPM",
            "Ambient Drone", "Lo-Fi Hip Hop", "Breakbeat Hardcore"
        ];
        const randomGenre = genres[Math.floor(Math.random() * genres.length)];
        console.log(`Deck ${deck} Random Load: ${randomGenre}`);
        
        // Parse BPM if present to pre-set Deck BPM
        const bpmMatch = randomGenre.match(/(\d+)BPM/);
        if (bpmMatch) {
            const bpm = parseInt(bpmMatch[1]);
            engine.setDeckBpm(deck as 'A' | 'B', bpm);
        }
        
        engine.updateAiPrompt(deck as 'A' | 'B', randomGenre, 1.0);
    });



    // 2. Controls (Bio Sliders)
    const controlsContainer = document.createElement('div');
    controlsContainer.slot = 'controls';
    controlsContainer.style.display = 'grid';
    controlsContainer.style.gridTemplateColumns = 'repeat(6, 1fr)';
    controlsContainer.style.gap = '8px';
    controlsContainer.style.height = '100%';
    
    // --- AI PARAMETER GRID (6 SLOTS) ---
    // Slot 1: AMBIENT
    controlsContainer.appendChild(createAiSlider('AMBIENT', 'Deep Ambient Drone Atmosphere', engine));
    
    // Slot 2: MINIMAL
    controlsContainer.appendChild(createAiSlider('MINIMAL', 'Minimal Tech Micro-house Glitch', engine));
    
    // Slot 3: DUB
    controlsContainer.appendChild(createAiSlider('DUB', 'Basic Channel Dub Techno Chords', engine));

    // Slot 4: TEXTURE
    controlsContainer.appendChild(createComboSlot('TEXTURE', [
        'Field Recordings Nature', 
        'Industrial Factory Drone', 
        'Tape Hiss Lo-Fi', 
        'Underwater Hydrophone'
    ], engine));

    // Slot 5: RHYTHM
    controlsContainer.appendChild(createComboSlot('RHYTHM', [
        'Sub-bass Pulse', 
        'Granular Clicks', 
        'Deep Dub Tech Rhythm', 
        'Industrial Micro-beats'
    ], engine));

    // Slot 6: CUSTOM INPUT
    controlsContainer.appendChild(createCustomSlot(engine));

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

    // --- SLICER MODULE (Formerly Head B) ---
    // [FIX] Define missing toggles (Stubs) to fix hoisting errors
    const toggleHeadB = () => { console.log("[UI] Slicer Editor not implemented yet."); };
    const toggleDestEditor = () => { console.log("[UI] SLAM Editor not implemented yet."); };

    const slicerModule = createFxModule("SLICER", "SLICER", () => toggleHeadB(), engine);
    gridControls.appendChild(slicerModule);

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
    let isSlamming = false;
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
        handleSlamMove(e as CustomEvent); // Trigger immediately
    });
    
    slamBtn.addEventListener('slam-move', (e: Event) => {
        if (isSlamming) handleSlamMove(e as CustomEvent);
    });

    slamBtn.addEventListener('slam-end', () => {
        releaseSlam();
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
