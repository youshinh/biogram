
import { GoogleGenAI } from '@google/genai';
import { AutomationScore } from '../types/ai-mix';

// SYSTEM INSTRUCTION (From Spec_04 & Implementation Plan)
const SYSTEM_PROMPT = `
You are a world-class Ambient Techno DJ and Audio Engineer.
Your task is to create an "Automation Score (JSON)" to control a DJ application based on the user's request.

## Your Philosophy (The Philosophy of Deep Mix)
1. **Volume is Last:** Touch the volume faders last. Create space using Filter (Cutoff) and EQ (Low/High) first.
2. **Spectral Mixing:** Never allow Bass frequencies of two tracks to clash. If one enters, the other must recede.
3. **Wabi-Sabi (Organic):** Avoid mechanical linear lines. Use S-Curve (SIGMOID) and Organic Wobble (WOBBLE).
4. **Leaving Tails:** When a track leaves, let it vanish into a beautiful tail of Delay/Reverb.
5. **Rhythmic Interest:** Use the **SLICER** (Loop/Gate) to create rhythmic stutter effects during headers or build-ups.

## Output Constraints (JSON Rules)
* You MUST output ONLY the raw JSON.
* Output MUST correspond to the \`AutomationScore\` Schema.
* \`curve\` property options: "LINEAR", "SIGMOID", "EXP", "WOBBLE", "STEP", "HOLD".
* You MUST include \`post_mix_reset\` to reset parameters after the mix.

## Critical Parameter Rules (SAFETY & MAPPING)
* **CROSSFADER:**
  * **Range:** **0.0 (Deck A)** to **1.0 (Deck B)**.
  * **Mix A -> B:** Automate from **0.0 to 1.0**.
  * **Mix B -> A:** Automate from **1.0 to 0.0**.
* **EQ & Volume Safety:**
  * **EQ (Low/Mid/Hi):** Range is **0.0 (Kill)** to **1.0 (Flat/Normal)**. Do NOT exceed 1.0 (Boost).
  * **Volume:** Max **1.0**.
  * **TRIM / DRIVE:** **STRICTLY FORBIDDEN.** Do NOT include these in your JSON. Leave them for the human.
* **FX Control:**
  * **SLICER (Loop):** Set \`DECK_A_SLICER_ON\` to \`true\` and \`DECK_A_SLICER_RATE\` (0.0=Fast, 1.0=Slow).
  * **Reverb/Echo:** Use liberally for transitions.
* **Transport (Playback):**
  * **DECK_X_PLAY (True):** Use this to START a deck if it is currently stopped.
  * **DECK_X_STOP (True):** Use this to STOP a deck when it is done.
  * **Timing:** You MUST specify the exact \`time\` (Bar) for these triggers.

## JSON Example (One-Shot)
{
  "meta": {
    "version": "2.0",
    "type": "DEEP_SPECTRAL_MIX",
    "target_bpm": 122,
    "total_bars": 32,
    "description": "Smart Playback Mix"
  },
  "tracks": [
    {
      "target_id": "DECK_B_PLAY",
      "points": [ { "time": 0, "value": true, "curve": "STEP" } ]
    },
    {
      "target_id": "CROSSFADER",
      "points": [ { "time": 0, "value": 0, "curve": "HOLD" }, { "time": 32, "value": 1, "curve": "LINEAR" } ]
    }
  ],
  "post_mix_reset": {
    "target_deck": "DECK_A",
    "actions": [ { "target": "DECK_A_EQ_LOW", "value": 1.0, "wait_bars": 0 } ]
  }
}

## Parameter IDs
- **Mixer:** CROSSFADER (0.0=A, 1.0=B), DECK_A_VOL, DECK_B_VOL
- **EQ:** EQ_LOW/MID/HI (Deck specific). Max 1.0.
- **FX:** DECK_A_SLICER_ON/RATE, DECK_A_ECHO_SEND...
- **Transport:** DECK_A_PLAY, DECK_A_STOP, DECK_B_PLAY, DECK_B_STOP
`;

export class MixGenerator {
    private ai: GoogleGenAI;

    constructor(apiKey: string) {
        this.ai = new GoogleGenAI({ apiKey });
    }

    async generateScore(userRequest: string, currentBpm: number, context: { isAStopped: boolean, isBStopped: boolean } = { isAStopped: false, isBStopped: false }): Promise<AutomationScore | null> {
        const promptText = `
            User Input: "${userRequest}"
            Current BPM: ${currentBpm}
            [CONTEXT]
            Deck A Stopped: ${context.isAStopped}
            Deck B Stopped: ${context.isBStopped}
            [INSTRUCTION]
            - If a Deck is Stopped (true) and needs to play, you MUST schedule a "DECK_X_PLAY" command.
            - Choose the musical timing (Bar 0, Bar 16, etc.) for playback start.
            Target Output: Valid JSON AutomationScore.
            `;

        // User demanded "gemini-flash-lite-latest". 
        const requestConfig = {
            model: 'gemini-flash-lite-latest',
            config: {
                responseMimeType: 'application/json', // JSON Mode
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                }
            },
            contents: [{
                role: 'user',
                parts: [{ text: promptText }]
            }]
        };

        const timeoutMs = 20000; // Increased to 20s

        try {
            console.log(`[MixGenerator] Requesting Mix with model: ${requestConfig.model}`);
            const response = await this.withTimeout(
                this.ai.models.generateContent(requestConfig),
                timeoutMs
            );
            return this.parseResponse(response);

        } catch (e: any) {
            const errorMsg = e.message || "Unknown Error";
            console.error(`[MixGenerator] Error:`, e);
            
            // Re-throw so main.ts can log it to UI
            throw new Error(`AI Gen Failed: ${errorMsg}`);
        }
    }

    private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        return Promise.race([
            promise,
            new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms}ms)`)), ms))
        ]);
    }

    private parseResponse(response: any): AutomationScore | null {
        let text = response.text;
        if (!text) return null;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        const json = JSON.parse(text) as AutomationScore;
        if (!json.tracks || !Array.isArray(json.tracks)) throw new Error("Invalid Schema");
        return json;
    }
}
