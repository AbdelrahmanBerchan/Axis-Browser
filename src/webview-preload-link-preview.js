'use strict';

/**
 * In-page link preview bubble (the <webview> paints above host DOM, so it must live in the guest).
 * Chrome-style: bottom-left by default, hops to bottom-right while the cursor is near it,
 * and never takes pointer events so the link underneath stays hoverable.
 */
(function axisGuestLinkPreview() {
  try {
    if (window.top !== window.self) return;

    const ID = 'axis-guest-link-preview';
    const EDGE = 12;
    const BOTTOM = 11;
    const AVOID_PAD = 14;

    let el = null;
    let enabled = true;
    let currentHref = '';
    let docked = 'left';
    let showTimer = 0;
    let hideTimer = 0;
    let lastPointer = { x: -1, y: -1 };
    let themeMode = 'dark';
    let hostPageLight = null;

    const parseRgb = (raw) => {
      const s = String(raw || '').trim();
      if (!s || s === 'transparent') return null;
      let m = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
      if (m) return { r: +m[1], g: +m[2], b: +m[3] };
      if (/^#[0-9a-f]{3,8}$/i.test(s)) {
        let h = s.slice(1);
        if (h.length === 3) h = h.split('').map((c) => c + c).join('');
        return {
          r: parseInt(h.slice(0, 2), 16),
          g: parseInt(h.slice(2, 4), 16),
          b: parseInt(h.slice(4, 6), 16)
        };
      }
      return null;
    };

    const pageIsLight = () => {
      if (hostPageLight === true) return true;
      if (hostPageLight === false) return false;
      try {
        const nodes = [document.body, document.documentElement];
        for (const node of nodes) {
          if (!node) continue;
          const rgb = parseRgb(getComputedStyle(node).backgroundColor);
          if (!rgb) continue;
          const lum = 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
          if (lum > 180) return true;
          if (lum < 72) return false;
        }
        if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return true;
      } catch (_) {}
      return false;
    };

    const applyTheme = () => {
      if (!el) return;
      themeMode = pageIsLight() ? 'light' : 'dark';
      const s = el.style;
      if (themeMode === 'light') {
        s.setProperty('background', 'rgba(255, 255, 255, 0.82)', 'important');
        s.setProperty('border', '1px solid rgba(0, 0, 0, 0.08)', 'important');
        s.setProperty('color', 'rgba(0, 0, 0, 0.58)', 'important');
        s.setProperty('box-shadow', '0 2px 10px rgba(0, 0, 0, 0.08)', 'important');
      } else {
        s.setProperty('background', 'rgba(22, 22, 24, 0.72)', 'important');
        s.setProperty('border', '1px solid rgba(255, 255, 255, 0.08)', 'important');
        s.setProperty('color', 'rgba(255, 255, 255, 0.72)', 'important');
        s.setProperty('box-shadow', '0 2px 10px rgba(0, 0, 0, 0.22)', 'important');
      }
    };

    const ensureUi = () => {
      if (el && el.isConnected) {
        applyTheme();
        return el;
      }
      const host = document.documentElement;
      if (!host) return null;
      if (!el) {
        el = document.createElement('div');
        el.id = ID;
        el.setAttribute('aria-hidden', 'true');
        const s = el.style;
        s.setProperty('all', 'initial', 'important');
        s.setProperty('position', 'fixed', 'important');
        s.setProperty('bottom', `${BOTTOM}px`, 'important');
        s.setProperty('left', `${EDGE}px`, 'important');
        s.setProperty('z-index', '2147483647', 'important');
        s.setProperty('pointer-events', 'none', 'important');
        s.setProperty('max-width', 'min(58vw, 360px)', 'important');
        s.setProperty('padding', '3px 8px', 'important');
        s.setProperty('border-radius', '5px', 'important');
        s.setProperty(
          'font',
          '400 11.5px/1.25 system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
          'important'
        );
        s.setProperty('letter-spacing', '0.01em', 'important');
        s.setProperty('font-weight', '400', 'important');
        s.setProperty('white-space', 'nowrap', 'important');
        s.setProperty('overflow', 'hidden', 'important');
        s.setProperty('text-overflow', 'ellipsis', 'important');
        s.setProperty('backdrop-filter', 'blur(10px) saturate(130%)', 'important');
        s.setProperty('-webkit-backdrop-filter', 'blur(10px) saturate(130%)', 'important');
        s.setProperty('opacity', '0', 'important');
        s.setProperty(
          'transition',
          'opacity 0.2s ease, left 0.12s ease, right 0.12s ease',
          'important'
        );
        s.setProperty('display', 'block', 'important');
      }
      host.appendChild(el);
      applyTheme();
      return el;
    };

    const setDock = (side) => {
      if (!el || docked === side) return;
      docked = side;
      if (side === 'right') {
        el.style.setProperty('left', 'auto', 'important');
        el.style.setProperty('right', `${EDGE}px`, 'important');
      } else {
        el.style.setProperty('right', 'auto', 'important');
        el.style.setProperty('left', `${EDGE}px`, 'important');
      }
    };

    const rectFor = (side) => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const vw = document.documentElement.clientWidth || window.innerWidth;
      const vh = window.innerHeight;
      const left = side === 'left' ? EDGE : vw - EDGE - w;
      return { left, right: left + w, top: vh - BOTTOM - h, bottom: vh - BOTTOM };
    };

    const near = (r, p) =>
      p.x >= r.left - AVOID_PAD &&
      p.x <= r.right + AVOID_PAD &&
      p.y >= r.top - AVOID_PAD &&
      p.y <= r.bottom + AVOID_PAD;

    const isVisible = () => !!el && el.style.getPropertyValue('opacity') === '1';

    const updateDock = () => {
      if (!el || (!currentHref && !isVisible())) return false;
      const p = lastPointer;
      if (p.x < 0) return false;
      if (near(rectFor('left'), p)) {
        setDock('right');
        return true;
      }
      if (docked === 'right' && near(rectFor('right'), p)) setDock('left');
      else setDock('left');
      return false;
    };

    const format = (href) => {
      try {
        return decodeURI(href);
      } catch (_) {
        return href;
      }
    };

    const sanitize = (raw) => {
      const v = String(raw || '').trim();
      if (!v || /^(javascript|about):/i.test(v)) return '';
      return v;
    };

    const hide = () => {
      currentHref = '';
      if (showTimer) {
        clearTimeout(showTimer);
        showTimer = 0;
      }
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        hideTimer = 0;
        if (currentHref || !el) return;
        if (updateDock()) return;
        el.style.setProperty('opacity', '0', 'important');
      }, 450);
    };

    const show = (raw) => {
      const href = sanitize(raw);
      if (!enabled || !href) {
        hide();
        return;
      }
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = 0;
      }
      if (href === currentHref && isVisible()) {
        updateDock();
        return;
      }
      currentHref = href;
      const node = ensureUi();
      if (!node) return;
      const text = format(href);
      if (node.textContent !== text) node.textContent = text;
      updateDock();
      if (isVisible()) return;
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(() => {
        showTimer = 0;
        if (currentHref !== href) return;
        applyTheme();
        updateDock();
        node.style.setProperty('opacity', '1', 'important');
      }, 70);
    };

    const linkFrom = (target) => {
      try {
        const a = target && target.closest ? target.closest('a[href], area[href]') : null;
        return a && a.href ? a.href : '';
      } catch (_) {
        return '';
      }
    };

    document.addEventListener(
      'mouseover',
      (e) => {
        lastPointer = { x: e.clientX, y: e.clientY };
        const href = linkFrom(e.target);
        if (href) show(href);
        else if (currentHref) hide();
      },
      true
    );

    document.addEventListener(
      'mousemove',
      (e) => {
        lastPointer = { x: e.clientX, y: e.clientY };
        if (currentHref) {
          updateDock();
          return;
        }
        if (!isVisible()) return;
        const wasRight = docked === 'right';
        if (updateDock()) {
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = 0;
          }
        } else if (wasRight || !hideTimer) {
          hide();
        }
      },
      { capture: true, passive: true }
    );

    document.addEventListener(
      'mouseout',
      (e) => {
        if (!e.relatedTarget) hide();
      },
      true
    );

    window.addEventListener('blur', hide);
    window.addEventListener('pagehide', hide);
    document.addEventListener(
      'scroll',
      () => {
        if (currentHref) updateDock();
      },
      { capture: true, passive: true }
    );

    try {
      const { ipcRenderer } = require('electron');
      ipcRenderer.on('axis-link-preview-config', (_e, cfg) => {
        enabled = !cfg || cfg.enabled !== false;
        hostPageLight = cfg && typeof cfg.pageLight === 'boolean' ? cfg.pageLight : null;
        if (enabled && (currentHref || isVisible())) applyTheme();
        if (!enabled) hide();
      });
      ipcRenderer.on('axis-link-preview-url', (_e, href) => {
        if (href) show(href);
        else hide();
      });
    } catch (_) {}
  } catch (_) {}
})();
