'use strict';

/**
 * Early chrome.* gap-shims for extension popup/options pages.
 * These windows use contextIsolation=true, nodeIntegration=false, sandbox=true
 * so Electron can inject chrome.runtime for extension UI. Site tabs stay
 * contextIsolation+sandbox as well.
 */
(function axisExtensionPopupPreload() {
  try {
    const { axisEnsureExtensionChromeApiShims } = require('./axis-extension-chrome-shims');
    axisEnsureExtensionChromeApiShims();
  } catch (_) {
    /* ignore */
  }
})();
