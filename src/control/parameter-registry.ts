export type ParameterDomain = 'audio' | 'visual' | 'transition' | 'transport';
export type ParameterValueType = 'number' | 'boolean' | 'enum' | 'trigger';

export type ParameterId =
  | 'CROSSFADER'
  | 'TRIM_A'
  | 'TRIM_B'
  | 'EQ_A_LOW'
  | 'EQ_A_MID'
  | 'EQ_A_HI'
  | 'EQ_B_LOW'
  | 'EQ_B_MID'
  | 'EQ_B_HI'
  | 'FILTER_ACTIVE'
  | 'HPF'
  | 'LPF'
  | 'FILTER_Q'
  | 'FILTER_DRIVE'
  | 'DUB'
  | 'TAPE_ACTIVE'
  | 'REVERB_ACTIVE'
  | 'BLOOM_WET'
  | 'CLOUD_ACTIVE'
  | 'CLOUD_MIX'
  | 'CLOUD_DENSITY'
  | 'DECIMATOR_ACTIVE'
  | 'BITS'
  | 'SPECTRAL_GATE_ACTIVE'
  | 'GATE_THRESH'
  | 'GATE_RELEASE'
  | 'VISUAL_INTENSITY'
  | 'VISUAL_BLEND'
  | 'VISUAL_OVERLAY_ALPHA'
  | 'VISUAL_MODE'
  | 'VISUAL_TRANSITION_TYPE'
  | 'VISUAL_FADE_DURATION'
  | 'DECK_A_TOGGLE_PLAY'
  | 'DECK_B_TOGGLE_PLAY'
  | 'DECK_A_TOGGLE_SYNC'
  | 'DECK_B_TOGGLE_SYNC'
  | 'DECK_A_LOAD_RANDOM'
  | 'DECK_B_LOAD_RANDOM'
  | 'VISUAL_MODE_ORGANIC'
  | 'VISUAL_MODE_WIREFRAME'
  | 'VISUAL_MODE_GNOSIS'
  | 'VISUAL_TRANSITION_CROSSFADE'
  | 'VISUAL_TRANSITION_SWEEP';

export type EnumValue = string;

export type ParameterDefinition = {
  id: ParameterId;
  label: string;
  domain: ParameterDomain;
  valueType: ParameterValueType;
  min?: number;
  max?: number;
  step?: number;
  enumValues?: readonly EnumValue[];
};

export const VISUAL_MODES = ['organic', 'wireframe', 'gnosis', 'halid', 'glaze', 'rings', 'waves', 'monochrome'] as const;
export const VISUAL_TRANSITIONS = ['crossfade', 'sweep_line_smear', 'soft_overlay', 'fade_in', 'fade_out'] as const;

