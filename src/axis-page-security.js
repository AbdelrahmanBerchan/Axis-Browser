'use strict';

const crypto = require('crypto');
const { webContents } = require('electron');

/** @type {Map<string, { chain: object[], meta: object, tls: object|null, updatedAt: number }>} */
const axisSecurityByOrigin = new Map();

/** @type {Map<number, { origin: string, chain: object[], meta: object, tls: object|null, certError: string|null, updatedAt: number }>} */
const axisSecurityByWebContentsId = new Map();

const axisGuestWatchInstalled = new WeakSet();

function originKeyFromUrl(rawUrl) {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return '';
    return u.origin;
  } catch (_) {
    return '';
  }
}

function formatPrincipalName(principal, fallback = '') {
  if (!principal || typeof principal !== 'object') return fallback || '';
  if (principal.commonName) return String(principal.commonName);
  if (principal.organizationName) return String(principal.organizationName);
  return fallback || '';
}

function parseX509Name(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const cn = raw.match(/(?:^|\n)CN\s*=\s*([^,\n]+)/);
  if (cn) return cn[1].trim();
  const on = raw.match(/(?:^|\n)O\s*=\s*([^,\n]+)/);
  if (on) return on[1].trim();
  return raw.split('\n')[0].trim();
}

function parsePemCertificate(pem) {
  if (!pem || typeof pem !== 'string') return null;
  try {
    const x509 = new crypto.X509Certificate(pem);
    const validFromMs = Date.parse(x509.validFrom);
    const validToMs = Date.parse(x509.validTo);
    return {
      subjectName: parseX509Name(x509.subject) || x509.subject || '',
      issuerName: parseX509Name(x509.issuer) || x509.issuer || '',
      validStart: Number.isFinite(validFromMs) ? Math.floor(validFromMs / 1000) : 0,
      validExpiry: Number.isFinite(validToMs) ? Math.floor(validToMs / 1000) : 0,
      fingerprint: x509.fingerprint256 || x509.fingerprint || '',
      serialNumber: x509.serialNumber || '',
      pem,
    };
  } catch (_) {
    return null;
  }
}

function serializeElectronCertificate(cert) {
  if (!cert) return null;
  return {
    subjectName: cert.subjectName || formatPrincipalName(cert.subject, ''),
    issuerName: cert.issuerName || formatPrincipalName(cert.issuer, ''),
    validStart: Number(cert.validStart) || 0,
    validExpiry: Number(cert.validExpiry) || 0,
    fingerprint: cert.fingerprint || '',
    serialNumber: cert.serialNumber || '',
    organizationName: cert.subject?.organizationName || '',
    commonName: cert.subject?.commonName || '',
  };
}

function buildCertificateChain(leafCert) {
  const chain = [];
  let current = leafCert;
  let guard = 0;
  while (current && guard < 16) {
    const row = serializeElectronCertificate(current);
    if (row) chain.push(row);
    current = current.issuerCert;
    guard += 1;
  }
  return chain;
}

function chainFromSecurityDetails(sd) {
  if (!sd) return [];
  const row = {
    subjectName: sd.subjectName || '',
    issuerName: sd.issuer || '',
    validStart: Number(sd.validFrom) || 0,
    validExpiry: Number(sd.validTo) || 0,
    fingerprint: '',
    serialNumber: '',
  };
  return row.subjectName || row.issuerName ? [row] : [];
}

function tlsFromSecurityDetails(sd) {
  if (!sd) return null;
  return {
    protocol: sd.protocol || '',
    cipher: sd.cipher || '',
    keyExchange: sd.keyExchange || '',
  };
}

function storeSecuritySnapshot(origin, webContentsId, payload) {
  if (!origin) return;
  const chain = Array.isArray(payload.chain) ? payload.chain : [];
  const meta = payload.meta || {};
  const tls = payload.tls || null;
  const certError = payload.certError || null;
  const updatedAt = Date.now();

  axisSecurityByOrigin.set(origin, { chain, meta, tls, updatedAt });
  if (webContentsId > 0) {
    axisSecurityByWebContentsId.set(webContentsId, {
      origin,
      chain,
      meta,
      tls,
      certError,
      updatedAt,
    });
  }
}

