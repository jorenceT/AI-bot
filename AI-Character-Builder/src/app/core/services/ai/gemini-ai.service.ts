import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { AiService, CharacterVoiceProfile } from './ai.interface';
import { Character } from '../../models/ai.models';
import { environment } from '../../../../environments/environment';

interface GeminiConfig {
  apiKeys: string[];
  backendBaseUrl?: string;
  preferBackend: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiAiService implements AiService {
  private static readonly MAX_REQUESTS_PER_MINUTE = 14;
  private static readonly AI_CALL_DELAY_MS = 2000;
  
  private config: GeminiConfig = {
    apiKeys: [],
    preferBackend: false
  };
  
  private requestTimestamps: number[] = [];
  private personalKeyRequestTimestamps: Record<string, number[]> = {};
  private personalKeyCooldowns: Record<string, number> = {};
  private personalKeyCursor = 0;

  constructor(private http: HttpClient) {}

  setConfig(config: GeminiConfig): void {
    this.config = config;
  }

  async sendMessage(text: string, character: Character): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('Gemini AI not available');
    }

    const systemPrompt = character.systemPrompt || 'You are a helpful assistant.';
    const fullPrompt = `${systemPrompt}\n\nUser: ${text}`;
    
    const response = await this.generateText(fullPrompt, {
      route: '/api/gemini/chat',
      body: { text, characterId: character.id, characterData: character }
    });

