'use strict';

/** Shared autofill popup styles (light/dark via `data-axis-theme` on the menu). */
const AXIS_VAULT_AUTOFILL_STYLE_CSS =
"#axis-vault-autofill-menu{position:fixed;z-index:2147483647;margin:0;padding:10px;list-style:none;border:none;border-rad" +
  "ius:20px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-x:hidden;overflow-y:" +
  "auto;font:13.5px/1.3 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.015" +
  "em;-webkit-font-smoothing:antialiased;backdrop-filter:saturate(1.4) blur(24px);-webkit-backdrop-filter:saturate(1.4) blu" +
  "r(24px)}#axis-vault-autofill-menu[data-axis-theme=\"light\"]{background:rgba(250,250,252,.92);box-shadow:0 16px 48px rgba(" +
  "0,0,0,.16),0 0 0 0.5px rgba(0,0,0,.06)}#axis-vault-autofill-menu[data-axis-theme=\"dark\"]{background:rgba(36,36,38,.92);b" +
  "ox-shadow:0 16px 48px rgba(0,0,0,.5),0 0 0 0.5px rgba(255,255,255,.1)}#axis-vault-autofill-menu li{margin:0;padding:0;li" +
  "st-style:none}#axis-vault-autofill-menu button.axis-af-pill{display:flex;align-items:center;gap:12px;width:100%;min-heig" +
  "ht:44px;height:44px;padding:0 16px 0 12px;margin:0;border:none;border-radius:999px;cursor:pointer;text-align:left;box-si" +
  "zing:border-box;font:inherit;color:inherit;transition:background .12s ease,transform .1s ease}#axis-vault-autofill-menu[" +
  "data-axis-theme=\"light\"] button.axis-af-pill{background:#ebebef;color:#1d1d1f}#axis-vault-autofill-menu[data-axis-theme=" +
  "\"dark\"] button.axis-af-pill{background:#3a3a3c;color:#f5f5f7}#axis-vault-autofill-menu[data-axis-theme=\"light\"] button.a" +
  "xis-af-pill:hover,#axis-vault-autofill-menu[data-axis-theme=\"light\"] button.axis-af-pill:focus{background:#dedee3;outlin" +
  "e:none;transform:translateY(-0.5px)}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] button.axis-af-pill:hover,#axis-va" +
  "ult-autofill-menu[data-axis-theme=\"dark\"] button.axis-af-pill:focus{background:#48484a;outline:none;transform:translateY" +
  "(-0.5px)}#axis-vault-autofill-menu .axis-af-icon{flex:0 0 auto;width:26px;height:26px;border-radius:7px;display:inline-f" +
  "lex;align-items:center;justify-content:center;font-size:10px;font-weight:800;line-height:1;overflow:hidden}#axis-vault-a" +
  "utofill-menu .axis-af-icon.is-initials{background:linear-gradient(145deg,#ffb340,#ff9f0a);color:#1d1d1f}#axis-vault-auto" +
  "fill-menu .axis-af-icon.is-glyph{background:transparent;color:inherit}#axis-vault-autofill-menu .axis-af-icon.is-favicon" +
  "{background:#fff;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.12)}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af" +
  "-icon.is-favicon{background:#2c2c2e;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,.14)}#axis-vault-autofill-menu .axis-a" +
  "f-icon.is-favicon img{width:18px;height:18px;object-fit:contain;display:block;border-radius:4px}#axis-vault-autofill-men" +
  "u .axis-af-icon.is-brand{background:transparent;overflow:visible}#axis-vault-autofill-menu .axis-af-icon svg{width:18px;" +
  "height:18px;display:block}#axis-vault-autofill-menu .axis-af-mc{width:24px;height:24px;position:relative;display:inline-" +
  "block}#axis-vault-autofill-menu .axis-af-mc:before,#axis-vault-autofill-menu .axis-af-mc:after{content:\"\";position:absol" +
  "ute;top:4px;width:14px;height:14px;border-radius:50%}#axis-vault-autofill-menu .axis-af-mc:before{left:0;background:#eb0" +
  "01b}#axis-vault-autofill-menu .axis-af-mc:after{right:0;background:#f79e1b;mix-blend-mode:multiply}#axis-vault-autofill-" +
  "menu .axis-af-visa,#axis-vault-autofill-menu .axis-af-amex{width:26px;height:16px;border-radius:3px;display:inline-flex;" +
  "align-items:center;justify-content:center;font-size:7px;font-weight:800;letter-spacing:.03em}#axis-vault-autofill-menu ." +
  "axis-af-visa{background:#1a1f71;color:#fff}#axis-vault-autofill-menu .axis-af-amex{background:#2e77bb;color:#fff;font-si" +
  "ze:6px}#axis-vault-autofill-menu .axis-af-row{flex:1 1 auto;min-width:0;display:flex;align-items:center;justify-content:" +
  "space-between;gap:12px}#axis-vault-autofill-menu .axis-af-left,#axis-vault-autofill-menu .axis-af-right{min-width:0;over" +
  "flow:hidden;text-overflow:ellipsis;white-space:nowrap}#axis-vault-autofill-menu .axis-af-left{flex:1 1 auto;display:flex" +
  ";flex-direction:column;gap:1px;justify-content:center}#axis-vault-autofill-menu .axis-af-right{flex:0 1 auto;max-width:4" +
  "0%;text-align:right}#axis-vault-autofill-menu .axis-af-user,#axis-vault-autofill-menu .axis-af-title{font-size:13.5px;fo" +
  "nt-weight:600;letter-spacing:-0.015em;color:inherit}#axis-vault-autofill-menu .axis-af-sub,#axis-vault-autofill-menu .ax" +
  "is-af-meta{font-size:11.5px;font-weight:500;letter-spacing:-0.01em}#axis-vault-autofill-menu[data-axis-theme=\"light\"] .a" +
  "xis-af-sub,#axis-vault-autofill-menu[data-axis-theme=\"light\"] .axis-af-meta,#axis-vault-autofill-menu[data-axis-theme=\"l" +
  "ight\"] .axis-af-muted{color:#6e6e73}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af-sub,#axis-vault-autofill-" +
  "menu[data-axis-theme=\"dark\"] .axis-af-meta,#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af-muted{color:#98989" +
  "d}";

const AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS = `(function axisVaultAutofillBootstrap(){
  try {
  const UI_VER = 14;
  if (window.__axisVault && window.__axisVault.ready && window.__axisVault.uiVer === UI_VER) return true;
  try {
    if (window.__axisVault && typeof window.__axisVault.hideMenu === 'function') window.__axisVault.hideMenu();
  } catch (_) {}
  const MENU_ID = 'axis-vault-autofill-menu';
  // Keep secrets in this closure — never put plaintext passwords on page window globals.
  let pendingLogin = null;
  let lastAutofillMeta = null;

  function passwordFp(password) {
    const s = String(password || '');
    if (!s) return '';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return s.length + ':' + (h >>> 0).toString(16);
  }

  function setLastAutofillLoginMeta(username, password) {
    lastAutofillMeta = {
      at: Date.now(),
      kind: 'login',
      origin: location.origin || '',
      username: username || '',
      passwordFp: passwordFp(password)
    };
    try {
      window.__axisVaultLastAutofill = {
        at: lastAutofillMeta.at,
        kind: 'login',
        origin: lastAutofillMeta.origin,
        username: lastAutofillMeta.username,
        passwordFp: lastAutofillMeta.passwordFp
      };
    } catch (_) {}
  }
  const STYLE_ID = 'axis-vault-autofill-style';
  const STYLE_CSS = ${JSON.stringify(AXIS_VAULT_AUTOFILL_STYLE_CSS)};

  function uiTheme() {
    try {
      const d = document.documentElement.getAttribute('data-axis-vault-theme');
      if (d === 'light' || d === 'dark') return d;
    } catch (_) {}
    if (window.__axisVaultUiTheme === 'light' || window.__axisVaultUiTheme === 'dark') return window.__axisVaultUiTheme;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (_) { return 'light'; }
  }

  function vis(el) {
    if (!el || el.disabled || el.readOnly) return false;
    const tag = el.tagName;
    if (tag === 'SELECT' || tag === 'TEXTAREA') {
      try {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
      } catch (_) { return false; }
      return true;
    }
    if (tag !== 'INPUT') return false;
    const t = (el.type || 'text').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'reset' || t === 'file') return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
    } catch (_) { return false; }
    return true;
  }

  function kind(el) {
    if (!el) return null;
    const t = (el.type || 'text').toLowerCase();
    const ac = (el.autocomplete || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const ph = String(el.placeholder || '').toLowerCase();
    const aria = String(el.getAttribute('aria-label') || '').toLowerCase();
    const stable = String(el.getAttribute('data-elements-stable-field-name') || el.getAttribute('data-tid') || '').toLowerCase();
    if (t === 'password' || ac.includes('password') || name.includes('password') || id.includes('password')) return 'password';
    if (
      ac.includes('cc-number') || ac === 'cc-number' ||
      stable === 'cardnumber' || stable.includes('cardnumber') ||
      (name.includes('card') && name.includes('number')) || (id.includes('card') && id.includes('number')) ||
      name.includes('cardnumber') || id.includes('cardnumber') ||
      aria.includes('card number') || aria === 'number' && (ph.includes('card') || name.includes('card')) ||
      ph.includes('card number')
    ) return 'cc-number';
    if (
      ac.includes('cc-name') || name.includes('cardholder') || name.includes('cc-name') ||
      id.includes('cardholder') || id.includes('cc-name') || aria.includes('name on card') || aria.includes('cardholder')
    ) return 'cc-name';
    if (
      ac === 'cc-exp-month' || name.includes('expmonth') || name.includes('exp-month') ||
      id.includes('expmonth') || id.includes('exp-month') || stable.includes('cardexpirymonth')
    ) return 'cc-exp-month';
    if (
      ac === 'cc-exp-year' || name.includes('expyear') || name.includes('exp-year') ||
      id.includes('expyear') || id.includes('exp-year') || stable.includes('cardexpiryyear')
    ) return 'cc-exp-year';
    if (
      ac.includes('cc-exp') || stable === 'cardexpiry' || stable.includes('cardexpiry') ||
      aria.includes('expir') || ph.includes('mm') && ph.includes('yy') ||
      ((name.includes('exp') || id.includes('exp') || ph.includes('expir')) &&
        (name.includes('card') || id.includes('card') || ac.includes('cc-') || name.includes('expir') || id.includes('expir') || aria.includes('expir') || stable.includes('expir')))
    ) return 'cc-exp';
    if (
      ac.includes('cc-csc') || name.includes('cvv') || name.includes('cvc') || id.includes('cvv') ||
      id.includes('cvc') || ph.includes('cvv') || ph.includes('cvc') || aria.includes('cvc') ||
      aria.includes('cvv') || aria.includes('security code') || stable.includes('cardcvc') || stable === 'cvc'
    ) return 'cc-csc';
    if (ac === 'street-address' || ac === 'address-line1' || ac.includes('street-address') || name.includes('address1') || name.includes('street') || id.includes('street') || id.includes('address1')) return 'addr-line1';
    if (ac === 'address-line2' || name.includes('address2') || name.includes('apt') || id.includes('address2')) return 'addr-line2';
    if (ac === 'address-level1' || name === 'state' || name.includes('province') || id.includes('state')) return 'addr-state';
    if (ac === 'address-level2' || name === 'city' || id.includes('city')) return 'addr-city';
    if (ac === 'postal-code' || ac.includes('postal') || name.includes('zip') || name.includes('postal') || id.includes('zip') || id.includes('postal')) return 'addr-postal';
    if (ac === 'country' || ac === 'country-name' || name === 'country' || id.includes('country')) return 'addr-country';
    if (ac === 'organization' || name.includes('company') || id.includes('company')) return 'addr-org';
    if (ac === 'given-name' || name.includes('firstname') || name.includes('first_name') || id.includes('firstname')) return 'addr-name-given';
    if (ac === 'family-name' || name.includes('lastname') || name.includes('last_name') || id.includes('lastname')) return 'addr-name-family';
    if (ac === 'name' && !ac.includes('cc-')) return 'addr-name';
    if (ac === 'tel' || t === 'tel' || name.includes('phone') || id.includes('phone')) return 'addr-phone';
    if (t === 'email' || ac === 'email' || name === 'email' || id.includes('email')) {
      if (document.querySelector('input[type="password"]')) return 'username';
      return 'addr-email';
    }
    if (
      ac === 'username' ||
      ac.includes('username') ||
      name.includes('username') ||
      name === 'login' ||
      name.includes('login') ||
      id.includes('username') ||
      id.includes('login')
    ) {
      return 'username';
    }
    return null;
  }

  function isCardKind(k) {
    return k === 'cc-number' || k === 'cc-name' || k === 'cc-exp' || k === 'cc-exp-month' || k === 'cc-exp-year' || k === 'cc-csc';
  }

  function isAddressKind(k) {
    return k === 'addr-line1' || k === 'addr-line2' || k === 'addr-state' || k === 'addr-city' || k === 'addr-postal' || k === 'addr-country' || k === 'addr-org' || k === 'addr-name' || k === 'addr-name-given' || k === 'addr-name-family' || k === 'addr-phone' || k === 'addr-email';
  }

  function likelyUser(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (kind(el) === 'username') return true;
    const t = (el.type || 'text').toLowerCase();
    // Never treat site search / generic search as a login field (caused top-bar autofill ghosts).
    if (t === 'search' || t === 'hidden' || t === 'submit' || t === 'button' || t === 'checkbox' || t === 'radio') {
      return false;
    }
    if (t !== 'text' && t !== 'email' && t !== 'tel') return false;
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    const ph = (el.placeholder || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    const ac = (el.autocomplete || '').toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (
      t === 'search' ||
      role === 'searchbox' ||
      ac === 'off' && (ph.includes('search') || aria.includes('search') || name.includes('search') || id.includes('search')) ||
      ph.includes('search') ||
      aria.includes('search') ||
      name.includes('search') ||
      id.includes('search') ||
      name.includes('query') ||
      id.includes('query')
    ) {
      return false;
    }
    if (
      ac === 'username' ||
      ac === 'email' ||
      t === 'email' ||
      ph.includes('user') ||
      ph.includes('email') ||
      ph.includes('login') ||
      aria.includes('user') ||
      aria.includes('email') ||
      aria.includes('login') ||
      name.includes('username') ||
      name.includes('login') ||
      id.includes('username') ||
      id.includes('login')
    ) {
      return true;
    }
    // Only treat a plain text field as username when it shares a form with a password.
    const form = el.form;
    if (form && form.querySelector('input[type="password"]')) return true;
    return false;
  }

  function resolveKind(el) {
    return kind(el) || (likelyUser(el) ? 'username' : null);
  }

  function fillKind(el) {
    const k = resolveKind(el);
    if (k === 'username' || k === 'password' || isCardKind(k) || isAddressKind(k)) return k;
    return null;
  }

  function credKind(el) {
    return fillKind(el);
  }

  function offerKindFromField(k) {
    if (isCardKind(k)) return 'card';
    if (isAddressKind(k)) return 'address';
    if (k === 'username' || k === 'password') return 'login';
    return null;
  }

  function findUserForPass(pass) {
    const form = pass.form;
    if (form) {
      for (const el of form.querySelectorAll('input')) {
        if (!vis(el) || el === pass) continue;
        if (resolveKind(el) === 'username') return el;
      }
      const arr = Array.from(form.querySelectorAll('input')).filter(vis);
      const pi = arr.indexOf(pass);
      for (let i = pi - 1; i >= 0; i--) {
        const t = (arr[i].type || 'text').toLowerCase();
        if (t === 'text' || t === 'email' || t === 'tel') return arr[i];
      }
    }
    const all = Array.from(document.querySelectorAll('input')).filter(vis);
    const pi = all.indexOf(pass);
    for (let i = pi - 1; i >= 0; i--) {
      if (resolveKind(all[i]) === 'username') return all[i];
      const t = (all[i].type || 'text').toLowerCase();
      if (t === 'text' || t === 'email' || t === 'tel') return all[i];
    }
    return document.querySelector('input[type="email"]');
  }

  function inputFromEvent(e) {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
    for (let i = 0; i < path.length; i++) {
      const n = path[i];
      if (!n || !n.tagName) continue;
      if ((n.tagName === 'INPUT' || n.tagName === 'SELECT' || n.tagName === 'TEXTAREA') && vis(n)) return n;
    }
    return null;
  }

  function ensureStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = STYLE_CSS;
  }

  function hideMenu() {
    const m = document.getElementById(MENU_ID);
    if (m && m.parentNode) m.parentNode.removeChild(m);
    api.menuAnchor = null;
  }

  function clearAutofillFocus() {
    api.focusedField = null;
    api.focusKey = '';
    api.focusAnchor = null;
    api.focusAt = 0;
  }

  function shouldKeepAutofillMenu() {
    const active = document.activeElement;
    const menu = document.getElementById(MENU_ID);
    if (menu && active && menu.contains(active)) return true;
    // Shell overlay has no in-page menu - keep focus bookkeeping while still on a fill field.
    if (active && vis(active) && (fillKind(active) || likelyUser(active))) return true;
    return false;
  }

  function dismissAutofillMenuIfNeeded() {
    if (!document.getElementById(MENU_ID) && !api.focusedField) return;
    if (shouldKeepAutofillMenu()) return;
    hideMenu();
    clearAutofillFocus();
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    const w = Math.max(160, Math.round(rect.width || 160));
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + 168 > window.innerHeight - 8) top = Math.max(8, rect.top - 4 - 140);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.width = w + 'px';
    menu.style.minWidth = w + 'px';
    menu.style.maxWidth = w + 'px';
  }

  function setVal(el, value) {
    if (!el || value == null) return;
    const str = String(value);
    try { el.focus(); } catch (_) {}
    try {
      const proto = Object.getPrototypeOf(el);
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      if (desc && desc.set) desc.set.call(el, str);
      else el.value = str;
    } catch (_) { el.value = str; }
    try {
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: str }));
    } catch (_) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function fieldKindForAnchor(anchor) {
    if (anchor) {
      const k = credKind(anchor);
      if (k) return k;
      if (likelyUser(anchor)) return 'username';
    }
    return api.focusedField && api.focusedField.fieldKind ? api.focusedField.fieldKind : null;
  }

  function fillLogin(cred, anchor) {
    anchor = anchor || api.menuAnchor || api.focusAnchor;
    const root = anchor && anchor.form ? anchor.form : document;
    let pass =
      (anchor && credKind(anchor) === 'password' ? anchor : null) ||
      (root.querySelector && root.querySelector('input[type="password"]')) ||
      null;
    if (!pass || !vis(pass)) {
      const all = Array.from(document.querySelectorAll('input')).filter(vis);
      pass =
        all.find((el) => credKind(el) === 'password') ||
        document.querySelector('input[type="password"]') ||
        document.querySelector('input[autocomplete*="password"]');
    }
    let user = null;
    if (anchor && (credKind(anchor) === 'username' || likelyUser(anchor))) user = anchor;
    else if (pass) user = findUserForPass(pass);
    if (!user) {
      const scoped = fillableFields(root);
      user =
        scoped.find((el) => resolveKind(el) === 'username') ||
        scoped.find((el) => (el.type || '').toLowerCase() === 'email') ||
        null;
    }
    if (!user) {
      const all = Array.from(document.querySelectorAll('input')).filter(vis);
      user =
        all.find((el) => resolveKind(el) === 'username') ||
        all.find((el) => likelyUser(el)) ||
        document.querySelector('input[type="email"]') ||
        document.querySelector('input[autocomplete="username"]') ||
        null;
    }
    if (user && cred.username) setVal(user, cred.username);
    if (pass && cred.password) setVal(pass, cred.password);
    if (cred.password) {
      pendingLogin = {
        at: Date.now(),
        origin: location.origin || '',
        username: cred.username || '',
        password: cred.password || ''
      };
    }
    if (cred.password && (!pass || !vis(pass))) {
      setTimeout(function () {
        const latePass =
          Array.from(document.querySelectorAll('input')).filter(vis).find((el) => credKind(el) === 'password') ||
          document.querySelector('input[type="password"]');
        if (latePass && !String(latePass.value || '')) setVal(latePass, cred.password);
        if (cred.username) {
          const lateUser =
            (latePass && findUserForPass(latePass)) ||
            Array.from(document.querySelectorAll('input')).filter(vis).find((el) => resolveKind(el) === 'username') ||
            document.querySelector('input[type="email"]');
          if (lateUser && !String(lateUser.value || '').trim()) setVal(lateUser, cred.username);
        }
      }, 320);
    }
    setLastAutofillLoginMeta(cred.username || '', cred.password || '');
  }

  function applyPendingLogin(el) {
    const pending = pendingLogin;
    if (!pending || !pending.password) return false;
    if (Date.now() - (pending.at || 0) > 2 * 60 * 1000) {
      pendingLogin = null;
      return false;
    }
    if (pending.origin && pending.origin !== (location.origin || '')) {
      pendingLogin = null;
      return false;
    }
    const k = credKind(el);
    if (k === 'password') {
      setVal(el, pending.password);
      if (pending.username) {
        const userEl =
          findUserForPass(el) ||
          Array.from(document.querySelectorAll('input')).filter(vis).find((u) => resolveKind(u) === 'username') ||
          document.querySelector('input[type="email"]');
        if (userEl && !String(userEl.value || '').trim()) setVal(userEl, pending.username);
      }
      pendingLogin = null;
      setLastAutofillLoginMeta(pending.username || '', pending.password || '');
      return true;
    }
    if ((k === 'username' || likelyUser(el)) && pending.username && !String(el.value || '').trim()) {
      setVal(el, pending.username);
    }
    return false;
  }

  function fillableFields(root) {
    const scope = root && root.querySelectorAll ? root : document;
    return Array.from(scope.querySelectorAll('input, select, textarea')).filter(vis);
  }

  function splitFullName(fullName) {
    const parts = String(fullName || '').trim().split(/\\s+/).filter(Boolean);
    if (!parts.length) return { given: '', family: '' };
    if (parts.length === 1) return { given: parts[0], family: '' };
    return { given: parts[0], family: parts.slice(1).join(' ') };
  }

  function fillCard(card, anchor) {
    anchor = anchor || api.menuAnchor || api.focusAnchor;
    const root = anchor && anchor.form ? anchor.form : document;
    for (const el of fillableFields(root)) {
      const k = kind(el);
      if (k === 'cc-number') setVal(el, card.number);
      else if (k === 'cc-name') setVal(el, card.cardholder);
      else if (k === 'cc-exp') {
        const exp = card.expMonth && card.expYear ? (card.expMonth + '/' + String(card.expYear).slice(-2)) : '';
        setVal(el, exp);
      } else if (k === 'cc-exp-month') setVal(el, card.expMonth);
      else if (k === 'cc-exp-year') {
        const y = String(card.expYear || '');
        const wantsShort = el.maxLength === 2 || String(el.getAttribute('placeholder') || '').toLowerCase().includes('yy');
        setVal(el, wantsShort && y.length >= 2 ? y.slice(-2) : y);
      } else if (k === 'cc-csc') setVal(el, card.cvv);
      else if (k === 'addr-postal' && card.billingZip) setVal(el, card.billingZip);
    }
  }

  function fillAddress(address, anchor) {
    anchor = anchor || api.menuAnchor || api.focusAnchor;
    const root = anchor && anchor.form ? anchor.form : document;
    const names = splitFullName(address.fullName);
    for (const el of fillableFields(root)) {
      const k = kind(el);
      if (k === 'addr-name') setVal(el, address.fullName);
      else if (k === 'addr-name-given') setVal(el, names.given);
      else if (k === 'addr-name-family') setVal(el, names.family);
      else if (k === 'addr-org') setVal(el, address.organization);
      else if (k === 'addr-line1') setVal(el, address.addressLine1);
      else if (k === 'addr-line2') setVal(el, address.addressLine2);
      else if (k === 'addr-city') setVal(el, address.city);
      else if (k === 'addr-state') setVal(el, address.state);
      else if (k === 'addr-postal') setVal(el, address.postalCode);
      else if (k === 'addr-country') setVal(el, address.country);
      else if (k === 'addr-phone') setVal(el, address.phone);
      else if (k === 'addr-email') setVal(el, address.email);
    }
  }

  function cardBrand(num) {
    const n = String(num || '').replace(/\\D/g, '');
    if (/^4/.test(n)) return 'visa';
    if (/^5[1-5]/.test(n) || /^2(2[2-9]|[3-6]|7[01]|720)/.test(n)) return 'mastercard';
    if (/^3[47]/.test(n)) return 'amex';
    return 'card';
  }

  function initialsFrom(text) {
    const s = String(text || '').trim();
    if (!s) return '••';
    const parts = s.replace(/@.*/, '').split(/[\\s._-]+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
    return s.slice(0, 2).toUpperCase();
  }

  function hostFromOrigin(origin) {
    try { return new URL(String(origin || '')).hostname.replace(/^www\\./, ''); } catch (_) { return ''; }
  }

  function cleanLoginSiteLabel(title, origin) {
    const site = hostFromOrigin(origin);
    // Always prefer the real site host for the bold label (never "Log in to …").
    if (site) return site;
    let t = String(title || '').trim();
    t = t.replace(/^(log\\s*in\\s*to|sign\\s*in\\s*to|login\\s*to|sign\\s*into|log\\s*into)\\s+/i, '');
    t = t.replace(/^https?:\\/\\//i, '').replace(/^www\\./i, '').replace(/\\/$/, '');
    return t || 'Account';
  }

  function faviconCandidates(origin) {
    const host = hostFromOrigin(origin);
    const out = [];
    try {
      // Prefer the live page favicon when filling on the same site (works under CSP).
      if (origin && location.origin === origin) {
        const link = document.querySelector('link[rel="icon"],link[rel="shortcut icon"],link[rel*="icon"]');
        if (link && link.href) out.push(link.href);
        out.push(location.origin + '/favicon.ico');
      }
    } catch (_) {}
    if (host) {
      out.push('https://icons.duckduckgo.com/ip3/' + encodeURIComponent(host) + '.ico');
      out.push('https://www.google.com/s2/favicons?domain=' + encodeURIComponent(host) + '&sz=64');
      try {
        const u = new URL(String(origin || ''));
        if (out.indexOf(u.origin + '/favicon.ico') === -1) out.push(u.origin + '/favicon.ico');
      } catch (_) {}
    }
    return out;
  }

  function formatAfDate(ts) {
    const n = Number(ts);
    if (!n) return '';
    try {
      const d = new Date(n);
      if (Number.isNaN(d.getTime())) return '';
      return (d.getMonth() + 1) + '/' + d.getDate() + '/' + d.getFullYear();
    } catch (_) { return ''; }
  }

  function iconSvg(kind) {
    if (kind === 'house') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1v-10.5Z"/></svg>';
    }
    if (kind === 'key') {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="8" cy="15" r="4"/><path d="m12 13 8-8 2 2-2 2-2-2-4 4"/><path d="m16 7 2 2"/></svg>';
    }
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>';
  }

  function buildPillButton(row, offerKind) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'axis-af-pill';
    btn.setAttribute('role', 'option');
    const ui = row && row._ui ? row._ui : null;
    const isLoginKind =
      offerKind === 'login' ||
      offerKind === 'username' ||
      offerKind === 'password' ||
      (!offerKind && ui && (ui.iconKind === 'favicon' || ui.iconKind === 'initials'));

    let iconKind = 'card';
    let iconText = '';
    let iconUrl = '';
    let leftLabel = '';
    let leftValue = '';
    let rightLabel = '';
    let rightValue = '';

    function faviconForOrigin(origin) {
      const list = faviconCandidates(origin);
      return list[0] || '';
    }

    if (ui && !isLoginKind) {
      iconKind = ui.iconKind || 'card';
      iconText = ui.iconText || '';
      iconUrl = ui.iconUrl || '';
      leftLabel = ui.primaryLabel || '';
      leftValue = ui.primaryValue || '';
      rightLabel = ui.secondaryLabel || '';
      rightValue = ui.secondaryValue || '';
    } else if (!isLoginKind && offerKind === 'card') {
      const brand = cardBrand(row.number);
      iconKind = brand === 'mastercard' || brand === 'visa' || brand === 'amex' ? brand : 'card';
      if (row.label) leftLabel = row.label;
      else if (brand === 'mastercard') leftLabel = 'MasterCard';
      else if (brand === 'visa') leftLabel = 'Visa';
      else if (brand === 'amex') leftLabel = 'Amex';
      else leftLabel = 'Card';
      leftValue = row.masked || ('···· ' + String(row.number || '').slice(-4));
      const em = String(row.expMonth || '').padStart(2, '0');
      const ey = String(row.expYear || '');
      if (em && ey && em !== '00') {
        rightLabel = 'Expiry';
        rightValue = em + '/' + (ey.length === 4 ? ey.slice(-2) : ey);
      }
    } else if (!isLoginKind && offerKind === 'address') {
      iconKind = 'house';
      leftLabel = '';
      leftValue = row.summary || row.addressLine1 || row.fullName || '';
      if (row.label && leftValue && row.label !== leftValue) {
        rightLabel = 'Note';
        rightValue = row.label;
      }
    } else {
      const displayUser =
        (row && row.username) ||
        (ui && ui.primaryValue) ||
        '';
      const site = hostFromOrigin(row && row.origin);
      iconUrl = (ui && ui.iconUrl) || faviconForOrigin(row && row.origin);
      iconKind = iconUrl ? 'favicon' : 'initials';
      iconText = (ui && ui.iconText) || initialsFrom(displayUser || site);
      // Password pills: username only - favicon identifies the site.
      leftLabel = '';
      leftValue = displayUser || '••••';
      rightLabel = (ui && ui.secondaryLabel) || '';
      rightValue = (ui && ui.secondaryValue) || '';
      if (!rightLabel || !rightValue) {
        const when = formatAfDate(row && row.updatedAt);
        if (when) {
          rightLabel = 'Date Added';
          rightValue = when;
        }
      }
    }

    const isLoginPill = isLoginKind || iconKind === 'favicon';

    const icon = document.createElement('span');
    icon.className = 'axis-af-icon';
    if (iconKind === 'mastercard') {
      icon.classList.add('is-brand');
      icon.innerHTML = '<span class="axis-af-mc" aria-hidden="true"></span>';
    } else if (iconKind === 'visa') {
      icon.classList.add('is-brand');
      icon.innerHTML = '<span class="axis-af-visa" aria-hidden="true">VISA</span>';
    } else if (iconKind === 'amex') {
      icon.classList.add('is-brand');
      icon.innerHTML = '<span class="axis-af-amex" aria-hidden="true">AMEX</span>';
    } else if (iconKind === 'house') {
      icon.classList.add('is-glyph');
      icon.innerHTML = iconSvg('house');
    } else if (iconKind === 'favicon' || (isLoginPill && (iconUrl || faviconCandidates(row && row.origin).length))) {
      const urls = [];
      if (iconUrl) urls.push(iconUrl);
      for (const u of faviconCandidates(row && row.origin)) {
        if (urls.indexOf(u) === -1) urls.push(u);
      }
      icon.classList.add('is-favicon');
      const img = document.createElement('img');
      img.alt = '';
      img.decoding = 'async';
      img.referrerPolicy = 'no-referrer';
      let idx = 0;
      img.src = urls[0] || '';
      img.addEventListener('error', () => {
        idx += 1;
        if (idx < urls.length) {
          img.src = urls[idx];
          return;
        }
        icon.classList.remove('is-favicon');
        icon.classList.add('is-initials');
        icon.textContent = iconText || initialsFrom(leftValue || leftLabel) || '••';
      });
      icon.appendChild(img);
    } else if (iconKind === 'initials') {
      icon.classList.add('is-initials');
      icon.textContent = iconText || '••';
    } else {
      icon.classList.add('is-glyph');
      icon.innerHTML = iconSvg('card');
    }

    const rowEl = document.createElement('span');
    rowEl.className = 'axis-af-row';
    const left = document.createElement('span');
    left.className = 'axis-af-left';
    if (isLoginPill) {
      const userEl = document.createElement('span');
      userEl.className = 'axis-af-user';
      userEl.textContent = leftValue || leftLabel || '••••';
      left.appendChild(userEl);
    } else if (leftLabel && leftValue) {
      const title = document.createElement('span');
      title.className = 'axis-af-title';
      title.textContent = leftValue;
      left.appendChild(title);
      const sub = document.createElement('span');
      sub.className = 'axis-af-sub';
      sub.textContent = leftLabel;
      left.appendChild(sub);
    } else {
      const title = document.createElement('span');
      title.className = 'axis-af-title';
      title.textContent = leftValue || leftLabel || '';
      left.appendChild(title);
    }
    rowEl.appendChild(left);

    if (rightValue) {
      const right = document.createElement('span');
      right.className = 'axis-af-right';
      const meta = document.createElement('span');
      meta.className = 'axis-af-meta';
      meta.textContent = rightValue;
      right.appendChild(meta);
      rowEl.appendChild(right);
    }

    btn.appendChild(icon);
    btn.appendChild(rowEl);
    return btn;
  }

  function showMenu(/* anchor, items, offerKind */) {
    // Shell overlay owns autofill UI - never paint a guest-page menu (CSP kills icons).
    hideMenu();
  }

  const api = {
    ready: true,
    uiVer: UI_VER,
    focusedField: null,
    focusKey: '',
    focusAt: 0,
    focusAnchor: null,
    pendingPickId: null,
    pendingPickKind: null,
    menuAnchor: null,
    showMenu,
    hideMenu,
    fillLogin,
    fillCard,
    fillAddress,
    fillKind,
    likelyUser,
    isCardKind,
    isAddressKind
  };
  window.__axisVault = api;

  function noteFocus(el) {
    const k = fillKind(el) || (likelyUser(el) ? 'username' : null);
    if (!k) {
      api.focusedField = null;
      api.focusKey = '';
      api.focusAnchor = null;
      return;
    }
    api.focusAnchor = el;
    const offer = offerKindFromField(k) || 'login';
    const userEl = k === 'password' ? findUserForPass(el) : el;
    let rect = null;
    try {
      const r = el.getBoundingClientRect();
      rect = { left: r.left, top: r.top, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
    } catch (_) {}
    api.focusedField = {
      kind: offer,
      origin: location.origin || '',
      pageUrl: location.href,
      usernameHint: offer === 'login' && userEl ? String(userEl.value || '').trim() : '',
      fieldKind: k,
      rect: rect
    };
    api.focusKey = offer + ':' + k + ':' + (el.id || el.name || '') + ':' + location.href;
    api.focusAt = Date.now();
  }

  document.addEventListener('focusin', (e) => {
    const el = inputFromEvent(e) || e.target;
    if (!vis(el) || (!fillKind(el) && !likelyUser(el))) {
      dismissAutofillMenuIfNeeded();
      clearAutofillFocus();
      return;
    }
    applyPendingLogin(el);
    noteFocus(el);
  }, true);

  document.addEventListener('click', (e) => {
    const el = inputFromEvent(e) || e.target;
    if (!vis(el) || (!fillKind(el) && !likelyUser(el))) {
      dismissAutofillMenuIfNeeded();
      clearAutofillFocus();
      return;
    }
    noteFocus(el);
  }, true);

  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById(MENU_ID);
    if (menu && menu.contains(e.target)) return;
    const el = inputFromEvent(e);
    if (el && vis(el) && (fillKind(el) || likelyUser(el))) return;
    setTimeout(function () {
      dismissAutofillMenuIfNeeded();
      if (!shouldKeepAutofillMenu()) clearAutofillFocus();
    }, 0);
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(function () {
      dismissAutofillMenuIfNeeded();
      if (!shouldKeepAutofillMenu()) clearAutofillFocus();
    }, 150);
  }, true);

  window.addEventListener('scroll', () => {
    if (api.menuAnchor && document.getElementById(MENU_ID)) {
      positionMenu(document.getElementById(MENU_ID), api.menuAnchor);
    }
  }, true);

  return true;
  } catch (_) { return false; }
})()`;

