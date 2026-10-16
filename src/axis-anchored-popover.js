'use strict';

/**
 * Position tab-ancestry / site-style panels under or above a sidebar anchor, flipping when needed.
 */
(function (root) {
  function isUsableAnchorRect(r) {
    return r && r.width >= 4 && r.height >= 4;
  }

  function positionAnchoredPopover(panel, arrow, opts = {}) {
    if (!panel) return;
    const sidebarInset = opts.sidebarInset ?? 8;
    const gap = opts.gap ?? 4;
    const arrowSize = opts.arrowSize ?? 8;
    const panelWidth = opts.panelWidth ?? 248;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const sidebar = document.getElementById('sidebar');
    const sideRect = sidebar?.getBoundingClientRect?.();
    const tabsScroller =
      opts.scrollRoot ||
      document.querySelector('.tabs-container') ||
      document.querySelector('#tabs-container');

    let anchorX;
    let anchorTop;
    let anchorBottom;
    const anchorEl = opts.anchorEl;
    const anchorPoint = opts.anchorPoint;

    if (anchorEl && anchorEl.getBoundingClientRect) {
      const r = anchorEl.getBoundingClientRect();
      if (isUsableAnchorRect(r)) {
        anchorX = r.left + r.width / 2;
        anchorTop = r.top;
        anchorBottom = r.bottom;
      } else if (anchorPoint && Number.isFinite(anchorPoint.x) && Number.isFinite(anchorPoint.y)) {
        anchorX = anchorPoint.x;
        anchorTop = anchorPoint.y - 14;
        anchorBottom = anchorPoint.y;
      } else {
        anchorX = vw * 0.5;
        anchorTop = 72;
        anchorBottom = 92;
      }
    } else if (anchorPoint && Number.isFinite(anchorPoint.x) && Number.isFinite(anchorPoint.y)) {
      anchorX = anchorPoint.x;
      anchorTop = anchorPoint.y - 14;
      anchorBottom = anchorPoint.y;
    } else {
      anchorX = vw * 0.5;
      anchorTop = 72;
      anchorBottom = 92;
    }

    if (tabsScroller && anchorEl && tabsScroller.contains(anchorEl)) {
      try {
        const sr = tabsScroller.getBoundingClientRect();
        anchorTop = Math.max(anchorTop, sr.top + 4);
        anchorBottom = Math.min(anchorBottom, sr.bottom - 4);
        if (anchorBottom <= anchorTop) {
          anchorTop = sr.top + 8;
          anchorBottom = sr.bottom - 8;
        }
      } catch (_) {}
    }

    const sideLeft = sideRect ? sideRect.left + sidebarInset : sidebarInset;
    const sideRight = sideRect ? sideRect.right - sidebarInset : vw - sidebarInset;
    const width = Math.min(panelWidth, Math.max(160, sideRight - sideLeft));
    let left = anchorX - width / 2;
    left = Math.max(sideLeft, Math.min(left, sideRight - width));

    panel.style.width = `${width}px`;
    panel.style.left = `${left}px`;

    const wasHidden = panel.classList.contains('hidden');
    const prevVis = panel.style.visibility;
    const prevPos = panel.style.position;
    if (wasHidden) panel.classList.remove('hidden');
    panel.style.visibility = 'hidden';
    panel.style.position = 'fixed';
    panel.style.pointerEvents = 'none';
    const measuredH = Math.max(panel.offsetHeight || 0, opts.minHeight || 120);
    panel.style.visibility = prevVis || '';
    panel.style.position = prevPos || '';
    panel.style.pointerEvents = '';
    if (wasHidden) panel.classList.add('hidden');

    const spaceBelow = vh - anchorBottom - sidebarInset;
    const spaceAbove = anchorTop - sidebarInset;
    const need = measuredH + gap + arrowSize;
    let below = spaceBelow >= need || spaceBelow >= spaceAbove;
    if (spaceBelow < need && spaceAbove >= need) below = false;
    else if (spaceBelow < need && spaceAbove < need) below = spaceBelow >= spaceAbove;

    const anchorMidY = (anchorTop + anchorBottom) / 2;
    if (below && spaceBelow < need && anchorMidY > vh * 0.62 && spaceAbove > spaceBelow) {
      below = false;
    }

    panel.classList.toggle('is-anchor-below', below);
    panel.classList.toggle('is-anchor-above', !below);

    let top;
    if (below) {
      top = anchorBottom + gap;
    } else {
      top = anchorTop - gap - measuredH;
    }
    const maxTop = vh - sidebarInset - Math.min(measuredH, vh - sidebarInset * 2);
    top = Math.max(sidebarInset, Math.min(top, maxTop));

    panel.style.top = `${Math.round(top)}px`;

    const arrowX = Math.max(14, Math.min(anchorX - left, width - 14));
    if (arrow) {
      const showArrow = !!(anchorEl || anchorPoint);
      arrow.style.display = showArrow ? '' : 'none';
      arrow.style.left = `${arrowX}px`;
      arrow.style.marginLeft = '-7px';
    }
    panel.style.setProperty('--tab-ancestry-origin-x', `${Math.round(arrowX)}px`);
    panel.style.setProperty('--ta-arrow-x', `${arrowX}px`);
    panel.style.transformOrigin = below ? `${arrowX}px 0` : `${arrowX}px 100%`;
  }

  root.AxisAnchoredPopover = { position: positionAnchoredPopover };
})(typeof window !== 'undefined' ? window : globalThis);
