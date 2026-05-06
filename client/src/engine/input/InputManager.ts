import type { InputEvent } from '../newEngine/types';
import type { InputAggregateTick } from './types';

export type InputManagerOptions = {
  /** Root element to attach listeners to (defaults to document). */
  root?: Document | HTMLElement;
  /** If true, ignore mousemove for first N ms after attach. */
  mouseMoveGraceMs?: number;
  /** Max mousemove events per second (0 = no throttling). */
  mouseMoveMaxHz?: number;
  /** Called for every normalized input event. */
  onEvent: (evt: InputEvent) => void;
  /** Optional: periodic aggregate tick for production logging. */
  onAggregate?: (tick: InputAggregateTick) => void;
  /** Aggregate window length in ms. */
  aggregateWindowMs?: number;
  /**
   * Optional interceptor for keydown (capture-like).
   * Return true to consume and prevent emitting into engine.
   */
  interceptKeyDown?: (code: string, raw: KeyboardEvent) => boolean;
};

type LastMouse = { x: number; y: number; t: number } | null;

export class InputManager {
  private opts: {
    root: Document | HTMLElement;
    mouseMoveGraceMs: number;
    mouseMoveMaxHz: number;
    onEvent: (evt: InputEvent) => void;
    onAggregate?: (tick: InputAggregateTick) => void;
    aggregateWindowMs: number;
    interceptKeyDown?: (code: string, raw: KeyboardEvent) => boolean;
  };
  private attached = false;
  private listeners: Array<{ target: EventTarget; type: string; fn: EventListener; capture?: boolean }> = [];

  private mouseActive = false;
  private graceTimer: number | null = null;
  private lastMouse: LastMouse = null;
  private lastMouseEmitAt = 0;
  private aggTimer: number | null = null;
  private aggStartAt = 0;
  private agg = {
    mouseDistancePx: 0,
    mouseMoveSamples: 0,
    wheelDeltaX: 0,
    wheelDeltaY: 0,
    clicks: 0,
    keyDowns: 0,
    focusEvents: 0,
    blurEvents: 0,
    visibilityHiddenEvents: 0,
  };

  constructor(options: InputManagerOptions) {
    this.opts = {
      root: options.root ?? document,
      mouseMoveGraceMs: options.mouseMoveGraceMs ?? 800,
      mouseMoveMaxHz: options.mouseMoveMaxHz ?? 30,
      onEvent: options.onEvent,
      onAggregate: options.onAggregate,
      aggregateWindowMs: options.aggregateWindowMs ?? 250,
      interceptKeyDown: options.interceptKeyDown,
    };
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    const rootTarget: EventTarget = this.opts.root instanceof HTMLElement ? this.opts.root : document;

    // Grace period for mousemove (avoid instant fail on minor startup movement).
    this.mouseActive = false;
    if (this.graceTimer != null) window.clearTimeout(this.graceTimer);
    this.graceTimer = window.setTimeout(() => {
      this.mouseActive = true;
    }, this.opts.mouseMoveGraceMs);

    // Aggregate tick (low-cost production telemetry)
    this.aggStartAt = this.now();
    this.resetAgg();
    if (this.opts.onAggregate) {
      if (this.aggTimer != null) window.clearInterval(this.aggTimer);
      this.aggTimer = window.setInterval(() => {
        this.flushAgg();
      }, this.opts.aggregateWindowMs);
    }

    // Mouse
    this.on(rootTarget, 'click', (e) => this.emitClick(e as MouseEvent), { passive: true });
    this.on(rootTarget, 'mousedown', (e) => this.emitMouseDown(e as MouseEvent), { passive: true });
    this.on(rootTarget, 'mouseup', (e) => this.emitMouseUp(e as MouseEvent), { passive: true });
    this.on(rootTarget, 'mousemove', (e) => this.emitMouseMove(e as MouseEvent), { passive: true });

    // Wheel / Scroll
    this.on(rootTarget, 'wheel', (e) => this.emitWheel(e as WheelEvent), { passive: true });
    this.on(rootTarget, 'scroll', (e) => this.emitScroll(e as Event), { passive: true });

    // Keyboard: we use capture to support DEV interception (KeyX pause) reliably.
    this.on(window, 'keydown', (e) => this.emitKeyDown(e as KeyboardEvent), { capture: true });
    this.on(window, 'keyup', (e) => this.emitKeyUp(e as KeyboardEvent), { capture: true });

    // Touch
    this.on(rootTarget, 'touchstart', (e) => this.emitTouchStart(e as TouchEvent), { passive: true });
    this.on(rootTarget, 'touchmove', (e) => this.emitTouchMove(e as TouchEvent), { passive: true });
    this.on(rootTarget, 'touchend', (e) => this.emitTouchEnd(e as TouchEvent), { passive: true });
    this.on(rootTarget, 'touchcancel', (e) => this.emitTouchEnd(e as TouchEvent), { passive: true });

    // Focus / visibility
    this.on(window, 'focus', (e) => this.emitFocus(e as FocusEvent), { capture: true });
    this.on(window, 'blur', (e) => this.emitBlur(e as FocusEvent), { capture: true });
    this.on(document, 'visibilitychange', (e) => this.emitVisibility(e as Event), { passive: true });
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;

    for (const l of this.listeners) {
      l.target.removeEventListener(l.type, l.fn, l.capture ?? false);
    }
    this.listeners = [];
    this.lastMouse = null;
    this.lastMouseEmitAt = 0;
    this.mouseActive = false;
    if (this.graceTimer != null) {
      window.clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    if (this.aggTimer != null) {
      window.clearInterval(this.aggTimer);
      this.aggTimer = null;
    }
  }

  isAttached(): boolean {
    return this.attached;
  }

  // ── Internal helpers ─────────────────────────────────────────────

  private on(
    target: EventTarget,
    type: string,
    handler: (e: Event) => void,
    opts: AddEventListenerOptions & { capture?: boolean } = {}
  ): void {
    const fn = handler as EventListener;
    target.addEventListener(type, fn, opts);
    this.listeners.push({ target, type, fn, capture: opts.capture });
  }

  private shouldIgnore(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el) return false;
    return !!el.closest?.('[data-no-game-input]');
  }

