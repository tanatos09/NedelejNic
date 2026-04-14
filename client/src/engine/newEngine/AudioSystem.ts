import type { AudioKind, EventLogEntry } from './types';
import { clamp01 } from './util';

type PoolKey = `${AudioKind}:${string}`;

export class AudioSystem {
  private pool = new Map<PoolKey, HTMLAudioElement>();
  private byId = new Map<string, HTMLAudioElement>();
  private devLog?: (e: EventLogEntry) => void;
  private nowMs: () => number;

  constructor(nowMs: () => number, devLog?: (e: EventLogEntry) => void) {
    this.nowMs = nowMs;
    this.devLog = devLog;
  }

  async preload(assets: { voices?: string[]; music?: string[]; sounds?: string[] }): Promise<void> {
    const voices = assets.voices ?? [];
    const music = assets.music ?? [];
    const sounds = assets.sounds ?? [];

    const all: Array<{ kind: AudioKind; file: string }> = [
      ...voices.map((file) => ({ kind: 'voice' as const, file })),
      ...music.map((file) => ({ kind: 'music' as const, file })),
      ...sounds.map((file) => ({ kind: 'sound' as const, file })),
    ];

    await Promise.all(
      all.map(({ kind, file }) => this.preloadOne(kind, file))
    );
  }

  private preloadOne(kind: AudioKind, file: string): Promise<void> {
    const key: PoolKey = `${kind}:${file}`;
    if (this.pool.has(key)) return Promise.resolve();

    const audio = new Audio(this.resolveUrl(kind, file));
    audio.preload = 'auto';
    this.pool.set(key, audio);

    return new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        resolve();
      };

      // Hardening: never hang preload on missing/blocked media events
      const t = window.setTimeout(() => {
        this.devLog?.({
          t: this.nowMs(),
          kind: 'engine',
          msg: 'asset.preload.timeout',
          data: { kind, file },
        });
        finish();
      }, 2500);

      const done = () => {
        clearTimeout(t);
        finish();
      };

      audio.addEventListener('canplaythrough', done, { once: true });
      audio.addEventListener('loadeddata', done, { once: true });
      audio.addEventListener('error', () => {
        clearTimeout(t);
        this.devLog?.({
          t: this.nowMs(),
          kind: 'engine',
          msg: 'asset.missing',
          data: { kind, file },
        });
        finish();
      }, { once: true });
      audio.load();
    });
  }

  play(params: { kind: AudioKind; file: string; id?: string; loop?: boolean; volume?: number }): void {
    const key: PoolKey = `${params.kind}:${params.file}`;
    const audio = this.pool.get(key);
    if (!audio) {
      this.devLog?.({ t: this.nowMs(), kind: 'engine', msg: 'audio.play.missing', data: params });
      return;
    }

    audio.loop = !!params.loop;
    if (typeof params.volume === 'number') audio.volume = clamp01(params.volume);

    // Reset playhead for deterministic behavior
    try {
      audio.currentTime = 0;
    } catch {
      // ignore
    }

    if (params.id) {
      this.byId.set(params.id, audio);
    }

    void audio.play().catch(() => {
      // Autoplay restrictions etc => silent no-op in runtime, logged in dev
      this.devLog?.({ t: this.nowMs(), kind: 'engine', msg: 'audio.play.blocked', data: params });
    });
  }

  stop(params: { id?: string; kind?: AudioKind }): void {
    if (params.id) {
      const a = this.byId.get(params.id);
      if (!a) return;
      a.pause();
      try {
        a.currentTime = 0;
      } catch {
        // ignore
      }
      return;
    }

    if (params.kind) {
      for (const [k, a] of this.pool.entries()) {
        if (!k.startsWith(`${params.kind}:`)) continue;
        a.pause();
        try {
          a.currentTime = 0;
        } catch {
          // ignore
        }
      }
    }
  }

  stopAll(): void {
    for (const a of this.pool.values()) {
      a.pause();
      try {
        a.currentTime = 0;
      } catch {
        // ignore
      }
    }
    this.byId.clear();
  }

  private resolveUrl(kind: AudioKind, file: string): string {
    if (kind === 'voice') return `/assets/voices/${file}`;
    if (kind === 'music') return `/assets/music/${file}`;
    return `/assets/sounds/${file}`;
  }
}