    return response.substring(0, 1000);
  }

  async generateGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('Gemini AI not available');
    }

    const prompt = this.buildGreetingPrompt(character, userName, recentTopics);
    const response = await this.generateText(prompt, {
      route: '/api/gemini/greeting',
      body: { character, userName, recentTopics },
      modelPreference: 'helper',
      maxRetries: 0
    });

    return this.cleanGreetingText(response);
  }

  async generateCharacterPersona(figure: { title: string; description?: string; extract?: string }): Promise<Partial<Character> | null> {
    if (!await this.isAvailable()) {
      return null;
    }

    const fallbackBackstory = this.limitText(figure.extract || `${figure.title} is a well-known public figure.`, 520);

    const prompt = [
      'Return strict JSON only.',
      'Create a concise roleplay persona from this known figure.',
      'JSON keys: personality, tone, backstory, systemPrompt.',
      'Keep each field short and natural.',
      `Figure: ${figure.title}`,
      `Description: ${figure.description || 'not provided'}`,
      `Summary: ${this.limitText(figure.extract || '', 900) || 'not provided'}`
    ].join('\n');

    try {
      const responseText = await this.generateText(prompt, {
        modelPreference: 'helper',
        maxRetries: 0
      });
      
      const parsed = this.extractJsonObject(responseText);
      if (!parsed) {
        return { name: figure.title, backstory: fallbackBackstory };
      }

      return {
        name: figure.title,
        personality: String(parsed.personality || '').trim(),
        tone: String(parsed.tone || '').trim(),
        backstory: String(parsed.backstory || '').trim() || fallbackBackstory,
        systemPrompt: String(parsed.systemPrompt || '').trim()
      };
    } catch (error) {
      console.warn('Failed to generate character persona', error);
      return { name: figure.title, backstory: fallbackBackstory };
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.config.apiKeys.length > 0 || !!this.config.backendBaseUrl;
  }

  getName(): string {
    return 'gemini';
  }

  hasCapacity(requiredRequests = 1, reservedForChat = 2): boolean {
    const status = this.getRateLimitStatus();
    return status.remaining >= (requiredRequests + reservedForChat);
  }

  getRateLimitStatus(): { used: number; remaining: number; retryAfterSeconds: number } {
    if (this.config.apiKeys.length > 0) {
      const keyStatuses = this.config.apiKeys.map(key => this.getPersonalKeyRateLimitStatus(key));
      return keyStatuses.reduce((best, current) => 
        current.remaining > best.remaining ? current : best, 
        keyStatuses[0] || { used: 0, remaining: 0, retryAfterSeconds: 60 }
      );
    }

    const now = Date.now();
    this.pruneRequestTimestamps(now);
    const used = this.requestTimestamps.length;
    const remaining = Math.max(0, GeminiAiService.MAX_REQUESTS_PER_MINUTE - used);
    const retryAfterSeconds = used ? Math.max(1, Math.ceil((60000 - (now - this.requestTimestamps[0])) / 1000)) : 0;

    return { used, remaining, retryAfterSeconds };
  }

  private async generateText(
    prompt: string,
    backendRequest?: { route?: string; body?: Record<string, unknown>; modelPreference?: string; maxRetries?: number }
  ): Promise<string> {
    this.enforceRateLimit();

    if (this.shouldUseBackend() && backendRequest?.route && backendRequest?.body) {
      const response = await this.requestBackendWithRetry<{ text?: string; error?: string }>(
        backendRequest.route,
        { ...backendRequest.body, modelPreference: backendRequest.modelPreference || 'default' },
        backendRequest.maxRetries
      );

      if (!response?.text) {
        throw new Error(response?.error || 'Invalid response from AI backend');
      }
      return response.text;
    }

    return await this.requestDirectGeminiWithRetry(prompt, backendRequest?.maxRetries);
  }

  private shouldUseBackend(): boolean {
    return this.config.preferBackend && !!this.config.backendBaseUrl && this.config.apiKeys.length === 0;
  }

  private async requestBackendWithRetry<T>(route: string, body: Record<string, unknown>, maxRetries = 2): Promise<T> {
    return this.retryWithBackoff(async () => {
      await this.sleep(GeminiAiService.AI_CALL_DELAY_MS);

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (environment.backendAppId) headers['X-App-Id'] = environment.backendAppId;
      if (environment.backendAppSecret) headers['X-App-Secret'] = environment.backendAppSecret;

      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.request({
          url: `${this.config.backendBaseUrl}${route}`,
          method: 'POST',
          headers,
          data: body,
          responseType: 'json'
        });
        return response.data as T;
      }

      const response = await this.http.post<T>(`${this.config.backendBaseUrl}${route}`, body, { headers }).toPromise();
      if (!response) throw new Error('Empty response from AI backend');
      return response;
    }, maxRetries);
  }

  private async requestDirectGeminiWithRetry(prompt: string, maxRetries = 2): Promise<string> {
    const personalKeys = this.getOrderedAvailablePersonalApiKeys();
    if (!personalKeys.length) {
      throw new Error('All personal Gemini API keys are at their per-minute limit');
    }

    let lastError: any = null;
    for (const apiKey of personalKeys) {
      try {
        const responseText = await this.retryWithBackoff(async () => {
          await this.sleep(GeminiAiService.AI_CALL_DELAY_MS);
          
          const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent';
          const headers = new HttpHeaders({
            'Content-Type': 'application/json',
            'X-goog-api-key': apiKey
          });
          const request = { contents: [{ parts: [{ text: prompt }] }] };

          this.reservePersonalKeyRequest(apiKey);
          try {
            const response = await this.http.post<any>(apiUrl, request, { headers }).toPromise();
            const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) throw new Error('Invalid response from Gemini API');
            return text;
          } catch (error) {
            this.releasePersonalKeyReservation(apiKey);
            throw error;
          }
        }, maxRetries);

        this.personalKeyCursor = (this.config.apiKeys.indexOf(apiKey) + 1) % Math.max(1, this.config.apiKeys.length);
        return responseText;
      } catch (error: any) {
        lastError = error;
        if (this.isMinuteRateLimitError(error)) {
          this.markPersonalKeyRateLimited(apiKey, error);
          continue;
        }
        break;
      }
    }

    throw lastError || new Error('Failed to get AI response');
  }

  private getOrderedAvailablePersonalApiKeys(): string[] {
    if (!this.config.apiKeys.length) return [];
    
    const rotatedKeys = [
      ...this.config.apiKeys.slice(this.personalKeyCursor),
      ...this.config.apiKeys.slice(0, this.personalKeyCursor)
    ];

    return rotatedKeys.filter(key => this.getPersonalKeyRateLimitStatus(key).remaining > 0);
  }

  private getPersonalKeyRateLimitStatus(key: string): { used: number; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const timestamps = this.personalKeyRequestTimestamps[key] || [];
    const cooldownUntil = this.personalKeyCooldowns[key] || 0;
    const cutoff = now - 60000;

    while (timestamps.length && timestamps[0] <= cutoff) timestamps.shift();
    this.personalKeyRequestTimestamps[key] = timestamps;

    if (cooldownUntil > now) {
      return {
        used: GeminiAiService.MAX_REQUESTS_PER_MINUTE,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((cooldownUntil - now) / 1000))
      };
    }

    const used = timestamps.length;
    const remaining = Math.max(0, GeminiAiService.MAX_REQUESTS_PER_MINUTE - used);
    const retryAfterSeconds = used ? Math.max(1, Math.ceil((60000 - (now - timestamps[0])) / 1000)) : 0;

    return { used, remaining, retryAfterSeconds };
  }

  private reservePersonalKeyRequest(key: string): void {
    const status = this.getPersonalKeyRateLimitStatus(key);
    if (status.remaining <= 0) {
      throw new Error(`Gemini requests limited to 14 per minute. Try again in ${status.retryAfterSeconds}s.`);
    }
    this.personalKeyRequestTimestamps[key].push(Date.now());
  }

  private releasePersonalKeyReservation(key: string): void {
    const timestamps = this.personalKeyRequestTimestamps[key];
    if (timestamps?.length) timestamps.pop();
  }

  private markPersonalKeyRateLimited(key: string, error: any): void {
    const retryAfterSeconds = this.extractRetryAfterSeconds(error);
    this.personalKeyCooldowns[key] = Date.now() + (retryAfterSeconds * 1000);
  }

  private extractRetryAfterSeconds(error: any): number {
    const message = String(error?.message || '');
    const match = message.match(/try again in (\d+)s/i);
    return match ? Math.max(1, Number(match[1])) : 60;
  }

  private enforceRateLimit(): void {
    const now = Date.now();
    this.pruneRequestTimestamps(now);

    if (this.requestTimestamps.length >= GeminiAiService.MAX_REQUESTS_PER_MINUTE) {
      const retryAfterMs = Math.max(1000, 60000 - (now - this.requestTimestamps[0]));
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      throw new Error(`Gemini requests limited to 14 per minute. Try again in ${retryAfterSeconds}s.`);
    }

    this.requestTimestamps.push(now);
  }

  private pruneRequestTimestamps(now: number): void {
    const cutoff = now - 60000;
    while (this.requestTimestamps.length && this.requestTimestamps[0] <= cutoff) {
      this.requestTimestamps.shift();
    }
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        await this.sleep(GeminiAiService.AI_CALL_DELAY_MS);
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!this.isServiceUnavailableError(error) || attempt === maxRetries) throw error;
        
        const delayMs = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
        await this.sleep(delayMs);
        attempt++;
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isMinuteRateLimitError(error: any): boolean {
    const status = error?.status;
    const message = String(error?.message || '').toLowerCase();
    const body = JSON.stringify(error?.error || '').toLowerCase();
    return status === 429 || message.includes('429') || body.includes('429') || body.includes('rate limit') || body.includes('quota');
  }

  private isServiceUnavailableError(error: any): boolean {
    const status = error?.status;
    const message = String(error?.message || '').toLowerCase();
    return status === 503 || message.includes('503') || message.includes('unavailable');
  }

  private buildGreetingPrompt(character: Character, userName: string, recentTopics: string[]): string {
    const characterName = this.limitText(character.name || 'the character', 60);
    const styleHint = this.limitText(character.systemPrompt || character.tone || character.personality || '', 120);

    return [
      'Write one short in-character greeting for a returning user.',
      `Consider this character: ${characterName}.`,
      styleHint ? `Style hint: ${styleHint}` : '',
      `User: ${userName || 'friend'}.`
    ].filter(Boolean).join(' ');
  }

  private cleanGreetingText(greeting: string): string {
    return greeting
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
  }

  private extractJsonObject(rawText: string): any | null {
    const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) return null;

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private limitText(text: string, maxLength: number): string {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
  }
}
