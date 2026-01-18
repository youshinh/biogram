# Bio:gram (Ghost in the Groove)

> "Noise is where the universe resides. (ノイズこそが、宇宙の所在である)"

**Bio:gram** は、**Google Gemini Flash** と高忠実度音楽生成モデル **Lyria** を搭載した実験的な AI DJ システムです。従来の線形的なオートミックスを超越し、**Deep Spectral Architect (深層スペクトル設計)** を採用することで、AI が「Ghost (幽霊)」のようなパートナーとして振る舞い、周波数帯域の譲り合い、有機的なパラメータ操作、そして物語性のあるトランジションをリアルタイムに実行します。

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

### 🎹 Generative Audio Engine (Lyria)
Google の音楽生成モデル **Lyria** (`lyria-realtime-exp`) を搭載し、Bio:gram は単にファイルを再生するだけでなく、リアルタイムにオーディオを生成します。
-   **Prompt-to-Music**: "Acid Techno 135BPM" と入力するだけで、スタジオ品質のループが即座に生成されます。
-   **Infinite Extension**: 4小節のループを、終わりのない進化し続けるストリームへと拡張できます。

### 🎛️ AI Mix Phase Architecture
AI は、以下の4つの物語的フェーズを通じてミックスを指揮します。
1.  **Presence (予兆)**: 次の曲はまだ実体を持たず、リバーブの残響やハイパスフィルタを通した「気配」としてのみ漂います。
2.  **Spectral Handoff (交換)**: シグモイド曲線を用いて低域（Bass）を滑らかに入れ替え、エネルギーの主導権を有機的に移行させます。
3.  **Wash Out (風化)**: 去りゆく曲はテープディレイやフィードバックループによって「風化」し、記憶の彼方へ溶けていきます。
4.  **Silent Reset (浄化)**: ユーザーには見えない舞台裏で行われるパラメータのリセットフェーズです。

### 👻 Ghost Faders & Vector Library
-   **Ghost Faders**: **Gemini Flash** が生成した「オートメーション・スコア」に基づき、画面上のスライダーやノブがまるで幽霊が触れているかのように自律的に動きます。
-   **Vector Loop Library**: 保存されたループは「Energy (エネルギー)」「Brightness (明るさ)」「Rhythm (リズム)」といった特徴ベクトルとして解析されます。システムはローカルのベクトルデータベース (IndexedDB) を使用し、単なるBPMの一致ではなく、音楽的な意味合いでの「類似性」や「相補性」に基づいたトラックの推薦を行います。

### 🧬 Visual Matrix (Hydra)
内蔵された **Hydra-Synth** がオーディオの帯域にリアルタイムで反応し、ミックスのスペクトル変化を鏡のように映し出すコード駆動のビジュアルを生成します。

---

## 🎚️ Effects & DSP

Bio:gram は AudioWorklet 上に構築されたカスタムオーディオエンジンにより、サンプル単位の正確な処理を実現しています。

-   **Slicer**: BPMに同期してオーディオを切り刻み、持続音からリズミカルなパターンを生成するゲートエフェクト。
-   **Tape Echo**: ダブスタイルのディレイ。フィードバックを上げることで「Wash Out」効果を生み出します。
-   **SLAM**: コンプレッサー、リミッター、ピンクノイズジェネレーターを統合したマスターバス用のエナジーライザー。劇的なビルドアップを作ります。
-   **Cloud Grain**: オーディオを微細な粒子（グレイン）へと分解し、雲のようなテクスチャに変えるグラニュラーエフェクト。
-   **Isolator EQ**: 特定の帯域を完全に消音（Kill）できるDJ仕様の3バンドEQ。

---

## 🛠️ Tech Stack

-   **Framework**: Vite + TypeScript
-   **Generative AI**: 
    -   **Logic**: Google Gemini Flash (via `@google/genai`)
    -   **Audio**: Google Lyria (`lyria-realtime-exp`)
-   **Audio Engine**: Web Audio API + AudioWorklet (DSP)
-   **Database**: IndexedDB + Vector Search (Local-First)
-   **Visuals**: Hydra-Synth + p5.js
-   **UI**: Lit (Web Components) + TailwindCSS

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
