'use strict';

/**
 * Lightweight security unit checks for Axis (no test framework required).
 * Run: node scripts/security-unit-tests.js
 */
const assert = require('assert');
const path = require('path');
const { originsMatch, registrableDomain, hostKey, passwordHint } = require('../src/axis-vault');

function test(name, fn) {
  try {
    fn();
    console.log('ok -', name);
  } catch (err) {
    console.error('FAIL -', name);
    console.error(err && err.stack ? err.stack : err);
    process.exitCode = 1;
  }
}

test('www-normalized host match', () => {
  assert.strictEqual(
    originsMatch('https://www.example.com/a', 'https://example.com/'),
    true
  );
});

test('subdomain of saved apex allowed', () => {
  assert.strictEqual(
    originsMatch('https://accounts.google.com/signin', 'https://google.com/'),
    true
  );
});

test('github.io siblings do not match', () => {
  assert.strictEqual(
    originsMatch('https://evil.github.io/', 'https://victim.github.io/'),
    false
  );
  assert.strictEqual(registrableDomain('evil.github.io'), 'evil.github.io');
  assert.strictEqual(registrableDomain('victim.github.io'), 'victim.github.io');
});

test('co.uk siblings do not match', () => {
  assert.strictEqual(
    originsMatch('https://evil.co.uk/', 'https://bank.co.uk/'),
    false
  );
});

test('unrelated hosts do not match', () => {
  assert.strictEqual(
    originsMatch('https://attacker.test/', 'https://example.com/'),
    false
  );
});

test('hostKey strips www', () => {
  assert.strictEqual(hostKey('www.Example.COM'), 'example.com');
});

// Mirror of main-process private-host logic (keep in sync with isBlockedFetchHostname).
function isBlockedFetchHostname(hostname) {
  let host = String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '');
  if (!host) return true;
  const v4MappedDotted = /(?:^|:)ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(host);
  if (v4MappedDotted) return isBlockedFetchHostname(v4MappedDotted[1]);
  if (host === 'localhost' || host === '::1' || host.endsWith('.localhost')) return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (m) {
    const [a, b] = m.slice(1).map(Number);
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
  }
  if (host.includes(':') && (host.startsWith('fe80') || host.includes('ffff:'))) return true;
  return false;
}

test('blocks IPv4-mapped loopback', () => {
  assert.strictEqual(isBlockedFetchHostname('::ffff:127.0.0.1'), true);
  assert.strictEqual(isBlockedFetchHostname('::ffff:169.254.169.254'), true);
});

test('allows public hostnames', () => {
  assert.strictEqual(isBlockedFetchHostname('api.open-meteo.com'), false);
});

test('path containment helper rejects traversal', () => {
  const root = path.resolve('/tmp/axis-lib-root');
  const inside = path.resolve(root, 'file.txt');
  const outside = path.resolve(root, '..', 'etc', 'passwd');
  assert.ok(inside.startsWith(root + path.sep) || inside === root);
  assert.ok(!(outside === root || outside.startsWith(root + path.sep)));
});

const {
  isPathInsideAxisLibraryRoots,
  isPathInsideRoots,
  isAxisSettingsGuestUrl,
  isAxisShellFileUrl,
  isWebsiteGuestUrl,
  isExtensionPageUrl,
  formatAddressCandidateSummary,
  passwordMatchFingerprint,
  isZipEntryPathSafe,
  getAxisLibraryRootDirs
} = require('../src/axis-security-helpers');

test('isPathInsideAxisLibraryRoots allows Downloads/Desktop only', () => {
  const home = '/Users/testuser';
  const downloads = path.join(home, 'Downloads', 'photo.png');
  const ssh = path.join(home, '.ssh', 'id_rsa');
  assert.strictEqual(isPathInsideAxisLibraryRoots(downloads, home), true);
  assert.strictEqual(isPathInsideAxisLibraryRoots(ssh, home), false);
  assert.strictEqual(isPathInsideAxisLibraryRoots('', home), false);
});

