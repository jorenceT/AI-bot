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
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(msg.text);
    
    // Set voice properties based on character
    const character = this.characters.find(c => c.id === msg.characterId);
    
    if (character) {
      switch (character.id) {
        case 'jesus':
          utterance.pitch = 0.9;
          utterance.rate = 0.9;
          utterance.volume = 1;
          break;
        case 'creative':
          utterance.pitch = 1.2;
          utterance.rate = 1.1;
          break;
        case 'teacher':
          utterance.pitch = 0.95;
          utterance.rate = 0.95;
          break;
        case 'mentor':
          utterance.pitch = 0.85;
          utterance.rate = 1;
          break;
        default:
          utterance.pitch = 1;
          utterance.rate = 1;
      }
    } else {
      utterance.pitch = 1;
      utterance.rate = 1;
    }

    window.speechSynthesis.speak(utterance);
  }
}
