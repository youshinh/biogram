import type { AudioEngine } from '../audio/engine';
import type { MidiManager } from '../midi/midi-manager';

declare global {
  interface Window {
    engine?: AudioEngine;
    midiManager?: MidiManager;
  }
}

export {};