test('isPathInsideRoots rejects null bytes and traversal', () => {
  const root = path.resolve('/tmp/axis-lib');
  assert.strictEqual(isPathInsideRoots(path.join(root, 'a.txt'), [root]), true);
  assert.strictEqual(isPathInsideRoots(path.join(root, '..', 'etc', 'passwd'), [root]), false);
  assert.strictEqual(isPathInsideRoots('/tmp/axis-lib/\0evil', [root]), false);
});

test('settings guest URL detection', () => {
  assert.strictEqual(
    isAxisSettingsGuestUrl('file:///Applications/Axis.app/Contents/Resources/app/src/settings.html'),
    true
  );
  assert.strictEqual(
    isAxisSettingsGuestUrl('file:///tmp/settings.html#general'),
    true
  );
  assert.strictEqual(isAxisSettingsGuestUrl('https://evil.example/settings.html'), false);
  assert.strictEqual(isAxisSettingsGuestUrl('https://example.com/'), false);
});

test('axis shell file URL detection', () => {
  assert.strictEqual(
    isAxisShellFileUrl('file:///Applications/Axis.app/Contents/Resources/app/src/index.html'),
    true
  );
  assert.strictEqual(
    isAxisShellFileUrl('file:///tmp/settings.html'),
    true
  );
  assert.strictEqual(isAxisShellFileUrl('about:blank'), true);
  assert.strictEqual(isAxisShellFileUrl(''), true);
  assert.strictEqual(isAxisShellFileUrl('https://example.com/'), false);
  assert.strictEqual(isAxisShellFileUrl('chrome-extension://abc/popup.html'), false);
  assert.strictEqual(isAxisShellFileUrl('file:///tmp/other.html'), false);
});

test('extension page URL detection', () => {
  assert.strictEqual(isExtensionPageUrl('chrome-extension://abc/options.html'), true);
  assert.strictEqual(isExtensionPageUrl('file:///tmp/index.html'), false);
});

test('website guest URL detection', () => {
  assert.strictEqual(isWebsiteGuestUrl('https://example.com/'), true);
  assert.strictEqual(isWebsiteGuestUrl('http://localhost:3000'), true);
  assert.strictEqual(isWebsiteGuestUrl('blob:https://example.com/x'), true);
  assert.strictEqual(isWebsiteGuestUrl('about:blank'), false);
  assert.strictEqual(isWebsiteGuestUrl('file:///tmp/settings.html'), false);
});

test('address candidate summary omits street', () => {
  const summary = formatAddressCandidateSummary({
    addressLine1: '123 Secret St',
    city: 'Austin',
    state: 'TX',
    postalCode: '78701'
  });
  assert.ok(summary.includes('Austin'));
  assert.ok(summary.includes('78701'));
  assert.ok(!summary.includes('Secret'));
  assert.ok(!summary.includes('123'));
});

test('passwordMatchFingerprint is stable and not plaintext', () => {
  const a = passwordMatchFingerprint('hunter2secret');
  const b = passwordMatchFingerprint('hunter2secret');
  const c = passwordMatchFingerprint('other');
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
  assert.ok(!a.includes('hunter'));
  assert.ok(a.startsWith('13:'));
});

test('zip entry path safety', () => {
  const dest = path.resolve('/tmp/axis-unzip');
  assert.strictEqual(isZipEntryPathSafe(dest, 'manifest.json'), true);
  assert.strictEqual(isZipEntryPathSafe(dest, 'foo/bar.js'), true);
  assert.strictEqual(isZipEntryPathSafe(dest, '../etc/passwd'), false);
  assert.strictEqual(isZipEntryPathSafe(dest, '/etc/passwd'), false);
  assert.strictEqual(isZipEntryPathSafe(dest, 'a/../../etc/passwd'), false);
  assert.strictEqual(isZipEntryPathSafe(dest, 'evil\0.txt'), false);
});

