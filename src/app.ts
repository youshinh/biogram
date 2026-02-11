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
import './ui/modules/super-controls';
import './ui/visuals/ThreeViz';
import './ui/visuals/VisualControls';
import type { ThreeViz } from './ui/visuals/ThreeViz';
import type { VisualControls } from './ui/visuals/VisualControls';
import type { VisualMode } from './ui/visuals/modes';
import { VisualTransitionEngine, mapVisualTargetToEngine } from './ai/visual-transition-engine';
import { createLazyAiServices } from './ai/lazy-ai-services';
import { setupLibrarySidebar } from './ui/bootstrap/library-sidebar';
import { setupLibraryDeckEvents } from './ui/bootstrap/library-deck-events';
import { createControlGridPanel } from './ui/bootstrap/control-grid-panel';
import { createActionFxPanel } from './ui/bootstrap/action-fx-panel';
import { setupZenOverlay } from './ui/bootstrap/zen-overlay';
import { setupDeckTransportEvents } from './ui/bootstrap/deck-transport-events';
import { setupVisualSyncEvents } from './ui/bootstrap/visual-sync-events';
import { setupVisualControlEvents } from './ui/bootstrap/visual-control-events';
import { setupAiMixTriggerHandler } from './ui/bootstrap/ai-mix-trigger-handler';
import { setupAiMixRuntimeControls } from './ui/bootstrap/ai-mix-runtime-controls';
import { showSystemInitializationOverlay } from './ui/bootstrap/system-initializer';
import { createApiSettingsModalController } from './ui/bootstrap/api-settings-modal';
import { ApiKeyManager } from './config/api-key-manager';
import { installAimixWebMcp } from './webmcp/aimix-webmcp';
import type { AppShell } from './ui/shell';
import type { FxRack } from './ui/modules/fx-rack';
import type { DeckController } from './ui/modules/deck-controller';
import type { DjMixer } from './ui/modules/dj-mixer';
import type { SuperControls } from './ui/modules/super-controls';
import type { IntegratedMixPlan } from './types/integrated-ai-mix';
import { generatePrompt, getDisplayPromptParts } from './ai/prompt-generator';
import type { AiGridParams } from './ui/visuals/AiDynamicGrid';

if (import.meta.env.DEV) {
    console.log("Bio:gram v2.0 'Ghost in the Groove' initializing...");
}

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

