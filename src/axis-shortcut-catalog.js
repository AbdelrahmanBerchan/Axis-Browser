'use strict';

/** Canonical browser functions users can chain in custom shortcuts. */
(function (root) {
  const CATALOG = [
    { id: 'go-back', fn: 'BrowserApp.goBack()', desc: 'Navigate back in tab history' },
    { id: 'go-forward', fn: 'BrowserApp.goForward()', desc: 'Navigate forward in tab history' },
    { id: 'refresh', fn: 'BrowserApp.refresh()', desc: 'Reload the active tab' },
    { id: 'hard-reload', fn: 'BrowserApp.hardReload()', desc: 'Reload ignoring cache' },
    { id: 'stop-loading', fn: 'BrowserApp.stopLoading()', desc: 'Stop loading the page' },
    { id: 'focus-url', fn: 'BrowserApp.focusUrlBar()', desc: 'Focus the address bar' },
    { id: 'open-home', fn: 'BrowserApp.openHome()', desc: 'Open new tab / home page' },
    { id: 'view-source', fn: 'BrowserApp.viewSource()', desc: 'Open view-source for page' },
    { id: 'find', fn: 'BrowserApp.toggleFind()', desc: 'Open find-in-page bar' },
    { id: 'toggle-find-bar', fn: 'BrowserApp.toggleSearch()', desc: 'Toggle find-in-page bar' },
    { id: 'search-selection', fn: 'BrowserApp.findSelection()', desc: 'Find selected text on page' },
    { id: 'print', fn: 'BrowserApp.printPage()', desc: 'Print active page' },
    { id: 'select-all', fn: 'BrowserApp.selectAll()', desc: 'Select all in page or field' },
    { id: 'paste-match-style', fn: 'BrowserApp.pasteMatchStyle()', desc: 'Paste matching document style' },
    { id: 'focus-page', fn: 'BrowserApp.focusPage()', desc: 'Focus guest page content' },
    { id: 'toggle-fullscreen', fn: 'GuestPage.toggleFullscreen()', desc: 'Toggle page fullscreen' },
    { id: 'open-devtools', fn: 'BrowserApp.openDevTools()', desc: 'Open DevTools for active tab' },
    { id: 'scroll-page-up', fn: 'GuestPage.scrollBy(-page)', desc: 'Scroll one page up' },
    { id: 'scroll-page-down', fn: 'GuestPage.scrollBy(+page)', desc: 'Scroll one page down' },
    { id: 'scroll-line-up', fn: 'GuestPage.scrollBy(-line)', desc: 'Scroll one line up' },
    { id: 'scroll-line-down', fn: 'GuestPage.scrollBy(+line)', desc: 'Scroll one line down' },
    { id: 'scroll-left', fn: 'GuestPage.scrollBy(-48, 0)', desc: 'Scroll content left' },
    { id: 'scroll-right', fn: 'GuestPage.scrollBy(+48, 0)', desc: 'Scroll content right' },
    { id: 'scroll-to-top', fn: 'GuestPage.scrollToTop()', desc: 'Scroll to top of page' },
    { id: 'scroll-to-bottom', fn: 'GuestPage.scrollToBottom()', desc: 'Scroll to bottom of page' },
    { id: 'page-up', fn: 'GuestPage.pageUp()', desc: 'Page up' },
    { id: 'page-down', fn: 'GuestPage.pageDown()', desc: 'Page down' },
    { id: 'guest-cut', fn: 'GuestPage.execCommand("cut")', desc: 'Cut selection in page' },
    { id: 'guest-copy', fn: 'GuestPage.execCommand("copy")', desc: 'Copy selection in page' },
    { id: 'guest-paste', fn: 'GuestPage.execCommand("paste")', desc: 'Paste into focused field' },
    { id: 'guest-undo', fn: 'GuestPage.execCommand("undo")', desc: 'Undo in editable field' },
    { id: 'guest-redo', fn: 'GuestPage.execCommand("redo")', desc: 'Redo in editable field' },
    { id: 'copy-selection', fn: 'GuestPage.copySelection()', desc: 'Copy selected text' },
    { id: 'paste-to-page', fn: 'GuestPage.pasteToFocusedField()', desc: 'Paste into focused field' },
    { id: 'close-tab', fn: 'BrowserApp.closeTab()', desc: 'Close active tab' },
    { id: 'close-current-tab', fn: 'BrowserApp.closeCurrentTab()', desc: 'Close active tab' },
    { id: 'close-other-tabs', fn: 'BrowserApp.closeOtherTabs()', desc: 'Close all tabs except active' },
    { id: 'spotlight-search', fn: 'BrowserApp.newTabSpotlight()', desc: 'New tab with spotlight' },
    { id: 'show-spotlight', fn: 'BrowserApp.showSpotlightSearch()', desc: 'Open spotlight search overlay' },
    { id: 'new-tab', fn: 'BrowserApp.createNewTab()', desc: 'Create new tab' },
    { id: 'duplicate-tab', fn: 'BrowserApp.duplicateTab()', desc: 'Duplicate active tab' },
    { id: 'open-current-in-new-tab', fn: 'BrowserApp.openCurrentInNewTab()', desc: 'Open current URL in new tab' },
    { id: 'next-tab', fn: 'BrowserApp.nextTab()', desc: 'Switch to next tab' },
    { id: 'previous-tab', fn: 'BrowserApp.previousTab()', desc: 'Switch to previous tab' },
    { id: 'pin-tab', fn: 'BrowserApp.togglePinTab()', desc: 'Pin or unpin tab' },
    { id: 'toggle-pin-current', fn: 'BrowserApp.togglePinCurrentTab()', desc: 'Pin or unpin current tab' },
    { id: 'toggle-mute-tab', fn: 'BrowserApp.toggleTabMute()', desc: 'Mute or unmute tab audio' },
    { id: 'reopen-closed-tab', fn: 'BrowserApp.reopenClosedTab()', desc: 'Reopen last closed tab' },
    { id: 'recover-tab', fn: 'BrowserApp.undoCloseTab()', desc: 'Undo tab close' },
    { id: 'reload-all-tabs', fn: 'BrowserApp.reloadAllTabs()', desc: 'Reload every open tab' },
    { id: 'switch-tab-1', fn: 'BrowserApp.switchToTab(1)', desc: 'Switch to tab 1' },
    { id: 'switch-tab-2', fn: 'BrowserApp.switchToTab(2)', desc: 'Switch to tab 2' },
    { id: 'switch-tab-3', fn: 'BrowserApp.switchToTab(3)', desc: 'Switch to tab 3' },
    { id: 'switch-tab-4', fn: 'BrowserApp.switchToTab(4)', desc: 'Switch to tab 4' },
    { id: 'switch-tab-5', fn: 'BrowserApp.switchToTab(5)', desc: 'Switch to tab 5' },
    { id: 'switch-tab-6', fn: 'BrowserApp.switchToTab(6)', desc: 'Switch to tab 6' },
    { id: 'switch-tab-7', fn: 'BrowserApp.switchToTab(7)', desc: 'Switch to tab 7' },
    { id: 'switch-tab-8', fn: 'BrowserApp.switchToTab(8)', desc: 'Switch to tab 8' },
    { id: 'switch-tab-9', fn: 'BrowserApp.switchToTab(9)', desc: 'Switch to tab 9' },
    { id: 'open-incognito-window', fn: 'BrowserApp.openIncognitoWindow()', desc: 'Open incognito window' },
    { id: 'next-profile', fn: 'BrowserApp.nextProfile()', desc: 'Switch to next profile' },
    { id: 'previous-profile', fn: 'BrowserApp.previousProfile()', desc: 'Switch to previous profile' },
    { id: 'toggle-sidebar', fn: 'BrowserApp.toggleSidebar()', desc: 'Show or hide sidebar' },
    { id: 'toggle-sidebar-position', fn: 'BrowserApp.toggleSidebarPosition()', desc: 'Move sidebar left/right' },
    { id: 'toggle-sidebar-plus', fn: 'BrowserApp.toggleSidebarPlusMenu()', desc: 'Toggle sidebar + menu' },
    { id: 'copy-url', fn: 'BrowserApp.copyCurrentUrl()', desc: 'Copy page URL' },
    { id: 'copy-url-markdown', fn: 'BrowserApp.copyUrlMarkdown()', desc: 'Copy URL as Markdown' },
    { id: 'copy-title', fn: 'BrowserApp.copyPageTitle()', desc: 'Copy page title' },
    { id: 'copy-page-url-and-title', fn: 'BrowserApp.copyTitleAndUrl()', desc: 'Copy title and URL' },
    { id: 'zoom-in', fn: 'BrowserApp.zoomIn()', desc: 'Increase page zoom' },
    { id: 'zoom-out', fn: 'BrowserApp.zoomOut()', desc: 'Decrease page zoom' },
    { id: 'reset-zoom', fn: 'BrowserApp.resetZoom()', desc: 'Reset page zoom' },
    { id: 'tab-volume-up', fn: 'BrowserApp.tabVolumeUp()', desc: 'Increase tab volume' },
    { id: 'tab-volume-down', fn: 'BrowserApp.tabVolumeDown()', desc: 'Decrease tab volume' },
    { id: 'toggle-tab-mono', fn: 'BrowserApp.toggleTabMono()', desc: 'Toggle tab mono audio' },
    { id: 'history', fn: 'BrowserApp.openHistory()', desc: 'Open history panel' },
    { id: 'downloads', fn: 'BrowserApp.openDownloads()', desc: 'Open downloads' },
    { id: 'toggle-downloads-panel', fn: 'BrowserApp.toggleDownloads()', desc: 'Toggle downloads panel' },
    { id: 'settings', fn: 'BrowserApp.toggleSettings()', desc: 'Toggle settings' },
    { id: 'toggle-chat', fn: 'BrowserApp.toggleAIChat()', desc: 'Toggle AI chat panel' },
    { id: 'toggle-ai-chat', fn: 'BrowserApp.toggleAIChat()', desc: 'Toggle AI chat panel' },
    { id: 'toggle-notes', fn: 'BrowserApp.toggleNotes()', desc: 'Toggle notes panel' },
    { id: 'toggle-extensions', fn: 'BrowserApp.toggleExtensionsMenu()', desc: 'Toggle extensions menu' },
    { id: 'toggle-adblock', fn: 'BrowserApp.toggleAdblockPanel()', desc: 'Toggle ad blocker panel' },
    { id: 'close-all-popups', fn: 'BrowserApp.closeAllPopups()', desc: 'Close open panels and menus' },
    { id: 'clear-history', fn: 'BrowserApp.clearHistory()', desc: 'Clear browsing history' },
    { id: 'add-to-favorites', fn: 'BrowserApp.addTabToFavorites()', desc: 'Add tab to favorites' },
    { id: 'open-settings-newtab', fn: 'BrowserApp.openSettings("newtab")', desc: 'Settings → New tab' },
    { id: 'open-settings-vault', fn: 'BrowserApp.openSettings("vault")', desc: 'Settings → Vault' },
    { id: 'open-settings-extensions', fn: 'BrowserApp.openSettings("extensions")', desc: 'Settings → Extensions' },
    { id: 'open-settings-permissions', fn: 'BrowserApp.openSettings("permissions")', desc: 'Settings → Permissions' },
    { id: 'open-settings-profiles', fn: 'BrowserApp.openSettings("profiles")', desc: 'Settings → Profiles' },
    { id: 'open-settings-ai', fn: 'BrowserApp.openSettings("ai")', desc: 'Settings → AI Chat' },
    { id: 'open-settings-customization', fn: 'BrowserApp.openSettings("customization")', desc: 'Settings → Appearance' },
    { id: 'open-settings-screentime', fn: 'BrowserApp.openSettings("screentime")', desc: 'Settings → Screen time' },
    { id: 'open-settings-history', fn: 'BrowserApp.openSettingsTab("history")', desc: 'Settings → History' },
    { id: 'open-permissions-settings', fn: 'BrowserApp.openSettings("permissions")', desc: 'Open permissions settings' },
    { id: 'open-gestures-settings', fn: 'BrowserApp.openSettings("gestures")', desc: 'Open gestures settings' },
    { id: 'open-shortcuts-settings', fn: 'BrowserApp.openSettings("shortcuts")', desc: 'Open shortcuts settings' }
  ];

  const BY_ID = Object.fromEntries(CATALOG.map((e) => [e.id, e]));
  const GROUPS = [
    {
      label: 'BrowserApp — navigation',
      ids: [
        'go-back',
        'go-forward',
        'refresh',
        'hard-reload',
        'stop-loading',
        'focus-url',
        'open-home',
        'view-source',
        'find',
        'toggle-find-bar',
        'search-selection',
        'print',
        'select-all',
        'paste-match-style',
        'focus-page',
        'toggle-fullscreen',
        'open-devtools'
      ]
    },
    {
      label: 'GuestPage — scroll & edit',
      ids: [
        'scroll-page-up',
        'scroll-page-down',
        'scroll-line-up',
        'scroll-line-down',
        'scroll-left',
        'scroll-right',
        'scroll-to-top',
        'scroll-to-bottom',
        'page-up',
        'page-down',
        'guest-cut',
        'guest-copy',
        'guest-paste',
        'guest-undo',
        'guest-redo',
        'copy-selection',
        'paste-to-page'
      ]
    },
    {
      label: 'BrowserApp — tabs',
      ids: [
        'close-tab',
        'close-current-tab',
        'close-other-tabs',
        'spotlight-search',
        'show-spotlight',
        'new-tab',
        'duplicate-tab',
        'open-current-in-new-tab',
        'next-tab',
        'previous-tab',
        'pin-tab',
        'toggle-pin-current',
        'toggle-mute-tab',
        'reopen-closed-tab',
        'recover-tab',
        'reload-all-tabs',
        'switch-tab-1',
        'switch-tab-2',
        'switch-tab-3',
        'switch-tab-4',
        'switch-tab-5',
        'switch-tab-6',
        'switch-tab-7',
        'switch-tab-8',
        'switch-tab-9',
        'open-incognito-window'
      ]
    },
    {
      label: 'BrowserApp — profiles & chrome',
      ids: [
        'next-profile',
        'previous-profile',
        'toggle-sidebar',
        'toggle-sidebar-position',
        'toggle-sidebar-plus'
      ]
    },
    {
      label: 'BrowserApp — copy & zoom',
      ids: [
        'copy-url',
        'copy-url-markdown',
        'copy-title',
        'copy-page-url-and-title',
        'zoom-in',
        'zoom-out',
        'reset-zoom',
        'tab-volume-up',
        'tab-volume-down',
        'toggle-tab-mono'
      ]
    },
    {
      label: 'BrowserApp — panels',
      ids: [
        'history',
        'downloads',
        'toggle-downloads-panel',
        'settings',
        'toggle-chat',
        'toggle-ai-chat',
        'toggle-notes',
        'toggle-extensions',
        'toggle-adblock',
        'close-all-popups',
        'clear-history',
        'add-to-favorites'
      ]
    },
    {
      label: 'BrowserApp — settings routes',
      ids: [
        'open-settings-newtab',
        'open-settings-vault',
        'open-settings-extensions',
        'open-settings-permissions',
        'open-settings-profiles',
        'open-settings-ai',
        'open-settings-customization',
        'open-settings-screentime',
        'open-settings-history',
        'open-permissions-settings',
        'open-gestures-settings',
        'open-shortcuts-settings'
      ]
    }
  ];

  root.AXIS_SHORTCUT_CATALOG = CATALOG;
  root.AXIS_SHORTCUT_CATALOG_BY_ID = BY_ID;
  root.AXIS_SHORTCUT_CATALOG_GROUPS = GROUPS;
  root.AXIS_SHORTCUT_ALLOWED_IDS = CATALOG.map((e) => e.id);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CATALOG, BY_ID, GROUPS, ALLOWED_IDS: root.AXIS_SHORTCUT_ALLOWED_IDS };
  }
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : global);
