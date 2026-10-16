'use strict';

/**
 * PostHog analytics config. The API key is NOT stored here (open source).
 * - Set AXIS_POSTHOG_KEY in the environment, or
 * - Copy axis-analytics-config.local.example.js → axis-analytics-config.local.js (gitignored)
 */
let local = {};
try {
  local = require('./axis-analytics-config.local.js');
} catch (_) {}

module.exports = {
  ENABLED: local.ENABLED !== false,
  POSTHOG_API_KEY: String(process.env.AXIS_POSTHOG_KEY || local.POSTHOG_API_KEY || '').trim(),
  POSTHOG_HOST: String(local.POSTHOG_HOST || process.env.AXIS_POSTHOG_HOST || 'https://us.i.posthog.com').trim()
};
