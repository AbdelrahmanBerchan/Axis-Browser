/**
 * GitHub release updates for Axis (main process only).
 * Finds a newer release, shows a sidebar banner, then Restart downloads,
 * verifies, replaces the app after quit, and relaunches. User data is untouched.
 */
const { app, dialog, shell, net, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AxisI18n = require('./axis-i18n');
require('./axis-locale-packs');
require('./axis-locale-packs-more');
require('./axis-locale-packs-fix');

function t(key, vars) {
    try {
        return AxisI18n.t(key, vars);
    } catch (_) {
        return key;
    }
}

const DEFAULT_GITHUB_REPO = 'AbdelrahmanBerchan/Axis-Browser';
const GITHUB_API = 'https://api.github.com';
const DOWNLOAD_ATTEMPTS = 3;

let checkInProgress = false;
let applyInProgress = false;
let dismissedVersion = '';
let lastRelease = null;
let lastStatus = {
    available: false,
    preview: false,
    version: '',
    channel: '',
    currentVersion: '',
    status: 'idle',
    message: '',
    releaseUrl: '',
    packaged: false
};

let getParentWindow = () => BrowserWindow.getFocusedWindow() || null;
let quitForUpdate = async () => {
    app.quit();
};

function resolveGithubRepo() {
    const fromEnv = String(process.env.AXIS_UPDATE_GITHUB_REPO || '').trim();
    if (fromEnv && fromEnv.includes('/')) return fromEnv.replace(/^\/+|\/+$/g, '');
    return DEFAULT_GITHUB_REPO;
}

function isUpdateCheckDisabled() {
    return String(process.env.AXIS_UPDATE_SKIP || '').trim() === '1';
}

function currentVersionLabel() {
    return formatVersionLabel(app.getVersion());
}

function isPackagedApp() {
    return !!app.isPackaged;
}

function channelLabel(release) {
    if (!release) return '';
    if (release.isPrerelease) return 'preview';
    const tag = String(release.tag || '').toLowerCase();
    if (tag.includes('preview') || tag.includes('beta') || tag.includes('rc')) return 'preview';
    return '';
}

function parseVersionParts(raw) {
    const s = String(raw || '')
        .trim()
        .replace(/^[vV]/, '');
    const core = s.split(/[-+]/, 1)[0];
    if (!core || !/^\d+(?:\.\d+)*$/.test(core)) return null;
    return core.split('.').map((n) => parseInt(n, 10) || 0);
}

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

function isShellIpc(event) {
    const win = BrowserWindow.fromWebContents(event?.sender);
    return !!(win && !win.isDestroyed());
}

function publicStatus(extra = {}) {
    return {
        available: !!lastStatus.available,
        preview: !!lastStatus.preview,
        version: lastStatus.version || '',
        channel: lastStatus.channel || '',
        currentVersion: lastStatus.currentVersion || currentVersionLabel(),
        status: lastStatus.status || 'idle',
        message: lastStatus.message || '',
        releaseUrl: lastStatus.releaseUrl || '',
        packaged: isPackagedApp(),
        ...extra
    };
}

function setStatus(patch) {
    lastStatus = {
        ...lastStatus,
        currentVersion: currentVersionLabel(),
        packaged: isPackagedApp(),
        ...patch
    };
    broadcastStatus();
    return publicStatus();
}

function broadcastStatus() {
    const payload = publicStatus();
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win || win.isDestroyed()) continue;
        try {
            win.webContents.send('axis-update-status', payload);
        } catch (_) {}
    }
}

function fetchBuffer(url, headers = {}) {
    return new Promise((resolve, reject) => {
        const request = net.request({ method: 'GET', url, redirect: 'follow' });
        request.setHeader('User-Agent', 'Axis-Browser-Update-Check');
        for (const [key, value] of Object.entries(headers)) {
            request.setHeader(key, value);
        }
        const chunks = [];
        request.on('response', (response) => {
            const code = response.statusCode || 0;
            response.on('data', (chunk) => chunks.push(chunk));
            response.on('end', () => {
                const body = Buffer.concat(chunks);
                if (code >= 200 && code < 300) {
                    resolve({ body, statusCode: code });
                    return;
                }
                const err = new Error(
                    code === 404 ? 'No releases found on GitHub yet.' : `GitHub returned ${code}. Try again later.`
                );
                err.statusCode = code;
                reject(err);
            });
        });
        request.on('error', reject);
        request.end();
    });
}

