import type { EventLogEntry } from '../newEngine/types';

export type HookContext = {
  log?: (e: EventLogEntry) => void;
  nowMs: () => number;
};

export type HookFn = (params: unknown, ctx: HookContext) => void;

/**
 * Minimal safe hook runtime for experiments.
 * For now: build-time registration only; no dynamic imports.
 */
export class HookRuntime {
  private hooks = new Map<string, HookFn>();

  constructor(private ctx: HookContext) {}

  register(name: string, fn: HookFn): void {
    this.hooks.set(name, fn);
  }

  run(name: string, params: unknown): void {
    const fn = this.hooks.get(name);
    if (!fn) {
      this.ctx.log?.({ t: this.ctx.nowMs(), kind: 'engine', msg: 'hook.missing', data: { name } });
      return;
    }
    try {
      fn(params, this.ctx);
    } catch (err) {
      this.ctx.log?.({ t: this.ctx.nowMs(), kind: 'engine', msg: 'hook.error', data: { name, err: String(err) } });
    }
  }
}

