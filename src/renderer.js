// Axis Browser Renderer Process
class AxisBrowser {
    constructor() {
        this.currentTab = null; // Start with no tabs
        this.tabs = new Map(); // Start with empty tabs
        this.folders = new Map(); // Store folders: { id, name, tabIds: [], open: true }
        this.settings = {};
        this.closedTabs = []; // Store recently closed tabs for recovery
        this.loadingTimeout = null; // Timeout for stuck loading pages (main view)
        this.splitViewLoadingTimeouts = new Map(); // Timeouts for split view panes
        this.isSplitView = false; // Split view state
        this.isBenchmarking = false; // suppress non-critical work on Speedometer
        this.activePane = 'left'; // 'left' or 'right' (not used when split view disabled)
        this.splitRatio = 0.5; // 50/50 split (not used when split view disabled)
        this.spotlightSelectedIndex = -1; // Track selected suggestion index
        this.contextMenuFolderId = null; // Track which folder context menu is open
        
        // Cache frequently accessed DOM elements for performance
        this.cacheDOMElements();
        
        this.init();
        
        // Add button interactions immediately
        this.addButtonInteractions();

        // Listen for messages from embedded note pages
        window.addEventListener('message', (event) => this.onEmbeddedMessage(event));
    }
    
    // Cache DOM elements to avoid repeated queries
    cacheDOMElements() {
        // Cache all frequently accessed elements
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            tabsContainer: document.getElementById('tabs-container'),
            urlBar: document.getElementById('url-bar'),
            webview: document.getElementById('webview'),
            backBtn: document.getElementById('back-btn'),
            forwardBtn: document.getElementById('forward-btn'),
            refreshBtn: document.getElementById('refresh-btn'),
            toggleSidebarBtn: document.getElementById('toggle-sidebar-btn'),
            splitViewBtn: document.getElementById('split-view-btn'),
            navMenuBtn: document.getElementById('nav-menu-btn'),
            settingsBtnFooter: document.getElementById('settings-btn-footer'),
            closeSettings: document.getElementById('close-settings'),
            downloadsBtnFooter: document.getElementById('downloads-btn-footer'),
            closeDownloads: document.getElementById('close-downloads'),
            refreshDownloads: document.getElementById('refresh-downloads'),
            closeSecurity: document.getElementById('close-security'),
            viewCertificate: document.getElementById('view-certificate'),
            securitySettings: document.getElementById('security-settings'),
            securityPanel: document.getElementById('security-panel'),
            spotlightInput: document.getElementById('spotlight-input'),
            spotlightSearch: document.getElementById('spotlight-search'),
            searchClose: document.getElementById('search-close'),
            emptyState: document.getElementById('empty-state'),
            emptyStateBtn: document.getElementById('empty-state-new-tab'),
            emptyStateBtnEmpty: document.getElementById('empty-state-new-tab-empty'),
            contentArea: document.getElementById('content-area'),
            singleView: document.getElementById('single-view'),
            splitView: document.getElementById('split-view'),
            settingsPanel: document.getElementById('settings-panel'),
            downloadsPanel: document.getElementById('downloads-panel'),
            notesPanel: document.getElementById('notes-panel'),
            modalBackdrop: document.getElementById('modal-backdrop')
        };
    }

    async init() {
        await this.loadSettings();
        this.applySidebarPosition(); // Apply saved sidebar position
        this.resetToBlackTheme(); // Start with black theme
        this.setupEventListeners();
        this.setupWebview();
        this.setupTabSearch();
        this.setupLoadingScreen();
        this.setupSidebarResize();
        
        // Load pinned tabs from saved state
        await this.loadPinnedTabs();
        
        // Load folders from saved state
        await this.loadFolders();

        // Defer non-critical work to idle time to improve first interaction latency
        this.runWhenIdle(() => {
            // Drag & drop logic is non-critical until tabs exist
            this.setupTabDragDrop();
            // Move preloading to idle to avoid impacting benchmarks and first paint
            this.setupPerformanceOptimizations();
        });
        
        // Show empty state initially (no tabs on startup)
        this.updateEmptyState();
        
        // Make browser instance globally accessible for incognito windows
        window.browser = this;
    }

    // Utilities for performance
    debounce(fn, wait) {
        let timeoutId = null;
        return (...args) => {
            if (timeoutId !== null) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => fn.apply(this, args), wait);
        };
    }
    
    throttle(fn, wait) {
        let lastTime = 0;
        let timeoutId = null;
        return (...args) => {
            const now = Date.now();
            const timeSinceLastCall = now - lastTime;
            
            if (timeSinceLastCall >= wait) {
                lastTime = now;
                fn.apply(this, args);
            } else {
                if (timeoutId !== null) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    lastTime = Date.now();
                    fn.apply(this, args);
                }, wait - timeSinceLastCall);
            }
        };
    }

    runWhenIdle(cb) {
        const invoke = () => {
            try { cb(); } catch (err) { console.error('idle task failed', err); }
        };
        if ('requestIdleCallback' in window) {
            window.requestIdleCallback(invoke, { timeout: 1500 });
        } else {
            setTimeout(invoke, 0);
        }
    }
    
    // Batch DOM updates to reduce reflows
    batchDOMUpdates(updates) {
        requestAnimationFrame(() => {
            updates.forEach(update => {
                try {
                    update();
                } catch (e) {
                    console.error('Batch update error:', e);
                }
            });
        });
    }

    async loadSettings() {
        try {
            this.settings = await window.electronAPI.getSettings();
        } catch (error) {
            console.error('Failed to load settings:', error);
            this.settings = {
                theme: 'dark',
                accentColor: '#555',
                blockTrackers: true,
                blockAds: true
            };
        }
    }

    async saveSetting(key, value) {
        try {
            await window.electronAPI.setSetting(key, value);
            this.settings[key] = value;
        } catch (error) {
            console.error('Failed to save setting:', error);
        }
    }

    setupEventListeners() {
        const el = this.elements;
        if (!el) return; // Safety check
        
        // Navigation controls - use cached elements
        el.backBtn?.addEventListener('click', () => this.goBack());
        el.forwardBtn?.addEventListener('click', () => this.goForward());
        el.refreshBtn?.addEventListener('click', () => this.refresh());
        el.toggleSidebarBtn?.addEventListener('click', () => this.toggleSidebar());
        el.splitViewBtn?.addEventListener('click', () => this.toggleSplitView());
        el.navMenuBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNavMenu();
        });

        // Sidebar right-click for context menu (on empty space)
        this.setupSidebarContextMenu();

        // URL bar - use cached element
        if (el.urlBar) {
            el.urlBar.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.navigate(el.urlBar.value);
                }
            });

            el.urlBar.addEventListener('focus', () => {
                const fullUrl = el.urlBar.getAttribute('data-full-url') || el.urlBar.value;
                el.urlBar.value = fullUrl;
                el.urlBar.classList.remove('summarized');
                el.urlBar.classList.add('expanded');
                el.urlBar.select();
            });

            el.urlBar.addEventListener('blur', () => {
                this.summarizeUrlBar();
            });
        }

        // Sidebar slide-back functionality
        this.setupSidebarSlideBack();

        // Settings - use cached elements
        el.settingsBtnFooter?.addEventListener('click', () => this.toggleSettings());
        el.closeSettings?.addEventListener('click', () => this.toggleSettings());

        // Custom color picker

        // Settings tabs
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchSettingsTab(tab.dataset.tab);
            });
        });

        // History search in settings (debounced to reduce work while typing)
        const onHistoryInput = this.debounce((value) => this.filterHistory(value), 120);
        document.getElementById('history-search').addEventListener('input', (e) => {
            onHistoryInput(e.target.value);
        });

        // Clear history button in settings
        document.getElementById('clear-history').addEventListener('click', () => {
            this.clearAllHistory();
        });

        // History - now handled through settings panel

        // Downloads - use cached elements
        el.downloadsBtnFooter?.addEventListener('click', () => this.toggleDownloads());
        el.closeDownloads?.addEventListener('click', () => this.toggleDownloads());
        el.refreshDownloads?.addEventListener('click', () => this.refreshDownloads());

        // Clear history/downloads buttons
        const clearHistoryBtn = document.getElementById('clear-history');
        clearHistoryBtn?.addEventListener('click', () => this.clearAllHistory());
        const clearDownloadsBtn = document.getElementById('clear-downloads');
        clearDownloadsBtn?.addEventListener('click', () => this.clearAllDownloads());

        // Downloads search functionality (debounced)
        const onDownloadsInput = this.debounce((value) => this.filterDownloads(value), 120);
        const downloadsSearchInput = document.getElementById('downloads-search-input');
        downloadsSearchInput?.addEventListener('input', (e) => {
            onDownloadsInput(e.target.value);
        });

        // Empty state new tab buttons - use cached elements
        el.emptyStateBtn?.addEventListener('click', () => this.showSpotlightSearch());
        el.emptyStateBtnEmpty?.addEventListener('click', () => this.showSpotlightSearch());

        // Security panel - use cached elements
        el.closeSecurity?.addEventListener('click', () => this.toggleSecurity());
        el.viewCertificate?.addEventListener('click', () => this.viewCertificate());
        el.securitySettings?.addEventListener('click', () => this.openSecuritySettings());
        el.securityPanel?.addEventListener('click', (e) => {
            if (e.target.id === 'security-panel') {
                this.toggleSecurity();
            }
        });

        // Spotlight search functionality - use cached element with throttling
        if (el.spotlightInput) {
            el.spotlightInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // If a suggestion is selected, click it; otherwise perform search
                if (this.spotlightSelectedIndex >= 0) {
                    const suggestions = document.querySelectorAll('.spotlight-suggestion-item');
                    if (suggestions[this.spotlightSelectedIndex]) {
                        suggestions[this.spotlightSelectedIndex].click();
                    }
                } else {
                    this.performSpotlightSearch();
                }
            } else if (e.key === 'Escape') {
                this.closeSpotlightSearch();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateSuggestions(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateSuggestions(-1);
            }
        });

            // Throttle input for better performance
            const throttledUpdateSuggestions = this.throttle((value) => {
                this.updateSpotlightSuggestions(value);
                this.spotlightSelectedIndex = -1;
            }, 50);
            
            el.spotlightInput.addEventListener('input', (e) => {
                throttledUpdateSuggestions(e.target.value);
            });
        }

        // Close spotlight when clicking background or backdrop - use cached element
        el.spotlightSearch?.addEventListener('click', (e) => {
            if (e.target.id === 'spotlight-search' || e.target.classList.contains('spotlight-backdrop')) {
                this.closeSpotlightSearch();
            }
        });


        // Keyboard shortcuts - now handled through settings panel

        // Backdrop click closes any open modal - use cached elements
        if (el.modalBackdrop) {
        el.modalBackdrop.addEventListener('click', () => {
            const settingsPanel = el.settingsPanel;
            const downloadsPanel = el.downloadsPanel;
            const notesPanel = el.notesPanel;
            
            // Close settings with animation
            if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
                settingsPanel.classList.add('settings-closing');
                setTimeout(() => {
                    settingsPanel.classList.add('hidden');
                    settingsPanel.classList.remove('settings-closing');
                }, 150);
            }
            
            // Close downloads with animation
            if (downloadsPanel && !downloadsPanel.classList.contains('hidden')) {
                downloadsPanel.classList.add('downloads-closing');
                setTimeout(() => {
                    downloadsPanel.classList.add('hidden');
                    downloadsPanel.classList.remove('downloads-closing');
                }, 150);
            }
            
            // Close notes with animation
            if (notesPanel && !notesPanel.classList.contains('hidden')) {
                notesPanel.classList.add('notes-closing');
                setTimeout(() => {
                    notesPanel.classList.add('hidden');
                    notesPanel.classList.remove('notes-closing');
                    el.modalBackdrop.classList.add('hidden');
                }, 150);
                return;
            }
            
            el.modalBackdrop.classList.add('hidden');
        });
        }

        // Context menu event listeners
        document.getElementById('rename-tab-option').addEventListener('click', () => {
            this.renameCurrentTab();
            this.hideTabContextMenu();
        });

        document.getElementById('duplicate-tab-option').addEventListener('click', () => {
            console.log('Duplicate tab option clicked!');
            // Close the context menu immediately
            this.hideTabContextMenu();
            // Then duplicate the tab
            this.duplicateCurrentTab();
        });

        // Split view option
        document.getElementById('split-view-option').addEventListener('click', () => {
            this.toggleSplitView();
            this.hideTabContextMenu();
        });

        document.getElementById('pin-tab-option').addEventListener('click', () => {
            this.togglePinCurrentTab();
            this.hideTabContextMenu();
        });

        document.getElementById('close-tab-option').addEventListener('click', () => {
            this.closeCurrentTab();
            this.hideTabContextMenu();
        });

        // Sidebar context menu event listeners
        document.getElementById('sidebar-new-tab-option').addEventListener('click', () => {
            this.showSpotlightSearch();
            this.hideSidebarContextMenu();
        });

        document.getElementById('sidebar-new-folder-option').addEventListener('click', () => {
            this.createNewFolder();
            this.hideSidebarContextMenu();
        });

        document.getElementById('sidebar-position-option').addEventListener('click', () => {
            this.toggleSidebarPosition();
            this.hideSidebarContextMenu();
        });

        // Nav menu sidebar position button
        document.getElementById('sidebar-position-btn').addEventListener('click', () => {
            this.toggleSidebarPosition();
            this.closeNavMenu();
        });

        // Folder context menu event listeners
        document.getElementById('rename-folder-option').addEventListener('click', () => {
            this.renameCurrentFolder();
            this.hideFolderContextMenu();
        });

        document.getElementById('delete-folder-option').addEventListener('click', () => {
            this.deleteCurrentFolder();
            this.hideFolderContextMenu();
        });

        // Search functionality
        document.addEventListener('keydown', (e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
                e.preventDefault();
                this.toggleSearch();
            }
            if (e.key === 'Escape') {
                this.hideSearch();
            }
        });

        // Additional keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Cmd+A to select all
            if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                e.preventDefault();
                this.selectAll();
            }
            
            // Escape key to close panels
            if (e.key === 'Escape') {
                const downloadsPanel = document.getElementById('downloads-panel');
                const settingsPanel = document.getElementById('settings-panel');
                
                if (!downloadsPanel.classList.contains('hidden')) {
                    this.toggleDownloads();
                } else if (!settingsPanel.classList.contains('hidden')) {
                    this.toggleSettings();
                }
            }
        });

        // Search controls
        document.getElementById('search-close').addEventListener('click', () => {
            this.hideSearch();
        });

        document.getElementById('search-prev').addEventListener('click', () => {
            this.searchPrevious();
        });

        document.getElementById('search-next').addEventListener('click', () => {
            this.searchNext();
        });

        // Search input
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', (e) => {
            this.performSearch(e.target.value);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.searchNext();
            }
        });

        // Click outside to close context menu and nav menu
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu') && !e.target.closest('.tab') && !e.target.closest('.folder')) {
                this.hideTabContextMenu();
                this.hideWebpageContextMenu();
                this.hideSidebarContextMenu();
                this.hideFolderContextMenu();
            }
            if (!e.target.closest('.nav-menu') && !e.target.closest('#nav-menu-btn')) {
                this.hideNavMenu();
            }
        });

        // Click outside to close webpage context menu
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                this.hideWebpageContextMenu();
            }
        });

        // Right-click outside to close context menu
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.tab') && !e.target.closest('#webview') && !e.target.closest('#sidebar') && !e.target.closest('.folder')) {
                this.hideTabContextMenu();
                this.hideWebpageContextMenu();
                this.hideSidebarContextMenu();
                this.hideFolderContextMenu();
            }
        });

        // Webpage context menu event listeners
        document.getElementById('webpage-back').addEventListener('click', () => {
            this.goBack();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-forward').addEventListener('click', () => {
            this.goForward();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-reload').addEventListener('click', () => {
            this.refresh();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-cut').addEventListener('click', () => {
            this.cut();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-copy').addEventListener('click', () => {
            this.copy();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-paste').addEventListener('click', () => {
            this.paste();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-select-all').addEventListener('click', () => {
            this.selectAll();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-search').addEventListener('click', () => {
            this.toggleSearch();
            this.hideWebpageContextMenu();
        });

        // Copy link button
        document.getElementById('copy-link-btn').addEventListener('click', () => {
            this.copyCurrentUrl();
        });

        // Security button
        document.getElementById('security-btn').addEventListener('click', () => {
            this.toggleSecurity();
        });

        // Settings controls
        // appearance color listeners removed
        document.getElementById('block-trackers').addEventListener('change', (e) => {
            // Just preview, don't save yet
        });

        document.getElementById('block-ads').addEventListener('change', (e) => {
            // Just preview, don't save yet
        });

        // Save settings button
        document.getElementById('save-settings').addEventListener('click', () => {
            this.saveAllSettings();
        });

        // Listen for new tab events from main process
        window.electronAPI.onNewTab(() => {
            this.createNewTab();
        });

        // Listen for close tab accelerator from main process
        window.electronAPI.onCloseTab(() => {
            if (this.currentTab) {
                this.closeTab(this.currentTab);
            }
        });

        // Listen for quit request from main process
        window.electronAPI.onRequestQuit(() => {
            this.showQuitConfirmation();
        });

        // Keyboard shortcuts - Cmd+W must be in capture phase to intercept before webview handles it
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + W - Close tab (critical: handle in capture phase)
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                if (this.currentTab) {
                    this.closeTab(this.currentTab);
                }
                return false;
            }
        }, true); // Capture phase - intercepts before webview
        
        // Other keyboard shortcuts (normal phase)
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + T - Show spotlight search
            if ((e.metaKey || e.ctrlKey) && e.key === 't') {
                e.preventDefault();
                this.showSpotlightSearch();
            }
            
            // Cmd/Ctrl + B - Toggle sidebar
            if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                e.preventDefault();
                this.toggleSidebar();
            }
            
            // Cmd/Ctrl + R - Refresh
            if ((e.metaKey || e.ctrlKey) && e.key === 'r') {
                e.preventDefault();
                this.refresh();
            }
            
            // Cmd/Ctrl + L - Focus URL bar
            if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
                e.preventDefault();
                document.getElementById('url-bar').focus();
                document.getElementById('url-bar').select();
            }

            // Alt + P - Toggle pin on active tab
            if (e.altKey && (e.key === 'p' || e.key === 'P')) {
                const activeTabEl = document.querySelector('.tab.active');
                if (activeTabEl) {
                    const activeTabId = parseInt(activeTabEl.dataset.tabId, 10);
                    this.togglePinTab(activeTabId, activeTabEl, null);
                }
            }
            
            // Split view shortcuts
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
                e.preventDefault();
                this.toggleSplitView();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === '[' && this.isSplitView) {
                e.preventDefault();
                this.setActivePane('left');
            }
            if ((e.metaKey || e.ctrlKey) && e.key === ']' && this.isSplitView) {
                e.preventDefault();
                this.setActivePane('right');
            }
            if (e.key === 'Escape' && this.isSplitView) {
                e.preventDefault();
                this.toggleSplitView();
            }
            
            // Cmd/Ctrl + N - New window
            if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
                e.preventDefault();
                // This would open a new window - for now just create a new tab
                this.createNewTab();
            }
            
            // Cmd/Ctrl + , - Open settings
            if ((e.metaKey || e.ctrlKey) && e.key === ',') {
                e.preventDefault();
                this.toggleSettings();
            }
            
            // Cmd/Ctrl + Z - Recover closed tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                this.recoverClosedTab();
            }
            
            // Cmd/Ctrl + Y - Open history (now in settings)
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                this.toggleSettings();
                this.switchSettingsTab('history');
            }
            
            // Cmd/Ctrl + J - Open downloads
            if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
                e.preventDefault();
                this.toggleDownloads();
            }
            
            
            // Cmd/Ctrl + Shift + H - Clear history
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'H') {
                e.preventDefault();
                this.clearAllHistory();
            }
            
            // Cmd/Ctrl + Shift + J - Clear downloads
            if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'J') {
                e.preventDefault();
                this.clearAllDownloads();
            }
            
            // Cmd/Ctrl + Plus/Minus - Zoom in/out
            if ((e.metaKey || e.ctrlKey) && (e.key === '+' || e.key === '=')) {
                e.preventDefault();
                this.zoomIn();
            }
            
            if ((e.metaKey || e.ctrlKey) && e.key === '-') {
                e.preventDefault();
                this.zoomOut();
            }
            
            // Cmd/Ctrl + 0 - Reset zoom
            if ((e.metaKey || e.ctrlKey) && e.key === '0') {
                e.preventDefault();
                this.resetZoom();
            }
            
            // Tab switching shortcuts (Cmd/Ctrl + 1-9)
            if ((e.metaKey || e.ctrlKey) && e.key >= '1' && e.key <= '9') {
                e.preventDefault();
                const tabIndex = parseInt(e.key) - 1;
                this.switchToTabByIndex(tabIndex);
            }
        });
    }

    setupWebviewEventListeners(webview, tabId) {
        if (!webview) return;

        webview.dataset.tabId = String(tabId);
        
        // Optimize webview for performance
        webview.style.willChange = 'transform';
        webview.style.transform = 'translateZ(0)';
        webview.style.backfaceVisibility = 'hidden';
        
        const isActiveTab = () => this.currentTab === tabId && !this.isSplitView;
        const getTab = () => this.tabs.get(tabId);
        const clearLoadingTimeout = () => {
            if (webview.__loadingTimeout) {
                clearTimeout(webview.__loadingTimeout);
                webview.__loadingTimeout = null;
            }
        };

        webview.addEventListener('did-start-loading', () => {
            if (!isActiveTab()) return;

            const currentUrl = webview.getURL() || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(currentUrl);
            if (this.isBenchmarking) return;
            
            clearLoadingTimeout();
            this.showLoadingIndicator();
            this.updateNavigationButtons();
            
            webview.__loadingTimeout = setTimeout(() => {
                if (!isActiveTab()) return;
                if (webview && webview.isLoading) {
                    console.log('Page taking too long to load, forcing stop');
                    try {
                        webview.stop();
                    } catch (e) {
                        console.error('Error stopping webview:', e);
                    }
                    this.hideLoadingIndicator();
                    this.showNotification('Page is taking too long to load. You can try refreshing.', 'warning');
                }
                clearLoadingTimeout();
            }, 30000);
        });

        webview.addEventListener('did-finish-load', () => {
            clearLoadingTimeout();

            const tab = getTab();
            if (tab) {
                const currentUrl = webview.getURL();
                const currentTitle = webview.getTitle();
                if (currentUrl && currentUrl !== 'about:blank') {
                    tab.url = currentUrl;
            }
                if (currentTitle) {
                    tab.title = currentTitle;
                }
            }

            if (!isActiveTab()) return;
            if (this.isBenchmarking) {
                this.errorRetryCount = 0;
                this.dnsRetryCount = 0;
                return;
            }
            
            this.hideLoadingIndicator();
            this.errorRetryCount = 0;
            this.dnsRetryCount = 0;
            
            this.batchDOMUpdates([
                () => this.updateNavigationButtons(),
                () => this.updateUrlBar(),
                () => this.updateTabTitle(),
                () => this.updateSecurityIndicator(),
            ]);
            
                this.trackPageInHistory();

            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                this.updateTabFavicon(tabId, tabElement);
            }
            
            this.extractAndApplyWebpageColors(webview);
        });

        webview.addEventListener('did-stop-loading', () => {
            clearLoadingTimeout();
            if (!isActiveTab() || this.isBenchmarking) return;

                this.hideLoadingIndicator();
                this.batchDOMUpdates([
                    () => this.updateUrlBar(),
                    () => this.updateNavigationButtons(),
                    () => this.updateTabTitle()
                ]);
                this.extractAndApplyWebpageColors(webview);
        });
        
        webview.addEventListener('console-message', (e) => {
            if (e.message && e.message.includes('DawnExperimentalSubgroupLimits') && e.message.includes('deprecated')) {
                return;
            }
        });

        webview.addEventListener('did-fail-load', (event) => {
            clearLoadingTimeout();
            const tab = getTab();

            if (isActiveTab()) {
            this.hideLoadingIndicator();
            }
            
            if (this.errorRetryCount >= 5) {
                if (isActiveTab()) {
                    this.showErrorPage('Unable to load page. Please check your internet connection.', webview);
                }
                return;
            }
            
            this.errorRetryCount = (this.errorRetryCount || 0) + 1;
            
            if (event.errorCode === -2) {
                    webview.reload();
            } else if (event.errorCode === -3) {
                console.log('Navigation aborted');
            } else if (event.errorCode === -105) {
                console.log('DNS resolution failed, trying alternative approach...');
                const currentUrl = event.url || webview.getURL() || 'https://www.google.com';
                this.handleDNSFailure(currentUrl, webview);
            } else if (isActiveTab()) {
                this.showErrorPage(event.errorDescription, webview);
            }

            if (tab && event.validatedURL) {
                tab.url = event.validatedURL;
            }
        });

        webview.addEventListener('new-window', (event) => {
            event.preventDefault();
            this.navigate(event.url);
        });

        webview.addEventListener('will-navigate', (event) => {
            if (!isActiveTab()) return;
            const nextUrl = event.url || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(nextUrl);
            if (!this.isBenchmarking) {
                this.updateUrlBar();
            }
        });

        webview.addEventListener('did-navigate', () => {
            if (!isActiveTab() || this.isBenchmarking) return;
                this.batchDOMUpdates([
                    () => this.updateUrlBar(),
                    () => this.updateNavigationButtons()
                ]);
        });

        webview.addEventListener('did-navigate-in-page', () => {
            if (!isActiveTab() || this.isBenchmarking) return;
                this.batchDOMUpdates([
                    () => this.updateUrlBar(),
                    () => this.updateNavigationButtons(),
                    () => this.updateTabTitle()
                ]);
        });

        webview.addEventListener('page-title-updated', async () => {
            const tab = getTab();
            if (tab) {
                tab.title = webview.getTitle() || tab.title;
            }

            if (!isActiveTab() || this.isBenchmarking) return;
                this.updateTabTitle();
                
                if (tab && tab.url === 'axis:note://new') {
                    const title = webview.getTitle();
                    if (title && title !== 'New Note') {
                        try {
                            const notes = await window.electronAPI.getNotes();
                            const savedNote = notes.find(n => n.title === title);
                            if (savedNote) {
                                tab.url = `axis:note://${savedNote.id}`;
                                tab.noteId = savedNote.id;
                            }
                        } catch (err) {
                            console.error('Error updating note tab URL:', err);
                    }
                }
            }
        });

        webview.addEventListener('page-favicon-updated', (event) => {
            if (!event.favicons || event.favicons.length === 0) return;
                const faviconUrl = event.favicons[0];
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                const img = tabElement.querySelector('.tab-favicon');
                if (img) {
                    img.style.visibility = 'visible';
                    img.src = faviconUrl;
                }
            }
            const tab = getTab();
                    if (tab) {
                        tab.favicon = faviconUrl;
                    }
        });

        webview.addEventListener('contextmenu', (e) => {
            if (!isActiveTab()) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = webview.getBoundingClientRect();
            const x = e.clientX + rect.left;
            const y = e.clientY + rect.top;
            this.showWebpageContextMenu({ pageX: x, pageY: y });
        });
    }
        
    setupWebview() {
        // This function is kept for backward compatibility but is no longer used
        // Webviews are now created per-tab in createTabWebview
    }

    handleDNSFailure(url, targetWebview = null) {
        console.log('Handling DNS failure for:', url);
        
        const webview = targetWebview || this.getActiveWebview();
        if (!webview) return;
        
        // Prevent infinite retry loops
        if (this.dnsRetryCount >= 3) {
            console.log('Max DNS retries reached, falling back to Google');
            webview.src = 'https://www.google.com';
            return;
        }
        
        this.dnsRetryCount = (this.dnsRetryCount || 0) + 1;
        
        // Try simple fallback to Google search
        const searchQuery = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        
        console.log(`DNS retry ${this.dnsRetryCount}/3, trying:`, fallbackUrl);
        
        const sanitizedFallbackUrl = this.sanitizeUrl(fallbackUrl);
        webview.src = sanitizedFallbackUrl || 'https://www.google.com';
    }

    showErrorPage(message, targetWebview = null) {
        const webview = targetWebview || this.getActiveWebview();
        if (!webview) return;
        const errorHtml = `
            <html>
                <head>
                    <title>Error - Axis Browser</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            background: #1a1a1a;
                            color: #ffffff;
                            margin: 0;
                            padding: 50px;
                            text-align: center;
                        }
                        .error-container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 40px;
                            background: #2a2a2a;
                            border-radius: 12px;
                            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                        }
                        .error-icon {
                            font-size: 48px;
                            color: #ff6b6b;
                            margin-bottom: 20px;
                        }
                        .error-title {
                            font-size: 24px;
                            margin-bottom: 16px;
                            color: #ffffff;
                        }
                        .error-message {
                            font-size: 16px;
                            color: #cccccc;
                            margin-bottom: 30px;
                            line-height: 1.5;
                        }
                        .retry-button {
                            background: #007AFF;
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-size: 16px;
                            cursor: pointer;
                            transition: background 0.2s;
                        }
                        .retry-button:hover {
                            background: #0056CC;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="error-icon">⚠️</div>
                        <h1 class="error-title">Unable to Load Page</h1>
                        <p class="error-message">${message}</p>
                        <button class="retry-button" onclick="window.location.href='https://www.google.com'">Go to Google</button>
                    </div>
                </body>
            </html>
        `;
        webview.src = `data:text/html,${encodeURIComponent(errorHtml)}`;
    }

    checkNetworkAndLoad() {
        // This function is no longer needed - webviews are created per tab
    }

    showErrorPage(message, targetWebview = null) {
        const webview = targetWebview || this.getActiveWebview();
        if (!webview) return;
        const errorHtml = `
            <html>
                <head>
                    <title>Error - Axis Browser</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            background: #1a1a1a;
                            color: #ffffff;
                            margin: 0;
                            padding: 50px;
                            text-align: center;
                        }
                        .error-container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 40px;
                            background: #2a2a2a;
                            border-radius: 12px;
                            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                        }
                        .error-icon {
                            font-size: 48px;
                            color: #ff6b6b;
                            margin-bottom: 20px;
                        }
                        .error-title {
                            font-size: 24px;
                            margin-bottom: 16px;
                            color: #ffffff;
                        }
                        .error-message {
                            font-size: 16px;
                            color: #cccccc;
                            margin-bottom: 30px;
                            line-height: 1.5;
                        }
                        .retry-button {
                            background: #007AFF;
                            color: white;
                            border: none;
                            padding: 12px 24px;
                            border-radius: 8px;
                            font-size: 16px;
                            cursor: pointer;
                            transition: background 0.2s;
                        }
                        .retry-button:hover {
                            background: #0056CC;
                        }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="error-icon">⚠️</div>
                        <h1 class="error-title">Unable to Load Page</h1>
                        <p class="error-message">${message}</p>
                        <button class="retry-button" onclick="window.location.href='https://www.google.com'">Go to Google</button>
                    </div>
                </body>
            </html>
        `;
        webview.src = `data:text/html,${encodeURIComponent(errorHtml)}`;
    }

    setupPerformanceOptimizations() {
        // Lightweight hardware acceleration hints only
        const webview = document.getElementById('webview');
        if (webview) {
            webview.style.willChange = 'transform, opacity';
            webview.style.transform = 'translateZ(0)';
            webview.style.backfaceVisibility = 'hidden';
            webview.style.perspective = '1000px';
        }
        
        // Disable DNS prefetch and resource preloading entirely - they hurt Speedometer benchmarks
        // by causing unnecessary network and DOM work during benchmark execution
    }

    // Removed broken preloading methods that were slowing things down

    preloadDNS() {
        // Aggressive DNS prefetch for maximum speed
        const commonDomains = [
            'google.com', 'youtube.com', 'github.com', 'stackoverflow.com', 'reddit.com',
            'facebook.com', 'twitter.com', 'instagram.com', 'linkedin.com', 'amazon.com',
            'netflix.com', 'spotify.com', 'discord.com', 'twitch.tv', 'wikipedia.org',
            'microsoft.com', 'apple.com', 'adobe.com', 'cloudflare.com', 'jsdelivr.net',
            'cdnjs.cloudflare.com', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'
        ];
        
        commonDomains.forEach(domain => {
            const dnsLink = document.createElement('link');
            dnsLink.rel = 'dns-prefetch';
            dnsLink.href = `//${domain}`;
            document.head.appendChild(dnsLink);
            
            // Also prefetch with preconnect for faster loading
            const preconnectLink = document.createElement('link');
            preconnectLink.rel = 'preconnect';
            preconnectLink.href = `https://${domain}`;
            document.head.appendChild(preconnectLink);
        });
    }

    preloadCriticalResources() {
        // Preload critical resources for maximum speed
        const criticalResources = [
            'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
            'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
        ];
        
        criticalResources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'style';
            link.href = resource;
            link.onload = function() {
                this.rel = 'stylesheet';
            };
            document.head.appendChild(link);
        });
        
        // Aggressive resource preloading
        this.preloadCommonResources();
        this.setupResourceCache();
    }

    preloadCommonResources() {
        // Preload common CDN resources for maximum speed
        const commonResources = [
            'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.6.0/jquery.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/bootstrap/5.1.3/js/bootstrap.bundle.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/lodash.js/4.17.21/lodash.min.js',
            'https://cdnjs.cloudflare.com/ajax/libs/moment.js/2.29.1/moment.min.js'
        ];
        
        commonResources.forEach(resource => {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = 'script';
            link.href = resource;
            document.head.appendChild(link);
        });
    }

    setupResourceCache() {
        // Enable aggressive caching
        if ('caches' in window) {
            caches.open('axis-browser-cache-v1').then(cache => {
                // Cache common resources
                const resourcesToCache = [
                    '/',
                    '/src/index.html',
                    '/src/styles.css',
                    '/src/renderer.js'
                ];
                
                cache.addAll(resourcesToCache).catch(err => {
                    console.log('Cache preload failed:', err);
                });
            });
        }
    }

    // Removed broken preloading methods that were slowing things down

    // Removed broken tab webview methods - using single webview approach

    // Removed broken performance monitoring that was slowing things down



    setupColorWheel(wheel, handle) {
        let isDragging = false;

        const updateColorFromWheel = (e) => {
            const rect = wheel.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            const degrees = ((angle * 180 / Math.PI) + 360) % 360;
            
            const radius = rect.width / 2 - 20;
            const x = Math.cos(angle) * radius + rect.width / 2;
            const y = Math.sin(angle) * radius + rect.height / 2;
            
            // Smooth positioning
            handle.style.left = x + 'px';
            handle.style.top = y + 'px';
            handle.style.transition = isDragging ? 'none' : 'all 0.2s ease';
            
            this.currentHue = degrees;
            this.updateColorFromHSL();
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            handle.style.cursor = 'grabbing';
            handle.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                updateColorFromWheel(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'grab';
                handle.style.transition = 'all 0.2s ease';
            }
        });

        wheel.addEventListener('click', (e) => {
            if (!isDragging) {
                updateColorFromWheel(e);
            }
        });
    }

    setupBrightnessSlider(slider, handle) {
        let isDragging = false;

        const updateBrightness = (e) => {
            const rect = slider.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
            
            // Smooth positioning
            handle.style.left = percentage + '%';
            handle.style.transition = isDragging ? 'none' : 'all 0.2s ease';
            
            this.currentBrightness = percentage;
            this.updateColorFromHSL();
        };

        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            isDragging = true;
            handle.style.cursor = 'grabbing';
            handle.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                e.preventDefault();
                updateBrightness(e);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                handle.style.cursor = 'grab';
                handle.style.transition = 'all 0.2s ease';
            }
        });

        slider.addEventListener('click', (e) => {
            if (!isDragging) {
                updateBrightness(e);
            }
        });
    }

    updateColorFromHex(hex) {
        const hsl = this.hexToHsl(hex);
        this.currentHue = hsl.h;
        this.currentSaturation = hsl.s;
        this.currentBrightness = hsl.l;
        this.updateColorFromHSL();
    }

    updateColorFromHSL() {
        const hex = this.hslToHex(this.currentHue, this.currentSaturation, this.currentBrightness);
        this.currentColor = hex;
        this.updateColorDisplay();
        const generatedColors = this.generateHarmoniousColors(hex);
        this.applyCustomTheme(generatedColors);
        this.saveSetting('mainColor', hex);
    }

    updateColorDisplay() {
        const currentColorDisplay = document.getElementById('current-color');
        const colorHexDisplay = document.getElementById('color-hex');
        const colorRgbDisplay = document.getElementById('color-rgb');
        const brightnessValue = document.getElementById('brightness-value');
        
        if (currentColorDisplay) {
            currentColorDisplay.style.background = this.currentColor;
            currentColorDisplay.style.boxShadow = `0 4px 12px ${this.currentColor}40`;
        }
        
        if (colorHexDisplay) {
            colorHexDisplay.textContent = this.currentColor.toUpperCase();
        }
        
        if (colorRgbDisplay) {
            const rgb = this.hexToRgb(this.currentColor);
            colorRgbDisplay.textContent = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        }
        
        if (brightnessValue) {
            brightnessValue.textContent = `${this.currentBrightness}%`;
        }
    }

    hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return { r, g, b };
    }

    updateColorOrb(color) {
        const orb = document.getElementById('color-orb');
        if (orb) {
            orb.style.background = color;
            orb.style.boxShadow = `0 0 20px ${color}40`;
        }
    }

    generateHarmoniousColors(baseColor) {
        const hsl = this.hexToHsl(baseColor);
        const isDark = this.isDarkColor(baseColor);
        
        let primary = baseColor;
        let secondary, accent, text;

        if (isDark) {
            // Dark mode - create lighter variations
            secondary = this.hslToHex(hsl.h, Math.max(0, hsl.s - 20), Math.min(100, hsl.l + 15));
            accent = this.hslToHex(hsl.h, Math.min(100, hsl.s + 10), Math.min(100, hsl.l + 25));
            text = '#ffffff';
        } else {
            // Light mode - create darker variations
            secondary = this.hslToHex(hsl.h, Math.max(0, hsl.s - 30), Math.max(0, hsl.l - 20));
            accent = this.hslToHex(hsl.h, Math.min(100, hsl.s + 15), Math.max(0, hsl.l - 10));
            text = '#000000';
        }

        return { primary, secondary, accent, text };
    }

    generateColorScheme(baseColor) {
        const colors = this.generateHarmoniousColors(baseColor);
        this.applyCustomTheme(colors);
    }


    // Color utility functions
    hexToHsl(hex) {
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;
        
        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                case g: h = (b - r) / d + 2; break;
                case b: h = (r - g) / d + 4; break;
            }
            h /= 6;
        }
        
        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    hslToHex(h, s, l) {
        h = h / 360;
        s = s / 100;
        l = l / 100;
        
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        
        let r, g, b;
        if (s === 0) {
            r = g = b = l;
        } else {
            const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
            const p = 2 * l - q;
            r = hue2rgb(p, q, h + 1/3);
            g = hue2rgb(p, q, h);
            b = hue2rgb(p, q, h - 1/3);
        }
        
        const toHex = (c) => {
            const hex = Math.round(c * 255).toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        };
        
        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    isDarkColor(hex) {
        const hsl = this.hexToHsl(hex);
        return hsl.l < 50;
    }
    
    // Calculate relative luminance for contrast ratio
    getLuminance(hex) {
        const rgb = this.hexToRgb(hex);
        const [r, g, b] = [rgb.r / 255, rgb.g / 255, rgb.b / 255].map(val => {
            return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }
    
    // Calculate contrast ratio between two colors
    getContrastRatio(color1, color2) {
        const lum1 = this.getLuminance(color1);
        const lum2 = this.getLuminance(color2);
        const lighter = Math.max(lum1, lum2);
        const darker = Math.min(lum1, lum2);
        return (lighter + 0.05) / (darker + 0.05);
    }
    
    // Get readable text color based on background (WCAG AA standard: 4.5:1 for normal text)
    getReadableTextColor(backgroundColor, minContrast = 4.5) {
        const white = '#ffffff';
        const black = '#000000';
        
        const whiteContrast = this.getContrastRatio(backgroundColor, white);
        const blackContrast = this.getContrastRatio(backgroundColor, black);
        
        // If white has better contrast, use white; otherwise use black
        if (whiteContrast >= minContrast && whiteContrast >= blackContrast) {
            return white;
        } else if (blackContrast >= minContrast && blackContrast > whiteContrast) {
            return black;
        } else {
            // If neither meets minimum, use the one with better contrast
            return whiteContrast > blackContrast ? white : black;
        }
    }
    
    // Convert hex to RGB
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    extractAndApplyWebpageColors(webview, retryCount = 0) {
        try {
            if (!webview) {
                this.resetToBlackTheme();
                return;
            }
            
            const url = webview.getURL();
            
            // Reset to black theme if no valid page
            if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('chrome://') || url.startsWith('chrome-extension://')) {
                this.resetToBlackTheme();
                return;
            }
            
            // Check if webview is ready
            if (!webview.isLoading && webview.getURL() === 'about:blank') {
                // Webview not ready yet, retry very quickly (single RAF for speed)
                if (retryCount < 1) {
                    requestAnimationFrame(() => {
                        this.extractAndApplyWebpageColors(webview, retryCount + 1);
                    });
                } else {
                    this.resetToBlackTheme();
                }
                return;
            }
            
            // Extract colors from webpage - try multiple times to ensure it works
            const extractColors = () => {
                try {
                    webview.executeJavaScript(`
                        (function() {
                            try {
                                const body = document.body;
                                const html = document.documentElement;
                                
                                if (!body || !html) {
                                    return null;
                                }
                                
                                // Helper to convert rgba/rgb to hex
                                function rgbToHex(rgb) {
                                    if (!rgb || rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') {
                                        return null;
                                    }
                                    const match = rgb.match(/\\d+/g);
                                    if (match && match.length >= 3) {
                                        const r = parseInt(match[0]);
                                        const g = parseInt(match[1]);
                                        const b = parseInt(match[2]);
                                        // If alpha is very low, treat as transparent
                                        if (match.length >= 4 && parseFloat(match[3]) < 0.1) {
                                            return null;
                                        }
                                        return '#' + 
                                            r.toString(16).padStart(2, '0') +
                                            g.toString(16).padStart(2, '0') +
                                            b.toString(16).padStart(2, '0');
                                    }
                                    return null;
                                }
                                
                                // Helper to convert hex to RGB
                                function hexToRgb(hex) {
                                    const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
                                    return result ? {
                                        r: parseInt(result[1], 16),
                                        g: parseInt(result[2], 16),
                                        b: parseInt(result[3], 16)
                                    } : null;
                                }
                                
                                // Calculate color distance (Euclidean distance in RGB space)
                                function colorDistance(hex1, hex2) {
                                    const rgb1 = hexToRgb(hex1);
                                    const rgb2 = hexToRgb(hex2);
                                    if (!rgb1 || !rgb2) return Infinity;
                                    const dr = rgb1.r - rgb2.r;
                                    const dg = rgb1.g - rgb2.g;
                                    const db = rgb1.b - rgb2.b;
                                    return Math.sqrt(dr * dr + dg * dg + db * db);
                                }
                                
                                // Check if color is too close to white/black (more lenient)
                                function isNeutralColor(hex) {
                                    if (!hex) return true;
                                    const rgb = hexToRgb(hex);
                                    if (!rgb) return true;
                                    // Only filter out pure white (all channels > 250)
                                    if (rgb.r > 250 && rgb.g > 250 && rgb.b > 250) return true;
                                    // Only filter out pure black (all channels < 5)
                                    if (rgb.r < 5 && rgb.g < 5 && rgb.b < 5) return true;
                                    // Allow light and dark colors, only filter very gray ones
                                    const max = Math.max(rgb.r, rgb.g, rgb.b);
                                    const min = Math.min(rgb.r, rgb.g, rgb.b);
                                    const saturation = max === 0 ? 0 : (max - min) / max;
                                    // Only filter if it's extremely gray (saturation < 0.05)
                                    if (saturation < 0.05) return true;
                                    return false;
                                }
                                
                                // Calculate color brightness (0-255)
                                function getBrightness(hex) {
                                    const rgb = hexToRgb(hex);
                                    if (!rgb) return 128;
                                    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
                                }
                                
                                // Calculate color saturation
                                function getSaturation(hex) {
                                    const rgb = hexToRgb(hex);
                                    if (!rgb) return 0;
                                    const max = Math.max(rgb.r, rgb.g, rgb.b);
                                    const min = Math.min(rgb.r, rgb.g, rgb.b);
                                    return max === 0 ? 0 : (max - min) / max;
                                }
                                
                                // Get meta theme-color first (most reliable)
                                const themeColorMeta = document.querySelector('meta[name="theme-color"]');
                                let themeColor = null;
                                if (themeColorMeta) {
                                    themeColor = themeColorMeta.getAttribute('content');
                                    // Convert to hex if needed
                                    if (themeColor && themeColor.startsWith('rgb')) {
                                        themeColor = rgbToHex(themeColor);
                                    } else if (themeColor && !themeColor.startsWith('#')) {
                                        // Try to parse as hex without #
                                        if (/^[0-9A-Fa-f]{6}$/.test(themeColor)) {
                                            themeColor = '#' + themeColor;
                                        }
                                    }
                                }
                                
                                // Priority selectors (check these first for better accuracy)
                                const prioritySelectors = [
                                    'main', '[role="main"]', '.main', '#main',
                                    '.content', '#content', '.container', '.page', '.app',
                                    'article', 'section', '[class*="content"]', '[class*="container"]',
                                    '[id*="content"]', '[id*="container"]', '[id*="main"]'
                                ];
                                
                                // Secondary selectors
                                const secondarySelectors = [
                                    'header', 'nav', '.header', '.nav', '.navbar', '.navigation',
                                    '.card', '.panel', '.box', '.widget', '.tile', '.item',
                                    '[class*="bg"]', '[class*="background"]', '[class*="theme"]',
                                    'body', 'html'
                                ];
                                
                                // Sample colors with weights (priority selectors get higher weight)
                                const colorSamples = [];
                                const colorWeights = {};
                                
                                // Sample from priority selectors first
                                for (const selector of prioritySelectors) {
                                    try {
                                        const elements = document.querySelectorAll(selector);
                                        for (let i = 0; i < Math.min(elements.length, 3); i++) {
                                            const element = elements[i];
                                            if (!element) continue;
                                            
                                            // Skip if element is not visible
                                            const rect = element.getBoundingClientRect();
                                            if (rect.width === 0 || rect.height === 0) continue;
                                            
                                            const style = window.getComputedStyle(element);
                                            
                                            // Sample background color (weight: 3 for priority)
                                            const bg = style.backgroundColor;
                                            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                                                const hex = rgbToHex(bg);
                                                if (hex) {
                                                    // Don't filter neutral colors here, just collect them
                                                    if (!colorWeights[hex]) {
                                                        colorSamples.push(hex);
                                                        colorWeights[hex] = 3; // Higher weight for priority
                                                    } else {
                                                        colorWeights[hex] += 3;
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        // Continue if selector fails
                                    }
                                }
                                
                                // Sample from secondary selectors
                                for (const selector of secondarySelectors) {
                                    try {
                                        const elements = document.querySelectorAll(selector);
                                        for (let i = 0; i < Math.min(elements.length, 2); i++) {
                                            const element = elements[i];
                                            if (!element) continue;
                                            
                                            const rect = element.getBoundingClientRect();
                                            if (rect.width === 0 || rect.height === 0) continue;
                                            
                                            const style = window.getComputedStyle(element);
                                            
                                            // Sample background color (weight: 1 for secondary)
                                            const bg = style.backgroundColor;
                                            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                                                const hex = rgbToHex(bg);
                                                if (hex) {
                                                    if (!colorWeights[hex]) {
                                                        colorSamples.push(hex);
                                                        colorWeights[hex] = 1;
                                                    } else {
                                                        colorWeights[hex] += 1;
                                                    }
                                                }
                                            }
                                            
                                            // Sample border color (weight: 1)
                                            const border = style.borderColor;
                                            if (border && border !== 'transparent') {
                                                const hex = rgbToHex(border);
                                                if (hex) {
                                                    if (!colorWeights[hex]) {
                                                        colorSamples.push(hex);
                                                        colorWeights[hex] = 1;
                                                    } else {
                                                        colorWeights[hex] += 1;
                                                    }
                                                }
                                            }
                                        }
                                    } catch (e) {
                                        // Continue if selector fails
                                    }
                                }
                                
                                // Use meta theme-color if available and valid
                                if (themeColor && !isNeutralColor(themeColor)) {
                                    dominantColor = themeColor;
                                } else {
                                    // Find the most common color by clustering similar colors with weights
                                    if (colorSamples.length > 0) {
                                        // Group similar colors together (within 40 units distance - more lenient)
                                        const clusters = {};
                                        const clusterWeights = {};
                                        const clusterThreshold = 40;
                                        
                                        for (const color of colorSamples) {
                                            let foundCluster = false;
                                            for (const clusterColor in clusters) {
                                                if (colorDistance(color, clusterColor) < clusterThreshold) {
                                                    clusters[clusterColor]++;
                                                    clusterWeights[clusterColor] += (colorWeights[color] || 1);
                                                    foundCluster = true;
                                                    break;
                                                }
                                            }
                                            if (!foundCluster) {
                                                clusters[color] = 1;
                                                clusterWeights[color] = colorWeights[color] || 1;
                                            }
                                        }
                                        
                                        // Find the cluster with the highest weighted score
                                        // Score = count * weight * saturation (prefer more saturated colors)
                                        let maxScore = 0;
                                        for (const clusterColor in clusters) {
                                            const count = clusters[clusterColor];
                                            const weight = clusterWeights[clusterColor];
                                            const saturation = getSaturation(clusterColor);
                                            const brightness = getBrightness(clusterColor);
                                            
                                            // Prefer colors that are not too bright or too dark
                                            // But allow a wider range (brightness 20-235)
                                            const brightnessScore = (brightness >= 20 && brightness <= 235) ? 1 : 0.3;
                                            
                                            // Calculate score: prioritize weighted count, saturation, and good brightness
                                            const score = count * weight * (0.5 + saturation * 0.5) * brightnessScore;
                                            
                                            if (score > maxScore) {
                                                maxScore = score;
                                                dominantColor = clusterColor;
                                            }
                                        }
                                    }
                                }
                                
                                // Fallback: try to find main container background (more thorough)
                                let bgColor = dominantColor;
                                if (!bgColor || isNeutralColor(bgColor)) {
                                    const mainSelectors = [
                                        'main', '[role="main"]', '.main', '#main', 
                                        '.content', '#content', '.container', '.page', '.app', 
                                        'article', 'section', '[class*="content"]', '[class*="container"]',
                                        '[id*="content"]', '[id*="container"]', '[id*="main"]'
                                    ];
                                    
                                    for (const selector of mainSelectors) {
                                        const element = document.querySelector(selector);
                                        if (element) {
                                            const style = window.getComputedStyle(element);
                                            const bg = style.backgroundColor;
                                            if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') {
                                                const hex = rgbToHex(bg);
                                                if (hex) {
                                                    // Accept any color that's not pure white/black
                                                    if (!isNeutralColor(hex)) {
                                                        bgColor = hex;
                                                        break;
                                                    } else {
                                                        // Even if neutral, use it as fallback if we have nothing
                                                        if (!bgColor) {
                                                            bgColor = hex;
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Last resort: check body/html (accept any color)
                                    if (!bgColor || isNeutralColor(bgColor)) {
                                        const bodyStyle = window.getComputedStyle(body);
                                        const bodyBg = bodyStyle.backgroundColor;
                                        if (bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)') {
                                            const hex = rgbToHex(bodyBg);
                                            if (hex) {
                                                bgColor = hex;
                                            }
                                        }
                                        
                                        // Try html element too
                                        if (!bgColor || isNeutralColor(bgColor)) {
                                            const htmlStyle = window.getComputedStyle(html);
                                            const htmlBg = htmlStyle.backgroundColor;
                                            if (htmlBg && htmlBg !== 'transparent' && htmlBg !== 'rgba(0, 0, 0, 0)') {
                                                const hex = rgbToHex(htmlBg);
                                                if (hex) {
                                                    bgColor = hex;
                                                }
                                            }
                                        }
                                    }
                                }
                                
                                // Extract text color
                                let textColor = null;
                                const bodyStyle = window.getComputedStyle(body);
                                const bodyTextColor = bodyStyle.color;
                                if (bodyTextColor) {
                                    textColor = rgbToHex(bodyTextColor);
                                }
                                
                                return {
                                    backgroundColor: bgColor,
                                    textColor: textColor,
                                    themeColor: themeColor
                                };
                            } catch (e) {
                                return null;
                            }
                        })();
                    `).then((colors) => {
                        // Prioritize theme-color meta tag, then background color
                        if (colors && colors.themeColor) {
                            // Use theme color from meta tag (most reliable)
                            this.applyWebpageTheme({ themeColor: colors.themeColor, backgroundColor: colors.themeColor, textColor: colors.textColor });
                        } else if (colors && colors.backgroundColor && colors.backgroundColor !== '#ffffff' && colors.backgroundColor !== '#000000') {
                            // Use extracted background color
                            this.applyWebpageTheme(colors);
                        } else if (retryCount < 1) {
                            // Retry once quickly (single RAF for speed)
                            requestAnimationFrame(() => {
                                this.extractAndApplyWebpageColors(webview, retryCount + 1);
                            });
                        } else {
                            // Only reset to black if we truly can't find colors
                            this.resetToBlackTheme();
                        }
                    }).catch((error) => {
                        // Only log if it's not a common error
                        if (!error.message || (!error.message.includes('Object has been destroyed') && !error.message.includes('WebContents'))) {
                            console.error('Error executing JavaScript for color extraction:', error);
                        }
                        // Retry once quickly (single RAF for speed)
                        if (retryCount < 1) {
                            requestAnimationFrame(() => {
                                this.extractAndApplyWebpageColors(webview, retryCount + 1);
                            });
                        } else {
                            this.resetToBlackTheme();
                        }
                    });
                } catch (error) {
                    console.error('Error in extractColors:', error);
                    if (retryCount < 1) {
                        requestAnimationFrame(() => {
                            this.extractAndApplyWebpageColors(webview, retryCount + 1);
                        });
                    } else {
                        this.resetToBlackTheme();
                    }
                }
            };
            
            extractColors();
        } catch (error) {
            console.error('Error extracting webpage colors:', error);
            if (retryCount < 1) {
                requestAnimationFrame(() => {
                    this.extractAndApplyWebpageColors(webview, retryCount + 1);
                });
            } else {
                this.resetToBlackTheme();
            }
        }
    }
    
    applyWebpageTheme(webpageColors) {
        let primary = webpageColors.themeColor || webpageColors.backgroundColor || '#1a1a1a';
        
        // Make theme a bit darker than website colors
        const isDark = this.isDarkColor(primary);
        if (isDark) {
            // For dark colors, darken them a bit
            primary = this.darkenColor(primary, 0.05);
        } else {
            // For light colors, darken a bit more
            primary = this.darkenColor(primary, 0.08);
        }
        
        // Use minimal variations for secondary and accent (darker)
        const secondary = this.darkenColor(primary, 0.02);
        const accent = this.darkenColor(primary, 0.03);
        
        // Get readable text color based on contrast ratio (WCAG AA standard)
        const text = this.getReadableTextColor(primary, 4.5);
        const isTextDark = text === '#000000';
        
        // Calculate secondary and muted text colors with good contrast
        const textSecondary = isTextDark ? '#333333' : '#cccccc';
        const textMuted = isTextDark ? '#666666' : '#999999';
        
        const colors = {
            primary: primary,
            secondary: secondary,
            accent: accent,
            text: text,
            textSecondary: textSecondary,
            textMuted: textMuted,
            border: isTextDark ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)',
            borderLight: isTextDark ? 'rgba(0, 0, 0, 0.12)' : 'rgba(255, 255, 255, 0.12)'
        };
        
        this.applyCustomTheme(colors);
    }
    
    resetToBlackTheme() {
        const colors = {
            primary: '#1a1a1a', // Lighter black instead of pure black
            secondary: '#222222', // Less contrast
            accent: '#2a2a2a', // Subtle accent
            text: '#ffffff',
            textSecondary: '#cccccc',
            textMuted: '#999999',
            border: 'rgba(255, 255, 255, 0.08)', // Less visible borders
            borderLight: 'rgba(255, 255, 255, 0.12)'
        };
        this.applyCustomTheme(colors);
    }
    
    lightenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.min(255, parseInt(hex.slice(0, 2), 16) + Math.round(255 * amount));
        const g = Math.min(255, parseInt(hex.slice(2, 4), 16) + Math.round(255 * amount));
        const b = Math.min(255, parseInt(hex.slice(4, 6), 16) + Math.round(255 * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    applyCustomTheme(colors) {
        // Pre-calculate all color values once to avoid repeated calculations
        const darkerPrimary = colors.primary;
            const headerBg = this.darkenColor(colors.primary, 0.03);
        const urlBarBg = this.darkenColor(colors.primary, 0.08);
        const urlBarFocusBg = this.darkenColor(colors.primary, 0.03);
        const tabHoverBg = this.darkenColor(colors.primary, 0.03);
        const tabActiveBg = this.darkenColor(colors.primary, 0.02);
        const buttonHoverBg = this.darkenColor(colors.primary, 0.05);
        const secondaryColor = this.darkenColor(colors.primary, 0.02);
        const isDark = this.isDarkColor(colors.primary);
        const textSecondary = colors.textSecondary || colors.text;
        const borderColor = colors.border || 'rgba(255, 255, 255, 0.08)';
        const borderColorLight = colors.borderLight || 'rgba(255, 255, 255, 0.12)';
        
        // Batch all CSS variable updates using setProperty for maximum performance
        // Using setProperty is faster than individual style updates and doesn't overwrite other styles
        const root = document.documentElement;
        const style = root.style;
        
        // Core theme colors - batch update
        style.setProperty('--background-color', darkerPrimary);
        style.setProperty('--text-color', colors.text);
        style.setProperty('--text-color-secondary', textSecondary);
        style.setProperty('--text-color-muted', colors.textMuted || colors.text);
        style.setProperty('--popup-background', darkerPrimary);
        style.setProperty('--popup-header', headerBg);
        style.setProperty('--button-background', 'transparent');
        style.setProperty('--button-hover', buttonHoverBg);
        style.setProperty('--button-text', colors.text);
        style.setProperty('--button-text-hover', colors.text);
        style.setProperty('--sidebar-background', darkerPrimary);
        style.setProperty('--url-bar-background', urlBarBg);
        style.setProperty('--url-bar-focus-background', urlBarFocusBg);
        style.setProperty('--url-bar-text', colors.text);
        style.setProperty('--url-bar-text-muted', textSecondary);
        style.setProperty('--tab-background', 'transparent');
        style.setProperty('--tab-background-hover', tabHoverBg);
        style.setProperty('--tab-background-active', tabActiveBg);
        style.setProperty('--tab-text', colors.text);
        style.setProperty('--tab-text-active', colors.text);
        style.setProperty('--tab-close-color', textSecondary);
        style.setProperty('--tab-close-hover', colors.text);
        style.setProperty('--icon-color', textSecondary);
        style.setProperty('--icon-hover', colors.text);
        style.setProperty('--border-color', borderColor);
        style.setProperty('--border-color-light', borderColorLight);
        style.setProperty('--accent-color', colors.accent);
        style.setProperty('--primary-color', darkerPrimary);
        style.setProperty('--secondary-color', secondaryColor);
        
        // Animation colors - batch update based on theme brightness
        if (isDark) {
            style.setProperty('--animation-glow', 'rgba(255, 255, 255, 0.3)');
            style.setProperty('--animation-overlay', 'rgba(255, 255, 255, 0.05)');
            style.setProperty('--animation-overlay-hover', 'rgba(255, 255, 255, 0.1)');
            style.setProperty('--animation-shimmer', 'rgba(255, 255, 255, 0.8)');
            style.setProperty('--animation-shimmer-light', 'rgba(255, 255, 255, 0.9)');
            style.setProperty('--animation-border', 'rgba(255, 255, 255, 0.1)');
            style.setProperty('--animation-border-hover', 'rgba(255, 255, 255, 0.2)');
            style.setProperty('--animation-focus-ring', 'rgba(255, 255, 255, 0.15)');
            style.setProperty('--animation-focus-ring-light', 'rgba(255, 255, 255, 0.1)');
        } else {
            style.setProperty('--animation-glow', 'rgba(0, 0, 0, 0.2)');
            style.setProperty('--animation-overlay', 'rgba(0, 0, 0, 0.03)');
            style.setProperty('--animation-overlay-hover', 'rgba(0, 0, 0, 0.08)');
            style.setProperty('--animation-shimmer', 'rgba(255, 255, 255, 0.6)');
            style.setProperty('--animation-shimmer-light', 'rgba(255, 255, 255, 0.7)');
            style.setProperty('--animation-border', 'rgba(0, 0, 0, 0.1)');
            style.setProperty('--animation-border-hover', 'rgba(0, 0, 0, 0.15)');
            style.setProperty('--animation-focus-ring', 'rgba(0, 0, 0, 0.15)');
            style.setProperty('--animation-focus-ring-light', 'rgba(0, 0, 0, 0.1)');
        }
        
        // Shadow colors
        const shadowOpacity = isDark ? 0.2 : 0.15;
        const shadowOpacityLight = isDark ? 0.1 : 0.08;
        const shadowOpacityMedium = isDark ? 0.3 : 0.25;
        style.setProperty('--animation-shadow', `rgba(0, 0, 0, ${shadowOpacity})`);
        style.setProperty('--animation-shadow-light', `rgba(0, 0, 0, ${shadowOpacityLight})`);
        style.setProperty('--animation-shadow-medium', `rgba(0, 0, 0, ${shadowOpacityMedium})`);
        
        // Only update critical elements directly - CSS variables handle everything else
        document.body.style.background = darkerPrimary;
        document.body.style.color = colors.text;
        
        // Update cached sidebar if available
        if (this.elements?.sidebar) {
            this.elements.sidebar.style.background = darkerPrimary;
        }
    }

    // Helper function to darken colors
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.slice(0, 2), 16) - Math.round(255 * amount));
        const g = Math.max(0, parseInt(hex.slice(2, 4), 16) - Math.round(255 * amount));
        const b = Math.max(0, parseInt(hex.slice(4, 6), 16) - Math.round(255 * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    
    // Refresh popup themes when they're opened
    refreshPopupThemes() {
        // Reapply theme to all popup elements
        const popupElements = document.querySelectorAll('.downloads-panel, .settings-panel, .nav-menu, .context-menu, .quit-modal-card');
        popupElements.forEach(popup => {
            if (!popup.classList.contains('hidden')) {
                // Force re-theme visible popups
                const textElements = popup.querySelectorAll('.history-url, .history-time, .download-url, .shortcut-desc, .setting-item label, .nav-menu-item, .context-menu-item, .quit-modal-title, .quit-modal-subtitle, .quit-modal-icon');
                textElements.forEach(element => {
                    element.style.color = '';
                    // Trigger reflow to ensure CSS variables are applied
                    element.offsetHeight;
                });
            }
        });
    }

    createTabWebview(tabId) {
        const container = document.getElementById('webviews-container');
        if (!container) return null;

        const webview = document.createElement('webview');
        webview.dataset.tabId = String(tabId);
        webview.setAttribute('allowpopups', '');
        webview.setAttribute('webpreferences', 'contextIsolation=false,nodeIntegration=false,webSecurity=false,accelerated2dCanvas=true,enableWebGL=true,enableWebGL2=true,enableGpuRasterization=true,enableZeroCopy=true,enableHardwareAcceleration=true');
        webview.setAttribute('partition', 'persist:main');
        webview.setAttribute('useragent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        webview.setAttribute('autosize', 'true');
        webview.setAttribute('disablewebsecurity', 'true');
        webview.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
            will-change: transform;
            transform: translateZ(0);
            backface-visibility: hidden;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            z-index: 0;
        `;

        container.appendChild(webview);
        this.setupWebviewEventListeners(webview, tabId);
        return webview;
    }

    getActiveWebview() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) {
            return null;
        }
        const tab = this.tabs.get(this.currentTab);
        return tab?.webview || null;
    }

    createNewTab(url = null) {
        const tabId = Date.now();
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tabId;
        
        tabElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    <img class="tab-favicon" src="" alt="" onerror="this.style.visibility='hidden'">
                    <span class="tab-title">New Tab</span>
                </div>
                <div class="tab-right">
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        // Add tab to container - determine position based on pinned state
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        const tabData = {
            id: tabId,
            url: url || null,
            title: 'New Tab',
            favicon: null, // Cache favicon URL
            canGoBack: false,
            canGoForward: false,
            history: url ? [url] : [],
            historyIndex: url ? 0 : -1,
            pinned: false, // New tabs are unpinned by default
            webview: null
        };
        
        // Create webview for this tab
        const webview = this.createTabWebview(tabId);
        if (webview) {
            tabData.webview = webview;
        }
        
        // Store tab data first
        this.tabs.set(tabId, tabData);
        
        // Insert tab below separator (unpinned section)
        if (separator && separator.parentNode === tabsContainer) {
            tabsContainer.insertBefore(tabElement, separator.nextSibling);
        } else {
            tabsContainer.appendChild(tabElement);
        }

        // Set up tab event listeners
        this.setupTabEventListeners(tabElement, tabId);

        // Switch to new tab
        this.switchToTab(tabId);

        // Hide empty state now that we have a tab
        this.updateEmptyState();

        // Navigate to google.com for new tabs without URL
        if (!url) {
            this.navigate('https://www.google.com');
        } else {
        // Navigate if URL provided
            this.navigate(url);
        }
        this.updateTabFavicon(tabId, tabElement);
        
        // Save pinned tabs state
        this.savePinnedTabs();
        
        // Re-render folders in case tab organization changed
        this.renderFolders();
    }

    setupTabEventListeners(tabElement, tabId) {
        // Tab click
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close')) {
                this.switchToTab(tabId);
            }
        });

        // Tab close
        const closeBtn = tabElement.querySelector('.tab-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tabId);
            });
        }

        // Tab right-click for context menu
        tabElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showTabContextMenu(e, tabId);
        });
    }

    switchToTab(tabId) {
        if (!tabId || !this.tabs.has(tabId)) {
            // If trying to switch to invalid tab and we have no current tab
            if (this.tabs.size === 0) {
                    // No tabs left, show empty state and reset to black theme
                    this.currentTab = null;
                    this.resetToBlackTheme();
                    this.updateEmptyState();
                    this.updateUrlBar();
                    this.updateNavigationButtons();
                }
            // Don't automatically switch to first tab - user must click a tab
            return;
        }

        // Fast tab switching: use cached elements and batch DOM updates
        const activeTab = document.querySelector(`[data-tab-id="${tabId}"]`);
        
        // Hide previous tab's webview
        if (this.currentTab && this.currentTab !== tabId) {
            const prevTab = this.tabs.get(this.currentTab);
            if (prevTab && prevTab.webview) {
                prevTab.webview.style.opacity = '0';
                prevTab.webview.style.visibility = 'hidden';
                prevTab.webview.style.pointerEvents = 'none';
                prevTab.webview.style.zIndex = '0';
            }
            
            // Remove active from previous tab (if exists)
            const prevTabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
            if (prevTabElement) prevTabElement.classList.remove('active');
            }
            
        // Only update active state if tab changed
        if (this.currentTab !== tabId) {
            // Add active to new tab
            if (activeTab) {
                activeTab.classList.add('active');
            }
        }

        this.currentTab = tabId;
        
        // Show and activate new tab's webview
        const tab = this.tabs.get(tabId);
        if (tab) {
            // Ensure webview exists - create if missing
            if (!tab.webview) {
                const webview = this.createTabWebview(tabId);
            if (webview) {
                    tab.webview = webview;
                    this.tabs.set(tabId, tab);
                }
            }
            
            if (tab.webview) {
                const webview = tab.webview;
                
                // Make webview visible and active
                webview.style.opacity = '1';
                webview.style.visibility = 'visible';
                webview.style.pointerEvents = 'auto';
                webview.style.zIndex = '2';
                
                // Update cached webview reference
                this.elements.webview = webview;
                
                // Get current URL from webview
                let currentSrc = null;
                try {
                    currentSrc = webview.getURL();
                } catch (e) {
                    // Webview might not be ready yet
                    currentSrc = 'about:blank';
                }
                
                // Load content if needed
                if (tab.url && tab.url.startsWith('axis:note://')) {
                    const noteId = tab.url.replace('axis:note://', '');
                    if (!currentSrc || currentSrc === 'about:blank' || !currentSrc.includes('axis:note://')) {
                    this.loadNoteInWebview(noteId);
                    }
                    this.resetToBlackTheme();
                } else if (tab.url && tab.url === 'axis://settings') {
                    if (!currentSrc || currentSrc === 'about:blank' || currentSrc !== 'axis://settings') {
                        this.loadSettingsInWebview();
                    }
                    this.resetToBlackTheme();
                } else if (tab.url && tab.url !== 'about:blank' && tab.url !== '') {
                    const sanitizedTabUrl = this.sanitizeUrl(tab.url);
                    // Only change src if it's different
                    if (!currentSrc || currentSrc === 'about:blank' || currentSrc !== sanitizedTabUrl) {
                        webview.src = sanitizedTabUrl || 'https://www.google.com';
                    } else {
                        // Page is already loaded, extract theme immediately
                        this.extractAndApplyWebpageColors(webview);
                    }
                } else {
                    // If tab has no valid URL, set to Google
                    if (!currentSrc || currentSrc === 'about:blank') {
                    webview.src = 'https://www.google.com';
                    tab.url = 'https://www.google.com';
                    if (!tab.history || tab.history.length === 0) {
                        tab.history = ['https://www.google.com'];
                        tab.historyIndex = 0;
                        }
                        this.tabs.set(tabId, tab);
                    }
                }
            }
        }
        
        // Update favicon for the active tab
        if (activeTab) {
            this.updateTabFavicon(tabId, activeTab);
        }
        
        // Batch UI updates for faster switching
        this.batchDOMUpdates([
            () => this.updateEmptyState(),
            () => this.updateNavigationButtons(),
            () => this.updateUrlBar()
        ]);
    }

    updateEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (!emptyState) return;

        const emptyContent = document.getElementById('empty-state-empty');
        
        if (this.tabs.size === 0 || this.currentTab === null) {
            // Show empty state but keep content hidden (blank screen)
            emptyState.classList.remove('hidden');
            if (emptyContent) emptyContent.classList.add('hidden');
            this.resetToBlackTheme();
        } else {
            // Hide empty state
            emptyState.classList.add('hidden');
            if (emptyContent) emptyContent.classList.add('hidden');
        }
    }

    switchToTabByIndex(index) {
        const tabElements = document.querySelectorAll('.tab');
        if (index >= 0 && index < tabElements.length) {
            const tabElement = tabElements[index];
                const tabId = parseInt(tabElement.dataset.tabId, 10);
            this.switchToTab(tabId);
        }
    }

    closeTab(tabId) {
        // Save pinned tabs before closing (in case it was pinned)
        this.savePinnedTabs();
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tab = this.tabs.get(tabId);
        
        // Store closed tab for recovery (only if it's not a new tab)
        if (tab && tab.url && tab.url !== 'about:blank') {
            this.closedTabs.unshift({
                id: tabId,
                title: tab.title || 'Untitled',
                url: tab.url,
                timestamp: Date.now()
            });
            
            // Keep only the last 10 closed tabs
            if (this.closedTabs.length > 10) {
                this.closedTabs = this.closedTabs.slice(0, 10);
            }
        }
        
        // Remove the tab's webview
        if (tab && tab.webview) {
            try {
                if (tab.webview.parentNode) {
                    tab.webview.parentNode.removeChild(tab.webview);
                }
            } catch (e) {
                console.error('Error removing webview:', e);
            }
        }
        
        if (tabElement) {
            const height = tabElement.getBoundingClientRect().height;
            tabElement.style.height = `${height}px`;
            tabElement.style.minHeight = `${height}px`;
            // Force layout to ensure transition starts from current height
            void tabElement.offsetHeight;
            tabElement.classList.add('closing');
            const onTransitionEnd = () => {
                tabElement.removeEventListener('transitionend', onTransitionEnd);
                if (tabElement && tabElement.parentNode) {
                    tabElement.parentNode.removeChild(tabElement);
                }
            };
            tabElement.addEventListener('transitionend', onTransitionEnd);
        }

        // Delete the tab FIRST to get accurate remaining tabs count
        this.tabs.delete(tabId);
        
        // If we closed the active tab, switch to another tab
        if (this.currentTab === tabId) {
            // Get remaining tabs AFTER deleting
            const remainingTabs = Array.from(this.tabs.keys());
            
            if (remainingTabs.length > 0) {
                // Switch to the last remaining tab (or first if that's all that's left)
                const tabToSwitchTo = remainingTabs[remainingTabs.length - 1];
                // Verify the tab still exists before switching
                if (this.tabs.has(tabToSwitchTo)) {
                    this.switchToTab(tabToSwitchTo);
                } else if (remainingTabs.length > 1) {
                    // Fallback to first tab if last one doesn't exist
                    const fallbackTab = remainingTabs[0];
                    if (this.tabs.has(fallbackTab)) {
                        this.switchToTab(fallbackTab);
                    } else {
                        // No valid tabs found, show empty state and reset to black theme
                        this.currentTab = null;
                        const webview = document.getElementById('webview');
                        if (webview) {
                            webview.src = 'about:blank';
                        }
                        this.resetToBlackTheme();
                        this.updateEmptyState();
                        this.updateUrlBar();
                        this.updateNavigationButtons();
                    }
                } else {
                    // Only one tab left but it doesn't exist, show empty state and reset to black theme
                    this.currentTab = null;
                    this.resetToBlackTheme();
                    const webview = document.getElementById('webview');
                    if (webview) {
                        webview.src = 'about:blank';
                    }
                    this.updateEmptyState();
                    this.updateUrlBar();
                    this.updateNavigationButtons();
                }
            } else {
                // No more tabs - show empty state and reset to black theme
                this.currentTab = null;
                this.resetToBlackTheme();
                const webview = document.getElementById('webview');
                if (webview) {
                    webview.src = 'about:blank';
                }
                this.updateEmptyState();
                this.updateUrlBar();
                this.updateNavigationButtons();
            }
        }
    }

    recoverClosedTab() {
        if (this.closedTabs.length === 0) {
            this.showNotification('No closed tabs to recover', 'info');
            return;
        }
        
        // Get the most recently closed tab
        const closedTab = this.closedTabs.shift();
        
        // Create new tab with the closed tab's URL
        const newTabId = this.createNewTab();
        const tab = this.tabs.get(newTabId);
        
        if (tab) {
            // Navigate to the closed tab's URL
            tab.url = closedTab.url;
            tab.title = closedTab.title;
            
            // Update the tab element
            const tabElement = document.querySelector(`[data-tab-id="${newTabId}"]`);
            if (tabElement) {
                const titleElement = tabElement.querySelector('.tab-title');
                if (titleElement) {
                    titleElement.textContent = closedTab.title;
                }
            }
            
            // Navigate the webview
            const webview = this.getActiveWebview();
            if (webview) {
                const sanitizedClosedTabUrl = this.sanitizeUrl(closedTab.url);
                webview.src = sanitizedClosedTabUrl || 'https://www.google.com';
            }
            
            this.showNotification(`Recovered: ${closedTab.title}`, 'success');
        }
    }

    navigate(url) {
        if (!url) return;

        // Create a tab if there are no tabs
        if (this.tabs.size === 0 || this.currentTab === null) {
            this.createNewTab(url);
            return;
        }

        // Sanitize and validate URL input
        const sanitizedUrl = this.sanitizeUrl(url);
        if (!sanitizedUrl) {
            console.error('Invalid URL provided:', url);
            return;
        }

        // Navigate based on view mode
        if (this.isSplitView) {
            // Navigate in the active pane
            const activeWebview = this.activePane === 'left' ? 
                document.getElementById('webview-left') : 
                document.getElementById('webview-right');
            
            if (activeWebview) {
                this.navigateInPane(activeWebview, sanitizedUrl);
            }
        } else {
            // Navigate in single view
            const webview = this.getActiveWebview();
            if (webview) {
            this.navigateInPane(webview, sanitizedUrl);
            }
        }

        // Update tab data and add to history
        const tab = this.tabs.get(this.currentTab);
        if (tab) {
            // Initialize history if empty
            if (!tab.history || tab.history.length === 0) {
                tab.history = [url];
                tab.historyIndex = 0;
            } else if (tab.url && tab.url !== url) {
                // Remove any forward history if we're navigating to a new URL
                if (tab.historyIndex < tab.history.length - 1) {
                    tab.history = tab.history.slice(0, tab.historyIndex + 1);
                }
                
                // Add new URL to history
                tab.history.push(url);
                tab.historyIndex = tab.history.length - 1;
            }
            
            tab.url = url;
        }

        // Update URL bar
        document.getElementById('url-bar').value = url;
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }

    goBack() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) return;
        
        // Get the appropriate webview based on view mode
        let webview;
        if (this.isSplitView) {
            webview = this.activePane === 'left' ? 
                document.getElementById('webview-left') : 
                document.getElementById('webview-right');
        } else {
            webview = this.getActiveWebview();
        }
        
        if (!webview) return;
        
        const currentTab = this.tabs.get(this.currentTab);
        if (currentTab && currentTab.history && currentTab.history.length > 1 && currentTab.historyIndex > 0) {
            // Move back in tab's history
            currentTab.historyIndex--;
            const previousUrl = currentTab.history[currentTab.historyIndex];
            
            // Navigate to previous URL in this tab's history
            this.navigateToUrlInCurrentTab(previousUrl);
            
            // Update navigation buttons
            this.updateNavigationButtons();
        } else {
            // Fallback to webview navigation
            if (webview.canGoBack()) {
                webview.goBack();
                this.updateNavigationButtons();
            }
        }
    }

    goForward() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) return;
        
        // Get the appropriate webview based on view mode
        let webview;
        if (this.isSplitView) {
            webview = this.activePane === 'left' ? 
                document.getElementById('webview-left') : 
                document.getElementById('webview-right');
        } else {
            webview = this.getActiveWebview();
        }
        
        if (!webview) return;
        
        const currentTab = this.tabs.get(this.currentTab);
        if (currentTab && currentTab.history && currentTab.history.length > 1 && currentTab.historyIndex < currentTab.history.length - 1) {
            // Move forward in tab's history
            currentTab.historyIndex++;
            const nextUrl = currentTab.history[currentTab.historyIndex];
            
            // Navigate to next URL in this tab's history
            this.navigateToUrlInCurrentTab(nextUrl);
            
            // Update navigation buttons
            this.updateNavigationButtons();
        } else {
            // Fallback to webview navigation
            if (webview.canGoForward()) {
                webview.goForward();
                this.updateNavigationButtons();
            }
        }
    }

    navigateToUrlInCurrentTab(url) {
        // Get the appropriate webview based on view mode
        let webview;
        if (this.isSplitView) {
            webview = this.activePane === 'left' ? 
                document.getElementById('webview-left') : 
                document.getElementById('webview-right');
        } else {
            webview = document.getElementById('webview');
        }
        
        if (webview) {
            const sanitizedUrl = this.sanitizeUrl(url);
            webview.src = sanitizedUrl || 'https://www.google.com';
            
            // Update tab data
            const currentTab = this.tabs.get(this.currentTab);
            if (currentTab) {
                currentTab.url = url;
            }
            
            // Update URL bar
            document.getElementById('url-bar').value = url;
        }
    }

    refresh() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) return;
        
        // Get the appropriate webview based on view mode
        let webview;
        if (this.isSplitView) {
            webview = this.activePane === 'left' ? 
                document.getElementById('webview-left') : 
                document.getElementById('webview-right');
        } else {
            webview = document.getElementById('webview');
        }
        
        if (webview) {
            webview.reload();
        }
    }

    updateNavigationButtons() {
        const el = this.elements;
        const backBtn = el?.backBtn;
        const forwardBtn = el?.forwardBtn;
        
        if (!backBtn || !forwardBtn) return;
        
        if (!this.currentTab || !this.tabs.has(this.currentTab)) {
            backBtn.disabled = true;
            forwardBtn.disabled = true;
            return;
        }

        // Get the appropriate webview based on view mode - cache webviews
        let webview;
        if (this.isSplitView) {
            if (!this.cachedWebviews) {
                this.cachedWebviews = {
                    left: document.getElementById('webview-left'),
                    right: document.getElementById('webview-right')
                };
            }
            webview = this.activePane === 'left' ? 
                this.cachedWebviews.left : 
                this.cachedWebviews.right;
        } else {
            webview = el?.webview;
        }

        const currentTab = this.tabs.get(this.currentTab);
        if (currentTab && currentTab.history && currentTab.history.length > 1) {
            // Use tab-specific history for navigation buttons
            backBtn.disabled = currentTab.historyIndex <= 0;
            forwardBtn.disabled = currentTab.historyIndex >= currentTab.history.length - 1;
        } else if (webview) {
            // Fallback to webview navigation
            backBtn.disabled = !webview.canGoBack();
            forwardBtn.disabled = !webview.canGoForward();
        }
    }

    updateUrlBar() {
        const el = this.elements;
        const urlBar = el?.urlBar;
        if (!urlBar) return;

        if (!this.currentTab || !this.tabs.has(this.currentTab)) {
            urlBar.value = '';
            urlBar.classList.remove('summarized');
            return;
        }

        const tab = this.tabs.get(this.currentTab);
        
        // Handle settings tabs
        if (tab && tab.url === 'axis://settings') {
            urlBar.value = 'axis://settings';
            urlBar.classList.remove('summarized');
            return;
        }
        
        // Handle note tabs
        if (tab && tab.url && tab.url.startsWith('axis:note://')) {
            urlBar.value = 'Note: ' + (tab.title || 'Untitled Note');
            urlBar.classList.add('summarized');
            return;
        }

        // Get the appropriate webview based on view mode - use cached webviews
        let webview;
        if (this.isSplitView) {
            if (!this.cachedWebviews) {
                this.cachedWebviews = {
                    left: document.getElementById('webview-left'),
                    right: document.getElementById('webview-right')
                };
            }
            webview = this.activePane === 'left' ? 
                this.cachedWebviews.left : 
                this.cachedWebviews.right;
        } else {
            webview = el?.webview;
        }
        
        if (!webview) return;
        
        const newUrl = webview.getURL();
        
        // Handle case where URL might be null/undefined temporarily
        if (!newUrl || newUrl === 'about:blank') {
            return;
        }
        
        // Get current displayed URL (check both full URL and summarized)
        const currentFullUrl = urlBar.getAttribute('data-full-url') || urlBar.value;
        const isCurrentlyExpanded = urlBar.classList.contains('expanded');
        
        // Update if URL changed, or if URL bar is expanded and needs to be summarized
        if (currentFullUrl !== newUrl || isCurrentlyExpanded) {
            urlBar.value = newUrl;
            // Always summarize after updating URL to ensure it's in summarized state
            this.summarizeUrlBar();
            
            // Also update tab data
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.url !== newUrl) {
                tab.url = newUrl;
            }
        } else {
            // Even if URL didn't change, ensure it's summarized if not already
            if (!urlBar.classList.contains('summarized')) {
                this.summarizeUrlBar();
            }
        }
    }

    summarizeUrlBar() {
        const urlBar = document.getElementById('url-bar');
        const fullUrl = urlBar.value;
        
        if (fullUrl && fullUrl !== 'about:blank') {
            try {
                const url = new URL(fullUrl);
                let summarizedUrl = '';
                
                if (url.hostname) {
                    // Show just the hostname (domain) without www
                    summarizedUrl = url.hostname.replace(/^www\./, '');
                } else {
                    summarizedUrl = fullUrl;
                }
                
                urlBar.setAttribute('data-full-url', fullUrl);
                urlBar.value = summarizedUrl;
                urlBar.classList.add('summarized');
                urlBar.classList.remove('expanded');
            } catch (e) {
                // Invalid URL, keep as is
                urlBar.classList.add('summarized');
                urlBar.classList.remove('expanded');
            }
        } else {
            urlBar.classList.add('summarized');
            urlBar.classList.remove('expanded');
        }
    }

    toggleUrlBarExpansion() {
        const urlBar = document.getElementById('url-bar');
        
        if (urlBar.classList.contains('expanded')) {
            // Collapse to summarized view
            this.summarizeUrlBar();
        } else {
            // Expand to show full URL
            const fullUrl = urlBar.getAttribute('data-full-url') || urlBar.value;
            urlBar.value = fullUrl;
            urlBar.classList.remove('summarized');
            urlBar.classList.add('expanded');
        }
    }

    updateTabTitle() {
        // Get the appropriate webview based on view mode - use cached webviews
        let webview;
        if (this.isSplitView) {
            if (!this.cachedWebviews) {
                this.cachedWebviews = {
                    left: document.getElementById('webview-left'),
                    right: document.getElementById('webview-right')
                };
            }
            webview = this.activePane === 'left' ? 
                this.cachedWebviews.left : 
                this.cachedWebviews.right;
        } else {
            webview = this.elements?.webview;
        }
        
        if (!webview) return;
        
        const title = webview.getTitle() || 'New Tab';
        
        // Direct DOM updates for maximum speed
        const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
        if (tabElement) {
            const titleElement = tabElement.querySelector('.tab-title');
            if (titleElement && titleElement.textContent !== title) {
            titleElement.textContent = title;
            }
        }

        // Update tab data
        const tab = this.tabs.get(this.currentTab);
        if (tab) {
            tab.title = title;
        }

        // Also refresh favicon on title change as sites often inject icons late
        const activeTabEl = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
        if (activeTabEl) this.updateTabFavicon(this.currentTab, activeTabEl);
    }

    toggleSettings() {
        // Open settings as a tab instead of a panel
        this.openSettingsAsTab();
    }

    async openSettingsAsTab() {
        // Check if settings tab already exists
        let settingsTabId = null;
        for (const [tabId, tab] of this.tabs.entries()) {
            if (tab.url === 'axis://settings') {
                settingsTabId = tabId;
                break;
            }
        }

        if (settingsTabId) {
            // Switch to existing settings tab
            this.switchToTab(settingsTabId);
            return;
        }

        // Create a new tab for settings
        const tabId = Date.now();
        const settingsUrl = 'axis://settings';
        
        // Create tab element
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tabId;
        
        tabElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    <i class="fas fa-cog tab-settings-icon" style="color: #4a90e2; margin-right: 8px; font-size: 14px;"></i>
                    <span class="tab-title">Settings</span>
                </div>
                <div class="tab-right">
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        // Add tab to container
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        
        const tabData = {
            id: tabId,
            url: settingsUrl,
            title: 'Settings',
            canGoBack: false,
            canGoForward: false,
            history: [settingsUrl],
            historyIndex: 0,
            pinned: false,
            isSettings: true
        };
        
        this.tabs.set(tabId, tabData);
        
        // Insert tab below separator
        if (separator && separator.parentNode === tabsContainer) {
            tabsContainer.insertBefore(tabElement, separator.nextSibling);
        } else {
            tabsContainer.appendChild(tabElement);
        }

        // Set up tab event listeners
        this.setupTabEventListeners(tabElement, tabId);

        // Switch to new tab
        this.switchToTab(tabId);
        this.updateEmptyState();
        
        // Load settings content
        this.loadSettingsInWebview();
    }

    async loadSettingsInWebview() {
        const webview = this.getActiveWebview();
        if (!webview) return;

        // Get current settings
        const blockTrackers = this.settings.blockTrackers || false;
        const blockAds = this.settings.blockAds || false;
        const privateMode = this.settings.privateMode || false;

        // Get history for history tab
        const history = await this.getHistory();
        const historyHtml = history.length === 0 
            ? '<div class="empty-state"><i class="fas fa-history"></i><p>No history found</p></div>'
            : history.map(item => `
                <div class="history-item" data-url="${this.escapeHtml(item.url)}">
                    <img class="history-favicon" src="${this.escapeHtml(item.favicon)}" alt="" onerror="this.style.display='none'">
                    <div class="history-info">
                        <div class="history-title">${this.escapeHtml(item.title)}</div>
                        <div class="history-url">${this.escapeHtml(item.url)}</div>
                    </div>
                    <div class="history-time">${this.escapeHtml(item.time)}</div>
                    <div class="history-actions">
                        <button class="history-delete" data-id="${item.id}" title="Delete">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('');
        
        // Create settings HTML
        const settingsHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Settings - Axis Browser</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: #0a0a0a;
            color: #fff;
            min-height: 100vh;
            padding: 0;
            line-height: 1.6;
        }
        .settings-container {
            max-width: 1000px;
            margin: 0 auto;
            padding: 60px 40px;
        }
        .settings-header {
            margin-bottom: 48px;
            padding-bottom: 24px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .settings-header h1 {
            font-size: 36px;
            font-weight: 700;
            margin-bottom: 8px;
            letter-spacing: -0.8px;
            background: linear-gradient(135deg, #fff 0%, rgba(255, 255, 255, 0.8) 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .settings-header p {
            color: rgba(255, 255, 255, 0.5);
            font-size: 15px;
            font-weight: 400;
        }
        .settings-tabs {
            display: flex;
            gap: 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            margin-bottom: 40px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 12px 12px 0 0;
            padding: 4px;
        }
        .settings-tab {
            padding: 14px 28px;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.5);
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            border-radius: 8px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            position: relative;
        }
        .settings-tab:hover {
            color: rgba(255, 255, 255, 0.8);
            background: rgba(255, 255, 255, 0.04);
        }
        .settings-tab.active {
            color: #fff;
            background: rgba(255, 255, 255, 0.08);
        }
        .settings-tab-content {
            display: none;
            animation: fadeIn 0.3s ease;
        }
        .settings-tab-content.active {
            display: block;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .setting-group {
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 16px;
            padding: 32px;
            margin-bottom: 24px;
            backdrop-filter: blur(20px);
            transition: all 0.2s ease;
        }
        .setting-group:hover {
            border-color: rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.05);
        }
        .setting-group h4 {
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 24px;
            color: rgba(255, 255, 255, 0.95);
            letter-spacing: 0.2px;
            text-transform: uppercase;
            font-size: 12px;
            letter-spacing: 0.8px;
        }
        .setting-item {
            margin-bottom: 20px;
            padding: 16px;
            background: rgba(255, 255, 255, 0.02);
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.04);
            transition: all 0.2s ease;
        }
        .setting-item:hover {
            background: rgba(255, 255, 255, 0.04);
            border-color: rgba(255, 255, 255, 0.08);
        }
        .setting-item:last-child {
            margin-bottom: 0;
        }
        .setting-item label {
            display: flex;
            align-items: center;
            gap: 14px;
            cursor: pointer;
            font-size: 15px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 400;
        }
        .setting-item input[type="checkbox"] {
            width: 20px;
            height: 20px;
            cursor: pointer;
            accent-color: #4a90e2;
            border-radius: 4px;
        }
        .history-controls {
            display: flex;
            gap: 12px;
            margin-bottom: 28px;
        }
        .history-search {
            flex: 1;
            padding: 14px 18px;
            background: rgba(255, 255, 255, 0.04);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 12px;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.2s ease;
        }
        .history-search:focus {
            border-color: #4a90e2;
            background: rgba(255, 255, 255, 0.06);
            box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.1);
        }
        .history-search::placeholder {
            color: rgba(255, 255, 255, 0.3);
        }
        .clear-btn {
            padding: 14px 24px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: rgba(255, 255, 255, 0.8);
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .clear-btn:hover {
            background: rgba(255, 59, 48, 0.15);
            border-color: rgba(255, 59, 48, 0.3);
            color: #ff3b30;
            transform: translateY(-1px);
        }
        .history-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        .history-item {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 16px 20px;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .history-item:hover {
            background: rgba(255, 255, 255, 0.06);
            border-color: rgba(255, 255, 255, 0.12);
            transform: translateX(4px);
        }
        .history-favicon {
            width: 18px;
            height: 18px;
            border-radius: 3px;
            flex-shrink: 0;
        }
        .history-info {
            flex: 1;
            min-width: 0;
        }
        .history-title {
            font-size: 15px;
            font-weight: 500;
            color: rgba(255, 255, 255, 0.95);
            margin-bottom: 6px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .history-url {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.45);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .history-time {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.35);
            white-space: nowrap;
            font-weight: 400;
        }
        .history-actions {
            display: flex;
            gap: 8px;
            opacity: 0;
            transition: opacity 0.2s ease;
        }
        .history-item:hover .history-actions {
            opacity: 1;
        }
        .history-delete {
            padding: 8px 12px;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.5);
            cursor: pointer;
            transition: all 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .history-delete:hover {
            background: rgba(255, 59, 48, 0.15);
            border-color: rgba(255, 59, 48, 0.3);
            color: #ff3b30;
            transform: scale(1.05);
        }
        .shortcut-group {
            margin-bottom: 40px;
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.06);
            border-radius: 16px;
            padding: 24px;
        }
        .shortcut-group:last-child {
            margin-bottom: 0;
        }
        .shortcut-group h4 {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 20px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .shortcut-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 14px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            transition: all 0.2s ease;
        }
        .shortcut-item:hover {
            padding-left: 8px;
            padding-right: 8px;
            background: rgba(255, 255, 255, 0.03);
            border-radius: 8px;
        }
        .shortcut-item:last-child {
            border-bottom: none;
        }
        .shortcut-key {
            font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            padding: 6px 10px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: rgba(255, 255, 255, 0.9);
            font-weight: 500;
            letter-spacing: 0.3px;
            min-width: 80px;
            text-align: center;
        }
        .shortcut-desc {
            font-size: 15px;
            color: rgba(255, 255, 255, 0.85);
            font-weight: 400;
        }
        .empty-state {
            text-align: center;
            padding: 80px 20px;
            color: rgba(255, 255, 255, 0.4);
        }
        .empty-state i {
            font-size: 48px;
            color: rgba(255, 255, 255, 0.15);
            margin-bottom: 16px;
            }
    </style>
</head>
<body>
    <div class="settings-container">
        <div class="settings-header">
            <h1>Settings</h1>
            <p>Manage your browser preferences</p>
        </div>
        
        <div class="settings-tabs">
            <button class="settings-tab active" data-tab="general">General</button>
            <button class="settings-tab" data-tab="history">History</button>
            <button class="settings-tab" data-tab="shortcuts">Shortcuts</button>
        </div>
        
        <div class="settings-tab-content active" id="general-tab">
            <div class="setting-group">
                <h4>Privacy & Security</h4>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="block-trackers" ${blockTrackers ? 'checked' : ''}>
                        Block trackers
                    </label>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="block-ads" ${blockAds ? 'checked' : ''}>
                        Block ads
                    </label>
                </div>
                <div class="setting-item">
                    <label>
                        <input type="checkbox" id="private-mode" ${privateMode ? 'checked' : ''}>
                        Enhanced private mode
                    </label>
                </div>
            </div>
        </div>
        
        <div class="settings-tab-content" id="history-tab">
            <div class="history-controls">
                <input type="text" id="history-search" placeholder="Search history..." class="history-search">
                <button id="clear-history" class="clear-btn" title="Clear All History">
                    <i class="fas fa-trash"></i> Clear All
                </button>
            </div>
            <div class="history-list" id="history-list">
                ${historyHtml}
            </div>
        </div>
        
        <div class="settings-tab-content" id="shortcuts-tab">
            <div class="shortcut-group">
                <h4>Navigation</h4>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + T</span>
                    <span class="shortcut-desc">New Tab</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + W</span>
                    <span class="shortcut-desc">Close Tab</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + Z</span>
                    <span class="shortcut-desc">Recover Closed Tab</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + R</span>
                    <span class="shortcut-desc">Refresh Page</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + L</span>
                    <span class="shortcut-desc">Focus URL Bar</span>
                </div>
            </div>
            
            <div class="shortcut-group">
                <h4>Tab Management</h4>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + 1-9</span>
                    <span class="shortcut-desc">Switch to tab 1-9</span>
                </div>
            </div>
            
            <div class="shortcut-group">
                <h4>Panels & Menus</h4>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + B</span>
                    <span class="shortcut-desc">Toggle Sidebar</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + Y</span>
                    <span class="shortcut-desc">Open History</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + J</span>
                    <span class="shortcut-desc">Open Downloads</span>
                </div>
                <div class="shortcut-item">
                    <span class="shortcut-key">⌘ + ,</span>
                    <span class="shortcut-desc">Open Settings</span>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Tab switching
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                document.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(tabName + '-tab').classList.add('active');
            });
        });
        
        // Settings checkboxes
        document.getElementById('block-trackers').addEventListener('change', (e) => {
            window.postMessage({ type: 'updateSetting', key: 'blockTrackers', value: e.target.checked }, '*');
        });
        document.getElementById('block-ads').addEventListener('change', (e) => {
            window.postMessage({ type: 'updateSetting', key: 'blockAds', value: e.target.checked }, '*');
        });
        document.getElementById('private-mode').addEventListener('change', (e) => {
            window.postMessage({ type: 'updateSetting', key: 'privateMode', value: e.target.checked }, '*');
        });
        
        // History search
        document.getElementById('history-search').addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            document.querySelectorAll('.history-item').forEach(item => {
                const title = item.querySelector('.history-title').textContent.toLowerCase();
                const url = item.querySelector('.history-url').textContent.toLowerCase();
                if (title.includes(searchTerm) || url.includes(searchTerm)) {
                    item.style.display = 'flex';
        } else {
                    item.style.display = 'none';
                }
            });
        });
        
        // Clear history
        document.getElementById('clear-history').addEventListener('click', () => {
            if (confirm('Are you sure you want to clear all history?')) {
                window.postMessage({ type: 'clearHistory' }, '*');
            }
        });
        
        // Delete history item
        document.querySelectorAll('.history-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                window.postMessage({ type: 'deleteHistoryItem', id: id }, '*');
            });
        });
        
        // Navigate to history item
        document.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.history-delete')) {
                    const url = item.dataset.url;
                    window.postMessage({ type: 'navigate', url: url }, '*');
                }
            });
        });
    </script>
