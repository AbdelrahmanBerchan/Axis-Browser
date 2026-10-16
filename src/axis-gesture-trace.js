'use strict';

const TRACE_LEN = 36;
const MATCH_THRESHOLD = 0.52;

const PRESET_GESTURE_HOW_TO = {
  'swipe-left': 'Two-finger swipe left on a web page',
  'swipe-right': 'Two-finger swipe right on a web page',
  'swipe-up': 'Two-finger swipe up on a web page',
  'swipe-down': 'Two-finger swipe down on a web page',
  'pinch-in': 'Pinch in (⌃ + scroll) on a web page',
  'pinch-out': 'Pinch out (⌃ + scroll) on a web page',
  tap: 'Single tap on a web page',
  'double-tap': 'Double tap on a web page',
  'triple-tap': 'Triple tap on a web page',
  'long-press': 'Press and hold on a web page',
  'two-finger-tap': 'Two-finger tap on a web page'
};

function toPair(sample) {
  if (!sample) return [0, 0];
  if (Array.isArray(sample)) {
    return [Number(sample[0]) || 0, Number(sample[1]) || 0];
  }
  const dx = Number(sample.dx) || 0;
  const dy = Number(sample.dy) || 0;
  const pinch = Number(sample.pinch) || 0;
  const tap = Number(sample.tap) || 0;
  const fingers = Number(sample.fingers) || 0;
  if (tap) return [tap, fingers > 1 ? fingers * 0.35 : 0];
  if (pinch) return [0, pinch];
  return [dx, dy];
}

function resampleTrace(samples, pointCount = TRACE_LEN) {
  const pairs = (samples || []).map(toPair).filter((p) => p[0] || p[1]);
  if (!pairs.length) return [];
  const cum = [0];
  for (let i = 0; i < pairs.length; i++) {
    const prev = pairs[i - 1] || pairs[i];
    const cur = pairs[i];
    cum.push(cum[cum.length - 1] + Math.hypot(cur[0] - prev[0], cur[1] - prev[1]));
  }
  const total = cum[cum.length - 1] || 1;
  const out = [];
  for (let i = 0; i < pointCount; i++) {
    const target = (total * i) / Math.max(1, pointCount - 1);
    let idx = 0;
    while (idx < cum.length - 1 && cum[idx + 1] < target) idx++;
    const t0 = cum[idx];
    const t1 = cum[idx + 1] ?? t0;
    const frac = t1 > t0 ? (target - t0) / (t1 - t0) : 0;
    const a = pairs[Math.min(idx, pairs.length - 1)];
    const b = pairs[Math.min(idx + 1, pairs.length - 1)];
    out.push([a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]);
  }
  return normalizeTracePoints(out);
}

function normalizeTracePoints(points) {
  if (!points || !points.length) return [];
  let max = 0;
  for (const p of points) {
    max = Math.max(max, Math.abs(p[0]), Math.abs(p[1]));
  }
  if (max < 1e-6) return points.map(() => [0, 0]);
  return points.map((p) => [p[0] / max, p[1] / max]);
}

function traceDistance(a, b) {
  if (!a?.length || !b?.length) return Infinity;
  const n = Math.min(a.length, b.length);
  let sum = 0;
  let weightSum = 0;
  for (let i = 0; i < n; i++) {
    const w = i === 0 || i === n - 1 ? 1.35 : 1;
    sum += w * Math.hypot((a[i][0] || 0) - (b[i][0] || 0), (a[i][1] || 0) - (b[i][1] || 0));
    weightSum += w;
  }
  return sum / (weightSum || n);
}

function mirrorTraceX(points) {
  return (points || []).map((p) => [-p[0], p[1]]);
}

function reverseTrace(points) {
  return (points || []).slice().reverse();
}

