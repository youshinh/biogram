import type {
  IntegratedMixPlan,
  VisualTransitionType
} from '../types/integrated-ai-mix';
import { VISUAL_MODES } from '../ui/visuals/modes';

const FORBIDDEN_AUDIO_TARGETS = new Set<string>([
  'DECK_A_SLICER_ON',
  'DECK_B_SLICER_ON',
  'DECK_A_SLICER_RATE',
  'DECK_B_SLICER_RATE',
  'TRIM',
  'DRIVE',
  'DECK_A_TRIM',
  'DECK_B_TRIM',
  'DECK_A_DRIVE',
  'DECK_B_DRIVE',
  'TRIM_A',
  'TRIM_B',
  'DRIVE_A',
  'DRIVE_B'
]);

const ALLOWED_TRANSITIONS = new Set<VisualTransitionType>([
  'fade_in',
  'fade_out',
  'crossfade',
  'soft_overlay',
  'sweep_line_smear'
]);

export function validateIntegratedMixPlan(plan: IntegratedMixPlan): string[] {
  const errors: string[] = [];

  if (plan.meta.version !== '3.0') errors.push('meta.version must be 3.0');
  if (!['single', 'free'].includes(plan.meta.session_mode)) {
    errors.push('meta.session_mode is invalid');
  }
  if (!['A->B', 'B->A'].includes(plan.meta.direction)) {
    errors.push('meta.direction is invalid');
  }
  if (plan.meta.target_bpm < 60 || plan.meta.target_bpm > 200) {
    errors.push('meta.target_bpm out of range');
  }
  if (plan.meta.total_bars < 8 || plan.meta.total_bars > 512) {
    errors.push('meta.total_bars out of range');
  }

  if (plan.meta.session_mode === 'free') {
    if (!plan.meta.pattern || !['PINGPONG', 'ABBA'].includes(plan.meta.pattern)) {
      errors.push('meta.pattern required for free mode');
    }
    if (
      plan.meta.max_runtime_min === undefined ||
      plan.meta.max_runtime_min < 1 ||
      plan.meta.max_runtime_min > 60
    ) {
      errors.push('meta.max_runtime_min out of range for free mode');
    }
    if (plan.post_actions.next_trigger_sec < 240 || plan.post_actions.next_trigger_sec > 300) {
      errors.push('post_actions.next_trigger_sec out of range for free mode');
    }
  }

  if (!plan.audio_plan?.tracks?.length) errors.push('audio_plan.tracks is empty');
  if (!plan.visual_plan?.tracks?.length) errors.push('visual_plan.tracks is empty');

  for (const track of plan.audio_plan.tracks ?? []) {
    if (FORBIDDEN_AUDIO_TARGETS.has(track.target_id as string)) {
      errors.push(`forbidden audio target: ${track.target_id}`);
    }
    if (!track.points?.length) errors.push(`audio track points missing: ${track.target_id}`);
  }

  for (const track of plan.visual_plan.tracks ?? []) {
    if (!track.points?.length) {
      errors.push(`visual track points missing: ${track.target_id}`);
      continue;
    }

    if (track.target_id === 'VISUAL_MODE') {
      for (const point of track.points) {
        if (typeof point.value !== 'string' || !VISUAL_MODES.includes(point.value as any)) {
          errors.push(`invalid VISUAL_MODE value: ${String(point.value)}`);
        }
      }
    }

    if (track.target_id === 'VISUAL_TRANSITION_TYPE') {
      for (const point of track.points) {
        if (typeof point.value !== 'string' || !ALLOWED_TRANSITIONS.has(point.value as VisualTransitionType)) {
          errors.push(`invalid VISUAL_TRANSITION_TYPE value: ${String(point.value)}`);
        }
      }
    }

    if (track.target_id === 'VISUAL_INTENSITY') {
      for (const point of track.points) {
        if (typeof point.value !== 'number' || point.value < 0 || point.value > 1) {
          errors.push(`VISUAL_INTENSITY out of range: ${String(point.value)}`);
        }
      }
    }
  }

  const ctx = plan.prompt_context_ref;
  if (!ctx?.source_prompt?.trim()) errors.push('prompt_context_ref.source_prompt is empty');
  if (!ctx?.target_prompt?.trim()) errors.push('prompt_context_ref.target_prompt is empty');
  if (ctx?.source_deck === ctx?.target_deck) errors.push('prompt_context_ref source/target deck must differ');
  if (!ctx?.context_hash || ctx.context_hash.length < 8) {
    errors.push('prompt_context_ref.context_hash too short');
  }

  return errors;
}
