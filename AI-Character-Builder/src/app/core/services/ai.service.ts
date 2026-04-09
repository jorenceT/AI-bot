import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { Character, Message } from '../models/ai.models';
import { environment } from '../../../environments/environment';

export interface CharacterVoiceProfile {
  voiceHints: string[];
  langHints: string[];
  rate: number;
  pitch: number;
  volume: number;
}

interface BackendTextResponse {
  text?: string;
  error?: string;
}

interface VoiceCatalogItem {
  name: string;
  lang: string;
  default: boolean;
}

interface BackendVoiceProfileResponse {
  profile?: CharacterVoiceProfile | null;
  error?: string;
}

interface BackendCharacterPersonaResponse {
  persona?: Partial<Character> | null;
  error?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AIService {
  private static readonly PERSONAL_API_KEYS_STORAGE_KEY = 'geminiApiKeys';
  private static readonly DEFAULT_GEMINI_MODEL = 'gemma-3-27b-it';
  private static readonly DEFAULT_HELPER_MODEL = 'gemma-3-27b-it';
  private messages$ = new Subject<Message>();
  private personalApiKeys: string[] = [];

  constructor(private http: HttpClient) {
    this.initializeConfig();
  }

  private initializeConfig(): void {
    const legacyKey = (localStorage.getItem('geminiApiKey') || '').trim();
    const storedKeys = this.readStoredPersonalApiKeys();
    this.setPersonalApiKeys(storedKeys.length ? storedKeys : (legacyKey ? [legacyKey] : []));
  }

  getMessages(): Observable<Message> {
    return this.messages$.asObservable();
  }

  setApiKey(key: string): void {
    this.setPersonalApiKeys(key ? [key] : []);
  }

  clearApiKey(): void {
    this.setPersonalApiKeys([]);
  }

  setPersonalApiKeys(keys: string[]): void {
    const normalized = Array.from(new Set(keys.map(key => String(key || '').trim()).filter(Boolean)));
    this.personalApiKeys = normalized;
    if (normalized.length) {
      localStorage.setItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY, JSON.stringify(normalized));
      localStorage.setItem('geminiApiKey', normalized[0]);
    } else {
      localStorage.removeItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY);
      localStorage.removeItem('geminiApiKey');
    }
  }

  getPersonalApiKeys(): string[] {
    return [...this.personalApiKeys];
  }

  hasPersonalApiKey(): boolean {
    return this.personalApiKeys.length > 0;
  }

  hasApiKey(): boolean {
    return this.hasPersonalApiKey();
  }

  isBackendAiPreferred(): boolean {
    return false;
  }

  getBackendBaseUrl(): string {
    return '';
  }

  setBackendConfig(baseUrl: string, preferBackendAi: boolean): void {
    void baseUrl;
    void preferBackendAi;
  }

  async sendMessage(text: string, activeCharacterId: string, characterData: any): Promise<string> {
    const systemPrompt = characterData?.systemPrompt || 'You are a helpful assistant.';
    const fullPrompt = `${systemPrompt}\n\nUser: ${text}`;
    const response = await this.generateText(fullPrompt, AIService.DEFAULT_GEMINI_MODEL);
    return String(response || '').slice(0, 1000);
  }

  async generateGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string> {
    const prompt = [
      'Write one short in-character greeting for a returning user.',
      'Sound like the character, not a generic assistant.',
      'No AI mention. No markdown. No quotes.',
      'Keep it natural and under 45 words.',
      `User: ${userName || 'friend'}`,
      `Character: ${character?.name || 'not provided'}`,
      `Tone: ${this.limitText(character?.tone || 'warm', 90)}`,
      `Personality: ${this.limitText(character?.personality || 'distinctive', 120)}`,
      `Prompt hint: ${this.limitText(character?.systemPrompt || '', 180) || 'none'}`,
      `Recent chat topics: ${recentTopics.length ? recentTopics.join(' | ') : 'none'}`
    ].join('\n');
    const response = await this.generateText(prompt, AIService.DEFAULT_HELPER_MODEL);
    return String(response || '').trim();
  }

  async generateCharacterPersona(figure: { title: string; description?: string; extract?: string }): Promise<Partial<Character> | null> {
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
      const responseText = await this.generateText(prompt, AIService.DEFAULT_HELPER_MODEL);
      const parsed = this.extractJsonObject(responseText);
      return parsed ? {
        name: figure.title,
        personality: String(parsed.personality || '').trim(),
        tone: String(parsed.tone || '').trim(),
        backstory: String(parsed.backstory || '').trim() || fallbackBackstory,
        systemPrompt: String(parsed.systemPrompt || '').trim()
      } : { name: figure.title, backstory: fallbackBackstory };
    } catch {
      return { name: figure.title, backstory: fallbackBackstory };
    }
  }

  async generateCharacterPersonaFromKnownFigure(figure: { title: string; description?: string; extract?: string }): Promise<Partial<Character> | null> {
    return this.generateCharacterPersona(figure);
  }

  async generateCharacterVoiceProfile(character: Character, availableVoices: SpeechSynthesisVoice[] | VoiceCatalogItem[]): Promise<CharacterVoiceProfile | null> {
    try {
      const voiceCatalog = availableVoices.slice(0, 50).map(voice => ({
        name: voice.name,
        lang: voice.lang,
        default: voice.default
      }));
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
      const responseText = await this.generateText(prompt, AIService.DEFAULT_HELPER_MODEL);
      const parsed = this.extractJsonObject(responseText);
      return parsed ? {
        voiceHints: Array.isArray(parsed.voiceHints) ? parsed.voiceHints.slice(0, 6).map((item: unknown) => String(item)) : [],
        langHints: Array.isArray(parsed.langHints) ? parsed.langHints.slice(0, 3).map((item: unknown) => String(item)) : [],
        rate: this.clampNumber(parsed.rate, 0.85, 1.12, 1),
        pitch: this.clampNumber(parsed.pitch, 0.85, 1.18, 1),
        volume: this.clampNumber(parsed.volume, 0.9, 1, 1)
      } : null;
    } catch (error) {
      console.warn('Failed to generate character voice profile', error);
      return null;
    }
  }

  async generateCharacterVoiceProfileFromKnownFigure(character: Character, availableVoices: SpeechSynthesisVoice[] | VoiceCatalogItem[]): Promise<CharacterVoiceProfile | null> {
    return this.generateCharacterVoiceProfile(character, availableVoices);
  }

  getGeminiRateLimitStatus(): { used: number; remaining: number; retryAfterSeconds: number } {
    return { used: 0, remaining: this.hasApiKey() ? 999 : 0, retryAfterSeconds: 0 };
  }

  hasGeminiCapacity(_requiredRequests = 1, _reservedForChat = 2): boolean {
    return this.hasApiKey();
  }

  getLlmProvider(): 'gemini' | 'webllm' {
    return 'gemini';
  }

  setLlmProvider(_: 'gemini' | 'webllm'): void {}

  async generateCharacterGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string> {
    return this.generateGreeting(character, userName, recentTopics);
  }

  private async generateText(prompt: string, model: string): Promise<string> {
    const apiKey = this.getActiveApiKey();
    if (!apiKey) {
      throw new Error('Gemini API key not configured.');
    }

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini request failed (${response.status})`);
    }

    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned an empty response.');
    }
    return String(text);
  }

  private readStoredPersonalApiKeys(): string[] {
    try {
      const raw = localStorage.getItem(AIService.PERSONAL_API_KEYS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private normalizeBaseUrl(url: string): string {
    return String(url || '').trim().replace(/\/+$/, '');
  }

  private extractJsonObject(rawText: string): any | null {
    const cleaned = String(rawText || '').trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
  }

  private clampNumber(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.min(max, Math.max(min, parsed));
    }
    return fallback;
  }

  private getActiveApiKey(): string {
    return this.personalApiKeys[0] || '';
  }

  private limitText(text: string, maxLength: number): string {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
  }
}