function cacheCertificateForOrigin(origin, certificate, meta = {}, webContentsId = 0) {
  const key = String(origin || '').trim();
  if (!key || !certificate) return;
  const chain = buildCertificateChain(certificate);
  if (!chain.length) return;
  storeSecuritySnapshot(
    key,
    webContentsId,
    {
      chain,
      meta: {
        verificationResult: meta.verificationResult ?? '',
        errorCode: Number(meta.errorCode) || 0,
        isIssuedByKnownRoot: meta.isIssuedByKnownRoot !== false,
      },
      tls: null,
      certError: meta.certError || null,
    }
  );
}

function getStoredSecurity(origin, webContentsId) {
  const id = Number(webContentsId) || 0;
  if (id > 0) {
    const byId = axisSecurityByWebContentsId.get(id);
    if (byId && (!origin || byId.origin === origin)) return byId;
  }
  if (origin) {
    const byOrigin = axisSecurityByOrigin.get(origin);
    if (byOrigin) return { origin, ...byOrigin, certError: null };
  }
  return null;
}

function installAxisPageSecurityOnSession(sess) {
  if (!sess?.setCertificateVerifyProc) return;
  sess.setCertificateVerifyProc((request, callback) => {
    try {
      const { hostname, certificate, verificationResult, errorCode, isIssuedByKnownRoot } = request || {};
      if (hostname && certificate) {
        const port = request?.port || 443;
        const origin = `https://${hostname}${port === 443 ? '' : `:${port}`}`;
        cacheCertificateForOrigin(origin, certificate, {
          verificationResult,
          errorCode,
          isIssuedByKnownRoot,
        });
      }
    } catch (_) {}
    try {
      callback(-3);
    } catch (_) {
      try {
        callback(0);
      } catch (__) {}
    }
  });
}

