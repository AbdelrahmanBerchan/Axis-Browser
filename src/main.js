const { app, BrowserWindow, Menu, ipcMain, dialog, session, globalShortcut, shell, screen, nativeImage, clipboard, nativeTheme, systemPreferences, net } = require('electron');
// Must run before `ready`. `package.json` `name` is lowercase `axis` (npm); Dock tooltip and `getName()` use this human-readable label.
app.setName('Axis');
const path = require('path');
const Store = require('electron-store');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const AdmZip = require('adm-zip');
const { pathToFileURL, fileURLToPath } = require('url');
const { installAxisShellCspOnAllSessions } = require('./axis-shell-csp');
const { createAxisVault, formatAddressSummary } = require('./axis-vault');
const { sanitizeProfileIcon } = require('./axis-profile-icons');
const {
  listImportableBrowsers,
  listBrowserImportProfiles,
  importBrowserProfileData,
  previewBrowserImport,
  inspectCustomProfileFolder,
  buildAxisProfileExportPayload,
  importAxisProfileBackup
} = require('./axis-profile-import');
const { createProfileTrashApi } = require('./axis-profile-trash');
const { trimProfileHistoryItems } = require('./axis-history-store');
const { AXIS_VAULT_PAGE_SCAN_JS } = require('./axis-vault-page-scan');
const {
  AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS,
  AXIS_VAULT_AUTOFILL_PROBE_JS,
  AXIS_VAULT_AUTOFILL_HIDE_JS,
  buildVaultAutofillShowMenuJs,
  buildVaultAutofillFillLoginJs
} = require('./axis-vault-autofill-inject');
const { installAxisPageSecurityOnSession, installAxisPageSecurityOnWebContents, getPageSecurityInfo } = require('./axis-page-security');
const axisUpdateCheck = require('./axis-update-check');

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
  image.scan(0, 0, w, h, (x, y, idx) => {
    const u = (x + 0.5 - halfW) / halfW;
    const v = (y + 0.5 - halfH) / halfH;
    if (Math.abs(u) ** n + Math.abs(v) ** n > 1) {
      image.bitmap.data[idx + 3] = 0;
    }
  });
}

function getDockSquircleCachePath() {
  try {
    // Bump filename when squircle pipeline changes so stale cache is not reused.
    return path.join(app.getPath('userData'), 'dock-squircle-cache-v3.png');
  } catch (_) {
    return path.join(os.tmpdir(), 'axis-browser-dock-squircle-cache-v3.png');
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
    const jimpModule = require('jimp');
    Jimp = jimpModule.Jimp;
    JimpMime = jimpModule.JimpMime;
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
const AXIS_LAST_CLEAN_EXIT_KEY = 'axisLastSessionCleanExit';
/** Window-wide sidebar dock side — shared across every profile in this window. */
const AXIS_SIDEBAR_POSITION_KEY = 'sidebarPosition';

function getGlobalSidebarPosition() {
  if (store.has(AXIS_SIDEBAR_POSITION_KEY)) {
    return store.get(AXIS_SIDEBAR_POSITION_KEY) === 'right' ? 'right' : 'left';
  }
  try {
    const legacy = getProfileStore(AXIS_DEFAULT_PROFILE_ID).get('sidebarPosition', 'left');
    const v = legacy === 'right' ? 'right' : 'left';
    store.set(AXIS_SIDEBAR_POSITION_KEY, v);
    return v;
  } catch (_) {
    return 'left';
  }
}

function setGlobalSidebarPosition(value) {
  const v = value === 'right' ? 'right' : 'left';
  store.set(AXIS_SIDEBAR_POSITION_KEY, v);
  return v;
}

function mergeGlobalSettingsIntoProfileSettings(profileSettings) {
  return {
    ...(profileSettings && typeof profileSettings === 'object' ? profileSettings : {}),
    sidebarPosition: getGlobalSidebarPosition()
  };
}
/** Captured at process start before the session is marked dirty (renderer reads via IPC). */
let axisSessionLastExitClean = true;

function wasLastAxisSessionCleanExit() {
  return store.get(AXIS_LAST_CLEAN_EXIT_KEY, true) !== false;
}

function markAxisSessionRunning() {
  store.set(AXIS_LAST_CLEAN_EXIT_KEY, false);
}

function markAxisSessionCleanExit() {
  store.set(AXIS_LAST_CLEAN_EXIT_KEY, true);
}

const AXIS_DEFAULT_PROFILE_ID = 'personal';
const AXIS_PROFILES_STORE_KEY = 'profiles';
const AXIS_LAST_ACTIVE_PROFILE_KEY = 'lastActiveProfileId';
const axisProfileStores = new Map();

/** Per-profile vault instances (separate password/card files). */
const axisVaultByProfile = new Map();

// Electron defaults `nativeTheme.themeSource` to `system`, so when the OS switches
// light/dark, Chromium's `prefers-color-scheme`, vibrancy materials, and native form
// chrome follow — which fights Axis (user theme + in-app Appearance). Pin a stable
// dark scheme for the whole app; light “Appearance” remains overlay/CSS (`data-ui-theme`)
// and `settings.html`'s own `color-scheme`, not OS-driven.
try {
  nativeTheme.themeSource = 'dark';
} catch (_) {}

/** OS light/dark preference while `themeSource` stays pinned to `dark`. */
function getSystemUiThemePreference() {
  try {
    if (process.platform === 'darwin') {
      // `isDarkMode` was removed in Electron 13+. Read the global OS setting directly —
      // `shouldUseDarkColorsForSystemIntegratedUI` mirrors the *app* theme on macOS, which
      // we pin to dark, so it cannot represent the system preference.
      if (typeof systemPreferences.getUserDefault === 'function') {
        try {
          const style = systemPreferences.getUserDefault('AppleInterfaceStyle', 'string');
          return style === 'Dark' ? 'dark' : 'light';
        } catch (_) {
          // Key is absent when macOS is in light mode.
          return 'light';
        }
      }
    }
    if (
      process.platform === 'win32' &&
      typeof nativeTheme.shouldUseDarkColorsForSystemIntegratedUI === 'boolean'
    ) {
      return nativeTheme.shouldUseDarkColorsForSystemIntegratedUI ? 'dark' : 'light';
    }
    // Linux / fallback: momentarily follow the OS, read, then restore the app pin.
    const prev = nativeTheme.themeSource;
    nativeTheme.themeSource = 'system';
    const dark = nativeTheme.shouldUseDarkColors === true;
    nativeTheme.themeSource = prev || 'dark';
    return dark ? 'dark' : 'light';
  } catch (_) {}
  return 'dark';
}

function broadcastSystemUiThemeChanged() {
  const theme = getSystemUiThemePreference();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed()) continue;
    try {
      win.webContents.send('system-ui-theme-changed', theme);
    } catch (_) {}
  }
}

try {
  nativeTheme.on('updated', () => broadcastSystemUiThemeChanged());
} catch (_) {}

try {
  if (
    process.platform === 'darwin' &&
    typeof systemPreferences.subscribeNotification === 'function'
  ) {
    systemPreferences.subscribeNotification(
      'AppleInterfaceThemeChangedNotification',
      () => broadcastSystemUiThemeChanged()
    );
  }
} catch (_) {}

// Initialize history and downloads stores
const historyStore = new Store({ name: 'history' });
const downloadsStore = new Store({ name: 'downloads' });
const notesStore = new Store({ name: 'notes' });

const AXIS_EXTENSIONS_STORE_KEY = 'extensions';
const axisExtensionRuntime = new Map();
/** Small `BrowserWindow` instances opened for `default_popup` (keyed by our extension record id). */
const axisExtensionPopupByRecordId = new Map();

const AXIS_EXTENSION_SESSION_PARTITION = 'persist:main';

function sanitizeProfileId(raw) {
  const id = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!id) return AXIS_DEFAULT_PROFILE_ID;
  const safe = id.replace(/[^a-z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 48);
  return safe || AXIS_DEFAULT_PROFILE_ID;
}

function normalizeAxisProfileRecord(p) {
  const id = sanitizeProfileId(p?.id);
  return {
    id,
    name: typeof p?.name === 'string' && p.name.trim() ? p.name.trim() : 'Profile',
    icon: sanitizeProfileIcon(p?.icon)
  };
}

function listAxisProfiles() {
  const fromStore = store.get(AXIS_PROFILES_STORE_KEY, []);
  const out = Array.isArray(fromStore) ? [...fromStore] : [];
  if (!out.some((p) => sanitizeProfileId(p?.id) === AXIS_DEFAULT_PROFILE_ID)) {
    out.unshift({ id: AXIS_DEFAULT_PROFILE_ID, name: 'Personal', icon: 'user' });
  }
  return out
    .map(normalizeAxisProfileRecord)
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);
}

function saveAxisProfiles(profiles) {
  const cleaned = (Array.isArray(profiles) ? profiles : [])
    .map(normalizeAxisProfileRecord)
    .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx);
  store.set(AXIS_PROFILES_STORE_KEY, cleaned);
}

function rememberLastActiveProfile(profileId) {
  const id = sanitizeProfileId(profileId);
  if (!id || id === 'incognito') return;
  store.set(AXIS_LAST_ACTIVE_PROFILE_KEY, id);
}

function getProfileGlobalSettings() {
  return {
    profileStartupMode: store.get('profileStartupMode', 'resume'),
    profileStartupProfileId: sanitizeProfileId(
      store.get('profileStartupProfileId', AXIS_DEFAULT_PROFILE_ID)
    ),
    profileNewWindowMode: store.get('profileNewWindowMode', 'same')
  };
}

function setProfileGlobalSetting(key, value) {
  if (key === 'profileStartupMode') {
    const mode = value === 'personal' || value === 'fixed' ? value : 'resume';
    store.set('profileStartupMode', mode);
    return mode;
  }
  if (key === 'profileStartupProfileId') {
    const id = sanitizeProfileId(value);
    store.set('profileStartupProfileId', id);
    return id;
  }
  if (key === 'profileNewWindowMode') {
    const mode = value === 'personal' ? 'personal' : 'same';
    store.set('profileNewWindowMode', mode);
    return mode;
  }
  return null;
}

function resolveStartupProfileId() {
  const { profileStartupMode, profileStartupProfileId } = getProfileGlobalSettings();
  if (profileStartupMode === 'personal') return AXIS_DEFAULT_PROFILE_ID;
  if (profileStartupMode === 'fixed') {
    const id = sanitizeProfileId(profileStartupProfileId);
    if (listAxisProfiles().some((p) => p.id === id)) return id;
    return AXIS_DEFAULT_PROFILE_ID;
  }
  const last = sanitizeProfileId(store.get(AXIS_LAST_ACTIVE_PROFILE_KEY, AXIS_DEFAULT_PROFILE_ID));
  if (listAxisProfiles().some((p) => p.id === last)) return last;
  return AXIS_DEFAULT_PROFILE_ID;
}

function resolveNewWindowProfileId(focusedWin = null) {
  const { profileNewWindowMode } = getProfileGlobalSettings();
  if (profileNewWindowMode === 'personal') return AXIS_DEFAULT_PROFILE_ID;
  let win = focusedWin;
  if (!win || win.isDestroyed()) win = BrowserWindow.getFocusedWindow();
  if (win && !win.isDestroyed() && win.__axisIsIncognito !== true) {
    return sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  }
  return resolveStartupProfileId();
}

function formatProfileStorageBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function getProfileStorageBytes(profileId) {
  const id = sanitizeProfileId(profileId);
  let total = 0;
  for (const filePath of [getProfileStoreFilePath(id), getProfileVaultFilePath(id)]) {
    try {
      total += fs.statSync(filePath).size;
    } catch (_) {}
  }
  const extDir = path.join(app.getPath('userData'), 'axis-extensions', id);
  try {
    const walk = (dir) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(full);
        else {
          try {
            total += fs.statSync(full).size;
          } catch (_) {}
        }
      }
    };
    if (fs.existsSync(extDir)) walk(extDir);
  } catch (_) {}
  return total;
}

function getProfilesOverview() {
  return listAxisProfiles().map((profile) => {
    const id = profile.id;
    const profileStore = getProfileStore(id);
    const favorites = profileStore.get('favorites', []);
    const historyItems = profileStore.get('historyItems', []);
    const pinnedTabs = profileStore.get('pinnedTabs', []);
    const extensions = getStoredAxisExtensions(id);
    return {
      id,
      name: profile.name,
      icon: profile.icon,
      favorites: Array.isArray(favorites) ? favorites.length : 0,
      history: Array.isArray(historyItems) ? historyItems.length : 0,
      pinnedTabs: Array.isArray(pinnedTabs) ? pinnedTabs.length : 0,
      extensions: Array.isArray(extensions) ? extensions.length : 0,
      storageBytes: getProfileStorageBytes(id),
      storageLabel: formatProfileStorageBytes(getProfileStorageBytes(id))
    };
  });
}

function broadcastProfilesUpdated(evictProfileId) {
  const payload = evictProfileId
    ? { evictProfileId: sanitizeProfileId(evictProfileId) }
    : null;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || w.__axisIsIncognito) continue;
    try {
      w.webContents.send('profiles-updated', payload);
    } catch (_) {}
  }
  try {
    createMenu();
  } catch (_) {}
}

function refreshProfileWindowTitles(profileId) {
  const id = sanitizeProfileId(profileId);
  const name = getProfileName(id);
  const title =
    id === AXIS_DEFAULT_PROFILE_ID && name === 'Personal' ? 'Axis Browser' : `Axis — ${name}`;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || w.__axisIsIncognito) continue;
    if (sanitizeProfileId(w.__axisProfileId || AXIS_DEFAULT_PROFILE_ID) === id) {
      try {
        w.setTitle(title);
      } catch (_) {}
    }
  }
}

function getProfileVaultFilePath(profileId) {
  const id = sanitizeProfileId(profileId);
  if (id === AXIS_DEFAULT_PROFILE_ID) {
    return path.join(app.getPath('userData'), 'axis-vault-v2.json');
  }
  return path.join(app.getPath('userData'), `axis-vault-v2-${id}.json`);
}

function getProfileStoreFilePath(profileId) {
  return path.join(app.getPath('userData'), `profile-${sanitizeProfileId(profileId)}.json`);
}

const profileTrash = createProfileTrashApi({
  app,
  sanitizeProfileId,
  getProfileStoreFilePath,
  getProfileVaultFilePath,
  listAxisProfiles,
  saveAxisProfiles,
  axisProfileStores,
  axisVaultByProfile,
  getStoredAxisExtensions,
  setStoredAxisExtensions,
  AXIS_DEFAULT_PROFILE_ID
});

function updateAxisProfile(profileId, updates = {}) {
  const id = sanitizeProfileId(profileId);
  const profiles = listAxisProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error('Profile not found');
  if (updates.name != null) {
    const name = typeof updates.name === 'string' ? updates.name.trim() : '';
    if (!name) throw new Error('Profile name is required');
    profiles[idx].name = name.slice(0, 48);
  }
  if (updates.icon != null) {
    profiles[idx].icon = sanitizeProfileIcon(updates.icon);
  }
  saveAxisProfiles(profiles);
  refreshProfileWindowTitles(id);
  broadcastProfilesUpdated();
  return profiles[idx];
}

function reorderAxisProfiles(orderedIds) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
    throw new Error('Invalid profile order');
  }
  const current = listAxisProfiles();
  const byId = new Map(current.map((p) => [p.id, p]));
  const next = [];
  for (const raw of orderedIds) {
    const id = sanitizeProfileId(raw);
    const rec = byId.get(id);
    if (rec) {
      next.push({ id: rec.id, name: rec.name, icon: rec.icon });
      byId.delete(id);
    }
  }
  for (const rec of byId.values()) {
    next.push({ id: rec.id, name: rec.name, icon: rec.icon });
  }
  if (next.length !== current.length) {
    throw new Error('Profile order must include every profile');
  }
  saveAxisProfiles(next);
  broadcastProfilesUpdated();
  return next;
}

async function deleteAxisProfile(profileId) {
  const id = sanitizeProfileId(profileId);
  if (id === AXIS_DEFAULT_PROFILE_ID) {
    throw new Error('The Personal profile cannot be deleted.');
  }

  const wins = BrowserWindow.getAllWindows().filter(
    (w) =>
      w &&
      !w.isDestroyed() &&
      w.__axisIsIncognito !== true &&
      sanitizeProfileId(w.__axisProfileId || AXIS_DEFAULT_PROFILE_ID) === id
  );
  for (const w of wins) {
    try {
      w.webContents.send('axis-switch-profile', {
        profileId: AXIS_DEFAULT_PROFILE_ID,
        animate: false
      });
      await switchProfileInBrowserWindow(w, AXIS_DEFAULT_PROFILE_ID);
    } catch (_) {}
  }

  const extensions = getStoredAxisExtensions(id);
  const trashEntry = await profileTrash.trashAxisProfile(id);

  for (const record of extensions) {
    try {
      unloadAxisExtensionRecord(record, id);
      deleteExtensionRuntimeState(id, record.id);
    } catch (_) {}
  }

  const sess = getAxisExtensionSession(id);
  try {
    await sess.clearStorageData();
    await sess.clearCache();
    await sess.clearAuthCache();
    await sess.clearHostResolverCache();
  } catch (_) {}

  axisVaultByProfile.delete(id);

  if (axisProfileStores.has(id)) {
    axisProfileStores.delete(id);
  }

  const profiles = listAxisProfiles().filter((p) => p.id !== id);
  saveAxisProfiles(profiles);
  broadcastProfilesUpdated();

  const remaining = BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed() && w.__axisIsIncognito !== true);
  if (remaining.length === 0) {
    createWindow({ profileId: AXIS_DEFAULT_PROFILE_ID });
  }

  return { ok: true, trashId: trashEntry.trashId, profileId: id, profileName: trashEntry.name };
}

function ensureAxisProfile(profileId, displayName, icon) {
  const id = sanitizeProfileId(profileId);
  const profiles = listAxisProfiles();
  const exists = profiles.find((p) => p.id === id);
  if (!exists) {
    profiles.push({
      id,
      name: typeof displayName === 'string' && displayName.trim() ? displayName.trim() : id,
      icon: sanitizeProfileIcon(icon)
    });
    saveAxisProfiles(profiles);
  }
  getProfileStore(id);
  initializeProfileDefaults(id);
  return id;
}

function allocateProfileId(displayName) {
  const profiles = listAxisProfiles();
  const name = typeof displayName === 'string' && displayName.trim() ? displayName.trim() : 'New Profile';
  let base = sanitizeProfileId(name);
  if (!base || base === AXIS_DEFAULT_PROFILE_ID || profiles.some((p) => p.id === base)) {
    base = `profile-${Date.now().toString(36)}`;
  }
  let id = base;
  let n = 2;
  while (profiles.some((p) => p.id === id)) {
    id = `${base}-${n++}`;
  }
  return { id, name };
}

function getProfileStore(profileId) {
  const id = sanitizeProfileId(profileId);
  if (axisProfileStores.has(id)) return axisProfileStores.get(id);
  const profileStore = new Store({ name: `profile-${id}` });
  if (id === AXIS_DEFAULT_PROFILE_ID) {
    try {
      const seeded = profileStore.get('__seededFromLegacyStore', false);
      if (!seeded) {
        profileStore.set(store.store || {});
        profileStore.set('__seededFromLegacyStore', true);
        if (!profileStore.get('historyItems')) {
          profileStore.set('historyItems', historyStore.get('items', []) || []);
        }
        if (!profileStore.get('downloadItems')) {
          profileStore.set('downloadItems', downloadsStore.get('items', []) || []);
        }
        if (!profileStore.get('noteItems')) {
          profileStore.set('noteItems', notesStore.get('items', []) || []);
        }
        profileStore.set('__historySeeded', true);
      }
    } catch (_) {}
  }
  initializeProfileDefaults(id, profileStore);
  axisProfileStores.set(id, profileStore);
  return profileStore;
}

function initializeProfileDefaults(profileId, profileStore) {
  const s = profileStore || getProfileStore(profileId);
  if (s.get('__profileInitialized')) return;
  const defaults = {
    uiTheme: 'dark',
    theme: 'dark',
    accentColor: '#555',
    adBlockerEnabled: true,
    adBlockerSiteExceptions: {},
    blockTrackers: true,
    blockAds: true,
    javascriptEnabled: true,
    transparentSites: false,
    siteThemeColor: false,
    linkPreview: true,
    vaultAutofillEnabled: true,
    windowChromeLight: 50,
    sidebarZoom: 100,
    searchEngine: 'google',
    recentSearches: [],
    dismissedSuggestions: [],
    favorites: [],
    pinnedTabs: [],
    tabGroups: [],
    unpinnedTabs: [],
    unpinnedTabsRecovery: [],
    sitePermissionOverrides: {},
    historyItems: [],
    downloadItems: [],
    noteItems: [],
    ntpWelcomeEnabled: true,
    ntpWelcomeWeather: false,
    ntpWelcomeGreeting: true,
    ntpAiSearchEnabled: true,
    ntpWidgetsEnabled: false,
    ntpWidgetLayout: null,
    aiFeaturesEnabled: true,
    ntpGreetingName: 'User',
    unpinnedClearMode: 'app-close',
    unpinnedClearCustomMinutes: 60,
    ambientAudioEnabled: false,
    ambientMuteWhenTabAudio: true,
    ambientAudioPreset: 'rain',
    ambientAudioVolume: 48
  };
  for (const [key, value] of Object.entries(defaults)) {
    if (s.get(key) === undefined) s.set(key, value);
  }
  s.set('__profileInitialized', true);
}

function getProfilePartition(profileId) {
  const id = sanitizeProfileId(profileId);
  if (id === AXIS_DEFAULT_PROFILE_ID) {
    return AXIS_EXTENSION_SESSION_PARTITION;
  }
  return `persist:profile-${id}`;
}

function getProfileIdFromSession(sess) {
  if (!sess || typeof sess.getPartition !== 'function') return AXIS_DEFAULT_PROFILE_ID;
  const part = sess.getPartition();
  if (!part || part === 'incognito') return AXIS_DEFAULT_PROFILE_ID;
  if (part === AXIS_EXTENSION_SESSION_PARTITION || part === 'persist:main') {
    return AXIS_DEFAULT_PROFILE_ID;
  }
  const m = /^persist:profile-(.+)$/.exec(part);
  return m ? sanitizeProfileId(m[1]) : AXIS_DEFAULT_PROFILE_ID;
}

function getProfileSitePermissionStore(profileId) {
  return getProfileStore(profileId);
}

function getHistoryItems(profileId) {
  return getProfileStore(profileId).get('historyItems', []) || [];
}

function setHistoryItems(profileId, items) {
  getProfileStore(profileId).set('historyItems', trimProfileHistoryItems(items));
}

function getDownloadItems(profileId) {
  return getProfileStore(profileId).get('downloadItems', []) || [];
}

function setDownloadItems(profileId, items) {
  getProfileStore(profileId).set('downloadItems', Array.isArray(items) ? items : []);
}

function getNoteItems(profileId) {
  return getProfileStore(profileId).get('noteItems', []) || [];
}

function setNoteItems(profileId, items) {
  getProfileStore(profileId).set('noteItems', Array.isArray(items) ? items : []);
}

function ensureAxisVaultForProfile(profileId) {
  const id = sanitizeProfileId(profileId);
  if (!axisVaultByProfile.has(id)) {
    axisVaultByProfile.set(id, createAxisVault(app, null, id));
  }
  return axisVaultByProfile.get(id);
}

function ensureAxisVaultFromEvent(event) {
  return ensureAxisVaultForProfile(getProfileIdForEvent(event));
}

function getAxisExtensionSession(profileId = AXIS_DEFAULT_PROFILE_ID) {
  return session.fromPartition(getProfilePartition(profileId));
}

function extensionRuntimeKey(profileId, recordId) {
  return `${sanitizeProfileId(profileId)}::${recordId}`;
}

/**
 * Must match tab `<webview>` guests (`renderer.js` `getTabWebpreferencesString`) so
 * `chrome-extension://` popups run in the same kind of guest as the main browser.
 */
function getAxisExtensionPopupGuestWebpreferencesAttr() {
  return [
    'contextIsolation=false',
    'nodeIntegration=false',
    'webSecurity=true',
    'accelerated2dCanvas=true',
    'enableWebGL=true',
    'enableWebGL2=true',
    'enableGpuRasterization=true',
    'enableZeroCopy=false',
    'enableHardwareAcceleration=true',
    'backgroundThrottling=true',
    'offscreen=false',
    'spellcheck=yes'
  ].join(',');
}

