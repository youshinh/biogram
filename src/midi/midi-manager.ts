import { ControlRouter } from '../control/control-router';
import { getParameterDefinition, type ParameterId } from '../control/parameter-registry';
import { MidiMappingStore, type MidiMapping, type MidiMessage } from './midi-mapping-store';

export class MidiManager {
  private midi: WebMidi.MIDIAccess | null = null;
  private inputs: Map<string, WebMidi.MIDIInput> = new Map();
  private readonly router: ControlRouter;
  private readonly mappingStore = new MidiMappingStore();
  private toggleState = new Map<string, boolean>();

  constructor(router: ControlRouter) {
    this.router = router;
    void this.init();
  }

  getMappings(): MidiMapping[] {
    return this.mappingStore.getAll();
  }

  setMappings(mappings: MidiMapping[]): void {
    this.mappingStore.setAll(mappings);
  }

  resetMappings(): void {
    this.mappingStore.resetToDefault();
  }

  private async init() {
    if (!navigator.requestMIDIAccess) {
      console.warn('[MIDI] Web MIDI API not supported.');
      return;
    }

    try {
      this.midi = await navigator.requestMIDIAccess();
      console.log('[MIDI] Access granted');

      this.midi.inputs.forEach((input) => {
        this.addInput(input);
      });

      this.midi.onstatechange = (e: WebMidi.MIDIConnectionEvent) => {
        const port = e.port;
        if (port.type !== 'input') return;

        if (port.state === 'connected') {
          this.addInput(port as WebMidi.MIDIInput);
        } else if (port.state === 'disconnected') {
          this.removeInput(port.id);
        }
      };
    } catch (err) {
      console.error('[MIDI] Access denied or failed', err);
    }
  }

  private addInput(input: WebMidi.MIDIInput) {
    if (this.inputs.has(input.id)) return;

    console.log(`[MIDI] Input connected: ${input.name} (${input.manufacturer})`);
    this.inputs.set(input.id, input);
    input.onmidimessage = (e) => this.handleMessage(input.id, e);
  }

  private removeInput(id: string) {
    if (!this.inputs.has(id)) return;
    console.log(`[MIDI] Input disconnected: ${id}`);
    this.inputs.delete(id);
  }

  private handleMessage(inputId: string, e: WebMidi.MIDIMessageEvent) {
    const data = e.data;
    if (!data || data.length < 2) return;

    const status = data[0] & 0xf0;
    const channel = (data[0] & 0x0f) + 1;
    const number = data[1];
    const value = data[2] || 0;

    let messageType: MidiMessage['type'] | null = null;
    if (status === 0xb0) messageType = 'cc';
    if (status === 0x90 && value > 0) messageType = 'note';
    if (!messageType) return;

    const message: MidiMessage = {
      inputId,
      channel,
      type: messageType,
      number,
      value
    };

    const mappings = this.mappingStore.findMatches(message);
    if (!mappings.length) return;

    for (const mapping of mappings) {
      this.applyMapping(mapping, message);
    }
  }

  private applyMapping(mapping: MidiMapping, message: MidiMessage) {
    const def = getParameterDefinition(mapping.parameterId);
    if (!def) return;

    if (def.valueType === 'trigger' || mapping.mode === 'trigger') {
      this.router.applyParameter(mapping.parameterId as ParameterId, 1, 'midi');
      return;
    }

    if (def.valueType === 'boolean' || mapping.mode === 'toggle') {
      const toggleKey = `${mapping.id}:${message.inputId}`;
      let nextValue = false;

      if (mapping.mode === 'toggle') {
        nextValue = !this.toggleState.get(toggleKey);
        this.toggleState.set(toggleKey, nextValue);
      } else {
        nextValue = message.value > 63;
      }

      this.router.applyParameter(mapping.parameterId as ParameterId, nextValue ? 1 : 0, 'midi');
      return;
    }

    if (def.valueType === 'enum') {
      const values = def.enumValues || [];
      if (!values.length) return;
      if (message.type !== 'cc') return;
      const normalized = message.value / 127;
      const idx = Math.max(0, Math.min(values.length - 1, Math.round(normalized * (values.length - 1))));
      this.router.applyParameter(mapping.parameterId as ParameterId, values[idx], 'midi');
      return;
    }

    if (message.type !== 'cc') return;

    const min = mapping.min ?? def.min ?? 0;
    const max = mapping.max ?? def.max ?? 1;
    const normalized = this.applyCurve(message.value / 127, mapping.curve || 'linear');
    const mapped = min + (max - min) * normalized;

    this.router.applyParameter(mapping.parameterId as ParameterId, mapped, 'midi');
  }

  private applyCurve(normalized: number, curve: 'linear' | 'exp' | 'log'): number {
    const t = Math.max(0, Math.min(1, normalized));
    if (curve === 'exp') return t * t;
    if (curve === 'log') return Math.sqrt(t);
    return t;
  }
}
