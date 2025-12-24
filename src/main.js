const { app, BrowserWindow, Menu, ipcMain, dialog, session, globalShortcut, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');

// Initialize settings store
const store = new Store();

// Initialize history and downloads stores
const historyStore = new Store({ name: 'history' });
const downloadsStore = new Store({ name: 'downloads' });
const notesStore = new Store({ name: 'notes' });

// Keep a global reference of the window object
let mainWindow;
let isQuitConfirmed = false;
let isUserQuitting = false;

// ========== Keyboard Shortcuts (Global Functions) ==========

// Default keyboard shortcuts
const getDefaultShortcuts = () => {
  const cmdOrCtrl = process.platform === 'darwin' ? 'Cmd' : 'Ctrl';
  return {
    'close-tab': `${cmdOrCtrl}+W`,
    'spotlight-search': `${cmdOrCtrl}+T`,
    'toggle-sidebar': `${cmdOrCtrl}+B`,
    'refresh': `${cmdOrCtrl}+R`,
    'focus-url': `${cmdOrCtrl}+L`,
    'pin-tab': `${cmdOrCtrl}+P`,
    'new-tab': `${cmdOrCtrl}+N`,
    'settings': `${cmdOrCtrl}+,`,
    'recover-tab': `${cmdOrCtrl}+Z`,
    'history': `${cmdOrCtrl}+Y`,
    'downloads': `${cmdOrCtrl}+J`,
    'find': `${cmdOrCtrl}+F`,
    'copy-url': `${cmdOrCtrl}+Shift+C`,
    'clear-history': `${cmdOrCtrl}+Shift+H`,
    'clear-downloads': `${cmdOrCtrl}+Shift+J`,
    'zoom-in': `${cmdOrCtrl}+=`,
    'zoom-out': `${cmdOrCtrl}+-`,
    'reset-zoom': `${cmdOrCtrl}+0`,
    'switch-tab-1': `${cmdOrCtrl}+1`,
    'switch-tab-2': `${cmdOrCtrl}+2`,
    'switch-tab-3': `${cmdOrCtrl}+3`,
    'switch-tab-4': `${cmdOrCtrl}+4`,
    'switch-tab-5': `${cmdOrCtrl}+5`,
    'switch-tab-6': `${cmdOrCtrl}+6`,
    'switch-tab-7': `${cmdOrCtrl}+7`,
    'switch-tab-8': `${cmdOrCtrl}+8`,
    'switch-tab-9': `${cmdOrCtrl}+9`
  };
};

// Get shortcuts (custom or default)
const getShortcuts = () => {
  const customShortcuts = store.get('keyboardShortcuts', null);
  if (customShortcuts) {
    // Merge with defaults to ensure all actions have shortcuts
    return { ...getDefaultShortcuts(), ...customShortcuts };
  }
  return getDefaultShortcuts();
};

// Register global shortcuts when window is focused (works even in webviews)
const registerShortcuts = () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  
  const shortcuts = getShortcuts();
  
  Object.entries(shortcuts).forEach(([action, key]) => {
    try {
      globalShortcut.register(key, () => {
        if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
          mainWindow.webContents.send('browser-shortcut', action);
        }
      });
    } catch (error) {
      console.error(`Failed to register shortcut ${key} for action ${action}:`, error);
    }
  });
};

const unregisterShortcuts = () => {
  globalShortcut.unregisterAll();
};

