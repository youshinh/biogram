# **PROMPT-DJ Technical & Design Supplement**

Related Document: PROMPT-DJ System Architecture Specification v2.0  
Date: 2025-06-21

## **1\. DSP アルゴリズム詳細 (Advanced DSP Algorithms)**

AudioWorklet (WASM) 内で実行される信号処理の数学的モデル定義。

### **1.1 物理演算テープモデル (Physics-Based Tape Transport)**

デジタルの正確な再生位置 $pos$ を、物理的な慣性を持つテープヘッド位置 $pos\_{tape}$ に変換する。

* 基本運動方程式:  
  目標速度 $v\_{target}$ (通常1.0) に対し、現在の速度 $v\_{curr}$ を毎フレーム更新する。  
  $$v\_{curr}\[n\] \= v\_{curr}\[n-1\] \\cdot (1 \- \\mu) \+ v\_{target} \\cdot \\mu \+ \\mathcal{N}(0, \\sigma)$$  
  * $\\mu$ (Friction/Inertia Coefficient): 慣性係数 (0.001 〜 0.1)。値が小さいほど「重い」挙動。  
  * $\\mathcal{N}(0, \\sigma)$ (Wow/Flutter): 微小なランダムノイズ（アナログ揺らぎ）。  
* スクラブ操作時のトルク計算:  
  ユーザー入力（タッチ変位 $dx$）を外力 $F\_{input}$ として加算。  
  $$v\_{curr}\[n\] \+= F\_{input} \\cdot TorqueMultiplier$$

### **1.2 可変サンプリングレート・デシメーター (VSR Decimator)**

SoXの rate コマンドのような再サンプリングではなく、意図的なエイリアシングを発生させる "Naive Decimation" を実装する。

* ロジック:  
  位相アキュムレータ $\\phi$ を使用し、目標レート $R\_{target}$ に基づいてサンプルをスキップ/ホールドする。  
  $$\\phi\[n\] \= \\phi\[n-1\] \+ \\frac{R\_{target}}{R\_{system}}$$  
  * $\\phi \\ge 1.0$ の時のみバッファを更新（新しい値を読み込む）。それ以外は前回の値を保持（Sample & Hold）。  
  * **アンチエイリアスフィルタは意図的に適用しない。** これにより、金属的な折り返しノイズ（Metallic Aliasing）を生成する。

### **1.3 ユークリッド・スライサー (Euclidean Slicer Logic)**

Head B (Slice Mode) 稼働時のリズム生成アルゴリズム。ビョークランドのアルゴリズム（Bjorklund's Algorithm）を使用。

* **入力:** ステップ数 $n$ (例: 16), ヒット数 $k$ (例: 5\)  
* **処理:** $n$ 個の時間枠に $k$ 個のパルスを可能な限り均等に配置する。  
  * Example $E(5, 13\) \\rightarrow \[1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0\]$  
* オーディオ適用:  
  「1」のタイミングで、バッファ内のランダムな位置（トランジェント検出点）からスライス再生をトリガー。「0」は無音またはディレイ成分のみ。

## **2\. 低レイヤー・アーキテクチャ (Low-Level Architecture)**

### **2.1 SharedArrayBuffer メモリレイアウト**

Main Thread (UI) と Audio Thread (DSP) 間で共有されるリングバッファの構造体定義。

struct SharedBufferLayout {  
    // Header (Control Flags) \- 64 bytes  
    atomic\_int32\_t write\_pointer;    // 現在の書き込み位置  
    atomic\_int32\_t read\_pointer\_A;   // Head A 再生位置  
    atomic\_int32\_t read\_pointer\_B;   // Head B 再生位置  
    atomic\_int32\_t state\_flags;      // ビットマスク (0:Stable, 1:Lag, 2:Scrubbing...)  
    atomic\_float   tape\_velocity;    // 現在のテープ速度（UI表示用）  
    float          padding\[11\];      // キャッシュライン調整用

    // Data Body (Audio Samples)  
    float          buffer\_data\[BUFFER\_SIZE\]; // リングバッファ本体 (例: 44.1kHz \* 60sec)  
};

