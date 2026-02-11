import { postBackendJson } from '../api/backend-client';

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
  constructor() {}

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
    const mode = model === 'gemini-3-pro-preview'
      ? 'mix-pro'
      : model === 'gemini-3-flash-preview'
        ? 'flash-preview'
        : 'lite';
    const response = await this.withTimeout(postBackendJson<{
      text: string;
      modelUsed: string;
    }>('/api/ai/route', {
      mode,
      proProfile,
      timeoutMs,
      systemPrompt: req.systemPrompt,
      userPrompt: req.userPrompt
    }), timeoutMs + 1_000);
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
