'use strict';

/**
 * Guest-frame preload: when Privacy protection is on, injects a light anti-fingerprinting
 * script into the page world (canvas / WebGL / audio / hardware hints).
 * Respects the same on/off + per-site allowlist as the network blocker.
 */
(function axisFingerprintPreload() {
  try {
    const { ipcRenderer, webFrame } = require('electron');

    const INJECT = `(() => {
  if (window.__axisFpGuard) return;
  window.__axisFpGuard = 1;
  try {
    const noise = (n) => {
      const x = Math.sin(n * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };
    let seed = 0;
    try {
      const h = String(location.hostname || '');
      for (let i = 0; i < h.length; i++) seed = (seed + h.charCodeAt(i) * (i + 1)) >>> 0;
    } catch (_) {
      seed = 7;
    }

    const patchCanvas = (proto, method) => {
      if (!proto || typeof proto[method] !== 'function') return;
      const orig = proto[method];
      proto[method] = function (...args) {
        try {
          if (this && typeof this.getContext === 'function') {
            const ctx = this.getContext('2d');
            if (ctx && this.width > 0 && this.height > 0) {
              const x = (seed % Math.max(1, this.width - 1)) | 0;
              const y = ((seed >> 3) % Math.max(1, this.height - 1)) | 0;
              const img = ctx.getImageData(x, y, 1, 1);
              const d = img.data;
              d[0] = (d[0] + (noise(seed + 1) > 0.5 ? 1 : -1) + 256) % 256;
              d[1] = (d[1] + (noise(seed + 2) > 0.5 ? 1 : -1) + 256) % 256;
              ctx.putImageData(img, x, y);
            }
          }
        } catch (_) {}
        return orig.apply(this, args);
      };
    };
    try {
      patchCanvas(HTMLCanvasElement.prototype, 'toDataURL');
      patchCanvas(HTMLCanvasElement.prototype, 'toBlob');
    } catch (_) {}

    try {
      const gproto = typeof WebGLRenderingContext !== 'undefined' && WebGLRenderingContext.prototype;
      const g2 = typeof WebGL2RenderingContext !== 'undefined' && WebGL2RenderingContext.prototype;
      const wrapParam = (proto) => {
        if (!proto || typeof proto.getParameter !== 'function') return;
        const orig = proto.getParameter;
        proto.getParameter = function (p) {
          const v = orig.apply(this, arguments);
          try {
            const VENDOR = 0x9245;
            const RENDERER = 0x9246;
            if (p === VENDOR) return 'Google Inc.';
            if (p === RENDERER) return 'ANGLE (Axis Protected)';
          } catch (_) {}
          return v;
        };
      };
      wrapParam(gproto);
      wrapParam(g2);
    } catch (_) {}

    try {
      if (typeof AnalyserNode !== 'undefined' && AnalyserNode.prototype) {
        const wrap = (method) => {
          const orig = AnalyserNode.prototype[method];
          if (typeof orig !== 'function') return;
          AnalyserNode.prototype[method] = function (array) {
            orig.apply(this, arguments);
            try {
              if (array && array.length) {
                const i = seed % array.length;
                array[i] = array[i] + (noise(seed + i) > 0.5 ? 1 : -1);
              }
            } catch (_) {}
            return array;
          };
        };
        wrap('getFloatFrequencyData');
        wrap('getByteFrequencyData');
        wrap('getFloatTimeDomainData');
        wrap('getByteTimeDomainData');
      }
    } catch (_) {}

    try {
      if (navigator && 'hardwareConcurrency' in navigator) {
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          configurable: true,
          get: () => 8
        });
      }
    } catch (_) {}
    try {
      if (navigator && 'deviceMemory' in navigator) {
        Object.defineProperty(navigator, 'deviceMemory', {
          configurable: true,
          get: () => 8
        });
      }
    } catch (_) {}
  } catch (_) {}
})();`;

    let injectedFor = '';

    function shouldProtect(url) {
      try {
        if (!url || !/^https?:/i.test(url)) return false;
        // Media sites are sensitive to canvas/WebGL noise; lists still block ads/trackers.
        const host = new URL(url).hostname.toLowerCase();
        if (
          host === 'youtu.be' ||
          host === 'youtube.com' ||
          host.endsWith('.youtube.com') ||
          host.endsWith('.youtu.be') ||
          host === 'youtube-nocookie.com' ||
          host.endsWith('.youtube-nocookie.com')
        ) {
          return false;
        }
        return ipcRenderer.sendSync('axis-privacy-fp-enabled', url) === true;
      } catch (_) {
        return false;
      }
    }

    function injectIfNeeded() {
      try {
        const url = String(location.href || '');
        if (!shouldProtect(url)) return;
        if (injectedFor === url) return;
        injectedFor = url;
        const p = webFrame.executeJavaScript(INJECT, true);
        if (p && typeof p.then === 'function') {
          p.then(() => {
            try {
              ipcRenderer.send('axis-privacy-fp-applied', url);
            } catch (_) {}
          }).catch(() => {
            // Page navigated or script world not ready - safe to ignore.
            if (injectedFor === url) injectedFor = '';
          });
        }
      } catch (_) {
        injectedFor = '';
      }
    }

    injectIfNeeded();
    try {
      window.addEventListener('DOMContentLoaded', injectIfNeeded, true);
    } catch (_) {}
    try {
      document.addEventListener('readystatechange', injectIfNeeded, true);
    } catch (_) {}
  } catch (_) {
    /* preload context missing */
  }
})();
