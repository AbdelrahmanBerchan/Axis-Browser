const { app, BrowserWindow, Menu, ipcMain, dialog, session, globalShortcut, shell, screen, nativeImage } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

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
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-zero-copy');
  app.commandLine.appendSwitch('enable-oop-rasterization');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('enable-partial-raster');
  app.commandLine.appendSwitch('enable-lcd-text');

  app.commandLine.appendSwitch('disable-background-timer-throttling');
  app.commandLine.appendSwitch('disable-renderer-backgrounding');
  app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');
  
  // Prevent viewport-based content unloading
  app.commandLine.appendSwitch('disable-features', 'LazyFrameLoading,LazyImageLoading,DeferredImageDecoding');

  // Aggressive JavaScript/V8 performance optimizations for Speedometer
  // Increased memory limits to prevent content unloading
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=8192 --max-semi-space-size=512 --no-expose-gc');
  
  // Increase renderer process memory limits
  app.commandLine.appendSwitch('renderer-process-limit', '100');
  app.commandLine.appendSwitch('max-active-webgl-contexts', '16');
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
      'VaapiVideoDecoder',
      'WebGPU',
      'WebUIDarkMode',
      'VizDisplayCompositor',
      'UseSkiaRenderer'
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
      'BlinkGenPropertyTrees',
      'ThrottleForegroundTimers',
      'PartitionAlloc',
      'LazyFrameLoading',
      'LazyImageLoading',
      'DeferredImageDecoding',
      'ViewportSegments',
      'ContentVisibility'
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
      enableAggressiveDomStorageFlushing: false, // Disable to prevent content unloading
      enableExperimentalWebPlatformFeatures: true,
      enableTcpFastOpen: true,
      enableQuic: true,
      aggressiveCacheDiscard: false, // Disable to prevent content unloading
      enableNetworkService: true,
      enableNetworkServiceLogging: false,
      // Consolidated Blink features
      enableBlinkFeatures: 'CSSColorSchemeUARendering,CSSContainerQueries,EnableThrottleForegroundTimers,WebGPU,WebGPUDawn',
      enableThrottleForegroundTimers: true,
      enableWebGPU: true,
      enableWebGPUDawn: true
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active'
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
    
    // For actual quit actions (non-macOS), confirmation is sent from main via request-quit
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

  // Configure session for better webview support (non-blocking)
  const mainSession = session.defaultSession;
  
  // Optimize session for better scroll performance and prevent content unloading
  // Use the new API instead of deprecated setPreloads
  try {
    if (mainSession.registerPreloadScript) {
      mainSession.registerPreloadScript(path.join(__dirname, 'preload.js'));
    } else if (mainSession.setPreloads) {
      // Fallback for older Electron versions
      mainSession.setPreloads([path.join(__dirname, 'preload.js')]);
    }
  } catch (error) {
    console.warn('Could not register preload script:', error);
  }
  
  // Clear DNS cache and configure network (non-blocking, can happen async)
  setImmediate(() => {
    try {
  mainSession.clearHostResolverCache();
      mainSession.setSpellCheckerDictionaryDownloadURL('');
    } catch (error) {
      // Ignore errors
    }
  });

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
  
  // Configure web security - simplified (allow all requests)
  mainSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: false });
  });
  
  // Enable caching and compression (consolidated handler)
  mainSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders || {};
    
    // Add cache control headers for static assets
    if (details.url.includes('.css') || details.url.includes('.js') || 
        details.url.includes('.png') || details.url.includes('.jpg') || 
        details.url.includes('.gif') || details.url.includes('.webp')) {
      headers['Cache-Control'] = 'max-age=3600, public';
    } else {
      // General cache headers for other content
      headers['Cache-Control'] = 'max-age=31536000, public';
    }
    
    // Enable compression
    if (!headers['Accept-Encoding']) {
    headers['Accept-Encoding'] = 'gzip, deflate, br';
    }
    
    callback({ requestHeaders: headers });
  });

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
            if (process.platform === 'darwin') {
              if (mainWindow && !mainWindow.isDestroyed() && showNativeQuitDialog()) {
                isQuitConfirmed = true;
                isUserQuitting = true; // so window close handler allows quit instead of hiding
                app.quit();
              } else if (!mainWindow || mainWindow.isDestroyed()) {
                app.quit();
              }
            } else {
              isUserQuitting = true;
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('request-quit');
              } else {
                app.quit();
              }
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

