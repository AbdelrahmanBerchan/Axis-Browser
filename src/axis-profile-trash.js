'use strict';

const fs = require('fs');
const path = require('path');

const TRASH_INDEX = 'index.json';
const TRASH_MAX = 12;

function getProfileTrashRoot(userDataPath) {
  return path.join(userDataPath, 'profile-trash');
}

function readTrashIndex(trashRoot) {
  const indexPath = path.join(trashRoot, TRASH_INDEX);
  try {
    const raw = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    return Array.isArray(raw?.entries) ? raw.entries : [];
  } catch (_) {
    return [];
  }
}

function writeTrashIndex(trashRoot, entries) {
  fs.mkdirSync(trashRoot, { recursive: true });
  fs.writeFileSync(
    path.join(trashRoot, TRASH_INDEX),
    JSON.stringify({ entries, updatedAt: new Date().toISOString() }, null, 2),
    'utf8'
  );
}

async function copyPathIfExists(from, to) {
  try {
    await fs.promises.access(from);
  } catch (_) {
    return false;
  }
  await fs.promises.mkdir(path.dirname(to), { recursive: true });
  await fs.promises.cp(from, to, { recursive: true, force: true });
  return true;
}

async function removePathIfExists(target) {
  try {
    await fs.promises.rm(target, { recursive: true, force: true });
  } catch (_) {}
}

function createProfileTrashApi(deps) {
  const {
    app,
    sanitizeProfileId,
    getProfileStoreFilePath,
    getProfileVaultFilePath,
    listAxisProfiles,
    saveAxisProfiles,
    axisProfileStores,
    axisVaultByProfile,
    getStoredAxisExtensions,
    setStoredAxisExtensions
  } = deps;

  function trashRoot() {
    return getProfileTrashRoot(app.getPath('userData'));
  }

  function trashEntryDir(trashId) {
    return path.join(trashRoot(), sanitizeProfileId(trashId));
  }

  async function pruneTrash(entries) {
    const sorted = entries.slice().sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    const keep = sorted.slice(0, TRASH_MAX);
    const drop = sorted.slice(TRASH_MAX);
    for (const entry of drop) {
      await removePathIfExists(trashEntryDir(entry.trashId));
    }
    return keep;
  }

  async function trashAxisProfile(profileId) {
    const id = sanitizeProfileId(profileId);
    const meta = listAxisProfiles().find((p) => p.id === id);
    if (!meta) throw new Error('Profile not found');

    const trashId = `${id}-${Date.now().toString(36)}`;
    const entryDir = trashEntryDir(trashId);
    await fs.promises.mkdir(entryDir, { recursive: true });

    const storePath = getProfileStoreFilePath(id);
    const vaultPath = getProfileVaultFilePath(id);
    const extensionsDir = path.join(app.getPath('userData'), 'axis-extensions', id);

    await copyPathIfExists(storePath, path.join(entryDir, path.basename(storePath)));
    await copyPathIfExists(vaultPath, path.join(entryDir, path.basename(vaultPath)));
    await copyPathIfExists(extensionsDir, path.join(entryDir, 'axis-extensions'));

    const extensions = getStoredAxisExtensions(id);
    fs.writeFileSync(path.join(entryDir, 'extensions.json'), JSON.stringify(extensions, null, 2), 'utf8');

    const entry = {
      trashId,
      profileId: id,
      name: meta.name,
      icon: meta.icon,
      deletedAt: new Date().toISOString()
    };
    fs.writeFileSync(path.join(entryDir, 'meta.json'), JSON.stringify(entry, null, 2), 'utf8');

    axisVaultByProfile.delete(id);
    if (axisProfileStores.has(id)) axisProfileStores.delete(id);

    await removePathIfExists(storePath);
    await removePathIfExists(vaultPath);
    await removePathIfExists(extensionsDir);

    const root = trashRoot();
    let entries = readTrashIndex(root);
    entries.unshift(entry);
    entries = await pruneTrash(entries);
    writeTrashIndex(root, entries);

    return entry;
  }

  async function restoreTrashedProfile(trashId) {
    const tid = String(trashId || '').trim();
    if (!tid) throw new Error('Missing trash entry');
    const entryDir = trashEntryDir(tid);
    const metaPath = path.join(entryDir, 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const id = sanitizeProfileId(meta.profileId);
    const profiles = listAxisProfiles();
    if (profiles.some((p) => p.id === id)) {
      throw new Error('A profile with this name already exists');
    }

    if (axisProfileStores.has(id)) axisProfileStores.delete(id);
    axisVaultByProfile.delete(id);

    const storeName = `profile-${id}.json`;
    const vaultName =
      id === deps.AXIS_DEFAULT_PROFILE_ID ? 'axis-vault-v2.json' : `axis-vault-v2-${id}.json`;

    await copyPathIfExists(path.join(entryDir, storeName), getProfileStoreFilePath(id));
    await copyPathIfExists(path.join(entryDir, vaultName), getProfileVaultFilePath(id));
    await copyPathIfExists(
      path.join(entryDir, 'axis-extensions'),
      path.join(app.getPath('userData'), 'axis-extensions', id)
    );

    const extensionsPath = path.join(entryDir, 'extensions.json');
    if (fs.existsSync(extensionsPath)) {
      try {
        const extensions = JSON.parse(fs.readFileSync(extensionsPath, 'utf8'));
        setStoredAxisExtensions(id, Array.isArray(extensions) ? extensions : []);
      } catch (_) {}
    }

    profiles.push({ id, name: meta.name, icon: meta.icon });
    saveAxisProfiles(profiles);

    let entries = readTrashIndex(trashRoot()).filter((row) => row.trashId !== tid);
    writeTrashIndex(trashRoot(), entries);
    await removePathIfExists(entryDir);

    return { ok: true, profileId: id, profileName: meta.name, icon: meta.icon };
  }

  async function permanentlyDeleteTrashedProfile(trashId) {
    const tid = String(trashId || '').trim();
    if (!tid) throw new Error('Missing trash entry');
    await removePathIfExists(trashEntryDir(tid));
    const entries = readTrashIndex(trashRoot()).filter((row) => row.trashId !== tid);
    writeTrashIndex(trashRoot(), entries);
    return { ok: true };
  }

  function listTrashedProfiles() {
    return readTrashIndex(trashRoot()).map((entry) => ({
      trashId: entry.trashId,
      profileId: entry.profileId,
      name: entry.name,
      icon: entry.icon,
      deletedAt: entry.deletedAt
    }));
  }

  return {
    trashAxisProfile,
    restoreTrashedProfile,
    permanentlyDeleteTrashedProfile,
    listTrashedProfiles
  };
}

module.exports = {
  createProfileTrashApi
};
