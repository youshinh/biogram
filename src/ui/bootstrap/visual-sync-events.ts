import type { AudioEngine } from '../../audio/engine';
import type { ThreeViz } from '../visuals/ThreeViz';

export function setupVisualSyncEvents(params: {
  engine: AudioEngine;
  threeViz: ThreeViz;
}) {
  const { engine, threeViz } = params;

  const handleParamChange = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const { id, val } = detail;
    threeViz.sendMessage(id, val);
  };

  const handleMixerChange = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const { id, val } = detail;
    threeViz.sendMessage(id, val);
  };

  const handleVisualScoreUpdate = (e: Event) => {
    const detail = (e as CustomEvent).detail || {};
    const { deck, score, startFrame, endFrame } = detail;
    const sampleRate = 48000.0;

    // Prefer producer-side timing (captured in MusicClient at chunk assembly time).
    // Fallback to local estimation if older events do not include frame info.
    let resolvedStartFrame: number;
    if (typeof startFrame === 'number' && Number.isFinite(startFrame)) {
      resolvedStartFrame = startFrame;
    } else if (typeof endFrame === 'number' && Number.isFinite(endFrame)) {
      const timeline = Array.isArray(score?.timeline) ? score.timeline : [];
      const chunkDurationSec = timeline.length > 0 ? Math.max(0, timeline[timeline.length - 1].time || 0) : 4.0;
      resolvedStartFrame = Math.max(0, endFrame - Math.floor(chunkDurationSec * sampleRate));
    } else {
      const localEndFrame = engine.getWritePointer();
      const timeline = Array.isArray(score?.timeline) ? score.timeline : [];
      const chunkDurationSec = timeline.length > 0 ? Math.max(0, timeline[timeline.length - 1].time || 0) : 4.0;
      resolvedStartFrame = Math.max(0, localEndFrame - Math.floor(chunkDurationSec * sampleRate));
    }

    const startTimeSec = resolvedStartFrame / sampleRate;
    threeViz.addVisualScore(deck, score, startTimeSec);
  };

  window.addEventListener('param-change', handleParamChange as EventListener);
  window.addEventListener('mixer-change', handleMixerChange as EventListener);
  window.addEventListener('visual-score-update', handleVisualScoreUpdate as EventListener);

  return {
    dispose: () => {
      window.removeEventListener('param-change', handleParamChange as EventListener);
      window.removeEventListener('mixer-change', handleMixerChange as EventListener);
      window.removeEventListener('visual-score-update', handleVisualScoreUpdate as EventListener);
    }
  };
}
