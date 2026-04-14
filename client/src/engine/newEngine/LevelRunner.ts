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

export class LevelRunner {
  private _state: EngineState = 'idle';
  private ended = false;

  private store = new StateStore();
  private audio: AudioSystem;
  private effects: EffectSystem;
  private dispatcher: ActionDispatcher;
  private scheduler: TimelineScheduler | null = null;
  private traps: TrapSystem;

  private progressInterval: number | null = null;
  private level: AnyLevel | null = null;
  private callbacks: EngineCallbacks;
  private lastLoadedRaw: AnyLevel | LevelConfig | LegacyLevelConfig | null = null;

  private startEpoch = 0;
  private pausedAt = 0;
  private pausedElapsed = 0;

  constructor(callbacks: EngineCallbacks) {
    this.callbacks = callbacks;
    const nowMs = () => this.getElapsedMs();
    const devLog = (e: EventLogEntry) => this.callbacks.onEventLog?.(e);
    this.audio = new AudioSystem(nowMs, devLog);
    this.effects = new EffectSystem(this.store, window.setTimeout, window.clearTimeout);
    this.dispatcher = new ActionDispatcher(this.store, this.audio, this.effects, devLog, nowMs);
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
    if ((levelOrLegacy as any).events) {
      this.level = adaptLegacyLevelConfig(levelOrLegacy as LegacyLevelConfig);
    } else {
      this.level = levelOrLegacy as AnyLevel;
    }
    this.callbacks.onEventLog?.({ t: 0, kind: 'engine', msg: 'level.load', data: { id: this.level.id, type: this.level.type } });
    const report = validateLevel(this.level);
    for (const entry of reportToEventLog(report)) this.callbacks.onEventLog?.(entry);
    this.setState('idle');
  }

  async preload(): Promise<void> {
    if (!this.level) return;
    this.callbacks.onEventLog?.({ t: this.getElapsedMs(), kind: 'engine', msg: 'assets.preload.start', data: this.level.assets ?? {} });
    await this.audio.preload(this.level.assets ?? {});
    this.callbacks.onEventLog?.({ t: this.getElapsedMs(), kind: 'engine', msg: 'assets.preload.end' });
  }

  start(): void {
    if (!this.level) return;
    this.ended = false;
    this.startEpoch = Date.now();
    this.pausedElapsed = 0;
    this.callbacks.onEventLog?.({ t: 0, kind: 'engine', msg: 'engine.start', data: { id: this.level.id } });
    this.setState('running');

    // Initial rules (if provided)
    if (this.level.type === 'action' && this.level.rules) {
      this.store.setRule(this.level.rules as any);
    }

    // Emit initial render model
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());

    this.scheduler = new TimelineScheduler(
      this.level,
      this.store,
      this.dispatcher,
      this.traps,
      this.callbacks,
      window.setTimeout,
      window.clearTimeout,
      (e) => this.callbacks.onEventLog?.(e)
    );
    const timeline = this.level.type === 'action' ? this.level.timeline : [];
    this.scheduler.init(timeline);
    this.scheduler.start();

    this.setupProgressTimer();
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
    // Equivalent to level.end.success with proper shutdown.
    this.callbacks.onEventLog?.({ t: this.getElapsedMs(), kind: 'engine', msg: 'debug.skip.success' });
    this.scheduler?.stop();
    this.audio.stopAll();
    this.effects.stopAll();
    if (this.progressInterval != null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.setState('ended');
    this.callbacks.onSuccess();
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
    const pauseDuration = Date.now() - this.pausedAt;
    this.pausedElapsed += pauseDuration;
    this.setState('running');
    this.scheduler?.resume();
    this.setupProgressTimer();
  }

  onInput(input: InputEvent): void {
    if (this.ended) return;
    if (this._state !== 'running') return;
    this.scheduler?.onInput(input);
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());
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

  private setState(s: EngineState): void {
    this._state = s;
    this.callbacks.onStateChange?.(s);
  }
}

