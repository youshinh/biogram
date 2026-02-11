import { GoogleGenAI } from '@google/genai';

const API_KEY_STORAGE_KEY = 'biogram.gemini_api_key';

let cachedKey = '';
let cachedClient: GoogleGenAI | null = null;

export const getBrowserApiKey = (): string => {
  let stored = '';
  try {
    stored = (localStorage.getItem(API_KEY_STORAGE_KEY) || '').trim();
  } catch {
    stored = '';
  }
  if (stored) return stored;
  return (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
};

export const getBrowserGenAI = (): GoogleGenAI | null => {
  const key = getBrowserApiKey();
  if (!key) return null;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new GoogleGenAI({ apiKey: key });
    cachedKey = key;
  }
  return cachedClient;
};

export const withTimeout = async <T>(label: string, promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${label} timeout (${ms}ms)`)), ms))
  ]);
};
