/**
 * First-run setup overlay - shown once until the user finishes or skips setup.
 */
(function (global) {
    const AXIS_ONBOARDING_FORCE_EVERY_LAUNCH = false;

    const FLOW_STEPS = [
        { id: 'language', labelKey: 'onboarding.language.label', titleId: 'ob-language-title' },
        { id: 'default', labelKey: 'onboarding.default.label', titleId: 'ob-default-title' },
        { id: 'search', labelKey: 'onboarding.search.label', titleId: 'ob-search-title' },
        { id: 'data', labelKey: 'onboarding.data.label', titleId: 'ob-data-title' },
        { id: 'import', labelKey: 'onboarding.import.label', titleId: 'ob-import-title', when: (s) => s.dataMode === 'import' },
        { id: 'look', labelKey: 'onboarding.look.label', titleId: 'ob-look-title' },
        { id: 'you', labelKey: 'onboarding.you.label', titleId: 'ob-you-title' },
        { id: 'features', labelKey: 'onboarding.features.label', titleId: 'ob-features-title' },
        { id: 'ready', labelKey: 'onboarding.ready.label', titleId: 'ob-ready-title' }
    ];

    function tr(key, vars) {
        try {
            if (global.AxisI18n && typeof global.AxisI18n.t === 'function') {
                return global.AxisI18n.t(key, vars);
            }
        } catch (_) {}
        return key;
    }

    const UNPINNED_CLEAR_LABELS = {
        'app-close': 'When Axis closes',
        custom: 'Custom interval',
        '24h': 'Every day',
        never: 'Never'
    };

    const UNPINNED_CLEAR_PRESET_MINUTES = {
        '30m': 30,
        '1h': 60,
        '6h': 360,
        '12h': 720,
        '24h': 1440,
        '7d': 10080
    };

    const SEARCH_LABELS = {
        google: 'Google',
        duckduckgo: 'DuckDuckGo',
        bing: 'Bing',
        yahoo: 'Yahoo',
        yandex: 'Yandex'
    };

    const IMPORT_OPTION_DEFS = [
        { key: 'importFavorites', labelKey: 'onboarding.import.opt.favorites', descKey: 'onboarding.import.opt.favoritesDesc' },
        { key: 'importBookmarks', labelKey: 'onboarding.import.opt.bookmarks', descKey: 'onboarding.import.opt.bookmarksDesc' },
        { key: 'importFolders', labelKey: 'onboarding.import.opt.folders', descKey: 'onboarding.import.opt.foldersDesc' },
        { key: 'importOpenTabs', labelKey: 'onboarding.import.opt.tabs', descKey: 'onboarding.import.opt.tabsDesc' },
        { key: 'importHistory', labelKey: 'onboarding.import.opt.history', descKey: 'onboarding.import.opt.historyDesc' },
        { key: 'importPasswords', labelKey: 'onboarding.import.opt.passwords', descKey: 'onboarding.import.opt.passwordsDesc' },
        { key: 'importCards', labelKey: 'onboarding.import.opt.cards', descKey: 'onboarding.import.opt.cardsDesc' },
        { key: 'importAddresses', labelKey: 'onboarding.import.opt.addresses', descKey: 'onboarding.import.opt.addressesDesc' },
        { key: 'importSitePermissions', labelKey: 'onboarding.import.opt.permissions', descKey: 'onboarding.import.opt.permissionsDesc' },
        { key: 'importExtensions', labelKey: 'onboarding.import.opt.extensions', descKey: 'onboarding.import.opt.extensionsDesc' }
    ];

    /** Real app logos in `src/assets/brands/`. */
    const BROWSER_LOGO_FILES = {
        chrome: 'chrome.png',
        'chrome-beta': 'chrome.png',
        'chrome-dev': 'chrome.png',
        'chrome-canary': 'chrome.png',
        chromium: 'chromium.png',
        edge: 'edge.png',
        'edge-beta': 'edge.png',
        'edge-dev': 'edge.png',
        'edge-canary': 'edge.png',
        firefox: 'firefox.png',
        'firefox-dev': 'firefox.png',
        'firefox-nightly': 'firefox.png',
        librewolf: 'librewolf.png',
        waterfox: 'waterfox.png',
        opera: 'opera.png',
        'opera-gx': 'opera-gx.png',
        yandex: 'yandex-browser.png',
        brave: 'brave.png',
        'brave-beta': 'brave.png',
        'brave-nightly': 'brave.png',
        vivaldi: 'vivaldi.png',
        arc: 'arc.png',
        dia: 'dia.png',
        zen: 'zen.png',
        whale: 'whale.png',
        thorium: 'thorium.png',
        sidekick: 'sidekick.png'
    };

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function brandLogoSrc(file) {
        return `assets/brands/${file}`;
    }

    function browserIconHtml(id) {
        const key = String(id || '').toLowerCase();
        const file =
            BROWSER_LOGO_FILES[key] ||
            BROWSER_LOGO_FILES[key.split('-')[0]] ||
            'chrome.png';
        const src = brandLogoSrc(file);
        return `<span class="ob-browser-icon" aria-hidden="true"><img class="ob-brand-logo" src="${src}" alt="" draggable="false" /></span>`;
    }

    function normalizeHexColor(value, fallback = '#1a1a1a') {
        let raw = String(value || '').trim();
        if (!raw) return fallback;
        if (raw[0] !== '#') raw = `#${raw}`;
        if (/^#[0-9a-fA-F]{3}$/.test(raw)) {
            raw = `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`;
        }
        if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return fallback;
        return raw.toLowerCase();
    }

    function createController(host) {
        if (!host) return null;
        const root = document.getElementById('axis-onboarding');
        if (!root) return null;

        const welcome = root.querySelector('[data-ob-screen="welcome"]');
        const flowScreen = root.querySelector('[data-ob-screen="flow"]');
        const stepper = document.getElementById('ob-stepper');
        const browserList = document.getElementById('ob-browser-list');
        const browserSelected = document.getElementById('ob-browser-selected');
        const profilesWrap = document.getElementById('ob-profiles-wrap');
        const profileList = document.getElementById('ob-profile-list');
        const importOptionsList = document.getElementById('ob-import-options');
        const defaultHint = document.getElementById('ob-default-hint');
        const readySummary = document.getElementById('ob-ready-summary');
        const readyStatus = document.getElementById('ob-ready-status');
        const themeColorInput = document.getElementById('ob-theme-color');
        const themeHexInput = document.getElementById('ob-theme-hex');
        const greetingNameInput = document.getElementById('ob-greeting-name');
        const progressFill = document.getElementById('ob-progress-fill');
        const stepCaption = document.getElementById('ob-step-caption');
        const startBtn = document.getElementById('ob-start-btn');
        const skipBtn = document.getElementById('ob-skip-btn');
        const skipOverlay = document.getElementById('ob-skip-overlay');
        const skipConfirmBtn = document.getElementById('ob-skip-confirm-btn');
        const skipContinueBtn = document.getElementById('ob-skip-continue-btn');
        const backBtn = document.getElementById('ob-back-btn');
        const nextBtn = document.getElementById('ob-next-btn');
        const nextLabel = document.getElementById('ob-next-label');
        const unpinnedCustomRow = document.getElementById('ob-unpinned-custom-row');
        const unpinnedCustomMinutesInput = document.getElementById('ob-unpinned-custom-minutes');

        let visible = false;
        let step = 'welcome';
        let flowIndex = 0;
        let busy = false;
        let skipConfirmOpen = false;
        let skipConfirmCloseTimer = 0;
        let browsersCache = [];
        let profilesCache = [];
        let defaultStatusChecked = false;

        const FEATURE_KEYS = ['adBlockerEnabled', 'aiFeaturesEnabled'];

        const state = {
            wantDefault: null,
            searchEngine: 'google',
            dataMode: null,
            browserId: null,
            profileMode: 'all',
            selectedProfileIds: [],
            themeColor: '#1a1a1a',
            uiTheme: 'dark',
            sidebarPosition: 'left',
            greetingName: '',
            uiLanguage: 'en',
            universalBrowserLanguage: false,
            universalUiLanguage: 'en',
            adBlockerEnabled: true,
            aiFeaturesEnabled: true,
            unpinnedClearMode: 'never',
            unpinnedClearCustomMinutes: 60,
            importOpts: {
                importFavorites: true,
                importBookmarks: true,
                importFolders: true,
                importOpenTabs: false,
                importHistory: true,
                importPasswords: true,
                importExtensions: true,
                importCards: true,
                importAddresses: true,
                importSitePermissions: true
            }
        };

        function setThemeColor(color, { syncInputs = true } = {}) {
            state.themeColor = normalizeHexColor(color);
            /* Do not tint the setup backdrop with the chosen theme - that color
             * bled through the frosted glass while onboarding was open. */
            if (syncInputs) {
                if (themeColorInput) themeColorInput.value = state.themeColor;
                if (themeHexInput && document.activeElement !== themeHexInput) {
                    themeHexInput.value = state.themeColor.toUpperCase();
                }
            }
        }

        function activeSteps() {
            return FLOW_STEPS.filter((s) => !s.when || s.when(state));
        }

        function resolveOnboardingLight() {
            if (state.uiTheme === 'light') return true;
            if (state.uiTheme === 'dark') return false;
            if (state.uiTheme === 'system') {
                try {
                    return !!window.matchMedia?.('(prefers-color-scheme: light)')?.matches;
                } catch (_) {
                    return false;
                }
            }
            return !!host.isLightUiTheme?.();
        }

        function syncTheme() {
            const light = resolveOnboardingLight();
            root.setAttribute('data-ob-theme', light ? 'light' : 'dark');
            root.style.removeProperty('--ob-theme-wash');
        }

        function setPressed(selector, value, attr) {
            root.querySelectorAll(selector).forEach((el) => {
                const on = String(el.getAttribute(attr) || '') === String(value);
                el.classList.toggle('is-selected', on);
                el.setAttribute('aria-pressed', on ? 'true' : 'false');
            });
        }

        function clampUnpinnedCustomMinutes(raw) {
            const n = Number(raw);
            if (!Number.isFinite(n)) return state.unpinnedClearCustomMinutes || 60;
            return Math.min(10080, Math.max(1, Math.round(n)));
        }

        function syncFeatureChecks() {
            root.querySelectorAll('[data-ob-feature]').forEach((el) => {
                const key = el.getAttribute('data-ob-feature');
                if (!FEATURE_KEYS.includes(key)) return;
                const on = !!state[key];
                el.classList.toggle('is-on', on);
                el.setAttribute('aria-pressed', on ? 'true' : 'false');
                const stateEl = el.querySelector('.ob-feature-state');
                if (stateEl) stateEl.textContent = on ? tr('common.on') : tr('common.off');
            });
            const mode = state.unpinnedClearMode || 'never';
            setPressed('[data-ob-unpinned]', mode, 'data-ob-unpinned');
            if (unpinnedCustomRow) unpinnedCustomRow.hidden = mode !== 'custom';
            if (
                unpinnedCustomMinutesInput &&
                mode === 'custom' &&
                document.activeElement !== unpinnedCustomMinutesInput
            ) {
                unpinnedCustomMinutesInput.value = String(clampUnpinnedCustomMinutes(state.unpinnedClearCustomMinutes));
            }
            if (greetingNameInput && document.activeElement !== greetingNameInput) {
                greetingNameInput.value = state.greetingName || '';
            }
        }

        function renderImportOptions() {
            if (!importOptionsList) return;
            importOptionsList.innerHTML = IMPORT_OPTION_DEFS.map((opt) => {
                const on = state.importOpts[opt.key] !== false;
                return `<button type="button" class="ob-import-chip ${on ? 'is-selected' : ''}" data-ob-import-opt="${opt.key}" aria-pressed="${on ? 'true' : 'false'}">
  <span class="ob-import-chip-title">${escapeHtml(tr(opt.labelKey))}</span>
  <span class="ob-import-chip-desc">${escapeHtml(tr(opt.descKey))}</span>
</button>`;
            }).join('');
        }

        function updateBrowserSelectionUi() {
            const hasBrowser = !!state.browserId;
            if (browserList) browserList.hidden = hasBrowser;
            if (browserSelected) {
                browserSelected.hidden = !hasBrowser;
                if (hasBrowser) {
                    const b = browsersCache.find((x) => x.id === state.browserId);
                    const name = escapeHtml(b?.name || state.browserId);
                    const count = Number(b?.profileCount) || profilesCache.length || 0;
                    browserSelected.innerHTML = `<div class="ob-browser-selected-bar">
  ${browserIconHtml(state.browserId)}
  <div class="ob-browser-card-text">
    <span class="ob-browser-card-name">${name}</span>
    <span class="ob-browser-card-meta">${escapeHtml(tr(count === 1 ? 'onboarding.import.profileCount' : 'onboarding.import.profileCountPlural', { count, n: count }))}</span>
  </div>
  <button type="button" class="ob-browser-change" data-ob-change-browser>${escapeHtml(tr('common.change'))}</button>
</div>`;
                } else {
                    browserSelected.innerHTML = '';
                }
            }
            if (profilesWrap) {
                const wasHidden = profilesWrap.hidden;
                profilesWrap.hidden = !hasBrowser;
                if (hasBrowser && wasHidden) pulseEnter(profilesWrap);
            }
        }

        function syncChoiceUi() {
            setPressed('[data-ob-default]', state.wantDefault === true ? 'yes' : state.wantDefault === false ? 'no' : '', 'data-ob-default');
            setPressed('[data-ob-search]', state.searchEngine || 'google', 'data-ob-search');
            setPressed('[data-ob-data]', state.dataMode || '', 'data-ob-data');
            setPressed('[data-ob-profile-mode]', state.profileMode || 'all', 'data-ob-profile-mode');
            setPressed('[data-ob-ui-theme]', state.uiTheme || 'dark', 'data-ob-ui-theme');
            setPressed('[data-ob-sidebar]', state.sidebarPosition || 'left', 'data-ob-sidebar');
            syncFeatureChecks();
            setThemeColor(state.themeColor);
            syncTheme();
            updateBrowserSelectionUi();

            root.querySelectorAll('[data-ob-browser]').forEach((el) => {
                const on = el.getAttribute('data-ob-browser') === state.browserId;
                el.classList.toggle('is-selected', on);
            });

            if (profileList) {
                profileList.hidden = state.profileMode !== 'pick';
                profileList.querySelectorAll('[data-ob-profile]').forEach((el) => {
                    const id = el.getAttribute('data-ob-profile');
                    const on = state.selectedProfileIds.includes(id);
                    el.classList.toggle('is-selected', on);
                    el.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }

            if (importOptionsList) {
                importOptionsList.querySelectorAll('[data-ob-import-opt]').forEach((el) => {
                    const key = el.getAttribute('data-ob-import-opt');
                    const on = state.importOpts[key] !== false;
                    el.classList.toggle('is-selected', on);
                    el.setAttribute('aria-pressed', on ? 'true' : 'false');
                });
            }
        }

        function pulseEnter(el) {
            if (!el) return;
            el.classList.remove('ob-enter');
            void el.offsetWidth;
            el.classList.add('ob-enter');
            const done = () => {
                el.classList.remove('ob-enter');
                el.removeEventListener('animationend', done);
            };
            el.addEventListener('animationend', done);
        }

        function renderStepper() {
            const steps = activeSteps();
            const total = Math.max(steps.length, 1);
            const pct = Math.round(((flowIndex + 1) / total) * 100);
            if (progressFill) progressFill.style.width = `${pct}%`;
            if (stepCaption) {
                const cur = steps[flowIndex];
                stepCaption.textContent = cur ? `${flowIndex + 1} / ${total} · ${tr(cur.labelKey)}` : '';
            }
            if (!stepper) return;
            stepper.innerHTML = steps
                .map((s, i) => {
                    const st = i < flowIndex ? 'is-done' : i === flowIndex ? 'is-active' : '';
                    return `<button type="button" class="ob-step ${st}" data-ob-step-jump="${i}" ${i > flowIndex ? 'disabled' : ''} aria-current="${i === flowIndex ? 'step' : 'false'}">
  <span class="ob-step-num">${i < flowIndex ? '✓' : i + 1}</span>
  <span class="ob-step-label">${escapeHtml(tr(s.labelKey))}</span>
</button>`;
                })
                .join('<span class="ob-step-rule" aria-hidden="true"></span>');
        }

        function showPanel(id, { animate = false } = {}) {
            root.querySelectorAll('[data-ob-panel]').forEach((el) => {
                const on = el.getAttribute('data-ob-panel') === id;
                el.hidden = !on;
                el.classList.toggle('hidden', !on);
                if (on && animate) pulseEnter(el);
            });
        }

        function canContinue() {
            const cur = activeSteps()[flowIndex];
            if (!cur) return false;
            if (cur.id === 'default') return state.wantDefault !== null;
            if (cur.id === 'search') return !!state.searchEngine;
            if (cur.id === 'data') return state.dataMode === 'import' || state.dataMode === 'fresh';
            if (cur.id === 'import') {
                if (!state.browserId) return false;
                if (state.profileMode === 'all') return profilesCache.length > 0;
                return state.selectedProfileIds.length > 0;
            }
            if (cur.id === 'look') return !!state.themeColor && !!state.uiTheme;
            if (cur.id === 'you') return true;
            if (cur.id === 'features') {
                const mode = state.unpinnedClearMode || 'never';
                if (mode === 'custom') {
                    return (
                        state.unpinnedClearCustomMinutes >= 1 &&
                        state.unpinnedClearCustomMinutes <= 10080
                    );
                }
                return !!mode;
            }
            return true;
        }

        function setSkipConfirmOpen(open) {
            const next = !!open;
            if (next === skipConfirmOpen) return;
            skipConfirmOpen = next;
            if (skipConfirmCloseTimer) {
                window.clearTimeout(skipConfirmCloseTimer);
                skipConfirmCloseTimer = 0;
            }
            if (skipBtn) {
                skipBtn.setAttribute('aria-expanded', skipConfirmOpen ? 'true' : 'false');
            }

            const shell = root.querySelector('.ob-shell');
            if (!skipOverlay) {
                root.classList.toggle('is-skip-confirm', skipConfirmOpen);
                return;
            }

            if (skipConfirmOpen) {
                skipOverlay.classList.remove('is-leaving');
                skipOverlay.hidden = false;
                skipOverlay.setAttribute('aria-hidden', 'false');
                root.classList.add('is-skip-confirm');
                if (shell) {
                    shell.setAttribute('inert', '');
                    shell.setAttribute('aria-hidden', 'true');
                }
                /* Double rAF so the closed styles paint before the open transition runs. */
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        if (!skipConfirmOpen || !skipOverlay) return;
                        skipOverlay.classList.add('is-open');
                    });
                });
                root.setAttribute('aria-labelledby', 'ob-skip-overlay-title');
                window.setTimeout(() => {
                    if (skipConfirmOpen) skipContinueBtn?.focus?.({ preventScroll: true });
                }, 120);
            } else {
                skipOverlay.classList.add('is-leaving');
                skipOverlay.setAttribute('aria-hidden', 'true');
                skipConfirmCloseTimer = window.setTimeout(() => {
                    skipConfirmCloseTimer = 0;
                    skipOverlay.classList.remove('is-open', 'is-leaving');
                    if (!skipConfirmOpen) skipOverlay.hidden = true;
                    root.classList.remove('is-skip-confirm');
                    if (shell) {
                        shell.removeAttribute('inert');
                        shell.removeAttribute('aria-hidden');
                    }
                    if (visible) {
                        const current =
                            step === 'welcome'
                                ? 'ob-welcome-title'
                                : activeSteps()[flowIndex]?.titleId || 'ob-welcome-title';
                        root.setAttribute('aria-labelledby', current);
                        skipBtn?.focus?.();
                    }
                }, 320);
            }
        }

        /** Tear down skip confirm without flashing setup - used when leaving to the app. */
        function clearSkipConfirmSilent() {
            if (skipConfirmCloseTimer) {
                window.clearTimeout(skipConfirmCloseTimer);
                skipConfirmCloseTimer = 0;
            }
            skipConfirmOpen = false;
            if (skipBtn) skipBtn.setAttribute('aria-expanded', 'false');
            // Keep covering setup until the whole overlay is gone; cleaned in finishHide.
        }

        function updateNextEnabled() {
            if (nextBtn) nextBtn.disabled = busy || !canContinue();
            if (backBtn) backBtn.disabled = busy;
            if (skipBtn) skipBtn.disabled = busy;
            if (skipConfirmBtn) skipConfirmBtn.disabled = busy;
            if (skipContinueBtn) skipContinueBtn.disabled = busy;
        }

        async function refreshDefaultStatus() {
            if (!defaultHint || defaultStatusChecked) return;
            defaultStatusChecked = true;
            try {
                const status = await window.electronAPI?.getDefaultBrowserStatus?.();
                if (status?.isDefault) {
                    defaultHint.hidden = false;
                    defaultHint.textContent = tr('onboarding.default.already');
                    if (state.wantDefault === null) {
                        state.wantDefault = true;
                        syncChoiceUi();
                        updateNextEnabled();
                    }
                }
            } catch (_) {}
        }

        function showScreen(name, { animate = true } = {}) {
            setSkipConfirmOpen(false);
            const prev = step;
            step = name;
            const isWelcome = name === 'welcome';
            welcome?.classList.toggle('hidden', !isWelcome);
            flowScreen?.classList.toggle('hidden', isWelcome);
            if (welcome) welcome.hidden = !isWelcome;
            if (flowScreen) flowScreen.hidden = isWelcome;

            if (isWelcome) {
                root.setAttribute('aria-labelledby', 'ob-welcome-title');
                if (animate) pulseEnter(welcome);
                return;
            }

            const steps = activeSteps();
            if (flowIndex >= steps.length) flowIndex = steps.length - 1;
            const current = steps[flowIndex] || steps[0];
            renderStepper();
            showPanel(current.id, { animate: animate && prev !== 'flow' });
            syncChoiceUi();
            updateNextEnabled();

            if (nextLabel) {
                nextLabel.textContent = current.id === 'ready' ? tr('onboarding.openAxis') : tr('onboarding.continue');
            }
            root.setAttribute('aria-labelledby', current.titleId);

            if (current.id === 'default') void refreshDefaultStatus();
            if (current.id === 'you') {
                window.requestAnimationFrame(() => greetingNameInput?.focus?.());
            }
            if (current.id === 'import') {
                renderImportOptions();
                void loadBrowsers();
            }
            if (current.id === 'ready') prepareReady();
            if (animate && prev === 'welcome') pulseEnter(flowScreen);
        }

        function goFlow(index) {
            const steps = activeSteps();
            flowIndex = Math.max(0, Math.min(steps.length - 1, index));
            showScreen('flow');
        }

        async function loadBrowsers() {
            if (!browserList) return;
            if (!state.browserId) {
                browserList.innerHTML = `<div class="ob-empty">${escapeHtml(tr('onboarding.import.looking'))}</div>`;
                browserList.hidden = false;
                if (browserSelected) {
                    browserSelected.hidden = true;
                    browserSelected.innerHTML = '';
                }
                if (profilesWrap) profilesWrap.hidden = true;
            }
            let list = [];
            try {
                list = (await window.electronAPI?.listImportableBrowsers?.()) || [];
            } catch (_) {
                list = [];
            }
            browsersCache = Array.isArray(list) ? list : [];
            if (!browsersCache.length) {
                // Keep an existing choice if a transient scan comes back empty.
                if (!state.browserId) {
                    browserList.hidden = false;
                    browserList.innerHTML = `<div class="ob-empty">${escapeHtml(tr('onboarding.import.none'))}</div>`;
                    if (browserSelected) {
                        browserSelected.hidden = true;
                        browserSelected.innerHTML = '';
                    }
                    if (profilesWrap) profilesWrap.hidden = true;
                }
                updateNextEnabled();
                return;
            }
            browserList.innerHTML = browsersCache
                .map((b) => {
                    const id = escapeHtml(b.id);
                    const name = escapeHtml(b.name || id);
                    const count = Number(b.profileCount) || 0;
                    const icon = browserIconHtml(b.id);
                    return `<button type="button" class="ob-browser-card" data-ob-browser="${id}">
  ${icon}
  <span class="ob-browser-card-text">
    <span class="ob-browser-card-name">${name}</span>
    <span class="ob-browser-card-meta">${escapeHtml(tr(count === 1 ? 'onboarding.import.profileCount' : 'onboarding.import.profileCountPlural', { count, n: count }))}</span>
  </span>
</button>`;
                })
                .join('');
            pulseEnter(browserList);
            if (state.browserId && !browsersCache.some((b) => b.id === state.browserId)) {
                state.browserId = null;
                profilesCache = [];
            }
            if (state.browserId) void loadProfiles(state.browserId);
            else {
                updateBrowserSelectionUi();
                updateNextEnabled();
            }
            syncChoiceUi();
            updateNextEnabled();
        }

        async function loadProfiles(browserId) {
            if (!profilesWrap || !profileList) return;
            profilesCache = [];
            state.selectedProfileIds = [];
            updateBrowserSelectionUi();
            if (!browserId) {
                updateNextEnabled();
                return;
            }
            profileList.innerHTML = `<div class="ob-empty">${escapeHtml(tr('onboarding.import.loadingProfiles'))}</div>`;
            if (state.profileMode === 'pick') profileList.hidden = false;
            let list = [];
            try {
                list = (await window.electronAPI?.listBrowserImportProfiles?.(browserId)) || [];
            } catch (_) {
                list = [];
            }
            profilesCache = Array.isArray(list) ? list : [];
            updateBrowserSelectionUi();
            if (!profilesCache.length) {
                profileList.innerHTML = `<div class="ob-empty">${escapeHtml(tr('onboarding.import.noProfiles'))}</div>`;
                updateNextEnabled();
                return;
            }
            state.selectedProfileIds = profilesCache.map((p) => p.id);
            profileList.innerHTML = profilesCache
                .map((p) => {
                    const id = escapeHtml(p.id);
                    const name = escapeHtml(p.name || id);
                    return `<button type="button" class="ob-profile-chip is-selected" data-ob-profile="${id}" aria-pressed="true">
  <span class="ob-profile-chip-name">${name}</span>
</button>`;
                })
                .join('');
            pulseEnter(profileList);
            syncChoiceUi();
            updateNextEnabled();
        }

        function prepareReady() {
            const rows = [];
            const langName =
                (global.AxisI18n && typeof global.AxisI18n.languageLabel === 'function'
                    ? global.AxisI18n.languageLabel(state.uiLanguage)
                    : '') || state.uiLanguage || 'English';
            rows.push({
                label: tr('onboarding.ready.language'),
                value: langName
            });
            rows.push({
                label: tr('onboarding.ready.defaultBrowser'),
                value: state.wantDefault ? tr('onboarding.ready.setDefault') : tr('onboarding.ready.keepDefault')
            });
            rows.push({
                label: tr('onboarding.ready.search'),
                value: SEARCH_LABELS[state.searchEngine] || state.searchEngine
            });
            if (state.dataMode === 'import' && state.browserId) {
                const browser = browsersCache.find((b) => b.id === state.browserId);
                const n =
                    state.profileMode === 'all'
                        ? profilesCache.length
                        : state.selectedProfileIds.length;
                rows.push({
                    label: tr('onboarding.ready.import'),
                    value: `${browser?.name || state.browserId} · ${tr(n === 1 ? 'onboarding.import.profileCount' : 'onboarding.import.profileCountPlural', { n })}`
                });
            } else {
                rows.push({ label: tr('onboarding.ready.data'), value: tr('onboarding.ready.fresh') });
            }
            const look =
                state.uiTheme === 'system'
                    ? tr('onboarding.ready.matchSystem')
                    : state.uiTheme === 'light'
                      ? tr('common.light')
                      : tr('common.dark');
            rows.push({
                label: tr('onboarding.ready.look'),
                value: `${look} · ${state.themeColor.toUpperCase()} · ${tr('onboarding.ready.sidebar', {
                    side: tr(state.sidebarPosition === 'right' ? 'common.right' : 'common.left')
                })}`
            });
            const name = String(state.greetingName || '').trim();
            rows.push({
                label: tr('onboarding.ready.name'),
                value: name || tr('onboarding.ready.notSet')
            });
            const featureBits = [];
            if (state.adBlockerEnabled) featureBits.push(tr('onboarding.features.adblock'));
            if (state.aiFeaturesEnabled) featureBits.push(tr('chrome.aiChat'));
            rows.push({
                label: tr('onboarding.ready.features'),
                value: featureBits.length ? featureBits.join(' · ') : tr('onboarding.ready.allOff')
            });
            const unpinnedMode = state.unpinnedClearMode || 'never';
            const unpinnedValue =
                unpinnedMode === 'custom'
                    ? tr('onboarding.ready.everyMinutes', { n: state.unpinnedClearCustomMinutes })
                    : tr(
                          unpinnedMode === 'app-close'
                              ? 'onboarding.features.appClose'
                              : unpinnedMode === '24h'
                                ? 'onboarding.features.daily'
                                : unpinnedMode === 'never'
                                  ? 'onboarding.features.never'
                                  : 'onboarding.features.custom'
                      );
            rows.push({
                label: tr('onboarding.ready.clearTabs'),
                value: unpinnedValue
            });

            if (readySummary) {
                readySummary.innerHTML = rows
                    .map(
                        (r) => `<div class="ob-summary-row">
  <span class="ob-summary-label">${escapeHtml(r.label)}</span>
  <span class="ob-summary-value">${escapeHtml(r.value)}</span>
</div>`
                    )
                    .join('');
            }
            if (readyStatus) {
                readyStatus.hidden = true;
                readyStatus.textContent = '';
            }
        }

        async function applyDefaultBrowserChoice() {
            if (state.wantDefault !== true) return;
            try {
                const result = await window.electronAPI?.setAsDefaultBrowser?.();
                if (!result?.isDefault) {
                    await window.electronAPI?.openDefaultBrowserSettings?.();
                    if (defaultHint) {
                        defaultHint.hidden = false;
                        defaultHint.textContent =
                            'If Axis isn’t listed yet, pick it in your system default-browser settings.';
                    }
                } else if (defaultHint) {
                    defaultHint.hidden = false;
                    defaultHint.textContent = 'Axis is set as your default browser.';
                }
            } catch (_) {
                try {
                    await window.electronAPI?.openDefaultBrowserSettings?.();
                } catch (__) {}
            }
        }

        function profilesToImport() {
            if (state.profileMode === 'all') return profilesCache.slice();
            const set = new Set(state.selectedProfileIds);
            return profilesCache.filter((p) => set.has(p.id));
        }

        async function runImports() {
            if (state.dataMode !== 'import' || !state.browserId) return { ok: true, count: 0 };
            const list = profilesToImport();
            if (!list.length) return { ok: false, error: 'No profiles selected' };
            let okCount = 0;
            const errors = [];
            const importWarnings = [];
            const opts = state.importOpts || {};
            for (let i = 0; i < list.length; i++) {
                const p = list[i];
                if (readyStatus) {
                    readyStatus.hidden = false;
                    readyStatus.textContent = `Importing ${p.name || p.id} (${i + 1}/${list.length})…`;
                }
                const payload = {
                    browserId: state.browserId,
                    sourceProfileId: p.id,
                    profileName: p.name || p.id,
                    themeColor: state.themeColor,
                    searchEngine: state.searchEngine,
                    importFavorites: opts.importFavorites !== false,
                    importBookmarks: opts.importBookmarks !== false,
                    importFolders: opts.importFolders !== false,
                    importOpenTabs: opts.importOpenTabs === true,
                    importHistory: opts.importHistory !== false,
                    importPasswords: opts.importPasswords !== false,
                    importCards: opts.importCards !== false,
                    importAddresses: opts.importAddresses !== false,
                    importSitePermissions: opts.importSitePermissions !== false,
                    importExtensions: opts.importExtensions !== false
                };
                try {
                    const result = await window.electronAPI?.importBrowserProfile?.(payload);
                    if (result?.ok) {
                        okCount += 1;
                        if (Array.isArray(result.warnings)) {
                            for (const warn of result.warnings) {
                                if (warn && !importWarnings.includes(warn)) importWarnings.push(warn);
                            }
                        }
                    } else errors.push(result?.error || `Could not import ${p.name || p.id}`);
                } catch (e) {
                    errors.push(String(e?.message || e));
                }
            }
            return { ok: okCount > 0, count: okCount, errors, warnings: importWarnings };
        }

        async function persistSettings() {
            const name = String(state.greetingName || '').trim() || 'User';
            const pairs = [
                ['uiLanguage', state.uiLanguage || 'en'],
                [
                    'universalBrowserLanguage',
                    {
                        enabled: !!state.universalBrowserLanguage,
                        universalUiLanguage: state.universalUiLanguage || state.uiLanguage || 'en'
                    }
                ],
                ['universalUiLanguage', state.universalUiLanguage || state.uiLanguage || 'en'],
                ['searchEngine', state.searchEngine],
                ['themeColor', state.themeColor],
                ['uiTheme', state.uiTheme],
                ['sidebarPosition', state.sidebarPosition],
                ['ntpGreetingName', name],
                ['unpinnedClearMode', state.unpinnedClearMode || 'never'],
                ['unpinnedClearCustomMinutes', state.unpinnedClearCustomMinutes || 60],
                ...FEATURE_KEYS.map((key) => [key, !!state[key]])
            ];
            for (const [key, value] of pairs) {
                try {
                    await host.saveSetting?.(key, value);
                    if (host.settings) {
                        if (key === 'universalBrowserLanguage' && value && typeof value === 'object') {
                            host.settings.universalBrowserLanguage = !!value.enabled;
                            if (value.universalUiLanguage) {
                                host.settings.universalUiLanguage = value.universalUiLanguage;
                            }
                        } else {
                            host.settings[key] = value;
                        }
                    }
                } catch (_) {}
            }
        }

        function flushShellAfterOnboarding() {
            try {
                host.applySidebarPosition?.();
            } catch (_) {}
            try {
                host.applySidebarZoom?.();
            } catch (_) {}
            try {
                host.applyUiThemeSurfaces?.();
            } catch (_) {}
            try {
                host.applyCustomThemeFromSettings?.();
            } catch (_) {}
            try {
                host.syncAdBlockerUrlBarState?.();
            } catch (_) {}
            try {
                host.applyAiFeaturesVisibility?.();
            } catch (_) {}
            try {
                host.updateNewTabHero?.();
            } catch (_) {}
            try {
                host._setupUnpinnedClearTimer?.();
            } catch (_) {}
        }

        async function finishAndClose() {
            if (busy) return;
            busy = true;
            updateNextEnabled();
            try {
                await applyDefaultBrowserChoice();
                await persistSettings();
                if (state.dataMode === 'import') {
                    const result = await runImports();
                    if (readyStatus) {
                        readyStatus.hidden = false;
                        if (result.ok) {
                            let text =
                                result.count > 0
                                    ? tr(result.count === 1 ? 'onboarding.ready.imported' : 'onboarding.ready.importedPlural', { count: result.count })
                                    : tr('onboarding.ready.importFinished');
                            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                                text += ` ${result.warnings[0]}`;
                            }
                            readyStatus.textContent = text;
                        } else {
                            readyStatus.textContent =
                                result.error ||
                                (result.errors && result.errors[0]) ||
                                tr('onboarding.ready.importProblems');
                        }
                    }
                }
                try {
                    await host.saveSetting?.('onboardingCompleted', true);
                    await host.saveSetting?.('onboardingCompletedAt', Date.now());
                } catch (_) {}
            } finally {
                busy = false;
                hide();
            }
        }

        function finishSkip() {
            void (async () => {
                try {
                    await host.saveSetting?.('onboardingCompleted', true);
                    await host.saveSetting?.('onboardingCompletedAt', Date.now());
                } catch (_) {}
                hide();
            })();
        }

        let langPickerBound = false;

        function applyLanguage() {
            // When setup is hidden, the shell owns ui language. Calling setLocale here
            // from applyUiLanguage used to stomp every non-English switch back to the
            // onboarding state's default ("en") until the next app restart.
            if (!visible) return;
            const I = global.AxisI18n;
            const effective = state.universalBrowserLanguage
                ? state.universalUiLanguage || state.uiLanguage || 'en'
                : state.uiLanguage || 'en';
            if (I) {
                I.setLocale(effective);
                I.applyToDom(document);
            }
            const pickerHost = document.getElementById('ob-ui-language-picker');
            if (I && pickerHost && typeof I.mountPicker === 'function') {
                const value = state.universalBrowserLanguage
                    ? state.universalUiLanguage || state.uiLanguage
                    : state.uiLanguage;
                const onPick = (code) => {
                    const next = I.sanitizeLocale(code) || 'en';
                    if (state.universalBrowserLanguage) {
                        if (next === state.universalUiLanguage) return;
                        state.universalUiLanguage = next;
                        state.uiLanguage = next;
                        I.setLocale(next);
                        I.applyToDom(document);
                        void host.saveSetting?.('universalUiLanguage', next);
                        if (host.settings) {
                            host.settings.universalUiLanguage = next;
                            host.settings.uiLanguage = next;
                        }
                        host.applyUiLanguage?.(next);
                        applyLanguage();
                        return;
                    }
                    if (next === state.uiLanguage) return;
                    state.uiLanguage = next;
                    state.universalUiLanguage = next;
                    I.setLocale(next);
                    I.applyToDom(document);
                    void host.saveSetting?.('uiLanguage', next);
                    if (host.settings) host.settings.uiLanguage = next;
                    host.applyUiLanguage?.(next);
                    applyLanguage();
                };
                I.mountPicker(pickerHost, {
                    value,
                    searchKey: 'onboarding.language.search',
                    onChange: onPick,
                    forceRemount: !langPickerBound
                });
                langPickerBound = true;
                const trigger = pickerHost.querySelector('.axis-lang-trigger');
                if (trigger) {
                    trigger.setAttribute('aria-label', I.t('onboarding.language.title'));
                }
            }
            const uni = document.getElementById('ob-universal-language');
            const uniOpt = document.getElementById('ob-universal-language-option');
            if (uni) {
                uni.checked = !!state.universalBrowserLanguage;
                uniOpt?.classList.toggle('is-checked', !!uni.checked);
                if (!uni._axisBound) {
                    uni._axisBound = true;
                    uni.addEventListener('change', () => {
                        state.universalBrowserLanguage = !!uni.checked;
                        uniOpt?.classList.toggle('is-checked', !!uni.checked);
                        if (state.universalBrowserLanguage) {
                            state.universalUiLanguage = state.uiLanguage || 'en';
                        }
                        void host.saveSetting?.('universalBrowserLanguage', {
                            enabled: state.universalBrowserLanguage,
                            universalUiLanguage: state.universalUiLanguage || state.uiLanguage || 'en'
                        });
                        if (host.settings) {
                            host.settings.universalBrowserLanguage = state.universalBrowserLanguage;
                            host.settings.universalUiLanguage =
                                state.universalUiLanguage || state.uiLanguage || 'en';
                            if (state.universalBrowserLanguage) {
                                host.settings.uiLanguage = host.settings.universalUiLanguage;
                            } else {
                                host.settings.uiLanguage = state.uiLanguage || 'en';
                            }
                            host.applyUiLanguage?.(host.settings.uiLanguage);
                        }
                        applyLanguage();
                    });
                }
            }
            renderImportOptions();
            renderStepper();
            syncFeatureChecks();
            if (activeSteps()[flowIndex]?.id === 'ready') prepareReady();
        }

        function show() {
            if (visible) return;
            try {
                visible = true;
                flowIndex = 0;
                busy = false;
                browsersCache = [];
                profilesCache = [];
                defaultStatusChecked = false;
                state.wantDefault = null;
                {
                    const I = global.AxisI18n;
                    const stored = I?.sanitizeLocale?.(host.settings?.uiLanguage) || '';
                    state.uiLanguage = stored || I?.detectSystemLocale?.() || 'en';
                    I?.setLocale?.(state.uiLanguage);
                }
                state.universalBrowserLanguage = host.settings?.universalBrowserLanguage === true;
                state.universalUiLanguage =
                    (global.AxisI18n?.sanitizeLocale?.(host.settings?.universalUiLanguage) ||
                        state.uiLanguage ||
                        'en');
                state.searchEngine = host.settings?.searchEngine || 'google';
                state.dataMode = null;
                state.browserId = null;
                state.profileMode = 'all';
                state.selectedProfileIds = [];
                state.uiTheme =
                    host.settings?.uiTheme === 'light' || host.settings?.uiTheme === 'system'
                        ? host.settings.uiTheme
                        : 'dark';
                state.sidebarPosition = host.settings?.sidebarPosition === 'right' ? 'right' : 'left';
                {
                    const raw = String(host.settings?.ntpGreetingName ?? '').trim();
                    state.greetingName = !raw || raw === 'User' ? '' : raw;
                }
                state.adBlockerEnabled = host.settings?.adBlockerEnabled !== false;
                state.aiFeaturesEnabled = host.settings?.aiFeaturesEnabled !== false;
                {
                    const rawMode = host.settings?.unpinnedClearMode || 'never';
                    const rawCustomMins = Number(host.settings?.unpinnedClearCustomMinutes);
                    state.unpinnedClearCustomMinutes = clampUnpinnedCustomMinutes(
                        Number.isFinite(rawCustomMins) ? rawCustomMins : 60
                    );
                    if (rawMode === 'app-close' || rawMode === '24h' || rawMode === 'never') {
                        state.unpinnedClearMode = rawMode;
                    } else if (rawMode === 'custom' || rawMode === 'profile-switch') {
                        state.unpinnedClearMode = 'custom';
                    } else if (UNPINNED_CLEAR_PRESET_MINUTES[rawMode]) {
                        state.unpinnedClearMode = 'custom';
                        state.unpinnedClearCustomMinutes = UNPINNED_CLEAR_PRESET_MINUTES[rawMode];
                    } else {
                        state.unpinnedClearMode = 'never';
                    }
                }
                state.importOpts = {
                    importFavorites: true,
                    importBookmarks: true,
                    importFolders: true,
                    importOpenTabs: false,
                    importHistory: true,
                    importPasswords: true,
                    importExtensions: true,
                    importCards: true,
                    importAddresses: true,
                    importSitePermissions: true
                };
                setThemeColor(host.settings?.themeColor || '#1a1a1a');
                renderImportOptions();
                syncTheme();
                syncChoiceUi();
                applyLanguage();
                showScreen('welcome', { animate: true });
                root.classList.remove('hidden');
                root.hidden = false;
                root.classList.add('is-visible');
                document.body.classList.add('axis-onboarding-active');
                setAppShellSuppressed(true);
                startBtn?.focus?.();
            } catch (err) {
                console.error('Onboarding show failed:', err);
                visible = false;
                document.body.classList.remove(
                    'axis-onboarding-active',
                    'axis-onboarding-leaving',
                    'axis-onboarding-revealing'
                );
                setAppShellSuppressed(false);
                root.classList.remove('is-visible');
                root.classList.add('hidden');
                root.hidden = true;
            }
        }

        function setAppShellSuppressed(on) {
            const app = document.getElementById('app');
            if (!app) return;
            if (on) {
                app.setAttribute('aria-hidden', 'true');
                app.setAttribute('inert', '');
            } else {
                app.removeAttribute('aria-hidden');
                app.removeAttribute('inert');
            }
        }

        function hide({ animate = true } = {}) {
            if (!visible) return;
            visible = false;
            const exitingFromSkip = skipConfirmOpen || root.classList.contains('is-skip-confirm');
            if (exitingFromSkip) {
                /* Keep the confirm screen covering setup so we fade straight to the app. */
                clearSkipConfirmSilent();
            } else {
                setSkipConfirmOpen(false);
            }
            const revealApp = () => {
                // Two-step opacity: hold at 0 for one frame, then fade to 1.
                document.body.classList.add('axis-onboarding-leaving');
                document.body.classList.remove('axis-onboarding-active', 'axis-onboarding-revealing');
                setAppShellSuppressed(false);
                flushShellAfterOnboarding();
                requestAnimationFrame(() => {
                    document.body.classList.add('axis-onboarding-revealing');
                    window.setTimeout(() => {
                        document.body.classList.remove(
                            'axis-onboarding-leaving',
                            'axis-onboarding-revealing'
                        );
                    }, 480);
                });
            };
            const finishHide = () => {
                root.classList.remove('is-visible', 'is-leaving', 'is-skip-confirm');
                skipOverlay?.classList.remove('is-open', 'is-leaving');
                if (skipOverlay) {
                    skipOverlay.hidden = true;
                    skipOverlay.setAttribute('aria-hidden', 'true');
                }
                const shell = root.querySelector('.ob-shell');
                if (shell) {
                    shell.removeAttribute('inert');
                    shell.removeAttribute('aria-hidden');
                }
                root.classList.add('hidden');
                root.hidden = true;
                revealApp();
            };
            if (!animate) {
                finishHide();
                return;
            }
            // Keep axis-onboarding-active until fade ends - otherwise the shell
            // pops under a translucent overlay and the leave looks glitchy.
            root.classList.add('is-leaving');
            if (exitingFromSkip) root.classList.add('is-skip-confirm');
            root.classList.remove('is-visible');
            window.setTimeout(finishHide, 460);
        }

        function shouldShow() {
            if (host.isIncognitoWindow) return false;
            if (AXIS_ONBOARDING_FORCE_EVERY_LAUNCH) return true;
            return host.settings?.onboardingCompleted !== true;
        }

        startBtn?.addEventListener('click', () => goFlow(0));
        backBtn?.addEventListener('click', () => {
            if (busy) return;
            if (flowIndex <= 0) {
                showScreen('welcome');
                return;
            }
            goFlow(flowIndex - 1);
        });
        skipBtn?.addEventListener('click', () => {
            if (busy) return;
            setSkipConfirmOpen(true);
        });
        skipConfirmBtn?.addEventListener('click', () => {
            if (busy) return;
            finishSkip();
        });
        skipContinueBtn?.addEventListener('click', () => {
            if (busy) return;
            setSkipConfirmOpen(false);
        });
        nextBtn?.addEventListener('click', () => {
            if (busy || !canContinue()) return;
            const steps = activeSteps();
            if (flowIndex >= steps.length - 1) {
                void finishAndClose();
                return;
            }
            goFlow(flowIndex + 1);
        });

        root.addEventListener('click', (e) => {
            if (busy) return;
            const jump = e.target.closest('[data-ob-step-jump]');
            if (jump && !jump.disabled) {
                const idx = Number(jump.getAttribute('data-ob-step-jump'));
                if (Number.isFinite(idx) && idx <= flowIndex) goFlow(idx);
                return;
            }
            const defBtn = e.target.closest('[data-ob-default]');
            if (defBtn) {
                state.wantDefault = defBtn.getAttribute('data-ob-default') === 'yes';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const searchBtn = e.target.closest('[data-ob-search]');
            if (searchBtn) {
                state.searchEngine = searchBtn.getAttribute('data-ob-search') || 'google';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const dataBtn = e.target.closest('[data-ob-data]');
            if (dataBtn) {
                state.dataMode = dataBtn.getAttribute('data-ob-data') === 'import' ? 'import' : 'fresh';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const browserBtn = e.target.closest('[data-ob-browser]');
            if (browserBtn) {
                state.browserId = browserBtn.getAttribute('data-ob-browser');
                syncChoiceUi();
                void loadProfiles(state.browserId);
                return;
            }
            const changeBrowser = e.target.closest('[data-ob-change-browser]');
            if (changeBrowser) {
                state.browserId = null;
                profilesCache = [];
                state.selectedProfileIds = [];
                if (profileList) profileList.innerHTML = '';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const modeBtn = e.target.closest('[data-ob-profile-mode]');
            if (modeBtn) {
                state.profileMode = modeBtn.getAttribute('data-ob-profile-mode') === 'pick' ? 'pick' : 'all';
                if (state.profileMode === 'all') {
                    state.selectedProfileIds = profilesCache.map((p) => p.id);
                }
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const uiBtn = e.target.closest('[data-ob-ui-theme]');
            if (uiBtn) {
                const v = uiBtn.getAttribute('data-ob-ui-theme');
                state.uiTheme = v === 'light' || v === 'system' ? v : 'dark';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const sideBtn = e.target.closest('[data-ob-sidebar]');
            if (sideBtn) {
                state.sidebarPosition = sideBtn.getAttribute('data-ob-sidebar') === 'right' ? 'right' : 'left';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const featureBtn = e.target.closest('[data-ob-feature]');
            if (featureBtn) {
                const key = featureBtn.getAttribute('data-ob-feature');
                if (FEATURE_KEYS.includes(key)) {
                    state[key] = !state[key];
                    syncChoiceUi();
                    updateNextEnabled();
                }
                return;
            }
            const unpinnedBtn = e.target.closest('[data-ob-unpinned]');
            if (unpinnedBtn) {
                const mode = unpinnedBtn.getAttribute('data-ob-unpinned') || 'never';
                if (mode === 'custom') {
                    state.unpinnedClearMode = 'custom';
                    state.unpinnedClearCustomMinutes = clampUnpinnedCustomMinutes(state.unpinnedClearCustomMinutes);
                } else {
                    state.unpinnedClearMode = UNPINNED_CLEAR_LABELS[mode] ? mode : 'never';
                }
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const profileChip = e.target.closest('[data-ob-profile]');
            if (profileChip) {
                const id = profileChip.getAttribute('data-ob-profile');
                if (!id) return;
                if (state.selectedProfileIds.includes(id)) {
                    if (state.selectedProfileIds.length <= 1) return;
                    state.selectedProfileIds = state.selectedProfileIds.filter((x) => x !== id);
                } else {
                    state.selectedProfileIds.push(id);
                }
                state.profileMode = 'pick';
                syncChoiceUi();
                updateNextEnabled();
                return;
            }
            const importChip = e.target.closest('[data-ob-import-opt]');
            if (importChip) {
                const key = importChip.getAttribute('data-ob-import-opt');
                if (!key || !(key in state.importOpts)) return;
                state.importOpts[key] = state.importOpts[key] === false;
                syncChoiceUi();
                updateNextEnabled();
            }
        });

        greetingNameInput?.addEventListener('input', () => {
            if (busy) return;
            state.greetingName = greetingNameInput.value || '';
            updateNextEnabled();
        });

        themeColorInput?.addEventListener('input', () => {
            if (busy) return;
            setThemeColor(themeColorInput.value);
            updateNextEnabled();
        });
        themeHexInput?.addEventListener('input', () => {
            if (busy) return;
            const raw = String(themeHexInput.value || '').trim();
            if (!/^#?[0-9a-fA-F]{6}$/.test(raw) && !/^#?[0-9a-fA-F]{3}$/.test(raw)) return;
            setThemeColor(raw, { syncInputs: false });
            if (themeColorInput) themeColorInput.value = state.themeColor;
            updateNextEnabled();
        });
        themeHexInput?.addEventListener('blur', () => {
            setThemeColor(themeHexInput.value || state.themeColor);
            updateNextEnabled();
        });

        unpinnedCustomMinutesInput?.addEventListener('input', () => {
            if (busy) return;
            if (state.unpinnedClearMode !== 'custom') return;
            const raw = String(unpinnedCustomMinutesInput.value || '');
            if (!raw.trim()) return;
            state.unpinnedClearCustomMinutes = clampUnpinnedCustomMinutes(raw);
            unpinnedCustomMinutesInput.value = String(state.unpinnedClearCustomMinutes);
            updateNextEnabled();
        });

        unpinnedCustomMinutesInput?.addEventListener('blur', () => {
            if (!unpinnedCustomMinutesInput) return;
            if (state.unpinnedClearMode !== 'custom') return;
            const raw = String(unpinnedCustomMinutesInput.value || '');
            if (!raw.trim()) unpinnedCustomMinutesInput.value = String(state.unpinnedClearCustomMinutes);
            state.unpinnedClearCustomMinutes = clampUnpinnedCustomMinutes(unpinnedCustomMinutesInput.value);
            unpinnedCustomMinutesInput.value = String(state.unpinnedClearCustomMinutes);
            updateNextEnabled();
        });

        document.addEventListener('keydown', (e) => {
            if (!visible || busy) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (skipConfirmOpen) {
                    setSkipConfirmOpen(false);
                    return;
                }
                setSkipConfirmOpen(true);
                return;
            }
            if (!skipConfirmOpen) return;
            if (e.key === 'Tab' && skipOverlay) {
                const focusables = [skipContinueBtn, skipConfirmBtn].filter(Boolean);
                if (focusables.length < 2) return;
                const first = focusables[0];
                const last = focusables[focusables.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        });

        return {
            shouldShow,
            show,
            hide,
            finish: finishSkip,
            syncTheme,
            applyLanguage,
            syncUiLanguage: (code) => {
                const I = global.AxisI18n;
                const next = I?.sanitizeLocale?.(code) || code || 'en';
                state.uiLanguage = next;
            },
            isVisible: () => visible
        };
    }

    global.AxisOnboarding = {
        FORCE_EVERY_LAUNCH: AXIS_ONBOARDING_FORCE_EVERY_LAUNCH,
        createController
    };
})(typeof window !== 'undefined' ? window : globalThis);
