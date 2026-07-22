'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (_) {}

function pathExists(p) {
  try {
    return !!p && fs.existsSync(p);
  } catch (_) {
    return false;
  }
}

function sleepMs(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function cleanupSqliteTemp(tmp) {
  for (const suffix of ['', '-wal', '-shm']) {
    try {
      fs.unlinkSync(`${tmp}${suffix}`);
    } catch (_) {}
  }
}

function copySqliteSnapshot(dbPath, tmp) {
  fs.copyFileSync(dbPath, tmp);
  try {
    if (pathExists(`${dbPath}-wal`)) fs.copyFileSync(`${dbPath}-wal`, `${tmp}-wal`);
  } catch (_) {}
  try {
    if (pathExists(`${dbPath}-shm`)) fs.copyFileSync(`${dbPath}-shm`, `${tmp}-shm`);
  } catch (_) {}
}

function querySqliteDb(dbPath, sql, params = []) {
  if (!DatabaseSync) return { rows: [], error: 'sqlite_unavailable' };
  if (!pathExists(dbPath)) return { rows: [], error: 'missing' };

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) sleepMs(80 * attempt);
    const tmp = path.join(
      os.tmpdir(),
      `axis-import-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
    );
    try {
      copySqliteSnapshot(dbPath, tmp);
      const db = new DatabaseSync(tmp, { readonly: true });
      const stmt = db.prepare(sql);
      const rows =
        typeof params.length === 'number' && params.length > 0 ? stmt.all(...params) : stmt.all();
      db.close();
      return { rows, error: null };
    } catch (e) {
      lastError = e;
    } finally {
      cleanupSqliteTemp(tmp);
    }
  }
  return { rows: [], error: lastError?.message || 'read_failed' };
}

function sqliteReadWarning(label, error) {
  if (!error || error === 'missing') return null;
  if (error === 'sqlite_unavailable') {
    return `Could not read ${label} — database support is unavailable in this build.`;
  }
  return `Could not read ${label}. Quit the source browser and try again.`;
}

module.exports = {
  querySqliteDb,
  sqliteReadWarning,
  pathExists
};
