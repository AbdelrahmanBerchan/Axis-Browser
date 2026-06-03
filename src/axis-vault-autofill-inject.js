'use strict';

/** Shared autofill popup styles (light/dark via `data-axis-theme` on the menu). */
const AXIS_VAULT_AUTOFILL_STYLE_CSS =
  '#axis-vault-autofill-menu{position:fixed;z-index:2147483647;margin:0;padding:4px 0;list-style:none;border-radius:10px;font:13px -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-height:280px;overflow-y:auto;min-width:260px;box-sizing:border-box}' +
  '#axis-vault-autofill-menu[data-axis-theme="light"]{background:#fff;color:#1d1d1f;border:1px solid rgba(0,0,0,.12);box-shadow:0 8px 28px rgba(0,0,0,.16)}' +
  '#axis-vault-autofill-menu[data-axis-theme="dark"]{background:#2c2c2e;color:#f5f5f7;border:1px solid rgba(255,255,255,.14);box-shadow:0 8px 28px rgba(0,0,0,.45)}' +
  '#axis-vault-autofill-menu li{margin:0;padding:0}' +
  '#axis-vault-autofill-menu button{display:block;width:100%;text-align:left;border:none;background:transparent;padding:10px 14px;cursor:pointer;color:inherit;border-radius:6px;margin:0 4px;width:calc(100% - 8px)}' +
  '#axis-vault-autofill-menu[data-axis-theme="light"] button:hover,#axis-vault-autofill-menu[data-axis-theme="light"] button:focus{background:rgba(0,0,0,.06);outline:none}' +
  '#axis-vault-autofill-menu[data-axis-theme="dark"] button:hover,#axis-vault-autofill-menu[data-axis-theme="dark"] button:focus{background:rgba(255,255,255,.1);outline:none}' +
  '#axis-vault-autofill-menu .axis-af-title{display:block;font-weight:600;font-size:13px;line-height:1.3}' +
  '#axis-vault-autofill-menu .axis-af-sub{display:block;font-size:12px;margin-top:2px;line-height:1.3}' +
  '#axis-vault-autofill-menu[data-axis-theme="light"] .axis-af-sub{color:#86868b}' +
  '#axis-vault-autofill-menu[data-axis-theme="dark"] .axis-af-sub{color:#98989d}';

const AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS = `(function axisVaultAutofillBootstrap(){
  try {
  if (window.__axisVault && window.__axisVault.ready) return true;
  const MENU_ID = 'axis-vault-autofill-menu';
  const STYLE_ID = 'axis-vault-autofill-style';
  const STYLE_CSS = ${JSON.stringify(AXIS_VAULT_AUTOFILL_STYLE_CSS)};

  function uiTheme() {
    if (window.__axisVaultUiTheme === 'light' || window.__axisVaultUiTheme === 'dark') return window.__axisVaultUiTheme;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (_) { return 'light'; }
  }

  function vis(el) {
    if (!el || el.tagName !== 'INPUT' || el.disabled || el.readOnly) return false;
    const t = (el.type || 'text').toLowerCase();
    if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'reset' || t === 'file') return false;
    try {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
    } catch (_) { return false; }
    return true;
  }

  function kind(el) {
    const t = (el.type || 'text').toLowerCase();
    const ac = (el.autocomplete || '').toLowerCase();
    const name = (el.name || '').toLowerCase();
    const id = (el.id || '').toLowerCase();
    if (t === 'password' || ac.includes('password') || name.includes('password') || id.includes('password')) return 'password';
    if (t === 'email' || ac.includes('username') || ac === 'email' || name.includes('user') || name.includes('login') || name === 'email' || id.includes('user') || id.includes('login')) return 'username';
    return null;
  }

  function likelyUser(el) {
    if (kind(el) === 'username') return true;
    const t = (el.type || 'text').toLowerCase();
    if (t !== 'text' && t !== 'email' && t !== 'tel' && t !== 'search') return false;
    const ph = (el.placeholder || '').toLowerCase();
    const aria = (el.getAttribute('aria-label') || '').toLowerCase();
    if (ph.includes('user') || ph.includes('email') || ph.includes('login') || aria.includes('user') || aria.includes('email') || aria.includes('login')) return true;
    const form = el.form;
    if (form && form.querySelector('input[type="password"]')) return true;
    return !!document.querySelector('input[type="password"]');
  }

  function resolveKind(el) {
    return kind(el) || (likelyUser(el) ? 'username' : null);
  }

  function credKind(el) {
    const k = resolveKind(el);
    return k === 'username' || k === 'password' ? k : null;
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
      if (n && n.tagName === 'INPUT' && vis(n)) return n;
    }
    return null;
  }

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = STYLE_CSS;
    (document.head || document.documentElement).appendChild(style);
  }

  function hideMenu() {
    const m = document.getElementById(MENU_ID);
    if (m && m.parentNode) m.parentNode.removeChild(m);
    api.menuAnchor = null;
    api.focusedField = null;
    api.focusKey = '';
  }

  function shouldKeepAutofillMenu() {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return false;
    const active = document.activeElement;
    if (active && menu.contains(active)) return true;
    if (active && active.tagName === 'INPUT' && vis(active)) {
      if (credKind(active) || likelyUser(active)) return true;
    }
    return false;
  }

  function dismissAutofillMenuIfNeeded() {
    if (!document.getElementById(MENU_ID)) return;
    if (shouldKeepAutofillMenu()) return;
    hideMenu();
  }

  function positionMenu(menu, anchor) {
    const rect = anchor.getBoundingClientRect();
    const w = Math.max(260, rect.width);
    let left = rect.left;
    let top = rect.bottom + 6;
    if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
    if (top + 220 > window.innerHeight - 8) top = Math.max(8, rect.top - 8 - 180);
    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.minWidth = w + 'px';
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
    const fk = fieldKindForAnchor(anchor);
    const root = anchor && anchor.form ? anchor.form : document;

    if (fk === 'username') {
      let user = anchor;
      if (!user || credKind(user) !== 'username') {
        user = anchor && likelyUser(anchor) ? anchor : null;
      }
      if (!user) {
        let pass = root.querySelector && root.querySelector('input[type="password"]');
        if (!pass) pass = document.querySelector('input[type="password"]');
        if (pass) user = findUserForPass(pass);
      }
      if (user && cred.username) setVal(user, cred.username);
      window.__axisVaultLastAutofill = {
        at: Date.now(),
        origin: location.origin || '',
        username: cred.username || '',
        password: ''
      };
      return;
    }

    if (fk === 'password') {
      let pass =
        anchor && credKind(anchor) === 'password'
          ? anchor
          : root.querySelector && root.querySelector('input[type="password"]');
      if (!pass) pass = document.querySelector('input[type="password"]');
      if (pass && cred.password) setVal(pass, cred.password);
      window.__axisVaultLastAutofill = {
        at: Date.now(),
        origin: location.origin || '',
        username: cred.username || '',
        password: cred.password || ''
      };
      return;
    }

    let pass = root.querySelector && root.querySelector('input[type="password"]');
    if (!pass) pass = document.querySelector('input[type="password"]') || document.querySelector('input[autocomplete*="password"]');
    let user = null;
    if (anchor && credKind(anchor) === 'username') user = anchor;
    else if (pass) user = findUserForPass(pass);
    if (user && cred.username) setVal(user, cred.username);
    if (pass && cred.password) setVal(pass, cred.password);
    window.__axisVaultLastAutofill = {
      at: Date.now(),
      origin: location.origin || '',
      username: cred.username || '',
      password: cred.password || ''
    };
  }

  function showMenu(anchor, items) {
    hideMenu();
    anchor = anchor || api.focusAnchor;
    if (!anchor || !vis(anchor) || !items || !items.length) return;
    ensureStyles();
    const menu = document.createElement('ul');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('data-axis-theme', uiTheme());
    for (const row of items) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      const title = document.createElement('span');
      title.className = 'axis-af-title';
      const username = row.username || '';
      title.textContent = username || row.title || 'Saved account';
      btn.appendChild(title);
      const subText = row.title && row.title !== username ? row.title : '';
      if (subText) {
        const sub = document.createElement('span');
        sub.className = 'axis-af-sub';
        sub.textContent = subText;
        btn.appendChild(sub);
      }
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        hideMenu();
        if (row.password) fillLogin(row, anchor);
        else api.pendingPickId = row.id;
      });
      li.appendChild(btn);
      menu.appendChild(li);
    }
    document.documentElement.appendChild(menu);
    positionMenu(menu, anchor);
    api.menuAnchor = anchor;
  }

  const api = {
    ready: true,
    focusedField: null,
    focusKey: '',
    focusAt: 0,
    focusAnchor: null,
    pendingPickId: null,
    menuAnchor: null,
    showMenu,
    hideMenu,
    fillLogin
  };
  window.__axisVault = api;

  function noteFocus(el) {
    const k = credKind(el);
    if (!k) {
      api.focusedField = null;
      api.focusKey = '';
      api.focusAnchor = null;
      return;
    }
    api.focusAnchor = el;
    const userEl = k === 'password' ? findUserForPass(el) : el;
    api.focusedField = {
      kind: 'login',
      origin: location.origin || '',
      pageUrl: location.href,
      usernameHint: userEl ? String(userEl.value || '').trim() : '',
      fieldKind: k
    };
    api.focusKey = k + ':' + (el.id || el.name || '') + ':' + location.href;
    api.focusAt = Date.now();
  }

  document.addEventListener('focusin', (e) => {
    const el = inputFromEvent(e) || e.target;
    if (!vis(el) || (!credKind(el) && !likelyUser(el))) {
      dismissAutofillMenuIfNeeded();
      return;
    }
    noteFocus(el);
  }, true);

  document.addEventListener('click', (e) => {
    const el = inputFromEvent(e) || e.target;
    if (!vis(el)) {
      dismissAutofillMenuIfNeeded();
      return;
    }
    if (credKind(el) || likelyUser(el)) noteFocus(el);
    else dismissAutofillMenuIfNeeded();
  }, true);

  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;
    if (menu.contains(e.target)) return;
    const el = inputFromEvent(e);
    if (el && vis(el) && (credKind(el) || likelyUser(el))) return;
    setTimeout(dismissAutofillMenuIfNeeded, 0);
  }, true);

  document.addEventListener('focusout', () => {
    setTimeout(dismissAutofillMenuIfNeeded, 150);
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
    v.pendingPickId = null;
    return { pick: id };
  }
  const f = v.focusedField;
  if (!f) return null;
  if (document.getElementById('axis-vault-autofill-menu')) {
    const active = document.activeElement;
    const menu = document.getElementById('axis-vault-autofill-menu');
    const onMenu = menu && active && menu.contains(active);
    const onCred =
      active &&
      active.tagName === 'INPUT' &&
      (function () {
        const t = (active.type || 'text').toLowerCase();
        const ac = (active.autocomplete || '').toLowerCase();
        if (t === 'password' || ac.includes('password')) return true;
        if (t === 'email' || ac.includes('username') || ac === 'email') return true;
        return false;
      })();
    if (!onMenu && !onCred) {
      v.hideMenu && v.hideMenu();
      return null;
    }
    return { focus: f, focusKey: v.focusKey || '', menuOpen: true };
  }
  if (Date.now() - (v.focusAt || 0) > 8000) return null;
  return { focus: f, focusKey: v.focusKey || '' };
  } catch (_) { return null; }
})()`;

