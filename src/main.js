const { app, BrowserWindow, Menu, ipcMain, dialog, session, globalShortcut, shell, screen, nativeImage, clipboard, nativeTheme } = require('electron');
// Must run before `ready`. `package.json` `name` is lowercase `axis` (npm); Dock tooltip and `getName()` use this human-readable label.
app.setName('Axis');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

/** App branding image (project root). Used for windows, macOS Dock, About panel, and packaged .app icon. */
const APP_ICON_PATH = path.join(__dirname, '..', 'Axis_logo.png');

/** Cached squircle-masked image for Dock + About (macOS only). */
let macSquircleIconNativeImageCache = null;

function getAppIconNativeImage() {
  try {
    if (fs.existsSync(APP_ICON_PATH)) {
      const img = nativeImage.createFromPath(APP_ICON_PATH);
      if (!img.isEmpty()) return img;
    }
  } catch (_) {}
  return null;
}

/**
 * macOS: `app.dock.setIcon()` draws the bitmap as-is — unlike a bundled .icns, the Dock does not apply the
 * standard squircle mask. Apply a superellipse (n=4) alpha mask so the tile matches other apps.
 */
function applySquircleAlphaToJimp(image) {
  const w = image.bitmap.width;
  const h = image.bitmap.height;
  const n = 4;
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  image.scan(0, 0, w, h, function (x, y, idx) {
    const u = (x + 0.5 - halfW) / halfW;
    const v = (y + 0.5 - halfH) / halfH;
    if (Math.abs(u) ** n + Math.abs(v) ** n > 1) {
      this.bitmap.data[idx + 3] = 0;
    }
  });
}

function getDockSquircleCachePath() {
  try {
    // Bump filename when squircle pipeline changes so stale cache is not reused.
    return path.join(app.getPath('userData'), 'dock-squircle-cache-v4.png');
  } catch (_) {
    return path.join(os.tmpdir(), 'axis-browser-dock-squircle-cache-v4.png');
  }
}

async function getMacSquircleIconNativeImage() {
  if (process.platform !== 'darwin') return null;
  if (macSquircleIconNativeImageCache) return macSquircleIconNativeImageCache;
  if (!fs.existsSync(APP_ICON_PATH)) return null;

  const cachePath = getDockSquircleCachePath();
  try {
    if (cachePath && fs.existsSync(cachePath)) {
      const srcM = fs.statSync(APP_ICON_PATH).mtimeMs;
      const cacheM = fs.statSync(cachePath).mtimeMs;
      if (cacheM >= srcM) {
        const cached = nativeImage.createFromPath(cachePath);
        if (!cached.isEmpty()) {
          macSquircleIconNativeImageCache = cached;
          return cached;
        }
      }
    }
  } catch (_) {}

  let Jimp;
  let JimpMime;
  try {
    const jimpPkg = require('jimp');
    Jimp = jimpPkg.Jimp;
    JimpMime = jimpPkg.JimpMime;
  } catch (_) {
    return getAppIconNativeImage();
  }
  try {
    const image = await Jimp.read(APP_ICON_PATH);
    const side = 512;
    // `app.dock.setIcon()` does not apply the template mask. Build a full-tile squircle first, then
    // shrink that bitmap — do NOT inset the logo *before* masking: a small square bitmap fully inside
    // the squircle reads as a square tile (no curved silhouette). System icons look smaller because the
    // whole squircle is scaled down with margin, not because the art is an unmasked square.
    image.contain({ w: side, h: side });
    applySquircleAlphaToJimp(image);
    const visualScale = 0.78;
    const inner = Math.round(side * visualScale);
    image.resize({ w: inner, h: inner });
    const padded = new Jimp({ width: side, height: side, color: 0x00000000 });
    const ox = Math.round((side - inner) / 2);
    const oy = Math.round((side - inner) / 2);
    padded.composite(image, ox, oy);
    const buf = await padded.getBuffer(JimpMime.png);
    const out = nativeImage.createFromBuffer(buf);
    if (!out.isEmpty()) {
      macSquircleIconNativeImageCache = out;
      try {
        if (cachePath) fs.writeFileSync(cachePath, buf);
      } catch (_) {}
      return out;
    }
  } catch (_) {}
  return getAppIconNativeImage();
}

/** macOS: Dock uses squircle-masked `Axis_logo.png` so the tile matches other apps. */
async function applyMacDockIcon() {
  if (process.platform !== 'darwin') return;
  const img = await getMacSquircleIconNativeImage();
  if (!img) return;
  try {
    app.dock.setIcon(img);
  } catch (_) {}
}

/** macOS: Native `role: 'about'` cannot show `Axis_logo` in development (uses Electron.app bundle icon). Use a message box with the same `nativeImage` as the Dock. */
async function showMacAboutDialog() {
  if (process.platform !== 'darwin') return;
  const appName = app.getName() || 'Axis';
  const parent = BrowserWindow.getFocusedWindow() || mainWindow;
  const win = parent && !parent.isDestroyed() ? parent : undefined;
  const iconImg = (await getMacSquircleIconNativeImage()) || getAppIconNativeImage();
  const opts = {
    type: 'info',
    title: `About ${appName}`,
    message: appName,
    detail: `Version ${app.getVersion()}\n\nCopyright © 2026 Abdelrahman Berchan.`,
    buttons: ['OK'],
    defaultId: 0
  };
  if (iconImg && !iconImg.isEmpty()) {
    opts.icon = iconImg;
  }
  if (win) {
    dialog.showMessageBox(win, opts);
  } else {
    dialog.showMessageBox(opts);
  }
}

// Initialize settings store
const store = new Store();

// Initialize history and downloads stores
const historyStore = new Store({ name: 'history' });
const downloadsStore = new Store({ name: 'downloads' });
const notesStore = new Store({ name: 'notes' });

function normalizePermissionOrigin(url) {
  if (!url || typeof url !== 'string') return null;
  try {
    return new URL(url).origin;
  } catch {
    try {
      const s = url.trim();
      if (!s) return null;
      return new URL(s.includes('://') ? s : `https://${s}`).origin;
    } catch {
      return null;
    }
  }
}

function cleanSitePermissionOverrides(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [origin, perms] of Object.entries(raw)) {
    if (!origin || typeof perms !== 'object' || !perms) continue;
    const row = {};
    for (const k of ['camera', 'microphone', 'notifications', 'geolocation']) {
      if (perms[k] === 'allow' || perms[k] === 'deny') row[k] = perms[k];
    }
    out[origin] = row;
  }
  return out;
}

