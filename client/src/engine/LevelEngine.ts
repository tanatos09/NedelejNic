import type { LegacyLevelConfig } from '../legacyTypes';
import { InputSystem } from './InputSystem';

export interface EngineCallbacks {
  onFail: (reason: string) => void;
  onSuccess: () => void;
  onSubtitle: (text: string) => void;
  onProgress: (progress: number) => void;
  onEventIndex?: (index: number) => void;
  onStateChange?: (state: EngineState) => void;
  onEventLog?: (entry: EventLogEntry) => void;
}

export interface DevModeState {
  enabled: boolean;
  stepMode: boolean;
}

export type EngineState = 'idle' | 'running' | 'paused' | 'ended';

export interface EventLogEntry {
  index: number;
  time: number;
  type: string;
  text?: string;
  timestamp: number;
}

export interface EngineSnapshot {
  state: EngineState;
  currentEventIndex: number;
  totalEvents: number;
  progress: number;
  elapsedMs: number;
  isPaused: boolean;
  eventLog: EventLogEntry[];
}

export class LevelEngine {
  private config: LegacyLevelConfig;
  private callbacks: EngineCallbacks;
  private inputSystem: InputSystem;
  private timers: number[] = [];
  private ended = false;
  private progressInterval: number | null = null;
  private startTime = 0;
  private pausedAt = 0;
  private pausedElapsed = 0;
  private devMode: DevModeState;
  private currentEventIndex = 0;
  private _state: EngineState = 'idle';
  private eventLog: EventLogEntry[] = [];
  private audioObjects: HTMLAudioElement[] = [];

  constructor(config: LegacyLevelConfig, callbacks: EngineCallbacks, devMode?: DevModeState) {
    this.config = config;
    this.callbacks = callbacks;
    this.devMode = devMode || { enabled: false, stepMode: false };
    const convertedRules = {
      mouseMove: config.rules.mouseMove ? 'forbidden' : 'allowed',
      click: config.rules.click ? 'forbidden' : 'allowed',
      keyboard: config.rules.keyboard ? 'forbidden' : 'allowed',
      scroll: config.rules.scroll ? 'forbidden' : 'allowed',
      touch: config.rules.touch ? 'forbidden' : 'allowed',
    } as any;
    this.inputSystem = new InputSystem(convertedRules, {
      onFail: (reason) => this.fail(reason),
    });
  }

  get state(): EngineState {
    return this._state;
  }

  get snapshot(): EngineSnapshot {
    return {
      state: this._state,
      currentEventIndex: this.currentEventIndex,
      totalEvents: this.config.events.length,
      progress: this.getProgress(),
      elapsedMs: this.getElapsedMs(),
      isPaused: this._state === 'paused',
      eventLog: [...this.eventLog],
    };
  }

  start(): void {
    this.ended = false;
    this.currentEventIndex = 0;
    this.startTime = Date.now();
    this.pausedElapsed = 0;
    this.eventLog = [];
    this.setState('running');

    if (this.devMode.enabled && this.devMode.stepMode) {
      this.callbacks.onEventIndex?.(0);
    } else {
      this.setupEvents();
      this.setupTimer();
    }

    this.attachInputListeners();
  }

  stop(): void {
    this.ended = true;
    this.clearTimers();
    this.detachInputListeners();
    this.stopAllAudio();
    this.setState('ended');
  }

  // ── Pause / Resume ────────────────────────────

  pause(): void {
    if (this._state !== 'running') return;

    this.pausedAt = Date.now();
    this.clearTimers();
    this.detachInputListeners();
    this.setState('paused');
  }

  resume(): void {
    if (this._state !== 'paused') return;

    const pauseDuration = Date.now() - this.pausedAt;
    this.pausedElapsed += pauseDuration;
    this.setState('running');

    // Re-schedule remaining events with adjusted times
    if (!this.devMode.stepMode) {
      this.setupRemainingEvents();
      this.setupTimer();
    }

    this.attachInputListeners();
  }

  // ── Input control (public for GamePage) ───────

  attachInputListeners(): void {
    this.inputSystem.attachListeners();
  }

  detachInputListeners(): void {
    this.inputSystem.detachListeners();
  }

  // ── Dev mode methods ──────────────────────────

  nextEvent(): void {
    if (!this.devMode.enabled || this.ended) return;

    if (this.currentEventIndex < this.config.events.length) {
      this.executeEvent(this.currentEventIndex);
    }
  }

  skipToEnd(): void {
    if (!this.devMode.enabled || this.ended) return;

    while (this.currentEventIndex < this.config.events.length) {
      this.executeEvent(this.currentEventIndex);
    }

    this.stop();
    this.callbacks.onSuccess();
  }

  resetLevel(): void {
    if (!this.devMode.enabled) return;

    this.stop();
    this.currentEventIndex = 0;
    this.eventLog = [];
    this.callbacks.onSubtitle('');
    this.callbacks.onProgress(0);
    this.callbacks.onEventIndex?.(0);
    this.setState('idle');
  }