async function ensureGuestSecurityDebugger(wc) {
  if (!wc || wc.isDestroyed()) return false;
  const dbg = wc.debugger;
  try {
    if (!dbg.isAttached()) {
      dbg.attach('1.3');
    }
    if (!wc.__axisSecurityDebuggerReady) {
      dbg.removeAllListeners('message');
      dbg.on('message', (_event, method, params) => {
        axisOnGuestDebuggerMessage(wc, method, params);
      });
      await dbg.sendCommand('Security.enable');
      await dbg.sendCommand('Network.enable');
      wc.__axisSecurityDebuggerReady = true;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function axisOnGuestDebuggerMessage(wc, method, params) {
  if (!wc || wc.isDestroyed()) return;
  const wcId = wc.id;

  if (method === 'Network.responseReceived') {
    const type = params?.type;
    if (type !== 'Document' && type !== 'MainFrame') return;
    const response = params?.response;
    const sd = response?.securityDetails;
    const url = response?.url || '';
    const origin = originKeyFromUrl(url);
    if (!origin || !sd) return;
    const chain = chainFromSecurityDetails(sd);
    const tls = tlsFromSecurityDetails(sd);
    const existing = getStoredSecurity(origin, wcId);
    const mergedChain =
      chain.length && existing?.chain?.length > chain.length ? existing.chain : chain.length ? chain : existing?.chain || [];
    storeSecuritySnapshot(origin, wcId, {
      chain: mergedChain,
      meta: existing?.meta || { verificationResult: 'net::OK', isIssuedByKnownRoot: true },
      tls: tls || existing?.tls || null,
      certError: existing?.certError || null,
    });
    return;
  }

  if (method === 'Security.visibleSecurityStateChanged') {
    const vss = params?.visibleSecurityState;
    const origin = vss?.origin || '';
    const conn = vss?.connectionInfo;
    if (!origin || !conn?.protocol) return;
    const existing = getStoredSecurity(origin, wcId);
    storeSecuritySnapshot(origin, wcId, {
      chain: existing?.chain || [],
      meta: existing?.meta || { verificationResult: 'net::OK', isIssuedByKnownRoot: true },
      tls: {
        protocol: conn.protocol || '',
        cipher: conn.cipher || '',
        keyExchange: conn.keyExchange || '',
      },
      certError: existing?.certError || null,
    });
  }
}

async function fetchCertificateChainViaCdp(wc, origin) {
  if (!wc || wc.isDestroyed() || !origin) return [];
  const ready = await ensureGuestSecurityDebugger(wc);
  if (!ready) return [];
  try {
    const result = await wc.debugger.sendCommand('Security.getCertificate', { origin });
    const pems = Array.isArray(result?.tableEntry) ? result.tableEntry : [];
    const chain = pems.map(parsePemCertificate).filter(Boolean);
    return chain;
  } catch (_) {
    return [];
  }
}

async function captureSecurityForWebContents(wc, pageUrl) {
  if (!wc || wc.isDestroyed()) return null;
  const url = pageUrl || wc.getURL() || '';
  const origin = originKeyFromUrl(url);
  if (!origin) return null;

  await ensureGuestSecurityDebugger(wc);

  let stored = getStoredSecurity(origin, wc.id);
  let chain = stored?.chain || [];
  let tls = stored?.tls || null;

  const cdpChain = await fetchCertificateChainViaCdp(wc, origin);
  if (cdpChain.length > chain.length) chain = cdpChain;

  if (chain.length || tls) {
    storeSecuritySnapshot(origin, wc.id, {
      chain,
      meta: stored?.meta || { verificationResult: 'net::OK', isIssuedByKnownRoot: true },
      tls,
      certError: stored?.certError || null,
    });
    stored = getStoredSecurity(origin, wc.id);
  }

  return stored;
}

function installAxisPageSecurityOnWebContents(wc) {
  if (!wc || wc.isDestroyed() || axisGuestWatchInstalled.has(wc)) return;
  axisGuestWatchInstalled.add(wc);

  wc.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (!isMainFrame) return;
    const origin = originKeyFromUrl(url);
    if (!origin) return;
    void ensureGuestSecurityDebugger(wc);
  });

  wc.on('did-finish-load', () => {
    void captureSecurityForWebContents(wc);
  });

  wc.on('did-navigate-in-page', (_event, url) => {
    if (!url) return;
    void captureSecurityForWebContents(wc, url);
  });

  wc.on('destroyed', () => {
    axisSecurityByWebContentsId.delete(wc.id);
  });
}

function isCertCurrentlyValid(cert) {
  if (!cert) return false;
  const now = Date.now() / 1000;
  const start = Number(cert.validStart) || 0;
  const end = Number(cert.validExpiry) || 0;
  if (start && now < start) return false;
  if (end && now > end) return false;
  return true;
}

function buildTrust(meta, leaf, certError) {
  if (certError) {
    return { valid: false, message: humanizeCertError(certError) };
  }
  const vr = String(meta?.verificationResult || '').toLowerCase();
  if (vr && vr !== 'net::ok' && vr !== 'ok') {
    return { valid: false, message: humanizeCertError(meta.verificationResult) };
  }
  if (leaf && !isCertCurrentlyValid(leaf)) {
    return { valid: false, message: 'This certificate is expired or not yet valid.' };
  }
  if (meta?.isIssuedByKnownRoot === false) {
    return { valid: false, message: 'This certificate is not from a trusted authority.' };
  }
  return { valid: true, message: 'Certificate is valid' };
}

function humanizeCertError(error) {
  const e = String(error || '').toLowerCase();
  if (!e) return 'There is a problem with this site’s certificate.';
  if (e.includes('expired')) return 'This certificate has expired.';
  if (e.includes('date_invalid') || e.includes('not yet valid')) return 'This certificate is not yet valid.';
  if (e.includes('authority_invalid') || e.includes('untrusted')) return 'This certificate is not trusted.';
  if (e.includes('common_name_invalid') || e.includes('hostname')) return 'The certificate does not match this site.';
  if (e.includes('revoked')) return 'This certificate has been revoked.';
  return 'There is a problem with this site’s certificate.';
}

function formatTlsProtocol(raw) {
  const p = String(raw || '').trim();
  if (!p) return '';
  if (/^TLS\s/i.test(p) || /^QUIC/i.test(p)) return p;
  return `TLS ${p}`;
}

async function getPageSecurityInfo(webContentsId, pageUrl) {
  const id = Number(webContentsId) || 0;
  const wc = id > 0 ? webContents.fromId(id) : null;
  let url;
  try {
    const raw = pageUrl || (wc && !wc.isDestroyed() ? wc.getURL() : '') || '';
    url = new URL(raw);
  } catch (_) {
    return { state: 'unknown', hostname: '', protocol: '', origin: '', chain: [], facts: [] };
  }

  const protocol = url.protocol;
  const hostname = url.hostname;
  const origin = url.origin;

  if (protocol === 'http:') {
    return {
      state: 'insecure',
      hostname,
      protocol,
      origin,
      title: 'Connection is not secure',
      subtitle: 'Do not enter passwords or payment details on this site.',
      chain: [],
      facts: [
        { label: 'Connection', value: 'Not encrypted' },
        { label: 'Site', value: hostname },
      ],
    };
  }

  if (protocol !== 'https:') {
    const isFile = protocol === 'file:';
    return {
      state: isFile ? 'file' : 'local',
      hostname: hostname || (isFile ? 'Local file' : 'Local page'),
      protocol,
      origin,
      title: isFile ? 'Local file' : 'Local page',
      subtitle: 'No internet connection is used for this page.',
      chain: [],
      facts: [{ label: 'Connection', value: 'Local' }],
    };
  }

  if (wc && !wc.isDestroyed()) {
    await captureSecurityForWebContents(wc, url.href);
  }

  const stored = getStoredSecurity(origin, id);
  let chain = stored?.chain || [];
  const meta = stored?.meta || {};
  const certError = stored?.certError || null;
  const tls = stored?.tls || null;
  const leaf = chain[0] || null;
  const trust = buildTrust(meta, leaf, certError);
  const hasWarning = !trust.valid;

  const tlsProtocol = formatTlsProtocol(tls?.protocol);
  const facts = [
    { label: 'Connection', value: hasWarning ? 'Encrypted (certificate problem)' : 'Encrypted' },
  ];
  if (tlsProtocol) facts.push({ label: 'Protocol', value: tlsProtocol });
  if (tls?.cipher) facts.push({ label: 'Cipher', value: tls.cipher });
  if (leaf?.subjectName) facts.push({ label: 'Certificate', value: leaf.subjectName });
  if (leaf?.issuerName) facts.push({ label: 'Issued by', value: leaf.issuerName });
  if (leaf?.validExpiry) {
    facts.push({
      label: 'Valid until',
      value: new Date(leaf.validExpiry * 1000).toLocaleString(),
    });
  }
  if (!chain.length) {
    facts.push({ label: 'Certificate details', value: 'Reload this page, then open the lock again.' });
  }

  return {
    state: hasWarning ? 'warning' : 'secure',
    hostname,
    protocol,
    origin,
    title: hasWarning ? 'Certificate is not trusted' : 'Connection is secure',
    subtitle: hasWarning
      ? trust.message
      : `Your connection to ${hostname} is private.`,
    tlsProtocol: tlsProtocol || null,
    cipher: tls?.cipher || null,
    keyExchange: tls?.keyExchange || null,
    chain,
    leaf,
    trust,
    meta,
    certError,
    facts,
    certificateAvailable: chain.length > 0,
  };
}

module.exports = {
  installAxisPageSecurityOnSession,
  installAxisPageSecurityOnWebContents,
  getPageSecurityInfo,
  captureSecurityForWebContents,
};
