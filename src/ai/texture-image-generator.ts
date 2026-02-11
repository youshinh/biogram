import { postBackendJson } from '../api/backend-client';
import { getBrowserGenAI, withTimeout } from './client-genai';

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
      console.warn('[TextureImageGenerator] Backend route failed. Trying browser API key.', error);
    }

    try {
      const direct = await this.generateTextureImageDirect(safePrompt, aspectRatio, imageSize);
      if (direct) return direct;
    } catch (error) {
      console.warn('[TextureImageGenerator] Browser generation failed', error);
    }

    return {
      dataUrl: this.generateFallbackTexture(safePrompt),
      mimeType: 'image/png',
      modelUsed: 'procedural-fallback'
    };
  }

  private async generateTextureImageDirect(
    prompt: string,
    aspectRatio: '1:1',
    imageSize: '1K' | '2K'
  ): Promise<TextureImageResult | null> {
    const ai = getBrowserGenAI();
    if (!ai) return null;

    const models = [
      'imagen-4.0-fast-generate-001',
      'imagen-4.0-generate-001',
      'imagen-3.0-generate-002'
    ] as const;

    for (const model of models) {
      try {
        const response = await withTimeout(
          `texture-image-${model}`,
          ai.models.generateImages({
            model,
            prompt,
            config: {
              numberOfImages: 1,
              aspectRatio,
              imageSize,
              outputMimeType: 'image/png'
            }
          }),
          45_000
        );
        const image = response.generatedImages?.[0]?.image;
        const imageBytes = image?.imageBytes as string | Uint8Array | ArrayBuffer | undefined;
        if (!imageBytes) continue;
        const mimeType = image?.mimeType || 'image/png';
        const base64 = this.toBase64(imageBytes);
        return {
          dataUrl: `data:${mimeType};base64,${base64}`,
          mimeType,
          modelUsed: model
        };
      } catch {
        // Try next model.
      }
    }
    return null;
  }

  private toBase64(imageBytes: string | Uint8Array | ArrayBuffer): string {
    if (typeof imageBytes === 'string') return imageBytes;
    const bytes = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
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
