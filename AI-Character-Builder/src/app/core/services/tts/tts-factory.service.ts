import { Injectable } from '@angular/core';
import { TtsService, TtsOptions } from './tts.interface';
import { SystemTtsService } from './system-tts.service';
import { CapacitorTtsService } from './capacitor-tts.service';
import { GeminiTtsService, GeminiTtsConfig } from './gemini-tts.service';

export type TtsProvider = 'system' | 'capacitor' | 'gemini';

@Injectable({
  providedIn: 'root'
})
export class TtsFactoryService {
  private currentProvider: TtsProvider = 'system';
  private services: Map<TtsProvider, TtsService> = new Map();

  constructor(
    private systemTts: SystemTtsService,
    private capacitorTts: CapacitorTtsService,
    private geminiTts: GeminiTtsService
  ) {
    this.services.set('system', this.systemTts);
    this.services.set('capacitor', this.capacitorTts);
    this.services.set('gemini', this.geminiTts);
  }

  setProvider(provider: TtsProvider): void {
    this.currentProvider = provider;
  }

  getProvider(): TtsProvider {
    return this.currentProvider;
  }

  getCurrentService(): TtsService {
    const service = this.services.get(this.currentProvider);
    if (!service) {
      throw new Error(`TTS service not found: ${this.currentProvider}`);
    }
    return service;
  }

  async speak(options: TtsOptions): Promise<void> {
    const service = this.getCurrentService();
    const isAvailable = await service.isAvailable();
    
    if (!isAvailable) {
      // Fallback to system TTS if current provider is not available
      const fallback = this.services.get('system');
      if (fallback && await fallback.isAvailable()) {
        return fallback.speak(options);
      }
      throw new Error(`TTS provider ${this.currentProvider} is not available`);
    }

    return service.speak(options);
  }

  async stop(): Promise<void> {
    const service = this.getCurrentService();
    return service.stop();
  }

  configureGemini(config: GeminiTtsConfig): void {
    this.geminiTts.setConfig(config);
  }

  getAvailableProviders(): TtsProvider[] {
    return Array.from(this.services.keys());
  }
}