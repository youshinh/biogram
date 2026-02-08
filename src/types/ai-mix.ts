
// Based on Spec_02_DataProtocol.ts

export type AutomationScore = {
  meta: {
    version: "2.0";
    type: "DEEP_SPECTRAL_MIX";
    target_bpm: number;
    total_bars: number; // Sequence length (e.g. 64)
    description?: string; // Debug/UI description
  };

  // List of automation tracks
  tracks: AutomationTrack[];

  // Phase 4: Post-mix invisible reset actions
  post_mix_reset: {
    target_deck: "DECK_A" | "DECK_B"; // The deck that finished playing
    actions: ResetAction[];
  };
};

export type AutomationTrack = {
  target_id: ParameterID;
  points: Keyframe[];
};

export type Keyframe = {
  time: number; // Bars (0.0 is start)
  value: number | boolean; 
  
  // Interpolation type from previous point to this point
  curve: CurveType;
  
  // WOBBLE intensity (0.0 - 1.0, Default: 0.0)
  wobble_amount?: number; 
};

export type ResetAction = {
  target: ParameterID;
  value: number | boolean;
  wait_bars: number; // How many bars to wait after mix end before resetting
};

// Interpolation Types
export type CurveType = 
  | "STEP"      // Instant change
  | "LINEAR"    // Linear
  | "EXP"       // Exponential (Filter, Volume)
  | "LOG"       // Logarithmic
  | "SIGMOID"   // S-Curve (Human touch)
  | "WOBBLE"    // Organic fluctuation
  | "HOLD";     // Maintain value

// Parameter IDs
export type ParameterID = 
  // --- Mixer ---
  | "CROSSFADER"          // -1.0(A) ~ 1.0(B)
  | "DECK_A_VOL"          // 0.0 ~ 1.0
  | "DECK_B_VOL"
  | "DECK_A_EQ_HI"        // 0.0 ~ 1.5 (1.0=Flat)
  | "DECK_A_EQ_MID"
  | "DECK_A_EQ_LOW"
  | "DECK_B_EQ_HI"
  | "DECK_B_EQ_MID"
  | "DECK_B_EQ_LOW"
  
  // --- Filter ---
  | "DECK_A_FILTER_CUTOFF" // 0.0(Low) ~ 0.5(Thru) ~ 1.0(High) - Bipolar
  | "DECK_A_FILTER_RES"    // 0.0 ~ 1.0
  | "DECK_B_FILTER_CUTOFF"
  | "DECK_B_FILTER_RES"

  // --- FX Rack (Spatial/Glitch) ---
  | "DECK_A_ECHO_SEND"     // 0.0 ~ 1.0
  | "DECK_A_ECHO_FEEDBACK" // 0.0 ~ 1.2
  | "DECK_A_REVERB_MIX"    // 0.0 ~ 1.0
  | "DECK_A_SLICER_ON"     // Boolean
  | "DECK_A_SLICER_RATE"   // 0.0 ~ 1.0
  | "DECK_B_ECHO_SEND"
  | "DECK_B_ECHO_FEEDBACK"
  | "DECK_B_REVERB_MIX"
  | "DECK_B_SLICER_ON"
  | "DECK_B_SLICER_RATE"

  // --- Master FX ---
  | "MASTER_SLAM_AMOUNT"   // 0.0 ~ 1.0
  | "MASTER_COMP_THRESH"   // 0.0 ~ 1.0

  // --- Transport (Triggers) ---
  | "DECK_A_PLAY"          // Boolean (True = Trigger Play)
  | "DECK_A_STOP"          // Boolean (True = Trigger Stop)
  | "DECK_B_PLAY"
  | "DECK_B_STOP";
