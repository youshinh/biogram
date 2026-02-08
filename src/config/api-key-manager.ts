const API_KEY_STORAGE_KEY = 'biogram.gemini_api_key';

export class ApiKeyManager {
  private fallbackKey: string;

  constructor(fallbackKey: string = '') {
    this.fallbackKey = fallbackKey.trim();
  }

  public getApiKey(): string {
    const stored = this.getStoredApiKey();
    if (stored) return stored;
    return this.fallbackKey;
  }

  public hasApiKey(): boolean {
    return this.getApiKey().length > 0;
  }

  public setApiKey(apiKey: string): void {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
  }

  public clearApiKey(): void {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
  }

  public getStoredApiKey(): string {
    return (localStorage.getItem(API_KEY_STORAGE_KEY) || '').trim();
  }
}
