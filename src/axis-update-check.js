/**
 * GitHub release update check for Axis (main process only).
 * Compares app.getVersion() to the latest GitHub release; offers download when remote is newer.
 * Same or newer local builds never get an update prompt.
 */
const { app, dialog, shell, net, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const DEFAULT_GITHUB_REPO = 'AbdelrahmanBerchan/Axis-Browser';
const GITHUB_API = 'https://api.github.com';

let checkInProgress = false;
let getParentWindow = () => BrowserWindow.getFocusedWindow() || null;

function resolveGithubRepo() {
  const fromEnv = String(process.env.AXIS_UPDATE_GITHUB_REPO || '').trim();
  if (fromEnv && fromEnv.includes('/')) return fromEnv.replace(/^\/+|\/+$/g, '');
  return DEFAULT_GITHUB_REPO;
}

function isUpdateCheckDisabled() {
  return String(process.env.AXIS_UPDATE_SKIP || '').trim() === '1';
}

/** @returns {number[]|null} */
function parseVersionParts(raw) {
  const s = String(raw || '').trim().replace(/^[vV]/, '');
  const core = s.split(/[-+]/, 1)[0];
  if (!core || !/^\d+(?:\.\d+)*$/.test(core)) return null;
  return core.split('.').map((n) => parseInt(n, 10) || 0);
}

/**
 * @returns {-1|0|1|null} like String.localeCompare for semver-ish tuples
 */
function compareVersions(a, b) {
  const pa = parseVersionParts(a);
  const pb = parseVersionParts(b);
  if (!pa || !pb) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

function formatVersionLabel(raw) {
  const parts = parseVersionParts(raw);
  if (!parts) return String(raw || '').trim() || 'unknown';
  return parts.join('.');
}

function parentForDialog(explicit) {
  if (explicit && !explicit.isDestroyed()) return explicit;
  const focused = getParentWindow();
  if (focused && !focused.isDestroyed()) return focused;
  return undefined;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
      redirect: 'follow'
    });
    request.setHeader('User-Agent', 'Axis-Browser-Update-Check');
    request.setHeader('Accept', 'application/vnd.github+json');
    let body = '';
    request.on('response', (response) => {
      response.on('data', (chunk) => {
        body += chunk.toString('utf8');
      });
      response.on('end', () => {
        const code = response.statusCode || 0;
        if (code >= 200 && code < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(new Error('Invalid response from GitHub.'));
          }
          return;
        }
        const err = new Error(
          code === 404
            ? 'No releases found on GitHub yet.'
            : `GitHub returned ${code}. Try again later.`
        );
        err.statusCode = code;
        reject(err);
      });
    });
    request.on('error', (err) => reject(err));
    request.end();
  });
}

function normalizeReleaseData(data, repo) {
  const tag = String(data.tag_name || data.name || '').trim();
  const version = formatVersionLabel(tag);
  const assets = Array.isArray(data.assets) ? data.assets : [];
  return {
    repo,
    version,
    tag,
    htmlUrl: String(data.html_url || `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag || 'latest')}`).trim(),
    releaseNotes: String(data.body || '').trim(),
    isPrerelease: !!data.prerelease,
    assets: assets.map((asset) => ({
      name: String(asset.name || '').trim(),
      url: String(asset.browser_download_url || '').trim(),
      size: Number(asset.size) || 0
    })).filter((asset) => asset.name && asset.url)
  };
}

function pickNewestRelease(releases) {
  let best = null;
  let bestVersion = null;
  for (const release of releases) {
    const tag = String(release.tag_name || release.name || '').trim();
    const version = formatVersionLabel(tag);
    if (!parseVersionParts(version)) continue;
    if (!best || compareVersions(version, bestVersion) > 0) {
      best = release;
      bestVersion = version;
    }
  }
  return best;
}

async function fetchReleaseList(repo) {
  const data = await fetchJson(`${GITHUB_API}/repos/${repo}/releases?per_page=30`);
  if (!Array.isArray(data)) {
    throw new Error('Invalid response from GitHub.');
  }
  return data.filter((release) => !release.draft);
}

async function fetchLatestRelease() {
  const repo = resolveGithubRepo();

  // Prefer GitHub's latest stable (non–pre-release) tag.
  try {
    const data = await fetchJson(`${GITHUB_API}/repos/${repo}/releases/latest`);
    return normalizeReleaseData(data, repo);
  } catch (err) {
    if (err.statusCode !== 404) throw err;
  }

  // GitHub returns 404 for /releases/latest when every release is a pre-release.
  // Fall back to the highest-version published release (including pre-releases).
  const releases = await fetchReleaseList(repo);
  if (releases.length === 0) {
    throw new Error('No releases found on GitHub yet.');
  }
  const picked = pickNewestRelease(releases) || releases[0];
  return normalizeReleaseData(picked, repo);
}