/** Load popup inside a guest webview (reliable); plain `loadURL(chrome-extension:)` on the window often stays blank / never `ready-to-show`. */
function buildAxisExtensionPopupBridgeDataUrl(popupUrl) {
  if (!popupUrl || typeof popupUrl !== 'string') {
    throw new Error('Invalid extension popup URL');
  }
  let parsed;
  try {
    parsed = new URL(popupUrl);
  } catch (_) {
    throw new Error('Invalid extension popup URL');
  }
  if (parsed.protocol !== 'chrome-extension:') {
    throw new Error('Invalid extension popup URL');
  }
  const srcEsc = String(popupUrl)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const wp = getAxisExtensionPopupGuestWebpreferencesAttr().replace(/"/g, '&quot;');
  const html =
    '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    'script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; ' +
    'child-src chrome-extension:; frame-src chrome-extension:;">' +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#f5f5f5;color:#1f1f1f;font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif}' +
    'webview{display:flex;width:100%;height:100%;border:0;background:transparent}' +
    '#axis-ext-status{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;box-sizing:border-box;color:#555;background:#f5f5f5}' +
    '#axis-ext-status.hidden{display:none}</style></head><body>' +
    '<div id="axis-ext-status">Loading extension…</div>' +
    `<webview src="${srcEsc}" partition="${AXIS_EXTENSION_SESSION_PARTITION}" allowpopups ` +
    `webpreferences="${wp}"></webview>` +
    '<script>(function(){var status=document.getElementById("axis-ext-status");var wv=document.querySelector("webview");function hide(){if(status)status.className="hidden";}function fail(e){if(!status)return;var msg=e&&e.errorDescription?e.errorDescription:"Could not load this extension popup.";status.className="";status.textContent=msg;}if(wv){wv.addEventListener("dom-ready",hide);wv.addEventListener("did-finish-load",hide);wv.addEventListener("did-fail-load",fail);setTimeout(function(){try{if(wv.getURL&&wv.getURL())hide();}catch(e){}},1200);}})();</script>' +
    '</body></html>';
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function attachAxisExtensionPopupShowHandlers(popupWin) {
  let shown = false;
  const reveal = () => {
    if (shown || popupWin.isDestroyed()) return;
    shown = true;
    try {
      popupWin.show();
      popupWin.focus();
    } catch (_) {
      /* ignore */
    }
  };
  popupWin.once('ready-to-show', reveal);
  popupWin.webContents.once('did-finish-load', () => {
    setImmediate(reveal);
  });
  popupWin.webContents.on('did-fail-load', (_event, _code, _desc, _url, isMainFrame) => {
    if (isMainFrame) reveal();
  });
  setTimeout(reveal, 2000);
}

function getAxisExtensionsDir() {
  return path.join(app.getPath('userData'), 'extensions');
}

function getAxisExtensionRuntimeDir() {
  return path.join(app.getPath('userData'), 'extension-runtime');
}

function makeExtensionRecordId(name) {
  const base = String(name || 'extension')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'extension';
  return `${base}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Infer Chrome Web Store / AMO listing token saved on install (backfill for older records). */
function inferStoreListingTokenForRecord(record) {
  if (!record || typeof record !== 'object') return '';
  const existing = String(record.storeListingToken || '').trim();
  if (existing) return existing;
  const extId = String(record.extensionId || '').trim().toLowerCase();
  if (/^[a-p]{32}$/.test(extId)) return extId;
  return '';
}

function normalizeStoredAxisExtensions(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const raw = getProfileStore(pid).get(AXIS_EXTENSIONS_STORE_KEY, []);
  const list = Array.isArray(raw) ? raw.filter((x) => x && typeof x === 'object') : [];
  let changed = false;
  const out = list.map((rec) => {
    const token = inferStoreListingTokenForRecord(rec);
    if (!token || token === String(rec.storeListingToken || '').trim()) return rec;
    changed = true;
    return { ...rec, storeListingToken: token };
  });
  if (changed) setStoredAxisExtensions(pid, out);
  return out;
}

function getStoredAxisExtensions(profileId = AXIS_DEFAULT_PROFILE_ID) {
  return normalizeStoredAxisExtensions(profileId);
}

function setStoredAxisExtensions(profileId, list) {
  getProfileStore(profileId).set(AXIS_EXTENSIONS_STORE_KEY, Array.isArray(list) ? list : []);
}

function getExtensionRuntimeState(profileId, recordId) {
  return axisExtensionRuntime.get(extensionRuntimeKey(profileId, recordId)) || {};
}

function setExtensionRuntimeState(profileId, recordId, state) {
  axisExtensionRuntime.set(extensionRuntimeKey(profileId, recordId), state);
}

function deleteExtensionRuntimeState(profileId, recordId) {
  axisExtensionRuntime.delete(extensionRuntimeKey(profileId, recordId));
}

async function readAxisExtensionManifest(extensionPath) {
  const manifestPath = path.join(extensionPath, 'manifest.json');
  const text = await fs.promises.readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(text);
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('Invalid manifest.json');
  }
  if (!manifest.name || !manifest.version || !manifest.manifest_version) {
    throw new Error('manifest.json must include name, version, and manifest_version');
  }
  return manifest;
}

function getAxisManifestText(value, fallback = '') {
  if (typeof value === 'string' && value.trim()) return value.trim();
  return fallback;
}

/** Chrome manifest i18n placeholder, e.g. `__MSG_extName__`. */
const AXIS_MANIFEST_I18N_RE = /^__MSG_([A-Za-z0-9@_]+)__$/;

function parseManifestI18nKey(value) {
  if (typeof value !== 'string') return null;
  const m = value.trim().match(AXIS_MANIFEST_I18N_RE);
  return m ? m[1] : null;
}

const axisExtensionI18nMessagesCache = new Map();

function lookupI18nMessageEntry(messages, key) {
  if (!messages || !key) return '';
  const entry = messages[key];
  if (!entry) return '';
  if (typeof entry === 'string') return entry.trim();
  if (entry && typeof entry.message === 'string') return entry.message.trim();
  return '';
}

function normalizeExtensionLocaleTag(tag) {
  return String(tag || '')
    .trim()
    .replace(/-/g, '_')
    .toLowerCase();
}

function resolveExtensionLocaleDir(requested, availableDirs) {
  const want = normalizeExtensionLocaleTag(requested);
  if (!want) return null;
  return availableDirs.find((d) => normalizeExtensionLocaleTag(d) === want) || null;
}

async function loadExtensionI18nMessages(extensionPath, manifest) {
  const localesRoot = path.join(extensionPath, '_locales');
  let available = [];
  try {
    const entries = await fs.promises.readdir(localesRoot, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const msgPath = path.join(localesRoot, ent.name, 'messages.json');
      try {
        await fs.promises.access(msgPath);
        available.push(ent.name);
      } catch (_) {
        /* no messages.json */
      }
    }
  } catch (_) {
    return null;
  }
  if (available.length === 0) return null;

  const tryOrder = [];
  const def = typeof manifest?.default_locale === 'string' ? manifest.default_locale.trim() : '';
  if (def) tryOrder.push(def);
  for (const loc of ['en', 'en_US', 'en_GB', 'en-US', 'en-GB']) {
    if (!tryOrder.some((x) => normalizeExtensionLocaleTag(x) === normalizeExtensionLocaleTag(loc))) {
      tryOrder.push(loc);
    }
  }
  for (const loc of available) {
    if (!tryOrder.some((x) => normalizeExtensionLocaleTag(x) === normalizeExtensionLocaleTag(loc))) {
      tryOrder.push(loc);
    }
  }

  for (const localeTag of tryOrder) {
    const localeDir = resolveExtensionLocaleDir(localeTag, available);
    if (!localeDir) continue;
    try {
      const text = await fs.promises.readFile(
        path.join(localesRoot, localeDir, 'messages.json'),
        'utf8'
      );
      const data = JSON.parse(text);
      if (data && typeof data === 'object') return data;
    } catch (_) {
      /* try next locale */
    }
  }
  return null;
}

async function getExtensionI18nMessages(extensionPath, manifest) {
  const key = extensionPath || '';
  if (axisExtensionI18nMessagesCache.has(key)) {
    return axisExtensionI18nMessagesCache.get(key);
  }
  const messages = await loadExtensionI18nMessages(extensionPath, manifest);
  axisExtensionI18nMessagesCache.set(key, messages);
  return messages;
}

async function resolveAxisManifestString(raw, extensionPath, manifest, fallback = '') {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return fallback;
  const i18nKey = parseManifestI18nKey(text);
  if (!i18nKey || !extensionPath) return text;
  const messages = await getExtensionI18nMessages(extensionPath, manifest);
  let resolved = lookupI18nMessageEntry(messages, i18nKey);
  if (!resolved && i18nKey.includes('@')) {
    resolved = lookupI18nMessageEntry(messages, i18nKey.split('@')[0]);
  }
  if (resolved) return resolved;
  if (i18nKey) return fallback;
  return text;
}

/** Fix stored/display fields that still contain `__MSG_*__` after install or from older Axis versions. */
async function hydrateExtensionRecordManifestStrings(record, profileId = AXIS_DEFAULT_PROFILE_ID) {
  if (!record?.path) return record;
  const needsName = !!parseManifestI18nKey(record.name);
  const needsDesc = !!parseManifestI18nKey(record.description);
  if (!needsName && !needsDesc) return record;
  try {
    const manifest = await readAxisExtensionManifest(record.path);
    let name = record.name;
    let description = record.description;
    if (needsName) {
      name = await resolveAxisManifestString(record.name, record.path, manifest, 'Extension');
    }
    if (needsDesc) {
      description = await resolveAxisManifestString(record.description, record.path, manifest, '');
    }
    if (name === record.name && description === record.description) return record;
    const pid = sanitizeProfileId(profileId);
    const all = getStoredAxisExtensions(pid);
    const idx = all.findIndex((x) => x.id === record.id);
    if (idx >= 0) {
      all[idx] = { ...all[idx], name, description };
      setStoredAxisExtensions(pid, all);
    }
    return { ...record, name, description };
  } catch (_) {
    return record;
  }
}

function getAxisExtensionOptionsPage(manifest) {
  const page = manifest?.options_ui?.page || manifest?.options_page || '';
  return typeof page === 'string' ? page.replace(/^\/+/, '') : '';
}

function getAxisExtensionDefaultPopup(manifest) {
  if (!manifest || typeof manifest !== 'object') return '';
  const action = manifest.action;
  if (action && typeof action.default_popup === 'string' && action.default_popup.trim()) {
    return action.default_popup.replace(/^\/+/, '');
  }
  const ba = manifest.browser_action;
  if (ba && typeof ba.default_popup === 'string' && ba.default_popup.trim()) {
    return ba.default_popup.replace(/^\/+/, '');
  }
  const pa = manifest.page_action;
  if (pa && typeof pa.default_popup === 'string' && pa.default_popup.trim()) {
    return pa.default_popup.replace(/^\/+/, '');
  }
  return '';
}

function getAxisExtensionIconUrl(extensionPath, manifest) {
  const icons = manifest && manifest.icons && typeof manifest.icons === 'object' ? manifest.icons : null;
  if (!icons) return '';
  const sizes = Object.keys(icons)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => b - a);
  for (const size of sizes) {
    const rel = icons[String(size)];
    if (typeof rel !== 'string') continue;
    const iconPath = path.join(extensionPath, rel);
    try {
      if (fs.existsSync(iconPath)) return pathToFileURL(iconPath).toString();
    } catch (_) {}
  }
  return '';
}

function convertMv3WebAccessibleResources(resources) {
  if (!Array.isArray(resources)) return resources;
  const out = [];
  for (const entry of resources) {
    if (typeof entry === 'string') {
      out.push(entry);
    } else if (entry && typeof entry === 'object' && Array.isArray(entry.resources)) {
      out.push(...entry.resources.filter((x) => typeof x === 'string'));
    }
  }
  return Array.from(new Set(out));
}

function getAxisExtensionApiShimSource() {
  return `
(function () {
  var root = typeof globalThis !== 'undefined' ? globalThis : self;
  var chromeObj = root.chrome = root.chrome || {};
  function eventStub() {
    return {
      addListener: function () {},
      removeListener: function () {},
      hasListener: function () { return false; }
    };
  }
  function noop() {
    var cb = arguments.length ? arguments[arguments.length - 1] : null;
    if (typeof cb === 'function') setTimeout(function () { cb(); }, 0);
  }
  chromeObj.action = chromeObj.action || {};
  ['setIcon', 'setBadgeText', 'setBadgeBackgroundColor', 'setTitle', 'setPopup', 'enable', 'disable'].forEach(function (key) {
    if (typeof chromeObj.action[key] !== 'function') chromeObj.action[key] = noop;
  });
  chromeObj.browserAction = chromeObj.browserAction || chromeObj.action;
  chromeObj.contextMenus = chromeObj.contextMenus || {};
  ['create', 'update', 'remove', 'removeAll'].forEach(function (key) {
    if (typeof chromeObj.contextMenus[key] !== 'function') chromeObj.contextMenus[key] = noop;
  });
  chromeObj.contextMenus.onClicked = chromeObj.contextMenus.onClicked || eventStub();
  chromeObj.scripting = chromeObj.scripting || {};
  if (typeof chromeObj.scripting.executeScript !== 'function') {
    chromeObj.scripting.executeScript = function (_details, callback) {
      if (typeof callback === 'function') setTimeout(function () { callback([]); }, 0);
      return Promise.resolve([]);
    };
  }
  if (typeof chromeObj.scripting.insertCSS !== 'function') chromeObj.scripting.insertCSS = noop;
  if (typeof chromeObj.scripting.removeCSS !== 'function') chromeObj.scripting.removeCSS = noop;
  chromeObj.fontSettings = chromeObj.fontSettings || {};
  if (typeof chromeObj.fontSettings.getFontList !== 'function') {
    chromeObj.fontSettings.getFontList = function (callback) {
      if (typeof callback === 'function') setTimeout(function () { callback([]); }, 0);
    };
  }
  chromeObj.windows = chromeObj.windows || {};
  if (typeof chromeObj.windows.getAll !== 'function') {
    chromeObj.windows.getAll = function (_query, callback) {
      if (typeof _query === 'function') callback = _query;
      if (typeof callback === 'function') setTimeout(function () { callback([]); }, 0);
    };
  }
  if (typeof chromeObj.windows.update !== 'function') chromeObj.windows.update = noop;
  if (typeof chromeObj.windows.create !== 'function') chromeObj.windows.create = noop;
  if (chromeObj.runtime && typeof chromeObj.runtime.setUninstallURL !== 'function') {
    chromeObj.runtime.setUninstallURL = noop;
  }
})();`;
}

async function prepareAxisExtensionLoadPath(record, manifest) {
  if (!record?.path || !manifest || manifest.manifest_version !== 3) {
    return record?.path || '';
  }
  const serviceWorker = manifest.background?.service_worker;
  const hasAction = manifest.action && typeof manifest.action === 'object';
  const needsCompat = !!serviceWorker || hasAction || Array.isArray(manifest.host_permissions);
  if (!needsCompat) return record.path;

  const runtimeRoot = getAxisExtensionRuntimeDir();
  const safeId = String(record.id || 'extension').replace(/[^a-zA-Z0-9._-]/g, '-');
  const compatPath = path.join(runtimeRoot, safeId);
  await fs.promises.rm(compatPath, { recursive: true, force: true }).catch(() => {});
  await fs.promises.mkdir(runtimeRoot, { recursive: true });
  await fs.promises.cp(record.path, compatPath, {
    recursive: true,
    force: true,
    errorOnExist: false
  });

  const compatManifest = { ...manifest, manifest_version: 2 };
  const shimFile = 'axis_extension_api_shim.js';
  await fs.promises.writeFile(path.join(compatPath, shimFile), getAxisExtensionApiShimSource(), 'utf8');

  if (manifest.action && typeof manifest.action === 'object') {
    compatManifest.browser_action = {
      ...(manifest.browser_action && typeof manifest.browser_action === 'object' ? manifest.browser_action : {}),
      ...manifest.action
    };
  }
  delete compatManifest.action;

  const unsupportedMv2Permissions = new Set(['scripting', 'fontSettings', 'contextMenus']);
  const permissions = new Set(
    (Array.isArray(manifest.permissions) ? manifest.permissions : []).filter(
      (p) => typeof p === 'string' && !unsupportedMv2Permissions.has(p)
    )
  );
  if (Array.isArray(manifest.host_permissions)) {
    for (const p of manifest.host_permissions) {
      if (typeof p === 'string') permissions.add(p);
    }
  }
  compatManifest.permissions = Array.from(permissions);
  delete compatManifest.host_permissions;

  const optionalPermissions = new Set(
    (Array.isArray(manifest.optional_permissions) ? manifest.optional_permissions : []).filter(
      (p) => typeof p === 'string' && !unsupportedMv2Permissions.has(p)
    )
  );
  if (Array.isArray(manifest.optional_host_permissions)) {
    for (const p of manifest.optional_host_permissions) {
      if (typeof p === 'string') optionalPermissions.add(p);
    }
  }
  delete compatManifest.optional_permissions;
  if (optionalPermissions.size > 0) {
    compatManifest.optional_permissions = Array.from(optionalPermissions);
  }
  delete compatManifest.optional_host_permissions;

  if (Array.isArray(manifest.web_accessible_resources)) {
    compatManifest.web_accessible_resources = convertMv3WebAccessibleResources(
      manifest.web_accessible_resources
    );
  }
  if (Array.isArray(manifest.content_scripts)) {
    compatManifest.content_scripts = manifest.content_scripts.map((script) => {
      if (!script || typeof script !== 'object') return script;
      const copy = { ...script };
      delete copy.world;
      return copy;
    });
  }

  if (serviceWorker) {
    if (manifest.background?.type === 'module') {
      const bgPage = '__axis_mv3_background__.html';
      await fs.promises.writeFile(
        path.join(compatPath, bgPage),
        `<!doctype html><meta charset="utf-8"><script src="${shimFile}"></script><script type="module" src="${String(serviceWorker).replace(/"/g, '&quot;')}"></script>`,
        'utf8'
      );
      compatManifest.background = { page: bgPage, persistent: false };
    } else {
      compatManifest.background = { scripts: [shimFile, serviceWorker], persistent: false };
    }
  } else if (manifest.background?.scripts && Array.isArray(manifest.background.scripts)) {
    compatManifest.background = {
      ...manifest.background,
      scripts: [shimFile, ...manifest.background.scripts]
    };
  }

  if (
    compatManifest.content_security_policy &&
    typeof compatManifest.content_security_policy === 'object'
  ) {
    compatManifest.content_security_policy =
      compatManifest.content_security_policy.extension_pages ||
      "script-src 'self'; object-src 'self'";
  }

  await fs.promises.writeFile(
    path.join(compatPath, 'manifest.json'),
    JSON.stringify(compatManifest, null, 2),
    'utf8'
  );
  return compatPath;
}

function parseChromeWebStoreExtensionId(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const compact = s.replace(/\s+/g, '');
  const onlyId = /^([a-p]{32})$/i.exec(compact);
  if (onlyId) return onlyId[1].toLowerCase();
  try {
    const u = new URL(compact.includes('://') ? compact : `https://${compact}`);
    const parts = u.pathname.split('/').filter(Boolean);
    for (let i = parts.length - 1; i >= 0; i--) {
      const seg = parts[i];
      if (seg && /^[a-p]{32}$/i.test(seg)) return seg.toLowerCase();
    }
  } catch (_) {}
  return null;
}

/** Mozilla Add-ons slug / numeric id from URL or plain slug (not used for 32-char Chrome IDs — caller handles that first). */
function parseFirefoxAmoAddonKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const compact = s.replace(/\s+/g, '');
  try {
    const u = new URL(compact.includes('://') ? compact : `https://${compact}`);
    const host = (u.hostname || '').replace(/^www\./i, '').toLowerCase();
    if (host === 'addons.mozilla.org') {
      const parts = u.pathname.split('/').filter(Boolean);
      const ai = parts.indexOf('addon');
      if (ai >= 0 && parts[ai + 1]) {
        const key = decodeURIComponent(parts[ai + 1]);
        if (key && /^[a-zA-Z0-9._-]+$/.test(key)) return key;
      }
    }
  } catch (_) {
    /* ignore */
  }
  if (/[:/]/i.test(compact)) return null;
  if (/^[a-p]{32}$/i.test(compact)) return null;
  if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,249}$/.test(compact)) return compact;
  return null;
}

async function fetchXpiBufferForFirefoxAmo(addonKey) {
  const key = String(addonKey || '').trim();
  if (!key) throw new Error('Invalid Firefox add-on');
  const apiUrl = `https://addons.mozilla.org/api/v5/addons/addon/${encodeURIComponent(key)}/`;
  const res = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `AxisBrowser/${app.getVersion?.() || '1.0'}`
    }
  });
  if (!res.ok) {
    throw new Error(
      `Mozilla Add-ons API error (${res.status}). Check the add-on URL or slug — the listing may be missing or restricted.`
    );
  }
  const data = await res.json();
  const fileUrl = data?.current_version?.file?.url;
  if (!fileUrl || typeof fileUrl !== 'string') {
    throw new Error('This add-on has no public file URL (it may be Android-only or not approved).');
  }
  const xpiRes = await fetch(fileUrl, {
    redirect: 'follow',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      Accept: 'application/x-xpinstall,*/*'
    }
  });
  if (!xpiRes.ok) {
    throw new Error(`XPI download failed (${xpiRes.status}). Try again or install an unpacked copy.`);
  }
  const buf = Buffer.from(await xpiRes.arrayBuffer());
  if (buf.length < 200) {
    throw new Error('Download was too small — the add-on file may be unavailable.');
  }
  return buf;
}

