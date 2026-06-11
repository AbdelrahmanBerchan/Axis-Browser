/**
 * In-window profile switching: data + tab DOM pools per profile; sidebar chrome stays put.
 */
(function (global) {
  const SLIDE_WIDTH_RATIO = 0.88;
  const SLIDE_MS = 280;
  const SLIDE_EXIT_MS = 160;
  const SLIDE_DRAG_MS = 220;
  const SLIDE_SNAP_MS = 180;
  const SLIDE_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
  const COMMIT_RATIO = 0.28;
  const MIN_COMMIT_PX = 44;
  const WHEEL_COOLDOWN_MS = 500;
  const DRAG_MAX_RATIO = 0.42;
  const MAX_RUNTIME_CACHE = 6;

  function prefersReducedMotion() {
    try {
      return global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (_) {
      return false;
    }
  }

  function sanitizeProfileId(id) {
    return String(id || 'personal')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-') || 'personal';
  }

  const profileSwipeMethods = {
    _axisProfileDomPoolId(profileId) {
      return `axis-profile-dom-pool-${sanitizeProfileId(profileId)}`;
    },

    unwrapProfileSwipeChrome() {
      const sidebar = document.getElementById('sidebar');
      if (sidebar) {
        const unwrapPane = (pane, insertBefore) => {
          const tabs = pane.querySelector('.tabs-section');
          if (tabs && tabs.parentNode !== sidebar) {
            if (insertBefore) sidebar.insertBefore(tabs, insertBefore);
            else sidebar.insertBefore(tabs, sidebar.firstChild);
          }
        };
        const footer = sidebar.querySelector('.sidebar-section.sidebar-footer');
        if (footer && footer.parentNode !== sidebar) {
          sidebar.appendChild(footer);
        }
        const plusMenu = document.getElementById('sidebar-plus-menu');
        const insertBefore = plusMenu || null;

        const topbar = sidebar.querySelector(':scope > .sidebar-tabs-topbar');
        const tabsSection = sidebar.querySelector('.tabs-section');
        if (topbar && tabsSection && !tabsSection.contains(topbar)) {
          tabsSection.insertBefore(topbar, tabsSection.firstChild);
          delete topbar.dataset.pinnedOutside;
        }

        const stage = document.getElementById('sidebar-profile-swipe-stage');
        if (stage) {
          const pane = stage.querySelector('.sidebar-profile-pane--live') || stage;
          unwrapPane(pane, insertBefore || stage);
          const footerInPane = pane.querySelector('.sidebar-footer');
          if (footerInPane && footerInPane.parentNode !== sidebar) {
            sidebar.appendChild(footerInPane);
          }
          stage.remove();
        }

        for (const hostId of ['sidebar-profile-swipe-host', 'sidebar-profile-swipe-viewport']) {
          const host = document.getElementById(hostId);
          if (!host) continue;
          unwrapPane(host.querySelector('.profile-swipe-pane--live') || host, insertBefore || host);
          host.remove();
        }
      }

      this._cancelSidebarSlideAnimation();
      this._sidebarProfileStage = null;
      this._sidebarProfileTrack = null;
      this._sidebarProfilePane = null;
    },

    _isProfileSwipeChromeHealthy() {
      const sidebar = document.getElementById('sidebar');
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      const track = document.getElementById('sidebar-profile-swipe-track');
      const pane = track?.querySelector('.sidebar-profile-pane--live');
      const tabsInPane = pane?.querySelector('.tabs-section');
      const footer = sidebar?.querySelector(':scope > .sidebar-section.sidebar-footer');
      if (!sidebar || !stage || !track || !pane || !tabsInPane || !footer) return false;
      if (sidebar.querySelector(':scope > .tabs-section')) return false;
      if (
        stage.contains(footer) ||
        stage.querySelector('#sidebar-profile-footer, #sidebar-media-dock, .sidebar-footer')
      ) {
        return false;
      }
      const topbar = sidebar.querySelector(':scope > .sidebar-tabs-topbar');
      if (!topbar || stage.contains(topbar)) return false;
      return true;
    },

    /** Keep floating Clear above the window drag strip and outside the sliding pane. */
    _pinSidebarTopbarOutsideStage() {
      const sidebar = document.getElementById('sidebar');
      const topbar = document.querySelector('.sidebar-tabs-topbar');
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      if (!sidebar || !topbar) return;

      if (
        stage &&
        (stage.contains(topbar) || topbar.closest('.sidebar-profile-pane, #sidebar-profile-swipe-track'))
      ) {
        sidebar.insertBefore(topbar, stage);
        topbar.dataset.pinnedOutside = '1';
      }
    },

    /** Keep mini player + profile button as fixed sidebar children (never inside the slide stage). */
    _pinSidebarFooterOutsideStage() {
      const sidebar = document.getElementById('sidebar');
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      if (!sidebar) return;

      let footer = sidebar.querySelector(':scope > .sidebar-section.sidebar-footer');
      const plusMenu = document.getElementById('sidebar-plus-menu');

      const pullOut = (root) => {
        if (!root) return;
        const nested =
          root.querySelector('.sidebar-section.sidebar-footer') ||
          root.querySelector('#sidebar-media-dock')?.closest('.sidebar-section') ||
          root.querySelector('#sidebar-profile-footer')?.closest('.sidebar-section');
        if (nested && nested.parentNode !== sidebar) {
          footer = nested;
        }
      };

      pullOut(stage);
      pullOut(document.getElementById('sidebar-profile-swipe-track'));
      pullOut(document.querySelector('.sidebar-profile-pane--live'));

      if (footer && footer.parentNode !== sidebar) {
        sidebar.appendChild(footer);
      }

      if (footer && stage && footer.parentNode === sidebar) {
        if (plusMenu && plusMenu.parentNode === sidebar) {
          if (footer.nextElementSibling !== plusMenu) {
            sidebar.insertBefore(footer, plusMenu);
          }
        } else if (stage.nextElementSibling !== footer) {
          sidebar.insertBefore(footer, stage.nextSibling);
        }
      }
    },

    _slidePane() {
      return (
        this._sidebarProfilePane ||
        document.querySelector('#sidebar-profile-swipe-track .sidebar-profile-pane--live')
      );
    },

    _ensureSidebarProfileStage() {
      const sidebar = document.getElementById('sidebar');
      if (!sidebar) return;

      let stage = document.getElementById('sidebar-profile-swipe-stage');
      if (!stage) {
        const tabs = sidebar.querySelector('.sidebar-section.tabs-section');
        if (!tabs) return;

        stage = document.createElement('div');
        stage.id = 'sidebar-profile-swipe-stage';
        stage.className = 'sidebar-profile-swipe-stage';
        const track = document.createElement('div');
        track.id = 'sidebar-profile-swipe-track';
        track.className = 'sidebar-profile-swipe-track';
        const pane = document.createElement('div');
        pane.className = 'sidebar-profile-pane sidebar-profile-pane--live';
        const footer = sidebar.querySelector('.sidebar-section.sidebar-footer');
        const plusMenu = document.getElementById('sidebar-plus-menu');
        const insertBefore = footer || plusMenu || null;
        if (insertBefore) sidebar.insertBefore(stage, insertBefore);
        else sidebar.appendChild(stage);
        pane.appendChild(tabs);
        track.appendChild(pane);
        stage.appendChild(track);
      }

      this._sidebarProfileStage = stage;
      this._sidebarProfileTrack = document.getElementById('sidebar-profile-swipe-track');
      this._sidebarProfilePane =
        this._sidebarProfileTrack?.querySelector('.sidebar-profile-pane--live') || null;
      this._pinSidebarFooterOutsideStage();
      this._pinSidebarTopbarOutsideStage();
    },

    ensureProfileSwipeChrome() {
      this._pinSidebarTopbarOutsideStage();
      if (this.isIncognitoWindow) return;
      if (!this._isProfileSwipeChromeHealthy()) {
        this.unwrapProfileSwipeChrome();
      }
      this._ensureSidebarProfileStage();
      this._pinSidebarFooterOutsideStage();
      this._pinSidebarTopbarOutsideStage();

      if (!this._profileRuntime) this._profileRuntime = new Map();
      if (!this._profileBootstrapCache) this._profileBootstrapCache = new Map();
      if (!this._profilePrefetchPending) this._profilePrefetchPending = new Set();
      if (this._profileSwipeLock == null) this._profileSwipeLock = false;
      if (this._profileWheelCooldownUntil == null) this._profileWheelCooldownUntil = 0;

      document.getElementById('profile-switch-overlay')?.remove();

      if (this.tabs?.size > 0) {
        const hasSidebarTabs = document.querySelector(
          '#tabs-container .tab, #tabs-container .tab-group'
        );
        if (!hasSidebarTabs) {
          this._syncProfileSidebarDom({ setupDrag: true });
        }
      }
    },

    getProfileDomPool(profileId = this.profileId) {
      const poolId = this._axisProfileDomPoolId(profileId);
      let pool = document.getElementById(poolId);
      if (!pool) {
        pool = document.createElement('div');
        pool.id = poolId;
        pool.className = 'axis-profile-dom-pool';
        pool.setAttribute('aria-hidden', 'true');
        document.body.appendChild(pool);
      }
      return pool;
    },

    _parkSidebarTabDom(profileId) {
      const pool = this.getProfileDomPool(profileId);
      const container = document.getElementById('tabs-container');
      if (!container) return;
      const nodes = [];
      for (const child of container.children) {
        if (child.classList?.contains('tab') || child.classList?.contains('tab-group')) {
          nodes.push(child);
        }
      }
      for (const node of nodes) {
        pool.appendChild(node);
      }
    },

    _stageSlidePx() {
      const stage = this._sidebarProfileStage || document.getElementById('sidebar-profile-swipe-stage');
      const w = stage?.clientWidth || 0;
      return Math.max(96, Math.round(w * SLIDE_WIDTH_RATIO));
    },

    _tabIdFromNode(node) {
      if (!node?.dataset?.tabId) return null;
      if (typeof this._normalizeTabMapKey === 'function') {
        return this._normalizeTabMapKey(node.dataset.tabId);
      }
      const n = Number(node.dataset.tabId);
      return Number.isNaN(n) ? node.dataset.tabId : n;
    },

    _groupIdFromNode(node) {
      if (!node?.dataset?.tabGroupId) return null;
      const n = Number(node.dataset.tabGroupId);
      return Number.isNaN(n) ? node.dataset.tabGroupId : n;
    },

    /** Reattach pooled tab/group nodes without a full sidebar rebuild. */
    _restorePooledSidebar(profileId) {
      const pool = this.getProfileDomPool(profileId);
      const container = document.getElementById('tabs-container');
      const separator = document.getElementById('tabs-separator');
      const newTabBtn = document.getElementById('sidebar-new-tab-btn');
      if (!pool || !container || !separator || pool.childElementCount === 0) return false;

      const pinned = [];
      const unpinned = [];

      for (const node of Array.from(pool.children)) {
        if (node.classList?.contains('tab-group')) {
          const gid = this._groupIdFromNode(node);
          const g =
            gid != null
              ? this.tabGroups.get(gid) ||
                this.tabGroups.get(Number(gid)) ||
                this.tabGroups.get(String(gid))
              : null;
          if (g && g.pinned === false) unpinned.push(node);
          else pinned.push(node);
          continue;
        }
        if (node.classList?.contains('tab')) {
          const tid = this._tabIdFromNode(node);
          const t = tid != null ? this.tabs.get(tid) : null;
          if (t?.pinned || node.classList.contains('pinned')) pinned.push(node);
          else unpinned.push(node);
        }
      }

      for (const node of pinned) {
        container.insertBefore(node, separator);
      }

      let ref = newTabBtn?.nextSibling || null;
      for (const node of unpinned) {
        if (ref) container.insertBefore(node, ref);
        else container.appendChild(node);
        ref = node.nextSibling;
      }

      return pinned.length + unpinned.length > 0;
    },

    _syncProfileSidebarDom(opts = {}) {
      const setupDrag = opts.setupDrag !== false;
      this.cacheDOMElements?.();
      if (!this.elements?.tabsContainer) return;
      this._suppressTabGroupsAutosave = true;
      try {
        this.syncSidebarFromTabGroups?.();
        this.renderFavorites?.();
        this.updatePinnedSeparatorVisibility?.();
        this.updateEmptyState?.();
        if (setupDrag && typeof this.setupTabDragDrop === 'function') {
          this.setupTabDragDrop();
        }
      } finally {
        this._suppressTabGroupsAutosave = false;
      }
    },

    _applyProfileState(state, { parkOutgoing = true, fast = true } = {}) {
      const fromPid = sanitizeProfileId(this.profileId);
      const pid = sanitizeProfileId(state.profileId);

      if (parkOutgoing) {
        this._parkSidebarTabDom(fromPid);
      }

      this.profileId = pid;
      this.tabs = state.tabs || new Map();
      this.tabGroups = state.tabGroups || new Map();
      this.currentTab = state.currentTab ?? null;
      this.favorites = Array.isArray(state.favorites) ? state.favorites : [];
      this.settings = state.settings ? { ...state.settings } : {};
      this.windowProfileIcon = state.windowProfileIcon ?? this.windowProfileIcon;
      this._sidebarMediaDock = state.sidebarMediaDock || null;

      const restored = fast && this._restorePooledSidebar(pid);
      if (restored) {
        this.cacheDOMElements?.();
        this.renderFavorites?.();
        this.updatePinnedSeparatorVisibility?.();
        this.updateEmptyState?.();
      } else {
        this._syncProfileSidebarDom({ setupDrag: false });
      }
    },

    _hideWebviewsForProfile(profileId) {
      const pid = sanitizeProfileId(profileId);
      for (const tab of this.tabs?.values?.() || []) {
        const wv = tab?.webview;
        if (!wv) continue;
        try {
          wv.dataset.axisProfile = pid;
          wv.classList.add('axis-profile-webview-suspended');
        } catch (_) {}
      }
      const container = document.getElementById('webviews-container');
      container?.querySelectorAll('webview').forEach((wv) => {
        const wvPid = sanitizeProfileId(wv.dataset?.axisProfile || pid);
        if (wvPid !== pid) wv.classList.add('axis-profile-webview-suspended');
      });
      const legacy = document.getElementById('webview');
      if (legacy) legacy.classList.add('axis-profile-webview-suspended');
    },

    _showWebviewsForProfile(profileId) {
      const pid = sanitizeProfileId(profileId);
      for (const tab of this.tabs?.values?.() || []) {
        const wv = tab?.webview;
        if (!wv) continue;
        try {
          wv.dataset.axisProfile = pid;
          wv.classList.remove('axis-profile-webview-suspended');
        } catch (_) {}
      }
      const container = document.getElementById('webviews-container');
      container?.querySelectorAll('webview').forEach((wv) => {
        const wvPid = sanitizeProfileId(wv.dataset?.axisProfile || '');
        if (wvPid === pid) wv.classList.remove('axis-profile-webview-suspended');
        else wv.classList.add('axis-profile-webview-suspended');
      });
      const legacy = document.getElementById('webview');
      if (legacy) legacy.classList.add('axis-profile-webview-suspended');
    },

    async _flushCurrentProfileToStore() {
      if (this.isIncognitoWindow) return;
      try {
        const payload = this.flushSessionStatePayload?.();
        if (payload && window.electronAPI?.flushSessionAsync) {
          await window.electronAPI.flushSessionAsync(payload);
        } else if (payload && window.electronAPI?.flushSessionSync) {
          window.electronAPI.flushSessionSync(payload);
        }
        await this.savePinnedTabs?.();
        await this.saveTabGroups?.();
        this.saveFavorites?.();
      } catch (e) {
        console.error('flush profile store', e);
      }
    },

    _snapshotRunningProfile() {
      const pid = sanitizeProfileId(this.profileId);

      const state = {
        profileId: pid,
        tabs: this.tabs,
        tabGroups: this.tabGroups,
        currentTab: this.currentTab,
        favorites: Array.isArray(this.favorites) ? [...this.favorites] : [],
        settings: this.settings ? { ...this.settings } : {},
        windowProfileIcon: this.windowProfileIcon,
        sidebarMediaDock: this._sidebarMediaDock ? { ...this._sidebarMediaDock } : null,
        shellChromeSnapshot: this._captureShellChromeSnapshot?.() || null,
        urlBarChromeSnapshot: this._captureUrlBarChromeSnapshot?.() || null
      };

      this._profileRuntime.set(pid, state);

      if (this._profileRuntime.size > MAX_RUNTIME_CACHE) {
        const oldest = this._profileRuntime.keys().next().value;
        if (oldest && oldest !== pid) this._disposeProfileRuntime(oldest);
      }

      if (this.elements?.sidebarMediaDock) {
        this.elements.sidebarMediaDock.classList.add('hidden');
      }

      return state;
    },

    _disposeProfileRuntime(profileId) {
      const id = sanitizeProfileId(profileId);
      const state = this._profileRuntime?.get(id);
      if (state?.tabs) {
        for (const tab of state.tabs.values()) {
          if (!tab?.webview) continue;
          try {
            this.cleanupWebviewListeners?.(tab.webview);
            tab.webview.remove();
          } catch (_) {}
        }
      }
      const pool = document.getElementById(this._axisProfileDomPoolId(id));
      if (pool) pool.innerHTML = '';
      this._profileRuntime?.delete(id);
    },

    _hideShellPanelsForProfileSwitch() {
      const hide = (id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
      };
      hide('settings-panel');
      hide('downloads-panel');
      hide('notes-panel');
      hide('security-panel');
      this.elements?.vaultAutofillPanel?.classList?.add('hidden');
      this.elements?.vaultSaveModal?.classList?.add('hidden');
      this.elements?.vaultPickModal?.classList?.add('hidden');
    },

    _commitProfileWebview(profileId = this.profileId) {
      const pid = sanitizeProfileId(profileId);
      document
        .getElementById('webviews-container')
        ?.querySelectorAll('webview')
        .forEach((wv) => wv.classList.add('axis-profile-webview-suspended'));

      this._showWebviewsForProfile(pid);

      if (this.currentTab != null && this.tabs.has(this.currentTab)) {
        this.switchToTab?.(this.currentTab, { fromProfileSwitch: true });
      } else {
        this._hideShellPanelsForProfileSwitch();
        this.updateUrlBar?.(null);
      }
    },

    _activateProfileDom(state) {
      const pid = sanitizeProfileId(state.profileId);
      this._profileRuntime.delete(pid);
      this._applyProfileState(state);

      if (this._sidebarMediaDock && this.elements?.sidebarMediaDock) {
        this.elements.sidebarMediaDock.classList.remove('hidden');
        this._refreshSidebarMediaDockChrome?.();
      }
    },

    async _activateProfileFromDisk(profileId, opts = {}) {
      const pid = sanitizeProfileId(profileId);
      this._parkSidebarTabDom(sanitizeProfileId(this.profileId));

      this.profileId = pid;
      this.tabs = new Map();
      this.tabGroups = new Map();
      this.currentTab = null;
      this.favorites = [];

      const boot = this._profileBootstrapCache?.get(pid);
      if (boot?.settings) {
        this.settings = { ...boot.settings };
        if (Array.isArray(boot.pinnedTabs)) this.settings.pinnedTabs = boot.pinnedTabs;
        if (Array.isArray(boot.tabGroups)) this.settings.tabGroups = boot.tabGroups;
      } else {
        await this.loadSettings?.();
      }
      if (!opts.deferHeavy) {
        await this.refreshShortcutCache?.();
      }
      this._lastJavascriptEnabled = this.settings?.javascriptEnabled !== false;
      this.loadFavorites?.();
      await this.loadPinnedTabs?.();
      await this.loadTabGroups?.();

      this._syncProfileSidebarDom({ setupDrag: false });

      if (!opts.deferHeavy) {
        this._commitProfileWebview(pid);
        const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === pid);
        if (prof?.icon) {
          this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
        }
        if (this.settings?.themeColor || this.settings?.gradientColor) {
          this.applyCustomThemeFromSettings?.();
        } else {
          this.resetToBlackTheme?.();
        }
        if (!this.isIncognitoWindow && this.settings?.transparentSites) {
          this.applyTransparentSitesToAllWebviews?.();
        }
      }
    },

    /** Shell + URL bar tint — sync, before webview commit or sidebar slide. */
    _applyProfileChromeImmediate(cached = null) {
      try {
        this._profileUrlBarRestoredFromCache = false;

        if (cached?.shellChromeSnapshot && this._restoreShellChromeSnapshot?.(cached.shellChromeSnapshot)) {
          /* restored */
        } else if (this.settings?.themeColor || this.settings?.gradientColor) {
          this.applyCustomThemeFromSettings?.();
        } else {
          this.resetToBlackTheme?.();
        }

        this._urlBarInstantThemeTabSwitch = true;
        this.elements?.webviewUrlBar?.classList.add('url-bar--instant-theme');

        const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        const urlSnap = cached?.urlBarChromeSnapshot;
        const hasUrlSnap =
          urlSnap &&
          (urlSnap.internalShell || (urlSnap.vars && Object.keys(urlSnap.vars).length > 0));

        if (hasUrlSnap && this._restoreUrlBarChromeSnapshot?.(urlSnap)) {
          this._profileUrlBarRestoredFromCache = true;
          this._skipNextUrlBarRefresh = true;
        } else if (tab) {
          if (tab.url === this.NEWTAB_URL) {
            this._setUrlBarInternalShellMode?.('ntp');
            this.applyInternalShellUrlBarStyle?.();
          } else if (tab.url === 'axis://settings' || tab.isSettings) {
            this._setUrlBarInternalShellMode?.('settings');
            this.applyInternalShellUrlBarStyle?.();
          } else if (
            tab.url &&
            tab.url !== 'about:blank' &&
            !String(tab.url).startsWith('axis:note://')
          ) {
            if (!this.applyCachedTheme?.(tab.url)) {
              this.applyAppThemeToUrlBar?.();
            }
          } else {
            this.applyAppThemeToUrlBar?.();
          }
        }

        const wv = this.getActiveWebview?.();
        if (wv && tab) {
          this.updateUrlBar?.(wv, { skipExtractTheme: true, keepInstantTheme: true });
        } else {
          this.updateUrlBar?.(null, { keepInstantTheme: true });
        }
      } catch (e) {
        console.error('profile chrome immediate apply failed', e);
      }
    },

    async _applyProfileChromeAfterSwitch() {
      try {
        await this.refreshShortcutCache?.();
        this.syncAdBlockerUrlBarState?.();
        this.applySidebarPosition?.();
        if (this.settings?.transparentSites) {
          this.applyTransparentSitesToAllWebviews?.();
        } else {
          this.removeTransparentSitesFromAllWebviews?.();
        }
        this.applyAmbientFromSettings?.();
        const wv = this.getActiveWebview?.();
        const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        if (
          wv &&
          tab &&
          tab.url !== 'axis://settings' &&
          !tab.isSettings &&
          !this._profileUrlBarRestoredFromCache
        ) {
          void this.extractUrlBarTheme?.(wv);
        }
        this._profileUrlBarRestoredFromCache = false;
        void this.populateExtensionsMenu?.();
      } catch (e) {
        console.error('profile chrome apply failed', e);
      }
    },

    _cancelSidebarSlideAnimation() {
      const pane = this._slidePane();
      if (pane?._axisSlideAnim) {
        try {
          pane._axisSlideAnim.cancel();
        } catch (_) {}
        pane._axisSlideAnim = null;
      }
      if (pane) {
        pane.classList.remove('axis-sidebar-dragging', 'axis-sidebar-animating', 'axis-sidebar-snap-back');
        pane.style.removeProperty('transform');
        pane.style.removeProperty('transition');
      }
      document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
      this._sidebarProfileStage?.classList.remove('axis-sidebar-drag-active');
    },

    _parsePaneTranslateX(pane) {
      if (!pane) return 0;
      const inline = pane.style.transform;
      const match = inline && inline.match(/translate3d\(\s*(-?[\d.]+)px/);
      if (match) return parseFloat(match[1]);
      return 0;
    },

    _sidebarDragMaxPx() {
      return this._stageSlidePx();
    },

    _applySidebarPaneDrag(deltaX, direction) {
      const pane = this._slidePane();
      if (!pane || !direction) return;
      const max = this._sidebarDragMaxPx();
      const raw = direction > 0 ? -deltaX : deltaX;
      const clamped = Math.max(0, Math.min(max, raw));
      const t = 1 - Math.pow(1 - clamped / max, 1.2);
      const slide = (direction > 0 ? -1 : 1) * max * t;
      pane.style.transform = `translate3d(${slide}px, 0, 0)`;
    },

    async _resetSidebarPanePose(animate = false) {
      const pane = this._slidePane();
      if (!pane) return;

      pane.classList.remove('axis-sidebar-dragging');
      if (!animate || !pane.animate) {
        this._cancelSidebarSlideAnimation();
        return;
      }

      const fromX = this._parsePaneTranslateX(pane);
      pane.classList.add('axis-sidebar-animating');
      const anim = pane.animate(
        [{ transform: `translate3d(${fromX}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration: SLIDE_SNAP_MS, easing: SLIDE_EASE, fill: 'forwards' }
      );
      pane._axisSlideAnim = anim;
      try {
        await anim.finished;
      } catch (_) {}
      anim.cancel();
      pane._axisSlideAnim = null;
      pane.classList.remove('axis-sidebar-animating');
      pane.style.removeProperty('transform');
    },

    /** Slide the outgoing tab list off-screen — runs immediately, even on first switch (no runtime cache). */
    async _runExitProfileSlide(direction) {
      this._ensureSidebarProfileStage();
      const pane = this._slidePane();
      if (!pane?.animate) return;

      const dist = this._stageSlidePx();
      const sign = direction > 0 ? 1 : -1;
      const exitX = -sign * dist;

      this._cancelSidebarSlideAnimation();
      pane.classList.remove('axis-sidebar-dragging');
      pane.classList.add('axis-sidebar-animating');

      const anim = pane.animate(
        [{ transform: 'translate3d(0, 0, 0)' }, { transform: `translate3d(${exitX}px, 0, 0)` }],
        { duration: SLIDE_EXIT_MS, easing: SLIDE_EASE, fill: 'forwards' }
      );
      pane._axisSlideAnim = anim;
      try {
        await anim.finished;
      } catch (_) {
        /* cancelled */
      }
      anim.cancel();
      pane._axisSlideAnim = null;
      pane.classList.remove('axis-sidebar-animating');
      pane.style.transition = 'none';
      pane.style.transform = `translate3d(${exitX}px, 0, 0)`;
    },

    /**
     * Cosmetic slide after DOM + webview already swapped. Only the tab-list pane moves.
     */
    async _runEnterProfileSlide(direction, opts = {}) {
      this._ensureSidebarProfileStage();
      this._pinSidebarFooterOutsideStage();
      const pane = this._slidePane();
      const stage = this._sidebarProfileStage;

      if (!pane) return;

      const dist = this._stageSlidePx();
      const sign = direction > 0 ? 1 : -1;
      const enterX = sign * dist;
      const fromDrag = !!opts.fromDrag;
      const startX = fromDrag ? this._parsePaneTranslateX(pane) : enterX;
      const duration = fromDrag ? SLIDE_DRAG_MS : SLIDE_MS;

      stage?.classList.remove('axis-sidebar-drag-active');
      pane.classList.remove('axis-sidebar-dragging');
      pane.classList.add('axis-sidebar-animating');

      if (pane._axisSlideAnim) {
        try {
          pane._axisSlideAnim.cancel();
        } catch (_) {}
        pane._axisSlideAnim = null;
      }

      if (!fromDrag) {
        pane.style.transition = 'none';
        pane.style.transform = `translate3d(${enterX}px, 0, 0)`;
        void pane.offsetWidth;
      }

      const anim = pane.animate(
        [{ transform: `translate3d(${startX}px, 0, 0)` }, { transform: 'translate3d(0, 0, 0)' }],
        { duration, easing: SLIDE_EASE, fill: 'forwards' }
      );
      pane._axisSlideAnim = anim;

      try {
        await anim.finished;
      } catch (_) {
        /* cancelled */
      }

      anim.cancel();
      pane._axisSlideAnim = null;
      pane.classList.remove('axis-sidebar-animating');
      pane.style.removeProperty('transform');
      pane.style.removeProperty('transition');
      stage?.classList.remove('axis-sidebar-drag-active');
    },

    _profileSwipeDirectionFor(targetId) {
      const ids = (this.profiles || []).map((p) => sanitizeProfileId(p.id));
      const from = ids.indexOf(sanitizeProfileId(this.profileId));
      const to = ids.indexOf(sanitizeProfileId(targetId));
      if (from < 0 || to < 0) return 1;
      return to > from ? 1 : -1;
    },

    setupProfileSwipeGestures() {
      if (this.isIncognitoWindow) return;
      this.ensureProfileSwipeChrome();
      const sidebar = document.getElementById('sidebar');
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      const gestureRoot = stage || sidebar;
      if (!gestureRoot || gestureRoot.dataset.swipeBound === '1') return;
      gestureRoot.dataset.swipeBound = '1';

      const shouldIgnoreSwipeTarget = (target) => {
        if (!target || !(target instanceof Element)) return true;
        if (
          target.closest(
            '#clear-unpinned-floating, .sidebar-tabs-topbar, #profile-switcher-menu, #profile-switch-row-menu, .profile-switch-more-btn, #sidebar-profile-footer, .sidebar-footer, .sidebar-media-dock'
          )
        ) {
          return true;
        }
        if (target.closest('.tab, .tab-group, .favorites-grid, #sidebar-new-tab-btn')) return true;
        if (target.closest('#sidebar-plus-btn, #sidebar-plus-menu')) return true;
        if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return true;
        return false;
      };

      const orderedProfileIds = () =>
        (this.profiles || [])
          .map((p) => sanitizeProfileId(p.id))
          .filter((id) => id && id !== 'incognito');

      const adjacentProfileId = (direction) => {
        const ids = orderedProfileIds();
        const cur = sanitizeProfileId(this.profileId);
        const idx = ids.indexOf(cur);
        if (idx < 0) return null;
        return ids[idx + direction] || null;
      };

      let dragState = null;

      const onProfileWheel = (e) => {
        if (this._profileSwipeLock || this.isIncognitoWindow) return;
        if (Date.now() < (this._profileWheelCooldownUntil || 0)) return;
        if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.15) return;
        if (shouldIgnoreSwipeTarget(e.target)) return;

        const direction = e.deltaX > 0 ? 1 : -1;
        const targetId = adjacentProfileId(direction);
        if (!targetId) return;

        e.preventDefault();
        this._profileWheelCooldownUntil = Date.now() + WHEEL_COOLDOWN_MS;
        void this.switchToProfileId(targetId, { animate: true, direction });
      };

      if (gestureRoot.dataset.profileWheelBound !== '1') {
        gestureRoot.dataset.profileWheelBound = '1';
        gestureRoot.addEventListener('wheel', onProfileWheel, { passive: false });
      }

      const bindPointerGestures = () => {
        if (gestureRoot.dataset.profilePointerGestures === '1') return;
        gestureRoot.dataset.profilePointerGestures = '1';

        gestureRoot.addEventListener('pointerdown', (e) => {
          if (this._profileSwipeLock || this.isIncognitoWindow) return;
          if (e.button !== 0) return;
          if (shouldIgnoreSwipeTarget(e.target)) return;
          dragState = {
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            deltaX: 0,
            direction: 0,
            targetId: null,
            dragging: false
          };
        });

        gestureRoot.addEventListener(
          'pointermove',
          (e) => {
            if (!dragState || e.pointerId !== dragState.pointerId) return;
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            if (!dragState.dragging) {
              if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
              if (Math.abs(dy) > Math.abs(dx) * 1.15) {
                dragState = null;
                return;
              }
              dragState.dragging = true;
              dragState.direction = dx < 0 ? 1 : -1;
              dragState.targetId = adjacentProfileId(dragState.direction);
              if (!dragState.targetId) {
                dragState = null;
                return;
              }
              try {
                gestureRoot.setPointerCapture(e.pointerId);
              } catch (_) {}
              this._cancelSidebarSlideAnimation();
              sidebar?.classList.add('is-profile-swiping');
              this._sidebarProfileStage?.classList.add('axis-sidebar-drag-active');
              this._slidePane()?.classList.add('axis-sidebar-dragging');
            }
            dragState.deltaX = dx;
            this._applySidebarPaneDrag(dx, dragState.direction);
            e.preventDefault();
          },
          { passive: false }
        );

        const endDrag = (e) => {
          if (!dragState || e.pointerId !== dragState.pointerId) return;
          const state = dragState;
          dragState = null;
          try {
            gestureRoot.releasePointerCapture(e.pointerId);
          } catch (_) {}
          sidebar?.classList.remove('is-profile-swiping');
          this._sidebarProfileStage?.classList.remove('axis-sidebar-drag-active');
          this._slidePane()?.classList.remove('axis-sidebar-dragging');
          if (!state.dragging) return;

          const max = this._sidebarDragMaxPx();
          const commit =
            Math.abs(state.deltaX) >= MIN_COMMIT_PX ||
            Math.abs(state.deltaX) / max >= COMMIT_RATIO;
          if (commit && state.targetId) {
            void this.switchToProfileId(state.targetId, {
              animate: true,
              direction: state.direction,
              fromDrag: true
            });
          } else {
            void this._resetSidebarPanePose(true);
          }
        };

        gestureRoot.addEventListener('pointerup', endDrag);
        gestureRoot.addEventListener('pointercancel', endDrag);
      };

      bindPointerGestures();

      try {
        window.electronAPI?.onAxisSwitchProfile?.((payload) => {
          const id = sanitizeProfileId(payload?.profileId);
          if (!id || id === sanitizeProfileId(this.profileId)) return;
          void this.switchToProfileId(id, {
            animate: payload?.animate !== false,
            direction: this._profileSwipeDirectionFor(id)
          });
        });
      } catch (_) {}
    },

    _seedCurrentProfileRuntimeCache() {
      if (this.isIncognitoWindow) return;
      if (!this._profileRuntime) this._profileRuntime = new Map();
      const pid = sanitizeProfileId(this.profileId);
      if (this._profileRuntime.has(pid)) return;

      this._profileRuntime.set(pid, {
        profileId: pid,
        tabs: this.tabs,
        tabGroups: this.tabGroups,
        currentTab: this.currentTab,
        favorites: Array.isArray(this.favorites) ? [...this.favorites] : [],
        settings: this.settings ? { ...this.settings } : {},
        windowProfileIcon: this.windowProfileIcon,
        sidebarMediaDock: this._sidebarMediaDock ? { ...this._sidebarMediaDock } : null,
        shellChromeSnapshot: this._captureShellChromeSnapshot?.() || null,
        urlBarChromeSnapshot: this._captureUrlBarChromeSnapshot?.() || null
      });
    },

    _orderedProfileIds() {
      return (this.profiles || [])
        .map((p) => sanitizeProfileId(p.id))
        .filter((id) => id && id !== 'incognito');
    },

    async _prefetchProfileBootstrap(profileId) {
      const pid = sanitizeProfileId(profileId);
      if (!pid || pid === sanitizeProfileId(this.profileId)) return;
      if (this._profileRuntime.has(pid) || this._profileBootstrapCache?.has(pid)) return;
      if (this._profilePrefetchPending?.has(pid)) return;

      this._profilePrefetchPending.add(pid);
      try {
        const boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        if (boot?.settings) this._profileBootstrapCache.set(pid, boot);
      } catch (_) {
        /* optional */
      } finally {
        this._profilePrefetchPending.delete(pid);
      }
    },

    _prefetchAdjacentProfileCaches() {
      if (this.isIncognitoWindow) return;
      const ids = this._orderedProfileIds();
      const cur = sanitizeProfileId(this.profileId);
      const idx = ids.indexOf(cur);
      if (idx < 0) return;
      for (const neighbor of [ids[idx - 1], ids[idx + 1]]) {
        if (neighbor) void this._prefetchProfileBootstrap(neighbor);
      }
    },

    async _loadTargetProfileState(targetId, cached) {
      if (cached) {
        this._mountCachedProfile(cached);
        return cached;
      }
      await this._activateProfileFromDisk(targetId, { deferHeavy: true });
      return null;
    },

    _mountCachedProfile(cached) {
      const pid = sanitizeProfileId(cached.profileId);
      this._profileRuntime.delete(pid);
      this._applyProfileState(cached, { fast: true });

      if (this._sidebarMediaDock && this.elements?.sidebarMediaDock) {
        this.elements.sidebarMediaDock.classList.remove('hidden');
        this._refreshSidebarMediaDockChrome?.();
      }
    },

    async switchToProfileId(targetId, options = {}) {
      if (this.isIncognitoWindow) return;
      const id = sanitizeProfileId(targetId);
      const cur = sanitizeProfileId(this.profileId);
      if (id === cur || this._profileSwipeLock) return;

      this._profileSwipeLock = true;
      this.hideProfileSwitcherMenu?.();

      if (!this._isProfileSwipeChromeHealthy()) {
        this.ensureProfileSwipeChrome();
      } else {
        this._ensureSidebarProfileStage();
      }

      const direction = options.direction ?? this._profileSwipeDirectionFor(id);
      const cached = this._profileRuntime.get(id);
      const wantAnimate = options.animate !== false && !prefersReducedMotion();
      const fromDrag = !!options.fromDrag;

      try {
        this._snapshotRunningProfile();
        const flushPromise = this._flushCurrentProfileToStore();

        await window.electronAPI.switchProfileInWindow(id);

        if (wantAnimate && !fromDrag) {
          await this._runExitProfileSlide(direction);
        }

        const activated = await this._loadTargetProfileState(id, cached);

        this._applyProfileChromeImmediate?.(activated);
        if (!activated) {
          const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === id);
          if (prof?.icon) {
            this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
          }
        }

        this._commitProfileWebview(id);
        this.syncProfileSwitcherState?.();

        if (wantAnimate) {
          await this._runEnterProfileSlide(direction, { fromDrag });
        }

        if (typeof this.setupTabDragDrop === 'function') {
          this.setupTabDragDrop();
        }

        void flushPromise;
        void this._applyProfileChromeAfterSwitch?.();
        if (!activated && !this.isIncognitoWindow && this.settings?.transparentSites) {
          void this.applyTransparentSitesToAllWebviews?.();
        }
        void this.refreshProfilesMenu?.();
        this._prefetchAdjacentProfileCaches?.();
      } catch (e) {
        console.error('switchToProfileId failed', e);
        this.unwrapProfileSwipeChrome?.();
        this.cacheDOMElements?.();
        this._syncProfileSidebarDom({ setupDrag: true });
        this._cancelSidebarSlideAnimation();
      } finally {
        this._profileSwipeLock = false;
        document.getElementById('sidebar')?.classList.remove('is-profile-swiping');
        this._slidePane()?.classList.remove('axis-sidebar-dragging');
        this._sidebarProfileStage?.classList.remove('axis-sidebar-drag-active');
      }
    },

    evictProfileLayerCache(profileId) {
      this._disposeProfileRuntime(profileId);
      const pool = document.getElementById(this._axisProfileDomPoolId(profileId));
      if (pool) pool.remove();
    }
  };

  function attach(AxisBrowserPrototype) {
    Object.assign(AxisBrowserPrototype, profileSwipeMethods);
  }

  global.AxisProfileSwipe = { attach };
})(typeof window !== 'undefined' ? window : globalThis);
