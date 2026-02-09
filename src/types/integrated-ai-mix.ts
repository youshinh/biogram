import type { AutomationScore } from './ai-mix';

export type SessionMode = 'single' | 'free';
export type MixDirection = 'A->B' | 'B->A';
export type MixPattern = 'PINGPONG' | 'ABBA';
export type PlanModel =
  | 'gemini-flash-lite-latest'
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview'
  | 'template';
export type VisualTransitionType =
  | 'fade_in'
  | 'fade_out'
  | 'crossfade'
  | 'soft_overlay'
  | 'sweep_line_smear';

export type PromptContextRef = {
  source_deck: 'A' | 'B';
  target_deck: 'A' | 'B';
  source_prompt: string;
  target_prompt: string;
  source_is_playing: boolean;
  target_is_playing: boolean;
  context_hash: string;
};

export type VisualPlanPoint = {
  time: number;
  value: number | string;
  curve: 'STEP' | 'LINEAR' | 'EXP' | 'LOG' | 'SIGMOID' | 'HOLD';
};

export type VisualPlanTrack = {
  target_id:
    | 'VISUAL_MODE'
    | 'VISUAL_BLEND'
    | 'VISUAL_OVERLAY_ALPHA'
    | 'VISUAL_TRANSITION_TYPE'
    | 'VISUAL_INTENSITY';
  points: VisualPlanPoint[];
};

export type VisualPlan = {
  tracks: VisualPlanTrack[];
};

export type IntegratedMixPlan = {
  meta: {
    version: '3.0';
    session_mode: SessionMode;
    direction: MixDirection;
    target_bpm: number;
    total_bars: number;
    pattern?: MixPattern;
    max_runtime_min?: number;
    description?: string;
    plan_model?: PlanModel;
    plan_fallback_reason?: string;
  };
  audio_plan: AutomationScore;
  visual_plan: VisualPlan;
  post_actions: {
    regen_stopped_deck: boolean;
    next_trigger_sec: number;
    safety_reset: {
      crossfader_to_target: boolean;
      reset_eq_to_default: boolean;
      disable_fx_tail: boolean;
    };
  };
  prompt_context_ref: PromptContextRef;
};

export type PromptContextInput = {
  sourcePrompt: string;
  targetPrompt: string;
  sourceDeck: 'A' | 'B';
  targetDeck: 'A' | 'B';
  sourcePlaying: boolean;
  targetPlaying: boolean;
};