const AXIS_VAULT_AUTOFILL_PROBE_JS = `(function(){
  try {
  const v = window.__axisVault;
  if (!v || !v.ready) return null;
  if (v.pendingPickId) {
    const id = v.pendingPickId;
    const kind = v.pendingPickKind || 'login';
    v.pendingPickId = null;
    v.pendingPickKind = null;
    return { pick: id, pickKind: kind };
  }
  const active = document.activeElement;
  const onFillField = (function () {
    if (!active || !v || active.tagName !== 'INPUT') return false;
    try {
      const t = (active.type || 'text').toLowerCase();
      if (t === 'search' || t === 'hidden') return false;
    } catch (_) {}
    try {
      if (typeof v.fillKind === 'function' && v.fillKind(active)) return true;
    } catch (_) {}
    try {
      if (typeof v.likelyUser === 'function' && v.likelyUser(active)) return true;
    } catch (_) {}
    return false;
  })();
  const menu = document.getElementById('axis-vault-autofill-menu');
  if (menu) {
    const onMenu = active && menu.contains(active);
    if (!onMenu && !onFillField) {
      v.hideMenu && v.hideMenu();
      v.focusedField = null;
      v.focusKey = '';
      v.focusAnchor = null;
      v.focusAt = 0;
      return null;
    }
    if (onMenu || onFillField) {
      return {
        focus: v.focusedField || { kind: menu.getAttribute('data-axis-kind') || 'login', origin: location.origin || '', pageUrl: location.href },
        focusKey: v.focusKey || '',
        focusAt: v.focusAt || Date.now(),
        menuOpen: true
      };
    }
  }
  if (!onFillField) {
    v.focusedField = null;
    v.focusKey = '';
    v.focusAnchor = null;
    v.focusAt = 0;
    return null;
  }
  // Rebuild focus bookkeeping if hide/fill cleared it while the field is still focused.
  if (!v.focusedField && typeof v.fillKind === 'function') {
    try {
      const k = v.fillKind(active) || (typeof v.likelyUser === 'function' && v.likelyUser(active) ? 'username' : null);
      if (k) {
        const offer = (v.isCardKind && v.isCardKind(k)) ? 'card' : (v.isAddressKind && v.isAddressKind(k)) ? 'address' : 'login';
        let rect = null;
        try {
          const r = active.getBoundingClientRect();
          rect = { left: r.left, top: r.top, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
        } catch (_) {}
        v.focusAnchor = active;
        v.focusedField = {
          kind: offer,
          origin: location.origin || '',
          pageUrl: location.href,
          usernameHint: '',
          fieldKind: k,
          rect: rect
        };
        v.focusKey = offer + ':' + k + ':' + (active.id || active.name || '') + ':' + location.href;
        v.focusAt = Date.now();
      }
    } catch (_) {}
  }
  const f = v.focusedField;
  if (!f) return null;
  // Only keep the offer while the live active element is still the fill field.
  if (v.focusAnchor && active !== v.focusAnchor) {
    v.focusedField = null;
    v.focusKey = '';
    v.focusAnchor = null;
    v.focusAt = 0;
    return null;
  }
  // Refresh rect while focused so the shell menu matches the field width.
  try {
    if (v.focusAnchor && v.focusAnchor.getBoundingClientRect) {
      const r = v.focusAnchor.getBoundingClientRect();
      f.rect = { left: r.left, top: r.top, bottom: r.bottom, right: r.right, width: r.width, height: r.height };
    }
  } catch (_) {}
  if (!f.rect || !(f.rect.width >= 12) || !(f.rect.height >= 8)) return null;
  if (Date.now() - (v.focusAt || 0) > 8000) return null;
  return { focus: f, focusKey: v.focusKey || '', focusAt: v.focusAt || 0 };
  } catch (_) { return null; }
})()`;

