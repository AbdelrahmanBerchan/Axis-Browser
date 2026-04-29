/**
 * Chrome Web Store + Mozilla Add-ons use browser-specific install APIs; the primary
 * store button won't install into Electron. We inject an explicit Axis bar on listing
 * pages — install only runs when the user clicks it.
 */
(function axisExtensionStoresPreload() {
  'use strict';
  try {
    const { ipcRenderer } = require('electron');
    const BAR_ID = 'axis-cws-install-bar';
    const DISMISS_PREFIX = 'axisStoreBarDismissed:';

    const reCws = /chromewebstore\.google\.com|chrome\.google\.com\/webstore/i;
    const reAmo = /addons\.mozilla\.org/i;

    function barDismissedStorageKey(token) {
      return DISMISS_PREFIX + token;
    }

    function isBarDismissedFor(token) {
      try {
        return sessionStorage.getItem(barDismissedStorageKey(token)) === '1';
      } catch (_) {
        return false;
      }
    }

    function markBarDismissedFor(token) {
      try {
        sessionStorage.setItem(barDismissedStorageKey(token), '1');
      } catch (_) {
        /* ignore */
      }
    }

    function chromeExtensionIdFromPage() {
      const path = String(window.location.pathname || '');
      const m = path.match(/\/([a-p]{32})(?:\/|$)/i);
      if (m) return m[1].toLowerCase();
      try {
        const u = new URL(window.location.href);
        const q = u.searchParams.get('id');
        if (q && /^[a-p]{32}$/i.test(q)) return q.toLowerCase();
      } catch (_) {
        /* ignore */
      }
      return null;
    }

    function firefoxAddonSlugFromPage() {
      try {
        const u = new URL(window.location.href);
        const parts = u.pathname.split('/').filter(Boolean);
        const ai = parts.indexOf('addon');
        if (ai >= 0 && parts[ai + 1]) {
          const key = decodeURIComponent(parts[ai + 1]);
          if (key && /^[a-zA-Z0-9._-]+$/.test(key)) return key;
        }
      } catch (_) {
        /* ignore */
      }
      return null;
    }

    /** @returns {{ kind: 'cws', token: string, payload: string } | { kind: 'amo', token: string, payload: string } | null} */
    function storeContext() {
      const href = window.location.href || '';
      if (reCws.test(href)) {
        const id = chromeExtensionIdFromPage();
        return id ? { kind: 'cws', token: id, payload: id } : null;
      }
      if (reAmo.test(href)) {
        const slug = firefoxAddonSlugFromPage();
        if (!slug) return null;
        const token = `amo:${slug.toLowerCase()}`;
        return { kind: 'amo', token, payload: slug };
      }
      return null;
    }

    function removeBar() {
      try {
        const el = document.getElementById(BAR_ID);
        if (el) el.remove();
      } catch (_) {
        /* ignore */
      }
    }

    function ensureBar() {
      const ctx = storeContext();
      if (!ctx) {
        removeBar();
        return;
      }
      if (isBarDismissedFor(ctx.token)) {
        removeBar();
        return;
      }

      let bar = document.getElementById(BAR_ID);
      if (bar && bar.dataset.axisStoreToken === ctx.token) return;
      if (bar) bar.remove();

      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.dataset.axisStoreToken = ctx.token;
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Axis Browser extension install');
      Object.assign(bar.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        zIndex: '2147483647',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '10px',
        padding: '10px 14px',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        lineHeight: '1.35',
        background: 'linear-gradient(180deg, #1e5fbf 0%, #154a94 100%)',
        color: '#fff',
        boxShadow: '0 2px 10px rgba(0,0,0,.25)',
        borderBottom: '1px solid rgba(0,0,0,.15)'
      });

      const text = document.createElement('span');
      text.textContent =
        ctx.kind === 'amo'
          ? 'The Mozilla “Add to Firefox” button does not install into Axis (it may try to save an .xpi file). Use Install in Axis below instead.'
          : 'The store’s Add to Chrome control does not install extensions in Axis (it may try to save a package file). Use Install in Axis below instead.';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Install in Axis';
      Object.assign(btn.style, {
        padding: '7px 14px',
        fontSize: '13px',
        fontWeight: '600',
        border: 'none',
        borderRadius: '6px',
        background: '#fff',
        color: '#154a94',
        cursor: 'pointer',
        flexShrink: '0'
      });
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try {
          if (ctx.kind === 'amo') {
            ipcRenderer.sendToHost('axis-amo-install-in-axis', ctx.payload);
          } else {
            ipcRenderer.sendToHost('axis-cws-add-to-chrome', ctx.payload);
          }
        } catch (_) {
          /* ignore */
        }
      });

      bar.appendChild(text);
      bar.appendChild(btn);

      const root = document.body || document.documentElement;
      try {
        root.appendChild(bar);
      } catch (_) {
        /* ignore */
      }
    }

    function kick() {
      try {
        ensureBar();
      } catch (_) {
        /* ignore */
      }
    }

    ipcRenderer.on('axis-cws-install-succeeded', (_event, token) => {
      const t = typeof token === 'string' ? token.trim() : '';
      if (!t) return;
      markBarDismissedFor(t);
      removeBar();
    });

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', kick);
    } else {
      kick();
    }
    setInterval(kick, 1000);
  } catch (_) {
    /* ignore */
  }
})();
