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
    if (ac.includes('username') || name.includes('user') || name.includes('login') || id.includes('user') || id.includes('login')) return 'username';
    return null;
  }

  function isCardKind(k) {
    return k === 'cc-number' || k === 'cc-name' || k === 'cc-exp' || k === 'cc-exp-month' || k === 'cc-exp-year' || k === 'cc-csc';
  }

  function isAddressKind(k) {
    return k === 'addr-line1' || k === 'addr-line2' || k === 'addr-state' || k === 'addr-city' || k === 'addr-postal' || k === 'addr-country' || k === 'addr-org' || k === 'addr-name' || k === 'addr-name-given' || k === 'addr-name-family' || k === 'addr-phone' || k === 'addr-email';
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
  }

  function shouldKeepAutofillMenu() {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return false;
    const active = document.activeElement;
    if (active && menu.contains(active)) return true;
    if (active && vis(active) && (fillKind(active) || likelyUser(active))) return true;
    if (api.menuAnchor && document.contains(api.menuAnchor) && fillKind(api.menuAnchor)) return true;
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

  function showMenu(anchor, items, offerKind) {
    hideMenu();
    anchor = anchor || api.focusAnchor;
    if (!anchor || !vis(anchor) || !items || !items.length) return;
    ensureStyles();
    const menu = document.createElement('ul');
    menu.id = MENU_ID;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('data-axis-theme', uiTheme());
    menu.setAttribute('data-axis-kind', offerKind || 'login');
    for (const row of items) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'option');
      const title = document.createElement('span');
      title.className = 'axis-af-title';
      const sub = document.createElement('span');
      sub.className = 'axis-af-sub';
      if (offerKind === 'card') {
        title.textContent = row.label || row.cardholder || 'Card';
        sub.textContent = row.masked || ('•••• ' + String(row.number || '').slice(-4));
        btn.appendChild(title);
        btn.appendChild(sub);
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideMenu();
          if (row.number) fillCard(row, anchor);
          else api.pendingPickId = row.id;
        });
      } else if (offerKind === 'address') {
        title.textContent = row.label || row.fullName || 'Address';
        sub.textContent = row.summary || row.addressLine1 || '';
        btn.appendChild(title);
        if (sub.textContent) btn.appendChild(sub);
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          hideMenu();
          if (row.addressLine1 || row.fullName) fillAddress(row, anchor);
          else api.pendingPickId = row.id;
        });
      } else {
        const username = row.username || '';
        title.textContent = username || row.title || 'Saved account';
        btn.appendChild(title);
        const subText = row.title && row.title !== username ? row.title : '';
        if (subText) {
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
      }
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
    fillLogin,
    fillCard,
    fillAddress,
    fillKind,
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
    api.focusedField = {
      kind: offer,
      origin: location.origin || '',
      pageUrl: location.href,
      usernameHint: offer === 'login' && userEl ? String(userEl.value || '').trim() : '',
      fieldKind: k
    };
    api.focusKey = offer + ':' + k + ':' + (el.id || el.name || '') + ':' + location.href;
    api.focusAt = Date.now();
  }

  document.addEventListener('focusin', (e) => {
    const el = inputFromEvent(e) || e.target;
    if (!vis(el) || (!fillKind(el) && !likelyUser(el))) {
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
    if (fillKind(el) || likelyUser(el)) noteFocus(el);
    else dismissAutofillMenuIfNeeded();
  }, true);

  document.addEventListener('mousedown', (e) => {
    const menu = document.getElementById(MENU_ID);
    if (!menu) return;
    if (menu.contains(e.target)) return;
    const el = inputFromEvent(e);
    if (el && vis(el) && (fillKind(el) || likelyUser(el))) return;
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
  const menu = document.getElementById('axis-vault-autofill-menu');
  if (menu) {
    const active = document.activeElement;
    const onMenu = active && menu.contains(active);
    const onFillField = (function () {
      if (!active || !v) return false;
      if (active === v.focusAnchor || active === v.menuAnchor) return true;
      try {
        if (typeof v.fillKind === 'function' && v.fillKind(active)) return true;
      } catch (_) {}
      const t = (active.type || 'text').toLowerCase();
      const ac = (active.autocomplete || '').toLowerCase();
      const name = (active.name || '').toLowerCase();
      const id = (active.id || '').toLowerCase();
      const aria = String(active.getAttribute('aria-label') || '').toLowerCase();
      if (t === 'password' || ac.includes('password')) return true;
      if (t === 'email' || ac.includes('username') || ac === 'email') return true;
      if (ac.includes('cc-') || name.includes('card') || id.includes('card') || name.includes('cvv') || name.includes('cvc') || aria.includes('card') || aria.includes('cvc') || aria.includes('expir')) return true;
      if (ac.includes('address') || ac.includes('postal') || name.includes('address') || name.includes('zip') || name.includes('city') || name.includes('state')) return true;
      return false;
    })();
    if (!onMenu && !onFillField) {
      v.hideMenu && v.hideMenu();
    } else {
      return {
        focus: f || { kind: menu.getAttribute('data-axis-kind') || 'login', origin: location.origin || '', pageUrl: location.href },
        focusKey: v.focusKey || '',
        focusAt: v.focusAt || Date.now(),
        menuOpen: true
      };
    }
  }
  if (!f) return null;
  if (Date.now() - (v.focusAt || 0) > 8000) return null;
  return { focus: f, focusKey: v.focusKey || '', focusAt: v.focusAt || 0 };
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

module.exports = {
  AXIS_VAULT_AUTOFILL_STYLE_CSS,
  AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS,
  AXIS_VAULT_AUTOFILL_PROBE_JS,
  AXIS_VAULT_AUTOFILL_HIDE_JS,
  buildVaultAutofillThemeJs,
  buildVaultAutofillShowMenuJs,
  buildVaultAutofillFillLoginJs
};
