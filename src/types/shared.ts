export const SAB_SIZE_BYTES = 64 * 1024 * 1024; // 64MB buffer (approx 90s stereo total)
export const HEADER_SIZE_BYTES = 128; // Reserved header space

// Byte Offsets for the SharedArrayBuffer Header
export const OFFSETS = {
  WRITE_POINTER_A: 0,   // Int32: Deck A Write Head
  WRITE_POINTER_B: 4,   // Int32: Deck B Write Head
  READ_POINTER_A: 8,    // Int32: Deck A Play Head
  READ_POINTER_B: 12,   // Int32: Deck B Play Head
  
  // Future/Global
  STATE_FLAGS: 16,      // Int32: Bitmask
  TAPE_VELOCITY: 20,    // Float32: Global Physics (Subject to change to per-deck)
  BPM: 24,              // Float32: Global BPM
  
  // Visual Pointers (Read-only for UI)
  GHOST_POINTER: 28,    // Int32: Ghost Play Head Position
  SLICER_ACTIVE: 32,    // Int32: Slicer Active State (0 or 1) for Viz
} as const;

// Helper to access SAB views
export type AudioSharedData = {
  headerView: Int32Array;
  floatView: Float32Array;
  audioData: Float32Array; // The ring buffer part
};

// MessagePort Protocol
export type WorkletMessage = 
  | { type: 'SLICE_TRIGGER'; density: number }
  | { type: 'SLAM_ENGAGE'; duration: number }
  | { type: 'CONFIG_UPDATE'; param: string; value: number };

export type MainThreadMessage =
  | { type: 'TRANSIENT_DETECTED'; amplitude: number }
  | { type: 'BUFFER_UNDERRUN' }
  | { type: 'INIT_COMPLETE' };
