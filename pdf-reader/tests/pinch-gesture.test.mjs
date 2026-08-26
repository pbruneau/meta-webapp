import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateRoundedScaleFactor,
  PinchGestureTracker,
} from "../frontend/pinch-gesture.mjs";


function touch(identifier, clientX, clientY = 100, screenX = clientX, screenY = clientY) {
  return { identifier, clientX, clientY, screenX, screenY };
}


function startTwoTouches(tracker, first, second) {
  tracker.start([first], [first]);
  tracker.start([first, second], [second]);
}


test("a symmetric pinch keeps a fixed midpoint", () => {
  const tracker = new PinchGestureTracker();
  startTwoTouches(tracker, touch(1, 100), touch(2, 200));

  assert.equal(tracker.move([touch(1, 80), touch(2, 220)]), null);
  const movement = tracker.move([touch(1, 70), touch(2, 230)]);

  assert.deepEqual(movement.origin, [150, 100]);
  assert.deepEqual(movement.pan, [0, 0]);
  assert.equal(movement.scaleFactor, 160 / 140);
});


test("an asymmetric pinch uses the previous midpoint and reports panning", () => {
  const tracker = new PinchGestureTracker();
  startTwoTouches(tracker, touch(1, 100), touch(2, 200));

  tracker.move([touch(1, 80), touch(2, 230)]);
  const movement = tracker.move([touch(1, 75), touch(2, 245)]);

  assert.deepEqual(movement.origin, [155, 100]);
  assert.deepEqual(movement.pan, [5, 0]);
  assert.equal(movement.scaleFactor, 170 / 150);
});


test("a two-finger pan does not alter scale", () => {
  const tracker = new PinchGestureTracker();
  startTwoTouches(tracker, touch(1, 100), touch(2, 200));

  const movement = tracker.move([touch(1, 112), touch(2, 212)]);

  assert.deepEqual(movement.origin, [150, 100]);
  assert.deepEqual(movement.pan, [12, 0]);
  assert.equal(movement.scaleFactor, null);
});


test("contact jitter below the scale threshold is ignored", () => {
  const tracker = new PinchGestureTracker();
  startTwoTouches(tracker, touch(1, 100), touch(2, 200));
  tracker.move([touch(1, 80), touch(2, 220)]);

  const movement = tracker.move([touch(1, 79), touch(2, 221)]);

  assert.equal(movement, null);
});


test("a lagging-contact reversal is treated as panning", () => {
  const tracker = new PinchGestureTracker();
  startTwoTouches(tracker, touch(1, 100), touch(2, 200));
  tracker.move([touch(1, 80), touch(2, 220)]);

  const movement = tracker.move([touch(1, 100), touch(2, 230)]);

  assert.deepEqual(movement.pan, [15, 0]);
  assert.equal(movement.scaleFactor, null);
  assert.equal(tracker.isPinching, false);
});


test("touch replacement establishes a new stable baseline", () => {
  const tracker = new PinchGestureTracker();
  const first = touch(1, 100);
  const second = touch(2, 200);
  const third = touch(3, 300);
  startTwoTouches(tracker, first, second);

  tracker.start([first, second, third], [third]);
  assert.equal(tracker.isActive, true);
  assert.equal(tracker.isTracking, false);

  assert.equal(tracker.end([second, third]), false);
  assert.equal(tracker.isTracking, true);
});


test("ending a gesture clears pinch state", () => {
  const tracker = new PinchGestureTracker();
  const first = touch(1, 100);
  const second = touch(2, 200);
  startTwoTouches(tracker, first, second);

  assert.equal(tracker.end([first]), true);
  assert.equal(tracker.isActive, false);
  assert.equal(tracker.isTracking, false);
  assert.equal(tracker.isPinching, false);
});


test("scale accumulation matches PDF.js hundredth rounding", () => {
  const accumulated = accumulateRoundedScaleFactor({
    previousScale: 0.6,
    factor: 0.98,
    unusedFactor: 1,
    minimumScale: 0.25,
    maximumScale: 5,
  });

  assert.equal(accumulated.scaleFactor, 0.59 / 0.6);
  assert.equal(accumulated.unusedFactor, 0.588 / 0.59);
});


test("scale accumulation respects reader limits", () => {
  const accumulated = accumulateRoundedScaleFactor({
    previousScale: 4.99,
    factor: 2,
    unusedFactor: 1,
    minimumScale: 0.25,
    maximumScale: 5,
  });

  assert.equal(accumulated.scaleFactor, 5 / 4.99);
  assert.equal(accumulated.unusedFactor, 1);
});
