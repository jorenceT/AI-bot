import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { TtsService, TtsOptions } from './tts.interface';

@Injectable({
  providedIn: 'root'
})
export class CapacitorTtsService implements TtsService {
  private isSpeaking = false;

  async speak(options: TtsOptions): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      throw new Error('Capacitor TTS only available on native platforms');
    }

    // Stop any ongoing speech before starting new one to prevent delay
    if (this.isSpeaking) {
      await this.stop();
      // Small delay to ensure stop completes
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    this.isSpeaking = true;

    try {
      const speakOptions: any = {
        text: options.text,
        lang: options.lang || 'en-US',
        rate: options.rate || 1,
        pitch: options.pitch || 1,
        volume: options.volume || 1,
        category: 'playback'
      };

      // Set voice if specified - Capacitor TTS accepts voice as a string identifier
      if (options.voice) {
        speakOptions.voice = options.voice;
      }

      await TextToSpeech.speak(speakOptions);
    } finally {
      this.isSpeaking = false;
    }
  }

  async stop(): Promise<void> {
    if (Capacitor.isNativePlatform()) {
      this.isSpeaking = false;
      await TextToSpeech.stop();
    }
  }

  async isAvailable(): Promise<boolean> {
    return Capacitor.isNativePlatform();
  }

  getName(): string {
    return 'capacitor';
  }
}
