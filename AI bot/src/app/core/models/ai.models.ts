export interface Message {
  id: string;
  text: string;
  sender: 'user' | 'ai';
  timestamp: Date;
  characterId: string;
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
}

export interface ChatSession {
  id: string;
  characterId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
