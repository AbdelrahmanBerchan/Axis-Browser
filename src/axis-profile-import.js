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

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (_) {}

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
  try {
    return !!p && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function chromiumTimeToIso(microseconds) {
  if (!microseconds) return new Date().toISOString();
  const ms = Number(microseconds) / 1000 - 11644473600000;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
}

function firefoxTimeToIso(microseconds) {
  if (!microseconds) return new Date().toISOString();
  const ms = Number(microseconds) / 1000;
  const d = new Date(ms);
  return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
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
    chromium('edge', 'Microsoft Edge', 'Microsoft Edge', 'Microsoft/Edge/User Data', '.config/microsoft-edge'),
    chromium('brave', 'Brave', 'BraveSoftware/Brave-Browser', 'BraveSoftware/Brave-Browser/User Data', '.config/BraveSoftware/Brave-Browser'),
    chromium('chromium', 'Chromium', 'Chromium', 'Chromium/User Data', '.config/chromium'),
    chromium('arc', 'Arc', 'Arc/User Data', 'Arc/User Data', '.config/arc'),
    chromium('opera', 'Opera', 'com.operasoftware.Opera', 'Opera Software/Opera Stable', '.config/opera'),
    chromium('vivaldi', 'Vivaldi', 'Vivaldi', 'Vivaldi/User Data', '.config/vivaldi'),
    {
      id: 'firefox',
      name: 'Firefox',
      engine: 'firefox',
      resolvePath() {
        if (isMac) return path.join(home, 'Library', 'Application Support', 'Firefox');
        if (isWin) return path.join(appData, 'Mozilla', 'Firefox');
        return path.join(home, '.mozilla', 'firefox');
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

function listChromiumProfiles(userDataDir) {
  const localState = readJsonFile(path.join(userDataDir, 'Local State'));
  const infoCache = localState?.profile?.info_cache || {};
  const profiles = [];
  for (const [dirName, info] of Object.entries(infoCache)) {
    const profilePath = path.join(userDataDir, dirName);
    if (!pathExists(profilePath)) continue;
    profiles.push({
      id: dirName,
      name: String(info?.name || info?.gaia_name || dirName).trim() || dirName,
      profilePath,
      browserEngine: 'chromium'
    });
  }
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

function readChromiumBookmarks(profilePath) {
  const data = readJsonFile(path.join(profilePath, 'Bookmarks'));
  const roots = data?.roots || {};
  const bar = flattenChromiumBookmarks(roots.bookmark_bar, []);
  const other = flattenChromiumBookmarks(roots.other, []);
  const synced = flattenChromiumBookmarks(roots.synced, []);
  const mobile = flattenChromiumBookmarks(roots.mobile, []);
  const seen = new Set();
  const all = [];
  for (const item of [...bar, ...other, ...synced, ...mobile]) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    all.push(item);
  }
  return {
    bar,
    all,
    roots,
    barFolders: collectChromiumBookmarkFolders(roots.bookmark_bar, { pinned: true }),
    otherFolders: collectChromiumBookmarkFolders(roots.other, { pinned: false })
  };
}

function collectUrlsFromChromiumFolder(folderNode) {
  const urls = [];
  for (const child of folderNode?.children || []) {
    if (child.type === 'url') {
      const url = normalizeHttpUrl(child.url);
      if (url) urls.push({ title: String(child.name || url).slice(0, 200), url });
    } else if (child.type === 'folder') {
      urls.push(...collectUrlsFromChromiumFolder(child));
    }
  }
  return urls;
}

function collectChromiumBookmarkFolders(rootNode, { pinned = false } = {}) {
  const folders = [];
  for (const child of rootNode?.children || []) {
    if (child.type !== 'folder') continue;
    const name = String(child.name || 'Folder').trim().slice(0, 48) || 'Folder';
    const urls = collectUrlsFromChromiumFolder(child);
    if (urls.length > 0) folders.push({ name, urls, pinned });
    for (const nested of child.children || []) {
      if (nested.type !== 'folder') continue;
      const nestedName = `${name} / ${String(nested.name || 'Folder').trim().slice(0, 40)}`;
      const nestedUrls = collectUrlsFromChromiumFolder(nested);
      if (nestedUrls.length > 0) folders.push({ name: nestedName, urls: nestedUrls, pinned });
    }
  }
  return folders;
}

function readFirefoxBookmarkTree(profilePath) {
  const rows = querySqliteDb(
    path.join(profilePath, 'places.sqlite'),
    `SELECT b.id, b.parent, b.type, b.title, b.position, p.url
     FROM moz_bookmarks b
     LEFT JOIN moz_places p ON b.fk = p.id
     WHERE b.type IN (1, 2)
     ORDER BY b.parent, b.position`
  );
  if (!rows.length) return { bar: [], all: [], barFolders: [], otherFolders: [] };

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

  const walkFolder = (folderId, pinned) => {
    const folders = [];
    const loose = [];
    for (const child of children.get(folderId) || []) {
      if (child.type === 1) {
        const url = normalizeHttpUrl(child.url);
        if (url) loose.push({ title: String(child.title || url).slice(0, 200), url });
      } else if (child.type === 2) {
        const name = String(child.title || 'Folder').trim().slice(0, 48) || 'Folder';
        const urls = [];
        const nestedFolders = [];
        for (const sub of children.get(child.id) || []) {
          if (sub.type === 1) {
            const url = normalizeHttpUrl(sub.url);
            if (url) urls.push({ title: String(sub.title || url).slice(0, 200), url });
          } else if (sub.type === 2) {
            const subName = `${name} / ${String(sub.title || 'Folder').trim().slice(0, 40)}`;
            const subUrls = [];
            for (const leaf of children.get(sub.id) || []) {
              if (leaf.type !== 1) continue;
              const url = normalizeHttpUrl(leaf.url);
              if (url) subUrls.push({ title: String(leaf.title || url).slice(0, 200), url });
            }
            if (subUrls.length > 0) nestedFolders.push({ name: subName, urls: subUrls, pinned });
          }
        }
        if (urls.length > 0) folders.push({ name, urls, pinned });
        folders.push(...nestedFolders);
      }
    }
    return { folders, loose };
  };

  const barData = toolbarRoot ? walkFolder(toolbarRoot.id, true) : { folders: [], loose: [] };
  const otherParts = [];
  for (const root of [menuRoot, unfiledRoot].filter(Boolean)) {
    const part = walkFolder(root.id, false);
    otherParts.push(part);
  }

  const bar = barData.loose;
  const allSeen = new Set();
  const all = [];
  const pushAll = (item) => {
    if (!item?.url || allSeen.has(item.url)) return;
    allSeen.add(item.url);
    all.push(item);
  };
  for (const item of bar) pushAll(item);
  for (const part of otherParts) {
    for (const item of part.loose) pushAll(item);
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
    barFolders: barData.folders,
    otherFolders: otherParts.flatMap((p) => p.folders)
  };
}

function querySqliteDb(dbPath, sql, params = []) {
  if (!DatabaseSync || !pathExists(dbPath)) return [];
  const tmp = path.join(os.tmpdir(), `axis-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`);
  try {
    fs.copyFileSync(dbPath, tmp);
    const db = new DatabaseSync(tmp, { readonly: true });
    const stmt = db.prepare(sql);
    const rows = typeof params.length === 'number' && params.length > 0 ? stmt.all(...params) : stmt.all();
    db.close();
    return rows;
  } catch (e) {
    return [];
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch (_) {}
  }
}

function readChromiumHistory(profilePath, limit = 2000) {
  const rows = querySqliteDb(
    path.join(profilePath, 'History'),
    'SELECT url, title, last_visit_time FROM urls WHERE hidden = 0 ORDER BY last_visit_time DESC LIMIT ?',
    [limit]
  );
  return rows
    .map((row, index) => {
      const url = normalizeHttpUrl(row.url);
      if (!url) return null;
      return {
        id: Date.now() + index,
        url,
        title: String(row.title || url).slice(0, 300),
        timestamp: chromiumTimeToIso(row.last_visit_time),
        favicon: ''
      };
    })
    .filter(Boolean);
}

function readFirefoxBookmarks(profilePath) {
  return readFirefoxBookmarkTree(profilePath);
}

function readFirefoxHistory(profilePath, limit = 2000) {
  const rows = querySqliteDb(
    path.join(profilePath, 'places.sqlite'),
    `SELECT url, title, last_visit_date
     FROM moz_places
     WHERE visit_count > 0 AND url NOT LIKE 'place:%'
     ORDER BY last_visit_date DESC
     LIMIT ?`,
    [limit]
  );
  return rows
    .map((row, index) => {
      const url = normalizeHttpUrl(row.url);
      if (!url) return null;
      return {
        id: Date.now() + index,
        url,
        title: String(row.title || url).slice(0, 300),
        timestamp: firefoxTimeToIso(row.last_visit_date),
        favicon: ''
      };
    })
    .filter(Boolean);
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

function resolveImportSource(payload = {}) {
  if (payload.customProfilePath) {
    const profilePath = String(payload.customProfilePath).trim();
    if (!pathExists(profilePath)) throw new Error('Profile folder not found');
    const engine = pathExists(path.join(profilePath, 'places.sqlite'))
      ? 'firefox'
      : pathExists(path.join(profilePath, 'Bookmarks'))
        ? 'chromium'
        : null;
    if (!engine) throw new Error('This folder does not look like a browser profile');
    const userDataPath =
      engine === 'chromium' && pathExists(path.join(profilePath, 'Login Data'))
        ? path.dirname(profilePath)
        : profilePath;
    return {
      name: path.basename(profilePath),
      profilePath,
      browserEngine: engine,
      browserId: payload.browserId || '',
      userDataPath
    };
  }
  const browserId = String(payload.browserId || '').trim();
  const sourceProfileId = String(payload.sourceProfileId || '').trim();
  if (!browserId || !sourceProfileId) throw new Error('Choose a browser and profile to import');
  const def = browserDefs().find((b) => b.id === browserId);
  const profiles = listBrowserImportProfiles(browserId);
  const match = profiles.find((p) => p.id === sourceProfileId);
  if (!match) throw new Error('Browser profile not found');
  return {
    ...match,
    browserId,
    userDataPath: def?.resolvePath?.() || path.dirname(match.profilePath)
  };
}

function makeAxisTabEntry(item, id, order) {
  return {
    id,
    url: item.url,
    title: String(item.title || item.url).slice(0, 200),
    favicon: null,
    order
  };
}

function makeAxisTabGroup({ name, urls, order, color, pinned, open, ts, groupIndex }) {
  const groupId = `import-grp-${ts}-${groupIndex}`;
  const tabs = urls.map((item, tabIndex) => {
    const tabId = `${groupId}-tab-${tabIndex}`;
    return {
      id: tabId,
      url: item.url,
      title: String(item.title || item.url).slice(0, 200),
      favicon: null
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
  bookmarkBarUrls,
  bookmarkAllUrls,
  options = {}
}) {
  const importSession = options.importSession !== false;
  const importBookmarkFolders = options.importBookmarkFolders !== false;
  const importPinnedBar = options.importPinnedBar !== false;
  const importBookmarks = options.importBookmarks !== false;

  const usedUrls = new Set();
  const pinnedTabs = [];
  const tabGroups = [];
  const unpinnedTabs = [];
  const favorites = [];
  const ts = Date.now();
  let groupOrder = 0;
  let pinOrder = 0;
  let unpinOrder = 0;

  const claim = (url) => {
    if (!url || usedUrls.has(url)) return false;
    usedUrls.add(url);
    return true;
  };

  const sessionList = importSession ? sessionTabs || [] : [];

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
    if (claim(tab.url)) sessionGroups.get(tab.groupKey).urls.push(tab);
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
        groupIndex: groupOrder++
      })
    );
  }

  for (const tab of sessionList) {
    if (!tab.pinned || tab.groupKey) continue;
    if (!claim(tab.url)) continue;
    pinnedTabs.push(makeAxisTabEntry(tab, `import-pin-${ts}-${pinOrder}`, pinOrder++));
  }

  for (const tab of sessionList) {
    if (tab.pinned || tab.groupKey) continue;
    if (!claim(tab.url)) continue;
    unpinnedTabs.push(makeAxisTabEntry(tab, `import-tab-${ts}-${unpinOrder}`, unpinOrder++));
  }

  if (importBookmarkFolders) {
    for (const folder of bookmarkFolders || []) {
      const urls = (folder.urls || []).filter((item) => claim(item.url));
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
          groupIndex: groupOrder++
        })
      );
    }
  }

  if (importPinnedBar) {
    for (const item of bookmarkBarUrls || []) {
      if (!claim(item.url)) continue;
      pinnedTabs.push(makeAxisTabEntry(item, `import-pin-${ts}-${pinOrder}`, pinOrder++));
    }
  }

  if (importBookmarks) {
    for (const item of bookmarkAllUrls || []) {
      if (!claim(item.url)) continue;
      favorites.push({
        id: `import-${ts}-fav-${favorites.length}`,
        url: item.url,
        title: String(item.title || item.url).slice(0, 200),
        order: favorites.length
      });
      if (favorites.length >= 120) break;
    }
  }

  return { favorites, pinnedTabs, tabGroups, unpinnedTabs };
}

