'use strict';

/**
 * Time-of-day greeting pools for the new tab hero. Templates may include `$name`.
 * One phrase is picked per hour (stable within the hour, varies across days).
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
    phrases: [
      'Early start?',
      'Good (early) Morning, $name!'
    ]
  },
  {
    from: 6,
    to: 13,
    phrases: [
      'Good Morning, $name.',
      'It\'s a new day!'
    ]
  },
  {
    from: 13,
    to: 17,
    phrases: [
      'Good Afternoon, $name.'
    ]
  },
  {
    from: 17,
    to: 21,
    phrases: [
      'Good Evening, $name',
      'Enjoy your evening.',
      'Golden hour?'
    ]
  },
  {
    from: 21,
    to: 24,
    phrases: [
      'Getting late',
      'Good night.'
    ]
  }
];

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

function formatGreetingTemplate(template, name) {
  const safeName = String(name || 'User').trim() || 'User';
  return String(template).replace(/\$name/g, safeName);
}

/** Stable within the same clock hour; rotates across hours and days. */
function getTimeGreeting(now = new Date(), name = 'User') {
  const date = now instanceof Date ? now : new Date(now);
  const hour = date.getHours();
  const slot = getGreetingSlot(hour);
  const seed = date.getFullYear() * 10000 + dayOfYear(date) * 24 + hour;
  const template = pickFromPool(slot.phrases, seed);
  return formatGreetingTemplate(template, name);
}

const exportsObj = {
  AXIS_NTP_GREETING_SLOTS,
  formatGreetingTemplate,
  getTimeGreeting
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exportsObj;
}
if (typeof window !== 'undefined') {
  window.AXIS_NTP_GREETINGS = exportsObj;
}