// Apply consolidated Chromium/Electron performance flags as early as possible
(function applyPerformanceFlags() {
  // GPU + rasterization
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-oop-rasterization');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');

  // Reduce background throttling (helps benchmarks and snappiness)
  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

  // Aggressive JavaScript/V8 performance optimizations for Speedometer
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=4096 --max-semi-space-size=256');
  app.commandLine.appendSwitch('disable-hang-monitor');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-default-apps');
  app.commandLine.appendSwitch('disable-extensions');
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-translate');
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-client-side-phishing-detection');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-domain-reliability');
  app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion,BlinkGenPropertyTrees,TranslateUI');
  
  // Networking tweaks
  app.commandLine.appendSwitch('enable-tcp-fast-open');
  app.commandLine.appendSwitch('enable-quic');

  // Combine feature flags in single switches to avoid overwriting
  app.commandLine.appendSwitch(
    'enable-features',
    [
      'BackForwardCache',
      'CanvasOopRasterization',
      'Accelerated2dCanvas',
      'ThrottleForegroundTimers',
      'VaapiVideoDecoder',
      'WebGPU',
      'WebUIDarkMode'
    ].join(',')
  );
  app.commandLine.appendSwitch(
    'disable-features',
    [
      'CalculateNativeWinOcclusion',
      'AutoExpandDetailsElement',
      'AutofillEnableAccountWalletStorage',
      'ChromeWhatsNewUI',
      'DevicePosture',
      'FedCm',
      'InterestFeedContentSuggestions',
      'MediaRouter',
      'OptimizationHints',
      'Prerender2',
      'Translate',
      'BlinkGenPropertyTrees'
    ].join(',')
  );
})();

function createWindow() {
  // Create the browser window with optimized settings
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Axis',
    icon: path.join(__dirname, 'Axis_logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      // Maximum performance optimizations
      backgroundThrottling: false,
      offscreen: false,
      experimentalFeatures: true,
      enableBlinkFeatures: 'CSSColorSchemeUARendering',
        // Reduce JS parse/compile time on startup
        v8CacheOptions: 'code',
        spellcheck: false,
      // Speed optimizations
      hardwareAcceleration: true,
      webSecurity: true,
      experimentalCanvasFeatures: true,
      enableWebGL: true,
      enableWebGL2: true,
      enableAcceleratedVideoDecode: true,
      enableAcceleratedVideoEncode: true,
      enableGpuRasterization: true,
      enableZeroCopy: true,
      enableHardwareAcceleration: true,
      enableAggressiveDomStorageFlushing: true,
      enableExperimentalWebPlatformFeatures: true,
      enableTcpFastOpen: true,
      enableQuic: true,
      aggressiveCacheDiscard: true,
      enableNetworkService: true,
      enableNetworkServiceLogging: false,
      enableBlinkFeatures: 'CSSContainerQueries,EnableThrottleForegroundTimers,WebGPU,WebGPUDawn',
      enableThrottleForegroundTimers: true,
      enableWebGPU: true,
      enableWebGPUDawn: true
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'ultra-dark'
  });

  // Load the app
  mainWindow.loadFile('src/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    // Show window controls by default (sidebar is visible)
    mainWindow.setWindowButtonVisibility(true);
  });
  
  // Register shortcuts when window gains focus
  mainWindow.on('focus', () => {
    registerShortcuts();
  });
  
  // Unregister when window loses focus (so shortcuts don't affect other apps)
  mainWindow.on('blur', () => {
    unregisterShortcuts();
  });
  
  // Initial registration if window starts focused
  if (mainWindow.isFocused()) {
    registerShortcuts();
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Intercept close - only show quit confirmation for actual quit actions, not window close
  mainWindow.on('close', (e) => {
    // On macOS, clicking X should just hide the window, not quit
    if (process.platform === 'darwin' && !isUserQuitting) {
      // Just hide the window instead of closing it
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    
    // For actual quit actions, show confirmation
    if (!isQuitConfirmed && isUserQuitting) {
      e.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('request-quit');
      }
    }
  });

  // Handle new window requests with URL validation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Validate URL before allowing new windows
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      // Additional security checks - reject dangerous URL schemes
      const lowerUrl = url.toLowerCase();
      if (lowerUrl.startsWith('javascript:') || 
          lowerUrl.startsWith('data:') || 
          lowerUrl.startsWith('vbscript:') ||
          lowerUrl.startsWith('file:')) {
        return { action: 'deny' };
      }
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });

  // Configure session for better webview support
  const mainSession = session.defaultSession;
  
  // Clear DNS cache and configure network
  mainSession.clearHostResolverCache();

  // Note: command line switches are now set early to ensure Chromium honors them
  
  // Allow insecure content for development
  mainSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = [
      'camera',
      'microphone',
      'notifications',
      'geolocation',
      'media',
      'midi',
      'midiSysex',
      'pointerLock',
      'fullscreen',
      'openExternal'
    ];
    
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Handle certificate errors - allow all certificates
  mainSession.setCertificateVerifyProc((request, callback) => {
    // Always allow certificates
    callback(0);
  });

  // Use default Chromium user agent for best compatibility and performance
  
  // Configure web security - simplified
  mainSession.webRequest.onBeforeRequest((details, callback) => {
    // Allow all requests
    callback({ cancel: false });
  });
  
  // Enable aggressive caching
  mainSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders || {};
    
    // Add cache control headers for better performance
    headers['Cache-Control'] = 'max-age=31536000, public';
    headers['Pragma'] = 'cache';
    
    callback({ requestHeaders: headers });
  });
  
  // Enable proper caching
  mainSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders || {};
    
    // Add proper cache headers
    if (details.url.includes('.css') || details.url.includes('.js') || details.url.includes('.png') || details.url.includes('.jpg') || details.url.includes('.gif')) {
      headers['Cache-Control'] = 'max-age=3600, public';
    }
    
    // Enable compression
    headers['Accept-Encoding'] = 'gzip, deflate, br';
    
    callback({ requestHeaders: headers });
  });
  
  // Allow all requests (single handler defined above already allows)

  // Create application menu
  createMenu();
}

