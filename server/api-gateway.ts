import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

type MiddlewareReq = {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  on: (event: 'data' | 'end' | 'error', cb: (arg?: any) => void) => void;
};

type MiddlewareRes = {
  statusCode: number;
  setHeader: (name: string, value: string | string[]) => void;
  end: (body?: string) => void;
};

type NextFn = () => void;

type SessionRecord = {
  issuedAt: number;
  csrf: string;
  expiresAt: number;
};

type RateRecord = {
  count: number;
  resetAt: number;
};

type CacheRecord<T> = {
  value: T;
  expiresAt: number;
};

const SESSION_COOKIE = 'bg_sid';
const CSRF_COOKIE = 'bg_csrf';
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const BODY_LIMIT_BYTES = 8 * 1024 * 1024;
const CLEANUP_INTERVAL_MS = 1000 * 60 * 10;

const ROUTE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  '/api/ai/route': { max: 40, windowMs: 60_000 },
  '/api/ai/grid': { max: 60, windowMs: 60_000 },
  '/api/ai/texture-prompt': { max: 60, windowMs: 60_000 },
  '/api/ai/texture-image': { max: 30, windowMs: 60_000 },
  '/api/ai/visual-analyze': { max: 20, windowMs: 60_000 },
};

const routeCache = new Map<string, CacheRecord<any>>();
const sessions = new Map<string, SessionRecord>();
const sessionRate = new Map<string, RateRecord>();
const ipRate = new Map<string, RateRecord>();

let lastCleanupAt = 0;

const GRID_SYSTEM_PROMPT = `
You are a Generative Visual Artist.
Your task is to generate a JSON configuration for a 3D Grid Visualizer ("AiDynamicGrid") based on the provided musical context.

# Output Schema (JSON)
{
    "geometry": {
        "shape": "sphere" | "torus" | "cylinder" | "wobble",
        "radius": number (1.0 - 5.0),
        "twist": number (-2.0 - 2.0)
    },
    "wave": {
        "func": "sine" | "sawtooth" | "noise" | "pulse",
        "frequency": number (1.0 - 10.0),
        "speed": number (0.1 - 5.0),
        "amplitude": number (0.0 - 2.0),
        "complexity": number (0.0 - 1.0)
    },
    "material": {
        "blurStrength": number (0.0 - 1.0),
        "coreOpacity": number (0.0 - 1.0),
        "glowOpacity": number (0.0 - 1.0),
        "color": string (Hex Color Code, e.g., "#FF00FF"),
        "secondaryColor": string (Hex Color Code, optional)
    }
}

# Archetypes based on Mood:
- **Energetic/Techno**: shape="sphere", wave="sawtooth", intensity high, color neon.
- **Ambient/Deep**: shape="torus", wave="sine", slow speed, blur high, color cool.
- **Glitch/IDM**: shape="wobble" or "cylinder", wave="noise", twist high, color high contrast.
- **Minimal**: shape="sphere", wave="pulse", low complexity, sharp lines (blur 0).

Output ONLY valid JSON.
`;

const TEXTURE_PROMPT_SYSTEM = `
You are an expert Technical Artist specializing in 3D Texturing and VR Environment generation.
Convert short user material ideas into one production-ready English prompt for texture image generation.

Output rules:
- Return exactly one line. No markdown, no explanation, no quotes.
- Default: strictly seamless 1:1 square texture map.
- Include these constraints when relevant:
  seamless texture, tileable in all directions, repeating pattern, 1:1 aspect ratio (square),
  offset filter ready, no directional shadows, flat lighting, highly detailed, full frame.
- Use neutral or soft diffused light and avoid cast shadows.
- Describe material details (roughness, reflectivity, micro-structure, subsurface scattering when relevant).
- End with technical suffix: --tile --ar 1:1
- If the user explicitly asks equirectangular environment map, switch to 2:1 and suffix: --ar 2:1
`;

const VISUAL_ANALYZE_PROMPT = `
Analyze this audio chunk (part of a continuous DJ mix) for real-time visual visualization.
Generate a JSON object containing a time-series analysis.

Structure:
{
  "bpm": number (estimate),
  "mood": string (e.g., "Energetic", "Dark", "Ethereal"),
  "timeline": [
    {
      "time": number (seconds from start of chunk),
      "energy": number (0.0-1.0),
      "brightness": number (0.0-1.0),
      "event": string ("NONE" | "KICK" | "SNARE" | "BUILD" | "DROP" | "BREAK")
    },
    ...
  ]
}

Output data roughly every 0.1 seconds.
`;

