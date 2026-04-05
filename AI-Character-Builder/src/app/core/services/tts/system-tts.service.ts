import { Injectable } from '@angular/core';
import { TtsService, TtsOptions } from './tts.interface';

@Injectable({
  providedIn: 'root'
})
export class SystemTtsService implements TtsService {
  private speechSynthesis: SpeechSynthesis | null = null;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  // Cache of available voices
  private availableVoices: SpeechSynthesisVoice[] = [];

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.speechSynthesis = window.speechSynthesis;
      // Load voices (they may load asynchronously)
      this.loadVoices();
      if (this.speechSynthesis) {
        this.speechSynthesis.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices(): void {
    if (this.speechSynthesis) {
      this.availableVoices = this.speechSynthesis.getVoices() || [];
    }
  }

  /**
   * Find a voice that matches the options.voice parameter.
   * The voice can be specified as a voice name or voice name + language format.
   */
  private findVoice(voiceName?: string): SpeechSynthesisVoice | null {
    if (!voiceName || !this.availableVoices.length) {
      return null;
    }

    // Try exact match by name first
    let found = this.availableVoices.find(v => v.name === voiceName);
    if (found) return found;

    // Try match by "name (lang)" format
    found = this.availableVoices.find(v => `${v.name} (${v.lang})` === voiceName);
    if (found) return found;

    // Try partial name match
    found = this.availableVoices.find(v => v.name.toLowerCase().includes(voiceName.toLowerCase()));
    if (found) return found;

    return null;
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

      // Set voice if specified
      if (options.voice) {
        const voice = this.findVoice(options.voice);
        if (voice) {
          utterance.voice = voice;
          utterance.lang = voice.lang || utterance.lang;
        }
      }

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