// Native macOS quit confirmation (Cmd+Q or when quit is requested)
function showNativeQuitDialog() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.focus();
  const response = dialog.showMessageBoxSync(mainWindow, {
    type: 'question',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    message: 'Quit Axis?',
    detail: 'Are you sure you want to exit the application?'
  });
  return response === 1;
}

// Handle Cmd+Q on macOS (before-quit fires before window close)
app.on('before-quit', (e) => {
  if (process.platform === 'darwin' && !isQuitConfirmed) {
    e.preventDefault();
    isUserQuitting = true;
    if (showNativeQuitDialog()) {
      isQuitConfirmed = true;
      app.quit();
    } else {
      isUserQuitting = false;
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

ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    if (!filePath) return false;
    shell.showItemInFolder(filePath);
    return true;
  } catch (error) {
    console.error('show-item-in-folder failed:', error);
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
    vibrancy: 'under-window',
    visualEffectState: 'active'
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

// Sidebar context menu
ipcMain.handle('show-sidebar-context-menu', async (event, x, y, isRight) => {
  const template = [
    {
      label: 'New Tab',
      click: () => {
        event.sender.send('sidebar-context-menu-action', 'new-tab');
      }
    },
    {
      label: 'New Tab Group',
      click: () => {
        event.sender.send('sidebar-context-menu-action', 'new-tab-group');
      }
    },
    { type: 'separator' },
    {
      label: 'Toggle Sidebar',
      click: () => {
        event.sender.send('sidebar-context-menu-action', 'toggle-sidebar');
      }
    },
    {
      label: isRight ? 'Move Sidebar Left' : 'Move Sidebar Right',
      click: () => {
        event.sender.send('sidebar-context-menu-action', 'toggle-position');
      }
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  
  // Use cursor position directly - Electron will position it correctly
  menu.popup({
    window: window
  });
  
  return true;
});

// Webpage context menu
ipcMain.handle('show-webpage-context-menu', async (event, x, y, contextInfo) => {
  const ctx = contextInfo || {};
  const template = [];
  
  // Link options (shown when right-clicking a link)
  if (ctx.linkURL && ctx.linkURL.length > 0) {
    template.push({
      label: 'Open Link in New Tab',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'open-link-new-tab', { linkURL: ctx.linkURL });
      }
    });
    template.push({
      label: 'Copy Link Address',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'copy-link', { linkURL: ctx.linkURL });
      }
    });
    template.push({ type: 'separator' });
  }
  
  // Image options (shown when right-clicking an image)
  if (ctx.mediaType === 'image' && ctx.srcURL) {
    template.push({
      label: 'Open Image in New Tab',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'open-image-new-tab', { srcURL: ctx.srcURL });
      }
    });
    template.push({
      label: 'Copy Image',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'copy-image', { x: ctx.x || 0, y: ctx.y || 0 });
      }
    });
    template.push({
      label: 'Copy Image Address',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'copy-image-url', { srcURL: ctx.srcURL });
      }
    });
    template.push({ type: 'separator' });
  }
  
  // Navigation options
  template.push({
    label: 'Back',
    enabled: ctx.canGoBack || false,
    click: () => {
      event.sender.send('webpage-context-menu-action', 'back');
    }
  });
  template.push({
    label: 'Forward',
    enabled: ctx.canGoForward || false,
    click: () => {
      event.sender.send('webpage-context-menu-action', 'forward');
    }
  });
  template.push({
    label: 'Reload',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'reload');
    }
  });
  template.push({ type: 'separator' });
  
  // Edit options
  template.push({
    label: 'Cut',
    enabled: ctx.canCut || ctx.isEditable || false,
    click: () => {
      event.sender.send('webpage-context-menu-action', 'cut');
    }
  });
  template.push({
    label: 'Copy',
    enabled: ctx.canCopy || (ctx.hasSelection && ctx.selectionText && ctx.selectionText.length > 0) || false,
    click: () => {
      event.sender.send('webpage-context-menu-action', 'copy');
    }
  });
  template.push({
    label: 'Paste',
    enabled: ctx.canPaste || ctx.isEditable || false,
    click: () => {
      event.sender.send('webpage-context-menu-action', 'paste');
    }
  });
  template.push({
    label: 'Select All',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'select-all');
    }
  });
  
  // Selection search option
  if (ctx.hasSelection && ctx.selectionText && ctx.selectionText.length > 0) {
    template.push({ type: 'separator' });
    let displayText = ctx.selectionText.trim();
    if (displayText.length > 20) {
      displayText = displayText.substring(0, 20) + '...';
    }
    template.push({
      label: `Search for "${displayText}"`,
      click: () => {
        event.sender.send('webpage-context-menu-action', 'search-selection', { selectionText: ctx.selectionText });
      }
    });
  }
  
  template.push({ type: 'separator' });
  
  // Page options
  template.push({
    label: 'Copy Page URL',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'copy-url');
    }
  });
  template.push({
    label: 'Inspect Element',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'inspect');
    }
  });
  
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  
  // Use cursor position directly - Electron will position it correctly
  menu.popup({
    window: window
  });
  
  return true;
});

