import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { Message, Character } from '../../core/models/ai.models';
import { ChatService } from '../../core/services/chat.service';
import { CharacterService } from '../../core/services/character.service';
import { AIService } from '../../core/services/ai.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.scss']
})
export class ChatComponent implements OnInit {
  messages$: Observable<Message[]>;
  characters$: Observable<Character[]>;
  activeCharacterId$: Observable<string>;
  messages: Message[] = [];
  characters: Character[] = [];
  activeCharacterId = '';
  
  userInput = '';
  isLoading = false;
  apiKeySet = false;
  showApiKeyDialog = false;
  tempApiKey = '';
  autoVoiceEnabled = true; // whether AI responses should be spoken automatically
  currentSpeakingMessageId: string | null = null; // id of the message currently being spoken
  voices: SpeechSynthesisVoice[] = [];
  preferredVoice: SpeechSynthesisVoice | null = null;
  // Per-character voice preference substrings (searched in voice.name or voice.lang)
  characterVoicePreferences: Record<string, string[]> = {
    // calmer, lower voice
    jesus: ['Google', 'en-GB', 'en-US', 'English', 'Male'],
    // upbeat/creative voices
    creative: ['WaveNet', 'Neural', 'Google', 'en-US', 'English', 'Female'],
    // clear, measured, instructional
    teacher: ['Microsoft', 'en-US', 'en-GB', 'English'],
    // warm mentor
    mentor: ['Google', 'en-US', 'English']
  };

  // Per-character extra pause between chunks (ms)
  characterPauseMs: Record<string, number> = {
    jesus: 300,
    creative: 80,
    teacher: 180,
    mentor: 200
  };
  // Persisted per-character explicit voice selection (voice.name). If set, this overrides heuristics.
  // value may be a string or null/empty when no explicit selection is set
  characterVoiceSelection: Record<string, string | null> = {};

