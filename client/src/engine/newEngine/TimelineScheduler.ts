import type { Action, AnyLevel, EngineCallbacks, EventLogEntry, InputEvent, TimelineStep, When } from './types';
import { parseTimeMs } from './util';
import { RandomSystem } from './RandomSystem';
import { TrapSystem } from './TrapSystem';
import type { ActionDispatcher } from './ActionDispatcher';
import type { StateStore } from './StateStore';

type Waiting =
  | { kind: 'none' }
  | { kind: 'at'; dueAtMs: number; timerId: number | null }
  | { kind: 'when'; when: When };

export class TimelineScheduler {
  private steps: TimelineStep[] = [];
  private labelToIndex = new Map<string, number>();
  private pc = 0;
  private jumpCount = 0;
  private waiting: Waiting = { kind: 'none' };
  private ended = false;

  private startEpoch = 0;
  private pausedAt = 0;
  private pausedElapsed = 0;

  constructor(
    private level: AnyLevel,
    private state: StateStore,
    private dispatcher: ActionDispatcher,
    private traps: TrapSystem,
    private callbacks: EngineCallbacks,
    private setTimeoutFn: typeof window.setTimeout,
    private clearTimeoutFn: typeof window.clearTimeout,
    private log?: (e: EventLogEntry) => void,
    private loopLimit: number = 20
  ) {
  }

  init(timeline: TimelineStep[]): void {
    this.steps = timeline;
    this.labelToIndex.clear();
    for (let i = 0; i < timeline.length; i++) {
      const s: any = timeline[i];
      if (s?.label && typeof s.label === 'string') {
        this.labelToIndex.set(s.label, i);
      }
    }
    this.pc = 0;
    this.jumpCount = 0;
    this.waiting = { kind: 'none' };
    this.ended = false;
    this.startEpoch = 0;
  }

  getDebugState(): {
    pc: number;
    jumpCount: number;
    waiting: Waiting;
    labels: Record<string, number>;
    steps: TimelineStep[];
  } {
    const labels: Record<string, number> = {};
    for (const [k, v] of this.labelToIndex.entries()) labels[k] = v;
    return {
      pc: this.pc,
      jumpCount: this.jumpCount,
      waiting: this.waiting,
      labels,
      steps: this.steps,
    };
  }

  start(atEpochMs?: number): void {
    this.startEpoch = typeof atEpochMs === 'number' ? atEpochMs : Date.now();
    this.pausedElapsed = 0;
    this.ended = false;
    this.log?.({ t: 0, kind: 'engine', msg: 'scheduler.start', data: { steps: this.steps.length } });
    this.runLoop();
  }

  stop(): void {
    this.ended = true;
    this.clearWaitingTimer();
  }

  pause(): void {
    if (this.ended) return;
    this.pausedAt = Date.now();
    this.clearWaitingTimer();
  }

  resume(): void {
    if (this.ended) return;
    const pauseDuration = Date.now() - this.pausedAt;
    this.pausedElapsed += pauseDuration;
    // continue loop with adjusted elapsed (catch-up will happen automatically)
    this.runLoop();
  }

  getElapsedMs(): number {
    if (!this.startEpoch) return 0;
    if (this.pausedAt && !this.ended && this.waiting.kind !== 'none' && this.callbacks) {
      // if paused, but resume adjusts pausedElapsed; keep simple:
    }
    return Date.now() - this.startEpoch - this.pausedElapsed;
  }

  onInput(input: InputEvent): void {
    if (this.ended) return;
    if (!this.startEpoch) return;

    // Traps always run (even while waiting on when)
    const outcome = this.traps.match(input);
    if (outcome.type === 'fail') {
      this.log?.({ t: this.getElapsedMs(), kind: 'trap', msg: 'trap.fail', data: outcome });
      this.end('fail', outcome.reason);
      return;
    }
    if (outcome.type === 'success') {
      this.log?.({ t: this.getElapsedMs(), kind: 'trap', msg: 'trap.success' });
      this.end('success');
      return;
    }
    if (outcome.type === 'setVar') {
      this.state.setVar(outcome.key, outcome.value);
      this.log?.({ t: this.getElapsedMs(), kind: 'trap', msg: 'trap.setVar', data: outcome });
    }

    // Rules fallback: forbidden => fail (required enforcement is authoring-level; we don't auto-fail here)
    // Only applies to the 5 canonical rule inputs. Extra input types (wheel/focus/visibility, etc.)
    // are still forwarded for traps/when logic but do not map to rules.
    const ruleKey =
      input.type === 'click'
        ? 'click'
        : input.type === 'mouseMove'
          ? 'mouseMove'
          : input.type === 'keyboard'
            ? 'keyboard'
            : input.type === 'scroll'
              ? 'scroll'
              : input.type === 'touch'
                ? 'touch'
                : null;
    if (ruleKey && this.state.rules[ruleKey] === 'forbidden') {
      const msgMap: Record<string, string> = {
        click: 'Kliknul jsi. Hra skončila.',
        mouseMove: 'Pohnul jsi myší. Hra skončila.',
        keyboard: 'Zmáčkl jsi klávesu. Hra skončila.',
        scroll: 'Scrolloval jsi. Hra skončila.',
        touch: 'Dotknul ses obrazovky. Hra skončila.',
      };
      this.end('fail', msgMap[ruleKey] ?? 'Zakázaný input.');
      return;
    }

    // If waiting on `when`, re-check condition
    if (this.waiting.kind === 'when') {
      if (this.isWhenSatisfied(this.waiting.when, input)) {
        this.waiting = { kind: 'none' };
        this.runLoop();
      }
    }
  }

