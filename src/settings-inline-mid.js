        (function paintSettingsProfileSwitcherSync() {
            function escapeHtml(str) {
                if (!str) return '';
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            }
            function avatarMarkup(iconId) {
                return window.AXIS_PROFILE_ICONS?.profileIconSvgMarkup?.(iconId) || '';
            }
            function paint(ctx) {
                const profiles = Array.isArray(ctx?.profiles) ? ctx.profiles : [];
                const incognitoProfile = ctx?.incognitoProfile || {
                    id: 'incognito',
                    name: 'Incognito',
                    icon: 'mask'
                };
                const activeId =
                    ctx?.profileId ||
                    new URLSearchParams(location.search).get('profile') ||
                    'personal';
                const wrap = document.getElementById('settings-profile-switch');
                if (!wrap) return;
                wrap.classList.remove('is-hidden');
                const active =
                    activeId === 'incognito'
                        ? incognitoProfile
                        : profiles.find((p) => p.id === activeId) || profiles[0];
                const nameEl = document.getElementById('settings-profile-trigger-name');
                const avatarEl = document.getElementById('settings-profile-trigger-avatar');
                const list = document.getElementById('settings-profile-list');
                if (nameEl) nameEl.textContent = active?.name || active?.id || 'Profile';
                if (avatarEl) avatarEl.innerHTML = avatarMarkup(active?.icon);
                if (!list) return;
                const regularHtml = profiles
                    .map((p) => {
                        const isActive = p.id === activeId;
                        return `<button type="button" class="settings-profile-row${
                            isActive ? ' is-active' : ''
                        }" data-profile-id="${escapeHtml(p.id)}" role="option" aria-selected="${
                            isActive ? 'true' : 'false'
                        }">
                            <span class="settings-profile-avatar" aria-hidden="true">${avatarMarkup(p.icon)}</span>
                            <span class="settings-profile-name">${escapeHtml(p.name || p.id)}</span>
                            ${
                                isActive
                                    ? '<span class="settings-profile-check" aria-hidden="true">✓</span>'
                                    : ''
                            }
                        </button>`;
                    })
                    .join('');
                const incogActive = activeId === 'incognito';
                const incogHtml = `<div class="settings-profile-divider" role="presentation">Private browsing</div>
                    <button type="button" class="settings-profile-row settings-profile-row--incognito${
                        incogActive ? ' is-active' : ''
                    }" data-profile-id="incognito" role="option" aria-selected="${incogActive ? 'true' : 'false'}">
                        <span class="settings-profile-avatar" aria-hidden="true">${avatarMarkup('mask')}</span>
                        <span class="settings-profile-name">${escapeHtml(incognitoProfile.name || 'Incognito')}</span>
                        ${
                            incogActive
                                ? '<span class="settings-profile-check" aria-hidden="true">✓</span>'
                                : ''
                        }
                    </button>`;
                list.innerHTML = regularHtml + incogHtml;
            }
            try {
                const ctx = window.electronAPI?.getSettingsProfileBootstrap?.();
                if (ctx) paint(ctx);
            } catch (_) {}
            window.__axisPaintSettingsProfileSwitcher = paint;
        })();

        (function applyBootstrapLocaleAndFont() {
            try {
                const boot = window.electronAPI?.getSettingsWindowBootstrap?.();
                if (!boot) return;
                const I = window.AxisI18n;
                if (boot.uiLanguage && I) {
                    const loc = I.sanitizeLocale?.(boot.uiLanguage) || boot.uiLanguage || 'en';
                    I.setLocale(loc);
                    I.applyToDom(document);
                }
                const F = window.AxisUiFonts;
                if (boot.uiFont && F?.applyToDocument) {
                    const fontId = F.sanitizeId?.(boot.uiFont) || boot.uiFont || 'default';
                    F.applyToDocument(document, fontId);
                }
            } catch (_) {}
        })();

        (function applySettingsFormBootstrap() {
            try {
                const s = window.electronAPI?.getSettingsWindowBootstrap?.()?.settings;
                if (!s || typeof s !== 'object') return;
                const setVal = (id, value) => {
                    const el = document.getElementById(id);
                    if (el && value != null) el.value = String(value);
                };
                const setCheck = (id, value) => {
                    const el = document.getElementById(id);
                    if (el) el.checked = !!value;
                };
                setVal(
                    'ui-theme',
                    s.uiTheme === 'light' || s.uiTheme === 'system' ? s.uiTheme : 'dark'
                );
                setVal('sidebar-position', s.sidebarPosition === 'right' ? 'right' : 'left');
                setVal('search-engine', s.searchEngine || 'google');
                setCheck('always-show-full-url', s.alwaysShowFullUrl);
                setCheck('https-only-mode', s.httpsOnlyMode);
                setCheck('ad-blocker-enabled', s.adBlockerEnabled !== false);
                setCheck('javascript-enabled', s.javascriptEnabled !== false);
                setCheck('link-preview', s.linkPreview !== false);
                setCheck('gradient-enabled', s.gradientEnabled);
                setCheck('transparent-sites', s.transparentSites);
                setCheck('site-theme-color', s.siteThemeColor);
                setVal('theme-color', s.themeColor || '#1a1a1a');
                setVal('gradient-color', s.gradientColor || '#2a2a2a');
                setVal('gradient-direction', s.gradientDirection || '135deg');
                setVal('unpinned-clear-mode', s.unpinnedClearMode || 'app-close');
            } catch (_) {}
        })();
    
