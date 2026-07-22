'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

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

function resolveStorableSidebarPath(userDataPath, browserId) {
  if (!userDataPath) return null;
  const baseName = path.basename(userDataPath);
  const parentDir =
    baseName === 'User Data' || baseName === 'Local State' ? path.dirname(userDataPath) : userDataPath;

  const direct = path.join(parentDir, 'StorableSidebar.json');
  if (pathExists(direct)) return direct;

  if (browserId === 'arc' && process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const packagesDir = path.join(localAppData, 'Packages');
    try {
      for (const ent of fs.readdirSync(packagesDir, { withFileTypes: true })) {
        if (!ent.isDirectory() || !ent.name.startsWith('TheBrowserCompany.Arc')) continue;
        const candidate = path.join(
          packagesDir,
          ent.name,
          'LocalCache',
          'Local',
          'Arc',
          'StorableSidebar.json'
        );
        if (pathExists(candidate)) return candidate;
      }
    } catch (_) {}
  }

  return null;
}

function chromiumProfileBasename(source = {}) {
  const fromPath = path.basename(String(source.profilePath || '').trim());
  if (fromPath && fromPath !== '.' && fromPath !== 'User Data') return fromPath;
  const id = String(source.id || source.sourceProfileId || '').trim();
  if (id) return id;
  const name = String(source.name || '').trim();
  if (/^profile\s+\d+$/i.test(name)) return name.replace(/^profile\s+/i, 'Profile ');
  if (name.toLowerCase() === 'default') return 'Default';
  return 'Default';
}

function profileMarkerBasename(marker) {
  if (!marker || typeof marker !== 'object') return null;
  if (marker.default === true) return 'Default';
  const custom = marker.custom?._0?.directoryBasename || marker.custom?.directoryBasename;
  return custom ? String(custom).trim() : null;
}

function spaceProfileBasename(space) {
  return profileMarkerBasename(space?.profile) || 'Default';
}

function parseAlternatingObjectArray(raw) {
  const out = [];
  if (!Array.isArray(raw)) return out;
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const obj = raw[i + 1];
    if (obj && typeof obj === 'object') out.push(obj);
  }
  return out;
}

function buildSidebarItemsMap(items) {
  const byId = new Map();
  if (!Array.isArray(items)) return byId;
  for (let i = 0; i + 1 < items.length; i += 2) {
    const item = items[i + 1];
    if (item && typeof item === 'object' && item.id) byId.set(item.id, item);
  }
  return byId;
}

function getSidebarItemType(item) {
  if (!item || typeof item !== 'object' || !item.data) return null;
  if (item.data.list) return 'folder';
  if (item.data.tab) return 'tab';
  if (item.data.splitView) return 'split';
  return null;
}

function sidebarTabUrl(item) {
  const tab = item?.data?.tab;
  if (!tab) return null;
  const url = String(tab.savedURL || tab.url || '').trim();
  if (!url) return null;
  const lower = url.toLowerCase();
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('chrome:') ||
    lower.startsWith('arc:') ||
    lower.startsWith('file:') ||
    lower.startsWith('blob:')
  ) {
    return null;
  }
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return parsed.href;
  } catch (_) {}
  return null;
}

function sidebarTabTitle(item, url) {
  return String(item?.title || item?.data?.tab?.savedTitle || item?.data?.tab?.title || url || '')
    .trim()
    .slice(0, 200);
}

function orderedChildren(parentId, byId) {
  const parent = byId.get(parentId);
  const ids = Array.isArray(parent?.childrenIds) ? parent.childrenIds : [];
  if (ids.length) {
    return ids.map((id) => byId.get(id)).filter(Boolean);
  }
  return [...byId.values()].filter((item) => item.parentID === parentId);
}

function resolvePinnedContainerId(space) {
  const newContainerIds = Array.isArray(space?.newContainerIDs) ? space.newContainerIDs : [];
  for (let i = 0; i + 1 < newContainerIds.length; i += 2) {
    const marker = newContainerIds[i];
    const next = newContainerIds[i + 1];
    if (typeof next !== 'string') continue;
    if (marker && typeof marker === 'object' && marker.pinned != null) return next;
  }

  const containerIds = Array.isArray(space?.containerIDs) ? space.containerIDs : [];
  for (let i = 0; i + 1 < containerIds.length; i++) {
    if (containerIds[i] === 'pinned') return containerIds[i + 1];
  }
  return null;
}

