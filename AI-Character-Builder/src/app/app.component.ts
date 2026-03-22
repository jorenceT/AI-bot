import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatComponent } from './features/chat/chat.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule, ChatComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'AI Chatbot';
  pin = '';
  confirmPin = '';
  pinInput = '';
  isLocked = true;
  isPinConfigured = false;
  pinError = '';
  isSubmitting = false;

  private readonly pinStorageKey = 'appPinLockHash';

  ngOnInit(): void {
    this.isPinConfigured = !!localStorage.getItem(this.pinStorageKey);
    this.isLocked = this.isPinConfigured;
  }

  async setPin(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    const normalizedPin = this.pin.trim();
    const normalizedConfirm = this.confirmPin.trim();

    if (!/^\d{4,6}$/.test(normalizedPin)) {
      this.pinError = 'Use a 4 to 6 digit PIN.';
      return;
    }

    if (normalizedPin !== normalizedConfirm) {
      this.pinError = 'PINs do not match.';
      return;
    }

    this.isSubmitting = true;
    this.pinError = '';

    try {
      const hash = await this.hashPin(normalizedPin);
      localStorage.setItem(this.pinStorageKey, hash);
      this.pin = '';
      this.confirmPin = '';
      this.isPinConfigured = true;
      this.isLocked = false;
    } finally {
      this.isSubmitting = false;
    }
  }

  async unlockApp(): Promise<void> {
    if (this.isSubmitting) {
      return;
    }

    if (!/^\d{4,6}$/.test(this.pinInput.trim())) {
      this.pinError = 'Enter your 4 to 6 digit PIN.';
      return;
    }

    const savedHash = localStorage.getItem(this.pinStorageKey);
    if (!savedHash) {
      this.isPinConfigured = false;
      this.isLocked = false;
      return;
    }

    this.isSubmitting = true;
    this.pinError = '';

    try {
      const hash = await this.hashPin(this.pinInput.trim());
      if (hash === savedHash) {
        this.pinInput = '';
        this.isLocked = false;
        return;
      }

      this.pinError = 'Incorrect PIN. Try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  private async hashPin(pinValue: string): Promise<string> {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(pinValue);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }
}
