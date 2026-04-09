import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

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
  @Input() apiKeys: string[] = [''];
  @Input() isSavingApiKey = false;

  @Output() saveApiKey = new EventEmitter<{
    apiKeys: string[];
  }>();
  @Output() clearApiKey = new EventEmitter<void>();
  @Output() closeDialog = new EventEmitter<void>();
  @Output() addApiKeyField = new EventEmitter<void>();
  @Output() removeApiKeyField = new EventEmitter<number>();

  tempApiKeys: string[] = [''];

  ngOnInit(): void {
    this.resetTempValues();
  }

  ngOnChanges(): void {
    this.resetTempValues();
  }

  private resetTempValues(): void {
    this.tempApiKeys = [...this.apiKeys];
  }

  onSave(): void {
    this.normalizeApiKeys();
    this.saveApiKey.emit({
      apiKeys: this.tempApiKeys
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

    return this.hasAnyApiKeys() || this.apiKeySet;
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
