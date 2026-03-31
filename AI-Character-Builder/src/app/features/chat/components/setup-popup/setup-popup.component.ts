import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TtsProvider } from '../../../../core/services/tts';
import { AiProvider } from '../../../../core/services/ai';

@Component({
  selector: 'app-setup-popup',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './setup-popup.component.html',
  styleUrls: ['./setup-popup.component.scss']
})
export class SetupPopupComponent implements OnInit {
  @Input() showApiKeyDialog = false;
  @Input() apiKeySet = false;
  @Input() useServerAi = false;
  @Input() backendBaseUrl = '';
  @Input() ttsProvider: TtsProvider = 'system';
  @Input() llmProvider: AiProvider = 'webllm';
  @Input() piperTtsEndpoint = '';
  @Input() geminiTtsProjectId = '';
  @Input() geminiTtsAccessToken = '';
  @Input() geminiTtsVoice = 'Kore';
  @Input() geminiTtsLocale = 'en-US';
  @Input() geminiTtsModel = 'gemini-2.5-flash-tts';
  @Input() geminiTtsUseLiveServer = false;
  @Input() apiKeys: string[] = [''];
  @Input() isSavingApiKey = false;

  @Output() saveApiKey = new EventEmitter<{
    apiKeys: string[];
    useServerAi: boolean;
    backendBaseUrl: string;
    llmProvider: AiProvider;
    ttsProvider: TtsProvider;
    geminiTtsProjectId: string;
    geminiTtsAccessToken: string;
    geminiTtsVoice: string;
    geminiTtsLocale: string;
    geminiTtsModel: string;
    geminiTtsUseLiveServer: boolean;
  }>();
  @Output() clearApiKey = new EventEmitter<void>();
  @Output() closeDialog = new EventEmitter<void>();
  @Output() addApiKeyField = new EventEmitter<void>();
  @Output() removeApiKeyField = new EventEmitter<number>();

  tempApiKeys: string[] = [''];
  tempUseServerAi = false;
  tempBackendBaseUrl = '';
  tempTtsProvider: TtsProvider = 'system';
  tempLlmProvider: AiProvider = 'webllm';
  tempPiperTtsEndpoint = '';
  tempGeminiTtsProjectId = '';
  tempGeminiTtsAccessToken = '';
  tempGeminiTtsVoice = 'Kore';
  tempGeminiTtsLocale = 'en-US';
  tempGeminiTtsModel = 'gemini-2.5-flash-tts';
  tempGeminiTtsUseLiveServer = false;

  ngOnInit(): void {
    this.resetTempValues();
  }

  ngOnChanges(): void {
    this.resetTempValues();
  }

  private resetTempValues(): void {
    this.tempApiKeys = [...this.apiKeys];
    this.tempUseServerAi = this.useServerAi;
    this.tempBackendBaseUrl = this.backendBaseUrl;
    this.tempTtsProvider = this.ttsProvider;
    this.tempLlmProvider = this.llmProvider;
    this.tempPiperTtsEndpoint = this.piperTtsEndpoint;
    this.tempGeminiTtsProjectId = this.geminiTtsProjectId;
    this.tempGeminiTtsAccessToken = this.geminiTtsAccessToken;
    this.tempGeminiTtsVoice = this.geminiTtsVoice;
    this.tempGeminiTtsLocale = this.geminiTtsLocale;
    this.tempGeminiTtsModel = this.geminiTtsModel;
    this.tempGeminiTtsUseLiveServer = this.geminiTtsUseLiveServer;
  }

  onSave(): void {
    this.normalizeApiKeys();
    this.saveApiKey.emit({
      apiKeys: this.tempApiKeys,
      useServerAi: this.tempUseServerAi,
      backendBaseUrl: this.tempBackendBaseUrl,
      llmProvider: this.tempLlmProvider,
      ttsProvider: this.tempTtsProvider,
      geminiTtsProjectId: this.tempGeminiTtsProjectId,
      geminiTtsAccessToken: this.tempGeminiTtsAccessToken,
      geminiTtsVoice: this.tempGeminiTtsVoice,
      geminiTtsLocale: this.tempGeminiTtsLocale,
      geminiTtsModel: this.tempGeminiTtsModel,
      geminiTtsUseLiveServer: this.tempGeminiTtsUseLiveServer
    });
  }

  onClear(): void {
    this.clearApiKey.emit();
  }

  onClose(): void {
    this.closeDialog.emit();
  }

  onAddApiKeyField(): void {
    this.addApiKeyField.emit();
  }

  onRemoveApiKeyField(index: number): void {
    this.removeApiKeyField.emit(index);
  }

  canSave(): boolean {
    if (this.isSavingApiKey) {
      return false;
    }

    if (this.tempLlmProvider === 'webllm') {
      return true;
    }

    return this.hasAnyApiKeys() || this.tempUseServerAi || this.apiKeySet;
  }

  canClear(): boolean {
    return this.hasAnyApiKeys();
  }

  hasAnyApiKeys(): boolean {
    return this.tempApiKeys.some(key => !!String(key || '').trim());
  }

  normalizeApiKeys(): void {
    const normalizedKeys = this.tempApiKeys
      .map(key => String(key || '').trim())
      .filter((key, index, allKeys) => !!key && allKeys.indexOf(key) === index);

    this.tempApiKeys = normalizedKeys.length ? normalizedKeys : [''];
  }
}