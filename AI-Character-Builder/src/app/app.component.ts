import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Capacitor } from '@capacitor/core';
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
  userName = '';
  isLocked = true;
  isPinConfigured = false;
  showNameStep = false;
  pinError = '';
  isSubmitting = false;

  private readonly pinStorageKey = 'appPinLockHash';
  private readonly userNameStorageKey = 'appUserName';
  private readonly micPermissionRequestedStorageKey = 'micPermissionRequested';

  ngOnInit(): void {
    this.isPinConfigured = !!localStorage.getItem(this.pinStorageKey);
    this.isLocked = this.isPinConfigured;
    this.userName = localStorage.getItem(this.userNameStorageKey) || '';
    this.showNameStep = !this.isLocked && !this.userName.trim();
    void this.requestMicrophonePermissionOnFirstLoad();
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
      this.finishUnlock();
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
        this.finishUnlock();
        return;
      }

      this.pinError = 'Incorrect PIN. Try again.';
    } finally {
      this.isSubmitting = false;
    }
  }

  saveUserName(): void {
    const normalizedName = this.userName.trim();
    if (!normalizedName) {
      this.pinError = 'Enter your name to continue.';
      return;
    }

    localStorage.setItem(this.userNameStorageKey, normalizedName);
    this.userName = normalizedName;
    this.showNameStep = false;
    this.pinError = '';
  }

  private finishUnlock(): void {
    this.isLocked = false;
    this.pinError = '';
    this.showNameStep = !this.userName.trim();
  }

  private async hashPin(pinValue: string): Promise<string> {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(pinValue);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
      .map(byte => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  private async requestMicrophonePermissionOnFirstLoad(): Promise<void> {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return;
    }

    if (localStorage.getItem(this.micPermissionRequestedStorageKey) === 'true') {
      return;
    }

    const permissionState = await this.getMicrophonePermissionState();
    if (permissionState === 'granted' || permissionState === 'denied') {
      localStorage.setItem(this.micPermissionRequestedStorageKey, 'true');
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (error) {
      console.warn('Microphone permission request was not granted on first load.', error);
    } finally {
      localStorage.setItem(this.micPermissionRequestedStorageKey, 'true');
    }
  }

  private async getMicrophonePermissionState(): Promise<PermissionState | 'unknown'> {
    if (!navigator.permissions?.query) {
      return 'unknown';
    }

    try {
      const status = await navigator.permissions.query({
        name: 'microphone' as PermissionName
      });
      return status.state;
    } catch (error) {
      return 'unknown';
    }
  }
}