// Tab context menu
ipcMain.handle('show-tab-context-menu', async (event, x, y, tabInfo) => {
  const info = tabInfo || {};
  const template = [
    {
      label: 'Rename Tab',
      click: () => {
        event.sender.send('tab-context-menu-action', 'rename');
      }
    },
    {
      label: 'Duplicate Tab',
      click: () => {
        event.sender.send('tab-context-menu-action', 'duplicate');
      }
    },
    {
      label: info.isPinned ? 'Unpin Tab' : 'Pin Tab',
      click: () => {
        event.sender.send('tab-context-menu-action', 'toggle-pin');
      }
    },
    {
      label: info.isMuted ? 'Unmute Tab' : 'Mute Tab',
      click: () => {
        event.sender.send('tab-context-menu-action', 'toggle-mute');
      }
    },
    {
      label: 'Change Icon',
      click: () => {
        event.sender.send('tab-context-menu-action', 'change-icon');
      }
    }
  ];

  const tabGroups = info.tabGroups || [];
  if (tabGroups.length > 0) {
    template.push({
      label: 'Add to Tab Group',
      submenu: tabGroups.map((g) => ({
        label: g.name,
        click: () => {
          event.sender.send('tab-context-menu-action', 'add-to-tab-group', { tabGroupId: g.id });
        }
      }))
    });
  }

  template.push({
    label: 'Close Tab',
    click: () => {
      event.sender.send('tab-context-menu-action', 'close');
    }
  });

  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);

  menu.popup({
    window: window
  });

  return true;
});

