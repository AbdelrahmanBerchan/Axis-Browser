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

function asCryptBuffer(encrypted) {
  if (encrypted == null || encrypted === '') return null;
  if (Buffer.isBuffer(encrypted)) return encrypted;
  if (encrypted instanceof Uint8Array) return Buffer.from(encrypted);
  if (Array.isArray(encrypted)) return Buffer.from(encrypted);
  if (typeof encrypted === 'string') {
    // Preserve byte values 0–255 from SQLite TEXT/BLOB coercion.
    return Buffer.from(encrypted, 'latin1');
  }
  if (encrypted.type === 'Buffer' && Array.isArray(encrypted.data)) {
    return Buffer.from(encrypted.data);
  }
  try {
    return Buffer.from(encrypted);
  } catch (_) {
    return null;
  }
}

function decodeDecryptedSecret(buf) {
  if (!buf || !buf.length) return '';
  const utf8 = buf.toString('utf8').replace(/\0/g, '').trim();
  if (utf8) return utf8;
  // Some Chromium builds store EncryptString16 as UTF-16LE.
  if (buf.length >= 2 && buf.length % 2 === 0) {
    const utf16 = buf.toString('utf16le').replace(/\0/g, '').trim();
    if (utf16) return utf16;
  }
  return '';
}

function decryptChromiumBlob(encrypted, keys) {
  const buf = asCryptBuffer(encrypted);
  if (!buf || buf.length < 4) return '';
  const prefix = buf.subarray(0, 3).toString('utf8');
  if (!/^v\d\d$/.test(prefix)) return '';
  const payload = buf.subarray(3);
  if (!payload.length) return '';

  const key16 = keys.key16;
  const key32 = keys.key32;

  if (key16) {
    const cbc = decryptAes128Cbc(payload, key16);
    if (cbc?.length) {
      const text = decodeDecryptedSecret(cbc);
      if (text) return text;
      const trimmed =
        cbc.length > 32 ? decodeDecryptedSecret(cbc.subarray(32)) : '';
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

/** Chromium Autofill FieldType ints used in address_*_type_tokens. */
const CHROMIUM_ADDR_TYPES = {
  NAME_FIRST: 3,
  NAME_MIDDLE: 4,
  NAME_LAST: 5,
  NAME_FULL: 7,
  EMAIL_ADDRESS: 9,
  PHONE_HOME_WHOLE_NUMBER: 14,
  ADDRESS_HOME_LINE1: 30,
  ADDRESS_HOME_LINE2: 31,
  ADDRESS_HOME_CITY: 33,
  ADDRESS_HOME_STATE: 34,
  ADDRESS_HOME_ZIP: 35,
  ADDRESS_HOME_COUNTRY: 36,
  COMPANY_NAME: 60,
  ADDRESS_HOME_STREET_ADDRESS: 77,
  ADDRESS_HOME_DEPENDENT_LOCALITY: 81,
  ADDRESS_HOME_LINE3: 83
};

function addressDedupeKey(addr) {
  return `${String(addr.fullName || '').toLowerCase()}\0${String(addr.addressLine1 || '').toLowerCase()}\0${String(addr.postalCode || '').toLowerCase()}`;
}

function isImportableAddress(addr) {
  if (!addr) return false;
  const hasName = !!(addr.fullName || addr.organization);
  const hasStreet = !!addr.addressLine1;
  const hasPlace = !!(addr.city || addr.postalCode);
  return hasName && hasStreet && hasPlace;
}

function pushUniqueAddress(list, seen, addr) {
  if (!isImportableAddress(addr)) return;
  const key = addressDedupeKey(addr);
  if (seen.has(key)) return;
  seen.add(key);
  list.push(addr);
}

function normalizeImportedCvv(...candidates) {
  for (const raw of candidates) {
    if (raw == null) continue;
    const digits = String(raw).replace(/\D/g, '');
    if (/^\d{3,4}$/.test(digits)) return digits;
  }
  return '';
}

function normalizeImportedExpYear(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^\d{4}$/.test(s)) return s;
  if (/^\d{2}$/.test(s)) {
    const n = Number(s);
    // Chrome sometimes stores 2-digit years.
    return String(n >= 70 ? 1900 + n : 2000 + n);
  }
  return s;
}

function readChromiumStoredCvcMap(webDataDb, keys) {
  const byGuid = new Map();
  const byInstrumentId = new Map();

  for (const row of querySqliteDb(
    webDataDb,
    `SELECT guid, value_encrypted FROM local_stored_cvc`
  )) {
    const guid = String(row.guid || '').trim();
    if (!guid || byGuid.has(guid)) continue;
    const cvv = normalizeImportedCvv(decryptChromiumBlob(row.value_encrypted, keys));
    if (cvv) byGuid.set(guid, cvv);
  }

  for (const row of querySqliteDb(
    webDataDb,
    `SELECT CAST(instrument_id AS TEXT) AS instrument_id, value_encrypted FROM server_stored_cvc`
  )) {
    const id = String(row.instrument_id || '').trim();
    if (!id || byInstrumentId.has(id)) continue;
    const cvv = normalizeImportedCvv(decryptChromiumBlob(row.value_encrypted, keys));
    if (cvv) byInstrumentId.set(id, cvv);
  }

  return { byGuid, byInstrumentId };
}

function readChromiumUnmaskedNumberById(webDataDb, keys) {
  const byId = new Map();
  for (const row of querySqliteDb(
    webDataDb,
    `SELECT id, card_number_encrypted FROM unmasked_credit_cards`
  )) {
    const id = String(row.id || '').trim();
    if (!id) continue;
    const number = decryptChromiumBlob(row.card_number_encrypted, keys).replace(/\D/g, '');
    if (/^\d{13,19}$/.test(number)) byId.set(id, number);
  }
  return byId;
}

function readChromiumCards(profilePath, userDataPath, browserId) {
  const webDataDb = path.join(profilePath, 'Web Data');
  if (!pathExists(webDataDb)) return [];
  const keys = buildChromiumDecryptKeys(userDataPath || path.dirname(profilePath), browserId);
  if (!keys.key16 && !keys.key32) return [];

  // Prefer JOIN so CVC rides with the card row when Chromium stored it.
  let rows = querySqliteDb(
    webDataDb,
    `SELECT c.guid AS guid, c.name_on_card AS name_on_card, c.expiration_month AS expiration_month,
            c.expiration_year AS expiration_year, c.card_number_encrypted AS card_number_encrypted,
            c.nickname AS nickname, c.billing_address_id AS billing_address_id,
            cvc.value_encrypted AS cvc_value_encrypted
     FROM credit_cards c
     LEFT JOIN local_stored_cvc cvc ON cvc.guid = c.guid`
  );
  if (!rows.length) {
    rows = querySqliteDb(
      webDataDb,
      `SELECT guid, name_on_card, expiration_month, expiration_year, card_number_encrypted,
              nickname, billing_address_id
       FROM credit_cards`
    );
  }
  if (!rows.length) {
    rows = querySqliteDb(
      webDataDb,
      `SELECT name_on_card, expiration_month, expiration_year, card_number_encrypted, nickname
       FROM credit_cards`
    );
  }

  const zipByGuid = new Map();
  const addressByGuid = new Map();
  try {
    for (const a of collectChromiumAddresses(profilePath, { keepGuid: true })) {
      if (!a._guid) continue;
      addressByGuid.set(a._guid, a);
      if (a.postalCode) zipByGuid.set(a._guid, a.postalCode);
    }
  } catch (_) {}

  const cvcMaps = readChromiumStoredCvcMap(webDataDb, keys);
  const unmaskedById = readChromiumUnmaskedNumberById(webDataDb, keys);

  const cards = [];
  const seenNumbers = new Set();

  for (const row of rows) {
    let number = decryptChromiumBlob(row.card_number_encrypted, keys).replace(/\D/g, '');
    if (!/^\d{13,19}$/.test(number)) continue;
    if (seenNumbers.has(number)) continue;
    seenNumbers.add(number);
    let cardholder = String(row.name_on_card || '').trim();
    if (!cardholder) cardholder = `Card •••• ${number.slice(-4)}`;
    const expMonth = String(row.expiration_month || '').padStart(2, '0');
    const expYear = normalizeImportedExpYear(row.expiration_year);
    if (!/^\d{1,2}$/.test(String(row.expiration_month || '')) || !expYear) continue;
    const billingId = String(row.billing_address_id || '').trim();
    const guid = String(row.guid || '').trim();
    const billing = billingId ? addressByGuid.get(billingId) : null;
    const nickname = String(row.nickname || '').trim();
    const last4 = number.slice(-4);
    cards.push({
      label: nickname || `•••• ${last4}`,
      cardholder,
      number,
      expMonth,
      expYear,
      // Chromium stores this as CVC; Axis vault field is always `cvv`.
      cvv: normalizeImportedCvv(
        decryptChromiumBlob(row.cvc_value_encrypted, keys),
        guid ? cvcMaps.byGuid.get(guid) : '',
        row.cvc,
        row.cvv,
        row.card_cvc,
        row.security_code
      ),
      billingZip:
        (billingId ? zipByGuid.get(billingId) || '' : '') ||
        String(billing?.postalCode || '').trim()
    });
  }

  // Masked Google Pay / server cards only have a full PAN if Chromium cached one in unmasked_credit_cards.
  const masked = querySqliteDb(
    webDataDb,
    `SELECT id, name_on_card, network, last_four, exp_month, exp_year, nickname, bank_name, instrument_id
     FROM masked_credit_cards`
  );
  for (const row of masked) {
    const id = String(row.id || '').trim();
    const number = (id && unmaskedById.get(id)) || '';
    if (!/^\d{13,19}$/.test(number) || seenNumbers.has(number)) continue;
    seenNumbers.add(number);
    const last4 = String(row.last_four || number.slice(-4)).replace(/\D/g, '').slice(-4);
    const network = String(row.network || '').trim();
    const bank = String(row.bank_name || '').trim();
    const nickname = String(row.nickname || '').trim();
    let cardholder = String(row.name_on_card || '').trim();
    if (!cardholder) cardholder = nickname || `${network || 'Card'} •••• ${last4}`;
    const expMonth = String(row.exp_month || '').padStart(2, '0');
    const expYear = normalizeImportedExpYear(row.exp_year);
    if (!/^\d{1,2}$/.test(String(row.exp_month || '')) || !expYear) continue;
    const instrumentId = String(row.instrument_id || '').trim();
    cards.push({
      label: nickname || [network, bank].filter(Boolean).join(' · ') || `•••• ${last4}`,
      cardholder,
      number,
      expMonth,
      expYear,
      cvv: normalizeImportedCvv(instrumentId ? cvcMaps.byInstrumentId.get(instrumentId) : ''),
      billingZip: ''
    });
  }

  return cards;
}

function mapLegacyChromiumAddressRow(row, nameRow, emailRow, phoneRow) {
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

  return {
    _guid: String(row.guid || '').trim(),
    label: String(row.label || '').trim(),
    fullName,
    organization: String(row.company_name || '').trim(),
    addressLine1,
    addressLine2,
    city: String(row.city || '').trim(),
    state: String(row.state || '').trim(),
    postalCode: String(row.zipcode || '').trim(),
    country: String(row.country_code || '').trim(),
    phone: phoneRow ? String(phoneRow.number || '').trim() : '',
    email: emailRow ? String(emailRow.email || '').trim() : ''
  };
}

function readChromiumLegacyAddresses(webDataDb, addresses, seen) {
  const profiles = querySqliteDb(
    webDataDb,
    `SELECT guid, company_name, street_address, dependent_locality, city, state, zipcode, country_code, label
     FROM autofill_profiles`
  );
  if (!profiles.length) return;

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

  for (const row of profiles) {
    const mapped = mapLegacyChromiumAddressRow(
      row,
      nameByGuid.get(row.guid),
      emailByGuid.get(row.guid),
      phoneByGuid.get(row.guid)
    );
    pushUniqueAddress(addresses, seen, mapped);
  }
}

function tokensToAddress(guid, label, tokenMap) {
  const get = (type) => String(tokenMap.get(type) || '').trim();
  let fullName = get(CHROMIUM_ADDR_TYPES.NAME_FULL);
  if (!fullName) {
    fullName = [
      get(CHROMIUM_ADDR_TYPES.NAME_FIRST),
      get(CHROMIUM_ADDR_TYPES.NAME_MIDDLE),
      get(CHROMIUM_ADDR_TYPES.NAME_LAST)
    ]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  let addressLine1 = get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_LINE1);
  let addressLine2 = get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_LINE2);
  const line3 = get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_LINE3);
  if (line3) addressLine2 = [addressLine2, line3].filter(Boolean).join(', ');

  const streetBlock = get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_STREET_ADDRESS);
  if (!addressLine1 && streetBlock) {
    const lines = streetBlock
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    addressLine1 = lines[0] || '';
    if (!addressLine2) addressLine2 = lines.slice(1).join(', ');
  }

  const dependent = get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_DEPENDENT_LOCALITY);
  if (dependent) {
    addressLine2 = addressLine2 ? `${addressLine2}, ${dependent}` : dependent;
  }

  return {
    _guid: String(guid || '').trim(),
    label: String(label || '').trim(),
    fullName,
    organization: get(CHROMIUM_ADDR_TYPES.COMPANY_NAME),
    addressLine1,
    addressLine2,
    city: get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_CITY),
    state: get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_STATE),
    postalCode: get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_ZIP),
    country: get(CHROMIUM_ADDR_TYPES.ADDRESS_HOME_COUNTRY),
    phone: get(CHROMIUM_ADDR_TYPES.PHONE_HOME_WHOLE_NUMBER),
    email: get(CHROMIUM_ADDR_TYPES.EMAIL_ADDRESS)
  };
}

