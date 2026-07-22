/**
 * New Tab widgets — weather, clocks, air quality, markets, and calendar.
 */
(function (global) {
    const COLS = 4;
    const ROW_H = 80;
    const GAP = 12;

    /** Older widget types are dropped on normalize. */
    const LEGACY_TYPES = {
        news: '',
        deals: '',
        notes: '',
        quote: '',
        countdown: '',
        date: '',
        pins: '',
        spotlight: '',
        tabs: '',
        continue: '',
        shortcuts: '',
        downloads: '',
        headlines: '',
        today: '',
        note: '',
        recent: '',
        reopen: '',
        links: '',
        tasks: '',
        favorites: '',
        pinned: '',
        topsites: '',
        stats: '',
        focus: '',
        until: ''
    };

    const TYPES = {
        weather: {
            id: 'weather',
            label: 'Weather',
            desc: 'Current conditions for any city',
            icon: 'fa-cloud-sun',
            colSpan: 3,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 6
        },
        clock: {
            id: 'clock',
            label: 'Clock',
            desc: 'Local time that stays up to date',
            icon: 'fa-clock',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4
        },
        worldclock: {
            id: 'worldclock',
            label: 'World Clock',
            desc: 'Time in any city worldwide',
            icon: 'fa-globe',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4
        },
        airquality: {
            id: 'airquality',
            label: 'Air Quality',
            desc: 'AQI and particles for any city',
            icon: 'fa-wind',
            colSpan: 2,
            rowSpan: 1,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 4
        },
        markets: {
            id: 'markets',
            label: 'Markets',
            desc: 'Stocks and crypto you choose',
            icon: 'fa-chart-line',
            colSpan: 2,
            rowSpan: 2,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 6
        },
        calendar: {
            id: 'calendar',
            label: 'Calendar',
            desc: 'Today, this week, or the full month',
            icon: 'fa-calendar-days',
            colSpan: 2,
            rowSpan: 3,
            minColSpan: 1,
            minRowSpan: 1,
            maxColSpan: 4,
            maxRowSpan: 6
        }
    };

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
            const config = item.config && typeof item.config === 'object' ? { ...item.config } : {};
            if (type === 'weather') {
                if (config.city == null) config.city = '';
                if (!config.unit) config.unit = 'C';
                delete config.provider;
                delete config.apiKey;
                delete config.customUrl;
            } else if (type === 'worldclock') {
                if (config.city == null) config.city = '';
                if (config.timezone == null) config.timezone = '';
                if (config.hour12 == null) config.hour12 = true;
            } else if (type === 'clock') {
                if (config.hour12 == null) config.hour12 = true;
            } else if (type === 'airquality') {
                if (config.city == null) config.city = '';
                if (!config.scale) config.scale = 'us';
            } else if (type === 'markets') {
                config.symbols = normalizeMarketSymbols(config.symbols);
            } else if (type === 'calendar') {
                config.weekStartsOn = Number(config.weekStartsOn) === 1 ? 1 : 0;
            }
            out.push({
                id: String(item.id || uid()),
                type,
                col,
                row: Math.max(1, Number(item.row) || 1),
                colSpan,
                rowSpan,
                config
            });
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

    function widgetSizeClass(widget) {
        return `ntp-widget--${contentDensity(widget)}`;
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
        const type = resolveType(widget?.type) || widget?.type;
        if (type === 'clock') return renderClock(widget);
        if (type === 'worldclock') return renderWorldClock(widget);
        if (type === 'calendar') return renderCalendar(widget);
        if (type === 'airquality') {
            return renderAirQuality(widget, { loading: true });
        }
        if (type === 'markets') {
            return renderMarkets(widget, { loading: true });
        }
        const shape = widgetShape(widget);
        const d = shape.density;
        const sizeCls = ` ntp-w-weather--${escapeHtml(d)}${shape.tall ? ' ntp-w-weather--tall' : ''}${shape.wide ? ' ntp-w-weather--wide' : ''}`;
        return shellHtml(
            widget,
            `<div class="ntp-w-weather${sizeCls}" data-weather-kind="cloud" aria-busy="true">
  <div class="ntp-w-weather-cluster">
    <div class="ntp-w-weather-icon">${weatherSvg('cloud')}</div>
    <div class="ntp-w-weather-copy">
      <span class="ntp-w-weather-primary">Loading…</span>
      <span class="ntp-w-weather-secondary">Fetching forecast</span>
    </div>
  </div>
</div>`
        );
    }

    function hour12FromConfig(config) {
        if (config?.hour12 === false || config?.hour12 === 'false' || config?.format === '24') return false;
        return true;
    }

    function formatTzOffset(timeZone) {
        try {
            const fmt = new Intl.DateTimeFormat('en-US', {
                timeZone: timeZone || undefined,
                timeZoneName: 'shortOffset'
            });
            const part = fmt.formatToParts(new Date()).find((p) => p.type === 'timeZoneName');
            return part?.value || '';
        } catch (_) {
            return '';
        }
    }

    function clockParts(config = {}, now = new Date()) {
        const hour12 = hour12FromConfig(config);
        const shapeHint = config._shape || {};
        const withSeconds = !!shapeHint.tall || shapeHint.density === 'lg' || shapeHint.density === 'md';
        try {
            const time = now.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
                second: withSeconds ? '2-digit' : undefined,
                hour12
            });
            const weekday = now.toLocaleDateString([], { weekday: 'short' });
            const date = now.toLocaleDateString([], { month: 'short', day: 'numeric' });
            const fullDate = now.toLocaleDateString([], {
                weekday: 'long',
                month: 'short',
                day: 'numeric'
            });
            return { time, weekday, date, fullDate, ok: true };
        } catch (_) {
            return { time: '—', weekday: '', date: '', fullDate: '', ok: false };
        }
    }

    function worldClockParts(timezone, config = {}, now = new Date()) {
        const tz = String(timezone || config?.timezone || '').trim();
        const hour12 = hour12FromConfig(config);
        const shapeHint = config._shape || {};
        const withSeconds = !!shapeHint.tall || shapeHint.density === 'lg';
        try {
            const opts = tz ? { timeZone: tz } : {};
            const time = now.toLocaleTimeString([], {
                ...opts,
                hour: 'numeric',
                minute: '2-digit',
                second: withSeconds ? '2-digit' : undefined,
                hour12
            });
            const weekday = now.toLocaleDateString([], { ...opts, weekday: 'short' });
            const date = now.toLocaleDateString([], { ...opts, month: 'short', day: 'numeric' });
            const offset = formatTzOffset(tz || undefined);
            return { time, weekday, date, offset, ok: true };
        } catch (_) {
            return { time: '—', weekday: '', date: '', offset: '', ok: false };
        }
    }

    function clockfaceSvg(kind) {
        const common = 'class="ntp-w-clockface-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true"';
        if (kind === 'globe') {
            return `<svg ${common}>
  <circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="2.6"/>
  <path d="M10 24h28M24 10c4.2 3.8 6.5 8.6 6.5 14S28.2 34.2 24 38c-4.2-3.8-6.5-8.6-6.5-14S19.8 13.8 24 10z" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/>
</svg>`;
        }
        return `<svg ${common}>
  <circle cx="24" cy="24" r="14" stroke="currentColor" stroke-width="2.6"/>
  <path d="M24 16v9l6 3.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
    }

    function renderClock(widget) {
        const shape = widgetShape(widget);
        const d = shape.density;
        const sizeCls = ` ntp-w-clockface--${escapeHtml(d)}${shape.tall ? ' ntp-w-clockface--tall' : ''}${shape.wide ? ' ntp-w-clockface--wide' : ''}`;
        const parts = clockParts({ ...(widget.config || {}), _shape: { ...shape, density: d } });
        const dateText =
            shape.tall || shape.wide
                ? parts.fullDate
                : d === 'xs'
                  ? parts.weekday
                  : `${parts.weekday}, ${parts.date}`;
        return shellHtml(
            widget,
            `<div class="ntp-w-clockface ntp-w-clockface--local${sizeCls}">
  <div class="ntp-w-clockface-cluster">
    <div class="ntp-w-clockface-icon">${clockfaceSvg('clock')}</div>
    <div class="ntp-w-clockface-copy">
      <span class="ntp-w-clockface-place">Local</span>
      <span class="ntp-w-clockface-time ntp-w-clock-time">${escapeHtml(parts.time)}</span>
      <span class="ntp-w-clockface-meta ntp-w-clock-date">${escapeHtml(dateText)}</span>
    </div>
  </div>
</div>`
        );
    }

    function renderWorldClock(widget) {
        const shape = widgetShape(widget);
        const d = shape.density;
        const sizeCls = ` ntp-w-clockface--${escapeHtml(d)}${shape.tall ? ' ntp-w-clockface--tall' : ''}${shape.wide ? ' ntp-w-clockface--wide' : ''}`;
        const city = displayCityName(widget.config, null) || String(widget.config?.city || '').trim();
        const tz = String(widget.config?.timezone || '').trim();

        if (!city || !tz) {
            return shellHtml(
                widget,
                `<div class="ntp-w-clockface ntp-w-clockface--world${sizeCls}">
  <div class="ntp-w-clockface-cluster">
    <div class="ntp-w-clockface-icon">${clockfaceSvg('globe')}</div>
    <div class="ntp-w-clockface-copy">
      <span class="ntp-w-clockface-place">World Clock</span>
      <span class="ntp-w-clockface-time">—</span>
      <span class="ntp-w-clockface-meta">Pick a city in Settings</span>
    </div>
  </div>
</div>`
            );
        }

        const parts = worldClockParts(tz, { ...(widget.config || {}), _shape: { ...shape, density: d } });
        const metaBits = [];
        if (parts.weekday) metaBits.push(parts.weekday);
        if ((shape.tall || shape.wide || d === 'lg' || d === 'md') && parts.date) metaBits.push(parts.date);
        if (parts.offset) metaBits.push(parts.offset);
        const meta =
            metaBits.length > 0
                ? `<span class="ntp-w-clockface-meta ntp-w-world-date">${escapeHtml(metaBits.join(' · '))}</span>`
                : '';

        return shellHtml(
            widget,
            `<div class="ntp-w-clockface ntp-w-clockface--world${sizeCls}" data-timezone="${escapeHtml(tz)}">
  <div class="ntp-w-clockface-cluster">
    <div class="ntp-w-clockface-icon">${clockfaceSvg('globe')}</div>
    <div class="ntp-w-clockface-copy">
      <span class="ntp-w-clockface-place ntp-w-world-city">${escapeHtml(city)}</span>
      <span class="ntp-w-clockface-time ntp-w-world-time">${escapeHtml(parts.time)}</span>
      ${meta}
    </div>
  </div>
</div>`
        );
    }

    /** Outline SVG icons matching the reference style. */
    function weatherSvg(kind) {
        const common = 'class="ntp-w-weather-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true"';
        if (kind === 'sun') {
            return `<svg ${common}>
  <circle cx="24" cy="24" r="8.5" stroke="currentColor" stroke-width="2.6"/>
  <path d="M24 6v4.5M24 37.5V42M6 24h4.5M37.5 24H42M12.2 12.2l3.2 3.2M32.6 32.6l3.2 3.2M12.2 35.8l3.2-3.2M32.6 15.4l3.2-3.2" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;
        }
        if (kind === 'partly') {
            return `<svg ${common}>
  <circle cx="30" cy="16" r="6" stroke="currentColor" stroke-width="2.4"/>
  <path d="M30 5.5v2.8M30 24.2v2.8M19.5 16h2.8M37.7 16h2.8M22.6 8.6l2 2M35.4 21.4l2 2M22.6 23.4l2-2M35.4 10.6l2-2" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M14.5 33.5c-3.8 0-6.8-2.9-6.8-6.5 0-3.4 2.6-6.2 6-6.6 1.2-3.6 4.6-6.2 8.6-6.2 4.5 0 8.2 3.2 8.9 7.5 3 .4 5.3 2.9 5.3 5.9 0 3.3-2.8 6-6.2 6H14.5z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
</svg>`;
        }
        if (kind === 'rain') {
            return `<svg ${common}>
  <path d="M14.5 28.5c-3.8 0-6.8-2.9-6.8-6.5 0-3.4 2.6-6.2 6-6.6 1.2-3.6 4.6-6.2 8.6-6.2 4.5 0 8.2 3.2 8.9 7.5 3 .4 5.3 2.9 5.3 5.9 0 3.3-2.8 6-6.2 6H14.5z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M18 33.5l-2 5M24 33.5l-2 5M30 33.5l-2 5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;
        }
        if (kind === 'snow') {
            return `<svg ${common}>
  <path d="M14.5 27c-3.8 0-6.8-2.9-6.8-6.5 0-3.4 2.6-6.2 6-6.6 1.2-3.6 4.6-6.2 8.6-6.2 4.5 0 8.2 3.2 8.9 7.5 3 .4 5.3 2.9 5.3 5.9 0 3.3-2.8 6-6.2 6H14.5z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M18 33.5h.01M24 36h.01M30 33.5h.01M21 38.5h.01M27 38.5h.01" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/>
</svg>`;
        }
        if (kind === 'storm') {
            return `<svg ${common}>
  <path d="M14.5 26.5c-3.8 0-6.8-2.9-6.8-6.5 0-3.4 2.6-6.2 6-6.6 1.2-3.6 4.6-6.2 8.6-6.2 4.5 0 8.2 3.2 8.9 7.5 3 .4 5.3 2.9 5.3 5.9 0 3.3-2.8 6-6.2 6H14.5z" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M23 29.5l-4 7h5.5l-3.5 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
        }
        if (kind === 'fog') {
            return `<svg ${common}>
  <path d="M10 18h28M8 24h32M12 30h24" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;
        }
        // cloud (default)
        return `<svg ${common}>
  <path d="M14.5 34c-4.2 0-7.5-3.2-7.5-7.2 0-3.7 2.9-6.8 6.6-7.2 1.3-4 5.1-6.8 9.5-6.8 4.9 0 9.1 3.5 9.8 8.2 3.3.4 5.8 3.2 5.8 6.5 0 3.6-3 6.5-6.8 6.5H14.5z" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round"/>
</svg>`;
    }

    function weatherKind(code, summary) {
        const c = Number(code);
        if (Number.isFinite(c)) {
            if (c === 0) return 'sun';
            if (c === 1) return 'partly';
            if (c === 2) return 'partly';
            if (c === 3) return 'cloud';
            if (c === 45 || c === 48) return 'fog';
            if (c >= 51 && c <= 67) return 'rain';
            if (c >= 71 && c <= 77) return 'snow';
            if (c >= 80 && c <= 82) return 'rain';
            if (c >= 95) return 'storm';
        }
        const t = String(summary || '').toLowerCase();
        if (/thunder|storm|lightning/.test(t)) return 'storm';
        if (/snow|sleet|blizzard|ice|hail/.test(t)) return 'snow';
        if (/rain|drizzle|shower|precip/.test(t)) return 'rain';
        if (/fog|mist|haze|smoke/.test(t)) return 'fog';
        if (/overcast/.test(t)) return 'cloud';
        if (/cloud|partly|broken/.test(t)) return /partly|broken|few/.test(t) ? 'partly' : 'cloud';
        if (/clear|sunny|fair|sun/.test(t)) return 'sun';
        return 'cloud';
    }

    function owmIdToCode(id) {
        const n = Number(id);
        if (!Number.isFinite(n)) return 3;
        if (n >= 200 && n < 300) return 95;
        if (n >= 300 && n < 400) return 51;
        if (n >= 500 && n < 600) return 61;
        if (n >= 600 && n < 700) return 71;
        if (n >= 700 && n < 800) return 45;
        if (n === 800) return 0;
        if (n === 801 || n === 802) return 2;
        if (n === 803 || n === 804) return 3;
        return 3;
    }

    function formatCityLabel(hit) {
        if (!hit) return '';
        const parts = [hit.name];
        if (hit.admin1 && hit.admin1 !== hit.name) parts.push(hit.admin1);
        if (hit.country) parts.push(hit.country);
        else if (hit.countryCode) parts.push(String(hit.countryCode).toUpperCase());
        return parts.filter(Boolean).join(', ');
    }

    function formatCityShort(hit) {
        if (!hit) return '';
        if (hit.countryCode) return `${hit.name}, ${String(hit.countryCode).toUpperCase()}`;
        if (hit.country) return `${hit.name}, ${hit.country}`;
        return hit.name || '';
    }

    async function searchCities(query, opts = {}) {
        const q = String(query || '').trim();
        if (q.length < 2) return [];
        const limitRaw =
            typeof opts === 'number'
                ? opts
                : opts && typeof opts === 'object'
                  ? opts.limit
                  : undefined;
        const limit = Math.min(20, Math.max(1, Number(limitRaw) || 12));

        const api =
            (typeof window !== 'undefined' && window.electronAPI) ||
            (typeof global !== 'undefined' && global.electronAPI) ||
            null;

        if (typeof api?.searchWeatherCities === 'function') {
            try {
                const res = await api.searchWeatherCities(q, limit);
                if (res?.ok && Array.isArray(res.results)) return res.results;
            } catch (_) {
                /* fall through */
            }
        }

        try {
            const geo = await fetchJson(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${limit}&language=en&format=json`
            );
            const results = Array.isArray(geo?.results) ? geo.results : [];
            return results.map((hit) => {
                const mapped = {
                    name: hit.name || '',
                    admin1: hit.admin1 || '',
                    country: hit.country || '',
                    countryCode: hit.country_code || '',
                    latitude: hit.latitude,
                    longitude: hit.longitude,
                    timezone: hit.timezone || ''
                };
                mapped.label = formatCityLabel(mapped);
                mapped.short = formatCityShort(mapped);
                return mapped;
            });
        } catch (_) {
            return [];
        }
    }

    function toDisplayTemp(celsius, unit) {
        if (celsius == null || Number.isNaN(Number(celsius))) return null;
        return unit === 'F' ? (Number(celsius) * 9) / 5 + 32 : Number(celsius);
    }

    function formatPrecipHint(hourly, code) {
        const probs = hourly?.precipitation_probability || [];
        const times = hourly?.time || [];
        const now = Date.now();
        const wet = Number(code) >= 51 && Number(code) <= 82;
        const label = Number(code) >= 71 && Number(code) <= 77 ? 'Snow' : 'Rain';

        for (let i = 0; i < Math.min(probs.length, 12); i++) {
            if (Number(probs[i]) < 40) continue;
            const t = new Date(times[i]).getTime();
            if (Number.isNaN(t)) continue;
            const mins = Math.round((t - now) / 60000);
            if (mins <= 5) return `${label} possible soon`;
            if (mins < 60) return `${label} possible in ${mins}m`;
            const hours = Math.round(mins / 60);
            if (hours <= 6) return `${label} possible in ${hours}h`;
            break;
        }

        if (wet) return 'Wet conditions ahead';
        if (Number(code) === 0 || Number(code) === 1) return 'Clear skies ahead';
        if (Number(code) === 2 || Number(code) === 3) return 'Clouds through the day';
        if (Number(code) === 45 || Number(code) === 48) return 'Low visibility';
        return '';
    }

    function weatherDetailLine(data, unit) {
        if (data?.detail) return data.detail;
        const hint = formatPrecipHint(data?.hourly, data?.code);
        if (hint) return hint;
        const hi = toDisplayTemp(data?.high, unit);
        const lo = toDisplayTemp(data?.low, unit);
        if (hi != null && lo != null) return `H ${Math.round(hi)}° · L ${Math.round(lo)}°`;
        return data?.city || '';
    }

    function normalizeProvider(raw) {
        const p = String(raw || 'weatherapi').trim().toLowerCase();
        if (p === 'open-meteo' || p === 'openmeteo') return 'openmeteo';
        if (p === 'openweathermap' || p === 'owm') return 'openweathermap';
        if (p === 'weatherapi') return 'weatherapi';
        if (p === 'wttr') return 'wttr';
        if (p === 'custom') return 'custom';
        return 'weatherapi';
    }

    function weatherCodeFromText(text) {
        const t = String(text || '').toLowerCase();
        if (/thunder|storm/.test(t)) return 95;
        if (/snow|sleet|blizzard|ice/.test(t)) return 71;
        if (/rain|drizzle|shower|precip/.test(t)) return 61;
        if (/fog|mist|haze/.test(t)) return 45;
        if (/partly|broken|few/.test(t)) return 2;
        if (/overcast|cloud/.test(t)) return 3;
        if (/clear|sunny|fair/.test(t)) return 0;
        return 3;
    }

    function mapWttrCode(code) {
        const c = Number(code);
        if (!Number.isFinite(c)) return 3;
        if (c === 113) return 0;
        if (c === 116) return 2;
        if (c === 119 || c === 122) return 3;
        if (c === 143 || c === 248 || c === 260) return 45;
        if (c >= 176 && c <= 377) return 61;
        if (c >= 179 && c <= 395 && [179, 182, 185, 227, 230, 281, 284, 311, 314, 317, 320, 323, 326, 329, 332, 335, 338, 350, 368, 371, 374, 377].includes(c))
            return 71;
        if (c >= 200 && c <= 395 && /thund|storm/i.test(String(c))) return 95;
        if ([200, 386, 389, 392, 395].includes(c)) return 95;
        if ([227, 230, 320, 323, 326, 329, 332, 335, 338, 368, 371].includes(c)) return 71;
        if ([176, 263, 266, 281, 284, 293, 296, 299, 302, 305, 308, 311, 314, 353, 356, 359, 362, 365].includes(c))
            return 61;
        return 3;
    }

    async function fetchJson(url) {
        const bridge = typeof global !== 'undefined' && global.electronAPI?.fetchText
            ? global.electronAPI.fetchText
            : typeof window !== 'undefined' && window.electronAPI?.fetchText
              ? window.electronAPI.fetchText
              : null;
        if (typeof bridge === 'function') {
            const res = await bridge(url);
            if (!res?.ok) throw new Error(res?.error || 'fetch-failed');
            return JSON.parse(String(res.text || '{}'));
        }
        const res = await fetch(url, {
            headers: {
                Accept: 'application/json',
                'User-Agent': 'AxisBrowser-Weather'
            }
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    function fillWeatherUrl(template, { city, key, unit }) {
        return String(template || '')
            .replaceAll('{city}', encodeURIComponent(city))
            .replaceAll('{City}', encodeURIComponent(city))
            .replaceAll('{key}', encodeURIComponent(key || ''))
            .replaceAll('{apiKey}', encodeURIComponent(key || ''))
            .replaceAll('{unit}', unit === 'F' ? 'imperial' : 'metric');
    }

    async function fetchWttr(city) {
        const path = encodeURIComponent(city).replace(/%20/g, '+');
        const data = await fetchJson(`https://wttr.in/${path}?format=j1`);
        const cur = data?.current_condition?.[0];
        const area = data?.nearest_area?.[0];
        if (!cur) throw new Error('No weather');
        const desc = cur.weatherDesc?.[0]?.value || '';
        const code = mapWttrCode(cur.weatherCode) || weatherCodeFromText(desc);
        const place =
            area?.areaName?.[0]?.value ||
            area?.region?.[0]?.value ||
            city;
        const country = area?.country?.[0]?.value;
        const forecast = data?.weather?.[0];
        return {
            summary: WMO[code] || desc.split(',')[0] || '—',
            temp: Number(cur.temp_C),
            high: forecast?.maxtempC != null ? Number(forecast.maxtempC) : null,
            low: forecast?.mintempC != null ? Number(forecast.mintempC) : null,
            city: country ? `${place}` : place,
            placeLabel: country ? `${place}, ${country}` : place,
            code,
            detail: desc || ''
        };
    }

    async function fetchOpenMeteo(config, city) {
        let lat = Number(config?.latitude);
        let lon = Number(config?.longitude);
        let placeName = String(config?.placeLabel || city).trim() || city;

        if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
            const geo = await fetchJson(
                `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`
            );
            const results = Array.isArray(geo?.results) ? geo.results : [];
            const needle = city.toLowerCase();
            const hit =
                results.find((r) => String(r?.name || '').toLowerCase() === needle) ||
                results.find((r) => String(r?.name || '').toLowerCase().startsWith(needle)) ||
                results[0];
            if (!hit) throw new Error('notfound');
            lat = hit.latitude;
            lon = hit.longitude;
            placeName = hit.country_code
                ? `${hit.name}, ${String(hit.country_code).toUpperCase()}`
                : hit.name;
        }

        const wx = await fetchJson(
            `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&hourly=precipitation_probability&daily=temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=1`
        );
        const cur = wx?.current;
        const code = cur?.weather_code ?? 3;
        return {
            summary: WMO[code] || '—',
            temp: cur?.temperature_2m,
            high: wx?.daily?.temperature_2m_max?.[0],
            low: wx?.daily?.temperature_2m_min?.[0],
            city: placeName,
            code,
            hourly: {
                time: wx?.hourly?.time || [],
                precipitation_probability: wx?.hourly?.precipitation_probability || []
            },
            detail: formatPrecipHint(
                {
                    time: wx?.hourly?.time || [],
                    precipitation_probability: wx?.hourly?.precipitation_probability || []
                },
                code
            )
        };
    }

    async function fetchOpenWeatherMap(config, city, key, unit) {
        if (!key) throw new Error('apikey');
        const units = unit === 'F' ? 'imperial' : 'metric';
        let url;
        const lat = Number(config?.latitude);
        const lon = Number(config?.longitude);
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${encodeURIComponent(key)}&units=${units}`;
        } else {
            url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${encodeURIComponent(key)}&units=${units}`;
        }
        const data = await fetchJson(url);
        if (data?.cod && Number(data.cod) !== 200) throw new Error('notfound');
        const desc = data?.weather?.[0]?.description || '';
        const main = data?.weather?.[0]?.main || '';
        const code = owmIdToCode(data?.weather?.[0]?.id) || weatherCodeFromText(`${main} ${desc}`);
        const tempC =
            unit === 'F' && data?.main?.temp != null
                ? ((Number(data.main.temp) - 32) * 5) / 9
                : data?.main?.temp;
        return {
            summary: WMO[code] || main || '—',
            temp: tempC,
            high:
                data?.main?.temp_max != null
                    ? unit === 'F'
                        ? ((Number(data.main.temp_max) - 32) * 5) / 9
                        : data.main.temp_max
                    : null,
            low:
                data?.main?.temp_min != null
                    ? unit === 'F'
                        ? ((Number(data.main.temp_min) - 32) * 5) / 9
                        : data.main.temp_min
                    : null,
            city: data?.name || city,
            placeLabel: data?.sys?.country ? `${data.name}, ${data.sys.country}` : data?.name || city,
            code,
            detail: desc ? desc.charAt(0).toUpperCase() + desc.slice(1) : ''
        };
    }

    async function fetchWeatherApi(config, city, key) {
        if (!key) throw new Error('apikey');
        const lat = Number(config?.latitude);
        const lon = Number(config?.longitude);
        const q =
            Number.isFinite(lat) && Number.isFinite(lon) ? `${lat},${lon}` : city;
        const data = await fetchJson(
            `https://api.weatherapi.com/v1/forecast.json?key=${encodeURIComponent(key)}&q=${encodeURIComponent(q)}&days=1&aqi=no&alerts=no`
        );
        const cur = data?.current;
        const loc = data?.location;
        if (!cur) throw new Error('notfound');
        const desc = cur.condition?.text || '';
        const code = weatherCodeFromText(desc);
        const day = data?.forecast?.forecastday?.[0]?.day;
        return {
            summary: WMO[code] || desc || '—',
            temp: cur.temp_c,
            high: day?.maxtemp_c ?? null,
            low: day?.mintemp_c ?? null,
            city: loc?.name || city,
            placeLabel: loc?.country ? `${loc.name}, ${loc.country}` : loc?.name || city,
            code,
            detail: desc
        };
    }

    async function fetchCustomWeather(config, city, unit) {
        const key = String(config?.apiKey || '').trim();
        const template = String(config?.customUrl || '').trim();
        if (!template) throw new Error('customurl');
        const url = fillWeatherUrl(template, { city, key, unit });
        const data = await fetchJson(url);

        if (data?.current_condition?.[0]) {
            const cur = data.current_condition[0];
            const area = data?.nearest_area?.[0];
            const desc = cur.weatherDesc?.[0]?.value || '';
            const code = mapWttrCode(cur.weatherCode) || weatherCodeFromText(desc);
            const place = area?.areaName?.[0]?.value || city;
            return {
                summary: WMO[code] || desc || '—',
                temp: Number(cur.temp_C),
                city: place,
                code,
                detail: desc
            };
        }
        if (data?.current?.temp_c != null || data?.current?.condition) {
            const cur = data.current;
            const desc = cur.condition?.text || '';
            const code = weatherCodeFromText(desc);
            return {
                summary: WMO[code] || desc || '—',
                temp: cur.temp_c ?? cur.temp_C,
                city: data.location?.name || city,
                code,
                detail: desc
            };
        }
        if (data?.main?.temp != null) {
            const desc = data.weather?.[0]?.description || data.weather?.[0]?.main || '';
            const code = weatherCodeFromText(desc);
            const metric = !/imperial|units=imperial/i.test(template);
            const tempC = metric ? data.main.temp : ((Number(data.main.temp) - 32) * 5) / 9;
            return {
                summary: WMO[code] || data.weather?.[0]?.main || '—',
                temp: tempC,
                city: data.name || city,
                code,
                detail: desc
            };
        }
        if (data?.current?.temperature_2m != null) {
            const code = data.current.weather_code ?? 3;
            return {
                summary: WMO[code] || '—',
                temp: data.current.temperature_2m,
                city,
                code
            };
        }
        const temp = data.temp ?? data.temperature ?? data.temp_c ?? data.tempC ?? data?.data?.temp;
        const summary = data.summary ?? data.condition ?? data.description ?? data.weather ?? '—';
        if (temp == null) throw new Error('parse');
        return {
            summary: String(summary),
            temp: Number(temp),
            city,
            code: weatherCodeFromText(summary)
        };
    }

    function displayCityName(config, data) {
        const fromConfig = String(config?.city || '').trim();
        if (fromConfig) return fromConfig;
        const labeled = String(config?.placeLabel || data?.placeLabel || data?.city || '').trim();
        if (!labeled) return '';
        return labeled.split(',')[0].trim() || labeled;
    }

    function renderWeather(widget, data) {
        const unit = String(widget.config?.unit || 'C').toUpperCase() === 'F' ? 'F' : 'C';
        const configuredCity = String(widget.config?.city || '').trim();
        const shape = widgetShape(widget);
        const d = shape.density;
        const sizeCls = ` ntp-w-weather--${escapeHtml(d)}${shape.tall ? ' ntp-w-weather--tall' : ''}${shape.wide ? ' ntp-w-weather--wide' : ''}`;

        const wrap = (kind, copyHtml) =>
            shellHtml(
                widget,
                `<div class="ntp-w-weather${sizeCls}" data-weather-kind="${escapeHtml(kind)}">
  <div class="ntp-w-weather-cluster">
    <div class="ntp-w-weather-icon">${weatherSvg(kind)}</div>
    <div class="ntp-w-weather-copy">${copyHtml}</div>
  </div>
</div>`
            );

        if (!configuredCity || data?.needsSetup) {
            return wrap(
                'cloud',
                `<span class="ntp-w-weather-place">Weather</span>
    <span class="ntp-w-weather-primary">No city yet</span>
    <span class="ntp-w-weather-secondary">Pick a city in Settings</span>`
            );
        }

        if (data?.notFound || data?.error) {
            const failCity = displayCityName(widget.config, data) || configuredCity;
            return wrap(
                'cloud',
                `<span class="ntp-w-weather-place">${escapeHtml(failCity)}</span>
    <span class="ntp-w-weather-primary">${escapeHtml(data?.summary || 'Unavailable')}</span>
    <span class="ntp-w-weather-secondary">${escapeHtml(data?.detail || 'Pick a city in Settings')}</span>`
            );
        }

        const tempVal = toDisplayTemp(data?.temp, unit);
        const temp = tempVal != null ? `${Math.round(tempVal)}°` : '—';
        const summary = data?.summary || '—';
        const kind = weatherKind(data?.code ?? 3, data?.summary || data?.detail);
        const cityName = displayCityName(widget.config, data) || configuredCity;
        const hiVal = toDisplayTemp(data?.high, unit);
        const loVal = toDisplayTemp(data?.low, unit);
        const detail = formatPrecipHint(data?.hourly, data?.code);
        const hasHilo = hiVal != null && loVal != null;
        const hiloText = hasHilo ? `H ${Math.round(hiVal)}° · L ${Math.round(loVal)}°` : '';
        // Mid / compact tiles: prefer high–low over soft status lines like “Clear skies ahead”.
        // Tall / wide / large: can show the status line and keep high–low too.
        const roomy = shape.tall || shape.wide || d === 'lg';

        let secondary = '';
        let hilo = '';
        if (roomy) {
            if (detail) {
                secondary = `<span class="ntp-w-weather-secondary">${escapeHtml(detail)}</span>`;
            }
            if (hiloText) {
                hilo = `<span class="ntp-w-weather-hilo">${escapeHtml(hiloText)}</span>`;
            }
        } else if (hiloText) {
            secondary = `<span class="ntp-w-weather-secondary">${escapeHtml(hiloText)}</span>`;
        } else if (detail) {
            secondary = `<span class="ntp-w-weather-secondary">${escapeHtml(detail)}</span>`;
        }

        return wrap(
            kind,
            `<span class="ntp-w-weather-place">${escapeHtml(cityName)}</span>
    <span class="ntp-w-weather-primary">${escapeHtml(`${summary}, ${temp}`)}</span>
    ${secondary}
    ${hilo}`
        );
    }

    async function fetchWeather(config) {
        const city = String(config?.city || '').trim();
        if (!city) {
            return { needsSetup: true, city: '', summary: '', temp: null, code: 3 };
        }
        try {
            return await fetchOpenMeteo(config, city);
        } catch (err) {
            const msg = String(err?.message || err || '');
            if (msg === 'notfound') {
                return {
                    notFound: true,
                    summary: 'City not found',
                    detail: 'Pick another city in Settings',
                    temp: null,
                    city,
                    code: 3
                };
            }
            return {
                error: true,
                summary: 'Unavailable',
                detail: 'Check your connection',
                temp: null,
                city,
                code: 3
            };
        }
    }

    function normalizeMarketSymbols(raw) {
        const list = Array.isArray(raw)
            ? raw
            : String(raw || '')
                  .split(/[\s,;]+/)
                  .map((s) => s.trim())
                  .filter(Boolean);
        const out = [];
        const seen = new Set();
        for (const item of list) {
            let sym = String(item || '')
                .trim()
                .toUpperCase()
                .replace(/^\$/, '');
            if (!sym) continue;
            const CRYPTO_MAP = {
                BTC: 'BTC-USD',
                ETH: 'ETH-USD',
                SOL: 'SOL-USD',
                DOGE: 'DOGE-USD',
                XRP: 'XRP-USD',
                ADA: 'ADA-USD',
                AVAX: 'AVAX-USD',
                MATIC: 'MATIC-USD',
                DOT: 'DOT-USD',
                LINK: 'LINK-USD',
                BNB: 'BNB-USD'
            };
            if (CRYPTO_MAP[sym]) sym = CRYPTO_MAP[sym];
            if (!/^[A-Z0-9.^|=-]{1,16}$/.test(sym)) continue;
            if (seen.has(sym)) continue;
            seen.add(sym);
            out.push(sym);
            if (out.length >= 8) break;
        }
        return out;
    }

    function aqiLabelUS(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return { label: '—', kind: 'unknown' };
        if (v <= 50) return { label: 'Good', kind: 'good' };
        if (v <= 100) return { label: 'Moderate', kind: 'moderate' };
        if (v <= 150) return { label: 'Unhealthy (sensitive)', kind: 'usg' };
        if (v <= 200) return { label: 'Unhealthy', kind: 'unhealthy' };
        if (v <= 300) return { label: 'Very unhealthy', kind: 'very' };
        return { label: 'Hazardous', kind: 'hazard' };
    }

    function aqiLabelEU(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return { label: '—', kind: 'unknown' };
        if (v <= 20) return { label: 'Good', kind: 'good' };
        if (v <= 40) return { label: 'Fair', kind: 'moderate' };
        if (v <= 60) return { label: 'Moderate', kind: 'usg' };
        if (v <= 80) return { label: 'Poor', kind: 'unhealthy' };
        if (v <= 100) return { label: 'Very poor', kind: 'very' };
        return { label: 'Extremely poor', kind: 'hazard' };
    }

    function airSvg(kind) {
        const common = 'class="ntp-w-aq-svg" viewBox="0 0 48 48" fill="none" aria-hidden="true"';
        return `<svg ${common}>
  <path d="M8 20c4-6 10-6 14 0s10 6 14 0M8 30c4-6 10-6 14 0s10 6 14 0" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>
</svg>`;
    }

    async function resolveCityCoords(config, city) {
        let lat = Number(config?.latitude);
        let lon = Number(config?.longitude);
        let placeName = String(config?.placeLabel || city).trim() || city;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { lat, lon, placeName };
        }
        const geo = await fetchJson(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`
        );
        const results = Array.isArray(geo?.results) ? geo.results : [];
        const needle = city.toLowerCase();
        const hit =
            results.find((r) => String(r?.name || '').toLowerCase() === needle) ||
            results.find((r) => String(r?.name || '').toLowerCase().startsWith(needle)) ||
            results[0];
        if (!hit) throw new Error('notfound');
        return {
            lat: hit.latitude,
            lon: hit.longitude,
            placeName: hit.country_code
                ? `${hit.name}, ${String(hit.country_code).toUpperCase()}`
                : hit.name
        };
    }

    async function fetchAirQuality(config) {
        const city = String(config?.city || '').trim();
        if (!city) return { needsSetup: true };
        try {
            const { lat, lon, placeName } = await resolveCityCoords(config, city);
            const aq = await fetchJson(
                `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}&current=european_aqi,us_aqi,pm2_5,pm10`
            );
            const cur = aq?.current || {};
            const scale = config?.scale === 'eu' ? 'eu' : 'us';
            const aqi = scale === 'eu' ? cur.european_aqi : cur.us_aqi ?? cur.european_aqi;
            const meta = scale === 'eu' ? aqiLabelEU(aqi) : aqiLabelUS(aqi);
            return {
                city: placeName,
                placeLabel: placeName,
                aqi: aqi != null ? Math.round(Number(aqi)) : null,
                scale,
                label: meta.label,
                kind: meta.kind,
                pm25: cur.pm2_5 != null ? Math.round(Number(cur.pm2_5)) : null,
                pm10: cur.pm10 != null ? Math.round(Number(cur.pm10)) : null
            };
        } catch (err) {
            const msg = String(err?.message || err || '');
            if (msg === 'notfound') {
                return { notFound: true, summary: 'City not found', detail: 'Pick another city in Settings' };
            }
            return { error: true, summary: 'Unavailable', detail: 'Check your connection' };
        }
    }

    function renderAirQuality(widget, data = {}) {
        const shape = widgetShape(widget);
        const d = shape.density;
        const sizeCls = ` ntp-w-aq--${escapeHtml(d)}${shape.tall ? ' ntp-w-aq--tall' : ''}${shape.wide ? ' ntp-w-aq--wide' : ''}`;
        const configuredCity = String(widget.config?.city || '').trim();
        const kind = data?.kind || 'unknown';

        if (data?.loading) {
            return shellHtml(
                widget,
                `<div class="ntp-w-aq${sizeCls}" data-aq-kind="unknown" aria-busy="true">
  <div class="ntp-w-aq-cluster">
    <div class="ntp-w-aq-icon">${airSvg()}</div>
    <div class="ntp-w-aq-copy">
      <span class="ntp-w-aq-place">Air Quality</span>
      <span class="ntp-w-aq-primary">Loading…</span>
      <span class="ntp-w-aq-secondary">Fetching AQI</span>
    </div>
  </div>
</div>`
            );
        }

        if (!configuredCity) {
            return shellHtml(
                widget,
                `<div class="ntp-w-aq${sizeCls}" data-aq-kind="unknown">
  <div class="ntp-w-aq-cluster">
    <div class="ntp-w-aq-icon">${airSvg()}</div>
    <div class="ntp-w-aq-copy">
      <span class="ntp-w-aq-place">Air Quality</span>
      <span class="ntp-w-aq-primary">No city yet</span>
      <span class="ntp-w-aq-secondary">Pick a city in Settings</span>
    </div>
  </div>
</div>`
            );
        }

        if (data?.notFound || data?.error) {
            return shellHtml(
                widget,
                `<div class="ntp-w-aq${sizeCls}" data-aq-kind="unknown">
  <div class="ntp-w-aq-cluster">
    <div class="ntp-w-aq-icon">${airSvg()}</div>
    <div class="ntp-w-aq-copy">
      <span class="ntp-w-aq-place">${escapeHtml(displayCityName(widget.config, data) || configuredCity)}</span>
      <span class="ntp-w-aq-primary">${escapeHtml(data?.summary || 'Unavailable')}</span>
      <span class="ntp-w-aq-secondary">${escapeHtml(data?.detail || '')}</span>
    </div>
  </div>
</div>`
            );
        }

        const cityName = displayCityName(widget.config, data) || configuredCity;
        const aqi = data?.aqi != null ? String(data.aqi) : '—';
        const label = data?.label || '—';
        const scaleTag = data?.scale === 'eu' ? 'EU AQI' : 'US AQI';
        const bits = [];
        if (data?.pm25 != null) bits.push(`PM2.5 ${data.pm25}`);
        if ((shape.tall || shape.wide || d === 'lg' || d === 'md') && data?.pm10 != null) {
            bits.push(`PM10 ${data.pm10}`);
        }
        const secondary =
            bits.length > 0
                ? bits.join(' · ')
                : scaleTag;

        return shellHtml(
            widget,
            `<div class="ntp-w-aq${sizeCls}" data-aq-kind="${escapeHtml(kind)}">
  <div class="ntp-w-aq-cluster">
    <div class="ntp-w-aq-icon">${airSvg(kind)}</div>
    <div class="ntp-w-aq-copy">
      <span class="ntp-w-aq-place">${escapeHtml(cityName)}</span>
      <span class="ntp-w-aq-primary">${escapeHtml(aqi)} <span class="ntp-w-aq-label">${escapeHtml(label)}</span></span>
      <span class="ntp-w-aq-secondary">${escapeHtml(secondary)}</span>
    </div>
  </div>
</div>`
        );
    }

    function formatMarketPrice(n) {
        const v = Number(n);
        if (!Number.isFinite(v)) return '—';
        if (Math.abs(v) >= 1000) {
            return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
        }
        if (Math.abs(v) >= 1) {
            return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        }
        return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 });
    }

    function formatMarketChange(pct) {
        const v = Number(pct);
        if (!Number.isFinite(v)) return '';
        const sign = v > 0 ? '+' : '';
        return `${sign}${v.toFixed(2)}%`;
    }

    function displayMarketSymbol(sym) {
        return String(sym || '').replace(/-USD$/i, '');
    }

    async function fetchYahooQuote(symbol) {
        const sym = encodeURIComponent(symbol);
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=5d`;
        const data = await fetchJson(url);
        const result = data?.chart?.result?.[0];
        if (!result) throw new Error('noquote');
        const meta = result.meta || {};
        const closes = result.indicators?.quote?.[0]?.close || [];
        const price =
            meta.regularMarketPrice != null
                ? Number(meta.regularMarketPrice)
                : closes.filter((x) => x != null).slice(-1)[0];
        const prev =
            meta.chartPreviousClose != null
                ? Number(meta.chartPreviousClose)
                : closes.filter((x) => x != null).slice(-2, -1)[0];
        let changePct = null;
        if (Number.isFinite(price) && Number.isFinite(prev) && prev !== 0) {
            changePct = ((price - prev) / prev) * 100;
        }
        return {
            symbol,
            short: displayMarketSymbol(symbol),
            price,
            changePct,
            currency: meta.currency || 'USD'
        };
    }

    async function fetchMarkets(config) {
        const symbols = normalizeMarketSymbols(config?.symbols);
        if (!symbols.length) return { needsSetup: true, quotes: [] };
        const quotes = [];
        for (const symbol of symbols) {
            try {
                quotes.push(await fetchYahooQuote(symbol));
            } catch (_) {
                quotes.push({
                    symbol,
                    short: displayMarketSymbol(symbol),
                    price: null,
                    changePct: null,
                    error: true
                });
            }
        }
        return { quotes };
    }

    function renderMarkets(widget, data = {}) {
        const shape = widgetShape(widget);
        const d = shape.density;
        const sizeCls = ` ntp-w-markets--${escapeHtml(d)}${shape.tall ? ' ntp-w-markets--tall' : ''}${shape.wide ? ' ntp-w-markets--wide' : ''}`;
        const symbols = normalizeMarketSymbols(widget.config?.symbols);

        if (data?.loading) {
            return shellHtml(
                widget,
                `<div class="ntp-w-markets${sizeCls}" aria-busy="true">
  <div class="ntp-w-markets-head">Markets</div>
  <div class="ntp-w-markets-empty">Loading quotes…</div>
</div>`
            );
        }

        if (!symbols.length || data?.needsSetup) {
            return shellHtml(
                widget,
                `<div class="ntp-w-markets${sizeCls}">
  <div class="ntp-w-markets-head">Markets</div>
  <div class="ntp-w-markets-empty">Add symbols in Settings<br><span class="ntp-w-markets-hint">e.g. AAPL, BTC, ETH</span></div>
</div>`
            );
        }

        const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
        const maxRows = shape.area <= 1 ? 2 : shape.area <= 2 ? 3 : shape.area <= 4 ? 5 : 8;
        const rows = (quotes.length ? quotes : symbols.map((s) => ({ symbol: s, short: displayMarketSymbol(s) })))
            .slice(0, maxRows)
            .map((q) => {
                const up = Number(q.changePct) > 0;
                const down = Number(q.changePct) < 0;
                const dir = up ? 'up' : down ? 'down' : 'flat';
                const ch = formatMarketChange(q.changePct);
                const price = q.error ? '—' : formatMarketPrice(q.price);
                return `<div class="ntp-w-markets-row" data-dir="${dir}">
  <span class="ntp-w-markets-sym">${escapeHtml(q.short || displayMarketSymbol(q.symbol))}</span>
  <span class="ntp-w-markets-price">${escapeHtml(price)}</span>
  <span class="ntp-w-markets-chg">${escapeHtml(ch || '—')}</span>
</div>`;
            })
            .join('');

        return shellHtml(
            widget,
            `<div class="ntp-w-markets${sizeCls}">
  <div class="ntp-w-markets-head">Markets</div>
  <div class="ntp-w-markets-list">${rows}</div>
</div>`
        );
    }

    function calendarMonthMatrix(year, month, weekStartsOn) {
        const start = weekStartsOn === 1 ? 1 : 0;
        const first = new Date(year, month, 1);
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const lead = (first.getDay() - start + 7) % 7;
        const cells = [];
        for (let i = 0; i < lead; i++) cells.push(null);
        for (let d = 1; d <= daysInMonth; d++) cells.push(d);
        while (cells.length % 7 !== 0) cells.push(null);
        // Prefer 5 weeks when possible; only pad to 6 if needed.
        if (cells.length > 35) {
            while (cells.length < 42) cells.push(null);
        }
        return cells;
    }

    function calendarViewMode(shape) {
        // Full month needs real height — small tiles get a clean day / week card instead.
        if (shape.rows >= 2 && shape.cols >= 2) return 'month';
        if (shape.cols >= 2 && shape.rows === 1) return 'week';
        return 'day';
    }

    function currentWeekDays(weekStartsOn, now = new Date()) {
        const start = weekStartsOn === 1 ? 1 : 0;
        const day = now.getDay();
        const diff = (day - start + 7) % 7;
        const mondayish = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
        const out = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(mondayish.getFullYear(), mondayish.getMonth(), mondayish.getDate() + i);
            out.push(d);
        }
        return out;
    }

    function renderCalendar(widget, view = null) {
        const shape = widgetShape(widget);
        const d = shape.density;
        const mode = calendarViewMode(shape);
        const sizeCls = ` ntp-w-cal--${escapeHtml(d)} ntp-w-cal--mode-${mode}${shape.tall ? ' ntp-w-cal--tall' : ''}${shape.wide ? ' ntp-w-cal--wide' : ''}`;
        const weekStartsOn = Number(widget.config?.weekStartsOn) === 1 ? 1 : 0;
        const now = new Date();
        const year = view?.year != null ? Number(view.year) : now.getFullYear();
        const month = view?.month != null ? Number(view.month) : now.getMonth();
        const title = new Date(year, month, 1).toLocaleDateString([], { month: 'long', year: 'numeric' });
        const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();
        const today = now.getDate();
        const wid = escapeHtml(widget.id);

        if (mode === 'day') {
            return shellHtml(
                widget,
                `<div class="ntp-w-cal${sizeCls}">
  <div class="ntp-w-cal-daycard">
    <span class="ntp-w-cal-weekday">${escapeHtml(now.toLocaleDateString([], { weekday: 'long' }))}</span>
    <span class="ntp-w-cal-daynum">${escapeHtml(String(today))}</span>
    <span class="ntp-w-cal-month">${escapeHtml(now.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</span>
  </div>
</div>`
            );
        }

        if (mode === 'week') {
            const labels =
                weekStartsOn === 1
                    ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                    : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
            const days = currentWeekDays(weekStartsOn, now);
            const head = labels.map((l) => `<span class="ntp-w-cal-dow">${l}</span>`).join('');
            const cells = days
                .map((dt) => {
                    const isToday =
                        dt.getFullYear() === now.getFullYear() &&
                        dt.getMonth() === now.getMonth() &&
                        dt.getDate() === now.getDate();
                    return `<span class="ntp-w-cal-cell${isToday ? ' is-today' : ''}">${dt.getDate()}</span>`;
                })
                .join('');
            return shellHtml(
                widget,
                `<div class="ntp-w-cal${sizeCls}">
  <div class="ntp-w-cal-weekhead">${escapeHtml(now.toLocaleDateString([], { month: 'long', year: 'numeric' }))}</div>
  <div class="ntp-w-cal-grid ntp-w-cal-grid--week">
    ${head}
    ${cells}
  </div>
</div>`
            );
        }

        const labels =
            weekStartsOn === 1
                ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
        const cells = calendarMonthMatrix(year, month, weekStartsOn);
        const headCells = labels.map((l) => `<span class="ntp-w-cal-dow">${l}</span>`).join('');
        const dayCells = cells
            .map((day) => {
                if (day == null) return `<span class="ntp-w-cal-cell is-empty" aria-hidden="true"></span>`;
                const isToday = isCurrentMonth && day === today;
                return `<span class="ntp-w-cal-cell${isToday ? ' is-today' : ''}">${day}</span>`;
            })
            .join('');

        return shellHtml(
            widget,
            `<div class="ntp-w-cal${sizeCls}" data-cal-year="${year}" data-cal-month="${month}">
  <div class="ntp-w-cal-toolbar">
    <button type="button" class="ntp-w-cal-nav" data-ntp-cal-nav="prev" data-widget-id="${wid}" aria-label="Previous month">‹</button>
    <button type="button" class="ntp-w-cal-title" data-ntp-cal-today data-widget-id="${wid}" title="Jump to today">${escapeHtml(title)}</button>
    <button type="button" class="ntp-w-cal-nav" data-ntp-cal-nav="next" data-widget-id="${wid}" aria-label="Next month">›</button>
  </div>
  <div class="ntp-w-cal-grid ntp-w-cal-grid--month">
    ${headCells}
    ${dayCells}
  </div>
</div>`
        );
    }

    async function searchTickers(query, opts = {}) {
        const q = String(query || '').trim();
        if (q.length < 1) return [];
        const limit = Math.min(12, Math.max(1, Number(opts.limit) || 8));
        const api =
            (typeof window !== 'undefined' && window.electronAPI) ||
            (typeof global !== 'undefined' && global.electronAPI) ||
            null;
        if (typeof api?.searchTickers === 'function') {
            try {
                const res = await api.searchTickers(q, limit);
                if (res?.ok && Array.isArray(res.results)) return res.results;
            } catch (_) {
                /* fall through */
            }
        }
        try {
            const data = await fetchJson(
                `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0&listsCount=0`
            );
            const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
            return quotes
                .map((hit) => {
                    const symbol = String(hit.symbol || '').toUpperCase();
                    if (!symbol) return null;
                    return {
                        symbol,
                        name: hit.shortname || hit.longname || hit.name || symbol,
                        type: hit.quoteType || hit.typeDisp || '',
                        exch: hit.exchDisp || hit.exchange || ''
                    };
                })
                .filter(Boolean)
                .slice(0, limit);
        } catch (_) {
            return [];
        }
    }

    function defaultConfig(type, prefs = {}) {
        const config = {};
        if (type === 'weather') {
            config.city = prefs.city != null ? String(prefs.city) : '';
            config.unit = prefs.unit === 'F' ? 'F' : 'C';
            if (prefs.latitude != null) config.latitude = Number(prefs.latitude);
            if (prefs.longitude != null) config.longitude = Number(prefs.longitude);
            if (prefs.placeLabel) config.placeLabel = String(prefs.placeLabel);
        } else if (type === 'worldclock') {
            config.city = prefs.city != null ? String(prefs.city) : '';
            config.timezone = prefs.timezone != null ? String(prefs.timezone) : '';
            config.hour12 = prefs.hour12 === false ? false : true;
            if (prefs.latitude != null) config.latitude = Number(prefs.latitude);
            if (prefs.longitude != null) config.longitude = Number(prefs.longitude);
            if (prefs.placeLabel) config.placeLabel = String(prefs.placeLabel);
        } else if (type === 'clock') {
            config.hour12 = prefs.hour12 === false ? false : true;
        } else if (type === 'airquality') {
            config.city = prefs.city != null ? String(prefs.city) : '';
            config.scale = prefs.scale === 'eu' ? 'eu' : 'us';
            if (prefs.latitude != null) config.latitude = Number(prefs.latitude);
            if (prefs.longitude != null) config.longitude = Number(prefs.longitude);
            if (prefs.placeLabel) config.placeLabel = String(prefs.placeLabel);
        } else if (type === 'markets') {
            config.symbols = normalizeMarketSymbols(
                prefs.symbols != null ? prefs.symbols : ['AAPL', 'MSFT', 'BTC-USD', 'ETH-USD']
            );
        } else if (type === 'calendar') {
            config.weekStartsOn = Number(prefs.weekStartsOn) === 1 ? 1 : 0;
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
                const trial = { id: '__new', type: 'weather', col, row, colSpan, rowSpan, config: {} };
                if (canPlace(layout, trial, col, row, '__new')) {
                    return { col, row };
                }
            }
        }
        return null;
    }

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
            t === 'worldclock' ||
            t === 'clock' ||
            t === 'airquality' ||
            t === 'markets' ||
            t === 'calendar'
        );
    }

    function isAsyncType(type) {
        const t = resolveType(type);
        return t === 'weather' || t === 'airquality' || t === 'markets';
    }

    function isLiveType(type) {
        const t = resolveType(type);
        return t === 'clock' || t === 'worldclock';
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
        renderWeather,
        renderClock,
        renderWorldClock,
        renderAirQuality,
        renderMarkets,
        renderCalendar,
        clockParts,
        worldClockParts,
        fetchWeather,
        fetchAirQuality,
        fetchMarkets,
        normalizeMarketSymbols,
        displayMarketSymbol,
        searchCities,
        searchTickers,
        normalizeProvider,
        formatCityLabel,
        escapeHtml,
        isAsyncType,
        isLiveType,
        needsResizeRefresh,
        widgetShape
    };

    global.AxisNtpWidgets = api;
})(typeof window !== 'undefined' ? window : globalThis);
