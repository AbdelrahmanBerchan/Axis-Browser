'use strict';

/**
 * Time-of-day greeting pools for the new tab hero. Templates may include `$name`.
 *
 * RTL: mount with dir=rtl on the greeting element and DOM order before → name → after.
 * Flex then places the phrase on the right. Do not rely on Unicode bidi alone.
 */
const AXIS_NTP_GREETING_SLOTS = [
  {
    from: 0,
    to: 4,
    phrases: [
      'Up late, $name?',
      'Grind never stops?',
      'Getting a hyper-early start?',
      'Goodnight, $name.'
    ]
  },
  {
    from: 4,
    to: 6,
    phrases: ['Early start?', 'Good (early) Morning, $name!']
  },
  {
    from: 6,
    to: 13,
    phrases: ['Good Morning, $name.', "It's a new day!"]
  },
  {
    from: 13,
    to: 17,
    phrases: ['Good Afternoon, $name.']
  },
  {
    from: 17,
    to: 21,
    phrases: ['Good Evening, $name.', 'Enjoy your evening.', 'Golden hour?']
  },
  {
    from: 21,
    to: 24,
    phrases: ['Getting late', 'Good night.']
  }
];

const RTL_LOCALE_RE = /^(ar|he|fa|ur|yi|ps|sd|ug|dv)(?:-|$)/i;
const RTL_SCRIPT_RE = /[\u0590-\u05FF\u0600-\u07FF\uFB1D-\uFDFD\uFE70-\uFEFC]/;
const LTR_STRONG_RE = /[A-Za-z\u00C0-\u024F]/;

function dayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  return Math.floor(diff / 86400000);
}

function pickFromPool(pool, seed) {
  if (!pool.length) return 'Hello, $name.';
  const idx = ((seed % pool.length) + pool.length) % pool.length;
  return pool[idx];
}

function getGreetingSlot(hour) {
  const h = Math.max(0, Math.min(23, hour | 0));
  for (const slot of AXIS_NTP_GREETING_SLOTS) {
    if (h >= slot.from && h < slot.to) return slot;
  }
  return AXIS_NTP_GREETING_SLOTS[AXIS_NTP_GREETING_SLOTS.length - 1];
}

function resolveGreetingLocale() {
  try {
    const I = typeof window !== 'undefined' ? window.AxisI18n : null;
    const loc =
      (I && typeof I.getResolvedLocale === 'function' && I.getResolvedLocale()) ||
      (I && typeof I.getLocale === 'function' && I.getLocale()) ||
      '';
    if (String(loc || '').trim()) return String(loc).trim();
  } catch (_) {}
  try {
    if (typeof document !== 'undefined' && document.documentElement?.lang) {
      return String(document.documentElement.lang).trim();
    }
  } catch (_) {}
  return '';
}

function isRtlLocale(loc) {
  return RTL_LOCALE_RE.test(String(loc || ''));
}

function textLooksRtl(text) {
  return RTL_SCRIPT_RE.test(String(text || ''));
}

function normalizeTemplate(template) {
  return String(template || '')
    .replace(/\{name\}/g, '$name')
    .replace(/\u2066|\u2067|\u2068|\u2069|\u200E|\u200F|\u202A|\u202B|\u202C|\u202D|\u202E/g, '');
}

function splitGreetingForDom(template, name) {
  const safeName = String(name || 'User').trim() || 'User';
  const raw = normalizeTemplate(template);
  const token = '$name';
  const idx = raw.indexOf(token);
  if (idx < 0) {
    return { before: raw, name: '', after: '', hasName: false };
  }
  let before = raw.slice(0, idx);
  let after = raw.slice(idx + token.length);
  return {
    before,
    name: safeName,
    after,
    hasName: true
  };
}

function nameNeedsLtrIsolate(name) {
  return LTR_STRONG_RE.test(String(name || ''));
}

function formatGreetingTemplate(template, name) {
  const parts = splitGreetingForDom(template, name);
  return `${parts.before}${parts.name}${parts.after}`;
}

const GREET_KEYS = {
  0: ['ntp.greet.late1', 'ntp.greet.late2', 'ntp.greet.late3', 'ntp.greet.late4'],
  4: ['ntp.greet.early1', 'ntp.greet.early2'],
  6: ['ntp.greet.morning1', 'ntp.greet.morning2'],
  13: ['ntp.greet.afternoon1'],
  17: ['ntp.greet.evening1', 'ntp.greet.evening2', 'ntp.greet.evening3'],
  21: ['ntp.greet.night1', 'ntp.greet.night2']
};

function greetingKeysForHour(hour) {
  const h = Math.max(0, Math.min(23, hour | 0));
  if (h < 4) return GREET_KEYS[0];
  if (h < 6) return GREET_KEYS[4];
  if (h < 13) return GREET_KEYS[6];
  if (h < 17) return GREET_KEYS[13];
  if (h < 21) return GREET_KEYS[17];
  return GREET_KEYS[21];
}

function resolveGreetingTemplate(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  const hour = date.getHours();
  const seed = date.getFullYear() * 10000 + dayOfYear(date) * 24 + hour;
  let template = '';
  try {
    const I = typeof window !== 'undefined' ? window.AxisI18n : null;
    if (I && typeof I.t === 'function') {
      const keys = greetingKeysForHour(hour);
      const key = keys[((seed % keys.length) + keys.length) % keys.length];
      template = I.t(key);
      if (!template || template === key) template = '';
    }
  } catch (_) {}
  if (!template) {
    const slot = getGreetingSlot(hour);
    template = pickFromPool(slot.phrases, seed);
  }
  return normalizeTemplate(template);
}

function getTimeGreeting(now = new Date(), name = 'User') {
  return formatGreetingTemplate(resolveGreetingTemplate(now), name);
}

/**
 * @returns visualOrder - always before → name → after in DOM.
 *   With dir=rtl on the greeting, the phrase sits on the right.
 */
function getGreetingDomParts(now = new Date(), name = 'User') {
  const locale = resolveGreetingLocale();
  const template = resolveGreetingTemplate(now);
  const parts = splitGreetingForDom(template, name);
  const rtl = isRtlLocale(locale) || textLooksRtl(parts.before) || textLooksRtl(parts.after);
  return {
    ...parts,
    locale,
    rtl,
    nameDir: 'ltr',
    plain: `${parts.before}${parts.name}${parts.after}`,
    visualOrder: ['before', 'name', 'after']
  };
}

const exportsObj = {
  AXIS_NTP_GREETING_SLOTS,
  formatGreetingTemplate,
  splitGreetingForDom,
  getGreetingDomParts,
  getTimeGreeting,
  isRtlLocale,
  textLooksRtl,
  resolveGreetingLocale
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
}
if (typeof window !== 'undefined') {
  window.AXIS_NTP_GREETINGS = exportsObj;
}
