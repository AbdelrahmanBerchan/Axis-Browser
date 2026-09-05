/**
 * Cmd+Z undo for sidebar tab actions (close, clear, pin, rename, icon, favorites, groups).
 * Attached to AxisBrowser.prototype from renderer.js.
 */
(function (global) {
  'use strict';

  const UNDO_MAX = 20;

  const undoMethods = {
    _syncUndoShortcutState() {
      const pending =
        (Array.isArray(this.tabUndoStack) && this.tabUndoStack.length > 0) ||
        (Array.isArray(this.closedTabs) && this.closedTabs.length > 0);
      try {
        window.electronAPI?.setAxisUndoPending?.(pending);
      } catch (_) {}
    },

    _isNativeUndoField(el) {
      if (!el || el.nodeType !== 1) return false;
      if (el.closest?.('#url-bar-input, #url-bar-display, .url-bar-field, .url-bar-center')) {
        return false;
      }
      if (el.tagName === 'INPUT') {
        if (el.readOnly || el.disabled) return false;
        const type = String(el.type || 'text').toLowerCase();
        if (
          [
            'button',
            'checkbox',
            'radio',
            'file',
            'submit',
            'reset',
            'hidden',
            'range',
            'color',
            'image'
          ].includes(type)
        ) {
          return false;
        }
        return true;
      }
      if (el.tagName === 'TEXTAREA') return !el.readOnly && !el.disabled;
      if (el.tagName === 'SELECT') return false;
      return !!el.isContentEditable;
    },

    _forgetClosedTabMatch(oldTabId, snapshot) {
      if (!Array.isArray(this.closedTabs) || this.closedTabs.length === 0) return;
      let idx = -1;
      if (oldTabId != null) {
        const want = this._normalizeTabMapKey(oldTabId);
        idx = this.closedTabs.findIndex((t) => {
          const id = this._normalizeTabMapKey(t.id ?? t.oldTabId);
          return want != null && id === want;
        });
      }
      if (idx < 0 && snapshot?.url) {
        const title = snapshot.customTitle || snapshot.title;
        idx = this.closedTabs.findIndex(
          (t) => t.url === snapshot.url && (t.customTitle || t.title) === title
        );
      }
      if (idx >= 0) this.closedTabs.splice(idx, 1);
    },

    _forgetUndoCloseForTab(oldTabId, snapshot) {
      if (!Array.isArray(this.tabUndoStack) || this.tabUndoStack.length === 0) return;
      const want = this._normalizeTabMapKey(oldTabId);
      const title = snapshot?.customTitle || snapshot?.title;
      for (let i = this.tabUndoStack.length - 1; i >= 0; i--) {
        const action = this.tabUndoStack[i];
        if (action?.type !== 'close_tab') continue;
        const data = action.data || action.snapshot;
        const actionId = this._normalizeTabMapKey(action.oldTabId);
        const sameId = want != null && actionId === want;
        const samePage =
          !!snapshot?.url &&
          data?.url === snapshot.url &&
          (data?.customTitle || data?.title) === title;
        if (sameId || samePage) {
          this.tabUndoStack.splice(i, 1);
          break;
        }
      }
      this._syncUndoShortcutState();
    },

    _ensureGroupFromUndoSnapshot(groupSnapshot, tabGroupId) {
      const existingKey = this.findTabGroupKey(tabGroupId ?? groupSnapshot?.id);
      if (existingKey != null && this.tabGroups.has(existingKey)) return existingKey;
      if (!groupSnapshot?.id) return null;
      this.tabGroups.set(groupSnapshot.id, {
        id: groupSnapshot.id,
        name: groupSnapshot.name,
        icon: groupSnapshot.icon,
        iconType: groupSnapshot.iconType,
        color: groupSnapshot.color,
        pinned: groupSnapshot.pinned === true,
        open: groupSnapshot.open !== false,
        hadTabs: true,
        tabIds: []
      });
      return groupSnapshot.id;
    },

    _pushUndo(action) {
      if (this._suppressUndo || !action?.type) return;
      if (!Array.isArray(this.tabUndoStack)) this.tabUndoStack = [];
      this.tabUndoStack.push(action);
      if (this.tabUndoStack.length > UNDO_MAX) {
        this.tabUndoStack = this.tabUndoStack.slice(-UNDO_MAX);
      }
      this._syncUndoShortcutState();
    },

    _getUndoTabSidebarIndex(tabId) {
      const tid = this._normalizeTabMapKey(tabId);
      if (tid == null) return { inGroup: false, indexAmongSiblings: -1 };
      const el = document.querySelector(`[data-tab-id="${tid}"]`);
      if (!el?.parentNode) return { inGroup: false, indexAmongSiblings: -1 };

      const parent = el.parentNode;
      if (parent.classList?.contains('tab-group-content')) {
        const groupEl = parent.closest('.tab-group');
        return {
          inGroup: true,
          groupId: groupEl?.dataset?.tabGroupId ?? null,
          indexInGroup: Array.from(parent.children).indexOf(el)
        };
      }

      const tabsContainer = this.elements?.tabsContainer;
      if (parent === tabsContainer) {
        return {
          inGroup: false,
          indexAmongSiblings: Array.from(tabsContainer.children).indexOf(el)
        };
      }
      return { inGroup: false, indexAmongSiblings: -1 };
    },

    _snapshotTabForUndo(tabId) {
      const tid = this._normalizeTabMapKey(tabId);
      if (tid == null) return null;
      const tab = this.tabs.get(tid);
      if (!tab || tab.isFavoriteTab) return null;

      const cur = this._normalizeTabMapKey(this.currentTab);
      const isCurrent = cur === tid;
      if (isCurrent && tab.url === this.NEWTAB_URL) {
        this.saveNewTabPageStateToTab(tid);
      }

      let url = tab.url;
      try {
        if (tab.webview && typeof tab.webview.getURL === 'function') {
          const live = tab.webview.getURL();
          if (live && live !== 'about:blank') url = live;
        }
      } catch (_) {}

      let newTabPageState;
      if (tab.newTabPageState) {
        try {
          newTabPageState = JSON.parse(JSON.stringify(tab.newTabPageState));
        } catch (_) {
          newTabPageState = { ...tab.newTabPageState };
        }
      }

      const tabGroupId = tab.tabGroupId ?? null;
      return {
        url,
        title: tab.title || 'Untitled',
        customTitle: tab.customTitle || null,
        customIcon: tab.customIcon || null,
        customIconType: tab.customIconType || null,
        favicon: tab.favicon || null,
        pinned: !!tab.pinned,
        savedLinkUrl: tab.savedLinkUrl || null,
        tabGroupId,
        groupSnapshot: tabGroupId != null ? this._snapshotTabGroupForUndo(tabGroupId) : null,
        newTabPageState,
        sidebarIndex: this._getUndoTabSidebarIndex(tid),
        wasActive: isCurrent
      };
    },

    _snapshotTabGroupForUndo(groupId) {
      const gKey = this.findTabGroupKey(groupId);
      if (gKey == null) return null;
      const g = this.tabGroups.get(gKey);
      if (!g) return null;
      const el = document.querySelector(`[data-tab-group-id="${gKey}"]`);
      const tabsContainer = this.elements?.tabsContainer;
      let indexAmongSiblings = -1;
      if (el && tabsContainer && el.parentNode === tabsContainer) {
        indexAmongSiblings = Array.from(tabsContainer.children).indexOf(el);
      }
      return {
        id: g.id,
        name: g.name,
        icon: g.icon,
        iconType: g.iconType,
        color: g.color,
        pinned: g.pinned,
        open: g.open,
        hadTabs: g.hadTabs,
        tabIds: Array.isArray(g.tabIds) ? g.tabIds.slice() : [],
        sidebarIndex: indexAmongSiblings
      };
    },

    _insertTabElementAtUndoIndex(tabId, sidebarIndex) {
      if (!sidebarIndex || sidebarIndex.inGroup) return;
      const idx = sidebarIndex.indexAmongSiblings;
      if (idx < 0) return;
      const el = document.querySelector(`[data-tab-id="${tabId}"]`);
      const container = this.elements?.tabsContainer;
      if (!el || !container) return;
      const children = Array.from(container.children);
      const target = children[idx];
      if (target && target !== el) {
        container.insertBefore(el, target);
      } else if (!target) {
        container.appendChild(el);
      }
    },

    _applyFullTabSnapshot(tabId, snapshot) {
      const tab = this.tabs.get(tabId);
      if (!tab || !snapshot) return;

      tab.title = snapshot.title;
      tab.customTitle = snapshot.customTitle;
      tab.customIcon = snapshot.customIcon;
      tab.customIconType = snapshot.customIconType;
      tab.favicon = snapshot.favicon;
      if (snapshot.savedLinkUrl) tab.savedLinkUrl = snapshot.savedLinkUrl;
      if (snapshot.newTabPageState) tab.newTabPageState = snapshot.newTabPageState;
      this.tabs.set(tabId, tab);

      const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
      if (tabElement) {
        const titleEl = tabElement.querySelector('.tab-title');
        if (titleEl) titleEl.textContent = snapshot.customTitle || snapshot.title;
        if (snapshot.customIcon) {
          this.updateTabIcon(tabElement, tabId);
        } else if (snapshot.favicon) {
          this.updateTabFavicon(tabId, tabElement);
        }
      }

      this._applyRecoveredTabState(tabId, snapshot);
    },

    _restoreTabFromSnapshot(snapshot, options = {}) {
      if (!snapshot?.url) return null;

      const urlToLoad = this.sanitizeUrl(snapshot.url) || snapshot.url;
      const shouldActivate = options.activate === true || snapshot.wasActive !== false;
      const newTabId = this.createNewTab(urlToLoad, {
        skipActivate: !shouldActivate,
        preserveNewTabState: !!snapshot.newTabPageState,
        animateEnter: true
      });
      const tab = this.tabs.get(newTabId);
      if (!tab) return null;

      this._applyFullTabSnapshot(newTabId, snapshot);

      if (snapshot.newTabPageState) {
        this._resetNewTabPageOnShow = false;
      }

      const tabElement = document.querySelector(`[data-tab-id="${newTabId}"]`);
      if (snapshot.pinned && tabElement) {
        tab.pinned = true;
        this.tabs.set(newTabId, tab);
        tabElement.classList.add('pinned');
        this.setupPinnedTabCloseButton(tabElement, newTabId);
        this.organizeTabsByPinnedState();
      }

      if (!options.skipGroupAssign && snapshot.tabGroupId != null) {
        const gKey = this._ensureGroupFromUndoSnapshot(snapshot.groupSnapshot, snapshot.tabGroupId);
        if (gKey != null && this.tabGroups.has(gKey)) {
          const idx = snapshot.sidebarIndex?.inGroup ? snapshot.sidebarIndex.indexInGroup : undefined;
          this.addTabToTabGroup(newTabId, gKey, true, idx);
        }
      } else if (!snapshot.sidebarIndex?.inGroup) {
        this._insertTabElementAtUndoIndex(newTabId, snapshot.sidebarIndex);
      }

      if (!this.isIncognitoWindow) this.savePinnedTabs();

      if (shouldActivate) {
        const cur = this._normalizeTabMapKey(this.currentTab);
        if (cur !== newTabId) this.switchToTab(newTabId);
        const live = this.tabs.get(newTabId);
        if (live && urlToLoad && urlToLoad !== this.NEWTAB_URL && urlToLoad !== 'axis://settings') {
          if (!live.webview) {
            live.webview = this.createTabWebview(newTabId, this._settingsWebviewOptionsForTab(live));
            this.tabs.set(newTabId, live);
          }
          if (live.webview && !live.webview.src) {
            live.webview.src = urlToLoad;
          }
        }
      }

      return newTabId;
    },

    _snapshotClearUnpinnedBatch() {
      const tabIds = this._collectUnpinnedTabIdsForClear();
      const tabs = tabIds
        .map((id) => {
          const snapshot = this._snapshotTabForUndo(id);
          return snapshot ? { oldTabId: id, snapshot } : null;
        })
        .filter(Boolean);

      const groups = Array.from(this.tabGroups.values())
        .filter((g) => g.pinned === false)
        .map((g) => this._snapshotTabGroupForUndo(g.id))
        .filter(Boolean);

      return {
        tabs,
        groups,
        activeTabId: this.currentTab
      };
    },

    _undoClearUnpinnedBatch(data) {
      if (!data?.tabs?.length && !data?.groups?.length) return;

      const tabIdMap = new Map();
      this._suppressUndo = true;
      try {
        for (const g of data.groups || []) {
          this.tabGroups.set(g.id, {
            id: g.id,
            name: g.name,
            icon: g.icon,
            iconType: g.iconType,
            color: g.color,
            pinned: g.pinned,
            open: g.open,
            hadTabs: g.hadTabs,
            tabIds: []
          });
        }

        for (const entry of data.tabs || []) {
          const newId = this._restoreTabFromSnapshot(entry.snapshot, {
            activate: false,
            skipGroupAssign: true
          });
          if (newId != null) tabIdMap.set(entry.oldTabId, newId);
        }

        for (const g of data.groups || []) {
          const group = this.tabGroups.get(g.id);
          if (!group) continue;
          group.tabIds = (g.tabIds || [])
            .map((oldId) => {
              const key = this._normalizeTabMapKey(oldId);
              return tabIdMap.get(oldId) ?? (key != null ? tabIdMap.get(key) : undefined);
            })
            .filter((id) => id != null);
          group.open = g.open;
          group.hadTabs = group.tabIds.length > 0;
          group.pinned = g.pinned === true;
          this.tabGroups.set(g.id, group);
          for (const newId of group.tabIds) {
            const tab = this.tabs.get(newId);
            if (!tab) continue;
            tab.tabGroupId = group.id;
            tab.pinned = true;
            this.tabs.set(newId, tab);
          }
        }

        this.syncSidebarFromTabGroups();

        const activeOld = data.activeTabId;
        if (activeOld != null) {
          const key = this._normalizeTabMapKey(activeOld);
          const mapped = tabIdMap.get(activeOld) ?? (key != null ? tabIdMap.get(key) : undefined);
          if (mapped != null) this.switchToTab(mapped);
        } else if (this.currentTab == null && this.tabs.size > 0) {
          const first = Array.from(this.tabs.keys()).find((id) => this._canFocusTabAsActive?.(id));
          if (first != null) this.switchToTab(first);
        }

        this.updatePinnedSeparatorVisibility?.();
        this.updateEmptyState?.();
        this._refreshTabsScrollEdges?.();
        void this.savePinnedTabs();
        void this.saveTabGroups();
        void this.saveUnpinnedTabs();
        this._scheduleUnpinnedTabsRecoverySave?.();
      } finally {
        this._suppressUndo = false;
      }
    },

    _undoPinState(tabId, shouldPin, savedLinkUrl) {
      const tid = this._normalizeTabMapKey(tabId);
      if (tid == null) return;
      const tab = this.tabs.get(tid);
      const tabElement = this._resolveLooseSidebarTabElement?.(tid) ||
        document.querySelector(`[data-tab-id="${tid}"]`);
      if (!tab || !tabElement) return;

      const isPinned = !!shouldPin;
      tab.pinned = isPinned;
      tab.savedLinkUrl = isPinned ? (savedLinkUrl || null) : null;
      this.tabs.set(tid, tab);

      if (isPinned) {
        tabElement.classList.add('pinned');
        this.setupPinnedTabCloseButton(tabElement, tid);
        this.updatePinnedTabClosedState(tid);
      } else {
        tabElement.classList.remove('pinned', 'closed');
        this.removePinnedTabCloseButton(tabElement);
      }

      this.organizeTabsByPinnedState();
      this.savePinnedTabs();
    },

    _undoRenameTab(tabId, previousTitle, previousCustomTitle) {
      const tid = this._normalizeTabMapKey(tabId);
      if (tid == null) return;
      const tab = this.tabs.get(tid);
      if (!tab) return;
      tab.title = previousTitle;
      tab.customTitle = previousCustomTitle;
      this.tabs.set(tid, tab);
      const el = document.querySelector(`[data-tab-id="${tid}"]`);
      const titleEl = el?.querySelector('.tab-title');
      if (titleEl) titleEl.textContent = previousCustomTitle || previousTitle;
    },

    _undoRenameTabGroup(groupId, previousName) {
      const gKey = this.findTabGroupKey(groupId);
      if (gKey == null) return;
      const tabGroup = this.tabGroups.get(gKey);
      if (!tabGroup) return;
      tabGroup.name = previousName;
      this.tabGroups.set(gKey, tabGroup);
      const el = document.querySelector(`[data-tab-group-id="${gKey}"]`);
      const titleEl = el?.querySelector('.tab-title');
      if (titleEl && titleEl.tagName === 'SPAN') titleEl.textContent = previousName;
      this.saveTabGroups();
    },

    _undoTabIcon(tabId, previousIcon, previousIconType) {
      const tid = this._normalizeTabMapKey(tabId);
      if (tid == null) return;
      const tab = this.tabs.get(tid);
      if (!tab) return;
      tab.customIcon = previousIcon;
      tab.customIconType = previousIconType;
      this.tabs.set(tid, tab);
      const el = document.querySelector(`[data-tab-id="${tid}"]`);
      if (el) this.updateTabIcon(el, tid);
    },

    _undoTabGroupIcon(groupId, previousIcon, previousIconType) {
      const gKey = this.findTabGroupKey(groupId);
      if (gKey == null) return;
      const tabGroup = this.tabGroups.get(gKey);
      if (!tabGroup) return;
      tabGroup.icon = previousIcon;
      tabGroup.iconType = previousIconType;
      this.tabGroups.set(gKey, tabGroup);
      this.saveTabGroups();
      this.renderTabGroups();
    },

    async _undoFavoriteIcon(favoriteId, previousIcon, previousIconType) {
      const fav = this.favorites.find((f) => f.id === favoriteId);
      if (!fav) return;
      fav.customIcon = previousIcon;
      fav.customIconType = previousIconType;
      const rt = this._normalizeTabMapKey(fav.runtimeTabId);
      if (rt != null && this.tabs.has(rt)) {
        const tab = this.tabs.get(rt);
        tab.customIcon = previousIcon;
        tab.customIconType = previousIconType;
        this.tabs.set(rt, tab);
        const el = document.querySelector(`[data-tab-id="${rt}"]`);
        if (el) this.updateTabIcon(el, rt);
      }
      await this.saveFavorites();
      this.renderFavorites();
    },

    async _undoAddFavorite(favoriteId) {
      this._suppressUndo = true;
      try {
        const before = this.favorites.length;
        this.favorites = this.favorites.filter((f) => f.id !== favoriteId);
        if (this.favorites.length === before) return;
        await this.saveFavorites();
        this.renderFavorites();
      } finally {
        this._suppressUndo = false;
      }
    },

    async _undoRemoveFavorite(favoriteSnapshot, index) {
      if (!favoriteSnapshot?.id) return;
      this._suppressUndo = true;
      try {
        const copy = JSON.parse(JSON.stringify(favoriteSnapshot));
        copy.runtimeTabId = null;
        const idx = Number.isFinite(index) && index >= 0 ? index : this.favorites.length;
        this.favorites.splice(idx, 0, copy);
        await this.saveFavorites();
        this.renderFavorites();
      } finally {
        this._suppressUndo = false;
      }
    },

    performTabUndo() {
      return this.performUndo();
    },

    performUndo() {
      if (!Array.isArray(this.tabUndoStack)) this.tabUndoStack = [];
      if (!Array.isArray(this.closedTabs)) this.closedTabs = [];

      const hasAxisUndo = this.tabUndoStack.length > 0 || this.closedTabs.length > 0;
      const active = document.activeElement;
      if (!hasAxisUndo && this._isNativeUndoField(active)) {
        const before = active.value ?? active.innerHTML;
        try {
          document.execCommand('undo');
        } catch (_) {}
        const after = active.value ?? active.innerHTML;
        if (before !== after) return true;
      }

      if (this.tabUndoStack.length === 0) {
        if (this.closedTabs.length > 0) {
          this.recoverClosedTab();
          this._syncUndoShortcutState();
          return true;
        }
        return false;
      }

      const action = this.tabUndoStack.pop();
      this._suppressUndo = true;
      try {
        if (!action?.type) {
          if (this.closedTabs.length > 0) {
            this.recoverClosedTab();
            return true;
          }
          return false;
        }
        switch (action.type) {
          case 'close_tab': {
            const data = action.data || action.snapshot;
            const newTabId = this._restoreTabFromSnapshot(data, { activate: data?.wasActive !== false });
            this._forgetClosedTabMatch(action.oldTabId, data);
            if (newTabId != null) {
              this.showNotification(`Undo: Restored ${data.customTitle || data.title}`, 'success');
            } else if (this.closedTabs.length > 0) {
              this.recoverClosedTab();
            }
            break;
          }
          case 'clear_unpinned_batch':
            this._undoClearUnpinnedBatch(action.data);
            this.showNotification('Undo: Restored cleared tabs', 'success');
            break;
          case 'pin_tab':
            this._undoPinState(action.tabId, false, null);
            this.showNotification('Undo: Tab unpinned', 'success');
            break;
          case 'unpin_tab':
            this._undoPinState(action.tabId, true, action.savedLinkUrl);
            this.showNotification('Undo: Tab pinned', 'success');
            break;
          case 'add_favorite':
            void this._undoAddFavorite(action.favoriteId);
            this.showNotification('Undo: Removed from Favorites', 'success');
            break;
          case 'remove_favorite':
            void this._undoRemoveFavorite(action.favorite, action.index);
            this.showNotification('Undo: Restored Favorite', 'success');
            break;
          case 'rename_tab':
            this._undoRenameTab(action.tabId, action.previousTitle, action.previousCustomTitle);
            this.showNotification('Undo: Tab name restored', 'success');
            break;
          case 'rename_tab_group':
            this._undoRenameTabGroup(action.groupId, action.previousName);
            this.showNotification('Undo: Tab group name restored', 'success');
            break;
          case 'change_icon_tab':
            this._undoTabIcon(action.tabId, action.previousIcon, action.previousIconType);
            this.showNotification('Undo: Tab icon restored', 'success');
            break;
          case 'change_icon_tab_group':
            this._undoTabGroupIcon(action.groupId, action.previousIcon, action.previousIconType);
            this.showNotification('Undo: Tab group icon restored', 'success');
            break;
          case 'change_icon_favorite':
            void this._undoFavoriteIcon(action.favoriteId, action.previousIcon, action.previousIconType);
            this.showNotification('Undo: Favorite icon restored', 'success');
            break;
          case 'add_to_group':
            this.removeTabFromTabGroup(action.tabId, action.tabGroupId, true);
            this.showNotification('Undo: Tab removed from group', 'success');
            break;
          case 'remove_from_group':
            this.addTabToTabGroup(action.tabId, action.tabGroupId, true, action.indexInGroup);
            this.showNotification('Undo: Tab put back in group', 'success');
            break;
          case 'delete_profile': {
            void (async () => {
              try {
                const restored = await window.electronAPI.restoreTrashedProfile(action.trashId);
                if (!restored?.ok) return;
                await this.refreshProfilesMenu();
                this.showNotification(`Undo: Restored “${restored.profileName || 'profile'}”`, 'success');
              } catch (_) {}
            })();
            break;
          }
          default:
            break;
        }
        return true;
      } finally {
        this._suppressUndo = false;
        this._syncUndoShortcutState();
        this._refreshTabsScrollEdges?.();
      }
    },
  };

  function attach(AxisBrowserPrototype) {
    if (!AxisBrowserPrototype) return;
    Object.assign(AxisBrowserPrototype, undoMethods);
  }

  global.AxisUndo = { attach, undoMethods };
})(typeof window !== 'undefined' ? window : global);
