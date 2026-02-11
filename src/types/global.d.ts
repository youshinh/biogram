import type { AudioEngine } from '../audio/engine';
import type { MidiManager } from '../midi/midi-manager';
import type { ControlRouter } from '../control/control-router';

declare global {
  interface Window {
    engine?: AudioEngine;
    midiManager?: MidiManager;
    controlRouter?: ControlRouter;
  }
}

export {};
