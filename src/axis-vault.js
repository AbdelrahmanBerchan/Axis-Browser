'use strict';

const fs = require('fs');
const path = require('path');

const VAULT_VERSION = 2;

function vaultFilePathForProfile(app, profileId) {
  const id = String(profileId || 'personal')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 48) || 'personal';
  if (id === 'personal') {
    return path.join(app.getPath('userData'), 'axis-vault-v2.json');
  }
  return path.join(app.getPath('userData'), `axis-vault-v2-${id}.json`);
}

function emptyVaultPayload() {
  return { version: VAULT_VERSION, logins: [], cards: [] };
}

function normalizeVaultOrigin(raw) {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  try {
    return new URL(s.includes('://') ? s : `https://${s}`).origin;
  } catch (_) {
    return null;
  }
}

function hostKey(hostname) {
  if (!hostname || typeof hostname !== 'string') return '';
  return hostname.replace(/^www\./i, '').toLowerCase();
}

/** Loose site match (e.g. `accounts.google.com` ↔ `google.com`). */
function domainKey(hostname) {
  const h = hostKey(hostname);
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 2) return h;
  return parts.slice(-2).join('.');
}

function originsMatch(pageOrigin, savedOrigin) {
  if (!pageOrigin || !savedOrigin) return false;
  if (pageOrigin === savedOrigin) return true;
  try {
    const p = new URL(pageOrigin);
    const s = new URL(savedOrigin);
    if (hostKey(p.hostname) === hostKey(s.hostname)) return true;
    if (domainKey(p.hostname) === domainKey(s.hostname)) return true;
    const ph = p.hostname.toLowerCase();
    const sh = s.hostname.toLowerCase();
    if (ph.endsWith('.' + sh) || sh.endsWith('.' + ph)) return true;
  } catch (_) {}
  return false;
}

function newId() {
  return require('crypto').randomUUID();
}