const AXIS_VAULT_AUTOFILL_HIDE_JS = `(function(){
  try {
  if (window.__axisVault) {
    window.__axisVault.focusedField = null;
    window.__axisVault.hideMenu && window.__axisVault.hideMenu();
  }
  } catch (_) {}
})()`;

function buildVaultAutofillThemeJs(theme) {
  const th = theme === 'light' ? 'light' : 'dark';
  return `window.__axisVaultUiTheme=${JSON.stringify(th)};`;
}

function buildVaultAutofillShowMenuJs(items, theme) {
  const json = JSON.stringify(Array.isArray(items) ? items : []);
  const th = theme === 'light' ? 'light' : 'dark';
  return `(function(){
    window.__axisVaultUiTheme=${JSON.stringify(th)};
    var v=window.__axisVault;
    if(!v)return;
    var el=v.focusAnchor;
    if(!el||el.tagName!=="INPUT"||el.disabled){
      el=document.activeElement;
    }
    if(!el||el.tagName!=="INPUT"){
      el=document.querySelector('input[type="password"],input[autocomplete*="password"],input[type="email"]');
    }
    if(el)v.showMenu(el,${json});
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

module.exports = {
  AXIS_VAULT_AUTOFILL_STYLE_CSS,
  AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS,
  AXIS_VAULT_AUTOFILL_PROBE_JS,
  AXIS_VAULT_AUTOFILL_HIDE_JS,
  buildVaultAutofillThemeJs,
  buildVaultAutofillShowMenuJs,
  buildVaultAutofillFillLoginJs
};
