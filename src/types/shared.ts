export const SAB_SIZE_BYTES = 12 * 1024 * 1024; // 12MB buffer (approx 2mins at 44.1k stereo float32)
export const HEADER_SIZE_BYTES = 128; // Reserved header space

// Byte Offsets for the SharedArrayBuffer Header
export const OFFSETS = {
  WRITE_POINTER: 0,    // Int32: Current write index (frames)
  READ_POINTER_A: 4,   // Int32: Head A play index
  READ_POINTER_B: 8,   // Int32: Head B play index (Slice)
  READ_POINTER_C: 12,  // Int32: Head C play index (Cloud)
  STATE_FLAGS: 16,     // Int32: Bitmask
  TAPE_VELOCITY: 20,   // Float32: Current physics velocity
  BPM: 24,             // Float32: Global BPM
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
