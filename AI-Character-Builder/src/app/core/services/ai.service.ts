import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject, throwError } from 'rxjs';
import { Message, Character } from '../models/ai.models';
import { CharacterService } from './character.service';

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
  private apiKey = '';
  private messages$ = new Subject<Message>();

  constructor(
    private http: HttpClient,
    private characterService: CharacterService
  ) {
    this.initializeApiKey();
  }

  private initializeApiKey(): void {
    this.apiKey = localStorage.getItem('geminiApiKey') || '';
  }

  setApiKey(key: string): void {
    this.apiKey = key;
    localStorage.setItem('geminiApiKey', key);
  }

  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  getMessages(): Observable<Message> {
    return this.messages$.asObservable();
  }

  async sendMessage(text: string, activeCharacterId: string, characterData: any): Promise<string> {
    if (!this.apiKey) {
      throw new Error('Google Gemini API key not configured. Please set it in settings.');
    }

    try {
      const systemPrompt = characterData.systemPrompt || 'You are a helpful assistant.';
      const fullPrompt = `${systemPrompt}\n\nUser: ${text}`;

      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent`;

      const headers = new HttpHeaders({
        'Content-Type': 'application/json',
        'X-goog-api-key': this.apiKey
      });

      const request: GeminiRequest = {
        contents: [
          {
            parts: [
              {
                text: fullPrompt
              }
            ]
          }
        ]
      };

      const response = await this.http.post<GeminiResponse>(
        apiUrl,
        request,
        { headers }
      ).toPromise();

      if (response && response.candidates && response.candidates[0]) {
        const aiResponse = response.candidates[0].content.parts[0].text;
        return aiResponse.substring(0, 1000); // Limit response length
      }

      throw new Error('Invalid response from Gemini API');
    } catch (error: any) {
      console.error('AI Service Error:', error);
      if (this.isMinuteRateLimitError(error)) {
        throw new Error('Try after a minute u have reached ur limit for a minute');
      }
      throw new Error(`Failed to get AI response: ${error.message}`);
    }
  }

  async generateCharacterVoiceProfile(
    character: Character,
    availableVoices: Array<Pick<SpeechSynthesisVoice, 'name' | 'lang' | 'default'>>
  ): Promise<CharacterVoiceProfile | null> {
    if (!this.apiKey) {
      return null;
    }

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

  private async generateText(prompt: string): Promise<string> {
    const apiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';

    const headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-goog-api-key': this.apiKey
    });

    const request: GeminiRequest = {
      contents: [
        {
          parts: [
            {
              text: prompt
            }
          ]
        }
      ]
    };

    const response = await this.http.post<GeminiResponse>(
      apiUrl,
      request,
      { headers }
    ).toPromise();

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Invalid response from Gemini API');
    }

    return text;
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

  private isMinuteRateLimitError(error: any): boolean {
    const status = error?.status;
    const message = String(error?.message || '').toLowerCase();
    const body = JSON.stringify(error?.error || '').toLowerCase();

    return status === 429 || message.includes('429') || body.includes('429') || body.includes('rate limit') || body.includes('quota');
  }
}
