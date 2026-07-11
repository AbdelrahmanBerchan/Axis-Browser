'use strict';

const fs = require('fs');
const path = require('path');
const { decompressMozLz4 } = require('./axis-mozlz4');

const SNSS_CMD = {
  SetTabWindow: 0,
  SetTabIndexInWindow: 2,
  UpdateTabNavigation: 6,
  SetSelectedNavigationIndex: 7,
  SetSelectedTabInIndex: 8,
  SetPinnedState: 12,
  TabClosed: 16,
  WindowClosed: 17,
  SetActiveWindow: 20,
  LastActiveTime: 21,
  SetTabGroup: 25,
  SetTabGroupMetadata2: 27
};

const CHROME_GROUP_COLORS = [
  '#9AA0A6',
  '#3498DB',
  '#E74C3C',
  '#F39C12',
  '#96CEB4',
  '#E91E63',
  '#9B59B6',
  '#4ECDC4',
  '#DDA15E',
  '#45B7D1'
];

const AXIS_GROUP_COLORS = [
  '#FF6B6B',
  '#4ECDC4',
  '#45B7D1',
  '#96CEB4',
  '#FFEAA7',
  '#DDA15E',
  '#F39C12',
  '#E74C3C',
  '#9B59B6',
  '#3498DB'
];

function pathExists(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function normalizeHttpUrl(url) {
  const raw = String(url || '').trim();
  if (!raw || raw.startsWith('javascript:') || raw.startsWith('chrome:')) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('about:') || raw.startsWith('file:')) return null;
  return null;
}

class BufferReader {
  constructor(buf) {
    this.buf = buf;
    this.pos = 0;
  }

  remaining() {
    return Math.max(0, this.buf.length - this.pos);
  }

  readUInt8() {
    if (this.pos >= this.buf.length) throw new Error('eof');
    return this.buf[this.pos++];
  }

  readUInt16LE() {
    const v = this.buf.readUInt16LE(this.pos);
    this.pos += 2;
    return v;
  }

  readUInt32LE() {
    const v = this.buf.readUInt32LE(this.pos);
    this.pos += 4;
    return v;
  }

  readUInt64LE() {
    const v = this.buf.readBigUInt64LE(this.pos);
    this.pos += 8;
    return v;
  }

  readBytes(n) {
    if (this.pos + n > this.buf.length) throw new Error('eof');
    const slice = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return slice;
  }

  readString() {
    const sz = this.readUInt32LE();
    const str = this.buf.toString('utf8', this.pos, this.pos + sz);
    let advance = sz;
    if (advance % 4 !== 0) advance += 4 - (advance % 4);
    this.pos += advance;
    return str;
  }

  readString16() {
    const charCount = this.readUInt32LE();
    let byteLen = charCount * 2;
    let advance = byteLen;
    if (advance % 4 !== 0) advance += 4 - (advance % 4);
    const chars = [];
    for (let i = 0; i < charCount; i++) {
      chars.push(this.buf.readUInt16LE(this.pos + i * 2));
    }
    this.pos += advance;
    return String.fromCharCode(...chars);
  }
}

function chromeGroupColorToAxis(colorId) {
  const idx = Number(colorId);
  if (Number.isFinite(idx) && idx >= 0) {
    const chrome = CHROME_GROUP_COLORS[idx % CHROME_GROUP_COLORS.length];
    const axisIdx = CHROME_GROUP_COLORS.indexOf(chrome);
    return AXIS_GROUP_COLORS[axisIdx >= 0 ? axisIdx : idx % AXIS_GROUP_COLORS.length];
  }
  return AXIS_GROUP_COLORS[0];
}

function parseSnssCommands(buf, onCommand) {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'SNSS') return false;
  const version = buf.readUInt32LE(4);
  if (version !== 1 && version !== 3) return false;
  const reader = new BufferReader(buf.subarray(8));
  while (reader.remaining() >= 3) {
    try {
      const cmdSize = reader.readUInt16LE() - 1;
      if (cmdSize < 0) break;
      const cmdType = reader.readUInt8();
      const payload = reader.readBytes(cmdSize);
      onCommand(cmdType, new BufferReader(payload));
    } catch (_) {
      break;
    }
  }
  return true;
}

