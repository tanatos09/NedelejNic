import type { Action, AnyLevel, DispatchResult, EngineCallbacks, EngineState, EventLogEntry, InputEvent } from './types';
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
  /** Alert s pozastavením času — vstup kromě kliknutí na vrstvu ignorovat. */
  private timelineHoldActive = false;
  private timelineHoldLayerId: string | null = null;
  private timelineHoldTimer: ReturnType<typeof window.setTimeout> | null = null;
  private karrelBehaviors: Array<{ when: any; then: any[] }> = [];
  /** Omezí Karrel reakce na mouseMove (~spodní pásmo Hz na vstupní vrstvě už stejně throttluje InputManager). */
  private karrelMouseMoveDedupAt = 0;
  private static readonly KARREL_MOUSEMOVE_MIN_GAP_MS = 900;

  private sceneArmTimer: ReturnType<typeof window.setTimeout> | null = null;
  /** Čas odstartoval dřív než user; čeká na resume. */
  private sceneStartPending = false;
  /** Časovač závěrečné Karrel hlášky (mezi koncem levelu a koncovým oknem). */
  private endingTimer: ReturnType<typeof window.setTimeout> | null = null;

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
    if (this.scheduler?.isTimeFrozen()) return this.scheduler.getElapsedMs();
    return Date.now() - this.startEpoch - this.pausedElapsed;
  }

  async load(
    levelOrLegacy: AnyLevel | LevelConfig | LegacyLevelConfig,
    opts?: { vars?: Record<string, number | string> }
  ): Promise<void> {
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

    // Seed externích proměnných (např. `karma` z lokálního skóre). Umožňuje
    // levelům přes `flow.branch` / Karrel `whenVar` měnit dialog podle skóre.
    if (opts?.vars && typeof opts.vars === 'object') {
      for (const [key, value] of Object.entries(opts.vars)) {
        if (typeof value === 'number' || typeof value === 'string') {
          this.store.setVar(key, value);
        }
      }
    }

    this.karrelMouseMoveDedupAt = 0;
    this.clearTimelineHold();
    this.store.setGameInputEnabled(true);

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
    this.karrelMouseMoveDedupAt = 0;
    this.clearTimelineHold();
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
      (e) => this.callbacks.onEventLog?.(e),
      20,
      (r) => this.applyDispatchTimelineHold(r)
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
    gameInputEnabled: boolean;
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
      gameInputEnabled: this.store.isGameInputEnabled(),
      scheduler: this.scheduler?.getDebugState(),
      vars: this.store.getVarsSnapshot(),
      rules: this.store.getRulesSnapshot(),
      traps: this.store.getTrapsSnapshot(),
      effects: this.store.getEffectsSnapshot(),
      renderModel: this.store.snapshotRenderModel(),
    };
  }

  stop(): void {
    this.releaseTimelineHold({ log: false });
    if (this.endingTimer != null) {
      window.clearTimeout(this.endingTimer);
      this.endingTimer = null;
    }
    if (this.ended) {
      // Mohli jsme být uprostřed závěrečné hlášky — utni audio a nedopal callback.
      this.audio.stopAll();
      return;
    }
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
    if (this.timelineHoldActive) this.endTimelineHold();
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
    const pauseDuration = this.scheduler?.resume() ?? 0;
    this.pausedElapsed += pauseDuration;
    this.setState('running');
    this.setupProgressTimer();
  }

  onInput(input: InputEvent): void {
    if (this.ended) return;
    if (this._state !== 'running') return;
    if (!this.startEpoch) return;
    if (this.timelineHoldActive) {
      if (
        input.type === 'click' &&
        this.timelineHoldLayerId &&
        input.targetLayerId === this.timelineHoldLayerId
      ) {
        this.endTimelineHold();
        this.callbacks.onRenderModel(this.store.snapshotRenderModel());
      }
      return;
    }
    if (!this.store.isGameInputEnabled()) return;
    this.scheduler?.onInput(input);
    this.runKarrelOnInput(input);
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());
  }

  private karrelBehaviorMatchesInput(b: Record<string, unknown>, input: InputEvent): boolean {
    const wa = (b as any).whenAny;
    if (Array.isArray(wa) && wa.length > 0) {
      return wa.includes(input.type);
    }
    const w = (b as any).when;
    if (!w || typeof w !== 'object') return false;
    if ((w as any).input) {
      if ((w as any).input !== input.type) return false;
    }
    // Optional guard: { when: { input: 'click', keyCode?: 'KeyX' } }
    if ((w as any).keyCode && input.keyCode !== (w as any).keyCode) return false;
    return true;
  }

  /** Volitelná podmínka na proměnnou ve stavu (`karrel.*`). Bez pole se chování bere jako dřív. */
  private karrelBehaviorMatchesWhenVar(b: Record<string, unknown>): boolean {
    const w = (b as any).whenVar as { key?: string; op?: string; value?: number | string } | undefined;
    if (w == null || typeof w !== 'object') return true;
    const key = w.key;
    if (typeof key !== 'string' || !key.trim()) return false;
    const op = w.op;
    const right = w.value;
    if (op === 'eq') {
      const left = this.store.vars[key];
      return String(left ?? '') === String(right ?? '');
    }
    const lnum = this.store.getVarNumber(key);
    const rnum = typeof right === 'number' ? right : typeof right === 'string' ? Number(right) || 0 : 0;
    if (op === 'gte') return lnum >= rnum;
    if (op === 'lte') return lnum <= rnum;
    return false;
  }

  private runKarrelOnInput(input: InputEvent): void {
    if (this.karrelBehaviors.length === 0) return;
    if (input.type === 'mouseMove') {
      const now = Date.now();
      if (now - this.karrelMouseMoveDedupAt < LevelRunner.KARREL_MOUSEMOVE_MIN_GAP_MS) return;
      this.karrelMouseMoveDedupAt = now;
    }
    const elapsed = this.getElapsedMs();
    for (const bRaw of this.karrelBehaviors) {
      const b = bRaw as Record<string, unknown>;
      if (!this.karrelBehaviorMatchesInput(b, input)) continue;
      if (!this.karrelBehaviorMatchesWhenVar(b)) continue;

      const onceGroup = typeof (b as any).onceGroup === 'string' ? ((b as any).onceGroup as string) : null;
      if (onceGroup) {
        const gKey = `karrel.onceGroup.${onceGroup}`;
        if (this.store.getVarNumber(gKey) >= 1) continue;
      }

      const then = Array.isArray((b as any)?.then) ? ((b as any).then as unknown[]) : [];
      let holdFromChain: DispatchResult['timelineHold'];
      this.callbacks.onEventLog?.({
        t: elapsed,
        kind: 'engine',
        msg: 'karrel.behavior',
        data: {
          whenAny: (b as any).whenAny,
          when: (b as any).when,
          whenVar: (b as any).whenVar,
          onceGroup,
          actions: then.length,
        },
      });
      for (const a of then) {
        const r = this.dispatcher.dispatch(a as any);
        if (r.timelineHold) holdFromChain = r.timelineHold;
        if (r.gotoLabel) {
          this.callbacks.onEventLog?.({ t: elapsed, kind: 'engine', msg: 'karrel.goto.ignored', data: r.gotoLabel });
        }
        if (r.end) {
          if (r.end.result === 'success') this.finishLevel('success');
          else this.finishLevel('fail', r.end.reason ?? 'fail');
          return;
        }
      }
      if (holdFromChain) this.beginTimelineHold(holdFromChain);
      if (onceGroup) this.store.setVar(`karrel.onceGroup.${onceGroup}`, 1);
      // Jedno Karrel chování na jeden vstup — jinak by `state.set` ve stejném ticku
      // posunulo fázi a spustilo i další bloky v poli `behaviors` (např. okamžitý fail).
      return;
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

  private applyDispatchTimelineHold(r: DispatchResult): void {
    if (r.timelineHold) this.beginTimelineHold(r.timelineHold);
  }

  private beginTimelineHold(payload: { layerId: string; autoResumeMs?: number }): void {
    if (this.ended || !this.scheduler) return;
    if (this.timelineHoldActive) this.releaseTimelineHold({ log: false });

    this.scheduler.pause();
    this.timelineHoldActive = true;
    this.timelineHoldLayerId = payload.layerId;
    this.audio.pausePlayback();

    if (this.timelineHoldTimer != null) {
      window.clearTimeout(this.timelineHoldTimer);
      this.timelineHoldTimer = null;
    }
    const lid = payload.layerId;
    const ms = payload.autoResumeMs;
    if (typeof ms === 'number' && ms > 0) {
      this.timelineHoldTimer = window.setTimeout(() => {
        this.timelineHoldTimer = null;
        if (!this.ended && this.timelineHoldActive && this.timelineHoldLayerId === lid) {
          this.endTimelineHold();
          this.callbacks.onRenderModel(this.store.snapshotRenderModel());
        }
      }, ms);
    }

    this.callbacks.onEventLog?.({
      t: this.getElapsedMs(),
      kind: 'engine',
      msg: 'timeline.hold.start',
      data: payload,
    });
    this.callbacks.onRenderModel(this.store.snapshotRenderModel());
  }

  private endTimelineHold(): void {
    this.releaseTimelineHold({ log: true });
  }

  /** Uvolnění pozastavení času (klik / časovač / ukončení levelu). */
  private releaseTimelineHold(opts: { log?: boolean }): void {
    if (this.timelineHoldTimer != null) {
      window.clearTimeout(this.timelineHoldTimer);
      this.timelineHoldTimer = null;
    }
    const wasHold = this.timelineHoldActive;
    const lid = this.timelineHoldLayerId;
    this.timelineHoldActive = false;
    this.timelineHoldLayerId = null;

    if (wasHold && this.scheduler?.isTimeFrozen()) {
      const d = this.scheduler.resume() ?? 0;
      this.pausedElapsed += d;
    }
    this.audio.resumePlayback();
    if (lid) {
      const removeAction: Action = { do: 'ui.layer', op: 'remove', id: lid, type: 'toast' };
      this.dispatcher.dispatch(removeAction);
    }
    if (opts.log && wasHold) {
      this.callbacks.onEventLog?.({
        t: this.getElapsedMs(),
        kind: 'engine',
        msg: 'timeline.hold.end',
        data: { layerId: lid },
      });
    }
  }

  private clearTimelineHold(): void {
    this.releaseTimelineHold({ log: false });
  }

  /**
   * Úklid + `ended` před callbackem do UI — bez toho zůstal runner ve stavu `running`,
   * takže se po výsledku znovu volalo `pause()` a rozbíjelo dokončení levelu.
   */
  private finishLevel(result: 'success' | 'fail', reason?: string): void {
    if (this.ended) return;
    this.releaseTimelineHold({ log: false });
    this.ended = true;
    if (this.sceneArmTimer != null) {
      window.clearTimeout(this.sceneArmTimer);
      this.sceneArmTimer = null;
    }
    this.sceneStartPending = false;
    this.scheduler?.stop();
    this.scheduler = null;
    this.effects.stopAll();
    if (this.progressInterval != null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }

    // Závěrečná Karrel hláška (volitelná, datově řízená přes `level.ending`).
    // Přehraje se ještě na herní obrazovce; koncové okno se ukáže až po `holdMs`.
    const ending = (this.level as any)?.ending?.[result] as
      | { caption?: string; subtitle?: string; voice?: string; holdMs?: number }
      | undefined;

    if (ending && typeof ending === 'object') {
      // Utni audio a UI vrstvy z levelu, ať zůstane jen čistá závěrečná hláška.
      this.audio.stopAll();
      this.store.clearAllLayers();
      if (typeof ending.caption === 'string') this.store.setText('caption', ending.caption);
      if (typeof ending.subtitle === 'string') this.store.setText('subtitle', ending.subtitle);
      this.callbacks.onRenderModel(this.store.snapshotRenderModel());
      if (typeof ending.voice === 'string' && ending.voice.trim()) {
        this.audio.play({ kind: 'voice', file: ending.voice, loop: false, volume: 1 });
      }
      const holdMs =
        typeof ending.holdMs === 'number' && ending.holdMs > 0 ? ending.holdMs : 4500;
      this.callbacks.onEventLog?.({
        t: this.getElapsedMs(),
        kind: 'engine',
        msg: 'level.ending',
        data: { result, holdMs },
      });
      this.endingTimer = window.setTimeout(() => {
        this.endingTimer = null;
        this.finalizeEnd(result, reason);
      }, holdMs);
      return;
    }

    this.finalizeEnd(result, reason);
  }

  /** Skutečné ukončení: úklid audio + přepnutí UI na koncové okno. */
  private finalizeEnd(result: 'success' | 'fail', reason?: string): void {
    if (this.endingTimer != null) {
      window.clearTimeout(this.endingTimer);
      this.endingTimer = null;
    }
    this.audio.stopAll();
    this.setState('ended');
    if (result === 'success') this.callbacks.onSuccess();
    else this.callbacks.onFail(reason ?? 'fail');
  }

  private setState(s: EngineState): void {
    this._state = s;
    this.callbacks.onStateChange?.(s);
  }
}