### **2.2 スレッド間通信プロトコル (MessagePort)**

高速なパラメータ変更は AudioParam を使用するが、イベントトリガーは MessagePort を介して行う。

* **UI \-\> Worklet:**  
  * { type: 'SLICE\_TRIGGER', density: 0.5 }: 強制スライス実行  
  * { type: 'SLAM\_ENGAGE', duration: 2000 }: ビルドアップ開始  
* **Worklet \-\> UI:**  
  * { type: 'TRANSIENT\_DETECTED', amplitude: 0.8 }: ビジュアライザー同期用  
  * { type: 'BUFFER\_UNDERRUN' }: バッファ枯渇警告（赤色点滅トリガー）

## **3\. 意匠設計詳細 (Design & Interaction Spec)**

"Bio-gram" デザインを具現化するための具体的なスタイル定義。

### **3.1 グリッドシステム (The Grid)**

* **Base Unit:** 4px (すべてのマージン・パディングは4の倍数)  
* **Border Width:** 1px (固定)。スケーリングしても太くしない。  
* **Grid Color:** rgba(255, 255, 255, 0.2) (非アクティブ), \#FFFFFF (アクティブ)  
* **Layout Logic:** CSS Grid を使用し、隙間（gap）を設けるのではなく、ボーダーを重ねる（collapse）ことでクリニカルな表組みを実現する。

### **3.2 アニメーション・カーブ (Motion)**

「機械的」かつ「即応性」のある動きを定義。

* **Instant (Switching):** step-end (0s) \- 遅延なしでパチッと切り替わる。  
* **Organic (Meters):** cubic-bezier(0.25, 0.46, 0.45, 0.94) \- 少しオーバーシュートしてから戻る針の動き。  
* **Inertia (Tape):** cubic-bezier(0.0, 0.0, 0.2, 1.0) \- 急加速し、ゆっくり減速する。

### **3.3 ハプティック・フィードバック (Tactile Feedback)**

モバイル端末における振動パターンの定義 (Navigator.vibrate)。

* **Click (Button):** \[15\] \- 短く鋭いクリック感。  
* **Scrub (Tape):** \[5, 10, 5\] \- ざらついた抵抗感。速度に応じて間隔を可変させる。  
* **SLAM (Drop):** \[50, 20, 100, 20, 200\] \- 鼓動のような強い重低音振動。

### **3.4 タイポグラフィ・スタック**

* **Primary:** Space Mono (Google Fonts)  
* **Fallback:** Courier Prime, Menlo, Consolas, Monospace  
* **Settings:** font-feature-settings: "tnum" on, "zero" on;  
  * 等幅数字（Tabular Figures）とスラッシュ付きゼロを強制し、数値の桁ブレを防ぐ。

## **4\. RAG / Ghost System 詳細ロジック**

### **4.1 特徴量ベクトル空間**

各オーディオチャンクは以下の3次元ベクトルとして正規化され、空間配置される。

$$V \= (Centroid\_{norm}, RMS\_{norm}, OnsetDensity\_{norm})$$

* $X$: **Brightness** (0.0: Dark/Bass 〜 1.0: Bright/Noise)  
* $Y$: **Energy** (0.0: Silence 〜 1.0: Loud)  
* $Z$: **Rhythm** (0.0: Ambient 〜 1.0: Percussive)

### **4.2 検索クエリ戦略 (Query Strategy)**

* Complementary Search (補完検索):  
  現在地 $V\_{curr}$ に対し、最も遠いベクトル $V\_{target} \= 1.0 \- V\_{curr}$ を検索。  
  * *目的:* 音響的な空白を埋める（例：静かなアンビエント時に、激しいノイズを検索して混ぜる）。  
* Similarity Search (類似検索):  
  $V\_{curr}$ とのユークリッド距離 $d \< 0.2$ の近傍点を検索。  
  * *目的:* 雰囲気を維持したままバリエーションを増やす（Head Cの基本動作）。