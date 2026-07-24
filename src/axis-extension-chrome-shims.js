'use strict';

/**
 * Optional chrome.* gap-shims. Never invent a blank `chrome` object — that
 * blocks Electron’s real extension API injection.
 */
function axisEnsureExtensionChromeApiShims() {
  try {
    const root = typeof globalThis !== 'undefined' ? globalThis : window;
    const chromeObj = root.chrome;
    if (!chromeObj) return;
    const noop = function () {
      const cb = arguments.length ? arguments[arguments.length - 1] : null;
      if (typeof cb === 'function') setTimeout(() => cb(), 0);
    };

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
    if (typeof chromeObj.windows.getAll !== 'function') {
      chromeObj.windows.getAll = function (_query, callback) {
        if (typeof _query === 'function') callback = _query;
        if (typeof callback === 'function') setTimeout(() => callback([]), 0);
      };
    }
    if (typeof chromeObj.windows.update !== 'function') chromeObj.windows.update = noop;
    if (typeof chromeObj.windows.create !== 'function') chromeObj.windows.create = noop;

    chromeObj.contextMenus = chromeObj.contextMenus || {};
    for (const key of ['create', 'update', 'remove', 'removeAll']) {
      if (typeof chromeObj.contextMenus[key] !== 'function') chromeObj.contextMenus[key] = noop;
    }

    chromeObj.scripting = chromeObj.scripting || {};
    if (typeof chromeObj.scripting.executeScript !== 'function') {
      chromeObj.scripting.executeScript = function (_details, callback) {
        if (typeof callback === 'function') setTimeout(() => callback([]), 0);
        return Promise.resolve([]);
      };
    }
    if (typeof chromeObj.scripting.insertCSS !== 'function') chromeObj.scripting.insertCSS = noop;
    if (typeof chromeObj.scripting.removeCSS !== 'function') chromeObj.scripting.removeCSS = noop;

    chromeObj.fontSettings = chromeObj.fontSettings || {};
    if (typeof chromeObj.fontSettings.getFontList !== 'function') {
      chromeObj.fontSettings.getFontList = function (callback) {
        if (typeof callback === 'function') setTimeout(() => callback([]), 0);
      };
    }

    if (chromeObj.runtime && typeof chromeObj.runtime.setUninstallURL !== 'function') {
      chromeObj.runtime.setUninstallURL = noop;
    }
  } catch (_) {
    /* ignore */
  }
}

module.exports = {
  axisEnsureExtensionChromeApiShims,
  AXIS_EXTENSION_CHROME_SHIM_JS: `(${axisEnsureExtensionChromeApiShims.toString()})();`
};