async function installAxisExtensionFromXpiBuffer(
  xpiBuffer,
  profileId = AXIS_DEFAULT_PROFILE_ID,
  storeListingToken = ''
) {
  const tempRoot = path.join(os.tmpdir(), `axis-ext-xpi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const unpackedDir = path.join(tempRoot, 'unpacked');
  await fs.promises.mkdir(unpackedDir, { recursive: true });
  try {
    const zip = new AdmZip(xpiBuffer);
    zip.extractAllTo(unpackedDir, true);
    return await commitAxisExtensionInstall(unpackedDir, profileId, {
      storeListingToken
    });
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function installExtensionFromStoreUrlOrId(rawInput, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const s = String(rawInput || '').trim();
  const compact = s.replace(/\s+/g, '');
  const listingToken = resolveStoreListingTokenForInput(rawInput);

  if (/addons\.mozilla\.org/i.test(s)) {
    const mozKey = parseFirefoxAmoAddonKey(rawInput);
    if (!mozKey) {
      throw new Error('Could not read the add-on slug from this Mozilla Add-ons URL.');
    }
    const xpi = await fetchXpiBufferForFirefoxAmo(mozKey);
    return installAxisExtensionFromXpiBuffer(xpi, pid, listingToken || `amo:${mozKey.toLowerCase()}`);
  }

  if (/^[a-p]{32}$/i.test(compact)) {
    const crx = await fetchCrxBufferForExtensionId(compact.toLowerCase());
    return installAxisExtensionFromCrxBuffer(crx, pid, listingToken || compact.toLowerCase());
  }

  const firefoxKey = parseFirefoxAmoAddonKey(rawInput);
  if (firefoxKey) {
    const xpi = await fetchXpiBufferForFirefoxAmo(firefoxKey);
    return installAxisExtensionFromXpiBuffer(xpi, pid, listingToken || `amo:${firefoxKey.toLowerCase()}`);
  }

  return installAxisExtensionFromChromeWebStoreInput(rawInput, pid, listingToken);
}

/** CRX2 / CRX3: payload after header is a ZIP of the unpacked extension. */
function extractZipPayloadFromCrx(crxBuffer) {
  if (!Buffer.isBuffer(crxBuffer) || crxBuffer.length < 16) {
    throw new Error('Invalid .crx file (too small)');
  }
  const magic = crxBuffer.toString('utf8', 0, 4);
  if (magic !== 'Cr24') {
    throw new Error('Not a Chrome extension package (.crx). Expected Cr24 header.');
  }
  const ver = crxBuffer.readUInt32LE(4);
  let zipStart;
  if (ver === 2) {
    const keySize = crxBuffer.readUInt32LE(8);
    const sigSize = crxBuffer.readUInt32LE(12);
    zipStart = 16 + keySize + sigSize;
  } else if (ver === 3) {
    const headerSize = crxBuffer.readUInt32LE(8);
    zipStart = 12 + headerSize;
  } else {
    throw new Error(`Unsupported CRX version (${ver}). Try installing unpacked instead.`);
  }
  if (zipStart >= crxBuffer.length) {
    throw new Error('Invalid .crx layout');
  }
  return crxBuffer.subarray(zipStart);
}

async function fetchCrxBufferForExtensionId(extensionId) {
  const id = String(extensionId || '').toLowerCase();
  if (!/^[a-p]{32}$/.test(id)) {
    throw new Error('Invalid extension ID');
  }
  const chromeVer = process.versions.chrome || '131.0.0.0';
  const params = new URLSearchParams({
    response: 'redirect',
    prodversion: chromeVer,
    acceptformat: 'crx2,crx3',
    x: `id=${id}&installsource=ondemand&uc`
  });
  const url = `https://clients2.google.com/service/update2/crx?${params.toString()}`;
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeVer} Safari/537.36`,
      'Accept': '*/*'
    }
  });
  if (!res.ok) {
    throw new Error(
      `Chrome Web Store download failed (${res.status}). The extension may be restricted, region-blocked, or the ID may be wrong.`
    );
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) {
    throw new Error('Download was too small. Google may have refused this request — try Install .crx or unpacked.');
  }
  return buf;
}

/** Chrome Web Store id or `amo:slug` for matching store listing pages to installed add-ons. */
function resolveStoreListingTokenForInput(rawInput) {
  const s = String(rawInput || '').trim();
  if (/addons\.mozilla\.org/i.test(s)) {
    const mozKey = parseFirefoxAmoAddonKey(rawInput);
    return mozKey ? `amo:${mozKey.toLowerCase()}` : null;
  }
  const compact = s.replace(/\s+/g, '');
  if (/^[a-p]{32}$/i.test(compact)) return compact.toLowerCase();
  const firefoxKey = parseFirefoxAmoAddonKey(rawInput);
  if (firefoxKey) return `amo:${firefoxKey.toLowerCase()}`;
  const extId = parseChromeWebStoreExtensionId(rawInput);
  return extId || null;
}

async function commitAxisExtensionInstall(sourceDir, profileId = AXIS_DEFAULT_PROFILE_ID, opts = {}) {
  const pid = sanitizeProfileId(profileId);
  const manifest = await readAxisExtensionManifest(sourceDir);
  const displayName = await resolveAxisManifestString(
    manifest.name,
    sourceDir,
    manifest,
    'Extension'
  );
  const displayDescription = await resolveAxisManifestString(
    manifest.description,
    sourceDir,
    manifest,
    ''
  );
  await fs.promises.mkdir(getAxisExtensionsDir(), { recursive: true });
  const id = makeExtensionRecordId(displayName);
  const destPath = path.join(getAxisExtensionsDir(), id);
  await fs.promises.cp(sourceDir, destPath, {
    recursive: true,
    errorOnExist: false,
    force: true
  });
  axisExtensionI18nMessagesCache.set(destPath, await getExtensionI18nMessages(sourceDir, manifest));
  const storeListingToken =
    typeof opts.storeListingToken === 'string' ? opts.storeListingToken.trim() : '';
  const record = {
    id,
    extensionId: '',
    name: displayName,
    version: getAxisManifestText(manifest.version),
    description: displayDescription,
    manifestVersion: manifest.manifest_version,
    enabled: true,
    path: destPath,
    iconUrl: getAxisExtensionIconUrl(destPath, manifest),
    optionsPage: getAxisExtensionOptionsPage(manifest),
    popupPage: getAxisExtensionDefaultPopup(manifest),
    installedAt: Date.now(),
    storeListingToken: storeListingToken || ''
  };
  const all = getStoredAxisExtensions(pid);
  all.push(record);
  setStoredAxisExtensions(pid, all);
  const loaded = await loadAxisExtensionRecord(record, pid);
  if (loaded.error) {
    await fs.promises.rm(destPath, { recursive: true, force: true }).catch(() => {});
    setStoredAxisExtensions(pid, getStoredAxisExtensions(pid).filter((x) => x.id !== id));
    throw new Error(loaded.error);
  }
  broadcastSettingsUpdated(pid);
  try {
    createMenu();
  } catch (_) {}
  return { extension: loaded, extensions: await listAxisExtensions(pid) };
}

async function installAxisExtensionFromCrxBuffer(
  crxBuffer,
  profileId = AXIS_DEFAULT_PROFILE_ID,
  storeListingToken = ''
) {
  const zipBuf = extractZipPayloadFromCrx(crxBuffer);
  const tempRoot = path.join(os.tmpdir(), `axis-ext-crx-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const unpackedDir = path.join(tempRoot, 'unpacked');
  await fs.promises.mkdir(unpackedDir, { recursive: true });
  try {
    const zip = new AdmZip(zipBuf);
    zip.extractAllTo(unpackedDir, true);
    return await commitAxisExtensionInstall(unpackedDir, profileId, {
      storeListingToken
    });
  } finally {
    await fs.promises.rm(tempRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function installAxisExtensionFromChromeWebStoreInput(
  rawInput,
  profileId = AXIS_DEFAULT_PROFILE_ID,
  storeListingToken = ''
) {
  const extId = parseChromeWebStoreExtensionId(rawInput);
  if (!extId) {
    throw new Error(
      'Paste a Chrome Web Store link (chromewebstore.google.com / chrome.google.com) or the 32-character extension ID (letters a–p only).'
    );
  }
  const crx = await fetchCrxBufferForExtensionId(extId);
  return installAxisExtensionFromCrxBuffer(crx, profileId, storeListingToken || extId);
}

function toAxisExtensionView(record, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const rt = getExtensionRuntimeState(profileId, record.id);
  const loadedId = rt.loadedId || record.extensionId || '';
  const activeExtensionId = rt.loadedId || '';
  const optionsPath = record.optionsPage || '';
  const popupPath = record.popupPage || '';
  return {
    id: record.id,
    extensionId: loadedId,
    name: record.name || 'Extension',
    version: record.version || '',
    description: record.description || '',
    enabled: record.enabled !== false,
    loaded: !!rt.loadedId,
    error: rt.error || '',
    installPath: record.path || '',
    iconUrl: record.iconUrl || '',
    optionsUrl: activeExtensionId && optionsPath ? `chrome-extension://${activeExtensionId}/${optionsPath}` : '',
    popupUrl: activeExtensionId && popupPath ? `chrome-extension://${activeExtensionId}/${popupPath}` : '',
    installedAt: record.installedAt || 0,
    manifestVersion: record.manifestVersion || null,
    storeListingToken: record.storeListingToken || ''
  };
}

async function loadAxisExtensionRecord(record, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  if (!record || record.enabled === false) return toAxisExtensionView(record, pid);
  const existing = getExtensionRuntimeState(pid, record.id);
  if (existing?.loadedId) return toAxisExtensionView(record, pid);

  try {
    const manifest = await readAxisExtensionManifest(record.path);
    const loadPath = await prepareAxisExtensionLoadPath(record, manifest);
    const extSession = getAxisExtensionSession(pid);
    const loadExtension =
      extSession.extensions && typeof extSession.extensions.loadExtension === 'function'
        ? extSession.extensions.loadExtension.bind(extSession.extensions)
        : extSession.loadExtension.bind(extSession);
    const ext = await loadExtension(loadPath, {
      allowFileAccess: true
    });
    const next = {
      ...record,
      extensionId: ext.id,
      name: await resolveAxisManifestString(
        manifest.name,
        record.path,
        manifest,
        ext.name || record.name || 'Extension'
      ),
      version: getAxisManifestText(manifest.version, record.version),
      description: await resolveAxisManifestString(
        manifest.description,
        record.path,
        manifest,
        record.description || ''
      ),
      manifestVersion: manifest.manifest_version,
      optionsPage: getAxisExtensionOptionsPage(manifest),
      popupPage: getAxisExtensionDefaultPopup(manifest),
      iconUrl: getAxisExtensionIconUrl(record.path, manifest)
    };
    setExtensionRuntimeState(pid, record.id, { loadedId: ext.id, error: '' });
    const all = getStoredAxisExtensions(pid);
    const idx = all.findIndex((x) => x.id === record.id);
    if (idx >= 0) {
      all[idx] = next;
      setStoredAxisExtensions(pid, all);
    }
    return toAxisExtensionView(next, pid);
  } catch (error) {
    setExtensionRuntimeState(pid, record.id, {
      loadedId: '',
      error: error && error.message ? error.message : String(error)
    });
    return toAxisExtensionView(record, pid);
  }
}

function unloadAxisExtensionRecord(record, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  if (!record) return;
  const popupKey = extensionRuntimeKey(pid, record.id);
  const prevWin = axisExtensionPopupByRecordId.get(popupKey);
  if (prevWin && !prevWin.isDestroyed()) {
    try {
      prevWin.close();
    } catch (_) {}
    axisExtensionPopupByRecordId.delete(popupKey);
  }
  const rt = getExtensionRuntimeState(pid, record.id);
  const extensionId = rt?.loadedId || record.extensionId;
  if (extensionId) {
    try {
      getAxisExtensionSession(pid).removeExtension(extensionId);
    } catch (_) {}
  }
  setExtensionRuntimeState(pid, record.id, { loadedId: '', error: '' });
}

async function loadStoredAxisExtensionsForProfile(profileId) {
  const pid = sanitizeProfileId(profileId);
  const all = getStoredAxisExtensions(pid);
  for (const record of all) {
    await hydrateExtensionRecordManifestStrings(record, pid);
  }
  for (const record of getStoredAxisExtensions(pid)) {
    if (record.enabled === false) continue;
    await loadAxisExtensionRecord(record, pid);
  }
  broadcastExtensionsReady(pid);
}

async function loadAllProfileExtensions() {
  for (const p of listAxisProfiles()) {
    await migrateAxisExtensionPopupPagesIfNeeded(p.id);
    await loadStoredAxisExtensionsForProfile(p.id);
  }
}

async function migrateAxisExtensionPopupPagesIfNeeded(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const all = getStoredAxisExtensions(pid);
  let changed = false;
  const out = await Promise.all(
    all.map(async (rec) => {
      if (rec.popupPage !== undefined) return rec;
      changed = true;
      try {
        const manifest = await readAxisExtensionManifest(rec.path);
        return {
          ...rec,
          popupPage: getAxisExtensionDefaultPopup(manifest) || ''
        };
      } catch (_) {
        return { ...rec, popupPage: '' };
      }
    })
  );
  if (changed) setStoredAxisExtensions(pid, out);
}

async function listAxisExtensions(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const all = getStoredAxisExtensions(pid);
  const out = [];
  for (const rec of all) {
    const hydrated = await hydrateExtensionRecordManifestStrings(rec, pid);
    out.push(toAxisExtensionView(hydrated, pid));
  }
  return out;
}

/**
 * Whether this profile already has an extension from a store listing URL / token.
 * Reads persisted profile store (works immediately after app restart).
 */
async function resolveStoreListingInstallStatus(profileId, rawUrlOrToken) {
  const pid = sanitizeProfileId(profileId);
  let token = '';
  const raw = String(rawUrlOrToken || '').trim();
  if (/^amo:[a-z0-9._-]+$/i.test(raw)) {
    token = raw.toLowerCase();
  } else if (/^[a-p]{32}$/i.test(raw.replace(/\s+/g, ''))) {
    token = raw.replace(/\s+/g, '').toLowerCase();
  } else if (raw) {
    token = resolveStoreListingTokenForInput(raw) || '';
  }
  if (!token) {
    return { installed: false, token: '', name: '', version: '', extensionRecordId: '' };
  }
  const cwsId = token.startsWith('amo:') ? null : token;
  const all = getStoredAxisExtensions(pid);
  let match = null;
  for (const rec of all) {
    const listing = String(rec.storeListingToken || '').trim();
    if (listing && listing === token) {
      match = rec;
      break;
    }
    if (cwsId) {
      const extId = String(rec.extensionId || '').trim().toLowerCase();
      if (extId && extId === cwsId) {
        match = rec;
        break;
      }
    }
  }
  if (!match) {
    return { installed: false, token, name: '', version: '', extensionRecordId: '' };
  }
  const hydrated = await hydrateExtensionRecordManifestStrings(match, pid);
  const view = toAxisExtensionView(hydrated, pid);
  return {
    installed: true,
    token,
    name: view.name || '',
    version: view.version || '',
    extensionRecordId: view.id || ''
  };
}

async function installAxisExtensionFromFolder(ownerWindow, profileId) {
  const pid =
    profileId ||
    (ownerWindow && !ownerWindow.isDestroyed()
      ? sanitizeProfileId(ownerWindow.__axisProfileId)
      : AXIS_DEFAULT_PROFILE_ID);
  const dialogOptions = {
    title: 'Install Extension',
    message: 'Choose an unpacked Chrome extension folder that contains manifest.json',
    properties: ['openDirectory']
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return { canceled: true, extensions: await listAxisExtensions(pid) };
  }

  const sourcePath = result.filePaths[0];
  const out = await commitAxisExtensionInstall(sourcePath, pid);
  return { canceled: false, ...out };
}

async function installAxisExtensionFromCrxFile(ownerWindow, profileId) {
  const pid =
    profileId ||
    (ownerWindow && !ownerWindow.isDestroyed()
      ? sanitizeProfileId(ownerWindow.__axisProfileId)
      : AXIS_DEFAULT_PROFILE_ID);
  const dialogOptions = {
    title: 'Install Extension from .crx',
    message: 'Choose a Chrome extension package (.crx)',
    properties: ['openFile'],
    filters: [{ name: 'Chrome Extension', extensions: ['crx'] }, { name: 'All Files', extensions: ['*'] }]
  };
  const result = ownerWindow
    ? await dialog.showOpenDialog(ownerWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);
  if (result.canceled || !result.filePaths || !result.filePaths[0]) {
    return { canceled: true, extensions: await listAxisExtensions(pid) };
  }
  const crxBuf = await fs.promises.readFile(result.filePaths[0]);
  const out = await installAxisExtensionFromCrxBuffer(crxBuf, pid);
  return { canceled: false, ...out };
}

async function setAxisExtensionEnabled(id, enabled, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const all = getStoredAxisExtensions(pid);
  const idx = all.findIndex((x) => x.id === id);
  if (idx < 0) throw new Error('Extension not found');
  all[idx] = { ...all[idx], enabled: !!enabled };
  setStoredAxisExtensions(pid, all);
  if (enabled) {
    await loadAxisExtensionRecord(all[idx], pid);
  } else {
    unloadAxisExtensionRecord(all[idx], pid);
  }
  broadcastSettingsUpdated(pid);
  try {
    createMenu();
  } catch (_) {}
  return await listAxisExtensions(pid);
}

async function removeAxisExtension(id, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const all = getStoredAxisExtensions(pid);
  const record = all.find((x) => x.id === id);
  if (!record) throw new Error('Extension not found');
  unloadAxisExtensionRecord(record, pid);
  setStoredAxisExtensions(pid, all.filter((x) => x.id !== id));
  try {
    const root = getAxisExtensionsDir();
    const rel = path.relative(root, record.path || '');
    if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
      await fs.promises.rm(record.path, { recursive: true, force: true });
    }
  } catch (_) {}
  deleteExtensionRuntimeState(pid, id);
  broadcastSettingsUpdated(pid);
  try {
    createMenu();
  } catch (_) {}
  return await listAxisExtensions(pid);
}

async function openAxisExtensionOptions(id, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const record = getStoredAxisExtensions(pid).find((x) => x.id === id);
  if (!record) throw new Error('Extension not found');
  if (record.enabled === false) throw new Error('Enable this extension before opening its options.');
  let view = toAxisExtensionView(record, pid);
  if (record.enabled !== false && !view.loaded) {
    view = await loadAxisExtensionRecord(record, pid);
  }
  if (!view.optionsUrl) throw new Error('This extension does not provide an options page');
  openUrlInAxisBrowser(view.optionsUrl);
  return true;
}

async function openAxisExtensionPopup(id, profileId = AXIS_DEFAULT_PROFILE_ID, ownerWindow) {
  const pid = sanitizeProfileId(profileId);
  const record = getStoredAxisExtensions(pid).find((x) => x.id === id);
  if (!record) throw new Error('Extension not found');
  if (record.enabled === false) throw new Error('Enable this extension before opening its popup.');
  let view = toAxisExtensionView(record, pid);
  if (record.enabled !== false && !view.loaded) {
    view = await loadAxisExtensionRecord(record, pid);
  }
  if (!view.popupUrl) throw new Error('This extension does not provide a toolbar popup.');
  const popupKey = extensionRuntimeKey(pid, id);
  const prev = axisExtensionPopupByRecordId.get(popupKey);
  if (prev && !prev.isDestroyed()) {
    try {
      if (prev.isMinimized()) prev.restore();
      prev.show();
      prev.focus();
      return true;
    } catch (_) {
      axisExtensionPopupByRecordId.delete(popupKey);
    }
  }

  const extSession = getAxisExtensionSession(pid);
  const parentWin =
    ownerWindow && !ownerWindow.isDestroyed()
      ? ownerWindow
      : mainWindow && !mainWindow.isDestroyed()
        ? mainWindow
        : null;

  const popupWin = new BrowserWindow({
    width: 400,
    height: 560,
    minWidth: 200,
    minHeight: 120,
    show: false,
    title: view.name || 'Extension',
    icon: fs.existsSync(APP_ICON_PATH) ? APP_ICON_PATH : undefined,
    parent: parentWin || undefined,
    autoHideMenuBar: true,
    backgroundColor: '#f5f5f5',
    webPreferences: {
      session: extSession,
      contextIsolation: false,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'extension-popup-preload.js'),
      webSecurity: true,
      webviewTag: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  axisExtensionPopupByRecordId.set(popupKey, popupWin);
  popupWin.on('closed', () => {
    if (axisExtensionPopupByRecordId.get(popupKey) === popupWin) {
      axisExtensionPopupByRecordId.delete(popupKey);
    }
  });

  attachAxisExtensionPopupShowHandlers(popupWin);

  try {
    // Load extension popups as real top-level extension pages. The previous data-URL
    // bridge nested the popup in a <webview>, which opened a window but left many
    // extension UIs blank/non-interactive because popup scripts were not running in
    // the expected top-level extension page context.
    await popupWin.loadURL(view.popupUrl);
  } catch (err) {
    axisExtensionPopupByRecordId.delete(popupKey);
    if (!popupWin.isDestroyed()) {
      try {
        popupWin.close();
      } catch (_) {
        /* ignore */
      }
    }
    throw err;
  }

  return true;
}

/** Open toolbar popup when available, otherwise options — shared by macOS menu and in-app UI. */
async function openAxisExtensionPopupOrOptions(id, profileId = AXIS_DEFAULT_PROFILE_ID, ownerWindow) {
  const pid = sanitizeProfileId(profileId);
  const record = getStoredAxisExtensions(pid).find((x) => x.id === id);
  if (!record) throw new Error('Extension not found');
  if (record.enabled === false) throw new Error('Enable this extension before opening it.');
  let view = toAxisExtensionView(record, pid);
  if (record.enabled !== false && !view.loaded) {
    view = await loadAxisExtensionRecord(record, pid);
  }
  if (view.popupUrl) {
    await openAxisExtensionPopup(id, pid, ownerWindow);
    return true;
  }
  if (view.optionsUrl) {
    await openAxisExtensionOptions(id, pid);
    return true;
  }
  throw new Error('This extension does not provide a toolbar popup or options page.');
}

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

/** Notify windows for one profile (or all if profileId omitted) to reload store-backed state. */
function broadcastSettingsUpdated(profileId = null) {
  const target = profileId != null ? sanitizeProfileId(profileId) : null;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || w.__axisIsIncognito) continue;
    const winProfile = getSettingsEditingProfileIdForWindow(w) ||
      sanitizeProfileId(w.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
    if (target && winProfile !== target) continue;
    try {
      applyVibrancyToWindow(w);
      w.webContents.send('settings-updated', { profileId: winProfile });
    } catch (_) {
      /* window gone */
    }
  }
}

/** After extensions load from disk, refresh store listing UI (installed badge) in browser windows. */
function broadcastExtensionsReady(profileId = null) {
  const target = profileId != null ? sanitizeProfileId(profileId) : null;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed() || w.__axisIsIncognito) continue;
    const winProfile = sanitizeProfileId(w.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
    if (target && winProfile !== target) continue;
    try {
      w.webContents.send('axis-extensions-ready', { profileId: winProfile });
    } catch (_) {
      /* window gone */
    }
  }
}

/**
 * When the session auto-grants a permission (no per-site override), persist that
 * decision so Settings → Site permission overrides reflects reality.
 * @param {string} origin
 * @param {string} permission Electron permission id
 * @param {Record<string, unknown> | undefined} details `mediaTypes` for `media` requests
 */
function getProfileIdFromWebContents(webContents) {
  if (!webContents || webContents.isDestroyed()) return AXIS_DEFAULT_PROFILE_ID;
  try {
    return getProfileIdFromSession(webContents.session);
  } catch (_) {
    return AXIS_DEFAULT_PROFILE_ID;
  }
}

function recordSitePermissionAllowance(origin, permission, details, profileId = AXIS_DEFAULT_PROFILE_ID) {
  if (!origin || typeof origin !== 'string') return;
  const pid = sanitizeProfileId(profileId);
  const profileStore = getProfileSitePermissionStore(pid);

  if (permission === 'geolocation' || permission === 'notifications') {
    const raw = profileStore.get('sitePermissionOverrides', {});
    const base = raw && typeof raw === 'object' ? raw : {};
    const site = { ...(base[origin] || {}) };
    site[permission] = 'allow';
    const next = { ...base, [origin]: site };
    profileStore.set('sitePermissionOverrides', cleanSitePermissionOverrides(next));
    broadcastSettingsUpdated(pid);
    return;
  }

  if (permission === 'media') {
    const types = details && Array.isArray(details.mediaTypes) ? details.mediaTypes : ['video', 'audio'];
    const raw = profileStore.get('sitePermissionOverrides', {});
    const base = raw && typeof raw === 'object' ? raw : {};
    const site = { ...(base[origin] || {}) };
    if (types.length === 0) {
      site.camera = 'allow';
      site.microphone = 'allow';
    } else {
      if (types.includes('video')) site.camera = 'allow';
      if (types.includes('audio')) site.microphone = 'allow';
    }
    const next = { ...base, [origin]: site };
    profileStore.set('sitePermissionOverrides', cleanSitePermissionOverrides(next));
    broadcastSettingsUpdated(pid);
  }
}

/** @param {string|null} origin @param {string} permission Electron permission id */
function getSitePermissionDecision(origin, permission, profileId = AXIS_DEFAULT_PROFILE_ID) {
  const overrides = getProfileStore(profileId).get('sitePermissionOverrides', {});
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
  const profileId = getProfileIdFromWebContents(webContents);
  const requestingUrl = details && details.requestingUrl;
  const origin = normalizePermissionOrigin(requestingUrl);
  const decided = getSitePermissionDecision(origin, permission, profileId);
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

  const grant = allowedPermissions.includes(permission);
  if (grant) {
    try {
      recordSitePermissionAllowance(origin, permission, details, profileId);
    } catch (err) {
      console.warn('recordSitePermissionAllowance failed:', err);
    }
  }
  callback(grant);
}

function permissionCheckHandler(webContents, permission, requestingOrigin, details) {
  const profileId = getProfileIdFromWebContents(webContents);
  const origin = normalizePermissionOrigin(requestingOrigin) || requestingOrigin;
  const decided = getSitePermissionDecision(origin, permission, profileId);
  if (decided === 'deny') return false;
  if (decided === 'allow') return true;
  return true;
}

function installSessionPermissionHandlers(sess) {
  sess.setPermissionRequestHandler(permissionRequestHandler);
  sess.setPermissionCheckHandler(permissionCheckHandler);
}

const axisConfiguredSessionPartitions = new Set();
const axisThemeColorSnifferSessions = new Set();

function attachThemeColorHeaderSniffer(sess) {
  if (!sess?.webRequest?.onHeadersReceived) return;
  const key = typeof sess.getPartition === 'function' ? sess.getPartition() || 'default' : 'default';
  if (axisThemeColorSnifferSessions.has(key)) return;
  axisThemeColorSnifferSessions.add(key);
  try {
    sess.webRequest.onHeadersReceived(
      { urls: ['http://*/*', 'https://*/*'], types: ['mainFrame'] },
      (details, callback) => {
        try {
          const raw = details.responseHeaders || {};
          const themeColor =
            (raw['theme-color'] && raw['theme-color'][0]) ||
            (raw['Theme-Color'] && raw['Theme-Color'][0]);
          if (themeColor && details.url) {
            const payload = { url: details.url, color: String(themeColor).trim() };
            for (const w of BrowserWindow.getAllWindows()) {
              if (w.isDestroyed()) continue;
              try {
                w.webContents.send('axis-theme-color-header', payload);
              } catch (_) {}
            }
          }
        } catch (_) {}
        callback({ responseHeaders: details.responseHeaders });
      }
    );
  } catch (_) {}
}

function configureAxisSessionInstance(sess) {
  if (!sess) return;
  const key = typeof sess.getPartition === 'function' ? sess.getPartition() || 'default' : 'default';
  if (axisConfiguredSessionPartitions.has(key)) return;
  axisConfiguredSessionPartitions.add(key);
  try {
    installSessionPermissionHandlers(sess);
  } catch (_) {}
  try {
    configureSpellChecker(sess);
  } catch (_) {}
  try {
    installAxisPageSecurityOnSession(sess);
  } catch (_) {}
  try {
    const { installAxisShellCsp } = require('./axis-shell-csp');
    installAxisShellCsp(sess);
  } catch (_) {}
  try {
    attachDownloadActivityTracking(sess);
  } catch (_) {}
  try {
    attachThemeColorHeaderSniffer(sess);
  } catch (_) {}
  try {
    syncAdBlockerForProfile(getProfileIdFromSession(sess));
  } catch (_) {}
}

// Keep a global reference of the window object
let mainWindow;
/** Native Settings popup window (single instance; profile chosen in-app). */
let axisSettingsWindow = null;

function findSettingsWindow() {
  if (axisSettingsWindow && !axisSettingsWindow.isDestroyed()) return axisSettingsWindow;
  axisSettingsWindow =
    BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.__axisIsSettingsWindow) || null;
  return axisSettingsWindow;
}

function isSettingsGuestWebContents(webContents) {
  if (!webContents || webContents.isDestroyed()) return false;
  try {
    return String(webContents.getURL() || '').includes('settings.html');
  } catch (_) {
    return false;
  }
}

function getSettingsEditingProfileIdForWindow(win) {
  if (!win || win.isDestroyed()) return null;
  if (win.__axisIsSettingsWindow && win.__axisSettingsProfileId) {
    return sanitizeProfileId(win.__axisSettingsProfileId);
  }
  if (win.__axisSettingsEditingProfileId) {
    return sanitizeProfileId(win.__axisSettingsEditingProfileId);
  }
  return null;
}

function setSettingsEditingProfileOnWindow(win, profileId) {
  if (!win || win.isDestroyed()) return null;
  const id = sanitizeProfileId(profileId);
  const profiles = listAxisProfiles();
  if (!profiles.some((p) => p.id === id)) return null;
  if (win.__axisIsSettingsWindow) {
    win.__axisSettingsProfileId = id;
  } else {
    win.__axisSettingsEditingProfileId = id;
  }
  return id;
}
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
    } catch (_) {}
  });

  configureAxisSessionInstance(mainSession);
  try {
    configureAxisSessionInstance(session.fromPartition('persist:main'));
  } catch (_) {}
  try {
    configureAxisSessionInstance(session.fromPartition('incognito'));
  } catch (_) {}

  installAxisShellCspOnAllSessions(session);

  ensureAxisVaultForProfile(AXIS_DEFAULT_PROFILE_ID);
}

