/**
 * Signs Axis.app so the bundle is internally consistent (avoids macOS "damaged" after DMG download).
 * Uses @electron/osx-sign (same stack as electron-builder). Developer ID when available; else ad-hoc.
 */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findDeveloperIdIdentity() {
    const fromEnv = String(process.env.CSC_NAME || process.env.APPLE_SIGNING_IDENTITY || '').trim();
    if (fromEnv && fromEnv !== '-') return fromEnv;
    try {
        const out = execFileSync('security', ['find-identity', '-v', '-p', 'codesigning'], { encoding: 'utf8' });
        for (const line of out.split('\n')) {
            if (line.includes('CSSMERR') || /0 valid identities/.test(line)) continue;
            const dev = line.match(/"(Developer ID Application:[^"]+)"/);
            if (dev) return dev[1];
        }
    } catch (_) {}
    return '-';
}

function verifyApp(appPath) {
    const r = spawnSync('codesign', ['--verify', '--deep', '--strict', appPath], { encoding: 'utf8' });
    if (r.status === 0) return;
    const loose = spawnSync('codesign', ['--verify', '--deep', appPath], { encoding: 'utf8' });
    if (loose.status !== 0) {
        throw new Error(loose.stderr || loose.stdout || 'codesign verify failed');
    }
}

async function signMacAppBundle(appPath, options = {}) {
    if (process.platform !== 'darwin') {
        console.log('[macos-codesign] skipped (not macOS)');
        return { identity: null, skipped: true };
    }
    if (!appPath || !fs.existsSync(appPath)) {
        throw new Error(`App bundle not found: ${appPath}`);
    }

    const identity = options.identity || findDeveloperIdIdentity();
    const adhoc = identity === '-';
    const entitlements =
        options.entitlements ||
        path.join(__dirname, '..', 'build', 'entitlements.mac.plist');

    console.log(`[macos-codesign] signing ${appPath}`);
    console.log(`[macos-codesign] identity: ${adhoc ? 'ad-hoc (-)' : identity}`);

    const { signApp } = require('@electron/osx-sign');
    await signApp({
        app: appPath,
        identity,
        identityValidation: false,
        hardenedRuntime: !adhoc,
        entitlements: adhoc ? undefined : entitlements,
        entitlementsInherit: adhoc ? undefined : entitlements,
        preAutoEntitlements: false,
        optionsForFile: () => ({
            timestamp: adhoc ? 'none' : undefined
        })
    });

    verifyApp(appPath);
    console.log('[macos-codesign] verify OK');
    return { identity, adhoc };
}

function signMacAppBundleSync(appPath, options = {}) {
    return signMacAppBundle(appPath, options);
}

module.exports = { signMacAppBundle, signMacAppBundleSync, findDeveloperIdIdentity, verifyApp };

if (require.main === module) {
    const app = process.argv[2];
    if (!app) {
        console.error('Usage: node scripts/macos-codesign-app.js /path/to/Axis.app');
        process.exit(1);
    }
    signMacAppBundle(path.resolve(app))
        .then(() => process.exit(0))
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
