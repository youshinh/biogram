import { postBackendJson } from '../api/backend-client';

export type TextureImageResult = {
  dataUrl: string;
  mimeType: string;
  modelUsed: string;
};

type TextureImageOptions = {
  aspectRatio?: '1:1';
  imageSize?: '1K' | '2K';
};

export class TextureImageGenerator {
  constructor() {}

  async generateTextureImage(
    prompt: string,
    options: TextureImageOptions = {}
  ): Promise<TextureImageResult> {
    const safePrompt = prompt.trim();
    if (!safePrompt) {
      return {
        dataUrl: this.generateFallbackTexture('organic texture'),
        mimeType: 'image/png',
        modelUsed: 'procedural-fallback'
      };
    }

    const aspectRatio = options.aspectRatio ?? '1:1';
    const imageSize = options.imageSize ?? '1K';

    try {
      return await postBackendJson<TextureImageResult>('/api/ai/texture-image', {
        prompt: safePrompt,
        options: {
          aspectRatio,
          imageSize
        }
      });
    } catch (error) {
      console.warn('[TextureImageGenerator] API generation failed', error);
    }

    return {
      dataUrl: this.generateFallbackTexture(safePrompt),
      mimeType: 'image/png',
      modelUsed: 'procedural-fallback'
    };
  }

  private generateFallbackTexture(seedText: string): string {
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return '';
    }

    const seed = this.hash(seedText);
    const c1 = `hsl(${seed % 360} 68% 44%)`;
    const c2 = `hsl(${(seed + 120) % 360} 72% 30%)`;
    const c3 = `hsl(${(seed + 220) % 360} 58% 16%)`;

    const gradient = ctx.createLinearGradient(0, 0, size, size);
    gradient.addColorStop(0, c1);
    gradient.addColorStop(0.5, c2);
    gradient.addColorStop(1, c3);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    const f1 = 3 + (seed % 5);
    const f2 = 5 + ((seed >> 3) % 7);
    const f3 = 7 + ((seed >> 6) % 11);
    const phaseA = (seed % 628) / 100;
    const phaseB = ((seed >> 4) % 628) / 100;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = (x / size) * Math.PI * 2;
        const v = (y / size) * Math.PI * 2;
        const wave =
          Math.sin(u * f1 + phaseA) +
          Math.cos(v * f2 + phaseB) +
          Math.sin((u + v) * f3 + phaseA * 0.7);
        const n = Math.max(0, Math.min(1, (wave + 3) / 6));
        const idx = (y * size + x) * 4;
        data[idx] = Math.min(255, data[idx] * (0.7 + n * 0.8));
        data[idx + 1] = Math.min(255, data[idx + 1] * (0.7 + n * 0.7));
        data[idx + 2] = Math.min(255, data[idx + 2] * (0.7 + n * 0.9));
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  }

  private hash(text: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
}