/** @param {string|null} origin @param {string} permission Electron permission id */
function getSitePermissionDecision(origin, permission) {
  const overrides = store.get('sitePermissionOverrides', {});
  if (!origin || typeof overrides !== 'object') return null;
  const site = overrides[origin];
  if (!site || typeof site !== 'object') return null;

  if (permission === 'media') {
    const cam = site.camera;
    const mic = site.microphone;
    if (cam === 'deny' || mic === 'deny') return 'deny';
    if (cam === 'allow' || mic === 'allow') return 'allow';
    return null;
  }

  if (permission === 'geolocation' || permission === 'notifications') {
    const v = site[permission];
    if (v === 'deny' || v === 'allow') return v;
    return null;
  }

  return null;
}

function permissionRequestHandler(webContents, permission, callback, details) {
  const requestingUrl = details && details.requestingUrl;
  const origin = normalizePermissionOrigin(requestingUrl);
  const decided = getSitePermissionDecision(origin, permission);
  if (decided === 'deny') {
    callback(false);
    return;
  }
  if (decided === 'allow') {
    callback(true);
    return;
  }

  const allowedPermissions = [
    'display-capture',
    'fullscreen',
    'geolocation',
    'idle-detection',
    'media',
    'mediaKeySystem',
    'midi',
    'midiSysex',
    'notifications',
    'pointerLock',
    'keyboardLock',
    'openExternal',
    'speaker-selection',
    'storage-access',
    'top-level-storage-access',
    'window-management',
    'clipboard-read',
    'clipboard-sanitized-write',
    'unknown',
    'fileSystem'
  ];

  callback(allowedPermissions.includes(permission));
}

function permissionCheckHandler(webContents, permission, requestingOrigin, details) {
  const origin = normalizePermissionOrigin(requestingOrigin) || requestingOrigin;
  const decided = getSitePermissionDecision(origin, permission);
  if (decided === 'deny') return false;
  if (decided === 'allow') return true;
  return true;
}

function installSessionPermissionHandlers(sess) {
  sess.setPermissionRequestHandler(permissionRequestHandler);
  sess.setPermissionCheckHandler(permissionCheckHandler);
}

// Keep a global reference of the window object
let mainWindow;
let sessionConfigured = false;

/** One-time session configuration — must only run once per app lifecycle. */
function configureSession() {
  if (sessionConfigured) return;
  sessionConfigured = true;

  const mainSession = session.defaultSession;

  try {
    if (mainSession.registerPreloadScript) {
      mainSession.registerPreloadScript({
        filePath: path.join(__dirname, 'preload.js'),
        type: 'frame'
      });
    } else if (mainSession.setPreloads) {
      mainSession.setPreloads([path.join(__dirname, 'preload.js')]);
    }
  } catch (error) {
    console.warn('Could not register preload script:', error);
  }

  setImmediate(() => {
    try {
      mainSession.clearHostResolverCache();
      mainSession.setSpellCheckerDictionaryDownloadURL('');
    } catch (_) {}
  });

  installSessionPermissionHandlers(mainSession);
  installSessionPermissionHandlers(session.fromPartition('persist:main'));
  try {
    installSessionPermissionHandlers(session.fromPartition('incognito'));
  } catch (_) {
    console.warn('Could not attach permission handlers to incognito session');
  }

  // Trust all certificates for every session (default, persist:main, incognito)
  const certBypass = (request, callback) => callback(0);
  mainSession.setCertificateVerifyProc(certBypass);
  try { session.fromPartition('persist:main').setCertificateVerifyProc(certBypass); } catch (_) {}
  try { session.fromPartition('incognito').setCertificateVerifyProc(certBypass); } catch (_) {}
}

/** macOS: vibrancy shows desktop through the window; turn it off when settings “Window glass brightness” is 0 (fully opaque chrome). */
function applyVibrancyToWindow(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  if (process.platform !== 'darwin') return;
  const raw = store.get('windowChromeLight', 50);
  const n = Number(raw);
  const solidChrome = Number.isFinite(n) ? n <= 0 : false;
  try {
    if (solidChrome) {
      browserWindow.setVibrancy(null);
    } else {
      browserWindow.setVibrancy('under-window');
    }
  } catch (_) {
    /* ignore */
  }
}

function applyMainWindowVibrancyFromStore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  applyVibrancyToWindow(mainWindow);
}
let settingsWindow = null;
let isQuitConfirmed = false;
let isUserQuitting = false;

/** macOS frameless + hiddenInset: corner inset when sidebar is left; mirrors to top-right when sidebar is right. */
const MACOS_TRAFFIC_LIGHT_INSET = 16;
/**
 * Cluster width for right placement: same math as left uses inset 16 — (x + cluster) ≈ width − 16.
 */
const MACOS_TRAFFIC_LIGHT_CLUSTER_WIDTH_RIGHT = 52;

function positionMacTrafficLights(browserWindow, sidebarOnRight) {
  if (process.platform !== 'darwin' || !browserWindow || browserWindow.isDestroyed()) return;
  const { width } = browserWindow.getBounds();
  const inset = MACOS_TRAFFIC_LIGHT_INSET;
  if (sidebarOnRight) {
    const x = Math.max(8, Math.round(width - MACOS_TRAFFIC_LIGHT_CLUSTER_WIDTH_RIGHT - inset));
    browserWindow.setWindowButtonPosition({ x, y: inset });
  } else {
    browserWindow.setWindowButtonPosition({ x: inset, y: inset });
  }
}

function attachMacTrafficLightResize(browserWindow) {
  if (process.platform !== 'darwin' || !browserWindow) return;
  browserWindow.on('resize', () => {
    positionMacTrafficLights(browserWindow, !!browserWindow.__axisSidebarRight);
  });
}

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
    'print': `${cmdOrCtrl}+P`,
    // macOS: Shift+Cmd+P; Windows/Linux: avoid clashing with File → New Incognito (Ctrl+Shift+P)
    'pin-tab':
      process.platform === 'darwin' ? `${cmdOrCtrl}+Shift+P` : 'Ctrl+Alt+P',
    'new-tab': `${cmdOrCtrl}+N`,
    'duplicate-tab': `${cmdOrCtrl}+D`,
    'settings': `${cmdOrCtrl}+,`,
    'recover-tab': `${cmdOrCtrl}+Z`,
    'history': `${cmdOrCtrl}+Y`,
    'downloads': `${cmdOrCtrl}+J`,
    'toggle-chat': `${cmdOrCtrl}+Shift+E`,
    'toggle-mute-tab': `${cmdOrCtrl}+Shift+M`,
    'find': `${cmdOrCtrl}+F`,
    'select-all': `${cmdOrCtrl}+A`,
    'paste-match-style': `${cmdOrCtrl}+Shift+V`,
    'copy-url': `${cmdOrCtrl}+Shift+C`,
    'copy-url-markdown': `${cmdOrCtrl}+Shift+Alt+C`,
    'clear-history': `${cmdOrCtrl}+Shift+H`,
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
    'switch-tab-9': `${cmdOrCtrl}+9`,
    // Next / previous tab (macOS: Option+Cmd+arrows avoids clashing with Back/Forward on [ ] )
    'next-tab': process.platform === 'darwin' ? 'Alt+Cmd+Right' : 'Ctrl+Tab',
    'previous-tab': process.platform === 'darwin' ? 'Alt+Cmd+Left' : 'Ctrl+Shift+Tab'
  };
};

