import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Character } from '../../../../core/models/ai.models';
import { CharacterService } from '../../../../core/services/character.service';

@Component({
  selector: 'app-add-character',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './add-character.component.html',
  styleUrls: ['./add-character.component.scss']
})
export class AddCharacterComponent implements OnInit {
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
        voice: this.editingCharacter.voice || ''
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
        isActive: false,
        voice: ''
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
      isActive: !!this.tempCharacter.isActive,
      voice: this.tempCharacter.voice || ''
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
}
