'use strict';

/**
 * Offline i18n sync - no network.
 *
 * Fills missing locale keys using Axis’s own curated packs as a translation memory:
 *  1) Exact English match
 *  2) Normalized English (case / ellipsis / quotes)
 *  3) Short English that is a prefix of a longer translated English
 *  4) Glossary phrase swap - replace known English fragments with their
 *     prior translations (longest first), so “Edit Link…” can become
 *     “تعديل الرابط…” from existing “Edit” / “Link” style strings
 *
 * Does NOT copy English into locale packs - AxisI18n.t() already falls back to EN.
 * Writes src/axis-locale-auto.js (loaded after the curated packs).
 *
 * Run: node scripts/i18n-sync-offline.js
 *   or: npm run i18n:sync
 * Also runs automatically from `npm start` / `npm run dev` / `npm run build`
 * when English or curated packs change (skips instantly when up to date).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'src');
const outFile = path.join(srcDir, 'axis-locale-auto.js');

const SOURCE_PACKS = [
  'axis-i18n.js',
  'axis-locale-packs.js',
  'axis-locale-packs-more.js',
  'axis-locale-packs-fix.js',
  // Curated high-quality strings (e.g. security popup). Must load before
  // generating auto so TM can use them and auto does not overwrite them.
  'axis-locale-quality.js'
];

const FINGERPRINT_RE = /^\/\* axis-i18n-sync:([a-f0-9]{64}) \*\//;

function sourceFingerprint() {
  const h = crypto.createHash('sha256');
  h.update(String(SOURCE_PACKS.length));
  for (const name of SOURCE_PACKS) {
    const p = path.join(srcDir, name);
    h.update('\n');
    h.update(name);
    h.update('\0');
    if (!fs.existsSync(p)) {
      h.update('missing');
      continue;
    }
    const st = fs.statSync(p);
    h.update(String(st.size));
    h.update(':');
    h.update(String(Math.trunc(st.mtimeMs)));
  }
  const selfSt = fs.statSync(__filename);
  h.update('\nscript:');
  h.update(String(selfSt.size));
  h.update(':');
  h.update(String(Math.trunc(selfSt.mtimeMs)));
  return h.digest('hex');
}

function readExistingFingerprint() {
  if (!fs.existsSync(outFile)) return null;
  const head = fs.readFileSync(outFile, 'utf8').slice(0, 120);
  const m = FINGERPRINT_RE.exec(head);
  return m ? m[1] : null;
}

function loadAxisI18n() {
  let AxisI18n = null;
  const sandbox = {
    console,
    module: {
      get exports() {
        return AxisI18n;
      },
      set exports(v) {
        AxisI18n = v;
      }
    },
    exports: {},
    window: {},
    globalThis: {},
    require(id) {
      if (id === './axis-i18n' || id.endsWith('/axis-i18n') || id.endsWith('axis-i18n.js')) {
        return AxisI18n;
      }
      return require(id);
    }
  };
  sandbox.root = sandbox.window;
  sandbox.self = sandbox.window;
  sandbox.global = sandbox;

  vm.runInNewContext(fs.readFileSync(path.join(srcDir, 'axis-i18n.js'), 'utf8'), sandbox, {
    filename: 'axis-i18n.js'
  });
  AxisI18n = sandbox.AxisI18n || sandbox.window.AxisI18n || AxisI18n;
  if (!AxisI18n) throw new Error('AxisI18n failed to load');
  sandbox.window.AxisI18n = AxisI18n;
  sandbox.AxisI18n = AxisI18n;
  sandbox.module.exports = AxisI18n;

  for (const pack of SOURCE_PACKS.slice(1)) {
    const p = path.join(srcDir, pack);
    if (!fs.existsSync(p)) continue;
    try {
      vm.runInNewContext(fs.readFileSync(p, 'utf8'), sandbox, { filename: pack });
    } catch (err) {
      console.warn('warn:', pack, err.message);
    }
  }
  return AxisI18n;
}

function normalizeEn(s) {
  return String(s || '')
    .normalize('NFKC')
    .replace(/[\u2026]/g, '...')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.…!?]+$/u, '');
}

function firstToken(translated) {
  const t = String(translated || '').trim();
  if (!t) return '';
  const m = t.match(/^(\S+)/u);
  return m ? m[1] : t;
}

function wordCount(s) {
  return String(s || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Escape for use in a case-insensitive whole-phrase RegExp. */
