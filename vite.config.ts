import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { createApiGatewayMiddleware } from './server/api-gateway';


export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const serverGeminiApiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
    return {
      build: {
        rollupOptions: {
          output: {
            manualChunks(id) {
              if (!id.includes('node_modules')) return;
              if (id.includes('/three/')) return 'vendor-three';
              if (id.includes('/lit/')) return 'vendor-lit';
              if (id.includes('/@google/genai/')) return 'vendor-genai';
              if (id.includes('/idb/')) return 'vendor-idb';
              if (id.includes('/realtime-bpm-analyzer/')) return 'vendor-bpm';
            }
          }
        }
      },
      server: {
        port: 3000,
        host: '0.0.0.0',
        headers: {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
        },
      },
      plugins: [
        {
          name: 'biogram-api-gateway',
          configureServer(server) {
            server.middlewares.use(createApiGatewayMiddleware({
              geminiApiKey: serverGeminiApiKey
            }));
          },
          configurePreviewServer(server) {
            server.middlewares.use(createApiGatewayMiddleware({
              geminiApiKey: serverGeminiApiKey
            }));
          }
        }
      ],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, 'src'),
        }
      }
    };
});
