import type { AnyLevel, EngineCallbacks, EngineState, EventLogEntry, InputEvent } from './types';
import { adaptLegacyLevelConfig } from './types';
import type { LevelConfig } from '../../types';
import type { LegacyLevelConfig } from '../../legacyTypes';
import { StateStore } from './StateStore';
import { AudioSystem } from './AudioSystem';
import { EffectSystem } from './EffectSystem';
import { ActionDispatcher } from './ActionDispatcher';
import { TrapSystem } from './TrapSystem';
import { TimelineScheduler } from './TimelineScheduler';
import { clamp01 } from './util';
import { reportToEventLog, validateLevel } from './LevelValidator';
import { HookRuntime } from '../effects/HookRuntime';

export class LevelRunner {
  /** Po kliku „Začít…“ chvíli neodpálit časovou osu ani vstup — čisté UI a žádné okamžité faily. */
  private static readonly START_SCENE_ARM_MS = 1100;

  private _state: EngineState = 'idle';
  private ended = false;

  private store = new StateStore();
  private audio: AudioSystem;
  private effects: EffectSystem;
  private dispatcher: ActionDispatcher;
  private scheduler: TimelineScheduler | null = null;
  private traps: TrapSystem;
  private hooks: HookRuntime;

  private progressInterval: number | null = null;
  private level: AnyLevel | null = null;
  private callbacks: EngineCallbacks;
  private lastLoadedRaw: AnyLevel | LevelConfig | LegacyLevelConfig | null = null;

  private startEpoch = 0;
  private pausedAt = 0;
  private pausedElapsed = 0;
  private karrelBehaviors: Array<{ when: any; then: any[] }> = [];

  private sceneArmTimer: ReturnType<typeof window.setTimeout> | null = null;
  /** Čas odstartoval dřív než user; čeká na resume. */
  private sceneStartPending = false;

