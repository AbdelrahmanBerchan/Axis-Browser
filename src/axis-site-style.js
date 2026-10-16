'use strict';

/**
 * Per-site style designer: a small anchored card (same shell as Tab Ancestry) that
 * lets the user restyle the current site. Settings save per hostname and are
 * re-applied with `webview.insertCSS` on every page load.
 */
(function (root) {
  const LEGACY_FONT = {
    sans: 'system',
    serif: 'georgia',
    mono: 'mono',
    rounded: 'default'
  };
  const ICON_FONT_GUARD =
    ':not(i):not(svg):not(svg *):not([class*="icon"]):not([class*="Icon"]):not([class*="fa-"]):not(.material-icons):not([class*="material-symbols"])';

  const EMPTY = Object.freeze({
    enabled: true,
    background: '',
    text: '',
    link: '',
    font: '',
    textScale: 100,
    hideImages: false,
    customCss: ''
  });

  function fontsApi() {
    return root.AxisUiFonts || (typeof window !== 'undefined' ? window.AxisUiFonts : null);
  }

  function resolveFontId(raw) {
    let id = String(raw || '');
    if (!id) return '';
    if (LEGACY_FONT[id]) id = LEGACY_FONT[id];
    const api = fontsApi();
    return api?.getPreset?.(id) ? id : '';
  }

  function fontStack(fontId) {
    const id = resolveFontId(fontId);
    if (!id) return null;
    return fontsApi()?.getStack?.(id) || null;
  }

  function hostKey(url) {
    try {
      const u = new URL(String(url || ''));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
      return u.hostname.replace(/^www\./i, '').toLowerCase();
    } catch (_) {
      return '';
    }
  }

  const isColor = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  function sanitize(raw) {
    const s = { ...EMPTY, ...(raw && typeof raw === 'object' ? raw : {}) };
    return {
      enabled: s.enabled !== false,
      background: isColor(s.background) ? s.background : '',
      text: isColor(s.text) ? s.text : '',
      link: isColor(s.link) ? s.link : '',
      font: resolveFontId(s.font),
      textScale: Math.max(80, Math.min(160, Math.round(Number(s.textScale) || 100))),
      hideImages: !!s.hideImages,
      customCss: String(s.customCss || '').slice(0, 20000)
    };
  }

  function isDefault(s) {
    return (
      !s.background &&
      !s.text &&
      !s.link &&
      !s.font &&
      s.textScale === 100 &&
      !s.hideImages &&
      !s.customCss.trim()
    );
  }

  function buildCss(style) {
    const s = sanitize(style);
    if (!s.enabled) return '';
    const out = [];
    if (s.background) {
      out.push(
        `html, body { background: ${s.background} !important; background-image: none !important; }`,
        `main, article, section, [role="main"] { background-color: transparent !important; }`
      );
    }
    if (s.text) {
      out.push(
        `body { color: ${s.text} !important; }`,
        `p, li, span, div, h1, h2, h3, h4, h5, h6, label, td, th, dd, dt, blockquote${ICON_FONT_GUARD} { color: ${s.text} !important; }`
      );
    }
    if (s.link) {
      out.push(`a, a:visited, a *${ICON_FONT_GUARD} { color: ${s.link} !important; }`);
    }
    if (s.font) {
      const stack = fontStack(s.font);
      if (stack) {
        out.push(`body, body *${ICON_FONT_GUARD} { font-family: ${stack} !important; }`);
      }
    }
    if (s.textScale !== 100) {
      out.push(`html { font-size: ${s.textScale}% !important; }`);
    }
    if (s.hideImages) {
      out.push('img, picture, video, figure img, [role="img"] { visibility: hidden !important; }');
    }
    if (s.customCss.trim()) out.push(s.customCss);
    return out.join('\n');
  }

  class AxisSiteStyle {
    constructor(app) {
      this.app = app;
      this.memory = {};
      this.panel = null;
      this.backdrop = null;
      this.host = '';
      this.state = sanitize(null);
      this.saveTimer = 0;
      this.closeTimer = 0;
    }

    _storageKey() {
      return `axis-site-styles:${String(this.app?.profileId || 'personal')}`;
    }

    _persistent() {
      return !this.app?.isIncognitoWindow;
    }

    _loadAll() {
      if (!this._persistent()) return this.memory;
      try {
        const raw = JSON.parse(localStorage.getItem(this._storageKey()) || '{}');
        return raw && typeof raw === 'object' ? raw : {};
      } catch (_) {
        return {};
      }
    }

    _saveAll(all) {
      if (!this._persistent()) {
        this.memory = all;
        return;
      }
      try {
        localStorage.setItem(this._storageKey(), JSON.stringify(all));
      } catch (_) {}
    }

    get(host) {
      if (!host) return sanitize(null);
      return sanitize(this._loadAll()[host]);
    }

    set(host, style) {
      if (!host) return;
      const all = this._loadAll();
      const s = sanitize(style);
      if (isDefault(s)) delete all[host];
      else all[host] = s;
      this._saveAll(all);
    }

    _webviewUrl(webview) {
      try {
        return webview.getURL() || '';
      } catch (_) {
        return '';
      }
    }

    /**
     * Apply (or clear) the saved style for whatever site this webview is showing.
     * Calls are chained per webview: insertCSS keys arrive async, and overlapping
     * updates would otherwise orphan stylesheets that can never be removed.
     */
    applyTo(webview, styleOverride) {
      if (!webview || typeof webview.insertCSS !== 'function') return Promise.resolve();
      const run = async () => {
        const host = hostKey(this._webviewUrl(webview));
        const css = host ? buildCss(styleOverride || this.get(host)) : '';
        const prevKey = webview.__axisSiteStyleKey;
        if (css === (webview.__axisSiteStyleCss || '') && (prevKey || !css)) return;
        webview.__axisSiteStyleCss = css;
        webview.__axisSiteStyleKey = null;
        if (prevKey) {
          try {
            await webview.removeInsertedCSS(prevKey);
          } catch (_) {}
        }
        if (!css) return;
        try {
          webview.__axisSiteStyleKey = await webview.insertCSS(css);
        } catch (_) {}
      };
      const next = (webview.__axisSiteStyleChain || Promise.resolve()).then(run, run);
      webview.__axisSiteStyleChain = next;
      return next;
    }

    /** Call when a new document loads — inserted CSS does not survive navigation. */
    onDocumentReady(webview) {
      if (!webview) return;
      const reset = () => {
        webview.__axisSiteStyleKey = null;
        webview.__axisSiteStyleCss = '';
      };
      webview.__axisSiteStyleChain = (webview.__axisSiteStyleChain || Promise.resolve()).then(reset, reset);
      void this.applyTo(webview);
    }

    _applyToHost(host, style) {
      const tabs = this.app?.tabs;
      if (!tabs) return;
      for (const tab of tabs.values()) {
        const wv = tab?.webview;
        if (wv && hostKey(this._webviewUrl(wv)) === host) void this.applyTo(wv, style);
      }
    }

    t(key, fallback) {
      try {
        const v = this.app?.t?.(key);
        return v && v !== key ? v : fallback;
      } catch (_) {
        return fallback;
      }
    }

    _build() {
      if (this.panel) return;
      const backdrop = document.createElement('div');
      backdrop.className = 'tab-ancestry-backdrop site-style-backdrop hidden';
      backdrop.addEventListener('click', () => this.close());

      const panel = document.createElement('div');
      panel.className = 'tab-ancestry-panel site-style-panel hidden';
      panel.setAttribute('role', 'dialog');
      panel.setAttribute('aria-label', this.t('siteStyle.title', 'Site Style'));
      panel.innerHTML = `
        <div class="tab-ancestry-arrow" aria-hidden="true"></div>
        <div class="tab-ancestry-card site-style-card">
          <div class="site-style-header">
            <div class="site-style-titles">
              <h3 class="tab-ancestry-heading site-style-heading">${this.t('siteStyle.title', 'Site Style')}</h3>
              <div class="site-style-host" data-ss="host"></div>
            </div>
            <label class="site-style-switch" title="${this.t('siteStyle.toggle', 'Turn styling on or off for this site')}">
              <input type="checkbox" data-ss="enabled">
              <span class="site-style-switch-track"><span class="site-style-switch-thumb"></span></span>
            </label>
          </div>
          <div class="site-style-body" data-ss="body">
            <div class="site-style-row">
              <span class="site-style-label">${this.t('siteStyle.background', 'Background')}</span>
              <span class="site-style-color">
                <input type="color" data-ss="background" value="#ffffff">
                <button type="button" class="site-style-clear" data-clear="background" title="${this.t('siteStyle.useSite', 'Use site default')}">×</button>
              </span>
            </div>
            <div class="site-style-row">
              <span class="site-style-label">${this.t('siteStyle.text', 'Text')}</span>
              <span class="site-style-color">
                <input type="color" data-ss="text" value="#000000">
                <button type="button" class="site-style-clear" data-clear="text" title="${this.t('siteStyle.useSite', 'Use site default')}">×</button>
              </span>
            </div>
            <div class="site-style-row">
              <span class="site-style-label">${this.t('siteStyle.links', 'Links')}</span>
              <span class="site-style-color">
                <input type="color" data-ss="link" value="#2f6fed">
                <button type="button" class="site-style-clear" data-clear="link" title="${this.t('siteStyle.useSite', 'Use site default')}">×</button>
              </span>
            </div>
            <div class="site-style-row">
              <span class="site-style-label">${this.t('siteStyle.font', 'Font')}</span>
              <select data-ss="font"></select>
            </div>
            <div class="site-style-row">
              <span class="site-style-label">${this.t('siteStyle.scale', 'Scale')}</span>
              <span class="site-style-range">
                <input type="range" min="80" max="160" step="5" data-ss="textScale">
                <span class="site-style-range-val" data-ss="textScaleVal"></span>
              </span>
            </div>
            <label class="site-style-row site-style-check">
              <span class="site-style-label">${this.t('siteStyle.hideImages', 'Hide images')}</span>
              <input type="checkbox" data-ss="hideImages">
            </label>
            <details class="site-style-advanced" data-ss="advanced">
              <summary>${this.t('siteStyle.customCss', 'Custom CSS')}</summary>
              <textarea data-ss="customCss" spellcheck="false" placeholder="body { letter-spacing: 0.01em; }"></textarea>
            </details>
          </div>
          <div class="site-style-footer">
            <span class="site-style-status" data-ss="status"></span>
            <button type="button" class="site-style-btn" data-ss="reset">${this.t('siteStyle.reset', 'Reset')}</button>
            <button type="button" class="site-style-btn site-style-btn--primary" data-ss="done">${this.t('common.done', 'Done')}</button>
          </div>
        </div>`;

      document.body.appendChild(backdrop);
      document.body.appendChild(panel);
      this.panel = panel;
      this.backdrop = backdrop;

      const q = (k) => panel.querySelector(`[data-ss="${k}"]`);
      this.$ = q;

      panel.addEventListener('input', (e) => this._onInput(e));
      panel.addEventListener('change', (e) => this._onInput(e));
      panel.addEventListener('click', (e) => {
        const clear = e.target.closest('[data-clear]');
        if (clear) {
          this.state[clear.getAttribute('data-clear')] = '';
          this._sync();
          this._commit();
          return;
        }
        if (e.target.closest('[data-ss="reset"]')) {
          this.state = sanitize({ enabled: true });
          this._sync();
          this._commit(true);
          return;
        }
        if (e.target.closest('[data-ss="done"]')) this.close();
      });
      panel.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      });
    }

    _onInput(e) {
      const key = e.target?.getAttribute?.('data-ss');
      if (!key) return;
      const el = e.target;
      if (key === 'enabled' || key === 'hideImages') this.state[key] = !!el.checked;
      else if (key === 'textScale') this.state.textScale = Number(el.value) || 100;
      else if (key in this.state) this.state[key] = el.value;
      else return;
      this._sync();
      this._commit();
    }

    _populateFontSelect() {
      const sel = this.$('font');
      const api = fontsApi();
      if (!sel || !api) return;
      const selected = resolveFontId(this.state.font);
      api.fillSelect(sel, selected || 'default', (k, fb) => this.t(k, fb));
      const dash = document.createElement('option');
      dash.value = '';
      dash.textContent = this.t('siteStyle.siteDefault', 'Site default');
      sel.insertBefore(dash, sel.firstChild);
      sel.value = selected || '';
    }

    _sync() {
      const s = this.state;
      const $ = this.$;
      $('host').textContent = this.host;
      $('enabled').checked = s.enabled;
      $('body').classList.toggle('is-off', !s.enabled);
      for (const k of ['background', 'text', 'link']) {
        const input = $(k);
        if (s[k]) input.value = s[k];
        input.closest('.site-style-color').classList.toggle('is-unset', !s[k]);
      }
      $('font').value = resolveFontId(s.font);
      $('textScale').value = String(s.textScale);
      $('textScaleVal').textContent = `${s.textScale}%`;
      $('hideImages').checked = s.hideImages;
      const ta = $('customCss');
      if (document.activeElement !== ta) ta.value = s.customCss;
      if (s.customCss.trim()) $('advanced').open = true;
    }

    _commit(immediate) {
      const host = this.host;
      const style = sanitize(this.state);
      this._applyToHost(host, style);
      const status = this.$('status');
      if (this.saveTimer) clearTimeout(this.saveTimer);
      const save = () => {
        this.saveTimer = 0;
        this.set(host, style);
        status.textContent = isDefault(style)
          ? this.t('siteStyle.default', 'Using site default')
          : this.t('siteStyle.saved', 'Saved');
      };
      if (immediate) save();
      else {
        status.textContent = '';
        this.saveTimer = setTimeout(save, 250);
      }
    }

    _position(anchor) {
      const panel = this.panel;
      const arrow = panel.querySelector('.tab-ancestry-arrow');
      const pos = root.AxisAnchoredPopover?.position;
      if (pos) {
        pos(panel, arrow, {
          anchorEl: anchor?.tabEl || null,
          anchorPoint: anchor?.point || null,
          panelWidth: 248,
          minHeight: 200
        });
        return;
      }
    }

    /** opts: { webview, tabEl?, point? } — point is in host-window coordinates. */
    open(opts = {}) {
      const webview = opts.webview || this.app?.getActiveWebview?.();
      const host = hostKey(webview ? this._webviewUrl(webview) : opts.url || '');
      if (!host) {
        this.app?.showNotification?.(
          this.t('siteStyle.unavailable', 'Site Style works on regular websites only.'),
          'info'
        );
        return;
      }
      this._build();
      if (this.closeTimer) {
        clearTimeout(this.closeTimer);
        this.closeTimer = 0;
      }
      this.host = host;
      this.state = this.get(host);
      this.panel.setAttribute('data-ui-theme', this.app?.isLightUiTheme?.() ? 'light' : 'dark');
      this.$('status').textContent = '';
      this.$('advanced').open = false;
      this._populateFontSelect();
      this._sync();
      this._position(opts);
      this.panel.classList.remove('hidden', 'is-closing', 'is-open');
      this.backdrop.classList.remove('hidden');
      void this.panel.offsetWidth;
      requestAnimationFrame(() => {
        this.panel.classList.add('is-open');
        this._position(opts);
      });
    }

    isOpen() {
      return !!this.panel && !this.panel.classList.contains('hidden');
    }

    close() {
      if (!this.isOpen()) return;
      if (this.saveTimer) {
        clearTimeout(this.saveTimer);
        this.saveTimer = 0;
        this.set(this.host, this.state);
      }
      this.panel.classList.remove('is-open');
      this.panel.classList.add('is-closing');
      this.backdrop.classList.add('hidden');
      this.closeTimer = setTimeout(() => {
        this.closeTimer = 0;
        this.panel.classList.remove('is-closing');
        this.panel.classList.add('hidden');
      }, 160);
    }
  }

  AxisSiteStyle.hostKey = hostKey;
  AxisSiteStyle.buildCss = buildCss;
  AxisSiteStyle.sanitize = sanitize;
  root.AxisSiteStyle = AxisSiteStyle;
  if (typeof module !== 'undefined' && module.exports) module.exports = AxisSiteStyle;
})(typeof window !== 'undefined' ? window : globalThis);
