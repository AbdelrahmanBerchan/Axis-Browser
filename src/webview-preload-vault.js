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
        return !!document.querySelector('input[type="password"]');
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
        name.includes('user') ||
        name.includes('login') ||
        id.includes('user') ||
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
      const passwords = allVisibleInputs().filter((el) => inputKind(el) === 'password');
      for (const passEl of passwords) {
        const password = String(passEl.value || '');
        if (password.length < 1) continue;
        const userEl = findUsernameForLogin(passEl);
        let username = userEl ? String(userEl.value || '').trim() : '';
        if (!username) {
          const email = document.querySelector('input[type="email"]');
          if (email && isVisibleInput(email)) {
            username = String(email.value || '').trim();
          }
        }
        if (!username) continue;
        return {
          type: 'login',
          origin: pageOrigin(),
          pageUrl: location.href,
          username,
          password,
          title: document.title || ''
        };
      }
      return null;
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
      let cvvEl = null;
      for (const el of inputs) {
        const k = inputKind(el);
        if (k === 'cc-number' && !numberEl) numberEl = el;
        if (k === 'cc-name' && !cardholderEl) cardholderEl = el;
        if (k === 'cc-exp' && !expEl) expEl = el;
        if (k === 'cc-csc' && !cvvEl) cvvEl = el;
      }
      if (!numberEl) return null;
      const number = String(numberEl.value || '').replace(/\D/g, '');
      if (number.length < 13) return null;
      const cardholder = cardholderEl ? String(cardholderEl.value || '').trim() : '';
      if (!cardholder) return null;
      const { expMonth, expYear } = parseExpValue(expEl ? expEl.value : '');
      if (!expMonth || !expYear) return null;
      return {
        type: 'card',
        origin: pageOrigin(),
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
      if (!fields['addr-line1'] || !fields['addr-city'] || !fields['addr-postal'] || !fields['addr-name']) {
        return null;
      }
      return {
        type: 'address',
        origin: pageOrigin(),
        label: '',
        fullName: fields['addr-name'],
        organization: fields['addr-org'] || '',
        addressLine1: fields['addr-line1'],
        addressLine2: fields['addr-line2'] || '',
        city: fields['addr-city'],
        state: fields['addr-state'] || '',
        postalCode: fields['addr-postal'],
        country: fields['addr-country'] || '',
        phone: '',
        email: '',
        summary: `${fields['addr-line1']}, ${fields['addr-city']}`
      };
    }

    function credentialsMatchRecentAutofill(creds) {
      const mark = window.__axisVaultLastAutofill;
      if (!mark || Date.now() - mark.at > 120000) return false;
      return (
        mark.origin === creds.origin &&
        mark.username === creds.username &&
        mark.password === creds.password
      );
    }

    function markAutofillUsed(cred) {
      if (!cred) return;
      window.__axisVaultLastAutofill = {
        at: Date.now(),
        origin: cred.origin || pageOrigin(),
        username: cred.username || '',
        password: cred.password || ''
      };
    }

    const SAVE_OFFER_DEBOUNCE_MS = 1800;
    let saveOfferTimer = null;
    let saveOfferBlurTimer = null;
    let lastSaveOfferSentKey = '';
    let lastSaveOfferSentAt = 0;

    function touchCredentialEdit() {
      window.__axisVaultCredentialEditAt = Date.now();
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
      return `card:${creds.origin || pageOrigin()}:${creds.number.slice(-4)}`;
    }

    function saveOfferKeyForAddress(creds) {
      return `address:${creds.origin || pageOrigin()}:${creds.postalCode}:${creds.addressLine1}`;
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

    function offerCardSave(creds) {
      if (!creds || !creds.number || !creds.cardholder) return;
      const key = saveOfferKeyForCard(creds);
      if (shouldSkipDuplicateSaveOffer(key)) return;
      markSaveOfferSent(key);
      notifyHost('axis-vault-save-offer', { ...creds, vaultSavePrechecked: true });
    }

    async function offerAddressSave(creds) {
      if (!creds || !creds.fullName || !creds.addressLine1) return;
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
      if (card) offerCardSave(card);
      const address = scanAddressCredentials();
      if (address) void offerAddressSave(address);
    }

    function scheduleSaveOfferAfterTyping() {
      touchCredentialEdit();
      if (saveOfferBlurTimer) {
        clearTimeout(saveOfferBlurTimer);
        saveOfferBlurTimer = null;
      }
      if (saveOfferTimer) clearTimeout(saveOfferTimer);
      saveOfferTimer = setTimeout(() => {
        saveOfferTimer = null;
        tryOfferSaves();
      }, SAVE_OFFER_DEBOUNCE_MS);
    }

    function scheduleSaveOfferAfterLeavingFields() {
      if (saveOfferBlurTimer) clearTimeout(saveOfferBlurTimer);
      saveOfferBlurTimer = setTimeout(() => {
        saveOfferBlurTimer = null;
        const active = document.activeElement;
        if (isCredentialInput(active)) {
          return;
        }
        if (saveOfferTimer) {
          clearTimeout(saveOfferTimer);
          saveOfferTimer = null;
        }
        tryOfferSaves();
      }, 450);
    }

    function flushSaveOfferCheck() {
      if (saveOfferBlurTimer) {
        clearTimeout(saveOfferBlurTimer);
        saveOfferBlurTimer = null;
      }
      if (saveOfferTimer) {
        clearTimeout(saveOfferTimer);
        saveOfferTimer = null;
      }
      tryOfferSaves();
    }

    function onCredentialFieldInput(el) {
      const k = resolveFieldKind(el) || inputKind(el);
      if (k === 'password') {
        if (!(el.value || '').length) {
          if (saveOfferTimer) {
            clearTimeout(saveOfferTimer);
            saveOfferTimer = null;
          }
          return;
        }
        scheduleSaveOfferAfterTyping();
        return;
      }
      if (k === 'username' || k === 'cc-number' || k === 'cc-csc' || isAddressFieldKind(k)) {
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
      el.focus();
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
        el.value = str;
      }
      el.setAttribute(FILLED_FLAG, '1');
      dispatchInputEvents(el);
    }

    function fillLogin(cred, anchorEl) {
      const fk = anchorEl ? resolveFieldKind(anchorEl) : null;

      if (fk === 'username') {
        if (anchorEl && cred.username) setFieldValue(anchorEl, cred.username);
        markAutofillUsed({
          origin: pageOrigin(),
          username: cred.username,
          password: ''
        });
        return;
      }

      if (fk === 'password') {
        const pass = anchorEl || document.querySelector('input[type="password"]');
        if (pass && cred.password) setFieldValue(pass, cred.password);
        markAutofillUsed({
          origin: pageOrigin(),
          username: cred.username,
          password: cred.password
        });
        return;
      }

      const pass = anchorEl && resolveFieldKind(anchorEl) === 'password'
        ? anchorEl
        : document.querySelector('input[type="password"]');
      const userEl =
        anchorEl && resolveFieldKind(anchorEl) === 'username'
          ? anchorEl
          : pass
            ? findUsernameForPassword(pass)
            : null;
      if (userEl && cred.username) setFieldValue(userEl, cred.username);
      if (pass && cred.password) setFieldValue(pass, cred.password);
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
    }

    function isLikelyUsernameField(el) {
      if (inputKind(el) === 'username') return true;
      const t = (el.type || 'text').toLowerCase();
      if (t !== 'text' && t !== 'email' && t !== 'tel' && t !== 'search') return false;
      const ph = (el.placeholder || '').toLowerCase();
      const aria = (el.getAttribute('aria-label') || '').toLowerCase();
      if (
        ph.includes('user') ||
        ph.includes('email') ||
        ph.includes('login') ||
        aria.includes('user') ||
        aria.includes('email') ||
        aria.includes('login')
      ) {
        return true;
      }
      const form = el.form;
      if (form && form.querySelector('input[type="password"]')) return true;
      return !!document.querySelector('input[type="password"]');
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
      if (document.getElementById('axis-vault-autofill-style')) return;
      try {
        const { AXIS_VAULT_AUTOFILL_STYLE_CSS } = require('./axis-vault-autofill-inject');
        const style = document.createElement('style');
        style.id = 'axis-vault-autofill-style';
        style.textContent = AXIS_VAULT_AUTOFILL_STYLE_CSS;
        (document.head || document.documentElement).appendChild(style);
      } catch (_) {}
    }

    function hideAutofillMenu() {
      if (autofillHideTimer) {
        clearTimeout(autofillHideTimer);
        autofillHideTimer = null;
      }
      if (window.__axisVault && typeof window.__axisVault.hideMenu === 'function') {
        window.__axisVault.hideMenu();
      } else if (autofillMenuEl && autofillMenuEl.parentNode) {
        autofillMenuEl.parentNode.removeChild(autofillMenuEl);
      }
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
      let top = rect.bottom + 6;
      const width = Math.max(240, rect.width);
      if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
      if (top + 200 > vh - 8) top = Math.max(8, rect.top - 8 - 120);
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
      menu.style.minWidth = `${width}px`;
    }

    function showLoginAutofillMenu(anchorEl, logins) {
      if (window.__axisVault && typeof window.__axisVault.showMenu === 'function') {
        window.__axisVault.showMenu(anchorEl, logins);
        autofillMenuEl = document.getElementById('axis-vault-autofill-menu');
        autofillAnchor = anchorEl;
        return;
      }
      hideAutofillMenu();
      if (!logins.length) return;
      ensureVaultAutofillStyles();
      const menu = document.createElement('ul');
      menu.className = 'axis-vault-autofill-menu';
      menu.id = 'axis-vault-autofill-menu';
      menu.setAttribute('role', 'listbox');
      menu.setAttribute('data-axis-theme', window.__axisVaultUiTheme === 'dark' ? 'dark' : 'light');
      for (const cred of logins) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'option');
        const title = document.createElement('span');
        title.className = 'axis-af-title';
        title.textContent = cred.username || cred.title || 'Saved account';
        btn.appendChild(title);
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideAutofillMenu();
          fillLogin(cred, anchorEl);
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
      hideAutofillMenu();
      if (!cards.length) return;
      ensureVaultAutofillStyles();
      const menu = document.createElement('ul');
      menu.className = 'axis-vault-autofill-menu';
      menu.id = 'axis-vault-autofill-menu';
      menu.setAttribute('data-axis-theme', window.__axisVaultUiTheme === 'dark' ? 'dark' : 'light');
      for (const card of cards) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'axis-vault-autofill-item';
        const title = document.createElement('span');
        title.className = 'axis-af-title';
        title.textContent = card.label || card.cardholder || 'Card';
        const sub = document.createElement('span');
        sub.className = 'axis-af-sub';
        sub.textContent = card.masked || `•••• ${String(card.number || '').slice(-4)}`;
        btn.appendChild(title);
        btn.appendChild(sub);
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideAutofillMenu();
          fillCard(card, anchorEl);
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
      hideAutofillMenu();
      if (!addresses.length) return;
      ensureVaultAutofillStyles();
      const menu = document.createElement('ul');
      menu.className = 'axis-vault-autofill-menu';
      menu.id = 'axis-vault-autofill-menu';
      menu.setAttribute('data-axis-theme', window.__axisVaultUiTheme === 'dark' ? 'dark' : 'light');
      for (const addr of addresses) {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'axis-vault-autofill-item';
        const title = document.createElement('span');
        title.className = 'axis-af-title';
        title.textContent = addr.label || addr.fullName || 'Address';
        const sub = document.createElement('span');
        sub.className = 'axis-af-sub';
        sub.textContent = addr.summary || addr.addressLine1 || '';
        btn.appendChild(title);
        btn.appendChild(sub);
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          hideAutofillMenu();
          fillAddress(addr, anchorEl);
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
      const kind = resolveFieldKind(el);
      if (!kind) {
        hideAutofillMenu();
        return;
      }
      const now = Date.now();
      if (now - lastFillOfferMs < 80) return;
      lastFillOfferMs = now;
      const reqId = ++autofillRequestGen;

      const query = {
        origin: pageOrigin(),
        pageUrl: location.href
      };

      if (kind === 'username' || kind === 'password') {
        const userEl = kind === 'password' ? findUsernameForPassword(el) : el;
        query.kind = 'login';
        query.usernameHint = userEl ? String(userEl.value || '').trim() : '';
        notifyHost('axis-vault-autofill-request', query);
        let res;
        try {
          res = await ipcRenderer.invoke('axis-vault-autofill-query', query);
        } catch (_) {
          hideAutofillMenu();
          return;
        }
        if (reqId !== autofillRequestGen) return;
        if (!res || !res.ok || !res.items || !res.items.length) {
          hideAutofillMenu();
          return;
        }
        if (autofillHideTimer) {
          clearTimeout(autofillHideTimer);
          autofillHideTimer = null;
        }
        showLoginAutofillMenu(el, res.items);
        return;
      }

      if (
        kind === 'cc-number' ||
        kind === 'cc-name' ||
        kind === 'cc-exp' ||
        kind === 'cc-exp-month' ||
        kind === 'cc-exp-year' ||
        kind === 'cc-csc'
      ) {
        query.kind = 'card';
        notifyHost('axis-vault-autofill-request', query);
        let res;
        try {
          res = await ipcRenderer.invoke('axis-vault-autofill-query', query);
        } catch (_) {
          hideAutofillMenu();
          return;
        }
        if (reqId !== autofillRequestGen) return;
        if (!res || !res.ok || !res.items || !res.items.length) {
          hideAutofillMenu();
          return;
        }
        if (autofillHideTimer) {
          clearTimeout(autofillHideTimer);
          autofillHideTimer = null;
        }
        showCardAutofillMenu(el, res.items);
        return;
      }

      if (isAddressFieldKind(kind)) {
        query.kind = 'address';
        notifyHost('axis-vault-autofill-request', query);
        let res;
        try {
          res = await ipcRenderer.invoke('axis-vault-autofill-query', query);
        } catch (_) {
          hideAutofillMenu();
          return;
        }
        if (reqId !== autofillRequestGen) return;
        if (!res || !res.ok || !res.items || !res.items.length) {
          hideAutofillMenu();
          return;
        }
        if (autofillHideTimer) {
          clearTimeout(autofillHideTimer);
          autofillHideTimer = null;
        }
        showAddressAutofillMenu(el, res.items);
      }
    }

    function tryAutofillOnFocus(el) {
      void requestAutofillMenu(el);
    }

    let autofillRequestGen = 0;

    let autofillInputTimer = null;

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
        if (k === 'password' || k === 'cc-csc' || k === 'cc-number' || isAddressFieldKind(k)) {
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
          k === 'username' ||
          isAddressFieldKind(k)
        ) {
          scheduleSaveOfferAfterLeavingFields();
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
      const editAt = window.__axisVaultCredentialEditAt || 0;
      if (Date.now() - editAt < SAVE_OFFER_DEBOUNCE_MS + 200) return;
      tryOfferSaves();
    });
  } catch (_) {
    /* guest preload unavailable */
  }
})();
