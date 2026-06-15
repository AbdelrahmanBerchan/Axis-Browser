'use strict';

/**
 * Chrome API shims for extension popups/guests in Axis.
 * Merges with Electron's injected APIs — only fills gaps and adds active-tab context.
 */
function normalizeTabContext(raw) {
  if (!raw || typeof raw !== 'object' || !raw.url) return null;
  return {
    id: Number.isFinite(raw.id) ? raw.id : 1,
    index: Number.isFinite(raw.index) ? raw.index : 0,
    windowId: Number.isFinite(raw.windowId) ? raw.windowId : 1,
    openerTabId: raw.openerTabId,
    active: raw.active !== false,
    highlighted: raw.highlighted !== false,
    pinned: !!raw.pinned,
    audible: !!raw.audible,
    mutedInfo: raw.mutedInfo && typeof raw.mutedInfo === 'object' ? raw.mutedInfo : { muted: false },
    url: String(raw.url),
    title: String(raw.title || raw.url),
    favIconUrl: String(raw.favIconUrl || ''),
    status: String(raw.status || 'complete'),
    incognito: !!raw.incognito
  };
}

function urlMatchesPattern(url, pattern) {
  if (!pattern || typeof pattern !== 'string') return true;
  const u = String(url || '');
  if (pattern.indexOf('*') === -1) return u === pattern || u.startsWith(pattern);
  try {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`).test(u);
  } catch (_) {
    return u.includes(pattern.replace(/\*/g, ''));
  }
}

function tabMatchesQuery(tab, queryInfo) {
  if (!tab) return false;
  const q = queryInfo && typeof queryInfo === 'object' ? queryInfo : {};
  if (q.active === true && !tab.active) return false;
  if (q.currentWindow === true && tab.windowId !== 1) return false;
  if (q.pinned === true && !tab.pinned) return false;
  if (q.audible === true && !tab.audible) return false;
  if (typeof q.url === 'string' && !urlMatchesPattern(tab.url, q.url)) return false;
  if (Array.isArray(q.windowId) && q.windowId.length && !q.windowId.includes(tab.windowId)) return false;
  if (Number.isFinite(q.windowId) && tab.windowId !== q.windowId) return false;
  return true;
}

function installChromeShims(root, tabContext) {
  const chromeObj = (root.chrome = root.chrome || {});
  const fakeTab = normalizeTabContext(tabContext);
  const fakeWindow = fakeTab
    ? { id: fakeTab.windowId, focused: true, incognito: fakeTab.incognito, type: 'normal' }
    : null;

  function eventStub() {
    return {
      addListener() {},
      removeListener() {},
      hasListener() {
        return false;
      }
    };
  }

  function noop() {
    const cb = arguments.length ? arguments[arguments.length - 1] : null;
    if (typeof cb === 'function') setTimeout(() => cb(), 0);
  }

  function invokeCb(callback, result) {
    if (typeof callback === 'function') setTimeout(() => callback(result), 0);
    return Promise.resolve(result);
  }

  chromeObj.action = chromeObj.action || {};
  for (const key of [
    'setIcon',
    'setBadgeText',
    'setBadgeBackgroundColor',
    'setTitle',
    'setPopup',
    'enable',
    'disable'
  ]) {
    if (typeof chromeObj.action[key] !== 'function') chromeObj.action[key] = noop;
  }
  chromeObj.browserAction = chromeObj.browserAction || chromeObj.action;

  chromeObj.windows = chromeObj.windows || {};
  if (typeof chromeObj.windows.getCurrent !== 'function') {
    chromeObj.windows.getCurrent = function (query, callback) {
      if (typeof query === 'function') callback = query;
      return invokeCb(callback, fakeWindow);
    };
  }
  if (typeof chromeObj.windows.getLastFocused !== 'function') {
    chromeObj.windows.getLastFocused = chromeObj.windows.getCurrent;
  }
  if (typeof chromeObj.windows.getAll !== 'function') {
    chromeObj.windows.getAll = function (_query, callback) {
      if (typeof _query === 'function') callback = _query;
      return invokeCb(callback, fakeWindow ? [fakeWindow] : []);
    };
  }
  if (typeof chromeObj.windows.update !== 'function') chromeObj.windows.update = noop;
  if (typeof chromeObj.windows.create !== 'function') chromeObj.windows.create = noop;

  chromeObj.tabs = chromeObj.tabs || {};
  const nativeQuery = typeof chromeObj.tabs.query === 'function' ? chromeObj.tabs.query.bind(chromeObj.tabs) : null;
  const nativeGet = typeof chromeObj.tabs.get === 'function' ? chromeObj.tabs.get.bind(chromeObj.tabs) : null;

  chromeObj.tabs.query = function (queryInfo, callback) {
    const q = queryInfo && typeof queryInfo === 'object' ? queryInfo : {};
    const cb = typeof callback === 'function' ? callback : typeof queryInfo === 'function' ? queryInfo : null;
    const finish = (tabs) => invokeCb(cb, tabs);

    if (nativeQuery && !q.active && !q.currentWindow && !q.highlighted) {
      try {
        const maybe = nativeQuery(q, cb);
        if (maybe && typeof maybe.then === 'function') {
          return maybe.catch(() => finish(fakeTab && tabMatchesQuery(fakeTab, q) ? [fakeTab] : []));
        }
        return maybe;
      } catch (_) {}
    }

    if (!fakeTab) return finish([]);
    return finish(tabMatchesQuery(fakeTab, q) ? [fakeTab] : []);
  };

  chromeObj.tabs.get = function (tabId, callback) {
    const cb = typeof callback === 'function' ? callback : null;
    if (nativeGet && (!fakeTab || tabId !== fakeTab.id)) {
      try {
        return nativeGet(tabId, callback);
      } catch (_) {}
    }
    if (fakeTab && tabId === fakeTab.id) return invokeCb(cb, fakeTab);
    const err = new Error(`No tab with id: ${tabId}`);
    if (cb) setTimeout(() => cb(undefined), 0);
    return Promise.reject(err);
  };

  if (typeof chromeObj.tabs.getCurrent !== 'function') {
    chromeObj.tabs.getCurrent = function (callback) {
      return invokeCb(callback, fakeTab);
    };
  }

  chromeObj.contextMenus = chromeObj.contextMenus || {};
  for (const key of ['create', 'update', 'remove', 'removeAll']) {
    if (typeof chromeObj.contextMenus[key] !== 'function') chromeObj.contextMenus[key] = noop;
  }
  chromeObj.contextMenus.onClicked = chromeObj.contextMenus.onClicked || eventStub();

  chromeObj.scripting = chromeObj.scripting || {};
  if (typeof chromeObj.scripting.executeScript !== 'function') {
    chromeObj.scripting.executeScript = function (_details, callback) {
      return invokeCb(callback, []);
    };
  }
  if (typeof chromeObj.scripting.insertCSS !== 'function') chromeObj.scripting.insertCSS = noop;
  if (typeof chromeObj.scripting.removeCSS !== 'function') chromeObj.scripting.removeCSS = noop;

  chromeObj.fontSettings = chromeObj.fontSettings || {};
  if (typeof chromeObj.fontSettings.getFontList !== 'function') {
    chromeObj.fontSettings.getFontList = function (callback) {
      return invokeCb(callback, []);
    };
  }

  if (chromeObj.runtime && typeof chromeObj.runtime.setUninstallURL !== 'function') {
    chromeObj.runtime.setUninstallURL = noop;
  }
}

function buildBackgroundShimSource() {
  return `(function(){${installChromeShims.toString()};installChromeShims(typeof globalThis!=='undefined'?globalThis:self,null);})();`;
}

module.exports = {
  normalizeTabContext,
  installChromeShims,
  buildBackgroundShimSource
};
