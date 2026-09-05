'use strict';

/**
 * Resolve address-bar / New Tab input into a navigable `file:` URL.
 * Pure helpers — used by the shell and security unit tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AxisLocalFileUrl = api;
  if (typeof globalThis !== 'undefined') globalThis.AxisLocalFileUrl = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /** Dangerous schemes that must never become a local-file navigation. */
  const BLOCKED_SCHEMES = /^(javascript|data|vbscript|blob|ftp):/i;

  function encodePathSegments(absPath) {
    const normalized = String(absPath).replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(normalized)) {
      // Windows drive: file:///C:/Users/...
      const parts = normalized.split('/');
      return (
        'file:///' +
        parts
          .map((seg, i) => {
            if (i === 0) return seg; // C:
            return encodeURIComponent(seg);
          })
          .join('/')
      );
    }
    if (!normalized.startsWith('/')) return null;
    return (
      'file://' +
      normalized
        .split('/')
        .map((seg, i) => (i === 0 ? '' : encodeURIComponent(seg)))
        .join('/')
    );
  }

  /**
   * True when input is clearly a filesystem path (not a hostname or search query).
   * Protocol-relative URLs (`//cdn…`) are excluded.
   */
  function looksLikeLocalPath(input) {
    if (!input || typeof input !== 'string') return false;
    const s = input.trim();
    if (!s || BLOCKED_SCHEMES.test(s)) return false;
    if (/^file:/i.test(s)) return false; // handled separately
    if (s.startsWith('~/') || s === '~') return true;
    if (s.startsWith('/') && !s.startsWith('//')) return true;
    if (/^[A-Za-z]:[\\/]/.test(s)) return true;
    if (s.startsWith('\\\\')) return true;
    return false;
  }

  /**
   * Normalize and validate an existing `file:` URL. Returns href or null.
   */
  function normalizeFileUrl(input) {
    if (!input || typeof input !== 'string') return null;
    const raw = input.trim();
    if (!/^file:/i.test(raw)) return null;
    try {
      const u = new URL(raw);
      if (u.protocol !== 'file:') return null;
      // Reject empty / obviously broken paths; allow localhost host (Chromium file://localhost/…).
      const host = (u.hostname || '').toLowerCase();
      if (host && host !== 'localhost') {
        // UNC / remote file hosts — still a local-file navigation; keep pathname only via href.
      }
      const href = u.href;
      if (!href || href === 'file:' || href === 'file://') return null;
      return href;
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {string} input
   * @param {{ homeDir?: string }} [options]
   * @returns {string|null} file: URL or null if input is not a local file path/URL
   */
  function resolveLocalFileUrl(input, options = {}) {
    if (!input || typeof input !== 'string') return null;
    let raw = input.trim();
    if (!raw || BLOCKED_SCHEMES.test(raw)) return null;

    if (/^file:/i.test(raw)) {
      return normalizeFileUrl(raw);
    }

    if (!looksLikeLocalPath(raw)) return null;

    if (raw === '~' || raw.startsWith('~/')) {
      const home = typeof options.homeDir === 'string' ? options.homeDir.trim() : '';
      if (!home) return null;
      const rest = raw === '~' ? '' : raw.slice(2);
      const homeNorm = home.replace(/\\/g, '/').replace(/\/+$/, '');
      raw = rest ? homeNorm + '/' + rest.replace(/^\/+/, '') : homeNorm;
    }

    // UNC \\server\share\file → file://server/share/file
    if (raw.startsWith('\\\\')) {
      const unc = raw.replace(/\\/g, '/').replace(/^\/+/, '');
      try {
        const u = new URL('file://' + unc);
        if (u.protocol !== 'file:') return null;
        return u.href;
      } catch (_) {
        return null;
      }
    }

    // Windows drive letter with backslashes
    if (/^[A-Za-z]:\\/.test(raw)) {
      raw = raw.replace(/\\/g, '/');
    }

    return encodePathSegments(raw);
  }

  return {
    looksLikeLocalPath,
    normalizeFileUrl,
    resolveLocalFileUrl,
  };
});
