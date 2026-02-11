import '../index.css';
import { AudioEngine } from './audio/engine';
import { MidiManager } from './midi/midi-manager';
import { ControlRouter } from './control/control-router';
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
import './ui/modules/midi-settings';
import './ui/visuals/ThreeViz';
import './ui/visuals/VisualControls';
import type { ThreeViz } from './ui/visuals/ThreeViz';
import type { VisualControls } from './ui/visuals/VisualControls';
import type { VisualMode } from './ui/visuals/modes';
import { AutomationEngine } from './ai/automation-engine';
import { MixGenerator } from './ai/mix-generator';
import { VisualTransitionEngine, mapVisualTargetToEngine } from './ai/visual-transition-engine';
import { GridGenerator } from './ai/grid-generator';
import { setupLibrarySidebar } from './ui/bootstrap/library-sidebar';
import { setupZenOverlay } from './ui/bootstrap/zen-overlay';
import { setupDeckTransportEvents } from './ui/bootstrap/deck-transport-events';
import { setupVisualSyncEvents } from './ui/bootstrap/visual-sync-events';
import { ApiKeyManager } from './config/api-key-manager';
import type { AppShell } from './ui/shell';
import type { FxRack } from './ui/modules/fx-rack';
import type { DeckController } from './ui/modules/deck-controller';
import type { DjMixer } from './ui/modules/dj-mixer';
import type { SuperControls } from './ui/modules/super-controls';
import type { IntegratedMixPlan, PromptContextInput } from './types/integrated-ai-mix';
import { 
    createAiSlider, 
    createComboSlot, 
    createCustomSlot, 
    createDualSelectorSlot,
    createFxModule, 
    mkOverlay, 
    mkSliderHelper 
} from './ui/ui-helpers';
import { generatePrompt, getDisplayPromptParts } from './ai/prompt-generator';
import { LibraryStore } from './audio/db/library-store';
import { analyzeAudioValidity } from './audio/utils/audio-analysis';
import { TexturePromptGenerator } from './ai/texture-prompt-generator';
import { TextureImageGenerator } from './ai/texture-image-generator';
import type { AiGridParams } from './ui/visuals/AiDynamicGrid';

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

type BioSliderElement = HTMLElement & { value?: number | string };

if (import.meta.env.DEV) {
    console.log("Bio:gram v2.0 'Ghost in the Groove' initializing...");
}

// Init Engine Early (but don't start audio context yet)
const apiKeyManager = new ApiKeyManager(import.meta.env.VITE_GEMINI_API_KEY || '');
const apiKey = apiKeyManager.getApiKey();
const engine = new AudioEngine(apiKey);
window.engine = engine;

const controlRouter = new ControlRouter({
    getEngine: () => window.engine,
    getThreeViz: () => (window as any).__threeViz as ThreeViz | undefined
});
window.controlRouter = controlRouter;

// Init MIDI
const midiManager = new MidiManager(controlRouter);
window.midiManager = midiManager;

// Init AI Mix Engine
const autoEngine = new AutomationEngine(engine);
const mixGen = new MixGenerator();
const gridGen = new GridGenerator();
const texturePromptGen = new TexturePromptGenerator();
const textureImageGen = new TextureImageGenerator();
let applyVisualMode: ((mode: VisualMode, source?: 'ui' | 'plan' | 'fallback') => void) | null = null;
type VisualFxMode = 'OFF' | 'AUTO' | 'MANUAL';
type VisualFxType = 'breath_pulse' | 'spectral_bloom' | 'chromatic_shear' | 'dust_veil';
const visualTransitionEngine = new VisualTransitionEngine((targetId, value) => {
    const viz = (window as any).__threeViz as ThreeViz | undefined;
    if (!viz) return;
    mapVisualTargetToEngine(targetId, value, {
        setMode: (mode) => {
            if (applyVisualMode) {
                applyVisualMode(mode, 'plan');
            } else {
                viz.setMode(mode);
            }
        },
        setTransitionType: (type) => viz.setTransitionType(type),
        sendParam: (id, val) => viz.sendMessage(id, val)
    });
});

