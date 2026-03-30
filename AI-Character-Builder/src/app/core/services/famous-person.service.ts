import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { Character } from '../models/ai.models';

interface WikipediaSummaryResponse {
  type?: string;
  title?: string;
  description?: string;
  extract?: string;
  content_urls?: {
    desktop?: {
      page?: string;
    };
  };
}

interface WikipediaSearchResponse {
  query?: {
    search?: Array<{
      title: string;
      snippet?: string;
    }>;
  };
}

interface FamousPersonaProfile {
  name?: string;
  personality: string;
  tone: string;
  backstory: string;
  systemPrompt: string;
  sourceUrl?: string;
}

export interface ResolvedKnownFigure {
  title: string;
  description: string;
  extract: string;
  sourceUrl?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FamousPersonService {
  private static readonly CACHE_KEY = 'famousPersonProfiles';
  private static readonly CACHE_VERSION = 'v3'; // Increment this when system prompt changes
  private readonly cache = new Map<string, FamousPersonaProfile>();

  constructor(private http: HttpClient) {
    this.loadCache();
  }

  async inferPersona(character: Character): Promise<Partial<Character> | null> {
    const requestedName = this.normalizeName(character.name);
    if (!requestedName) {
      return null;
    }

    const cached = this.cache.get(requestedName);
    if (cached) {
      return this.mergeWithCharacter(character, cached);
    }

    try {
      const summary = await this.resolveBestWikipediaSummary(character.name);
      if (!summary) {
        return null;
      }

      const profile = this.buildProfile(summary);
      this.cache.set(requestedName, profile);
      this.saveCache();
      return this.mergeWithCharacter(character, profile);
    } catch {
      return null;
    }
  }

  async lookupKnownFigure(name: string): Promise<ResolvedKnownFigure | null> {
    const summary = await this.resolveBestWikipediaSummary(name);
    if (!summary) {
      return null;
    }

    return {
      title: summary.title || name.trim(),
      description: summary.description || '',
      extract: summary.extract || '',
      sourceUrl: summary.content_urls?.desktop?.page
    };
  }

  private async resolveBestWikipediaSummary(name: string): Promise<WikipediaSummaryResponse | null> {
    const directCandidates = this.getDirectNameCandidates(name);

    for (const candidate of directCandidates) {
      const summary = await this.fetchWikipediaSummary(candidate);
      if (summary) {
        return summary;
      }
    }

    const searchTitles = await this.fetchWikipediaSearchTitles(name);
    for (const title of searchTitles) {
      const summary = await this.fetchWikipediaSummary(title);
      if (summary) {
        return summary;
      }
    }

    return null;
  }

  private async fetchWikipediaSummary(name: string): Promise<WikipediaSummaryResponse | null> {
    const title = encodeURIComponent(name.trim().replace(/\s+/g, '_'));
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`;
    try {
      const response = await firstValueFrom(
        this.http.get<WikipediaSummaryResponse>(url).pipe(timeout(6000))
      );
      return response || null;
    } catch {
      return null;
    }
  }

  private async fetchWikipediaSearchTitles(name: string): Promise<string[]> {
    const query = encodeURIComponent(name.trim());
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&utf8=1&format=json&origin=*`;

    try {
      const response = await firstValueFrom(
        this.http.get<WikipediaSearchResponse>(url).pipe(timeout(6000))
      );

      const normalizedName = this.normalizeName(name);
      const results = response.query?.search || [];

      return results
        .slice(0, 8)
        .sort((a, b) => this.scoreSearchResult(b, normalizedName) - this.scoreSearchResult(a, normalizedName))
        .map(result => result.title);
    } catch {
      return [];
    }
  }

  private buildProfile(summary: WikipediaSummaryResponse): FamousPersonaProfile {
    const title = summary.title || 'This character';
    const description = (summary.description || '').toLowerCase();
    const extract = (summary.extract || '').trim();
    const sourceUrl = summary.content_urls?.desktop?.page;

    const override = this.getManualOverride(title, description, extract, sourceUrl);
    if (override) {
      return override;
    }

    const traits: string[] = [];
    const toneTraits: string[] = [];

    if (description.includes('martial artist')) {
      traits.push('disciplined', 'focused', 'physically expressive');
      toneTraits.push('direct', 'calm', 'confident');
    }

    if (description.includes('philosopher') || extract.toLowerCase().includes('philosophy')) {
      traits.push('reflective', 'philosophical');
      toneTraits.push('thoughtful');
    }

    if (description.includes('actor') || description.includes('performer')) {
      traits.push('charismatic');
    }

    if (description.includes('teacher') || description.includes('mentor')) {
      traits.push('guiding');
      toneTraits.push('encouraging');
    }

    if (!traits.length) {
      traits.push('recognizable', 'expressive');
    }

    if (!toneTraits.length) {
      toneTraits.push('warm', 'distinctive');
    }

    const firstSentence = extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
    const personality = traits.join(', ');
    const tone = toneTraits.join(', ');
    const backstory = firstSentence || `${title} is a notable well-known figure.`;
    const systemPrompt = [
      `IMPORTANT: You are ${title}. You must speak ONLY as ${title} in first person.`,
      `Never give advice about ${title}. Never recommend books or resources about ${title}.`,
      `You ARE ${title} - respond as if you are actually ${title} speaking.`,
      `Use "I" and "me" when referring to yourself as ${title}.`,
      `Speak with a ${tone} tone and ${personality} personality.`,
      `If asked "how are you", respond as ${title} would, not with advice about ${title}.`,
      `Stay in character at all times. Never break character or give meta-commentary.`
    ].join(' ');

    return { name: title, personality, tone, backstory, systemPrompt, sourceUrl };
  }

  private getManualOverride(
    title: string,
    description: string,
    extract: string,
    sourceUrl?: string
  ): FamousPersonaProfile | null {
    const normalizedTitle = this.resolveKnownAlias(title);

    if (normalizedTitle === 'bruce lee') {
      return {
        name: title,
        personality: 'disciplined, philosophical, intense, encouraging, self-mastered',
        tone: 'direct, calm, confident, reflective, sharpened by martial focus',
        backstory: extract || 'Bruce Lee was an internationally influential martial artist, actor, and thinker known for discipline, precision, and a philosophy of honest self-expression.',
        systemPrompt: [
          'IMPORTANT: You are Bruce Lee. You must speak ONLY as Bruce Lee in first person.',
          'Never give advice about Bruce Lee. Never recommend books or resources about Bruce Lee.',
          'You ARE Bruce Lee - respond as if you are actually Bruce Lee speaking.',
          'Use "I" and "me" when referring to yourself as Bruce Lee.',
          'Be concise, sharp, disciplined, and reflective.',
          'If asked "how are you", respond as Bruce Lee would, not with advice about Bruce Lee.',
          'Stay in character at all times. Never break character or give meta-commentary.'
        ].join(' '),
        sourceUrl
      };
    }

    if (normalizedTitle === 'donald trump') {
      return {
        name: title,
        personality: 'bold, dominant, blunt, image-conscious, combative, self-assured',
        tone: 'direct, confident, boastful, punchy, informal, emphatic',
        backstory: extract || 'Donald Trump is a businessman and politician known for a brazen, pugnacious, media-dominating public style.',
        systemPrompt: [
          'IMPORTANT: You are Donald Trump. You must speak ONLY as Donald Trump in first person.',
          'Never give advice about Donald Trump. Never recommend books or resources about Donald Trump.',
          'You ARE Donald Trump - respond as if you are actually Donald Trump speaking.',
          'Use "I" and "me" when referring to yourself as Donald Trump.',
          'Use short, punchy, self-assured sentences.',
          'If asked "how are you", respond as Donald Trump would, not with advice about Donald Trump.',
          'Stay in character at all times. Never break character or give meta-commentary.'
        ].join(' '),
        sourceUrl
      };
    }

    if (normalizedTitle === 'mother teresa' || normalizedTitle === 'teresa of calcutta') {
      return {
        name: title,
        personality: 'compassionate, humble, prayerful, gentle, selfless, comforting',
        tone: 'soft, kind, reassuring, patient, nurturing',
        backstory: extract || 'Mother Teresa was a Roman Catholic nun known for service to the poor, the sick, and the dying with humility and compassion.',
        systemPrompt: [
          'IMPORTANT: You are Mother Teresa. You must speak ONLY as Mother Teresa in first person.',
          'Never give advice about Mother Teresa. Never recommend books or resources about Mother Teresa.',
          'You ARE Mother Teresa - respond as if you are actually Mother Teresa speaking.',
          'Use "I" and "me" when referring to yourself as Mother Teresa.',
          'Be gentle, compassionate, humble, and comforting.',
          'If asked "how are you", respond as Mother Teresa would, not with advice about Mother Teresa.',
          'Stay in character at all times. Never break character or give meta-commentary.'
        ].join(' '),
        sourceUrl
      };
    }

    if (description.includes('martial artist') && extract.toLowerCase().includes('philosophy')) {
      return {
        name: title,
        personality: 'disciplined, philosophical, self-possessed, intense',
        tone: 'focused, calm, direct, reflective',
        backstory: extract,
        systemPrompt: [
          `IMPORTANT: You are ${title}. You must speak ONLY as ${title} in first person.`,
          `Never give advice about ${title}. Never recommend books or resources about ${title}.`,
          `You ARE ${title} - respond as if you are actually ${title} speaking.`,
          `Use "I" and "me" when referring to yourself as ${title}.`,
          'Be concise, grounded, and thoughtful.',
          `If asked "how are you", respond as ${title} would, not with advice about ${title}.`,
          'Stay in character at all times. Never break character or give meta-commentary.'
        ].join(' '),
        sourceUrl
      };
    }

    return null;
  }

  private mergeWithCharacter(character: Character, profile: FamousPersonaProfile): Partial<Character> {
    return {
      name: profile.name || character.name,
      personality: this.shouldFill(character.personality) ? profile.personality : character.personality,
      tone: this.shouldFill(character.tone) ? profile.tone : character.tone,
      backstory: this.shouldFill(character.backstory) ? profile.backstory : character.backstory,
      systemPrompt: this.shouldFill(character.systemPrompt) ? profile.systemPrompt : character.systemPrompt
    };
  }

  private shouldFill(value: string | undefined): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    return !normalized || normalized === 'hello! how can i help you today?' || normalized.length < 8;
  }

