import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Character } from '../../../../core/models/ai.models';
import { CharacterService } from '../../../../core/services/character.service';
import { GEMINI_VOICE_CATALOG, GeminiVoiceCatalogItem } from '../../../../core/models/gemini-voice-catalog';

@Component({
  selector: 'app-add-character',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-character.component.html',
  styleUrls: ['./add-character.component.scss']
})
export class AddCharacterComponent implements OnInit {
  readonly geminiVoiceOptions: GeminiVoiceCatalogItem[] = GEMINI_VOICE_CATALOG;

  @Input() editingCharacter: Character | null = null;
  @Input() isFamousPersonCharacter = false;
  
  @Output() save = new EventEmitter<Partial<Character>>();
  @Output() cancel = new EventEmitter<void>();
  @Output() delete = new EventEmitter<string>();
  @Output() famousPersonToggle = new EventEmitter<boolean>();

  tempCharacter: Partial<Character> = {};

  constructor(private characterService: CharacterService) {}

  ngOnInit(): void {
    this.resetForm();
  }

  ngOnChanges(): void {
    this.resetForm();
  }

  private resetForm(): void {
    if (this.editingCharacter) {
      this.tempCharacter = {
        ...this.editingCharacter,
        greetingsEnabled: this.editingCharacter.greetingsEnabled !== false,
        shortAnswers: !!this.editingCharacter.shortAnswers,
        voice: this.editingCharacter.voice || '',
        ttsVoiceName: this.editingCharacter.ttsVoiceName || '',
        ttsLanguageCode: this.editingCharacter.ttsLanguageCode || '',
        ttsPitch: typeof this.editingCharacter.ttsPitch === 'number' ? this.editingCharacter.ttsPitch : null
      };
    } else {
      this.tempCharacter = {
        id: '',
        name: '',
        personality: '',
        tone: '',
        backstory: '',
        systemPrompt: '',
        greetingsEnabled: true,
        shortAnswers: false,
        isActive: false,
        voice: '',
        ttsVoiceName: '',
        ttsLanguageCode: '',
        ttsPitch: null
      };
    }
  }

  onSave(): void {
    const name = (this.tempCharacter.name || '').trim();
    if (!name) {
      return;
    }

    const character: Character = {
      id: this.editingCharacter?.id || this.tempCharacter.id?.trim() || ('char_' + Date.now()),
      name: name,
      personality: this.isFamousPersonCharacter ? '' : (this.tempCharacter.personality || ''),
      tone: this.isFamousPersonCharacter ? '' : (this.tempCharacter.tone || ''),
      backstory: this.isFamousPersonCharacter ? '' : (this.tempCharacter.backstory || ''),
      systemPrompt: this.isFamousPersonCharacter ? '' : (this.tempCharacter.systemPrompt || ''),
      greetingsEnabled: this.tempCharacter.greetingsEnabled !== false,
      shortAnswers: !!this.tempCharacter.shortAnswers,
      isActive: !!this.tempCharacter.isActive,
      voice: this.tempCharacter.voice || '',
      ttsVoiceName: this.tempCharacter.ttsVoiceName || '',
      ttsLanguageCode: this.tempCharacter.ttsLanguageCode || '',
      ttsPitch: typeof this.tempCharacter.ttsPitch === 'number' ? this.tempCharacter.ttsPitch : null
    };

    this.save.emit(character);
  }

  onCancel(): void {
    this.cancel.emit();
  }

  onDelete(): void {
    if (this.editingCharacter) {
      this.delete.emit(this.editingCharacter.id);
    }
  }

  onFamousPersonToggle(): void {
    this.famousPersonToggle.emit(this.isFamousPersonCharacter);
  }

  onNameChange(): void {
    this.characterService.setTempCharacterName(this.tempCharacter.name || '');
  }

  onPitchChange(value: string | number): void {
    const pitch = Number(value);
    this.tempCharacter.ttsPitch = Number.isFinite(pitch) ? pitch : null;
  }

  get hasCustomPitch(): boolean {
    const pitch = this.tempCharacter.ttsPitch;
    return typeof pitch === 'number' && Number.isFinite(pitch);
  }

  get hasVoiceSettings(): boolean {
    return !!this.tempCharacter.ttsVoiceName || !!this.tempCharacter.ttsLanguageCode || this.hasCustomPitch;
  }

  get pitchSliderValue(): number {
    return this.hasCustomPitch ? (this.tempCharacter.ttsPitch as number) : 1;
  }
}