function pickReleaseAsset(assets) {
  const platform = process.platform;
  const arch = process.arch;
  const list = assets
    .map((asset) => ({ ...asset, lower: asset.name.toLowerCase() }))
    .filter((asset) => !asset.lower.endsWith('.blockmap') && !asset.lower.endsWith('.yml'));

  const find = (pred) => list.find(pred);

  if (platform === 'darwin') {
    const arm = arch === 'arm64';
    const macCandidates = list.filter((asset) => {
      const n = asset.lower;
      if (!n.endsWith('.dmg') && !n.endsWith('.zip')) return false;
      const isArmAsset = n.includes('arm64') || n.includes('aarch64');
      return arm ? isArmAsset || (!n.includes('x64') && !n.includes('x86_64')) : !isArmAsset;
    });
    return find((a) => a.lower.endsWith('.dmg') && macCandidates.includes(a))
      || macCandidates.find((a) => a.lower.endsWith('.dmg'))
      || macCandidates.find((a) => a.lower.endsWith('.zip'))
      || macCandidates[0];
  }

  if (platform === 'win32') {
    return find((a) => a.lower.endsWith('.exe') && a.lower.includes('setup'))
      || find((a) => a.lower.endsWith('.exe') && !a.lower.includes('portable'))
      || find((a) => a.lower.endsWith('.exe'));
  }

  if (platform === 'linux') {
    return find((a) => a.lower.endsWith('.appimage'));
  }

  return null;
}

function uniqueDestPath(dir, fileName) {
  const base = path.basename(fileName);
  let dest = path.join(dir, base);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(base);
  const stem = path.basename(base, ext);
  let i = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(dir, `${stem} (${i})${ext}`);
    i += 1;
  }
  return dest;
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const request = net.request({ method: 'GET', url, redirect: 'follow' });
    request.setHeader('User-Agent', 'Axis-Browser-Update-Check');
    request.on('response', (response) => {
      const code = response.statusCode || 0;
      if (code < 200 || code >= 300) {
        reject(new Error(`Download failed (${code}).`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      response.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(destPath));
      });
      file.on('error', (err) => {
        try {
          fs.unlinkSync(destPath);
        } catch (_) {}
        reject(err);
      });
    });
    request.on('error', reject);
    request.end();
  });
}