function readChromiumTokenAddresses(webDataDb, metaTable, tokensTable, addresses, seen) {
  const metas = querySqliteDb(webDataDb, `SELECT guid, label FROM ${metaTable}`);
  if (!metas.length) return;
  const tokens = querySqliteDb(webDataDb, `SELECT guid, type, value FROM ${tokensTable}`);
  const byGuid = new Map();
  for (const row of tokens) {
    if (!row?.guid || row.type == null) continue;
    if (!byGuid.has(row.guid)) byGuid.set(row.guid, new Map());
    const map = byGuid.get(row.guid);
    const type = Number(row.type);
    const value = String(row.value || '').trim();
    if (!value) continue;
    if (!map.has(type)) map.set(type, value);
  }
  for (const meta of metas) {
    const tokenMap = byGuid.get(meta.guid);
    if (!tokenMap || !tokenMap.size) continue;
    pushUniqueAddress(addresses, seen, tokensToAddress(meta.guid, meta.label, tokenMap));
  }
}

function collectChromiumAddresses(profilePath, { keepGuid = false } = {}) {
  const webDataDb = path.join(profilePath, 'Web Data');
  if (!pathExists(webDataDb)) return [];

  const addresses = [];
  const seen = new Set();

  // Modern Chrome: unified `addresses` / `address_type_tokens`, plus older local/account tables.
  readChromiumTokenAddresses(webDataDb, 'addresses', 'address_type_tokens', addresses, seen);
  readChromiumTokenAddresses(webDataDb, 'local_addresses', 'local_addresses_type_tokens', addresses, seen);
  readChromiumTokenAddresses(webDataDb, 'contact_info', 'contact_info_type_tokens', addresses, seen);
  // Legacy autofill_profiles (still present on some profiles / older browsers).
  readChromiumLegacyAddresses(webDataDb, addresses, seen);

  if (keepGuid) return addresses;
  return addresses.map((addr) => {
    const { _guid, ...rest } = addr;
    return rest;
  });
}