function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildGlossary(EN, packs) {
  /** loc -> Map(enLower -> tr) preferring shorter, cleaner phrases */
  const glossaries = Object.create(null);
  for (const [loc, table] of Object.entries(packs)) {
    if (!table) continue;
    const g = new Map();
    for (const [key, val] of Object.entries(table)) {
      const enVal = EN[key];
      if (enVal == null) continue;
      const e = String(enVal).trim();
      const t = String(val || '').trim();
      if (!e || !t || e === t) continue;
      // Skip long sentences and templates with many placeholders.
      if (e.length > 48 || wordCount(e) > 5) continue;
      if ((e.match(/\{/g) || []).length > 1) continue;
      if (/^[A-Z0-9.]+$/.test(e) && e.length <= 3) continue; // brand crumbs
      const low = e.toLowerCase();
      const prev = g.get(low);
      if (!prev || e.length < prev.en.length) g.set(low, { en: e, tr: t });
    }
    // Prefer longer English phrases when applying (sort later).
    glossaries[loc] = [...g.values()].sort((a, b) => b.en.length - a.en.length);
  }
  return glossaries;
}

function applyGlossary(en, glossary) {
  if (!glossary || !glossary.length) return null;
  let out = String(en);
  let hits = 0;
  const used = new Set();
  for (const { en: phrase, tr } of glossary) {
    if (!phrase || phrase.length < 3) continue;
    // Avoid tiny ambiguous words (on/to/in/view) that poison compositions.
    if (wordCount(phrase) === 1 && phrase.length < 5) continue;
    const low = phrase.toLowerCase();
    if (used.has(low)) continue;
    const re = new RegExp(`(?:^|\\b)${escapeRegExp(phrase)}(?:\\b|$)`, 'ig');
    if (!re.test(out)) continue;
    out = out.replace(re, tr);
    used.add(low);
    hits++;
  }
  if (!hits || out === en) return null;
  // Reject half-translated leftovers (Latin letters still present beyond brands).
  const leftover = out
    .replace(/\b(Axis|AI|API|URL|ZIP|CVV|VPN|OK|Mac|Windows|GitHub|HTTPS?)\b/gi, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  if (/[A-Za-z]/.test(leftover)) return null;
  return out;
}

function loadPhraseBank() {
  try {
    return require('./i18n-phrase-bank.js');
  } catch (err) {
    console.warn('warn: i18n-phrase-bank.js', err.message);
    return { pivots: {}, phrases: {} };
  }
}

function resolvePhraseBank(en, loc, bank) {
  if (!bank || !bank.phrases) return null;
  const row = bank.phrases[en];
  if (!row || typeof row !== 'object') return null;
  const direct = row[loc];
  if (direct != null && String(direct).trim() !== '') return String(direct).trim();
  const pivots = bank.pivots || {};
  const seen = new Set([loc]);
  let cur = pivots[loc] || null;
  while (cur && cur !== 'en' && !seen.has(cur)) {
    seen.add(cur);
    const hit = row[cur];
    if (hit != null && String(hit).trim() !== '') return String(hit).trim();
    cur = pivots[cur] || null;
  }
  return null;
}

function main() {
  const fp = sourceFingerprint();
  // Include phrase bank in freshness so lexicon edits regenerate auto.
  const bankPath = path.join(__dirname, 'i18n-phrase-bank.js');
  let bankFp = '';
  try {
    const st = fs.statSync(bankPath);
    bankFp = `${st.size}:${Math.trunc(st.mtimeMs)}`;
  } catch (_) {
    bankFp = 'missing';
  }
  const fullFp = crypto.createHash('sha256').update(fp).update('\nbank:').update(bankFp).digest('hex');
  if (readExistingFingerprint() === fullFp) {
    console.log('i18n: axis-locale-auto.js up to date');
    return;
  }

  const bank = loadPhraseBank();
  const I = loadAxisI18n();
  const EN = I.getEnglishTable();
  const packs = I.dumpPacks();

  const tmExact = new Map();
  const tmNorm = new Map();
  const byLocPairs = Object.create(null);

  for (const [loc, table] of Object.entries(packs)) {
    if (!table) continue;
    byLocPairs[loc] = [];
    for (const [key, val] of Object.entries(table)) {
      const enVal = EN[key];
      if (enVal == null) continue;
      const e = String(enVal).trim();
      const t = String(val || '').trim();
      if (!e || !t || e === t) continue;
      if (!tmExact.has(e)) tmExact.set(e, Object.create(null));
      if (!tmExact.get(e)[loc]) tmExact.get(e)[loc] = t;
      const n = normalizeEn(e);
      if (n) {
        if (!tmNorm.has(n)) tmNorm.set(n, Object.create(null));
        if (!tmNorm.get(n)[loc]) tmNorm.get(n)[loc] = t;
      }
      byLocPairs[loc].push({ en: e, tr: t });
    }
  }

  for (const loc of Object.keys(byLocPairs)) {
    byLocPairs[loc].sort((a, b) => a.en.length - b.en.length);
  }

  const glossaries = buildGlossary(EN, packs);

  function lookup(en, loc) {
    const exact = tmExact.get(en)?.[loc];
    if (exact) return { text: exact, how: 'exact' };
    const norm = tmNorm.get(normalizeEn(en))?.[loc];
    if (norm) return { text: norm, how: 'norm' };
    const seeded = resolvePhraseBank(en, loc, bank);
    if (seeded) return { text: seeded, how: 'seed' };
    if (en.length >= 3 && !/\s/.test(en)) {
      const needle = en.toLowerCase();
      const pairs = byLocPairs[loc] || [];
      for (const { en: longer, tr } of pairs) {
        const low = longer.toLowerCase();
        if (low === needle) continue;
        if (
          low.startsWith(needle + ' ') ||
          low.startsWith(needle + '…') ||
          low.startsWith(needle + '...')
        ) {
          const tok = firstToken(tr);
          if (tok && tok !== longer) return { text: tok, how: 'prefix' };
        }
      }
    }
    const composed = applyGlossary(en, glossaries[loc]);
    if (composed) return { text: composed, how: 'glossary' };
    return null;
  }

  const auto = {};
  let filledExact = 0;
  let filledNorm = 0;
  let filledPrefix = 0;
  let filledGlossary = 0;
  let filledSeed = 0;
  const locales = Object.keys(packs).sort();

  for (const loc of locales) {
    const existing = packs[loc] || {};
    const bucket = {};
    for (const [key, enVal] of Object.entries(EN)) {
      if (existing[key] != null && String(existing[key]).trim() !== '') continue;
      const hit = lookup(String(enVal).trim(), loc);
      if (!hit) continue;
      bucket[key] = hit.text;
      if (hit.how === 'exact') filledExact++;
      else if (hit.how === 'norm') filledNorm++;
      else if (hit.how === 'prefix') filledPrefix++;
      else if (hit.how === 'seed') filledSeed++;
      else filledGlossary++;
    }
    if (Object.keys(bucket).length) auto[loc] = bucket;
  }

  const body =
    `/* axis-i18n-sync:${fullFp} */\n` +
    '/* AUTO-GENERATED by scripts/i18n-sync-offline.js - offline fill for missing keys. Do not edit by hand. */\n' +
    '(function (root) {\n' +
    "  'use strict';\n" +
    '  const I = root && root.AxisI18n;\n' +
    "  if (!I || typeof I.registerPacks !== 'function') return;\n" +
    '  I.registerPacks(' +
    JSON.stringify(auto) +
    ');\n' +
    "})(typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : this);\n";

  fs.writeFileSync(outFile, body);
  const bytes = Buffer.byteLength(body);
  console.log(
    `Wrote ${path.relative(root, outFile)} - ${Object.keys(auto).length} locales, ` +
      `exact ${filledExact}, norm ${filledNorm}, seed ${filledSeed}, prefix ${filledPrefix}, glossary ${filledGlossary}, ${(bytes / 1024).toFixed(1)} KB`
  );
}

main();
