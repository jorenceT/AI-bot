export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai' | 'system';
  timestamp: Date;
  characterId: string;
  kind?: 'session-open' | 'welcome';
}

export interface Character {
  id: string;
  name: string;
  personality: string;
  tone: string;
  backstory: string;
  systemPrompt: string;
  avatar?: string;
  isActive: boolean;
  greetingsEnabled?: boolean;
  // optional voice name selected for this character (browser voice.name)
  voice?: string | null;
}

export interface ChatSession {
  id: string;
  characterId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
