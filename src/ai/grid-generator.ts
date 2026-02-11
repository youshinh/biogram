import { AiGridParams } from '../ui/visuals/AiDynamicGrid';
import { postBackendJson } from '../api/backend-client';

const SYSTEM_PROMPT = `
You are a Generative Visual Artist.
Your task is to generate a JSON configuration for a 3D Grid Visualizer ("AiDynamicGrid") based on the provided musical context.

# Output Schema (JSON)
{
    "geometry": {
        "shape": "sphere" | "torus" | "cylinder" | "wobble",
        "radius": number (1.0 - 5.0),
        "twist": number (-2.0 - 2.0)
    },
    "wave": {
        "func": "sine" | "sawtooth" | "noise" | "pulse",
        "frequency": number (1.0 - 10.0),
        "speed": number (0.1 - 5.0),
        "amplitude": number (0.0 - 2.0),
        "complexity": number (0.0 - 1.0)
    },
    "material": {
        "blurStrength": number (0.0 - 1.0),
        "coreOpacity": number (0.0 - 1.0),
        "glowOpacity": number (0.0 - 1.0),
        "color": string (Hex Color Code, e.g., "#FF00FF"),
        "secondaryColor": string (Hex Color Code, optional)
    }
}

# Archetypes based on Mood:
- **Energetic/Techno**: shape="sphere", wave="sawtooth", intensity high, color neon.
- **Ambient/Deep**: shape="torus", wave="sine", slow speed, blur high, color cool.
- **Glitch/IDM**: shape="wobble" or "cylinder", wave="noise", twist high, color high contrast.
- **Minimal**: shape="sphere", wave="pulse", low complexity, sharp lines (blur 0).

Output ONLY valid JSON.
`;

export class GridGenerator {
    constructor() {}

    public async generateParams(context: string): Promise<AiGridParams | null> {
        try {
            const response = await postBackendJson<{
                params: AiGridParams | null;
            }>('/api/ai/grid', {
                context
            });
            return response.params;
        } catch (e) {
            console.error("Grid Param Gen Failed", e);
            return null;
        }
    }
}
