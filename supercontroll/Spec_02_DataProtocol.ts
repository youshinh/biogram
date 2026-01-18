/**
 * AI Mix 機能仕様書 Part 2: データプロトコル定義
 * Gemini Flash Lite が出力すべきJSONスキーマと定数定義
 */

// ■ ルート・オブジェクト
export type AutomationScore = {
  meta: {
    version: "2.0";
    type: "DEEP_SPECTRAL_MIX";
    target_bpm: number;
    total_bars: number; // シーケンスの全長 (例: 64)
    description?: string; // AIによるミックス意図の解説 (デバッグ/UI表示用)
  };

  // オートメーション・トラックのリスト
  tracks: AutomationTrack[];

  // Phase 4: ミックス完了後の不可視リセットアクション
  post_mix_reset: {
    target_deck: "DECK_A" | "DECK_B"; // 役割を終えたデッキ
    actions: ResetAction[];
  };
};

export type AutomationTrack = {
  target_id: ParameterID; // 操作対象ID
  points: Keyframe[];     // 時系列データ
};

export type Keyframe = {
  time: number; // 小節数 (0.0 が開始点, 浮動小数点)
  value: number | boolean; // 設定値
  
  // ポイント間の補間方法 (前のポイントからこのポイントへの変化)
  curve: CurveType;
  
  // WOBBLE時の揺れ幅強度 (0.0 - 1.0, Default: 0.0)
  // 値が大きいほど、目標値に向かう途中で大きくふらつく
  wobble_amount?: number; 
};

export type ResetAction = {
  target: ParameterID;
  value: number | boolean;
  wait_bars: number; // ミックス終了後、何小節待ってからリセットするか
};

// ■ 補間タイプ定義 (エンジンの挙動決定)
export type CurveType = 
  | "STEP"      // 階段状: このポイントの瞬間に値が変わる (Slicer, Mute等)
  | "LINEAR"    // 直線: 機械的な変化
  | "EXP"       // 指数: 急激な立ち上がり/立ち下がり (Filter, Volume等)
  | "LOG"       // 対数: 緩やかな変化
  | "SIGMOID"   // S字: 中間が滑らかで、始点と終点が緩やか (Fader操作の模倣に最適)
  | "WOBBLE"    // 揺らぎ: 目標値に向かって不規則に振動しながら進む (人間味の付与)
  | "HOLD"      // 値を維持 (STEPと同義だが明示用)

// ■ パラメータID定義 (DSP/UIと紐づくID)
export type ParameterID = 
  // --- Mixer ---
  | "CROSSFADER"          // -1.0(A) ~ 1.0(B)
  | "DECK_A_VOL"          // 0.0 ~ 1.0 (Channel Fader)
  | "DECK_B_VOL"
  | "DECK_A_EQ_HI"        // 0.0 ~ 1.5 (1.0=Flat)
  | "DECK_A_EQ_MID"
  | "DECK_A_EQ_LOW"
  | "DECK_B_EQ_HI"
  | "DECK_B_EQ_MID"
  | "DECK_B_EQ_LOW"
  
  // --- Filter (XY Pad) ---
  | "DECK_A_FILTER_CUTOFF" // 0.0(Low) ~ 0.5(Thru) ~ 1.0(High) ※バイポーラ想定
  | "DECK_A_FILTER_RES"    // 0.0 ~ 1.0
  | "DECK_B_FILTER_CUTOFF"
  | "DECK_B_FILTER_RES"

  // --- FX Rack (Spatial/Glitch) ---
  | "DECK_A_ECHO_SEND"     // 0.0 ~ 1.0
  | "DECK_A_ECHO_FEEDBACK" // 0.0 ~ 1.2 (1.0超えで発振)
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
  | "MASTER_COMP_THRESH";  // 0.0 ~ 1.0