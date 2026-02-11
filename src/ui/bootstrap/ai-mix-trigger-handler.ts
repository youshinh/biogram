import type { PromptContextInput } from '../../types/integrated-ai-mix';

type PatternType = 'PINGPONG' | 'ABBA';
type MixDirection = 'A->B' | 'B->A';

type FreeModeSession = {
  active: boolean;
  pattern: PatternType;
  cycleIndex: number;
  startMs: number;
  maxRuntimeMs: number;
  duration: number;
  mood: string;
  preferredVisual: string;
  nextDirection: MixDirection;
  metrics: {
    mixCount: number;
    regenAttempts: number;
    regenSuccess: number;
    syncSkewMsMax: number;
    syncSkewMsAvg: number;
    syncSamples: number;
    lastError?: string;
  };
};

type PendingMixContext = { sourceId: string; targetId: string } | null;

export type AiMixTriggerHandlerOptions = {
  superCtrl: any;
  engine: any;
  deckA: any;
  deckB: any;
  threeViz: any;
  allowTemplateMixPlan: boolean;
  normalizePreferredVisualMode: (mode: string) => string;
  resolveMixVisualMode: (phase: string, preferred: string) => string;
  generatePrompt: (state: any) => string;
  uiState: any;
  getIsSlamming: () => boolean;
  getMixGen: () => { generateIntegratedPlan: (...args: any[]) => Promise<any> };
  getAutoEngine: () => { loadScore: (score: any) => void; setOnProgress: (fn: (bar: number, phase: string) => void) => void };
  visualTransitionEngine: { loadPlan: (plan: any) => void; update: (bar: number) => void; stop: () => void };
  lockMixRhythm: (sourceDeck: 'A' | 'B', targetDeck: 'A' | 'B', targetBpmRaw: number, reason: 'START' | 'RELOCK') => void;
  applyVisualMode: (mode: string, source?: 'ui' | 'plan' | 'fallback') => void;
  getApplyAutoPromptFromMix: () => ((bar: number, phase: string, totalBars: number, mood: string) => void) | null;
  applySafetyReset: (plan: any) => void;
  triggerSceneFx: (reason: 'manual' | 'auto', bar: number) => void;
  resolvePatternDirection: (pattern: PatternType, index: number) => MixDirection;
  triggerDeckRegeneration: (deck: 'A' | 'B') => void;
  clearFreeModeTimer: () => void;
  setFreeModeTimer: (timer: number | null) => void;
  getPendingMixContext: () => PendingMixContext;
  setPendingMixContext: (ctx: PendingMixContext) => void;
  setPendingIntegratedPlan: (plan: any | null) => void;
  getFreeModeSession: () => FreeModeSession | null;
  setFreeModeSession: (session: FreeModeSession | null) => void;
  getLastMixStartPerfMs: () => number;
  getLastRhythmRelockBar: () => number;
  setLastRhythmRelockBar: (value: number) => void;
  setMixCompletionHandled: (value: boolean) => void;
  getMixCompletionHandled: () => boolean;
  getPromptAutoEnabledSetting: () => boolean;
  setPromptAutoEnabledSetting: (value: boolean) => void;
  getPromptAutoCurveMode: () => string;
  setPromptAutoCurveMode: (value: 'BALANCED' | 'AGGRESSIVE' | 'CINEMATIC') => void;
  setPromptAutoControlActive: (value: boolean) => void;
  getVisualFxMode: () => 'OFF' | 'AUTO' | 'MANUAL';
  getVisualFxIntensity: () => number;
  getLastAutoFxCheckBar: () => number;
  setLastAutoFxCheckBar: (value: number) => void;
  getLastVisualFxBar: () => number;
};