/** In-flight downloads from any Axis session — drives URL-bar ring + popup activity in renderer. */
const axisActiveDownloadItems = new Set();
const axisDownloadItemMeta = new Map();
let nextAxisDownloadSessionId = 1;
let axisDownloadProgressBroadcastTimer = null;

function getAxisAggregateDownloadProgress() {
  let received = 0;
  let total = 0;
  for (const item of axisActiveDownloadItems) {
    try {
      received += item.getReceivedBytes();
      const t = item.getTotalBytes();
      if (t > 0) total += t;
    } catch (_) {
      /* item may be destroyed */
    }
  }
  if (total <= 0) return null;
  return Math.min(1, Math.max(0, received / total));
}

function broadcastAxisDownloadActivity() {
  const active = axisActiveDownloadItems.size > 0;
  const progress = active ? getAxisAggregateDownloadProgress() : null;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w.isDestroyed()) continue;
    try {
      w.webContents.send('axis-download-activity', { active, progress });
    } catch (_) {
      /* window gone */
    }
  }
}

function scheduleAxisDownloadProgressBroadcast() {
  if (axisDownloadProgressBroadcastTimer != null) return;
  axisDownloadProgressBroadcastTimer = setTimeout(() => {
    axisDownloadProgressBroadcastTimer = null;
    broadcastAxisDownloadActivity();
  }, 80);
}

// ---------------------------------------------------------------------------
// Ad blocker (@ghostery/adblocker-electron) — network + cosmetic filters per session
// ---------------------------------------------------------------------------
let axisAdblockBlocker = null;
let axisAdblockLoadPromise = null;
const axisAdblockEnabledSessionKeys = new Set();
const axisAdblockSessionToProfile = new Map();
const axisAdblockStatsByProfile = new Map();
let axisAdblockStatsBroadcastTimer = null;

function getAdblockStatsBucket(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  if (!axisAdblockStatsByProfile.has(pid)) {
    axisAdblockStatsByProfile.set(pid, {
      totalBlocked: 0,
      byWebContents: new Map(),
    });
  }
  return axisAdblockStatsByProfile.get(pid);
}

function axisProfileIdForAdblockDetails(details) {
  try {
    const wcId = details && details.webContentsId;
    if (wcId) {
      const { webContents } = require('electron');
      const wc = webContents.fromId(wcId);
      if (wc && !wc.isDestroyed()) {
        return getProfileIdFromWebContents(wc);
      }
    }
  } catch (_) {}
  return AXIS_DEFAULT_PROFILE_ID;
}

function axisPageHostFromAdblockDetails(details) {
  try {
    const ref = details && details.referrer;
    if (ref) return new URL(ref).hostname || '';
  } catch (_) {}
  try {
    const url = details && details.url;
    if (url) return new URL(url).hostname || '';
  } catch (_) {}
  return '';
}

function axisHostFromUrl(rawUrl) {
  try {
    if (!rawUrl || typeof rawUrl !== 'string') return '';
    return new URL(rawUrl).hostname || '';
  } catch (_) {
    return '';
  }
}

function axisScheduleAdblockStatsBroadcast() {
  if (axisAdblockStatsBroadcastTimer) return;
  axisAdblockStatsBroadcastTimer = setTimeout(() => {
    axisAdblockStatsBroadcastTimer = null;
    try {
      for (const w of BrowserWindow.getAllWindows()) {
        if (!w || w.isDestroyed()) continue;
        w.webContents.send('axis-adblock-stats-updated');
      }
    } catch (_) {}
  }, 180);
}

/** Per-tab page counter — resets on each main-frame navigation (reload, new URL). */
function axisResetAdblockPageStats(profileId, webContentsId, pageUrlOrHost) {
  const wcId = Number(webContentsId) || 0;
  if (!wcId) return;
  const host =
    typeof pageUrlOrHost === 'string' && pageUrlOrHost.includes('://')
      ? axisHostFromUrl(pageUrlOrHost)
      : String(pageUrlOrHost || '').trim();
  const bucket = getAdblockStatsBucket(profileId);
  bucket.byWebContents.set(wcId, { host, count: 0 });
  axisScheduleAdblockStatsBroadcast();
}

function axisRecordAdblockBlock(details) {
  const profileId = axisProfileIdForAdblockDetails(details);
  const bucket = getAdblockStatsBucket(profileId);
  bucket.totalBlocked += 1;
  const host = axisPageHostFromAdblockDetails(details);
  const wcId = details && details.webContentsId;
  if (wcId) {
    const prev = bucket.byWebContents.get(wcId) || { host, count: 0 };
    if (host && !prev.host) prev.host = host;
    prev.count += 1;
    bucket.byWebContents.set(wcId, prev);
  }
  axisScheduleAdblockStatsBroadcast();
}

function wrapAxisAdblockStats(blocker) {
  if (!blocker || blocker._axisStatsWrapped) return;
  blocker._axisStatsWrapped = true;
  const origBefore = blocker.onBeforeRequest.bind(blocker);
  blocker.onBeforeRequest = (details, callback) => {
    if (details.resourceType === 'mainFrame' && details.webContentsId) {
      axisResetAdblockPageStats(
        axisProfileIdForAdblockDetails(details),
        details.webContentsId,
        details.url || ''
      );
    }
    const profileId = axisProfileIdForAdblockDetails(details);
    const pageHost = axisPageHostFromAdblockDetails(details);
    if (isAdblockDisabledForSite(profileId, pageHost)) {
      callback({});
      return;
    }
    origBefore(details, (result) => {
      if (result && (result.cancel === true || result.redirectURL)) {
        axisRecordAdblockBlock(details);
      }
      callback(result);
    });
  };
  const origCosmetic = blocker.onInjectCosmeticFilters.bind(blocker);
  blocker.onInjectCosmeticFilters = async (event, url, msg) => {
    try {
      const profileId = getProfileIdFromWebContents(event.sender);
      const host = new URL(url).hostname;
      if (isAdblockDisabledForSite(profileId, host)) return;
    } catch (_) {}
    return origCosmetic(event, url, msg);
  };
}

function normalizeAdblockHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return '';
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

function getAdblockSiteExceptions(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const raw = getProfileStore(profileId).get('adBlockerSiteExceptions', {});
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
}

function isAdblockDisabledForSite(profileId, hostname) {
  const h = normalizeAdblockHostname(hostname);
  if (!h) return false;
  return getAdblockSiteExceptions(profileId)[h] === true;
}

function setAdblockSiteException(profileId, hostname, disabled) {
  const h = normalizeAdblockHostname(hostname);
  if (!h) return false;
  const store = getProfileStore(profileId);
  const next = { ...getAdblockSiteExceptions(profileId) };
  if (disabled) next[h] = true;
  else delete next[h];
  store.set('adBlockerSiteExceptions', next);
  broadcastSettingsUpdated(profileId);
  return true;
}

function getAxisSessionKey(sess) {
  try {
    return sess && typeof sess.partition === 'string' ? sess.partition : '';
  } catch (_) {
    return '';
  }
}

function getAxisAdblockSessions() {
  const out = [];
  try {
    out.push(session.defaultSession);
  } catch (_) {
    return out;
  }
  try {
    out.push(session.fromPartition('persist:main'));
  } catch (_) {}
  try {
    out.push(session.fromPartition('incognito'));
  } catch (_) {}
  return out;
}

function syncAdBlockerForProfile(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  const enabled = getProfileStore(pid).get('adBlockerEnabled', true) !== false;
  const sess = getAxisExtensionSession(pid);
  const key = getAxisSessionKey(sess);
  if (key) axisAdblockSessionToProfile.set(key, pid);
  void applyAxisAdBlockerToSession(sess, enabled);
}

function syncAdBlockerFromStore() {
  syncAdBlockerForProfile(AXIS_DEFAULT_PROFILE_ID);
}

async function syncAllProfilesAdBlocker() {
  for (const p of listAxisProfiles()) {
    syncAdBlockerForProfile(p.id);
  }
  try {
    await applyAxisAdBlockerToSession(session.fromPartition('incognito'), false);
  } catch (_) {}
}

async function applyAxisAdBlockerToSession(sess, enabled) {
  if (!sess) return;
  if (!enabled) {
    if (!axisAdblockBlocker) return;
    try {
      if (axisAdblockBlocker.isBlockingEnabled(sess)) {
        axisAdblockBlocker.disableBlockingInSession(sess);
      }
      axisAdblockEnabledSessionKeys.delete(getAxisSessionKey(sess));
    } catch (_) {}
    return;
  }
  try {
    if (typeof globalThis.fetch !== 'function') {
      console.warn('Axis: ad blocker needs global fetch (Electron 39+)');
      return;
    }
    const { ElectronBlocker } = require('@ghostery/adblocker-electron');
    const fsp = fs.promises;
    const cachePath = path.join(app.getPath('userData'), 'axis-adblock-engine.bin');
    const fetchFn = globalThis.fetch.bind(globalThis);
    if (!axisAdblockLoadPromise) {
      axisAdblockLoadPromise = ElectronBlocker.fromPrebuiltAdsAndTracking(fetchFn, {
        path: cachePath,
        read: (p) => fsp.readFile(p),
        write: (p, buf) => fsp.writeFile(p, buf),
      }).catch((err) => {
        axisAdblockLoadPromise = null;
        console.error('Axis: failed to initialize ad blocker lists:', err);
        throw err;
      });
    }
    const blocker = await axisAdblockLoadPromise;
    axisAdblockBlocker = blocker;
    wrapAxisAdblockStats(blocker);
    const key = getAxisSessionKey(sess);
    if (key && !axisAdblockSessionToProfile.has(key)) {
      axisAdblockSessionToProfile.set(key, AXIS_DEFAULT_PROFILE_ID);
    }
    if (key && axisAdblockEnabledSessionKeys.has(key)) return;
    if (!blocker.isBlockingEnabled(sess)) {
      blocker.enableBlockingInSession(sess);
    }
    if (key) axisAdblockEnabledSessionKeys.add(key);
  } catch (e) {
    const msg = e && e.message ? String(e.message) : String(e);
    if (msg.includes("Attempted to register a second handler for '@ghostery/adblocker/inject-cosmetic-filters'")) {
      const key = getAxisSessionKey(sess);
      if (key) axisAdblockEnabledSessionKeys.add(key);
      return;
    }
    console.warn('Axis: enable ad blocker on session failed:', e);
  }
}

async function applyAxisAdBlockerEnabled(enabled) {
  const sessions = getAxisAdblockSessions();
  if (!enabled) {
    if (!axisAdblockBlocker) return;
    for (const s of sessions) {
      await applyAxisAdBlockerToSession(s, false);
    }
    return;
  }
  for (const s of sessions) {
    await applyAxisAdBlockerToSession(s, true);
  }
}

/**
 * Enable Chromium spellchecker on a session. macOS uses the native OS spellchecker (no
 * dictionary download); Windows/Linux uses Hunspell and downloads dictionaries from the
 * default Chromium URL — do NOT call setSpellCheckerDictionaryDownloadURL('') or downloads
 * are disabled and nothing gets flagged. Languages default to the app locale + en-US as a
 * fallback so words are flagged on first right-click in a text field.
 */
function configureSpellChecker(sess) {
  if (!sess) return;
  try {
    let langs = [];
    try {
      if (typeof sess.availableSpellCheckerLanguages !== 'undefined') {
        langs = Array.isArray(sess.availableSpellCheckerLanguages)
          ? sess.availableSpellCheckerLanguages
          : [];
      }
    } catch (_) {}
    const preferred = [];
    try {
      const locale = app.getLocale && app.getLocale();
      if (locale) {
        preferred.push(locale);
        const short = String(locale).split('-')[0];
        if (short && short !== locale) preferred.push(short);
      }
    } catch (_) {}
    if (!preferred.includes('en-US')) preferred.push('en-US');
    if (!preferred.includes('en-GB')) preferred.push('en-GB');
    const isMac = process.platform === 'darwin';
    const chosen = isMac || !langs.length
      ? preferred
      : preferred.filter((l) => langs.includes(l));
    const final = chosen.length ? chosen : ['en-US'];
    if (typeof sess.setSpellCheckerLanguages === 'function') {
      sess.setSpellCheckerLanguages(final);
    }
    if (typeof sess.setSpellCheckerEnabled === 'function') {
      sess.setSpellCheckerEnabled(true);
    }
  } catch (error) {
    console.warn('configureSpellChecker failed:', error);
  }
}

/**
 * Manual Hunspell (nspell + dictionary-en) as a workaround for a longstanding Electron
 * bug where `context-menu` params on `<webview>` guests come back with an empty
 * `misspelledWord` / `dictionarySuggestions` on macOS even when the session spell
 * checker is active. We run our own check against the same word the user right-clicked
 * on, extracted from the guest via `executeJavaScript`, and inject suggestions into
 * the native context menu from the main process.
 */
let axisSpellEngine = null;
let axisSpellEngineLoading = null;
function ensureSpellEngineLoaded() {
  if (axisSpellEngine) return Promise.resolve(axisSpellEngine);
  if (axisSpellEngineLoading) return axisSpellEngineLoading;
  axisSpellEngineLoading = new Promise((resolve) => {
    try {
      const nspell = require('nspell');
      const dictDir = path.dirname(require.resolve('dictionary-en'));
      const aff = fs.readFileSync(path.join(dictDir, 'index.aff'));
      const dic = fs.readFileSync(path.join(dictDir, 'index.dic'));
      axisSpellEngine = nspell(aff, dic);
      resolve(axisSpellEngine);
    } catch (error) {
      console.warn('[axis:spell] failed to load nspell + dictionary-en:', error);
      resolve(null);
    }
  });
  return axisSpellEngineLoading;
}

/** In-memory set of user-added dictionary words, applied on top of nspell's dictionary. */
const axisCustomDictionary = new Set();

/** True iff the nspell engine flags `word` as misspelled (after custom dictionary). */
function isWordMisspelled(word) {
  if (!word || !axisSpellEngine) return false;
  if (axisCustomDictionary.has(word) || axisCustomDictionary.has(word.toLowerCase())) return false;
  try { return !axisSpellEngine.correct(word); } catch (_) { return false; }
}

/** Top-N suggestions from the nspell engine; empty when engine is not ready. */
function getSpellSuggestions(word, max) {
  if (!word || !axisSpellEngine) return [];
  try {
    const list = axisSpellEngine.suggest(word) || [];
    return list.slice(0, max || 6);
  } catch (_) { return []; }
}

/**
 * Ask the guest WebContents for the word under the click position. Uses
 * `caretPositionFromPoint` for contenteditable / textNode targets and falls back to
 * the `<input>`/`<textarea>` `value` + `selectionStart` for form controls. The `x`
 * / `y` arguments are GUEST-local (from `context-menu` event `params.x` / `.y`).
 */
async function getWordAtGuestPoint(guest, x, y) {
  if (!guest || guest.isDestroyed()) return '';
  const px = Number.isFinite(x) ? Number(x) : 0;
  const py = Number.isFinite(y) ? Number(y) : 0;
  const js = `(function(){
    try {
      var x = ${px}, y = ${py};
      var el = document.elementFromPoint(x, y);
      var WORD = /[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF'\\-]/;
      var isWord = function(ch){ return WORD.test(ch || ''); };
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
        var v = (el.value != null ? String(el.value) : '');
        var pos = (typeof el.selectionStart === 'number') ? el.selectionStart : v.length;
        pos = Math.max(0, Math.min(v.length, pos));
        var s = pos, e = pos;
        while (s > 0 && isWord(v.charAt(s-1))) s--;
        while (e < v.length && isWord(v.charAt(e))) e++;
        return (v.substring(s, e) || '').replace(/^['\\-]+|['\\-]+$/g, '');
      }
      var range = null;
      if (typeof document.caretPositionFromPoint === 'function') {
        var p = document.caretPositionFromPoint(x, y);
        if (p && p.offsetNode) {
          range = document.createRange();
          range.setStart(p.offsetNode, p.offset);
          range.collapse(true);
        }
      } else if (typeof document.caretRangeFromPoint === 'function') {
        range = document.caretRangeFromPoint(x, y);
      }
      if (range && range.startContainer && range.startContainer.nodeType === 3) {
        var text = String(range.startContainer.textContent || '');
        var off = range.startOffset;
        var s2 = off, e2 = off;
        while (s2 > 0 && isWord(text.charAt(s2-1))) s2--;
        while (e2 < text.length && isWord(text.charAt(e2))) e2++;
        return (text.substring(s2, e2) || '').replace(/^['\\-]+|['\\-]+$/g, '');
      }
      return '';
    } catch (err) { return ''; }
  })();`;
  try {
    const word = await guest.executeJavaScript(js, true);
    return typeof word === 'string' ? word.trim() : '';
  } catch (_) {
    return '';
  }
}

/** Add a word to every known session's custom dictionary + our nspell overlay so it sticks across main + incognito. */
function addWordToAllSpellCheckerDictionaries(word) {
  const w = String(word || '').trim();
  if (!w) return false;
  axisCustomDictionary.add(w);
  axisCustomDictionary.add(w.toLowerCase());
  if (axisSpellEngine && typeof axisSpellEngine.add === 'function') {
    try { axisSpellEngine.add(w); } catch (_) {}
  }
  let added = true;
  const targets = [];
  try { targets.push(session.defaultSession); } catch (_) {}
  try { targets.push(session.fromPartition('persist:main')); } catch (_) {}
  try { targets.push(session.fromPartition('incognito')); } catch (_) {}
  for (const sess of targets) {
    if (!sess || typeof sess.addWordToSpellCheckerDictionary !== 'function') continue;
    try { sess.addWordToSpellCheckerDictionary(w); } catch (_) {}
  }
  return added;
}

/**
 * Chrome Web Store / Mozilla AMO “Add” buttons often start a guest download of `.crx` / `.xpi`.
 * Cancel so files don’t land in Downloads — Axis installs via main-process fetch + Install in Axis.
 */
