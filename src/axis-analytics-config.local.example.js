'use strict';

/**
 * Copy this file to axis-analytics-config.local.js and add your PostHog project API key.
 * That local file is listed in .gitignore so git never commits your key — commit this
 * example + .gitignore instead. Each machine uses its own copy or AXIS_POSTHOG_KEY env var.
 * PostHog here is only for optional once-per-day “app opened” counts (no page content).
 * Events send $geoip_disable; also turn off GeoIP in your PostHog project settings if you
 * do not want country/region inferred from IP for legacy events.
 */
module.exports = {
  ENABLED: true,
  POSTHOG_API_KEY: 'phc_your_project_api_key_here',
  POSTHOG_HOST: 'https://us.i.posthog.com'
};
