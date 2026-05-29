import { InputManager } from '../input/InputManager';
import { LevelRunner } from '../newEngine/LevelRunner';
import type { EngineCallbacks, EngineState, EventLogEntry, RenderModel } from '../newEngine/types';
import type { LevelConfig } from '../../types';

export type EngineHostOptions = {
  isDevUser: boolean;
  onFail: (reason: string) => void;
  onSuccess: () => void;
  onProgress: (p01: number) => void;
  onRenderModel: (m: RenderModel) => void;
  onStateChange?: (s: EngineState) => void;
  onEventLog?: (e: EventLogEntry) => void;
};

/**
 * EngineHost is the single integration point between UI and the engine runtime.
 * It owns the engine instance AND the centralized InputManager.
 */
export class EngineHost {
  private engine: LevelRunner | null = null;
  private input: InputManager | null = null;
  private currentPhase: 'loading' | 'ready' | 'playing' | 'ended' = 'loading';

  constructor(private opts: EngineHostOptions) {}

  getEngine(): LevelRunner | null {
    return this.engine;
  }

  stop(): void {
    this.input?.detach();
    this.input = null;
    this.engine?.stop();
    this.engine = null;
  }

  async load(
    cfg: LevelConfig,
    opts?: {
      onPreloadProgress?: (loaded: number, total: number) => void;
      /** Externí proměnné nahrané do enginu před startem (např. `{ karma }`). */
      vars?: Record<string, number | string>;
    }
  ): Promise<void> {
    this.stop();

    const callbacks: EngineCallbacks = {
      onFail: this.opts.onFail,
      onSuccess: this.opts.onSuccess,
      onProgress: this.opts.onProgress,
      onRenderModel: this.opts.onRenderModel,
      onStateChange: this.opts.onStateChange,
      onEventLog: this.opts.onEventLog,
    };

    this.engine = new LevelRunner(callbacks);
    await this.engine.load(cfg as any, { vars: opts?.vars });
    await this.engine.preload(opts?.onPreloadProgress);
  }

  start(): void {
    this.engine?.start();
  }

  /** Single source of truth for input + pause safety. */
  setActive(active: boolean, phase: 'loading' | 'ready' | 'playing' | 'ended', devEngineState: EngineState): void {
    this.currentPhase = phase;
    if (!active) {
      this.input?.detach();
      this.input = null;
      if (devEngineState === 'running') this.engine?.pause();
      return;
    }

    /** Resume jen explicitně z UI / klávesy X — ne při každém setActive při už zobrazené pauze. */

    if (!this.input) {
      this.input = new InputManager({
        mouseMoveGraceMs: 800,
        mouseMoveMaxHz: 30,
        onEvent: (evt) => this.engine?.onInput(evt),
        interceptKeyDown: (code, raw) => {
          if (!this.opts.isDevUser) return false;
          if (code !== 'KeyX') return false;
          // Don't hijack typing in inputs.
          if (raw.target instanceof HTMLInputElement || raw.target instanceof HTMLTextAreaElement) return false;
          if (this.currentPhase !== 'playing') return true;

          // Use live engine state (not captured React state).
          const s = this.engine?.state;
          // Během zbrojení scény nedávat X do pauzy (scheduler/ještě bez startEpoch).
          if (!this.engine?.isSceneArmed?.()) return true;
          if (s === 'running') this.engine?.pause();
          else if (s === 'paused') this.engine?.resume();
          return true;
        },
      });
      this.input.attach();
    }
  }
}

