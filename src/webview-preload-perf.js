'use strict';

/** Low-cost navigation warmup — dns-prefetch / preconnect on link hover only. */
(function axisWebviewPerfHints() {
    try {
        const warmed = new Set();

        function warmHost(href) {
            if (!href) return;
            let u;
            try {
                u = new URL(href);
            } catch (_) {
                return;
            }
            if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
            const host = u.hostname;
            if (!host || warmed.has(host)) return;
            warmed.add(host);
            if (warmed.size > 48) {
                const first = warmed.values().next().value;
                if (first) warmed.delete(first);
            }
            const head = document.head || document.documentElement;
            if (!head) return;
            const dns = document.createElement('link');
            dns.rel = 'dns-prefetch';
            dns.href = `//${host}`;
            head.appendChild(dns);
            const pre = document.createElement('link');
            pre.rel = 'preconnect';
            pre.href = `${u.protocol}//${host}`;
            pre.crossOrigin = 'anonymous';
            head.appendChild(pre);
        }

        document.addEventListener(
            'mouseover',
            (e) => {
                try {
                    const a = e.target?.closest?.('a[href]');
                    if (!a) return;
                    warmHost(a.href);
                } catch (_) {
                    /* ignore */
                }
            },
            true
        );
    } catch (_) {
        /* preload context missing */
    }
})();
