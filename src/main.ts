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
import './ui/modules/super-controls';
import { AutomationEngine } from './ai/automation-engine';
import { MixGenerator } from './ai/mix-generator';
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


console.log("Prompt-DJ v2.0 'Ghost in the Groove' initializing...");

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
    viewContainer.style.height = '100vh';
    viewContainer.style.width = '100vw'; // Ensure width
    viewContainer.style.display = 'flex';
    viewContainer.style.flexDirection = 'column';
    viewContainer.style.overflow = 'hidden';

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
        updatePrompts();
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

    // 2. Deck B
    const deckB = document.createElement('deck-controller') as DeckController;
    deckB.deckId = "B";
    deckB.slot = 'deck-b';
    shell.appendChild(deckB);

    // 3. Super Controls (AI Mix)
    const superCtrl = document.createElement('super-controls') as SuperControls;
    superCtrl.slot = 'super';
    shell.appendChild(superCtrl);

    // AI Mix Event Handling
    superCtrl.addEventListener('ai-mix-trigger', async (e: any) => {
        const { direction, duration, mood } = e.detail;
        if (superCtrl.isGenerating || superCtrl.isPlaying) return;

        superCtrl.isGenerating = true;
        superCtrl.addLog(`ARCHITECTING MIX: ${direction} (${duration} Bars)`);
        
        // Construct Prompt
        const req = `Mix from ${direction}. Duration: ${duration} Bars. Mood: ${mood}.`;
        const score = await mixGen.generateScore(req, engine.masterBpm);
        
        superCtrl.isGenerating = false;
        
        if (score) {
            superCtrl.addLog(`SCORE RECEIVED. Tracks: ${score.tracks.length}`);
            autoEngine.loadScore(score);
            
            autoEngine.setOnProgress((bar, phase) => {
                 superCtrl.updateStatus(bar, phase, duration);
                 // If mix is done (callback might not signal completion explicitly other than phase)
                 if (bar >= duration) {
                     superCtrl.isPlaying = false;
                     superCtrl.addLog(`MIX COMPLETE.`);
                 }
            });
            
            superCtrl.isPlaying = true;
            autoEngine.start();
            superCtrl.addLog(`MIX STARTED.`);
        } else {
            superCtrl.addLog(`GENERATION FAILED.`);
        }
    });

    superCtrl.addEventListener('ai-mix-abort', () => {
        autoEngine.stop();
        superCtrl.isPlaying = false;
        superCtrl.addLog(`MIX ABORTED.`);
    });
    
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
    // Let's try 10 columns to fit all params in one row as requested
    // Let's try 9 columns to fit all params in one row (8 params + 1 dual slot)
    controlsContainer.style.gridTemplateColumns = 'repeat(9, 1fr)';

    // 0. (Removed - moved to end)

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

    // 9. KEY / SCALE (New Dual Slot at End)
    // Needs scale labels
    const scaleLabels = SCALE_OPTIONS.map(o => o.label);
    controlsContainer.appendChild(createDualSelectorSlot('KEY', ROOT_OPTIONS, 'SCALE', scaleLabels, (root, scaleLbl) => {
        uiState.keyRoot = root;
        // Find prompt for scale
        const opt = SCALE_OPTIONS.find(o => o.label === scaleLbl);
        if (opt) {
            uiState.scaleLabel = opt.label;
            uiState.scalePrompt = opt.prompt;
        } else {
            uiState.scaleLabel = "";
            uiState.scalePrompt = "";
        }
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
}


// End of file
