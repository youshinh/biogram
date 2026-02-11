import type { AudioEngine } from '../audio/engine';
import type { SuperControls } from '../ui/modules/super-controls';

type SessionMode = 'single' | 'free';
type MixDirection = 'A->B' | 'B->A';
type PromptAutoCurve = 'BALANCED' | 'AGGRESSIVE' | 'CINEMATIC';
type VisualMode =
  | 'organic'
  | 'wireframe'
  | 'monochrome'
  | 'rings'
  | 'waves'
  | 'halid'
  | 'glaze'
  | 'gnosis';

interface WebMcpToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: Record<string, unknown>;
}

interface WebMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input?: Record<string, unknown>) => Promise<WebMcpToolResult> | WebMcpToolResult;
}

interface ModelContextLike {
  registerTool?: (tool: WebMcpToolDefinition) => void;
  unregisterTool?: (name: string) => void;
}

interface InstallAimixWebMcpOptions {
  superCtrl: SuperControls;
  engine: AudioEngine;
  getSystemInitialized: () => boolean;
}

const VISUAL_MODES: VisualMode[] = [
  'organic',
  'wireframe',
  'monochrome',
  'rings',
  'waves',
  'halid',
  'glaze',
  'gnosis'
];

const CURVES: PromptAutoCurve[] = ['BALANCED', 'AGGRESSIVE', 'CINEMATIC'];

const toBool = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === 'boolean') return value;
  return fallback;
};

const toNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const result = (ok: boolean, message: string, state: Record<string, unknown>): WebMcpToolResult => ({
  content: [{ type: 'text', text: message }],
  structuredContent: {
    ok,
    message,
    state
  }
});

