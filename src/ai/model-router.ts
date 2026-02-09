import { GoogleGenAI } from '@google/genai';

export type RoutedGenerationResult = {
  text: string;
  modelUsed: 'gemini-flash-lite-latest' | 'gemini-3-flash-preview' | 'template';
};

type GenerationRequest = {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
};

export class ModelRouter {
  private ai: GoogleGenAI;

  constructor(ai: GoogleGenAI) {
    this.ai = ai;
  }

  async generateWithFallback(
    req: GenerationRequest,
    buildTemplate: () => string
  ): Promise<RoutedGenerationResult> {
    const timeoutMs = req.timeoutMs ?? 20000;

    try {
      const liteText = await this.generateWithModel('gemini-flash-lite-latest', req, timeoutMs);
      return { text: liteText, modelUsed: 'gemini-flash-lite-latest' };
    } catch (liteError) {
      console.warn('[ModelRouter] Lite failed, retrying with Preview', liteError);
    }

    try {
      const previewText = await this.generateWithModel('gemini-3-flash-preview', req, timeoutMs);
      return { text: previewText, modelUsed: 'gemini-3-flash-preview' };
    } catch (previewError) {
      console.warn('[ModelRouter] Preview failed, using template fallback', previewError);
    }

    return { text: buildTemplate(), modelUsed: 'template' };
  }

  private async generateWithModel(
    model: 'gemini-flash-lite-latest' | 'gemini-3-flash-preview',
    req: GenerationRequest,
    timeoutMs: number
  ): Promise<string> {
    const response = await this.withTimeout(
      this.ai.models.generateContent({
        model,
        config: {
          responseMimeType: 'application/json',
          systemInstruction: {
            parts: [{ text: req.systemPrompt }]
          }
        },
        contents: [{
          role: 'user',
          parts: [{ text: req.userPrompt }]
        }]
      }),
      timeoutMs
    );

    const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
    if (!text) throw new Error(`Empty response from ${model}`);
    return text;
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout (${ms}ms)`)), ms))
    ]);
  }
}
