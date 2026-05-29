import type { AnyLevel, TimelineStep, Action, EventLogEntry, Rules } from './types';
import { AssetManifest } from './assetManifest';
import { parseTimeMs } from './util';

export type ValidationIssue = {
  severity: 'error' | 'warning';
  message: string;
  path?: string;
  data?: unknown;
};

export type ValidationReport = {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

const ACTIONS = new Set<Action['do']>([
  'text.set',
  'audio.play',
  'audio.stop',
  'ui.layer',
  'effect.start',
  'effect.stop',
  'rules.set',
  'trap.set',
  'state.set',
  'state.add',
  'flow.goto',
  'flow.branch',
  'flow.random',
  'level.end',
  'game.input.enable',
  'game.input.disable',
]);

export function validateLevel(level: AnyLevel): ValidationReport {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const err = (message: string, path?: string, data?: unknown) =>
    errors.push({ severity: 'error', message, path, data });
  const warn = (message: string, path?: string, data?: unknown) =>
    warnings.push({ severity: 'warning', message, path, data });

  if (typeof (level as any).id !== 'number') err('level.id must be a number', 'id');
  if ((level as any).type !== 'action' && (level as any).type !== 'custom') err('level.type must be "action" | "custom"', 'type');

  if (!('assets' in level) || typeof (level as any).assets !== 'object') {
    warn('level.assets missing (recommended for preload safety)', 'assets');
  } else {
    validateAssets(level.assets ?? {}, warn);
  }

  if ((level as any).rules && typeof (level as any).rules !== 'object') {
    err('level.rules must be an object', 'rules');
  } else if ((level as any).rules) {
    validateRules((level as any).rules, warn);
  }

  if (level.type === 'action') {
    if (!Array.isArray(level.timeline)) err('level.timeline must be an array', 'timeline');
    else validateTimeline(level.timeline, err, warn);
  }

  // Hardening checks (non-blocking)
  if (level.type === 'action' && Array.isArray((level as any).timeline)) {
    const ends = (level as any).timeline.filter((s: any) => s?.do === 'level.end');
    if (ends.length === 0) warn('timeline contains no level.end (may rely on external timer). Recommended to include explicit end.', 'timeline');
  }

  return { errors, warnings };
}

function validateAssets(
  assets: { voices?: string[]; music?: string[]; sounds?: string[] },
  warn: (m: string, path?: string, data?: unknown) => void
) {
  for (const [kind, list, manifest] of [
    ['voices', assets.voices ?? [], AssetManifest.voices] as const,
    ['music', assets.music ?? [], AssetManifest.music] as const,
    ['sounds', assets.sounds ?? [], AssetManifest.sounds] as const,
  ]) {
    if (!Array.isArray(list)) {
      warn(`assets.${kind} should be an array`, `assets.${kind}`);
      continue;
    }
    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      if (typeof file !== 'string' || !file.trim()) {
        warn(`assets.${kind}[${i}] must be a non-empty string`, `assets.${kind}[${i}]`, file);
        continue;
      }
      if (manifest.size > 0 && !manifest.has(file)) {
        warn(`missing asset file in manifest: ${kind}/${file}`, `assets.${kind}[${i}]`, file);
      }
      if (manifest.size === 0) {
        warn(`asset existence not verifiable (manifest empty): ${kind}/${file}`, `assets.${kind}[${i}]`, file);
      }
    }
  }
}

function validateRules(rules: Partial<Rules>, warn: (m: string, path?: string, data?: unknown) => void) {
  const keys: Array<keyof Rules> = ['click', 'mouseMove', 'keyboard', 'scroll', 'touch'];
  for (const k of keys) {
    const v = (rules as any)[k];
    if (v == null) continue;
    if (v !== 'forbidden' && v !== 'allowed' && v !== 'required') {
      warn(`rules.${k} must be forbidden|allowed|required`, `rules.${k}`, v);
    }
  }
}

function validateTimeline(
  timeline: TimelineStep[],
  err: (m: string, path?: string, data?: unknown) => void,
  warn: (m: string, path?: string, data?: unknown) => void
) {
  const labels = new Set<string>();

  for (let i = 0; i < timeline.length; i++) {
    const step: any = timeline[i];
    const base = `timeline[${i}]`;
    if (typeof step !== 'object' || step == null) {
      err('timeline step must be an object', base, step);
      continue;
    }

    if (step.label != null) {
      if (typeof step.label !== 'string' || !step.label.trim()) err('label must be non-empty string', `${base}.label`, step.label);
      else {
        if (labels.has(step.label)) warn(`duplicate label: ${step.label}`, `${base}.label`);
        labels.add(step.label);
      }
    }

    if (step.at != null) {
      if (typeof step.at !== 'string') err('at must be a string like "1s" or "250ms"', `${base}.at`, step.at);
      else if (parseTimeMs(step.at) < 0) err('at must be >= 0', `${base}.at`, step.at);
    }

    if (step.when != null) {
      if (typeof step.when !== 'object' || step.when == null) err('when must be an object', `${base}.when`, step.when);
      else validateWhen(step.when, err, warn, `${base}.when`);
    }

    if (step.do == null) {
      // label-only step is ok
      if (!step.label) warn('step has no do and no label (no-op)', base);
      continue;
    }
    if (typeof step.do !== 'string') {
      err('do must be string', `${base}.do`, step.do);
      continue;
    }
    if (!ACTIONS.has(step.do)) {
      err(`unknown action: ${step.do}`, `${base}.do`, step.do);
      continue;
    }

    validateActionParams(step as Action, err, warn, base);
  }
}