function resolveTopAppsContainerId(container, profileBasename) {
  const raw = container?.topAppsContainerIDs;
  if (!Array.isArray(raw)) return null;

  for (let i = 0; i + 1 < raw.length; i += 2) {
    const marker = raw[i];
    const containerId = raw[i + 1];
    if (typeof containerId !== 'string') continue;
    const markerProfile = profileMarkerBasename(marker);
    if (markerProfile && markerProfile === profileBasename) return containerId;
  }

  if (profileBasename === 'Default') {
    for (let i = 0; i + 1 < raw.length; i += 2) {
      const marker = raw[i];
      const containerId = raw[i + 1];
      if (typeof containerId === 'string' && marker && typeof marker === 'object' && marker.default === true) {
        return containerId;
      }
    }
  }

  return null;
}

function collectTopAppFavorites(topContainerId, byId) {
  const favorites = [];
  const seen = new Set();
  if (!topContainerId) return favorites;

  for (const item of orderedChildren(topContainerId, byId)) {
    if (getSidebarItemType(item) !== 'tab') continue;
    const url = sidebarTabUrl(item);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    favorites.push({ title: sidebarTabTitle(item, url), url });
  }
  return favorites;
}

function collectFolderEntries(itemId, byId, { prefix = '', spaceTitle = '' } = {}) {
  const folders = [];
  const item = byId.get(itemId);
  if (!item || getSidebarItemType(item) !== 'folder') return folders;

  let name = String(item.title || 'Folder').trim().slice(0, 48) || 'Folder';
  if ((name === '.' || name === 'Folder') && spaceTitle && !prefix) {
    name = spaceTitle;
  }
  const fullName = prefix ? `${prefix} / ${name}`.slice(0, 80) : name;
  const directUrls = [];
  for (const child of orderedChildren(itemId, byId)) {
    if (getSidebarItemType(child) === 'tab') {
      const url = sidebarTabUrl(child);
      if (url) directUrls.push({ title: sidebarTabTitle(child, url), url });
    }
  }
  if (directUrls.length > 0) folders.push({ name, urls: directUrls, pinned: true });

  for (const child of orderedChildren(itemId, byId)) {
    if (getSidebarItemType(child) === 'folder') {
      folders.push(...collectFolderEntries(child.id, byId, { prefix: fullName, spaceTitle }));
    }
  }
  return folders;
}

function collectPinnedSpaceLayout(pinnedContainerId, byId, { spaceTitle, prefixSpaceName, seenUrls }) {
  const bar = [];
  const barFolders = [];

  for (const item of orderedChildren(pinnedContainerId, byId)) {
    const type = getSidebarItemType(item);
    if (type === 'tab') {
      const url = sidebarTabUrl(item);
      if (!url || seenUrls.has(url)) continue;
      seenUrls.add(url);
      bar.push({ title: sidebarTabTitle(item, url), url });
    } else if (type === 'folder') {
      const folderPrefix = prefixSpaceName ? spaceTitle : '';
      const nested = collectFolderEntries(item.id, byId, { prefix: folderPrefix, spaceTitle });
      for (const folder of nested) {
        const urls = folder.urls.filter((entry) => {
          if (!entry?.url || seenUrls.has(entry.url)) return false;
          seenUrls.add(entry.url);
          return true;
        });
        if (urls.length > 0) barFolders.push({ ...folder, urls, pinned: true });
      }
    } else if (type === 'split') {
      for (const childId of item.childrenIds || []) {
        const child = byId.get(childId);
        if (getSidebarItemType(child) !== 'tab') continue;
        const url = sidebarTabUrl(child);
        if (!url || seenUrls.has(url)) continue;
        seenUrls.add(url);
        bar.push({ title: sidebarTabTitle(child, url), url });
      }
    }
  }

  return { bar, barFolders };
}

function pickSidebarContainer(containers) {
  if (!Array.isArray(containers)) return null;
  for (const container of containers) {
    if (!container || typeof container !== 'object' || container.global) continue;
    if (!Array.isArray(container.items) || container.items.length === 0) continue;
    if (!Array.isArray(container.spaces) || container.spaces.length === 0) continue;
    return container;
  }
  return null;
}

