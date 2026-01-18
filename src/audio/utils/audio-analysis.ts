/**
 * Audio Analysis Utilities
 * 無音検出やオーディオ有効性分析のためのユーティリティ
 */

export interface AudioValidityResult {
  /** 有効な音声の比率 (0-1) */
  validRatio: number;
  /** 指定しきい値以上の有効音声があるか */
  hasEnoughAudio: boolean;
  /** RMS値 */
  rms: number;
}

/**
 * オーディオデータの有効性を分析
 * 無音部分を検出し、有効な音声の割合を計算
 * 
 * @param pcmData PCMオーディオデータ (Float32Array)
 * @param sampleRate サンプルレート (デフォルト: 44100)
 * @param silenceThreshold 無音とみなすRMS閾値 (デフォルト: 0.001)
 * @param validityThreshold 合格とみなす有効音声の割合 (デフォルト: 0.8)
 * @param chunkDuration 分析チャンクの長さ（秒） (デフォルト: 0.1)
 */
export function analyzeAudioValidity(
  pcmData: Float32Array,
  sampleRate: number = 44100,
  silenceThreshold: number = 0.001,
  validityThreshold: number = 0.8,
  chunkDuration: number = 0.1
): AudioValidityResult {
  const chunkSize = Math.floor(sampleRate * chunkDuration);
  const numChunks = Math.floor(pcmData.length / chunkSize);
  
  if (numChunks === 0) {
    return { validRatio: 0, hasEnoughAudio: false, rms: 0 };
  }

  let validChunks = 0;
  let totalRms = 0;

  for (let i = 0; i < numChunks; i++) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    
    // Calculate RMS for this chunk
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      sumSquares += pcmData[j] * pcmData[j];
    }
    const chunkRms = Math.sqrt(sumSquares / chunkSize);
    totalRms += chunkRms;
    
    // Check if chunk has audio (not silent)
    if (chunkRms > silenceThreshold) {
      validChunks++;
    }
  }

  const validRatio = validChunks / numChunks;
  const avgRms = totalRms / numChunks;

  return {
    validRatio,
    hasEnoughAudio: validRatio >= validityThreshold,
    rms: avgRms
  };
}

/**
 * 末尾の無音部分のみを検出
 * ループ終端が無音かどうかを判定
 * 
 * @param pcmData PCMオーディオデータ
 * @param sampleRate サンプルレート
 * @param silenceThreshold 無音閾値
 * @returns 末尾の無音部分の割合 (0-1)
 */
export function detectTailingSilence(
  pcmData: Float32Array,
  sampleRate: number = 44100,
  silenceThreshold: number = 0.001
): number {
  const chunkSize = Math.floor(sampleRate * 0.1); // 100ms chunks
  const numChunks = Math.floor(pcmData.length / chunkSize);
  
  if (numChunks === 0) return 1;

  let silentTailChunks = 0;
  
  // Check from end to start
  for (let i = numChunks - 1; i >= 0; i--) {
    const start = i * chunkSize;
    const end = start + chunkSize;
    
    let sumSquares = 0;
    for (let j = start; j < end; j++) {
      sumSquares += pcmData[j] * pcmData[j];
    }
    const chunkRms = Math.sqrt(sumSquares / chunkSize);
    
    if (chunkRms > silenceThreshold) {
      break; // Found audio, stop counting
    }
    silentTailChunks++;
  }

  return silentTailChunks / numChunks;
}
