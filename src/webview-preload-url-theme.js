'use strict';

/** Push theme-color / surface hints to the host as soon as the document exposes them. */
(function axisUrlBarThemeHint() {
    try {
        const { ipcRenderer } = require('electron');

        let lastSent = '';

        function parseColor(str) {
            if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
            if (str.startsWith('#')) {
                let hex = str;
                if (hex.length === 4) {
                    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
                }
                if (hex.length === 7) {
                    return {
                        r: parseInt(hex.slice(1, 3), 16),
                        g: parseInt(hex.slice(3, 5), 16),
                        b: parseInt(hex.slice(5, 7), 16)
                    };
                }
            }
            const match = str.match(/[\d.]+/g);
            if (match && match.length >= 3) {
                const r = Math.round(parseFloat(match[0]));
                const g = Math.round(parseFloat(match[1]));
                const b = Math.round(parseFloat(match[2]));
                const a = match.length >= 4 ? parseFloat(match[3]) : 1;
                if (a < 0.1) return null;
                return { r, g, b };
            }
            return null;
        }

        function send(rgb, source) {
            if (!rgb) return;
            const key =
                Math.round(rgb.r / 4) +
                ',' +
                Math.round(rgb.g / 4) +
                ',' +
                Math.round(rgb.b / 4) +
                ':' +
                source;
            if (key === lastSent) return;
            lastSent = key;
            ipcRenderer.sendToHost('axis-url-bar-theme-hint', {
                r: rgb.r,
                g: rgb.g,
                b: rgb.b,
                source
            });
        }

        function pickThemeColorMeta() {
            try {
                const metas = document.querySelectorAll('meta[name="theme-color"]');
                if (!metas.length) return null;
                let preferred = null;
                let fallback = null;
                for (const m of metas) {
                    const media = (m.getAttribute('media') || '').trim();
                    if (!media) {
                        if (!fallback) fallback = m;
                        continue;
                    }
                    try {
                        if (window.matchMedia(media).matches) {
                            preferred = m;
                            break;
                        }
                    } catch (_) {
                        /* ignore bad media */
                    }
                }
                return preferred || fallback;
            } catch (_) {
                return null;
            }
        }

        function scanInlineHtml() {
            try {
                const html = document.documentElement?.innerHTML || '';
                if (!html) return false;
                // Prefer media-matched tags when present in the markup burst.
                const mediaRe =
                    /<meta[^>]+name=["']theme-color["'][^>]*media=["']([^"']*)["'][^>]*content=["']([^"']+)["']/gi;
                const mediaRe2 =
                    /<meta[^>]+content=["']([^"']+)["'][^>]*name=["']theme-color["'][^>]*media=["']([^"']*)["']/gi;
                let m;
                while ((m = mediaRe.exec(html))) {
                    try {
                        if (window.matchMedia(m[1]).matches) {
                            const c = parseColor(m[2]);
                            if (c) {
                                send(c, 'meta-inline');
                                return true;
                            }
                        }
                    } catch (_) {
                        /* ignore */
                    }
                }
                while ((m = mediaRe2.exec(html))) {
                    try {
                        if (window.matchMedia(m[2]).matches) {
                            const c = parseColor(m[1]);
                            if (c) {
                                send(c, 'meta-inline');
                                return true;
                            }
                        }
                    } catch (_) {
                        /* ignore */
                    }
                }
                const plain =
                    html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i) ||
                    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']theme-color["']/i);
                if (plain) {
                    const metaColor = parseColor(plain[1]);
                    if (metaColor) {
                        send(metaColor, 'meta-inline');
                        return true;
                    }
                }
            } catch (_) {
                /* ignore */
            }
            return false;
        }

        function scan() {
            try {
                const themeMeta = pickThemeColorMeta();
                if (themeMeta && themeMeta.content) {
                    const metaColor = parseColor(themeMeta.content);
                    if (metaColor) {
                        send(metaColor, 'meta');
                        return;
                    }
                }
                if (scanInlineHtml()) return;
            } catch (_) {
                /* ignore */
            }
        }

        function scanSurface() {
            try {
                if (document.body) {
                    const bodyBg = parseColor(getComputedStyle(document.body).backgroundColor);
                    if (bodyBg && bodyBg.r + bodyBg.g + bodyBg.b > 28) {
                        send(bodyBg, 'surface');
                        return;
                    }
                }
                const htmlBg = parseColor(getComputedStyle(document.documentElement).backgroundColor);
                if (htmlBg && htmlBg.r + htmlBg.g + htmlBg.b > 28) {
                    send(htmlBg, 'surface');
                }
            } catch (_) {
                /* ignore */
            }
        }

        scan();
        let burstFrames = 0;
        function burstScan() {
            scan();
            if (++burstFrames < 5) requestAnimationFrame(burstScan);
        }
        requestAnimationFrame(burstScan);

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', scan, { once: true });
        }
        window.addEventListener('load', () => {
            scan();
            scanSurface();
        }, { once: true });
        try {
            const obs = new MutationObserver(() => scan());
            const head = document.head;
            if (head) {
                obs.observe(head, {
                    childList: true,
                    subtree: true,
                    attributes: true,
                    attributeFilter: ['content', 'name', 'media']
                });
            }
        } catch (_) {
            /* ignore */
        }
    } catch (_) {
        /* preload context missing */
    }
})();