  onStateMaybeChanged(): void {
    if (this.ended) return;
    if (this.waiting.kind === 'when') {
      if (this.isWhenSatisfied(this.waiting.when, undefined)) {
        this.waiting = { kind: 'none' };
        this.runLoop();
      }
    }
  }

  /** DEV only: execute exactly one actionable step (ignores at/when gating). */
  debugStepOnce(): { executed: boolean; ended: boolean; pc: number } {
    if (this.ended) return { executed: false, ended: true, pc: this.pc };

    let guard = 0;
    while (!this.ended && this.pc < this.steps.length && guard++ < 1000) {
      const step: any = this.steps[this.pc];

      // Label-only step
      if (step?.label && !step.do) {
        this.pc++;
        continue;
      }

      const elapsed = this.getElapsedMs();

      // Execute action ignoring at/when (DEV stepping convenience).
      if (step?.do) {
        if (step.do === 'flow.random') {
          const choices = Array.isArray(step.choices) ? step.choices : [];
          const seedKey = typeof step.seedKey === 'string' ? step.seedKey : 'default';
          const rng = new RandomSystem(`${this.level.id}:${seedKey}`);
          const idx = rng.pickIndex(choices.length);
          const choice = choices[idx] ?? choices[0];
          this.log?.({ t: elapsed, kind: 'random', msg: 'flow.random', data: { seedKey, choices, idx, choice } });
          if (choice) {
            this.gotoLabel(choice);
            return { executed: true, ended: this.ended, pc: this.pc };
          }
          this.pc++;
          return { executed: true, ended: this.ended, pc: this.pc };
        }

        const action = step as Action;
        const r = this.dispatcher.dispatch(action);
        this.callbacks.onRenderModel(this.state.snapshotRenderModel());

        if (r.end) {
          this.end(r.end.result, r.end.reason);
          return { executed: true, ended: this.ended, pc: this.pc };
        }
        if (r.gotoLabel) {
          this.gotoLabel(r.gotoLabel);
          return { executed: true, ended: this.ended, pc: this.pc };
        }

        this.pc++;
        return { executed: true, ended: this.ended, pc: this.pc };
      }

      this.pc++;
    }

    return { executed: false, ended: this.ended, pc: this.pc };
  }

  /** DEV only: run through all remaining steps (ignores at/when). */
  debugSkipToEnd(): void {
    let guard = 0;
    while (!this.ended && this.pc < this.steps.length && guard++ < this.steps.length * 5) {
      const r = this.debugStepOnce();
      if (!r.executed) break;
    }
  }

  private runLoop(): void {
    if (this.ended) return;
    if (this.waiting.kind !== 'none') return;

    while (!this.ended && this.pc < this.steps.length) {
      const step: any = this.steps[this.pc];

      // Label-only step
      if (step?.label && !step.do) {
        this.pc++;
        continue;
      }

      const elapsed = this.getElapsedMs();

      if (step?.at) {
        const atMs = parseTimeMs(step.at);
        if (atMs > elapsed) {
          const dueIn = atMs - elapsed;
          const timerId = this.setTimeoutFn(() => {
            if (this.ended) return;
            this.waiting = { kind: 'none' };
            this.runLoop();
          }, dueIn);
          this.waiting = { kind: 'at', dueAtMs: atMs, timerId };
          return;
        }
        // catch-up: at in past executes immediately
      }

      if (step?.when) {
        if (!this.isWhenSatisfied(step.when, undefined)) {
          this.waiting = { kind: 'when', when: step.when };
          return;
        }
      }

      // Execute action
      if (step?.do) {
        if (step.do === 'flow.random') {
          const choices = Array.isArray(step.choices) ? step.choices : [];
          const seedKey = typeof step.seedKey === 'string' ? step.seedKey : 'default';
          const rng = new RandomSystem(`${this.level.id}:${seedKey}`);
          const idx = rng.pickIndex(choices.length);
          const choice = choices[idx] ?? choices[0];
          this.log?.({ t: elapsed, kind: 'random', msg: 'flow.random', data: { seedKey, choices, idx, choice } });
          if (choice) {
            this.gotoLabel(choice);
            continue;
          }
          this.pc++;
          continue;
        }

        const action = step as Action;
        const r = this.dispatcher.dispatch(action);
        this.callbacks.onRenderModel(this.state.snapshotRenderModel());

        if (r.end) {
          this.end(r.end.result, r.end.reason);
          return;
        }
        if (r.gotoLabel) {
          this.gotoLabel(r.gotoLabel);
          continue;
        }
      }

      this.pc++;
    }
  }

  private gotoLabel(label: string): void {
    this.jumpCount++;
    if (this.jumpCount > this.loopLimit) {
      this.end('fail', 'loop limit exceeded');
      return;
    }
    const idx = this.labelToIndex.get(label);
    if (idx === undefined) {
      this.end('fail', `unknown label: ${label}`);
      return;
    }
    this.pc = idx;
    // immediate catch-up will happen in runLoop
  }

  private isWhenSatisfied(when: When, input?: InputEvent): boolean {
    if ('input' in when) {
      if (when.input === 'click') return input?.type === 'click';
      if (when.input === 'keyDown') return input?.type === 'keyboard' && input.keyCode === when.key;
      return false;
    }
    if ('var' in when) {
      const v = this.state.getVarNumber(when.var);
      return v >= when.gte;
    }
    return false;
  }

  private end(result: 'success' | 'fail', reason?: string): void {
    if (this.ended) return;
    this.ended = true;
    this.clearWaitingTimer();
    if (result === 'success') this.callbacks.onSuccess();
    else this.callbacks.onFail(reason ?? 'fail');
  }

  private clearWaitingTimer(): void {
    if (this.waiting.kind === 'at' && this.waiting.timerId != null) {
      this.clearTimeoutFn(this.waiting.timerId);
    }
    this.waiting = { kind: 'none' };
  }
}

