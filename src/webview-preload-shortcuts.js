'use strict';

/**
 * Guest shortcuts: mapped Axis chords are claimed in capture phase before the page.
 * The shortcut map is pushed from main/renderer (axis-shortcut-map); do not rely on invoke alone.
 */
(function axisWebviewShortcutFallback() {
  try {
    const { ipcRenderer } = require('electron');
    const isMac = process.platform === 'darwin';

    /** @type {Map<string, string>} */
    let accelToAction = new Map();
    /** @type {Set<string>} */
    let singleKeyAccels = new Set();

    function normalizeKey(key) {
      if (!key || typeof key !== 'string') return '';
      if (key === 'ArrowLeft' || key === 'Left') return 'Left';
      if (key === 'ArrowRight' || key === 'Right') return 'Right';
      if (key === 'ArrowUp' || key === 'Up') return 'Up';
      if (key === 'ArrowDown' || key === 'Down') return 'Down';
      if (key === 'Escape') return 'Esc';
      if (key === ' ') return 'Space';
      if (key === '+') return '=';
      if (key.length === 1) return key.toUpperCase();
      return key;
    }

    function normalizeAccelerator(accel) {
      if (!accel || typeof accel !== 'string') return '';
      const parts = accel.split('+').map((p) => p.trim()).filter(Boolean);
      const mods = new Set();
      let key = null;
      for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === 'cmd' || lower === 'command') mods.add('Cmd');
        else if (lower === 'commandorcontrol') mods.add(isMac ? 'Cmd' : 'Ctrl');
        else if (lower === 'ctrl' || lower === 'control') mods.add('Ctrl');
        else if (lower === 'alt' || lower === 'option') mods.add('Alt');
        else if (lower === 'shift') mods.add('Shift');
        else key = normalizeKey(part);
      }
      const ordered = ['Ctrl', 'Alt', 'Shift', 'Cmd'].filter((m) => mods.has(m));
      if (!key) return ordered.join('+');
      return [...ordered, key].join('+');
    }

    function applyShortcutMap(map) {
      const next = new Map();
      const singles = new Set();
      if (map && typeof map === 'object') {
        for (const [action, binding] of Object.entries(map)) {
          if (!binding || binding === '__disabled__') continue;
          const accel = normalizeAccelerator(String(binding));
          if (!accel) continue;
          next.set(accel, action);
          if (!accel.includes('+')) singles.add(accel);
        }
      }
      accelToAction = next;
      singleKeyAccels = singles;
    }

    function acceleratorFromEvent(e) {
      const parts = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.altKey) parts.push('Alt');
      if (e.shiftKey) parts.push('Shift');
      if (isMac) {
        if (e.metaKey) parts.push('Cmd');
      } else if (e.metaKey) {
        parts.push('Ctrl');
      }
      const key = normalizeKey(e.key);
      if (!key || ['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) return null;
      return normalizeAccelerator([...parts, key].join('+'));
    }

    async function refreshShortcutMap() {
      try {
        const map = await ipcRenderer.invoke('get-shortcuts');
        applyShortcutMap(map);
      } catch (_) {}
    }

    ipcRenderer.on('axis-shortcut-map', (_event, map) => {
      applyShortcutMap(map);
    });

    void refreshShortcutMap();
    try {
      ipcRenderer.sendToHost('axis-shortcut-map-request');
    } catch (_) {}

    let lastClaimAt = 0;
    let lastClaimAccel = '';

    window.addEventListener(
      'keydown',
      (e) => {
        try {
          if (e.isComposing || e.__axisShortcutClaimed) return;
          const accel = acceleratorFromEvent(e);
          if (!accel) return;
          const action = accelToAction.get(accel);
          if (!action) return;
          const hasChordMod = !!(e.ctrlKey || e.altKey || e.metaKey || e.shiftKey);
          if (!hasChordMod && !singleKeyAccels.has(accel)) return;
          const now = Date.now();
          if (lastClaimAccel === accel && now - lastClaimAt < 140) return;
          lastClaimAccel = accel;
          lastClaimAt = now;
          e.__axisShortcutClaimed = true;
          e.preventDefault();
          e.stopPropagation();
          ipcRenderer.sendToHost('axis-shortcut-fallback', {
            key: e.key,
            code: e.code,
            control: !!e.ctrlKey,
            alt: !!e.altKey,
            shift: !!e.shiftKey,
            meta: !!e.metaKey,
            isAutoRepeat: !!e.repeat,
            accel,
            action
          });
        } catch (_) {}
      },
      true
    );
  } catch (_) {}
})();
