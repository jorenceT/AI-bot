import { Component, OnInit, ChangeDetectorRef, Input, OnDestroy, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { Message, Character } from '../../core/models/ai.models';
import { ChatService } from '../../core/services/chat.service';
import { CharacterService } from '../../core/services/character.service';
import { FamousPersonService } from '../../core/services/famous-person.service';
import { TtsFactoryService, TtsProvider } from '../../core/services/tts';
import { AiFactoryService, AiProvider, CharacterVoiceProfile } from '../../core/services/ai';
import { WebLLMService } from '../../core/services/webllm.service';
import { ChatWindowComponent } from './components/chat-window/chat-window.component';
import { AddCharacterComponent } from './components/add-character/add-character.component';
import { SetupPopupComponent } from './components/setup-popup/setup-popup.component';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { environment } from '../../../environments/environment';
import { AIService } from '@app/core/services/ai.service';

interface AndroidTtsStatus {
  available: boolean;
  hasEngine: boolean;
  initialized: boolean;
  currentEngine: string | null;
  musicVolume: number;
  maxMusicVolume: number;
  isVolumeAudible: boolean;
  languageAvailable: boolean;
  languageStatus: number;
  hasVoices: boolean;
}

const AndroidTts = registerPlugin<{
  getStatus(): Promise<AndroidTtsStatus>;
  speak(options: { text: string; rate: number; pitch: number; volume: number }): Promise<{ started: boolean; utteranceId: string }>;
  stop(): Promise<void>;
  addListener(
    eventName: 'ttsStart' | 'ttsDone' | 'ttsError',
    listenerFunc: (data: { utteranceId?: string; errorCode?: number }) => void
  ): Promise<{ remove: () => Promise<void> }>;
}>('AndroidTts');

interface RuntimeVoiceProfile extends CharacterVoiceProfile {
  updatedAt: number;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatWindowComponent, AddCharacterComponent, SetupPopupComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit {
  private static readonly GREETING_COOLDOWN_MS = 60 * 60 * 1000;
  private static readonly GREETING_LOADING_MIN_VISIBLE_MS = 250;
  private static readonly LAST_GREETING_STORAGE_KEY = 'lastChatGreetingByCharacter';
  private static readonly LAST_GREETING_FLAG_STORAGE_KEY = 'lastGreetingWasGreetingByCharacter';
  private static readonly TTS_PROVIDER_KEY = 'ttsProvider';
  private static readonly GEMINI_TTS_PROJECT_ID_KEY = 'geminiTtsProjectId';
  private static readonly GEMINI_TTS_ACCESS_TOKEN_KEY = 'geminiTtsAccessToken';
  private static readonly GEMINI_TTS_VOICE_KEY = 'geminiTtsVoice';
  private static readonly GEMINI_TTS_LOCALE_KEY = 'geminiTtsLocale';
  private static readonly GEMINI_TTS_MODEL_KEY = 'geminiTtsModel';
  private static readonly GEMINI_TTS_USE_LIVE_SERVER_KEY = 'geminiTtsUseLiveServer';
  private static readonly DEFAULT_GEMINI_TTS_VOICE = 'Kore';
  private static readonly DEFAULT_GEMINI_TTS_LOCALE = 'en-US';
  private static readonly DEFAULT_GEMINI_TTS_MODEL = 'gemini-2.5-flash-tts';
  private static readonly DEFAULT_GEMINI_LIVE_TTS_VOICE = 'Zephyr';
  private static readonly DEFAULT_GEMINI_LIVE_TTS_MODEL = 'gemini-2.5-flash-tts';
  @Input() userName = '';

  messages$: Observable<Message[]>;
  characters$: Observable<Character[]>;
  activeCharacterId$: Observable<string>;
  messages: Message[] = [];
  characters: Character[] = [];
  activeCharacterId = '';

  userInput = '';
  isLoading = false;
  isGreetingLoading = false;
  isCharacterSetupLoading = false;
  loadingScreenTitle = 'Connecting to AI...';
  loadingScreenSubtitle = 'Please wait while your bot gets ready.';
  apiKeySet = false;
  showApiKeyDialog = false;
  tempApiKeys: string[] = [''];
  useServerAi = false;
  tempUseServerAi = false;
  backendBaseUrl = '';
  tempBackendBaseUrl = '';
  ttsProvider: 'system' | 'gemini' | 'capacitor' = 'system';
  tempTtsProvider: 'system' | 'gemini' | 'capacitor' = 'system';
  llmProvider: AiProvider = 'webllm';
  tempLlmProvider: AiProvider = 'webllm';
  piperTtsEndpoint = '';
  tempPiperTtsEndpoint = '';
  geminiTtsProjectId = '';
  tempGeminiTtsProjectId = '';
  geminiTtsAccessToken = '';
  tempGeminiTtsAccessToken = '';
  geminiTtsVoice = ChatComponent.DEFAULT_GEMINI_TTS_VOICE;
  tempGeminiTtsVoice = ChatComponent.DEFAULT_GEMINI_TTS_VOICE;
  geminiTtsLocale = ChatComponent.DEFAULT_GEMINI_TTS_LOCALE;
  tempGeminiTtsLocale = ChatComponent.DEFAULT_GEMINI_TTS_LOCALE;
  geminiTtsModel = ChatComponent.DEFAULT_GEMINI_TTS_MODEL;
  tempGeminiTtsModel = ChatComponent.DEFAULT_GEMINI_TTS_MODEL;
  geminiTtsUseLiveServer = false;
  tempGeminiTtsUseLiveServer = false;
  isSavingApiKey = false;
  popupMessage = '';
  popupType: 'error' | 'success' | 'info' = 'info';
  showPopup = false;
  private popupTimeoutId: ReturnType<typeof setTimeout> | null = null;
  isCharacterSectionCollapsed = false;
  autoVoiceEnabled = true; // whether AI responses should be spoken automatically
  currentSpeakingMessageId: string | null = null; // id of the message currently being spoken
  voices: SpeechSynthesisVoice[] = [];
  preferredVoice: SpeechSynthesisVoice | null = null;
  aiVoiceProfiles: Record<string, RuntimeVoiceProfile> = {};
  pendingVoiceProfileIds = new Set<string>();
  // Per-character voice preference substrings (searched in voice.name or voice.lang)
  characterVoicePreferences: Record<string, string[]> = {
    // calmer, lower voice
    monk: ['Natural', 'Neural', 'Google', 'en-GB', 'en-US', 'English', 'Male'],
    // upbeat/creative voices
    creative: ['Natural', 'Neural', 'WaveNet', 'Google', 'en-US', 'English', 'Female'],
    // clear, measured, instructional
    teacher: ['Natural', 'Neural', 'Microsoft', 'en-US', 'en-GB', 'English'],
    // warm mentor
    mentor: ['Natural', 'Neural', 'Google', 'en-US', 'English']
  };

  // Per-character extra pause between chunks (ms)
  characterPauseMs: Record<string, number> = {
    monk: 220,
    creative: 110,
    teacher: 170,
    mentor: 180
  };
  characterChunkLength: Record<string, number> = {
    monk: 230,
    creative: 180,
    teacher: 210,
    mentor: 220
  };
  // Persisted per-character explicit voice selection (voice.name). If set, this overrides heuristics.
  // value may be a string or null/empty when no explicit selection is set
  characterVoiceSelection: Record<string, string | null> = {};
  speechRecognitionSupported = false;
  isListening = false;
  liveTranscript = '';
  private speechRecognition: any = null;
  private speechResult = '';
  private hasInsertedSessionOpenMarker = false;
  private activeMicPointerId: number | null = null;
  private shouldSendVoiceMessage = false;
  private isFinalizingVoiceCapture = false;
  private speechStartTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private nativeTtsListenersReady = false;
  private suppressSpeechPlaybackError = false;
  private speechErrorResetTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private audioElement: HTMLAudioElement | null = null;
  private audioUrl: string | null = null;
  private suppressNextWelcomeMessage = false;
  private forceNextWelcomeCharacterId: string | null = null;
  lastFailedMessage: string | null = null;
  lastFailedCharacterId: string | null = null;
  
  // WebLLM loading state
  isWebLLMLoading = false;
  webLLMProgress = 0;
  webLLMLoadingText = '';

  constructor(
    private chatService: ChatService,
    private characterService: CharacterService,
    private aiService: AIService,
    private famousPersonService: FamousPersonService,
    private webllmService: WebLLMService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone
  ) {
    this.messages$ = this.chatService.getMessages();
    this.characters$ = this.characterService.getCharacters();
    this.activeCharacterId$ = this.characterService.getActiveCharacter();
  }

  ngOnInit(): void {
    this.messages$.subscribe(messages => {
      this.messages = messages;
      setTimeout(() => this.scrollToBottom(), 100);
    });

    this.characters$.subscribe(chars => {
      this.characters = chars;
      this.refreshVoiceProfiles();
      this.cdr.detectChanges();
    });

    this.activeCharacterId$.subscribe(id => {
      this.activeCharacterId = id;
      this.chatService.switchCharacter(id);
      this.ensureSessionOpenMarker(id);
      this.ensureWelcomeMessage(id);
      this.cdr.detectChanges();
    });

    // Subscribe to temporary character name from add-character component
    this.characterService.getTempCharacterName().subscribe(name => {
      this.tempCharacterName = name;
      this.cdr.detectChanges();
    });

    this.checkApiKey();
    this.loadTtsSettings();
    this.loadAutoVoiceSetting();
    this.loadVoices();
    this.loadVoiceSelections();
    this.loadVoiceProfiles();
    this.setupSpeechRecognition();

    if (!this.apiKeySet) {
      setTimeout(() => {
        this.showApiKeyDialog = true;
        this.cdr.detectChanges();
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.stopVoiceCapture(true);
    this.stopSpeaking();
    this.cleanupAudio();
  }

  // Load persisted per-character voice selections from localStorage
  loadVoiceSelections(): void {
    try {
      const raw = localStorage.getItem('characterVoiceSelection');
      if (raw) {
        this.characterVoiceSelection = JSON.parse(raw) || {};
      }
    } catch (e) {
      console.warn('Could not load character voice selections', e);
      this.characterVoiceSelection = {};
    }
  }

  loadVoiceProfiles(): void {
    try {
      const raw = localStorage.getItem('characterAiVoiceProfiles');
      if (raw) {
        this.aiVoiceProfiles = JSON.parse(raw) || {};
      }
    } catch (e) {
      console.warn('Could not load AI voice profiles', e);
      this.aiVoiceProfiles = {};
    }
  }

  // Character add/edit dialog state
  showCharacterDialog = false;
  editingCharacter: Character | null = null;
  isFamousPersonCharacter = false;
  // temporary form model for add/edit
  tempCharacter: Partial<Character> = {};
  // Temporary character name from add-character component
  tempCharacterName = '';

  openAddCharacterDialog(): void {
    this.stopSpeaking();
    this.editingCharacter = null;
    this.isFamousPersonCharacter = false;
    this.tempCharacter = {
      id: '',
      name: '',
      personality: '',
      tone: '',
      backstory: '',
      systemPrompt: '',
      greetingsEnabled: true,
      isActive: false,
      voice: ''
    };
    this.showCharacterDialog = true;
  }

  openEditCharacterDialog(characterId: string): void {
    this.stopSpeaking();
    const ch = this.characters.find(c => c.id === characterId);
    if (!ch) return;
    this.editingCharacter = ch;
    this.isFamousPersonCharacter = false;
    // clone
    this.tempCharacter = { ...ch, greetingsEnabled: ch.greetingsEnabled !== false, voice: ch.voice || '' };
    this.showCharacterDialog = true;
  }

  closeCharacterDialog(): void {
    this.showCharacterDialog = false;
    this.isFamousPersonCharacter = false;
    this.tempCharacter = {};
    this.editingCharacter = null;
  }

  async saveCharacter(): Promise<void> {
    // basic validation - use tempCharacterName from service if available
    const name = (this.tempCharacterName || this.tempCharacter.name || '').trim();
    if (!name) {
      this.openPopup('Please provide a character name', 'error');
      return;
    }

    let character: Character = {
      id: this.editingCharacter ? this.editingCharacter.id : (this.tempCharacter.id && this.tempCharacter.id.trim()) || ('char_' + Date.now()),
      name: name,
      personality: this.isFamousPersonCharacter ? '' : (this.tempCharacter.personality || ''),
      tone: this.isFamousPersonCharacter ? '' : (this.tempCharacter.tone || ''),
      backstory: this.isFamousPersonCharacter ? '' : (this.tempCharacter.backstory || ''),
      systemPrompt: this.isFamousPersonCharacter ? '' : (this.tempCharacter.systemPrompt || ''),
      greetingsEnabled: this.tempCharacter.greetingsEnabled !== false,
      isActive: !!this.tempCharacter.isActive,
      voice: this.tempCharacter.voice || ''
    };

    try {
      if (this.isFamousPersonCharacter) {
        this.loadingScreenTitle = 'Gathering details and creating bot...';
        this.loadingScreenSubtitle = 'Looking up details and shaping the character.';
        this.isCharacterSetupLoading = true;
        this.cdr.detectChanges();

        const resolvedFigure = await this.famousPersonService.lookupKnownFigure(character.name);
        if (!resolvedFigure) {
          this.openPopup('Could not identify that famous person. Please try a more specific name.', 'error');
          return;
        }

        // Use persona from resolvedFigure if available (from Wikipedia)
        const wikiPersona = resolvedFigure.persona;
        character = {
          ...character,
          name: resolvedFigure.title,
          personality: wikiPersona?.personality || '',
          tone: wikiPersona?.tone || '',
          backstory: wikiPersona?.backstory || resolvedFigure.extract || character.backstory,
          systemPrompt: wikiPersona?.systemPrompt || ''
        };

        // When using Gemini, call the AI to generate a full persona
        if (this.llmProvider === 'gemini' && this.aiService.hasApiKey()) {
          const persona = await this.aiService.generateCharacterPersonaFromKnownFigure(resolvedFigure);
          if (persona) {
            character = {
              ...character,
              ...persona,
              name: String(persona.name || resolvedFigure.title || character.name).trim() || character.name
            };
          }
        }

        // Store voice preferences from Wikipedia for TTS
        if (resolvedFigure.voiceHints) {
          this.characterVoicePreferences[character.id] = resolvedFigure.voiceHints!;
        }
      }

      if (this.editingCharacter) {
        this.characterService.updateCharacter(character);
      } else {
        this.forceNextWelcomeCharacterId = character.id;
        this.characterService.addCharacter(character);
      }

      if (character.voice) {
        this.characterVoiceSelection[character.id] = character.voice;
      } else {
        delete this.characterVoiceSelection[character.id];
      }
      this.saveVoiceSelection(character.id);
      delete this.aiVoiceProfiles[character.id];
      this.saveVoiceProfiles();

      this.closeCharacterDialog();
    } finally {
      this.isCharacterSetupLoading = false;
      this.loadingScreenTitle = 'Connecting to AI...';
      this.loadingScreenSubtitle = 'Please wait while your bot gets ready.';
      this.cdr.detectChanges();
    }
  }

  deleteCharacter(characterId: string): void {
    if (!confirm('Delete this character?')) return;
    if (this.activeCharacterId === characterId) {
      this.suppressNextWelcomeMessage = true;
    }
    this.characterService.deleteCharacter(characterId);
    delete this.characterVoiceSelection[characterId];
    this.saveVoiceSelection(characterId);
    delete this.aiVoiceProfiles[characterId];
    this.saveVoiceProfiles();
    this.closeCharacterDialog();
  }

  saveVoiceSelection(characterId: string): void {
    try {
      if (characterId && this.characterVoiceSelection[characterId]) {
        localStorage.setItem('characterVoiceSelection', JSON.stringify(this.characterVoiceSelection));
      } else {
        // if cleared, just save full map
        localStorage.setItem('characterVoiceSelection', JSON.stringify(this.characterVoiceSelection));
      }
    } catch (e) {
      console.warn('Could not save character voice selection', e);
    }
  }

  saveVoiceProfiles(): void {
    try {
      localStorage.setItem('characterAiVoiceProfiles', JSON.stringify(this.aiVoiceProfiles));
    } catch (e) {
      console.warn('Could not save AI voice profiles', e);
    }
  }

  checkApiKey(): void {
    // WebLLM runs in browser, no API key needed
    if (this.aiService.getLlmProvider() === 'webllm') {
      this.apiKeySet = true; // WebLLM doesn't need API key validation
    } else {
      this.apiKeySet = this.aiService.hasApiKey();
    }
    this.useServerAi = this.aiService.isBackendAiPreferred();
    this.tempUseServerAi = this.useServerAi;
    this.backendBaseUrl = this.aiService.getBackendBaseUrl();
    this.tempBackendBaseUrl = this.backendBaseUrl;
    this.llmProvider = this.aiService.getLlmProvider();
    this.tempLlmProvider = this.llmProvider;
  }

  private normalizeTempApiKeys(): void {
    const normalizedKeys = this.tempApiKeys
      .map(key => String(key || '').trim())
      .filter((key, index, allKeys) => !!key && allKeys.indexOf(key) === index);

    this.tempApiKeys = normalizedKeys.length ? normalizedKeys : [''];
  }

  addApiKeyField(): void {
    this.normalizeTempApiKeys();
    this.tempApiKeys.push('');
  }

  hasAnyTempApiKeys(): boolean {
    return this.tempApiKeys.some(key => !!String(key || '').trim());
  }

  canSaveApiKeys(): boolean {
    if (this.isSavingApiKey) {
      return false;
    }
    
    // If WebLLM is selected, always allow save (no config needed)
    if (this.tempLlmProvider === 'webllm') {
      return true;
    }
    
    // For Gemini, use existing logic
    return this.hasAnyTempApiKeys() || this.tempUseServerAi || this.apiKeySet || this.aiService.isBackendConfigured();
  }

  canClearApiKeys(): boolean {
    return this.hasAnyTempApiKeys() || this.aiService.hasPersonalApiKey();
  }

  removeApiKeyField(index: number): void {
    if (index < 0 || index >= this.tempApiKeys.length) {
      return;
    }

    this.tempApiKeys.splice(index, 1);
    if (!this.tempApiKeys.length) {
      this.tempApiKeys = [''];
    }
  }

  loadTtsSettings(): void {
    try {
      const storedProvider = localStorage.getItem(ChatComponent.TTS_PROVIDER_KEY) as 'system' | 'piper' | 'gemini' | null;
      this.ttsProvider = 'system';
      this.tempTtsProvider = this.ttsProvider;
      this.geminiTtsProjectId = localStorage.getItem(ChatComponent.GEMINI_TTS_PROJECT_ID_KEY) || '';
      this.tempGeminiTtsProjectId = this.geminiTtsProjectId;
      this.geminiTtsAccessToken = localStorage.getItem(ChatComponent.GEMINI_TTS_ACCESS_TOKEN_KEY) || '';
      this.tempGeminiTtsAccessToken = this.geminiTtsAccessToken;
      this.geminiTtsVoice = localStorage.getItem(ChatComponent.GEMINI_TTS_VOICE_KEY) || ChatComponent.DEFAULT_GEMINI_TTS_VOICE;
      this.tempGeminiTtsVoice = this.geminiTtsVoice;
      this.geminiTtsLocale = localStorage.getItem(ChatComponent.GEMINI_TTS_LOCALE_KEY) || ChatComponent.DEFAULT_GEMINI_TTS_LOCALE;
      this.tempGeminiTtsLocale = this.geminiTtsLocale;
      this.geminiTtsModel = localStorage.getItem(ChatComponent.GEMINI_TTS_MODEL_KEY) || ChatComponent.DEFAULT_GEMINI_TTS_MODEL;
      this.tempGeminiTtsModel = this.geminiTtsModel;
      this.geminiTtsUseLiveServer = localStorage.getItem(ChatComponent.GEMINI_TTS_USE_LIVE_SERVER_KEY) === 'true';
      this.tempGeminiTtsUseLiveServer = this.geminiTtsUseLiveServer;
    } catch {
      this.ttsProvider = 'system';
      this.tempTtsProvider = 'system';
      this.geminiTtsProjectId = '';
      this.tempGeminiTtsProjectId = '';
      this.geminiTtsAccessToken = '';
      this.tempGeminiTtsAccessToken = '';
      this.geminiTtsVoice = ChatComponent.DEFAULT_GEMINI_TTS_VOICE;
      this.tempGeminiTtsVoice = ChatComponent.DEFAULT_GEMINI_TTS_VOICE;
      this.geminiTtsLocale = ChatComponent.DEFAULT_GEMINI_TTS_LOCALE;
      this.tempGeminiTtsLocale = ChatComponent.DEFAULT_GEMINI_TTS_LOCALE;
      this.geminiTtsModel = ChatComponent.DEFAULT_GEMINI_TTS_MODEL;
      this.tempGeminiTtsModel = ChatComponent.DEFAULT_GEMINI_TTS_MODEL;
      this.geminiTtsUseLiveServer = false;
      this.tempGeminiTtsUseLiveServer = false;
    }
  }

  openApiKeyDialog(): void {
    if (this.isSavingApiKey) {
      return;
    }

    this.stopSpeaking();
    this.showApiKeyDialog = true;
    this.tempApiKeys = this.aiService.getPersonalApiKeys();
    if (!this.tempApiKeys.length) {
      this.tempApiKeys = [''];
    }
    this.tempUseServerAi = this.useServerAi;
    this.tempBackendBaseUrl = this.backendBaseUrl;
    this.tempGeminiTtsProjectId = this.geminiTtsProjectId;
    this.tempGeminiTtsAccessToken = this.geminiTtsAccessToken;
    this.tempGeminiTtsVoice = this.geminiTtsVoice;
    this.tempGeminiTtsLocale = this.geminiTtsLocale;
    this.tempGeminiTtsModel = this.geminiTtsModel;
    this.tempGeminiTtsUseLiveServer = this.geminiTtsUseLiveServer;
    this.tempLlmProvider = this.llmProvider;
  }

  closeApiKeyDialog(): void {
    if (this.isSavingApiKey) {
      return;
    }

    this.showApiKeyDialog = false;
    this.tempApiKeys = this.aiService.getPersonalApiKeys();
    if (!this.tempApiKeys.length) {
      this.tempApiKeys = [''];
    }
    this.tempUseServerAi = this.useServerAi;
    this.tempBackendBaseUrl = this.backendBaseUrl;
    this.tempGeminiTtsProjectId = this.geminiTtsProjectId;
    this.tempGeminiTtsAccessToken = this.geminiTtsAccessToken;
    this.tempGeminiTtsVoice = this.geminiTtsVoice;
    this.tempGeminiTtsLocale = this.geminiTtsLocale;
    this.tempGeminiTtsModel = this.geminiTtsModel;
    this.tempGeminiTtsUseLiveServer = this.geminiTtsUseLiveServer;
    this.tempLlmProvider = this.llmProvider;
  }

  toggleCharacterSection(): void {
    this.isCharacterSectionCollapsed = !this.isCharacterSectionCollapsed;
  }

  saveApiKey(): void {
    this.normalizeTempApiKeys();
    const hasAnyPersonalKey = this.tempApiKeys.some(key => !!key.trim());
    if ((!hasAnyPersonalKey && !this.aiService.isBackendConfigured() && !this.apiKeySet) || this.isSavingApiKey) {
      return;
    }

    this.isSavingApiKey = true;

    try {
      this.aiService.setPersonalApiKeys(this.tempApiKeys);
      this.aiService.setBackendConfig(this.tempBackendBaseUrl, this.tempUseServerAi);
      this.aiService.setLlmProvider(this.tempLlmProvider);
      this.useServerAi = this.aiService.isBackendAiPreferred();
      this.backendBaseUrl = this.aiService.getBackendBaseUrl();
      this.apiKeySet = this.aiService.hasApiKey();
      this.llmProvider = this.aiService.getLlmProvider();
      this.saveTtsSettings();
      this.closePopup();
      this.showApiKeyDialog = false;
      this.tempApiKeys = this.aiService.getPersonalApiKeys();
      if (!this.tempApiKeys.length) {
        this.tempApiKeys = [''];
      }
      this.tempUseServerAi = this.useServerAi;
      this.tempBackendBaseUrl = this.backendBaseUrl;
      this.tempLlmProvider = this.llmProvider;
      this.cdr.detectChanges();

      // Run voice-profile generation after the modal closes and only for the active character.
      setTimeout(() => {
        void this.ensureVoiceProfile(this.activeCharacterId);
      }, 0);
    } finally {
      this.isSavingApiKey = false;
    }
  }

  saveApiKeyFromPopup(event: {
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
  }): void {
    this.tempApiKeys = event.apiKeys;
    this.tempUseServerAi = event.useServerAi;
    this.tempBackendBaseUrl = event.backendBaseUrl;
    this.tempLlmProvider = event.llmProvider;
    this.tempTtsProvider = event.ttsProvider;
    this.tempGeminiTtsProjectId = event.geminiTtsProjectId;
    this.tempGeminiTtsAccessToken = event.geminiTtsAccessToken;
    this.tempGeminiTtsVoice = event.geminiTtsVoice;
    this.tempGeminiTtsLocale = event.geminiTtsLocale;
    this.tempGeminiTtsModel = event.geminiTtsModel;
    this.tempGeminiTtsUseLiveServer = event.geminiTtsUseLiveServer;
    
    this.saveApiKey();
  }

  clearApiKey(): void {
    this.aiService.clearApiKey();
    this.apiKeySet = this.aiService.hasApiKey();
    this.tempApiKeys = [''];
    this.showApiKeyDialog = false;
    this.openPopup('API keys cleared', 'info');
  }

  private saveTtsSettings(): void {
    this.ttsProvider = this.tempTtsProvider;
    this.geminiTtsProjectId = this.tempGeminiTtsProjectId.trim();
    this.geminiTtsAccessToken = this.tempGeminiTtsAccessToken.trim();
    this.geminiTtsVoice = (this.tempGeminiTtsVoice || ChatComponent.DEFAULT_GEMINI_TTS_VOICE).trim();
    this.geminiTtsLocale = (this.tempGeminiTtsLocale || ChatComponent.DEFAULT_GEMINI_TTS_LOCALE).trim();
    this.geminiTtsModel = (this.tempGeminiTtsModel || ChatComponent.DEFAULT_GEMINI_TTS_MODEL).trim();
    this.geminiTtsUseLiveServer = this.tempGeminiTtsUseLiveServer;
    localStorage.setItem(ChatComponent.TTS_PROVIDER_KEY, this.ttsProvider);
    localStorage.setItem(ChatComponent.GEMINI_TTS_PROJECT_ID_KEY, this.geminiTtsProjectId);
    localStorage.setItem(ChatComponent.GEMINI_TTS_ACCESS_TOKEN_KEY, this.geminiTtsAccessToken);
    localStorage.setItem(ChatComponent.GEMINI_TTS_VOICE_KEY, this.geminiTtsVoice);
    localStorage.setItem(ChatComponent.GEMINI_TTS_LOCALE_KEY, this.geminiTtsLocale);
    localStorage.setItem(ChatComponent.GEMINI_TTS_MODEL_KEY, this.geminiTtsModel);
    localStorage.setItem(ChatComponent.GEMINI_TTS_USE_LIVE_SERVER_KEY, JSON.stringify(this.geminiTtsUseLiveServer));
  }

  async sendMessage(): Promise<void> {
    if (!this.userInput.trim()) return;
    if (!this.apiKeySet) {
      if (this.llmProvider === 'webllm') {
        this.openPopup('WebLLM is ready to use - no configuration needed', 'info');
      } else {
        this.openPopup('Please enable server AI or set your Google Gemini API key first', 'error');
      }
      this.openApiKeyDialog();
      return;
    }

    // Check if WebLLM needs to be initialized
    if (this.llmProvider === 'webllm' && !this.webllmService.isModelLoaded()) {
      try {
        await this.ensureWebLlmLoaded('Sending your message...', 'Downloading and caching the AI model. This may take a moment on first use.');
      } catch (error: any) {
        this.openPopup(error?.message || 'Failed to load AI model. Gemma-3 requires WebGPU support.', 'error');
        this.cdr.detectChanges();
        return;
      }
    }

    const text = this.userInput;
    this.userInput = '';
    this.isLoading = true;
    this.lastFailedMessage = null;
    this.lastFailedCharacterId = null;
    this.cdr.detectChanges();

    try {
      this.setLastGreetingFlag(this.activeCharacterId, false);
      this.ngZone.run(() => {
        const userMessage: Message = {
          id: 'msg_' + Date.now(),
          text: text,
          sender: 'user',
          timestamp: new Date(),
          characterId: this.activeCharacterId
        };
        this.chatService.addMessage(userMessage);
        this.cdr.detectChanges();
      });

      // Get active character
      const activeChar = this.characters.find(c => c.id === this.activeCharacterId);
      if (!activeChar) return;

      // Get AI response
      const aiResponse = await this.aiService.sendMessage(text, this.activeCharacterId, activeChar);

      this.ngZone.run(() => {
        const aiMessage: Message = {
          id: 'msg_' + Date.now() + '_ai',
          text: aiResponse,
          sender: 'ai',
          timestamp: new Date(),
          characterId: this.activeCharacterId
        };
        this.chatService.addMessage(aiMessage);
        this.setLastGreetingFlag(this.activeCharacterId, false);
        this.lastFailedMessage = null;
        this.lastFailedCharacterId = null;
        this.cdr.detectChanges();

        if (this.autoVoiceEnabled) {
          setTimeout(() => void this.speakMessage(aiMessage), 50);
        }
      });

    } catch (error: any) {
      this.ngZone.run(() => {
        this.lastFailedMessage = text;
        this.lastFailedCharacterId = this.activeCharacterId;
        if (!this.handleAiRateLimitError(error, 'error')) {
          this.openPopup(error?.message || 'Something went wrong', 'error');
        }
        this.cdr.detectChanges();
      });
      console.error('Error:', error);
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  async retryLastMessage(): Promise<void> {
    if (!this.lastFailedMessage || !this.lastFailedCharacterId) return;
    if (!this.apiKeySet) {
      if (this.llmProvider === 'webllm') {
        this.openPopup('WebLLM is ready to use - no configuration needed', 'info');
      } else {
        this.openPopup('Please enable server AI or set your Google Gemini API key first', 'error');
      }
      this.openApiKeyDialog();
      return;
    }

    const text = this.lastFailedMessage;
    const characterId = this.lastFailedCharacterId;
    this.lastFailedMessage = null;
    this.lastFailedCharacterId = null;
    this.isLoading = true;
    this.cdr.detectChanges();

    try {
      const activeChar = this.characters.find(c => c.id === characterId);
      if (!activeChar) return;

      const aiResponse = await this.aiService.sendMessage(text, characterId, activeChar);

      this.ngZone.run(() => {
        const aiMessage: Message = {
          id: 'msg_' + Date.now() + '_ai',
          text: aiResponse,
          sender: 'ai',
          timestamp: new Date(),
          characterId: characterId
        };
        this.chatService.addMessage(aiMessage);
        this.setLastGreetingFlag(characterId, false);
        this.cdr.detectChanges();

        if (this.autoVoiceEnabled) {
          setTimeout(() => void this.speakMessage(aiMessage), 50);
        }
      });

    } catch (error: any) {
      this.ngZone.run(() => {
        this.lastFailedMessage = text;
        this.lastFailedCharacterId = characterId;
        if (!this.handleAiRateLimitError(error, 'error')) {
          this.openPopup(error?.message || 'Something went wrong', 'error');
        }
        this.cdr.detectChanges();
      });
      console.error('Error:', error);
    } finally {
      this.ngZone.run(() => {
        this.isLoading = false;
        this.cdr.detectChanges();
      });
    }
  }

  selectCharacter(event: Event): void {
    this.stopSpeaking();
    const target = event.target as HTMLSelectElement | null;
    if (target) {
      const characterId = target.value;
      this.characterService.setActiveCharacter(characterId);
    }
  }

  selectCharacterById(characterId: string): void {
    if (!characterId || characterId === this.activeCharacterId) {
      return;
    }

    this.stopSpeaking();
    this.characterService.setActiveCharacter(characterId);
  }

  clearChat(): void {
    if (confirm('Are you sure you want to clear this conversation?')) {
      this.chatService.clearCurrentSession();
    }
  }

  private scrollToBottom(): void {
    const messagesDiv = document.querySelector('.messages-container');
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }

  getCharacterName(characterId: string): string {
    return this.characters.find(c => c.id === characterId)?.name || 'Unknown';
  }

  getCharacterBackstory(characterId: string): string {
    return this.characters.find(c => c.id === characterId)?.backstory || '';
  }

  isSystemMessage(message: Message): boolean {
    return message.sender === 'system';
  }

  isSessionMarker(message: Message): boolean {
    return this.isSystemMessage(message) && message.kind === 'session-open';
  }

  formatSessionMarker(timestamp: Date): string {
    const markerDate = new Date(timestamp);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const markerDay = new Date(markerDate.getFullYear(), markerDate.getMonth(), markerDate.getDate());
    const dayDiff = Math.round((today.getTime() - markerDay.getTime()) / 86400000);
    const timeText = markerDate.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    });

    if (dayDiff === 0) {
      return `Today ${timeText}`;
    }

    if (dayDiff === 1) {
      return `Yesterday ${timeText}`;
    }

    const dateText = markerDate.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return `${dateText} ${timeText}`;
  }

  startVoiceCapture(event?: PointerEvent): void {
    event?.preventDefault();

    if (!this.speechRecognitionSupported || this.isListening) {
      if (!this.speechRecognitionSupported) {
        this.openPopup('Speech input is not supported on this device/browser.', 'error');
      }
      return;
    }

    this.speechResult = '';
    this.liveTranscript = '';
    this.isListening = true;
    this.isFinalizingVoiceCapture = false;
    this.shouldSendVoiceMessage = true;
    this.activeMicPointerId = event?.pointerId ?? null;

    const target = event?.currentTarget as HTMLElement | null;
    if (target && this.activeMicPointerId !== null && target.setPointerCapture) {
      try {
        target.setPointerCapture(this.activeMicPointerId);
      } catch (error) {
        // ignore capture failures
      }
    }

    try {
      this.speechRecognition?.start();
    } catch (error) {
      this.isListening = false;
      this.activeMicPointerId = null;
      this.openPopup('Microphone could not start. Please allow microphone access.', 'error');
    }
  }

  stopVoiceCapture(skipApply = false, event?: PointerEvent): void {
    if (!this.isListening && !this.speechRecognition) {
      return;
    }

    const target = event?.currentTarget as HTMLElement | null;
    const pointerId = event?.pointerId ?? this.activeMicPointerId;
    if (target && pointerId !== null && target.hasPointerCapture?.(pointerId)) {
      try {
        target.releasePointerCapture(pointerId);
      } catch (error) {
        // ignore release failures
      }
    }

    this.activeMicPointerId = null;
    this.isListening = false;
    this.shouldSendVoiceMessage = !skipApply;

    try {
      this.speechRecognition?.stop();
    } catch (error) {
      // ignore duplicate stops
      if (!skipApply) {
        void this.finalizeVoiceCapture();
      }
    }
  }

  async speakMessage(msg: Message): Promise<void> {
    if (this.ttsProvider === 'gemini') {
      await this.speakMessageWithGeminiTts(msg);
      return;
    }
    if (this.ttsProvider === 'capacitor') {
      await this.speakMessageWithCapacitorTts(msg);
      return;
    }
    await this.speakMessageWithSystemTts(msg);
  }

  private async speakMessageWithCapacitorTts(msg: Message): Promise<void> {
    const text = msg.text.trim();
    if (!text) {
      this.openPopup('There is no message text to read aloud.', 'info');
      return;
    }

    this.stopSpeaking();
    this.currentSpeakingMessageId = msg.id;
    this.cdr.detectChanges();

    try {
      const character = this.characters.find(c => c.id === msg.characterId);
      const speechSettings = this.getSpeechSettings(msg.characterId, character);
      
      // Get the best matching voice for this character
      const characterVoice = this.getVoiceForCharacter(msg.characterId);
      
      // Build Capacitor TTS options with proper voice selection
      const speakOptions: any = {
        text: text,
        lang: characterVoice?.lang || 'en-US',
        rate: speechSettings.rate,
        pitch: speechSettings.pitch,
        volume: speechSettings.volume,
        category: 'playback'
      };

      // Pass the voice name to Capacitor TTS if available
      if (characterVoice?.name) {
        speakOptions.voice = characterVoice.name;
      }

      // Use Capacitor TTS with character's voice and settings
      await TextToSpeech.speak(speakOptions);

      this.currentSpeakingMessageId = null;
      this.cdr.detectChanges();
    } catch (error: any) {
      this.currentSpeakingMessageId = null;
      // Only show error if it's not a stop/cancel action
      if (!error?.message?.includes('cancel') && !error?.message?.includes('stop')) {
        this.openPopup('Capacitor TTS failed. Check your device TTS settings.', 'error');
      }
      this.cdr.detectChanges();
    }
  }

  // Load available voices and choose a preferred one for more natural speech
  loadVoices(): void {
    try {
      const synth = window.speechSynthesis;
      const setVoices = () => {
        this.voices = synth.getVoices() || [];
        this.selectPreferredVoice();
        this.refreshVoiceProfiles();
      };

      setVoices();
      // Some browsers load voices asynchronously
      synth.onvoiceschanged = () => setVoices();
    } catch (e) {
      console.warn('SpeechSynthesis not available', e);
    }
  }

  // Heuristic to pick a high-quality voice if available
  selectPreferredVoice(): void {
    if (!this.voices || this.voices.length === 0) {
      this.preferredVoice = null;
      return;
    }

    const ranked = this.voices
      .map(voice => ({
        voice,
        score: this.scoreNaturalVoice(voice)
      }))
      .sort((a, b) => b.score - a.score);

    this.preferredVoice = ranked[0]?.voice || this.voices[0];
  }

  // Return a voice that best matches the character's preferences, if any
  getVoiceForCharacter(characterId: string): SpeechSynthesisVoice | null {
    try {
      // If user explicitly selected a voice for this character, prefer that
      const selectedName = this.characterVoiceSelection[characterId];
      if (selectedName) {
        const foundByName = this.voices.find(v => v.name === selectedName || `${v.name} (${v.lang})` === selectedName);
        if (foundByName) return foundByName;
      }

      const aiProfile = this.aiVoiceProfiles[characterId];
      if (aiProfile) {
        const aiMatch = this.findVoiceByProfile(aiProfile);
        if (aiMatch) return aiMatch;
      }

      const prefs = this.characterVoicePreferences[characterId];
      if (!prefs || prefs.length === 0) return this.preferredVoice;

      const ranked = this.voices
        .map(voice => ({
          voice,
          score: this.scorePreferredVoice(voice, prefs)
        }))
        .sort((a, b) => b.score - a.score);

      return ranked[0]?.score > 0 ? ranked[0].voice : this.preferredVoice;
    } catch (e) {
      return this.preferredVoice;
    }
  }

  private getSpeechSettings(characterId: string, character?: Character): { pitch: number; rate: number; volume: number } {
    const aiProfile = this.aiVoiceProfiles[characterId];
    if (aiProfile) {
      return {
        pitch: this.clampSpeechValue(aiProfile.pitch, 0.9, 1.08, 0.98),
        rate: this.clampSpeechValue(aiProfile.rate, 0.9, 1.02, 0.94),
        volume: this.clampSpeechValue(aiProfile.volume, 0.96, 1, 1)
      };
    }

    if (character) {
      const toneSettings = this.getToneSpeechSettings(character);
      if (toneSettings) {
        return toneSettings;
      }

      switch (character.id) {
        case 'monk':
          return { pitch: 0.93, rate: 0.92, volume: 1 };
        case 'creative':
          return { pitch: 1.03, rate: 0.98, volume: 1 };
        case 'teacher':
          return { pitch: 0.97, rate: 0.93, volume: 1 };
        case 'mentor':
          return { pitch: 0.94, rate: 0.94, volume: 1 };
        default:
          return { pitch: 0.98, rate: 0.93, volume: 1 };
      }
    }

    return { pitch: 0.98, rate: 0.93, volume: 1 };
  }

  private getPreferredChunkLength(characterId: string, character?: Character): number {
    if (character && this.characterChunkLength[character.id]) {
      return this.characterChunkLength[character.id];
    }

    const descriptor = `${character?.tone || ''} ${character?.personality || ''}`.toLowerCase();
    if (this.matchesTone(descriptor, ['playful', 'energetic', 'creative', 'cheerful'])) {
      return 185;
    }

    if (this.matchesTone(descriptor, ['wise', 'mentor', 'teacher', 'calm', 'gentle', 'romantic'])) {
      return 230;
    }

    return 210;
  }

  private findVoiceByProfile(profile: CharacterVoiceProfile): SpeechSynthesisVoice | null {
    const scored = this.voices
      .map(voice => ({
        voice,
        score: this.scoreVoice(voice, profile)
      }))
      .sort((a, b) => b.score - a.score);

    return scored[0] && scored[0].score > 0 ? scored[0].voice : null;
  }

  private scoreVoice(voice: SpeechSynthesisVoice, profile: CharacterVoiceProfile): number {
    let score = 0;
    const voiceName = (voice.name || '').toLowerCase();
    const voiceLang = (voice.lang || '').toLowerCase();

    profile.voiceHints.forEach((hint, index) => {
      const normalizedHint = hint.toLowerCase();
      if (normalizedHint && voiceName.includes(normalizedHint)) {
        score += 12 - index;
      }
    });

    profile.langHints.forEach((hint, index) => {
      const normalizedHint = hint.toLowerCase();
      if (normalizedHint && voiceLang.includes(normalizedHint)) {
        score += 8 - index;
      }
    });

    if (voice.default) {
      score += 1;
    }

    if (voiceLang.startsWith('en')) {
      score += 1;
    }

    return score;
  }

  private refreshVoiceProfiles(): void {
    if (!this.voices.length || !this.aiService.hasApiKey()) {
      return;
    }

    const targetCharacterId = this.activeCharacterId || this.characters[0]?.id;
    if (!targetCharacterId) {
      return;
    }

    void this.ensureVoiceProfile(targetCharacterId);
  }

  private async ensureVoiceProfile(characterId: string): Promise<void> {
    // Skip AI voice profiles entirely when using WebLLM or without voices
    if (this.llmProvider !== 'gemini' || !this.aiService.hasApiKey() || !this.voices.length || this.pendingVoiceProfileIds.has(characterId)) {
      return;
    }

    if (!this.aiService.hasGeminiCapacity(1, 2)) {
      return;
    }

    const character = this.characters.find(c => c.id === characterId);
    if (!character) {
      return;
    }

    const fingerprintHash = this.hashString(JSON.stringify({
      name: character.name,
      personality: character.personality,
      tone: character.tone,
      backstory: character.backstory,
      systemPrompt: character.systemPrompt,
      availableVoices: this.voices.map(v => `${v.name}|${v.lang}|${v.default}`)
    }));

    if (this.aiVoiceProfiles[characterId]?.updatedAt === fingerprintHash) {
      return;
    }

    this.pendingVoiceProfileIds.add(characterId);
    try {
      const profile = await this.aiService.generateCharacterVoiceProfile(
        character,
        this.voices.map(voice => ({
          name: voice.name,
          lang: voice.lang,
          default: voice.default
        }))
      );

      if (profile) {
        this.aiVoiceProfiles[characterId] = {
          ...profile,
          updatedAt: fingerprintHash
        };
        this.saveVoiceProfiles();
      }
    } finally {
      this.pendingVoiceProfileIds.delete(characterId);
    }
  }

  private hashString(input: string): number {
    let hash = 0;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) - hash) + input.charCodeAt(i);
      hash |= 0;
    }
    return hash;
  }

  // Split long text into shorter chunks by sentence boundaries while respecting a max length
  private splitTextIntoChunks(text: string, maxLen: number): string[] {
    const normalizedText = text
      .replace(/\s+/g, ' ')
      .replace(/([,;:])\s*/g, '$1 ')
      .trim();
    const sentences = normalizedText.match(/[^.!?]+[.!?]*/g) || [normalizedText];
    const chunks: string[] = [];
    let current = '';

    for (let s of sentences) {
      s = s.trim();
      if (!s) continue;
      if ((current + ' ' + s).trim().length <= maxLen) {
        current = (current + ' ' + s).trim();
      } else {
        if (current) chunks.push(current);
        if (s.length <= maxLen) {
          current = s;
        } else {
          // sentence too long, split it by spaces
          let start = 0;
          while (start < s.length) {
            const part = s.substring(start, start + maxLen).trim();
            chunks.push(part);
            start += maxLen;
          }
          current = '';
        }
      }
    }
    if (current) chunks.push(current);
    return chunks;
  }

  private prepareTextForSpeech(text: string, character?: Character): string {
    const descriptor = `${character?.tone || ''} ${character?.personality || ''}`.toLowerCase();

    return text
      .replace(/\*\*(.*?)\*\*/g, '$1')
      .replace(/\*(.*?)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
      .replace(/https?:\/\/\S+/gi, '')
      .replace(/\bAI\b/g, 'A I')
      .replace(/\be\.g\./gi, 'for example')
      .replace(/\bi\.e\./gi, 'that is')
      .replace(/&/g, ' and ')
      .replace(/\s*([:;])\s*/g, '$1 ')
      .replace(/\s*([,.!?])\s*/g, '$1 ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/([,;:])(?=\S)/g, '$1 ')
      .replace(/\b(\w+)(\s+\1\b)+/gi, '$1')
      .replace(/\.\.\.+/g, this.matchesTone(descriptor, ['romantic', 'gentle', 'mysterious']) ? '...' : '.');
  }

  private getChunkEndingPause(text: string): number {
    const trimmed = text.trim();
    if (!trimmed) {
      return 0;
    }

    const lastChar = trimmed[trimmed.length - 1];
    if (['.', '!', '?'].includes(lastChar)) {
      return 90;
    }

    if ([',', ';', ':'].includes(lastChar)) {
      return 45;
    }

    if (trimmed.endsWith('...')) {
      return 120;
    }

    return 0;
  }

  private scoreNaturalVoice(voice: SpeechSynthesisVoice): number {
    const name = (voice.name || '').toLowerCase();
    const lang = (voice.lang || '').toLowerCase();
    let score = 0;

    if (lang.startsWith('en-us')) score += 10;
    else if (lang.startsWith('en-gb')) score += 9;
    else if (lang.startsWith('en')) score += 7;

    if (voice.default) score += 4;

    const positiveSignals = ['natural', 'neural', 'wavenet', 'premium', 'enhanced', 'google', 'microsoft', 'samantha', 'ava'];
    const negativeSignals = ['compact', 'lite', 'basic', 'classic', 'robot', 'espeak'];

    positiveSignals.forEach(signal => {
      if (name.includes(signal)) score += 5;
    });

    negativeSignals.forEach(signal => {
      if (name.includes(signal)) score -= 4;
    });

    return score;
  }

  private scorePreferredVoice(voice: SpeechSynthesisVoice, preferences: string[]): number {
    const voiceName = (voice.name || '').toLowerCase();
    const voiceLang = (voice.lang || '').toLowerCase();
    let score = this.scoreNaturalVoice(voice);

    preferences.forEach((preference, index) => {
      const normalized = preference.toLowerCase();
      if (!normalized) {
        return;
      }

      if (voiceName.includes(normalized)) {
        score += 12 - index;
      }

      if (voiceLang.includes(normalized)) {
        score += 8 - index;
      }
    });

    return score;
  }

  private getToneSpeechSettings(character: Character): { pitch: number; rate: number; volume: number } | null {
    const descriptor = `${character.tone} ${character.personality}`.toLowerCase();

    if (!descriptor.trim()) {
      return null;
    }

    if (this.matchesTone(descriptor, ['gentle', 'soft', 'calm', 'warm', 'tender', 'loving', 'compassionate'])) {
      return { pitch: 0.98, rate: 0.9, volume: 1 };
    }

    if (this.matchesTone(descriptor, ['romantic', 'affectionate', 'intimate'])) {
      return { pitch: 0.96, rate: 0.89, volume: 1 };
    }

    if (this.matchesTone(descriptor, ['wise', 'mentor', 'teacher', 'serious', 'protective', 'grounded'])) {
      return { pitch: 0.94, rate: 0.92, volume: 1 };
    }

    if (this.matchesTone(descriptor, ['playful', 'flirty', 'creative', 'bright', 'cheerful'])) {
      return { pitch: 1.01, rate: 0.96, volume: 1 };
    }

    if (this.matchesTone(descriptor, ['energetic', 'bold', 'confident'])) {
      return { pitch: 0.99, rate: 0.98, volume: 1 };
    }

    if (this.matchesTone(descriptor, ['mysterious', 'dark', 'seductive', 'intense'])) {
      return { pitch: 0.93, rate: 0.89, volume: 1 };
    }

    return { pitch: 0.98, rate: 0.93, volume: 1 };
  }

  private matchesTone(descriptor: string, keywords: string[]): boolean {
    const normalizedDescriptor = descriptor.toLowerCase();
    return keywords.some(keyword => {
      const conceptTerms = this.getToneConceptTerms(keyword.toLowerCase());
      return conceptTerms.some(term => normalizedDescriptor.includes(term));
    });
  }

  private getToneConceptTerms(keyword: string): string[] {
    const conceptMap: Record<string, string[]> = {
      gentle: ['gentle', 'soft', 'tender', 'kind', 'mild', 'delicate', 'tactful', 'soothing'],
      soft: ['soft', 'gentle', 'tender', 'subtle', 'light'],
      calm: ['calm', 'peaceful', 'serene', 'steady', 'composed', 'tranquil'],
      warm: ['warm', 'kind', 'caring', 'comforting', 'affectionate', 'welcoming'],
      tender: ['tender', 'gentle', 'loving', 'soft-hearted', 'delicate'],
      loving: ['loving', 'affectionate', 'devoted', 'caring', 'adoring'],
      compassionate: ['compassionate', 'empathetic', 'caring', 'merciful', 'understanding'],
      romantic: ['romantic', 'passionate', 'amorous', 'loving', 'dreamy'],
      affectionate: ['affectionate', 'loving', 'tender', 'warm', 'devoted'],
      intimate: ['intimate', 'close', 'personal', 'private', 'tender'],
      wise: ['wise', 'insightful', 'sage', 'thoughtful', 'perceptive'],
      mentor: ['mentor', 'guide', 'adviser', 'coach', 'teacher'],
      teacher: ['teacher', 'educator', 'instructor', 'tutor', 'guide'],
      serious: ['serious', 'solemn', 'grave', 'earnest', 'measured'],
      protective: ['protective', 'guarding', 'sheltering', 'watchful', 'defending'],
      grounded: ['grounded', 'steady', 'balanced', 'rooted', 'practical'],
      playful: ['playful', 'teasing', 'mischievous', 'fun', 'lighthearted'],
      flirty: ['flirty', 'teasing', 'playful', 'charming', 'saucy'],
      creative: ['creative', 'imaginative', 'artistic', 'inventive', 'expressive'],
      bright: ['bright', 'lively', 'sparkling', 'vibrant', 'radiant'],
      cheerful: ['cheerful', 'happy', 'joyful', 'sunny', 'upbeat'],
      energetic: ['energetic', 'dynamic', 'spirited', 'high-energy', 'animated'],
      bold: ['bold', 'daring', 'strong', 'assertive', 'fearless'],
      confident: ['confident', 'assured', 'self-assured', 'certain', 'poised'],
      mysterious: ['mysterious', 'enigmatic', 'cryptic', 'shadowy', 'arcane'],
      dark: ['dark', 'brooding', 'somber', 'shadowy', 'noir'],
      seductive: ['seductive', 'sensual', 'alluring', 'tempting', 'sultry'],
      intense: ['intense', 'fierce', 'powerful', 'driven', 'burning'],
      reflective: ['reflective', 'thoughtful', 'contemplative', 'meditative', 'inward'],
      philosophical: ['philosophical', 'reflective', 'contemplative', 'existential', 'thoughtful']
    };

    return conceptMap[keyword] || [keyword];
  }

  private clampSpeechValue(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    return Math.min(max, Math.max(min, value));
  }

  stopSpeaking(): void {
    this.stopAudio();

    if (this.ttsProvider === 'capacitor') {
      void TextToSpeech.stop().catch(() => undefined);
    } else if (this.isNativeAndroid()) {
      void AndroidTts.stop().catch(() => undefined);
    } else {
      try {
        this.suppressNextSpeechPlaybackError();
        window.speechSynthesis.cancel();
      } catch (e) {
        // ignore
      }
    }
    this.clearSpeechStartTimeout();
    this.currentSpeakingMessageId = null;
  }

  private suppressNextSpeechPlaybackError(): void {
    this.suppressSpeechPlaybackError = true;

    if (this.speechErrorResetTimeoutId) {
      clearTimeout(this.speechErrorResetTimeoutId);
    }

    this.speechErrorResetTimeoutId = setTimeout(() => {
      this.suppressSpeechPlaybackError = false;
      this.speechErrorResetTimeoutId = null;
    }, 300);
  }

  private isGeminiTtsReady(): boolean {
    if (this.ttsProvider !== 'gemini') {
      return false;
    }

    if (this.geminiTtsUseLiveServer) {
      return this.aiService.isBackendConfigured();
    }

    return !!this.geminiTtsProjectId.trim() && !!this.geminiTtsAccessToken.trim();
  }

  private showVoiceLoadingOverlay(): () => void {
    const previousLoadingState = this.isGreetingLoading;
    const previousTitle = this.loadingScreenTitle;
    const previousSubtitle = this.loadingScreenSubtitle;

    if (!previousLoadingState) {
      this.loadingScreenTitle = 'Loading voice...';
      this.loadingScreenSubtitle = 'Waiting for the AI voice response.';
      this.isGreetingLoading = true;
      this.cdr.detectChanges();
    }

    return () => {
      if (!previousLoadingState) {
        this.isGreetingLoading = false;
        this.loadingScreenTitle = previousTitle || 'Connecting to AI...';
        this.loadingScreenSubtitle = previousSubtitle || 'Please wait while your bot gets ready.';
        this.cdr.detectChanges();
      }
    };
  }

  private async playAudioBlobForMessage(msg: Message, audioBlob: Blob, provider: string): Promise<void> {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    this.cleanupAudio();
    this.audioElement = audio;
    this.audioUrl = audioUrl;
    this.currentSpeakingMessageId = msg.id;
    this.cdr.detectChanges();

    audio.onended = () => {
      this.currentSpeakingMessageId = null;
      this.cleanupAudio();
      this.cdr.detectChanges();
    };

    audio.onerror = () => {
      this.currentSpeakingMessageId = null;
      this.cleanupAudio();
      this.openPopup(`${provider} audio playback failed. Check your ${provider} setup.`, 'error');
      this.cdr.detectChanges();
    };

    await audio.play();
  }

  private async speakMessageWithGeminiTts(msg: Message): Promise<void> {
    const text = msg.text.trim();
    if (!text) {
      this.openPopup('There is no message text to read aloud.', 'info');
      return;
    }

    this.stopSpeaking();
    this.currentSpeakingMessageId = msg.id;
    this.cdr.detectChanges();

    try {
      // Get character voice for Gemini TTS voice selection
      const characterVoice = this.getVoiceForCharacter(msg.characterId);
      const voiceForGemini = characterVoice?.name || this.geminiTtsVoice;
      const localeForGemini = characterVoice?.lang || this.geminiTtsLocale;

      const audioBlob = await this.requestGeminiTtsAudio(text, msg.characterId, voiceForGemini, localeForGemini);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);

      this.cleanupAudio();
      this.audioElement = audio;
      this.audioUrl = audioUrl;

      audio.onended = () => {
        this.currentSpeakingMessageId = null;
        this.cleanupAudio();
        this.cdr.detectChanges();
      };

      audio.onerror = () => {
        this.currentSpeakingMessageId = null;
        this.cleanupAudio();
        this.openPopup('Gemini TTS playback failed. Check your Google Cloud TTS settings.', 'error');
        this.cdr.detectChanges();
      };

      await audio.play();
    } catch (error: any) {
      this.currentSpeakingMessageId = null;
      this.cleanupAudio();
      this.openPopup(this.describeRemoteTtsFailure('Gemini TTS', error), 'info');
      this.cdr.detectChanges();
      if (this.canFallbackToSystemTts()) {
        await this.speakMessageWithSystemTts(msg);
      }
    }
  }

  private describeRemoteTtsFailure(provider: string, error: unknown): string {
    const message = String((error as any)?.message || '').trim().toLowerCase();
    const fallbackSuffix = this.canFallbackToSystemTts()
      ? ', so the app is using the system voice instead.'
      : '.';

    if (!message || message.includes('failed to fetch') || message.includes('networkerror')) {
      return `${provider} could not be reached${fallbackSuffix}`;
    }

    if (message.includes('401') || message.includes('403') || message.includes('unauth')) {
      return `${provider} was rejected by the server${fallbackSuffix} Check the TTS settings.`;
    }

    return `${provider} is unavailable right now${fallbackSuffix}`;
  }

  private canFallbackToSystemTts(): boolean {
    return !this.isNativeAndroid() && this.canUseSpeechSynthesis();
  }

  private async requestGeminiTtsAudio(text: string, characterId: string, voice?: string, locale?: string): Promise<Blob> {
    const character = this.characters.find(item => item.id === characterId);
    const tonePrompt = this.buildGeminiTtsPrompt(character);

    // Use provided voice/locale or fall back to defaults
    const selectedVoice = voice || this.geminiTtsVoice;
    const selectedLocale = locale || this.geminiTtsLocale;

    if (this.geminiTtsUseLiveServer) {
      return await this.requestGeminiLiveTtsAudio(text, tonePrompt, selectedVoice);
    }

    const url = 'https://texttospeech.googleapis.com/v1/text:synthesize';
    const requestBody = {
      input: {
        prompt: tonePrompt,
        text
      },
      voice: {
        languageCode: selectedLocale,
        name: selectedVoice,
        modelName: this.geminiTtsModel
      },
      audioConfig: {
        audioEncoding: 'MP3'
      }
    };

    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.geminiTtsAccessToken}`,
          'x-goog-user-project': this.geminiTtsProjectId
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
        'Authorization': `Bearer ${this.geminiTtsAccessToken}`,
        'x-goog-user-project': this.geminiTtsProjectId
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

  private async requestGeminiLiveTtsAudio(text: string, stylePrompt: string, voice?: string): Promise<Blob> {
    const backendBaseUrl = this.aiService.getBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error('No backend server is configured for Gemini live voice.');
    }

    const selectedVoice = voice || this.geminiTtsVoice || ChatComponent.DEFAULT_GEMINI_LIVE_TTS_VOICE;

    const url = `${backendBaseUrl}/api/gemini/live-tts`;
    const payload = {
      text,
      stylePrompt,
      voiceName: selectedVoice,
      model: (this.geminiTtsModel || ChatComponent.DEFAULT_GEMINI_LIVE_TTS_MODEL).trim() || ChatComponent.DEFAULT_GEMINI_LIVE_TTS_MODEL
    };

    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.request({
        url,
        method: 'POST',
        headers: this.buildBackendAudioHeaders(),
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
      headers: this.buildBackendAudioHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Gemini live TTS request failed (${response.status})`);
    }

    return await response.blob();
  }

  private buildBackendAudioHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (environment.backendAppId) {
      headers['X-App-Id'] = environment.backendAppId;
    }

    if (environment.backendAppSecret) {
      headers['X-App-Secret'] = environment.backendAppSecret;
    }

    return headers;
  }

  private buildGeminiTtsPrompt(character?: Character): string {
    if (!character) {
      return 'Speak naturally, warmly, and conversationally. Use human pacing, subtle pauses, and avoid robotic delivery.';
    }

    const descriptor = `${character.tone || ''} ${character.personality || ''}`.toLowerCase();
    const styleHints: string[] = [
      'Use human pacing with subtle pauses at punctuation.',
      'Keep the delivery natural, grounded, and free of robotic rhythm.',
      'Do not overact.'
    ];

    if (this.matchesTone(descriptor, ['gentle', 'soft', 'warm', 'compassionate', 'tender'])) {
      styleHints.push('Sound gentle, reassuring, soft-spoken, and emotionally present.');
    }

    if (this.matchesTone(descriptor, ['wise', 'mentor', 'teacher', 'calm', 'reflective', 'philosophical'])) {
      styleHints.push('Sound calm, thoughtful, and measured, with quiet confidence.');
    }

    if (this.matchesTone(descriptor, ['playful', 'creative', 'flirty', 'bright', 'cheerful'])) {
      styleHints.push('Sound lively, warm, and lightly playful without becoming exaggerated.');
    }

    if (this.matchesTone(descriptor, ['romantic', 'affectionate', 'intimate'])) {
      styleHints.push('Sound intimate, tender, and close, with a soft emotional warmth.');
    }

    if (this.matchesTone(descriptor, ['bold', 'confident', 'energetic'])) {
      styleHints.push('Sound bold, clear, and self-assured with crisp phrasing.');
    }

    if (this.matchesTone(descriptor, ['mysterious', 'dark', 'seductive', 'intense'])) {
      styleHints.push('Sound low, controlled, and slightly mysterious.');
    }

    return [
      'Speak naturally and conversationally in a way that fits this character.',
      `Character name: ${character.name || 'not provided'}.`,
      `Tone: ${character.tone || 'not provided'}.`,
      `Personality: ${character.personality || 'not provided'}.`,
      `Backstory: ${character.backstory || 'not provided'}.`,
      ...styleHints
    ].join(' ');
  }

  private async speakMessageWithSystemTts(msg: Message): Promise<void> {
    const ttsIssue = await this.getAndroidTtsIssue();
    if (ttsIssue) {
      this.openPopup(ttsIssue, 'error');
      return;
    }

    if (!this.canUseSpeechSynthesis() && !this.isNativeAndroid()) {
      this.openPopup('Text-to-speech is not available on this device.', 'error');
      return;
    }

    await this.ensureVoiceProfile(msg.characterId);

    if (this.isNativeAndroid()) {
      await this.speakMessageWithNativeTts(msg);
      return;
    }

    await this.waitForVoices();

    const synth = window.speechSynthesis;
    const character = this.characters.find(c => c.id === msg.characterId);
    const preparedText = this.prepareTextForSpeech(msg.text, character);

    this.clearSpeechStartTimeout();

    try {
      this.suppressNextSpeechPlaybackError();
      synth.cancel();
      synth.resume();
    } catch {
      // ignore
    }

    const chunks = this.splitTextIntoChunks(preparedText, this.getPreferredChunkLength(msg.characterId, character));
    if (!chunks.length) {
      this.openPopup('There is no message text to read aloud.', 'info');
      return;
    }

    const speechSettings = this.getSpeechSettings(msg.characterId, character);
    const basePitch = speechSettings.pitch;
    const baseRate = speechSettings.rate;
    const baseVolume = speechSettings.volume;

    let isCancelled = false;
    let didStartSpeaking = false;

    const speakChunk = (index: number) => {
      if (isCancelled || index >= chunks.length) {
        this.currentSpeakingMessageId = null;
        this.clearSpeechStartTimeout();
        this.cdr.detectChanges();
        return;
      }

      const text = chunks[index];
      const utterance = new SpeechSynthesisUtterance(text);
      const randomPitch = basePitch + (Math.random() - 0.5) * 0.02;
      const randomRate = baseRate + (Math.random() - 0.5) * 0.015;
      utterance.pitch = Math.max(0.82, Math.min(1.18, randomPitch));
      utterance.rate = Math.max(0.88, Math.min(1.08, randomRate));
      utterance.volume = baseVolume;

      const voice = this.getVoiceForCharacter(msg.characterId) || this.preferredVoice;
      if (voice) {
        utterance.voice = voice;
        if (voice.lang) {
          utterance.lang = voice.lang;
        }
      } else {
        utterance.lang = 'en-US';
      }

      utterance.onstart = () => {
        didStartSpeaking = true;
        this.currentSpeakingMessageId = msg.id;
        this.clearSpeechStartTimeout();
        this.cdr.detectChanges();
      };

      utterance.onend = () => {
        const charPause = (character && this.characterPauseMs[character.id]) ? this.characterPauseMs[character.id] : 120;
        const punctuationPause = this.getChunkEndingPause(text);
        const pause = charPause + punctuationPause + Math.floor(Math.random() * 55) - 15;
        setTimeout(() => speakChunk(index + 1), Math.max(70, pause));
      };

      utterance.onerror = () => {
        if (this.suppressSpeechPlaybackError) {
          isCancelled = true;
          this.currentSpeakingMessageId = null;
          this.clearSpeechStartTimeout();
          this.cdr.detectChanges();
          return;
        }

        isCancelled = true;
        this.currentSpeakingMessageId = null;
        this.clearSpeechStartTimeout();
        this.openPopup('Speech playback failed on this device. Check media volume and Android text-to-speech settings.', 'error');
        this.cdr.detectChanges();
      };

      this.speechStartTimeoutId = setTimeout(() => {
        if (!didStartSpeaking) {
          isCancelled = true;
          this.currentSpeakingMessageId = null;
          try {
            synth.cancel();
          } catch {
            // ignore
          }
          this.openPopup('Speech did not start. Check media volume and Android text-to-speech settings.', 'error');
          this.cdr.detectChanges();
        }
      }, 1500);

      synth.speak(utterance);
      try {
        synth.resume();
      } catch {
        // ignore
      }
    };

    speakChunk(0);
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

  private stopAudio(): void {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch {
        // ignore
      }
    }
    this.cleanupAudio();
  }

  private cleanupAudio(): void {
    if (this.audioElement) {
      this.audioElement.onended = null;
      this.audioElement.onerror = null;
      this.audioElement = null;
    }

    if (this.audioUrl) {
      URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
    }
  }

  private async speakMessageWithNativeTts(msg: Message): Promise<void> {
    await this.ensureNativeTtsListeners();

    const character = this.characters.find(c => c.id === msg.characterId);
    const speechSettings = this.getSpeechSettings(msg.characterId, character);
    const text = this.splitTextIntoChunks(msg.text, 600).join(' ');
    if (!text.trim()) {
      this.openPopup('There is no message text to read aloud.', 'info');
      return;
    }

    this.currentSpeakingMessageId = msg.id;
    this.cdr.detectChanges();

    try {
      await AndroidTts.speak({
        text,
        rate: speechSettings.rate,
        pitch: speechSettings.pitch,
        volume: speechSettings.volume
      });
    } catch (error) {
      this.currentSpeakingMessageId = null;
      this.openPopup('Android text-to-speech could not start.', 'error');
      this.cdr.detectChanges();
    }
  }

  private async waitForVoices(): Promise<void> {
    if (this.voices.length) {
      return;
    }

    await new Promise<void>(resolve => {
      const timeoutId = setTimeout(() => resolve(), 350);
      try {
        window.speechSynthesis.getVoices();
      } catch (error) {
        clearTimeout(timeoutId);
        resolve();
        return;
      }

      window.setTimeout(() => {
        this.voices = window.speechSynthesis.getVoices() || [];
        this.selectPreferredVoice();
        resolve();
      }, 100);
    });
  }

  private clearSpeechStartTimeout(): void {
    if (this.speechStartTimeoutId) {
      clearTimeout(this.speechStartTimeoutId);
      this.speechStartTimeoutId = null;
    }
  }

  private async getAndroidTtsIssue(): Promise<string | null> {
    if (!this.isNativeAndroid()) {
      return null;
    }

    try {
      const status = await AndroidTts.getStatus();

      if (!status.hasEngine || !status.initialized || !status.available) {
        return 'Android text-to-speech is not ready on this phone. Enable a TTS engine like Google Speech Services in system settings.';
      }

      if (!status.isVolumeAudible) {
        return 'Media volume is muted. Turn up your phone media volume to hear spoken replies.';
      }

      if (!status.languageAvailable) {
        return 'English text-to-speech is not installed on this phone. Install or enable English voice data in Android text-to-speech settings.';
      }

      if (!status.hasVoices) {
        return 'No Android text-to-speech voices are available. Install voice data in Android text-to-speech settings.';
      }
    } catch (error) {
      console.warn('Could not verify Android TTS status', error);
      return 'Could not verify Android text-to-speech status. Check Android media volume and text-to-speech settings.';
    }

    return null;
  }

  private isNativeAndroid(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  }

  private canUseSpeechSynthesis(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  }

  private async ensureNativeTtsListeners(): Promise<void> {
    if (this.nativeTtsListenersReady || !this.isNativeAndroid()) {
      return;
    }

    await AndroidTts.addListener('ttsDone', () => {
      this.ngZone.run(() => {
        this.currentSpeakingMessageId = null;
        this.cdr.detectChanges();
      });
    });

    await AndroidTts.addListener('ttsError', () => {
      this.ngZone.run(() => {
        this.currentSpeakingMessageId = null;
        this.openPopup('Android text-to-speech failed while speaking.', 'error');
        this.cdr.detectChanges();
      });
    });

    await AndroidTts.addListener('ttsStart', () => {
      this.ngZone.run(() => {
        this.cdr.detectChanges();
      });
    });

    this.nativeTtsListenersReady = true;
  }

  // Persist / load auto-voice setting
  saveAutoVoiceSetting(): void {
    try {
      localStorage.setItem('autoVoiceEnabled', JSON.stringify(!!this.autoVoiceEnabled));
    } catch (e) {
      console.warn('Could not save auto voice setting', e);
    }
  }

  loadAutoVoiceSetting(): void {
    try {
      const raw = localStorage.getItem('autoVoiceEnabled');
      if (raw !== null) {
        this.autoVoiceEnabled = JSON.parse(raw) === true;
      } else {
        this.autoVoiceEnabled = true;
      }
    } catch (e) {
      console.warn('Could not load auto voice setting', e);
      this.autoVoiceEnabled = true;
    }
  }

  closePopup(): void {
    this.showPopup = false;
    this.popupMessage = '';
    if (this.popupTimeoutId) {
      clearTimeout(this.popupTimeoutId);
      this.popupTimeoutId = null;
    }
  }

  private openPopup(message: string, type: 'error' | 'success' | 'info' = 'info'): void {
    this.popupMessage = message;
    this.popupType = type;
    this.showPopup = true;

    if (this.popupTimeoutId) {
      clearTimeout(this.popupTimeoutId);
    }

    this.popupTimeoutId = setTimeout(() => {
      this.showPopup = false;
      this.popupTimeoutId = null;
    }, 3500);
  }

  private ensureSessionOpenMarker(characterId: string): void {
    if (!characterId || this.hasInsertedSessionOpenMarker) {
      return;
    }

    this.chatService.ensureSessionOpenMarker(characterId, new Date());
    this.hasInsertedSessionOpenMarker = true;
  }

  private ensureWelcomeMessage(characterId: string): void {
    if (!characterId) {
      return;
    }

    if (this.suppressNextWelcomeMessage) {
      this.suppressNextWelcomeMessage = false;
      return;
    }

    void this.showWelcomeMessage(characterId);
  }

  private extractMeaningfulTopics(messages: Message[]): string[] {
    const genericPhrases = [
      'hi',
      'hello',
      'hey',
      'how can i help you today',
      'what would you like to explore today',
      'welcome back'
    ];

    return messages
      .map(message => this.normalizeTopicSnippet(message.text))
      .filter((snippet, index, allSnippets) => {
        if (!snippet) {
          return false;
        }

        const normalized = snippet.toLowerCase();
        if (genericPhrases.some(phrase => normalized === phrase || normalized.includes(phrase))) {
          return false;
        }

        return allSnippets.indexOf(snippet) === index;
      })
      .slice(-2);
  }

  private normalizeTopicSnippet(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim();
    if (!normalized) {
      return '';
    }

    const cleaned = normalized.replace(/[.!?]+$/g, '').trim();
    if (cleaned.length < 4) {
      return '';
    }

    const snippet = cleaned.length > 52
      ? `${cleaned.slice(0, 49).trimEnd()}...`
      : cleaned;

    return snippet.charAt(0).toLowerCase() + snippet.slice(1);
  }

  private async showWelcomeMessage(characterId: string): Promise<void> {
    const character = this.characters.find(item => item.id === characterId);
    if (character && character.greetingsEnabled === false) {
      if (this.forceNextWelcomeCharacterId === characterId) {
        this.forceNextWelcomeCharacterId = null;
      }
      return;
    }

    const shouldForceGreeting = this.forceNextWelcomeCharacterId === characterId;
    if (!this.shouldShowGreeting(characterId)) {
      if (shouldForceGreeting) {
        this.forceNextWelcomeCharacterId = null;
      }
      return;
    }

    // Only check Gemini capacity if using Gemini provider
    if (!shouldForceGreeting && this.aiService.getLlmProvider() === 'gemini' && !this.aiService.hasGeminiCapacity(2, 2)) {
      return;
    }

    this.loadingScreenTitle = 'Connecting to AI...';
    this.loadingScreenSubtitle = 'Thinking about the greeting...';
    this.isGreetingLoading = true;
    this.cdr.detectChanges();
    const greetingLoadingStartedAt = Date.now();

    try {
      await this.yieldToBrowser();

      if (this.aiService.getLlmProvider() === 'webllm' && !this.webllmService.isModelLoaded()) {
        try {
          await this.ensureWebLlmLoaded(
            'Preparing greeting...',
            'Downloading and caching the AI model for the greeting. This may take a moment on first use.'
          );
        } catch (error: any) {
          console.warn('Could not initialize WebLLM for greeting', error);
          this.openPopup(error?.message || 'Failed to load AI model for the greeting.', 'error');
          return;
        }
      }

      this.forceNextWelcomeCharacterId = null;
      await this.enrichCharacterIfNeeded(characterId);
      const greetingText = await this.generateGreetingWithGemini(characterId);
      if (!greetingText) {
        return;
      }

      let prefetchedGreetingAudio: Blob | null = null;
      const welcomeMessage: Message = {
        id: `welcome_${characterId}_${Date.now()}`,
        text: greetingText,
        sender: 'ai',
        timestamp: new Date(),
        characterId,
        kind: 'welcome'
      };

      this.saveGreetingTimestamp(characterId, welcomeMessage.timestamp);
      this.setLastGreetingFlag(characterId, true);
      this.chatService.addMessage(welcomeMessage);
      this.cdr.detectChanges();

      if (this.autoVoiceEnabled) {
        if (prefetchedGreetingAudio) {
          await this.playAudioBlobForMessage(welcomeMessage, prefetchedGreetingAudio, 'Piper');
        } else {
          await this.speakMessage(welcomeMessage);
        }
      }
    } finally {
      const greetingLoadingElapsed = Date.now() - greetingLoadingStartedAt;
      if (greetingLoadingElapsed < ChatComponent.GREETING_LOADING_MIN_VISIBLE_MS) {
        await this.sleep(ChatComponent.GREETING_LOADING_MIN_VISIBLE_MS - greetingLoadingElapsed);
      }
      this.isGreetingLoading = false;
      this.loadingScreenTitle = 'Connecting to AI...';
      this.loadingScreenSubtitle = 'Please wait while your bot gets ready.';
      this.cdr.detectChanges();
    }
  }

  private async generateGreetingWithGemini(characterId: string): Promise<string | null> {
    if (!this.aiService.hasApiKey()) {
      return null;
    }

    const character = this.characters.find(item => item.id === characterId);
    if (!character) {
      return null;
    }

    const recentMessages = this.chatService
      .getCurrentSessionMessages()
      .filter(message =>
        message.characterId === characterId &&
        message.sender !== 'system' &&
        message.kind !== 'welcome' &&
        !!message.text.trim()
      )
      .slice(-6);

    const meaningfulTopics = this.extractMeaningfulTopics(recentMessages);

    try {
      return await this.aiService.generateCharacterGreeting(
        character,
        this.userName.trim(),
        meaningfulTopics
      );
    } catch (error: any) {
      console.warn('Could not generate greeting with Gemini', error);
      if (this.handleAiRateLimitError(error, 'info')) {
        return null;
      }
      const message = String(error?.message || '').trim();
      this.openPopup(
        message ? `Greeting failed: ${message}` : 'Could not connect to AI for the greeting. Please try again.',
        'info'
      );
      return null;
    }
  }

  private async ensureWebLlmLoaded(title: string, subtitle: string): Promise<void> {
    this.isWebLLMLoading = true;
    this.webLLMProgress = 0;
    this.webLLMLoadingText = 'Loading AI model into cache...';
    this.loadingScreenTitle = title;
    this.loadingScreenSubtitle = subtitle;
    this.isGreetingLoading = true;
    this.cdr.detectChanges();

    try {
      await this.webllmService.initializeModel('gemma3', (progress) => {
        this.webLLMProgress = progress.progress;
        this.webLLMLoadingText = progress.text;
        this.loadingScreenSubtitle = progress.text;
        this.cdr.detectChanges();
      });
    } finally {
      this.isWebLLMLoading = false;
      this.isGreetingLoading = false;
      this.loadingScreenTitle = 'Connecting to AI...';
      this.loadingScreenSubtitle = 'Please wait while your bot gets ready.';
      this.cdr.detectChanges();
    }
  }

  private async yieldToBrowser(): Promise<void> {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }

  private async sleep(ms: number): Promise<void> {
    if (ms <= 0) {
      return;
    }

    await new Promise<void>(resolve => setTimeout(resolve, ms));
  }

  private async enrichCharacterIfNeeded(characterId: string): Promise<void> {
    const current = this.characters.find(character => character.id === characterId);
    if (!current) {
      return;
    }

    const enriched = await this.applyFamousPersonPersona(current);
    if (
      enriched.personality !== current.personality ||
      enriched.tone !== current.tone ||
      enriched.backstory !== current.backstory ||
      enriched.systemPrompt !== current.systemPrompt
    ) {
      this.characterService.updateCharacter(enriched);
    }
  }

  private async applyFamousPersonPersona(character: Character): Promise<Character> {
    const inferred = await this.famousPersonService.inferPersona(character);
    if (!inferred) {
      return character;
    }

    return {
      ...character,
      ...inferred
    };
  }

  private shouldShowGreeting(characterId: string): boolean {
    const lastGreetingFlagMap = this.getLastGreetingFlagMap();
    if (lastGreetingFlagMap[characterId] === true) {
      return false;
    }

    const greetingMap = this.getGreetingTimestampMap();
    const lastGreetingAt = greetingMap[characterId];

    if (!Number.isFinite(lastGreetingAt)) {
      return true;
    }

    return (Date.now() - lastGreetingAt) >= ChatComponent.GREETING_COOLDOWN_MS;
  }

  private saveGreetingTimestamp(characterId: string, timestamp: Date): void {
    const greetingMap = this.getGreetingTimestampMap();
    greetingMap[characterId] = timestamp.getTime();
    localStorage.setItem(ChatComponent.LAST_GREETING_STORAGE_KEY, JSON.stringify(greetingMap));
  }

  private setLastGreetingFlag(characterId: string, value: boolean): void {
    if (!characterId) {
      return;
    }

    const flagMap = this.getLastGreetingFlagMap();
    flagMap[characterId] = value;
    localStorage.setItem(ChatComponent.LAST_GREETING_FLAG_STORAGE_KEY, JSON.stringify(flagMap));
  }

  private getGreetingTimestampMap(): Record<string, number> {
    try {
      const rawValue = localStorage.getItem(ChatComponent.LAST_GREETING_STORAGE_KEY);
      if (!rawValue) {
        return {};
      }

      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return Object.entries(parsed).reduce<Record<string, number>>((acc, [key, value]) => {
        const numericValue = Number(value);
        if (Number.isFinite(numericValue)) {
          acc[key] = numericValue;
        }
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  private getLastGreetingFlagMap(): Record<string, boolean> {
    try {
      const rawValue = localStorage.getItem(ChatComponent.LAST_GREETING_FLAG_STORAGE_KEY);
      if (!rawValue) {
        return {};
      }

      const parsed = JSON.parse(rawValue);
      if (!parsed || typeof parsed !== 'object') {
        return {};
      }

      return Object.entries(parsed).reduce<Record<string, boolean>>((acc, [key, value]) => {
        acc[key] = value === true;
        return acc;
      }, {});
    } catch {
      return {};
    }
  }

  private setupSpeechRecognition(): void {
    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      this.speechRecognitionSupported = false;
      return;
    }

    this.speechRecognitionSupported = true;
    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.lang = 'en-US';

    this.speechRecognition.onresult = (event: any) => {
      let interimText = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0]?.transcript || '';
        if (event.results[i].isFinal) {
          this.speechResult = `${this.speechResult} ${transcript}`.trim();
        } else {
          interimText = `${interimText} ${transcript}`.trim();
        }
      }

      this.liveTranscript = `${this.speechResult} ${interimText}`.trim();
      this.cdr.detectChanges();
    };

    this.speechRecognition.onerror = (event: any) => {
      this.isListening = false;
      this.activeMicPointerId = null;
      if (event?.error === 'not-allowed' || event?.error === 'service-not-allowed') {
        this.openPopup('Microphone access was blocked. Please allow microphone access.', 'error');
      }
      this.cdr.detectChanges();
    };

    this.speechRecognition.onend = () => {
      this.isListening = false;
      this.activeMicPointerId = null;
      void this.finalizeVoiceCapture();
      this.cdr.detectChanges();
    };
  }

  private async finalizeVoiceCapture(): Promise<void> {
    if (this.isFinalizingVoiceCapture) {
      return;
    }

    this.isFinalizingVoiceCapture = true;

    try {
      const transcript = this.applySpeechResult();
      if (!transcript || !this.shouldSendVoiceMessage || this.isLoading) {
        return;
      }

      await this.sendMessage();
    } finally {
      this.shouldSendVoiceMessage = false;
      this.isFinalizingVoiceCapture = false;
    }
  }

  private applySpeechResult(): string {
    const transcript = this.liveTranscript.trim() || this.speechResult.trim();
    this.liveTranscript = '';
    this.speechResult = '';

    if (!transcript) {
      return '';
    }

    this.userInput = this.userInput.trim()
      ? `${this.userInput.trim()} ${transcript}`.trim()
      : transcript;
    this.cdr.detectChanges();
    return transcript;
  }

  private handleAiRateLimitError(error: unknown, popupType: 'error' | 'info'): boolean {
    const message = String((error as any)?.message || '').trim();
    const normalized = message.toLowerCase();
    const isRateLimit =
      normalized.includes('429') ||
      normalized.includes('rate limit') ||
      normalized.includes('quota') ||
      normalized.includes('per-minute limit') ||
      normalized.includes('per minute limit') ||
      normalized.includes('try again in') ||
      normalized.includes('all personal gemini api keys');

    if (!isRateLimit) {
      return false;
    }

    this.openPopup(
      'AI requests are rate limited right now. Open Setup to add or update personal Gemini keys. Your personal keys stay on your device and are not sent to our backend.',
      popupType
    );
    this.openApiKeyDialog();
    return true;
  }
}