const AXIS_VAULT_AUTOFILL_HIDE_JS = `(function(){
  try {
  if (window.__axisVault && window.__axisVault.hideMenu) window.__axisVault.hideMenu();
  var m = document.getElementById('axis-vault-autofill-menu');
  if (m && m.parentNode) m.parentNode.removeChild(m);
  } catch (_) {}
})()`;

function buildVaultAutofillThemeJs(theme) {
  const th = theme === 'light' ? 'light' : 'dark';
  return `window.__axisVaultUiTheme=${JSON.stringify(th)};`;
}

function buildVaultAutofillShowMenuJs(items, theme, kind) {
  const json = JSON.stringify(Array.isArray(items) ? items : []);
  const th = theme === 'light' ? 'light' : 'dark';
  const offer =
    kind === 'card' ? 'card' : kind === 'address' ? 'address' : 'login';
  return `(function(){
    window.__axisVaultUiTheme=${JSON.stringify(th)};
    var v=window.__axisVault;
    if(!v||!v.showMenu)return;
    var el=v.focusAnchor;
    if(!el||!document.contains(el)){
      el=document.activeElement;
    }
    if(!el)return;
    var fk=typeof v.fillKind==='function'?v.fillKind(el):null;
    var want=${JSON.stringify(offer)};
    if(want==='card'){
      if(!(v.isCardKind&&v.isCardKind(fk)))return;
    } else if(want==='address'){
      if(!(v.isAddressKind&&v.isAddressKind(fk)))return;
    } else if(fk&&((v.isCardKind&&v.isCardKind(fk))||(v.isAddressKind&&v.isAddressKind(fk)))){
      return;
    }
    v.showMenu(el,${json},want);
  })()`;
}

