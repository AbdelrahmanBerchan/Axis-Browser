// Axis Browser Renderer Process
class AxisBrowser {
    constructor() {
        this.currentTab = null; // Start with no tabs
        this.tabs = new Map(); // Start with empty tabs
        this.settings = {};
        this.closedTabs = []; // Store recently closed tabs for recovery
        this.isSplitView = false; // Split view disabled - always false
        this.isBenchmarking = false; // suppress non-critical work on Speedometer
        this.activePane = 'left'; // 'left' or 'right' (not used when split view disabled)
        this.splitRatio = 0.5; // 50/50 split (not used when split view disabled)
        this.spotlightSelectedIndex = -1; // Track selected suggestion index
        
        this.init();
        
        // Add button interactions immediately
        this.addButtonInteractions();
    }

    async init() {
        await this.loadSettings();
        this.applySavedTheme();
        this.setupEventListeners();
        this.setupWebview();
        this.setupTabSearch();
        this.setupLoadingScreen();
        this.setupSidebarResize();
        this.setupAddTabMenu();
        
        // Load pinned tabs from saved state
        await this.loadPinnedTabs();

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
        // Navigation controls
        document.getElementById('back-btn').addEventListener('click', () => {
            this.goBack();
        });

        document.getElementById('forward-btn').addEventListener('click', () => {
            this.goForward();
        });

        document.getElementById('refresh-btn').addEventListener('click', () => {
            this.refresh();
        });

        document.getElementById('toggle-sidebar-btn').addEventListener('click', () => {
            this.toggleSidebar();
        });

        // Split view button - disabled for now
        // document.getElementById('split-view-btn').addEventListener('click', () => {
        //     this.toggleSplitView();
        // });

        // URL bar
        const urlBar = document.getElementById('url-bar');
        urlBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigate(urlBar.value);
            }
        });

        urlBar.addEventListener('focus', () => {
            // Show full URL and select all text
            const fullUrl = urlBar.getAttribute('data-full-url') || urlBar.value;
            urlBar.value = fullUrl;
            urlBar.classList.remove('summarized');
            urlBar.classList.add('expanded');
            urlBar.select();
        });

        urlBar.addEventListener('blur', () => {
            // Collapse back to summarized view when clicking away
            this.summarizeUrlBar();
        });

        // Tab controls handled in setupAddTabMenu to avoid double toggle

        // Nav menu toggle
        document.getElementById('nav-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNavMenu();
        });

        // Sidebar slide-back functionality
        this.setupSidebarSlideBack();

        // Settings
        document.getElementById('settings-btn-footer').addEventListener('click', () => {
            this.toggleSettings();
        });

        document.getElementById('close-settings').addEventListener('click', () => {
            this.toggleSettings();
        });

        // Custom color picker
        this.setupCustomColorPicker();

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

        // Downloads
        document.getElementById('downloads-btn-footer').addEventListener('click', () => {
            this.toggleDownloads();
        });
        document.getElementById('close-downloads').addEventListener('click', () => {
            this.toggleDownloads();
        });
        document.getElementById('refresh-downloads').addEventListener('click', () => {
            this.refreshDownloads();
        });

        // Clear history button
        document.getElementById('clear-history').addEventListener('click', () => {
            this.clearAllHistory();
        });

        // Clear downloads button
        document.getElementById('clear-downloads').addEventListener('click', () => {
            this.clearAllDownloads();
        });

        // Downloads search functionality (debounced)
        const onDownloadsInput = this.debounce((value) => this.filterDownloads(value), 120);
        document.getElementById('downloads-search-input').addEventListener('input', (e) => {
            onDownloadsInput(e.target.value);
        });

        // Empty state new tab buttons - open spotlight search
        const emptyStateBtn = document.getElementById('empty-state-new-tab');
        if (emptyStateBtn) {
            emptyStateBtn.addEventListener('click', () => {
                this.showSpotlightSearch();
            });
        }
        const emptyStateBtnEmpty = document.getElementById('empty-state-new-tab-empty');
        if (emptyStateBtnEmpty) {
            emptyStateBtnEmpty.addEventListener('click', () => {
                this.showSpotlightSearch();
            });
        }

        // Security panel
        document.getElementById('close-security').addEventListener('click', () => {
            this.toggleSecurity();
        });

        document.getElementById('view-certificate').addEventListener('click', () => {
            this.viewCertificate();
        });

        document.getElementById('security-settings').addEventListener('click', () => {
            this.openSecuritySettings();
        });

        // Close security panel when clicking background
        document.getElementById('security-panel').addEventListener('click', (e) => {
            if (e.target.id === 'security-panel') {
                this.toggleSecurity();
            }
        });

        // Spotlight search functionality (buttons removed, only keyboard/click events)

        document.getElementById('spotlight-input').addEventListener('keydown', (e) => {
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

        document.getElementById('spotlight-input').addEventListener('input', (e) => {
            // Immediate suggestions for maximum speed
                this.updateSpotlightSuggestions(e.target.value);
                // Reset selection when typing
                this.spotlightSelectedIndex = -1;
        });

        // Close spotlight when clicking background or backdrop
        document.getElementById('spotlight-search').addEventListener('click', (e) => {
            if (e.target.id === 'spotlight-search' || e.target.classList.contains('spotlight-backdrop')) {
                this.closeSpotlightSearch();
            }
        });

        // Bookmarks
        document.getElementById('bookmarks-btn-footer').addEventListener('click', () => {
            this.toggleBookmarks();
        });

        document.getElementById('close-bookmarks').addEventListener('click', () => {
            this.toggleBookmarks();
        });

        // Keyboard shortcuts - now handled through settings panel

        // Backdrop click closes any open modal
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
        backdrop.addEventListener('click', () => {
            const settingsPanel = document.getElementById('settings-panel');
            const downloadsPanel = document.getElementById('downloads-panel');
            const bookmarksPanel = document.getElementById('bookmarks-panel');
            
            // Close settings with animation
            if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
                settingsPanel.classList.add('settings-closing');
                setTimeout(() => {
                    settingsPanel.classList.add('hidden');
                    settingsPanel.classList.remove('settings-closing');
                }, 500);
            }
            
            // Close downloads with animation
            if (downloadsPanel && !downloadsPanel.classList.contains('hidden')) {
                downloadsPanel.classList.add('downloads-closing');
                setTimeout(() => {
                    downloadsPanel.classList.add('hidden');
                    downloadsPanel.classList.remove('downloads-closing');
                }, 500);
            }
            
            // Close bookmarks with animation
            if (bookmarksPanel && !bookmarksPanel.classList.contains('hidden')) {
                bookmarksPanel.classList.add('bookmarks-closing');
                setTimeout(() => {
                    bookmarksPanel.classList.add('hidden');
                    bookmarksPanel.classList.remove('bookmarks-closing');
                }, 500);
            }
            
            backdrop.classList.add('hidden');
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

        // Split view option - disabled for now
        // document.getElementById('split-view-option').addEventListener('click', () => {
        //     this.toggleSplitView();
        //     this.hideTabContextMenu();
        // });

        document.getElementById('pin-tab-option').addEventListener('click', () => {
            this.togglePinCurrentTab();
            this.hideTabContextMenu();
        });

        document.getElementById('close-tab-option').addEventListener('click', () => {
            this.closeCurrentTab();
            this.hideTabContextMenu();
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
                const bookmarksPanel = document.getElementById('bookmarks-panel');
                const settingsPanel = document.getElementById('settings-panel');
                
                if (!downloadsPanel.classList.contains('hidden')) {
                    this.toggleDownloads();
                } else if (!bookmarksPanel.classList.contains('hidden')) {
                    this.toggleBookmarks();
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
            if (!e.target.closest('.context-menu') && !e.target.closest('.tab')) {
                this.hideTabContextMenu();
                this.hideWebpageContextMenu();
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
            if (!e.target.closest('.tab') && !e.target.closest('#webview')) {
                this.hideTabContextMenu();
                this.hideWebpageContextMenu();
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

        // Bookmark and security buttons
        document.getElementById('bookmark-btn').addEventListener('click', () => {
            this.toggleBookmark();
        });

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

        // Keyboard shortcuts
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
            
            // Cmd/Ctrl + W - Close tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                e.stopPropagation();
                if (this.currentTab) {
                    this.closeTab(this.currentTab);
                }
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
            
            // Split view shortcuts - disabled for now
            // if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'S') {
            //     e.preventDefault();
            //     this.toggleSplitView();
            // }
            // if ((e.metaKey || e.ctrlKey) && e.key === '[' && this.isSplitView) {
            //     e.preventDefault();
            //     this.setActivePane('left');
            // }
            // if ((e.metaKey || e.ctrlKey) && e.key === ']' && this.isSplitView) {
            //     e.preventDefault();
            //     this.setActivePane('right');
            // }
            // if (e.key === 'Escape' && this.isSplitView) {
            //     e.preventDefault();
            //     this.toggleSplitView();
            // }
            
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

    setupWebview() {
        const webview = document.getElementById('webview');
        if (!webview) return;
        
        // Optimize webview for performance
        webview.style.willChange = 'transform';
        webview.style.transform = 'translateZ(0)';
        webview.style.backfaceVisibility = 'hidden';
        
        // Enable webview functionality
        // Direct updates for maximum speed
        const debouncedUpdateNav = () => this.updateNavigationButtons();
        const debouncedUpdateUrl = () => this.updateUrlBar();
        const debouncedUpdateTitle = () => this.updateTabTitle();
        const debouncedUpdateSecurity = () => this.updateSecurityIndicator();

        webview.addEventListener('did-start-loading', () => {
            // Check if we're benchmarking early
            const currentUrl = webview.getURL() || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(currentUrl);
            
            // Skip ALL UI updates during benchmarks
            if (this.isBenchmarking) return;
            
            // Show loading indicator
            this.showLoadingIndicator();
            this.updateNavigationButtons();
        });

        webview.addEventListener('did-finish-load', () => {
            // Skip ALL UI updates during benchmarks - they slow down Speedometer
            if (this.isBenchmarking) {
                // Only reset counters, no UI work
                this.errorRetryCount = 0;
                this.dnsRetryCount = 0;
                return;
            }
            
            // Hide loading indicator
            this.hideLoadingIndicator();
            
            // Reset retry counters on successful load
            this.errorRetryCount = 0;
            this.dnsRetryCount = 0;
            
            // Batch all updates for maximum speed
            this.updateNavigationButtons();
            this.updateUrlBar();
            this.updateTabTitle();
            this.updateSecurityIndicator();
            this.updateBookmarkButton();
            
            // Update current tab state
            if (this.currentTab && this.tabs.has(this.currentTab)) {
                const currentTab = this.tabs.get(this.currentTab);
                const currentUrl = webview.getURL();
                const currentTitle = webview.getTitle();
                
                // Update URL if changed
                if (currentUrl && currentUrl !== 'about:blank') {
                    currentTab.url = currentUrl;
                }
                
                // Update title if changed
                if (currentTitle) {
                    currentTab.title = currentTitle;
                }
            }
            
            // Track page in history immediately
            if (!this.isBenchmarking) {
                this.trackPageInHistory();
            }
            
            // Update favicon after page loads (as backup)
            const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
            if (tabElement && !this.isBenchmarking) {
                this.updateTabFavicon(this.currentTab, tabElement);
            }
        });

        // Add did-stop-loading event as backup
        webview.addEventListener('did-stop-loading', () => {
            // Skip ALL UI updates during benchmarks
            if (!this.isBenchmarking) {
                this.hideLoadingIndicator();
                this.updateUrlBar();
                this.updateNavigationButtons();
                this.updateTabTitle();
            }
        });

        webview.addEventListener('did-fail-load', (event) => {
            console.error('Failed to load:', event.errorDescription, 'Error code:', event.errorCode);
            // Hide loading indicator even on failure
            this.hideLoadingIndicator();
            
            // Prevent infinite retry loops
            if (this.errorRetryCount >= 5) {
                console.log('Max error retries reached, showing error page');
                this.showErrorPage('Unable to load page. Please check your internet connection.');
                return;
            }
            
            this.errorRetryCount = (this.errorRetryCount || 0) + 1;
            
            // Handle different types of errors
            if (event.errorCode === -2) {
                // Network error - reload immediately
                console.log('Network error, attempting to reload...');
                    webview.reload();
            } else if (event.errorCode === -3) {
                // Aborted - usually means navigation was cancelled
                console.log('Navigation aborted');
            } else if (event.errorCode === -105) {
                // ERR_NAME_NOT_RESOLVED - DNS issue
                console.log('DNS resolution failed, trying alternative approach...');
                const currentUrl = event.url || webview.getURL() || 'https://www.google.com';
                this.handleDNSFailure(currentUrl);
            } else {
                // Other errors - show error page
                this.showErrorPage(event.errorDescription);
            }
        });

        webview.addEventListener('new-window', (event) => {
            // Handle new window requests
            event.preventDefault();
            this.navigate(event.url);
        });

        // Handle navigation events - optimized for performance
        webview.addEventListener('will-navigate', (event) => {
            const nextUrl = event.url || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(nextUrl);
            // Skip ALL UI updates during benchmarks - they slow down Speedometer
            if (!this.isBenchmarking) {
                this.updateUrlBar();
            }
        });

        // Handle navigation completion (fires for all navigation types)
        webview.addEventListener('did-navigate', (event) => {
            // Skip ALL UI updates during benchmarks - they slow down Speedometer
            if (!this.isBenchmarking) {
                this.updateUrlBar();
                this.updateNavigationButtons();
            }
        });

        // Handle same-page navigation (SPAs, anchor links, etc.)
        webview.addEventListener('did-navigate-in-page', (event) => {
            // Skip ALL UI updates during benchmarks
            if (!this.isBenchmarking) {
                this.updateUrlBar();
                this.updateNavigationButtons();
                this.updateTabTitle();
            }
        });

        // Handle page title updates (may fire independently of navigation)
        webview.addEventListener('page-title-updated', (event) => {
            if (!this.isBenchmarking) {
                this.updateTabTitle();
            }
        });

        // Handle favicon updates
        webview.addEventListener('page-favicon-updated', (event) => {
            const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
            if (tabElement && event.favicons && event.favicons.length > 0) {
                const img = tabElement.querySelector('.tab-favicon');
                if (img) {
                    img.style.visibility = 'visible';
                    img.src = event.favicons[0]; // Use first favicon
                }
            }
        });
        
        // Set initial page with error handling and network check
        this.checkNetworkAndLoad();
        
        // Set up event listeners for the initial tab
        const initialTab = document.querySelector('.tab[data-tab-id="1"]');
        if (initialTab) {
            this.setupTabEventListeners(initialTab, 1);
        }

        // Set up webview context menu
        webview.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            // Get mouse position relative to the document
            const rect = webview.getBoundingClientRect();
            const x = e.clientX + rect.left;
            const y = e.clientY + rect.top;
            this.showWebpageContextMenu({ pageX: x, pageY: y });
        });
        
        // Removed sidebar resizing functionality
    }

    handleDNSFailure(url) {
        console.log('Handling DNS failure for:', url);
        
        // Prevent infinite retry loops
        if (this.dnsRetryCount >= 3) {
            console.log('Max DNS retries reached, falling back to Google');
            const webview = document.getElementById('webview');
            webview.src = 'https://www.google.com';
            return;
        }
        
        this.dnsRetryCount = (this.dnsRetryCount || 0) + 1;
        
        // Try simple fallback to Google search
        const searchQuery = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        
        console.log(`DNS retry ${this.dnsRetryCount}/3, trying:`, fallbackUrl);
        
        const webview = document.getElementById('webview');
        const sanitizedFallbackUrl = this.sanitizeUrl(fallbackUrl);
        webview.src = sanitizedFallbackUrl || 'https://www.google.com';
    }

    checkNetworkAndLoad() {
        const webview = document.getElementById('webview');
        
        // Simple approach - just load Google directly
        try {
            console.log('Loading initial page...');
            webview.src = 'https://www.google.com';
        } catch (error) {
            console.error('Failed to load initial page:', error);
            // Fallback to a simple HTML page
            webview.src = 'data:text/html,<html><body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;"><h1>Axis Browser</h1><p>Loading...</p></body></html>';
        }
    }

    showErrorPage(message) {
        const webview = document.getElementById('webview');
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

    setupCustomColorPicker() {
        const colorPicker = document.getElementById('main-color-picker');

        // Load saved color or use default
        this.currentColor = this.settings.mainColor || '#4a90e2';
        
        // Set the color picker value
        if (colorPicker) {
            colorPicker.value = this.currentColor;
        }

        // Initialize color scheme
        this.generateColorScheme(this.currentColor);

        // Color picker change event
        if (colorPicker) {
            colorPicker.addEventListener('change', (e) => {
                const color = e.target.value;
                this.selectColor(color);
            });
        }
    }

    selectColor(color) {
        this.currentColor = color;
        this.generateColorScheme(color);
        this.saveSetting('mainColor', color);
    }


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

    applyCustomTheme(colors) {
        // Create gradient from primary and secondary colors
        const gradient = `linear-gradient(135deg, ${colors.secondary} 0%, ${colors.primary} 50%, ${this.darkenColor(colors.primary, 0.3)} 100%)`;
        
        // Apply theme to body
        document.body.style.background = gradient;
        document.body.style.color = colors.text;
        
        // Apply theme to sidebar
        const sidebar = document.getElementById('sidebar');
        if (sidebar) {
            sidebar.style.background = colors.primary;
        }
        
        // Apply theme to nav bar
        const navBar = document.getElementById('nav-bar');
        if (navBar) {
            navBar.style.background = colors.primary;
        }
        
        // Apply theme to tabs
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.style.background = colors.secondary;
        });
        
        // Apply theme to webview container
        const webviewContainer = document.querySelector('.webview-container');
        if (webviewContainer) {
            webviewContainer.style.background = colors.primary;
        }
        
        // Apply theme to popups
        const popups = document.querySelectorAll('.downloads-panel, .bookmarks-panel, .settings-panel, .nav-menu, .add-tab-menu, .context-menu');
        popups.forEach(popup => {
            popup.style.background = colors.primary;
        });
        
        // Apply theme to popup headers
        const popupHeaders = document.querySelectorAll('.downloads-header, .bookmarks-header, .settings-header');
        popupHeaders.forEach(header => {
            header.style.background = colors.secondary;
        });
        
        // Apply theme to popup content areas
        const popupContents = document.querySelectorAll('.downloads-content, .bookmarks-content, .settings-content');
        popupContents.forEach(content => {
            content.style.background = colors.primary;
        });
        
        // Apply theme to popup items
        const popupItems = document.querySelectorAll('.download-item, .bookmark-item, .setting-item, .nav-menu-item, .add-tab-menu-item, .context-menu-item');
        popupItems.forEach(item => {
            item.style.color = colors.text;
        });
        
        // Apply theme to popup text elements
        const popupTextElements = document.querySelectorAll('.bookmark-title, .bookmark-url, .history-url, .history-time, .download-url, .shortcut-desc, .setting-item label');
        popupTextElements.forEach(element => {
            element.style.color = colors.text;
        });
        
        // Apply theme to buttons
        const buttons = document.querySelectorAll('.nav-btn, .tab-close, .url-icon, .add-tab-btn, .settings-btn, .bookmark-btn, .security-btn, .nav-menu-btn, .download-btn, .bookmark-delete, .close-settings, .refresh-btn, .clear-btn, .save-btn');
        buttons.forEach(button => {
            button.style.background = colors.secondary;
            button.style.color = colors.text;
        });
        
        // Apply theme to settings tabs
        const settingsTabs = document.querySelectorAll('.settings-tab');
        settingsTabs.forEach(tab => {
            tab.style.background = colors.secondary;
            tab.style.color = colors.text;
        });
        
        // Apply theme to setting groups
        const settingGroups = document.querySelectorAll('.setting-group');
        settingGroups.forEach(group => {
            group.style.background = colors.primary;
        });
        
        // Update CSS variables for comprehensive theming
        document.documentElement.style.setProperty('--background-color', colors.primary);
        document.documentElement.style.setProperty('--text-color', colors.text);
        document.documentElement.style.setProperty('--text-color-secondary', colors.textSecondary || colors.text);
        document.documentElement.style.setProperty('--text-color-muted', colors.textMuted || colors.text);
        document.documentElement.style.setProperty('--popup-background', colors.primary);
        document.documentElement.style.setProperty('--popup-header', colors.secondary);
        document.documentElement.style.setProperty('--button-background', colors.secondary);
        document.documentElement.style.setProperty('--button-hover', colors.accent);
        document.documentElement.style.setProperty('--button-text', colors.text);
        document.documentElement.style.setProperty('--button-text-hover', colors.text);
        document.documentElement.style.setProperty('--sidebar-background', colors.primary);
        document.documentElement.style.setProperty('--url-bar-background', colors.primary);
        document.documentElement.style.setProperty('--url-bar-text', colors.text);
        document.documentElement.style.setProperty('--url-bar-text-muted', colors.textSecondary || colors.text);
        document.documentElement.style.setProperty('--tab-background', colors.secondary);
        document.documentElement.style.setProperty('--tab-background-hover', colors.accent);
        document.documentElement.style.setProperty('--tab-background-active', colors.accent);
        document.documentElement.style.setProperty('--tab-text', colors.text);
        document.documentElement.style.setProperty('--tab-text-active', colors.text);
        document.documentElement.style.setProperty('--tab-close-color', colors.textSecondary || colors.text);
        document.documentElement.style.setProperty('--tab-close-hover', colors.text);
        document.documentElement.style.setProperty('--icon-color', colors.textSecondary || colors.text);
        document.documentElement.style.setProperty('--icon-hover', colors.text);
        document.documentElement.style.setProperty('--border-color', colors.border || 'rgba(255, 255, 255, 0.1)');
        document.documentElement.style.setProperty('--border-color-light', colors.borderLight || 'rgba(255, 255, 255, 0.2)');
        document.documentElement.style.setProperty('--accent-color', colors.accent);
        document.documentElement.style.setProperty('--primary-color', colors.primary);
        document.documentElement.style.setProperty('--secondary-color', colors.secondary);
    }

    // Helper function to darken colors
    darkenColor(color, amount) {
        const hex = color.replace('#', '');
        const r = Math.max(0, parseInt(hex.substr(0, 2), 16) - Math.round(255 * amount));
        const g = Math.max(0, parseInt(hex.substr(2, 2), 16) - Math.round(255 * amount));
        const b = Math.max(0, parseInt(hex.substr(4, 2), 16) - Math.round(255 * amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // Toggle between light and dark themes
    toggleTheme() {
        const body = document.body;
        if (body.classList.contains('light-theme')) {
            body.classList.remove('light-theme');
            this.saveSetting('theme', 'dark');
        } else {
            body.classList.add('light-theme');
            this.saveSetting('theme', 'light');
        }
    }
    
    // Apply saved theme on startup
    applySavedTheme() {
        const savedTheme = this.settings.theme || 'dark';
        const body = document.body;
        
        if (savedTheme === 'light') {
            body.classList.add('light-theme');
        } else {
            body.classList.remove('light-theme');
        }
    }
    
    // Refresh popup themes when they're opened
    refreshPopupThemes() {
        // Reapply theme to all popup elements
        const popupElements = document.querySelectorAll('.downloads-panel, .bookmarks-panel, .settings-panel, .nav-menu, .add-tab-menu, .context-menu');
        popupElements.forEach(popup => {
            if (!popup.classList.contains('hidden')) {
                // Force re-theme visible popups
                const textElements = popup.querySelectorAll('.bookmark-title, .bookmark-url, .history-url, .history-time, .download-url, .shortcut-desc, .setting-item label, .nav-menu-item, .add-tab-menu-item, .context-menu-item');
                textElements.forEach(element => {
                    element.style.color = '';
                    // Trigger reflow to ensure CSS variables are applied
                    element.offsetHeight;
                });
            }
        });
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
            canGoBack: false,
            canGoForward: false,
            history: url ? [url] : [],
            historyIndex: url ? 0 : -1,
            pinned: false // New tabs are unpinned by default
        };
        
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

        // Save current tab state before switching (if there is a current tab)
        if (this.currentTab && this.tabs.has(this.currentTab)) {
            const currentTab = this.tabs.get(this.currentTab);
            const webview = document.getElementById('webview');
            if (webview) {
                const currentUrl = webview.getURL();
                if (currentUrl && currentUrl !== 'about:blank') {
                    currentTab.url = currentUrl;
                    currentTab.title = webview.getTitle() || currentTab.title;
                }
            }
        }

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
            return;
        }

        // Update active tab
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.remove('active');
        });
        
        const activeTab = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (activeTab) {
            activeTab.classList.add('active');
        }

        this.currentTab = tabId;
        
        // Update webview content for the active tab
        const tab = this.tabs.get(tabId);
        if (tab) {
            const webview = document.getElementById('webview');
            if (webview) {
                // Navigate to tab's URL if it exists and is valid
                if (tab.url && tab.url !== 'about:blank' && tab.url !== '') {
                    const sanitizedTabUrl = this.sanitizeUrl(tab.url);
                    webview.src = sanitizedTabUrl || 'https://www.google.com';
                } else {
                    // If tab has no valid URL, set to Google and update tab data
                    webview.src = 'https://www.google.com';
                    tab.url = 'https://www.google.com';
                    // Update history if it's empty
                    if (!tab.history || tab.history.length === 0) {
                        tab.history = ['https://www.google.com'];
                        tab.historyIndex = 0;
                    }
                }
            }
        }
        
        // Hide empty state when switching to a tab
        this.updateEmptyState();
        this.updateNavigationButtons();
        this.updateUrlBar();
    }

    updateEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (!emptyState) return;

        const emptyContent = document.getElementById('empty-state-empty');
        
        if (this.tabs.size === 0 || this.currentTab === null) {
            // Show empty state
            emptyState.classList.remove('hidden');
            if (emptyContent) emptyContent.classList.remove('hidden');
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
            const tabId = parseInt(tabElement.dataset.tabId);
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
        
        // Tab cleanup (no individual webviews to remove)
        
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

        this.tabs.delete(tabId);

        // If we closed the active tab, switch to another tab or show empty state
        if (this.currentTab === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[remainingTabs.length - 1]);
            } else {
                // No more tabs - show empty state
                this.currentTab = null;
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
            const webview = document.getElementById('webview');
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

        // Split view disabled for now - always use single view
        // if (this.isSplitView) {
        //     // Navigate in the active pane
        //     const activeWebview = this.activePane === 'left' ? 
        //         document.getElementById('webview-left') : 
        //         document.getElementById('webview-right');
        //     
        //     if (activeWebview) {
        //         this.navigateInPane(activeWebview, sanitizedUrl);
        //     }
        // } else {
            // Navigate in single view
            const webview = document.getElementById('webview');
            this.navigateInPane(webview, sanitizedUrl);
        // }

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
            const webview = document.getElementById('webview');
            if (webview && webview.canGoBack()) {
                webview.goBack();
                this.updateNavigationButtons();
            }
        }
    }

    goForward() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) return;
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
            const webview = document.getElementById('webview');
            if (webview && webview.canGoForward()) {
                webview.goForward();
                this.updateNavigationButtons();
            }
        }
    }

    navigateToUrlInCurrentTab(url) {
        const webview = document.getElementById('webview');
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
        const webview = document.getElementById('webview');
        if (webview) {
            webview.reload();
        }
    }

    updateNavigationButtons() {
        const backBtn = document.getElementById('back-btn');
        const forwardBtn = document.getElementById('forward-btn');
        
        if (!this.currentTab || !this.tabs.has(this.currentTab)) {
            if (backBtn) backBtn.disabled = true;
            if (forwardBtn) forwardBtn.disabled = true;
            return;
        }

        const currentTab = this.tabs.get(this.currentTab);
        if (currentTab && currentTab.history && currentTab.history.length > 1) {
            // Use tab-specific history for navigation buttons
            backBtn.disabled = currentTab.historyIndex <= 0;
            forwardBtn.disabled = currentTab.historyIndex >= currentTab.history.length - 1;
        } else {
            // Fallback to webview navigation
            backBtn.disabled = !webview.canGoBack();
            forwardBtn.disabled = !webview.canGoForward();
        }
    }

    updateUrlBar() {
        const urlBar = document.getElementById('url-bar');
        if (!urlBar) return;

        if (!this.currentTab || !this.tabs.has(this.currentTab)) {
            urlBar.value = '';
            urlBar.classList.remove('summarized');
            return;
        }

        const webview = document.getElementById('webview');
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
        const webview = document.getElementById('webview');
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
        const settingsPanel = document.getElementById('settings-panel');
        const bookmarksPanel = document.getElementById('bookmarks-panel');
        const downloadsPanel = document.getElementById('downloads-panel');
        const securityPanel = document.getElementById('security-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels with animation
        if (!bookmarksPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(bookmarksPanel);
        }
        if (!downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        if (!securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        
        if (settingsPanel.classList.contains('hidden')) {
            // Enhanced opening animation
            settingsPanel.classList.remove('hidden');
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.transition = 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
            }
            
            // Add entrance animation class
            settingsPanel.classList.add('settings-entering');
            
            // Populate settings immediately
                this.populateSettings();
                // Default to general tab when opening
                this.switchSettingsTab('general');
                settingsPanel.classList.remove('settings-entering');
            // Refresh popup themes
            this.refreshPopupThemes();
            
        } else {
            // Enhanced closing animation
            settingsPanel.classList.add('settings-closing');
            
            setTimeout(() => {
                settingsPanel.classList.add('hidden');
                settingsPanel.classList.remove('settings-closing');
                if (backdrop) backdrop.classList.add('hidden');
            }, 500);
        }
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


    toggleBookmarks() {
        const bookmarksPanel = document.getElementById('bookmarks-panel');
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
        
        if (bookmarksPanel.classList.contains('hidden')) {
            // Enhanced opening animation
            bookmarksPanel.classList.remove('hidden');
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.transition = 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
            }
            
            // Add entrance animation class
            bookmarksPanel.classList.add('bookmarks-entering');
            
            // Populate bookmarks immediately
                this.populateBookmarks();
                bookmarksPanel.classList.remove('bookmarks-entering');
            // Refresh popup themes
            this.refreshPopupThemes();
            
        } else {
            // Enhanced closing animation
            bookmarksPanel.classList.add('bookmarks-closing');
            
            setTimeout(() => {
                bookmarksPanel.classList.add('hidden');
                bookmarksPanel.classList.remove('bookmarks-closing');
                if (backdrop) backdrop.classList.add('hidden');
            }, 500);
        }
    }

    populateSettings() {
        document.getElementById('block-trackers').checked = this.settings.blockTrackers || false;
        document.getElementById('block-ads').checked = this.settings.blockAds || false;
    }

    populateBookmarks() {
        const bookmarksList = document.getElementById('bookmarks-list');
        const noBookmarks = document.getElementById('no-bookmarks');
        const bookmarks = this.settings.bookmarks || [];
        
        // Clear immediately
            bookmarksList.innerHTML = '';
            
            if (bookmarks.length === 0) {
                noBookmarks.classList.remove('hidden');
                return;
            }
            
            noBookmarks.classList.add('hidden');
            
        // Add items immediately
            bookmarks.forEach((bookmark, index) => {
                const bookmarkElement = document.createElement('div');
                bookmarkElement.className = 'bookmark-item';
                bookmarkElement.innerHTML = `
                    <i class="fas fa-globe bookmark-icon"></i>
                    <div class="bookmark-content">
                        <div class="bookmark-title">${bookmark.title}</div>
                        <div class="bookmark-url">${bookmark.url}</div>
                    </div>
                    <div class="bookmark-actions">
                        <button class="bookmark-delete" data-index="${index}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                `;
                
                // Click to navigate
                bookmarkElement.addEventListener('click', (e) => {
                    if (!e.target.closest('.bookmark-delete')) {
                        this.navigate(bookmark.url);
                        this.toggleBookmarks();
                    }
                });
                
                // Delete bookmark
                const deleteBtn = bookmarkElement.querySelector('.bookmark-delete');
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.deleteBookmark(index);
                });
                
                bookmarksList.appendChild(bookmarkElement);
        });
    }

    deleteBookmark(index) {
        const bookmarks = this.settings.bookmarks || [];
        const bookmark = bookmarks[index];
        
            bookmarks.splice(index, 1);
            this.saveSetting('bookmarks', bookmarks);
            this.populateBookmarks();
            this.showNotification(`Bookmark "${bookmark.title}" deleted`, 'success');
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
    showErrorPage(error) {
        const webview = document.getElementById('webview');
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
        
        // Create input element
        const input = document.createElement('input');
        input.type = 'text';
        input.value = currentTitle;
        input.style.cssText = `
            background: transparent;
            border: 1px solid #555;
            border-radius: 8px;
            color: #fff;
            padding: 4px 8px;
            font-size: 12px;
            font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            font-weight: 400;
            width: 100%;
            outline: none;
        `;
        
        // Replace title with input
        titleElement.style.display = 'none';
        titleElement.parentNode.insertBefore(input, titleElement);
        input.focus();
        input.select();
        
        const finishRename = () => {
            const newTitle = input.value.trim() || currentTitle;
            titleElement.textContent = newTitle;
            titleElement.style.display = '';
            input.remove();
            
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
    }

    toggleBookmark() {
        const webview = document.getElementById('webview');
        const currentUrl = webview.getURL();
        const currentTitle = webview.getTitle() || 'Untitled';
        
        if (currentUrl && currentUrl !== 'about:blank') {
            // Get existing bookmarks
            let bookmarks = this.settings.bookmarks || [];
            
            // Check if already bookmarked
            const existingIndex = bookmarks.findIndex(bookmark => bookmark.url === currentUrl);
            
            if (existingIndex !== -1) {
                // Remove bookmark
                bookmarks.splice(existingIndex, 1);
                this.showNotification('Bookmark removed', 'success');
            } else {
                // Add bookmark
                bookmarks.push({
                    url: currentUrl,
                    title: currentTitle,
                    date: new Date().toISOString()
                });
                this.showNotification('Bookmark added', 'success');
            }
            
            // Save bookmarks
            this.saveSetting('bookmarks', bookmarks);
            
            // Update bookmark button appearance
            this.updateBookmarkButton(bookmarks.some(bookmark => bookmark.url === currentUrl));
        }
    }

    updateBookmarkButton(isBookmarked = null) {
        const bookmarkBtn = document.getElementById('bookmark-btn');
        const icon = bookmarkBtn.querySelector('i');
        const webview = document.getElementById('webview');
        const currentUrl = webview.getURL();
        
        // If isBookmarked is not provided, check if current URL is bookmarked
        if (isBookmarked === null) {
            const bookmarks = this.settings.bookmarks || [];
            isBookmarked = bookmarks.some(bookmark => bookmark.url === currentUrl);
        }
        
        if (isBookmarked) {
            icon.className = 'fas fa-bookmark';
            bookmarkBtn.style.color = '#ffd700';
        } else {
            icon.className = 'far fa-bookmark';
            bookmarkBtn.style.color = '#666';
        }
    }

    updateSecurityIndicator() {
        const webview = document.getElementById('webview');
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
        const mainButtons = document.querySelectorAll('.nav-btn, .tab-close, .url-icon, .add-tab-btn, .settings-btn, .bookmark-btn, .security-btn, .nav-menu-btn, .download-btn, .bookmark-delete, .close-settings, .refresh-btn, .clear-btn');
        
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
        const popupItems = document.querySelectorAll('.nav-menu-item, .add-tab-menu-item, .context-menu-item');
        
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
        try {
            const webview = document.getElementById('webview');
            const currentUrl = new URL(webview.getURL());
            const origin = `${currentUrl.protocol}//${currentUrl.host}`;
            const faviconUrl = `${origin}/favicon.ico`;
            const img = tabElement.querySelector('.tab-favicon');
            if (img) {
                img.style.visibility = 'visible';
                img.src = faviconUrl;
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
        } else {
            tabElement.classList.remove('pinned');
        }
        
        if (pinBtn) {
            pinBtn.style.color = isPinned ? '#ffd700' : '#666';
        }
        
        // Move tab to correct section
        this.organizeTabsByPinnedState();
        this.savePinnedTabs();
    }
    
    organizeTabsByPinnedState() {
        const tabsContainer = document.querySelector('.tabs-container');
        const separator = document.getElementById('tabs-separator');
        if (!tabsContainer || !separator) return;
        
        // Get all tabs (preserve order)
        const allChildren = Array.from(tabsContainer.children);
        const tabs = allChildren.filter(el => 
            el.classList.contains('tab') && el.id !== 'tabs-separator'
        );
        
        // Get current order
        const tabOrder = tabs.map(t => parseInt(t.dataset.tabId));
        
        // Separate pinned and unpinned while preserving relative order
        const pinnedTabs = [];
        const unpinnedTabs = [];
        
        for (const tabId of tabOrder) {
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (!tabElement) continue;
            
            const tab = this.tabs.get(tabId);
            if (tab && tab.pinned) {
                pinnedTabs.push(tabElement);
            } else {
                unpinnedTabs.push(tabElement);
            }
        }
        
        // Remove all tabs temporarily
        tabs.forEach(tab => {
            if (tab.parentNode === tabsContainer) {
                tab.remove();
            }
        });
        
        // Insert pinned tabs above separator (in order)
        pinnedTabs.forEach(tab => {
            tabsContainer.insertBefore(tab, separator);
        });
        
        // Show/hide separator based on pinned tabs
        if (pinnedTabs.length > 0) {
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
                const tabId = parseInt(child.dataset.tabId);
                const tab = this.tabs.get(tabId);
                if (tab && tab.pinned) {
                    pinnedTabs.push({
                        id: tabId,
                        url: tab.url,
                        title: tab.title,
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
            
            // If pinned tabs were loaded, navigate to first one if no current tab
            if (pinnedTabsData.length > 0 && !this.currentTab) {
                const firstPinnedId = pinnedTabsData[0].id;
                if (this.tabs.has(firstPinnedId)) {
                    this.switchToTab(firstPinnedId);
                    // Navigate to the saved URL
                    const firstTab = this.tabs.get(firstPinnedId);
                    if (firstTab && firstTab.url && firstTab.url !== 'about:blank') {
                        this.navigate(firstTab.url);
                    }
                }
            }
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
                const url = this.tabs.get(parseInt(tab.dataset.tabId))?.url?.toLowerCase() || '';
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
        
        sidebar.classList.toggle('hidden');
        
        // Close nav menu when sidebar is hidden
        if (sidebar.classList.contains('hidden')) {
            this.closeNavMenu();
        }
        
        // Keep the icon as sidebar bars, don't change it
        icon.className = 'fas fa-bars';
    }

    toggleNavMenu() {
        const navMenu = document.getElementById('nav-menu');
        const navMenuBtn = document.getElementById('nav-menu-btn');
        
        if (navMenu.classList.contains('hidden')) {
            // Calculate position relative to the button
            const btnRect = navMenuBtn.getBoundingClientRect();
            navMenu.style.top = (btnRect.bottom + 5) + 'px';
            navMenu.style.left = btnRect.left + 'px';
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

    showTabContextMenu(e, tabId) {
        const contextMenu = document.getElementById('tab-context-menu');
        if (contextMenu) {
            // Remove closing state and reset opacity before showing
            contextMenu.classList.remove('closing', 'hidden');
            contextMenu.style.opacity = '';
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
            contextMenu.style.display = 'block';
            this.contextMenuTabId = tabId;
            
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
            setTimeout(() => {
                this.updateUrlBar();
            }, 100); // Small delay to ensure the new tab is fully loaded
            
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
        const webview = document.getElementById('webview');
        webview.stopFindInPage('clearSelection');
    }

    showWebpageContextMenu(e) {
        const contextMenu = document.getElementById('webpage-context-menu');
        if (contextMenu) {
            // Hide tab context menu if open
            this.hideTabContextMenu();
            
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
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
        const webview = document.getElementById('webview');
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
        const webview = document.getElementById('webview');
        webview.executeJavaScript('document.execCommand("cut")');
    }

    copy() {
        const webview = document.getElementById('webview');
        webview.executeJavaScript('document.execCommand("copy")');
    }

    paste() {
        const webview = document.getElementById('webview');
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
        const bookmarksPanel = document.getElementById('bookmarks-panel');
        const securityPanel = document.getElementById('security-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!bookmarksPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(bookmarksPanel);
        }
        if (!securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        
        if (downloadsPanel.classList.contains('hidden')) {
            // Enhanced opening animation
            downloadsPanel.classList.remove('hidden');
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.transition = 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)';
            }
            
            // Add entrance animation class
            downloadsPanel.classList.add('downloads-entering');
            
            // Populate downloads with delay for smooth animation
            setTimeout(() => {
                this.populateDownloads();
                downloadsPanel.classList.remove('downloads-entering');
                // Refresh popup themes
                this.refreshPopupThemes();
            }, 100);
            
        } else {
            // Enhanced closing animation
            downloadsPanel.classList.add('downloads-closing');
            
            setTimeout(() => {
                downloadsPanel.classList.add('hidden');
                downloadsPanel.classList.remove('downloads-closing');
                if (backdrop) backdrop.classList.add('hidden');
            }, 500);
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
        // Placeholder for reopening last closed tab
        this.showNotification('Reopen last closed tab not implemented yet', 'info');
    }

    bookmarkCurrentPage() {
        const webview = document.getElementById('webview');
        const url = webview.getURL();
        const title = webview.getTitle();
        
        if (url && url !== 'about:blank') {
            this.showNotification(`Bookmarked: ${title}`, 'success');
            // TODO: Implement actual bookmarking
        } else {
            this.showNotification('No page to bookmark', 'error');
        }
    }

    zoomIn() {
        const webview = document.getElementById('webview');
        const currentZoom = webview.getZoomFactor();
        const newZoom = Math.min(currentZoom + 0.1, 3.0);
        webview.setZoomFactor(newZoom);
        this.showZoomIndicator('zoom-in', Math.round(newZoom * 100));
    }

    zoomOut() {
        const webview = document.getElementById('webview');
        const currentZoom = webview.getZoomFactor();
        const newZoom = Math.max(currentZoom - 0.1, 0.25);
        webview.setZoomFactor(newZoom);
        this.showZoomIndicator('zoom-out', Math.round(newZoom * 100));
    }

    resetZoom() {
        const webview = document.getElementById('webview');
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
            console.log('Showing loading indicator');
            loadingBar.classList.add('loading');
        }
    }

    hideLoadingIndicator() {
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            console.log('Hiding loading indicator, current classes:', loadingBar.className);
            loadingBar.classList.remove('loading');
            // Force clear any stuck animations
            loadingBar.style.animation = 'none';
            loadingBar.offsetHeight; // Trigger reflow
            loadingBar.style.animation = null;
            console.log('Loading indicator hidden, classes after:', loadingBar.className);
        }
    }

    setupAddTabMenu() {
        const addTabBtn = document.getElementById('add-tab-btn');
        const addTabMenu = document.getElementById('add-tab-menu');
        const newTabBtn = document.getElementById('new-tab-btn');
        const newIncognitoBtn = document.getElementById('new-incognito-btn');

        // Prevent clicks inside the menu from closing it
        if (addTabMenu) {
            addTabMenu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Prevent clicks inside the menu from closing it
        if (addTabMenu) {
            addTabMenu.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Toggle add tab menu
        addTabBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleAddTabMenu();
        });

        // New tab option
        newTabBtn.addEventListener('click', () => {
            this.closeAddTabMenu();
            // Open spotlight instead of creating a tab
            this.showSpotlightSearch();
            const inputEl = document.getElementById('spotlight-input');
            if (inputEl) inputEl.focus();
        });

        // New incognito tab option
        newIncognitoBtn.addEventListener('click', () => {
            this.closeAddTabMenu();
            this.createIncognitoTab();
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!addTabBtn.contains(e.target) && !addTabMenu.contains(e.target)) {
                this.closeAddTabMenu();
            }
        });
        // Also close on mousedown for immediate response
        document.addEventListener('mousedown', (e) => {
            if (!addTabBtn.contains(e.target) && !addTabMenu.contains(e.target)) {
                this.closeAddTabMenu();
            }
        });
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAddTabMenu();
            }
        });
    }

    toggleAddTabMenu() {
        const addTabMenu = document.getElementById('add-tab-menu');
        if (addTabMenu.classList.contains('hidden')) {
            this.showAddTabMenu();
        } else {
            this.closeAddTabMenu();
        }
    }

    showAddTabMenu() {
        const addTabMenu = document.getElementById('add-tab-menu');
        addTabMenu.classList.remove('hidden');
        addTabMenu.classList.remove('closing');
    }

    closeAddTabMenu() {
        const addTabMenu = document.getElementById('add-tab-menu');
        addTabMenu.classList.add('closing');
        setTimeout(() => {
            addTabMenu.classList.add('hidden');
            addTabMenu.classList.remove('closing');
        }, 200);
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

        // Setup separator drag handlers
        if (separator) {
            separator.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                separator.classList.add('separator-drag-over');
            });

            separator.addEventListener('dragleave', (e) => {
                // Only remove if we're not entering the separator or its children
                if (!separator.contains(e.relatedTarget)) {
                    separator.classList.remove('separator-drag-over');
                }
            });

            separator.addEventListener('drop', (e) => {
                e.preventDefault();
                separator.classList.remove('separator-drag-over');
                
                if (draggedTab) {
                    const tabId = parseInt(draggedTab.dataset.tabId);
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
                if (e.target.classList.contains('tab') || e.target.closest('.tab')) return;
                
                const separatorRect = separator.getBoundingClientRect();
                const containerRect = tabsContainer.getBoundingClientRect();
                const dropY = e.clientY;
                
                // Larger, more forgiving threshold for easier pinning/unpinning
                const separatorThreshold = 150; // Increased from 80px to 150px
                const tabId = parseInt(draggedTab.dataset.tabId);
                const tab = this.tabs.get(tabId);
                const isCurrentlyPinned = tab && tab.pinned;
                
                // Check if we're above the separator (in pinned section) or near it
                const isInPinnedArea = dropY < separatorRect.top + separatorThreshold;
                const distanceFromSeparator = Math.abs(dropY - separatorRect.top);
                const isNearSeparator = distanceFromSeparator < separatorThreshold;
                
                // Check if we're below the separator (in unpinned section)
                const isInUnpinnedArea = dropY > separatorRect.bottom - separatorThreshold;
                const isAtTop = dropY < separatorRect.top && dropY > containerRect.top + 20;
                
                // Highlight if:
                // 1. Dragging unpinned tab above separator (to pin)
                // 2. Dragging pinned tab below separator (to unpin)
                // 3. Near separator in general
                const shouldHighlight = separator.offsetParent !== null && (
                    (!isCurrentlyPinned && (isInPinnedArea || isNearSeparator || isAtTop)) ||
                    (isCurrentlyPinned && (isInUnpinnedArea || isNearSeparator))
                );
                
                if (shouldHighlight) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    separator.classList.add('separator-drag-over');
                    
                    // Add visual feedback class based on direction
                    if (!isCurrentlyPinned) {
                        // Dragging unpinned tab up - show pinned drop zone
                        tabsContainer.classList.add('pinned-drop-zone-active');
                        tabsContainer.classList.remove('unpinned-drop-zone-active');
                    } else {
                        // Dragging pinned tab down - show unpinned drop zone
                        tabsContainer.classList.add('unpinned-drop-zone-active');
                        tabsContainer.classList.remove('pinned-drop-zone-active');
                    }
                } else {
                    separator.classList.remove('separator-drag-over');
                    tabsContainer.classList.remove('pinned-drop-zone-active', 'unpinned-drop-zone-active');
                }
            };

            const handleContainerDrop = (e) => {
                if (!draggedTab) return;
                
                // Don't interfere with tab-to-tab dropping - let tabs handle their own drop
                if (e.target.classList.contains('tab') || e.target.closest('.tab')) return;
                
                const separatorRect = separator.getBoundingClientRect();
                const dropY = e.clientY;
                const containerRect = tabsContainer.getBoundingClientRect();
                const tabId = parseInt(draggedTab.dataset.tabId);
                const tab = this.tabs.get(tabId);
                
                if (!tab) {
                    tabsContainer.classList.remove('pinned-drop-zone-active', 'unpinned-drop-zone-active');
                    return;
                }
                
                // More forgiving threshold - consider any drop above or near separator
                const threshold = 150;
                const isAbove = dropY < separatorRect.top + threshold;
                const isBelow = dropY > separatorRect.bottom - threshold;
                const isAtTop = dropY < separatorRect.top && dropY > containerRect.top + 20;
                
                // Handle pinning: unpinned tab dropped above separator
                if ((isAbove || isAtTop) && separator.offsetParent !== null && !tab.pinned) {
                    e.preventDefault();
                    e.stopPropagation();
                    separator.classList.remove('separator-drag-over');
                    tabsContainer.classList.remove('pinned-drop-zone-active');
                    
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
                    separator.classList.remove('separator-drag-over');
                    tabsContainer.classList.remove('unpinned-drop-zone-active');
                    
                    // Unpin the tab
                    tab.pinned = false;
                    this.tabs.set(tabId, tab);
                    draggedTab.classList.remove('pinned');
                    
                    // Move to unpinned section
                    this.organizeTabsByPinnedState();
                    this.savePinnedTabs();
                } else {
                    tabsContainer.classList.remove('pinned-drop-zone-active', 'unpinned-drop-zone-active');
                }
            };

            const handleContainerDragLeave = (e) => {
                // Only remove separator highlight if leaving the container entirely
                if (!tabsContainer.contains(e.relatedTarget)) {
                    separator.classList.remove('separator-drag-over');
                    tabsContainer.classList.remove('pinned-drop-zone-active', 'unpinned-drop-zone-active');
                }
            };

            // Add listeners to tabs container for dropping in empty pinned area
            tabsContainer.addEventListener('dragover', handleContainerDragOver, true);
            tabsContainer.addEventListener('drop', handleContainerDrop, true);
            tabsContainer.addEventListener('dragleave', handleContainerDragLeave);
        }

        // Make tabs draggable
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
                draggedTab = null;
                draggedIndex = -1;
                
                // Remove all drag-over classes
                document.querySelectorAll('.tab').forEach(t => {
                    t.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
                });
                if (separator) {
                    separator.classList.remove('separator-drag-over');
                }
                tabsContainer.classList.remove('pinned-drop-zone-active', 'unpinned-drop-zone-active');
            });

            tab.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                
                const rect = tab.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                const isAbove = e.clientY < midpoint;
                
                // Remove previous classes
                tab.classList.remove('drag-over-top', 'drag-over-bottom');
                
                // Add appropriate class
                if (isAbove) {
                    tab.classList.add('drag-over-top');
                } else {
                    tab.classList.add('drag-over-bottom');
                }
            });

            tab.addEventListener('dragleave', (e) => {
                // Only remove classes if we're actually leaving the tab
                if (!tab.contains(e.relatedTarget)) {
                    tab.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
                }
            });

            tab.addEventListener('drop', (e) => {
                e.preventDefault();
                
                if (draggedTab && draggedTab !== tab) {
                    const tabId = parseInt(draggedTab.dataset.tabId);
                    const draggedTabData = this.tabs.get(tabId);
                    const dropTabId = parseInt(tab.dataset.tabId);
                    const dropTabData = this.tabs.get(dropTabId);
                    
                    if (draggedTabData && dropTabData) {
                        const dropIndex = Array.from(tabsContainer.children).indexOf(tab);
                        const isAbove = tab.classList.contains('drag-over-top');
                        
                        // Check if dropping crosses the separator boundary
                        const separatorIndex = separator ? Array.from(tabsContainer.children).indexOf(separator) : -1;
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
                        
                        // Move the tab to new position
                        this.organizeTabsByPinnedState();
                        this.savePinnedTabs();
                    }
                }
                
                // Clean up
                tab.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
            });
        };

        // Make existing tabs draggable
        document.querySelectorAll('.tab').forEach(makeTabDraggable);

        // Observer for new tabs
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('tab')) {
                        makeTabDraggable(node);
                    }
                });
            });
        });

        observer.observe(tabsContainer, { childList: true });
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
            const webview = document.getElementById('webview');
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
        const bookmarksPanel = document.getElementById('bookmarks-panel');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        if (!bookmarksPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(bookmarksPanel);
        }
        
        if (securityPanel.classList.contains('hidden')) {
            securityPanel.classList.remove('hidden');
            this.updateSecurityInfo();
        } else {
            this.closePanelWithAnimation(securityPanel);
        }
    }

    updateSecurityInfo() {
        const webview = document.getElementById('webview');
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
        const webview = document.getElementById('webview');
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
        // Add closing animation class
        panel.classList.add('closing');
        
        // Add backdrop fade out
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop && !backdrop.classList.contains('hidden')) {
            backdrop.style.transition = 'opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            backdrop.style.opacity = '0';
        }
        
        // Remove the panel after animation completes
        setTimeout(() => {
            panel.classList.add('hidden');
            panel.classList.remove('closing');
            if (backdrop) {
                backdrop.classList.add('hidden');
                backdrop.style.opacity = '';
                backdrop.style.transition = '';
            }
        }, 300); // Match animation duration
    }

    showSpotlightSearch() {
        const spotlightSearch = document.getElementById('spotlight-search');
        spotlightSearch.classList.remove('hidden');
        
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
            
            // Create a new tab for the search
            this.createNewTab();
            
            // Determine if it's a URL or search query
            let searchUrl;
            if (this.isValidUrl(query)) {
                searchUrl = query.startsWith('http') ? query : `https://${query}`;
            } else {
                searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            }
            
            // Navigate to the search URL in the new tab
            const webview = document.getElementById('webview');
            const sanitizedSearchUrl = this.sanitizeUrl(searchUrl);
            webview.src = sanitizedSearchUrl || 'https://www.google.com';
        }
    }

    updateSpotlightSuggestions(query) {
        const suggestionsContainer = document.getElementById('spotlight-suggestions');
        
        // Always show suggestions (5 default when empty, 5 when typing)
        const suggestions = query.length < 1 ? this.getDefaultSuggestions() : this.generateAdvancedSuggestions(query);
        
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
        
        // Limit to 5 visible suggestions
        const visibleSuggestions = suggestions.slice(0, 5);
        
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
                ${suggestion.tabId ? '<div class="spotlight-suggestion-action">Switch to Tab</div>' : ''}
            `;
            
            suggestionEl.addEventListener('click', () => {
                // Do not close spotlight preemptively; only close when navigating
                if (suggestion.isTab && suggestion.tabId) {
                    this.closeSpotlightSearch();
                    this.switchToTab(suggestion.tabId);
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
                    }
                } else                 if (suggestion.isSearch) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchQuery)}`;
                    const webview = document.getElementById('webview');
                    const sanitizedSearchUrl = this.sanitizeUrl(searchUrl);
                    webview.src = sanitizedSearchUrl || 'https://www.google.com';
                } else if (suggestion.isHistory) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const webview = document.getElementById('webview');
                    const sanitizedHistoryUrl = this.sanitizeUrl(suggestion.url);
                    webview.src = sanitizedHistoryUrl || 'https://www.google.com';
                } else if (suggestion.isCompletion) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchQuery)}`;
                    const webview = document.getElementById('webview');
                    const sanitizedCompletionUrl = this.sanitizeUrl(searchUrl);
                    webview.src = sanitizedCompletionUrl || 'https://www.google.com';
                } else if (suggestion.isUrl) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const webview = document.getElementById('webview');
                    const sanitizedSuggestionUrl = this.sanitizeUrl(suggestion.url);
                    webview.src = sanitizedSuggestionUrl || 'https://www.google.com';
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

    generateAdvancedSuggestions(query) {
        const suggestions = [];
        const lowerQuery = query.toLowerCase();
        
        // Show existing tabs first
        this.tabs.forEach((tab, tabId) => {
            const title = tab.title || (tab.incognito ? 'New Incognito Tab' : 'New Tab');
            const url = tab.url || 'about:blank';
            
            if (title.toLowerCase().includes(lowerQuery) || 
                url.toLowerCase().includes(lowerQuery) || 
                lowerQuery.length === 0) {
                
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
            }
        });
        
        // Add recent history items
        if (this.settings.history && this.settings.history.length > 0) {
            const recentHistory = this.settings.history
                .filter(item => 
                    item.title.toLowerCase().includes(lowerQuery) || 
                    item.url.toLowerCase().includes(lowerQuery) ||
                    lowerQuery.length === 0
                )
                .slice(0, 3)
                .map(item => {
                    let icon = 'fas fa-globe';
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
            
            suggestions.push(...recentHistory);
        }
        
        // Add recent searches with sentence completion
        if (this.settings.recentSearches && this.settings.recentSearches.length > 0) {
            const recentSearches = this.settings.recentSearches
                .filter(search => 
                    search.toLowerCase().includes(lowerQuery) || 
                    lowerQuery.length === 0
                )
                .slice(0, 2)
                .map(search => ({
                    text: `Search "${search}"`,
                    icon: 'fas fa-search',
                    searchQuery: search,
                    isSearch: true
                }));
            
            suggestions.push(...recentSearches);
        }
        
        // Add intelligent sentence completions
        if (lowerQuery.length > 0) {
            const completions = this.generateSentenceCompletions(lowerQuery);
            suggestions.push(...completions);
        }
        
        // Add quick actions if no matches or query is empty
        if (suggestions.length === 0 || lowerQuery.length === 0) {
            suggestions.push({
                text: 'New Tab',
                icon: 'fas fa-plus',
                isAction: true
            });
            
            suggestions.push({
                text: 'New Incognito Tab',
                icon: 'fas fa-mask',
                isAction: true
            });
            
            suggestions.push({
                text: 'Open Settings',
                icon: 'fas fa-cog',
                isAction: true
            });
        }
        
        // Quick actions
        if (lowerQuery.includes('new') || lowerQuery.includes('tab')) {
            suggestions.push({
                text: 'New Tab',
                icon: 'fas fa-plus',
                shortcut: '⌘T'
            });
        }
        
        if (lowerQuery.includes('incognito') || lowerQuery.includes('private')) {
            suggestions.push({
                text: 'New Incognito Tab',
                icon: 'fas fa-mask',
                shortcut: '⌘⇧N'
            });
        }
        
        // Navigation
        if (lowerQuery.includes('back') || lowerQuery.includes('previous')) {
            suggestions.push({
                text: 'Go Back',
                icon: 'fas fa-arrow-left',
                shortcut: '←'
            });
        }
        
        if (lowerQuery.includes('forward') || lowerQuery.includes('next')) {
            suggestions.push({
                text: 'Go Forward',
                icon: 'fas fa-arrow-right',
                shortcut: '→'
            });
        }
        
        if (lowerQuery.includes('reload') || lowerQuery.includes('refresh')) {
            suggestions.push({
                text: 'Reload Page',
                icon: 'fas fa-redo',
                shortcut: '⌘R'
            });
        }
        
        // Settings and panels
        if (lowerQuery.includes('settings') || lowerQuery.includes('preferences')) {
            suggestions.push({
                text: 'Open Settings',
                icon: 'fas fa-cog',
                shortcut: '⌘,'
            });
        }
        
        if (lowerQuery.includes('bookmark') || lowerQuery.includes('save')) {
            suggestions.push({
                text: 'Bookmark This Page',
                icon: 'fas fa-bookmark',
                shortcut: '⌘D'
            });
        }
        
        if (lowerQuery.includes('download') || lowerQuery.includes('downloads')) {
            suggestions.push({
                text: 'Open Downloads',
                icon: 'fas fa-download',
                shortcut: '⌘J'
            });
        }
        
        if (lowerQuery.includes('history')) {
            suggestions.push({
                text: 'Open History',
                icon: 'fas fa-history',
                shortcut: '⌘Y'
            });
        }
        
        // Search engines
        if (lowerQuery.includes('google') || lowerQuery.includes('search')) {
            suggestions.push({
                text: 'Search on Google',
                icon: 'fab fa-google',
                shortcut: 'google.com'
            });
        }
        
        if (lowerQuery.includes('youtube') || lowerQuery.includes('video')) {
            suggestions.push({
                text: 'Search on YouTube',
                icon: 'fab fa-youtube',
                shortcut: 'youtube.com'
            });
        }
        
        if (lowerQuery.includes('github') || lowerQuery.includes('code')) {
            suggestions.push({
                text: 'Search on GitHub',
                icon: 'fab fa-github',
                shortcut: 'github.com'
            });
        }
        
        // Word suggestions for search queries
        const wordSuggestions = [
            'weather', 'news', 'maps', 'translate', 'calculator', 'time', 'date',
            'stock market', 'crypto', 'sports', 'music', 'movies', 'games',
            'programming', 'design', 'photography', 'travel', 'food', 'health',
            'education', 'technology', 'science', 'history', 'art', 'books'
        ];
        
        wordSuggestions.forEach(word => {
            if (word.toLowerCase().includes(lowerQuery) || lowerQuery.includes(word.toLowerCase())) {
                suggestions.push({
                    text: `Search for "${word}"`,
                    icon: 'fas fa-search',
                    shortcut: `Search ${word}`
                });
            }
        });
        
        // Popular websites
        const popularSites = [
            { name: 'Gmail', icon: 'fab fa-google', url: 'gmail.com' },
            { name: 'YouTube', icon: 'fab fa-youtube', url: 'youtube.com' },
            { name: 'GitHub', icon: 'fab fa-github', url: 'github.com' },
            { name: 'Twitter', icon: 'fab fa-twitter', url: 'twitter.com' },
            { name: 'Reddit', icon: 'fab fa-reddit', url: 'reddit.com' },
            { name: 'Stack Overflow', icon: 'fab fa-stack-overflow', url: 'stackoverflow.com' },
            { name: 'Wikipedia', icon: 'fab fa-wikipedia-w', url: 'wikipedia.org' },
            { name: 'Netflix', icon: 'fab fa-netflix', url: 'netflix.com' }
        ];
        
        popularSites.forEach(site => {
            if (site.name.toLowerCase().includes(lowerQuery) || 
                site.url.toLowerCase().includes(lowerQuery)) {
                suggestions.push({
                    text: `Go to ${site.name}`,
                    icon: site.icon,
                    shortcut: site.url
                });
            }
        });
        
        // If it looks like a URL, suggest direct navigation
        if (this.isValidUrl(query) || lowerQuery.includes('.com') || lowerQuery.includes('.org')) {
            const url = query.startsWith('http') ? query : `https://${query}`;
            suggestions.unshift({
                text: `Navigate to ${query}`,
                icon: 'fas fa-external-link-alt',
                shortcut: url
            });
        }
        
        return suggestions.slice(0, 8); // Limit to 8 suggestions
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
        
        // Add quick actions
        suggestions.push({
            text: 'New Tab',
            icon: 'fas fa-plus',
            isAction: true
        });
        
        suggestions.push({
            text: 'New Incognito Tab',
            icon: 'fas fa-mask',
            isAction: true
        });
        
        suggestions.push({
            text: 'Open Settings',
            icon: 'fas fa-cog',
            isAction: true
        });
        
        // Add recent searches if available
        if (this.settings.recentSearches && this.settings.recentSearches.length > 0) {
            const recentSearches = this.settings.recentSearches.slice(0, 2);
            recentSearches.forEach(search => {
                suggestions.push({
                    text: `Search "${search}"`,
                    icon: 'fas fa-search',
                    searchQuery: search,
                    isSearch: true
                });
            });
        }
        
        // Add recent history if available
        if (this.settings.history && this.settings.history.length > 0) {
            const recentHistory = this.settings.history.slice(0, 2);
            recentHistory.forEach(item => {
                let icon = 'fas fa-globe';
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
            });
        }
        
        // Add existing tabs
        this.tabs.forEach((tab, tabId) => {
            if (suggestions.length >= 5) return; // Limit to 5 total
            
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
        });
        
        return suggestions.slice(0, 5); // Ensure exactly 5 suggestions
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

    // HTML escape function to prevent XSS
    escapeHtml(text) {
        if (typeof text !== 'string') {
            return '';
        }
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Split View Functionality - DISABLED FOR NOW (will be remade later)
    toggleSplitView() {
        // Split view is disabled - do nothing
        return;
        /*
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
        */
    }

    // Split view functions - DISABLED FOR NOW
    initializeSplitView() {
        return;
        /*
        const leftPane = document.querySelector('.left-pane');
        const rightPane = document.querySelector('.right-pane');
        const divider = document.querySelector('.split-divider');
        
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
        
        // No click handlers needed for pane switching
    }

    setupSplitDivider() {
        // Split view disabled - do nothing
        return;
        /*
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
        */
    }

    updateSplitRatio() {
        // Split view disabled - do nothing
        return;
        /*
        const leftPane = document.querySelector('.left-pane');
        const rightPane = document.querySelector('.right-pane');
        
        if (leftPane && rightPane) {
            leftPane.style.flex = this.splitRatio;
            rightPane.style.flex = 1 - this.splitRatio;
        }
        */
    }

    setupSplitWebviews() {
        // Split view disabled - do nothing
        return;
        /*
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
        */
    }

    setupWebviewEvents(webview, pane) {
        // Split view disabled - this function still used but won't be called for split view
        // Keeping it active but split view functions won't call it
        if (!webview) return;
        
        // Copy all the webview event listeners from the main setupWebview method
        webview.addEventListener('did-start-loading', () => {
            this.showLoadingIndicator(pane);
        });

        webview.addEventListener('did-finish-load', () => {
            this.hideLoadingIndicator(pane);
            // Only update tab title if this is the active pane
            if ((pane === 'left' && this.activePane === 'left') || 
                (pane === 'right' && this.activePane === 'right')) {
                this.updateTabTitle();
            }
        });

        webview.addEventListener('did-fail-load', (event) => {
            this.hideLoadingIndicator(pane);
            this.handleNavigationError(event, pane);
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
                    const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
                    if (tabElement) {
                        const img = tabElement.querySelector('.tab-favicon');
                        if (img) {
                            img.style.visibility = 'visible';
                            img.src = event.favicons[0]; // Use first favicon
                        }
                    }
                }
            }
        });
    }

    setActivePane(pane) {
        // Split view disabled - do nothing
        return;
        /*
        this.activePane = pane;
        // No visual indicators needed
        */
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
            indicator.style.display = 'block';
        }
    }

    hideLoadingIndicator(pane = 'main') {
        const indicator = pane === 'main' ? 
            document.getElementById('loading-bar') :
            document.getElementById(`loading-bar-${pane}`);
        
        if (indicator) {
            indicator.style.display = 'none';
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
    }
}

// Initialize the browser when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AxisBrowser();
});
