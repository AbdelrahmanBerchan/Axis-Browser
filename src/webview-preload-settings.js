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

  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  getShortcutOverrides: () => ipcRenderer.invoke('get-shortcut-overrides'),
  getDefaultShortcuts: () => ipcRenderer.invoke('get-default-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),
  resetShortcuts: () => ipcRenderer.invoke('reset-shortcuts'),
  disableShortcuts: () => ipcRenderer.invoke('disable-shortcuts'),
  enableShortcuts: () => ipcRenderer.invoke('enable-shortcuts'),

  onSettingsUpdated: (callback) => ipcRenderer.on('settings-updated', callback),
  onSwitchSettingsTab: (callback) =>
    ipcRenderer.on('switch-settings-tab', (_event, tab) => callback(tab))
});
