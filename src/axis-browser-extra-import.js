'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { querySqliteDb, pathExists } = require('./axis-import-sqlite');

const CHROMIUM_WEBSTORE_LOCATIONS = new Set([1, 2, 3, 6, 9, 10]);
const CHROMIUM_UNPACKED_LOCATION = 4;

const BROWSER_PROCESS_HINTS = {
  chrome: ['Google Chrome', 'chrome'],
  edge: ['Microsoft Edge', 'msedge'],
  brave: ['Brave Browser', 'brave'],
  chromium: ['Chromium', 'chromium'],
  arc: ['Arc', 'Arc'],
  opera: ['Opera', 'opera'],
  vivaldi: ['Vivaldi', 'vivaldi'],
  firefox: ['firefox', 'Firefox']
};

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function resolveExtensionFolder(rawPath, profilePath, userDataPath) {
  let folder = String(rawPath || '').trim();
  if (!folder) return null;
  if (path.isAbsolute(folder) && pathExists(path.join(folder, 'manifest.json'))) return folder;

  const candidates = [
    path.join(profilePath, folder),
    path.join(userDataPath || path.dirname(profilePath), folder),
    path.join(profilePath, 'Extensions', folder),
    path.join(userDataPath || path.dirname(profilePath), 'Extensions', folder)
  ];
  for (const candidate of candidates) {
    if (pathExists(path.join(candidate, 'manifest.json'))) return candidate;
  }
  return null;
}

function normalizeOrigin(url) {
  const raw = String(url || '').trim().split(',')[0];
  if (!raw) return null;
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).origin;
  } catch (_) {
    return null;
  }
}

function readChromiumPrefFiles(profilePath) {
  const secure = readJsonFile(path.join(profilePath, 'Secure Preferences'));
  const prefs = readJsonFile(path.join(profilePath, 'Preferences'));
  return { secure, prefs };
}

function chromiumContentSettingToAxis(setting) {
  const n = Number(setting);
  if (n === 1) return 'allow';
  if (n === 2) return 'deny';
  return null;
}

function readChromiumSitePermissions(profilePath) {
  const { secure, prefs } = readChromiumPrefFiles(profilePath);
  const exceptions =
    secure?.profile?.content_settings?.exceptions ||
    prefs?.profile?.content_settings?.exceptions ||
    secure?.content_settings?.exceptions ||
    prefs?.content_settings?.exceptions ||
    {};

  const mapping = {
    geolocation: 'geolocation',
    notifications: 'notifications',
    media_stream_camera: 'camera',
    media_stream_mic: 'microphone'
  };

  const out = {};
  for (const [chromeKey, axisKey] of Object.entries(mapping)) {
    const bucket = exceptions[chromeKey];
    if (!bucket || typeof bucket !== 'object') continue;
    for (const [pattern, entry] of Object.entries(bucket)) {
      const val = chromiumContentSettingToAxis(entry?.setting);
      if (!val) continue;
      const origin = normalizeOrigin(pattern.split(',')[0]);
      if (!origin) continue;
      if (!out[origin]) out[origin] = {};
      out[origin][axisKey] = val;
    }
  }
  return out;
}

function readFirefoxSitePermissions(profilePath) {
  const { rows } = querySqliteDb(
    path.join(profilePath, 'permissions.sqlite'),
    `SELECT origin, type, permission FROM moz_perms WHERE type IN (1, 2)`
  );
  const mapPerm = {
    geo: 'geolocation',
    'desktop-notification': 'notifications',
    camera: 'camera',
    microphone: 'microphone'
  };
  const out = {};
  for (const row of rows) {
    const axisKey = mapPerm[String(row.permission || '').toLowerCase()];
    if (!axisKey) continue;
    const origin = normalizeOrigin(row.origin);
    if (!origin) continue;
    const val = Number(row.type) === 1 ? 'allow' : Number(row.type) === 2 ? 'deny' : null;
    if (!val) continue;
    if (!out[origin]) out[origin] = {};
    out[origin][axisKey] = val;
  }
  return out;
}

function mergeSitePermissionOverrides(...maps) {
  const out = {};
  for (const map of maps) {
    if (!map || typeof map !== 'object') continue;
    for (const [origin, perms] of Object.entries(map)) {
      if (!out[origin]) out[origin] = {};
      Object.assign(out[origin], perms);
    }
  }
  return out;
}

function isValidChromiumExtensionId(id) {
  return /^[a-p]{32}$/i.test(String(id || ''));
}

