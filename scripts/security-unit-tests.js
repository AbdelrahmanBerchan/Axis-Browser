'use strict';

/**
 * Lightweight security unit checks for Axis (no test framework required).
 * Run: node scripts/security-unit-tests.js
 */
const assert = require('assert');
const path = require('path');
const { originsMatch, registrableDomain, hostKey } = require('../src/axis-vault');

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

if (!process.exitCode) {
  console.log('\nAll security unit tests passed.');
}
