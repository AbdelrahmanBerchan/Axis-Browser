'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (_) {}

let dpapi = null;
try {
  dpapi = require('@primno/dpapi');
} catch (_) {}

const CHROMIUM_KEYCHAIN = {
  chrome: { service: 'Chrome Safe Storage', account: 'Chrome' },
  edge: { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  brave: { service: 'Brave Safe Storage', account: 'Brave' },
  chromium: { service: 'Chromium Safe Storage', account: 'Chromium' },
  arc: { service: 'Arc Safe Storage', account: 'Arc' },
  opera: { service: 'Opera Safe Storage', account: 'Opera' },
  vivaldi: { service: 'Vivaldi Safe Storage', account: 'Vivaldi' }
};

const KEYCHAIN_FALLBACKS = [
  { service: 'Chrome Safe Storage', account: 'Chrome' },
  { service: 'Chromium Safe Storage', account: 'Chromium' },
  { service: 'Brave Safe Storage', account: 'Brave' },
  { service: 'Microsoft Edge Safe Storage', account: 'Microsoft Edge' },
  { service: 'Arc Safe Storage', account: 'Arc' },
  { service: 'Opera Safe Storage', account: 'Opera' },
  { service: 'Vivaldi Safe Storage', account: 'Vivaldi' }
];

function pathExists(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function querySqliteDb(dbPath, sql, params = []) {
  if (!DatabaseSync || !pathExists(dbPath)) return [];
  const tmp = path.join(os.tmpdir(), `axis-secrets-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  try {
    fs.copyFileSync(dbPath, tmp);
    try {
      fs.copyFileSync(`${dbPath}-wal`, `${tmp}-wal`);
    } catch (_) {}
    try {
      fs.copyFileSync(`${dbPath}-shm`, `${tmp}-shm`);
    } catch (_) {}
    const db = new DatabaseSync(tmp, { readonly: true });
    const stmt = db.prepare(sql);
    const rows = params.length > 0 ? stmt.all(...params) : stmt.all();
    db.close();
    return rows;
  } catch (_) {
    return [];
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
    try {
      fs.unlinkSync(`${tmp}-wal`);
    } catch (_) {}
    try {
      fs.unlinkSync(`${tmp}-shm`);
    } catch (_) {}
  }
}

function readKeychainPassword(service, account) {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync(
      'security',
      ['find-generic-password', '-w', '-s', service, '-a', account],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }
    );
    const pass = String(out || '').trim();
    return pass || null;
  } catch (_) {
    return null;
  }
}

function resolveKeychainPassword(browserId) {
  const mapped = browserId ? CHROMIUM_KEYCHAIN[browserId] : null;
  if (mapped) {
    const pass = readKeychainPassword(mapped.service, mapped.account);
    if (pass) return pass;
  }
  for (const entry of KEYCHAIN_FALLBACKS) {
    const pass = readKeychainPassword(entry.service, entry.account);
    if (pass) return pass;
  }
  return null;
}

function pbkdf2Key16(password) {
  return crypto.pbkdf2Sync(String(password), 'saltysalt', 1003, 16, 'sha1');
}

function decryptDpapi(buffer) {
  if (!dpapi || !buffer?.length) return null;
  try {
    return Buffer.from(dpapi.Dpapi.unprotectData(buffer, null, 'CurrentUser'));
  } catch (_) {
    return null;
  }
}

function decryptLocalStateMasterKey(userDataPath, keychainPassword) {
  const localStatePath = path.join(userDataPath, 'Local State');
  const localState = readJsonFile(localStatePath);
  const encKeyB64 = localState?.os_crypt?.encrypted_key;
  if (!encKeyB64) return null;
  let encKey;
  try {
    encKey = Buffer.from(encKeyB64, 'base64');
  } catch (_) {
    return null;
  }
  if (encKey.length < 6) return null;

  if (process.platform === 'win32' && encKey.subarray(0, 5).toString() === 'DPAPI') {
    return decryptDpapi(encKey.subarray(5));
  }

  if (process.platform === 'darwin' && keychainPassword) {
    const key16 = pbkdf2Key16(keychainPassword);
    const payload = encKey.subarray(3);
    const decrypted = decryptAes128Cbc(payload, key16);
    if (decrypted && decrypted.length >= 16) return decrypted;
  }

  if (process.platform === 'linux' && keychainPassword) {
    const key16 = pbkdf2Key16(keychainPassword);
    const payload = encKey.subarray(3);
    const decrypted = decryptAes128Cbc(payload, key16);
    if (decrypted && decrypted.length >= 16) return decrypted;
  }

  return null;
}

function decryptAes128Cbc(payload, key16) {
  if (!payload?.length || !key16) return null;
  try {
    const iv = Buffer.alloc(16, 0x20);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key16, iv);
    return Buffer.concat([decipher.update(payload), decipher.final()]);
  } catch (_) {
    return null;
  }
}

function decryptAes256Gcm(payload, masterKey) {
  if (!payload || payload.length < 29 || !masterKey) return '';
  try {
    const nonce = payload.subarray(0, 12);
    const tag = payload.subarray(-16);
    const ciphertext = payload.subarray(12, -16);
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch (_) {
    return '';
  }
}

function decryptChromiumBlob(encrypted, keys) {
  if (!encrypted) return '';
  const buf = Buffer.isBuffer(encrypted) ? encrypted : Buffer.from(encrypted);
  if (buf.length < 4) return '';
  const prefix = buf.subarray(0, 3).toString('utf8');
  if (!/^v\d\d$/.test(prefix)) return '';
  const payload = buf.subarray(3);
  if (!payload.length) return '';

  const key16 = keys.key16;
  const key32 = keys.key32;

  if (key16) {
    const cbc = decryptAes128Cbc(payload, key16);
    if (cbc?.length) {
      const text = cbc.toString('utf8').replace(/\0/g, '').trim();
      if (text) return text;
      const trimmed = cbc.length > 32 ? cbc.subarray(32).toString('utf8').replace(/\0/g, '').trim() : '';
      if (trimmed) return trimmed;
    }
  }

  if (key32) {
    const gcm = decryptAes256Gcm(payload, key32);
    if (gcm) return gcm;
  }

  if (key16) {
    const gcmKey = crypto.createHash('sha256').update(key16).digest();
    const gcm = decryptAes256Gcm(payload, gcmKey);
    if (gcm) return gcm;
  }

  return '';
}

function buildChromiumDecryptKeys(userDataPath, browserId) {
  const keychainPassword = resolveKeychainPassword(browserId);
  const key16 = keychainPassword ? pbkdf2Key16(keychainPassword) : null;
  let key32 = decryptLocalStateMasterKey(userDataPath, keychainPassword);
  if (key32 && key32.length === 16) {
    key32 = crypto.createHash('sha256').update(key32).digest();
  } else if (key32 && key32.length !== 32) {
    key32 = key32.length > 32 ? key32.subarray(0, 32) : null;
  }
  return { key16, key32, keychainPassword };
}

function normalizeOrigin(url) {
  const raw = String(url || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).origin;
  } catch (_) {
    return null;
  }
}

function readChromiumLogins(profilePath, userDataPath, browserId) {
  const loginDb = path.join(profilePath, 'Login Data');
  if (!pathExists(loginDb)) return [];
  const keys = buildChromiumDecryptKeys(userDataPath || path.dirname(profilePath), browserId);
  if (!keys.key16 && !keys.key32) return [];

  const rows = querySqliteDb(
    loginDb,
    `SELECT origin_url, username_value, password_value
     FROM logins
     WHERE username_value IS NOT NULL AND username_value != ''`
  );

  const logins = [];
  for (const row of rows) {
    const origin = normalizeOrigin(row.origin_url);
    const username = String(row.username_value || '').trim();
    const password = decryptChromiumBlob(row.password_value, keys);
    if (!origin || !username || !password) continue;
    logins.push({
      origin,
      username,
      password,
      title: (() => {
        try {
          return new URL(origin).hostname.replace(/^www\./i, '');
        } catch (_) {
          return '';
        }
      })()
    });
  }
  return logins;
}

function readChromiumCards(profilePath, userDataPath, browserId) {
  const webDataDb = path.join(profilePath, 'Web Data');
  if (!pathExists(webDataDb)) return [];
  const keys = buildChromiumDecryptKeys(userDataPath || path.dirname(profilePath), browserId);
  if (!keys.key16 && !keys.key32) return [];

  const rows = querySqliteDb(
    webDataDb,
    `SELECT name_on_card, expiration_month, expiration_year, card_number_encrypted, nickname
     FROM credit_cards`
  );

  const cards = [];
  for (const row of rows) {
    const number = decryptChromiumBlob(row.card_number_encrypted, keys).replace(/\D/g, '');
    if (!/^\d{13,19}$/.test(number)) continue;
    const cardholder = String(row.name_on_card || '').trim();
    if (!cardholder) continue;
    const expMonth = String(row.expiration_month || '').padStart(2, '0');
    const expYear = String(row.expiration_year || '').trim();
    if (!expMonth || !expYear) continue;
    cards.push({
      label: String(row.nickname || '').trim(),
      cardholder,
      number,
      expMonth,
      expYear,
      cvv: '',
      billingZip: ''
    });
  }
  return cards;
}

function readChromiumAddresses(profilePath) {
  const webDataDb = path.join(profilePath, 'Web Data');
  if (!pathExists(webDataDb)) return [];

  const profiles = querySqliteDb(
    webDataDb,
    `SELECT guid, company_name, street_address, dependent_locality, city, state, zipcode, country_code, label
     FROM autofill_profiles`
  );
  if (!profiles.length) return [];

  const names = querySqliteDb(
    webDataDb,
    `SELECT guid, first_name, middle_name, last_name, full_name FROM autofill_profile_names`
  );
  const emails = querySqliteDb(webDataDb, `SELECT guid, email FROM autofill_profile_emails`);
  const phones = querySqliteDb(webDataDb, `SELECT guid, number FROM autofill_profile_phones`);

  const nameByGuid = new Map();
  for (const row of names) {
    if (row?.guid && !nameByGuid.has(row.guid)) nameByGuid.set(row.guid, row);
  }
  const emailByGuid = new Map();
  for (const row of emails) {
    if (row?.guid && !emailByGuid.has(row.guid)) emailByGuid.set(row.guid, row);
  }
  const phoneByGuid = new Map();
  for (const row of phones) {
    if (row?.guid && !phoneByGuid.has(row.guid)) phoneByGuid.set(row.guid, row);
  }

  const addresses = [];
  const seen = new Set();
  for (const row of profiles) {
    const nameRow = nameByGuid.get(row.guid);
    let fullName = nameRow ? String(nameRow.full_name || '').trim() : '';
    if (!fullName && nameRow) {
      fullName = [nameRow.first_name, nameRow.middle_name, nameRow.last_name]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(' ')
        .trim();
    }

    const streetRaw = String(row.street_address || '').trim();
    const streetLines = streetRaw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const addressLine1 = streetLines[0] || '';
    let addressLine2 = streetLines.slice(1).join(', ').trim();
    const dependent = String(row.dependent_locality || '').trim();
    if (dependent && addressLine2) addressLine2 = `${addressLine2}, ${dependent}`;
    else if (dependent) addressLine2 = dependent;

    const city = String(row.city || '').trim();
    const postalCode = String(row.zipcode || '').trim();
    if (!fullName || !addressLine1 || !city || !postalCode) continue;

    const key = `${fullName.toLowerCase()}\0${addressLine1.toLowerCase()}\0${postalCode.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const emailRow = emailByGuid.get(row.guid);
    const phoneRow = phoneByGuid.get(row.guid);
    addresses.push({
      label: String(row.label || '').trim(),
      fullName,
      organization: String(row.company_name || '').trim(),
      addressLine1,
      addressLine2,
      city,
      state: String(row.state || '').trim(),
      postalCode,
      country: String(row.country_code || '').trim(),
      phone: phoneRow ? String(phoneRow.number || '').trim() : '',
      email: emailRow ? String(emailRow.email || '').trim() : ''
    });
  }
  return addresses;
}

function readFirefoxKey4MasterKey(profilePath) {
  const key4Path = path.join(profilePath, 'key4.db');
  const key3Path = path.join(profilePath, 'key3.db');
  const dbPath = pathExists(key4Path) ? key4Path : pathExists(key3Path) ? key3Path : null;
  if (!dbPath) return null;

  const rows = querySqliteDb(
    dbPath,
    `SELECT item1, item2 FROM metadata WHERE id = 'password' LIMIT 1`
  );
  if (!rows[0]?.item2) return null;

  const item2 = Buffer.from(rows[0].item2);
  return decryptFirefoxPbe(item2, '');
}

function decryptFirefoxPbe(item2, password) {
  try {
    const entrySalt = readAsn1OctetString(item2, 0);
    if (!entrySalt) return null;
    const cipherText = readAsn1OctetString(item2, entrySalt.next);
    if (!cipherText) return null;
    const key = crypto.pbkdf2Sync(password, entrySalt.value, 1, 24, 'sha1');
    const iv = Buffer.alloc(8);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    let decoded = Buffer.concat([decipher.update(cipherText.value), decipher.final()]);
    decoded = stripPkcs7(decoded);
    if (!decoded || decoded.length < 24) return null;
    return decoded.subarray(-24);
  } catch (_) {
    return null;
  }
}

function readAsn1OctetString(buf, offset) {
  if (!buf || offset >= buf.length) return null;
  if (buf[offset] !== 0x04) return null;
  let pos = offset + 1;
  let len = buf[pos++];
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[pos++];
  }
  const value = buf.subarray(pos, pos + len);
  return { value, next: pos + len };
}

function stripPkcs7(buf) {
  if (!buf?.length) return buf;
  const pad = buf[buf.length - 1];
  if (pad < 1 || pad > 32) return buf;
  return buf.subarray(0, buf.length - pad);
}

function decryptFirefoxLoginField(b64, masterKey) {
  if (!b64 || !masterKey) return '';
  let buf;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch (_) {
    return '';
  }
  try {
    const entrySalt = readAsn1OctetString(buf, 0);
    if (!entrySalt) return '';
    const cipherText = readAsn1OctetString(buf, entrySalt.next);
    if (!cipherText) return '';
    const key = crypto.pbkdf2Sync(masterKey, entrySalt.value, 1, 24, 'sha1');
    const iv = Buffer.alloc(8);
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    decipher.setAutoPadding(false);
    let decoded = Buffer.concat([decipher.update(cipherText.value), decipher.final()]);
    decoded = stripPkcs7(decoded);
    return decoded ? decoded.toString('utf8') : '';
  } catch (_) {
    return '';
  }
}

function readFirefoxLogins(profilePath) {
  const loginsPath = path.join(profilePath, 'logins.json');
  if (!pathExists(loginsPath)) return [];
  const data = readJsonFile(loginsPath);
  const entries = Array.isArray(data?.logins) ? data.logins : [];
  if (!entries.length) return [];

  const masterKey = readFirefoxKey4MasterKey(profilePath);
  if (!masterKey) return [];

  const logins = [];
  for (const entry of entries) {
    const origin = normalizeOrigin(entry.hostname || entry.origin);
    const username = decryptFirefoxLoginField(entry.encryptedUsername, masterKey);
    const password = decryptFirefoxLoginField(entry.encryptedPassword, masterKey);
    if (!origin || !username || !password) continue;
    logins.push({
      origin,
      username,
      password,
      title: (() => {
        try {
          return new URL(origin).hostname.replace(/^www\./i, '');
        } catch (_) {
          return '';
        }
      })()
    });
  }
  return logins;
}

function mapFirefoxAddressEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const given = String(entry['given-name'] || '').trim();
  const additional = String(entry['additional-name'] || '').trim();
  const family = String(entry['family-name'] || '').trim();
  let fullName = [given, additional, family].filter(Boolean).join(' ').trim();
  if (!fullName) fullName = String(entry.name || '').trim();

  let addressLine1 = String(entry['address-line1'] || '').trim();
  let addressLine2 = String(entry['address-line2'] || '').trim();
  const line3 = String(entry['address-line3'] || '').trim();
  if (line3) {
    addressLine2 = [addressLine2, line3].filter(Boolean).join(', ');
  }

  const street =
    entry['street-address'] != null
      ? String(entry['street-address'])
      : entry.streetAddress != null
        ? String(entry.streetAddress)
        : '';
  if (!addressLine1 && street) {
    const lines = street
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    addressLine1 = lines[0] || '';
    if (!addressLine2) addressLine2 = lines.slice(1).join(', ');
  }

  const city = String(entry['address-level2'] || entry.addressLevel2 || '').trim();
  const state = String(entry['address-level1'] || entry.addressLevel1 || '').trim();
  const postalCode = String(entry['postal-code'] || entry.postalCode || '').trim();
  if (!fullName || !addressLine1 || !city || !postalCode) return null;

  return {
    label: String(entry.label || '').trim(),
    fullName,
    organization: String(entry.organization || '').trim(),
    addressLine1,
    addressLine2,
    city,
    state,
    postalCode,
    country: String(entry.country || '').trim(),
    phone: String(entry.tel || '').trim(),
    email: String(entry.email || '').trim()
  };
}

function readFirefoxAddresses(profilePath) {
  const filePath = path.join(profilePath, 'autofill-profiles.json');
  if (!pathExists(filePath)) return [];
  const data = readJsonFile(filePath);
  const entries = Array.isArray(data?.addresses)
    ? data.addresses
    : Array.isArray(data?.profiles)
      ? data.profiles
      : [];
  const addresses = [];
  const seen = new Set();
  for (const entry of entries) {
    const mapped = mapFirefoxAddressEntry(entry);
    if (!mapped) continue;
    const key = `${mapped.fullName.toLowerCase()}\0${mapped.addressLine1.toLowerCase()}\0${mapped.postalCode.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    addresses.push(mapped);
  }
  return addresses;
}

function extractBrowserSecrets(source, options = {}) {
  const importPasswords = options.importPasswords !== false;
  const importCards = options.importCards !== false;
  const importAddresses = options.importAddresses !== false;
  if (!importPasswords && !importCards && !importAddresses) {
    return { logins: [], cards: [], addresses: [], warnings: [] };
  }

  const warnings = [];
  const engine = source.browserEngine;
  const profilePath = source.profilePath;
  const userDataPath = source.userDataPath || path.dirname(profilePath);
  const browserId = source.browserId || '';

  let logins = [];
  let cards = [];
  let addresses = [];

  if (engine === 'chromium') {
    if (importPasswords) {
      logins = readChromiumLogins(profilePath, userDataPath, browserId);
      if (logins.length === 0 && !resolveKeychainPassword(browserId) && process.platform === 'darwin') {
        warnings.push(
          'Could not read saved passwords — allow Keychain access for the source browser or quit it and try again.'
        );
      }
    }
    if (importCards) {
      cards = readChromiumCards(profilePath, userDataPath, browserId);
    }
    if (importAddresses) {
      addresses = readChromiumAddresses(profilePath);
    }
  } else if (engine === 'firefox') {
    if (importPasswords) {
      logins = readFirefoxLogins(profilePath);
      if (logins.length === 0 && pathExists(path.join(profilePath, 'logins.json'))) {
        warnings.push(
          'Firefox passwords could not be decrypted — profiles protected with a master password are not supported yet.'
        );
      }
    }
    if (importAddresses) {
      addresses = readFirefoxAddresses(profilePath);
    }
  }

  return { logins, cards, addresses, warnings };
}

module.exports = {
  extractBrowserSecrets,
  readChromiumLogins,
  readChromiumCards,
  readChromiumAddresses,
  readFirefoxLogins,
  readFirefoxAddresses
};