function traceCandidatesFromSamples(samples) {
  const out = [];
  const path = samplesToPathPoints(samples);
  const resampled = resampleTrace(samples);
  if (path.length >= 2) {
    out.push(path, mirrorTraceX(path), reverseTrace(path));
  }
  if (resampled.length >= 2) {
    out.push(resampled, mirrorTraceX(resampled), reverseTrace(resampled));
  }
  const seen = new Set();
  return out.filter((pts) => {
    const key = pts.map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`).join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function storedTraceCandidates(gesture) {
  const trace = gesture?.gestureTrace;
  if (!trace) return [];
  const samples = trace.samples;
  if (samples?.length) return traceCandidatesFromSamples(samples);
  const pts = trace.points;
  if (!Array.isArray(pts) || pts.length < 2) return [];
  return [pts, mirrorTraceX(pts), reverseTrace(pts)];
}

function minTraceDistanceAcrossVariants(livePts, storedPts) {
  const liveVars = [livePts, mirrorTraceX(livePts), reverseTrace(livePts)];
  let best = Infinity;
  for (const live of liveVars) {
    if (!live?.length) continue;
    best = Math.min(best, traceDistance(live, storedPts));
  }
  return best;
}

function matchGestureTrace(liveSamples, gestures, threshold = MATCH_THRESHOLD) {
  const liveCandidates = traceCandidatesFromSamples(liveSamples || []);
  if (!liveCandidates.length) return null;
  let best = null;
  let bestD = Infinity;
  for (const g of gestures || []) {
    const storedList = storedTraceCandidates(g);
    if (!storedList.length) continue;
    let d = Infinity;
    for (const live of liveCandidates) {
      for (const stored of storedList) {
        d = Math.min(d, minTraceDistanceAcrossVariants(live, stored));
      }
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return bestD <= threshold ? best : null;
}

function samplesToPathPoints(samples) {
  if (!samples?.length) return [];
  let x = 0;
  let y = 0;
  const out = [[0, 0]];
  for (const s of samples) {
    const tap = Number(s?.tap) || 0;
    if (tap > 0) {
      out.push([x, y]);
      continue;
    }
    const pinch = Number(s?.pinch) || 0;
    if (pinch) {
      y += pinch * 0.02;
      out.push([x, y]);
      continue;
    }
    x += Number(s?.dx) || 0;
    y += Number(s?.dy) || 0;
    out.push([x, y]);
  }
  return normalizeTracePoints(out);
}

function sanitizeStoredTrace(raw, opts = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const minPoints = Number(opts.minPoints) || 4;
  const samples = Array.isArray(raw.samples) ? raw.samples.slice(0, 160) : null;
  let points = Array.isArray(raw.points) ? raw.points : null;
  if (!points && samples?.length) points = resampleTrace(samples);
  if ((!points || points.length < 2) && samples?.length) {
    points = samplesToPathPoints(samples);
  }
  const hasTap = (samples || []).some((s) => Number(s.tap) > 0);
  const need = hasTap ? Math.min(2, minPoints) : minPoints;
  if (!points || points.length < need) return null;
  const clean = points
    .slice(0, TRACE_LEN)
    .map((p) => [Number(p[0]) || 0, Number(p[1]) || 0]);
  const out = { points: clean, sampleCount: samples?.length || clean.length };
  if (samples?.length) out.samples = samples;
  return out;
}

function previewTraceFromSamples(samples) {
  if (!samples?.length) return null;
  const pathPts = samplesToPathPoints(samples);
  const points = pathPts.length >= 2 ? pathPts : resampleTrace(samples);
  if (!points?.length) return null;
  return { points: points.slice(0, TRACE_LEN) };
}

function gestureHowToText(gestureOrItem) {
  const item =
    gestureOrItem && typeof gestureOrItem === 'object' && gestureOrItem.gesture
      ? gestureOrItem
      : { gesture: gestureOrItem };
  if (item.gestureTrace) {
    const label = traceSummaryLabel(item.gestureTrace);
    if (label && label !== 'Custom gesture') return `Perform: ${label} (two fingers on a page)`;
    return 'Perform your recorded stroke with two fingers on a page';
  }
  const key = String(item.gesture || '').trim();
  if (PRESET_GESTURE_HOW_TO[key]) return PRESET_GESTURE_HOW_TO[key];
  if (key.startsWith('trace:')) return 'Perform your recorded stroke with two fingers on a page';
  return 'Perform on a web page';
}

function traceSummaryLabel(trace) {
  const pts = trace?.points;
  if (!pts?.length) return 'Custom gesture';
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p[0];
    sy += p[1];
  }
  const ax = Math.abs(sx);
  const ay = Math.abs(sy);
  if (ay > ax * 1.2) return sy < 0 ? 'Swipe up' : 'Swipe down';
  if (ax > ay * 1.2) return sx < 0 ? 'Swipe left' : 'Swipe right';
  if (Math.hypot(sx, sy) < 0.15) return 'Tap / pinch';
  return 'Custom trackpad stroke';
}

const api = {
  TRACE_LEN,
  MATCH_THRESHOLD,
  resampleTrace,
  normalizeTracePoints,
  traceDistance,
  matchGestureTrace,
  sanitizeStoredTrace,
  samplesToPathPoints,
  previewTraceFromSamples,
  traceSummaryLabel,
  gestureHowToText,
  PRESET_GESTURE_HOW_TO
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.AXIS_GESTURE_TRACE = api;
}
