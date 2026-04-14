export interface LegacyLevelRules {
  mouseMove: boolean;
  click: boolean;
  keyboard: boolean;
  scroll: boolean;
  touch: boolean;
}

export interface LegacyLevelEvent {
  time: number;
  type: 'subtitle' | 'clear' | 'voice';
  text?: string;
  audio?: string;
}

export interface LegacyLevelEnd {
  type: 'timer';
  time: number;
}

export interface LegacyLevelConfig {
  id: number;
  rules: LegacyLevelRules;
  events: LegacyLevelEvent[];
  end: LegacyLevelEnd;
  signature: string;
}

