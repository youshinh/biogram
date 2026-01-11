import { AudioEngine } from './audio/engine';
import './ui/shell';
import './ui/atoms/bio-slider';
import './ui/atoms/slam-button';
import './ui/modules/hydra-visualizer';
import './ui/modules/hydra-receiver';
import './ui/modules/master-status';
import './ui/modules/fx-rack';
import type { AppShell } from './ui/shell';
import type { FxRack } from './ui/modules/fx-rack';

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
    `;
    document.body.appendChild(header);
    
    // 2. VIEWS
    // A. Main Shell (Top 65%)
    const shell = document.createElement('app-shell') as AppShell;
    shell.style.height = "65%";
    shell.style.display = "flex"; // Ensure it takes space
    shell.style.borderBottom = "1px solid #333";
    viewContainer.appendChild(shell);
    
    // B. FX Rack (Bottom 35%)
    const fxRack = document.createElement('fx-rack') as FxRack;
    fxRack.style.display = 'block'; // Always visible
    fxRack.style.height = "35%";
    fxRack.addEventListener('param-change', (e: any) => {
        engine.updateDspParam(e.detail.id, e.detail.val);
    });
    viewContainer.appendChild(fxRack);
    
    document.body.appendChild(viewContainer);
    
    // View Switch Logic REMOVED (Always split view)

    // -- Mount UI Modules (to shell) --

    // 0. Visualizer
    const viz = document.createElement('hydra-visualizer');
    viz.slot = 'visualizer';
    shell.appendChild(viz);

    // 1. Master Status (BPM & Transport)
    const masterStatus = document.createElement('master-status');
    masterStatus.slot = 'master';
    masterStatus.addEventListener('bpm-change', (e: any) => {
        engine.setBpm(e.detail);
    });
    masterStatus.addEventListener('play', () => engine.resume());
    masterStatus.addEventListener('pause', () => engine.pause());
    shell.appendChild(masterStatus);

    // 2. Controls (Bio Sliders)
    const controlsContainer = document.createElement('div');
    controlsContainer.slot = 'controls';
    controlsContainer.style.display = 'grid';
    controlsContainer.style.gridTemplateColumns = 'repeat(6, 1fr)';
    controlsContainer.style.gap = '8px';
    controlsContainer.style.height = '100%';

    const params = ['TECHNO', 'ACID', 'DUB', 'NOISE', 'DETROIT', 'GLITCH'];
    params.forEach(p => {
        const slider = document.createElement('bio-slider');
        slider.setAttribute('label', p);
        slider.setAttribute('value', "0");
        
        slider.addEventListener('change', (e: any) => {
            const val = e.detail; 
            const norm = val / 100.0;
            
            // PROMPT MAPPING
            if (p === 'TECHNO') engine.updateAiPrompt('Techno Rhythms', norm);
            if (p === 'ACID') engine.updateAiPrompt('Acid Bassline TB-303', norm);
           // if (p === 'DUB') engine.updateAiPrompt('Dub Chords', norm); // REMOVED PROMPT MAPPING
            if (p === 'DETROIT') engine.updateAiPrompt('Detroit Strings', norm);
            
            // DSP MAPPING
            if (p === 'DUB') {
                engine.updateDspParam('DUB', norm);
            }
            if (p === 'NOISE') {
                // Spectral Gate
                engine.updateDspParam('GATE_THRESH', norm);
            }
            if (p === 'GLITCH') {
                // Combined Destruction (Bitcrush + Downsample)
                // Tuned to be less destructive based on user feedback (Min SR 8k, Min Bits 6)
                const bits = 32 - (norm * 26); // 32 -> 6
                const rate = 44100 - (norm * 36100); // 44100 -> 8000
                engine.updateDspParam('BITS', bits);
                engine.updateDspParam('SR', rate);
            }
        });

        controlsContainer.appendChild(slider);
    });
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
             
             const inp = document.createElement('input');
             inp.type = "range";
             inp.min = "0"; inp.max = "100";
             inp.value = String(def * 100); 
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
    ghostBtn.style.position = "relative";
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
    ghostLabel.textContent = "SUMMON";
    ghostBtn.appendChild(ghostLabel);
    
    const ghostVal = document.createElement('span');
    ghostVal.style.fontWeight = "bold";
    ghostVal.textContent = "GHOST";
    ghostBtn.appendChild(ghostVal);
    
    // Edit Indicator for Ghost
    const ghostEdit = document.createElement('div');
    ghostEdit.textContent = "EDIT";
    ghostEdit.style.position = "absolute";
    ghostEdit.style.bottom = "2px";
    ghostEdit.style.right = "2px";
    ghostEdit.style.fontSize = "0.5rem";
    ghostEdit.style.border = "1px solid currentColor";
    ghostEdit.style.padding = "1px 3px";
    ghostEdit.style.opacity = "0.5";
    
    // Crucial: Stop Propagation to prevent Parent Button Capture!
    ghostEdit.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
    });
    ghostEdit.onclick = (e) => {
        e.stopPropagation(); 
        toggleGhostEditor();
    };
    ghostBtn.appendChild(ghostEdit);

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
            ghostBtn.style.background = "";
            ghostBtn.style.color = "";
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

    gridControls.appendChild(ghostBtn);

    // --- HEAD B BUTTON ---
    let isChopperActive = false;
    const headBBtn = document.createElement('button');
    headBBtn.className = "b-all btn-bio";
    headBBtn.style.display = "flex";
    headBBtn.style.flexDirection = "column";
    headBBtn.style.justifyContent = "center";
    headBBtn.style.alignItems = "center";
    headBBtn.style.cursor = "pointer";
    headBBtn.style.position = "relative"; // For Edit indicator
    
    const headBLabel = document.createElement('span');
    headBLabel.className = "text-xxs opacity-70";
    headBLabel.textContent = "HEAD B";
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
        headBLabel.style.color = isChopperActive ? "#00ffff" : "";
        engine.updateDspParam('CHOPPER_ACTIVE', isChopperActive ? 1.0 : 0.0);
    };

    // Edit Handler (Right Click or Long Press ideal, but let's add visual mini-button)
    const editIndicator = document.createElement('div');
    editIndicator.textContent = "EDIT";
    editIndicator.style.position = "absolute";
    editIndicator.style.bottom = "2px";
    editIndicator.style.right = "2px";
    editIndicator.style.fontSize = "0.5rem";
    editIndicator.style.border = "1px solid currentColor";
    editIndicator.style.padding = "1px 3px";
    editIndicator.style.opacity = "0.5";
    editIndicator.onclick = (e) => {
        e.stopPropagation(); // Don't toggle
        // @ts-ignore
        toggleHeadB();
    };
    headBBtn.appendChild(editIndicator);

    gridControls.appendChild(headBBtn);
    actionsContainer.appendChild(gridControls);

    // --- SLAM BUTTON ---
    const slamBtn = document.createElement('slam-button');
    slamBtn.style.flex = "1"; // Fill remaining
    
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
        
        // Dub: 0..0.98
        engine.updateDspParam('DUB', x * 0.98);
        
        // Ghost EQ: 0..1
        engine.updateDspParam('GHOST_EQ', x);
    };
    
    // RELEASE: Return to Clean / Safe State
    const releaseSlam = () => {
        engine.updateDspParam('GATE_THRESH', 0.0); 
        engine.updateDspParam('SR', 44100); 
        engine.updateDspParam('BITS', 32); 
        engine.updateDspParam('DUB', 0.0); 
        engine.updateDspParam('GHOST_EQ', 0.5);
    };

    const handleSlamMove = (e: PointerEvent) => {
        const rect = slamBtn.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width;
        const y = (e.clientY - rect.top) / rect.height;
        updateSlamParams(x, y);
    };

    slamBtn.addEventListener('pointerdown', (e) => {
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

    actionsContainer.appendChild(slamBtn);

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

    // Editor Overlay (Lazy create)
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

    const mkSlider = (parent: HTMLElement, name: string, param: string, def: number, min: number, max: number) => {
         const row = document.createElement('div');
         const slabel = document.createElement('div');
         slabel.textContent = name;
         slabel.style.fontSize = "0.7rem"; slabel.style.marginBottom = "4px";
         
         const inp = document.createElement('input');
         inp.type = "range"; inp.min = "0"; inp.max = "100";
         inp.value = String(def * 100); inp.style.width = "100%";
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
        mkSlider(headBOverlay, "DECAY LENGTH", 'CHOPPER_DECAY', 0.92, 0, 1);
        mkSlider(headBOverlay, "MIX LEVEL", 'CHOPPER_MIX', 0.5, 0, 1);
        mkSlider(headBOverlay, "EQ (Dark<>Bright)", 'CHOPPER_EQ', 0.5, 0, 1);
        
        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all";
        close.style.padding = "10px";
        close.onclick = () => toggleHeadB();
        headBOverlay.appendChild(close);
        document.body.appendChild(headBOverlay);
    };

    const toggleGhost = () => {
        if (ghostOverlay) { ghostOverlay.remove(); ghostOverlay = null; return; }
        ghostOverlay = mkOverlay("GHOST (CLOUD)");
        mkSlider(ghostOverlay, "GHOST EQ", 'GHOST_EQ', 0.5, 0, 1);
        mkSlider(ghostOverlay, "FADE RATE", 'GHOST_FADE', 0.5, 0, 1);
        
        const close = document.createElement('button');
        close.textContent = "CLOSE";
        close.className = "b-all";
        close.style.padding = "10px";
        close.onclick = () => toggleGhost();
        ghostOverlay.appendChild(close);
        document.body.appendChild(ghostOverlay);
    };

    // Removed specific Edit Buttons as per user request
    
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
        engine.startAI(); 
        shell.status = "LIVE";
        overlay.remove();
        // engine.testAudio();
    };

    // Global Key Handlers
    window.addEventListener('keydown', (e) => {
        if (e.code === 'Space') {
            e.preventDefault(); // Prevent scrolling
            if (engine.getIsPlaying()) {
                engine.pause();
                (masterStatus as any).forceUpdateState(false); // Helper if needed, or let polling handle it
            } else {
                engine.resume();
                (masterStatus as any).forceUpdateState(true);
            }
        }
    });
}