export const PARAMETER_REGISTRY: Record<ParameterId, ParameterDefinition> = {
  CROSSFADER: { id: 'CROSSFADER', label: 'Crossfader', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  TRIM_A: { id: 'TRIM_A', label: 'Trim A', domain: 'audio', valueType: 'number', min: 0, max: 2, step: 0.01 },
  TRIM_B: { id: 'TRIM_B', label: 'Trim B', domain: 'audio', valueType: 'number', min: 0, max: 2, step: 0.01 },
  EQ_A_LOW: { id: 'EQ_A_LOW', label: 'EQ A Low', domain: 'audio', valueType: 'number', min: 0, max: 1.5, step: 0.01 },
  EQ_A_MID: { id: 'EQ_A_MID', label: 'EQ A Mid', domain: 'audio', valueType: 'number', min: 0, max: 1.5, step: 0.01 },
  EQ_A_HI: { id: 'EQ_A_HI', label: 'EQ A Hi', domain: 'audio', valueType: 'number', min: 0, max: 1.5, step: 0.01 },
  EQ_B_LOW: { id: 'EQ_B_LOW', label: 'EQ B Low', domain: 'audio', valueType: 'number', min: 0, max: 1.5, step: 0.01 },
  EQ_B_MID: { id: 'EQ_B_MID', label: 'EQ B Mid', domain: 'audio', valueType: 'number', min: 0, max: 1.5, step: 0.01 },
  EQ_B_HI: { id: 'EQ_B_HI', label: 'EQ B Hi', domain: 'audio', valueType: 'number', min: 0, max: 1.5, step: 0.01 },
  FILTER_ACTIVE: { id: 'FILTER_ACTIVE', label: 'Filter Active', domain: 'audio', valueType: 'boolean' },
  HPF: { id: 'HPF', label: 'HPF', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  LPF: { id: 'LPF', label: 'LPF', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  FILTER_Q: { id: 'FILTER_Q', label: 'Filter Q', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  FILTER_DRIVE: { id: 'FILTER_DRIVE', label: 'Filter Drive', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  DUB: { id: 'DUB', label: 'Dub Send', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  TAPE_ACTIVE: { id: 'TAPE_ACTIVE', label: 'Tape Active', domain: 'audio', valueType: 'boolean' },
  REVERB_ACTIVE: { id: 'REVERB_ACTIVE', label: 'Reverb Active', domain: 'audio', valueType: 'boolean' },
  BLOOM_WET: { id: 'BLOOM_WET', label: 'Bloom Wet', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  CLOUD_ACTIVE: { id: 'CLOUD_ACTIVE', label: 'Cloud Active', domain: 'audio', valueType: 'boolean' },
  CLOUD_MIX: { id: 'CLOUD_MIX', label: 'Cloud Mix', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  CLOUD_DENSITY: { id: 'CLOUD_DENSITY', label: 'Cloud Density', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  DECIMATOR_ACTIVE: { id: 'DECIMATOR_ACTIVE', label: 'Decimator Active', domain: 'audio', valueType: 'boolean' },
  BITS: { id: 'BITS', label: 'Bit Depth', domain: 'audio', valueType: 'number', min: 2, max: 16, step: 1 },
  SPECTRAL_GATE_ACTIVE: { id: 'SPECTRAL_GATE_ACTIVE', label: 'Spectral Gate Active', domain: 'audio', valueType: 'boolean' },
  GATE_THRESH: { id: 'GATE_THRESH', label: 'Gate Threshold', domain: 'audio', valueType: 'number', min: 0, max: 1, step: 0.01 },
  GATE_RELEASE: { id: 'GATE_RELEASE', label: 'Gate Release', domain: 'audio', valueType: 'number', min: 0.9, max: 0.9999, step: 0.0001 },

  VISUAL_INTENSITY: { id: 'VISUAL_INTENSITY', label: 'Visual Intensity', domain: 'visual', valueType: 'number', min: 0, max: 1, step: 0.01 },
  VISUAL_BLEND: { id: 'VISUAL_BLEND', label: 'Visual Blend', domain: 'visual', valueType: 'number', min: 0, max: 1, step: 0.01 },
  VISUAL_OVERLAY_ALPHA: { id: 'VISUAL_OVERLAY_ALPHA', label: 'Visual Overlay Alpha', domain: 'visual', valueType: 'number', min: 0, max: 1, step: 0.01 },
  VISUAL_MODE: { id: 'VISUAL_MODE', label: 'Visual Mode', domain: 'visual', valueType: 'enum', enumValues: VISUAL_MODES },

  VISUAL_TRANSITION_TYPE: {
    id: 'VISUAL_TRANSITION_TYPE',
    label: 'Visual Transition Type',
    domain: 'transition',
    valueType: 'enum',
    enumValues: VISUAL_TRANSITIONS
  },
  VISUAL_FADE_DURATION: {
    id: 'VISUAL_FADE_DURATION',
    label: 'Visual Fade Duration',
    domain: 'transition',
    valueType: 'number',
    min: 0.3,
    max: 3.0,
    step: 0.01
  },

  DECK_A_TOGGLE_PLAY: { id: 'DECK_A_TOGGLE_PLAY', label: 'Deck A Play Toggle', domain: 'transport', valueType: 'trigger' },
  DECK_B_TOGGLE_PLAY: { id: 'DECK_B_TOGGLE_PLAY', label: 'Deck B Play Toggle', domain: 'transport', valueType: 'trigger' },
  DECK_A_TOGGLE_SYNC: { id: 'DECK_A_TOGGLE_SYNC', label: 'Deck A Sync Toggle', domain: 'transport', valueType: 'trigger' },
  DECK_B_TOGGLE_SYNC: { id: 'DECK_B_TOGGLE_SYNC', label: 'Deck B Sync Toggle', domain: 'transport', valueType: 'trigger' },
  DECK_A_LOAD_RANDOM: { id: 'DECK_A_LOAD_RANDOM', label: 'Deck A Load Random', domain: 'transport', valueType: 'trigger' },
  DECK_B_LOAD_RANDOM: { id: 'DECK_B_LOAD_RANDOM', label: 'Deck B Load Random', domain: 'transport', valueType: 'trigger' },
  VISUAL_MODE_ORGANIC: { id: 'VISUAL_MODE_ORGANIC', label: 'Visual Mode Organic', domain: 'visual', valueType: 'trigger' },
  VISUAL_MODE_WIREFRAME: { id: 'VISUAL_MODE_WIREFRAME', label: 'Visual Mode Wireframe', domain: 'visual', valueType: 'trigger' },
  VISUAL_MODE_GNOSIS: { id: 'VISUAL_MODE_GNOSIS', label: 'Visual Mode Gnosis', domain: 'visual', valueType: 'trigger' },
  VISUAL_TRANSITION_CROSSFADE: { id: 'VISUAL_TRANSITION_CROSSFADE', label: 'Transition Crossfade', domain: 'transition', valueType: 'trigger' },
  VISUAL_TRANSITION_SWEEP: { id: 'VISUAL_TRANSITION_SWEEP', label: 'Transition Sweep', domain: 'transition', valueType: 'trigger' }
};

export function getParameterDefinition(id: string): ParameterDefinition | null {
  return (PARAMETER_REGISTRY as Record<string, ParameterDefinition | undefined>)[id] ?? null;
}

export function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
