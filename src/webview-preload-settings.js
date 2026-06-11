'use strict';

const { contextBridge, ipcRenderer } = require('electron');

/** Guest preload for `settings.html` in a tab `<webview>` (matches standalone Settings window APIs). */
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,

  getSettings: () => ipcRenderer.invoke('get-settings'),
  getSettingsWindowBootstrap: () => ipcRenderer.sendSync('axis-settings-window-bootstrap'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  getSitePermissionOverrides: () => ipcRenderer.invoke('get-site-permission-overrides'),
  setSitePermissionOverrides: (obj) => ipcRenderer.invoke('set-site-permission-overrides', obj),
  sendSettingsUpdated: () => ipcRenderer.send('settings-updated'),
  openSettingsWindow: (tab) => ipcRenderer.invoke('open-settings-window', tab),
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
    ipcRenderer.on('switch-settings-tab', (_event, tab) => callback(tab))
});
