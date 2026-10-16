'use strict';

/** Verb + target pairs users pick to build custom shortcut macros. */
(function (root) {
  const VERBS = [
    { id: 'open', label: 'Open' },
    { id: 'close', label: 'Close' },
    { id: 'toggle', label: 'Toggle' },
    { id: 'navigate', label: 'Go' },
    { id: 'reload', label: 'Reload' },
    { id: 'scroll', label: 'Scroll' },
    { id: 'copy', label: 'Copy' },
    { id: 'paste', label: 'Paste' },
    { id: 'focus', label: 'Focus' },
    { id: 'switch', label: 'Switch to' },
    { id: 'zoom', label: 'Zoom' },
    { id: 'pin', label: 'Pin' },
    { id: 'duplicate', label: 'Duplicate' },
    { id: 'undo', label: 'Undo' },
    { id: 'run', label: 'Run' }
  ];

  /** verb → [{ target, label, action }] */
  const TARGETS = {
    open: [
      { target: 'new-tab', label: 'New tab', action: 'new-tab' },
      { target: 'spotlight', label: 'Spotlight search', action: 'show-spotlight' },
      { target: 'home', label: 'Home page', action: 'open-home' },
      { target: 'incognito', label: 'Incognito window', action: 'open-incognito-window' },
      { target: 'settings', label: 'Settings', action: 'settings' },
      { target: 'history', label: 'History', action: 'history' },
      { target: 'downloads', label: 'Downloads', action: 'downloads' },
      { target: 'devtools', label: 'Developer tools', action: 'open-devtools' },
      { target: 'find', label: 'Find bar', action: 'find' },
      { target: 'current-in-new-tab', label: 'Current page in new tab', action: 'open-current-in-new-tab' },
      { target: 'settings-ai', label: 'Settings → AI', action: 'open-settings-ai' },
      { target: 'settings-vault', label: 'Settings → Vault', action: 'open-settings-vault' },
      { target: 'settings-extensions', label: 'Settings → Extensions', action: 'open-settings-extensions' },
      { target: 'settings-permissions', label: 'Settings → Permissions', action: 'open-settings-permissions' },
      { target: 'settings-profiles', label: 'Settings → Profiles', action: 'open-settings-profiles' },
      { target: 'settings-newtab', label: 'Settings → New tab', action: 'open-settings-newtab' },
      { target: 'settings-appearance', label: 'Settings → Appearance', action: 'open-settings-customization' },
      { target: 'settings-gestures', label: 'Settings → Gestures', action: 'open-gestures-settings' },
      { target: 'settings-shortcuts', label: 'Settings → Shortcuts', action: 'open-shortcuts-settings' }
    ],
    close: [
      { target: 'tab', label: 'Active tab', action: 'close-tab' },
      { target: 'other-tabs', label: 'Other tabs', action: 'close-other-tabs' },
      { target: 'popups', label: 'All panels & menus', action: 'close-all-popups' },
      { target: 'find', label: 'Find bar', action: 'toggle-find-bar' }
    ],
    toggle: [
      { target: 'sidebar', label: 'Sidebar', action: 'toggle-sidebar' },
      { target: 'sidebar-position', label: 'Sidebar side', action: 'toggle-sidebar-position' },
      { target: 'sidebar-plus', label: 'Sidebar + menu', action: 'toggle-sidebar-plus' },
      { target: 'settings', label: 'Settings panel', action: 'settings' },
      { target: 'chat', label: 'AI chat', action: 'toggle-chat' },
      { target: 'notes', label: 'Notes', action: 'toggle-notes' },
      { target: 'extensions', label: 'Extensions menu', action: 'toggle-extensions' },
      { target: 'adblock', label: 'Ad blocker panel', action: 'toggle-adblock' },
      { target: 'downloads', label: 'Downloads panel', action: 'toggle-downloads-panel' },
      { target: 'find', label: 'Find bar', action: 'toggle-find-bar' },
      { target: 'mute-tab', label: 'Tab mute', action: 'toggle-mute-tab' },
      { target: 'tab-mono', label: 'Tab mono audio', action: 'toggle-tab-mono' },
      { target: 'fullscreen', label: 'Page fullscreen', action: 'toggle-fullscreen' },
      { target: 'pin-tab', label: 'Tab pin', action: 'pin-tab' }
    ],
    navigate: [
      { target: 'back', label: 'Back', action: 'go-back' },
      { target: 'forward', label: 'Forward', action: 'go-forward' },
      { target: 'home', label: 'Home', action: 'open-home' },
      { target: 'stop', label: 'Stop loading', action: 'stop-loading' }
    ],
    reload: [
      { target: 'page', label: 'Current page', action: 'refresh' },
      { target: 'hard', label: 'Hard reload', action: 'hard-reload' },
      { target: 'all-tabs', label: 'All tabs', action: 'reload-all-tabs' }
    ],
    scroll: [
      { target: 'up', label: 'One page up', action: 'scroll-page-up' },
      { target: 'down', label: 'One page down', action: 'scroll-page-down' },
      { target: 'line-up', label: 'One line up', action: 'scroll-line-up' },
      { target: 'line-down', label: 'One line down', action: 'scroll-line-down' },
      { target: 'left', label: 'Left', action: 'scroll-left' },
      { target: 'right', label: 'Right', action: 'scroll-right' },
      { target: 'top', label: 'To top', action: 'scroll-to-top' },
      { target: 'bottom', label: 'To bottom', action: 'scroll-to-bottom' },
      { target: 'page-up', label: 'Page up', action: 'page-up' },
      { target: 'page-down', label: 'Page down', action: 'page-down' }
    ],
    copy: [
      { target: 'url', label: 'Page URL', action: 'copy-url' },
      { target: 'url-markdown', label: 'URL as Markdown', action: 'copy-url-markdown' },
      { target: 'title', label: 'Page title', action: 'copy-title' },
      { target: 'title-and-url', label: 'Title + URL', action: 'copy-page-url-and-title' },
      { target: 'selection', label: 'Selection', action: 'copy-selection' }
    ],
    paste: [
      { target: 'page', label: 'Into page field', action: 'paste-to-page' },
      { target: 'match-style', label: 'Match style', action: 'paste-match-style' }
    ],
    focus: [
      { target: 'url-bar', label: 'Address bar', action: 'focus-url' },
      { target: 'page', label: 'Page content', action: 'focus-page' }
    ],
    switch: [
      { target: 'next-tab', label: 'Next tab', action: 'next-tab' },
      { target: 'previous-tab', label: 'Previous tab', action: 'previous-tab' },
      { target: 'tab-1', label: 'Tab 1', action: 'switch-tab-1' },
      { target: 'tab-2', label: 'Tab 2', action: 'switch-tab-2' },
      { target: 'tab-3', label: 'Tab 3', action: 'switch-tab-3' },
      { target: 'tab-4', label: 'Tab 4', action: 'switch-tab-4' },
      { target: 'tab-5', label: 'Tab 5', action: 'switch-tab-5' },
      { target: 'tab-6', label: 'Tab 6', action: 'switch-tab-6' },
      { target: 'tab-7', label: 'Tab 7', action: 'switch-tab-7' },
      { target: 'tab-8', label: 'Tab 8', action: 'switch-tab-8' },
      { target: 'tab-9', label: 'Tab 9', action: 'switch-tab-9' },
      { target: 'next-profile', label: 'Next profile', action: 'next-profile' },
      { target: 'previous-profile', label: 'Previous profile', action: 'previous-profile' }
    ],
    zoom: [
      { target: 'in', label: 'Zoom in', action: 'zoom-in' },
      { target: 'out', label: 'Zoom out', action: 'zoom-out' },
      { target: 'reset', label: 'Reset zoom', action: 'reset-zoom' }
    ],
    pin: [{ target: 'tab', label: 'Current tab', action: 'pin-tab' }],
    duplicate: [{ target: 'tab', label: 'Current tab', action: 'duplicate-tab' }],
    undo: [
      { target: 'close-tab', label: 'Closed tab', action: 'recover-tab' },
      { target: 'reopen-tab', label: 'Last closed tab', action: 'reopen-closed-tab' }
    ],
    run: [
      { target: 'find-selection', label: 'Find selection', action: 'search-selection' },
      { target: 'select-all', label: 'Select all', action: 'select-all' },
      { target: 'print', label: 'Print page', action: 'print' },
      { target: 'view-source', label: 'View source', action: 'view-source' },
      { target: 'favorites', label: 'Add to favorites', action: 'add-to-favorites' },
      { target: 'clear-history', label: 'Clear history', action: 'clear-history' },
      { target: 'volume-up', label: 'Tab volume up', action: 'tab-volume-up' },
      { target: 'volume-down', label: 'Tab volume down', action: 'tab-volume-down' },
      { target: 'cut', label: 'Cut in page', action: 'guest-cut' },
      { target: 'copy', label: 'Copy in page', action: 'guest-copy' },
      { target: 'paste', label: 'Paste in page', action: 'guest-paste' },
      { target: 'undo-edit', label: 'Undo edit', action: 'guest-undo' },
      { target: 'redo-edit', label: 'Redo edit', action: 'guest-redo' }
    ]
  };

  const ACTION_TO_PAIR = {};
  for (const [verb, list] of Object.entries(TARGETS)) {
    for (const row of list) {
      ACTION_TO_PAIR[row.action] = { verb, target: row.target, label: `${VERBS.find((v) => v.id === verb)?.label || verb} ${row.label}` };
    }
  }

  function targetsForVerb(verb) {
    return TARGETS[verb] || [];
  }

  function defaultTargetForVerb(verb) {
    const list = targetsForVerb(verb);
    return list[0]?.target || '';
  }

  function resolveAction(verb, target) {
    const row = targetsForVerb(verb).find((r) => r.target === target);
    return row ? row.action : null;
  }

  function stepLabel(verb, target) {
    const v = VERBS.find((x) => x.id === verb);
    const row = targetsForVerb(verb).find((r) => r.target === target);
    if (!v || !row) return `${verb} ${target}`;
    return `${v.label} ${row.label}`;
  }

  function actionToBuilderStep(action) {
    const hit = ACTION_TO_PAIR[action];
    if (hit) return { verb: hit.verb, target: hit.target };
    return { verb: 'reload', target: 'page' };
  }

  function builderStepsToActions(steps) {
    const out = [];
    for (const step of steps || []) {
      if (typeof step === 'string') {
        out.push(step);
        continue;
      }
      if (step && step.verb && step.target) {
        const action = resolveAction(step.verb, step.target);
        if (action) out.push(action);
      }
    }
    return out;
  }

  function verbOptions(selected, placeholder = '—') {
    const head = `<option value=""${selected ? '' : ' selected'} disabled hidden>${placeholder}</option>`;
    return (
      head +
      VERBS.map(
        (v) =>
          `<option value="${v.id}"${selected === v.id ? ' selected' : ''}>${v.label}</option>`
      ).join('')
    );
  }

  function targetOptions(verb, selected, placeholder = '—') {
    const head = `<option value=""${selected ? '' : ' selected'} disabled hidden>${placeholder}</option>`;
    return (
      head +
      targetsForVerb(verb)
        .map(
          (r) =>
            `<option value="${r.target}"${selected === r.target ? ' selected' : ''}>${r.label}</option>`
        )
        .join('')
    );
  }

  root.AXIS_SHORTCUT_BUILDER = {
    VERBS,
    TARGETS,
    targetsForVerb,
    defaultTargetForVerb,
    resolveAction,
    stepLabel,
    actionToBuilderStep,
    builderStepsToActions,
    verbOptions,
    targetOptions
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = root.AXIS_SHORTCUT_BUILDER;
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