function truncateNotes(notes, max = 480) {
  const text = String(notes || '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trim()}…`;
}

async function showUpToDateDialog(parent, currentVersion, remoteVersion, isAhead, isPrerelease = false) {
  const appName = app.getName() || 'Axis';
  const prereleaseNote = isPrerelease ? ' (pre-release)' : '';
  const message = isAhead
    ? `${appName} ${currentVersion} is newer than the latest public release`
    : `You're up to date`;
  const detail = isAhead
    ? `You're running ${currentVersion}, which is ahead of the latest release on GitHub (${remoteVersion}${prereleaseNote}). No update is needed.`
    : `${appName} ${currentVersion} matches the latest release on GitHub${prereleaseNote}.`;
  await dialog.showMessageBox(parentForDialog(parent), {
    type: 'info',
    title: 'No update available',
    message,
    detail,
    buttons: ['OK'],
    defaultId: 0,
    cancelId: 0
  });
}

async function offerUpdateDialog(parent, release, currentVersion) {
  const appName = app.getName() || 'Axis';
  const notes = truncateNotes(release.releaseNotes);
  const asset = pickReleaseAsset(release.assets);
  const detailParts = [
    `You're on ${currentVersion}. ${appName} ${release.version} is available on GitHub.`,
    notes ? `\n${notes}` : ''
  ];
  if (asset) {
    detailParts.push(`\n\nDownload: ${asset.name}`);
  } else {
    detailParts.push('\n\nOpen the release page to download the installer for your system.');
  }

  const buttons = asset
    ? ['Download update', 'View on GitHub', 'Not now']
    : ['View on GitHub', 'Not now'];
  const result = await dialog.showMessageBox(parentForDialog(parent), {
    type: 'info',
    title: `Update available — ${appName} ${release.version}`,
    message: `A new version of ${appName} is available`,
    detail: detailParts.join(''),
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
    noLink: true
  });

  const choice = result.response;
  if (asset && choice === 0) {
    await downloadAndOpenUpdate(parent, release, asset);
    return;
  }
  if ((asset && choice === 1) || (!asset && choice === 0)) {
    await shell.openExternal(release.htmlUrl);
  }
}

async function downloadAndOpenUpdate(parent, release, asset) {
  const downloadsDir = app.getPath('downloads');
  const destPath = uniqueDestPath(downloadsDir, asset.name);
  try {
    await downloadFile(asset.url, destPath);
  } catch (err) {
    await dialog.showMessageBox(parentForDialog(parent), {
      type: 'error',
      title: 'Download failed',
      message: 'Could not download the update',
      detail: `${err && err.message ? err.message : 'Something went wrong.'}\n\nYou can download it from GitHub instead.`,
      buttons: ['Open GitHub', 'OK'],
      defaultId: 0,
      cancelId: 1
    }).then((res) => {
      if (res.response === 0) void shell.openExternal(release.htmlUrl);
    });
    return;
  }

  const openResult = await shell.openPath(destPath);
  if (openResult) {
    await dialog.showMessageBox(parentForDialog(parent), {
      type: 'info',
      title: 'Update downloaded',
      message: 'The installer is in your Downloads folder',
      detail: `Saved as ${path.basename(destPath)}.\n\nQuit ${app.getName() || 'Axis'} before installing if the installer asks you to.`,
      buttons: ['Show in Finder', 'OK'],
      defaultId: 1,
      cancelId: 1
    }).then((res) => {
      if (res.response === 0) void shell.showItemInFolder(destPath);
    });
    return;
  }

  await dialog.showMessageBox(parentForDialog(parent), {
    type: 'info',
    title: 'Update downloaded',
    message: 'Opening the installer',
    detail: `Axis ${release.version} was saved to Downloads. Quit the app before installing if prompted.`,
    buttons: ['OK'],
    defaultId: 0
  });
}

async function checkForUpdates(options = {}) {
  if (isUpdateCheckDisabled()) return { skipped: true };
  if (checkInProgress) return { busy: true };

  checkInProgress = true;
  const parent = options.parentWindow;
  const currentRaw = app.getVersion();
  const currentVersion = formatVersionLabel(currentRaw);

  try {
    const release = await fetchLatestRelease();
    const remoteVersion = release.version;
    const cmp = compareVersions(remoteVersion, currentVersion);

    if (cmp === null) {
      await dialog.showMessageBox(parentForDialog(parent), {
        type: 'warning',
        title: 'Could not compare versions',
        message: 'Update check finished with an unexpected version format',
        detail: `This app reports ${currentVersion}. GitHub latest is ${remoteVersion}.`,
        buttons: ['View on GitHub', 'OK'],
        defaultId: 1,
        cancelId: 1
      }).then((res) => {
        if (res.response === 0) void shell.openExternal(release.htmlUrl);
      });
      return { ok: true, updateAvailable: false, indeterminate: true };
    }

    if (cmp <= 0) {
      await showUpToDateDialog(parent, currentVersion, remoteVersion, cmp < 0, release.isPrerelease);
      return { ok: true, updateAvailable: false, ahead: cmp < 0 };
    }

    await offerUpdateDialog(parent, release, currentVersion);
    return { ok: true, updateAvailable: true, remoteVersion };
  } catch (err) {
    await dialog.showMessageBox(parentForDialog(parent), {
      type: 'error',
      title: 'Could not check for updates',
      message: 'Update check failed',
      detail: `${err && err.message ? err.message : 'Check your internet connection and try again.'}\n\nYou can also visit GitHub to download releases manually.`,
      buttons: ['Open GitHub releases', 'OK'],
      defaultId: 1,
      cancelId: 1
    }).then((res) => {
      if (res.response === 0) {
        const repo = resolveGithubRepo();
        void shell.openExternal(`https://github.com/${repo}/releases`);
      }
    });
    return { ok: false, error: err };
  } finally {
    checkInProgress = false;
  }
}

function getCheckForUpdatesMenuItem() {
  return {
    label: 'Check for Updates…',
    click: () => {
      void checkForUpdates();
    }
  };
}

function install(options = {}) {
  if (typeof options.getParentWindow === 'function') {
    getParentWindow = options.getParentWindow;
  }
}

module.exports = {
  install,
  checkForUpdates,
  getCheckForUpdatesMenuItem,
  compareVersions,
  parseVersionParts
};
