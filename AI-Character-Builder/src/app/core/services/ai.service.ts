import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { Message, Character } from '../models/ai.models';
import { environment } from '../../../environments/environment';
import { WebLLMService } from './webllm.service';

export type LlmProvider = 'gemini' | 'tinyllama';

interface GeminiContent {
  parts: { text: string }[];
}

interface GeminiRequest {
  contents: GeminiContent[];
}

interface GeminiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
    };
  }[];
}

interface BackendTextResponse {
  text?: string;
  error?: string;
}

interface BackendVoiceProfileResponse {
  profile?: CharacterVoiceProfile | null;
  error?: string;
}

interface BackendCharacterPersonaResponse {
  persona?: {
    personality?: string;
    tone?: string;
    backstory?: string;
    systemPrompt?: string;
  } | null;
  error?: string;
}

interface GeminiEmbeddingResponse {
  embedding: {
    values: number[];
  };
}


export interface CharacterVoiceProfile {
  voiceHints: string[];
  langHints: string[];
  rate: number;
  pitch: number;
  volume: number;
}

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private static readonly MAX_GEMINI_REQUESTS_PER_MINUTE = 14;
  private static readonly AI_CALL_DELAY_MS = 2000;
  private static readonly GREETING_CACHE_STORAGE_KEY = 'geminiGreetingCache';
  private static readonly GREETING_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
  private static readonly DEFAULT_EMBEDDING_MODEL = 'text-embedding-004';
  private static readonly DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';
  private static readonly HELPER_GEMINI_MODELS = ['gemini-flash-latest'];
  private static readonly PERSONAL_API_KEYS_STORAGE_KEY = 'geminiApiKeys';
  private static readonly BACKEND_BASE_URL_STORAGE_KEY = 'backendBaseUrl';
  private static readonly PREFER_BACKEND_AI_STORAGE_KEY = 'preferBackendAi';
  private static readonly LLM_PROVIDER_STORAGE_KEY = 'llmProvider';
  private static readonly TINYLLAMA_API_KEY_STORAGE_KEY = 'tinyllamaApiKey';
  private readonly requestTimestamps: number[] = [];
  private personalApiKeys: string[] = [];
  private readonly personalKeyRequestTimestamps: Record<string, number[]> = {};
  private readonly personalKeyCooldowns: Record<string, number> = {};
  private personalKeyCursor = 0;
  private messages$ = new Subject<Message>();
  private backendBaseUrl = '';
  private preferBackendAi = environment.preferBackendAi !== false;
  private llmProvider: LlmProvider = 'tinyllama';
  private tinyllamaApiKey = '';

  constructor(
    private http: HttpClient,
    private webllmService: WebLLMService
  ) {
    this.initializeApiKey();
  }

  private initializeApiKey(): void {
    const legacyKey = (localStorage.getItem('geminiApiKey') || '').trim();
    const storedKeys = this.readStoredPersonalApiKeys();
    const mergedKeys = storedKeys.length ? storedKeys : (legacyKey ? [legacyKey] : []);
    this.setPersonalApiKeys(mergedKeys);
    const storedBackendBaseUrl = localStorage.getItem(AIService.BACKEND_BASE_URL_STORAGE_KEY);
    const storedPreferBackendAi = localStorage.getItem(AIService.PREFER_BACKEND_AI_STORAGE_KEY);
    this.backendBaseUrl = this.normalizeBaseUrl(storedBackendBaseUrl ?? environment.backendBaseUrl ?? '');
    this.preferBackendAi = storedPreferBackendAi === null
      ? (environment.preferBackendAi !== false)
      : storedPreferBackendAi === 'true';

    const storedProvider = localStorage.getItem(AIService.LLM_PROVIDER_STORAGE_KEY) as LlmProvider | null;
    this.llmProvider = storedProvider === 'tinyllama' ? 'tinyllama' : 'gemini';
    this.tinyllamaApiKey = (localStorage.getItem(AIService.TINYLLAMA_API_KEY_STORAGE_KEY) || '').trim();
  }

  setApiKey(key: string): void {
    this.setPersonalApiKeys(key ? [key] : []);
  }

  clearApiKey(): void {
    this.personalApiKeys = [];
    this.personalKeyCursor = 0;
    localStorage.removeItem('geminiApiKey');
    localStorage.removeItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY);
  }

  setPersonalApiKeys(keys: string[]): void {
    const normalizedKeys = Array.from(new Set(
      keys
        .map(key => String(key || '').trim())
        .filter(Boolean)
    ));

    this.personalApiKeys = normalizedKeys;
    this.personalKeyCursor = 0;

    if (normalizedKeys.length) {
      localStorage.setItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY, JSON.stringify(normalizedKeys));
      localStorage.setItem('geminiApiKey', normalizedKeys[0]);
    } else {
      localStorage.removeItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY);
      localStorage.removeItem('geminiApiKey');
    }

    Object.keys(this.personalKeyRequestTimestamps).forEach(key => {
      if (!normalizedKeys.includes(key)) {
        delete this.personalKeyRequestTimestamps[key];
      }
    });

    Object.keys(this.personalKeyCooldowns).forEach(key => {
      if (!normalizedKeys.includes(key)) {
        delete this.personalKeyCooldowns[key];
      }
    });
  }

  getPersonalApiKeys(): string[] {
    return [...this.personalApiKeys];
  }

  hasPersonalApiKey(): boolean {
    return this.personalApiKeys.length > 0;
  }

  hasApiKey(): boolean {
    return this.isBackendConfigured() || this.hasPersonalApiKey();
  }

  isBackendConfigured(): boolean {
    return !!this.backendBaseUrl;
  }

  isBackendAiPreferred(): boolean {
    return this.preferBackendAi;
  }

  getBackendBaseUrl(): string {
    return this.backendBaseUrl;
  }

  setBackendConfig(baseUrl: string, preferBackendAi: boolean): void {
    this.backendBaseUrl = this.normalizeBaseUrl(baseUrl);
    this.preferBackendAi = !!preferBackendAi;
    localStorage.setItem(AIService.BACKEND_BASE_URL_STORAGE_KEY, this.backendBaseUrl);
    localStorage.setItem(AIService.PREFER_BACKEND_AI_STORAGE_KEY, JSON.stringify(this.preferBackendAi));
  }

  getMessages(): Observable<Message> {
    return this.messages$.asObservable();
  }

  getGeminiRateLimitStatus(): { used: number; remaining: number; retryAfterSeconds: number } {
    if (this.hasPersonalApiKey()) {
      const keyStatuses = this.personalApiKeys.map(key => this.getPersonalKeyRateLimitStatus(key));
      const bestStatus = keyStatuses.reduce((best, current) => current.remaining > best.remaining ? current : best, keyStatuses[0] || {
        used: AIService.MAX_GEMINI_REQUESTS_PER_MINUTE,
        remaining: 0,
        retryAfterSeconds: 60
      });

      return bestStatus;
    }

    const now = Date.now();
    this.pruneRequestTimestamps(now);

    const used = this.requestTimestamps.length;
    const remaining = Math.max(0, AIService.MAX_GEMINI_REQUESTS_PER_MINUTE - used);
    const retryAfterSeconds = used
      ? Math.max(1, Math.ceil((60000 - (now - this.requestTimestamps[0])) / 1000))
      : 0;

    return { used, remaining, retryAfterSeconds };
  }

  hasGeminiCapacity(requiredRequests = 1, reservedForChat = 2): boolean {
    if (!this.hasApiKey()) {
      return false;
    }

    const status = this.getGeminiRateLimitStatus();
    return status.remaining >= (requiredRequests + reservedForChat);
  }

  // ── LLM Provider selection ──────────────────────────────────────────────────

  getLlmProvider(): LlmProvider {
    return this.llmProvider;
  }

  setLlmProvider(provider: LlmProvider): void {
    this.llmProvider = provider;
    localStorage.setItem(AIService.LLM_PROVIDER_STORAGE_KEY, provider);
  }

  getTinyllamaApiKey(): string {
    return this.tinyllamaApiKey;
  }

  setTinyllamaApiKey(key: string): void {
    this.tinyllamaApiKey = (key || '').trim();
    if (this.tinyllamaApiKey) {
      localStorage.setItem(AIService.TINYLLAMA_API_KEY_STORAGE_KEY, this.tinyllamaApiKey);
    } else {
      localStorage.removeItem(AIService.TINYLLAMA_API_KEY_STORAGE_KEY);
    }
  }

  hasTinyllamaApiKey(): boolean {
    return !!this.tinyllamaApiKey;
  }

  /** Returns true when the currently selected provider is ready to handle requests. */
  hasActiveProviderKey(): boolean {
    if (this.llmProvider === 'tinyllama') {
      return this.hasTinyllamaApiKey();
    }
    return this.hasApiKey();
  }

  // ── Message sending ─────────────────────────────────────────────────────────

  async sendMessage(text: string, activeCharacterId: string, characterData: any): Promise<string> {
    if (this.llmProvider === 'tinyllama') {
      return this.sendMessageWithTinyLlama(text, characterData);
    }
    return this.sendMessageWithGemini(text, activeCharacterId, characterData);
  }

  private async sendMessageWithGemini(text: string, activeCharacterId: string, characterData: any): Promise<string> {
    if (!this.hasApiKey()) {
      throw new Error('AI backend or Google Gemini API key not configured. Please set it in settings.');
    }

    try {
      const systemPrompt = characterData.systemPrompt || 'You are a helpful assistant.';
      const fullPrompt = `${systemPrompt}\n\nUser: ${text}`;
      const aiResponse = await this.generateText(fullPrompt, {
        route: '/api/gemini/chat',
        body: {
          text,
          activeCharacterId,
          characterData
        }
      });
      return aiResponse.substring(0, 1000);
    } catch (error: any) {
      console.error('Gemini AI Service Error:', error);
      if (this.isMinuteRateLimitError(error)) {
        throw new Error('Gemini rate limit reached. Please wait a moment and try again.');
      }
      throw new Error(`Failed to get AI response: ${error.message}`);
    }
  }

  private async sendMessageWithTinyLlama(text: string, characterData: any): Promise<string> {
    const systemPrompt = characterData.systemPrompt || 'You are a helpful assistant.';

    // Use WebLLM for browser-based inference
    try {
      // Check if WebGPU is supported
      if (!this.webllmService.isWebGPUSupported()) {
        throw new Error('WebGPU is not supported in this browser. Please use Chrome or Edge with WebGPU enabled.');
      }

      // Initialize model if not already loaded
      if (!this.webllmService.isModelLoaded()) {
        await this.webllmService.initializeModel('tinyllama');
      }

      // Send message using WebLLM with optimized settings for speed
      const response = await this.webllmService.sendMessage(text, systemPrompt, {
        temperature: 0.6,  // Lower temperature for faster, more deterministic responses
        maxTokens: 256,    // Reduced from 512 for faster generation
        topP: 0.85         // Slightly lower for faster sampling
      });

      return response.text.substring(0, 800);  // Reduced max length for faster responses
    } catch (error: any) {
      console.error('TinyLlama WebLLM Error:', error);
      throw new Error(`TinyLlama error: ${error.message || 'Unknown error'}`);
    }
  }

  async generateCharacterVoiceProfile(
    character: Character,
    availableVoices: Array<Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default'>>
  ): Promise<CharacterVoiceProfile | null> {
    if (!this.hasApiKey() || !this.hasGeminiCapacity(1, 2)) {
      return null;
    }

    const voiceCatalog = availableVoices.slice(0, 50).map(voice => ({
      name: voice.name,
      lang: voice.lang,
      default: voice.default
    }));

    if (this.shouldUseBackend()) {
      try {
        this.enforceGeminiRateLimit();
        const response = await this.requestBackendWithRetry<BackendVoiceProfileResponse>(
          '/api/gemini/voice-profile',
          {
            character,
            availableVoices: voiceCatalog
          }
        );

        return response?.profile || null;
      } catch (error) {
        console.warn('Failed to generate character voice profile through backend', error);
        return null;
      }
    }

    const prompt = [
      'You are helping choose the most natural browser speech synthesis voice for a roleplay character.',
      'Given the character and available browser voices, return only strict JSON with this shape:',
      '{"voiceHints":["..."],"langHints":["..."],"rate":1.0,"pitch":1.0,"volume":1.0}',
      'Rules:',
      '- voiceHints: 2 to 6 short substrings to match against voice names, most important first.',
      '- langHints: 1 to 3 language hints such as "en-US" or "en-GB".',
      '- rate must be between 0.85 and 1.12 for natural speech.',
      '- pitch must be between 0.85 and 1.18 for natural speech.',
      '- volume must be between 0.9 and 1.0.',
      '- Prefer warm, natural, human-sounding voices over robotic ones.',
      '- Use the available voice list to influence voiceHints.',
      '',
      `Character name: ${character.name}`,
      `Personality: ${character.personality || 'not provided'}`,
      `Tone: ${character.tone || 'not provided'}`,
      `Backstory: ${character.backstory || 'not provided'}`,
      `System prompt: ${character.systemPrompt || 'not provided'}`,
      `Available voices: ${JSON.stringify(voiceCatalog)}`
    ].join('\n');

    try {
      const responseText = await this.generateText(prompt);
      const parsed = this.extractJsonObject(responseText);
      if (!parsed) {
        return null;
      }

      return {
        voiceHints: Array.isArray(parsed.voiceHints) ? parsed.voiceHints.slice(0, 6).map((item: unknown) => String(item)) : [],
        langHints: Array.isArray(parsed.langHints) ? parsed.langHints.slice(0, 3).map((item: unknown) => String(item)) : [],
        rate: this.clampNumber(parsed.rate, 0.85, 1.12, 1),
        pitch: this.clampNumber(parsed.pitch, 0.85, 1.18, 1),
        volume: this.clampNumber(parsed.volume, 0.9, 1, 1)
      };
    } catch (error) {
      console.warn('Failed to generate character voice profile', error);
      return null;
    }
  }

  async generateCharacterGreeting(
    character: Character,
    userName: string,
    recentTopics: string[]
  ): Promise<string> {
    if (!this.hasApiKey()) {
      throw new Error('AI backend or Google Gemini API key not configured. Please set it in settings.');
    }

    const cacheKey = this.buildGreetingCacheKey(character, userName, recentTopics);
    const cachedGreeting = this.getCachedGreeting(cacheKey);
    if (cachedGreeting) {
      return cachedGreeting;
    }

    const primaryPrompt = this.buildGreetingPrompt(character, userName, recentTopics, false);
    const greeting = await this.generateText(primaryPrompt, {
      route: '/api/gemini/greeting',
      body: {
        character,
        userName,
        recentTopics
      },
      modelPreference: 'helper',
      maxRetries: 0
    });
    const cleanedGreeting = this.cleanGreetingText(greeting);
    this.cacheGreeting(cacheKey, cleanedGreeting);
    return cleanedGreeting;
  }

  /**
   * Generates a vector representation (embedding) of the given text.
   * Note: This is used for similarity search or RAG, not for generating chat responses.
   */
  async embedText(text: string): Promise<number[]> {
    if (!this.hasApiKey()) {
      throw new Error('AI backend or Google Gemini API key not configured.');
    }

    const response = await this.requestDirectGeminiEmbeddingWithRetry(
      text,
      [AIService.DEFAULT_EMBEDDING_MODEL]
    );
    return response.embedding.values;
  }

  processUserMessage(userMessage: string, activeCharacterId: string): void {
    const newMessage: Message = {
      id: this.generateMessageId(),
      text: userMessage,
      sender: 'user',
      timestamp: new Date(),
      characterId: activeCharacterId
    };
    this.messages$.next(newMessage);
  }

  processAIMessage(aiText: string, activeCharacterId: string): void {
    const newMessage: Message = {
      id: this.generateMessageId(),
      text: aiText,
      sender: 'ai',
      timestamp: new Date(),
      characterId: activeCharacterId
    };
    this.messages$.next(newMessage);
  }

  private generateMessageId(): string {
    return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  private async generateText(
    prompt: string,
    backendRequest?: { route?: string; body?: Record<string, unknown>; modelPreference?: 'default' | 'helper'; isEmbedding?: boolean; maxRetries?: number }
  ): Promise<string> {
    this.enforceGeminiRateLimit();

    if (this.shouldUseBackend() && backendRequest?.route && backendRequest?.body) {
      const response = await this.requestBackendWithRetry<BackendTextResponse>(
        backendRequest.route,
        {
          ...backendRequest.body,
          modelPreference: backendRequest.modelPreference || 'default'
        },
        backendRequest.maxRetries
      );

      const text = response?.text;
      if (!text) {
        throw new Error(response?.error || 'Invalid response from AI backend');
      }

      return text;
    }

    const candidateModels = backendRequest?.modelPreference === 'helper'
      ? AIService.HELPER_GEMINI_MODELS
      : [AIService.DEFAULT_GEMINI_MODEL];

    return await this.requestDirectGeminiWithRetry(prompt, candidateModels, backendRequest?.maxRetries);
  }

  private shouldUseBackend(): boolean {
    return this.preferBackendAi && this.isBackendConfigured() && !this.hasPersonalApiKey();
  }

  private buildBackendHeaders(): HttpHeaders {
    let headers = new HttpHeaders({
      'Content-Type': 'application/json'
    });

    if (environment.backendAppId) {
      headers = headers.set('X-App-Id', environment.backendAppId);
    }

    if (environment.backendAppSecret) {
      headers = headers.set('X-App-Secret', environment.backendAppSecret);
    }

    return headers;
  }

  private normalizeBaseUrl(url: string): string {
    const normalized = String(url || '').trim().replace(/\/+$/, '');
    return normalized;
  }

  private async requestBackendWithRetry<T>(route: string, body: Record<string, unknown>, maxRetries = 2): Promise<T> {
    return await this.retryWithBackoff(async () => {
      const response = await this.http.post<T>(
        `${this.backendBaseUrl}${route}`,
        body,
        { headers: this.buildBackendHeaders() }
      ).toPromise();

      if (!response) {
        throw new Error('Empty response from AI backend');
      }

      return response;
    }, maxRetries);
  }

  private async requestDirectGeminiWithRetry(
    prompt: string,
    candidateModels: string[],
    maxRetries = 2
  ): Promise<string> {
    let lastError: any = null;

    for (const modelName of candidateModels) {
      const personalKeys = this.getOrderedAvailablePersonalApiKeys();
      if (!personalKeys.length) {
        throw new Error('All personal Gemini API keys are currently at their per-minute limit. Please wait a moment or add another key.');
      }

      for (const apiKey of personalKeys) {
        try {
          const responseText = await this.retryWithBackoff(async () => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent`;
            const headers = new HttpHeaders({
              'Content-Type': 'application/json',
              'X-goog-api-key': apiKey
            });
            const request: GeminiRequest = {
              contents: [{ parts: [{ text: prompt }] }]
            };

            this.reservePersonalKeyRequest(apiKey);
            try {
              const response = await this.http.post<GeminiResponse>(apiUrl, request, { headers }).toPromise();
              const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (!text) {
                throw new Error('Invalid response from Gemini API');
              }

              return text;
            } catch (error) {
              this.releasePersonalKeyReservation(apiKey);
              throw error;
            }
          }, maxRetries);

          this.personalKeyCursor = (this.personalApiKeys.indexOf(apiKey) + 1) % Math.max(1, this.personalApiKeys.length);
          return responseText;
        } catch (error: any) {
          lastError = error;
          if (this.isMinuteRateLimitError(error)) {
            this.markPersonalKeyRateLimited(apiKey, error);
            continue;
          }

          const status = error?.status;
          const message = String(error?.message || '').toLowerCase();
          const shouldTryNextModel = status === 400 || status === 404 || message.includes('not found') || message.includes('unsupported');
          if (!shouldTryNextModel) {
            break;
          }
        }
      }

      const statusMessage = String(lastError?.message || '').toLowerCase();
      const shouldContinueModelFallback = lastError?.status === 400 || lastError?.status === 404 || statusMessage.includes('not found') || statusMessage.includes('unsupported');
      if (!shouldContinueModelFallback) {
        break;
      }
    }

    throw lastError || new Error('Failed to get AI response');
  }

  private async requestDirectGeminiEmbeddingWithRetry(
    text: string,
    candidateModels: string[]
  ): Promise<GeminiEmbeddingResponse> {
    let lastError: any = null;

    for (const modelName of candidateModels) {
      const personalKeys = this.getOrderedAvailablePersonalApiKeys();
      if (!personalKeys.length) {
        throw new Error('All personal Gemini API keys are currently at their per-minute limit. Please wait a moment or add another key.');
      }

      for (const apiKey of personalKeys) {
        try {
          const responsePayload = await this.retryWithBackoff(async () => {
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:embedContent`;
            const headers = new HttpHeaders({
              'Content-Type': 'application/json',
              'X-goog-api-key': apiKey
            });
            const request = {
              content: {
                parts: [{ text }]
              }
            };

            this.reservePersonalKeyRequest(apiKey);
            try {
              const response = await this.http.post<GeminiEmbeddingResponse>(apiUrl, request, { headers }).toPromise();
              if (!response?.embedding?.values) {
                throw new Error('Invalid embedding response');
              }

              return response;
            } catch (error) {
              this.releasePersonalKeyReservation(apiKey);
              throw error;
            }
          });

          this.personalKeyCursor = (this.personalApiKeys.indexOf(apiKey) + 1) % Math.max(1, this.personalApiKeys.length);
          return responsePayload;
        } catch (error: any) {
          lastError = error;
          if (this.isMinuteRateLimitError(error)) {
            this.markPersonalKeyRateLimited(apiKey, error);
            continue;
          }

          const status = error?.status;
          const message = String(error?.message || '').toLowerCase();
          const shouldTryNextModel = status === 400 || status === 404 || message.includes('not found') || message.includes('unsupported');
          if (!shouldTryNextModel) {
            break;
          }
        }
      }

      const statusMessage = String(lastError?.message || '').toLowerCase();
      const shouldContinueModelFallback = lastError?.status === 400 || lastError?.status === 404 || statusMessage.includes('not found') || statusMessage.includes('unsupported');
      if (!shouldContinueModelFallback) {
        break;
      }
    }

    throw lastError || new Error('Failed to get embedding response');
  }

  private getOrderedAvailablePersonalApiKeys(): string[] {
    if (!this.personalApiKeys.length) {
      return [];
    }

    const rotatedKeys = this.personalApiKeys
      .slice(this.personalKeyCursor)
      .concat(this.personalApiKeys.slice(0, this.personalKeyCursor));

    return rotatedKeys.filter(key => this.getPersonalKeyRateLimitStatus(key).remaining > 0);
  }

  private getPersonalKeyRateLimitStatus(key: string): { used: number; remaining: number; retryAfterSeconds: number } {
    const now = Date.now();
    const timestamps = this.personalKeyRequestTimestamps[key] || [];
    const cooldownUntil = this.personalKeyCooldowns[key] || 0;
    const cutoff = now - 60000;

    while (timestamps.length && timestamps[0] <= cutoff) {
      timestamps.shift();
    }

    this.personalKeyRequestTimestamps[key] = timestamps;

    if (cooldownUntil > now) {
      return {
        used: AIService.MAX_GEMINI_REQUESTS_PER_MINUTE,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((cooldownUntil - now) / 1000))
      };
    }

    const used = timestamps.length;
    const remaining = Math.max(0, AIService.MAX_GEMINI_REQUESTS_PER_MINUTE - used);
    const retryAfterSeconds = used
      ? Math.max(1, Math.ceil((60000 - (now - timestamps[0])) / 1000))
      : 0;

    return { used, remaining, retryAfterSeconds };
  }

  private reservePersonalKeyRequest(key: string): void {
    const status = this.getPersonalKeyRateLimitStatus(key);
    if (status.remaining <= 0) {
      throw new Error(`Gemini requests are limited to 14 per minute. Please try again in ${status.retryAfterSeconds}s.`);
    }

    this.personalKeyRequestTimestamps[key].push(Date.now());
  }

  private releasePersonalKeyReservation(key: string): void {
    const timestamps = this.personalKeyRequestTimestamps[key];
    if (!timestamps?.length) {
      return;
    }

    timestamps.pop();
  }

  private markPersonalKeyRateLimited(key: string, error: any): void {
    const retryAfterSeconds = this.extractRetryAfterSeconds(error);
    this.personalKeyCooldowns[key] = Date.now() + (retryAfterSeconds * 1000);
  }

  private extractRetryAfterSeconds(error: any): number {
    const message = String(error?.message || '');
    const match = message.match(/try again in (\d+)s/i);
    if (match) {
      return Math.max(1, Number(match[1]));
    }

    return 60;
  }

  private readStoredPersonalApiKeys(): string[] {
    try {
      const raw = localStorage.getItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY);
      if (!raw) {
        return [];
      }

      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed.map(item => String(item || '').trim()).filter(Boolean);
    } catch {
      return [];
    }
  }

  private async retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 2): Promise<T> {
    let attempt = 0;
    let lastError: any = null;

    while (attempt <= maxRetries) {
      try {
        await this.sleep(AIService.AI_CALL_DELAY_MS);
        return await operation();
      } catch (error: any) {
        lastError = error;
        if (!this.isServiceUnavailableError(error) || attempt === maxRetries) {
          throw error;
        }

        const delayMs = 400 * Math.pow(2, attempt) + Math.floor(Math.random() * 150);
        await this.sleep(delayMs);
        attempt += 1;
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private pruneRequestTimestamps(now = Date.now()): void {
    const cutoff = now - 60000;

    while (this.requestTimestamps.length && this.requestTimestamps[0] <= cutoff) {
      this.requestTimestamps.shift();
    }
  }

  private extractJsonObject(rawText: string): any | null {
    const cleaned = rawText.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(num)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, num));
  }

  private enforceGeminiRateLimit(): void {
    const now = Date.now();
    this.pruneRequestTimestamps(now);

    if (this.requestTimestamps.length >= AIService.MAX_GEMINI_REQUESTS_PER_MINUTE) {
      const retryAfterMs = Math.max(1000, 60000 - (now - this.requestTimestamps[0]));
      const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
      throw new Error(`Gemini requests are limited to 14 per minute. Please try again in ${retryAfterSeconds}s.`);
    }

    this.requestTimestamps.push(now);
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  }

  private buildGreetingPrompt(
    character: Character,
    userName: string,
    recentTopics: string[],
    useFallback: boolean
  ): string {
    const instruction = useFallback
      ? 'Write one very short in-character greeting for a returning user.'
      : 'Write one short in-character greeting for a returning user.';
    const characterName = this.limitText(character.name || 'the character', 60);
    const styleHint = this.limitText(character.systemPrompt || character.tone || character.personality || '', 120);

    return [
      instruction,
      `Consider this character: ${characterName}.`,
      styleHint ? `Style hint: ${styleHint}` : '',
      `User: ${userName || 'friend'}.`
    ].filter(Boolean).join(' ');
  }

  async generateCharacterPersonaFromKnownFigure(figure: {
    title: string;
    description?: string;
    extract?: string;
    sourceUrl?: string;
  }): Promise<Partial<Character> | null> {
    if (!this.hasApiKey()) {
      return null;
    }

    const fallbackBackstory = this.limitText(figure.extract || `${figure.title} is a well-known public figure.`, 520);

    if (this.shouldUseBackend()) {
      try {
        this.enforceGeminiRateLimit();
        const response = await this.requestBackendWithRetry<BackendCharacterPersonaResponse>(
          '/api/gemini/character-persona',
          { figure },
          0
        );

        const persona = response?.persona;
        if (!persona) {
          return {
            name: figure.title,
            backstory: fallbackBackstory
          };
        }

        return {
          name: figure.title,
          personality: String(persona.personality || '').trim(),
          tone: String(persona.tone || '').trim(),
          backstory: String(persona.backstory || '').trim() || fallbackBackstory,
          systemPrompt: String(persona.systemPrompt || '').trim()
        };
      } catch (error) {
        console.warn('Failed to generate character persona through backend', error);
        return {
          name: figure.title,
          backstory: fallbackBackstory
        };
      }
    }

    try {
      const prompt = [
        'Return strict JSON only.',
        'Create a concise roleplay persona from this known figure.',
        'JSON keys: personality, tone, backstory, systemPrompt.',
        'Keep each field short and natural.',
        `Figure: ${figure.title}`,
        `Description: ${figure.description || 'not provided'}`,
        `Summary: ${this.limitText(figure.extract || '', 900) || 'not provided'}`
      ].join('\n');

      const responseText = await this.generateText(prompt, {
        modelPreference: 'helper',
        maxRetries: 0
      });
      const parsed = this.extractJsonObject(responseText);
      if (!parsed) {
        return {
          name: figure.title,
          backstory: fallbackBackstory
        };
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
      return {
        name: figure.title,
        backstory: fallbackBackstory
      };
    }
  }

  private cleanGreetingText(greeting: string): string {
    return greeting
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 280);
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
    const body = JSON.stringify(error?.error || '').toLowerCase();

    return status === 503 || message.includes('503') || message.includes('unavailable') || body.includes('503') || body.includes('unavailable');
  }

  private limitText(text: string, maxLength: number): string {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
  }

  private buildGreetingCacheKey(character: Character, userName: string, recentTopics: string[]): string {
    const fingerprint = JSON.stringify({
      userName: (userName || '').trim().toLowerCase(),
      characterName: (character.name || '').trim().toLowerCase(),
      tone: this.limitText(character.tone || '', 120).toLowerCase(),
      personality: this.limitText(character.personality || '', 160).toLowerCase(),
      systemPrompt: this.limitText(character.systemPrompt || '', 200).toLowerCase(),
      recentTopics: recentTopics.map(topic => this.limitText(topic, 40).toLowerCase())
    });

    return this.hashString(fingerprint);
  }

  private getCachedGreeting(cacheKey: string): string | null {
    try {
      const raw = localStorage.getItem(AIService.GREETING_CACHE_STORAGE_KEY);
      if (!raw) {
        return null;
      }

      const cache = JSON.parse(raw) as Record<string, { text: string; expiresAt: number }>;
      const entry = cache?.[cacheKey];
      if (!entry || !entry.text || !entry.expiresAt || entry.expiresAt <= Date.now()) {
        return null;
      }

      return entry.text;
    } catch {
      return null;
    }
  }

  private cacheGreeting(cacheKey: string, text: string): void {
    try {
      const raw = localStorage.getItem(AIService.GREETING_CACHE_STORAGE_KEY);
      const cache = raw ? JSON.parse(raw) as Record<string, { text: string; expiresAt: number }> : {};
      cache[cacheKey] = {
        text,
        expiresAt: Date.now() + AIService.GREETING_CACHE_TTL_MS
      };
      localStorage.setItem(AIService.GREETING_CACHE_STORAGE_KEY, JSON.stringify(cache));
    } catch {
      // ignore cache persistence failures
    }
  }

  private hashString(input: string): string {
    let hash = 0;
    for (let index = 0; index < input.length; index++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(index);
      hash |= 0;
    }

    return String(hash);
  }
}