// Tab group context menu
ipcMain.handle('show-tab-group-context-menu', async (event, x, y) => {
  const template = [
    {
      label: 'Rename Tab Group',
      click: () => {
        event.sender.send('tab-group-context-menu-action', 'rename');
      }
    },
    {
      label: 'Duplicate Tab Group',
      click: () => {
        event.sender.send('tab-group-context-menu-action', 'duplicate');
      }
    },
    {
      label: 'Change Color',
      click: () => {
        event.sender.send('tab-group-context-menu-action', 'change-color');
      }
    },
    {
      label: 'Change Icon',
      click: () => {
        event.sender.send('tab-group-context-menu-action', 'change-icon');
      }
    },
    { type: 'separator' },
    {
      label: 'Delete Tab Group',
      click: () => {
        event.sender.send('tab-group-context-menu-action', 'delete');
      }
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  
  menu.popup({
    window: window
  });
  
  return true;
});

// Helper function to format time ago
function formatTimeAgo(timestamp) {
  const now = new Date();
  const time = new Date(timestamp);
  const diffMs = now - time;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return time.toLocaleDateString();
}

// Get downloads from folder for custom popup
ipcMain.handle('get-downloads-from-folder', async (event) => {
  try {
    const home = os.homedir();
    const downloadsPath = path.join(home, 'Downloads');
    
    let files = [];
    try {
      const dirFiles = await fs.promises.readdir(downloadsPath, { withFileTypes: true });
      
      for (const file of dirFiles) {
        if (file.name.startsWith('.')) continue;
        
        const fullPath = path.join(downloadsPath, file.name);
        
        try {
          const stats = await fs.promises.stat(fullPath);
          if (!file.isDirectory()) {
            files.push({
              name: file.name,
              path: fullPath,
              mtime: stats.mtime,
              size: stats.size
            });
          }
        } catch (statError) {
          continue;
        }
      }
    } catch (readError) {
      console.error('Failed to read Downloads folder:', readError);
    }
    
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    return files.slice(0, 5);
  } catch (error) {
    console.error('Failed to get downloads from folder:', error);
    return [];
  }
});

// Context menu for downloads items
ipcMain.handle('show-downloads-item-context-menu', async (event, x, y, filePath) => {
  const template = [
    {
      label: 'Open',
      click: () => {
        event.sender.send('downloads-popup-action', 'open', { path: filePath });
      }
    },
    {
      label: 'Show in Folder',
      click: () => {
        event.sender.send('downloads-popup-action', 'show-in-folder', { path: filePath });
      }
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  const cursorPoint = screen.getCursorScreenPoint();
  
  menu.popup({
    window: window,
    x: cursorPoint.x,
    y: cursorPoint.y
  });
  
  return true;
});

// Native file drag support (e.g. drag download out to Finder/Desktop)
ipcMain.handle('start-file-drag', async (event, filePath) => {
  try {
    if (!filePath) return false;
    
    let icon = nativeImage.createFromPath(filePath);
    if (!icon || icon.isEmpty()) {
      // Fallback to an empty image if we can't load a proper icon
      icon = nativeImage.createEmpty();
    }
    
    event.sender.startDrag({
      file: filePath,
      icon
    });
    
    return true;
  } catch (error) {
    console.error('Failed to start file drag:', error);
    return false;
  }
});

// Open the user's Downloads folder in Finder
ipcMain.handle('open-downloads-folder', async () => {
  const downloadsPath = path.join(os.homedir(), 'Downloads');
  return shell.openPath(downloadsPath).catch((err) => {
    console.error('Failed to open Downloads folder:', err);
    return Promise.reject(err);
  });
});

// Return a 16x16 fallback icon so menu items always show an icon
function getFallbackFileIcon() {
  if (process.platform === 'darwin') {
    const systemPath = '/System/Library/CoreServices/CoreTypes.bundle/Contents/Resources/GenericDocumentIcon.icns';
    try {
      const img = nativeImage.createFromPath(systemPath);
      if (img && !img.isEmpty()) return img.resize({ width: 16, height: 16 });
    } catch (e) {}
  }
  // Minimal 16x16 gray document icon as PNG data URL (always works)
  const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVQ4T2NkYGD4z0ABYBzVMKoBBg0MBv8ZGP4zMPxnYPjPwPD/PwPDfwYGhv8MDP8ZGP4zMPxnYPgPALmJCm0bicgAAAAASUVORK5CYII=';
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img && !img.isEmpty()) return img.resize({ width: 16, height: 16 });
  } catch (e) {}
  return nativeImage.createEmpty();
}

// Downloads popup - native macOS menu showing recent files from Downloads folder
ipcMain.handle('show-downloads-popup', async (event, buttonX, buttonY, buttonWidth, buttonHeight) => {
  try {
    // Get files from Downloads folder
    const home = os.homedir();
    const downloadsPath = path.join(home, 'Downloads');
    
    let files = [];
    try {
      const dirFiles = await fs.promises.readdir(downloadsPath, { withFileTypes: true });
      
      for (const file of dirFiles) {
        // Skip hidden files
        if (file.name.startsWith('.')) continue;
        
        const fullPath = path.join(downloadsPath, file.name);
        
        try {
          const stats = await fs.promises.stat(fullPath);
          if (!file.isDirectory()) {
            files.push({
              name: file.name,
              path: fullPath,
              mtime: stats.mtime
            });
          }
        } catch (statError) {
          // Skip files we can't stat
          continue;
        }
      }
    } catch (readError) {
      console.error('Failed to read Downloads folder:', readError);
    }
    
    // Sort by modification time (newest first) and take top 5
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    files = files.slice(0, 5);
    
    const template = [];
    
    if (files.length === 0) {
      template.push({
        label: 'No downloads',
        enabled: false
      });
    } else {
      for (const file of files) {
        // Format filename (truncate if too long)
        let label = file.name;
        if (label.length > 50) {
          label = label.substring(0, 47) + '...';
        }
        
        const timeAgo = formatTimeAgo(file.mtime);
        const displayLabel = `${label}   ${timeAgo}`;
        
        // Always get an icon: try app.getFileIcon, then createFromPath, then fallback
        let icon = null;
        try {
          icon = await app.getFileIcon(file.path, { size: 'small' });
        } catch (e) {}
        if (!icon || icon.isEmpty()) {
          try {
            icon = nativeImage.createFromPath(file.path);
            if (icon && !icon.isEmpty()) icon = icon.resize({ width: 16, height: 16 });
            else icon = null;
          } catch (e) {
            icon = null;
          }
        }
        if (!icon || icon.isEmpty()) {
          icon = getFallbackFileIcon();
        } else {
          icon = icon.resize({ width: 16, height: 16 });
        }
        
        const filePath = file.path;
        // Native macOS: one row per file; click opens file; submenu (>) has "Reveal in Finder"
        template.push({
          label: displayLabel,
          icon,
          click: () => {
            event.sender.send('downloads-popup-action', 'open', { path: filePath });
          },
          submenu: [
            {
              label: 'Reveal in Finder',
              click: () => {
                event.sender.send('downloads-popup-action', 'show-in-folder', { path: filePath });
              }
            }
          ]
        });
      }
    }
    
    // Separator and "Open Downloads" button at the bottom
    template.push({ type: 'separator' });
    
    let folderIcon = null;
    try {
      folderIcon = await app.getFileIcon(downloadsPath, { size: 'small' });
    } catch (e) {}
    if (!folderIcon || folderIcon.isEmpty()) {
      try {
        folderIcon = nativeImage.createFromPath(downloadsPath);
        if (folderIcon && !folderIcon.isEmpty()) folderIcon = folderIcon.resize({ width: 16, height: 16 });
        else folderIcon = null;
      } catch (e) {
        folderIcon = null;
      }
    }
    if (!folderIcon || folderIcon.isEmpty()) {
      folderIcon = getFallbackFileIcon();
    } else {
      folderIcon = folderIcon.resize({ width: 16, height: 16 });
    }
    
    template.push({
      label: 'Open Downloads',
      icon: folderIcon,
      click: () => {
        shell.openPath(downloadsPath).catch((err) => console.error('Failed to open Downloads:', err));
      }
    });
    
    const menu = Menu.buildFromTemplate(template);
    const window = BrowserWindow.fromWebContents(event.sender);
    
    // Position native macOS menu relative to button
    if (buttonX !== undefined && buttonY !== undefined && buttonWidth !== undefined && buttonHeight !== undefined &&
        typeof buttonX === 'number' && typeof buttonY === 'number' && 
        typeof buttonWidth === 'number' && typeof buttonHeight === 'number' &&
        !isNaN(buttonX) && !isNaN(buttonY) && !isNaN(buttonWidth) && !isNaN(buttonHeight)) {
      try {
        // Convert button position from client coordinates to screen coordinates
        const contentBounds = window.getContentBounds();
        if (contentBounds && typeof contentBounds.x === 'number' && typeof contentBounds.y === 'number') {
          const screenX = contentBounds.x + buttonX;
          const screenY = contentBounds.y + buttonY;
          
          // Calculate button center for arrow positioning
          const buttonCenterX = screenX + (buttonWidth / 2);
          
          // Estimate menu height: ~22px per item + padding
          const estimatedMenuHeight = Math.min(300, (template.length * 22) + 16);
          
          // Position menu above the button, centered horizontally for arrow alignment
          // macOS native menus automatically show the arrow when positioned correctly
          const estimatedMenuWidth = 280;
          const menuX = Math.round(buttonCenterX - (estimatedMenuWidth / 2));
          let menuY = Math.round(screenY - estimatedMenuHeight - 8); // 8px gap above button
          
          // Ensure menu doesn't go above screen
          const display = screen.getDisplayNearestPoint({ x: menuX, y: menuY });
          if (display) {
            if (menuY < display.bounds.y) {
              // If menu would go above screen, position it below the button instead
              menuY = Math.round(screenY + buttonHeight + 8);
            }
            // Ensure menu doesn't go off screen edges
            let finalX = menuX;
            if (finalX + estimatedMenuWidth > display.bounds.x + display.bounds.width) {
              finalX = display.bounds.x + display.bounds.width - estimatedMenuWidth - 8;
            }
            if (finalX < display.bounds.x) {
              finalX = display.bounds.x + 8;
            }
            
            // Use native macOS menu popup - it will automatically show the arrow
            menu.popup({
              window: window,
              x: finalX,
              y: menuY,
              positioningItem: 0 // This helps macOS position the arrow correctly
            });
            return true;
          }
          
          // Fallback with calculated position
          if (!isNaN(menuX) && !isNaN(menuY) && isFinite(menuX) && isFinite(menuY) && menuX >= 0 && menuY >= 0) {
            menu.popup({
              window: window,
              x: menuX,
              y: menuY
            });
            return true;
          }
        }
      } catch (error) {
        console.error('Error calculating menu position:', error);
      }
    }
    
    // Fallback: position at cursor or let Electron position automatically
    // macOS will automatically add the arrow when positioned near a UI element
    try {
      const cursorPoint = screen.getCursorScreenPoint();
      menu.popup({
        window: window,
        x: cursorPoint.x,
        y: cursorPoint.y
      });
    } catch (error) {
      // Last resort: let Electron position it automatically
      menu.popup({
        window: window
      });
    }
    
    return true;
  } catch (error) {
    console.error('Failed to show downloads popup:', error);
    return false;
  }
});

// Icon picker - trigger native macOS emoji/symbols picker
ipcMain.handle('show-icon-picker', async (event, type) => {
  if (process.platform === 'darwin') {
    // On macOS, use AppleScript to trigger the Character Viewer (emoji picker)
    // This opens the native macOS emoji and symbols picker
    exec('osascript -e \'tell application "System Events" to keystroke " " using {command down, control down}\'', (error) => {
      if (error) {
        console.error('Error triggering emoji picker:', error);
        // Fallback: send message to renderer to create input field
        event.sender.send('trigger-native-emoji-picker', type);
      }
    });
    
    // Also send message to renderer to create input field and listen for emoji selection
    event.sender.send('trigger-native-emoji-picker', type);
  } else {
    // On non-macOS, just send the trigger message
    event.sender.send('trigger-native-emoji-picker', type);
  }
  
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

