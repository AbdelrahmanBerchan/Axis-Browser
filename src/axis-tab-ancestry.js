'use strict';

/**
 * Tab ancestry helpers — pure functions for building navigation trails.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.AxisTabAncestry = api;
    if (typeof globalThis !== 'undefined') globalThis.AxisTabAncestry = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const MAX_STEPS = 200;

    const SEARCH_PATTERNS = [
        { engine: 'google', re: /^https?:\/\/(?:www\.)?google\.[a-z.]+\/search/i, q: ['q'] },
        { engine: 'bing', re: /^https?:\/\/(?:www\.)?bing\.com\/search/i, q: ['q'] },
        { engine: 'duckduckgo', re: /^https?:\/\/(?:html\.)?duckduckgo\.com\/html\//i, q: ['q'] },
        { engine: 'youtube', re: /^https?:\/\/(?:www\.)?youtube\.com\/results/i, q: ['search_query'] },
        { engine: 'yahoo', re: /^https?:\/\/search\.yahoo\.com\/search/i, q: ['p'] },
        { engine: 'yandex', re: /^https?:\/\/yandex\.com\/search/i, q: ['text'] },
        { engine: 'wikipedia', re: /^https?:\/\/en\.wikipedia\.org\/wiki\/Special:Search/i, q: ['search'] },
        { engine: 'reddit', re: /^https?:\/\/(?:www\.)?reddit\.com\/search/i, q: ['q'] },
        { engine: 'github', re: /^https?:\/\/github\.com\/search/i, q: ['q'] },
        { engine: 'amazon', re: /^https?:\/\/(?:www\.)?amazon\.[a-z.]+\/s/i, q: ['k'] },
        { engine: 'twitter', re: /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/search/i, q: ['q'] },
        { engine: 'facebook', re: /^https?:\/\/(?:www\.)?facebook\.com\/search/i, q: ['q'] }
    ];

    function cloneSteps(steps) {
        if (!Array.isArray(steps)) return [];
        return steps.slice(-MAX_STEPS).map((s) => ({ ...s }));
    }

    function normalizeUrlKey(url) {
        if (!url || typeof url !== 'string') return '';
        try {
            const u = new URL(url);
            const path = u.pathname.replace(/\/$/, '') || '/';
            return `${u.origin}${path}${u.search}`;
        } catch (_) {
            return String(url).trim();
        }
    }

    function extractSearchQuery(url) {
        if (!url || typeof url !== 'string') return null;
        let parsed;
        try {
            parsed = new URL(url);
        } catch (_) {
            return null;
        }
        for (const pat of SEARCH_PATTERNS) {
            if (!pat.re.test(url)) continue;
            for (const key of pat.q) {
                const val = parsed.searchParams.get(key);
                if (val && String(val).trim()) {
                    return { query: String(val).trim(), engine: pat.engine };
                }
            }
        }
        return null;
    }

    function stepFromTab(tab, overrides = {}) {
        if (!tab) return null;
        const url = overrides.url || tab.url || '';
        const title = overrides.title || tab.customTitle || tab.title || '';
        const favicon = overrides.favicon || tab.favicon || '';
        const search = extractSearchQuery(url);
        if (search) {
            return {
                type: 'search',
                title: overrides.title || '',
                url,
                favicon: favicon || '',
                searchQuery: search.query,
                engine: search.engine,
                at: Date.now()
            };
        }
        return {
            type: 'page',
            title,
            url,
            favicon,
            at: Date.now()
        };
    }

    function makeStep(type, fields) {
        return {
            type,
            title: fields.title || '',
            url: fields.url || '',
            favicon: fields.favicon || '',
            searchQuery: fields.searchQuery || '',
            engine: fields.engine || '',
            at: fields.at || Date.now()
        };
    }

    function capSteps(steps) {
        if (!Array.isArray(steps)) return [];
        return steps.length > MAX_STEPS ? steps.slice(-MAX_STEPS) : steps;
    }

    function buildForNewTab(opts = {}) {
        const t = typeof opts.t === 'function' ? opts.t : (k) => k;
        const getFavicon = typeof opts.getFaviconUrl === 'function' ? opts.getFaviconUrl : () => '';
        const kind = opts.kind || 'new';
        const fromTab = opts.fromTab || null;
        const url = opts.url || '';
        const linkUrl = opts.linkUrl || url;
        const searchQuery = opts.searchQuery || '';
        let steps = [];

        if (fromTab && Array.isArray(fromTab.ancestry) && fromTab.ancestry.length) {
            steps = cloneSteps(fromTab.ancestry);
        }

        if (kind === 'link' && fromTab) {
            const parentStep = stepFromTab(fromTab);
            if (parentStep) {
                const last = steps[steps.length - 1];
                const parentKey = normalizeUrlKey(parentStep.url);
                const lastKey = last ? normalizeUrlKey(last.url) : '';
                if (!last || parentKey !== lastKey) {
                    steps.push(parentStep);
                }
            }
            const host = (() => {
                try {
                    return new URL(linkUrl).hostname.replace(/^www\./, '');
                } catch (_) {
                    return '';
                }
            })();
            steps.push(
                makeStep('link', {
                    title: t('ancestry.openedLink'),
                    url: linkUrl,
                    favicon: getFavicon(linkUrl)
                })
            );
            if (host && linkUrl && normalizeUrlKey(linkUrl) !== normalizeUrlKey(url)) {
                steps.push(
                    makeStep('page', {
                        title: host,
                        url: linkUrl,
                        favicon: getFavicon(linkUrl)
                    })
                );
            }
            return capSteps(steps);
        }

        if (kind === 'search' || (searchQuery && kind !== 'duplicate')) {
            const q = searchQuery || (extractSearchQuery(url)?.query || '');
            if (q) {
                steps.push(
                    makeStep('search', {
                        title: t('ancestry.searchStep', { query: q }),
                        url,
                        favicon: '',
                        searchQuery: q
                    })
                );
                return capSteps(steps);
            }
        }

        if (kind === 'external') {
            steps.push(
                makeStep('external', {
                    title: t('ancestry.external'),
                    url,
                    favicon: url ? getFavicon(url) : ''
                })
            );
            return capSteps(steps);
        }

        if (kind === 'duplicate' && fromTab) {
            if (fromTab.ancestry && fromTab.ancestry.length) {
                steps = cloneSteps(fromTab.ancestry);
            } else {
                const snap = stepFromTab(fromTab);
                if (snap) steps.push(snap);
            }
            steps.push(makeStep('duplicate', { title: t('ancestry.duplicate'), url }));
            return capSteps(steps);
        }

        if (kind === 'favorite') {
            steps.push(
                makeStep('favorite', {
                    title: t('ancestry.favorite'),
                    url,
                    favicon: url ? getFavicon(url) : ''
                })
            );
            return capSteps(steps);
        }

        if (kind === 'history') {
            steps.push(
                makeStep('history', {
                    title: t('ancestry.history'),
                    url,
                    favicon: url ? getFavicon(url) : ''
                })
            );
            return capSteps(steps);
        }

        if (kind === 'selection-search') {
            const q = searchQuery || '';
            if (q) {
                steps.push(
                    makeStep('search', {
                        title: t('ancestry.searchStep', { query: q }),
                        url,
                        favicon: '',
                        searchQuery: q
                    })
                );
            }
            return capSteps(steps);
        }

        if (kind === 'new' && !url) {
            return [];
        }

        return capSteps(steps);
    }

    function appendNavigation(steps, payload = {}) {
        const list = cloneSteps(steps);
        const url = payload.url || '';
        if (!url || url === 'about:blank' || /^axis:\/\//i.test(url) || /^axis:note:\/\//i.test(url)) {
            return list;
        }

        const search = extractSearchQuery(url);
        const title = payload.title || '';
        const favicon = payload.favicon || '';
        const key = normalizeUrlKey(url);
        const last = list[list.length - 1];
        const lastKey = last ? normalizeUrlKey(last.url) : '';

        if (last && lastKey === key) {
            if (title && !last.title) last.title = title;
            if (favicon && !last.favicon) last.favicon = favicon;
            if (search) {
                last.type = 'search';
                last.searchQuery = search.query;
                last.engine = search.engine;
            }
            return list;
        }

        if (search) {
            const label =
                typeof payload.t === 'function'
                    ? payload.t('ancestry.searchStep', { query: search.query })
                    : `Search: "${search.query}"`;
            list.push(
                makeStep('search', {
                    title: label,
                    url,
                    favicon,
                    searchQuery: search.query,
                    engine: search.engine
                })
            );
        } else {
            list.push(
                makeStep('page', {
                    title,
                    url,
                    favicon
                })
            );
        }
        return capSteps(list);
    }

    function updateLastStep(steps, patch = {}) {
        const list = cloneSteps(steps);
        const last = list[list.length - 1];
        if (!last) return list;
        if (patch.title) last.title = patch.title;
        if (patch.favicon) last.favicon = patch.favicon;
        if (patch.url) last.url = patch.url;
        return list;
    }

    function hasAncestry(steps) {
        return Array.isArray(steps) && steps.length > 0;
    }

    function stepIconClass(step) {
        if (!step) return 'fa-globe';
        if (step.type === 'search') return 'fa-magnifying-glass';
        if (step.type === 'link') return 'fa-arrow-up-right-from-square';
        if (step.type === 'external') return 'fa-arrow-right-to-bracket';
        if (step.type === 'duplicate') return 'fa-clone';
        if (step.type === 'favorite') return 'fa-star';
        if (step.type === 'history') return 'fa-clock-rotate-left';
        return 'fa-globe';
    }

    function stepHost(url) {
        try {
            return new URL(url).hostname.replace(/^www\./, '');
        } catch (_) {
            return '';
        }
    }

    return {
        MAX_STEPS,
        cloneSteps,
        normalizeUrlKey,
        extractSearchQuery,
        buildForNewTab,
        appendNavigation,
        updateLastStep,
        hasAncestry,
        stepIconClass,
        stepHost
    };
});
