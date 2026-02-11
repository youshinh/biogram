declare module '*?worker&url' {
  const content: string;
  export default content;
}

// Vite environment types
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly MODE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

import { AudioEngine } from '../audio/engine';
import { MidiManager } from '../midi/midi-manager';
import { ControlRouter } from '../control/control-router';

declare global {
  interface Window {
    engine: AudioEngine;
    midiManager: MidiManager;
    controlRouter: ControlRouter;
  }
}