  private closestLayerId(target: EventTarget | null): string | undefined {
    const el = target as HTMLElement | null;
    return el?.closest?.('[data-layer-id]')?.getAttribute?.('data-layer-id') ?? undefined;
  }

  private now(): number {
    // Keep existing engine API (timestamp = epoch ms). Deterministic clock comes later.
    return Date.now();
  }

  // ── Emitters ─────────────────────────────────────────────────────

  private emitClick(e: MouseEvent): void {
    if (this.shouldIgnore(e.target)) return;
    this.agg.clicks += 1;
    this.opts.onEvent({
      type: 'click',
      timestamp: this.now(),
      targetLayerId: this.closestLayerId(e.target),
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      buttons: e.buttons,
      raw: e,
    });
  }

  private emitMouseDown(e: MouseEvent): void {
    if (this.shouldIgnore(e.target)) return;
    this.opts.onEvent({
      type: 'mouseDown',
      timestamp: this.now(),
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      buttons: e.buttons,
      raw: e,
    });
  }

  private emitMouseUp(e: MouseEvent): void {
    if (this.shouldIgnore(e.target)) return;
    this.opts.onEvent({
      type: 'mouseUp',
      timestamp: this.now(),
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      buttons: e.buttons,
      raw: e,
    });
  }

  private emitMouseMove(e: MouseEvent): void {
    if (!this.mouseActive) return;
    if (this.shouldIgnore(e.target)) return;

    // Throttle: max Hz (production-safe). 0 => no throttling.
    if (this.opts.mouseMoveMaxHz > 0) {
      const minInterval = 1000 / this.opts.mouseMoveMaxHz;
      const nowMs = this.now();
      if (nowMs - this.lastMouseEmitAt < minInterval) return;
      this.lastMouseEmitAt = nowMs;
    }

    const nowT = this.now();
    const x = e.clientX;
    const y = e.clientY;
    const last = this.lastMouse;
    const dx = last ? x - last.x : 0;
    const dy = last ? y - last.y : 0;
    this.lastMouse = { x, y, t: nowT };
    this.agg.mouseMoveSamples += 1;
    this.agg.mouseDistancePx += Math.hypot(dx, dy);

    this.opts.onEvent({
      type: 'mouseMove',
      timestamp: nowT,
      x,
      y,
      dx,
      dy,
      buttons: e.buttons,
      raw: e,
    });
  }