test('library roots include standard user folders', () => {
  const roots = getAxisLibraryRootDirs('/Users/dev');
  assert.ok(roots.some((r) => r.endsWith(path.join('Downloads'))));
  assert.ok(roots.some((r) => r.endsWith(path.join('Desktop'))));
});

test('password hint never returns the full password', () => {
  const hint = passwordHint('hunter2secret');
  assert.ok(hint.startsWith('•'));
  assert.ok(!hint.includes('hunter'));
  assert.ok(!hint.includes('et'));
  assert.ok(!/[a-z0-9]/i.test(hint));
  assert.strictEqual(passwordHint(''), '');
  assert.strictEqual(passwordHint('ab'), '••••');
});

const {
  looksLikeLocalPath,
  resolveLocalFileUrl,
} = require('../src/axis-local-file-url');

test('local path detection', () => {
  assert.strictEqual(looksLikeLocalPath('/Users/me/test.html'), true);
  assert.strictEqual(looksLikeLocalPath('~/Desktop/a.html'), true);
  assert.strictEqual(looksLikeLocalPath('C:\\Users\\me\\a.html'), true);
  assert.strictEqual(looksLikeLocalPath('//cdn.example.com/x.js'), false);
  assert.strictEqual(looksLikeLocalPath('example.com'), false);
  assert.strictEqual(looksLikeLocalPath('my local html file'), false);
});

test('resolveLocalFileUrl opens unix paths and file URLs', () => {
  assert.strictEqual(
    resolveLocalFileUrl('/Users/me/test.html'),
    'file:///Users/me/test.html'
  );
  assert.strictEqual(
    resolveLocalFileUrl('/Users/me/My Project/index.html'),
    'file:///Users/me/My%20Project/index.html'
  );
  assert.strictEqual(
    resolveLocalFileUrl('file:///Users/me/x.html'),
    'file:///Users/me/x.html'
  );
  assert.strictEqual(
    resolveLocalFileUrl('~/Documents/a.html', { homeDir: '/Users/dev' }),
    'file:///Users/dev/Documents/a.html'
  );
  assert.strictEqual(resolveLocalFileUrl('~/x.html', { homeDir: '' }), null);
  assert.strictEqual(resolveLocalFileUrl('javascript:alert(1)'), null);
  assert.strictEqual(resolveLocalFileUrl('example.com/foo'), null);
});

test('resolveLocalFileUrl windows drive paths', () => {
  assert.strictEqual(
    resolveLocalFileUrl('C:\\Users\\me\\a.html'),
    'file:///C:/Users/me/a.html'
  );
  assert.strictEqual(
    resolveLocalFileUrl('D:/work/index.html'),
    'file:///D:/work/index.html'
  );
});

const { stripTrackingParams, isTrackingParam } = require('../src/axis-clean-url');

test('tracking param detection', () => {
  assert.strictEqual(isTrackingParam('utm_source'), true);
  assert.strictEqual(isTrackingParam('fbclid'), true);
  assert.strictEqual(isTrackingParam('gclid'), true);
  assert.strictEqual(isTrackingParam('_ga'), true);
  assert.strictEqual(isTrackingParam('id'), false);
  assert.strictEqual(isTrackingParam('q'), false);
});

test('stripTrackingParams removes common trackers', () => {
  assert.strictEqual(
    stripTrackingParams('https://example.com/a?utm_source=x&id=1&fbclid=abc'),
    'https://example.com/a?id=1'
  );
  assert.strictEqual(
    stripTrackingParams('https://example.com/path?gclid=1&mc_cid=2&keep=yes'),
    'https://example.com/path?keep=yes'
  );
  assert.strictEqual(
    stripTrackingParams('https://example.com/clean'),
    'https://example.com/clean'
  );
  assert.strictEqual(stripTrackingParams('axis://settings'), 'axis://settings');
  assert.strictEqual(stripTrackingParams('not a url'), 'not a url');
});

if (!process.exitCode) {
  console.log('\nAll security unit tests passed.');
}
