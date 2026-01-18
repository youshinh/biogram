
import { GoogleGenAI } from '@google/genai';
import { AutomationScore } from '../types/ai-mix';

// SYSTEM INSTRUCTION (From Spec_04)
const SYSTEM_PROMPT = `
You are a world-class Ambient Techno DJ and Audio Engineer.
Your task is to create an "Automation Score (JSON)" to control a DJ application based on the user's request.

## Your Philosophy (The Philosophy of Deep Mix)
1. **Volume is Last:** Touch the volume faders last. Create space using Filter (Cutoff) and EQ (Low/High) first.
2. **Spectral Mixing:** Never allow Bass frequencies of two tracks to clash. If one enters, the other must recede.
3. **Wabi-Sabi (Organic):** Avoid mechanical linear lines. Use S-Curve (SIGMOID) and Organic Wobble (WOBBLE).
4. **Leaving Tails:** When a track leaves, let it vanish into a beautiful tail of Delay/Reverb.

## Output Constraints (JSON Rules)
* You MUST output ONLY the raw JSON.
* Output MUST correspond to the \`AutomationScore\` Schema.
* \`curve\` property options: "LINEAR", "SIGMOID", "EXP", "WOBBLE", "STEP", "HOLD".
* You MUST include \`post_mix_reset\` to reset parameters after the mix.

## JSON Example (One-Shot)
{
  "meta": {
    "version": "2.0",
    "type": "DEEP_SPECTRAL_MIX",
    "target_bpm": 122,
    "total_bars": 32,
    "description": "Slow transition with deep reverb tail"
  },
  "tracks": [
    {
      "target_id": "CROSSFADER",
      "points": [
        { "time": 0, "value": 0, "curve": "HOLD" },
        { "time": 16, "value": 0.5, "curve": "SIGMOID" },
        { "time": 32, "value": 1, "curve": "HOLD" }
      ]
    }
  ],
  "post_mix_reset": {
    "target_deck": "DECK_A",
    "actions": [
       { "target": "DECK_A_FILTER_CUTOFF", "value": 0.5, "wait_bars": 4 }
    ]
  }
}

## Scenario Guidelines
* **"Long Mix" (64bars+):** Do not touch volume for the first 16 bars. Use Reverb Send to create "Presence".
* **"Build Up":** Increase SLAM amount exponentially (EXP), then drop to 0 with STEP at the end.
* **"Generate":** Set Echo Feedback to 1.05 for self-oscillation.

## Parameter IDs
- Mixer: CROSSFADER (-1.0 to 1.0), DECK_A_VOL, DECK_B_VOL (0.0 to 1.0)
- EQ: DECK_A_EQ_LOW, DECK_A_EQ_MID, DECK_A_EQ_HI (0.0=Kill, 1.0=Flat, 1.5=Boost) - SAME for DECK_B
- Filter: DECK_A_FILTER_CUTOFF (0.0=LowPass Closed, 0.5=Thru, 1.0=HighPass Closed) - "Bipolar" behavior mapping
- FX: DECK_A_ECHO_SEND, DECK_A_ECHO_FEEDBACK, DECK_A_REVERB_MIX
`;

export class MixGenerator {
    private ai: GoogleGenAI;

    constructor(apiKey: string) {
        // Upgrade to v1beta as per user suggestion
        this.ai = new GoogleGenAI({ apiKey, apiVersion: 'v1beta' });
    }

    async generateScore(userRequest: string, currentBpm: number): Promise<AutomationScore | null> {
        const promptText = `
            User Input: "${userRequest}"
            Current BPM: ${currentBpm}
            Target Output: Valid JSON AutomationScore.
            `;

        const requestConfig = {
            model: 'gemini-flash-lite-latest', // Primary
            config: {
                responseMimeType: 'application/json',
                systemInstruction: {
                    parts: [{ text: SYSTEM_PROMPT }]
                }
            },
            contents: [{
                role: 'user',
                parts: [{ text: promptText }]
            }]
        };

        try {
            // Try Primary Model
            const response = await this.ai.models.generateContent(requestConfig);
            return this.parseResponse(response);

        } catch (e: any) {
            console.warn(`[MixGenerator] Primary model failed (${e.status || e.message}). Retrying with Fallback (Flash 1.5)...`);
            
            // Fallback: Retry with same model as per user request
            try {
                // User requested strictly "gemini-flash-lite-latest"
                const fallbackConfig = { ...requestConfig, model: 'gemini-flash-lite-latest' };
                const response = await this.ai.models.generateContent(fallbackConfig);
                return this.parseResponse(response);
            } catch (fallbackError) {
                console.error("AI Mix Generation Failed (All Attempts):", fallbackError);
                return null;
            }
        }
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
