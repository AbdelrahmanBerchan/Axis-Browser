'use strict';

/** Notify the Axis shell when this page enters or leaves HTML fullscreen. */
(function axisGuestFullscreenHostSync() {
  try {
    const { ipcRenderer } = require('electron');

    const isFullscreen = () =>
      !!(document.fullscreenElement || document.webkitFullscreenElement);

    const notify = () => {
      try {
        ipcRenderer.sendToHost('axis-guest-html-fullscreen', { active: isFullscreen() });
      } catch (_) {}
    };

    document.addEventListener('fullscreenchange', notify, true);
    document.addEventListener('webkitfullscreenchange', notify, true);
  } catch (_) {
    /* guest preload unavailable */
  }
})();