const urlParams = new URLSearchParams(window.location.search);
const allowTemplateMixPlan = urlParams.get('allowTemplatePlan') === '1';

    // --- Main Controller Mode ---
    const apiKeyManager = new ApiKeyManager(import.meta.env.VITE_GEMINI_API_KEY || '');
    const apiKey = apiKeyManager.getApiKey();
    const engine = new AudioEngine(apiKey);
    window.engine = engine;

    const controlRouter = new ControlRouter({
        getEngine: () => window.engine,
        getThreeViz: () => (window as any).__threeViz as ThreeViz | undefined
    });
    window.controlRouter = controlRouter;

    let midiManager: MidiManager | null = null;
    const ensureMidiManager = () => {
        if (!midiManager) {
            midiManager = new MidiManager(controlRouter, { enabled: false });
            window.midiManager = midiManager;
        }
        return midiManager;
    };

    const aiServices = createLazyAiServices(engine);
    const getAutoEngine = aiServices.getAutoEngine;
    const getMixGen = aiServices.getMixGen;
    const getGridGen = aiServices.getGridGen;
    const getTexturePromptGen = aiServices.getTexturePromptGen;
    const getTextureImageGen = aiServices.getTextureImageGen;
    let deferredBootStarted = false;

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
    const apiSettingsModal = createApiSettingsModalController({
        getStoredApiKey: () => apiKeyManager.getStoredApiKey(),
        setApiKey: (apiKey: string) => apiKeyManager.setApiKey(apiKey),
        clearApiKey: () => apiKeyManager.clearApiKey(),
        onSaved: () => window.location.reload()
    });
    const openApiSettingsModal = (required: boolean = false) => {
        apiSettingsModal.open(required);
    };
    let isSystemInitialized = false;

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

    const runDeferredBootTasks = () => {
        if (deferredBootStarted) return;
        deferredBootStarted = true;
        const execute = () => {
            engine.startAI(true);
            // Keep startup behavior: decks remain stopped until user presses play.
            engine.setTapeStop('A', true);
            engine.setTapeStop('B', true);
            updatePrompts();
        };
        if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(() => execute(), { timeout: 1200 });
            return;
        }
        window.setTimeout(execute, 0);
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

    let midiSettings: (HTMLElement & { togglePanel?: () => void }) | null = null;
    let midiSettingsModulePromise: Promise<unknown> | null = null;
    const ensureMidiSettings = async () => {
        if (midiSettings) return midiSettings;
        if (!midiSettingsModulePromise) {
            midiSettingsModulePromise = import('./ui/modules/midi-settings');
        }
        await midiSettingsModulePromise;
        midiSettings = document.createElement('midi-settings') as HTMLElement & { togglePanel?: () => void };
        document.body.appendChild(midiSettings);
        return midiSettings;
    };
    header.addEventListener('midi-settings-open', () => {
        ensureMidiManager();
        void ensureMidiSettings().then((panel) => panel.togglePanel?.());
    });
    
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

    const disposeWebMcp = installAimixWebMcp({
        superCtrl,
        engine,
        getSystemInitialized: () => isSystemInitialized
    });

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
    // Defer DOM attach until system is ready to avoid heavy visual boot on first paint.
    let isThreeVizAttached = false;
    const attachThreeViz = () => {
        if (isThreeVizAttached) return;
        document.body.insertBefore(threeViz, viewContainer);
        isThreeVizAttached = true;
    };

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
            const params = await getGridGen().generateParams(context);
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

    const { dispose: disposeVisualControlEvents } = setupVisualControlEvents({
        vizControls,
        superCtrl,
        threeViz,
        engine,
        applyVisualMode: (mode, source = 'ui') => applyVisualMode?.(mode as VisualMode, source),
        normalizeVisualModeAlias,
        transitionPresetToType,
        resolveTextureSubjectFromContext,
        compactPrompt,
        getTexturePromptGen,
        getTextureImageGen,
        setVisualFxConfig: (mode, intensity) => {
            visualFxMode = mode;
            visualFxIntensity = intensity;
        },
        triggerSceneFx,
        getLastVisualFxBar: () => lastVisualFxBar,
        generateAiGridParams
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

    const { dispose: disposeAiMixTriggerHandler } = setupAiMixTriggerHandler({
        superCtrl,
        engine,
        deckA,
        deckB,
        threeViz,
        allowTemplateMixPlan,
        normalizePreferredVisualMode,
        resolveMixVisualMode,
        generatePrompt,
        uiState,
        getIsSlamming: () => isSlamming,
        getMixGen,
        getAutoEngine,
        visualTransitionEngine,
        lockMixRhythm,
        applyVisualMode: (mode, source = 'fallback') => applyVisualMode?.(mode as VisualMode, source),
        getApplyAutoPromptFromMix: () => applyAutoPromptFromMix,
        applySafetyReset,
        triggerSceneFx,
        resolvePatternDirection,
        triggerDeckRegeneration,
        clearFreeModeTimer,
        setFreeModeTimer: (timer) => {
            freeModeTimer = timer;
        },
        getPendingMixContext: () => pendingMixContext,
        setPendingMixContext: (ctx) => {
            pendingMixContext = ctx;
        },
        setPendingIntegratedPlan: (plan) => {
            pendingIntegratedPlan = plan;
        },
        getFreeModeSession: () => freeModeSession,
        setFreeModeSession: (session) => {
            freeModeSession = session;
        },
        getLastMixStartPerfMs: () => lastMixStartPerfMs,
        getLastRhythmRelockBar: () => lastRhythmRelockBar,
        setLastRhythmRelockBar: (value) => {
            lastRhythmRelockBar = value;
        },
        setMixCompletionHandled: (value) => {
            mixCompletionHandled = value;
        },
        getMixCompletionHandled: () => mixCompletionHandled,
        getPromptAutoEnabledSetting: () => promptAutoEnabledSetting,
        setPromptAutoEnabledSetting: (value) => {
            promptAutoEnabledSetting = value;
        },
        getPromptAutoCurveMode: () => promptAutoCurveMode,
        setPromptAutoCurveMode: (value) => {
            promptAutoCurveMode = value;
        },
        setPromptAutoControlActive: (value) => {
            promptAutoControlActive = value;
        },
        getVisualFxMode: () => visualFxMode,
        getVisualFxIntensity: () => visualFxIntensity,
        getLastAutoFxCheckBar: () => lastAutoFxCheckBar,
        setLastAutoFxCheckBar: (value) => {
            lastAutoFxCheckBar = value;
        },
        getLastVisualFxBar: () => lastVisualFxBar
    });

    const { dispose: disposeAiMixRuntimeControls } = setupAiMixRuntimeControls({
        superCtrl,
        engine,
        threeViz,
        getAutoEngine,
        stopAutomation: () => aiServices.peekAutoEngine()?.stop(),
        startVisualTransitions: () => visualTransitionEngine.start(),
        stopVisualTransitions: () => visualTransitionEngine.stop(),
        clearFreeModeRuntime: () => {
            clearFreeModeTimer();
            freeModeSession = null;
        },
        lockMixRhythm,
        getPendingMixContext: () => pendingMixContext,
        setPendingMixContext: (ctx) => {
            pendingMixContext = ctx;
        },
        getPendingIntegratedPlan: () => pendingIntegratedPlan,
        setPendingIntegratedPlan: (plan) => {
            pendingIntegratedPlan = plan;
        },
        setLastRhythmRelockBar: (value) => {
            lastRhythmRelockBar = value;
        },
        setLastMixStartPerfMs: (value) => {
            lastMixStartPerfMs = value;
        },
        getPromptAutoEnabledSetting: () => promptAutoEnabledSetting,
        getPromptAutoCurveMode: () => promptAutoCurveMode,
        setPromptAutoControlActive: (value) => {
            promptAutoControlActive = value;
        },
        resetPromptAutoRuntime: () => {
            promptAutoLastUiPushMs = 0;
            promptAutoLastPromptPushMs = 0;
            promptAutoSeedTargets = null;
            promptAutoLastPromptSnapshot = null;
        }
    });

    
    const { dispose: disposeDeckTransportEvents } = setupDeckTransportEvents({
        engine,
        deckA,
        deckB
    });

    const { dispose: disposeLibraryDeckEvents } = setupLibraryDeckEvents({
        engine,
        deckA,
        deckB,
        uiState,
        getIsSlamming: () => isSlamming,
        generatePrompt,
        getDisplayPromptParts
    });

    const { dispose: disposeVisualSyncEvents } = setupVisualSyncEvents({
        engine,
        threeViz
    });
    const controlsPanel = createControlGridPanel({ uiState });
    const controlsContainer = controlsPanel.element;

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
        const sliderByName = (name: string) => controlsPanel.getSliderByName(name);

        const ambientSlider = sliderByName('AMBIENT');
        const minimalSlider = sliderByName('MINIMAL');
        const dubSlider = sliderByName('DUB');
        const impactSlider = sliderByName('IMPACT');
        const colorSlider = sliderByName('COLOR');
        if (ambientSlider) controlsPanel.setSliderValue(ambientSlider, targets.ambient);
        if (minimalSlider) controlsPanel.setSliderValue(minimalSlider, targets.minimal);
        if (dubSlider) controlsPanel.setSliderValue(dubSlider, targets.dub);
        if (impactSlider) controlsPanel.setSliderValue(impactSlider, targets.impact);
        if (colorSlider) controlsPanel.setSliderValue(colorSlider, targets.color);

        if (now - promptAutoLastPromptPushMs >= 6000) {
            if (!promptAutoLastPromptSnapshot || promptAutoSnapshotDelta(promptAutoLastPromptSnapshot, targets) >= 3) {
                updatePrompts();
                promptAutoLastPromptSnapshot = { ...targets };
            }
            promptAutoLastPromptPushMs = now;
        }
    };

    shell.appendChild(controlsContainer);

    const actionsContainer = createActionFxPanel({
        engine,
        getIsSlamming: () => isSlamming,
        setIsSlamming: (value) => {
            isSlamming = value;
        },
        onPromptRefresh: () => {
            updatePrompts();
        }
    });

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

    showSystemInitializationOverlay({
        hasApiKey,
        openApiSettingsModal,
        onInitialize: async () => {
            await engine.init();
            window.dispatchEvent(new CustomEvent('playback-toggled', { detail: false }));
        },
        onReady: () => {
            attachThreeViz();
            shell.status = "LIVE (READY)";
            isSystemInitialized = true;
            viewContainer.style.opacity = '1';
            threeViz.style.opacity = '1';
            runDeferredBootTasks();
        }
    });

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
        disposeLibraryDeckEvents();
        disposeVisualControlEvents();
        disposeAiMixTriggerHandler();
        disposeAiMixRuntimeControls();
        disposeZenOverlay();
        disposeLibrarySidebar();
        disposeWebMcp();
    };
    window.addEventListener('beforeunload', cleanup, { once: true });

// End of file
