import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import { createApiGatewayMiddleware } from './server/api-gateway';


export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const serverGeminiApiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY || '';
    return {
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
