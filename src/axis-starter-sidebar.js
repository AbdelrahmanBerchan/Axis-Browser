'use strict';

/** Default favorites + pinned tab groups for a brand-new profile (first launch). */
/** Tab/group ids must be numeric — renderer `_normalizeTabMapKey` only accepts finite numbers. */
const STARTER_GROUP_COMMUNITY = 901_000_001;
const STARTER_GROUP_SOCIALS = 901_000_002;

const STARTER_TAB_DISCORD = 901_000_101;
const STARTER_TAB_PATREON = 901_000_102;
const STARTER_TAB_X = 901_000_103;

const STARTER_FAVORITES = [
  {
    id: 'axis-starter-fav-home',
    url: 'https://www.axis-browser.com/',
    title: 'Axis Browser',
    order: 0
  },
  {
    id: 'axis-starter-fav-github',
    url: 'https://github.com/AbdelrahmanBerchan/Axis-Browser',
    title: 'Axis on GitHub',
    order: 1
  }
];

const STARTER_TAB_GROUPS = [
  {
    id: STARTER_GROUP_COMMUNITY,
    name: 'Community & Support',
    color: '#FF3B30',
    open: true,
    order: 0,
    pinned: true,
    hadTabs: true,
    tabIds: [STARTER_TAB_DISCORD, STARTER_TAB_PATREON],
    tabs: [
      {
        id: STARTER_TAB_DISCORD,
        url: 'https://discord.com/invite/PP4hzwSZbf',
        title: 'Discord'
      },
      {
        id: STARTER_TAB_PATREON,
        url: 'https://www.patreon.com/cw/AbdelrahmanBerchan',
        title: 'Patreon'
      }
    ]
  },
  {
    id: STARTER_GROUP_SOCIALS,
    name: 'Socials',
    color: '#007AFF',
    open: true,
    order: 1,
    pinned: true,
    hadTabs: true,
    tabIds: [STARTER_TAB_X],
    tabs: [
      {
        id: STARTER_TAB_X,
        url: 'https://x.com/axis_browser',
        title: 'X (Axis Browser)'
      }
    ]
  }
];

const STARTER_PINNED_SIDEBAR_ORDER = [
  { type: 'group', id: STARTER_GROUP_COMMUNITY },
  { type: 'group', id: STARTER_GROUP_SOCIALS }
];

function tabIdIsRendererCompatible(id) {
  if (id == null || id === '') return false;
  if (typeof id === 'number' && Number.isFinite(id)) return true;
  const n = parseInt(String(id), 10);
  return Number.isFinite(n);
}

function starterTabGroupsHaveInvalidTabIds(tabGroups) {
  if (!Array.isArray(tabGroups)) return false;
  for (const g of tabGroups) {
    const tabIds = Array.isArray(g?.tabIds) ? g.tabIds : [];
    const tabs = Array.isArray(g?.tabs) ? g.tabs : [];
    for (const raw of tabIds) {
      if (!tabIdIsRendererCompatible(raw)) return true;
    }
    for (const t of tabs) {
      if (t && !tabIdIsRendererCompatible(t.id)) return true;
    }
  }
  return false;
}

function profileSidebarIsPristine(store) {
  if (!store || typeof store.get !== 'function') return false;
  const favorites = store.get('favorites', []);
  const tabGroups = store.get('tabGroups', []);
  const pinnedTabs = store.get('pinnedTabs', []);
  const favEmpty = !Array.isArray(favorites) || favorites.length === 0;
  const groupsEmpty = !Array.isArray(tabGroups) || tabGroups.length === 0;
  const pinsEmpty = !Array.isArray(pinnedTabs) || pinnedTabs.length === 0;
  return favEmpty && groupsEmpty && pinsEmpty;
}

function getStarterSidebarStorePatch() {
  return {
    favorites: STARTER_FAVORITES.map((f) => ({ ...f })),
    tabGroups: STARTER_TAB_GROUPS.map((g) => ({
      ...g,
      tabIds: [...g.tabIds],
      tabs: g.tabs.map((t) => ({ ...t }))
    })),
    pinnedSidebarOrder: STARTER_PINNED_SIDEBAR_ORDER.map((item) => ({ ...item })),
    __starterSidebarSeeded: true
  };
}

/**
 * Apply starter favorites and pinned groups once per profile when sidebar is still empty.
 * Re-applies when an older build seeded non-numeric tab ids (groups would not render).
 * @param {string} profileId
 * @param {import('electron-store')} profileStore
 */
function applyStarterSidebarIfNeeded(profileId, profileStore) {
  const id = String(profileId || '').trim();
  if (!id || id === 'incognito') return false;
  const store = profileStore;
  if (!store) return false;

  const alreadySeeded = store.get('__starterSidebarSeeded') === true;
  if (alreadySeeded) {
    const groups = store.get('tabGroups', []);
    if (!starterTabGroupsHaveInvalidTabIds(groups)) return false;
    const patch = getStarterSidebarStorePatch();
    store.set(patch);
    return true;
  }

  if (!profileSidebarIsPristine(store)) return false;
  const patch = getStarterSidebarStorePatch();
  store.set(patch);
  return true;
}

module.exports = {
  applyStarterSidebarIfNeeded,
  getStarterSidebarStorePatch,
  profileSidebarIsPristine
};
