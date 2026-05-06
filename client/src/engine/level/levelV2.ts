export type LevelVersion = 2;

export type LevelId = number;

export type LevelTypeV2 = 'action';

export type RuleModeV2 = 'forbidden' | 'allowed' | 'required';

export type InputKeyV2 =
  | 'mouseMove'
  | 'mouseDown'
  | 'mouseUp'
  | 'click'
  | 'wheel'
  | 'scroll'
  | 'keyDown'
  | 'keyUp'
  | 'touchStart'
  | 'touchMove'
  | 'touchEnd'
  | 'focus'
  | 'blur'
  | 'visibilityHidden'
  | 'visibilityVisible';

export type LevelRulesV2 = Partial<Record<InputKeyV2, RuleModeV2>>;

export type AssetListV2 = {
  voices?: string[];
  music?: string[];
  sounds?: string[];
};

export type InputPolicyV2 = {
  /** Max mousemove samples per second pushed into the engine. */
  mouseMoveMaxHz?: number;
  /** Ignore mousemove in first N ms after playing starts. */
  mouseMoveGraceMs?: number;
  /** Aggregate tick window; lower = more granular, higher = cheaper. */
  aggregateWindowMs?: number;
};

export type SeedPolicyV2 = {
  /** Derive run seed by backend (recommended for determinism). */
  mode: 'backend';
};

export type WhenV2 =
  | { timeMsGte: number }
  | { varGte: { key: string; value: number } }
  | { input: { type: InputKeyV2; keyCode?: string; minDistancePx?: number } };

export type ActionV2 =
  | { do: 'text.set'; slot: 'subtitle' | 'caption'; text: string }
  | { do: 'audio.play'; kind: 'voice' | 'music' | 'sound'; file: string; id?: string; loop?: boolean; volume?: number }
  | { do: 'audio.stop'; id?: string; kind?: 'voice' | 'music' | 'sound' }
  | { do: 'ui.layer'; op: 'add' | 'update' | 'remove'; id: string; type: string; props?: Record<string, unknown> }
  | { do: 'effect.start'; type: string; intensity?: number; durationMs?: number; target?: string }
  | { do: 'effect.stop'; type: string; target?: string }
  | { do: 'state.set'; key: string; value: number | string }
  | { do: 'state.add'; key: string; delta: number }
  | { do: 'flow.goto'; label: string }
  | { do: 'flow.branch'; if: { var: string; op: 'eq' | 'gte' | 'lte'; value: number | string }; then: string; else: string }
  | { do: 'flow.random'; choices: string[]; seedKey?: string }
  | { do: 'level.end'; result: 'success' | 'fail'; reasonCode?: string; message?: string }
  | { do: 'fail'; severity: 'endLevel' | 'penalty' | 'flag'; reasonCode: string; message?: string; delayMs?: number };

export type TimelineStepV2 =
  | { label: string; atMs?: number; when?: WhenV2 }
  | ({ atMs?: number; when?: WhenV2 } & ActionV2 & { label?: string });

export type KarrelV2 = {
  /** Local memory defaults (merged into level vars under `karrel.*`). */
  memoryDefaults?: Record<string, number | string>;
  /** Minimal behavior rules (data-driven). */
  behaviors?: Array<{
    when: WhenV2;
    then: ActionV2[];
  }>;
};

export type LevelV2 = {
  version: LevelVersion;
  id: LevelId;
  type: LevelTypeV2;
  title?: string;
  assets?: AssetListV2;
  rules?: LevelRulesV2;
  inputPolicy?: InputPolicyV2;
  seedPolicy?: SeedPolicyV2;
  karrel?: KarrelV2;
  end?: { type: 'timer'; timeMs: number };
  timeline: TimelineStepV2[];
};

export type LevelV2ValidationIssue = {
  severity: 'error' | 'warning';
  path: string;
  message: string;
};

export function validateLevelV2(level: unknown): LevelV2ValidationIssue[] {
  const issues: LevelV2ValidationIssue[] = [];
  const l: any = level;
  if (!l || typeof l !== 'object') return [{ severity: 'error', path: '', message: 'level must be an object' }];
  if (l.version !== 2) issues.push({ severity: 'error', path: 'version', message: 'version must be 2' });
  if (typeof l.id !== 'number') issues.push({ severity: 'error', path: 'id', message: 'id must be number' });
  if (l.type !== 'action') issues.push({ severity: 'error', path: 'type', message: 'type must be \"action\" (v2 prototype)' });
  if (!Array.isArray(l.timeline)) issues.push({ severity: 'error', path: 'timeline', message: 'timeline must be array' });
  return issues;
}

