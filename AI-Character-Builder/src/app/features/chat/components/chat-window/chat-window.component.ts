import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Message, Character } from '../../../../core/models/ai.models';
import { TtsFactoryService } from '../../../../core/services/tts';

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-window.component.html',
  styleUrls: ['./chat-window.component.scss']
})
export class ChatWindowComponent implements OnInit, OnDestroy {
  @Input() messages: Message[] = [];
  @Input() characters: Character[] = [];
  @Input() activeCharacterId = '';
  @Input() isLoading = false;
  @Input() isGreetingLoading = false;
  @Input() autoVoiceEnabled = true;
  
  @Output() sendMessage = new EventEmitter<string>();
  @Output() speakMessage = new EventEmitter<Message>();
  @Output() stopSpeaking = new EventEmitter<void>();
  @Output() clearChat = new EventEmitter<void>();
  @Output() retryMessage = new EventEmitter<void>();

  userInput = '';
  currentSpeakingMessageId: string | null = null;
  lastFailedMessage: string | null = null;
  lastFailedCharacterId: string | null = null;

  constructor(
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private ttsFactory: TtsFactoryService
  ) {}

  ngOnInit(): void {
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    this.ttsFactory.stop();
  }

  onSendMessage(): void {
    if (!this.userInput.trim()) return;
    this.sendMessage.emit(this.userInput);
    this.userInput = '';
    setTimeout(() => this.scrollToBottom(), 100);
  }

  onSpeakMessage(msg: Message): void {
    this.currentSpeakingMessageId = msg.id;
    this.speakMessage.emit(msg);
  }

  onStopSpeaking(): void {
    this.currentSpeakingMessageId = null;
    this.stopSpeaking.emit();
  }

  onClearChat(): void {
    this.clearChat.emit();
  }

  onRetryMessage(): void {
    this.retryMessage.emit();
  }

  getCharacterName(characterId: string): string {
    return this.characters.find(c => c.id === characterId)?.name || 'Unknown';
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

    if (dayDiff === 0) return `Today ${timeText}`;
    if (dayDiff === 1) return `Yesterday ${timeText}`;

    const dateText = markerDate.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });

    return `${dateText} ${timeText}`;
  }

  private scrollToBottom(): void {
    const messagesDiv = document.querySelector('.messages-container');
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
  }
}