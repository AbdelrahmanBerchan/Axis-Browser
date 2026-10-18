/** electron-builder afterPack: sign the .app before the DMG is created. */
const path = require('path');
const { signMacAppBundle } = require('./macos-codesign-app');

module.exports = async function afterPack(context) {
    if (context.electronPlatformName !== 'darwin') return;
    const productName = context.packager.appInfo.productFilename;
    const appPath = path.join(context.appOutDir, `${productName}.app`);
    await signMacAppBundle(appPath);
};
