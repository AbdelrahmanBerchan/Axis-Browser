'use strict';

/**
 * Early chrome.* gap-shims for extension popup/options pages.
 * These windows use contextIsolation=false (no Node) so Electron can inject
 * chrome.runtime into the same world as the extension UI — matching how
 * Chromium extension pages work. Site tabs stay contextIsolation+sandbox.
 */
(function axisExtensionPopupPreload() {
  try {
    const { axisEnsureExtensionChromeApiShims } = require('./axis-extension-chrome-shims');
    axisEnsureExtensionChromeApiShims();
  } catch (_) {
    /* ignore */
  }
})();
