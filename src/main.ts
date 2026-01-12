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
            // Reset Speed to 1.0? Or keep? Usually keep.
            // Let's reset to 1.0 for clarity of "Unsync".
            engine.updateDspParam('SPEED', 1.0, deck as 'A' | 'B');
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

    window.addEventListener('deck-sync-toggle', (e:any) => {
        const { deck, sync } = e.detail;
        if (sync) {
            engine.syncDeck(deck as 'A' | 'B');
        } else {
            engine.updateDspParam('SPEED', 1.0, deck as 'A' | 'B');
        }
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
    const mkOverlay = (title: string) => {
        const el = document.createElement('div');
        Object.assign(el.style, {
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '280px', background: 'rgba(0,0,0,0.95)', border: '1px solid #00ffff',
            padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 2000,
            boxShadow: '0 0 30px rgba(0,255,255,0.3)'
        });
        const t = document.createElement('div');
        t.textContent = title;
        t.style.cssText = "color:#00ffff; font-weight:bold; font-size:1rem; text-align:center; margin-bottom:10px;";
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

    const toggleHeadB = () => {
        if (headBOverlay) { headBOverlay.remove(); headBOverlay = null; return; }
        headBOverlay = mkOverlay("HEAD B (SLICE)");
        mkSliderHelper(headBOverlay, "DECAY LENGTH", 'CHOPPER_DECAY', 0.92, 0, 1);
        mkSliderHelper(headBOverlay, "RHYTHM DENSITY", 'CHOPPER_DENSITY', 0.25, 0, 1); // 4/16 default
        mkSliderHelper(headBOverlay, "MIX LEVEL", 'CHOPPER_MIX', 0.5, 0, 1);
        mkSliderHelper(headBOverlay, "EQ (Dark<>Bright)", 'CHOPPER_EQ', 0.5, 0, 1);
        
        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all";
        close.style.padding = "10px";
        close.onclick = () => toggleHeadB();
        headBOverlay.appendChild(close);
        document.body.appendChild(headBOverlay);
    };
    
    // (Note: Ghost uses specific toggleGhostEditor below, but we keep toggleGhost for completeness)
    const toggleGhost = () => {
        if (ghostOverlay) { ghostOverlay.remove(); ghostOverlay = null; return; }
        ghostOverlay = mkOverlay("GHOST (CLOUD)");
        mkSliderHelper(ghostOverlay, "GHOST EQ", 'GHOST_EQ', 0.5, 0, 1);
        mkSliderHelper(ghostOverlay, "FADE RATE", 'GHOST_FADE', 0.5, 0, 1);
        
        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all";
        close.style.padding = "10px";
        close.onclick = () => toggleGhost();
        ghostOverlay.appendChild(close);
        document.body.appendChild(ghostOverlay);
    };

    let ghostEditorOverlay: HTMLElement | null = null;
    const toggleGhostEditor = () => {
         if (ghostEditorOverlay) {
            ghostEditorOverlay.remove();
            ghostEditorOverlay = null;
            return;
        }
        
        ghostEditorOverlay = document.createElement('div');
        Object.assign(ghostEditorOverlay.style, {
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '240px', background: 'rgba(50,0,50,0.95)', border: '1px solid #bd00ff', // Purple theme
            padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', zIndex: 2001,
            boxShadow: '0 0 20px rgba(189,0,255,0.2)'
        });
        
        const label = document.createElement('div');
        label.textContent = "GHOST PARAMETERS";
        label.style.color = "#bd00ff";
        label.style.fontWeight = "bold";
        label.style.fontSize = "0.8rem";
        label.style.textAlign = "center";
        ghostEditorOverlay.appendChild(label);
        
        const mkSlider = (name: string, param: string, def: number, min: number, max: number) => {
             const row = document.createElement('div');
             const slabel = document.createElement('div');
             slabel.textContent = name;
             slabel.style.fontSize = "0.7rem"; 
             slabel.style.marginBottom = "4px";
             
             const currentVal = engine.getDspParam(param) ?? def;
             const inp = document.createElement('input');
             inp.type = "range";
             inp.min = "0"; inp.max = "100";
             inp.value = String(currentVal * 100); 
             inp.style.width = "100%";
             inp.oninput = (e: any) => {
                 const v = Number(e.target.value) / 100;
                 engine.updateDspParam(param, v);
             };
             row.appendChild(slabel);
             row.appendChild(inp);
             ghostEditorOverlay!.appendChild(row);
        };
        
        mkSlider("FADE LENGTH", 'GHOST_FADE', 0.5, 0, 1);
        mkSlider("EQUALIZER (Dark<>Bright)", 'GHOST_EQ', 0.5, 0, 1);
        mkSlider("TAPE ECHO SEND", 'DUB', 0.0, 0, 1);
        
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

    // --- GHOST BUTTON ---
    const ghostBtn = document.createElement('button');
    ghostBtn.className = "b-all btn-bio"; 
    ghostBtn.style.display = "flex";
    ghostBtn.style.flexDirection = "column";
    ghostBtn.style.justifyContent = "center";
    ghostBtn.style.alignItems = "center";
    ghostBtn.style.cursor = "pointer";
    ghostBtn.style.flex = "1"; // Ensure it grows
    ghostBtn.style.width = "100%"; // Fill wrapper
    ghostBtn.style.position = "relative";
    ghostBtn.style.background = "#000"; // Black Background
    ghostBtn.style.color = "#fff"; // White Text
    ghostBtn.style.userSelect = "none"; 
    ghostBtn.style.touchAction = "none"; // Prevent scrolling/zooming on touch
    
    // Status Indicator (Small dot)
    const ghostDot = document.createElement('div');
    ghostDot.style.width = "4px";
    ghostDot.style.height = "4px";
    ghostDot.style.borderRadius = "50%";
    ghostDot.style.background = "currentColor";
    ghostDot.style.opacity = "0.2";
    ghostDot.style.marginBottom = "2px";
    ghostBtn.appendChild(ghostDot);
    
    const ghostLabel = document.createElement('span');
    ghostLabel.className = "text-xxs opacity-70";
    ghostLabel.textContent = "MASTER GHOST";
    ghostBtn.appendChild(ghostLabel);
    
    const ghostVal = document.createElement('span');
    ghostVal.style.fontWeight = "bold";
    ghostVal.textContent = "GHOST";
    ghostBtn.appendChild(ghostVal);
    
    ghostBtn.appendChild(ghostVal);
    // Edit Code Moved Outside

    // Logic
    let isGhostLocked = false;
    let isGhostHeld = false;
    // ... (Handlers) ...

    gridControls.appendChild(ghostBtn);
    
    // ... (Head B Code) ...
    // ...
    
    // --- GHOST EDITOR (Moved up) ---
    // (See above)

    const updateGhostVisuals = () => {
        const active = isGhostLocked || isGhostHeld;
        if (active) {
            ghostBtn.style.background = "#fff";
            ghostBtn.style.color = "#000";
            ghostDot.style.opacity = "1";
        } else {
            ghostBtn.style.background = "#000"; // Reset to Black
            ghostBtn.style.color = "#fff"; // Reset to White
            ghostDot.style.opacity = "0.2";
        }
        
        if (isGhostLocked) {
             ghostLabel.textContent = "LOCKED";
        } else {
             ghostLabel.textContent = "SUMMON";
        }
    };

    // Handlers
    ghostBtn.addEventListener('pointerdown', (e) => {
        // If locked, we ignore the HOLD action.
        // Wait for dblclick to unlock.
        if (isGhostLocked) return;

        ghostBtn.setPointerCapture(e.pointerId);
        isGhostHeld = true;
        engine.startGhost();
        updateGhostVisuals();
    });

    ghostBtn.addEventListener('pointerup', (e) => {
        if (isGhostLocked) return;

        isGhostHeld = false;
        ghostBtn.releasePointerCapture(e.pointerId);
        engine.stopGhost();
        updateGhostVisuals();
    });
    
    ghostBtn.addEventListener('pointercancel', (e) => {
        if (isGhostLocked) return;
        isGhostHeld = false; // Reset
        ghostBtn.releasePointerCapture(e.pointerId);
        engine.stopGhost();
        updateGhostVisuals();
    });
    
    // Double Click to Toggle Lock
    ghostBtn.addEventListener('dblclick', (e) => {
        e.preventDefault();
        
        isGhostLocked = !isGhostLocked;
        console.log("Ghost Lock:", isGhostLocked);
        
        if (isGhostLocked) {
            engine.startGhost();
        } else {
            engine.stopGhost();
            isGhostHeld = false; 
        }
        updateGhostVisuals();
    });

    // --- GHOST WRAPPER ---
    const ghostWrapper = document.createElement('div');
    ghostWrapper.style.position = "relative";
    ghostWrapper.style.display = "flex";
    ghostWrapper.style.width = "100%"; // Fill grid cell
    ghostWrapper.appendChild(ghostBtn);
    
    // --- GHOST BUTTON (Keep Logic) ---

    // Edit Indicator for Ghost (Refactored to Sibling)
    const ghostEdit = document.createElement('div');
    ghostEdit.textContent = "EDIT";
    ghostEdit.style.position = "absolute";
    ghostEdit.style.top = "4px";
    ghostEdit.style.left = "4px";
    ghostEdit.style.fontSize = "0.7rem";
    ghostEdit.style.border = "1px solid currentColor";
    ghostEdit.style.padding = "4px 8px";
    ghostEdit.style.opacity = "0.7";
    ghostEdit.style.cursor = "pointer";
    ghostEdit.style.zIndex = "10";
    // Ensure visibility against White BG
    // We will update border/color in updateGhostVisuals or use mix-blend-mode
    ghostEdit.style.mixBlendMode = "difference"; 
    
    ghostEdit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });
    ghostEdit.onclick = (e) => {
        e.stopPropagation(); 
        toggleGhostEditor();
    };
    ghostWrapper.appendChild(ghostEdit);

    // (Logic and Handlers are above)

    gridControls.appendChild(ghostWrapper);

    // --- HEAD B BUTTON ---
    let isChopperActive = false;
    const headBBtn = document.createElement('button');
    headBBtn.className = "b-all btn-bio";
    headBBtn.style.display = "flex";
    headBBtn.style.flexDirection = "column";
    headBBtn.style.justifyContent = "center";
    headBBtn.style.alignItems = "center";
    headBBtn.style.cursor = "pointer";
    headBBtn.style.background = "#000"; // Black Background
    headBBtn.style.color = "#fff"; // White Text
    headBBtn.style.flex = "1"; // Grow
    headBBtn.style.width = "100%"; // Fill wrapper
    headBBtn.style.position = "relative"; // For Edit indicator
    
    const headBLabel = document.createElement('span');
    headBLabel.className = "text-xxs opacity-70";
    headBLabel.textContent = "DECK B SLICER";
    headBBtn.appendChild(headBLabel);
    
    const headBVal = document.createElement('span');
    headBVal.style.fontWeight = "bold";
    headBVal.textContent = "OFF";
    headBBtn.appendChild(headBVal);
    
    // Toggle Handler
    headBBtn.onclick = (e) => {
        // Simple Toggle
        isChopperActive = !isChopperActive;
        headBVal.textContent = isChopperActive ? "ON" : "OFF";
        
        // UX: Inverse Colors when Active
        if (isChopperActive) {
            headBBtn.style.background = "#fff";
            headBBtn.style.color = "#000";
            headBLabel.style.color = "#000"; 
        } else {
             headBBtn.style.background = "#000";
             headBBtn.style.color = "#fff";
             headBLabel.style.color = "#fff";
        }

        engine.updateDspParam('CHOPPER_ACTIVE', isChopperActive ? 1.0 : 0.0);
    };

    headBBtn.appendChild(headBVal);
    // Edit Code Moved Outside

    // --- HEAD B WRAPPER ---
    const headBWrapper = document.createElement('div');
    headBWrapper.style.position = "relative";
    headBWrapper.style.display = "flex";
    headBWrapper.style.width = "100%"; // Fill grid cell
    headBWrapper.appendChild(headBBtn);

    // Edit Handler (Refactored to Sibling)
    const editIndicator = document.createElement('div');
    editIndicator.textContent = "EDIT";
    editIndicator.style.position = "absolute";
    editIndicator.style.top = "4px";
    editIndicator.style.left = "4px";
    editIndicator.style.fontSize = "0.7rem";
    editIndicator.style.border = "1px solid currentColor";
    editIndicator.style.padding = "4px 8px";
    editIndicator.style.opacity = "0.7";
    editIndicator.style.cursor = "pointer";
    editIndicator.style.zIndex = "10";
    editIndicator.style.mixBlendMode = "difference"; // Ensure visibility

    editIndicator.addEventListener('pointerdown', (e) => {
        e.stopPropagation(); 
    });
    editIndicator.onclick = (e) => {
        e.stopPropagation(); 
        // @ts-ignore
        toggleHeadB();
    };
    headBWrapper.appendChild(editIndicator);

    gridControls.appendChild(headBWrapper);
    actionsContainer.appendChild(gridControls);

    // --- SLAM BUTTON ---
    const slamBtn = document.createElement('slam-button');
    slamBtn.style.flex = "1"; // Fill remaining
    slamBtn.style.position = "relative"; // For Edit button
    
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
        
        // Map Intensity to Bitcrush
        // SR: Mild=12000, Max=4000 (Tuned up for less choppy sound)
        const sr = 12000 - (intensity * 8000); 
        // Bits: Mild=12, Max=5
        const bits = 12 - (intensity * 7);
        
        engine.updateDspParam('SR', sr);
        engine.updateDspParam('BITS', bits);
        
        // Spectral Gate Thresh: Mild=0.2, Max=0.8
        const thresh = 0.2 + (intensity * 0.6);
        engine.updateDspParam('GATE_THRESH', thresh);

        // X-Axis (Horizontal): Tone / Space
        // Left (x=0) = Dark/Dry. Right (x=1) = Bright/Wet.
        
        // Ghost EQ: 0..1
        engine.updateDspParam('GHOST_EQ', x);
        // DUB removed from here (now in FX Rack)
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

    const handleSlamMove = (e: PointerEvent) => {
        const rect = slamBtn.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        updateSlamParams(x, y);
    };

    slamBtn.addEventListener('pointerdown', (e) => {
        isSlamming = true; // Start slamming
        slamBtn.setPointerCapture(e.pointerId);
        handleSlamMove(e); // Trigger immediately
        slamBtn.addEventListener('pointermove', handleSlamMove);
    });
    
    slamBtn.addEventListener('pointerup', (e) => {
        slamBtn.releasePointerCapture(e.pointerId);
        slamBtn.removeEventListener('pointermove', handleSlamMove);
        releaseSlam();
    });
    
    slamBtn.addEventListener('pointercancel', (e) => {
        slamBtn.releasePointerCapture(e.pointerId);
        slamBtn.removeEventListener('pointermove', handleSlamMove);
        releaseSlam();
    });
    window.addEventListener('pointerup', releaseSlam);

    // --- DESTRUCTION EDITOR (Overlay) ---
    let destOverlay: HTMLElement | null = null;
    const toggleDestEditor = () => {
        if (destOverlay) {
            destOverlay.remove();
            destOverlay = null;
            return;
        }
        
        destOverlay = document.createElement('div');
        Object.assign(destOverlay.style, {
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: '260px', background: 'rgba(0,0,0,0.95)', 
            border: '1px solid #ff0055', // Red theme for destruction
            padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 2002,
            boxShadow: '0 0 20px rgba(255,0,85,0.3)'
        });
        
        const label = document.createElement('div');
        label.textContent = "DESTRUCTION PARAMETERS";
        label.style.color = "#ff0055";
        label.style.fontWeight = "bold";
        label.style.fontSize = "0.7rem";
        label.style.textAlign = "center";
        destOverlay.appendChild(label);
        
        const mkSlider = (name: string, param: string, def: number, min: number, max: number, transf: (v:number)=>number, invTransf: (v:number)=>number, format: (v:number)=>string) => {
             const row = document.createElement('div');
             const slabel = document.createElement('div');
             slabel.style.fontSize = "0.6rem"; 
             slabel.style.marginBottom = "2px";
             slabel.style.display = "flex";
             slabel.style.justifyContent = "space-between";
             
             // Get current DSP value or Default
             const currentDsp = engine.getDspParam(param) ?? def;
             // Inverse transform to get normalized 0..1
             const normVal = invTransf(currentDsp);
             
             const nameSpan = document.createElement('span'); nameSpan.textContent = name;
             const valSpan = document.createElement('span'); valSpan.textContent = format(currentDsp);
             slabel.appendChild(nameSpan); slabel.appendChild(valSpan);
             
             const inp = document.createElement('input');
             inp.type = "range";
             inp.min = "0"; inp.max = "100";
             inp.value = String(Math.max(0, Math.min(100, normVal * 100))); // Clamp 0-100
             inp.style.width = "100%";
             inp.oninput = (e: any) => {
                 const norm = Number(e.target.value) / 100;
                 const v = transf(norm);
                 engine.updateDspParam(param, v);
                 valSpan.textContent = format(v);
             };
             row.appendChild(slabel);
             row.appendChild(inp);
             destOverlay!.appendChild(row);
        };
        
        // Spectral Gate: v -> v. Inv: v -> v
        mkSlider("SPECTRAL GATE (THRESH)", 'GATE_THRESH', 0, 0, 1, 
            (v)=>v, (v)=>v, 
            (v)=>(v*100).toFixed(0)+'%');
        
        // Bitcrush: v -> 16 - (v*12). Inv: (16 - DSP) / 12
        mkSlider("BITCRUSHER (DEPTH)", 'BITS', 16, 4, 16, 
            (v)=> 16 - (v*12), (v)=> (16 - v) / 12, 
            (v)=>v.toFixed(1)+' bits');
        
        // Downsample: v -> 44100 - (v*40000). Inv: (44100 - DSP) / 40000
        mkSlider("DOWNSAMPLER (RATE)", 'SR', 44100, 4000, 44100, 
            (v)=> 44100 - (v*40000), (v)=> (44100 - v) / 40000,
            (v)=>(v/1000).toFixed(1)+'kHz');

        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all";
        close.style.padding = "6px";
        close.style.cursor = "pointer";
        close.onclick = () => toggleDestEditor();
        destOverlay.appendChild(close);
        
        document.body.appendChild(destOverlay);
    };

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