function readChromiumExtensions(profilePath, userDataPath) {
  const { secure, prefs } = readChromiumPrefFiles(profilePath);
  const settings =
    secure?.extensions?.settings ||
    prefs?.extensions?.settings ||
    {};

  const extensions = [];
  const unpacked = [];

  for (const [id, meta] of Object.entries(settings)) {
    if (!isValidChromiumExtensionId(id)) continue;
    if (!meta || typeof meta !== 'object') continue;
    const location = Number(meta.location);
    const state = Number(meta.state);
    const disabled = meta.disable_reasons && Object.keys(meta.disable_reasons).length > 0;
    const enabled = state === 1 && !disabled;
    const name =
      String(meta.manifest?.name || meta.name || id).trim() || id;

    if (location === CHROMIUM_UNPACKED_LOCATION) {
      const folder = resolveExtensionFolder(meta.path, profilePath, userDataPath);
      if (folder) {
        unpacked.push({ id, name, enabled, folder });
      } else if (meta.path) {
        extensions.push({ id: id.toLowerCase(), name, enabled });
      }
      continue;
    }

    if (!CHROMIUM_WEBSTORE_LOCATIONS.has(location)) continue;
    extensions.push({ id: id.toLowerCase(), name, enabled });
  }

  const profileExtDir = path.join(profilePath, 'Extensions');
  if (pathExists(profileExtDir)) {
    for (const id of fs.readdirSync(profileExtDir)) {
      if (!isValidChromiumExtensionId(id)) continue;
      if (extensions.some((e) => e.id === id.toLowerCase())) continue;
      if (unpacked.some((e) => e.id === id.toLowerCase())) continue;
      const idDir = path.join(profileExtDir, id);
      let versionDir = null;
      try {
        const versions = fs
          .readdirSync(idDir)
          .filter((v) => pathExists(path.join(idDir, v, 'manifest.json')));
        if (versions.length > 0) versionDir = path.join(idDir, versions.sort().pop());
      } catch (_) {}
      if (versionDir) {
        unpacked.push({ id: id.toLowerCase(), name: id, enabled: true, folder: versionDir });
      } else {
        extensions.push({ id: id.toLowerCase(), name: id, enabled: true });
      }
    }
  }

  return { webStore: extensions, unpacked, warnings: [] };
}

function readChromiumExtensionsWithWarnings(profilePath, userDataPath) {
  const result = readChromiumExtensions(profilePath, userDataPath);
  const warnings = [];
  const total = (result.webStore?.length || 0) + (result.unpacked?.length || 0);
  if (total === 0) {
    const extDir = path.join(profilePath, 'Extensions');
    if (pathExists(extDir)) {
      try {
        const count = fs.readdirSync(extDir).filter((name) => isValidChromiumExtensionId(name)).length;
        if (count > 0) {
          warnings.push(
            `${count} extension folder${count === 1 ? '' : 's'} were found but could not be matched to enabled extensions in preferences.`
          );
        }
      } catch (_) {}
    }
  }
  return { ...result, warnings };
}

function readFirefoxExtensions(profilePath) {
  const addonsPath = path.join(profilePath, 'extensions.json');
  const data = readJsonFile(addonsPath);
  const addons = Array.isArray(data?.addons) ? data.addons : [];
  const webStore = [];
  const unpacked = [];

  for (const addon of addons) {
    const id = String(addon.id || '').trim();
    if (!id) continue;
    const name = String(addon.defaultLocale?.name || addon.name || id).trim();
    const enabled = addon.active !== false && addon.userDisabled !== true;
    const rootDir = String(addon.rootURI || addon.path || '').replace(/^file:\/\//, '');

    if (addon.type === 'extension' && rootDir && pathExists(path.join(rootDir, 'manifest.json'))) {
      unpacked.push({ id, name, enabled, folder: rootDir, amoSlug: null });
      continue;
    }

    const amoMatch = String(addon.sourceURI || addon.updateURL || '').match(/addons\.mozilla\.org/);
    if (addon.type === 'extension' && (amoMatch || /^[a-f0-9-]{36}$/i.test(id))) {
      webStore.push({
        id,
        name,
        enabled,
        amoSlug: String(addon.defaultLocale?.slug || '').trim() || null
      });
    }
  }

  return { webStore, unpacked };
}

function isBrowserLikelyRunning(browserId) {
  const hints = BROWSER_PROCESS_HINTS[browserId] || [];
  if (!hints.length) return false;
  try {
    for (const hint of hints) {
      const out = execFileSync('pgrep', ['-if', hint], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 2000
      });
      if (String(out || '').trim()) return true;
    }
  } catch (_) {}
  return false;
}

function extractBrowserExtras(source, options = {}) {
  const importSitePermissions = options.importSitePermissions !== false;
  const importExtensions = options.importExtensions !== false;
  const warnings = [];

  if (source?.browserId && isBrowserLikelyRunning(source.browserId)) {
    warnings.push(
      `Quit ${source.browserId === 'firefox' ? 'Firefox' : 'the source browser'} before importing so databases and passwords can be read reliably.`
    );
  }

  let sitePermissionOverrides = {};
  let extensions = { webStore: [], unpacked: [] };

  if (importSitePermissions) {
    if (source.browserEngine === 'chromium') {
      sitePermissionOverrides = readChromiumSitePermissions(source.profilePath);
    } else if (source.browserEngine === 'firefox') {
      sitePermissionOverrides = readFirefoxSitePermissions(source.profilePath);
    }
  }

  if (importExtensions) {
    if (source.browserEngine === 'chromium') {
      const ext = readChromiumExtensionsWithWarnings(source.profilePath, source.userDataPath);
      extensions = ext;
      warnings.push(...(ext.warnings || []));
    } else if (source.browserEngine === 'firefox') {
      extensions = readFirefoxExtensions(source.profilePath);
    }
  }

  return { sitePermissionOverrides, extensions, warnings };
}

module.exports = {
  extractBrowserExtras,
  mergeSitePermissionOverrides,
  readChromiumSitePermissions,
  readFirefoxSitePermissions,
  readChromiumExtensions,
  readFirefoxExtensions,
  isBrowserLikelyRunning
};
