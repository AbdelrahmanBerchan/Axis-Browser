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
                const activeId =
                    ctx?.profileId ||
                    new URLSearchParams(location.search).get('profile') ||
                    'personal';
                const wrap = document.getElementById('settings-profile-switch');
                if (!wrap) return;
                if (profiles.length < 2) {
                    wrap.classList.add('is-hidden');
                    return;
                }
                wrap.classList.remove('is-hidden');
                const active = profiles.find((p) => p.id === activeId) || profiles[0];
                const nameEl = document.getElementById('settings-profile-trigger-name');
                const avatarEl = document.getElementById('settings-profile-trigger-avatar');
                const list = document.getElementById('settings-profile-list');
                if (nameEl) nameEl.textContent = active?.name || active?.id || 'Profile';
                if (avatarEl) avatarEl.innerHTML = avatarMarkup(active?.icon);
                if (!list) return;
                list.innerHTML = profiles
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
            }
            try {
                const ctx = window.electronAPI?.getSettingsProfileBootstrap?.();
                if (ctx) paint(ctx);
            } catch (_) {}
            window.__axisPaintSettingsProfileSwitcher = paint;
        })();
    
