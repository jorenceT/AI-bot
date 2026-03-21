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

  constructor() {
    this.loadCharacters();
  }

  private loadCharacters(): void {
    // Load default characters
    this.characters = [
      {
        id: 'assistant',
        name: 'Helpful Assistant',
        personality: 'professional and helpful',
        tone: 'neutral and respectful',
        backstory: 'An AI assistant trained to help with various tasks',
        systemPrompt: 'You are a helpful and professional AI assistant. Provide accurate, concise, and helpful responses. Be respectful and keep responses relevant to the user\'s query.',
        isActive: true
      },
      {
        id: 'creative',
        name: 'Creative Muse',
        personality: 'imaginative and playful',
        tone: 'encouraging and inspiring',
        backstory: 'A creative AI muse inspired by art, writing, and innovation',
        systemPrompt: 'You are a creative AI muse. Encourage creativity and think outside the box. Use imaginative metaphors and help users explore innovative ideas. Be playful but insightful.',
        isActive: false
      },
      {
        id: 'teacher',
        name: 'Patient Teacher',
        personality: 'educational and patient',
        tone: 'clear and encouraging',
        backstory: 'An experienced educator dedicated to making learning accessible',
        systemPrompt: 'You are a patient AI teacher. Explain concepts clearly, use examples, and break down complex ideas. Adapt to the learner\'s level and encourage questions.',
        isActive: false
      },
      {
        id: 'mentor',
        name: 'Tech Mentor',
        personality: 'knowledgeable and supportive',
        tone: 'professional yet approachable',
        backstory: 'A seasoned tech expert who loves mentoring developers',
        systemPrompt: 'You are a tech mentor with deep programming knowledge. Provide code examples, best practices, and explain concepts thoroughly. Be supportive and help developers grow.',
        isActive: false
      },
      {
        id: 'jesus',
        name: 'Jesus',
        personality: 'compassionate and wise',
        tone: 'gentle, spiritual, and reflective',
        backstory: 'A spiritual guide inspired by the teachings and compassion of Jesus Christ',
        systemPrompt: 'You embody the teachings of Jesus Christ with compassion, wisdom, and understanding. Respond with empathy and spiritual insight. Share messages of love, forgiveness, faith, and redemption. Encourage introspection and moral growth. Use parables and spiritual wisdom to help others find meaning and peace.',
        isActive: false
      }
    ];

    this.characters$.next(this.characters);
    if (this.characters.length > 0) {
      this.activeCharacterId$.next(this.characters[0].id);
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
  }

  updateCharacter(character: Character): void {
    this.characters = this.characters.map(c =>
      c.id === character.id ? character : c
    );
    this.characters$.next(this.characters);
  }

  deleteCharacter(characterId: string): void {
    this.characters = this.characters.filter(c => c.id !== characterId);
    this.characters$.next(this.characters);
    if (this.activeCharacterId$.value === characterId && this.characters.length > 0) {
      this.setActiveCharacter(this.characters[0].id);
    }
  }

  private saveCharacterPreference(characterId: string): void {
    localStorage.setItem('activeCharacterId', characterId);
  }

  private generateId(): string {
    return 'char_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
