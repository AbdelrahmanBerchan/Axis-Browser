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

    const reCws = /chromewebstore\.google\.com|chrome\.google\.com\/webstore/i;
    const reAmo = /addons\.mozilla\.org/i;

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

    /** @param {HTMLButtonElement|null} btn @param {'idle'|'installed'|'busy'|'success'|'error'} state */
    function setInstallButtonState(btn, state) {
      if (!btn) return;
      btn.dataset.axisInstallState = state;
      btn.disabled = state === 'busy';
      btn.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false');
      if (state === 'busy') {
        btn.textContent = 'Installing…';
        Object.assign(btn.style, {
          background: 'rgba(255,255,255,0.92)',
          color: '#154a94',
          opacity: '0.9',
          cursor: 'wait',
          transform: ''
        });
      } else if (state === 'success') {
        btn.textContent = 'Installed ✓';
        Object.assign(btn.style, {
          background: '#e8f8ec',
          color: '#0d5c2a',
          opacity: '1',
          cursor: 'default',
          transform: 'scale(1.04)'
        });
        setTimeout(() => {
          btn.style.transform = '';
        }, 280);
      } else if (state === 'error') {
        btn.textContent = 'Try again';
        Object.assign(btn.style, {
          background: '#fff4f4',
          color: '#9b1c1c',
          opacity: '1',
          cursor: 'pointer',
          transform: ''
        });
      } else if (state === 'installed') {
        btn.textContent = 'Install again';
        Object.assign(btn.style, {
          background: '#fff',
          color: '#154a94',
          opacity: '1',
          cursor: 'pointer',
          transform: ''
        });
      } else {
        btn.textContent = 'Install in Axis';
        Object.assign(btn.style, {
          background: '#fff',
          color: '#154a94',
          opacity: '1',
          cursor: 'pointer',
          transform: ''
        });
      }
    }

    /** @param {HTMLElement|null} bar */
    function setInstalledBadge(bar, show, extName, version) {
      if (!bar) return;
      let badge = bar.querySelector('[data-axis-installed-badge]');
      if (!show) {
        if (badge) badge.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.setAttribute('data-axis-installed-badge', '1');
        Object.assign(badge.style, {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '4px 10px',
          borderRadius: '999px',
          background: 'rgba(255,255,255,0.2)',
          border: '1px solid rgba(255,255,255,0.35)',
          fontSize: '12px',
          fontWeight: '700',
          flexShrink: '0',
          animation: 'axisInstallBadgeIn 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
        });
        const mark = document.createElement('span');
        mark.textContent = '✓';
        mark.setAttribute('aria-hidden', 'true');
        const label = document.createElement('span');
        label.setAttribute('data-axis-installed-label', '1');
        badge.appendChild(mark);
        badge.appendChild(label);
        const status = bar.querySelector('[data-axis-install-status]');
        if (status && status.parentNode) {
          status.parentNode.insertBefore(badge, status);
        } else {
          bar.insertBefore(badge, bar.firstChild);
        }
      }
      const label = badge.querySelector('[data-axis-installed-label]');
      if (label) {
        const ver = version ? ` v${version}` : '';
        label.textContent = extName ? `Installed · ${extName}${ver}` : 'Already in Axis';
      }
    }

    /** @param {HTMLElement|null} bar @param {'idle'|'installed'|'busy'|'success'|'error'} state @param {string} [statusText] */
    function setBarVisualState(bar, state, statusText) {
      if (!bar) return;
      bar.dataset.axisBarState = state;
      const status = bar.querySelector('[data-axis-install-status]');
      if (status && statusText) status.textContent = statusText;
      if (state === 'busy') {
        bar.style.background = 'linear-gradient(180deg, #1e5fbf 0%, #154a94 100%)';
        bar.style.boxShadow = '0 2px 14px rgba(21,74,148,.45)';
      } else if (state === 'success') {
        bar.style.background = 'linear-gradient(180deg, #1a7a42 0%, #0f5c30 100%)';
        bar.style.boxShadow = '0 2px 14px rgba(15,92,48,.4)';
      } else if (state === 'error') {
        bar.style.background = 'linear-gradient(180deg, #b83232 0%, #8f2424 100%)';
        bar.style.boxShadow = '0 2px 14px rgba(143,36,36,.4)';
      } else if (state === 'installed') {
        bar.style.background = 'linear-gradient(180deg, #1a5f8f 0%, #154a94 100%)';
        bar.style.boxShadow = '0 2px 12px rgba(21,74,148,.35)';
      } else {
        bar.style.background = 'linear-gradient(180deg, #1e5fbf 0%, #154a94 100%)';
        bar.style.boxShadow = '0 2px 10px rgba(0,0,0,.25)';
      }
    }

    function injectBarKeyframes() {
      if (document.getElementById('axis-cws-install-keyframes')) return;
      const style = document.createElement('style');
      style.id = 'axis-cws-install-keyframes';
      style.textContent =
        '@keyframes axisInstallBadgeIn{from{opacity:0;transform:scale(0.88)}to{opacity:1;transform:scale(1)}}' +
        '@keyframes axisInstallBarIn{from{opacity:0;transform:translateY(-100%)}to{opacity:1;transform:translateY(0)}}' +
        '@keyframes axisInstallBarProgress{0%{left:0;width:12%}50%{left:32%;width:42%}100%{left:88%;width:12%}}';
      (document.head || document.documentElement).appendChild(style);
    }

    function ensureBar() {
      const ctx = storeContext();
      if (!ctx) {
        removeBar();
        return null;
      }

      let bar = document.getElementById(BAR_ID);
      if (bar && bar.dataset.axisStoreToken === ctx.token) return bar;
      if (bar) bar.remove();

      injectBarKeyframes();

      bar = document.createElement('div');
      bar.id = BAR_ID;
      bar.dataset.axisStoreToken = ctx.token;
      bar.dataset.axisBarState = 'idle';
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Axis Browser extension install');
      bar.setAttribute('aria-live', 'polite');
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
        borderBottom: '1px solid rgba(0,0,0,0.15)',
        animation: 'axisInstallBarIn 0.38s cubic-bezier(0.22, 1, 0.36, 1) forwards'
      });

      const progress = document.createElement('div');
      progress.setAttribute('data-axis-install-progress', '1');
      Object.assign(progress.style, {
        position: 'absolute',
        left: '0',
        bottom: '0',
        height: '2px',
        width: '0',
        background: 'rgba(255,255,255,0.9)',
        display: 'none'
      });
      bar.appendChild(progress);

      const text = document.createElement('span');
      text.setAttribute('data-axis-install-status', '1');
      text.textContent =
        ctx.kind === 'amo'
          ? 'The Mozilla “Add to Firefox” button does not install into Axis. Use Install in Axis below instead.'
          : 'The store’s Add to Chrome control does not install extensions in Axis. Use Install in Axis below instead.';

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Install in Axis';
      btn.setAttribute('aria-busy', 'false');
      Object.assign(btn.style, {
        padding: '7px 14px',
        fontSize: '13px',
        fontWeight: '600',
        border: 'none',
        borderRadius: '6px',
        background: '#fff',
        color: '#154a94',
        cursor: 'pointer',
        flexShrink: '0',
        transition: 'background 0.25s ease, color 0.25s ease, transform 0.15s ease'
      });
      btn.addEventListener('mousedown', () => {
        if (btn.dataset.axisInstallState !== 'busy') btn.style.transform = 'scale(0.97)';
      });
      btn.addEventListener('mouseup', () => {
        btn.style.transform = '';
      });
      btn.addEventListener('click', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (btn.dataset.axisInstallState === 'busy') return;
        const prog = bar.querySelector('[data-axis-install-progress]');
        if (prog) {
          prog.style.display = 'block';
          prog.style.animation = 'axisInstallBarProgress 1.15s ease-in-out infinite';
        }
        setInstallButtonState(btn, 'busy');
        setBarVisualState(bar, 'busy', 'Installing extension in Axis…');
        try {
          if (ctx.kind === 'amo') {
            ipcRenderer.sendToHost('axis-amo-install-in-axis', ctx.payload);
          } else {
            ipcRenderer.sendToHost('axis-cws-add-to-chrome', ctx.payload);
          }
        } catch (_) {
          setInstallButtonState(btn, 'error');
          setBarVisualState(bar, 'error', 'Could not reach Axis — try the Install in Axis bar above the page.');
        }
      });

      bar.appendChild(text);
      bar.appendChild(btn);

      const root = document.body || document.documentElement;
      try {
        root.appendChild(bar);
        try {
          ipcRenderer.sendToHost('axis-request-store-listing-status');
        } catch (_) {
          /* ignore */
        }
      } catch (_) {
        /* ignore */
      }
      return bar;
    }

    function applyInstalledStatus(payload) {
      const bar = document.getElementById(BAR_ID);
      if (!bar || !payload) return;
      const token = typeof payload.token === 'string' ? payload.token.trim() : '';
      if (!token || bar.dataset.axisStoreToken !== token) return;
      const btn = bar.querySelector('button');
      const prog = bar.querySelector('[data-axis-install-progress]');
      if (prog) {
        prog.style.display = 'none';
        prog.style.animation = '';
      }
      if (payload.installed) {
        const name = typeof payload.name === 'string' ? payload.name.trim() : '';
        const version = typeof payload.version === 'string' ? payload.version.trim() : '';
        setInstalledBadge(bar, true, name, version);
        setInstallButtonState(btn, 'installed');
        setBarVisualState(
          bar,
          'installed',
          name
            ? `${name} is already in Axis. Install again to fetch a fresh copy.`
            : 'This extension is already in Axis. Install again to fetch a fresh copy.'
        );
      } else {
        setInstalledBadge(bar, false);
        if (btn && btn.dataset.axisInstallState !== 'busy' && btn.dataset.axisInstallState !== 'success') {
          setInstallButtonState(btn, 'idle');
          setBarVisualState(
            bar,
            'idle',
            bar.dataset.axisStoreToken.indexOf('amo:') === 0
              ? 'The Mozilla “Add to Firefox” button does not install into Axis. Use Install in Axis below instead.'
              : 'The store’s Add to Chrome control does not install extensions in Axis. Use Install in Axis below instead.'
          );
        }
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
      const bar = document.getElementById(BAR_ID);
      const btn = bar && bar.querySelector('button');
      if (!bar || bar.dataset.axisStoreToken !== t) return;
      const prog = bar.querySelector('[data-axis-install-progress]');
      if (prog) {
        prog.style.display = 'none';
        prog.style.animation = '';
      }
      setInstallButtonState(btn, 'success');
      setBarVisualState(bar, 'success', 'Extension installed — open it from the puzzle icon in Axis’s URL bar.');
      setTimeout(() => {
        if (!bar.isConnected) return;
        setInstallButtonState(btn, 'installed');
        setInstalledBadge(bar, true, '', '');
        setBarVisualState(
          bar,
          'installed',
          'Extension installed. Install again anytime to fetch a fresh copy.'
        );
      }, 1600);
    });

    ipcRenderer.on('axis-cws-install-failed', (_event, token, message) => {
      const t = typeof token === 'string' ? token.trim() : '';
      if (!t) return;
      const bar = document.getElementById(BAR_ID);
      if (!bar || bar.dataset.axisStoreToken !== t) return;
      const btn = bar.querySelector('button');
      const prog = bar.querySelector('[data-axis-install-progress]');
      if (prog) {
        prog.style.display = 'none';
        prog.style.animation = '';
      }
      const msg =
        typeof message === 'string' && message.trim()
          ? message.trim()
          : 'Could not install this extension.';
      setInstallButtonState(btn, 'error');
      setBarVisualState(bar, 'error', msg);
    });

    ipcRenderer.on('axis-cws-install-status', (_event, payload) => {
      applyInstalledStatus(payload);
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
