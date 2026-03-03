
export interface VocabWord {
  id: string;
  word: string;
  definition: string;
  example: string;
  difficulty: 'Heroic' | 'Legendary' | 'Epic';
  mastered?: boolean;
}

export interface SessionStats {
  checked: number;
  crossed: number;
  total: number;
}

export type AppView = 'upload' | 'game' | 'stage1-results' | 'stage2' | 'stage2-results' | 'mastery' | 'results';

export interface SavedTestPaper {
  id: number;
  testDate: string | null;   // ISO date e.g. "2026-03-03"
  words: VocabWord[];
  dictationParagraph: string | null;
  createdAt: string;
}

export interface DiffSegment {
  text: string;
  type: 'correct' | 'wrong' | 'missing';
}

export interface DictationState {
  paragraph: string;
  chunks: string[];
  currentChunkIndex: number;
  isPaused: boolean;
  isPlaying: boolean;
  userInput: string;
  diffResult: DiffSegment[] | null;
  score: number | null;
  attempts: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export enum ImageSize {
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K'
}