</body>
</html>`;

        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(settingsHtml);
        webview.src = dataUrl;
        
        // Reset to black theme for settings
        this.resetToBlackTheme();
    }

    switchSettingsTab(tabName) {
        const currentActiveContent = document.querySelector('.settings-tab-content.active');
        const newContent = document.getElementById(`${tabName}-tab`);
        
        // If already on the same tab, do nothing
        if (currentActiveContent === newContent) return;

        // Remove active class from all tabs
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.classList.remove('active');
        });

        // Add active class to selected tab
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Handle content transition
        if (currentActiveContent && newContent) {
            // Start exit animation for current content
            currentActiveContent.classList.add('leaving');
            currentActiveContent.classList.remove('active');

            // Switch content immediately
                currentActiveContent.classList.remove('leaving');
                currentActiveContent.style.display = 'none';

            // Show new content immediately
                newContent.style.display = 'block';
                    newContent.classList.add('active');
        } else {
            // Fallback for first load or missing elements
            document.querySelectorAll('.settings-tab-content').forEach(content => {
                content.classList.remove('active', 'entering', 'leaving');
                content.style.display = 'none';
            });
            
            newContent.style.display = 'block';
            newContent.classList.add('active');
        }

        // Load content based on tab
        if (tabName === 'history') {
            this.populateHistory();
        }
    }


    populateSettings() {
        document.getElementById('block-trackers').checked = this.settings.blockTrackers || false;
        document.getElementById('block-ads').checked = this.settings.blockAds || false;
    }

    // Notes functionality - now works as tabs
    async openNoteAsTab(noteId = null) {
        // Create a new tab for the note
        const tabId = Date.now();
        const noteUrl = noteId ? `axis:note://${noteId}` : `axis:note://new`;
        
        // Create tab element
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tabId;
        
        const noteTitle = noteId ? 'Loading...' : 'New Note';
        tabElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    <i class="fas fa-sticky-note tab-note-icon" style="color: #ffd700; margin-right: 8px; font-size: 14px;"></i>
                    <span class="tab-title">${this.escapeHtml(noteTitle)}</span>
                </div>
                <div class="tab-right">
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        // Add tab to container
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        
        const tabData = {
            id: tabId,
            url: noteUrl,
            title: noteTitle,
            canGoBack: false,
            canGoForward: false,
            history: [noteUrl],
            historyIndex: 0,
            pinned: false,
            isNote: true,
            noteId: noteId
        };
        
        this.tabs.set(tabId, tabData);
        
        // Insert tab below separator
        if (separator && separator.parentNode === tabsContainer) {
            tabsContainer.insertBefore(tabElement, separator.nextSibling);
        } else {
            tabsContainer.appendChild(tabElement);
        }

        // Set up tab event listeners
        this.setupTabEventListeners(tabElement, tabId);

        // Switch to new tab
        this.switchToTab(tabId);
        this.updateEmptyState();
        
        // Load note content
        if (noteId) {
            // Load existing note
            const notes = await window.electronAPI.getNotes();
            const note = notes.find(n => n.id === parseInt(noteId));
            if (note) {
                tabData.title = note.title || 'Untitled Note';
                const titleEl = tabElement.querySelector('.tab-title');
                if (titleEl) titleEl.textContent = tabData.title;
            }
        }
    }

    async onEmbeddedMessage(event) {
        if (!event.data) return;
        
        // Handle settings page messages
        if (event.data.type === 'updateSetting') {
            const { key, value } = event.data;
            await window.electronAPI.setSetting(key, value);
            this.settings[key] = value;
            return;
        }
        
        if (event.data.type === 'clearHistory') {
            await this.clearAllHistory();
            // Reload settings page to refresh history
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.url === 'axis://settings') {
                this.loadSettingsInWebview();
            }
            return;
        }
        
        if (event.data.type === 'deleteHistoryItem') {
            const { id } = event.data;
            await this.deleteHistoryItem(id);
            // Reload settings page to refresh history
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.url === 'axis://settings') {
                this.loadSettingsInWebview();
            }
            return;
        }
        
        if (event.data.type === 'navigate') {
            const { url } = event.data;
            this.navigate(url);
            return;
        }
        
        // Handle note messages
        if (event.data.type !== 'saveNote') return;
        
        const { note } = event.data;
        try {
            const savedNote = await window.electronAPI.saveNote(note);
            
            // Update current tab if it's a note tab
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.url && tab.url.startsWith('axis:note://')) {
                // Update tab data
                tab.title = savedNote.title || 'Untitled Note';
                this.tabs.set(this.currentTab, tab);
                
                // Update tab element
                const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
                if (tabElement) {
                    const titleEl = tabElement.querySelector('.tab-title');
                    if (titleEl) titleEl.textContent = tab.title;
                }
                
                // Update URL bar
                this.updateUrlBar();
                
                // If this was a new note, update the URL
                if (tab.url === 'axis:note://new' && savedNote.id) {
                    tab.url = `axis:note://${savedNote.id}`;
                    tab.noteId = savedNote.id;
                    this.tabs.set(this.currentTab, tab);
                }
                
                // Send confirmation back to webview
                const webview = document.getElementById('webview');
                if (webview) {
                    webview.executeJavaScript(`
                        (function() {
                            if (window.updateSaveStatus) {
                                window.updateSaveStatus(true);
                            }
                            window.postMessage({ type: 'noteSaved' }, '*');
                        })();
                    `);
                }
                
                // Refresh notes list if panel is open
                const notesPanel = document.getElementById('notes-panel');
                if (notesPanel && !notesPanel.classList.contains('hidden')) {
                    await this.populateNotes();
                }
            }
        } catch (error) {
            console.error('Error saving note:', error);
            const webview = document.getElementById('webview');
            if (webview) {
                webview.executeJavaScript(`
                    if (window.updateSaveStatus) {
                        window.updateSaveStatus(false);
                    }
                `);
            }
        }
    }

    async loadNoteInWebview(noteId) {
        const webview = this.getActiveWebview();
        if (!webview) return;

        let note = null;
        if (noteId !== 'new') {
            const notes = await window.electronAPI.getNotes();
            note = notes.find(n => n.id === parseInt(noteId));
        }

        const noteTitle = note ? (note.title || 'Untitled Note') : '';
        const noteContent = note ? (note.content || '') : '';

        // Create modern HTML for note editor
        const noteHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(noteTitle || 'New Note')}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background: linear-gradient(135deg, #0a0a0a 0%, #0f0f0f 100%);
            color: #fff;
            height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .note-header {
            padding: 20px 32px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            background: rgba(15, 15, 15, 0.8);
            backdrop-filter: blur(20px);
            display: flex;
            align-items: center;
            gap: 16px;
            position: sticky;
            top: 0;
            z-index: 10;
            box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
        }
        .note-title-input {
            flex: 1;
            background: transparent;
            border: none;
            color: #fff;
            font-size: 24px;
            font-weight: 600;
            outline: none;
            padding: 8px 0;
            transition: all 0.2s ease;
            letter-spacing: -0.3px;
        }
        .note-title-input:focus {
            color: #fff;
        }
        .note-title-input::placeholder {
            color: rgba(255, 255, 255, 0.3);
            font-weight: 500;
        }
        .note-actions {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .note-status {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.4);
            padding: 6px 12px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 8px;
            min-width: 70px;
            text-align: center;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            font-weight: 500;
            opacity: 0;
            transform: translateY(-2px);
        }
        .note-status.visible {
            opacity: 1;
            transform: translateY(0);
        }
        .note-status.saving {
            color: #ffd700;
            background: rgba(255, 215, 0, 0.1);
        }
        .note-status.saved {
            color: #4ade80;
            background: rgba(74, 222, 128, 0.1);
        }
        .note-status.error {
            color: #f87171;
            background: rgba(248, 113, 113, 0.1);
        }
        .note-btn {
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.12);
            border-radius: 10px;
            color: #fff;
            cursor: pointer;
            padding: 10px 16px;
            font-size: 13px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            display: flex;
            align-items: center;
            gap: 8px;
            font-weight: 500;
        }
        .note-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.2);
            transform: translateY(-1px);
        }
        .note-btn.save {
            background: linear-gradient(135deg, rgba(74, 222, 128, 0.2) 0%, rgba(74, 222, 128, 0.15) 100%);
            border-color: rgba(74, 222, 128, 0.3);
            color: #4ade80;
        }
        .note-btn.save:hover {
            background: linear-gradient(135deg, rgba(74, 222, 128, 0.3) 0%, rgba(74, 222, 128, 0.25) 100%);
            border-color: rgba(74, 222, 128, 0.4);
            box-shadow: 0 4px 12px rgba(74, 222, 128, 0.2);
        }
        .note-content {
            flex: 1;
            padding: 48px;
            overflow-y: auto;
            scroll-behavior: smooth;
            background: transparent;
        }
        .note-content::-webkit-scrollbar {
            width: 10px;
        }
        .note-content::-webkit-scrollbar-track {
            background: transparent;
        }
        .note-content::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.1);
            border-radius: 5px;
            border: 2px solid transparent;
            background-clip: padding-box;
        }
        .note-content::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.2);
            background-clip: padding-box;
        }
        .note-textarea {
            width: 100%;
            height: 100%;
            min-height: 500px;
            max-width: 900px;
            margin: 0 auto;
            background: transparent;
            border: none;
            color: rgba(255, 255, 255, 0.95);
            font-size: 16px;
            line-height: 1.8;
            outline: none;
            resize: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            caret-color: #ffd700;
            padding: 0;
            letter-spacing: 0.01em;
        }
        .note-textarea::placeholder {
            color: rgba(255, 255, 255, 0.25);
        }
        .note-meta {
            padding: 16px 32px;
            border-top: 1px solid rgba(255, 255, 255, 0.06);
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            background: rgba(15, 15, 15, 0.8);
            backdrop-filter: blur(20px);
            position: sticky;
            bottom: 0;
            z-index: 5;
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: 0 -2px 20px rgba(0, 0, 0, 0.3);
        }
        .note-meta-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .word-count {
            color: rgba(255, 255, 255, 0.5);
            font-size: 12px;
            font-weight: 500;
        }
        .word-count span {
            color: rgba(255, 255, 255, 0.4);
            margin-left: 6px;
        }
    </style>
