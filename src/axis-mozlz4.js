'use strict';

let lz4js = null;
try {
  lz4js = require('lz4js');
} catch (_) {}

/** Decompress Firefox mozLz40 / jsonlz4 buffers to UTF-8 text. */
function decompressMozLz4(buffer) {
  if (!buffer || buffer.length < 13) return null;
  if (buffer.toString('ascii', 0, 8) !== 'mozLz40\0') return null;
  if (!lz4js) return null;
  const outSize = buffer.readUInt32LE(8);
  const compressed = buffer.subarray(12);
  try {
    const out = lz4js.decompress(compressed);
    const bytes = out instanceof Uint8Array ? out : new Uint8Array(out);
    const text = Buffer.from(bytes).toString('utf8');
    if (outSize > 0 && bytes.length < outSize * 0.5) return null;
    return text;
  } catch (_) {
    return null;
  }
}

module.exports = { decompressMozLz4 };
