import type { InputEvent } from './types';
import { parseTimeMs } from './util';
import type { StateStore } from './StateStore';

export type TrapOutcome =
  | { type: 'none' }
  | { type: 'fail'; reason: string }
  | { type: 'success' }
  | { type: 'setVar'; key: string; value: number };

export class TrapSystem {
  constructor(private state: StateStore, private getElapsedMs: () => number) {}

  match(input: InputEvent): TrapOutcome {
    const traps = this.state.getTrapsInOrder();
    for (const trap of traps) {
      if (!trap.enabled) continue;
      const matched = this.matchTrap(trap, input);
      if (!matched) continue;
      const res = trap.result;
      if (res.type === 'fail') return { type: 'fail', reason: res.reason ?? 'Trap fail' };
      if (res.type === 'success') return { type: 'success' };
      if (res.type === 'setVar') {
        if (!res.key) return { type: 'none' };
        return { type: 'setVar', key: res.key, value: res.value ?? 0 };
      }
      return { type: 'none' };
    }
    return { type: 'none' };
  }

  private matchTrap(
    trap: { kind: 'uiTarget' | 'inputPattern' | 'timeWindow'; match: any },
    input: InputEvent
  ): boolean {
    if (trap.kind === 'uiTarget') {
      // Only click
      if (input.type !== 'click') return false;
      const m = trap.match as { layerId?: string; action?: 'click' };
      if (!m?.layerId || m.action !== 'click') return false;
      if (!input.targetLayerId) return false;
      return input.targetLayerId === m.layerId;
    }

    if (trap.kind === 'inputPattern') {
      const m = trap.match as { sequence?: string[]; withinMs?: number };
      if (!Array.isArray(m?.sequence) || typeof m.withinMs !== 'number') return false;
      // Minimal pattern implementation: track last N input tokens in state vars
      const token =
        input.type === 'click' ? 'click' : input.type === 'keyboard' ? input.keyCode ?? '' : '';
      if (!token) return false;

      const now = input.timestamp;
      const bufKey = '__pattern_buf';
      const timeKey = '__pattern_timebuf';
      const bufRaw = this.state.vars[bufKey];
      const timeRaw = this.state.vars[timeKey];
      const buf: string[] = Array.isArray(bufRaw) ? (bufRaw as any) : [];
      const times: number[] = Array.isArray(timeRaw) ? (timeRaw as any) : [];

      buf.push(token);
      times.push(now);
      while (buf.length > m.sequence.length) {
        buf.shift();
        times.shift();
      }

      // store back (typed as any intentionally; StateStore.vars is permissive)
      (this.state.vars as any)[bufKey] = buf;
      (this.state.vars as any)[timeKey] = times;

      if (buf.length !== m.sequence.length) return false;
      for (let i = 0; i < buf.length; i++) if (buf[i] !== m.sequence[i]) return false;
      const windowMs = times[times.length - 1] - times[0];
      return windowMs <= m.withinMs;
    }

    if (trap.kind === 'timeWindow') {
      const m = trap.match as { start?: string; end?: string; input?: string };
      if (!m?.start || !m?.end || !m?.input) return false;
      const startMs = parseTimeMs(m.start);
      const endMs = parseTimeMs(m.end);
      const t = this.getElapsedMs();
      if (t < startMs || t > endMs) return false;
      return input.type === m.input;
    }

    return false;
  }
}

