# Bio:gram (Ghost in the Groove)

> "Noise is where the universe resides. (ノイズこそが、宇宙の所在である)"

**Bio:gram** は、**Google Gemini Flash** を搭載した実験的な AI DJ システムであり、「Prompt-DJ」プラットフォームです。従来の線形的なオートミックスを超越し、**Deep Spectral Architect (深層スペクトル設計)** を採用することで、AI が「Ghost (幽霊)」のようなパートナーとして振る舞い、周波数帯域の譲り合い、有機的なパラメータ操作、そして物語性のあるトランジションをリアルタイムに実行します。

[🇺🇸 English](README.md)

![Main Interface](assets/screenshot1.png)
*図1: AI Director パネルとデュアルデッキを備えたメインインターフェース*

## 🌌 Core Philosophy (中心哲学)

### 1. Organic "Gardening" vs. Mechanical Mixing
Bio:gram は DJ ミックスを単なるイベントの連鎖ではなく、**「生きた庭 (Living Garden)」** として扱います。AI は単にクロスフェードするのではなく、音響空間を「耕作（Cultivate）」します。パラメータのカーブに「Wobble (揺らぎ)」や「Drift (漂い)」といった人間特有の不完全性 (**Wabi-Sabi**) を意図的に導入し、計算された機械的な音ではなく、呼吸するようなミックスを生み出します。

### 2. Deep Spectral Architecture
音量を下げるだけの一般的なオートミックスとは異なり、Bio:gram は **Spectral Handoff (スペクトル譲渡)** 戦略を採用します。周波数帯域（低域、中域、高域）を外科的に分析・切除し、2つのキックドラムが決して衝突しないように制御しながら、高域のテクスチャだけを美しく織り交ぜます。

---

## ✨ Features

### 🎛️ AI Mix Phase Architecture
AI は、以下の4つの物語的フェーズを通じてミックスを指揮します。進行状況はインターフェース上で可視化されます。

1.  **Presence (予兆 - The Omen)**: 次の曲はまだ実体を持たず、リバーブの残響やハイパスフィルタを通した「気配 (Ghost)」としてのみ空間に漂います。
2.  **Spectral Handoff (交換 - The Exchange)**: 核となるメカニズムです。シグモイド曲線を用いて低域（Bass）を滑らかに入れ替え、エネルギーの主導権を有機的に移行させます。
3.  **Wash Out (風化 - The Echo)**: 去りゆく曲は単にミュートされるのではなく、テープディレイやフィードバックループによって積極的に「風化」させられ、記憶の彼方へと溶けていきます。
4.  **Silent Reset (浄化 - The Purification)**: ユーザーには見えない舞台裏で、AI がすべてのパラメータを初期値に戻し、次の演奏（転生）に備えるクリーンアップフェーズです。

### 👻 Ghost Faders
画面上のスライダーやノブが勝手に動く様子をご覧ください。これは録画されたアニメーションではなく、**Gemini Flash** モデルがリアルタイムに生成した「オートメーション・スコア（楽譜）」に基づいて、AI が実際に操作を行っている姿です。

### 🧠 Generative Modes
AI の性格（Persona）を選択し、物語をコントロールできます。
-   **Deep Blend**: アンビエントやディープテクノ向け。64〜128小節かけた長く流動的なトランジション。
-   **Rhythmic Swap**: ハウスやハードテクノ向け。ゲートやスライサーを使用し、リズムを刻みながら鋭くカットインします。
-   **Chaos Gen**: エクスペリメンタル向け。フィードバックループやビットクラッシャーを多用し、破壊と再生を繰り返します。
-   **Cinema**: サウンドトラック向け。無限のフリーズ（Eternal Freeze）とドローンレイヤーを用いた音響風景。

### 🧬 Visual Matrix (Hydra)
内蔵された **Hydra-Synth** がオーディオの帯域にリアルタイムで反応し、ミックスのスペクトル変化を鏡のように映し出すコード駆動のビジュアルを生成します。

---

## 🛠️ Tech Stack

-   **Framework**: Vite + TypeScript
-   **AI Model**: Google Gemini Flash (via `@google/genai`)
-   **Audio Engine**: Web Audio API + AudioWorklet (サンプル単位の精密なタイミング制御)
-   **UI**: Lit (Web Components) + TailwindCSS
-   **Visuals**: Hydra-Synth + p5.js
-   **Data Consistency**: IndexedDB を使用した "Local-First" アーキテクチャ

---

## 🚀 Setup

### 1. Prerequisites
-   Node.js (v18以上推奨)
-   Google AI Studio API Key (Gemini)

### 2. Installation
```bash
git clone https://github.com/youshinh/biogram.git
cd biogram
npm install
```

### 3. Environment Variables
プロジェクトルートに `.env` ファイルを作成し、API キーを設定してください。
```env
GEMINI_API_KEY=your_api_key_here
```

### 4. Start
```bash
npm run dev
```
ブラウザで `http://localhost:3000` を開き、庭園（Garden）に入場してください。

## 🎮 Usage

1.  **Load & Play**: Deck A/B の "PLAY" ボタンを押して再生を開始します。
2.  **Direct**: 中央の "SUPER CONTROLS" パネルを開きます。
3.  **Prompt**: モード（例: "Deep Blend"）と長さ（例: "64 Bars"）を選択します。
4.  **Influence**: "Mood" スライダー（Ambient, Acid など）を動かし、AI の生成傾向にバイアスを与えます。
5.  **Inject**: **[ Deep Mix -> ]** ボタンを押すと、Ghost Fader が操作を開始します。

---

## 🤝 Contributing
Issue や Pull Request は歓迎します。投稿前に [CONTRIBUTING.md](CONTRIBUTING.md) をご一読ください。

## 📄 License
[MIT License](LICENSE)
