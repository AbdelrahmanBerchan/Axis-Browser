        (async function() {
            async function waitForElectronAPI(timeoutMs = 5000) {
                const start = Date.now();
                while (typeof window.electronAPI === 'undefined') {
                    if (Date.now() - start > timeoutMs) return false;
                    await new Promise((resolve) => setTimeout(resolve, 16));
                }
                return typeof window.electronAPI !== 'undefined';
            }

            if (!(await waitForElectronAPI())) {
                const mainInner = document.querySelector('.main-inner');
                if (mainInner) {
                    mainInner.innerHTML =
                        '<div class="empty-state" style="padding:24px;text-align:center;">Settings could not connect to Axis. Close this tab and open Settings again.</div>';
                }
                return;
            }

            let settingsEditingProfileId = 'personal';
            let settingsProfileMenuOpen = false;

            function escapeHtml(str) {
                if (!str) return '';
                const div = document.createElement('div');
                div.textContent = str;
                return div.innerHTML;
            }

            function settingsProfileAvatarMarkup(iconId) {
                return window.AXIS_PROFILE_ICONS?.profileIconSvgMarkup?.(iconId) || '';
            }

            function closeSettingsProfileMenu() {
                const menu = document.getElementById('settings-profile-menu');
                const trigger = document.getElementById('settings-profile-trigger');
                menu?.classList.add('hidden');
                trigger?.setAttribute('aria-expanded', 'false');
                settingsProfileMenuOpen = false;
            }

            function openSettingsProfileMenu() {
                const menu = document.getElementById('settings-profile-menu');
                const trigger = document.getElementById('settings-profile-trigger');
                menu?.classList.remove('hidden');
                trigger?.setAttribute('aria-expanded', 'true');
                settingsProfileMenuOpen = true;
            }

            function toggleSettingsProfileMenu() {
                if (settingsProfileMenuOpen) closeSettingsProfileMenu();
                else openSettingsProfileMenu();
            }

            function updateSettingsProfileTrigger(profiles, activeId) {
                const wrap = document.getElementById('settings-profile-switch');
                const rows = Array.isArray(profiles) ? profiles : [];
                if (!wrap) return;
                if (rows.length < 2) {
                    wrap.classList.add('is-hidden');
                    closeSettingsProfileMenu();
                    return;
                }
                wrap.classList.remove('is-hidden');
                const active = rows.find((p) => p.id === activeId) || rows[0];
                const nameEl = document.getElementById('settings-profile-trigger-name');
                const avatarEl = document.getElementById('settings-profile-trigger-avatar');
                if (nameEl) nameEl.textContent = active?.name || active?.id || 'Profile';
                if (avatarEl) avatarEl.innerHTML = settingsProfileAvatarMarkup(active?.icon);
            }

            function wireSettingsProfileListHandlers() {
                const list = document.getElementById('settings-profile-list');
                if (!list) return;
                list.querySelectorAll('.settings-profile-row').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const id = btn.dataset.profileId;
                        if (id === settingsEditingProfileId) {
                            closeSettingsProfileMenu();
                            return;
                        }
                        if (id) void reloadSettingsForEditingProfile(id);
                    });
                });
            }

            function renderSettingsProfileList(profiles, activeId) {
                const list = document.getElementById('settings-profile-list');
                if (!list) return;
                updateSettingsProfileTrigger(profiles, activeId);
                const rows = Array.isArray(profiles) ? profiles : [];
                if (!rows.length) {
                    list.innerHTML =
                        '<div style="padding:6px 8px;font-size:12px;color:#86868b;">No profiles</div>';
                    return;
                }
                list.innerHTML = rows
                    .map((p) => {
                        const active = p.id === activeId;
                        const avatarMarkup = settingsProfileAvatarMarkup(p.icon);
                        return `<button type="button" class="settings-profile-row${
                            active ? ' is-active' : ''
                        }" data-profile-id="${escapeHtml(p.id)}" role="option" aria-selected="${
                            active ? 'true' : 'false'
                        }">
                            <span class="settings-profile-avatar" aria-hidden="true">${avatarMarkup}</span>
                            <span class="settings-profile-name">${escapeHtml(p.name || p.id)}</span>
                            ${active ? '<span class="settings-profile-check" aria-hidden="true">✓</span>' : ''}
                        </button>`;
                    })
                    .join('');
                wireSettingsProfileListHandlers();
            }

            function bootstrapSettingsEditingProfileSwitcher() {
                const urlProfile = new URLSearchParams(location.search).get('profile');
                let ctx = { profileId: urlProfile || 'personal', profiles: [] };
                try {
                    ctx = window.electronAPI?.getSettingsProfileBootstrap?.() || ctx;
                } catch (_) {}
                settingsEditingProfileId = ctx.profileId || urlProfile || 'personal';
                if (typeof window.__axisPaintSettingsProfileSwitcher === 'function') {
                    window.__axisPaintSettingsProfileSwitcher(ctx);
                }
                renderSettingsProfileList(ctx.profiles || [], settingsEditingProfileId);
            }

            bootstrapSettingsEditingProfileSwitcher();

            document.getElementById('settings-profile-trigger')?.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleSettingsProfileMenu();
            });
            document.addEventListener('click', (e) => {
                if (!settingsProfileMenuOpen) return;
                if (e.target.closest('#settings-profile-switch')) return;
                closeSettingsProfileMenu();
            });
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Escape' && settingsProfileMenuOpen) closeSettingsProfileMenu();
            });

            const THEME_KEYS = ['themeColor', 'gradientColor', 'gradientEnabled', 'gradientDirection', 'transparentSites', 'siteThemeColor', 'windowChromeLight', 'uiTheme'];
            const SHORTCUT_ACTIONS = [
                { action: 'spotlight-search', label: 'New Tab' },
                { action: 'close-tab', label: 'Close Tab' },
                { action: 'new-tab', label: 'New Window' },
                { action: 'next-tab', label: 'Show Next Tab' },
                { action: 'previous-tab', label: 'Show Previous Tab' },
                { action: 'next-profile', label: 'Switch to Next Profile' },
                { action: 'previous-profile', label: 'Switch to Previous Profile' },
                { action: 'recover-tab', label: 'Undo' },
                { action: 'refresh', label: 'Refresh' },
                { action: 'focus-url', label: 'Focus URL Bar' },
                { action: 'duplicate-tab', label: 'Duplicate Tab' },
                { action: 'find', label: 'Find in Page' },
                { action: 'select-all', label: 'Select All' },
                { action: 'paste-match-style', label: 'Paste and Match Style' },
                { action: 'print', label: 'Print Page' },
                { action: 'copy-url', label: 'Copy URL' },
                { action: 'copy-url-markdown', label: 'Copy URL as Markdown' },
                { action: 'pin-tab', label: 'Pin Tab' },
                { action: 'toggle-mute-tab', label: 'Mute / Unmute Tab' },
                { action: 'zoom-in', label: 'Zoom In' },
                { action: 'zoom-out', label: 'Zoom Out' },
                { action: 'reset-zoom', label: 'Reset Zoom' },
                { action: 'toggle-sidebar', label: 'Toggle Sidebar' },
                { action: 'history', label: 'History' },
                { action: 'downloads', label: 'Downloads' },
                { action: 'toggle-chat', label: 'Open Chat' },
                { action: 'settings', label: 'Settings' },
                { action: 'clear-history', label: 'Clear History' },
                ...Array.from({ length: 9 }, (_, i) => ({
                    action: 'switch-tab-' + (i + 1),
                    label: 'Switch to tab ' + (i + 1)
                }))
            ];
            
            const VAULT_EYE_SVG =
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';

            function mountVaultEyeButton(btn) {
                if (!btn) return;
                btn.innerHTML = VAULT_EYE_SVG;
            }
            
            function formatTimeAgo(timestamp) {
                const now = new Date();
                const time = new Date(timestamp);
                const diffMs = now - time;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMs / 3600000);
                const diffDays = Math.floor(diffMs / 86400000);
                if (diffMins < 1) return 'Just now';
                if (diffMins < 60) return diffMins + 'm ago';
                if (diffHours < 24) return diffHours + 'h ago';
                if (diffDays < 7) return diffDays + 'd ago';
                return time.toLocaleDateString();
            }
            
            function formatShortcut(s) {
                if (!s) return '';
                return s.replace(/Cmd/g, '⌘').replace(/Ctrl/g, '⌃').replace(/Alt/g, '⌥').replace(/Shift/g, '⇧').replace(/\+/g, ' + ');
            }
            
            async function saveSetting(key, value, _notifyTheme) {
                if (typeof window.electronAPI === 'undefined') return;
                // setSetting persists and broadcasts settings-updated with the new value —
                // no second notify (that forced a slower full reload).
                await window.electronAPI.setSetting(key, value);
                settings[key] = value;
            }
            
            // Load settings
            let settings = {};
            let shortcutDefaults = {};
            let shortcutOverrides = {};
            try {
                settings = await window.electronAPI.getSettings() || {};
                shortcutDefaults = await window.electronAPI.getDefaultShortcuts() || {};
                shortcutOverrides = await window.electronAPI.getShortcutOverrides() || {};
            } catch (e) { console.error(e); }
            
            // Populate form
            document.getElementById('ui-theme').value =
                settings.uiTheme === 'light' || settings.uiTheme === 'system' ? settings.uiTheme : 'dark';
            async function resolveEffectiveUiTheme() {
                const pref = settings?.uiTheme;
                if (pref === 'light') return 'light';
                if (pref === 'dark') return 'dark';
                if (pref === 'system') {
                    try {
                        const t = await window.electronAPI?.getSystemUiTheme?.();
                        return t === 'light' ? 'light' : 'dark';
                    } catch (_) {}
                }
                return 'dark';
            }
            async function syncSettingsLightTint() {
                const isLight = (await resolveEffectiveUiTheme()) === 'light';
                document.documentElement.classList.toggle('settings-light-tint', isLight);
                syncNativeWindowChromeTransparency();
            }
            function syncNativeWindowChromeTransparency() {
                if (!document.documentElement.classList.contains('settings-native-window')) return;
                const raw = Number(settings?.windowChromeLight);
                const isLight = document.documentElement.classList.contains('settings-light-tint');
                axisApplyNativeWindowChromeTransparency(raw, isLight);
            }
            syncSettingsLightTint();
            window.electronAPI?.onSystemUiThemeChanged?.(() => {
                if (settings?.uiTheme === 'system') void syncSettingsLightTint();
            });
            document.getElementById('sidebar-position').value = settings.sidebarPosition || 'left';
            function normalizeSidebarZoom(raw) {
                const n = Number(raw);
                const v = Number.isFinite(n) ? n : 100;
                return Math.max(75, Math.min(150, Math.round(v / 5) * 5));
            }
            function syncSidebarZoomControl(raw) {
                const zoom = normalizeSidebarZoom(raw);
                const input = document.getElementById('sidebar-zoom');
                const label = document.getElementById('sidebar-zoom-label');
                if (input) input.value = String(zoom);
                if (label) label.textContent = zoom + '%';
                settings.sidebarZoom = zoom;
            }
            syncSidebarZoomControl(settings.sidebarZoom);
            document.getElementById('search-engine').value = settings.searchEngine || 'google';
            document.getElementById('always-show-full-url').checked = !!settings.alwaysShowFullUrl;
            document.getElementById('https-only-mode').checked = !!settings.httpsOnlyMode;
            document.getElementById('ad-blocker-enabled').checked = settings.adBlockerEnabled !== false;
            document.getElementById('javascript-enabled').checked = settings.javascriptEnabled !== false;
            const unpinnedClearMode = settings.unpinnedClearMode || 'app-close';
            document.getElementById('unpinned-clear-mode').value = unpinnedClearMode;
            const unpinnedCustomMins = Math.min(10080, Math.max(1, Number(settings.unpinnedClearCustomMinutes) || 60));
            document.getElementById('unpinned-clear-custom-minutes').value = String(unpinnedCustomMins);
            function syncUnpinnedClearCustomRow() {
                const row = document.getElementById('unpinned-clear-custom-row');
                const modeEl = document.getElementById('unpinned-clear-mode');
                if (!row || !modeEl) return;
                row.classList.toggle('visible', modeEl.value === 'custom');
                row.style.removeProperty('display');
            }
            function syncGradientRowsVisibility() {
                const enabled = document.getElementById('gradient-enabled')?.checked === true;
                document.querySelectorAll('.gradient-rows').forEach((row) => {
                    row.classList.toggle('visible', enabled);
                    row.style.removeProperty('display');
                });
            }
            function syncConditionalSettingsRows() {
                syncGradientRowsVisibility();
                syncUnpinnedClearCustomRow();
                syncNtpSettingsNestedState();
            }
            syncUnpinnedClearCustomRow();
            document.getElementById('speech-enabled').checked = settings.speechEnabled !== false;
            document.getElementById('speech-rate').value = String(settings.speechRate || 1);
            document.getElementById('speech-pitch').value = String(settings.speechPitch || 1);

            let speechVoicePersist = settings.speechVoiceURI || '';
            function populateSpeechVoices() {
                const sel = document.getElementById('speech-voice');
                if (!sel || typeof window.speechSynthesis === 'undefined') return;
                const wasUserPick = sel.value;
                const voices = window.speechSynthesis.getVoices().slice().sort((a, b) => {
                    const la = (a.lang || '').toLowerCase();
                    const lb = (b.lang || '').toLowerCase();
                    if (la !== lb) return la.localeCompare(lb);
                    return (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' });
                });
                sel.innerHTML = '';
                const defOpt = document.createElement('option');
                defOpt.value = '';
                defOpt.textContent = 'Default';
                sel.appendChild(defOpt);
                voices.forEach((v) => {
                    const opt = document.createElement('option');
                    opt.value = v.voiceURI;
                    const tag = v.lang ? ' — ' + v.lang : '';
                    const remote = v.localService === false ? ' (cloud)' : '';
                    opt.textContent = (v.name || 'Voice') + tag + remote;
                    sel.appendChild(opt);
                });
                const candidates = [wasUserPick, speechVoicePersist, settings.speechVoiceURI || ''].filter(Boolean);
                let pick = '';
                for (const c of candidates) {
                    if (voices.some((v) => v.voiceURI === c)) {
                        pick = c;
                        break;
                    }
                }
                sel.value = pick;
                speechVoicePersist = pick;
            }
            populateSpeechVoices();
            if (window.speechSynthesis) {
                window.speechSynthesis.onvoiceschanged = populateSpeechVoices;
                window.speechSynthesis.getVoices();
                setTimeout(populateSpeechVoices, 250);
            }
            document.getElementById('theme-color').value = settings.themeColor || '#1a1a1a';
            document.getElementById('gradient-color').value = settings.gradientColor || '#2a2a2a';
            document.getElementById('gradient-enabled').checked = settings.gradientEnabled || false;
            document.getElementById('gradient-direction').value = settings.gradientDirection || '135deg';
            document.getElementById('transparent-sites').checked = !!settings.transparentSites;
            document.getElementById('site-theme-color').checked = !!settings.siteThemeColor;
            document.getElementById('link-preview').checked = settings.linkPreview !== false;

            function ensureAiProvidersFromSettings() {
                const norm = AxisAiProviders.normalizeSettings(settings);
                settings.aiProviders = norm.aiProviders;
                settings.activeAiProviderId = norm.activeAiProviderId;
            }
            ensureAiProvidersFromSettings();

            async function persistAiProviders() {
                ensureAiProvidersFromSettings();
                await saveSetting('aiProviders', settings.aiProviders, false);
                await saveSetting('activeAiProviderId', settings.activeAiProviderId || '', false);
            }

            async function migrateLegacyGroqKeyIfNeeded() {
                if (Array.isArray(settings.aiProviders) && settings.aiProviders.length) return;
                ensureAiProvidersFromSettings();
                if (!settings.aiProviders.length) return;
                await persistAiProviders();
            }
            void migrateLegacyGroqKeyIfNeeded();

            const aiProvidersList = document.getElementById('ai-providers-list');
            const aiProvidersEmpty = document.getElementById('ai-providers-empty');
            const aiProvidersToast = document.getElementById('ai-providers-toast');
            const aiProviderType = document.getElementById('ai-provider-type');
            const aiProviderLabel = document.getElementById('ai-provider-label');
            const aiProviderKey = document.getElementById('ai-provider-key');
            const aiProviderAddBtn = document.getElementById('ai-provider-add-btn');
            const aiProviderCancelBtn = document.getElementById('ai-provider-cancel-btn');
            const aiProviderOpenAddBtn = document.getElementById('ai-provider-open-add-btn');
            const aiProviderGetKeyBtn = document.getElementById('ai-provider-get-key-btn');
            const aiKeyAddBlock = document.getElementById('ai-key-add-block');
            const aiKeyToolbar = document.getElementById('ai-key-toolbar');
            const aiKeyFormTitle = document.getElementById('ai-key-form-title');
            const aiProviderRevealState = new Map();
            let aiProviderEditingId = null;

            function aiProvidersToastMsg(message, isError) {
                if (!aiProvidersToast) return;
                aiProvidersToast.textContent = message || '';
                aiProvidersToast.classList.toggle('error', !!isError);
            }

            function populateAiProviderTypeSelect() {
                if (!aiProviderType) return;
                aiProviderType.innerHTML = '';
                AxisAiProviders.listProviderDefs().forEach((def) => {
                    const opt = document.createElement('option');
                    opt.value = def.id;
                    opt.textContent = def.freeTier ? `${def.name} (Free)` : def.name;
                    aiProviderType.appendChild(opt);
                });
            }
            populateAiProviderTypeSelect();

            function syncAiProviderAddForm() {
                const def = AxisAiProviders.getProviderDef(aiProviderType?.value || 'groq');
                if (aiProviderKey && def?.keyPlaceholder) {
                    aiProviderKey.placeholder = `Paste key (${def.keyPlaceholder})`;
                }
            }
            syncAiProviderAddForm();
            aiProviderType?.addEventListener('change', syncAiProviderAddForm);

            function syncAiProviderKeyInputType() {
                if (!aiProviderKey) return;
                aiProviderKey.type = aiProviderEditingId ? 'text' : 'password';
            }

            function setAiProviderFormOpen(open) {
                aiKeyAddBlock?.classList.toggle('hidden', !open);
                aiKeyToolbar?.classList.toggle('hidden', !!open);
                if (aiProvidersToast) {
                    if (open) {
                        aiKeyAddBlock?.appendChild(aiProvidersToast);
                    } else {
                        aiKeyToolbar?.appendChild(aiProvidersToast);
                    }
                }
            }

            function resetAiProviderForm({ closeForm = true } = {}) {
                aiProviderEditingId = null;
                aiKeyAddBlock?.classList.remove('is-editing');
                if (aiKeyFormTitle) aiKeyFormTitle.textContent = 'Add API key';
                if (aiProviderAddBtn) aiProviderAddBtn.textContent = 'Save key';
                aiProviderCancelBtn?.classList.add('hidden');
                if (aiProviderType) aiProviderType.value = 'groq';
                if (aiProviderLabel) aiProviderLabel.value = '';
                if (aiProviderKey) aiProviderKey.value = '';
                syncAiProviderKeyInputType();
                syncAiProviderAddForm();
                aiProvidersToastMsg('');
                if (closeForm) setAiProviderFormOpen(false);
            }

            function openAiProviderAddForm() {
                resetAiProviderForm({ closeForm: false });
                aiProviderCancelBtn?.classList.remove('hidden');
                setAiProviderFormOpen(true);
                aiProviderKey?.focus();
            }

            aiProviderOpenAddBtn?.addEventListener('click', () => openAiProviderAddForm());

            async function startEditAiProvider(entry) {
                if (!entry) return;
                aiProvidersToastMsg('Waiting for authentication…');
                try {
                    const ok = await window.electronAPI.vaultVerifyDevice('Edit API key');
                    if (!ok) {
                        aiProvidersToastMsg('Authentication cancelled', true);
                        return;
                    }
                    aiProviderEditingId = entry.id;
                    aiKeyAddBlock?.classList.add('is-editing');
                    if (aiKeyFormTitle) aiKeyFormTitle.textContent = 'Edit API key';
                    if (aiProviderAddBtn) aiProviderAddBtn.textContent = 'Save changes';
                    aiProviderCancelBtn?.classList.remove('hidden');
                    setAiProviderFormOpen(true);
                    if (aiProviderType) aiProviderType.value = entry.provider || 'groq';
                    if (aiProviderLabel) aiProviderLabel.value = entry.label || '';
                    if (aiProviderKey) aiProviderKey.value = entry.apiKey || '';
                    syncAiProviderKeyInputType();
                    syncAiProviderAddForm();
                    renderAiProvidersList();
                    aiProvidersToastMsg('');
                    aiKeyAddBlock?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    aiProviderKey?.focus();
                } catch (e) {
                    aiProvidersToastMsg(e?.message || 'Could not verify identity', true);
                }
            }

            aiProviderCancelBtn?.addEventListener('click', () => {
                resetAiProviderForm();
                renderAiProvidersList();
            });

            async function revealProviderKey(entry) {
                if (!entry?.apiKey) return;
                const state = aiProviderRevealState.get(entry.id);
                if (state?.revealed) {
                    aiProviderRevealState.set(entry.id, { revealed: false });
                    renderAiProvidersList();
                    return;
                }
                aiProvidersToastMsg('Waiting for authentication…');
                try {
                    const ok = await window.electronAPI.vaultVerifyDevice('Show API key');
                    if (!ok) {
                        aiProvidersToastMsg('Authentication cancelled', true);
                        return;
                    }
                    aiProviderRevealState.set(entry.id, { revealed: true });
                    aiProvidersToastMsg('');
                    renderAiProvidersList();
                } catch (e) {
                    aiProvidersToastMsg(e?.message || 'Could not verify identity', true);
                }
            }

            function renderAiProvidersList() {
                ensureAiProvidersFromSettings();
                if (!aiProvidersList) return;
                aiProvidersList.innerHTML = '';
                const list = settings.aiProviders || [];
                aiProvidersEmpty?.classList.toggle('hidden', list.length > 0);

                list.forEach((entry) => {
                    const isActive = entry.id === settings.activeAiProviderId;
                    const isEditing = entry.id === aiProviderEditingId;

                    const entryEl = document.createElement('div');
                    entryEl.className =
                        'ai-key-entry' +
                        (isActive ? ' is-active' : '') +
                        (isEditing ? ' is-editing' : '');
                    entryEl.dataset.providerId = entry.id;

                    const main = document.createElement('div');
                    main.className = 'ai-key-entry-main';

                    const labelWrap = document.createElement('div');
                    labelWrap.className = 'ai-key-entry-label';

                    const title = document.createElement('div');
                    title.className = 'row-title';
                    title.textContent = AxisAiProviders.displayName(entry);
                    labelWrap.appendChild(title);

                    if (isActive) {
                        const status = document.createElement('div');
                        status.className = 'row-desc ai-key-active-status';
                        status.textContent = 'Active';
                        labelWrap.appendChild(status);
                    }

                    const actions = document.createElement('div');
                    actions.className = 'ai-key-entry-actions';

                    if (!isActive) {
                        const useBtn = document.createElement('button');
                        useBtn.type = 'button';
                        useBtn.className = 'secondary';
                        useBtn.textContent = 'Use';
                        useBtn.addEventListener('click', async () => {
                            settings.activeAiProviderId = entry.id;
                            await persistAiProviders();
                            renderAiProvidersList();
                        });
                        actions.appendChild(useBtn);
                    }

                    if (!isEditing) {
                        const editBtn = document.createElement('button');
                        editBtn.type = 'button';
                        editBtn.className = 'secondary';
                        editBtn.textContent = 'Edit';
                        editBtn.addEventListener('click', () => void startEditAiProvider(entry));
                        actions.appendChild(editBtn);
                    }

                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'destructive';
                    removeBtn.textContent = 'Remove';
                    removeBtn.addEventListener('click', async () => {
                        settings.aiProviders = (settings.aiProviders || []).filter((p) => p.id !== entry.id);
                        if (settings.activeAiProviderId === entry.id) {
                            settings.activeAiProviderId = settings.aiProviders[0]?.id || null;
                        }
                        if (aiProviderEditingId === entry.id) {
                            resetAiProviderForm();
                        }
                        aiProviderRevealState.delete(entry.id);
                        await persistAiProviders();
                        renderAiProvidersList();
                    });
                    actions.appendChild(removeBtn);

                    main.appendChild(labelWrap);
                    main.appendChild(actions);

                    const maskRow = document.createElement('div');
                    maskRow.className = 'ai-key-mask-row';
                    const isRevealed = !!aiProviderRevealState.get(entry.id)?.revealed;
                    let keyDisplayEl;
                    if (isRevealed) {
                        keyDisplayEl = document.createElement('input');
                        keyDisplayEl.type = 'text';
                        keyDisplayEl.readOnly = true;
                        keyDisplayEl.className = 'ai-key-mask-display';
                        keyDisplayEl.value = String(entry.apiKey).trim();
                        keyDisplayEl.setAttribute('aria-label', 'Saved API key (visible)');
                    } else {
                        keyDisplayEl = document.createElement('div');
                        keyDisplayEl.className = 'ai-key-mask-display';
                        keyDisplayEl.textContent = AxisAiProviders.maskApiKey(entry.apiKey, entry.provider);
                        keyDisplayEl.setAttribute('aria-label', 'Saved API key (hidden)');
                    }
                    const eyeBtn = document.createElement('button');
                    eyeBtn.type = 'button';
                    eyeBtn.className = 'vault-icon-btn';
                    eyeBtn.title = isRevealed ? 'Hide key' : 'Show key';
                    eyeBtn.setAttribute('aria-label', isRevealed ? 'Hide key' : 'Show key');
                    eyeBtn.setAttribute('aria-pressed', isRevealed ? 'true' : 'false');
                    mountVaultEyeButton(eyeBtn);
                    eyeBtn.addEventListener('click', () => void revealProviderKey(entry));
                    maskRow.appendChild(keyDisplayEl);
                    maskRow.appendChild(eyeBtn);

                    entryEl.appendChild(main);
                    entryEl.appendChild(maskRow);
                    aiProvidersList.appendChild(entryEl);
                });
            }
            renderAiProvidersList();

            aiProviderAddBtn?.addEventListener('click', async () => {
                const provider = aiProviderType?.value || 'groq';
                const apiKey = String(aiProviderKey?.value || '').trim();
                const label = String(aiProviderLabel?.value || '').trim();
                if (!apiKey) {
                    aiProvidersToastMsg('Paste an API key first', true);
                    return;
                }

                if (aiProviderEditingId) {
                    const idx = (settings.aiProviders || []).findIndex((p) => p.id === aiProviderEditingId);
                    if (idx === -1) {
                        resetAiProviderForm();
                        renderAiProvidersList();
                        return;
                    }
                    const existing = settings.aiProviders[idx];
                    const entry = AxisAiProviders.sanitizeEntry({
                        id: aiProviderEditingId,
                        provider,
                        label,
                        apiKey,
                        model: existing?.model || ''
                    });
                    if (!entry) {
                        aiProvidersToastMsg('Could not save those changes', true);
                        return;
                    }
                    settings.aiProviders[idx] = entry;
                    await persistAiProviders();
                    resetAiProviderForm();
                    renderAiProvidersList();
                    aiProvidersToastMsg('API key updated');
                    return;
                }

                const entry = AxisAiProviders.sanitizeEntry({
                    id: AxisAiProviders.createProviderId(),
                    provider,
                    label,
                    apiKey
                });
                if (!entry) {
                    aiProvidersToastMsg('Could not save that key', true);
                    return;
                }
                if (!Array.isArray(settings.aiProviders)) settings.aiProviders = [];
                settings.aiProviders.push(entry);
                settings.activeAiProviderId = entry.id;
                if (aiProviderKey) aiProviderKey.value = '';
                if (aiProviderLabel) aiProviderLabel.value = '';
                await persistAiProviders();
                renderAiProvidersList();
                aiProvidersToastMsg('API key saved');
            });

            aiProviderGetKeyBtn?.addEventListener('click', () => {
                const def = AxisAiProviders.getProviderDef(aiProviderType?.value || 'groq');
                const url = def?.signupUrl || 'https://console.groq.com/keys';
                if (window.electronAPI?.openExternalUrl) {
                    window.electronAPI.openExternalUrl(url);
                } else if (window.electronAPI?.openUrlInBrowser) {
                    window.electronAPI.openUrlInBrowser(url);
                }
            });

            const wclRaw = Number(settings.windowChromeLight);
            const wclVal = Math.max(0, Math.min(100, Number.isFinite(wclRaw) ? wclRaw : 50));
            const wclInput = document.getElementById('window-chrome-light');
            const wclLabel = document.getElementById('window-chrome-light-label');
            wclInput.value = String(wclVal);
            function formatWindowChromeLightLabel(v) {
                if (v === 50) return '50 — default';
                if (v === 0) return '0 — opaque';
                if (v === 100) return '100 — most light';
                return String(v);
            }
            wclLabel.textContent = formatWindowChromeLightLabel(wclVal);
            syncNativeWindowChromeTransparency();

            const AMBIENT_PRESET_IDS = ['rain', 'warm', 'focus', 'ocean', 'wind', 'still'];
            document.getElementById('ambient-audio-enabled').checked = !!settings.ambientAudioEnabled;
            document.getElementById('ambient-mute-when-tab-audio').checked = !!settings.ambientMuteWhenTabAudio;
            const ambientPreset = settings.ambientAudioPreset || 'rain';
            document.getElementById('ambient-audio-preset').value = AMBIENT_PRESET_IDS.includes(ambientPreset) ? ambientPreset : 'rain';
            const ambientVolRaw = Number(settings.ambientAudioVolume);
            const ambientVol = Math.max(0, Math.min(100, Number.isFinite(ambientVolRaw) ? ambientVolRaw : 48));
            const ambientVolInput = document.getElementById('ambient-audio-volume');
            const ambientVolLabel = document.getElementById('ambient-audio-volume-label');
            ambientVolInput.value = String(ambientVol);
            ambientVolLabel.textContent = ambientVol + '%';
            function syncAmbientControlsDisabled() {
                const aOn = document.getElementById('ambient-audio-enabled').checked;
                document.getElementById('ambient-audio-preset').disabled = !aOn;
                ambientVolInput.disabled = !aOn;
                document.getElementById('ambient-mute-when-tab-audio').disabled = !aOn;
            }
            syncAmbientControlsDisabled();
            
            const setNtpCheck = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.checked = !!val;
            };
            setNtpCheck('ntp-welcome-enabled', settings.ntpWelcomeEnabled !== false);
            setNtpCheck('ntp-welcome-greeting', settings.ntpWelcomeGreeting !== false);
            setNtpCheck('ntp-ai-search', settings.ntpAiSearchEnabled !== false);
            setNtpCheck('ntp-show-settings-shortcut', settings.ntpShowSettingsShortcut !== false);
            setNtpCheck('ntp-widgets-enabled', settings.ntpWidgetsEnabled === true);
            setNtpCheck('ntp-widget-backgrounds', settings.ntpWidgetBackgrounds !== false);
            setNtpCheck('ntp-show-widgets-edit-button', settings.ntpShowWidgetsEditButton !== false);

            function renderNtpWidgetSettingsList() {
                const api = window.AxisNtpWidgets;
                const list = document.getElementById('ntp-widgets-active-list');
                if (!list) return;
                const layout = api
                    ? api.normalizeLayout(settings.ntpWidgetLayout)
                    : Array.isArray(settings.ntpWidgetLayout)
                      ? settings.ntpWidgetLayout
                      : [];
                const esc = (s) => escapeHtml(s);
                const field = (label, controlHtml) =>
                    `<div class="ntp-widget-settings-field">
  <div class="ntp-widget-settings-field-label">${esc(label)}</div>
  ${controlHtml}
</div>`;
                const card = (title, fieldsHtml) =>
                    `<div class="ntp-widget-settings-card">
  <div class="ntp-widget-settings-card-head">${esc(title)}</div>
  <div class="ntp-widget-settings-fields">${fieldsHtml}</div>
</div>`;

                const cards = [];
                const typeCounts = new Map();
                for (const w of layout) {
                    const type = api?.resolveType ? api.resolveType(w.type) : w.type;
                    if (!api?.widgetHasConfig?.(type)) continue;
                    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
                }
                const typeSeen = new Map();

                for (const w of layout) {
                    const type = api?.resolveType ? api.resolveType(w.type) : w.type;
                    if (
                        type !== 'weather' &&
                        type !== 'worldclock' &&
                        type !== 'clock' &&
                        type !== 'airquality' &&
                        type !== 'markets' &&
                        type !== 'calendar'
                    ) {
                        continue;
                    }
                    const baseTitle = api?.widgetLabel?.(w) || type;
                    const seen = (typeSeen.get(type) || 0) + 1;
                    typeSeen.set(type, seen);
                    const title =
                        (typeCounts.get(type) || 0) > 1 ? `${baseTitle} ${seen}` : baseTitle;

                    if (type === 'clock') {
                        const hour12 = w.config?.hour12 !== false && w.config?.format !== '24';
                        cards.push(
                            card(
                                title,
                                field(
                                    'Time format',
                                    `<select data-ntp-field="hour12" data-widget-id="${w.id}">
      <option value="true"${hour12 ? ' selected' : ''}>12-hour</option>
      <option value="false"${!hour12 ? ' selected' : ''}>24-hour</option>
    </select>`
                                )
                            )
                        );
                        continue;
                    }

                    if (type === 'calendar') {
                        const weekStartsOn = Number(w.config?.weekStartsOn) === 1 ? 1 : 0;
                        cards.push(
                            card(
                                title,
                                field(
                                    'Week starts on',
                                    `<select data-ntp-field="weekStartsOn" data-widget-id="${w.id}">
      <option value="0"${weekStartsOn === 0 ? ' selected' : ''}>Sunday</option>
      <option value="1"${weekStartsOn === 1 ? ' selected' : ''}>Monday</option>
    </select>`
                                )
                            )
                        );
                        continue;
                    }

                    if (type === 'markets') {
                        const symbols = Array.isArray(w.config?.symbols)
                            ? w.config.symbols
                            : String(w.config?.symbols || '')
                                  .split(/[\s,;]+/)
                                  .filter(Boolean);
                        const norm = api?.normalizeMarketSymbols
                            ? api.normalizeMarketSymbols(symbols)
                            : symbols.map((s) => String(s).toUpperCase()).slice(0, 8);
                        const displaySym = (s) =>
                            api?.displayMarketSymbol ? api.displayMarketSymbol(s) : s;
                        const rows = norm.length
                            ? norm
                                  .map((sym, idx) => {
                                      const label = esc(displaySym(sym));
                                      const upDisabled = idx === 0 ? ' disabled' : '';
                                      const downDisabled = idx === norm.length - 1 ? ' disabled' : '';
                                      return `<li class="ntp-ticker-row" data-ntp-ticker-row data-widget-id="${w.id}" data-symbol="${esc(sym)}" data-index="${idx}">
  <div class="ntp-ticker-row-sym">${label}</div>
  <div class="ntp-ticker-row-actions">
    <button type="button" class="ntp-ticker-move" data-ntp-ticker-move="up" data-widget-id="${w.id}" data-symbol="${esc(sym)}"${upDisabled} aria-label="Move ${label} up">↑</button>
    <button type="button" class="ntp-ticker-move" data-ntp-ticker-move="down" data-widget-id="${w.id}" data-symbol="${esc(sym)}"${downDisabled} aria-label="Move ${label} down">↓</button>
  </div>
  <button type="button" class="ntp-ticker-remove" data-ntp-ticker-remove data-widget-id="${w.id}" data-symbol="${esc(sym)}" aria-label="Remove ${label}">×</button>
</li>`;
                                  })
                                  .join('')
                            : '';
                        const empty = norm.length
                            ? ''
                            : '<div class="ntp-ticker-empty">No tickers yet — search below</div>';
                        cards.push(
                            card(
                                title,
                                `<div class="ntp-widget-settings-field ntp-ticker-picker" data-widget-id="${w.id}">
  <div class="ntp-widget-settings-field-label">Tickers</div>
  ${empty}
  <ul class="ntp-ticker-list" data-ntp-ticker-list data-widget-id="${w.id}">${rows}</ul>
  <div class="ntp-ticker-search-wrap">
    <input type="text" class="ntp-weather-city-search" data-ntp-ticker-search data-widget-id="${w.id}" placeholder="Search stocks or crypto…" spellcheck="false" maxlength="40" autocomplete="off">
    <div class="ntp-ticker-results hidden" data-ntp-ticker-results role="listbox"></div>
  </div>
  <div class="ntp-widget-settings-field-hint">Search and pick up to 8 tickers. Use ↑ ↓ to reorder. Quotes update live on New Tab.</div>
</div>`
                            )
                        );
                        continue;
                    }

                    if (type === 'worldclock') {
                        const hour12 = w.config?.hour12 !== false && w.config?.format !== '24';
                        const selectedLabel = esc(
                            w.config?.placeLabel ||
                                w.config?.city ||
                                'None — search and pick a city below'
                        );
                        const fieldsHtml =
                            field(
                                'Time format',
                                `<select data-ntp-field="hour12" data-widget-id="${w.id}">
      <option value="true"${hour12 ? ' selected' : ''}>12-hour</option>
      <option value="false"${!hour12 ? ' selected' : ''}>24-hour</option>
    </select>`
                            ) +
                            `<div class="ntp-widget-settings-field ntp-city-picker" data-widget-id="${w.id}">
  <div class="ntp-widget-settings-field-label">City</div>
  <div class="ntp-weather-city-selected" data-ntp-city-selected>${selectedLabel}</div>
  <input type="text" class="ntp-weather-city-search" data-ntp-city-search data-widget-id="${w.id}" placeholder="Search cities worldwide…" spellcheck="false" maxlength="80" autocomplete="off">
  <div class="ntp-weather-city-results hidden" data-ntp-city-results role="listbox"></div>
  <div class="ntp-widget-settings-field-hint">Type at least 2 letters, then choose a city. Time zone is set automatically.</div>
</div>`;
                        cards.push(card(title, fieldsHtml));
                        continue;
                    }

                    if (type === 'airquality') {
                        const scale = w.config?.scale === 'eu' ? 'eu' : 'us';
                        const selectedLabel = esc(
                            w.config?.placeLabel ||
                                w.config?.city ||
                                'None — search and pick a city below'
                        );
                        const fieldsHtml =
                            field(
                                'AQI scale',
                                `<select data-ntp-field="scale" data-widget-id="${w.id}">
      <option value="us"${scale === 'us' ? ' selected' : ''}>US AQI</option>
      <option value="eu"${scale === 'eu' ? ' selected' : ''}>European AQI</option>
    </select>`
                            ) +
                            `<div class="ntp-widget-settings-field ntp-city-picker" data-widget-id="${w.id}">
  <div class="ntp-widget-settings-field-label">City</div>
  <div class="ntp-weather-city-selected" data-ntp-city-selected>${selectedLabel}</div>
  <input type="text" class="ntp-weather-city-search" data-ntp-city-search data-widget-id="${w.id}" placeholder="Search cities worldwide…" spellcheck="false" maxlength="80" autocomplete="off">
  <div class="ntp-weather-city-results hidden" data-ntp-city-results role="listbox"></div>
  <div class="ntp-widget-settings-field-hint">Type at least 2 letters, then choose a city. Air quality updates automatically.</div>
</div>`;
                        cards.push(card(title, fieldsHtml));
                        continue;
                    }

                    const unit = String(w.config?.unit || 'C').toUpperCase() === 'F' ? 'F' : 'C';
                    const selectedLabel = esc(
                        w.config?.placeLabel || w.config?.city || 'None — search and pick a city below'
                    );
                    const fieldsHtml =
                        field(
                            'Temperature unit',
                            `<select data-ntp-field="unit" data-widget-id="${w.id}">
      <option value="C"${unit === 'C' ? ' selected' : ''}>°C</option>
      <option value="F"${unit === 'F' ? ' selected' : ''}>°F</option>
    </select>`
                        ) +
                        `<div class="ntp-widget-settings-field ntp-city-picker" data-widget-id="${w.id}">
  <div class="ntp-widget-settings-field-label">City</div>
  <div class="ntp-weather-city-selected" data-ntp-city-selected>${selectedLabel}</div>
  <input type="text" class="ntp-weather-city-search" data-ntp-city-search data-widget-id="${w.id}" placeholder="Search cities worldwide…" spellcheck="false" maxlength="80" autocomplete="off">
  <div class="ntp-weather-city-results hidden" data-ntp-city-results role="listbox"></div>
  <div class="ntp-widget-settings-field-hint">Type at least 2 letters, then choose a city from the list. Weather updates automatically.</div>
</div>`;
                    cards.push(card(title, fieldsHtml));
                }

                list.innerHTML =
                    cards.join('') ||
                    '<div class="ntp-widgets-settings-empty">No configurable widgets yet. Turn widgets on, then add tiles on a New Tab (<strong>Edit</strong>, or right-click the widgets area) — configure cities, symbols, and options here.</div>';
            }

            function syncNtpWidgetSettingsFields() {
                const widgetsOn = document.getElementById('ntp-widgets-enabled')?.checked === true;
                document.getElementById('ntp-widgets-subgroup')?.classList.toggle('visible', widgetsOn);
                renderNtpWidgetSettingsList();
            }
            syncNtpWidgetSettingsFields();

            async function patchNtpWidgetConfigById(widgetId, patch) {
                const api = window.AxisNtpWidgets;
                let layout = api
                    ? api.normalizeLayout(settings.ntpWidgetLayout)
                    : Array.isArray(settings.ntpWidgetLayout)
                      ? settings.ntpWidgetLayout
                      : [];
                const w = layout.find((x) => x.id === widgetId);
                if (!w) return;
                w.config = { ...(w.config || {}), ...patch };
                for (const k of Object.keys(w.config)) {
                    if (w.config[k] === undefined) delete w.config[k];
                }
                if (patch.url != null) {
                    const url = String(patch.url || '').trim();
                    w.config.urlLabel = url.replace(/^https?:\/\//, '').split('/')[0];
                }
                settings.ntpWidgetLayout = layout.map((item) => ({
                    id: item.id,
                    type: item.type,
                    col: item.col,
                    row: item.row,
                    colSpan: item.colSpan,
                    rowSpan: item.rowSpan,
                    config: item.config ? { ...item.config } : {}
                }));
                await saveSetting('ntpWidgetLayout', settings.ntpWidgetLayout, false);
            }

            function getNtpTickerSymbols(widgetId) {
                const api = window.AxisNtpWidgets;
                const layout = api
                    ? api.normalizeLayout(settings.ntpWidgetLayout)
                    : Array.isArray(settings.ntpWidgetLayout)
                      ? settings.ntpWidgetLayout
                      : [];
                const w = layout.find((x) => x.id === widgetId);
                if (!w) return [];
                return api?.normalizeMarketSymbols
                    ? api.normalizeMarketSymbols(w.config?.symbols)
                    : [];
            }

            async function setNtpTickerSymbols(widgetId, symbols) {
                const api = window.AxisNtpWidgets;
                const next = api?.normalizeMarketSymbols
                    ? api.normalizeMarketSymbols(symbols)
                    : (Array.isArray(symbols) ? symbols : []).slice(0, 8);
                await patchNtpWidgetConfigById(widgetId, { symbols: next });
                renderNtpWidgetSettingsList();
            }

            async function moveNtpTicker(widgetId, symbol, delta) {
                const list = getNtpTickerSymbols(widgetId);
                const from = list.indexOf(symbol);
                if (from < 0) return;
                const to = from + delta;
                if (to < 0 || to >= list.length) return;
                const next = list.slice();
                const [item] = next.splice(from, 1);
                next.splice(to, 0, item);
                await setNtpTickerSymbols(widgetId, next);
            }

            async function removeNtpWidgetById(widgetId) {
                const api = window.AxisNtpWidgets;
                let layout = api
                    ? api.normalizeLayout(settings.ntpWidgetLayout)
                    : Array.isArray(settings.ntpWidgetLayout)
                      ? settings.ntpWidgetLayout
                      : [];
                layout = layout.filter((w) => w.id !== widgetId);
                settings.ntpWidgetLayout = layout;
                await saveSetting('ntpWidgetLayout', settings.ntpWidgetLayout, false);
                renderNtpWidgetSettingsList();
            }

            function syncAiFeaturesSettingsUi() {
                const on = settings.aiFeaturesEnabled !== false;
                const toggle = document.getElementById('ai-features-enabled');
                if (toggle) toggle.checked = on;
                document.getElementById('ai-features-details')?.classList.toggle('hidden', !on);
            }
            syncAiFeaturesSettingsUi();
            const ntpGreetingNameInput = document.getElementById('ntp-greeting-name');
            if (ntpGreetingNameInput) {
                const storedName = String(settings.ntpGreetingName ?? '').trim();
                ntpGreetingNameInput.value = storedName === 'User' ? '' : storedName;
            }

            function syncNtpSettingsNestedState() {
                const welcomeOn = document.getElementById('ntp-welcome-enabled')?.checked !== false;
                document.getElementById('ntp-welcome-subgroup')?.classList.toggle('visible', welcomeOn);
            }
            syncNtpSettingsNestedState();
            syncUnpinnedClearCustomRow();
            syncGradientRowsVisibility();
            
            function updateThemePreview() {
                const el = document.getElementById('theme-preview');
                const theme = document.getElementById('theme-color').value;
                const grad = document.getElementById('gradient-color').value;
                const enabled = document.getElementById('gradient-enabled').checked;
                const dir = document.getElementById('gradient-direction').value;
                el.style.background = enabled ? `linear-gradient(${dir}, ${theme}, ${grad})` : theme;
            }
            updateThemePreview();

            async function applyLoadedSettingsToForm() {
                document.getElementById('ui-theme').value =
                    settings.uiTheme === 'light' || settings.uiTheme === 'system' ? settings.uiTheme : 'dark';
                await syncSettingsLightTint();
                document.getElementById('sidebar-position').value = settings.sidebarPosition || 'left';
                syncSidebarZoomControl(settings.sidebarZoom);
                document.getElementById('search-engine').value = settings.searchEngine || 'google';
                document.getElementById('always-show-full-url').checked = !!settings.alwaysShowFullUrl;
                document.getElementById('https-only-mode').checked = !!settings.httpsOnlyMode;
                document.getElementById('ad-blocker-enabled').checked = settings.adBlockerEnabled !== false;
                document.getElementById('javascript-enabled').checked = settings.javascriptEnabled !== false;
                document.getElementById('unpinned-clear-mode').value = settings.unpinnedClearMode || 'app-close';
                const unpinnedCustomMins = Math.min(
                    10080,
                    Math.max(1, Number(settings.unpinnedClearCustomMinutes) || 60)
                );
                document.getElementById('unpinned-clear-custom-minutes').value = String(unpinnedCustomMins);
                syncUnpinnedClearCustomRow();
                document.getElementById('speech-enabled').checked = settings.speechEnabled !== false;
                document.getElementById('speech-rate').value = String(settings.speechRate || 1);
                document.getElementById('speech-pitch').value = String(settings.speechPitch || 1);
                populateSpeechVoices();
                document.getElementById('theme-color').value = settings.themeColor || '#1a1a1a';
                document.getElementById('gradient-color').value = settings.gradientColor || '#2a2a2a';
                document.getElementById('gradient-enabled').checked = settings.gradientEnabled || false;
                document.getElementById('gradient-direction').value = settings.gradientDirection || '135deg';
                document.getElementById('transparent-sites').checked = !!settings.transparentSites;
                document.getElementById('site-theme-color').checked = !!settings.siteThemeColor;
                document.getElementById('link-preview').checked = settings.linkPreview !== false;
                ensureAiProvidersFromSettings();
                resetAiProviderForm();
                renderAiProvidersList();
                const wclRawApply = Number(settings.windowChromeLight);
                const wclValApply = Math.max(
                    0,
                    Math.min(100, Number.isFinite(wclRawApply) ? wclRawApply : 50)
                );
                if (wclInput) wclInput.value = String(wclValApply);
                if (wclLabel) wclLabel.textContent = formatWindowChromeLightLabel(wclValApply);
                syncNativeWindowChromeTransparency();
                document.getElementById('ambient-audio-enabled').checked = !!settings.ambientAudioEnabled;
                document.getElementById('ambient-mute-when-tab-audio').checked = !!settings.ambientMuteWhenTabAudio;
                const ambientPresetApply = settings.ambientAudioPreset || 'rain';
                document.getElementById('ambient-audio-preset').value = AMBIENT_PRESET_IDS.includes(
                    ambientPresetApply
                )
                    ? ambientPresetApply
                    : 'rain';
                const ambientVolRawApply = Number(settings.ambientAudioVolume);
                const ambientVolApply = Math.max(
                    0,
                    Math.min(100, Number.isFinite(ambientVolRawApply) ? ambientVolRawApply : 48)
                );
                if (ambientVolInput) ambientVolInput.value = String(ambientVolApply);
                if (ambientVolLabel) ambientVolLabel.textContent = ambientVolApply + '%';
                syncAmbientControlsDisabled();
                setNtpCheck('ntp-welcome-enabled', settings.ntpWelcomeEnabled !== false);
                setNtpCheck('ntp-welcome-greeting', settings.ntpWelcomeGreeting !== false);
                setNtpCheck('ntp-ai-search', settings.ntpAiSearchEnabled !== false);
                setNtpCheck('ntp-show-settings-shortcut', settings.ntpShowSettingsShortcut !== false);
                setNtpCheck('ntp-widgets-enabled', settings.ntpWidgetsEnabled === true);
                setNtpCheck('ntp-widget-backgrounds', settings.ntpWidgetBackgrounds !== false);
                setNtpCheck('ntp-show-widgets-edit-button', settings.ntpShowWidgetsEditButton !== false);
                syncNtpWidgetSettingsFields();
                syncAiFeaturesSettingsUi();
                if (ntpGreetingNameInput) {
                    const storedName = String(settings.ntpGreetingName ?? '').trim();
                    ntpGreetingNameInput.value = storedName === 'User' ? '' : storedName;
                }
                syncNtpSettingsNestedState();
                syncGradientRowsVisibility();
                updateThemePreview();
            }
            window.__axisApplyLoadedSettingsToForm = applyLoadedSettingsToForm;
            
            // Sidebar nav
            let activeSection = 'customization';
            let suppressSectionRefresh = false;
            const isNativeSettingsWindow =
                document.documentElement.classList.contains('settings-native-window');

            if (isNativeSettingsWindow) {
                document.getElementById('settings-native-close')?.addEventListener('click', () => {
                    window.electronAPI?.closeSettingsWindow?.();
                });
            }

            function showActiveSectionOnly(section) {
                const target = section || activeSection || 'customization';
                document.querySelectorAll('.sidebar-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.pane').forEach(p => {
                    p.classList.remove('active');
                    p.style.display = 'none';
                });
                const item = document.querySelector(`.sidebar-item[data-section="${target}"]`);
                const pane = document.getElementById(target + '-pane');
                if (item) item.classList.add('active');
                if (pane) {
                    pane.classList.add('active');
                    pane.style.display = 'block';
                }
                activeSection = target;
            }

            let switchSection = function(section) {
                const prevSection = activeSection;
                showActiveSectionOnly(section);
                const mainEl = document.querySelector('.main');
                if (mainEl && section !== prevSection) mainEl.scrollTop = 0;
            };
            window.__axisSwitchSettingsSection = switchSection;
            document.querySelectorAll('.sidebar-item').forEach(item => {
                item.addEventListener('click', () => switchSection(item.dataset.section));
            });
            const hash = (location.hash || '').replace(/^#/, '');
            if (hash) switchSection(hash);
            window.electronAPI?.onSwitchSettingsTab?.((tab) => switchSection(tab));

            const SITE_PERM_KEYS = [
                'camera',
                'microphone',
                'notifications',
                'geolocation',
                'display-capture',
                'clipboard-read',
                'clipboard-sanitized-write',
                'openExternal',
                'fileSystem',
                'fullscreen',
                'pointerLock',
                'midi',
                'midiSysex',
                'window-management',
                'speaker-selection',
                'idle-detection',
                'storage-access',
                'mediaKeySystem'
            ];
            const SITE_PERM_LABELS = {
                camera: 'Camera',
                microphone: 'Microphone',
                notifications: 'Notifications',
                geolocation: 'Location',
                'display-capture': 'Screen share',
                'clipboard-read': 'Clipboard read',
                'clipboard-sanitized-write': 'Clipboard write',
                openExternal: 'Open outside apps',
                fileSystem: 'Files',
                fullscreen: 'Full screen',
                pointerLock: 'Pointer lock',
                midi: 'MIDI',
                midiSysex: 'MIDI (system)',
                'window-management': 'Window management',
                'speaker-selection': 'Speakers',
                'idle-detection': 'Idle detection',
                'storage-access': 'Storage access',
                mediaKeySystem: 'Protected media',
                keyboardLock: 'Keyboard lock',
                'top-level-storage-access': 'Top-level storage',
                usb: 'USB',
                hid: 'HID',
                serial: 'Serial',
                bluetooth: 'Bluetooth',
                sensors: 'Sensors',
                unknown: 'Other'
            };
            function normalizeSiteOriginInput(raw) {
                if (!raw || typeof raw !== 'string') return null;
                const s = raw.trim();
                if (!s) return null;
                try {
                    return new URL(s.includes('://') ? s : `https://${s}`).origin;
                } catch {
                    return null;
                }
            }
            function cleanPermOverridesLocal(obj) {
                const out = {};
                if (!obj || typeof obj !== 'object') return out;
                for (const [origin, perms] of Object.entries(obj)) {
                    if (!origin || typeof perms !== 'object' || !perms) continue;
                    const row = {};
                    for (const [k, v] of Object.entries(perms)) {
                        if (!/^[a-zA-Z0-9._-]{1,64}$/.test(k)) continue;
                        if (v === 'allow' || v === 'deny') row[k] = v;
                    }
                    if (Object.keys(row).length) out[origin] = row;
                }
                return out;
            }
            function permKeysForSite(perms) {
                const keys = new Set(SITE_PERM_KEYS);
                if (perms && typeof perms === 'object') {
                    for (const k of Object.keys(perms)) keys.add(k);
                }
                return [...keys];
            }
            let sitePermissionOverrides = {};
            function permSelectHtml(current) {
                const v = current === 'allow' || current === 'deny' ? current : '';
                return (
                    '<option value=""' + (v === '' ? ' selected' : '') + '>Default</option>' +
                    '<option value="allow"' + (v === 'allow' ? ' selected' : '') + '>Allow</option>' +
                    '<option value="deny"' + (v === 'deny' ? ' selected' : '') + '>Block</option>'
                );
            }
            function formatPermOriginLabel(origin) {
                try {
                    const u = new URL(origin);
                    const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
                    return `${u.hostname}${path}`;
                } catch (_) {
                    return origin;
                }
            }
            async function loadSitePermissionOverrides() {
                try {
                    sitePermissionOverrides = (await window.electronAPI.getSitePermissionOverrides()) || {};
                } catch (e) {
                    sitePermissionOverrides = {};
                }
                renderSitePermissionTable();
            }
            async function persistSitePermissionOverrides() {
                sitePermissionOverrides = (
                    (await window.electronAPI.setSitePermissionOverrides(
                        cleanPermOverridesLocal(sitePermissionOverrides)
                    )) || {}
                );
                renderSitePermissionTable();
            }
            function renderSitePermissionTable() {
                const container = document.getElementById('site-perm-list');
                if (!container) return;
                container.innerHTML = '';
                const origins = Object.keys(sitePermissionOverrides).sort((a, b) => a.localeCompare(b));
                if (origins.length === 0) {
                    const empty = document.createElement('div');
                    empty.className = 'perm-empty';
                    empty.textContent = 'No sites yet. Add a site above to set overrides.';
                    container.appendChild(empty);
                    return;
                }
                for (const origin of origins) {
                    const perms = sitePermissionOverrides[origin] || {};
                    const card = document.createElement('article');
                    card.className = 'perm-card';

                    const header = document.createElement('div');
                    header.className = 'perm-card-header';

                    const siteWrap = document.createElement('div');
                    siteWrap.className = 'perm-card-site-wrap';
                    const title = document.createElement('span');
                    title.className = 'perm-card-site-title';
                    title.textContent = formatPermOriginLabel(origin);
                    title.title = origin;
                    const url = document.createElement('span');
                    url.className = 'perm-card-site-url';
                    url.textContent = origin;
                    url.title = origin;
                    siteWrap.appendChild(title);
                    siteWrap.appendChild(url);

                    const removeBtn = document.createElement('button');
                    removeBtn.type = 'button';
                    removeBtn.className = 'perm-card-remove destructive';
                    removeBtn.textContent = 'Remove';
                    removeBtn.addEventListener('click', () => {
                        delete sitePermissionOverrides[origin];
                        persistSitePermissionOverrides();
                    });

                    header.appendChild(siteWrap);
                    header.appendChild(removeBtn);
                    card.appendChild(header);

                    const grid = document.createElement('div');
                    grid.className = 'perm-card-grid';
                    for (const key of permKeysForSite(perms)) {
                        const cell = document.createElement('div');
                        cell.className = 'perm-card-cell';
                        const label = document.createElement('label');
                        label.textContent = SITE_PERM_LABELS[key] || key;
                        const sel = document.createElement('select');
                        sel.dataset.origin = origin;
                        sel.dataset.permKey = key;
                        sel.setAttribute(
                            'aria-label',
                            `${SITE_PERM_LABELS[key] || key} for ${formatPermOriginLabel(origin)}`
                        );
                        sel.innerHTML = permSelectHtml(perms[key]);
                        sel.addEventListener('change', () => {
                            const o = sel.dataset.origin;
                            const k = sel.dataset.permKey;
                            const val = sel.value;
                            if (!sitePermissionOverrides[o]) sitePermissionOverrides[o] = {};
                            if (!val) delete sitePermissionOverrides[o][k];
                            else sitePermissionOverrides[o][k] = val;
                            persistSitePermissionOverrides();
                        });
                        cell.appendChild(label);
                        cell.appendChild(sel);
                        grid.appendChild(cell);
                    }
                    card.appendChild(grid);
                    container.appendChild(card);
                }
            }
            document.getElementById('site-perm-add-btn')?.addEventListener('click', async () => {
                const errEl = document.getElementById('site-perm-add-error');
                const input = document.getElementById('site-perm-add-input');
                if (errEl) errEl.textContent = '';
                const o = normalizeSiteOriginInput(input && input.value);
                if (!o) {
                    if (errEl) errEl.textContent = 'Enter a valid URL or domain.';
                    return;
                }
                if (!sitePermissionOverrides[o]) sitePermissionOverrides[o] = {};
                input.value = '';
                await persistSitePermissionOverrides();
            });
            document.getElementById('site-perm-add-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('site-perm-add-btn')?.click();
                }
            });
            // Site permission overrides load when that section is opened (or prefetched in native mode).

            let extensionsCache = [];
            function renderExtensions(list) {
                extensionsCache = Array.isArray(list) ? list : [];
                const container = document.getElementById('extensions-list');
                if (!container) return;
                if (extensionsCache.length === 0) {
                    container.innerHTML = '<div class="extensions-empty">No extensions installed. Use Install from store, .crx, or an unpacked folder.</div>';
                    applySettingsSearch(document.getElementById('settings-search')?.value || '');
                    return;
                }
                container.innerHTML = extensionsCache.map((ext) => {
                    const id = escapeHtml(ext.id);
                    const name = escapeHtml(ext.name || 'Extension');
                    const initial = escapeHtml((ext.name || 'E').trim().slice(0, 1).toUpperCase());
                    const icon = ext.iconUrl
                        ? `<img class="extension-icon" src="${escapeHtml(ext.iconUrl)}" alt="">`
                        : `<div class="extension-icon extension-icon-fallback">${initial}</div>`;
                    const desc = ext.description ? `<div class="extension-desc">${escapeHtml(ext.description)}</div>` : '';
                    const err = ext.error ? `<div class="extension-error">${escapeHtml(ext.error)}</div>` : '';
                    const pathText = ext.installPath ? `<div class="extension-path">${escapeHtml(ext.installPath)}</div>` : '';
                    const optionsDisabled = ext.optionsUrl ? '' : ' disabled';
                    return `
                        <div class="extension-card" data-extension-id="${id}">
                            ${icon}
                            <div class="extension-main">
                                <div class="extension-title-row">
                                    <div class="extension-title">${name}</div>
                                    <div class="extension-version">${escapeHtml(ext.version || '')}</div>
                                    <div class="extension-status">${ext.loaded ? 'Loaded' : (ext.enabled ? 'Needs reload' : 'Off')}</div>
                                </div>
                                ${desc}
                                ${err}
                                ${pathText}
                            </div>
                            <div class="extension-actions">
                                <input type="checkbox" data-extension-toggle="${id}" ${ext.enabled ? 'checked' : ''} title="Enable extension">
                                <button type="button" data-extension-options="${id}"${optionsDisabled}>Options</button>
                                <button type="button" class="destructive" data-extension-remove="${id}">Remove</button>
                            </div>
                        </div>
                    `;
                }).join('');

                container.querySelectorAll('[data-extension-toggle]').forEach((input) => {
                    input.addEventListener('change', async () => {
                        const id = input.getAttribute('data-extension-toggle');
                        input.disabled = true;
                        try {
                            renderExtensions(await window.electronAPI.setExtensionEnabled(id, input.checked));
                        } catch (e) {
                            alert(e && e.message ? e.message : 'Could not update extension.');
                            await loadExtensions();
                        }
                    });
                });
                container.querySelectorAll('[data-extension-options]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        try {
                            await window.electronAPI.openExtensionOptions(btn.getAttribute('data-extension-options'));
                        } catch (e) {
                            alert(e && e.message ? e.message : 'This extension does not provide an options page.');
                        }
                    });
                });
                container.querySelectorAll('[data-extension-remove]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const ext = extensionsCache.find((x) => x.id === btn.getAttribute('data-extension-remove'));
                        if (!confirm(`Remove ${ext?.name || 'this extension'}?`)) return;
                        renderExtensions(await window.electronAPI.removeExtension(btn.getAttribute('data-extension-remove')));
                    });
                });
                applySettingsSearch(document.getElementById('settings-search')?.value || '');
            }
            async function loadExtensions() {
                try {
                    renderExtensions(await window.electronAPI.getExtensions());
                } catch (e) {
                    const container = document.getElementById('extensions-list');
                    if (container) container.innerHTML = '<div class="extensions-empty">Could not load extensions.</div>';
                }
            }
            document.getElementById('install-extension')?.addEventListener('click', async () => {
                const btn = document.getElementById('install-extension');
                if (btn) btn.disabled = true;
                try {
                    const result = await window.electronAPI.installExtension();
                    if (result && !result.canceled) renderExtensions(result.extensions || []);
                } catch (e) {
                    alert(e && e.message ? e.message : 'Could not install this extension.');
                    await loadExtensions();
                } finally {
                    if (btn) btn.disabled = false;
                }
            });
            document.getElementById('install-extension-webstore')?.addEventListener('click', async () => {
                const btn = document.getElementById('install-extension-webstore');
                const input = document.getElementById('extension-webstore-input');
                const raw = (input && input.value) ? String(input.value).trim() : '';
                if (!raw) {
                    alert('Paste a Chrome Web Store or Mozilla Add-ons URL, a Chrome extension ID, or a Firefox add-on slug.');
                    return;
                }
                if (btn) btn.disabled = true;
                try {
                    const result = await window.electronAPI.installExtensionFromWebStore(raw);
                    if (result && !result.canceled) renderExtensions(result.extensions || []);
                    if (input) input.value = '';
                } catch (e) {
                    alert(e && e.message ? e.message : 'Could not install from the store.');
                    await loadExtensions();
                } finally {
                    if (btn) btn.disabled = false;
                }
            });
            document.getElementById('extension-webstore-input')?.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    document.getElementById('install-extension-webstore')?.click();
                }
            });
            document.getElementById('extensions-open-chrome-webstore')?.addEventListener('click', () => {
                try {
                    window.electronAPI.openUrlInBrowser('https://chromewebstore.google.com/');
                } catch (_) {}
            });
            document.getElementById('extensions-open-firefox-addons')?.addEventListener('click', () => {
                try {
                    window.electronAPI.openUrlInBrowser('https://addons.mozilla.org/firefox/extensions/');
                } catch (_) {}
            });
            document.getElementById('install-extension-crx')?.addEventListener('click', async () => {
                const btn = document.getElementById('install-extension-crx');
                if (btn) btn.disabled = true;
                try {
                    const result = await window.electronAPI.installExtensionCrx();
                    if (result && !result.canceled) renderExtensions(result.extensions || []);
                } catch (e) {
                    alert(e && e.message ? e.message : 'Could not install this .crx file.');
                    await loadExtensions();
                } finally {
                    if (btn) btn.disabled = false;
                }
            });
            // When the store changes elsewhere (New Tab widgets, another window, profile edits),
            // refresh form fields and the visible data lists without rebuilding the whole page.
            function isSettingsTextFieldFocused() {
                const ae = document.activeElement;
                if (!ae || !document.body.contains(ae)) return false;
                const tag = ae.tagName;
                if (tag === 'TEXTAREA') return true;
                if (tag === 'SELECT') return true;
                if (tag === 'INPUT') {
                    const t = String(ae.type || 'text').toLowerCase();
                    return (
                        t === 'text' ||
                        t === 'search' ||
                        t === 'password' ||
                        t === 'url' ||
                        t === 'number' ||
                        t === 'date' ||
                        t === 'email' ||
                        t === ''
                    );
                }
                return !!ae.isContentEditable;
            }

            function applySidebarPositionToForm(pos) {
                const next = pos === 'right' ? 'right' : 'left';
                settings.sidebarPosition = next;
                const el = document.getElementById('sidebar-position');
                if (el && el.value !== next) el.value = next;
            }

            function readLiveSidebarPosition(fallback) {
                try {
                    const g = window.electronAPI?.getSidebarPosition?.();
                    if (g === 'left' || g === 'right') return g;
                } catch (_) {}
                return fallback === 'right' ? 'right' : 'left';
            }

            async function refreshStoreBackedSettingsFields() {
                try {
                    const s = await window.electronAPI.getSettings();
                    if (!s) return;
                    const editingText = isSettingsTextFieldFocused();
                    const editingWidgetField = !!document.activeElement?.closest?.(
                        '#ntp-widgets-active-list'
                    );
                    settings = s;
                    settings.sidebarPosition = readLiveSidebarPosition(s.sidebarPosition);

                    if (!editingText) {
                        if (typeof window.__axisApplyLoadedSettingsToForm === 'function') {
                            await window.__axisApplyLoadedSettingsToForm();
                        }
                        applySidebarPositionToForm(settings.sidebarPosition);
                    } else {
                        // Keep in-memory settings current, but don't yank focus mid-edit.
                        applySidebarPositionToForm(settings.sidebarPosition);
                        if (
                            !editingWidgetField &&
                            typeof syncNtpWidgetSettingsFields === 'function'
                        ) {
                            syncNtpWidgetSettingsFields();
                        }
                        ensureAiProvidersFromSettings?.();
                        if (typeof renderAiProvidersList === 'function') renderAiProvidersList();
                        syncSettingsLightTint?.();
                        syncNativeWindowChromeTransparency?.();
                    }

                    const section = activeSection || 'customization';
                    if (typeof refreshSettingsSectionInternal === 'function') {
                        if (
                            section === 'history' ||
                            section === 'extensions' ||
                            section === 'permissions' ||
                            section === 'profiles' ||
                            section === 'shortcuts'
                        ) {
                            refreshSettingsSectionInternal(section);
                        } else if (section === 'vault') {
                            const hasOpenReveal = !!document.querySelector(
                                '.vault-table-row--open, .vault-row-detail:not(.hidden)'
                            );
                            if (!vaultEditorMode && !hasOpenReveal && vaultAuthInProgress <= 0) {
                                refreshSettingsSectionInternal(section);
                            }
                        }
                    }

                    try {
                        const ctx = window.electronAPI?.getSettingsProfileBootstrap?.();
                        if (ctx?.profiles) {
                            settingsEditingProfileId =
                                ctx.profileId || settingsEditingProfileId;
                            renderSettingsProfileList(
                                ctx.profiles || [],
                                settingsEditingProfileId
                            );
                        }
                        } catch (_) {}
                } catch (_) {}
            }
            let _settingsStoreRefreshTimer = null;
            function scheduleSettingsStoreRefresh(delayMs = 140) {
                if (_settingsStoreRefreshTimer) clearTimeout(_settingsStoreRefreshTimer);
                _settingsStoreRefreshTimer = setTimeout(() => {
                    _settingsStoreRefreshTimer = null;
                    void refreshStoreBackedSettingsFields();
                }, delayMs);
            }

            try {
                if (window.electronAPI?.onSettingsUpdated) {
                    window.electronAPI.onSettingsUpdated((data) => {
                        if (data && data.key === 'sidebarPosition') {
                            applySidebarPositionToForm(data.value);
                        }
                        scheduleSettingsStoreRefresh(60);
                    });
                }
                if (window.electronAPI?.onSettingsStoreUpdated) {
                    window.electronAPI.onSettingsStoreUpdated(() => {
                        applySidebarPositionToForm(readLiveSidebarPosition(settings.sidebarPosition));
                        scheduleSettingsStoreRefresh(60);
                    });
                }
            } catch (_) {}

            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    if (vaultAuthInProgress > 0) return;
                    scheduleSettingsStoreRefresh(80);
                }
            });
            window.addEventListener('focus', () => {
                if (vaultAuthInProgress > 0) return;
                scheduleSettingsStoreRefresh(120);
            });
            window.addEventListener('pageshow', () => {
                if (vaultAuthInProgress > 0) return;
                scheduleSettingsStoreRefresh(60);
            });

            // Settings search (instant filter)
            const settingsSearchInput = document.getElementById('settings-search');
            const settingsSearchEmpty = document.getElementById('settings-search-empty');
            function applySettingsSearch(query) {
                const q = (query || '').trim().toLowerCase();
                const panes = Array.from(document.querySelectorAll('.pane'));
                if (!q) {
                    panes.forEach(pane => {
                        pane.style.display = '';
                        pane.querySelectorAll('.group').forEach(group => { group.style.display = ''; });
                        pane.querySelectorAll('.row, .shortcut-row').forEach(row => { row.style.display = ''; });
                    });
                    if (settingsSearchEmpty) settingsSearchEmpty.style.display = 'none';
                    showActiveSectionOnly(activeSection || 'customization');
                    syncConditionalSettingsRows();
                    return;
                }

                let hasAnyMatch = false;
                panes.forEach(pane => {
                    let paneHasMatch = false;
                    const groups = Array.from(pane.querySelectorAll('.group'));
                    if (groups.length === 0) {
                        paneHasMatch = pane.textContent.toLowerCase().includes(q);
                    } else {
                        groups.forEach(group => {
                            const rows = Array.from(group.querySelectorAll('.row, .shortcut-row'));
                            let groupHasMatch = false;
                            if (rows.length > 0) {
                                rows.forEach(row => {
                                    const rowHasMatch = row.textContent.toLowerCase().includes(q);
                                    row.style.display = rowHasMatch ? '' : 'none';
                                    if (rowHasMatch) groupHasMatch = true;
                                });
                            } else {
                                groupHasMatch = group.textContent.toLowerCase().includes(q);
                            }
                            group.style.display = groupHasMatch ? '' : 'none';
                            if (groupHasMatch) paneHasMatch = true;
                        });
                    }
                    pane.style.display = paneHasMatch ? 'block' : 'none';
                    if (paneHasMatch) hasAnyMatch = true;
                });

                // Clear section highlighting while searching
                document.querySelectorAll('.sidebar-item').forEach(n => n.classList.remove('active'));
                if (settingsSearchEmpty) settingsSearchEmpty.style.display = hasAnyMatch ? 'none' : 'block';
            }
            settingsSearchInput?.addEventListener('input', (e) => applySettingsSearch(e.target.value));
            
            // Change handlers
            document.getElementById('sidebar-position').addEventListener('change', e => saveSetting('sidebarPosition', e.target.value, false));
            let sidebarZoomSaveTimer = null;
            const persistSidebarZoom = (raw) => {
                const zoom = normalizeSidebarZoom(raw);
                syncSidebarZoomControl(zoom);
                saveSetting('sidebarZoom', zoom, false);
            };
            document.getElementById('sidebar-zoom')?.addEventListener('input', (e) => {
                const zoom = normalizeSidebarZoom(e.target.value);
                const label = document.getElementById('sidebar-zoom-label');
                if (label) label.textContent = zoom + '%';
                if (sidebarZoomSaveTimer) clearTimeout(sidebarZoomSaveTimer);
                sidebarZoomSaveTimer = setTimeout(() => {
                    sidebarZoomSaveTimer = null;
                    persistSidebarZoom(e.target.value);
                }, 60);
            });
            document.getElementById('sidebar-zoom')?.addEventListener('change', (e) => {
                if (sidebarZoomSaveTimer) {
                    clearTimeout(sidebarZoomSaveTimer);
                    sidebarZoomSaveTimer = null;
                }
                persistSidebarZoom(e.target.value);
            });
            document.getElementById('search-engine').addEventListener('change', e => saveSetting('searchEngine', e.target.value, false));
            document.getElementById('always-show-full-url').addEventListener('change', e => saveSetting('alwaysShowFullUrl', e.target.checked, false));
            document.getElementById('https-only-mode').addEventListener('change', e => saveSetting('httpsOnlyMode', e.target.checked, false));
            document.getElementById('ad-blocker-enabled').addEventListener('change', e => saveSetting('adBlockerEnabled', e.target.checked, false));
            document.getElementById('javascript-enabled').addEventListener('change', e => saveSetting('javascriptEnabled', e.target.checked, false));
            document.getElementById('unpinned-clear-mode').addEventListener('change', e => {
                syncUnpinnedClearCustomRow();
                saveSetting('unpinnedClearMode', e.target.value, false);
            });
            document.getElementById('unpinned-clear-custom-minutes').addEventListener('change', e => {
                const mins = Math.min(10080, Math.max(1, parseInt(e.target.value, 10) || 60));
                e.target.value = String(mins);
                saveSetting('unpinnedClearCustomMinutes', mins, false);
            });
            document.getElementById('speech-enabled').addEventListener('change', e => saveSetting('speechEnabled', e.target.checked, false));
            document.getElementById('speech-voice').addEventListener('change', e => {
                speechVoicePersist = e.target.value || '';
                saveSetting('speechVoiceURI', e.target.value || '', false);
            });
            document.getElementById('speech-rate').addEventListener('change', e => saveSetting('speechRate', parseFloat(e.target.value), false));
            document.getElementById('speech-pitch').addEventListener('change', e => saveSetting('speechPitch', parseFloat(e.target.value), false));
            document.getElementById('ambient-audio-enabled').addEventListener('change', e => {
                syncAmbientControlsDisabled();
                saveSetting('ambientAudioEnabled', e.target.checked, false);
            });
            document.getElementById('ambient-mute-when-tab-audio').addEventListener('change', e => {
                saveSetting('ambientMuteWhenTabAudio', e.target.checked, false);
            });
            document.getElementById('ambient-audio-preset').addEventListener('change', e => saveSetting('ambientAudioPreset', e.target.value, false));
            let ambientVolSaveTimer = null;
            const persistAmbientVolume = (raw) => {
                const n = Math.max(0, Math.min(100, parseInt(raw, 10) || 0));
                ambientVolLabel.textContent = n + '%';
                saveSetting('ambientAudioVolume', n, false);
            };
            ambientVolInput.addEventListener('input', e => {
                const n = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                ambientVolLabel.textContent = n + '%';
                if (ambientVolSaveTimer) clearTimeout(ambientVolSaveTimer);
                ambientVolSaveTimer = setTimeout(() => {
                    ambientVolSaveTimer = null;
                    persistAmbientVolume(e.target.value);
                }, 60);
            });
            ambientVolInput.addEventListener('change', e => {
                if (ambientVolSaveTimer) {
                    clearTimeout(ambientVolSaveTimer);
                    ambientVolSaveTimer = null;
                }
                persistAmbientVolume(e.target.value);
            });
            document.getElementById('ui-theme').addEventListener('change', async e => {
                const v =
                    e.target.value === 'light' || e.target.value === 'system'
                        ? e.target.value
                        : 'dark';
                settings.uiTheme = v;
                await syncSettingsLightTint();
                saveSetting('uiTheme', v, true);
            });
            document.getElementById('theme-color').addEventListener('input', e => {
                saveSetting('themeColor', e.target.value, true);
                updateThemePreview();
            });
            document.getElementById('gradient-color').addEventListener('input', e => {
                saveSetting('gradientColor', e.target.value, true);
                updateThemePreview();
            });
            document.getElementById('gradient-enabled').addEventListener('change', e => {
                const v = e.target.checked;
                saveSetting('gradientEnabled', v, true);
                syncGradientRowsVisibility();
                updateThemePreview();
            });
            document.getElementById('gradient-direction').addEventListener('change', e => {
                saveSetting('gradientDirection', e.target.value, true);
                updateThemePreview();
            });
            document.getElementById('ntp-welcome-enabled')?.addEventListener('change', e => {
                syncNtpSettingsNestedState();
                saveSetting('ntpWelcomeEnabled', e.target.checked, false);
            });
            document.getElementById('ntp-welcome-greeting')?.addEventListener('change', e => saveSetting('ntpWelcomeGreeting', e.target.checked, false));
            function saveNtpGreetingName() {
                const el = document.getElementById('ntp-greeting-name');
                if (!el) return;
                const trimmed = String(el.value || '').trim().slice(0, 64);
                saveSetting('ntpGreetingName', trimmed || 'User', false);
            }
            document.getElementById('ntp-greeting-name')?.addEventListener('change', saveNtpGreetingName);
            document.getElementById('ntp-greeting-name')?.addEventListener('blur', saveNtpGreetingName);
            document.getElementById('ntp-ai-search')?.addEventListener('change', e => saveSetting('ntpAiSearchEnabled', e.target.checked, false));
            document.getElementById('ntp-show-settings-shortcut')?.addEventListener('change', e =>
                saveSetting('ntpShowSettingsShortcut', e.target.checked, false)
            );
            document.getElementById('ntp-widgets-enabled')?.addEventListener('change', e => {
                saveSetting('ntpWidgetsEnabled', e.target.checked, false);
                syncNtpWidgetSettingsFields();
            });
            document.getElementById('ntp-widget-backgrounds')?.addEventListener('change', e =>
                saveSetting('ntpWidgetBackgrounds', e.target.checked, false)
            );
            document.getElementById('ntp-show-widgets-edit-button')?.addEventListener('change', e =>
                saveSetting('ntpShowWidgetsEditButton', e.target.checked, false)
            );
            document.getElementById('ntp-widgets-active-list')?.addEventListener('change', (e) => {
                const input = e.target.closest('[data-ntp-field][data-widget-id]');
                if (!input) return;
                const field = input.dataset.ntpField;
                const widgetId = input.dataset.widgetId;
                if (!field || !widgetId) return;
                let value = String(input.value || '').trim();
                if (field === 'hour12') value = value !== 'false';
                if (field === 'weekStartsOn') value = Number(value) === 1 ? 1 : 0;
                void patchNtpWidgetConfigById(widgetId, { [field]: value });
            });

            let weatherCitySearchTimer = null;
            let weatherCitySearchToken = 0;
            let tickerSearchTimer = null;
            let tickerSearchToken = 0;
            document.getElementById('ntp-widgets-active-list')?.addEventListener('input', (e) => {
                const tickerSearch = e.target.closest('[data-ntp-ticker-search]');
                if (tickerSearch) {
                    const widgetId = tickerSearch.dataset.widgetId;
                    const picker = tickerSearch.closest('.ntp-ticker-picker');
                    const resultsEl = picker?.querySelector('[data-ntp-ticker-results]');
                    const api = window.AxisNtpWidgets;
                    if (!widgetId || !resultsEl || !api?.searchTickers) return;

                    const q = String(tickerSearch.value || '').trim();
                    clearTimeout(tickerSearchTimer);
                    if (q.length < 1) {
                        resultsEl.classList.add('hidden');
                        resultsEl.innerHTML = '';
                        return;
                    }

                    const token = ++tickerSearchToken;
                    resultsEl.innerHTML = '<div class="ntp-weather-city-empty">Searching…</div>';
                    resultsEl.classList.remove('hidden');

                    tickerSearchTimer = setTimeout(async () => {
                        let rows = [];
                        let failed = false;
                        try {
                            if (typeof window.electronAPI?.searchTickers === 'function') {
                                const res = await window.electronAPI.searchTickers(q, 10);
                                if (res?.ok && Array.isArray(res.results)) {
                                    rows = res.results;
                                } else {
                                    failed = true;
                                    rows = await api.searchTickers(q, { limit: 10 });
                                }
                            } else {
                                rows = await api.searchTickers(q, { limit: 10 });
                            }
                        } catch (_) {
                            failed = true;
                            rows = [];
                        }
                        if (token !== tickerSearchToken) return;
                        if (!rows.length) {
                            resultsEl.innerHTML = failed
                                ? '<div class="ntp-weather-city-empty">Couldn’t reach ticker search — check your connection and try again</div>'
                                : '<div class="ntp-weather-city-empty">No tickers found — try another symbol</div>';
                            resultsEl.classList.remove('hidden');
                            return;
                        }
                        resultsEl.innerHTML = rows
                            .map((r) => {
                                const symbol = escapeHtml(r.symbol || '');
                                const rawName = String(r.name || '').trim();
                                const nameText =
                                    rawName &&
                                    rawName.toUpperCase() !== String(r.symbol || '').toUpperCase()
                                        ? rawName
                                        : '';
                                const metaBits = [r.type, r.exch].filter(Boolean).join(' · ');
                                const restParts = [nameText, metaBits].filter(Boolean);
                                const rest = restParts.length
                                    ? ` — <span class="ntp-ticker-option-rest">${escapeHtml(restParts.join(' · '))}</span>`
                                    : '';
                                return `<div class="ntp-ticker-option" role="option" tabindex="0" data-ntp-ticker-pick
        data-widget-id="${escapeHtml(widgetId)}"
        data-symbol="${symbol}" title="${symbol}${nameText ? ' — ' + escapeHtml(nameText) : ''}">
  <span class="ntp-ticker-option-sym">${symbol}</span>${rest}
</div>`;
                            })
                            .join('');
                        resultsEl.classList.remove('hidden');
                    }, 200);
                    return;
                }

                const search = e.target.closest('[data-ntp-city-search], [data-ntp-weather-city-search]');
                if (!search) return;
                const widgetId = search.dataset.widgetId;
                const picker = search.closest('.ntp-city-picker, .ntp-weather-city-picker');
                const resultsEl = picker?.querySelector(
                    '[data-ntp-city-results], [data-ntp-weather-city-results]'
                );
                const api = window.AxisNtpWidgets;
                if (!widgetId || !resultsEl || !api?.searchCities) return;

                const q = String(search.value || '').trim();
                clearTimeout(weatherCitySearchTimer);
                if (q.length < 2) {
                    resultsEl.classList.add('hidden');
                    resultsEl.innerHTML = '';
                    return;
                }

                const token = ++weatherCitySearchToken;
                resultsEl.innerHTML = '<div class="ntp-weather-city-empty">Searching…</div>';
                resultsEl.classList.remove('hidden');

                weatherCitySearchTimer = setTimeout(async () => {
                    let rows = [];
                    let failed = false;
                    try {
                        if (typeof window.electronAPI?.searchWeatherCities === 'function') {
                            const res = await window.electronAPI.searchWeatherCities(q, 12);
                            if (res?.ok && Array.isArray(res.results)) {
                                rows = res.results;
                            } else {
                                failed = true;
                                rows = await api.searchCities(q, { limit: 12 });
                            }
                        } else {
                            rows = await api.searchCities(q, { limit: 12 });
                        }
                    } catch (_) {
                        failed = true;
                        rows = [];
                    }
                    if (token !== weatherCitySearchToken) return;
                    if (!rows.length) {
                        resultsEl.innerHTML = failed
                            ? '<div class="ntp-weather-city-empty">Couldn’t reach city search — check your connection and try again</div>'
                            : '<div class="ntp-weather-city-empty">No cities found — try another spelling</div>';
                        resultsEl.classList.remove('hidden');
                        return;
                    }
                    resultsEl.innerHTML = rows
                        .map((r) => {
                            const label = escapeHtml(r.label || r.name || '');
                            return `<button type="button" class="ntp-weather-city-option" data-ntp-city-pick
        data-widget-id="${escapeHtml(widgetId)}"
        data-city="${escapeHtml(r.name || '')}"
        data-label="${escapeHtml(r.label || r.name || '')}"
        data-short="${escapeHtml(r.short || r.name || '')}"
        data-tz="${escapeHtml(r.timezone || '')}"
        data-lat="${r.latitude ?? ''}"
        data-lon="${r.longitude ?? ''}">${label}</button>`;
                        })
                        .join('');
                    resultsEl.classList.remove('hidden');
                }, 200);
            });

            document.getElementById('ntp-widgets-active-list')?.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                const opt = e.target.closest('[data-ntp-ticker-pick]');
                if (!opt) return;
                e.preventDefault();
                opt.click();
            });

            document.getElementById('ntp-widgets-active-list')?.addEventListener('click', (e) => {
                const moveBtn = e.target.closest('[data-ntp-ticker-move]');
                if (moveBtn) {
                    e.preventDefault();
                    if (moveBtn.disabled) return;
                    const widgetId = moveBtn.dataset.widgetId;
                    const symbol = moveBtn.getAttribute('data-symbol') || '';
                    const dir = moveBtn.getAttribute('data-ntp-ticker-move') === 'up' ? -1 : 1;
                    if (!widgetId || !symbol) return;
                    void moveNtpTicker(widgetId, symbol, dir);
                    return;
                }

                const removeChip = e.target.closest('[data-ntp-ticker-remove]');
                if (removeChip) {
                    e.preventDefault();
                    const widgetId = removeChip.dataset.widgetId;
                    const symbol = removeChip.getAttribute('data-symbol') || '';
                    if (!widgetId || !symbol) return;
                    const next = getNtpTickerSymbols(widgetId).filter((s) => s !== symbol);
                    void setNtpTickerSymbols(widgetId, next);
                    return;
                }

                const tickerOpt = e.target.closest('[data-ntp-ticker-pick]');
                if (tickerOpt) {
                    e.preventDefault();
                    const widgetId = tickerOpt.dataset.widgetId;
                    const symbol = tickerOpt.getAttribute('data-symbol') || '';
                    if (!widgetId || !symbol) return;
                    const current = getNtpTickerSymbols(widgetId);
                    const next = window.AxisNtpWidgets?.normalizeMarketSymbols
                        ? window.AxisNtpWidgets.normalizeMarketSymbols([...current, symbol])
                        : [...current, symbol].slice(0, 8);
                    const picker = tickerOpt.closest('.ntp-ticker-picker');
                    const search = picker?.querySelector('[data-ntp-ticker-search]');
                    const resultsEl = picker?.querySelector('[data-ntp-ticker-results]');
                    if (search) search.value = '';
                    if (resultsEl) {
                        resultsEl.classList.add('hidden');
                        resultsEl.innerHTML = '';
                    }
                    void setNtpTickerSymbols(widgetId, next);
                    return;
                }

                const opt = e.target.closest('[data-ntp-city-pick], [data-ntp-weather-pick]');
                if (!opt) return;
                e.preventDefault();
                const widgetId = opt.dataset.widgetId;
                if (!widgetId) return;
                const city = opt.getAttribute('data-city') || '';
                const label = opt.getAttribute('data-label') || city;
                const short = opt.getAttribute('data-short') || city;
                const timezone = opt.getAttribute('data-tz') || '';
                const lat = Number(opt.getAttribute('data-lat'));
                const lon = Number(opt.getAttribute('data-lon'));
                const picker = opt.closest('.ntp-city-picker, .ntp-weather-city-picker');
                const selected = picker?.querySelector(
                    '[data-ntp-city-selected], [data-ntp-weather-selected]'
                );
                const search = picker?.querySelector(
                    '[data-ntp-city-search], [data-ntp-weather-city-search]'
                );
                const resultsEl = picker?.querySelector(
                    '[data-ntp-city-results], [data-ntp-weather-city-results]'
                );
                if (selected) selected.textContent = label;
                if (search) search.value = '';
                if (resultsEl) {
                    resultsEl.classList.add('hidden');
                    resultsEl.innerHTML = '';
                }
                const patch = {
                    city,
                    placeLabel: short || label,
                    latitude: Number.isFinite(lat) ? lat : undefined,
                    longitude: Number.isFinite(lon) ? lon : undefined
                };
                if (timezone) patch.timezone = timezone;
                void patchNtpWidgetConfigById(widgetId, patch);
            });

            document.getElementById('ntp-widgets-reset-layout')?.addEventListener('click', () => {
                void (async () => {
                    settings.ntpWidgetLayout = [];
                    await saveSetting('ntpWidgetLayout', settings.ntpWidgetLayout, false);
                    syncNtpWidgetSettingsFields();
                })();
            });
            document.getElementById('ai-features-enabled')?.addEventListener('change', e => {
                settings.aiFeaturesEnabled = e.target.checked;
                syncAiFeaturesSettingsUi();
                saveSetting('aiFeaturesEnabled', e.target.checked, false);
            });
            document.getElementById('transparent-sites').addEventListener('change', e => {
                saveSetting('transparentSites', e.target.checked, true);
            });
            document.getElementById('site-theme-color').addEventListener('change', e => {
                saveSetting('siteThemeColor', e.target.checked, true);
            });
            document.getElementById('link-preview').addEventListener('change', e => {
                saveSetting('linkPreview', e.target.checked, false);
            });
            wclInput.addEventListener('input', (e) => {
                const v = parseInt(e.target.value, 10);
                const n = Number.isFinite(v) ? v : 0;
                wclLabel.textContent = formatWindowChromeLightLabel(n);
                settings.windowChromeLight = n;
                syncNativeWindowChromeTransparency();
            });
            wclInput.addEventListener('change', (e) => {
                const v = Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0));
                settings.windowChromeLight = v;
                syncNativeWindowChromeTransparency();
                saveSetting('windowChromeLight', v, true);
                wclLabel.textContent = formatWindowChromeLightLabel(v);
            });
            
            // History — load in pages as you scroll
            const HISTORY_PAGE_SIZE = 60;
            let historyAllItems = [];
            let historyVisibleCount = 0;
            let historySearchQuery = '';
            let historyObserver = null;

            function buildHistoryItemHtml(item) {
                return `<div class="history-item" data-url="${escapeHtml(item.url)}" data-id="${escapeHtml(String(item.id))}">
                            <img class="history-favicon" src="${escapeHtml(item.favicon || '')}" alt="" onerror="this.style.display='none'">
                            <div class="history-info">
                                <div class="history-title">${escapeHtml(item.title)}</div>
                                <div class="history-url">${escapeHtml(item.url)}</div>
                            </div>
                            <div class="history-time">${escapeHtml(formatTimeAgo(item.timestamp))}</div>
                            <button class="history-delete" data-id="${item.id}">Delete</button>
                </div>`;
            }

            function getFilteredHistoryItems() {
                const q = historySearchQuery.trim().toLowerCase();
                if (!q) return historyAllItems;
                return historyAllItems.filter((item) => {
                    const title = String(item.title || '').toLowerCase();
                    const url = String(item.url || '').toLowerCase();
                    return title.includes(q) || url.includes(q);
                });
            }

            function wireHistoryListHandlers(list) {
                list.querySelectorAll('.history-delete').forEach((btn) => {
                    if (btn.dataset.bound) return;
                    btn.dataset.bound = '1';
                    btn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        const rawId = btn.dataset.id;
                        const id = /^\d+$/.test(String(rawId || '')) ? parseInt(rawId, 10) : rawId;
                        await window.electronAPI.deleteHistoryItem(id);
                        populateHistory();
                    });
                });
                list.querySelectorAll('.history-item').forEach((item) => {
                    if (item.dataset.bound) return;
                    item.dataset.bound = '1';
                    item.addEventListener('click', (e) => {
                        if (e.target.closest('.history-delete')) return;
                        const url = (item.dataset.url || '').trim();
                        if (!url) return;
                        void window.electronAPI?.openUrlInBrowser?.(url);
                    });
                });
            }

            function updateHistoryCountLabel() {
                const el = document.getElementById('history-count');
                if (!el) return;
                const filtered = getFilteredHistoryItems();
                const total = filtered.length;
                const shown = Math.min(historyVisibleCount, total);
                if (total === 0) {
                    el.textContent = '';
                    return;
                }
                if (shown >= total) {
                    el.textContent = `${total} item${total === 1 ? '' : 's'}`;
                } else {
                    el.textContent = `${shown} of ${total}`;
                }
            }

            function updateHistorySentinel(hasMore) {
                const list = document.getElementById('history-list');
                if (!list) return;
                updateHistoryCountLabel();
                let sentinel = document.getElementById('history-load-sentinel');
                let status = document.getElementById('history-load-status');
                if (!hasMore) {
                    sentinel?.remove();
                    if (status) status.remove();
                    if (historyObserver) {
                        historyObserver.disconnect();
                        historyObserver = null;
                    }
                    return;
                }
                if (!sentinel) {
                    sentinel = document.createElement('div');
                    sentinel.id = 'history-load-sentinel';
                    sentinel.className = 'history-load-sentinel';
                    list.appendChild(sentinel);
                } else if (sentinel.parentElement !== list) {
                    list.appendChild(sentinel);
                }
                if (!status) {
                    status = document.createElement('div');
                    status.id = 'history-load-status';
                    status.className = 'history-load-more';
                    list.appendChild(status);
                } else if (status.parentElement !== list) {
                    list.insertBefore(status, sentinel);
                }
                status.textContent = 'Scroll for more…';
                setupHistoryObserver(sentinel);
            }

            function setupHistoryObserver(sentinel) {
                const root = document.querySelector('.main');
                if (!root || !sentinel) return;
                if (historyObserver) historyObserver.disconnect();
                historyObserver = new IntersectionObserver(
                    (entries) => {
                        if (entries.some((entry) => entry.isIntersecting)) {
                            renderMoreHistory(false);
                        }
                    },
                    { root, rootMargin: '240px 0px' }
                );
                historyObserver.observe(sentinel);
            }

            function renderMoreHistory(reset = false) {
                const list = document.getElementById('history-list');
                if (!list) return;
                const filtered = getFilteredHistoryItems();
                if (reset) {
                    historyVisibleCount = 0;
                    list.innerHTML = '';
                }
                if (filtered.length === 0) {
                    list.innerHTML = '<div class="empty-state">No history</div>';
                    if (historyObserver) {
                        historyObserver.disconnect();
                        historyObserver = null;
                    }
                    return;
                }
                const batch = filtered.slice(historyVisibleCount, historyVisibleCount + HISTORY_PAGE_SIZE);
                if (!batch.length) {
                    updateHistorySentinel(false);
                    return;
                }
                historyVisibleCount += batch.length;
                const html = batch.map((item) => buildHistoryItemHtml(item)).join('');
                const status = document.getElementById('history-load-status');
                if (status && list.contains(status)) {
                    status.insertAdjacentHTML('beforebegin', html);
                } else {
                    list.insertAdjacentHTML('beforeend', html);
                }
                wireHistoryListHandlers(list);
                updateHistorySentinel(historyVisibleCount < filtered.length);
            }

            async function populateHistory() {
                const list = document.getElementById('history-list');
                if (!list) return;
                try {
                    historyAllItems = (await window.electronAPI.getHistory()) || [];
                    historySearchQuery = document.getElementById('history-search')?.value || '';
                    renderMoreHistory(true);
                } catch (e) {
                    list.innerHTML = '<div class="empty-state">Failed to load</div>';
                }
            }
            let historySearchTimer = null;
            document.getElementById('history-search').addEventListener('input', (e) => {
                historySearchQuery = e.target.value || '';
                if (historySearchTimer) clearTimeout(historySearchTimer);
                historySearchTimer = setTimeout(() => {
                    historySearchTimer = null;
                    renderMoreHistory(true);
                }, 120);
            });
            document.getElementById('clear-history').addEventListener('click', async () => {
                if (confirm('Clear all history?')) {
                    await window.electronAPI.clearHistory();
                    populateHistory();
                }
            });
            // History loads when that section is opened (or prefetched in native mode).
            
            // Shortcuts: overrides store null = disabled; omitted key = use default
            async function persistShortcutOverrides() {
                await window.electronAPI.setShortcuts(shortcutOverrides);
            }
            async function reloadShortcutState() {
                shortcutOverrides = await window.electronAPI.getShortcutOverrides() || {};
                shortcutDefaults = await window.electronAPI.getDefaultShortcuts() || {};
            }
            function mergedActiveShortcuts() {
                const merged = {};
                for (const { action } of SHORTCUT_ACTIONS) {
                    const def = shortcutDefaults[action];
                    if (!def) continue;
                    if (Object.prototype.hasOwnProperty.call(shortcutOverrides, action)) {
                        const v = shortcutOverrides[action];
                        if (v !== null && v !== '' && v !== '__disabled__') merged[action] = v;
                    } else {
                        merged[action] = def;
                    }
                }
                return merged;
            }
            function renderShortcuts() {
                const list = document.getElementById('shortcuts-list');
                const merged = mergedActiveShortcuts();
                const enabled = SHORTCUT_ACTIONS.filter(({ action }) => merged[action]);
                const disabled = SHORTCUT_ACTIONS.filter(
                    ({ action }) => !merged[action] && shortcutDefaults[action]
                );
                const rowHtml = (action, label, isDisabled) => {
                    const val = merged[action];
                    const showVal = isDisabled ? 'Disabled' : formatShortcut(val);
                    const disableBtn = !isDisabled
                        ? `<button type="button" class="shortcut-action-btn" data-disable-action="${escapeHtml(action)}">Disable</button>`
                        : `<button type="button" class="shortcut-action-btn" data-enable-action="${escapeHtml(action)}">Enable</button>`;
                    return `
                    <div class="shortcut-row ${isDisabled ? 'shortcut-row-disabled' : ''}" data-shortcut-action="${escapeHtml(action)}">
                        <div class="shortcut-row-main">
                            <span>${escapeHtml(label)}</span>
                        </div>
                        <div class="shortcut-row-actions">
                            <input type="text" class="shortcut-input" readonly data-action="${escapeHtml(action)}" value="${escapeHtml(showVal)}" ${isDisabled ? 'disabled' : ''}>
                            ${disableBtn}
                        </div>
                    </div>`;
                };
                let html = '';
                html += '<div class="shortcuts-subheading">Active</div>';
                html += enabled.map(({ action, label }) => rowHtml(action, label, false)).join('');
                html += '<div class="shortcuts-subheading">Disabled</div>';
                html += disabled.length
                    ? disabled.map(({ action, label }) => rowHtml(action, label, true)).join('')
                    : '<div class="shortcut-row"><span style="font-size:12px;color:#86868b;padding:4px 16px;">No shortcuts disabled</span></div>';
                list.innerHTML = html;
                list.querySelectorAll('.shortcut-input').forEach((input) => {
                    if (input.disabled) return;
                    input.addEventListener('focus', () => {
                        window.electronAPI?.disableShortcuts?.();
                        input.value = 'Press keys...';
                        input.dataset.recording = '1';
                    });
                    input.addEventListener('blur', () => {
                        window.electronAPI?.enableShortcuts?.();
                        input.removeAttribute('data-recording');
                        const a = input.dataset.action;
                        const m = mergedActiveShortcuts();
                        if (input.value === 'Press keys...' && m[a]) {
                            input.value = formatShortcut(m[a]);
                        }
                    });
                    input.addEventListener('keydown', async (e) => {
                        if (!input.dataset.recording) return;
                        e.preventDefault();
                        if (e.key === 'Escape') {
                            input.blur();
                            return;
                        }
                        const isMac = navigator.platform.toUpperCase().includes('MAC');
                        const parts = [];
                        if (isMac && e.metaKey) parts.push('Cmd');
                        else if (e.ctrlKey) parts.push('Ctrl');
                        if (e.altKey) parts.push('Alt');
                        if (e.shiftKey) parts.push('Shift');
                        let key = e.key;
                        if (key === ' ') key = 'Space';
                        else if (key === 'ArrowLeft') key = 'Left';
                        else if (key === 'ArrowRight') key = 'Right';
                        else if (key === 'ArrowUp') key = 'Up';
                        else if (key === 'ArrowDown') key = 'Down';
                        else if (key.length === 1) key = key.toUpperCase();
                        if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return;
                        parts.push(key);
                        const shortcut = parts.join('+');
                        const action = input.dataset.action;
                        let conflict = null;
                        const m0 = mergedActiveShortcuts();
                        for (const [other, sc] of Object.entries(m0)) {
                            if (other !== action && sc === shortcut) {
                                conflict = other;
                                break;
                            }
                        }
                        if (conflict) {
                            const conflictName = SHORTCUT_ACTIONS.find((x) => x.action === conflict)?.label || conflict;
                            if (!confirm('This shortcut is already used by "' + conflictName + '". Disable that shortcut and use it here?')) {
                                input.blur();
                                return;
                            }
                            shortcutOverrides[conflict] = null;
                        }
                        if (shortcut === shortcutDefaults[action]) {
                            delete shortcutOverrides[action];
                        } else {
                            shortcutOverrides[action] = shortcut;
                        }
                        await persistShortcutOverrides();
                        await reloadShortcutState();
                        renderShortcuts();
                        window.electronAPI?.enableShortcuts?.();
                    });
                });
                list.querySelectorAll('[data-disable-action]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const action = btn.getAttribute('data-disable-action');
                        shortcutOverrides[action] = null;
                        await persistShortcutOverrides();
                        await reloadShortcutState();
                        renderShortcuts();
                    });
                });
                list.querySelectorAll('[data-enable-action]').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const action = btn.getAttribute('data-enable-action');
                        delete shortcutOverrides[action];
                        await persistShortcutOverrides();
                        await reloadShortcutState();
                        renderShortcuts();
                    });
                });
                applySettingsSearch(settingsSearchInput?.value || '');
            }
            document.getElementById('reset-shortcuts').addEventListener('click', async () => {
                if (confirm('Reset all shortcuts?')) {
                    await window.electronAPI.resetShortcuts();
                    await reloadShortcutState();
                    renderShortcuts();
                }
            });

            const baseSwitchSection = switchSection;
            let vaultEditorMode = null;
            let vaultEditorId = null;
            let vaultAuthInProgress = 0;

            function beginVaultAuth() {
                vaultAuthInProgress += 1;
            }

            function endVaultAuth() {
                vaultAuthInProgress = Math.max(0, vaultAuthInProgress - 1);
            }

            function vaultToast(message, isError) {
                const el = document.getElementById('vault-toast');
                if (!el) return;
                el.textContent = message || '';
                el.classList.toggle('error', !!isError);
            }

            async function requireVaultAuth(reason) {
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const ok = await window.electronAPI.vaultVerifyDevice(reason);
                    if (!ok) {
                        vaultToast('Authentication cancelled', true);
                        return false;
                    }
                    vaultToast('');
                    return true;
                } catch (e) {
                    vaultToast(e?.message || 'Could not verify identity', true);
                    return false;
                } finally {
                    endVaultAuth();
                }
            }

            async function refreshVaultPane() {
                const status = await window.electronAPI.vaultStatus();
                const autofill = document.getElementById('vault-autofill-enabled');
                if (autofill) autofill.checked = status.autofillEnabled !== false;
                const encWarn = document.getElementById('vault-encryption-warning');
                if (encWarn) {
                    if (status.secretsEncryptedAtRest === false) {
                        encWarn.textContent =
                            'Device encryption is unavailable, so Axis will not save new passwords or card numbers. Existing sealed items still work when encryption returns.';
                        encWarn.classList.remove('hidden');
                    } else {
                        encWarn.textContent = '';
                        encWarn.classList.add('hidden');
                    }
                }
                await renderVaultLogins();
                await renderVaultCards();
                await renderVaultAddresses();
            }

            function setVaultRowOpen(row, open) {
                if (!row) return;
                row.classList.toggle('vault-table-row--open', !!open);
            }

            function buildLoginRevealHtml(username, password) {
                return `<div class="vault-reveal-grid">
                    <div class="vault-reveal-row"><span class="vault-reveal-label">Username</span><span class="vault-reveal-val">${escapeHtml(username)}</span></div>
                    <div class="vault-reveal-row"><span class="vault-reveal-label">Password</span><span class="vault-reveal-val">${escapeHtml(password)}</span></div>
                </div>`;
            }

            function buildCardRevealHtml(number, expMonth, expYear, cvv) {
                const digits = String(number || '').replace(/\D/g, '');
                const grouped = digits.replace(/(.{4})/g, '$1 ').trim();
                return `<div class="vault-reveal-grid">
                    <div class="vault-reveal-row"><span class="vault-reveal-label">Number</span><span class="vault-reveal-val">${escapeHtml(grouped)}</span></div>
                    <div class="vault-reveal-row"><span class="vault-reveal-label">Expires</span><span class="vault-reveal-val">${escapeHtml(expMonth)}/${escapeHtml(expYear)}</span></div>
                    <div class="vault-reveal-row"><span class="vault-reveal-label">CVV</span><span class="vault-reveal-val">${escapeHtml(cvv || '—')}</span></div>
                </div>`;
            }

            async function toggleLoginReveal(id, detailEl, btn) {
                const row = btn.closest('.vault-table-row');
                if (btn.getAttribute('aria-pressed') === 'true') {
                    btn.setAttribute('aria-pressed', 'false');
                    detailEl.classList.add('hidden');
                    detailEl.innerHTML = '';
                    setVaultRowOpen(row, false);
                    vaultToast('');
                    return;
                }
                hideVaultEditor();
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const revealed = await window.electronAPI.vaultRevealLogin(id);
                    if (!revealed || !revealed.ok) {
                        vaultToast(
                            revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify identity',
                            true
                        );
                        return;
                    }
                    detailEl.innerHTML = buildLoginRevealHtml(revealed.username, revealed.password);
                    detailEl.classList.remove('hidden');
                    btn.setAttribute('aria-pressed', 'true');
                    setVaultRowOpen(row, true);
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not verify identity', true);
                } finally {
                    endVaultAuth();
                }
            }

            async function toggleCardReveal(id, detailEl, btn) {
                const row = btn.closest('.vault-table-row');
                if (btn.getAttribute('aria-pressed') === 'true') {
                    btn.setAttribute('aria-pressed', 'false');
                    detailEl.classList.add('hidden');
                    detailEl.innerHTML = '';
                    setVaultRowOpen(row, false);
                    vaultToast('');
                    return;
                }
                hideVaultEditor();
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const revealed = await window.electronAPI.vaultRevealCard(id);
                    if (!revealed || !revealed.ok) {
                        vaultToast(
                            revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify identity',
                            true
                        );
                        return;
                    }
                    detailEl.innerHTML = buildCardRevealHtml(
                        revealed.number,
                        revealed.expMonth,
                        revealed.expYear,
                        revealed.cvv
                    );
                    detailEl.classList.remove('hidden');
                    btn.setAttribute('aria-pressed', 'true');
                    setVaultRowOpen(row, true);
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not verify identity', true);
                } finally {
                    endVaultAuth();
                }
            }

            async function renderVaultLogins() {
                const list = document.getElementById('vault-logins-list');
                if (!list) return;
                const res = await window.electronAPI.vaultListLogins();
                const items = res.items || [];
                const countEl = document.getElementById('vault-login-count');
                if (countEl) countEl.textContent = items.length === 1 ? '1 password' : `${items.length} passwords`;
                if (!items.length) {
                    list.innerHTML = '<div class="empty-state" style="padding:16px 12px;">No saved passwords yet. Use <strong>+ Add password</strong> or save from a login page.</div>';
                    return;
                }
                list.innerHTML = items.map((item) => {
                    const site = escapeHtml(item.origin || '—');
                    const id = escapeHtml(item.id);
                    return `<div class="vault-table-row" data-login-id="${id}">
                        <div class="vault-td-site"><strong>${site}</strong></div>
                        <div class="vault-td-actions">
                            <button type="button" class="vault-icon-btn vault-eye-login" data-id="${id}" title="View" aria-label="View login" aria-pressed="false"></button>
                            <button type="button" class="vault-icon-btn vault-edit-login" data-id="${id}" title="Edit" aria-label="Edit">✎</button>
                            <button type="button" class="vault-icon-btn destructive vault-del-login" data-id="${id}" title="Delete" aria-label="Delete">⌫</button>
                        </div>
                        <div class="vault-row-detail hidden" data-login-detail="${id}"></div>
                    </div>`;
                }).join('');
                list.querySelectorAll('.vault-eye-login').forEach((btn) => {
                    mountVaultEyeButton(btn);
                    btn.addEventListener('click', () => {
                        const row = btn.closest('.vault-table-row');
                        const detail = row?.querySelector('[data-login-detail]');
                        if (detail) void toggleLoginReveal(btn.dataset.id, detail, btn);
                    });
                });
                list.querySelectorAll('.vault-edit-login').forEach((btn) => {
                    btn.addEventListener('click', () => void openVaultLoginEditor(btn.dataset.id));
                });
                list.querySelectorAll('.vault-del-login').forEach((btn) => {
                    btn.addEventListener('click', () => void deleteVaultLogin(btn.dataset.id));
                });
            }

            async function renderVaultCards() {
                const list = document.getElementById('vault-cards-list');
                if (!list) return;
                const res = await window.electronAPI.vaultListCards();
                const items = res.items || [];
                const countEl = document.getElementById('vault-card-count');
                if (countEl) countEl.textContent = items.length === 1 ? '1 card' : `${items.length} cards`;
                if (!items.length) {
                    list.innerHTML = '<div class="empty-state" style="padding:16px 12px;">No saved cards yet.</div>';
                    return;
                }
                list.innerHTML = items.map((item) => {
                    const title = escapeHtml(item.label || item.masked || 'Saved card');
                    const id = escapeHtml(item.id);
                    return `<div class="vault-table-row">
                        <div class="vault-td-site"><strong>${title}</strong></div>
                        <div class="vault-td-actions">
                            <button type="button" class="vault-icon-btn vault-eye-card" data-id="${id}" title="View" aria-label="View card" aria-pressed="false"></button>
                            <button type="button" class="vault-icon-btn vault-edit-card" data-id="${id}" title="Edit" aria-label="Edit">✎</button>
                            <button type="button" class="vault-icon-btn destructive vault-del-card" data-id="${id}" title="Delete" aria-label="Delete">⌫</button>
                        </div>
                        <div class="vault-row-detail hidden" data-card-detail="${id}"></div>
                    </div>`;
                }).join('');
                list.querySelectorAll('.vault-eye-card').forEach((btn) => {
                    mountVaultEyeButton(btn);
                    btn.addEventListener('click', () => {
                        const row = btn.closest('.vault-table-row');
                        const detail = row?.querySelector('[data-card-detail]');
                        if (detail) void toggleCardReveal(btn.dataset.id, detail, btn);
                    });
                });
                list.querySelectorAll('.vault-edit-card').forEach((btn) => {
                    btn.addEventListener('click', () => void openVaultCardEditor(btn.dataset.id));
                });
                list.querySelectorAll('.vault-del-card').forEach((btn) => {
                    btn.addEventListener('click', () => void deleteVaultCard(btn.dataset.id));
                });
            }

            async function renderVaultAddresses() {
                const list = document.getElementById('vault-addresses-list');
                if (!list) return;
                const res = await window.electronAPI.vaultListAddresses();
                const items = res.items || [];
                const countEl = document.getElementById('vault-address-count');
                if (countEl) countEl.textContent = items.length === 1 ? '1 address' : `${items.length} addresses`;
                if (!items.length) {
                    list.innerHTML = '<div class="empty-state" style="padding:16px 12px;">No saved addresses yet. Use <strong>+ Add address</strong> or save from a checkout form.</div>';
                    return;
                }
                list.innerHTML = items.map((item) => {
                    const label = item.label ? `${escapeHtml(item.label)} · ` : '';
                    const name = escapeHtml(item.fullName || 'Saved address');
                    const summary = escapeHtml(item.summary || '');
                    const id = escapeHtml(item.id);
                    return `<div class="vault-table-row" data-address-id="${id}">
                        <div class="vault-td-site"><strong>${label}${name}</strong><div style="font-size:12px;color:#86868b;margin-top:2px;">${summary}</div></div>
                        <div class="vault-td-actions">
                            <button type="button" class="vault-icon-btn vault-edit-address" data-id="${id}" title="Edit" aria-label="Edit">✎</button>
                            <button type="button" class="vault-icon-btn destructive vault-del-address" data-id="${id}" title="Delete" aria-label="Delete">⌫</button>
                        </div>
                        <div class="vault-row-detail hidden" data-address-detail="${id}"></div>
                    </div>`;
                }).join('');
                list.querySelectorAll('.vault-edit-address').forEach((btn) => {
                    btn.addEventListener('click', () => void openVaultAddressEditor(btn.dataset.id));
                });
                list.querySelectorAll('.vault-del-address').forEach((btn) => {
                    btn.addEventListener('click', () => void deleteVaultAddress(btn.dataset.id));
                });
            }

            function parkVaultEditor() {
                const ed = document.getElementById('vault-editor');
                const park = document.getElementById('vault-editor-park');
                if (ed && park && ed.parentElement !== park) park.appendChild(ed);
                ed?.classList.add('hidden');
                ed?.classList.remove('vault-editor--inline');
            }

            function mountVaultEditor(targetEl, inline = false) {
                const ed = document.getElementById('vault-editor');
                if (!ed || !targetEl) return;
                targetEl.appendChild(ed);
                ed.classList.remove('hidden');
                ed.classList.toggle('vault-editor--inline', inline);
            }

            function closeVaultRowPanels({ keepEditor = false } = {}) {
                if (!keepEditor) parkVaultEditor();
                document.querySelectorAll('.vault-row-detail').forEach((el) => {
                    if (keepEditor && el.querySelector('#vault-editor')) return;
                    el.classList.add('hidden');
                    if (!el.querySelector('#vault-editor')) el.innerHTML = '';
                });
                document.querySelectorAll('.vault-table-row--open').forEach((row) => {
                    if (keepEditor && row.querySelector('#vault-editor')) return;
                    row.classList.remove('vault-table-row--open');
                });
                document.querySelectorAll('.vault-eye-login, .vault-eye-card').forEach((btn) => {
                    btn.setAttribute('aria-pressed', 'false');
                });
            }

            function hideVaultEditor() {
                parkVaultEditor();
                vaultEditorMode = null;
                vaultEditorId = null;
                closeVaultRowPanels();
            }

            parkVaultEditor();

            async function openVaultLoginEditor(id) {
                closeVaultRowPanels();
                vaultEditorMode = 'login';
                vaultEditorId = id || null;
                const ed = document.getElementById('vault-editor');
                document.getElementById('vault-editor-title').textContent = id ? 'Edit password' : 'Add password';
                document.getElementById('vault-editor-login-fields').classList.remove('hidden');
                document.getElementById('vault-editor-card-fields').classList.add('hidden');
                document.getElementById('vault-editor-address-fields').classList.add('hidden');
                document.getElementById('vault-editor-error').textContent = '';
                const pw = document.getElementById('vault-edit-password');
                const pwEye = document.getElementById('vault-edit-password-eye');
                let mountTarget = document.querySelector('[data-vault-editor-home="login"]');
                let mountInline = false;
                if (id) {
                    vaultToast('Waiting for authentication…');
                    let revealed;
                    beginVaultAuth();
                    try {
                        revealed = await window.electronAPI.vaultRevealLogin(id);
                    } catch (e) {
                        vaultToast(e?.message || 'Could not verify identity', true);
                        vaultEditorMode = null;
                        vaultEditorId = null;
                        return;
                    } finally {
                        endVaultAuth();
                    }
                    if (!revealed?.ok) {
                        vaultToast(
                            revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify identity',
                            true
                        );
                        vaultEditorMode = null;
                        vaultEditorId = null;
                        return;
                    }
                    const row = document.querySelector(`.vault-table-row[data-login-id="${CSS.escape(id)}"]`);
                    const detail = row?.querySelector('[data-login-detail]');
                    if (detail) {
                        mountTarget = detail;
                        mountInline = true;
                        detail.classList.remove('hidden');
                        setVaultRowOpen(row, true);
                    }
                    const rowMeta = revealed;
                    document.getElementById('vault-edit-origin').value = rowMeta.origin || '';
                    document.getElementById('vault-edit-username').value = revealed.username || '';
                    if (pw) {
                        pw.type = 'password';
                        pw.value = revealed.password || '';
                        pw.placeholder = '';
                    }
                    if (pwEye) pwEye.setAttribute('aria-pressed', 'false');
                    document.getElementById('vault-edit-notes').value = rowMeta.notes || '';
                    vaultToast('');
                } else {
                    document.getElementById('vault-edit-origin').value = '';
                    document.getElementById('vault-edit-username').value = '';
                    if (pw) {
                        pw.value = '';
                        pw.type = 'password';
                        pw.placeholder = '';
                    }
                    if (pwEye) pwEye.setAttribute('aria-pressed', 'false');
                    document.getElementById('vault-edit-notes').value = '';
                }
                if (mountTarget) {
                    mountVaultEditor(mountTarget, mountInline);
                    if (mountInline) mountTarget.closest('.vault-table-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    ed?.classList.remove('hidden');
                }
            }

            async function openVaultCardEditor(id) {
                closeVaultRowPanels();
                vaultEditorMode = 'card';
                vaultEditorId = id || null;
                const ed = document.getElementById('vault-editor');
                document.getElementById('vault-editor-title').textContent = id ? 'Edit card' : 'Add card';
                document.getElementById('vault-editor-login-fields').classList.add('hidden');
                document.getElementById('vault-editor-card-fields').classList.remove('hidden');
                document.getElementById('vault-editor-address-fields').classList.add('hidden');
                document.getElementById('vault-editor-error').textContent = '';
                let mountTarget = document.querySelector('[data-vault-editor-home="card"]');
                let mountInline = false;
                if (id) {
                    vaultToast('Waiting for authentication…');
                    let revealed;
                    beginVaultAuth();
                    try {
                        revealed = await window.electronAPI.vaultRevealCard(id);
                    } catch (e) {
                        vaultToast(e?.message || 'Could not verify identity', true);
                        vaultEditorMode = null;
                        vaultEditorId = null;
                        return;
                    } finally {
                        endVaultAuth();
                    }
                    if (!revealed?.ok) {
                        vaultToast(
                            revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify identity',
                            true
                        );
                        vaultEditorMode = null;
                        vaultEditorId = null;
                        return;
                    }
                    const row = document.querySelector(`[data-card-detail="${CSS.escape(id)}"]`)?.closest('.vault-table-row');
                    const detail = row?.querySelector('[data-card-detail]');
                    if (detail) {
                        mountTarget = detail;
                        mountInline = true;
                        detail.classList.remove('hidden');
                        setVaultRowOpen(row, true);
                    }
                    const rowMeta = revealed;
                    document.getElementById('vault-edit-card-label').value = rowMeta.label || '';
                    document.getElementById('vault-edit-cardholder').value = rowMeta.cardholder || '';
                    const num = document.getElementById('vault-edit-card-number');
                    if (num) {
                        num.type = 'text';
                        num.value = revealed.number || '';
                        num.placeholder = '';
                    }
                    document.getElementById('vault-edit-exp-month').value = rowMeta.expMonth || revealed.expMonth || '';
                    document.getElementById('vault-edit-exp-year').value = rowMeta.expYear || revealed.expYear || '';
                    const cvv = document.getElementById('vault-edit-cvv');
                    if (cvv) {
                        cvv.type = 'password';
                        cvv.value = revealed.cvv || '';
                        cvv.placeholder = '';
                    }
                    document.getElementById('vault-edit-billing-zip').value = rowMeta.billingZip || '';
                    vaultToast('');
                } else {
                    ['vault-edit-card-label','vault-edit-cardholder','vault-edit-card-number','vault-edit-exp-month','vault-edit-exp-year','vault-edit-cvv','vault-edit-billing-zip'].forEach((i) => {
                        const el = document.getElementById(i);
                        if (el) el.value = '';
                    });
                }
                if (mountTarget) {
                    mountVaultEditor(mountTarget, mountInline);
                    if (mountInline) mountTarget.closest('.vault-table-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    ed?.classList.remove('hidden');
                }
            }

            async function openVaultAddressEditor(id) {
                closeVaultRowPanels();
                vaultEditorMode = 'address';
                vaultEditorId = id || null;
                const ed = document.getElementById('vault-editor');
                document.getElementById('vault-editor-title').textContent = id ? 'Edit address' : 'Add address';
                document.getElementById('vault-editor-login-fields').classList.add('hidden');
                document.getElementById('vault-editor-card-fields').classList.add('hidden');
                document.getElementById('vault-editor-address-fields').classList.remove('hidden');
                document.getElementById('vault-editor-error').textContent = '';
                let mountTarget = document.querySelector('[data-vault-editor-home="address"]');
                let mountInline = false;
                const fieldIds = [
                    'vault-edit-address-label',
                    'vault-edit-address-name',
                    'vault-edit-address-org',
                    'vault-edit-address-line1',
                    'vault-edit-address-line2',
                    'vault-edit-address-city',
                    'vault-edit-address-state',
                    'vault-edit-address-postal',
                    'vault-edit-address-country',
                    'vault-edit-address-phone',
                    'vault-edit-address-email'
                ];
                if (id) {
                    vaultToast('Waiting for authentication…');
                    beginVaultAuth();
                    let rowMeta;
                    try {
                        rowMeta = await window.electronAPI.vaultGetAddress(id);
                    } catch (e) {
                        vaultToast(e?.message || 'Could not verify identity', true);
                        vaultEditorMode = null;
                        vaultEditorId = null;
                        return;
                    } finally {
                        endVaultAuth();
                    }
                    if (!rowMeta) {
                        vaultToast('Authentication cancelled', true);
                        vaultEditorMode = null;
                        vaultEditorId = null;
                        return;
                    }
                    const row = document.querySelector(`.vault-table-row[data-address-id="${CSS.escape(id)}"]`);
                    const detail = row?.querySelector('[data-address-detail]');
                    if (detail) {
                        mountTarget = detail;
                        mountInline = true;
                        detail.classList.remove('hidden');
                        setVaultRowOpen(row, true);
                    }
                    document.getElementById('vault-edit-address-label').value = rowMeta.label || '';
                    document.getElementById('vault-edit-address-name').value = rowMeta.fullName || '';
                    document.getElementById('vault-edit-address-org').value = rowMeta.organization || '';
                    document.getElementById('vault-edit-address-line1').value = rowMeta.addressLine1 || '';
                    document.getElementById('vault-edit-address-line2').value = rowMeta.addressLine2 || '';
                    document.getElementById('vault-edit-address-city').value = rowMeta.city || '';
                    document.getElementById('vault-edit-address-state').value = rowMeta.state || '';
                    document.getElementById('vault-edit-address-postal').value = rowMeta.postalCode || '';
                    document.getElementById('vault-edit-address-country').value = rowMeta.country || '';
                    document.getElementById('vault-edit-address-phone').value = rowMeta.phone || '';
                    document.getElementById('vault-edit-address-email').value = rowMeta.email || '';
                    vaultToast('');
                } else {
                    fieldIds.forEach((fid) => {
                        const el = document.getElementById(fid);
                        if (el) el.value = '';
                    });
                }
                if (mountTarget) {
                    mountVaultEditor(mountTarget, mountInline);
                    if (mountInline) mountTarget.closest('.vault-table-row')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                } else {
                    ed?.classList.remove('hidden');
                }
            }

            async function saveVaultEditor() {
                const err = document.getElementById('vault-editor-error');
                if (err) err.textContent = '';
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    if (vaultEditorMode === 'login') {
                        const origin = document.getElementById('vault-edit-origin').value;
                        await window.electronAPI.vaultSaveLogin({
                            id: vaultEditorId,
                            origin,
                            title: '',
                            username: document.getElementById('vault-edit-username').value,
                            password: document.getElementById('vault-edit-password').value,
                            notes: document.getElementById('vault-edit-notes').value
                        });
                        await renderVaultLogins();
                    } else if (vaultEditorMode === 'card') {
                        await window.electronAPI.vaultSaveCard({
                            id: vaultEditorId,
                            label: document.getElementById('vault-edit-card-label').value,
                            cardholder: document.getElementById('vault-edit-cardholder').value,
                            number: document.getElementById('vault-edit-card-number').value,
                            expMonth: document.getElementById('vault-edit-exp-month').value,
                            expYear: document.getElementById('vault-edit-exp-year').value,
                            cvv: document.getElementById('vault-edit-cvv').value,
                            billingZip: document.getElementById('vault-edit-billing-zip').value
                        });
                        await renderVaultCards();
                    } else if (vaultEditorMode === 'address') {
                        await window.electronAPI.vaultSaveAddress({
                            id: vaultEditorId,
                            label: document.getElementById('vault-edit-address-label').value,
                            fullName: document.getElementById('vault-edit-address-name').value,
                            organization: document.getElementById('vault-edit-address-org').value,
                            addressLine1: document.getElementById('vault-edit-address-line1').value,
                            addressLine2: document.getElementById('vault-edit-address-line2').value,
                            city: document.getElementById('vault-edit-address-city').value,
                            state: document.getElementById('vault-edit-address-state').value,
                            postalCode: document.getElementById('vault-edit-address-postal').value,
                            country: document.getElementById('vault-edit-address-country').value,
                            phone: document.getElementById('vault-edit-address-phone').value,
                            email: document.getElementById('vault-edit-address-email').value
                        });
                        await renderVaultAddresses();
                    }
                    hideVaultEditor();
                    vaultToast('');
                } catch (e) {
                    const cancelled = /authentication cancelled|cancelled/i.test(String(e?.message || ''));
                    vaultToast(cancelled ? 'Authentication cancelled' : e?.message || 'Could not save', true);
                    if (err && !cancelled) err.textContent = e?.message || 'Could not save';
                } finally {
                    endVaultAuth();
                }
            }

            async function deleteVaultLogin(id) {
                if (!confirm('Are you sure you want to delete this saved password?')) return;
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const ok = await window.electronAPI.vaultDeleteLogin(id);
                    if (!ok) {
                        vaultToast('Authentication cancelled', true);
                        return;
                    }
                    hideVaultEditor();
                    await renderVaultLogins();
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not delete', true);
                } finally {
                    endVaultAuth();
                }
            }

            async function deleteVaultCard(id) {
                if (!confirm('Are you sure you want to delete this saved card?')) return;
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const ok = await window.electronAPI.vaultDeleteCard(id);
                    if (!ok) {
                        vaultToast('Authentication cancelled', true);
                        return;
                    }
                    hideVaultEditor();
                    await renderVaultCards();
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not delete', true);
                } finally {
                    endVaultAuth();
                }
            }

            async function deleteVaultAddress(id) {
                if (!confirm('Are you sure you want to delete this saved address?')) return;
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const ok = await window.electronAPI.vaultDeleteAddress(id);
                    if (!ok) {
                        vaultToast('Authentication cancelled', true);
                        return;
                    }
                    hideVaultEditor();
                    await renderVaultAddresses();
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not delete', true);
                } finally {
                    endVaultAuth();
                }
            }

            document.getElementById('vault-autofill-enabled')?.addEventListener('change', async (e) => {
                await window.electronAPI.setSetting('vaultAutofillEnabled', e.target.checked);
            });

            mountVaultEyeButton(document.getElementById('vault-edit-password-eye'));
            mountVaultEyeButton(document.getElementById('vault-edit-card-number-eye'));
            mountVaultEyeButton(document.getElementById('vault-edit-cvv-eye'));

            document.getElementById('vault-edit-password-eye')?.addEventListener('click', async () => {
                if (!vaultEditorId || vaultEditorMode !== 'login') return;
                const input = document.getElementById('vault-edit-password');
                const btn = document.getElementById('vault-edit-password-eye');
                if (!input || !btn) return;
                if (btn.getAttribute('aria-pressed') === 'true') {
                    input.type = 'password';
                    input.value = '';
                    btn.setAttribute('aria-pressed', 'false');
                    return;
                }
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const revealed = await window.electronAPI.vaultRevealLogin(vaultEditorId);
                    if (!revealed?.ok) {
                        vaultToast(revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify', true);
                        return;
                    }
                    input.type = 'text';
                    input.value = revealed.password || '';
                    btn.setAttribute('aria-pressed', 'true');
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not verify', true);
                } finally {
                    endVaultAuth();
                }
            });

            document.getElementById('vault-edit-card-number-eye')?.addEventListener('click', async () => {
                if (!vaultEditorId || vaultEditorMode !== 'card') return;
                const input = document.getElementById('vault-edit-card-number');
                const btn = document.getElementById('vault-edit-card-number-eye');
                if (!input || !btn) return;
                if (btn.getAttribute('aria-pressed') === 'true') {
                    input.type = 'password';
                    input.value = '';
                    btn.setAttribute('aria-pressed', 'false');
                    return;
                }
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const revealed = await window.electronAPI.vaultRevealCard(vaultEditorId);
                    if (!revealed?.ok) {
                        vaultToast(revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify', true);
                        return;
                    }
                    input.type = 'text';
                    input.value = revealed.number || '';
                    btn.setAttribute('aria-pressed', 'true');
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not verify', true);
                } finally {
                    endVaultAuth();
                }
            });

            document.getElementById('vault-edit-cvv-eye')?.addEventListener('click', async () => {
                if (!vaultEditorId || vaultEditorMode !== 'card') return;
                const input = document.getElementById('vault-edit-cvv');
                const btn = document.getElementById('vault-edit-cvv-eye');
                if (!input || !btn) return;
                if (btn.getAttribute('aria-pressed') === 'true') {
                    input.type = 'password';
                    input.value = '';
                    btn.setAttribute('aria-pressed', 'false');
                    return;
                }
                vaultToast('Waiting for authentication…');
                beginVaultAuth();
                try {
                    const revealed = await window.electronAPI.vaultRevealCard(vaultEditorId);
                    if (!revealed?.ok) {
                        vaultToast(revealed?.cancelled ? 'Authentication cancelled' : 'Could not verify', true);
                        return;
                    }
                    input.type = 'text';
                    input.value = revealed.cvv || '';
                    btn.setAttribute('aria-pressed', 'true');
                    vaultToast('');
                } catch (e) {
                    vaultToast(e?.message || 'Could not verify', true);
                } finally {
                    endVaultAuth();
                }
            });

            document.querySelectorAll('.vault-segment').forEach((btn) => {
                btn.addEventListener('click', () => {
                    document.querySelectorAll('.vault-segment').forEach((b) => {
                        b.classList.remove('active');
                        b.setAttribute('aria-selected', 'false');
                    });
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                    const tab = btn.dataset.vaultSubtab;
                    document.getElementById('vault-passwords-panel')?.classList.toggle('hidden', tab !== 'passwords');
                    document.getElementById('vault-cards-panel')?.classList.toggle('hidden', tab !== 'cards');
                    document.getElementById('vault-addresses-panel')?.classList.toggle('hidden', tab !== 'addresses');
                    hideVaultEditor();
                });
            });

            document.getElementById('vault-add-login-btn')?.addEventListener('click', () => void openVaultLoginEditor(null));
            document.getElementById('vault-add-card-btn')?.addEventListener('click', () => void openVaultCardEditor(null));
            document.getElementById('vault-add-address-btn')?.addEventListener('click', () => void openVaultAddressEditor(null));
            document.getElementById('vault-editor-save')?.addEventListener('click', () => void saveVaultEditor());
            document.getElementById('vault-editor-cancel')?.addEventListener('click', () => hideVaultEditor());

            let profilesCurrentId = 'personal';
            let profilesCustomImportPath = '';
            const profilesOverviewBody = document.getElementById('profiles-overview-body');
            const profilesTrashList = document.getElementById('profiles-trash-list');
            const profilesTrashStatus = document.getElementById('profiles-trash-status');
            const profilesStartupMode = document.getElementById('profiles-startup-mode');
            const profilesStartupProfileRow = document.getElementById('profiles-startup-profile-row');
            const profilesStartupProfile = document.getElementById('profiles-startup-profile');
            const profilesNewWindowMode = document.getElementById('profiles-new-window-mode');
            const profilesExportSelect = document.getElementById('profiles-export-select');
            const profilesBackupStatus = document.getElementById('profiles-backup-status');
            const profilesImportBrowser = document.getElementById('profiles-import-browser');
            const profilesImportSource = document.getElementById('profiles-import-source');
            const profilesImportName = document.getElementById('profiles-import-name');
            const profilesImportPreview = document.getElementById('profiles-import-preview');
            const profilesImportStatus = document.getElementById('profiles-import-status');

            function setProfilesStatus(el, text, kind = '') {
                if (!el) return;
                el.textContent = text || '';
                el.classList.remove('ok', 'err');
                if (kind) el.classList.add(kind);
            }

            function setImportStatus(text, kind = '') {
                setProfilesStatus(profilesImportStatus, text, kind);
            }

            function setBackupStatus(text, kind = '') {
                setProfilesStatus(profilesBackupStatus, text, kind);
            }

            function syncStartupProfileRowVisibility() {
                const show = profilesStartupMode?.value === 'fixed';
                profilesStartupProfileRow?.classList.toggle('hidden', !show);
            }

            function fillProfileSelect(selectEl, profiles, selectedId) {
                if (!selectEl) return;
                selectEl.innerHTML = (profiles || [])
                    .map(
                        (p) =>
                            `<option value="${escapeHtml(p.id)}"${p.id === selectedId ? ' selected' : ''}>${escapeHtml(p.name || p.id)}</option>`
                    )
                    .join('');
            }

            async function loadProfileGlobalSettings(profiles) {
                if (!window.electronAPI?.getProfileGlobalSettings) return;
                const settings = await window.electronAPI.getProfileGlobalSettings();
                if (profilesStartupMode) profilesStartupMode.value = settings.profileStartupMode || 'resume';
                if (profilesNewWindowMode) profilesNewWindowMode.value = settings.profileNewWindowMode || 'same';
                fillProfileSelect(
                    profilesStartupProfile,
                    profiles,
                    settings.profileStartupProfileId || profilesCurrentId
                );
                syncStartupProfileRowVisibility();
            }

            function renderProfilesOverview(profiles, currentId) {
                if (!profilesOverviewBody) return;
                if (!Array.isArray(profiles) || profiles.length === 0) {
                    profilesOverviewBody.innerHTML = '<tr><td colspan="6">No profiles found.</td></tr>';
                    return;
                }
                profilesOverviewBody.innerHTML = profiles
                    .map((p) => {
                        const active = p.id === currentId;
                        return `<tr class="${active ? 'active' : ''}">
                            <td>${escapeHtml(p.name || p.id)}</td>
                            <td class="num">${p.favorites ?? 0}</td>
                            <td class="num">${p.history ?? 0}</td>
                            <td class="num">${p.pinnedTabs ?? 0}</td>
                            <td class="num">${p.extensions ?? 0}</td>
                            <td class="num">${escapeHtml(p.storageLabel || '')}</td>
                        </tr>`;
                    })
                    .join('');
                fillProfileSelect(profilesExportSelect, profiles, currentId);
            }

            async function refreshProfilesTrash() {
                if (!profilesTrashList || !window.electronAPI?.listTrashedProfiles) return;
                try {
                    const entries = await window.electronAPI.listTrashedProfiles();
                    if (!Array.isArray(entries) || entries.length === 0) {
                        profilesTrashList.innerHTML = '<p class="profiles-trash-empty">No deleted profiles.</p>';
                        return;
                    }
                    profilesTrashList.innerHTML = entries
                        .map((entry) => {
                            const deletedAt = entry.deletedAt
                                ? new Date(entry.deletedAt).toLocaleString()
                                : 'Recently';
                            const name = String(entry.name || entry.profileId || 'Profile');
                            return `<div class="profiles-trash-row" data-trash-id="${entry.trashId}">
                                <div class="profiles-trash-meta">
                                    <div class="profiles-trash-name">${name}</div>
                                    <div class="profiles-trash-date">Deleted ${deletedAt}</div>
                                </div>
                                <div class="profiles-trash-actions">
                                    <button type="button" class="profiles-trash-restore" data-trash-id="${entry.trashId}">Restore</button>
                                    <button type="button" class="profiles-trash-delete" data-trash-id="${entry.trashId}">Delete permanently</button>
                                </div>
                            </div>`;
                        })
                        .join('');
                } catch (_) {
                    profilesTrashList.innerHTML = '<p class="profiles-trash-empty">Could not load profile trash.</p>';
                }
            }

            function setTrashStatus(text, kind) {
                if (!profilesTrashStatus) return;
                profilesTrashStatus.textContent = text || '';
                profilesTrashStatus.className = `profiles-status${kind ? ` profiles-status--${kind}` : ''}`;
            }

            profilesTrashList?.addEventListener('click', (event) => {
                const restoreBtn = event.target.closest('.profiles-trash-restore');
                const deleteBtn = event.target.closest('.profiles-trash-delete');
                if (restoreBtn) {
                    const trashId = restoreBtn.getAttribute('data-trash-id');
                    void (async () => {
                        setTrashStatus('Restoring…');
                        try {
                            const result = await window.electronAPI.restoreTrashedProfile?.({ trashId });
                            if (!result?.ok) {
                                setTrashStatus(result?.error || 'Restore failed', 'err');
                                return;
                            }
                            setTrashStatus(`Restored “${result.profileName || 'profile'}”.`, 'ok');
                            await refreshProfilesPane();
                        } catch (e) {
                            setTrashStatus(String(e?.message || e), 'err');
                        }
                    })();
                    return;
                }
                if (deleteBtn) {
                    const trashId = deleteBtn.getAttribute('data-trash-id');
                    void (async () => {
                        setTrashStatus('Removing…');
                        try {
                            const result = await window.electronAPI.permanentlyDeleteTrashedProfile?.({ trashId });
                            if (!result?.ok) {
                                setTrashStatus(result?.error || 'Delete failed', 'err');
                                return;
                            }
                            setTrashStatus('Profile removed permanently.', 'ok');
                            await refreshProfilesTrash();
                        } catch (e) {
                            setTrashStatus(String(e?.message || e), 'err');
                        }
                    })();
                }
            });

            async function refreshProfilesPane() {
                if (!window.electronAPI?.getProfilesOverviewForWindow) return;
                try {
                    const overview = await window.electronAPI.getProfilesOverviewForWindow();
                    const profiles = overview?.profiles || [];
                    profilesCurrentId = overview?.currentProfileId || 'personal';
                    renderProfilesOverview(profiles, profilesCurrentId);
                    await loadProfileGlobalSettings(profiles);
                } catch (_) {
                    if (profilesOverviewBody) {
                        profilesOverviewBody.innerHTML = '<tr><td colspan="6">Could not load profiles.</td></tr>';
                    }
                }
                await refreshProfilesTrash();
                const importBusy =
                    document.activeElement === profilesImportBrowser ||
                    document.activeElement === profilesImportSource ||
                    !!(profilesImportBrowser?.value || profilesCustomImportPath);
                if (importBusy) {
                    await refreshImportBrowsers({ force: false });
                } else {
                    await refreshImportBrowsers({ force: true });
                }
            }

            profilesStartupMode?.addEventListener('change', () => {
                syncStartupProfileRowVisibility();
                void window.electronAPI
                    ?.setProfileGlobalSetting?.('profileStartupMode', profilesStartupMode.value)
                    .catch(() => {});
            });

            profilesStartupProfile?.addEventListener('change', () => {
                void window.electronAPI
                    ?.setProfileGlobalSetting?.('profileStartupProfileId', profilesStartupProfile.value)
                    .catch(() => {});
            });

            profilesNewWindowMode?.addEventListener('change', () => {
                void window.electronAPI
                    ?.setProfileGlobalSetting?.('profileNewWindowMode', profilesNewWindowMode.value)
                    .catch(() => {});
            });

            document.getElementById('profiles-export-btn')?.addEventListener('click', () => {
                void (async () => {
                    setBackupStatus('Exporting…');
                    const profileId = profilesExportSelect?.value || profilesCurrentId;
                    try {
                        const result = await window.electronAPI.exportAxisProfile?.(profileId);
                        if (result?.cancelled) {
                            setBackupStatus('');
                            return;
                        }
                        if (!result?.ok) {
                            setBackupStatus(result?.error || 'Export failed', 'err');
                            return;
                        }
                        setBackupStatus('Profile backup saved.', 'ok');
                    } catch (e) {
                        setBackupStatus(String(e?.message || e), 'err');
                    }
                })();
            });

            document.getElementById('profiles-import-backup-btn')?.addEventListener('click', () => {
                void (async () => {
                    setBackupStatus('Importing…');
                    try {
                        const result = await window.electronAPI.importAxisProfileBackup?.();
                        if (result?.cancelled) {
                            setBackupStatus('');
                            return;
                        }
                        if (!result?.ok) {
                            setBackupStatus(result?.error || 'Import failed', 'err');
                            return;
                        }
                        setBackupStatus(`Imported “${result.profileName}”.`, 'ok');
                        await refreshProfilesPane();
                    } catch (e) {
                        setBackupStatus(String(e?.message || e), 'err');
                    }
                })();
            });

            function formatImportPreview(p, warnList) {
                if (!p) return '';
                const parts = [
                    `${p.favorites || 0} favorites`,
                    `${p.pinnedTabs || 0} pinned tabs`,
                    `${p.tabGroups || 0} tab groups`,
                    `${p.openTabs || 0} unpinned tabs`,
                    `${p.passwords || 0} passwords`,
                    `${p.cards || 0} cards`,
                    `${p.addresses || 0} addresses`,
                    `${p.extensions || 0} extensions`,
                    `${p.sitePermissions || 0} site permission rules`,
                    `${p.history || 0} history items`
                ];
                const totalItems =
                    (p.favorites || 0) +
                    (p.pinnedTabs || 0) +
                    (p.tabGroups || 0) +
                    (p.openTabs || 0);
                let text =
                    totalItems === 0
                        ? 'No sidebar or tab items found with the current options.'
                        : `Found ${parts.join(', ')}.`;
                if (Array.isArray(warnList) && warnList.length > 0) {
                    text += ` ${warnList.slice(0, 2).join(' ')}`;
                }
                return text;
            }

            function buildImportPayload() {
                const payload = {
                    profileName: profilesImportName?.value?.trim() || 'Imported',
                    importFavorites: document.getElementById('profiles-import-favorites')?.checked !== false,
                    importBookmarks: document.getElementById('profiles-import-bookmarks')?.checked !== false,
                    importOpenTabs: document.getElementById('profiles-import-open-tabs')?.checked === true,
                    importFolders: document.getElementById('profiles-import-folders')?.checked !== false,
                    importHistory: document.getElementById('profiles-import-history')?.checked !== false,
                    importPasswords: document.getElementById('profiles-import-passwords')?.checked !== false,
                    importCards: document.getElementById('profiles-import-cards')?.checked !== false,
                    importAddresses: document.getElementById('profiles-import-addresses')?.checked !== false,
                    importSitePermissions:
                        document.getElementById('profiles-import-permissions')?.checked !== false,
                    importExtensions: document.getElementById('profiles-import-extensions')?.checked !== false
                };
                if (profilesCustomImportPath) {
                    payload.customProfilePath = profilesCustomImportPath;
                } else {
                    payload.browserId = profilesImportBrowser?.value || '';
                    payload.sourceProfileId = profilesImportSource?.value || '';
                }
                return payload;
            }

            async function refreshImportPreview() {
                if (!profilesImportPreview || !window.electronAPI?.previewBrowserImport) return;
                const payload = buildImportPayload();
                if (!payload.customProfilePath && (!payload.browserId || !payload.sourceProfileId)) {
                    profilesImportPreview.textContent = '';
                    return;
                }
                try {
                    const preview = await window.electronAPI.previewBrowserImport(payload);
                    if (preview?.ok) {
                        profilesImportPreview.textContent = formatImportPreview(
                            preview.preview,
                            preview.warnings
                        );
                    } else {
                        profilesImportPreview.textContent =
                            preview?.error || 'Could not scan this profile.';
                    }
                } catch (e) {
                    profilesImportPreview.textContent = String(e?.message || e || 'Could not scan this profile.');
                }
            }

            async function refreshImportBrowsers(options = {}) {
                if (!profilesImportBrowser) return;
                const force = options.force === true;
                const prevBrowser = String(profilesImportBrowser.value || '');
                const prevSource = profilesImportSource ? String(profilesImportSource.value || '') : '';
                const keepCustom = !!profilesCustomImportPath && !force;
                if (force) {
                    profilesCustomImportPath = '';
                    if (profilesImportPreview) profilesImportPreview.textContent = '';
                    setImportStatus('');
                }
                try {
                    const browsers = (await window.electronAPI.listImportableBrowsers?.()) || [];
                    profilesImportBrowser.innerHTML =
                        browsers.length > 0
                            ? '<option value="">Select a browser…</option>' +
                              browsers
                                  .map(
                                      (b) =>
                                          `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)} (${b.profileCount} profile${b.profileCount === 1 ? '' : 's'})</option>`
                                  )
                                  .join('')
                            : '<option value="">No supported browsers found on this computer</option>';

                    const stillValid = prevBrowser && browsers.some((b) => b.id === prevBrowser);
                    if (stillValid) {
                        profilesImportBrowser.value = prevBrowser;
                    } else if (keepCustom) {
                        profilesImportBrowser.value = '';
                    }

                    if (keepCustom && profilesCustomImportPath && profilesImportSource) {
                        profilesImportSource.innerHTML = `<option value="custom">${escapeHtml(pathBasename(profilesCustomImportPath))}</option>`;
                        profilesImportSource.disabled = false;
                        await refreshImportPreview();
                        return;
                    }

                    if (stillValid) {
                        await refreshImportSources({ preserveSourceId: prevSource });
                    } else if (profilesImportSource) {
                        profilesImportSource.innerHTML = '<option value="">Choose a browser first</option>';
                        profilesImportSource.disabled = true;
                    }
                } catch (_) {
                    if (!prevBrowser) {
                        profilesImportBrowser.innerHTML = '<option value="">Could not scan for browsers</option>';
                    }
                }
            }

            async function refreshImportSources(options = {}) {
                if (!profilesImportBrowser || !profilesImportSource) return;
                const preserveSourceId = options.preserveSourceId || '';
                if (!options.preserveCustom) {
                    profilesCustomImportPath = '';
                }
                if (profilesImportPreview && !preserveSourceId) profilesImportPreview.textContent = '';
                const browserId = profilesImportBrowser.value;
                if (!browserId) {
                    profilesImportSource.innerHTML = '<option value="">Choose a browser first</option>';
                    profilesImportSource.disabled = true;
                    return;
                }
                try {
                    const sources = (await window.electronAPI.listBrowserImportProfiles?.(browserId)) || [];
                    profilesImportSource.innerHTML =
                        sources.length > 0
                            ? sources
                                  .map(
                                      (s) =>
                                          `<option value="${escapeHtml(s.id)}">${escapeHtml(s.name)}</option>`
                                  )
                                  .join('')
                            : '<option value="">No profiles found</option>';
                    profilesImportSource.disabled = sources.length === 0;
                    if (preserveSourceId && sources.some((s) => s.id === preserveSourceId)) {
                        profilesImportSource.value = preserveSourceId;
                    } else if (sources[0] && profilesImportName && !profilesImportName.value.trim()) {
                        profilesImportName.value = sources[0].name;
                    }
                    await refreshImportPreview();
                } catch (_) {
                    profilesImportSource.innerHTML = '<option value="">Could not read profiles</option>';
                    profilesImportSource.disabled = true;
                }
            }

            profilesImportBrowser?.addEventListener('change', () => void refreshImportSources());

            profilesImportSource?.addEventListener('change', () => {
                const opt = profilesImportSource.selectedOptions?.[0];
                if (opt && profilesImportName) profilesImportName.value = opt.textContent || '';
                void refreshImportPreview();
            });

            document
                .querySelectorAll(
                    '#profiles-import-favorites, #profiles-import-bookmarks, #profiles-import-open-tabs, #profiles-import-folders, #profiles-import-history, #profiles-import-passwords, #profiles-import-cards, #profiles-import-addresses, #profiles-import-permissions, #profiles-import-extensions'
                )
                .forEach((el) => el?.addEventListener('change', () => void refreshImportPreview()));

            document.getElementById('profiles-import-folder')?.addEventListener('click', () => {
                void (async () => {
                    const picked = await window.electronAPI.pickBrowserProfileFolder?.();
                    if (!picked?.ok || !picked.path) return;
                    profilesCustomImportPath = picked.path;
                    if (profilesImportBrowser) profilesImportBrowser.value = '';
                    if (profilesImportSource) {
                        profilesImportSource.innerHTML = `<option value="custom">${escapeHtml(pathBasename(picked.path))}</option>`;
                        profilesImportSource.disabled = false;
                    }
                    if (profilesImportName && !profilesImportName.value.trim()) {
                        profilesImportName.value = pathBasename(picked.path);
                    }
                    await refreshImportPreview();
                })();
            });

            function pathBasename(p) {
                const parts = String(p || '').split(/[/\\]/).filter(Boolean);
                return parts[parts.length - 1] || 'Imported';
            }

            document.getElementById('profiles-import-run')?.addEventListener('click', () => {
                void (async () => {
                    setImportStatus('Importing…');
                    const payload = buildImportPayload();
                    try {
                        const result = await window.electronAPI.importBrowserProfile?.(payload);
                        if (!result?.ok) {
                            setImportStatus(result?.error || 'Import failed', 'err');
                            return;
                        }
                        const stats = result.stats || {};
                        const warnText =
                            Array.isArray(result.warnings) && result.warnings.length > 0
                                ? ` ${result.warnings[0]}`
                                : '';
                        setImportStatus(
                            `Created “${result.profileName}” with ${stats.tabGroups || 0} tab groups, ${stats.pinnedTabs || 0} pinned tabs, ${stats.unpinnedTabs || 0} open tabs, ${stats.favorites || 0} favorites, ${stats.passwords || 0} passwords, ${stats.cards || 0} cards, ${stats.addresses || 0} addresses, ${stats.extensions || 0} extensions, ${stats.sitePermissions || 0} site permission rules, and ${stats.history || 0} history items.${warnText}`,
                            'ok'
                        );
                        profilesCustomImportPath = '';
                        await reloadSettingsForEditingProfile(result.profileId);
                        if (settingsEditingProfileId === result.profileId) {
                            window.__axisRefreshAllSettingsData?.();
                        }
                        try {
                            await window.electronAPI?.switchProfileInWindow?.(result.profileId);
                        } catch (_) {}
                        await refreshProfilesPane();
                    } catch (e) {
                        setImportStatus(String(e?.message || e), 'err');
                    }
                })();
            });

            window.electronAPI?.onProfilesUpdated?.(() => {
                void refreshProfilesPane();
                try {
                    const ctx = window.electronAPI?.getSettingsProfileBootstrap?.();
                    if (ctx) {
                        settingsEditingProfileId = ctx.profileId || settingsEditingProfileId;
                        renderSettingsProfileList(ctx.profiles || [], settingsEditingProfileId);
                    }
                } catch (_) {}
            });

            async function reloadSettingsForEditingProfile(nextId) {
                if (!nextId || nextId === settingsEditingProfileId) return;
                const wrap = document.getElementById('settings-profile-switch');
                wrap?.classList.add('is-switching');
                try {
                    const res = await window.electronAPI?.setSettingsEditingProfile?.(nextId);
                    if (!res?.ok) return;
                    settingsEditingProfileId = res.profileId || nextId;
                    settings = (await window.electronAPI.getSettings()) || {};
                    shortcutOverrides = (await window.electronAPI.getShortcutOverrides()) || {};
                    if (typeof window.__axisApplyLoadedSettingsToForm === 'function') {
                        await window.__axisApplyLoadedSettingsToForm();
                    }
                    if (typeof hideVaultEditor === 'function') hideVaultEditor();
                    vaultEditorMode = null;
                    vaultToast?.('');
                    aiProviderRevealState?.clear?.();
                    refreshSettingsSection(activeSection || 'customization');
                    profilesCurrentId = settingsEditingProfileId;
                    const ctx = window.electronAPI?.getSettingsProfileBootstrap?.() || { profiles: [] };
                    renderSettingsProfileList(ctx.profiles || [], settingsEditingProfileId);
                    closeSettingsProfileMenu();
                    try {
                        const u = new URL(location.href);
                        u.searchParams.set('profile', settingsEditingProfileId);
                        history.replaceState(null, '', u.pathname + u.search + location.hash);
                    } catch (_) {}
                } finally {
                    wrap?.classList.remove('is-switching');
                }
            }

            const refreshSettingsSectionInternal = (section) => {
                if (section === 'history') void populateHistory();
                else if (section === 'extensions') void loadExtensions();
                else if (section === 'permissions') void loadSitePermissionOverrides();
                else if (section === 'vault') void refreshVaultPane();
                else if (section === 'profiles') void refreshProfilesPane();
                else if (section === 'shortcuts') {
                    void reloadShortcutState().then(() => renderShortcuts());
                }
            };
            window.__axisRefreshAllSettingsData = () => {
                void refreshStoreBackedSettingsFields();
                void populateHistory();
                void loadExtensions();
                void loadSitePermissionOverrides();
                void refreshVaultPane();
                void refreshProfilesPane();
                void reloadShortcutState().then(() => renderShortcuts());
            };

            const refreshSettingsSection = (section) => {
                // Always re-fetch list data when opening a section so History, Vault,
                // Extensions, etc. stay current without closing Settings.
                refreshSettingsSectionInternal(section);
            };

            switchSection = (section) => {
                baseSwitchSection(section);
                if (!suppressSectionRefresh) {
                    scheduleSettingsStoreRefresh(40);
                    refreshSettingsSection(section);
                }
            };
            window.__axisSwitchSettingsSection = switchSection;

            window.electronAPI?.onSettingsEditingProfileChanged?.((data) => {
                const id = data?.profileId;
                if (id && id !== settingsEditingProfileId) void reloadSettingsForEditingProfile(id);
            });

            refreshSettingsSection(activeSection || 'customization');
        })();
    