// ROUTING LOGIC
const urlParams = new URLSearchParams(window.location.search);
const isVizMode = urlParams.get('mode') === 'viz';
const allowTemplateMixPlan = urlParams.get('allowTemplatePlan') === '1';

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
    viewContainer.style.opacity = '0';
    viewContainer.style.transition = 'opacity 480ms ease';

    const hasApiKey = () => apiKeyManager.hasApiKey();
    let apiSettingsOverlay: HTMLDivElement | null = null;

    const openApiSettingsModal = (required: boolean = false) => {
        if (apiSettingsOverlay) return;

        const overlay = document.createElement('div');
        apiSettingsOverlay = overlay;
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(20px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: '2500',
            opacity: '0',
            transition: 'opacity 0.3s ease'
        });

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            width: 'min(92vw, 420px)',
            background: 'rgba(0, 0, 0, 0.6)',
            backdropFilter: 'blur(40px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '1.5rem',
            padding: '24px',
            color: '#d4d4d8',
            fontFamily: "'Comfortaa', sans-serif",
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            transform: 'scale(0.95)',
            transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
        });

        const title = document.createElement('h3');
        title.textContent = 'REALTIME API SETTINGS';
        Object.assign(title.style, {
            margin: '0 0 12px 0',
            fontSize: '0.65rem',
            fontFamily: "'JetBrains Mono', monospace",
            letterSpacing: '0.2em',
            color: '#3f3f46',
            fontWeight: 'bold'
        });
        panel.appendChild(title);

        const desc = document.createElement('p');
        desc.textContent = required
            ? 'Realtime deck generation key is missing. Save it locally to proceed.'
            : 'Save Gemini API Key locally for realtime deck generation. Reloads page after saving.';
        Object.assign(desc.style, {
            margin: '0 0 20px 0',
            color: '#a1a1aa',
            fontSize: '13px',
            lineHeight: '1.6'
        });
        panel.appendChild(desc);

        const input = document.createElement('input');
        input.type = 'password';
        input.value = apiKeyManager.getStoredApiKey();
        input.placeholder = 'AIza...';
        Object.assign(input.style, {
            width: '100%',
            boxSizing: 'border-box',
            padding: '12px 16px',
            borderRadius: '0.75rem',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            background: 'rgba(255, 255, 255, 0.05)',
            color: '#fff',
            marginBottom: '20px',
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: '14px',
            outline: 'none',
            transition: 'border-color 0.2s, box-shadow 0.2s'
        });
        input.onfocus = () => {
            input.style.borderColor = 'rgba(34, 211, 238, 0.5)';
            input.style.boxShadow = '0 0 0 2px rgba(34, 211, 238, 0.2)';
        };
        input.onblur = () => {
            input.style.borderColor = 'rgba(255, 255, 255, 0.1)';
            input.style.boxShadow = 'none';
        };
        panel.appendChild(input);

        const actions = document.createElement('div');
        Object.assign(actions.style, {
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
        });

        const createStyledBtn = (label: string, isPrimary: boolean = false, isDanger: boolean = false) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            
            const baseBg = isPrimary 
                ? 'rgba(34, 211, 238, 0.15)' 
                : isDanger 
                    ? 'rgba(239, 68, 68, 0.15)' 
                    : 'rgba(255, 255, 255, 0.05)';
            
            const accentColor = isPrimary 
                ? '#22d3ee' 
                : isDanger 
                    ? '#ef4444' 
                    : '#a1a1aa';

            Object.assign(btn.style, {
                padding: '10px 20px',
                borderRadius: '0.75rem',
                border: `1px solid ${isPrimary || isDanger ? accentColor + '44' : 'rgba(255, 255, 255, 0.1)'}`,
                background: baseBg,
                color: isPrimary || isDanger ? accentColor : '#a1a1aa',
                fontSize: '11px',
                fontFamily: "'JetBrains Mono', monospace",
                fontWeight: 'bold',
                letterSpacing: '0.1em',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.23, 1, 0.32, 1)',
                backdropFilter: 'blur(10px)',
                textShadow: isPrimary || isDanger ? `0 0 10px ${accentColor}66` : 'none'
            });

            btn.onmouseenter = () => {
                btn.style.background = isPrimary 
                    ? 'rgba(34, 211, 238, 0.25)' 
                    : isDanger 
                        ? 'rgba(239, 68, 68, 0.25)' 
                        : 'rgba(255, 255, 255, 0.1)';
                btn.style.borderColor = accentColor;
                btn.style.color = '#fff';
                btn.style.boxShadow = `0 0 15px ${accentColor}33`;
                btn.style.transform = 'translateY(-1px)';
            };
            btn.onmouseleave = () => {
                btn.style.background = baseBg;
                btn.style.borderColor = isPrimary || isDanger ? accentColor + '44' : 'rgba(255, 255, 255, 0.1)';
                btn.style.color = isPrimary || isDanger ? accentColor : '#a1a1aa';
                btn.style.boxShadow = 'none';
                btn.style.transform = 'none';
            };
            btn.onmousedown = () => {
                btn.style.transform = 'translateY(1px) scale(0.98)';
                btn.style.filter = 'brightness(0.8)';
            };
            btn.onmouseup = () => {
                btn.style.transform = 'translateY(-1px)';
                btn.style.filter = 'none';
            };
            return btn;
        };

        const closeBtn = createStyledBtn('CLOSE');
        if (required) {
            closeBtn.disabled = true;
            closeBtn.style.opacity = '0.3';
            closeBtn.style.cursor = 'not-allowed';
            closeBtn.style.background = '#18181b';
        }

        const clearBtn = createStyledBtn('CLEAR', false, true);
        const saveBtn = createStyledBtn('SAVE', true);

        const closeModal = () => {
            overlay.style.opacity = '0';
            panel.style.transform = 'scale(0.95)';
            setTimeout(() => {
                overlay.remove();
                apiSettingsOverlay = null;
            }, 300);
        };

        closeBtn.onclick = () => closeModal();
        overlay.onclick = (e) => {
            if (required) return;
            if (e.target === overlay) closeModal();
        };
        clearBtn.onclick = () => {
            if (confirm('Clear the API Key?')) {
                apiKeyManager.clearApiKey();
                input.value = '';
            }
        };
        saveBtn.onclick = () => {
            const key = input.value.trim();
            if (!key) {
                alert('Please enter an API Key.');
                return;
            }
            apiKeyManager.setApiKey(key);
            alert('API Key saved. Reloading to apply changes.');
            window.location.reload();
        };

        actions.appendChild(closeBtn);
        actions.appendChild(clearBtn);
        actions.appendChild(saveBtn);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        
        // Trigger reveal animation
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            panel.style.transform = 'scale(1)';
        });

        input.focus();
    };

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
        keyRoot: "",
        scaleLabel: "",
        scalePrompt: "",
        theme: "",
        deckAPrompt: "", // Independent Prompt for A
        deckBPrompt: ""  // Independent Prompt for B
    };

    let isSlamming = false;
    type PromptAutoCurve = 'BALANCED' | 'AGGRESSIVE' | 'CINEMATIC';
    type PromptAutoTargets = {
        ambient: number;
        minimal: number;
        dub: number;
        impact: number;
        color: number;
    };
    let promptAutoControlActive = false;
    let promptAutoEnabledSetting = false;
    let promptAutoCurveMode: PromptAutoCurve = 'BALANCED';
    let promptAutoLastUiPushMs = 0;
    let promptAutoLastPromptPushMs = 0;
    let promptAutoSeedTargets: PromptAutoTargets | null = null;
    let promptAutoLastPromptSnapshot: PromptAutoTargets | null = null;
    let applyAutoPromptFromMix: ((bar: number, phase: string, totalBars: number, mood: string) => void) | null = null;

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
    header.addEventListener('api-settings-open', () => openApiSettingsModal(false));
    viewContainer.appendChild(header);
    
    // 2. VIEWS
    // A. Main Shell (Default Full)
    const shell = document.createElement('app-shell') as AppShell;
    shell.view = 'DECK'; // Init
    shell.style.flexGrow = '1';
    shell.style.height = '0'; // Allow shrinking
    shell.style.minHeight = '0';
    shell.style.borderBottom = "1px solid #333";
    viewContainer.appendChild(shell);

    // View State
    const applyViewChange = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        const view = detail?.view as AppShell['view'] | undefined;
        if (!view) return;
        shell.view = view; // Update Shell View State
    };

    // Primary path (header local event) + fallback path (window-level propagation)
    header.addEventListener('view-change', applyViewChange as EventListener);
    window.addEventListener('view-change', applyViewChange as EventListener);
    
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

    const midiSettings = document.createElement('midi-settings') as HTMLElement & { togglePanel?: () => void };
    header.addEventListener('midi-settings-open', () => {
        midiSettings.togglePanel?.();
    });
    document.body.appendChild(midiSettings);
    
    // -- Mount UI Modules (to shell) --

    // 0. Deck A
    const deckA = document.createElement('deck-controller') as DeckController;
    deckA.deckId = "A";
    deckA.slot = 'deck-a';
    shell.appendChild(deckA);

    // Shared mixer change handler for dj-mixer and mixer-controls
    const handleMixerChange = (e: any) => {
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
    };

    // 1. Mixer
    const mixer = document.createElement('dj-mixer') as DjMixer;
    mixer.slot = 'mixer';
    mixer.addEventListener('mixer-change', handleMixerChange);
    shell.appendChild(mixer);

    // 1.5 Mixer Controls (BPM & Crossfader)
    const mixerControls = document.createElement('mixer-controls');
    mixerControls.slot = 'mixer-controls';
    mixerControls.addEventListener('mixer-change', handleMixerChange);
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
    const vizControls = document.createElement('visual-controls') as VisualControls;
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
    (window as any).__threeViz = threeViz;
    threeViz.style.position = 'absolute';
    threeViz.style.top = '0';
    threeViz.style.left = '0';
    threeViz.style.width = '100%';
    threeViz.style.height = '100%';
    threeViz.style.zIndex = '0'; // Behind Shell which has z-index 10 for main
    threeViz.style.pointerEvents = 'none'; // Let clicks pass through
    threeViz.style.opacity = '0';
    threeViz.style.transition = 'opacity 480ms ease';
    
    // Insert ThreeViz as the first child of viewContainer so it sits behind shell?
    // Shell has a background color... we need to make Shell transparent?
    // Shell CSS has `background-color: #0a0a0c`. We need to remove that or make it transparent.
    // Let's append to body directly underneath viewContainer?
    // viewContainer has `background: #000`.
    viewContainer.style.background = 'transparent'; // Allow viz to show
    
    // Move threeViz to Body (Behind ViewContainer)
    document.body.insertBefore(threeViz, viewContainer);
    // viewContainer.insertBefore(threeViz, viewContainer.firstChild); // OLD

    // Event Wiring: Controls -> Viz
    vizControls.addEventListener('visual-texture-change', (e: any) => {
        const { deck, url, type } = e.detail;
        threeViz.updateTexture(deck, url, type);
    });

    let autoTextureReqId = 0;
    let aiGridReqId = 0;
    let lastAutoGnosisGenAtMs = 0;
    let visualFxMode: VisualFxMode = 'OFF';
    let visualFxIntensity = 0.55;
    let lastVisualFxBar = -Infinity;
    let lastVisualFxType: VisualFxType | null = null;
    let activeFxResetTimer: number | null = null;
    let lastAutoFxCheckBar = -1;
    const compactPrompt = (value: string) => value.replace(/\s+/g, ' ').trim();
    const isGnosisMode = (mode: VisualMode) => mode === 'gnosis' || mode === 'ai_grid';
    const normalizeVisualModeAlias = (mode: string): VisualMode => {
        switch (mode) {
            case 'halid':
                return 'halid';
            case 'glaze':
                return 'glaze';
            case 'gnosis':
                return 'gnosis';
            case 'suibokuga':
                return 'halid';
            case 'grid':
                return 'glaze';
            case 'ai_grid':
                return 'gnosis';
            case 'organic':
            case 'wireframe':
            case 'monochrome':
            case 'rings':
            case 'waves':
                return mode;
            default:
                return 'organic';
        }
    };

    const resolveTextureSubjectFromContext = () => {
        const crossfader = Number(engine.getDspParam('CROSSFADER') ?? 0.5);
        const primaryDeck: 'A' | 'B' = crossfader <= 0.5 ? 'A' : 'B';
        const secondaryDeck: 'A' | 'B' = primaryDeck === 'A' ? 'B' : 'A';
        const primaryPrompt = compactPrompt(primaryDeck === 'A' ? uiState.deckAPrompt : uiState.deckBPrompt);
        const secondaryPrompt = compactPrompt(secondaryDeck === 'A' ? uiState.deckAPrompt : uiState.deckBPrompt);
        const theme = compactPrompt(uiState.theme || '');
        const textureType = compactPrompt(uiState.typeTexture || '');
        const pulseType = compactPrompt(uiState.typePulse || '');

        const subject = [
            primaryPrompt || secondaryPrompt || theme || 'organic ambient techno visual surface',
            textureType,
            pulseType
        ].filter(Boolean).join(', ');

        return {
            subject,
            primaryDeck,
            primaryPrompt,
            secondaryPrompt
        };
    };

    const transitionPresetToType = (preset: string): string | null => {
        switch (preset) {
            case 'crossfade':
            case 'sweep_line_smear':
            case 'soft_overlay':
            case 'fade_in':
            case 'fade_out':
                return preset;
            default:
                return null;
        }
    };

    const sendFxPayload = (payload: Record<string, number>) => {
        Object.entries(payload).forEach(([id, val]) => {
            threeViz.sendMessage(id, val);
        });
    };

    const resetVisualFxPayload = () => {
        sendFxPayload({
            DUB: 0,
            CLOUD_MIX: 0,
            CLOUD_ACTIVE: 0,
            CLOUD_DENSITY: 0.5,
            DECIMATOR_ACTIVE: 0,
            BITS: 16,
            GATE_THRESH: 0
        });
    };

    const triggerSceneFx = (reason: 'manual' | 'auto', bar: number) => {
        if (visualFxMode === 'OFF') return;
        if (reason === 'auto' && visualFxMode !== 'AUTO') return;
        if (reason === 'manual' && visualFxMode === 'OFF') return;
        if (reason === 'auto' && bar - lastVisualFxBar < 8) return;

        const allFx: VisualFxType[] = ['breath_pulse', 'spectral_bloom', 'chromatic_shear', 'dust_veil'];
        const pool = allFx.filter((fx) => fx !== lastVisualFxType);
        const chosen = pool[Math.floor(Math.random() * pool.length)] || allFx[0];
        const i = Math.max(0, Math.min(1, visualFxIntensity));

        if (activeFxResetTimer !== null) {
            window.clearTimeout(activeFxResetTimer);
            activeFxResetTimer = null;
        }
        resetVisualFxPayload();

        let durationMs = 420;
        switch (chosen) {
            case 'breath_pulse':
                durationMs = 900;
                sendFxPayload({
                    CLOUD_ACTIVE: 1,
                    CLOUD_MIX: 0.2 + i * 0.45,
                    CLOUD_DENSITY: 0.6 + i * 0.35
                });
                break;
            case 'spectral_bloom':
                durationMs = 380;
                sendFxPayload({
                    DUB: 0.15 + i * 0.55
                });
                break;
            case 'chromatic_shear':
                durationMs = 240;
                sendFxPayload({
                    DECIMATOR_ACTIVE: 1,
                    BITS: Math.max(2, Math.round(10 - i * 6))
                });
                break;
            case 'dust_veil':
                durationMs = 650;
                sendFxPayload({
                    CLOUD_ACTIVE: 1,
                    CLOUD_MIX: 0.1 + i * 0.3,
                    CLOUD_DENSITY: 0.85
                });
                break;
        }

        activeFxResetTimer = window.setTimeout(() => {
            resetVisualFxPayload();
            activeFxResetTimer = null;
        }, durationMs);
        lastVisualFxType = chosen;
        lastVisualFxBar = bar;
    };

    const generateAiGridParams = async (reason: 'manual' | 'mode-switch') => {
        const reqId = ++aiGridReqId;
        const context = `BPM: ${engine.masterBpm}, Mood: ${uiState.theme || 'Dynamic Flow'}, Trigger: ${reason}, Palette: deep green + deep blue only, Style: chaotic organic cyber-flow`;
        try {
            const params = await gridGen.generateParams(context);
            if (reqId !== aiGridReqId) return;
            if (params) {
                const styled = stylizeGnosisParams(params, reason);
                if (import.meta.env.DEV) console.log('[Main] AI Grid Params Applied:', styled);
                threeViz.setAiGridParams(styled);
            }
        } catch (e) {
            console.error('[Main] AI Grid Gen Failed', e);
        }
    };

    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)] || arr[0];
    const stylizeGnosisParams = (params: AiGridParams, reason: 'manual' | 'mode-switch'): AiGridParams => {
        const palettes: Array<[string, string]> = [
            ['#042f2e', '#0b3f76'],
            ['#064e3b', '#1d4ed8'],
            ['#065f46', '#0e7490'],
            ['#134e4a', '#1e3a8a'],
            ['#0f766e', '#2563eb']
        ];
        const [c1, c2] = pick(palettes);
        const chaos = clamp((reason === 'manual' ? 0.66 : 0.52) + Math.random() * 0.28, 0, 1);
        const shapePool: AiGridParams['geometry']['shape'][] = reason === 'manual'
            ? ['wobble', 'torus', 'cylinder', 'sphere']
            : ['torus', 'sphere', 'wobble', 'cylinder'];
        const wavePool: AiGridParams['wave']['func'][] = reason === 'manual'
            ? ['noise', 'sawtooth', 'pulse', 'sine', 'fm_chaos', 'strange_attractor']
            : ['pulse', 'sine', 'noise', 'sawtooth', 'fm_chaos'];
        const allowComplexFormula = reason === 'manual'
            ? Math.random() < 0.45
            : Math.random() < 0.2;
        const selectedWave = allowComplexFormula
            ? pick<AiGridParams['wave']['func']>(['fm_chaos', 'strange_attractor'])
            : pick(wavePool);

        return {
            geometry: {
                shape: pick(shapePool),
                radius: clamp(params.geometry.radius + (Math.random() - 0.5) * 1.3, 1.1, 4.4),
                twist: clamp((Math.random() * 2 - 1) * (0.8 + chaos * 1.25), -2.0, 2.0)
            },
            wave: {
                func: selectedWave,
                frequency: clamp(params.wave.frequency + (Math.random() - 0.5) * 2.6 + chaos * 1.4, 1.0, 10.0),
                speed: clamp(params.wave.speed + 0.2 + chaos * 1.5 + Math.random() * 1.1, 0.1, 5.0),
                amplitude: clamp(params.wave.amplitude + 0.18 + chaos * 0.45 + Math.random() * 0.45, 0.0, 2.0),
                complexity: clamp(Math.max(params.wave.complexity, chaos * 0.75 + Math.random() * 0.2), 0.0, 1.0)
            },
            material: {
                blurStrength: clamp(params.material.blurStrength + (0.12 + chaos * 0.4), 0.0, 1.0),
                coreOpacity: clamp(params.material.coreOpacity * (0.65 - chaos * 0.2), 0.06, 0.45),
                glowOpacity: clamp(params.material.glowOpacity + 0.2 + chaos * 0.28, 0.25, 1.0),
                color: c1,
                secondaryColor: c2
            }
        };
    };

    applyVisualMode = (mode: VisualMode, source: 'ui' | 'plan' | 'fallback' = 'ui') => {
        const normalized = normalizeVisualModeAlias(mode);
        const prevMode = (threeViz.visualMode || 'organic') as VisualMode;
        const prevIsGnosis = isGnosisMode(normalizeVisualModeAlias(prevMode));
        const nextIsGnosis = isGnosisMode(normalized);

        threeViz.setMode(normalized);

        if (nextIsGnosis && !prevIsGnosis) {
            const now = performance.now();
            if (now - lastAutoGnosisGenAtMs > 800) {
                lastAutoGnosisGenAtMs = now;
                void generateAiGridParams('mode-switch');
            }
        }
        if (import.meta.env.DEV) {
            console.log(`[Main] Visual mode applied (${source}): ${prevMode} -> ${normalized}`);
        }
    };

    vizControls.addEventListener('auto-texture-generate', async (e: any) => {
        const reqId = ++autoTextureReqId;
        vizControls.setAutoTextureState({
            generating: true,
            error: '',
            status: 'GENERATING...',
            model: '',
        });

        const ctx = resolveTextureSubjectFromContext();
        const keywordInput = compactPrompt(e?.detail?.keyword || '');
        const promptSubject = keywordInput || ctx.subject;
        const contextSource = keywordInput ? 'WORD INPUT' : `${ctx.primaryDeck} CONTEXT`;

        try {
            const texturePrompt = await texturePromptGen.generatePrompt(promptSubject, {
                detailLevel: 'high'
            });

            const image = await textureImageGen.generateTextureImage(texturePrompt, {
                aspectRatio: '1:1',
                imageSize: '1K'
            });

            if (reqId !== autoTextureReqId) return;

            vizControls.setAutoTextureState({
                generating: false,
                previewUrl: image.dataUrl,
                prompt: texturePrompt,
                status: `READY (${contextSource})`,
                error: '',
                model: image.modelUsed
            });
        } catch (error) {
            console.error('[Main] Auto texture generation failed:', error);
            if (reqId !== autoTextureReqId) return;
            vizControls.setAutoTextureState({
                generating: false,
                status: 'FAILED',
                error: 'AUTO TEXTURE FAILED',
                model: ''
            });
        }
    });

    vizControls.addEventListener('visual-webcam-toggle', (e: any) => {
        threeViz.toggleWebcam(e.detail.active);
    });

    vizControls.addEventListener('visual-color-random', (e: any) => {
        threeViz.randomizeColor(e.detail.deck);
    });

    vizControls.addEventListener('visual-mode-change', (e: any) => {
        applyVisualMode?.(e.detail.mode, 'ui');
    });

    vizControls.addEventListener('visual-next-object', (e: any) => {
        const targetMode = normalizeVisualModeAlias(String(e?.detail?.mode || 'organic'));
        const transitionType = transitionPresetToType(String(e?.detail?.transitionPreset || 'auto_matrix'));
        if (transitionType) {
            threeViz.setTransitionTypeOnce(transitionType);
        }
        applyVisualMode?.(targetMode, 'ui');
    });

    vizControls.addEventListener('visual-fx-config', (e: any) => {
        const mode = String(e?.detail?.mode || 'OFF').toUpperCase();
        visualFxMode = mode === 'AUTO' || mode === 'MANUAL' ? mode : 'OFF';
        visualFxIntensity = Math.max(0, Math.min(1, Number(e?.detail?.intensity ?? 0.55)));
    });

    vizControls.addEventListener('visual-transition-config', (e: any) => {
        const sec = Math.max(0.3, Math.min(3.0, Number(e?.detail?.fadeDurationSec ?? 1.0)));
        threeViz.setFadeTransitionDurationSec(sec);
    });

    vizControls.addEventListener('visual-fx-trigger', () => {
        triggerSceneFx('manual', lastVisualFxBar + 8.1);
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
    // Keep engine runtime state aligned with SuperControls initial default.
    engine.setAiAnalysisEnabled(superCtrl.aiVisualsEnabled);

    vizControls.addEventListener('ai-grid-gen-trigger', async () => {
        if (import.meta.env.DEV) console.log('[Main] Generating AI Grid Params...');
        await generateAiGridParams('manual');
    });


    let pendingMixContext: { sourceId: string, targetId: string } | null = null;
    const supportedMixVisualModes: readonly VisualMode[] = [
        'organic',
        'wireframe',
        'monochrome',
        'rings',
        'waves',
        'halid',
        'glaze',
        'gnosis',
        'suibokuga',
        'grid',
        'ai_grid'
    ] as const;

    const normalizePreferredVisualMode = (mode: string): VisualMode => {
        if ((supportedMixVisualModes as readonly string[]).includes(mode)) {
            return normalizeVisualModeAlias(mode);
        }
        return 'organic';
    };

    // Align visual control timeline with AutomationEngine phase outputs.
    // Current engine phases are PRESENCE -> HANDOFF -> WASH OUT.
    const resolveMixVisualMode = (phase: string, preferred: VisualMode): VisualMode => {
        const p = phase.toUpperCase();
        if (p.includes('PRESENCE')) return 'wireframe';
        if (p.includes('HANDOFF')) return preferred;
        if (p.includes('WASH')) return 'organic';
        return preferred;
    };

    let pendingIntegratedPlan: IntegratedMixPlan | null = null;
    let mixCompletionHandled = false;
    let freeModeTimer: number | null = null;
    let lastMixStartPerfMs = 0;
    let lastRhythmRelockBar = -Infinity;
    let freeModeSession: null | {
        active: boolean;
        pattern: 'PINGPONG' | 'ABBA';
        cycleIndex: number;
        startMs: number;
        maxRuntimeMs: number;
        duration: number;
        mood: string;
        preferredVisual: VisualMode;
        nextDirection: 'A->B' | 'B->A';
        metrics: {
            mixCount: number;
            regenAttempts: number;
            regenSuccess: number;
            syncSkewMsMax: number;
            syncSkewMsAvg: number;
            syncSamples: number;
            lastError?: string;
        };
    } = null;

    const resolvePatternDirection = (pattern: 'PINGPONG' | 'ABBA', index: number): 'A->B' | 'B->A' => {
        if (pattern === 'PINGPONG') return index % 2 === 0 ? 'A->B' : 'B->A';
        const seq: Array<'A->B' | 'B->A'> = ['A->B', 'B->A', 'B->A', 'A->B'];
        return seq[index % seq.length];
    };

    const triggerDeckRegeneration = (deck: 'A' | 'B') => {
        const target = deck === 'A' ? deckA : deckB;
        target.dispatchEvent(new CustomEvent('deck-load-random', {
            detail: { deck },
            bubbles: true,
            composed: true
        }));
    };

    const clearFreeModeTimer = () => {
        if (freeModeTimer !== null) {
            clearTimeout(freeModeTimer);
            freeModeTimer = null;
        }
    };

    const applySafetyReset = (plan: IntegratedMixPlan) => {
        const safety = plan.post_actions?.safety_reset;
        if (!safety) return;

        const direction = plan.meta.direction;
        const sourceDeck = direction === 'A->B' ? 'A' : 'B';
        const targetDeck = sourceDeck === 'A' ? 'B' : 'A';

        if (safety.crossfader_to_target) {
            const cf = targetDeck === 'B' ? 1.0 : 0.0;
            engine.setCrossfader(cf);
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: { parameter: 'crossfader', value: cf }
            }));
        }

        if (safety.reset_eq_to_default) {
            const eqDefault = 0.67;
            const deck = sourceDeck as 'A' | 'B';
            engine.setEq(deck, 'LOW', eqDefault);
            engine.setEq(deck, 'MID', eqDefault);
            engine.setEq(deck, 'HI', eqDefault);
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: {
                    parameter: `low${deck}`,
                    value: eqDefault
                }
            }));
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: {
                    parameter: `mid${deck}`,
                    value: eqDefault
                }
            }));
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: {
                    parameter: `high${deck}`,
                    value: eqDefault
                }
            }));
        }

        if (safety.disable_fx_tail) {
            engine.updateDspParam('DUB', 0.0);
            engine.updateDspParam('BLOOM_WET', 0.0);
            engine.updateDspParam('TAPE_ACTIVE', 0.0);
            engine.updateDspParam('REVERB_ACTIVE', 0.0);
            engine.updateDspParam('FILTER_ACTIVE', 0.0);
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: { parameter: 'DUB', value: 0.0 }
            }));
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: { parameter: 'BLOOM_WET', value: 0.0 }
            }));
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: { parameter: 'TAPE_ACTIVE', value: 0.0 }
            }));
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: { parameter: 'REVERB_ACTIVE', value: 0.0 }
            }));
            window.dispatchEvent(new CustomEvent('mixer-update', {
                detail: { parameter: 'FILTER_ACTIVE', value: 0.0 }
            }));
        }
    };

    const setDeckSyncState = (deck: 'A' | 'B', sync: boolean) => {
        window.dispatchEvent(new CustomEvent('deck-sync-toggle', {
            detail: { deck, sync }
        }));
        window.dispatchEvent(new CustomEvent('deck-sync-state', {
            detail: { deck, sync }
        }));
    };

    const lockMixRhythm = (
        sourceDeck: 'A' | 'B',
        targetDeck: 'A' | 'B',
        targetBpmRaw: number,
        reason: 'START' | 'RELOCK'
    ) => {
        const fallbackBpm = Number(engine.masterBpm) || 120;
        const safeBpm = Math.max(
            60,
            Math.min(200, Number.isFinite(targetBpmRaw) ? Number(targetBpmRaw) : fallbackBpm)
        );

        // Keep generation, transport, and mixer clocks aligned.
        engine.setMasterBpm(safeBpm);

        // AutoMix always forces SYNC ON for both decks.
        setDeckSyncState(sourceDeck, true);
        setDeckSyncState(targetDeck, true);

        // Seed deck BPMs to avoid stale/invalid sync ratio.
        engine.setDeckBpm(sourceDeck, safeBpm);
        engine.setDeckBpm(targetDeck, safeBpm);

        // Speed + phase lock (target deck is critical during handoff).
        engine.syncDeck(sourceDeck);
        engine.syncDeck(targetDeck);
        engine.alignPhase(targetDeck);

        if (reason === 'START') {
            superCtrl.addLog(`RHYTHM LOCK: ${safeBpm.toFixed(1)} BPM / SYNC ${sourceDeck}+${targetDeck}`);
        } else if (import.meta.env.DEV) {
            console.log(`[AI Mix] Rhythm relock at ${safeBpm.toFixed(1)} BPM (${sourceDeck}->${targetDeck})`);
        }
    };

    // AI Mix Event Handling
    superCtrl.addEventListener('ai-mix-trigger', async (e: any) => {
        const {
            direction,
            duration,
            mood,
            preferredVisual,
            sessionMode = 'single',
            pattern = 'PINGPONG',
            maxRuntimeMin = 60,
            promptAutoEnabled = false,
            promptAutoCurve = 'BALANCED'
        } = e.detail;
        const preferredMode = normalizePreferredVisualMode(preferredVisual);
        promptAutoEnabledSetting = !!promptAutoEnabled;
        promptAutoCurveMode = (String(promptAutoCurve).toUpperCase() as PromptAutoCurve);
        if (!['BALANCED', 'AGGRESSIVE', 'CINEMATIC'].includes(promptAutoCurveMode)) {
            promptAutoCurveMode = 'BALANCED';
        }
        
        // Optimistic update in UI sets state to GENERATING, so we must allow it.
        // if (superCtrl.mixState !== 'IDLE') return; <--- REMOVED BLOCKER

        // 1. Identify Decks
        // UI sends 'A->B' or 'B->A' (no spaces)
        const sourceId = direction.includes("A->") ? "A" : "B";
        const targetId = sourceId === "A" ? "B" : "A";
        
        pendingMixContext = { sourceId, targetId };
        mixCompletionHandled = false;

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
            const sourceDeckCtrl = sourceId === 'A' ? deckA : deckB;
            const targetDeckCtrl = targetId === 'A' ? deckA : deckB;
            const sourceStateSnapshot = {
                ...uiState,
                deckId: sourceId as 'A' | 'B',
                deckPrompt: sourceId === 'A' ? (uiState.deckAPrompt || uiState.theme) : (uiState.deckBPrompt || uiState.theme),
                currentBpm: engine.masterBpm,
                keyRoot: uiState.keyRoot,
                scalePrompt: uiState.scalePrompt,
                scaleLabel: uiState.scaleLabel,
                isSlamming
            };
            const targetStateSnapshot = {
                ...uiState,
                deckId: targetId as 'A' | 'B',
                deckPrompt: targetId === 'A' ? (uiState.deckAPrompt || uiState.theme) : (uiState.deckBPrompt || uiState.theme),
                currentBpm: engine.masterBpm,
                keyRoot: uiState.keyRoot,
                scalePrompt: uiState.scalePrompt,
                scaleLabel: uiState.scaleLabel,
                isSlamming
            };
            const sourceResolvedPrompt = generatePrompt(sourceStateSnapshot);
            const targetResolvedPrompt = generatePrompt(targetStateSnapshot);
            const sourcePromptSnapshot = (
                sourceResolvedPrompt ||
                sourceDeckCtrl.generatedPrompt ||
                (sourceId === 'A' ? uiState.deckAPrompt : uiState.deckBPrompt) ||
                uiState.theme ||
                'Unknown'
            ).trim();
            const targetPromptSnapshot = (
                targetResolvedPrompt ||
                targetDeckCtrl.generatedPrompt ||
                (targetId === 'A' ? uiState.deckAPrompt : uiState.deckBPrompt) ||
                uiState.theme ||
                'Unknown'
            ).trim();
            const arrangementHint = [
                `mood=${String(mood)}`,
                `theme=${uiState.theme || 'N/A'}`,
                `ambient=${uiState.valAmbient}`,
                `minimal=${uiState.valMinimal}`,
                `dub=${uiState.valDub}`,
                `impact=${uiState.valImpact}`,
                `color=${uiState.valColor}`,
                `texture=${uiState.typeTexture || 'N/A'}`,
                `pulse=${uiState.typePulse || 'N/A'}`,
                `target_duration_bars=${duration}`,
                `phrase_contour=presence->handoff->wash_out`
            ].join(', ');
            const promptContext: PromptContextInput = {
                sourceDeck: sourceId as 'A' | 'B',
                targetDeck: targetId as 'A' | 'B',
                sourcePrompt: sourcePromptSnapshot,
                targetPrompt: targetPromptSnapshot,
                sourcePlaying: !engine.isDeckStopped(sourceId as 'A' | 'B'),
                targetPlaying: !engine.isDeckStopped(targetId as 'A' | 'B'),
                keyRoot: uiState.keyRoot || '',
                scaleLabel: uiState.scaleLabel || '',
                scalePrompt: uiState.scalePrompt || '',
                sourceGeneratedPrompt: sourceDeckCtrl.generatedPrompt || '',
                targetGeneratedPrompt: targetDeckCtrl.generatedPrompt || '',
                arrangementHint
            };

            const integratedPlan = await mixGen.generateIntegratedPlan(
                req,
                engine.masterBpm,
                { isAStopped, isBStopped },
                promptContext,
                preferredMode
            );
            pendingIntegratedPlan = integratedPlan;
            const score = integratedPlan.audio_plan;
            
            if (score) {
                superCtrl.addLog(`SCORE RECEIVED. Tracks: ${score.tracks.length}`);
                const planner = integratedPlan.meta.plan_model || 'unknown';
                superCtrl.addLog(`PLANNER: ${planner}`);
                if (planner === 'template') {
                    superCtrl.addLog('FALLBACK PLAN ACTIVE: deterministic EQ/FX automation');
                    if (integratedPlan.meta.plan_fallback_reason) {
                        superCtrl.addLog(`FALLBACK REASON: ${integratedPlan.meta.plan_fallback_reason}`);
                    }
                    const canRunTemplate = sessionMode === 'free' || allowTemplateMixPlan;
                    if (!canRunTemplate) {
                        superCtrl.mixState = 'IDLE';
                        superCtrl.addLog('MIX BLOCKED: Gemini planner unavailable.');
                        superCtrl.addLog('Add ?allowTemplatePlan=1 to URL only if you want forced template mix.');
                        pendingIntegratedPlan = null;
                        return;
                    }
                    if (sessionMode === 'free') {
                        superCtrl.addLog('FREE MODE CONTINUE: using safe subset fallback plan (autoplay maintained).');
                    }
                }
                if (integratedPlan.meta.description) {
                    const desc = integratedPlan.meta.description.slice(0, 96);
                    superCtrl.addLog(`PLAN NOTE: ${desc}${integratedPlan.meta.description.length > 96 ? '...' : ''}`);
                }
                if (import.meta.env.DEV) {
                    console.log('[AI Mix] Plan prompt context hash:', integratedPlan.prompt_context_ref.context_hash);
                }
                autoEngine.loadScore(score);
                visualTransitionEngine.loadPlan(integratedPlan.visual_plan);
                
                autoEngine.setOnProgress((bar, phase) => {
                     superCtrl.updateStatus(bar, phase, duration);
                     visualTransitionEngine.update(bar);
                     if (
                        pendingMixContext &&
                        bar >= 4 &&
                        bar < Math.max(8, duration - 4) &&
                        (bar - lastRhythmRelockBar) >= 16
                     ) {
                        const { sourceId, targetId } = pendingMixContext;
                        const planBpm =
                            Number(integratedPlan.meta.target_bpm) ||
                            Number(score.meta.target_bpm) ||
                            Number(engine.masterBpm) ||
                            120;
                        lockMixRhythm(sourceId as 'A' | 'B', targetId as 'A' | 'B', planBpm, 'RELOCK');
                        lastRhythmRelockBar = bar;
                     }
                     if (applyAutoPromptFromMix) {
                        applyAutoPromptFromMix(bar, phase, duration, String(mood));
                     }
                     if (lastMixStartPerfMs > 0) {
                        const elapsedSec = (performance.now() - lastMixStartPerfMs) / 1000.0;
                        const secondsPerBar = (60 / Math.max(1, score.meta.target_bpm)) * 4;
                        const expectedSec = bar * secondsPerBar;
                        const skewMs = Math.abs(elapsedSec - expectedSec) * 1000.0;
                        if (freeModeSession?.active) {
                            const m = freeModeSession.metrics;
                            m.syncSkewMsMax = Math.max(m.syncSkewMsMax, skewMs);
                            m.syncSkewMsAvg = ((m.syncSkewMsAvg * m.syncSamples) + skewMs) / (m.syncSamples + 1);
                            m.syncSamples += 1;
                        }
                     }
                     if (threeViz.visualMode !== 'debug_ai' && !integratedPlan.visual_plan?.tracks?.length) {
                        const targetMode = resolveMixVisualMode(phase, preferredMode);
                        applyVisualMode?.(targetMode, 'fallback');
                     }

                     const wholeBar = Math.floor(bar);
                     if (visualFxMode === 'AUTO' && wholeBar !== lastAutoFxCheckBar) {
                        lastAutoFxCheckBar = wholeBar;
                        const canTry =
                            wholeBar > 0 &&
                            wholeBar < Math.max(2, duration - 1) &&
                            wholeBar % 4 === 0 &&
                            wholeBar - lastVisualFxBar >= 8;
                        if (canTry) {
                            const chance = 0.12 + visualFxIntensity * 0.2;
                            if (Math.random() < chance) {
                                triggerSceneFx('auto', bar);
                            }
                        }
                     }

                     if (!mixCompletionHandled && (phase === 'COMPLETE' || bar >= duration)) {
                         mixCompletionHandled = true;
                         promptAutoControlActive = false;
                         visualTransitionEngine.stop();
                         applySafetyReset(integratedPlan);
                         superCtrl.mixState = 'IDLE';
                         superCtrl.addLog(`MIX COMPLETE.`);
                         if (freeModeSession?.active) {
                            freeModeSession.metrics.mixCount += 1;
                         }

                         const dir = integratedPlan.meta.direction;
                         const stoppedDeck = dir === 'A->B' ? 'A' : 'B';
                         if (integratedPlan.post_actions?.regen_stopped_deck) {
                             if (freeModeSession?.active) {
                                 superCtrl.mixState = 'POST_REGEN';
                                 superCtrl.addLog(`POST REGEN: DECK ${stoppedDeck}`);
                                 freeModeSession.metrics.regenAttempts += 1;
                                 triggerDeckRegeneration(stoppedDeck);
                                 freeModeSession.metrics.regenSuccess += 1;
                             } else {
                                 // SINGLE mode: regenerate in background, but return UI to IDLE
                                 // so users can immediately choose the next manual action.
                                 superCtrl.addLog(`POST REGEN (background): DECK ${stoppedDeck}`);
                                 triggerDeckRegeneration(stoppedDeck);
                                 superCtrl.addLog('SINGLE MODE: no automatic next mix. Choose A→B or B→A to continue.');
                                 superCtrl.mixState = 'IDLE';
                             }
                         }

                         if (freeModeSession?.active) {
                             const elapsedMs = Date.now() - freeModeSession.startMs;
                             if (elapsedMs >= freeModeSession.maxRuntimeMs) {
                                 superCtrl.mixState = 'COMPLETE';
                                 superCtrl.addLog(
                                    `FREE MODE COMPLETE. mixes=${freeModeSession.metrics.mixCount} ` +
                                    `regen=${freeModeSession.metrics.regenSuccess}/${freeModeSession.metrics.regenAttempts} ` +
                                    `sync_max=${freeModeSession.metrics.syncSkewMsMax.toFixed(0)}ms ` +
                                    `sync_avg=${freeModeSession.metrics.syncSkewMsAvg.toFixed(0)}ms`
                                 );
                                 freeModeSession = null;
                                 clearFreeModeTimer();
                                 return;
                             }

                             const nextSec = Math.max(
                                 240,
                                 Math.min(300, integratedPlan.post_actions?.next_trigger_sec ?? 240)
                             );
                             freeModeSession.cycleIndex += 1;
                             freeModeSession.nextDirection = resolvePatternDirection(
                                 freeModeSession.pattern,
                                 freeModeSession.cycleIndex
                             );
                             superCtrl.mixState = 'WAIT_NEXT';
                             superCtrl.addLog(`WAIT NEXT: ${nextSec}s (${freeModeSession.nextDirection})`);
                             clearFreeModeTimer();
                             freeModeTimer = window.setTimeout(() => {
                                 superCtrl.dispatchEvent(new CustomEvent('ai-mix-trigger', {
                                     detail: {
                                         direction: freeModeSession?.nextDirection ?? 'A->B',
                                         duration: freeModeSession?.duration ?? duration,
                                         mood: freeModeSession?.mood ?? mood,
                                         preferredVisual: freeModeSession?.preferredVisual ?? preferredMode,
                                         sessionMode: 'free',
                                         pattern: freeModeSession?.pattern ?? pattern,
                                         maxRuntimeMin: Math.floor((freeModeSession?.maxRuntimeMs ?? 3600000) / 60000),
                                         promptAutoEnabled: promptAutoEnabledSetting,
                                         promptAutoCurve: promptAutoCurveMode
                                     },
                                     bubbles: true,
                                     composed: true
                                 }));
                             }, nextSec * 1000);
                         }
                     }
                });
                
                superCtrl.mixState = 'READY';
                superCtrl.addLog(`READY TO START.`);
                if (sessionMode === 'free') {
                    if (!freeModeSession) {
                        freeModeSession = {
                            active: true,
                            pattern: pattern === 'ABBA' ? 'ABBA' : 'PINGPONG',
                            cycleIndex: 0,
                            startMs: Date.now(),
                            maxRuntimeMs: Math.max(1, Math.min(60, Number(maxRuntimeMin))) * 60 * 1000,
                            duration: Number(duration),
                            mood: String(mood),
                            preferredVisual: preferredMode,
                            nextDirection: direction === 'B->A' ? 'B->A' : 'A->B',
                            metrics: {
                                mixCount: 0,
                                regenAttempts: 0,
                                regenSuccess: 0,
                                syncSkewMsMax: 0,
                                syncSkewMsAvg: 0,
                                syncSamples: 0
                            }
                        };
                    } else {
                        freeModeSession.duration = Number(duration);
                        freeModeSession.mood = String(mood);
                        freeModeSession.preferredVisual = preferredMode;
                    }
                    superCtrl.dispatchEvent(new CustomEvent('ai-mix-start', { bubbles: true, composed: true }));
                }
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
        
        if (import.meta.env.DEV) console.log(`[AI Mix] Starting Mix...`);
        superCtrl.mixState = 'MIXING';
        lastRhythmRelockBar = -Infinity;
        superCtrl.addLog(`MIX STARTED.`);
        promptAutoControlActive = promptAutoEnabledSetting;
        promptAutoLastUiPushMs = 0;
        promptAutoLastPromptPushMs = 0;
        promptAutoSeedTargets = null;
        promptAutoLastPromptSnapshot = null;
        superCtrl.addLog(`AUTO PROMPT CONTROL: ${promptAutoControlActive ? `ON (${promptAutoCurveMode})` : 'OFF'}`);

        // --- SAFETY NET: Force Play if Stopped ---
        if (pendingMixContext) {
            const { sourceId, targetId } = pendingMixContext;
            
            // Visuals: Randomize Skin for the Incoming Track
            threeViz.randomizeColor(targetId as 'A' | 'B');

            // 1. Force Source Deck to Play (The track leaving)
            // Always force play state to ensure sync
            if (import.meta.env.DEV) console.log(`[SafetyNet] Force Ensuring Source Deck ${sourceId} Playing`);
            window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deckId: sourceId, playing: true } }));
            
            // 2. Force Target Deck to Play (The track entering)
            if (import.meta.env.DEV) console.log(`[SafetyNet] Force Ensuring Target Deck ${targetId} Playing`);
            window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deckId: targetId, playing: true } }));

            // 3. Hard lock rhythm before automation starts.
            const planBpm =
                Number(pendingIntegratedPlan?.meta?.target_bpm) ||
                Number(pendingIntegratedPlan?.audio_plan?.meta?.target_bpm) ||
                Number(engine.masterBpm) ||
                120;
            lockMixRhythm(sourceId as 'A' | 'B', targetId as 'A' | 'B', planBpm, 'START');
        }

        // Delay AutomationEngine start to ensure SafetyNet transport commands are fully processed
        // This prevents AI score's Bar 0 transport commands from immediately overriding SafetyNet
        setTimeout(() => {
            lastMixStartPerfMs = performance.now();
            visualTransitionEngine.start();
            autoEngine.start();
        }, 200);
    });

    superCtrl.addEventListener('ai-mix-abort', () => {
        autoEngine.stop();
        visualTransitionEngine.stop();
        promptAutoControlActive = false;
        clearFreeModeTimer();
        freeModeSession = null;
        pendingIntegratedPlan = null;
        lastMixStartPerfMs = 0;
        superCtrl.mixState = 'IDLE';
        superCtrl.addLog(`MIX ABORTED.`);
    });

    superCtrl.addEventListener('ai-mix-cancel', () => {
        // Cancel the generated mix without starting - just reset state
        visualTransitionEngine.stop();
        promptAutoControlActive = false;
        clearFreeModeTimer();
        freeModeSession = null;
        pendingIntegratedPlan = null;
        lastMixStartPerfMs = 0;
        superCtrl.mixState = 'IDLE';
        pendingMixContext = null;
    });

    
    const { dispose: disposeDeckTransportEvents } = setupDeckTransportEvents({
        engine,
        deckA,
        deckB
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
    const { dispose: disposeVisualSyncEvents } = setupVisualSyncEvents({
        engine,
        threeViz
    });

    // --- SAVE LOOP HANDLER ---
    let libraryStore: LibraryStore | null = null;
    const getLibraryStore = async () => {
        if (!libraryStore) {
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
            if (import.meta.env.DEV) console.log('[SAVE HANDLER] Save cancelled by user');
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
        const validityResult = analyzeAudioValidity(loopData.pcmData, 44100, 0.001, 0.8);
        
        if (!validityResult.hasEnoughAudio) {
            const validPercent = Math.round(validityResult.validRatio * 100);
            const proceed = confirm(
                `⚠️ 警告: オーディオの ${validPercent}% しか有効な音声がありません。\n` +
                `(${100 - validPercent}% が無音部分です)\n\n` +
                `このまま保存しますか？`
            );
            if (!proceed) {
                if (import.meta.env.DEV) console.log('[SAVE HANDLER] Save cancelled due to insufficient audio');
                return;
            }
        }

        // Get current prompt for metadata
        const targetDeck = deck === 'A' ? deckA : deckB;
        const prompt = targetDeck.generatedPrompt || uiState.theme || 'Unknown';

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
            if (import.meta.env.DEV) {
                console.log(`[SAVE HANDLER] Loop saved: ${name} (${loopData.duration.toFixed(1)}s @ ${loopData.bpm} BPM) [Valid: ${Math.round(validityResult.validRatio * 100)}%] [Tags: ${tags.join(', ')}]`);
            }
            
            // Visual feedback
            alert(`ループを保存しました: ${name}\nタグ: ${tags.slice(0, 5).join(', ')}${tags.length > 5 ? '...' : ''}`);

            // Notify library to refresh
            window.dispatchEvent(new CustomEvent('library-updated', { bubbles: true, composed: true }));
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
    const sliderRefs: { name: string, wrapper: HTMLElement, slider: BioSliderElement }[] = [];
    const comboRefs: { name: string, wrapper: HTMLElement, select: HTMLSelectElement, slider: BioSliderElement }[] = [];
    const setBioSliderValue = (slider: BioSliderElement, value: number) => {
        const current = Number(slider.value ?? 0);
        if (Math.abs(current - value) < 0.5) return;
        slider.value = value;
        slider.dispatchEvent(new CustomEvent('change', {
            detail: value,
            bubbles: true,
            composed: true
        }));
    };

    const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
    const clamp100 = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
    const computeAutoPromptTargets = (
        progress: number,
        mood: string,
        curve: PromptAutoCurve,
        seed: PromptAutoTargets
    ): PromptAutoTargets => {
        // Keep modulation around the user's current setup, not hard jumps to global presets.
        let ambient = seed.ambient + (6 * (0.5 - progress));
        let minimal = seed.minimal + (8 * (progress - 0.35));
        let dub = seed.dub + (10 * Math.sin(Math.PI * progress));
        let impact = seed.impact + (9 * progress);
        let color = seed.color + (8 * (progress - 0.25));
        const m = mood.toLowerCase();
        if (m.includes('cinema')) {
            ambient += 4;
            minimal -= 3;
            impact -= 5;
            color -= 2;
        } else if (m.includes('chaos')) {
            ambient -= 5;
            minimal += 7;
            dub += 6;
            impact += 7;
            color += 4;
        } else if (m.includes('organic')) {
            ambient += 4;
            minimal -= 4;
            dub += 3;
        } else if (m.includes('rhythmic')) {
            ambient -= 3;
            minimal += 5;
            impact += 6;
        }
        if (curve === 'AGGRESSIVE') {
            ambient -= 4;
            minimal += 5;
            dub += 5;
            impact += 7;
            color += 4;
        } else if (curve === 'CINEMATIC') {
            ambient += 5;
            minimal -= 4;
            dub += 2;
            impact -= 5;
            color -= 3;
        }
        return {
            ambient: clamp100(ambient),
            minimal: clamp100(minimal),
            dub: clamp100(dub),
            impact: clamp100(impact),
            color: clamp100(color)
        };
    };

    const readPromptAutoSeed = (): PromptAutoTargets => ({
        ambient: clamp100(uiState.valAmbient),
        minimal: clamp100(uiState.valMinimal),
        dub: clamp100(uiState.valDub),
        impact: clamp100(uiState.valImpact),
        color: clamp100(uiState.valColor)
    });

    const smoothPromptAutoTargets = (
        current: PromptAutoTargets,
        target: PromptAutoTargets,
        curve: PromptAutoCurve
    ): PromptAutoTargets => {
        const maxStep = curve === 'AGGRESSIVE' ? 3.0 : curve === 'CINEMATIC' ? 1.8 : 2.2;
        const glide = (from: number, to: number) => {
            const delta = to - from;
            if (Math.abs(delta) <= maxStep) return clamp100(to);
            return clamp100(from + Math.sign(delta) * maxStep);
        };
        return {
            ambient: glide(current.ambient, target.ambient),
            minimal: glide(current.minimal, target.minimal),
            dub: glide(current.dub, target.dub),
            impact: glide(current.impact, target.impact),
            color: glide(current.color, target.color)
        };
    };

    const promptAutoSnapshotDelta = (a: PromptAutoTargets, b: PromptAutoTargets) => {
        return Math.max(
            Math.abs(a.ambient - b.ambient),
            Math.abs(a.minimal - b.minimal),
            Math.abs(a.dub - b.dub),
            Math.abs(a.impact - b.impact),
            Math.abs(a.color - b.color)
        );
    };

    applyAutoPromptFromMix = (bar, _phase, totalBars, mood) => {
        if (!promptAutoControlActive) return;
        const now = performance.now();
        if (now - promptAutoLastUiPushMs < 420) return;
        promptAutoLastUiPushMs = now;

        if (!promptAutoSeedTargets) {
            promptAutoSeedTargets = readPromptAutoSeed();
        }

        const progress = clamp01(totalBars > 0 ? bar / totalBars : 0);
        const rawTargets = computeAutoPromptTargets(progress, mood, promptAutoCurveMode, promptAutoSeedTargets);
        const currentTargets = readPromptAutoSeed();
        const targets = smoothPromptAutoTargets(currentTargets, rawTargets, promptAutoCurveMode);
        const sliderByName = (name: string) => sliderRefs.find((s) => s.name === name)?.slider;

        const ambientSlider = sliderByName('AMBIENT');
        const minimalSlider = sliderByName('MINIMAL');
        const dubSlider = sliderByName('DUB');
        const impactSlider = sliderByName('IMPACT');
        const colorSlider = sliderByName('COLOR');
        if (ambientSlider) setBioSliderValue(ambientSlider, targets.ambient);
        if (minimalSlider) setBioSliderValue(minimalSlider, targets.minimal);
        if (dubSlider) setBioSliderValue(dubSlider, targets.dub);
        if (impactSlider) setBioSliderValue(impactSlider, targets.impact);
        if (colorSlider) setBioSliderValue(colorSlider, targets.color);

        if (now - promptAutoLastPromptPushMs >= 6000) {
            if (!promptAutoLastPromptSnapshot || promptAutoSnapshotDelta(promptAutoLastPromptSnapshot, targets) >= 3) {
                updatePrompts();
                promptAutoLastPromptSnapshot = { ...targets };
            }
            promptAutoLastPromptPushMs = now;
        }
    };

    // Helper to create slider with reference
    const createAiSliderWithRef = (label: string, onChange: (val: number) => void): HTMLElement => {
        const wrapper = createAiSlider(label, onChange);
        const slider = wrapper.querySelector('bio-slider') as BioSliderElement | null;
        if (slider) {
            sliderRefs.push({ name: label, wrapper, slider });
        }
        return wrapper;
    };

    // Helper to create combo slot with reference
    const createComboSlotWithRef = (label: string, options: string[], onChange: (sel: string, val: number) => void): HTMLElement => {
        const wrapper = createComboSlot(label, options, onChange);
        const select = wrapper.querySelector('select') as HTMLSelectElement;
        const slider = wrapper.querySelector('bio-slider') as BioSliderElement | null;
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
            setBioSliderValue(ref.slider, randomVal);
        });

        // Randomize combo slot types and values
        comboRefs.forEach(ref => {
            const optionCount = ref.select.options.length;
            const randomIndex = Math.floor(Math.random() * optionCount);
            ref.select.selectedIndex = randomIndex;
            ref.select.dispatchEvent(new Event('change', { bubbles: true }));

            const randomVal = Math.floor(Math.random() * 100);
            setBioSliderValue(ref.slider, randomVal);
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
             
             slider.oninput = (e: Event) => {
                 const target = e.target as HTMLInputElement | null;
                 if (!target) return;
                 const v = parseFloat(target.value);
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
        
        // Reset to neutral values for current DSP implementation.
        // SLAM filter is LP in processor.ts, so low cutoff (20Hz) can mute output.
        engine.updateDspParam('SLAM_CUTOFF', 20000.0);
        engine.updateDspParam('SLAM_RES', 0.0);
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

    const {
        sideToggleBtn,
        libraryPanelContainer,
        isPanelVisible: isLibraryPanelVisible,
        dispose: disposeLibrarySidebar
    } = setupLibrarySidebar({
        engine,
        deckA,
        deckB
    });
    
    shell.appendChild(actionsContainer);

    const showInitializationOverlay = () => {
        const overlay = document.createElement('div');
        overlay.className = 'boot-overlay';
        const stage = document.createElement('div');
        stage.className = 'boot-stage';
        const logo = document.createElement('div');
        logo.className = 'boot-logo';
        logo.textContent = 'Bio:gram';
        const startBtn = document.createElement('button');
        startBtn.className = 'boot-start-btn';
        startBtn.textContent = hasApiKey() ? "INITIALIZE SYSTEM" : "SET API KEY";
        stage.appendChild(logo);
        stage.appendChild(startBtn);
        overlay.appendChild(stage);
        document.body.appendChild(overlay);

        requestAnimationFrame(() => {
            logo.classList.add('visible');
        });
        window.setTimeout(() => {
            logo.classList.remove('visible');
        }, 1200);
        window.setTimeout(() => {
            startBtn.classList.add('visible');
        }, 1760);

        startBtn.onclick = async () => {
            if (!hasApiKey()) {
                openApiSettingsModal(true);
                return;
            }
            startBtn.disabled = true;
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
            viewContainer.style.opacity = '1';
            threeViz.style.opacity = '1';
            overlay.style.opacity = '0';
            window.setTimeout(() => {
                overlay.remove();
            }, 420);
        };

        if (!hasApiKey()) {
            openApiSettingsModal(true);
        }
    };

    showInitializationOverlay();

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
    const { dispose: disposeZenOverlay } = setupZenOverlay({
        engine,
        threeViz,
        vizControls,
        viewContainer,
        sideToggleBtn,
        libraryPanelContainer,
        isLibraryPanelVisible
    });

    const cleanup = () => {
        window.removeEventListener('view-change', applyViewChange as EventListener);
        disposeVisualSyncEvents();
        disposeDeckTransportEvents();
        disposeZenOverlay();
        disposeLibrarySidebar();
    };
    window.addEventListener('beforeunload', cleanup, { once: true });

}


// End of file