function axisShouldCancelChromeExtensionPackageDownload(item) {
  try {
    const u = String(item.getURL?.() || '');
    if (!u) return false;
    if (/https?:\/\/clients2\.google\.com\/service\/update2\/crx\b/i.test(u)) return true;
    if (/https?:\/\/clients2\.google\.com\/crx\b/i.test(u)) return true;
    if (/https?:\/\/addons\.mozilla\.org\/[^?]*\/downloads\/file\//i.test(u)) return true;
    if (/https?:\/\/addons\.cdn\.mozilla\.net\//i.test(u)) return true;
    if (/https?:\/\/product-files\.mozilla\.net\//i.test(u)) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

function attachDownloadActivityTracking(sess) {
  if (!sess || typeof sess.on !== 'function') return;
  sess.on('will-download', (event, item) => {
    if (axisShouldCancelChromeExtensionPackageDownload(item)) {
      try {
        event.preventDefault();
      } catch (_) {
        /* ignore */
      }
      return;
    }
    axisActiveDownloadItems.add(item);
    axisDownloadItemMeta.set(item, {
      startedAt: Date.now(),
      axisId: nextAxisDownloadSessionId++
    });
    const onUpdated = () => scheduleAxisDownloadProgressBroadcast();
    item.on('updated', onUpdated);
    item.once('done', () => {
      try {
        item.removeListener('updated', onUpdated);
      } catch (_) {}
      axisActiveDownloadItems.delete(item);
      axisDownloadItemMeta.delete(item);
      broadcastAxisDownloadActivity();
    });
    broadcastAxisDownloadActivity();
  });
}

function listAxisActiveDownloads() {
  const out = [];
  for (const item of axisActiveDownloadItems) {
    try {
      const savePath = item.getSavePath && item.getSavePath();
      const filename = item.getFilename && item.getFilename();
      const totalBytes = item.getTotalBytes ? Number(item.getTotalBytes()) : 0;
      const receivedBytes = item.getReceivedBytes ? Number(item.getReceivedBytes()) : 0;
      const bytesPerSecond = item.getCurrentBytesPerSecond ? Number(item.getCurrentBytesPerSecond()) : 0;
      const meta = axisDownloadItemMeta.get(item) || { startedAt: Date.now(), axisId: 0 };
      const remainingBytes = totalBytes > 0 ? Math.max(0, totalBytes - receivedBytes) : 0;
      const etaSeconds = bytesPerSecond > 0 && remainingBytes > 0
        ? Math.ceil(remainingBytes / bytesPerSecond)
        : null;
      out.push({
        axisId: meta.axisId || 0,
        filename: filename || (savePath ? path.basename(savePath) : ''),
        path: savePath || '',
        totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
        receivedBytes: Number.isFinite(receivedBytes) ? receivedBytes : 0,
        bytesPerSecond: Number.isFinite(bytesPerSecond) ? bytesPerSecond : 0,
        etaSeconds: Number.isFinite(etaSeconds) ? etaSeconds : null,
        startedAt: meta.startedAt || Date.now()
      });
    } catch (_) {
      /* item may be destroyed between ticks */
    }
  }
  return out;
}

/** macOS vibrancy / Win32 acrylic for browser + Settings chrome from `windowChromeLight`. */
function applyVibrancyToWindow(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return;
  const profileId =
    browserWindow.__axisIsIncognito === true
      ? AXIS_DEFAULT_PROFILE_ID
      : sanitizeProfileId(browserWindow.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  const raw = getProfileStore(profileId).get('windowChromeLight', 50);
  const n = Number(raw);
  const solidChrome = Number.isFinite(n) ? n <= 0 : false;
  const opaqueBg = '#000000';

  if (process.platform === 'darwin') {
    try {
      if (solidChrome) {
        browserWindow.setVibrancy(null);
        browserWindow.setBackgroundColor(opaqueBg);
      } else {
        browserWindow.setVibrancy('under-window');
        browserWindow.setBackgroundColor('#00000000');
      }
    } catch (_) {
      /* ignore */
    }
    return;
  }

  if (process.platform === 'win32') {
    try {
      if (solidChrome) {
        browserWindow.setBackgroundMaterial('none');
        browserWindow.setBackgroundColor(opaqueBg);
      } else {
        browserWindow.setBackgroundMaterial('acrylic');
        browserWindow.setBackgroundColor('#00000000');
      }
    } catch (_) {
      /* ignore */
    }
  }
}

function applyMainWindowVibrancyFromStore() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  applyVibrancyToWindow(mainWindow);
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && w !== mainWindow) applyVibrancyToWindow(w);
  }
}
let isQuitConfirmed = false;
let isUserQuitting = false;

/** macOS frameless + hiddenInset: inset from the content (client) edge — must match setWindowButtonPosition docs. */
const MACOS_TRAFFIC_LIGHT_INSET = 16;
/**
 * Horizontal span of the close + minimize + zoom cluster in **points** (AppKit layout; varies slightly by OS).
 * `setWindowButtonPosition({x})` sets the **close** button's left edge (LTR). For the right sidebar we need
 * `x + cluster ≈ clientWidth − inset` so the zoom button clears the edge by the same inset as the left case.
 * 52pt was tight for Big Sur+ button sizes; ~60pt matches measured layouts on recent macOS.
 */
const MACOS_TRAFFIC_LIGHT_CLUSTER_WIDTH = 60;

/** macOS frameless + hiddenInset: traffic-light position only (`roundedCorners` = Electron default). */
const AXIS_MACOS_BROWSER_WINDOW_SHAPE =
  process.platform === 'darwin'
    ? { trafficLightPosition: { x: MACOS_TRAFFIC_LIGHT_INSET, y: MACOS_TRAFFIC_LIGHT_INSET } }
    : {};

function getBrowserWindowClientWidth(browserWindow) {
  try {
    const b = browserWindow.getContentBounds();
    if (b && Number.isFinite(b.width) && b.width > 0) return Math.round(b.width);
  } catch (_) {}
  try {
    const b = browserWindow.getBounds();
    if (b && Number.isFinite(b.width) && b.width > 0) return Math.round(b.width);
  } catch (_) {}
  return 0;
}

function positionMacTrafficLights(browserWindow, sidebarOnRight) {
  if (process.platform !== 'darwin' || !browserWindow || browserWindow.isDestroyed()) return;
  const width = getBrowserWindowClientWidth(browserWindow);
  if (width <= 0) return;
  const inset = MACOS_TRAFFIC_LIGHT_INSET;
  if (sidebarOnRight) {
    const x = Math.max(
      8,
      Math.round(width - MACOS_TRAFFIC_LIGHT_CLUSTER_WIDTH - inset)
    );
    browserWindow.setWindowButtonPosition({ x, y: inset });
  } else {
    browserWindow.setWindowButtonPosition({ x: inset, y: inset });
  }
}

function attachMacTrafficLightResize(browserWindow) {
  if (process.platform !== 'darwin' || !browserWindow) return;
  const schedule = () => {
    if (browserWindow.__axisTrafficReflowTimer) {
      clearTimeout(browserWindow.__axisTrafficReflowTimer);
    }
    browserWindow.__axisTrafficReflowTimer = setTimeout(() => {
      browserWindow.__axisTrafficReflowTimer = null;
      if (browserWindow.isDestroyed()) return;
      positionMacTrafficLights(browserWindow, !!browserWindow.__axisSidebarRight);
    }, 16);
  };
  browserWindow.on('resize', schedule);
  browserWindow.on('enter-full-screen', schedule);
  browserWindow.on('leave-full-screen', schedule);
}

/** Tell the shell to sync guest webview bounds on every frame while the OS window is dragging. */
function attachWebviewHostResizeSignals(browserWindow) {
  if (!browserWindow) return;
  const send = (channel) => {
    if (browserWindow.isDestroyed()) return;
    try {
      browserWindow.webContents.send(channel);
    } catch (_) {}
  };
  browserWindow.on('will-resize', () => send('axis-host-resize-live'));
  browserWindow.on('resize', () => send('axis-host-resize-live'));
  browserWindow.on('resized', () => send('axis-host-resize-settled'));
}

// ========== Keyboard Shortcuts (Global Functions) ==========

const AXIS_ARROW_KEY_ALIASES = {
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down'
};

const AXIS_SHORTCUT_MODIFIER_ORDER = ['Ctrl', 'Alt', 'Shift', 'Cmd'];

function normalizeShortcutKey(key) {
  if (!key || typeof key !== 'string') return key;
  if (AXIS_ARROW_KEY_ALIASES[key]) return AXIS_ARROW_KEY_ALIASES[key];
  if (key === ' ') return 'Space';
  if (key === 'Escape') return 'Esc';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

/** Canonical Electron accelerator string (ArrowLeft → Left, sorted modifiers). */
function normalizeAccelerator(accel) {
  if (!accel || typeof accel !== 'string') return accel;
  const parts = accel
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const mods = new Set();
  let key = null;
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (lower === 'cmd' || lower === 'command') {
      mods.add('Cmd');
    } else if (lower === 'commandorcontrol') {
      mods.add(process.platform === 'darwin' ? 'Cmd' : 'Ctrl');
    } else if (lower === 'ctrl' || lower === 'control') {
      mods.add('Ctrl');
    } else if (lower === 'alt' || lower === 'option') {
      mods.add('Alt');
    } else if (lower === 'shift') {
      mods.add('Shift');
    } else {
      key = normalizeShortcutKey(part);
    }
  }
  const orderedMods = AXIS_SHORTCUT_MODIFIER_ORDER.filter((m) => mods.has(m));
  if (!key) return orderedMods.join('+');
  return [...orderedMods, key].join('+');
}

function shortcutUsesArrowKey(accel) {
  if (!accel || typeof accel !== 'string') return false;
  const parts = accel.split('+');
  const key = parts[parts.length - 1];
  return key === 'Left' || key === 'Right' || key === 'Up' || key === 'Down';
}

function acceleratorFromInputEvent(input) {
  if (!input || input.type !== 'keyDown') return null;
  const parts = [];
  if (input.control) parts.push('Ctrl');
  if (input.alt) parts.push('Alt');
  if (input.shift) parts.push('Shift');
  if (process.platform === 'darwin') {
    if (input.meta) parts.push('Cmd');
  } else if (input.meta) {
    parts.push('Ctrl');
  }
  const key = normalizeShortcutKey(input.key);
  if (!key || ['Control', 'Meta', 'Alt', 'Shift'].includes(input.key)) return null;
  parts.push(key);
  return normalizeAccelerator(parts.join('+'));
}

function findShortcutActionForAccelerator(accel, shortcuts) {
  const norm = normalizeAccelerator(accel);
  if (!norm) return null;
  for (const [action, binding] of Object.entries(shortcuts || {})) {
    if (normalizeAccelerator(binding) === norm) return action;
  }
  return null;
}

function getBrowserWindowForWebContents(contents) {
  if (!contents || contents.isDestroyed?.()) return null;
  let win = BrowserWindow.fromWebContents(contents);
  if (win && !win.isDestroyed()) return win;
  try {
    const host = contents.hostWebContents;
    if (host && !host.isDestroyed()) {
      win = BrowserWindow.fromWebContents(host);
      if (win && !win.isDestroyed()) return win;
    }
  } catch (_) {}
  return getActiveAxisWindow();
}

function getProfileIdForWebContents(contents) {
  const win = getBrowserWindowForWebContents(contents);
  if (!win || win.__axisIsIncognito === true) return AXIS_DEFAULT_PROFILE_ID;
  return sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
}

function dispatchBrowserShortcutFromContents(contents, action) {
  const win = getBrowserWindowForWebContents(contents);
  if (!win || win.isDestroyed()) return;
  /*
   * Profile arrow shortcuts can arrive twice in one keypress (repeat + duplicate
   * before-input-event). Ignore the second so one shortcut never skips a profile.
   */
  if (action === 'next-profile' || action === 'previous-profile') {
    const now = Date.now();
    const last = win.__axisLastProfileShortcut;
    if (last && last.action === action && now - last.at < 500) return;
    win.__axisLastProfileShortcut = { action, at: now };
  }
  win.webContents.send('browser-shortcut', action);
}

function attachAxisArrowShortcutHandler(contents) {
  if (!contents || contents.__axisArrowShortcutAttached) return;
  let type = '';
  try {
    type = typeof contents.getType === 'function' ? contents.getType() : '';
  } catch (_) {}
  if (type !== 'window' && type !== 'webview') return;
  contents.__axisArrowShortcutAttached = true;
  contents.on('before-input-event', (event, input) => {
    const accel = acceleratorFromInputEvent(input);
    if (!accel) return;
    const shortcuts = getShortcuts(getProfileIdForWebContents(contents));
    const action = findShortcutActionForAccelerator(accel, shortcuts);
    if (!action) return;

    let contentsType = '';
    try {
      contentsType = typeof contents.getType === 'function' ? contents.getType() : '';
    } catch (_) {}

    // Cmd+Z in a guest page is consumed by the site — intercept when Axis has sidebar undo pending.
    if (action === 'recover-tab') {
      if (contentsType !== 'webview') return;
      const win = getBrowserWindowForWebContents(contents);
      if (!win || !win.__axisUndoPending) return;
      event.preventDefault();
      dispatchBrowserShortcutFromContents(contents, action);
      return;
    }

    if (!shortcutUsesArrowKey(accel)) return;

    /* One profile step per keypress — key repeat must not queue another switch. */
    if (
      input.isAutoRepeat &&
      (action === 'next-profile' || action === 'previous-profile')
    ) {
      return;
    }

    event.preventDefault();
    dispatchBrowserShortcutFromContents(contents, action);
  });
}

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
    'previous-tab': process.platform === 'darwin' ? 'Alt+Cmd+Left' : 'Ctrl+Shift+Tab',
    // Next / previous profile (Control+Cmd+arrows on macOS; Ctrl+Alt+arrows elsewhere)
    'next-profile': process.platform === 'darwin' ? 'Ctrl+Cmd+Right' : 'Ctrl+Alt+Right',
    'previous-profile': process.platform === 'darwin' ? 'Ctrl+Cmd+Left' : 'Ctrl+Alt+Left'
  };
};

/**
 * Merged active shortcuts for global registration and menus.
 * Store may set an action to null / '' / '__disabled__' to turn that shortcut off.
 */
function getActiveProfileId() {
  const win = getActiveAxisWindow();
  if (win && !win.isDestroyed() && win.__axisIsIncognito !== true && win.__axisProfileId) {
    return sanitizeProfileId(win.__axisProfileId);
  }
  return AXIS_DEFAULT_PROFILE_ID;
}

const getShortcuts = (profileId) => {
  const pid = sanitizeProfileId(profileId || getActiveProfileId());
  const defaults = getDefaultShortcuts();
  const custom = getProfileStore(pid).get('keyboardShortcuts', null);
  if (!custom) {
    const out = {};
    for (const [action, val] of Object.entries(defaults)) {
      out[action] = normalizeAccelerator(val);
    }
    return out;
  }
  const out = {};
  for (const action of Object.keys(defaults)) {
    if (Object.prototype.hasOwnProperty.call(custom, action)) {
      const val = custom[action];
      if (val !== null && val !== '' && val !== '__disabled__') {
        out[action] = normalizeAccelerator(val);
      }
    } else {
      out[action] = normalizeAccelerator(defaults[action]);
    }
  }
  for (const [action, val] of Object.entries(custom)) {
    if (!defaults[action] && val !== null && val !== '' && val !== '__disabled__') {
      out[action] = normalizeAccelerator(val);
    }
  }
  return out;
};

/** Raw user overrides (null = disabled for that action). */
const getShortcutOverrides = (profileId) =>
  getProfileStore(sanitizeProfileId(profileId || getActiveProfileId())).get('keyboardShortcuts', null) || {};

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

function getFocusedProfileMenuContext() {
  const win = getActiveAxisWindow();
  if (!win || win.isDestroyed() || win.__axisIsIncognito === true) {
    return { isIncognito: true, profileId: null, profileName: null, canManage: false };
  }
  const profileId = sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  return {
    isIncognito: false,
    profileId,
    profileName: getProfileName(profileId),
    canManage: true
  };
}

function sendProfileMenuAction(action, payload = {}) {
  const win = getActiveAxisWindow();
  if (!win || win.isDestroyed()) return;
  win.webContents.send('profile-menu-action', { action, ...payload });
}

/**
 * Switch the given window to another profile in place (same window, no new BrowserWindow).
 * @param {import('electron').BrowserWindow} win
 * @param {string} profileId
 */
async function switchProfileInBrowserWindow(win, profileId) {
  if (!win || win.isDestroyed() || win.__axisIsIncognito === true) return false;
  const id = ensureAxisProfile(profileId || AXIS_DEFAULT_PROFILE_ID);
  const oldId = sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  if (oldId === id) return true;
  const prof = listAxisProfiles().find((p) => p.id === id);
  win.__axisProfileId = id;
  win.__axisProfileName = prof?.name || id;
  rememberLastActiveProfile(id);
  refreshProfileWindowTitles(id);
  syncAdBlockerForProfile(id);
  try {
    await migrateAxisExtensionPopupPagesIfNeeded(id);
    await loadStoredAxisExtensionsForProfile(id);
  } catch (e) {
    console.error('switchProfileInBrowserWindow extensions:', e);
  }
  try {
    createMenu();
  } catch (_) {}
  return true;
}

function openOrFocusProfileWindowById(profileId, senderWebContents = null) {
  const id = ensureAxisProfile(profileId || AXIS_DEFAULT_PROFILE_ID);
  let win = null;
  if (senderWebContents && !senderWebContents.isDestroyed()) {
    win = BrowserWindow.fromWebContents(senderWebContents);
  }
  if (!win || win.isDestroyed() || win.__axisIsIncognito === true) {
    win = BrowserWindow.getFocusedWindow();
  }
  const normalWins = BrowserWindow.getAllWindows().filter(
    (w) => w && !w.isDestroyed() && w.__axisIsIncognito !== true
  );
  if (!win || win.isDestroyed() || win.__axisIsIncognito === true) {
    win = normalWins[0] || null;
  }
  if (win && !win.isDestroyed()) {
    const cur = sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
    if (cur !== id) {
      try {
        win.webContents.send('axis-switch-profile', { profileId: id, animate: true });
      } catch (_) {}
    }
    try {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    } catch (_) {}
    return win;
  }
  const created = createWindow({ profileId: id });
  if (created && !created.isDestroyed()) {
    try {
      if (created.isMinimized()) created.restore();
      created.show();
      created.focus();
    } catch (_) {}
  }
  return created;
}

function truncateProfileMenuLabel(name, max = 52) {
  const text = typeof name === 'string' && name.trim() ? name.trim() : 'Profile';
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Menu bar: Profiles → switch, create, edit, delete. */
function buildProfilesSubmenu() {
  const profiles = listAxisProfiles();
  const ctx = getFocusedProfileMenuContext();
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const items = [];

  if (ctx.isIncognito) {
    items.push({ label: 'Private browsing', enabled: false });
    items.push({ type: 'separator' });
  }

  for (const profile of profiles) {
    const isActive = !ctx.isIncognito && profile.id === ctx.profileId;
    items.push({
      label: truncateProfileMenuLabel(profile.name),
      type: 'checkbox',
      checked: isActive,
      click: () => openOrFocusProfileWindowById(profile.id)
    });
  }

  items.push({ type: 'separator' });
  items.push({
    label: 'New Profile…',
    click: () => sendProfileMenuAction('create')
  });

  if (ctx.canManage && ctx.profileId) {
    items.push({
      label: `Edit “${truncateProfileMenuLabel(ctx.profileName, 32)}”…`,
      click: () => {
        const rec = profiles.find((p) => p.id === ctx.profileId);
        sendProfileMenuAction('edit', {
          profileId: ctx.profileId,
          name: rec?.name || ctx.profileName,
          icon: rec?.icon || 'user'
        });
      }
    });
    if (ctx.profileId !== AXIS_DEFAULT_PROFILE_ID) {
      items.push({
        label: `Delete “${truncateProfileMenuLabel(ctx.profileName, 32)}”…`,
        click: () => {
          const rec = profiles.find((p) => p.id === ctx.profileId);
          sendProfileMenuAction('delete', {
            profileId: ctx.profileId,
            name: rec?.name || ctx.profileName,
            icon: rec?.icon || 'user'
          });
        }
      });
    }
  } else if (ctx.isIncognito) {
    items.push({ label: 'Edit Current Profile…', enabled: false });
    items.push({ label: 'Delete Current Profile…', enabled: false });
  }

  return items;
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
    const normalized = normalizeAccelerator(key);
    // Arrow combos are handled in-window — macOS globalShortcut often misses laptop arrow keys.
    if (shortcutUsesArrowKey(normalized)) return;
    try {
      globalShortcut.register(normalized, () => {
        const win = getActiveAxisWindow();
        if (win) {
          win.webContents.send('browser-shortcut', action);
        }
      });
    } catch (error) {
      console.error(`Failed to register shortcut ${normalized} for action ${action}:`, error);
    }
  });
};

const unregisterShortcuts = () => {
  globalShortcut.unregisterAll();
};

// Apply consolidated Chromium/Electron performance flags as early as possible
(function applyPerformanceFlags() {
  /* Ambient bed audio runs in the shell renderer; settings changes arrive via IPC
     (no user gesture in that frame), so allow autoplay without a click. */
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

  app.commandLine.appendSwitch('log-level', '3');
  app.commandLine.appendSwitch('disable-logging');

  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  app.commandLine.appendSwitch('enable-oop-rasterization');
  app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
  app.commandLine.appendSwitch('enable-partial-raster');
  app.commandLine.appendSwitch('enable-lcd-text');

  /* Allow Chromium to throttle timers/RAF when the window is occluded/minimized — lower idle CPU. */
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=1024 --max-semi-space-size=64 --no-expose-gc');

  app.commandLine.appendSwitch('renderer-process-limit', '16');
  app.commandLine.appendSwitch('max-active-webgl-contexts', '8');
  app.commandLine.appendSwitch('disable-hang-monitor');
  app.commandLine.appendSwitch('disable-background-networking');
  app.commandLine.appendSwitch('disable-default-apps');
  /* Do not pass `disable-extensions`: it breaks `session.loadExtension` / user-installed extensions. */
  app.commandLine.appendSwitch('disable-sync');
  app.commandLine.appendSwitch('disable-translate');
  app.commandLine.appendSwitch('disable-breakpad');
  app.commandLine.appendSwitch('disable-client-side-phishing-detection');
  app.commandLine.appendSwitch('disable-component-update');
  app.commandLine.appendSwitch('disable-domain-reliability');

  app.commandLine.appendSwitch('enable-tcp-fast-open');
  app.commandLine.appendSwitch('enable-quic');

  const enableFeatures = [
    'BackForwardCache',
    'CanvasOopRasterization',
    'Accelerated2dCanvas',
    'VaapiVideoDecoder',
    'WebGPU',
    'WebUIDarkMode',
    'VizDisplayCompositor',
    'UseSkiaRenderer'
  ];
  app.commandLine.appendSwitch('enable-features', enableFeatures.join(','));

  const disableFeatures = [
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
    'ViewportSegments',
    'ContentVisibility'
  ];
  app.commandLine.appendSwitch('disable-features', disableFeatures.join(','));
})();

/** macOS: `BrowserWindow` `swipe` (Trackpad › Swipe between pages). `right`→forward, `left`→back. Win/Linux: `app-command` browser-backward/forward unchanged. */
function attachAxisHostNavigationGestures(browserWindow) {
  if (!browserWindow || typeof browserWindow.on !== 'function') return;
  browserWindow.on('swipe', (_event, direction) => {
    if (browserWindow.isDestroyed()) return;
    if (direction === 'right') browserWindow.webContents.send('axis-host-nav-gesture', 'forward');
    else if (direction === 'left') browserWindow.webContents.send('axis-host-nav-gesture', 'back');
  });

  browserWindow.on('app-command', (_event, cmd) => {
    if (browserWindow.isDestroyed()) return;
    const c = String(cmd || '').toLowerCase();
    if (c === 'browser-backward') browserWindow.webContents.send('axis-host-nav-gesture', 'back');
    else if (c === 'browser-forward') browserWindow.webContents.send('axis-host-nav-gesture', 'forward');
  });
}

function getWindowHash({ incognito = false, profileId = AXIS_DEFAULT_PROFILE_ID } = {}) {
  if (incognito) return 'incognito';
  const id = sanitizeProfileId(profileId);
  const rec = listAxisProfiles().find((p) => p.id === id);
  const icon = sanitizeProfileIcon(rec?.icon);
  return `profile=${encodeURIComponent(id)}&icon=${encodeURIComponent(icon)}`;
}

function getProfileName(profileId) {
  const id = sanitizeProfileId(profileId);
  const item = listAxisProfiles().find((p) => p.id === id);
  return item?.name || (id === AXIS_DEFAULT_PROFILE_ID ? 'Personal' : id);
}

function createWindow(options = {}) {
  let profileId = options.profileId;
  if (!profileId) {
    profileId = options.useNewWindowRules
      ? resolveNewWindowProfileId(BrowserWindow.getFocusedWindow())
      : resolveStartupProfileId();
  }
  profileId = ensureAxisProfile(profileId || AXIS_DEFAULT_PROFILE_ID);
  rememberLastActiveProfile(profileId);
  const profileName = getProfileName(profileId);
  // Create the browser window with optimized settings
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: profileName === 'Personal' ? 'Axis Browser' : `Axis — ${profileName}`,
    icon: APP_ICON_PATH,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: true,
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
    ...(process.platform === 'darwin' ? AXIS_MACOS_BROWSER_WINDOW_SHAPE : {})
  });

  attachAxisHostNavigationGestures(win);

  if (process.platform === 'darwin' && win) {
    win.__axisSidebarRight = false;
    attachMacTrafficLightResize(win);
  }
  attachWebviewHostResizeSignals(win);
  win.__axisIsIncognito = false;
  win.__axisProfileId = profileId;
  win.__axisProfileName = profileName;
  win.__axisUndoPending = false;

  // Load the app
  win.loadFile('src/index.html', { hash: getWindowHash({ profileId }) });

  // Show window when ready
  win.once('ready-to-show', () => {
    if (process.platform === 'darwin' && win && !win.isDestroyed()) {
      const side = !!win.__axisSidebarRight;
      positionMacTrafficLights(win, side);
      setImmediate(() => {
        if (win && !win.isDestroyed()) positionMacTrafficLights(win, side);
      });
    }
    applyVibrancyToWindow(win);
    win.show();
    win.focus();
    // Show window controls by default (sidebar is visible)
    win.setWindowButtonVisibility(true);
    setImmediate(() => {
      syncAdBlockerForProfile(profileId);
      void loadStoredAxisExtensionsForProfile(profileId);
    });
  });

  // Handle window closed
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // Intercept close - only show quit confirmation for actual quit actions, not window close
  win.on('close', (e) => {
    // On macOS, clicking X should just hide the window, not quit
    if (process.platform === 'darwin' && !isUserQuitting) {
      // Just hide the window instead of closing it
      e.preventDefault();
      win.hide();
      return;
    }
    
    // For actual quit actions (non-macOS), confirmation is sent from main via request-quit
    if (!isQuitConfirmed && isUserQuitting) {
      e.preventDefault();
      if (win && !win.isDestroyed()) {
        win.webContents.send('request-quit');
      }
    }
  });

  // Handle new window requests with URL validation
  win.webContents.setWindowOpenHandler(({ url }) => {
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

  if (!mainWindow || mainWindow.isDestroyed()) {
    mainWindow = win;
  }
  return win;
}

/** Resolve profile for a Settings popup (explicit hint, focused window, or main). */
function resolveProfileIdForSettings(profileIdHint = null) {
  if (profileIdHint != null && typeof profileIdHint === 'string') {
    return sanitizeProfileId(profileIdHint);
  }
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed() && focused.__axisIsIncognito !== true) {
    return sanitizeProfileId(focused.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  }
  let win = mainWindow;
  if (!win || win.isDestroyed()) {
    win = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.__axisIsIncognito !== true
    );
  }
  if (win && !win.isDestroyed()) {
    return sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  }
  return AXIS_DEFAULT_PROFILE_ID;
}

function getSettingsWindowLoadUrl(profileId, section = null) {
  const filePath = path.join(__dirname, 'settings.html');
  const u = pathToFileURL(filePath);
  u.searchParams.set('profile', sanitizeProfileId(profileId));
  const safeSection = sanitizeSettingsSectionId(section);
  if (safeSection) u.hash = safeSection;
  return u.href;
}

/** Open Settings in a native frosted popup window (one window; switch profile inside). */
function openSettingsWindow(section = null, profileIdHint = null) {
  const profileId = resolveProfileIdForSettings(profileIdHint);
  const safeSection = sanitizeSettingsSectionId(section);

  let existing = findSettingsWindow();
  if (existing && !existing.isDestroyed()) {
    const prevId = getSettingsEditingProfileIdForWindow(existing);
    const nextId = sanitizeProfileId(profileId);
    setSettingsEditingProfileOnWindow(existing, profileId);
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    try {
      existing.webContents.send('axis-settings-store-updated');
    } catch (_) {}
    if (prevId !== nextId) {
      try {
        existing.webContents.send('settings-editing-profile-changed', { profileId: nextId });
      } catch (_) {}
    }
    if (safeSection) {
      try {
        existing.webContents.send('switch-settings-tab', safeSection);
      } catch (_) {}
    }
    return existing;
  }

  if (!mainWindow || mainWindow.isDestroyed()) {
    const anyBrowser = BrowserWindow.getAllWindows().find(
      (w) => !w.isDestroyed() && w.__axisIsIncognito !== true && !w.__axisIsSettingsWindow
    );
    if (!anyBrowser) createWindow();
  }

  const isDarwin = process.platform === 'darwin';
  const win = new BrowserWindow({
    width: 860,
    height: 800,
    minWidth: 680,
    minHeight: 520,
    maxWidth: 1100,
    title: 'Settings',
    icon: APP_ICON_PATH,
    resizable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    closable: true,
    show: false,
    transparent: true,
    backgroundColor: '#00000000',
    ...(isDarwin
      ? {
          titleBarStyle: 'hiddenInset',
          frame: false,
          vibrancy: 'under-window',
          visualEffectState: 'active',
          ...AXIS_MACOS_BROWSER_WINDOW_SHAPE
        }
      : process.platform === 'win32'
        ? { frame: false, backgroundMaterial: 'acrylic' }
        : { frame: false }),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'settings-preload.js'),
      partition: getProfilePartition(profileId),
      backgroundThrottling: false,
      spellcheck: false,
      webSecurity: true
    }
  });

  win.__axisIsSettingsWindow = true;
  win.__axisIsIncognito = false;
  win.__axisProfileId = profileId;
  win.__axisSettingsProfileId = profileId;

  if (isDarwin) {
    win.__axisSidebarRight = false;
    attachMacTrafficLightResize(win);
  }

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      const lowerUrl = url.toLowerCase();
      if (
        lowerUrl.startsWith('javascript:') ||
        lowerUrl.startsWith('data:') ||
        lowerUrl.startsWith('vbscript:') ||
        lowerUrl.startsWith('file:')
      ) {
        return { action: 'deny' };
      }
      openUrlInAxisBrowser(url);
      return { action: 'deny' };
    }
    return { action: 'deny' };
  });

  win.once('ready-to-show', () => {
    if (isDarwin && !win.isDestroyed()) {
      positionMacTrafficLights(win, false);
      setImmediate(() => {
        if (!win.isDestroyed()) positionMacTrafficLights(win, false);
      });
    }
    if (process.platform === 'win32' && !win.isDestroyed()) {
      try {
        win.setBackgroundMaterial('acrylic');
      } catch (_) {}
    }
    applyVibrancyToWindow(win);
    win.show();
    win.focus();
    if (isDarwin) win.setWindowButtonVisibility(true);
  });

  win.on('closed', () => {
    if (axisSettingsWindow === win) axisSettingsWindow = null;
  });

  axisSettingsWindow = win;
  win.loadURL(getSettingsWindowLoadUrl(profileId, safeSection));
  return win;
}

