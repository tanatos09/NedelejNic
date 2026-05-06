import type { Action, EventLogEntry, RenderLayer } from './types';
import type { StateStore } from './StateStore';
import type { AudioSystem } from './AudioSystem';
import type { EffectSystem } from './EffectSystem';
import type { HookRuntime } from '../effects/HookRuntime';

export class ActionDispatcher {
  constructor(
    private state: StateStore,
    private audio: AudioSystem,
    private effects: EffectSystem,
    private hooks: HookRuntime | null = null,
    private log?: (e: EventLogEntry) => void,
    private nowMs: () => number = () => 0
  ) {}

  dispatch(action: Action): { gotoLabel?: string; end?: { result: 'success' | 'fail'; reason?: string } } {
    this.log?.({ t: this.nowMs(), kind: 'action', msg: action.do, data: action });

    switch (action.do) {
      case 'text.set': {
        this.state.setText(action.slot, action.text);
        return {};
      }
      case 'audio.play': {
        this.audio.play(action);
        return {};
      }
      case 'audio.stop': {
        this.audio.stop(action);
        return {};
      }
      case 'ui.layer': {
        if (action.op === 'remove') {
          this.state.removeLayer(action.id);
          return {};
        }
        const layer: RenderLayer = {
          id: action.id,
          type: action.type,
          props: {
            text: action.props?.text ?? '',
            visible: action.props?.visible ?? true,
            interactive: action.props?.interactive ?? false,
            variant: action.props?.variant ?? 'neutral',
            position: action.props?.position ?? 'center',
            z: action.props?.z ?? 0,
          },
        };
        this.state.upsertLayer(layer);
        return {};
      }
      case 'effect.start': {
        this.effects.start(action);
        return {};
      }
      case 'effect.stop': {
        this.effects.stop(action);
        return {};
      }
      case 'hook.run': {
        this.hooks?.run(action.name, action.params);
        return {};
      }
      case 'rules.set': {
        this.state.setRule(action.rules);
        this.log?.({ t: this.nowMs(), kind: 'rule', msg: 'rules.set', data: action.rules });
        return {};
      }
      case 'trap.set': {
        this.state.setTrap({
          id: action.id,
          enabled: action.enabled,
          kind: action.kind,
          match: action.match as any,
          result: action.result,
        });
        return {};
      }
      case 'state.set': {
        this.state.setVar(action.key, action.value);
        return {};
      }
      case 'state.add': {
        this.state.addVar(action.key, action.delta);
        return {};
      }
      case 'flow.goto': {
        return { gotoLabel: action.label };
      }
      case 'flow.branch': {
        const left = this.state.vars[action.if.var];
        const right = action.if.value;
        const lnum = typeof left === 'number' ? left : typeof left === 'string' ? Number(left) : 0;
        const rnum = typeof right === 'number' ? right : typeof right === 'string' ? Number(right) : 0;
        let ok = false;
        if (action.if.op === 'eq') ok = String(left ?? '') === String(right);
        if (action.if.op === 'gte') ok = lnum >= rnum;
        if (action.if.op === 'lte') ok = lnum <= rnum;
        return { gotoLabel: ok ? action.then : action.else };
      }
      case 'flow.random': {
        // TimelineScheduler handles choice deterministically; dispatcher logs only.
        return {};
      }
      case 'fail': {
        if (action.severity === 'endLevel') {
          return { end: { result: 'fail', reason: action.reason } };
        }
        if (action.severity === 'penalty') {
          const key = action.key ?? '__penalty';
          const base = this.state.getVarNumber(key);
          this.state.setVar(key, base + 1);
          return {};
        }
        if (action.severity === 'flag') {
          const key = action.key ?? '__flag';
          this.state.setVar(key, 1);
          return {};
        }
        return {};
      }
      case 'level.end': {
        return { end: { result: action.result, reason: action.reason } };
      }
      default:
        return {};
    }
  }
}

