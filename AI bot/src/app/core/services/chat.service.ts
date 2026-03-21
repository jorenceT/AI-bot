import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { Message, ChatSession } from '../models/ai.models';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private currentSession: ChatSession | null = null;
  private sessions: Map<string, ChatSession> = new Map();
  private messages$ = new BehaviorSubject<Message[]>([]);

  constructor() {
    this.loadSessions();
  }

  getMessages(): Observable<Message[]> {
    return this.messages$.asObservable();
  }

  addMessage(message: Message): void {
    if (!this.currentSession) {
      this.createSession(message.characterId);
    }

    if (this.currentSession) {
      this.currentSession.messages.push(message);
      this.currentSession.updatedAt = new Date();
      this.messages$.next([...this.currentSession.messages]);
      this.saveSessions();
    }
  }

  createSession(characterId: string): void {
    this.currentSession = {
      id: this.generateSessionId(),
      characterId: characterId,
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.sessions.set(this.currentSession.id, this.currentSession);
    this.messages$.next([]);
  }

  switchCharacter(characterId: string): void {
    // Try to find existing session for this character
    let session = Array.from(this.sessions.values()).find(s => s.characterId === characterId);
    
    if (!session) {
      this.createSession(characterId);
    } else {
      this.currentSession = session;
      this.messages$.next([...session.messages]);
    }
  }

  getCurrentSessionMessages(): Message[] {
    return this.currentSession?.messages || [];
  }

  clearCurrentSession(): void {
    if (this.currentSession) {
      this.currentSession.messages = [];
      this.messages$.next([]);
    }
  }

  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    if (this.currentSession?.id === sessionId) {
      this.currentSession = null;
      this.messages$.next([]);
    }
    this.saveSessions();
  }

  getSessions(): ChatSession[] {
    return Array.from(this.sessions.values());
  }

  private saveSessions(): void {
    const sessionsData = Array.from(this.sessions.values()).map(session => ({
      ...session,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
      messages: session.messages.map(msg => ({
        ...msg,
        timestamp: msg.timestamp.toISOString()
      }))
    }));
    localStorage.setItem('chatSessions', JSON.stringify(sessionsData));
  }

  private loadSessions(): void {
    const sessionsData = localStorage.getItem('chatSessions');
    if (sessionsData) {
      try {
        const parsed = JSON.parse(sessionsData);
        parsed.forEach((session: any) => {
          const chatSession: ChatSession = {
            ...session,
            createdAt: new Date(session.createdAt),
            updatedAt: new Date(session.updatedAt),
            messages: session.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          };
          this.sessions.set(session.id, chatSession);
        });
      } catch (error) {
        console.error('Error loading sessions:', error);
      }
    }
  }

  private generateSessionId(): string {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}