/** Open Settings (native popup). Kept for menu handlers. */
function openSettingsInBrowserTab(section = null) {
  openSettingsWindow(section);
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

/**
 * Open a store/listing URL in a browser tab. If the focused window is the main shell (`index.html`),
 * use it (normal or incognito); otherwise fall back to the primary browser window so Settings/other
 * windows do not receive `open-url-in-browser`.
 */
function openStoreListingUrlFromMenu(url) {
  if (!url || typeof url !== 'string') return;
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    try {
      const pageUrl = focused.webContents.getURL() || '';
      if (pageUrl.includes('index.html')) {
        if (focused.isMinimized()) focused.restore();
        focused.show();
        focused.focus();
        focused.webContents.send('open-url-in-browser', url);
        return;
      }
    } catch (_) {}
  }
  openUrlInAxisBrowser(url);
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
      backgroundThrottling: true,
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
    ...(process.platform === 'darwin' ? AXIS_MACOS_BROWSER_WINDOW_SHAPE : {})
  });

  attachAxisHostNavigationGestures(win);

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
      const side = !!win.__axisSidebarRight;
      positionMacTrafficLights(win, side);
      setImmediate(() => {
        if (!win.isDestroyed()) positionMacTrafficLights(win, side);
      });
    }
    applyVibrancyToWindow(win);
    win.show();
    win.setWindowButtonVisibility(true);
  });
}

/** Optional small icon for application-menu extension rows (`iconUrl` is usually a `file:` URL). */
function axisNativeImageForExtensionMenu(iconUrl) {
  if (!iconUrl || typeof iconUrl !== 'string') return undefined;
  try {
    let fp = '';
    if (iconUrl.startsWith('file:')) {
      fp = fileURLToPath(iconUrl);
    } else if (path.isAbsolute(iconUrl) && fs.existsSync(iconUrl)) {
      fp = iconUrl;
    }
    if (!fp || !fs.existsSync(fp)) return undefined;
    let img = nativeImage.createFromPath(fp);
    if (!img || img.isEmpty()) return undefined;
    const target = process.platform === 'darwin' ? 18 : 16;
    const sz = img.getSize();
    if (sz.width > target * 2 || sz.height > target * 2) {
      img = img.resize({ width: target, height: target, quality: 'good' });
    }
    return img;
  } catch (_) {
    return undefined;
  }
}

/** macOS menu bar (and other platforms): Extensions → installed items, store links, Settings. */
function buildExtensionsSubmenu() {
  const activeProfileId = getActiveProfileId();
  const exts = getStoredAxisExtensions(activeProfileId);
  /** @type {import('electron').MenuItemConstructorOptions[]} */
  const items = [];
  if (!exts.length) {
    items.push({ label: 'No extensions installed', enabled: false });
  } else {
    for (const ext of exts) {
      const userDisabled = ext.enabled === false;
      const rawName = ext.name || 'Extension';
      const label = rawName.length > 64 ? `${rawName.slice(0, 61)}…` : rawName;
      const extId = ext.id;
      const menuIcon = axisNativeImageForExtensionMenu(ext.iconUrl);
      /** @type {import('electron').MenuItemConstructorOptions} */
      const row = {
        label,
        enabled: !userDisabled,
        ...(menuIcon ? { icon: menuIcon } : {}),
        click: async () => {
          try {
            const pid = getActiveProfileId();
            const win = getActiveAxisWindow();
            await openAxisExtensionPopupOrOptions(extId, pid, win || undefined);
          } catch (e) {
            const msg = e && e.message ? e.message : String(e);
            const win = getActiveAxisWindow();
            void dialog.showMessageBox(win && !win.isDestroyed() ? win : BrowserWindow.getFocusedWindow() || undefined, {
              type: 'info',
              title: 'Extension',
              message: 'Could not open this extension.',
              detail: msg,
              buttons: ['OK']
            });
          }
        }
      };
      items.push(row);
    }
  }

  items.push({ type: 'separator' });
  items.push({
    label: 'Add extension (Chrome Web Store)',
    click: () => openStoreListingUrlFromMenu('https://chromewebstore.google.com/')
  });
  items.push({
    label: 'Add extension (Firefox Add-ons)',
    click: () => openStoreListingUrlFromMenu('https://addons.mozilla.org/firefox/extensions/')
  });
  items.push({
    label: 'Manage Extensions…',
    click: () => openSettingsInBrowserTab('extensions')
  });
  return items;
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
        axisUpdateCheck.getCheckForUpdatesMenuItem(),
        { type: 'separator' },
        {
          label: 'Settings…',
          ...(settingsShortcut ? { accelerator: settingsShortcut } : {}),
          click: () => openSettingsInBrowserTab()
        },
        {
          label: 'Keyboard Shortcuts…',
          click: () => openSettingsInBrowserTab('shortcuts')
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
            if (win && !win.isDestroyed()) {
              if (showNativeQuitDialog()) {
                void finishConfirmedQuit();
              }
            } else {
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
      click: () => createWindow({ useNewWindowRules: true })
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
    ...(supportsNativeEmojiPanel()
      ? [
          { type: 'separator' },
          {
            label: 'Emoji and Symbols',
            click: () => {
              const win = BrowserWindow.getFocusedWindow();
              showNativeEmojiPanel(win && !win.isDestroyed() ? win.webContents : null);
            }
          }
        ]
      : []),
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
            click: () => openSettingsInBrowserTab()
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
      label: 'Undo',
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
    {
      id: 'axis-enter-fullscreen',
      label: 'Enter Full Screen',
      accelerator: process.platform === 'darwin' ? 'Ctrl+Command+F' : 'F11',
      // macOS: do not use `role: 'togglefullscreen'` — it duplicates the OS-injected View item.
      click: () => {
        const win = BrowserWindow.getFocusedWindow();
        if (win && !win.isDestroyed()) {
          win.setFullScreen(!win.isFullScreen());
        }
      }
    }
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
            click: () => createWindow({ useNewWindowRules: true })
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
    axisUpdateCheck.getCheckForUpdatesMenuItem(),
    { type: 'separator' },
    {
      label: 'Visit Website',
      click: () => openUrlInAxisBrowser('https://www.axis-browser.com/')
    },
    { type: 'separator' },
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
  template.push({ label: 'Profiles', submenu: buildProfilesSubmenu() });
  template.push({ label: 'History', submenu: historySubmenu });
  template.push({ label: 'Extensions', submenu: buildExtensionsSubmenu() });
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
      backgroundThrottling: true,
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
    ...(process.platform === 'darwin' ? AXIS_MACOS_BROWSER_WINDOW_SHAPE : {})
  });
  incognitoWindow.__axisIsIncognito = true;
  incognitoWindow.__axisProfileId = 'incognito';
  incognitoWindow.__axisProfileName = 'Incognito';
  incognitoWindow.__axisUndoPending = false;

  attachAxisHostNavigationGestures(incognitoWindow);

  if (process.platform === 'darwin') {
    incognitoWindow.__axisSidebarRight = false;
    attachMacTrafficLightResize(incognitoWindow);
  }
  attachWebviewHostResizeSignals(incognitoWindow);

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
      const side = !!incognitoWindow.__axisSidebarRight;
      positionMacTrafficLights(incognitoWindow, side);
      setImmediate(() => {
        if (!incognitoWindow.isDestroyed()) positionMacTrafficLights(incognitoWindow, side);
      });
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

function focusExistingIncognitoWindow() {
  const all = BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed());
  const existing = all.find((w) => w.__axisIsIncognito === true);
  if (!existing) return null;
  try {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
  } catch (_) {}
  return existing;
}

function focusExistingProfileWindow(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const target = sanitizeProfileId(profileId);
  const all = BrowserWindow.getAllWindows().filter((w) => w && !w.isDestroyed());
  const existing = all.find(
    (w) => w.__axisIsIncognito !== true && sanitizeProfileId(w.__axisProfileId) === target
  );
  if (!existing) return null;
  try {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
  } catch (_) {}
  return existing;
}

