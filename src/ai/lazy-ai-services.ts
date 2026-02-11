import { AutomationEngine } from './automation-engine';
import { MixGenerator } from './mix-generator';
import { GridGenerator } from './grid-generator';
import { TexturePromptGenerator } from './texture-prompt-generator';
import { TextureImageGenerator } from './texture-image-generator';
import type { AudioEngine } from '../audio/engine';

export type LazyAiServices = {
  getAutoEngine: () => AutomationEngine;
  peekAutoEngine: () => AutomationEngine | null;
  getMixGen: () => MixGenerator;
  getGridGen: () => GridGenerator;
  getTexturePromptGen: () => TexturePromptGenerator;
  getTextureImageGen: () => TextureImageGenerator;
};

export const createLazyAiServices = (engine: AudioEngine): LazyAiServices => {
  let autoEngine: AutomationEngine | null = null;
  let mixGen: MixGenerator | null = null;
  let gridGen: GridGenerator | null = null;
  let texturePromptGen: TexturePromptGenerator | null = null;
  let textureImageGen: TextureImageGenerator | null = null;

  return {
    getAutoEngine: () => {
      autoEngine ??= new AutomationEngine(engine);
      return autoEngine;
    },
    peekAutoEngine: () => autoEngine,
    getMixGen: () => {
      mixGen ??= new MixGenerator();
      return mixGen;
    },
    getGridGen: () => {
      gridGen ??= new GridGenerator();
      return gridGen;
    },
    getTexturePromptGen: () => {
      texturePromptGen ??= new TexturePromptGenerator();
      return texturePromptGen;
    },
    getTextureImageGen: () => {
      textureImageGen ??= new TextureImageGenerator();
      return textureImageGen;
    }
  };
};