async function fetchJson(url) {
    const { body } = await fetchBuffer(url, { Accept: 'application/vnd.github+json' });
    try {
        return JSON.parse(body.toString('utf8'));
    } catch (_) {
        throw new Error('Invalid response from GitHub.');
    }
}

function normalizeReleaseData(data, repo) {
    const tag = String(data.tag_name || data.name || '').trim();
    const version = formatVersionLabel(tag);
    const assets = Array.isArray(data.assets) ? data.assets : [];
    return {
        repo,
        version,
        tag,
        htmlUrl: String(
            data.html_url || `https://github.com/${repo}/releases/tag/${encodeURIComponent(tag || 'latest')}`
        ).trim(),
        releaseNotes: String(data.body || '').trim(),
        isPrerelease: !!data.prerelease,
        assets: assets
            .map((asset) => ({
                name: String(asset.name || '').trim(),
                url: String(asset.browser_download_url || '').trim(),
                size: Number(asset.size) || 0,
                digest: String(asset.digest || '').trim()
            }))
            .filter((asset) => asset.name && asset.url)
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
    if (!Array.isArray(data)) throw new Error('Invalid response from GitHub.');
    return data.filter((release) => !release.draft);
}

async function fetchLatestRelease() {
    const repo = resolveGithubRepo();
    try {
        const data = await fetchJson(`${GITHUB_API}/repos/${repo}/releases/latest`);
        return normalizeReleaseData(data, repo);
    } catch (err) {
        if (err.statusCode !== 404) throw err;
    }
    const releases = await fetchReleaseList(repo);
    if (releases.length === 0) throw new Error('No releases found on GitHub yet.');
    const picked = pickNewestRelease(releases) || releases[0];
    return normalizeReleaseData(picked, repo);
}

function isMacAssetForArch(asset, arm) {
    const n = asset.lower;
    const isArmAsset = n.includes('arm64') || n.includes('aarch64');
    const isX64Asset = n.includes('x64') || n.includes('x86_64');
    if (arm) return isArmAsset || (!isX64Asset && (n.endsWith('.dmg') || n.endsWith('.zip')));
    return !isArmAsset;
}

/** Ordered installer packages for this OS - Mac tries the next one if the first fails. */
function pickReleaseAssets(assets) {
    const platform = process.platform;
    const arch = process.arch;
    const list = (assets || [])
        .map((asset) => ({ ...asset, lower: asset.name.toLowerCase() }))
        .filter((asset) => !asset.lower.endsWith('.blockmap') && !asset.lower.endsWith('.yml'));

    const out = [];
    const push = (asset) => {
        if (asset && !out.some((a) => a.url === asset.url)) out.push(asset);
    };

    if (platform === 'darwin') {
        const arm = arch === 'arm64';
        const mac = list.filter(
            (asset) => (asset.lower.endsWith('.dmg') || asset.lower.endsWith('.zip')) && isMacAssetForArch(asset, arm)
        );
        push(mac.find((a) => a.lower.endsWith('.dmg') && (a.lower.includes('arm64') || a.lower.includes('aarch64') || !arm)));
        push(mac.find((a) => a.lower.endsWith('.zip')));
        push(mac.find((a) => a.lower.endsWith('.dmg')));
        for (const asset of mac) push(asset);
        return out.slice(0, 2);
    }

    if (platform === 'win32') {
        push(list.find((a) => a.lower.endsWith('.exe') && a.lower.includes('setup')));
        push(list.find((a) => a.lower.endsWith('.exe') && !a.lower.includes('portable')));
        push(list.find((a) => a.lower.endsWith('.exe')));
        return out.slice(0, 2);
    }

    if (platform === 'linux') {
        const archHint = arch === 'arm64' ? ['arm64', 'aarch64'] : ['x86_64', 'amd64', 'x64'];
        const images = list.filter((a) => a.lower.endsWith('.appimage'));
        push(images.find((a) => archHint.some((h) => a.lower.includes(h))));
        push(images[0]);
        return out.slice(0, 2);
    }

    return out;
}

function updatesDir() {
    const dir = path.join(app.getPath('temp'), 'axis-updates');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}

function destPathForAsset(asset) {
    const safe = path.basename(asset.name).replace(/[^\w.\-()+ ]+/g, '_');
    return path.join(updatesDir(), safe || 'axis-update.bin');
}

function unlinkQuiet(filePath) {
    try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (_) {}
}

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        unlinkQuiet(destPath);
        const request = net.request({ method: 'GET', url, redirect: 'follow' });
        request.setHeader('User-Agent', 'Axis-Browser-Update-Check');
        request.on('response', (response) => {
            const code = response.statusCode || 0;
            if (code < 200 || code >= 300) {
                reject(new Error(`Download failed (${code}).`));
                return;
            }
            const file = fs.createWriteStream(destPath);
            let bytes = 0;
            response.on('data', (chunk) => {
                bytes += chunk.length;
            });
            response.pipe(file);
            file.on('finish', () => {
                file.close((err) => {
                    if (err) {
                        unlinkQuiet(destPath);
                        reject(err);
                        return;
                    }
                    resolve({ destPath, bytes });
                });
            });
            file.on('error', (err) => {
                unlinkQuiet(destPath);
                reject(err);
            });
        });
        request.on('error', (err) => {
            unlinkQuiet(destPath);
            reject(err);
        });
        request.end();
    });
}

