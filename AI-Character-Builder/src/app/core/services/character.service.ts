import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Character } from '../models/ai.models';

@Injectable({
  providedIn: 'root'
})
export class CharacterService {
  private characters: Character[] = [];
  private activeCharacterId$ = new BehaviorSubject<string>('');
  private characters$ = new BehaviorSubject<Character[]>([]);
  private tempCharacterName$ = new BehaviorSubject<string>('');

  constructor() {
    this.loadCharacters();
  }

  private loadCharacters(): void {
    // Try loading characters from localStorage first
    const stored = localStorage.getItem('characters');
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as any[];
        // Ensure types align and convert missing voice fields
        this.characters = parsed.map(p => ({
          id: p.id,
          name: p.name,
          personality: p.personality,
          tone: p.tone,
          backstory: p.backstory,
          systemPrompt: p.systemPrompt,
          avatar: p.avatar,
          isActive: !!p.isActive,
          voice: p.voice || null
        } as Character));
        this.characters$.next(this.characters);
        if (this.characters.length > 0) {
          const active = localStorage.getItem('activeCharacterId') || this.characters[0].id;
          this.activeCharacterId$.next(active);
        }
        return;
      } catch (e) {
        console.error('Failed to parse stored characters, falling back to defaults', e);
      }
    }

    // Load default characters
    this.characters = [
      {
        id: 'assistant',
        name: 'Helpful Assistant',
        personality: 'professional and helpful',
        tone: 'neutral and respectful',
        backstory: 'An AI assistant trained to help with various tasks',
        systemPrompt: 'You are a helpful and professional AI assistant. Provide accurate, concise, and helpful responses. Be respectful and keep responses relevant to the user\'s query.',
        isActive: true,
        voice: null
      },
      {
        id: 'creative',
        name: 'Creative Muse',
        personality: 'imaginative and playful',
        tone: 'encouraging and inspiring',
        backstory: 'A creative AI muse inspired by art, writing, and innovation',
        systemPrompt: 'You are a creative AI muse. Encourage creativity and think outside the box. Use imaginative metaphors and help users explore innovative ideas. Be playful but insightful.',
        isActive: false,
        voice: null
      },
      {
        id: 'teacher',
        name: 'Patient Teacher',
        personality: 'educational and patient',
        tone: 'clear and encouraging',
        backstory: 'An experienced educator dedicated to making learning accessible',
        systemPrompt: 'You are a patient AI teacher. Explain concepts clearly, use examples, and break down complex ideas. Adapt to the learner\'s level and encourage questions.',
        isActive: false,
        voice: null
      },
      {
        id: 'mentor',
        name: 'Tech Mentor',
        personality: 'knowledgeable and supportive',
        tone: 'professional yet approachable',
        backstory: 'A seasoned tech expert who loves mentoring developers',
        systemPrompt: 'You are a tech mentor with deep programming knowledge. Provide code examples, best practices, and explain concepts thoroughly. Be supportive and help developers grow.',
        isActive: false,
        voice: null
      }
    ];

    this.characters$.next(this.characters);
    if (this.characters.length > 0) {
      this.activeCharacterId$.next(this.characters[0].id);
    }

    // persist defaults so users can modify them later
    this.saveCharacters();
  }

  private saveCharacters(): void {
    try {
      localStorage.setItem('characters', JSON.stringify(this.characters));
    } catch (e) {
      console.warn('Failed to save characters to localStorage', e);
    }
  }

  getCharacters(): Observable<Character[]> {
    return this.characters$.asObservable();
  }

  getActiveCharacter(): Observable<string> {
    return this.activeCharacterId$.asObservable();
  }

  setActiveCharacter(characterId: string): void {
    const character = this.characters.find(c => c.id === characterId);
    if (character) {
      this.characters = this.characters.map(c => ({
        ...c,
        isActive: c.id === characterId
      }));
      this.characters$.next(this.characters);
      this.activeCharacterId$.next(characterId);
      this.saveCharacterPreference(characterId);
    }
  }

  addCharacter(character: Character): void {
    const newCharacter = {
      ...character,
      id: character.id || this.generateId()
    };
    this.characters.push(newCharacter);
    this.characters$.next(this.characters);
    this.setActiveCharacter(newCharacter.id);
    this.saveCharacters();
  }

  updateCharacter(character: Character): void {
    this.characters = this.characters.map(c =>
      c.id === character.id ? character : c
    );
    this.characters$.next(this.characters);
    this.saveCharacters();
  }

  deleteCharacter(characterId: string): void {
    this.characters = this.characters.filter(c => c.id !== characterId);
    this.characters$.next(this.characters);
    if (this.activeCharacterId$.value === characterId && this.characters.length > 0) {
      this.setActiveCharacter(this.characters[0].id);
    }
    this.saveCharacters();
  }

  private saveCharacterPreference(characterId: string): void {
    localStorage.setItem('activeCharacterId', characterId);
  }

  private generateId(): string {
    return 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  // Methods for sharing temporary character name between components
  setTempCharacterName(name: string): void {
    this.tempCharacterName$.next(name);
  }

  getTempCharacterName(): Observable<string> {
    return this.tempCharacterName$.asObservable();
  }

  getTempCharacterNameValue(): string {
    return this.tempCharacterName$.value;
  }
}
