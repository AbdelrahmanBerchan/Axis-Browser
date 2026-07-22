'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const {
  normalizeHttpUrl: sessionNormalizeHttpUrl,
  extractBrowserSession,
  AXIS_GROUP_COLORS
} = require('./axis-session-import');
const { extractBrowserSecrets } = require('./axis-browser-secrets-import');
const {
  extractBrowserExtras,
  mergeSitePermissionOverrides
} = require('./axis-browser-extra-import');
const {
  readStorableSidebarBookmarks
} = require('./axis-storable-sidebar-import');
const {
  querySqliteDb,
  sqliteReadWarning,
  pathExists: sqlitePathExists
} = require('./axis-import-sqlite');
const { AXIS_PROFILE_HISTORY_MAX, trimProfileHistoryItems } = require('./axis-history-store');

const FAVORITES_IMPORT_LIMIT = 500;
const HISTORY_IMPORT_LIMIT = 2000;
const SIDEBAR_PROFILE_BROWSERS = new Set(['arc', 'dia', 'sidekick']);

const normalizeHttpUrl = sessionNormalizeHttpUrl;

const SEARCH_ENGINE_MAP = {
  google: 'google',
  'google.com': 'google',
  bing: 'bing',
  'bing.com': 'bing',
  duckduckgo: 'duckduckgo',
  yahoo: 'yahoo',
  yandex: 'yandex'
};

function pathExists(p) {
  return sqlitePathExists(p);
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function chromiumTimeToIso(microseconds) {
  if (microseconds == null || microseconds === '') return new Date().toISOString();
  try {
    const micro = BigInt(String(microseconds));
    const ms = Number(micro / 1000n) - 11644473600000;
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  } catch (_) {
    return new Date().toISOString();
  }
}

function firefoxTimeToIso(microseconds) {
  if (microseconds == null || microseconds === '') return new Date().toISOString();
  try {
    const micro = BigInt(String(microseconds));
    const ms = Number(micro / 1000n);
    const d = new Date(ms);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  } catch (_) {
    return new Date().toISOString();
  }
}

function browserDefs() {
  const home = os.homedir();
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  const localAppData = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');

  const chromium = (id, name, macRel, winRel, linuxRel) => ({
    id,
    name,
    engine: 'chromium',
    resolvePath() {
      if (isMac) return path.join(home, 'Library', 'Application Support', macRel);
      if (isWin) return path.join(localAppData, winRel);
      return path.join(home, linuxRel);
    }
  });

  const defs = [
    chromium('chrome', 'Google Chrome', 'Google/Chrome', 'Google/Chrome/User Data', '.config/google-chrome'),
    chromium('chrome-beta', 'Chrome Beta', 'Google/Chrome Beta', 'Google/Chrome Beta/User Data', '.config/google-chrome-beta'),
    chromium('chrome-dev', 'Chrome Dev', 'Google/Chrome Dev', 'Google/Chrome Dev/User Data', '.config/google-chrome-unstable'),
    chromium('chrome-canary', 'Chrome Canary', 'Google/Chrome Canary', 'Google/Chrome SxS/User Data', '.config/google-chrome-canary'),
    chromium('edge', 'Microsoft Edge', 'Microsoft Edge', 'Microsoft/Edge/User Data', '.config/microsoft-edge'),
    chromium('edge-beta', 'Edge Beta', 'Microsoft Edge Beta', 'Microsoft/Edge Beta/User Data', '.config/microsoft-edge-beta'),
    chromium('edge-dev', 'Edge Dev', 'Microsoft Edge Dev', 'Microsoft/Edge Dev/User Data', '.config/microsoft-edge-dev'),
    chromium('edge-canary', 'Edge Canary', 'Microsoft Edge Canary', 'Microsoft/Edge SxS/User Data', '.config/microsoft-edge-canary'),
    chromium('brave', 'Brave', 'BraveSoftware/Brave-Browser', 'BraveSoftware/Brave-Browser/User Data', '.config/BraveSoftware/Brave-Browser'),
    chromium('brave-beta', 'Brave Beta', 'BraveSoftware/Brave-Browser-Beta', 'BraveSoftware/Brave-Browser-Beta/User Data', '.config/BraveSoftware/Brave-Browser-Beta'),
    chromium('brave-nightly', 'Brave Nightly', 'BraveSoftware/Brave-Browser-Nightly', 'BraveSoftware/Brave-Browser-Nightly/User Data', '.config/BraveSoftware/Brave-Browser-Nightly'),
    chromium('chromium', 'Chromium', 'Chromium', 'Chromium/User Data', '.config/chromium'),
    chromium('arc', 'Arc', 'Arc/User Data', 'Arc/User Data', '.config/arc'),
    chromium('dia', 'Dia', 'Dia/User Data', 'Dia/User Data', '.config/dia'),
    chromium('opera', 'Opera', 'com.operasoftware.Opera', 'Opera Software/Opera Stable', '.config/opera'),
    chromium('opera-gx', 'Opera GX', 'com.operasoftware.OperaGX', 'Opera Software/Opera GX Stable', '.config/opera-gx'),
    chromium('vivaldi', 'Vivaldi', 'Vivaldi', 'Vivaldi/User Data', '.config/vivaldi'),
    chromium('yandex', 'Yandex', 'Yandex/YandexBrowser', 'Yandex/YandexBrowser/User Data', '.config/yandex-browser'),
    chromium('whale', 'Whale', 'Naver/Whale', 'Naver/Naver Whale/User Data', '.config/naver-whale'),
    chromium('thorium', 'Thorium', 'Thorium', 'Thorium/User Data', '.config/thorium'),
    chromium('sidekick', 'Sidekick', 'Sidekick', 'Sidekick/User Data', '.config/sidekick'),
    {
      id: 'firefox',
      name: 'Firefox',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'Firefox');
        if (isWin) return path.join(appData, 'Mozilla', 'Firefox');
        return path.join(home, '.mozilla', 'firefox');
      }
    },
    {
      id: 'firefox-dev',
      name: 'Firefox Developer Edition',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'FirefoxDeveloperEdition');
        if (isWin) return path.join(appData, 'Mozilla', 'Firefox Developer Edition');
        return path.join(home, '.mozilla', 'firefox-dev');
      }
    },
    {
      id: 'firefox-nightly',
      name: 'Firefox Nightly',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'FirefoxNightly');
        if (isWin) return path.join(appData, 'Mozilla', 'Firefox Nightly');
        return path.join(home, '.mozilla', 'firefox-nightly');
      }
    },
    {
      id: 'librewolf',
      name: 'LibreWolf',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'librewolf');
        if (isWin) return path.join(appData, 'librewolf');
        return path.join(home, '.librewolf');
      }
    },
    {
      id: 'waterfox',
      name: 'Waterfox',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'Waterfox');
        if (isWin) return path.join(appData, 'Waterfox');
        return path.join(home, '.waterfox');
      }
    },
    {
      id: 'zen',
      name: 'Zen Browser',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'zen');
        if (isWin) return path.join(appData, 'zen');
        return path.join(home, '.zen');
      }
    }
  ];
  return defs;
}

