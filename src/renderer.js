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

        // Tab controls
        document.getElementById('add-tab-btn').addEventListener('click', () => {
            this.createNewTab();
        });

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

        // History
        document.getElementById('history-btn-footer').addEventListener('click', () => {
            this.toggleHistory();
        });
        document.getElementById('close-history').addEventListener('click', () => {
            this.toggleHistory();
        });

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

        // Bookmarks
        document.getElementById('bookmarks-btn-footer').addEventListener('click', () => {
            this.toggleBookmarks();
        });

        document.getElementById('close-bookmarks').addEventListener('click', () => {
            this.toggleBookmarks();
        });

        // Keyboard shortcuts
        document.getElementById('shortcuts-btn-footer').addEventListener('click', () => {
            this.toggleShortcuts();
        });

        document.getElementById('close-shortcuts').addEventListener('click', () => {
            this.toggleShortcuts();
        });

        // Backdrop click closes any open modal
        const backdrop = document.getElementById('modal-backdrop');
        if (backdrop) {
        backdrop.addEventListener('click', () => {
            document.getElementById('settings-panel').classList.add('hidden');
            document.getElementById('history-panel').classList.add('hidden');
            document.getElementById('downloads-panel').classList.add('hidden');
            document.getElementById('bookmarks-panel').classList.add('hidden');
            document.getElementById('shortcuts-panel').classList.add('hidden');
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
            // Show security info
            const webview = document.getElementById('webview');
            const url = webview.getURL();
            const title = webview.getTitle();
            alert(`Security Info:\n\nURL: ${url}\nTitle: ${title}\nProtocol: ${new URL(url).protocol}`);
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
            // Cmd/Ctrl + T - New tab
            if ((e.metaKey || e.ctrlKey) && e.key === 't') {
                e.preventDefault();
                this.createNewTab();
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
            
            // Cmd/Ctrl + Y - Open history
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                this.toggleHistory();
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
        // Debounced UI updates for smoother performance
        const debounce = (fn, delay = 80) => {
            let t;
            return (...args) => {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), delay);
            };
        };

        const debouncedUpdateNav = debounce(() => this.updateNavigationButtons());
        const debouncedUpdateUrl = debounce(() => this.updateUrlBar());
        const debouncedUpdateTitle = debounce(() => this.updateTabTitle());
        const debouncedUpdateSecurity = debounce(() => this.updateSecurityIndicator());

        webview.addEventListener('did-start-loading', () => {
            debouncedUpdateNav();
            document.querySelector('.webview-container').classList.add('loading');
        });

        webview.addEventListener('did-finish-load', () => {
            debouncedUpdateNav();
            debouncedUpdateUrl();
            debouncedUpdateTitle();
            debouncedUpdateSecurity();
            this.updateBookmarkButton();
            document.querySelector('.webview-container').classList.remove('loading');
            
            // Track page in history
            this.trackPageInHistory();
        });

        webview.addEventListener('did-fail-load', (event) => {
            console.error('Failed to load:', event.errorDescription);
            // Show error page or fallback
            this.showErrorPage(event.errorDescription);
        });

        webview.addEventListener('new-window', (event) => {
            // Handle new window requests
            event.preventDefault();
            this.navigate(event.url);
        });

        // Handle navigation events
        webview.addEventListener('will-navigate', (event) => {
            debouncedUpdateUrl();
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

    createNewTab(url = 'https://www.google.com') {
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
            url: url,
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

        // Switch to new tab
        this.switchToTab(tabId);

        // Navigate if URL provided
        if (url !== 'https://www.google.com') {
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
            if (webview.src !== tab.url) {
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
        urlBar.value = webview.getURL();
    }

    updateTabTitle() {
        const webview = document.getElementById('webview');
        const title = webview.getTitle() || 'New Tab';
        
        const tabElement = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
        if (tabElement) {
            const titleElement = tabElement.querySelector('.tab-title');
            titleElement.textContent = title;
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
        const shortcutsPanel = document.getElementById('shortcuts-panel');
        const bookmarksPanel = document.getElementById('bookmarks-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels if open
        shortcutsPanel.classList.add('hidden');
        bookmarksPanel.classList.add('hidden');
        
        settingsPanel.classList.toggle('hidden');
        if (backdrop) backdrop.classList.toggle('hidden', settingsPanel.classList.contains('hidden'));
        
        if (!settingsPanel.classList.contains('hidden')) {
            this.populateSettings();
        }
    }

    toggleShortcuts() {
        const shortcutsPanel = document.getElementById('shortcuts-panel');
        const settingsPanel = document.getElementById('settings-panel');
        const bookmarksPanel = document.getElementById('bookmarks-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels if open
        settingsPanel.classList.add('hidden');
        bookmarksPanel.classList.add('hidden');
        
        shortcutsPanel.classList.toggle('hidden');
        if (backdrop) backdrop.classList.toggle('hidden', shortcutsPanel.classList.contains('hidden'));
    }

    toggleBookmarks() {
        const bookmarksPanel = document.getElementById('bookmarks-panel');
        const settingsPanel = document.getElementById('settings-panel');
        const shortcutsPanel = document.getElementById('shortcuts-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        // Close other panels if open
        settingsPanel.classList.add('hidden');
        shortcutsPanel.classList.add('hidden');
        
        bookmarksPanel.classList.toggle('hidden');
        if (backdrop) backdrop.classList.toggle('hidden', bookmarksPanel.classList.contains('hidden'));
        
        if (!bookmarksPanel.classList.contains('hidden')) {
            this.populateBookmarks();
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
        const debounce = (fn, d = 120) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; };
        const filter = debounce((q) => {
            const query = (q || '').toLowerCase().trim();
            const tabs = document.querySelectorAll('.tabs-container .tab');
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
        navMenu.classList.toggle('hidden');
    }

    hideNavMenu() {
        const navMenu = document.getElementById('nav-menu');
        navMenu.classList.add('hidden');
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
    toggleHistory() {
        const panel = document.getElementById('history-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            backdrop.classList.remove('hidden');
            this.populateHistory();
        } else {
            panel.classList.add('hidden');
            backdrop.classList.add('hidden');
        }
    }

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
                this.toggleHistory();
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

    // Downloads management
    toggleDownloads() {
        const panel = document.getElementById('downloads-panel');
        const backdrop = document.getElementById('modal-backdrop');
        
        if (panel.classList.contains('hidden')) {
            panel.classList.remove('hidden');
            backdrop.classList.remove('hidden');
            this.populateDownloads();
        } else {
            panel.classList.add('hidden');
            backdrop.classList.add('hidden');
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
        webview.setZoomFactor(Math.min(currentZoom + 0.1, 3.0));
    }

    zoomOut() {
        const webview = document.getElementById('webview');
        const currentZoom = webview.getZoomFactor();
        webview.setZoomFactor(Math.max(currentZoom - 0.1, 0.25));
    }

    resetZoom() {
        const webview = document.getElementById('webview');
        webview.setZoomFactor(1.0);
    }

    setupLoadingScreen() {
        const loadingScreen = document.getElementById('loading-screen');
        const app = document.getElementById('app');
        
        // Quick blur-in effect
        setTimeout(() => {
            // Add blur-in effect to main app
            app.classList.add('loaded');
            
            // Hide loading screen quickly
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                
                // Remove loading screen from DOM
                setTimeout(() => {
                    loadingScreen.remove();
                }, 600);
            }, 100);
        }, 800); // Start blur-in after 0.8 seconds
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
}

// Initialize the browser when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new AxisBrowser();
});