  /** Časová osa a vstup začínají až po zbrojení (žádný fail hned po kliknutí „Začít…“). */
  isSceneArmed(): boolean {
    return !!this.startEpoch && !this.ended;
  }

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    const nowMs = () => this.getElapsedMs();
    const devLog = (e: EventLogEntry) => this.callbacks.onEventLog?.(e);
    this.audio = new AudioSystem(nowMs, devLog);
    this.effects = new EffectSystem(this.store, window.setTimeout.bind(window), window.clearTimeout.bind(window));
    this.hooks = new HookRuntime({ nowMs, log: devLog });
    this.dispatcher = new ActionDispatcher(this.store, this.audio, this.effects, this.hooks, devLog, nowMs);
    this.traps = new TrapSystem(this.store, () => this.getElapsedMs());
  }

  get state(): EngineState {
    return this._state;
  }

  getElapsedMs(): number {
    if (!this.startEpoch) return 0;
    if (this._state === 'paused') return this.pausedAt - this.startEpoch - this.pausedElapsed;
    return Date.now() - this.startEpoch - this.pausedElapsed;
  }

  async load(levelOrLegacy: AnyLevel | LevelConfig | LegacyLevelConfig): Promise<void> {
    this.stop();
    this.ended = false;
    this.lastLoadedRaw = levelOrLegacy;
    this.karrelBehaviors = [];
    if ((levelOrLegacy as any).events) {
      this.level = adaptLegacyLevelConfig(levelOrLegacy as LegacyLevelConfig);
    } else {
      this.level = levelOrLegacy as AnyLevel;
    }
    this.callbacks.onEventLog?.({ t: 0, kind: 'engine', msg: 'level.load', data: { id: this.level.id, type: this.level.type } });
    const report = validateLevel(this.level);
    for (const entry of reportToEventLog(report)) this.callbacks.onEventLog?.(entry);

    // Karrel (basic, data-driven): optional `karrel` section on level JSON.
    // This keeps the engine extensible without hardcoding personality logic.
    const k = (this.level as any)?.karrel;
    if (k?.memoryDefaults && typeof k.memoryDefaults === 'object') {
      for (const [key, value] of Object.entries(k.memoryDefaults as Record<string, any>)) {
        if (typeof value === 'number' || typeof value === 'string') {
          this.store.setVar(`karrel.${key}`, value);
        }
      }
    }
    if (Array.isArray(k?.behaviors)) {
      this.karrelBehaviors = k.behaviors as any[];
    }

    this.setState('idle');
  }

  async preload(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (!this.level) return;
    this.callbacks.onEventLog?.({ t: this.getElapsedMs(), kind: 'engine', msg: 'assets.preload.start', data: this.level.assets ?? {} });
    await this.audio.preload(this.level.assets ?? {}, onProgress);
    this.callbacks.onEventLog?.({ t: this.getElapsedMs(), kind: 'engine', msg: 'assets.preload.end' });
  }

  start(): void {
    if (!this.level) return;
    this.ended = false;
    if (this.sceneArmTimer != null) {
      window.clearTimeout(this.sceneArmTimer);
      this.sceneArmTimer = null;
    }
    /** Do odloženého startu scheduleru — žádné pasti / pravidla / kroky časové osy. */
    this.startEpoch = 0;
    this.sceneStartPending = false;
    this.pausedElapsed = 0;
    this.callbacks.onEventLog?.({ t: 0, kind: 'engine', msg: 'engine.start', data: { id: this.level.id } });
    this.setState('running');

    // Initial rules (if provided)
    if (this.level.type === 'action' && this.level.rules) {
      this.store.setRule(this.level.rules as any);
    }

    // Emit initial render model
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());

    const schedCallbacks: EngineCallbacks = {
      ...this.callbacks,
      onSuccess: () => this.finishLevel('success'),
      onFail: (reason: string) => this.finishLevel('fail', reason),
    };
    this.scheduler = new TimelineScheduler(
      this.level,
      this.store,
      this.dispatcher,
      this.traps,
      schedCallbacks,
      window.setTimeout.bind(window),
      window.clearTimeout.bind(window),
      (e) => this.callbacks.onEventLog?.(e)
    );
    const timeline = this.level.type === 'action' ? this.level.timeline : [];
    this.scheduler.init(timeline);

    const armMs = LevelRunner.START_SCENE_ARM_MS;
    this.sceneArmTimer = window.setTimeout(() => {
      this.sceneArmTimer = null;
      if (this.ended || !this.scheduler) return;
      if (this._state !== 'running') {
        this.sceneStartPending = true;
        return;
      }
      const t0 = Date.now();
      this.startEpoch = t0;
      this.scheduler.start(t0);
      this.setupProgressTimer();
    }, armMs);
  }

  restart(): void {
    if (!this.lastLoadedRaw) return;
    // Full reset via load/preload/start, but keeping deterministic behavior unchanged.
    void this.load(this.lastLoadedRaw).then(async () => {
      await this.preload();
      this.start();
    });
  }

  skipSuccess(): void {
    if (this.ended) return;
    this.callbacks.onEventLog?.({ t: this.getElapsedMs(), kind: 'engine', msg: 'debug.skip.success' });
    this.finishLevel('success');
  }

  /** DEV only: execute next timeline action step (ignores at/when gating). */
  debugNextStep(): void {
    if (this.ended) return;
    this.scheduler?.debugStepOnce();
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());
  }

  /** DEV only: execute remaining timeline steps (ignores at/when gating). */
  debugSkipToEnd(): void {
    if (this.ended) return;
    this.scheduler?.debugSkipToEnd();
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());
  }

  getDebugSnapshot(): {
    engineState: EngineState;
    level: AnyLevel | null;
    elapsedMs: number;
    scheduler?: ReturnType<TimelineScheduler['getDebugState']>;
    vars: Record<string, number | string>;
    rules: ReturnType<StateStore['getRulesSnapshot']>;
    traps: ReturnType<StateStore['getTrapsSnapshot']>;
    effects: ReturnType<StateStore['getEffectsSnapshot']>;
    renderModel: ReturnType<StateStore['snapshotRenderModel']>;
  } {
    return {
      engineState: this._state,
      level: this.level,
      elapsedMs: this.getElapsedMs(),
      scheduler: this.scheduler?.getDebugState(),
      vars: this.store.getVarsSnapshot(),
      rules: this.store.getRulesSnapshot(),
      traps: this.store.getTrapsSnapshot(),
      effects: this.store.getEffectsSnapshot(),
      renderModel: this.store.snapshotRenderModel(),
    };
  }

  stop(): void {
    if (this.ended) return;
    this.ended = true;
    if (this.sceneArmTimer != null) {
      window.clearTimeout(this.sceneArmTimer);
      this.sceneArmTimer = null;
    }
    this.sceneStartPending = false;
    this.scheduler?.stop();
    this.scheduler = null;
    this.audio.stopAll();
    this.effects.stopAll();
    if (this.progressInterval != null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.setState('ended');
  }

  pause(): void {
    if (this._state !== 'running') return;
    this.pausedAt = Date.now();
    this.scheduler?.pause();
    if (this.progressInterval != null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.setState('paused');
  }

  resume(): void {
    if (this._state !== 'paused') return;
    if (this.sceneStartPending && this.scheduler) {
      this.sceneStartPending = false;
      const t0 = Date.now();
      this.startEpoch = t0;
      this.scheduler.start(t0);
      this.setupProgressTimer();
      this.setState('running');
      return;
    }
    const pauseDuration = Date.now() - this.pausedAt;
    this.pausedElapsed += pauseDuration;
    this.setState('running');
    this.scheduler?.resume();
    this.setupProgressTimer();
  }

  onInput(input: InputEvent): void {
    if (this.ended) return;
    if (this._state !== 'running') return;
    if (!this.startEpoch) return;
    this.scheduler?.onInput(input);
    this.runKarrelOnInput(input);
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());
  }

  private runKarrelOnInput(input: InputEvent): void {
    if (this.karrelBehaviors.length === 0) return;
    const elapsed = this.getElapsedMs();
    for (const b of this.karrelBehaviors) {
      const w = (b as any)?.when;
      if (!w || typeof w !== 'object') continue;
      if (w.input) {
        // Minimal v1 behavior: { when: { input: 'click'|'mouseMove'|'keyboard'|'scroll'|'touch' }, then: Action[] }
        if (w.input !== input.type) continue;
      }
      // Optional guard: { when: { input: 'click', keyCode?: 'KeyX' } }
      if (w.keyCode && input.keyCode !== w.keyCode) continue;

      const then = Array.isArray((b as any)?.then) ? (b as any).then : [];
      this.callbacks.onEventLog?.({ t: elapsed, kind: 'engine', msg: 'karrel.behavior', data: { when: w, actions: then.length } });
      for (const a of then) {
        // dispatcher expects Action; we keep it permissive for prototype
        const r = this.dispatcher.dispatch(a as any);
        if (r.gotoLabel) {
          // Karrel can steer flow indirectly: log only for now.
          this.callbacks.onEventLog?.({ t: elapsed, kind: 'engine', msg: 'karrel.goto.ignored', data: r.gotoLabel });
        }
        if (r.end) {
          if (r.end.result === 'success') this.finishLevel('success');
          else this.finishLevel('fail', r.end.reason ?? 'fail');
          return;
        }
      }
    }
  }

  private setupProgressTimer(): void {
    const endSeconds =
      this.level?.end?.type === 'timer' ? this.level.end.time : (this.level as any)?.end?.time;
    const durationMs = typeof endSeconds === 'number' ? endSeconds * 1000 : 0;
    if (!durationMs) return;

    this.progressInterval = window.setInterval(() => {
      if (this.ended) return;
      const p = clamp01(this.getElapsedMs() / durationMs);
      this.callbacks.onProgress(p);
    }, 100);
  }

  /**
   * Úklid + `ended` před callbackem do UI — bez toho zůstal runner ve stavu `running`,
   * takže se po výsledku znovu volalo `pause()` a rozbíjelo dokončení levelu.
   */
  private finishLevel(result: 'success' | 'fail', reason?: string): void {
    if (this.ended) return;
    this.ended = true;
    if (this.sceneArmTimer != null) {
      window.clearTimeout(this.sceneArmTimer);
      this.sceneArmTimer = null;
    }
    this.sceneStartPending = false;
    this.scheduler?.stop();
    this.scheduler = null;
    this.audio.stopAll();
    this.effects.stopAll();
    if (this.progressInterval != null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.setState('ended');
    if (result === 'success') this.callbacks.onSuccess();
    else this.callbacks.onFail(reason ?? 'fail');
  }

  private setState(s: EngineState): void {
    this._state = s;
    this.callbacks.onStateChange?.(s);
  }
}

