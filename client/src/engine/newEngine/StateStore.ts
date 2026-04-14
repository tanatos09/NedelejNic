import type { RenderLayer, RenderModel, Rules } from './types';

type TrapRecord = {
  id: string;
  enabled: boolean;
  kind: 'uiTarget' | 'inputPattern' | 'timeWindow';
  match: any;
  result: { type: 'fail' | 'success' | 'setVar'; reason?: string; key?: string; value?: number };
};

export class StateStore {
  readonly vars: Record<string, number | string> = {};
  readonly rules: Rules = {
    click: 'allowed',
    mouseMove: 'allowed',
    keyboard: 'allowed',
    scroll: 'allowed',
    touch: 'allowed',
  };

  private subtitle = '';
  private caption = '';

  private layers = new Map<string, RenderLayer>();
  private layerOrder: string[] = [];

  private effects = new Map<string, { intensity?: number; target?: string }>();

  private traps = new Map<string, TrapRecord>();
  private trapOrder: string[] = [];

  getRulesSnapshot(): Rules {
    return { ...this.rules };
  }

  getVarsSnapshot(): Record<string, number | string> {
    return { ...this.vars };
  }

  getEffectsSnapshot(): Record<string, { intensity?: number; target?: string }> {
    const out: Record<string, { intensity?: number; target?: string }> = {};
    for (const [k, v] of this.effects.entries()) out[k] = { ...v };
    return out;
  }

  getVarNumber(key: string): number {
    const v = this.vars[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number(v) || 0;
    return 0;
  }

  setText(slot: 'subtitle' | 'caption', text: string): void {
    if (slot === 'subtitle') this.subtitle = text;
    else this.caption = text;
  }

  upsertLayer(layer: RenderLayer): void {
    if (!this.layers.has(layer.id)) {
      this.layerOrder.push(layer.id);
    }
    this.layers.set(layer.id, layer);
  }

  removeLayer(id: string): void {
    this.layers.delete(id);
    this.layerOrder = this.layerOrder.filter((x) => x !== id);
  }

  setEffect(type: string, data: { intensity?: number; target?: string } | null): void {
    if (!data) this.effects.delete(type);
    else this.effects.set(type, data);
  }

  setRule(partial: Partial<Rules>): void {
    (Object.keys(partial) as (keyof Rules)[]).forEach((k) => {
      const v = partial[k];
      if (v) this.rules[k] = v;
    });
  }

  setVar(key: string, value: number | string): void {
    this.vars[key] = value;
  }

  addVar(key: string, delta: number): void {
    const base = this.getVarNumber(key);
    this.vars[key] = base + delta;
  }

  setTrap(trap: TrapRecord): void {
    const existed = this.traps.has(trap.id);
    this.traps.set(trap.id, trap);
    if (!existed) {
      this.trapOrder.push(trap.id);
    }
  }

  /** Traps in deterministic order for matching. */
  getTrapsInOrder(): TrapRecord[] {
    return this.trapOrder.map((id) => this.traps.get(id)!).filter(Boolean);
  }

  getTrapsSnapshot(): TrapRecord[] {
    return this.getTrapsInOrder().map((t) => ({
      id: t.id,
      enabled: t.enabled,
      kind: t.kind,
      match: t.match,
      result: { ...t.result },
    }));
  }

  snapshotRenderModel(): RenderModel {
    const layers: RenderLayer[] = this.layerOrder
      .map((id) => this.layers.get(id))
      .filter(Boolean) as RenderLayer[];

    const effectsObj: Record<string, { intensity?: number; target?: string }> = {};
    for (const [k, v] of this.effects.entries()) effectsObj[k] = { ...v };

    return {
      subtitle: this.subtitle,
      caption: this.caption,
      layers: layers.map((l) => ({ ...l, props: { ...(l.props ?? {}) } })),
      effects: effectsObj,
    };
  }
}