/**
 * Merged active shortcuts for global registration and menus.
 * Store may set an action to null / '' / '__disabled__' to turn that shortcut off.
 */
const getShortcuts = () => {
  const defaults = getDefaultShortcuts();
  const custom = store.get('keyboardShortcuts', null);
  if (!custom) return { ...defaults };
  const out = {};
  for (const action of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(custom, action)) {
      const val = custom[action];
      if (val !== null && val !== '' && val !== '__disabled__') {
        out[action] = val;
      }
    } else {
      out[action] = defaults[action];
    }
  }
  for (const [action, val] of Object.entries(custom)) {
    if (!defaults[action] && val !== null && val !== '' && val !== '__disabled__') {
      out[action] = val;
    }
  }
  return out;
};

/** Raw user overrides (null = disabled for that action). */
const getShortcutOverrides = () => store.get('keyboardShortcuts', null) || {};

// Get the active Axis window (prefers focused, then main, then any)
function getActiveAxisWindow() {
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) return focused;
  if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
  const all = BrowserWindow.getAllWindows().filter(w => !w.isDestroyed());
  return all.length > 0 ? all[0] : null;
}

/** Route menu actions to the focused Axis browser window (main or incognito). */
function sendBrowserShortcut(action) {
  const win = getActiveAxisWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('browser-shortcut', action);
  }
}

// Register global shortcuts (works in all Axis windows, including incognito)
const registerShortcuts = () => {
  const shortcuts = getShortcuts();

  Object.entries(shortcuts).forEach(([action, key]) => {
    if (action === 'find') return;
    // Cmd/Ctrl+A must be handled in the renderer so URL bar and other shell fields keep native select-all.
    if (action === 'select-all') {
      const norm = (key || '').replace(/\s/g, '').toLowerCase();
      if (norm === 'cmd+a' || norm === 'ctrl+a') return;
    }
    if (!key || typeof key !== 'string') return;
    try {
      globalShortcut.register(key, () => {
        const win = getActiveAxisWindow();
        if (win) {
          win.webContents.send('browser-shortcut', action);
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
  app.commandLine.appendSwitch('log-level', '3');
  app.commandLine.appendSwitch('disable-logging');

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

  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=2048 --max-semi-space-size=64 --no-expose-gc');

  app.commandLine.appendSwitch('renderer-process-limit', '25');
  app.commandLine.appendSwitch('max-active-webgl-contexts', '8');
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

  app.commandLine.appendSwitch('enable-tcp-fast-open');
  app.commandLine.appendSwitch('enable-quic');

  // Single enable-features call to avoid overwriting
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
  // Single disable-features call (appendSwitch overwrites, so must be one call)
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
    title: 'Axis Browser',
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      offscreen: false,
      experimentalFeatures: true,
      v8CacheOptions: 'code',
      spellcheck: false,
      webSecurity: true,
      webgl: true,
      enableBlinkFeatures:
        'CSSColorSchemeUARendering,CSSContainerQueries,EnableThrottleForegroundTimers,WebGPU,WebGPUDawn'
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: MACOS_TRAFFIC_LIGHT_INSET, y: MACOS_TRAFFIC_LIGHT_INSET } }
      : {})
  });

  if (process.platform === 'darwin' && mainWindow) {
    mainWindow.__axisSidebarRight = false;
    attachMacTrafficLightResize(mainWindow);
  }

  // Load the app
  mainWindow.loadFile('src/index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (process.platform === 'darwin' && mainWindow && !mainWindow.isDestroyed()) {
      positionMacTrafficLights(mainWindow, !!mainWindow.__axisSidebarRight);
    }
    applyMainWindowVibrancyFromStore();
    mainWindow.show();
    // Show window controls by default (sidebar is visible)
    mainWindow.setWindowButtonVisibility(true);
  });

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

  // Create application menu
  createMenu();
}

function getSettingsWindowBackgroundColor() {
  try {
    return nativeTheme.shouldUseDarkColors ? '#1e1e1e' : '#f5f5f7';
  } catch (_) {
    return '#f5f5f7';
  }
}

function openSettingsWindow(tab = null) {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    if (tab) {
      settingsWindow.webContents.send('switch-settings-tab', tab);
    }
    return;
  }
  const windowOptions = {
    width: 760,
    height: 560,
    minWidth: 560,
    minHeight: 400,
    title: 'Settings',
    show: false,
    backgroundColor: getSettingsWindowBackgroundColor(),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  };
  settingsWindow = new BrowserWindow(windowOptions);
  const onThemeUpdated = () => {
    if (!settingsWindow || settingsWindow.isDestroyed()) return;
    try {
      settingsWindow.setBackgroundColor(getSettingsWindowBackgroundColor());
    } catch (_) {}
  };
  nativeTheme.on('updated', onThemeUpdated);
  const settingsPath = path.join(__dirname, 'settings.html');
  settingsWindow.loadFile(settingsPath, { hash: tab || '' });
  settingsWindow.once('ready-to-show', () => {
    settingsWindow.show();
  });
  settingsWindow.on('closed', () => {
    nativeTheme.removeListener('updated', onThemeUpdated);
    settingsWindow = null;
  });
}

function menuAccel(key) {
  return key && typeof key === 'string' ? key : undefined;
}

/** Open a URL in a new tab in the main Axis window (not the system browser). */
function openUrlInAxisBrowser(url) {
  if (!url || typeof url !== 'string') return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('open-url-in-browser', url);
}

function isSafeHttpUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Open http(s) URL in a new normal browser window (secondary window; does not replace mainWindow). */
function openUrlInNewBrowserWindow(url) {
  if (!isSafeHttpUrl(url)) return;
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Axis Browser',
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      offscreen: false,
      experimentalFeatures: true,
      v8CacheOptions: 'code',
      spellcheck: false,
      webSecurity: true,
      webgl: true,
      enableBlinkFeatures:
        'CSSColorSchemeUARendering,CSSContainerQueries,EnableThrottleForegroundTimers,WebGPU,WebGPUDawn'
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: MACOS_TRAFFIC_LIGHT_INSET, y: MACOS_TRAFFIC_LIGHT_INSET } }
      : {})
  });

  if (process.platform === 'darwin') {
    win.__axisSidebarRight = false;
    attachMacTrafficLightResize(win);
  }

  win.webContents.once('did-finish-load', () => {
    setTimeout(() => {
      if (!win.isDestroyed()) {
        win.webContents.send('open-url-in-browser', url);
      }
    }, 400);
  });

  win.loadFile('src/index.html');

  win.webContents.setWindowOpenHandler(({ url: openUrl }) => {
    if (openUrl && (openUrl.startsWith('http://') || openUrl.startsWith('https://'))) {
      const lowerUrl = openUrl.toLowerCase();
      if (
        lowerUrl.startsWith('javascript:') ||
        lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('vbscript:') ||
        lowerUrl.startsWith('file:')
      ) {
        return { action: 'deny' };
      }
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    if (process.platform === 'darwin' && !win.isDestroyed()) {
      positionMacTrafficLights(win, !!win.__axisSidebarRight);
    }
    applyVibrancyToWindow(win);
    win.show();
    win.setWindowButtonVisibility(true);
  });
}

