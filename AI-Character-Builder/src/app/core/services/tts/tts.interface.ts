export interface TtsOptions {
  text: string;
  lang?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  voice?: string;
}

export interface TtsService {
  speak(options: TtsOptions): Promise<void>;
  stop(): Promise<void>;
  isAvailable(): Promise<boolean>;
  getName(): string;
}