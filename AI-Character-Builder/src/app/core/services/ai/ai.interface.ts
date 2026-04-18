import { Character } from '../../models/ai.models';

export interface AiService {
  sendMessage(text: string, character: Character): Promise<string>;
  generateGreeting(character: Character, userName: string, recentTopics: string[]): Promise<string>;
  generateCharacterPersona(figure: { title: string; description?: string; extract?: string }): Promise<Partial<Character> | null>;
  isAvailable(): Promise<boolean>;
  getName(): string;
}