function createMenu() {
  // Use current shortcuts so menu accelerators always match user settings
  const shortcuts = getShortcuts();
  const closeTabShortcut = shortcuts['close-tab'] || 'CmdOrCtrl+W';

  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          click: () => {
            mainWindow.webContents.send('new-tab');
          }
        },
        {
          label: 'Close Tab',
          accelerator: closeTabShortcut,
          click: () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('close-tab');
            }
          }
        },
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            createWindow();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            isUserQuitting = true;
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('request-quit');
            } else {
              app.quit();
            }
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// App event handlers
app.whenReady().then(createWindow);

// Clean up global shortcuts on quit
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  // Don't quit on macOS, keep the app running even when all windows are closed
  // This prevents the app from closing when the last tab is closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle Cmd+Q on macOS (before-quit fires before window close)
app.on('before-quit', (e) => {
  if (process.platform === 'darwin' && !isQuitConfirmed) {
    isUserQuitting = true;
    // Prevent default quit, let the window close handler show confirmation
    e.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('request-quit');
    }
  }
});

app.on('activate', () => {
  // On macOS, show the window if it exists but is hidden
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
  } else if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC handlers
ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('set-setting', (event, key, value) => {
  store.set(key, value);
  return true;
});

// Keyboard shortcuts management
ipcMain.handle('get-shortcuts', () => {
  return getShortcuts();
});

ipcMain.handle('get-default-shortcuts', () => {
  return getDefaultShortcuts();
});

ipcMain.handle('set-shortcuts', (event, shortcuts) => {
  store.set('keyboardShortcuts', shortcuts);
  // Re-register shortcuts with new values
  unregisterShortcuts();
  registerShortcuts();
  // Rebuild application menu so accelerators match new shortcuts
  createMenu();
  return shortcuts;
});

ipcMain.handle('reset-shortcuts', () => {
  store.delete('keyboardShortcuts');
  // Re-register shortcuts with defaults
  unregisterShortcuts();
  registerShortcuts();
  return getDefaultShortcuts();
});

// Temporarily disable/enable shortcuts (e.g., when recording a new shortcut)
ipcMain.handle('disable-shortcuts', () => {
  unregisterShortcuts();
  return true;
});

ipcMain.handle('enable-shortcuts', () => {
  registerShortcuts();
  return true;
});

// History management
ipcMain.handle('get-history', () => {
  return historyStore.get('items', []);
});

ipcMain.handle('add-history-item', (event, item) => {
  const history = historyStore.get('items', []);
  const newItem = {
    id: Date.now(),
    url: item.url,
    title: item.title,
    timestamp: new Date().toISOString(),
    favicon: item.favicon || ''
  };
  
  // Remove duplicate if exists
  const existingIndex = history.findIndex(h => h.url === item.url);
  if (existingIndex !== -1) {
    history.splice(existingIndex, 1);
  }
  
  // Add to beginning and limit to 1000 items
  history.unshift(newItem);
  if (history.length > 1000) {
    history.splice(1000);
  }
  
  historyStore.set('items', history);
  return newItem;
});

ipcMain.handle('clear-history', () => {
  historyStore.set('items', []);
  return true;
});

ipcMain.handle('delete-history-item', (event, id) => {
  const history = historyStore.get('items', []);
  const filtered = history.filter(item => item.id !== id);
  historyStore.set('items', filtered);
  return true;
});

// Downloads management (history of browser downloads)
ipcMain.handle('get-downloads', () => {
  return downloadsStore.get('items', []);
});

ipcMain.handle('add-download', (event, downloadInfo) => {
  const downloads = downloadsStore.get('items', []);
  const newDownload = {
    id: Date.now(),
    url: downloadInfo.url,
    filename: downloadInfo.filename,
    path: downloadInfo.path,
    size: downloadInfo.size || 0,
    receivedBytes: 0,
    status: 'downloading',
    timestamp: new Date().toISOString()
  };
  
  downloads.unshift(newDownload);
  downloadsStore.set('items', downloads);
  return newDownload;
});

ipcMain.handle('update-download-progress', (event, id, progress) => {
  const downloads = downloadsStore.get('items', []);
  const download = downloads.find(d => d.id === id);
  if (download) {
    download.receivedBytes = progress.receivedBytes;
    download.status = progress.status || download.status;
    downloadsStore.set('items', downloads);
  }
  return download;
});

ipcMain.handle('clear-downloads', () => {
  downloadsStore.set('items', []);
  return true;
});

ipcMain.handle('delete-download', (event, id) => {
  const downloads = downloadsStore.get('items', []);
  const filtered = downloads.filter(item => item.id !== id);
  downloadsStore.set('items', filtered);
  return true;
});

// Library management - show files from common user folders (Downloads, Desktop, Documents, Pictures)
ipcMain.handle('get-library-items', async (event, locationKey = 'all') => {
  try {
    const home = os.homedir();
    const locations = {
      downloads: path.join(home, 'Downloads'),
      desktop: path.join(home, 'Desktop'),
      documents: path.join(home, 'Documents'),
      pictures: path.join(home, 'Pictures')
    };

    const keys = locationKey === 'all' ? Object.keys(locations) : [locationKey];
    const items = [];
    let defaultBaseDir = null;

    // Prioritize desktop as default baseDir
    if (locationKey === 'all' || locationKey === 'desktop') {
      const desktopDir = locations.desktop;
      if (desktopDir) {
        try {
          await fs.promises.access(desktopDir, fs.constants.R_OK);
          defaultBaseDir = desktopDir;
        } catch {
          // Desktop not accessible, will use first available
        }
      }
    }

    for (const key of keys) {
      const baseDir = locations[key];
      if (!baseDir) continue;

      try {
        await fs.promises.access(baseDir, fs.constants.R_OK);
      } catch {
        continue;
      }

      if (!defaultBaseDir) defaultBaseDir = baseDir;

      const dirEntries = await fs.promises.readdir(baseDir, { withFileTypes: true });

      const folderItems = await Promise.all(
        dirEntries
          .filter(entry => !entry.name.startsWith('.')) // hide hidden files
          .map(async (entry) => {
            const fullPath = path.join(baseDir, entry.name);
            const stat = await fs.promises.stat(fullPath);
            const isDirectory = entry.isDirectory();
            const ext = path.extname(entry.name).toLowerCase();

            let kind = 'file';
            if (isDirectory) {
              kind = 'folder';
            } else if (['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic'].includes(ext)) {
              kind = 'image';
            } else if (['.mp4', '.mov', '.mkv', '.avi', '.webm'].includes(ext)) {
              kind = 'video';
            } else if (['.mp3', '.wav', '.flac', '.aac', '.ogg'].includes(ext)) {
              kind = 'audio';
            } else if (ext === '.pdf') {
              kind = 'pdf';
            } else if (['.doc', '.docx', '.pages', '.txt', '.md'].includes(ext)) {
              kind = 'document';
            }

            return {
              name: entry.name,
              path: fullPath,
              isDirectory,
              kind,
              size: stat.size,
              mtime: stat.mtimeMs,
              source: key
            };
          })
      );

      items.push(...folderItems);
    }

    // Sort by most recently modified first
    items.sort((a, b) => b.mtime - a.mtime);

    return { baseDir: defaultBaseDir, items };
  } catch (error) {
    console.error('get-library-items failed:', error);
    return { baseDir: null, items: [] };
  }
});

ipcMain.handle('open-library-item', async (event, fullPath) => {
  try {
    if (!fullPath) return false;
    await shell.openPath(fullPath);
    return true;
  } catch (error) {
    console.error('open-library-item failed:', error);
    return false;
  }
});

// Incognito window
ipcMain.handle('open-incognito-window', () => {
  // Create a new session for incognito mode
  const incognitoSession = session.fromPartition('incognito');
  
  const incognitoWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Axis - Incognito',
    icon: path.join(__dirname, 'Axis_logo.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      offscreen: false,
      experimentalFeatures: true,
      enableBlinkFeatures: 'CSSColorSchemeUARendering',
        v8CacheOptions: 'code',
        spellcheck: false,
      session: incognitoSession,
      partition: 'incognito'
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'ultra-dark'
  });

  // Load the app
  incognitoWindow.loadFile('src/index.html');

  // Show window when ready
  incognitoWindow.once('ready-to-show', () => {
    incognitoWindow.show();
    // Show spotlight search in the incognito window
    incognitoWindow.webContents.executeJavaScript(`
      setTimeout(() => {
        if (window.browser && window.browser.showSpotlightSearch) {
          window.browser.showSpotlightSearch();
        }
      }, 1000);
    `);
  });

  // Handle window closed - clear all incognito data
  incognitoWindow.on('closed', () => {
    // Clear all incognito session data when window closes
    incognitoSession.clearStorageData();
    incognitoSession.clearCache();
    incognitoSession.clearAuthCache();
    incognitoSession.clearHostResolverCache();
  });

  return true;
});

