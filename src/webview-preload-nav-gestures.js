'use strict';

/** Notify the Axis shell when this guest becomes visible again (tab switch / webview show). */
(function axisGuestMediaRecoveryHostSync() {
  try {
    const { ipcRenderer } = require('electron');
    let wasHidden = document.visibilityState === 'hidden';

    const notifyIfShown = () => {
      const visible = document.visibilityState === 'visible';
      if (visible && wasHidden) {
        try {
          ipcRenderer.sendToHost('axis-guest-visible');
        } catch (_) {}
      }
      wasHidden = !visible;
    };

    document.addEventListener('visibilitychange', notifyIfShown, true);
    window.addEventListener('pageshow', notifyIfShown, true);
  } catch (_) {
    /* guest preload unavailable */
  }
})();
