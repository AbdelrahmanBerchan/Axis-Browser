const { app, BrowserWindow, Menu, ipcMain, dialog, session } = require('electron');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');

// Initialize settings store
const store = new Store();

// Initialize history and downloads stores
const historyStore = new Store({ name: 'history' });
const downloadsStore = new Store({ name: 'downloads' });

// Keep a global reference of the window object
let mainWindow;
let isQuitConfirmed = false;

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
      // Speed optimizations
      hardwareAcceleration: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
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
    backgroundColor: '#1a1a1a'
  });

  // Load the app
  mainWindow.loadFile('src/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Intercept close to show quit confirmation
  mainWindow.on('close', (e) => {
    if (!isQuitConfirmed) {
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
      // Additional security checks
      if (url.includes('javascript:') || url.includes('data:') || url.includes('file:')) {
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
  
  // Configure network settings for speed
  app.commandLine.appendSwitch('--disable-web-security');
  app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
  app.commandLine.appendSwitch('--disable-background-timer-throttling');
  app.commandLine.appendSwitch('--disable-renderer-backgrounding');
  app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('--disable-ipc-flooding-protection');
  
  // REAL performance optimizations for actual speed
  app.commandLine.appendSwitch('--enable-gpu-rasterization');
  app.commandLine.appendSwitch('--enable-zero-copy');
  app.commandLine.appendSwitch('--enable-hardware-acceleration');
  app.commandLine.appendSwitch('--enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('--enable-accelerated-video-decode');
  app.commandLine.appendSwitch('--enable-accelerated-video-encode');
  app.commandLine.appendSwitch('--enable-webgl');
  app.commandLine.appendSwitch('--enable-webgl2');
  app.commandLine.appendSwitch('--enable-oop-rasterization');
  app.commandLine.appendSwitch('--max_old_space_size', '4096');
  app.commandLine.appendSwitch('--memory-pressure-off');
  
  // ACTUAL speed improvements
  app.commandLine.appendSwitch('--disable-background-timer-throttling');
  app.commandLine.appendSwitch('--disable-renderer-backgrounding');
  app.commandLine.appendSwitch('--disable-backgrounding-occluded-windows');
  app.commandLine.appendSwitch('--disable-ipc-flooding-protection');
  app.commandLine.appendSwitch('--enable-tcp-fast-open');
  app.commandLine.appendSwitch('--enable-quic');
  app.commandLine.appendSwitch('--aggressive-cache-discard');
  app.commandLine.appendSwitch('--enable-features', 'NetworkService,NetworkServiceLogging');
  app.commandLine.appendSwitch('--force-fieldtrials', 'NetworkService/Enabled');
  app.commandLine.appendSwitch('--enable-blink-features', 'CSSContainerQueries');
  app.commandLine.appendSwitch('--enable-features', 'ThrottleForegroundTimers');
  app.commandLine.appendSwitch('--disable-features', 'VizDisplayCompositor');
  app.commandLine.appendSwitch('--enable-features', 'VaapiVideoDecoder,WebUIDarkMode,ThrottleForegroundTimers,WebGPU');
  app.commandLine.appendSwitch('--enable-webgpu');
  app.commandLine.appendSwitch('--enable-webgpu-developer-features');
  app.commandLine.appendSwitch('--disable-webgpu-subgroup-limits-warning');
  
  // Additional speed optimizations
  app.commandLine.appendSwitch('--enable-aggressive-domstorage-flushing');
  app.commandLine.appendSwitch('--enable-experimental-web-platform-features');
  app.commandLine.appendSwitch('--disable-background-networking');
  app.commandLine.appendSwitch('--disable-default-apps');
  app.commandLine.appendSwitch('--disable-extensions');
  app.commandLine.appendSwitch('--disable-sync');
  app.commandLine.appendSwitch('--disable-translate');
  
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

  // Set user agent
  mainSession.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
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
  
  // Configure REAL cache settings that actually work
  mainSession.setCache({
    maxCacheSize: 200 * 1024 * 1024, // 200MB cache
    maxCacheEntries: 1000
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
  
  // Allow all requests
  mainSession.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: false });
  });

  // Create application menu
  createMenu();
}

function createMenu() {
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
          accelerator: 'CmdOrCtrl+W',
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

app.on('window-all-closed', () => {
  // Don't quit on macOS, keep the app running even when all windows are closed
  // This prevents the app from closing when the last tab is closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
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

// Downloads management
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
      session: incognitoSession,
      partition: 'incognito'
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    backgroundColor: '#1a1a1a'
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

ipcMain.on('confirm-quit', () => {
  isQuitConfirmed = true;
  app.quit();
});

