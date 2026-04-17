/**
 * Shared between `scripts/run-electron.js` (filters native NSLog before Node loads) and `src/main.js`.
 * macOS quit often prints AppKit menu teardown noise that bypasses `process.stderr.write` patching.
 */
module.exports = [
  'GUEST_VIEW_MANAGER_CALL',
  'ERR_BLOCKED_BY_RESPONSE',
  'ERR_NAME_NOT_RESOLVED',
  'Failed to load URL',
  'sysctlbyname',
  'kern.hv_vmm_present',
  'blink.mojom',
  'interface_endpoint_client',
  'representedObject is not a WeakPtrToElectronMenuModelAsNSObject',
  'WeakPtrToElectronMenuModelAsNSObject'
];
