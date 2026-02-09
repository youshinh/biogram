import type { VisualPlan, VisualPlanPoint, VisualPlanTrack } from '../types/integrated-ai-mix';
import type { VisualMode } from '../ui/visuals/modes';

type VisualApplyFn = (targetId: VisualPlanTrack['target_id'], value: number | string) => void;

export class VisualTransitionEngine {
  private plan: VisualPlan | null = null;
  private isRunning = false;
  private currentBar = 0;
  private appliedCache = new Map<string, number | string>();
  private apply: VisualApplyFn;

  constructor(applyFn: VisualApplyFn) {
    this.apply = applyFn;
  }

  loadPlan(plan: VisualPlan | null) {
    this.plan = plan;
    this.appliedCache.clear();
  }

  start() {
    this.isRunning = true;
    this.currentBar = 0;
    this.appliedCache.clear();
  }

  stop() {
    this.isRunning = false;
  }

  update(bar: number) {
    if (!this.isRunning || !this.plan) return;
    this.currentBar = bar;

    const sortedTracks = [...this.plan.tracks].sort((a, b) => {
      const pa = this.getTrackPriority(a.target_id);
      const pb = this.getTrackPriority(b.target_id);
      return pa - pb;
    });

    for (const track of sortedTracks) {
      const value = this.evaluateTrack(track, this.currentBar);
      if (value === null || value === undefined) continue;
      const cacheKey = track.target_id;
      const prev = this.appliedCache.get(cacheKey);
      if (prev !== undefined) {
        if (typeof prev === 'number' && typeof value === 'number' && Math.abs(prev - value) < 0.01) {
          continue;
        }
        if (prev === value) continue;
      }
      this.appliedCache.set(cacheKey, value);
      this.apply(track.target_id, value);
    }
  }

  private getTrackPriority(targetId: VisualPlanTrack['target_id']): number {
    if (targetId === 'VISUAL_TRANSITION_TYPE') return 0;
    if (targetId === 'VISUAL_MODE') return 1;
    return 2;
  }

  private evaluateTrack(track: VisualPlanTrack, bar: number): number | string | null {
    const points = track.points;
    if (!points.length) return null;
    if (bar <= points[0].time) return points[0].value;
    if (bar >= points[points.length - 1].time) return points[points.length - 1].value;

    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      if (bar >= p1.time && bar < p2.time) {
        if (typeof p1.value !== 'number' || typeof p2.value !== 'number') {
          return bar < p2.time ? p1.value : p2.value;
        }
        const t = (bar - p1.time) / Math.max(0.0001, p2.time - p1.time);
        return this.interpolate(p1, p2, t);
      }
    }
    return points[0].value;
  }

  private interpolate(p1: VisualPlanPoint, p2: VisualPlanPoint, t: number): number {
    const v1 = p1.value as number;
    const v2 = p2.value as number;
    let p = t;
    switch (p2.curve) {
      case 'STEP':
      case 'HOLD':
        return v1;
      case 'EXP':
        p = t * t;
        break;
      case 'LOG':
        p = Math.sqrt(t);
        break;
      case 'SIGMOID': {
        const k = 10;
        const sig = 1 / (1 + Math.exp(-k * (t - 0.5)));
        const min = 1 / (1 + Math.exp(k * 0.5));
        const max = 1 / (1 + Math.exp(-k * 0.5));
        p = (sig - min) / (max - min);
        break;
      }
      case 'LINEAR':
      default:
        break;
    }
    return v1 + (v2 - v1) * p;
  }
}

export function mapVisualTargetToEngine(
  targetId: VisualPlanTrack['target_id'],
  value: number | string,
  ops: {
    setMode: (mode: VisualMode) => void;
    setTransitionType: (type: string) => void;
    sendParam: (id: string, val: number | string) => void;
  }
) {
  if (targetId === 'VISUAL_TRANSITION_TYPE' && typeof value === 'string') {
    ops.setTransitionType(value);
    return;
  }

  if (targetId === 'VISUAL_MODE' && typeof value === 'string') {
    ops.setMode(value as VisualMode);
    return;
  }

  // Keep keys explicit so renderer side can evolve without changing plan schema.
  ops.sendParam(targetId, value);
}
