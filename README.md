# Bio:gram (Ghost in the Groove)

> "Noise is where the universe resides."

**Bio:gram** is an experimental AI-driven DJ system powered by **Google's Gemini Flash** and the high-fidelity **Lyria** model. It transcends traditional linear mixing by employing a **Deep Spectral Architect**, allowing the AI to act as a "Ghost" partner that performs spectral handoffs, organic parameter manipulation, and narrative-driven transitions.

[🇯🇵 日本語 (Japanese)](README_JP.md)

![Main Interface](assets/screenshot1.png)
*Figure 1: Main Interface featuring the AI Director Panel and Dual Decks.*

## 🌌 Core Philosophy

### 1. Organic "Gardening" vs. Mechanical Mixing
Bio:gram treats a DJ mix not as a sequence of triggered events, but as a **living garden**. The AI doesn't just "crossfade"; it cultivates the soundscape. It introduces "wobble" (hesitation) and "drift" into parameter curves to mimic human imperfection (**Wabi-Sabi**), creating a mix that breathes rather than computes.

### 2. Deep Spectral Architecture
Unlike standard auto-mixers that simply lower volume, Bio:gram employs a **Spectral Handoff** strategy. It analyzes and carves out frequency bands (Bass, Mids, Highs) to ensure that two kick drums never clash, while allowing high-frequency textures to weave together seamlessly.

---

## ✨ Features

### 🎹 Generative Audio Engine (Lyria)
Powered by Google's **Lyria** (`lyria-realtime-exp`), Bio:gram doesn't just play files—it generates audio in real-time.
-   **Prompt-to-Music**: Type "Acid Techno 135BPM" and getting a studio-grade loop instantly.
-   **Infinite Extension**: The AI can extend a 4-bar loop into an endless, evolving stream.

### 🎛️ AI Mix Phase Architecture
The AI orchestrates mixes through four narrative phases:
1.  **Presence**: The incoming track manifests only as a "ghost"—reverb tails and high-pass filtered textures.
2.  **Spectral Handoff**: Low frequencies are swapped with surgical precision using sigmoid curves.
3.  **Wash Out**: The outgoing track is eroded using tape delays and feedback loops.
4.  **Silent Reset**: A hidden cleanup phase where the AI resets all parameters.

### 👻 Ghost Faders & Vector Library
-   **Ghost Faders**: Sliders and knobs move by themselves, executing the AI's "Automation Score" in real-time.
-   **Vector Loop Library**: Stored loops are analyzed for characteristics like **Energy**, **Brightness**, and **Rhythm**. The system uses a local Vector Database (IndexedDB) to recommend "Complementary" or "Similar" tracks based on semantic distance, not just BPM.

### 🧬 Living Biogram (Visuals)
A dedicated **Three.js + GLSL Raymarching** engine creates a "Living Biogram"—two metaballs representing the mixing tracks.
-   **Organic Mode**: A liquid, metallic surface that reflects the audio spectrum in real-time.
-   **Particles Mode**: A data-driven visualization where thousands of grey speckles react to frequency bands.
-   **Projector Mode**: Open `?mode=viz` in a separate window to project the visuals to a secondary screen/projector for live performance.

---

## 🎚️ Effects & DSP

Bio:gram features a custom audio engine built on AudioWorklet for sample-accurate processing:

-   **Slicer**: A rhythmic gate that chops audio in sync with the BPM, creating percussive patterns from sustained pads.
-   **Tape Echo**: A dub-style delay with high feedback capabilities for "Wash Out" transitions.
-   **SLAM**: A master bus energy riser that combines a compressor, limiter, and pink noise generator for dramatic buildups.
-   **Cloud Grain**: A granular texture generator that dissolves audio into a cloud of microscopic particles.
-   **Isolator EQ**: DJ-style 3-band EQ with full kill switches.

---

## 🛠️ Tech Stack

-   **Framework**: Vite + TypeScript
-   **Generative AI**: 
    -   **Logic**: Google Gemini Flash (via `@google/genai`)
    -   **Audio**: Google Lyria (`lyria-realtime-exp`)
-   **Audio Engine**: Web Audio API + AudioWorklet (DSP)
-   **Database**: IndexedDB + Vector Search (Local-First)
-   **Visuals**: Three.js + Custom Raymarching Shaders (GLSL)
-   **UI**: Lit (Web Components) + TailwindCSS

---

## 🚀 Setup

### 1. Prerequisites
-   Node.js (v18+)
-   Google AI Studio API Key (Gemini)

### 2. Installation
```bash
git clone https://github.com/youshinh/biogram.git
cd biogram
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory:
```env
GEMINI_API_KEY=your_api_key_here
```

### 4. Start
```bash
npm run dev
```
Open `http://localhost:3000` to enter the garden.

## 🎮 Usage

1.  **Load & Play**: Press "PLAY" on Deck A/B.
2.  **Direct**: Open the central "SUPER CONTROLS" panel.
3.  **Prompt**: Select a mode (e.g., "Deep Blend") and Duration (e.g., "64 Bars").
4.  **Influence**: Use the "Mood" sliders (Ambient, Acid, etc.) to bias the AI's parameter generation.
5.  **Inject**: Press the **[ Deep Mix -> ]** button and watch the Ghost Faders take over.

---

## 🤝 Contributing
Issues and Pull Requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

## 📄 License
[MIT License](LICENSE)
