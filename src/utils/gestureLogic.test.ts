import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSeekGesture,
  computeVerticalGestureValue,
  detectGestureAxis,
} from './gestureLogic';

test('detectGestureAxis ignores small jitter below deadzone threshold', () => {
  assert.equal(detectGestureAxis(5, 6, 200, 1280), null);
  assert.equal(detectGestureAxis(-10, 12, 900, 1280), null);
});

test('detectGestureAxis detects horizontal swipe as seek anywhere on screen', () => {
  assert.equal(detectGestureAxis(48, 8, 200, 1280), 'seek');
  assert.equal(detectGestureAxis(-60, -10, 1100, 1280), 'seek');
});

test('detectGestureAxis detects vertical swipe on left side as brightness', () => {
  assert.equal(detectGestureAxis(4, -40, 250, 1280), 'brightness');
  assert.equal(detectGestureAxis(-6, 55, 639, 1280), 'brightness');
});

test('detectGestureAxis detects vertical swipe on right side as volume', () => {
  assert.equal(detectGestureAxis(3, -45, 640, 1280), 'volume');
  assert.equal(detectGestureAxis(-5, 60, 1120, 1280), 'volume');
});

test('computeSeekGesture seeks forward and backward within bounds', () => {
  const fwd = computeSeekGesture(60, 200, 1000, 300);
  assert.equal(fwd.deltaSeconds, 18); // 0.2 * 90s = 18s
  assert.equal(fwd.targetTime, 78);

  const bwd = computeSeekGesture(10, -500, 1000, 300);
  assert.equal(bwd.targetTime, 0);
  assert.equal(bwd.deltaSeconds, -10);

  const clampedEnd = computeSeekGesture(295, 500, 1000, 300);
  assert.equal(clampedEnd.targetTime, 300);
});

test('computeVerticalGestureValue increases on swipe up and decreases on swipe down', () => {
  // Swipe up (negative dy) increases volume
  const louder = computeVerticalGestureValue(50, -130, 1000, 0, 100);
  assert.equal(louder, 70); // 130 / 650 = 0.2 -> +20%

  // Swipe down (positive dy) decreases brightness, respecting min 15%
  const dimmer = computeVerticalGestureValue(30, 400, 1000, 15, 100);
  assert.equal(dimmer, 15);
});