function validateWhen(
  when: any,
  err: (m: string, path?: string, data?: unknown) => void,
  warn: (m: string, path?: string, data?: unknown) => void,
  path: string
) {
  if (when.input) {
    if (when.input !== 'click' && when.input !== 'keyDown') warn('when.input should be "click" | "keyDown"', `${path}.input`, when.input);
    if (when.input === 'keyDown' && typeof when.key !== 'string') err('when.key required for keyDown', `${path}.key`, when.key);
  } else if (when.var) {
    if (typeof when.var !== 'string') err('when.var must be string', `${path}.var`, when.var);
    if (typeof when.gte !== 'number') err('when.gte must be number', `${path}.gte`, when.gte);
  } else {
    warn('unknown when schema', path, when);
  }
}

function validateActionParams(
  action: any,
  err: (m: string, path?: string, data?: unknown) => void,
  warn: (m: string, path?: string, data?: unknown) => void,
  base: string
) {
  switch (action.do) {
    case 'text.set':
      if (action.slot !== 'subtitle' && action.slot !== 'caption') err('text.set.slot must be subtitle|caption', `${base}.slot`, action.slot);
      if (typeof action.text !== 'string') err('text.set.text must be string', `${base}.text`, action.text);
      return;
    case 'audio.play':
      if (action.kind !== 'voice' && action.kind !== 'music' && action.kind !== 'sound') err('audio.play.kind invalid', `${base}.kind`, action.kind);
      if (typeof action.file !== 'string' || !action.file.trim()) err('audio.play.file required', `${base}.file`, action.file);
      return;
    case 'audio.stop':
      if (action.id == null && action.kind == null) warn('audio.stop without id/kind is a no-op (by design)', base);
      return;
    case 'ui.layer':
      if (!['add', 'update', 'remove'].includes(action.op)) err('ui.layer.op invalid', `${base}.op`, action.op);
      if (typeof action.id !== 'string' || !action.id.trim()) err('ui.layer.id required', `${base}.id`, action.id);
      if (!['toast', 'modal', 'button', 'overlay', 'hud', 'noise', 'cursor', 'image'].includes(action.type)) err('ui.layer.type invalid', `${base}.type`, action.type);
      return;
    case 'effect.start':
    case 'effect.stop':
      if (!['glitch', 'blur', 'invert', 'flash', 'shake', 'jitter'].includes(action.type)) err('effect.type invalid', `${base}.type`, action.type);
      return;
    case 'rules.set':
      if (typeof action.rules !== 'object' || action.rules == null) err('rules.set.rules must be object', `${base}.rules`, action.rules);
      return;
    case 'trap.set':
      if (typeof action.id !== 'string' || !action.id.trim()) err('trap.set.id required', `${base}.id`, action.id);
      if (typeof action.enabled !== 'boolean') err('trap.set.enabled must be boolean', `${base}.enabled`, action.enabled);
      if (!['uiTarget', 'inputPattern', 'timeWindow'].includes(action.kind)) err('trap.set.kind invalid', `${base}.kind`, action.kind);
      if (typeof action.result !== 'object' || action.result == null) err('trap.set.result required', `${base}.result`, action.result);
      return;
    case 'state.set':
      if (typeof action.key !== 'string' || !action.key.trim()) err('state.set.key required', `${base}.key`, action.key);
      if (typeof action.value !== 'number' && typeof action.value !== 'string') err('state.set.value must be number|string', `${base}.value`, action.value);
      return;
    case 'state.add':
      if (typeof action.key !== 'string' || !action.key.trim()) err('state.add.key required', `${base}.key`, action.key);
      if (typeof action.delta !== 'number') err('state.add.delta must be number', `${base}.delta`, action.delta);
      return;
    case 'flow.goto':
      if (typeof action.label !== 'string' || !action.label.trim()) err('flow.goto.label required', `${base}.label`, action.label);
      return;
    case 'flow.branch':
      if (!action.if || typeof action.if !== 'object') err('flow.branch.if required', `${base}.if`, action.if);
      if (typeof action.then !== 'string' || typeof action.else !== 'string') err('flow.branch then/else labels required', base, action);
      return;
    case 'flow.random':
      if (!Array.isArray(action.choices) || action.choices.length === 0) err('flow.random.choices must be non-empty array', `${base}.choices`, action.choices);
      return;
    case 'level.end':
      if (action.result !== 'success' && action.result !== 'fail') err('level.end.result invalid', `${base}.result`, action.result);
      return;
    case 'game.input.enable':
    case 'game.input.disable':
      return;
    default:
      warn('action validator missing case', base, action);
  }
}

export function reportToEventLog(report: ValidationReport): EventLogEntry[] {
  const out: EventLogEntry[] = [];
  for (const e of report.errors) out.push({ t: 0, kind: 'engine', msg: `validate.error: ${e.message}`, data: { path: e.path, data: e.data } });
  for (const w of report.warnings) out.push({ t: 0, kind: 'engine', msg: `validate.warn: ${w.message}`, data: { path: w.path, data: w.data } });
  return out;
}

