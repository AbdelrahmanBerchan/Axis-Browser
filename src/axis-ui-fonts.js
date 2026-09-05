'use strict';

/**
 * Axis UI font catalog (shell + Settings chrome only — never guest websites).
 * Single source of truth for main, renderer, and Settings.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.AxisUiFonts = api;
  if (typeof globalThis !== 'undefined') globalThis.AxisUiFonts = api;
  // Load Google Fonts as soon as this script runs in a browser document.
  try {
    if (typeof document !== 'undefined' && document.head) {
      api.ensureStylesheets(document);
    }
  } catch (_) {}
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  /**
   * @typedef {{
   *   id: string,
   *   label: string,
   *   labelKey?: string,
   *   category: 'system' | 'sans' | 'serif' | 'mono',
   *   stack: string,
   *   google?: string
   * }} AxisUiFontPreset
   */

  /** @type {AxisUiFontPreset[]} */
  const PRESETS = [
    // —— System / Axis ——
    {
      id: 'default',
      label: 'Axis (Nunito)',
      labelKey: 'settings.font.default',
      category: 'system',
      stack: "'Nunito', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      google: 'Nunito'
    },
    {
      id: 'system',
      label: 'System',
      labelKey: 'settings.font.system',
      category: 'system',
      stack:
        "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif"
    },
    {
      id: 'arial',
      label: 'Arial',
      category: 'system',
      stack: "Arial, Helvetica, 'Helvetica Neue', sans-serif"
    },
    {
      id: 'helvetica',
      label: 'Helvetica',
      category: 'system',
      stack: "'Helvetica Neue', Helvetica, Arial, sans-serif"
    },
    {
      id: 'verdana',
      label: 'Verdana',
      category: 'system',
      stack: 'Verdana, Geneva, Tahoma, sans-serif'
    },
    {
      id: 'tahoma',
      label: 'Tahoma',
      category: 'system',
      stack: 'Tahoma, Verdana, Geneva, sans-serif'
    },
    {
      id: 'trebuchet',
      label: 'Trebuchet MS',
      category: 'system',
      stack: "'Trebuchet MS', 'Lucida Grande', 'Lucida Sans Unicode', Arial, sans-serif"
    },
    {
      id: 'segoe',
      label: 'Segoe UI',
      category: 'system',
      stack: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    },
    {
      id: 'georgia',
      label: 'Georgia',
      category: 'system',
      stack: "Georgia, 'Times New Roman', Times, serif"
    },
    {
      id: 'times',
      label: 'Times New Roman',
      labelKey: 'settings.font.times',
      category: 'system',
      stack: "'Times New Roman', Times, Georgia, serif"
    },
    {
      id: 'palatino',
      label: 'Palatino',
      category: 'system',
      stack: "Palatino, 'Palatino Linotype', 'Book Antiqua', Georgia, serif"
    },
    {
      id: 'courier',
      label: 'Courier New',
      category: 'system',
      stack: "'Courier New', Courier, ui-monospace, monospace"
    },
    {
      id: 'mono',
      label: 'System Mono',
      labelKey: 'settings.font.mono',
      category: 'system',
      stack:
        "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    },

    // —— Sans (Google) ——
    {
      id: 'inter',
      label: 'Inter',
      category: 'sans',
      stack: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      google: 'Inter'
    },
    {
      id: 'roboto',
      label: 'Roboto',
      category: 'sans',
      stack: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Roboto'
    },
    {
      id: 'open-sans',
      label: 'Open Sans',
      category: 'sans',
      stack: "'Open Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Open Sans'
    },
    {
      id: 'lato',
      label: 'Lato',
      category: 'sans',
      stack: "'Lato', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Lato'
    },
    {
      id: 'montserrat',
      label: 'Montserrat',
      category: 'sans',
      stack: "'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Montserrat'
    },
    {
      id: 'poppins',
      label: 'Poppins',
      category: 'sans',
      stack: "'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Poppins'
    },
    {
      id: 'raleway',
      label: 'Raleway',
      category: 'sans',
      stack: "'Raleway', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Raleway'
    },
    {
      id: 'source-sans',
      label: 'Source Sans 3',
      category: 'sans',
      stack:
        "'Source Sans 3', 'Source Sans Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Source Sans 3'
    },
    {
      id: 'nunito-sans',
      label: 'Nunito Sans',
      category: 'sans',
      stack: "'Nunito Sans', Nunito, -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Nunito Sans'
    },
    {
      id: 'work-sans',
      label: 'Work Sans',
      category: 'sans',
      stack: "'Work Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Work Sans'
    },
    {
      id: 'dm-sans',
      label: 'DM Sans',
      category: 'sans',
      stack: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'DM Sans'
    },
    {
      id: 'plus-jakarta',
      label: 'Plus Jakarta Sans',
      category: 'sans',
      stack:
        "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Plus Jakarta Sans'
    },
    {
      id: 'outfit',
      label: 'Outfit',
      category: 'sans',
      stack: "'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Outfit'
    },
    {
      id: 'manrope',
      label: 'Manrope',
      category: 'sans',
      stack: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Manrope'
    },
    {
      id: 'urbanist',
      label: 'Urbanist',
      category: 'sans',
      stack: "'Urbanist', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Urbanist'
    },
    {
      id: 'rubik',
      label: 'Rubik',
      category: 'sans',
      stack: "'Rubik', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Rubik'
    },
    {
      id: 'mulish',
      label: 'Mulish',
      category: 'sans',
      stack: "'Mulish', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Mulish'
    },
    {
      id: 'figtree',
      label: 'Figtree',
      category: 'sans',
      stack: "'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Figtree'
    },
    {
      id: 'ibm-plex-sans',
      label: 'IBM Plex Sans',
      category: 'sans',
      stack: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'IBM Plex Sans'
    },
    {
      id: 'space-grotesk',
      label: 'Space Grotesk',
      category: 'sans',
      stack: "'Space Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Space Grotesk'
    },
    {
      id: 'ubuntu',
      label: 'Ubuntu',
      category: 'sans',
      stack: "'Ubuntu', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Ubuntu'
    },
    {
      id: 'cabin',
      label: 'Cabin',
      category: 'sans',
      stack: "'Cabin', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Cabin'
    },
    {
      id: 'josefin-sans',
      label: 'Josefin Sans',
      category: 'sans',
      stack: "'Josefin Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Josefin Sans'
    },
    {
      id: 'exo-2',
      label: 'Exo 2',
      category: 'sans',
      stack: "'Exo 2', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Exo 2'
    },
    {
      id: 'barlow',
      label: 'Barlow',
      category: 'sans',
      stack: "'Barlow', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Barlow'
    },
    {
      id: 'karla',
      label: 'Karla',
      category: 'sans',
      stack: "'Karla', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Karla'
    },
    {
      id: 'noto-sans',
      label: 'Noto Sans',
      category: 'sans',
      stack: "'Noto Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Noto Sans'
    },
    {
      id: 'pt-sans',
      label: 'PT Sans',
      category: 'sans',
      stack: "'PT Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'PT Sans'
    },
    {
      id: 'fira-sans',
      label: 'Fira Sans',
      category: 'sans',
      stack: "'Fira Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Fira Sans'
    },
    {
      id: 'lexend',
      label: 'Lexend',
      category: 'sans',
      stack: "'Lexend', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Lexend'
    },
    {
      id: 'albert-sans',
      label: 'Albert Sans',
      category: 'sans',
      stack: "'Albert Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Albert Sans'
    },
    {
      id: 'onest',
      label: 'Onest',
      category: 'sans',
      stack: "'Onest', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Onest'
    },
    {
      id: 'quicksand',
      label: 'Quicksand',
      category: 'sans',
      stack: "'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Quicksand'
    },
    {
      id: 'comfortaa',
      label: 'Comfortaa',
      category: 'sans',
      stack: "'Comfortaa', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Comfortaa'
    },
    {
      id: 'oswald',
      label: 'Oswald',
      category: 'sans',
      stack: "'Oswald', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Oswald'
    },
    {
      id: 'be-vietnam',
      label: 'Be Vietnam Pro',
      category: 'sans',
      stack: "'Be Vietnam Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Be Vietnam Pro'
    },
    {
      id: 'sora',
      label: 'Sora',
      category: 'sans',
      stack: "'Sora', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Sora'
    },
    {
      id: 'red-hat',
      label: 'Red Hat Text',
      category: 'sans',
      stack: "'Red Hat Text', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Red Hat Text'
    },
    {
      id: 'public-sans',
      label: 'Public Sans',
      category: 'sans',
      stack: "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Public Sans'
    },
    {
      id: 'schibsted',
      label: 'Schibsted Grotesk',
      category: 'sans',
      stack:
        "'Schibsted Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Schibsted Grotesk'
    },

    // —— Serif (Google) ——
    {
      id: 'serif',
      label: 'Georgia (Serif)',
      labelKey: 'settings.font.serif',
      category: 'serif',
      stack: "Georgia, 'Times New Roman', Times, serif"
    },
    {
      id: 'merriweather',
      label: 'Merriweather',
      category: 'serif',
      stack: "'Merriweather', Georgia, 'Times New Roman', Times, serif",
      google: 'Merriweather'
    },
    {
      id: 'lora',
      label: 'Lora',
      category: 'serif',
      stack: "'Lora', Georgia, 'Times New Roman', Times, serif",
      google: 'Lora'
    },
    {
      id: 'playfair',
      label: 'Playfair Display',
      category: 'serif',
      stack: "'Playfair Display', Georgia, 'Times New Roman', Times, serif",
      google: 'Playfair Display'
    },
    {
      id: 'libre-baskerville',
      label: 'Libre Baskerville',
      category: 'serif',
      stack: "'Libre Baskerville', Georgia, 'Times New Roman', Times, serif",
      google: 'Libre Baskerville'
    },
    {
      id: 'source-serif',
      label: 'Source Serif 4',
      category: 'serif',
      stack: "'Source Serif 4', 'Source Serif Pro', Georgia, 'Times New Roman', Times, serif",
      google: 'Source Serif 4'
    },
    {
      id: 'crimson-pro',
      label: 'Crimson Pro',
      category: 'serif',
      stack: "'Crimson Pro', Georgia, 'Times New Roman', Times, serif",
      google: 'Crimson Pro'
    },
    {
      id: 'cormorant',
      label: 'Cormorant Garamond',
      category: 'serif',
      stack: "'Cormorant Garamond', Georgia, 'Times New Roman', Times, serif",
      google: 'Cormorant Garamond'
    },
    {
      id: 'eb-garamond',
      label: 'EB Garamond',
      category: 'serif',
      stack: "'EB Garamond', Georgia, 'Times New Roman', Times, serif",
      google: 'EB Garamond'
    },
    {
      id: 'spectral',
      label: 'Spectral',
      category: 'serif',
      stack: "'Spectral', Georgia, 'Times New Roman', Times, serif",
      google: 'Spectral'
    },
    {
      id: 'fraunces',
      label: 'Fraunces',
      category: 'serif',
      stack: "'Fraunces', Georgia, 'Times New Roman', Times, serif",
      google: 'Fraunces'
    },
    {
      id: 'newsreader',
      label: 'Newsreader',
      category: 'serif',
      stack: "'Newsreader', Georgia, 'Times New Roman', Times, serif",
      google: 'Newsreader'
    },
    {
      id: 'literata',
      label: 'Literata',
      category: 'serif',
      stack: "'Literata', Georgia, 'Times New Roman', Times, serif",
      google: 'Literata'
    },
    {
      id: 'noto-serif',
      label: 'Noto Serif',
      category: 'serif',
      stack: "'Noto Serif', Georgia, 'Times New Roman', Times, serif",
      google: 'Noto Serif'
    },
    {
      id: 'pt-serif',
      label: 'PT Serif',
      category: 'serif',
      stack: "'PT Serif', Georgia, 'Times New Roman', Times, serif",
      google: 'PT Serif'
    },
    {
      id: 'libre-franklin',
      label: 'Libre Franklin',
      category: 'sans',
      stack: "'Libre Franklin', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
      google: 'Libre Franklin'
    },

    // —— Mono (Google) ——
    {
      id: 'jetbrains-mono',
      label: 'JetBrains Mono',
      category: 'mono',
      stack:
        "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'JetBrains Mono'
    },
    {
      id: 'fira-code',
      label: 'Fira Code',
      category: 'mono',
      stack:
        "'Fira Code', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Fira Code'
    },
    {
      id: 'source-code',
      label: 'Source Code Pro',
      category: 'mono',
      stack:
        "'Source Code Pro', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Source Code Pro'
    },
    {
      id: 'ibm-plex-mono',
      label: 'IBM Plex Mono',
      category: 'mono',
      stack:
        "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'IBM Plex Mono'
    },
    {
      id: 'roboto-mono',
      label: 'Roboto Mono',
      category: 'mono',
      stack:
        "'Roboto Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Roboto Mono'
    },
    {
      id: 'space-mono',
      label: 'Space Mono',
      category: 'mono',
      stack:
        "'Space Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Space Mono'
    },
    {
      id: 'inconsolata',
      label: 'Inconsolata',
      category: 'mono',
      stack:
        "'Inconsolata', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Inconsolata'
    },
    {
      id: 'noto-sans-mono',
      label: 'Noto Sans Mono',
      category: 'mono',
      stack:
        "'Noto Sans Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Noto Sans Mono'
    },
    {
      id: 'red-hat-mono',
      label: 'Red Hat Mono',
      category: 'mono',
      stack:
        "'Red Hat Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Courier New', monospace",
      google: 'Red Hat Mono'
    }
  ];

  const BY_ID = Object.create(null);
  for (const p of PRESETS) {
    BY_ID[p.id] = p;
  }

  const CATEGORY_ORDER = ['system', 'sans', 'serif', 'mono'];
  const CATEGORY_LABEL_KEYS = {
    system: 'settings.font.cat.system',
    sans: 'settings.font.cat.sans',
    serif: 'settings.font.cat.serif',
    mono: 'settings.font.cat.mono'
  };
  const CATEGORY_LABELS = {
    system: 'System & web-safe',
    sans: 'Sans-serif',
    serif: 'Serif',
    mono: 'Monospace'
  };

  function sanitizeId(raw) {
    const id = String(raw || '')
      .trim()
      .toLowerCase();
    return BY_ID[id] ? id : 'default';
  }

  function getPreset(id) {
    return BY_ID[sanitizeId(id)];
  }

  function getStack(id) {
    return getPreset(id).stack;
  }

  function listPresets() {
    return PRESETS.slice();
  }

  /** Google Fonts CSS2 URLs (split so long family lists stay under typical URL limits). */
  function googleStylesheetUrls() {
    const names = [];
    const seen = new Set();
    for (const p of PRESETS) {
      if (!p.google || seen.has(p.google)) continue;
      seen.add(p.google);
      names.push(p.google);
    }
    const chunkSize = 28;
    const urls = [];
    for (let i = 0; i < names.length; i += chunkSize) {
      const chunk = names.slice(i, i + chunkSize);
      const families = chunk
        .map((name) => {
          const enc = encodeURIComponent(name).replace(/%20/g, '+');
          // 400/600/700 cover Axis chrome weights; families without 600 still serve closest.
          return `family=${enc}:wght@400;600;700`;
        })
        .join('&');
      urls.push(`https://fonts.googleapis.com/css2?${families}&display=swap`);
    }
    return urls;
  }

  /** Ensure Google Fonts <link> tags exist on a document (idempotent). */
  function ensureStylesheets(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.head) return;
    const urls = googleStylesheetUrls();
    urls.forEach((href, index) => {
      const id = `axis-ui-fonts-google-${index}`;
      if (d.getElementById(id)) return;
      const link = d.createElement('link');
      link.id = id;
      link.rel = 'stylesheet';
      link.href = href;
      d.head.appendChild(link);
    });
  }

  function applyToDocument(doc, fontId) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    if (!d || !d.documentElement) return sanitizeId(fontId);
    const id = sanitizeId(fontId);
    const stack = getStack(id);
    ensureStylesheets(d);
    try {
      d.documentElement.style.setProperty('--axis-ui-font', stack);
      d.documentElement.setAttribute('data-ui-font', id);
    } catch (_) {}
    return id;
  }

  function tLabel(preset, tFn) {
    if (preset.labelKey && typeof tFn === 'function') {
      try {
        const translated = tFn(preset.labelKey);
        if (translated && translated !== preset.labelKey) return translated;
      } catch (_) {}
    }
    return preset.label;
  }

  function categoryLabel(cat, tFn) {
    const key = CATEGORY_LABEL_KEYS[cat];
    if (key && typeof tFn === 'function') {
      try {
        const translated = tFn(key);
        if (translated && translated !== key) return translated;
      } catch (_) {}
    }
    return CATEGORY_LABELS[cat] || cat;
  }

  /** Fill a <select> with optgroups + options; each option previews its stack. */
  function fillSelect(selectEl, selectedId, tFn) {
    if (!selectEl) return;
    const doc = selectEl.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;
    const selected = sanitizeId(selectedId);
    const prevFilling = selectEl._axisFontFilling;
    selectEl._axisFontFilling = true;
    try {
      selectEl.innerHTML = '';
      for (const cat of CATEGORY_ORDER) {
        const groupPresets = PRESETS.filter((p) => p.category === cat);
        if (!groupPresets.length) continue;
        const group = doc.createElement('optgroup');
        group.label = categoryLabel(cat, tFn);
        for (const p of groupPresets) {
          const opt = doc.createElement('option');
          opt.value = p.id;
          opt.textContent = tLabel(p, tFn);
          try {
            opt.style.fontFamily = p.stack;
          } catch (_) {}
          if (p.id === selected) opt.selected = true;
          group.appendChild(opt);
        }
        selectEl.appendChild(group);
      }
      selectEl.value = selected;
    } finally {
      selectEl._axisFontFilling = prevFilling;
    }
  }

  return {
    PRESETS,
    sanitizeId,
    getPreset,
    getStack,
    listPresets,
    googleStylesheetUrls,
    ensureStylesheets,
    applyToDocument,
    fillSelect,
    categoryLabel,
    tLabel
  };
});