function extractImportData(source, options = {}) {
  const importBookmarks = options.importBookmarks !== false;
  const importPinnedBar = options.importPinnedBar !== false;
  const importHistory = options.importHistory !== false;
  const importSession = options.importSession !== false;
  const importBookmarkFolders = options.importBookmarkFolders !== false;
  const engine = source.browserEngine;
  let bookmarks = { bar: [], all: [], barFolders: [], otherFolders: [] };
  let history = [];
  let searchEngine = null;
  let sessionTabs = [];

  if (engine === 'chromium') {
    bookmarks = readChromiumBookmarks(source.profilePath);
    if (importHistory) history = readChromiumHistory(source.profilePath, 500);
    searchEngine = readChromiumSearchEngine(source.profilePath);
    if (importSession) {
      const session = extractBrowserSession(source.profilePath, 'chromium');
      sessionTabs = session.tabs || [];
    }
  } else if (engine === 'firefox') {
    bookmarks = readFirefoxBookmarks(source.profilePath);
    if (importHistory) history = readFirefoxHistory(source.profilePath, 500);
    searchEngine = readFirefoxSearchEngine(source.profilePath);
    if (importSession) {
      const session = extractBrowserSession(source.profilePath, 'firefox');
      sessionTabs = session.tabs || [];
    }
  }

  const bookmarkFolders = [
    ...(importBookmarkFolders ? bookmarks.barFolders || [] : []),
    ...(importBookmarkFolders ? bookmarks.otherFolders || [] : [])
  ];

  const layout = buildAxisImportLayout({
    sessionTabs,
    bookmarkFolders,
    bookmarkBarUrls: importPinnedBar ? bookmarks.bar || [] : [],
    bookmarkAllUrls: importBookmarks ? bookmarks.all || [] : [],
    options: { importSession, importBookmarkFolders, importPinnedBar, importBookmarks }
  });

  const secrets = extractBrowserSecrets(source, {
    importPasswords: options.importPasswords !== false,
    importCards: options.importCards !== false,
    importAddresses: options.importAddresses !== false
  });

  const extras = extractBrowserExtras(source, {
    importSitePermissions: options.importSitePermissions !== false,
    importExtensions: options.importExtensions !== false
  });

  const importWarnings = [...(secrets.warnings || []), ...(extras.warnings || [])];

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
    bookmarks: extracted.favorites.length,
    pinnedBar: extracted.pinnedTabs.length,
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

function mergeHistory(existing, incoming, limit = 1000) {
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
    return { installed: 0, failed: 0, warnings: [] };
  }
  const warnings = [];
  let installed = 0;
  let failed = 0;
  const webStore = (extensions?.webStore || []).filter((e) => e.enabled !== false);
  const unpacked = (extensions?.unpacked || []).filter((e) => e.enabled !== false);
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
  return { installed, failed, warnings };
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
    const merged = normalizeFavoritesStoreList([
      ...(Array.isArray(store.get('favorites')) ? store.get('favorites') : []),
      ...extracted.favorites
    ]);
    store.set('favorites', merged);
    stats.favorites = extracted.favorites.length;
  }

  const hasPinned = Array.isArray(store.get('pinnedTabs')) && store.get('pinnedTabs').length > 0;
  const hasGroups = Array.isArray(store.get('tabGroups')) && store.get('tabGroups').length > 0;
  const hasUnpinned = Array.isArray(store.get('unpinnedTabs')) && store.get('unpinnedTabs').length > 0;

  if (extracted.pinnedTabs.length > 0 && !hasPinned) {
    store.set('pinnedTabs', extracted.pinnedTabs);
    stats.pinnedTabs = extracted.pinnedTabs.length;
  }

  if (extracted.tabGroups.length > 0 && !hasGroups) {
    store.set('tabGroups', extracted.tabGroups);
    stats.tabGroups = extracted.tabGroups.length;
  }

  if (extracted.unpinnedTabs.length > 0 && !hasUnpinned) {
    store.set('unpinnedTabs', extracted.unpinnedTabs);
    stats.unpinnedTabs = extracted.unpinnedTabs.length;
  }

  if (extracted.history.length > 0) {
    const mergedHistory = mergeHistory(store.get('historyItems'), extracted.history);
    store.set('historyItems', mergedHistory);
    stats.history = extracted.history.length;
  }

  if (extracted.searchEngine && !payload.targetProfileId) {
    store.set('searchEngine', extracted.searchEngine);
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
  warnings.push(...(extStats.warnings || []));

  broadcastProfilesUpdated();
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

function inspectCustomProfileFolder(folderPath) {
  const profilePath = String(folderPath || '').trim();
  if (!pathExists(profilePath)) return { ok: false, error: 'Folder not found' };
  const engine = pathExists(path.join(profilePath, 'places.sqlite'))
    ? 'firefox'
    : pathExists(path.join(profilePath, 'Bookmarks'))
      ? 'chromium'
      : null;
  if (!engine) return { ok: false, error: 'No bookmarks or history database found in this folder' };
  const source = {
    name: path.basename(profilePath),
    profilePath,
    browserEngine: engine,
    userDataPath: engine === 'chromium' ? path.dirname(profilePath) : profilePath
  };
  const extracted = extractImportData(source, {
    importBookmarks: true,
    importPinnedBar: true,
    importHistory: true,
    importSession: true,
    importBookmarkFolders: true,
    importPasswords: true,
    importCards: true,
    importAddresses: true,
    importSitePermissions: true,
    importExtensions: true
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
