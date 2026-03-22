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
      throw new Error(`Failed to get AI response: ${error.message}`);
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
}