function createAxisVault(app, _store, profileId = 'personal') {
  const vaultProfileId = profileId;
  /** @type {{ logins: object[], cards: object[] } | null} */
  let vaultData = null;

  function vaultFilePath() {
    return vaultFilePathForProfile(app, vaultProfileId);
  }

  function ensureLoaded() {
    if (vaultData) return vaultData;
    const fp = vaultFilePath();
    try {
      if (fs.existsSync(fp)) {
        const parsed = JSON.parse(fs.readFileSync(fp, 'utf8'));
        vaultData = {
          version: VAULT_VERSION,
          logins: Array.isArray(parsed.logins) ? parsed.logins : [],
          cards: Array.isArray(parsed.cards) ? parsed.cards : []
        };
        return vaultData;
      }
    } catch (_) {}
    vaultData = emptyVaultPayload();
    return vaultData;
  }

  function persist() {
    const data = ensureLoaded();
    const fp = vaultFilePath();
    fs.writeFileSync(fp, JSON.stringify(data), { mode: 0o600 });
  }

  function isConfigured() {
    ensureLoaded();
    return true;
  }

  function isUnlocked() {
    return true;
  }

  function listLogins() {
    const data = ensureLoaded();
    return data.logins.map((e) => ({
      id: e.id,
      origin: e.origin,
      username: e.username || '',
      title: e.title || '',
      updatedAt: e.updatedAt || e.createdAt || 0
    }));
  }

  function getLogin(id) {
    const data = ensureLoaded();
    const entry = data.logins.find((e) => e.id === id);
    if (!entry) throw new Error('Login not found');
    return { ...entry };
  }

  function saveLogin(entry) {
    const data = ensureLoaded();
    const origin = normalizeVaultOrigin(entry.origin);
    if (!origin) throw new Error('Invalid site URL');
    const username = String(entry.username || '').trim();
    if (!username) throw new Error('Username is required');
    const now = Date.now();
    let row = entry.id ? data.logins.find((e) => e.id === entry.id) : null;
    let password = String(entry.password || '');
    if (!password) {
      if (!row) throw new Error('Password is required');
      password = row.password;
    }
    if (row) {
      row.origin = origin;
      row.username = username;
      row.password = password;
      row.title = String(entry.title || '').trim();
      row.notes = String(entry.notes || '').trim();
      row.updatedAt = now;
    } else {
      let autoTitle = String(entry.title || '').trim();
      if (!autoTitle) {
        try {
          autoTitle = new URL(origin).hostname.replace(/^www\./i, '');
        } catch (_) {
          autoTitle = '';
        }
      }
      row = {
        id: newId(),
        origin,
        username,
        password,
        title: autoTitle,
        notes: String(entry.notes || '').trim(),
        createdAt: now,
        updatedAt: now
      };
      data.logins.push(row);
    }
    persist();
    return { id: row.id, origin: row.origin, username: row.username, title: row.title, updatedAt: row.updatedAt };
  }

  function deleteLogin(id) {
    const data = ensureLoaded();
    const before = data.logins.length;
    data.logins = data.logins.filter((e) => e.id !== id);
    if (data.logins.length === before) throw new Error('Login not found');
    persist();
    return true;
  }

  function maskCardNumber(num) {
    const digits = String(num || '').replace(/\D/g, '');
    if (digits.length < 4) return '••••';
    return `•••• ${digits.slice(-4)}`;
  }

  function listCards() {
    const data = ensureLoaded();
    return data.cards.map((c) => ({
      id: c.id,
      label: c.label || '',
      cardholder: c.cardholder || '',
      last4: String(c.number || '').replace(/\D/g, '').slice(-4),
      masked: maskCardNumber(c.number),
      expMonth: c.expMonth || '',
      expYear: c.expYear || '',
      updatedAt: c.updatedAt || c.createdAt || 0
    }));
  }

  function getCard(id) {
    const data = ensureLoaded();
    const card = data.cards.find((c) => c.id === id);
    if (!card) throw new Error('Card not found');
    return { ...card };
  }

  function saveCard(entry) {
    const data = ensureLoaded();
    const now = Date.now();
    let row = entry.id ? data.cards.find((c) => c.id === entry.id) : null;
    let number = String(entry.number || '').replace(/\s/g, '');
    if (!number && row) number = row.number;
    if (!/^\d{13,19}$/.test(number)) throw new Error('Enter a valid card number');
    const cardholder = String(entry.cardholder || '').trim();
    if (!cardholder) throw new Error('Cardholder name is required');
    const expMonth = String(entry.expMonth || '').padStart(2, '0');
    const expYear = String(entry.expYear || '').trim();
    if (!expMonth || !expYear) throw new Error('Expiration is required');
    let cvv = String(entry.cvv || '').trim();
    if (!cvv && row) cvv = row.cvv;
    if (row) {
      row.label = String(entry.label || '').trim();
      row.cardholder = cardholder;
      row.number = number;
      row.expMonth = expMonth;
      row.expYear = expYear;
      row.cvv = cvv;
      row.billingZip = String(entry.billingZip || '').trim();
      row.updatedAt = now;
    } else {
      row = {
        id: newId(),
        label: String(entry.label || '').trim(),
        cardholder,
        number,
        expMonth,
        expYear,
        cvv,
        billingZip: String(entry.billingZip || '').trim(),
        createdAt: now,
        updatedAt: now
      };
      data.cards.push(row);
    }
    persist();
    return { id: row.id, masked: maskCardNumber(row.number), label: row.label };
  }

  function deleteCard(id) {
    const data = ensureLoaded();
    const before = data.cards.length;
    data.cards = data.cards.filter((c) => c.id !== id);
    if (data.cards.length === before) throw new Error('Card not found');
    persist();
    return true;
  }

  function matchLogins(pageOrigin, usernameHint, pageUrl) {
    const data = ensureLoaded();
    const hint = usernameHint ? String(usernameHint).trim().toLowerCase() : '';
    let pageHost = '';
    let pageDomain = '';
    try {
      if (pageUrl) {
        const u = new URL(pageUrl);
        pageHost = hostKey(u.hostname);
        pageDomain = domainKey(u.hostname);
      }
    } catch (_) {}
    const forSite = data.logins.filter((e) => {
      if (originsMatch(pageOrigin, e.origin)) return true;
      if (!e.origin || !pageHost) return false;
      try {
        const saved = new URL(e.origin);
        const sh = hostKey(saved.hostname);
        const sd = domainKey(saved.hostname);
        if (sh === pageHost || sd === pageDomain) return true;
        if (pageHost.endsWith('.' + sh) || sh.endsWith('.' + pageHost)) return true;
      } catch (_) {}
      return false;
    });
    let filtered = hint
      ? forSite.filter((e) => String(e.username || '').toLowerCase().includes(hint))
      : forSite;
    if (!filtered.length) filtered = forSite;
    const list = filtered;
    return list.map((e) => ({
        id: e.id,
        origin: e.origin,
        username: e.username,
        password: e.password,
        title: e.title || ''
      }));
  }

  function matchCards() {
    const data = ensureLoaded();
    return data.cards.map((c) => ({
      id: c.id,
      label: c.label || '',
      cardholder: c.cardholder,
      number: c.number,
      expMonth: c.expMonth,
      expYear: c.expYear,
      cvv: c.cvv,
      billingZip: c.billingZip || '',
      masked: maskCardNumber(c.number)
    }));
  }

  function shouldOfferLoginSave({ origin, username, password }) {
    const data = ensureLoaded();
    const o = normalizeVaultOrigin(origin);
    if (!o) return false;
    const u = String(username || '').trim();
    const p = String(password || '');
    if (!u || !p) return false;
    const onSite = data.logins.filter((e) => originsMatch(o, e.origin));
    if (!onSite.length) return true;
    if (onSite.some((e) => e.username === u && e.password === p)) return false;
    return true;
  }

  function captureLogin({ origin, username, password, title }) {
    const data = ensureLoaded();
    const o = normalizeVaultOrigin(origin);
    if (!o) throw new Error('Invalid origin');
    const u = String(username || '').trim();
    const p = String(password || '');
    if (!u || !p) throw new Error('Missing credentials');
    const exact = data.logins.find(
      (e) => originsMatch(o, e.origin) && e.username === u && e.password === p
    );
    if (exact) {
      return { id: exact.id, updated: false };
    }
    const now = Date.now();
    let autoTitle = String(title || '').trim();
    if (!autoTitle) {
      try {
        autoTitle = new URL(o).hostname.replace(/^www\./i, '');
      } catch (_) {
        autoTitle = '';
      }
    }
    const row = {
      id: newId(),
      origin: o,
      username: u,
      password: p,
      title: autoTitle,
      notes: '',
      createdAt: now,
      updatedAt: now
    };
    data.logins.push(row);
    persist();
    return { id: row.id, updated: false };
  }

  function flushUnlocked() {
    persist();
  }

  return {
    vaultFilePath,
    profileId: vaultProfileId,
    ensureLoaded,
    isConfigured,
    isUnlocked,
    listLogins,
    getLogin,
    saveLogin,
    deleteLogin,
    listCards,
    getCard,
    saveCard,
    deleteCard,
    matchLogins,
    matchCards,
    shouldOfferLoginSave,
    captureLogin,
    flushUnlocked,
    normalizeVaultOrigin,
    originsMatch
  };
}

module.exports = { createAxisVault };
