const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),
  
  // History management
  getHistory: () => ipcRenderer.invoke('get-history'),
  addHistoryItem: (item) => ipcRenderer.invoke('add-history-item', item),
  clearHistory: () => ipcRenderer.invoke('clear-history'),
  deleteHistoryItem: (id) => ipcRenderer.invoke('delete-history-item', id),
  
  // Downloads management
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  addDownload: (downloadInfo) => ipcRenderer.invoke('add-download', downloadInfo),
  updateDownloadProgress: (id, progress) => ipcRenderer.invoke('update-download-progress', id, progress),
  clearDownloads: () => ipcRenderer.invoke('clear-downloads'),
  deleteDownload: (id) => ipcRenderer.invoke('delete-download', id),
  
  // Library (local files) management
  getLibraryItems: (locationKey) => ipcRenderer.invoke('get-library-items', locationKey),
  openLibraryItem: (fullPath) => ipcRenderer.invoke('open-library-item', fullPath),
  
  // Event listeners
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', callback),
  onRequestQuit: (callback) => ipcRenderer.on('request-quit', callback),
  onBrowserShortcut: (callback) => ipcRenderer.on('browser-shortcut', (event, action) => callback(action)),
  onOpenPopupUrl: (callback) => ipcRenderer.on('open-popup-url', (event, url) => callback(url)),
  confirmQuit: () => ipcRenderer.send('confirm-quit'),
  cancelQuit: () => ipcRenderer.send('cancel-quit'),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Incognito window
  openIncognitoWindow: () => ipcRenderer.invoke('open-incognito-window'),
  
  // Notes management
  getNotes: () => ipcRenderer.invoke('get-notes'),
  saveNote: (note) => ipcRenderer.invoke('save-note', note),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  
  // Window controls
  setWindowButtonVisibility: (visible) => ipcRenderer.invoke('set-window-button-visibility', visible),
  
  // Keyboard shortcuts
  getShortcuts: () => ipcRenderer.invoke('get-shortcuts'),
  getDefaultShortcuts: () => ipcRenderer.invoke('get-default-shortcuts'),
  setShortcuts: (shortcuts) => ipcRenderer.invoke('set-shortcuts', shortcuts),
  resetShortcuts: () => ipcRenderer.invoke('reset-shortcuts'),
  disableShortcuts: () => ipcRenderer.invoke('disable-shortcuts'),
  enableShortcuts: () => ipcRenderer.invoke('enable-shortcuts'),
  
  // Performance monitoring
  getPerformanceMetrics: () => ipcRenderer.invoke('get-performance-metrics'),
  getTabMemoryUsage: (tabId) => ipcRenderer.invoke('get-tab-memory-usage', tabId)
});
