export interface GeminiVoiceCatalogItem {
  name: string;
  style: string;
  gender: 'Male' | 'Female' | 'Neutral';
}

export const GEMINI_VOICE_CATALOG: GeminiVoiceCatalogItem[] = [
  { name: 'Zephyr', style: 'Bright', gender: 'Male' },
  { name: 'Puck', style: 'Upbeat', gender: 'Male' },
  { name: 'Charon', style: 'Informative', gender: 'Male' },
  { name: 'Kore', style: 'Firm', gender: 'Female' },
  { name: 'Fenrir', style: 'Excitable', gender: 'Male' },
  { name: 'Leda', style: 'Youthful', gender: 'Female' },
  { name: 'Orus', style: 'Firm', gender: 'Male' },
  { name: 'Aoede', style: 'Breezy', gender: 'Female' },
  { name: 'Callirrhoe', style: 'Easy-going', gender: 'Female' },
  { name: 'Autonoe', style: 'Bright', gender: 'Female' },
  { name: 'Enceladus', style: 'Breathy', gender: 'Female' },
  { name: 'Iapetus', style: 'Clear', gender: 'Male' },
  { name: 'Umbriel', style: 'Easy-going', gender: 'Male' },
  { name: 'Algieba', style: 'Smooth', gender: 'Male' },
  { name: 'Despina', style: 'Smooth', gender: 'Female' },
  { name: 'Erinome', style: 'Clear', gender: 'Female' },
  { name: 'Algenib', style: 'Gravelly', gender: 'Male' },
  { name: 'Rasalgethi', style: 'Informative', gender: 'Male' },
  { name: 'Laomedeia', style: 'Upbeat', gender: 'Female' },
  { name: 'Achernar', style: 'Soft', gender: 'Female' },
  { name: 'Alnilam', style: 'Firm', gender: 'Male' },
  { name: 'Schedar', style: 'Even', gender: 'Male' },
  { name: 'Gacrux', style: 'Mature', gender: 'Male' },
  { name: 'Pulcherrima', style: 'Forward', gender: 'Female' },
  { name: 'Achird', style: 'Friendly', gender: 'Female' },
  { name: 'Zubenelgenubi', style: 'Casual', gender: 'Male' },
  { name: 'Vindemiatrix', style: 'Gentle', gender: 'Female' },
  { name: 'Sadachbia', style: 'Lively', gender: 'Female' },
  { name: 'Sadaltager', style: 'Knowledgeable', gender: 'Male' },
  { name: 'Sulafat', style: 'Warm', gender: 'Female' }
];

export const GEMINI_ALLOWED_VOICES = new Set(GEMINI_VOICE_CATALOG.map(voice => voice.name));
