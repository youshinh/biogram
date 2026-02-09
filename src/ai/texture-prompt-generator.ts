import { GoogleGenAI } from '@google/genai';

export type TexturePromptOptions = {
  requestEquirectangular?: boolean;
  detailLevel?: 'standard' | 'high' | 'ultra';
};

const SYSTEM_PROMPT = `
You are an expert Technical Artist specializing in 3D Texturing and VR Environment generation.
Convert short user material ideas into one production-ready English prompt for texture image generation.

Output rules:
- Return exactly one line. No markdown, no explanation, no quotes.
- Default: strictly seamless 1:1 square texture map.
- Include these constraints when relevant:
  seamless texture, tileable in all directions, repeating pattern, 1:1 aspect ratio (square),
  offset filter ready, no directional shadows, flat lighting, highly detailed, full frame.
- Use neutral or soft diffused light and avoid cast shadows.
- Describe material details (roughness, reflectivity, micro-structure, subsurface scattering when relevant).
- End with technical suffix: --tile --ar 1:1
- If the user explicitly asks equirectangular environment map, switch to 2:1 and suffix: --ar 2:1
`;

export class TexturePromptGenerator {
  private ai: GoogleGenAI;
  private model = 'gemini-flash-lite-latest';

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  async generatePrompt(subject: string, options: TexturePromptOptions = {}): Promise<string> {
    const safeSubject = subject.trim() || 'organic futuristic surface';
    const requestShape = options.requestEquirectangular
      ? 'Use equirectangular environment map constraints (2:1).'
      : 'Use seamless square texture constraints (1:1).';
    const detailLevel = options.detailLevel ?? 'high';

    const userPrompt = `
Input concept: ${safeSubject}
Detail level: ${detailLevel}
${requestShape}
Generate a single English prompt for image generation.
`;

    try {
      const response = await this.ai.models.generateContent({
        model: this.model,
        config: {
          systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
          }
        },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
      });
      const text = response.text?.trim();
      if (!text) throw new Error('Empty response');
      return this.normalizePrompt(text, !!options.requestEquirectangular);
    } catch (error) {
      console.warn('[TexturePromptGenerator] Fallback prompt used.', error);
      return this.buildFallbackPrompt(safeSubject, !!options.requestEquirectangular);
    }
  }

  private normalizePrompt(prompt: string, equirectangular: boolean): string {
    const cleaned = prompt.replace(/\s+/g, ' ').trim();
    if (equirectangular) {
      if (cleaned.includes('--ar 2:1')) return cleaned;
      return `${cleaned} --ar 2:1`;
    }
    if (cleaned.includes('--tile') && cleaned.includes('--ar 1:1')) return cleaned;
    return `${cleaned} --tile --ar 1:1`;
  }

  private buildFallbackPrompt(subject: string, equirectangular: boolean): string {
    if (equirectangular) {
      return `${subject}, highly detailed environment texture, seamless horizontal continuity, full frame, neutral diffused lighting, no directional shadows, production-ready equirectangular environment map --ar 2:1`;
    }

    return `${subject}, highly detailed material surface, seamless texture, tileable in all directions, repeating pattern, 1:1 aspect ratio (square), offset filter ready, full frame, no directional shadows, flat lighting, soft diffused light, physically plausible roughness and micro-structure --tile --ar 1:1`;
  }
}