export function installAimixWebMcp(options: InstallAimixWebMcpOptions): () => void {
  const nav = navigator as Navigator & { modelContext?: ModelContextLike };
  const modelContext = nav.modelContext;
  if (!modelContext?.registerTool) {
    if (import.meta.env.DEV) console.log('[WebMCP] navigator.modelContext not available; skipping tool registration.');
    return () => {};
  }

  const { superCtrl, engine, getSystemInitialized } = options;
  const toolNames: string[] = [];

  const getState = () => ({
    systemInitialized: getSystemInitialized(),
    mixState: superCtrl.mixState,
    progress: Number(superCtrl.progress.toFixed(3)),
    currentBar: Number(superCtrl.currentBar.toFixed(2)),
    currentPhase: superCtrl.currentPhase,
    sessionMode: superCtrl.sessionMode,
    duration: superCtrl.duration,
    mood: superCtrl.mood,
    preferredVisual: superCtrl.preferredVisual,
    maxRuntimeMin: superCtrl.maxRuntimeMin,
    aiVisualsEnabled: superCtrl.aiVisualsEnabled,
    promptAutoEnabled: superCtrl.promptAutoEnabled,
    promptAutoCurve: superCtrl.promptAutoCurve,
    masterBpm: Number(engine.masterBpm.toFixed(2)),
    deckABpm: Number(engine.bpmA.toFixed(2)),
    deckBBpm: Number(engine.bpmB.toFixed(2)),
    deckAStopped: engine.isDeckStopped('A'),
    deckBStopped: engine.isDeckStopped('B')
  });

  const requireInitialized = () => {
    if (getSystemInitialized()) return null;
    return result(false, 'System is not initialized. Ask the user to press INITIALIZE SYSTEM first.', getState());
  };

  const register = (tool: WebMcpToolDefinition) => {
    try {
      modelContext.unregisterTool?.(tool.name);
    } catch {
      // Ignore unregister failures to keep registration best-effort in preview builds.
    }
    modelContext.registerTool?.(tool);
    toolNames.push(tool.name);
  };

  register({
    name: 'aimix_generate',
    description:
      'Generate an AI mix plan. Use single mode for one-shot A/B transitions, or free mode for continuous automation.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionMode: {
          type: 'string',
          enum: ['single', 'free'],
          description: 'single: one-shot transition, free: continuous ping-pong runtime.'
        },
        direction: {
          type: 'string',
          enum: ['A->B', 'B->A'],
          description: 'Transition direction for single mode.'
        },
        duration: {
          type: 'number',
          enum: [16, 32, 64, 128],
          description: 'Transition length in bars.'
        },
        mood: {
          type: 'string',
          description: 'Mood/style for single mode generation.'
        },
        preferredVisual: {
          type: 'string',
          enum: VISUAL_MODES,
          description: 'Preferred visual style for the mix plan.'
        },
        maxRuntimeMin: {
          type: 'number',
          enum: [15, 30, 45, 60],
          description: 'Used in free mode only.'
        },
        aiVisualsEnabled: {
          type: 'boolean',
          description: 'Enable or disable AI analysis pipeline before generation.'
        },
        promptAutoEnabled: {
          type: 'boolean',
          description: 'Enable automatic prompt control during mix.'
        },
        promptAutoCurve: {
          type: 'string',
          enum: CURVES,
          description: 'Prompt automation curve.'
        }
      }
    },
    execute: async (input = {}) => {
      const initError = requireInitialized();
      if (initError) return initError;

      const sessionMode: SessionMode = input.sessionMode === 'free' ? 'free' : 'single';
      const direction: MixDirection = input.direction === 'B->A' ? 'B->A' : 'A->B';
      const durationRaw = toNumber(input.duration, superCtrl.duration);
      const duration = [16, 32, 64, 128].includes(durationRaw) ? durationRaw : superCtrl.duration;
      const mood = typeof input.mood === 'string' && input.mood.trim() ? input.mood.trim() : superCtrl.mood;
      const preferredVisual = VISUAL_MODES.includes(input.preferredVisual as VisualMode)
        ? (input.preferredVisual as VisualMode)
        : (superCtrl.preferredVisual as VisualMode);
      const maxRuntimeRaw = toNumber(input.maxRuntimeMin, superCtrl.maxRuntimeMin);
      const maxRuntimeMin = [15, 30, 45, 60].includes(maxRuntimeRaw) ? maxRuntimeRaw : superCtrl.maxRuntimeMin;
      const aiVisualsEnabled = toBool(input.aiVisualsEnabled, superCtrl.aiVisualsEnabled);
      const promptAutoEnabled = toBool(input.promptAutoEnabled, superCtrl.promptAutoEnabled);
      const promptAutoCurve = CURVES.includes(input.promptAutoCurve as PromptAutoCurve)
        ? (input.promptAutoCurve as PromptAutoCurve)
        : superCtrl.promptAutoCurve;

      const state = getState();
      const canSingle = superCtrl.mixState === 'IDLE';
      const canFree = superCtrl.mixState === 'IDLE' || superCtrl.mixState === 'COMPLETE';
      if ((sessionMode === 'single' && !canSingle) || (sessionMode === 'free' && !canFree)) {
        return result(
          false,
          `Cannot generate now. Current mixState=${superCtrl.mixState}. Wait for IDLE (or COMPLETE for free mode).`,
          state
        );
      }

      superCtrl.aiVisualsEnabled = aiVisualsEnabled;
      superCtrl.promptAutoEnabled = promptAutoEnabled;
      superCtrl.promptAutoCurve = promptAutoCurve;
      superCtrl.sessionMode = sessionMode;
      superCtrl.duration = duration;
      superCtrl.maxRuntimeMin = maxRuntimeMin;
      if (sessionMode === 'single') {
        superCtrl.mood = mood;
        superCtrl.preferredVisual = preferredVisual;
      }
      superCtrl.addLog(
        `WebMCP generate: mode=${sessionMode} dir=${direction} bars=${duration} mood=${sessionMode === 'single' ? mood : 'Prompt Adaptive'}`
      );

      // Keep engine runtime state synchronized with WebMCP-updated UI state.
      superCtrl.dispatchEvent(
        new CustomEvent('visual-ai-toggle', {
          detail: { enabled: aiVisualsEnabled },
          bubbles: true,
          composed: true
        })
      );

      superCtrl.dispatchEvent(
        new CustomEvent('ai-mix-trigger', {
          detail: {
            direction: sessionMode === 'free' ? 'A->B' : direction,
            duration,
            mood: sessionMode === 'free' ? 'Prompt Adaptive' : mood,
            preferredVisual: sessionMode === 'free' ? 'organic' : preferredVisual,
            sessionMode,
            pattern: 'PINGPONG',
            maxRuntimeMin,
            promptAutoEnabled,
            promptAutoCurve
          },
          bubbles: true,
          composed: true
        })
      );

      return result(
        true,
        `Mix generation requested (${sessionMode}, ${sessionMode === 'free' ? 'A->B ping-pong' : direction}, ${duration} bars).`,
        getState()
      );
    }
  });

  register({
    name: 'aimix_start',
    description: 'Start execution of a previously generated AI mix plan.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const initError = requireInitialized();
      if (initError) return initError;
      if (superCtrl.mixState !== 'READY') {
        return result(false, `Cannot start mix while mixState=${superCtrl.mixState}. Required: READY.`, getState());
      }

      superCtrl.dispatchEvent(new CustomEvent('ai-mix-start', { bubbles: true, composed: true }));
      return result(true, 'Mix start requested.', getState());
    }
  });

  register({
    name: 'aimix_cancel',
    description: 'Cancel a generated mix plan before it starts.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const initError = requireInitialized();
      if (initError) return initError;
      if (superCtrl.mixState !== 'READY') {
        return result(false, `Cannot cancel while mixState=${superCtrl.mixState}. Required: READY.`, getState());
      }
      superCtrl.dispatchEvent(new CustomEvent('ai-mix-cancel', { bubbles: true, composed: true }));
      return result(true, 'Generated mix cancelled.', getState());
    }
  });

  register({
    name: 'aimix_abort',
    description: 'Abort a running or queued mix session immediately.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const initError = requireInitialized();
      if (initError) return initError;
      const abortable = ['MIXING', 'WAIT_NEXT', 'POST_REGEN'];
      if (!abortable.includes(superCtrl.mixState)) {
        return result(
          false,
          `Cannot abort while mixState=${superCtrl.mixState}. Required one of: ${abortable.join(', ')}.`,
          getState()
        );
      }
      superCtrl.dispatchEvent(new CustomEvent('ai-mix-abort', { bubbles: true, composed: true }));
      return result(true, 'Mix aborted.', getState());
    }
  });

  register({
    name: 'aimix_get_state',
    description: 'Read current AIMIX and deck transport state.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => result(true, 'AIMIX state snapshot.', getState())
  });

  if (import.meta.env.DEV) console.log(`[WebMCP] Registered tools: ${toolNames.join(', ')}`);

  return () => {
    for (const name of toolNames) {
      try {
        modelContext.unregisterTool?.(name);
      } catch {
        // Best effort cleanup.
      }
    }
  };
}
