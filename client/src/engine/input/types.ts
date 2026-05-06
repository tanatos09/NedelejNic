export type InputAggregateTick = {
  type: 'aggregate';
  timestamp: number;
  windowMs: number;
  mouseDistancePx: number;
  mouseMoveSamples: number;
  wheelDeltaX: number;
  wheelDeltaY: number;
  clicks: number;
  keyDowns: number;
  focusEvents: number;
  blurEvents: number;
  visibilityHiddenEvents: number;
};