function createMenu() {
  const shortcuts = getShortcuts();
  const closeTabShortcut = menuAccel(shortcuts['close-tab']);
  const settingsShortcut = menuAccel(shortcuts['settings']);
  const newTabShortcut = menuAccel(shortcuts['new-tab']);
  const refreshShortcut = menuAccel(shortcuts['refresh']);
  const toggleSidebarShortcut = menuAccel(shortcuts['toggle-sidebar']);
  const historyShortcut = menuAccel(shortcuts['history']);
  const downloadsShortcut = menuAccel(shortcuts['downloads']);
  const toggleChatShortcut = menuAccel(shortcuts['toggle-chat']);
  const toggleMuteTabShortcut = menuAccel(shortcuts['toggle-mute-tab']);
  const findShortcut = menuAccel(shortcuts['find']);
  const selectAllShortcut = menuAccel(shortcuts['select-all']);
  const pasteMatchStyleShortcut = menuAccel(shortcuts['paste-match-style']);
  const printShortcut = menuAccel(shortcuts['print']);
  const focusUrlShortcut = menuAccel(shortcuts['focus-url']);
  const recoverTabShortcut = menuAccel(shortcuts['recover-tab']);
  const zoomInShortcut = menuAccel(shortcuts['zoom-in']);
  const zoomOutShortcut = menuAccel(shortcuts['zoom-out']);
  const resetZoomShortcut = menuAccel(shortcuts['reset-zoom']);
  const pinTabShortcut = menuAccel(shortcuts['pin-tab']);
  const duplicateTabShortcut = menuAccel(shortcuts['duplicate-tab']);
  const clearHistoryShortcut = menuAccel(shortcuts['clear-history']);
  const copyUrlShortcut = menuAccel(shortcuts['copy-url']);
  const copyUrlMarkdownShortcut = menuAccel(shortcuts['copy-url-markdown']);
  const nextTabShortcut = menuAccel(shortcuts['next-tab']);
  const previousTabShortcut = menuAccel(shortcuts['previous-tab']);

  const navBackAccel = process.platform === 'darwin' ? 'Cmd+[' : 'Alt+Left';
  const navForwardAccel = process.platform === 'darwin' ? 'Cmd+]' : 'Alt+Right';

  const newWinAccel = process.platform === 'darwin' ? 'Shift+Cmd+N' : 'Ctrl+Shift+N';
  const newIncognitoAccel = process.platform === 'darwin' ? 'Alt+Cmd+N' : 'Ctrl+Shift+P';

  const template = [];

  if (process.platform === 'darwin') {
    const appName = app.getName() || 'Axis';
    template.push({
      label: appName,
      submenu: [
        {
          label: `About ${appName}`,
          click: () => {
            void showMacAboutDialog();
          }
        },
        { type: 'separator' },
        {
          label: 'Settings…',
          ...(settingsShortcut ? { accelerator: settingsShortcut } : {}),
          click: () => openSettingsWindow()
        },
        {
          label: 'Keyboard Shortcuts…',
          click: () => openSettingsWindow('shortcuts')
        },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${appName}` },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        {
          label: `Quit ${appName}`,
          accelerator: 'Cmd+Q',
          click: () => {
            const win = getActiveAxisWindow();
            if (win && !win.isDestroyed() && showNativeQuitDialog()) {
              isQuitConfirmed = true;
              isUserQuitting = true;
              app.quit();
            } else if (!getActiveAxisWindow()) {
              app.quit();
            }
          }
        }
      ]
    });
  }

  const fileSubmenu = [
    {
      label: 'New Tab',
      ...(newTabShortcut ? { accelerator: newTabShortcut } : {}),
      click: () => sendBrowserShortcut('new-tab')
    },
    {
      label: 'New Window',
      accelerator: newWinAccel,
      click: () => createWindow()
    },
    {
      label: 'New Incognito Window',
      accelerator: newIncognitoAccel,
      click: () => createIncognitoWindow()
    },
    { type: 'separator' },
    {
      label: 'Focus Address Bar',
      ...(focusUrlShortcut ? { accelerator: focusUrlShortcut } : {}),
      click: () => sendBrowserShortcut('focus-url')
    },
    { type: 'separator' },
    {
      label: 'Print…',
      ...(printShortcut ? { accelerator: printShortcut } : {}),
      click: () => sendBrowserShortcut('print')
    },
    {
      label: 'Downloads',
      ...(downloadsShortcut ? { accelerator: downloadsShortcut } : {}),
      click: () => sendBrowserShortcut('downloads')
    },
    ...(process.platform !== 'darwin'
      ? [
          { type: 'separator' },
          {
            label: 'Quit',
            accelerator: 'Ctrl+Q',
            click: () => {
              isUserQuitting = true;
              const w = getActiveAxisWindow();
              if (w && !w.isDestroyed()) {
                w.webContents.send('request-quit');
              } else {
                app.quit();
              }
            }
          }
        ]
      : [])
  ];

  const editSubmenu = [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    {
      label: 'Paste and Match Style',
      ...(pasteMatchStyleShortcut ? { accelerator: pasteMatchStyleShortcut } : {}),
      click: () => sendBrowserShortcut('paste-match-style')
    },
    {
      label: 'Copy Page URL',
      ...(copyUrlShortcut ? { accelerator: copyUrlShortcut } : {}),
      click: () => sendBrowserShortcut('copy-url')
    },
    {
      label: 'Copy URL as Markdown',
      ...(copyUrlMarkdownShortcut ? { accelerator: copyUrlMarkdownShortcut } : {}),
      click: () => sendBrowserShortcut('copy-url-markdown')
    },
    ...(process.platform === 'darwin' ? [{ role: 'delete' }] : []),
    {
      label: 'Select All',
      ...(selectAllShortcut ? { accelerator: selectAllShortcut } : {}),
      click: () => sendBrowserShortcut('select-all')
    },
    { type: 'separator' },
    {
      label: 'Find in Page…',
      ...(findShortcut ? { accelerator: findShortcut } : {}),
      click: () => sendBrowserShortcut('find')
    },
    ...(process.platform === 'darwin'
      ? [
          { type: 'separator' },
          { role: 'startSpeaking' },
          { role: 'stopSpeaking' }
        ]
      : []),
    ...(process.platform !== 'darwin'
      ? [
          { type: 'separator' },
          {
            label: 'Settings…',
            ...(settingsShortcut ? { accelerator: settingsShortcut } : {}),
            click: () => openSettingsWindow()
          }
        ]
      : [])
  ];

  const tabsSubmenu = [
    {
      label: 'New Tab',
      ...(newTabShortcut ? { accelerator: newTabShortcut } : {}),
      click: () => sendBrowserShortcut('new-tab')
    },
    {
      label: 'Close Tab',
      ...(closeTabShortcut ? { accelerator: closeTabShortcut } : {}),
      click: () => sendBrowserShortcut('close-tab')
    },
    {
      label: 'Reopen Closed Tab',
      ...(recoverTabShortcut ? { accelerator: recoverTabShortcut } : {}),
      click: () => sendBrowserShortcut('recover-tab')
    },
    {
      label: 'Duplicate Tab',
      ...(duplicateTabShortcut ? { accelerator: duplicateTabShortcut } : {}),
      click: () => sendBrowserShortcut('duplicate-tab')
    },
    {
      label: 'Pin / Unpin Tab',
      ...(pinTabShortcut ? { accelerator: pinTabShortcut } : {}),
      click: () => sendBrowserShortcut('pin-tab')
    },
    {
      label: 'Mute / Unmute Tab',
      ...(toggleMuteTabShortcut ? { accelerator: toggleMuteTabShortcut } : {}),
      click: () => sendBrowserShortcut('toggle-mute-tab')
    },
    { type: 'separator' },
    {
      label: 'Show Next Tab',
      ...(nextTabShortcut ? { accelerator: nextTabShortcut } : {}),
      click: () => sendBrowserShortcut('next-tab')
    },
    {
      label: 'Show Previous Tab',
      ...(previousTabShortcut ? { accelerator: previousTabShortcut } : {}),
      click: () => sendBrowserShortcut('previous-tab')
    }
  ];

  const viewSubmenu = [
    {
      label: 'Back',
      accelerator: navBackAccel,
      click: () => sendBrowserShortcut('go-back')
    },
    {
      label: 'Forward',
      accelerator: navForwardAccel,
      click: () => sendBrowserShortcut('go-forward')
    },
    {
      label: 'Stop Loading',
      click: () => sendBrowserShortcut('stop-loading')
    },
    {
      label: 'Reload Page',
      ...(refreshShortcut ? { accelerator: refreshShortcut } : {}),
      click: () => sendBrowserShortcut('refresh')
    },
    { role: 'forceReload', label: 'Force Reload' },
    { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
    { type: 'separator' },
    {
      label: 'Actual Size',
      ...(resetZoomShortcut ? { accelerator: resetZoomShortcut } : {}),
      click: () => sendBrowserShortcut('reset-zoom')
    },
    {
      label: 'Zoom In',
      ...(zoomInShortcut ? { accelerator: zoomInShortcut } : {}),
      click: () => sendBrowserShortcut('zoom-in')
    },
    {
      label: 'Zoom Out',
      ...(zoomOutShortcut ? { accelerator: zoomOutShortcut } : {}),
      click: () => sendBrowserShortcut('zoom-out')
    },
    { type: 'separator' },
    {
      label: 'Toggle Sidebar',
      ...(toggleSidebarShortcut ? { accelerator: toggleSidebarShortcut } : {}),
      click: () => sendBrowserShortcut('toggle-sidebar')
    },
    {
      label: 'Toggle Chat',
      ...(toggleChatShortcut ? { accelerator: toggleChatShortcut } : {}),
      click: () => sendBrowserShortcut('toggle-chat')
    },
    { type: 'separator' },
    { role: 'togglefullscreen', label: 'Enter Full Screen' }
  ];

  const historySubmenu = [
    {
      label: 'Show History',
      ...(historyShortcut ? { accelerator: historyShortcut } : {}),
      click: () => sendBrowserShortcut('history')
    },
    { type: 'separator' },
    {
      label: 'Clear Browsing History…',
      ...(clearHistoryShortcut ? { accelerator: clearHistoryShortcut } : {}),
      click: () => sendBrowserShortcut('clear-history')
    }
  ];

  const windowSubmenu = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: 'New Window',
            accelerator: 'Shift+Cmd+N',
            click: () => createWindow()
          },
          {
            label: 'New Incognito Window',
            accelerator: 'Alt+Cmd+N',
            click: () => createIncognitoWindow()
          },
          { type: 'separator' }
        ]
      : []),
    { role: 'minimize' },
    { role: 'zoom' },
    ...(process.platform === 'darwin' ? [{ type: 'separator' }, { role: 'front' }] : []),
    { type: 'separator' },
    {
      label: 'Close Window',
      click: () => {
        const win = BrowserWindow.getFocusedWindow();
        if (win && !win.isDestroyed()) win.close();
      }
    },
    {
      label: 'Close All Windows',
      accelerator: process.platform === 'darwin' ? 'Alt+Cmd+W' : 'Ctrl+Shift+W',
      click: () => {
        BrowserWindow.getAllWindows().forEach((w) => {
          if (!w.isDestroyed()) w.close();
        });
      }
    }
  ];

  const helpSubmenu = [
    {
      label: 'View License',
      click: () =>
        openUrlInAxisBrowser('https://github.com/AbdelrahmanBerchan/Axis-Browser/blob/main/LICENSE.md')
    },
    {
      label: 'Report an Issue',
      click: () => openUrlInAxisBrowser('https://github.com/AbdelrahmanBerchan/Axis-Browser/issues')
    },
    {
      label: 'Report a Vulnerability',
      click: () =>
        openUrlInAxisBrowser('https://github.com/AbdelrahmanBerchan/Axis-Browser/security')
    },
    {
      label: 'Donate',
      click: () => openUrlInAxisBrowser('https://www.patreon.com/cw/AbdelrahmanBerchan')
    },
    {
      label: 'Visit GitHub Page',
      click: () => openUrlInAxisBrowser('https://github.com/AbdelrahmanBerchan/Axis-Browser')
    }
  ];

  template.push({ label: 'File', submenu: fileSubmenu });
  template.push({ label: 'Edit', submenu: editSubmenu });
  template.push({ label: 'Tabs', submenu: tabsSubmenu });
  template.push({ label: 'View', submenu: viewSubmenu });
  template.push({ label: 'History', submenu: historySubmenu });
  template.push({ label: 'Window', submenu: windowSubmenu });
  template.push({ label: 'Help', submenu: helpSubmenu });

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createIncognitoWindow(initialUrl = null) {
  // Create a new session for incognito mode
  const incognitoSession = session.fromPartition('incognito');
  
  const incognitoWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'Axis — Incognito',
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      offscreen: false,
      experimentalFeatures: true,
      enableBlinkFeatures: 'CSSColorSchemeUARendering',
      v8CacheOptions: 'code',
      spellcheck: false,
      webSecurity: true,
      webgl: true
      // Shell: default session (same as normal windows) so IPC e.g. set-window-title works
      // reliably; private browsing stays in <webview partition="incognito"> (renderer).
    },
    titleBarStyle: 'hiddenInset',
    frame: false,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: MACOS_TRAFFIC_LIGHT_INSET, y: MACOS_TRAFFIC_LIGHT_INSET } }
      : {})
  });

  if (process.platform === 'darwin') {
    incognitoWindow.__axisSidebarRight = false;
    attachMacTrafficLightResize(incognitoWindow);
  }

  if (initialUrl && isSafeHttpUrl(initialUrl)) {
    incognitoWindow.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        if (!incognitoWindow.isDestroyed()) {
          incognitoWindow.webContents.send('open-url-in-browser', initialUrl);
        }
      }, 400);
    });
  }

  // Load the app with hash so renderer knows it's incognito (for indicator, theme lock, no history)
  incognitoWindow.loadFile('src/index.html', { hash: 'incognito' });

  incognitoWindow.once('ready-to-show', () => {
    if (process.platform === 'darwin' && !incognitoWindow.isDestroyed()) {
      positionMacTrafficLights(incognitoWindow, !!incognitoWindow.__axisSidebarRight);
    }
    incognitoWindow.show();
  });

  incognitoWindow.on('closed', () => {
    incognitoSession.clearStorageData();
    incognitoSession.clearCache();
    incognitoSession.clearAuthCache();
    incognitoSession.clearHostResolverCache();
  });

  return incognitoWindow;
}

function updateDockMenu() {
  if (process.platform !== 'darwin' || !app.dock) return;

  const dockMenu = Menu.buildFromTemplate([
    {
      label: 'New Window',
      click: () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          createWindow();
        } else {
          createWindow();
        }
      }
    },
    {
      label: 'New Incognito Window',
      click: () => {
        createIncognitoWindow();
      }
    }
  ]);

  app.dock.setMenu(dockMenu);
}

// Filter noisy Chromium/Electron messages from stderr (JS path). Native NSLog is filtered in scripts/run-electron.js.
const SUPPRESSED_PATTERNS = require(path.join(__dirname, '..', 'scripts', 'suppress-stderr-patterns.js'));

function matchesSuppressed(text) {
  return typeof text === 'string' && SUPPRESSED_PATTERNS.some(p => text.includes(p));
}

const _origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk, ...rest) => {
  if (matchesSuppressed(typeof chunk === 'string' ? chunk : chunk?.toString?.())) return true;
  return _origStderrWrite(chunk, ...rest);
};

const _origStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, ...rest) => {
  if (matchesSuppressed(typeof chunk === 'string' ? chunk : chunk?.toString?.())) return true;
  return _origStdoutWrite(chunk, ...rest);
};

const _origConsoleError = console.error;
console.error = (...args) => {
  const first = args[0];
  if (matchesSuppressed(typeof first === 'string' ? first : '')) return;
  if (first instanceof Error && (first.errno === -3 || matchesSuppressed(first.message))) return;
  _origConsoleError.apply(console, args);
};

const _origProcessEmitWarning = process.emitWarning;
process.emitWarning = (warning, ...rest) => {
  const msg = typeof warning === 'string' ? warning
    : (warning instanceof Error ? warning.message : '');
  if (matchesSuppressed(msg)) return;
  _origProcessEmitWarning.call(process, warning, ...rest);
};

/** Prime clipboard, shortcut store read, and Menu so first context menu is not cold. */
function warmUpMainProcessNativePaths() {
  try {
    clipboard.readText();
  } catch (_) {}
  try {
    getShortcuts();
  } catch (_) {}
  try {
    Menu.buildFromTemplate([{ type: 'separator' }, { label: '_', enabled: false }]);
  } catch (_) {}
}

// App event handlers
app.whenReady().then(async () => {
  app.on('web-contents-created', (_event, contents) => {
    contents.setMaxListeners(0);
  });

  configureSession();
  warmUpMainProcessNativePaths();
  createWindow();
  updateDockMenu();
  // Dock squircle (Jimp) runs after first window — avoids delaying initial paint; cache makes later launches cheap.
  void applyMacDockIcon();
  // Ensure shortcuts are active whenever any Axis window has focus
  app.on('browser-window-focus', () => {
    unregisterShortcuts();
    registerShortcuts();
  });
  // When no Axis window is focused (app in background), remove global shortcuts
  app.on('browser-window-blur', () => {
    if (!BrowserWindow.getFocusedWindow()) {
      unregisterShortcuts();
    }
  });
});

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
ipcMain.handle('open-settings-window', (event, tab) => {
  openSettingsWindow(tab || null);
  return true;
});

ipcMain.handle('set-window-title', (event, title) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    const safeTitle = (title && typeof title === 'string' && title.trim().length > 0)
      ? title.trim()
      : 'Axis Browser';
    win.setTitle(safeTitle);
  }
  return true;
});

ipcMain.on('settings-updated', () => {
  applyMainWindowVibrancyFromStore();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings-updated');
  }
});

ipcMain.handle('print-page', (event, webContentsId) => {
  const { webContents } = require('electron');
  const guest = webContents.fromId(webContentsId);
  if (guest && !guest.isDestroyed()) {
    guest.print({ silent: false, printBackground: true });
  }
  return true;
});

ipcMain.handle('open-url-in-browser', (event, url) => {
  openUrlInAxisBrowser(url);
  return true;
});

ipcMain.handle('get-settings', () => {
  return store.store;
});

ipcMain.handle('get-site-permission-overrides', () => {
  return store.get('sitePermissionOverrides', {});
});

ipcMain.handle('set-site-permission-overrides', (event, obj) => {
  const cleaned = cleanSitePermissionOverrides(obj);
  store.set('sitePermissionOverrides', cleaned);
  return cleaned;
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

ipcMain.handle('get-shortcut-overrides', () => {
  return getShortcutOverrides();
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

// Incognito window (optional initial URL to open in a new tab)
ipcMain.handle('open-incognito-window', (event, url) => {
  createIncognitoWindow(typeof url === 'string' && url.length > 0 ? url : null);
  return true;
});

ipcMain.handle('open-url-in-new-window', (event, url) => {
  if (typeof url === 'string' && isSafeHttpUrl(url)) {
    openUrlInNewBrowserWindow(url);
  }
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

// Sidebar context menu — creation actions, then chrome (toggle / position)
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
    {
      label: 'New Incognito Tab',
      click: () => {
        event.sender.send('sidebar-context-menu-action', 'new-incognito-tab');
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

  menu.popup({ window });

  return true;
});

// Webpage context menu — link → image → navigation → edit → selection tools → page
ipcMain.handle('show-webpage-context-menu', async (event, x, y, contextInfo) => {
  const ctx = contextInfo || {};
  const template = [];

  // --- Link (target hit is a link)
  if (ctx.linkURL && ctx.linkURL.length > 0) {
    template.push({
      label: 'Open Link in New Tab',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'open-link-new-tab', { linkURL: ctx.linkURL });
      }
    });
    if (isSafeHttpUrl(ctx.linkURL)) {
      template.push({
        label: 'Open Link in New Window',
        click: () => {
          openUrlInNewBrowserWindow(ctx.linkURL);
        }
      });
      template.push({
        label: 'Open Link in Incognito Window',
        click: () => {
          createIncognitoWindow(ctx.linkURL);
        }
      });
    }
    template.push({
      label: 'Copy Link Address',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'copy-link', { linkURL: ctx.linkURL });
      }
    });
    template.push({ type: 'separator' });
  }

  // --- Image
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

  // --- Navigation
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

  // --- Edit
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
    label: 'Paste and Match Style',
    enabled: ctx.canPaste || ctx.isEditable || false,
    click: () => {
      event.sender.send('webpage-context-menu-action', 'paste-match-style');
    }
  });
  template.push({
    label: 'Select All',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'select-all');
    }
  });

  // --- Selection (search + speech)
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

    if (ctx.speechEnabled !== false) {
      template.push({
        label: 'Speech',
        enabled: !!ctx.selectionText && ctx.selectionText.trim().length > 0,
        submenu: [
          {
            label: 'Start Speaking',
            enabled: !ctx.isSpeaking,
            click: () => {
              event.sender.send('webpage-context-menu-action', 'speech-start', {
                selectionText: ctx.selectionText
              });
            }
          },
          {
            label: 'Stop Speaking',
            enabled: !!ctx.isSpeaking,
            click: () => {
              event.sender.send('webpage-context-menu-action', 'speech-stop');
            }
          }
        ]
      });
    }
  }

  template.push({ type: 'separator' });

  // --- Page
  template.push({
    label: 'Copy Page URL',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'copy-url');
    }
  });
  template.push({
    label: 'Copy URL as Markdown',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'copy-url-markdown');
    }
  });
  template.push({
    label: 'Print…',
    click: () => {
      event.sender.send('webpage-context-menu-action', 'print');
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

  menu.popup({ window });

  return true;
});

// URL bar — standard edit cluster, then navigation (paste and go)
ipcMain.handle('show-urlbar-context-menu', async (event, x, y, contextInfo) => {
  const ctx = contextInfo || {};
  const clipText = (clipboard.readText() || '').trim();
  const canPasteAndGo = clipText.length > 0;
  const template = [
    {
      label: 'Cut',
      enabled: !!ctx.isEditable,
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'cut');
      }
    },
    {
      label: 'Copy',
      enabled: !!ctx.hasSelection,
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'copy');
      }
    },
    {
      label: 'Paste',
      enabled: canPasteAndGo,
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'paste', { text: clipboard.readText() || '' });
      }
    },
    {
      label: 'Paste and Match Style',
      enabled: canPasteAndGo,
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'paste-match-style');
      }
    },
    {
      label: 'Select All',
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'select-all');
      }
    },
    { type: 'separator' },
    {
      label: 'Paste and Go',
      enabled: canPasteAndGo,
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'paste-and-go', { text: clipboard.readText() || '' });
      }
    }
  ];
  
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  menu.popup({ window });
  return true;
});

// Tab — identity & tab actions, grouping, then destructive close
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
    }
  ];
  if (!info.isIncognito) {
    template.push({
      label: info.isPinned ? 'Unpin Tab' : 'Pin Tab',
      click: () => {
        event.sender.send('tab-context-menu-action', 'toggle-pin');
      }
    });
  }
  template.push(
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
  );

  const tabGroups = info.tabGroups || [];
  const inGroupId = info.tabGroupId;
  const inGroup = inGroupId != null && inGroupId !== '';

  if (inGroup) {
    template.push({
      label: 'Remove from Tab Group',
      click: () => {
        event.sender.send('tab-context-menu-action', 'remove-from-tab-group', { tabGroupId: inGroupId });
      }
    });
    const otherGroups = tabGroups.filter((g) => String(g.id) !== String(inGroupId));
    if (otherGroups.length > 0) {
      template.push({
        label: 'Move to another tab group',
        submenu: otherGroups.map((g) => ({
          label: g.name,
          click: () => {
            event.sender.send('tab-context-menu-action', 'move-to-tab-group', { tabGroupId: g.id });
          }
        }))
      });
    }
  } else if (tabGroups.length > 0) {
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

  template.push({ type: 'separator' });
  template.push({
    label: 'Close Tab',
    click: () => {
      event.sender.send('tab-context-menu-action', 'close');
    }
  });

  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);

  menu.popup({ window });

  return true;
});

// Tab group — edit & appearance, then destructive delete
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

  menu.popup({ window });

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

// Real file previews (HEIC, PDF, video, etc.) via OS thumbnail APIs — not <img src=file://>
ipcMain.handle('get-file-thumbnail-data-url', async (event, filePath, maxSize = 128) => {
  try {
    if (!filePath || typeof filePath !== 'string') return null;
    const resolved = path.resolve(filePath);
    const st = await fs.promises.stat(resolved).catch(() => null);
    if (!st || !st.isFile()) return null;
    const dim = Math.min(Math.max(64, Number(maxSize) || 128), 512);
    const thumb = await nativeImage.createThumbnailFromPath(resolved, { width: dim, height: dim });
    if (!thumb || thumb.isEmpty()) return null;

    const dragScaled = scaleNativeImageToMax(thumb, DRAG_ICON_MAX_PX);
    if (dragScaled && !dragScaled.isEmpty()) {
      dragIconCache.set(filePath, dragScaled);
      trimDragIconCache();
    }

    return thumb.toDataURL();
  } catch (error) {
    return null;
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
  menu.popup({ window });

  return true;
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

/** Max longest side (px) for drag ghost — full-size file previews cover the entire screen */
const DRAG_ICON_MAX_PX = 32;
/** Drag ghost bitmaps (OS thumbnails when possible — matches downloads popup previews) */
const dragIconCache = new Map();
const DRAG_ICON_CACHE_MAX = 40;

function trimDragIconCache() {
  while (dragIconCache.size > DRAG_ICON_CACHE_MAX) {
    const first = dragIconCache.keys().next().value;
    dragIconCache.delete(first);
  }
}

function scaleNativeImageToMax(icon, maxDim) {
  if (!icon || icon.isEmpty()) return null;
  const { width, height } = icon.getSize();
  if (width <= 0 || height <= 0) return null;
  if (width <= maxDim && height <= maxDim) return icon;
  const scale = Math.min(maxDim / width, maxDim / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  try {
    return icon.resize({ width: w, height: h, quality: 'best' });
  } catch (e) {
    try {
      return icon.resize({ width: w, height: h });
    } catch (e2) {
      return null;
    }
  }
}

/** Never empty — startDrag with an empty icon is skipped and looks like drag is broken */
function getGuaranteedDragFallbackIcon() {
  const dataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAOklEQVQ4T2NkYGD4z0ABYBzVMKoBBg0MBv8ZGP4zMPxnYPjPwPD/PwPDfwYGhv8MDP8ZGP4zMPxnYPgPALmJCm0bicgAAAAASUVORK5CYII=';
  try {
    const img = nativeImage.createFromDataURL(dataUrl);
    if (img && !img.isEmpty()) {
      const scaled = scaleNativeImageToMax(img, DRAG_ICON_MAX_PX);
      if (scaled && !scaled.isEmpty()) return scaled;
      try {
        const r = img.resize({ width: 32, height: 32 });
        if (r && !r.isEmpty()) return r;
      } catch (e) {}
      return img;
    }
  } catch (e) {}
  try {
    return nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    );
  } catch (e2) {
    return nativeImage.createEmpty();
  }
}

function getDragPreviewIconSync(filePath) {
  const cached = dragIconCache.get(filePath);
  if (cached && !cached.isEmpty()) return cached;

  let icon = nativeImage.createFromPath(filePath);
  if (icon && !icon.isEmpty()) {
    const scaled = scaleNativeImageToMax(icon, DRAG_ICON_MAX_PX);
    if (scaled && !scaled.isEmpty()) return scaled;
  }

  const fallback = getFallbackFileIcon();
  if (fallback && !fallback.isEmpty()) {
    const scaledFb = scaleNativeImageToMax(fallback, DRAG_ICON_MAX_PX);
    if (scaledFb && !scaledFb.isEmpty()) return scaledFb;
    try {
      const r = fallback.resize({ width: 32, height: 32 });
      if (r && !r.isEmpty()) return r;
    } catch (e) {}
    return fallback;
  }

  return getGuaranteedDragFallbackIcon();
}

ipcMain.handle('cache-drag-icons', async (event, paths) => {
  if (!Array.isArray(paths)) return;

  const storeForPath = (p, nativeImg) => {
    if (!nativeImg || nativeImg.isEmpty()) return;
    const scaled = scaleNativeImageToMax(nativeImg, DRAG_ICON_MAX_PX);
    if (scaled && !scaled.isEmpty()) {
      dragIconCache.set(p, scaled);
      trimDragIconCache();
    }
  };

  await Promise.all(
    paths.map(async (p) => {
      if (!p || typeof p !== 'string') return;
      let resolved;
      try {
        resolved = path.resolve(p);
        const st = await fs.promises.stat(resolved).catch(() => null);
        if (!st || !st.isFile()) return;
      } catch (e) {
        return;
      }

      try {
        const thumb = await nativeImage.createThumbnailFromPath(resolved, { width: 128, height: 128 });
        if (thumb && !thumb.isEmpty()) {
          storeForPath(p, thumb);
          return;
        }
      } catch (e) {}

      try {
        const icon = await app.getFileIcon(p, { size: 'normal' });
        if (icon && !icon.isEmpty()) {
          storeForPath(p, icon);
          return;
        }
      } catch (e) {}

      try {
        const fromFile = nativeImage.createFromPath(resolved);
        if (fromFile && !fromFile.isEmpty()) storeForPath(p, fromFile);
      } catch (e2) {}
    })
  );
});

// Native file drag (must run synchronously during HTML dragstart — use on/send, not handle/invoke)
ipcMain.on('start-file-drag', (event, filePath) => {
  try {
    if (!filePath || typeof filePath !== 'string') return;

    let icon = getDragPreviewIconSync(filePath);
    if (!icon || icon.isEmpty()) icon = getGuaranteedDragFallbackIcon();

    event.sender.startDrag({
      file: filePath,
      icon
    });
  } catch (error) {
    console.error('Failed to start file drag:', error);
  }
});

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

// Mirror stoplights to top-right when sidebar is docked on the right (per-window; respects resize)
ipcMain.handle('set-sidebar-traffic-layout', (event, sidebarOnRight) => {
  if (process.platform !== 'darwin') return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  win.__axisSidebarRight = !!sidebarOnRight;
  positionMacTrafficLights(win, win.__axisSidebarRight);
});

