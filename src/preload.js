const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  /** Sync; used by standalone `settings.html` before first paint so theme never follows the OS. */
  getSettingsWindowBootstrap: () => ipcRenderer.sendSync('axis-settings-window-bootstrap'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  /** Sync write before quit — avoids losing tab groups when async setSetting does not finish. */
  flushSessionSync: (payload) => ipcRenderer.sendSync('axis-flush-session-sync', payload),
  getSitePermissionOverrides: () => ipcRenderer.invoke('get-site-permission-overrides'),
  setSitePermissionOverrides: (obj) => ipcRenderer.invoke('set-site-permission-overrides', obj),
  sendSettingsUpdated: () => ipcRenderer.send('settings-updated'),
  openSettingsWindow: (tab) => ipcRenderer.invoke('open-settings-window', tab),
  getSettingsTabLoadUrl: (section) => ipcRenderer.invoke('get-settings-tab-load-url', section),
  getSettingsWebviewPreloadPath: () => ipcRenderer.invoke('get-settings-webview-preload-path'),
  openUrlInBrowser: (url) => ipcRenderer.invoke('open-url-in-browser', url),
  printPage: (webContentsId) => ipcRenderer.invoke('print-page', webContentsId),
  getExtensions: () => ipcRenderer.invoke('get-extensions'),
  installExtension: () => ipcRenderer.invoke('install-extension'),
  installExtensionFromWebStore: (rawInput) =>
    ipcRenderer.invoke('install-extension-from-web-store', rawInput),
  installExtensionCrx: () => ipcRenderer.invoke('install-extension-crx'),
  getWebviewCwsPreloadPath: () => ipcRenderer.invoke('get-webview-cws-preload-path'),
  setExtensionEnabled: (id, enabled) => ipcRenderer.invoke('set-extension-enabled', id, enabled),
  removeExtension: (id) => ipcRenderer.invoke('remove-extension', id),
  openExtensionOptions: (id) => ipcRenderer.invoke('open-extension-options', id),
  openExtensionPopup: (id) => ipcRenderer.invoke('open-extension-popup', id),
  
  // History management
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistoryItem: (item) => ipcRenderer.invoke('add-history-item', item),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
  
  // Downloads management
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  getActiveDownloads: () => ipcRenderer.invoke('get-active-downloads'),
  cancelActiveDownload: (axisId) => ipcRenderer.invoke('cancel-active-download', axisId),
  addDownload: (downloadInfo) => ipcRenderer.invoke('add-download', downloadInfo),
  updateDownloadProgress: (id, progress) => ipcRenderer.invoke('update-download-progress', id, progress),
  clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
  deleteDownload: (id) => ipcRenderer.invoke('delete-download', id),
  
  // Library (local files) management
  getLibraryItems: (locationKey) => ipcRenderer.invoke('get-library-items', locationKey),
  openLibraryItem: (fullPath) => ipcRenderer.invoke('open-library-item', fullPath),
  showItemInFolder: (filePath) => ipcRenderer.invoke('show-item-in-folder', filePath),
  startFileDrag: (filePath) => ipcRenderer.send('start-file-drag', filePath),
  cacheDragIcons: (paths) => ipcRenderer.invoke('cache-drag-icons', paths),
  showDownloadsPopup: (x, y, width, height) => ipcRenderer.invoke('show-downloads-popup', x, y, width, height),
  getDownloadsFromFolder: () => ipcRenderer.invoke('get-downloads-from-folder'),
  getFileThumbnailDataUrl: (filePath, maxSize) => ipcRenderer.invoke('get-file-thumbnail-data-url', filePath, maxSize),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  onDownloadsPopupAction: (callback) => ipcRenderer.on('downloads-popup-action', (event, action, data) => callback(action, data)),
  onAxisDownloadActivity: (callback) =>
    ipcRenderer.on('axis-download-activity', (_event, payload) => callback(payload)),
  showDownloadsItemContextMenu: (x, y, filePath) => ipcRenderer.invoke('show-downloads-item-context-menu', x, y, filePath),
  
  // Event listeners
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', callback),
  onRequestQuit: (callback) => ipcRenderer.on('request-quit', callback),
  onBrowserShortcut: (callback) => ipcRenderer.on('browser-shortcut', (event, action) => callback(action)),
  onAxisHostNavGesture: (callback) => {
    const handler = (_event, action) => {
      if (action === 'back' || action === 'forward') callback(action);
    };
    ipcRenderer.on('axis-host-nav-gesture', handler);
    return () => ipcRenderer.removeListener('axis-host-nav-gesture', handler);
  },
  onOpenUrlInBrowser: (callback) => ipcRenderer.on('open-url-in-browser', (event, url) => callback(url)),
  onOpenSettingsTab: (callback) => ipcRenderer.on('open-settings-tab', (event, section) => callback(section)),
  onSettingsUpdated: (callback) =>
    ipcRenderer.on('settings-updated', (_event, data) => callback(data)),
  onProfilesUpdated: (callback) => ipcRenderer.on('profiles-updated', () => callback()),
  onProfileMenuAction: (callback) =>
    ipcRenderer.on('profile-menu-action', (_event, payload) => callback(payload)),
  onSwitchSettingsTab: (callback) => ipcRenderer.on('switch-settings-tab', (event, tab) => callback(tab)),
  onOpenPopupUrl: (callback) => ipcRenderer.on('open-popup-url', (event, url) => callback(url)),
  confirmQuit: () => ipcRenderer.send('confirm-quit'),
  cancelQuit: () => ipcRenderer.send('cancel-quit'),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Incognito window (optional URL to open in a new tab)
  openIncognitoWindow: (url) => ipcRenderer.invoke('open-incognito-window', url),
  openOrFocusIncognitoWindow: () => ipcRenderer.invoke('open-or-focus-incognito-window'),
  openOrFocusPersonalWindow: () => ipcRenderer.invoke('open-or-focus-personal-window'),
  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  createProfile: (payload) => ipcRenderer.invoke('create-profile', payload),
  updateProfile: (payload) => ipcRenderer.invoke('update-profile', payload),
  reorderProfiles: (orderedIds) => ipcRenderer.invoke('reorder-profiles', orderedIds),
  deleteProfile: (profileId) =>
    ipcRenderer.invoke(
      'delete-profile',
      typeof profileId === 'object' ? profileId : { id: profileId }
    ),
  openOrFocusProfileWindow: (profileId) => ipcRenderer.invoke('open-or-focus-profile-window', profileId),
  openUrlInNewWindow: (url) => ipcRenderer.invoke('open-url-in-new-window', url),
  
  // Sidebar favorites
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  setFavorites: (items) => ipcRenderer.invoke('set-favorites', items),
  fetchFaviconBytes: (url) => ipcRenderer.invoke('axis-fetch-favicon-bytes', url),
  showFavoriteContextMenu: (x, y, info) => ipcRenderer.invoke('show-favorite-context-menu', x, y, info),
  onFavoriteContextMenuAction: (callback) =>
    ipcRenderer.on('favorite-context-menu-action', (event, action, data) => callback(action, data)),

  // Password & card vault (encrypted local store)
  vaultStatus: () => ipcRenderer.invoke('axis-vault-status'),
  vaultGetPageScanJs: () => ipcRenderer.invoke('axis-vault-get-page-scan-js'),
  vaultGetAutofillInjectJs: () => ipcRenderer.invoke('axis-vault-get-autofill-inject-js'),
  vaultBuildAutofillShowJs: (items, theme) =>
    ipcRenderer.invoke('axis-vault-build-autofill-show-js', { items, theme }),
  vaultBuildAutofillFillJs: (cred) => ipcRenderer.invoke('axis-vault-build-autofill-fill-js', cred),
  vaultReportCredentials: (payload) => ipcRenderer.invoke('axis-vault-report-credentials', payload),
  vaultVerifyDevice: (reason) => ipcRenderer.invoke('axis-vault-verify-device', reason),
  vaultRevealLogin: (id) => ipcRenderer.invoke('axis-vault-reveal-login', id),
  vaultRevealCard: (id) => ipcRenderer.invoke('axis-vault-reveal-card', id),
  vaultGetLoginForFill: (id) => ipcRenderer.invoke('axis-vault-get-login-for-fill', id),
  vaultGetCardForFill: (id) => ipcRenderer.invoke('axis-vault-get-card-for-fill', id),
  vaultListLogins: () => ipcRenderer.invoke('axis-vault-list-logins'),
  vaultGetLogin: (id) => ipcRenderer.invoke('axis-vault-get-login', id),
  vaultSaveLogin: (entry) => ipcRenderer.invoke('axis-vault-save-login', entry),
  vaultDeleteLogin: (id) => ipcRenderer.invoke('axis-vault-delete-login', id),
  vaultListCards: () => ipcRenderer.invoke('axis-vault-list-cards'),
  vaultGetCard: (id) => ipcRenderer.invoke('axis-vault-get-card', id),
  vaultSaveCard: (entry) => ipcRenderer.invoke('axis-vault-save-card', entry),
  vaultDeleteCard: (id) => ipcRenderer.invoke('axis-vault-delete-card', id),
  vaultCaptureLogin: (payload) => ipcRenderer.invoke('axis-vault-capture-login', payload),
  vaultShouldOfferLoginSave: (payload) => ipcRenderer.invoke('axis-vault-should-offer-login-save', payload),
  vaultFillCandidates: (payload) => ipcRenderer.invoke('axis-vault-fill-candidates', payload),
  onVaultGuestIpc: (callback) => {
    const handler = (_event, msg) => callback(msg);
    ipcRenderer.on('axis-vault-guest-ipc', handler);
    return () => ipcRenderer.removeListener('axis-vault-guest-ipc', handler);
  },

  // Notes management
  getNotes: () => ipcRenderer.invoke('get-notes'),
  saveNote: (note) => ipcRenderer.invoke('save-note', note),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  
  // Window controls
  setWindowButtonVisibility: (visible) => ipcRenderer.invoke('set-window-button-visibility', visible),
  setSidebarTrafficLayout: (sidebarOnRight) =>
    ipcRenderer.invoke('set-sidebar-traffic-layout', sidebarOnRight),
  setWindowTitle: (title) => ipcRenderer.invoke('set-window-title', title),
  
  // Keyboard shortcuts
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  getShortcutOverrides: () => ipcRenderer.invoke('get-shortcut-overrides'),
  getDefaultShortcuts: () => ipcRenderer.invoke('get-default-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),
  resetShortcuts: () => ipcRenderer.invoke('reset-shortcuts'),
  disableShortcuts: () => ipcRenderer.invoke('disable-shortcuts'),
  enableShortcuts: () => ipcRenderer.invoke('enable-shortcuts'),
  
  // Performance monitoring
  getPerformanceMetrics: () => ipcRenderer.invoke('get-performance-metrics'),
  getTabMemoryUsage: (tabId) => ipcRenderer.invoke('get-tab-memory-usage', tabId),
  
  // Sidebar context menu
  showSidebarContextMenu: (x, y, isRight) => ipcRenderer.invoke('show-sidebar-context-menu', x, y, isRight),
  onSidebarContextMenuAction: (callback) => ipcRenderer.on('sidebar-context-menu-action', (event, action) => callback(action)),
  
  // Webpage context menu
  showWebpageContextMenu: (x, y, contextInfo) => ipcRenderer.invoke('show-webpage-context-menu', x, y, contextInfo),
  copyImageAtGuest: (guestWebContentsId, x, y) =>
    ipcRenderer.invoke('copy-image-at-guest', { guestWebContentsId, x, y }),
  writeClipboardText: (text) => ipcRenderer.invoke('write-clipboard-text', text),
  saveImageFromUrl: (url, guestWebContentsId) =>
    ipcRenderer.invoke('save-image-from-url', { url, guestWebContentsId }),
  onWebpageContextMenuAction: (callback) => ipcRenderer.on('webpage-context-menu-action', (event, action, data) => callback(action, data)),
  addToSpellCheckerDictionary: (word) => ipcRenderer.invoke('add-to-spellcheck-dictionary', word),
  
  // URL bar context menu
  showUrlBarContextMenu: (x, y, contextInfo) => ipcRenderer.invoke('show-urlbar-context-menu', x, y, contextInfo),
  onUrlBarContextMenuAction: (callback) => ipcRenderer.on('urlbar-context-menu-action', (event, action, data) => callback(action, data)),
  
  // Tab context menu
  showTabContextMenu: (x, y, tabInfo) => ipcRenderer.invoke('show-tab-context-menu', x, y, tabInfo),
  onTabContextMenuAction: (callback) => ipcRenderer.on('tab-context-menu-action', (event, action, data) => callback(action, data)),
  
  // Tab group context menu
  showTabGroupContextMenu: (x, y, info) => ipcRenderer.invoke('show-tab-group-context-menu', x, y, info),
  onTabGroupContextMenuAction: (callback) => ipcRenderer.on('tab-group-context-menu-action', (event, action, data) => callback(action, data)),
  
  // Icon picker
  showIconPicker: (type) => ipcRenderer.invoke('show-icon-picker', type),
  onTriggerNativeEmojiPicker: (callback) => ipcRenderer.on('trigger-native-emoji-picker', (event, type) => callback(type))
});
