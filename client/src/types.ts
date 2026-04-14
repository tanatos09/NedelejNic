export interface User {
  id: string;
  username: string;
  role: 'PLAYER' | 'DEV' | 'ADMIN';
  level: number;
  isBanned?: boolean;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type RuleMode = 'forbidden' | 'allowed' | 'required';

export interface LevelRules {
  mouseMove: RuleMode;
  click: RuleMode;
  keyboard: RuleMode;
  scroll: RuleMode;
  touch: RuleMode;
}

export interface LevelEnd {
  type: 'timer';
  time: number;
}

export type ActionLevel = {
  id: number;
  type: 'action';
  title?: string;
  assets?: { voices?: string[]; music?: string[]; sounds?: string[] };
  rules?: Partial<LevelRules>;
  end?: LevelEnd;
  timeline: unknown[];
  signature: string;
};

export type CustomLevel = {
  id: number;
  type: 'custom';
  title?: string;
  module: string;
  assets?: { voices?: string[]; music?: string[]; sounds?: string[] };
  end?: LevelEnd;
  signature: string;
};

export type LevelConfig = ActionLevel | CustomLevel;

export type GameResult = 'success' | 'fail';
