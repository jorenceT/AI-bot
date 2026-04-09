import { Injectable } from '@angular/core';
import { TtsService, TtsOptions } from './tts.interface';
import { GeminiTtsService, GeminiTtsConfig } from './gemini-tts.service';

@Injectable({
  providedIn: 'root'
})
export class TtsFactoryService {
  constructor(private geminiTts: GeminiTtsService) {}

  async speak(options: TtsOptions): Promise<void> {
    return this.geminiTts.speak(options);
  }

  async stop(): Promise<void> {
    return this.geminiTts.stop();
  }

  configureGemini(config: GeminiTtsConfig): void {
    this.geminiTts.setConfig(config);
  }

  getCurrentService(): TtsService {
    return this.geminiTts;
  }
}
