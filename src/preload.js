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
  
  // Event listeners
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
