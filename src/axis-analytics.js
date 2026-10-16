'use strict';

const crypto = require('crypto');
const config = require('./axis-analytics-config.js');

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getOrCreateAnonymousId(store) {
  let id = String(store.get('analyticsAnonymousId', '') || '').trim();
  if (!id) {
    id = crypto.randomUUID();
    store.set('analyticsAnonymousId', id);
  }
  return id;
}

async function captureDailyActive(store) {
  if (!config.ENABLED || !config.POSTHOG_API_KEY) return { ok: false, reason: 'disabled' };

  const today = getTodayKey();
  const lastDay = String(store.get('analyticsLastDailyDate', '') || '');
  if (lastDay === today) {
    return { ok: true, reason: 'already-logged-today' };
  }

  const distinctId = getOrCreateAnonymousId(store);
  const host = String(config.POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
  const body = {
    api_key: config.POSTHOG_API_KEY,
    event: 'app_open',
    distinct_id: distinctId,
    properties: {
      $lib: 'axis-browser',
      $geoip_disable: true,
      $process_person_profile: false,
      used_at: new Date().toISOString()
    }
  };

  try {
    const res = await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!res.ok) return { ok: false, reason: `http-${res.status}` };
    store.set('analyticsLastDailyDate', today);
    return { ok: true, reason: 'sent' };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
}

const APP_OPEN_MIN_UPTIME_MS = 5 * 60 * 1000;

function scheduleDailyActivePing(store) {
  setTimeout(() => {
    void captureDailyActive(store);
  }, APP_OPEN_MIN_UPTIME_MS);
}

module.exports = {
  captureDailyActive,
  scheduleDailyActivePing
};
