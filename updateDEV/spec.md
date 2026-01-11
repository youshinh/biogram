# **PROMPT-DJ SYSTEM ARCHITECTURE SPECIFICATION**

Codename: "Ghost in the Groove"  
Version: 2.0 (The Monolith Edition)  
Date: 2025-06-21  
Author: Lead Sound Architect

## **1\. プロジェクト概要 (Executive Summary)**

### **1.1 コンセプト**

PromptDJは、生成AI (Google Gemini) を単なる「自動作曲機」としてではなく、「予測不可能な生の信号源（Oscillator）」として扱うリアルタイム・パフォーマンス・システムである。  
SoX (Sound eXchange) の破壊的な信号処理思想と、ミニマル・テクノの反復美学を融合させ、ユーザーがAI生成音をリアルタイムに\*\*「破壊・再構築・演奏」\*\*するためのプラットフォームを提供する。

### **1.2 デザイン哲学: "Bio-gram / Monolith"**

* **Visual:** 徹底したモノクローム、1pxの極細グリッド、医療用モニターやUNIX端末を想起させるクリニカルなデータ表示。  
* **Audio:** アナログテープの物理特性シミュレーションと、デジタル特有のビット劣化（Decimation）の共存。

## **2\. 技術スタック & インフラストラクチャ**

### **2.1 コア・テクノロジー**

* **Frontend Framework:** Lit (Web Components) \- 軽量かつ高パフォーマンス。  
* **Language:** TypeScript (Strict Mode) \+ C++ / Rust (for WASM DSP).  
* **Audio Engine:** AudioWorklet \+ WebAssembly (WASM).  
* **Memory Management:** SharedArrayBuffer \+ Atomics (リングバッファ共有).  
* **AI Model:** Google Gemini (lyria-realtime-exp).

### **2.2 セキュリティ要件 (Critical)**

SharedArrayBuffer を使用するため、以下のHTTPレスポンスヘッダが必須となる。

* Cross-Origin-Opener-Policy: same-origin  
* Cross-Origin-Embedder-Policy: require-corp

## **3\. オーディオ・エンジン・アーキテクチャ (The Engine)**

メインスレッド（UI）とオーディオスレッド（DSP）を完全に分離し、サンプル単位の精度（Sample-Accurate Timing）を保証する。

### **3.1 Hydra Buffer System (多頭バッファ戦略)**

AIからのストリームは単一のバッファではなく、並列稼働する3つの循環バッファ（Ring Buffer）に常時記録される。

| ヘッド名 | ソース | 動作モード | トリガー条件 |
| :---- | :---- | :---- | :---- |
| **Head A (Live)** | Gemini Stream | **Varispeed Tape Model** 物理演算による慣性付き再生。 | 通常時 (Stable) |
| **Head B (Slice)** | Last 4 Bars | **Euclidean Chopper** 直近の音を切り刻み、ユークリッドリズムで再配置。 | バッファ枯渇 / ユーザー操作 |
| **Head C (Cloud)** | Library (RAG) | **Granular Synthesis** 過去の音源を粒子化し、空間を埋める。 | 完全停止時 / ブレイク演出 |

### **3.2 物理演算テープモデル (Physics Transport)**

Head Aの再生速度 $r$ は、以下の物理モデルに従う。

$$v\_{next} \= v\_{current} \+ (F\_{motor} \- F\_{friction}) / Mass$$

* **Inertia** (慣性): スクラブ操作や停止時、即座に止まらず「滑る」挙動を再現。  
* **Wow & Flutter:** 再生速度の微細な揺らぎにより、デジタル臭さを排除。  
* **Tape Stop:** 電源断時のピッチダウン効果（Brake）を数式で処理。

## **4\. DSPシグナルチェーン (The Destructive Rack)**

AudioWorklet内で直列処理されるエフェクト・ラック。

### **4.1 Chain Order**