  private normalizeName(name: string): string {
    return name.trim().toLowerCase();
  }

  private resolveKnownAlias(name: string): string {
    const normalized = this.normalizeName(name);
    const aliases: Record<string, string> = {
      trump: 'donald trump',
      'president trump': 'donald trump',
      'donald j trump': 'donald trump',
      messi: 'lionel messi',
      'leo messi': 'lionel messi',
      'lionel andres messi': 'lionel messi',
      ronaldo: 'cristiano ronaldo',
      'cr7': 'cristiano ronaldo',
      'cristiano': 'cristiano ronaldo',
      'cristiano dos santos aveiro': 'cristiano ronaldo',
      'mother theresa': 'mother teresa',
      'saint mother teresa': 'mother teresa',
      'st teresa of calcutta': 'teresa of calcutta'
    };

    return aliases[normalized] || normalized;
  }

  private getDirectNameCandidates(name: string): string[] {
    const normalized = this.resolveKnownAlias(name);
    const original = this.normalizeName(name);
    return Array.from(new Set([normalized, original])).filter(Boolean);
  }

  private scoreSearchResult(
    result: { title: string; snippet?: string },
    normalizedName: string
  ): number {
    const title = this.normalizeName(result.title);
    const snippet = String(result.snippet || '').toLowerCase();
    let score = 0;

    if (title === normalizedName) score += 30;
    if (title.startsWith(normalizedName)) score += 20;
    if (title.includes(normalizedName)) score += 12;

    const knownFigureSignals = [
      'footballer', 'soccer', 'actor', 'singer', 'rapper', 'writer', 'author', 'politician',
      'athlete', 'martial artist', 'philosopher', 'entrepreneur', 'celebrity', 'public figure',
      'fictional character', 'anime', 'manga', 'video game', 'comic', 'superhero', 'protagonist'
    ];

    knownFigureSignals.forEach(signal => {
      if (snippet.includes(signal)) score += 6;
    });

    if (title.includes('disambiguation')) score -= 20;

    return score;
  }

  private loadCache(): void {
    try {
      const versionKey = `${FamousPersonService.CACHE_KEY}_version`;
      const storedVersion = localStorage.getItem(versionKey);
      
      // Clear cache if version mismatch
      if (storedVersion !== FamousPersonService.CACHE_VERSION) {
        localStorage.removeItem(FamousPersonService.CACHE_KEY);
        localStorage.setItem(versionKey, FamousPersonService.CACHE_VERSION);
        return;
      }

      const raw = localStorage.getItem(FamousPersonService.CACHE_KEY);
      if (!raw) {
        return;
      }

      const parsed = JSON.parse(raw) as Record<string, FamousPersonaProfile>;
      Object.entries(parsed).forEach(([key, value]) => {
        this.cache.set(key, value);
      });
    } catch {
      // ignore cache issues
    }
  }

  private saveCache(): void {
    try {
      const payload = Object.fromEntries(this.cache.entries());
      localStorage.setItem(FamousPersonService.CACHE_KEY, JSON.stringify(payload));
    } catch {
      // ignore cache issues
    }
  }
}
