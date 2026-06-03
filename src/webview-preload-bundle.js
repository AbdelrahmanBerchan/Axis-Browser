'use strict';

// Navigation gestures inlined so guest preload never depends on a sibling `require()`
// (sandboxed/context can make nested relative requires unreliable).
(function axisWebviewNavGesturesInline() {
  try {
    const { ipcRenderer } = require('electron');

    const COALESCE_MS = 110;
    const COOLDOWN_MS = 400;
    const THRESH_AXIAL = 175;
    const MAX_DOMINANT_VERTICAL = 28;
    const HORIZONTAL_DOMINANCE = 1.22;
    const MIN_ABS_DX = 8;

    let acc = 0;
    let lastEventMs = 0;
    let cooldownUntil = 0;

    window.addEventListener(
      'wheel',
      /** @param {WheelEvent} ev */
      (ev) => {
        try {
          if (ev.ctrlKey || ev.metaKey) return;

          let dx = Number(ev.deltaX) || 0;
          let dy = Number(ev.deltaY) || 0;
          if (ev.deltaMode === 1) {
            dx *= 16;
            dy *= 16;
          } else if (ev.deltaMode === 2) {
            dx *= 96;
            dy *= 96;
          }

          if (Math.abs(dx) <= MIN_ABS_DX) return;

          if (Math.abs(dy) > MAX_DOMINANT_VERTICAL && Math.abs(dy) > Math.abs(dx) * 0.95) return;
          if (Math.abs(dx) < Math.abs(dy) * HORIZONTAL_DOMINANCE) return;

          const now = Date.now();
          if (now < cooldownUntil) return;
          if (now - lastEventMs > COALESCE_MS) acc = 0;
          lastEventMs = now;

          acc += dx;

          if (acc >= THRESH_AXIAL) {
            cooldownUntil = now + COOLDOWN_MS;
            acc = 0;
            ipcRenderer.sendToHost('axis-nav-gesture', 'forward');
          } else if (acc <= -THRESH_AXIAL) {
            cooldownUntil = now + COOLDOWN_MS;
            acc = 0;
            ipcRenderer.sendToHost('axis-nav-gesture', 'back');
          }
        } catch (_) {
          /* ignore */
        }
      },
      { capture: true, passive: true }
    );
  } catch (_) {
    /* preload context missing */
  }
})();

require('./webview-preload-cws.js');
require('./webview-preload-vault.js');