Input \-\> Decimator \-\> Spectral Gate \-\> Tape Echo \-\> Bloom Reverb \-\> Compressor/Limiter \-\> Output

### **4.2 各モジュール仕様**

1. **Decimator (劣化)**  
   * **Sample Rate:** 44.1kHz 〜 4kHz 可変。エイリアシングノイズを生成。  
   * **Bit Depth:** 32bit float 〜 4bit int 可変。量子化ノイズを付加。  
2. **Spectral Gate (帯域制限)**  
   * FFTによる周波数領域処理。指定閾値以下の周波数成分をゼロ化（Silence）し、リズムを鋭くする。  
3. **Tape Echo (汚れた遅延)**  
   * フィードバックループ内にサチュレーション（歪み）とバンドパスフィルタを挿入。繰り返すたびに音が劣化する。  
4. **Bloom Reverb (空間)**  
   * 入力信号のピッチを+12semitonesし、Deep Reverbに送ることで「シマー効果」を生成。  
5. **SLAM Macro (マクロ制御)**  
   * 単一のボタン操作で以下を同時制御するビルドアップ機能。  
     * HPF Cutoff: 20Hz \-\> 800Hz (指数関数)  
     * Reverb Wet: 10% \-\> 100%  
     * Stereo Width: 100% \-\> 0% (Mono)

## **5\. AI & RAG インテグレーション (The Ghost System)**

### **5.1 特徴量抽出 (Feature Extraction)**

メインスレッドにて、AI生成音から以下をリアルタイム解析・タグ付け保存。

* Spectral Centroid (音の重心/明るさ)  
* RMS (音圧)  
* Pulse Clarity (リズムの明確さ)

### **5.2 Flashback Logic (RAG)**

* **トリガー:** 「ブレイク（静寂）」検知時、または「Head B」稼働時。  
* **クエリ:** 現在のトラックと「逆の特性」または「補完的な特性」を持つ過去のログを検索。  
  * *例: 現在が高域寄りなら、低域の強い過去ログを検索。*  
* **インジェクション:** 検索された音源を Head C にロードし、メイン出力の背後に亡霊（Ghost）としてミックス。

## **6\. UI/UX デザイン仕様 (Bio-gram)**

### **6.1 デザイン言語**

* **Palette:** \#000000 (Background), \#FFFFFF (Foreground/Grid).  
* **Typography:** Monospace (JetBrains Mono / Space Mono).  
* **Layout:** 1pxボーダーによる厳格なグリッドシステム。

### **6.2 主要コンポーネント**

* **Hydra Visualizer:**  
  * 従来の波形ではなく、テープヘッドの位置とバッファの状態を示す物理モデル可視化。  
  * タッチ操作によるスクラブ（Inertia Scrubbing）対応。  
* **Bio-Sliders:**  
  * DNAシーケンスのようなセグメント積層型スライダー。  
  * 数値入力ではなく、視覚的な密度でパラメータを表現。  
* **The SLAM Button:**  
  * ハッチングパターン（斜線）を持つ警告色のボタン。  
  * 押下時、画面全体の色反転（Invert）エフェクト。

## **7\. 実装フェーズ (Roadmap)**

### **Phase 1: Core Foundation**

* AudioWorklet \+ WASM 環境構築。  
* SharedArrayBuffer リングバッファの実装。  
* 基本的なGeminiストリーミング再生。

### **Phase 2: The Physics & Buffer**

* 物理演算テープモデルの実装。  
* Head B (Euclidean Chopper) のロジック実装。  
* UI: Hydra Visualizerの実装。

### **Phase 3: The Destruction (DSP)**

* Decimator, Spectral Gate, Tape Echoの実装。  
* SLAM Macroの連動ロジック実装。  
* UI: FX Rackの実装。

### **Phase 4: The Ghost (AI)**

* 特徴量抽出とIndexedDBへの保存。  
* ベクトル検索ロジックの実装。  
* Head C (Cloud) への注入ロジック。

*End of Specification*
