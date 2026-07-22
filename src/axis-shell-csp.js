'use strict';

const path = require('path');

/**
 * Content-Security-Policy for Axis internal UI (shell + Settings tab).
 * Keep in sync with <meta http-equiv="Content-Security-Policy"> in index.html / settings.html.
 *
 * Goals: block third-party <script> (and eval); allow local scripts only on the main shell;
 * Settings keeps inline scripts (large embedded UI) but still blocks external script URLs.
 */

/** Main browser chrome (`index.html` + `renderer.js`). No third-party script sources. */
const AXIS_MAIN_SHELL_CSP =
  "default-src 'none'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; " +
  "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; " +
  "img-src 'self' data: blob: https: http: file:; " +
  "connect-src 'self' https://api.groq.com https://api.openai.com https://generativelanguage.googleapis.com https://openrouter.ai https://api.mistral.ai https://suggestqueries.google.com https://geocoding-api.open-meteo.com https://api.open-meteo.com https://air-quality-api.open-meteo.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com; " +
  "media-src 'self' blob: data:; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'; " +
  "frame-src 'none'; " +
  "frame-ancestors 'none'; " +
  "worker-src 'self' blob:; " +
  "manifest-src 'self'";

/** Settings tab (`settings.html` in a guest webview). Inline scripts only — no external script URLs. */
const AXIS_SETTINGS_SHELL_CSP =
  "default-src 'none'; " +
  "script-src 'self' 'unsafe-inline'; " +
  "style-src 'self' 'unsafe-inline'; " +
  "font-src 'self' data:; " +
  "img-src 'self' data: blob: https: http: file: chrome-extension:; " +
  "connect-src 'self' https://geocoding-api.open-meteo.com https://api.open-meteo.com https://air-quality-api.open-meteo.com https://query1.finance.yahoo.com https://query2.finance.yahoo.com; " +
  "object-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'; " +
  "frame-src 'none'; " +
  "frame-ancestors 'none'";

function isAxisShellDocumentUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'file:') return false;
    const base = path.basename(u.pathname).toLowerCase();
    return base === 'index.html' || base === 'settings.html';
  } catch (_) {
    return false;
  }
}

function axisShellCspForUrl(url) {
  const base = path.basename(new URL(url).pathname).toLowerCase();
  return base === 'settings.html' ? AXIS_SETTINGS_SHELL_CSP : AXIS_MAIN_SHELL_CSP;
}

function installAxisShellCsp(targetSession) {
  if (!targetSession || targetSession.__axisShellCspInstalled) return;
  targetSession.__axisShellCspInstalled = true;

  targetSession.webRequest.onHeadersReceived({ urls: ['file://*/*'] }, (details, callback) => {
    if (!isAxisShellDocumentUrl(details.url)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const policy = axisShellCspForUrl(details.url);
    const headers = { ...details.responseHeaders };
    headers['Content-Security-Policy'] = [policy];
    callback({ responseHeaders: headers });
  });
}

/** Apply shell CSP to every session that can load `index.html` or `settings.html`. */
function installAxisShellCspOnAllSessions(sessionApi) {
  const targets = [];
  try {
    targets.push(sessionApi.defaultSession);
  } catch (_) {}
  try {
    targets.push(sessionApi.fromPartition('persist:main'));
  } catch (_) {}
  try {
    targets.push(sessionApi.fromPartition('incognito'));
  } catch (_) {}
  for (const s of targets) {
    installAxisShellCsp(s);
  }
}

module.exports = {
  AXIS_MAIN_SHELL_CSP,
  AXIS_SETTINGS_SHELL_CSP,
  isAxisShellDocumentUrl,
  axisShellCspForUrl,
  installAxisShellCsp,
  installAxisShellCspOnAllSessions
};