function flattenChromiumBookmarks(node, out = []) {
  if (!node) return out;
  if (node.type === 'url') {
    const url = normalizeHttpUrl(node.url);
    if (url) out.push({ title: String(node.name || url).slice(0, 200), url });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) flattenChromiumBookmarks(child, out);
  }
  return out;
}

function looksLikeChromiumProfileDir(profilePath) {
  return (
    pathExists(path.join(profilePath, 'Preferences')) ||
    pathExists(path.join(profilePath, 'Bookmarks')) ||
    pathExists(path.join(profilePath, 'History')) ||
    pathExists(path.join(profilePath, 'Login Data'))
  );
}

function listChromiumProfiles(userDataDir) {
  const localState = readJsonFile(path.join(userDataDir, 'Local State'));
  const infoCache = localState?.profile?.info_cache || {};
  const profiles = [];
  const seen = new Set();

  for (const [dirName, info] of Object.entries(infoCache)) {
    const profilePath = path.join(userDataDir, dirName);
    if (!pathExists(profilePath)) continue;
    seen.add(dirName);
    profiles.push({
      id: dirName,
      name: String(info?.name || info?.gaia_name || dirName).trim() || dirName,
      profilePath,
      browserEngine: 'chromium'
    });
  }

  // Also scan folders so we do not miss profiles missing from Local State.
  try {
    const entries = fs.readdirSync(userDataDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const dirName = ent.name;
      if (
        seen.has(dirName) ||
        dirName === 'System Profile' ||
        dirName === 'Guest Profile' ||
        dirName === 'Crashpad' ||
        dirName === 'GrShaderCache' ||
        dirName === 'ShaderCache' ||
        dirName === 'GraphiteDawnCache' ||
        dirName.startsWith('.')
      ) {
        continue;
      }
      const profilePath = path.join(userDataDir, dirName);
      if (!looksLikeChromiumProfileDir(profilePath)) continue;
      seen.add(dirName);
      profiles.push({
        id: dirName,
        name: dirName === 'Default' ? 'Default' : dirName.replace(/^Profile\s+/i, 'Profile '),
        profilePath,
        browserEngine: 'chromium'
      });
    }
  } catch (_) {}

  if (profiles.length === 0 && pathExists(path.join(userDataDir, 'Default'))) {
    profiles.push({
      id: 'Default',
      name: 'Default',
      profilePath: path.join(userDataDir, 'Default'),
      browserEngine: 'chromium'
    });
  }
  return profiles.sort((a, b) => a.name.localeCompare(b.name));
}

