/**
 * First-run setup overlay.
 * Testing: forced every launch via AXIS_ONBOARDING_FORCE_EVERY_LAUNCH.
 */
(function (global) {
    /** @type {boolean} Set false later to only show once. */
    const AXIS_ONBOARDING_FORCE_EVERY_LAUNCH = true;

    const FLOW_STEPS = [
        { id: 'default', label: 'Default', titleId: 'ob-default-title' },
        { id: 'search', label: 'Search', titleId: 'ob-search-title' },
        { id: 'data', label: 'Data', titleId: 'ob-data-title' },
        { id: 'import', label: 'Import', titleId: 'ob-import-title', when: (s) => s.dataMode === 'import' },
        { id: 'look', label: 'Look', titleId: 'ob-look-title' },
        { id: 'you', label: 'You', titleId: 'ob-you-title' },
        { id: 'features', label: 'Features', titleId: 'ob-features-title' },
        { id: 'ready', label: 'Ready', titleId: 'ob-ready-title' }
    ];

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
        { key: 'importFavorites', label: 'Favorites & pinned tabs', desc: '→ Favorites in Axis' },
        { key: 'importBookmarks', label: 'Bookmarks', desc: '→ Pinned tabs' },
        { key: 'importFolders', label: 'Tab groups', desc: 'From bookmark folders' },
        { key: 'importOpenTabs', label: 'Open tabs', desc: '→ Unpinned tabs (off by default)' },
        { key: 'importHistory', label: 'History', desc: 'Sites you’ve visited' },
        { key: 'importPasswords', label: 'Passwords', desc: 'Saved logins' },
        { key: 'importCards', label: 'Payment cards', desc: 'Saved card details' },
        { key: 'importAddresses', label: 'Addresses', desc: 'Autofill addresses' },
        { key: 'importSitePermissions', label: 'Site permissions', desc: 'Camera, mic, location, notifications' },
        { key: 'importExtensions', label: 'Extensions', desc: 'Re-download when possible' }
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
        const backBtn = document.getElementById('ob-back-btn');
        const nextBtn = document.getElementById('ob-next-btn');
        const nextLabel = document.getElementById('ob-next-label');
        const unpinnedCustomRow = document.getElementById('ob-unpinned-custom-row');
        const unpinnedCustomMinutesInput = document.getElementById('ob-unpinned-custom-minutes');

        let visible = false;
        let step = 'welcome';
        let flowIndex = 0;
        let busy = false;
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
            adBlockerEnabled: true,
            aiFeaturesEnabled: true,
            unpinnedClearMode: 'app-close',
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
            /* Do not tint the setup backdrop with the chosen theme — that color
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
                if (stateEl) stateEl.textContent = on ? 'On' : 'Off';
            });
            const mode = state.unpinnedClearMode || 'app-close';
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
  <span class="ob-import-chip-title">${escapeHtml(opt.label)}</span>
  <span class="ob-import-chip-desc">${escapeHtml(opt.desc)}</span>
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
    <span class="ob-browser-card-meta">${count} profile${count === 1 ? '' : 's'}</span>
  </div>
  <button type="button" class="ob-browser-change" data-ob-change-browser>Change</button>
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
                stepCaption.textContent = cur ? `${flowIndex + 1} of ${total} · ${cur.label}` : '';
            }
            if (!stepper) return;
            stepper.innerHTML = steps
                .map((s, i) => {
                    const st = i < flowIndex ? 'is-done' : i === flowIndex ? 'is-active' : '';
                    return `<button type="button" class="ob-step ${st}" data-ob-step-jump="${i}" ${i > flowIndex ? 'disabled' : ''} aria-current="${i === flowIndex ? 'step' : 'false'}">
  <span class="ob-step-num">${i < flowIndex ? '✓' : i + 1}</span>
  <span class="ob-step-label">${escapeHtml(s.label)}</span>
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
                const mode = state.unpinnedClearMode || 'app-close';
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

        function updateNextEnabled() {
            if (nextBtn) nextBtn.disabled = busy || !canContinue();
            if (backBtn) backBtn.disabled = busy;
            if (skipBtn) skipBtn.disabled = busy;
        }

        async function refreshDefaultStatus() {
            if (!defaultHint || defaultStatusChecked) return;
            defaultStatusChecked = true;
            try {
                const status = await window.electronAPI?.getDefaultBrowserStatus?.();
                if (status?.isDefault) {
                    defaultHint.hidden = false;
                    defaultHint.textContent = 'Axis is already your default browser.';
                    if (state.wantDefault === null) {
                        state.wantDefault = true;
                        syncChoiceUi();
                        updateNextEnabled();
                    }
                }
            } catch (_) {}
        }

        function showScreen(name, { animate = true } = {}) {
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
                nextLabel.textContent = current.id === 'ready' ? 'Open Axis' : 'Continue';
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
                browserList.innerHTML = `<div class="ob-empty">Looking for browsers…</div>`;
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
                state.browserId = null;
                browserList.hidden = false;
                browserList.innerHTML = `<div class="ob-empty">No supported browsers with profiles were found. You can import later from Settings → Profiles, or go back and start fresh.</div>`;
                if (browserSelected) {
                    browserSelected.hidden = true;
                    browserSelected.innerHTML = '';
                }
                if (profilesWrap) profilesWrap.hidden = true;
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
    <span class="ob-browser-card-meta">${count} profile${count === 1 ? '' : 's'}</span>
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
            profileList.innerHTML = `<div class="ob-empty">Loading profiles…</div>`;
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
                profileList.innerHTML = `<div class="ob-empty">No profiles found in that browser.</div>`;
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
            rows.push({
                label: 'Default browser',
                value: state.wantDefault ? 'Set Axis as default' : 'Keep current default'
            });
            rows.push({
                label: 'Search',
                value: SEARCH_LABELS[state.searchEngine] || state.searchEngine
            });
            if (state.dataMode === 'import' && state.browserId) {
                const browser = browsersCache.find((b) => b.id === state.browserId);
                const n =
                    state.profileMode === 'all'
                        ? profilesCache.length
                        : state.selectedProfileIds.length;
                rows.push({
                    label: 'Import',
                    value: `${browser?.name || state.browserId} · ${n} profile${n === 1 ? '' : 's'}`
                });
            } else {
                rows.push({ label: 'Data', value: 'Start fresh' });
            }
            const look =
                state.uiTheme === 'system'
                    ? 'Match system'
                    : state.uiTheme === 'light'
                      ? 'Light'
                      : 'Dark';
            rows.push({
                label: 'Look',
                value: `${look} · ${state.themeColor.toUpperCase()} · Sidebar ${state.sidebarPosition}`
            });
            const name = String(state.greetingName || '').trim();
            rows.push({
                label: 'Name',
                value: name || 'Not set'
            });
            const featureBits = [];
            if (state.adBlockerEnabled) featureBits.push('Ad blocker');
            if (state.aiFeaturesEnabled) featureBits.push('AI');
            rows.push({
                label: 'Features',
                value: featureBits.length ? featureBits.join(' · ') : 'All off'
            });
            const unpinnedMode = state.unpinnedClearMode || 'app-close';
            const unpinnedValue =
                unpinnedMode === 'custom'
                    ? `Every ${state.unpinnedClearCustomMinutes} minutes`
                    : UNPINNED_CLEAR_LABELS[unpinnedMode] || unpinnedMode;
            rows.push({
                label: 'Clear tabs',
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
                ['searchEngine', state.searchEngine],
                ['themeColor', state.themeColor],
                ['uiTheme', state.uiTheme],
                ['sidebarPosition', state.sidebarPosition],
                ['ntpGreetingName', name],
                ['unpinnedClearMode', state.unpinnedClearMode || 'app-close'],
                ['unpinnedClearCustomMinutes', state.unpinnedClearCustomMinutes || 60],
                ...FEATURE_KEYS.map((key) => [key, !!state[key]])
            ];
            for (const [key, value] of pairs) {
                try {
                    await host.saveSetting?.(key, value);
                    if (host.settings) host.settings[key] = value;
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
                                    ? `Imported ${result.count} profile${result.count === 1 ? '' : 's'}.`
                                    : 'Import finished.';
                            if (Array.isArray(result.warnings) && result.warnings.length > 0) {
                                text += ` ${result.warnings[0]}`;
                            }
                            readyStatus.textContent = text;
                        } else {
                            readyStatus.textContent =
                                result.error ||
                                (result.errors && result.errors[0]) ||
                                'Import had problems — you can retry in Settings → Profiles.';
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
                    const rawMode = host.settings?.unpinnedClearMode || 'app-close';
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
                        state.unpinnedClearMode = 'app-close';
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
                root.classList.remove('is-visible', 'is-leaving');
                root.classList.add('hidden');
                root.hidden = true;
                revealApp();
            };
            if (!animate) {
                finishHide();
                return;
            }
            // Keep axis-onboarding-active until fade ends — otherwise the shell
            // pops under a translucent overlay and the leave looks glitchy.
            root.classList.add('is-leaving');
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
            finishSkip();
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
                const mode = unpinnedBtn.getAttribute('data-ob-unpinned') || 'app-close';
                if (mode === 'custom') {
                    state.unpinnedClearMode = 'custom';
                    state.unpinnedClearCustomMinutes = clampUnpinnedCustomMinutes(state.unpinnedClearCustomMinutes);
                } else {
                    state.unpinnedClearMode = UNPINNED_CLEAR_LABELS[mode] ? mode : 'app-close';
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
                finishSkip();
            }
        });

        return {
            shouldShow,
            show,
            hide,
            finish: finishSkip,
            syncTheme,
            isVisible: () => visible
        };
    }

    global.AxisOnboarding = {
        FORCE_EVERY_LAUNCH: AXIS_ONBOARDING_FORCE_EVERY_LAUNCH,
        createController
    };
})(typeof window !== 'undefined' ? window : globalThis);