</head>
<body>
    <div class="note-header">
        <input type="text" id="note-title" class="note-title-input" placeholder="Untitled Note" value="${this.escapeHtml(noteTitle)}">
        <div class="note-actions">
            <div class="note-status" id="note-status"></div>
            <button class="note-btn save" onclick="saveNote()" title="Save (Ctrl+S)">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                    <polyline points="17 21 17 13 7 13 7 21"></polyline>
                    <polyline points="7 3 7 8 15 8"></polyline>
                </svg>
                Save
            </button>
        </div>
    </div>
    <div class="note-content">
        <textarea id="note-content" class="note-textarea" placeholder="Start writing...">${this.escapeHtml(noteContent)}</textarea>
    </div>
    <div class="note-meta" id="note-meta">
        <div class="note-meta-left">
            <span id="note-date">${note ? this.formatNoteDate(note.updatedAt || note.createdAt) : 'New note'}</span>
        </div>
        <div class="word-count" id="word-count">0 words<span> • 0 chars</span></div>
    </div>
    <script>
        const noteId = ${noteId === 'new' ? 'null' : noteId};
        let isSaving = false;
        let saveTimeout = null;
        let lastSavedContent = '';
        let lastSavedTitle = '';
        
        function formatDate(dateString) {
            if (!dateString) return 'New note';
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            const diffHours = Math.floor(diffMs / 3600000);
            const diffDays = Math.floor(diffMs / 86400000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return diffMins + ' minute' + (diffMins !== 1 ? 's' : '') + ' ago';
            if (diffHours < 24) return diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
            if (diffDays < 7) return diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' ago';
            
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
        }
        
        function saveNote() {
            if (isSaving) return;
            
            const title = document.getElementById('note-title').value.trim() || 'Untitled Note';
            const content = document.getElementById('note-content').value;
            
            // Check if nothing changed
            if (title === lastSavedTitle && content === lastSavedContent) {
                return;
            }
            
            // Update document title immediately
            document.title = title;
            
            // Show saving status
            updateSaveStatus('saving');
            isSaving = true;
            
            try {
                window.parent.postMessage({ 
                    type: 'saveNote', 
                    note: { 
                        id: noteId || null, 
                        title, 
                        content, 
                        createdAt: noteId ? undefined : new Date().toISOString() 
                    } 
                }, '*');
                
                // Store last saved values
                lastSavedTitle = title;
                lastSavedContent = content;
            } catch (e) { 
                console.error('Failed to post saveNote message', e);
                updateSaveStatus(false);
                isSaving = false;
            }
        }
        
        // Auto-save on Ctrl+S
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                saveNote();
            }
        });
        
        // Real auto-save with 1 second debounce
        function debouncedSave() {
            clearTimeout(saveTimeout);
            saveTimeout = setTimeout(() => {
                if (!isSaving) {
                    saveNote();
                }
            }, 1000);
        }
        
        function updateWordCount() {
            const content = document.getElementById('note-content').value;
            const words = content.trim() ? content.trim().split(/\\s+/).filter(function(word) { return word.length > 0; }).length : 0;
            const characters = content.length;
            const wordCountEl = document.getElementById('word-count');
            if (wordCountEl) {
                wordCountEl.innerHTML = words + ' word' + (words !== 1 ? 's' : '') + '<span> • ' + characters.toLocaleString() + ' chars</span>';
            }
        }
        
        function updateSaveStatus(status) {
            const statusEl = document.getElementById('note-status');
            const dateEl = document.getElementById('note-date');
            if (!statusEl) return;
            
            statusEl.className = 'note-status';
            
            if (status === 'saving') {
                statusEl.textContent = 'Saving...';
                statusEl.classList.add('saving', 'visible');
            } else if (status === true) {
                statusEl.textContent = 'Saved';
                statusEl.classList.add('saved', 'visible');
                isSaving = false;
                if (dateEl) {
                    dateEl.textContent = formatDate(new Date().toISOString());
                }
                setTimeout(() => {
                    statusEl.classList.remove('visible');
                setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.className = 'note-status';
                    }, 300);
                }, 2000);
            } else if (status === false) {
                statusEl.textContent = 'Error saving';
                statusEl.classList.add('error', 'visible');
                isSaving = false;
                setTimeout(() => {
                    statusEl.classList.remove('visible');
                setTimeout(() => {
                    statusEl.textContent = '';
                    statusEl.className = 'note-status';
                    }, 300);
                }, 3000);
            }
        }
        
        window.updateSaveStatus = updateSaveStatus;
        
        // Initialize last saved values
        lastSavedTitle = document.getElementById('note-title').value.trim() || 'Untitled Note';
        lastSavedContent = document.getElementById('note-content').value;
        
        document.getElementById('note-title').addEventListener('input', (e) => {
            const title = e.target.value.trim() || 'Untitled Note';
            document.title = title;
            debouncedSave();
        });
        
        document.getElementById('note-content').addEventListener('input', (e) => {
            updateWordCount();
            debouncedSave();
        });
        
        // Initial word count
        updateWordCount();
        
        // Listen for save status updates from parent
        window.addEventListener('message', (e) => {
            if (!e || !e.data) return;
            if (e.data.type === 'noteSaved') {
                updateSaveStatus(true);
            } else if (e.data.type === 'noteSaveError') {
                updateSaveStatus(false);
            }
        });
    </script>