const IMAGE_MODELS = [
  'imagen-4.0-fast-generate-001',
  'imagen-4.0-generate-001',
  'imagen-3.0-generate-002',
] as const;

function json(res: MiddlewareRes, code: number, payload: unknown) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function parseCookies(header: string | string[] | undefined): Record<string, string> {
  const raw = Array.isArray(header) ? header.join(';') : (header || '');
  return raw.split(';').reduce<Record<string, string>>((acc, pair) => {
    const idx = pair.indexOf('=');
    if (idx <= 0) return acc;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function getHeader(req: MiddlewareReq, key: string): string {
  const v = req.headers[key.toLowerCase()];
  if (Array.isArray(v)) return v[0] || '';
  return v || '';
}

function readJsonBody<T>(req: MiddlewareReq, limitBytes = BODY_LIMIT_BYTES): Promise<T> {
  return new Promise((resolve, reject) => {
    let size = 0;
    let body = '';
    req.on('data', (chunk: Buffer | string) => {
      const s = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      size += s.length;
      if (size > limitBytes) {
        reject(new Error('Payload too large'));
        return;
      }
      body += s;
    });
    req.on('end', () => {
      if (!body.trim()) {
        resolve({} as T);
        return;
      }
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString('base64url');
}

function hash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function maybeCleanup(now: number) {
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [sid, session] of sessions.entries()) {
    if (session.expiresAt <= now) sessions.delete(sid);
  }
  for (const [k, rec] of sessionRate.entries()) {
    if (rec.resetAt <= now) sessionRate.delete(k);
  }
  for (const [k, rec] of ipRate.entries()) {
    if (rec.resetAt <= now) ipRate.delete(k);
  }
  for (const [k, rec] of routeCache.entries()) {
    if (rec.expiresAt <= now) routeCache.delete(k);
  }
}

function getClientIp(req: MiddlewareReq): string {
  const xff = getHeader(req, 'x-forwarded-for');
  const ip = xff.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
  return ip;
}

function applyRateLimit(
  map: Map<string, RateRecord>,
  key: string,
  max: number,
  windowMs: number,
  now: number
): boolean {
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

function timingSafeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function allowSameOriginOnly(req: MiddlewareReq): boolean {
  const host = getHeader(req, 'host');
  if (!host) return false;
  const validOrigins = new Set([`http://${host}`, `https://${host}`]);
  const origin = getHeader(req, 'origin');
  const referer = getHeader(req, 'referer');
  if (origin) return validOrigins.has(origin);
  if (referer) {
    try {
      const u = new URL(referer);
      return validOrigins.has(`${u.protocol}//${u.host}`);
    } catch {
      return false;
    }
  }
  return true;
}

async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const existing = routeCache.get(key);
  if (existing && existing.expiresAt > now) return existing.value as T;
  const value = await fn();
  routeCache.set(key, { value, expiresAt: now + ttlMs });
  return value;
}

function normalizePrompt(prompt: string, equirectangular: boolean): string {
  const cleaned = prompt.replace(/\s+/g, ' ').trim();
  if (equirectangular) {
    if (cleaned.includes('--ar 2:1')) return cleaned;
    return `${cleaned} --ar 2:1`;
  }
  if (cleaned.includes('--tile') && cleaned.includes('--ar 1:1')) return cleaned;
  return `${cleaned} --tile --ar 1:1`;
}

type GatewayOptions = {
  geminiApiKey?: string;
};

export function createApiGatewayMiddleware(options: GatewayOptions) {
  const apiKey = options.geminiApiKey?.trim() || '';
  const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

  return async (req: MiddlewareReq, res: MiddlewareRes, next: NextFn) => {
    const url = req.url || '';
    if (!url.startsWith('/api/')) {
      next();
      return;
    }

    const now = Date.now();
    maybeCleanup(now);

    if (!allowSameOriginOnly(req)) {
      json(res, 403, { error: 'Origin denied' });
      return;
    }

    const method = (req.method || 'GET').toUpperCase();
    if (method !== 'POST') {
      json(res, 405, { error: 'Method not allowed' });
      return;
    }

    const cookies = parseCookies(req.headers.cookie);

    if (url === '/api/session/bootstrap') {
      const sid = randomToken();
      const csrf = randomToken(18);
      sessions.set(sid, {
        issuedAt: now,
        csrf,
        expiresAt: now + SESSION_TTL_MS,
      });

      const secure = getHeader(req, 'x-forwarded-proto') === 'https';
      const common = `Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Strict`;
      const sidCookie = `${SESSION_COOKIE}=${encodeURIComponent(sid)}; HttpOnly; ${common}${secure ? '; Secure' : ''}`;
      const csrfCookie = `${CSRF_COOKIE}=${encodeURIComponent(csrf)}; ${common}${secure ? '; Secure' : ''}`;
      res.setHeader('Set-Cookie', [sidCookie, csrfCookie]);
      json(res, 200, { ok: true });
      return;
    }

    const sid = cookies[SESSION_COOKIE] || '';
    const session = sid ? sessions.get(sid) : undefined;
    if (!session || session.expiresAt <= now) {
      json(res, 403, { error: 'Invalid session' });
      return;
    }

    const csrfToken = getHeader(req, 'x-csrf-token');
    const csrfCookie = cookies[CSRF_COOKIE] || '';
    if (!csrfToken || !csrfCookie || !timingSafeEquals(csrfToken, csrfCookie) || !timingSafeEquals(csrfToken, session.csrf)) {
      json(res, 403, { error: 'CSRF failed' });
      return;
    }

    const limit = ROUTE_LIMITS[url] || { max: 60, windowMs: 60_000 };
    const ip = getClientIp(req);
    const allowedBySession = applyRateLimit(sessionRate, `${sid}:${url}`, limit.max, limit.windowMs, now);
    const allowedByIp = applyRateLimit(ipRate, `${ip}:${url}`, limit.max * 2, limit.windowMs, now);
    if (!allowedBySession || !allowedByIp) {
      json(res, 429, { error: 'Rate limit exceeded' });
      return;
    }

    if (!ai) {
      json(res, 503, { error: 'Server AI key is not configured (set GEMINI_API_KEY)' });
      return;
    }

    try {
      if (url === '/api/ai/route') {
        const body = await readJsonBody<{
          systemPrompt: string;
          userPrompt: string;
          timeoutMs?: number;
          mode?: 'lite' | 'flash-preview' | 'mix-pro';
          proProfile?: 'low' | 'balanced';
        }>(req);
        const mode = body.mode || 'lite';
        const timeoutMs = Math.max(5_000, Math.min(90_000, body.timeoutMs || 20_000));
        const profile = body.proProfile || 'low';
        const model =
          mode === 'mix-pro'
            ? 'gemini-3-pro-preview'
            : mode === 'flash-preview'
              ? 'gemini-3-flash-preview'
              : 'gemini-flash-lite-latest';
        const config: Record<string, any> = {
          responseMimeType: 'application/json',
          systemInstruction: { parts: [{ text: body.systemPrompt || '' }] },
        };
        if (model === 'gemini-3-pro-preview') {
          if (profile === 'low') {
            config.temperature = 1.1;
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
          } else {
            config.temperature = 0.8;
            config.thinkingConfig = { thinkingLevel: ThinkingLevel.MEDIUM };
          }
        }
        const cacheKey = hash(JSON.stringify(['route', model, profile, body.systemPrompt, body.userPrompt]));
        const result = await withCache(cacheKey, 90_000, async () => {
          const response = await Promise.race([
            ai.models.generateContent({
              model,
              config,
              contents: [{ role: 'user', parts: [{ text: body.userPrompt || '' }] }],
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`Timeout (${timeoutMs}ms)`)), timeoutMs)),
          ]);
          const text = response.text?.replace(/```json/g, '').replace(/```/g, '').trim();
          if (!text) throw new Error(`Empty response from ${model}`);
          return { text, modelUsed: model };
        });
        json(res, 200, result);
        return;
      }

      if (url === '/api/ai/grid') {
        const body = await readJsonBody<{ context: string }>(req);
        const context = (body.context || '').trim();
        const cacheKey = hash(JSON.stringify(['grid', context]));
        const result = await withCache(cacheKey, 10 * 60_000, async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            config: {
              systemInstruction: { parts: [{ text: GRID_SYSTEM_PROMPT }] },
              responseMimeType: 'application/json',
            },
            contents: [{ parts: [{ text: `Current Context: ${context}` }] }],
          });
          const text = response.text?.trim();
          return text ? JSON.parse(text) : null;
        });
        json(res, 200, { params: result });
        return;
      }

      if (url === '/api/ai/texture-prompt') {
        const body = await readJsonBody<{
          subject: string;
          options?: { requestEquirectangular?: boolean; detailLevel?: 'standard' | 'high' | 'ultra' };
        }>(req);
        const safeSubject = (body.subject || '').trim() || 'organic futuristic surface';
        const requestEquirectangular = !!body.options?.requestEquirectangular;
        const detailLevel = body.options?.detailLevel || 'high';
        const requestShape = requestEquirectangular
          ? 'Use equirectangular environment map constraints (2:1).'
          : 'Use seamless square texture constraints (1:1).';
        const userPrompt = `
Input concept: ${safeSubject}
Detail level: ${detailLevel}
${requestShape}
Generate a single English prompt for image generation.
`;
        const cacheKey = hash(JSON.stringify(['texture-prompt', safeSubject, requestEquirectangular, detailLevel]));
        const result = await withCache(cacheKey, 60 * 60_000, async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            config: {
              systemInstruction: { parts: [{ text: TEXTURE_PROMPT_SYSTEM }] },
            },
            contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          });
          const text = response.text?.trim();
          if (!text) throw new Error('Empty response');
          return normalizePrompt(text, requestEquirectangular);
        });
        json(res, 200, { prompt: result });
        return;
      }

      if (url === '/api/ai/texture-image') {
        const body = await readJsonBody<{
          prompt: string;
          options?: { aspectRatio?: '1:1'; imageSize?: '1K' | '2K' };
        }>(req);
        const prompt = (body.prompt || '').trim();
        if (!prompt) {
          json(res, 400, { error: 'prompt is required' });
          return;
        }
        const aspectRatio = body.options?.aspectRatio || '1:1';
        const imageSize = body.options?.imageSize || '1K';
        const cacheKey = hash(JSON.stringify(['texture-image', prompt, aspectRatio, imageSize]));
        const result = await withCache(cacheKey, 30 * 60_000, async () => {
          for (const model of IMAGE_MODELS) {
            try {
              const response = await ai.models.generateImages({
                model,
                prompt,
                config: {
                  numberOfImages: 1,
                  aspectRatio,
                  imageSize,
                  outputMimeType: 'image/png',
                },
              });
              const image = response.generatedImages?.[0]?.image;
              const imageBytes = image?.imageBytes;
              const mimeType = image?.mimeType || 'image/png';
              if (imageBytes) {
                return {
                  dataUrl: `data:${mimeType};base64,${imageBytes}`,
                  mimeType,
                  modelUsed: model,
                };
              }
            } catch {
              // continue
            }
          }
          throw new Error('All image models failed');
        });
        json(res, 200, result);
        return;
      }

      if (url === '/api/ai/visual-analyze') {
        const body = await readJsonBody<{ wavBase64: string }>(req);
        const wavBase64 = (body.wavBase64 || '').trim();
        if (!wavBase64) {
          json(res, 400, { error: 'wavBase64 is required' });
          return;
        }
        const cacheKey = hash(JSON.stringify(['visual', wavBase64.slice(0, 2048), wavBase64.length]));
        const result = await withCache(cacheKey, 60_000, async () => {
          const response = await ai.models.generateContent({
            model: 'gemini-flash-lite-latest',
            contents: [{
              parts: [
                { inlineData: { mimeType: 'audio/wav', data: wavBase64 } },
                { text: VISUAL_ANALYZE_PROMPT },
              ],
            }],
            config: {
              responseMimeType: 'application/json',
            },
          });
          const text = response.text?.trim();
          return text ? JSON.parse(text) : null;
        });
        json(res, 200, { analysis: result });
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      json(res, 500, { error: message });
    }
  };
}
