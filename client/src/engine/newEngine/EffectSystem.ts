import type { StateStore } from './StateStore';

export class EffectSystem {
  private timers = new Map<string, number>();
  constructor(private state: StateStore, private setTimeoutFn: typeof window.setTimeout, private clearTimeoutFn: typeof window.clearTimeout) {}

  start(params: { type: string; intensity?: number; durationMs?: number; target?: string }): void {
    // max 1 per type: overwrite previous
    this.stop({ type: params.type, target: params.target });
    this.state.setEffect(params.type, { intensity: params.intensity, target: params.target });
    if (typeof params.durationMs === 'number' && params.durationMs > 0) {
      const t = this.setTimeoutFn(() => {
        this.stop({ type: params.type, target: params.target });
      }, params.durationMs);
      this.timers.set(params.type, t);
    }
  }

  stop(params: { type: string; target?: string }): void {
    const existing = this.timers.get(params.type);
    if (existing) {
      this.clearTimeoutFn(existing);
      this.timers.delete(params.type);
    }
    this.state.setEffect(params.type, null);
  }

  stopAll(): void {
    for (const t of this.timers.values()) this.clearTimeoutFn(t);
    this.timers.clear();
    // clear effects map by recreating through state mutations
    // (we don't expose internal map; clear known types isn't necessary for render if engine ends)
  }
}

