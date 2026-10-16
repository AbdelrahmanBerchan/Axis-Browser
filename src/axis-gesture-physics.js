'use strict';

/** @typedef {'idle'|'tracking'|'swiping'|'triggered'|'resetting'} GestureState */

const State = {
  Idle: 'idle',
  Tracking: 'tracking',
  Swiping: 'swiping',
  Triggered: 'triggered',
  Resetting: 'resetting'
};

/**
 * Lightweight gesture session with velocity-aware thresholds (Apple-like flick detection).
 * @param {object} [options]
 */
function createGestureEngine(options = {}) {
  const config = {
    gapMs: Number(options.gapMs) || 300,
    distanceThreshold: Number(options.distanceThreshold) || 58,
    velocityThreshold: Number(options.velocityThreshold) || 0.42,
    velocityDistanceFactor: Number(options.velocityDistanceFactor) || 0.38,
    velocitySmoothing: Number(options.velocitySmoothing) || 0.26,
    sampleCap: Number(options.sampleCap) || 200
  };

  let state = State.Idle;
  /** @type {Array<{dx:number,dy:number,t:number,vx:number,vy:number,accX:number,accY:number}>} */
  let samples = [];
  let accX = 0;
  let accY = 0;
  let lastTs = 0;
  let prevTs = 0;
  let vx = 0;
  let vy = 0;
  let peakSpeed = 0;

  const reset = () => {
    state = State.Idle;
    samples = [];
    accX = 0;
    accY = 0;
    lastTs = 0;
    prevTs = 0;
    vx = 0;
    vy = 0;
    peakSpeed = 0;
  };

  /**
   * @param {number} dx
   * @param {number} dy
   * @param {number} [ts]
   */
  const pushSample = (dx, dy, ts = Date.now()) => {
    if (state === State.Triggered) {
      reset();
    }
    if (state === State.Resetting) {
      reset();
    }

    if (state === State.Idle) {
      state = State.Tracking;
      accX = 0;
      accY = 0;
      prevTs = ts;
      lastTs = ts;
    } else if (ts - lastTs > config.gapMs) {
      reset();
      state = State.Tracking;
      prevTs = ts;
      lastTs = ts;
    }

    const dt = Math.max(6, ts - (prevTs || ts));
    prevTs = ts;
    lastTs = ts;

    const instVx = dx / dt;
    const instVy = dy / dt;
    const smooth = config.velocitySmoothing;
    vx = vx * (1 - smooth) + instVx * smooth;
    vy = vy * (1 - smooth) + instVy * smooth;
    const speed = Math.hypot(vx, vy);
    if (speed > peakSpeed) peakSpeed = speed;

    accX += dx;
    accY += dy;
    samples.push({ dx, dy, t: ts, vx, vy, accX, accY });
    if (samples.length > config.sampleCap) samples.shift();

    const dist = Math.hypot(accX, accY);
    if (dist >= 4 && state === State.Tracking) state = State.Swiping;

    return { state, vx, vy, accX, accY, speed, peakSpeed, dist };
  };

  /**
   * @param {'x'|'y'} axis
   * @param {{ blocked?: boolean, minPrimary?: number, maxSecondaryRatio?: number }} [opts]
   */
  const evaluateSwipe = (axis, opts = {}) => {
    if (opts.blocked) return null;
    if (state !== State.Swiping && state !== State.Tracking) return null;

    const primary = axis === 'x' ? accX : accY;
    const secondary = axis === 'x' ? accY : accX;
    const primaryAbs = Math.abs(primary);
    const secondaryAbs = Math.abs(secondary);
    const maxSecondaryRatio = opts.maxSecondaryRatio ?? 0.82;
    const minPrimary = opts.minPrimary ?? 18;

    if (secondaryAbs > primaryAbs * maxSecondaryRatio && secondaryAbs > minPrimary) {
      return null;
    }

    const vel = axis === 'x' ? Math.abs(vx) : Math.abs(vy);
    const dist = primaryAbs;
    const distThreshold =
      typeof opts.distanceThreshold === 'number' ? opts.distanceThreshold : config.distanceThreshold;
    const velThreshold =
      typeof opts.velocityThreshold === 'number' ? opts.velocityThreshold : config.velocityThreshold;
    const distOk = dist >= distThreshold;
    const velOk =
      vel >= velThreshold && dist >= distThreshold * config.velocityDistanceFactor;

    if (!distOk && !velOk) return null;

    state = State.Triggered;
    const dir =
      axis === 'x'
        ? primary < 0
          ? 'left'
          : 'right'
        : primary < 0
          ? 'up'
          : 'down';

    return {
      dir,
      dist,
      vel,
      peakSpeed,
      accX,
      accY,
      samples: samples.slice()
    };
  };

  const beginReset = () => {
    if (state === State.Triggered) state = State.Resetting;
    else reset();
  };

  const finishReset = () => {
    reset();
  };

  const getTraceSamples = (extra = {}) =>
    samples.map((s) => ({
      dx: s.dx,
      dy: s.dy,
      vx: s.vx,
      vy: s.vy,
      ...extra
    }));

  return {
    State,
    pushSample,
    evaluateSwipe,
    reset,
    beginReset,
    finishReset,
    getTraceSamples,
    get state() {
      return state;
    },
    get samples() {
      return samples;
    }
  };
}

function screenTimeBarHeightPx(totalSeconds, trackPx = 72, capSeconds = 24 * 3600) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return 1;
  const cap = Math.max(1, capSeconds);
  const t = Math.min(Math.max(0, totalSeconds), cap);
  const ratio = t / cap;
  const curved = Math.pow(ratio, 0.52);
  return Math.max(2, Math.round(curved * trackPx));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { State, createGestureEngine, screenTimeBarHeightPx };
}
const axisGesturePhysicsExport = { State, createGestureEngine, screenTimeBarHeightPx };
if (typeof globalThis !== 'undefined') {
  globalThis.AXIS_GESTURE_PHYSICS = axisGesturePhysicsExport;
}
if (typeof window !== 'undefined') {
  window.AXIS_GESTURE_PHYSICS = axisGesturePhysicsExport;
}
