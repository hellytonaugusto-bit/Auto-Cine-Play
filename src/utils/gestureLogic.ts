import type { GestureType } from '../types/media';

export const DEFAULT_GESTURE_THRESHOLD_PX = 16;

/**
 * Classifies a touch/pointer drag into a single non-conflicting gesture axis:
 * - Horizontal dominant drag -> 'seek'
 * - Vertical dominant drag on left half of viewport -> 'brightness'
 * - Vertical dominant drag on right half of viewport -> 'volume'
 * Returns null while movement is below deadzone threshold so taps still toggle UI.
 */
export function detectGestureAxis(
  dx: number,
  dy: number,
  startX: number,
  viewportWidth: number,
  thresholdPx: number = DEFAULT_GESTURE_THRESHOLD_PX
): GestureType | null {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (absX < thresholdPx && absY < thresholdPx) {
    return null;
  }

  // Require clear directional intent (horizontal >= 1.15x vertical for seek)
  if (absX >= absY * 1.15) {
    return 'seek';
  }

  const safeWidth = Math.max(viewportWidth, 1);
  return startX < safeWidth / 2 ? 'brightness' : 'volume';
}

/**
 * Computes target playback timestamp from a horizontal swipe distance.
 * Full viewport width swipe maps proportionally to up to 90 seconds (or full duration if shorter).
 */
export function computeSeekGesture(
  startTimeSec: number,
  dx: number,
  viewportWidth: number,
  durationSec: number
): { targetTime: number; deltaSeconds: number } {
  const safeWidth = Math.max(viewportWidth, 1);
  const safeDuration = Math.max(durationSec, 0);
  if (safeDuration === 0) {
    return { targetTime: 0, deltaSeconds: 0 };
  }

  // Responsive automotive scrub span: full-width drag equals 90s (or full clip if < 90s)
  const scrubSpanSec = Math.min(safeDuration, 90);
  const rawDelta = (dx / safeWidth) * scrubSpanSec;
  const clampedTarget = Math.min(Math.max(startTimeSec + rawDelta, 0), safeDuration);
  const actualDelta = Math.round(clampedTarget - startTimeSec);

  return {
    targetTime: clampedTarget,
    deltaSeconds: actualDelta,
  };
}

/**
 * Computes new brightness or volume percentage (0..100 or min..max) from vertical drag.
 * Dragging UP (negative dy) increases value; dragging DOWN (positive dy) decreases value.
 * Dragging 65% of viewport height covers the full 0..100 range comfortably in a car.
 */
export function computeVerticalGestureValue(
  startValue: number,
  dy: number,
  viewportHeight: number,
  minValue: number = 0,
  maxValue: number = 100
): number {
  const safeHeight = Math.max(viewportHeight, 1);
  const effectiveSpan = safeHeight * 0.65;
  const deltaPercent = (-dy / effectiveSpan) * (maxValue - minValue);
  const next = Math.round(startValue + deltaPercent);
  return Math.min(Math.max(next, minValue), maxValue);
}
