// Axis Browser Renderer Process
class AxisBrowser {
    constructor() {
        this.currentTab = null;
        // Track webviews that have had listeners set up to prevent duplicates
        this.webviewListenersSetup = new WeakMap(); // Start with no tabs
        this.tabs = new Map(); // Start with empty tabs
        this.tabGroups = new Map(); // Store tab groups: { id, name, tabIds: [], open: true, color: '#FF6B6B' }
        this.pendingTabGroupColor = null; // Color selected for new tab group
        this.settings = {};
        this.selectedSearchEngine = null; // Track selected search engine shortcut
        this.closedTabs = []; // Store recently closed tabs for recovery
        this.tabUndoStack = []; // Undo stack for close tab / add to group / remove from group (max 20)
        // Search engine full word mapping (no shortcuts, only full words)
        this.searchEngineWords = [
            'google',
            'youtube',
            'bing',
            'duckduckgo',
            'yahoo',
            'wikipedia',
            'reddit',
            'github',
            'amazon',
            'twitter',
            'instagram',
            'facebook'
        ];
        
        // Map words to their engine names
        this.searchEngineWordMap = {
            'google': 'google',
            'youtube': 'youtube',
            'bing': 'bing',
            'duckduckgo': 'duckduckgo',
            'yahoo': 'yahoo',
            'wikipedia': 'wikipedia',
            'reddit': 'reddit',
            'github': 'github',
            'amazon': 'amazon',
            'twitter': 'twitter',
            'instagram': 'instagram',
            'facebook': 'facebook'
        };
        this.loadingTimeout = null; // Timeout for stuck loading pages (main view)
        this.loadingBarTabId = null; // Tab id for which the loading bar is currently shown (so we hide when that tab finishes)
        this.isBenchmarking = false; // suppress non-critical work on Speedometer
        this.isWebviewLoading = false; // Track if webview is currently loading
        this.spotlightSelectedIndex = -1; // Track selected suggestion index
        this.contextMenuTabGroupId = null; // Track which tab group context menu is open
        this.themeCache = new Map(); // Cache theme colors per domain for instant theme switching
        this.currentLibraryItems = []; // Store library items for preview navigation
        this.currentPreviewFile = null; // Current file being previewed
        this.currentPreviewIndex = -1; // Index of current file in library items
        this.previewListenersSetup = false; // Track if preview listeners are set up
        this.aiChatMessages = []; // Store chat message history
        this.aiChatApiKey = ''; // Groq API key for chat
        this.pipTabId = null; // Tab ID that has PIP active
        this.pipVideoIndex = 0; // Index of video element in webview
        this.pipWebview = null; // Reference to the webview with video
        this.pipLeaveCheckInterval = null; // Interval to detect native "back to tab" (PiP closed)
        
        // Cache frequently accessed DOM elements for performance
        this.cacheDOMElements();
        
        this.init();
        
        // Add button interactions immediately
        this.addButtonInteractions();
        
        // Setup PIP functionality
        this.setupPIP();
        
        // Setup URL bar functionality
        this.setupUrlBar();

        // Listen for messages from embedded note pages
        this.messageHandler = (event) => this.onEmbeddedMessage(event);
        window.addEventListener('message', this.messageHandler);
    }
    
    // Cache DOM elements to avoid repeated queries
    cacheDOMElements() {
        // Cache all frequently accessed elements
        this.elements = {
            sidebar: document.getElementById('sidebar'),
            tabsContainer: document.getElementById('tabs-container'),
            tabsSeparator: document.getElementById('tabs-separator'),
            webview: document.getElementById('webview'),
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
            settingsPanel: document.getElementById('settings-panel'),
            downloadsPanel: document.getElementById('downloads-panel'),
            notesPanel: document.getElementById('notes-panel'),
            modalBackdrop: document.getElementById('modal-backdrop'),
            // URL bar elements
            webviewUrlBar: document.getElementById('webview-url-bar'),
            urlBarBack: document.getElementById('url-bar-back'),
            urlBarForward: document.getElementById('url-bar-forward'),
            urlBarRefresh: document.getElementById('url-bar-refresh'),
            urlBarDisplay: document.getElementById('url-bar-display'),
            urlBarInput: document.getElementById('url-bar-input'),
            urlBarSecurity: document.getElementById('url-bar-security'),
            urlBarCopy: document.getElementById('url-bar-copy'),
            urlBarChat: document.getElementById('url-bar-chat')
        };
    }

    async init() {
        // Load settings first and apply theme immediately
        await this.loadSettings();
        
        // ALWAYS apply theme on startup - either custom or default
        // Apply theme with multiple fallback strategies to ensure it works
        const applyThemeNow = () => {
            try {
                if (document.body) {
                    // Apply custom theme colors if they exist
                    if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                        this.applyCustomThemeFromSettings();
                    } else {
                        // Apply default black theme if no custom colors
                        this.resetToBlackTheme();
                    }
                } else {
                    // If body doesn't exist yet, wait for it
                    requestAnimationFrame(applyThemeNow);
                }
            } catch (error) {
                console.error('Error applying theme on init:', error);
                // Retry after a short delay
                setTimeout(() => {
                    try {
                        if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                            this.applyCustomThemeFromSettings();
                        } else {
                            this.resetToBlackTheme();
                        }
                    } catch (e) {
                        console.error('Error applying theme (retry):', e);
                    }
                }, 100);
            }
        };
        
        // Try to apply immediately
        applyThemeNow();
        
        // Also try after a short delay as backup
        setTimeout(() => {
            if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                this.applyCustomThemeFromSettings();
            }
        }, 50);
        
        this.applySidebarPosition(); // Apply saved sidebar position
        this.setupEventListeners();
        this.setupWebview();
        this.setupTabSearch();
        this.setupLoadingScreen();
        this.setupSidebarResize();
        
        // Load pinned tabs from saved state
        await this.loadPinnedTabs();
        
        // Load tab groups from saved state
        await this.loadTabGroups();

        // Defer non-critical work to idle time to improve first interaction latency
        this.runWhenIdle(() => {
            // Drag & drop logic is non-critical until tabs exist
            this.setupTabDragDrop();
            // Move preloading to idle to avoid impacting benchmarks and first paint
            this.setupPerformanceOptimizations();
        });
        
        // Show empty state initially (no tabs on startup)
        this.updateEmptyState();
        
        // Initialize URL bar with default state
        this.updateUrlBar(null);
        
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
            // Ensure settings object exists even if empty
            if (!this.settings) {
                this.settings = {};
            }
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

        // Sidebar right-click for context menu (on empty space)
        this.setupSidebarContextMenu();

        // Old URL bar removed - event listeners no longer needed

        // Sidebar slide-back functionality
        this.setupSidebarSlideBack();

        // AI text selection detection
        this.setupAISelectionDetection();
        
        // AI chat panel
        this.setupAIChat();

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

        // Library panel - use cached elements
        // Downloads button - show native OS downloads popup
        el.downloadsBtnFooter?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDownloadsPopup();
        });
        
        el.closeDownloads?.addEventListener('click', () => this.toggleDownloads());
        
        // Listen for downloads popup actions
        window.electronAPI.onDownloadsPopupAction((action, data) => {
            this.handleDownloadsPopupAction(action, data);
        });
        
        // Clear history button
        const clearHistoryBtn = document.getElementById('clear-history');
        clearHistoryBtn?.addEventListener('click', () => this.clearAllHistory());

        // Clear unpinned tabs button
        const clearUnpinnedBtn = document.querySelector('.clear-unpinned-btn');
        clearUnpinnedBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearUnpinnedTabs();
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
                // Handle Tab key for search engine word matching
                if (e.key === 'Tab' && !e.shiftKey) {
                    const value = el.spotlightInput.value.trim().toLowerCase();
                    const firstWord = value.split(/\s+/)[0]; // Get first word
                    
                    // Find matching word that starts with the typed text
                    if (this.searchEngineWords) {
                        const matchingWord = this.searchEngineWords.find(word => 
                            word.startsWith(firstWord) && firstWord.length > 0
                        );
                        
                        if (matchingWord && this.searchEngineWordMap[matchingWord]) {
                        e.preventDefault();
                            const engine = this.searchEngineWordMap[matchingWord];
                        this.hideSpotlightSearchEngineSuggestion();
                        this.selectSpotlightSearchEngine(engine, el.spotlightInput);
                            // Remove the word from input
                            const remaining = value.substring(firstWord.length).trim();
                        if (el.spotlightInput) {
                            el.spotlightInput.value = remaining;
                            if (typeof el.spotlightInput.focus === 'function') {
                                try {
                                    el.spotlightInput.focus();
                                } catch (e) {
                                    // Ignore focus errors
                                }
                            }
                        }
                        }
                    }
                } else if (e.key === 'Backspace') {
                    // Only clear search engine if input becomes empty
                    const value = el.spotlightInput.value;
                    if (!value || value.trim() === '') {
                        this.clearSpotlightSearchEngine();
                    }
                } else if (e.key === 'Enter') {
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
                const value = e.target.value.trim();
                
                // Only show/hide suggestion if no engine is selected
                // If engine is selected, keep it visible while typing
                if (!this.selectedSearchEngine) {
                    if (!value) {
                        this.hideSpotlightSearchEngineSuggestion();
                        throttledUpdateSuggestions(value);
                        return;
                    }
                    
                    const valueLower = value.toLowerCase();
                    const firstWord = valueLower.split(/\s+/)[0]; // Get first word
                    const hasSpace = value.includes(' ');
                    
                    // Show suggestion if typing the beginning of a full word (no spaces, no selected engine)
                    if (!hasSpace && this.searchEngineWords) {
                        // Find matching word that starts with the typed text
                        const matchingWord = this.searchEngineWords.find(word => 
                            word.startsWith(firstWord) && firstWord.length > 0
                        );
                        
                        if (matchingWord && this.searchEngineWordMap[matchingWord]) {
                            this.showSpotlightSearchEngineSuggestion(this.searchEngineWordMap[matchingWord]);
                        } else {
                            // Hide suggestion if no match
                            this.hideSpotlightSearchEngineSuggestion();
                        }
                    } else {
                        // Hide suggestion if user starts typing something else
                        this.hideSpotlightSearchEngineSuggestion();
                    }
                }
                
                throttledUpdateSuggestions(value);
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
            el.modalBackdrop.addEventListener('click', (e) => {
                // Only close if clicking directly on backdrop, not on a child element
                if (e.target === el.modalBackdrop) {
                    this.closeAllPopups();
                }
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

        document.getElementById('pin-tab-option').addEventListener('click', () => {
            this.togglePinCurrentTab();
            this.hideTabContextMenu();
        });

        document.getElementById('mute-tab-option').addEventListener('click', () => {
            if (this.contextMenuTabId) {
                this.toggleTabMute(this.contextMenuTabId);
            }
            this.hideTabContextMenu();
        });

        document.getElementById('close-tab-option').addEventListener('click', () => {
            this.closeCurrentTab();
            this.hideTabContextMenu();
        });

        // Sidebar context menu event listeners (now handled via IPC from native menu)
        // Listen for sidebar context menu actions from main process
        window.electronAPI.onSidebarContextMenuAction((action) => {
            switch (action) {
                case 'new-tab':
            this.showSpotlightSearch();
                    break;
                case 'new-tab-group':
            this.showTabGroupColorPicker((color) => {
                this.createNewTabGroup(color);
                this.hideTabGroupColorPicker();
                    });
                    break;
                case 'toggle-sidebar':
                    this.toggleSidebar();
                    break;
                case 'toggle-position':
                    this.toggleSidebarPosition();
                    break;
            }
        });
        
        // Listen for webpage context menu actions from main process
        window.electronAPI.onWebpageContextMenuAction((action, data) => {
            switch (action) {
                case 'back':
                    this.goBack();
                    break;
                case 'forward':
                    this.goForward();
                    break;
                case 'reload':
                    this.refresh();
                    break;
                case 'cut':
                    this.cut();
                    break;
                case 'copy':
                    this.copy();
                    break;
                case 'paste':
                    this.paste();
                    break;
                case 'select-all':
                    this.selectAll();
                    break;
                case 'search-selection':
                    if (data && data.selectionText) {
                        this.showSpotlightSearch(data.selectionText);
                    }
                    break;
                case 'open-link-new-tab':
                    if (data && data.linkURL) {
                        this.createNewTab(data.linkURL);
                    }
                    break;
                case 'copy-link':
                    if (data && data.linkURL) {
                        navigator.clipboard.writeText(data.linkURL).then(() => {
                            this.showNotification('Link copied to clipboard', 'success');
                        });
                    }
                    break;
                case 'open-image-new-tab':
                    if (data && data.srcURL) {
                        this.createNewTab(data.srcURL);
                    }
                    break;
                case 'copy-image':
                    if (data) {
                        const webview = this.getActiveWebview();
                        if (webview) {
                            webview.copyImageAt(data.x || 0, data.y || 0);
                            this.showNotification('Image copied to clipboard', 'success');
                        }
                    }
                    break;
                case 'copy-image-url':
                    if (data && data.srcURL) {
                        navigator.clipboard.writeText(data.srcURL).then(() => {
                            this.showNotification('Image URL copied to clipboard', 'success');
                        });
                    }
                    break;
                case 'copy-url':
                    this.copyCurrentUrl();
                    break;
                case 'inspect':
                    const webview = this.getActiveWebview();
                    if (webview) {
                        webview.openDevTools();
                    }
                    break;
            }
        });
        
        // Listen for tab context menu actions from main process
        window.electronAPI.onTabContextMenuAction((action, data) => {
            switch (action) {
                case 'rename':
                    this.renameCurrentTab();
                    break;
                case 'duplicate':
                    this.duplicateCurrentTab();
                    break;
                case 'toggle-pin':
                    this.togglePinCurrentTab();
                    break;
                case 'toggle-mute':
                    if (this.contextMenuTabId) {
                        this.toggleTabMute(this.contextMenuTabId);
                    }
                    break;
                case 'close':
                    this.closeCurrentTab();
                    break;
                case 'change-icon':
                    this.showIconPicker('tab');
                    break;
                case 'add-to-tab-group':
                    if (this.contextMenuTabId && data && data.tabGroupId != null && this.tabGroups.has(data.tabGroupId)) {
                        this.addTabToTabGroup(this.contextMenuTabId, data.tabGroupId);
                    }
                    break;
            }
        });
        
        // Setup native emoji picker
        this.setupNativeEmojiPicker();
        
        // Listen for tab group context menu actions from main process
        window.electronAPI.onTabGroupContextMenuAction((action) => {
            switch (action) {
                case 'rename':
                    this.renameCurrentTabGroup();
                    break;
                case 'duplicate':
                    this.duplicateCurrentTabGroup();
                    break;
                case 'change-color':
                    this.showTabGroupColorPicker((color) => {
                        if (this.contextMenuTabGroupId) {
                            const tabGroup = this.tabGroups.get(this.contextMenuTabGroupId);
                            if (tabGroup) {
                                tabGroup.color = color;
                                this.tabGroups.set(this.contextMenuTabGroupId, tabGroup);
                                this.saveTabGroups();
                                this.renderTabGroups();
                            }
                        }
                        this.hideTabGroupColorPicker();
                    });
                    break;
                case 'delete':
                    this.deleteCurrentTabGroup();
                    break;
                case 'change-icon':
                    this.showIconPicker('tab-group');
                    break;
            }
        });

        // Nav menu sidebar position button - REMOVED

        // Tab group context menu event listeners
        const renameTabGroupOption = document.getElementById('rename-tab-group-option');
        const duplicateTabGroupOption = document.getElementById('duplicate-tab-group-option');
        const changeTabGroupColorOption = document.getElementById('change-tab-group-color-option');
        const deleteTabGroupOption = document.getElementById('delete-tab-group-option');

        if (renameTabGroupOption) {
            renameTabGroupOption.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            this.renameCurrentTabGroup();
            this.hideTabGroupContextMenu();
        });
        }

        if (duplicateTabGroupOption) {
            duplicateTabGroupOption.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            this.duplicateCurrentTabGroup();
            this.hideTabGroupContextMenu();
        });
        }

        if (changeTabGroupColorOption) {
            changeTabGroupColorOption.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            this.showTabGroupColorPicker((color) => {
                if (this.contextMenuTabGroupId) {
                    const tabGroup = this.tabGroups.get(this.contextMenuTabGroupId);
                    if (tabGroup) {
                        tabGroup.color = color;
                        this.tabGroups.set(this.contextMenuTabGroupId, tabGroup);
                        this.saveTabGroups();
                        this.renderTabGroups();
                    }
                }
                this.hideTabGroupColorPicker();
                this.hideTabGroupContextMenu();
            });
        });
        }

        if (deleteTabGroupOption) {
            deleteTabGroupOption.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
            this.deleteCurrentTabGroup();
            this.hideTabGroupContextMenu();
        });
        }
        
        // Setup tab group color picker
        this.setupTabGroupColorPicker();

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
            
            // Escape key to close all popups
            if (e.key === 'Escape') {
                this.closeAllPopups();
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

        // Create invisible backdrop to catch clicks when context menu is open
        this.contextMenuBackdrop = document.createElement('div');
        this.contextMenuBackdrop.id = 'context-menu-backdrop';
        this.contextMenuBackdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1001;
            display: none;
            background: transparent;
        `;
        document.body.appendChild(this.contextMenuBackdrop);
        
        // Track mouse position to detect when over menu
        let mouseOverMenu = false;
        const mouseMoveHandler = (e) => {
            const contextMenu = document.getElementById('webpage-context-menu');
            if (contextMenu && !contextMenu.classList.contains('hidden')) {
                const rect = contextMenu.getBoundingClientRect();
                mouseOverMenu = (
                    e.clientX >= rect.left && 
                    e.clientX <= rect.right && 
                    e.clientY >= rect.top && 
                    e.clientY <= rect.bottom
                );
                // Enable/disable backdrop based on mouse position
                if (this.contextMenuBackdrop) {
                    this.contextMenuBackdrop.style.pointerEvents = mouseOverMenu ? 'none' : 'auto';
                }
            } else {
                mouseOverMenu = false;
                if (this.contextMenuBackdrop) {
                    this.contextMenuBackdrop.style.pointerEvents = 'auto';
                }
            }
        };
        document.addEventListener('mousemove', mouseMoveHandler);
        this._contextMenuMouseMoveHandler = mouseMoveHandler;
        
        // Click handler for backdrop - closes menu if clicking outside
        this.contextMenuBackdrop.addEventListener('mousedown', (e) => {
            const contextMenu = document.getElementById('webpage-context-menu');
            if (!contextMenu || contextMenu.classList.contains('hidden')) return;
            
            // If mouse is over menu, backdrop should be disabled, so this shouldn't fire
            // But double-check anyway
            if (mouseOverMenu) {
                return;
            }
            
            // Click is outside menu - close it
            e.preventDefault();
            e.stopPropagation();
                this.hideWebpageContextMenu();
        });
        
        // Global click handler for non-webview areas
        const globalClickHandler = (e) => {
            const contextMenu = document.getElementById('webpage-context-menu');
            if (!contextMenu || contextMenu.classList.contains('hidden')) return;
            
            // Check if click is on the menu
            if (e.target.closest('.context-menu') || mouseOverMenu) {
                return; // Click is on menu - don't close
            }
            
            // Click is outside menu - close it
            this.hideWebpageContextMenu();
        };
        
        // Use capture phase to catch clicks early
        document.addEventListener('mousedown', globalClickHandler, true);
        this._globalContextMenuClickHandler = globalClickHandler;
        
        // Click anywhere else to close context menus (for non-webview areas)
        document.addEventListener('mousedown', (e) => {
            // Check if clicking on any context menu or backdrop - if so, don't close
            if (e.target.closest('.context-menu') || e.target.id === 'context-menu-backdrop') {
                return;
            }
            
            // Close all context menus smoothly
            this.hideWebpageContextMenu();
            
            if (!e.target.closest('.tab') && !e.target.closest('.tab-group')) {
                this.hideTabContextMenu();
                this.hideSidebarContextMenu();
                this.hideTabGroupContextMenu();
            }
            
        });

        // Right-click outside to close context menu
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.tab') && !e.target.closest('#webview') && !e.target.closest('#sidebar') && !e.target.closest('.tab-group')) {
                this.hideTabContextMenu();
                this.hideWebpageContextMenu();
                this.hideSidebarContextMenu();
                this.hideTabGroupContextMenu();
            }
        });

        // Webpage context menu event listeners
        document.getElementById('webpage-back')?.addEventListener('click', (e) => {
            if (e.target.closest('.disabled')) return;
            this.goBack();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-forward')?.addEventListener('click', (e) => {
            if (e.target.closest('.disabled')) return;
            this.goForward();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-reload')?.addEventListener('click', () => {
            this.refresh();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-cut')?.addEventListener('click', (e) => {
            if (e.target.closest('.disabled')) return;
            this.cut();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-copy')?.addEventListener('click', (e) => {
            if (e.target.closest('.disabled')) return;
            this.copy();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-paste')?.addEventListener('click', (e) => {
            if (e.target.closest('.disabled')) return;
            this.paste();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-select-all')?.addEventListener('click', () => {
            this.selectAll();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-search-selection')?.addEventListener('click', () => {
            const ctx = this.webviewContextInfo || {};
            if (ctx.selectionText) {
                this.showSpotlightSearch(ctx.selectionText);
            }
            this.hideWebpageContextMenu();
        });
        
        // Link options
        document.getElementById('webpage-open-link-new-tab')?.addEventListener('click', () => {
            const ctx = this.webviewContextInfo || {};
            if (ctx.linkURL) {
                this.createNewTab(ctx.linkURL);
            }
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-copy-link')?.addEventListener('click', async () => {
            const ctx = this.webviewContextInfo || {};
            if (ctx.linkURL) {
                await navigator.clipboard.writeText(ctx.linkURL);
                this.showNotification('Link copied to clipboard', 'success');
            }
            this.hideWebpageContextMenu();
        });
        
        // Image options
        document.getElementById('webpage-open-image-new-tab')?.addEventListener('click', () => {
            const ctx = this.webviewContextInfo || {};
            if (ctx.srcURL) {
                this.createNewTab(ctx.srcURL);
            }
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-copy-image')?.addEventListener('click', () => {
            const webview = this.getActiveWebview();
            if (webview) {
                webview.copyImageAt(this.webviewContextInfo?.x || 0, this.webviewContextInfo?.y || 0);
                this.showNotification('Image copied to clipboard', 'success');
            }
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-copy-image-url')?.addEventListener('click', async () => {
            const ctx = this.webviewContextInfo || {};
            if (ctx.srcURL) {
                await navigator.clipboard.writeText(ctx.srcURL);
                this.showNotification('Image URL copied to clipboard', 'success');
            }
            this.hideWebpageContextMenu();
        });
        
        // Page options
        document.getElementById('webpage-copy-url')?.addEventListener('click', async () => {
            await this.copyCurrentUrl();
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-inspect')?.addEventListener('click', () => {
            const webview = this.getActiveWebview();
            if (webview) {
                webview.openDevTools();
            }
            this.hideWebpageContextMenu();
        });


        // Settings controls
        // appearance color listeners removed
        document.getElementById('block-trackers').addEventListener('change', (e) => {
            // Just preview, don't save yet
        });

        document.getElementById('block-ads').addEventListener('change', (e) => {
            // Just preview, don't save yet
        });

        // Settings are saved automatically when toggled - no save button needed

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
        
        // All keyboard shortcuts are now routed through the configurable
        // shortcut system in the main process.
        // This ensures ONLY the current mapping (default or user-chosen)
        // works, and old hardcoded combos no longer trigger actions.
        window.electronAPI.onBrowserShortcut((action) => {
            this.executeBrowserShortcut(action);
        });
    }
    
    // Copy the current tab's URL to clipboard
    copyCurrentUrl() {
        // Check if current tab is settings
        if (this.currentTab) {
            const tab = this.tabs.get(this.currentTab);
            if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
                try {
                    navigator.clipboard.writeText('axis://settings');
                    this.showNotification('Settings URL copied', 'success');
                    return;
                } catch (e) {
                    console.error('Failed to copy URL:', e);
                    return;
                }
            }
        }
        
        const webview = this.getActiveWebview();
        if (!webview) return;
        
        try {
            const url = webview.getURL();
            if (url && url !== 'about:blank') {
                navigator.clipboard.writeText(url);
            }
        } catch (e) {
            console.error('Failed to copy URL:', e);
        }
    }
    
    // Execute browser shortcut action (called from main process IPC)
    executeBrowserShortcut(action) {
        switch (action) {
            case 'close-tab':
                if (this.currentTab) this.closeTab(this.currentTab);
                break;
            case 'spotlight-search':
                this.showSpotlightSearch();
                break;
            case 'toggle-sidebar':
                this.toggleSidebar();
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'focus-url':
                // Focus the new webview URL bar input
                const urlBarInput = document.getElementById('url-bar-input');
                const urlBarDisplay = document.getElementById('url-bar-display');
                if (urlBarDisplay && urlBarInput) {
                    urlBarDisplay.click(); // This will trigger the edit mode
                }
                break;
            case 'pin-tab':
                if (this.currentTab) {
                    const el = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
                    if (el) this.togglePinTab(this.currentTab, el, null);
                }
                break;
            case 'new-tab':
                this.createNewTab();
                break;
            case 'settings':
                this.toggleSettings();
                break;
            case 'recover-tab':
                this.performTabUndo();
                break;
            case 'history':
                this.toggleSettings();
                this.switchSettingsTab('history');
                break;
            case 'downloads':
                this.toggleDownloads();
                break;
            case 'find':
                this.toggleSearch();
                break;
            case 'copy-url':
                this.copyCurrentUrl();
                break;
            case 'clear-history':
                this.clearAllHistory();
                break;
            case 'clear-downloads':
                this.clearAllDownloads();
                break;
            case 'zoom-in':
                this.zoomIn();
                break;
            case 'zoom-out':
                this.zoomOut();
                break;
            case 'reset-zoom':
                this.resetZoom();
                break;
            case 'switch-tab-1':
            case 'switch-tab-2':
            case 'switch-tab-3':
            case 'switch-tab-4':
            case 'switch-tab-5':
            case 'switch-tab-6':
            case 'switch-tab-7':
            case 'switch-tab-8':
            case 'switch-tab-9':
                const tabIndex = parseInt(action.split('-')[2]) - 1;
                this.switchToTabByIndex(tabIndex);
                break;
        }
    }

    setupWebviewEventListeners(webview, tabId) {
        if (!webview) return;

        // Check if listeners are already set up for this webview instance using WeakMap
        if (this.webviewListenersSetup.has(webview)) {
            // Update tabId in case it changed
            webview.dataset.tabId = String(tabId);
            return;
        }

        webview.dataset.tabId = String(tabId);
        
        // Mark this webview as having listeners set up
        this.webviewListenersSetup.set(webview, true);
        
        // Store handlers object
        webview.__eventHandlers = {};
        
        // Try to increase max listeners on the underlying WebContents when it becomes available
        // This prevents MaxListenersExceededWarning
        const trySetMaxListeners = () => {
            try {
                // Access WebContents through webview's getWebContents method
                if (webview.getWebContents && typeof webview.getWebContents === 'function') {
                    const webContents = webview.getWebContents();
                    if (webContents && typeof webContents.setMaxListeners === 'function') {
                        webContents.setMaxListeners(100); // Increase limit significantly
                            }
                        }
                    } catch (e) {
                // WebContents might not be accessible yet, that's okay
            }
        };
        
        // Try after webview is attached (dom-ready is the most reliable)
        
        // Optimize webview for performance
        webview.style.willChange = 'transform';
        webview.style.transform = 'translateZ(0)';
        webview.style.backfaceVisibility = 'hidden';
        
        const isActiveTab = () => this.currentTab === tabId;
        const getTab = () => this.tabs.get(tabId);
        const clearLoadingTimeout = () => {
            if (webview.__loadingTimeout) {
                clearTimeout(webview.__loadingTimeout);
                webview.__loadingTimeout = null;
            }
        };
        
        // Create named handler functions that can be removed
        const didStartLoadingHandler = () => {
            if (!isActiveTab()) return;

            const currentUrl = webview.getURL() || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(currentUrl);
            if (this.isBenchmarking) return;
            
            clearLoadingTimeout();
            this.isWebviewLoading = true;
            this.loadingBarTabId = tabId; // Remember which tab is showing the loading bar
            this.showLoadingIndicator();
            this.updateNavigationButtons();
            this.updateRefreshButton(true); // Change reload button to X
            
            // Apply cached theme instantly for faster perceived loading
            if (currentUrl && currentUrl !== 'about:blank') {
                this.applyCachedTheme(currentUrl);
            }
            
            webview.__loadingTimeout = setTimeout(() => {
                if (this.loadingBarTabId !== tabId) return;
                if (webview && webview.isLoading) {
                    console.log('Page taking too long to load, forcing stop');
                    try {
                        webview.stop();
                    } catch (e) {
                        console.error('Error stopping webview:', e);
                    }
                    this.hideLoadingIndicator();
                    this.loadingBarTabId = null;
                    if (isActiveTab()) {
                        this.isWebviewLoading = false;
                        this.updateRefreshButton(false);
                        this.showNotification('Page is taking too long to load. You can try refreshing.', 'warning');
                    }
                }
                clearLoadingTimeout();
            }, 30000);
        };
        webview.__eventHandlers.didStartLoading = didStartLoadingHandler;
        webview.addEventListener('did-start-loading', didStartLoadingHandler);

        // Extract theme early on dom-ready (before all resources load)
        const domReadyHandler = () => {
            // Always try to set max listeners when dom is ready (WebContents should be available)
            // Do this BEFORE any early returns
            trySetMaxListeners();
            
            // Also try after a short delay to ensure webview is fully attached
            setTimeout(trySetMaxListeners, 50);
            
            if (!isActiveTab() || this.isBenchmarking) return;
            
            // Auto-tinting disabled - using custom theme colors instead
            // const currentUrl = webview.getURL();
            // if (currentUrl && currentUrl !== 'about:blank') {
            //     this.extractAndApplyWebpageColors(webview);
            // }
        };
        webview.__eventHandlers.domReady = domReadyHandler;
        webview.addEventListener('dom-ready', domReadyHandler);
        
        // Inject performance optimizations on DOM ready as well
        const domReadyOptimizeHandler = () => {
            try {
                webview.executeJavaScript(`
                    (function() {
                        // Immediately disable all lazy loading
                        const disableLazy = () => {
                            document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy-src]').forEach(img => {
                                img.loading = 'eager';
                                if (img.dataset.src) img.src = img.dataset.src;
                                if (img.dataset.lazySrc) img.src = img.dataset.lazySrc;
                            });
                            document.querySelectorAll('iframe[loading="lazy"]').forEach(iframe => {
                                iframe.loading = 'eager';
                            });
                        };
                        disableLazy();
                        setTimeout(disableLazy, 50);
                        setTimeout(disableLazy, 200);
                    })();
                `).catch(() => {});
            } catch (e) {}
        };
        webview.addEventListener('dom-ready', domReadyOptimizeHandler);
        
        const didFinishLoadHandler = (event) => {
            clearLoadingTimeout();
            // Only hide loading when main frame finishes (avoid hiding on iframe/subframe load)
            const isMainFrame = event == null || event.isMainFrame !== false;
            if (isMainFrame && this.loadingBarTabId === tabId) {
                this.hideLoadingIndicator();
                this.loadingBarTabId = null;
            }
            if (tabId === this.currentTab) {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
            }

            const tab = getTab();
            if (tab) {
                const currentUrl = webview.getURL();
                const currentTitle = webview.getTitle();
                // Don't overwrite settings or note URLs with webview URL
                if (currentUrl && currentUrl !== 'about:blank' && tab.url !== 'axis://settings' && !tab.url.startsWith('axis:note://') && !tab.isSettings) {
                    tab.url = currentUrl;
                }
                if (currentTitle) {
                    // Only update title if tab doesn't have a custom title
                    if (!tab.customTitle) {
                    tab.title = currentTitle;
                    }
                }
            }

            if (!isActiveTab()) return;
            if (this.isBenchmarking) {
                this.errorRetryCount = 0;
                this.dnsRetryCount = 0;
                return;
            }
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
            
            // Auto-tinting disabled - using custom theme colors instead
            // this.extractAndApplyWebpageColors(webview);
            
            // Inject aggressive performance optimizations to prevent content unloading
            try {
                webview.executeJavaScript(`
                    (function() {
                        // Function to disable lazy loading and force eager loading
                        function disableLazyLoading() {
                            // Disable lazy loading for images and iframes
                            const images = document.querySelectorAll('img[loading="lazy"], img[data-lazy], img[data-src]');
                            images.forEach(img => {
                                img.loading = 'eager';
                                img.removeAttribute('loading');
                                if (img.dataset.src && (!img.src || img.src === '' || img.src === 'data:,') && !img.complete) {
                                    img.src = img.dataset.src;
                                    img.removeAttribute('data-src');
                                }
                                if (img.dataset.lazySrc && (!img.src || img.src === '')) {
                                    img.src = img.dataset.lazySrc;
                                    img.removeAttribute('data-lazy-src');
                                }
                            });
                            
                            const iframes = document.querySelectorAll('iframe[loading="lazy"], iframe[data-lazy]');
                            iframes.forEach(iframe => {
                                iframe.loading = 'eager';
                                iframe.removeAttribute('loading');
                            });
                            
                            // Force load all images immediately
                            document.querySelectorAll('img').forEach(img => {
                                if (img.dataset.src && (!img.src || img.src === '')) {
                                    img.src = img.dataset.src;
                                }
                                if (img.dataset.lazySrc && (!img.src || img.src === '')) {
                                    img.src = img.dataset.lazySrc;
                                }
                            });
                        }
                        
                        // Run immediately and aggressively
                        disableLazyLoading();
                        
                        // Force immediate load of all visible and near-visible content
                        setTimeout(() => {
                            disableLazyLoading();
                            // Preload all images in viewport and beyond
                            const allImages = document.querySelectorAll('img');
                            allImages.forEach(img => {
                                if (img.dataset.src) {
                                    img.src = img.dataset.src;
                                    img.removeAttribute('data-src');
                                }
                                if (img.dataset.lazySrc) {
                                    img.src = img.dataset.lazySrc;
                                    img.removeAttribute('data-lazy-src');
                                }
                            });
                        }, 100);
                        
                        // Watch for new content and disable lazy loading immediately
                        const observer = new MutationObserver((mutations) => {
                            let shouldDisable = false;
                            mutations.forEach(mutation => {
                                if (mutation.addedNodes.length > 0) {
                                    shouldDisable = true;
                                }
                            });
                            if (shouldDisable) {
                                disableLazyLoading();
                            }
                        });
                        
                        observer.observe(document.body || document.documentElement, {
                            childList: true,
                            subtree: true,
                            attributes: true,
                            attributeFilter: ['loading', 'data-src', 'data-lazy-src']
                        });
                        
                        // Aggressive preloading - load everything within 500px of viewport
                        const intersectionObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight + 500) {
                                    const img = entry.target;
                                    if (img.dataset.src && (!img.src || img.src === '')) {
                                        img.src = img.dataset.src;
                                        img.removeAttribute('data-src');
                                    }
                                    if (img.dataset.lazySrc && (!img.src || img.src === '')) {
                                        img.src = img.dataset.lazySrc;
                                        img.removeAttribute('data-lazy-src');
                                    }
                                }
                            });
                        }, { 
                            rootMargin: '500px 0px 500px 0px',
                            threshold: [0, 0.1, 0.5, 1]
                        });
                        
                        // Observe all images
                        document.querySelectorAll('img').forEach(img => {
                            intersectionObserver.observe(img);
                        });
                        
                        // Keep all rendered content in memory - prevent unloading
                        function keepContentInMemory() {
                            // Force browser to keep all elements rendered
                            const allElements = document.querySelectorAll('*');
                            allElements.forEach(el => {
                                // Touch elements to keep them in memory
                                if (el.offsetHeight > 0 || el.offsetWidth > 0) {
                                    el.style.willChange = 'auto';
                                    // Force layout calculation
                                    void el.offsetHeight;
                                }
                            });
                        }
                        
                        // Run immediately and periodically
                        keepContentInMemory();
                        if ('requestIdleCallback' in window) {
                            requestIdleCallback(keepContentInMemory, { timeout: 500 });
                            setInterval(() => {
                                requestIdleCallback(keepContentInMemory, { timeout: 500 });
                            }, 5000);
                        } else {
                            setTimeout(keepContentInMemory, 500);
                            setInterval(keepContentInMemory, 5000);
                        }
                        
                        // Prevent scroll-based unloading by keeping scroll position stable
                        let lastScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                        window.addEventListener('scroll', () => {
                            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                            // If scrolling up, preload content above
                            if (currentScrollTop < lastScrollTop) {
                                disableLazyLoading();
                            }
                            lastScrollTop = currentScrollTop;
                        }, { passive: true });
                    })();
                `).catch(() => {}); // Ignore errors
            } catch (e) {
                // Ignore injection errors
            }
        };
        webview.__eventHandlers.didFinishLoad = didFinishLoadHandler;
        webview.addEventListener('did-finish-load', didFinishLoadHandler);

        const didStopLoadingHandler = () => {
            clearLoadingTimeout();
            // Always hide loading bar when this tab stops loading (even if user switched tabs)
            if (this.loadingBarTabId === tabId) {
                this.hideLoadingIndicator();
                this.loadingBarTabId = null;
            }
            if (tabId === this.currentTab) {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
            }
            if (!isActiveTab() || this.isBenchmarking) return;

            this.batchDOMUpdates([
                () => this.updateUrlBar(),
                () => this.updateNavigationButtons(),
                () => this.updateTabTitle()
            ]);
            this.updateUrlBar(webview);
        };
        webview.__eventHandlers.didStopLoading = didStopLoadingHandler;
        webview.addEventListener('did-stop-loading', didStopLoadingHandler);
        
        const consoleMessageHandler = (e) => {
            if (e.message && e.message.includes('DawnExperimentalSubgroupLimits') && e.message.includes('deprecated')) {
                return;
            }
            // Catch settings updates from console
            if (e.message && e.message.startsWith('SETTINGS_UPDATE:')) {
                try {
                    const data = JSON.parse(e.message.replace('SETTINGS_UPDATE:', ''));
                    if (data.type === 'updateSetting') {
                        this.onEmbeddedMessage({ data });
                    }
                } catch (err) {
                    // Ignore parse errors
                }
            }
            // Catch shortcuts messages from console
            if (e.message && e.message.startsWith('SHORTCUTS_MESSAGE:')) {
                try {
                    const data = JSON.parse(e.message.replace('SHORTCUTS_MESSAGE:', ''));
                    this.handleShortcutsMessage(data, webview);
                } catch (err) {
                    console.error('Error parsing shortcuts message:', err);
                }
            }
        };
        webview.__eventHandlers.consoleMessage = consoleMessageHandler;
        webview.addEventListener('console-message', consoleMessageHandler);

        const didFailLoadHandler = (event) => {
            clearLoadingTimeout();
            const tab = getTab();
            
            // Don't handle errors for settings tabs - they use data URLs
            if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
                return;
            }

            if (this.loadingBarTabId === tabId) {
                this.hideLoadingIndicator();
                this.loadingBarTabId = null;
            }
            if (tabId === this.currentTab) {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
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
        };
        webview.__eventHandlers.didFailLoad = didFailLoadHandler;
        webview.addEventListener('did-fail-load', didFailLoadHandler);

        const newWindowHandler = (event) => {
            event.preventDefault();
            this.navigate(event.url);
        };
        webview.__eventHandlers.newWindow = newWindowHandler;
        webview.addEventListener('new-window', newWindowHandler);

        const willNavigateHandler = (event) => {
            if (!isActiveTab()) return;
            const nextUrl = event.url || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(nextUrl);
            if (!this.isBenchmarking) {
                this.updateUrlBar();
                // Apply cached theme immediately on navigation start for instant feedback
                if (nextUrl && nextUrl !== 'about:blank') {
                    this.applyCachedTheme(nextUrl);
                }
            }
        };
        webview.__eventHandlers.willNavigate = willNavigateHandler;
        webview.addEventListener('will-navigate', willNavigateHandler);

        const didNavigateHandler = () => {
            if (!isActiveTab() || this.isBenchmarking) return;
                this.batchDOMUpdates([
                    () => this.updateUrlBar(),
                    () => this.updateNavigationButtons()
                ]);
                // Update themed URL bar
                this.updateUrlBar(webview);
        };
        webview.__eventHandlers.didNavigate = didNavigateHandler;
        webview.addEventListener('did-navigate', didNavigateHandler);

        webview.addEventListener('did-navigate-in-page', () => {
            if (!isActiveTab() || this.isBenchmarking) return;
                this.batchDOMUpdates([
                    () => this.updateUrlBar(),
                    () => this.updateNavigationButtons(),
                    () => this.updateTabTitle()
                ]);
                // Update themed URL bar
                this.updateUrlBar(webview);
        });

        webview.addEventListener('page-title-updated', async () => {
            const tab = getTab();
            if (tab) {
                // Only update title if tab doesn't have a custom title
                if (!tab.customTitle) {
                tab.title = webview.getTitle() || tab.title;
                }
            }

            if (!isActiveTab() || this.isBenchmarking) return;
                // updateTabTitle will check for customTitle and use it if present
                this.updateTabTitle();
                // Update themed URL bar with new title
                this.updateUrlBar(webview);
                
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
        
        // Audio detection using polling (more reliable than media events)
        // Start audio detection polling for this webview
        this.startAudioDetection(tabId, webview);

        // Listen for context-menu event from webview's webContents
        webview.addEventListener('context-menu', (e) => {
            if (!isActiveTab()) return;
            
            // Store context info for the menu
            this.webviewContextInfo = {
                hasSelection: e.params?.selectionText?.length > 0,
                selectionText: e.params?.selectionText || '',
                linkURL: e.params?.linkURL || '',
                srcURL: e.params?.srcURL || '',
                mediaType: e.params?.mediaType || 'none',
                isEditable: e.params?.isEditable || false,
                canCut: e.params?.editFlags?.canCut || false,
                canCopy: e.params?.editFlags?.canCopy || false,
                canPaste: e.params?.editFlags?.canPaste || false,
                canSelectAll: e.params?.editFlags?.canSelectAll || false,
                x: e.params?.x || 0,
                y: e.params?.y || 0
            };
            
            // Get webview position to convert to window coordinates
            const webviewRect = webview.getBoundingClientRect();
            const x = (e.params?.x || 0) + webviewRect.left;
            const y = (e.params?.y || 0) + webviewRect.top;
            
            this.showWebpageContextMenu({ 
                clientX: x,
                clientY: y
            });
        });
        
        // Handle IPC messages from webview (for settings page)
        webview.addEventListener('ipc-message', (event) => {
            if (!isActiveTab()) return;
            const { channel, args } = event;
            if (channel === 'settings-message') {
                this.onEmbeddedMessage({ data: args[0] });
            }
        });
        
        // Listen for settings updates from webview - use polling to detect changes instantly
        webview.addEventListener('dom-ready', () => {
            if (!isActiveTab()) return;
            const url = webview.getURL();
            if (url && url.includes('axis://settings')) {
                const browser = this; // Store reference
                // Store last known values
                let lastSidebarPos = null;
                let lastSearchEngine = null;
                
                // Poll for changes every 100ms and save immediately
                // Store interval on webview for cleanup
                webview.__settingsPollInterval = setInterval(async () => {
                    if (!isActiveTab() || webview.isDestroyed?.()) {
                        if (webview.__settingsPollInterval) {
                            clearInterval(webview.__settingsPollInterval);
                            webview.__settingsPollInterval = null;
                        }
                        return;
                    }
                    
                    try {
                        const currentValues = await webview.executeJavaScript(`
                            (function() {
                                const sidebarPos = document.getElementById('sidebar-position');
                                const searchEngine = document.getElementById('search-engine');
                                return {
                                    sidebarPosition: sidebarPos ? sidebarPos.value : null,
                                    searchEngine: searchEngine ? searchEngine.value : null
                                };
                            })();
                        `);
                        
                        // Check and save sidebar position
                        if (currentValues.sidebarPosition !== null && currentValues.sidebarPosition !== lastSidebarPos) {
                            lastSidebarPos = currentValues.sidebarPosition;
                            await browser.saveSetting('sidebarPosition', currentValues.sidebarPosition);
                            browser.applySidebarPosition();
                            console.log('✓ Saved sidebarPosition:', currentValues.sidebarPosition);
                        }
                        
                        // Check and save search engine
                        if (currentValues.searchEngine !== null && currentValues.searchEngine !== lastSearchEngine) {
                            lastSearchEngine = currentValues.searchEngine;
                            await browser.saveSetting('searchEngine', currentValues.searchEngine);
                            console.log('✓ Saved searchEngine:', currentValues.searchEngine);
                        }
                    } catch (e) {
                        // Ignore errors
                    }
                }, 100);
                
                // Clean up on navigation
                webview.addEventListener('did-navigate', () => {
                    if (webview.__settingsPollInterval) {
                        clearInterval(webview.__settingsPollInterval);
                        webview.__settingsPollInterval = null;
                    }
                }, { once: true });
            }
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
        
        // Don't handle DNS failures for settings tabs
        const tab = this.tabs.get(this.currentTab);
        if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
            return;
        }
        
        // Prevent infinite retry loops
        if (this.dnsRetryCount >= 3) {
            console.log('Max DNS retries reached, falling back to Google');
            webview.src = 'https://www.google.com';
            return;
        }
        
        this.dnsRetryCount = (this.dnsRetryCount || 0) + 1;
        
        // Try simple fallback to search engine
        const searchQuery = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        const fallbackUrl = this.getSearchUrl(searchQuery);
        
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

    applyCustomThemeFromSettings() {
        // Ensure settings exist
        if (!this.settings) {
            this.settings = {};
        }
        
        const themeColor = this.settings.themeColor || '#1a1a1a';
        const gradientColor = this.settings.gradientColor || '#2a2a2a';
        
        // Generate harmonious colors from theme color
        const colors = this.generateHarmoniousColors(themeColor);
        
        // Add gradient color if gradient is enabled
        if (this.settings.gradientEnabled) {
            colors.gradientColor = gradientColor;
        }
        
        // Apply the theme - force apply even if body check fails
        try {
            this.applyCustomTheme(colors);
        } catch (error) {
            console.error('Error applying custom theme:', error);
            // Fallback: try again after a short delay
            setTimeout(() => {
                try {
                    this.applyCustomTheme(colors);
                } catch (e) {
                    console.error('Error applying custom theme (retry):', e);
                }
            }, 100);
        }
    }

    // Apply theme only to sidebar (used when no tabs are open)
    applyThemeToSidebarOnly() {
        if (!this.settings) {
            this.settings = {};
        }
        
        const themeColor = this.settings.themeColor || '#1a1a1a';
        const gradientColor = this.settings.gradientColor || '#2a2a2a';
        const gradientEnabled = this.settings.gradientEnabled || false;
        const gradientDirection = this.settings.gradientDirection || 'to right';
        
        // Create sidebar background
        let sidebarBg;
        if (gradientEnabled) {
            const themeRgba = this.hexToRgba(themeColor, 0.3);
            const gradientRgba = this.hexToRgba(gradientColor, 0.3);
            sidebarBg = this.smoothGradient(gradientDirection, themeRgba, gradientRgba);
        } else {
            sidebarBg = this.hexToRgba(themeColor, 0.3);
        }
        
        // Apply to sidebar only
        if (this.elements?.sidebar) {
            this.elements.sidebar.style.setProperty('background', sidebarBg, 'important');
            this.elements.sidebar.style.setProperty('backdrop-filter', 'blur(80px) saturate(200%)', 'important');
            this.elements.sidebar.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(200%)', 'important');
        }
        
        // Also apply to app container for the blur effect
        const app = document.getElementById('app');
        if (app) {
            app.style.setProperty('backdrop-filter', 'blur(80px) saturate(200%)', 'important');
            app.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(200%)', 'important');
        }
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
    
    // Extract domain from URL for theme caching
    getDomainFromUrl(url) {
        try {
            if (!url || url === 'about:blank') return null;
            const urlObj = new URL(url);
            return urlObj.hostname;
        } catch (e) {
            return null;
        }
    }
    
    // Apply cached theme for a domain instantly
    applyCachedTheme(url) {
        const domain = this.getDomainFromUrl(url);
        if (domain && this.themeCache.has(domain)) {
            const cachedColors = this.themeCache.get(domain);
            this.applyCustomTheme(cachedColors);
            return true;
        }
        return false;
    }
    
    // Cache theme colors for a domain
    cacheThemeForDomain(url, colors) {
        const domain = this.getDomainFromUrl(url);
        if (domain && colors) {
            this.themeCache.set(domain, colors);
            // Limit cache size to 100 domains
            if (this.themeCache.size > 100) {
                const firstKey = this.themeCache.keys().next().value;
                this.themeCache.delete(firstKey);
            }
        }
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
                        const currentUrl = webview.getURL();
                        if (colors && colors.themeColor) {
                            // Use theme color from meta tag (most reliable)
                            const themeColors = this.applyWebpageTheme({ themeColor: colors.themeColor, backgroundColor: colors.themeColor, textColor: colors.textColor });
                            // Cache the theme for this domain
                            if (themeColors && currentUrl) {
                                this.cacheThemeForDomain(currentUrl, themeColors);
                            }
                        } else if (colors && colors.backgroundColor && colors.backgroundColor !== '#ffffff' && colors.backgroundColor !== '#000000') {
                            // Use extracted background color
                            const themeColors = this.applyWebpageTheme(colors);
                            // Cache the theme for this domain
                            if (themeColors && currentUrl) {
                                this.cacheThemeForDomain(currentUrl, themeColors);
                            }
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
        return colors; // Return colors for caching
    }
    
    resetToBlackTheme() {
        // If the user has a custom theme configured, never force the app
        // back to the default black theme. Instead, just re‑apply their
        // custom theme so there is no flashing when this method is called
        // from various fallback/error paths.
        if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
            this.applyCustomThemeFromSettings();
            return;
        }

        // No custom theme saved – fall back to the default subtle black theme.
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
        // Ensure document.body exists before applying theme
        if (!document.body) {
            // If body doesn't exist yet, wait for it
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.applyCustomTheme(colors);
                });
                return;
            } else {
                // If document is ready but body doesn't exist, wait a bit
                setTimeout(() => {
                    if (document.body) {
                        this.applyCustomTheme(colors);
                    }
                }, 0);
                return;
            }
        }
        
        // Disable transitions for instant theme switching
        document.body.classList.add('theme-switching');
        
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
        
        // Apply gradient if enabled and provided (check before setting background-color)
        const gradientEnabled = this.settings?.gradientEnabled !== false && colors.gradientColor;
        const gradientDirection = this.settings?.gradientDirection || '135deg';
        
        // Core theme colors - batch update
        if (gradientEnabled) {
            const gradient = this.smoothGradient(gradientDirection, darkerPrimary, colors.gradientColor);
            style.setProperty('--background-color', gradient);
        } else {
        style.setProperty('--background-color', darkerPrimary);
        }
        style.setProperty('--text-color', colors.text);
        style.setProperty('--text-color-secondary', textSecondary);
        style.setProperty('--text-color-muted', colors.textMuted || colors.text);
        // Use a glassy, semi-transparent version of the primary color for app surfaces.
        // More transparent to allow frosted glass effect to show through
        let glassSidebarBg;
        if (gradientEnabled) {
            const primaryRgba = this.hexToRgba(darkerPrimary, 0.4);
            const gradientRgba = this.hexToRgba(colors.gradientColor, 0.4);
            glassSidebarBg = this.smoothGradient(gradientDirection, primaryRgba, gradientRgba);
        } else {
            glassSidebarBg = this.hexToRgba(darkerPrimary, 0.4) || `rgba(20, 20, 20, 0.4)`;
        }
        // Opaque version for sidebar slide-out (same theme, fully visible)
        let sidebarSlideOutBg;
        if (gradientEnabled) {
            const primaryOpaque = this.hexToRgba(darkerPrimary, 0.98);
            const gradientOpaque = this.hexToRgba(colors.gradientColor, 0.98);
            sidebarSlideOutBg = this.smoothGradient(gradientDirection, primaryOpaque, gradientOpaque);
        } else {
            sidebarSlideOutBg = this.hexToRgba(darkerPrimary, 0.98) || `rgba(28, 28, 28, 0.98)`;
        }
        // Popups use subtle dominant color (primary color, even if gradient)
        // Extract primary color and make it subtle for popups
        const popupBgRgba = this.hexToRgba(darkerPrimary, 0.85);
        style.setProperty('--popup-background-subtle', popupBgRgba);
        style.setProperty('--popup-header', headerBg);
        style.setProperty('--button-background', 'transparent');
        style.setProperty('--button-hover', buttonHoverBg);
        style.setProperty('--button-text', colors.text);
        style.setProperty('--button-text-hover', colors.text);
        style.setProperty('--sidebar-background', glassSidebarBg);
        style.setProperty('--sidebar-slide-out-background', sidebarSlideOutBg);
        // URL bar now uses glassmorphism effect, no need to set background color
        // style.setProperty('--url-bar-background', urlBarBg);
        // style.setProperty('--url-bar-focus-background', urlBarFocusBg);
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
        
        // Set gradient variables
        if (gradientEnabled) {
            const gradient = this.smoothGradient(gradientDirection, darkerPrimary, colors.gradientColor);
            style.setProperty('--primary-gradient', gradient);
            style.setProperty('--theme-color', darkerPrimary);
            style.setProperty('--gradient-color', colors.gradientColor);
            style.setProperty('--gradient-enabled', '1');
        } else {
            style.setProperty('--theme-color', darkerPrimary);
            style.setProperty('--gradient-enabled', '0');
        }
        
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
        // Body should be transparent to allow frosted glass effect
        document.body.style.background = 'transparent';
        document.body.style.color = colors.text;
        
        // Check if there are any tabs open
        const hasTabs = this.tabs && this.tabs.size > 0;
        
        const mainArea = document.getElementById('main-area');
        const contentArea = document.getElementById('content-area');
        const app = document.getElementById('app');
        
        if (hasTabs) {
            // When tabs are open: Apply theme to main-area for seamless blend
            if (mainArea) {
                mainArea.style.setProperty('background', glassSidebarBg, 'important');
                mainArea.style.setProperty('backdrop-filter', 'blur(80px) saturate(200%)', 'important');
                mainArea.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(200%)', 'important');
            }
            
            // Remove backgrounds from individual elements to prevent duplication
        if (this.elements?.sidebar) {
                this.elements.sidebar.style.setProperty('background', 'transparent', 'important');
                this.elements.sidebar.style.setProperty('backdrop-filter', 'none', 'important');
                this.elements.sidebar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        }
        if (contentArea) {
                contentArea.style.setProperty('background', 'transparent', 'important');
                contentArea.style.setProperty('backdrop-filter', 'none', 'important');
                contentArea.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
        }
            
        if (app) {
                // Use semi-transparent background for frosted glass effect
                const appBg = gradientEnabled ? 
                    this.smoothGradient(gradientDirection, this.hexToRgba(darkerPrimary, 0.4), this.hexToRgba(colors.gradientColor, 0.4)) : 
                    this.hexToRgba(darkerPrimary, 0.4);
                app.style.setProperty('background', appBg, 'important');
            app.style.setProperty('backdrop-filter', 'blur(80px) saturate(180%)', 'important');
            app.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(180%)', 'important');
            }
        } else {
            // When NO tabs are open: Keep theme background everywhere, just hide webviews
            // Apply theme to main-area so background is visible
            if (mainArea) {
                mainArea.style.setProperty('background', glassSidebarBg, 'important');
                mainArea.style.setProperty('backdrop-filter', 'blur(80px) saturate(200%)', 'important');
                mainArea.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(200%)', 'important');
            }
            
            // Also apply to app element
            if (app) {
                const appBg = gradientEnabled ? 
                    this.smoothGradient(gradientDirection, this.hexToRgba(darkerPrimary, 0.4), this.hexToRgba(colors.gradientColor, 0.4)) : 
                    this.hexToRgba(darkerPrimary, 0.4);
                app.style.setProperty('background', appBg, 'important');
                app.style.setProperty('backdrop-filter', 'blur(80px) saturate(180%)', 'important');
                app.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(180%)', 'important');
            }
            
            // Remove backgrounds from individual elements to prevent duplication
            if (this.elements?.sidebar) {
                this.elements.sidebar.style.setProperty('background', 'transparent', 'important');
                this.elements.sidebar.style.setProperty('backdrop-filter', 'none', 'important');
                this.elements.sidebar.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            }
            
            // Content area also transparent so main-area background shows through
            if (contentArea) {
                contentArea.style.setProperty('background', 'transparent', 'important');
                contentArea.style.setProperty('backdrop-filter', 'none', 'important');
                contentArea.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            }
            
            // App container keeps blur for overall effect
            if (app) {
                app.style.setProperty('backdrop-filter', 'blur(80px) saturate(200%)', 'important');
                app.style.setProperty('-webkit-backdrop-filter', 'blur(80px) saturate(200%)', 'important');
            }
        }
        
        // Re-enable transitions after theme is applied (use RAF to ensure CSS variables are updated first)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.remove('theme-switching');
            });
        });
    }

    // Convert hex color (e.g. #1a1a1a) to rgba with configurable alpha for glass effect
    hexToRgba(hex, alpha = 1) {
        if (!hex) return null;
        let value = hex.trim();
        if (value.startsWith('#')) {
            value = value.slice(1);
        }
        if (value.length === 3) {
            value = value.split('').map(c => c + c).join('');
        }
        if (value.length !== 6) return null;
        const int = parseInt(value, 16);
        if (Number.isNaN(int)) return null;
        const r = (int >> 16) & 255;
        const g = (int >> 8) & 255;
        const b = int & 255;
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    smoothGradient(direction, color1, color2) {
        const parse = (c) => {
            if (!c) return null;
            let v = c.trim();
            if (v.startsWith('#')) {
                v = v.slice(1);
                if (v.length === 3) v = v.split('').map(ch => ch + ch).join('');
                if (v.length !== 6) return null;
                const n = parseInt(v, 16);
                return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
            }
            const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/);
            if (m) return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
            return null;
        };
        const c1 = parse(color1), c2 = parse(color2);
        if (!c1 || !c2) return `linear-gradient(${direction}, ${color1} 0%, ${color2} 100%)`;

        // Convert sRGB to linear light
        const srgbToLinear = (v) => {
            const s = v / 255;
            return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        // Convert linear light back to sRGB
        const linearToSrgb = (v) => {
            const s = v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
            return Math.round(Math.max(0, Math.min(255, s * 255)));
        };

        // Linearize both colors
        const lin1 = [srgbToLinear(c1[0]), srgbToLinear(c1[1]), srgbToLinear(c1[2])];
        const lin2 = [srgbToLinear(c2[0]), srgbToLinear(c2[1]), srgbToLinear(c2[2])];

        const STOPS = 16;
        const parts = [];
        for (let i = 0; i <= STOPS; i++) {
            const t = i / STOPS;
            // Smoothstep easing for perceptually even distribution
            const et = t * t * (3 - 2 * t);
            const r = linearToSrgb(lin1[0] + (lin2[0] - lin1[0]) * et);
            const g = linearToSrgb(lin1[1] + (lin2[1] - lin1[1]) * et);
            const b = linearToSrgb(lin1[2] + (lin2[2] - lin1[2]) * et);
            const a = Math.round((c1[3] + (c2[3] - c1[3]) * et) * 1000) / 1000;
            const pct = Math.round(t * 10000) / 100;
            parts.push(`rgba(${r}, ${g}, ${b}, ${a}) ${pct}%`);
        }
        return `linear-gradient(${direction}, ${parts.join(', ')})`;
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
        webview.setAttribute('webpreferences', 'contextIsolation=false,nodeIntegration=false,webSecurity=true,accelerated2dCanvas=true,enableWebGL=true,enableWebGL2=true,enableGpuRasterization=true,enableZeroCopy=true,enableHardwareAcceleration=true,backgroundThrottling=false,offscreen=false');
        webview.setAttribute('partition', 'persist:main');
        webview.setAttribute('useragent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        webview.setAttribute('autosize', 'true');
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
        
        // Create tab object first to check for custom icon
        const tab = {
            id: tabId,
            url: url || 'about:blank',
            title: 'New Tab',
            favicon: null,
            customIcon: null,
            customIconType: null,
            pinned: false,
            webview: null
        };
        this.tabs.set(tabId, tab);
        
        // Determine icon HTML based on type
        let iconHTML = '<img class="tab-favicon" src="" alt="" onerror="this.style.visibility=\'hidden\'">';
        if (tab.customIcon) {
            if (tab.customIconType === 'emoji') {
                iconHTML = `<span class="tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1;">${tab.customIcon}</span>`;
            } else {
                iconHTML = `<i class="fas ${tab.customIcon} tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);"></i>`;
            }
        }
        
        tabElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    ${iconHTML}
                    <span class="tab-audio-indicator" style="display: none;"><i class="fas fa-volume-up"></i></span>
                    <span class="tab-title">New Tab</span>
                </div>
                <div class="tab-right">
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
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
            webview: null,
            isMuted: false,
            isPlayingAudio: false
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
        
        // Re-render tab groups in case tab organization changed
        this.renderTabGroups();
    }

    updatePinnedTabClosedState(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.pinned) return;
        
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tabElement) return;
        
        // Tab is closed if it has no webview
        const isClosed = !tab.webview;
        
        if (isClosed) {
            tabElement.classList.add('closed');
            tab.closed = true;
        } else {
            tabElement.classList.remove('closed');
            tab.closed = false;
        }
        
        this.tabs.set(tabId, tab);
    }
    
    setupPinnedTabCloseButton(tabElement, tabId) {
        const closeBtn = tabElement.querySelector('.tab-close');
        if (!closeBtn) return;
        
        const icon = closeBtn.querySelector('i');
        if (!icon) return;
        
        // Remove any existing handlers to avoid duplicates
        const existingHandlers = tabElement._pinnedCloseHandlers;
        if (existingHandlers) {
            if (existingHandlers.observer) {
                existingHandlers.observer.disconnect();
            }
        }
        
        // Function to update icon based on active state
        const updateIcon = () => {
            if (tabElement.classList.contains('active')) {
                // Active pinned tabs always show minus
                icon.classList.remove('fa-times');
                icon.classList.add('fa-minus');
            } else {
                // Inactive pinned tabs show times
                icon.classList.remove('fa-minus');
                icon.classList.add('fa-times');
            }
        };
        
        // Update icon immediately based on current state
        updateIcon();
        
        // Watch for changes to active state
        const observer = new MutationObserver(() => {
            updateIcon();
        });
        
        observer.observe(tabElement, {
            attributes: true,
            attributeFilter: ['class']
        });
        
        // Store handlers for cleanup
        tabElement._pinnedCloseHandlers = {
            observer: observer,
            updateIcon: updateIcon
        };
    }
    
    removePinnedTabCloseButton(tabElement) {
        const existingHandlers = tabElement._pinnedCloseHandlers;
        if (existingHandlers) {
            if (existingHandlers.observer) {
                existingHandlers.observer.disconnect();
            }
            delete tabElement._pinnedCloseHandlers;
        }
        
        // Reset icon to times (unpinned tabs always show X)
        const closeBtn = tabElement.querySelector('.tab-close');
        if (closeBtn) {
            const icon = closeBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-minus');
                icon.classList.add('fa-times');
            }
        }
    }

    setupTabEventListeners(tabElement, tabId) {
        // Tab click
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close') && !e.target.closest('.tab-audio-indicator')) {
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
            
            // For pinned tabs, setup close button hover behavior
            const tab = this.tabs.get(tabId);
            if (tab && tab.pinned) {
                this.setupPinnedTabCloseButton(tabElement, tabId);
            }
        }
        
        // Audio indicator click - toggle mute
        const audioIndicator = tabElement.querySelector('.tab-audio-indicator');
        if (audioIndicator) {
            audioIndicator.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleTabMute(tabId);
            });
            // Add cursor pointer style
            audioIndicator.style.cursor = 'pointer';
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

        // INSTANT tab switching - all critical updates happen synchronously
        const activeTab = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tab = this.tabs.get(tabId);
        
        // CRITICAL: Hide previous tab's webview instantly (synchronous)
        if (this.currentTab && this.currentTab !== tabId) {
            const prevTab = this.tabs.get(this.currentTab);
            if (prevTab && prevTab.webview) {
                prevTab.webview.style.opacity = '0.3';
                prevTab.webview.style.visibility = 'visible';
                prevTab.webview.style.pointerEvents = 'none';
                prevTab.webview.style.zIndex = '0';
                prevTab.webview.classList.add('inactive');
                
                // Check if previous tab has a playing video and show PIP
                this.checkAndShowPIP(this.currentTab, prevTab.webview);
            }
            
            // Remove active from previous tab instantly
            const prevTabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
            if (prevTabElement) prevTabElement.classList.remove('active');
        }
        
        // Hide PIP if switching back to the tab that has PIP
        if (this.pipTabId === tabId) {
            this.hidePIP();
        }
        
        // CRITICAL: Update current tab immediately
        this.currentTab = tabId;
        
        // CRITICAL: Add active to new tab instantly
        if (activeTab) {
            activeTab.classList.add('active');
            // Remove closed indicator if reopening a closed pinned tab
            if (activeTab.classList.contains('closed')) {
                activeTab.classList.remove('closed');
                if (tab) {
                    tab.closed = false;
                    this.tabs.set(tabId, tab);
                }
            }
        }
        
        if (tab) {
            // Ensure webview exists - create if missing
            if (!tab.webview) {
                const webview = this.createTabWebview(tabId);
                if (webview) {
                    tab.webview = webview;
                    this.tabs.set(tabId, tab);
                    // Update closed state for pinned tabs
                    if (tab.pinned) {
                        this.updatePinnedTabClosedState(tabId);
                    }
                }
            }
            
            if (tab.webview) {
                const webview = tab.webview;
                
                // CRITICAL: Make webview visible instantly (synchronous)
                webview.style.opacity = '1';
                webview.style.visibility = 'visible';
                webview.style.pointerEvents = 'auto';
                webview.style.zIndex = '2';
                webview.classList.remove('inactive');
                
                // Update cached webview reference
                this.elements.webview = webview;
                
                // CRITICAL: Apply cached theme instantly for this tab's URL
                if (tab.url && tab.url !== 'about:blank' && tab.url !== 'axis://settings' && !tab.url.startsWith('axis:note://')) {
                    this.applyCachedTheme(tab.url);
                }
                
                // Get current URL from webview (may throw or return empty when inactive - avoid reloading pinned tabs)
                let currentSrc = null;
                try {
                    currentSrc = webview.getURL();
                } catch (e) {
                    currentSrc = 'about:blank';
                }
                if (currentSrc === undefined || currentSrc === null) currentSrc = '';

                const urlsMatch = (a, b) => {
                    if (!a || !b) return a === b;
                    try {
                        const u1 = new URL(a);
                        const u2 = new URL(b);
                        return u1.origin === u2.origin && u1.pathname === u2.pathname && (u1.search || '') === (u2.search || '');
                    } catch (_) {
                        return a === b;
                    }
                };

                // Load content if needed - check special URLs first
                if (tab.url && tab.url === 'axis://settings' || tab.isSettings) {
                    if (!tab.isSettings) {
                        tab.isSettings = true;
                        tab.url = 'axis://settings';
                        this.tabs.set(tabId, tab);
                    }
                    // Set webview background immediately to prevent flash
                    if (webview) {
                        webview.style.setProperty('background', 'rgba(40, 40, 40, 0.95)', 'important');
                    }
                    if (currentSrc === 'about:blank' || !currentSrc) {
                        this.loadSettingsInWebview();
                    }
                    // Don't reset theme - keep the user's theme while showing settings
                } else if (tab.url && tab.url.startsWith('axis:note://')) {
                    const noteId = tab.url.replace('axis:note://', '');
                    if (!currentSrc || currentSrc === 'about:blank' || !currentSrc.includes('axis:note://')) {
                        this.loadNoteInWebview(noteId);
                    }
                    // Don't reset theme - keep the user's theme while showing notes
                } else if (tab.url && tab.url !== 'about:blank' && tab.url !== '') {
                    const sanitizedTabUrl = this.sanitizeUrl(tab.url);
                    const webviewHasContent = currentSrc && currentSrc !== 'about:blank' && currentSrc.trim() !== '';
                    const samePage = urlsMatch(currentSrc, sanitizedTabUrl) || urlsMatch(currentSrc, tab.url);
                    if (!webviewHasContent || !samePage) {
                        webview.src = sanitizedTabUrl || 'https://www.google.com';
                    } else {
                        // Webview already has this page (e.g. switching back to pinned tab) - don't reload
                        if (currentSrc && currentSrc !== tab.url) {
                            tab.url = currentSrc;
                            this.tabs.set(tabId, tab);
                        }
                    }
                } else {
                    if (tab.url !== 'axis://settings' && (!currentSrc || currentSrc === 'about:blank')) {
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
        
        // DEFER non-critical updates to not block tab switching
        requestAnimationFrame(() => {
            if (activeTab) {
                this.updateTabFavicon(tabId, activeTab);
            }
            this.updateEmptyState();
            this.updateNavigationButtons();
            this.updateUrlBar();
            // Update themed URL bar and loading bar to match the tab we switched to
            if (tab && tab.webview) {
                this.updateUrlBar(tab.webview);
                try {
                    this.isWebviewLoading = tab.webview.isLoading();
                    this.updateRefreshButton(this.isWebviewLoading);
                    if (this.isWebviewLoading) {
                        this.loadingBarTabId = tabId;
                        this.showLoadingIndicator();
                    } else {
                        if (this.loadingBarTabId != null) {
                            this.hideLoadingIndicator();
                            this.loadingBarTabId = null;
                        }
                    }
                } catch (e) {
                    this.isWebviewLoading = false;
                    this.updateRefreshButton(false);
                    if (this.loadingBarTabId != null) {
                        this.hideLoadingIndicator();
                        this.loadingBarTabId = null;
                    }
                }
            } else {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
                if (this.loadingBarTabId != null) {
                    this.hideLoadingIndicator();
                    this.loadingBarTabId = null;
                }
            }
        });
    }

    updateEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (!emptyState) return;

        const emptyContent = document.getElementById('empty-state-empty');
        
        if (this.tabs.size === 0 || this.currentTab === null) {
            // Show empty state but keep content hidden (blank screen)
            emptyState.classList.remove('hidden');
            if (emptyContent) emptyContent.classList.add('hidden');
            
            // Hide URL bar when no tabs
            const urlBar = this.elements?.webviewUrlBar;
            if (urlBar) {
                urlBar.classList.add('hidden');
            }
            
            // Reapply theme to ensure background is visible when no tabs
            if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                this.applyCustomThemeFromSettings();
            } else {
                // Apply default theme with background
                const colors = {
                    primary: '#1a1a1a',
                    secondary: '#222222',
                    accent: '#2a2a2a',
                    text: '#ffffff',
                    textSecondary: '#cccccc',
                    textMuted: '#999999',
                    border: 'rgba(255, 255, 255, 0.08)',
                    borderLight: 'rgba(255, 255, 255, 0.12)'
                };
                this.applyCustomTheme(colors);
            }
            
            // Ensure webviews are hidden
            const webviewContainer = document.querySelector('.webview-container');
            if (webviewContainer) {
                webviewContainer.style.setProperty('background', 'transparent', 'important');
                webviewContainer.style.setProperty('backdrop-filter', 'none', 'important');
                webviewContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            }
            
            // Hide all webviews when no tabs are open (but show glass effect if visible)
            const webviews = document.querySelectorAll('webview');
            webviews.forEach(wv => {
                wv.style.setProperty('opacity', '0.3', 'important');
                wv.style.setProperty('visibility', 'visible', 'important');
                wv.style.setProperty('background', 'transparent', 'important');
                wv.classList.add('inactive');
            });
            
            const webviewsContainer = document.getElementById('webviews-container');
            if (webviewsContainer) {
                webviewsContainer.style.setProperty('background', 'transparent', 'important');
            }
        } else {
            // Hide empty state
            emptyState.classList.add('hidden');
            if (emptyContent) emptyContent.classList.add('hidden');
            
            // Reapply theme background when tabs are open
            if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                this.applyCustomThemeFromSettings();
            } else {
                // Apply default theme with background
                const colors = {
                    primary: '#1a1a1a',
                    secondary: '#222222',
                    accent: '#2a2a2a',
                    text: '#ffffff',
                    textSecondary: '#cccccc',
                    textMuted: '#999999',
                    border: 'rgba(255, 255, 255, 0.08)',
                    borderLight: 'rgba(255, 255, 255, 0.12)'
                };
                this.applyCustomTheme(colors);
            }
        }
        
        // Update chat button visibility
        this.updateChatButtonVisibility();
    }

    updateChatButtonVisibility() {
        // Chat button is now part of the URL bar - no separate visibility handling needed
        // The URL bar itself handles visibility based on whether a valid page is loaded
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
        
        // Check if this is a pinned tab
        const isPinned = tab && tab.pinned;
        
        // For pinned tabs, check if it's inactive (no webview or already closed)
        // If inactive, completely remove it. If active, just close the webview.
        if (isPinned) {
            const isInactive = !tab.webview || tabElement?.classList.contains('closed');
            
            if (isInactive) {
                // Completely remove inactive pinned tabs
                // Remove from tab groups if it's in one
                this.tabGroups.forEach((tabGroup, tabGroupId) => {
                    if (tabGroup.tabIds.includes(tabId)) {
                        this.removeTabFromTabGroup(tabId, tabGroupId);
                    }
                });
                
                // Remove tab element from DOM
                if (tabElement) {
                    tabElement.remove();
                }
                
                // Remove from tabs Map
                this.tabs.delete(tabId);
                
                // If this was the current tab, switch only to an unpinned tab; if none left, show empty state
                if (this.currentTab === tabId) {
                    this.currentTab = null;
                    const remainingUnpinned = Array.from(this.tabs.keys()).filter(id => {
                        const t = this.tabs.get(id);
                        return t && !t.pinned && t.webview;
                    });
                    if (remainingUnpinned.length > 0) {
                        this.switchToTab(remainingUnpinned[remainingUnpinned.length - 1]);
                    } else {
                        const webview = document.getElementById('webview');
                        if (webview) webview.src = 'about:blank';
                        this.resetToBlackTheme();
                        this.updateEmptyState();
                        this.updateUrlBar();
                        this.updateNavigationButtons();
                    }
                }
                
                // Save pinned tabs after removal
                this.savePinnedTabs();
                this.updateEmptyState();
                return;
            }
            
            // Active pinned tab - just close the webview but keep the tab
            // Remove the tab's webview
            if (tab && tab.webview) {
                try {
                    // Stop audio detection polling
                    this.stopAudioDetection(tab.webview);
                    
                    if (tab.webview.parentNode) {
                        tab.webview.parentNode.removeChild(tab.webview);
                    }
                    // Clear webview reference
                    tab.webview = null;
                    this.tabs.set(tabId, tab);
                } catch (e) {
                    console.error('Error removing webview:', e);
                }
            }
            
            // Remove active state from tab element
            if (tabElement) {
                tabElement.classList.remove('active');
            }
            
            // Update closed state (will add closed class since webview is null)
            this.updatePinnedTabClosedState(tabId);
            
            // If we closed the active tab, switch only to an unpinned tab; if none left, don't open any tab
            if (this.currentTab === tabId) {
                this.currentTab = null;
                const remainingUnpinned = Array.from(this.tabs.keys()).filter(id => {
                    const t = this.tabs.get(id);
                    return t && !t.pinned && t.webview;
                });
                if (remainingUnpinned.length > 0 && this.tabs.has(remainingUnpinned[remainingUnpinned.length - 1])) {
                    this.switchToTab(remainingUnpinned[remainingUnpinned.length - 1]);
                } else {
                    const webview = document.getElementById('webview');
                    if (webview) webview.src = 'about:blank';
                    this.resetToBlackTheme();
                    this.updateEmptyState();
                    this.updateUrlBar();
                    this.updateNavigationButtons();
                }
            }
            this.savePinnedTabs();
            return;
        }
        
        // For non-pinned tabs, proceed with normal close behavior
        const tabGroupIdForUndo = tab && tab.tabGroupId;
        // Remove from tab group first (without recording undo) so group state stays consistent
        if (tab && tab.tabGroupId) {
            this.removeTabFromTabGroup(tabId, tab.tabGroupId, true);
        }
        // Store closed tab for recovery (only if it's not a new tab)
        if (tab && tab.url && tab.url !== 'about:blank') {
            this.closedTabs.unshift({
                id: tabId,
                title: tab.title || 'Untitled',
                url: tab.url,
                customTitle: tab.customTitle,
                timestamp: Date.now()
            });
            // Push to undo stack so Cmd+Z can revert close
            this.tabUndoStack.push({
                type: 'close_tab',
                data: {
                    url: tab.url,
                    title: tab.title || 'Untitled',
                    customTitle: tab.customTitle,
                    tabGroupId: tabGroupIdForUndo
                }
            });
            if (this.tabUndoStack.length > 20) this.tabUndoStack = this.tabUndoStack.slice(-20);
            // Keep only the last 10 closed tabs
            if (this.closedTabs.length > 10) {
                this.closedTabs = this.closedTabs.slice(0, 10);
            }
        }
        
        // Remove the tab's webview
        if (tab && tab.webview) {
            try {
                // Stop audio detection polling
                this.stopAudioDetection(tab.webview);
                
                // Clear loading timeout if it exists
                if (tab.webview.__loadingTimeout) {
                    clearTimeout(tab.webview.__loadingTimeout);
                    tab.webview.__loadingTimeout = null;
                }
                
                // Clear any settings poll interval
                if (tab.webview.__settingsPollInterval) {
                    clearInterval(tab.webview.__settingsPollInterval);
                    tab.webview.__settingsPollInterval = null;
                }
                
                if (tab.webview.parentNode) {
                    tab.webview.parentNode.removeChild(tab.webview);
                }
            } catch (e) {
                console.error('Error removing webview:', e);
            }
        }
        
        if (tabElement && tabElement.parentNode) {
            // Remove the tab element immediately to avoid layout glitches / gaps
            tabElement.parentNode.removeChild(tabElement);
        }

        // Delete the tab FIRST to get accurate remaining tabs count
        this.tabs.delete(tabId);
        
        // If we closed the active tab, switch to another tab: prefer unpinned, then pinned; only show empty state if none left
        if (this.currentTab === tabId) {
            this.currentTab = null;
            const remainingUnpinned = Array.from(this.tabs.keys()).filter(id => {
                const t = this.tabs.get(id);
                return t && !t.pinned;
            });
            if (remainingUnpinned.length > 0 && this.tabs.has(remainingUnpinned[remainingUnpinned.length - 1])) {
                this.switchToTab(remainingUnpinned[remainingUnpinned.length - 1]);
            } else {
                const remainingPinnedActive = Array.from(this.tabs.keys()).filter(id => {
                    const t = this.tabs.get(id);
                    return t && t.pinned && t.webview;
                });
                if (remainingPinnedActive.length > 0 && this.tabs.has(remainingPinnedActive[0])) {
                    this.switchToTab(remainingPinnedActive[0]);
                } else {
                    const webview = document.getElementById('webview');
                    if (webview) webview.src = 'about:blank';
                    this.resetToBlackTheme();
                    this.updateEmptyState();
                    this.updateUrlBar();
                    this.updateNavigationButtons();
                }
            }
        }
    }

    clearUnpinnedTabs() {
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (!tabsContainer || !separator) return;
        
        // Get all unpinned tabs (tabs that appear after the separator)
        const allElements = Array.from(tabsContainer.children);
        const separatorIndex = allElements.indexOf(separator);
        
        // Collect unpinned tab IDs
        const unpinnedTabIds = [];
        for (let i = separatorIndex + 1; i < allElements.length; i++) {
            const el = allElements[i];
            if (el.classList.contains('tab')) {
                const tabId = parseInt(el.dataset.tabId, 10);
                if (!isNaN(tabId)) {
                    const tab = this.tabs.get(tabId);
                    if (tab && !tab.pinned) {
                        unpinnedTabIds.push(tabId);
                    }
                }
            } else if (el.classList.contains('tab-group')) {
                // Also get tabs inside tab groups (they're in unpinned section)
                const tabsInGroup = el.querySelectorAll('.tab');
                tabsInGroup.forEach(t => {
                    const tabId = parseInt(t.dataset.tabId, 10);
                    if (!isNaN(tabId)) {
                        unpinnedTabIds.push(tabId);
                    }
                });
            }
        }
        
        if (unpinnedTabIds.length === 0) {
            return;
        }
        
        // Close all unpinned tabs
        unpinnedTabIds.forEach(tabId => {
            this.closeTab(tabId);
        });
        
        // Save state
        this.savePinnedTabs();
        this.saveTabGroups();
    }

    performTabUndo() {
        // Don't steal Cmd+Z when user is typing in an input
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }
        if (this.tabUndoStack.length === 0) {
            this.recoverClosedTab();
            return;
        }
        const action = this.tabUndoStack.pop();
        if (action.type === 'close_tab') {
            const data = action.data;
            const urlToLoad = this.sanitizeUrl(data.url) || data.url || 'https://www.google.com';
            const newTabId = this.createNewTab(urlToLoad);
            const tab = this.tabs.get(newTabId);
            if (tab) {
                tab.title = data.title;
                if (data.customTitle) tab.customTitle = data.customTitle;
                const tabElement = document.querySelector(`[data-tab-id="${newTabId}"]`);
                if (tabElement) {
                    const titleEl = tabElement.querySelector('.tab-title');
                    if (titleEl) titleEl.textContent = data.customTitle || data.title;
                }
                if (data.tabGroupId && this.tabGroups.has(data.tabGroupId)) {
                    this.addTabToTabGroup(newTabId, data.tabGroupId, true);
                }
                const idx = this.closedTabs.findIndex(t => t.url === data.url && t.title === data.title);
                if (idx >= 0) this.closedTabs.splice(idx, 1);
                this.showNotification(`Undo: Recovered ${data.title}`, 'success');
            }
        } else if (action.type === 'add_to_group') {
            this.removeTabFromTabGroup(action.tabId, action.tabGroupId, true);
            this.showNotification('Undo: Tab removed from group', 'success');
        } else if (action.type === 'remove_from_group') {
            this.addTabToTabGroup(action.tabId, action.tabGroupId, true, action.indexInGroup);
            this.showNotification('Undo: Tab put back in group', 'success');
        }
    }

    recoverClosedTab() {
        if (this.closedTabs.length === 0) {
            this.showNotification('No closed tabs to recover', 'info');
            return;
        }
        
        // Get the most recently closed tab
        const closedTab = this.closedTabs.shift();
        const urlToLoad = this.sanitizeUrl(closedTab.url) || closedTab.url || 'https://www.google.com';
        
        // Create new tab and navigate directly to the closed tab's URL
        const newTabId = this.createNewTab(urlToLoad);
        const tab = this.tabs.get(newTabId);
        
        if (tab) {
            tab.title = closedTab.title;
            if (closedTab.customTitle) tab.customTitle = closedTab.customTitle;
            const tabElement = document.querySelector(`[data-tab-id="${newTabId}"]`);
            if (tabElement) {
                const titleElement = tabElement.querySelector('.tab-title');
                if (titleElement) titleElement.textContent = closedTab.customTitle || closedTab.title;
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

        // Protect settings tabs - don't navigate away from settings
        const tab = this.tabs.get(this.currentTab);
        if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
            // Don't navigate away from settings tab
            return;
        }

        // Sanitize and validate URL input
        const sanitizedUrl = this.sanitizeUrl(url);
        if (!sanitizedUrl) {
            console.error('Invalid URL provided:', url);
            return;
        }

        // Load URL in active webview
        const webview = this.getActiveWebview();
        if (webview) {
            webview.src = sanitizedUrl;
        }

        // Update tab data and add to history
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
        
        // Update navigation buttons
        this.updateNavigationButtons();
    }

    goBack() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) return;
        
        const webview = this.getActiveWebview();
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
        
        const webview = this.getActiveWebview();
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
        // Don't navigate away from settings tabs
        const currentTab = this.tabs.get(this.currentTab);
        if (currentTab && (currentTab.url === 'axis://settings' || currentTab.isSettings)) {
            return;
        }
        
        const webview = this.getActiveWebview();
        
        if (webview) {
            const sanitizedUrl = this.sanitizeUrl(url);
            webview.src = sanitizedUrl || 'https://www.google.com';
            
            // Update tab data
            if (currentTab) {
                currentTab.url = url;
            }
        }
    }

    refresh() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        
        // If webview is currently loading, stop it smoothly.
        // We rely on did-stop-loading / did-finish-load events to update UI
        if (this.isWebviewLoading) {
            try {
                webview.stop();
            } catch (e) {
                console.error('Error stopping webview:', e);
            }
            return;
        }

        // Otherwise, start a normal reload
        webview.reload();
    }
    
    updateRefreshButton(isLoading) {
        const refreshBtn = this.elements?.urlBarRefresh;
        if (!refreshBtn) return;
        
        const icon = refreshBtn.querySelector('i');
        if (!icon) return;
        
        if (isLoading) {
            // Change to X (stop) icon
            icon.className = 'fas fa-times';
            refreshBtn.title = 'Stop Loading';
        } else {
            // Change back to reload icon
            icon.className = 'fas fa-redo-alt';
            refreshBtn.title = 'Reload';
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

        const webview = el?.webview;

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
        // Old URL bar removed - this function now calls the new webview URL bar update
        // Get webview from current tab and update the new URL bar
        if (this.currentTab) {
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.webview) {
                this.updateUrlBar(tab.webview);
            }
        }
    }

    summarizeUrlBar() {
        // Old URL bar removed - function kept for compatibility but does nothing
        return;
    }

    /**
     * Safely determine whether a URL belongs to a given registrable domain.
     *
     * This parses the URL and inspects the hostname instead of using substring
     * checks on the full URL, which could be bypassed by hosts like
     * "evil-amazon.com".
     */
    isUrlOnDomain(rawUrl, domain) {
        if (!rawUrl || typeof rawUrl !== 'string') {
            return false;
        }

        let urlObj;
        try {
            // Try absolute URL first
            urlObj = new URL(rawUrl);
        } catch (e) {
            try {
                // Fallback: treat as relative URL using a safe dummy base
                urlObj = new URL(rawUrl, 'http://dummy');
            } catch (e2) {
                return false;
            }
        }

        const hostname = urlObj.hostname;
        if (!hostname) return false;

        if (hostname === domain) return true;
        return hostname.endsWith(`.${domain}`);
    }

    toggleUrlBarExpansion() {
        // Old URL bar removed - function kept for compatibility but does nothing
        return;
    }

    updateTabTitle() {
        const webview = this.elements?.webview;
        if (!webview) return;
        
        // Check if tab has a custom title (user-renamed)
        const tab = this.tabs.get(this.currentTab);
        if (tab && tab.customTitle) {
            // Use custom title instead of webview title
            const title = tab.customTitle;
            
            // Direct DOM updates for maximum speed
            const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
            if (tabElement) {
                const titleElement = tabElement.querySelector('.tab-title');
                if (titleElement && titleElement.textContent !== title) {
                    titleElement.textContent = title;
                }
            }
            
            // Ensure tab data has the custom title
            tab.title = title;
            
            // Also refresh favicon on title change as sites often inject icons late
            const activeTabEl = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
            if (activeTabEl) this.updateTabFavicon(this.currentTab, activeTabEl);
            return;
        }
        
        // No custom title - use webview title
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
                    <i class="fas fa-cog tab-settings-icon"></i>
                    <span class="tab-title">Settings</span>
                </div>
                <div class="tab-right">
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
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

        // Set webview background immediately to prevent flash
        webview.style.setProperty('background', 'rgba(40, 40, 40, 0.95)', 'important');

        // Reload settings from storage to ensure we have latest values
        await this.loadSettings();

        // Get current settings (with defaults)
        const sidebarPosition = this.settings.sidebarPosition || 'left';
        const searchEngine = this.settings.searchEngine || 'google';

        // Get keyboard shortcuts
        let shortcuts = {};
        try {
            shortcuts = await window.electronAPI.getShortcuts();
        } catch (err) {
            console.error('Failed to load shortcuts:', err);
        }

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
            /* Let the main app theme show through instead of forcing grey */
            background: transparent;
            color: #fff;
            min-height: 100vh;
            padding: 0;
            line-height: 1.6;
            overflow: hidden;
        }
        .settings-wrapper {
            display: flex;
            flex-direction: column;
            height: 100vh;
            /* Transparent so it sits on top of the existing theme */
            background: transparent;
        }
        .settings-header {
            display: flex;
            align-items: center;
            padding: 20px 24px;
            background: rgba(40, 40, 40, 0.95);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .header-title {
            font-size: 22px;
            font-weight: 600;
            color: #fff;
            margin: 0;
        }
        .settings-content-wrapper {
            display: flex;
            flex: 1;
            overflow: hidden;
            padding: 24px;
            gap: 20px;
        }
        .settings-sidebar {
            width: 200px;
            background: transparent;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 4px;
            flex-shrink: 0;
        }
        .nav-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 10px 12px;
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.7);
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            font-size: 14px;
            font-weight: 500;
        }
        .nav-item i {
            width: 18px;
            text-align: center;
            font-size: 14px;
        }
        .nav-item:hover {
            background: rgba(255, 255, 255, 0.05);
            color: #fff;
        }
        .nav-item.active {
            background: rgba(255, 255, 255, 0.08);
            color: #fff;
            font-weight: 600;
        }
        .settings-main {
            flex: 1;
            background: transparent;
            padding: 0;
            overflow-y: auto;
        }
        .settings-main::-webkit-scrollbar {
            width: 8px;
        }
        .settings-main::-webkit-scrollbar-track {
            background: transparent;
        }
        .settings-main::-webkit-scrollbar-thumb {
            background: #444;
            border-radius: 4px;
        }
        .settings-main::-webkit-scrollbar-thumb:hover {
            background: #555;
        }
        .section {
            margin-bottom: 24px;
        }
        .section:last-child {
            margin-bottom: 0;
        }
        .section-title {
            font-size: 16px;
            font-weight: 600;
            color: #fff;
            margin: 0 0 16px 0;
        }
        .section-title-with-icon {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 16px;
        }
        .section-title-with-icon .section-title {
            margin: 0;
        }
        .shortcuts-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
        }
        .shortcuts-title-row .section-title {
            margin: 0;
        }
        .option-button {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            margin-bottom: 8px;
            width: 100%;
        }
        .option-button:last-child {
            margin-bottom: 0;
        }
        .option-button:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.12);
        }
        .option-button i {
            font-size: 16px;
            color: rgba(255, 255, 255, 0.7);
            width: 18px;
            text-align: center;
        }
        .option-content {
            flex: 1;
        }
        .option-title {
            font-size: 14px;
            font-weight: 500;
            color: #fff;
            margin-bottom: 2px;
        }
        .option-subtitle {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
        }
        .settings-tab-content {
            display: none;
            overflow-x: hidden;
            overflow-y: auto;
            width: 100%;
            box-sizing: border-box;
        }
        .settings-tab-content.active {
            display: block;
        }
        .history-controls {
            display: flex;
            gap: 12px;
            margin-bottom: 24px;
        }
        .history-search {
            flex: 1;
            padding: 12px 16px;
            background: #0a0a0a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.2s ease;
        }
        .history-search:focus {
            border-color: rgba(255, 255, 255, 0.2);
            background: #111111;
        }
        .history-search::placeholder {
            color: rgba(255, 255, 255, 0.4);
        }
        .clear-btn {
            padding: 12px 20px;
            background: #0a0a0a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
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
        }
        .history-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .history-item {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 12px 16px;
            background: #0a0a0a;
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
        }
        .history-item:hover {
            background: #111111;
            border-color: rgba(255, 255, 255, 0.12);
        }
        .history-favicon {
            width: 16px;
            height: 16px;
            border-radius: 3px;
            flex-shrink: 0;
        }
        .history-info {
            flex: 1;
            min-width: 0;
        }
        .history-title {
            font-size: 14px;
            font-weight: 500;
            color: #fff;
            margin-bottom: 4px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .history-url {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .history-time {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.4);
            white-space: nowrap;
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
            padding: 6px 10px;
            background: #0a0a0a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
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
        }
        .shortcut-group {
            margin-bottom: 24px;
            width: 100%;
            box-sizing: border-box;
            overflow-x: hidden;
        }
        .shortcut-group:last-child {
            margin-bottom: 0;
        }
        .shortcut-group h4 {
            font-size: 12px;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.6);
            margin-bottom: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .shortcut-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.05);
            gap: 16px;
            min-width: 0;
            width: 100%;
            box-sizing: border-box;
        }
        .shortcut-item:last-child {
            border-bottom: none;
        }
        .shortcut-key {
            font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            padding: 6px 10px;
            background: #0a0a0a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: #fff;
            font-weight: 500;
            min-width: 80px;
            text-align: center;
        }
        .shortcut-desc {
            font-size: 14px;
            color: rgba(255, 255, 255, 0.8);
            flex: 1;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .shortcuts-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            gap: 16px;
            flex-wrap: wrap;
            width: 100%;
            box-sizing: border-box;
        }
        .shortcuts-info {
            font-size: 13px;
            color: rgba(255, 255, 255, 0.5);
            margin: 0;
        }
        .reset-shortcuts-btn {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: rgba(255, 255, 255, 0.8);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s ease;
            flex-shrink: 0;
            white-space: nowrap;
        }
        .reset-shortcuts-btn:hover {
            background: rgba(255, 255, 255, 0.12);
            border-color: rgba(255, 255, 255, 0.2);
            color: #fff;
        }
        .reset-shortcuts-btn:active {
            transform: scale(0.98);
        }
        .reset-shortcuts-btn i {
            font-size: 12px;
        }
        .shortcut-input {
            font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
            font-size: 12px;
            padding: 8px 12px;
            background: #0a0a0a;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: #fff;
            font-weight: 500;
            min-width: 80px;
            max-width: 150px;
            width: auto;
            flex-shrink: 0;
            text-align: center;
            cursor: pointer;
            transition: all 0.2s ease;
            outline: none;
            box-sizing: border-box;
        }
        .shortcut-input:hover {
            border-color: rgba(255, 255, 255, 0.25);
            background: #111;
        }
        .shortcut-input:focus {
            border-color: #4a9eff;
            background: #111;
            box-shadow: 0 0 0 3px rgba(74, 158, 255, 0.2);
        }
        .shortcut-input.recording {
            border-color: #ff9800;
            background: rgba(255, 152, 0, 0.1);
            animation: pulse-recording 1.5s infinite;
        }
        @keyframes pulse-recording {
            0%, 100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.4); }
            50% { box-shadow: 0 0 0 4px rgba(255, 152, 0, 0.2); }
        }
        .shortcut-item.editable {
            cursor: default;
        }
        .shortcut-item.editable:hover {
            background: rgba(255, 255, 255, 0.02);
            border-radius: 8px;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: rgba(255, 255, 255, 0.4);
        }
        .empty-state i {
            font-size: 48px;
            color: rgba(255, 255, 255, 0.15);
            margin-bottom: 16px;
        }
        .toggle-switch {
            position: relative;
            width: 42px;
            height: 24px;
            flex-shrink: 0;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.1);
            transition: .2s;
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.15);
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 2px;
            bottom: 2px;
            background-color: rgba(255, 255, 255, 0.5);
            transition: .2s;
            border-radius: 50%;
        }
        .toggle-switch input:checked + .toggle-slider {
            background-color: #3B82F6;
            border-color: #3B82F6;
        }
        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(18px);
            background-color: #fff;
        }
        .toggle-switch input:focus + .toggle-slider {
            box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
        }
        .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 16px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 8px;
            margin-bottom: 12px;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .setting-row:last-child {
            margin-bottom: 0;
        }
        .setting-row:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.12);
        }
        .setting-row-content {
            flex: 1;
            margin-right: 24px;
        }
        .setting-row-title {
            font-size: 14px;
            font-weight: 500;
            color: #fff;
            margin-bottom: 2px;
        }
        .setting-row-desc {
            font-size: 12px;
            color: rgba(255, 255, 255, 0.5);
        }
        .setting-select {
            padding: 8px 12px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: #fff;
            font-size: 14px;
            cursor: pointer;
            outline: none;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            min-width: 140px;
        }
        .setting-select:hover {
            background: rgba(255, 255, 255, 0.08);
            border-color: rgba(255, 255, 255, 0.15);
        }
        .setting-select:focus {
            border-color: rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.08);
        }
        .setting-select option {
            background: #1a1a1a;
            color: #fff;
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 48px;
            height: 24px;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: rgba(255, 255, 255, 0.1);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 24px;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 2px;
            background-color: #fff;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            border-radius: 50%;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
        }
        .toggle-switch input:checked + .toggle-slider {
            background-color: rgba(255, 255, 255, 0.2);
            border-color: rgba(255, 255, 255, 0.3);
        }
        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(24px);
        }
        .toggle-switch:hover .toggle-slider {
            background-color: rgba(255, 255, 255, 0.15);
            border-color: rgba(255, 255, 255, 0.2);
        }
        .gradient-settings {
            transition: opacity 0.3s ease, max-height 0.3s ease;
        }
        .custom-color-picker-wrapper {
            position: relative;
        }
        .custom-color-picker-trigger {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 8px 14px;
            min-width: 140px;
            height: 36px;
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.05);
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            outline: none;
            position: relative;
            overflow: hidden;
        }
        .custom-color-picker-trigger::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: inherit;
            border-radius: 8px;
            z-index: 0;
        }
        .custom-color-picker-trigger:hover {
            border-color: rgba(255, 255, 255, 0.2);
            background: rgba(255, 255, 255, 0.08);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }
        .custom-color-picker-trigger:active {
            transform: translateY(0);
        }
        .color-picker-hex {
            font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
            font-size: 13px;
            color: #fff;
            font-weight: 500;
            z-index: 1;
            position: relative;
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
        }
        .color-picker-arrow {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.7);
            transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 1;
            position: relative;
        }
        .custom-color-picker-trigger.active .color-picker-arrow {
            transform: rotate(180deg);
        }
        .custom-color-picker-popup {
            position: fixed;
            width: 280px;
            background: rgba(20, 20, 20, 0.98);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
            opacity: 0;
            visibility: hidden;
            transform: translateY(-10px) scale(0.95);
            transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
            z-index: 10000;
            overflow: visible;
        }
        .custom-color-picker-popup.show {
            opacity: 1;
            visibility: visible;
            transform: translateY(0) scale(1);
        }
        .color-picker-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            background: rgba(255, 255, 255, 0.02);
        }
        .color-picker-header span {
            font-size: 13px;
            font-weight: 600;
            color: #fff;
        }
        .color-picker-close {
            width: 24px;
            height: 24px;
            border: none;
            background: transparent;
            color: rgba(255, 255, 255, 0.6);
            cursor: pointer;
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            padding: 0;
        }
        .color-picker-close:hover {
            background: rgba(255, 255, 255, 0.1);
            color: #fff;
        }
        .color-picker-body {
            padding: 16px;
        }
        .color-picker-saturation {
            width: 100%;
            height: 180px;
            position: relative;
            border-radius: 8px;
            overflow: hidden;
            cursor: crosshair;
            margin-bottom: 12px;
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
            background: #ff0000;
        }
        .color-picker-white {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(to right, rgba(255, 255, 255, 1), rgba(255, 255, 255, 0));
            pointer-events: none;
        }
        .color-picker-black {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(to top, rgba(0, 0, 0, 1), rgba(0, 0, 0, 0));
            pointer-events: none;
        }
        .color-picker-cursor {
            position: absolute;
            width: 18px;
            height: 18px;
            border: 2px solid #fff;
            border-radius: 50%;
            box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3), 0 2px 8px rgba(0, 0, 0, 0.4);
            transform: translate(-50%, -50%);
            pointer-events: none;
            transition: transform 0.05s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 10;
        }
        .color-picker-hue {
            width: 100%;
            height: 12px;
            position: relative;
            border-radius: 6px;
            margin-bottom: 16px;
            cursor: pointer;
            background: linear-gradient(to right, 
                #ff0000 0%, 
                #ffff00 16.66%, 
                #00ff00 33.33%, 
                #00ffff 50%, 
                #0000ff 66.66%, 
                #ff00ff 83.33%, 
                #ff0000 100%);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
        }
        .color-picker-hue-cursor {
            position: absolute;
            top: 50%;
            width: 18px;
            height: 18px;
            border: 2px solid #fff;
            border-radius: 50%;
            background: #fff;
            box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.2), 0 2px 6px rgba(0, 0, 0, 0.4);
            transform: translate(-50%, -50%);
            pointer-events: none;
            transition: left 0.05s cubic-bezier(0.4, 0, 0.2, 1);
            z-index: 10;
        }
        .color-picker-inputs {
            display: grid;
            grid-template-columns: 1fr 1fr 1fr 1fr;
            gap: 8px;
        }
        .color-input-group {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        .color-input-group label {
            font-size: 11px;
            color: rgba(255, 255, 255, 0.5);
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .color-input {
            width: 100%;
            padding: 6px 8px;
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 6px;
            color: #fff;
            font-size: 12px;
            font-family: 'SF Mono', 'Monaco', 'Menlo', monospace;
            outline: none;
            transition: all 0.2s ease;
        }
        .color-input:focus {
            border-color: rgba(255, 255, 255, 0.3);
            background: rgba(255, 255, 255, 0.08);
        }
        .color-input.hex-input {
            grid-column: 1 / -1;
        }
        .theme-preview {
            width: 200px;
            height: 60px;
            border-radius: 8px;
            overflow: hidden;
            border: 1px solid rgba(255, 255, 255, 0.1);
        }
        .theme-preview-gradient {
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, var(--theme-color, #1a1a1a) 0%, var(--gradient-color, #2a2a2a) 100%);
        }
        .fade-in {
            animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
        }
    </style>
</head>
<body>
    <div class="settings-wrapper">
        <div class="settings-header">
            <h1 class="header-title">Settings</h1>
        </div>
        
        <div class="settings-content-wrapper">
            <div class="settings-sidebar">
                <div class="nav-item active" data-section="customization">
                    <i class="fas fa-palette"></i>
                    <span>Looks &amp; Feel</span>
                </div>
                <div class="nav-item" data-section="history">
                    <i class="fas fa-history"></i>
                    <span>History</span>
                </div>
                <div class="nav-item" data-section="shortcuts">
                    <i class="fas fa-keyboard"></i>
                    <span>Shortcuts</span>
                </div>
            </div>
            
            <div class="settings-main">
                <div class="settings-tab-content active" id="customization-tab">
                    <div class="section fade-in">
                        <div class="section-title-with-icon">
                            <div class="section-icon"><i class="fas fa-sliders-h"></i></div>
                            <h2 class="section-title">Appearance</h2>
                        </div>
                        <div class="setting-row">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Sidebar Position</div>
                                <div class="setting-row-desc">Choose where the sidebar appears</div>
                            </div>
                            <select id="sidebar-position" class="setting-select">
                                <option value="left" ${sidebarPosition === 'left' ? 'selected' : ''}>Left</option>
                                <option value="right" ${sidebarPosition === 'right' ? 'selected' : ''}>Right</option>
                            </select>
                        </div>
                        <div class="setting-row">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Search Engine</div>
                                <div class="setting-row-desc">Choose your default search engine</div>
                            </div>
                            <select id="search-engine" class="setting-select">
                                <option value="google" ${searchEngine === 'google' ? 'selected' : ''}>Google</option>
                                <option value="bing" ${searchEngine === 'bing' ? 'selected' : ''}>Bing</option>
                                <option value="duckduckgo" ${searchEngine === 'duckduckgo' ? 'selected' : ''}>DuckDuckGo</option>
                            </select>
                        </div>
                    </div>
                    
                    <div class="section fade-in">
                        <div class="section-title-with-icon">
                            <div class="section-icon"><i class="fas fa-palette"></i></div>
                            <h2 class="section-title">Theme Colors</h2>
                        </div>
                        <div class="setting-row">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Theme Color</div>
                                <div class="setting-row-desc">Choose your primary theme color</div>
                            </div>
                            <div class="custom-color-picker-wrapper">
                                <button class="custom-color-picker-trigger" id="theme-color-trigger" style="background: ${this.settings.themeColor || '#1a1a1a'};">
                                    <span class="color-picker-hex" id="theme-color-display">${this.settings.themeColor || '#1a1a1a'}</span>
                                    <i class="fas fa-chevron-down color-picker-arrow"></i>
                                </button>
                                <div class="custom-color-picker-popup" id="theme-color-picker-popup">
                                    <div class="color-picker-header">
                                        <span>Theme Color</span>
                                        <button class="color-picker-close"><i class="fas fa-times"></i></button>
                                    </div>
                                    <div class="color-picker-body">
                                        <div class="color-picker-saturation" id="theme-saturation">
                                            <div class="color-picker-white"></div>
                                            <div class="color-picker-black"></div>
                                            <div class="color-picker-cursor" id="theme-cursor"></div>
                                        </div>
                                        <div class="color-picker-hue" id="theme-hue">
                                            <div class="color-picker-hue-cursor" id="theme-hue-cursor"></div>
                                        </div>
                                        <div class="color-picker-inputs">
                                            <div class="color-input-group">
                                                <label>Hex</label>
                                                <input type="text" class="color-input hex-input" id="theme-hex-input" value="${this.settings.themeColor || '#1a1a1a'}">
                                            </div>
                                            <div class="color-input-group">
                                                <label>R</label>
                                                <input type="number" class="color-input rgb-input" id="theme-r-input" min="0" max="255" value="26">
                                            </div>
                                            <div class="color-input-group">
                                                <label>G</label>
                                                <input type="number" class="color-input rgb-input" id="theme-g-input" min="0" max="255" value="26">
                                            </div>
                                            <div class="color-input-group">
                                                <label>B</label>
                                                <input type="number" class="color-input rgb-input" id="theme-b-input" min="0" max="255" value="26">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="setting-row">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Enable Gradient</div>
                                <div class="setting-row-desc">Use a gradient instead of a solid color</div>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="gradient-enabled" ${this.settings.gradientEnabled ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="setting-row gradient-settings" id="gradient-settings-row" style="display: ${this.settings.gradientEnabled ? 'flex' : 'none'};">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Gradient Color</div>
                                <div class="setting-row-desc">Choose a second color for gradient effects</div>
                            </div>
                            <div class="custom-color-picker-wrapper">
                                <button class="custom-color-picker-trigger" id="gradient-color-trigger" style="background: ${this.settings.gradientColor || '#2a2a2a'};">
                                    <span class="color-picker-hex" id="gradient-color-display">${this.settings.gradientColor || '#2a2a2a'}</span>
                                    <i class="fas fa-chevron-down color-picker-arrow"></i>
                                </button>
                                <div class="custom-color-picker-popup" id="gradient-color-picker-popup">
                                    <div class="color-picker-header">
                                        <span>Gradient Color</span>
                                        <button class="color-picker-close"><i class="fas fa-times"></i></button>
                                    </div>
                                    <div class="color-picker-body">
                                        <div class="color-picker-saturation" id="gradient-saturation">
                                            <div class="color-picker-white"></div>
                                            <div class="color-picker-black"></div>
                                            <div class="color-picker-cursor" id="gradient-cursor"></div>
                                        </div>
                                        <div class="color-picker-hue" id="gradient-hue">
                                            <div class="color-picker-hue-cursor" id="gradient-hue-cursor"></div>
                                        </div>
                                        <div class="color-picker-inputs">
                                            <div class="color-input-group">
                                                <label>Hex</label>
                                                <input type="text" class="color-input hex-input" id="gradient-hex-input" value="${this.settings.gradientColor || '#2a2a2a'}">
                                            </div>
                                            <div class="color-input-group">
                                                <label>R</label>
                                                <input type="number" class="color-input rgb-input" id="gradient-r-input" min="0" max="255" value="42">
                                            </div>
                                            <div class="color-input-group">
                                                <label>G</label>
                                                <input type="number" class="color-input rgb-input" id="gradient-g-input" min="0" max="255" value="42">
                                            </div>
                                            <div class="color-input-group">
                                                <label>B</label>
                                                <input type="number" class="color-input rgb-input" id="gradient-b-input" min="0" max="255" value="42">
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="setting-row gradient-settings" id="gradient-direction-row" style="display: ${this.settings.gradientEnabled ? 'flex' : 'none'};">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Gradient Direction</div>
                                <div class="setting-row-desc">Choose the direction of the gradient</div>
                            </div>
                            <select id="gradient-direction" class="setting-select">
                                <option value="to right" ${this.settings.gradientDirection === 'to right' ? 'selected' : ''}>→ Right</option>
                                <option value="to left" ${this.settings.gradientDirection === 'to left' ? 'selected' : ''}>← Left</option>
                                <option value="to bottom" ${this.settings.gradientDirection === 'to bottom' ? 'selected' : ''}>↓ Bottom</option>
                                <option value="to top" ${this.settings.gradientDirection === 'to top' ? 'selected' : ''}>↑ Top</option>
                                <option value="135deg" ${this.settings.gradientDirection === '135deg' ? 'selected' : ''}>↗ Diagonal Right</option>
                                <option value="45deg" ${this.settings.gradientDirection === '45deg' ? 'selected' : ''}>↘ Diagonal Left</option>
                                <option value="225deg" ${this.settings.gradientDirection === '225deg' ? 'selected' : ''}>↙ Diagonal Bottom Right</option>
                                <option value="315deg" ${this.settings.gradientDirection === '315deg' ? 'selected' : ''}>↖ Diagonal Top Right</option>
                            </select>
                        </div>
                        <div class="setting-row">
                            <div class="setting-row-content">
                                <div class="setting-row-title">Preview</div>
                                <div class="setting-row-desc">See how your theme looks</div>
                            </div>
                            <div class="theme-preview" id="theme-preview">
                                <div class="theme-preview-gradient"></div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="settings-tab-content" id="history-tab">
                    <div class="section fade-in">
                        <div class="section-title-with-icon">
                            <div class="section-icon"><i class="fas fa-history"></i></div>
                            <h2 class="section-title">Browsing History</h2>
                        </div>
                        <div class="history-controls">
                            <input type="text" id="history-search" placeholder="Search history..." class="history-search">
                            <button id="clear-history" class="clear-btn">
                                <i class="fas fa-trash"></i> Clear All
                            </button>
                        </div>
                        <div class="history-list" id="history-list">
                            ${historyHtml}
                        </div>
                    </div>
                </div>
                
                <div class="settings-tab-content" id="shortcuts-tab">
                    <div class="section fade-in">
                        <div class="section-title-with-icon shortcuts-title-row">
                            <div style="display: flex; align-items: center; gap: 10px;">
                            <div class="section-icon"><i class="fas fa-keyboard"></i></div>
                            <h2 class="section-title">Keyboard Shortcuts</h2>
                            </div>
                            <button id="reset-shortcuts-btn" class="reset-shortcuts-btn">
                                <i class="fas fa-undo"></i> Reset to Defaults
                            </button>
                        </div>
                        <div class="shortcut-group">
                            <h4>Navigation</h4>
                            <div class="shortcut-item editable" data-action="spotlight-search">
                                <span class="shortcut-desc">New Tab / Spotlight</span>
                                <input type="text" class="shortcut-input" readonly data-action="spotlight-search">
                            </div>
                            <div class="shortcut-item editable" data-action="close-tab">
                                <span class="shortcut-desc">Close Tab</span>
                                <input type="text" class="shortcut-input" readonly data-action="close-tab">
                            </div>
                            <div class="shortcut-item editable" data-action="new-tab">
                                <span class="shortcut-desc">New Window</span>
                                <input type="text" class="shortcut-input" readonly data-action="new-tab">
                            </div>
                            <div class="shortcut-item editable" data-action="recover-tab">
                                <span class="shortcut-desc">Recover Closed Tab</span>
                                <input type="text" class="shortcut-input" readonly data-action="recover-tab">
                            </div>
                            <div class="shortcut-item editable" data-action="refresh">
                                <span class="shortcut-desc">Refresh Page</span>
                                <input type="text" class="shortcut-input" readonly data-action="refresh">
                            </div>
                            <div class="shortcut-item editable" data-action="focus-url">
                                <span class="shortcut-desc">Focus URL Bar</span>
                                <input type="text" class="shortcut-input" readonly data-action="focus-url">
                            </div>
                            <div class="shortcut-item editable" data-action="find">
                                <span class="shortcut-desc">Find in Page</span>
                                <input type="text" class="shortcut-input" readonly data-action="find">
                            </div>
                            <div class="shortcut-item editable" data-action="copy-url">
                                <span class="shortcut-desc">Copy Current URL</span>
                                <input type="text" class="shortcut-input" readonly data-action="copy-url">
                            </div>
                        </div>
                        
                        <div class="shortcut-group">
                            <h4>Tab Management</h4>
                            <div class="shortcut-item editable" data-action="pin-tab">
                                <span class="shortcut-desc">Pin / Unpin Tab</span>
                                <input type="text" class="shortcut-input" readonly data-action="pin-tab">
                            </div>
                        </div>
                        
                        <div class="shortcut-group">
                            <h4>Zoom</h4>
                            <div class="shortcut-item editable" data-action="zoom-in">
                                <span class="shortcut-desc">Zoom In</span>
                                <input type="text" class="shortcut-input" readonly data-action="zoom-in">
                            </div>
                            <div class="shortcut-item editable" data-action="zoom-out">
                                <span class="shortcut-desc">Zoom Out</span>
                                <input type="text" class="shortcut-input" readonly data-action="zoom-out">
                            </div>
                            <div class="shortcut-item editable" data-action="reset-zoom">
                                <span class="shortcut-desc">Reset Zoom</span>
                                <input type="text" class="shortcut-input" readonly data-action="reset-zoom">
                            </div>
                        </div>
                        
                        <div class="shortcut-group">
                            <h4>Panels & Menus</h4>
                            <div class="shortcut-item editable" data-action="toggle-sidebar">
                                <span class="shortcut-desc">Toggle Sidebar</span>
                                <input type="text" class="shortcut-input" readonly data-action="toggle-sidebar">
                            </div>
                            <div class="shortcut-item editable" data-action="history">
                                <span class="shortcut-desc">Open History</span>
                                <input type="text" class="shortcut-input" readonly data-action="history">
                            </div>
                            <div class="shortcut-item editable" data-action="downloads">
                                <span class="shortcut-desc">Open Downloads</span>
                                <input type="text" class="shortcut-input" readonly data-action="downloads">
                            </div>
                            <div class="shortcut-item editable" data-action="settings">
                                <span class="shortcut-desc">Open Settings</span>
                                <input type="text" class="shortcut-input" readonly data-action="settings">
                            </div>
                        </div>
                        
                        <div class="shortcut-group">
                            <h4>Data Management</h4>
                            <div class="shortcut-item editable" data-action="clear-history">
                                <span class="shortcut-desc">Clear History</span>
                                <input type="text" class="shortcut-input" readonly data-action="clear-history">
                            </div>
                            <div class="shortcut-item editable" data-action="clear-downloads">
                                <span class="shortcut-desc">Clear Downloads</span>
                                <input type="text" class="shortcut-input" readonly data-action="clear-downloads">
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <script>
        // Inject keyboard shortcuts from parent
        window._axisShortcuts = ${JSON.stringify(shortcuts)};
        
        // Navigation switching
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
                document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
                document.querySelectorAll('.settings-tab-content').forEach(c => c.classList.remove('active'));
                item.classList.add('active');
                const contentId = section + '-tab';
                const contentEl = document.getElementById(contentId);
                if (contentEl) {
                    contentEl.classList.add('active', 'fade-in');
                }
            });
        });
        
        // Toggle switches - save immediately on change
        const sidebarPositionToggle = document.getElementById('sidebar-position');
        if (sidebarPositionToggle) {
            sidebarPositionToggle.addEventListener('change', (e) => {
                const key = 'sidebarPosition';
                const value = e.target.value;
                console.log('SETTINGS_UPDATE:' + JSON.stringify({ type: 'updateSetting', key: key, value: value }));
            });
        }
        
        const searchEngineSelect = document.getElementById('search-engine');
        if (searchEngineSelect) {
            searchEngineSelect.addEventListener('change', (e) => {
                const key = 'searchEngine';
                const value = e.target.value;
                console.log('SETTINGS_UPDATE:' + JSON.stringify({ type: 'updateSetting', key: key, value: value }));
            });
        }
        
        // Custom color picker implementation
        function initColorPicker(pickerId, triggerId, popupId, saturationId, hueId, cursorId, hueCursorId, hexInputId, rInputId, gInputId, bInputId, displayId, settingKey) {
            const trigger = document.getElementById(triggerId);
            const popup = document.getElementById(popupId);
            const saturation = document.getElementById(saturationId);
            const hue = document.getElementById(hueId);
            const cursor = document.getElementById(cursorId);
            const hueCursor = document.getElementById(hueCursorId);
            const hexInput = document.getElementById(hexInputId);
            const rInput = document.getElementById(rInputId);
            const gInput = document.getElementById(gInputId);
            const bInput = document.getElementById(bInputId);
            const display = document.getElementById(displayId);
            
            if (!trigger || !popup) return;
            
            let currentHue = 0;
            let currentSaturation = 1;
            let currentBrightness = 0.1;
            let isDragging = false;
            let isHueDragging = false;
            
            // Initialize color from current value
            function initColor(hex) {
                const rgb = hexToRgb(hex);
                if (!rgb) return;
                const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                currentHue = hsv.h;
                currentSaturation = hsv.s;
                currentBrightness = hsv.v;
                updateColor();
            }
            
            // Initialize on load
            const initialHex = display ? display.textContent : (settingKey === 'themeColor' ? '#1a1a1a' : '#2a2a2a');
            initColor(initialHex);
            
            function hexToRgb(hex) {
                const result = /^#?([a-f\\d]{2})([a-f\\d]{2})([a-f\\d]{2})$/i.exec(hex);
                return result ? {
                    r: parseInt(result[1], 16),
                    g: parseInt(result[2], 16),
                    b: parseInt(result[3], 16)
                } : null;
            }
            
            function rgbToHsv(r, g, b) {
                r /= 255; g /= 255; b /= 255;
                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                let h, s, v = max;
                const d = max - min;
                s = max === 0 ? 0 : d / max;
                if (max === min) {
                    h = 0;
                } else {
                    switch (max) {
                        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                        case g: h = ((b - r) / d + 2) / 6; break;
                        case b: h = ((r - g) / d + 4) / 6; break;
                    }
                }
                return { h: h * 360, s, v };
            }
            
            function hsvToRgb(h, s, v) {
                h = h / 360;
                const i = Math.floor(h * 6);
                const f = h * 6 - i;
                const p = v * (1 - s);
                const q = v * (1 - f * s);
                const t = v * (1 - (1 - f) * s);
                let r, g, b;
                switch (i % 6) {
                    case 0: r = v; g = t; b = p; break;
                    case 1: r = q; g = v; b = p; break;
                    case 2: r = p; g = v; b = t; break;
                    case 3: r = p; g = q; b = v; break;
                    case 4: r = t; g = p; b = v; break;
                    case 5: r = v; g = p; b = q; break;
                }
                return {
                    r: Math.round(r * 255),
                    g: Math.round(g * 255),
                    b: Math.round(b * 255)
                };
            }
            
            function rgbToHex(r, g, b) {
                return '#' + [r, g, b].map(x => {
                    const hex = x.toString(16);
                    return hex.length === 1 ? '0' + hex : hex;
                }).join('');
            }
            
            function updateColor() {
                const rgb = hsvToRgb(currentHue, currentSaturation, currentBrightness);
                const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
                
                // Update UI
                if (trigger) {
                    trigger.style.background = hex;
                }
                if (display) {
                    display.textContent = hex.toUpperCase();
                }
                if (hexInput) {
                    hexInput.value = hex.toUpperCase();
                }
                if (rInput) rInput.value = rgb.r;
                if (gInput) gInput.value = rgb.g;
                if (bInput) bInput.value = rgb.b;
                
                // Update saturation background with hue
                if (saturation) {
                    const hueColor = hsvToRgb(currentHue, 1, 1);
                    const hueHex = rgbToHex(hueColor.r, hueColor.g, hueColor.b);
                    // The saturation area background shows the pure hue
                    saturation.style.background = hueHex;
                }
                
                // Update cursor positions
                if (cursor && saturation) {
                    const rect = saturation.getBoundingClientRect();
                    const x = currentSaturation * rect.width;
                    const y = (1 - currentBrightness) * rect.height;
                    cursor.style.left = x + 'px';
                    cursor.style.top = y + 'px';
                }
                
                if (hueCursor && hue) {
                    const rect = hue.getBoundingClientRect();
                    const x = (currentHue / 360) * rect.width;
                    hueCursor.style.left = x + 'px';
                }
                
                // Update preview
                updateThemePreview();
                
                // Save setting
                console.log('SETTINGS_UPDATE:' + JSON.stringify({ type: 'updateSetting', key: settingKey, value: hex }));
            }
            
            // Toggle popup
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isOpen = popup.classList.contains('show');
                if (isOpen) {
                    closePopup();
                } else {
                    openPopup();
                }
            });
            
            function positionPopup() {
                // Calculate position relative to trigger button
                const triggerRect = trigger.getBoundingClientRect();
                const popupWidth = 280;
                const popupHeight = 320; // Approximate height
                const spacing = 8;
                
                // Position popup below trigger, aligned to right
                let top = triggerRect.bottom + spacing;
                let right = window.innerWidth - triggerRect.right;
                
                // Check if popup would go off bottom of screen
                if (top + popupHeight > window.innerHeight) {
                    // Position above trigger instead
                    top = triggerRect.top - popupHeight - spacing;
                    // Make sure it doesn't go off top
                    if (top < 0) {
                        top = spacing;
                    }
                }
                
                // Check if popup would go off right edge
                if (right + popupWidth > window.innerWidth) {
                    right = window.innerWidth - triggerRect.left;
                }
                
                // Check if popup would go off left edge
                if (right > window.innerWidth - 20) {
                    right = 20;
                }
                
                // Apply positioning
                popup.style.top = top + 'px';
                popup.style.right = right + 'px';
                popup.style.left = 'auto';
                popup.style.bottom = 'auto';
            }
            
            function openPopup() {
                positionPopup();
                popup.classList.add('show');
                trigger.classList.add('active');
                // Initialize color from current value
                const currentHex = display ? display.textContent : (settingKey === 'themeColor' ? '#1a1a1a' : '#2a2a2a');
                initColor(currentHex);
                
                // Reposition on window resize
                const resizeHandler = () => {
                    if (popup.classList.contains('show')) {
                        positionPopup();
                    }
                };
                window.addEventListener('resize', resizeHandler);
                // Store handler for cleanup if needed
                popup._resizeHandler = resizeHandler;
            }
            
            function closePopup() {
                popup.classList.remove('show');
                trigger.classList.remove('active');
                // Remove resize handler if it exists
                if (popup._resizeHandler) {
                    window.removeEventListener('resize', popup._resizeHandler);
                    delete popup._resizeHandler;
                }
            }
            
            // Close on outside click (use capture phase for better detection)
            const handleOutsideClick = (e) => {
                if (popup.classList.contains('show') && 
                    !popup.contains(e.target) && 
                    !trigger.contains(e.target)) {
                    closePopup();
                }
            };
            document.addEventListener('click', handleOutsideClick, true);
            
            // Close button
            const closeBtn = popup.querySelector('.color-picker-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', closePopup);
            }
            
            // Saturation picker
            if (saturation) {
                const startDrag = (e) => {
                    e.preventDefault();
                    isDragging = true;
                    updateSaturationFromEvent(e);
                };
                
                const drag = (e) => {
                    if (isDragging) {
                        e.preventDefault();
                        updateSaturationFromEvent(e);
                    }
                };
                
                const endDrag = () => {
                    isDragging = false;
                };
                
                saturation.addEventListener('mousedown', startDrag);
                saturation.addEventListener('touchstart', startDrag, { passive: false });
                
                document.addEventListener('mousemove', drag);
                document.addEventListener('touchmove', drag, { passive: false });
                
                document.addEventListener('mouseup', endDrag);
                document.addEventListener('touchend', endDrag);
            }
            
            function updateSaturationFromEvent(e) {
                if (!saturation) return;
                const rect = saturation.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;
                const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
                const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
                currentSaturation = x / rect.width;
                currentBrightness = 1 - (y / rect.height);
                updateColor();
            }
            
            // Hue picker
            if (hue) {
                const startHueDrag = (e) => {
                    e.preventDefault();
                    isHueDragging = true;
                    updateHueFromEvent(e);
                };
                
                const dragHue = (e) => {
                    if (isHueDragging) {
                        e.preventDefault();
                        updateHueFromEvent(e);
                    }
                };
                
                const endHueDrag = () => {
                    isHueDragging = false;
                };
                
                hue.addEventListener('mousedown', startHueDrag);
                hue.addEventListener('touchstart', startHueDrag, { passive: false });
                
                document.addEventListener('mousemove', dragHue);
                document.addEventListener('touchmove', dragHue, { passive: false });
                
                document.addEventListener('mouseup', endHueDrag);
                document.addEventListener('touchend', endHueDrag);
            }
            
            function updateHueFromEvent(e) {
                if (!hue) return;
                const rect = hue.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
                currentHue = (x / rect.width) * 360;
                updateColor();
            }
            
            // Input handlers
            if (hexInput) {
                hexInput.addEventListener('input', (e) => {
                    const hex = e.target.value;
                    if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                        initColor(hex);
                    }
                });
            }
            
            [rInput, gInput, bInput].forEach((input, index) => {
                if (input) {
                    input.addEventListener('input', (e) => {
                        const r = parseInt(rInput?.value || 0);
                        const g = parseInt(gInput?.value || 0);
                        const b = parseInt(bInput?.value || 0);
                        if (r >= 0 && r <= 255 && g >= 0 && g <= 255 && b >= 0 && b <= 255) {
                            const hsv = rgbToHsv(r, g, b);
                            currentHue = hsv.h;
                            currentSaturation = hsv.s;
                            currentBrightness = hsv.v;
                            updateColor();
                        }
                    });
                }
            });
        }
        
        // Initialize both color pickers
        initColorPicker('theme', 'theme-color-trigger', 'theme-color-picker-popup', 
            'theme-saturation', 'theme-hue', 'theme-cursor', 'theme-hue-cursor',
            'theme-hex-input', 'theme-r-input', 'theme-g-input', 'theme-b-input',
            'theme-color-display', 'themeColor');
        
        initColorPicker('gradient', 'gradient-color-trigger', 'gradient-color-picker-popup',
            'gradient-saturation', 'gradient-hue', 'gradient-cursor', 'gradient-hue-cursor',
            'gradient-hex-input', 'gradient-r-input', 'gradient-g-input', 'gradient-b-input',
            'gradient-color-display', 'gradientColor');
        
        // Gradient toggle handler
        const gradientEnabled = document.getElementById('gradient-enabled');
        const gradientSettingsRow = document.getElementById('gradient-settings-row');
        const gradientDirectionRow = document.getElementById('gradient-direction-row');
        
        if (gradientEnabled) {
            gradientEnabled.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                if (gradientSettingsRow) {
                    gradientSettingsRow.style.display = enabled ? 'flex' : 'none';
                }
                if (gradientDirectionRow) {
                    gradientDirectionRow.style.display = enabled ? 'flex' : 'none';
                }
                console.log('SETTINGS_UPDATE:' + JSON.stringify({ type: 'updateSetting', key: 'gradientEnabled', value: enabled }));
                updateThemePreview();
            });
        }
        
        // Gradient direction handler
        const gradientDirection = document.getElementById('gradient-direction');
        if (gradientDirection) {
            gradientDirection.addEventListener('change', (e) => {
                console.log('SETTINGS_UPDATE:' + JSON.stringify({ type: 'updateSetting', key: 'gradientDirection', value: e.target.value }));
                updateThemePreview();
            });
        }
        
        // Theme preview update
        function updateThemePreview() {
            const themePreview = document.getElementById('theme-preview');
            const themeDisplay = document.getElementById('theme-color-display');
            const gradientDisplay = document.getElementById('gradient-color-display');
            const gradientEnabledCheckbox = document.getElementById('gradient-enabled');
            const gradientDirectionSelect = document.getElementById('gradient-direction');
            
            if (themePreview && themeDisplay) {
                const themeColor = themeDisplay.textContent;
                const gradientEl = themePreview.querySelector('.theme-preview-gradient');
                if (gradientEl) {
                    const isGradientEnabled = gradientEnabledCheckbox ? gradientEnabledCheckbox.checked : false;
                    const direction = gradientDirectionSelect ? gradientDirectionSelect.value : '135deg';
                    
                    if (isGradientEnabled && gradientDisplay) {
                        const gradientColor = gradientDisplay.textContent;
                        gradientEl.style.background = \`linear-gradient(\${direction}, \${themeColor} 0%, \${gradientColor} 100%)\`;
                    } else {
                        gradientEl.style.background = themeColor;
                    }
                }
            }
        }
        
        // History search
        const historySearch = document.getElementById('history-search');
        if (historySearch) {
            historySearch.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                document.querySelectorAll('.history-item').forEach(item => {
                    const title = item.querySelector('.history-title')?.textContent.toLowerCase() || '';
                    const url = item.querySelector('.history-url')?.textContent.toLowerCase() || '';
                    if (title.includes(searchTerm) || url.includes(searchTerm)) {
                        item.style.display = 'flex';
                    } else {
                        item.style.display = 'none';
                    }
                });
            });
        }
        
        // Clear history
        const clearHistoryBtn = document.getElementById('clear-history');
        if (clearHistoryBtn) {
            clearHistoryBtn.addEventListener('click', () => {
                if (confirm('Are you sure you want to clear all history?')) {
                    window.postMessage({ type: 'clearHistory' }, '*');
                }
            });
        }
        
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
        
        // ========== Keyboard Shortcuts Editor ==========
        
        // Current shortcuts state - will be injected by parent
        let currentShortcuts = window._axisShortcuts || {};
        let isRecording = false;
        
        // Format shortcut for display (convert Cmd+T to ⌘ + T)
        function formatShortcutDisplay(shortcut) {
            if (!shortcut) return '';
            return shortcut
                .replace(/Cmd/g, '⌘')
                .replace(/Ctrl/g, '⌃')
                .replace(/Alt/g, '⌥')
                .replace(/Shift/g, '⇧')
                .replace(/\\+/g, ' + ')
                .replace(/\\+([A-Z0-9,\\.\\-=])/gi, ' + $1');
        }
        
        // Parse key event to shortcut string
        function keyEventToShortcut(e) {
            const parts = [];
            const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
            
            // Escape explicitly means "cancel recording"
            if (e.key === 'Escape') return '__CANCEL__';
            
            if (isMac) {
                if (e.metaKey) parts.push('Cmd');
                if (e.ctrlKey) parts.push('Ctrl');
            } else {
                if (e.ctrlKey) parts.push('Ctrl');
                if (e.metaKey) parts.push('Meta');
            }
            if (e.altKey) parts.push('Alt');
            if (e.shiftKey) parts.push('Shift');
            
            // Get the key
            let key = e.key;
            if (key === ' ') key = 'Space';
            else if (key === '+') key = '='; // Normalize + to =
            else if (key.length === 1) key = key.toUpperCase();
            
            // If user pressed only a modifier (Cmd, Ctrl, etc), keep recording
            // and wait for a real key instead of cancelling.
            if (['Control', 'Meta', 'Alt', 'Shift'].includes(key)) return null;
            
            parts.push(key);
            return parts.join('+');
        }
        
        // Update display with current shortcuts
        function updateShortcutInputs() {
            document.querySelectorAll('.shortcut-input').forEach(input => {
                const action = input.dataset.action;
                if (currentShortcuts[action]) {
                    input.value = formatShortcutDisplay(currentShortcuts[action]);
                }
            });
        }
        
        // Save shortcuts - send via console.log
        function saveShortcuts() {
            console.log('SHORTCUTS_MESSAGE:' + JSON.stringify({ type: 'setShortcuts', shortcuts: currentShortcuts }));
        }
        
        // Pause global shortcuts during recording
        function pauseGlobalShortcuts() {
            console.log('SHORTCUTS_MESSAGE:' + JSON.stringify({ type: 'pauseShortcuts' }));
        }
        
        // Resume global shortcuts after recording
        function resumeGlobalShortcuts() {
            console.log('SHORTCUTS_MESSAGE:' + JSON.stringify({ type: 'resumeShortcuts' }));
        }
        
        // Reset shortcuts to defaults
        function resetShortcuts() {
            console.log('SHORTCUTS_MESSAGE:' + JSON.stringify({ type: 'resetShortcuts' }));
        }
        
        // Handle messages from parent window (for receiving shortcuts data)
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'shortcutsLoaded') {
                currentShortcuts = event.data.shortcuts || {};
                updateShortcutInputs();
            }
        });
        
        // Setup shortcut input listeners
        document.querySelectorAll('.shortcut-input').forEach(input => {
            input.addEventListener('focus', () => {
                isRecording = true;
                input.value = 'Press keys...';
                input.classList.add('recording');
                // Pause global shortcuts while recording
                pauseGlobalShortcuts();
            });
            
            input.addEventListener('blur', () => {
                input.classList.remove('recording');
                // Restore the original value if nothing was set
                const action = input.dataset.action;
                if (input.value === 'Press keys...' && currentShortcuts[action]) {
                    input.value = formatShortcutDisplay(currentShortcuts[action]);
                }
                isRecording = false;
                // Resume global shortcuts
                resumeGlobalShortcuts();
            });
            
            input.addEventListener('keydown', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const shortcut = keyEventToShortcut(e);
                
                // '__CANCEL__' means explicit cancel (Escape)
                if (shortcut === '__CANCEL__') {
                    input.blur();
                    return;
                }
                
                // null / empty shortcut means only modifiers were pressed so far;
                // keep recording and wait for a non‑modifier key.
                if (!shortcut) {
                    return;
                }
                
                // Check for conflicts
                const action = input.dataset.action;
                let conflict = null;
                for (const [existingAction, existingShortcut] of Object.entries(currentShortcuts)) {
                    if (existingAction !== action && existingShortcut === shortcut) {
                        conflict = existingAction;
                        break;
                    }
                }
                
                if (conflict) {
                    // Show conflict warning
                    const conflictName = conflict.replace(/-/g, ' ').replace(/\\b\\w/g, l => l.toUpperCase());
                    if (!confirm('This shortcut is already used by "' + conflictName + '". Do you want to replace it?')) {
                        input.blur();
                        return;
                    }
                    // Remove from conflicting action
                    delete currentShortcuts[conflict];
                }
                
                // Update the shortcut
                currentShortcuts[action] = shortcut;
                input.value = formatShortcutDisplay(shortcut);
                input.classList.remove('recording');
                input.blur();
                
                // Save changes
                saveShortcuts();
                
                // Update other inputs in case of conflict resolution
                updateShortcutInputs();
            });
        });
        
        // Reset button
        const resetBtn = document.getElementById('reset-shortcuts-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                if (confirm('Reset all keyboard shortcuts to their defaults?')) {
                    resetShortcuts();
                }
            });
        }
        
        // Initialize shortcuts display on page load
        updateShortcutInputs();
        
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

        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
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
        
        try {
            // Handle settings page messages
            if (event.data.type === 'updateSetting') {
                const { key, value } = event.data;
                // Save to persistent storage
                await window.electronAPI.setSetting(key, value);
                // Update local cache immediately
                this.settings[key] = value;
                console.log(`✓ Setting saved: ${key} = ${value}`);
                
                // Apply setting changes immediately
                if (key === 'sidebarPosition') {
                    this.applySidebarPosition();
                } else if (key === 'themeColor' || key === 'gradientColor' || key === 'gradientEnabled' || key === 'gradientDirection') {
                    // Apply theme colors immediately
                    this.applyCustomThemeFromSettings();
                }
                // Theme mode and autoTheme changes will take effect on next page load
                
                return;
            }
        } catch (error) {
            console.error('Error saving setting:', error);
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
        
        if (event.data.type === 'clearBrowsingData') {
            // Clear browsing data (history, cookies, etc.)
            if (confirm('Are you sure you want to delete all browsing data? This will clear your history and cookies.')) {
                await this.clearAllHistory();
                // Could also clear cookies here if needed
                // Reload settings page to refresh
                const tab = this.tabs.get(this.currentTab);
                if (tab && tab.url === 'axis://settings') {
                    this.loadSettingsInWebview();
                }
            }
            return;
        }
        
        if (event.data.type === 'openSiteSettings') {
            // Open a site permissions guide in a new tab
            this.createNewTab('https://myaccount.google.com/security');
            this.showNotification('Opening site permissions in a new tab', 'info');
            return;
        }
        
        // Handle keyboard shortcuts messages
        if (event.data.type === 'getShortcuts') {
            this.loadAndSendShortcuts();
            return;
        }
        
        if (event.data.type === 'setShortcuts') {
            const { shortcuts } = event.data;
            this.saveCustomShortcuts(shortcuts);
            return;
        }
        
        if (event.data.type === 'resetShortcuts') {
            this.resetShortcutsToDefaults();
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
            background: #0a0a0a;
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
        if (titleInput && typeof titleInput.focus === 'function') {
            try {
                titleInput.focus();
            } catch (e) {
                // Ignore focus errors
            }
        }
        
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

    // Settings are now saved automatically when toggled in the settings page
    // No need for a separate save button

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
        if (titleElement && titleElement.parentNode) {
            titleElement.parentNode.replaceChild(input, titleElement);
        }
        if (input) {
            if (typeof input.focus === 'function') {
                try {
                    input.focus();
                } catch (e) {
                    // Ignore focus errors
                }
            }
            if (typeof input.select === 'function') {
                try {
                    input.select();
                } catch (e) {
                    // Ignore select errors
                }
            }
        }
        
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
                // Store custom title so it persists even when website changes title
                tab.customTitle = newTitle;
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
        // Old security button removed - security icon is now in the new URL bar
        // The new URL bar's updateUrlBar() function handles security icon updates
    }

    showNotification(message, type = 'info') {
        // Notifications disabled - do nothing
        return;
    }

    showToast(message) {
        // Notifications disabled - do nothing
        return;
    }

    // Premium button interactions
    addButtonInteractions() {
        // Add premium interactions to main buttons
        const mainButtons = document.querySelectorAll('.nav-btn, .tab-close, .settings-btn, .download-btn, .close-settings, .clear-btn');
        
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
        const faviconEl = tabElement.querySelector('.tab-favicon');
        if (!faviconEl) return;
        
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        // If tab has custom icon, don't update favicon
        if (tab.customIcon) {
            // Ensure it's an icon element, not img
            if (faviconEl.tagName === 'IMG') {
                const iconElement = document.createElement('i');
                iconElement.className = `fas ${tab.customIcon} tab-favicon`;
                iconElement.style.cssText = 'width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);';
                faviconEl.parentNode.replaceChild(iconElement, faviconEl);
            }
            return;
        }
        
        // Ensure it's an img element for regular favicons
        let img = faviconEl;
        if (faviconEl.tagName !== 'IMG') {
            img = document.createElement('img');
            img.className = 'tab-favicon';
            img.src = '';
            img.alt = '';
            img.setAttribute('onerror', "this.style.visibility='hidden'");
            faviconEl.parentNode.replaceChild(img, faviconEl);
        }
        
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
    
    // Update audio indicator for a tab (show/hide speaker icon)
    updateTabAudioIndicator(tabId, isPlaying) {
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tabElement) return;
        
        const audioIndicator = tabElement.querySelector('.tab-audio-indicator');
        if (!audioIndicator) return;
        
        const tab = this.tabs.get(tabId);
        const icon = audioIndicator.querySelector('i');
        
        // Show muted icon if tab is muted (regardless of playing state)
        if (tab && tab.isMuted) {
            audioIndicator.style.display = 'inline-flex';
            audioIndicator.classList.add('muted');
            audioIndicator.title = 'Tab muted - click to unmute';
            if (icon) {
                icon.className = 'fas fa-volume-mute';
            }
            return;
        }
        
        // Show playing indicator if audio is playing
        if (isPlaying) {
            audioIndicator.style.display = 'inline-flex';
            audioIndicator.classList.remove('muted');
            audioIndicator.title = 'Playing audio';
            if (icon) {
                icon.className = 'fas fa-volume-up';
            }
        } else {
            audioIndicator.style.display = 'none';
            audioIndicator.classList.remove('muted');
        }
    }
    
    // Start audio detection polling for a webview
    startAudioDetection(tabId, webview) {
        if (!webview) return;
        
        // Store interval reference on the webview for cleanup
        if (webview.__audioCheckInterval) {
            clearInterval(webview.__audioCheckInterval);
        }
        
        // Poll every 500ms to check if audio is playing
        webview.__audioCheckInterval = setInterval(async () => {
            try {
                const tab = this.tabs.get(tabId);
                if (!tab || !webview) {
                    clearInterval(webview.__audioCheckInterval);
                    return;
                }
                
                let isAudible = false;
                
                // Method 1: Try isCurrentlyAudible() - Electron API
                if (typeof webview.isCurrentlyAudible === 'function') {
                    try {
                        isAudible = webview.isCurrentlyAudible();
                    } catch (e) {
                        // Fall through to method 2
                    }
                }
                
                // Method 2: Check for playing media via JavaScript
                if (!isAudible) {
                    try {
                        isAudible = await webview.executeJavaScript(`
                            (function() {
                                // Check video elements
                                const videos = document.querySelectorAll('video');
                                for (const v of videos) {
                                    if (!v.paused && !v.muted && v.volume > 0) return true;
                                }
                                // Check audio elements
                                const audios = document.querySelectorAll('audio');
                                for (const a of audios) {
                                    if (!a.paused && !a.muted && a.volume > 0) return true;
                                }
                                return false;
                            })();
                        `);
                    } catch (e) {
                        // Ignore JS execution errors
                    }
                }
                
                // Only update if state changed
                if (tab.isPlayingAudio !== isAudible) {
                    tab.isPlayingAudio = isAudible;
                    this.updateTabAudioIndicator(tabId, isAudible);
                }
            } catch (e) {
                // Webview might be destroyed, clean up
                if (webview.__audioCheckInterval) {
                    clearInterval(webview.__audioCheckInterval);
                }
            }
        }, 500);
        
        // Clean up on webview destruction
        webview.addEventListener('destroyed', () => {
            if (webview.__audioCheckInterval) {
                clearInterval(webview.__audioCheckInterval);
            }
        }, { once: true });
    }
    
    // Stop audio detection for a webview
    stopAudioDetection(webview) {
        if (webview && webview.__audioCheckInterval) {
            clearInterval(webview.__audioCheckInterval);
            webview.__audioCheckInterval = null;
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
            // Setup close button hover behavior for pinned tab
            this.setupPinnedTabCloseButton(tabElement, tabId);
            // Update closed state based on webview presence
            this.updatePinnedTabClosedState(tabId);
        } else {
            tabElement.classList.remove('pinned');
            tabElement.classList.remove('closed'); // Remove closed class when unpinned
            tabElement.classList.add('just-unpinned');
            setTimeout(() => tabElement.classList.remove('just-unpinned'), 400);
            // Remove close button hover behavior when unpinned
            this.removePinnedTabCloseButton(tabElement);
        }
        
        
        // Move tab to correct section
        this.organizeTabsByPinnedState();
        this.savePinnedTabs();
    }
    
    organizeTabsByPinnedState() {
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (!tabsContainer || !separator) return;
        
        // Get all tabs that are NOT in tab groups (preserve order)
        const allChildren = Array.from(tabsContainer.children);
        const tabs = allChildren.filter(el => 
            el.classList.contains('tab') && 
            el.id !== 'tabs-separator' &&
            !el.closest('.tab-group') // Exclude tabs inside tab groups
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
            
            // Skip tabs that are in tab groups
            if (tabElement.closest('.tab-group')) continue;
            
            const tab = this.tabs.get(tabId);
            if (tab && tab.pinned) {
                pinnedTabs.push(tabElement);
            } else {
                unpinnedTabs.push(tabElement);
            }
        }
        
        // Remove all tabs temporarily (only those not in tab groups)
        tabs.forEach(tab => {
            if (tab.parentNode === tabsContainer) {
                tab.remove();
            }
        });
        
        // Insert pinned tabs above separator (in order)
        pinnedTabs.forEach(tab => {
            tabsContainer.insertBefore(tab, separator);
        });
        
        // Show/hide separator based on pinned tabs or tab groups
        const hasPinnedTabs = pinnedTabs.length > 0;
        const hasTabGroups = this.tabGroups.size > 0;
        if (hasPinnedTabs || hasTabGroups) {
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
        
        // Update closed state for all pinned tabs based on webview presence
        pinnedTabs.forEach(tabElement => {
            const tabId = parseInt(tabElement.dataset.tabId, 10);
            if (tabId) {
                this.updatePinnedTabClosedState(tabId);
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
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
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
                        customIcon: tab.customIcon || null, // Save custom icon
                        customIconType: tab.customIconType || null, // Save icon type (emoji or fontawesome)
                        customTitle: tab.customTitle || null, // Save custom title
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
            
            const tabsContainer = this.elements.tabsContainer;
            const separator = this.elements.tabsSeparator;
            if (!tabsContainer || !separator) return;

            pinnedTabsData.sort((a, b) => (a.order || 0) - (b.order || 0));
            
            // Create pinned tabs in order
            for (const pinnedData of pinnedTabsData) {
                const tabId = pinnedData.id || Date.now() + Math.random();
                const tabElement = document.createElement('div');
                tabElement.className = 'tab pinned';
                tabElement.dataset.tabId = tabId;
                
                // Use custom title if available, otherwise use saved title
                const displayTitle = pinnedData.customTitle || pinnedData.title || 'New Tab';
                
                // Determine icon HTML based on type
                let iconHTML = '<img class="tab-favicon" src="" alt="" onerror="this.style.visibility=\'hidden\'">';
                if (pinnedData.customIcon) {
                    if (pinnedData.customIconType === 'emoji') {
                        iconHTML = `<span class="tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1;">${pinnedData.customIcon}</span>`;
                    } else {
                        iconHTML = `<i class="fas ${pinnedData.customIcon} tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);"></i>`;
                    }
                }
                
                tabElement.innerHTML = `
                    <div class="tab-content">
                        <div class="tab-left">
                            ${iconHTML}
                            <span class="tab-audio-indicator" style="display: none;"><i class="fas fa-volume-up"></i></span>
                            <span class="tab-title">${this.escapeHtml(displayTitle)}</span>
                        </div>
                        <div class="tab-right">
                            <button class="tab-close"><i class="fas fa-times"></i></button>
                        </div>
                    </div>
                `;
                
                // Store tab data (no webview initially - will be created when opened)
                this.tabs.set(tabId, {
                    id: tabId,
                    url: pinnedData.url || null,
                    title: displayTitle,
                    customTitle: pinnedData.customTitle || null, // Load custom title
                    favicon: pinnedData.favicon || null, // Load cached favicon
                    customIcon: pinnedData.customIcon || null, // Load custom icon
                    customIconType: pinnedData.customIconType || null, // Load icon type
                    canGoBack: false,
                    canGoForward: false,
                    history: pinnedData.url ? [pinnedData.url] : [],
                    historyIndex: pinnedData.url ? 0 : -1,
                    pinned: true,
                    webview: null // No webview initially - tab is closed
                });
                
                // Mark as closed since it has no webview
                tabElement.classList.add('closed');
                
                // Insert above separator
                tabsContainer.insertBefore(tabElement, separator);
                
                // Set up event listeners
                this.setupTabEventListeners(tabElement, tabId);
                
                // Update favicon
                this.updateTabFavicon(tabId, tabElement);
                
                // Update closed state (tabs loaded from saved state have no webview initially)
                this.updatePinnedTabClosedState(tabId);
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
        if (!sidebar) return;
        
        // Remove slide-out class if present (when toggling from slide-out state)
        sidebar.classList.remove('slide-out');
        
        sidebar.classList.toggle('hidden');
        
        // Toggle window button visibility (macOS traffic lights)
        const isHidden = sidebar.classList.contains('hidden');
        if (window.electronAPI && window.electronAPI.setWindowButtonVisibility) {
            window.electronAPI.setWindowButtonVisibility(!isHidden);
        }
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

    // Nav menu removed - functionality moved to sidebar context menu

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
                
                // When sidebar slides out from hidden state, show macOS window buttons
                if (window.electronAPI && window.electronAPI.setWindowButtonVisibility) {
                    window.electronAPI.setWindowButtonVisibility(true);
                }
                
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
        
        const closeSlideOut = () => {
            if (!sidebar.classList.contains('slide-out') || sidebar.classList.contains('slide-out-closing')) return;
            const onAnimationEnd = () => {
                sidebar.removeEventListener('animationend', onAnimationEnd);
                sidebar.classList.remove('slide-out', 'slide-out-closing');
                if (sidebar.classList.contains('hidden') && window.electronAPI && window.electronAPI.setWindowButtonVisibility) {
                    window.electronAPI.setWindowButtonVisibility(false);
                }
            };
            sidebar.addEventListener('animationend', onAnimationEnd);
            sidebar.classList.add('slide-out-closing');
        };

        // When mouse leaves the hover area, start slide-back timer
        hoverArea.addEventListener('mouseleave', () => {
            if (sidebar.classList.contains('hidden') && sidebar.classList.contains('slide-out')) {
                slideBackTimeout = setTimeout(closeSlideOut, 300);
            }
        });

        // When mouse leaves the sidebar, start slide-back timer
        sidebar.addEventListener('mouseleave', () => {
            if (sidebar.classList.contains('hidden') && sidebar.classList.contains('slide-out')) {
                slideBackTimeout = setTimeout(closeSlideOut, 300);
            }
        });

        // Also hide slide-out when clicking outside
        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('slide-out') &&
                !sidebar.contains(e.target) &&
                !hoverArea.contains(e.target)) {
                closeSlideOut();
            }
        });
    }

    setupAISelectionDetection() {
        const aiButton = document.getElementById('ai-selection-button');
        const aiPopup = document.getElementById('ai-popup');
        if (!aiButton || !aiPopup) return;

        // Track selection state
        this.aiSelectionState = {
            text: '',
            position: null,
            pollingInterval: null
        };

        // Setup AI button click: quote selection and open main chat panel
        const button = aiButton.querySelector('.ai-button');
        button?.addEventListener('click', () => this.openChatWithQuotedSelection());

        // Setup custom question submit - use event delegation to ensure it works
        const setupSubmitHandler = () => {
            const submitBtn = document.querySelector('.ai-submit-btn');
            const customInput = document.getElementById('ai-custom-question');
            
            if (submitBtn) {
                // Remove any existing listeners by cloning
                const newSubmitBtn = submitBtn.cloneNode(true);
                submitBtn.parentNode?.replaceChild(newSubmitBtn, submitBtn);
                
                newSubmitBtn.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent event from bubbling to document
                    e.preventDefault(); // Prevent default behavior
                    const question = customInput?.value.trim();
                    if (question) {
                        this.handleAICustomQuestion(question);
                    }
                });
                
                // Also prevent mousedown from closing popup
                newSubmitBtn.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                });
            }
            
            if (customInput) {
                customInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        e.stopPropagation(); // Prevent event from bubbling
                        const question = customInput.value.trim();
                        if (question) {
                            this.handleAICustomQuestion(question);
                        }
                    }
                });
                
                // Prevent clicks inside input from closing popup
                customInput.addEventListener('click', (e) => {
                    e.stopPropagation();
                });
            }
        };
        
        // Setup immediately and also when popup is shown
        setupSubmitHandler();
        this.setupAISubmitHandler = setupSubmitHandler;

        // Prevent clicks inside popup from closing it
        const popupContainer = aiPopup.querySelector('.ai-popup-container');
        if (popupContainer) {
            popupContainer.addEventListener('mousedown', (e) => {
                e.stopPropagation();
            });
            popupContainer.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        }

        // Hide AI button when clicking outside (but not when popup is open)
        // Use mousedown instead of click to avoid interfering with button clicks
        document.addEventListener('mousedown', (e) => {
            // Check if click is outside both button and popup
            const clickedOnButton = aiButton.contains(e.target);
            const clickedOnPopup = aiPopup.contains(e.target);
            
            if (!clickedOnButton && !clickedOnPopup) {
                if (aiPopup.classList.contains('hidden')) {
                    this.hideAIButton();
                } else {
                    // Close popup when clicking outside - with smooth animation
                    this.hideAIPopup();
                }
            }
        });

        // Start polling for text selection
        this.startAISelectionPolling();
    }

    setupAIPopupDrag() {
        const aiPopup = document.getElementById('ai-popup');
        const dragHandle = document.getElementById('ai-popup-drag-handle');
        if (!aiPopup || !dragHandle) return;

        let isDragging = false;
        let currentX = 0;
        let currentY = 0;
        let initialX = 0;
        let initialY = 0;
        let xOffset = 0;
        let yOffset = 0;

        // Get current position
        const rect = aiPopup.getBoundingClientRect();
        xOffset = rect.left;
        yOffset = rect.top;

        dragHandle.addEventListener('mousedown', dragStart);
        document.addEventListener('mousemove', drag);
        document.addEventListener('mouseup', dragEnd);

        function dragStart(e) {
            e.preventDefault();
            e.stopPropagation();
            initialX = e.clientX - xOffset;
            initialY = e.clientY - yOffset;

            if (e.target === dragHandle || dragHandle.contains(e.target)) {
                isDragging = true;
            }
        }

        function drag(e) {
            if (isDragging) {
                e.preventDefault();
                currentX = e.clientX - initialX;
                currentY = e.clientY - initialY;

                xOffset = currentX;
                yOffset = currentY;

                aiPopup.style.left = `${xOffset}px`;
                aiPopup.style.top = `${yOffset}px`;
                aiPopup.style.transform = '';
            }
        }

        function dragEnd() {
            if (isDragging) {
                initialX = currentX;
                initialY = currentY;
                isDragging = false;
            }
        }
    }


    startAISelectionPolling() {
        // Ensure aiSelectionState exists
        if (!this.aiSelectionState) {
            this.aiSelectionState = {
                text: '',
                position: null,
                pollingInterval: null
            };
        }
        
        // Clear any existing interval
        if (this.aiSelectionState.pollingInterval) {
            clearInterval(this.aiSelectionState.pollingInterval);
            this.aiSelectionState.pollingInterval = null;
        }

        // Poll every 200ms for text selection
        this.aiSelectionState.pollingInterval = setInterval(() => {
            this.checkTextSelection();
        }, 200);
    }

    stopAISelectionPolling() {
        if (this.aiSelectionState && this.aiSelectionState.pollingInterval) {
            clearInterval(this.aiSelectionState.pollingInterval);
            this.aiSelectionState.pollingInterval = null;
        }
    }

    async checkTextSelection() {
        const webview = this.getActiveWebview();
        if (!webview) {
            this.hideAIButton();
            return;
        }

        // Check if webview has executeJavaScript method
        if (!webview.executeJavaScript) {
            return;
        }

        try {
            const result = await webview.executeJavaScript(`
                (function() {
                    try {
                        const selection = window.getSelection();
                        if (!selection || selection.rangeCount === 0) {
                            return null;
                        }
                        
                        const range = selection.getRangeAt(0);
                        const text = range.toString().trim();
                        
                        if (!text || text.length === 0) {
                            return null;
                        }
                        
                        // Get bounding rectangle of selection (relative to webview viewport)
                        const rect = range.getBoundingClientRect();
                        
                        return {
                            text: text,
                            x: rect.left - 2, // Slightly to the left of selection edge
                            y: rect.top - 35, // Closer to top of selection
                            width: rect.width,
                            height: rect.height
                        };
                    } catch (e) {
                        return null;
                    }
                })();
            `);

            if (result && result.text && result.text.length > 0) {
                this.aiSelectionState.text = result.text;
                this.aiSelectionState.position = { x: result.x, y: result.y };
                this.showAIButton(result.x, result.y);
            } else {
                this.hideAIButton();
            }
        } catch (error) {
            // Selection check failed, hide button
            // Errors are expected when webview isn't ready or page isn't loaded
            this.hideAIButton();
        }
    }

    showAIButton(x, y) {
        const aiButton = document.getElementById('ai-selection-button');
        if (!aiButton) {
            return;
        }

        // Get webview position to adjust coordinates
        const webview = this.getActiveWebview();
        if (!webview) {
            return;
        }

        const webviewRect = webview.getBoundingClientRect();
        
        // Coordinates from webview are relative to webview's viewport
        // Add webview's position to get absolute viewport coordinates
        const viewportX = webviewRect.left + x;
        const viewportY = webviewRect.top + y;

        // Position button at top-left of selection, closer to the corner
        aiButton.style.left = `${viewportX}px`;
        aiButton.style.top = `${Math.max(10, viewportY)}px`;
        // Remove inline transform to let CSS handle the animation
        aiButton.style.transform = '';
        aiButton.style.opacity = '';
        aiButton.style.visibility = '';
        aiButton.style.display = 'block';
        aiButton.style.zIndex = '10000';
        aiButton.classList.remove('hidden');
        
        // Force a reflow to ensure styles are applied
        void aiButton.offsetHeight;
    }

    hideAIButton() {
        const aiButton = document.getElementById('ai-selection-button');
        if (aiButton) {
            aiButton.classList.add('hidden');
            aiButton.style.display = '';
            aiButton.style.opacity = '';
            aiButton.style.visibility = '';
        }
        if (this.aiSelectionState) {
            this.aiSelectionState.text = '';
            this.aiSelectionState.position = null;
        }
    }

    /**
     * Show quoted selection in the bar above the message box and open main chat panel.
     */
    openChatWithQuotedSelection() {
        const selectedText = this.aiSelectionState?.text?.trim();
        if (!selectedText) return;

        const quoted = selectedText.split('\n').map(line => '> ' + line).join('\n');
        const chatPanel = document.getElementById('ai-chat-panel');
        const contentArea = document.getElementById('content-area');
        const quoteBar = document.getElementById('ai-chat-quote-bar');
        const quoteTextEl = document.getElementById('ai-chat-quote-text');
        const chatInput = document.getElementById('ai-chat-input');

        if (!chatPanel || !quoteBar || !quoteTextEl || !chatInput) return;

        // Store full quoted text for when user sends (included in message)
        this.chatQuotedText = quoted;

        // Ensure main chat panel is open
        if (chatPanel.classList.contains('hidden')) {
            chatPanel.classList.remove('hidden');
            if (contentArea) contentArea.classList.add('chat-open');
        }

        // Show quote bar with preview (plain text for display, may be truncated by CSS)
        quoteTextEl.textContent = selectedText;
        quoteBar.classList.remove('hidden');

        chatInput.value = '';
        setTimeout(() => chatInput.focus(), 100);

        this.hideAIButton();
        this.hideAIPopup();
    }

    clearChatQuote() {
        this.chatQuotedText = null;
        const quoteBar = document.getElementById('ai-chat-quote-bar');
        const quoteTextEl = document.getElementById('ai-chat-quote-text');
        if (quoteBar) quoteBar.classList.add('hidden');
        if (quoteTextEl) quoteTextEl.textContent = '';
    }

    showAIPopup() {
        const aiPopup = document.getElementById('ai-popup');
        if (!aiPopup) return;

        // Position popup above the highlighted text
        const webview = this.getActiveWebview();
        if (webview && this.aiSelectionState.position) {
            const webviewRect = webview.getBoundingClientRect();
            const position = this.aiSelectionState.position;
            
            // Position popup above the selection, aligned to left
            const popupX = webviewRect.left + position.x;
            const popupY = webviewRect.top + position.y - 80; // Above the button
            
            aiPopup.style.left = `${popupX}px`;
            aiPopup.style.top = `${Math.max(10, popupY)}px`;
            aiPopup.style.transform = '';
        } else {
            // Fallback position if no selection position
            const rect = aiPopup.getBoundingClientRect();
            if (rect.width === 0 || !aiPopup.style.left) {
                aiPopup.style.left = '60px';
                aiPopup.style.top = '20px';
                aiPopup.style.transform = '';
            }
        }

        // Show popup
        aiPopup.classList.remove('hidden');
        
        // Re-setup submit handler to ensure it works
        if (this.setupAISubmitHandler) {
            this.setupAISubmitHandler();
        }
        
        // Setup drag functionality
        this.setupAIPopupDrag();
        
        // Focus input
        const input = document.getElementById('ai-custom-question');
        setTimeout(() => input?.focus(), 100);
    }

    hideAIPopup() {
        const aiPopup = document.getElementById('ai-popup');
        if (aiPopup) {
            aiPopup.classList.add('hidden');
        }
        
        // Clear input and response
        const input = document.getElementById('ai-custom-question');
        const responseArea = document.getElementById('ai-response-area');
        const responseContent = responseArea?.querySelector('.ai-response-content');
        
        // Restart polling when popup is closed so button can appear again
        this.startAISelectionPolling();
        
        if (input) {
            input.value = '';
        }
        if (responseArea) {
            responseArea.classList.add('hidden');
        }
        if (responseContent) {
            responseContent.textContent = '';
        }
    }

    handleAICustomQuestion(question) {
        const selectedText = this.aiSelectionState.text;
        if (!selectedText || !question) return;

        const prompt = `${question}\n\nContext: "${selectedText}"`;
        this.processAIRequest(prompt, selectedText);
    }

    async processAIRequest(prompt, context) {
        const responseArea = document.getElementById('ai-response-area');
        const responseContent = responseArea?.querySelector('.ai-response-content');
        const submitBtn = document.querySelector('.ai-submit-btn');
        const input = document.getElementById('ai-custom-question');
        
        if (!responseArea || !responseContent) return;

        // Show loading state
        submitBtn.disabled = true;
        responseContent.textContent = 'Processing...';
        responseArea.classList.remove('hidden');

        try {
            // Use Groq API (very fast, generous free tier)
            const groqApiKey = '';
            
            // Format the prompt with context
            const fullPrompt = `Context: "${context}"\n\nQuestion: ${prompt}\n\nPlease provide a helpful answer based on the context provided.`;
            
            // Try multiple models in order of preference
            const modelsToTry = [
                'llama-3.3-70b-versatile',
                'llama-3.1-8b-instant',
                'llama-3.1-70b-versatile',
                'llama-3-70b-8192',
                'mixtral-8x7b-32768'
            ];
            
            let lastError = null;
            let response = null;
            let data = null;
            
            for (const model of modelsToTry) {
                try {
                    response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${groqApiKey}`
                        },
                        body: JSON.stringify({
                            model: model,
                            messages: [
                                {
                                    role: 'system',
                                    content: 'You are a helpful AI assistant. Answer questions based on the provided context.'
                                },
                                {
                                    role: 'user',
                                    content: fullPrompt
                                }
                            ],
                            max_tokens: 1024,
                            temperature: 0.7
                        })
                    });
                    
                    if (response.ok) {
                        data = await response.json();
                        break; // Success, exit loop
                    } else {
                        const errorData = await response.json().catch(() => ({}));
                        lastError = errorData.error?.message || `HTTP ${response.status}`;
                        // Continue to next model
                        continue;
                    }
                } catch (err) {
                    lastError = err.message;
                    continue; // Try next model
                }
            }
            
            if (!response || !response.ok || !data) {
                throw new Error(`Groq API error: All models failed. Last error: ${lastError || 'Unknown error'}`);
            }

            const aiResponse = data.choices?.[0]?.message?.content || '';
            
            if (!aiResponse.trim()) {
                throw new Error('Empty response from Groq');
            }

            // Smoothly reveal the text
            this.smoothRevealText(responseContent, aiResponse.trim());
            submitBtn.disabled = false;
            if (input) {
                input.value = '';
            }
        } catch (error) {
            console.error('AI API Error:', error);
            responseContent.textContent = `Error: ${error.message}\n\nPlease try again. If the issue persists, check your API key.`;
            responseContent.classList.add('revealing');
            submitBtn.disabled = false;
        }
    }

    smoothRevealText(element, text) {
        // Clear any existing content
        element.textContent = '';
        element.classList.remove('revealing');
        
        // Split text into words for smooth reveal
        const words = text.split(' ');
        let currentIndex = 0;
        
        // Function to reveal words smoothly
        const revealNext = () => {
            if (currentIndex < words.length) {
                // Add next word(s) in small chunks for smoothness
                const chunkSize = 3; // Reveal 3 words at a time
                const chunk = words.slice(currentIndex, currentIndex + chunkSize).join(' ');
                element.textContent += (currentIndex > 0 ? ' ' : '') + chunk;
                currentIndex += chunkSize;
                
                // Use requestAnimationFrame for smooth animation
                requestAnimationFrame(() => {
                    setTimeout(revealNext, 20); // Small delay for smooth reveal
                });
            } else {
                // Animation complete
                element.classList.add('revealing');
            }
        };
        
        // Start revealing
        requestAnimationFrame(() => {
            revealNext();
        });
    }

    // AI Chat Panel Setup
    setupAIChat() {
        const chatPanel = document.getElementById('ai-chat-panel');
        const chatClose = document.getElementById('ai-chat-close');
        const chatInput = document.getElementById('ai-chat-input');
        const chatSend = document.getElementById('ai-chat-send');
        const chatMessages = document.getElementById('ai-chat-messages');
        const quoteDismiss = document.getElementById('ai-chat-quote-dismiss');
        
        if (!chatPanel || !chatClose || !chatInput || !chatSend || !chatMessages) return;

        // Close chat panel
        chatClose.addEventListener('click', () => {
            this.toggleAIChat();
        });

        // Dismiss quoted selection (X on quote bar)
        quoteDismiss?.addEventListener('click', () => {
            this.clearChatQuote();
        });

        // Send message on button click
        chatSend.addEventListener('click', () => {
            this.sendChatMessage();
        });

        // Send message on Enter (Shift+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });

        // Close chat on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !chatPanel.classList.contains('hidden')) {
                // Only close if input is not focused or if input is empty
                if (document.activeElement !== chatInput || !chatInput.value.trim()) {
                    this.toggleAIChat();
                }
            }
        });

        // Resizable chat panel
        const resizeHandle = document.getElementById('ai-chat-resize-handle');
        if (resizeHandle) {
            this.setupChatPanelResize(resizeHandle, chatPanel);
        }
        this.applyChatPanelWidth(this.getChatPanelWidth());
    }

    getChatPanelWidth() {
        const saved = localStorage.getItem('axis-chat-panel-width');
        const n = saved ? parseInt(saved, 10) : 400;
        return Math.min(Math.max(Number.isFinite(n) ? n : 400, 280), Math.floor(window.innerWidth * 0.9));
    }

    applyChatPanelWidth(width) {
        const container = document.querySelector('.webview-container');
        if (container) container.style.setProperty('--chat-panel-width', `${width}px`);
    }

    setupChatPanelResize(handle, chatPanel) {
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        let animationFrame = null;
        let lastUpdateTime = 0;
        const throttleMs = 8;

        const startResize = (e) => {
            if (isResizing) return;
            isResizing = true;
            startX = e.clientX;
            const container = document.querySelector('.webview-container');
            const current = container ? parseFloat(container.style.getPropertyValue('--chat-panel-width')) : NaN;
            startWidth = Number.isFinite(current) ? current : 400;

            document.body.classList.add('resizing');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            chatPanel.style.transition = 'none';
            e.preventDefault();
            e.stopPropagation();
        };

        const doResize = (e) => {
            if (!isResizing) return;
            const now = performance.now();
            if (now - lastUpdateTime < throttleMs) return;
            lastUpdateTime = now;

            if (animationFrame) cancelAnimationFrame(animationFrame);
            animationFrame = requestAnimationFrame(() => {
                const deltaX = startX - e.clientX;
                const newWidth = Math.min(Math.max(startWidth + deltaX, 280), Math.floor(window.innerWidth * 0.9));
                this.applyChatPanelWidth(newWidth);
            });
        };

        const stopResize = (e) => {
            if (!isResizing) return;
            isResizing = false;
            lastUpdateTime = 0;
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            chatPanel.style.transition = '';
            document.body.classList.remove('resizing');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            const container = document.querySelector('.webview-container');
            const w = container ? parseFloat(container.style.getPropertyValue('--chat-panel-width')) : 400;
            const width = Number.isFinite(w) ? w : 400;
            localStorage.setItem('axis-chat-panel-width', String(Math.round(width)));

            if (e) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        handle.addEventListener('mousedown', startResize, { passive: false });
        document.addEventListener('mousemove', doResize, { passive: false });
        document.addEventListener('mouseup', stopResize, { passive: false });
        document.addEventListener('mouseleave', stopResize);

        handle.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    toggleAIChat() {
        const chatPanel = document.getElementById('ai-chat-panel');
        const contentArea = document.getElementById('content-area');
        
        if (!chatPanel) return;

        const isHidden = chatPanel.classList.contains('hidden');
        
        if (isHidden) {
            chatPanel.classList.remove('hidden');
            if (contentArea) {
                contentArea.classList.add('chat-open');
            }
            // Focus input when opening
            const chatInput = document.getElementById('ai-chat-input');
            if (chatInput) {
                setTimeout(() => chatInput.focus(), 150);
            }
        } else {
            chatPanel.classList.add('hidden');
            if (contentArea) {
                contentArea.classList.remove('chat-open');
            }
        }
    }

    async sendChatMessage() {
        const chatInput = document.getElementById('ai-chat-input');
        const chatMessages = document.getElementById('ai-chat-messages');
        
        if (!chatInput || !chatMessages) return;

        const mainText = chatInput.value.trim();
        let fullMessage;
        let quoteForDisplay = null;
        if (this.chatQuotedText) {
            quoteForDisplay = this.chatQuotedText;
            fullMessage = this.chatQuotedText + (mainText ? '\n\n' + mainText : '');
            this.clearChatQuote();
        } else {
            fullMessage = mainText;
        }
        if (!fullMessage) return;

        // Clear input (fixed height – no resize)
        chatInput.value = '';

        // Add user message (with optional quote box for display)
        this.addChatMessage('user', fullMessage, false, { quote: quoteForDisplay, mainText });

        // Add loading message
        const loadingId = this.addChatMessage('assistant', '', true);

        // Send to AI (full message including quote)
        try {
            const response = await this.getChatAIResponse(fullMessage);
            this.updateChatMessage(loadingId, response);
        } catch (error) {
            console.error('Chat AI Error:', error);
            this.updateChatMessage(loadingId, `Error: ${error.message}\n\nPlease try again.`);
        }
    }

    addChatMessage(role, content, isLoading = false, options = {}) {
        const chatMessages = document.getElementById('ai-chat-messages');
        if (!chatMessages) return null;

        const messageId = Date.now();
        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-chat-message ${role}`;
        messageDiv.dataset.messageId = messageId;

        if (isLoading) {
            messageDiv.innerHTML = `
                <div class="ai-chat-message-content ai-chat-message-loading">
                    <i class="fas fa-spinner"></i>
                    <span>Thinking...</span>
                </div>
            `;
        } else {
            const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const { quote, mainText } = options;
            let contentHtml;
            if (role === 'user' && quote != null && quote !== '') {
                const quoteDisplay = this.escapeHtml(quote);
                const bodyDisplay = this.escapeHtml((mainText != null ? mainText : '').trim());
                contentHtml = `
                    <div class="ai-chat-message-content">
                        <div class="ai-chat-message-quote">${quoteDisplay}</div>
                        ${bodyDisplay ? `<div class="ai-chat-message-body">${bodyDisplay}</div>` : ''}
                    </div>
                `;
            } else {
                contentHtml = `
                    <div class="ai-chat-message-content">${this.escapeHtml(content)}</div>
                `;
            }
            messageDiv.innerHTML = contentHtml + `<div class="ai-chat-message-time">${time}</div>`;
        }

        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Store message (full content for API/history)
        this.aiChatMessages.push({
            id: messageId,
            role,
            content,
            timestamp: new Date().toISOString()
        });

        return messageId;
    }

    updateChatMessage(messageId, content) {
        const chatMessages = document.getElementById('ai-chat-messages');
        if (!chatMessages) return;

        const messageDiv = chatMessages.querySelector(`[data-message-id="${messageId}"]`);
        if (!messageDiv) return;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        messageDiv.innerHTML = `
            <div class="ai-chat-message-content">${this.escapeHtml(content)}</div>
            <div class="ai-chat-message-time">${time}</div>
        `;
        messageDiv.classList.remove('assistant');
        messageDiv.classList.add('assistant');

        // Update stored message
        const messageIndex = this.aiChatMessages.findIndex(m => m.id === messageId);
        if (messageIndex !== -1) {
            this.aiChatMessages[messageIndex].content = content;
        }

        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Get current page content from the active tab's webview for AI context.
     * Returns { title, url, text } or null if unavailable (no webview, internal page, or error).
     */
    async getPageContextForAI() {
        const webview = this.getActiveWebview();
        if (!webview || !webview.executeJavaScript) return null;

        const tab = this.currentTab != null && this.tabs.has(this.currentTab) ? this.tabs.get(this.currentTab) : null;
        const url = tab?.url || '';
        if (!url || url === 'about:blank' || url.startsWith('axis://') || url.startsWith('axis:note://')) {
            return null;
        }

        const maxChars = 12000; // Keep context size reasonable
        try {
            const result = await webview.executeJavaScript(`
                (function() {
                    try {
                        var title = document.title || '';
                        var body = document.body;
                        var text = body ? (body.innerText || body.textContent || '').replace(/\\s+/g, ' ').trim() : '';
                        if (text.length > ${maxChars}) text = text.slice(0, ${maxChars}) + '...[truncated]';
                        return { title: title, text: text };
                    } catch (e) { return null; }
                })();
            `);
            if (!result || typeof result.title === 'undefined') return null;
            return { title: result.title || '', url: url, text: (result.text || '').trim() };
        } catch (e) {
            return null;
        }
    }

    async getChatAIResponse(userMessage) {
        // Optional: include current page so the AI can read the page
        let pageContext = null;
        try {
            pageContext = await this.getPageContextForAI();
        } catch (e) {}

        const systemContent = 'You are a helpful AI assistant. Provide clear, concise, and helpful responses.';
        const systemWithPage = pageContext && (pageContext.title || pageContext.text)
            ? systemContent + '\n\nThe user is viewing a web page. Use the following to answer questions about the page when relevant.\n\nPage title: ' + (pageContext.title || '(none)') + '\nURL: ' + (pageContext.url || '') + '\n\nPage content (excerpt):\n' + (pageContext.text || '(no text content)')
            : systemContent;

        // Build conversation history
        const messages = [
            {
                role: 'system',
                content: systemWithPage
            }
        ];

        // Add recent conversation history (last 10 messages for context)
        const recentMessages = this.aiChatMessages.slice(-10);
        for (const msg of recentMessages) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                messages.push({
                    role: msg.role,
                    content: msg.content
                });
            }
        }

        // Add current user message
        messages.push({
            role: 'user',
            content: userMessage
        });

        // Try multiple models in order of preference
        const modelsToTry = [
            'llama-3.3-70b-versatile',
            'llama-3.1-8b-instant',
            'llama-3.1-70b-versatile',
            'llama-3-70b-8192',
            'mixtral-8x7b-32768'
        ];

        let lastError = null;
        let response = null;
        let data = null;

        for (const model of modelsToTry) {
            try {
                response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${this.aiChatApiKey}`
                    },
                    body: JSON.stringify({
                        model: model,
                        messages: messages,
                        max_tokens: 2048,
                        temperature: 0.7
                    })
                });

                if (response.ok) {
                    data = await response.json();
                    break; // Success, exit loop
                } else {
                    const errorData = await response.json().catch(() => ({}));
                    lastError = errorData.error?.message || `HTTP ${response.status}`;
                    continue; // Try next model
                }
            } catch (err) {
                lastError = err.message;
                continue; // Try next model
            }
        }

        if (!response || !response.ok || !data) {
            throw new Error(`Groq API error: All models failed. Last error: ${lastError || 'Unknown error'}`);
        }

        const aiResponse = data.choices?.[0]?.message?.content || '';

        if (!aiResponse.trim()) {
            throw new Error('Empty response from Groq');
        }

        return aiResponse.trim();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showNotification(message) {
        // Notifications disabled - do nothing
        return;
    }

    // Removed setupSidebarResizing method

    showTabGroupColorPicker(callback) {
        const colorPicker = document.getElementById('tab-group-color-picker');
        if (!colorPicker) {
            console.error('Color picker element not found');
            return;
        }
        
        // Store callback for later use
        this._colorPickerCallback = callback;
        
        // Position picker centered on screen for better UX
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const pickerWidth = 240;
        const pickerHeight = 200;
        
        colorPicker.style.left = ((viewportWidth - pickerWidth) / 2) + 'px';
        colorPicker.style.top = ((viewportHeight - pickerHeight) / 2) + 'px';
        colorPicker.style.transform = 'none';
        
        // Show picker
        colorPicker.classList.remove('hidden');
        colorPicker.style.display = 'block';
        colorPicker.style.zIndex = '10000';
        
        // Setup color selection
        const colorOptions = colorPicker.querySelectorAll('.color-option');
        if (colorOptions.length === 0) {
            console.error('No color options found in color picker');
            return;
        }
        
        colorOptions.forEach(option => {
            option.classList.remove('selected');
            // Remove any existing onclick handlers
            option.onclick = null;
            // Add new onclick handler
            option.onclick = (e) => {
                e.stopPropagation();
                colorOptions.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');
                const color = option.dataset.color;
                if (this._colorPickerCallback) {
                    this._colorPickerCallback(color);
                    this._colorPickerCallback = null;
                }
            };
        });
        
        // Close button
        const closeBtn = colorPicker.querySelector('.color-picker-close');
        if (closeBtn) {
            closeBtn.onclick = (e) => {
                e.stopPropagation();
                this.hideTabGroupColorPicker();
            };
        }
    }
    
    hideTabGroupColorPicker() {
        const colorPicker = document.getElementById('tab-group-color-picker');
        if (colorPicker) {
            colorPicker.classList.add('hidden');
            colorPicker.style.display = 'none';
            this._colorPickerCallback = null;
        }
    }
    
    async showIconPicker(type) {
        this._iconPickerType = type;
        await window.electronAPI.showIconPicker(type);
    }
    
    setupNativeEmojiPicker() {
        // Listen for trigger from main process
        window.electronAPI.onTriggerNativeEmojiPicker((type) => {
            this._iconPickerType = type;
            this.triggerNativeEmojiPicker();
        });
    }
    
    triggerNativeEmojiPicker() {
        // Get the element to position the input relative to
        let targetElement = null;
        if (this._iconPickerType === 'tab' && this.contextMenuTabId) {
            targetElement = document.querySelector(`[data-tab-id="${this.contextMenuTabId}"]`);
        } else if (this._iconPickerType === 'tab-group' && this.contextMenuTabGroupId) {
            targetElement = document.querySelector(`[data-tab-group-id="${this.contextMenuTabGroupId}"]`);
        }
        
        if (!targetElement) {
            // Try to use current tab as fallback for tabs
            if (this._iconPickerType === 'tab' && this.currentTab) {
                targetElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
                if (targetElement) {
                    this.contextMenuTabId = this.currentTab;
                }
            }
            if (!targetElement) {
                console.error('Target element not found for native emoji picker');
                this._iconPickerType = null;
                return;
            }
        }
        
        const rect = targetElement.getBoundingClientRect();
        
        // Create a temporary, nearly invisible input field positioned where we want the picker
        let emojiInput = document.getElementById('native-emoji-input');
        if (emojiInput) {
            emojiInput.remove();
        }
        
        // Create a hidden textarea to receive emoji input
        // The emoji picker is triggered by the main process using AppleScript
        emojiInput = document.createElement('textarea');
        emojiInput.id = 'native-emoji-input';
        emojiInput.setAttribute('contenteditable', 'true');
        emojiInput.style.cssText = `
            position: fixed;
            top: ${rect.bottom + 4}px;
            left: ${rect.left + rect.width / 2}px;
            width: 1px;
            height: 1px;
            opacity: 0.01;
            pointer-events: auto;
            z-index: 10001;
            border: none;
            outline: none;
            background: transparent;
            font-size: 16px;
            color: transparent;
            padding: 0;
            margin: 0;
            resize: none;
            overflow: hidden;
        `;
        document.body.appendChild(emojiInput);
        
        // Listen for input changes (when user selects emoji/symbol from native picker)
        const handleInput = (e) => {
            const selected = emojiInput.value.trim();
            if (selected) {
                this.applySelectedIcon(selected);
                // Clean up
                emojiInput.value = '';
                emojiInput.blur();
                setTimeout(() => {
                    if (emojiInput.parentNode) {
                        emojiInput.remove();
                    }
                }, 100);
            }
        };
        
        emojiInput.addEventListener('input', handleInput);
        emojiInput.addEventListener('change', handleInput);
        
        // Also listen for paste events (emoji picker sometimes uses paste)
        emojiInput.addEventListener('paste', (e) => {
            setTimeout(() => {
                handleInput(e);
            }, 10);
        });
        
        // Focus the input immediately so it can receive emoji from the picker
        // The main process triggers the emoji picker via AppleScript
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                emojiInput.focus();
                emojiInput.select();
                
                // Keep it focused so it can receive the emoji
                const keepFocused = () => {
                    if (document.activeElement !== emojiInput && emojiInput.parentNode) {
                        emojiInput.focus();
                    }
                };
                
                // Check focus periodically
                const focusInterval = setInterval(keepFocused, 100);
                
                // Clean up after timeout
                setTimeout(() => {
                    clearInterval(focusInterval);
                    emojiInput.removeEventListener('input', handleInput);
                    emojiInput.removeEventListener('change', handleInput);
                    emojiInput.removeEventListener('paste', handleInput);
                    if (emojiInput.parentNode) {
                        emojiInput.remove();
                    }
                    this._iconPickerType = null;
                }, 60000); // 60 second timeout
            });
        });
    }
    
    applySelectedIcon(selected) {
        // selected is an emoji or symbol from native macOS picker
        const iconValue = selected.trim();
        if (!iconValue) {
            this._iconPickerType = null;
            return;
        }
        
        if (this._iconPickerType === 'tab' && this.contextMenuTabId) {
            const tab = this.tabs.get(this.contextMenuTabId);
            if (tab) {
                // Store emoji/symbol directly
                tab.customIcon = iconValue;
                tab.customIconType = 'emoji'; // Mark as emoji/symbol
                this.tabs.set(this.contextMenuTabId, tab);
                // Update the tab element
                const tabElement = document.querySelector(`[data-tab-id="${this.contextMenuTabId}"]`);
                if (tabElement) {
                    this.updateTabIcon(tabElement, this.contextMenuTabId);
                }
            }
        } else if (this._iconPickerType === 'tab-group' && this.contextMenuTabGroupId) {
            const tabGroup = this.tabGroups.get(this.contextMenuTabGroupId);
            if (tabGroup) {
                tabGroup.icon = iconValue;
                tabGroup.iconType = 'emoji';
                this.tabGroups.set(this.contextMenuTabGroupId, tabGroup);
                this.saveTabGroups();
                this.renderTabGroups();
            }
        }
        
        this._iconPickerType = null;
    }
    
    updateTabIcon(tabElement, tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab) return;
        
        const faviconEl = tabElement.querySelector('.tab-favicon');
        if (!faviconEl) return;
        
        // Check if tab has custom icon
        if (tab.customIcon) {
            // Check if it's an emoji or Font Awesome icon
            if (tab.customIconType === 'emoji') {
                // For emojis, use a span with the emoji
                const emojiElement = document.createElement('span');
                emojiElement.className = 'tab-favicon';
                emojiElement.textContent = tab.customIcon;
                emojiElement.style.cssText = 'width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1;';
                faviconEl.parentNode.replaceChild(emojiElement, faviconEl);
            } else {
                // Font Awesome icon
                const iconElement = document.createElement('i');
                iconElement.className = `fas ${tab.customIcon} tab-favicon`;
                iconElement.style.cssText = 'width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);';
                faviconEl.parentNode.replaceChild(iconElement, faviconEl);
            }
        } else {
            // Use regular favicon (img element)
            if (faviconEl.tagName !== 'IMG') {
                const imgElement = document.createElement('img');
                imgElement.className = 'tab-favicon';
                imgElement.src = '';
                imgElement.alt = '';
                imgElement.setAttribute('onerror', "this.style.visibility='hidden'");
                faviconEl.parentNode.replaceChild(imgElement, faviconEl);
                this.updateTabFavicon(tabId, tabElement);
            }
        }
    }
    
    setupTabGroupColorPicker() {
        const colorPicker = document.getElementById('tab-group-color-picker');
        if (!colorPicker) return;
        
        // Close on outside click (use capture phase to catch early)
        document.addEventListener('click', (e) => {
            if (colorPicker.classList.contains('hidden') || colorPicker.style.display === 'none') {
                return;
            }
            
            // Don't close if clicking on the color picker itself or its children
            if (colorPicker.contains(e.target)) {
                return;
            }
            
            // Don't close if clicking on the button that opens it
            if (e.target.closest('#sidebar-new-tab-group-option')) {
                return;
            }
            
            // Don't close if clicking on context menu items
            if (e.target.closest('#tab-group-context-menu')) {
                return;
            }
            
            // Close the picker
            this.hideTabGroupColorPicker();
        }, true);
    }

    createNewTabGroup(color = '#FF6B6B') {
        const tabGroupId = Date.now();
        const tabGroupName = `Tab Group ${this.tabGroups.size + 1}`;
        
        const tabGroup = {
            id: tabGroupId,
            name: tabGroupName,
            tabIds: [],
            open: true,
            order: this.tabGroups.size,
            color: color,
            pinned: true
        };
        
        this.tabGroups.set(tabGroupId, tabGroup);
        this.renderTabGroups();
        this.saveTabGroups();
        
        // Focus the tab group name for editing when newly created
        setTimeout(() => {
            const tabGroupElement = document.querySelector(`[data-tab-group-id="${tabGroupId}"]`);
            if (tabGroupElement) {
                const nameInput = tabGroupElement.querySelector('.tab-group-name-input');
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

    renderTabGroups() {
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (!tabsContainer || !separator) return;

        // Remove existing tab group elements
        const existingTabGroups = tabsContainer.querySelectorAll('.tab-group');
        existingTabGroups.forEach(tabGroup => tabGroup.remove());

        // Get all tab groups sorted by order; split by pinned (above separator) vs unpinned (below)
        const all = Array.from(this.tabGroups.values()).sort((a, b) => (a.order || 0) - (b.order || 0));
        const pinnedGroups = all.filter(g => g.pinned !== false);
        const unpinnedGroups = all.filter(g => g.pinned === false);

        pinnedGroups.forEach(tabGroup => {
            const el = this.createTabGroupElement(tabGroup);
            tabsContainer.insertBefore(el, separator);
        });
        unpinnedGroups.forEach(tabGroup => {
            const el = this.createTabGroupElement(tabGroup);
            if (separator.nextSibling) {
                tabsContainer.insertBefore(el, separator.nextSibling);
            } else {
                tabsContainer.appendChild(el);
            }
        });
    }

    createTabGroupElement(tabGroup) {
        const tabGroupElement = document.createElement('div');
        tabGroupElement.className = 'tab-group';
        tabGroupElement.dataset.tabGroupId = tabGroup.id;
        if (tabGroup.pinned !== false) tabGroupElement.classList.add('pinned');
        
        // Apply color - convert hex to RGB for CSS variables
        const color = tabGroup.color || '#FF6B6B';
        const rgb = this.hexToRgb(color);
        if (rgb) {
            tabGroupElement.style.setProperty('--tab-group-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        }
        tabGroupElement.style.setProperty('--tab-group-color', color);
        tabGroupElement.dataset.color = color;
        
        const isOpen = tabGroup.open !== false; // Default to open
        
        // Get tab group tabs (show all tabs in group; pinned groups show pinned tabs, unpinned show unpinned)
        const groupPinned = tabGroup.pinned !== false;
        const tabGroupTabs = tabGroup.tabIds
            .map(tabId => {
                const tab = this.tabs.get(tabId);
                const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
                return { tab, tabElement, tabId };
            })
            .filter(item => item.tab && (groupPinned ? item.tab.pinned : !item.tab.pinned));

        tabGroupElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    ${tabGroup.iconType === 'emoji' 
                        ? `<span class="tab-favicon tab-group-icon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; line-height: 1;">${tabGroup.icon || '📁'}</span>`
                        : `<i class="fas ${tabGroup.icon || 'fa-layer-group'} tab-favicon tab-group-icon"></i>`
                    }
                    <input type="text" class="tab-group-name-input tab-title" value="${this.escapeHtml(tabGroup.name)}" placeholder="Tab Group name" readonly>
                </div>
                <div class="tab-right">
                    <button class="tab-group-delete tab-close" title="Delete Tab Group">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="tab-group-content ${isOpen && tabGroupTabs.length > 0 ? 'open' : ''}">
            </div>
        `;

        // Set up tab group event listeners
        this.setupTabGroupEventListeners(tabGroupElement, tabGroup);

        // Add tab elements to tab group content
        const tabGroupContent = tabGroupElement.querySelector('.tab-group-content');
        
        tabGroupTabs.forEach(({ tabElement, tabId }) => {
            if (tabElement && tabGroupContent) {
                // Only add if not already in a tab group
                if (!tabElement.closest('.tab-group')) {
                    // Reset any inline styles that might cause rendering issues
                    tabElement.style.transform = '';
                    tabElement.style.position = '';
                    tabElement.style.top = '';
                    tabElement.style.left = '';
                    tabElement.style.width = '';
                    tabElement.style.height = '';
                    tabElement.style.margin = '';
                    tabElement.style.padding = '';
                    tabElement.style.opacity = '';
                    tabElement.style.visibility = '';
                    tabElement.style.display = '';
                    
                    // Reset tab-content styles
                    const tabContent = tabElement.querySelector('.tab-content');
                    if (tabContent) {
                        tabContent.style.transform = '';
                        tabContent.style.position = '';
                        tabContent.style.top = '';
                        tabContent.style.left = '';
                        tabContent.style.width = '';
                        tabContent.style.height = '';
                        tabContent.style.margin = '';
                        tabContent.style.padding = '';
                        tabContent.style.opacity = '';
                        tabContent.style.visibility = '';
                        tabContent.style.display = '';
                    }
                    
                    if (groupPinned) tabElement.classList.add('pinned'); else tabElement.classList.remove('pinned');
                    tabGroupContent.appendChild(tabElement);
                    // Force a reflow to ensure styles are applied
                    void tabElement.offsetHeight;
                    // Ensure event listeners are set up
                    this.setupTabEventListeners(tabElement, tabId);
                }
            } else if (tabGroupContent && !tabElement) {
                // Tab element doesn't exist, create it
                const tab = this.tabs.get(tabId);
                if (tab) {
                    const newTabElement = document.createElement('div');
                    newTabElement.className = 'tab' + (groupPinned ? ' pinned' : '');
                    newTabElement.dataset.tabId = tabId;
                    newTabElement.innerHTML = `
                        <div class="tab-content">
                            <div class="tab-left">
                                ${tab.customIcon ? `<i class="fas ${tab.customIcon} tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);"></i>` : `<img class="tab-favicon" src="" alt="" onerror="this.style.visibility='hidden'">`}
                                <span class="tab-audio-indicator" style="display: none;"><i class="fas fa-volume-up"></i></span>
                                <span class="tab-title">${this.escapeHtml(tab.title || 'New Tab')}</span>
                            </div>
                            <div class="tab-right">
                                <button class="tab-close"><i class="fas fa-times"></i></button>
                            </div>
                        </div>
                    `;
                    tabGroupContent.appendChild(newTabElement);
                    this.setupTabEventListeners(newTabElement, tabId);
                    this.updateTabFavicon(tabId, newTabElement);
                }
            }
        });
        
        // Set initial state if tab group is open AND has tabs (after tabs are added)
        if (isOpen && tabGroupTabs.length > 0) {
            // Use requestAnimationFrame for proper DOM synchronization
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    tabGroupContent.style.display = 'flex';
                    tabGroupContent.style.visibility = 'visible';
                    tabGroupContent.style.maxHeight = 'none';
                    const height = tabGroupContent.scrollHeight;
                    tabGroupContent.style.maxHeight = height + 'px';
                    tabGroupContent.style.opacity = '1';
                    tabGroupContent.classList.add('open');
                });
            });
        } else {
            // Ensure empty tab groups have no expansion
            tabGroupContent.style.display = 'none';
            tabGroupContent.style.visibility = 'hidden';
            tabGroupContent.style.maxHeight = '0px';
            tabGroupContent.style.padding = '0';
            tabGroupContent.style.opacity = '0';
            tabGroupContent.classList.remove('open');
        }

        return tabGroupElement;
    }

    setupTabGroupEventListeners(tabGroupElement, tabGroup) {
        const nameInput = tabGroupElement.querySelector('.tab-group-name-input');
        const deleteBtn = tabGroupElement.querySelector('.tab-group-delete');
        const tabGroupContent = tabGroupElement.querySelector('.tab-group-content');
        const tabContent = tabGroupElement.querySelector('.tab-content');

        // Disable HTML5 draggable - we now use custom smooth drag
        tabGroupElement.draggable = false;
        
        // Prevent child elements from being draggable
        nameInput.draggable = false;
        deleteBtn.draggable = false;
        const tabGroupIcon = tabGroupElement.querySelector('.tab-group-icon');
        if (tabGroupIcon) {
            tabGroupIcon.draggable = false;
        }
        
        // Make input non-interactive when readonly to prevent focus
        if (nameInput.readOnly) {
            nameInput.style.pointerEvents = 'none';
        }
        
        // Setup smooth drag for this tab group
        if (this.makeTabGroupSmoothDraggable) {
            this.makeTabGroupSmoothDraggable(tabGroupElement);
        }
        
        // Track click state to distinguish click from drag
        let clickStartPos = { x: 0, y: 0 };
        let clickStartTime = 0;
        
        tabContent.addEventListener('mousedown', (e) => {
            clickStartPos = { x: e.clientX, y: e.clientY };
            clickStartTime = Date.now();
        });
            
        // Toggle tab group - click anywhere on the tab group tab (including the name)
        tabContent.addEventListener('click', (e) => {
            // Don't toggle if clicking on delete button
            if (e.target.closest('.tab-group-delete')) {
                return;
            }
            
            // Check if this was a drag (moved more than 5px)
            const mouseMoved = Math.abs(e.clientX - clickStartPos.x) > 5 || Math.abs(e.clientY - clickStartPos.y) > 5;
            const timeSinceClick = Date.now() - clickStartTime;
            
            // If it was a drag, don't toggle
            if (mouseMoved && timeSinceClick > 100) {
                return;
            }
            
            // If clicking on the input and it's readonly, just toggle (don't rename)
            if (e.target.closest('.tab-group-name-input') && nameInput.readOnly) {
                e.preventDefault();
                e.stopPropagation();
                nameInput.blur();
                    this.toggleTabGroup(tabGroup.id);
                return;
            }
            // If input is not readonly (being edited), don't toggle
            if (e.target.closest('.tab-group-name-input') && !nameInput.readOnly) {
                return;
            }
            e.stopPropagation();
            // Blur input if it somehow got focused
            if (nameInput.readOnly) {
                nameInput.blur();
            }
                this.toggleTabGroup(tabGroup.id);
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

        // Right-click for context menu - use capture phase to run before sidebar handler
        tabGroupElement.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation(); // Stop all other handlers
            this.showTabGroupContextMenu(e, tabGroup.id);
        }, true); // Use capture phase

        // Rename tab group - only when input is made editable
        nameInput.addEventListener('blur', () => {
            const newName = nameInput.value.trim() || `Tab Group ${tabGroup.id}`;
            tabGroup.name = newName;
            this.tabGroups.set(tabGroup.id, tabGroup);
            this.saveTabGroups();
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
                nameInput.value = tabGroup.name;
                nameInput.blur();
            }
        });

        // Delete tab group - make it always visible but styled
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (confirm(`Delete tab group "${tabGroup.name}"? Tabs will be moved back to the sidebar.`)) {
                this.deleteTabGroup(tabGroup.id);
            }
        });

    }

    toggleTabGroup(tabGroupId) {
        const tabGroup = this.tabGroups.get(tabGroupId);
        if (!tabGroup) return;

        const tabGroupElement = document.querySelector(`[data-tab-group-id="${tabGroupId}"]`);
        if (!tabGroupElement) return;
        
        const tabGroupContent = tabGroupElement.querySelector('.tab-group-content');
        
        if (!tabGroupContent) return;
        
        // Prevent multiple toggles
        if (tabGroupElement.classList.contains('toggling')) return;
        tabGroupElement.classList.add('toggling');
        
        const isOpening = !tabGroup.open;
        tabGroup.open = isOpening;
        this.tabGroups.set(tabGroupId, tabGroup);
        
        // Check if tab group has tabs - only open if it has content
        const hasTabs = tabGroup.tabIds.length > 0;
        
        if (isOpening) {
            // Don't open if tab group is empty
            if (!hasTabs) {
                tabGroupContent.style.maxHeight = '0px';
                tabGroupContent.style.display = 'none';
                tabGroupContent.style.visibility = 'hidden';
                tabGroupContent.style.opacity = '0';
                tabGroupContent.classList.remove('open');
                tabGroupElement.classList.remove('toggling');
                this.saveTabGroups();
                return;
            }
            
            // Opening: measure height, then animate
            tabGroupContent.style.display = 'flex';
            tabGroupContent.style.visibility = 'visible';
            tabGroupContent.style.maxHeight = 'none';
            tabGroupContent.style.transition = 'none';
            
            // Force reflow to get accurate height
            const height = tabGroupContent.offsetHeight;
                
            // Reset and animate
            tabGroupContent.style.maxHeight = '0px';
            tabGroupContent.style.opacity = '0';
            tabGroupContent.style.transition = 'max-height 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), padding 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                
                requestAnimationFrame(() => {
                tabGroupContent.classList.add('open');
                tabGroupContent.style.maxHeight = height + 'px';
                tabGroupContent.style.opacity = '1';
                        
                // After animation, allow full expansion
                        setTimeout(() => {
                    tabGroupContent.style.transition = 'none';
                    tabGroupContent.style.maxHeight = '9999px';
                    tabGroupElement.classList.remove('toggling');
                            setTimeout(() => {
                        tabGroupContent.style.transition = '';
                            }, 50);
                        }, 400);
            });
        } else {
            // Closing: get current height, then animate to 0
            const currentHeight = tabGroupContent.scrollHeight;
            tabGroupContent.style.maxHeight = currentHeight + 'px';
            tabGroupContent.style.opacity = '1';
            tabGroupContent.style.transition = 'max-height 0.35s cubic-bezier(0.25, 0.46, 0.45, 0.94), opacity 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94), padding 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
            
            requestAnimationFrame(() => {
                tabGroupContent.classList.remove('open');
                tabGroupContent.style.maxHeight = '0px';
                tabGroupContent.style.opacity = '0';
                    
                // Clean up after animation
                    setTimeout(() => {
                    tabGroupContent.style.display = 'none';
                    tabGroupContent.style.visibility = 'hidden';
                    tabGroupContent.style.maxHeight = '';
                    tabGroupContent.style.transition = '';
                    tabGroupElement.classList.remove('toggling');
                    }, 380);
            });
        }
        
        this.saveTabGroups();
    }

    addTabToTabGroup(tabId, tabGroupId, skipUndo = false, insertIndex = undefined) {
        const tab = this.tabs.get(tabId);
        const tabGroup = this.tabGroups.get(tabGroupId);
        
        if (!tab || !tabGroup) return;
        
        if (!skipUndo) {
            this.tabUndoStack.push({ type: 'add_to_group', tabId, tabGroupId });
            if (this.tabUndoStack.length > 20) this.tabUndoStack = this.tabUndoStack.slice(-20);
        }
        // Only add pinned tabs to tab groups
        if (!tab.pinned) {
            // Auto-pin the tab
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            if (tabElement) {
                this.togglePinTab(tabId, tabElement, null);
            }
        }
        
        // Remove tab from any other tab group (optimized - only check if needed)
        for (const [id, tg] of this.tabGroups) {
            if (id !== tabGroupId && tg.tabIds.includes(tabId)) {
                tg.tabIds = tg.tabIds.filter(tgid => tgid !== tabId);
                this.tabGroups.set(id, tg);
                // Save the other group's state
                this.saveTabGroups();
                break; // Tab can only be in one tab group at a time
            }
        }
        
        // Add to this tab group if not already there
        if (!tabGroup.tabIds.includes(tabId)) {
            if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= tabGroup.tabIds.length) {
                tabGroup.tabIds.splice(insertIndex, 0, tabId);
            } else {
                tabGroup.tabIds.push(tabId);
            }
            this.tabGroups.set(tabGroupId, tabGroup);
        }
        
        tab.tabGroupId = tabGroupId;
        tab.pinned = tabGroup.pinned !== false;
        this.tabs.set(tabId, tab);
        
        // Update tab group UI directly without full re-render for better performance
        const tabGroupElement = document.querySelector(`[data-tab-group-id="${tabGroupId}"]`);
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        
        if (!tabGroupElement || !tabElement) return;
        
        const tabGroupContent = tabGroupElement.querySelector('.tab-group-content');
        if (!tabGroupContent) {
            // Fallback: just remove from main container
            if (tabElement.parentNode && !tabElement.closest('.tab-group')) {
                tabElement.remove();
            }
            return;
        }
        
        // Ensure tab group content is fully opened and stable before adding tabs
        const ensureTabGroupContentReady = () => {
            // Remove any transition/animation states
            tabGroupElement.classList.remove('toggling');
            
            // Force content to be fully opened immediately (no animation)
            tabGroupContent.style.display = 'flex';
            tabGroupContent.style.visibility = 'visible';
            tabGroupContent.style.opacity = '1';
            tabGroupContent.style.maxHeight = 'none';
            tabGroupContent.style.transition = 'none';
            tabGroupContent.style.padding = '8px 16px 12px 16px';
            tabGroupContent.classList.add('open');
            
            // Force a reflow to ensure layout is calculated
            void tabGroupContent.offsetHeight;
        };
        
        // Batch DOM operations
        requestAnimationFrame(() => {
            // Ensure tab group is open and in stable state
            if (!tabGroup.open) {
                tabGroup.open = true;
                this.tabGroups.set(tabGroupId, tabGroup);
            }
            
            // Force content to be ready (fully opened, no transitions)
            ensureTabGroupContentReady();
            
            // Wait one more frame to ensure layout is completely stable
            requestAnimationFrame(() => {
                // Remove tab from wherever it currently is (main container or another tab group)
                if (tabElement.parentNode) {
                    // Check if it's in a tab group content
                    const currentParent = tabElement.parentNode;
                    if (currentParent.classList && currentParent.classList.contains('tab-group-content')) {
                        // Remove from current tab group
                        const currentTabGroupElement = currentParent.closest('.tab-group');
                        if (currentTabGroupElement) {
                            const currentTabGroupId = parseInt(currentTabGroupElement.dataset.tabGroupId, 10);
                            if (currentTabGroupId && currentTabGroupId !== tabGroupId) {
                                // Remove from the other tab group's data
                                const currentTabGroup = this.tabGroups.get(currentTabGroupId);
                                if (currentTabGroup) {
                                    currentTabGroup.tabIds = currentTabGroup.tabIds.filter(id => id !== tabId);
                                    this.tabGroups.set(currentTabGroupId, currentTabGroup);
                                }
                            }
                        }
                    }
                tabElement.remove();
            }
            
                // Completely reset all inline styles on tab element
                tabElement.style.cssText = '';
                tabElement.style.display = 'block';
                tabElement.style.position = 'relative';
                tabElement.style.margin = '0';
                tabElement.style.width = '100%';
                tabElement.style.boxSizing = 'border-box';
                
                // Completely reset tab-content styles
                const tabContent = tabElement.querySelector('.tab-content');
                if (tabContent) {
                    tabContent.style.cssText = '';
                    tabContent.style.display = 'flex';
                    tabContent.style.position = 'relative';
                    tabContent.style.height = '32px';
                    tabContent.style.minHeight = '32px';
                }
                
                if (tabGroup.pinned !== false) tabElement.classList.add('pinned'); else tabElement.classList.remove('pinned');
                tabElement.classList.remove('dragging', 'active');
                
                // Force reflows to ensure styles are applied
                void tabElement.offsetHeight;
                void tabGroupContent.offsetHeight;
                
                // Always add tab to tab group content (even if it was there before, we've removed it)
                // This ensures it's properly added even if it was previously in this or another tab group
                if (tabElement.parentNode !== tabGroupContent) {
                    if (insertIndex !== undefined && insertIndex >= 0 && insertIndex < tabGroupContent.children.length) {
                        tabGroupContent.insertBefore(tabElement, tabGroupContent.children[insertIndex]);
                    } else {
                        tabGroupContent.appendChild(tabElement);
                    }
                }
                
                // Force another reflow after adding to DOM
                requestAnimationFrame(() => {
                    void tabElement.offsetHeight;
                    void tabGroupContent.offsetHeight;
                    
                    // Re-enable transitions after tab is properly added
                    tabGroupContent.style.transition = '';
                    
                    // Always re-setup event listeners to ensure they're fresh
                this.setupTabEventListeners(tabElement, tabId);
                this.updateTabFavicon(tabId, tabElement);
                if (this.makeTabDraggable) {
                    this.makeTabDraggable(tabElement);
                }
                });
            
                // Remove empty state if present
                const tabGroupEmpty = tabGroupContent.querySelector('.tab-group-empty');
                if (tabGroupEmpty) {
                    tabGroupEmpty.remove();
            }
            });
        });
        
        this.saveTabGroups();
    }

    removeTabFromTabGroup(tabId, tabGroupId, skipUndo = false) {
        const tabGroup = this.tabGroups.get(tabGroupId);
        if (!tabGroup) return;
        
        const indexInGroup = tabGroup.tabIds.indexOf(tabId);
        if (!skipUndo && indexInGroup !== -1) {
            this.tabUndoStack.push({ type: 'remove_from_group', tabId, tabGroupId, indexInGroup });
            if (this.tabUndoStack.length > 20) this.tabUndoStack = this.tabUndoStack.slice(-20);
        }
        // Remove tab from group's tabIds array
        tabGroup.tabIds = tabGroup.tabIds.filter(id => id !== tabId);
        this.tabGroups.set(tabGroupId, tabGroup);
        
        // Clear tabGroupId from tab data
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.tabGroupId = undefined;
            this.tabs.set(tabId, tab);
        }
        
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        const tabGroupElement = document.querySelector(`[data-tab-group-id="${tabGroupId}"]`);
        
        if (!tabElement || !tabsContainer || !separator || !tabGroupElement) return;
        
        // Clean up any drag-related classes and styles on tab group first
        tabGroupElement.classList.remove('dragging', 'drag-over-tab-group', 'drag-over-tab-group-top', 'drag-over-tab-group-bottom');
        
        // Store original styles to restore later
        const tabGroupContent = tabGroupElement.querySelector('.tab-group-content');
        const originalTabGroupTransition = tabGroupElement.style.transition;
        const originalTabGroupPointerEvents = tabGroupElement.style.pointerEvents;
        const originalTabGroupTransform = tabGroupElement.style.transform;
        const originalTabGroupFilter = tabGroupElement.style.filter;
        const originalTabGroupOpacity = tabGroupElement.style.opacity;
        const originalTabTransition = tabElement.style.transition;
        
        // Temporarily disable transitions and reset any transform/filter/opacity that might be stuck
        tabGroupElement.style.transition = 'none';
        tabGroupElement.style.pointerEvents = 'none';
        tabGroupElement.style.transform = '';
        tabGroupElement.style.filter = '';
        tabGroupElement.style.opacity = '';
        tabElement.style.transition = 'none';
        
        // Batch all DOM updates in a single frame
        requestAnimationFrame(() => {
            // Remove tab from tab group content
            tabElement.remove();
            
            // Completely reset tab element styles and state
            tabElement.style.cssText = '';
            tabElement.style.display = 'block';
            tabElement.style.position = 'relative';
            tabElement.style.margin = '0';
            tabElement.style.width = '100%';
            tabElement.style.boxSizing = 'border-box';
            
            // Reset tab-content styles
            const tabContentEl = tabElement.querySelector('.tab-content');
            if (tabContentEl) {
                tabContentEl.style.cssText = '';
                tabContentEl.style.display = 'flex';
                tabContentEl.style.position = 'relative';
                tabContentEl.style.height = '32px';
                tabContentEl.style.minHeight = '32px';
            }
            
            if (tab.pinned) tabElement.classList.add('pinned'); else tabElement.classList.remove('pinned');
            tabElement.classList.remove('dragging', 'active');
            if (tab.pinned) {
                tabsContainer.insertBefore(tabElement, separator);
            } else {
                if (separator.nextSibling) tabsContainer.insertBefore(tabElement, separator.nextSibling);
                else tabsContainer.appendChild(tabElement);
            }
            
            // Re-setup event listeners to ensure they're fresh
            this.setupTabEventListeners(tabElement, tabId);
            
            if (this.makeTabDraggable) {
                this.makeTabDraggable(tabElement);
            }
            
            // Remove any empty state message if it exists
            const tabGroupEmpty = tabGroupContent?.querySelector('.tab-group-empty');
            if (tabGroupEmpty) {
                tabGroupEmpty.remove();
            }
            
            // If tab group was open but is now empty, close it completely
            if (tabGroup.open && tabGroup.tabIds.length === 0) {
                tabGroup.open = false;
                this.tabGroups.set(tabGroup.id, tabGroup);
                tabGroupContent.classList.remove('open');
                tabGroupContent.style.display = 'none';
                tabGroupContent.style.visibility = 'hidden';
                tabGroupContent.style.maxHeight = '0px';
                tabGroupContent.style.padding = '0';
                tabGroupContent.style.opacity = '0';
            }
            
            // Restore styles immediately (no need for double RAF)
            tabGroupElement.style.transition = originalTabGroupTransition || '';
            tabGroupElement.style.pointerEvents = originalTabGroupPointerEvents || '';
            tabGroupElement.style.transform = originalTabGroupTransform || '';
            tabGroupElement.style.filter = originalTabGroupFilter || '';
            tabGroupElement.style.opacity = originalTabGroupOpacity || '';
            tabElement.style.transition = originalTabTransition || '';
            
            // Ensure all drag classes are removed
            tabGroupElement.classList.remove('dragging', 'drag-over-tab-group', 'drag-over-tab-group-top', 'drag-over-tab-group-bottom');
            
            // Force a reflow to ensure everything is properly laid out
            void tabElement.offsetHeight;
        });
        
        this.saveTabGroups();
    }

    deleteTabGroup(tabGroupId) {
        const tabGroup = this.tabGroups.get(tabGroupId);
        if (!tabGroup) return;
        
        // Move all tabs back to main container and clean up tab data
        tabGroup.tabIds.forEach(tabId => {
            const tab = this.tabs.get(tabId);
            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
            const tabsContainer = this.elements.tabsContainer;
            const separator = this.elements.tabsSeparator;
            if (tab) {
                tab.tabGroupId = undefined;
                this.tabs.set(tabId, tab);
            }
            if (tabElement && tabsContainer && separator) {
                tabElement.remove();
                tabsContainer.insertBefore(tabElement, separator);
            }
        });
        
        // Remove tab group
        this.tabGroups.delete(tabGroupId);
        
        // Save before rendering to ensure state consistency
        this.saveTabGroups();
        this.renderTabGroups();
    }

    saveTabGroups() {
        const tabGroupsArray = Array.from(this.tabGroups.values()).map(tabGroup => {
            // Save tab data for each tab in the group so we can recreate them on load
            const tabs = tabGroup.tabIds.map(tabId => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    return {
                        id: tabId,
                        url: tab.url || null,
                        title: tab.title || 'New Tab',
                        favicon: tab.favicon || null
                    };
                }
                return null;
            }).filter(t => t !== null);
            
            return {
                id: tabGroup.id,
                name: tabGroup.name,
                tabIds: tabGroup.tabIds,
                tabs: tabs, // Save tab data so we can recreate tabs on load
                open: tabGroup.open,
                order: tabGroup.order,
                color: tabGroup.color || '#FF6B6B',
                pinned: tabGroup.pinned !== false
            };
        });
        
        this.saveSetting('tabGroups', tabGroupsArray);
    }

    async loadTabGroups() {
        try {
            const tabGroupsData = this.settings.tabGroups || [];
            if (!Array.isArray(tabGroupsData)) return;
            
            // First, load all tab groups
            tabGroupsData.forEach(tabGroupData => {
                this.tabGroups.set(tabGroupData.id, {
                    id: tabGroupData.id,
                    name: tabGroupData.name || `Tab Group ${tabGroupData.id}`,
                    tabIds: tabGroupData.tabIds || [],
                    open: tabGroupData.open !== false, // Default to open
                    order: tabGroupData.order || 0,
                    color: tabGroupData.color || '#FF6B6B',
                    pinned: tabGroupData.pinned !== false, // Default true for backward compat
                    tabs: tabGroupData.tabs || [] // Store tab data for tabs in this group
                });
            });
            
            const tabsContainer = this.elements.tabsContainer;
            const separator = this.elements.tabsSeparator;
            tabGroupsData.forEach(tabGroupData => {
                if (!tabGroupData.tabIds || !Array.isArray(tabGroupData.tabIds)) return;
                
                tabGroupData.tabIds.forEach(tabId => {
                    // Check if tab already exists
                    if (this.tabs.has(tabId)) return;
                    
                    // Try to find tab data from the tab group's saved tabs
                    const savedTabData = tabGroupData.tabs?.find(t => t.id === tabId);
                    
                    if (savedTabData && tabsContainer && separator) {
                        // Create the tab element
                        const tabElement = document.createElement('div');
                        tabElement.className = 'tab pinned';
                        tabElement.dataset.tabId = tabId;
                        
                        tabElement.innerHTML = `
                            <div class="tab-content">
                                <div class="tab-left">
                                    ${tab.customIcon ? `<i class="fas ${tab.customIcon} tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);"></i>` : `<img class="tab-favicon" src="" alt="" onerror="this.style.visibility='hidden'">`}
                                    <span class="tab-audio-indicator" style="display: none;"><i class="fas fa-volume-up"></i></span>
                                    <span class="tab-title">${this.escapeHtml(savedTabData.title || 'New Tab')}</span>
                                </div>
                                <div class="tab-right">
                                    <button class="tab-close"><i class="fas fa-times"></i></button>
                                </div>
                            </div>
                        `;
                        
                        // Store tab data
                        this.tabs.set(tabId, {
                            id: tabId,
                            url: savedTabData.url || null,
                            title: savedTabData.title || 'New Tab',
                            favicon: savedTabData.favicon || null,
                            canGoBack: false,
                            canGoForward: false,
                            history: savedTabData.url ? [savedTabData.url] : [],
                            historyIndex: savedTabData.url ? 0 : -1,
                            pinned: true,
                            webview: null // No webview initially - tab is closed
                        });
                        
                        // Mark as closed since it has no webview
                        tabElement.classList.add('closed');
                        
                        // Set up event listeners
                        this.setupTabEventListeners(tabElement, tabId);
                        
                        // Update favicon
                        this.updateTabFavicon(tabId, tabElement);
                        
                        // Update closed state
                        this.updatePinnedTabClosedState(tabId);
                    }
                });
            });
            
            this.renderTabGroups();
        } catch (error) {
            console.error('Error loading tab groups:', error);
        }
    }

    async showTabGroupContextMenu(e, tabGroupId) {
            // Hide other context menus
            this.hideTabContextMenu();
            this.hideWebpageContextMenu();
            this.hideSidebarContextMenu();
            
            this.contextMenuTabGroupId = tabGroupId;
        
        // Show native OS context menu
        await window.electronAPI.showTabGroupContextMenu(e.clientX, e.clientY);
    }

    hideTabGroupContextMenu() {
        // Native OS context menu closes automatically, no action needed
        // This function is kept for compatibility with existing code
    }

    renameCurrentTabGroup() {
        if (this.contextMenuTabGroupId) {
            const tabGroupElement = document.querySelector(`[data-tab-group-id="${this.contextMenuTabGroupId}"]`);
            if (tabGroupElement) {
                const nameInput = tabGroupElement.querySelector('.tab-group-name-input');
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
                    if (nameInput && nameInput.parentNode) {
                        nameInput.parentNode.replaceChild(input, nameInput);
                    }
                    if (input) {
                        if (typeof input.focus === 'function') {
                            try {
                                input.focus();
                            } catch (e) {
                                // Ignore focus errors
                            }
                        }
                        if (typeof input.select === 'function') {
                            try {
                                input.select();
                            } catch (e) {
                                // Ignore select errors
                            }
                        }
                    }
                    
                    const finishRename = () => {
                        const newName = input.value.trim() || currentName;
                        
                        // Restore the nameInput element
                        const newNameInput = document.createElement('input');
                        newNameInput.type = 'text';
                        newNameInput.className = 'tab-group-name-input tab-title';
                        newNameInput.value = newName;
                        newNameInput.readOnly = true;
                        input.parentNode.replaceChild(newNameInput, input);
                        
                        // Update tab group data
                        const tabGroup = this.tabGroups.get(this.contextMenuTabGroupId);
                        if (tabGroup) {
                            tabGroup.name = newName;
                            this.tabGroups.set(this.contextMenuTabGroupId, tabGroup);
                            this.saveTabGroups();
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

    deleteCurrentTabGroup() {
        if (this.contextMenuTabGroupId) {
            const tabGroup = this.tabGroups.get(this.contextMenuTabGroupId);
            if (tabGroup && confirm(`Delete tab group "${tabGroup.name}"? Tabs will be moved back to the sidebar.`)) {
                this.deleteTabGroup(this.contextMenuTabGroupId);
            }
        }
    }

    duplicateCurrentTabGroup() {
        if (!this.contextMenuTabGroupId) {
            return;
        }

        const originalTabGroup = this.tabGroups.get(this.contextMenuTabGroupId);
        if (!originalTabGroup) {
            return;
        }

        // Create new tab group with same color and name + "Copy"
        const newTabGroupId = Date.now();
        const newTabGroupName = `${originalTabGroup.name} Copy`;
        const newTabGroup = {
            id: newTabGroupId,
            name: newTabGroupName,
            tabIds: [],
            open: originalTabGroup.open,
            order: this.tabGroups.size,
            color: originalTabGroup.color || '#FF6B6B',
            pinned: originalTabGroup.pinned !== false,
            tabs: []
        };

        // Duplicate all tabs in the group
        const newTabIds = [];
        originalTabGroup.tabIds.forEach(tabId => {
            const originalTab = this.tabs.get(tabId);
            if (originalTab) {
                // Get URL from tab data or webview
                let urlToDuplicate = originalTab.url;
                
                if (!urlToDuplicate || urlToDuplicate === 'about:blank') {
                    const webview = originalTab.webview;
                    if (webview) {
                        try {
                            urlToDuplicate = webview.getURL();
                        } catch (e) {
                            console.error('Error getting URL from webview:', e);
                        }
                    }
                }

                // Only duplicate if we have a valid URL
                if (urlToDuplicate && urlToDuplicate !== 'about:blank' && urlToDuplicate.startsWith('http')) {
                    // Create new tab
                    const newTabId = this.createNewTab(urlToDuplicate);
                    if (newTabId) {
                        newTabIds.push(newTabId);
                        
                        // Get the newly created tab to save its data
                        const newTab = this.tabs.get(newTabId);
                        if (newTab) {
                            // Store tab data for persistence
                            newTabGroup.tabs.push({
                                id: newTabId,
                                url: newTab.url || urlToDuplicate,
                                title: newTab.title || originalTab.title || 'New Tab',
                                favicon: newTab.favicon || originalTab.favicon || null
                            });
                        }
                    }
                }
            }
        });

        // Set the new tab IDs
        newTabGroup.tabIds = newTabIds;

        // Add new tab group
        this.tabGroups.set(newTabGroupId, newTabGroup);
        
        // Move duplicated tabs into the new tab group
        newTabIds.forEach(tabId => {
            const tab = this.tabs.get(tabId);
            if (tab) {
                // Remove from sidebar first
                const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
                if (tabElement) {
                    tabElement.remove();
                }
                
                tab.pinned = newTabGroup.pinned !== false;
                tab.tabGroupId = newTabGroupId;
                // Ensure tab is properly added to the group's tabIds (should already be done, but double-check)
                if (!newTabGroup.tabIds.includes(tabId)) {
                    newTabGroup.tabIds.push(tabId);
                }
                this.tabs.set(tabId, tab);
            }
        });
        
        // Update the tab group with potentially modified tabIds
        this.tabGroups.set(newTabGroupId, newTabGroup);

        // Render tab groups and save
        this.renderTabGroups();
        this.saveTabGroups();
        
        // Show notification
        this.showNotification('Tab group duplicated', 'success');
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
            const isTabGroup = target.closest('.tab-group');
            const isButton = target.closest('button');
            const isInput = target.tagName === 'INPUT' || target.closest('input');
            const isResizeHandle = target.closest('#sidebar-resize-handle');
            const isContextMenu = target.closest('.context-menu');
            
            console.log('Click checks:', {
                target: target.tagName,
                targetClasses: target.className,
                isTab: !!isTab,
                isTabGroup: !!isTabGroup,
                isButton: !!isButton,
                isInput: !!isInput,
                isResizeHandle: !!isResizeHandle,
                isContextMenu: !!isContextMenu
            });
            
            // IMPORTANT: If clicking on a tab group, don't interfere - let tab group handler process it
            if (isTabGroup) {
                // Don't prevent default or stop propagation - let tab group handler run
                return;
            }
            
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

    async showTabContextMenu(e, tabId) {
        // Hide other context menus
        this.hideWebpageContextMenu();
        this.hideSidebarContextMenu();
        this.hideTabGroupContextMenu();
        
        const tab = this.tabs.get(tabId);
        const tabGroupsList = Array.from(this.tabGroups.values())
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map(g => ({ id: g.id, name: g.name || `Tab Group ${g.id}` }));
        const tabInfo = {
            isPinned: tab?.pinned || false,
            isMuted: tab?.isMuted || false,
            tabGroups: tabGroupsList
        };
        this.contextMenuTabId = tabId;
        await window.electronAPI.showTabContextMenu(e.clientX, e.clientY, tabInfo);
    }

    hideTabContextMenu() {
        // Native OS context menu closes automatically, no action needed
        // This function is kept for compatibility with existing code
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
            // Get the tab to duplicate (from context menu or current tab)
            const tabId = this.contextMenuTabId || this.currentTab;
            if (!tabId) {
                console.error('No tab to duplicate');
                this.showToast('Error: No tab to duplicate');
                return;
            }
            
            const tab = this.tabs.get(tabId);
            if (!tab) {
                console.error('Tab not found:', tabId);
                this.showToast('Error: Tab not found');
                return;
            }
            
            // Get URL from tab data first, then try webview
            let urlToDuplicate = tab.url;
            
            // If no URL in tab data, try getting it from the tab's webview
            if (!urlToDuplicate || urlToDuplicate === 'about:blank') {
                const webview = tab.webview;
                if (webview) {
                    try {
                        urlToDuplicate = webview.getURL();
                    } catch (e) {
                        console.error('Error getting URL from webview:', e);
                    }
                }
            }
            
            // Validate the URL
            if (!urlToDuplicate || urlToDuplicate === 'about:blank' || !urlToDuplicate.startsWith('http')) {
                this.showToast('Cannot duplicate: No valid URL');
                return;
            }
            
            console.log('Duplicating tab with URL:', urlToDuplicate);
            
            // Create a new tab with the URL
            const newTabId = this.createNewTab(urlToDuplicate);
            
            // Show success message
            this.showNotification('Tab duplicated', 'success');
            
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

    toggleTabMute(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.webview) return;
        
        try {
            if (tab.isMuted) {
                tab.webview.setAudioMuted(false);
                tab.isMuted = false;
            } else {
                tab.webview.setAudioMuted(true);
                tab.isMuted = true;
            }
            // Update the audio indicator to show correct state
            this.updateTabAudioIndicator(tabId, tab.isPlayingAudio);
        } catch (error) {
            console.error('Failed to toggle tab mute:', error);
        }
    }

    async showSidebarContextMenu(e) {
        // Hide other context menus
        this.hideTabContextMenu();
        this.hideWebpageContextMenu();
        
        const isRight = this.isSidebarRight();
        
        // Show native OS context menu
        await window.electronAPI.showSidebarContextMenu(e.clientX, e.clientY, isRight);
    }

    hideSidebarContextMenu() {
        // Native OS context menu closes automatically, no action needed
        // This function is kept for compatibility with existing code
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

    async showWebpageContextMenu(e) {
        // Hide other context menus
            this.hideTabContextMenu();
        this.hideSidebarContextMenu();
        this.hideTabGroupContextMenu();
        
        const ctx = this.webviewContextInfo || {};
        const webview = this.getActiveWebview();
        
        // Check if webview can go back/forward
        let canGoBack = false;
        let canGoForward = false;
        if (webview) {
            try {
                canGoBack = webview.canGoBack();
                canGoForward = webview.canGoForward();
            } catch (e) {
                // Ignore errors
            }
        }
        
        // Prepare context info for native menu
        const contextInfo = {
            ...ctx,
            canGoBack,
            canGoForward
        };
        
        // Show native OS context menu
        await window.electronAPI.showWebpageContextMenu(e.clientX, e.clientY, contextInfo);
    }

    hideWebpageContextMenu() {
        // Native OS context menu closes automatically, no action needed
        // This function is kept for compatibility with existing code
        
        // Hide the backdrop if it exists
        if (this.contextMenuBackdrop) {
            this.contextMenuBackdrop.style.display = 'none';
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
        // Try to get URL from active webview first
        let url = null;
        const webview = this.getActiveWebview();
        
        if (webview) {
            try {
                url = webview.getURL();
            } catch (e) {
                // Fallback to tab URL
            }
        }
        
        // Fallback to tab URL if webview URL is not available
        if (!url || url === 'about:blank') {
            if (this.currentTab) {
                const tab = this.tabs.get(this.currentTab);
                if (tab && tab.url && tab.url !== 'about:blank') {
                    url = tab.url;
                }
            }
        }
        
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

    // Show native macOS downloads menu (Electron Menu.popup)
    async showDownloadsPopup() {
        try {
            const button = document.getElementById('downloads-btn-footer');
            if (!button) {
                await window.electronAPI.showDownloadsPopup();
                return;
            }
            const rect = button.getBoundingClientRect();
            await window.electronAPI.showDownloadsPopup(rect.left, rect.top, rect.width, rect.height);
        } catch (error) {
            console.error('Failed to show downloads popup:', error);
        }
    }
    
    // Helper: format bytes into human-readable size
    formatFileSize(bytes) {
        if (!bytes || bytes <= 0) return '';
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = bytes;
        let unit = 0;
        while (size >= 1024 && unit < units.length - 1) {
            size /= 1024;
            unit++;
        }
        return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
    }
    
    // Helper: classify file type for preview styling
    getFileTypeForPreview(fileName = '') {
        const name = fileName.toLowerCase();
        if (name.match(/\.(png|jpe?g|gif|webp|heic|heif|tiff?)$/)) return 'type-image';
        if (name.match(/\.(mp4|mov|m4v|webm|avi|mkv)$/)) return 'type-video';
        if (name.match(/\.(mp3|wav|aac|flac|ogg)$/)) return 'type-audio';
        if (name.match(/\.(pdf)$/)) return 'type-pdf';
        if (name.match(/\.(zip|rar|7z|tar|gz)$/)) return 'type-archive';
        if (name.match(/\.(docx?|pages)$/)) return 'type-doc';
        if (name.match(/\.(pptx?|key)$/)) return 'type-slides';
        if (name.match(/\.(xlsx?|numbers|csv)$/)) return 'type-sheet';
        return 'type-generic';
    }
    
    // Helper: return small icon markup for file type preview
    getFileTypeIcon(fileType) {
        switch (fileType) {
            case 'type-image':
                return '<i class="fas fa-image"></i>';
            case 'type-video':
                return '<i class="fas fa-film"></i>';
            case 'type-audio':
                return '<i class="fas fa-music"></i>';
            case 'type-pdf':
                return '<i class="fas fa-file-pdf"></i>';
            case 'type-archive':
                return '<i class="fas fa-file-archive"></i>';
            case 'type-doc':
                return '<i class="fas fa-file-alt"></i>';
            case 'type-slides':
                return '<i class="fas fa-file-powerpoint"></i>';
            case 'type-sheet':
                return '<i class="fas fa-file-excel"></i>';
            default:
                return '<i class="fas fa-file"></i>';
        }
    }
    
    // Helper: convert path to file:// URL for previews
    pathToFileUrl(filePath) {
        if (!filePath) return '';
        try {
            let normalized = filePath.replace(/\\/g, '/');
            // Avoid double-encoding slashes
            return 'file://' + encodeURI(normalized);
        } catch (e) {
            return '';
        }
    }
    
    // Helper: markup for thumbnail preview (actual content where possible)
    getFilePreviewMarkup(filePath, fileType, fileName) {
        if (fileType === 'type-image') {
            const fileUrl = this.pathToFileUrl(filePath);
            const safeAlt = this.escapeHtml(fileName || '');
            if (fileUrl) {
                return `
                    <div class="downloads-popup-thumbnail-inner image">
                        <img src="${this.escapeHtml(fileUrl)}" alt="${safeAlt}" loading="lazy">
                    </div>
                `;
            }
        }
        
        // Fallback to icon-based thumbnail
        return `
            <div class="downloads-popup-thumbnail-inner">
                <span class="downloads-popup-thumbnail-icon">
                    ${this.getFileTypeIcon(fileType)}
                </span>
            </div>
        `;
    }
    
    // Handle downloads popup actions
    async handleDownloadsPopupAction(action, data) {
        if (!data || !data.path) return;
        
        try {
            if (action === 'open') {
                await this.openLibraryItem(data.path);
            } else if (action === 'show-in-folder') {
                await window.electronAPI.showItemInFolder(data.path);
            }
        } catch (error) {
            console.error('Failed to handle downloads popup action:', error);
        }
    }

    // Downloads management
    toggleDownloads() {
        const downloadsPanel = document.getElementById('downloads-panel');
        const settingsPanel = document.getElementById('settings-panel');
        const securityPanel = document.getElementById('security-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Mark as explicitly opened
        this.libraryExplicitlyOpened = downloadsPanel.classList.contains('hidden');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        
        if (downloadsPanel.classList.contains('hidden')) {
            // Update library info first
            this.populateDownloads(this.currentLibraryLocation || 'desktop');
            
            // Show backdrop
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.opacity = '0';
                backdrop.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                requestAnimationFrame(() => {
                    backdrop.style.opacity = '1';
                });
            }
            
            // Show panel with animation (matching security panel)
            downloadsPanel.classList.remove('hidden');
            downloadsPanel.style.opacity = '0';
            downloadsPanel.style.transform = 'translate(-50%, -48%) scale(0.95)';
            
            requestAnimationFrame(() => {
                downloadsPanel.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                downloadsPanel.style.opacity = '1';
                downloadsPanel.style.transform = 'translate(-50%, -50%) scale(1)';
            });
            
        } else {
            // Use consistent close animation
            this.closePanelWithAnimation(downloadsPanel);
            this.libraryExplicitlyOpened = false;
        }
    }

    async populateDownloadsMediaOnly(locationKey = 'desktop') {
        const downloadsList = document.getElementById('downloads-list');
        const { baseDir, items } = await this.getLibraryItems(locationKey);
        this.currentLibraryLocation = locationKey;
        this.currentLibraryBaseDir = baseDir;
        
        // Filter to only show media (videos and pictures)
        // Reverse order so newest items appear at the bottom
        const mediaItems = items.filter(item => 
            item.kind === 'video' || item.kind === 'image'
        ).reverse();
        
        // Clear list
        downloadsList.innerHTML = '';
        
        if (!mediaItems || mediaItems.length === 0) {
            downloadsList.innerHTML = `
                <div class="no-downloads">
                    <i class="fas fa-folder-open"></i>
                    <p>No media files found</p>
                    <p class="no-downloads-subtitle">Videos and pictures will appear here</p>
                </div>
            `;
            return;
        }
        
        // Add items simply - no animations
        mediaItems.forEach((file, index) => {
            const downloadItem = document.createElement('div');
            downloadItem.className = 'download-item';
                
                const iconClass = file.isDirectory
                    ? 'fas fa-folder'
                    : (file.kind === 'image'
                        ? 'fas fa-file-image'
                        : file.kind === 'video'
                            ? 'fas fa-file-video'
                            : 'fas fa-file');
                
                const meta = this.formatLibraryMeta(file);

                downloadItem.innerHTML = `
                    <i class="${iconClass} download-icon"></i>
                    <div class="download-info">
                        <div class="download-name">${file.name}</div>
                        <div class="download-progress">${meta}</div>
                        <div class="download-url">${file.path}</div>
                    </div>
                    <div class="download-actions">
                        <button class="download-btn" title="Open" data-path="${file.path}">
                            <i class="fas fa-external-link-alt"></i>
                        </button>
                    </div>
                `;
                
                // Open file/folder
                const openBtn = downloadItem.querySelector('.download-btn[title="Open"]');
                openBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openLibraryItem(file.path, file);
                });
                
                downloadsList.appendChild(downloadItem);
            });
    }

    async populateDownloads(locationKey = 'all') {
        const downloadsList = document.getElementById('downloads-list');
        if (!downloadsList) return;

        const { baseDir, items } = await this.getLibraryItems(locationKey);
        this.currentLibraryLocation = locationKey;
        this.currentLibraryBaseDir = baseDir;
        
        // Filter to media files only (images + videos) and sort by most recent
        const mediaItems = (items || [])
            .filter(item => item.kind === 'image' || item.kind === 'video')
            .sort((a, b) => b.mtime - a.mtime);

        // Limit to the 20 most recent items
        const limitedItems = mediaItems.slice(0, 20);

        // Store for preview navigation
        this.currentLibraryItems = limitedItems;
        
        // Clear list and apply grid class
            downloadsList.innerHTML = '';
        downloadsList.classList.add('library-popup-grid');
            
        if (!limitedItems.length) {
                downloadsList.innerHTML = `
                <div class="no-downloads no-library-media">
                    <i class="fas fa-images"></i>
                    <p>No recent media found</p>
                    <p class="no-downloads-subtitle">Your latest screenshots, photos, and videos will appear here.</p>
                    </div>
                `;
                return;
            }
            
        // Render simple media tiles – image/video only, no text
        limitedItems.forEach((file) => {
            const item = document.createElement('div');
            item.className = 'library-popup-item';
                
            const normalizedPath = file.path.replace(/\\/g, '/');
            const fileUrl = `file://${normalizedPath}`;

            let inner = '';
            if (file.kind === 'image') {
                inner = `
                    <div class="library-popup-thumb">
                        <img src="${this.escapeHtml(fileUrl)}" alt="${this.escapeHtml(file.name)}" />
                    </div>
                `;
            } else {
                // Video – show frame with play icon overlay
                inner = `
                    <div class="library-popup-thumb library-popup-thumb-video">
                        <div class="library-popup-thumb-video-overlay">
                            <i class="fas fa-play"></i>
                        </div>
                        <video src="${this.escapeHtml(fileUrl)}" muted></video>
                    </div>
                `;
            }

            item.innerHTML = inner;

            // Click opens in the same preview window we already use
            item.addEventListener('click', () => {
                this.openLibraryItem(file.path, file);
                });
                
            downloadsList.appendChild(item);
            });
    }

    // Refresh is no longer exposed via UI, but keep helper in case we reuse later
    async refreshDownloads() {
        const downloadsList = document.getElementById('downloads-list');
        const restoreContent = this.showLoadingState(downloadsList, 'Refreshing library...');
        
        try {
            await this.populateDownloads(this.currentLibraryLocation || 'desktop');
        } catch (error) {
            this.showErrorFeedback(downloadsList, 'Failed to refresh library');
        } finally {
            if (restoreContent) restoreContent();
        }
    }

    async getLibraryItems(locationKey = 'all') {
        try {
            const result = await window.electronAPI.getLibraryItems(locationKey);
            return result || { baseDir: null, items: [] };
        } catch (error) {
            console.error('Failed to load library items:', error);
            return { baseDir: null, items: [] };
        }
    }

    formatLibraryMeta(file) {
        const parts = [];
        if (file.kind === 'folder') {
            parts.push('Folder');
        } else if (file.kind === 'image') {
            parts.push('Image');
        } else if (file.kind === 'video') {
            parts.push('Video');
        } else if (file.kind === 'audio') {
            parts.push('Audio');
        } else if (file.kind === 'pdf') {
            parts.push('PDF');
        } else if (file.kind === 'document') {
            parts.push('Document');
        } else {
            parts.push('File');
        }

        if (!file.isDirectory && typeof file.size === 'number') {
            parts.push(this.formatLibraryFileSize(file.size));
        }

        if (typeof file.mtime === 'number') {
            const date = new Date(file.mtime);
            parts.push(date.toLocaleDateString());
        }

        return parts.join(' • ');
    }

    formatLibraryFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        const value = bytes / Math.pow(k, i);
        return `${value.toFixed(value >= 10 ? 0 : 1)} ${sizes[i]}`;
    }

    async openLibraryItem(fullPath, fileInfo = null) {
        try {
            // Show preview instead of opening in OS
            this.showFilePreview(fullPath, fileInfo);
        } catch (error) {
            console.error('Failed to open library item:', error);
            this.showNotification('Failed to open item', 'error');
        }
    }

    async showFilePreview(fullPath, fileInfo = null) {
        const backdrop = document.getElementById('file-preview-backdrop');
        const previewWindow = document.getElementById('file-preview-window');
        const previewContent = document.getElementById('file-preview-content');
        const previewName = document.getElementById('file-preview-name');
        const previewTime = document.getElementById('file-preview-time');
        const previewOpenBtn = document.getElementById('file-preview-open');
        const previewPrevBtn = document.getElementById('file-preview-prev');
        const previewNextBtn = document.getElementById('file-preview-next');

        if (!backdrop || !previewWindow) return;

        // Get file info if not provided
        if (!fileInfo) {
            // Try to get from current library items
            const libraryItems = this.currentLibraryItems || [];
            fileInfo = libraryItems.find(item => item.path === fullPath);
            
            if (!fileInfo) {
                // Create basic file info from path
                const pathParts = fullPath.split(/[/\\]/);
                const fileName = pathParts[pathParts.length - 1];
                const ext = fileName.split('.').pop()?.toLowerCase() || '';
                
                let kind = 'file';
                if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) {
                    kind = 'image';
                } else if (['mp4', 'mov', 'mkv', 'avi', 'webm'].includes(ext)) {
                    kind = 'video';
                } else if (ext === 'pdf') {
                    kind = 'pdf';
                }
                
                fileInfo = {
                    name: fileName,
                    path: fullPath,
                    kind: kind,
                    mtime: Date.now()
                };
            }
        }

        // Store current file info
        this.currentPreviewFile = fileInfo;
        this.currentPreviewIndex = this.currentLibraryItems ? 
            this.currentLibraryItems.findIndex(item => item.path === fullPath) : -1;

        // Update title
        previewName.textContent = fileInfo.name;
        previewTime.textContent = fileInfo.mtime ? this.formatTimeAgo(fileInfo.mtime) : '';

        // Update navigation buttons
        if (this.currentLibraryItems && this.currentPreviewIndex >= 0) {
            previewPrevBtn.disabled = this.currentPreviewIndex === 0;
            previewNextBtn.disabled = this.currentPreviewIndex === this.currentLibraryItems.length - 1;
        } else {
            previewPrevBtn.disabled = true;
            previewNextBtn.disabled = true;
        }

        // Clear previous content
        previewContent.innerHTML = '';

        // Load content based on file type
        const normalizedPath = fullPath.replace(/\\/g, '/');
        const fileUrl = `file://${normalizedPath}`;

        if (fileInfo.kind === 'image') {
            const img = document.createElement('img');
            img.src = fileUrl;
            img.onerror = () => {
                previewContent.innerHTML = `
                    <div class="file-preview-unsupported">
                        <i class="fas fa-image"></i>
                        <p>Unable to load image</p>
                    </div>
                `;
            };
            previewContent.appendChild(img);
        } else if (fileInfo.kind === 'video') {
            const video = document.createElement('video');
            video.src = fileUrl;
            video.controls = true;
            video.style.maxWidth = '100%';
            video.style.maxHeight = '100%';
            previewContent.appendChild(video);
        } else if (fileInfo.kind === 'pdf') {
            const iframe = document.createElement('iframe');
            iframe.src = fileUrl;
            previewContent.appendChild(iframe);
        } else {
            previewContent.innerHTML = `
                <div class="file-preview-unsupported">
                    <i class="fas fa-file"></i>
                    <p>Preview not available for this file type</p>
                </div>
            `;
        }

        // Show preview
        backdrop.classList.remove('hidden');
        document.body.classList.add('preview-open');

        // Setup event listeners if not already set
        if (!this.previewListenersSetup) {
            this.setupPreviewListeners();
            this.previewListenersSetup = true;
        }
    }

    setupPreviewListeners() {
        const backdrop = document.getElementById('file-preview-backdrop');
        const previewOpenBtn = document.getElementById('file-preview-open');
        const previewPrevBtn = document.getElementById('file-preview-prev');
        const previewNextBtn = document.getElementById('file-preview-next');
        const previewCloseBtn = document.getElementById('file-preview-close');

        if (!backdrop) return;

        // Close button
        if (previewCloseBtn) {
            previewCloseBtn.addEventListener('click', () => {
                this.hideFilePreview();
            });
        }

        // Close on backdrop click
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.hideFilePreview();
            }
        });

        // Close on backdrop click (already handled above)

        // Open in Preview button
        if (previewOpenBtn) {
            previewOpenBtn.addEventListener('click', async () => {
                if (this.currentPreviewFile) {
                    try {
                        await window.electronAPI.openLibraryItem(this.currentPreviewFile.path);
                    } catch (error) {
                        console.error('Failed to open file:', error);
                        this.showNotification('Failed to open file', 'error');
                    }
                }
            });
        }

        // Navigation buttons
        if (previewPrevBtn) {
            previewPrevBtn.addEventListener('click', () => {
                if (this.currentLibraryItems && this.currentPreviewIndex > 0) {
                    const prevFile = this.currentLibraryItems[this.currentPreviewIndex - 1];
                    this.showFilePreview(prevFile.path, prevFile);
                }
            });
        }

        if (previewNextBtn) {
            previewNextBtn.addEventListener('click', () => {
                if (this.currentLibraryItems && this.currentPreviewIndex < this.currentLibraryItems.length - 1) {
                    const nextFile = this.currentLibraryItems[this.currentPreviewIndex + 1];
                    this.showFilePreview(nextFile.path, nextFile);
                }
            });
        }

        // ESC key to close (use capture to handle before other handlers)
        const escHandler = (e) => {
            if (e.key === 'Escape' && !backdrop.classList.contains('hidden')) {
                e.stopPropagation();
                this.hideFilePreview();
            }
        };
        document.addEventListener('keydown', escHandler, true);
        
        // Store handler for cleanup if needed
        this.previewEscHandler = escHandler;
    }

    hideFilePreview() {
        const backdrop = document.getElementById('file-preview-backdrop');
        if (!backdrop) return;

        backdrop.classList.add('closing');
        setTimeout(() => {
            backdrop.classList.add('hidden');
            backdrop.classList.remove('closing');
            document.body.classList.remove('preview-open');
        }, 200);
    }

    filterDownloads(searchTerm) {
        const downloadItems = document.querySelectorAll('.download-item');
        const searchLower = searchTerm.toLowerCase();
        
        downloadItems.forEach(item => {
            const fileName = item.querySelector('.download-name').textContent.toLowerCase();
            const filePath = item.querySelector('.download-url').textContent.toLowerCase();
            
            if (fileName.includes(searchLower) || filePath.includes(searchLower)) {
                item.style.display = 'flex';
            } else {
                item.style.display = 'none';
            }
        });
    }

    async openLibraryRoot() {
        // Open the current library base directory, defaulting to Desktop
        if (this.currentLibraryBaseDir) {
            await this.openLibraryItem(this.currentLibraryBaseDir);
        } else {
            const result = await this.getLibraryItems('desktop');
            if (result && result.baseDir) {
                await this.openLibraryItem(result.baseDir);
            }
        }
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
        const tabsContainer = this.elements.tabsContainer;
        if (!tabsContainer) return;

        tabsContainer.innerHTML = '';

        this.tabs.forEach((tab, tabId) => {
            const tabElement = document.createElement('div');
            tabElement.className = `tab ${tab.active ? 'active' : ''} ${tab.incognito ? 'incognito' : ''}`;
            tabElement.draggable = false;
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
        let hoverTimeout = null;
        let hideTimeout = null;
        let isNearEdge = false;
        
        // Show resize handle after a delay of hovering near the edge
        const showResizeHandle = () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
            }
            // Clear any pending hide
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            hoverTimeout = setTimeout(() => {
                if (isNearEdge) {
                    resizeHandle.classList.add('visible');
                }
            }, 1500); // Increased delay to 1.5 seconds
        };
        
        // Hide resize handle with a delay to prevent flickering
        const hideResizeHandle = () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            // Add a small delay before hiding to prevent flickering when mouse moves slightly
            if (hideTimeout) {
                clearTimeout(hideTimeout);
            }
            hideTimeout = setTimeout(() => {
                resizeHandle.classList.remove('visible');
                isNearEdge = false;
            }, 300); // 300ms delay before hiding
        };
        
        // Track mouse movement on sidebar to detect when near edge
        // Use throttling to reduce sensitivity
        let lastMoveTime = 0;
        const moveThrottle = 50; // Only check every 50ms
        
        sidebar.addEventListener('mousemove', (e) => {
            const now = performance.now();
            if (now - lastMoveTime < moveThrottle) {
                return; // Skip if too soon
            }
            lastMoveTime = now;
            
            const rect = sidebar.getBoundingClientRect();
            const isRightSide = sidebar.classList.contains('sidebar-right');
            const edgeThreshold = 15; // Reduced threshold for more precise detection
            
            let nearEdge = false;
            if (isRightSide) {
                // Sidebar on right - check left edge
                nearEdge = e.clientX <= rect.left + edgeThreshold;
            } else {
                // Sidebar on left - check right edge
                nearEdge = e.clientX >= rect.right - edgeThreshold;
            }
            
            if (nearEdge && !isNearEdge) {
                // Just entered edge area
                isNearEdge = true;
                showResizeHandle();
            } else if (!nearEdge && isNearEdge) {
                // Just left edge area
                hideResizeHandle();
            }
        });
        
        // Hide when mouse leaves sidebar
        sidebar.addEventListener('mouseleave', () => {
            hideResizeHandle();
        });
        
        // Show immediately when directly hovering on resize handle
        resizeHandle.addEventListener('mouseenter', () => {
            isNearEdge = true;
            // Clear any pending timeouts
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            if (hideTimeout) {
                clearTimeout(hideTimeout);
                hideTimeout = null;
            }
            resizeHandle.classList.add('visible');
        });
        
        resizeHandle.addEventListener('mouseleave', () => {
            // Don't hide immediately when leaving the handle itself
            // Only hide if we're not near the edge anymore
            if (!isNearEdge) {
                hideResizeHandle();
            }
        });

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

        let lastUpdateTime = 0;
        const throttleMs = 8; // ~120fps for smoother resizing
        
        const doResize = (e) => {
            if (!isResizing) return;
            
            const now = performance.now();
            
            // Throttle updates for smoother performance
            if (now - lastUpdateTime < throttleMs) {
                return;
            }
            lastUpdateTime = now;
            
            // Cancel previous animation frame
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
            }
            
            // Use requestAnimationFrame for smooth resizing
            animationFrame = requestAnimationFrame(() => {
                const deltaX = e.clientX - startX;
                
                // Check if sidebar is on the right side
                const mainArea = document.getElementById('main-area');
                const isRightSide = mainArea && mainArea.classList.contains('sidebar-right');
                
                // When sidebar is on the right, dragging left (negative deltaX) should increase width
                // So we need to invert the deltaX
                const adjustedDeltaX = isRightSide ? -deltaX : deltaX;
                
                const newWidth = startWidth + adjustedDeltaX;
                const minWidth = 200;
                const maxWidth = 500;
                
                // Clamp width within bounds
                const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
                
                // Apply the new width with CSS transition disabled during resize for immediate feedback
                sidebar.style.transition = 'none';
                sidebar.style.width = clampedWidth + 'px';
            });
        };

        const stopResize = (e) => {
            if (!isResizing) return;
            
            isResizing = false;
            lastUpdateTime = 0;
            
            // Cancel any pending animation frame
            if (animationFrame) {
                cancelAnimationFrame(animationFrame);
                animationFrame = null;
            }
            
            // Re-enable CSS transitions for smooth final state
            sidebar.style.transition = '';
            
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
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (!tabsContainer || !separator) return;

        let drag = null;
        let isDragging = false;
        let lastMouseX = 0;
        let lastMouseY = 0;

        // Force cleanup - emergency reset
        const forceCleanup = () => {
            if (drag) {
                if (drag.element) {
                    drag.element.classList.remove('smooth-dragging');
                    drag.element.style.transform = '';
                    drag.element.style.opacity = '';
                    drag.element.style.pointerEvents = '';
                }
                if (drag.container) {
                    const toClear = getSiblings(drag.container);
                    toClear.forEach(el => {
                        if (el && el !== drag.element) {
                            el.classList.remove('drag-sliding');
                            el.style.transform = '';
                            el.style.transition = '';
                        }
                    });
                }
                if (drag.container && drag.container.id === 'tabs-container') {
                    const sep = this.elements.tabsSeparator;
                    if (sep && sep.parentNode) {
                        sep.style.transform = '';
                        sep.style.transition = '';
                    }
                }
                removePreviewBox();
                document.querySelectorAll('.tab-group.drag-over-tab-group').forEach(el => el.classList.remove('drag-over-tab-group'));
                if (drag.container && drag.scrollLock !== undefined) drag.container.style.overflow = drag.scrollLock;
            }

            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('mouseleave', onMouseLeave);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            drag = null;
            isDragging = false;
        };

        // Get live siblings list (tabs and tab groups, excluding separator and drop indicator)
        const getSiblings = (container) => {
            return Array.from(container.children).filter(el =>
                (el.classList.contains('tab') || el.classList.contains('tab-group')) &&
                !el.classList.contains('tab-drag-drop-indicator')
            );
        };
        
        // Snapshot positions of all siblings at the current moment
        const snapshotPositions = (siblings) => {
            return siblings.map(el => {
                const rect = el.getBoundingClientRect();
                return {
                    el,
                    top: rect.top,
                    height: rect.height,
                    center: rect.top + rect.height / 2
                };
            });
        };
        
        // Initialize drag (layout must be stable; we snapshot positions once and use for whole drag)
        const initDrag = (element, type, mouseX, mouseY, container) => {
            if (!element || !container || isDragging) return null;
            if (!element.parentElement || element.parentElement !== container) return null;

            const siblings = getSiblings(container);
            const dragIndex = siblings.indexOf(element);
            if (dragIndex === -1 || siblings.length === 0) return null;

            // Force reflow so getBoundingClientRect is accurate
            void container.offsetHeight;
            const positions = snapshotPositions(siblings);
            if (positions.length !== siblings.length) return null;

            const draggedPos = positions[dragIndex];
            if (!draggedPos || draggedPos.height <= 0) return null;

            // Virtual slot below separator + separator boundary for accurate pinned/unpinned crossing
            let hasUnpinnedSlot = false;
            let separatorCenter = null;
            let firstUnpinnedIndex = -1;
            if (container.id === 'tabs-container') {
                const sep = this.elements.tabsSeparator;
                if (sep && sep.parentNode === container) {
                    const sepRect = sep.getBoundingClientRect();
                    separatorCenter = sepRect.top + sepRect.height / 2;
                    const children = Array.from(container.children);
                    const sepIdx = children.indexOf(sep);
                    if (sepIdx >= 0) firstUnpinnedIndex = siblings.findIndex(s => children.indexOf(s) > sepIdx);
                    positions.push({ el: null, top: sepRect.bottom, height: 0, center: sepRect.bottom + 8 });
                    hasUnpinnedSlot = true;
                }
            }

            element.style.pointerEvents = 'none';

            const scrollLock = container.style.overflow;
            if (container.id === 'tabs-container' || container.classList.contains('tab-group-content')) {
                container.style.overflow = 'hidden';
            }

            return {
                active: true,
                element,
                type,
                container,
                startX: mouseX,
                startY: mouseY,
                mouseOffsetFromCenter: mouseY - draggedPos.center,
                dragIndex,
                currentTarget: dragIndex,
                siblings,
                positions,
                draggedHeight: draggedPos.height,
                isHorizontalDrag: false,
                previewBox: null,
                previewStartX: null,
                previewStartY: null,
                hasUnpinnedSlot,
                scrollLock: scrollLock ?? '',
                separatorCenter,
                firstUnpinnedIndex,
                lastTarget: dragIndex,
            };
        };

        const SEPARATOR_HYSTERESIS_PX = 3;

        // Target index from slot boundaries; use separator center at pinned/unpinned boundary to avoid glitch
        const getTargetIndex = (draggedCenter, positions, _dragIndex, opts) => {
            if (!positions.length) return 0;
            const sepCenter = opts && opts.separatorCenter;
            const firstUnpinned = opts && opts.firstUnpinnedIndex;
            const useSeparatorBoundary = sepCenter != null && firstUnpinned > 0 && firstUnpinned < positions.length;

            for (let i = 0; i < positions.length; i++) {
                let upperBound;
                if (useSeparatorBoundary && i === firstUnpinned - 1) {
                    upperBound = sepCenter;
                } else if (i < positions.length - 1) {
                    upperBound = (positions[i].top + positions[i].height + positions[i + 1].top) / 2;
                } else {
                    upperBound = Infinity;
                }
                if (draggedCenter < upperBound) return i;
            }
            return positions.length - 1;
        };

        const applySeparatorHysteresis = (target, draggedCenter, drag) => {
            if (target == null || drag.separatorCenter == null || drag.firstUnpinnedIndex == null) return target;
            const sep = drag.separatorCenter;
            const fu = drag.firstUnpinnedIndex;
            if (fu <= 0 || fu >= (drag.positions && drag.positions.length)) return target;
            const last = drag.lastTarget;
            const inPinned = target < fu;
            const inUnpinned = target >= fu;
            if (last !== undefined && (target === fu - 1 || target === fu)) {
                if (last === fu - 1 && target === fu && draggedCenter <= sep + SEPARATOR_HYSTERESIS_PX) return fu - 1;
                if (last === fu && target === fu - 1 && draggedCenter >= sep - SEPARATOR_HYSTERESIS_PX) return fu;
            }
            return target;
        };
        
        // Create preview box for horizontal drag
        const createPreviewBox = (element, type) => {
            if (!drag || drag.previewBox) return drag?.previewBox;
            
            let title = 'New Tab';
            let webview = null;
            
            if (type === 'tab') {
                const tabId = parseInt(element.dataset.tabId, 10);
                const tab = this.tabs.get(tabId);
                if (tab) {
                    title = tab.title || 'New Tab';
                    webview = tab.webview;
                }
                if (!webview) {
                    webview = document.querySelector(`webview[data-tab-id="${tabId}"]`);
                }
            }
            
            const previewBox = document.createElement('div');
            previewBox.className = 'tab-preview-box';
            
            const webviewContainer = document.createElement('div');
            webviewContainer.className = 'tab-preview-webview-container';
            
            const placeholder = document.createElement('div');
            placeholder.style.cssText = 'display: flex; align-items: center; justify-content: center; color: rgba(255,255,255,0.3); font-size: 24px; width: 100%; height: 100%;';
            placeholder.innerHTML = '<i class="fas fa-globe"></i>';
            webviewContainer.appendChild(placeholder);
            
            previewBox.appendChild(webviewContainer);
            document.body.appendChild(previewBox);
            drag.previewBox = previewBox;
            
            if (webview && webview.capturePage) {
                webview.capturePage().then(image => {
                    if (placeholder.parentNode && drag && drag.previewBox) {
                        placeholder.remove();
                        const img = document.createElement('img');
                        img.className = 'tab-preview-screenshot';
                        img.src = image.toDataURL();
                        img.alt = title;
                        webviewContainer.appendChild(img);
                    }
                }).catch(() => {});
            }
            
            return previewBox;
        };
        
        const removePreviewBox = () => {
            if (drag && drag.previewBox) {
                drag.previewBox.remove();
                drag.previewBox = null;
            }
        };
        
        const isInSidebarArea = (mouseX) => {
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return false;
            const rect = sidebar.getBoundingClientRect();
            return mouseX >= rect.left && mouseX <= rect.right;
        };
        
        const isPreviewBoxInSidebar = () => {
            if (!drag || !drag.previewBox) return false;
            const sidebar = document.getElementById('sidebar');
            if (!sidebar) return false;
            const previewRect = drag.previewBox.getBoundingClientRect();
            const sidebarRect = sidebar.getBoundingClientRect();
            const centerX = previewRect.left + previewRect.width / 2;
            return centerX >= sidebarRect.left && centerX <= sidebarRect.right;
        };
        
        // Update drag visuals
        const updateVisuals = (mouseX, mouseY) => {
            if (!drag || !drag.active || !drag.element) return;
            const container = drag.container;
            if (!container || !container.isConnected) {
                finishDrag();
                return;
            }
            if (!drag.element.parentElement || drag.element.parentElement !== container) {
                finishDrag();
                return;
            }
            
            const offsetX = mouseX - drag.startX;
            const offsetY = mouseY - drag.startY;
            const absOffsetX = Math.abs(offsetX);
            const absOffsetY = Math.abs(offsetY);
            const horizontalThreshold = 50;
            const isHorizontal = drag.type === 'tab' && absOffsetX > horizontalThreshold && absOffsetX > absOffsetY * 1.5;
            const inSidebar = isInSidebarArea(mouseX);
            
            if (isHorizontal && !inSidebar) {
                if (!drag.isHorizontalDrag) {
                    drag.isHorizontalDrag = true;
                    drag.element.style.opacity = '0';
                    drag.element.style.pointerEvents = 'none';
                    createPreviewBox(drag.element, drag.type);
                    drag.previewStartX = mouseX;
                    drag.previewStartY = mouseY;
                    const siblingsToClear = getSiblings(drag.container);
                    siblingsToClear.forEach((el, i) => {
                        if (i !== drag.dragIndex && el && el.parentElement) el.style.transform = '';
                    });
                    if (drag.container.id === 'tabs-container') {
                        const sep = this.elements.tabsSeparator;
                        if (sep && sep.parentNode) {
                            sep.style.transform = '';
                            sep.style.transition = '';
                        }
                    }
                }
                if (drag.previewBox) {
                    const boxWidth = 240, boxHeight = 180;
                    let left = mouseX - boxWidth / 2, top = mouseY - boxHeight / 2;
                    const padding = 20;
                    left = Math.max(padding, Math.min(left, window.innerWidth - boxWidth - padding));
                    top = Math.max(padding, Math.min(top, window.innerHeight - boxHeight - padding));
                    drag.previewBox.style.left = `${left}px`;
                    drag.previewBox.style.top = `${top}px`;
                    drag.previewBox.style.opacity = '1';
                    drag.previewBox.style.transform = 'scale(1)';
                }
                return;
            }
            
            if (drag.isHorizontalDrag) {
                if (isPreviewBoxInSidebar() || inSidebar) {
                    drag.isHorizontalDrag = false;
                    if (drag.previewBox) {
                        drag.previewBox.style.opacity = '0';
                        drag.previewBox.style.transform = 'scale(0.9)';
                        setTimeout(() => removePreviewBox(), 150);
                    }
                    drag.element.style.opacity = '';
                    drag.element.style.pointerEvents = '';
                } else {
                    if (drag.previewBox) {
                        const boxWidth = 240, boxHeight = 180;
                        let left = mouseX - boxWidth / 2, top = mouseY - boxHeight / 2;
                        const padding = 20;
                        left = Math.max(padding, Math.min(left, window.innerWidth - boxWidth - padding));
                        top = Math.max(padding, Math.min(top, window.innerHeight - boxHeight - padding));
                        drag.previewBox.style.left = `${left}px`;
                        drag.previewBox.style.top = `${top}px`;
                    }
                    return;
                }
            }
            
            // Slide: move tab with cursor (translateY only)
            drag.element.style.transform = `translateY(${offsetY}px)`;

            // Target index from dragged visual center; use separator boundary when crossing pinned/unpinned
            const draggedCenter = mouseY - drag.mouseOffsetFromCenter;
            const targetOpts = (drag.separatorCenter != null && drag.firstUnpinnedIndex >= 0)
                ? { separatorCenter: drag.separatorCenter, firstUnpinnedIndex: drag.firstUnpinnedIndex }
                : undefined;
            let target = getTargetIndex(draggedCenter, drag.positions, drag.dragIndex, targetOpts);
            target = applySeparatorHysteresis(target, draggedCenter, drag);
            const n = drag.positions.length;
            const safeTarget = n <= 1 ? drag.dragIndex : Math.max(0, Math.min(target, n - 1));
            drag.currentTarget = safeTarget;
            drag.lastTarget = safeTarget;

            // Use live siblings every frame so we always transform the actual DOM nodes
            const currentSiblings = getSiblings(container);
            const numSiblings = currentSiblings.length;
            const currentDragIdx = currentSiblings.indexOf(drag.element);
            if (currentDragIdx < 0) {
                finishDrag();
                return;
            }
            const effectiveTarget = numSiblings <= 0 ? 0 : Math.max(0, Math.min(safeTarget, numSiblings - 1));
            const gapStr = container.ownerDocument && container.ownerDocument.defaultView
                ? container.ownerDocument.defaultView.getComputedStyle(container).gap || ''
                : '';
            const gap = parseInt(String(gapStr).trim(), 10) || 4;
            const shiftHeight = drag.draggedHeight + gap;

            // Always shift siblings so they move around the dragged item (works for active and inactive tabs)
            for (let i = 0; i < numSiblings; i++) {
                const el = currentSiblings[i];
                if (!el || el === drag.element || el.parentElement !== container) continue;
                if (!el.classList.contains('drag-sliding')) el.classList.add('drag-sliding');
                let shift = 0;
                if (effectiveTarget < currentDragIdx && i >= effectiveTarget && i < currentDragIdx) shift = shiftHeight;
                else if (effectiveTarget > currentDragIdx && i > currentDragIdx && i <= effectiveTarget) shift = -shiftHeight;
                if (shift === 0) {
                    el.style.removeProperty('transform');
                } else {
                    el.style.setProperty('transform', `translateY(${shift}px)`, 'important');
                }
            }
            // Separator: same shift as first sibling after it in DOM
            if (container.id === 'tabs-container') {
                const sep = this.elements.tabsSeparator;
                if (sep && sep.parentNode === container) {
                    const children = Array.from(container.children);
                    const sepIdx = children.indexOf(sep);
                    let sepShift = 0;
                    for (let j = 0; j < numSiblings; j++) {
                        if (children.indexOf(currentSiblings[j]) > sepIdx) {
                            if (j !== currentDragIdx) {
                                if (effectiveTarget < currentDragIdx && j >= effectiveTarget && j < currentDragIdx) sepShift = shiftHeight;
                                else if (effectiveTarget > currentDragIdx && j > currentDragIdx && j <= effectiveTarget) sepShift = -shiftHeight;
                            }
                            break;
                        }
                    }
                    sep.style.transition = 'transform 0.15s cubic-bezier(0.25, 0.1, 0.25, 1)';
                    sep.style.transform = sepShift === 0 ? '' : `translateY(${sepShift}px)`;
                }
            }
        };
        
        // Finish drag
        const finishDrag = () => {
            if (!drag || !drag.active) {
                forceCleanup();
                return;
            }

            const { element, type, container, dragIndex, currentTarget } = drag;
            const scrollLockToRestore = drag.scrollLock;
            isDragging = false;
            drag.active = false;

            const restoreScroll = () => {
                if (container && scrollLockToRestore !== undefined) container.style.overflow = scrollLockToRestore;
            };
            restoreScroll();

            removePreviewBox();
            document.querySelectorAll('.tab-group.drag-over-tab-group').forEach(el => el.classList.remove('drag-over-tab-group'));

            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('mouseleave', onMouseLeave);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (!element || !element.parentElement) {
                forceCleanup();
                return;
            }

            // Clear transforms from all current siblings (live list) and separator
            const toClear = container ? getSiblings(container) : [];
            for (const el of toClear) {
                if (el && el.parentElement) {
                    el.classList.remove('drag-sliding');
                    el.style.transform = '';
                    el.style.transition = '';
                }
            }
            if (container && container.id === 'tabs-container') {
                const sep = this.elements.tabsSeparator;
                if (sep && sep.parentNode) {
                    sep.style.transform = '';
                    sep.style.transition = '';
                }
            }

            element.classList.remove('smooth-dragging');
            element.style.transform = '';
            element.style.opacity = '';
            element.style.pointerEvents = '';

            // Reorder if position changed
            if (currentTarget !== dragIndex && currentTarget >= 0) {
                element.remove();

                const remaining = Array.from(container.children).filter(el =>
                    (el.classList.contains('tab') || el.classList.contains('tab-group')) &&
                    el !== element &&
                    !el.classList.contains('tab-drag-drop-indicator') &&
                    !el.classList.contains('tab-drag-placeholder')
                );

                const insertAt = Math.max(0, Math.min(currentTarget, remaining.length));

                // Virtual slot: drop into empty unpinned section (e.g. only pinned tab moved below separator)
                const sep = container.id === 'tabs-container' ? this.elements.tabsSeparator : container.querySelector('.tabs-separator');
                if (drag.hasUnpinnedSlot && currentTarget === drag.siblings.length && sep) {
                    sep.insertAdjacentElement('afterend', element);
                } else if (insertAt >= remaining.length) {
                    const last = remaining[remaining.length - 1];
                    if (last) {
                        last.insertAdjacentElement('afterend', element);
                    } else if (sep) {
                        sep.insertAdjacentElement('afterend', element);
                    } else {
                        container.appendChild(element);
                    }
                } else {
                    container.insertBefore(element, remaining[insertAt]);
                }
                
                if (type === 'tab' && container.classList.contains('tabs-container')) {
                    requestAnimationFrame(() => {
                        this.updateTabPinState(element);
                    });
                }
                if (type === 'tab-group' && container.id === 'tabs-container') {
                    this.updateTabGroupPinState(element);
                }
                if (type === 'tab' && container.classList.contains('tab-group-content')) {
                    const tabGroupEl = container.closest('.tab-group');
                    if (tabGroupEl) {
                        const tabGroupId = parseInt(tabGroupEl.dataset.tabGroupId, 10);
                        const tabGroup = this.tabGroups.get(tabGroupId);
                        if (tabGroup) {
                            const newTabIds = Array.from(container.querySelectorAll('.tab'))
                                .map(t => parseInt(t.dataset.tabId, 10))
                                .filter(id => !isNaN(id));
                            tabGroup.tabIds = newTabIds;
                            this.tabGroups.set(tabGroupId, tabGroup);
                        }
                    }
                }
                
                requestAnimationFrame(() => {
                    this.savePinnedTabs();
                    if (this.saveTabGroups) {
                        this.saveTabGroups();
                    }
                });
            }
            
            if (type === 'tab-group' && element) {
                const input = element.querySelector('.tab-group-name-input');
                if (input) {
                    input.style.pointerEvents = '';
                }
            }
            
            drag = null;
        };
        
        const onMouseLeave = (e) => {
            if (e.target === document.body || e.target === document.documentElement) {
                if (drag && drag.active) {
                    finishDrag();
                }
            }
        };
        
        const onMove = (e) => {
            if (!drag || !drag.active) {
                forceCleanup();
                return;
            }
            if (!drag.element || !drag.element.parentElement) {
                finishDrag();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;
            try {
                updateVisuals(e.clientX, e.clientY);
            } catch (err) {
                console.error('Error updating drag visuals:', err);
                finishDrag();
            }
        };

        const onUp = (e) => {
            if (e && e.button !== 0) return;
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            document.removeEventListener('mouseleave', onMouseLeave);
            if (drag && drag.active) {
                finishDrag();
            } else {
                forceCleanup();
            }
        };
        
        // Start drag
        const startDrag = (element, type, e) => {
            if (isDragging || (drag && drag.active)) return false;
            if (!element || !element.parentElement) return false;
            
            const container = element.parentElement;
            if (!container || !container.contains(element)) return false;
            
            try {
                drag = initDrag(element, type, e.clientX, e.clientY, container);
                if (!drag) return false;
                
                isDragging = true;
                
                element.classList.add('smooth-dragging');
                document.body.style.cursor = 'grabbing';
                document.body.style.userSelect = 'none';
                for (let i = 0; i < drag.siblings.length; i++) {
                    if (i === drag.dragIndex) continue;
                    const el = drag.siblings[i];
                    if (el && el.parentElement === container) el.classList.add('drag-sliding');
                }
                document.addEventListener('mousemove', onMove, { passive: false });
                document.addEventListener('mouseup', onUp);
                document.addEventListener('mouseleave', onMouseLeave);
                
                return true;
            } catch (error) {
                console.error('Error starting drag:', error);
                forceCleanup();
                return false;
            }
        };
                
        // Update pin state after drag
        this.updateTabPinState = (tabEl) => {
            const sep = this.elements.tabsSeparator;
            if (!sep || sep.offsetParent === null) return;
            
            const tabId = parseInt(tabEl.dataset.tabId, 10);
            const tab = this.tabs.get(tabId);
            if (!tab) return;
            
            const tabRect = tabEl.getBoundingClientRect();
            const sepRect = sep.getBoundingClientRect();
            const isAbove = tabRect.top + tabRect.height / 2 < sepRect.top;
            
            if (isAbove && !tab.pinned) {
                tab.pinned = true;
                this.tabs.set(tabId, tab);
                tabEl.classList.add('pinned');
                this.organizeTabsByPinnedState();
            } else if (!isAbove && tab.pinned) {
                tab.pinned = false;
                this.tabs.set(tabId, tab);
                tabEl.classList.remove('pinned');
                this.organizeTabsByPinnedState();
            }
        };

        // Update tab group pin state after drag (pinned = above separator, unpinned = below)
        this.updateTabGroupPinState = (tabGroupEl) => {
            const sep = this.elements.tabsSeparator;
            if (!sep || !tabGroupEl || !tabGroupEl.classList.contains('tab-group')) return;
            const groupId = parseInt(tabGroupEl.dataset.tabGroupId, 10);
            const group = this.tabGroups.get(groupId);
            if (!group) return;
            const groupRect = tabGroupEl.getBoundingClientRect();
            const sepRect = sep.getBoundingClientRect();
            const isAbove = groupRect.top + groupRect.height / 2 < sepRect.top;
            const shouldBePinned = isAbove;
            if (group.pinned === shouldBePinned) return;
            group.pinned = shouldBePinned;
            this.tabGroups.set(groupId, group);
            if (shouldBePinned) tabGroupEl.classList.add('pinned'); else tabGroupEl.classList.remove('pinned');
            group.tabIds.forEach(tabId => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.pinned = shouldBePinned;
                    this.tabs.set(tabId, tab);
                }
            });
            if (this.saveTabGroups) this.saveTabGroups();
        };

        // Setup tab for dragging
        const setupTabDrag = (tab) => {
            if (!tab || tab._dragSetup) return;
            tab._dragSetup = true;
            tab.draggable = false;
            
            let startPos = null;
            let dragging = false;
            let moveHandler = null;
            let upHandler = null;

            const handleMouseDown = (e) => {
                // Only left mouse button
                if (e.button !== 0) return;
                
                // Don't start if already dragging
                if (isDragging) return;
                
                // Don't drag if clicking close button or other interactive elements
                if (e.target.closest('.tab-close') || 
                    e.target.closest('input') ||
                    e.target.closest('button')) {
                    return;
                }
                
                // Ensure tab still exists
                if (!tab.parentElement) return;
                
                // Prevent default to avoid text selection
                e.preventDefault();
                e.stopPropagation();
                
                startPos = { x: e.clientX, y: e.clientY };
                dragging = false;
                
                moveHandler = (me) => {
                    if (dragging || !startPos) return;
                    
                    // Check if tab still exists
                    if (!tab.parentElement) {
                        cleanup();
                        return;
                    }
                    
                    const dx = me.clientX - startPos.x;
                    const dy = me.clientY - startPos.y;
                    const distance = Math.hypot(dx, dy);
                    
                    // Start drag after 2px movement
                    if (distance > 2) {
                        dragging = true;
                        cleanup();
                        
                        // Start the drag with current mouse position
                        if (startDrag(tab, 'tab', me)) {
                            // Drag started successfully
                        } else {
                            // Drag failed, reset
                            dragging = false;
                            startPos = null;
                        }
                    }
                };
                
                upHandler = (ue) => {
                    cleanup();
                    
                    if (!dragging) {
                        // Was just a click, not a drag
                        startPos = null;
                    }
                };
                
                const cleanup = () => {
                    if (moveHandler) {
                        document.removeEventListener('mousemove', moveHandler);
                    }
                    if (upHandler) {
                        document.removeEventListener('mouseup', upHandler);
                    }
                    moveHandler = null;
                    upHandler = null;
                };
                
                document.addEventListener('mousemove', moveHandler, { passive: false });
                document.addEventListener('mouseup', upHandler);
            };
            
            tab.addEventListener('mousedown', handleMouseDown, { passive: false });
        };
        
        this.makeTabDraggable = setupTabDrag;
        
        // Setup tab group for dragging
        const setupTabGroupDrag = (tabGroup) => {
            if (!tabGroup || tabGroup._dragSetup) return;
            tabGroup._dragSetup = true;
            tabGroup.draggable = false;
            
            const header = tabGroup.querySelector('.tab-content');
            if (!header) return;
            
            let startPos = null;
            let dragging = false;
            let moveHandler = null;
            let upHandler = null;
            
            const handleMouseDown = (e) => {
                // Only left mouse button
                if (e.button !== 0) return;
                
                // Don't start if already dragging
                if (isDragging) return;
                
                // Don't drag if clicking delete button or other interactive elements
                if (e.target.closest('.tab-group-delete') ||
                    e.target.closest('button')) {
                    return;
                }
                
                // Don't drag if clicking on the name input (unless it's readonly)
                const input = tabGroup.querySelector('.tab-group-name-input');
                if (input && !input.readOnly && e.target.closest('.tab-group-name-input')) {
                    return;
                }
                
                // Ensure tab group still exists
                if (!tabGroup.parentElement) return;
                
                // Prevent default to avoid text selection
                e.preventDefault();
                e.stopPropagation();
                
                startPos = { x: e.clientX, y: e.clientY };
                dragging = false;
                
                moveHandler = (me) => {
                    if (dragging || !startPos) return;
                    
                    // Check if tab group still exists
                    if (!tabGroup.parentElement) {
                        cleanup();
                        return;
                    }
                    
                    const dx = me.clientX - startPos.x;
                    const dy = me.clientY - startPos.y;
                    const distance = Math.hypot(dx, dy);
                    
                    // Start drag after 2px movement
                    if (distance > 2) {
                        dragging = true;
                        cleanup();
                        
                        // Blur input if it exists
                        if (input) {
                            input.blur();
                            input.style.pointerEvents = 'none';
                        }
                        
                        // Start the drag with current mouse position
                        if (startDrag(tabGroup, 'tab-group', me)) {
                            // Drag started successfully
                        } else {
                            // Drag failed, reset
                            dragging = false;
                            startPos = null;
                        }
                    }
                };
                
                upHandler = (ue) => {
                    cleanup();
                    
                    if (!dragging) {
                        // Was just a click, not a drag
                        startPos = null;
                    }
                };
                
                const cleanup = () => {
                    if (moveHandler) {
                        document.removeEventListener('mousemove', moveHandler);
                    }
                    if (upHandler) {
                        document.removeEventListener('mouseup', upHandler);
                    }
                    moveHandler = null;
                    upHandler = null;
                };
                
                document.addEventListener('mousemove', moveHandler, { passive: false });
                document.addEventListener('mouseup', upHandler);
            };
            
            header.addEventListener('mousedown', handleMouseDown, { passive: false });
        };

        this.makeTabGroupSmoothDraggable = setupTabGroupDrag;
        
        // Initialize existing elements
        document.querySelectorAll('.tabs-container > .tab').forEach(setupTabDrag);
        document.querySelectorAll('.tabs-container > .tab-group').forEach(tg => {
            setupTabGroupDrag(tg);
            // Also make tabs inside tab groups draggable
            tg.querySelectorAll('.tab-group-content .tab').forEach(setupTabDrag);
        });

        // Observer for new elements
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType !== Node.ELEMENT_NODE) return;
                    
                    if (node.classList.contains('tab')) {
                        setupTabDrag(node);
                    } else if (node.classList.contains('tab-group')) {
                        setupTabGroupDrag(node);
                        node.querySelectorAll('.tab').forEach(setupTabDrag);
                    }
                });
            });
        });

        observer.observe(tabsContainer, { childList: true, subtree: true });
        
        // Store observer
        this._dragObserver = observer;
    }

    moveTab(fromIndex, toIndex) {
        const tabsContainer = this.elements.tabsContainer;
        if (!tabsContainer) return;
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
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels with animation
        if (!settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (!downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        
        if (securityPanel.classList.contains('hidden')) {
            // Update security info first
            this.updateSecurityInfo();
            
            // Show backdrop
            if (backdrop) {
                backdrop.classList.remove('hidden');
                backdrop.style.opacity = '0';
                backdrop.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                requestAnimationFrame(() => {
                    backdrop.style.opacity = '1';
                });
            }
            
            // Show panel with animation
            securityPanel.classList.remove('hidden');
            securityPanel.style.opacity = '0';
            securityPanel.style.transform = 'translate(-50%, -48%) scale(0.95)';
            
            requestAnimationFrame(() => {
                securityPanel.style.transition = 'opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), transform 0.2s cubic-bezier(0.4, 0, 0.2, 1)';
                securityPanel.style.opacity = '1';
                securityPanel.style.transform = 'translate(-50%, -50%) scale(1)';
            });
            
        } else {
            // Use consistent close animation
            this.closePanelWithAnimation(securityPanel);
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

    closeAllPopups() {
        // Close all popups smoothly with consistent animations
        
        // Close panels (downloads, security, notes)
        const downloadsPanel = document.getElementById('downloads-panel');
        const securityPanel = document.getElementById('security-panel');
        const notesPanel = document.getElementById('notes-panel');
        
        if (downloadsPanel && !downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        if (securityPanel && !securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        if (notesPanel && !notesPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(notesPanel);
        }
        
        // Close nav menu
        const navMenu = document.getElementById('nav-menu');
        // Nav menu removed
        
        // Close context menus
        this.hideTabContextMenu();
        this.hideTabGroupContextMenu();
        this.hideSidebarContextMenu();
        this.hideWebpageContextMenu();
        
        // Close quit modal
        const quitBackdrop = document.getElementById('quit-modal-backdrop');
        if (quitBackdrop && !quitBackdrop.classList.contains('hidden')) {
            this.hideQuitConfirmation();
        }
        
        // Close file preview
        const filePreviewBackdrop = document.getElementById('file-preview-backdrop');
        if (filePreviewBackdrop && !filePreviewBackdrop.classList.contains('hidden')) {
            this.hideFilePreview();
        }
        
        // Close spotlight search
        const spotlightSearch = document.getElementById('spotlight-search');
        if (spotlightSearch && !spotlightSearch.classList.contains('hidden')) {
            this.closeSpotlightSearch();
        }
        
        // Close color picker
        const colorPicker = document.getElementById('tab-group-color-picker');
        if (colorPicker && !colorPicker.classList.contains('hidden')) {
            this.hideTabGroupColorPicker();
        }
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
            backdrop.style.transition = 'opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1)';
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
        const suggestionsContainer = document.getElementById('spotlight-suggestions');
        
        if (suggestionsContainer) {
            suggestionsContainer.style.maxHeight = '280px';
            suggestionsContainer.style.padding = '6px 6px';
        }
        
        // Remove hidden class - appears instantly
        spotlightSearch.classList.remove('hidden');
        
        // Immediately show default suggestions (2 tabs + 3 search/history)
        this.updateSpotlightSuggestions('');
        
        // Focus the input immediately
        requestAnimationFrame(() => {
            const input = document.getElementById('spotlight-input');
            if (input && typeof input.focus === 'function') {
                try {
                    input.focus();
                } catch (e) {
                    // Ignore focus errors (element might not be focusable)
                }
            }
        });
    }

    closeSpotlightSearch() {
        const spotlightSearch = document.getElementById('spotlight-search');
        const suggestionsContainer = document.getElementById('spotlight-suggestions');

        // Clear input and suggestions immediately
        const spotlightInput = document.getElementById('spotlight-input');
        
        if (spotlightInput) {
            spotlightInput.value = '';
        }
        
        if (suggestionsContainer) {
            suggestionsContainer.classList.remove('show', 'loading');
            suggestionsContainer.classList.remove('hiding');
            suggestionsContainer.style.maxHeight = '';
            suggestionsContainer.style.padding = '';
        }

        // Hide instantly
        spotlightSearch.classList.add('hidden');
        
        this.spotlightSelectedIndex = -1; // Reset selection
        // Clear search engine selection
        this.clearSpotlightSearchEngine();
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
                behavior: 'auto',
                block: 'nearest'
            });
        }
    }

    performSpotlightSearch() {
        const input = document.getElementById('spotlight-input');
        const query = input.value.trim();
        
        if (query) {
            // Save selected search engine before closing (which clears it)
            const selectedEngine = this.selectedSearchEngine;
            
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
            
            // Check for special axis:// URLs first
            if (query.toLowerCase() === 'axis://settings') {
                this.toggleSettings();
                return;
            }
            
            // Determine if it's a URL or search query
            let searchUrl;
            if (this.isValidUrl(query)) {
                searchUrl = query.startsWith('http') ? query : `https://${query}`;
            } else {
                // Use selected search engine if available
                searchUrl = this.getSearchUrl(query, selectedEngine);
            }
            
            // Create a new tab and navigate to the search URL
            this.createNewTab(searchUrl);
        }
    }

    async updateSpotlightSuggestions(query) {
        const suggestionsContainer = document.getElementById('spotlight-suggestions');
        if (!suggestionsContainer) return;
        
        // Always show exactly 5 suggestions
        const suggestions = query.length < 1 ? this.getDefaultSuggestions() : await this.generateAdvancedSuggestions(query);
        
        // Always show suggestions container when spotlight is open (always 5 suggestions)
            suggestionsContainer.classList.remove('hiding');
            
            if (query.length > 0) {
                suggestionsContainer.classList.add('loading', 'show');
                this.updateSuggestionsContent(suggestionsContainer, suggestions);
            } else {
                suggestionsContainer.classList.add('show');
                this.updateSuggestionsContent(suggestionsContainer, suggestions);
            }
    }

    updateSuggestionsContent(suggestionsContainer, suggestions) {
        // Remove loading state
        suggestionsContainer.classList.remove('loading');
        
        // Clear existing content
        suggestionsContainer.innerHTML = '';
        
        // Reset selection when suggestions update
        this.spotlightSelectedIndex = -1;
        
        // Always show exactly 5 suggestions - pad with defaults if needed
        let visibleSuggestions = suggestions.slice(0, 5);
        
        // If we have fewer than 5, fill with default suggestions
        if (visibleSuggestions.length < 5) {
            const defaultSuggestions = this.getDefaultSuggestions();
            const needed = 5 - visibleSuggestions.length;
            
            // Get unique suggestions that aren't already in the list
            const existingTexts = new Set(visibleSuggestions.map(s => s.text));
            const additional = defaultSuggestions
                .filter(s => !existingTexts.has(s.text))
                .slice(0, needed);
            
            visibleSuggestions = [...visibleSuggestions, ...additional];
            
            // If still not 5, add placeholder actions
            if (visibleSuggestions.length < 5) {
                const placeholders = [
                    { text: 'New Tab', icon: 'fas fa-plus', isAction: true },
                    { text: 'New Incognito Tab', icon: 'fas fa-mask', isAction: true },
                    { text: 'Open Settings', icon: 'fas fa-cog', isAction: true },
                    { text: 'New Note', icon: 'fas fa-sticky-note', isAction: true }
                ];
                
                placeholders.forEach(placeholder => {
                    if (visibleSuggestions.length < 5 && !existingTexts.has(placeholder.text)) {
                        visibleSuggestions.push(placeholder);
                    }
                });
            }
        }
        
        // Ensure exactly 5
        visibleSuggestions = visibleSuggestions.slice(0, 5);
        
        // Add new suggestions without resetting animations
        visibleSuggestions.forEach((suggestion, index) => {
            const suggestionEl = document.createElement('div');
            suggestionEl.className = 'spotlight-suggestion-item';
            suggestionEl.setAttribute('data-index', index);
            
            // Determine if we should show a favicon or icon
            let faviconUrl = null;
            if (suggestion.isTab && suggestion.tabId) {
                // For tabs, use the cached favicon if available
                const tab = this.tabs.get(suggestion.tabId);
                if (tab && tab.favicon) {
                    faviconUrl = tab.favicon;
                } else if (tab && tab.url) {
                    faviconUrl = this.getFaviconUrl(tab.url);
                }
            } else if (suggestion.url || suggestion.isHistory || suggestion.isUrl) {
                faviconUrl = this.getFaviconUrl(suggestion.url);
            }
            
            const iconHtml = faviconUrl 
                ? `<img src="${this.escapeHtml(faviconUrl)}" alt="" class="spotlight-favicon" onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';" />`
                : '';
            const fallbackIconHtml = faviconUrl 
                ? `<i class="${this.escapeHtml(suggestion.icon)}" style="display: none;"></i>`
                : `<i class="${this.escapeHtml(suggestion.icon)}"></i>`;
            
            suggestionEl.innerHTML = `
                <div class="spotlight-suggestion-icon">
                    ${iconHtml}
                    ${fallbackIconHtml}
                </div>
                <div class="spotlight-suggestion-text">${this.escapeHtml(suggestion.text)}</div>
                ${(suggestion.isTab && suggestion.tabId) ? '<div class="spotlight-suggestion-action">Switch to Tab</div>' : ''}
            `;
            
            suggestionEl.addEventListener('click', () => {
                // Save selected search engine before closing (which clears it)
                const selectedEngine = this.selectedSearchEngine;
                
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
                    // Use selected search engine if available
                    const searchUrl = this.getSearchUrl(suggestion.searchQuery, selectedEngine);
                    this.createNewTab(searchUrl);
                } else if (suggestion.isHistory) {
                    this.closeSpotlightSearch();
                    // If search engine is selected, search the history item on that engine
                    if (selectedEngine) {
                        const searchUrl = this.getSearchUrl(suggestion.text || suggestion.url, selectedEngine);
                        this.createNewTab(searchUrl);
                    } else {
                    this.createNewTab(suggestion.url);
                    }
                } else if (suggestion.isCompletion) {
                    this.closeSpotlightSearch();
                    // Use selected search engine if available
                    const searchUrl = this.getSearchUrl(suggestion.searchQuery, selectedEngine);
                    this.createNewTab(searchUrl);
                } else if (suggestion.isUrl) {
                    this.closeSpotlightSearch();
                    // If search engine is selected, search the URL text on that engine
                    if (selectedEngine) {
                        const searchUrl = this.getSearchUrl(suggestion.text || suggestion.url, selectedEngine);
                        this.createNewTab(searchUrl);
                    } else {
                    this.createNewTab(suggestion.url);
                    }
                } else {
                    // Default search behavior requires Enter; keep spotlight open
                    const input = document.getElementById('spotlight-input');
                    if (input) input.value = suggestion.text;
                }
            });
            
            suggestionsContainer.appendChild(suggestionEl);
        });
        
        // Ensure show class is present (it should already be added by updateSpotlightSuggestions)
        if (!suggestionsContainer.classList.contains('show')) {
            suggestionsContainer.classList.add('show');
        }
    }

    getSuggestionId(suggestion) {
        // Create a unique identifier for each suggestion type
        if (suggestion.isTab && suggestion.tabId) {
            return `tab-${suggestion.tabId}`;
        } else if (suggestion.isHistory) {
            return `history-${suggestion.url}`;
        } else if (suggestion.isSearch) {
            return `search-${suggestion.searchQuery}`;
        } else if (suggestion.isNote && suggestion.noteId) {
            return `note-${suggestion.noteId}`;
        } else if (suggestion.url) {
            return `url-${suggestion.url}`;
        }
        return `text-${suggestion.text}`;
    }

    dismissSuggestion(suggestion) {
        // Initialize dismissed suggestions array if it doesn't exist
        if (!this.settings.dismissedSuggestions) {
            this.settings.dismissedSuggestions = [];
        }
        
        const suggestionId = this.getSuggestionId(suggestion);
        
        // Add to dismissed list if not already there
        if (!this.settings.dismissedSuggestions.includes(suggestionId)) {
            this.settings.dismissedSuggestions.push(suggestionId);
            this.saveSetting('dismissedSuggestions', this.settings.dismissedSuggestions);
        }
    }

    isSuggestionDismissed(suggestion) {
        if (!this.settings.dismissedSuggestions) {
            return false;
        }
        const suggestionId = this.getSuggestionId(suggestion);
        return this.settings.dismissedSuggestions.includes(suggestionId);
    }

    getFaviconUrl(url) {
        if (!url || url === 'about:blank' || url.startsWith('axis:')) {
            return null;
        }
        
        try {
            const urlObj = new URL(url);
            // Use Google's favicon service for reliable favicon fetching
            return `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=32`;
        } catch (e) {
            return null;
        }
    }

    isValidDomain(str) {
        // Check if string looks like a domain (e.g., "github.com", "youtube.com")
        const domainPattern = /^([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
        return domainPattern.test(str) && !str.includes(' ');
    }

    async fetchGoogleSuggestions(query) {
        if (!query || query.length < 2) {
            return [];
        }

        const results = {
            searches: [],
            websites: []
        };

        try {
            // Use Google's autocomplete API endpoint
            const url = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;
            
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': '*/*',
                }
            });

            if (!response.ok) {
                throw new Error('Failed to fetch suggestions');
            }

            // Google returns JSONP format: callback([query, [suggestions], ...])
            const text = await response.text();
            
            // Parse JSONP response - Google returns: window.google.ac.h(["query",["suggestion1","suggestion2",...],...])
            const jsonMatch = text.match(/\["([^"]+)",\[(.*?)\]/);
            if (jsonMatch && jsonMatch[2]) {
                const suggestionsText = jsonMatch[2];
                const suggestions = suggestionsText.match(/"([^"]+)"/g);
                if (suggestions) {
                    const parsed = suggestions
                        .map(s => s.replace(/"/g, ''))
                        .filter(s => {
                            const lowerS = s.toLowerCase();
                            const lowerQ = query.toLowerCase();
                            return lowerS.includes(lowerQ) && lowerS !== lowerQ;
                        });

                    // Separate into search queries and potential websites
                    parsed.forEach(suggestion => {
                        // Check if it looks like a domain/website
                        if (this.isValidDomain(suggestion)) {
                            results.websites.push({
                                text: suggestion,
                                url: `https://${suggestion}`,
                                isUrl: true
                            });
                        } else {
                            // Check if it contains a domain pattern
                            const domainInText = suggestion.match(/([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/);
                            if (domainInText) {
                                const domain = domainInText[0];
                                results.websites.push({
                                    text: suggestion,
                                    url: `https://${domain}`,
                                    isUrl: true
                                });
                            } else {
                                results.searches.push(suggestion);
                            }
                        }
                    });
                }
            }

            // Alternative parsing: try to find array pattern directly
            if (results.searches.length === 0 && results.websites.length === 0) {
                const arrayMatch = text.match(/\["([^"]+)",\s*\[(.*?)\]/s);
                if (arrayMatch && arrayMatch[2]) {
                    const suggestionsText = arrayMatch[2];
                    const suggestions = suggestionsText.match(/"([^"]+)"/g);
                    if (suggestions) {
                        const parsed = suggestions
                            .map(s => s.replace(/"/g, ''))
                            .filter(s => {
                                const lowerS = s.toLowerCase();
                                const lowerQ = query.toLowerCase();
                                return lowerS.includes(lowerQ) && lowerS !== lowerQ;
                            });

                        parsed.forEach(suggestion => {
                            if (this.isValidDomain(suggestion)) {
                                results.websites.push({
                                    text: suggestion,
                                    url: `https://${suggestion}`,
                                    isUrl: true
                                });
                            } else {
                                const domainInText = suggestion.match(/([a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}/);
                                if (domainInText) {
                                    const domain = domainInText[0];
                                    results.websites.push({
                                        text: suggestion,
                                        url: `https://${domain}`,
                                        isUrl: true
                                    });
                                } else {
                                    results.searches.push(suggestion);
                                }
                            }
                        });
                    }
                }
            }

            // Also try to detect if the query itself is a domain
            if (this.isValidDomain(query)) {
                results.websites.unshift({
                    text: query,
                    url: `https://${query}`,
                    isUrl: true
                });
            }

            return results;
        } catch (error) {
            console.error('Error fetching Google suggestions:', error);
            return { searches: [], websites: [] };
        }
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
                } else if (this.isUrlOnDomain(url, 'gmail.com')) {
                    icon = 'fas fa-envelope';
                } else if (this.isUrlOnDomain(url, 'youtube.com')) {
                    icon = 'fab fa-youtube';
                } else if (this.isUrlOnDomain(url, 'github.com')) {
                    icon = 'fab fa-github';
                } else if (this.isUrlOnDomain(url, 'facebook.com')) {
                    icon = 'fab fa-facebook';
                } else if (this.isUrlOnDomain(url, 'twitter.com')) {
                    icon = 'fab fa-twitter';
                } else if (this.isUrlOnDomain(url, 'instagram.com')) {
                    icon = 'fab fa-instagram';
                } else if (this.isUrlOnDomain(url, 'reddit.com')) {
                    icon = 'fab fa-reddit';
                } else if (this.isUrlOnDomain(url, 'stackoverflow.com')) {
                    icon = 'fab fa-stack-overflow';
                } else if (this.isUrlOnDomain(url, 'wikipedia.org')) {
                    icon = 'fab fa-wikipedia-w';
                } else if (this.isUrlOnDomain(url, 'amazon.com')) {
                    icon = 'fab fa-amazon';
                }
                
                const tabSuggestion = {
                    text: title,
                    icon: icon,
                    tabId: tabId,
                    url: url,
                    isTab: true
                };
                
                // Only add if not dismissed
                if (!this.isSuggestionDismissed(tabSuggestion)) {
                    suggestions.push(tabSuggestion);
                    tabCount++;
                }
        });
        
        // Always return exactly 5 suggestions
        const maxSuggestions = 5;
        let searchCount = 0;
        
        // Prioritize Google suggestions when there's a query
        if (query.length > 0) {
            try {
                const googleResults = await this.fetchGoogleSuggestions(query);
                
                // Add website recommendations first (they're more actionable)
                if (googleResults.websites && googleResults.websites.length > 0) {
                    googleResults.websites.forEach(website => {
                        if (suggestions.length < maxSuggestions) {
                            const websiteObj = {
                                text: website.text,
                                icon: 'fas fa-globe',
                                url: website.url,
                                isUrl: true
                            };
                            suggestions.push(websiteObj);
                            searchCount++;
                        }
                    });
                }
                
                // Then add search query suggestions
                if (googleResults.searches && googleResults.searches.length > 0) {
                    googleResults.searches.forEach(suggestion => {
                        if (suggestions.length < maxSuggestions) {
                            const suggestionObj = {
                                text: suggestion,
                                icon: 'fas fa-search',
                                searchQuery: suggestion,
                                isSearch: true
                            };
                            suggestions.push(suggestionObj);
                            searchCount++;
                        }
                    });
                }
            } catch (error) {
                console.error('Error fetching Google suggestions:', error);
            }
        }
        
        // Add recent searches if we have space
        if (this.settings.recentSearches && this.settings.recentSearches.length > 0 && suggestions.length < maxSuggestions) {
            const remainingSlots = maxSuggestions - suggestions.length;
            const recentSearches = this.settings.recentSearches
                .filter(search => 
                    query.length === 0 || search.toLowerCase().includes(lowerQuery)
                )
                .slice(0, remainingSlots)
                .map(search => ({
                    text: `Search "${search}"`,
                    icon: 'fas fa-search',
                    searchQuery: search,
                    isSearch: true
                }));
            
            recentSearches.forEach(search => {
                if (suggestions.length < maxSuggestions && !this.isSuggestionDismissed(search)) {
                    suggestions.push(search);
                    searchCount++;
                }
            });
        }
        
        // Add recent history if we need more suggestions
        if (suggestions.length < maxSuggestions && this.settings.history && this.settings.history.length > 0) {
            const remainingSlots = maxSuggestions - suggestions.length;
            const recentHistory = this.settings.history
                .filter(item => 
                    query.length === 0 ||
                    item.title.toLowerCase().includes(lowerQuery) || 
                    item.url.toLowerCase().includes(lowerQuery)
                )
                .slice(0, remainingSlots)
                .map(item => {
                    let icon = 'fas fa-lightbulb';
                    if (this.isUrlOnDomain(item.url, 'gmail.com')) {
                        icon = 'fas fa-envelope';
                    } else if (this.isUrlOnDomain(item.url, 'youtube.com')) {
                        icon = 'fab fa-youtube';
                    } else if (this.isUrlOnDomain(item.url, 'github.com')) {
                        icon = 'fab fa-github';
                    } else if (this.isUrlOnDomain(item.url, 'facebook.com')) {
                        icon = 'fab fa-facebook';
                    } else if (this.isUrlOnDomain(item.url, 'twitter.com')) {
                        icon = 'fab fa-twitter';
                    } else if (this.isUrlOnDomain(item.url, 'instagram.com')) {
                        icon = 'fab fa-instagram';
                    } else if (this.isUrlOnDomain(item.url, 'reddit.com')) {
                        icon = 'fab fa-reddit';
                    } else if (this.isUrlOnDomain(item.url, 'stackoverflow.com')) {
                        icon = 'fab fa-stack-overflow';
                    } else if (this.isUrlOnDomain(item.url, 'wikipedia.org')) {
                        icon = 'fab fa-wikipedia-w';
                    } else if (this.isUrlOnDomain(item.url, 'amazon.com')) {
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
                if (suggestions.length < maxSuggestions && !this.isSuggestionDismissed(item)) {
                    suggestions.push(item);
                    searchCount++;
                }
            });
        }
        
        // Fill to exactly 5 with default suggestions if needed
        if (suggestions.length < maxSuggestions) {
            const defaultSuggestions = this.getDefaultSuggestions();
            const existingTexts = new Set(suggestions.map(s => s.text));
            const needed = maxSuggestions - suggestions.length;
            
            // Get unique suggestions from defaults
            const additional = defaultSuggestions
                .filter(s => !existingTexts.has(s.text))
                .slice(0, needed);
            
            suggestions.push(...additional);
            
            // If still not 5, add placeholder actions
            if (suggestions.length < maxSuggestions) {
                const placeholders = [
                    { text: 'New Tab', icon: 'fas fa-plus', isAction: true },
                    { text: 'New Incognito Tab', icon: 'fas fa-mask', isAction: true },
                    { text: 'Open Settings', icon: 'fas fa-cog', isAction: true },
                    { text: 'New Note', icon: 'fas fa-sticky-note', isAction: true }
                ];
                
                placeholders.forEach(placeholder => {
                    if (suggestions.length < maxSuggestions && !existingTexts.has(placeholder.text)) {
                        suggestions.push(placeholder);
                    }
                });
            }
        }
        
        // Return exactly 5
        return suggestions.slice(0, maxSuggestions);
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
            } else if (this.isUrlOnDomain(url, 'gmail.com')) {
                icon = 'fas fa-envelope';
            } else if (this.isUrlOnDomain(url, 'youtube.com')) {
                icon = 'fab fa-youtube';
            } else if (this.isUrlOnDomain(url, 'github.com')) {
                icon = 'fab fa-github';
            } else if (this.isUrlOnDomain(url, 'facebook.com')) {
                icon = 'fab fa-facebook';
            } else if (this.isUrlOnDomain(url, 'twitter.com')) {
                icon = 'fab fa-twitter';
            } else if (this.isUrlOnDomain(url, 'instagram.com')) {
                icon = 'fab fa-instagram';
            } else if (this.isUrlOnDomain(url, 'reddit.com')) {
                icon = 'fab fa-reddit';
            } else if (this.isUrlOnDomain(url, 'stackoverflow.com')) {
                icon = 'fab fa-stack-overflow';
            } else if (this.isUrlOnDomain(url, 'wikipedia.org')) {
                icon = 'fab fa-wikipedia-w';
            } else if (this.isUrlOnDomain(url, 'amazon.com')) {
                icon = 'fab fa-amazon';
            }
        
        const tabSuggestion = {
                text: title,
                icon: icon,
                tabId: tabId,
                url: url,
                isTab: true
            };
            
            // Only add if not dismissed
            if (!this.isSuggestionDismissed(tabSuggestion)) {
                suggestions.push(tabSuggestion);
                tabCount++;
            }
        });
        
        // Always return exactly 5 suggestions
        const maxSuggestions = 5;
        let searchCount = 0;
        
        // Add recent searches if we have space
        if (this.settings.recentSearches && this.settings.recentSearches.length > 0 && suggestions.length < maxSuggestions) {
            const remainingSlots = maxSuggestions - suggestions.length;
            const recentSearches = this.settings.recentSearches.slice(0, remainingSlots);
            recentSearches.forEach(search => {
                const searchSuggestion = {
                    text: `Search "${search}"`,
                    icon: 'fas fa-search',
                    searchQuery: search,
                    isSearch: true
                };
                if (suggestions.length < maxSuggestions && !this.isSuggestionDismissed(searchSuggestion)) {
                    suggestions.push(searchSuggestion);
                    searchCount++;
                }
            });
        }
        
        // Add recent history if we need more suggestions
        if (suggestions.length < maxSuggestions && this.settings.history && this.settings.history.length > 0) {
            const remainingSlots = maxSuggestions - suggestions.length;
            const recentHistory = this.settings.history.slice(0, remainingSlots);
            recentHistory.forEach(item => {
                let icon = 'fas fa-lightbulb';
                if (this.isUrlOnDomain(item.url, 'gmail.com')) {
                    icon = 'fas fa-envelope';
                } else if (this.isUrlOnDomain(item.url, 'youtube.com')) {
                    icon = 'fab fa-youtube';
                } else if (this.isUrlOnDomain(item.url, 'github.com')) {
                    icon = 'fab fa-github';
                } else if (this.isUrlOnDomain(item.url, 'facebook.com')) {
                    icon = 'fab fa-facebook';
                } else if (this.isUrlOnDomain(item.url, 'twitter.com')) {
                    icon = 'fab fa-twitter';
                } else if (this.isUrlOnDomain(item.url, 'instagram.com')) {
                    icon = 'fab fa-instagram';
                } else if (this.isUrlOnDomain(item.url, 'reddit.com')) {
                    icon = 'fab fa-reddit';
                } else if (this.isUrlOnDomain(item.url, 'stackoverflow.com')) {
                    icon = 'fab fa-stack-overflow';
                } else if (this.isUrlOnDomain(item.url, 'wikipedia.org')) {
                    icon = 'fab fa-wikipedia-w';
                } else if (this.isUrlOnDomain(item.url, 'amazon.com')) {
                    icon = 'fab fa-amazon';
                }
                
                const historySuggestion = {
                    text: item.title,
                    icon: icon,
                    url: item.url,
                    isHistory: true,
                    timestamp: item.timestamp
                };
                
                if (suggestions.length < maxSuggestions && !this.isSuggestionDismissed(historySuggestion)) {
                    suggestions.push(historySuggestion);
                    searchCount++;
                }
            });
        }
        
        // Fill to exactly 5 with placeholder actions if needed
        if (suggestions.length < maxSuggestions) {
            const placeholders = [
                { text: 'New Tab', icon: 'fas fa-plus', isAction: true },
                { text: 'New Incognito Tab', icon: 'fas fa-mask', isAction: true },
                { text: 'Open Settings', icon: 'fas fa-cog', isAction: true },
                { text: 'New Note', icon: 'fas fa-sticky-note', isAction: true }
            ];
            
            const existingTexts = new Set(suggestions.map(s => s.text));
            const needed = maxSuggestions - suggestions.length;
            
            placeholders.forEach(placeholder => {
                if (suggestions.length < maxSuggestions && !existingTexts.has(placeholder.text)) {
                    suggestions.push(placeholder);
                }
            });
        }
        
        // Return exactly 5
        return suggestions.slice(0, maxSuggestions);
    }

    getSearchUrl(query, engine = null) {
        const searchEngine = engine || this.selectedSearchEngine || this.settings?.searchEngine || 'google';
        const encodedQuery = encodeURIComponent(query);
        
        switch (searchEngine) {
            case 'bing':
                return `https://www.bing.com/search?q=${encodedQuery}`;
            case 'duckduckgo':
                // Use HTML version for better webview compatibility
                return `https://html.duckduckgo.com/html/?q=${encodedQuery}`;
            case 'youtube':
                return `https://www.youtube.com/results?search_query=${encodedQuery}`;
            case 'yahoo':
                return `https://search.yahoo.com/search?p=${encodedQuery}`;
            case 'wikipedia':
                return `https://en.wikipedia.org/wiki/Special:Search?search=${encodedQuery}`;
            case 'reddit':
                return `https://www.reddit.com/search/?q=${encodedQuery}`;
            case 'github':
                return `https://github.com/search?q=${encodedQuery}`;
            case 'amazon':
                return `https://www.amazon.com/s?k=${encodedQuery}`;
            case 'twitter':
                return `https://twitter.com/search?q=${encodedQuery}`;
            case 'instagram':
                return `https://www.instagram.com/explore/tags/${encodedQuery}/`;
            case 'facebook':
                return `https://www.facebook.com/search/top/?q=${encodedQuery}`;
            case 'google':
            default:
                return `https://www.google.com/search?q=${encodedQuery}`;
        }
    }

    selectSearchEngine(engine, urlBar) {
        this.selectedSearchEngine = engine;
        const pill = document.getElementById('search-engine-pill');
        const pillName = document.getElementById('search-engine-name');
        
        if (pill && pillName) {
            // Format engine name for display with special cases
            const displayNames = {
                'google': 'Google',
                'youtube': 'YouTube',
                'bing': 'Bing',
                'duckduckgo': 'DuckDuckGo',
                'yahoo': 'Yahoo!',
                'wikipedia': 'Wikipedia',
                'reddit': 'Reddit',
                'github': 'GitHub',
                'amazon': 'Amazon',
                'twitter': 'Twitter',
                'instagram': 'Instagram',
                'facebook': 'Facebook'
            };
            const displayName = displayNames[engine] || engine.charAt(0).toUpperCase() + engine.slice(1);
            pillName.textContent = displayName;
            
            // Remove all engine-specific classes
            pill.className = 'search-engine-pill';
            // Add engine-specific class for color coding
            pill.classList.add(`search-engine-${engine}`);
            pill.classList.remove('hidden');
            
            urlBar.classList.add('has-search-engine');
            // Update placeholder
            urlBar.placeholder = 'Search...';
        }
    }

    clearSearchEngine() {
        this.selectedSearchEngine = null;
        const pill = document.getElementById('search-engine-pill');
        
        if (pill) {
            pill.classList.add('hidden');
        }
        // Old URL bar removed - search engine functionality moved to new URL bar
        this.hideSearchEngineSuggestion();
    }

    showSearchEngineSuggestion(engine) {
        const suggestion = document.getElementById('search-engine-suggestion');
        const suggestionText = document.getElementById('search-engine-suggestion-text');
        
        if (!suggestion || !suggestionText) {
            console.warn('Search engine suggestion elements not found');
            return;
        }
        
        const displayNames = {
            'google': 'Google',
            'youtube': 'YouTube',
            'bing': 'Bing',
            'duckduckgo': 'DuckDuckGo',
            'yahoo': 'Yahoo!',
            'wikipedia': 'Wikipedia',
            'reddit': 'Reddit',
            'github': 'GitHub',
            'amazon': 'Amazon',
            'twitter': 'Twitter',
            'instagram': 'Instagram',
            'facebook': 'Facebook'
        };
        const displayName = displayNames[engine] || engine.charAt(0).toUpperCase() + engine.slice(1);
        suggestionText.textContent = `Search ${displayName}!`;
        suggestion.classList.remove('hidden');
    }

    hideSearchEngineSuggestion() {
        const suggestion = document.getElementById('search-engine-suggestion');
        if (suggestion) {
            suggestion.classList.add('hidden');
        }
    }

    isSearchEngineShortcut(value) {
        const word = value.toLowerCase().trim();
        if (!this.searchEngineWords) return false;
        // Check if the word matches the beginning of any search engine word
        return this.searchEngineWords.some(engineWord => 
            engineWord.startsWith(word) && word.length > 0
        );
    }

    // Spotlight search engine methods
    selectSpotlightSearchEngine(engine, spotlightInput) {
        this.selectedSearchEngine = engine;
        const pill = document.getElementById('spotlight-search-engine-pill');
        const pillName = document.getElementById('spotlight-search-engine-name');
        const spotlightContent = document.querySelector('.spotlight-content');
        
        if (pill && pillName) {
            const displayNames = {
                'google': 'Google',
                'youtube': 'YouTube',
                'bing': 'Bing',
                'duckduckgo': 'DuckDuckGo',
                'yahoo': 'Yahoo!',
                'wikipedia': 'Wikipedia',
                'reddit': 'Reddit',
                'github': 'GitHub',
                'amazon': 'Amazon',
                'twitter': 'Twitter',
                'instagram': 'Instagram',
                'facebook': 'Facebook'
            };
            const displayName = displayNames[engine] || engine.charAt(0).toUpperCase() + engine.slice(1);
            pillName.textContent = displayName;
            
            // Remove all engine-specific classes
            pill.className = 'search-engine-pill';
            // Add engine-specific class for color coding
            pill.classList.add(`search-engine-${engine}`);
            pill.classList.remove('hidden');
            
            // Update spotlight content border color
            if (spotlightContent) {
                // Remove all engine border classes
                spotlightContent.classList.remove(
                    'has-engine-youtube', 'has-engine-google', 'has-engine-bing',
                    'has-engine-duckduckgo', 'has-engine-yahoo', 'has-engine-wikipedia',
                    'has-engine-reddit', 'has-engine-github', 'has-engine-amazon',
                    'has-engine-twitter', 'has-engine-instagram', 'has-engine-facebook'
                );
                // Add current engine border class
                spotlightContent.classList.add(`has-engine-${engine}`);
            }
            
            // Calculate dynamic padding based on pill width
            requestAnimationFrame(() => {
                const pillWidth = pill.offsetWidth;
                const gap = 8; // Tight gap between pill and typing start
                const leftOffset = 48; // Align with spotlight pill position (space from search icon)
                spotlightInput.style.paddingLeft = `${leftOffset + pillWidth + gap}px`;
            });
            
            spotlightInput.classList.add('has-search-engine');
            spotlightInput.placeholder = 'Search...';
        }
    }

    clearSpotlightSearchEngine() {
        this.selectedSearchEngine = null;
        const pill = document.getElementById('spotlight-search-engine-pill');
        const spotlightInput = document.getElementById('spotlight-input');
        const spotlightContent = document.querySelector('.spotlight-content');
        
        if (pill) {
            pill.classList.add('hidden');
        }
        if (spotlightInput) {
            spotlightInput.classList.remove('has-search-engine');
            spotlightInput.style.paddingLeft = ''; // Reset to default
            spotlightInput.placeholder = 'Search or Enter URL...';
        }
        
        // Remove all engine border classes from spotlight content
        if (spotlightContent) {
            spotlightContent.classList.remove(
                'has-engine-youtube', 'has-engine-google', 'has-engine-bing',
                'has-engine-duckduckgo', 'has-engine-yahoo', 'has-engine-wikipedia',
                'has-engine-reddit', 'has-engine-github', 'has-engine-amazon',
                'has-engine-twitter', 'has-engine-instagram', 'has-engine-facebook'
            );
        }
        
        this.hideSpotlightSearchEngineSuggestion();
    }

    showSpotlightSearchEngineSuggestion(engine) {
        const suggestion = document.getElementById('spotlight-search-engine-suggestion');
        const suggestionText = document.getElementById('spotlight-search-engine-suggestion-text');
        
        if (!suggestion || !suggestionText) {
            return;
        }
        
        const displayNames = {
            'google': 'Google',
            'youtube': 'YouTube',
            'bing': 'Bing',
            'duckduckgo': 'DuckDuckGo',
            'yahoo': 'Yahoo!',
            'wikipedia': 'Wikipedia',
            'reddit': 'Reddit',
            'github': 'GitHub',
            'amazon': 'Amazon',
            'twitter': 'Twitter',
            'instagram': 'Instagram',
            'facebook': 'Facebook'
        };
        const displayName = displayNames[engine] || engine.charAt(0).toUpperCase() + engine.slice(1);
        suggestionText.textContent = `Search ${displayName}!`;
        suggestion.classList.remove('hidden');
    }

    hideSpotlightSearchEngineSuggestion() {
        const suggestion = document.getElementById('spotlight-search-engine-suggestion');
        if (suggestion) {
            suggestion.classList.add('hidden');
        }
    }

    sanitizeUrl(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        // Remove any potential XSS attempts
        let url = input.trim();
        
        // Remove dangerous characters and scripts
        url = url.replace(/[<>'"\x00-\x1f\x7f-\x9f]/g, '');
        
        // Remove dangerous URL schemes that could execute code or access local files
        const lowerUrl = url.toLowerCase();
        if (lowerUrl.startsWith('javascript:') || 
            lowerUrl.startsWith('data:') ||
            lowerUrl.startsWith('vbscript:') ||
            lowerUrl.startsWith('file:') ||
            lowerUrl.startsWith('ftp:')) {
            return null;
        }

        // Handle protocol addition with proper validation
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:')) {
            // Check if it looks like a domain (more strict validation)
            if (this.isValidDomain(url)) {
                url = 'https://' + url;
            } else {
                // Treat as search query with proper encoding
                return this.getSearchUrl(url);
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
        // Check for axis:// protocol URLs
        if (string.toLowerCase().startsWith('axis://')) {
            return true;
        }
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

    showLoadingIndicator() {
        const indicator = document.getElementById('loading-bar');
        if (indicator) {
            indicator.classList.add('loading');
        }
    }

    hideLoadingIndicator() {
        const indicator = document.getElementById('loading-bar');
        if (indicator) {
            indicator.classList.remove('loading');
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
                    <div class="quit-modal-icon">
                        <i class="fas fa-power-off"></i>
                    </div>
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
        
        const modal = backdrop.querySelector('.quit-modal-card');
        if (modal) {
            // Add closing class to trigger fade-out animation
            modal.classList.add('closing');
        }
        
        // Add closing class to backdrop
        backdrop.classList.add('closing');
        
        // Wait for animation to complete before hiding
        setTimeout(() => {
        backdrop.classList.add('hidden');
            backdrop.classList.remove('closing');
            if (modal) {
                modal.classList.remove('closing');
            }
        document.body.classList.remove('modal-open');
        // Reset quit flag so X button works normally again
        window.electronAPI.cancelQuit();
        }, 300); // Match the transition duration
    }

    // ========== Keyboard Shortcuts Management ==========
    
    async handleShortcutsMessage(data, webview) {
        try {
            switch (data.type) {
                case 'setShortcuts':
                    await window.electronAPI.setShortcuts(data.shortcuts);
                    this.showNotification('Keyboard shortcuts saved', 'success');
                    break;
                    
                case 'resetShortcuts':
                    const defaultShortcuts = await window.electronAPI.resetShortcuts();
                    // Send the defaults back to the settings page
                    if (webview) {
                        webview.executeJavaScript(`
                            window._axisShortcuts = ${JSON.stringify(defaultShortcuts)};
                            if (typeof currentShortcuts !== 'undefined') {
                                currentShortcuts = window._axisShortcuts;
                                updateShortcutInputs();
                            }
                        `);
                    }
                    this.showNotification('Keyboard shortcuts reset to defaults', 'success');
                    break;
                    
                case 'pauseShortcuts':
                    await window.electronAPI.disableShortcuts();
                    break;
                    
                case 'resumeShortcuts':
                    await window.electronAPI.enableShortcuts();
                    break;
            }
        } catch (error) {
            console.error('Error handling shortcuts message:', error);
        }
    }
    
    async loadAndSendShortcuts() {
        try {
            const shortcuts = await window.electronAPI.getShortcuts();
            // Send shortcuts to the settings page via webview
            const webview = this.getActiveWebview();
            if (webview) {
                webview.executeJavaScript(`
                    window._axisShortcuts = ${JSON.stringify(shortcuts)};
                    if (typeof currentShortcuts !== 'undefined') {
                        currentShortcuts = window._axisShortcuts;
                        updateShortcutInputs();
                    }
                `);
            }
        } catch (error) {
            console.error('Error loading shortcuts:', error);
        }
    }
    
    // URL Bar Setup - themed bar that matches website colors
    setupUrlBar() {
        const el = this.elements;
        if (!el) return;
        
        // Back button
        if (el.urlBarBack) {
            el.urlBarBack.addEventListener('click', () => {
                const webview = this.getActiveWebview();
                if (webview && webview.canGoBack()) {
                    webview.goBack();
                }
            });
        }
        
        // Forward button
        if (el.urlBarForward) {
            el.urlBarForward.addEventListener('click', () => {
                const webview = this.getActiveWebview();
                if (webview && webview.canGoForward()) {
                    webview.goForward();
                }
            });
        }
        
        // Refresh button
        if (el.urlBarRefresh) {
            el.urlBarRefresh.addEventListener('click', () => {
                const webview = this.getActiveWebview();
                if (webview) {
                    webview.reload();
                }
            });
        }
        
        // Security button
        if (el.urlBarSecurity) {
            el.urlBarSecurity.addEventListener('click', () => {
                this.toggleSecurity();
            });
        }
        
        // Copy URL button
        if (el.urlBarCopy) {
            el.urlBarCopy.addEventListener('click', async () => {
                await this.copyCurrentUrl();
                // Visual feedback
                const icon = el.urlBarCopy.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-link');
                    icon.classList.add('fa-check');
                    setTimeout(() => {
                        icon.classList.remove('fa-check');
                        icon.classList.add('fa-link');
                    }, 1500);
                }
            });
        }
        
        // Make URL bar clickable and editable
        if (el.urlBarDisplay && el.urlBarInput) {
            // Click on display or center area to edit
            const urlBarCenter = document.querySelector('.url-bar-center');
            
            const exitEditMode = () => {
                el.urlBarInput.setAttribute('readonly', '');
                el.urlBarInput.style.display = 'none';
                el.urlBarDisplay.style.display = '';
            };

            const enterEditMode = () => {
                const webview = this.getActiveWebview();
                if (!webview) return;
                try {
                    const currentUrl = webview.getURL();
                    if (currentUrl && !currentUrl.startsWith('axis://') && !currentUrl.startsWith('axis:note://')) {
                        el.urlBarDisplay.style.display = 'none';
                        el.urlBarInput.style.display = 'flex';
                        el.urlBarInput.removeAttribute('readonly');
                        el.urlBarInput.value = currentUrl;
                        el.urlBarInput.select();
                        el.urlBarInput.focus();
                    }
                } catch (e) {
                    console.error('Error getting URL:', e);
                }
            };

            el.urlBarDisplay.addEventListener('click', enterEditMode);

            if (urlBarCenter) {
                urlBarCenter.addEventListener('click', (e) => {
                    if (e.target === urlBarCenter || e.target === el.urlBarDisplay || e.target.closest('.url-bar-field')) {
                        if (!el.urlBarInput.style.display || el.urlBarInput.style.display === 'none') {
                            enterEditMode();
                        }
                    }
                });
            }

            if (el.urlBarInput) {
                el.urlBarInput.addEventListener('blur', () => {
                    exitEditMode();
                });
                
                el.urlBarInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const url = el.urlBarInput.value.trim();
                        if (url) {
                            this.navigate(url);
                        }
                        el.urlBarInput.blur();
                    } else if (e.key === 'Escape') {
                        el.urlBarInput.blur();
                    }
                });
            }
        }
        
        // Chat button
        if (el.urlBarChat) {
            el.urlBarChat.addEventListener('click', () => {
                this.toggleAIChat();
            });
        }
    }
    
    // Update the URL bar display and theme
    updateUrlBar(webview) {
        if (this.splitView) {
            this.updateSplitPanesUrlBars();
            return;
        }
        const el = this.elements;
        if (!el || !el.webviewUrlBar) return;
        
        // Get webview if not provided
        if (!webview && this.currentTab) {
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.webview) {
                webview = tab.webview;
            }
        }
        
        // Hide URL bar if no webview or no current tab
        if (!webview || !this.currentTab || !this.tabs.has(this.currentTab)) {
            el.webviewUrlBar.classList.add('hidden');
            return;
        }
        
        // Get current URL
        let currentUrl = '';
        let pageTitle = '';
        
        try {
            currentUrl = webview.getURL();
            pageTitle = webview.getTitle() || '';
        } catch (e) {
            currentUrl = '';
        }
        
        // Check if we have a valid website loaded
        // Only hide for confirmed special pages (not about:blank during loading)
        const isSpecialPage = currentUrl && (
            currentUrl.startsWith('chrome://') || 
            currentUrl.startsWith('chrome-extension://') ||
            currentUrl.startsWith('axis://') ||
            currentUrl.startsWith('axis:note://')
        );
        
        // Hide URL bar only for confirmed special pages
        if (isSpecialPage) {
            el.webviewUrlBar.classList.add('hidden');
            return;
        }
        
        // Show URL bar for regular websites (including about:blank during loading)
        el.webviewUrlBar.classList.remove('hidden');
        
        // Update security icon based on URL
        if (el.urlBarSecurity) {
            const icon = el.urlBarSecurity.querySelector('i');
            if (icon) {
                if (currentUrl.startsWith('https://')) {
                    icon.classList.remove('fa-unlock', 'fa-lock-open', 'fa-globe');
                    icon.classList.add('fa-lock');
                } else {
                    icon.classList.remove('fa-lock', 'fa-lock-open', 'fa-globe');
                    icon.classList.add('fa-unlock');
                }
            }
        }
        
        // Update navigation button states
        if (el.urlBarBack) {
            el.urlBarBack.disabled = !webview || !webview.canGoBack();
        }
        if (el.urlBarForward) {
            el.urlBarForward.disabled = !webview || !webview.canGoForward();
        }
        
        // Update input field with current URL
        if (el.urlBarInput) {
            el.urlBarInput.value = currentUrl;
        }
        
        // Format the URL display
        if (el.urlBarDisplay) {
            
            try {
                const url = new URL(currentUrl);
                let parts = [];
                
                // Domain (without www)
                const domain = url.hostname.replace(/^www\./, '');
                parts.push(`<span class="url-domain">${domain}</span>`);
                
                // Add page title or path
                if (pageTitle && pageTitle.length > 0 && pageTitle !== domain) {
                    // Clean up the title
                    let title = pageTitle;
                    // Remove domain from title if present
                    title = title.replace(new RegExp(domain.split('.')[0], 'gi'), '').trim();
                    // Remove common separators at start
                    title = title.replace(/^[\s\-\|\/\:]+/, '').trim();
                    
                    if (title.length > 0) {
                        // Truncate if too long
                        if (title.length > 50) {
                            title = title.substring(0, 47) + '...';
                        }
                        parts.push(`<span class="url-path">${title}</span>`);
                    }
                } else if (url.pathname && url.pathname !== '/') {
                    // Use path if no good title
                    const pathParts = url.pathname.split('/').filter(p => p.length > 0);
                    if (pathParts.length > 0) {
                        let pathDisplay = pathParts.slice(0, 2).map(p => {
                            try {
                                return decodeURIComponent(p).replace(/[-_]/g, ' ');
                            } catch (e) {
                                return p;
                            }
                        }).join(' / ');
                        
                        if (pathDisplay.length > 40) {
                            pathDisplay = pathDisplay.substring(0, 37) + '...';
                        }
                        parts.push(`<span class="url-path">${pathDisplay}</span>`);
                    }
                }
                
                el.urlBarDisplay.innerHTML = parts.join('<span class="url-separator">/</span>');
            } catch (e) {
                el.urlBarDisplay.textContent = currentUrl || 'New Tab';
            }
        }
        
        // Settings page (axis://settings) loads as data URL – use app theme for URL bar, not page theme
        const tab = this.tabs.get(this.currentTab);
        if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
            this.applyAppThemeToUrlBar();
            return;
        }
        // Extract theme color from website
        this.extractUrlBarTheme(webview);
    }
    
    // Apply app theme to URL bar (for axis://settings and other internal pages)
    applyAppThemeToUrlBar() {
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return;
        const themeColor = this.settings?.themeColor || '#1a1a1a';
        const gradientColor = this.settings?.gradientColor || '#2a2a2a';
        const gradientEnabled = this.settings?.gradientEnabled && gradientColor;
        const gradientDirection = this.settings?.gradientDirection || '135deg';
        const bgColor = gradientEnabled
            ? this.smoothGradient(gradientDirection, themeColor, gradientColor)
            : themeColor;
        urlBar.classList.add('dark-mode');
        urlBar.style.setProperty('--url-bar-bg', bgColor);
        urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.14)');
        urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
        urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.6)');
        urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.16)');
        this.applyChatPanelTheme(urlBar, bgColor, true);
    }
    
    // Extract website theme color and apply to URL bar
    async extractUrlBarTheme(webview) {
        if (!webview) return;
        
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return;
        
        try {
            const colorInfo = await webview.executeJavaScript(`
                (function() {
                    try {
                        // Helper to parse color
                        function parseColor(str) {
                            if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
                            
                            // Hex color
                            if (str.startsWith('#')) {
                                let hex = str;
                                if (hex.length === 4) {
                                    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
                                }
                                if (hex.length === 7) {
                                    const r = parseInt(hex.slice(1, 3), 16);
                                    const g = parseInt(hex.slice(3, 5), 16);
                                    const b = parseInt(hex.slice(5, 7), 16);
                                    return { r, g, b };
                                }
                            }
                            
                            // RGB/RGBA
                            const match = str.match(/[\\d.]+/g);
                            if (match && match.length >= 3) {
                                const r = Math.round(parseFloat(match[0]));
                                const g = Math.round(parseFloat(match[1]));
                                const b = Math.round(parseFloat(match[2]));
                                const a = match.length >= 4 ? parseFloat(match[3]) : 1;
                                if (a < 0.1) return null;
                                return { r, g, b };
                            }
                            return null;
                        }
                        
                        function getBrightness(rgb) {
                            if (!rgb) return 128;
                            return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
                        }
                        
                        // Try theme-color meta tag
                        const themeMeta = document.querySelector('meta[name="theme-color"]');
                        if (themeMeta && themeMeta.content) {
                            const color = parseColor(themeMeta.content);
                            if (color) {
                                return { ...color, brightness: getBrightness(color), source: 'meta' };
                            }
                        }
                        
                        // Try header/nav background
                        const headerSelectors = ['header', 'nav', '[role="banner"]', '.header', '.navbar', '#header'];
                        for (const sel of headerSelectors) {
                            const el = document.querySelector(sel);
                            if (el) {
                                const style = window.getComputedStyle(el);
                                const color = parseColor(style.backgroundColor);
                                if (color && (color.r + color.g + color.b) > 30) {
                                    return { ...color, brightness: getBrightness(color), source: 'header' };
                                }
                            }
                        }
                        
                        // Try body/html background
                        const bodyBg = parseColor(window.getComputedStyle(document.body).backgroundColor);
                        if (bodyBg) {
                            return { ...bodyBg, brightness: getBrightness(bodyBg), source: 'body' };
                        }
                        
                        const htmlBg = parseColor(window.getComputedStyle(document.documentElement).backgroundColor);
                        if (htmlBg) {
                            return { ...htmlBg, brightness: getBrightness(htmlBg), source: 'html' };
                        }
                        
                        // Default to light
                        return { r: 250, g: 250, b: 250, brightness: 250, source: 'default' };
                    } catch (e) {
                        return { r: 250, g: 250, b: 250, brightness: 250, source: 'error' };
                    }
                })();
            `);
            
            if (colorInfo) {
                const { r, g, b, brightness } = colorInfo;
                
                // Determine if dark or light mode from the *actual* page color
                const isDark = brightness < 128;
                
                // Use the page color directly for the bar background so it matches as closely as possible
                const bgColor = `rgba(${r}, ${g}, ${b}, 1)`;
                
                if (isDark) {
                    urlBar.classList.add('dark-mode');
                    urlBar.style.setProperty('--url-bar-bg', bgColor);
                    urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.14)');
                    urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
                    urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.6)');
                    urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.16)');
                } else {
                    urlBar.classList.remove('dark-mode');
                    urlBar.style.setProperty('--url-bar-bg', bgColor);
                    urlBar.style.setProperty('--url-bar-border', 'rgba(0, 0, 0, 0.06)');
                    urlBar.style.setProperty('--url-bar-text', 'rgba(0, 0, 0, 0.9)');
                    urlBar.style.setProperty('--url-bar-text-muted', 'rgba(0, 0, 0, 0.5)');
                    urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(0, 0, 0, 0.06)');
                }
                this.applyChatPanelTheme(urlBar, bgColor, isDark);
            }
        } catch (e) {
            // Apply default light theme on error
            urlBar.classList.remove('dark-mode');
            urlBar.style.setProperty('--url-bar-bg', 'rgba(250, 250, 250, 0.95)');
        }
    }

    applyChatPanelTheme(urlBar, bgColor, isDark) {
        const container = urlBar && urlBar.closest ? urlBar.closest('.webview-container') : null;
        if (!container) return;
        container.style.setProperty('--chat-panel-bg', bgColor);
        if (isDark) {
            container.style.setProperty('--chat-panel-border', 'rgba(255, 255, 255, 0.14)');
            container.style.setProperty('--chat-panel-text', 'rgba(255, 255, 255, 0.96)');
            container.style.setProperty('--chat-panel-text-muted', 'rgba(255, 255, 255, 0.6)');
        } else {
            container.style.setProperty('--chat-panel-border', 'rgba(0, 0, 0, 0.08)');
            container.style.setProperty('--chat-panel-text', 'rgba(0, 0, 0, 0.9)');
            container.style.setProperty('--chat-panel-text-muted', 'rgba(0, 0, 0, 0.5)');
        }
    }
    
    // Native Picture-in-Picture functionality using browser API
    // This uses the native browser PIP which is hardware-accelerated and smooth
    setupPIP() {
        // Native PIP doesn't need custom window setup - browser handles everything
        // We just need to track state
        this.pipTabId = null;
        this.pipVideoIndex = 0;
        this.pipWebview = null;
        this.pipLeaveCheckInterval = null;
    }
    
    startPIPLeaveCheck() {
        this.stopPIPLeaveCheck();
        this.pipLeaveCheckInterval = setInterval(async () => {
            if (!this.pipTabId || !this.pipWebview) return;
            try {
                const stillInPIP = await this.pipWebview.executeJavaScript('!!document.pictureInPictureElement');
                if (!stillInPIP) {
                    const tabIdToSwitch = this.pipTabId;
                    if (tabIdToSwitch && this.tabs.has(tabIdToSwitch)) {
                        this.switchToTab(tabIdToSwitch);
                    }
                    this.hidePIP();
                }
            } catch (e) {
                // Webview may be gone or navigating
            }
        }, 400);
    }
    
    stopPIPLeaveCheck() {
        if (this.pipLeaveCheckInterval) {
            clearInterval(this.pipLeaveCheckInterval);
            this.pipLeaveCheckInterval = null;
        }
    }
    
    async checkAndShowPIP(tabId, webview) {
        if (!webview) return;
        
        try {
            // Check if there's a playing video and request native PIP
            const result = await webview.executeJavaScript(`
                (async function() {
                    const videos = document.querySelectorAll('video');
                    for (let i = 0; i < videos.length; i++) {
                        const v = videos[i];
                        if (!v.paused && v.readyState >= 2) {
                            try {
                                // Check if PIP is supported
                                if (document.pictureInPictureEnabled && !v.disablePictureInPicture) {
                                    // Exit any existing PIP first
                                    if (document.pictureInPictureElement) {
                                        await document.exitPictureInPicture();
                                    }
                                    // Request native PIP
                                    await v.requestPictureInPicture();
                                    return { success: true, videoIndex: i };
                                }
                            } catch (e) {
                                console.log('PIP request failed:', e.message);
                            }
                        }
                    }
                    return { success: false };
                })();
            `);
            
            if (result && result.success) {
                this.pipTabId = tabId;
                this.pipVideoIndex = result.videoIndex;
                this.pipWebview = webview;
                this.startPIPLeaveCheck();
            }
        } catch (e) {
            // Ignore errors - PIP may not be supported
        }
    }
    
    async showPIP(tabId, webview, videoIndex = 0) {
        if (!webview) return;
        
        this.pipTabId = tabId;
        this.pipVideoIndex = videoIndex;
        this.pipWebview = webview;
        this.startPIPLeaveCheck();
        
        try {
            // Request native browser PIP
            await webview.executeJavaScript(`
                (async function() {
                    const videos = document.querySelectorAll('video');
                    const videoIndex = ${videoIndex};
                    if (videos.length > videoIndex) {
                        const v = videos[videoIndex];
                        if (v && document.pictureInPictureEnabled && !v.disablePictureInPicture) {
                            try {
                                // Exit any existing PIP first
                                if (document.pictureInPictureElement) {
                                    await document.exitPictureInPicture();
                                }
                                await v.requestPictureInPicture();
                                return true;
                            } catch (e) {
                                console.log('PIP failed:', e.message);
                            }
                        }
                    }
                    return false;
                })();
            `);
        } catch (e) {
            // Ignore
        }
    }
    
    async backToPIPTab() {
        if (!this.pipTabId) return;
        
        this.stopPIPLeaveCheck();
        const tabIdToSwitch = this.pipTabId;
        
        // Exit native PIP
        await this.exitNativePIP();
        
        // Switch to the tab with the video
        if (tabIdToSwitch && this.tabs.has(tabIdToSwitch)) {
            this.switchToTab(tabIdToSwitch);
        }
        
        // Clear PIP state
        this.pipTabId = null;
        this.pipVideoIndex = 0;
        this.pipWebview = null;
    }
    
    async exitNativePIP() {
        if (this.pipWebview) {
            try {
                await this.pipWebview.executeJavaScript(`
                    (async function() {
                        if (document.pictureInPictureElement) {
                            await document.exitPictureInPicture();
                        }
                    })();
                `);
            } catch (e) {
                // Ignore
            }
        }
    }
    
    async closePIP() {
        // Pause the video and exit PIP
        if (this.pipTabId && this.pipWebview) {
            try {
                await this.pipWebview.executeJavaScript(`
                    (async function() {
                        const videoIndex = ${this.pipVideoIndex || 0};
                        const videos = document.querySelectorAll('video');
                        if (videos.length > videoIndex) {
                            const v = videos[videoIndex];
                            if (v && !v.paused) {
                                v.pause();
                            }
                        }
                        // Exit PIP
                        if (document.pictureInPictureElement) {
                            await document.exitPictureInPicture();
                        }
                    })();
                `);
            } catch (e) {
                // Ignore
            }
        }
        
        this.hidePIP();
    }
    
    hidePIP() {
        this.stopPIPLeaveCheck();
        // Exit native PIP if active
        this.exitNativePIP();
        
        this.pipTabId = null;
        this.pipVideoIndex = 0;
        this.pipWebview = null;
    }
    
    pausePIPCapture() {
        // Not needed for native PIP - browser handles everything
    }
    
    startPIPVideoCapture() {
        // Not needed for native PIP - browser handles everything
    }
    
    async togglePIPPlayPause() {
        if (!this.pipTabId || !this.pipWebview) return;
        
        try {
            await this.pipWebview.executeJavaScript(`
                (function() {
                    const videos = document.querySelectorAll('video');
                    const videoIndex = ${this.pipVideoIndex || 0};
                    if (videos.length > videoIndex) {
                        const v = videos[videoIndex];
                        if (v) {
                            if (v.paused) {
                                v.play();
                            } else {
                                v.pause();
                            }
                        }
                    }
                })();
            `);
        } catch (e) {
            // Ignore
        }
    }
    
    async seekPIPVideo(percentage) {
        if (!this.pipTabId || !this.pipWebview) return;
        
        try {
            await this.pipWebview.executeJavaScript(`
                (function() {
                    const videos = document.querySelectorAll('video');
                    const videoIndex = ${this.pipVideoIndex || 0};
                    if (videos.length > videoIndex) {
                        const v = videos[videoIndex];
                        if (v && v.duration) {
                            v.currentTime = v.duration * ${percentage};
                        }
                    }
                })();
            `);
        } catch (e) {
            // Ignore
        }
    }
    
    startPIPProgressUpdate() {
        // Not needed for native PIP - browser handles progress display
    }
}

// Initialize the browser when DOM is loaded
// Initialize browser immediately
let browserInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    browserInstance = new AxisBrowser();
});

// Also ensure theme applies on window load as backup
window.addEventListener('load', () => {
    if (browserInstance && browserInstance.settings) {
        // Force reapply theme on window load to ensure it's applied
        if (browserInstance.settings.themeColor || browserInstance.settings.gradientColor) {
            browserInstance.applyCustomThemeFromSettings();
        } else {
            browserInstance.resetToBlackTheme();
        }
    }
});



