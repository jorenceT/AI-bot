import { Injectable } from '@angular/core';
import { AiService } from './ai.interface';
import { GeminiAiService } from './gemini-ai.service';
import { WebLLMAiService } from './webllm-ai.service';
import { Character } from '../../models/ai.models';

export type AiProvider = 'gemini' | 'webllm';

@Injectable({
  providedIn: 'root'
})
export class AiFactoryService {
  private currentProvider: AiProvider = 'webllm';
  private services: Map<AiProvider, AiService> = new Map();

  constructor(
    private geminiAi: GeminiAiService,
    private webllmAi: WebLLMAiService
  ) {
    this.services.set('gemini', this.geminiAi);
    this.services.set('webllm', this.webllmAi);
  }

  setProvider(provider: AiProvider): void {
    this.currentProvider = provider;
  }

  getProvider(): AiProvider {
    return this.currentProvider;
  }

  getCurrentService(): AiService {
    const service = this.services.get(this.currentProvider);
    if (!service) {
      throw new Error(`AI service not found: ${this.currentProvider}`);
    }
    return service;
  }

  async sendMessage(text: string, character: Character): Promise<string> {
    const service = this.getCurrentService();
    const isAvailable = await service.isAvailable();
    
    if (!isAvailable) {
      const fallback = this.services.get('webllm');
      if (fallback && await fallback.isAvailable()) {
        return fallback.sendMessage(text, character);
      }
      throw new Error(`AI provider ${this.currentProvider} is not available`);
    }

    return service.sendMessage(text, character);
  }

  async generateGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string> {
    const service = this.getCurrentService();
    const isAvailable = await service.isAvailable();
    
    if (!isAvailable) {
      const fallback = this.services.get('webllm');
      if (fallback && await fallback.isAvailable()) {
        return fallback.generateGreeting(character, userName, recentTopics);
      }
      throw new Error(`AI provider ${this.currentProvider} is not available`);
    }

    return service.generateGreeting(character, userName, recentTopics);
  }

  async generateCharacterPersona(figure: { title: string; description?: string; extract?: string }): Promise<Partial<Character> | null> {
    const service = this.getCurrentService();
    return service.generateCharacterPersona(figure);
  }

  configureGemini(config: { apiKeys: string[]; backendBaseUrl?: string; preferBackend: boolean }): void {
    this.geminiAi.setConfig(config);
  }

  hasGeminiCapacity(requiredRequests = 1, reservedForChat = 2): boolean {
    return this.geminiAi.hasCapacity(requiredRequests, reservedForChat);
  }

  getAvailableProviders(): AiProvider[] {
    return Array.from(this.services.keys());
  }
}