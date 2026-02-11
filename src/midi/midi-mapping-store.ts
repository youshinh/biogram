import type { ParameterId } from '../control/parameter-registry';

export type MidiMessageType = 'cc' | 'note';
export type MidiMappingMode = 'absolute' | 'toggle' | 'trigger';
export type MidiMappingCurve = 'linear' | 'exp' | 'log';

export type MidiMessage = {
  inputId: string;
  channel: number;
  type: MidiMessageType;
  number: number;
  value: number;
};

export type MidiMapping = {
  id: string;
  deviceId: string | '*';
  channel: number | '*';
  messageType: MidiMessageType;
  number: number;
  parameterId: ParameterId;
  mode: MidiMappingMode;
  min?: number;
  max?: number;
  curve?: MidiMappingCurve;
};

const STORAGE_KEY = 'biogram.midi.mappings.v1';

const DEFAULT_MAPPINGS: MidiMapping[] = [
  { id: 'cc_crossfader', deviceId: '*', channel: '*', messageType: 'cc', number: 1, parameterId: 'CROSSFADER', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_trim_a', deviceId: '*', channel: '*', messageType: 'cc', number: 2, parameterId: 'TRIM_A', mode: 'absolute', min: 0, max: 2 },
  { id: 'cc_trim_b', deviceId: '*', channel: '*', messageType: 'cc', number: 3, parameterId: 'TRIM_B', mode: 'absolute', min: 0, max: 2 },
  { id: 'cc_eq_a_low', deviceId: '*', channel: '*', messageType: 'cc', number: 4, parameterId: 'EQ_A_LOW', mode: 'absolute', min: 0, max: 1.5 },
  { id: 'cc_eq_a_mid', deviceId: '*', channel: '*', messageType: 'cc', number: 5, parameterId: 'EQ_A_MID', mode: 'absolute', min: 0, max: 1.5 },
  { id: 'cc_eq_a_hi', deviceId: '*', channel: '*', messageType: 'cc', number: 6, parameterId: 'EQ_A_HI', mode: 'absolute', min: 0, max: 1.5 },
  { id: 'cc_eq_b_low', deviceId: '*', channel: '*', messageType: 'cc', number: 7, parameterId: 'EQ_B_LOW', mode: 'absolute', min: 0, max: 1.5 },
  { id: 'cc_eq_b_mid', deviceId: '*', channel: '*', messageType: 'cc', number: 8, parameterId: 'EQ_B_MID', mode: 'absolute', min: 0, max: 1.5 },
  { id: 'cc_eq_b_hi', deviceId: '*', channel: '*', messageType: 'cc', number: 9, parameterId: 'EQ_B_HI', mode: 'absolute', min: 0, max: 1.5 },

  { id: 'cc_dub', deviceId: '*', channel: '*', messageType: 'cc', number: 10, parameterId: 'DUB', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_cloud_mix', deviceId: '*', channel: '*', messageType: 'cc', number: 11, parameterId: 'CLOUD_MIX', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_gate_thresh', deviceId: '*', channel: '*', messageType: 'cc', number: 12, parameterId: 'GATE_THRESH', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_filter_q', deviceId: '*', channel: '*', messageType: 'cc', number: 13, parameterId: 'FILTER_Q', mode: 'absolute', min: 0, max: 1 },

  { id: 'cc_visual_intensity', deviceId: '*', channel: '*', messageType: 'cc', number: 14, parameterId: 'VISUAL_INTENSITY', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_visual_blend', deviceId: '*', channel: '*', messageType: 'cc', number: 15, parameterId: 'VISUAL_BLEND', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_visual_overlay', deviceId: '*', channel: '*', messageType: 'cc', number: 16, parameterId: 'VISUAL_OVERLAY_ALPHA', mode: 'absolute', min: 0, max: 1 },
  { id: 'cc_transition_fade', deviceId: '*', channel: '*', messageType: 'cc', number: 17, parameterId: 'VISUAL_FADE_DURATION', mode: 'absolute', min: 0.3, max: 3.0 },

  { id: 'note_play_a', deviceId: '*', channel: '*', messageType: 'note', number: 36, parameterId: 'DECK_A_TOGGLE_PLAY', mode: 'trigger' },
  { id: 'note_sync_a', deviceId: '*', channel: '*', messageType: 'note', number: 37, parameterId: 'DECK_A_TOGGLE_SYNC', mode: 'trigger' },
  { id: 'note_load_a', deviceId: '*', channel: '*', messageType: 'note', number: 38, parameterId: 'DECK_A_LOAD_RANDOM', mode: 'trigger' },
  { id: 'note_play_b', deviceId: '*', channel: '*', messageType: 'note', number: 40, parameterId: 'DECK_B_TOGGLE_PLAY', mode: 'trigger' },
  { id: 'note_sync_b', deviceId: '*', channel: '*', messageType: 'note', number: 41, parameterId: 'DECK_B_TOGGLE_SYNC', mode: 'trigger' },
  { id: 'note_load_b', deviceId: '*', channel: '*', messageType: 'note', number: 42, parameterId: 'DECK_B_LOAD_RANDOM', mode: 'trigger' },

  { id: 'note_mode_organic', deviceId: '*', channel: '*', messageType: 'note', number: 55, parameterId: 'VISUAL_MODE_ORGANIC', mode: 'trigger' },
  { id: 'note_mode_wireframe', deviceId: '*', channel: '*', messageType: 'note', number: 56, parameterId: 'VISUAL_MODE_WIREFRAME', mode: 'trigger' },
  { id: 'note_mode_gnosis', deviceId: '*', channel: '*', messageType: 'note', number: 57, parameterId: 'VISUAL_MODE_GNOSIS', mode: 'trigger' },
  { id: 'note_transition_crossfade', deviceId: '*', channel: '*', messageType: 'note', number: 58, parameterId: 'VISUAL_TRANSITION_CROSSFADE', mode: 'trigger' },
  { id: 'note_transition_sweep', deviceId: '*', channel: '*', messageType: 'note', number: 59, parameterId: 'VISUAL_TRANSITION_SWEEP', mode: 'trigger' }
];

export class MidiMappingStore {
  private mappings: MidiMapping[] = [];

  constructor() {
    this.mappings = this.load();
  }

  getAll(): MidiMapping[] {
    return [...this.mappings];
  }

  setAll(mappings: MidiMapping[]): void {
    this.mappings = [...mappings];
    this.persist();
  }

  resetToDefault(): void {
    this.mappings = [...DEFAULT_MAPPINGS];
    this.persist();
  }

  findMatches(message: MidiMessage): MidiMapping[] {
    return this.mappings.filter((mapping) => {
      const deviceMatch = mapping.deviceId === '*' || mapping.deviceId === message.inputId;
      const channelMatch = mapping.channel === '*' || mapping.channel === message.channel;
      return deviceMatch && channelMatch && mapping.messageType === message.type && mapping.number === message.number;
    });
  }

  private load(): MidiMapping[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [...DEFAULT_MAPPINGS];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return [...DEFAULT_MAPPINGS];
      return parsed as MidiMapping[];
    } catch {
      return [...DEFAULT_MAPPINGS];
    }
  }

  private persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.mappings));
    } catch {
      // Ignore storage quota or privacy mode failures.
    }
  }
}
