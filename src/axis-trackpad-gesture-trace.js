'use strict';

const MAX_SAMPLES = 140;
const RESAMPLE_POINTS = 28;

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeTrackpadTrace(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const samplesIn = Array.isArray(raw.samples) ? raw.samples : [];
  const samples = [];
  for (const s of samplesIn) {
    if (!s || typeof s !== 'object') continue;
    const t = toNum(s.t);
    const dx = toNum(s.dx);
    const dy = toNum(s.dy);
    if (!dx && !dy) continue;
    samples.push({
      t: Math.max(0, Math.min(12000, t)),
      dx: Math.max(-8000, Math.min(8000, dx)),
      dy: Math.max(-8000, Math.min(8000, dy)),
      pinch: !!(s.pinch || s.p)
    });
    if (samples.length >= MAX_SAMPLES) break;
  }
  if (samples.length < 4) return null;
  const duration = Math.max(
    toNum(raw.duration) || 0,
    samples[samples.length - 1].t - samples[0].t,
    1
  );
  return { samples, duration: Math.min(12000, duration) };
}

function cumulativePath(samples) {
  let x = 0;
  let y = 0;
  const pts = [{ x: 0, y: 0 }];
  for (const s of samples) {
    x += s.dx;
    y += s.dy;
    pts.push({ x, y });
  }
  return pts;
}

function resamplePath(points, count = RESAMPLE_POINTS) {
  if (!points.length) return [];
  if (points.length === 1) return Array(count).fill({ x: 0, y: 0 });
  const segLen = [];
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    segLen.push(d);
    total += d;
  }
  if (total < 1e-6) return Array(count).fill({ x: 0, y: 0 });
  const out = [];
  let seg = 0;
  let pos = 0;
  for (let k = 0; k < count; k++) {
    const target = (total * k) / (count - 1);
    while (seg < segLen.length && pos + segLen[seg] < target) {
      pos += segLen[seg];
      seg++;
    }
    if (seg >= segLen.length) {
      out.push({ ...points[points.length - 1] });
      continue;
    }
    const t = segLen[seg] > 0 ? (target - pos) / segLen[seg] : 0;
    const a = points[seg];
    const b = points[seg + 1];
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t
    });
  }
  return out;
}

function normalizePoints(points) {
  if (!points.length) return points;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return points.map((p) => ({
    x: (p.x - cx) / span,
    y: (p.y - cy) / span
  }));
}

function fingerprintTrace(trace) {
  const clean = sanitizeTrackpadTrace(trace);
  if (!clean) return null;
  const pts = resamplePath(cumulativePath(clean.samples), RESAMPLE_POINTS);
  return normalizePoints(pts);
}

function scoreTraceMatch(liveSamples, templateTrace) {
  const live = sanitizeTrackpadTrace({ samples: liveSamples });
  const tpl = sanitizeTrackpadTrace(templateTrace);
  if (!live || !tpl) return Infinity;
  const a = fingerprintTrace(live);
  const b = fingerprintTrace(tpl);
  if (!a || !b || a.length !== b.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y);
  }
  return sum / a.length;
}

function tracesMatch(liveSamples, templateTrace, threshold = 0.22) {
  return scoreTraceMatch(liveSamples, templateTrace) <= threshold;
}

module.exports = {
  MAX_SAMPLES,
  sanitizeTrackpadTrace,
  fingerprintTrace,
  scoreTraceMatch,
  tracesMatch,
  cumulativePath,
  resamplePath,
  normalizePoints
};
