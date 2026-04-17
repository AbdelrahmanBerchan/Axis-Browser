#!/usr/bin/env node
/**
 * Spawns the Electron binary with stderr piped so native NSLog (e.g. menu teardown on quit)
 * is filtered — those messages do not go through Node's process.stderr in the child.
 */
const path = require('path');
const { spawn } = require('child_process');

const SUPPRESSED_PATTERNS = require('./suppress-stderr-patterns.js');

function matchesSuppressed(text) {
  return typeof text === 'string' && SUPPRESSED_PATTERNS.some((p) => text.includes(p));
}

const appRoot = path.resolve(__dirname, '..');
const electronPath = require('electron');
const extraArgs = process.argv.slice(2).filter((a) => a !== '--');

const child = spawn(electronPath, [appRoot, ...extraArgs], {
  cwd: appRoot,
  stdio: ['inherit', 'inherit', 'pipe'],
  env: process.env,
  windowsHide: false
});

let stderrBuf = '';
child.stderr.on('data', (chunk) => {
  stderrBuf += chunk.toString();
  const parts = stderrBuf.split(/\r?\n/);
  stderrBuf = parts.pop() || '';
  for (const line of parts) {
    if (!line.trim()) {
      process.stderr.write('\n');
      continue;
    }
    if (!matchesSuppressed(line)) {
      process.stderr.write(line + '\n');
    }
  }
});

child.stderr.on('end', () => {
  if (stderrBuf.trim() && !matchesSuppressed(stderrBuf)) {
    process.stderr.write(stderrBuf);
  }
});

['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    if (child && !child.killed) {
      child.kill(sig);
    }
  });
});

child.on('exit', (code) => {
  process.exit(code == null ? 0 : code);
});

child.on('error', (err) => {
  process.stderr.write(String(err) + '\n');
  process.exit(1);
});
