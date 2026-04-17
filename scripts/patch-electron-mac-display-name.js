#!/usr/bin/env node
/**
 * macOS dev: the bottom Dock hover label often follows the .app bundle folder name and bundle
 * metadata. Patching Info.plist alone is not always enough (Launch Services cache, Electron name).
 * We rename Electron.app → Axis.app and point path.txt at it so the tooltip shows "Axis".
 *
 * Idempotent: safe to run on every postinstall / prestart. Re-run after `npm install` upgrades `electron`.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

if (process.platform !== 'darwin') process.exit(0);

const electronRoot = path.join(__dirname, '..', 'node_modules', 'electron');
const distDir = path.join(electronRoot, 'dist');
const electronApp = path.join(distDir, 'Electron.app');
const axisApp = path.join(distDir, 'Axis.app');
const pathTxt = path.join(electronRoot, 'path.txt');

const DISPLAY_NAME = 'Axis';
/** No trailing newline: `electron/index.js` reads path.txt as-is; a newline breaks `spawn` (ENOENT). */
const REL_PATH = 'Axis.app/Contents/MacOS/Electron';
const plistBuddy = '/usr/libexec/PlistBuddy';

function rmrf(p) {
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
}

function setPlistStrings(plistPath) {
  if (!fs.existsSync(plistPath)) return;
  function setString(key, value) {
    try {
      execFileSync(plistBuddy, ['-c', `Set :${key} ${value}`, plistPath], { stdio: 'pipe' });
    } catch (_) {
      try {
        execFileSync(plistBuddy, ['-c', `Add :${key} string ${value}`, plistPath], { stdio: 'pipe' });
      } catch (_) {}
    }
  }
  setString('CFBundleDisplayName', DISPLAY_NAME);
  setString('CFBundleName', DISPLAY_NAME);
}

if (!fs.existsSync(distDir)) process.exit(0);

// Fast path: already renamed + path.txt correct — skip PlistBuddy and disk writes (speeds every npm start).
if (fs.existsSync(axisApp) && !fs.existsSync(electronApp) && fs.existsSync(pathTxt)) {
  try {
    if (fs.readFileSync(pathTxt, 'utf8').trim() === REL_PATH) {
      process.exit(0);
    }
  } catch (_) {}
}

// Fresh npm install leaves dist/Electron.app — replace any previous Axis.app and rename.
if (fs.existsSync(electronApp)) {
  rmrf(axisApp);
  fs.renameSync(electronApp, axisApp);
}

const appBundle = fs.existsSync(axisApp) ? axisApp : electronApp;
if (!fs.existsSync(appBundle)) {
  process.exit(0);
}

const plistPath = path.join(appBundle, 'Contents', 'Info.plist');
setPlistStrings(plistPath);

const macBinary = path.join(appBundle, 'Contents', 'MacOS', 'Electron');
if (!fs.existsSync(macBinary)) {
  process.exit(0);
}

fs.writeFileSync(pathTxt, REL_PATH, 'utf8');
