import type { LevelRules } from '../../types';
import type { LegacyLevelConfig } from '../../legacyTypes';

export type EngineState = 'idle' | 'running' | 'paused' | 'ended';

export type InputEventType = 'click' | 'mouseMove' | 'keyboard' | 'scroll' | 'touch';

export type InputEvent = {
  type: InputEventType;
  timestamp: number;
  /** Closest `[data-layer-id]` from raw event target (click); absent => ignored click */
  targetLayerId?: string;
  /** Raw DOM event reference (debug only; never used for logic) */
  raw: unknown;
  /** For keyboard input */
  keyCode?: string;
};

export type RuleMode = 'forbidden' | 'allowed' | 'required';
export type Rules = Record<keyof LevelRules, RuleMode>;

export type AudioKind = 'voice' | 'music' | 'sound';

export type Action =
  | { do: 'text.set'; slot: 'subtitle' | 'caption'; text: string; style?: { tone?: 'neutral' | 'warning' | 'error'; align?: 'center' | 'left' } }
  | { do: 'audio.play'; kind: AudioKind; file: string; id?: string; loop?: boolean; volume?: number; fadeMs?: number }
  | { do: 'audio.stop'; id?: string; kind?: AudioKind; fadeMs?: number }
  | { do: 'ui.layer'; op: 'add' | 'update' | 'remove'; id: string; type: 'toast' | 'modal' | 'button' | 'overlay' | 'hud' | 'noise' | 'cursor' | 'image'; props?: { text?: string; visible?: boolean; interactive?: boolean; variant?: 'neutral' | 'warning' | 'danger' | 'success'; position?: 'center' | 'top' | 'topRight' | 'topLeft' | 'bottom' | 'bottomRight' | 'bottomLeft'; z?: number } }
  | { do: 'effect.start'; type: 'glitch' | 'blur' | 'invert' | 'flash' | 'shake' | 'jitter'; intensity?: number; durationMs?: number; target?: string }
  | { do: 'effect.stop'; type: 'glitch' | 'blur' | 'invert' | 'flash' | 'shake' | 'jitter'; target?: string }
  | { do: 'rules.set'; rules: Partial<Rules> }
  | { do: 'trap.set'; id: string; enabled: boolean; kind: 'uiTarget' | 'inputPattern' | 'timeWindow'; match: unknown; result: { type: 'fail' | 'success' | 'setVar'; reason?: string; key?: string; value?: number } }
  | { do: 'state.set'; key: string; value: number | string }
  | { do: 'state.add'; key: string; delta: number }
  | { do: 'flow.goto'; label: string }
  | { do: 'flow.branch'; if: { var: string; op: 'eq' | 'gte' | 'lte'; value: number | string }; then: string; else: string }
  | { do: 'flow.random'; choices: string[]; seedKey?: string }
  | { do: 'level.end'; result: 'success' | 'fail'; reason?: string };

export type TimelineStep =
  | ({ label: string; at?: string; when?: When } & Partial<Action>)
  | ({ do: Action['do'] } & Partial<Action> & { label?: string; at?: string; when?: When });

export type When =
  | { input: 'click' }
  | { input: 'keyDown'; key: string }
  | { var: string; gte: number };

export type ActionLevel = {
  id: number;
  type: 'action';
  title?: string;
  assets?: { voices?: string[]; music?: string[]; sounds?: string[] };
  rules?: Partial<Rules>;
  end?: { type: 'timer'; time: number };
  timeline: TimelineStep[];
  signature?: string;
};

export type CustomLevel = {
  id: number;
  type: 'custom';
  module: string;
  assets?: { voices?: string[]; music?: string[]; sounds?: string[] };
  end?: { type: 'timer'; time: number };
  signature?: string;
};

export type AnyLevel = ActionLevel | CustomLevel;

export type EventLogEntry = {
  t: number;
  kind: 'action' | 'random' | 'trap' | 'rule' | 'engine';
  msg: string;
  data?: unknown;
};

export type RenderLayer = {
  id: string;
  type: 'toast' | 'modal' | 'button' | 'overlay' | 'hud' | 'noise' | 'cursor' | 'image';
  props: {
    text?: string;
    visible?: boolean;
    interactive?: boolean;
    variant?: 'neutral' | 'warning' | 'danger' | 'success';
    position?: 'center' | 'top' | 'topRight' | 'topLeft' | 'bottom' | 'bottomRight' | 'bottomLeft';
    z?: number;
  };
};

export type RenderModel = {
  subtitle: string;
  caption: string;
  layers: RenderLayer[];
  effects: Record<string, { intensity?: number; target?: string }>;
};

export type EngineCallbacks = {
  onFail: (reason: string) => void;
  onSuccess: () => void;
  onProgress: (progress01: number) => void;
  onRenderModel: (model: RenderModel) => void;
  onStateChange?: (state: EngineState) => void;
  onEventLog?: (entry: EventLogEntry) => void;
};

export function adaptLegacyLevelConfig(cfg: LegacyLevelConfig): ActionLevel {
  // Legacy LevelConfig uses `events[]` with `{time,type,text?,audio?}`.
  // We adapt it to the new action timeline.
  const timeline: TimelineStep[] = cfg.events.map((e) => {
    if (e.type === 'clear') {
      return { at: `${e.time}s`, do: 'text.set', slot: 'subtitle', text: '' };
    }
    if (e.type === 'subtitle') {
      return { at: `${e.time}s`, do: 'text.set', slot: 'subtitle', text: e.text ?? '' };
    }
    if (e.type === 'voice' && e.audio) {
      return { at: `${e.time}s`, do: 'audio.play', kind: 'voice', file: e.audio, id: `voice_${e.time}_${e.audio}` };
    }
    // Unknown legacy event => no-op step (still keeps ordering deterministic)
    return { at: `${e.time}s`, label: `legacy_unknown_${e.time}` };
  });

  timeline.push({ at: `${cfg.end.time}s`, do: 'level.end', result: 'success' });

  // Convert legacy boolean rules to RuleMode strings:
  //   true  → 'forbidden' (that input causes fail)
  //   false → 'allowed'   (that input is OK)
  const convertedRules: Partial<Rules> = {};
  for (const key of Object.keys(cfg.rules) as (keyof LevelRules)[]) {
    convertedRules[key] = cfg.rules[key] ? 'forbidden' : 'allowed';
  }

  return {
    id: cfg.id,
    type: 'action',
    title: `LEVEL ${cfg.id}`,
    assets: {
      voices: cfg.events.filter((e) => e.type === 'voice' && e.audio).map((e) => e.audio!) ?? [],
      music: [],
      sounds: [],
    },
    rules: convertedRules,
    end: { type: 'timer', time: cfg.end.time },
    timeline,
    signature: cfg.signature,
  };
}

