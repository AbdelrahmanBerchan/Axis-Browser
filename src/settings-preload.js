'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Preload for the native Settings popup window (`settings.html`). */
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  getSettings: () => ipcRenderer.invoke('get-settings'),
  getSettingsWindowBootstrap: () => ipcRenderer.sendSync('axis-settings-window-bootstrap'),
  getSettingsProfileBootstrap: () => ipcRenderer.sendSync('axis-settings-profile-bootstrap'),
  getSystemUiTheme: () => ipcRenderer.invoke('get-system-ui-theme'),
  onSystemUiThemeChanged: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('system-ui-theme-changed', handler);
    return () => ipcRenderer.removeListener('system-ui-theme-changed', handler);
  },
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  getSitePermissionOverrides: () => ipcRenderer.invoke('get-site-permission-overrides'),
  setSitePermissionOverrides: (obj) => ipcRenderer.invoke('set-site-permission-overrides', obj),
  getSettingsEditingContext: () => ipcRenderer.invoke('get-settings-editing-context'),
  setSettingsEditingProfile: (profileId) =>
    ipcRenderer.invoke('set-settings-editing-profile', profileId),
  sendSettingsUpdated: () => ipcRenderer.send('settings-updated'),
  openSettingsWindow: (tab) => ipcRenderer.invoke('open-settings-window', tab),
  closeSettingsWindow: () => ipcRenderer.invoke('axis-close-settings-window'),
  openUrlInBrowser: (url) => ipcRenderer.invoke('open-url-in-browser', url),
  openExternalUrl: (url) => ipcRenderer.invoke('open-external-url', url),

  getHistory: () => ipcRenderer.invoke('get-history'),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),

  getExtensions: () => ipcRenderer.invoke('get-extensions'),
  installExtension: () => ipcRenderer.invoke('install-extension'),
  installExtensionFromWebStore: (rawInput) =>
    ipcRenderer.invoke('install-extension-from-web-store', rawInput),
  installExtensionCrx: () => ipcRenderer.invoke('install-extension-crx'),
  setExtensionEnabled: (id, enabled) => ipcRenderer.invoke('set-extension-enabled', id, enabled),
  removeExtension: (id) => ipcRenderer.invoke('remove-extension', id),
  openExtensionOptions: (id) => ipcRenderer.invoke('open-extension-options', id),

  vaultStatus: () => ipcRenderer.invoke('axis-vault-status'),
  vaultVerifyDevice: (reason) => ipcRenderer.invoke('axis-vault-verify-device', reason),
  vaultRevealLogin: (id) => ipcRenderer.invoke('axis-vault-reveal-login', id),
  vaultRevealCard: (id) => ipcRenderer.invoke('axis-vault-reveal-card', id),
  vaultListLogins: () => ipcRenderer.invoke('axis-vault-list-logins'),
  vaultGetLogin: (id) => ipcRenderer.invoke('axis-vault-get-login', id),
  vaultSaveLogin: (entry) => ipcRenderer.invoke('axis-vault-save-login', entry),
  vaultDeleteLogin: (id) => ipcRenderer.invoke('axis-vault-delete-login', id),
  vaultListCards: () => ipcRenderer.invoke('axis-vault-list-cards'),
  vaultGetCard: (id) => ipcRenderer.invoke('axis-vault-get-card', id),
  vaultSaveCard: (entry) => ipcRenderer.invoke('axis-vault-save-card', entry),
  vaultDeleteCard: (id) => ipcRenderer.invoke('axis-vault-delete-card', id),
  vaultListAddresses: () => ipcRenderer.invoke('axis-vault-list-addresses'),
  vaultGetAddress: (id) => ipcRenderer.invoke('axis-vault-get-address', id),
  vaultSaveAddress: (entry) => ipcRenderer.invoke('axis-vault-save-address', entry),
  vaultDeleteAddress: (id) => ipcRenderer.invoke('axis-vault-delete-address', id),

  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  getShortcutOverrides: () => ipcRenderer.invoke('get-shortcut-overrides'),
  getDefaultShortcuts: () => ipcRenderer.invoke('get-default-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),
  resetShortcuts: () => ipcRenderer.invoke('reset-shortcuts'),
  disableShortcuts: () => ipcRenderer.invoke('disable-shortcuts'),
  enableShortcuts: () => ipcRenderer.invoke('enable-shortcuts'),

  onSettingsUpdated: (callback) =>
    ipcRenderer.on('settings-updated', (_event, data) => callback(data)),
  onSwitchSettingsTab: (callback) =>
    ipcRenderer.on('switch-settings-tab', (_event, tab) => callback(tab)),
  onSettingsEditingProfileChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('settings-editing-profile-changed', handler);
    return () => ipcRenderer.removeListener('settings-editing-profile-changed', handler);
  },

  getProfiles: () => ipcRenderer.invoke('get-profiles'),
  getCurrentProfileId: () => ipcRenderer.invoke('get-current-profile-id'),
  createProfile: (payload) => ipcRenderer.invoke('create-profile', payload),
  updateProfile: (payload) => ipcRenderer.invoke('update-profile', payload),
  deleteProfile: (profileId) =>
    ipcRenderer.invoke(
      'delete-profile',
      typeof profileId === 'object' ? profileId : { id: profileId }
    ),
  reorderProfiles: (orderedIds) => ipcRenderer.invoke('reorder-profiles', orderedIds),
  switchProfileInWindow: (profileId) => ipcRenderer.invoke('switch-profile-in-window', profileId),
  openOrFocusProfileWindow: (profileId) => ipcRenderer.invoke('open-or-focus-profile-window', profileId),
  onProfilesUpdated: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('profiles-updated', handler);
    return () => ipcRenderer.removeListener('profiles-updated', handler);
  },
  getProfileGlobalSettings: () => ipcRenderer.invoke('get-profile-global-settings'),
  setProfileGlobalSetting: (key, value) =>
    ipcRenderer.invoke('set-profile-global-setting', key, value),
  getProfilesOverviewForWindow: () => ipcRenderer.invoke('get-profiles-overview-for-window'),
  exportAxisProfile: (profileId) => ipcRenderer.invoke('export-axis-profile', profileId),
  importAxisProfileBackup: () => ipcRenderer.invoke('import-axis-profile-backup'),
  listImportableBrowsers: () => ipcRenderer.invoke('list-importable-browsers'),
  listBrowserImportProfiles: (browserId) => ipcRenderer.invoke('list-browser-import-profiles', browserId),
  pickBrowserProfileFolder: () => ipcRenderer.invoke('pick-browser-profile-folder'),
  inspectImportProfileFolder: (folderPath) => ipcRenderer.invoke('inspect-import-profile-folder', folderPath),
  importBrowserProfile: (payload) => ipcRenderer.invoke('import-browser-profile', payload),
  previewBrowserImport: (payload) => ipcRenderer.invoke('preview-browser-import', payload)
});
