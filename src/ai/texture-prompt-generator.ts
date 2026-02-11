import { postBackendJson } from '../api/backend-client';
import { getBrowserGenAI, withTimeout } from './client-genai';

export type TexturePromptOptions = {
  requestEquirectangular?: boolean;
  detailLevel?: 'standard' | 'high' | 'ultra';
};

export class TexturePromptGenerator {
  constructor() {}

  async generatePrompt(subject: string, options: TexturePromptOptions = {}): Promise<string> {
    const safeSubject = subject.trim() || 'organic futuristic surface';

    try {
      const response = await postBackendJson<{ prompt: string }>('/api/ai/texture-prompt', {
        subject: safeSubject,
        options
      });
      const text = response.prompt?.trim();
      if (!text) throw new Error('Empty response');
      return this.normalizePrompt(text, !!options.requestEquirectangular);
    } catch (error) {
      console.warn('[TexturePromptGenerator] Backend route failed. Trying browser API key.', error);
    }

    try {
      const text = await this.generatePromptDirect(safeSubject, options);
      if (text) {
        return this.normalizePrompt(text, !!options.requestEquirectangular);
      }
    } catch (error) {
      console.warn('[TexturePromptGenerator] Browser generation failed. Fallback prompt used.', error);
    }

    return this.buildFallbackPrompt(safeSubject, !!options.requestEquirectangular);
  }

  private async generatePromptDirect(subject: string, options: TexturePromptOptions): Promise<string> {
    const ai = getBrowserGenAI();
    if (!ai) throw new Error('No API key available for browser generation');

    const requestEquirectangular = !!options.requestEquirectangular;
    const detailLevel = options.detailLevel || 'high';
    const requestShape = requestEquirectangular
      ? 'Use equirectangular environment map constraints (2:1).'
      : 'Use seamless square texture constraints (1:1).';
    const userPrompt = `
Input concept: ${subject}
Detail level: ${detailLevel}
${requestShape}
Generate a single English prompt for image generation.
`;

    const response = await withTimeout(
      'texture-prompt',
      ai.models.generateContent({
        model: 'gemini-flash-lite-latest',
        config: {
          systemInstruction: {
            parts: [{
              text: `You are an expert Technical Artist specializing in 3D Texturing and VR Environment generation.
Return only one English prompt line, no markdown.
Default to seamless square texture constraints with --tile --ar 1:1.
If equirectangular is explicitly requested, use --ar 2:1.`
            }]
          }
        },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }]
      }),
      25_000
    );
    return response.text?.trim() || '';
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
