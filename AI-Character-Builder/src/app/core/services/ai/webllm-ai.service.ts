import { Injectable } from '@angular/core';
import { AiService } from './ai.interface';
import { Character } from '../../models/ai.models';
import { WebLLMService } from '../webllm.service';

@Injectable({
  providedIn: 'root'
})
export class WebLLMAiService implements AiService {
  constructor(private webllmService: WebLLMService) {}

  async sendMessage(text: string, character: Character): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('WebLLM not available');
    }

    if (!this.webllmService.isWebGPUSupported()) {
      throw new Error('WebGPU not supported in this browser');
    }

    if (!this.webllmService.isModelLoaded()) {
      await this.webllmService.initializeModel('gemma3');
    }

    const systemPrompt = character.systemPrompt || 'You are a helpful assistant.';
    const response = await this.webllmService.sendMessage(text, systemPrompt, {
      temperature: 0.6,
      maxTokens: 256,
      topP: 0.85
    });

    return response.text.substring(0, 800);
  }

  async generateGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string> {
    if (!await this.isAvailable()) {
      throw new Error('WebLLM not available');
    }

    if (!this.webllmService.isWebGPUSupported()) {
      throw new Error('WebGPU not supported in this browser');
    }

    if (!this.webllmService.isModelLoaded()) {
      await this.webllmService.initializeModel('gemma3');
    }

    const systemPrompt = character.systemPrompt || 'You are a helpful assistant.';
    const greetingPrompt = this.buildGreetingPrompt(character, userName, recentTopics);

    const response = await this.webllmService.sendMessage(greetingPrompt, systemPrompt, {
      temperature: 0.7,
      maxTokens: 128,
      topP: 0.9
    });

    return this.cleanGreetingText(response.text);
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
      if (!this.webllmService.isModelLoaded()) {
        await this.webllmService.initializeModel('gemma3');
      }

      const response = await this.webllmService.sendMessage(prompt, 'You are a helpful assistant.', {
        temperature: 0.6,
        maxTokens: 256,
        topP: 0.85
      });

      const parsed = this.extractJsonObject(response.text);
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
    return this.webllmService.isWebGPUSupported();
  }

  getName(): string {
    return 'webllm';
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