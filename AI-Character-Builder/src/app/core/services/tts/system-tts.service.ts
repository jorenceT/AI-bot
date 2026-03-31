import { Injectable } from '@angular/core';
import { TtsService, TtsOptions } from './tts.interface';

@Injectable({
  providedIn: 'root'
})
export class SystemTtsService implements TtsService {
  private speechSynthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.speechSynthesis = window.speechSynthesis;
    }
  }

  async speak(options: TtsOptions): Promise<void> {
    const synth = this.speechSynthesis;
    if (!synth) {
      throw new Error('Speech synthesis not available');
    }

    this.stop();

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(options.text);
      utterance.lang = options.lang || 'en-US';
      utterance.rate = options.rate || 1;
      utterance.pitch = options.pitch || 1;
      utterance.volume = options.volume || 1;

      utterance.onend = () => {
        this.currentUtterance = null;
        resolve();
      };

      utterance.onerror = (event) => {
        this.currentUtterance = null;
        reject(new Error(`Speech synthesis error: ${event.error}`));
      };

      this.currentUtterance = utterance;
      synth.speak(utterance);
    });
  }

  async stop(): Promise<void> {
    if (this.speechSynthesis) {
      this.speechSynthesis.cancel();
      this.currentUtterance = null;
    }
  }

  async isAvailable(): Promise<boolean> {
    return this.speechSynthesis !== null;
  }

  getName(): string {
    return 'system';
  }
}