function parseFirefoxProfilesIni(firefoxDir) {
  const iniPath = path.join(firefoxDir, 'profiles.ini');
  if (!pathExists(iniPath)) return [];
  const text = fs.readFileSync(iniPath, 'utf8');
  const profiles = [];
  let section = null;
  let current = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      if (section && section.startsWith('Profile') && current.Path) {
        profiles.push({ ...current });
      }
      section = sectionMatch[1];
      current = { section };
      continue;
    }
    const kv = trimmed.match(/^([^=]+)=(.*)$/);
    if (!kv) continue;
    current[kv[1].trim()] = kv[2].trim();
  }
  if (section && section.startsWith('Profile') && current.Path) {
    profiles.push({ ...current });
  }

  return profiles
    .map((row) => {
      const rel = row.Path || row.path;
      if (!rel) return null;
      const profilePath =
        row.IsRelative === '1' || row.isRelative === '1'
          ? path.join(firefoxDir, rel)
          : rel;
      if (!pathExists(profilePath)) return null;
      const name = String(row.Name || path.basename(profilePath)).trim();
      return {
        id: row.section || name,
        name,
        profilePath,
        browserEngine: 'firefox'
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function collectLooseUrlsFromBookmarkRoot(rootNode) {
  const loose = [];
  for (const child of rootNode?.children || []) {
    if (child.type !== 'url') continue;
    const url = normalizeHttpUrl(child.url);
    if (url) loose.push({ title: String(child.name || url).slice(0, 200), url });
  }
  return loose;
}

function readChromiumBookmarks(profilePath, warnings = []) {
  const bookmarksPath = path.join(profilePath, 'Bookmarks');
  const data = readJsonFile(bookmarksPath);
  if (!data?.roots) {
    if (pathExists(bookmarksPath)) {
      warnings.push('Could not read the bookmarks file in this profile.');
    }
    return {
      bar: [],
      all: [],
      looseBookmarks: [],
      barFolders: [],
      otherFolders: [],
      syncedFolders: [],
      mobileFolders: []
    };
  }
  const roots = data.roots || {};
  const bar = flattenChromiumBookmarks(roots.bookmark_bar, []);
  const other = flattenChromiumBookmarks(roots.other, []);
  const synced = flattenChromiumBookmarks(roots.synced, []);
  const mobile = flattenChromiumBookmarks(roots.mobile, []);
  const looseBar = collectLooseUrlsFromBookmarkRoot(roots.bookmark_bar);
  const looseOther = collectLooseUrlsFromBookmarkRoot(roots.other);
  const looseSynced = collectLooseUrlsFromBookmarkRoot(roots.synced);
  const looseMobile = collectLooseUrlsFromBookmarkRoot(roots.mobile);
  const seen = new Set();
  const all = [];
  for (const item of [...bar, ...other, ...synced, ...mobile]) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    all.push(item);
  }
  const looseSeen = new Set();
  const looseBookmarks = [];
  for (const item of [...looseBar, ...looseOther, ...looseSynced, ...looseMobile]) {
    if (looseSeen.has(item.url)) continue;
    looseSeen.add(item.url);
    looseBookmarks.push(item);
  }
  return {
    bar,
    all,
    looseBookmarks,
    roots,
    barFolders: collectChromiumBookmarkFolders(roots.bookmark_bar, { pinned: true }),
    otherFolders: collectChromiumBookmarkFolders(roots.other, { pinned: false }),
    syncedFolders: collectChromiumBookmarkFolders(roots.synced, { pinned: false }),
    mobileFolders: collectChromiumBookmarkFolders(roots.mobile, { pinned: false })
  };
}

function collectChromiumBookmarkFoldersFromNode(folderNode, { pinned = false, prefix = '' } = {}) {
  const folders = [];
  if (!folderNode || folderNode.type !== 'folder') return folders;

  const name = String(folderNode.name || 'Folder').trim().slice(0, 48) || 'Folder';
  const fullName = prefix ? `${prefix} / ${name}`.slice(0, 80) : name;
  const directUrls = [];
  for (const child of folderNode.children || []) {
    if (child.type === 'url') {
      const url = normalizeHttpUrl(child.url);
      if (url) directUrls.push({ title: String(child.name || url).slice(0, 200), url });
    }
  }
  if (directUrls.length > 0) folders.push({ name, urls: directUrls, pinned });

  for (const child of folderNode.children || []) {
    if (child.type === 'folder') {
      folders.push(...collectChromiumBookmarkFoldersFromNode(child, { pinned, prefix: fullName }));
    }
  }
  return folders;
}

function collectChromiumBookmarkFolders(rootNode, { pinned = false } = {}) {
  const folders = [];
  for (const child of rootNode?.children || []) {
    if (child.type !== 'folder') continue;
    folders.push(...collectChromiumBookmarkFoldersFromNode(child, { pinned }));
  }
  return folders;
}

function readFirefoxBookmarkTree(profilePath, warnings = []) {
  const { rows, error } = querySqliteDb(
    path.join(profilePath, 'places.sqlite'),
    `SELECT b.id, b.parent, b.type, b.title, b.position, p.url
     FROM moz_bookmarks b
     LEFT JOIN moz_places p ON b.fk = p.id
     WHERE b.type IN (1, 2)
     ORDER BY b.parent, b.position`
  );
  const warn = sqliteReadWarning('bookmarks', error);
  if (warn) warnings.push(warn);
  if (!rows.length) return { bar: [], all: [], looseBookmarks: [], barFolders: [], otherFolders: [] };

  const byId = new Map();
  const children = new Map();
  for (const row of rows) {
    byId.set(row.id, row);
    const parent = row.parent;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(row);
  }
  for (const list of children.values()) {
    list.sort((a, b) => (a.position || 0) - (b.position || 0));
  }

  const toolbarRoot = [...byId.values()].find(
    (r) => r.type === 2 && String(r.title || '').toLowerCase() === 'toolbar'
  );
  const menuRoot = [...byId.values()].find(
    (r) => r.type === 2 && String(r.title || '').toLowerCase() === 'menu'
  );
  const unfiledRoot = [...byId.values()].find(
    (r) => r.type === 2 && String(r.title || '').toLowerCase() === 'unfiled'
  );

  const walkFolderTree = (folderId, pinned, prefix = '') => {
    const folders = [];
    const loose = [];
    for (const child of children.get(folderId) || []) {
      if (child.type === 1) {
        const url = normalizeHttpUrl(child.url);
        if (url) loose.push({ title: String(child.title || url).slice(0, 200), url });
      } else if (child.type === 2) {
        const name = String(child.title || 'Folder').trim().slice(0, 48) || 'Folder';
        const fullName = prefix ? `${prefix} / ${name}`.slice(0, 80) : name;
        const urls = [];
        for (const sub of children.get(child.id) || []) {
          if (sub.type === 1) {
            const url = normalizeHttpUrl(sub.url);
            if (url) urls.push({ title: String(sub.title || url).slice(0, 200), url });
          }
        }
        if (urls.length > 0) folders.push({ name, urls, pinned });
        const nested = walkFolderTree(child.id, pinned, fullName);
        folders.push(...nested.folders);
        loose.push(...nested.loose);
      }
    }
    return { folders, loose };
  };

  const walkFolder = (folderId, pinned) => walkFolderTree(folderId, pinned);

  const barData = toolbarRoot ? walkFolder(toolbarRoot.id, true) : { folders: [], loose: [] };
  const otherParts = [];
  for (const root of [menuRoot, unfiledRoot].filter(Boolean)) {
    const part = walkFolder(root.id, false);
    otherParts.push(part);
  }

  const bar = barData.loose;
  const looseBookmarks = [...bar];
  const looseSeen = new Set(bar.map((item) => item.url));
  for (const part of otherParts) {
    for (const item of part.loose) {
      if (!item?.url || looseSeen.has(item.url)) continue;
      looseSeen.add(item.url);
      looseBookmarks.push(item);
    }
  }
  const allSeen = new Set();
  const all = [];
  const pushAll = (item) => {
    if (!item?.url || allSeen.has(item.url)) return;
    allSeen.add(item.url);
    all.push(item);
  };
  for (const item of looseBookmarks) pushAll(item);
  for (const part of otherParts) {
    for (const folder of part.folders) {
      for (const item of folder.urls) pushAll(item);
    }
  }
  for (const folder of barData.folders) {
    for (const item of folder.urls) pushAll(item);
  }

  return {
    bar,
    all,
    looseBookmarks,
    barFolders: barData.folders,
    otherFolders: otherParts.flatMap((p) => p.folders)
  };
}

function mapHistoryRows(rows, timeField, toIso) {
  return rows
    .map((row, index) => {
      const url = normalizeHttpUrl(row.url);
      if (!url) return null;
      return {
        id: Date.now() + index,
        url,
        title: String(row.title || url).slice(0, 300),
        timestamp: toIso(row[timeField]),
        favicon: ''
      };
    })
    .filter(Boolean);
}

function readChromiumHistory(profilePath, limit = 2000, warnings = []) {
  const historyPath = path.join(profilePath, 'History');
  let { rows, error } = querySqliteDb(
    historyPath,
    'SELECT url, title, CAST(last_visit_time AS TEXT) AS last_visit_time FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ?',
    [limit]
  );
  if ((!rows.length || error) && pathExists(historyPath)) {
    const fallback = querySqliteDb(
      historyPath,
      `SELECT u.url, u.title, CAST(MAX(v.visit_time) AS TEXT) AS last_visit_time
       FROM urls u
       INNER JOIN visits v ON u.id = v.url
       WHERE u.hidden = 0
       GROUP BY u.id
       ORDER BY last_visit_time DESC
       LIMIT ?`,
      [limit]
    );
    if (fallback.rows.length > 0) {
      rows = fallback.rows;
      error = fallback.error;
    }
  }
  const warn = sqliteReadWarning('browsing history', error);
  if (warn && rows.length === 0) warnings.push(warn);
  return mapHistoryRows(rows, 'last_visit_time', chromiumTimeToIso);
}

function readFirefoxBookmarks(profilePath, warnings = []) {
  const tree = readFirefoxBookmarkTree(profilePath, warnings);
  return tree;
}

function readFirefoxHistory(profilePath, limit = 2000, warnings = []) {
  const { rows, error } = querySqliteDb(
    path.join(profilePath, 'places.sqlite'),
    `SELECT url, title, CAST(last_visit_date AS TEXT) AS last_visit_date
     FROM moz_places
     WHERE visit_count > 0 AND url NOT LIKE 'place:%'
     ORDER BY last_visit_date DESC
     LIMIT ?`,
    [limit]
  );
  const warn = sqliteReadWarning('browsing history', error);
  if (warn && rows.length === 0) warnings.push(warn);
  return mapHistoryRows(rows, 'last_visit_date', firefoxTimeToIso);
}

function readChromiumSearchEngine(profilePath) {
  const prefs = readJsonFile(path.join(profilePath, 'Preferences'));
  const dsp = prefs?.default_search_provider_data || prefs?.default_search_provider;
  const name = String(dsp?.short_name || dsp?.keyword || '').toLowerCase();
  for (const [key, value] of Object.entries(SEARCH_ENGINE_MAP)) {
    if (name.includes(key)) return value;
  }
  return null;
}

function readFirefoxSearchEngine(profilePath) {
  const prefsPath = path.join(profilePath, 'prefs.js');
  if (!pathExists(prefsPath)) return null;
  try {
    const text = fs.readFileSync(prefsPath, 'utf8');
    const match = text.match(/browser\.search\.defaultenginename",\s*"([^"]+)"/);
    const engine = String(match?.[1] || '').toLowerCase();
    for (const [key, value] of Object.entries(SEARCH_ENGINE_MAP)) {
      if (engine.includes(key)) return value;
    }
  } catch (_) {}
  return null;
}

function listImportableBrowsers() {
  return browserDefs()
    .map((def) => {
      const userDataPath = def.resolvePath();
      if (!pathExists(userDataPath)) return null;
      let profileCount = 0;
      try {
        profileCount =
          def.engine === 'firefox'
            ? parseFirefoxProfilesIni(userDataPath).length
            : listChromiumProfiles(userDataPath).length;
      } catch (_) {
        profileCount = 0;
      }
      if (profileCount === 0) return null;
      return {
        id: def.id,
        name: def.name,
        engine: def.engine,
        userDataPath,
        profileCount
      };
    })
    .filter(Boolean);
}

function listBrowserImportProfiles(browserId) {
  const def = browserDefs().find((b) => b.id === browserId);
  if (!def) return [];
  const userDataPath = def.resolvePath();
  if (!pathExists(userDataPath)) return [];
  return def.engine === 'firefox'
    ? parseFirefoxProfilesIni(userDataPath)
    : listChromiumProfiles(userDataPath);
}

function resolveChromiumUserDataPath(profilePath) {
  if (looksLikeChromiumProfileDir(profilePath)) return path.dirname(profilePath);
  return profilePath;
}

function isProfileFolderWithinUserData(profilePath, userDataPath) {
  const resolvedProfile = path.resolve(profilePath);
  const resolvedUser = path.resolve(userDataPath);
  if (resolvedProfile === resolvedUser) return false;
  const rel = path.relative(resolvedUser, resolvedProfile);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function finalizeImportSource(source) {
  const profilePath = path.resolve(String(source.profilePath || ''));
  if (!profilePath || !pathExists(profilePath)) {
    throw new Error('Browser profile folder not found');
  }

  const browserEngine = source.browserEngine;
  let userDataPath = source.userDataPath
    ? path.resolve(String(source.userDataPath))
    : browserEngine === 'chromium'
      ? resolveChromiumUserDataPath(profilePath)
      : profilePath;

  const profileId = String(source.id || source.sourceProfileId || path.basename(profilePath)).trim();
  const profileBasename = path.basename(profilePath);

  if (browserEngine === 'chromium') {
    if (profileBasename === 'User Data' || profileBasename === 'Local State') {
      throw new Error(
        'Choose one browser profile (such as Default or Profile 1), not the whole browser data folder.'
      );
    }
    if (!isProfileFolderWithinUserData(profilePath, userDataPath) && looksLikeChromiumProfileDir(profilePath)) {
      userDataPath = resolveChromiumUserDataPath(profilePath);
    }
    const resolvedProfile = path.resolve(profilePath);
    const resolvedUser = path.resolve(userDataPath);
    const sameRootProfile = resolvedProfile === resolvedUser && looksLikeChromiumProfileDir(profilePath);
    if (!sameRootProfile && !isProfileFolderWithinUserData(profilePath, userDataPath)) {
      throw new Error('The selected folder is not a single browser profile.');
    }
  }

  return {
    ...source,
    profilePath,
    userDataPath,
    id: profileId,
    profileId,
    profileBasename,
    profileLabel: String(source.name || profileId || profileBasename).trim() || profileBasename
  };
}

function inferBrowserIdFromPath(profilePath, userDataPath, engine) {
  if (engine !== 'chromium') return '';
  const resolvedUser = path.resolve(userDataPath || resolveChromiumUserDataPath(profilePath));
  for (const def of browserDefs()) {
    if (def.engine !== 'chromium') continue;
    try {
      const defPath = path.resolve(def.resolvePath());
      if (resolvedUser === defPath || resolvedUser.startsWith(defPath + path.sep)) {
        return def.id;
      }
    } catch (_) {}
  }
  const lower = resolvedUser.toLowerCase();
  const hints = [
    ['arc/user data', 'arc'],
    ['/arc/', 'arc'],
    ['dia/user data', 'dia'],
    ['/dia/', 'dia'],
    ['sidekick', 'sidekick'],
    ['brave-browser', 'brave'],
    ['microsoft/edge', 'edge'],
    ['google/chrome', 'chrome'],
    ['vivaldi', 'vivaldi'],
    ['yandexbrowser', 'yandex']
  ];
  for (const [needle, id] of hints) {
    if (lower.includes(needle)) return id;
  }
  return '';
}

function resolveImportSource(payload = {}) {
  if (payload.customProfilePath) {
    const profilePath = String(payload.customProfilePath).trim();
    if (!pathExists(profilePath)) throw new Error('Profile folder not found');
    const engine = pathExists(path.join(profilePath, 'places.sqlite'))
      ? 'firefox'
      : looksLikeChromiumProfileDir(profilePath)
        ? 'chromium'
        : null;
    if (!engine) throw new Error('This folder does not look like a browser profile');
    const userDataPath =
      engine === 'chromium' ? resolveChromiumUserDataPath(profilePath) : profilePath;
    const browserId =
      String(payload.browserId || '').trim() ||
      inferBrowserIdFromPath(profilePath, userDataPath, engine);
    return finalizeImportSource({
      name: path.basename(profilePath),
      profilePath,
      browserEngine: engine,
      browserId,
      userDataPath,
      id: path.basename(profilePath)
    });
  }
  const browserId = String(payload.browserId || '').trim();
  const sourceProfileId = String(payload.sourceProfileId || '').trim();
  if (!browserId || !sourceProfileId) throw new Error('Choose a browser and profile to import');
  const def = browserDefs().find((b) => b.id === browserId);
  const profiles = listBrowserImportProfiles(browserId);
  const match = profiles.find((p) => p.id === sourceProfileId);
  if (!match) throw new Error('Browser profile not found');
  return finalizeImportSource({
    ...match,
    browserId,
    userDataPath: def?.resolvePath?.() || path.dirname(match.profilePath)
  });
}

function importFaviconUrl(_url) {
  // Don't bake a proxy favicon at import — display falls back, then the live
  // page favicon replaces it when the favorite is opened.
  return null;
}

function makeAxisTabEntry(item, id, order) {
  return {
    id,
    url: item.url,
    title: String(item.title || item.url).slice(0, 200),
    favicon: item.favicon || importFaviconUrl(item.url),
    order
  };
}

function makeAxisTabGroup({ name, urls, order, color, pinned, open, ts, groupIndex, nextTabId }) {
  const groupId = `import-grp-${ts}-${groupIndex}`;
  const tabs = urls.map((item) => {
    const tabId = nextTabId();
    return {
      id: tabId,
      url: item.url,
      title: String(item.title || item.url).slice(0, 200),
      favicon: item.favicon || importFaviconUrl(item.url)
    };
  });
  return {
    id: groupId,
    name: String(name || 'Imported group').slice(0, 48),
    tabIds: tabs.map((t) => t.id),
    tabs,
    open: open !== false,
    order,
    color: color || AXIS_GROUP_COLORS[order % AXIS_GROUP_COLORS.length],
    pinned: pinned !== false,
    icon: null,
    iconType: null,
    hadTabs: tabs.length > 0
  };
}

function buildAxisImportLayout({
  sessionTabs,
  bookmarkFolders,
  bookmarkUrls,
  browserFavorites,
  options = {}
}) {
  const importFavorites = options.importFavorites !== false;
  const importBookmarks = options.importBookmarks !== false;
  const importFolders = options.importFolders !== false;
  const importOpenTabs = options.importOpenTabs === true;

  const usedUrls = new Set();
  const duplicateSkips = [];
  const pinnedTabs = [];
  const tabGroups = [];
  const unpinnedTabs = [];
  const favorites = [];
  const ts = Date.now();
  let groupOrder = 0;
  let pinOrder = 0;
  let unpinOrder = 0;
  let importTabIdSeq = 0;
  const nextTabId = () => {
    importTabIdSeq += 1;
    return Math.min(Number.MAX_SAFE_INTEGER, ts * 1000 + importTabIdSeq);
  };

  const claim = (url, label) => {
    if (!url) return false;
    if (usedUrls.has(url)) {
      duplicateSkips.push(label);
      return false;
    }
    usedUrls.add(url);
    return true;
  };

  const sessionList = Array.isArray(sessionTabs) ? sessionTabs : [];

  if (importFolders) {
    const sessionGroups = new Map();
    for (const tab of sessionList) {
      if (!tab.groupKey) continue;
      if (!sessionGroups.has(tab.groupKey)) {
        sessionGroups.set(tab.groupKey, {
          name: tab.groupName || 'Imported group',
          color: tab.groupColor || AXIS_GROUP_COLORS[groupOrder % AXIS_GROUP_COLORS.length],
          pinned: tab.pinned !== false,
          open: tab.groupCollapsed !== true,
          urls: []
        });
      }
      if (claim(tab.url, 'tab group')) sessionGroups.get(tab.groupKey).urls.push(tab);
    }

    for (const grp of sessionGroups.values()) {
      if (grp.urls.length === 0) continue;
      tabGroups.push(
        makeAxisTabGroup({
          name: grp.name,
          urls: grp.urls,
          order: groupOrder,
          color: grp.color,
          pinned: grp.pinned,
          open: grp.open,
          ts,
          groupIndex: groupOrder++,
          nextTabId
        })
      );
    }

    for (const folder of bookmarkFolders || []) {
      const urls = (folder.urls || []).filter((item) => claim(item.url, 'tab group'));
      if (urls.length === 0) continue;
      tabGroups.push(
        makeAxisTabGroup({
          name: folder.name,
          urls,
          order: groupOrder,
          color: AXIS_GROUP_COLORS[groupOrder % AXIS_GROUP_COLORS.length],
          pinned: folder.pinned !== false,
          open: true,
          ts,
          groupIndex: groupOrder++,
          nextTabId
        })
      );
    }
  }

  if (importFavorites) {
    for (const tab of sessionList) {
      if (!tab.pinned || tab.groupKey) continue;
      if (!claim(tab.url, 'favorite')) continue;
      favorites.push({
        id: `import-${ts}-fav-${favorites.length}`,
        url: tab.url,
        title: String(tab.title || tab.url).slice(0, 200),
        favicon: tab.favicon || importFaviconUrl(tab.url),
        order: favorites.length
      });
      if (favorites.length >= FAVORITES_IMPORT_LIMIT) break;
    }

    for (const item of browserFavorites || []) {
      if (!item?.url || !claim(item.url, 'favorite')) continue;
      favorites.push({
        id: `import-${ts}-fav-${favorites.length}`,
        url: item.url,
        title: String(item.title || item.url).slice(0, 200),
        favicon: item.favicon || importFaviconUrl(item.url),
        order: favorites.length
      });
      if (favorites.length >= FAVORITES_IMPORT_LIMIT) break;
    }
  }

  if (importBookmarks) {
    for (const item of bookmarkUrls || []) {
      if (!claim(item.url, 'pinned tab')) continue;
      pinnedTabs.push(makeAxisTabEntry(item, nextTabId(), pinOrder++));
    }
  }

  if (importOpenTabs) {
    for (const tab of sessionList) {
      if (tab.pinned || tab.groupKey) continue;
      if (!claim(tab.url, 'open tab')) continue;
      unpinnedTabs.push(makeAxisTabEntry(tab, nextTabId(), unpinOrder++));
    }
  }

  const layoutWarnings = [];
  if (duplicateSkips.length > 0) {
    layoutWarnings.push(
      `${duplicateSkips.length} duplicate link${duplicateSkips.length === 1 ? '' : 's'} appeared in more than one place and ${duplicateSkips.length === 1 ? 'was' : 'were'} only imported once.`
    );
  }

  return { favorites, pinnedTabs, tabGroups, unpinnedTabs, layoutWarnings };
}

function extractImportData(source, options = {}) {
  const scopedSource = finalizeImportSource(source);
  const importFavorites = options.importFavorites !== false;
  const importBookmarks = options.importBookmarks !== false;
  const importFolders = options.importFolders !== false;
  const importOpenTabs = options.importOpenTabs === true;
  const importHistory = options.importHistory !== false;
  const engine = scopedSource.browserEngine;
  let bookmarks = { looseBookmarks: [], barFolders: [], otherFolders: [] };
  let history = [];
  let searchEngine = null;
  let sessionTabs = [];

  const importWarnings = [
    `Reading data only from browser profile “${scopedSource.profileLabel}” (${scopedSource.profileBasename}).`
  ];

  let sidebarData = null;
  let sidebarAuthoritative = false;
  let browserFavorites = [];
  let bookmarkUrls = [];
  let bookmarkFolders = [];

  if (engine === 'chromium') {
    bookmarks = readChromiumBookmarks(scopedSource.profilePath, importWarnings);
    const browserId = String(scopedSource.browserId || '').trim();
    if (SIDEBAR_PROFILE_BROWSERS.has(browserId)) {
      sidebarData = readStorableSidebarBookmarks(
        scopedSource.userDataPath || path.dirname(scopedSource.profilePath),
        browserId,
        scopedSource
      );
      if (!sidebarData) {
        importWarnings.push(
          `Could not find sidebar data for ${browserId === 'arc' ? 'Arc' : browserId}. Bookmarks and session will still be imported from the profile folder.`
        );
      }
    }

    sidebarAuthoritative = !!sidebarData?.sidebarAuthoritative;

    if (sidebarAuthoritative) {
      const spaceList = (sidebarData.matchedSpaces || []).join(', ');
      importWarnings.push(
        spaceList
          ? `Using sidebar for “${sidebarData.profileBasename}” (spaces: ${spaceList}). Bookmark folders from the profile file were skipped.`
          : `Using sidebar for “${sidebarData.profileBasename}”. Bookmark folders from the profile file were skipped.`
      );
      if (importFavorites) {
        browserFavorites = [...(sidebarData.favorites || []), ...(sidebarData.bar || [])];
      }
      if (importFolders) {
        bookmarkFolders = [...(sidebarData.barFolders || [])];
      }
    } else if (sidebarData?.emptyForProfile) {
      importWarnings.push(
        `No sidebar data matched browser profile “${sidebarData.profileBasename}”. Bookmarks and session still came from that profile folder only.`
      );
    }

    if (!sidebarAuthoritative) {
      if (importBookmarks) {
        bookmarkUrls = [...(bookmarks.looseBookmarks || [])];
      }
      if (importFolders) {
        bookmarkFolders = [
          ...(bookmarks.barFolders || []),
          ...(bookmarks.otherFolders || []),
          ...(bookmarks.syncedFolders || []),
          ...(bookmarks.mobileFolders || [])
        ];
      }
    } else if (importBookmarks || importFolders) {
      importWarnings.push(
        'For Arc, Dia, and Sidekick, favorites and tab groups come from the sidebar — not the separate bookmarks file.'
      );
    }

    if (importHistory) {
      history = readChromiumHistory(scopedSource.profilePath, HISTORY_IMPORT_LIMIT, importWarnings);
    }
    searchEngine = readChromiumSearchEngine(scopedSource.profilePath);

    const needsSession =
      importOpenTabs || (!sidebarAuthoritative && (importFavorites || importFolders));
    if (needsSession) {
      const session = extractBrowserSession(scopedSource.profilePath, 'chromium');
      sessionTabs = session.tabs || [];
      importWarnings.push(...(session.warnings || []));
      const openCount = sessionTabs.filter((tab) => !tab.pinned && !tab.groupKey).length;
      if (!importOpenTabs && openCount > 0) {
        importWarnings.push(
          `${openCount} open tab${openCount === 1 ? '' : 's'} from the last session were skipped. Turn on “Import open tabs” to bring them in as unpinned tabs.`
        );
      }
    }
  } else if (engine === 'firefox') {
    bookmarks = readFirefoxBookmarks(scopedSource.profilePath, importWarnings);
    if (importBookmarks) bookmarkUrls = [...(bookmarks.looseBookmarks || [])];
    if (importFolders) {
      bookmarkFolders = [...(bookmarks.barFolders || []), ...(bookmarks.otherFolders || [])];
    }
    if (importHistory) {
      history = readFirefoxHistory(scopedSource.profilePath, HISTORY_IMPORT_LIMIT, importWarnings);
    }
    searchEngine = readFirefoxSearchEngine(scopedSource.profilePath);

    const needsSession = importFavorites || importOpenTabs || importFolders;
    if (needsSession) {
      const session = extractBrowserSession(scopedSource.profilePath, 'firefox');
      sessionTabs = session.tabs || [];
      importWarnings.push(...(session.warnings || []));
      const openCount = sessionTabs.filter((tab) => !tab.pinned && !tab.groupKey).length;
      if (!importOpenTabs && openCount > 0) {
        importWarnings.push(
          `${openCount} open tab${openCount === 1 ? '' : 's'} from the last session were skipped. Turn on “Import open tabs” to bring them in as unpinned tabs.`
        );
      }
    }
  }

  if (importHistory && history.length === 0) {
    const dbName = engine === 'firefox' ? 'places.sqlite' : 'History';
    const dbPath = path.join(scopedSource.profilePath, dbName);
    if (!pathExists(dbPath)) {
      importWarnings.push('No browsing history file was found in this profile.');
    } else if (!importWarnings.some((w) => /browsing history/i.test(w))) {
      importWarnings.push(
        'No browsing history entries were read from this profile. Quit the source browser and try importing again.'
      );
    }
  }

  const layout = buildAxisImportLayout({
    sessionTabs,
    bookmarkFolders,
    bookmarkUrls,
    browserFavorites,
    options: {
      importFavorites,
      importBookmarks,
      importFolders,
      importOpenTabs
    }
  });

  if (importFavorites && layout.favorites.length >= FAVORITES_IMPORT_LIMIT) {
    importWarnings.push(
      `Only the first ${FAVORITES_IMPORT_LIMIT} favorites were imported. Export and import a backup for a full library.`
    );
  }

  const secrets = extractBrowserSecrets(scopedSource, {
    importPasswords: options.importPasswords !== false,
    importCards: options.importCards !== false,
    importAddresses: options.importAddresses !== false
  });

  const extras = extractBrowserExtras(scopedSource, {
    importSitePermissions: options.importSitePermissions !== false,
    importExtensions: options.importExtensions !== false
  });

  importWarnings.push(...(layout.layoutWarnings || []), ...(secrets.warnings || []), ...(extras.warnings || []));

  return {
    favorites: layout.favorites,
    pinnedTabs: layout.pinnedTabs,
    tabGroups: layout.tabGroups,
    unpinnedTabs: layout.unpinnedTabs,
    history,
    searchEngine,
    vaultLogins: secrets.logins,
    vaultCards: secrets.cards,
    vaultAddresses: secrets.addresses,
    sitePermissionOverrides: extras.sitePermissionOverrides,
    extensions: extras.extensions,
    importWarnings
  };
}

function buildImportPreview(extracted) {
  const extCount =
    (extracted.extensions?.webStore?.length || 0) + (extracted.extensions?.unpacked?.length || 0);
  const permCount = Object.keys(extracted.sitePermissionOverrides || {}).length;
  return {
    favorites: extracted.favorites.length,
    pinnedTabs: extracted.pinnedTabs.length,
    tabGroups: extracted.tabGroups.length,
    openTabs: extracted.unpinnedTabs.length,
    history: extracted.history.length,
    passwords: extracted.vaultLogins.length,
    cards: extracted.vaultCards.length,
    addresses: extracted.vaultAddresses.length,
    extensions: extCount,
    sitePermissions: permCount
  };
}

function previewBrowserImport(payload = {}) {
  const source = resolveImportSource(payload);
  const extracted = extractImportData(source, payload);
  return {
    ok: true,
    name: source.name,
    engine: source.browserEngine,
    preview: buildImportPreview(extracted),
    warnings: extracted.importWarnings
  };
}

function mergeHistory(existing, incoming, limit = AXIS_PROFILE_HISTORY_MAX) {
  const byUrl = new Map();
  for (const row of [...incoming, ...(Array.isArray(existing) ? existing : [])]) {
    const url = normalizeHttpUrl(row?.url);
    if (!url) continue;
    const prev = byUrl.get(url);
    const ts = row.timestamp || new Date().toISOString();
    if (!prev || String(ts) > String(prev.timestamp)) {
      byUrl.set(url, {
        id: row.id || Date.now() + byUrl.size,
        url,
        title: String(row.title || url).slice(0, 300),
        timestamp: ts,
        favicon: row.favicon || ''
      });
    }
  }
  return Array.from(byUrl.values())
    .sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)))
    .slice(0, limit);
}

function importVaultEntries(vault, extracted) {
  let logins = 0;
  let cards = 0;
  const seenLogins = new Set();

  let addresses = 0;
  const seenAddresses = new Set();

  for (const login of extracted.vaultLogins || []) {
    const key = `${login.origin}\0${login.username}`;
    if (seenLogins.has(key)) continue;
    seenLogins.add(key);
    try {
      vault.saveLogin({
        origin: login.origin,
        username: login.username,
        password: login.password,
        title: login.title || ''
      });
      logins += 1;
    } catch (_) {}
  }

  for (const card of extracted.vaultCards || []) {
    try {
      vault.saveCard({
        label: card.label || '',
        cardholder: card.cardholder,
        number: card.number,
        expMonth: card.expMonth,
        expYear: card.expYear,
        cvv: card.cvv || '',
        billingZip: card.billingZip || ''
      });
      cards += 1;
    } catch (_) {}
  }

  for (const addr of extracted.vaultAddresses || []) {
    const key = `${addr.fullName}\0${addr.addressLine1}\0${addr.postalCode}`;
    if (seenAddresses.has(key)) continue;
    seenAddresses.add(key);
    try {
      vault.saveAddress({
        label: addr.label || '',
        fullName: addr.fullName,
        organization: addr.organization || '',
        addressLine1: addr.addressLine1,
        addressLine2: addr.addressLine2 || '',
        city: addr.city,
        state: addr.state || '',
        postalCode: addr.postalCode,
        country: addr.country || '',
        phone: addr.phone || '',
        email: addr.email || ''
      });
      addresses += 1;
    } catch (_) {}
  }

  return { logins, cards, addresses };
}

async function importExtensionsForProfile(deps, profileId, extensions, options = {}) {
  const installFn = deps.installExtensionForProfileImport;
  if (!installFn || options.importExtensions === false) {
    return { installed: 0, failed: 0, found: 0, warnings: [] };
  }
  const warnings = [];
  let installed = 0;
  let failed = 0;
  const webStore = (extensions?.webStore || []).filter((e) => e.enabled !== false);
  const unpacked = (extensions?.unpacked || []).filter((e) => e.enabled !== false);
  const foundCount = webStore.length + unpacked.length;
  const queue = [
    ...unpacked.map((e) => ({ kind: 'folder', ...e })),
    ...webStore.map((e) => ({ kind: 'store', ...e }))
  ].slice(0, 30);

  for (const item of queue) {
    try {
      if (item.kind === 'folder') {
        await installFn(profileId, { folder: item.folder, id: item.id });
      } else if (item.amoSlug) {
        await installFn(profileId, {
          amoSlug: item.amoSlug,
          url: `https://addons.mozilla.org/firefox/addon/${item.amoSlug}/`
        });
      } else {
        await installFn(profileId, { id: item.id });
      }
      installed += 1;
    } catch (e) {
      failed += 1;
      if (failed <= 3) {
        warnings.push(`Could not import extension “${item.name || item.id}”.`);
      }
    }
  }
  if (failed > 3) {
    warnings.push(`${failed - 3} more extensions could not be imported.`);
  }
  if (foundCount > 0 && installed === 0) {
    warnings.push(
      `Found ${foundCount} extension${foundCount === 1 ? '' : 's'} in the source profile but could not install any. Check your internet connection or install them manually from Settings → Extensions.`
    );
  } else if (installed > 0 && failed > 0) {
    warnings.push(
      `${installed} extension${installed === 1 ? '' : 's'} imported; ${failed} could not be installed.`
    );
  }
  return { installed, failed, found: foundCount, warnings };
}

/**
 * Import bookmarks/history from another browser into a new or existing Axis profile.
 * @param {object} deps - main-process helpers
 */
async function importBrowserProfileData(deps, payload = {}) {
  const {
    allocateProfileId,
    ensureAxisProfile,
    getProfileStore,
    normalizeFavoritesStoreList,
    broadcastProfilesUpdated,
    broadcastSettingsUpdated,
    sanitizeProfileIcon,
    ensureAxisVaultForProfile
  } = deps;

  const source = resolveImportSource(payload);
  const extracted = extractImportData(source, payload);
  const displayName =
    String(payload.profileName || source.name || 'Imported').trim().slice(0, 48) || 'Imported';

  let profileId = payload.targetProfileId ? String(payload.targetProfileId).trim() : '';
  if (profileId) {
    ensureAxisProfile(profileId, displayName);
  } else {
    const allocated = allocateProfileId(displayName);
    profileId = allocated.id;
    ensureAxisProfile(profileId, allocated.name, sanitizeProfileIcon(payload.icon || 'user'));
  }

  const store = getProfileStore(profileId);
  const isFreshProfileImport = !payload.targetProfileId;
  const stats = {
    favorites: 0,
    pinnedTabs: 0,
    tabGroups: 0,
    unpinnedTabs: 0,
    history: 0,
    passwords: 0,
    cards: 0,
    addresses: 0,
    extensions: 0,
    sitePermissions: 0
  };
  const warnings = Array.isArray(extracted.importWarnings) ? [...extracted.importWarnings] : [];

  if (extracted.favorites.length > 0) {
    if (isFreshProfileImport) {
      store.set('favorites', normalizeFavoritesStoreList(extracted.favorites));
    } else {
      const merged = normalizeFavoritesStoreList([
        ...(Array.isArray(store.get('favorites')) ? store.get('favorites') : []),
        ...extracted.favorites
      ]);
      store.set('favorites', merged);
    }
    stats.favorites = extracted.favorites.length;
  }

  const hasPinned = Array.isArray(store.get('pinnedTabs')) && store.get('pinnedTabs').length > 0;
  const hasGroups = Array.isArray(store.get('tabGroups')) && store.get('tabGroups').length > 0;
  const hasUnpinned = Array.isArray(store.get('unpinnedTabs')) && store.get('unpinnedTabs').length > 0;

  if (extracted.pinnedTabs.length > 0 && (isFreshProfileImport || !hasPinned)) {
    store.set('pinnedTabs', extracted.pinnedTabs);
    stats.pinnedTabs = extracted.pinnedTabs.length;
  } else if (extracted.pinnedTabs.length > 0 && hasPinned) {
    warnings.push(
      `${extracted.pinnedTabs.length} pinned tab${extracted.pinnedTabs.length === 1 ? '' : 's'} were skipped because this profile already has pinned tabs.`
    );
  }

  if (extracted.tabGroups.length > 0 && (isFreshProfileImport || !hasGroups)) {
    store.set('tabGroups', extracted.tabGroups);
    stats.tabGroups = extracted.tabGroups.length;
  } else if (extracted.tabGroups.length > 0 && hasGroups) {
    warnings.push(
      `${extracted.tabGroups.length} tab group${extracted.tabGroups.length === 1 ? '' : 's'} were skipped because this profile already has tab groups.`
    );
  }

  if (extracted.unpinnedTabs.length > 0 && (isFreshProfileImport || !hasUnpinned)) {
    store.set('unpinnedTabs', extracted.unpinnedTabs);
    stats.unpinnedTabs = extracted.unpinnedTabs.length;
  } else if (extracted.unpinnedTabs.length > 0 && hasUnpinned) {
    warnings.push(
      `${extracted.unpinnedTabs.length} open tab${extracted.unpinnedTabs.length === 1 ? '' : 's'} were skipped because this profile already has unpinned tabs.`
    );
  }

  if (extracted.history.length > 0) {
    if (isFreshProfileImport) {
      store.set('historyItems', trimProfileHistoryItems(extracted.history));
    } else {
      const mergedHistory = mergeHistory(store.get('historyItems'), extracted.history);
      store.set('historyItems', mergedHistory);
    }
    stats.history = extracted.history.length;
  }

  if (extracted.searchEngine && !payload.targetProfileId) {
    store.set('searchEngine', extracted.searchEngine);
  }

  if (payload.themeColor) {
    store.set('themeColor', String(payload.themeColor));
  }

  if (payload.searchEngine) {
    store.set('searchEngine', String(payload.searchEngine));
  }

  if (
    extracted.sitePermissionOverrides &&
    Object.keys(extracted.sitePermissionOverrides).length > 0 &&
    deps.cleanSitePermissionOverrides
  ) {
    const existing = store.get('sitePermissionOverrides', {});
    const merged = deps.cleanSitePermissionOverrides(
      mergeSitePermissionOverrides(existing, extracted.sitePermissionOverrides)
    );
    store.set('sitePermissionOverrides', merged);
    stats.sitePermissions = Object.keys(extracted.sitePermissionOverrides).length;
  }

  if (ensureAxisVaultForProfile) {
    const vault = ensureAxisVaultForProfile(profileId);
    const vaultStats = importVaultEntries(vault, extracted);
    stats.passwords = vaultStats.logins;
    stats.cards = vaultStats.cards;
    stats.addresses = vaultStats.addresses;
  }

  const extStats = await importExtensionsForProfile(deps, profileId, extracted.extensions, payload);
  stats.extensions = extStats.installed;
  stats.extensionsFound = extStats.found;
  warnings.push(...(extStats.warnings || []));

  broadcastProfilesUpdated(profileId);
  if (typeof broadcastSettingsUpdated === 'function') {
    broadcastSettingsUpdated(profileId);
  }
  if (deps.broadcastExtensionsReady && stats.extensions > 0) {
    deps.broadcastExtensionsReady(profileId);
  }
  return {
    ok: true,
    profileId,
    profileName: displayName,
    stats,
    warnings
  };
}

const AXIS_PROFILE_EXPORT_KEYS = [
  'favorites',
  'pinnedTabs',
  'tabGroups',
  'unpinnedTabs',
  'historyItems',
  'searchEngine',
  'themeColor',
  'gradientColor',
  'gradientEnabled',
  'gradientDirection',
  'uiTheme',
  'siteThemeColor',
  'transparentSites',
  'linkPreview',
  'ntpWelcomeEnabled',
  'ntpWelcomeGreeting',
  'ntpGreetingName',
  'ntpAiSearchEnabled',
  'ntpWidgetsEnabled',
  'ntpWidgetLayout',
  'ambientAudioEnabled',
  'ambientAudioPreset',
  'ambientAudioVolume',
  'ambientMuteWhenTabAudio',
  'sitePermissionOverrides'
];

function buildAxisProfileExportPayload(profileStore, profileMeta, vaultPayload = null) {
  const data = {};
  for (const key of AXIS_PROFILE_EXPORT_KEYS) {
    const val = profileStore.get(key);
    if (val !== undefined) data[key] = val;
  }
  if (Array.isArray(data.historyItems) && data.historyItems.length > 500) {
    data.historyItems = data.historyItems.slice(0, 500);
  }
  if (vaultPayload && (vaultPayload.logins?.length || vaultPayload.cards?.length || vaultPayload.addresses?.length)) {
    data.vault = {
      logins: Array.isArray(vaultPayload.logins) ? vaultPayload.logins : [],
      cards: Array.isArray(vaultPayload.cards) ? vaultPayload.cards : [],
      addresses: Array.isArray(vaultPayload.addresses) ? vaultPayload.addresses : []
    };
  }
  return {
    format: 'axis-profile-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    profile: {
      name: profileMeta?.name || 'Profile',
      icon: profileMeta?.icon || 'user'
    },
    data
  };
}

function importAxisProfileBackup(deps, payload, profileNameOverride) {
  const {
    allocateProfileId,
    ensureAxisProfile,
    getProfileStore,
    normalizeFavoritesStoreList,
    broadcastProfilesUpdated,
    sanitizeProfileIcon,
    ensureAxisVaultForProfile,
    cleanSitePermissionOverrides
  } = deps;
  if (!payload || payload.format !== 'axis-profile-backup' || !payload.data) {
    throw new Error('Not a valid Axis profile backup file');
  }
  const displayName = String(profileNameOverride || payload.profile?.name || 'Imported').trim().slice(0, 48);
  const allocated = allocateProfileId(displayName);
  const profileId = allocated.id;
  ensureAxisProfile(profileId, allocated.name, sanitizeProfileIcon(payload.profile?.icon || 'user'));
  const store = getProfileStore(profileId);
  const data = payload.data || {};
  for (const key of AXIS_PROFILE_EXPORT_KEYS) {
    if (data[key] === undefined) continue;
    if (key === 'favorites') {
      store.set(key, normalizeFavoritesStoreList(data.favorites));
    } else if (key === 'sitePermissionOverrides' && deps.cleanSitePermissionOverrides) {
      store.set(key, deps.cleanSitePermissionOverrides(data[key]));
    } else {
      store.set(key, data[key]);
    }
  }
  if (ensureAxisVaultForProfile && data.vault) {
    importVaultEntries(ensureAxisVaultForProfile(profileId), {
      vaultLogins: data.vault.logins,
      vaultCards: data.vault.cards,
      vaultAddresses: data.vault.addresses
    });
  }
  broadcastProfilesUpdated();
  return { ok: true, profileId, profileName: allocated.name };
}

function inspectCustomProfileFolder(folderPath, options = {}) {
  const profilePath = String(folderPath || '').trim();
  if (!pathExists(profilePath)) return { ok: false, error: 'Folder not found' };
  const engine = pathExists(path.join(profilePath, 'places.sqlite'))
    ? 'firefox'
    : looksLikeChromiumProfileDir(profilePath)
      ? 'chromium'
      : null;
  if (!engine) return { ok: false, error: 'No bookmarks or history database found in this folder' };
  const userDataPath = engine === 'chromium' ? resolveChromiumUserDataPath(profilePath) : profilePath;
  const browserId =
    String(options.browserId || '').trim() ||
    inferBrowserIdFromPath(profilePath, userDataPath, engine);
  const source = finalizeImportSource({
    name: path.basename(profilePath),
    profilePath,
    browserEngine: engine,
    browserId,
    userDataPath,
    id: path.basename(profilePath)
  });
  const extracted = extractImportData(source, {
    importFavorites: options.importFavorites !== false,
    importBookmarks: options.importBookmarks !== false,
    importFolders: options.importFolders !== false,
    importOpenTabs: options.importOpenTabs === true,
    importHistory: options.importHistory !== false,
    importPasswords: options.importPasswords !== false,
    importCards: options.importCards !== false,
    importAddresses: options.importAddresses !== false,
    importSitePermissions: options.importSitePermissions !== false,
    importExtensions: options.importExtensions !== false
  });
  return {
    ok: true,
    name: source.name,
    engine,
    preview: buildImportPreview(extracted),
    warnings: extracted.importWarnings
  };
}

module.exports = {
  listImportableBrowsers,
  listBrowserImportProfiles,
  importBrowserProfileData,
  previewBrowserImport,
  inspectCustomProfileFolder,
  buildAxisProfileExportPayload,
  importAxisProfileBackup
};