export const setupAiMixTriggerHandler = (options: AiMixTriggerHandlerOptions) => {
  const onMixTrigger = async (e: any) => {
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

    const preferredMode = options.normalizePreferredVisualMode(preferredVisual);
    options.setPromptAutoEnabledSetting(!!promptAutoEnabled);
    const rawCurve = String(promptAutoCurve).toUpperCase();
    const curveMode = rawCurve === 'AGGRESSIVE' || rawCurve === 'CINEMATIC' ? rawCurve : 'BALANCED';
    options.setPromptAutoCurveMode(curveMode as 'BALANCED' | 'AGGRESSIVE' | 'CINEMATIC');

    const sourceId = direction.includes('A->') ? 'A' : 'B';
    const targetId = sourceId === 'A' ? 'B' : 'A';

    options.setPendingMixContext({ sourceId, targetId });
    options.setMixCompletionHandled(false);

    const isAStopped = options.engine.isDeckStopped('A');
    const isBStopped = options.engine.isDeckStopped('B');

    if (options.engine['context'].state === 'suspended') {
      await options.engine['context'].resume();
    }

    options.superCtrl.mixState = 'GENERATING';
    options.superCtrl.addLog(`ARCHITECTING MIX: ${direction} (${duration} Bars)`);

    const req = `Mix from ${direction}. Duration: ${duration} Bars. Mood: ${mood}.`;

    try {
      const sourceDeckCtrl = sourceId === 'A' ? options.deckA : options.deckB;
      const targetDeckCtrl = targetId === 'A' ? options.deckA : options.deckB;
      const sourceStateSnapshot = {
        ...options.uiState,
        deckId: sourceId as 'A' | 'B',
        deckPrompt: sourceId === 'A' ? (options.uiState.deckAPrompt || options.uiState.theme) : (options.uiState.deckBPrompt || options.uiState.theme),
        currentBpm: options.engine.masterBpm,
        keyRoot: options.uiState.keyRoot,
        scalePrompt: options.uiState.scalePrompt,
        scaleLabel: options.uiState.scaleLabel,
        isSlamming: options.getIsSlamming()
      };
      const targetStateSnapshot = {
        ...options.uiState,
        deckId: targetId as 'A' | 'B',
        deckPrompt: targetId === 'A' ? (options.uiState.deckAPrompt || options.uiState.theme) : (options.uiState.deckBPrompt || options.uiState.theme),
        currentBpm: options.engine.masterBpm,
        keyRoot: options.uiState.keyRoot,
        scalePrompt: options.uiState.scalePrompt,
        scaleLabel: options.uiState.scaleLabel,
        isSlamming: options.getIsSlamming()
      };
      const sourceResolvedPrompt = options.generatePrompt(sourceStateSnapshot);
      const targetResolvedPrompt = options.generatePrompt(targetStateSnapshot);
      const sourcePromptSnapshot = (
        sourceResolvedPrompt ||
        sourceDeckCtrl.generatedPrompt ||
        (sourceId === 'A' ? options.uiState.deckAPrompt : options.uiState.deckBPrompt) ||
        options.uiState.theme ||
        'Unknown'
      ).trim();
      const targetPromptSnapshot = (
        targetResolvedPrompt ||
        targetDeckCtrl.generatedPrompt ||
        (targetId === 'A' ? options.uiState.deckAPrompt : options.uiState.deckBPrompt) ||
        options.uiState.theme ||
        'Unknown'
      ).trim();
      const arrangementHint = [
        `mood=${String(mood)}`,
        `theme=${options.uiState.theme || 'N/A'}`,
        `ambient=${options.uiState.valAmbient}`,
        `minimal=${options.uiState.valMinimal}`,
        `dub=${options.uiState.valDub}`,
        `impact=${options.uiState.valImpact}`,
        `color=${options.uiState.valColor}`,
        `texture=${options.uiState.typeTexture || 'N/A'}`,
        `pulse=${options.uiState.typePulse || 'N/A'}`,
        `target_duration_bars=${duration}`,
        'phrase_contour=presence->handoff->wash_out'
      ].join(', ');
      const promptContext: PromptContextInput = {
        sourceDeck: sourceId as 'A' | 'B',
        targetDeck: targetId as 'A' | 'B',
        sourcePrompt: sourcePromptSnapshot,
        targetPrompt: targetPromptSnapshot,
        sourcePlaying: !options.engine.isDeckStopped(sourceId as 'A' | 'B'),
        targetPlaying: !options.engine.isDeckStopped(targetId as 'A' | 'B'),
        keyRoot: options.uiState.keyRoot || '',
        scaleLabel: options.uiState.scaleLabel || '',
        scalePrompt: options.uiState.scalePrompt || '',
        sourceGeneratedPrompt: sourceDeckCtrl.generatedPrompt || '',
        targetGeneratedPrompt: targetDeckCtrl.generatedPrompt || '',
        arrangementHint
      };

      const integratedPlan = await options.getMixGen().generateIntegratedPlan(
        req,
        options.engine.masterBpm,
        { isAStopped, isBStopped },
        promptContext,
        preferredMode
      );
      options.setPendingIntegratedPlan(integratedPlan);
      const score = integratedPlan.audio_plan;

      if (!score) {
        throw new Error('Empty Score Returned');
      }

      options.superCtrl.addLog(`SCORE RECEIVED. Tracks: ${score.tracks.length}`);
      const planner = integratedPlan.meta.plan_model || 'unknown';
      options.superCtrl.addLog(`PLANNER: ${planner}`);
      if (planner === 'template') {
        options.superCtrl.addLog('FALLBACK PLAN ACTIVE: deterministic EQ/FX automation');
        if (integratedPlan.meta.plan_fallback_reason) {
          options.superCtrl.addLog(`FALLBACK REASON: ${integratedPlan.meta.plan_fallback_reason}`);
        }
        const canRunTemplate = sessionMode === 'free' || options.allowTemplateMixPlan;
        if (!canRunTemplate) {
          options.superCtrl.mixState = 'IDLE';
          options.superCtrl.addLog('MIX BLOCKED: Gemini planner unavailable.');
          options.superCtrl.addLog('Add ?allowTemplatePlan=1 to URL only if you want forced template mix.');
          options.setPendingIntegratedPlan(null);
          return;
        }
        if (sessionMode === 'free') {
          options.superCtrl.addLog('FREE MODE CONTINUE: using safe subset fallback plan (autoplay maintained).');
        }
      }
      if (integratedPlan.meta.description) {
        const desc = integratedPlan.meta.description.slice(0, 96);
        options.superCtrl.addLog(`PLAN NOTE: ${desc}${integratedPlan.meta.description.length > 96 ? '...' : ''}`);
      }
      if (import.meta.env.DEV) {
        console.log('[AI Mix] Plan prompt context hash:', integratedPlan.prompt_context_ref.context_hash);
      }

      const automation = options.getAutoEngine();
      automation.loadScore(score);
      options.visualTransitionEngine.loadPlan(integratedPlan.visual_plan);

      automation.setOnProgress((bar, phase) => {
        options.superCtrl.updateStatus(bar, phase, duration);
        options.visualTransitionEngine.update(bar);

        const pendingMixContext = options.getPendingMixContext();
        if (
          pendingMixContext &&
          bar >= 4 &&
          bar < Math.max(8, duration - 4) &&
          (bar - options.getLastRhythmRelockBar()) >= 16
        ) {
          const { sourceId: src, targetId: tgt } = pendingMixContext;
          const planBpm =
            Number(integratedPlan.meta.target_bpm) ||
            Number(score.meta.target_bpm) ||
            Number(options.engine.masterBpm) ||
            120;
          options.lockMixRhythm(src as 'A' | 'B', tgt as 'A' | 'B', planBpm, 'RELOCK');
          options.setLastRhythmRelockBar(bar);
        }

        options.getApplyAutoPromptFromMix()?.(bar, phase, duration, String(mood));

        if (options.getLastMixStartPerfMs() > 0) {
          const elapsedSec = (performance.now() - options.getLastMixStartPerfMs()) / 1000.0;
          const secondsPerBar = (60 / Math.max(1, score.meta.target_bpm)) * 4;
          const expectedSec = bar * secondsPerBar;
          const skewMs = Math.abs(elapsedSec - expectedSec) * 1000.0;
          const freeModeSession = options.getFreeModeSession();
          if (freeModeSession?.active) {
            const m = freeModeSession.metrics;
            m.syncSkewMsMax = Math.max(m.syncSkewMsMax, skewMs);
            m.syncSkewMsAvg = ((m.syncSkewMsAvg * m.syncSamples) + skewMs) / (m.syncSamples + 1);
            m.syncSamples += 1;
          }
        }

        if (options.threeViz.visualMode !== 'debug_ai' && !integratedPlan.visual_plan?.tracks?.length) {
          const targetMode = options.resolveMixVisualMode(phase, preferredMode);
          options.applyVisualMode(targetMode, 'fallback');
        }

        const wholeBar = Math.floor(bar);
        if (options.getVisualFxMode() === 'AUTO' && wholeBar !== options.getLastAutoFxCheckBar()) {
          options.setLastAutoFxCheckBar(wholeBar);
          const canTry =
            wholeBar > 0 &&
            wholeBar < Math.max(2, duration - 1) &&
            wholeBar % 4 === 0 &&
            wholeBar - options.getLastVisualFxBar() >= 8;
          if (canTry) {
            const chance = 0.12 + options.getVisualFxIntensity() * 0.2;
            if (Math.random() < chance) {
              options.triggerSceneFx('auto', bar);
            }
          }
        }

        if (!options.getMixCompletionHandled() && (phase === 'COMPLETE' || bar >= duration)) {
          options.setMixCompletionHandled(true);
          options.setPromptAutoControlActive(false);
          options.visualTransitionEngine.stop();
          options.applySafetyReset(integratedPlan);
          options.superCtrl.mixState = 'IDLE';
          options.superCtrl.addLog('MIX COMPLETE.');

          const currentSession = options.getFreeModeSession();
          if (currentSession?.active) {
            currentSession.metrics.mixCount += 1;
          }

          const dir = integratedPlan.meta.direction;
          const stoppedDeck = dir === 'A->B' ? 'A' : 'B';
          if (integratedPlan.post_actions?.regen_stopped_deck) {
            if (currentSession?.active) {
              options.superCtrl.mixState = 'POST_REGEN';
              options.superCtrl.addLog(`POST REGEN: DECK ${stoppedDeck}`);
              currentSession.metrics.regenAttempts += 1;
              options.triggerDeckRegeneration(stoppedDeck);
              currentSession.metrics.regenSuccess += 1;
            } else {
              options.superCtrl.addLog(`POST REGEN (background): DECK ${stoppedDeck}`);
              options.triggerDeckRegeneration(stoppedDeck);
              options.superCtrl.addLog('SINGLE MODE: no automatic next mix. Choose A→B or B→A to continue.');
              options.superCtrl.mixState = 'IDLE';
            }
          }

          const postSession = options.getFreeModeSession();
          if (postSession?.active) {
            const elapsedMs = Date.now() - postSession.startMs;
            if (elapsedMs >= postSession.maxRuntimeMs) {
              options.superCtrl.mixState = 'COMPLETE';
              options.superCtrl.addLog(
                `FREE MODE COMPLETE. mixes=${postSession.metrics.mixCount} ` +
                `regen=${postSession.metrics.regenSuccess}/${postSession.metrics.regenAttempts} ` +
                `sync_max=${postSession.metrics.syncSkewMsMax.toFixed(0)}ms ` +
                `sync_avg=${postSession.metrics.syncSkewMsAvg.toFixed(0)}ms`
              );
              options.setFreeModeSession(null);
              options.clearFreeModeTimer();
              return;
            }

            const nextSec = Math.max(240, Math.min(300, integratedPlan.post_actions?.next_trigger_sec ?? 240));
            postSession.cycleIndex += 1;
            postSession.nextDirection = options.resolvePatternDirection(postSession.pattern, postSession.cycleIndex);
            options.superCtrl.mixState = 'WAIT_NEXT';
            options.superCtrl.addLog(`WAIT NEXT: ${nextSec}s (${postSession.nextDirection})`);
            options.clearFreeModeTimer();
            const timer = window.setTimeout(() => {
              options.superCtrl.dispatchEvent(new CustomEvent('ai-mix-trigger', {
                detail: {
                  direction: options.getFreeModeSession()?.nextDirection ?? 'A->B',
                  duration: options.getFreeModeSession()?.duration ?? duration,
                  mood: options.getFreeModeSession()?.mood ?? mood,
                  preferredVisual: options.getFreeModeSession()?.preferredVisual ?? preferredMode,
                  sessionMode: 'free',
                  pattern: options.getFreeModeSession()?.pattern ?? pattern,
                  maxRuntimeMin: Math.floor((options.getFreeModeSession()?.maxRuntimeMs ?? 3600000) / 60000),
                  promptAutoEnabled: options.getPromptAutoEnabledSetting(),
                  promptAutoCurve: options.getPromptAutoCurveMode()
                },
                bubbles: true,
                composed: true
              }));
            }, nextSec * 1000);
            options.setFreeModeTimer(timer);
          }
        }
      });

      options.superCtrl.mixState = 'READY';
      options.superCtrl.addLog('READY TO START.');
      if (sessionMode === 'free') {
        const currentSession = options.getFreeModeSession();
        if (!currentSession) {
          options.setFreeModeSession({
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
          });
        } else {
          currentSession.duration = Number(duration);
          currentSession.mood = String(mood);
          currentSession.preferredVisual = preferredMode;
        }
        options.superCtrl.dispatchEvent(new CustomEvent('ai-mix-start', { bubbles: true, composed: true }));
      }
    } catch (err: any) {
      console.error('[main] Mix Generation Error:', err);
      options.superCtrl.mixState = 'IDLE';
      options.superCtrl.addLog(`ERROR: ${err.message}`);
    }
  };

  options.superCtrl.addEventListener('ai-mix-trigger', onMixTrigger as EventListener);
  return {
    dispose: () => {
      options.superCtrl.removeEventListener('ai-mix-trigger', onMixTrigger as EventListener);
    }
  };
};
