export interface TtsOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
  onStart?: () => void;
}

export interface TtsService {
  speak(options: TtsOptions): Promise<void>;
  generateAudioBlob(options: TtsOptions): Promise<Blob>;
  stop(): Promise<void>;
  isAvailable(): Promise<boolean>;
  getName(): string;
}