function buildVaultAutofillFillLoginJs(cred) {
  const json = JSON.stringify(cred && typeof cred === 'object' ? cred : {});
  return `(function(){
    var c=${json};
    var v=window.__axisVault;
    if(v&&v.fillLogin)v.fillLogin(c,v.menuAnchor||v.focusAnchor);
  })()`;
}

function buildVaultAutofillFillCardJs(card) {
  const safe =
    card && typeof card === 'object'
      ? { ...card, cvv: '' }
      : {};
  const json = JSON.stringify(safe);
  return `(function(){
    var c=${json};
    var v=window.__axisVault;
    if(v&&v.fillCard)v.fillCard(c,v.menuAnchor||v.focusAnchor);
  })()`;
}

function buildVaultAutofillFillAddressJs(address) {
  const json = JSON.stringify(address && typeof address === 'object' ? address : {});
  return `(function(){
    var c=${json};
    var v=window.__axisVault;
    if(v&&v.fillAddress)v.fillAddress(c,v.menuAnchor||v.focusAnchor);
  })()`;
}

module.exports = {
  AXIS_VAULT_AUTOFILL_STYLE_CSS,
  AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS,
  AXIS_VAULT_AUTOFILL_PROBE_JS,
  AXIS_VAULT_AUTOFILL_HIDE_JS,
  buildVaultAutofillThemeJs,
  buildVaultAutofillShowMenuJs,
  buildVaultAutofillFillLoginJs,
  buildVaultAutofillFillCardJs,
  buildVaultAutofillFillAddressJs
};