function focusExistingPersonalWindow() {
  return focusExistingProfileWindow(AXIS_DEFAULT_PROFILE_ID);
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

function isSuppressedWarning(warning) {
  const msg = typeof warning === 'string' ? warning
    : (warning instanceof Error ? warning.message : '');
  if (matchesSuppressed(msg)) return true;
  return (
    msg.includes('Manifest version 2 is deprecated') &&
    msg.includes(`${path.sep}extension-runtime${path.sep}`)
  );
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
  if (isSuppressedWarning(warning)) return;
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
  axisSessionLastExitClean = wasLastAxisSessionCleanExit();
  markAxisSessionRunning();
  axisUpdateCheck.install({
    getParentWindow: () => {
      const focused = BrowserWindow.getFocusedWindow();
      if (focused && !focused.isDestroyed()) return focused;
      if (mainWindow && !mainWindow.isDestroyed()) return mainWindow;
      return null;
    }
  });
  app.on('web-contents-created', (_event, contents) => {
    contents.setMaxListeners(0);
    attachAxisArrowShortcutHandler(contents);

    let isGuest = false;
    try { isGuest = typeof contents.getType === 'function' && contents.getType() === 'webview'; } catch (_) {}

    // Cache the freshest `context-menu` params on EVERY webContents (guest or host).
    // The <webview> DOM `context-menu` event in the renderer can arrive with
    // `misspelledWord` / `dictionarySuggestions` stripped; reading them straight off
    // the native event in main always works. Installed unconditionally so it covers
    // any guest regardless of what `getType()` reports.
    contents.__axisLastContextMenuParams = null;
    contents.on('context-menu', (_e, params) => {
      const ps = params || {};
      contents.__axisLastContextMenuParams = {
        misspelledWord: typeof ps.misspelledWord === 'string' ? ps.misspelledWord : '',
        dictionarySuggestions: Array.isArray(ps.dictionarySuggestions)
          ? ps.dictionarySuggestions.slice()
          : [],
        isEditable: !!ps.isEditable,
        x: Number(ps.x) || 0,
        y: Number(ps.y) || 0,
        selectionText: typeof ps.selectionText === 'string' ? ps.selectionText : '',
        at: Date.now()
      };
    });

    // Ensure every dynamic profile partition gets handlers (cookies, downloads, permissions, spellcheck).
    try { configureAxisSessionInstance(contents.session); } catch (_) {}

    if (!isGuest) return;

    try {
      installAxisPageSecurityOnWebContents(contents);
    } catch (_) {}

    // <webview> guests: stop Electron from opening a blank Axis BrowserWindow
    // for window.open() / target=_blank (file downloads, etc.).
    contents.setWindowOpenHandler((details) => {
      const url = details && details.url;
      if (typeof url === 'string' && url) {
        const lower = url.toLowerCase();
        const blocked =
          lower.startsWith('javascript:') ||
          lower.startsWith('data:') ||
          lower.startsWith('vbscript:') ||
          lower.startsWith('file:');
        if (!blocked) {
          // Fire after handler returns; sync loadURL inside the handler can race the deny.
          setImmediate(() => {
            if (!contents.isDestroyed()) {
              contents.loadURL(url).catch(() => {});
            }
          });
        }
      }
      return { action: 'deny' };
    });
  });

  configureSession();
  ensureSpellEngineLoaded();
  warmUpMainProcessNativePaths();
  createWindow();
  updateDockMenu();
  // First window loads ad blocker + extensions for its profile on ready-to-show; warm the rest in idle.
  setImmediate(() => {
    void (async () => {
      try {
        await syncAllProfilesAdBlocker();
        await loadAllProfileExtensions();
      } catch (e) {
        console.error('Axis: deferred profile init failed:', e);
      }
    })();
  });
  // Dock squircle (Jimp) runs after first window — avoids delaying initial paint; cache makes later launches cheap.
  void applyMacDockIcon();
  // Ensure shortcuts are active whenever any Axis window has focus
  app.on('browser-window-focus', () => {
    unregisterShortcuts();
    registerShortcuts();
    try {
      createMenu();
    } catch (_) {}
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
  if (isQuitConfirmed) markAxisSessionCleanExit();
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
  const win = getActiveAxisWindow();
  if (!win || win.isDestroyed()) return false;
  try {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  } catch (_) {}
  const response = dialog.showMessageBoxSync(win, {
    type: 'question',
    buttons: ['Cancel', 'Quit'],
    defaultId: 0,
    cancelId: 0,
    message: 'Quit Axis?',
    detail: 'Are you sure you want to exit the application?'
  });
  return response === 1;
}

/** Persist tab groups / pinned tabs from a personal window before app.quit (async, not during unload). */
async function persistSessionBeforeQuit() {
  const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed());
  for (const win of wins) {
    try {
      const payload = await win.webContents.executeJavaScript(
        `(function () {
          try {
            return window.__axisBrowser && typeof window.__axisBrowser.flushSessionStatePayload === 'function'
              ? window.__axisBrowser.flushSessionStatePayload()
              : null;
          } catch (err) {
            return null;
          }
        })()`,
        true
      );
      if (payload && payload.incognito === false) {
        const profileId = sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
        const s = getProfileStore(profileId);
        if (payload.tabGroups != null) s.set('tabGroups', payload.tabGroups);
        if (payload.pinnedTabs != null) s.set('pinnedTabs', payload.pinnedTabs);
        if (payload.unpinnedTabs != null) s.set('unpinnedTabs', payload.unpinnedTabs);
        s.set('unpinnedTabsRecovery', []);
      }
    } catch (err) {
      console.error('persistSessionBeforeQuit:', err);
    }
  }
}

async function finishConfirmedQuit() {
  isQuitConfirmed = true;
  isUserQuitting = true;
  try {
    for (const vault of axisVaultByProfile.values()) {
      vault.flushUnlocked();
    }
  } catch (_) {}
  await persistSessionBeforeQuit();
  app.quit();
}

// Handle Cmd+Q on macOS (before-quit fires before window close)
app.on('before-quit', (e) => {
  if (process.platform === 'darwin' && !isQuitConfirmed) {
    e.preventDefault();
    isUserQuitting = true;
    if (showNativeQuitDialog()) {
      void finishConfirmedQuit();
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
    createWindow({ profileId: AXIS_DEFAULT_PROFILE_ID });
  }
});

async function axisVerifyDeviceOwner(reason) {
  const text =
    typeof reason === 'string' && reason.trim()
      ? reason.trim()
      : 'Authenticate to view saved passwords';
  if (process.platform === 'darwin') {
    const canTouch =
      typeof systemPreferences.canPromptTouchID === 'function' &&
      systemPreferences.canPromptTouchID();
    if (canTouch && typeof systemPreferences.promptTouchID === 'function') {
      try {
        await systemPreferences.promptTouchID(text);
        return true;
      } catch (_) {
        return false;
      }
    }
  }
  const { response } = await dialog.showMessageBox({
    type: 'question',
    message: text,
    detail:
      process.platform === 'darwin'
        ? 'Use Touch ID on the next prompt, or confirm here to continue.'
        : 'Confirm it is you to view sensitive information.',
    buttons: ['Cancel', 'Continue'],
    defaultId: 1,
    cancelId: 0
  });
  return response === 1;
}

function vaultStatusPayload(profileId = AXIS_DEFAULT_PROFILE_ID) {
  const pid = sanitizeProfileId(profileId);
  ensureAxisVaultForProfile(pid).ensureLoaded();
  let touchIdAvailable = false;
  if (process.platform === 'darwin') {
    try {
      touchIdAvailable =
        typeof systemPreferences.canPromptTouchID === 'function' &&
        systemPreferences.canPromptTouchID();
    } catch (_) {}
  }
  return {
    configured: true,
    unlocked: true,
    autofillEnabled: getProfileStore(pid).get('vaultAutofillEnabled', true) !== false,
    touchIdAvailable
  };
}

ipcMain.handle('axis-vault-get-page-scan-js', () => AXIS_VAULT_PAGE_SCAN_JS);

ipcMain.handle('axis-vault-get-autofill-inject-js', () => ({
  bootstrap: AXIS_VAULT_AUTOFILL_BOOTSTRAP_JS,
  probe: AXIS_VAULT_AUTOFILL_PROBE_JS,
  hide: AXIS_VAULT_AUTOFILL_HIDE_JS
}));

ipcMain.handle('axis-vault-build-autofill-show-js', (_e, payload) => {
  const data = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : { items: payload };
  const items = Array.isArray(data.items) ? data.items : [];
  const theme = data.theme === 'light' ? 'light' : 'dark';
  const kind = data.kind === 'card' || data.kind === 'address' ? data.kind : 'login';
  return buildVaultAutofillShowMenuJs(items, theme, kind);
});

ipcMain.handle('axis-vault-build-autofill-fill-js', (_e, cred) =>
  cred && typeof cred === 'object' ? buildVaultAutofillFillLoginJs(cred) : '(function(){})()'
);

ipcMain.handle('axis-vault-status', (event) => vaultStatusPayload(getProfileIdForEvent(event)));

ipcMain.handle('axis-vault-verify-device', async (_e, reason) => axisVerifyDeviceOwner(reason));

ipcMain.handle('axis-vault-reveal-login', async (event, id) => {
  const ok = await axisVerifyDeviceOwner('Show saved login');
  if (!ok) return { ok: false, cancelled: true };
  const login = ensureAxisVaultFromEvent(event).getLogin(id);
  return { ok: true, username: login.username, password: login.password };
});

ipcMain.handle('axis-vault-reveal-card', async (event, id) => {
  const ok = await axisVerifyDeviceOwner('Show saved card');
  if (!ok) return { ok: false, cancelled: true };
  const card = ensureAxisVaultFromEvent(event).getCard(id);
  return {
    ok: true,
    number: card.number,
    cvv: card.cvv,
    expMonth: card.expMonth,
    expYear: card.expYear
  };
});

ipcMain.handle('axis-vault-list-logins', (event) => ({
  ok: true,
  items: ensureAxisVaultFromEvent(event).listLogins()
}));

ipcMain.handle('axis-vault-get-login', (event, id) => {
  const login = ensureAxisVaultFromEvent(event).getLogin(id);
  return {
    id: login.id,
    origin: login.origin,
    username: login.username,
    title: login.title,
    notes: login.notes,
    updatedAt: login.updatedAt
  };
});

ipcMain.handle('axis-vault-save-login', (event, entry) => {
  return ensureAxisVaultFromEvent(event).saveLogin(entry || {});
});

ipcMain.handle('axis-vault-delete-login', (event, id) => {
  ensureAxisVaultFromEvent(event).deleteLogin(id);
  return true;
});

ipcMain.handle('axis-vault-get-login-for-fill', (event, id) => {
  const login = ensureAxisVaultFromEvent(event).getLogin(id);
  return {
    id: login.id,
    origin: login.origin,
    username: login.username,
    password: login.password,
    title: login.title
  };
});

ipcMain.handle('axis-vault-get-card-for-fill', (event, id) => {
  const card = ensureAxisVaultFromEvent(event).getCard(id);
  return {
    id: card.id,
    label: card.label,
    cardholder: card.cardholder,
    number: card.number,
    expMonth: card.expMonth,
    expYear: card.expYear,
    cvv: card.cvv,
    billingZip: card.billingZip
  };
});

ipcMain.handle('axis-vault-list-cards', (event) => ({
  ok: true,
  items: ensureAxisVaultFromEvent(event).listCards()
}));

ipcMain.handle('axis-vault-get-card', (event, id) => {
  const card = ensureAxisVaultFromEvent(event).getCard(id);
  return {
    id: card.id,
    label: card.label,
    cardholder: card.cardholder,
    masked: card.number ? `•••• ${String(card.number).replace(/\D/g, '').slice(-4)}` : '••••',
    expMonth: card.expMonth,
    expYear: card.expYear,
    billingZip: card.billingZip
  };
});

ipcMain.handle('axis-vault-save-card', (event, entry) => {
  return ensureAxisVaultFromEvent(event).saveCard(entry || {});
});

ipcMain.handle('axis-vault-delete-card', (event, id) => {
  ensureAxisVaultFromEvent(event).deleteCard(id);
  return true;
});

ipcMain.handle('axis-vault-list-addresses', (event) => ({
  ok: true,
  items: ensureAxisVaultFromEvent(event).listAddresses()
}));

ipcMain.handle('axis-vault-get-address', (event, id) => {
  const addr = ensureAxisVaultFromEvent(event).getAddress(id);
  return {
    id: addr.id,
    label: addr.label,
    fullName: addr.fullName,
    organization: addr.organization,
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
    phone: addr.phone,
    email: addr.email,
    updatedAt: addr.updatedAt
  };
});

ipcMain.handle('axis-vault-save-address', (event, entry) => {
  return ensureAxisVaultFromEvent(event).saveAddress(entry || {});
});

ipcMain.handle('axis-vault-delete-address', (event, id) => {
  ensureAxisVaultFromEvent(event).deleteAddress(id);
  return true;
});

ipcMain.handle('axis-vault-get-address-for-fill', (event, id) => {
  const addr = ensureAxisVaultFromEvent(event).getAddress(id);
  return {
    id: addr.id,
    label: addr.label,
    fullName: addr.fullName,
    organization: addr.organization,
    addressLine1: addr.addressLine1,
    addressLine2: addr.addressLine2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postalCode,
    country: addr.country,
    phone: addr.phone,
    email: addr.email,
    summary: formatAddressSummary(addr)
  };
});

ipcMain.handle('axis-vault-should-offer-address-save', (event, payload) => ({
  offer: ensureAxisVaultFromEvent(event).shouldOfferAddressSave(payload || {})
}));

ipcMain.handle('axis-vault-capture-login', (event, payload) => {
  return ensureAxisVaultFromEvent(event).captureLogin(payload || {});
});

ipcMain.handle('axis-vault-should-offer-login-save', (event, payload) => ({
  offer: ensureAxisVaultFromEvent(event).shouldOfferLoginSave(payload || {})
}));

function forwardVaultGuestMessageToShell(event, channel, payload) {
  if (!channel || !event.sender || event.sender.isDestroyed()) return;
  const out = { channel, payload, guestWebContentsId: event.sender.id };
  try {
    const host = event.sender.hostWebContents;
    if (host && !host.isDestroyed()) {
      host.send('axis-vault-guest-ipc', out);
      return;
    }
  } catch (_) {}
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed()) {
    focused.webContents.send('axis-vault-guest-ipc', out);
    return;
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('axis-vault-guest-ipc', out);
      break;
    }
  }
}

function vaultAutofillCandidates(profileId, payload) {
  const pid = sanitizeProfileId(profileId);
  const v = ensureAxisVaultForProfile(pid);
  const status = vaultStatusPayload(pid);
  if (status.autofillEnabled === false) {
    return { ok: true, kind: 'login', items: [] };
  }
  const kind =
    payload && payload.kind === 'card'
      ? 'card'
      : payload && payload.kind === 'address'
        ? 'address'
        : 'login';
  // Cards and addresses are not site-scoped — don't require a page origin.
  if (kind === 'card') {
    const cards = v.matchCards().map((c) => ({
      id: c.id,
      label: c.label,
      cardholder: c.cardholder,
      masked: c.masked,
      number: c.number,
      expMonth: c.expMonth,
      expYear: c.expYear,
      cvv: c.cvv,
      billingZip: c.billingZip
    }));
    return { ok: true, kind: 'card', items: cards };
  }
  if (kind === 'address') {
    const addresses = v.matchAddresses().map((a) => ({ ...a }));
    return { ok: true, kind: 'address', items: addresses };
  }
  let origin = v.normalizeVaultOrigin(payload && payload.origin);
  if (!origin && payload && payload.pageUrl) {
    origin = v.normalizeVaultOrigin(payload.pageUrl);
  }
  if (!origin) return { ok: true, kind: 'login', items: [] };
  const logins = v
    .matchLogins(origin, payload && payload.usernameHint, payload && payload.pageUrl)
    .map((e) => ({
      id: e.id,
      username: e.username,
      password: e.password,
      title: e.title
    }));
  return { ok: true, kind: 'login', items: logins };
}

/** Guest preload: autofill menu data (invoke — reliable in webview). */
ipcMain.handle('axis-vault-autofill-query', (event, payload) =>
  vaultAutofillCandidates(getProfileIdFromWebContents(event.sender), payload)
);

/** Guest preload → shell (invoke — reliable in sandboxed guests). */
ipcMain.handle('axis-vault-report-credentials', (event, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  forwardVaultGuestMessageToShell(event, 'axis-vault-save-offer', payload);
  return true;
});

/** Guest preload → shell: show autofill menu (invoke; sendToHost backup). */
ipcMain.handle('axis-vault-autofill-present', (event, payload) => {
  if (!payload || typeof payload !== 'object') return false;
  forwardVaultGuestMessageToShell(event, 'axis-vault-autofill-request', payload);
  return true;
});

/** Guest `<webview>` → shell: vault save/autofill (sendToHost backup). */
ipcMain.on('axis-vault-guest-ipc', (event, msg) => {
  const data = msg && typeof msg === 'object' ? msg : {};
  const { channel, payload } = data;
  forwardVaultGuestMessageToShell(event, channel, payload);
});

ipcMain.handle('axis-vault-fill-candidates', (event, payload) => {
  const res = vaultAutofillCandidates(getProfileIdForEvent(event), payload || {});
  if (!res.ok) return { ok: true, logins: [], cards: [], addresses: [] };
  if (res.kind === 'card') {
    return { ok: true, logins: [], cards: res.items, addresses: [] };
  }
  if (res.kind === 'address') {
    return { ok: true, logins: [], cards: [], addresses: res.items };
  }
  return { ok: true, logins: res.items, cards: [], addresses: [] };
});

// IPC handlers
ipcMain.handle('open-settings-window', (event, tab) => {
  openSettingsWindow(tab || null, getProfileIdForEvent(event));
  return true;
});

ipcMain.handle('axis-close-settings-window', (event) => {
  const win = getWindowFromSender(event?.sender);
  if (win && win.__axisIsSettingsWindow && !win.isDestroyed()) {
    win.close();
  }
  return true;
});

const AXIS_SETTINGS_SECTION_IDS = new Set([
  'customization',
  'newtab',
  'ai',
  'history',
  'shortcuts',
  'permissions',
  'extensions',
  'vault'
]);

function sanitizeSettingsSectionId(section) {
  if (section == null || typeof section !== 'string') return null;
  const id = section.replace(/^#/, '').trim();
  return AXIS_SETTINGS_SECTION_IDS.has(id) ? id : null;
}

function getWindowFromSender(webContents) {
  if (!webContents || webContents.isDestroyed()) return null;
  const direct = BrowserWindow.fromWebContents(webContents);
  if (direct && !direct.isDestroyed()) return direct;
  try {
    const host = webContents.hostWebContents;
    if (host && !host.isDestroyed()) {
      const hostWin = BrowserWindow.fromWebContents(host);
      if (hostWin && !hostWin.isDestroyed()) return hostWin;
    }
  } catch (_) {}
  return null;
}

function getProfileIdForEvent(event) {
  const sender = event?.sender;
  // In-window profile switching updates `win.__axisProfileId` but the shell keeps the
  // default `persist:main` session — always prefer the window's active profile first.
  const win = getWindowFromSender(sender);
  if (win && !win.isDestroyed() && win.__axisIsIncognito !== true) {
    const editingId = getSettingsEditingProfileIdForWindow(win);
    if (editingId && sender && !sender.isDestroyed() && isSettingsGuestWebContents(sender)) {
      return editingId;
    }
    if (win.__axisProfileId) {
      return sanitizeProfileId(win.__axisProfileId);
    }
  }
  if (sender && !sender.isDestroyed()) {
    try {
      const part =
        sender.session && typeof sender.session.getPartition === 'function'
          ? sender.session.getPartition()
          : '';
      if (part && part !== 'incognito') {
        return getProfileIdFromSession(sender.session);
      }
    } catch (_) {}
  }
  return AXIS_DEFAULT_PROFILE_ID;
}

function getSettingsStoreForEvent(event) {
  return getProfileStore(getProfileIdForEvent(event));
}

ipcMain.handle('get-settings-tab-load-url', (event, section) => {
  const win = getWindowFromSender(event?.sender);
  if (win && !win.isDestroyed() && !win.__axisIsSettingsWindow) {
    delete win.__axisSettingsEditingProfileId;
  }
  const filePath = path.join(__dirname, 'settings.html');
  const u = pathToFileURL(filePath);
  u.searchParams.set('embedded', '1');
  u.searchParams.set('profile', getProfileIdForEvent(event));
  const safeSection = sanitizeSettingsSectionId(section);
  if (safeSection) {
    u.hash = safeSection;
  }
  return u.href;
});

ipcMain.handle('get-settings-webview-preload-path', () =>
  path.join(__dirname, 'webview-preload-settings.js')
);

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

ipcMain.on('settings-updated', (event) => {
  broadcastSettingsUpdated(getProfileIdForEvent(event));
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
  const win = getWindowFromSender(event.sender);
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    win.webContents.send('open-url-in-browser', url);
  } else {
    openUrlInAxisBrowser(url);
  }
  return true;
});

ipcMain.handle('get-settings', (event) => {
  const s = getSettingsStoreForEvent(event);
  return mergeGlobalSettingsIntoProfileSettings(s.store);
});

ipcMain.handle('get-settings-editing-context', (event) => {
  return getSettingsEditingContextPayload(event);
});

ipcMain.on('axis-settings-profile-bootstrap', (event) => {
  event.returnValue = getSettingsEditingContextPayload(event);
});

function getSettingsEditingContextPayload(event) {
  const profileId = getProfileIdForEvent(event);
  return {
    profileId,
    profiles: listAxisProfiles().map((p) => ({
      id: p.id,
      name: p.name,
      icon: p.icon
    }))
  };
}

ipcMain.handle('set-settings-editing-profile', (event, profileId) => {
  const win = getWindowFromSender(event?.sender);
  if (!win || win.isDestroyed()) return { ok: false, error: 'No window' };
  const id = setSettingsEditingProfileOnWindow(win, profileId);
  if (!id) return { ok: false, error: 'Profile not found' };
  const meta = listAxisProfiles().find((p) => p.id === id);
  return { ok: true, profileId: id, profileName: meta?.name || id };
});

ipcMain.on('axis-get-sidebar-position', (event) => {
  event.returnValue = getGlobalSidebarPosition();
});

/** Sync payload for `settings.html` first paint — `uiTheme` from the store only, never the OS. */
ipcMain.on('axis-settings-window-bootstrap', (event) => {
  try {
    const s = getSettingsStoreForEvent(event);
    const stored = s.get('uiTheme', 'dark');
    const uiTheme =
      stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'dark';
    const effectiveUiTheme =
      uiTheme === 'system'
        ? getSystemUiThemePreference()
        : uiTheme === 'light'
          ? 'light'
          : 'dark';
    const wclRaw = Number(s.get('windowChromeLight', 50));
    const windowChromeLight = Number.isFinite(wclRaw)
      ? Math.max(0, Math.min(100, wclRaw))
      : 50;
    event.returnValue = { uiTheme, effectiveUiTheme, windowChromeLight };
  } catch (_) {
    event.returnValue = { uiTheme: 'dark', effectiveUiTheme: 'dark', windowChromeLight: 50 };
  }
});

ipcMain.handle('get-system-ui-theme', () => getSystemUiThemePreference());

ipcMain.handle('get-site-permission-overrides', (event) => {
  const s = getSettingsStoreForEvent(event);
  return s.get('sitePermissionOverrides', {});
});

ipcMain.handle('set-site-permission-overrides', (event, obj) => {
  const pid = getProfileIdForEvent(event);
  const s = getSettingsStoreForEvent(event);
  const cleaned = cleanSitePermissionOverrides(obj);
  s.set('sitePermissionOverrides', cleaned);
  broadcastSettingsUpdated(pid);
  return cleaned;
});

function normalizeFavoritesStoreList(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((fav, order) => {
      const url = typeof fav?.url === 'string' ? fav.url.trim() : '';
      if (!url) return null;
      return {
        id: typeof fav?.id === 'string' && fav.id.trim() ? fav.id.trim() : `fav-${Date.now()}-${order}`,
        url,
        title:
          typeof fav?.title === 'string' && fav.title.trim() ? fav.title.trim().slice(0, 200) : 'Favorite',
        favicon: fav?.favicon || null,
        customIcon: fav?.customIcon || null,
        customIconType: fav?.customIconType || null,
        order: typeof fav?.order === 'number' ? fav.order : order
      };
    })
    .filter(Boolean);
}

ipcMain.handle('get-favorites', (_event, profileId) => {
  const pid = sanitizeProfileId(profileId || AXIS_DEFAULT_PROFILE_ID);
  const raw = getProfileStore(pid).get('favorites', []);
  return Array.isArray(raw) ? raw : [];
});

ipcMain.handle('set-favorites', (_event, items, profileId) => {
  const pid = sanitizeProfileId(profileId);
  if (!profileId) return { ok: false, error: 'profileId required' };
  getProfileStore(pid).set('favorites', normalizeFavoritesStoreList(items));
  broadcastSettingsUpdated(pid);
  return { ok: true };
});

/** Write outgoing profile sidebar data to an explicit store (safe while the window profile is changing). */
function persistOutgoingProfileStore(profileId, captured) {
  const pid = sanitizeProfileId(profileId);
  if (!captured) return { ok: false, error: 'payload required' };
  const store = getProfileStore(pid);
  const {
    sessionPayload,
    pinnedTabs,
    tabGroups,
    unpinnedTabs,
    favoritesPayload,
    pinnedSidebarOrder
  } = captured;
  const existingPinned = store.get('pinnedTabs');
  const existingGroups = store.get('tabGroups');
  const existingUnpinned = store.get('unpinnedTabs');
  const existingFavorites = store.get('favorites');
  const hadSidebarData =
    (Array.isArray(existingPinned) && existingPinned.length > 0) ||
    (Array.isArray(existingGroups) && existingGroups.length > 0) ||
    (Array.isArray(existingUnpinned) && existingUnpinned.length > 0) ||
    (Array.isArray(existingFavorites) && existingFavorites.length > 0);
  const incomingPinned = Array.isArray(pinnedTabs) ? pinnedTabs.length : null;
  const incomingGroups = Array.isArray(tabGroups) ? tabGroups.length : null;
  const incomingUnpinned = Array.isArray(unpinnedTabs) ? unpinnedTabs.length : null;
  const incomingFavorites = Array.isArray(favoritesPayload) ? favoritesPayload.length : null;
  const incomingEmpty =
    (incomingPinned === 0 || incomingPinned == null) &&
    (incomingGroups === 0 || incomingGroups == null) &&
    (incomingUnpinned === 0 || incomingUnpinned == null) &&
    (incomingFavorites === 0 || incomingFavorites == null);
  if (hadSidebarData && incomingEmpty) {
    console.warn('persist-outgoing-profile: refusing empty overwrite for profile', pid);
    return { ok: false, error: 'refusing empty overwrite' };
  }
  if (sessionPayload && !sessionPayload.incognito) {
    if (sessionPayload.tabGroups != null) store.set('tabGroups', sessionPayload.tabGroups);
    if (sessionPayload.pinnedTabs != null) store.set('pinnedTabs', sessionPayload.pinnedTabs);
    if (sessionPayload.unpinnedTabs != null) store.set('unpinnedTabs', sessionPayload.unpinnedTabs);
    if (sessionPayload.pinnedSidebarOrder != null) {
      store.set('pinnedSidebarOrder', sessionPayload.pinnedSidebarOrder);
    }
    if (sessionPayload.clearUnpinnedRecovery === true) store.set('unpinnedTabsRecovery', []);
  }
  if (pinnedTabs != null) store.set('pinnedTabs', pinnedTabs);
  if (tabGroups != null) store.set('tabGroups', tabGroups);
  if (unpinnedTabs != null) store.set('unpinnedTabs', unpinnedTabs);
  if (pinnedSidebarOrder != null) store.set('pinnedSidebarOrder', pinnedSidebarOrder);
  if (favoritesPayload != null) {
    store.set('favorites', normalizeFavoritesStoreList(favoritesPayload));
  }
  /* Do not broadcast settings-updated here: the window is mid profile-switch and still
     reports the outgoing profile id, which can race and reload partial sidebar state. */
  return { ok: true };
}

ipcMain.handle('persist-outgoing-profile', (_event, profileId, captured) => {
  try {
    return persistOutgoingProfileStore(profileId, captured);
  } catch (e) {
    console.error('persist-outgoing-profile failed:', e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('set-setting', (event, key, value) => {
  const pid = getProfileIdForEvent(event);
  if (key === 'sidebarPosition') {
    setGlobalSidebarPosition(value);
    broadcastSettingsUpdated(null);
    return true;
  }
  const s = getSettingsStoreForEvent(event);
  s.set(key, value);
  if (key === 'adBlockerEnabled') {
    syncAdBlockerForProfile(pid);
  }
  broadcastSettingsUpdated(pid);
  return true;
});

function applyAxisSessionFlushPayload(event, payload) {
  if (!payload || payload.incognito) return;
  const s = getSettingsStoreForEvent(event);
  if (payload.tabGroups != null) s.set('tabGroups', payload.tabGroups);
  if (payload.pinnedTabs != null) s.set('pinnedTabs', payload.pinnedTabs);
  if (payload.unpinnedTabs != null) s.set('unpinnedTabs', payload.unpinnedTabs);
  if (payload.pinnedSidebarOrder != null) s.set('pinnedSidebarOrder', payload.pinnedSidebarOrder);
  if (payload.clearUnpinnedRecovery === true) s.set('unpinnedTabsRecovery', []);
}

/** Synchronous session flush before window teardown (tab groups, pinned tabs). */
ipcMain.on('axis-flush-session-sync', (event, payload) => {
  try {
    applyAxisSessionFlushPayload(event, payload);
  } catch (e) {
    console.error('axis-flush-session-sync failed:', e);
  }
});

/** Async flush during in-window profile switch (avoids blocking the renderer). */
ipcMain.handle('axis-flush-session-async', async (event, payload) => {
  try {
    applyAxisSessionFlushPayload(event, payload);
    return true;
  } catch (e) {
    console.error('axis-flush-session-async failed:', e);
    return false;
  }
});

ipcMain.handle('get-extensions', async (event) => {
  const pid = getProfileIdForEvent(event);
  await migrateAxisExtensionPopupPagesIfNeeded(pid);
  return await listAxisExtensions(pid);
});

ipcMain.handle('axis-get-adblock-stats', (event, opts = {}) => {
  const pid = getProfileIdForEvent(event);
  const bucket = getAdblockStatsBucket(pid);
  const enabled = getProfileStore(pid).get('adBlockerEnabled', true) !== false;
  const webContentsId = Number(opts.webContentsId) || 0;
  const pageHostname = typeof opts.pageHostname === 'string' ? opts.pageHostname.trim() : '';
  const siteDisabled = pageHostname ? isAdblockDisabledForSite(pid, pageHostname) : false;
  let pageBlocked = 0;
  if (webContentsId > 0) {
    pageBlocked = bucket.byWebContents.get(webContentsId)?.count || 0;
  }
  return {
    enabled,
    siteDisabled,
    active: enabled && !siteDisabled,
    totalBlocked: bucket.totalBlocked,
    pageBlocked,
    pageHostname,
    engineReady: !!axisAdblockBlocker,
  };
});

ipcMain.handle('axis-reset-adblock-page-stats', (event, payload = {}) => {
  const pid = getProfileIdForEvent(event);
  const webContentsId = Number(payload.webContentsId) || 0;
  const pageUrl = typeof payload.pageUrl === 'string' ? payload.pageUrl : '';
  axisResetAdblockPageStats(pid, webContentsId, pageUrl);
  return { ok: true };
});

ipcMain.handle('axis-set-adblock-site-exception', (event, payload = {}) => {
  const pid = getProfileIdForEvent(event);
  const hostname = typeof payload.hostname === 'string' ? payload.hostname : '';
  const disabled = payload.disabled !== false;
  const ok = setAdblockSiteException(pid, hostname, disabled);
  return { ok };
});

ipcMain.handle('axis-get-page-security-info', async (event, opts = {}) => {
  const webContentsId = Number(opts.webContentsId) || 0;
  const pageUrl = typeof opts.pageUrl === 'string' ? opts.pageUrl : '';
  try {
    return await getPageSecurityInfo(webContentsId, pageUrl);
  } catch (_) {
    return { state: 'unknown', hostname: '', protocol: '', origin: '', chain: [] };
  }
});

/** Fetch remote text (RSS feeds, weather, etc.) without renderer CORS limits. */
ipcMain.handle('axis-fetch-text', async (_event, rawUrl) => {
  const url = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  if (!/^https?:\/\//i.test(url)) return { ok: false, text: '', error: 'invalid-url' };
  try {
    const res = await net.fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json,text/plain,*/*',
        'User-Agent': 'Mozilla/5.0 (compatible; AxisBrowser/1.0)'
      }
    });
    if (!res.ok) return { ok: false, text: '', error: `http-${res.status}` };
    const text = await res.text();
    return { ok: true, text: String(text || '').slice(0, 2_000_000) };
  } catch (err) {
    return { ok: false, text: '', error: String(err?.message || err || 'fetch-failed') };
  }
});

/** Geocode cities for Settings weather picker (Open-Meteo, no API key). */
ipcMain.handle('axis-search-weather-cities', async (_event, rawQuery, rawLimit) => {
  const q = String(rawQuery || '').trim();
  if (q.length < 2) return { ok: true, results: [] };
  const limit = Math.min(20, Math.max(1, Number(rawLimit) || 12));
  const url =
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}` +
    `&count=${limit}&language=en&format=json`;
  try {
    const res = await net.fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) return { ok: false, results: [], error: `http-${res.status}` };
    const data = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : [];
    const results = rows.map((hit) => {
      const name = hit.name || '';
      const admin1 = hit.admin1 || '';
      const country = hit.country || '';
      const countryCode = hit.country_code || '';
      const labelParts = [name];
      if (admin1) labelParts.push(admin1);
      if (country) labelParts.push(country);
      else if (countryCode) labelParts.push(String(countryCode).toUpperCase());
      const short = countryCode
        ? `${name}, ${String(countryCode).toUpperCase()}`
        : country
          ? `${name}, ${country}`
          : name;
      return {
        name,
        admin1,
        country,
        countryCode,
        timezone: hit.timezone || '',
        latitude: hit.latitude,
        longitude: hit.longitude,
        label: labelParts.filter(Boolean).join(', '),
        short
      };
    });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, results: [], error: String(err?.message || err || 'search-failed') };
  }
});

/** Ticker / symbol search for Markets widget settings (Yahoo Finance, no API key). */
ipcMain.handle('axis-search-tickers', async (_event, rawQuery, rawLimit) => {
  const q = String(rawQuery || '').trim();
  if (q.length < 1) return { ok: true, results: [] };
  const limit = Math.min(12, Math.max(1, Number(rawLimit) || 8));
  const url =
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}` +
    `&quotesCount=${limit}&newsCount=0&listsCount=0`;
  try {
    const res = await net.fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; AxisBrowser/1.0)'
      }
    });
    if (!res.ok) return { ok: false, results: [], error: `http-${res.status}` };
    const data = await res.json();
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    const results = quotes
      .map((hit) => {
        const symbol = String(hit.symbol || '').toUpperCase();
        if (!symbol) return null;
        return {
          symbol,
          name: hit.shortname || hit.longname || hit.name || symbol,
          type: hit.quoteType || hit.typeDisp || '',
          exch: hit.exchDisp || hit.exchange || ''
        };
      })
      .filter(Boolean)
      .slice(0, limit);
    return { ok: true, results };
  } catch (err) {
    return { ok: false, results: [], error: String(err?.message || err || 'search-failed') };
  }
});

ipcMain.handle('get-store-listing-install-status', async (event, rawUrl) => {
  const pid = getProfileIdForEvent(event);
  await migrateAxisExtensionPopupPagesIfNeeded(pid);
  return await resolveStoreListingInstallStatus(pid, rawUrl);
});

ipcMain.handle('install-extension', async (event) => {
  const pid = getProfileIdForEvent(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  return installAxisExtensionFromFolder(win && !win.isDestroyed() ? win : undefined, pid);
});

ipcMain.handle('install-extension-from-web-store', async (event, rawInput) => {
  const out = await installExtensionFromStoreUrlOrId(rawInput, getProfileIdForEvent(event));
  return { canceled: false, ...out };
});

/** Absolute path for `<webview preload>` — Chrome Web Store click bridge. */
ipcMain.handle('get-webview-cws-preload-path', () =>
  path.join(__dirname, 'webview-preload-bundle.js')
);

/** Lighter guest preload without vault credential listeners (saves RAM on normal pages). */
ipcMain.handle('get-webview-light-preload-path', () =>
  path.join(__dirname, 'webview-preload-light.js')
);

ipcMain.handle('install-extension-crx', async (event) => {
  const pid = getProfileIdForEvent(event);
  const win = BrowserWindow.fromWebContents(event.sender);
  return installAxisExtensionFromCrxFile(win && !win.isDestroyed() ? win : undefined, pid);
});

ipcMain.handle('set-extension-enabled', async (event, id, enabled) => {
  return setAxisExtensionEnabled(id, enabled, getProfileIdForEvent(event));
});

ipcMain.handle('remove-extension', async (event, id) => {
  return removeAxisExtension(id, getProfileIdForEvent(event));
});

ipcMain.handle('open-extension-options', async (event, id) => {
  return openAxisExtensionOptions(id, getProfileIdForEvent(event));
});

ipcMain.handle('open-extension-popup', async (event, id) => {
  const pid = getProfileIdForEvent(event);
  const win = getWindowFromSender(event.sender);
  return openAxisExtensionPopup(id, pid, win || undefined);
});

// Keyboard shortcuts management
ipcMain.handle('get-shortcuts', (event) => {
  return getShortcuts(getProfileIdForEvent(event));
});

ipcMain.handle('get-default-shortcuts', () => {
  return getDefaultShortcuts();
});

ipcMain.handle('get-shortcut-overrides', (event) => {
  return getShortcutOverrides(getProfileIdForEvent(event));
});

ipcMain.handle('set-shortcuts', (event, shortcuts) => {
  const pid = getProfileIdForEvent(event);
  getProfileStore(pid).set('keyboardShortcuts', shortcuts);
  unregisterShortcuts();
  registerShortcuts();
  createMenu();
  broadcastSettingsUpdated(pid);
  return shortcuts;
});

ipcMain.handle('reset-shortcuts', (event) => {
  const pid = getProfileIdForEvent(event);
  getProfileStore(pid).delete('keyboardShortcuts');
  unregisterShortcuts();
  registerShortcuts();
  broadcastSettingsUpdated(pid);
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
ipcMain.handle('get-history', (event) => {
  return getHistoryItems(getProfileIdForEvent(event));
});

ipcMain.handle('add-history-item', (event, item) => {
  const pid = getProfileIdForEvent(event);
  const history = getHistoryItems(pid);
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
  
  // Add to beginning and cap at profile limit
  history.unshift(newItem);
  setHistoryItems(pid, history);
  return newItem;
});

ipcMain.handle('clear-history', (event) => {
  setHistoryItems(getProfileIdForEvent(event), []);
  return true;
});

ipcMain.handle('delete-history-item', (event, id) => {
  const pid = getProfileIdForEvent(event);
  const history = getHistoryItems(pid);
  const filtered = history.filter((item) => item.id !== id);
  setHistoryItems(pid, filtered);
  return true;
});

// Downloads management (history of browser downloads)
ipcMain.handle('get-downloads', (event) => {
  return getDownloadItems(getProfileIdForEvent(event));
});

ipcMain.handle('get-active-downloads', () => {
  return listAxisActiveDownloads();
});

ipcMain.handle('cancel-active-download', (_event, axisId) => {
  const id = Number(axisId);
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'bad-id' };
  for (const item of axisActiveDownloadItems) {
    const meta = axisDownloadItemMeta.get(item);
    if (meta && meta.axisId === id) {
      try {
        item.cancel();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    }
  }
  return { ok: false, error: 'not-found' };
});

ipcMain.handle('add-download', (event, downloadInfo) => {
  const pid = getProfileIdForEvent(event);
  const downloads = getDownloadItems(pid);
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
  setDownloadItems(pid, downloads);
  return newDownload;
});

ipcMain.handle('update-download-progress', (event, id, progress) => {
  const pid = getProfileIdForEvent(event);
  const downloads = getDownloadItems(pid);
  const download = downloads.find((d) => d.id === id);
  if (download) {
    download.receivedBytes = progress.receivedBytes;
    download.status = progress.status || download.status;
    setDownloadItems(pid, downloads);
  }
  return download;
});

ipcMain.handle('clear-downloads', (event) => {
  setDownloadItems(getProfileIdForEvent(event), []);
  return true;
});

ipcMain.handle('delete-download', (event, id) => {
  const pid = getProfileIdForEvent(event);
  const downloads = getDownloadItems(pid);
  const filtered = downloads.filter((item) => item.id !== id);
  setDownloadItems(pid, filtered);
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

ipcMain.handle('open-or-focus-incognito-window', () => {
  const focused = focusExistingIncognitoWindow();
  if (!focused) createIncognitoWindow();
  return true;
});

ipcMain.handle('open-or-focus-personal-window', () => {
  const focused = focusExistingPersonalWindow();
  if (!focused) createWindow({ profileId: AXIS_DEFAULT_PROFILE_ID });
  return true;
});

ipcMain.handle('check-for-updates', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  return axisUpdateCheck.checkForUpdates({
    parentWindow: win && !win.isDestroyed() ? win : undefined
  });
});

ipcMain.handle('open-external-url', async (_event, url) => {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url.trim())) return false;
  try {
    await shell.openExternal(url.trim());
    return true;
  } catch (e) {
    console.error('open-external-url failed:', e);
    return false;
  }
});

ipcMain.handle('get-axis-session-recovery', () => ({
  lastExitClean: axisSessionLastExitClean
}));

ipcMain.handle('get-profile-bootstrap', (_event, profileId) => {
  const id = sanitizeProfileId(profileId || AXIS_DEFAULT_PROFILE_ID);
  const profileStore = getProfileStore(id);
  return {
    settings: mergeGlobalSettingsIntoProfileSettings(profileStore.store),
    pinnedTabs: profileStore.get('pinnedTabs', []),
    tabGroups: profileStore.get('tabGroups', []),
    unpinnedTabs: profileStore.get('unpinnedTabs', []),
    unpinnedTabsRecovery: profileStore.get('unpinnedTabsRecovery', []),
    pinnedSidebarOrder: profileStore.get('pinnedSidebarOrder', []),
    favorites: profileStore.get('favorites', [])
  };
});

ipcMain.handle('get-profiles', () => {
  return listAxisProfiles();
});

ipcMain.handle('create-profile', (_event, payload) => {
  const { id, name } = allocateProfileId(payload?.name || payload?.id || 'New Profile');
  const icon = sanitizeProfileIcon(payload?.icon);
  ensureAxisProfile(id, name, icon);
  broadcastProfilesUpdated();
  return { id, name, icon };
});

ipcMain.handle('update-profile', (_event, payload) => {
  const id = sanitizeProfileId(payload?.id || payload?.profileId);
  const updates = {};
  if (payload?.name != null) updates.name = payload.name;
  if (payload?.icon != null) updates.icon = payload.icon;
  return updateAxisProfile(id, updates);
});

ipcMain.handle('reorder-profiles', (_event, orderedIds) => reorderAxisProfiles(orderedIds));

ipcMain.handle('delete-profile', async (_event, payload) => {
  const id = sanitizeProfileId(payload?.id || payload?.profileId);
  if (id === AXIS_DEFAULT_PROFILE_ID) {
    return { ok: false, error: 'The Personal profile cannot be deleted.' };
  }
  const profileName = getProfileName(id);
  if (payload?.skipChecks !== true) {
    const authed = await axisVerifyDeviceOwner('Delete this profile');
    if (!authed) return { ok: false, cancelled: true };
    const { response } = await dialog.showMessageBox({
      type: 'warning',
      message: `Delete “${profileName}”?`,
      detail:
        'The profile will be moved to trash with its tabs, cookies, history, saved passwords, extensions, and settings. You can restore it from Settings → Profiles or press ⌘Z right after deleting.',
      buttons: ['Cancel', 'Delete Profile'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    });
    if (response !== 1) return { ok: false, cancelled: true };
  }
  try {
    const result = await deleteAxisProfile(id);
    return result;
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not delete profile' };
  }
});

ipcMain.handle('list-trashed-profiles', () => profileTrash.listTrashedProfiles());

ipcMain.handle('restore-trashed-profile', async (_event, payload) => {
  try {
    const trashId = payload?.trashId || payload?.id;
    const restored = await profileTrash.restoreTrashedProfile(trashId);
    broadcastProfilesUpdated();
    return restored;
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not restore profile' };
  }
});

ipcMain.handle('permanently-delete-trashed-profile', async (_event, payload) => {
  try {
    const trashId = payload?.trashId || payload?.id;
    return await profileTrash.permanentlyDeleteTrashedProfile(trashId);
  } catch (err) {
    return { ok: false, error: err?.message || 'Could not delete profile from trash' };
  }
});

ipcMain.handle('open-or-focus-profile-window', (event, profileId) => {
  openOrFocusProfileWindowById(profileId, event?.sender);
  return true;
});

ipcMain.handle('switch-profile-in-window', async (event, profileId) => {
  const win = getWindowFromSender(event?.sender);
  if (!win || win.isDestroyed() || win.__axisIsIncognito === true) {
    return { ok: false };
  }
  const fromProfileId = sanitizeProfileId(win.__axisProfileId || AXIS_DEFAULT_PROFILE_ID);
  const id = ensureAxisProfile(profileId || AXIS_DEFAULT_PROFILE_ID);
  const ok = await switchProfileInBrowserWindow(win, id);
  return { ok: !!ok, profileId: id, fromProfileId };
});

ipcMain.handle('get-current-profile-id', (event) => {
  return getProfileIdForEvent(event);
});

ipcMain.handle('list-importable-browsers', () => listImportableBrowsers());

ipcMain.handle('list-browser-import-profiles', (_event, browserId) => {
  return listBrowserImportProfiles(browserId);
});

function axisIsDefaultBrowser() {
  try {
    const httpOk = app.isDefaultProtocolClient('http');
    const httpsOk = app.isDefaultProtocolClient('https');
    return !!(httpOk && httpsOk);
  } catch (_) {
    return false;
  }
}

ipcMain.handle('axis-get-default-browser-status', () => {
  return {
    isDefault: axisIsDefaultBrowser(),
    platform: process.platform
  };
});

ipcMain.handle('axis-set-as-default-browser', async () => {
  let registered = false;
  try {
    registered = !!(app.setAsDefaultProtocolClient('http') && app.setAsDefaultProtocolClient('https'));
  } catch (_) {
    registered = false;
  }
  const isDefault = axisIsDefaultBrowser();
  return { ok: registered || isDefault, isDefault, registered };
});

ipcMain.handle('axis-open-default-browser-settings', async () => {
  try {
    if (process.platform === 'darwin') {
      await new Promise((resolve) => {
        exec('open "x-apple.systempreferences:com.apple.Default-Browser"', () => {
          exec(
            'open "x-apple.systempreferences:com.apple.preference.general"',
            () => resolve()
          );
        });
      });
      return { ok: true };
    }
    if (process.platform === 'win32') {
      await shell.openExternal('ms-settings:defaultapps');
      return { ok: true };
    }
    // Linux: best-effort; desktops vary.
    try {
      await shell.openExternal('xdg-settings');
    } catch (_) {}
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('inspect-import-profile-folder', (_event, folderPath) => {
  try {
    return inspectCustomProfileFolder(folderPath);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('pick-browser-profile-folder', async (event) => {
  const win = getWindowFromSender(event?.sender);
  const result = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: 'Choose a browser profile folder',
    properties: ['openDirectory']
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true };
  return { ok: true, path: result.filePaths[0] };
});

ipcMain.handle('import-browser-profile', async (event, payload) => {
  try {
    return await importBrowserProfileData(
      {
        allocateProfileId,
        ensureAxisProfile,
        getProfileStore,
        normalizeFavoritesStoreList,
        broadcastProfilesUpdated,
        broadcastSettingsUpdated,
        sanitizeProfileIcon,
        ensureAxisVaultForProfile,
        cleanSitePermissionOverrides,
        broadcastExtensionsReady,
        installExtensionForProfileImport: async (profileId, spec) => {
          const pid = sanitizeProfileId(profileId);
          if (spec.folder) {
            return commitAxisExtensionInstall(spec.folder, pid);
          }
          if (spec.url) {
            return installExtensionFromStoreUrlOrId(spec.url, pid);
          }
          if (spec.id) {
            return installExtensionFromStoreUrlOrId(spec.id, pid);
          }
          throw new Error('Invalid extension import spec');
        }
      },
      payload || {}
    );
  } catch (e) {
    console.error('import-browser-profile failed:', e);
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('preview-browser-import', (_event, payload) => {
  try {
    return previewBrowserImport(payload || {});
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('get-profile-global-settings', () => getProfileGlobalSettings());

ipcMain.handle('set-profile-global-setting', (_event, key, value) => {
  const result = setProfileGlobalSetting(key, value);
  if (result == null) return { ok: false };
  broadcastSettingsUpdated(null);
  return { ok: true, value: result };
});

ipcMain.handle('get-profiles-overview-for-window', (event) => ({
  profiles: getProfilesOverview(),
  currentProfileId: getProfileIdForEvent(event)
}));

ipcMain.handle('export-axis-profile', async (event, profileId) => {
  const pid = sanitizeProfileId(profileId || getProfileIdForEvent(event));
  const meta = listAxisProfiles().find((p) => p.id === pid);
  const vault = ensureAxisVaultForProfile(pid).ensureLoaded();
  const payload = buildAxisProfileExportPayload(getProfileStore(pid), meta, vault);
  const win = getWindowFromSender(event?.sender);
  const safeName = String(meta?.name || pid).replace(/[^\w\s-]/g, '').trim() || 'profile';
  const result = await dialog.showSaveDialog(win && !win.isDestroyed() ? win : undefined, {
    title: 'Export Axis profile',
    defaultPath: `${safeName}-axis-profile.json`,
    filters: [{ name: 'Axis Profile', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePath) return { ok: false, cancelled: true };
  await fs.promises.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
  return { ok: true, path: result.filePath };
});

ipcMain.handle('import-axis-profile-backup', async (event) => {
  const win = getWindowFromSender(event?.sender);
  const result = await dialog.showOpenDialog(win && !win.isDestroyed() ? win : undefined, {
    title: 'Import Axis profile backup',
    properties: ['openFile'],
    filters: [{ name: 'Axis Profile', extensions: ['json'] }]
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false, cancelled: true };
  try {
    const raw = await fs.promises.readFile(result.filePaths[0], 'utf8');
    const payload = JSON.parse(raw);
    const imported = importAxisProfileBackup(
      {
        allocateProfileId,
        ensureAxisProfile,
        getProfileStore,
        normalizeFavoritesStoreList,
        broadcastProfilesUpdated,
        sanitizeProfileIcon,
        ensureAxisVaultForProfile,
        cleanSitePermissionOverrides
      },
      payload
    );
    return imported;
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('open-url-in-new-window', (event, url) => {
  if (typeof url === 'string' && isSafeHttpUrl(url)) {
    openUrlInNewBrowserWindow(url);
  }
  return true;
});

// Notes management
ipcMain.handle('get-notes', (event) => {
  return getNoteItems(getProfileIdForEvent(event));
});

ipcMain.handle('save-note', (event, note) => {
  const pid = getProfileIdForEvent(event);
  const notes = getNoteItems(pid);
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
  
  setNoteItems(pid, notes);
  return notes[existingIndex !== -1 ? existingIndex : 0];
});

ipcMain.handle('delete-note', (event, id) => {
  const pid = getProfileIdForEvent(event);
  const notes = getNoteItems(pid);
  const filtered = notes.filter((note) => note.id !== id);
  setNoteItems(pid, filtered);
  return true;
});

/** Native emoji / character picker (macOS Character Viewer, Windows emoji panel). */
function supportsNativeEmojiPanel() {
  return process.platform === 'darwin' || process.platform === 'win32';
}

/**
 * Open the system emoji panel after restoring focus to the field that opened the menu.
 * Without this, the context menu leaves focus on the wrong target and macOS IMK logs
 * `IMKCFRunLoopWakeUpReliable` (and insertion can miss the text box).
 */
function showNativeEmojiPanel(targetWebContents = null) {
  const run = () => {
    try {
      let wc =
        targetWebContents && !targetWebContents.isDestroyed() ? targetWebContents : null;
      if (!wc) {
        const focused = BrowserWindow.getFocusedWindow();
        wc = focused && !focused.isDestroyed() ? focused.webContents : null;
      }
      if (wc && !wc.isDestroyed()) {
        let hostWin = BrowserWindow.fromWebContents(wc);
        if (
          (!hostWin || hostWin.isDestroyed()) &&
          wc.hostWebContents &&
          !wc.hostWebContents.isDestroyed()
        ) {
          hostWin = BrowserWindow.fromWebContents(wc.hostWebContents);
        }
        if (hostWin && !hostWin.isDestroyed()) {
          try {
            hostWin.focus();
          } catch (_) {}
        }
        try {
          wc.focus();
        } catch (_) {}
        const hostWc =
          wc.hostWebContents && !wc.hostWebContents.isDestroyed()
            ? wc.hostWebContents
            : wc;
        try {
          if (hostWc && !hostWc.isDestroyed()) {
            hostWc.send('axis-refocus-editable-for-emoji');
          }
        } catch (_) {}
      }
      if (typeof app.showEmojiPanel === 'function') app.showEmojiPanel();
    } catch (_) {}
  };
  // Menu teardown runs after the click handler; wait so IMK attaches to the field.
  setTimeout(run, 30);
}

/** Append “Emoji and Symbols” for editable text fields (same idea as Chrome / Safari). */
function appendEmojiAndSymbolsMenuItems(template, targetWebContents = null) {
  if (!supportsNativeEmojiPanel() || !Array.isArray(template)) return;
  const last = template[template.length - 1];
  if (!last || last.type !== 'separator') {
    template.push({ type: 'separator' });
  }
  template.push({
    label: 'Emoji and Symbols',
    click: () => showNativeEmojiPanel(targetWebContents)
  });
}

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

// Persist a custom dictionary word across every Axis session so it survives restarts and
// applies to both normal and incognito windows.
ipcMain.handle('add-to-spellcheck-dictionary', async (_event, word) => {
  return addWordToAllSpellCheckerDictionaries(word);
});

// Webpage context menu — spelling (editable) → link → image → navigation → edit → selection tools → page
ipcMain.handle('show-webpage-context-menu', async (event, x, y, contextInfo) => {
  const ctx = contextInfo || {};
  const template = [];

  // Pull the freshest cached `context-menu` params from any guest <webview> that
  // belongs to the caller. Electron's `context-menu` event on macOS webview guests
  // returns empty `misspelledWord` / `dictionarySuggestions` even when Chromium is
  // flagging a word, so we also run our own nspell check below.
  let guest = null;
  let cached = null;
  try {
    const { webContents } = require('electron');
    const guestId = Number(ctx.guestWebContentsId || 0);
    if (guestId > 0) {
      const specific = webContents.fromId(guestId);
      if (specific && !specific.isDestroyed()) {
        guest = specific;
        if (specific.__axisLastContextMenuParams) cached = specific.__axisLastContextMenuParams;
      }
    }
    if (!guest || !cached) {
      const all = webContents.getAllWebContents();
      let bestWc = null;
      let bestAt = 0;
      for (const wc of all) {
        if (!wc || wc.isDestroyed() || !wc.__axisLastContextMenuParams) continue;
        const host = wc.hostWebContents;
        if (host && host.id === event.sender.id) {
          const at = wc.__axisLastContextMenuParams.at || 0;
          if (at > bestAt) { bestWc = wc; bestAt = at; }
        }
      }
      if (bestWc) {
        guest = guest || bestWc;
        cached = cached || bestWc.__axisLastContextMenuParams;
      }
    }
    if (cached && Date.now() - (cached.at || 0) < 2500) {
      if (cached.isEditable) ctx.isEditable = true;
      if (!ctx.misspelledWord && cached.misspelledWord) ctx.misspelledWord = cached.misspelledWord;
      if ((!Array.isArray(ctx.dictionarySuggestions) || ctx.dictionarySuggestions.length === 0)
          && Array.isArray(cached.dictionarySuggestions) && cached.dictionarySuggestions.length) {
        ctx.dictionarySuggestions = cached.dictionarySuggestions.slice();
      }
      if (typeof cached.x === 'number') ctx.x = cached.x;
      if (typeof cached.y === 'number') ctx.y = cached.y;
      if (!ctx.selectionText && cached.selectionText) ctx.selectionText = cached.selectionText;
    }
  } catch (_) {}

  // Manual spellcheck fallback: when editable + no flagged word from Chromium, extract
  // the word under the cursor from the guest and check it with nspell + dictionary-en.
  // `__axisReplaceWord` is carried along so `replace-misspelling` knows which word to
  // swap if the menu item is clicked.
  ctx.__axisReplaceWord = '';
  try {
    if (ctx.isEditable && guest && !guest.isDestroyed()) {
      const haveNativeMisspell = typeof ctx.misspelledWord === 'string' && ctx.misspelledWord.trim().length > 0;
      if (!haveNativeMisspell) {
        await ensureSpellEngineLoaded();
        if (axisSpellEngine) {
          const cx = Number(ctx.x) || 0;
          const cy = Number(ctx.y) || 0;
          let candidate = (typeof ctx.selectionText === 'string' ? ctx.selectionText.trim() : '');
          if (!candidate || /\s/.test(candidate)) {
            candidate = await getWordAtGuestPoint(guest, cx, cy);
          }
          const cleaned = String(candidate || '').replace(/^[^A-Za-z'\-]+|[^A-Za-z'\-]+$/g, '');
          if (cleaned && /[A-Za-z]/.test(cleaned) && isWordMisspelled(cleaned)) {
            ctx.misspelledWord = cleaned;
            ctx.dictionarySuggestions = getSpellSuggestions(cleaned, 6);
            ctx.__axisReplaceWord = cleaned;
          }
        }
      }
    }
  } catch (error) {
    console.warn('[axis:spell] manual check failed:', error);
  }

  // --- Spelling suggestions (editable field + misspelled word)
  const misspelled = typeof ctx.misspelledWord === 'string' ? ctx.misspelledWord.trim() : '';
  const suggestions = Array.isArray(ctx.dictionarySuggestions) ? ctx.dictionarySuggestions : [];
  const manualReplaceWord = typeof ctx.__axisReplaceWord === 'string' ? ctx.__axisReplaceWord : '';
  if (ctx.isEditable && misspelled) {
    if (suggestions.length > 0) {
      const MAX_SUGGESTIONS = 6;
      for (const suggestion of suggestions.slice(0, MAX_SUGGESTIONS)) {
        const replacement = String(suggestion || '');
        if (!replacement) continue;
        template.push({
          label: replacement,
          click: () => {
            event.sender.send('webpage-context-menu-action', 'replace-misspelling', {
              replacement,
              manualReplaceWord
            });
          }
        });
      }
    } else {
      template.push({ label: 'No spelling suggestions', enabled: false });
    }
    template.push({
      label: 'Add to Dictionary',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'add-to-dictionary', { word: misspelled });
      }
    });
    template.push({ type: 'separator' });
  }

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
        event.sender.send('webpage-context-menu-action', 'open-image-new-tab', {
          srcURL: ctx.srcURL,
          pageURL: typeof ctx.pageURL === 'string' ? ctx.pageURL : ''
        });
      }
    });
    template.push({
      label: 'Save Image',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'save-image', {
          srcURL: ctx.srcURL,
          guestWebContentsId: Number(ctx.guestWebContentsId) || 0
        });
      }
    });
    template.push({
      label: 'Copy Image',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'copy-image', {
          x: ctx.x || 0,
          y: ctx.y || 0,
          guestWebContentsId: Number(ctx.guestWebContentsId) || 0
        });
      }
    });
    template.push({
      label: 'Copy Image Address',
      click: () => {
        event.sender.send('webpage-context-menu-action', 'copy-image-url', {
          srcURL: ctx.srcURL,
          pageURL: typeof ctx.pageURL === 'string' ? ctx.pageURL : ''
        });
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

  if (ctx.isEditable) {
    appendEmojiAndSymbolsMenuItems(template, guest && !guest.isDestroyed() ? guest : event.sender);
  }

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
  if (ctx.canUpdateSavedLink) {
    const updateLabel = ctx.savedLinkKind === 'favorite'
      ? 'Update Favorite to This Page'
      : 'Update Pinned Link to This Page';
    template.push({
      label: updateLabel,
      click: () => {
        event.sender.send('webpage-context-menu-action', 'update-saved-link');
      }
    });
    template.push({ type: 'separator' });
  }

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
      const hasXY =
        typeof ctx.x === 'number' &&
        !Number.isNaN(ctx.x) &&
        typeof ctx.y === 'number' &&
        !Number.isNaN(ctx.y);
      event.sender.send('webpage-context-menu-action', 'inspect', hasXY ? { x: ctx.x, y: ctx.y } : {});
    }
  });
  
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);

  menu.popup({ window });

  return true;
});

/** Save image from guest context menu — uses webview session (cookies) via `downloadURL`. */
ipcMain.handle('save-image-from-url', async (event, payload) => {
  const { webContents } = require('electron');
  const url = typeof payload?.url === 'string' ? payload.url.trim() : '';
  const guestId = Number(payload?.guestWebContentsId) || 0;
  if (!url) return { ok: false, error: 'no-url' };
  try {
    const guest = guestId > 0 ? webContents.fromId(guestId) : null;
    if (guest && !guest.isDestroyed()) {
      guest.downloadURL(url);
      return { ok: true };
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const wc = win && !win.isDestroyed() ? win.webContents : null;
    if (wc && !wc.isDestroyed()) {
      wc.downloadURL(url);
      return { ok: true };
    }
    return { ok: false, error: 'no-webcontents' };
  } catch (err) {
    console.error('save-image-from-url:', err);
    return { ok: false, error: String(err?.message || err) };
  }
});

/** Copy image at (x,y) in a guest webview — more reliable than `<webview>.copyImageAt` in some cases. */
ipcMain.handle('copy-image-at-guest', async (_event, payload) => {
  const { webContents } = require('electron');
  const guestId = Number(payload?.guestWebContentsId) || 0;
  const x = Math.round(Number(payload?.x) || 0);
  const y = Math.round(Number(payload?.y) || 0);
  if (guestId <= 0) return { ok: false, error: 'no-guest' };
  try {
    const guest = webContents.fromId(guestId);
    if (!guest || guest.isDestroyed()) return { ok: false, error: 'destroyed' };
    guest.copyImageAt(x, y);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
});

/** When `navigator.clipboard` / `execCommand` fail (common right after a native context menu). */
ipcMain.handle('write-clipboard-text', (_event, text) => {
  try {
    if (typeof text !== 'string') return { ok: false, error: 'not-string' };
    clipboard.writeText(text);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err?.message || err) };
  }
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
    }
  ];
  appendEmojiAndSymbolsMenuItems(template, event.sender);
  template.push(
    { type: 'separator' },
    {
      label: 'Paste and Go',
      enabled: canPasteAndGo,
      click: () => {
        event.sender.send('urlbar-context-menu-action', 'paste-and-go', { text: clipboard.readText() || '' });
      }
    }
  );

  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  menu.popup({ window });
  return true;
});

/** Shell text fields (search, chat, find, rename, etc.) — standard edit + emoji. */
ipcMain.handle('show-editable-context-menu', async (event, _x, _y, contextInfo) => {
  const ctx = contextInfo || {};
  const template = [
    {
      label: 'Cut',
      enabled: ctx.canCut !== false && !!ctx.isEditable,
      role: 'cut'
    },
    {
      label: 'Copy',
      enabled: ctx.canCopy !== false && (!!ctx.hasSelection || !!ctx.isEditable),
      role: 'copy'
    },
    {
      label: 'Paste',
      enabled: ctx.canPaste !== false && !!ctx.isEditable,
      role: 'paste'
    },
    {
      label: 'Select All',
      role: 'selectAll'
    }
  ];
  appendEmojiAndSymbolsMenuItems(template, event.sender);
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
    },
    {
      label: 'Reset Icon',
      enabled: !!info.hasCustomIcon,
      click: () => {
        event.sender.send('tab-context-menu-action', 'reset-icon');
      }
    }
  );
  if (!info.isIncognito) {
    template.push({
      label: 'Add to Favorites',
      click: () => {
        event.sender.send('tab-context-menu-action', 'add-to-favorites');
      }
    });
  }
  if (info.canUpdateSavedLink) {
    const updateLabel = info.savedLinkKind === 'favorite'
      ? 'Update Favorite to This Page'
      : 'Update Pinned Link to This Page';
    template.push({
      label: updateLabel,
      click: () => {
        event.sender.send('tab-context-menu-action', 'update-saved-link');
      }
    });
  }

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

// Sidebar favorites — navigation, copy, rename/icon, remove (no instant delete on right-click)
ipcMain.handle('show-favorite-context-menu', async (event, _x, _y, info) => {
  const meta = info || {};
  const template = [
    {
      label: 'Open',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'open');
      }
    },
    {
      label: 'Open in New Tab',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'open-new-tab');
      }
    },
    {
      label: 'Copy Link',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'copy-link');
      }
    }
  ];
  if (meta.canUpdateSavedLink) {
    template.push({
      label: 'Update Link to Current Page',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'update-saved-link');
      }
    });
  }
  template.push(
    {
      label: 'Rename…',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'rename');
      }
    },
    { type: 'separator' },
    {
      label: 'Change Icon',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'change-icon');
      }
    },
    {
      label: 'Reset Icon',
      enabled: !!meta.hasCustomIcon,
      click: () => {
        event.sender.send('favorite-context-menu-action', 'reset-icon');
      }
    },
    { type: 'separator' },
    {
      label: 'Remove from Favorites',
      click: () => {
        event.sender.send('favorite-context-menu-action', 'remove');
      }
    }
  );
  const menu = Menu.buildFromTemplate(template);
  const window = BrowserWindow.fromWebContents(event.sender);
  menu.popup({ window });
  return true;
});

// Tab group — edit & appearance, then destructive delete
ipcMain.handle('show-tab-group-context-menu', async (event, _x, _y, info) => {
  const meta = info || {};
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
    {
      label: 'Reset Icon',
      enabled: !!meta.hasCustomIcon,
      click: () => {
        event.sender.send('tab-group-context-menu-action', 'reset-icon');
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

// Icon picker — in-renderer macOS-style popover (renderer owns UI)
ipcMain.handle('show-icon-picker', async () => true);

ipcMain.on('axis-undo-pending', (event, pending) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.__axisUndoPending = !!pending;
  }
});

ipcMain.on('confirm-quit', () => {
  void finishConfirmedQuit();
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