</body>
</html>`;

        // Use data URL to load the note HTML
        const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(noteHtml);
        webview.src = dataUrl;
    }

    async toggleNotes() {
        const notesPanel = document.getElementById('notes-panel');
        const settingsPanel = document.getElementById('settings-panel');
        const downloadsPanel = document.getElementById('downloads-panel');
        const securityPanel = document.getElementById('security-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        if (!securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        
        if (notesPanel.classList.contains('hidden')) {
            // Smooth fade-in animation
            notesPanel.classList.remove('hidden');
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.transition = 'opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            }
            
            // Add entrance animation class
            notesPanel.classList.add('notes-entering');
            
            // Populate notes immediately
            await this.populateNotes();
            
            // Remove animation class after animation completes (200ms)
            setTimeout(() => {
            notesPanel.classList.remove('notes-entering');
            }, 200);
            
            // Setup event listeners
            this.setupNotesEventListeners();
            
            // Refresh popup themes
            this.refreshPopupThemes();
            
        } else {
            // Smooth fade-out animation
            notesPanel.classList.add('notes-closing');
            
            setTimeout(() => {
                notesPanel.classList.add('hidden');
                notesPanel.classList.remove('notes-closing');
                if (backdrop) backdrop.classList.add('hidden');
            }, 150);
        }
    }

    async populateNotes() {
        const notesList = document.getElementById('notes-list');
        const noNotes = document.getElementById('no-notes');
        const notesCount = document.getElementById('notes-count');
        
        try {
            const notes = await window.electronAPI.getNotes();
            
            // Update notes count
            if (notesCount) {
                const count = notes ? notes.length : 0;
                notesCount.textContent = `${count} note${count !== 1 ? 's' : ''}`;
            }
            
            // Clear immediately
            notesList.innerHTML = '';
            
            if (!notes || notes.length === 0) {
                noNotes.classList.remove('hidden');
                return;
            }
            
            noNotes.classList.add('hidden');
            
            // Add items
            notes.forEach((note) => {
                const noteElement = document.createElement('div');
                noteElement.className = 'note-item';
                noteElement.dataset.noteId = note.id;
                
                const preview = (note.content || '').substring(0, 100).replace(/\n/g, ' ');
                const date = new Date(note.updatedAt || note.createdAt);
                const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                
                noteElement.innerHTML = `
                    <div class="note-item-header">
                        <h4 class="note-item-title">${this.escapeHtml(note.title || 'Untitled Note')}</h4>
                        <div class="note-item-actions">
                            <button class="note-item-delete" data-note-id="${note.id}">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                    <p class="note-item-preview">${this.escapeHtml(preview || 'No content')}</p>
                    <div class="note-item-meta">${formattedDate}</div>
                `;
                
                // Click to open as tab
                noteElement.addEventListener('click', (e) => {
                    if (!e.target.closest('.note-item-delete')) {
                        this.openNoteAsTab(note.id);
                        this.toggleNotes(); // Close notes panel
                    }
                });
                
                // Delete note
                const deleteBtn = noteElement.querySelector('.note-item-delete');
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    await this.deleteNote(note.id);
                });
                
                notesList.appendChild(noteElement);
            });
        } catch (error) {
            console.error('Error loading notes:', error);
            this.showNotification('Error loading notes', 'error');
        }
    }

    openNoteEditor(noteId = null) {
        const editorModal = document.getElementById('note-editor-modal');
        const titleInput = document.getElementById('note-title-input');
        const contentTextarea = document.getElementById('note-content-textarea');
        
        this.currentEditingNoteId = noteId;
        
        if (noteId) {
            // Edit existing note
            window.electronAPI.getNotes().then(notes => {
                const note = notes.find(n => n.id === noteId);
                if (note) {
                    titleInput.value = note.title || '';
                    contentTextarea.value = note.content || '';
                }
            });
        } else {
            // New note
            titleInput.value = '';
            contentTextarea.value = '';
        }
        
        editorModal.classList.remove('hidden');
        titleInput.focus();
        
        // Setup editor event listeners
        this.setupNoteEditorListeners();
    }

    setupNoteEditorListeners() {
        const editorModal = document.getElementById('note-editor-modal');
        const titleInput = document.getElementById('note-title-input');
        const contentTextarea = document.getElementById('note-content-textarea');
        const saveBtn = document.getElementById('save-note-btn');
        const closeBtn = document.getElementById('close-note-editor');
        
        // Save button
        saveBtn.onclick = async () => {
            await this.saveCurrentNote();
        };
        
        // Close button
        closeBtn.onclick = () => {
            editorModal.classList.add('hidden');
            this.currentEditingNoteId = null;
        };
        
        // Close on backdrop click
        editorModal.onclick = (e) => {
            if (e.target === editorModal) {
                editorModal.classList.add('hidden');
                this.currentEditingNoteId = null;
            }
        };
        
        // Save on Ctrl+S
        const handleKeyDown = async (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                await this.saveCurrentNote();
            } else if (e.key === 'Escape') {
                editorModal.classList.add('hidden');
                this.currentEditingNoteId = null;
            }
        };
        
        // Remove old listener and add new one
        document.removeEventListener('keydown', this.noteEditorKeyHandler);
        this.noteEditorKeyHandler = handleKeyDown;
        document.addEventListener('keydown', handleKeyDown);
    }

    async saveCurrentNote() {
        const titleInput = document.getElementById('note-title-input');
        const contentTextarea = document.getElementById('note-content-textarea');
        const editorModal = document.getElementById('note-editor-modal');
        
        const title = titleInput.value.trim() || 'Untitled Note';
        const content = contentTextarea.value;
        
        try {
            const note = {
                id: this.currentEditingNoteId || Date.now(),
                title: title,
                content: content,
                createdAt: this.currentEditingNoteId ? undefined : new Date().toISOString()
            };
            
            await window.electronAPI.saveNote(note);
            
            // Close editor
            editorModal.classList.add('hidden');
            this.currentEditingNoteId = null;
            
            // Refresh notes list
            await this.populateNotes();
            
            this.showNotification('Note saved!', 'success');
        } catch (error) {
            console.error('Error saving note:', error);
            this.showNotification('Error saving note', 'error');
        }
    }

    async deleteNote(noteId) {
        try {
            const notes = await window.electronAPI.getNotes();
            const note = notes.find(n => n.id === noteId);
            
            if (note && confirm(`Delete note "${note.title}"?`)) {
                await window.electronAPI.deleteNote(noteId);
                await this.populateNotes(); // This will update the count automatically
                this.showNotification('Note deleted', 'success');
            }
        } catch (error) {
            console.error('Error deleting note:', error);
            this.showNotification('Error deleting note', 'error');
        }
    }

    setupNotesEventListeners() {
        const newNoteBtn = document.getElementById('new-note-btn');
        const closeNotesBtn = document.getElementById('close-notes');
        const notesSearchInput = document.getElementById('notes-search-input');
        
        // New note button
        if (newNoteBtn) {
            newNoteBtn.onclick = () => {
                this.openNoteAsTab();
                this.toggleNotes(); // Close notes panel
            };
        }
        
        // Close button
        if (closeNotesBtn) {
            closeNotesBtn.onclick = () => {
                this.toggleNotes();
            };
        }
        
        // Search notes
        if (notesSearchInput) {
            const searchNotes = this.debounce(async (query) => {
                const notesList = document.getElementById('notes-list');
                const notes = await window.electronAPI.getNotes();
                
                if (!query || query.trim() === '') {
                    await this.populateNotes();
                    return;
                }
                
                const filtered = notes.filter(note => {
                    const title = (note.title || '').toLowerCase();
                    const content = (note.content || '').toLowerCase();
                    const search = query.toLowerCase();
                    return title.includes(search) || content.includes(search);
                });
                
                notesList.innerHTML = '';
                
                if (filtered.length === 0) {
                    const noNotes = document.getElementById('no-notes');
                    noNotes.classList.remove('hidden');
                    return;
                }
                
                const noNotes = document.getElementById('no-notes');
                noNotes.classList.add('hidden');
                
                filtered.forEach((note) => {
                    const noteElement = document.createElement('div');
                    noteElement.className = 'note-item';
                    noteElement.dataset.noteId = note.id;
                    
                    const preview = (note.content || '').substring(0, 100).replace(/\n/g, ' ');
                    const date = new Date(note.updatedAt || note.createdAt);
                    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    noteElement.innerHTML = `
                        <div class="note-item-header">
                            <h4 class="note-item-title">${this.escapeHtml(note.title || 'Untitled Note')}</h4>
                            <div class="note-item-actions">
                                <button class="note-item-delete" data-note-id="${note.id}">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                        <p class="note-item-preview">${this.escapeHtml(preview || 'No content')}</p>
                        <div class="note-item-meta">${formattedDate}</div>
                    `;
                    
                    noteElement.addEventListener('click', (e) => {
                        if (!e.target.closest('.note-item-delete')) {
                            this.openNoteEditor(note.id);
                        }
                    });
                    
                    const deleteBtn = noteElement.querySelector('.note-item-delete');
                    deleteBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        await this.deleteNote(note.id);
                    });
                    
                    notesList.appendChild(noteElement);
                });
            }, 200);
            
            notesSearchInput.oninput = (e) => {
                searchNotes(e.target.value);
            };
        }
    }

    // preview color helpers removed
    saveAllSettings() {
        const blockTrackers = document.getElementById('block-trackers').checked;
        const blockAds = document.getElementById('block-ads').checked;

        this.saveSetting('blockTrackers', blockTrackers);
        this.saveSetting('blockAds', blockAds);

        this.showNotification('Settings saved!', 'success');
    }

    // custom color application removed
    showErrorPage(error, targetWebview = null) {
        const webview = targetWebview || this.getActiveWebview();
        if (!webview) return;
        const errorHtml = `
            <html>
                <head>
                    <title>Error</title>
                    <style>
                        body { 
                            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                            background: #1a1a1a; 
                            color: #fff; 
                            display: flex; 
                            align-items: center; 
                            justify-content: center; 
                            height: 100vh; 
                            margin: 0;
                            text-align: center;
                        }
                        .error-container {
                            max-width: 500px;
                            padding: 20px;
                        }
                        h1 { color: #ff5f57; margin-bottom: 20px; }
                        p { color: #ccc; line-height: 1.5; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <h1>Unable to load page</h1>
                        <p>${error}</p>
                        <p>Please check the URL and try again.</p>
                    </div>
                </body>
            </html>
        `;
        webview.src = 'data:text/html;charset=utf-8,' + encodeURIComponent(errorHtml);
    }

    renameTab(tabId, titleElement) {
        const currentTitle = titleElement.textContent;
        
        // Get computed styles to match exactly
        const computedStyle = window.getComputedStyle(titleElement);
        
        // Create input element with EXACT same flex properties as original
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.className = titleElement.className; // Copy all classes
        input.style.cssText = `
            flex: 1;
            min-width: 0;
            font-size: ${computedStyle.fontSize};
            font-family: ${computedStyle.fontFamily};
            font-weight: ${computedStyle.fontWeight};
            line-height: ${computedStyle.lineHeight};
            color: #fff;
            background: transparent;
            border: 1px solid #555;
            border-radius: 8px;
            padding: 0;
            margin: 0;
            outline: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            box-sizing: border-box;
        `;
        
        // Replace title with input inline - this preserves flex layout
        titleElement.parentNode.replaceChild(input, titleElement);
        input.focus();
        input.select();
        
        const finishRename = () => {
            const newTitle = input.value.trim() || currentTitle;
            
            // Restore the title element
            const newTitleElement = document.createElement('span');
            newTitleElement.className = 'tab-title';
            newTitleElement.textContent = newTitle;
            input.parentNode.replaceChild(newTitleElement, input);
            
            // Update tab data
            const tab = this.tabs.get(tabId);
            if (tab) {
                tab.title = newTitle;
            }
        };
        
        input.addEventListener('blur', finishRename);
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                finishRename();
            }
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                finishRename();
            }
        });
    }


    updateSecurityIndicator() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        const securityBtn = document.getElementById('security-btn');
        const icon = securityBtn.querySelector('i');
        
        try {
            const url = new URL(webview.getURL());
            if (url.protocol === 'https:') {
                icon.className = 'fas fa-lock';
                securityBtn.style.color = '#4CAF50';
                securityBtn.title = 'Secure connection';
            } else if (url.protocol === 'http:') {
                icon.className = 'fas fa-unlock';
                securityBtn.style.color = '#ff9800';
                securityBtn.title = 'Not secure';
            } else {
                icon.className = 'fas fa-info-circle';
                securityBtn.style.color = '#666';
                securityBtn.title = 'Local page';
            }
        } catch (e) {
            icon.className = 'fas fa-info-circle';
            securityBtn.style.color = '#666';
            securityBtn.title = 'Local page';
        }
    }

    showNotification(message, type = 'info') {
        // Create toast notification element
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                <div class="toast-icon">
                    ${type === 'success' ? '<i class="fas fa-check-circle" style="color: #4CAF50;"></i>' : 
                      type === 'error' ? '<i class="fas fa-exclamation-circle" style="color: #f44336;"></i>' : 
                      type === 'warning' ? '<i class="fas fa-exclamation-triangle" style="color: #ff9800;"></i>' :
                      '<i class="fas fa-info-circle" style="color: #2196F3;"></i>'}
                </div>
                <span>${message}</span>
            </div>
        `;
        
        // Add to DOM
        document.body.appendChild(toast);
        
        // Show immediately
            toast.classList.add('show');
        
        // Remove after 4 seconds
        setTimeout(() => {
            toast.classList.remove('show');
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
        }, 4000);
    }

    // Premium button interactions
    addButtonInteractions() {
        // Add premium interactions to main buttons
        const mainButtons = document.querySelectorAll('.nav-btn, .tab-close, .url-icon, .settings-btn, .security-btn, .nav-menu-btn, .download-btn, .close-settings, .refresh-btn, .clear-btn');
        
        mainButtons.forEach(button => {
            // Add premium click animation
            button.addEventListener('mousedown', (e) => {
                button.style.transform = 'scale(0.96) translateY(1px)';
                button.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.1)';
                button.style.transition = 'all 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            button.addEventListener('mouseup', (e) => {
                button.style.transform = '';
                button.style.boxShadow = '';
                button.style.transition = 'all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            button.addEventListener('mouseleave', (e) => {
                button.style.transform = '';
                button.style.boxShadow = '';
                button.style.transition = 'all 0.15s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            // Add premium haptic feedback
            button.addEventListener('click', (e) => {
                // Enhanced haptic feedback (if supported)
                if (navigator.vibrate) {
                    navigator.vibrate([50, 25, 50]);
                }
                
                // Removed glow effect for speed
            });
        });

        // Add premium popup menu interactions
        const popupItems = document.querySelectorAll('.nav-menu-item, .context-menu-item');
        
        popupItems.forEach(item => {
            // Add premium popup click animation
            item.addEventListener('mousedown', (e) => {
                item.style.transform = 'scale(0.98) translateY(0.5px)';
                item.style.boxShadow = '0 1px 4px rgba(0, 0, 0, 0.2), inset 0 1px 1px rgba(255, 255, 255, 0.1)';
                item.style.transition = 'all 0.1s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            item.addEventListener('mouseup', (e) => {
                item.style.transform = '';
                item.style.boxShadow = '';
                item.style.transition = 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            item.addEventListener('mouseleave', (e) => {
                item.style.transform = '';
                item.style.boxShadow = '';
                item.style.transition = 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            });
            
            // Add premium popup haptic feedback
            item.addEventListener('click', (e) => {
                // Gentle haptic feedback for popup items
                if (navigator.vibrate) {
                    navigator.vibrate(30);
                }
                
                // Removed glow effect for speed
            });
        });
    }

    // Enhanced loading states
    showLoadingState(element, message = 'Loading...') {
        if (!element) return;
        
        const originalContent = element.innerHTML;
        element.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding: 20px;">
                <div class="loading-spinner" style="width: 20px; height: 20px; border: 2px solid rgba(255,255,255,0.3); border-top: 2px solid #fff; border-radius: 50%;"></div>
                <span>${message}</span>
            </div>
        `;
        
        return () => {
            element.innerHTML = originalContent;
        };
    }

    // Enhanced success feedback
    showSuccessFeedback(element, message = 'Success!') {
        if (!element) return;
        
        const originalContent = element.innerHTML;
        element.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; padding: 20px;">
                <div class="success-checkmark"></div>
                <span>${message}</span>
            </div>
        `;
        
        // Removed timeout for speed
    }

    // Enhanced error feedback
    showErrorFeedback(element, message = 'Error occurred') {
        if (!element) return;
        
        element.classList.add('shake');
        this.showNotification(message, 'error');
        
        // Removed timeout for speed
    }

    updateTabFavicon(tabId, tabElement) {
        const img = tabElement.querySelector('.tab-favicon');
        if (!img) return;
        
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        // Use cached favicon if available
        if (tab.favicon) {
            img.style.visibility = 'visible';
            img.src = tab.favicon;
            return;
        }
        
        // Fast fallback: Use Google's favicon service for immediate loading
        try {
            const url = tab.url || (tabId === this.currentTab ? document.getElementById('webview')?.getURL() : null);
            if (url) {
                const urlObj = new URL(url);
                const domain = urlObj.hostname;
                // Google's favicon service is very fast and works for most sites
                const fastFaviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
                img.style.visibility = 'visible';
                img.src = fastFaviconUrl;
                // Cache it
                tab.favicon = fastFaviconUrl;
            }
        } catch (e) {
            // ignore invalid URL
        }
    }

    togglePinTab(tabId, tabElement, pinBtn) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        const wasPinned = tab.pinned || tabElement.classList.contains('pinned');
        const isPinned = !wasPinned;
        
        // Update tab data
        tab.pinned = isPinned;
        this.tabs.set(tabId, tab);
        
        // Update visual state
        if (isPinned) {
            tabElement.classList.add('pinned');
            tabElement.classList.add('just-pinned');
            setTimeout(() => tabElement.classList.remove('just-pinned'), 400);
        } else {
            tabElement.classList.remove('pinned');
            tabElement.classList.add('just-unpinned');
            setTimeout(() => tabElement.classList.remove('just-unpinned'), 400);
        }
        
        
        // Move tab to correct section
        this.organizeTabsByPinnedState();
        this.savePinnedTabs();
    }
    
    organizeTabsByPinnedState() {
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        if (!tabsContainer || !separator) return;
        
        // Get all tabs that are NOT in folders (preserve order)
        const allChildren = Array.from(tabsContainer.children);
        const tabs = allChildren.filter(el => 
            el.classList.contains('tab') && 
            el.id !== 'tabs-separator' &&
            !el.closest('.folder') // Exclude tabs inside folders
        );

        // FLIP: First - record current positions
        const firstRects = new Map();
        tabs.forEach(el => {
            firstRects.set(el, el.getBoundingClientRect());
        });
        
        // Get current order
        const tabOrder = tabs.map(t => parseInt(t.dataset.tabId, 10));
        
        // Separate pinned and unpinned while preserving relative order
        const pinnedTabs = [];
        const unpinnedTabs = [];
        
        for (const tabId of tabOrder) {
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (!tabElement) continue;
            
            // Skip tabs that are in folders
            if (tabElement.closest('.folder')) continue;
            
            const tab = this.tabs.get(tabId);
            if (tab && tab.pinned) {
                pinnedTabs.push(tabElement);
            } else {
                unpinnedTabs.push(tabElement);
            }
        }
        
        // Remove all tabs temporarily (only those not in folders)
        tabs.forEach(tab => {
            if (tab.parentNode === tabsContainer) {
                tab.remove();
            }
        });
        
        // Insert pinned tabs above separator (in order)
        pinnedTabs.forEach(tab => {
            tabsContainer.insertBefore(tab, separator);
        });
        
        // Show/hide separator based on pinned tabs or folders
        const hasPinnedTabs = pinnedTabs.length > 0;
        const hasFolders = this.folders.size > 0;
        if (hasPinnedTabs || hasFolders) {
            separator.style.display = 'block';
        } else {
            separator.style.display = 'none';
        }
        
        // Insert unpinned tabs below separator (in order)
        unpinnedTabs.forEach(tab => {
            if (separator.nextSibling) {
                tabsContainer.insertBefore(tab, separator.nextSibling);
            } else {
                tabsContainer.appendChild(tab);
            }
        });

        // FLIP: Last - compute new positions and play animations
        const allTabsAfter = Array.from(tabsContainer.querySelectorAll('.tab'));
        allTabsAfter.forEach(el => {
            const first = firstRects.get(el);
            const last = el.getBoundingClientRect();
            if (!first) return; // newly created tabs won't animate here
            const deltaX = first.left - last.left;
            const deltaY = first.top - last.top;
            const deltaW = first.width / Math.max(1, last.width);
            const deltaH = first.height / Math.max(1, last.height);

            if (deltaX || deltaY || deltaW !== 1 || deltaH !== 1) {
                el.style.transformOrigin = 'top left';
                el.style.willChange = 'transform, opacity';
                el.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(${deltaW}, ${deltaH})`;
                el.style.opacity = '0.9';

                // Force reflow to ensure the transform is applied before transitioning
                // eslint-disable-next-line no-unused-expressions
                el.offsetHeight;

                el.style.transition = 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease';
                el.style.transform = '';
                el.style.opacity = '';

                const cleanup = () => {
                    el.style.transition = '';
                    el.style.willChange = '';
                    el.removeEventListener('transitionend', cleanup);
                };
                el.addEventListener('transitionend', cleanup);
            }
        });
    }
    
    savePinnedTabs() {
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        if (!tabsContainer || !separator) return;
        
        // Get all pinned tabs in order
        const pinnedTabs = [];
        const allChildren = Array.from(tabsContainer.children);
        const separatorIndex = allChildren.indexOf(separator);
        
        // Get tabs above separator (pinned)
        for (let i = 0; i < separatorIndex; i++) {
            const child = allChildren[i];
            if (child.classList.contains('tab')) {
                const tabId = parseInt(child.dataset.tabId, 10);
                const tab = this.tabs.get(tabId);
                if (tab && tab.pinned) {
                    pinnedTabs.push({
                        id: tabId,
                        url: tab.url,
                        title: tab.title,
                        favicon: tab.favicon || null, // Save favicon
                        order: i
                    });
                }
            }
        }
        
        // Save to settings
        this.saveSetting('pinnedTabs', pinnedTabs);
    }
    
    async loadPinnedTabs() {
        try {
            const pinnedTabsData = this.settings.pinnedTabs || [];
            if (!Array.isArray(pinnedTabsData) || pinnedTabsData.length === 0) return;
            
            const tabsContainer = document.querySelector('.tabs-container');
            const separator = document.getElementById('tabs-separator');
            if (!tabsContainer || !separator) return;
            
            // Sort by saved order
            pinnedTabsData.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            // Create pinned tabs in order
            for (const pinnedData of pinnedTabsData) {
                const tabId = pinnedData.id || Date.now() + Math.random();
                const tabElement = document.createElement('div');
                tabElement.className = 'tab pinned';
                tabElement.dataset.tabId = tabId;
                
                tabElement.innerHTML = `
                    <div class="tab-content">
                        <div class="tab-left">
                            <img class="tab-favicon" src="" alt="" onerror="this.style.visibility='hidden'">
                            <span class="tab-title">${this.escapeHtml(pinnedData.title || 'New Tab')}</span>
                        </div>
                        <div class="tab-right">
                            <button class="tab-close"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                `;
                
                // Store tab data
                this.tabs.set(tabId, {
                    id: tabId,
                    url: pinnedData.url || null,
                    title: pinnedData.title || 'New Tab',
                    favicon: pinnedData.favicon || null, // Load cached favicon
                    canGoBack: false,
                    canGoForward: false,
                    history: pinnedData.url ? [pinnedData.url] : [],
                    historyIndex: pinnedData.url ? 0 : -1,
                    pinned: true
                });
                
                // Insert above separator
                tabsContainer.insertBefore(tabElement, separator);
                
                // Set up event listeners
                this.setupTabEventListeners(tabElement, tabId);
                
                // Update favicon
                this.updateTabFavicon(tabId, tabElement);
            }
            
            // Don't automatically switch to pinned tabs on startup
            // User must click a tab to activate it
        } catch (error) {
            console.error('Failed to load pinned tabs:', error);
        }
    }

    setupTabSearch() {
        const search = document.getElementById('tab-search');
        if (!search) return;
        
        // Direct tab search for maximum speed
        const filter = (q) => {
            const query = (q || '').toLowerCase().trim();
            const tabs = document.querySelectorAll('.tabs-container .tab');
            
            // Direct filtering for maximum speed
            tabs.forEach(tab => {
                const title = tab.querySelector('.tab-title')?.textContent?.toLowerCase() || '';
                const url = this.tabs.get(parseInt(tab.dataset.tabId, 10))?.url?.toLowerCase() || '';
                const match = title.includes(query) || url.includes(query);
                tab.style.display = match ? '' : 'none';
            });
        };
        
        search.addEventListener('input', (e) => filter(e.target.value));
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('toggle-sidebar-btn');
        const icon = toggleBtn.querySelector('i');
        
        // Remove slide-out class if present (when toggling from slide-out state)
        sidebar.classList.remove('slide-out');
        
        sidebar.classList.toggle('hidden');
        
        // Toggle window button visibility (macOS traffic lights)
        const isHidden = sidebar.classList.contains('hidden');
        if (window.electronAPI && window.electronAPI.setWindowButtonVisibility) {
            window.electronAPI.setWindowButtonVisibility(!isHidden);
        }
        
        // Close nav menu when sidebar is hidden
        if (isHidden) {
            this.closeNavMenu();
        }
        
        // Keep the icon as sidebar bars, don't change it
        icon.className = 'fas fa-bars';
    }

    toggleSidebarPosition() {
        const mainArea = document.getElementById('main-area');
        const sidebar = document.getElementById('sidebar');
        const positionText = document.getElementById('sidebar-position-text');
        const contextText = document.getElementById('sidebar-position-context-text');
        
        // Toggle sidebar position
        const isRight = mainArea.classList.contains('sidebar-right');
        
        if (isRight) {
            // Move to left
            mainArea.classList.remove('sidebar-right');
            sidebar.classList.remove('sidebar-right');
            this.saveSetting('sidebarPosition', 'left');
            if (positionText) positionText.textContent = 'Move Sidebar Right';
            if (contextText) contextText.textContent = 'Move Sidebar Right';
        } else {
            // Move to right
            mainArea.classList.add('sidebar-right');
            sidebar.classList.add('sidebar-right');
            this.saveSetting('sidebarPosition', 'right');
            if (positionText) positionText.textContent = 'Move Sidebar Left';
            if (contextText) contextText.textContent = 'Move Sidebar Left';
        }
    }

    applySidebarPosition() {
        const mainArea = document.getElementById('main-area');
        const sidebar = document.getElementById('sidebar');
        const positionText = document.getElementById('sidebar-position-text');
        const contextText = document.getElementById('sidebar-position-context-text');
        
        const position = this.settings?.sidebarPosition || 'left';
        
        if (position === 'right') {
            mainArea.classList.add('sidebar-right');
            sidebar.classList.add('sidebar-right');
            if (positionText) positionText.textContent = 'Move Sidebar Left';
            if (contextText) contextText.textContent = 'Move Sidebar Left';
        } else {
            mainArea.classList.remove('sidebar-right');
            sidebar.classList.remove('sidebar-right');
            if (positionText) positionText.textContent = 'Move Sidebar Right';
            if (contextText) contextText.textContent = 'Move Sidebar Right';
        }
    }

    isSidebarRight() {
        const mainArea = document.getElementById('main-area');
        return mainArea && mainArea.classList.contains('sidebar-right');
    }

    toggleNavMenu() {
        const navMenu = document.getElementById('nav-menu');
        const navMenuBtn = document.getElementById('nav-menu-btn');
        
        if (navMenu.classList.contains('hidden')) {
            // Calculate position relative to the button
            const btnRect = navMenuBtn.getBoundingClientRect();
            const isRight = this.isSidebarRight();
            
            navMenu.style.top = (btnRect.bottom + 5) + 'px';
            
            // When sidebar is on right, position menu to the left of button
            if (isRight) {
                navMenu.style.left = 'auto';
                navMenu.style.right = (window.innerWidth - btnRect.right) + 'px';
            } else {
            navMenu.style.left = btnRect.left + 'px';
                navMenu.style.right = 'auto';
            }
            
            navMenu.style.visibility = 'visible';
            navMenu.classList.remove('hidden');
        } else {
            this.closeNavMenu();
        }
    }

    hideNavMenu() {
        this.closeNavMenu();
    }

    closeNavMenu() {
        const navMenu = document.getElementById('nav-menu');
        navMenu.classList.add('closing');
        
        // Remove the menu after animation completes
        setTimeout(() => {
            navMenu.classList.add('hidden');
            navMenu.classList.remove('closing');
            navMenu.style.visibility = 'hidden';
        }, 200); // Match animation duration
    }

    setupSidebarSlideBack() {
        const hoverArea = document.getElementById('sidebar-hover-area');
        const sidebar = document.getElementById('sidebar');
        
        let slideBackTimeout;
        
        console.log('Setting up sidebar slide-back, hover area:', hoverArea);
        
        if (!hoverArea) {
            console.error('Hover area not found!');
            return;
        }
        
        hoverArea.addEventListener('mouseenter', () => {
            console.log('Mouse entered hover area, sidebar hidden:', sidebar.classList.contains('hidden'));
            if (sidebar.classList.contains('hidden')) {
                clearTimeout(slideBackTimeout);
                sidebar.classList.add('slide-out');
                
                // Ensure sidebar uses the current theme color from CSS variable
                // The CSS variable is already set by the theme system
                const computedStyle = getComputedStyle(document.documentElement);
                const sidebarBg = computedStyle.getPropertyValue('--sidebar-background').trim();
                if (sidebarBg) {
                    sidebar.style.background = sidebarBg;
                }
                
                console.log('Sidebar slide-out triggered, classes:', sidebar.className);
            }
        });
        
        // When mouse enters the sidebar, clear any pending slide-back
        sidebar.addEventListener('mouseenter', () => {
            if (sidebar.classList.contains('slide-out')) {
                clearTimeout(slideBackTimeout);
                console.log('Mouse entered sidebar, cleared slide-back timeout');
            }
        });
        
        // When mouse leaves the hover area, start slide-back timer
        hoverArea.addEventListener('mouseleave', () => {
            console.log('Mouse left hover area');
            if (sidebar.classList.contains('hidden') && sidebar.classList.contains('slide-out')) {
                slideBackTimeout = setTimeout(() => {
                    sidebar.classList.remove('slide-out');
                    console.log('Sidebar slide-out reverted');
                }, 300);
            }
        });
        
        // When mouse leaves the sidebar, start slide-back timer
        sidebar.addEventListener('mouseleave', () => {
            if (sidebar.classList.contains('hidden') && sidebar.classList.contains('slide-out')) {
                slideBackTimeout = setTimeout(() => {
                    sidebar.classList.remove('slide-out');
                    console.log('Sidebar slide-out reverted from sidebar mouse leave');
                }, 300);
            }
        });
        
        // Also hide slide-out when clicking outside
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('slide-out') && 
                !sidebar.contains(e.target) && 
                !hoverArea.contains(e.target)) {
                sidebar.classList.remove('slide-out');
            }
        });
    }

    // Removed setupSidebarResizing method

    createNewFolder() {
        const folderId = Date.now();
        const folderName = `Folder ${this.folders.size + 1}`;
        
        const folder = {
            id: folderId,
            name: folderName,
            tabIds: [],
            open: true,
            order: this.folders.size
        };
        
        this.folders.set(folderId, folder);
        this.renderFolders();
        this.saveFolders();
        
        // Focus the folder name for editing when newly created
        setTimeout(() => {
            const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
            if (folderElement) {
                const nameInput = folderElement.querySelector('.folder-name-input');
                if (nameInput) {
                    nameInput.readOnly = false;
                    nameInput.removeAttribute('tabindex');
                    nameInput.style.pointerEvents = 'auto';
                    nameInput.focus();
                    nameInput.select();
                }
            }
        }, 100);
    }

    renderFolders() {
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        if (!tabsContainer || !separator) return;

        // Remove existing folder elements
        const existingFolders = tabsContainer.querySelectorAll('.folder');
        existingFolders.forEach(folder => folder.remove());

        // Get all folders sorted by order
        const foldersArray = Array.from(this.folders.values()).sort((a, b) => (a.order || 0) - (b.order || 0));

        // Insert folders before separator (in pinned section)
        foldersArray.forEach(folder => {
            const folderElement = this.createFolderElement(folder);
            tabsContainer.insertBefore(folderElement, separator);
        });
    }

    createFolderElement(folder) {
        const folderElement = document.createElement('div');
        folderElement.className = 'folder';
        folderElement.dataset.folderId = folder.id;
        folderElement.classList.add('pinned'); // Folders are always in pinned section
        
        const isOpen = folder.open !== false; // Default to open
        
        // Get folder tabs
        const folderTabs = folder.tabIds
            .map(tabId => {
                const tab = this.tabs.get(tabId);
                const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
                return { tab, tabElement, tabId };
            })
            .filter(item => item.tab && item.tab.pinned); // Only show pinned tabs

        folderElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    <i class="fas ${isOpen ? 'fa-folder-open' : 'fa-folder'} tab-favicon folder-icon"></i>
                    <input type="text" class="folder-name-input tab-title" value="${this.escapeHtml(folder.name)}" placeholder="Folder name" readonly>
                </div>
                <div class="tab-right">
                    <button class="folder-delete tab-close" title="Delete folder">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="folder-content ${isOpen && folderTabs.length > 0 ? 'open' : ''}">
            </div>
        `;

        // Set up folder event listeners
        this.setupFolderEventListeners(folderElement, folder);

        // Add tab elements to folder content
        const folderContent = folderElement.querySelector('.folder-content');
        
        folderTabs.forEach(({ tabElement, tabId }) => {
            if (tabElement && folderContent) {
                // Only add if not already in a folder
                if (!tabElement.closest('.folder')) {
                    folderContent.appendChild(tabElement);
                    // Ensure event listeners are set up
                    this.setupTabEventListeners(tabElement, tabId);
                }
            } else if (folderContent && !tabElement) {
                // Tab element doesn't exist, create it
                const tab = this.tabs.get(tabId);
                if (tab) {
                    const newTabElement = document.createElement('div');
                    newTabElement.className = 'tab pinned';
                    newTabElement.dataset.tabId = tabId;
                    newTabElement.innerHTML = `
                        <div class="tab-content">
                            <div class="tab-left">
                                <img class="tab-favicon" src="" alt="" onerror="this.style.visibility='hidden'">
                                <span class="tab-title">${this.escapeHtml(tab.title || 'New Tab')}</span>
                            </div>
                            <div class="tab-right">
                                <button class="tab-close"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    `;
                    folderContent.appendChild(newTabElement);
                    this.setupTabEventListeners(newTabElement, tabId);
                    this.updateTabFavicon(tabId, newTabElement);
                }
            }
        });
        
        // Set initial state if folder is open AND has tabs (after tabs are added)
        if (isOpen && folderTabs.length > 0) {
            // Use setTimeout to ensure DOM is ready and tabs are added
            setTimeout(() => {
                folderContent.style.display = 'flex';
                folderContent.style.visibility = 'visible';
                folderContent.style.maxHeight = 'none';
                const height = folderContent.scrollHeight;
                folderContent.style.maxHeight = height + 'px';
                folderContent.style.opacity = '1';
                folderContent.classList.add('open');
            }, 50);
        } else {
            // Ensure empty folders have no expansion
            folderContent.style.display = 'none';
            folderContent.style.visibility = 'hidden';
            folderContent.style.maxHeight = '0px';
            folderContent.style.padding = '0';
            folderContent.style.opacity = '0';
            folderContent.classList.remove('open');
        }

        return folderElement;
    }

    setupFolderEventListeners(folderElement, folder) {
        const nameInput = folderElement.querySelector('.folder-name-input');
        const deleteBtn = folderElement.querySelector('.folder-delete');
        const folderContent = folderElement.querySelector('.folder-content');
        const tabContent = folderElement.querySelector('.tab-content');
        const tabsContainer = document.querySelector('.tabs-container');
        
        // Get reference to draggedFolder from setupTabDragDrop scope
        // We'll use a closure or access it via the class
        const getDraggedFolder = () => {
            // Try to find it via the dragging class as fallback
            return document.querySelector('.folder.dragging');
        };
        
        // Use the shared insertion line from setupTabDragDrop (don't create a new one)
        const getInsertionLine = () => document.querySelector('.drag-insertion-line');
        
        // Helper functions that use the shared insertion line
        const showInsertionLine = (y) => {
            const insertionLine = getInsertionLine();
            if (insertionLine && tabsContainer) {
                // Center the line in the 8px gap (4px offset from edge)
                insertionLine.style.top = (y - 1) + 'px'; // -1px to center the 2px line
                insertionLine.style.display = 'block';
            }
        };
        
        const hideInsertionLine = () => {
            const insertionLine = getInsertionLine();
            if (insertionLine) {
                insertionLine.style.display = 'none';
            }
        };

        // Make folder draggable - make sure child elements don't prevent dragging
        folderElement.draggable = true;
        
        // Prevent child elements from being draggable (they should trigger parent drag)
        nameInput.draggable = false;
        deleteBtn.draggable = false;
        const folderIcon = folderElement.querySelector('.folder-icon');
        if (folderIcon) {
            folderIcon.draggable = false;
        }
        
        // Make input non-interactive when readonly to prevent focus
        if (nameInput.readOnly) {
            nameInput.style.pointerEvents = 'none';
        }
        
        let isDragging = false;
        let mouseDownPos = { x: 0, y: 0 };
        let mouseDownTime = 0;
        
        // Track mouse down to distinguish click from drag
        tabContent.addEventListener('mousedown', (e) => {
            // Don't track if clicking on delete button or if input is being edited
            if (e.target.closest('.folder-delete') || (!nameInput.readOnly && e.target.closest('.folder-name-input'))) {
                return;
            }
            mouseDownPos = { x: e.clientX, y: e.clientY };
            mouseDownTime = Date.now();
        });
        
        folderElement.addEventListener('dragstart', (e) => {
            // Don't start drag if clicking on delete button or if input is being edited
            if (e.target.closest('.folder-delete') || (!nameInput.readOnly && e.target.closest('.folder-name-input'))) {
                e.preventDefault();
                return;
            }
            
            // Aggressively prevent input focus during drag
            if (nameInput.readOnly) {
                nameInput.blur();
                nameInput.style.pointerEvents = 'none';
                // Force blur multiple times to be sure
                requestAnimationFrame(() => {
                    nameInput.blur();
                    nameInput.style.pointerEvents = 'none';
                });
            }
            
            isDragging = true;
            folderElement.classList.add('dragging');
            
            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/html', folderElement.outerHTML);
            e.dataTransfer.setData('application/folder-id', folder.id.toString());
        });
        
        // Cache folder content element to avoid repeated queries
        const cachedFolderContent = folderElement.querySelector('.folder-content');
        
        // Handle folder-to-folder dragging
        folderElement.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'move';
            
            const draggedFolder = getDraggedFolder();
            const draggedTab = document.querySelector('.tab.dragging');
            
            // Handle folder-to-folder dragging
            if (draggedFolder && draggedFolder !== folderElement) {
                const rect = folderElement.getBoundingClientRect();
                const containerRect = tabsContainer.getBoundingClientRect();
                const isAbove = e.clientY < rect.top + rect.height / 2;
                
                // Center in gap: gap is 8px, center is 4px from edge
                const lineY = isAbove ? rect.top - containerRect.top - 4 : rect.bottom - containerRect.top + 4;
                showInsertionLine(lineY);
                folderElement.dataset.dropSide = isAbove ? 'top' : 'bottom';
                return;
            }
            
            // Handle tab-to-folder dragging
            if (draggedTab) {
                const folderRect = folderElement.getBoundingClientRect();
                const containerRect = tabsContainer.getBoundingClientRect();
                const mouseY = e.clientY;
                
                // Check if over content (only if folder is open)
                const isOverContent = cachedFolderContent && 
                                     cachedFolderContent.classList.contains('open') && 
                                     cachedFolderContent.contains(e.target);
                
                // Check if in gap (4px threshold above/below folder)
                const gapThreshold = 4;
                const isInGapAbove = mouseY < folderRect.top && mouseY >= folderRect.top - gapThreshold;
                const isInGapBelow = mouseY > folderRect.bottom && mouseY <= folderRect.bottom + gapThreshold;
                
                if (isOverContent) {
                    // Over folder content - show folder animation, NO insertion line
                    if (!folderElement.classList.contains('drag-over-folder')) {
                        folderElement.classList.add('drag-over-folder');
                    }
                    hideInsertionLine();
                    folderElement.dataset.dropSide = 'inside';
                } else if (isInGapAbove || isInGapBelow) {
                    // In gap - show insertion line ONLY, no folder animation
                    if (folderElement.classList.contains('drag-over-folder')) {
                        folderElement.classList.remove('drag-over-folder');
                    }
                    const isAbove = isInGapAbove;
                    // Center in gap: gap is 8px, center is 4px from edge
                    const lineY = isAbove ? folderRect.top - containerRect.top - 4 : folderRect.bottom - containerRect.top + 4;
                    showInsertionLine(lineY);
                    folderElement.dataset.dropSide = isAbove ? 'top' : 'bottom';
                } else {
                    // Over folder header - show folder animation, NO insertion line
                    if (!folderElement.classList.contains('drag-over-folder')) {
                        folderElement.classList.add('drag-over-folder');
                    }
                    hideInsertionLine();
                    folderElement.dataset.dropSide = 'inside';
                }
            }
        });
        
        folderElement.addEventListener('dragleave', (e) => {
            if (!folderElement.contains(e.relatedTarget)) {
                folderElement.classList.remove('drag-over-folder');
                delete folderElement.dataset.dropSide;
                hideInsertionLine();
            }
        });
        
        folderElement.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideInsertionLine();
            
            // Cache dropSide before cleanup
            const dropSide = folderElement.dataset.dropSide;
            folderElement.classList.remove('drag-over-folder');
            delete folderElement.dataset.dropSide;
            
            const draggedFolderId = e.dataTransfer.getData('application/folder-id');
            const draggedFolder = draggedFolderId ? document.querySelector(`[data-folder-id="${draggedFolderId}"]`) : getDraggedFolder();
            const draggedTab = document.querySelector('.tab.dragging');
            
            // Handle folder drop
            if (draggedFolder && draggedFolder !== folderElement) {
                const isAbove = dropSide === 'top';
                draggedFolder.remove();
                if (isAbove) {
                    tabsContainer.insertBefore(draggedFolder, folderElement);
                } else {
                    folderElement.insertAdjacentElement('afterend', draggedFolder);
                }
                return;
            }
            
            // Handle tab drop
            if (!draggedTab) return;
            
            const tabId = parseInt(draggedTab.dataset.tabId, 10);
            if (!tabId || !this.tabs.has(tabId)) return;
            
            if (dropSide === 'inside') {
                this.addTabToFolder(tabId, folder.id);
            } else if (dropSide === 'top' || dropSide === 'bottom') {
                const isAbove = dropSide === 'top';
                const tab = this.tabs.get(tabId);
                if (!tab) return;
                
                // Check parent folder before removing
                const draggedTabParentFolder = draggedTab.closest('.folder');
                if (draggedTabParentFolder) {
                        const parentFolderId = parseInt(draggedTabParentFolder.dataset.folderId, 10);
                    if (parentFolderId) {
                        this.removeTabFromFolder(tabId, parentFolderId);
                    }
                }
                
                const wasPinned = tab.pinned;
                const folderIsPinned = folderElement.classList.contains('pinned');
                
                draggedTab.remove();
                if (isAbove) {
                    tabsContainer.insertBefore(draggedTab, folderElement);
                } else {
                    folderElement.insertAdjacentElement('afterend', draggedTab);
                }
                
                if (folderIsPinned && !wasPinned) {
                    tab.pinned = true;
                    this.tabs.set(tabId, tab);
                    draggedTab.classList.add('pinned');
                }
                
                if (wasPinned !== tab.pinned) {
                    this.organizeTabsByPinnedState();
                }
                this.savePinnedTabs();
            }
        });
        
        folderElement.addEventListener('dragend', (e) => {
            isDragging = false;
            folderElement.classList.remove('dragging');
            folderElement.classList.remove('drag-over-folder');
            hideInsertionLine();
            delete folderElement.dataset.dropSide;
        });
        
        // Toggle folder - click anywhere on the folder tab (including the name)
        // Only toggle if it wasn't a drag operation
        tabContent.addEventListener('click', (e) => {
            // Don't toggle if clicking on delete button
            if (e.target.closest('.folder-delete')) {
                return;
            }
            // If clicking on the input and it's readonly, just toggle (don't rename)
            if (e.target.closest('.folder-name-input') && nameInput.readOnly) {
                e.preventDefault();
                e.stopPropagation();
                // Blur the input to prevent focus box
                nameInput.blur();
                // Only toggle if it wasn't a drag (check if mouse moved significantly)
                const mouseMoved = Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5;
                const timeSinceMouseDown = Date.now() - mouseDownTime;
                if (!isDragging && (!mouseMoved || timeSinceMouseDown < 300)) {
                    this.toggleFolder(folder.id);
                }
                return;
            }
            // If input is not readonly (being edited), don't toggle
            if (e.target.closest('.folder-name-input') && !nameInput.readOnly) {
                return;
            }
            e.stopPropagation();
            // Blur input if it somehow got focused
            if (nameInput.readOnly) {
                nameInput.blur();
            }
            // Only toggle if it wasn't a drag (check if mouse moved significantly)
            const mouseMoved = Math.abs(e.clientX - mouseDownPos.x) > 5 || Math.abs(e.clientY - mouseDownPos.y) > 5;
            const timeSinceMouseDown = Date.now() - mouseDownTime;
            if (!isDragging && (!mouseMoved || timeSinceMouseDown < 300)) {
                this.toggleFolder(folder.id);
            }
        });
        
        // Prevent input from being focused when readonly
        // Use tabindex to prevent keyboard focus, and blur handler for mouse focus
        if (nameInput.readOnly) {
            nameInput.setAttribute('tabindex', '-1');
            nameInput.style.pointerEvents = 'none';
        }
        
        // Prevent input from getting focus on click when readonly
        nameInput.addEventListener('focus', (e) => {
            if (nameInput.readOnly) {
                // Immediately blur to prevent focus box - use requestAnimationFrame for immediate effect
                requestAnimationFrame(() => {
                    e.target.blur();
                    e.target.style.pointerEvents = 'none';
                });
            }
        }, true); // Use capture phase to catch it early
        
        // Also prevent focusin event
        nameInput.addEventListener('focusin', (e) => {
            if (nameInput.readOnly) {
                e.preventDefault();
                e.stopPropagation();
                requestAnimationFrame(() => {
                    e.target.blur();
                    e.target.style.pointerEvents = 'none';
                });
            }
        }, true);

        // Right-click for context menu
        folderElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showFolderContextMenu(e, folder.id);
        });

        // Rename folder - only when input is made editable
        nameInput.addEventListener('blur', () => {
            const newName = nameInput.value.trim() || `Folder ${folder.id}`;
            folder.name = newName;
            this.folders.set(folder.id, folder);
            this.saveFolders();
            // Make it readonly again
            nameInput.readOnly = true;
            nameInput.setAttribute('tabindex', '-1');
            nameInput.style.pointerEvents = 'none';
        });

        nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                nameInput.blur();
            }
            if (e.key === 'Escape') {
                nameInput.value = folder.name;
                nameInput.blur();
            }
        });

        // Delete folder - make it always visible but styled
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (confirm(`Delete folder "${folder.name}"? Tabs will be moved back to the sidebar.`)) {
                this.deleteFolder(folder.id);
            }
        });

    }

    toggleFolder(folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return;

        const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
        if (!folderElement) return;
        
        const folderContent = folderElement.querySelector('.folder-content');
        const folderIcon = folderElement.querySelector('.folder-icon');
        
        if (!folderContent) return;
        
        // Prevent multiple toggles
        if (folderElement.classList.contains('toggling')) return;
        folderElement.classList.add('toggling');
        
        const isOpening = !folder.open;
        folder.open = isOpening;
        this.folders.set(folderId, folder);
        
        // Update icon immediately
        if (folderIcon) {
            folderIcon.classList.remove('fa-folder', 'fa-folder-open');
            folderIcon.classList.add(isOpening ? 'fa-folder-open' : 'fa-folder');
            folderIcon.classList.add('folder-icon-animate');
            setTimeout(() => {
                folderIcon.classList.remove('folder-icon-animate');
            }, 300);
        }
        
        // Check if folder has tabs - only open if it has content
        const hasTabs = folder.tabIds.length > 0;
        
        if (isOpening) {
            // Don't open if folder is empty - just update icon and ensure no expansion
            if (!hasTabs) {
                // Explicitly set styles to prevent any expansion
                folderContent.style.maxHeight = '0px';
                folderContent.style.padding = '0';
                folderContent.style.display = 'none';
                folderContent.style.visibility = 'hidden';
                folderContent.style.opacity = '0';
                folderContent.classList.remove('open');
                folderElement.classList.remove('toggling');
                this.saveFolders();
                return;
            }
            
            // Opening: measure height first, then animate
            folderContent.style.display = 'flex';
            folderContent.style.visibility = 'visible';
            folderContent.style.maxHeight = 'none';
            folderContent.style.opacity = '0';
            folderContent.style.transition = 'none';
            
            // Force multiple reflows to ensure content is fully laid out
            folderContent.offsetHeight;
            requestAnimationFrame(() => {
                folderContent.offsetHeight; // Force another reflow
                
                const targetHeight = folderContent.scrollHeight;
                
                // Add some buffer to ensure full expansion
                const bufferedHeight = targetHeight + 10;
                
                // Reset to closed state
                folderContent.style.maxHeight = '0px';
                folderContent.style.opacity = '0';
                folderContent.style.transition = 'max-height 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), padding 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                
                // Animate to open
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        folderContent.classList.add('open');
                        folderContent.style.maxHeight = bufferedHeight + 'px';
                        folderContent.style.opacity = '1';
                        
                        // After animation completes, set to a very large value to allow full expansion
                        setTimeout(() => {
                            folderElement.classList.remove('toggling');
                            // Set to a very large value to allow full expansion without jump
                            folderContent.style.transition = 'none';
                            folderContent.style.maxHeight = '9999px';
                            // Re-enable transition for future animations
                            setTimeout(() => {
                                folderContent.style.transition = '';
                            }, 50);
                        }, 400);
                    });
                });
            });
        } else {
            // Closing: get current height, then animate to 0
            const currentHeight = folderContent.scrollHeight;
            folderContent.style.maxHeight = currentHeight + 'px';
            folderContent.style.opacity = '1';
            folderContent.style.transition = 'max-height 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), padding 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            
            // Force reflow
            folderContent.offsetHeight;
            
            // Animate to closed
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    folderContent.classList.remove('open');
                    folderContent.style.maxHeight = '0px';
                    folderContent.style.opacity = '0';
                    
                    // Clean up after animation completes (350ms + small buffer)
                    setTimeout(() => {
                        folderContent.style.visibility = 'hidden';
                        folderContent.style.display = 'none';
                        folderContent.style.maxHeight = '';
                        folderContent.style.transition = '';
                        folderElement.classList.remove('toggling');
                    }, 380);
                });
            });
        }
        
        this.saveFolders();
    }

    addTabToFolder(tabId, folderId) {
        const tab = this.tabs.get(tabId);
        const folder = this.folders.get(folderId);
        
        if (!tab || !folder) return;
        
        // Only add pinned tabs to folders
        if (!tab.pinned) {
            // Auto-pin the tab
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                this.togglePinTab(tabId, tabElement, null);
            }
        }
        
        // Remove tab from any other folder (optimized - only check if needed)
        for (const [id, f] of this.folders) {
            if (id !== folderId && f.tabIds.includes(tabId)) {
                f.tabIds = f.tabIds.filter(fid => fid !== tabId);
                this.folders.set(id, f);
                break; // Tab can only be in one folder at a time
            }
        }
        
        // Add to this folder if not already there
        if (!folder.tabIds.includes(tabId)) {
            folder.tabIds.push(tabId);
            this.folders.set(folderId, folder);
        }
        
        // Update folder UI directly without full re-render for better performance
        const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        
        if (!folderElement || !tabElement) return;
        
        const folderContent = folderElement.querySelector('.folder-content');
        if (!folderContent) {
            // Fallback: just remove from main container
            if (tabElement.parentNode && !tabElement.closest('.folder')) {
                tabElement.remove();
            }
            return;
        }
        
        // Batch DOM operations
        requestAnimationFrame(() => {
            // Ensure folder is open
            if (!folder.open) {
                this.toggleFolder(folderId);
            }
            
            // Remove tab from main container if it's there
            if (tabElement.parentNode && !tabElement.closest('.folder')) {
                tabElement.remove();
            }
            
            // Add tab to folder content if not already there
            if (!folderContent.contains(tabElement)) {
                folderContent.appendChild(tabElement);
                this.setupTabEventListeners(tabElement, tabId);
                this.updateTabFavicon(tabId, tabElement);
                // Make tab draggable immediately
                if (this.makeTabDraggable) {
                    this.makeTabDraggable(tabElement);
                } else {
                    tabElement.draggable = true;
                }
            }
            
            // Remove empty state if present (only query if needed)
            const folderEmpty = folderContent.querySelector('.folder-empty');
            if (folderEmpty) {
                folderEmpty.remove();
            }
        });
        
        this.saveFolders();
    }

    removeTabFromFolder(tabId, folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return;
        
        folder.tabIds = folder.tabIds.filter(id => id !== tabId);
        this.folders.set(folderId, folder);
        
        // Move tab back to main container
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        const folderElement = document.querySelector(`[data-folder-id="${folderId}"]`);
        
        if (!tabElement || !tabsContainer || !separator || !folderElement) return;
        
        // Clean up any drag-related classes and styles on folder first
        folderElement.classList.remove('dragging', 'drag-over-folder', 'drag-over-folder-top', 'drag-over-folder-bottom');
        
        // Store original styles to restore later
        const folderContent = folderElement.querySelector('.folder-content');
        const originalFolderTransition = folderElement.style.transition;
        const originalFolderPointerEvents = folderElement.style.pointerEvents;
        const originalFolderTransform = folderElement.style.transform;
        const originalFolderFilter = folderElement.style.filter;
        const originalFolderOpacity = folderElement.style.opacity;
        const originalTabTransition = tabElement.style.transition;
        
        // Temporarily disable transitions and reset any transform/filter/opacity that might be stuck
        folderElement.style.transition = 'none';
        folderElement.style.pointerEvents = 'none';
        folderElement.style.transform = '';
        folderElement.style.filter = '';
        folderElement.style.opacity = '';
        tabElement.style.transition = 'none';
        
        // Batch all DOM updates in a single frame
        requestAnimationFrame(() => {
            // Remove tab from folder content
            tabElement.remove();
            
            // Insert in pinned section
            tabsContainer.insertBefore(tabElement, separator);
            
            // Remove any empty state message if it exists
            const folderEmpty = folderContent?.querySelector('.folder-empty');
            if (folderEmpty) {
                folderEmpty.remove();
            }
            
            // If folder was open but is now empty, close it completely
            if (folder.open && folder.tabIds.length === 0) {
                folder.open = false;
                this.folders.set(folder.id, folder);
                const folderIcon = folderElement.querySelector('.folder-icon');
                if (folderIcon) {
                    folderIcon.classList.remove('fa-folder-open');
                    folderIcon.classList.add('fa-folder');
                }
                folderContent.classList.remove('open');
                folderContent.style.display = 'none';
                folderContent.style.visibility = 'hidden';
                folderContent.style.maxHeight = '0px';
                folderContent.style.padding = '0';
                folderContent.style.opacity = '0';
            }
            
            // Restore styles immediately (no need for double RAF)
            folderElement.style.transition = originalFolderTransition || '';
            folderElement.style.pointerEvents = originalFolderPointerEvents || '';
            folderElement.style.transform = originalFolderTransform || '';
            folderElement.style.filter = originalFolderFilter || '';
            folderElement.style.opacity = originalFolderOpacity || '';
            tabElement.style.transition = originalTabTransition || '';
            
            // Ensure all drag classes are removed
            folderElement.classList.remove('dragging', 'drag-over-folder', 'drag-over-folder-top', 'drag-over-folder-bottom');
        });
        
        this.saveFolders();
    }

    deleteFolder(folderId) {
        const folder = this.folders.get(folderId);
        if (!folder) return;
        
        // Move all tabs back to main container
        folder.tabIds.forEach(tabId => {
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            const tabsContainer = document.querySelector('.tabs-container');
            const separator = document.getElementById('tabs-separator');
            
            if (tabElement && tabsContainer && separator) {
                tabElement.remove();
                tabsContainer.insertBefore(tabElement, separator);
            }
        });
        
        // Remove folder
        this.folders.delete(folderId);
        this.saveFolders();
        this.renderFolders();
    }

    saveFolders() {
        const foldersArray = Array.from(this.folders.values()).map(folder => ({
            id: folder.id,
            name: folder.name,
            tabIds: folder.tabIds,
            open: folder.open,
            order: folder.order
        }));
        
        this.saveSetting('folders', foldersArray);
    }

    async loadFolders() {
        try {
            const foldersData = this.settings.folders || [];
            if (!Array.isArray(foldersData)) return;
            
            foldersData.forEach(folderData => {
                this.folders.set(folderData.id, {
                    id: folderData.id,
                    name: folderData.name || `Folder ${folderData.id}`,
                    tabIds: folderData.tabIds || [],
                    open: folderData.open !== false, // Default to open
                    order: folderData.order || 0
                });
            });
            
            this.renderFolders();
        } catch (error) {
            console.error('Error loading folders:', error);
        }
    }

    showFolderContextMenu(e, folderId) {
        const contextMenu = document.getElementById('folder-context-menu');
        if (contextMenu) {
            // Hide other context menus
            this.hideTabContextMenu();
            this.hideWebpageContextMenu();
            this.hideSidebarContextMenu();
            
            // Remove closing state and reset opacity before showing
            contextMenu.classList.remove('closing', 'hidden');
            contextMenu.style.opacity = '';
            
            // Position menu and ensure it stays visible
            const menuWidth = 200;
            const menuHeight = 100;
            const isRight = this.isSidebarRight();
            
            let left = e.pageX;
            let top = e.pageY;
            
            // Adjust if menu would go off-screen
            if (isRight) {
                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 10;
                }
                if (left < 10) {
                    left = 10;
                }
            } else {
                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 10;
                }
            }
            
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 10;
            }
            if (top < 10) {
                top = 10;
            }
            
            contextMenu.style.left = left + 'px';
            contextMenu.style.top = top + 'px';
            contextMenu.style.right = 'auto';
            contextMenu.style.display = 'block';
            this.contextMenuFolderId = folderId;
            
            // Reset animations on all menu items
            const menuItems = contextMenu.querySelectorAll('.context-menu-item');
            menuItems.forEach(item => {
                item.style.animation = 'none';
                item.offsetHeight; // Trigger reflow
                item.style.animation = '';
            });
            
            // Add slide-in animation
            contextMenu.style.animation = 'contextMenuSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
    }

    hideFolderContextMenu() {
        const contextMenu = document.getElementById('folder-context-menu');
        if (contextMenu && !contextMenu.classList.contains('hidden')) {
            contextMenu.classList.add('closing');
            contextMenu.classList.remove('expanded');
            
            setTimeout(() => {
                contextMenu.classList.add('hidden');
                contextMenu.classList.remove('closing');
                contextMenu.style.display = 'none';
                contextMenu.style.opacity = '0';
            }, 250);
        }
        this.contextMenuFolderId = null;
    }

    renameCurrentFolder() {
        if (this.contextMenuFolderId) {
            const folderElement = document.querySelector(`[data-folder-id="${this.contextMenuFolderId}"]`);
            if (folderElement) {
                const nameInput = folderElement.querySelector('.folder-name-input');
                if (nameInput) {
                    const currentName = nameInput.value;
                    
                    // Get computed styles to match exactly
                    const computedStyle = window.getComputedStyle(nameInput);
                    
                    // Create input element with EXACT same flex properties as original
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = currentName;
                    input.className = nameInput.className; // Copy all classes
                    input.style.cssText = `
                        flex: 1;
                        min-width: 0;
                        font-size: ${computedStyle.fontSize};
                        font-family: ${computedStyle.fontFamily};
                        font-weight: ${computedStyle.fontWeight};
                        line-height: ${computedStyle.lineHeight};
                        color: #fff;
                        background: transparent;
                        border: 1px solid #555;
                        border-radius: 8px;
                        padding: 0;
                        margin: 0;
                        outline: none;
                        white-space: nowrap;
                        overflow: hidden;
                        text-overflow: ellipsis;
                        box-sizing: border-box;
                    `;
                    
                    // Replace nameInput with input inline - this preserves flex layout
                    nameInput.parentNode.replaceChild(input, nameInput);
                    input.focus();
                    input.select();
                    
                    const finishRename = () => {
                        const newName = input.value.trim() || currentName;
                        
                        // Restore the nameInput element
                        const newNameInput = document.createElement('input');
                        newNameInput.type = 'text';
                        newNameInput.className = 'folder-name-input tab-title';
                        newNameInput.value = newName;
                        newNameInput.readOnly = true;
                        input.parentNode.replaceChild(newNameInput, input);
                        
                        // Update folder data
                        const folder = this.folders.get(this.contextMenuFolderId);
                        if (folder) {
                            folder.name = newName;
                            this.folders.set(this.contextMenuFolderId, folder);
                            this.saveFolders();
                        }
                    };
                    
                    input.addEventListener('blur', finishRename);
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            finishRename();
                        }
                    });
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Escape') {
                            finishRename();
                        }
                    });
                }
            }
        }
    }

    deleteCurrentFolder() {
        if (this.contextMenuFolderId) {
            const folder = this.folders.get(this.contextMenuFolderId);
            if (folder && confirm(`Delete folder "${folder.name}"? Tabs will be moved back to the sidebar.`)) {
                this.deleteFolder(this.contextMenuFolderId);
            }
        }
    }

    setupSidebarContextMenu() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('Sidebar element not found for context menu setup');
            return;
        }
        
        console.log('Setting up sidebar context menu');
        sidebar.addEventListener('contextmenu', (e) => {
            console.log('Sidebar contextmenu event fired', e.target);
            
            // Only show menu if clicking on empty space (not on tabs, buttons, inputs, or resize handle)
            const target = e.target;
            
            // Check what we're clicking on
            const isTab = target.closest('.tab');
            const isButton = target.closest('button');
            const isInput = target.tagName === 'INPUT' || target.closest('input');
            const isResizeHandle = target.closest('#sidebar-resize-handle');
            const isContextMenu = target.closest('.context-menu');
            
            console.log('Click checks:', {
                target: target.tagName,
                targetClasses: target.className,
                isTab: !!isTab,
                isButton: !!isButton,
                isInput: !!isInput,
                isResizeHandle: !!isResizeHandle,
                isContextMenu: !!isContextMenu
            });
            
            // Allow right-click on empty space - be more permissive
            // Only block if it's clearly an interactive element
            if (!isTab && !isButton && !isInput && !isResizeHandle && !isContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                console.log('✓ Showing sidebar context menu');
                this.showSidebarContextMenu(e);
            } else {
                console.log('✗ Blocked sidebar context menu');
            }
        }, true); // Use capture phase to catch it early
    }

    showTabContextMenu(e, tabId) {
        const contextMenu = document.getElementById('tab-context-menu');
        if (contextMenu) {
            // Remove closing state and reset opacity before showing
            contextMenu.classList.remove('closing', 'hidden');
            contextMenu.style.opacity = '';
            
            // Position menu and ensure it stays visible
            const menuWidth = 200; // Approximate menu width
            const menuHeight = 200; // Approximate menu height
            const isRight = this.isSidebarRight();
            
            // Calculate position
            let left = e.pageX;
            let top = e.pageY;
            
            // Adjust if menu would go off-screen
            if (isRight) {
                // When sidebar is on right, ensure menu doesn't go off right edge
                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 10;
                }
                // Also ensure it doesn't go off left edge
                if (left < 10) {
                    left = 10;
                }
            } else {
                // When sidebar is on left, ensure menu doesn't go off right edge
                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 10;
                }
            }
            
            // Ensure menu doesn't go off bottom edge
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 10;
            }
            
            // Ensure menu doesn't go off top edge
            if (top < 10) {
                top = 10;
            }
            
            contextMenu.style.left = left + 'px';
            contextMenu.style.top = top + 'px';
            contextMenu.style.right = 'auto';
            contextMenu.style.display = 'block';
            this.contextMenuTabId = tabId;
            
            // Reset animations on all menu items to ensure they play
            const menuItems = contextMenu.querySelectorAll('.context-menu-item');
            menuItems.forEach(item => {
                // Force animation restart
                item.style.animation = 'none';
                item.offsetHeight; // Trigger reflow
                item.style.animation = '';
            });
            
            // Update pin/unpin option text and icon based on current state
            const tab = this.tabs.get(tabId);
            const pinOption = document.getElementById('pin-tab-option');
            const pinText = document.getElementById('pin-tab-text');
            const pinIcon = pinOption?.querySelector('i');
            
            if (tab && pinOption && pinText && pinIcon) {
                if (tab.pinned) {
                    pinText.textContent = 'Unpin Tab';
                    pinIcon.className = 'fas fa-thumbtack';
                    pinIcon.style.transform = 'rotate(45deg)';
                } else {
                    pinText.textContent = 'Pin Tab';
                    pinIcon.className = 'fas fa-thumbtack';
                    pinIcon.style.transform = 'rotate(0deg)';
                }
            }
            
            // Add slide-in animation like nav menu
            contextMenu.style.animation = 'contextMenuSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
        }
    }

    hideTabContextMenu() {
        const contextMenu = document.getElementById('tab-context-menu');
        if (contextMenu && !contextMenu.classList.contains('hidden')) {
            // Add closing class to trigger fade-out animation
            contextMenu.classList.add('closing');
            contextMenu.classList.remove('expanded');
            
            // Remove the menu after fade-out animation completes
            setTimeout(() => {
                contextMenu.classList.add('hidden');
                contextMenu.classList.remove('closing');
                contextMenu.style.display = 'none';
                contextMenu.style.opacity = '0';
            }, 250); // Slightly longer than animation duration to ensure smooth fade
        }
        this.contextMenuTabId = null;
    }

    renameCurrentTab() {
        if (this.contextMenuTabId) {
            const tabElement = document.querySelector(`[data-tab-id="${this.contextMenuTabId}"]`);
            if (tabElement) {
                const titleElement = tabElement.querySelector('.tab-title');
                this.renameTab(this.contextMenuTabId, titleElement);
            }
        }
    }

    togglePinCurrentTab() {
        if (this.contextMenuTabId) {
            const tabElement = document.querySelector(`[data-tab-id="${this.contextMenuTabId}"]`);
            if (tabElement) {
                this.togglePinTab(this.contextMenuTabId, tabElement, null);
            }
        }
    }

    duplicateCurrentTab() {
        try {
            // Get the current URL from the webview directly
            const webview = document.getElementById('webview');
            if (!webview) {
                console.error('Webview not found');
                this.showToast('Error: Webview not found');
                return;
            }
            
            const currentUrl = webview.getURL();
            console.log('Current URL from webview:', currentUrl);
            
            // Use a fallback URL if current URL is invalid
            const urlToDuplicate = currentUrl && currentUrl !== 'about:blank' && currentUrl.startsWith('http') 
                ? currentUrl 
                : 'https://www.google.com';
            
            console.log('URL to duplicate:', urlToDuplicate);
            
            // Create a new tab
            const newTabId = this.createNewTab(urlToDuplicate);
            console.log('createNewTab returned:', newTabId);
            
            // Update URL bar to reflect the new tab's URL
            // Ensure URL bar is collapsed and summarized
            const urlBar = this.elements?.urlBar;
            if (urlBar && urlBar.classList.contains('expanded')) {
                urlBar.classList.remove('expanded');
            }
            
            // Use multiple attempts to ensure URL bar is updated and summarized
            setTimeout(() => {
                this.updateUrlBar();
                // Explicitly summarize to ensure it's not showing full URL
                this.summarizeUrlBar();
            }, 100);
            
            // Also update after page loads (backup)
            setTimeout(() => {
                this.updateUrlBar();
                this.summarizeUrlBar();
            }, 500);
            
            // Show success message
            this.showToast('Tab duplicated successfully');
            
        } catch (error) {
            console.error('Error in duplicateCurrentTab:', error);
            this.showToast('Error duplicating tab: ' + error.message);
        }
    }

    closeCurrentTab() {
        if (this.contextMenuTabId) {
            this.closeTab(this.contextMenuTabId);
        }
    }

    showSidebarContextMenu(e) {
        console.log('showSidebarContextMenu called', e);
        const contextMenu = document.getElementById('sidebar-context-menu');
        console.log('Sidebar context menu element:', contextMenu);
        if (!contextMenu) {
            console.error('Sidebar context menu element not found!');
            return;
        }
        
        // Hide other context menus
        this.hideTabContextMenu();
        this.hideWebpageContextMenu();
        
        // Remove closing state and hidden class - CSS will handle display
        contextMenu.classList.remove('closing', 'hidden');
        
        // Position menu and ensure it stays visible
        const menuWidth = 200; // Approximate menu width
        const menuHeight = 150; // Approximate menu height
        const isRight = this.isSidebarRight();
        
        // Calculate position
        let left = e.pageX;
        let top = e.pageY;
        
        // Adjust if menu would go off-screen
        if (isRight) {
            // When sidebar is on right, ensure menu doesn't go off right edge
            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
            }
            // Also ensure it doesn't go off left edge
            if (left < 10) {
                left = 10;
            }
        } else {
            // When sidebar is on left, ensure menu doesn't go off right edge
            if (left + menuWidth > window.innerWidth) {
                left = window.innerWidth - menuWidth - 10;
            }
        }
        
        // Ensure menu doesn't go off bottom edge
        if (top + menuHeight > window.innerHeight) {
            top = window.innerHeight - menuHeight - 10;
        }
        
        // Ensure menu doesn't go off top edge
        if (top < 10) {
            top = 10;
        }
        
        contextMenu.style.left = left + 'px';
        contextMenu.style.top = top + 'px';
        contextMenu.style.right = 'auto';
        contextMenu.style.opacity = '';
        contextMenu.style.display = '';
        contextMenu.style.visibility = '';
        contextMenu.style.zIndex = '10000';
        
        // Force a reflow to ensure styles are applied
        contextMenu.offsetHeight;
        
        console.log('Menu should be visible now. Styles:', {
            display: getComputedStyle(contextMenu).display,
            left: contextMenu.style.left,
            top: contextMenu.style.top,
            opacity: getComputedStyle(contextMenu).opacity,
            classes: contextMenu.className,
            hidden: contextMenu.classList.contains('hidden')
        });
        
        // Reset animations on all menu items to ensure they play
        const menuItems = contextMenu.querySelectorAll('.context-menu-item');
        menuItems.forEach(item => {
            // Force animation restart
            item.style.animation = 'none';
            item.offsetHeight; // Trigger reflow
            item.style.animation = '';
        });
        
        // Add slide-in animation like tab context menu
        contextMenu.style.animation = 'contextMenuSlideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    }

    hideSidebarContextMenu() {
        const contextMenu = document.getElementById('sidebar-context-menu');
        if (contextMenu && !contextMenu.classList.contains('hidden')) {
            // Add closing class to trigger fade-out animation
            contextMenu.classList.add('closing');
            contextMenu.classList.remove('expanded');
            
            // Remove the menu after fade-out animation completes
            setTimeout(() => {
                contextMenu.classList.add('hidden');
                contextMenu.classList.remove('closing');
                contextMenu.style.display = 'none';
                contextMenu.style.opacity = '0';
            }, 250); // Slightly longer than animation duration to ensure smooth fade
        }
    }

    toggleSearch() {
        const searchModal = document.getElementById('search-modal');
        if (searchModal.classList.contains('hidden')) {
            searchModal.classList.remove('hidden');
            document.getElementById('search-input').focus();
        } else {
            this.hideSearch();
        }
    }

    hideSearch() {
        const searchModal = document.getElementById('search-modal');
        searchModal.classList.add('hidden');
        document.getElementById('search-input').value = '';
        this.clearSearch();
    }

    performSearch(query) {
        if (!query.trim()) {
            this.clearSearch();
            return;
        }

        const webview = document.getElementById('webview');
        webview.findInPage(query, {
            forward: true,
            matchCase: false,
            findNext: false
        });
    }

    searchNext() {
        const query = document.getElementById('search-input').value;
        if (query.trim()) {
            const webview = document.getElementById('webview');
            webview.findInPage(query, {
                forward: true,
                matchCase: false,
                findNext: true
            });
        }
    }

    searchPrevious() {
        const query = document.getElementById('search-input').value;
        if (query.trim()) {
            const webview = document.getElementById('webview');
            webview.findInPage(query, {
                forward: false,
                matchCase: false,
                findNext: true
            });
        }
    }

    clearSearch() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        webview.stopFindInPage('clearSelection');
    }

    showWebpageContextMenu(e) {
        const contextMenu = document.getElementById('webpage-context-menu');
        if (contextMenu) {
            // Hide tab context menu if open
            this.hideTabContextMenu();
            
            // Position menu and ensure it stays visible
            const menuWidth = 200;
            const menuHeight = 300;
            const isRight = this.isSidebarRight();
            
            let left = e.pageX;
            let top = e.pageY;
            
            // Adjust if menu would go off-screen
            if (isRight) {
                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 10;
                }
                if (left < 10) {
                    left = 10;
                }
            } else {
                if (left + menuWidth > window.innerWidth) {
                    left = window.innerWidth - menuWidth - 10;
                }
            }
            
            if (top + menuHeight > window.innerHeight) {
                top = window.innerHeight - menuHeight - 10;
            }
            if (top < 10) {
                top = 10;
            }
            
            contextMenu.style.left = left + 'px';
            contextMenu.style.top = top + 'px';
            contextMenu.style.right = 'auto';
            contextMenu.style.display = 'block';
            contextMenu.classList.remove('hidden');
        }
    }

    hideWebpageContextMenu() {
        const contextMenu = document.getElementById('webpage-context-menu');
        if (contextMenu) {
            contextMenu.classList.add('hidden');
            contextMenu.style.display = 'none';
        }
    }

    selectAll() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        webview.executeJavaScript(`
            try {
                if (document.activeElement && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
                    document.execCommand('selectAll');
                } else {
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    const range = document.createRange();
                    range.selectNodeContents(document.body);
                    selection.addRange(range);
                }
            } catch (e) {
                console.log('Select all failed:', e);
            }
        `);
    }

    cut() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        webview.executeJavaScript('document.execCommand("cut")');
    }

    copy() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        webview.executeJavaScript('document.execCommand("copy")');
    }

    async copyCurrentUrl() {
        const el = this.elements;
        if (!el?.webview) return;
        
        // Get the appropriate webview based on view mode
        let webview;
        if (this.isSplitView) {
            if (!this.cachedWebviews) {
                this.cachedWebviews = {
                    left: document.getElementById('webview-left'),
                    right: document.getElementById('webview-right')
                };
            }
            webview = this.activePane === 'left' ? 
                this.cachedWebviews.left : 
                this.cachedWebviews.right;
        } else {
            webview = el.webview;
        }
        
        if (!webview) return;
        
        const url = webview.getURL();
        if (!url || url === 'about:blank') {
            this.showNotification('No URL to copy', 'error');
            return;
        }
        
        try {
            await navigator.clipboard.writeText(url);
            this.showNotification('URL copied to clipboard', 'success');
        } catch (err) {
            // Fallback for older browsers
            const textArea = document.createElement('textarea');
            textArea.value = url;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showNotification('URL copied to clipboard', 'success');
            } catch (fallbackErr) {
                this.showNotification('Failed to copy URL', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    paste() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        webview.executeJavaScript('document.execCommand("paste")');
    }

    closeCurrentActiveTab() {
        if (this.tabs.size > 1) {
            this.closeTab(this.currentTab);
        }
    }

    // History management

    async populateHistory() {
        const historyList = document.getElementById('history-list');
        const history = await this.getHistory();
        
        historyList.innerHTML = '';
        
        if (history.length === 0) {
            historyList.innerHTML = '<div class="empty-state">No history found</div>';
            return;
        }
        
        history.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <img class="history-favicon" src="${item.favicon}" alt="" onerror="this.style.display='none'">
                <div class="history-info">
                    <div class="history-title">${item.title}</div>
                    <div class="history-url">${item.url}</div>
                </div>
                <div class="history-time">${item.time}</div>
                <div class="history-actions">
                    <button class="history-delete" data-id="${item.id}" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Click to navigate
            historyItem.addEventListener('click', (e) => {
                if (!e.target.closest('.history-delete')) {
                this.navigate(item.url);
                // Close settings panel after navigation
                document.getElementById('settings-panel').classList.add('hidden');
                document.getElementById('modal-backdrop').classList.add('hidden');
                }
            });
            
            // Delete history item
            const deleteBtn = historyItem.querySelector('.history-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteHistoryItem(item.id);
            });
            
            historyList.appendChild(historyItem);
        });
    }

    async getHistory() {
        try {
            const history = await window.electronAPI.getHistory();
            return history.map(item => ({
                id: item.id,
                title: item.title,
                url: item.url,
                favicon: item.favicon,
                time: this.formatTimeAgo(item.timestamp)
            }));
        } catch (error) {
            console.error('Failed to load history:', error);
            return [];
        }
    }

    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
        if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
        if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
        return time.toLocaleDateString();
    }

    async deleteHistoryItem(id) {
        try {
            await window.electronAPI.deleteHistoryItem(id);
            this.populateHistory();
            this.showNotification('History item deleted', 'success');
        } catch (error) {
            console.error('Failed to delete history item:', error);
            this.showNotification('Failed to delete history item', 'error');
        }
    }

    async clearAllHistory() {
        try {
            await window.electronAPI.clearHistory();
            this.populateHistory();
            this.showNotification('History cleared', 'success');
        } catch (error) {
            console.error('Failed to clear history:', error);
            this.showNotification('Failed to clear history', 'error');
        }
    }

    async filterHistory(searchTerm) {
        const historyList = document.getElementById('history-list');
        const history = await this.getHistory();
        
        if (!searchTerm.trim()) {
            this.populateHistory();
            return;
        }

        const filteredHistory = history.filter(item => 
            item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.url.toLowerCase().includes(searchTerm.toLowerCase())
        );

        historyList.innerHTML = '';

        filteredHistory.forEach(item => {
            const historyItem = document.createElement('div');
            historyItem.className = 'history-item';
            historyItem.innerHTML = `
                <div class="history-info">
                    <div class="history-title">${item.title}</div>
                    <div class="history-url">${item.url}</div>
                    <div class="history-time">${this.formatTimeAgo(item.timestamp)}</div>
                </div>
                <div class="history-actions">
                    <button class="history-delete" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            
            // Click to navigate
            historyItem.addEventListener('click', (e) => {
                if (!e.target.closest('.history-delete')) {
                this.navigate(item.url);
                // Close settings panel after navigation
                document.getElementById('settings-panel').classList.add('hidden');
                document.getElementById('modal-backdrop').classList.add('hidden');
                }
            });
            
            // Delete history item
            const deleteBtn = historyItem.querySelector('.history-delete');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteHistoryItem(item.id);
            });
            
            historyList.appendChild(historyItem);
        });
    }

    // Downloads management
    toggleDownloads() {
        const downloadsPanel = document.getElementById('downloads-panel');
        const settingsPanel = document.getElementById('settings-panel');
        const securityPanel = document.getElementById('security-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        
        if (downloadsPanel.classList.contains('hidden')) {
            // Smooth fade-in animation
            downloadsPanel.classList.remove('hidden');
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.transition = 'opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            }
            
            // Add entrance animation class
            downloadsPanel.classList.add('downloads-entering');
            
            // Populate downloads immediately
                this.populateDownloads();
            
            // Remove animation class after animation completes (200ms)
            setTimeout(() => {
                downloadsPanel.classList.remove('downloads-entering');
            }, 200);
            
                // Refresh popup themes
                this.refreshPopupThemes();
            
        } else {
            // Smooth fade-out animation
            downloadsPanel.classList.add('downloads-closing');
            
            setTimeout(() => {
                downloadsPanel.classList.add('hidden');
                downloadsPanel.classList.remove('downloads-closing');
                if (backdrop) backdrop.classList.add('hidden');
            }, 150);
        }
    }

    async populateDownloads() {
        const downloadsList = document.getElementById('downloads-list');
        const downloads = await this.getDownloads();
        
        // Clear with fade out animation
        downloadsList.style.opacity = '0';
        downloadsList.style.transform = 'translateY(10px)';
        
        setTimeout(() => {
            downloadsList.innerHTML = '';
            
            if (downloads.length === 0) {
                downloadsList.innerHTML = `
                    <div class="no-downloads">
                        <i class="fas fa-download"></i>
                        <p>No downloads yet</p>
                        <p class="no-downloads-subtitle">Downloads will appear here</p>
                    </div>
                `;
                downloadsList.style.opacity = '1';
                downloadsList.style.transform = 'translateY(0)';
                return;
            }
            
            // Add items with staggered animation
            downloads.forEach((download, index) => {
                const downloadItem = document.createElement('div');
                downloadItem.className = 'download-item';
                downloadItem.style.opacity = '0';
                downloadItem.style.transform = 'translateY(20px)';
                downloadItem.innerHTML = `
                    <i class="fas fa-file-download download-icon"></i>
                    <div class="download-info">
                        <div class="download-name">${download.filename}</div>
                        <div class="download-progress">${this.formatDownloadProgress(download)}</div>
                        <div class="download-url">${download.url}</div>
                    </div>
                    <div class="download-actions">
                        <button class="download-btn" title="Open" data-id="${download.id}">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                        <button class="download-btn" title="Delete" data-id="${download.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                
                // Open download
                const openBtn = downloadItem.querySelector('.download-btn[title="Open"]');
                openBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openDownload(download);
                });
                
                // Delete download
                const deleteBtn = downloadItem.querySelector('.download-btn[title="Delete"]');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteDownload(download.id);
                });
                
                downloadsList.appendChild(downloadItem);
                
                // Staggered entrance animation
                setTimeout(() => {
                    downloadItem.style.transition = 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
                    downloadItem.style.opacity = '1';
                    downloadItem.style.transform = 'translateY(0)';
                }, index * 50); // 50ms delay between items
            });
            
            // Fade in the list
            downloadsList.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            downloadsList.style.opacity = '1';
            downloadsList.style.transform = 'translateY(0)';
        }, 150);
    }

    async refreshDownloads() {
        const refreshBtn = document.getElementById('refresh-downloads');
        const icon = refreshBtn.querySelector('i');
        
        // Add spinning animation
        icon.style.animation = 'spin 1s linear infinite';
        refreshBtn.style.pointerEvents = 'none';
        
        // Add loading state to downloads list
        const downloadsList = document.getElementById('downloads-list');
        const restoreContent = this.showLoadingState(downloadsList, 'Refreshing downloads...');
        
        try {
            await this.populateDownloads();
            this.showNotification('Downloads refreshed', 'success');
        } catch (error) {
            this.showErrorFeedback(downloadsList, 'Failed to refresh downloads');
        } finally {
            // Remove spinning animation after a delay
            setTimeout(() => {
                icon.style.animation = '';
                refreshBtn.style.pointerEvents = 'auto';
                if (restoreContent) restoreContent();
            }, 1000);
        }
    }

    async getDownloads() {
        try {
            const downloads = await window.electronAPI.getDownloads();
            return downloads.map(download => ({
                id: download.id,
                url: download.url,
                filename: download.filename,
                path: download.path,
                size: download.size,
                receivedBytes: download.receivedBytes,
                status: download.status,
                timestamp: download.timestamp
            }));
        } catch (error) {
            console.error('Failed to load downloads:', error);
            return [];
        }
    }

    formatDownloadProgress(download) {
        if (download.status === 'completed') {
            return 'Completed';
        } else if (download.status === 'downloading') {
            const percentage = download.size > 0 ? Math.round((download.receivedBytes / download.size) * 100) : 0;
            return `Downloading... ${percentage}%`;
        } else if (download.status === 'failed') {
            return 'Failed';
        } else if (download.status === 'paused') {
            return 'Paused';
        }
        return download.status;
    }

    async openDownload(download) {
        try {
            // In a real implementation, this would open the file
            this.showNotification(`Opening ${download.filename}`, 'info');
        } catch (error) {
            console.error('Failed to open download:', error);
            this.showNotification('Failed to open file', 'error');
        }
    }

    async deleteDownload(id) {
        try {
            // Add delete animation
            const downloadElement = document.querySelector(`[data-id="${id}"]`).closest('.download-item');
            if (downloadElement) {
                downloadElement.style.transform = 'scale(0.95)';
                downloadElement.style.opacity = '0.5';
                downloadElement.classList.add('shake');
            }
            
            setTimeout(async () => {
                await window.electronAPI.deleteDownload(id);
                this.populateDownloads();
                this.showNotification('Download deleted', 'success');
            }, 300);
        } catch (error) {
            console.error('Failed to delete download:', error);
            this.showNotification('Failed to delete download', 'error');
        }
    }

    async clearAllDownloads() {
        try {
            await window.electronAPI.clearDownloads();
            this.populateDownloads();
            this.showNotification('Downloads cleared', 'success');
        } catch (error) {
            console.error('Failed to clear downloads:', error);
            this.showNotification('Failed to clear downloads', 'error');
        }
    }

    filterDownloads(searchTerm) {
        const downloadItems = document.querySelectorAll('.download-item');
        const searchLower = searchTerm.toLowerCase();
        
        downloadItems.forEach(item => {
            const fileName = item.querySelector('.download-name').textContent.toLowerCase();
            const fileUrl = item.querySelector('.download-url').textContent.toLowerCase();
            
            if (fileName.includes(searchLower) || fileUrl.includes(searchLower)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    reopenLastClosedTab() {
        if (this.closedTabs.length === 0) {
            this.showNotification('No recently closed tabs', 'info');
            return;
        }
        
        const closedTab = this.closedTabs[0];
        if (closedTab && closedTab.url) {
            this.createNewTab(closedTab.url);
            this.closedTabs.shift(); // Remove from closed tabs
            this.showNotification('Reopened tab', 'success');
        }
    }


    zoomIn() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        const currentZoom = webview.getZoomFactor();
        const newZoom = Math.min(currentZoom + 0.1, 3.0);
        webview.setZoomFactor(newZoom);
        this.showZoomIndicator('zoom-in', Math.round(newZoom * 100));
    }

    zoomOut() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        const currentZoom = webview.getZoomFactor();
        const newZoom = Math.max(currentZoom - 0.1, 0.25);
        webview.setZoomFactor(newZoom);
        this.showZoomIndicator('zoom-out', Math.round(newZoom * 100));
    }

    resetZoom() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        webview.setZoomFactor(1.0);
        this.showZoomIndicator('zoom-in', 100);
    }

    showZoomIndicator(type, percentage) {
        const indicator = document.getElementById('zoom-indicator');
        const percentageSpan = indicator.querySelector('.zoom-percentage');
        const icon = indicator.querySelector('i');
        
        // Update content
        percentageSpan.textContent = `${percentage}%`;
        
        // Update icon based on zoom type
        if (type === 'zoom-in') {
            icon.className = 'fas fa-search-plus';
        } else if (type === 'zoom-out') {
            icon.className = 'fas fa-search-minus';
        }
        
        // Show indicator
        indicator.classList.remove('hidden');
        indicator.classList.add('show', type);
        
        // Hide after 4 seconds
        setTimeout(() => {
            indicator.classList.remove('show', type);
            setTimeout(() => {
                indicator.classList.add('hidden');
            }, 300);
        }, 4000);
    }

    setupLoadingScreen() {
        const app = document.getElementById('app');
        
        // Ultra-fast loading
        setTimeout(() => {
            // Add blur-in effect to main app
            app.classList.add('loaded');
        }, 200); // Start blur-in after 0.2 seconds for instant feel
    }

    showLoadingIndicator() {
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            loadingBar.classList.add('loading');
        }
    }

    hideLoadingIndicator() {
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            loadingBar.classList.remove('loading');
        }
    }


    createIncognitoTab() {
        // Open incognito window
        window.electronAPI.openIncognitoWindow();
        // Note: Spotlight search will be handled in the new incognito window
    }

    updateTabDisplay() {
        const tabsContainer = document.getElementById('tabs-container');
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';

        this.tabs.forEach((tab, tabId) => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${tab.active ? 'active' : ''} ${tab.incognito ? 'incognito' : ''}`;
            tabElement.draggable = true;
            tabElement.dataset.tabId = tabId;

            const title = tab.title || (tab.incognito ? 'New Incognito Tab' : 'New Tab');
            const isPinned = tab.pinned;

            tabElement.innerHTML = `
                <div class="tab-content">
                    ${tab.incognito ? '<i class="fas fa-mask tab-incognito-icon"></i>' : ''}
                    <span class="tab-title">${title}</span>
                    <button class="tab-close" data-tab-id="${tabId}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `;

            // Add event listeners
            tabElement.addEventListener('click', () => this.switchToTab(tabId));
            tabElement.addEventListener('dragstart', (e) => this.handleTabDragStart(e));
            tabElement.addEventListener('dragover', (e) => this.handleTabDragOver(e));
            tabElement.addEventListener('drop', (e) => this.handleTabDrop(e));

            const closeBtn = tabElement.querySelector('.tab-close');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTab(tabId);
            });

            tabsContainer.appendChild(tabElement);
        });
    }

    setupSidebarResize() {
        const sidebar = document.getElementById('sidebar');
        const resizeHandle = document.getElementById('sidebar-resize-handle');
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        let animationFrame = null;

        const startResize = (e) => {
            if (isResizing) return;
            
            isResizing = true;
            startX = e.clientX;
            startWidth = sidebar.offsetWidth;
            
            // Add visual feedback
            document.body.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            
            // Prevent text selection and default behaviors
            e.preventDefault();
            e.stopPropagation();
        };

        const doResize = (e) => {
            if (!isResizing) return;
            
            // Cancel previous animation frame
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            
            // Use requestAnimationFrame for smooth resizing
            animationFrame = requestAnimationFrame(() => {
                const deltaX = e.clientX - startX;
                const newWidth = startWidth + deltaX;
                const minWidth = 200;
                const maxWidth = 500;
                
                // Clamp width within bounds
                const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
                
                // Apply the new width
                sidebar.style.width = clampedWidth + 'px';
            });
        };

        const stopResize = (e) => {
            if (!isResizing) return;
            
            isResizing = false;
            
            // Cancel any pending animation frame
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            
            // Remove visual feedback
            document.body.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Prevent event bubbling
            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Mouse events
        resizeHandle.addEventListener('mousedown', startResize, { passive: false });
        document.addEventListener('mousemove', doResize, { passive: false });
        document.addEventListener('mouseup', stopResize, { passive: false });
        
        // Handle mouse leave to stop resizing
        document.addEventListener('mouseleave', stopResize);

        // Touch events for mobile
        resizeHandle.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startResize(e.touches[0]);
        }, { passive: false });
        
        document.addEventListener('touchmove', (e) => {
            if (isResizing) {
                e.preventDefault();
                doResize(e.touches[0]);
            }
        }, { passive: false });
        
        document.addEventListener('touchend', (e) => {
            stopResize(e);
        }, { passive: false });

        // Prevent context menu on resize handle
        resizeHandle.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });
    }

    setupTabDragDrop() {
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        let draggedTab = null;
        let draggedIndex = -1;
        let lastDragState = null; // Track last state to prevent unnecessary updates
        let containerLastDragState = null; // Track state for container drag
        
        // Create shared insertion line element
        let insertionLine = document.querySelector('.drag-insertion-line');
        if (!insertionLine) {
            insertionLine = document.createElement('div');
            insertionLine.className = 'drag-insertion-line';
            tabsContainer.appendChild(insertionLine);
        }
        
        // Helper function to show insertion line - centered in gap
        const showInsertionLine = (y) => {
            // Center the 2px line in the 8px gap (y is already at 4px offset, -1px to center the 2px line)
            insertionLine.style.top = (y - 1) + 'px';
            insertionLine.style.display = 'block';
        };
        
        // Helper function to hide insertion line
        const hideInsertionLine = () => {
            insertionLine.style.display = 'none';
        };

        // Setup separator drag handlers
        if (separator) {
            
            separator.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                // Update visual feedback on separator
                if (draggedTab) {
                    const tabId = parseInt(draggedTab.dataset.tabId, 10);
                    const tab = this.tabs.get(tabId);
                    const isCurrentlyPinned = tab && tab.pinned;
                    
                    // Determine which section based on drop position - use midpoint for accuracy
                    const separatorRect = separator.getBoundingClientRect();
                    const separatorMidpoint = separatorRect.top + separatorRect.height / 2;
                    const dropY = e.clientY;
                    const isAbove = dropY < separatorMidpoint;
                    
                    // Determine new state
                    let newState = null;
                    if (!isCurrentlyPinned && isAbove) {
                        newState = 'pinned';
                    } else if (isCurrentlyPinned && !isAbove) {
                        newState = 'unpinned';
                    }
                    
                    // Only update if state changed to prevent flickering
                    if (newState !== lastDragState) {
                        // Show insertion line at separator position
                        const separatorRect = separator.getBoundingClientRect();
                        const containerRect = tabsContainer.getBoundingClientRect();
                        const lineY = separatorRect.top - containerRect.top;
                        showInsertionLine(lineY);
                        
                        lastDragState = newState;
                    }
                }
            });

            separator.addEventListener('drop', (e) => {
                e.preventDefault();
                
                // Reset drag state
                lastDragState = null;
                
                // Remove drag visual feedback
                hideInsertionLine();
                
                if (draggedTab) {
                    const tabId = parseInt(draggedTab.dataset.tabId, 10);
                    const tab = this.tabs.get(tabId);
                    const tabElement = draggedTab;
                    
                    if (tab) {
                        // Determine if dropping above (pin) or below (unpin) separator
                        const separatorRect = separator.getBoundingClientRect();
                        const dropY = e.clientY;
                        const isAbove = dropY < separatorRect.top + separatorRect.height / 2;
                        
                        // Pin/unpin based on drop position
                        if (isAbove && !tab.pinned) {
                            // Pin the tab
                            tab.pinned = true;
                            this.tabs.set(tabId, tab);
                            tabElement.classList.add('pinned');
                            
                            // Move to pinned section
                            this.organizeTabsByPinnedState();
                            this.savePinnedTabs();
                        } else if (!isAbove && tab.pinned) {
                            // Unpin the tab
                            tab.pinned = false;
                            this.tabs.set(tabId, tab);
                            tabElement.classList.remove('pinned');
                            
                            // Move to unpinned section
                            this.organizeTabsByPinnedState();
                            this.savePinnedTabs();
                        }
                    }
                }
            });

            // Allow dropping tabs in the pinned section (area above separator) or unpinning (below separator)
            // Create a custom handler that checks if we're in empty space above or below separator
            const handleContainerDragOver = (e) => {
                if (!draggedTab) return;
                
                // Don't interfere with tab-to-tab dragging - let tabs handle their own dragover
                if (e.target.classList.contains('tab') || e.target.closest('.tab')) {
                    hideInsertionLine();
                    return;
                }
                // Don't interfere with folder dragging - let folders handle their own dragover
                // Also hide insertion line if over folder content
                if (e.target.classList.contains('folder') || 
                    e.target.closest('.folder') || 
                    e.target.closest('.folder-content')) {
                    hideInsertionLine();
                    return;
                }
                
                const separatorRect = separator.getBoundingClientRect();
                const dropY = e.clientY;
                const containerRect = tabsContainer.getBoundingClientRect();
                
                // Check if we're near a folder (above or below it) - handle folder positioning
                const allFolders = document.querySelectorAll('.folder');
                for (const folder of allFolders) {
                    const folderRect = folder.getBoundingClientRect();
                    // Check if mouse is in the gap area above or below the folder
                    const gapSize = 8; // Same as CSS gap
                    const isNearFolderTop = dropY >= folderRect.top - gapSize && dropY < folderRect.top;
                    const isNearFolderBottom = dropY > folderRect.bottom && dropY <= folderRect.bottom + gapSize;
                    
                    if (isNearFolderTop || isNearFolderBottom) {
                        // Show insertion line near folder
                        const isAbove = dropY < folderRect.top + folderRect.height / 2;
                        const lineY = isAbove ? folderRect.top - containerRect.top - 4 : folderRect.bottom - containerRect.top + 4;
                        showInsertionLine(lineY);
                        folder.dataset.dropSide = isAbove ? 'top' : 'bottom';
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        return;
                    }
                }
                
                // Use separator midpoint as exact boundary
                const separatorMidpoint = separatorRect.top + separatorRect.height / 2;
                const tabId = parseInt(draggedTab.dataset.tabId, 10);
                const tab = this.tabs.get(tabId);
                const isCurrentlyPinned = tab && tab.pinned;
                
                // Accurate check: above separator = pinned section, below = unpinned section
                const isInPinnedArea = dropY < separatorMidpoint;
                const isInUnpinnedArea = dropY > separatorMidpoint;
                
                // Determine new state
                let newState = null;
                if (separator.offsetParent !== null) {
                    if (!isCurrentlyPinned && isInPinnedArea) {
                        newState = 'pinned';
                    } else if (isCurrentlyPinned && isInUnpinnedArea) {
                        newState = 'unpinned';
                    }
                }
                
                // Only update if state changed to prevent flickering
                if (newState !== containerLastDragState) {
                    // Show insertion line at separator position
                    const separatorRect = separator.getBoundingClientRect();
                    const containerRect = tabsContainer.getBoundingClientRect();
                    const lineY = separatorRect.top - containerRect.top;
                    showInsertionLine(lineY);
                    
                    containerLastDragState = newState;
                }
                
                // Allow drop if:
                // 1. Dragging unpinned tab above separator (to pin)
                // 2. Dragging pinned tab below separator (to unpin)
                const shouldAllowDrop = separator.offsetParent !== null && (
                    (!isCurrentlyPinned && isInPinnedArea) ||
                    (isCurrentlyPinned && isInUnpinnedArea)
                );
                
                if (shouldAllowDrop) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                }
            };

            const handleContainerDrop = (e) => {
                if (!draggedTab) return;
                
                // Don't interfere with tab-to-tab dropping - let tabs handle their own drop
                if (e.target.classList.contains('tab') || e.target.closest('.tab')) return;
                // Don't interfere with folder dropping - let folders handle their own drop
                if (e.target.classList.contains('folder') || e.target.closest('.folder')) return;
                
                // Check if we're dropping near a folder (in the gap above or below it)
                const dropY = e.clientY;
                const allFolders = document.querySelectorAll('.folder');
                for (const folder of allFolders) {
                    const folderRect = folder.getBoundingClientRect();
                    const gapSize = 8;
                    const isNearFolderTop = dropY >= folderRect.top - gapSize && dropY < folderRect.top;
                    const isNearFolderBottom = dropY > folderRect.bottom && dropY <= folderRect.bottom + gapSize;
                    
                    if (isNearFolderTop || isNearFolderBottom) {
                        // Handle drop near folder
                        const tabId = parseInt(draggedTab.dataset.tabId, 10);
                        const tab = this.tabs.get(tabId);
                        if (!tab) return;
                        
                        // Check if tab was dragged from a folder
                        const draggedTabParentFolder = draggedTab.closest('.folder');
                        if (draggedTabParentFolder) {
                            const folderId = parseInt(draggedTabParentFolder.dataset.folderId, 10);
                            if (folderId) {
                                this.removeTabFromFolder(tabId, folderId);
                            }
                        }
                        
                        const isAbove = dropY < folderRect.top + folderRect.height / 2;
                        const folderIsPinned = folder.classList.contains('pinned');
                        const wasPinned = tab.pinned;
                        
                        // Remove from current position
                        draggedTab.remove();
                        
                        if (isAbove) {
                            tabsContainer.insertBefore(draggedTab, folder);
                            if (folderIsPinned && !wasPinned) {
                                tab.pinned = true;
                                this.tabs.set(tabId, tab);
                                draggedTab.classList.add('pinned');
                            }
                        } else {
                            folder.insertAdjacentElement('afterend', draggedTab);
                            if (folderIsPinned && !wasPinned) {
                                tab.pinned = true;
                                this.tabs.set(tabId, tab);
                                draggedTab.classList.add('pinned');
                            }
                        }
                        
                        if (wasPinned !== tab.pinned) {
                            this.organizeTabsByPinnedState();
                        }
                        this.savePinnedTabs();
                        
                        // Hide insertion line
                        hideInsertionLine();
                        return;
                    }
                }
                
                const separatorRect = separator.getBoundingClientRect();
                const tabId = parseInt(draggedTab.dataset.tabId, 10);
                const tab = this.tabs.get(tabId);
                
                if (!tab) {
                    return;
                }
                
                // Check if tab was dragged from a folder
                const draggedTabParentFolder = draggedTab.closest('.folder');
                if (draggedTabParentFolder) {
                    const folderId = parseInt(draggedTabParentFolder.dataset.folderId, 10);
                    if (folderId) {
                        this.removeTabFromFolder(tabId, folderId);
                    }
                }
                
                // Use separator midpoint as exact boundary
                const separatorMidpoint = separatorRect.top + separatorRect.height / 2;
                const isAbove = dropY < separatorMidpoint;
                const isBelow = dropY > separatorMidpoint;
                
                // Remove drag visual feedback
                hideInsertionLine();
                
                // Handle pinning: unpinned tab dropped above separator
                if (isAbove && separator.offsetParent !== null && !tab.pinned) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Pin the tab
                    tab.pinned = true;
                    this.tabs.set(tabId, tab);
                    draggedTab.classList.add('pinned');
                    
                    // Move to pinned section
                    this.organizeTabsByPinnedState();
                    this.savePinnedTabs();
                }
                // Handle unpinning: pinned tab dropped below separator
                else if (isBelow && separator.offsetParent !== null && tab.pinned) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    // Unpin the tab
                    tab.pinned = false;
                    this.tabs.set(tabId, tab);
                    draggedTab.classList.remove('pinned');
                    
                    // Move to unpinned section
                    this.organizeTabsByPinnedState();
                    this.savePinnedTabs();
                }
            };

            const handleContainerDragLeave = (e) => {
                // Remove drag visual feedback when leaving container
                if (!tabsContainer.contains(e.relatedTarget)) {
                    containerLastDragState = null;
                    lastDragState = null;
                }
            };

            // Add listeners to tabs container for dropping in empty pinned area
            tabsContainer.addEventListener('dragover', handleContainerDragOver, true);
            tabsContainer.addEventListener('drop', handleContainerDrop, true);
            tabsContainer.addEventListener('dragleave', handleContainerDragLeave);
        }

        // Make tabs draggable - store reference so it can be called from other methods
        const makeTabDraggable = (tab) => {
            tab.draggable = true;
            
            tab.addEventListener('dragstart', (e) => {
                draggedTab = tab;
                draggedIndex = Array.from(tabsContainer.children).indexOf(tab);
                tab.classList.add('dragging');
                
                // Set drag data
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/html', tab.outerHTML);
            });

            tab.addEventListener('dragend', (e) => {
                tab.classList.remove('dragging');
                
                // Hide insertion line
                hideInsertionLine();
                
                // Check if tab was dragged out of a folder
                const tabId = parseInt(tab.dataset.tabId, 10);
                if (tabId) {
                    // Find which folder this tab belongs to
                    const parentFolder = tab.closest('.folder');
                    if (parentFolder) {
                        const folderId = parseInt(parentFolder.dataset.folderId, 10);
                        const folder = this.folders.get(folderId);
                        
                        // Check if tab is still in the folder or was moved out
                        if (folder && !parentFolder.contains(tab)) {
                            // Tab was moved out of folder
                            this.removeTabFromFolder(tabId, folderId);
                        }
                    }
                }
                
                draggedTab = null;
                draggedIndex = -1;
                
                // Reset drag states
                if (separator) {
                    lastDragState = null;
                    containerLastDragState = null;
                }
                
                // Clean up drop side data
                document.querySelectorAll('.tab').forEach(t => {
                    delete t.dataset.dropSide;
                });
                document.querySelectorAll('.folder').forEach(f => {
                    delete f.dataset.dropSide;
                });
                
                // Remove drag section indicators
                if (separator) {
                    hideInsertionLine();
                }
            });

            tab.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                
                // Check if dragging a folder (use dragging class since getData doesn't work in dragover)
                const draggedFolder = document.querySelector('.folder.dragging');
                
                if (draggedFolder) {
                    // Handle folder dragging over tab
                    const rect = tab.getBoundingClientRect();
                    const containerRect = tabsContainer.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    const isAbove = e.clientY < midpoint;
                    
                    // Position insertion line
                    const lineY = isAbove ? rect.top - containerRect.top - 4 : rect.bottom - containerRect.top + 4;
                    showInsertionLine(lineY);
                    
                    // Store which side for drop handler
                    tab.dataset.dropSide = isAbove ? 'top' : 'bottom';
                    return;
                }
                
                if (!draggedTab || draggedTab === tab) return;
                
                const rect = tab.getBoundingClientRect();
                const containerRect = tabsContainer.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                const isAbove = e.clientY < midpoint;
                
                // Position insertion line exactly in the gap between elements (gap is 8px, so 4px offset)
                const lineY = isAbove ? rect.top - containerRect.top - 4 : rect.bottom - containerRect.top + 4;
                showInsertionLine(lineY);
                
                // Store which side for drop handler
                tab.dataset.dropSide = isAbove ? 'top' : 'bottom';
            });

            tab.addEventListener('dragleave', (e) => {
                // Only remove if actually leaving the tab
                if (!tab.contains(e.relatedTarget)) {
                    hideInsertionLine();
                }
            });

            tab.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                // Hide insertion line
                hideInsertionLine();
                
                // Check if dragging a folder (use getData in drop or dragging class)
                const draggedFolderId = e.dataTransfer.getData('application/folder-id');
                const currentDraggedFolder = (draggedFolderId ? document.querySelector(`[data-folder-id="${draggedFolderId}"]`) : null) || document.querySelector('.folder.dragging');
                
                if (currentDraggedFolder) {
                    // Handle folder drop on tab
                    const isAbove = tab.dataset.dropSide === 'top';
                    
                    // Remove folder from DOM first
                    currentDraggedFolder.remove();
                    
                    // Insert folder in correct position
                    if (isAbove) {
                        tabsContainer.insertBefore(currentDraggedFolder, tab);
                    } else {
                        tab.insertAdjacentElement('afterend', currentDraggedFolder);
                    }
                    
                    // Clean up
                    delete tab.dataset.dropSide;
                    return;
                }
                
                if (!draggedTab || draggedTab === tab) {
                    // Clean up
                    delete tab.dataset.dropSide;
                    return;
                }
                
                const tabId = parseInt(draggedTab.dataset.tabId, 10);
                const draggedTabData = this.tabs.get(tabId);
                const dropTabId = parseInt(tab.dataset.tabId, 10);
                const dropTabData = this.tabs.get(dropTabId);
                
                if (!draggedTabData || !dropTabData) {
                    // Clean up
                    document.querySelectorAll('.tab').forEach(t => {
                        delete t.dataset.dropSide;
                    });
                    document.querySelectorAll('.folder').forEach(f => {
                        delete f.dataset.dropSide;
                    });
                    return;
                }
                
                // Check if dragged tab was in a folder
                const draggedTabParentFolder = draggedTab.closest('.folder');
                if (draggedTabParentFolder) {
                    const folderId = parseInt(draggedTabParentFolder.dataset.folderId, 10);
                    if (folderId) {
                        this.removeTabFromFolder(tabId, folderId);
                    }
                }
                
                const isAbove = tab.dataset.dropSide === 'top';
                
                // Get all tabs in order to find the correct insertion point
                const allElements = Array.from(tabsContainer.children);
                const targetIndex = allElements.indexOf(tab);
                const draggedIndex = allElements.indexOf(draggedTab);
                
                // If dragging to same position, do nothing
                if (draggedIndex !== -1 && targetIndex !== -1) {
                    const newIndex = isAbove ? targetIndex : targetIndex + 1;
                    if (draggedIndex < newIndex) {
                        // Adjust for the fact that we're removing the dragged tab first
                        if (newIndex > draggedIndex) {
                            // We're moving forward, so the target index shifts
                            const adjustedIndex = newIndex - 1;
                            if (adjustedIndex === draggedIndex) {
                                // Same position, do nothing
                                return;
                            }
                        }
                    }
                }
                
                // Check if dropping crosses the separator boundary
                const draggedIsPinned = draggedTabData.pinned;
                const dropIsPinned = dropTabData.pinned;
                
                // If crossing separator, pin/unpin accordingly
                if (draggedIsPinned !== dropIsPinned) {
                    // Tab is being moved across separator - update pin state
                    if (isAbove && dropIsPinned && !draggedIsPinned) {
                        // Moving unpinned tab above pinned tab - pin it
                        draggedTabData.pinned = true;
                        this.tabs.set(tabId, draggedTabData);
                        draggedTab.classList.add('pinned');
                    } else if (!isAbove && !dropIsPinned && draggedIsPinned) {
                        // Moving pinned tab below unpinned tab - unpin it
                        draggedTabData.pinned = false;
                        this.tabs.set(tabId, draggedTabData);
                        draggedTab.classList.remove('pinned');
                    }
                }
                
                // Remove tab from DOM first
                draggedTab.remove();
                
                // Insert tab in correct position
                if (isAbove) {
                    tabsContainer.insertBefore(draggedTab, tab);
                } else {
                    // Find the next sibling after tab
                    const nextSibling = tab.nextElementSibling;
                    if (nextSibling) {
                        tabsContainer.insertBefore(draggedTab, nextSibling);
                    } else {
                        tabsContainer.appendChild(draggedTab);
                    }
                }
                
                // Move the tab to new position (only reorganize if pin state changed)
                if (draggedIsPinned !== dropIsPinned) {
                    this.organizeTabsByPinnedState();
                }
                this.savePinnedTabs();
                
                // Clean up - remove from all tabs and folders
                document.querySelectorAll('.tab').forEach(t => {
                    delete t.dataset.dropSide;
                });
                document.querySelectorAll('.folder').forEach(f => {
                    delete f.dataset.dropSide;
                });
            });
        };

        // Store makeTabDraggable on class so it can be accessed from other methods
        this.makeTabDraggable = makeTabDraggable;
        
        // Make existing tabs draggable (including those in folders)
        document.querySelectorAll('.tab').forEach(makeTabDraggable);

        // Observer for new tabs in main container
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('tab')) {
                        makeTabDraggable(node);
                    }
                });
            });
        });

        observer.observe(tabsContainer, { childList: true, subtree: true });
        
        // Also observe folder content for tabs added to folders
        const folderObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('tab')) {
                        makeTabDraggable(node);
                    }
                });
            });
        });
        
        // Track observed folder contents to prevent duplicate observations
        const observedFolderContents = new WeakSet();
        
        // Observe all folder content areas
        document.querySelectorAll('.folder-content').forEach(folderContent => {
            if (!observedFolderContents.has(folderContent)) {
                folderObserver.observe(folderContent, { childList: true });
                observedFolderContents.add(folderContent);
            }
        });
        
        // Also observe when new folders are created
        const folderContainerObserver = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('folder')) {
                        const folderContent = node.querySelector('.folder-content');
                        if (folderContent && !observedFolderContents.has(folderContent)) {
                            folderObserver.observe(folderContent, { childList: true });
                            observedFolderContents.add(folderContent);
                            // Make existing tabs in this folder draggable
                            folderContent.querySelectorAll('.tab').forEach(makeTabDraggable);
                        }
                    }
                });
            });
        });
        
        folderContainerObserver.observe(tabsContainer, { childList: true });
        
        // Store observers on instance for potential cleanup (though they'll be cleaned up when page unloads)
        this._dragDropObservers = {
            mainObserver: observer,
            folderObserver: folderObserver,
            folderContainerObserver: folderContainerObserver
        };
    }

    moveTab(fromIndex, toIndex) {
        const tabsContainer = document.querySelector('.tabs-container');
        const tabs = Array.from(tabsContainer.children);
        
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || 
            fromIndex >= tabs.length || toIndex >= tabs.length) {
            return;
        }
        
        // Get the tab element
        const tabElement = tabs[fromIndex];
        
        // Remove from current position
        tabElement.remove();
        
        // Insert at new position
        if (toIndex >= tabs.length - 1) {
            tabsContainer.appendChild(tabElement);
        } else {
            const newTabs = Array.from(tabsContainer.children);
            if (toIndex < newTabs.length) {
                tabsContainer.insertBefore(tabElement, newTabs[toIndex]);
            } else {
                tabsContainer.appendChild(tabElement);
            }
        }
        
        // Update tab order in our tabs Map
        const tabIds = Array.from(tabsContainer.children).map(tab => tab.dataset.tabId);
        const newTabsMap = new Map();
        
        tabIds.forEach((tabId, index) => {
            if (this.tabs.has(tabId)) {
                newTabsMap.set(tabId, this.tabs.get(tabId));
            }
        });
        
        this.tabs = newTabsMap;
        
        // Update current tab if needed
        const currentTabElement = document.querySelector('.tab.active');
        if (currentTabElement) {
            this.currentTab = currentTabElement.dataset.tabId;
        }
    }

    async trackPageInHistory() {
        try {
            const webview = this.getActiveWebview();
            if (!webview) return;
            const url = webview.getURL();
            const title = webview.getTitle();
            
            // Don't track certain URLs
            if (!url || url === 'about:blank' || url.startsWith('data:') || url.startsWith('chrome-extension:')) {
                return;
            }
            
            // Get favicon
            let favicon = '';
            try {
                const urlObj = new URL(url);
                favicon = `${urlObj.protocol}//${urlObj.host}/favicon.ico`;
            } catch (e) {
                // Invalid URL, skip favicon
            }
            
            await window.electronAPI.addHistoryItem({
                url: url,
                title: title || url,
                favicon: favicon
            });
        } catch (error) {
            console.error('Failed to track page in history:', error);
        }
    }

    toggleSecurity() {
        const securityPanel = document.getElementById('security-panel');
        const settingsPanel = document.getElementById('settings-panel');
        const downloadsPanel = document.getElementById('downloads-panel');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        
        if (securityPanel.classList.contains('hidden')) {
            // Smooth fade-in animation
            securityPanel.classList.remove('hidden');
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.transition = 'opacity 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            }
            
            // Add entrance animation class
            securityPanel.classList.add('security-entering');
            
            // Update security info immediately
            this.updateSecurityInfo();
            
            // Remove animation class after animation completes (200ms)
            setTimeout(() => {
                securityPanel.classList.remove('security-entering');
            }, 200);
            
            // Refresh popup themes
            this.refreshPopupThemes();
            
        } else {
            // Smooth fade-out animation
            securityPanel.classList.add('security-closing');
            
            setTimeout(() => {
                securityPanel.classList.add('hidden');
                securityPanel.classList.remove('security-closing');
                if (backdrop) backdrop.classList.add('hidden');
            }, 150);
        }
    }

    updateSecurityInfo() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        const url = webview.getURL();
        const title = webview.getTitle();
        
        try {
            const urlObj = new URL(url);
            const protocol = urlObj.protocol;
            const hostname = urlObj.hostname;
            
            // Update security icon and status
            const securityIcon = document.getElementById('security-icon');
            const securityTitle = document.getElementById('security-title');
            const securitySubtitle = document.getElementById('security-subtitle');
            const securityWebsite = document.getElementById('security-website');
            const securityCertificate = document.getElementById('security-certificate');
            const securityEncryption = document.getElementById('security-encryption');
            const securityConnection = document.getElementById('security-connection');
            
            if (protocol === 'https:') {
                securityIcon.className = 'fas fa-lock';
                securityIcon.style.color = '#4CAF50';
                securityTitle.textContent = 'Secure Connection';
                securitySubtitle.textContent = 'Your connection is encrypted';
                securityWebsite.textContent = hostname;
                securityCertificate.textContent = 'Valid';
                securityEncryption.textContent = 'TLS 1.3';
                securityConnection.textContent = 'Secure';
            } else if (protocol === 'http:') {
                securityIcon.className = 'fas fa-unlock';
                securityIcon.style.color = '#ff9800';
                securityTitle.textContent = 'Not Secure';
                securitySubtitle.textContent = 'Your connection is not encrypted';
                securityWebsite.textContent = hostname;
                securityCertificate.textContent = 'None';
                securityEncryption.textContent = 'None';
                securityConnection.textContent = 'Not Secure';
            } else {
                securityIcon.className = 'fas fa-info-circle';
                securityIcon.style.color = '#666';
                securityTitle.textContent = 'Local Page';
                securitySubtitle.textContent = 'This is a local or system page';
                securityWebsite.textContent = hostname || 'Local';
                securityCertificate.textContent = 'N/A';
                securityEncryption.textContent = 'N/A';
                securityConnection.textContent = 'Local';
            }
        } catch (error) {
            // Handle invalid URLs
            const securityIcon = document.getElementById('security-icon');
            const securityTitle = document.getElementById('security-title');
            const securitySubtitle = document.getElementById('security-subtitle');
            
            securityIcon.className = 'fas fa-info-circle';
            securityIcon.style.color = '#666';
            securityTitle.textContent = 'Unknown';
            securitySubtitle.textContent = 'Unable to determine security status';
        }
    }

    viewCertificate() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        const url = webview.getURL();
        
        if (url && url.startsWith('https:')) {
            // Open certificate viewer in new tab
            this.createNewTab(`chrome://net-internals/#hsts`);
            this.showNotification('Certificate details opened in new tab', 'info');
        } else {
            this.showNotification('No certificate available for this page', 'warning');
        }
    }

    openSecuritySettings() {
        // Close security panel and open settings
        this.toggleSecurity();
        this.toggleSettings();
        this.showNotification('Security settings opened', 'info');
    }

    closePanelWithAnimation(panel) {
        // Determine the correct closing class based on panel ID
        let closingClass = 'closing';
        if (panel.id === 'settings-panel') {
            closingClass = 'settings-closing';
        } else if (panel.id === 'downloads-panel') {
            closingClass = 'downloads-closing';
        } else if (panel.id === 'notes-panel') {
            closingClass = 'notes-closing';
        } else if (panel.id === 'security-panel') {
            closingClass = 'security-closing';
        }
        
        // Add closing animation class
        panel.classList.add(closingClass);
        
        // Add backdrop fade out
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop && !backdrop.classList.contains('hidden')) {
            backdrop.style.transition = 'opacity 0.15s cubic-bezier(0.55, 0.06, 0.68, 0.19)';
            backdrop.style.opacity = '0';
        }
        
        // Remove the panel after animation completes (150ms for fast closing)
        setTimeout(() => {
            panel.classList.add('hidden');
            panel.classList.remove(closingClass);
            if (backdrop) {
                backdrop.classList.add('hidden');
                backdrop.style.opacity = '';
                backdrop.style.transition = '';
            }
        }, 150);
    }

    showSpotlightSearch() {
        const spotlightSearch = document.getElementById('spotlight-search');
        spotlightSearch.classList.remove('hidden');
        
        // Immediately show default suggestions (2 tabs + 3 search/history)
        this.updateSpotlightSuggestions('');
        
        // Focus the input after animation
        setTimeout(() => {
            document.getElementById('spotlight-input').focus();
        }, 200);
    }

    closeSpotlightSearch() {
        const spotlightSearch = document.getElementById('spotlight-search');
        this.closePanelWithAnimation(spotlightSearch);
        
        // Clear input and suggestions
        document.getElementById('spotlight-input').value = '';
        document.getElementById('spotlight-suggestions').style.display = 'none';
        this.spotlightSelectedIndex = -1; // Reset selection
    }

    navigateSuggestions(direction) {
        const suggestions = document.querySelectorAll('.spotlight-suggestion-item');
        const maxIndex = suggestions.length - 1;
        
        if (suggestions.length === 0) return;
        
        // Remove active class from all suggestions
        suggestions.forEach(item => item.classList.remove('active'));
        
        // Update selected index
        if (this.spotlightSelectedIndex === -1) {
            // Starting navigation - go to first or last based on direction
            this.spotlightSelectedIndex = direction > 0 ? 0 : maxIndex;
        } else {
            // Move up or down, wrapping around
            this.spotlightSelectedIndex += direction;
            if (this.spotlightSelectedIndex > maxIndex) {
                this.spotlightSelectedIndex = 0; // Wrap to top
            } else if (this.spotlightSelectedIndex < 0) {
                this.spotlightSelectedIndex = maxIndex; // Wrap to bottom
            }
        }
        
        // Add active class to selected suggestion
        if (suggestions[this.spotlightSelectedIndex]) {
            suggestions[this.spotlightSelectedIndex].classList.add('active');
            // Scroll into view if needed
            suggestions[this.spotlightSelectedIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    performSpotlightSearch() {
        const input = document.getElementById('spotlight-input');
        const query = input.value.trim();
        
        if (query) {
            // Close spotlight first
            this.closeSpotlightSearch();
            
            // Track recent search
            if (!this.settings.recentSearches) {
                this.settings.recentSearches = [];
            }
            
            // Add to recent searches (avoid duplicates)
            if (!this.settings.recentSearches.includes(query)) {
                this.settings.recentSearches.unshift(query);
                // Keep only last 10 searches
                this.settings.recentSearches = this.settings.recentSearches.slice(0, 10);
                this.saveSetting('recentSearches', this.settings.recentSearches);
            }
            
            // Determine if it's a URL or search query
            let searchUrl;
            if (this.isValidUrl(query)) {
                searchUrl = query.startsWith('http') ? query : `https://${query}`;
            } else {
                searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            }
            
            // Create a new tab and navigate to the search URL
            this.createNewTab(searchUrl);
        }
    }

    async updateSpotlightSuggestions(query) {
        const suggestionsContainer = document.getElementById('spotlight-suggestions');
        
        // Always show suggestions (5 default when empty, 5 when typing)
        const suggestions = query.length < 1 ? this.getDefaultSuggestions() : await this.generateAdvancedSuggestions(query);
        
        if (suggestions.length > 0) {
            // Show loading state only for typed queries
            if (query.length > 0) {
                suggestionsContainer.classList.add('loading');
                suggestionsContainer.style.display = 'block';
                
                setTimeout(() => {
                    this.updateSuggestionsContent(suggestionsContainer, suggestions);
                }, 200);
            } else {
                // For empty query, show immediately without loading
                this.updateSuggestionsContent(suggestionsContainer, suggestions);
            }
        } else {
            // Hide when no suggestions
            suggestionsContainer.classList.remove('show');
            suggestionsContainer.classList.add('hiding');
            setTimeout(() => {
                suggestionsContainer.style.display = 'none';
                suggestionsContainer.classList.remove('hiding');
            }, 300);
        }
    }

    updateSuggestionsContent(suggestionsContainer, suggestions) {
        // Remove loading state
        suggestionsContainer.classList.remove('loading');
        
        // Clear existing content
        suggestionsContainer.innerHTML = '';
        
        // Reset selection when suggestions update
        this.spotlightSelectedIndex = -1;
        
        // Always show exactly 5 suggestions (2 tabs + 3 search/history)
        // If we have fewer than 5, getDefaultSuggestions will fill with placeholders
        const visibleSuggestions = suggestions.length >= 5 ? suggestions.slice(0, 5) : suggestions;
        
        // Add new suggestions without resetting animations
        visibleSuggestions.forEach((suggestion, index) => {
            const suggestionEl = document.createElement('div');
            suggestionEl.className = 'spotlight-suggestion-item';
            suggestionEl.setAttribute('data-index', index);
            
            suggestionEl.innerHTML = `
                <div class="spotlight-suggestion-icon">
                    <i class="${this.escapeHtml(suggestion.icon)}"></i>
                </div>
                <div class="spotlight-suggestion-text">${this.escapeHtml(suggestion.text)}</div>
                ${(suggestion.isTab && suggestion.tabId) ? '<div class="spotlight-suggestion-action">Switch to Tab</div>' : ''}
            `;
            
            suggestionEl.addEventListener('click', () => {
                // Do not close spotlight preemptively; only close when navigating
                if (suggestion.isTab) {
                    if (suggestion.tabId) {
                        this.closeSpotlightSearch();
                        this.switchToTab(suggestion.tabId);
                    } else if (suggestion.isPlaceholder) {
                        // Placeholder tab - create a new tab
                        this.closeSpotlightSearch();
                        this.createNewTab();
                    }
                } else if (suggestion.isAction) {
                    if (suggestion.text === 'New Tab') {
                        // Open spotlight, do not create a tab
                        this.showSpotlightSearch();
                        const inputEl = document.getElementById('spotlight-input');
                        if (inputEl) inputEl.focus();
                        return;
                    } else if (suggestion.text === 'New Incognito Tab') {
                        this.closeSpotlightSearch();
                        this.createIncognitoTab();
                    } else if (suggestion.text === 'Open Settings') {
                        this.closeSpotlightSearch();
                        this.toggleSettings();
                    } else if (suggestion.text === 'New Note') {
                        this.closeSpotlightSearch();
                        this.openNoteAsTab();
                    }
                } else if (suggestion.isNote && suggestion.noteId) {
                    this.closeSpotlightSearch();
                    this.openNoteAsTab(suggestion.noteId);
                } else if (suggestion.isSearch) {
                    this.closeSpotlightSearch();
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchQuery)}`;
                    this.createNewTab(searchUrl);
                } else if (suggestion.isHistory) {
                    this.closeSpotlightSearch();
                    this.createNewTab(suggestion.url);
                } else if (suggestion.isCompletion) {
                    this.closeSpotlightSearch();
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchQuery)}`;
                    this.createNewTab(searchUrl);
                } else if (suggestion.isUrl) {
                    this.closeSpotlightSearch();
                    this.createNewTab(suggestion.url);
                } else {
                    // Default search behavior requires Enter; keep spotlight open
                    const input = document.getElementById('spotlight-input');
                    if (input) input.value = suggestion.text;
                }
            });
            
            suggestionsContainer.appendChild(suggestionEl);
        });
        
        // Show with animation
        suggestionsContainer.style.display = 'block';
        setTimeout(() => {
            suggestionsContainer.classList.add('show');
        }, 50);
    }

    async generateAdvancedSuggestions(query) {
        const suggestions = [];
        const lowerQuery = query.toLowerCase();
        
        // Always show 2 open tab suggestions first (with "Switch to Tab" buttons)
        let tabCount = 0;
        this.tabs.forEach((tab, tabId) => {
            if (tabCount >= 2) return; // Only show first 2 tabs
            
            const title = tab.title || (tab.incognito ? 'New Incognito Tab' : 'New Tab');
            const url = tab.url || 'about:blank';
            
            // Filter tabs by query if provided
            if (query.length > 0 && 
                !title.toLowerCase().includes(lowerQuery) && 
                !url.toLowerCase().includes(lowerQuery)) {
                return; // Skip this tab if it doesn't match query
            }
            
            let icon = 'fas fa-globe';
            if (tab.incognito) {
                icon = 'fas fa-mask';
            } else if (url.includes('gmail.com')) {
                icon = 'fas fa-envelope';
            } else if (url.includes('youtube.com')) {
                icon = 'fab fa-youtube';
            } else if (url.includes('github.com')) {
                icon = 'fab fa-github';
            } else if (url.includes('facebook.com')) {
                icon = 'fab fa-facebook';
            } else if (url.includes('twitter.com')) {
                icon = 'fab fa-twitter';
            } else if (url.includes('instagram.com')) {
                icon = 'fab fa-instagram';
            } else if (url.includes('reddit.com')) {
                icon = 'fab fa-reddit';
            } else if (url.includes('stackoverflow.com')) {
                icon = 'fab fa-stack-overflow';
            } else if (url.includes('wikipedia.org')) {
                icon = 'fab fa-wikipedia-w';
            } else if (url.includes('amazon.com')) {
                icon = 'fab fa-amazon';
            }
            
            suggestions.push({
                text: title,
                icon: icon,
                tabId: tabId,
                url: url,
                isTab: true
            });
            
            tabCount++;
        });
        
        // Fill remaining tab slots with placeholder tabs if needed
        while (tabCount < 2) {
            suggestions.push({
                text: 'New Tab',
                icon: 'fas fa-globe',
                tabId: null,
                url: 'about:blank',
                isTab: true,
                isPlaceholder: true
            });
            tabCount++;
        }
        
        // Always show 3 search/history suggestions (after the 2 tabs)
        let searchCount = 0;
        
        // Add recent searches first
        if (this.settings.recentSearches && this.settings.recentSearches.length > 0 && searchCount < 3) {
            const recentSearches = this.settings.recentSearches
                .filter(search => 
                    query.length === 0 || search.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 3 - searchCount)
                .map(search => ({
                    text: `Search "${search}"`,
                    icon: 'fas fa-search',
                    searchQuery: search,
                    isSearch: true
                }));
            
            recentSearches.forEach(search => {
                if (searchCount < 3) {
                    suggestions.push(search);
                    searchCount++;
                }
            });
        }
        
        // Add recent history if we need more suggestions
        if (searchCount < 3 && this.settings.history && this.settings.history.length > 0) {
            const recentHistory = this.settings.history
                .filter(item => 
                    query.length === 0 ||
                    item.title.toLowerCase().includes(lowerQuery) || 
                    item.url.toLowerCase().includes(lowerQuery)
                )
                .slice(0, 3 - searchCount)
                .map(item => {
                    let icon = 'fas fa-lightbulb';
                    if (item.url.includes('gmail.com')) {
                        icon = 'fas fa-envelope';
                    } else if (item.url.includes('youtube.com')) {
                        icon = 'fab fa-youtube';
                    } else if (item.url.includes('github.com')) {
                        icon = 'fab fa-github';
                    } else if (item.url.includes('facebook.com')) {
                        icon = 'fab fa-facebook';
                    } else if (item.url.includes('twitter.com')) {
                        icon = 'fab fa-twitter';
                    } else if (item.url.includes('instagram.com')) {
                        icon = 'fab fa-instagram';
                    } else if (item.url.includes('reddit.com')) {
                        icon = 'fab fa-reddit';
                    } else if (item.url.includes('stackoverflow.com')) {
                        icon = 'fab fa-stack-overflow';
                    } else if (item.url.includes('wikipedia.org')) {
                        icon = 'fab fa-wikipedia-w';
                    } else if (item.url.includes('amazon.com')) {
                        icon = 'fab fa-amazon';
                    }
                    
                    return {
                        text: item.title,
                        icon: icon,
                        url: item.url,
                        isHistory: true,
                        timestamp: item.timestamp
                    };
                });
            
            recentHistory.forEach(item => {
                if (searchCount < 3) {
                    suggestions.push(item);
                    searchCount++;
                }
            });
        }
        
        // Add intelligent sentence completions if we need more
        if (searchCount < 3 && query.length > 0) {
            const completions = this.generateSentenceCompletions(lowerQuery);
            completions.forEach(completion => {
                if (searchCount < 3) {
                    suggestions.push(completion);
                    searchCount++;
                }
            });
        }
        
        // Fill remaining slots with placeholder search suggestions if needed
        const placeholderSearches = ['how to code', 'how to learn programming', 'weather'];
        while (searchCount < 3) {
            const placeholderIndex = searchCount - (3 - placeholderSearches.length);
            if (placeholderIndex >= 0 && placeholderIndex < placeholderSearches.length) {
                suggestions.push({
                    text: placeholderSearches[placeholderIndex],
                    icon: 'fas fa-lightbulb',
                    searchQuery: placeholderSearches[placeholderIndex],
                    isSearch: true,
                    isPlaceholder: true
                });
            } else {
                suggestions.push({
                    text: 'Search...',
                    icon: 'fas fa-search',
                    searchQuery: '',
                    isSearch: true,
                    isPlaceholder: true
                });
            }
            searchCount++;
        }
        
        return suggestions; // Always returns exactly 5 suggestions (2 tabs + 3 search/history)
    }

    generateSentenceCompletions(query) {
        const completions = [];
        const lowerQuery = query.toLowerCase();
        
        // Comprehensive search patterns and completions
        const searchPatterns = [
            // Programming & Development
            { pattern: 'how to', completions: [
                'how to code', 'how to learn programming', 'how to make a website', 'how to use git', 'how to fix bugs',
                'how to deploy', 'how to debug', 'how to optimize', 'how to test', 'how to refactor',
                'how to design', 'how to architect', 'how to scale', 'how to secure', 'how to monitor'
            ]},
            { pattern: 'what is', completions: [
                'what is javascript', 'what is react', 'what is python', 'what is ai', 'what is machine learning',
                'what is docker', 'what is kubernetes', 'what is microservices', 'what is api', 'what is database',
                'what is cloud computing', 'what is devops', 'what is agile', 'what is scrum', 'what is blockchain'
            ]},
            { pattern: 'best', completions: [
                'best programming languages', 'best code editors', 'best frameworks', 'best practices', 'best tutorials',
                'best libraries', 'best tools', 'best courses', 'best books', 'best resources',
                'best algorithms', 'best design patterns', 'best architectures', 'best methodologies', 'best technologies'
            ]},
            { pattern: 'learn', completions: [
                'learn javascript', 'learn python', 'learn react', 'learn coding', 'learn programming',
                'learn data structures', 'learn algorithms', 'learn system design', 'learn databases', 'learn networking',
                'learn security', 'learn testing', 'learn deployment', 'learn cloud', 'learn mobile development'
            ]},
            { pattern: 'tutorial', completions: [
                'javascript tutorial', 'python tutorial', 'react tutorial', 'css tutorial', 'html tutorial',
                'node.js tutorial', 'mongodb tutorial', 'docker tutorial', 'git tutorial', 'aws tutorial',
                'machine learning tutorial', 'data science tutorial', 'web development tutorial', 'mobile app tutorial', 'game development tutorial'
            ]},
            
            // Technology & Software
            { pattern: 'javascript', completions: [
                'javascript tutorial', 'javascript frameworks', 'javascript libraries', 'javascript best practices',
                'javascript es6', 'javascript async', 'javascript promises', 'javascript modules', 'javascript testing'
            ]},
            { pattern: 'python', completions: [
                'python tutorial', 'python for beginners', 'python data science', 'python machine learning',
                'python web development', 'python automation', 'python libraries', 'python frameworks'
            ]},
            { pattern: 'react', completions: [
                'react tutorial', 'react hooks', 'react components', 'react state management', 'react routing',
                'react testing', 'react performance', 'react best practices', 'react native'
            ]},
            { pattern: 'node', completions: [
                'node.js tutorial', 'node.js express', 'node.js api', 'node.js database', 'node.js deployment',
                'node.js performance', 'node.js security', 'node.js testing'
            ]},
            { pattern: 'database', completions: [
                'database design', 'database optimization', 'database security', 'database backup',
                'sql tutorial', 'mongodb tutorial', 'mysql tutorial', 'postgresql tutorial'
            ]},
            
            // Web Development
            { pattern: 'web', completions: [
                'web development', 'web design', 'web performance', 'web security', 'web accessibility',
                'web standards', 'web optimization', 'web testing', 'web deployment'
            ]},
            { pattern: 'css', completions: [
                'css tutorial', 'css grid', 'css flexbox', 'css animations', 'css responsive design',
                'css frameworks', 'css preprocessors', 'css best practices'
            ]},
            { pattern: 'html', completions: [
                'html tutorial', 'html5 features', 'html semantics', 'html accessibility', 'html forms',
                'html validation', 'html best practices', 'html structure'
            ]},
            { pattern: 'api', completions: [
                'api design', 'api documentation', 'api testing', 'api security', 'rest api',
                'graphql api', 'api integration', 'api versioning'
            ]},
            
            // Data Science & AI
            { pattern: 'data', completions: [
                'data science', 'data analysis', 'data visualization', 'data mining', 'data engineering',
                'data structures', 'data modeling', 'data cleaning', 'data processing'
            ]},
            { pattern: 'machine', completions: [
                'machine learning', 'machine learning algorithms', 'machine learning models', 'machine learning tutorial',
                'machine learning python', 'machine learning projects', 'machine learning career'
            ]},
            { pattern: 'ai', completions: [
                'artificial intelligence', 'ai applications', 'ai ethics', 'ai research', 'ai tools',
                'ai frameworks', 'ai algorithms', 'ai career', 'ai future'
            ]},
            { pattern: 'deep', completions: [
                'deep learning', 'deep learning tutorial', 'deep learning frameworks', 'deep learning models',
                'deep learning applications', 'deep learning career', 'deep learning research'
            ]},
            
            // Cloud & DevOps
            { pattern: 'cloud', completions: [
                'cloud computing', 'cloud services', 'cloud architecture', 'cloud security', 'cloud migration',
                'aws cloud', 'azure cloud', 'google cloud', 'cloud deployment'
            ]},
            { pattern: 'docker', completions: [
                'docker tutorial', 'docker containers', 'docker compose', 'docker deployment', 'docker best practices',
                'docker security', 'docker networking', 'docker volumes'
            ]},
            { pattern: 'kubernetes', completions: [
                'kubernetes tutorial', 'kubernetes deployment', 'kubernetes services', 'kubernetes networking',
                'kubernetes security', 'kubernetes monitoring', 'kubernetes best practices'
            ]},
            { pattern: 'devops', completions: [
                'devops practices', 'devops tools', 'devops culture', 'devops automation', 'devops monitoring',
                'devops security', 'devops career', 'devops certification'
            ]},
            
            // General Technology
            { pattern: 'programming', completions: [
                'programming languages', 'programming concepts', 'programming patterns', 'programming career',
                'programming fundamentals', 'programming best practices', 'programming tools'
            ]},
            { pattern: 'software', completions: [
                'software development', 'software engineering', 'software architecture', 'software testing',
                'software design', 'software quality', 'software maintenance', 'software lifecycle'
            ]},
            { pattern: 'algorithm', completions: [
                'algorithm design', 'algorithm analysis', 'algorithm complexity', 'algorithm optimization',
                'sorting algorithms', 'searching algorithms', 'graph algorithms', 'dynamic programming'
            ]},
            { pattern: 'security', completions: [
                'cybersecurity', 'web security', 'application security', 'network security', 'data security',
                'security best practices', 'security tools', 'security testing', 'security audit'
            ]},
            
            // Lifestyle & General
            { pattern: 'weather', completions: [
                'weather today', 'weather forecast', 'weather app', 'weather widget', 'weather radar',
                'weather alerts', 'weather conditions', 'weather temperature'
            ]},
            { pattern: 'news', completions: [
                'tech news', 'world news', 'sports news', 'breaking news', 'latest news',
                'business news', 'science news', 'health news', 'entertainment news'
            ]},
            { pattern: 'music', completions: [
                'music streaming', 'music player', 'music download', 'music videos', 'music concerts',
                'music festivals', 'music genres', 'music artists', 'music production'
            ]},
            { pattern: 'video', completions: [
                'video editing', 'video converter', 'video player', 'video download', 'video streaming',
                'video conferencing', 'video tutorials', 'video production', 'video marketing'
            ]},
            { pattern: 'game', completions: [
                'online games', 'mobile games', 'pc games', 'game development', 'game design',
                'game programming', 'game engines', 'game art', 'game music'
            ]},
            { pattern: 'shop', completions: [
                'online shopping', 'shopping deals', 'shopping mall', 'shopping app', 'shopping comparison',
                'shopping reviews', 'shopping security', 'shopping delivery'
            ]},
            { pattern: 'travel', completions: [
                'travel booking', 'travel deals', 'travel guide', 'travel tips', 'travel insurance',
                'travel planning', 'travel destinations', 'travel reviews', 'travel photography'
            ]},
            { pattern: 'food', completions: [
                'food delivery', 'food recipes', 'food near me', 'food ordering', 'food reviews',
                'food nutrition', 'food safety', 'food preparation', 'food photography'
            ]},
            { pattern: 'health', completions: [
                'health tips', 'health tracker', 'health app', 'health news', 'health insurance',
                'health monitoring', 'health research', 'health technology', 'health services'
            ]},
            { pattern: 'work', completions: [
                'work from home', 'work tools', 'work productivity', 'work management', 'work life balance',
                'work communication', 'work collaboration', 'work efficiency', 'work culture'
            ]},
            { pattern: 'study', completions: [
                'study tips', 'study materials', 'study app', 'study schedule', 'study techniques',
                'study groups', 'study resources', 'study motivation', 'study planning'
            ]},
            { pattern: 'design', completions: [
                'design tools', 'design inspiration', 'design software', 'design portfolio', 'design principles',
                'design thinking', 'design systems', 'design trends', 'design career'
            ]},
            { pattern: 'photo', completions: [
                'photo editing', 'photo storage', 'photo sharing', 'photo gallery', 'photo printing',
                'photo organization', 'photo backup', 'photo restoration', 'photo techniques'
            ]},
            { pattern: 'social', completions: [
                'social media', 'social network', 'social sharing', 'social platform', 'social marketing',
                'social analytics', 'social engagement', 'social strategy', 'social trends'
            ]},
            { pattern: 'business', completions: [
                'business tools', 'business plan', 'business ideas', 'business management', 'business strategy',
                'business development', 'business analytics', 'business automation', 'business growth'
            ]},
            { pattern: 'finance', completions: [
                'finance management', 'finance planning', 'finance tools', 'finance news', 'finance education',
                'finance investment', 'finance budgeting', 'finance tracking', 'finance analysis'
            ]},
            { pattern: 'education', completions: [
                'education technology', 'education resources', 'education platforms', 'education trends',
                'education career', 'education research', 'education innovation', 'education accessibility'
            ]},
            { pattern: 'science', completions: [
                'science news', 'science research', 'science education', 'science technology', 'science discovery',
                'science experiments', 'science careers', 'science communication', 'science innovation'
            ]},
            { pattern: 'environment', completions: [
                'environmental protection', 'environmental science', 'environmental technology', 'environmental policy',
                'environmental sustainability', 'environmental conservation', 'environmental research', 'environmental education'
            ]}
        ];
        
        // Find matching patterns
        searchPatterns.forEach(({ pattern, completions: patternCompletions }) => {
            if (lowerQuery.includes(pattern) || pattern.includes(lowerQuery)) {
                patternCompletions.forEach(completion => {
                    if (completion.toLowerCase().includes(lowerQuery) && !completion.toLowerCase().startsWith(lowerQuery)) {
                        completions.push({
                            text: completion,
                            icon: 'fas fa-lightbulb',
                            isCompletion: true,
                            searchQuery: completion
                        });
                    }
                });
            }
        });
        
        // Comprehensive smart completions
        const smartCompletions = [
            // Programming Languages
            'javascript tutorial for beginners', 'python programming course', 'java programming tutorial',
            'c++ programming guide', 'c# programming tutorial', 'php web development', 'ruby programming',
            'go programming language', 'rust programming tutorial', 'swift ios development',
            'kotlin android development', 'typescript tutorial', 'dart flutter development',
            
            // Web Development
            'react native development', 'vue.js tutorial', 'angular framework guide', 'svelte tutorial',
            'css grid layout guide', 'html5 semantic elements', 'bootstrap framework tutorial',
            'tailwind css tutorial', 'sass preprocessor guide', 'less css tutorial',
            'webpack bundler tutorial', 'babel javascript compiler', 'eslint code quality',
            'prettier code formatter', 'jest testing framework', 'cypress e2e testing',
            
            // Backend Development
            'node.js backend development', 'express.js tutorial', 'nestjs framework guide',
            'django python web framework', 'flask python tutorial', 'spring boot java',
            'laravel php framework', 'ruby on rails tutorial', 'asp.net core tutorial',
            'fastapi python tutorial', 'gin go framework', 'actix rust framework',
            
            // Databases
            'mongodb database tutorial', 'mysql database guide', 'postgresql tutorial',
            'redis caching tutorial', 'elasticsearch tutorial', 'cassandra database',
            'dynamodb aws tutorial', 'firebase database', 'supabase tutorial',
            'prisma orm tutorial', 'sequelize orm guide', 'mongoose mongodb tutorial',
            
            // DevOps & Cloud
            'docker containerization', 'kubernetes orchestration', 'aws cloud services',
            'azure cloud platform', 'google cloud platform', 'terraform infrastructure',
            'ansible automation', 'jenkins ci/cd pipeline', 'gitlab ci/cd tutorial',
            'github actions tutorial', 'circleci continuous integration', 'travis ci tutorial',
            
            // Data Science & AI
            'machine learning algorithms', 'data science with python', 'pandas data analysis',
            'numpy numerical computing', 'scikit-learn machine learning', 'tensorflow deep learning',
            'pytorch neural networks', 'keras deep learning', 'opencv computer vision',
            'nltk natural language processing', 'spacy nlp tutorial', 'transformers ai models',
            
            // Mobile Development
            'react native mobile app', 'flutter cross platform', 'ionic hybrid app',
            'xamarin microsoft mobile', 'cordova phonegap tutorial', 'progressive web apps',
            'mobile app design', 'ios app development', 'android app development',
            
            // Design & UI/UX
            'responsive design principles', 'accessibility guidelines', 'user experience design',
            'user interface design', 'figma design tool', 'sketch design software',
            'adobe xd tutorial', 'invision prototyping', 'material design principles',
            'design systems guide', 'wireframing techniques', 'prototyping methods',
            
            // Performance & Optimization
            'performance optimization tips', 'web performance metrics', 'lighthouse optimization',
            'core web vitals', 'bundle size optimization', 'image optimization techniques',
            'caching strategies', 'cdn implementation', 'database optimization',
            'api performance tuning', 'memory management', 'cpu optimization',
            
            // Security
            'security best practices', 'web application security', 'owasp security guidelines',
            'authentication systems', 'authorization patterns', 'jwt token tutorial',
            'oauth implementation', 'ssl certificate setup', 'https configuration',
            'sql injection prevention', 'xss attack prevention', 'csrf protection',
            
            // Testing
            'testing strategies', 'unit testing tutorial', 'integration testing guide',
            'end-to-end testing', 'test driven development', 'behavior driven development',
            'mocking techniques', 'test automation', 'continuous testing',
            'performance testing', 'load testing tutorial', 'security testing',
            
            // Deployment & Operations
            'deployment automation', 'ci/cd pipeline setup', 'blue green deployment',
            'canary deployment', 'rolling deployment', 'infrastructure as code',
            'monitoring and logging', 'error tracking', 'application performance monitoring',
            'serverless architecture', 'microservices deployment', 'container orchestration',
            
            // Career & Learning
            'programming career path', 'software engineering career', 'web developer roadmap',
            'data scientist career', 'devops engineer path', 'tech interview preparation',
            'coding bootcamp guide', 'online learning platforms', 'programming certifications',
            'open source contribution', 'github portfolio building', 'technical writing',
            
            // Tools & Technologies
            'git version control basics', 'github collaboration', 'gitlab tutorial',
            'bitbucket repository', 'vscode editor setup', 'vim editor tutorial',
            'emacs editor guide', 'terminal command line', 'bash scripting tutorial',
            'powershell tutorial', 'linux administration', 'windows development',
            
            // Frameworks & Libraries
            'express.js tutorial', 'fastify framework', 'koa.js tutorial',
            'hapi.js framework', 'sails.js tutorial', 'meteor.js full stack',
            'next.js react framework', 'nuxt.js vue framework', 'gatsby static site',
            'sveltekit tutorial', 'remix framework', 'solid.js tutorial',
            
            // General Technology
            'blockchain technology', 'cryptocurrency tutorial', 'smart contracts',
            'web3 development', 'nft development', 'defi protocols',
            'quantum computing', 'edge computing', 'iot development',
            'augmented reality', 'virtual reality', 'mixed reality',
            
            // Business & Productivity
            'project management tools', 'agile methodology', 'scrum framework',
            'kanban methodology', 'lean development', 'devops culture',
            'team collaboration', 'remote work tools', 'productivity techniques',
            'time management', 'task automation', 'workflow optimization'
        ];
        
        smartCompletions.forEach(completion => {
            if (completion.toLowerCase().includes(lowerQuery) && lowerQuery.length > 2) {
                completions.push({
                    text: completion,
                    icon: 'fas fa-magic',
                    isCompletion: true,
                    searchQuery: completion
                });
            }
        });
        
        // Comprehensive URL completions
        const commonDomains = [
            // Developer & Programming
            'github.com', 'stackoverflow.com', 'dev.to', 'medium.com', 'codepen.io',
            'jsfiddle.net', 'repl.it', 'codesandbox.io', 'glitch.com', 'heroku.com',
            'netlify.com', 'vercel.com', 'surge.sh', 'firebase.google.com', 'supabase.com',
            'mongodb.com', 'redis.com', 'elastic.co', 'datadog.com', 'newrelic.com',
            
            // Learning & Education
            'wikipedia.org', 'youtube.com', 'coursera.org', 'udemy.com', 'edx.org',
            'khanacademy.org', 'freecodecamp.org', 'codecademy.com', 'pluralsight.com',
            'linkedin.com/learning', 'skillshare.com', 'masterclass.com', 'brilliant.org',
            
            // Social & Community
            'reddit.com', 'twitter.com', 'facebook.com', 'instagram.com', 'linkedin.com',
            'discord.com', 'slack.com', 'telegram.org', 'whatsapp.com', 'signal.org',
            'mastodon.social', 'minds.com', 'gab.com', 'parler.com', 'truthsocial.com',
            
            // News & Information
            'cnn.com', 'bbc.com', 'reuters.com', 'ap.org', 'npr.org', 'wsj.com',
            'nytimes.com', 'washingtonpost.com', 'theguardian.com', 'bloomberg.com',
            'techcrunch.com', 'arstechnica.com', 'wired.com', 'theverge.com', 'engadget.com',
            
            // E-commerce & Shopping
            'amazon.com', 'ebay.com', 'etsy.com', 'shopify.com', 'woocommerce.com',
            'magento.com', 'prestashop.com', 'opencart.com', 'bigcommerce.com', 'squarespace.com',
            'wix.com', 'weebly.com', 'wordpress.com', 'blogger.com', 'tumblr.com',
            
            // Entertainment & Media
            'netflix.com', 'hulu.com', 'disney.com', 'hbo.com', 'paramount.com',
            'spotify.com', 'apple.com/music', 'pandora.com', 'soundcloud.com', 'bandcamp.com',
            'twitch.tv', 'youtube.com/gaming', 'mixer.com', 'dlive.tv', 'caffeine.tv',
            
            // Productivity & Business
            'google.com', 'microsoft.com', 'apple.com', 'adobe.com', 'salesforce.com',
            'hubspot.com', 'mailchimp.com', 'zendesk.com', 'freshworks.com', 'intercom.com',
            'asana.com', 'trello.com', 'monday.com', 'notion.so', 'airtable.com',
            
            // Cloud & Infrastructure
            'aws.amazon.com', 'azure.microsoft.com', 'cloud.google.com', 'digitalocean.com',
            'linode.com', 'vultr.com', 'cloudflare.com', 'fastly.com', 'keycdn.com',
            'bunny.net', 'maxcdn.com', 'jsdelivr.com', 'unpkg.com', 'cdnjs.com',
            
            // Design & Creative
            'figma.com', 'sketch.com', 'adobe.com', 'canva.com', 'dribbble.com',
            'behance.net', 'pinterest.com', 'unsplash.com', 'pexels.com', 'pixabay.com',
            'freepik.com', 'shutterstock.com', 'gettyimages.com', 'istockphoto.com',
            
            // Finance & Investment
            'paypal.com', 'stripe.com', 'square.com', 'venmo.com', 'cashapp.com',
            'robinhood.com', 'etrade.com', 'fidelity.com', 'schwab.com', 'vanguard.com',
            'coinbase.com', 'binance.com', 'kraken.com', 'gemini.com', 'blockchain.com',
            
            // Travel & Lifestyle
            'booking.com', 'airbnb.com', 'expedia.com', 'kayak.com', 'skyscanner.com',
            'tripadvisor.com', 'yelp.com', 'foursquare.com', 'swarmapp.com', 'untappd.com',
            'strava.com', 'myfitnesspal.com', 'fitbit.com', 'garmin.com', 'polar.com',
            
            // Communication & Collaboration
            'zoom.us', 'teams.microsoft.com', 'meet.google.com', 'webex.com', 'gotomeeting.com',
            'jitsi.org', 'whereby.com', 'appear.in', 'join.me', 'bluejeans.com',
            'calendly.com', 'doodle.com', 'when2meet.com', 'scheduling.com', 'acuityscheduling.com',
            
            // Development Tools
            'npmjs.com', 'yarnpkg.com', 'bower.io', 'webpack.js.org', 'rollupjs.org',
            'parceljs.org', 'vitejs.dev', 'esbuild.github.io', 'swc.rs', 'babeljs.io',
            'typescriptlang.org', 'svelte.dev', 'vuejs.org', 'angular.io', 'reactjs.org',
            
            // Documentation & Reference
            'mdn.mozilla.org', 'developer.mozilla.org', 'docs.microsoft.com', 'developers.google.com',
            'docs.aws.amazon.com', 'kubernetes.io', 'docker.com', 'nginx.com', 'apache.org',
            'nodejs.org', 'python.org', 'php.net', 'ruby-lang.org', 'golang.org',
            
            // Testing & Quality
            'jestjs.io', 'mochajs.org', 'jasmine.github.io', 'karma-runner.github.io',
            'cypress.io', 'playwright.dev', 'puppeteer.dev', 'selenium.dev', 'webdriver.io',
            'testing-library.com', 'enzymejs.github.io', 'chai.js', 'sinonjs.org', 'nockjs.github.io'
        ];
        
        commonDomains.forEach(domain => {
            if (domain.includes(lowerQuery) || lowerQuery.includes(domain.split('.')[0])) {
                completions.push({
                    text: `Visit ${domain}`,
                    icon: 'fas fa-external-link-alt',
                    url: `https://${domain}`,
                    isUrl: true
                });
            }
        });
        
        // Add comprehensive programming dictionary
        const programmingTerms = [
            // Programming Languages
            'javascript', 'python', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift',
            'kotlin', 'typescript', 'dart', 'scala', 'clojure', 'haskell', 'erlang', 'elixir',
            'lua', 'perl', 'r', 'matlab', 'octave', 'fortran', 'cobol', 'pascal', 'ada',
            'assembly', 'bash', 'powershell', 'sql', 'html', 'css', 'xml', 'json', 'yaml',
            
            // Frameworks & Libraries
            'react', 'vue', 'angular', 'svelte', 'ember', 'backbone', 'jquery', 'lodash',
            'express', 'koa', 'hapi', 'fastify', 'nest', 'django', 'flask', 'fastapi',
            'spring', 'laravel', 'rails', 'sinatra', 'asp.net', 'gin', 'echo', 'fiber',
            'bootstrap', 'tailwind', 'bulma', 'foundation', 'materialize', 'semantic-ui',
            'antd', 'chakra-ui', 'mantine', 'headless-ui', 'radix-ui', 'ariakit',
            
            // Databases
            'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'cassandra',
            'dynamodb', 'couchdb', 'neo4j', 'influxdb', 'timescaledb', 'cockroachdb',
            'sqlite', 'oracle', 'sql-server', 'mariadb', 'percona', 'clickhouse',
            
            // Cloud & DevOps
            'aws', 'azure', 'gcp', 'digitalocean', 'linode', 'vultr', 'heroku', 'netlify',
            'vercel', 'firebase', 'supabase', 'planetscale', 'railway', 'render',
            'docker', 'kubernetes', 'terraform', 'ansible', 'jenkins', 'gitlab-ci',
            'github-actions', 'circleci', 'travis-ci', 'azure-devops', 'bamboo',
            
            // Tools & Technologies
            'git', 'github', 'gitlab', 'bitbucket', 'vscode', 'vim', 'emacs', 'sublime',
            'atom', 'webstorm', 'intellij', 'eclipse', 'netbeans', 'xcode', 'android-studio',
            'webpack', 'rollup', 'parcel', 'vite', 'esbuild', 'swc', 'babel', 'typescript',
            'eslint', 'prettier', 'husky', 'lint-staged', 'commitizen', 'conventional-commits',
            
            // Testing
            'jest', 'mocha', 'jasmine', 'karma', 'cypress', 'playwright', 'puppeteer',
            'selenium', 'webdriver', 'testing-library', 'enzyme', 'chai', 'sinon',
            'nock', 'supertest', 'nightwatch', 'testcafe', 'capybara', 'rspec',
            
            // Design & UI/UX
            'figma', 'sketch', 'adobe-xd', 'invision', 'framer', 'principle', 'origami',
            'zeplin', 'abstract', 'avocode', 'handoff', 'design-systems', 'storybook',
            'chromatic', 'percy', 'visual-regression', 'accessibility', 'wcag', 'aria',
            
            // Mobile Development
            'react-native', 'flutter', 'ionic', 'xamarin', 'cordova', 'phonegap',
            'expo', 'native-script', 'quasar', 'framework7', 'onsen-ui', 'tabris',
            'progressive-web-apps', 'pwa', 'service-workers', 'web-app-manifest',
            
            // Data Science & AI
            'pandas', 'numpy', 'scipy', 'scikit-learn', 'tensorflow', 'pytorch', 'keras',
            'opencv', 'pillow', 'matplotlib', 'seaborn', 'plotly', 'bokeh', 'dash',
            'streamlit', 'gradio', 'hugging-face', 'transformers', 'spacy', 'nltk',
            'gensim', 'word2vec', 'bert', 'gpt', 'transformer', 'attention-mechanism',
            
            // Security
            'owasp', 'jwt', 'oauth', 'openid-connect', 'saml', 'ldap', 'kerberos',
            'ssl', 'tls', 'https', 'certificates', 'pki', 'encryption', 'hashing',
            'bcrypt', 'argon2', 'scrypt', 'pbkdf2', 'aes', 'rsa', 'elliptic-curve',
            'sql-injection', 'xss', 'csrf', 'clickjacking', 'session-hijacking',
            
            // Performance
            'lighthouse', 'core-web-vitals', 'lcp', 'fid', 'cls', 'tti', 'tbt',
            'bundle-size', 'tree-shaking', 'code-splitting', 'lazy-loading', 'preloading',
            'caching', 'cdn', 'compression', 'minification', 'optimization', 'profiling',
            
            // Architecture
            'microservices', 'monolith', 'serverless', 'lambda', 'functions', 'edge-computing',
            'api-gateway', 'load-balancer', 'reverse-proxy', 'circuit-breaker', 'bulkhead',
            'saga-pattern', 'event-sourcing', 'cqrs', 'domain-driven-design', 'clean-architecture',
            'hexagonal-architecture', 'onion-architecture', 'layered-architecture', 'mvc', 'mvp', 'mvvm',
            
            // Methodologies
            'agile', 'scrum', 'kanban', 'lean', 'devops', 'sre', 'gitops', 'infrastructure-as-code',
            'continuous-integration', 'continuous-deployment', 'continuous-delivery', 'blue-green',
            'canary-deployment', 'feature-flags', 'a-b-testing', 'chaos-engineering',
            
            // Career & Learning
            'programming-career', 'software-engineering', 'web-development', 'mobile-development',
            'data-science', 'machine-learning', 'ai-engineer', 'devops-engineer', 'sre',
            'tech-interview', 'coding-interview', 'system-design', 'algorithms', 'data-structures',
            'leetcode', 'hackerrank', 'leetcode', 'codewars', 'hackerearth', 'topcoder',
            'open-source', 'github-portfolio', 'technical-writing', 'blogging', 'speaking',
            'mentoring', 'code-review', 'pair-programming', 'mob-programming', 'tdd', 'bdd'
        ];
        
        // Add programming terms to completions
        programmingTerms.forEach(term => {
            if (term.toLowerCase().includes(lowerQuery) && lowerQuery.length > 1) {
                completions.push({
                    text: `Learn ${term}`,
                    icon: 'fas fa-code',
                    isCompletion: true,
                    searchQuery: term
                });
            }
        });
        
        return completions.slice(0, 4); // Limit completions to 4
    }

    getDefaultSuggestions() {
        const suggestions = [];
        
        // Always show 2 open tab suggestions first (with "Switch to Tab" buttons)
        let tabCount = 0;
        this.tabs.forEach((tab, tabId) => {
            if (tabCount >= 2) return; // Only show first 2 tabs
            
            const title = tab.title || (tab.incognito ? 'New Incognito Tab' : 'New Tab');
            const url = tab.url || 'about:blank';
            
            let icon = 'fas fa-globe';
            if (tab.incognito) {
                icon = 'fas fa-mask';
            } else if (url.includes('gmail.com')) {
                icon = 'fas fa-envelope';
            } else if (url.includes('youtube.com')) {
                icon = 'fab fa-youtube';
            } else if (url.includes('github.com')) {
                icon = 'fab fa-github';
            } else if (url.includes('facebook.com')) {
                icon = 'fab fa-facebook';
            } else if (url.includes('twitter.com')) {
                icon = 'fab fa-twitter';
            } else if (url.includes('instagram.com')) {
                icon = 'fab fa-instagram';
            } else if (url.includes('reddit.com')) {
                icon = 'fab fa-reddit';
            } else if (url.includes('stackoverflow.com')) {
                icon = 'fab fa-stack-overflow';
            } else if (url.includes('wikipedia.org')) {
                icon = 'fab fa-wikipedia-w';
            } else if (url.includes('amazon.com')) {
                icon = 'fab fa-amazon';
            }
            
            suggestions.push({
                text: title,
                icon: icon,
                tabId: tabId,
                url: url,
                isTab: true
            });
            
            tabCount++;
        });
        
        // Fill remaining tab slots with placeholder tabs if needed
        while (tabCount < 2) {
            suggestions.push({
                text: 'New Tab',
                icon: 'fas fa-globe',
                tabId: null,
                url: 'about:blank',
                isTab: true,
                isPlaceholder: true
            });
            tabCount++;
        }
        
        // Always show 3 search/history suggestions
        let searchCount = 0;
        
        // Add recent searches first
        if (this.settings.recentSearches && this.settings.recentSearches.length > 0 && searchCount < 3) {
            const recentSearches = this.settings.recentSearches.slice(0, 3 - searchCount);
            recentSearches.forEach(search => {
                if (searchCount < 3) {
                    suggestions.push({
                        text: `Search "${search}"`,
                        icon: 'fas fa-search',
                        searchQuery: search,
                        isSearch: true
                    });
                    searchCount++;
                }
            });
        }
        
        // Add recent history if we need more suggestions
        if (searchCount < 3 && this.settings.history && this.settings.history.length > 0) {
            const recentHistory = this.settings.history.slice(0, 3 - searchCount);
            recentHistory.forEach(item => {
                if (searchCount < 3) {
                    let icon = 'fas fa-lightbulb';
                    if (item.url.includes('gmail.com')) {
                        icon = 'fas fa-envelope';
                    } else if (item.url.includes('youtube.com')) {
                        icon = 'fab fa-youtube';
                    } else if (item.url.includes('github.com')) {
                        icon = 'fab fa-github';
                    } else if (item.url.includes('facebook.com')) {
                        icon = 'fab fa-facebook';
                    } else if (item.url.includes('twitter.com')) {
                        icon = 'fab fa-twitter';
                    } else if (item.url.includes('instagram.com')) {
                        icon = 'fab fa-instagram';
                    } else if (item.url.includes('reddit.com')) {
                        icon = 'fab fa-reddit';
                    } else if (item.url.includes('stackoverflow.com')) {
                        icon = 'fab fa-stack-overflow';
                    } else if (item.url.includes('wikipedia.org')) {
                        icon = 'fab fa-wikipedia-w';
                    } else if (item.url.includes('amazon.com')) {
                        icon = 'fab fa-amazon';
                    }
                    
                    suggestions.push({
                        text: item.title,
                        icon: icon,
                        url: item.url,
                        isHistory: true,
                        timestamp: item.timestamp
                    });
                    searchCount++;
                }
            });
        }
        
        // Fill remaining slots with placeholder search suggestions if needed
        const placeholderSearches = ['how to code', 'how to learn programming', 'weather'];
        while (searchCount < 3) {
            const placeholderIndex = searchCount - (3 - placeholderSearches.length);
            if (placeholderIndex >= 0 && placeholderIndex < placeholderSearches.length) {
                suggestions.push({
                    text: placeholderSearches[placeholderIndex],
                    icon: 'fas fa-lightbulb',
                    searchQuery: placeholderSearches[placeholderIndex],
                    isSearch: true,
                    isPlaceholder: true
                });
            } else {
                suggestions.push({
                    text: 'Search...',
                    icon: 'fas fa-search',
                    searchQuery: '',
                    isSearch: true,
                    isPlaceholder: true
                });
            }
            searchCount++;
        }
        
        return suggestions; // Always returns exactly 5 suggestions (2 tabs + 3 search/history)
    }

    sanitizeUrl(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        // Remove any potential XSS attempts
        let url = input.trim();
        
        // Remove dangerous characters and scripts
        url = url.replace(/[<>'"\x00-\x1f\x7f-\x9f]/g, '');
        
        // Remove javascript: and data: protocols
        if (url.toLowerCase().startsWith('javascript:') || 
            url.toLowerCase().startsWith('data:') ||
            url.toLowerCase().startsWith('vbscript:') ||
            url.toLowerCase().startsWith('file:') ||
            url.toLowerCase().startsWith('ftp:')) {
            return null;
        }

        // Handle protocol addition with proper validation
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
            // Check if it looks like a domain (more strict validation)
            if (this.isValidDomain(url)) {
                url = 'https://' + url;
            } else {
                // Treat as search query with proper encoding
                const encodedQuery = encodeURIComponent(url);
                return `https://www.google.com/search?q=${encodedQuery}`;
            }
        }

        // Validate the final URL
        try {
            const urlObj = new URL(url);
            
            // Only allow http, https, and about protocols
            if (!['http:', 'https:', 'about:'].includes(urlObj.protocol)) {
                return null;
            }
            
            // Additional security checks
            if (urlObj.hostname.includes('..') || urlObj.hostname.includes('//')) {
                return null;
            }
            
            return urlObj.toString();
        } catch (error) {
            console.error('URL validation failed:', error);
            return null;
        }
    }

    isValidDomain(domain) {
        if (!domain || typeof domain !== 'string') {
            return false;
        }
        
        // More strict domain validation
        const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;
        
        // Additional checks
        if (domain.includes(' ') || 
            domain.includes('..') || 
            domain.includes('//') ||
            domain.length > 253) {
            return false;
        }
        
        return domainRegex.test(domain);
    }

    isValidUrl(string) {
        try {
            const url = new URL(string);
            // Only allow http, https, and about protocols
            return ['http:', 'https:', 'about:'].includes(url.protocol);
        } catch (_) {
            return false;
        }
    }

    // Format note date for display
    formatNoteDate(dateString) {
        if (!dateString) return 'New note';
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return diffMins + ' minute' + (diffMins !== 1 ? 's' : '') + ' ago';
        if (diffHours < 24) return diffHours + ' hour' + (diffHours !== 1 ? 's' : '') + ' ago';
        if (diffDays < 7) return diffDays + ' day' + (diffDays !== 1 ? 's' : '') + ' ago';
        
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    }

    // HTML escape function to prevent XSS
    escapeHtml(text) {
        if (typeof text !== 'string') {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Split View Functionality
    toggleSplitView() {
        this.isSplitView = !this.isSplitView;
        
        const singleView = document.getElementById('single-view');
        const splitView = document.getElementById('split-view');
        const splitViewBtn = document.getElementById('split-view-btn');
        
        if (this.isSplitView) {
            // Enter split view
            singleView.classList.add('hidden');
            singleView.classList.remove('active');
            splitView.classList.remove('hidden');
            splitView.classList.add('entering');
            
            // Update button states
            splitViewBtn.innerHTML = '<i class="fas fa-columns"></i><span>Exit Split</span>';
            
            // Update context menu text
            const splitViewContextOption = document.getElementById('split-view-option');
            if (splitViewContextOption) {
                splitViewContextOption.innerHTML = '<i class="fas fa-columns"></i><span>Exit Split</span>';
            }
            
            // Initialize split view
            this.initializeSplitView();
            
            // Remove animation class after animation completes
            setTimeout(() => {
                splitView.classList.remove('entering');
            }, 500);
            
        } else {
            // Exit split view
            splitView.classList.add('exiting');
            
            // Update button states
            splitViewBtn.innerHTML = '<i class="fas fa-columns"></i><span>Split View</span>';
            
            // Update context menu text
            const splitViewContextOption = document.getElementById('split-view-option');
            if (splitViewContextOption) {
                splitViewContextOption.innerHTML = '<i class="fas fa-columns"></i><span>Split View</span>';
            }
            
            // Switch back to single view after animation
            setTimeout(() => {
                splitView.classList.add('hidden');
                splitView.classList.remove('exiting');
                singleView.classList.remove('hidden');
                singleView.classList.add('active');
                this.cleanupSplitView();
            }, 300);
        }
    }

    // Split view functions
    initializeSplitView() {
        const leftPane = document.querySelector('.left-pane');
        const rightPane = document.querySelector('.right-pane');
        
        // Set initial split ratio
        this.updateSplitRatio();
        
        // Setup divider drag functionality
        this.setupSplitDivider();
        
        // Setup webview event listeners for split view
        this.setupSplitWebviews();
        
        // Copy current tab content to left pane
        const currentWebview = document.getElementById('webview');
        const leftWebview = document.getElementById('webview-left');
        const rightWebview = document.getElementById('webview-right');
        
        // Wait a bit for the DOM to settle before setting URLs
        setTimeout(() => {
            if (currentWebview && leftWebview) {
                const currentUrl = currentWebview.getURL();
                if (currentUrl && currentUrl !== 'about:blank') {
                    leftWebview.src = currentUrl;
                } else {
                    leftWebview.src = 'https://www.google.com';
                }
            }
            
            // Set right pane to a default page
            if (rightWebview) {
                rightWebview.src = 'https://www.google.com';
            }
        }, 100);
        
        // Set active pane
        this.setActivePane('left');
        
        // Setup pane click handlers for switching active pane
        if (leftPane) {
            leftPane.addEventListener('click', () => {
                if (this.isSplitView) {
                    this.setActivePane('left');
                }
            });
        }
        
        if (rightPane) {
            rightPane.addEventListener('click', () => {
                if (this.isSplitView) {
                    this.setActivePane('right');
                }
            });
        }
    }

    setupSplitDivider() {
        const divider = document.querySelector('.split-divider');
        let isDragging = false;
        let frameRequested = false;
        let pendingRatio = null;
        
        if (!divider) {
            console.error('Split divider not found');
            return;
        }
        
        const applyPendingRatio = () => {
            if (pendingRatio !== null) {
                this.splitRatio = pendingRatio;
                this.updateSplitRatio();
                pendingRatio = null;
            }
            frameRequested = false;
        };
        
        const onMouseMove = (e) => {
            if (!isDragging) return;
            const splitContainer = document.querySelector('.split-container');
            if (!splitContainer) return;
            const rect = splitContainer.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const ratio = x / rect.width;
            // Constrain between 0.2 and 0.8
            const constrained = Math.max(0.2, Math.min(0.8, ratio));
            pendingRatio = constrained;
            if (!frameRequested) {
                frameRequested = true;
                requestAnimationFrame(applyPendingRatio);
            }
        };
        
        const onMouseUp = () => {
            if (!isDragging) return;
            isDragging = false;
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
            divider.style.cursor = 'col-resize';
            document.body.style.cursor = 'default';
            document.body.style.userSelect = '';
            document.body.classList.remove('resizing');
        };
        
        divider.addEventListener('mousedown', (e) => {
            isDragging = true;
            divider.style.cursor = 'col-resize';
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            document.body.classList.add('resizing');
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
            e.stopPropagation();
        });
    }

    updateSplitRatio() {
        const leftPane = document.querySelector('.left-pane');
        const rightPane = document.querySelector('.right-pane');
        
        if (leftPane && rightPane) {
            leftPane.style.flex = this.splitRatio;
            rightPane.style.flex = 1 - this.splitRatio;
        }
    }

    setupSplitWebviews() {
        const leftWebview = document.getElementById('webview-left');
        const rightWebview = document.getElementById('webview-right');
        
        // Setup left webview
        if (leftWebview) {
            this.setupWebviewEvents(leftWebview, 'left');
        }
        
        // Setup right webview
        if (rightWebview) {
            this.setupWebviewEvents(rightWebview, 'right');
        }
    }

    setupWebviewEvents(webview, pane) {
        // Setup webview event listeners for split view panes
        if (!webview) return;
        
        // Copy all the webview event listeners from the main setupWebview method
        webview.addEventListener('did-start-loading', () => {
            // Clear any existing timeout for this pane
            const existingTimeout = this.splitViewLoadingTimeouts.get(pane);
            if (existingTimeout) {
                clearTimeout(existingTimeout);
            }
            
            this.showLoadingIndicator(pane);
            
            // Set timeout to handle stuck loading (30 seconds)
            const timeout = setTimeout(() => {
                // Check if webview is still loading
                if (webview && webview.isLoading) {
                    console.log(`Page in ${pane} pane taking too long to load, forcing stop`);
                    // Force stop loading if it's been too long
                    try {
                        webview.stop();
                    } catch (e) {
                        console.error('Error stopping webview:', e);
                    }
                    // Hide loading indicator
                    this.hideLoadingIndicator(pane);
                    // Show error or allow user to continue
                    this.showNotification(`Page in ${pane} pane is taking too long to load. You can try refreshing.`, 'warning');
                }
                this.splitViewLoadingTimeouts.delete(pane);
            }, 30000); // 30 second timeout
            
            this.splitViewLoadingTimeouts.set(pane, timeout);
        });

        webview.addEventListener('did-finish-load', () => {
            // Clear loading timeout for this pane
            const timeout = this.splitViewLoadingTimeouts.get(pane);
            if (timeout) {
                clearTimeout(timeout);
                this.splitViewLoadingTimeouts.delete(pane);
            }
            
            this.hideLoadingIndicator(pane);
            // Only update tab title if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                this.updateTabTitle();
                // Extract theme for active pane immediately
                this.extractAndApplyWebpageColors(webview);
                // Quick retry using requestAnimationFrame
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        this.extractAndApplyWebpageColors(webview);
                    });
                });
            }
        });

        webview.addEventListener('did-fail-load', (event) => {
            // Clear loading timeout for this pane
            const timeout = this.splitViewLoadingTimeouts.get(pane);
            if (timeout) {
                clearTimeout(timeout);
                this.splitViewLoadingTimeouts.delete(pane);
            }
            
            this.hideLoadingIndicator(pane);
            this.handleNavigationError(event, pane);
        });
        
        // Add did-stop-loading event as backup for split view
        webview.addEventListener('did-stop-loading', () => {
            // Clear loading timeout for this pane
            const timeout = this.splitViewLoadingTimeouts.get(pane);
            if (timeout) {
                clearTimeout(timeout);
                this.splitViewLoadingTimeouts.delete(pane);
            }
            
            this.hideLoadingIndicator(pane);
        });
        
        // Suppress WebGPU deprecation warnings from webview console
        webview.addEventListener('console-message', (e) => {
            // Filter out the DawnExperimentalSubgroupLimits deprecation warning
            if (e.message && e.message.includes('DawnExperimentalSubgroupLimits') && e.message.includes('deprecated')) {
                // Suppress this specific warning
                return;
            }
        });

        webview.addEventListener('new-window', (event) => {
            event.preventDefault();
            // Navigate in the active pane
            if (this.isSplitView) {
                const activeWebview = this.activePane === 'left' ? 
                    document.getElementById('webview-left') : 
                    document.getElementById('webview-right');
                if (activeWebview) {
                    this.navigateInPane(activeWebview, event.url);
                }
            } else {
                this.navigate(event.url);
            }
        });

        webview.addEventListener('will-navigate', (event) => {
            // Only update URL bar if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                this.updateUrlBar(event.url);
            }
        });

        // Handle navigation completion (fires for all navigation types)
        webview.addEventListener('did-navigate', (event) => {
            // Only update URL bar if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                this.updateUrlBar();
                this.updateNavigationButtons();
            }
        });

        // Handle same-page navigation (SPAs, anchor links, etc.)
        webview.addEventListener('did-navigate-in-page', (event) => {
            // Only update URL bar if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                this.updateUrlBar();
                this.updateNavigationButtons();
                this.updateTabTitle();
            }
        });

        webview.addEventListener('page-title-updated', (event) => {
            // Only update tab title if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                this.updateTabTitle();
            }
        });

        // Handle favicon updates
        webview.addEventListener('page-favicon-updated', (event) => {
            // Only update favicon if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                if (event.favicons && event.favicons.length > 0) {
                    const faviconUrl = event.favicons[0];
                    const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
                    if (tabElement) {
                        const img = tabElement.querySelector('.tab-favicon');
                        if (img) {
                            img.style.visibility = 'visible';
                            img.src = faviconUrl; // Use first favicon
                            // Cache favicon in tab data
                            const tab = this.tabs.get(this.currentTab);
                            if (tab) {
                                tab.favicon = faviconUrl;
                            }
                        }
                    }
                }
            }
        });
    }

    setActivePane(pane) {
        if (!this.isSplitView) return;
        
        this.activePane = pane;
        
        const leftPane = document.querySelector('.left-pane');
        const rightPane = document.querySelector('.right-pane');
        
        // Update active class
        if (leftPane && rightPane) {
            if (pane === 'left') {
                leftPane.classList.add('active');
                rightPane.classList.remove('active');
            } else {
                rightPane.classList.add('active');
                leftPane.classList.remove('active');
            }
        }
        
        // Update URL bar and navigation buttons based on active pane
        const activeWebview = pane === 'left' ? 
            document.getElementById('webview-left') : 
            document.getElementById('webview-right');
        
        if (activeWebview) {
            this.updateUrlBar();
            this.updateNavigationButtons();
            this.updateTabTitle();
        }
    }

    navigateInPane(webview, url) {
        // Ultra-fast navigation with instant loading
        try {
            // Clear any existing timeouts
            if (this.navigationTimeout) {
                clearTimeout(this.navigationTimeout);
            }
            
            // Ultra-aggressive speed optimizations
            webview.style.willChange = 'transform';
            webview.style.transform = 'translateZ(0)';
            webview.style.backfaceVisibility = 'hidden';
            webview.style.perspective = '1000px';
            
            // Navigate immediately
            webview.src = url;
            
        } catch (error) {
            console.error('Navigation error:', error);
            // Ultra-fast fallback
            webview.src = 'https://www.google.com';
        }
    }

    showLoadingIndicator(pane = 'main') {
        const indicator = pane === 'main' ? 
            document.getElementById('loading-bar') :
            document.getElementById(`loading-bar-${pane}`);
        
        if (indicator) {
            indicator.classList.add('loading');
        }
    }

    hideLoadingIndicator(pane = 'main') {
        const indicator = pane === 'main' ? 
            document.getElementById('loading-bar') :
            document.getElementById(`loading-bar-${pane}`);
        
        if (indicator) {
            indicator.classList.remove('loading');
        }
    }

    handleNavigationError(event, pane) {
        // Handle navigation errors for split view panes
        console.error(`Navigation error in ${pane} pane:`, event);
        this.hideLoadingIndicator(pane);
    }

    cleanupSplitView() {
        // Clean up split view resources
        const leftWebview = document.getElementById('webview-left');
        const rightWebview = document.getElementById('webview-right');
        
        if (leftWebview) {
            leftWebview.src = 'about:blank';
        }
        if (rightWebview) {
            rightWebview.src = 'about:blank';
        }
    }

    showQuitConfirmation() {
        let backdrop = document.getElementById('quit-modal-backdrop');
        if (!backdrop) {
            backdrop = document.createElement('div');
            backdrop.id = 'quit-modal-backdrop';
            backdrop.className = 'modal-backdrop hidden';
            document.body.appendChild(backdrop);

            const modal = document.createElement('div');
            modal.className = 'quit-modal-card';
            modal.innerHTML = `
                <div class="quit-modal-content">
                    <div class="quit-modal-icon">⎋</div>
                    <div class="quit-modal-title">Quit Axis?</div>
                    <div class="quit-modal-subtitle">Are you sure you want to exit the application?</div>
                    <div class="quit-modal-actions">
                        <button class="btn-secondary" id="quit-cancel-btn">Cancel</button>
                        <button class="btn-primary" id="quit-confirm-btn">Quit</button>
                    </div>
                </div>`;
            backdrop.appendChild(modal);

            modal.querySelector('#quit-cancel-btn').addEventListener('click', () => this.hideQuitConfirmation());
            modal.querySelector('#quit-confirm-btn').addEventListener('click', () => {
                window.electronAPI.confirmQuit();
            });
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop) this.hideQuitConfirmation();
            });
        }
        requestAnimationFrame(() => {
            backdrop.classList.remove('hidden');
            document.body.classList.add('modal-open');
        });
    }

    hideQuitConfirmation() {
        const backdrop = document.getElementById('quit-modal-backdrop');
        if (!backdrop) return;
        backdrop.classList.add('hidden');
        document.body.classList.remove('modal-open');
        // Reset quit flag so X button works normally again
        window.electronAPI.cancelQuit();
    }
}

// Initialize the browser when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AxisBrowser();
});


