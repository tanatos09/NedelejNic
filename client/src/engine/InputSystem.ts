import type { LevelRules } from '../types';

export interface InputHandler {
  onFail: (reason: string) => void;
}

/**
 * Manages input detection and event listeners for a level.
 * 
 * Key design:
 * - Input listeners are NOT attached in constructor
 * - Must call attachListeners() to activate
 * - Must call detachListeners() to deactivate
 * - This allows game state to control when input detection is active
 */
export class InputSystem {
  private rules: LevelRules;
  private handler: InputHandler;
  private listeners: Array<{ type: string; fn: EventListener }> = [];
  private timers: number[] = [];
  private mouseActive = false;
  private isAttached = false;

  constructor(rules: LevelRules, handler: InputHandler) {
    this.rules = rules;
    this.handler = handler;
  }

  /**
   * Attach input listeners to document.
   * Called when level is ACTIVE and ready to detect input.
   */
  attachListeners(): void {
    if (this.isAttached) return;
    this.isAttached = true;

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
      {
        ruleKey: 'mouseMove',
        event: 'mousemove',
        msg: 'Pohnul jsi myší. Hra skončila.',
        deferred: true,
      },
    ];

    for (const { ruleKey, event, msg, deferred } of actionMap) {
      if (!this.rules[ruleKey]) continue;

      if (deferred) {
        // Deferred: mousemove is only a fail if mouse was recently moved
        // (skip for first 800ms)
        const fn = ((e: Event) => {
          // Skip if event target is marked with data-no-game-input
          const target = e.target as HTMLElement;
          if (target?.closest('[data-no-game-input]')) return;

          if (this.mouseActive) {
            this.handler.onFail(msg);
          }
        }) as EventListener;

        document.addEventListener(event, fn, { passive: true });
        this.listeners.push({ type: event, fn });

        // Grace period: ignore mousemove for first 800ms
        const t = window.setTimeout(() => {
          this.mouseActive = true;
        }, 800);
        this.timers.push(t);
      } else {
        // Immediate: click, keyboard, scroll, touch
        const fn = ((e: Event) => {
          // Skip if event target is marked with data-no-game-input
          const target = e.target as HTMLElement;
          if (target?.closest('[data-no-game-input]')) return;

          this.handler.onFail(msg);
        }) as EventListener;

        document.addEventListener(event, fn, { passive: true });
        this.listeners.push({ type: event, fn });
      }
    }
  }

  /**
   * Detach input listeners from document.
   * Called when level is NOT active (loading, intro, ended, etc).
   */
  detachListeners(): void {
    if (!this.isAttached) return;
    this.isAttached = false;

    // Remove all event listeners
    this.listeners.forEach(({ type, fn }) => {
      document.removeEventListener(type, fn);
    });
    this.listeners = [];

    // Clear all timers
    this.timers.forEach((id) => clearTimeout(id));
    this.timers = [];

    // Reset state
    this.mouseActive = false;
  }

  /**
   * Check if listeners are currently attached
   */
  isListenersActive(): boolean {
    return this.isAttached;
  }

  /**
   * Reset mouse activity (used for grace period resets)
   */
  resetMouseActivity(): void {
    this.mouseActive = false;
  }
}
