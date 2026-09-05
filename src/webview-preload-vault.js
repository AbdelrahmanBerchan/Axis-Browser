'use strict';

/**
 * Guest preload: autofill + detect login/payment fields, offer save to host (sendToHost + main IPC).
 */
(function axisWebviewVaultPreload() {
  try {
    const { ipcRenderer } = require('electron');

    const FILLED_FLAG = 'data-axis-vault-filled';
    let lastFillOfferMs = 0;
    function notifyHost(channel, payload) {
      if (channel === 'axis-vault-save-offer' && payload) {
        ipcRenderer.invoke('axis-vault-report-credentials', payload).catch(() => {});
        try {
          ipcRenderer.sendToHost(channel, payload);
        } catch (_) {}
        return;
      }
      if (channel === 'axis-vault-autofill-request' && payload) {
        ipcRenderer.invoke('axis-vault-autofill-present', payload).catch(() => {});
      }
      try {
        ipcRenderer.sendToHost(channel, payload);
      } catch (_) {}
    }

    function vaultUiTheme() {
      try {
        const d = document.documentElement.getAttribute('data-axis-vault-theme');
        if (d === 'light' || d === 'dark') return d;
      } catch (_) {}
      return window.__axisVaultUiTheme === 'dark' ? 'dark' : 'light';
    }

    function pageOrigin() {
      try {
        return location.origin || '';
      } catch (_) {
        return '';
      }
    }

    function isVisibleInput(el) {
      if (!el || el.tagName !== 'INPUT' || el.disabled || el.readOnly) return false;
      const t = (el.type || 'text').toLowerCase();
      if (t === 'hidden' || t === 'submit' || t === 'button' || t === 'reset' || t === 'file') {
        return false;
      }
      try {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
      } catch (_) {}
      return true;
    }

    function formHasPassword(el) {
      try {
        const form = el && el.form;
        if (form && form.querySelector('input[type="password"]')) return true;
        // Do not treat "any password elsewhere on the page" as a login form signal.
        return false;
      } catch (_) {
        return false;
      }
    }

    function formHasAddressHints(el) {
      try {
        const root = (el && el.form) || document;
        const nodes = root.querySelectorAll
          ? root.querySelectorAll('input, select, textarea')
          : [];
        for (const node of nodes) {
          const ac = String(node.autocomplete || '').toLowerCase();
          const name = String(node.name || '').toLowerCase();
          const id = String(node.id || '').toLowerCase();
          if (
            ac.includes('street-address') ||
            ac.includes('address-line') ||
            ac.includes('postal-code') ||
            ac === 'address-level1' ||
            ac === 'address-level2' ||
            name.includes('address') ||
            name.includes('zip') ||
            name.includes('postal') ||
            id.includes('address') ||
            id.includes('zip') ||
            id.includes('postal')
          ) {
            return true;
          }
        }
      } catch (_) {}
      return false;
    }

    function isVisibleFillable(el) {
      if (!el || el.disabled || el.readOnly) return false;
      const tag = el.tagName;
      if (tag === 'SELECT' || tag === 'TEXTAREA') {
        try {
          const r = el.getBoundingClientRect();
          if (r.width < 2 || r.height < 2) return false;
        } catch (_) {}
        return true;
      }
      return isVisibleInput(el);
    }

    function inputKind(el) {
      const t = (el.type || 'text').toLowerCase();
      const ac = (el.autocomplete || '').toLowerCase();
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const ph = String(el.placeholder || '').toLowerCase();
      const aria = String(el.getAttribute('aria-label') || '').toLowerCase();
      const stable = String(
        el.getAttribute('data-elements-stable-field-name') || el.getAttribute('data-tid') || ''
      ).toLowerCase();
      if (t === 'password' || ac.includes('password') || name.includes('password') || id.includes('password')) {
        return 'password';
      }
      if (
        ac.includes('cc-number') ||
        ac === 'cc-number' ||
        stable === 'cardnumber' ||
        stable.includes('cardnumber') ||
        (name.includes('card') && name.includes('number')) ||
        (id.includes('card') && id.includes('number')) ||
        name.includes('cardnumber') ||
        id.includes('cardnumber') ||
        aria.includes('card number') ||
        ph.includes('card number')
      ) {
        return 'cc-number';
      }
      if (
        ac.includes('cc-name') ||
        name.includes('cardholder') ||
        name.includes('cc-name') ||
        id.includes('cardholder') ||
        id.includes('cc-name') ||
        aria.includes('name on card') ||
        aria.includes('cardholder') ||
        ((name.includes('name') || id.includes('name')) &&
          (name.includes('card') || id.includes('card') || ac.includes('cc-')))
      ) {
        return 'cc-name';
      }
      if (
        ac === 'cc-exp-month' ||
        name.includes('exp-month') ||
        name.includes('expmonth') ||
        id.includes('exp-month') ||
        id.includes('expmonth') ||
        stable.includes('cardexpirymonth')
      ) {
        return 'cc-exp-month';
      }
      if (
        ac === 'cc-exp-year' ||
        name.includes('exp-year') ||
        name.includes('expyear') ||
        id.includes('exp-year') ||
        id.includes('expyear') ||
        stable.includes('cardexpiryyear')
      ) {
        return 'cc-exp-year';
      }
      if (
        ac.includes('cc-exp') ||
        stable === 'cardexpiry' ||
        stable.includes('cardexpiry') ||
        aria.includes('expir') ||
        (ph.includes('mm') && ph.includes('yy')) ||
        ((name.includes('exp') || id.includes('exp')) &&
          (name.includes('card') ||
            id.includes('card') ||
            ac.includes('cc-') ||
            name.includes('expir') ||
            id.includes('expir') ||
            ph.includes('expir') ||
            aria.includes('expir')))
      ) {
        return 'cc-exp';
      }
      if (
        ac.includes('cc-csc') ||
        name.includes('cvv') ||
        name.includes('cvc') ||
        name.includes('cid') ||
        id.includes('cvv') ||
        id.includes('cvc') ||
        ph.includes('cvv') ||
        ph.includes('cvc') ||
        aria.includes('cvc') ||
        aria.includes('cvv') ||
        aria.includes('security code') ||
        stable.includes('cardcvc') ||
        stable === 'cvc'
      ) {
        return 'cc-csc';
      }
      if (
        ac === 'street-address' ||
        ac === 'address-line1' ||
        ac.includes('street-address') ||
        name.includes('address1') ||
        name.includes('address_1') ||
        name.includes('addr1') ||
        name.includes('street') ||
        id.includes('street') ||
        id.includes('address1') ||
        id.includes('address_1')
      ) {
        return 'addr-line1';
      }
      if (
        ac === 'address-line2' ||
        name.includes('address2') ||
        name.includes('address_2') ||
        name.includes('addr2') ||
        name.includes('apt') ||
        name.includes('suite') ||
        id.includes('address2') ||
        id.includes('address_2')
      ) {
        return 'addr-line2';
      }
      if (
        ac === 'address-level1' ||
        name === 'state' ||
        name.includes('province') ||
        name.includes('region') ||
        id.includes('state') ||
        id.includes('province')
      ) {
        return 'addr-state';
      }
      if (ac === 'address-level2' || name === 'city' || name.includes('city') || id.includes('city')) {
        return 'addr-city';
      }
      if (
        ac === 'postal-code' ||
        ac.includes('postal') ||
        name.includes('zip') ||
        name.includes('postal') ||
        id.includes('zip') ||
        id.includes('postal')
      ) {
        return 'addr-postal';
      }
      if (ac === 'country' || ac === 'country-name' || name === 'country' || id.includes('country')) {
        return 'addr-country';
      }
      if (ac === 'organization' || name.includes('company') || name.includes('organization') || id.includes('company')) {
        return 'addr-org';
      }
      if (ac === 'given-name' || name.includes('firstname') || name.includes('first_name') || name.includes('fname') || id.includes('firstname') || id.includes('first-name')) {
        return 'addr-name-given';
      }
      if (ac === 'family-name' || name.includes('lastname') || name.includes('last_name') || name.includes('lname') || id.includes('lastname') || id.includes('last-name')) {
        return 'addr-name-family';
      }
      if (ac === 'tel' || ac.includes('tel') || t === 'tel' || name.includes('phone') || id.includes('phone') || ph.includes('phone')) {
        if (!formHasPassword(el) || formHasAddressHints(el)) return 'addr-phone';
      }
      if (t === 'email' || ac === 'email' || name === 'email' || id.includes('email')) {
        if (formHasPassword(el) && !formHasAddressHints(el)) return 'username';
        return 'addr-email';
      }
      if (
        ac.includes('username') ||
        name.includes('username') ||
        name.includes('login') ||
        id.includes('username') ||
        id.includes('login')
      ) {
        return 'username';
      }
      if (ac === 'name' && !ac.includes('cc-')) {
        return 'addr-name';
      }
      return null;
    }

    function isAddressFieldKind(k) {
      return (
        k === 'addr-line1' ||
        k === 'addr-line2' ||
        k === 'addr-state' ||
        k === 'addr-city' ||
        k === 'addr-postal' ||
        k === 'addr-country' ||
        k === 'addr-org' ||
        k === 'addr-name' ||
        k === 'addr-name-given' ||
        k === 'addr-name-family' ||
        k === 'addr-phone' ||
        k === 'addr-email'
      );
    }

    function allVisibleInputs() {
      return Array.from(document.querySelectorAll('input')).filter(isVisibleInput);
    }

    function findUsernameForPassword(passwordEl) {
      const form = passwordEl.form;
      if (form) {
        for (const el of form.querySelectorAll('input')) {
          if (!isVisibleInput(el) || el === passwordEl) continue;
          if (inputKind(el) === 'username') return el;
        }
        const formInputs = Array.from(form.querySelectorAll('input')).filter(isVisibleInput);
        const pi = formInputs.indexOf(passwordEl);
        for (let i = pi - 1; i >= 0; i--) {
          const t = (formInputs[i].type || 'text').toLowerCase();
          if (t === 'text' || t === 'email' || t === 'tel') return formInputs[i];
        }
      }
      const all = allVisibleInputs();
      const pi = all.indexOf(passwordEl);
      for (let i = pi - 1; i >= 0; i--) {
        if (inputKind(all[i]) === 'username') return all[i];
        const t = (all[i].type || 'text').toLowerCase();
        if (t === 'text' || t === 'email' || t === 'tel') return all[i];
      }
      const email = document.querySelector('input[type="email"]');
      if (email && isVisibleInput(email)) return email;
      return null;
    }

    function findUsernameForLogin(passEl) {
      let userEl = findUsernameForPassword(passEl);
      if (userEl) return userEl;
      const form = passEl && passEl.form;
      if (form) {
        for (const el of form.querySelectorAll('input')) {
          if (!isVisibleInput(el) || el === passEl) continue;
          const t = (el.type || 'text').toLowerCase();
          if (t === 'email' || t === 'tel' || t === 'text' || t === 'search') return el;
        }
      }
      return (
        document.querySelector('input[type="email"]') ||
        document.querySelector('input[autocomplete="username"]') ||
        document.querySelector('input[autocomplete="email"]')
      );
    }

    function scanLoginCredentials() {
      const origin = pageOrigin();
      let username = '';
      let password = '';
      const passwords = allVisibleInputs().filter((el) => inputKind(el) === 'password');
      for (const passEl of passwords) {
        const pw = String(passEl.value || '');
        if (pw.length < 1) continue;
        password = pw;
        const userEl = findUsernameForLogin(passEl);
        username = userEl ? String(userEl.value || '').trim() : '';
        if (!username) {
          const email = document.querySelector('input[type="email"]');
          if (email && isVisibleInput(email)) {
            username = String(email.value || '').trim();
          }
        }
        if (username) break;
      }
      if (!password) {
        for (const el of allVisibleInputs()) {
          if (inputKind(el) === 'password' && String(el.value || '').length) {
            password = String(el.value || '');
            break;
          }
        }
      }
      if (!username) {
        for (const el of allVisibleInputs()) {
          if (inputKind(el) === 'username' || (el.type || '').toLowerCase() === 'email') {
            const u = String(el.value || '').trim();
            if (u) {
              username = u;
              break;
            }
          }
        }
      }
      // Merge short-lived stash for form-clearing sites and two-step logins.
      if (loginStash.origin === origin && Date.now() - loginStash.at < 10 * 60 * 1000) {
        if (!username && loginStash.username) username = loginStash.username;
        if (!password && loginStash.password) password = loginStash.password;
        // Prefer the complete stashed pair when the page wiped one field after Sign in.
        if (loginStash.username && loginStash.password) {
          if (!username) username = loginStash.username;
          if (!password) password = loginStash.password;
        }
      }
      if (!username || !password) return null;
      return {
        type: 'login',
        origin,
        pageUrl: location.href,
        username,
        password,
        title: document.title || ''
      };
    }

    function parseExpValue(raw) {
      const s = String(raw || '').trim();
      const m = s.match(/(\d{1,2})\s*[/\-\s]\s*(\d{2,4})/);
      if (!m) return { expMonth: '', expYear: '' };
      let month = m[1].padStart(2, '0');
      let year = m[2];
      if (year.length === 2) year = '20' + year;
      return { expMonth: month, expYear: year };
    }

    function scanCardCredentials() {
      const inputs = allVisibleInputs();
      let numberEl = null;
      let cardholderEl = null;
      let expEl = null;
      let expMonthEl = null;
      let expYearEl = null;
      let cvvEl = null;
      for (const el of inputs) {
        const k = inputKind(el);
        if (k === 'cc-number' && !numberEl) numberEl = el;
        if (k === 'cc-name' && !cardholderEl) cardholderEl = el;
        if (k === 'cc-exp' && !expEl) expEl = el;
        if (k === 'cc-exp-month' && !expMonthEl) expMonthEl = el;
        if (k === 'cc-exp-year' && !expYearEl) expYearEl = el;
        if (k === 'cc-csc' && !cvvEl) cvvEl = el;
      }
      if (!numberEl) return null;
      const number = String(numberEl.value || '').replace(/\D/g, '');
      if (number.length < 13) return null;
      const cardholder = cardholderEl ? String(cardholderEl.value || '').trim() : '';
      if (!cardholder) return null;
      let expMonth = '';
      let expYear = '';
      if (expEl && String(expEl.value || '').trim()) {
        ({ expMonth, expYear } = parseExpValue(expEl.value));
      }
      if ((!expMonth || !expYear) && (expMonthEl || expYearEl)) {
        expMonth = String(expMonthEl?.value || '')
          .replace(/\D/g, '')
          .padStart(2, '0')
          .slice(-2);
        let y = String(expYearEl?.value || '').replace(/\D/g, '');
        if (y.length === 2) y = '20' + y;
        expYear = y;
      }
      if (!expMonth || !expYear || expMonth === '00') return null;
      return {
        type: 'card',
        label: '',
        cardholder,
        number,
        expMonth,
        expYear,
        cvv: cvvEl ? String(cvvEl.value || '').trim() : '',
        billingZip: '',
        masked: `•••• ${number.slice(-4)}`
      };
    }

    function scanAddressCredentials() {
      const inputs = allVisibleInputs();
      const fields = {};
      for (const el of inputs) {
        const k = inputKind(el);
        if (!k || !isAddressFieldKind(k)) continue;
        const val = String(el.value || '').trim();
        if (!val) continue;
        if (!fields[k]) fields[k] = val;
      }
      const fullName =
        fields['addr-name'] ||
        [fields['addr-name-given'], fields['addr-name-family']].filter(Boolean).join(' ').trim();
      if (!fields['addr-line1'] || !fullName) return null;
      if (!fields['addr-city'] && !fields['addr-postal']) return null;
      return {
        type: 'address',
        label: '',
        fullName,
        organization: fields['addr-org'] || '',
        addressLine1: fields['addr-line1'],
        addressLine2: fields['addr-line2'] || '',
        city: fields['addr-city'] || '',
        state: fields['addr-state'] || '',
        postalCode: fields['addr-postal'] || '',
        country: fields['addr-country'] || '',
        phone: fields['addr-phone'] || '',
        email: fields['addr-email'] || '',
        summary: [fields['addr-line1'], fields['addr-city'] || fields['addr-postal']]
          .filter(Boolean)
          .join(', ')
      };
    }

    function credentialsMatchRecentAutofill(creds) {
      const mark = window.__axisVaultLastAutofill;
      if (!mark || Date.now() - mark.at > 120000) return false;
      const editedAt = Number(window.__axisVaultCredentialEditAt || 0);
      if (editedAt > mark.at + 80) return false;
      if (creds.type === 'card' || mark.kind === 'card') {
        const last4 = String(creds.number || '').replace(/\D/g, '').slice(-4);
        return mark.kind === 'card' && mark.last4 === last4 && last4.length === 4;
      }
      if (creds.type === 'address' || mark.kind === 'address') {
        return (
          mark.kind === 'address' &&
          String(mark.line1 || '').toLowerCase() === String(creds.addressLine1 || '').toLowerCase() &&
          String(mark.postal || '').toLowerCase() === String(creds.postalCode || '').toLowerCase()
        );
      }
      const fp = passwordMatchFingerprint(creds.password || '');
      return (
        mark.origin === creds.origin &&
        mark.username === creds.username &&
        !!fp &&
        mark.passwordFp === fp
      );
    }

    function passwordMatchFingerprint(password) {
      const s = String(password || '');
      if (!s) return '';
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return `${s.length}:${(h >>> 0).toString(16)}`;
    }

    function markAutofillUsed(cred) {
      if (!cred) return;
      if (cred.type === 'card' || cred.number) {
        window.__axisVaultLastAutofill = {
          at: Date.now(),
          kind: 'card',
          last4: String(cred.number || '').replace(/\D/g, '').slice(-4)
        };
        return;
      }
      if (cred.type === 'address' || cred.addressLine1) {
        window.__axisVaultLastAutofill = {
          at: Date.now(),
          kind: 'address',
          line1: cred.addressLine1 || '',
          postal: cred.postalCode || ''
        };
        return;
      }
      window.__axisVaultLastAutofill = {
        at: Date.now(),
        kind: 'login',
        origin: cred.origin || pageOrigin(),
        username: cred.username || '',
        passwordFp: passwordMatchFingerprint(cred.password || '')
      };
    }

    const SAVE_OFFER_DEBOUNCE_MS = 1800;
    let saveOfferTimer = null;
    let saveOfferBlurTimer = null;
    let saveOfferRetryTimer = null;
    let lastSaveOfferSentKey = '';
    let lastSaveOfferSentAt = 0;
    const loginStash = { origin: '', username: '', password: '', at: 0 };
    // Pending password for late-mounted fields — isolated-world only (never page window).
    let pendingLoginFill = null;

    function syncLoginStashToWindow() {
      // Do not mirror passwords onto page-accessible globals.
      try {
        window.__axisVaultLoginStash = {
          origin: loginStash.origin,
          username: loginStash.username,
          at: loginStash.at
        };
      } catch (_) {}
    }

    function updateLoginStashFromField(el) {
      if (!el) return;
      const k = resolveFieldKind(el) || inputKind(el);
      if (k !== 'username' && k !== 'password') return;
      const origin = pageOrigin();
      if (loginStash.origin && loginStash.origin !== origin) {
        loginStash.username = '';
        loginStash.password = '';
      }
      loginStash.origin = origin;
      loginStash.at = Date.now();
      if (k === 'username') {
        const v = String(el.value || '').trim();
        if (v) loginStash.username = v;
      } else if (k === 'password') {
        const v = String(el.value || '');
        if (v) loginStash.password = v;
      }
      syncLoginStashToWindow();
    }

    function touchCredentialEdit() {
      window.__axisVaultCredentialEditAt = Date.now();
      try {
        document.documentElement.setAttribute(
          'data-axis-vault-cred-edit-at',
          String(window.__axisVaultCredentialEditAt)
        );
      } catch (_) {}
    }

    function shouldSkipDuplicateSaveOffer(key) {
      if (!key) return false;
      if (key === lastSaveOfferSentKey && Date.now() - lastSaveOfferSentAt < 25000) return true;
      return false;
    }

    function markSaveOfferSent(key) {
      lastSaveOfferSentKey = key;
      lastSaveOfferSentAt = Date.now();
    }

    function saveOfferKeyForLogin(creds) {
      return `login:${creds.origin || pageOrigin()}:${creds.username}:${(creds.password || '').length}`;
    }

    function saveOfferKeyForCard(creds) {
      // Cards are global - never key by page origin.
      return `card:${String(creds.number || '').replace(/\D/g, '').slice(-4)}:${creds.expMonth}:${creds.expYear}`;
    }

    function saveOfferKeyForAddress(creds) {
      // Addresses are global - never key by page origin.
      return `address:${String(creds.postalCode || '').toLowerCase()}:${String(creds.addressLine1 || '').toLowerCase()}`;
    }

    async function offerLoginSave(creds) {
      if (!creds || !creds.username || !creds.password) return;
      if (credentialsMatchRecentAutofill(creds)) return;
      const key = saveOfferKeyForLogin(creds);
      if (shouldSkipDuplicateSaveOffer(key)) return;
      let offer = true;
      try {
        const gate = await ipcRenderer.invoke('axis-vault-should-offer-login-save', creds);
        offer = gate?.offer !== false;
      } catch (_) {
        offer = true;
      }
      if (!offer) return;
      markSaveOfferSent(key);
      notifyHost('axis-vault-save-offer', { ...creds, vaultSavePrechecked: true });
    }

    async function offerCardSave(creds) {
      if (!creds || !creds.number || !creds.cardholder) return;
      if (credentialsMatchRecentAutofill(creds)) return;
      const key = saveOfferKeyForCard(creds);
      if (shouldSkipDuplicateSaveOffer(key)) return;
      let offer = true;
      try {
        const gate = await ipcRenderer.invoke('axis-vault-should-offer-card-save', creds);
        offer = gate?.offer !== false;
      } catch (_) {
        offer = true;
      }
      if (!offer) return;
      markSaveOfferSent(key);
      notifyHost('axis-vault-save-offer', { ...creds, vaultSavePrechecked: true });
    }

    async function offerAddressSave(creds) {
      if (!creds || !creds.fullName || !creds.addressLine1) return;
      if (credentialsMatchRecentAutofill(creds)) return;
      const key = saveOfferKeyForAddress(creds);
      if (shouldSkipDuplicateSaveOffer(key)) return;
      let offer = true;
      try {
        const gate = await ipcRenderer.invoke('axis-vault-should-offer-address-save', creds);
        offer = gate?.offer !== false;
      } catch (_) {
        offer = true;
      }
      if (!offer) return;
      markSaveOfferSent(key);
      notifyHost('axis-vault-save-offer', { ...creds, vaultSavePrechecked: true });
    }

    function tryOfferSaves() {
      const login = scanLoginCredentials();
      if (login) void offerLoginSave(login);
      const card = scanCardCredentials();
      if (card) void offerCardSave(card);
      const address = scanAddressCredentials();
      if (address) void offerAddressSave(address);
    }

    /** Card/address only - login saves wait for blur / Enter / Sign in / navigation. */
    function scheduleSaveOfferAfterTyping() {
      touchCredentialEdit();
      if (saveOfferBlurTimer) {
        clearTimeout(saveOfferBlurTimer);
        saveOfferBlurTimer = null;
      }
      if (saveOfferTimer) clearTimeout(saveOfferTimer);
      saveOfferTimer = setTimeout(() => {
        saveOfferTimer = null;
        const card = scanCardCredentials();
        if (card) offerCardSave(card);
        const address = scanAddressCredentials();
        if (address) void offerAddressSave(address);
      }, SAVE_OFFER_DEBOUNCE_MS);
    }

    function scheduleSaveOfferAfterLeavingFields() {
      if (saveOfferBlurTimer) clearTimeout(saveOfferBlurTimer);
      saveOfferBlurTimer = setTimeout(() => {
        saveOfferBlurTimer = null;
        const active = document.activeElement;
        // Still in username/password - wait until they leave the login fields.
        if (isCredentialInput(active)) {
          const k = resolveFieldKind(active) || inputKind(active);
          if (k === 'username' || k === 'password') return;
        }
        if (saveOfferTimer) {
          clearTimeout(saveOfferTimer);
          saveOfferTimer = null;
        }
        captureAllLoginFieldsToStash();
        tryOfferSaves();
      }, 350);
    }

    function captureAllLoginFieldsToStash() {
      try {
        for (const el of allVisibleInputs()) {
          const k = resolveFieldKind(el) || inputKind(el);
          if (k === 'username' || k === 'password') updateLoginStashFromField(el);
        }
      } catch (_) {}
    }

    function flushSaveOfferCheck(opts = {}) {
      if (saveOfferBlurTimer) {
        clearTimeout(saveOfferBlurTimer);
        saveOfferBlurTimer = null;
      }
      if (saveOfferTimer) {
        clearTimeout(saveOfferTimer);
        saveOfferTimer = null;
      }
      // Capture whatever is still in the fields before SPAs clear the form.
      try {
        const active = document.activeElement;
        if (isCredentialInput(active)) updateLoginStashFromField(active);
      } catch (_) {}
      captureAllLoginFieldsToStash();
      tryOfferSaves();
      // Sign-in / navigation often clears the form a beat later - stash still has the pair.
      if (opts.andAgain !== false) {
        if (saveOfferRetryTimer) clearTimeout(saveOfferRetryTimer);
        saveOfferRetryTimer = setTimeout(() => {
          saveOfferRetryTimer = null;
          captureAllLoginFieldsToStash();
          tryOfferSaves();
        }, 500);
      }
    }

    function onCredentialFieldInput(el) {
      const k = resolveFieldKind(el) || inputKind(el);
      updateLoginStashFromField(el);
      touchCredentialEdit();
      if (k === 'password') {
        if (!(el.value || '').length) {
          if (saveOfferTimer) {
            clearTimeout(saveOfferTimer);
            saveOfferTimer = null;
          }
          return;
        }
        // Keep stash warm while typing; do not offer save until commit (blur/Enter/submit).
        return;
      }
      if (k === 'username') {
        return;
      }
      if (
        k === 'cc-number' ||
        k === 'cc-csc' ||
        k === 'cc-name' ||
        k === 'cc-exp' ||
        k === 'cc-exp-month' ||
        k === 'cc-exp-year' ||
        isAddressFieldKind(k)
      ) {
        scheduleSaveOfferAfterTyping();
      }
    }

    function findFormFields(form) {
      const inputs = form ? Array.from(form.querySelectorAll('input')) : [];
      const out = { username: null, password: null };
      for (const el of inputs) {
        if (!isVisibleInput(el)) continue;
        const k = inputKind(el);
        if (k === 'username' && !out.username) out.username = el;
        if (k === 'password' && !out.password) out.password = el;
      }
      if (!out.username && out.password) out.username = findUsernameForPassword(out.password);
      return out;
    }

    function dispatchInputEvents(el) {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function setFieldValue(el, value) {
      if (!el || value == null) return;
      const str = String(value);
      try {
        el.focus();
      } catch (_) {}
      if (el.tagName === 'SELECT') {
        const options = Array.from(el.options || []);
        let match = options.find((o) => String(o.value).toLowerCase() === str.toLowerCase());
        if (!match) {
          match = options.find((o) => String(o.textContent || '').trim().toLowerCase() === str.toLowerCase());
        }
        if (!match && str.length === 2) {
          match = options.find((o) => String(o.value).toLowerCase().startsWith(str.toLowerCase()));
        }
        if (match) el.value = match.value;
        else el.value = str;
      } else {
        try {
          const proto = Object.getPrototypeOf(el);
          const desc = Object.getOwnPropertyDescriptor(proto, 'value');
          if (desc && desc.set) desc.set.call(el, str);
          else el.value = str;
        } catch (_) {
          el.value = str;
        }
      }
      el.setAttribute(FILLED_FLAG, '1');
      try {
        el.dispatchEvent(
          new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: str })
        );
      } catch (_) {
        dispatchInputEvents(el);
        return;
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function fillLogin(cred, anchorEl) {
      const root = anchorEl && anchorEl.form ? anchorEl.form : document;
      let pass =
        (anchorEl && resolveFieldKind(anchorEl) === 'password' ? anchorEl : null) ||
        (root.querySelector && root.querySelector('input[type="password"]')) ||
        null;
      // Always also search the whole page - username/password often live in different forms.
      if (!pass || !isVisibleInput(pass)) {
        pass =
          allVisibleInputs().find((el) => (resolveFieldKind(el) || inputKind(el)) === 'password') ||
          document.querySelector('input[type="password"]') ||
          document.querySelector('input[autocomplete*="password"]');
      }
      let userEl = null;
      if (anchorEl && (resolveFieldKind(anchorEl) === 'username' || isLikelyUsernameField(anchorEl))) {
        userEl = anchorEl;
      } else if (pass) {
        userEl = findUsernameForPassword(pass) || findUsernameForLogin(pass);
      }
      if (!userEl) {
        const scoped = fillableFields(root);
        userEl =
          scoped.find((el) => inputKind(el) === 'username') ||
          scoped.find((el) => (el.type || '').toLowerCase() === 'email') ||
          allVisibleInputs().find((el) => inputKind(el) === 'username') ||
          allVisibleInputs().find((el) => isLikelyUsernameField(el)) ||
          document.querySelector('input[type="email"]') ||
          document.querySelector('input[autocomplete="username"]');
      }
      if (userEl && cred.username) setFieldValue(userEl, cred.username);
      if (pass && cred.password) setFieldValue(pass, cred.password);
      // Keep pending so a two-step password field (or late-mounted input) still fills.
      if (cred.password) {
        pendingLoginFill = {
          at: Date.now(),
          origin: pageOrigin(),
          username: cred.username || '',
          password: cred.password || ''
        };
      }
      if (cred.password && (!pass || !isVisibleInput(pass))) {
        setTimeout(() => {
          const latePass =
            allVisibleInputs().find((el) => (resolveFieldKind(el) || inputKind(el)) === 'password') ||
            document.querySelector('input[type="password"]');
          if (latePass && !String(latePass.value || '')) setFieldValue(latePass, cred.password);
          if (cred.username) {
            const lateUser =
              (latePass && (findUsernameForPassword(latePass) || findUsernameForLogin(latePass))) ||
              allVisibleInputs().find((el) => inputKind(el) === 'username') ||
              document.querySelector('input[type="email"]');
            if (lateUser && !String(lateUser.value || '').trim()) setFieldValue(lateUser, cred.username);
          }
        }, 320);
      }
      markAutofillUsed({
        origin: pageOrigin(),
        username: cred.username,
        password: cred.password
      });
    }

    function fillableFields(root) {
      const scope = root && root.querySelectorAll ? root : document;
      return Array.from(scope.querySelectorAll('input, select, textarea')).filter(isVisibleFillable);
    }

    function splitFullName(fullName) {
      const parts = String(fullName || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
      if (!parts.length) return { given: '', family: '' };
      if (parts.length === 1) return { given: parts[0], family: '' };
      return { given: parts[0], family: parts.slice(1).join(' ') };
    }

    function fillCard(card, anchorEl) {
      const root = anchorEl && anchorEl.form ? anchorEl.form : document;
      for (const el of fillableFields(root)) {
        const k = inputKind(el);
        if (k === 'cc-number') setFieldValue(el, card.number);
        else if (k === 'cc-name') setFieldValue(el, card.cardholder);
        else if (k === 'cc-exp') {
          const exp =
            card.expMonth && card.expYear
              ? `${card.expMonth}/${String(card.expYear).slice(-2)}`
              : '';
          setFieldValue(el, exp);
        } else if (k === 'cc-exp-month') setFieldValue(el, card.expMonth);
        else if (k === 'cc-exp-year') {
          const y = String(card.expYear || '');
          const wantsShort = el.maxLength === 2 || String(el.getAttribute('placeholder') || '').includes('YY');
          setFieldValue(el, wantsShort && y.length >= 2 ? y.slice(-2) : y);
        } else if (k === 'cc-csc') setFieldValue(el, card.cvv);
        else if (k === 'addr-postal' && card.billingZip) setFieldValue(el, card.billingZip);
      }
      markAutofillUsed({
        type: 'card',
        number: card.number,
        cardholder: card.cardholder,
        expMonth: card.expMonth,
        expYear: card.expYear
      });
    }

    function fillAddress(address, anchorEl) {
      const root = anchorEl && anchorEl.form ? anchorEl.form : document;
      const names = splitFullName(address.fullName);
      for (const el of fillableFields(root)) {
        const k = inputKind(el);
        if (k === 'addr-name') setFieldValue(el, address.fullName);
        else if (k === 'addr-name-given') setFieldValue(el, names.given);
        else if (k === 'addr-name-family') setFieldValue(el, names.family);
        else if (k === 'addr-org') setFieldValue(el, address.organization);
        else if (k === 'addr-line1') setFieldValue(el, address.addressLine1);
        else if (k === 'addr-line2') setFieldValue(el, address.addressLine2);
        else if (k === 'addr-city') setFieldValue(el, address.city);
        else if (k === 'addr-state') setFieldValue(el, address.state);
        else if (k === 'addr-postal') setFieldValue(el, address.postalCode);
        else if (k === 'addr-country') setFieldValue(el, address.country);
        else if (k === 'addr-phone') setFieldValue(el, address.phone);
        else if (k === 'addr-email') setFieldValue(el, address.email);
      }
      markAutofillUsed({
        type: 'address',
        addressLine1: address.addressLine1,
        postalCode: address.postalCode,
        fullName: address.fullName
      });
    }

    function isLikelyUsernameField(el) {
      if (inputKind(el) === 'username') return true;
      const t = (el.type || 'text').toLowerCase();
      if (t === 'search' || t === 'hidden') return false;
      if (t !== 'text' && t !== 'email' && t !== 'tel') return false;
      const name = (el.name || '').toLowerCase();
      const id = (el.id || '').toLowerCase();
      const ph = (el.placeholder || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      const ac = (el.autocomplete || '').toLowerCase();
      if (
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
      const form = el.form;
      if (form && form.querySelector('input[type="password"]')) return true;
      return false;
    }

    function resolveFieldKind(el) {
      return inputKind(el) || (isLikelyUsernameField(el) ? 'username' : null);
    }

    function isCredentialInput(el) {
      if (!isVisibleFillable(el)) return false;
      const k = resolveFieldKind(el);
      return (
        k === 'username' ||
        k === 'password' ||
        k === 'cc-number' ||
        k === 'cc-name' ||
        k === 'cc-exp' ||
        k === 'cc-exp-month' ||
        k === 'cc-exp-year' ||
        k === 'cc-csc' ||
        isAddressFieldKind(k)
      );
    }

    function inputFromFocusEvent(e) {
      const path = typeof e.composedPath === 'function' ? e.composedPath() : [e.target];
      for (let i = 0; i < path.length; i++) {
        const node = path[i];
        if (!node || !node.tagName) continue;
        if (node.tagName === 'INPUT' && isVisibleInput(node)) return node;
        if ((node.tagName === 'SELECT' || node.tagName === 'TEXTAREA') && isVisibleFillable(node)) return node;
      }
      return null;
    }

    function findPasswordForUsername(userEl) {
      const form = userEl && userEl.form;
      if (form) {
        const pass = form.querySelector('input[type="password"]');
        if (pass && isVisibleInput(pass)) return pass;
      }
      return document.querySelector('input[type="password"]');
    }

    let autofillMenuEl = null;
    let autofillAnchor = null;
    let autofillHideTimer = null;

    function ensureVaultAutofillStyles() {
      try {
        const AXIS_VAULT_AUTOFILL_STYLE_CSS = "#axis-vault-autofill-menu{position:fixed;z-index:2147483647;margin:0;padding:10px;list-style:none;border:none;border-radius:20px;box-sizing:border-box;display:flex;flex-direction:column;gap:8px;max-height:340px;overflow-x:hidden;overflow-y:auto;font:13.5px/1.3 -apple-system,BlinkMacSystemFont,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;letter-spacing:-0.015em;-webkit-font-smoothing:antialiased;backdrop-filter:saturate(1.4) blur(24px);-webkit-backdrop-filter:saturate(1.4) blur(24px)}#axis-vault-autofill-menu[data-axis-theme=\"light\"]{background:rgba(250,250,252,.92);box-shadow:0 16px 48px rgba(0,0,0,.16),0 0 0 0.5px rgba(0,0,0,.06)}#axis-vault-autofill-menu[data-axis-theme=\"dark\"]{background:rgba(36,36,38,.92);box-shadow:0 16px 48px rgba(0,0,0,.5),0 0 0 0.5px rgba(255,255,255,.1)}#axis-vault-autofill-menu li{margin:0;padding:0;list-style:none}#axis-vault-autofill-menu button.axis-af-pill{display:flex;align-items:center;gap:12px;width:100%;min-height:44px;height:44px;padding:0 16px 0 12px;margin:0;border:none;border-radius:999px;cursor:pointer;text-align:left;box-sizing:border-box;font:inherit;color:inherit;transition:background .12s ease,transform .1s ease}#axis-vault-autofill-menu[data-axis-theme=\"light\"] button.axis-af-pill{background:#ebebef;color:#1d1d1f}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] button.axis-af-pill{background:#3a3a3c;color:#f5f5f7}#axis-vault-autofill-menu[data-axis-theme=\"light\"] button.axis-af-pill:hover,#axis-vault-autofill-menu[data-axis-theme=\"light\"] button.axis-af-pill:focus{background:#dedee3;outline:none;transform:translateY(-0.5px)}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] button.axis-af-pill:hover,#axis-vault-autofill-menu[data-axis-theme=\"dark\"] button.axis-af-pill:focus{background:#48484a;outline:none;transform:translateY(-0.5px)}#axis-vault-autofill-menu .axis-af-icon{flex:0 0 auto;width:26px;height:26px;border-radius:7px;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;line-height:1;overflow:hidden}#axis-vault-autofill-menu .axis-af-icon.is-initials{background:linear-gradient(145deg,#ffb340,#ff9f0a);color:#1d1d1f}#axis-vault-autofill-menu .axis-af-icon.is-glyph{background:transparent;color:inherit}#axis-vault-autofill-menu .axis-af-icon.is-favicon{background:#fff;box-shadow:inset 0 0 0 0.5px rgba(0,0,0,.12)}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af-icon.is-favicon{background:#2c2c2e;box-shadow:inset 0 0 0 0.5px rgba(255,255,255,.14)}#axis-vault-autofill-menu .axis-af-icon.is-favicon img{width:18px;height:18px;object-fit:contain;display:block;border-radius:4px}#axis-vault-autofill-menu .axis-af-icon.is-brand{background:transparent;overflow:visible}#axis-vault-autofill-menu .axis-af-icon svg{width:18px;height:18px;display:block}#axis-vault-autofill-menu .axis-af-mc{width:24px;height:24px;position:relative;display:inline-block}#axis-vault-autofill-menu .axis-af-mc:before,#axis-vault-autofill-menu .axis-af-mc:after{content:\"\";position:absolute;top:4px;width:14px;height:14px;border-radius:50%}#axis-vault-autofill-menu .axis-af-mc:before{left:0;background:#eb001b}#axis-vault-autofill-menu .axis-af-mc:after{right:0;background:#f79e1b;mix-blend-mode:multiply}#axis-vault-autofill-menu .axis-af-visa,#axis-vault-autofill-menu .axis-af-amex{width:26px;height:16px;border-radius:3px;display:inline-flex;align-items:center;justify-content:center;font-size:7px;font-weight:800;letter-spacing:.03em}#axis-vault-autofill-menu .axis-af-visa{background:#1a1f71;color:#fff}#axis-vault-autofill-menu .axis-af-amex{background:#2e77bb;color:#fff;font-size:6px}#axis-vault-autofill-menu .axis-af-row{flex:1 1 auto;min-width:0;display:flex;align-items:center;justify-content:space-between;gap:12px}#axis-vault-autofill-menu .axis-af-left,#axis-vault-autofill-menu .axis-af-right{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#axis-vault-autofill-menu .axis-af-left{flex:1 1 auto;display:flex;flex-direction:column;gap:1px;justify-content:center}#axis-vault-autofill-menu .axis-af-right{flex:0 1 auto;max-width:40%;text-align:right}#axis-vault-autofill-menu .axis-af-user,#axis-vault-autofill-menu .axis-af-title{font-size:13.5px;font-weight:600;letter-spacing:-0.015em;color:inherit}#axis-vault-autofill-menu .axis-af-sub,#axis-vault-autofill-menu .axis-af-meta{font-size:11.5px;font-weight:500;letter-spacing:-0.01em}#axis-vault-autofill-menu[data-axis-theme=\"light\"] .axis-af-sub,#axis-vault-autofill-menu[data-axis-theme=\"light\"] .axis-af-meta,#axis-vault-autofill-menu[data-axis-theme=\"light\"] .axis-af-muted{color:#6e6e73}#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af-sub,#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af-meta,#axis-vault-autofill-menu[data-axis-theme=\"dark\"] .axis-af-muted{color:#98989d}";
        let style = document.getElementById('axis-vault-autofill-style');
        if (!style) {
          style = document.createElement('style');
          style.id = 'axis-vault-autofill-style';
          (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = AXIS_VAULT_AUTOFILL_STYLE_CSS;
      } catch (_) {}
    }

    function hideAutofillMenu() {
      if (autofillHideTimer) {
        clearTimeout(autofillHideTimer);
        autofillHideTimer = null;
      }
      // Remove leftover in-page nodes only - never clear focusedField while the user
      // is still in a username/password box (shell menu needs that state to re-show).
      try {
        if (window.__axisVault && typeof window.__axisVault.hideMenu === 'function') {
          window.__axisVault.hideMenu();
        }
      } catch (_) {}
      if (autofillMenuEl && autofillMenuEl.parentNode) {
        autofillMenuEl.parentNode.removeChild(autofillMenuEl);
      }
      const leftover = document.getElementById('axis-vault-autofill-menu');
      if (leftover && leftover.parentNode) leftover.parentNode.removeChild(leftover);
      autofillMenuEl = null;
      autofillAnchor = null;
    }

    function dismissAutofillIfNotNeeded() {
      const menu = document.getElementById('axis-vault-autofill-menu');
      if (!menu && !autofillMenuEl) return;
      const active = document.activeElement;
      const m = menu || autofillMenuEl;
      if (m && active && m.contains(active)) return;
      if (isCredentialInput(active)) return;
      hideAutofillMenu();
      notifyHost('axis-vault-autofill-hide', {});
    }

    function positionAutofillMenu(menu, anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = rect.left;
      let top = rect.bottom + 4;
      const width = Math.max(160, Math.round(rect.width || 160));
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
      if (top + 168 > vh - 8) top = Math.max(8, rect.top - 4 - 140);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.width = `${width}px`;
      menu.style.minWidth = `${width}px`;
      menu.style.maxWidth = `${width}px`;
    }

    function showLoginAutofillMenu(anchorEl, logins) {
      if (window.__axisVault && typeof window.__axisVault.showMenu === 'function') {
        window.__axisVault.showMenu(anchorEl, logins, 'login');
        autofillMenuEl = document.getElementById('axis-vault-autofill-menu');
        autofillAnchor = anchorEl;
        return;
      }
      hideAutofillMenu();
      if (!logins || !logins.length) return;
      ensureVaultAutofillStyles();
      // Minimal fallback if inject bootstrap is unavailable.
      const menu = document.createElement('ul');
      menu.id = 'axis-vault-autofill-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('data-axis-theme', vaultUiTheme());
      for (const cred of logins) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'axis-af-pill';
        btn.setAttribute('role', 'option');
        btn.textContent = cred.username || cred.title || 'Saved account';
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideAutofillMenu();
          void (async () => {
            try {
              const full = await ipcRenderer.invoke('axis-vault-get-login-for-fill', cred.id);
              if (full) fillLogin(full, anchorEl);
            } catch (_) {}
          })();
        });
        li.appendChild(btn);
        menu.appendChild(li);
      }
      document.documentElement.appendChild(menu);
      positionAutofillMenu(menu, anchorEl);
      autofillMenuEl = menu;
      autofillAnchor = anchorEl;
    }

    function showCardAutofillMenu(anchorEl, cards) {
      if (window.__axisVault && typeof window.__axisVault.showMenu === 'function') {
        window.__axisVault.showMenu(anchorEl, cards, 'card');
        autofillMenuEl = document.getElementById('axis-vault-autofill-menu');
        autofillAnchor = anchorEl;
        return;
      }
      hideAutofillMenu();
      if (!cards || !cards.length) return;
      ensureVaultAutofillStyles();
      const menu = document.createElement('ul');
      menu.id = 'axis-vault-autofill-menu';
      menu.setAttribute('data-axis-theme', vaultUiTheme());
      for (const card of cards) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'axis-af-pill';
        btn.textContent = (card.label || card.cardholder || 'Card') + ' ' + (card.masked || '');
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideAutofillMenu();
          void (async () => {
            try {
              const full = await ipcRenderer.invoke('axis-vault-get-card-for-fill', card.id);
              if (full) fillCard(full, anchorEl);
            } catch (_) {}
          })();
        });
        li.appendChild(btn);
        menu.appendChild(li);
      }
      document.documentElement.appendChild(menu);
      positionAutofillMenu(menu, anchorEl);
      autofillMenuEl = menu;
      autofillAnchor = anchorEl;
    }

    function showAddressAutofillMenu(anchorEl, addresses) {
      if (window.__axisVault && typeof window.__axisVault.showMenu === 'function') {
        window.__axisVault.showMenu(anchorEl, addresses, 'address');
        autofillMenuEl = document.getElementById('axis-vault-autofill-menu');
        autofillAnchor = anchorEl;
        return;
      }
      hideAutofillMenu();
      if (!addresses || !addresses.length) return;
      ensureVaultAutofillStyles();
      const menu = document.createElement('ul');
      menu.id = 'axis-vault-autofill-menu';
      menu.setAttribute('data-axis-theme', vaultUiTheme());
      for (const addr of addresses) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'axis-af-pill';
        btn.textContent = addr.summary || addr.addressLine1 || addr.label || 'Address';
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideAutofillMenu();
          void (async () => {
            try {
              const full = await ipcRenderer.invoke('axis-vault-get-address-for-fill', addr.id);
              if (full) fillAddress(full, anchorEl);
            } catch (_) {}
          })();
        });
        li.appendChild(btn);
        menu.appendChild(li);
      }
      document.documentElement.appendChild(menu);
      positionAutofillMenu(menu, anchorEl);
      autofillMenuEl = menu;
      autofillAnchor = anchorEl;
    }

    async function requestAutofillMenu(el) {
      if (!el || document.activeElement !== el) {
        hideAutofillMenu();
        return;
      }
      const kind = resolveFieldKind(el);
      if (!kind) {
        hideAutofillMenu();
        return;
      }
      const t = String(el.type || 'text').toLowerCase();
      if (t === 'search') {
        hideAutofillMenu();
        return;
      }
      const now = Date.now();
      if (now - lastFillOfferMs < 80) return;
      lastFillOfferMs = now;
      const reqId = ++autofillRequestGen;

      const r = el.getBoundingClientRect();
      if (!(r.width >= 12) || !(r.height >= 8)) {
        hideAutofillMenu();
        return;
      }
      const query = {
        origin: pageOrigin(),
        pageUrl: location.href,
        rect: {
          left: r.left,
          top: r.top,
          bottom: r.bottom,
          right: r.right,
          width: r.width,
          height: r.height
        }
      };

      if (kind === 'username' || kind === 'password') {
        const userEl = kind === 'password' ? findUsernameForPassword(el) : el;
        query.kind = 'login';
        query.usernameHint = userEl ? String(userEl.value || '').trim() : '';
      } else if (
        kind === 'cc-number' ||
        kind === 'cc-name' ||
        kind === 'cc-exp' ||
        kind === 'cc-exp-month' ||
        kind === 'cc-exp-year' ||
        kind === 'cc-csc'
      ) {
        query.kind = 'card';
      } else if (isAddressFieldKind(kind)) {
        query.kind = 'address';
      } else {
        hideAutofillMenu();
        return;
      }

      // Shell owns the menu (favicons + design). Never paint an in-page fallback.
      hideAutofillMenu();
      try {
        await ipcRenderer.invoke('axis-vault-autofill-present', query);
      } catch (_) {}
      void reqId;
    }

    function tryAutofillOnFocus(el) {
      applyPendingLoginIfNeeded(el);
      void requestAutofillMenu(el);
    }

    function applyPendingLoginIfNeeded(el) {
      const pending = pendingLoginFill;
      if (!pending || !pending.password) return;
      if (Date.now() - (pending.at || 0) > 2 * 60 * 1000) {
        pendingLoginFill = null;
        return;
      }
      if (pending.origin && pending.origin !== pageOrigin()) {
        pendingLoginFill = null;
        return;
      }
      const k = resolveFieldKind(el) || inputKind(el);
      if (k === 'password') {
        setFieldValue(el, pending.password);
        if (pending.username) {
          const userEl =
            findUsernameForPassword(el) ||
            findUsernameForLogin(el) ||
            allVisibleInputs().find((u) => inputKind(u) === 'username') ||
            document.querySelector('input[type="email"]');
          if (userEl && !String(userEl.value || '').trim()) setFieldValue(userEl, pending.username);
        }
        pendingLoginFill = null;
        markAutofillUsed({
          origin: pageOrigin(),
          username: pending.username,
          password: pending.password
        });
        return;
      }
      if ((k === 'username' || isLikelyUsernameField(el)) && pending.username) {
        if (!String(el.value || '').trim()) setFieldValue(el, pending.username);
      }
    }

    let autofillRequestGen = 0;

    let autofillInputTimer = null;

    document.addEventListener(
      'change',
      (e) => {
        const el = e.target;
        if (!isVisibleFillable(el)) return;
        const k = resolveFieldKind(el) || inputKind(el);
        if (k === 'username' || k === 'password') updateLoginStashFromField(el);
      },
      true
    );

    document.addEventListener(
      'input',
      (e) => {
        const el = e.target;
        if (!isVisibleFillable(el)) return;
        const k = resolveFieldKind(el) || inputKind(el);
        if (
          k === 'username' ||
          k === 'password' ||
          k === 'cc-number' ||
          k === 'cc-name' ||
          k === 'cc-exp' ||
          k === 'cc-exp-month' ||
          k === 'cc-exp-year' ||
          k === 'cc-csc' ||
          isAddressFieldKind(k)
        ) {
          if (autofillInputTimer) clearTimeout(autofillInputTimer);
          autofillInputTimer = setTimeout(() => {
            autofillInputTimer = null;
            void tryAutofillOnFocus(el);
          }, 180);
          onCredentialFieldInput(el);
        }
      },
      true
    );

    document.addEventListener(
      'focusin',
      (e) => {
        if (autofillHideTimer) {
          clearTimeout(autofillHideTimer);
          autofillHideTimer = null;
        }
        const el = inputFromFocusEvent(e) || e.target;
        if (!isVisibleFillable(el) || !isCredentialInput(el)) {
          dismissAutofillIfNotNeeded();
          return;
        }
        void tryAutofillOnFocus(el);
      },
      true
    );

    document.addEventListener(
      'click',
      (e) => {
        const el = e.target;
        if (!isVisibleFillable(el)) {
          dismissAutofillIfNotNeeded();
          return;
        }
        const k = resolveFieldKind(el);
        if (
          k === 'username' ||
          k === 'password' ||
          k === 'cc-number' ||
          k === 'cc-name' ||
          k === 'cc-exp' ||
          k === 'cc-exp-month' ||
          k === 'cc-exp-year' ||
          k === 'cc-csc' ||
          isAddressFieldKind(k)
        ) {
          void tryAutofillOnFocus(el);
        } else {
          dismissAutofillIfNotNeeded();
        }
      },
      true
    );

    document.addEventListener(
      'mousedown',
      (e) => {
        const menu = document.getElementById('axis-vault-autofill-menu');
        if (!menu && !autofillMenuEl) return;
        const m = menu || autofillMenuEl;
        if (m.contains(e.target)) return;
        const el = e.target;
        if (el && el.tagName === 'INPUT' && isCredentialInput(el)) return;
        dismissAutofillIfNotNeeded();
      },
      true
    );

    document.addEventListener(
      'focusout',
      (e) => {
        const el = e.target;
        if (!isCredentialInput(el)) return;
        autofillHideTimer = setTimeout(() => {
          autofillHideTimer = null;
          dismissAutofillIfNotNeeded();
        }, 150);
        const k = inputKind(el);
        if (
          k === 'password' ||
          k === 'username' ||
          k === 'cc-csc' ||
          k === 'cc-number' ||
          k === 'cc-name' ||
          k === 'cc-exp' ||
          k === 'cc-exp-month' ||
          k === 'cc-exp-year' ||
          isAddressFieldKind(k)
        ) {
          scheduleSaveOfferAfterLeavingFields();
        }
      },
      true
    );

    window.addEventListener(
      'scroll',
      () => {
        if (autofillMenuEl && autofillAnchor) positionAutofillMenu(autofillMenuEl, autofillAnchor);
      },
      true
    );

    document.addEventListener('submit', () => flushSaveOfferCheck(), true);

    function isLikelyLoginSubmitControl(el) {
      if (!el || !el.tagName) return false;
      const node =
        typeof el.closest === 'function'
          ? el.closest('button, input[type="submit"], input[type="button"], input[type="image"], [role="button"], a')
          : el;
      if (!node || !node.tagName) return false;
      const tag = node.tagName.toUpperCase();
      const type = String(node.type || '').toLowerCase();
      if (tag === 'INPUT' && (type === 'submit' || type === 'image')) return true;
      if (tag === 'BUTTON' && (type === 'submit' || !type || type === 'button')) {
        /* fall through to label check */
      } else if (tag !== 'A' && node.getAttribute?.('role') !== 'button' && !(tag === 'INPUT' && type === 'button')) {
        if (!(tag === 'BUTTON')) return false;
      }
      const label = `${node.textContent || ''} ${node.value || ''} ${node.getAttribute?.('aria-label') || ''} ${node.getAttribute?.('name') || ''}`.toLowerCase();
      return /sign\s*in|log\s*in|logon|log\s*on|submit|continue|next|verify|authent|create\s*account|register|join|done|confirm|unlock|get\s*started/.test(label);
    }

    document.addEventListener(
      'click',
      (e) => {
        if (isLikelyLoginSubmitControl(e.target)) flushSaveOfferCheck();
      },
      true
    );

    window.addEventListener('pagehide', () => flushSaveOfferCheck());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushSaveOfferCheck();
    });

    document.addEventListener(
      'keydown',
      (e) => {
        if (e.key === 'Escape') {
          hideAutofillMenu();
          return;
        }
        if (e.key !== 'Enter') return;
        const el = e.target;
        if (!isVisibleInput(el)) return;
        const k = inputKind(el);
        if (
          k === 'password' ||
          k === 'cc-csc' ||
          k === 'cc-number' ||
          k === 'cc-name' ||
          k === 'cc-exp' ||
          k === 'cc-exp-month' ||
          k === 'cc-exp-year' ||
          k === 'username' ||
          isAddressFieldKind(k)
        ) {
          flushSaveOfferCheck();
        }
      },
      true
    );

    ipcRenderer.on('axis-vault-show-autofill', (_ev, data) => {
      if (!data || !Array.isArray(data.items) || !data.items.length) return;
      const el = document.activeElement;
      if (!el || !isVisibleFillable(el)) return;
      if (autofillHideTimer) {
        clearTimeout(autofillHideTimer);
        autofillHideTimer = null;
      }
      if (data.kind === 'card') showCardAutofillMenu(el, data.items);
      else if (data.kind === 'address') showAddressAutofillMenu(el, data.items);
      else showLoginAutofillMenu(el, data.items);
    });

    ipcRenderer.on('axis-vault-apply-login', (_ev, cred) => {
      if (!cred) return;
      const anchor =
        (window.__axisVault && window.__axisVault.focusAnchor) ||
        document.activeElement;
      fillLogin(cred, anchor && anchor.tagName === 'INPUT' ? anchor : null);
    });

    ipcRenderer.on('axis-vault-apply-card', (_ev, card) => {
      if (!card) return;
      const anchor =
        document.querySelector('input[autocomplete*="cc-number"]') ||
        allVisibleInputs().find((el) => inputKind(el) === 'cc-number');
      fillCard(card, anchor);
    });

    ipcRenderer.on('axis-vault-apply-address', (_ev, address) => {
      if (!address) return;
      const anchor =
        document.querySelector('input[autocomplete*="street-address"],input[autocomplete*="address-line1"]') ||
        allVisibleInputs().find((el) => inputKind(el) === 'addr-line1');
      fillAddress(address, anchor);
    });

    ipcRenderer.on('axis-vault-scan-now', () => {
      flushSaveOfferCheck();
    });
  } catch (_) {
    /* guest preload unavailable */
  }
})();
