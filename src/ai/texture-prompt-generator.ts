import { postBackendJson } from '../api/backend-client';

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
