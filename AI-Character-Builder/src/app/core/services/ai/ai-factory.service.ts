import { Injectable } from '@angular/core';
import { AiService } from './ai.interface';
import { GeminiAiService } from './gemini-ai.service';
import { Character } from '../../models/ai.models';

export type AiProvider = 'gemini';

@Injectable({
  providedIn: 'root'
})
export class AiFactoryService {
  constructor(private geminiAi: GeminiAiService) {}

  setProvider(_: AiProvider): void {}
  getProvider(): AiProvider { return 'gemini'; }
  getCurrentService(): AiService { return this.geminiAi; }

  async sendMessage(text: string, character: Character): Promise<string> {
    return this.geminiAi.sendMessage(text, character);
  }

  async generateGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string> {
    return this.geminiAi.generateGreeting(character, userName, recentTopics);
  }

  async generateCharacterPersona(figure: { title: string; description?: string; extract?: string }): Promise<Partial<Character> | null> {
    return this.geminiAi.generateCharacterPersona(figure);
  }

  configureGemini(config: { apiKeys: string[] }): void {
    this.geminiAi.setConfig({ apiKeys: config.apiKeys, preferBackend: false });
  }

  hasGeminiCapacity(requiredRequests = 1, reservedForChat = 2): boolean {
    return this.geminiAi.hasCapacity(requiredRequests, reservedForChat);
  }

  getAvailableProviders(): AiProvider[] {
    return ['gemini'];
  }
}
