import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { TtsService, TtsOptions } from './tts.interface';

export interface GeminiTtsConfig {
  apiKey: string;
  voice: string;
  locale: string;
  model: string;
}

@Injectable({
  providedIn: 'root'
})
export class GeminiTtsService implements TtsService {
  private config: GeminiTtsConfig | null = null;

  constructor(private http: HttpClient) {}

  setConfig(config: GeminiTtsConfig): void {
    this.config = config;
  }

  async speak(options: TtsOptions): Promise<void> {
    if (!this.config?.apiKey) {
      throw new Error('Gemini TTS not configured');
    }

    // Allow voice override from options, otherwise use config voice
    const voiceOverride = options?.voice || this.config?.voice;
    const localeOverride = options?.lang || this.config?.locale;

    const audioBlob = await this.requestAudio(options.text, voiceOverride, localeOverride);
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };

      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error('Audio playback failed'));
      };

      audio.play().catch(reject);
    });
  }

  async stop(): Promise<void> {
    // Audio playback is handled by the browser, no explicit stop needed
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config?.apiKey;
  }

  getName(): string {
    return 'gemini';
  }

  private async requestAudio(text: string, voice?: string, locale?: string): Promise<Blob> {
    if (!this.config) {
      throw new Error('Gemini TTS not configured');
    }
    return this.requestDirectApiAudio(text, voice, locale);
  }

  private async requestDirectApiAudio(text: string, voice?: string, locale?: string): Promise<Blob> {
    if (!this.config) {
      throw new Error('Gemini TTS not configured');
    }

    const model = this.config.model || 'gemini-2.5-flash-preview-tts';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const requestBody = {
      contents: [
        {
          parts: [
            {
              text: [
                `Speak this text naturally using the voice ${voice || this.config.voice}.`,
                `Use locale ${locale || this.config.locale}.`,
                `Text: ${text}`
              ].join(' ')
            }
          ]
        }
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice || this.config.voice
            }
          }
        }
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.config.apiKey
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini TTS request failed (${response.status})`);
    }

    const body = await response.json();
    const audioPart = body?.candidates?.[0]?.content?.parts?.find((part: any) => part?.inlineData?.data || part?.inline_data?.data);
    const inlineData = audioPart?.inlineData?.data || audioPart?.inline_data?.data || body?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!inlineData) {
      throw new Error('Gemini TTS returned no audio data');
    }
    return this.pcmToWavBlob(this.base64ToBytes(String(inlineData)));
  }

  private base64ToBytes(base64: string): Uint8Array {
    const normalized = base64.includes(',') ? base64.split(',').pop() || '' : base64;
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  }

  private pcmToWavBlob(pcm: Uint8Array, sampleRate = 24000, numChannels = 1, bitsPerSample = 16): Blob {
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;
    const dataSize = pcm.byteLength;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i++) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    new Uint8Array(buffer, 44).set(pcm);
    return new Blob([buffer], { type: 'audio/wav' });
  }
}