function readChromiumAddresses(profilePath) {
  return collectChromiumAddresses(profilePath, { keepGuid: false });
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
  const mapped = {
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
  if (!isImportableAddress(mapped)) return null;
  return mapped;
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
      if (
        cards.length === 0 &&
        pathExists(path.join(profilePath, 'Web Data')) &&
        !resolveKeychainPassword(browserId) &&
        process.platform === 'darwin'
      ) {
        warnings.push(
          'Could not read payment cards — allow Keychain access for the source browser or quit it and try again.'
        );
      } else if (cards.length > 0) {
        const withCvv = cards.filter((c) => c.cvv).length;
        if (withCvv === 0) {
          warnings.push(
            'Payment cards were imported, but no security codes (CVC/CVV) were found. The other browser only saves those when you chose to store them — Axis cannot invent missing codes.'
          );
        } else if (withCvv < cards.length) {
          warnings.push(
            `Imported ${cards.length} cards; ${withCvv} included a security code. The others had no CVC saved in the other browser.`
          );
        }
      }
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
    if (importCards) {
      warnings.push('Firefox does not expose saved payment cards for import.');
    }
    if (importAddresses) {
      addresses = readFirefoxAddresses(profilePath);
    }
  }

  return { logins, cards, addresses, warnings };
}

module.exports = {
  extractBrowserSecrets,
  normalizeImportedCvv,
  readChromiumLogins,
  readChromiumCards,
  readChromiumAddresses,
  readFirefoxLogins,
  readFirefoxAddresses
};
