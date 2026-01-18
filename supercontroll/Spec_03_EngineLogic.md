# **AI Mix 機能仕様書 Part 3: エンジン実装仕様 (Logic & Math)**

### **1\. Automation Engine クラス設計**

requestAnimationFrame (UIスレッド) または AudioWorklet (オーディオクロック) に同期して動作するスケジューラー。

#### **状態変数**

* isPlaying: boolean \- オートメーション実行中フラグ  
* startTime: number \- オートメーション開始時の絶対時間（AudioContext.currentTime）  
* currentBar: number \- 現在の小節位置  
* score: AutomationScore \- ロードされたJSONデータ

### **2\. 補間アルゴリズム (Interpolation Math)**

2つのキーフレーム P1(t1, v1) と P2(t2, v2) の間で、現在の時刻 t における値 v を算出する。  
progress (p) \= (t \- t1) / (t2 \- t1) (0.0 〜 1.0)

#### **A. Linear (直線)**

v \= v1 \+ (v2 \- v1) \* p;

#### **B. Sigmoid (S字カーブ \- Human Touch)**

フェーダー操作に最も適した、人間的な「ゆっくり動き出し、スッと動かし、ゆっくり止める」動き。

// k は急峻度 (通常 10〜12 程度)  
const k \= 10;   
// 0〜1に正規化されたSigmoid関数  
const sigmoidP \= 1 / (1 \+ Math.exp(-k \* (p \- 0.5)));  
// 0.0と1.0に正確に合わせる補正が必要  
const min \= 1 / (1 \+ Math.exp(k \* 0.5));  
const max \= 1 / (1 \+ Math.exp(-k \* 0.5));  
const correctedP \= (sigmoidP \- min) / (max \- min);

v \= v1 \+ (v2 \- v1) \* correctedP;

#### **C. Wobble (揺らぎ \- Organic Chaos)**

目標値に向かいつつも、Perlin NoiseやSine波を使って「迷い」や「震え」を付加する。

// pそのものはLinearで進行  
const linearV \= v1 \+ (v2 \- v1) \* p;

// 揺らぎ成分 (周波数はBPM依存にすると音楽的)  
const wobbleFreq \= 10.0; // Hz  
const wobble \= Math.sin(p \* Math.PI \* wobbleFreq) \* Math.sin(p \* Math.PI); // 始点と終点では揺れを0にする窓関数

// wobble\_amount (0.0〜1.0) で揺れ幅調整  
v \= linearV \+ (wobble \* wobble\_amount \* 0.2); 

### **3\. 安全装置 (Safety Layer)**

AIが生成した値がDSPの許容範囲を超えたり、スピーカーを破損させたりしないためのリミッター。

* **Gain Protection:** DECK\_VOL と MASTER\_GAIN の積が一定値を超えないようクランプする。  
* **Feedback Clamp:** ECHO\_FEEDBACK が 1.0 を超える（自己発振）状態が4小節以上続いた場合、強制的に 0.9 に下げる（ハウリング事故防止）。  
* **Frequency Constraint:** EQ\_LOW が両方のデッキで同時に 0.8 以上の場合、Incoming側の EQ\_LOW を自動的に下げる（低域衝突回避の強制）。

### **4\. リセット・スケジューラー (Phase 4 Logic)**

post\_mix\_reset 配列に登録されたアクションは、タイムライン終了後、setTimeout ではなく、メインループ内で「小節カウンタ」を監視し続けて実行する。これにより、BPMが変わっても小節単位での待機時間が守られる。