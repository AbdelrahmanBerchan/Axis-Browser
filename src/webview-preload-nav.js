'use strict';

/**
 * Two-finger horizontal trackpad deltas → browser history navigation.
 * Implemented in preload so gestures reach `<webview>` guests (wheel does not bubble to the host shell).
 * Keep in sync with the inlined copy in `webview-preload-bundle.js`.
 *
 * Positive deltaX (swipe right) → Forward. Negative deltaX → Back.
 */
(function axisWebviewNavGestures() {
    try {
        const { ipcRenderer } = require('electron');

        const COALESCE_MS = 110;
        const COOLDOWN_MS = 400;
        /** Accumulated |deltaX| (CSS px) before history nav — higher = less sensitive vs horizontal page scroll */
        const THRESH_AXIAL = 175;
        const MAX_DOMINANT_VERTICAL = 28;
        /** Require |dx| ≥ this × |dy| so diagonal scroll doesn’t read as “horizontal swipe” */
        const HORIZONTAL_DOMINANCE = 1.22;
        /** Ignore tiny per-event horizontal jitter */
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

                    /** Vertical-dominant: normal scroll / zoom intent */
                    if (Math.abs(dy) > MAX_DOMINANT_VERTICAL && Math.abs(dy) > Math.abs(dx) * 0.95) return;
                    /** Not clearly horizontal */
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