function parseSessionSnssBuffer(buf) {
  const tabs = new Map();
  const groups = new Map();

  const getTab = (id) => {
    if (!tabs.has(id)) {
      tabs.set(id, {
        id,
        win: 0,
        idx: 0,
        deleted: false,
        pinned: false,
        groupKey: null,
        history: new Map(),
        currentHistoryIdx: 0
      });
    }
    return tabs.get(id);
  };

  const getGroup = (high, low) => {
    const key = `${high.toString(16)}${low.toString(16)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        high,
        low,
        name: '',
        color: AXIS_GROUP_COLORS[groups.size % AXIS_GROUP_COLORS.length],
        collapsed: false
      });
    }
    return groups.get(key);
  };

  parseSnssCommands(buf, (cmdType, data) => {
    switch (cmdType) {
      case SNSS_CMD.UpdateTabNavigation: {
        data.readUInt32LE();
        const tabId = data.readUInt32LE();
        const histIdx = data.readUInt32LE();
        const url = data.readString();
        let title = '';
        try {
          title = data.readString16();
        } catch (_) {}
        getTab(tabId).history.set(histIdx, { url, title });
        break;
      }
      case SNSS_CMD.SetSelectedNavigationIndex: {
        const tabId = data.readUInt32LE();
        const idx = data.readUInt32LE();
        getTab(tabId).currentHistoryIdx = idx;
        break;
      }
      case SNSS_CMD.SetTabWindow: {
        const winId = data.readUInt32LE();
        const tabId = data.readUInt32LE();
        getTab(tabId).win = winId;
        break;
      }
      case SNSS_CMD.SetTabIndexInWindow: {
        const tabId = data.readUInt32LE();
        const idx = data.readUInt32LE();
        getTab(tabId).idx = idx;
        break;
      }
      case SNSS_CMD.SetPinnedState: {
        const tabId = data.readUInt32LE();
        const pinned = data.readUInt32LE();
        getTab(tabId).pinned = pinned !== 0;
        break;
      }
      case SNSS_CMD.TabClosed: {
        const tabId = data.readUInt32LE();
        getTab(tabId).deleted = true;
        break;
      }
      case SNSS_CMD.SetTabGroup: {
        const tabId = data.readUInt32LE();
        if (data.remaining() >= 4) data.readUInt32LE();
        const high = data.readUInt64LE();
        const low = data.readUInt64LE();
        getTab(tabId).groupKey = getGroup(high, low).key;
        break;
      }
      case SNSS_CMD.SetTabGroupMetadata2: {
        data.readUInt32LE();
        const high = data.readUInt64LE();
        const low = data.readUInt64LE();
        const group = getGroup(high, low);
        group.name = data.readString16();
        if (data.remaining() >= 4) {
          group.color = chromeGroupColorToAxis(data.readUInt32LE());
        }
        if (data.remaining() >= 1) {
          try {
            group.collapsed = data.readUInt8() !== 0;
          } catch (_) {}
        }
        break;
      }
      default:
        break;
    }
  });

  return { tabs, groups };
}

function parseTabsSnssBuffer(buf) {
  const tabs = new Map();
  const getTab = (id) => {
    if (!tabs.has(id)) {
      tabs.set(id, {
        id,
        pinned: false,
        history: new Map(),
        currentHistoryIdx: 0
      });
    }
    return tabs.get(id);
  };

  parseSnssCommands(buf, (cmdType, data) => {
    switch (cmdType) {
      case 1: {
        data.readUInt32LE();
        const tabId = data.readUInt32LE();
        const histIdx = data.readUInt32LE();
        const url = data.readString();
        let title = '';
        try {
          title = data.readString16();
        } catch (_) {}
        getTab(tabId).history.set(histIdx, { url, title });
        break;
      }
      case 4: {
        const tabId = data.readUInt32LE();
        const idx = data.readUInt32LE();
        getTab(tabId).currentHistoryIdx = idx;
        break;
      }
      case 5: {
        if (data.remaining() >= 1) {
          const pinned = data.readUInt8() !== 0;
          for (const tab of tabs.values()) tab.pinned = pinned;
        }
        break;
      }
      default:
        break;
    }
  });

  return tabs;
}

function tabHistoryToUrlTitle(tab) {
  let url = '';
  let title = '';
  const hist = [...tab.history.entries()].sort((a, b) => a[0] - b[0]);
  for (const [idx, entry] of hist) {
    if (idx === tab.currentHistoryIdx || (!url && entry.url)) {
      url = entry.url;
      title = entry.title;
    }
  }
  if (!url && hist.length > 0) {
    const last = hist[hist.length - 1][1];
    url = last.url;
    title = last.title;
  }
  return { url, title };
}

function mergeChromiumSessionParts(layout, navTabs, groups) {
  const resultTabs = [];
  const tabIds = new Set([...layout.tabs.keys(), ...navTabs.keys()]);
  const unnamedGroupNames = new Map();
  let unnamedGroupCount = 0;

  for (const tabId of tabIds) {
    const layoutTab = layout.tabs.get(tabId);
    if (layoutTab?.deleted) continue;
    const navTab = navTabs.get(tabId);
    const mergedHistory = new Map(layoutTab?.history || []);
    if (navTab) {
      for (const [idx, entry] of navTab.history) mergedHistory.set(idx, entry);
    }
    const currentHistoryIdx = navTab?.currentHistoryIdx ?? layoutTab?.currentHistoryIdx ?? 0;
    const { url, title } = tabHistoryToUrlTitle({
      history: mergedHistory,
      currentHistoryIdx
    });
    const normalized = normalizeHttpUrl(url);
    if (!normalized) continue;
    const groupKey = layoutTab?.groupKey || null;
    const group = groupKey ? groups.get(groupKey) : null;
    let groupName = group?.name || '';
    if (groupKey && !groupName) {
      if (!unnamedGroupNames.has(groupKey)) {
        unnamedGroupCount += 1;
        unnamedGroupNames.set(groupKey, `Imported group ${unnamedGroupCount}`);
      }
      groupName = unnamedGroupNames.get(groupKey);
    }
    resultTabs.push({
      url: normalized,
      title: String(title || normalized).slice(0, 200),
      pinned: layoutTab?.pinned || navTab?.pinned || false,
      groupKey,
      groupName,
      groupColor: group?.color || AXIS_GROUP_COLORS[0],
      groupCollapsed: group?.collapsed === true,
      windowIndex: layoutTab?.win || 0,
      tabIndex: layoutTab?.idx ?? resultTabs.length
    });
  }

  resultTabs.sort((a, b) => a.windowIndex - b.windowIndex || a.tabIndex - b.tabIndex);
  return { tabs: resultTabs, groups };
}

function parseSnssFile(filePath) {
  let buf;
  try {
    buf = fs.readFileSync(filePath);
  } catch (_) {
    return null;
  }
  const layout = parseSessionSnssBuffer(buf);
  return mergeChromiumSessionParts(layout, new Map(), layout.groups);
}

function findChromiumSessionFiles(profilePath) {
  const sessionsDir = path.join(profilePath, 'Sessions');
  if (!pathExists(sessionsDir)) return { session: null, tabs: null };
  let session = null;
  let tabs = null;
  let sessionScore = -1;
  let tabsScore = -1;
  for (const name of fs.readdirSync(sessionsDir)) {
    const full = path.join(sessionsDir, name);
    try {
      const st = fs.statSync(full);
      if (!st.isFile()) continue;
      if (
        name === 'Current Session' ||
        name === 'Last Session' ||
        name.startsWith('Session_')
      ) {
        const priority =
          name === 'Current Session' ? 3 : name === 'Last Session' ? 2 : 1;
        const score = priority * 1e15 + st.mtimeMs;
        if (score > sessionScore) {
          sessionScore = score;
          session = full;
        }
      } else if (name.startsWith('Tabs_')) {
        const score = st.mtimeMs;
        if (score > tabsScore) {
          tabsScore = score;
          tabs = full;
        }
      }
    } catch (_) {}
  }
  return { session, tabs };
}

function extractChromiumSession(profilePath) {
  const { session, tabs } = findChromiumSessionFiles(profilePath);
  let layout = { tabs: new Map(), groups: new Map() };
  let navTabs = new Map();

  if (session) {
    try {
      layout = parseSessionSnssBuffer(fs.readFileSync(session));
    } catch (_) {}
  }
  if (tabs) {
    try {
      navTabs = parseTabsSnssBuffer(fs.readFileSync(tabs));
    } catch (_) {}
  }
  if (!session && !tabs) return { tabs: [], groups: new Map() };
  return mergeChromiumSessionParts(layout, navTabs, layout.groups);
}

function findFirefoxSessionFile(profilePath) {
  const candidates = [
    path.join(profilePath, 'sessionstore.jsonlz4'),
    path.join(profilePath, 'sessionstore-backups', 'recovery.jsonlz4'),
    path.join(profilePath, 'sessionstore-backups', 'recovery.baklz4')
  ];
  const backupsDir = path.join(profilePath, 'sessionstore-backups');
  if (pathExists(backupsDir)) {
    try {
      for (const name of fs.readdirSync(backupsDir)) {
        if (name.endsWith('.jsonlz4') || name.endsWith('.baklz4')) {
          candidates.push(path.join(backupsDir, name));
        }
      }
    } catch (_) {}
  }
  const scored = [];
  for (const p of candidates) {
    if (!pathExists(p)) continue;
    try {
      const st = fs.statSync(p);
      let priority = 1;
      if (p.endsWith('sessionstore.jsonlz4')) priority = 3;
      else if (p.includes('recovery.jsonlz4')) priority = 2;
      scored.push({ path: p, mtime: st.mtimeMs, priority });
    } catch (_) {}
  }
  scored.sort((a, b) => b.priority - a.priority || b.mtime - a.mtime);
  return scored[0]?.path || null;
}

const FIREFOX_GROUP_COLORS = {
  blue: '#3498DB',
  turquoise: '#4ECDC4',
  green: '#96CEB4',
  yellow: '#FFEAA7',
  orange: '#F39C12',
  red: '#E74C3C',
  pink: '#E91E63',
  purple: '#9B59B6',
  grey: '#9AA0A6'
};

function firefoxGroupColor(colorName) {
  const key = String(colorName || '').toLowerCase();
  return FIREFOX_GROUP_COLORS[key] || AXIS_GROUP_COLORS[0];
}

function extractFirefoxSession(profilePath) {
  const sessionPath = findFirefoxSessionFile(profilePath);
  if (!sessionPath) return { tabs: [], groups: new Map() };
  let raw;
  try {
    raw = fs.readFileSync(sessionPath);
  } catch (_) {
    return { tabs: [], groups: new Map() };
  }
  const text = decompressMozLz4(raw);
  if (!text) return { tabs: [], groups: new Map() };
  let data;
  try {
    data = JSON.parse(text);
  } catch (_) {
    return { tabs: [], groups: new Map() };
  }

  const groups = new Map();
  const tabs = [];
  const windows = Array.isArray(data?.windows) ? data.windows : [];

  for (const win of windows) {
    const winGroups = Array.isArray(win.groups) ? win.groups : [];
    for (const grp of winGroups) {
      const id = String(grp.id || grp.userContextId || grp.name || '');
      if (!id) continue;
      groups.set(id, {
        key: id,
        name: String(grp.name || grp.label || 'Tab group').slice(0, 48),
        color: firefoxGroupColor(grp.color),
        collapsed: grp.collapsed === true
      });
    }

    const winTabs = Array.isArray(win.tabs) ? win.tabs : [];
    for (const tab of winTabs) {
      if (tab.hidden === true) continue;
      const entries = Array.isArray(tab.entries) ? tab.entries : [];
      const idx = Number.isFinite(tab.index) ? tab.index : 0;
      const entry = entries[idx] || entries[entries.length - 1] || entries[0];
      if (!entry) continue;
      const url = normalizeHttpUrl(entry.url);
      if (!url) continue;
      const groupId = tab.groupId != null ? String(tab.groupId) : null;
      tabs.push({
        url,
        title: String(entry.title || url).slice(0, 200),
        pinned: tab.pinned === true,
        groupKey: groupId,
        groupName: groupId ? groups.get(groupId)?.name || '' : '',
        groupColor: groupId ? groups.get(groupId)?.color || AXIS_GROUP_COLORS[0] : null,
        groupCollapsed: groupId ? groups.get(groupId)?.collapsed === true : false,
        windowIndex: 0,
        tabIndex: tabs.length
      });
    }
  }

  return { tabs, groups };
}

function extractBrowserSession(profilePath, engine) {
  if (engine === 'firefox') return extractFirefoxSession(profilePath);
  return extractChromiumSession(profilePath);
}

module.exports = {
  normalizeHttpUrl,
  extractBrowserSession,
  parseSnssFile,
  AXIS_GROUP_COLORS
};
