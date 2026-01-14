declare module '*?worker&url' {
  const content: string;
  export default content;
}

import { AudioEngine } from '../audio/engine';
import { MidiManager } from '../midi/midi-manager';

declare global {
  interface Window {
    engine: AudioEngine;
    midiManager: MidiManager;
  }
}
