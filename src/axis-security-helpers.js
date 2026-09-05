'use strict';

/**
 * Pure security helpers shared by main process + unit tests.
 * Keep these free of BrowserWindow / ipc so tests can require them without Electron.
 */

const path = require('path');
const os = require('os');

function getAxisLibraryRootDirs(homedir = os.homedir()) {
  const home = String(homedir || '');
  return [
    path.resolve(path.join(home, 'Downloads')),
    path.resolve(path.join(home, 'Desktop')),
    path.resolve(path.join(home, 'Documents')),
    path.resolve(path.join(home, 'Pictures'))
  ];
}

function isPathInsideRoots(filePath, roots) {
  if (!filePath || typeof filePath !== 'string') return false;
  let resolved;
  try {
    resolved = path.resolve(filePath);
  } catch (_) {
    return false;
  }
  if (resolved.includes('\0')) return false;
  const list = Array.isArray(roots) ? roots : [];
  return list.some((root) => {
    const r = path.resolve(String(root || ''));
    return resolved === r || resolved.startsWith(r + path.sep);
  });
}

function isPathInsideAxisLibraryRoots(filePath, homedir) {
  return isPathInsideRoots(filePath, getAxisLibraryRootDirs(homedir));
}

/** True for Axis Settings guest pages (file://…/settings.html). */
function isAxisSettingsGuestUrl(rawUrl) {
  const url = String(rawUrl || '');
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== 'file:') return false;
    return /[/\\]settings\.html$/i.test(u.pathname || '');
  } catch (_) {
    return /(?:^|[\\/])settings\.html(?:[?#]|$)/i.test(url) && /^file:/i.test(url);
  }
}

/** Axis shell / Settings chrome loaded from disk (not websites, not extensions). */
function isAxisShellFileUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || url === 'about:blank') return true;
  try {
    const u = new URL(url);
    if (u.protocol !== 'file:') return false;
    const p = String(u.pathname || '');
    return /[/\\](index|settings)\.html$/i.test(p);
  } catch (_) {
    return /^file:/i.test(url) && /[/\\](index|settings)\.html(?:[?#]|$)/i.test(url);
  }
}

/** Website guests are http(s)/blob/data — never privileged IPC. */
function isWebsiteGuestUrl(rawUrl) {
  const url = String(rawUrl || '').trim().toLowerCase();
  if (!url || url === 'about:blank') return false;
  return (
    url.startsWith('http:') ||
    url.startsWith('https:') ||
    url.startsWith('blob:') ||
    url.startsWith('data:')
  );
}

function isExtensionPageUrl(rawUrl) {
  return /^chrome-extension:/i.test(String(rawUrl || '').trim());
}

/** Picker-safe address line: city / region / postal only (no street). */
function formatAddressCandidateSummary(addr) {
  if (!addr || typeof addr !== 'object') return '';
  const city = String(addr.city || '').trim();
  const state = String(addr.state || '').trim();
  const postal = String(addr.postalCode || '').trim();
  const cityLine = [city, state].filter(Boolean).join(', ');
  return [cityLine, postal].filter(Boolean).join(' ');
}

/**
 * Fingerprint for comparing autofill vs typed passwords without storing plaintext on window.
 * Not a security hash — only anti-duplicate for save prompts.
 */
function passwordMatchFingerprint(password) {
  const s = String(password || '');
  if (!s) return '';
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${s.length}:${(h >>> 0).toString(16)}`;
}

/** Zip-slip: every entry path must resolve under destDir. */
function isZipEntryPathSafe(destDir, entryName) {
  const dest = path.resolve(String(destDir || ''));
  const name = String(entryName || '').replace(/\\/g, '/');
  if (!name || name.includes('\0')) return false;
  if (name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false;
  const parts = name.split('/');
  if (parts.some((p) => p === '..')) return false;
  const target = path.resolve(dest, name);
  return target === dest || target.startsWith(dest + path.sep);
}

module.exports = {
  getAxisLibraryRootDirs,
  isPathInsideRoots,
  isPathInsideAxisLibraryRoots,
  isAxisSettingsGuestUrl,
  isAxisShellFileUrl,
  isWebsiteGuestUrl,
  isExtensionPageUrl,
  formatAddressCandidateSummary,
  passwordMatchFingerprint,
  isZipEntryPathSafe
};
