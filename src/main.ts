import { AudioEngine } from './audio/engine';
import './ui/shell';
import './ui/atoms/bio-slider';
import './ui/atoms/slam-button';
import './ui/modules/hydra-visualizer';
import './ui/modules/hydra-receiver';
// import './ui/modules/master-status'; // Deprecated
import './ui/modules/deck-controller'; // New
import './ui/modules/dj-mixer'; // New
import './ui/modules/fx-rack';
import type { AppShell } from './ui/shell';
import type { FxRack } from './ui/modules/fx-rack';
import type { DeckController } from './ui/modules/deck-controller';
import type { DjMixer } from './ui/modules/dj-mixer';

console.log("Prompt-DJ v2.0 'Ghost in the Groove' initializing...");

// Init Engine Early (but don't start audio context yet)
const engine = new AudioEngine();
// @ts-ignore
window.engine = engine;

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
    
    // 1. HEADER (Navigation) - MINIMAL
    const header = document.createElement('header');
    header.className = "flex justify-between items-end border-b border-white pb-2 mb-2 p-2";
    header.style.cssText = "height: 30px; box-sizing: border-box; background: #000; z-index: 1001; position: relative; border-bottom: 1px dashed #333;";
    header.innerHTML = `
        <div class="flex flex-col">
            <h1 class="text-xl font-bold tracking-tighter" style="font-size:0.8rem; line-height:1; color:#fff;">BIO:GRAM<span class="text-xs font-normal align-top ml-1" style="font-size:0.5rem; opacity:0.7">v2.1</span></h1>
        </div>
        <div class="flex gap-2">
            <button id="btn-view-deck" style="font-size:0.6rem; background:#fff; color:#000; border:none; padding:2px 4px; font-weight:bold; cursor:pointer;">DECK</button>
            <button id="btn-view-rack" style="font-size:0.6rem; background:#000; color:#888; border:1px solid #333; padding:2px 4px; font-weight:bold; cursor:pointer;">FX_RACK</button>
        </div>
        <div style="font-size: 0.75rem; text-align: right;">
             <!-- Status moved to AppShell header or kept here? AppShell has it. Removing redundancy if desired, but user didn't ask. -->
        </div>
    `;
    document.body.appendChild(header);

    // View State
    let isRackVisible = false;

    // Button Logic
    setTimeout(() => {
        const btnDeck = document.getElementById('btn-view-deck');
        const btnRack = document.getElementById('btn-view-rack');
        
        const updateView = () => {
             if (isRackVisible) {
                 // Rack Mode (Split) -> Hide Shell Bottom, Show FX Rack
                 shell.minimal = true; // Hides controls/actions
                 shell.style.height = "60%"; // Shrink Shell (Decks only)
                 
                 // FX Rack takes bottom 40%
                 fxRack.style.display = "block";
                 fxRack.style.height = "40%";
                 fxRack.style.borderTop = "1px solid #444";
                 
                 btnRack!.style.background = "#fff";
                 btnRack!.style.color = "#000";
                 btnDeck!.style.background = "#000";
                 btnDeck!.style.color = "#888";
             } else {
                 // Deck Mode (Full) -> Show Shell Bottom, Hide FX Rack
                 shell.minimal = false; // Shows controls/actions
                 shell.style.height = "100%";
                 
                 fxRack.style.display = "none";
                 
                 btnDeck!.style.background = "#fff";
                 btnDeck!.style.color = "#000";
                 btnRack!.style.background = "#000";
                 btnRack!.style.color = "#888";
             }
        };

        btnDeck?.addEventListener('click', () => { isRackVisible = false; updateView(); });
        btnRack?.addEventListener('click', () => { isRackVisible = true; updateView(); });
    }, 0);
    
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
    
    // 77. View Switch Logic REMOVED

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
        
        // Update Engine State
        engine.setDeckBpm(deck as 'A' | 'B', bpm);
        
        // Defaults to 1.0 speed (Native BPM) unless Synced
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
    // Slots 1-3: Sliders (TECHNO, ACID, DETROIT)
    // Slot 4: Dropdown (GENRE) + Slider
    // Slot 5: Dropdown (MOOD) + Slider
    // Slot 6: Custom Input + Slider

    const createAiSlider = (label: string, prompt: string, isFixed = true) => {
        const slider = document.createElement('bio-slider');
        slider.setAttribute('label', label);
        slider.setAttribute('value', "0");
        slider.addEventListener('change', (e: any) => {
            const val = e.detail / 100.0;
            // Update prompt with weight for Both Decks? Or just A?
            // Let's safe bet: Update Deck A for now as it's the primary "Creative" deck often.
            // Or both.
            engine.updateAiPrompt('A', prompt, val);
            engine.updateAiPrompt('B', prompt, val);
        });
        return slider;
    };

    // Slot 1: AMBIENT (Was TECHNO)
    controlsContainer.appendChild(createAiSlider('AMBIENT', 'Deep Ambient Drone Atmosphere'));
    
    // Slot 2: MINIMAL (Was ACID)
    controlsContainer.appendChild(createAiSlider('MINIMAL', 'Minimal Tech Micro-house Glitch'));
    
    // Slot 3: DUB (Was DETROIT)
    controlsContainer.appendChild(createAiSlider('DUB', 'Basic Channel Dub Techno Chords'));

    // Helper for List/Combo Slots
    const createComboSlot = (label: string, options: string[]) => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.flex = '1';
        wrapper.style.border = '1px solid #333';
        wrapper.style.background = 'black';
        
        // Header / Dropdown
        const select = document.createElement('select');
        select.style.background = 'black';
        select.style.color = 'white';
        select.style.border = 'none';
        select.style.borderBottom = '1px solid #333';
        select.style.fontSize = '0.6rem';
        select.style.padding = '4px';
        select.style.fontFamily = 'monospace';
        select.style.outline = 'none';
        
        options.forEach(opt => {
            const el = document.createElement('option');
            el.value = opt;
            el.value = opt;
            el.textContent = opt.split(' ').slice(0, 2).join(' ').toUpperCase(); // Short label
            wrapper.appendChild(el);
            select.appendChild(el);
        });
        wrapper.appendChild(select);
        
        const slider = document.createElement('bio-slider');
        slider.setAttribute('label', ''); // Label removed
        slider.style.flex = "1";
        slider.style.border = "none"; 
        
        let currentPrompt = options[0];
        
        select.onchange = (e: any) => {
            currentPrompt = e.target.value;
            const val = Number(slider.getAttribute('value')) / 100.0;
            if (val > 0) engine.updateAiPrompt('A', currentPrompt, val);
        };
        
        slider.addEventListener('change', (e: any) => {
             const val = e.detail / 100.0;
             engine.updateAiPrompt('A', currentPrompt, val);
        });
        
        wrapper.appendChild(slider);
        return wrapper;
    };

    // Slot 4: TEXTURE (Was GENRE)
    controlsContainer.appendChild(createComboSlot('TEXTURE', [
        'Field Recordings Nature', 
        'Industrial Factory Drone', 
        'Tape Hiss Lo-Fi', 
        'Underwater Hydrophone'
    ]));

    // Slot 5: RHYTHM (Was MOOD)
    controlsContainer.appendChild(createComboSlot('RHYTHM', [
        'Sub-bass Pulse', 
        'Granular Clicks', 
        'Deep Dub Tech Rhythm', 
        'Industrial Micro-beats'
    ]));

    // Slot 6: CUSTOM INPUT
    const createCustomSlot = () => {
        const wrapper = document.createElement('div');
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
        wrapper.style.flex = '1';
        wrapper.style.border = '1px solid #333';
        wrapper.style.background = 'black';
        
        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'CUSTOM PROMPT';
        input.style.background = 'black';
        input.style.color = '#00ff88';
        input.style.border = 'none';
        input.style.borderBottom = '1px solid #333';
        input.style.fontSize = '0.6rem';
        input.style.padding = '4px';
        input.style.fontFamily = 'monospace';
        input.style.outline = 'none';
        wrapper.appendChild(input);
        
        const slider = document.createElement('bio-slider');
        slider.setAttribute('label', '');
        slider.style.flex = "1";
        slider.style.border = "none";
        
        let prompt = "";
        
        input.onchange = (e: any) => {
            prompt = e.target.value;
        };
        
        slider.addEventListener('change', (e: any) => {
             const val = e.detail / 100.0;
             if (prompt) engine.updateAiPrompt('A', prompt, val);
        });
        
        wrapper.appendChild(slider);
        return wrapper;
    };
    
    controlsContainer.appendChild(createCustomSlot());

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

    // --- GHOST EDITOR (Defined early) ---
    // Moved Helpers here to avoid Hoisting issues
    // Editors (Lazy create)
    let headBOverlay: HTMLElement | null = null;
    let ghostOverlay: HTMLElement | null = null;
    
    // Helpers
    const mkOverlay = (title: string, color: string = '#00ffff') => {
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '280px', background: 'rgba(0,0,0,0.95)', border: `1px solid ${color}`,
            padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 2000,
            boxShadow: `0 0 30px ${color}4d`
        });
        const t = document.createElement('div');
        t.textContent = title;
        t.style.cssText = `color:${color}; font-weight:bold; font-size:1rem; text-align:center; margin-bottom:10px;`;
        el.appendChild(t);
        return el;
    };

    const mkSliderHelper = (parent: HTMLElement, name: string, param: string, def: number, min: number, max: number) => {
         const row = document.createElement('div');
         const slabel = document.createElement('div');
         slabel.textContent = name;
         slabel.style.fontSize = "0.7rem"; slabel.style.marginBottom = "4px";
         
         const inp = document.createElement('input');
         inp.type = "range"; inp.min = "0"; inp.max = "100";
         const currentVal = engine.getDspParam(param) ?? def;
         inp.value = String(currentVal * 100); inp.style.width = "100%";
         inp.oninput = (e: any) => {
             const v = Number(e.target.value) / 100;
             engine.updateDspParam(param, v);
         };
         row.appendChild(slabel); row.appendChild(inp);
         parent.appendChild(row);
    };

    let ghostEditorOverlay: HTMLElement | null = null;
    const toggleGhostEditor = () => {
         if (ghostEditorOverlay) {
            ghostEditorOverlay.remove();
            ghostEditorOverlay = null;
            return;
        }
        
        ghostEditorOverlay = mkOverlay("GHOST PARAMETERS", "#00ffff"); // Cyan theme
        
        mkSliderHelper(ghostEditorOverlay, "FADE LENGTH", 'GHOST_FADE', 0.5, 0, 1);
        mkSliderHelper(ghostEditorOverlay, "EQUALIZER (Dark<>Bright)", 'GHOST_EQ', 0.5, 0, 1);
        mkSliderHelper(ghostEditorOverlay, "TAPE ECHO SEND", 'DUB', 0.0, 0, 1);
        
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

    // --- UI HELPER: FX MODULE WITH A/B TARGET (SLAM STYLE) ---
    const createFxModule = (title: string, paramPrefix: string, onEdit: () => void) => {
        const wrapper = document.createElement('div');
        // wrapper.className = "relative w-full h-full bg-black"; // Classes missing in biogram.css
        wrapper.className = "bg-black";
        wrapper.style.position = "relative"; // CRITICAL FIX
        wrapper.style.width = "100%";
        wrapper.style.height = "100%";
        wrapper.style.minHeight = "80px"; // Match SLAM min-height

        // 1. BIG TOGGLE BUTTON (Background)
        const toggleBtn = document.createElement('button');
        toggleBtn.style.position = "absolute";
        toggleBtn.style.top = "0"; toggleBtn.style.left = "0";
        toggleBtn.style.width = "100%"; toggleBtn.style.height = "100%";
        // SLAM STRIPE PATTERN
        toggleBtn.style.background = "repeating-linear-gradient(45deg, #000, #000 2px, #111 2px, #111 4px)";
        toggleBtn.style.border = "1px solid white";
        toggleBtn.style.color = "white";
        toggleBtn.style.cursor = "pointer";
        toggleBtn.style.display = "flex";
        toggleBtn.style.flexDirection = "column"; 
        toggleBtn.style.justifyContent = "center";
        toggleBtn.style.alignItems = "center";
        toggleBtn.style.transition = "all 0.1s";
        toggleBtn.style.userSelect = "none";
        
        // Internal State
        let isActive = false;
        
        // Content
        const labelMain = document.createElement('span');
        labelMain.textContent = title;
        labelMain.style.fontSize = "1.5rem";
        labelMain.style.fontWeight = "bold";
        labelMain.style.letterSpacing = "0.1em";
        
        const labelSub = document.createElement('span');
        labelSub.textContent = "OFF";
        labelSub.style.fontSize = "0.6rem";
        labelSub.style.letterSpacing = "0.3em";
        labelSub.style.marginTop = "4px";
        
        toggleBtn.appendChild(labelMain);
        toggleBtn.appendChild(labelSub);
        
        // Hover Effects: Gray instead of white
        toggleBtn.onmouseenter = () => {
             if (!isActive) {
                 toggleBtn.style.background = "#333";
                 toggleBtn.style.color = "#ccc";
             }
        };
        toggleBtn.onmouseleave = () => {
             if (!isActive) {
                 toggleBtn.style.background = "repeating-linear-gradient(45deg, #000, #000 2px, #111 2px, #111 4px)";
                 toggleBtn.style.color = "white";
             }
        };
        
        // Click Logic: Toggle On/Off
        toggleBtn.onclick = () => {
             isActive = !isActive;
             engine.updateDspParam(`${paramPrefix}_ACTIVE`, isActive ? 1.0 : 0.0);
             
             labelSub.textContent = isActive ? "ACTIVE" : "OFF";
             
             if (isActive) {
                 toggleBtn.style.background = "white";
                 toggleBtn.style.color = "black";
             } else {
                 toggleBtn.style.background = "repeating-linear-gradient(45deg, #000, #000 2px, #111 2px, #111 4px)";
                 toggleBtn.style.color = "white";
             }
        };
        
        wrapper.appendChild(toggleBtn);

        // 2. OVERLAY CONTROLS (Floating on top)
        const overlay = document.createElement('div');
        overlay.style.position = "absolute";
        overlay.style.top = "0"; overlay.style.left = "0";
        overlay.style.width = "100%"; overlay.style.height = "100%";
        overlay.style.pointerEvents = "none"; // Let clicks pass through to Toggle
        overlay.style.zIndex = "10"; // FIX: Stay above toggle button on hover
        
        // EDIT BUTTON (Top Left)
        const editBtn = document.createElement('button');
        editBtn.textContent = "EDIT";
        editBtn.className = "text-xxs b-all px-1 bg-black text-white hover:bg-white hover:text-black";
        editBtn.style.position = "absolute";
        editBtn.style.top = "4px"; editBtn.style.left = "4px";
        editBtn.style.pointerEvents = "auto"; // Catch clicks
        editBtn.onclick = (e) => { e.stopPropagation(); onEdit(); };
        
        // A/B SWITCH (Top Right)
        const abSwitch = document.createElement('div');
        abSwitch.className = "flex b-all rounded overflow-hidden";
        abSwitch.style.position = "absolute";
        abSwitch.style.top = "4px"; abSwitch.style.right = "4px";
        abSwitch.style.pointerEvents = "auto";
        abSwitch.style.transform = "scale(0.8)"; // Smaller
        
        let target: 'A' | 'B' = 'A';
        const btnA = document.createElement('button');
        btnA.textContent = "A";
        btnA.className = "px-2 py-0 text-xs font-bold";
        btnA.style.background = "white"; btnA.style.color = "black"; // Default
        
        const btnB = document.createElement('button');
        btnB.textContent = "B";
        btnB.className = "px-2 py-0 text-xs font-bold";
        btnB.style.background = "black"; btnB.style.color = "#555";
        
        const updateTargetVisuals = () => {
             if (target === 'A') {
                 btnA.style.background = "#fff"; btnA.style.color = "#000";
                 btnB.style.background = "#000"; btnB.style.color = "#555";
             } else {
                 btnA.style.background = "#000"; btnA.style.color = "#555";
                 btnB.style.background = "#fff"; btnB.style.color = "#000";
             }
        };
        
        btnA.onclick = (e) => { e.stopPropagation(); target = 'A'; updateTargetVisuals(); engine.updateDspParam(`${paramPrefix}_TARGET`, 0.0); };
        btnB.onclick = (e) => { e.stopPropagation(); target = 'B'; updateTargetVisuals(); engine.updateDspParam(`${paramPrefix}_TARGET`, 1.0); };
        
        abSwitch.appendChild(btnA);
        abSwitch.appendChild(btnB);
        
        overlay.appendChild(editBtn);
        overlay.appendChild(abSwitch);
        
        wrapper.appendChild(overlay);
        
        return wrapper;
    };

    // --- GHOST MODULE ---
    // User Update: Toggle Mode, Selector A/B
    const ghostModule = createFxModule("GHOST", "GHOST", () => toggleGhostEditor());
    gridControls.appendChild(ghostModule);

    // --- SLICER MODULE (Formerly Head B) ---
    // User Update: Renamed to Slicer, Toggle Mode, Selector A/B
    const slicerModule = createFxModule("SLICER", "SLICER", () => toggleHeadB());
    gridControls.appendChild(slicerModule);

    actionsContainer.appendChild(gridControls);

    const slamBtn = document.createElement('slam-button');
    slamBtn.style.flex = "1"; // Fill remaining
    slamBtn.style.position = "relative"; // For Edit button
    slamBtn.setAttribute('label', 'SLAM // MASTER FX'); // Clarify Master Context
    
    // (slamEdit defined below in Wrapper)
    
    // SLAM MACRO: Maximize Destruction with XY Control
    
    // SLAM MACRO: Maximize Destruction with XY Control
    const updateSlamParams = (x: number, y: number) => {
        // Clamp 0..1
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));
        
        // Y-Axis (Vertical): Intensity / Destruction
        // Top (y=0) = MAX DESTROY. Bottom (y=1) = MILD DESTROY.
        // Invert Y for "Intensity" (0..1 where 1 is Top)
        const intensity = 1.0 - y;
        
        // Map Intensity to Bitcrush - Primary effect
        // SR: Mild=22000, Max=4000
        const sr = 22000 - (intensity * 18000); 
        // Bits: Mild=16, Max=4
        const bits = 16 - (intensity * 12);
        
        engine.updateDspParam('SR', sr);
        engine.updateDspParam('BITS', bits);
        
        // Spectral Gate: Much lower threshold (0.01-0.05) to avoid muting
        // Only cuts extremely quiet parts for a "choppy" effect
        const thresh = 0.01 + (intensity * 0.04);
        engine.updateDspParam('GATE_THRESH', thresh);
        
        // Add noise injection for classic SLAM texture
        const noiseLevel = intensity * 0.15; // Up to 15% noise
        engine.updateDspParam('NOISE_LEVEL', noiseLevel);

        // X-Axis (Horizontal): Tone / Space
        // Left (x=0) = Dark/Dry. Right (x=1) = Bright/Wet.
        
        // Ghost EQ: 0..1
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

    // Use THE ALREADY DEFINED toggleDestEditor or a local override?
    // Let's just use the shared one from above

    // SLAM Wrapper to hold Button + Edit Overlay
    const slamWrapper = document.createElement('div');
    slamWrapper.style.flex = "1";
    slamWrapper.style.position = "relative"; // Anchor for absolute children
    slamWrapper.style.display = "flex"; // Ensure button fills it
    slamWrapper.appendChild(slamBtn);

    // RESTORED: SLAM Edit Button
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

    // (Helpers moved to top)
    
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
                engine.resume(); // Resumes Context
                window.dispatchEvent(new CustomEvent('playback-toggled', { detail: true }));
            }
        }
    });
}