  restartLevel(): void {
    this.stop();
    this._state = 'idle';
    this.start();
  }

  /** Jump to a specific level (DEV only) — engine just resets, caller loads new config */
  jumpToLevel(_levelId: number): void {
    this.stop();
    this._state = 'idle';
    this.eventLog = [];
  }

  triggerEvent(index: number): void {
    if (!this.devMode.enabled || this.ended) return;
    if (index >= 0 && index < this.config.events.length) {
      this.executeEvent(index);
    }
  }

  getEventLog(): EventLogEntry[] {
    return [...this.eventLog];
  }

  // ── Audio ─────────────────────────────────────

  private stopAllAudio(): void {
    for (const audio of this.audioObjects) {
      audio.pause();
      audio.currentTime = 0;
    }
    this.audioObjects = [];
  }

  // ── Internal ──────────────────────────────────

  private fail(reason: string): void {
    if (this.ended) return;
    this.stop();
    this.callbacks.onFail(reason);
  }

  private setState(state: EngineState): void {
    this._state = state;
    this.callbacks.onStateChange?.(state);
  }

  private getElapsedMs(): number {
    if (this._state === 'paused') {
      return this.pausedAt - this.startTime - this.pausedElapsed;
    }
    if (this.startTime === 0) return 0;
    return Date.now() - this.startTime - this.pausedElapsed;
  }

  private getProgress(): number {
    const durationMs = this.config.end.time * 1000;
    if (durationMs === 0) return 0;
    return Math.min(this.getElapsedMs() / durationMs, 1);
  }

  private clearTimers(): void {
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  private setupEvents(): void {
    for (let i = 0; i < this.config.events.length; i++) {
      const ev = this.config.events[i];
      const t = window.setTimeout(() => {
        if (this.ended) return;
        this.executeEvent(i);
      }, ev.time * 1000);
      this.timers.push(t);
    }
  }

  private setupRemainingEvents(): void {
    const elapsed = this.getElapsedMs();
    for (let i = this.currentEventIndex; i < this.config.events.length; i++) {
      const ev = this.config.events[i];
      const remaining = ev.time * 1000 - elapsed;
      if (remaining <= 0) {
        this.executeEvent(i);
      } else {
        const t = window.setTimeout(() => {
          if (this.ended) return;
          this.executeEvent(i);
        }, remaining);
        this.timers.push(t);
      }
    }
  }

  private executeEvent(index: number): void {
    const event = this.config.events[index];
    if (!event) return;

    // Log the event
    this.eventLog.push({
      index,
      time: event.time,
      type: event.type,
      text: event.text,
      timestamp: Date.now(),
    });
    this.callbacks.onEventLog?.({
      index,
      time: event.time,
      type: event.type,
      text: event.text,
      timestamp: Date.now(),
    });

    if (event.type === 'clear') {
      this.callbacks.onSubtitle('');
    } else if (event.type === 'subtitle' && event.text) {
      this.callbacks.onSubtitle(event.text);
    } else if (event.type === 'voice' && event.audio) {
      const audio = new Audio(`/assets/audio/${event.audio}`);
      audio.play().catch(() => {});
      this.audioObjects.push(audio);
    }

    this.currentEventIndex = index + 1;
    this.callbacks.onEventIndex?.(this.currentEventIndex);
  }

  private setupTimer(): void {
    const durationMs = this.config.end.time * 1000;

    this.progressInterval = window.setInterval(() => {
      if (this.ended) {
        if (this.progressInterval !== null) clearInterval(this.progressInterval);
        return;
      }
      const p = this.getProgress();
      this.callbacks.onProgress(p);

      if (this.getElapsedMs() >= durationMs) {
        this.stop();
        this.callbacks.onSuccess();
      }
    }, 100);
  }
}

export async function preloadAssets(config: LegacyLevelConfig): Promise<void> {
  const audioEvents = config.events.filter((e) => e.type === 'voice' && e.audio);
  if (audioEvents.length === 0) return;

  await Promise.all(
    audioEvents.map(
      (e) =>
        new Promise<void>((resolve) => {
          const audio = new Audio(`/assets/audio/${e.audio}`);
          let done = false;
          const finish = () => {
            if (done) return;
            done = true;
            resolve();
          };

          // Some browsers never fire canplaythrough/error for missing/blocked media.
          // Hardening: always resolve within a short timeout.
          const t = window.setTimeout(finish, 2500);

          audio.addEventListener('canplaythrough', () => {
            clearTimeout(t);
            finish();
          }, { once: true });
          audio.addEventListener('loadeddata', () => {
            clearTimeout(t);
            finish();
          }, { once: true });
          audio.addEventListener('error', () => {
            clearTimeout(t);
            finish();
          }, { once: true });
          audio.load();
        })
    )
  );
}
