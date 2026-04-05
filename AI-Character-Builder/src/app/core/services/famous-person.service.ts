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
  voiceHints?: string[];
  langHints?: string[];
  pitch?: number;
  rate?: number;
}

export interface ResolvedKnownFigure {
  title: string;
  description: string;
  extract: string;
  sourceUrl?: string;
  voiceHints?: string[];
  langHints?: string[];
  pitch?: number;
  rate?: number;
  persona?: {
    personality?: string;
    tone?: string;
    backstory?: string;
    systemPrompt?: string;
  };
}

@Injectable({
  providedIn: 'root'
})
export class FamousPersonService {
  private static readonly CACHE_KEY = 'famousPersonProfiles';
  private static readonly CACHE_VERSION = 'v6'; // Increment this when system prompt changes
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

    // Build the profile to extract voice hints from Wikipedia data
    const profile = this.buildProfile(summary);

    return {
      title: profile.name || summary.title || name.trim(),
      description: summary.description || '',
      extract: summary.extract || '',
      sourceUrl: summary.content_urls?.desktop?.page,
      voiceHints: profile.voiceHints || ['Natural'],
      langHints: profile.langHints || ['en-US'],
      pitch: profile.pitch,
      rate: profile.rate,
      persona: {
        personality: profile.personality,
        tone: profile.tone,
        backstory: profile.backstory,
        systemPrompt: profile.systemPrompt
      }
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
    const fullText = `${description} ${extract}`.toLowerCase();
    const sourceUrl = summary.content_urls?.desktop?.page;

    const override = this.getManualOverride(title, description, extract, sourceUrl);
    if (override) {
      return override;
    }

    const traits: string[] = [];
    const toneTraits: string[] = [];
    const voiceHints: string[] = [];
    const langHints: string[] = [];

    // Detect nationality for voice locale
    const nationalities: { keyword: string; locale: string; hint: string }[] = [
      { keyword: 'american', locale: 'en-US', hint: 'English' },
      { keyword: 'british', locale: 'en-GB', hint: 'en-GB' },
      { keyword: 'english', locale: 'en-GB', hint: 'en-GB' },
      { keyword: 'australian', locale: 'en-AU', hint: 'en-AU' },
      { keyword: 'indian', locale: 'en-IN', hint: 'en-IN' },
      { keyword: 'canadian', locale: 'en-CA', hint: 'en-CA' },
      { keyword: 'irish', locale: 'en-IE', hint: 'en-IE' },
    ];

    for (const nat of nationalities) {
      if (fullText.includes(nat.keyword)) {
        if (!langHints.includes(nat.locale)) langHints.push(nat.locale);
        if (!voiceHints.includes(nat.hint)) voiceHints.push(nat.hint);
      }
    }

    // Detect gender for voice selection
    const isMale = /(?:^|\s)(?:he|his|male|himself|boy|man|son|father|mr\.|sir|king|emperor)/.test(fullText);
    const isFemale = /(?:^|\s)(?:she|her|herself|girl|woman|daughter|mother|mrs\.|ms\.|miss|queen|empress)/.test(fullText);
    if (isMale && !isFemale && !voiceHints.includes('Male')) voiceHints.push('Male');
    if (isFemale && !isMale && !voiceHints.includes('Female')) voiceHints.push('Female');

    // Detect age indicators for voice quality (young vs older)
    const isOlder = fullText.includes('elder') || fullText.includes('senior') || fullText.includes('veteran') || fullText.includes('aged') || fullText.includes('retired') || fullText.includes('deceased');
    const isYoung = fullText.includes('young') || fullText.includes('teen') || fullText.includes('debut') || fullText.includes('emerging') || fullText.includes('rising');

    // Detect profession for voice characteristics
    if (description.includes('martial artist')) {
      traits.push('disciplined', 'focused', 'physically expressive');
      toneTraits.push('direct', 'calm', 'confident');
      if (!voiceHints.includes('Natural')) voiceHints.push('Natural');
    }

    if (description.includes('philosopher') || extract.toLowerCase().includes('philosophy')) {
      traits.push('reflective', 'philosophical');
      toneTraits.push('thoughtful');
      if (!voiceHints.includes('Natural')) voiceHints.push('Natural');
    }

    if (description.includes('actor') || description.includes('performer')) {
      traits.push('charismatic');
      if (!voiceHints.includes('Natural')) voiceHints.push('Natural');
    }

    if (description.includes('singer') || description.includes('musician') || description.includes('rapper')) {
      traits.push('expressive', 'musical');
      toneTraits.push('rhythmic', 'melodic');
      if (!voiceHints.includes('Natural')) voiceHints.push('Natural');
    }

    if (description.includes('politician') || description.includes('president') || description.includes('minister')) {
      traits.push('authoritative', 'diplomatic');
      toneTraits.push('formal', 'measured');
      if (!voiceHints.includes('Natural')) voiceHints.push('Natural');
    }

    if (description.includes('teacher') || description.includes('mentor') || description.includes('professor')) {
      traits.push('guiding');
      toneTraits.push('encouraging');
      if (!voiceHints.includes('Natural')) voiceHints.push('Natural');
    }

    if (description.includes('comedian') || description.includes('humor')) {
      traits.push('witty', 'expressive');
      toneTraits.push('playful', 'animated');
    }

    if (description.includes('scientist') || description.includes('researcher')) {
      traits.push('analytical', 'precise');
      toneTraits.push('measured', 'clear');
    }

    if (!traits.length) {
      traits.push('recognizable', 'expressive');
    }

    if (!toneTraits.length) {
      toneTraits.push('warm', 'distinctive');
    }

    // Voice pitch based on gender and age
    let pitch = 1.0;
    if (isMale) pitch = isOlder ? 0.88 : 0.93;
    else if (isFemale) pitch = isOlder ? 1.05 : 1.08;

    // Speech rate based on personality
    let rate = 0.93;
    if (toneTraits.includes('measured') || toneTraits.includes('calm')) rate = 0.90;
    if (toneTraits.includes('animated') || toneTraits.includes('expressive')) rate = 0.97;

    // Ensure we have at least one voice hint
    if (!voiceHints.length) voiceHints.push('Natural');

    const firstSentence = extract.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ').trim();
    const personality = traits.join(', ');
    const tone = toneTraits.join(', ');
    const backstory = firstSentence || `${title} is a notable well-known figure.`;
    const systemPrompt = `Imagine you are ${title}. Respond as ${title} would, using "I" and "me". Be ${tone} and ${personality}. Just talk naturally as ${title} would in a conversation.`;

    return {
      name: title,
      personality,
      tone,
      backstory,
      systemPrompt,
      sourceUrl,
      voiceHints: voiceHints.slice(0, 6),
      langHints: langHints.length ? langHints.slice(0, 3) : ['en-US'],
      pitch,
      rate
    };
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
        systemPrompt: 'Imagine you are Bruce Lee. Respond as Bruce Lee would, using "I" and "me". Be direct, calm, confident. Just talk naturally as Bruce Lee would in a conversation.',
        sourceUrl,
        voiceHints: ['Male', 'Natural', 'English'],
        langHints: ['en-US'],
        pitch: 0.92,
        rate: 0.90
      };
    }

    if (normalizedTitle === 'donald trump') {
      return {
        name: title,
        personality: 'bold, dominant, blunt, image-conscious, combative, self-assured',
        tone: 'direct, confident, boastful, punchy, informal, emphatic',
        backstory: extract || 'Donald Trump is a businessman and politician known for a brazen, pugnacious, media-dominating public style.',
        systemPrompt: 'Imagine you are Donald Trump. Respond as Donald Trump would, using "I" and "me". Be bold, confident, punchy. Just talk naturally as Donald Trump would in a conversation.',
        sourceUrl,
        voiceHints: ['Male', 'Natural', 'English'],
        langHints: ['en-US'],
        pitch: 0.90,
        rate: 0.88
      };
    }

    if (normalizedTitle === 'mother teresa' || normalizedTitle === 'teresa of calcutta') {
      return {
        name: title,
        personality: 'compassionate, humble, prayerful, gentle, selfless, comforting',
        tone: 'soft, kind, reassuring, patient, nurturing',
        backstory: extract || 'Mother Teresa was a Roman Catholic nun known for service to the poor, the sick, and the dying with humility and compassion.',
        systemPrompt: 'Imagine you are Mother Teresa. Respond as Mother Teresa would, using "I" and "me". Be gentle, compassionate, humble. Just talk naturally as Mother Teresa would in a conversation.',
        sourceUrl,
        voiceHints: ['Female', 'Natural', 'English'],
        langHints: ['en-US'],
        pitch: 1.05,
        rate: 0.88
      };
    }

    if (description.includes('martial artist') && extract.toLowerCase().includes('philosophy')) {
      return {
        name: title,
        personality: 'disciplined, philosophical, self-possessed, intense',
        tone: 'focused, calm, direct, reflective',
        backstory: extract,
        systemPrompt: `Imagine you are ${title}. Respond as ${title} would, using "I" and "me". Be focused, calm, direct. Just talk naturally as ${title} would in a conversation.`,
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
