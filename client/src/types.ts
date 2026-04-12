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

export interface LevelRules {
  mouseMove: boolean;
  click: boolean;
  keyboard: boolean;
  scroll: boolean;
  touch: boolean;
}

export interface LevelEvent {
  time: number;
  type: 'subtitle' | 'clear' | 'voice';
  text?: string;
  audio?: string;
}

export interface LevelEnd {
  type: 'timer';
  time: number;
}

export interface LevelConfig {
  id: number;
  rules: LevelRules;
  events: LevelEvent[];
  end: LevelEnd;
  signature: string;
}

export type GameResult = 'success' | 'fail';
