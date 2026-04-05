import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { TtsService, TtsOptions } from './tts.interface';
import { environment } from '../../../../environments/environment';

export interface GeminiTtsConfig {
  projectId: string;
  accessToken: string;
  voice: string;
  locale: string;
  model: string;
  useLiveServer: boolean;
  backendBaseUrl?: string;
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
    if (!this.config) {
      throw new Error('Gemini TTS not configured');
    }

    // Allow voice override from options, otherwise use config voice
    const voiceOverride = options.voice || this.config.voice;
    const localeOverride = options.lang || this.config.locale;

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
    if (!this.config) {
      return false;
    }

    if (this.config.useLiveServer) {
      return !!this.config.backendBaseUrl;
    }

    return !!this.config.projectId && !!this.config.accessToken;
  }

  getName(): string {
    return 'gemini';
  }

  private async requestAudio(text: string, voice?: string, locale?: string): Promise<Blob> {
    if (!this.config) {
      throw new Error('Gemini TTS not configured');
    }

    if (this.config.useLiveServer) {
      return this.requestLiveServerAudio(text, voice);
    }

    return this.requestDirectApiAudio(text, voice, locale);
  }

  private async requestDirectApiAudio(text: string, voice?: string, locale?: string): Promise<Blob> {
    if (!this.config) {
      throw new Error('Gemini TTS not configured');
    }

    const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    const requestBody = {
      input: { text },
      voice: {
        languageCode: locale || this.config.locale,
        name: voice || this.config.voice,
        modelName: this.config.model
      },
      audioConfig: { audioEncoding: 'MP3' }
    };

    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.accessToken}`,
          'x-goog-user-project': this.config.projectId
        },
        data: requestBody,
        responseType: 'json'
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Gemini TTS request failed (${response.status})`);
      }

      return this.base64ToBlob(String(response.data?.audioContent || ''), 'audio/mpeg');
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.accessToken}`,
        'x-goog-user-project': this.config.projectId
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini TTS request failed (${response.status})`);
    }

    const body = await response.json();
    return this.base64ToBlob(String(body?.audioContent || ''), 'audio/mpeg');
  }

  private async requestLiveServerAudio(text: string, voice?: string): Promise<Blob> {
    if (!this.config?.backendBaseUrl) {
      throw new Error('No backend server configured for Gemini live voice');
    }

    const url = `${this.config.backendBaseUrl}/api/gemini/live-tts`;
    const payload = {
      text,
      voiceName: voice || this.config.voice,
      model: this.config.model
    };

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (environment.backendAppId) {
      headers['X-App-Id'] = environment.backendAppId;
    }

    if (environment.backendAppSecret) {
      headers['X-App-Secret'] = environment.backendAppSecret;
    }

    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url,
        method: 'POST',
        headers,
        data: payload,
        responseType: 'arraybuffer'
      });

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Gemini live TTS request failed (${response.status})`);
      }

      const mimeType = response.headers?.['Content-Type'] || response.headers?.['content-type'] || 'audio/wav';
      return this.base64ToBlob(String(response.data || ''), mimeType);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini live TTS request failed (${response.status})`);
    }

    return await response.blob();
  }

  private base64ToBlob(base64: string, mimeType: string): Blob {
    const normalized = base64.includes(',') ? base64.split(',').pop() || '' : base64;
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index++) {
      bytes[index] = binary.charCodeAt(index);
    }

    return new Blob([bytes], { type: mimeType });
  }
}