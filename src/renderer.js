// Axis Browser Renderer Process
class AxisBrowser {
    constructor() {
        this.currentTab = 1;
        this.tabs = new Map();
        this.settings = {};
        this.init();
    }

    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        this.setupWebview();
        this.setupTabSearch();
        this.setupLoadingScreen();
        this.setupSidebarResize();
        this.setupTabDragDrop();
        this.setupAddTabMenu();
        
        // Make browser instance globally accessible for incognito windows
        window.browser = this;
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

        // URL bar
        const urlBar = document.getElementById('url-bar');
        urlBar.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.navigate(urlBar.value);
            }
        });

        urlBar.addEventListener('focus', () => {
            urlBar.select();
        });

        urlBar.addEventListener('click', (e) => {
            this.toggleUrlBarExpansion();
        });

        // Tab controls handled in setupAddTabMenu to avoid double toggle

        // Nav menu toggle
        document.getElementById('nav-menu-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNavMenu();
        });

        // Sidebar slide-back functionality (temporarily disabled)
        // this.setupSidebarSlideBack();

        // Settings
        document.getElementById('settings-btn-footer').addEventListener('click', () => {
            this.toggleSettings();
        });

        document.getElementById('close-settings').addEventListener('click', () => {
            this.toggleSettings();
        });

        // Settings tabs
        document.querySelectorAll('.settings-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                this.switchSettingsTab(tab.dataset.tab);
            });
        });

        // History search in settings
        document.getElementById('history-search').addEventListener('input', (e) => {
            this.filterHistory(e.target.value);
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

        // Clear history button
        document.getElementById('clear-history').addEventListener('click', () => {
            this.clearAllHistory();
        });

        // Clear downloads button
        document.getElementById('clear-downloads').addEventListener('click', () => {
            this.clearAllDownloads();
        });

        // Downloads search functionality
        document.getElementById('downloads-search-input').addEventListener('input', (e) => {
            this.filterDownloads(e.target.value);
        });

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
                this.performSpotlightSearch();
            } else if (e.key === 'Escape') {
                this.closeSpotlightSearch();
            }
        });

        document.getElementById('spotlight-input').addEventListener('input', (e) => {
            // Debounce the suggestions update to wait for user to finish typing
            clearTimeout(this.spotlightDebounceTimer);
            this.spotlightDebounceTimer = setTimeout(() => {
                this.updateSpotlightSuggestions(e.target.value);
            }, 800); // Wait 800ms after user stops typing for better UX
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
            document.getElementById('settings-panel').classList.add('hidden');
            document.getElementById('downloads-panel').classList.add('hidden');
            document.getElementById('bookmarks-panel').classList.add('hidden');
            backdrop.classList.add('hidden');
        });
        }

        // Context menu event listeners
        document.getElementById('rename-tab-option').addEventListener('click', () => {
            this.renameCurrentTab();
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

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Cmd/Ctrl + T - Show spotlight search
            if ((e.metaKey || e.ctrlKey) && e.key === 't') {
                e.preventDefault();
                this.showSpotlightSearch();
            }
            
            // Cmd/Ctrl + W - Close tab
            if ((e.metaKey || e.ctrlKey) && e.key === 'w') {
                e.preventDefault();
                if (this.tabs.size > 1) {
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
        
        // Enable webview functionality
        // Ultra-fast updates with minimal debouncing
        const debounce = (fn, delay = 1) => {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), delay);
            };
        };

        const debouncedUpdateNav = debounce(() => this.updateNavigationButtons(), 1);
        const debouncedUpdateUrl = debounce(() => this.updateUrlBar(), 1);
        const debouncedUpdateTitle = debounce(() => this.updateTabTitle(), 2);
        const debouncedUpdateSecurity = debounce(() => this.updateSecurityIndicator(), 3);

        webview.addEventListener('did-start-loading', () => {
            // Show loading indicator
            this.showLoadingIndicator();
            this.updateNavigationButtons();
        });

        webview.addEventListener('did-finish-load', () => {
            // Hide loading indicator
            this.hideLoadingIndicator();
            
            // Batch all updates for maximum speed
            this.updateNavigationButtons();
            this.updateUrlBar();
            this.updateTabTitle();
            this.updateSecurityIndicator();
            this.updateBookmarkButton();
            
            // Update current tab state
            if (this.currentTab && this.tabs.has(this.currentTab)) {
                const currentTab = this.tabs.get(this.currentTab);
                currentTab.url = webview.getURL();
                currentTab.title = webview.getTitle() || currentTab.title;
            }
            
            // Track page in history (async to not block UI)
            setTimeout(() => this.trackPageInHistory(), 0);
        });

        webview.addEventListener('did-fail-load', (event) => {
            console.error('Failed to load:', event.errorDescription);
            // Hide loading indicator even on failure
            this.hideLoadingIndicator();
            // Show error page or fallback
            this.showErrorPage(event.errorDescription);
        });

        webview.addEventListener('new-window', (event) => {
            // Handle new window requests
            event.preventDefault();
            this.navigate(event.url);
        });

        // Handle navigation events - optimized for performance
        webview.addEventListener('will-navigate', (event) => {
            // Only update URL bar, no debouncing needed for immediate feedback
            this.updateUrlBar();
        });

        // Set initial page
        webview.src = 'https://www.google.com';
        
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
                    <button class="tab-pin" title="Pin"><i class="fas fa-thumbtack"></i></button>
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        // Add tab to container
        const tabsContainer = document.querySelector('.tabs-container');
        tabsContainer.appendChild(tabElement);

        // Store tab data
        this.tabs.set(tabId, {
            id: tabId,
            url: url || 'about:blank',
            title: 'New Tab',
            canGoBack: false,
            canGoForward: false
        });

        // Initialize the first tab if it doesn't exist
        if (!this.tabs.has(1)) {
            this.tabs.set(1, {
                id: 1,
                url: 'https://www.google.com',
                title: 'New Tab',
                canGoBack: false,
                canGoForward: false
            });
        }

        // Set up tab event listeners
        this.setupTabEventListeners(tabElement, tabId);

        // Save current tab state before switching
        if (this.currentTab && this.tabs.has(this.currentTab)) {
            const currentTab = this.tabs.get(this.currentTab);
            const webview = document.getElementById('webview');
            currentTab.url = webview.getURL();
            currentTab.title = webview.getTitle() || currentTab.title;
        }

        // Switch to new tab
        this.switchToTab(tabId);

        // Navigate to google.com for new tabs without URL
        if (!url) {
            this.navigate('https://www.google.com');
        } else {
        // Navigate if URL provided
            this.navigate(url);
        }
        this.updateTabFavicon(tabId, tabElement);
    }

    setupTabEventListeners(tabElement, tabId) {
        // Tab click
        tabElement.addEventListener('click', (e) => {
            if (!e.target.closest('.tab-close') && !e.target.closest('.tab-pin')) {
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

        // Pin tab
        const pinBtn = tabElement.querySelector('.tab-pin');
        if (pinBtn) {
            pinBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.togglePinTab(tabId, tabElement, pinBtn);
            });
        }
    }

    switchToTab(tabId) {
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
            // Only navigate if the URL is actually different and not empty
            if (webview.src !== tab.url && tab.url && tab.url !== 'about:blank') {
                webview.src = tab.url;
            }
        }
        
        this.updateNavigationButtons();
        this.updateUrlBar();
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
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            tabElement.remove();
        }

        this.tabs.delete(tabId);

        // If we closed the active tab, switch to another tab
        if (this.currentTab === tabId) {
            const remainingTabs = Array.from(this.tabs.keys());
            if (remainingTabs.length > 0) {
                this.switchToTab(remainingTabs[remainingTabs.length - 1]);
            } else {
                this.createNewTab();
            }
        }
    }

    navigate(url) {
        if (!url) return;

        // Add protocol if missing
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('file://') && !url.startsWith('about:')) {
            // Check if it looks like a domain
            if (url.includes('.') && !url.includes(' ')) {
                url = 'https://' + url;
            } else {
                // Treat as search query
                url = `https://www.google.com/search?q=${encodeURIComponent(url)}`;
            }
        }

        const webview = document.getElementById('webview');
        webview.src = url;

        // Update tab data
        const tab = this.tabs.get(this.currentTab);
        if (tab) {
            tab.url = url;
        }

        // Update URL bar
        document.getElementById('url-bar').value = url;
    }

    goBack() {
        const webview = document.getElementById('webview');
        if (webview.canGoBack()) {
            webview.goBack();
        }
    }

    goForward() {
        const webview = document.getElementById('webview');
        if (webview.canGoForward()) {
            webview.goForward();
        }
    }

    refresh() {
        const webview = document.getElementById('webview');
        webview.reload();
    }

    updateNavigationButtons() {
        const webview = document.getElementById('webview');
        const backBtn = document.getElementById('back-btn');
        const forwardBtn = document.getElementById('forward-btn');

        backBtn.disabled = !webview.canGoBack();
        forwardBtn.disabled = !webview.canGoForward();
    }

    updateUrlBar() {
        const webview = document.getElementById('webview');
        const urlBar = document.getElementById('url-bar');
        const newUrl = webview.getURL();
        
        // Only update if URL actually changed to avoid unnecessary DOM updates
        if (urlBar.value !== newUrl) {
            urlBar.value = newUrl;
            this.summarizeUrlBar();
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
            settingsPanel.classList.remove('hidden');
            if (backdrop) backdrop.classList.remove('hidden');
            this.populateSettings();
            // Default to general tab when opening
            this.switchSettingsTab('general');
        } else {
            this.closePanelWithAnimation(settingsPanel);
            if (backdrop) backdrop.classList.add('hidden');
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

            // After a brief delay, switch content and start enter animation
            setTimeout(() => {
                // Remove old content classes
                currentActiveContent.classList.remove('leaving');
                currentActiveContent.style.display = 'none';

                // Show new content and start enter animation
                newContent.style.display = 'block';
                newContent.classList.add('entering');
                
                // Trigger reflow to ensure the entering class is applied
                newContent.offsetHeight;
                
                // Start the enter animation
                setTimeout(() => {
                    newContent.classList.remove('entering');
                    newContent.classList.add('active');
                }, 10);
            }, 150); // Half of the transition duration
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
            bookmarksPanel.classList.remove('hidden');
            if (backdrop) backdrop.classList.remove('hidden');
            this.populateBookmarks();
        } else {
            this.closePanelWithAnimation(bookmarksPanel);
            if (backdrop) backdrop.classList.add('hidden');
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
        
        bookmarksList.innerHTML = '';
        
        if (bookmarks.length === 0) {
            noBookmarks.classList.remove('hidden');
            return;
        }
        
        noBookmarks.classList.add('hidden');
        
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
        bookmarks.splice(index, 1);
        this.saveSetting('bookmarks', bookmarks);
        this.populateBookmarks();
        this.showNotification('Bookmark deleted', 'success');
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
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        // Add to page
        document.body.appendChild(notification);
        
        // Animate in
        setTimeout(() => notification.classList.add('show'), 10);
        
        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
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
        const isPinned = tabElement.classList.toggle('pinned');
        pinBtn.style.color = isPinned ? '#ffd700' : '#666';
        // Move pinned tabs to top
        const container = document.querySelector('.tabs-container');
        if (!container) return;
        const tabs = Array.from(container.children);
        const pinned = tabs.filter(t => t.classList.contains('pinned'));
        const others = tabs.filter(t => !t.classList.contains('pinned'));
        // Re-append in order
        [...pinned, ...others].forEach(t => container.appendChild(t));
    }

    setupTabSearch() {
        const search = document.getElementById('tab-search');
        if (!search) return;
        
        // Ultra-fast tab search with minimal debouncing
        const debounce = (fn, d = 5) => { 
            let t; 
            return (...a) => { 
                clearTimeout(t); 
                t = setTimeout(() => fn(...a), d); 
            }; 
        };
        
        const filter = debounce((q) => {
            const query = (q || '').toLowerCase().trim();
            const tabs = document.querySelectorAll('.tabs-container .tab');
            
            // Direct filtering for maximum speed
            tabs.forEach(tab => {
                const title = tab.querySelector('.tab-title')?.textContent?.toLowerCase() || '';
                const url = this.tabs.get(parseInt(tab.dataset.tabId))?.url?.toLowerCase() || '';
                const match = title.includes(query) || url.includes(query);
                tab.style.display = match ? '' : 'none';
            });
        });
        
        search.addEventListener('input', (e) => filter(e.target.value));
    }

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle');
        const icon = toggleBtn.querySelector('i');
        
        sidebar.classList.toggle('hidden');
        
        if (sidebar.classList.contains('hidden')) {
            icon.className = 'fas fa-bars';
        } else {
            icon.className = 'fas fa-times';
        }
    }

    toggleNavMenu() {
        const navMenu = document.getElementById('nav-menu');
        if (navMenu.classList.contains('hidden')) {
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
        }, 200); // Match animation duration
    }

    setupSidebarSlideBack() {
        const hoverArea = document.getElementById('sidebar-hover-area');
        const sidebar = document.getElementById('sidebar');
        
        let slideBackTimeout;
        
        console.log('Setting up sidebar slide-back, hover area:', hoverArea);
        
        hoverArea.addEventListener('mouseenter', () => {
            console.log('Mouse entered hover area, sidebar hidden:', sidebar.classList.contains('hidden'));
            if (sidebar.classList.contains('hidden')) {
                clearTimeout(slideBackTimeout);
                sidebar.style.width = '300px';
                sidebar.style.opacity = '1';
                sidebar.style.transform = 'translateX(0)';
                sidebar.style.transition = 'all 0.3s ease';
                sidebar.style.pointerEvents = 'auto';
                console.log('Sidebar slide-back triggered');
            }
        });
        
        hoverArea.addEventListener('mouseleave', () => {
            console.log('Mouse left hover area');
            if (sidebar.classList.contains('hidden')) {
                slideBackTimeout = setTimeout(() => {
                    sidebar.style.width = '0';
                    sidebar.style.opacity = '0';
                    sidebar.style.transform = 'translateX(-20px)';
                    sidebar.style.pointerEvents = 'none';
                    console.log('Sidebar slide-back hidden');
                }, 200);
            }
        });
    }

    // Removed setupSidebarResizing method

    showTabContextMenu(e, tabId) {
        const contextMenu = document.getElementById('tab-context-menu');
        if (contextMenu) {
            contextMenu.style.left = e.pageX + 'px';
            contextMenu.style.top = e.pageY + 'px';
            contextMenu.style.display = 'block';
            contextMenu.classList.remove('hidden');
            this.contextMenuTabId = tabId;
        }
    }

    hideTabContextMenu() {
        const contextMenu = document.getElementById('tab-context-menu');
        if (contextMenu) {
            contextMenu.classList.add('hidden');
            contextMenu.style.display = 'none';
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
            downloadsPanel.classList.remove('hidden');
            if (backdrop) backdrop.classList.remove('hidden');
            this.populateDownloads();
        } else {
            this.closePanelWithAnimation(downloadsPanel);
            if (backdrop) backdrop.classList.add('hidden');
        }
    }

    async populateDownloads() {
        const downloadsList = document.getElementById('downloads-list');
        const downloads = await this.getDownloads();
        
        downloadsList.innerHTML = '';
        
        if (downloads.length === 0) {
            downloadsList.innerHTML = '<div class="empty-state">No downloads</div>';
            return;
        }
        
        downloads.forEach(download => {
            const downloadItem = document.createElement('div');
            downloadItem.className = 'download-item';
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
        });
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
            await window.electronAPI.deleteDownload(id);
            this.populateDownloads();
            this.showNotification('Download deleted', 'success');
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
            loadingBar.classList.add('loading');
        }
    }

    hideLoadingIndicator() {
        const loadingBar = document.getElementById('loading-bar');
        if (loadingBar) {
            loadingBar.classList.remove('loading');
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
                    ${isPinned ? '<i class="fas fa-thumbtack tab-pin"></i>' : ''}
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
        let draggedTab = null;
        let draggedIndex = -1;

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
                    const dropIndex = Array.from(tabsContainer.children).indexOf(tab);
                    const isAbove = tab.classList.contains('drag-over-top');
                    
                    // Calculate new position
                    let newIndex = dropIndex;
                    if (isAbove) {
                        newIndex = dropIndex;
                    } else {
                        newIndex = dropIndex + 1;
                    }
                    
                    // Adjust for the fact that we're removing the dragged element
                    if (draggedIndex < newIndex) {
                        newIndex--;
                    }
                    
                    // Move the tab
                    this.moveTab(draggedIndex, newIndex);
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
        panel.classList.add('closing');
        
        // Remove the panel after animation completes
        setTimeout(() => {
            panel.classList.add('hidden');
            panel.classList.remove('closing');
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
            webview.src = searchUrl;
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
        
        // Limit to 5 visible suggestions
        const visibleSuggestions = suggestions.slice(0, 5);
        
        // Add new suggestions without resetting animations
        visibleSuggestions.forEach((suggestion, index) => {
            const suggestionEl = document.createElement('div');
            suggestionEl.className = 'spotlight-suggestion-item';
            
            suggestionEl.innerHTML = `
                <div class="spotlight-suggestion-icon">
                    <i class="${suggestion.icon}"></i>
                </div>
                <div class="spotlight-suggestion-text">${suggestion.text}</div>
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
                } else if (suggestion.isSearch) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchQuery)}`;
                    const webview = document.getElementById('webview');
                    webview.src = searchUrl;
                } else if (suggestion.isHistory) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const webview = document.getElementById('webview');
                    webview.src = suggestion.url;
                } else if (suggestion.isCompletion) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(suggestion.searchQuery)}`;
                    const webview = document.getElementById('webview');
                    webview.src = searchUrl;
                } else if (suggestion.isUrl) {
                    this.closeSpotlightSearch();
                    this.createNewTab();
                    const webview = document.getElementById('webview');
                    webview.src = suggestion.url;
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

    isValidUrl(string) {
        try {
            new URL(string);
            return true;
        } catch (_) {
            // Check if it looks like a domain
            return /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/.test(string);
        }
    }
}

// Initialize the browser when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AxisBrowser();
});
