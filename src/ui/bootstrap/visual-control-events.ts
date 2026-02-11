export type VisualControlEventsOptions = {
  vizControls: any;
  superCtrl: any;
  threeViz: any;
  engine: any;
  applyVisualMode: (mode: string, source?: 'ui' | 'plan' | 'fallback') => void;
  normalizeVisualModeAlias: (mode: string) => string;
  transitionPresetToType: (preset: string) => string | null;
  resolveTextureSubjectFromContext: () => { subject: string; primaryDeck: string };
  compactPrompt: (value: string) => string;
  getTexturePromptGen: () => { generatePrompt: (subject: string, opts: any) => Promise<string> };
  getTextureImageGen: () => { generateTextureImage: (prompt: string, opts: any) => Promise<{ dataUrl: string; modelUsed: string }> };
  setVisualFxConfig: (mode: 'OFF' | 'AUTO' | 'MANUAL', intensity: number) => void;
  triggerSceneFx: (reason: 'manual' | 'auto', bar: number) => void;
  getLastVisualFxBar: () => number;
  generateAiGridParams: (reason: 'manual' | 'mode-switch') => Promise<void>;
};

export const setupVisualControlEvents = (options: VisualControlEventsOptions) => {
  let autoTextureReqId = 0;

  const onTextureChange = (e: any) => {
    const { deck, url, type } = e.detail;
    options.threeViz.updateTexture(deck, url, type);
  };

  const onAutoTextureGenerate = async (e: any) => {
    const reqId = ++autoTextureReqId;
    options.vizControls.setAutoTextureState({
      generating: true,
      error: '',
      status: 'GENERATING...',
      model: ''
    });

    const ctx = options.resolveTextureSubjectFromContext();
    const keywordInput = options.compactPrompt(e?.detail?.keyword || '');
    const promptSubject = keywordInput || ctx.subject;
    const contextSource = keywordInput ? 'WORD INPUT' : `${ctx.primaryDeck} CONTEXT`;

    try {
      const texturePrompt = await options.getTexturePromptGen().generatePrompt(promptSubject, {
        detailLevel: 'high'
      });

      const image = await options.getTextureImageGen().generateTextureImage(texturePrompt, {
        aspectRatio: '1:1',
        imageSize: '1K'
      });

      if (reqId !== autoTextureReqId) return;
      options.vizControls.setAutoTextureState({
        generating: false,
        previewUrl: image.dataUrl,
        prompt: texturePrompt,
        status: `READY (${contextSource})`,
        error: '',
        model: image.modelUsed
      });
    } catch (error) {
      console.error('[Main] Auto texture generation failed:', error);
      if (reqId !== autoTextureReqId) return;
      options.vizControls.setAutoTextureState({
        generating: false,
        status: 'FAILED',
        error: 'AUTO TEXTURE FAILED',
        model: ''
      });
    }
  };

  const onWebcamToggle = (e: any) => {
    options.threeViz.toggleWebcam(e.detail.active);
  };

  const onColorRandom = (e: any) => {
    options.threeViz.randomizeColor(e.detail.deck);
  };

  const onVisualModeChange = (e: any) => {
    options.applyVisualMode(e.detail.mode, 'ui');
  };

  const onNextObject = (e: any) => {
    const targetMode = options.normalizeVisualModeAlias(String(e?.detail?.mode || 'organic'));
    const transitionType = options.transitionPresetToType(String(e?.detail?.transitionPreset || 'auto_matrix'));
    if (transitionType) {
      options.threeViz.setTransitionTypeOnce(transitionType);
    }
    options.applyVisualMode(targetMode, 'ui');
  };

  const onVisualFxConfig = (e: any) => {
    const mode = String(e?.detail?.mode || 'OFF').toUpperCase();
    const normalizedMode = mode === 'AUTO' || mode === 'MANUAL' ? mode : 'OFF';
    const intensity = Math.max(0, Math.min(1, Number(e?.detail?.intensity ?? 0.55)));
    options.setVisualFxConfig(normalizedMode as 'OFF' | 'AUTO' | 'MANUAL', intensity);
  };

  const onTransitionConfig = (e: any) => {
    const sec = Math.max(0.3, Math.min(3.0, Number(e?.detail?.fadeDurationSec ?? 1.0)));
    options.threeViz.setFadeTransitionDurationSec(sec);
  };

  const onVisualFxTrigger = () => {
    options.triggerSceneFx('manual', options.getLastVisualFxBar() + 8.1);
  };

  const onBlurChange = (e: any) => {
    options.threeViz.sendMessage('blurActive', e.detail.active);
    options.threeViz.sendMessage('blurFeedback', e.detail.feedback);
    options.threeViz.sendMessage('blurTint', e.detail.tint);
  };

  const onRenderToggle = (e: any) => {
    if (options.threeViz.setRendering) {
      options.threeViz.setRendering(e.detail.active);
      if (import.meta.env.DEV) console.log(`[Main] Visual Rendering: ${e.detail.active}`);
    }
  };

  const onVisualAiToggle = (e: any) => {
    options.engine.setAiAnalysisEnabled(e.detail.enabled);
  };

  const onAiGridTrigger = async () => {
    if (import.meta.env.DEV) console.log('[Main] Generating AI Grid Params...');
    await options.generateAiGridParams('manual');
  };

  options.vizControls.addEventListener('visual-texture-change', onTextureChange);
  options.vizControls.addEventListener('auto-texture-generate', onAutoTextureGenerate);
  options.vizControls.addEventListener('visual-webcam-toggle', onWebcamToggle);
  options.vizControls.addEventListener('visual-color-random', onColorRandom);
  options.vizControls.addEventListener('visual-mode-change', onVisualModeChange);
  options.vizControls.addEventListener('visual-next-object', onNextObject);
  options.vizControls.addEventListener('visual-fx-config', onVisualFxConfig);
  options.vizControls.addEventListener('visual-transition-config', onTransitionConfig);
  options.vizControls.addEventListener('visual-fx-trigger', onVisualFxTrigger);
  options.vizControls.addEventListener('visual-blur-change', onBlurChange);
  options.vizControls.addEventListener('visual-render-toggle', onRenderToggle);
  options.superCtrl.addEventListener('visual-ai-toggle', onVisualAiToggle);
  options.vizControls.addEventListener('ai-grid-gen-trigger', onAiGridTrigger);

  // Keep runtime aligned with SuperControls initial default.
  options.engine.setAiAnalysisEnabled(options.superCtrl.aiVisualsEnabled);

  return {
    dispose: () => {
      options.vizControls.removeEventListener('visual-texture-change', onTextureChange);
      options.vizControls.removeEventListener('auto-texture-generate', onAutoTextureGenerate);
      options.vizControls.removeEventListener('visual-webcam-toggle', onWebcamToggle);
      options.vizControls.removeEventListener('visual-color-random', onColorRandom);
      options.vizControls.removeEventListener('visual-mode-change', onVisualModeChange);
      options.vizControls.removeEventListener('visual-next-object', onNextObject);
      options.vizControls.removeEventListener('visual-fx-config', onVisualFxConfig);
      options.vizControls.removeEventListener('visual-transition-config', onTransitionConfig);
      options.vizControls.removeEventListener('visual-fx-trigger', onVisualFxTrigger);
      options.vizControls.removeEventListener('visual-blur-change', onBlurChange);
      options.vizControls.removeEventListener('visual-render-toggle', onRenderToggle);
      options.superCtrl.removeEventListener('visual-ai-toggle', onVisualAiToggle);
      options.vizControls.removeEventListener('ai-grid-gen-trigger', onAiGridTrigger);
    }
  };
};
