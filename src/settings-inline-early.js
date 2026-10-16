        /** Match main browser shell: 0 = least see-through, 100 = most. Same curve as `getShellChromeStyle`. */
        function axisApplyNativeWindowChromeTransparency(n, isLightTint) {
            const root = document.documentElement;
            if (!root.classList.contains('settings-native-window')) return;
            const v = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 50;
            root.classList.remove('settings-opaque-shell');
            const t = v / 100;
            const atMin = v <= 0;
            const lerp = (a, b) => a + (b - a) * t;
            const lerpPx = (a, b) => `${Math.round(a + (b - a) * t)}px`;
            const alpha = (x) => lerp(x[0], x[1]).toFixed(3);
            const blurPx = (lo, hi) => (atMin ? '0px' : lerpPx(lo, hi));
            if (isLightTint) {
                root.style.setProperty('--settings-native-sidebar-bg', `rgba(50, 48, 46, ${alpha([0.88, 0.16])})`);
                root.style.setProperty('--settings-native-card-bg', `rgba(56, 54, 52, ${alpha([0.88, 0.16])})`);
                root.style.setProperty('--settings-native-search-bg', `rgba(62, 60, 58, ${alpha([0.88, 0.16])})`);
                root.style.setProperty('--settings-native-sidebar-blur', blurPx(26, 0));
                root.style.setProperty('--settings-native-card-blur', blurPx(22, 0));
                root.style.setProperty('--settings-native-search-blur', blurPx(12, 0));
                root.style.setProperty('--settings-native-sidebar-sat', `${Math.round(lerp(118, 100))}%`);
                root.style.setProperty('--settings-native-card-sat', `${Math.round(lerp(118, 100))}%`);
            } else {
                root.style.setProperty('--settings-native-sidebar-bg', `rgba(28, 28, 30, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-card-bg', `rgba(36, 36, 38, ${alpha([0.88, 0.14])})`);
                root.style.setProperty('--settings-native-search-bg', `rgba(255, 255, 255, ${alpha([0.12, 0.08])})`);
                root.style.setProperty('--settings-native-sidebar-blur', blurPx(24, 0));
                root.style.setProperty('--settings-native-card-blur', blurPx(20, 0));
                root.style.setProperty('--settings-native-search-blur', blurPx(10, 0));
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
                let boot = null;
                try {
                    boot = window.electronAPI?.getSettingsWindowBootstrap?.();
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
                    const shellPlatform = window.electronAPI?.platform;
                    if (shellPlatform === 'darwin') {
                        document.documentElement.classList.add('macos');
                    } else if (shellPlatform === 'win32') {
                        document.documentElement.classList.add('win32', 'platform-win32');
                        document.documentElement.style.setProperty('--axis-win-titlebar-height', '48px');
                        document.documentElement.style.setProperty('--axis-win-caption-inset', '152px');
                    } else if (shellPlatform === 'linux') {
                        document.documentElement.classList.add('linux', 'platform-linux');
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
    
