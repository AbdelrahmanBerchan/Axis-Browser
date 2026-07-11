/**
 * In-window profile switching: data + tab DOM pools per profile; sidebar chrome stays put.
 */
(function (global) {
  const SLIDE_WIDTH_RATIO = 0.88;
  const SLIDE_MS = 280;
  const SLIDE_EXIT_MS = 160;
  const SLIDE_DRAG_MS = 220;
  /* Settle = continuation to the committed profile; snap = bounce back if you let go early. */
  const SLIDE_SETTLE_MS = 220;
  const SLIDE_SNAP_MS = 260;
  const SLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  /* Smooth commit finish — quick but never abrupt; tuned for release velocity. */
  const SLIDE_COMMIT_EASE = 'cubic-bezier(0.25, 0.85, 0.2, 1)';
  const SLIDE_INTERACTIVE_SETTLE_MIN_MS = 72;
  const SLIDE_INTERACTIVE_SETTLE_MAX_MS = 210;
  /* How far (fraction of pane width) or how fast (px/ms flick) before a release commits. */
  const COMMIT_RATIO = 0.4;
  const FLICK_VELOCITY = 0.44;
  /* Wrong-way give only — list-end slowdown is separate. */
  const EDGE_GIVE_RATIO = 0.08;
  /* List-end rubber — only at first/last profile in the list. */
  const EDGE_BOUNDARY_GIVE_RATIO = 0.15;
  const EDGE_BOUNDARY_STIFFNESS = 2.6;
  /* Finger → pane travel (1.0 = locked to finger). */
  const DRAG_TRACK_RATIO = 0.97;
  /* Trackpad: engage after this much horizontal travel; pause this long = let go. */
  const WHEEL_ENGAGE_PX = 14;
  const WHEEL_END_MS = 36;
  const DRAG_ENGAGE_PX = 5;
  /* Keep enough in-memory profiles that normal multi-profile use does not drop tabs. */
  const MAX_RUNTIME_CACHE = 12;
  const RELEASE_COMMIT_MS = 46;
  const RELEASE_COMMIT_MAX_MS = 132;
  const RELEASE_SNAP_MS = 92;

  function easeOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, 3);
  }

  /** Fast-out commit finish — matches SLIDE_COMMIT_EASE closely without per-frame layout reads. */
  function easeCommitFinish(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, 2.15);
  }

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
    _isProfileSwipeGestureBlocked() {
      return !!(
        this._sidebarReorderDragActive ||
        this._favoriteDrag ||
        document.querySelector('.smooth-dragging, .favorite-dragging')
      );
    },

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
      if (this._profileSwipeFinalizing == null) this._profileSwipeFinalizing = false;
      if (this._trackOffsetPx == null) this._trackOffsetPx = 0;
      if (this._activeSpringPromise == null) this._activeSpringPromise = null;
      if (this._pendingWheelResume == null) this._pendingWheelResume = null;
      if (this._swipeShellThemeRaf == null) this._swipeShellThemeRaf = null;
      if (this._profileSwipeThemeActive == null) this._profileSwipeThemeActive = false;
      if (!this._profileSwipeThemePackCache) this._profileSwipeThemePackCache = new Map();

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

    _stampSidebarNodeProfile(node, profileId) {
      if (!node?.dataset) return;
      node.dataset.axisProfile = sanitizeProfileId(profileId ?? this.profileId);
    },

    _parkSidebarTabDom(profileId) {
      const pool = this.getProfileDomPool(profileId);
      const pid = sanitizeProfileId(profileId);
      const container = document.getElementById('tabs-container');
      if (!container) return;
      const nodes = [];
      for (const child of container.children) {
        if (!child.classList?.contains('tab') && !child.classList?.contains('tab-group')) continue;
        // Hidden favorite hosts are recreated per profile — do not carry across pools.
        if (child.classList?.contains('tab-favorite-host')) {
          try {
            child.remove();
          } catch (_) {}
          continue;
        }
        this._stampSidebarNodeProfile(child, pid);
        if (child.classList?.contains('tab-group')) {
          child.querySelectorAll('.tab').forEach((tabEl) => this._stampSidebarNodeProfile(tabEl, pid));
        }
        nodes.push(child);
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

    /** Full pane width — coupled slide travels exactly this so the neighbor lands centered. */
    _stageWidthPx() {
      const stage = this._sidebarProfileStage || document.getElementById('sidebar-profile-swipe-stage');
      return stage?.clientWidth || 0;
    },

    _track() {
      return this._sidebarProfileTrack || document.getElementById('sidebar-profile-swipe-track');
    },

    _coupledRestOffset(direction = this._coupledDirection || 1) {
      const W = this._stageWidthPx();
      return direction > 0 ? 0 : -W;
    },

    _coupledFullOffset(direction = this._coupledDirection || 1) {
      const W = this._stageWidthPx();
      return direction > 0 ? -W : 0;
    },

    /** 0–1 slide progress from the live track offset (matches what is on screen). */
    _profileSwipeProgressFromOffset(offsetPx, direction = this._coupledDirection || 1) {
      const W = this._stageWidthPx();
      if (W <= 0) return 0;
      const rest = this._coupledRestOffset(direction);
      const full = this._coupledFullOffset(direction);
      const span = Math.abs(full - rest);
      if (span <= 0) return 0;
      const travel = Math.abs(offsetPx - rest);
      return Math.max(0, Math.min(1, travel / span));
    },

    _orderedSwipeProfileIds() {
      return (this.profiles || [])
        .map((p) => sanitizeProfileId(p.id))
        .filter((id) => id && id !== 'incognito');
    },

    _adjacentProfileIdFrom(profileId, direction) {
      const ids = this._orderedSwipeProfileIds();
      const idx = ids.indexOf(sanitizeProfileId(profileId));
      if (idx < 0) return null;
      return ids[idx + (direction > 0 ? 1 : -1)] || null;
    },

    _wheelStepNaturalPx() {
      const W = this._stageWidthPx() || 1;
      return W / DRAG_TRACK_RATIO;
    },

    _wheelNaturalPx(accumX, direction) {
      return direction > 0 ? accumX : -accumX;
    },

    _wheelSignedAccum(naturalPx, direction) {
      return direction > 0 ? naturalPx : -naturalPx;
    },

    _clearPendingWheelResume() {
      this._pendingWheelResume = null;
    },

    _stashPendingWheelResume(direction, deltaX, velocity = 0) {
      const dir = direction > 0 ? 1 : -1;
      const px = Math.abs(deltaX);
      if (!Number.isFinite(px) || px <= 0) return;
      const pending = this._pendingWheelResume;
      if (!pending || pending.direction !== dir) {
        this._pendingWheelResume = {
          direction: dir,
          accumX: this._wheelSignedAccum(px, dir),
          vel: Math.max(0, velocity)
        };
      } else {
        pending.accumX += this._wheelSignedAccum(px, dir);
        pending.vel = Math.max(pending.vel || 0, velocity || 0);
      }
    },

    async _resumePendingWheelIfAny() {
      const pending = this._pendingWheelResume;
      if (!pending || this._profileSwipeLock || this._profileSwipeFinalizing || this.isIncognitoWindow) {
        return false;
      }
      this._clearPendingWheelResume();

      const direction = pending.direction > 0 ? 1 : -1;
      const natural = this._wheelNaturalPx(pending.accumX, direction);
      if (natural <= WHEEL_ENGAGE_PX) return false;

      const targetId = this._adjacentProfileIdFrom(this.profileId, direction);
      if (!targetId) return false;

      this._wheelSwipe = {
        direction,
        targetId,
        accumX: pending.accumX,
        engaged: true,
        vel: pending.vel || 0,
        lastTs: performance.now(),
        endTimer: null,
        stepsCompleted: 0,
        stepping: false
      };

      this._cancelSidebarSlideAnimation();
      this._beginCoupledTransition(direction, targetId);
      const offset = this._coupledOffsetFor(-pending.accumX, direction, true, targetId);
      this._setTrackTransform(offset);

      const finishWheel = this._profileWheelFinishHandler;
      if (typeof finishWheel === 'function') {
        this._wheelSwipe.endTimer = setTimeout(finishWheel, WHEEL_END_MS);
      }
      return true;
    },

    async _advanceProfileGestureStep(gesture) {
      /* One profile per gesture — never chain switches while the finger or trackpad is still moving. */
      return false;
    },

    async _wheelAdvanceStep(ws) {
      ws.scheduleFinish = true;
      ws.getNatural = () => this._wheelNaturalPx(ws.accumX, ws.direction);
      return this._advanceProfileGestureStep(ws);
    },

    _cancelTrackMotion() {
      if (this._trackSpringRaf) {
        cancelAnimationFrame(this._trackSpringRaf);
        this._trackSpringRaf = null;
      }
      this._trackAnim = null;
    },

    _releaseSlideDuration(remainingPx, releaseVelocity = 0, { snap = false } = {}) {
      const W = this._stageWidthPx() || 320;
      const frac = Math.min(1, Math.max(0, remainingPx) / W);
      if (snap) {
        return Math.round(RELEASE_SNAP_MS * (0.55 + frac * 0.45));
      }
      let duration = Math.round(RELEASE_COMMIT_MS + frac * (RELEASE_COMMIT_MAX_MS - RELEASE_COMMIT_MS));
      const vel = Math.max(0, releaseVelocity);
      if (vel >= FLICK_VELOCITY * 0.65) {
        duration = Math.max(RELEASE_COMMIT_MS, Math.round(duration * 0.72));
      }
      return duration;
    },

    _applyTrackTransform(px) {
      const track = this._track();
      if (!track) return;
      const rounded = Math.round(px);
      this._trackOffsetPx = rounded;
      track.style.transition = 'none';
      track.style.transform = `translate3d(${rounded}px, 0, 0)`;
      if (this._profileSwipeThemeActive && this._swipeShellTargetId) {
        this._syncProfileSwipeShellThemeForOffset(rounded);
      }
    },

    /** Drop GPU swipe layers so sidebar tabs repaint at full resolution. */
    _resetProfileSwipeCompositorLayers() {
      if (this._trackTransformRaf) {
        cancelAnimationFrame(this._trackTransformRaf);
        this._trackTransformRaf = null;
      }
      this._pendingTrackPx = null;
      this._cancelTrackMotion();

      document.getElementById('sidebar')?.classList.remove('is-profile-swiping');
      this._destroyProfilePreviewPane();

      const stage = this._sidebarProfileStage || document.getElementById('sidebar-profile-swipe-stage');
      stage?.classList.remove('axis-sidebar-drag-active');

      const track = this._track();
      if (track) {
        track.classList.remove('axis-sidebar-coupled', 'axis-sidebar-coupled-duo', 'axis-track-animating');
        track.style.removeProperty('transform');
        track.style.removeProperty('-webkit-transform');
        track.style.removeProperty('transition');
        track.style.removeProperty('will-change');
      }

      const pane = this._slidePane();
      if (pane) {
        if (pane._axisSlideAnim) {
          try {
            pane._axisSlideAnim.cancel();
          } catch (_) {}
          pane._axisSlideAnim = null;
        }
        pane.classList.remove('axis-sidebar-dragging', 'axis-sidebar-animating', 'axis-sidebar-snap-back');
        pane.style.removeProperty('transform');
        pane.style.removeProperty('-webkit-transform');
        pane.style.removeProperty('transition');
        pane.style.removeProperty('will-change');
      }

      this._trackOffsetPx = 0;

      const liveTabs =
        document.querySelector('#sidebar-profile-swipe-track .sidebar-profile-pane--live .tabs-container') ||
        document.getElementById('tabs-container');
      if (liveTabs) void liveTabs.offsetHeight;
    },

    _flushTrackTransform() {
      if (this._pendingTrackPx == null) return;
      this._setTrackTransform(this._pendingTrackPx, { immediate: true });
    },

    _scheduleTrackTransform(px) {
      this._pendingTrackPx = px;
      if (this._trackTransformRaf) return;
      this._trackTransformRaf = requestAnimationFrame(() => {
        this._trackTransformRaf = null;
        if (this._pendingTrackPx == null) return;
        const next = this._pendingTrackPx;
        this._pendingTrackPx = null;
        this._applyTrackTransform(next);
      });
    },

    _setTrackTransform(px, { immediate = false } = {}) {
      if (immediate) {
        if (this._trackTransformRaf) {
          cancelAnimationFrame(this._trackTransformRaf);
          this._trackTransformRaf = null;
        }
        this._pendingTrackPx = null;
        this._applyTrackTransform(px);
        return;
      }
      this._scheduleTrackTransform(px);
    },

    _pushSwipeVelocitySample(state, inst) {
      if (!state) return;
      if (!state.velSamples) state.velSamples = [];
      state.velSamples.push(Math.max(0, inst));
      if (state.velSamples.length > 5) state.velSamples.shift();
      const sum = state.velSamples.reduce((a, b) => a + b, 0);
      state.vel = sum / state.velSamples.length;
    },

    _settingsForProfile(profileId) {
      const pid = sanitizeProfileId(profileId);
      const runtime = this._profileRuntime?.get(pid);
      if (runtime?.settings) return runtime.settings;
      const boot = this._profileBootstrapCache?.get(pid);
      if (boot?.settings) return boot.settings;
      if (pid === sanitizeProfileId(this.profileId) && this.settings) return this.settings;
      return null;
    },

    _shellSnapshotForProfile(profileId) {
      const settings = this._settingsForProfile(profileId);
      const fromSettings = this._shellChromeSnapshotFromSettings?.(settings);
      if (fromSettings?.colors) return fromSettings;
      if (sanitizeProfileId(profileId) === sanitizeProfileId(this.profileId)) {
        return this._captureShellChromeSnapshot?.() || null;
      }
      return null;
    },

    _hexChannel(value) {
      const n = Math.max(0, Math.min(255, Math.round(value)));
      return n.toString(16).padStart(2, '0');
    },

    _parseHexColor(hex) {
      if (!hex || typeof hex !== 'string') return null;
      const raw = hex.trim().replace('#', '');
      if (raw.length === 3) {
        return {
          r: parseInt(raw[0] + raw[0], 16),
          g: parseInt(raw[1] + raw[1], 16),
          b: parseInt(raw[2] + raw[2], 16)
        };
      }
      if (raw.length !== 6) return null;
      return {
        r: parseInt(raw.slice(0, 2), 16),
        g: parseInt(raw.slice(2, 4), 16),
        b: parseInt(raw.slice(4, 6), 16)
      };
    },

    _lerpHexColor(a, b, t) {
      const from = this._parseHexColor(a);
      const to = this._parseHexColor(b);
      if (!from || !to) return t >= 0.5 ? b || a : a || b;
      const mix = (x, y) => x + (y - x) * t;
      return `#${this._hexChannel(mix(from.r, to.r))}${this._hexChannel(mix(from.g, to.g))}${this._hexChannel(mix(from.b, to.b))}`;
    },

    _themePackForProfile(profileId) {
      const pid = sanitizeProfileId(profileId);
      if (this._profileSwipeThemePackCache?.has(pid)) {
        return this._profileSwipeThemePackCache.get(pid);
      }
      const settings = this._settingsForProfile(profileId);
      const pack = settings ? this.resolveProfileSwipeThemePack?.(settings) : null;
      if (pack) this._profileSwipeThemePackCache.set(pid, pack);
      return pack;
    },

    _invalidateProfileSwipeThemePack(profileId) {
      const pid = sanitizeProfileId(profileId);
      this._profileSwipeThemePackCache?.delete(pid);
    },

    _clearProfileSwipeShellThemeState(restoreCurrent = true) {
      this._swipeShellFromPack = null;
      this._swipeShellToPack = null;
      this._swipeShellTargetId = null;
      this._swipeShellLastProgress = -1;
      this._swipeShellThemeProgressPeak = 0;
      this._swipeShellToPackNeedsRefresh = false;
      this._profileSwipeThemeActive = false;
      if (this._trackTransformRaf) {
        cancelAnimationFrame(this._trackTransformRaf);
        this._trackTransformRaf = null;
      }
      this._pendingTrackPx = null;
      if (this._swipeShellThemeRaf) {
        cancelAnimationFrame(this._swipeShellThemeRaf);
        this._swipeShellThemeRaf = null;
      }
      this.tearDownProfileSwipeThemeOverlay?.();
      if (!restoreCurrent && document.body?.classList.contains('theme-switching')) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (!this._profileSwipeThemeActive) {
              document.body.classList.remove('theme-switching');
            }
          });
        });
      }
      if (!restoreCurrent) return;
      if (this.settings?.themeColor || this.settings?.gradientColor) {
        this.applyCustomThemeFromSettings?.();
      } else {
        this.resetToBlackTheme?.();
      }
    },

    _armProfileSwipeShellTheme(targetId) {
      const pid = sanitizeProfileId(targetId);
      if (!pid) {
        this._clearProfileSwipeShellThemeState();
        return;
      }
      this._profileSwipeThemeActive = true;
      this._swipeShellTargetId = pid;
      this._swipeShellThemeProgressPeak = 0;
      this._swipeShellFromPack = this._themePackForProfile(this.profileId);
      this._swipeShellToPack = this._themePackForProfile(pid);
      this._swipeShellLastProgress = -1;
      this._swipeShellToPackNeedsRefresh = false;
      this.armProfileSwipeThemeCrossfade?.(this._swipeShellFromPack, this._swipeShellToPack);
      document.body?.classList.add('theme-switching');
    },

    _syncProfileSwipeShellThemeForOffset(offsetPx) {
      const targetId = this._swipeShellTargetId;
      const direction = this._coupledDirection;
      if (!targetId || !direction || !this._profileSwipeThemeActive) return;

      const progress = this._profileSwipeProgressFromOffset(offsetPx, direction);
      if (progress <= 0) return;

      if (!this._swipeShellFromPack || !this._swipeShellToPack) {
        this._armProfileSwipeShellTheme(targetId);
      }
      if (!this._swipeShellFromPack || !this._swipeShellToPack) return;

      this.setProfileSwipeThemeMix?.(progress, this._swipeShellFromPack, this._swipeShellToPack);
      this._swipeShellLastProgress = progress;
    },

    _resolveShellSnapshotForProfileState(cached) {
      const pid = sanitizeProfileId(cached?.profileId || this.profileId);
      if (cached?.shellChromeSnapshot?.colors) return cached.shellChromeSnapshot;
      return this._shellSnapshotForProfile(pid);
    },

    _startProfileReleaseSpring(direction, releaseVelocity = 0) {
      const fullOffset = this._coupledFullOffset(direction);
      const current = this._trackOffsetPx || 0;
      const remaining = Math.abs(fullOffset - current);
      if (remaining < 1.5) {
        this._setTrackTransform(fullOffset, { immediate: true });
        return Promise.resolve();
      }
      const duration = this._releaseSlideDuration(remaining, releaseVelocity);
      return this._animateTrackTo(fullOffset, duration, 'commit');
    },

    _revealProfileSwitchSidebar() {
      this._refreshBuiltInTabFavicons?.();
      document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
      const liveTabs =
        document.querySelector('#sidebar-profile-swipe-track .sidebar-profile-pane--live .tabs-container') ||
        document.getElementById('tabs-container');
      if (liveTabs) void liveTabs.offsetHeight;
    },

    _animateTrackTo(toPx, duration, mode = 'commit') {
      const track = this._track();
      if (!track) return Promise.resolve();
      const fromPx = this._trackOffsetPx || 0;
      const remaining = Math.abs(toPx - fromPx);
      if (!track || prefersReducedMotion() || duration <= 0 || remaining < 0.5) {
        this._setTrackTransform(toPx, { immediate: true });
        return Promise.resolve();
      }
      this._cancelTrackMotion();
      track.classList.add('axis-track-animating');
      const easeFn = mode === 'snap' ? easeOutCubic : easeCommitFinish;
      const start = performance.now();
      return new Promise((resolve) => {
        const tick = (now) => {
          const elapsed = now - start;
          const raw = Math.min(1, elapsed / duration);
          const eased = easeFn(raw);
          const px = fromPx + (toPx - fromPx) * eased;
          this._setTrackTransform(px, { immediate: true });
          if (raw < 1) {
            this._trackSpringRaf = requestAnimationFrame(tick);
            return;
          }
          this._trackSpringRaf = null;
          if (this._trackAnim === animToken) this._trackAnim = null;
          this._setTrackTransform(toPx, { immediate: true });
          track.classList.remove('axis-track-animating');
          resolve();
        };
        const animToken = {};
        this._trackAnim = animToken;
        this._trackSpringRaf = requestAnimationFrame(tick);
      });
    },

    _releaseProfileSwipeUi() {
      this._profileSwipeLock = false;
    },

    _sidebarPreviewTabEligible(tab) {
      if (!tab) return false;
      if (tab.isFavoriteTab || tab.hiddenInSidebar) return false;
      return true;
    },

    /** Snapshot tab/group/favorite payloads while the outgoing profile is still active. */
    _captureOutgoingPersistPayload() {
      if (this.isIncognitoWindow) return null;
      try {
        const favoritesPayload = (Array.isArray(this.favorites) ? this.favorites : [])
          .map((fav, order) => ({
            id: fav.id || `fav-${Date.now()}-${order}`,
            url: this.normalizeFavoriteUrl?.(fav.url) || fav.url,
            title: String(fav.title || 'Favorite').trim() || 'Favorite',
            favicon: fav.favicon || null,
            customIcon: fav.customIcon || null,
            customIconType: fav.customIconType || null,
            order
          }))
          .filter((fav) => !!fav.url);
        const sessionPayload = this.flushSessionStatePayload?.('profile-switch');
        const tabGroupsRaw = this._buildTabGroupsSavePayload?.() || [];
        const tabGroups = this.filterTabGroupsForUnpinnedPolicy?.(
          tabGroupsRaw,
          'profile-switch'
        ) || tabGroupsRaw;
        const pinnedTabs = this._collectPinnedTabsPayload?.() || [];
        const unpinnedTabs = this._shouldPersistUnpinnedItems?.('profile-switch')
            ? this._collectUnpinnedTabsPayload?.({ context: 'profile-switch' }) || []
            : [];
        if (sessionPayload && !sessionPayload.incognito) {
          sessionPayload.tabGroups = tabGroups;
          sessionPayload.pinnedTabs = pinnedTabs;
          sessionPayload.unpinnedTabs = unpinnedTabs;
        }
        return {
          sessionPayload,
          pinnedTabs,
          tabGroups,
          unpinnedTabs,
          favoritesPayload
        };
      } catch (e) {
        console.error('capture outgoing profile payload', e);
        return null;
      }
    },

    /** Prefer runtime snapshot for persist — avoids live DOM clears mid-swipe. */
    _captureOutgoingPersistPayloadForSwitch(outgoingId) {
      const pid = sanitizeProfileId(outgoingId || this.profileId);
      const state = this._profileRuntime?.get(pid);
      if (state) {
        const fromSnapshot = this._persistPayloadFromRuntimeState(state);
        if (fromSnapshot && this._persistPayloadLooksValid?.(fromSnapshot, state)) {
          return fromSnapshot;
        }
      }
      const live = this._captureOutgoingPersistPayload();
      if (live && state && this._persistPayloadLooksValid?.(live, state)) {
        return live;
      }
      if (state) {
        return this._persistPayloadFromRuntimeState(state);
      }
      return live;
    },

    /** Write the outgoing profile using captured payloads (always targets the explicit profile store). */
    async _persistOutgoingProfile(outgoingProfileId, captured) {
      if (this.isIncognitoWindow || !captured) return;
      const pid = sanitizeProfileId(outgoingProfileId);
      const run = (async () => {
        try {
          this._profileBootstrapCache?.delete(pid);
          const payload = {
            sessionPayload: captured.sessionPayload,
            pinnedTabs: captured.pinnedTabs,
            tabGroups: captured.tabGroups,
            unpinnedTabs: captured.unpinnedTabs,
            favoritesPayload: Array.isArray(captured.favoritesPayload) ? captured.favoritesPayload : []
          };
          if (window.electronAPI?.persistOutgoingProfile) {
            const result = await window.electronAPI.persistOutgoingProfile(pid, payload);
            if (result && result.ok === false) {
              console.error('persist outgoing profile refused:', result.error);
            }
            return;
          }
          console.error('persistOutgoingProfile IPC unavailable — outgoing profile not saved');
        } catch (e) {
          console.error('persist outgoing profile', e);
        }
      })();
      this._profilePersistInflight?.set(pid, run);
      try {
        await run;
      } finally {
        if (this._profilePersistInflight?.get(pid) === run) {
          this._profilePersistInflight.delete(pid);
        }
      }
    },

    async _persistOutgoingAndSwitchMain(incomingId, outgoingId, captured) {
      await this._persistOutgoingProfile(outgoingId, captured);
      await window.electronAPI?.switchProfileInWindow?.(incomingId);
    },

    _rubber(x, cap) {
      const c = Math.max(1, cap);
      return c * Math.tanh(Math.max(0, x) / c);
    },

    /** List-end rubber-band — progressive resistance, more give than a wall but heavier than a normal swipe. */
    _rubberEdge(natural, W) {
      const cap = W * EDGE_BOUNDARY_GIVE_RATIO;
      const x = Math.max(0, natural);
      const ref = Math.max(W, 1);
      return cap * (x / (x + EDGE_BOUNDARY_STIFFNESS * ref));
    },

    /** True when the active profile has no neighbor in the swipe direction (first/last in list). */
    _isProfileListEdge(direction) {
      return !this._adjacentProfileIdFrom(this.profileId, direction);
    },

    /** True when there is no profile beyond the preview target (overscroll at list end). */
    _isBeyondSwipeTarget(direction, swipeTargetId) {
      if (!swipeTargetId) return false;
      return !this._adjacentProfileIdFrom(swipeTargetId, direction);
    },

    /** Map raw pointer dx to track offset — linear follow between profiles; rubber only at list ends. */
    _coupledOffsetFor(rawPointerDx, direction, hasNeighbor, swipeTargetId = null) {
      const W = this._stageWidthPx() || 1;
      const natural = direction > 0 ? -rawPointerDx : rawPointerDx;
      const rest = hasNeighbor ? this._coupledRestOffset(direction) : 0;
      const atListEdge = this._isProfileListEdge(direction);
      let prog;

      if (natural <= 0) {
        prog = -this._rubber(-natural, W * EDGE_GIVE_RATIO);
      } else if (atListEdge) {
        /* First or last profile — resistance only here, not at the pane midpoint. */
        prog = this._rubberEdge(natural, W);
      } else if (hasNeighbor) {
        /* Middle profiles — 1:1 locked follow, hard stop at one pane width. */
        const mapped = natural * DRAG_TRACK_RATIO;
        prog = Math.min(W, mapped);
        if (mapped > W && swipeTargetId && this._isBeyondSwipeTarget(direction, swipeTargetId)) {
          prog = W + this._rubberEdge(mapped - W, W);
        }
      } else {
        prog = Math.min(W, natural * DRAG_TRACK_RATIO);
      }
      return direction > 0 ? rest - prog : rest + prog;
    },

    _escapePreviewText(text) {
      if (typeof this.escapeHtml === 'function') return this.escapeHtml(text);
      const div = document.createElement('div');
      div.textContent = text == null ? '' : String(text);
      return div.innerHTML;
    },

    _staticPreviewTabIconHtml(tabData) {
      if (typeof this.tabFaviconIconHtml === 'function') {
        return this.tabFaviconIconHtml(tabData);
      }
      if (tabData?.customIcon) {
        if (tabData.customIconType === 'emoji') {
          return `<span class="tab-favicon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;">${this._escapePreviewText(tabData.customIcon)}</span>`;
        }
        return `<i class="fas ${this._escapePreviewText(tabData.customIcon)} tab-favicon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,0.7);"></i>`;
      }
      const favicon = tabData?.favicon ? this._escapePreviewText(tabData.favicon) : '';
      if (favicon) {
        return `<img class="tab-favicon" src="${favicon}" alt="" draggable="false" onerror="this.style.visibility='hidden'">`;
      }
      return '<img class="tab-favicon" src="" alt="" draggable="false" onerror="this.style.visibility=\'hidden\'">';
    },

    _previewPinnedTabIsClosed(tabData) {
      if (!tabData) return false;
      if (tabData.closed === true) return true;
      if (tabData.closed === false) return false;
      return !tabData.webview;
    },

    _createStaticPreviewTabEl(tabData, { pinned = false } = {}) {
      const tabElement = document.createElement('div');
      tabElement.className = 'tab' + (pinned ? ' pinned' : '');
      if (pinned && this._previewPinnedTabIsClosed(tabData)) {
        tabElement.classList.add('closed');
      }
      const displayTitle =
        tabData?.customTitle || tabData?.title || tabData?.name || 'New Tab';
      tabElement.innerHTML = `
        <div class="tab-content">
          <div class="tab-left">
            ${this._staticPreviewTabIconHtml(tabData)}
            <span class="tab-audio-indicator" style="display:none;"><i class="fas fa-volume-up"></i></span>
            <span class="tab-title">${this._escapePreviewText(displayTitle)}</span>
          </div>
          <div class="tab-right"><button class="tab-close" tabindex="-1"><i class="fas fa-times"></i></button></div>
        </div>
      `;
      return tabElement;
    },

    _createStaticPreviewGroupEl(groupData) {
      const tabGroupElement = document.createElement('div');
      tabGroupElement.className = 'tab-group';
      if (groupData?.pinned !== false) tabGroupElement.classList.add('pinned');
      const color = groupData?.color || '#FF6B6B';
      const rgb = typeof this.hexToRgb === 'function' ? this.hexToRgb(color) : null;
      if (rgb) tabGroupElement.style.setProperty('--tab-group-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
      tabGroupElement.style.setProperty('--tab-group-color', color);
      tabGroupElement.dataset.color = color;
      if (groupData?.id != null) tabGroupElement.dataset.tabGroupId = String(groupData.id);
      const iconHtml =
        groupData?.iconType === 'emoji'
          ? `<span class="tab-favicon tab-group-icon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">${this._escapePreviewText(groupData.icon || '📁')}</span>`
          : `<i class="fas ${this._escapePreviewText(groupData.icon || 'fa-layer-group')} tab-favicon tab-group-icon"></i>`;
      tabGroupElement.innerHTML = `
        <div class="tab-content">
          <div class="tab-left">
            ${iconHtml}
            <span class="tab-title">${this._escapePreviewText(groupData?.name || 'Tab Group')}</span>
          </div>
          <div class="tab-right">
            <button class="tab-group-delete tab-close" tabindex="-1"><i class="fas fa-times"></i></button>
          </div>
        </div>
        <div class="tab-group-content"></div>
      `;
      const content = tabGroupElement.querySelector('.tab-group-content');
      const savedTabs = Array.isArray(groupData?.tabs) ? groupData.tabs : [];
      const tabIds = Array.isArray(groupData?.tabIds) ? groupData.tabIds : [];
      const tabById = new Map();
      for (const t of savedTabs) {
        if (t?.id != null) tabById.set(String(t.id), t);
      }
      const ordered = tabIds.length
        ? tabIds.map((id) => tabById.get(String(id)) || { id, title: 'New Tab' })
        : savedTabs;
      for (const tabData of ordered) {
        if (!tabData) continue;
        content.appendChild(
          this._createStaticPreviewTabEl(tabData, { pinned: groupData?.pinned !== false })
        );
      }
      const tabCount = ordered.length;
      const isOpen = groupData?.open !== false && tabCount > 0;
      content.classList.toggle('open', isOpen);
      content.style.display = 'flex';
      content.style.maxHeight = isOpen ? '9999px' : '0';
      content.style.opacity = isOpen ? '1' : '0';
      return tabGroupElement;
    },

    _createStaticFavoriteItem(favorite) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'favorite-item';
      item.setAttribute('tabindex', '-1');
      item.setAttribute('role', 'listitem');
      const iconHtml =
        typeof this.getFavoriteIconHtml === 'function'
          ? this.getFavoriteIconHtml(favorite)
          : `<span class="favorite-favicon favorite-favicon-fallback">${this._escapePreviewText(
              (favorite?.title || '•').charAt(0).toUpperCase()
            )}</span>`;
      item.innerHTML = `<span class="favorite-icon-wrap">${iconHtml}</span>`;
      return item;
    },

    /** Clone separator + New Tab for profile swipe preview; visibility matches target profile pinned rows. */
    _appendPreviewSidebarChrome(container, hasPinnedAbove = false) {
      const liveSep = document.getElementById('tabs-separator');
      let sep;
      if (liveSep) {
        sep = liveSep.cloneNode(true);
        sep.removeAttribute('id');
        sep.classList.remove('drag-active', 'drag-over-pinned', 'drag-over-unpinned');
      } else {
        sep = document.createElement('div');
        sep.className = 'tabs-separator';
      }
      sep.style.display = hasPinnedAbove ? 'block' : 'none';
      container.appendChild(sep);
      const liveNewTab = document.getElementById('sidebar-new-tab-btn');
      if (liveNewTab) {
        const btn = liveNewTab.cloneNode(true);
        btn.removeAttribute('id');
        btn.setAttribute('tabindex', '-1');
        container.appendChild(btn);
      }
    },

    /** Normalize runtime/bootstrap into a single ordered shape so previews always match the sidebar. */
    _collectPreviewData(profileId) {
      const pid = sanitizeProfileId(profileId);
      const groupHasTabs = (g) =>
        (Array.isArray(g.tabIds) && g.tabIds.length > 0) ||
        (Array.isArray(g.tabs) && g.tabs.length > 0);

      const runtime = this._profileRuntime?.get(pid);
      if (runtime?.tabs) {
        const tabs = runtime.tabs;
        const tabGroups = runtime.tabGroups || new Map();
        const loosePinned = [];
        const looseUnpinned = [];
        for (const [, t] of tabs) {
          if (!t || t.tabGroupId || !this._sidebarPreviewTabEligible(t)) continue;
          (t.pinned ? loosePinned : looseUnpinned).push(t);
        }
        const groupToItem = (g) => {
          const groupTabs = (g.tabIds || [])
            .map((id) => tabs.get(id))
            .filter((t) => this._sidebarPreviewTabEligible(t))
            .map((t) => ({ ...t }));
          return { kind: 'group', data: { ...g, tabs: groupTabs, tabIds: g.tabIds || [] } };
        };
        const pinnedGroups = Array.from(tabGroups.values())
          .filter((g) => g.pinned !== false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const unpinnedGroups = Array.from(tabGroups.values())
          .filter((g) => g.pinned === false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return {
          ready: true,
          favorites: Array.isArray(runtime.favorites) ? runtime.favorites : [],
          pinned: [
            ...loosePinned.map((t) => ({ kind: 'tab', data: t })),
            ...pinnedGroups.filter((g) => groupHasTabs(g) || !g.hadTabs).map(groupToItem)
          ],
          unpinned: [
            ...unpinnedGroups.filter((g) => groupHasTabs(g) || !g.hadTabs).map(groupToItem),
            ...looseUnpinned.map((t) => ({ kind: 'tab', data: t }))
          ]
        };
      }

      const boot = this._profileBootstrapCache?.get(pid);
      if (boot) {
        const pinnedTabs = Array.isArray(boot.pinnedTabs)
          ? [...boot.pinnedTabs].sort((a, b) => (a.order || 0) - (b.order || 0))
          : [];
        const tabGroups = Array.isArray(boot.tabGroups) ? [...boot.tabGroups] : [];
        const unpinnedTabs = Array.isArray(boot.unpinnedTabs)
          ? [...boot.unpinnedTabs].sort((a, b) => (a.order || 0) - (b.order || 0))
          : [];
        const pinnedGroups = tabGroups
          .filter((g) => g.pinned !== false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        const unpinnedGroups = tabGroups
          .filter((g) => g.pinned === false)
          .sort((a, b) => (a.order || 0) - (b.order || 0));
        return {
          ready: true,
          favorites: Array.isArray(boot.favorites) ? boot.favorites : [],
          pinned: [
            ...pinnedTabs.map((t) => ({ kind: 'tab', data: t })),
            ...pinnedGroups
              .filter((g) => groupHasTabs(g) || !g.hadTabs)
              .map((g) => ({ kind: 'group', data: g }))
          ],
          unpinned: [
            ...unpinnedGroups
              .filter((g) => groupHasTabs(g) || !g.hadTabs)
              .map((g) => ({ kind: 'group', data: g })),
            ...unpinnedTabs.map((t) => ({ kind: 'tab', data: t }))
          ]
        };
      }

      return { ready: false, favorites: [], pinned: [], unpinned: [] };
    },

    /** Build a faithful, non-interactive `.tabs-section` for the given profile. */
    _buildPreviewSection(profileId) {
      const pid = sanitizeProfileId(profileId);
      const data = this._collectPreviewData(pid);

      const section = document.createElement('div');
      section.className = 'sidebar-section tabs-section';
      section.dataset.profilePreviewFor = pid;

      const favSection = document.createElement('section');
      favSection.className = 'favorites-section';
      favSection.setAttribute('aria-label', 'Favorites');
      const favGrid = document.createElement('div');
      favGrid.className = 'favorites-grid';
      favGrid.setAttribute('role', 'list');
      const favs = (data.favorites || [])
        .slice()
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      for (const fav of favs) {
        if (!fav) continue;
        favGrid.appendChild(this._createStaticFavoriteItem(fav));
      }
      favSection.appendChild(favGrid);
      favSection.classList.toggle('hidden', favs.length === 0);
      section.appendChild(favSection);

      const container = document.createElement('div');
      container.className = 'tabs-container vertical';

      const appendItem = (item) => {
        if (!item) return;
        if (item.kind === 'group') {
          container.appendChild(this._createStaticPreviewGroupEl(item.data));
        } else {
          container.appendChild(
            this._createStaticPreviewTabEl(item.data, { pinned: !!item.data?.pinned })
          );
        }
      };

      for (const item of data.pinned) appendItem(item);
      this._appendPreviewSidebarChrome(container, data.pinned.length > 0);
      for (const item of data.unpinned) appendItem(item);

      section.appendChild(container);
      return { section, ready: data.ready };
    },

    async _hydratePreviewPane(profileId) {
      const pid = sanitizeProfileId(profileId);
      try {
        const boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        if (boot?.settings) this._profileBootstrapCache?.set(pid, boot);
      } catch (_) {
        return;
      }
      const preview = this._profilePreviewEl;
      if (!preview?.isConnected || preview.dataset.previewFor !== pid) return;
      const old = preview.querySelector('.tabs-section');
      const { section } = this._buildPreviewSection(pid);
      if (old) preview.replaceChild(section, old);
      else preview.appendChild(section);
    },

    /** Build neighbor pane for the horizontal carousel (sits flush beside the live pane). */
    _buildProfilePreviewPane(direction, targetId) {
      this._destroyProfilePreviewPane();
      const track = this._track();
      const live = this._slidePane();
      if (!track || !live || !targetId) return false;
      const pid = sanitizeProfileId(targetId);

      const preview = document.createElement('div');
      preview.className = 'sidebar-profile-pane sidebar-profile-pane--preview';
      preview.setAttribute('aria-hidden', 'true');
      preview.dataset.previewFor = pid;

      const { section, ready } = this._buildPreviewSection(pid);
      preview.appendChild(section);

      if (direction > 0) track.appendChild(preview);
      else track.insertBefore(preview, live);

      track.classList.add('axis-sidebar-coupled', 'axis-sidebar-coupled-duo');
      this._profilePreviewEl = preview;
      this._coupledDirection = direction;

      if (!ready) void this._hydratePreviewPane(pid);
      return true;
    },

    _destroyProfilePreviewPane() {
      if (this._profilePreviewEl) {
        try {
          this._profilePreviewEl.remove();
        } catch (_) {}
        this._profilePreviewEl = null;
      }
      this._track()
        ?.querySelectorAll('.sidebar-profile-pane--preview')
        .forEach((el) => el.remove());
      this._track()?.classList.remove('axis-sidebar-coupled-duo');
      this._coupledDirection = 0;
    },

    /** Arm the coupled slide: stage ready, neighbor preview built, drag classes on. */
    _beginCoupledTransition(direction, targetId) {
      this._ensureSidebarProfileStage();
      this._pinSidebarFooterOutsideStage();
      this._pinSidebarTopbarOutsideStage();
      const track = this._track();
      if (!track) return false;
      this._cancelTrackMotion();
      this._coupledDirection = direction;
      const hasNeighbor = targetId ? this._buildProfilePreviewPane(direction, targetId) : false;
      if (targetId) {
        void this._prefetchProfileBootstrap?.(sanitizeProfileId(targetId));
        void this._warmProfileSwipeTarget?.(targetId);
        this._armProfileSwipeShellTheme(targetId);
      } else {
        this._clearProfileSwipeShellThemeState();
      }
      document.getElementById('sidebar')?.classList.add('is-profile-swiping');
      this._refreshBuiltInTabFavicons?.();
      this._sidebarProfileStage?.classList.add('axis-sidebar-drag-active');
      if (!hasNeighbor) track.classList.add('axis-sidebar-coupled');
      const rest = hasNeighbor ? this._coupledRestOffset(direction) : this._trackOffsetPx || 0;
      this._setTrackTransform(rest, { immediate: true });
      return hasNeighbor;
    },

    async _resetCoupledTransition(animate = true) {
      const track = this._track();
      const from = this._trackOffsetPx || 0;
      const direction = this._coupledDirection || 1;
      const coupled = track?.classList.contains('axis-sidebar-coupled-duo');
      const target = coupled ? this._coupledRestOffset(direction) : 0;
      if (animate && Math.abs(from - target) > 0.5) {
        const duration = this._releaseSlideDuration(Math.abs(from - target), 0, { snap: true });
        await this._animateTrackTo(target, duration, 'snap');
      } else {
        this._setTrackTransform(target, { immediate: true });
      }
      this._clearProfileSwipeShellThemeState(true);
      this._resetProfileSwipeCompositorLayers();
    },

    /** Snap track + preview to neutral after the real DOM swap (single-frame, no flash). */
    _finalizeCoupledTransition() {
      if (this._swipeShellToPack && this._profileSwipeThemeActive) {
        this.setProfileSwipeThemeMix?.(1, this._swipeShellFromPack, this._swipeShellToPack);
      }
      this._clearProfileSwipeShellThemeState();
      this._resetProfileSwipeCompositorLayers();
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

    _beginProfileSidebarTabSettle() {
      document.getElementById('sidebar')?.classList.add('axis-sidebar-profile-switching');
    },

    _clearProfileSidebarTabDragVisuals(root) {
      const clearEl = (el) => {
        if (!el?.style) return;
        el.classList?.remove('smooth-dragging', 'drag-sliding', 'dragging');
        el.style.removeProperty('transform');
        el.style.removeProperty('transition');
        el.style.opacity = '';
        el.style.pointerEvents = '';
      };
      const container = root || document.getElementById('tabs-container');
      if (!container) return;
      container.querySelectorAll('.tab, .tab-group').forEach(clearEl);
      clearEl(this.elements?.tabsSeparator);
      clearEl(this.elements?.sidebarNewTabBtn);
    },

    _isSidebarNodeUnpinned(node) {
      if (node.classList?.contains('tab-group')) {
        const gid = this._groupIdFromNode(node);
        if (gid == null) return false;
        const g =
          this.tabGroups.get(gid) ??
          this.tabGroups.get(Number(gid)) ??
          this.tabGroups.get(String(gid));
        return !!(g && g.pinned === false);
      }
      if (node.classList?.contains('tab')) {
        if (node.classList.contains('tab-favorite-host')) return false;
        if (node.classList.contains('pinned')) return false;
        const tid = this._tabIdFromNode(node);
        const t = tid != null ? this.tabs.get(tid) : null;
        if (t?.isFavoriteTab) return false;
        return !!(t && !t.pinned);
      }
      return false;
    },

    async _finishProfileSwitchSidebarDisplay(profileId, layoutFn) {
      try {
        if (typeof layoutFn === 'function') await layoutFn();
        this._clearProfileSidebarTabDragVisuals();
        void document.getElementById('tabs-container')?.offsetHeight;
      } finally {
        this._revealProfileSwitchSidebar();
        this._resetProfileSwipeCompositorLayers();
      }
    },

    /** Reattach pooled tab/group nodes in preserved DOM order — no full sidebar rebuild. */
    _restorePooledSidebar(profileId) {
      const pool = this.getProfileDomPool(profileId);
      const container = document.getElementById('tabs-container');
      const separator = document.getElementById('tabs-separator');
      const newTabBtn = document.getElementById('sidebar-new-tab-btn');
      if (!pool || !container || !separator || pool.childElementCount === 0) return false;

      this.cacheDOMElements?.();

      const nodes = Array.from(pool.children);
      const pinnedFrag = document.createDocumentFragment();
      const unpinnedFrag = document.createDocumentFragment();

      for (const node of nodes) {
        node.classList?.remove('smooth-dragging', 'drag-sliding', 'dragging');
        node.style?.removeProperty('transform');
        node.style?.removeProperty('transition');
        if (this._isSidebarNodeUnpinned(node)) unpinnedFrag.appendChild(node);
        else pinnedFrag.appendChild(node);
      }

      Array.from(container.children).forEach((child) => {
        if (child.classList?.contains('tab') || child.classList?.contains('tab-group')) {
          child.remove();
        }
      });

      container.insertBefore(pinnedFrag, separator);

      const afterNewTab = newTabBtn ? newTabBtn.nextSibling : null;
      if (afterNewTab) container.insertBefore(unpinnedFrag, afterNewTab);
      else container.appendChild(unpinnedFrag);

      for (const [tabId, tab] of this.tabs || []) {
        if (tab?.pinned) this.updatePinnedTabClosedState?.(tabId);
      }

      this.updatePinnedSeparatorVisibility?.();
      this.updateEmptyState?.();
      this._refreshBuiltInTabFavicons?.();
      return true;
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

    _setProfileFavoritesFromState(state) {
      const raw =
        (Array.isArray(state?.favorites) && state.favorites.length && state.favorites) ||
        (Array.isArray(state?.settings?.favorites) && state.settings.favorites.length && state.settings.favorites) ||
        [];
      if (raw.length && typeof this._mapFavoritesFromStore === 'function') {
        this.favorites = this._mapFavoritesFromStore(raw);
      } else if (raw.length) {
        this.favorites = raw.map((f) => ({ ...f }));
      } else {
        this.favorites = [];
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
      this._recentTabStack = Array.isArray(state.recentTabStack)
        ? state.recentTabStack
            .map((id) => this._normalizeTabMapKey(id))
            .filter((id) => id != null && (state.tabs || new Map()).has(id))
        : [];
      const curKey = this._normalizeTabMapKey(this.currentTab);
      if (curKey != null && this.tabs.has(curKey) && !this._recentTabStack.includes(curKey)) {
        this._recentTabStack.push(curKey);
      }
      this._setProfileFavoritesFromState(state);
      this.settings = state.settings ? { ...state.settings } : {};
      this.windowProfileIcon = state.windowProfileIcon ?? this.windowProfileIcon;
      this._sidebarMediaDock = state.sidebarMediaDock || null;
      this.applySidebarPosition?.();

      const restored = fast && this._restorePooledSidebar(pid);
      this._clearDetachedTabElementPool?.();
      this._purgeOrphanSidebarNodes?.();
      this._relinkFavoriteRuntimeTabs?.();
      const domOk = restored && this._sidebarDomMatchesState?.(pid);
      if (domOk) {
        this._syncTabGroupsPresentationFromState?.();
        this.renderFavorites?.();
        this.updatePinnedSeparatorVisibility?.();
        this.updateEmptyState?.();
      } else {
        this._syncProfileSidebarDom({ setupDrag: false });
      }
      this._refreshBuiltInTabFavicons?.();
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
      const outgoingProfileId = sanitizeProfileId(this.profileId);
      try {
        const payload = this.flushSessionStatePayload?.('profile-switch');
        if (payload && window.electronAPI?.flushSessionAsync) {
          await window.electronAPI.flushSessionAsync(payload);
        } else if (payload && window.electronAPI?.flushSessionSync) {
          window.electronAPI.flushSessionSync(payload);
        }
        await this.savePinnedTabs?.();
        await this.saveTabGroups?.();
        await this.saveFavorites?.(outgoingProfileId);
      } catch (e) {
        console.error('flush profile store', e);
      }
    },

    _cloneTabForRuntimeCache(tab) {
      if (!tab) return tab;
      const out = { ...tab, webview: null };
      if (out.siteThemeRgb) out.siteThemeRgb = { ...out.siteThemeRgb };
      if (out.urlBarChromeSnapshot) out.urlBarChromeSnapshot = { ...out.urlBarChromeSnapshot };
      if (out.url === this.NEWTAB_URL && !out.customIcon) {
        out.favicon =
          typeof this.resolveTabFaviconForData === 'function'
            ? this.resolveTabFaviconForData(out)
            : this._savedNewTabInAiChatFromPayload?.(out)
              ? this.NTP_AI_CHAT_FAVICON
              : this.NTP_DEFAULT_FAVICON;
      }
      if (out.pinned) {
        out.closed = !tab.webview;
      }
      return out;
    },

    _cloneTabGroupForRuntimeCache(group) {
      if (!group) return group;
      return {
        ...group,
        tabIds: Array.isArray(group.tabIds) ? [...group.tabIds] : []
      };
    },

    _snapshotRunningProfile() {
      const pid = sanitizeProfileId(this.profileId);

      if (this.currentTab != null) {
        this._persistUrlBarChromeToTab?.(this.currentTab);
      }

      let state = {
        profileId: pid,
        tabs: new Map(
          Array.from(this.tabs.entries()).map(([k, v]) => [k, this._cloneTabForRuntimeCache(v)])
        ),
        tabGroups: new Map(
          Array.from(this.tabGroups.entries()).map(([k, v]) => [k, this._cloneTabGroupForRuntimeCache(v)])
        ),
        currentTab: this.currentTab,
        recentTabStack: Array.isArray(this._recentTabStack) ? [...this._recentTabStack] : [],
        favorites: Array.isArray(this.favorites) ? this.favorites.map((f) => ({ ...f })) : [],
        settings: this.settings ? { ...this.settings } : {},
        windowProfileIcon: this.windowProfileIcon,
        sidebarMediaDock: this._sidebarMediaDock ? { ...this._sidebarMediaDock } : null,
        shellChromeSnapshot: this._shellSnapshotForProfile(pid),
        urlBarChromeSnapshot: this._captureUrlBarChromeSnapshot?.() || null
      };

      if (this.getUnpinnedClearMode?.() === 'profile-switch') {
        state = this.stripUnpinnedFromProfileRuntimeState?.(state) || state;
      }

      this._profileRuntime.set(pid, state);

      if (this._profileRuntime.size > MAX_RUNTIME_CACHE) {
        const oldest = this._profileRuntime.keys().next().value;
        if (oldest && oldest !== pid) {
          void this._disposeProfileRuntime(oldest);
        }
      }

      if (this.elements?.sidebarMediaDock) {
        this.elements.sidebarMediaDock.classList.add('hidden');
      }

      return state;
    },

    /** Build a disk payload from a parked runtime snapshot (profile may not be active). */
    _persistPayloadFromRuntimeState(state) {
      if (!state?.tabs) return null;
      const keepUnpinned = !!this._shouldPersistUnpinnedItems?.('profile-switch');
      const pinnedTabs = [];
      const unpinnedTabs = [];
      let pinnedOrder = 0;
      let unpinnedOrder = 0;
      for (const [rawId, tab] of state.tabs.entries()) {
        if (!tab || tab.isFavoriteTab) continue;
        const tabId = this._normalizeTabMapKey?.(rawId) ?? rawId;
        const payload = {
          id: tabId,
          url: tab.savedLinkUrl || tab.url || null,
          title: tab.title || 'New Tab',
          favicon: tab.favicon || null,
          customIcon: tab.customIcon || null,
          customIconType: tab.customIconType || null,
          customTitle: tab.customTitle || null
        };
        if (tab.newTabPageState) payload.newTabPageState = tab.newTabPageState;
        if (tab.pinned && !tab.tabGroupId) {
          payload.order = pinnedOrder++;
          pinnedTabs.push(payload);
        } else if (!tab.pinned && !tab.tabGroupId && keepUnpinned) {
          payload.order = unpinnedOrder++;
          unpinnedTabs.push(payload);
        }
      }

      const tabGroups = [];
      for (const group of state.tabGroups?.values?.() || []) {
        if (!group) continue;
        if (!keepUnpinned && group.pinned === false) continue;
        const tabIds = (Array.isArray(group.tabIds) ? group.tabIds : [])
          .map((id) => this._normalizeTabMapKey?.(id) ?? id)
          .filter((id) => id != null && state.tabs.has(id));
        const tabs = tabIds
          .map((tabId) => {
            const tab = state.tabs.get(tabId);
            if (!tab) return null;
            const saved = {
              id: tabId,
              url: tab.url || null,
              title: tab.title || 'New Tab',
              favicon: tab.favicon || null
            };
            if (tab.newTabPageState) saved.newTabPageState = tab.newTabPageState;
            return saved;
          })
          .filter(Boolean);
        tabGroups.push({
          id: group.id,
          name: group.name,
          tabIds,
          tabs,
          open: group.open !== false,
          order: group.order,
          color: group.color || '#FF6B6B',
          pinned: group.pinned !== false,
          icon: group.icon || null,
          iconType: group.iconType || null,
          hadTabs: group.hadTabs === true || tabIds.length > 0
        });
      }

      const favoritesPayload = (Array.isArray(state.favorites) ? state.favorites : [])
        .map((fav, order) => ({
          id: fav.id || `fav-${Date.now()}-${order}`,
          url: this.normalizeFavoriteUrl?.(fav.url) || fav.url,
          title: String(fav.title || 'Favorite').trim() || 'Favorite',
          favicon: fav.favicon || null,
          customIcon: fav.customIcon || null,
          customIconType: fav.customIconType || null,
          order
        }))
        .filter((fav) => !!fav.url);

      return {
        sessionPayload: {
          incognito: false,
          tabGroups,
          pinnedTabs,
          unpinnedTabs,
          clearUnpinnedRecovery: false
        },
        pinnedTabs,
        tabGroups,
        unpinnedTabs: keepUnpinned ? unpinnedTabs : [],
        favoritesPayload
      };
    },

    async _disposeProfileRuntime(profileId) {
      const id = sanitizeProfileId(profileId);
      const state = this._profileRuntime?.get(id);
      if (state && id !== sanitizeProfileId(this.profileId)) {
        const captured = this._persistPayloadFromRuntimeState(state);
        if (captured) {
          await this._persistOutgoingProfile(id, captured);
        }
      }
      if (state?.tabs) {
        for (const tab of state.tabs.values()) {
          if (!tab?.webview) continue;
          try {
            this.cleanupWebviewListeners?.(tab.webview);
            try {
              tab.webview.src = 'about:blank';
            } catch (_) {}
            tab.webview.remove();
          } catch (_) {}
          tab.webview = null;
        }
      }
      const pool = document.getElementById(this._axisProfileDomPoolId(id));
      if (pool) pool.innerHTML = '';
      this._profileRuntime?.delete(id);
      this._profileBootstrapCache?.delete(id);
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
      const inflight = this._profilePersistInflight?.get(pid);
      if (inflight) {
        try {
          await inflight;
        } catch (_) {}
      }
      this._parkSidebarTabDom(sanitizeProfileId(this.profileId));

      this.profileId = pid;
      this.tabs = new Map();
      this.tabGroups = new Map();
      this.currentTab = null;
      this.favorites = [];

      /* Always prefer a fresh store read — cached bootstrap can predate tabs added later. */
      let boot = null;
      try {
        boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        if (boot?.settings) this._profileBootstrapCache?.set(pid, boot);
        else this._profileBootstrapCache?.delete(pid);
      } catch (_) {
        boot = this._profileBootstrapCache?.get(pid) || null;
      }
      if (boot?.settings) {
        this.settings = { ...boot.settings };
        if (Array.isArray(boot.pinnedTabs)) this.settings.pinnedTabs = boot.pinnedTabs;
        if (Array.isArray(boot.tabGroups)) this.settings.tabGroups = boot.tabGroups;
        if (Array.isArray(boot.unpinnedTabs)) this.settings.unpinnedTabs = boot.unpinnedTabs;
        if (Array.isArray(boot.unpinnedTabsRecovery)) {
          this.settings.unpinnedTabsRecovery = boot.unpinnedTabsRecovery;
        }
        if (Array.isArray(boot.favorites)) this.settings.favorites = boot.favorites;
      } else {
        await this.loadSettings?.();
      }
      this.applySidebarPosition?.();
      if (!opts.deferHeavy) {
        await this.refreshShortcutCache?.();
      }
      this._lastJavascriptEnabled = this.settings?.javascriptEnabled !== false;
      if (
        Array.isArray(boot?.favorites) &&
        typeof this._mapFavoritesFromStore === 'function'
      ) {
        this.favorites = this._mapFavoritesFromStore(boot.favorites);
      } else {
        await this.loadFavorites?.();
      }
      await this.loadPinnedTabs?.();
      await this.loadTabGroups?.();
      await this.loadUnpinnedTabs?.({ context: 'profile-switch' });

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
    _applyProfileChromeImmediate(cached = null, opts = {}) {
      try {
        this.applySidebarPosition?.();
        this._profileUrlBarRestoredFromCache = false;
        this._profileShellThemeFromSnapshot = false;
        this._profileSwipeThemeActive = false;
        this._invalidateProfileSwipeThemePack?.(sanitizeProfileId(this.profileId));

        this._skipNextUrlBarRefresh = true;
        this._urlBarInstantThemeTabSwitch = true;
        this.elements?.webviewUrlBar?.classList.add('url-bar--instant-theme');

        const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        if (tab) {
          this._applyTabChromeImmediate?.(tab);
          this._profileUrlBarRestoredFromCache = !!this._tabUrlBarRestoredFromCache;
          const snap = tab.urlBarChromeSnapshot;
          const siteShell =
            this._isSiteThemeColorEnabled?.() &&
            snap?.siteThemeActive &&
            snap?.shellThemeHex;
          this._profileShellThemeFromSnapshot = !!siteShell;
        } else if (!opts.deferShellTheme) {
          if (this.settings?.themeColor || this.settings?.gradientColor) {
            this.applyCustomThemeFromSettings?.();
          } else {
            this.resetToBlackTheme?.();
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
        const isWebTab =
          wv &&
          tab &&
          tab.url !== this.NEWTAB_URL &&
          tab.url !== 'axis://settings' &&
          !tab.isSettings &&
          tab.url !== 'about:blank' &&
          !String(tab.url || '').startsWith('axis:note://');
        if (isWebTab && !this._profileUrlBarRestoredFromCache) {
          if (this._webviewThemeReady?.(wv)) {
            void this.extractUrlBarTheme?.(wv);
          }
        }
        this._profileUrlBarRestoredFromCache = false;
        this._profileShellThemeFromSnapshot = false;
        void this.populateExtensionsMenu?.();
      } catch (e) {
        console.error('profile chrome apply failed', e);
      }
    },

    _cancelSidebarSlideAnimation() {
      const keepCoupledTrack =
        !!this._profileSwipeFinalizing || !!this._trackSpringRaf || !!this._activeSpringPromise;
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
      if (this._trackAnim) {
        try {
          this._trackAnim.cancel();
        } catch (_) {}
        this._trackAnim = null;
      }
      if (keepCoupledTrack) return;
      this._resetProfileSwipeCompositorLayers();
      document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
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
        if (target.closest('#sidebar-plus-btn, #sidebar-plus-menu')) return true;
        if (target.closest('input, textarea, select, button, a, [contenteditable="true"]')) return true;
        return false;
      };

      const adjacentProfileId = (direction) => {
        return this._adjacentProfileIdFrom(this.profileId, direction);
      };

      /** Tab reorder uses mouse drag — profile switch is trackpad wheel only. */
      this._cancelProfilePointerSwipe = () => {};

      /* ---- Trackpad / wheel: drive the same coupled slide, commit only when motion stops ---- */
      const finishWheel = () => {
        const ws = this._wheelSwipe;
        if (!ws || ws.stepping) return;
        this._wheelSwipe = null;
        if (ws.endTimer) clearTimeout(ws.endTimer);
        if (!ws.engaged) {
          this._clearProfileSwipeShellThemeState();
          this._resetProfileSwipeCompositorLayers();
          return;
        }
        this._flushTrackTransform();
        const progress = this._profileSwipeProgressFromOffset(this._trackOffsetPx || 0, ws.direction);
        const commit =
          !!ws.targetId && (progress >= COMMIT_RATIO || (ws.vel || 0) >= FLICK_VELOCITY);
        if (commit) {
          const releaseSpringPromise = this._startProfileReleaseSpring(ws.direction, ws.vel || 0);
          void this.switchToProfileId(ws.targetId, {
            animate: true,
            direction: ws.direction,
            interactive: true,
            releaseVelocity: ws.vel || 0,
            releaseSpringPromise
          });
        } else {
          void this._resetCoupledTransition(true);
        }
      };
      this._profileWheelFinishHandler = finishWheel;

      const onProfileWheel = (e) => {
        if (this.isIncognitoWindow) return;
        const ws = this._wheelSwipe;
        const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) * 1.2;
        if (this._profileSwipeLock || this._profileSwipeFinalizing) {
          if (horizontal && !shouldIgnoreSwipeTarget(e.target)) {
            e.preventDefault();
            const now = performance.now();
            const dir = e.deltaX > 0 ? 1 : -1;
            const dt = Math.max(1, now - (this._pendingWheelResume?.lastTs || now));
            this._stashPendingWheelResume(dir, e.deltaX, Math.abs(e.deltaX) / dt);
            if (this._pendingWheelResume) this._pendingWheelResume.lastTs = now;
          }
          return;
        }
        if (!ws) {
          if (!horizontal) return;
          if (shouldIgnoreSwipeTarget(e.target)) return;
          this._cancelSidebarSlideAnimation();
          this._clearPendingWheelResume();
          this._wheelSwipe = {
            direction: e.deltaX > 0 ? 1 : -1,
            targetId: null,
            accumX: 0,
            engaged: false,
            vel: 0,
            lastTs: performance.now(),
            endTimer: null,
            stepsCompleted: 0,
            stepping: false
          };
        }
        const s = this._wheelSwipe;
        if (!s || s.stepping) return;
        e.preventDefault();
        s.accumX += e.deltaX;

        const natural = this._wheelNaturalPx(s.accumX, s.direction);
        if (!s.engaged && natural > WHEEL_ENGAGE_PX) {
          s.targetId = adjacentProfileId(s.direction);
          s.engaged = true;
          this._beginCoupledTransition(s.direction, s.targetId);
        }
        if (s.engaged) {
          const offset = this._coupledOffsetFor(-s.accumX, s.direction, !!s.targetId, s.targetId);
          this._setTrackTransform(offset, { immediate: true });
        }

        const now = performance.now();
        const dt = Math.max(1, now - s.lastTs);
        const v = (s.direction > 0 ? e.deltaX : -e.deltaX) / dt;
        this._pushSwipeVelocitySample(s, v);
        s.lastTs = now;

        if (s.endTimer) clearTimeout(s.endTimer);
        s.endTimer = setTimeout(finishWheel, WHEEL_END_MS);
      };

      if (gestureRoot.dataset.profileWheelBound !== '1') {
        gestureRoot.dataset.profileWheelBound = '1';
        gestureRoot.addEventListener('wheel', onProfileWheel, { passive: false });
      }

      if (gestureRoot.dataset.profilePointerGestures !== '1') {
        gestureRoot.dataset.profilePointerGestures = '1';
      }

      /* Warm neighbor data up front so the very first swipe shows real tabs + favorites
         immediately instead of an empty pane that fills in late. */
      this._seedCurrentProfileRuntimeCache?.();
      this._prefetchAdjacentProfileCaches?.();

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

      if (this.currentTab != null) {
        this._persistUrlBarChromeToTab?.(this.currentTab);
      }

      this._profileRuntime.set(pid, {
        profileId: pid,
        tabs: new Map(
          Array.from(this.tabs.entries()).map(([k, v]) => [k, this._cloneTabForRuntimeCache(v)])
        ),
        tabGroups: new Map(
          Array.from(this.tabGroups.entries()).map(([k, v]) => [k, this._cloneTabGroupForRuntimeCache(v)])
        ),
        currentTab: this.currentTab,
        recentTabStack: Array.isArray(this._recentTabStack) ? [...this._recentTabStack] : [],
        favorites: Array.isArray(this.favorites) ? this.favorites.map((f) => ({ ...f })) : [],
        settings: this.settings ? { ...this.settings } : {},
        windowProfileIcon: this.windowProfileIcon,
        sidebarMediaDock: this._sidebarMediaDock ? { ...this._sidebarMediaDock } : null,
        shellChromeSnapshot: this._shellSnapshotForProfile(pid),
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
        if (boot?.settings) {
          this._profileBootstrapCache.set(pid, boot);
          this._invalidateProfileSwipeThemePack?.(pid);
          this._themePackForProfile(pid);
        }
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
      const pid = sanitizeProfileId(targetId);
      const inflight = this._profilePersistInflight?.get(pid);
      if (inflight) {
        try {
          await inflight;
        } catch (_) {}
      }
      const runtime = this._profileRuntime?.get(pid) || cached;
      if (runtime) {
        this._mountCachedProfile(runtime);
        return runtime;
      }
      await this._activateProfileFromDisk(pid, { deferHeavy: true });
      return null;
    },

    async _warmProfileSwipeTarget(profileId) {
      const pid = sanitizeProfileId(profileId);
      if (!pid || pid === sanitizeProfileId(this.profileId)) return;
      if (this._profileRuntime.has(pid)) return;
      try {
        const boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        if (boot?.settings) {
          this._profileBootstrapCache?.set(pid, boot);
          this._invalidateProfileSwipeThemePack?.(pid);
          this._themePackForProfile(pid);
        }
      } catch (_) {}
    },

    _warmAllProfileSwipeCaches() {
      if (this.isIncognitoWindow) return;
      this._themePackForProfile(this.profileId);
      for (const id of this._orderedSwipeProfileIds()) {
        if (id === sanitizeProfileId(this.profileId)) continue;
        this._themePackForProfile(id);
        void this._prefetchProfileBootstrap(id);
      }
    },

    /** Snapshot + capture outgoing profile payloads (persist after slide, before loading incoming). */
    _beginProfileSwitchPrep(outgoingId, opts = {}) {
      const outPid = sanitizeProfileId(outgoingId || this.profileId);
      const run = () => {
        try {
          this._snapshotRunningProfile();
          const captured = this._captureOutgoingPersistPayloadForSwitch(outPid);
          return { captured };
        } catch (e) {
          console.error('profile switch prep failed', e);
          const state = this._profileRuntime?.get(outPid);
          return {
            error: e,
            captured: state ? this._persistPayloadFromRuntimeState(state) : null
          };
        }
      };
      if (opts.immediate) return Promise.resolve(run());
      return new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => resolve(run()));
        } else {
          setTimeout(() => resolve(run()), 0);
        }
      });
    },

    async _commitGestureStepProfileSwitch(targetId, outgoingId, opts = {}) {
      const id = sanitizeProfileId(targetId);
      const outId = sanitizeProfileId(outgoingId);
      const cached = opts.cached ?? this._profileRuntime.get(id);

      this._profileSwipeLock = true;
      try {
        this._snapshotRunningProfile();
        const captured = this._captureOutgoingPersistPayloadForSwitch(outId);
        await this._persistOutgoingAndSwitchMain(id, outId, captured);
        this._beginProfileSidebarTabSettle();
        let activated;
        try {
          activated = await this._loadTargetProfileState(id, cached);
          this._applyProfileChromeImmediate?.(activated);
          if (!activated) {
            const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === id);
            if (prof?.icon) {
              this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
            }
          }
          this.syncProfileSwitcherState?.();
          this._finalizeCoupledTransition();
        } catch (e) {
          document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
          throw e;
        }

        await this._finishProfileSwitchSidebarDisplay(id, async () => {
          if (typeof this.setupTabDragDrop === 'function') this.setupTabDragDrop();
          this._commitProfileWebview(id);
          await this.reloadFavoritesForProfile?.(id);
        });

        void this._prefetchAdjacentProfileCaches?.();
      } finally {
        this._profileSwipeLock = false;
      }
    },

    _commitInteractiveProfileSwitch(targetId, outgoingId, opts = {}) {
      const id = sanitizeProfileId(targetId);
      const direction = opts.direction ?? 1;
      const cached = opts.cached ?? this._profileRuntime?.get(id);
      const releaseVelocity = opts.releaseVelocity || 0;
      let completed = false;

      const slidePromise =
        opts.releaseSpringPromise || this._startProfileReleaseSpring(direction, releaseVelocity);

      this._profileSwipeLock = true;
      this._profileSwipeFinalizing = true;
      this.hideProfileSwitcherMenu?.();

      const prepPromise = this._beginProfileSwitchPrep(outgoingId, { immediate: true });
      if (!cached) void this._warmProfileSwipeTarget(id);

      return (async () => {
        try {
          const prep = await prepPromise;
          if (prep.error) throw prep.error;
          await slidePromise;
          await this._persistOutgoingAndSwitchMain(id, sanitizeProfileId(outgoingId), prep.captured);
          this._beginProfileSidebarTabSettle();
          const activated = await this._loadTargetProfileState(id, cached);

          if (!activated) {
            const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === id);
            if (prof?.icon) {
              this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
            }
          }

          this.syncProfileSwitcherState?.();
          this._applyProfileChromeImmediate?.(activated);
          this._finalizeCoupledTransition();

          await this._finishProfileSwitchSidebarDisplay(id, async () => {
            if (typeof this.setupTabDragDrop === 'function') this.setupTabDragDrop();
            void this._commitProfileWebview?.(id);
            void this.reloadFavoritesForProfile?.(id);
          });

          this._profileSwipeFinalizing = false;
          this._releaseProfileSwipeUi();

          void this._applyProfileChromeAfterSwitch?.();
          if (!activated && !this.isIncognitoWindow && this.settings?.transparentSites) {
            void this.applyTransparentSitesToAllWebviews?.();
          }
          void this.refreshProfilesMenu?.();
          this._prefetchAdjacentProfileCaches?.();
          completed = true;
          void this._resumePendingWheelIfAny();
        } catch (e) {
          console.error('switchToProfileId failed', e);
          this._profileSwipeFinalizing = false;
          this._clearProfileSwipeShellThemeState(true);
          document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
          this._resetProfileSwipeCompositorLayers();
          this.unwrapProfileSwipeChrome?.();
          this.cacheDOMElements?.();
          this._syncProfileSidebarDom({ setupDrag: true });
          this._cancelSidebarSlideAnimation();
        } finally {
          if (!completed) {
            this._profileSwipeFinalizing = false;
            this._resetProfileSwipeCompositorLayers();
            this._releaseProfileSwipeUi();
          }
        }
      })();
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

    async switchToAdjacentProfile(direction = 1) {
      if (this.isIncognitoWindow) return;
      if (this._profileSwipeLock || this._profileSwipeFinalizing) return;
      const dir = direction > 0 ? 1 : -1;
      const targetId = this._adjacentProfileIdFrom(this.profileId, dir);
      if (!targetId) return;
      await this.switchToProfileId(targetId, {
        animate: true,
        direction: dir
      });
    },

    async switchToProfileId(targetId, options = {}) {
      if (this.isIncognitoWindow) return;
      const id = sanitizeProfileId(targetId);
      const cur = sanitizeProfileId(this.profileId);
      if (id === cur || this._profileSwipeLock) return;

      const direction = options.direction ?? this._profileSwipeDirectionFor(id);
      const cached = this._profileRuntime.get(id);
      let completed = false;

      /* Swipe release: spring already running — never block motion on snapshot/save/load. */
      if (options.interactive) {
        return this._commitInteractiveProfileSwitch(id, cur, {
          direction,
          cached,
          releaseVelocity: options.releaseVelocity || 0,
          releaseSpringPromise: options.releaseSpringPromise
        });
      }

      if (options.gestureStep) {
        return this._commitGestureStepProfileSwitch(id, cur, { direction, cached });
      }

      this._profileSwipeLock = true;
      this._profileSwipeFinalizing = true;
      this.hideProfileSwitcherMenu?.();

      if (!this._isProfileSwipeChromeHealthy()) {
        this.ensureProfileSwipeChrome();
      } else {
        this._ensureSidebarProfileStage();
      }

      const wantAnimate = options.animate !== false && !prefersReducedMotion();

      try {
        const W = this._stageWidthPx();
        const fullOffset = this._coupledFullOffset(direction);
        const prep = await this._beginProfileSwitchPrep(cur, { immediate: true });
        if (prep.error) throw prep.error;

        let coupled = false;
        if (wantAnimate && W > 0 && this._beginCoupledTransition(direction, id)) {
          coupled = true;
        }

        if (coupled) {
          const remaining = Math.abs(fullOffset - (this._trackOffsetPx || 0));
          const duration = this._releaseSlideDuration(remaining);
          await this._animateTrackTo(fullOffset, duration, 'commit');
        }

        await this._persistOutgoingAndSwitchMain(id, cur, prep.captured);
        this._beginProfileSidebarTabSettle();
        let activated;
        try {
          activated = await this._loadTargetProfileState(id, cached);

          if (!activated) {
            const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === id);
            if (prof?.icon) {
              this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
            }
          }

          this.syncProfileSwitcherState?.();

          if (coupled) {
            this._applyProfileChromeImmediate?.(activated);
            this._finalizeCoupledTransition();
          } else if (wantAnimate) {
            await this._runEnterProfileSlide(direction);
            this._applyProfileChromeImmediate?.(activated);
          } else {
            this._applyProfileChromeImmediate?.(activated);
          }
        } catch (e) {
          document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
          throw e;
        }

        await this._finishProfileSwitchSidebarDisplay(id, async () => {
          if (typeof this.setupTabDragDrop === 'function') this.setupTabDragDrop();
          void this._commitProfileWebview?.(id);
          void this.reloadFavoritesForProfile?.(id);
        });

        this._profileSwipeFinalizing = false;
        this._releaseProfileSwipeUi();

        void this._applyProfileChromeAfterSwitch?.();
        if (!activated && !this.isIncognitoWindow && this.settings?.transparentSites) {
          void this.applyTransparentSitesToAllWebviews?.();
        }
        void this.refreshProfilesMenu?.();
        this._prefetchAdjacentProfileCaches?.();
        completed = true;
      } catch (e) {
        console.error('switchToProfileId failed', e);
        this._profileSwipeFinalizing = false;
        document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
        this._resetProfileSwipeCompositorLayers();
        this.unwrapProfileSwipeChrome?.();
        this.cacheDOMElements?.();
        this._syncProfileSidebarDom({ setupDrag: true });
        this._cancelSidebarSlideAnimation();
      } finally {
        if (!completed) {
          this._profileSwipeFinalizing = false;
          this._resetProfileSwipeCompositorLayers();
          this._releaseProfileSwipeUi();
        }
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
