import { GoogleGenAI, ThinkingLevel } from '@google/genai';

export type PlannerModel =
  | 'gemini-flash-lite-latest'
  | 'gemini-3-flash-preview'
  | 'gemini-3-pro-preview'
  | 'template';

export type RoutedGenerationResult = {
  text: string;
  modelUsed: PlannerModel;
  fallbackReason?: string;
};

type GenerationRequest = {
  systemPrompt: string;
  userPrompt: string;
  timeoutMs?: number;
};

type ProProfile = 'low' | 'balanced';

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

  async generateMixPlanOnlyWithPro(
    req: GenerationRequest,
    buildTemplate: () => string
  ): Promise<RoutedGenerationResult> {
    const timeoutMs = req.timeoutMs ?? 30000;

    try {
      const proText = await this.generateWithModel('gemini-3-pro-preview', req, timeoutMs, 'low');
      return { text: proText, modelUsed: 'gemini-3-pro-preview' };
    } catch (proError) {
      console.warn('[ModelRouter] Gemini 3 Pro (low) failed, retrying balanced profile', proError);
      const firstMsg = proError instanceof Error ? proError.message : String(proError);

      try {
        const retryTimeoutMs = Math.max(timeoutMs, 45000);
        const retryText = await this.generateWithModel(
          'gemini-3-pro-preview',
          req,
          retryTimeoutMs,
          'balanced'
        );
        return { text: retryText, modelUsed: 'gemini-3-pro-preview' };
      } catch (retryError) {
        console.warn('[ModelRouter] Gemini 3 Pro (balanced) failed, using template fallback', retryError);
        const secondMsg = retryError instanceof Error ? retryError.message : String(retryError);
        return {
          text: buildTemplate(),
          modelUsed: 'template',
          fallbackReason: `gemini-3-pro-preview failed: first=${firstMsg} / retry=${secondMsg}`
        };
      }
    }
  }

  async generateMixPlanWithFlashPreview(
    req: GenerationRequest,
    buildTemplate: () => string
  ): Promise<RoutedGenerationResult> {
    const timeoutMs = req.timeoutMs ?? 30000;
    try {
      const text = await this.generateWithModel('gemini-3-flash-preview', req, timeoutMs);
      return { text, modelUsed: 'gemini-3-flash-preview' };
    } catch (flashErr) {
      const msg = flashErr instanceof Error ? flashErr.message : String(flashErr);
      return {
        text: buildTemplate(),
        modelUsed: 'template',
        fallbackReason: `gemini-3-flash-preview failed: ${msg}`
      };
    }
  }

  private async generateWithModel(
    model: Exclude<PlannerModel, 'template'>,
    req: GenerationRequest,
    timeoutMs: number,
    proProfile: ProProfile = 'low'
  ): Promise<string> {
    const config: any = {
      responseMimeType: 'application/json',
      systemInstruction: {
        parts: [{ text: req.systemPrompt }]
      }
    };

    // Apply high-thinking planner config only for Gemini 3 Pro mix planning.
    if (model === 'gemini-3-pro-preview') {
      if (proProfile === 'low') {
        config.temperature = 1.1;
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.LOW
        };
      } else {
        // Retry profile prioritizes response latency over maximal reasoning depth.
        config.temperature = 0.8;
        config.thinkingConfig = {
          thinkingLevel: ThinkingLevel.MEDIUM
        };
      }
    }

    const response = await this.withTimeout(
      this.ai.models.generateContent({
        model,
        config,
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