// Notes management
ipcMain.handle('get-notes', () => {
  return notesStore.get('items', []);
});

ipcMain.handle('save-note', (event, note) => {
  const notes = notesStore.get('items', []);
  const existingIndex = notes.findIndex(n => n.id === note.id);
  
  if (existingIndex !== -1) {
    // Update existing note
    notes[existingIndex] = {
      ...notes[existingIndex],
      title: note.title,
      content: note.content,
      updatedAt: new Date().toISOString()
    };
  } else {
    // Add new note
    const newNote = {
      id: note.id || Date.now(),
      title: note.title || 'Untitled Note',
      content: note.content || '',
      createdAt: note.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    notes.unshift(newNote);
  }
  
  notesStore.set('items', notes);
  return notes[existingIndex !== -1 ? existingIndex : 0];
});

ipcMain.handle('delete-note', (event, id) => {
  const notes = notesStore.get('items', []);
  const filtered = notes.filter(note => note.id !== id);
  notesStore.set('items', filtered);
  return true;
});

ipcMain.on('confirm-quit', () => {
  isQuitConfirmed = true;
  isUserQuitting = true;
  app.quit();
});

ipcMain.on('cancel-quit', () => {
  // Reset flags when user cancels quit confirmation
  isQuitConfirmed = false;
  isUserQuitting = false;
});

// Toggle window button visibility (macOS traffic lights)
ipcMain.handle('set-window-button-visibility', (event, visible) => {
  if (mainWindow) {
    mainWindow.setWindowButtonVisibility(visible);
  }
});

