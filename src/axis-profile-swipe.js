/**
 * In-window profile switching: data + tab DOM pools per profile; sidebar chrome stays put.
 */
(function (global) {
  const SLIDE_WIDTH_RATIO = 0.88;
  const SLIDE_MS = 280;
  const SLIDE_EXIT_MS = 160;
  const SLIDE_DRAG_MS = 220;
  const SLIDE_SNAP_MS = 220;
  const SLIDE_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  /* How far (fraction of pane width) or how fast (px/ms flick) before a release commits. */
  const COMMIT_RATIO = 0.42;
  const FLICK_VELOCITY = 0.32;
  const FLICK_MIN_PROGRESS = 0.18;
  const EDGE_GIVE_RATIO = 0.1;
  const EDGE_BOUNDARY_GIVE_RATIO = 0.16;
  const EDGE_BOUNDARY_STIFFNESS = 2.85;
  /* Direct finger tracking — side effects (theme/DOM) never run on this path during drag. */
  const DRAG_TRACK_RATIO = 1;
  const WHEEL_ENGAGE_PX = 8;
  /*
   * Debounced end-of-gesture — any wheel tick while engaged resets this. macOS trackpads emit
   * ~one event per 16ms frame, so anything near that ends the gesture while fingers still move.
   */
  const WHEEL_GESTURE_END_MS = 80;
  const WHEEL_GESTURE_END_FAST_MS = 60;
  /* Consecutive smoothly-decaying deltas = OS inertia after the fingers lifted. */
  const WHEEL_MOMENTUM_DECAY_RUN = 6;
  const WHEEL_MOMENTUM_DECAY_MIN_RATIO = 0.78;
  /* Inertia tail after release must not start (or abort) another switch. */
  const WHEEL_MOMENTUM_QUIET_MS = 140;
  /* Strong finger ticks reset the release timer; weaker decaying ticks are inertia. */
  const WHEEL_ACTIVE_DELTA_PX = 1.6;
  /* A fresh gesture must begin with real finger pressure, not a sub-pixel inertia tick. */
  const WHEEL_START_DELTA_PX = 1.8;
  /* Keep enough in-memory profiles that normal multi-profile use does not drop tabs. */
  const MAX_RUNTIME_CACHE = 12;
  /* Cap preview DOM so hundreds of closed pins don’t stall the gesture. */
  const PREVIEW_MAX_PINNED_ROWS = 40;
  const PREVIEW_MAX_UNPINNED_ROWS = 24;
  /* One neighbor pane, built from prefetch cache when possible. */
  const PREVIEW_EAGER_PANES = 1;
  /* Release settle runs on the compositor (WAAPI) so main-thread profile work can't stutter it. */
  const RELEASE_COMMIT_MS = 300;
  const RELEASE_SNAP_BACK_MS = 240;
  const RELEASE_MIN_MS = 150;
  const RELEASE_EASE = 'cubic-bezier(0.22, 0.85, 0.32, 1)';
  /* Initial slope of RELEASE_EASE — lets the settle start at the finger's release speed. */
  const RELEASE_EASE_SLOPE = 0.85 / 0.22;
  const THEME_MIX_STEP = 0.08;

  function easeOutCubic(t) {
    const x = Math.max(0, Math.min(1, t));
    return 1 - Math.pow(1 - x, 3);
  }

  /** Soft mid-pane theme dissolve (smoother than linear offset mapping). */
  function smoothstep01(t) {
    const x = Math.max(0, Math.min(1, t));
    return x * x * (3 - 2 * x);
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
        this.settings?.profileSwipeEnabled === false ||
        this._sidebarReorderDragActive ||
        this._favoriteDrag ||
        document.querySelector('.smooth-dragging, .favorite-dragging')
      );
    },

    _axisProfileDomPoolId(profileId) {
      return `axis-profile-dom-pool-${sanitizeProfileId(profileId)}`;
    },

    /** Sidebar UI lives in `#sidebar-scale` so zoom can scale without changing allocated width. */
    _sidebarContentRoot() {
      return document.getElementById('sidebar-scale') || document.getElementById('sidebar');
    },

    unwrapProfileSwipeChrome() {
      const sidebar = document.getElementById('sidebar');
      const root = this._sidebarContentRoot();
      if (sidebar && root) {
        const unwrapPane = (pane, insertBefore) => {
          const tabs = pane.querySelector('.tabs-section');
          if (tabs && tabs.parentNode !== root) {
            if (insertBefore) root.insertBefore(tabs, insertBefore);
            else root.insertBefore(tabs, root.firstChild);
          }
        };
        const footer = root.querySelector('.sidebar-section.sidebar-footer');
        if (footer && footer.parentNode !== root) {
          root.appendChild(footer);
        }
        const plusMenu = document.getElementById('sidebar-plus-menu');
        const insertBefore = plusMenu || null;

        const topbar = root.querySelector(':scope > .sidebar-tabs-topbar');
        const tabsSection = root.querySelector('.sidebar-section.tabs-section');
        if (topbar && tabsSection && tabsSection.contains(topbar)) {
          root.insertBefore(topbar, tabsSection);
          delete topbar.dataset.pinnedOutside;
        }

        const stage = document.getElementById('sidebar-profile-swipe-stage');
        if (stage) {
          const pane = stage.querySelector('.sidebar-profile-pane--live') || stage;
          unwrapPane(pane, insertBefore || stage);
          const footerInPane = pane.querySelector('.sidebar-footer');
          if (footerInPane && footerInPane.parentNode !== root) {
            root.appendChild(footerInPane);
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
      const root = this._sidebarContentRoot();
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      const track = document.getElementById('sidebar-profile-swipe-track');
      const pane = track?.querySelector('.sidebar-profile-pane--live');
      const tabsInPane = pane?.querySelector('.tabs-section');
      const footer = root?.querySelector(':scope > .sidebar-section.sidebar-footer');
      if (!sidebar || !root || !stage || !track || !pane || !tabsInPane || !footer) return false;
      if (root.querySelector(':scope > .tabs-section')) return false;
      if (
        stage.contains(footer) ||
        stage.querySelector('#sidebar-profile-footer, #sidebar-media-dock, .sidebar-footer')
      ) {
        return false;
      }
      const topbar =
        root.querySelector(':scope > .sidebar-tabs-topbar') ||
        document.querySelector('#sidebar > .sidebar-tabs-topbar');
      const tabsSection = root.querySelector('.sidebar-section.tabs-section');
      if (!topbar) return false;
      if (stage.contains(topbar) || tabsSection?.contains(topbar)) return false;
      return true;
    },

    /** Keep floating Clear outside the sliding track (still inside #sidebar-scale when idle). */
    _pinSidebarTopbarOutsideStage() {
      const root = this._sidebarContentRoot();
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      if (!root) return;

      let topbar = document.querySelector('.sidebar-tabs-topbar');
      if (!topbar) return;

      /* Pull Clear out of #sidebar parking from older swipe code, if still there. */
      if (topbar.parentElement?.id === 'sidebar') {
        const insertBefore = stage || root.querySelector('.sidebar-section.tabs-section') || null;
        if (insertBefore) root.insertBefore(topbar, insertBefore);
        else root.prepend(topbar);
        topbar.style.removeProperty('position');
        topbar.style.removeProperty('top');
        topbar.style.removeProperty('left');
        topbar.style.removeProperty('right');
        topbar.style.removeProperty('width');
        topbar.style.removeProperty('z-index');
        topbar.style.removeProperty('transform');
        topbar.style.removeProperty('pointer-events');
        delete topbar.dataset.parkedForSwipe;
      }

      const tabsSection = root.querySelector('.sidebar-section.tabs-section');
      const insideSlide =
        stage &&
        (stage.contains(topbar) ||
          topbar.closest('.sidebar-profile-pane, #sidebar-profile-swipe-track, .tabs-section'));
      if (insideSlide || tabsSection?.contains(topbar) || topbar.parentElement !== root) {
        const insertBefore = stage || tabsSection || null;
        if (insertBefore) root.insertBefore(topbar, insertBefore);
        else root.prepend(topbar);
        topbar.dataset.pinnedOutside = '1';
      }
    },

    /** Keep mini player + profile button as fixed sidebar children (never inside the slide stage). */
    _pinSidebarFooterOutsideStage() {
      const root = this._sidebarContentRoot();
      const stage = document.getElementById('sidebar-profile-swipe-stage');
      if (!root) return;

      let footer = root.querySelector(':scope > .sidebar-section.sidebar-footer');
      const plusMenu = document.getElementById('sidebar-plus-menu');

      const pullOut = (node) => {
        if (!node) return;
        const nested =
          node.querySelector('.sidebar-section.sidebar-footer') ||
          node.querySelector('#sidebar-media-dock')?.closest('.sidebar-section') ||
          node.querySelector('#sidebar-profile-footer')?.closest('.sidebar-section');
        if (nested && nested.parentNode !== root) {
          footer = nested;
        }
      };

      pullOut(stage);
      pullOut(document.getElementById('sidebar-profile-swipe-track'));
      pullOut(document.querySelector('.sidebar-profile-pane--live'));

      if (footer && footer.parentNode !== root) {
        root.appendChild(footer);
      }

      if (footer && stage && footer.parentNode === root) {
        if (plusMenu && plusMenu.parentNode === root) {
          if (footer.nextElementSibling !== plusMenu) {
            root.insertBefore(footer, plusMenu);
          }
        } else if (stage.nextElementSibling !== footer) {
          root.insertBefore(footer, stage.nextSibling);
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
      const root = this._sidebarContentRoot();
      if (!root) return;

      let stage = document.getElementById('sidebar-profile-swipe-stage');
      if (!stage) {
        const tabs = root.querySelector('.sidebar-section.tabs-section');
        if (!tabs) return;

        this._pinSidebarTopbarOutsideStage();

        stage = document.createElement('div');
        stage.id = 'sidebar-profile-swipe-stage';
        stage.className = 'sidebar-profile-swipe-stage';
        const track = document.createElement('div');
        track.id = 'sidebar-profile-swipe-track';
        track.className = 'sidebar-profile-swipe-track';
        const pane = document.createElement('div');
        pane.className = 'sidebar-profile-pane sidebar-profile-pane--live';
        const footer = root.querySelector('.sidebar-section.sidebar-footer');
        const plusMenu = document.getElementById('sidebar-plus-menu');
        const insertBefore = footer || plusMenu || null;
        if (insertBefore) root.insertBefore(stage, insertBefore);
        else root.appendChild(stage);
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
      if (this._profileSwitchEpoch == null) this._profileSwitchEpoch = 0;
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
        // Hidden favorite hosts are recreated per profile - do not carry across pools.
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

    /** Full pane width - coupled slide travels exactly this so the neighbor lands centered. */
    _stageWidthPx() {
      const stage = this._sidebarProfileStage || document.getElementById('sidebar-profile-swipe-stage');
      return stage?.clientWidth || 0;
    },

    _track() {
      return this._sidebarProfileTrack || document.getElementById('sidebar-profile-swipe-track');
    },

    _coupledRestOffset(direction = this._coupledDirection || 1) {
      const W = this._stageWidthPx();
      const paneCount = Math.max(2, this._coupledPaneCount || 2);
      return direction > 0 ? 0 : -(paneCount - 1) * W;
    },

    _coupledFullOffset(direction = this._coupledDirection || 1, steps = 1) {
      const W = this._stageWidthPx();
      const rest = this._coupledRestOffset(direction);
      const travel = Math.max(1, steps) * W;
      return direction > 0 ? rest - travel : rest + travel;
    },

    /** Fractional profile travel from the live track offset (1 = one profile). */
    _profileSwipeProgressFromOffset(offsetPx, direction = this._coupledDirection || 1) {
      const W = this._stageWidthPx();
      if (W <= 0) return 0;
      const rest = this._coupledRestOffset(direction);
      const travel = Math.abs(offsetPx - rest);
      return Math.max(0, travel / W);
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

    _wheelNaturalPx(accumX, direction) {
      return direction > 0 ? accumX : -accumX;
    },

    _isTrackAnimating() {
      return !!this._trackWaapi;
    },

    /** Stop the settle animation and freeze the track where it visually is (mid-flight grab). */
    _cancelTrackMotion() {
      const anim = this._trackWaapi;
      this._trackAnim = null;
      if (!anim) return;
      this._trackWaapi = null;
      const track = this._track();
      let px = this._trackOffsetPx || 0;
      if (track) {
        try {
          const t = getComputedStyle(track).transform;
          if (t && t !== 'none') px = new DOMMatrixReadOnly(t).m41;
        } catch (_) {}
      }
      try {
        anim.cancel();
      } catch (_) {}
      if (track) {
        track.style.transition = 'none';
        track.style.transform = `translate3d(${px.toFixed(2)}px, 0, 0)`;
        track.classList.remove('axis-track-animating');
      }
      this._trackOffsetPx = px;
    },

    _clearPaneCardMotion() {
      const clearPane = (pane) => {
        if (!pane) return;
        pane.style.removeProperty('transform');
        pane.style.removeProperty('transform-origin');
        pane.classList.remove('axis-sidebar-dragging');
      };
      clearPane(this._slidePane());
      (this._profilePreviewEls || []).forEach(clearPane);
      this._track()
        ?.querySelectorAll('.sidebar-profile-pane--preview')
        .forEach(clearPane);
    },

    _runSwipeDragSideEffects(_px) {
      /* Theme / preview side effects only — no card tilt or rotation. */
    },

    _syncThemeForSwipeProgress(progress, targetId) {
      const pid = sanitizeProfileId(targetId);
      if (!pid || progress <= 0) return;
      if (!this._profileSwipeThemeActive || this._swipeShellTargetId !== pid) {
        this._armProfileSwipeShellTheme(pid);
      }
      const mix = smoothstep01(Math.min(1, progress));
      const last = this._swipeShellLastProgress;
      if (last >= 0 && Math.abs(mix - last) < THEME_MIX_STEP) return;
      this.setProfileSwipeThemeMix?.(mix, this._swipeShellFromPack, this._swipeShellToPack);
      this._swipeShellLastProgress = mix;
    },

    _scheduleSwipeDragSideEffects(px) {
      this._pendingSwipeSideEffectsPx = px;
      if (this._swipeSideEffectsRaf) return;
      this._swipeSideEffectsRaf = requestAnimationFrame(() => {
        this._swipeSideEffectsRaf = null;
        const next = this._pendingSwipeSideEffectsPx;
        this._pendingSwipeSideEffectsPx = null;
        if (next == null) return;
        this._runSwipeDragSideEffects(next);
      });
    },

    _applyTrackTransform(px, { sideEffects = true } = {}) {
      const track = this._track();
      if (!track) return;
      /* Subpixel translate keeps the spring/drag butter-smooth; only snap to integers at rest. */
      const value = Number.isFinite(px) ? px : 0;
      this._trackOffsetPx = value;
      track.style.transition = 'none';
      track.style.transform = `translate3d(${value.toFixed(2)}px, 0, 0)`;
      if (!sideEffects) return;
      this._scheduleSwipeDragSideEffects(value);
    },

    /** Drop GPU swipe layers so sidebar tabs repaint at full resolution. */
    _resetProfileSwipeCompositorLayers() {
      if (this._trackTransformRaf) {
        cancelAnimationFrame(this._trackTransformRaf);
        this._trackTransformRaf = null;
      }
      if (this._swipeSideEffectsRaf) {
        cancelAnimationFrame(this._swipeSideEffectsRaf);
        this._swipeSideEffectsRaf = null;
      }
      this._pendingTrackPx = null;
      this._pendingSwipeSideEffectsPx = null;
      if (this._wheelTrackRaf) {
        cancelAnimationFrame(this._wheelTrackRaf);
        this._wheelTrackRaf = null;
      }
      this._pendingWheelTrackPx = null;
      this._cancelTrackMotion();

      const stage = this._sidebarProfileStage || document.getElementById('sidebar-profile-swipe-stage');
      stage?.classList.remove('axis-sidebar-drag-active');

      const track = this._track();
      /*
       * Collapse order matters: snap the track to the live pane FIRST while the duo
       * still exists, then drop the preview. Destroying the preview at full offset
       * left a blank hole where the outgoing profile had been.
       */
      if (track) {
        track.style.transition = 'none';
        this._trackOffsetPx = 0;
        track.style.transform = 'translate3d(0px, 0, 0)';
        void track.offsetWidth;
        this._destroyProfilePreviewPane();
      } else {
        this._destroyProfilePreviewPane();
        this._trackOffsetPx = 0;
      }

      if (track) {
        track.classList.remove('axis-sidebar-coupled', 'axis-sidebar-coupled-duo', 'axis-track-animating');
        track.style.removeProperty('transform');
        track.style.removeProperty('-webkit-transform');
        track.style.removeProperty('transition');
        track.style.removeProperty('will-change');
      }

      this._clearPaneCardMotion();
      const pane = this._slidePane();
      if (pane) {
        if (pane._axisSlideAnim) {
          try {
            pane._axisSlideAnim.cancel();
          } catch (_) {}
          pane._axisSlideAnim = null;
        }
        pane.classList.remove('axis-sidebar-animating');
        pane.style.removeProperty('-webkit-transform');
        pane.style.removeProperty('transition');
        pane.style.removeProperty('will-change');
      }

      this._trackOffsetPx = 0;
      document.getElementById('sidebar')?.classList.remove('is-profile-swiping');
      this._pinSidebarTopbarOutsideStage();

      const liveTabs =
        document.querySelector('#sidebar-profile-swipe-track .sidebar-profile-pane--live .tabs-container') ||
        document.getElementById('tabs-container');
      if (liveTabs) void liveTabs.offsetHeight;
    },

    _flushTrackTransform() {
      if (this._pendingTrackPx == null) return;
      this._setTrackTransform(this._pendingTrackPx, { immediate: true });
    },

    _flushSwipeDragSideEffects() {
      if (this._swipeSideEffectsRaf) {
        cancelAnimationFrame(this._swipeSideEffectsRaf);
        this._swipeSideEffectsRaf = null;
      }
      if (this._pendingSwipeSideEffectsPx != null) {
        const px = this._pendingSwipeSideEffectsPx;
        this._pendingSwipeSideEffectsPx = null;
        this._runSwipeDragSideEffects(px);
      } else if (this._trackOffsetPx != null) {
        this._runSwipeDragSideEffects(this._trackOffsetPx);
      }
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


    _setTrackTransform(px, { immediate = false, sideEffects = true } = {}) {
      if (immediate) {
        if (this._trackTransformRaf) {
          cancelAnimationFrame(this._trackTransformRaf);
          this._trackTransformRaf = null;
        }
        this._pendingTrackPx = null;
        this._applyTrackTransform(px, { sideEffects });
        return;
      }
      this._scheduleTrackTransform(px);
    },

    _pushSwipeVelocitySample(state, inst) {
      if (!state) return;
      if (!state.velSamples) state.velSamples = [];
      state.velSamples.push(Math.max(0, inst));
      if (state.velSamples.length > 4) state.velSamples.shift();
      const sum = state.velSamples.reduce((a, b) => a + b, 0);
      state.vel = sum / state.velSamples.length;
    },

    _clearProfileWheelFinishTimers(state) {
      if (!state) return;
      if (state.endTimer) {
        clearTimeout(state.endTimer);
        state.endTimer = null;
      }
    },

    _armProfileWheelIdle(state) {
      if (!state || state.settling) return;
      const finishWheel = this._profileWheelFinishHandler;
      if (typeof finishWheel !== 'function') return;
      if (state.endTimer) clearTimeout(state.endTimer);
      const vel = state.vel || 0;
      const ms = vel >= FLICK_VELOCITY ? WHEEL_GESTURE_END_FAST_MS : WHEEL_GESTURE_END_MS;
      state.endTimer = setTimeout(finishWheel, ms);
    },

    /** Batch wheel deltas to one transform paint per frame. */
    _coalesceTrackTransform(px) {
      this._pendingWheelTrackPx = px;
      if (this._wheelTrackRaf) return;
      this._wheelTrackRaf = requestAnimationFrame(() => {
        this._wheelTrackRaf = null;
        const next = this._pendingWheelTrackPx;
        this._pendingWheelTrackPx = null;
        if (next == null) return;
        this._setTrackTransform(next, { immediate: true, sideEffects: false });
      });
    },

    _flushCoalescedTrackTransform() {
      if (this._wheelTrackRaf) {
        cancelAnimationFrame(this._wheelTrackRaf);
        this._wheelTrackRaf = null;
      }
      if (this._pendingWheelTrackPx != null) {
        const px = this._pendingWheelTrackPx;
        this._pendingWheelTrackPx = null;
        this._setTrackTransform(px, { immediate: true, sideEffects: false });
      }
    },

    /** Cap travel at the end of the profile list, not at the next profile. */
    _clampWheelAccum(accumX, direction) {
      const W = this._stageWidthPx() || 320;
      const profileCount = Math.max(1, this._swipeTargetIds?.length || 1);
      const maxNatural = (W * profileCount) / Math.max(0.01, DRAG_TRACK_RATIO);
      const natural = this._wheelNaturalPx(accumX, direction);
      const clamped = Math.max(0, Math.min(maxNatural, natural));
      return direction > 0 ? clamped : -clamped;
    },

    _shouldCommitProfileWheel(ws, progress) {
      if (!ws?.targetId) return false;
      if (progress >= COMMIT_RATIO) return true;
      const vel = ws.vel || 0;
      return progress >= FLICK_MIN_PROGRESS && vel >= FLICK_VELOCITY;
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
      this._profileSwipeEngageGen = (this._profileSwipeEngageGen || 0) + 1;
      this._swipeShellFromPack = null;
      this._swipeShellToPack = null;
      this._swipeShellTargetId = null;
      this._swipeShellSegment = null;
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
      if (this._swipeSideEffectsRaf) {
        cancelAnimationFrame(this._swipeSideEffectsRaf);
        this._swipeSideEffectsRaf = null;
      }
      this._pendingSwipeSideEffectsPx = null;
      this._lastPreviewFillThrough = -1;
      this.tearDownProfileSwipeThemeOverlay?.();
      const dropThemeSwitching = () => {
        if (!this._profileSwipeThemeActive) {
          document.body?.classList.remove('theme-switching');
        }
      };
      if (!restoreCurrent) {
        /* Keep the panel ring pinned until after webview/panel state settles (see afterUnlock). */
        requestAnimationFrame(dropThemeSwitching);
        return;
      }
      this._unpinWebPanelRingForProfileSwipe?.();
      /* Cancelled swipe - restore outgoing theme without a second paint if chrome already matches. */
      if (this.settings?.themeColor || this.settings?.gradientColor) {
        this.applyCustomThemeFromSettings?.();
      } else {
        this.resetToBlackTheme?.();
      }
      requestAnimationFrame(dropThemeSwitching);
    },

    _armProfileSwipeShellTheme(targetId, fromId = this.profileId, opts = {}) {
      const pid = sanitizeProfileId(targetId);
      if (!pid) {
        this._clearProfileSwipeShellThemeState();
        return;
      }
      const retarget = !!this._profileSwipeThemeActive && opts.retarget;
      this._profileSwipeThemeActive = true;
      this._swipeShellTargetId = pid;
      this._swipeShellThemeProgressPeak = 0;
      this._swipeShellFromPack = this._themePackForProfile(fromId);
      this._swipeShellToPack = this._themePackForProfile(pid);
      this._swipeShellLastProgress = -1;
      this._swipeShellToPackNeedsRefresh = false;
      this._pinWebPanelRingForProfileSwipe?.();
      this.armProfileSwipeThemeCrossfade?.(this._swipeShellFromPack, this._swipeShellToPack, {
        continueMix: retarget ? 0 : undefined
      });
      document.body?.classList.add('theme-switching');
    },

    _syncProfileSwipeShellThemeForOffset(offsetPx) {
      const direction = this._coupledDirection;
      const targets = this._swipeTargetIds || [];
      if (!targets.length || !direction || !this._profileSwipeThemeActive) return;

      const travel = this._profileSwipeProgressFromOffset(offsetPx, direction);
      if (travel <= 0) return;
      const segment = Math.min(targets.length - 1, Math.max(0, Math.ceil(travel) - 1));
      const targetId = targets[segment];
      const fromId = segment === 0 ? this.profileId : targets[segment - 1];
      const progress = Math.max(0, Math.min(1, travel - segment));

      if (this._swipeShellSegment !== segment || this._swipeShellTargetId !== targetId) {
        this._swipeShellSegment = segment;
        this._armProfileSwipeShellTheme(targetId, fromId, { retarget: true });
      }
      if (!this._swipeShellFromPack || !this._swipeShellToPack) return;

      /* Soften the mid-pane dissolve so colors feel continuous, not mechanical. */
      const mix = smoothstep01(progress);
      const last = this._swipeShellLastProgress;
      if (last >= 0 && Math.abs(mix - last) < THEME_MIX_STEP && mix > 0.02 && mix < 0.98) {
        return;
      }
      this.setProfileSwipeThemeMix?.(mix, this._swipeShellFromPack, this._swipeShellToPack);
      this._swipeShellLastProgress = mix;
    },

    _resolveShellSnapshotForProfileState(cached) {
      const pid = sanitizeProfileId(cached?.profileId || this.profileId);
      if (cached?.shellChromeSnapshot?.colors) return cached.shellChromeSnapshot;
      return this._shellSnapshotForProfile(pid);
    },

    _startProfileReleaseSpring(direction, releaseVelocity = 0, steps = 1) {
      const fullOffset = this._coupledFullOffset(direction, steps);
      return this._animateTrackSettle(fullOffset, { mode: 'commit', velocity: releaseVelocity });
    },

    _revealProfileSwitchSidebar() {
      this._refreshBuiltInTabFavicons?.();
      document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
      const liveTabs =
        document.querySelector('#sidebar-profile-swipe-track .sidebar-profile-pane--live .tabs-container') ||
        document.getElementById('tabs-container');
      if (liveTabs) void liveTabs.offsetHeight;
    },

    /**
     * Settle the track to `toPx` on the compositor. Duration shrinks with distance and is
     * matched to the release speed (px/ms) so the hand-off from finger to animation is seamless.
     */
    _animateTrackSettle(toPx, { mode = 'commit', velocity = 0 } = {}) {
      const track = this._track();
      if (!track) return Promise.resolve();
      this._cancelTrackMotion();
      const fromPx = this._trackOffsetPx || 0;
      const distance = Math.abs(toPx - fromPx);
      if (prefersReducedMotion() || distance < 0.5 || typeof track.animate !== 'function') {
        this._setTrackTransform(toPx, { immediate: true, sideEffects: false });
        return Promise.resolve();
      }

      const W = Math.max(1, this._stageWidthPx() || 320);
      const base = mode === 'snap' ? RELEASE_SNAP_BACK_MS : RELEASE_COMMIT_MS;
      let duration = base * (0.55 + 0.45 * Math.min(1, distance / W));
      const speed = Math.abs(Number(velocity) || 0);
      if (speed > 0.05) {
        duration = Math.min(duration, (RELEASE_EASE_SLOPE * distance) / speed);
      }
      duration = Math.round(Math.max(RELEASE_MIN_MS, duration));

      const from = `translate3d(${fromPx.toFixed(2)}px, 0, 0)`;
      const to = `translate3d(${toPx.toFixed(2)}px, 0, 0)`;
      track.classList.add('axis-track-animating');
      track.style.transition = 'none';
      track.style.transform = to;
      this._trackOffsetPx = toPx;

      const anim = track.animate([{ transform: from }, { transform: to }], {
        duration,
        easing: RELEASE_EASE
      });
      this._trackWaapi = anim;
      return new Promise((resolve) => {
        const done = () => {
          if (this._trackWaapi === anim) {
            this._trackWaapi = null;
            track.classList.remove('axis-track-animating');
          }
          resolve();
        };
        anim.finished.then(done, done);
      });
    },

    _animateTrackSpring(toPx, releaseVelocity = 0, mode = 'commit') {
      return this._animateTrackSettle(toPx, { mode, velocity: releaseVelocity });
    },

    _animateTrackTo(toPx, _duration, mode = 'commit') {
      return this._animateTrackSettle(toPx, { mode });
    },

    _releaseProfileSwipeUi() {
      this._profileSwipeLock = false;
    },

    _bumpProfileSwitchEpoch() {
      this._profileSwitchEpoch = (this._profileSwitchEpoch || 0) + 1;
      return this._profileSwitchEpoch;
    },

    _isProfileSwitchEpochCurrent(epoch) {
      return epoch === this._profileSwitchEpoch;
    },

    /** Cancel an in-flight wheel commit so the next gesture can start immediately. */
    _abortInFlightProfileSwitch() {
      this._bumpProfileSwitchEpoch();
      this._profileSwipeFinalizing = false;
      this._cancelTrackMotion();
      document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
      // Isolation must never stick after an aborted swipe - that froze widgets/saves.
      try {
        this._endProfileNtpIsolation?.();
      } catch (_) {}
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
        const pinnedSidebarOrder =
          this._rememberPinnedSidebarOrder?.() ||
          this.settings?.pinnedSidebarOrder ||
          [];
        if (sessionPayload && !sessionPayload.incognito) {
          sessionPayload.tabGroups = tabGroups;
          sessionPayload.pinnedTabs = pinnedTabs;
          sessionPayload.unpinnedTabs = unpinnedTabs;
          sessionPayload.pinnedSidebarOrder = pinnedSidebarOrder;
        }
        return {
          sessionPayload,
          pinnedTabs,
          tabGroups,
          unpinnedTabs,
          pinnedSidebarOrder,
          favoritesPayload
        };
      } catch (e) {
        console.error('capture outgoing profile payload', e);
        return null;
      }
    },

    /** Prefer runtime snapshot for persist - avoids live DOM clears mid-swipe. */
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
            pinnedSidebarOrder: captured.pinnedSidebarOrder,
            favoritesPayload: Array.isArray(captured.favoritesPayload) ? captured.favoritesPayload : []
          };
          if (window.electronAPI?.persistOutgoingProfile) {
            const result = await window.electronAPI.persistOutgoingProfile(pid, payload);
            if (result && result.ok === false) {
              console.error('persist outgoing profile refused:', result.error);
            }
            return;
          }
          console.error('persistOutgoingProfile IPC unavailable - outgoing profile not saved');
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

    /** List-end rubber-band - progressive resistance, more give than a wall but heavier than a normal swipe. */
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

    /** Map raw pointer dx to track offset — paginated Arc-style travel; rubber only at list ends. */
    _coupledOffsetFor(rawPointerDx, direction, hasNeighbor, swipeTargetId = null) {
      const W = this._stageWidthPx() || 1;
      const natural = direction > 0 ? -rawPointerDx : rawPointerDx;
      const rest = hasNeighbor ? this._coupledRestOffset(direction) : 0;
      const atListEdge = this._isProfileListEdge(direction);
      const maxPages = Math.max(1, this._swipeTargetIds?.length || 1);
      const maxTravel = maxPages * W;
      let prog;

      if (natural <= 0) {
        prog = -this._rubber(-natural, W * EDGE_GIVE_RATIO);
      } else if (atListEdge) {
        prog = this._rubberEdge(natural, W);
      } else if (hasNeighbor) {
        const mapped = natural * DRAG_TRACK_RATIO;
        prog = Math.min(maxTravel, mapped);
        if (mapped > maxTravel) {
          prog = maxTravel + this._rubberEdge(mapped - maxTravel, W);
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
        if (typeof this.customTabIconHtml === 'function') {
          return this.customTabIconHtml(tabData.customIcon, tabData.customIconType);
        }
        if (tabData.customIconType === 'emoji') {
          return `<span class="tab-favicon tab-favicon-custom tab-favicon-custom--emoji" aria-hidden="true">${this._escapePreviewText(tabData.customIcon)}</span>`;
        }
        return `<span class="tab-favicon tab-favicon-custom tab-favicon-custom--fa" aria-hidden="true"><i class="fas ${this._escapePreviewText(this.normalizeFaIconClass?.(tabData.customIcon) || tabData.customIcon)}" aria-hidden="true"></i></span>`;
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
            <span class="tab-audio-wrap">
                <button type="button" class="tab-audio-indicator" aria-label="Tab audio"><i class="fas fa-volume-up"></i></button>
            </span>
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
        typeof this.tabGroupIconHtml === 'function'
          ? this.tabGroupIconHtml(groupData)
          : groupData?.icon
            ? groupData.iconType === 'emoji'
              ? `<span class="tab-favicon tab-group-icon tab-favicon-custom tab-favicon-custom--emoji" aria-hidden="true">${this._escapePreviewText(groupData.icon)}</span>`
              : `<span class="tab-favicon tab-group-icon tab-favicon-custom tab-favicon-custom--fa" aria-hidden="true"><i class="fas ${this._escapePreviewText(groupData.icon)}" aria-hidden="true"></i></span>`
            : `<i class="fas fa-layer-group tab-group-icon" aria-hidden="true"></i>`;
      tabGroupElement.innerHTML = `
        <div class="tab-content">
          <div class="tab-left">
            ${iconHtml}
            <span class="tab-title">${this._escapePreviewText(groupData?.name || 'Tab Group')}</span>
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
      sep.classList.add('tabs-separator--preview');
      sep.style.display = hasPinnedAbove ? 'block' : 'none';
      sep.querySelector('.clear-unpinned-btn')?.remove();
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

      const buildPinnedFromOrder = (orderItems, tabById, groupById, loosePinnedFallback, pinnedGroupsFallback) => {
        const pinned = [];
        const seenTabs = new Set();
        const seenGroups = new Set();
        for (const item of orderItems || []) {
          if (!item) continue;
          if (item.type === 'tab' || item.kind === 'tab') {
            const id = item.id ?? item.data?.id;
            const tab = tabById.get(String(id)) || tabById.get(id);
            if (!tab || seenTabs.has(String(id))) continue;
            seenTabs.add(String(id));
            pinned.push({ kind: 'tab', data: tab });
          } else if (item.type === 'group' || item.kind === 'group') {
            const id = item.id ?? item.data?.id;
            const group = groupById.get(String(id)) || groupById.get(id);
            if (!group || seenGroups.has(String(id))) continue;
            if (!(groupHasTabs(group) || !group.hadTabs)) continue;
            seenGroups.add(String(id));
            pinned.push({ kind: 'group', data: group });
          }
        }
        for (const tab of loosePinnedFallback || []) {
          const id = tab?.id;
          if (id == null || seenTabs.has(String(id))) continue;
          seenTabs.add(String(id));
          pinned.push({ kind: 'tab', data: tab });
        }
        for (const group of pinnedGroupsFallback || []) {
          if (!group || seenGroups.has(String(group.id))) continue;
          if (!(groupHasTabs(group) || !group.hadTabs)) continue;
          seenGroups.add(String(group.id));
          pinned.push({ kind: 'group', data: group });
        }
        return pinned;
      };

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
        const groupToItemData = (g) => {
          const groupTabs = (g.tabIds || [])
            .map((id) => tabs.get(id))
            .filter((t) => this._sidebarPreviewTabEligible(t))
            .map((t) => ({ ...t }));
          return { ...g, tabs: groupTabs, tabIds: g.tabIds || [] };
        };
        const pinnedGroups = Array.from(tabGroups.values())
          .filter((g) => g.pinned !== false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(groupToItemData);
        const unpinnedGroups = Array.from(tabGroups.values())
          .filter((g) => g.pinned === false)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map(groupToItemData);

        const tabById = new Map();
        for (const t of loosePinned) {
          if (t?.id != null) tabById.set(String(t.id), t);
        }
        const groupById = new Map();
        for (const g of pinnedGroups) {
          if (g?.id != null) groupById.set(String(g.id), g);
        }

        let orderItems = null;
        const unpinnedById = new Map();
        for (const t of looseUnpinned) {
          if (t?.id != null) unpinnedById.set(String(t.id), t);
        }
        let orderedUnpinned = [];
        const pool = document.getElementById(this._axisProfileDomPoolId?.(pid));
        if (pool?.childElementCount) {
          const pinnedTabIds = new Set(loosePinned.map((t) => String(t.id)));
          const pinnedGroupIds = new Set(pinnedGroups.map((g) => String(g.id)));
          orderItems = [];
          for (const node of pool.children) {
            if (node.classList?.contains('tab') && !node.classList.contains('tab-favorite-host')) {
              const id =
                typeof this._normalizeTabMapKey === 'function'
                  ? this._normalizeTabMapKey(node.dataset.tabId)
                  : node.dataset.tabId;
              if (id == null) continue;
              if (pinnedTabIds.has(String(id))) {
                orderItems.push({ type: 'tab', id });
              } else if (unpinnedById.has(String(id))) {
                /* Parked DOM order - same order the live sidebar will restore. */
                orderedUnpinned.push(unpinnedById.get(String(id)));
                unpinnedById.delete(String(id));
              }
            } else if (node.classList?.contains('tab-group')) {
              const id = node.dataset.tabGroupId;
              if (id != null && pinnedGroupIds.has(String(id))) {
                orderItems.push({ type: 'group', id });
              }
            }
          }
          if (!orderItems.length) orderItems = null;
        }
        if (!orderItems?.length) {
          orderItems =
            runtime.pinnedSidebarOrder ||
            runtime.settings?.pinnedSidebarOrder ||
            null;
        }
        if (!orderedUnpinned.length) {
          const savedUnpinned =
            (Array.isArray(runtime.unpinnedSidebarOrder) && runtime.unpinnedSidebarOrder.length
              ? runtime.unpinnedSidebarOrder
              : null) ||
            (Array.isArray(runtime.settings?.unpinnedTabs) ? runtime.settings.unpinnedTabs : []);
          const seen = new Set();
          for (const row of savedUnpinned) {
            const id = this._normalizeTabMapKey?.(row?.id) ?? row?.id;
            if (id == null || seen.has(String(id))) continue;
            const tab = unpinnedById.get(String(id));
            if (!tab) continue;
            seen.add(String(id));
            orderedUnpinned.push(tab);
            unpinnedById.delete(String(id));
          }
        }
        for (const t of looseUnpinned) {
          if (t?.id != null && unpinnedById.has(String(t.id))) {
            orderedUnpinned.push(t);
            unpinnedById.delete(String(t.id));
          }
        }

        return {
          ready: true,
          favorites: Array.isArray(runtime.favorites) ? runtime.favorites : [],
          pinned: buildPinnedFromOrder(
            orderItems,
            tabById,
            groupById,
            loosePinned,
            pinnedGroups
          ),
          unpinned: [
            ...unpinnedGroups
              .filter((g) => groupHasTabs(g) || !g.hadTabs)
              .map((g) => ({ kind: 'group', data: g })),
            ...orderedUnpinned.map((t) => ({ kind: 'tab', data: t }))
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
        const tabById = new Map();
        for (const t of pinnedTabs) {
          if (t?.id != null) tabById.set(String(t.id), t);
        }
        const groupById = new Map();
        for (const g of pinnedGroups) {
          if (g?.id != null) groupById.set(String(g.id), g);
        }
        const orderItems =
          boot.pinnedSidebarOrder ||
          boot.settings?.pinnedSidebarOrder ||
          null;
        return {
          ready: true,
          favorites: Array.isArray(boot.favorites) ? boot.favorites : [],
          pinned: buildPinnedFromOrder(
            orderItems,
            tabById,
            groupById,
            pinnedTabs,
            pinnedGroups
          ),
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
      for (const fav of favs.slice(0, 24)) {
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

      const pinnedRows = data.pinned.slice(0, PREVIEW_MAX_PINNED_ROWS);
      for (const item of pinnedRows) appendItem(item);
      if (data.pinned.length > pinnedRows.length) {
        const more = document.createElement('div');
        more.className = 'tab pinned closed axis-profile-preview-more';
        more.innerHTML = `<div class="tab-content"><div class="tab-left"><span class="tab-title">+${data.pinned.length - pinnedRows.length} more pinned</span></div></div>`;
        container.appendChild(more);
      }
      this._appendPreviewSidebarChrome(container, data.pinned.length > 0);
      const unpinnedRows = data.unpinned.slice(0, PREVIEW_MAX_UNPINNED_ROWS);
      for (const item of unpinnedRows) appendItem(item);
      if (data.unpinned.length > unpinnedRows.length) {
        const more = document.createElement('div');
        more.className = 'tab axis-profile-preview-more';
        more.innerHTML = `<div class="tab-content"><div class="tab-left"><span class="tab-title">+${data.unpinned.length - unpinnedRows.length} more</span></div></div>`;
        container.appendChild(more);
      }

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
      const preview = (this._profilePreviewEls || []).find(
        (el) => el?.dataset?.previewFor === pid
      );
      if (!preview?.isConnected) return;
      const old = preview.querySelector('.tabs-section');
      const { section } = this._buildPreviewSection(pid);
      if (old) preview.replaceChild(section, old);
      else preview.appendChild(section);
    },

    _warmNeighborPreviewSectionCache(profileId) {
      const pid = sanitizeProfileId(profileId);
      if (!pid) return;
      if (!this._profilePreviewSectionCache) this._profilePreviewSectionCache = new Map();
      if (this._profilePreviewSectionCache.has(pid)) return;
      const { section, ready } = this._buildPreviewSection(pid);
      if (ready && section) this._profilePreviewSectionCache.set(pid, section.cloneNode(true));
    },

    _cloneCachedPreviewSection(profileId) {
      const pid = sanitizeProfileId(profileId);
      const cached = this._profilePreviewSectionCache?.get(pid);
      return cached ? cached.cloneNode(true) : null;
    },

    /** Fill deferred preview panes as the finger approaches them (avoids engage hitch). */
    _fillPreviewPaneContent(preview) {
      if (!preview?.dataset?.previewFor) return;
      if (preview.dataset.deferredContent !== '1') return;
      delete preview.dataset.deferredContent;
      const pid = preview.dataset.previewFor;
      const cloned = this._cloneCachedPreviewSection(pid);
      if (cloned) {
        preview.replaceChildren(cloned);
        preview.dataset.needsHydration = '0';
        return;
      }
      const { section, ready } = this._buildPreviewSection(pid);
      preview.replaceChildren(section);
      preview.dataset.needsHydration = ready ? '0' : '1';
      if (ready) this._profilePreviewSectionCache?.set(pid, section.cloneNode(true));
      if (!ready) void this._hydratePreviewPane(pid);
    },

    _ensurePreviewContentForTravel(travel) {
      const previews = this._profilePreviewEls;
      if (!previews?.length) return;
      /* Keep the current pane + one ahead filled so the next profile is ready before you land. */
      const needThrough = Math.min(
        previews.length - 1,
        travel < 0.04 ? 0 : Math.max(0, Math.ceil(travel + 0.45))
      );
      if (needThrough <= (this._lastPreviewFillThrough ?? -1)) return;
      this._lastPreviewFillThrough = needThrough;
      for (let i = 0; i <= needThrough; i++) {
        this._fillPreviewPaneContent(previews[i]);
      }
    },

    /** Build profile preview panes in the swipe direction (one for shortcuts, many for wheel). */
    _buildProfilePreviewPane(direction, targetId, { singleStep = false } = {}) {
      this._destroyProfilePreviewPane();
      const track = this._track();
      const live = this._slidePane();
      if (!track || !live || !targetId) return false;
      const ids = [];
      let cursor = sanitizeProfileId(this.profileId);
      while (cursor) {
        const next = this._adjacentProfileIdFrom(cursor, direction);
        if (!next) break;
        ids.push(next);
        cursor = next;
        /* Keyboard/menu: only the next profile. Trackpad: every profile in that direction. */
        if (singleStep) break;
      }
      if (!ids.length) return false;

      const eager = singleStep ? ids.length : Math.min(ids.length, PREVIEW_EAGER_PANES);
      const previews = ids.map((pid, index) => {
        const preview = document.createElement('div');
        preview.className = 'sidebar-profile-pane sidebar-profile-pane--preview';
        preview.setAttribute('aria-hidden', 'true');
        preview.dataset.previewFor = pid;
        if (index < eager) {
          const cloned = this._cloneCachedPreviewSection(pid);
          if (cloned) {
            preview.appendChild(cloned);
            preview.dataset.needsHydration = '0';
          } else if (singleStep) {
            /* Empty shell on engage — fill after the track moves so the gesture stays instant. */
            preview.dataset.deferredContent = '1';
            preview.dataset.needsHydration = '0';
          } else {
            const { section, ready } = this._buildPreviewSection(pid);
            preview.appendChild(section);
            preview.dataset.needsHydration = ready ? '0' : '1';
            if (ready) this._profilePreviewSectionCache?.set(pid, section.cloneNode(true));
          }
        } else {
          /* Cheap empty shell - tab DOM fills in as travel approaches this pane. */
          preview.dataset.deferredContent = '1';
          preview.dataset.needsHydration = '0';
        }
        return preview;
      });

      if (direction > 0) {
        previews.forEach((preview) => track.appendChild(preview));
      } else {
        [...previews].reverse().forEach((preview) => track.insertBefore(preview, live));
      }

      track.classList.add('axis-sidebar-coupled', 'axis-sidebar-coupled-duo');
      this._profilePreviewEl = previews[0];
      this._profilePreviewEls = previews;
      this._swipeTargetIds = ids;
      this._coupledPaneCount = ids.length + 1;
      track.style.setProperty('--axis-swipe-pane-count', String(this._coupledPaneCount));
      this._coupledDirection = direction;
      previews
        .filter((preview) => preview.dataset.needsHydration === '1')
        .forEach((preview) => void this._hydratePreviewPane(preview.dataset.previewFor));
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
      const track = this._track();
      track?.classList.remove('axis-sidebar-coupled-duo');
      track?.style.removeProperty('--axis-swipe-pane-count');
      this._profilePreviewEls = null;
      this._swipeTargetIds = null;
      this._coupledPaneCount = 2;
      this._coupledDirection = 0;
      this._lastPreviewFillThrough = -1;
    },

    /** Arm the coupled slide: stage ready, neighbor preview built, drag classes on. */
    _beginCoupledTransition(direction, targetId, { singleStep = false, skipTheme = false } = {}) {
      const pid = sanitizeProfileId(targetId);
      const track = this._track();
      const reuseCarousel =
        !!track &&
        !!pid &&
        track.classList.contains('axis-sidebar-coupled-duo') &&
        this._coupledDirection === direction &&
        this._profilePreviewEls?.[0]?.dataset?.previewFor === pid;

      if (!reuseCarousel && this._profileSwipeFinalizing) {
        this._abortInFlightProfileSwitch();
      }
      this._swipeResetGen = (this._swipeResetGen || 0) + 1;
      this._profileSwipeEngageGen = (this._profileSwipeEngageGen || 0) + 1;
      this._ensureSidebarProfileStage();
      if (!reuseCarousel) {
        this._pinSidebarFooterOutsideStage();
        this._pinSidebarTopbarOutsideStage();
      }
      if (!track) return false;
      this._cancelTrackMotion();
      this._coupledDirection = direction;
      const hasNeighbor = reuseCarousel
        ? true
        : targetId
          ? this._buildProfilePreviewPane(direction, targetId, { singleStep })
          : false;
      document.getElementById('sidebar')?.classList.add('is-profile-swiping');
      this._sidebarProfileStage?.classList.add('axis-sidebar-drag-active');
      if (!hasNeighbor) track.classList.add('axis-sidebar-coupled');
      const rest = hasNeighbor ? this._coupledRestOffset(direction) : this._trackOffsetPx || 0;
      this._setTrackTransform(rest, { immediate: true, sideEffects: false });

      if (targetId) {
        const warmIds = this._swipeTargetIds?.length
          ? this._swipeTargetIds
          : [sanitizeProfileId(targetId)];
        const first = warmIds[0];
        const deferredPreview = this._profilePreviewEls?.find(
          (el) => el?.dataset?.deferredContent === '1'
        );
        if (deferredPreview) {
          requestAnimationFrame(() => {
            if (deferredPreview.isConnected && deferredPreview.dataset.deferredContent === '1') {
              this._fillPreviewPaneContent(deferredPreview);
            }
          });
        }
        if (first) {
          const warm = () => {
            void this._prefetchProfileBootstrap?.(first);
            this._warmNeighborPreviewSectionCache(first);
          };
          if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(warm, { timeout: 160 });
          } else {
            setTimeout(warm, 0);
          }
        }
        if (!skipTheme) {
          this._armProfileSwipeShellTheme(targetId);
        }
      } else {
        this._clearProfileSwipeShellThemeState();
      }
      return hasNeighbor;
    },

    async _resetCoupledTransition(animate = true, releaseVelocity = 0) {
      const gen = (this._swipeResetGen = (this._swipeResetGen || 0) + 1);
      const track = this._track();
      const direction = this._coupledDirection || 1;
      const coupled = track?.classList.contains('axis-sidebar-coupled-duo');
      const target = coupled ? this._coupledRestOffset(direction) : 0;
      if (animate) {
        await this._animateTrackSettle(target, { mode: 'snap', velocity: releaseVelocity });
      }
      /* A new swipe grabbed the track mid snap-back — its carousel must survive. */
      if (gen !== this._swipeResetGen) return;
      this._clearProfileSwipeShellThemeState(true);
      this._resetProfileSwipeCompositorLayers();
      this.updatePinnedSeparatorVisibility?.();
    },

    /**
     * After a committed swipe the live pane already holds the target profile.
     * Pin the theme, collapse the carousel in one turn, peel the overlay, apply chrome - all
     * synchronously so tabs never blank out.
     */
    _finalizeCoupledTransition(activated) {
      if (this._swipeShellToPack) {
        this.setProfileSwipeThemeMix?.(1, this._swipeShellFromPack, this._swipeShellToPack);
        this._paintRealThemeFromSwipePack?.(this._swipeShellToPack);
      }

      /*
       * Keep the live pane hidden until the track is snapped and the preview is gone.
       * Paint live chrome while the overlay still covers, then peel - avoids an opaque flash.
       */
      this._resetProfileSwipeCompositorLayers();
      this.updatePinnedSeparatorVisibility?.();
      this._clearProfileSidebarTabDragVisuals();
      this._applyProfileChromeImmediate?.(activated, { deferShellTheme: !!this._swipeShellToPack });
      this._clearProfileSwipeShellThemeState(false);
      this._revealProfileSwitchSidebar();
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

    /** Reattach pooled tab/group nodes in preserved DOM order - no full sidebar rebuild. */
    _restorePooledSidebar(profileId) {
      const pool = this.getProfileDomPool(profileId);
      const container = document.getElementById('tabs-container');
      const separator = document.getElementById('tabs-separator');
      const newTabBtn = document.getElementById('sidebar-new-tab-btn');
      if (!pool || !container || !separator || pool.childElementCount === 0) return false;

      this.cacheDOMElements?.();

      const nodes = Array.from(pool.children);
      const tabNodeById = new Map();
      const groupNodeById = new Map();
      const unpinnedNodes = [];

      for (const node of nodes) {
        node.classList?.remove('smooth-dragging', 'drag-sliding', 'dragging');
        node.style?.removeProperty('transform');
        node.style?.removeProperty('transition');
        if (this._isSidebarNodeUnpinned(node)) {
          unpinnedNodes.push(node);
          continue;
        }
        if (node.classList?.contains('tab-group')) {
          const gid = node.dataset?.tabGroupId;
          if (gid != null) {
            groupNodeById.set(String(gid), node);
            groupNodeById.set(String(Number(gid)), node);
          }
        } else if (node.classList?.contains('tab')) {
          const tid =
            typeof this._normalizeTabMapKey === 'function'
              ? this._normalizeTabMapKey(node.dataset?.tabId)
              : node.dataset?.tabId;
          if (tid != null) tabNodeById.set(tid, node);
        }
      }

      /*
       * Keep park-time DOM order for pinned and unpinned. Rebuilding from saved lists
       * (or Map order) made the swipe preview and the landed sidebar disagree for a beat.
       */
      const pinnedFrag = document.createDocumentFragment();
      const used = new Set();
      for (const node of nodes) {
        if (this._isSidebarNodeUnpinned(node) || used.has(node)) continue;
        pinnedFrag.appendChild(node);
        used.add(node);
      }
      /* If anything was missed (e.g. classified after the first pass), append stably. */
      for (const node of tabNodeById.values()) {
        if (!used.has(node)) {
          pinnedFrag.appendChild(node);
          used.add(node);
        }
      }
      for (const node of groupNodeById.values()) {
        if (!used.has(node)) {
          pinnedFrag.appendChild(node);
          used.add(node);
        }
      }

      const unpinnedFrag = document.createDocumentFragment();
      for (const node of unpinnedNodes) {
        unpinnedFrag.appendChild(node);
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
        /* Profile switches must use saved order, not a half-mounted DOM preference. */
        this.syncSidebarFromTabGroups?.({ preferDom: opts.preferDom === true });
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
        /* Stamp + hide outgoing guests before this.tabs swaps - otherwise profile-switch
         * purge treats them as orphans and destroys the pages (broken when you swipe back). */
        for (const tab of this.tabs?.values?.() || []) {
          const wv = tab?.webview;
          if (!wv) continue;
          try {
            wv.dataset.axisProfile = fromPid;
            wv.classList.add('axis-profile-webview-suspended');
          } catch (_) {}
        }
      }

      this.profileId = pid;
      this.tabs = state.tabs || new Map();
      this.tabGroups = state.tabGroups || new Map();
      this.currentTab = state.currentTab ?? null;
      /* Per-profile chat-open map - avoids leaving AI chat open on another profile's tab id. */
      this.aiChatPanelOpenByTabId =
        state.aiChatPanelOpenByTabId instanceof Map
          ? new Map(state.aiChatPanelOpenByTabId)
          : new Map();
      this.aiChatMessagesByTabId =
        state.aiChatMessagesByTabId instanceof Map
          ? new Map(
              Array.from(state.aiChatMessagesByTabId.entries()).map(([k, v]) => [
                k,
                Array.isArray(v) ? v.map((m) => ({ ...m })) : []
              ])
            )
          : new Map();
      this.aiChatMessages = Array.isArray(state.aiChatMessages)
        ? state.aiChatMessages.map((m) => ({ ...m }))
        : [];
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
      this.settings = this._cloneSettingsForProfileRuntime?.(state.settings) || {};
      this._ntpWidgetStructureKeyCached = '';
      this._ntpWidgetLayout = null;
      if (Array.isArray(state.pinnedSidebarOrder) && state.pinnedSidebarOrder.length) {
        this.settings.pinnedSidebarOrder = state.pinnedSidebarOrder.map((item) => ({
          type: item.type,
          id: item.id
        }));
      }
      this.windowProfileIcon = state.windowProfileIcon ?? this.windowProfileIcon;
      /*
       * Keep an active PiP / cross-profile mini-player guest across the switch.
       * Incoming runtime state often has no dock; wiping here made closing PiP
       * unable to reopen the sidebar mini player for the other profile’s tab.
       */
      const keepCrossMedia =
        this.pipWebview ||
        this._crossProfileMediaGuest?.webview ||
        (this._sidebarMediaDock?.webview && !this.tabs?.has?.(this._normalizeTabMapKey?.(this._sidebarMediaDock.tabId)));
      if (!keepCrossMedia) {
        this._sidebarMediaDock = state.sidebarMediaDock || null;
      } else if (state.sidebarMediaDock && !this._sidebarMediaDock) {
        this._sidebarMediaDock = state.sidebarMediaDock;
      }
      this.applySidebarPosition?.();
      // Profiles can store different UI languages; apply immediately so chrome
      // and AxisI18n do not stay on the previous profile's locale.
      // Skip heavy New Tab widget rebuild here - _endProfileNtpIsolation does one clean pass.
      try {
        const s = this.settings || {};
        if (s.universalBrowserLanguage && s.universalUiLanguage) {
          s.uiLanguage = s.universalUiLanguage;
        } else if (!s.universalBrowserLanguage && s.profileUiLanguage) {
          s.uiLanguage = s.profileUiLanguage;
        }
        this.applyUiLanguage?.(s.uiLanguage, { skipNtpWidgets: true });
        if (s.universalBrowserFont && s.universalUiFont) {
          s.uiFont = s.universalUiFont;
        } else if (!s.universalBrowserFont && s.profileUiFont) {
          s.uiFont = s.profileUiFont;
        }
        this.applyUiFont?.(s.uiFont);
      } catch (_) {}
      this.syncAiProviderFromSettings?.();

      const restored = fast && this._restorePooledSidebar(pid);
      this._clearDetachedTabElementPool?.();
      this._purgeOrphanSidebarNodes?.();
      this._relinkFavoriteRuntimeTabs?.();
      /*
       * After a successful pool restore, do not rebuild the sidebar - that redraw is what
       * made order look wrong for a frame after the swipe preview. Only refresh chrome and
       * keep settings aligned with the parked DOM the user already saw.
       */
      if (restored) {
        this._syncTabGroupsPresentationFromState?.();
        this.updatePinnedSeparatorVisibility?.();
        this.updateEmptyState?.();
        this.renderFavorites?.();
        try {
          if (
            typeof this._collectUnpinnedTabsPayload === 'function' &&
            this._shouldPersistUnpinnedItems?.('profile-switch')
          ) {
            this.settings.unpinnedTabs =
              this._collectUnpinnedTabsPayload({ context: 'profile-switch' }) || [];
          }
          this._rememberPinnedSidebarOrder?.();
          const runtime = this._profileRuntime?.get(pid);
          if (runtime) {
            runtime.settings = this._cloneSettingsForProfileRuntime?.(this.settings) || runtime.settings;
            if (Array.isArray(this.settings?.pinnedSidebarOrder)) {
              runtime.pinnedSidebarOrder = this.settings.pinnedSidebarOrder.map((item) => ({
                ...item
              }));
            }
            if (Array.isArray(this.settings?.unpinnedTabs)) {
              runtime.unpinnedSidebarOrder = this.settings.unpinnedTabs.map((row, index) => ({
                id: this._normalizeTabMapKey?.(row?.id) ?? row?.id,
                order: typeof row?.order === 'number' ? row.order : index
              }));
            }
          }
        } catch (_) {}
      } else {
        this._syncProfileSidebarDom({ setupDrag: false, preferDom: false });
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

    /**
     * Deep-ish clone of profile settings for the runtime cache so New Tab widgets
     * (and similar nested objects) cannot leak across profiles by shared reference.
     */
    _cloneSettingsForProfileRuntime(settings) {
      if (!settings || typeof settings !== 'object') return {};
      const out = { ...settings };
      if (Array.isArray(settings.ntpWidgetLayout)) {
        out.ntpWidgetLayout = settings.ntpWidgetLayout.map((w) =>
          w && typeof w === 'object'
            ? {
                ...w,
                config:
                  w.config && typeof w.config === 'object' && !Array.isArray(w.config)
                    ? { ...w.config }
                    : {}
              }
            : w
        );
      }
      if (Array.isArray(settings.unpinnedTabs)) {
        out.unpinnedTabs = settings.unpinnedTabs.map((t) =>
          t && typeof t === 'object' ? { ...t } : t
        );
      }
      if (Array.isArray(settings.pinnedSidebarOrder)) {
        out.pinnedSidebarOrder = settings.pinnedSidebarOrder.map((item) =>
          item && typeof item === 'object' ? { ...item } : item
        );
      }
      if (Array.isArray(settings.pinnedTabs)) {
        out.pinnedTabs = settings.pinnedTabs.map((t) =>
          t && typeof t === 'object' ? { ...t } : t
        );
      }
      if (Array.isArray(settings.favorites)) {
        out.favorites = settings.favorites.map((f) =>
          f && typeof f === 'object' ? { ...f } : f
        );
      }
      if (Array.isArray(settings.tabGroups)) {
        out.tabGroups = settings.tabGroups.map((g) =>
          g && typeof g === 'object'
            ? {
                ...g,
                tabIds: Array.isArray(g.tabIds) ? [...g.tabIds] : []
              }
            : g
        );
      }
      return out;
    },

    _beginProfileNtpIsolation() {
      this._suppressNtpWidgetPersist = true;
      this._profileNtpIsolating = true;
      this._uiLanguageApplyGen = (this._uiLanguageApplyGen || 0) + 1;
      this._ntpWidgetStructureKeyCached = '';
      this._ntpWidgetLayout = null;
      try {
        const grid = document.getElementById('ntp-widgets-grid');
        if (grid) grid.innerHTML = '';
      } catch (_) {}
    },

    _endProfileNtpIsolation() {
      this._profileNtpIsolating = false;
      this._suppressNtpWidgetPersist = false;
      this._ntpWidgetStructureKeyCached = '';
      try {
        // Drop stale localized city labels from the previous profile's language.
        const layout = this.settings?.ntpWidgetLayout;
        if (Array.isArray(layout)) {
          for (const w of layout) {
            if (w?.config && typeof w.config === 'object' && w.config._localizedCity) {
              const next = { ...w.config };
              delete next._localizedCity;
              w.config = next;
            }
          }
        }
      } catch (_) {}
      try {
        this._ntpWidgetLayout = this.getNtpWidgetLayout?.() || [];
      } catch (_) {
        this._ntpWidgetLayout = [];
      }
      try {
        const catalog = document.getElementById('ntp-widget-catalog');
        if (catalog) delete catalog.dataset.built;
        this._buildNtpWidgetCatalog?.();
      } catch (_) {}
      try {
        // One clean language + New Tab pass for the profile we landed on.
        this.applyUiLanguage?.(this.settings?.uiLanguage, { skipNtpWidgets: false });
      } catch (_) {
        try {
          const ntpTab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
          if (ntpTab?.url === this.NEWTAB_URL) {
            this.applyNewTabCustomization?.();
          } else {
            this.syncNtpWidgetsVisibility?.();
            const grid = document.getElementById('ntp-widgets-grid');
            if (grid && this.settings?.ntpWidgetsEnabled !== true) {
              grid.innerHTML = '';
            }
          }
        } catch (_) {}
      }
      try {
        this.applyUiFont?.(this.settings?.uiFont);
      } catch (_) {}
    },

    _snapshotRunningProfile() {
      const pid = sanitizeProfileId(this.profileId);

      this._beginProfileNtpIsolation?.();

      if (this.currentTab != null) {
        this._persistUrlBarChromeToTab?.(this.currentTab);
        this._persistSidebarChatForTab?.(this.currentTab);
        const curTab = this.tabs.get(this.currentTab);
        if (curTab?.url === this.NEWTAB_URL) {
          this.saveNewTabPageStateToTab?.(this.currentTab);
        }
      }

      /*
       * Capture the live sidebar organization before parking. Runtime Maps do not
       * preserve visual order - without this, switch-away/back reshuffles tabs.
       */
      try {
        if (!this.settings || typeof this.settings !== 'object') this.settings = {};
        this._rememberPinnedSidebarOrder?.();
        if (
          typeof this._collectUnpinnedTabsPayload === 'function' &&
          this._shouldPersistUnpinnedItems?.('profile-switch')
        ) {
          this.settings.unpinnedTabs =
            this._collectUnpinnedTabsPayload({ context: 'profile-switch' }) || [];
        }
      } catch (_) {}

      const pinnedSidebarOrder =
        (Array.isArray(this.settings?.pinnedSidebarOrder) && this.settings.pinnedSidebarOrder.length
          ? this.settings.pinnedSidebarOrder
          : this._rememberPinnedSidebarOrder?.()) || [];
      const unpinnedSidebarOrder = Array.isArray(this.settings?.unpinnedTabs)
        ? this.settings.unpinnedTabs.map((row, index) => ({
            id: this._normalizeTabMapKey?.(row?.id) ?? row?.id,
            order: typeof row?.order === 'number' ? row.order : index
          }))
        : (this._readUnpinnedSidebarOrderFromDom?.() || []).map((item, index) => ({
            id: item.id,
            order: index
          }));

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
        aiChatPanelOpenByTabId:
          this.aiChatPanelOpenByTabId instanceof Map
            ? new Map(this.aiChatPanelOpenByTabId)
            : new Map(),
        aiChatMessagesByTabId:
          this.aiChatMessagesByTabId instanceof Map
            ? new Map(
                Array.from(this.aiChatMessagesByTabId.entries()).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v.map((m) => ({ ...m })) : []
                ])
              )
            : new Map(),
        aiChatMessages: Array.isArray(this.aiChatMessages)
          ? this.aiChatMessages.map((m) => ({ ...m }))
          : [],
        favorites: Array.isArray(this.favorites) ? this.favorites.map((f) => ({ ...f })) : [],
        settings: this._cloneSettingsForProfileRuntime?.(this.settings) || {},
        pinnedSidebarOrder: pinnedSidebarOrder.map((item) => ({
          type: item.type,
          id: item.id
        })),
        unpinnedSidebarOrder,
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
      const pinnedSidebarOrder = Array.isArray(state.pinnedSidebarOrder)
        ? state.pinnedSidebarOrder.map((item) => ({ type: item.type, id: item.id }))
        : Array.isArray(state.settings?.pinnedSidebarOrder)
          ? state.settings.pinnedSidebarOrder.map((item) => ({ type: item.type, id: item.id }))
          : [];
      const orderIndex = new Map();
      pinnedSidebarOrder.forEach((item, index) => {
        if (!item) return;
        orderIndex.set(`${item.type}:${item.id}`, index);
      });

      const pinnedTabs = [];
      const unpinnedTabs = [];
      let pinnedOrder = 0;
      let unpinnedOrder = 0;
      const loosePinned = [];
      const looseUnpinned = [];
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
          loosePinned.push(payload);
        } else if (!tab.pinned && !tab.tabGroupId && keepUnpinned) {
          looseUnpinned.push(payload);
        }
      }
      loosePinned
        .sort((a, b) => {
          const ao = orderIndex.has(`tab:${a.id}`)
            ? orderIndex.get(`tab:${a.id}`)
            : Number.MAX_SAFE_INTEGER;
          const bo = orderIndex.has(`tab:${b.id}`)
            ? orderIndex.get(`tab:${b.id}`)
            : Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          return String(a.id).localeCompare(String(b.id));
        })
        .forEach((payload) => {
          payload.order = pinnedOrder++;
          pinnedTabs.push(payload);
        });

      /* Prefer captured sidebar order - never Map insertion order. */
      const unpinnedOrderById = new Map();
      const savedUnpinned =
        (Array.isArray(state.unpinnedSidebarOrder) && state.unpinnedSidebarOrder.length
          ? state.unpinnedSidebarOrder
          : null) ||
        (Array.isArray(state.settings?.unpinnedTabs) ? state.settings.unpinnedTabs : []);
      savedUnpinned.forEach((row, index) => {
        const id = this._normalizeTabMapKey?.(row?.id) ?? row?.id;
        if (id == null) return;
        unpinnedOrderById.set(id, typeof row.order === 'number' ? row.order : index);
      });
      looseUnpinned
        .sort((a, b) => {
          const ao = unpinnedOrderById.has(a.id)
            ? unpinnedOrderById.get(a.id)
            : Number.MAX_SAFE_INTEGER;
          const bo = unpinnedOrderById.has(b.id)
            ? unpinnedOrderById.get(b.id)
            : Number.MAX_SAFE_INTEGER;
          if (ao !== bo) return ao - bo;
          return String(a.id).localeCompare(String(b.id));
        })
        .forEach((payload) => {
          payload.order = unpinnedOrder++;
          unpinnedTabs.push(payload);
        });

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
        const groupOrderIds = pinnedSidebarOrder
          .filter((item) => item?.type === 'group')
          .map((item) => item.id);
        const sidebarGroupOrd = groupOrderIds.findIndex(
          (id) => String(id) === String(group.id)
        );
        tabGroups.push({
          id: group.id,
          name: group.name,
          tabIds,
          tabs,
          open: group.open !== false,
          order: sidebarGroupOrd >= 0 ? sidebarGroupOrd : group.order,
          color: group.color || '#FF6B6B',
          pinned: group.pinned !== false,
          icon: group.icon || null,
          iconType: group.iconType || null,
          hadTabs: group.hadTabs === true || tabIds.length > 0
        });
      }
      tabGroups.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      tabGroups.forEach((g, index) => {
        g.order = index;
      });

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
          pinnedSidebarOrder,
          clearUnpinnedRecovery: false
        },
        pinnedTabs,
        tabGroups,
        unpinnedTabs: keepUnpinned ? unpinnedTabs : [],
        pinnedSidebarOrder,
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
      /* Shared New Tab overlay belongs to the outgoing profile until switchToTab remounts it. */
      hide('new-tab-page');
      this._ntpUiBoundTabId = null;
      this.elements?.vaultAutofillPanel?.classList?.add('hidden');
      this.elements?.vaultSaveModal?.classList?.add('hidden');
      this.elements?.vaultPickModal?.classList?.add('hidden');
      /* Instantly clear chat chrome - switchToTab restores per-tab state without a close slide. */
      this.syncAIChatPanelForCurrentTab?.({ animate: false });
    },

    _commitProfileWebview(profileId = this.profileId) {
      const pid = sanitizeProfileId(profileId);
      const container = document.getElementById('webviews-container');
      if (container) {
        for (const wv of container.querySelectorAll('webview')) {
          const wvPid = sanitizeProfileId(wv.dataset?.axisProfile || '');
          if (wvPid === pid) continue;
          try {
            wv.classList.add('axis-profile-webview-suspended', 'inactive');
            wv.style.setProperty('visibility', 'hidden', 'important');
            wv.style.setProperty('pointer-events', 'none', 'important');
            wv.style.setProperty('opacity', '0', 'important');
          } catch (_) {}
        }
      }
      /*
       * Show this profile’s pages; keep foreign PiP / mini-player guests process-alive but
       * hidden. Never re-hide a guest that belongs to the profile we just entered - that
       * left the site blank when switching away and back.
       */
      this._showWebviewsForProfile(pid);

      const currentWebviews = new Set();
      for (const tab of this.tabs?.values?.() || []) {
        if (tab?.webview) currentWebviews.add(tab.webview);
      }
      const mediaGuests = [
        this.pipWebview,
        this._crossProfileMediaGuest?.webview,
        this._sidebarMediaDock?.webview
      ].filter(Boolean);
      mediaGuests.forEach((wv) => {
        if (currentWebviews.has(wv)) return;
        try {
          wv.classList.add('axis-profile-webview-suspended');
          this._ensureBackgroundMediaPlayback?.(wv, null);
        } catch (_) {}
      });

      if (
        this._crossProfileMediaGuest &&
        sanitizeProfileId(this._crossProfileMediaGuest.profileId) === pid
      ) {
        this._crossProfileMediaGuest = null;
      }

      /* Force the shared NTP overlay to rebind for this profile’s current tab. */
      this._ntpUiBoundTabId = null;
      this._resetNewTabPageOnShow = true;

      if (this.currentTab != null && this.tabs.has(this.currentTab)) {
        this.switchToTab?.(this.currentTab, { fromProfileSwitch: true });
      } else {
        this._hideShellPanelsForProfileSwitch();
        this.updateNewTabPageVisibility?.(false);
        this.updateUrlBar?.(null);
        this._hideAllWebviewsForNewTabPage?.();
        this.updateEmptyState?.();
        this._ensureActiveWebviewInteractable?.();
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

      /* Always prefer a fresh store read - cached bootstrap can predate tabs added later. */
      let boot = null;
      try {
        boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        if (boot?.settings) this._profileBootstrapCache?.set(pid, boot);
        else this._profileBootstrapCache?.delete(pid);
      } catch (_) {
        boot = this._profileBootstrapCache?.get(pid) || null;
      }
      if (boot?.settings) {
        this.settings = this._cloneSettingsForProfileRuntime?.(boot.settings) || { ...boot.settings };
        this._ntpWidgetStructureKeyCached = '';
        this._ntpWidgetLayout = null;
        if (Array.isArray(boot.pinnedTabs)) this.settings.pinnedTabs = boot.pinnedTabs;
        if (Array.isArray(boot.tabGroups)) this.settings.tabGroups = boot.tabGroups;
        if (Array.isArray(boot.unpinnedTabs)) this.settings.unpinnedTabs = boot.unpinnedTabs;
        if (Array.isArray(boot.unpinnedTabsRecovery)) {
          this.settings.unpinnedTabsRecovery = boot.unpinnedTabsRecovery;
        }
        if (Array.isArray(boot.favorites)) this.settings.favorites = boot.favorites;
        if (Array.isArray(boot.pinnedSidebarOrder) && boot.pinnedSidebarOrder.length) {
          this.settings.pinnedSidebarOrder = boot.pinnedSidebarOrder;
        } else if (
          Array.isArray(boot.settings?.pinnedSidebarOrder) &&
          boot.settings.pinnedSidebarOrder.length
        ) {
          this.settings.pinnedSidebarOrder = boot.settings.pinnedSidebarOrder;
        }
      } else {
        await this.loadSettings?.();
      }
      this.applySidebarPosition?.();
      try {
        this.applyUiLanguage?.(this.settings?.uiLanguage, { skipNtpWidgets: true });
      } catch (_) {}
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
      this._suppressTabGroupsAutosave = true;
      try {
        await this.loadPinnedTabs?.();
        await this.loadTabGroups?.();
        await this.loadUnpinnedTabs?.({ context: 'profile-switch' });
      } finally {
        this._suppressTabGroupsAutosave = false;
      }

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

    /** Shell + URL bar tint - sync, before webview commit or sidebar slide. */
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
        try {
          this.applyUiLanguage?.(this.settings?.uiLanguage, { skipNtpWidgets: true });
        } catch (_) {}
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
        this._endProfileNtpIsolation?.();
      } catch (e) {
        console.error('profile chrome apply failed', e);
        try {
          this._endProfileNtpIsolation?.();
        } catch (_) {}
      }
    },

    _cancelSidebarSlideAnimation() {
      const keepCoupledTrack =
        !!this._profileSwipeFinalizing || this._isTrackAnimating() || !!this._activeSpringPromise;
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

    /** Slide the outgoing tab list off-screen - runs immediately, even on first switch (no runtime cache). */
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
            '#clear-unpinned-floating, .sidebar-tabs-topbar, #profile-switcher-menu, #profile-switch-row-menu, .profile-switch-more-btn, #sidebar-profile-footer, .sidebar-footer, .sidebar-media-dock, #sidebar-update-banner'
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

      const liveTabsContainer = () =>
        document.querySelector(
          '#sidebar-profile-swipe-track .sidebar-profile-pane--live .tabs-container'
        ) || document.getElementById('tabs-container');

      /** True when the tab list can still move further in this wheel's vertical direction. */
      const tabsCanScrollWithDeltaY = (deltaY) => {
        const el = liveTabsContainer();
        if (!el || !Number.isFinite(deltaY) || deltaY === 0) return false;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 1) return false;
        if (deltaY > 0) return el.scrollTop < max - 0.5;
        return el.scrollTop > 0.5;
      };

      const abortUnengagedWheelSwipe = () => {
        const ws = this._wheelSwipe;
        if (!ws || ws.engaged || ws.settling) return;
        this._clearProfileWheelFinishTimers(ws);
        this._wheelSwipe = null;
      };

      /** Tab reorder uses mouse drag - profile switch is trackpad wheel only. */
      this._cancelProfilePointerSwipe = () => {};

      const extendMomentumLock = () => {
        this._profileWheelMomentumLock = true;
        clearTimeout(this._profileWheelMomentumTimer);
        this._profileWheelMomentumTimer = setTimeout(() => {
          this._profileWheelMomentumLock = false;
        }, WHEEL_MOMENTUM_QUIET_MS);
      };

      /* ---- Trackpad: continuous 1:1 carousel across all profiles ---- */
      const finishWheel = () => {
        const ws = this._wheelSwipe;
        if (!ws || ws.settling) return;
        ws.settling = true;
        this._wheelSwipe = null;
        this._clearProfileWheelFinishTimers(ws);
        if (!ws.engaged) {
          this._clearProfileSwipeShellThemeState();
          this._resetProfileSwipeCompositorLayers();
          return;
        }
        extendMomentumLock();
        this._flushCoalescedTrackTransform();
        this._flushTrackTransform();
        const progress = this._profileSwipeProgressFromOffset(this._trackOffsetPx || 0, ws.direction);
        const releaseVel = ws.vel || 0;
        const targets = this._swipeTargetIds || [ws.targetId];
        const commit = this._shouldCommitProfileWheel(ws, progress);
        if (commit) {
          const targetId = targets[0] || ws.targetId;
          const preview = this._profilePreviewEls?.[0];
          if (preview) this._fillPreviewPaneContent(preview);
          /*
           * Do not settle-hide the live (outgoing) pane here. That blanked the profile
           * you were leaving whenever the preview had not fully covered the stage yet.
           * Interactive commit mounts the target only after the spring finishes (live
           * off-screen), then snaps the track back.
           */
          const fullOffset = this._coupledFullOffset(ws.direction, 1);
          const releaseSpringPromise = this._animateTrackSettle(fullOffset, {
            mode: 'commit',
            velocity: releaseVel
          });
          void this.switchToProfileId(targetId, {
            animate: true,
            direction: ws.direction,
            interactive: true,
            releaseVelocity: releaseVel,
            releaseSpringPromise
          });
        } else {
          void this._resetCoupledTransition(true);
        }
      };
      this._profileWheelFinishHandler = finishWheel;

      const onProfileWheel = (e) => {
        if (this.isIncognitoWindow) return;
        if (this._isProfileSwipeGestureBlocked()) return;
        const sidebar = document.getElementById('sidebar');
        const activeSwipe = this._wheelSwipe;
        if (!activeSwipe?.engaged) {
          if (!sidebar || (sidebar.classList.contains('hidden') && !sidebar.classList.contains('slide-out'))) {
            return;
          }
          const inSidebar =
            (e.target instanceof Node && sidebar.contains(e.target)) ||
            (gestureRoot && e.target instanceof Node && gestureRoot.contains(e.target));
          if (!inSidebar) return;
        }
        const absX = Math.abs(e.deltaX);
        const absY = Math.abs(e.deltaY);
        /*
         * Fast vertical trackpad flicks often carry a little deltaX. Require a clear
         * horizontal bias before stealing the gesture from the tab list scroller.
         */
        const clearlyHorizontal = absX > absY * 1.2 && absX >= WHEEL_START_DELTA_PX;
        const clearlyVertical = absY > absX * 1.12;

        let s = this._wheelSwipe;
        if (!s && this._profileWheelMomentumLock && absX > absY && absX >= 0.12) {
          extendMomentumLock();
          e.preventDefault();
          return;
        }
        if (!s) {
          if (!clearlyHorizontal) return;
          if (shouldIgnoreSwipeTarget(e.target)) return;
          /* Prefer scrolling tabs when the list can still move and this isn't a hard sideways swipe. */
          if (absY > 0.45 && tabsCanScrollWithDeltaY(e.deltaY) && absX < absY * 2.5) {
            return;
          }
          /* Ignore isolated tiny tail ticks; real finger input starts above this floor. */
          if (absX < WHEEL_START_DELTA_PX) return;
          /* Let a new swipe take over a snap-back spring immediately. */
          if (this._isTrackAnimating() && !this._profileSwipeFinalizing) {
            this._cancelTrackMotion();
            this._flushTrackTransform();
          }
          if (this._profileSwipeFinalizing) {
            this._abortInFlightProfileSwitch();
          }
          this._cancelSidebarSlideAnimation();
          s = this._wheelSwipe = {
            direction: 0,
            targetId: null,
            accumX: 0,
            engaged: false,
            vel: 0,
            peakDelta: 0,
            lastTs: performance.now(),
            settling: false,
            endTimer: null
          };
        }
        if (s.settling) return;

        /*
         * Before a profile switch is engaged, never block vertical scrolling. Abort weak
         * / mistaken horizontal sessions so fast tab-list flicks keep working.
         */
        if (!s.engaged) {
          if (clearlyVertical || (absY >= absX && tabsCanScrollWithDeltaY(e.deltaY))) {
            abortUnengagedWheelSwipe();
            return;
          }
          if (!clearlyHorizontal && absX < WHEEL_ENGAGE_PX) {
            abortUnengagedWheelSwipe();
            return;
          }
        }

        e.preventDefault();

        const now = performance.now();
        const dt = Math.max(1, now - s.lastTs);
        const strong = absX >= WHEEL_ACTIVE_DELTA_PX;
        s.peakDelta = Math.max(s.peakDelta || 0, absX);

        if (absX >= 0.12) {
          s.accumX += e.deltaX;
          if (!s.direction && Math.abs(s.accumX) >= WHEEL_ENGAGE_PX) {
            s.direction = s.accumX > 0 ? 1 : -1;
          }
          if (s.direction) {
            s.accumX = this._clampWheelAccum(s.accumX, s.direction);
          }

          const natural = s.direction
            ? this._wheelNaturalPx(s.accumX, s.direction)
            : Math.abs(s.accumX);
          if (!s.engaged && s.direction && natural > WHEEL_ENGAGE_PX) {
            s.targetId = adjacentProfileId(s.direction);
            s.engaged = true;
            this._beginCoupledTransition(s.direction, s.targetId, {
              singleStep: true,
              skipTheme: true
            });
          }
          if (s.engaged) {
            const offset = this._coupledOffsetFor(-s.accumX, s.direction, !!s.targetId, s.targetId);
            this._setTrackTransform(offset, { immediate: true, sideEffects: false });
          }

          if (s.direction && absX >= 0.35) {
            const v = ((s.direction > 0 ? e.deltaX : -e.deltaX)) / dt;
            this._pushSwipeVelocitySample(s, Math.max(0, v));
          } else if (!strong && s.vel) {
            s.vel *= 0.75;
          }
        }

        s.lastTs = now;

        if (s.engaged && absX >= 0.12) {
          /* Fingers lifted: inertia deltas decay smoothly; human motion is noisier. */
          const prev = s.lastAbsX || 0;
          const ratio = prev > 0 ? absX / prev : 0;
          s.decayRun =
            ratio >= WHEEL_MOMENTUM_DECAY_MIN_RATIO && ratio < 1 ? (s.decayRun || 0) + 1 : 0;
          s.lastAbsX = absX;
          if (s.decayRun >= WHEEL_MOMENTUM_DECAY_RUN) {
            finishWheel();
            return;
          }
          this._armProfileWheelIdle(s);
        } else if (!s.engaged && absX >= WHEEL_ACTIVE_DELTA_PX) {
          this._armProfileWheelIdle(s);
        }
      };

      if (gestureRoot.dataset.profileWheelBound !== '1') {
        gestureRoot.dataset.profileWheelBound = '1';
        window.addEventListener('wheel', onProfileWheel, { passive: false, capture: true });
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
        this._persistSidebarChatForTab?.(this.currentTab);
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
        aiChatPanelOpenByTabId:
          this.aiChatPanelOpenByTabId instanceof Map
            ? new Map(this.aiChatPanelOpenByTabId)
            : new Map(),
        aiChatMessagesByTabId:
          this.aiChatMessagesByTabId instanceof Map
            ? new Map(
                Array.from(this.aiChatMessagesByTabId.entries()).map(([k, v]) => [
                  k,
                  Array.isArray(v) ? v.map((m) => ({ ...m })) : []
                ])
              )
            : new Map(),
        aiChatMessages: Array.isArray(this.aiChatMessages)
          ? this.aiChatMessages.map((m) => ({ ...m }))
          : [],
        favorites: Array.isArray(this.favorites) ? this.favorites.map((f) => ({ ...f })) : [],
        settings: this._cloneSettingsForProfileRuntime?.(this.settings) ||
          (this.settings ? { ...this.settings } : {}),
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

    _buildProfileRuntimeFromBootstrap(profileId, boot) {
      if (!boot?.settings) return null;
      const pid = sanitizeProfileId(profileId);
      const tabs = new Map();
      const tabGroups = new Map();

      const addTabFromPayload = (data, { pinned = false, tabGroupId = null } = {}) => {
        if (!data || data.id == null) return null;
        const tabId =
          tabGroupId != null
            ? this._normalizeTabMapKey(data.id)
            : this._createUniqueTabId(data.id);
        if (tabId == null || tabs.has(tabId)) return tabId;
        const inAiChat = this._savedNewTabInAiChatFromPayload?.(data);
        const displayTitle =
          data.customTitle || (inAiChat ? 'AI Chat' : data.title || 'New Tab');
        const resolvedFavicon = data.customIcon
          ? null
          : this.resolveTabFaviconForData?.(data) ||
            (inAiChat ? this.NTP_AI_CHAT_FAVICON : null);
        tabs.set(tabId, {
          id: tabId,
          url: data.url || null,
          title: displayTitle,
          customTitle: data.customTitle || null,
          favicon:
            resolvedFavicon ||
            (inAiChat ? this.NTP_AI_CHAT_FAVICON : data.favicon || null),
          customIcon: data.customIcon || null,
          customIconType: data.customIconType || null,
          canGoBack: false,
          canGoForward: false,
          history: data.url ? [data.url] : [],
          historyIndex: data.url ? 0 : -1,
          pinned: !!pinned,
          tabGroupId,
          savedLinkUrl: pinned ? data.url || null : undefined,
          webview: null,
          closed: pinned ? true : undefined,
          ...(data.newTabPageState ? { newTabPageState: data.newTabPageState } : {}),
          ...(Array.isArray(data.newTabPageState?.askMessageHistory)
            ? {
                newTabAskHistory: data.newTabPageState.askMessageHistory.map((m) => ({
                  role: m.role,
                  content: m.content
                }))
              }
            : {})
        });
        return tabId;
      };

      const pinnedTabs = Array.isArray(boot.pinnedTabs)
        ? [...boot.pinnedTabs].sort((a, b) => (a.order || 0) - (b.order || 0))
        : [];
      for (const t of pinnedTabs) addTabFromPayload(t, { pinned: true });

      const tabGroupsData = Array.isArray(boot.tabGroups) ? boot.tabGroups : [];
      tabGroupsData.forEach((tabGroupData, index) => {
        const savedTabIds = Array.isArray(tabGroupData.tabIds) ? tabGroupData.tabIds : [];
        const savedTabs = Array.isArray(tabGroupData.tabs) ? tabGroupData.tabs : [];
        const hadTabs =
          tabGroupData.hadTabs === true || savedTabIds.length > 0 || savedTabs.length > 0;
        const groupPinned = tabGroupData.pinned !== false;
        const group = {
          id: tabGroupData.id,
          name: tabGroupData.name || `Tab Group ${index + 1}`,
          tabIds: [],
          open: tabGroupData.open !== false,
          order: typeof tabGroupData.order === 'number' ? tabGroupData.order : index,
          color: tabGroupData.color || '#FF6B6B',
          pinned: groupPinned,
          icon: tabGroupData.icon || null,
          iconType: tabGroupData.iconType || null,
          hadTabs
        };

        savedTabs.forEach((saved) => {
          addTabFromPayload(saved, { pinned: groupPinned, tabGroupId: group.id });
        });

        const tabIdSet = new Set();
        savedTabIds.forEach((id) => {
          const nid = this._normalizeTabMapKey(id);
          if (nid != null && tabs.has(nid)) tabIdSet.add(nid);
        });
        savedTabs.forEach((saved) => {
          const nid = this._normalizeTabMapKey(saved?.id);
          if (nid != null && tabs.has(nid)) tabIdSet.add(nid);
        });
        group.tabIds = Array.from(tabIdSet);

        if (group.tabIds.length === 0 && hadTabs) return;

        tabGroups.set(group.id, group);
        group.tabIds.forEach((tabId) => {
          const tab = tabs.get(tabId);
          if (!tab) return;
          tab.tabGroupId = group.id;
          tab.pinned = groupPinned;
          tabs.set(tabId, tab);
        });
      });

      const unpinnedTabs = Array.isArray(boot.unpinnedTabs)
        ? [...boot.unpinnedTabs].sort((a, b) => (a.order || 0) - (b.order || 0))
        : [];
      for (const t of unpinnedTabs) addTabFromPayload(t, { pinned: false });

      const settings = this._cloneSettingsForProfileRuntime?.(boot.settings) || { ...boot.settings };
      if (Array.isArray(boot.pinnedTabs)) settings.pinnedTabs = boot.pinnedTabs;
      if (Array.isArray(boot.tabGroups)) settings.tabGroups = boot.tabGroups;
      if (Array.isArray(boot.unpinnedTabs)) settings.unpinnedTabs = boot.unpinnedTabs;
      if (Array.isArray(boot.unpinnedTabsRecovery)) {
        settings.unpinnedTabsRecovery = boot.unpinnedTabsRecovery;
      }
      if (Array.isArray(boot.favorites)) settings.favorites = boot.favorites;
      const pinnedSidebarOrder =
        Array.isArray(boot.pinnedSidebarOrder) && boot.pinnedSidebarOrder.length
          ? boot.pinnedSidebarOrder
          : Array.isArray(boot.settings?.pinnedSidebarOrder) && boot.settings.pinnedSidebarOrder.length
            ? boot.settings.pinnedSidebarOrder
            : [];
      if (pinnedSidebarOrder.length) settings.pinnedSidebarOrder = pinnedSidebarOrder;

      const favorites =
        Array.isArray(boot.favorites) && typeof this._mapFavoritesFromStore === 'function'
          ? this._mapFavoritesFromStore(boot.favorites)
          : Array.isArray(boot.favorites)
            ? boot.favorites.map((f) => ({ ...f }))
            : [];

      const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === pid);
      const windowProfileIcon = prof?.icon
        ? this.sanitizeProfileIcon?.(prof.icon) || prof.icon
        : undefined;

      return {
        profileId: pid,
        tabs,
        tabGroups,
        currentTab: null,
        recentTabStack: [],
        aiChatPanelOpenByTabId: new Map(),
        aiChatMessagesByTabId: new Map(),
        aiChatMessages: [],
        favorites,
        settings,
        pinnedSidebarOrder: pinnedSidebarOrder.map((item) => ({ type: item.type, id: item.id })),
        windowProfileIcon,
        sidebarMediaDock: null,
        shellChromeSnapshot: null,
        urlBarChromeSnapshot: null
      };
    },

    _storeProfileRuntimeFromBootstrap(profileId, boot) {
      const pid = sanitizeProfileId(profileId);
      if (!pid) return;
      if (!this._profileRuntime) this._profileRuntime = new Map();
      if (this._profileRuntime.has(pid)) return;
      const runtime = this._buildProfileRuntimeFromBootstrap(pid, boot);
      if (runtime) this._profileRuntime.set(pid, runtime);
    },

    async _prefetchProfileBootstrap(profileId) {
      const pid = sanitizeProfileId(profileId);
      if (!pid || pid === sanitizeProfileId(this.profileId)) return;
      if (this._profileRuntime.has(pid)) return;
      if (this._profileBootstrapCache?.has(pid)) {
        this._storeProfileRuntimeFromBootstrap(pid, this._profileBootstrapCache.get(pid));
        this._warmNeighborPreviewSectionCache(pid);
        return;
      }
      if (this._profilePrefetchPending?.has(pid)) return;

      this._profilePrefetchPending.add(pid);
      try {
        const boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        if (boot?.settings) {
          this._profileBootstrapCache.set(pid, boot);
          this._storeProfileRuntimeFromBootstrap(pid, boot);
          this._invalidateProfileSwipeThemePack?.(pid);
          this._themePackForProfile(pid);
          this._warmNeighborPreviewSectionCache(pid);
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
        if (!neighbor) continue;
        this._warmNeighborPreviewSectionCache(neighbor);
        void this._prefetchProfileBootstrap(neighbor);
      }
    },

    async _prepareProfileRuntimeForSwitch(targetId) {
      const pid = sanitizeProfileId(targetId);
      if (!pid || this._profileRuntime?.has(pid)) return;
      /* Never block a swipe on a background persist - warm from bootstrap instead. */
      await this._warmProfileSwipeTarget(pid);
    },

    async _loadTargetProfileState(targetId, cached) {
      const pid = sanitizeProfileId(targetId);
      let runtime = this._profileRuntime?.get(pid) || cached;
      if (!runtime) {
        await this._warmProfileSwipeTarget(pid);
        runtime = this._profileRuntime?.get(pid) || cached;
      }
      if (runtime) {
        this._mountCachedProfile(runtime);
        return runtime;
      }
      const inflight = this._profilePersistInflight?.get(pid);
      if (inflight) {
        try {
          await inflight;
        } catch (_) {}
      }
      await this._activateProfileFromDisk(pid, { deferHeavy: true });
      return null;
    },

    async _warmProfileSwipeTarget(profileId) {
      const pid = sanitizeProfileId(profileId);
      if (!pid || pid === sanitizeProfileId(this.profileId)) return;
      if (this._profileRuntime.has(pid)) return;
      try {
        let boot = this._profileBootstrapCache?.get(pid);
        if (!boot?.settings) {
          boot = await window.electronAPI?.getProfileBootstrap?.(pid);
        }
        if (boot?.settings) {
          this._profileBootstrapCache?.set(pid, boot);
          this._storeProfileRuntimeFromBootstrap(pid, boot);
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

    /**
     * Same as tab switch: if the outgoing profile has a playing video, pop it into
     * native picture-in-picture before that profile’s webviews are suspended.
     * Stash a cross-profile guest so closing PiP can still open the mini player
     * after `this.tabs` belongs to another profile.
     */
    _armPictureInPictureForProfileSwitch() {
      try {
        const tabId = this._normalizeTabMapKey?.(this.currentTab) ?? this.currentTab;
        if (tabId == null) return;
        const tab = this.tabs?.get?.(tabId);
        if (!tab?.webview) return;
        const profileId = sanitizeProfileId(this.profileId);
        const title = tab.customTitle || tab.title || 'Playing media';
        const url = tab.url || '';
        const webview = tab.webview;
        this._pipHandoffTabId = tabId;
        /* Optimistic guest so profile apply / webview suspend do not drop media mid-flight. */
        this._crossProfileMediaGuest = {
          tabId,
          videoIndex: 0,
          webview,
          profileId,
          title,
          url
        };
        void Promise.resolve(this.checkAndShowPIP?.(tabId, webview, { leaveTab: true })).then((ok) => {
          this._pipHandoffTabId = null;
          if (!ok) {
            if (this._crossProfileMediaGuest?.webview === webview) {
              this._crossProfileMediaGuest = null;
            }
            return;
          }
          this._crossProfileMediaGuest = {
            tabId,
            videoIndex: Number(this.pipVideoIndex) || 0,
            webview,
            profileId,
            title,
            url
          };
        });
      } catch (_) {}
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

      try {
        this._armPictureInPictureForProfileSwitch();
        this._snapshotRunningProfile();
        const captured = this._captureOutgoingPersistPayloadForSwitch(outId);
        await this._persistOutgoingAndSwitchMain(id, outId, captured);
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
          this._finalizeCoupledTransition(activated);
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
      const epoch = opts.epoch ?? this._bumpProfileSwitchEpoch();
      let completed = false;

      const slidePromise =
        opts.releaseSpringPromise || this._startProfileReleaseSpring(direction, releaseVelocity);

      this.hideProfileSwitcherMenu?.();

      /* Pop PiP out while the outgoing profile’s video guest is still alive. */
      this._armPictureInPictureForProfileSwitch();

      /* Warm cache during the slide - mount only once the preview fully covers. */
      const runtimePrepPromise = this._prepareProfileRuntimeForSwitch(id);

      return (async () => {
        try {
          await Promise.all([slidePromise, runtimePrepPromise]);
          if (!this._isProfileSwitchEpochCurrent(epoch)) return;

          /* Snapshot after the slide: the live pane is still the outgoing profile and the
             synchronous capture no longer competes with the release animation. */
          const prep = await this._beginProfileSwitchPrep(outgoingId, { immediate: true });
          if (!this._isProfileSwitchEpochCurrent(epoch)) return;
          if (prep.error) throw prep.error;

          const outPid = sanitizeProfileId(outgoingId);

          /* Live pane is off-screen — mount from warm cache, then collapse in one turn. */
          const activated = await this._loadTargetProfileState(
            id,
            this._profileRuntime?.get(id) || cached
          );
          if (!this._isProfileSwitchEpochCurrent(epoch)) return;

          if (!activated) {
            const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === id);
            if (prof?.icon) {
              this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
            }
          }

          this.syncProfileSwitcherState?.();
          this._finalizeCoupledTransition(activated);
          this._commitProfileWebview?.(id);
          this._syncWebPanelVisualState?.();
          this._unpinWebPanelRingForProfileSwipe?.();

          this._profileSwipeFinalizing = false;
          completed = true;

          try {
            void window.electronAPI?.switchProfileInWindow?.(id);
          } catch (_) {}
          void this._persistOutgoingProfile(outPid, prep.captured);

          /* Heavy follow-up — webview + panel ring already restored synchronously above. */
          const afterUnlock = () => {
            if (!this._isProfileSwitchEpochCurrent(epoch)) return;
            if (typeof this.setupTabDragDrop === 'function') this.setupTabDragDrop();
            void this.reloadFavoritesForProfile?.(id);
            void this._applyProfileChromeAfterSwitch?.();
            if (!activated && !this.isIncognitoWindow && this.settings?.transparentSites) {
              void this.applyTransparentSitesToAllWebviews?.();
            }
            void this.refreshProfilesMenu?.();
            this._prefetchAdjacentProfileCaches?.();
          };
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(afterUnlock);
          } else {
            setTimeout(afterUnlock, 0);
          }
        } catch (e) {
          if (!this._isProfileSwitchEpochCurrent(epoch)) return;
          console.error('switchToProfileId failed', e);
          this._profileSwipeFinalizing = false;
          try {
            this._endProfileNtpIsolation?.();
          } catch (_) {}
          this._clearProfileSwipeShellThemeState(true);
          document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
          this._resetProfileSwipeCompositorLayers();
          this.unwrapProfileSwipeChrome?.();
          this.cacheDOMElements?.();
          this._syncProfileSidebarDom({ setupDrag: true });
          this._cancelSidebarSlideAnimation();
        } finally {
          if (!completed && this._isProfileSwitchEpochCurrent(epoch)) {
            this._profileSwipeFinalizing = false;
            document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
            this._resetProfileSwipeCompositorLayers();
            try {
              this._endProfileNtpIsolation?.();
            } catch (_) {}
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

    _profileShortcutCooldownActive() {
      const now = Date.now();
      const last = this._lastProfileShortcutAt || 0;
      if (now - last < 450) return true;
      this._lastProfileShortcutAt = now;
      return false;
    },

    async switchToAdjacentProfile(direction = 1) {
      if (this.isIncognitoWindow) return;
      if (this._profileShortcutCooldownActive?.()) return;
      if (this._profileSwipeLock || this._profileSwipeFinalizing) return;
      const dir = direction > 0 ? 1 : -1;
      const fromId = sanitizeProfileId(this.profileId);
      const targetId = this._adjacentProfileIdFrom(fromId, dir);
      if (!targetId) return;
      await this.switchToProfileId(targetId, {
        animate: true,
        direction: dir,
        originProfileId: fromId
      });
    },

    async switchToProfileId(targetId, options = {}) {
      if (this.isIncognitoWindow) return;
      const id = sanitizeProfileId(targetId);
      const cur = sanitizeProfileId(this.profileId);
      if (id === cur) return;

      const origin =
        options.originProfileId != null ? sanitizeProfileId(options.originProfileId) : cur;
      /* Stale shortcut: first switch already moved `profileId` before the duplicate fired. */
      if (origin !== sanitizeProfileId(this.profileId)) return;

      const direction = options.direction ?? this._profileSwipeDirectionFor(id);
      const cached = this._profileRuntime.get(id);
      let completed = false;

      /* Wheel release: never hold the swipe lock - chain gestures freely; epoch cancels stale commits. */
      if (options.interactive) {
        const epoch = this._bumpProfileSwitchEpoch();
        return this._commitInteractiveProfileSwitch(id, cur, {
          direction,
          cached,
          releaseVelocity: options.releaseVelocity || 0,
          releaseSpringPromise: options.releaseSpringPromise,
          epoch
        });
      }

      if (this._profileSwipeLock || this._profileSwipeFinalizing) return;

      /*
       * Claim the lock synchronously - keyboard shortcuts and duplicate IPC must not
       * both start a switch before either reaches async work (that skipped two profiles).
       */
      this._profileSwipeLock = true;
      if (this._pinnedTabsSaveTimer) {
        clearTimeout(this._pinnedTabsSaveTimer);
        this._pinnedTabsSaveTimer = null;
      }

      if (options.gestureStep) {
        this._profileSwipeFinalizing = true;
        return this._commitGestureStepProfileSwitch(id, cur, { direction, cached });
      }

      this._profileSwipeFinalizing = true;
      this.hideProfileSwitcherMenu?.();
      this._armPictureInPictureForProfileSwitch();

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
        const runtimePrepPromise = this._prepareProfileRuntimeForSwitch(id);
        if (wantAnimate && W > 0 && this._beginCoupledTransition(direction, id, { singleStep: true })) {
          coupled = true;
        }

        if (coupled) {
          await Promise.all([
            this._animateTrackSpring(fullOffset, 0, 'commit'),
            runtimePrepPromise
          ]);
        } else {
          await runtimePrepPromise;
        }

        let activated;
        try {
          activated = await this._loadTargetProfileState(
            id,
            this._profileRuntime?.get(id) || cached
          );
          if (!activated) {
            const prof = this.profiles?.find((p) => sanitizeProfileId(p.id) === id);
            if (prof?.icon) {
              this.windowProfileIcon = this.sanitizeProfileIcon?.(prof.icon) || prof.icon;
            }
          }
          this.syncProfileSwitcherState?.();

          if (coupled) {
            this._finalizeCoupledTransition(activated);
          } else if (wantAnimate) {
            await this._runEnterProfileSlide(direction);
            this._applyProfileChromeImmediate?.(activated);
            this._revealProfileSwitchSidebar();
          } else {
            this._applyProfileChromeImmediate?.(activated);
            this._revealProfileSwitchSidebar();
          }
        } catch (e) {
          document.getElementById('sidebar')?.classList.remove('axis-sidebar-profile-switching');
          throw e;
        }

        this._commitProfileWebview?.(id);
        this._syncWebPanelVisualState?.();
        this._unpinWebPanelRingForProfileSwipe?.();

        this._profileSwipeFinalizing = false;
        this._releaseProfileSwipeUi();
        completed = true;

        try {
          void window.electronAPI?.switchProfileInWindow?.(id);
        } catch (_) {}
        void this._persistOutgoingProfile(cur, prep.captured);

        const afterUnlock = () => {
          if (typeof this.setupTabDragDrop === 'function') this.setupTabDragDrop();
          void this.reloadFavoritesForProfile?.(id);
          void this._applyProfileChromeAfterSwitch?.();
          if (!activated && !this.isIncognitoWindow && this.settings?.transparentSites) {
            void this.applyTransparentSitesToAllWebviews?.();
          }
          void this.refreshProfilesMenu?.();
          this._prefetchAdjacentProfileCaches?.();
        };
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(afterUnlock);
        } else {
          setTimeout(afterUnlock, 0);
        }
      } catch (e) {
        console.error('switchToProfileId failed', e);
        this._profileSwipeFinalizing = false;
        try {
          this._endProfileNtpIsolation?.();
        } catch (_) {}
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
          try {
            this._endProfileNtpIsolation?.();
          } catch (_) {}
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
