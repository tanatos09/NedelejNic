import type { LevelConfig, LevelRules } from '../types';

export interface EngineCallbacks {
  onFail: (reason: string) => void;
  onSuccess: () => void;
  onSubtitle: (text: string) => void;
  onProgress: (progress: number) => void;
}

export class LevelEngine {
  private config: LevelConfig;
  private callbacks: EngineCallbacks;
  private timers: number[] = [];
  private ended = false;
  private mouseActive = false;
  private listeners: Array<{ type: string; fn: EventListener }> = [];
  private progressInterval: number | null = null;
  private startTime = 0;

  constructor(config: LevelConfig, callbacks: EngineCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
  }

  start(): void {
    this.ended = false;
    this.mouseActive = false;
    this.startTime = Date.now();
    this.setupInputDetection();
    this.setupEvents();
    this.setupTimer();
  }

  stop(): void {
    this.ended = true;
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];
    if (this.progressInterval !== null) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
    this.listeners.forEach(({ type, fn }) =>
      document.removeEventListener(type, fn)
    );
    this.listeners = [];
  }

  private fail(reason: string): void {
    if (this.ended) return;
    this.stop();
    this.callbacks.onFail(reason);
  }

  private setupInputDetection(): void {
    const { rules } = this.config;

    const actionMap: Array<{
      ruleKey: keyof LevelRules;
      event: string;
      msg: string;
      deferred?: boolean;
    }> = [
      { ruleKey: 'click', event: 'click', msg: 'Kliknul jsi. Hra skončila.' },
      { ruleKey: 'keyboard', event: 'keydown', msg: 'Zmáčkl jsi klávesu. Hra skončila.' },
      { ruleKey: 'scroll', event: 'scroll', msg: 'Scrolloval jsi. Hra skončila.' },
      { ruleKey: 'touch', event: 'touchstart', msg: 'Dotknul ses obrazovky. Hra skončila.' },
      { ruleKey: 'mouseMove', event: 'mousemove', msg: 'Pohnul jsi myší. Hra skončila.', deferred: true },
    ];

    for (const { ruleKey, event, msg, deferred } of actionMap) {
      if (!rules[ruleKey]) continue;

      if (deferred) {
        const fn = (() => {
          if (this.mouseActive) this.fail(msg);
        }) as EventListener;
        document.addEventListener(event, fn, { passive: true });
        this.listeners.push({ type: event, fn });
        // Grace period — ignore mousemove for first 800ms
        const t = window.setTimeout(() => {
          this.mouseActive = true;
        }, 800);
        this.timers.push(t);
      } else {
        const fn = (() => this.fail(msg)) as EventListener;
        document.addEventListener(event, fn, { passive: true });
        this.listeners.push({ type: event, fn });
      }
    }
  }

  private setupEvents(): void {
    for (const ev of this.config.events) {
      const t = window.setTimeout(() => {
        if (this.ended) return;
        if (ev.type === 'clear') {
          this.callbacks.onSubtitle('');
        } else if (ev.type === 'subtitle' && ev.text) {
          this.callbacks.onSubtitle(ev.text);
        }
        // 'voice' events will be handled by audio system in the future
      }, ev.time * 1000);
      this.timers.push(t);
    }
  }

  private setupTimer(): void {
    const durationMs = this.config.end.time * 1000;

    this.progressInterval = window.setInterval(() => {
      if (this.ended) {
        if (this.progressInterval !== null) clearInterval(this.progressInterval);
        return;
      }
      const elapsed = Date.now() - this.startTime;
      const p = Math.min(elapsed / durationMs, 1);
      this.callbacks.onProgress(p);

      if (elapsed >= durationMs) {
        this.stop();
        this.callbacks.onSuccess();
      }
    }, 100);
  }
}

/**
 * Preload audio assets referenced by level events.
 * Resolves when all audio files are loaded (or failed).
 */
export async function preloadAssets(config: LevelConfig): Promise<void> {
  const audioEvents = config.events.filter((e) => e.type === 'voice' && e.audio);
  if (audioEvents.length === 0) return;

  await Promise.all(
    audioEvents.map(
      (e) =>
        new Promise<void>((resolve) => {
          const audio = new Audio(`/assets/audio/${e.audio}`);
          audio.addEventListener('canplaythrough', () => resolve(), { once: true });
          audio.addEventListener('error', () => resolve(), { once: true });
        })
    )
  );
}
