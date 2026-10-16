'use strict';

/**
 * Custom trackpad gestures editor (Settings → Gestures).
 * Records a raw stroke trace on the pad and matches it in the browser.
 */
(function () {
  const traceApi = () => window.AXIS_GESTURE_TRACE || null;
  const GESTURE_TYPE_OPTIONS = [
    { value: 'swipe-left', label: 'Swipe left (2 fingers)' },
    { value: 'swipe-right', label: 'Swipe right (2 fingers)' },
    { value: 'swipe-up', label: 'Swipe up (2 fingers)' },
    { value: 'swipe-down', label: 'Swipe down (2 fingers)' },
    { value: 'pinch-in', label: 'Pinch in (⌃ + scroll)' },
    { value: 'pinch-out', label: 'Pinch out (⌃ + scroll)' }
  ];
  const FINGER_COLORS = ['#0a84ff', '#ff9f0a', '#34c759', '#bf5af2', '#ff375f'];

  let gestures = [];
  let draft = null;

  function drawSmoothTrail(ctx, points, color, lineW = 3) {
    if (!points?.length) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineW;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(last.x, last.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawFingerPadFrame(canvas, fingerTrails, tapPulses) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (dpr !== 1) ctx.scale(dpr, dpr);
    const cw = w / dpr;
    const ch = h / dpr;
    ctx.fillStyle = 'rgba(128,128,128,0.1)';
    ctx.fillRect(0, 0, cw, ch);
    for (const trail of fingerTrails.values()) {
      const pts = trail.points.map((p) => ({ x: p.x * cw, y: p.y * ch }));
      drawSmoothTrail(ctx, pts, trail.color, 3.2);
    }
    const now = Date.now();
    for (const pulse of tapPulses) {
      const age = (now - pulse.t) / 520;
      if (age > 1) continue;
      const r = 6 + age * 18;
      const a = 1 - age;
      ctx.strokeStyle = `rgba(255, 159, 10, ${a * 0.85})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(pulse.x * cw, pulse.y * ch, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function builder() {
    return window.AXIS_SHORTCUT_BUILDER || null;
  }

  function defaultStep() {
    return { verb: '', target: '' };
  }

  function normalizeSteps(raw) {
    const b = builder();
    if (Array.isArray(raw) && raw.length) {
      return raw.map((step) => {
        if (step && typeof step === 'object') {
          return { verb: step.verb || '', target: step.target || '' };
        }
        return defaultStep();
      });
    }
    return [defaultStep()];
  }

  function stepRow(step, idx) {
    const b = builder();
    const verb = step?.verb || '';
    const target = verb ? step?.target || '' : '';
    const verbOpts = b ? b.verbOptions(verb, '—') : '<option value="">—</option>';
    const targetOpts = b ? b.targetOptions(verb, target, '—') : '<option value="">—</option>';
    return `
      <div class="shortcut-custom-step" data-step-index="${idx}">
        <select class="shortcut-step-verb" data-step-verb="${idx}">${verbOpts}</select>
        <select class="shortcut-step-target" data-step-target="${idx}"${verb ? '' : ' disabled'}>${targetOpts}</select>
        <button type="button" class="shortcut-action-btn" data-remove-gesture-step="${idx}" title="Remove">−</button>
      </div>`;
  }

  function stepsEditor(steps) {
    const rows = normalizeSteps(steps).map((s, i) => stepRow(s, i)).join('');
    return `
      <div class="shortcut-custom-steps gesture-custom-steps">
        ${rows}
        <button type="button" class="shortcut-action-btn" data-add-gesture-step>+ Add step</button>
      </div>`;
  }

  function gestureTypeLabel(value) {
    const hit = GESTURE_TYPE_OPTIONS.find((o) => o.value === value);
    return hit ? hit.label : value || 'Gesture';
  }

  function gestureDisplayLabel(item) {
    const api = traceApi();
    if (api?.gestureHowToText) return api.gestureHowToText(item);
    if (item?.gestureTrace && api) return api.traceSummaryLabel(item.gestureTrace);
    if (item?.gesture) return gestureTypeLabel(item.gesture);
    return 'Gesture';
  }

  function gestureHowToShort(item) {
    const api = traceApi();
    if (api?.gestureHowToText) return api.gestureHowToText(item);
    return gestureDisplayLabel(item);
  }

  function gestureTypeSelectHtml(selected) {
    const opts = GESTURE_TYPE_OPTIONS.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${o.value === selected ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
    );
    return `<option value="">Choose a gesture…</option>${opts.join('')}`;
  }

  function drawTracePreview(canvas, trace) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const api = traceApi();
    let pts = trace?.points;
    if (trace?.samples?.length && api) {
      pts = api.samplesToPathPoints(trace.samples);
    }
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (dpr !== 1) ctx.scale(dpr, dpr);
    const cw = w / dpr;
    const ch = h / dpr;
    ctx.fillStyle = 'rgba(128,128,128,0.12)';
    ctx.fillRect(0, 0, cw, ch);
    if (trace?.fingerPaths?.length) {
      const cw = w / dpr;
      const ch = h / dpr;
      trace.fingerPaths.forEach((path, idx) => {
        const pts = (path.points || []).map((p) => ({ x: p[0] * cw, y: p[1] * ch }));
        drawSmoothTrail(ctx, pts, path.color || FINGER_COLORS[idx % FINGER_COLORS.length], 3);
      });
      return;
    }
    if (!pts?.length) {
      return;
    }
    const pad = 10;
    const cx = cw / 2;
    const cy = ch / 2;
    const scale = Math.min(cw, ch) / 2 - pad;
    const points = pts.map((p) => ({
      x: cx + (p[0] || 0) * scale,
      y: cy + (p[1] || 0) * scale
    }));
    const grad = ctx.createLinearGradient(0, 0, cw, ch);
    grad.addColorStop(0, 'rgba(10, 132, 255, 0.35)');
    grad.addColorStop(1, '#0a84ff');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.75;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const cur = points[i];
      const mx = (prev.x + cur.x) / 2;
      const my = (prev.y + cur.y) / 2;
      ctx.quadraticCurveTo(prev.x, prev.y, mx, my);
    }
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();
    ctx.fillStyle = '#0a84ff';
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    const taps = trace?.samples?.filter((s) => Number(s.tap) > 0) || [];
    if (taps.length) {
      ctx.fillStyle = '#ff9f0a';
      taps.forEach((s, i) => {
        const x = cx + ((i % 3) - 1) * 8;
        const y = cy - 6;
        ctx.beginPath();
        ctx.arc(x, y, 3 + Math.min(3, Number(s.tap)), 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  function bindRecordPad(pad) {
    if (!pad) return;
    const api = traceApi();
    let recording = false;
    let liveSamples = [];
    let idleTimer = null;
    let accX = 0;
    let accY = 0;
    let pinchAcc = 0;
    let lastMs = 0;
    const fingerTrails = new Map();
    const tapPulses = [];
    let colorIdx = 0;
    let rafId = 0;
    let wheelPair = { x: 0.5, y: 0.5 };
    const physics =
      window.AXIS_GESTURE_PHYSICS?.createGestureEngine
        ? window.AXIS_GESTURE_PHYSICS.createGestureEngine({
            gapMs: 480,
            distanceThreshold: 22,
            velocityThreshold: 0.24
          })
        : null;

    const resetLive = () => {
      liveSamples = [];
      accX = 0;
      accY = 0;
      pinchAcc = 0;
      lastMs = 0;
      fingerTrails.clear();
      tapPulses.length = 0;
      colorIdx = 0;
      wheelPair = { x: 0.5, y: 0.5 };
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      physics?.reset();
    };

    const padNormFromEvent = (e) => {
      const rect = pad.getBoundingClientRect();
      const w = rect.width || 1;
      const h = rect.height || 1;
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / w)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / h))
      };
    };

    const ensureFingerTrail = (id) => {
      if (!fingerTrails.has(id)) {
        fingerTrails.set(id, {
          id,
          color: FINGER_COLORS[colorIdx++ % FINGER_COLORS.length],
          points: []
        });
      }
      return fingerTrails.get(id);
    };

    const pushFingerPoint = (id, norm) => {
      const trail = ensureFingerTrail(id);
      const pts = trail.points;
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(last.x - norm.x, last.y - norm.y) > 0.004) {
        pts.push({ x: norm.x, y: norm.y });
        if (pts.length > 120) pts.shift();
      }
    };

    const scheduleRepaint = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = 0;
        const canvas = pad.querySelector('canvas');
        drawFingerPadFrame(canvas, fingerTrails, tapPulses);
      });
    };

    const setPadState = (state) => {
      pad.classList.remove(
        'gesture-record-pad--recording',
        'gesture-record-pad--captured',
        'gesture-record-pad--idle'
      );
      if (state) pad.classList.add(state);
    };

    const updateRecordStatus = (text) => {
      const status = pad.closest('.gesture-trackpad-shell')?.querySelector('[data-gesture-record-status]');
      if (status && text) status.textContent = text;
    };

    const finishTrace = () => {
      if (!draft || !api) return;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = null;
      }
      let trace = api.sanitizeStoredTrace({ samples: liveSamples }, { minPoints: 2 });
      if (!trace && liveSamples.length) {
        const preview = api.previewTraceFromSamples(liveSamples);
        if (preview) {
          trace = {
            ...preview,
            sampleCount: liveSamples.length,
            samples: liveSamples.slice(0, 160)
          };
        }
      }
      if (!trace) {
        setPadState('gesture-record-pad--idle');
        recording = false;
        updateRecordStatus('No gesture captured — try a longer swipe, pinch (⌃ scroll), or tap.');
        return;
      }
      const fingerPaths = [];
      for (const trail of fingerTrails.values()) {
        if (trail.points.length < 2) continue;
        fingerPaths.push({
          id: trail.id,
          color: trail.color,
          points: trail.points.map((p) => [p.x, p.y])
        });
      }
      if (fingerPaths.length) trace.fingerPaths = fingerPaths;
      draft.gestureTrace = trace;
      draft.gesture = `trace:${draft.id}`;
      recording = false;
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
      setPadState('gesture-record-pad--captured');
      const canvas = pad.querySelector('canvas');
      drawTracePreview(canvas, trace);
      const hint = pad.querySelector('.gesture-record-hint');
      if (hint) {
        hint.textContent = api.traceSummaryLabel(trace);
        hint.classList.add('is-hidden');
      }
      updateRecordStatus(`Captured: ${api.traceSummaryLabel(trace)}. Click the pad to re-record.`);
    };

    const scheduleFinish = (delayMs = 720) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idleTimer = null;
        if (recording) finishTrace();
      }, delayMs);
    };

    const pointerStarts = new Map();
    const activeFingerCount = () => Math.max(1, pointerStarts.size || (recording ? 1 : 0));

    const pushSample = (dx, dy, pinch = 0, tap = 0, fingers = null) => {
      const f = fingers != null ? fingers : activeFingerCount();
      liveSamples.push({ dx, dy, pinch, tap, fingers: f });
      if (liveSamples.length > 200) liveSamples.shift();
      if (physics && (dx || dy)) {
        const snap = physics.pushSample(dx, dy);
        if (
          snap &&
          snap.state === 'swiping' &&
          (snap.peakSpeed > 0.5 || snap.dist > 34)
        ) {
          scheduleFinish(200);
        }
      }
      const taps = liveSamples.filter((s) => Number(s.tap) > 0).length;
      const strokes = liveSamples.length - taps;
      updateRecordStatus(
        `Recording… ${strokes} move${strokes === 1 ? '' : 's'}${taps ? `, ${taps} tap${taps === 1 ? '' : 's'}` : ''} — press Done or pause to finish`
      );
      scheduleFinish();
      scheduleRepaint();
    };

    const beginRecording = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (!draft) return;
      if (recording) return;
      resetLive();
      recording = true;
      draft.gestureTrace = null;
      draft.gesture = '';
      setPadState('gesture-record-pad--recording');
      const hint = pad.querySelector('.gesture-record-hint');
      if (hint) {
        hint.textContent = 'Recording…';
        hint.classList.remove('is-hidden');
      }
      updateRecordStatus('Swipe with two fingers, pinch with ⌃+scroll, tap/click, or drag — then Done.');
      pad.focus();
    };

    const onWheel = (e) => {
      if (!recording) beginRecording(e);
      if (!recording) return;
      e.preventDefault();
      e.stopPropagation();
      let dx = Number(e.deltaX) || 0;
      let dy = Number(e.deltaY) || 0;
      if (e.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (e.deltaMode === 2) {
        dx *= 96;
        dy *= 96;
      }
      const now = Date.now();
      if (now - lastMs > 240) {
        accX = 0;
        accY = 0;
        pinchAcc = 0;
      }
      lastMs = now;
      if (e.ctrlKey || e.metaKey) {
        pinchAcc += dy;
        pushSample(0, 0, pinchAcc);
        return;
      }
      accX += dx * 1.15;
      accY += dy * 1.15;
      const rect = pad.getBoundingClientRect();
      const scale = 1 / Math.max(rect.width, rect.height, 1);
      wheelPair.x = Math.max(0.08, Math.min(0.92, wheelPair.x - dx * scale * 0.35));
      wheelPair.y = Math.max(0.08, Math.min(0.92, wheelPair.y - dy * scale * 0.35));
      pushFingerPoint('wheel-a', { x: wheelPair.x - 0.08, y: wheelPair.y });
      pushFingerPoint('wheel-b', { x: wheelPair.x + 0.08, y: wheelPair.y });
      pushSample(dx, dy, 0, 0, 2);
    };

    let tapBurst = 0;
    let tapBurstTimer = null;

    const onPointerDown = (e) => {
      if (e.button !== 0) return;
      if (!recording) beginRecording(e);
      pointerStarts.set(e.pointerId, { x: e.clientX, y: e.clientY, moved: false });
      pushFingerPoint(String(e.pointerId), padNormFromEvent(e));
      scheduleRepaint();
      try {
        pad.setPointerCapture(e.pointerId);
      } catch (_) {}
    };

    const onPointerMove = (e) => {
      if (!recording) return;
      const start = pointerStarts.get(e.pointerId);
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) {
        start.moved = true;
      }
      const norm = padNormFromEvent(e);
      pushFingerPoint(String(e.pointerId), norm);
      const dx = Number(e.movementX) || 0;
      const dy = Number(e.movementY) || 0;
      if (dx || dy) pushSample(dx, dy, 0, 0, pointerStarts.size || 1);
      scheduleRepaint();
    };

    const scheduleTapBurst = () => {
      if (tapBurstTimer) clearTimeout(tapBurstTimer);
      tapBurstTimer = setTimeout(() => {
        tapBurstTimer = null;
        const n = tapBurst;
        const fingers = Math.max(1, pointerStarts.size || 1);
        tapBurst = 0;
        if (n <= 0) return;
        pushSample(0, 0, 0, n, fingers);
        scheduleFinish();
      }, 280);
    };

    const onPointerUp = (e) => {
      if (!recording) return;
      const start = pointerStarts.get(e.pointerId);
      pointerStarts.delete(e.pointerId);
      if (!start || start.moved) return;
      const norm = padNormFromEvent(e);
      tapPulses.push({ x: norm.x, y: norm.y, t: Date.now() });
      tapBurst += 1;
      scheduleTapBurst();
      scheduleRepaint();
    };

    const onPointerCancel = (e) => {
      pointerStarts.delete(e.pointerId);
    };

    pad.addEventListener('click', (e) => {
      if (pad.classList.contains('gesture-record-pad--captured')) {
        beginRecording(e);
      } else if (!recording) {
        beginRecording(e);
      }
    });
    pad.addEventListener('wheel', onWheel, { passive: false });
    pad.addEventListener('pointerdown', onPointerDown);
    pad.addEventListener('pointermove', onPointerMove);
    pad.addEventListener('pointerup', onPointerUp);
    pad.addEventListener('pointercancel', onPointerCancel);
    pad.addEventListener(
      'touchstart',
      (e) => {
        if (!recording) beginRecording(e);
      },
      { passive: true }
    );

    pad._axisFinishGestureRecord = () => {
      if (recording) finishTrace();
    };

    pad.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && recording) {
        e.preventDefault();
        finishTrace();
      }
    });

    const canvas = pad.querySelector('canvas');
    if (canvas) {
      const cssW = canvas.clientWidth || 280;
      canvas.width = Math.max(200, Math.min(400, Math.round(cssW * (window.devicePixelRatio || 1))));
      canvas.height = Math.round(88 * (window.devicePixelRatio || 1));
    }
    const trace = draft?.gestureTrace;
    if (trace?.points?.length || trace?.samples?.length) {
      setPadState('gesture-record-pad--captured');
      drawTracePreview(canvas, trace);
      const hint = pad.querySelector('.gesture-record-hint');
      if (hint && api) {
        hint.textContent = api.traceSummaryLabel(trace);
        hint.classList.add('is-hidden');
      }
      updateRecordStatus(
        api ? `Saved stroke: ${api.traceSummaryLabel(trace)}. Click the pad to re-record.` : 'Gesture recorded.'
      );
    } else {
      setPadState('gesture-record-pad--idle');
      drawTracePreview(canvas, null);
      const hint = pad.querySelector('.gesture-record-hint');
      if (hint) hint.textContent = 'Click to record';
    }
  }

  async function persist() {
    gestures = await window.electronAPI.setCustomGestures(gestures);
  }

  async function reload() {
    gestures = (await window.electronAPI.getCustomGestures?.()) || [];
    gestures = (gestures || []).filter(
      (g) =>
        g &&
        ((Array.isArray(g.steps) && g.steps.length) || g.command) &&
        g.gesture &&
        GESTURE_TYPE_OPTIONS.some((o) => o.value === g.gesture)
    );
  }

  function beginDraft() {
    draft = {
      id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name: 'New gesture',
      kind: 'macro',
      gesture: 'swipe-left',
      builderSteps: [defaultStep()]
    };
    render();
    const nameInput = document.querySelector('[data-gesture-draft="1"] .gesture-custom-name');
    nameInput?.focus();
  }

  async function saveDraft() {
    readDraftFromDom();
    if (!draft) return;
    const hasPreset =
        draft.gesture && GESTURE_TYPE_OPTIONS.some((o) => o.value === draft.gesture);
    if (!hasPreset) {
      alert('Choose a gesture type.');
      return;
    }
    const builderSteps = (draft.builderSteps || []).filter((s) => s && (s.verb || s.target));
    if (builderSteps.some((s) => !s.verb || !s.target)) {
      alert('Pick both an action and a target for every step.');
      return;
    }
    const b = builder();
    const steps = b ? b.builderStepsToActions(builderSteps) : [];
    if (!steps.length) {
      alert('Add at least one valid step.');
      return;
    }
    const saved = {
      id: draft.id,
      name: draft.name || 'New gesture',
      kind: 'macro',
      gesture: draft.gesture,
      builderSteps,
      steps,
      command: steps[0]
    };
    gestures = gestures.filter((g) => g.id === saved.id);
    if (draft.editingId) {
      const idx = gestures.findIndex((x) => x.id === draft.editingId);
      if (idx >= 0) gestures[idx] = saved;
      else gestures.push(saved);
    } else {
      gestures.push(saved);
    }
    draft = null;
    await persist();
    render();
  }

  function render() {
    const mount = document.getElementById('custom-gestures-mount');
    if (!mount) return;

    const savedRows = gestures
      .map((cg) => {
        const id = escapeHtml(cg.id || '');
        const name = escapeHtml(cg.name || 'Gesture');
        const howTo = escapeHtml(gestureHowToShort(cg));
        return `
          <div class="row gesture-saved-row" data-gesture-id="${id}">
            <div class="row-label">
              <div class="row-title gesture-saved-title">${name}<span class="gesture-how-to-chip">${howTo}</span></div>
            </div>
            <div class="gesture-saved-actions">
              <button type="button" class="shortcut-action-btn" data-edit-gesture="${id}">Edit</button>
              <button type="button" class="shortcut-action-btn" data-delete-gesture="${id}">Delete</button>
            </div>
          </div>`;
      })
      .join('');

    const draftHtml = draft
      ? `
      <div class="shortcut-custom-card shortcut-custom-card--draft" data-gesture-draft="1">
        <input type="text" class="shortcut-custom-name gesture-custom-name gesture-custom-name--full" value="${escapeHtml(draft.name || '')}" placeholder="Gesture name" aria-label="Gesture name">
        <label class="gesture-type-label">Gesture</label>
        <select class="perm-native-select gesture-type-select" data-gesture-type-select aria-label="Gesture type">
          ${gestureTypeSelectHtml(draft.gesture || '')}
        </select>
        ${stepsEditor(draft.builderSteps)}
        <div class="shortcut-custom-actions gesture-draft-actions">
          <button type="button" class="shortcut-action-btn shortcut-action-btn--primary" data-save-gesture-draft>Save</button>
          <button type="button" class="shortcut-action-btn" data-cancel-gesture-draft>Cancel</button>
        </div>
      </div>`
      : '';

    mount.innerHTML = `
      <div class="gesture-custom-block">
        <div class="row gesture-custom-header">
          <div class="row-label">
            <div class="row-title">Custom gestures</div>
            <div class="row-desc">Pick a trackpad gesture, then choose what Axis does when you perform it on a web page.</div>
          </div>
          ${!draft ? '<button type="button" class="shortcut-action-btn" id="axis-custom-gesture-add-btn">Add</button>' : ''}
        </div>
        ${savedRows}
        ${draftHtml}
        ${!savedRows && !draft ? '<div class="gesture-empty-hint">No custom gestures yet.</div>' : ''}
      </div>`;

    mount.querySelector('#axis-custom-gesture-add-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      beginDraft();
    });

    mount.querySelector('[data-gesture-type-select]')?.addEventListener('change', (e) => {
      if (!draft) return;
      draft.gesture = e.target.value || '';
    });

    mount.querySelector('[data-save-gesture-draft]')?.addEventListener('click', () => {
      void saveDraft();
    });
    mount.querySelector('[data-cancel-gesture-draft]')?.addEventListener('click', () => {
      draft = null;
      render();
    });
    mount.querySelector('[data-add-gesture-step]')?.addEventListener('click', () => {
      readDraftFromDom();
      draft.builderSteps = draft.builderSteps || [defaultStep()];
      draft.builderSteps.push(defaultStep());
      render();
    });
    mount.querySelectorAll('[data-remove-gesture-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        readDraftFromDom();
        const idx = Number(btn.getAttribute('data-remove-gesture-step'));
        if ((draft.builderSteps || []).length <= 1) return;
        draft.builderSteps.splice(idx, 1);
        render();
      });
    });
    mount.querySelectorAll('[data-edit-gesture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-edit-gesture');
        const item = gestures.find((x) => x.id === id);
        if (!item) return;
        draft = {
          id: item.id,
          editingId: item.id,
          name: item.name,
          gesture: GESTURE_TYPE_OPTIONS.some((o) => o.value === item.gesture) ? item.gesture : 'swipe-left',
          builderSteps: normalizeSteps(item.builderSteps || item.steps)
        };
        render();
      });
    });
    mount.querySelectorAll('[data-delete-gesture]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-delete-gesture');
        gestures = gestures.filter((x) => x.id !== id);
        void persist().then(render);
      });
    });
    mount.querySelectorAll('.shortcut-step-verb').forEach((sel) => {
      sel.addEventListener('change', () => {
        readDraftFromDom();
        const idx = Number(sel.getAttribute('data-step-verb'));
        const b = builder();
        const step = draft.builderSteps?.[idx];
        if (step && b) {
          const options = b.targetsForVerb(step.verb);
          step.target = options.length === 1 ? options[0].target : '';
          draft.builderSteps[idx] = step;
        }
        render();
      });
    });
  }

  function readDraftFromDom() {
    const card = document.querySelector('[data-gesture-draft="1"]');
    if (!draft || !card) return;
    const nameEl = card.querySelector('.gesture-custom-name');
    if (nameEl) draft.name = nameEl.value.trim() || draft.name || 'New gesture';
    const typeSel = card.querySelector('[data-gesture-type-select]');
    if (typeSel) draft.gesture = typeSel.value || draft.gesture || '';
    const steps = [];
    card.querySelectorAll('.shortcut-custom-step').forEach((row) => {
      const verb = row.querySelector('.shortcut-step-verb')?.value || '';
      const target = (verb && row.querySelector('.shortcut-step-target')?.value) || '';
      steps.push({ verb, target });
    });
    draft.builderSteps = steps.length ? steps : [defaultStep()];
  }

  async function refresh() {
    if (typeof window.electronAPI === 'undefined') return;
    await reload();
    render();
  }

  async function init() {
    const start = Date.now();
    while (typeof window.electronAPI === 'undefined' && Date.now() - start < 8000) {
      await new Promise((r) => setTimeout(r, 16));
    }
    if (!document.getElementById('custom-gestures-mount')) return;
    await refresh();
    window.__axisBeginCustomGestureDraft = beginDraft;
    window.AxisCustomGesturesUI = { refresh, beginDraft, render };
  }

  window.__axisBeginCustomGestureDraft = function pendingBegin() {
    if (window.AxisCustomGesturesUI?.beginDraft) window.AxisCustomGesturesUI.beginDraft();
    else beginDraft();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void init());
  } else {
    void init();
  }
})();