function collectSidebarForProfile(container, profileBasename) {
  const byId = buildSidebarItemsMap(container.items);
  const spaces = parseAlternatingObjectArray(container.spaces);
  const matchingSpaces = spaces.filter((space) => spaceProfileBasename(space) === profileBasename);

  const favorites = collectTopAppFavorites(resolveTopAppsContainerId(container, profileBasename), byId);
  const seenUrls = new Set(favorites.map((f) => f.url));

  const bar = [];
  const barFolders = [];
  const prefixSpaceName = matchingSpaces.length > 1;

  for (const space of matchingSpaces) {
    const spaceTitle = String(space.title || 'Space').trim().slice(0, 48) || 'Space';
    const pinnedContainerId = resolvePinnedContainerId(space);
    if (!pinnedContainerId) continue;

    const layout = collectPinnedSpaceLayout(pinnedContainerId, byId, {
      spaceTitle,
      prefixSpaceName,
      seenUrls
    });

    if (layout.bar.length > 0 && prefixSpaceName) {
      barFolders.push({
        name: spaceTitle,
        urls: layout.bar,
        pinned: true
      });
    } else {
      bar.push(...layout.bar);
    }
    barFolders.push(...layout.barFolders);
  }

  const all = [];
  const pushAll = (entry) => {
    if (!entry?.url) return;
    if (!all.some((row) => row.url === entry.url)) all.push(entry);
  };
  for (const item of favorites) pushAll(item);
  for (const item of bar) pushAll(item);
  for (const folder of barFolders) {
    for (const item of folder.urls || []) pushAll(item);
  }

  return {
    bar,
    favorites,
    all,
    barFolders,
    otherFolders: [],
    sidebarAuthoritative: favorites.length > 0 || bar.length > 0 || barFolders.length > 0,
    profileBasename,
    matchedSpaces: matchingSpaces.map((space) => String(space.title || 'Space').trim()).filter(Boolean)
  };
}

function readStorableSidebarBookmarks(userDataPath, browserId, source = {}) {
  const sidebarPath = resolveStorableSidebarPath(userDataPath, browserId);
  if (!sidebarPath) return null;

  const data = readJsonFile(sidebarPath);
  const containers = data?.sidebar?.containers;
  if (!Array.isArray(containers) || containers.length === 0) return null;

  const container = pickSidebarContainer(containers);
  if (!container) return null;

  const profileBasename = chromiumProfileBasename(source);
  const parsed = collectSidebarForProfile(container, profileBasename);
  if (!parsed.sidebarAuthoritative) {
    return {
      ...parsed,
      source: 'storable-sidebar',
      sidebarPath,
      profileBasename,
      emptyForProfile: true
    };
  }

  return {
    ...parsed,
    source: 'storable-sidebar',
    sidebarPath,
    profileBasename
  };
}

function mergeBookmarkSources(primary, secondary) {
  const base = primary || { bar: [], favorites: [], all: [], barFolders: [], otherFolders: [] };
  const extra = secondary || { bar: [], favorites: [], all: [], barFolders: [], otherFolders: [] };

  if (extra.sidebarAuthoritative) return extra;
  if (base.sidebarAuthoritative) return base;
  if (!extra.all?.length && !extra.bar?.length && !extra.favorites?.length) return base;

  const seen = new Set();
  const all = [];
  const pushAll = (item) => {
    if (!item?.url || seen.has(item.url)) return;
    seen.add(item.url);
    all.push(item);
  };
  for (const item of base.all || []) pushAll(item);
  for (const item of extra.all || []) pushAll(item);

  const barSeen = new Set();
  const bar = [];
  const pushBar = (item) => {
    if (!item?.url || barSeen.has(item.url)) return;
    barSeen.add(item.url);
    bar.push(item);
  };
  for (const item of [...(base.bar || []), ...(extra.bar || [])]) pushBar(item);

  const favSeen = new Set();
  const favorites = [];
  for (const list of [base.favorites, extra.favorites]) {
    for (const item of list || []) {
      if (!item?.url || favSeen.has(item.url)) continue;
      favSeen.add(item.url);
      favorites.push(item);
    }
  }

  return {
    bar,
    favorites,
    all,
    barFolders: [...(base.barFolders || []), ...(extra.barFolders || [])],
    otherFolders: [...(base.otherFolders || []), ...(extra.otherFolders || [])],
    sidebarAuthoritative: !!(extra.sidebarAuthoritative || base.sidebarAuthoritative)
  };
}

module.exports = {
  resolveStorableSidebarPath,
  readStorableSidebarBookmarks,
  mergeBookmarkSources,
  chromiumProfileBasename,
  spaceProfileBasename
};
