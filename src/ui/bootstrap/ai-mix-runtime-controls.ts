import type { AudioEngine } from '../../audio/engine';
import type { SuperControls } from '../modules/super-controls';
import type { ThreeViz } from '../visuals/ThreeViz';
import type { IntegratedMixPlan } from '../../types/integrated-ai-mix';

type PendingMixContext = { sourceId: string; targetId: string } | null;

export type AiMixRuntimeControlsOptions = {
  superCtrl: SuperControls;
  engine: AudioEngine;
  threeViz: ThreeViz;
  getAutoEngine: () => { start: () => void };
  stopAutomation: () => void;
  startVisualTransitions: () => void;
  stopVisualTransitions: () => void;
  clearFreeModeRuntime: () => void;
  lockMixRhythm: (sourceId: 'A' | 'B', targetId: 'A' | 'B', targetBpm: number, reason?: string) => void;
  getPendingMixContext: () => PendingMixContext;
  setPendingMixContext: (ctx: PendingMixContext) => void;
  getPendingIntegratedPlan: () => IntegratedMixPlan | null;
  setPendingIntegratedPlan: (plan: IntegratedMixPlan | null) => void;
  setLastRhythmRelockBar: (value: number) => void;
  setLastMixStartPerfMs: (value: number) => void;
  getPromptAutoEnabledSetting: () => boolean;
  getPromptAutoCurveMode: () => string;
  setPromptAutoControlActive: (value: boolean) => void;
  resetPromptAutoRuntime: () => void;
};

export const setupAiMixRuntimeControls = (options: AiMixRuntimeControlsOptions) => {
  const onMixStart = () => {
    if (options.superCtrl.mixState !== 'READY') return;

    if (import.meta.env.DEV) console.log('[AI Mix] Starting Mix...');
    options.superCtrl.mixState = 'MIXING';
    options.setLastRhythmRelockBar(-Infinity);
    options.superCtrl.addLog('MIX STARTED.');
    options.setPromptAutoControlActive(options.getPromptAutoEnabledSetting());
    options.resetPromptAutoRuntime();
    options.superCtrl.addLog(
      `AUTO PROMPT CONTROL: ${options.getPromptAutoEnabledSetting() ? `ON (${options.getPromptAutoCurveMode()})` : 'OFF'}`
    );

    const pendingMixContext = options.getPendingMixContext();
    if (pendingMixContext) {
      const { sourceId, targetId } = pendingMixContext;

      options.threeViz.randomizeColor(targetId as 'A' | 'B');

      if (import.meta.env.DEV) console.log(`[SafetyNet] Force Ensuring Source Deck ${sourceId} Playing`);
      window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deckId: sourceId, playing: true } }));

      if (import.meta.env.DEV) console.log(`[SafetyNet] Force Ensuring Target Deck ${targetId} Playing`);
      window.dispatchEvent(new CustomEvent('deck-play-toggle', { detail: { deckId: targetId, playing: true } }));

      const pendingIntegratedPlan = options.getPendingIntegratedPlan();
      const planBpm =
        Number(pendingIntegratedPlan?.meta?.target_bpm) ||
        Number(pendingIntegratedPlan?.audio_plan?.meta?.target_bpm) ||
        Number(options.engine.masterBpm) ||
        120;
      options.lockMixRhythm(sourceId as 'A' | 'B', targetId as 'A' | 'B', planBpm, 'START');
    }

    window.setTimeout(() => {
      options.setLastMixStartPerfMs(performance.now());
      options.startVisualTransitions();
      options.getAutoEngine().start();
    }, 200);
  };

  const onMixAbort = () => {
    options.stopAutomation();
    options.stopVisualTransitions();
    options.setPromptAutoControlActive(false);
    options.clearFreeModeRuntime();
    options.setPendingIntegratedPlan(null);
    options.setLastMixStartPerfMs(0);
    options.superCtrl.mixState = 'IDLE';
    options.superCtrl.addLog('MIX ABORTED.');
  };

  const onMixCancel = () => {
    options.stopVisualTransitions();
    options.setPromptAutoControlActive(false);
    options.clearFreeModeRuntime();
    options.setPendingIntegratedPlan(null);
    options.setLastMixStartPerfMs(0);
    options.superCtrl.mixState = 'IDLE';
    options.setPendingMixContext(null);
  };

  options.superCtrl.addEventListener('ai-mix-start', onMixStart);
  options.superCtrl.addEventListener('ai-mix-abort', onMixAbort);
  options.superCtrl.addEventListener('ai-mix-cancel', onMixCancel);

  return {
    dispose: () => {
      options.superCtrl.removeEventListener('ai-mix-start', onMixStart);
      options.superCtrl.removeEventListener('ai-mix-abort', onMixAbort);
      options.superCtrl.removeEventListener('ai-mix-cancel', onMixCancel);
    }
  };
};
