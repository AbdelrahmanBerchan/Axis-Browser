        /** Match main browser shell: 0 = opaque, 100 = sharp see-through. Same curve as `getShellChromeStyle`. */
        function axisApplyNativeWindowChromeTransparency(n, isLightTint) {
            const root = document.documentElement;
            if (!root.classList.contains('settings-native-window')) return;
            const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
            const opaque = v <= 0;
            root.classList.toggle('settings-opaque-shell', opaque);
            const nativeVarKeys = [
                '--settings-native-sidebar-bg',
                '--settings-native-sidebar-blur',
                '--settings-native-sidebar-sat',
                '--settings-native-card-bg',
                '--settings-native-card-blur',
                '--settings-native-card-sat',
                '--settings-native-card-shadow',
                '--settings-native-search-bg',
                '--settings-native-search-blur',
            ];
            if (opaque) {
                nativeVarKeys.forEach((k) => root.style.removeProperty(k));
                return;
            }
            const t = v / 100;
            const lerp = (a, b) => a + (b - a) * t;
            const lerpPx = (a, b) => `${Math.round(a + (b - a) * t)}px`;
            const alpha = (x) => lerp(x[0], x[1]).toFixed(3);
            if (isLightTint) {
                root.style.setProperty('--settings-native-sidebar-bg', `rgba(42, 40, 38, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-card-bg', `rgba(48, 46, 44, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-search-bg', `rgba(54, 52, 50, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-sidebar-blur', lerpPx(26, 0));
                root.style.setProperty('--settings-native-card-blur', lerpPx(22, 0));
                root.style.setProperty('--settings-native-search-blur', lerpPx(12, 0));
                root.style.setProperty('--settings-native-sidebar-sat', `${Math.round(lerp(118, 100))}%`);
                root.style.setProperty('--settings-native-card-sat', `${Math.round(lerp(118, 100))}%`);
            } else {
                root.style.setProperty('--settings-native-sidebar-bg', `rgba(28, 28, 30, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-card-bg', `rgba(36, 36, 38, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-search-bg', `rgba(255, 255, 255, ${alpha([0.12, 0.08])})`);
                root.style.setProperty('--settings-native-sidebar-blur', lerpPx(24, 0));
                root.style.setProperty('--settings-native-card-blur', lerpPx(20, 0));
                root.style.setProperty('--settings-native-search-blur', lerpPx(10, 0));
                root.style.setProperty('--settings-native-sidebar-sat', `${Math.round(lerp(120, 100))}%`);
                root.style.setProperty('--settings-native-card-sat', `${Math.round(lerp(120, 100))}%`);
            }
            const shadowA = lerp(0.18, 0.02).toFixed(3);
            root.style.setProperty('--settings-native-card-shadow', `0 4px 20px rgba(0, 0, 0, ${shadowA})`);
        }

        // Settings always renders in dark chrome. `uiTheme` in General only affects the main browser.
        (function applyInitialAxisTheme() {
            try {
                if (new URLSearchParams(location.search).get('embedded') === '1') {
                    document.documentElement.classList.add('settings-embedded');
                } else {
                    document.documentElement.classList.add('settings-native-window');
                }
            } catch (_) {}
            const setFromValue = () => {
                const isDark = true;
                document.documentElement.classList.add('axis-dark');
                let uiTheme = 'dark';
                try {
                    const boot = window.electronAPI?.getSettingsWindowBootstrap?.();
                    if (boot?.effectiveUiTheme === 'light') uiTheme = 'light';
                    else if (boot?.effectiveUiTheme === 'dark') uiTheme = 'dark';
                    else if (boot?.uiTheme === 'light') uiTheme = 'light';
                } catch (_) {}
                document.documentElement.classList.toggle('settings-light-tint', uiTheme === 'light');
                try {
                    const wclRaw = Number(boot?.windowChromeLight);
                    const wcl = Number.isFinite(wclRaw) ? wclRaw : 50;
                    axisApplyNativeWindowChromeTransparency(wcl, uiTheme === 'light');
                } catch (_) {}
                try {
                    if (window.electronAPI && window.electronAPI.platform === 'darwin') {
                        document.documentElement.classList.add('macos');
                    }
                } catch (_) {}
                try {
                    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
                    const meta = document.getElementById('axis-settings-color-scheme');
                    if (meta) {
                        meta.setAttribute('content', isDark ? 'dark' : 'light');
                    }
                } catch (_) {}
            };

            setFromValue();
        })();
    