  private emitWheel(e: WheelEvent): void {
    if (this.shouldIgnore(e.target)) return;
    this.agg.wheelDeltaX += e.deltaX;
    this.agg.wheelDeltaY += e.deltaY;
    this.opts.onEvent({
      type: 'wheel',
      timestamp: this.now(),
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      x: e.clientX,
      y: e.clientY,
      raw: e,
    });
  }

  private emitScroll(e: Event): void {
    if (this.shouldIgnore(e.target)) return;
    this.opts.onEvent({
      type: 'scroll',
      timestamp: this.now(),
      raw: e,
    });
  }

  private emitKeyDown(e: KeyboardEvent): void {
    if (this.shouldIgnore(e.target)) return;
    if (this.opts.interceptKeyDown?.(e.code, e)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    this.agg.keyDowns += 1;
    this.opts.onEvent({
      type: 'keyboard',
      timestamp: this.now(),
      keyCode: e.code,
      raw: e,
    });
  }

  private emitKeyUp(e: KeyboardEvent): void {
    if (this.shouldIgnore(e.target)) return;
    this.opts.onEvent({
      type: 'keyUp',
      timestamp: this.now(),
      keyCode: e.code,
      raw: e,
    });
  }

  private emitTouchStart(e: TouchEvent): void {
    if (this.shouldIgnore(e.target)) return;
    const t = e.touches?.[0];
    this.opts.onEvent({
      type: 'touch',
      timestamp: this.now(),
      x: t?.clientX,
      y: t?.clientY,
      raw: e,
    });
  }

  private emitTouchMove(e: TouchEvent): void {
    if (this.shouldIgnore(e.target)) return;
    const t = e.touches?.[0];
    this.opts.onEvent({
      type: 'touchMove',
      timestamp: this.now(),
      x: t?.clientX,
      y: t?.clientY,
      raw: e,
    });
  }

  private emitTouchEnd(e: TouchEvent): void {
    if (this.shouldIgnore(e.target)) return;
    this.opts.onEvent({
      type: 'touchEnd',
      timestamp: this.now(),
      raw: e,
    });
  }

  private emitFocus(e: FocusEvent): void {
    this.agg.focusEvents += 1;
    this.opts.onEvent({
      type: 'focus',
      timestamp: this.now(),
      raw: e,
    });
  }

  private emitBlur(e: FocusEvent): void {
    this.agg.blurEvents += 1;
    this.opts.onEvent({
      type: 'blur',
      timestamp: this.now(),
      raw: e,
    });
  }

  private emitVisibility(e: Event): void {
    if (document.visibilityState === 'hidden') this.agg.visibilityHiddenEvents += 1;
    this.opts.onEvent({
      type: 'visibility',
      timestamp: this.now(),
      visibilityState: document.visibilityState,
      raw: e,
    });
  }

  private flushAgg(): void {
    // No aggregate consumer in production by default; keep cheap.
    if (!this.opts.onAggregate) return;
    const now = this.now();
    const windowMs = Math.max(1, now - this.aggStartAt);
    this.opts.onAggregate({
      type: 'aggregate',
      timestamp: now,
      windowMs,
      mouseDistancePx: this.agg.mouseDistancePx,
      mouseMoveSamples: this.agg.mouseMoveSamples,
      wheelDeltaX: this.agg.wheelDeltaX,
      wheelDeltaY: this.agg.wheelDeltaY,
      clicks: this.agg.clicks,
      keyDowns: this.agg.keyDowns,
      focusEvents: this.agg.focusEvents,
      blurEvents: this.agg.blurEvents,
      visibilityHiddenEvents: this.agg.visibilityHiddenEvents,
    });
    this.aggStartAt = now;
    this.resetAgg();
  }

  private resetAgg(): void {
    this.agg.mouseDistancePx = 0;
    this.agg.mouseMoveSamples = 0;
    this.agg.wheelDeltaX = 0;
    this.agg.wheelDeltaY = 0;
    this.agg.clicks = 0;
    this.agg.keyDowns = 0;
    this.agg.focusEvents = 0;
    this.agg.blurEvents = 0;
    this.agg.visibilityHiddenEvents = 0;
  }
}