  constructor(
    private chatService: ChatService,
    private characterService: CharacterService,
    private aiService: AIService
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
    });

    this.activeCharacterId$.subscribe(id => {
      this.activeCharacterId = id;
      this.chatService.switchCharacter(id);
    });

    this.checkApiKey();
    this.loadAutoVoiceSetting();
    this.loadVoices();
    this.loadVoiceSelections();
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

  // Character add/edit dialog state
  showCharacterDialog = false;
  editingCharacter: Character | null = null;
  // temporary form model for add/edit
  tempCharacter: Partial<Character> = {};

  openAddCharacterDialog(): void {
    this.editingCharacter = null;
    this.tempCharacter = {
      id: '',
      name: '',
      personality: '',
      tone: '',
      backstory: '',
      systemPrompt: '',
      isActive: false,
      voice: ''
    };
    this.showCharacterDialog = true;
  }

  openEditCharacterDialog(characterId: string): void {
    const ch = this.characters.find(c => c.id === characterId);
    if (!ch) return;
    this.editingCharacter = ch;
    // clone
    this.tempCharacter = { ...ch, voice: ch.voice || '' };
    this.showCharacterDialog = true;
  }

  closeCharacterDialog(): void {
    this.showCharacterDialog = false;
    this.tempCharacter = {};
    this.editingCharacter = null;
  }

  saveCharacter(): void {
    // basic validation
    const name = (this.tempCharacter.name || '').trim();
    if (!name) {
      alert('Please provide a character name');
      return;
    }

    const character: Character = {
      id: this.editingCharacter ? this.editingCharacter.id : (this.tempCharacter.id && this.tempCharacter.id.trim()) || ('char_' + Date.now()),
      name: name,
      personality: this.tempCharacter.personality || '',
      tone: this.tempCharacter.tone || '',
      backstory: this.tempCharacter.backstory || '',
      systemPrompt: this.tempCharacter.systemPrompt || '',
      isActive: !!this.tempCharacter.isActive,
      voice: this.tempCharacter.voice || ''
    };

    if (this.editingCharacter) {
      this.characterService.updateCharacter(character);
    } else {
      this.characterService.addCharacter(character);
    }

    // persist the selected voice in our selection map and save
    if (character.voice) {
      this.characterVoiceSelection[character.id] = character.voice;
    } else {
      delete this.characterVoiceSelection[character.id];
    }
    this.saveVoiceSelection(character.id);

    this.closeCharacterDialog();
  }

  deleteCharacter(characterId: string): void {
    if (!confirm('Delete this character?')) return;
    this.characterService.deleteCharacter(characterId);
    delete this.characterVoiceSelection[characterId];
    this.saveVoiceSelection(characterId);
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

  checkApiKey(): void {
    this.apiKeySet = !!localStorage.getItem('geminiApiKey');
  }

  openApiKeyDialog(): void {
    this.showApiKeyDialog = true;
    this.tempApiKey = '';
  }

  closeApiKeyDialog(): void {
    this.showApiKeyDialog = false;
    this.tempApiKey = '';
  }

  saveApiKey(): void {
    if (this.tempApiKey.trim()) {
      this.aiService.setApiKey(this.tempApiKey);
      this.apiKeySet = true;
      this.showApiKeyDialog = false;
      this.tempApiKey = '';
    }
  }

  async sendMessage(): Promise<void> {
    if (!this.userInput.trim()) return;
    if (!this.apiKeySet) {
      alert('Please set your Google Gemini API key first');
      return;
    }

    const text = this.userInput;
    this.userInput = '';
    this.isLoading = true;

    try {
      // Add user message
      const userMessage: Message = {
        id: 'msg_' + Date.now(),
        text: text,
        sender: 'user',
        timestamp: new Date(),
        characterId: this.activeCharacterId
      };
      this.chatService.addMessage(userMessage);

      // Get active character
      const activeChar = this.characters.find(c => c.id === this.activeCharacterId);
      if (!activeChar) return;

      // Get AI response
      const aiResponse = await this.aiService.sendMessage(text, this.activeCharacterId, activeChar);
      
      // Add AI message
      const aiMessage: Message = {
        id: 'msg_' + Date.now() + '_ai',
        text: aiResponse,
        sender: 'ai',
        timestamp: new Date(),
        characterId: this.activeCharacterId
      };
      this.chatService.addMessage(aiMessage);
      // Automatically speak the AI response if enabled
      if (this.autoVoiceEnabled) {
        // give a slight delay to ensure UI updates and selection of voice
        setTimeout(() => this.speakMessage(aiMessage), 50);
      }

    } catch (error: any) {
      alert('Error: ' + error.message);
      console.error('Error:', error);
    } finally {
      this.isLoading = false;
    }
  }

  selectCharacter(characterId: string): void {
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

  speakMessage(msg: Message): void {
    // Cancel any ongoing speech and set current speaking id
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }

    // mark this message as currently speaking
    this.currentSpeakingMessageId = msg.id;

    // Split text into sentence-like chunks for more natural pacing
    const chunks = this.splitTextIntoChunks(msg.text, 180);

    const character = this.characters.find(c => c.id === msg.characterId);

    // base pitch and rate per character with subtle randomness for variation
    let basePitch = 1;
    let baseRate = 1;
    if (character) {
      switch (character.id) {
        case 'jesus':
          basePitch = 0.95; baseRate = 0.95; break;
        case 'creative':
          basePitch = 1.15; baseRate = 1.05; break;
        case 'teacher':
          basePitch = 0.98; baseRate = 0.95; break;
        case 'mentor':
          basePitch = 0.9; baseRate = 1.0; break;
        default:
          basePitch = 1; baseRate = 1;
      }
    }

    const synth = window.speechSynthesis;
    let isCancelled = false;

    const speakChunk = (index: number) => {
      if (isCancelled || index >= chunks.length) {
        // finished
        this.currentSpeakingMessageId = null;
        return;
      }

      const text = chunks[index];
      const u = new SpeechSynthesisUtterance(text);

      // apply slight random variation to avoid monotony
      const randomPitch = basePitch + (Math.random() - 0.5) * 0.08; // ±0.04
      const randomRate = baseRate + (Math.random() - 0.5) * 0.08;
      u.pitch = Math.max(0.7, Math.min(2, randomPitch));
      u.rate = Math.max(0.6, Math.min(1.5, randomRate));
      u.volume = 1;

      // pick voice for this character if possible, otherwise use preferredVoice
      const v = this.getVoiceForCharacter(msg.characterId) || this.preferredVoice;
      if (v) {
        u.voice = v;
        if (v.lang) u.lang = v.lang;
      }

      u.onend = () => {
        // small natural pause before next chunk; vary by character for personality
        const charPause = (character && this.characterPauseMs[character.id]) ? this.characterPauseMs[character.id] : 120;
        const pause = charPause + Math.floor(Math.random() * 80) - 30; // add a touch of randomness
        setTimeout(() => speakChunk(index + 1), Math.max(30, pause));
      };

      u.onerror = () => {
        // on error, stop and clear state
        isCancelled = true;
        this.currentSpeakingMessageId = null;
      };

      synth.speak(u);
    };

    // start speaking first chunk
    speakChunk(0);
  }

  // Load available voices and choose a preferred one for more natural speech
  loadVoices(): void {
    try {
      const synth = window.speechSynthesis;
      const setVoices = () => {
        this.voices = synth.getVoices() || [];
        this.selectPreferredVoice();
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

    // Priority list of substrings to look for in voice.name or voice.lang
    const priorities = [
      'Google',
      'WaveNet',
      'Neural',
      'Microsoft',
      'en-US',
      'English'
    ];

    for (const p of priorities) {
      const found = this.voices.find(v => (v.name && v.name.includes(p)) || (v.lang && v.lang.includes(p)));
      if (found) {
        this.preferredVoice = found;
        return;
      }
    }

    // fallback to first available
    this.preferredVoice = this.voices[0];
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

      const prefs = this.characterVoicePreferences[characterId];
      if (!prefs || prefs.length === 0) return null;

      // prefer voices with en (english) if present, then check preferences
      const englishMatch = this.voices.find(v => v.lang && v.lang.startsWith('en'));
      if (englishMatch) return englishMatch;

      for (const p of prefs) {
        const found = this.voices.find(v => (v.name && v.name.includes(p)) || (v.lang && v.lang.includes(p)));
        if (found) return found;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  // Split long text into shorter chunks by sentence boundaries while respecting a max length
  private splitTextIntoChunks(text: string, maxLen: number): string[] {
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
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
            const part = s.substr(start, maxLen).trim();
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

  stopSpeaking(): void {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }
    this.currentSpeakingMessageId = null;
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
}
