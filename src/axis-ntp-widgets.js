/**
 * New Tab widgets — compact tiles on a 4-column grid.
 */
(function (global) {
    const COLS = 4;
    const ROW_H = 80;
    const GAP = 12;

    const LEGACY_TYPES = {
        news: 'headlines',
        deals: '',
        notes: 'note',
        quote: 'quote',
        countdown: 'until',
        clock: 'today',
        date: 'today',
        pins: 'pinned',
        spotlight: '',
        tabs: 'stats',
        continue: '',
        shortcuts: 'links',
        downloads: ''
    };

    const WORLD_CLOCK_PRESETS = [
        { label: 'New York', timezone: 'America/New_York' },
        { label: 'Los Angeles', timezone: 'America/Los_Angeles' },
        { label: 'Chicago', timezone: 'America/Chicago' },
        { label: 'Toronto', timezone: 'America/Toronto' },
        { label: 'São Paulo', timezone: 'America/Sao_Paulo' },
        { label: 'London', timezone: 'Europe/London' },
        { label: 'Paris', timezone: 'Europe/Paris' },
        { label: 'Berlin', timezone: 'Europe/Berlin' },
        { label: 'Madrid', timezone: 'Europe/Madrid' },
        { label: 'Moscow', timezone: 'Europe/Moscow' },
        { label: 'Dubai', timezone: 'Asia/Dubai' },
        { label: 'Mumbai', timezone: 'Asia/Kolkata' },
        { label: 'Singapore', timezone: 'Asia/Singapore' },
        { label: 'Hong Kong', timezone: 'Asia/Hong_Kong' },
        { label: 'Tokyo', timezone: 'Asia/Tokyo' },
        { label: 'Seoul', timezone: 'Asia/Seoul' },
        { label: 'Sydney', timezone: 'Australia/Sydney' },
        { label: 'Auckland', timezone: 'Pacific/Auckland' }
    ];

    const HEADLINE_FEED_PRESETS = [
        { label: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
        { label: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml' },
        { label: 'The Verge', url: 'https://www.theverge.com/rss/index.xml' },
        { label: 'Hacker News', url: 'https://hnrss.org/frontpage' },
        { label: 'Reuters World', url: 'https://www.reutersagency.com/feed/?taxonomy=best-topics&post_type=best' },
        { label: 'Wired', url: 'https://www.wired.com/feed/rss' },
        { label: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' }
    ];

    const FOCUS_PRESETS = [5, 15, 25, 45, 60];
    const FOCUS_MIN_MINUTES = 1;
    const FOCUS_MAX_MINUTES = 180;

    const TYPES = {
        today: {
            id: 'today',
            label: 'Clock',
            desc: 'Local time and date',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 2,
            icon: 'fa-clock'
        },
        weather: {
            id: 'weather',
            label: 'Weather',
            desc: 'Conditions for any city',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 2,
            icon: 'fa-cloud-sun'
        },
        worldclock: {
            id: 'worldclock',
            label: 'World clock',
            desc: 'Any city or timezone',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 2,
            icon: 'fa-earth-americas'
        },
        focus: {
            id: 'focus',
            label: 'Focus',
            desc: 'Timer with presets or custom length',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-hourglass-half'
        },
        until: {
            id: 'until',
            label: 'Countdown',
            desc: 'Days until something',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 2,
            icon: 'fa-flag-checkered'
        },
        tasks: {
            id: 'tasks',
            label: 'Tasks',
            desc: 'Checklist on your new tab',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-list-check'
        },
        note: {
            id: 'note',
            label: 'Note',
            desc: 'Scratch pad',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-pen-line'
        },
        favorites: {
            id: 'favorites',
            label: 'Favorites',
            desc: 'Your saved sites',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-star'
        },
        links: {
            id: 'links',
            label: 'Quick links',
            desc: 'Your own shortcuts',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-link'
        },
        pinned: {
            id: 'pinned',
            label: 'Pinned tabs',
            desc: 'Jump to your pinned tabs',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-thumbtack'
        },
        recent: {
            id: 'recent',
            label: 'Recent',
            desc: 'Sites you visited lately',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-clock-rotate-left'
        },
        topsites: {
            id: 'topsites',
            label: 'Top sites',
            desc: 'Places you open most',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-fire'
        },
        reopen: {
            id: 'reopen',
            label: 'Closed tabs',
            desc: 'Bring back what you closed',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-rotate-left'
        },
        headlines: {
            id: 'headlines',
            label: 'Headlines',
            desc: 'News from an RSS feed',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4,
            icon: 'fa-rss'
        },
        quote: {
            id: 'quote',
            label: 'Quote',
            desc: 'A short line for the day',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 2,
            icon: 'fa-quote-left'
        },
        stats: {
            id: 'stats',
            label: 'Session',
            desc: 'Tabs and browsing at a glance',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 2,
            icon: 'fa-chart-simple'
        }
    };

    const DAILY_QUOTES = [
        { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
        { text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' },
        { text: 'Well begun is half done.', author: 'Aristotle' },
        { text: 'Stay hungry. Stay foolish.', author: 'Stewart Brand' },
        { text: 'Done is better than perfect.', author: 'Sheryl Sandberg' },
        { text: 'Make it work, make it right, make it fast.', author: 'Kent Beck' },
        { text: 'Attention is the rarest and purest form of generosity.', author: 'Simone Weil' },
        { text: 'What we know is a drop. What we don’t is an ocean.', author: 'Isaac Newton' },
        { text: 'Be yourself; everyone else is already taken.', author: 'Oscar Wilde' },
        { text: 'The future depends on what you do today.', author: 'Mahatma Gandhi' },
        { text: 'Creativity is intelligence having fun.', author: 'Albert Einstein' },
        { text: 'Less, but better.', author: 'Dieter Rams' },
        { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
        { text: 'You miss 100% of the shots you don’t take.', author: 'Wayne Gretzky' },
        { text: 'First, solve the problem. Then, write the code.', author: 'John Johnson' },
        { text: 'Ship something.', author: 'Jason Fried' },
        { text: 'Curiosity is the engine of achievement.', author: 'Ken Robinson' },
        { text: 'Silence is a source of great strength.', author: 'Lao Tzu' },
        { text: 'Small deeds done are better than great deeds planned.', author: 'Peter Marshall' },
        { text: 'The details are not the details. They make the design.', author: 'Charles Eames' },
        { text: 'Move fast, but don’t break things that matter.', author: 'Axis' },
        { text: 'Clarity is kindness.', author: 'Brené Brown' },
        { text: 'Read more. Scroll less.', author: 'Axis' },
        { text: 'Protect your attention like it is money.', author: 'Axis' }
    ];

    function uid() {
        return 'w-' + Math.random().toString(36).slice(2, 10);
    }

    function resolveType(type) {
        const raw = String(type || '').trim();
        const mapped = LEGACY_TYPES[raw];
        if (mapped === '') return '';
        if (mapped) return mapped;
        return TYPES[raw] ? raw : '';
    }

    function typeDef(type) {
        return TYPES[resolveType(type)];
    }

    function contentDensity(widget) {
        const cols = Math.max(1, widget.colSpan || 1);
        const rows = Math.max(1, widget.rowSpan || 1);
        const area = cols * rows;
        if (area <= 1) return 'xs';
        if (rows === 1 && cols <= 2) return 'sm';
        if (area <= 4) return 'md';
        return 'lg';
    }

    function widgetShape(widget) {
        const cols = Math.max(1, widget.colSpan || 1);
        const rows = Math.max(1, widget.rowSpan || 1);
        return {
            cols,
            rows,
            area: cols * rows,
            wide: cols >= 3,
            tall: rows >= 2,
            density: contentDensity(widget)
        };
    }

    /** How many list rows fit given tile height (accounts for kicker / add form). */
    function listCapacity(widget, { rowPx = 30, chromePx = 28, footerPx = 0 } = {}) {
        const rows = Math.max(1, widget.rowSpan || 1);
        const available = rows * ROW_H - chromePx - footerPx;
        return Math.max(1, Math.min(12, Math.floor(available / rowPx)));
    }

    function itemLimit(widget, xs, sm, md, lg) {
        const d = contentDensity(widget);
        const map = { xs, sm, md, lg };
        const soft = map[d] ?? md;
        const cap = listCapacity(widget, {
            chromePx: 26,
            footerPx: d === 'xs' ? 0 : 34
        });
        return Math.min(soft, cap);
    }

    function clampSpan(widget, colSpan, rowSpan) {
        const def = typeDef(widget.type) || { minColSpan: 1, minRowSpan: 1, maxColSpan: COLS, maxRowSpan: 6 };
        colSpan = Math.min(COLS, Math.max(def.minColSpan, colSpan));
        rowSpan = Math.max(def.minRowSpan, rowSpan);
        colSpan = Math.min(def.maxColSpan || COLS, colSpan);
        rowSpan = Math.min(def.maxRowSpan || 6, rowSpan);
        if (widget.col && widget.col + colSpan - 1 > COLS) {
            colSpan = COLS - widget.col + 1;
        }
        return { colSpan, rowSpan };
    }

    function defaultLayout() {
        return [];
    }

    function cellsFor(widget) {
        const cells = [];
        for (let r = 0; r < widget.rowSpan; r++) {
            for (let c = 0; c < widget.colSpan; c++) {
                cells.push(`${widget.col + c},${widget.row + r}`);
            }
        }
        return cells;
    }

    function overlaps(a, b) {
        if (a.id === b.id) return false;
        const setA = new Set(cellsFor(a));
        for (const cell of cellsFor(b)) {
            if (setA.has(cell)) return true;
        }
        return false;
    }

    function canPlace(layout, widget, col, row, ignoreId) {
        const trial = { ...widget, col, row };
        for (const other of layout) {
            if (other.id === ignoreId || other.id === widget.id) continue;
            if (overlaps(trial, other)) return false;
        }
        if (trial.col < 1 || trial.col + trial.colSpan - 1 > COLS) return false;
        return trial.row >= 1;
    }

    function hasOverlaps(layout) {
        for (let i = 0; i < layout.length; i++) {
            for (let j = i + 1; j < layout.length; j++) {
                if (overlaps(layout[i], layout[j])) return true;
            }
        }
        return false;
    }

    function findPlacement(layout, widget, targetCol, targetRow, ignoreId, maxRows) {
        const w = { ...widget };
        const rowLimit = Math.max(1, Number(maxRows) || 24);
        targetCol = Math.max(1, Math.min(COLS - w.colSpan + 1, targetCol));
        targetRow = Math.max(1, Math.min(Math.max(1, rowLimit - w.rowSpan + 1), targetRow));
        if (canPlace(layout, w, targetCol, targetRow, ignoreId)) {
            return { col: targetCol, row: targetRow };
        }
        for (let radius = 1; radius <= 16; radius++) {
            for (let dr = -radius; dr <= radius; dr++) {
                for (let dc = -radius; dc <= radius; dc++) {
                    if (Math.abs(dc) !== radius && Math.abs(dr) !== radius) continue;
                    const col = targetCol + dc;
                    const row = targetRow + dr;
                    if (col < 1 || col > COLS - w.colSpan + 1 || row < 1) continue;
                    if (row + w.rowSpan - 1 > rowLimit) continue;
                    if (canPlace(layout, w, col, row, ignoreId)) {
                        return { col, row };
                    }
                }
            }
        }
        const startMax = Math.max(1, rowLimit - w.rowSpan + 1);
        return { col: Math.min(w.col, COLS - w.colSpan + 1), row: Math.min(Math.max(1, w.row), startMax) };
    }

    function sanitizeLayout(layout) {
        const sorted = [...layout].sort((a, b) => a.row - b.row || a.col - b.col);
        const out = [];
        for (const item of sorted) {
            const w = { ...item, config: { ...item.config } };
            const place = findPlacement(out, w, w.col, w.row, w.id);
            w.col = place.col;
            w.row = place.row;
            out.push(w);
        }
        return out;
    }

    function normalizeLayout(raw) {
        if (!Array.isArray(raw) || !raw.length) return [];
        const out = [];
        for (const item of raw) {
            if (!item || !item.type) continue;
            const type = resolveType(item.type);
            if (!type) continue;
            const def = TYPES[type];
            if (!def) continue;
            let colSpan = Number(item.colSpan) || def.colSpan;
            let rowSpan = Number(item.rowSpan) || def.rowSpan;
            if (colSpan > COLS) {
                colSpan = Math.min(COLS, Math.ceil((colSpan / 8) * COLS) || def.colSpan);
            }
            const clamped = clampSpan({ type, col: 1 }, colSpan, rowSpan);
            colSpan = clamped.colSpan;
            rowSpan = clamped.rowSpan;
            let col = Number(item.col) || 1;
            if (col > COLS) col = Math.max(1, Math.ceil((col / 8) * COLS));
            col = Math.max(1, Math.min(COLS, col));
            if (col + colSpan - 1 > COLS) col = COLS - colSpan + 1;
            out.push({
                id: String(item.id || uid()),
                type,
                col,
                row: Math.max(1, Number(item.row) || 1),
                colSpan,
                rowSpan,
                config: item.config && typeof item.config === 'object' ? { ...item.config } : {}
            });
            const last = out[out.length - 1];
            if (type === 'until' && !last.config.target) {
                last.config.target = defaultCountdownTarget();
            }
            if (type === 'worldclock') {
                if (!last.config.timezone) last.config.timezone = WORLD_CLOCK_PRESETS[0].timezone;
                if (!last.config.label) last.config.label = WORLD_CLOCK_PRESETS[0].label;
                const tz = normalizeTimeZone(last.config.timezone);
                if (tz) last.config.timezone = tz;
            }
            if (type === 'focus' && !last.config.minutes) last.config.minutes = 25;
            if (type === 'focus') last.config.minutes = clampFocusMinutes(last.config.minutes);
            if (type === 'weather' && !last.config.unit) last.config.unit = 'C';
            if (type === 'links' && !Array.isArray(last.config.links)) {
                last.config.links = defaultConfig('links').links;
            }
            if (type === 'tasks' && !Array.isArray(last.config.tasks)) last.config.tasks = [];
        }
        return hasOverlaps(out) ? sanitizeLayout(out) : out;
    }

    function canResize(layout, widget, colSpan, rowSpan, ignoreId) {
        return canPlace(layout, { ...widget, colSpan, rowSpan }, widget.col, widget.row, ignoreId || widget.id);
    }

    function moveWidget(layout, widgetId, col, row, maxRows) {
        const next = layout.map((w) => ({ ...w, config: { ...w.config } }));
        const idx = next.findIndex((w) => w.id === widgetId);
        if (idx < 0) return next;
        const w = { ...next[idx] };
        const place = findPlacement(next, w, col, row, w.id, maxRows);
        w.col = place.col;
        w.row = place.row;
        next[idx] = w;
        return next;
    }

    function resizeWidget(layout, widgetId, colSpan, rowSpan) {
        const next = layout.map((w) => ({ ...w, config: { ...w.config } }));
        const idx = next.findIndex((w) => w.id === widgetId);
        if (idx < 0) return next;
        const w = { ...next[idx] };
        const def = typeDef(w.type) || { minColSpan: 1, minRowSpan: 1 };
        const clamped = clampSpan(w, colSpan, rowSpan);
        colSpan = clamped.colSpan;
        rowSpan = clamped.rowSpan;
        if (canResize(next, w, colSpan, rowSpan, w.id)) {
            w.colSpan = colSpan;
            w.rowSpan = rowSpan;
            next[idx] = w;
            return next;
        }
        let best = null;
        for (let cs = colSpan; cs >= def.minColSpan; cs--) {
            for (let rs = rowSpan; rs >= def.minRowSpan; rs--) {
                if (!canResize(next, w, cs, rs, w.id)) continue;
                if (!best || cs * rs > best.colSpan * best.rowSpan) {
                    best = { colSpan: cs, rowSpan: rs };
                }
                break;
            }
        }
        if (best) {
            w.colSpan = best.colSpan;
            w.rowSpan = best.rowSpan;
            next[idx] = w;
        }
        return next;
    }

    function gridRows(layout) {
        if (!layout.length) return 1;
        let max = 1;
        for (const w of layout) {
            max = Math.max(max, w.row + w.rowSpan - 1);
        }
        return max;
    }

    function escapeHtml(str) {
        if (str == null) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    const WMO = {
        0: 'Clear',
        1: 'Clear',
        2: 'Cloudy',
        3: 'Overcast',
        45: 'Fog',
        48: 'Fog',
        51: 'Drizzle',
        53: 'Drizzle',
        55: 'Rain',
        61: 'Rain',
        63: 'Rain',
        65: 'Heavy rain',
        71: 'Snow',
        73: 'Snow',
        75: 'Snow',
        80: 'Showers',
        81: 'Showers',
        82: 'Storms',
        95: 'Storm',
        96: 'Storm',
        99: 'Storm'
    };

    function weatherIcon(code) {
        if (code === 0) return 'fa-sun';
        if (code === 1 || code === 2) return 'fa-cloud-sun';
        if (code === 3) return 'fa-cloud';
        if (code === 45 || code === 48) return 'fa-smog';
        if (code >= 51 && code <= 67) return 'fa-cloud-rain';
        if (code >= 71 && code <= 77) return 'fa-snowflake';
        if (code >= 80 && code <= 82) return 'fa-cloud-showers-heavy';
        if (code >= 95) return 'fa-bolt';
        return 'fa-cloud';
    }

    function widgetSizeClass(widget) {
        return `ntp-widget--${contentDensity(widget)}`;
    }

    function headHtml(title, actionsHtml = '') {
        if (!title && !actionsHtml) return '';
        return `<div class="ntp-w-head">${title ? `<span class="ntp-w-title">${escapeHtml(title)}</span>` : '<span></span>'}${actionsHtml || ''}</div>`;
    }

    function panelHtml(opts) {
        const cls = opts.className ? ` ${opts.className}` : '';
        return `<div class="ntp-w-panel${cls}">${headHtml(opts.title, opts.actions || '')}<div class="ntp-w-content">${opts.body || ''}</div></div>`;
    }

    function shellHtml(widget, bodyHtml) {
        const sizeCls = widgetSizeClass(widget);
        const shape = widgetShape(widget);
        return `<article class="ntp-widget ntp-widget--${escapeHtml(widget.type)} ${sizeCls}" data-widget-id="${escapeHtml(widget.id)}" data-widget-type="${escapeHtml(widget.type)}" data-cspan="${widget.colSpan}" data-rspan="${widget.rowSpan}" data-cols="${shape.cols}" data-rows="${shape.rows}" style="--ntp-w-col:${widget.col};--ntp-w-row:${widget.row};--ntp-w-cspan:${widget.colSpan};--ntp-w-rspan:${widget.rowSpan};">
  <div class="ntp-widget-body">${bodyHtml}</div>
  <button type="button" class="ntp-widget-remove" title="Remove" aria-label="Remove widget"><i class="fas fa-xmark"></i></button>
  <div class="ntp-widget-resize" title="Drag to resize" aria-hidden="true"></div>
</article>`;
    }

    function renderSkeleton(widget) {
        return shellHtml(widget, panelHtml({ body: `<div class="ntp-w-loading"><span>Loading…</span></div>` }));
    }

    function rowLinkHtml(it, { meta, btn, reopenIndex } = {}) {
        const title = it.title || it.url || 'Link';
        const icon = faviconHtml(it.favicon, 'ntp-w-row-icon');
        const metaHtml = meta ? `<span class="ntp-w-row-meta">${escapeHtml(meta)}</span>` : '';
        if (btn || reopenIndex != null) {
            const idx = reopenIndex != null ? reopenIndex : '';
            return `<button type="button" class="ntp-w-row ntp-w-row--btn" data-ntp-reopen="${idx}">${icon}<span class="ntp-w-row-text">${escapeHtml(title)}</span>${metaHtml}</button>`;
        }
        return `<a href="#" class="ntp-w-row" data-ntp-url="${escapeHtml(it.url || '')}">${icon}<span class="ntp-w-row-text">${escapeHtml(title)}</span>${metaHtml}</a>`;
    }

    function quoteForDay(offset = 0) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const day = Math.floor((now - start) / 86400000) + Number(offset || 0);
        return DAILY_QUOTES[Math.abs(day) % DAILY_QUOTES.length];
    }

    function computeTopSites(historyItems, limit = 8) {
        const counts = new Map();
        for (const item of historyItems || []) {
            const url = String(item?.url || '').trim();
            if (!url || url.startsWith('axis://') || url.startsWith('about:')) continue;
            let host = '';
            try {
                host = new URL(url).hostname.replace(/^www\./, '');
            } catch (_) {
                continue;
            }
            if (!host) continue;
            const key = host;
            const prev = counts.get(key);
            if (prev) {
                prev.count += 1;
                if (!prev.title && item.title) prev.title = item.title;
                if (!prev.favicon && item.favicon) prev.favicon = item.favicon;
            } else {
                counts.set(key, {
                    title: item.title || host,
                    url: `${new URL(url).protocol}//${new URL(url).host}/`,
                    favicon: item.favicon || '',
                    count: 1,
                    host
                });
            }
        }
        return [...counts.values()]
            .sort((a, b) => b.count - a.count || a.host.localeCompare(b.host))
            .slice(0, limit)
            .map((s) => ({
                title: s.title || s.host,
                url: s.url,
                favicon: s.favicon,
                meta: `${s.count}×`
            }));
    }

    function feedLabelForUrl(feedUrl) {
        const url = String(feedUrl || '').trim();
        const preset = HEADLINE_FEED_PRESETS.find((p) => p.url === url);
        if (preset) return preset.label;
        try {
            return new URL(url).hostname.replace(/^www\./, '') || 'Headlines';
        } catch (_) {
            return 'Headlines';
        }
    }

    function nextHeadlineFeed(feedUrl) {
        const url = String(feedUrl || '').trim();
        const idx = HEADLINE_FEED_PRESETS.findIndex((p) => p.url === url);
        const next = HEADLINE_FEED_PRESETS[(idx >= 0 ? idx + 1 : 0) % HEADLINE_FEED_PRESETS.length];
        return next;
    }

    function isValidTimeZone(tz) {
        if (!tz || typeof tz !== 'string') return false;
        try {
            Intl.DateTimeFormat(undefined, { timeZone: tz });
            return true;
        } catch (_) {
            return false;
        }
    }

    function normalizeTimeZone(tz) {
        const raw = String(tz || '').trim().replace(/\s+/g, '_');
        if (isValidTimeZone(raw)) return raw;
        const spaced = String(tz || '').trim();
        if (isValidTimeZone(spaced)) return spaced;
        return '';
    }

    function worldClockParts(timezone) {
        const tz = normalizeTimeZone(timezone) || 'America/New_York';
        const now = new Date();
        let time = '—';
        let weekday = '';
        let offset = '';
        try {
            time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZone: tz });
            weekday = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', timeZone: tz });
            const local = now.getTime();
            const fmt = new Intl.DateTimeFormat('en-US', {
                timeZone: tz,
                timeZoneName: 'shortOffset'
            });
            const parts = fmt.formatToParts(now);
            offset = parts.find((p) => p.type === 'timeZoneName')?.value || '';
            void local;
        } catch (_) {}
        return { tz, time, weekday, offset };
    }

    function worldPresetOptions(currentTz) {
        const cur = normalizeTimeZone(currentTz) || currentTz;
        const known = new Set(WORLD_CLOCK_PRESETS.map((p) => p.timezone));
        let html = WORLD_CLOCK_PRESETS.map(
            (p) =>
                `<option value="${escapeHtml(p.timezone)}" ${p.timezone === cur ? 'selected' : ''}>${escapeHtml(p.label)}</option>`
        ).join('');
        if (cur && !known.has(cur)) {
            html += `<option value="${escapeHtml(cur)}" selected>${escapeHtml(cur)}</option>`;
        }
        return html;
    }

    function renderToday(widget) {
        const now = new Date();
        const shape = widgetShape(widget);
        const time = now.toLocaleTimeString([], {
            hour: 'numeric',
            minute: '2-digit',
            second: shape.tall ? '2-digit' : undefined
        });
        const date = now.toLocaleDateString([], {
            weekday: shape.density === 'xs' ? 'short' : 'long',
            month: 'short',
            day: 'numeric'
        });
        if (shape.density === 'xs') {
            return shellHtml(
                widget,
                `<div class="ntp-w-today ntp-w-today--xs">
  <span class="ntp-w-today-time">${escapeHtml(time)}</span>
</div>`
            );
        }
        return shellHtml(
            widget,
            `<div class="ntp-w-today ntp-w-today--${escapeHtml(shape.density)}${shape.tall ? ' ntp-w-today--tall' : ''}${shape.wide ? ' ntp-w-today--wide' : ''}">
  <span class="ntp-w-today-time">${escapeHtml(time)}</span>
  <span class="ntp-w-today-date">${escapeHtml(date)}</span>
</div>`
        );
    }

    function renderHeadlines(widget, items) {
        const shape = widgetShape(widget);
        const d = shape.density;
        const feedUrl = widget.config?.feedUrl || HEADLINE_FEED_PRESETS[0].url;
        const feedLabel = feedLabelForUrl(feedUrl);
        const list = items || [];
        const cycleBtn = `<button type="button" class="ntp-w-kicker ntp-w-kicker--action" data-ntp-headline-cycle data-widget-id="${escapeHtml(widget.id)}" title="Next news source">${escapeHtml(feedLabel)} <i class="fas fa-arrows-rotate" aria-hidden="true"></i></button>`;
        const feedSelect =
            d === 'xs'
                ? ''
                : `<select class="ntp-w-feed-select" data-ntp-headline-feed data-widget-id="${escapeHtml(widget.id)}" aria-label="News source" title="Choose feed">
  ${HEADLINE_FEED_PRESETS.map((p) => `<option value="${escapeHtml(p.url)}" ${p.url === feedUrl ? 'selected' : ''}>${escapeHtml(p.label)}</option>`).join('')}
  ${HEADLINE_FEED_PRESETS.some((p) => p.url === feedUrl) ? '' : `<option value="${escapeHtml(feedUrl)}" selected>${escapeHtml(feedLabel)}</option>`}
</select>`;
        const customFeed =
            d === 'lg' || (shape.tall && shape.cols >= 2)
                ? `<form class="ntp-w-feed-custom" data-widget-id="${escapeHtml(widget.id)}">
  <input type="url" class="ntp-w-feed-input" placeholder="Custom RSS URL…" value="" maxlength="300" inputmode="url" aria-label="Custom RSS URL">
</form>`
                : '';

        if (d === 'xs') {
            const top = list[0];
            return shellHtml(
                widget,
                `<div class="ntp-w-headlines ntp-w-headlines--xs">
  ${cycleBtn}
  ${top ? `<a href="#" class="ntp-w-link ntp-w-link--single" data-ntp-url="${escapeHtml(top.url)}">${escapeHtml(top.title)}</a>` : `<span class="ntp-w-empty">No stories</span>`}
</div>`
            );
        }

        const limit = itemLimit(widget, 2, 3, 5, 10);
        const lines = list
            .slice(0, limit)
            .map((it, i) => {
                const idx = shape.tall ? `<span class="ntp-w-headline-idx">${i + 1}</span>` : '';
                return `<li>${idx}<a href="#" class="ntp-w-link" data-ntp-url="${escapeHtml(it.url)}">${escapeHtml(it.title)}</a></li>`;
            })
            .join('');
        return shellHtml(
            widget,
            `<div class="ntp-w-headlines ntp-w-headlines--${escapeHtml(d)}">
  <div class="ntp-w-kicker-row">${cycleBtn}${feedSelect}</div>
  <ul class="ntp-w-list">${lines || '<li class="ntp-w-empty">No stories right now</li>'}</ul>
  ${customFeed}
</div>`
        );
    }

    function renderWeather(widget, data) {
        const unit = String(widget.config?.unit || 'C').toUpperCase() === 'F' ? 'F' : 'C';
        const toDisplay = (c) => {
            if (c == null || Number.isNaN(Number(c))) return null;
            return unit === 'F' ? (Number(c) * 9) / 5 + 32 : Number(c);
        };
        const tempVal = toDisplay(data?.temp);
        const temp = tempVal != null ? `${Math.round(tempVal)}°` : '—';
        const summary = data?.summary || 'Unavailable';
        const city = widget.config?.city || data?.city || 'London';
        const icon = weatherIcon(data?.code ?? -1);
        const shape = widgetShape(widget);
        const d = shape.density;
        const hiVal = toDisplay(data?.high);
        const loVal = toDisplay(data?.low);
        const hi =
            d !== 'xs' && hiVal != null && loVal != null
                ? `<span class="ntp-w-weather-hilo">${Math.round(hiVal)}° / ${Math.round(loVal)}°</span>`
                : '';
        const unitBtn = `<button type="button" class="ntp-w-chip" data-ntp-weather-unit data-widget-id="${escapeHtml(widget.id)}" title="Switch °C / °F">°${unit}</button>`;
        const cityField = `<input type="text" class="ntp-w-weather-city-input" data-ntp-weather-city data-widget-id="${escapeHtml(widget.id)}" value="${escapeHtml(city)}" placeholder="City" maxlength="48" spellcheck="false" aria-label="Weather city">`;

        if (d === 'xs') {
            return shellHtml(
                widget,
                `<div class="ntp-w-weather ntp-w-weather--xs">
  <div class="ntp-w-weather-row"><i class="fas ${icon} ntp-w-weather-icon" aria-hidden="true"></i><span class="ntp-w-weather-temp">${escapeHtml(temp)}</span>${unitBtn}</div>
  ${cityField}
</div>`
            );
        }

        if (shape.tall || d === 'lg') {
            return shellHtml(
                widget,
                `<div class="ntp-w-weather ntp-w-weather--tall">
  <div class="ntp-w-weather-hero">
    <i class="fas ${icon} ntp-w-weather-icon" aria-hidden="true"></i>
    <span class="ntp-w-weather-temp">${escapeHtml(temp)}</span>
    ${unitBtn}
  </div>
  <span class="ntp-w-weather-label">${escapeHtml(summary)}</span>
  ${hi}
  ${cityField}
</div>`
            );
        }

        return shellHtml(
            widget,
            `<div class="ntp-w-weather ntp-w-weather--${escapeHtml(d)}">
  <i class="fas ${icon} ntp-w-weather-icon" aria-hidden="true"></i>
  <div class="ntp-w-weather-meta">
    <div class="ntp-w-weather-row"><span class="ntp-w-weather-temp">${escapeHtml(temp)}</span>${hi}${unitBtn}</div>
    <span class="ntp-w-weather-label">${escapeHtml(summary)}</span>
    ${cityField}
  </div>
</div>`
        );
    }

    function renderNote(widget) {
        const text = widget.config?.text || '';
        const shape = widgetShape(widget);
        const rows = Math.max(1, Math.min(8, (widget.rowSpan || 1) * 2));
        return shellHtml(
            widget,
            `<div class="ntp-w-note ntp-w-note--${escapeHtml(shape.density)}">
  ${shape.density === 'xs' ? '' : '<div class="ntp-w-kicker">Note</div>'}
  <textarea class="ntp-widget-notes-input" data-widget-id="${escapeHtml(widget.id)}" placeholder="Jot something down…" rows="${rows}">${escapeHtml(text)}</textarea>
</div>`
        );
    }

    function faviconHtml(favicon, cls) {
        if (favicon) {
            return `<img class="${cls}" src="${escapeHtml(favicon)}" alt="" loading="lazy" onerror="this.classList.add('is-missing')">`;
        }
        return `<span class="${cls} is-missing" aria-hidden="true"><i class="fas fa-globe"></i></span>`;
    }

    function renderRecent(widget, items) {
        const list = items || [];
        const shape = widgetShape(widget);
        const limit = itemLimit(widget, 2, 3, 5, 10);
        const rows = list
            .slice(0, limit)
            .map((it) => rowLinkHtml(it, { meta: it.time && shape.cols >= 2 ? it.time : '' }))
            .join('');
        return shellHtml(
            widget,
            panelHtml({
                title: 'Recent',
                className: `ntp-w-recent${shape.wide ? ' ntp-w-listwrap--grid' : ''}`,
                body: `<div class="ntp-w-rows">${rows || '<span class="ntp-w-empty">No history yet</span>'}</div>`
            })
        );
    }

    function renderReopen(widget, tabs) {
        const list = tabs || [];
        const shape = widgetShape(widget);
        const limit = itemLimit(widget, 2, 3, 5, 8);
        const rows = list
            .slice(0, limit)
            .map((t, i) => rowLinkHtml(t, { reopenIndex: i }))
            .join('');
        return shellHtml(
            widget,
            panelHtml({
                title: 'Closed tabs',
                className: `ntp-w-reopen${shape.wide ? ' ntp-w-listwrap--grid' : ''}`,
                body: `<div class="ntp-w-rows">${rows || '<span class="ntp-w-empty">No closed tabs</span>'}</div>`
            })
        );
    }

    function renderDownloads(widget, data) {
        return renderSkeleton(widget);
    }

    function normalizeLinks(config) {
        const raw = Array.isArray(config?.links) ? config.links : [];
        return raw
            .map((item, i) => ({
                id: String(item?.id || `l${i}`),
                label: String(item?.label || '').trim(),
                url: String(item?.url || '').trim()
            }))
            .filter((item) => item.url)
            .slice(0, 8);
    }

    function renderLinks(widget) {
        const links = normalizeLinks(widget.config);
        const shape = widgetShape(widget);
        const d = shape.density;
        const limit = itemLimit(widget, 2, 3, 5, 8);
        const rows = links
            .slice(0, limit)
            .map((it) => {
                const title = it.label || it.url.replace(/^https?:\/\//, '').split('/')[0];
                let host = '';
                try {
                    host = new URL(it.url).hostname;
                } catch (_) {}
                const favicon = host ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32` : '';
                return `<div class="ntp-w-link-row">
  <a href="#" class="ntp-w-row" data-ntp-url="${escapeHtml(it.url)}">${faviconHtml(favicon, 'ntp-w-row-icon')}<span class="ntp-w-row-text">${escapeHtml(title)}</span></a>
  ${d === 'xs' ? '' : `<button type="button" class="ntp-w-task-remove" data-ntp-link-remove="${escapeHtml(it.id)}" title="Remove" aria-label="Remove link"><i class="fas fa-xmark"></i></button>`}
</div>`;
            })
            .join('');
        const addForm =
            d === 'xs'
                ? ''
                : `<form class="ntp-w-link-add" data-widget-id="${escapeHtml(widget.id)}">
    <input type="text" class="ntp-w-link-input" name="url" placeholder="Add https://…" maxlength="200" autocomplete="off" inputmode="url">
  </form>`;
        return shellHtml(
            widget,
            `<div class="ntp-w-links${shape.wide ? ' ntp-w-listwrap--grid' : ''}">
  <div class="ntp-w-kicker">Quick links</div>
  <div class="ntp-w-rows">${rows || '<span class="ntp-w-empty">Type a URL below</span>'}</div>
  ${addForm}
</div>`
        );
    }

    function normalizeTasks(config) {
        const raw = Array.isArray(config?.tasks) ? config.tasks : [];
        return raw
            .map((item, i) => ({
                id: String(item?.id || `t${i}`),
                text: String(item?.text || '').trim(),
                done: !!item?.done
            }))
            .filter((item) => item.text)
            .slice(0, 20);
    }

    function renderTasks(widget) {
        const tasks = normalizeTasks(widget.config);
        const shape = widgetShape(widget);
        const d = shape.density;
        const limit = itemLimit(widget, 2, 3, 5, 10);
        const doneCount = tasks.filter((t) => t.done).length;
        const rows = tasks
            .slice(0, limit)
            .map(
                (t) => `<div class="ntp-w-task-row${t.done ? ' is-done' : ''}">
  <button type="button" class="ntp-w-task" data-ntp-task-toggle="${escapeHtml(t.id)}">
    <span class="ntp-w-task-check" aria-hidden="true"><i class="fas ${t.done ? 'fa-circle-check' : 'fa-circle'}"></i></span>
    <span class="ntp-w-task-text">${escapeHtml(t.text)}</span>
  </button>
  ${d === 'xs' ? '' : `<button type="button" class="ntp-w-task-remove" data-ntp-task-remove="${escapeHtml(t.id)}" title="Remove" aria-label="Remove task"><i class="fas fa-xmark"></i></button>`}
</div>`
            )
            .join('');
        const clearBtn =
            doneCount > 0 && d !== 'xs'
                ? `<button type="button" class="ntp-w-chip ntp-w-chip--quiet" data-ntp-task-clear-done data-widget-id="${escapeHtml(widget.id)}">Clear done</button>`
                : '';
        const addForm =
            d === 'xs'
                ? ''
                : `<form class="ntp-w-task-add" data-widget-id="${escapeHtml(widget.id)}">
    <input type="text" class="ntp-w-task-input" placeholder="Add a task…" maxlength="120" autocomplete="off">
  </form>`;
        return shellHtml(
            widget,
            `<div class="ntp-w-tasks">
  <div class="ntp-w-kicker-row"><div class="ntp-w-kicker">Tasks</div>${clearBtn}</div>
  <div class="ntp-w-task-list">${rows || '<span class="ntp-w-empty">Nothing yet</span>'}</div>
  ${addForm}
</div>`
        );
    }

    function renderFavorites(widget, items) {
        const list = items || [];
        const shape = widgetShape(widget);
        const limit = itemLimit(widget, 2, 4, 6, 10);
        const rows = list
            .slice(0, limit)
            .map((it) => rowLinkHtml(it))
            .join('');
        return shellHtml(
            widget,
            panelHtml({
                title: 'Favorites',
                className: `ntp-w-favorites${shape.wide ? ' ntp-w-listwrap--grid' : ''}`,
                body: `<div class="ntp-w-rows">${rows || '<span class="ntp-w-empty">No favorites yet</span>'}</div>`
            })
        );
    }

    function renderPinned(widget, items) {
        const list = items || [];
        const shape = widgetShape(widget);
        const limit = itemLimit(widget, 2, 4, 6, 10);
        const rows = list
            .slice(0, limit)
            .map((it) => rowLinkHtml(it))
            .join('');
        return shellHtml(
            widget,
            panelHtml({
                title: 'Pinned',
                className: `ntp-w-pinned${shape.wide ? ' ntp-w-listwrap--grid' : ''}`,
                body: `<div class="ntp-w-rows">${rows || '<span class="ntp-w-empty">No pinned tabs</span>'}</div>`
            })
        );
    }

    function renderTopsites(widget, items) {
        const list = items || [];
        const shape = widgetShape(widget);
        const limit = itemLimit(widget, 2, 4, 6, 10);
        const rows = list
            .slice(0, limit)
            .map((it) => rowLinkHtml(it, { meta: shape.cols >= 2 ? it.meta : '' }))
            .join('');
        return shellHtml(
            widget,
            panelHtml({
                title: 'Top sites',
                className: `ntp-w-topsites${shape.wide ? ' ntp-w-listwrap--grid' : ''}`,
                body: `<div class="ntp-w-rows">${rows || '<span class="ntp-w-empty">Browse a bit to fill this</span>'}</div>`
            })
        );
    }

    function renderQuote(widget) {
        const offset = Number(widget.config?.offset || 0);
        const q = quoteForDay(offset);
        const shape = widgetShape(widget);
        const nextBtn = `<button type="button" class="ntp-w-chip ntp-w-chip--quiet" data-ntp-quote-next data-widget-id="${escapeHtml(widget.id)}" title="Another quote">Next</button>`;
        return shellHtml(
            widget,
            panelHtml({
                title: shape.density === 'xs' ? '' : 'Quote',
                actions: nextBtn,
                className: `ntp-w-quote ntp-w-quote--${escapeHtml(shape.density)}`,
                body: `<blockquote class="ntp-w-quote-text">“${escapeHtml(q.text)}”</blockquote>
  <cite class="ntp-w-quote-author">${escapeHtml(q.author)}</cite>`
            })
        );
    }

    function renderStats(widget, data) {
        const shape = widgetShape(widget);
        const cells = [
            { label: 'Tabs', value: data?.tabs ?? 0 },
            { label: 'Pinned', value: data?.pinned ?? 0 },
            { label: 'Favorites', value: data?.favorites ?? 0 },
            { label: 'Closed', value: data?.closed ?? 0 }
        ];
        const show = shape.density === 'xs' ? cells.slice(0, 2) : cells;
        const grid = show
            .map(
                (c) => `<div class="ntp-w-stat-cell">
  <span class="ntp-w-stat-value">${escapeHtml(String(c.value))}</span>
  <span class="ntp-w-stat-label">${escapeHtml(c.label)}</span>
</div>`
            )
            .join('');
        return shellHtml(
            widget,
            panelHtml({
                title: shape.density === 'xs' ? '' : 'Session',
                className: `ntp-w-stats ntp-w-stats--${escapeHtml(shape.density)}`,
                body: `<div class="ntp-w-stats-grid">${grid}</div>`
            })
        );
    }

    function formatFocusTime(seconds) {
        const s = Math.max(0, Math.floor(seconds));
        const m = Math.floor(s / 60);
        const r = s % 60;
        return `${m}:${String(r).padStart(2, '0')}`;
    }

    function clampFocusMinutes(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return 25;
        return Math.max(FOCUS_MIN_MINUTES, Math.min(FOCUS_MAX_MINUTES, Math.round(n)));
    }

    function renderFocus(widget, state) {
        const duration = clampFocusMinutes(widget.config?.minutes);
        const remaining = state?.remaining ?? duration * 60;
        const running = !!state?.running;
        const shape = widgetShape(widget);
        const d = shape.density;
        const time = formatFocusTime(remaining);
        const pct = Math.max(0, Math.min(100, Math.round((1 - remaining / (duration * 60)) * 100)));
        const actionLabel = running ? 'Pause' : remaining < duration * 60 && remaining > 0 ? 'Resume' : 'Start';
        const presets = FOCUS_PRESETS.map(
            (m) =>
                `<button type="button" class="ntp-w-focus-preset${m === duration ? ' is-active' : ''}" data-ntp-focus-mins="${m}" data-widget-id="${escapeHtml(widget.id)}">${m}</button>`
        ).join('');
        const resetDisabled = remaining >= duration * 60 && !running ? 'disabled' : '';
        const actions = `<div class="ntp-w-focus-actions">
    <button type="button" class="ntp-w-focus-btn" data-widget-id="${escapeHtml(widget.id)}">${actionLabel}</button>
    <button type="button" class="ntp-w-chip ntp-w-chip--quiet" data-ntp-focus-reset data-widget-id="${escapeHtml(widget.id)}" ${resetDisabled}>Reset</button>
  </div>`;
        const customForm = `<form class="ntp-w-focus-custom" data-widget-id="${escapeHtml(widget.id)}">
    <input type="number" class="ntp-w-focus-custom-input" min="${FOCUS_MIN_MINUTES}" max="${FOCUS_MAX_MINUTES}" step="1" value="${duration}" inputmode="numeric" aria-label="Custom minutes" ${running ? 'disabled' : ''}>
    <span class="ntp-w-focus-custom-unit">min</span>
    <button type="submit" class="ntp-w-chip" ${running ? 'disabled' : ''}>Set</button>
  </form>`;

        if (d === 'xs') {
            return shellHtml(
                widget,
                `<div class="ntp-w-focus ntp-w-focus--compact">
  <span class="ntp-w-focus-time">${escapeHtml(time)}</span>
  <button type="button" class="ntp-w-focus-btn" data-widget-id="${escapeHtml(widget.id)}">${actionLabel}</button>
</div>`
            );
        }

        if (d === 'sm' && !shape.tall) {
            return shellHtml(
                widget,
                `<div class="ntp-w-focus ntp-w-focus--sm">
  <div class="ntp-w-focus-top">
    <span class="ntp-w-focus-time">${escapeHtml(time)}</span>
    ${actions}
  </div>
  <div class="ntp-w-focus-presets" aria-label="Duration minutes">${presets}</div>
</div>`
            );
        }

        return shellHtml(
            widget,
            `<div class="ntp-w-focus ntp-w-focus--split ntp-w-focus--${escapeHtml(d)}${shape.tall ? ' ntp-w-focus--tall' : ''}">
  <div class="ntp-w-focus-ring" style="--ntp-focus-pct:${pct}%"><span class="ntp-w-focus-time">${escapeHtml(time)}</span></div>
  <div class="ntp-w-focus-side">
    <div class="ntp-w-focus-presets" aria-label="Duration minutes">${presets}</div>
    ${customForm}
    ${actions}
  </div>
</div>`
        );
    }

    function daysUntil(targetStr) {
        if (!targetStr) return null;
        const target = new Date(`${targetStr}T12:00:00`);
        if (Number.isNaN(target.getTime())) return null;
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const end = new Date(target.getFullYear(), target.getMonth(), target.getDate());
        return Math.ceil((end - today) / 86400000);
    }

    function defaultCountdownTarget() {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().slice(0, 10);
    }

    function renderUntil(widget) {
        const label = widget.config?.label || 'Event';
        const target = widget.config?.target || '';
        const days = daysUntil(target);
        const shape = widgetShape(widget);
        const d = shape.density;
        const phrase =
            days == null
                ? 'Pick a date'
                : days === 0
                  ? 'Today'
                  : days === 1
                    ? 'Tomorrow'
                    : days < 0
                      ? `${Math.abs(days)}d ago`
                      : `${days}d left`;
        const num = days == null ? '—' : String(days < 0 ? Math.abs(days) : days);
        const labelInput = `<input type="text" class="ntp-w-until-label-input" data-ntp-until-field="label" data-widget-id="${escapeHtml(widget.id)}" value="${escapeHtml(label)}" placeholder="Event name" maxlength="40" spellcheck="false">`;
        const dateInput = `<input type="date" class="ntp-w-until-date" data-ntp-until-field="target" data-widget-id="${escapeHtml(widget.id)}" value="${escapeHtml(target)}" title="Target date">`;

        if (d === 'xs') {
            return shellHtml(
                widget,
                `<div class="ntp-w-until ntp-w-until--compact" title="${escapeHtml(label)} · ${escapeHtml(phrase)}">
  <span class="ntp-w-until-num">${escapeHtml(num)}</span>
  <div class="ntp-w-until-meta">
    ${labelInput}
    <span class="ntp-w-until-sub">${escapeHtml(phrase)}</span>
  </div>
</div>`
            );
        }

        if (!shape.tall && (d === 'sm' || shape.cols >= 2)) {
            return shellHtml(
                widget,
                `<div class="ntp-w-until ntp-w-until--row">
  <span class="ntp-w-until-num">${escapeHtml(num)}</span>
  <div class="ntp-w-until-meta">
    ${labelInput}
    <span class="ntp-w-until-sub">${escapeHtml(phrase)}</span>
    ${dateInput}
  </div>
</div>`
            );
        }

        return shellHtml(
            widget,
            `<div class="ntp-w-until ntp-w-until--stack">
  <span class="ntp-w-until-num">${escapeHtml(num)}</span>
  ${labelInput}
  <span class="ntp-w-until-sub">${escapeHtml(phrase)}</span>
  ${dateInput}
</div>`
        );
    }

    function renderWorldclock(widget) {
        const label = widget.config?.label || 'New York';
        const shape = widgetShape(widget);
        const d = shape.density;
        const parts = worldClockParts(widget.config?.timezone || 'America/New_York');
        const labelField = `<input type="text" class="ntp-w-world-label-input" data-ntp-world-label data-widget-id="${escapeHtml(widget.id)}" value="${escapeHtml(label)}" placeholder="City name" maxlength="40" spellcheck="false" aria-label="City label">`;
        const presetSelect = `<select class="ntp-w-world-select" data-ntp-world-preset data-widget-id="${escapeHtml(widget.id)}" aria-label="City timezone">${worldPresetOptions(parts.tz)}</select>`;
        const customForm = `<form class="ntp-w-world-custom" data-widget-id="${escapeHtml(widget.id)}" title="IANA timezone, e.g. America/Chicago">
  <input type="text" class="ntp-w-world-tz-input" data-ntp-world-tz value="${escapeHtml(parts.tz)}" placeholder="America/Chicago" maxlength="64" spellcheck="false" aria-label="Custom timezone">
  <button type="submit" class="ntp-w-chip">Set</button>
</form>`;

        if (d === 'xs') {
            return shellHtml(
                widget,
                `<div class="ntp-w-world ntp-w-world--xs">
  ${labelField}
  <span class="ntp-w-world-time">${escapeHtml(parts.time)}</span>
  ${presetSelect}
</div>`
            );
        }

        if (!shape.tall && d === 'sm') {
            return shellHtml(
                widget,
                `<div class="ntp-w-world ntp-w-world--sm">
  <div class="ntp-w-world-main">
    ${labelField}
    <span class="ntp-w-world-time">${escapeHtml(parts.time)}</span>
    <span class="ntp-w-world-date">${escapeHtml(parts.weekday)}${parts.offset ? ` · ${escapeHtml(parts.offset)}` : ''}</span>
  </div>
  <div class="ntp-w-world-controls">
    ${presetSelect}
  </div>
</div>`
            );
        }

        return shellHtml(
            widget,
            `<div class="ntp-w-world ntp-w-world--${escapeHtml(d)}${shape.tall ? ' ntp-w-world--tall' : ''}${shape.wide ? ' ntp-w-world--wide' : ''}">
  <div class="ntp-w-world-main">
    ${labelField}
    <span class="ntp-w-world-time">${escapeHtml(parts.time)}</span>
    <span class="ntp-w-world-date">${escapeHtml(parts.weekday)}</span>
    ${parts.offset ? `<span class="ntp-w-world-offset">${escapeHtml(parts.offset)}</span>` : ''}
  </div>
  <div class="ntp-w-world-controls">
    <label class="ntp-w-world-control-label">City</label>
    ${presetSelect}
    <label class="ntp-w-world-control-label">Custom timezone</label>
    ${customForm}
  </div>
</div>`
        );
    }

    async function fetchNewsItems(config) {
        const url = config?.feedUrl || HEADLINE_FEED_PRESETS[0].url;
        try {
            let text = '';
            if (typeof window !== 'undefined' && window.electronAPI?.fetchText) {
                const res = await window.electronAPI.fetchText(url);
                text = res?.ok ? String(res.text || '') : '';
            } else {
                const res = await fetch(url, { cache: 'no-store' });
                text = await res.text();
            }
            if (!text) return [];
            const doc = new DOMParser().parseFromString(text, 'text/xml');
            const nodes = [...doc.querySelectorAll('item, entry')];
            return nodes
                .slice(0, 10)
                .map((el) => {
                    const title = (el.querySelector('title')?.textContent || '').trim();
                    let link =
                        (el.querySelector('link')?.getAttribute?.('href') ||
                            el.querySelector('link')?.textContent ||
                            el.querySelector('id')?.textContent ||
                            '').trim();
                    return { title, url: link };
                })
                .filter((i) => i.title && i.url);
        } catch (_) {
            return [];
        }
    }

    async function fetchWeather(config) {
        const city = String(config?.city || 'London').trim();
        try {
            const geoRes = await fetch(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=en&format=json`
            );
            const geo = await geoRes.json();
            const hit = geo?.results?.[0];
            if (!hit) return { summary: 'Not found', temp: null, city, code: 3 };
            const wxRes = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
            );
            const wx = await wxRes.json();
            const cur = wx?.current;
            const code = cur?.weather_code ?? 3;
            return {
                summary: WMO[code] || '—',
                temp: cur?.temperature_2m,
                high: wx?.daily?.temperature_2m_max?.[0],
                low: wx?.daily?.temperature_2m_min?.[0],
                city: hit.name,
                code
            };
        } catch (_) {
            return { summary: 'Offline', temp: null, city, code: 3 };
        }
    }

    function defaultConfig(type, prefs = {}) {
        const config = {};
        if (type === 'headlines') {
            config.feedUrl = prefs.feedUrl || HEADLINE_FEED_PRESETS[0].url;
        } else if (type === 'weather') {
            config.city = prefs.city || 'London';
            config.unit = prefs.unit === 'F' ? 'F' : 'C';
        } else if (type === 'note') {
            config.text = '';
        } else if (type === 'focus') {
            config.minutes = clampFocusMinutes(prefs.minutes ?? 25);
        } else if (type === 'until') {
            config.label = prefs.label || prefs.untilLabel || 'Event';
            config.target = prefs.target || prefs.untilTarget || defaultCountdownTarget();
        } else if (type === 'worldclock') {
            const preset = WORLD_CLOCK_PRESETS[0];
            config.label = prefs.label || prefs.worldclockLabel || preset.label;
            config.timezone = prefs.timezone || prefs.worldclockTimezone || preset.timezone;
        } else if (type === 'links') {
            config.links = Array.isArray(prefs.links)
                ? prefs.links
                : [
                      { label: 'Google', url: 'https://www.google.com' },
                      { label: 'YouTube', url: 'https://www.youtube.com' },
                      { label: 'Wikipedia', url: 'https://www.wikipedia.org' }
                  ];
        } else if (type === 'tasks') {
            config.tasks = Array.isArray(prefs.tasks) ? prefs.tasks : [];
        } else if (type === 'quote') {
            config.offset = Number(prefs.offset) || 0;
        }
        return config;
    }

    function createWidget(type, col, row, prefs = {}, span = {}) {
        const resolved = resolveType(type);
        const def = TYPES[resolved];
        if (!def) return null;
        return {
            id: uid(),
            type: resolved,
            col: col || 1,
            row: row || 1,
            colSpan: span.colSpan != null ? span.colSpan : def.colSpan,
            rowSpan: span.rowSpan != null ? span.rowSpan : def.rowSpan,
            config: defaultConfig(resolved, prefs)
        };
    }

    function findOpenSlot(layout, colSpan, rowSpan, maxRows) {
        const rowLimit = Math.max(1, Number(maxRows) || 24);
        const maxStartRow = Math.max(1, rowLimit - rowSpan + 1);
        const searchFloor = Math.min(maxStartRow, gridRows(layout) + 1);
        for (let row = 1; row <= searchFloor; row++) {
            for (let col = 1; col <= COLS - colSpan + 1; col++) {
                const trial = { id: '__new', type: 'today', col, row, colSpan, rowSpan, config: {} };
                if (canPlace(layout, trial, col, row, '__new')) {
                    return { col, row };
                }
            }
        }
        return null;
    }

    /** Find first open slot, shrinking span down to each type's minimum if needed. */
    function findPlacementWithShrink(type, layout, maxRows) {
        const def = TYPES[resolveType(type)];
        if (!def) return null;
        const minC = def.minColSpan || 1;
        const minR = def.minRowSpan || 1;
        for (let rs = def.rowSpan; rs >= minR; rs--) {
            for (let cs = def.colSpan; cs >= minC; cs--) {
                const spot = findOpenSlot(layout, cs, rs, maxRows);
                if (spot) return { ...spot, colSpan: cs, rowSpan: rs };
            }
        }
        return null;
    }

    function getPickerItems() {
        return Object.values(TYPES).map((t) => ({
            id: t.id,
            label: t.label,
            desc: t.desc,
            icon: t.icon
        }));
    }

    function widgetLabel(widget) {
        const def = typeDef(widget?.type);
        return def?.label || String(widget?.type || 'Widget');
    }

    function widgetHasConfig(type) {
        const t = resolveType(type);
        return (
            t === 'weather' ||
            t === 'headlines' ||
            t === 'until' ||
            t === 'worldclock' ||
            t === 'focus' ||
            t === 'links'
        );
    }

    function isAsyncType(type) {
        const t = resolveType(type);
        return (
            t === 'headlines' ||
            t === 'weather' ||
            t === 'recent' ||
            t === 'favorites' ||
            t === 'topsites' ||
            t === 'pinned' ||
            t === 'stats'
        );
    }

    function isLiveType(type) {
        const t = resolveType(type);
        return t === 'today' || t === 'worldclock' || t === 'focus' || t === 'reopen' || t === 'stats' || t === 'pinned';
    }

    function needsResizeRefresh(type) {
        return !!resolveType(type);
    }

    function spanFromPointer(widget, clientX, clientY, gridRect, colW, rowH, gap) {
        const x = clientX - gridRect.left;
        const y = clientY - gridRect.top;
        const stepX = colW + gap;
        const stepY = rowH + gap;
        let endCol = Math.floor((x + gap * 0.5) / stepX) + 1;
        let endRow = Math.floor((y + gap * 0.5) / stepY) + 1;
        endCol = Math.max(widget.col, Math.min(COLS, endCol));
        endRow = Math.max(widget.row, endRow);
        return clampSpan(widget, endCol - widget.col + 1, endRow - widget.row + 1);
    }

    const api = {
        COLS,
        ROW_H,
        GAP,
        TYPES,
        WORLD_CLOCK_PRESETS,
        HEADLINE_FEED_PRESETS,
        FOCUS_PRESETS,
        FOCUS_MIN_MINUTES,
        FOCUS_MAX_MINUTES,
        defaultLayout,
        normalizeLayout,
        sanitizeLayout,
        findPlacement,
        findOpenSlot,
        findPlacementWithShrink,
        hasOverlaps,
        moveWidget,
        resizeWidget,
        gridRows,
        canPlace,
        canResize,
        clampSpan,
        spanFromPointer,
        createWidget,
        getPickerItems,
        widgetLabel,
        widgetHasConfig,
        widgetSizeClass,
        contentDensity,
        typeDef,
        resolveType,
        renderSkeleton,
        renderToday,
        renderHeadlines,
        renderWeather,
        renderNote,
        renderRecent,
        renderReopen,
        renderDownloads,
        renderLinks,
        renderTasks,
        renderFavorites,
        renderPinned,
        renderTopsites,
        renderQuote,
        renderStats,
        renderFocus,
        renderUntil,
        renderWorldclock,
        formatFocusTime,
        clampFocusMinutes,
        normalizeLinks,
        normalizeTasks,
        feedLabelForUrl,
        nextHeadlineFeed,
        daysUntil,
        isValidTimeZone,
        normalizeTimeZone,
        worldClockParts,
        widgetShape,
        listCapacity,
        quoteForDay,
        computeTopSites,
        fetchNewsItems,
        fetchWeather,
        escapeHtml,
        isAsyncType,
        isLiveType,
        needsResizeRefresh
    };

    global.AxisNtpWidgets = api;
})(typeof window !== 'undefined' ? window : globalThis);
