const MIN_TOUCH_SPAN = 1e-4;


function midpoint(first, second, coordinatePrefix) {
  return [
    (first[`${coordinatePrefix}X`] + second[`${coordinatePrefix}X`]) / 2,
    (first[`${coordinatePrefix}Y`] + second[`${coordinatePrefix}Y`]) / 2,
  ];
}


function touchDistance(first, second) {
  return Math.hypot(second.screenX - first.screenX, second.screenY - first.screenY);
}


function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}


export function accumulateRoundedScaleFactor({
  previousScale,
  factor,
  unusedFactor = 1,
  minimumScale,
  maximumScale,
}) {
  if (
    !Number.isFinite(previousScale) ||
    previousScale <= 0 ||
    !Number.isFinite(factor) ||
    factor <= 0 ||
    !Number.isFinite(unusedFactor) ||
    unusedFactor <= 0
  ) {
    return { scaleFactor: 1, unusedFactor: 1 };
  }
  if (factor === 1) {
    return { scaleFactor: 1, unusedFactor };
  }

  const targetScale = clamp(
    previousScale * factor * unusedFactor,
    minimumScale,
    maximumScale
  );
  const roundedScale = Math.round(targetScale * 100) / 100;
  if (!Number.isFinite(roundedScale) || roundedScale <= 0) {
    return { scaleFactor: 1, unusedFactor: 1 };
  }
  return {
    scaleFactor: roundedScale / previousScale,
    unusedFactor: targetScale / roundedScale,
  };
}


export class PinchGestureTracker {
  constructor({ pixelRatio = () => 1 } = {}) {
    this.pixelRatio = pixelRatio;
    this.reset();
  }

  get isActive() {
    return this.touchIds.size >= 2;
  }

  get isTracking() {
    return this.touchInfo !== null;
  }

  get startThreshold() {
    return 35 / Math.max(1, this.pixelRatio());
  }

  get scaleThreshold() {
    return 4 / Math.max(1, this.pixelRatio());
  }

  reset() {
    this.touchIds = new Set();
    this.touchInfo = null;
    this.isPinching = false;
    this.unconfirmedDirection = 0;
  }

  start(touches, changedTouches) {
    this.pruneTouchIds(touches);
    for (const { identifier } of changedTouches) {
      this.touchIds.add(identifier);
    }
    if (this.touchIds.size >= 2) {
      this.setTouchInfo(touches);
    }
    return this.isActive;
  }

  move(touches) {
    if (!this.touchInfo) {
      return null;
    }
    const trackedTouches = this.getTrackedTouches(touches);
    if (trackedTouches.length !== 2) {
      return null;
    }

    const [first, second] = trackedTouches;
    const currentDistance = touchDistance(first, second);
    const currentClientMidpoint = midpoint(first, second, "client");
    const currentScreenMidpoint = midpoint(first, second, "screen");
    const previous = this.touchInfo;
    const pan = [
      currentClientMidpoint[0] - previous.clientMidpoint[0],
      currentClientMidpoint[1] - previous.clientMidpoint[1],
    ];
    const translation = Math.hypot(
      currentScreenMidpoint[0] - previous.screenMidpoint[0],
      currentScreenMidpoint[1] - previous.screenMidpoint[1]
    );

    previous.clientMidpoint = currentClientMidpoint;
    previous.screenMidpoint = currentScreenMidpoint;
    const movement = {
      origin: [...previous.previousClientMidpoint],
      pan,
      scaleFactor: null,
    };
    previous.previousClientMidpoint = currentClientMidpoint;

    const minimumDistance = this.isPinching
      ? this.scaleThreshold
      : this.startThreshold + 2 * translation;
    if (
      currentDistance < MIN_TOUCH_SPAN ||
      previous.distance < MIN_TOUCH_SPAN ||
      Math.abs(currentDistance - previous.distance) <= minimumDistance
    ) {
      return pan[0] || pan[1] ? movement : null;
    }

    const previousDistance = previous.distance;
    previous.distance = currentDistance;
    const direction = Math.sign(currentDistance - previousDistance);
    if (!this.isPinching) {
      this.isPinching = true;
      this.unconfirmedDirection = direction;
      return pan[0] || pan[1] ? movement : null;
    }

    if (this.unconfirmedDirection) {
      const unconfirmedDirection = this.unconfirmedDirection;
      this.unconfirmedDirection = 0;
      if (
        direction !== unconfirmedDirection &&
        Math.abs(currentDistance - previousDistance) <= 2 * translation
      ) {
        this.isPinching = false;
        return pan[0] || pan[1] ? movement : null;
      }
    }

    movement.scaleFactor = currentDistance / previousDistance;
    return movement;
  }

  end(touches) {
    const wasTracking = this.isTracking;
    this.pruneTouchIds(touches);
    if (this.touchIds.size >= 2) {
      this.setTouchInfo(touches);
      return false;
    }
    this.touchInfo = null;
    this.isPinching = false;
    this.unconfirmedDirection = 0;
    return wasTracking;
  }

  pruneTouchIds(touches) {
    if (this.touchIds.size === 0) {
      return;
    }
    const activeIds = new Set(Array.from(touches, ({ identifier }) => identifier));
    this.touchIds = new Set([...this.touchIds].filter((identifier) => activeIds.has(identifier)));
  }

  getTrackedTouches(touches) {
    return Array.from(touches)
      .filter(({ identifier }) => this.touchIds.has(identifier))
      .sort((first, second) => first.identifier - second.identifier);
  }

  setTouchInfo(touches) {
    const trackedTouches = this.getTrackedTouches(touches);
    if (trackedTouches.length !== 2) {
      this.touchInfo = null;
      return;
    }
    const [first, second] = trackedTouches;
    const clientMidpoint = midpoint(first, second, "client");
    this.touchInfo = {
      distance: touchDistance(first, second),
      clientMidpoint,
      previousClientMidpoint: clientMidpoint,
      screenMidpoint: midpoint(first, second, "screen"),
    };
  }
}
