
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

export type AppView = 'upload' | 'game' | 'results';

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

export enum ImageSize {
  SIZE_1K = '1K',
  SIZE_2K = '2K',
  SIZE_4K = '4K'
}