async function downloadFileWithRetry(url, destPath) {
    let lastErr = null;
    for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
        try {
            return await downloadFile(url, destPath);
        } catch (err) {
            lastErr = err;
            unlinkQuiet(destPath);
            if (attempt < DOWNLOAD_ATTEMPTS) {
                await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
            }
        }
    }
    throw lastErr || new Error('Download failed.');
}

function sha256File(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('sha256');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

async function verifyDownloadedFile(destPath, asset) {
    const stat = await fs.promises.stat(destPath);
    if (!stat.isFile() || stat.size < 64) {
        throw new Error('The update file looks incomplete.');
    }
    if (asset.size > 0 && stat.size !== asset.size) {
        throw new Error('The update file did not match the expected size.');
    }
    const digest = String(asset.digest || '');
    const shaMatch = digest.match(/^sha256:([a-f0-9]{64})$/i);
    if (shaMatch) {
        const actual = await sha256File(destPath);
        if (actual.toLowerCase() !== shaMatch[1].toLowerCase()) {
            throw new Error('The update file failed its integrity check.');
        }
    }
    return stat.size;
}

function runningAppBundlePath() {
    if (process.platform === 'darwin') {
        return path.resolve(process.execPath, '..', '..', '..');
    }
    return path.dirname(process.execPath);
}

function relaunchPath() {
    if (process.platform === 'darwin') return runningAppBundlePath();
    if (process.env.APPIMAGE) return process.env.APPIMAGE;
    return process.execPath;
}

function writeTextFile(filePath, contents) {
    fs.writeFileSync(filePath, contents, { encoding: 'utf8', mode: 0o700 });
}

function macApplyScript() {
    return `#!/bin/bash
set -euo pipefail
pid="\${AXIS_UPDATE_PID:-}"
app="\${AXIS_UPDATE_APP:-}"
relaunch="\${AXIS_UPDATE_RELAUNCH:-}"
pkg1="\${AXIS_UPDATE_PKG1:-}"
pkg2="\${AXIS_UPDATE_PKG2:-}"
workdir="$(mktemp -d -t axis-update)"
cleanup() { rm -rf "$workdir" || true; }
trap cleanup EXIT

wait_quit() {
  if [ -z "$pid" ]; then sleep 2; return; fi
  for _ in $(seq 1 120); do
    if ! kill -0 "$pid" 2>/dev/null; then
      sleep 1
      return
    fi
    sleep 0.4
  done
}

find_app() {
  local root="$1"
  local hit
  hit="$(find "$root" -maxdepth 3 -name '*.app' -type d 2>/dev/null | head -n 1 || true)"
  if [ -n "$hit" ]; then echo "$hit"; return 0; fi
  return 1
}

install_pkg() {
  local pkg="$1"
  [ -n "$pkg" ] && [ -f "$pkg" ] || return 1
  local lower
  lower="$(printf '%s' "$pkg" | tr '[:upper:]' '[:lower:]')"
  local src=""
  if [[ "$lower" == *.zip ]]; then
    ditto -xk "$pkg" "$workdir/unzip"
    src="$(find_app "$workdir/unzip")" || return 1
  elif [[ "$lower" == *.dmg ]]; then
    local mount
    mount="$(hdiutil attach -nobrowse -readonly -mountroot "$workdir" "$pkg" | awk '/\\/ { print $NF; exit }')"
    [ -n "$mount" ] || return 1
    src="$(find_app "$mount")" || { hdiutil detach "$mount" -quiet || true; return 1; }
    ditto "$src" "$app"
    hdiutil detach "$mount" -quiet || true
    return 0
  else
    return 1
  fi
  ditto "$src" "$app"
}

wait_quit
if ! install_pkg "$pkg1"; then
  install_pkg "$pkg2"
fi
if [ -n "$relaunch" ]; then
  open -a "$relaunch" || open "$relaunch" || true
fi
`;
}

function winApplyScript() {
    return `@echo off
setlocal EnableExtensions
set "PID=%AXIS_UPDATE_PID%"
set "PKG1=%AXIS_UPDATE_PKG1%"
set "PKG2=%AXIS_UPDATE_PKG2%"
set "RELAUNCH=%AXIS_UPDATE_RELAUNCH%"
if not "%PID%"=="" (
  :waitloop
  tasklist /FI "PID eq %PID%" | findstr /I /C:"%PID%" >nul
  if not errorlevel 1 (
    timeout /t 1 /nobreak >nul
    goto waitloop
  )
)
if exist "%PKG1%" (
  start /wait "" "%PKG1%" /S
  if errorlevel 1 if exist "%PKG2%" start /wait "" "%PKG2%" /S
) else if exist "%PKG2%" (
  start /wait "" "%PKG2%" /S
)
if not "%RELAUNCH%"=="" start "" "%RELAUNCH%"
`;
}

function linuxApplyScript() {
    return `#!/bin/bash
set -euo pipefail
pid="\${AXIS_UPDATE_PID:-}"
pkg1="\${AXIS_UPDATE_PKG1:-}"
pkg2="\${AXIS_UPDATE_PKG2:-}"
relaunch="\${AXIS_UPDATE_RELAUNCH:-}"
target="\${AXIS_UPDATE_APPIMAGE:-$relaunch}"

wait_quit() {
  if [ -z "$pid" ]; then sleep 2; return; fi
  for _ in $(seq 1 120); do
    if ! kill -0 "$pid" 2>/dev/null; then
      sleep 1
      return
    fi
    sleep 0.4
  done
}

install_pkg() {
  local pkg="$1"
  [ -n "$pkg" ] && [ -f "$pkg" ] || return 1
  if [ -n "$target" ] && [ -f "$target" ]; then
    cp "$pkg" "$target.axis-new"
    chmod +x "$target.axis-new"
    mv -f "$target.axis-new" "$target"
    return 0
  fi
  return 1
}

wait_quit
if ! install_pkg "$pkg1"; then
  install_pkg "$pkg2" || true
fi
if [ -n "$relaunch" ]; then
  nohup "$relaunch" >/dev/null 2>&1 &
fi
`;
}

function spawnApplyHelper(downloadedPaths) {
    const env = {
        ...process.env,
        AXIS_UPDATE_PID: String(process.pid),
        AXIS_UPDATE_APP: runningAppBundlePath(),
        AXIS_UPDATE_RELAUNCH: relaunchPath(),
        AXIS_UPDATE_PKG1: downloadedPaths[0] || '',
        AXIS_UPDATE_PKG2: downloadedPaths[1] || '',
        AXIS_UPDATE_APPIMAGE: process.env.APPIMAGE || ''
    };

    let scriptPath;
    let cmd;
    let args;
    if (process.platform === 'darwin') {
        scriptPath = path.join(updatesDir(), 'axis-apply-update.sh');
        writeTextFile(scriptPath, macApplyScript());
        cmd = '/bin/bash';
        args = [scriptPath];
    } else if (process.platform === 'win32') {
        scriptPath = path.join(updatesDir(), 'axis-apply-update.cmd');
        writeTextFile(scriptPath, winApplyScript());
        cmd = process.env.ComSpec || 'cmd.exe';
        args = ['/d', '/s', '/c', scriptPath];
    } else {
        scriptPath = path.join(updatesDir(), 'axis-apply-update.sh');
        writeTextFile(scriptPath, linuxApplyScript());
        cmd = '/bin/bash';
        args = [scriptPath];
    }

    const child = spawn(cmd, args, {
        detached: true,
        stdio: 'ignore',
        env,
        windowsHide: true
    });
    child.unref();
}

async function downloadAndVerifyAssets(assets) {
    const downloaded = [];
    let lastErr = null;
    for (const asset of assets) {
        const dest = destPathForAsset(asset);
        try {
            await downloadFileWithRetry(asset.url, dest);
            await verifyDownloadedFile(dest, asset);
            downloaded.push(dest);
            if (downloaded.length >= 2) break;
        } catch (err) {
            lastErr = err;
            unlinkQuiet(dest);
        }
    }
    if (!downloaded.length) {
        throw lastErr || new Error('Could not download a usable update package.');
    }
    return downloaded;
}

function rememberAvailableRelease(release) {
    lastRelease = release;
    const version = release.version;
    const releaseUrl = String(release.htmlUrl || '').trim();
    if (dismissedVersion && dismissedVersion === version) {
        return setStatus({
            available: false,
            preview: false,
            version,
            channel: channelLabel(release),
            status: 'idle',
            message: '',
            releaseUrl
        });
    }
    return setStatus({
        available: true,
        preview: false,
        version,
        channel: channelLabel(release),
        status: 'available',
        message: '',
        releaseUrl
    });
}

async function showUpToDateDialog(parent, currentVersion, remoteVersion, isAhead, isPrerelease = false) {
    const appName = app.getName() || 'Axis';
    const prereleaseNote = isPrerelease ? t('update.prereleaseNote') : '';
    const message = isAhead
        ? t('update.aheadMessage', { app: appName, ver: currentVersion })
        : t('update.upToDate');
    const detail = isAhead
        ? t('update.aheadDetail', {
              ver: currentVersion,
              remote: remoteVersion,
              note: prereleaseNote
          })
        : t('update.matchDetail', { app: appName, ver: currentVersion, note: prereleaseNote });
    await dialog.showMessageBox(parentForDialog(parent), {
        type: 'info',
        title: t('update.noUpdateTitle'),
        message,
        detail,
        buttons: [t('common.ok')],
        defaultId: 0,
        cancelId: 0
    });
}

async function checkForUpdates(options = {}) {
    if (isUpdateCheckDisabled()) return { skipped: true };
    if (checkInProgress || applyInProgress) return { busy: true };

    const silent = options.silent === true;
    checkInProgress = true;
    const parent = options.parentWindow;
    const currentVersion = currentVersionLabel();

    try {
        const release = await fetchLatestRelease();
        const remoteVersion = release.version;
        const cmp = compareVersions(remoteVersion, currentVersion);

        if (cmp === null) {
            if (!silent) {
                await dialog
                    .showMessageBox(parentForDialog(parent), {
                        type: 'warning',
                        title: t('update.compareFailTitle'),
                        message: t('update.compareFailMessage'),
                        detail: t('update.compareFailDetail', {
                            cur: currentVersion,
                            remote: remoteVersion
                        }),
                        buttons: [t('update.viewOnGithub'), t('common.ok')],
                        defaultId: 1,
                        cancelId: 1
                    })
                    .then((res) => {
                        if (res.response === 0) void shell.openExternal(release.htmlUrl);
                    });
            }
            return { ok: true, updateAvailable: false, indeterminate: true };
        }

        if (cmp <= 0) {
            lastRelease = null;
            setStatus({
                available: false,
                preview: false,
                version: remoteVersion,
                channel: channelLabel(release),
                status: 'idle',
                message: ''
            });
            if (!silent) {
                await showUpToDateDialog(parent, currentVersion, remoteVersion, cmp < 0, release.isPrerelease);
            }
            return { ok: true, updateAvailable: false, ahead: cmp < 0 };
        }

        rememberAvailableRelease(release);
        return { ok: true, updateAvailable: true, remoteVersion };
    } catch (err) {
        if (!silent) {
            await dialog
                .showMessageBox(parentForDialog(parent), {
                    type: 'error',
                    title: t('update.checkFailTitle'),
                    message: t('update.checkFailMessage'),
                    detail:
                        err && err.message
                            ? `${err.message}\n\n${t('update.checkFailDetail')}`
                            : t('update.checkFailDetail'),
                    buttons: [t('update.openReleases'), t('common.ok')],
                    defaultId: 1,
                    cancelId: 1
                })
                .then((res) => {
                    if (res.response === 0) {
                        const repo = resolveGithubRepo();
                        void shell.openExternal(`https://github.com/${repo}/releases`);
                    }
                });
        }
        return { ok: false, error: err && err.message ? err.message : 'Update check failed' };
    } finally {
        checkInProgress = false;
    }
}

async function applyAvailableUpdate() {
    if (applyInProgress) return { ok: false, busy: true };
    if (lastStatus.preview) {
        return { ok: false, preview: true, message: 'This is only a preview of the banner.' };
    }
    if (!lastRelease || !lastStatus.available) {
        return { ok: false, message: t('update.noReady') };
    }
    if (!isPackagedApp()) {
        setStatus({
            status: 'error',
            message: t('update.unpackaged')
        });
        return { ok: false, unpackaged: true };
    }

    const assets = pickReleaseAssets(lastRelease.assets);
    if (!assets.length) {
        setStatus({
            status: 'error',
            message: t('update.noInstaller')
        });
        try {
            await shell.openExternal(lastRelease.htmlUrl);
        } catch (_) {}
        return { ok: false, message: 'No installer asset' };
    }

    applyInProgress = true;
    setStatus({ status: 'downloading', message: '' });
    try {
        const downloaded = await downloadAndVerifyAssets(assets);
        setStatus({ status: 'installing', message: '' });
        spawnApplyHelper(downloaded);
        setTimeout(() => {
            void quitForUpdate();
        }, 120);
        return { ok: true };
    } catch (err) {
        applyInProgress = false;
        const message = err && err.message ? err.message : t('update.downloadFail');
        setStatus({ status: 'error', message });
        return { ok: false, message };
    }
}

function dismissUpdateBanner() {
    if (lastStatus.preview) {
        lastStatus = {
            ...lastStatus,
            available: false,
            preview: false,
            status: 'idle',
            message: ''
        };
        broadcastStatus();
        return publicStatus();
    }
    if (lastStatus.version) dismissedVersion = lastStatus.version;
    lastStatus = {
        ...lastStatus,
        available: false,
        preview: false,
        status: 'idle',
        message: ''
    };
    broadcastStatus();
    return publicStatus();
}

function previewUpdateBanner() {
    const version = currentVersionLabel() || '99.0.0';
    const repo = resolveGithubRepo();
    lastStatus = {
        available: true,
        preview: true,
        version,
        channel: 'preview',
        currentVersion: version,
        status: 'available',
        message: '',
        releaseUrl: `https://github.com/${repo}/releases`,
        packaged: isPackagedApp()
    };
    broadcastStatus();
    return publicStatus();
}

function getUpdateStatus() {
    return publicStatus();
}

function getCheckForUpdatesMenuItem() {
    return {
        label: t('menu.checkUpdates'),
        click: () => {
            void checkForUpdates({ silent: false });
        }
    };
}

function getPreviewUpdateBannerMenuItem() {
    return null;
}

function install(options = {}) {
    if (typeof options.getParentWindow === 'function') {
        getParentWindow = options.getParentWindow;
    }
    if (typeof options.quitForUpdate === 'function') {
        quitForUpdate = options.quitForUpdate;
    }
    lastStatus.currentVersion = currentVersionLabel();
    lastStatus.packaged = isPackagedApp();
    const runSilentCheck = () => {
        if (isUpdateCheckDisabled()) return;
        void checkForUpdates({ silent: true });
    };
    setTimeout(runSilentCheck, 8000);
    // Re-check periodically so a new GitHub release shows up without relaunching.
    if (!install._interval) {
        install._interval = setInterval(runSilentCheck, 6 * 60 * 60 * 1000);
        if (typeof install._interval.unref === 'function') install._interval.unref();
    }
}

module.exports = {
    install,
    checkForUpdates,
    applyAvailableUpdate,
    dismissUpdateBanner,
    previewUpdateBanner,
    getUpdateStatus,
    getCheckForUpdatesMenuItem,
    getPreviewUpdateBannerMenuItem,
    compareVersions,
    parseVersionParts,
    isShellIpc
};
