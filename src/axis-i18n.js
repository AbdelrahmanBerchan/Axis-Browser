'use strict';

/**
 * Axis UI language engine.
 * Translates shell chrome, Settings, menus, and setup - never guest websites.
 * Does not flip layout (never sets document.dir).
 */
(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof window !== 'undefined') window.AxisI18n = api;
    if (typeof globalThis !== 'undefined') globalThis.AxisI18n = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    const EN = {"app.name":"Axis","app.browser":"Axis Browser","app.about":"About {name}","app.hide":"Hide {name}","app.quit":"Quit {name}","app.quitAsk":"Quit Axis?","app.quitDetail":"Are you sure you want to exit Axis?","app.settingsCouldNotConnect":"Settings could not connect to Axis. Close this tab and open Settings again.","common.cancel":"Cancel","common.save":"Save","common.close":"Close","common.back":"Back","common.next":"Next","common.skip":"Skip","common.done":"Done","common.search":"Search","common.delete":"Delete","common.edit":"Edit","common.add":"Add","common.clear":"Clear","common.dismiss":"Dismiss","common.restart":"Restart","common.yes":"Yes","common.no":"No","common.ok":"OK","common.continue":"Continue","common.optional":"Optional","common.on":"On","common.off":"Off","common.name":"Name","common.create":"Create","common.allow":"Allow","common.block":"Block","common.notNow":"Not now","common.change":"Change","common.open":"Open","common.install":"Install","common.remove":"Remove","common.use":"Use","common.default":"Default","common.renameEllipsis":"Rename…","common.manage":"Manage","common.minutes":"minutes","common.recommended":"Recommended","common.left":"Left","common.right":"Right","common.dark":"Dark","common.light":"Light","common.system":"System","common.saveChanges":"Save Changes","common.justNow":"Just now","common.minutesAgo":"{n}m ago","common.hoursAgo":"{n}h ago","common.daysAgo":"{n}d ago","chrome.newTab":"New Tab","chrome.newTabGroup":"New Tab Group","chrome.newIncognito":"New Incognito Tab","chrome.newIncognitoWindow":"New Incognito Window","chrome.newWindow":"New Window","chrome.settings":"Settings","chrome.history":"History","chrome.downloads":"Downloads","chrome.notes":"Notes","chrome.library":"Library","chrome.extensions":"Extensions","chrome.aiChat":"AI Chat","chrome.ask":"Ask","chrome.chat":"Chat","chrome.clear":"Clear","chrome.clearUnpinned":"Clear all unpinned tabs","chrome.updateAvailable":"Update available","chrome.whatsNew":"What’s new","chrome.noTabs":"No tabs open","chrome.noTabsHint":"Create a new tab to start browsing","chrome.media":"Media","chrome.favorites":"Favorites","chrome.incognito":"Incognito","chrome.privateBrowsing":"Private browsing","chrome.newProfile":"New profile","menu.renameTab":"Rename Tab","menu.duplicateTab":"Duplicate Tab","menu.pinTab":"Pin Tab","menu.unpinTab":"Unpin Tab","menu.muteTab":"Mute Tab","menu.unmuteTab":"Unmute Tab","menu.changeIcon":"Change Icon","menu.addFavorite":"Add to Favorites","menu.closeTab":"Close Tab","menu.renameGroup":"Rename Tab Group","menu.duplicateGroup":"Duplicate Tab Group","menu.changeColor":"Change Color","menu.deleteGroup":"Delete Tab Group","menu.chooseColor":"Choose Color","menu.toggleSidebar":"Toggle Sidebar","menu.moveSidebarRight":"Move Sidebar Right","menu.moveSidebarLeft":"Move Sidebar Left","menu.openLinkNewTab":"Open Link in New Tab","menu.copyLink":"Copy Link Address","menu.openImageNewTab":"Open Image in New Tab","menu.saveImage":"Save Image","menu.copyImage":"Copy Image","menu.copyImageUrl":"Copy Image Address","menu.back":"Back","menu.forward":"Forward","menu.reload":"Reload","menu.cut":"Cut","menu.copy":"Copy","menu.paste":"Paste","menu.pasteMatchStyle":"Paste and Match Style","menu.selectAll":"Select All","menu.searchFor":"Search for “{text}”","menu.copyPageUrl":"Copy Page URL","menu.copyUrlMarkdown":"Copy URL as Markdown","menu.print":"Print…","menu.inspect":"Inspect Element","menu.settingsEllipsis":"Settings…","menu.shortcutsEllipsis":"Keyboard Shortcuts…","menu.focusUrl":"Focus Address Bar","menu.undo":"Undo","menu.find":"Find in Page…","menu.stop":"Stop Loading","menu.reloadPage":"Reload Page","menu.forceReload":"Force Reload","menu.devTools":"Toggle Developer Tools","menu.actualSize":"Actual Size","menu.zoomIn":"Zoom In","menu.zoomOut":"Zoom Out","menu.toggleChat":"Toggle Chat","menu.enterFullscreen":"Enter Full Screen","menu.exitFullscreen":"Exit Full Screen","menu.showHistory":"Show History","menu.clearHistoryEllipsis":"Clear Browsing History…","menu.closeWindow":"Close Window","menu.closeAllWindows":"Close All Windows","menu.file":"File","menu.edit":"Edit","menu.view":"View","menu.historyMenu":"History","menu.window":"Window","menu.help":"Help","menu.undoClose":"Undo Close / Sidebar Action","menu.pinUnpin":"Pin / Unpin Tab","menu.muteUnmute":"Mute / Unmute Tab","menu.nextTab":"Show Next Tab","menu.prevTab":"Show Previous Tab","menu.checkUpdates":"Check for Updates…","menu.emoji":"Emoji and Symbols","menu.hideOthers":"Hide Others","menu.showAll":"Show All","menu.services":"Services","menu.quit":"Quit","menu.newProfileEllipsis":"New Profile…","menu.editProfileEllipsis":"Edit Current Profile…","menu.deleteProfileEllipsis":"Delete Current Profile…","menu.noExtensions":"No extensions installed","menu.addExtensionCws":"Add extension (Chrome Web Store)","menu.addExtensionAmo":"Add extension (Firefox Add-ons)","menu.manageExtensions":"Manage Extensions…","menu.extensionOpenFailTitle":"Extension","menu.extensionOpenFail":"Could not open this extension.","menu.visitWebsite":"Visit Website","menu.viewLicense":"View License","menu.reportIssue":"Report an Issue","menu.reportVulnerability":"Report a Vulnerability","menu.donate":"Donate","menu.visitGithub":"Visit GitHub Page","menu.editProfileNamed":"Edit “{name}”…","menu.deleteProfileNamed":"Delete “{name}”…","menu.openLinkNewWindow":"Open Link in New Window","menu.openLinkIncognito":"Open Link in Incognito Window","menu.noSpelling":"No spelling suggestions","menu.addToDictionary":"Add to Dictionary","menu.speech":"Speech","menu.startSpeaking":"Start Speaking","menu.stopSpeaking":"Stop Speaking","menu.pasteAndGo":"Paste and Go","menu.resetIcon":"Reset Icon","menu.removeFromGroup":"Remove from Tab Group","menu.moveToGroup":"Move to another tab group","menu.addToGroup":"Add to Tab Group","menu.copyLinkShort":"Copy Link","menu.updateLinkCurrent":"Update Link to Current Page","menu.updateFavoritePage":"Update Favorite to This Page","menu.updatePinnedPage":"Update Pinned Link to This Page","menu.removeFavorite":"Remove from Favorites","menu.editFavoriteUrl":"Edit Link…","menu.duplicateFavorite":"Duplicate","menu.moveFavoriteLeft":"Move Left","menu.moveFavoriteRight":"Move Right","menu.renameEllipsis":"Rename…","menu.showInFolder":"Show in Folder","menu.noDownloads":"No downloads","menu.revealFinder":"Reveal in Finder","menu.revealFile":"Show in folder","find.placeholder":"Search on this page...","find.prev":"Previous","find.next":"Next","ntp.addWidgets":"Add widgets","ntp.addWidget":"Add widget","ntp.edit":"Edit","ntp.askSetupTitle":"Add an API key to use Ask","ntp.askSetupDesc":"Add a key in Settings → AI Chat (Groq, OpenAI, Gemini, and more). Then you can chat here and in the sidebar AI panel.","ntp.openAiSettings":"Open AI settings","ntp.getFreeKey":"Get free key","ntp.greet.late1":"Up late, $name?","ntp.greet.late2":"Grind never stops?","ntp.greet.late3":"Getting a hyper-early start?","ntp.greet.late4":"Goodnight, $name.","ntp.greet.early1":"Early start?","ntp.greet.early2":"Good (early) Morning, $name!","ntp.greet.morning1":"Good Morning, $name.","ntp.greet.morning2":"It's a new day!","ntp.greet.afternoon1":"Good Afternoon, $name.","ntp.greet.evening1":"Good Evening, $name","ntp.greet.evening2":"Enjoy your evening.","ntp.greet.evening3":"Golden hour?","ntp.greet.night1":"Getting late","ntp.greet.night2":"Good night.","ntp.greet.fallback":"Hello, $name.","ai.setupTitle":"Set up AI chat","ai.setupDesc":"Add an API key in Settings → AI Chat to chat here and use Ask on the new tab page. Groq, OpenAI, Gemini, and more are supported.","ai.addKey":"Add API key in Settings","ai.getFreeKey":"Get a free API key","ai.setupPlaceholder":"Add an API key in Settings to start chatting","ai.quoteAsk":"Quote selection and ask in Chat","sidebar.installed":"Installed","sidebar.installInAxis":"Install in Axis","sidebar.openExtensions":"Open extensions menu","sidebar.manageExtensions":"Manage extensions…","sidebar.openDownloads":"Open Downloads","adblock.title":"Privacy protection","adblock.sessionSplit":"Ads · trackers · others","adblock.sessionTotal":"Blocked this session","adblock.fpOff":"Off","adblock.fpReady":"Ready","adblock.fpActive":"Active on this page","adblock.fingerprint":"Fingerprinting","adblock.cat.other":"Others","adblock.blockedListHint":"Each site Axis stopped on this page, with why it was blocked.","adblock.blockedList":"What was blocked","adblock.type.cspReport":"Reports","adblock.type.misc":"Other requests","adblock.type.page":"Pages","adblock.type.frame":"Embedded frames","adblock.type.ping":"Beacons","adblock.type.websocket":"WebSockets","adblock.type.stylesheet":"Stylesheets","adblock.type.image":"Images & pixels","adblock.type.request":"Network requests","adblock.everythingElseEmpty":"Uncategorized blocks","adblock.everythingElseHint":"Blocked items that aren’t clearly ads or trackers, by kind.","adblock.everythingElse":"Everything else","adblock.cat.trackers":"Trackers","adblock.cat.ads":"Ads","adblock.recentBlocks":"Recent blocks","adblock.protection":"Protection","adblock.breakdown":"Breakdown","adblock.details":"Details","adblock.blockedThisPage":"blocked this page","adblock.statusOn":"Blocking ads, trackers, and fingerprinting on this site.","adblock.allowSite":"Allow this site","adblock.turnOffEverywhere":"Turn off everywhere","security.secure":"Connection is secure","security.checking":"Checking connection…","security.certChain":"Certificate chain","vault.savePassword":"Save password?","vault.account":"Account","vault.card":"Card","vault.address":"Address","vault.storedLocal":"Stored only on this Mac.","vault.chooseItem":"Choose an item","vault.savedPasswords":"Saved passwords","profile.new":"New profile","profile.hint":"Separate tabs, cookies, and settings from your other profiles.","profile.icon":"Icon","profile.deleteTitle":"Delete profile?","profile.deleteConfirm":"Delete profile","profile.deleteBody":"This profile will be moved to trash with its tabs, cookies, history, passwords, extensions, and settings. You can restore it from trash or press ⌘Z right after deleting.","profile.choose":"Choose which profile to edit","profile.label":"Profile","perm.allowSite":"Allow this site?","perm.extra":"This site is asking for an extra permission.","perm.cameraMic.title":"Use camera and microphone?","perm.cameraMic.detail":"This site wants to use your camera and microphone.","perm.camera.title":"Use your camera?","perm.camera.detail":"This site wants to use your camera.","perm.mic.title":"Use your microphone?","perm.mic.detail":"This site wants to use your microphone.","perm.geo.title":"Share your location?","perm.geo.detail":"This site wants to know your location.","perm.notify.title":"Show notifications?","perm.notify.detail":"This site wants to send you notifications.","perm.screen.title":"Share your screen?","perm.screen.detail":"This site wants to capture your screen.","perm.external.title":"Open an outside app?","perm.external.detail":"This site wants to open another application.","perm.clipRead.title":"Read the clipboard?","perm.clipRead.detail":"This site wants to read text from your clipboard.","perm.clipWrite.title":"Write to the clipboard?","perm.clipWrite.detail":"This site wants to write text to your clipboard.","perm.files.title":"Access files?","perm.files.detail":"This site wants access to files on your computer.","perm.midi.title":"Use MIDI devices?","perm.midi.detail":"This site wants to connect to MIDI devices.","perm.midiSysex.title":"Use MIDI devices?","perm.midiSysex.detail":"This site wants full MIDI system access.","perm.windows.title":"Manage windows?","perm.windows.detail":"This site wants to place or resize windows.","perm.speakers.title":"Choose speakers?","perm.speakers.detail":"This site wants to pick an audio output.","perm.fullscreen.title":"Go full screen?","perm.fullscreen.detail":"This site wants to enter full screen.","perm.pointer.title":"Lock the pointer?","perm.pointer.detail":"This site wants to lock your mouse pointer.","perm.keyboard.title":"Lock keyboard keys?","perm.keyboard.detail":"This site wants to capture special keyboard keys.","perm.idle.title":"Detect when you are idle?","perm.idle.detail":"This site wants to know when you are away.","perm.storage.title":"Access site storage?","perm.storage.detail":"This site wants access to cookies or storage across sites.","perm.drm.title":"Use protected media?","perm.drm.detail":"This site wants to play protected (DRM) media.","perm.usb.title":"Connect a USB device?","perm.usb.detail":"This site wants to connect to a USB device.","perm.hid.title":"Connect an HID device?","perm.hid.detail":"This site wants to connect to an HID device.","perm.serial.title":"Connect a serial port?","perm.serial.detail":"This site wants to connect to a serial port.","perm.bluetooth.title":"Use Bluetooth?","perm.bluetooth.detail":"This site wants to use Bluetooth devices.","perm.sensors.title":"Use device sensors?","perm.sensors.detail":"This site wants access to motion or environment sensors.","perm.dialogTitle":"Axis - site permission","ext.installTitle":"Install Extension","ext.installFolder":"Choose an unpacked Chrome extension folder that contains manifest.json","ext.installCrxTitle":"Install Extension from .crx","ext.installCrx":"Choose a Chrome extension package (.crx)","note.copiedLink":"Link copied to clipboard","note.copiedImage":"Image copied to clipboard","note.copiedImageUrl":"Image URL copied to clipboard","note.copyFailed":"Could not copy to clipboard","note.imageUrlFailed":"Could not resolve image address","note.openedNewTab":"Opened in new tab","note.copyLinkFailed":"Could not copy link","note.iconReset":"Icon reset","note.settingsUrlCopied":"Settings URL copied","note.pageSlow":"Page is taking too long to load. You can try refreshing.","note.reopened":"Reopened: {title}","note.noClosedTabs":"No closed tabs to recover","note.recovered":"Recovered: {title}","note.nothingToPrint":"Nothing to print on this page.","note.unableToPrint":"Unable to print this page.","note.openingPermissions":"Opening Site permissions in Settings","note.notesLoadError":"Error loading notes","note.noteSaved":"Note saved!","note.noteSaveError":"Error saving note","note.noteDeleted":"Note deleted","note.noteDeleteError":"Error deleting note","note.favoriteUpdated":"Favorite link updated","note.pinnedUpdated":"Pinned link updated","note.favoriteWebOnly":"Only website tabs can be added to Favorites","note.groupDuplicated":"Tab group duplicated","note.noUrl":"No URL to copy","note.urlCopied":"URL copied to clipboard","note.copyUrlFailed":"Failed to copy URL","note.mdCopied":"Markdown link copied to clipboard","note.copyMdFailed":"Failed to copy","note.profileTrashed":"“{name}” moved to trash. Press ⌘Z to undo.","note.clipboardReadFailed":"Could not read clipboard.","note.historyDeleted":"History item deleted","note.historyDeleteFailed":"Failed to delete history item","note.historyCleared":"History cleared","note.historyClearFailed":"Failed to clear history","note.openItemFailed":"Failed to open item","note.openFileFailed":"Failed to open file","note.shortcutsSaved":"Keyboard shortcuts saved","note.shortcutsReset":"Keyboard shortcuts reset to defaults","note.cardSaved":"Card saved","note.addressSaved":"Address saved","note.passwordSaved":"Password saved","note.extensionRemoved":"Extension removed","note.httpsOnly":"This page uses HTTP (not HTTPS). Your connection would not be encrypted on this site.\n\nContinue to:\n{url}","note.favoriteName":"Favorite name:","note.clearAllData":"Are you sure you want to delete all browsing data? This will clear your history and cookies.","note.deleteNoteNamed":"Delete note “{title}”?","note.deleteGroupNamed":"Delete tab group “{name}”? Tabs will be moved back to the sidebar.","note.removeExtensionNamed":"Remove {name}?","note.thisExtension":"this extension","notes.create":"Create New Note","notes.createHint":"Start writing your thoughts","notes.saved":"Saved Notes","notes.empty":"No notes yet","notes.emptyHint":"Create your first note to get started","legacy.privacy":"Privacy & Security","legacy.navigation":"Navigation","legacy.tabManagement":"Tab Management","legacy.panels":"Panels & Menus","legacy.zoom":"Zoom Controls","legacy.data":"Data Management","legacy.browser":"Browser Controls","legacy.switchTabs":"Switch to tab 1-9","legacy.openHistory":"Open History","legacy.openDownloads":"Open Downloads","legacy.find":"Find in Page","legacy.openSettings":"Open Settings","legacy.clearHistory":"Clear History","legacy.goBack":"Go Back","legacy.goForward":"Go Forward","legacy.closeModals":"Close Search/Modals","legacy.recoverTab":"Recover Closed Tab","legacy.refresh":"Refresh Page","legacy.focusUrl":"Focus URL Bar","settings.title":"Settings","settings.search":"Search settings...","settings.searchEmpty":"No matching settings","settings.nav.general":"General","settings.nav.newtab":"New Tab","settings.nav.ai":"AI Chat","settings.nav.history":"History","settings.nav.shortcuts":"Shortcuts","settings.nav.permissions":"Site permissions","settings.nav.extensions":"Extensions","settings.nav.profiles":"Profiles","settings.nav.vault":"Passwords, cards & addresses","settings.nav.incognito":"Incognito","settings.incognitoBanner":"These options apply only to private windows. History, site permissions, extensions, and saved passwords stay off.","settings.language.title":"Language","settings.language.universalTitle":"Universal language","settings.language.universalDesc":"Use the language above for every profile and Incognito. When this is off, each profile can pick its own language.","onboarding.language.universalTitle":"Use this language for every profile","onboarding.language.universalDesc":"Applies to all profiles and Incognito. You can change this later in Settings.","settings.language.desc":"Menus, Settings, setup, and the rest of Axis. Websites keep their own language. The layout does not flip.","settings.language.search":"Search languages","settings.group.appearance":"Appearance","settings.group.tabs":"Tabs","settings.group.theme":"Theme","settings.group.speech":"Speech","settings.group.ambient":"Ambient audio","settings.group.permissions":"Site permission overrides","settings.group.extensions":"Extensions","settings.group.installed":"Installed","settings.group.startup":"Startup","settings.group.overview":"Overview","settings.group.trash":"Profile trash","settings.group.import":"Import from another browser","settings.group.newtab":"New Tab","settings.group.widgets":"Widgets","settings.group.ai":"AI Chat","settings.group.history":"Browsing History","settings.group.shortcuts":"Keyboard Shortcuts","settings.group.search":"Search","settings.group.privacy":"Privacy","settings.sidebarPosition.title":"Sidebar Position","settings.sidebarPosition.desc":"Choose where the sidebar appears - the same side is used for every profile in this window.","settings.sidebarZoom.title":"Sidebar zoom","settings.sidebarZoom.desc":"How large tabs, icons, and controls look in the sidebar. 100% matches the current default size.","settings.searchEngine.title":"Search Engine","settings.searchEngine.desc":"Default search engine","settings.fullUrl.title":"Always show full URL","settings.fullUrl.desc":"Show the complete address in the URL bar instead of a shortened version","settings.linkPreview.title":"Link preview","settings.linkPreview.desc":"Shows the destination URL at the bottom of the page when you hover a link.","settings.httpsOnly.title":"HTTPS-only mode","settings.httpsOnly.desc":"Ask before loading sites that use HTTP (not HTTPS). Localhost is always allowed.","settings.adblock.title":"Privacy protection","settings.adblock.desc":"Blocks ads, trackers, and common fingerprinting tricks. Use the shield in the URL bar to turn it off everywhere or just for the current site.","settings.js.title":"JavaScript","settings.js.desc":"Allow sites to run JavaScript. Turn off for minimal, mostly static pages (many sites will break).","settings.unpinned.title":"Clear unpinned tabs","settings.unpinned.desc":"When unpinned tabs and tab groups are removed automatically. Pinned tabs and groups are never cleared.","settings.unpinned.appClose":"When the app closes","settings.unpinned.profileSwitch":"When switching profiles","settings.unpinned.30m":"Every 30 minutes","settings.unpinned.1h":"Every hour","settings.unpinned.6h":"Every 6 hours","settings.unpinned.12h":"Every 12 hours","settings.unpinned.24h":"Every day","settings.unpinned.7d":"Every week","settings.unpinned.custom":"Custom interval","settings.unpinned.never":"Never","settings.unpinned.customTitle":"Custom interval","settings.unpinned.customDesc":"How long to keep unpinned tabs before clearing (1 minute to 7 days)","settings.appearance.title":"Appearance","settings.appearance.desc":"Light, dark, or match your Mac or PC system setting for the Axis UI (tabs, sidebar, popups). Does not change this Settings window, the new tab page, or AI chat - those stay dark.","settings.themeColor.title":"Theme Color","settings.themeColor.desc":"Primary accent color","settings.gradient.title":"Enable Gradient","settings.gradient.desc":"Use gradient instead of solid color","settings.gradientColor.title":"Gradient Color","settings.gradientColor.desc":"Second color for gradient","settings.gradientDir.title":"Gradient Direction","settings.glass.title":"Transparent sites (glass mode)","settings.glass.desc":"Clears common page shell backgrounds so the browser glass shows through; other tabs stay fully hidden so they do not bleed into the active page.","settings.siteTheme.title":"Site theme color","settings.siteTheme.desc":"Lets Axis adapt the browser theme color to the current website. Turn it off anytime to use your saved theme color again.","settings.windowChrome.title":"Window transparency","settings.windowChrome.desc":"How much your wallpaper or desktop shows through the browser frame (tab strip, sidebar, blur). Left: fully opaque. Right: most transparent. The middle is the default.","settings.speechEnable.title":"Enable Speech Menu","settings.speechEnable.desc":"Show Start/Stop Speaking options when text is selected","settings.speechVoice.title":"Voice","settings.speechVoice.desc":"System text-to-speech voice (from macOS / Windows / Linux)","settings.speechRate.title":"Speech Rate","settings.speechRate.desc":"How fast highlighted text is spoken","settings.speechPitch.title":"Speech Pitch","settings.speechPitch.desc":"Voice tone for spoken text","settings.ambientEnable.title":"Enable ambient audio","settings.ambientEnable.desc":"Optional subtle background sound while browsing (generated locally, no files downloaded)","settings.ambientMute.title":"Mute ambient when tab audio is playing","settings.ambientMute.desc":"Lowers ambient to silence while any tab outputs audible page audio (not when the tab is muted)","settings.ambientSound.title":"Sound","settings.ambientSound.desc":"Soft background bed generated on your device - no downloads","settings.ambientVolume.title":"Volume","settings.ambientVolume.desc":"Background level - changes apply right away","settings.startupWhen.title":"When Axis opens","settings.startupWhen.desc":"Which profile loads when you launch the app","settings.startupProfile.title":"Startup profile","settings.startupProfile.desc":"Used when Axis opens with the option above","settings.newWindows.title":"New windows","settings.newWindows.desc":"Which profile opens when you choose New Window from the menu","settings.ntpWelcome.title":"Show welcome","settings.ntpWelcome.desc":"Greeting above the search box","settings.ntpGreeting.title":"Greeting","settings.ntpGreeting.desc":"Time-of-day line above the search box - changes through the day","settings.ntpName.title":"Your name","settings.ntpName.desc":"Used in the greeting - defaults to User until you change it","settings.ntpAsk.title":"Ask AI in suggestions","settings.ntpAsk.desc":"Shows Search and Ask AI rows at the top when you type in the search box","settings.ntpGear.title":"Settings shortcut","settings.ntpGear.desc":"Gear in the bottom-left corner of New Tab - opens this New Tab section","settings.widgetsShow.title":"Show widgets","settings.widgetsShow.desc":"Tiles below search - use Edit on a New Tab to add or arrange them, or right-click the widgets area","settings.widgetsBg.title":"Widget backgrounds","settings.widgetsBg.desc":"Faint tile backgrounds behind each widget","settings.widgetsEdit.title":"Edit button","settings.widgetsEdit.desc":"Shows Edit under your tiles. If off, right-click the widgets area to edit (or press Escape to finish)","settings.widgetsClear.title":"Clear all widgets","settings.widgetsClear.desc":"Remove every tile from your layout","settings.aiShow.title":"Show AI features","settings.aiShow.desc":"Turn off to hide Ask on selected text, the chat sidebar, and Ask AI in the new tab search box","settings.aiKey.title":"Add API key","settings.aiKey.desc":"Groq, OpenAI, Gemini, OpenRouter, and Mistral are supported.","settings.incogSearch.title":"Search engine","settings.incogSearch.desc":"Used when you search from the Incognito address bar.","settings.incogHttps.title":"HTTPS-only mode","settings.incogHttps.desc":"Ask before loading insecure http:// pages.","settings.incogPreview.title":"Link preview","settings.incogPreview.desc":"Show the destination when you hover a link.","settings.incogAdblock.title":"Privacy protection","settings.incogAdblock.desc":"Block ads, trackers, and fingerprinting in private windows.","settings.incogJs.title":"JavaScript","settings.incogJs.desc":"Allow sites to run JavaScript in Incognito.","settings.incogAi.title":"Show AI chat","settings.incogAi.desc":"Turn on Chat in private windows. Keys stay separate from your other profiles.","settings.incogProvider.title":"Active provider","settings.incogProvider.desc":"Which saved key to use for private chat.","settings.aiLabel":"Label","settings.aiApiKey":"API key","settings.aiPasteKey":"Paste API key","settings.aiSaveKey":"Save key","settings.ai.editKey":"Edit API key","settings.ai.saveChanges":"Save changes","settings.ai.active":"Active","settings.speech.cloud":" (cloud)","settings.speech.voice":"Voice","settings.permissions.empty":"No sites yet. Add a site above to set overrides.","settings.permissions.invalidUrl":"Enter a valid URL or domain.","settings.extensions.empty":"No extensions installed. Use Install from store, .crx, or an unpacked folder.","settings.extensions.loadFail":"Could not load extensions.","settings.weather.searching":"Searching…","settings.history.empty":"No history","settings.history.loadFail":"Failed to load","settings.history.more":"Scroll for more…","settings.vault.noPasswords":"No saved passwords yet. Use + Add password or save from a login page.","settings.vault.noCards":"No saved cards yet.","settings.vault.noAddresses":"No saved addresses yet. Use + Add address or save from a checkout form.","settings.profiles.none":"No profiles found.","settings.profiles.noneTrash":"No deleted profiles.","settings.profiles.trashLoadFail":"Could not load profile trash.","settings.profiles.loadFail":"Could not load profiles.","settings.profiles.chooseBrowser":"Choose a browser first","settings.profiles.scanFail":"Could not scan for browsers","settings.profiles.readFail":"Could not read profiles","settings.profiles.scanProfileFail":"Could not scan this profile.","settings.profiles.noneFound":"No profiles found","shortcut.newTabSpotlight":"New Tab / Spotlight","shortcut.newWindow":"New Window","shortcut.nextTab":"Show Next Tab","shortcut.prevTab":"Show Previous Tab","shortcut.nextProfile":"Switch to Next Profile","shortcut.prevProfile":"Switch to Previous Profile","shortcut.undo":"Undo","shortcut.refresh":"Refresh Page","shortcut.focusUrl":"Focus URL Bar","shortcut.duplicateTab":"Duplicate Tab","shortcut.find":"Find in Page","shortcut.selectAll":"Select All","shortcut.pasteMatch":"Paste and Match Style","shortcut.print":"Print Page","shortcut.copyUrl":"Copy Current URL","shortcut.copyMd":"Copy URL as Markdown","shortcut.pinUnpin":"Pin / Unpin Tab","shortcut.muteUnmute":"Mute / Unmute Tab","shortcut.zoomIn":"Zoom In","shortcut.zoomOut":"Zoom Out","shortcut.resetZoom":"Reset Zoom","shortcut.toggleSidebar":"Toggle Sidebar","shortcut.openHistory":"Open History","shortcut.openDownloads":"Open Downloads","shortcut.openChat":"Open Chat","shortcut.openSettings":"Open Settings","shortcut.clearHistory":"Clear History","shortcut.switchTab":"Switch to tab {n}","shortcut.closeTab":"Close Tab","shortcut.newTab":"New Tab","onboarding.welcome":"Welcome.","onboarding.start":"Start","onboarding.skip":"Skip setup","onboarding.back":"Back","onboarding.continue":"Continue","onboarding.openAxis":"Open Axis","onboarding.progress":"{n} of {total} · {label}","onboarding.stepper":"Setup progress","onboarding.language.label":"Language","onboarding.language.title":"Your language","onboarding.language.desc":"This is for Axis itself: menus, Settings, and setup. Websites keep their own language. Turn on Universal language if you want this choice for every profile and Incognito.","onboarding.language.search":"Search languages","onboarding.default.label":"Default","onboarding.default.title":"Default browser","onboarding.default.desc":"Open web links from other apps in Axis. You can change this later in system settings.","onboarding.default.yes":"Yes, set as default","onboarding.default.yesSub":"Use Axis for http and https links","onboarding.default.no":"Not now","onboarding.default.noSub":"Keep your current default browser","onboarding.default.already":"Axis is already your default browser.","onboarding.search.label":"Search","onboarding.search.title":"Search engine","onboarding.search.desc":"Used from the address bar and New Tab. Change anytime in Settings.","onboarding.data.label":"Data","onboarding.data.title":"Your browsing data","onboarding.data.desc":"Import from Chrome, Edge, Firefox, and other browsers on this computer - or start clean.","onboarding.data.import":"Import","onboarding.data.importSub":"Favorites, passwords, history, tabs, and more","onboarding.data.fresh":"Start fresh","onboarding.data.freshSub":"Skip import - you can do this later in Settings","onboarding.import.label":"Import","onboarding.import.title":"Import","onboarding.import.desc":"Choose a browser, then profiles and what to bring over. The first profile merges into your current Axis profile; extras become new ones.","onboarding.import.browser":"Browser","onboarding.import.looking":"Looking for browsers…","onboarding.import.none":"No supported browsers with profiles were found. You can import later from Settings → Profiles, or go back and start fresh.","onboarding.import.profiles":"Profiles","onboarding.import.all":"All profiles","onboarding.import.allSub":"Bring everything over","onboarding.import.pick":"Choose","onboarding.import.pickSub":"Pick specific ones","onboarding.import.what":"What to import","onboarding.import.loadingProfiles":"Loading profiles…","onboarding.import.noProfiles":"No profiles found in that browser.","onboarding.import.profileCount":"{count} profile","onboarding.import.profileCountPlural":"{count} profiles","onboarding.import.opt.favorites":"Favorites & pinned tabs","onboarding.import.opt.favoritesDesc":"→ Favorites in Axis","onboarding.import.opt.bookmarks":"Bookmarks","onboarding.import.opt.bookmarksDesc":"→ Pinned tabs","onboarding.import.opt.folders":"Tab groups","onboarding.import.opt.foldersDesc":"From bookmark folders","onboarding.import.opt.tabs":"Open tabs","onboarding.import.opt.tabsDesc":"→ Unpinned tabs (off by default)","onboarding.import.opt.history":"History","onboarding.import.opt.historyDesc":"Sites you’ve visited","onboarding.import.opt.passwords":"Passwords","onboarding.import.opt.passwordsDesc":"Saved logins","onboarding.import.opt.cards":"Payment cards","onboarding.import.opt.cardsDesc":"Saved card details","onboarding.import.opt.addresses":"Addresses","onboarding.import.opt.addressesDesc":"Autofill addresses","onboarding.import.opt.permissions":"Site permissions","onboarding.import.opt.permissionsDesc":"Camera, mic, location, notifications","onboarding.import.opt.extensions":"Extensions","onboarding.import.opt.extensionsDesc":"Re-download when possible","onboarding.look.label":"Look","onboarding.look.title":"Look & layout","onboarding.look.desc":"Appearance for menus and chrome, your theme color, and which side the sidebar sits on.","onboarding.look.appearance":"Appearance","onboarding.look.themeColor":"Theme color","onboarding.look.anyColor":"Any color","onboarding.look.sidebar":"Sidebar","onboarding.look.leftSub":"Tabs on the left (default)","onboarding.look.rightSub":"Tabs on the right","onboarding.you.label":"You","onboarding.you.title":"What should we call you?","onboarding.you.desc":"Used in the New Tab greeting. You can change this later in Settings.","onboarding.you.name":"Your name","onboarding.features.label":"Features","onboarding.features.title":"Features","onboarding.features.desc":"A few core options - change anything later in Settings.","onboarding.features.extras":"Extras","onboarding.features.adblock":"Privacy protection","onboarding.features.adblockDesc":"Blocks ads, trackers, and fingerprinting. Use the shield in the URL bar for site exceptions.","onboarding.features.ai":"AI features","onboarding.features.aiDesc":"Ask AI, chat, and related New Tab options.","onboarding.features.unpinned":"Clear unpinned tabs","onboarding.features.unpinnedHint":"Pinned tabs stay. Unpinned tabs and groups follow this rule.","onboarding.features.appClose":"When Axis closes","onboarding.features.appCloseSub":"Clear when you quit the app","onboarding.features.custom":"Custom interval","onboarding.features.customSub":"Set your own time","onboarding.features.daily":"Every day","onboarding.features.dailySub":"Clear once a day","onboarding.features.never":"Never","onboarding.features.neverSub":"Keep them until you close them","onboarding.features.customLabel":"Custom","onboarding.features.clearAfter":"Clear after","onboarding.ready.label":"Ready","onboarding.ready.title":"You’re ready","onboarding.ready.desc":"Review what we’ll apply, then open Axis.","onboarding.ready.defaultBrowser":"Default browser","onboarding.ready.setDefault":"Set Axis as default","onboarding.ready.keepDefault":"Keep current default","onboarding.ready.search":"Search","onboarding.ready.import":"Import","onboarding.ready.data":"Data","onboarding.ready.fresh":"Start fresh","onboarding.ready.look":"Look","onboarding.ready.matchSystem":"Match system","onboarding.ready.sidebar":"Sidebar {side}","onboarding.ready.language":"Language","onboarding.ready.name":"Name","onboarding.ready.notSet":"Not set","onboarding.ready.features":"Features","onboarding.ready.allOff":"All off","onboarding.ready.clearTabs":"Clear tabs","onboarding.ready.everyMinutes":"Every {n} minutes","onboarding.ready.imported":"Imported {count} profile.","onboarding.ready.importedPlural":"Imported {count} profiles.","onboarding.ready.importFinished":"Import finished.","onboarding.ready.importProblems":"Import had problems - you can retry in Settings → Profiles.","onboarding.skip.timeLeft":"Less than a minute left","onboarding.skip.title":"Are you sure?","onboarding.skip.body":"Setup usually takes less than a minute - it doesn’t collect personal information or install bloatware. You can always change things later in Settings.","onboarding.skip.stay":"Stay in Setup","onboarding.skip.exit":"Exit Setup","onboarding.skip.notAdvised":"Not advised","menu.tabs":"Tabs","menu.profiles":"Profiles","menu.extensions":"Extensions","chrome.searchOrUrl":"Search or Enter URL...","chrome.messageAi":"Message AI…","chrome.messageAiAria":"Message AI","chrome.searchOrUrlAria":"Search or URL","chrome.send":"Send","chrome.sendEnter":"Send (Enter)","chrome.goBack":"Go Back","chrome.goForward":"Go Forward","chrome.reload":"Reload","chrome.copyLinkShort":"Copy Link","chrome.securityInfo":"Security Info","chrome.installExtension":"Install this extension in Axis","chrome.closeChat":"Close Chat","chrome.dragResize":"Drag to resize","chrome.attachImage":"Attach image (up to 4)","chrome.newTabSettings":"New tab settings","chrome.sidebarActions":"Sidebar actions","chrome.widgets":"Widgets","chrome.addWidgetsAria":"Add widgets to new tab","chrome.goToTab":"Go to tab","chrome.playPause":"Play or pause","chrome.back10":"Back 10 seconds","chrome.forward10":"Forward 10 seconds","chrome.muteUnmute":"Mute or unmute","chrome.pip":"Picture in picture","chrome.pauseHide":"Pause and hide","chrome.switchProfile":"Switch profile","chrome.createProfile":"Create profile","chrome.resizeSidebar":"Resize sidebar","chrome.removeQuote":"Remove quote","chrome.downloadsFolder":"Open Downloads folder","chrome.pageSecurity":"Page security","chrome.savedPasswords":"Saved passwords","chrome.incognitoTitle":"Axis - Incognito","history.search":"Search history...","history.clearAll":"Clear All History","notes.search":"Search notes...","notes.titlePlaceholder":"Note title...","notes.contentPlaceholder":"Start writing your note...","notes.saveShortcut":"Save (Ctrl+S)","profile.namePlaceholder":"Profile name","settings.shortcut.disabled":"Disabled","settings.shortcut.disable":"Disable","settings.shortcut.enable":"Enable","settings.extensions.lead":"Browse a store below, open an add-on’s page, then use the blue Install in Axis bar (or the URL bar install icon). You can also paste a link or ID here, use a .crx file, or an unpacked folder. Axis is Chromium-based - some Firefox-only add-ons won’t run; Electron supports a subset of extension APIs.","settings.extensions.browse":"Browse stores","settings.extensions.chromeStore":"Chrome Web Store","settings.extensions.firefoxAddons":"Firefox add-ons","settings.extensions.installUrl":"Install from URL or ID","settings.extensions.installDisk":"Install from disk","settings.extensions.hint":"Works with Chrome Web Store and Mozilla Add-ons listings. IDs and slugs are fetched inside Axis (no stray package downloads).","settings.extensions.urlPlaceholder":"Store URL, Chrome extension ID, or Firefox slug (e.g. ublock-origin)…","settings.extensions.chooseCrx":"Choose .crx file…","settings.extensions.chooseFolder":"Choose unpacked folder…","settings.ai.intro":"Connect an AI provider for sidebar chat and new tab Ask. Keys stay on this profile on your device only.","settings.ai.empty":"No API keys saved yet. Add one below to use chat and Ask.","settings.ai.provider":"Provider","settings.ai.labelPlaceholder":"Optional, e.g. Work","settings.ai.getKey":"Get a key","settings.ai.waitingAuth":"Waiting for authentication…","settings.ai.authCancelled":"Authentication cancelled","settings.ai.verifyFail":"Could not verify identity","settings.ai.showKey":"Show API key","settings.ambient.focus":"Deep focus","settings.ambient.ocean":"Ocean breeze","settings.ambient.still":"Night still","settings.gradient.bottom":"Bottom","settings.gradient.top":"Top","settings.gradient.diagonal":"Diagonal","ntp.widget.weather":"Weather","ntp.widget.weatherDesc":"Current conditions for any city","ntp.widget.clock":"Clock","ntp.widget.clockDesc":"Local time that stays up to date","ntp.widget.worldclock":"World Clock","ntp.widget.worldclockDesc":"Time in any city worldwide","ntp.widget.airquality":"Air Quality","ntp.widget.airqualityDesc":"AQI and particles for any city","ntp.widget.markets":"Markets","ntp.widget.marketsDesc":"Live quotes for the symbols you pick","ntp.widget.calendar":"Calendar","ntp.widget.calendarDesc":"Month view that follows your calendar type","ntp.widget.loading":"Loading…","ntp.widget.fetchingForecast":"Fetching forecast","ntp.widget.fetchingAqi":"Fetching AQI","ntp.widget.noCity":"No city yet","ntp.widget.pickCity":"Pick a city in Settings","ntp.widget.cityNotFound":"City not found","ntp.widget.pickAnotherCity":"Pick another city in Settings","ntp.widget.unavailable":"Unavailable","ntp.widget.checkConnection":"Check your connection","ntp.widget.remove":"Remove widget","ntp.widget.resize":"Drag to resize","ntp.widget.aqGood":"Good","ntp.widget.aqModerate":"Moderate","ntp.widget.aqSensitive":"Unhealthy (sensitive)","ntp.widget.aqUnhealthy":"Unhealthy","ntp.widget.aqVery":"Very unhealthy","ntp.widget.aqHazard":"Hazardous","ntp.widget.aqFair":"Fair","ntp.widget.aqPoor":"Poor","ntp.widget.aqVeryPoor":"Very poor","ntp.widget.aqExtreme":"Extremely poor","ntp.widget.timeFormat":"Time format","ntp.widget.hour12":"12-hour","ntp.widget.hour24":"24-hour","ntp.widget.city":"City","ntp.widget.tickers":"Tickers","ntp.widget.tickersHint":"Search and pick up to 8 tickers. Use ↑ ↓ to reorder. Quotes update live on New Tab.","ntp.widget.cityHintWeather":"Type at least 2 letters, then choose a city from the list. Weather updates automatically.","ntp.widget.cityHintClock":"Type at least 2 letters, then choose a city. Time zone is set automatically.","ntp.widget.cityHintAq":"Type at least 2 letters, then choose a city. Air quality updates automatically.","ntp.widget.settingsEmpty":"No configurable widgets yet. Turn widgets on, then add tiles on a New Tab.","adblock.off":"Off","adblock.allowed":"Allowed","adblock.turnOnEverywhere":"Turn on everywhere","adblock.blockThisSite":"Block this site","adblock.statusOff":"Ads, trackers, and fingerprinting are not blocked in this profile.","adblock.statusNoSite":"Open a website to allow or block a specific site.","adblock.statusAllowed":"{site} is allowed - ads, trackers, and fingerprinting are not blocked here.","adblock.statusOnSite":"Blocking ads, trackers, and fingerprinting on {site}.","notes.count":"{n} notes","notes.countOne":"{n} note","chrome.openDownloads":"Open Downloads","ext.couldNotLoad":"Could not load extensions.","ext.useManage":"Use Manage extensions to add some.","security.heading":"Security"};
            Object.assign(EN, {
        'common.saving': 'Saving…',
        'common.saved': 'Saved',
        'common.saveError': 'Error saving',
        'common.processing': 'Processing…',
        'settings.language.universalPickerTitle': 'Universal language choice',
        'settings.language.universalPickerDesc':
            'Used for all profiles and Incognito while Universal language is on.',
        'settings.language.universalDesc':
            'Use one Axis language for every profile and Incognito. When this is off, each profile can pick its own language again.',
        'settings.language.desc':
            'Menus, Settings, setup, and the rest of Axis for this profile. Websites keep their own language. The layout does not flip.',
        'settings.font.title': 'UI font',
        'settings.font.desc':
            'Typeface for Axis menus, Settings, and the rest of the browser chrome for this profile. Websites keep their own fonts.',
        'settings.font.universalTitle': 'Universal font',
        'settings.font.universalDesc':
            'Use one Axis font for every profile and Incognito. When this is off, each profile can pick its own font again.',
        'settings.font.universalPickerTitle': 'Universal font choice',
        'settings.font.universalPickerDesc':
            'Used for all profiles and Incognito while Universal font is on.',
        'settings.font.default': 'Axis (Nunito)',
        'settings.font.system': 'System',
        'settings.font.serif': 'Georgia (Serif)',
        'settings.font.mono': 'System Mono',
        'settings.font.times': 'Times New Roman',
        'settings.font.cat.system': 'System & web-safe',
        'settings.font.cat.sans': 'Sans-serif',
        'settings.font.cat.serif': 'Serif',
        'settings.font.cat.mono': 'Monospace',
        'onboarding.language.universalTitle': 'Universal language',
        'onboarding.language.universalDesc':
            'Use this language for every profile and Incognito. You can change this later in Settings.',
        'onboarding.language.universalPickerDesc':
            'Language for every profile while Universal language is on.',
        'onboarding.language.desc':
            'Menus, Settings, and setup. Websites keep their own language.',
        'downloads.cancelled': 'Download cancelled',
        'downloads.empty': 'No recent downloads',
        'downloads.emptyHint': 'Your latest downloads will appear here.',
        'downloads.downloading': 'Downloading',
        'downloads.cancel': 'Cancel download',
        'downloads.minutesLeft': '{n} min left',
        'downloads.secondsLeft': '{n} sec left',
        'update.downloading': 'Downloading…',
        'update.installing': 'Installing…',
        'update.failed': 'Update failed',
        'vault.chooseLogin': 'Choose a login',
        'vault.chooseCard': 'Choose a card',
        'chrome.reorderProfile': 'Reorder profile',
        'chrome.profileOptions': 'Profile options',
        'chrome.noMatches': 'No matches',
        'chrome.untitledNote': 'Untitled Note',
        'chrome.startWriting': 'Start writing…',
        'chrome.tabMuted': 'Tab muted - click to unmute',
        'chrome.playingAudio': 'Playing audio',
        'chrome.searchEllipsis': 'Search…',
        'chrome.searchOrEnter': 'Search or enter address',
        'chrome.deleteTabGroup': 'Delete tab group',
        'profile.editProfile': 'Edit profile',
        'ext.remove': 'Remove extension',
        'ext.loaded': 'Loaded',
        'ext.needsReload': 'Needs reload',
        'ext.off': 'Off',
        'common.view': 'View',
        'common.hide': 'Hide',
        'menu.tabAncestry': 'Tab Ancestry',
        'ancestry.title': 'How you got here:',
        'ancestry.empty': 'No trail yet for this tab.',
        'ancestry.searchStep': 'Search: "{query}"',
        'ancestry.openedLink': 'Opened from link',
        'ancestry.duplicate': 'Duplicated tab',
        'ancestry.external': 'Opened from another app',
        'ancestry.favorite': 'Opened from Favorites',
        'ancestry.history': 'From browsing history',
        'ancestry.openStep': 'Open',
        'iconPicker.title': 'Choose icon',
        'iconPicker.emoji': 'Emoji',
        'iconPicker.icon': 'Icon',
        'shortcut.goBack': 'Go Back',
        'shortcut.goForward': 'Go Forward',
        'shortcut.hardReload': 'Reload Without Cache',
        'shortcut.addFavorite': 'Add to Favorites',
        'adblock.blockedThisPage': 'blocked this page',
        'adblock.blockedThisSession': 'blocked this session',
        'adblock.details': 'Details',
        'adblock.breakdown': 'Breakdown',
        'adblock.protection': 'Protection',
        'adblock.recentBlocks': 'Recent blocks',
        'adblock.cat.ads': 'Ads',
        'adblock.cat.trackers': 'Trackers',
        'adblock.cat.other': 'Others',
        'adblock.blockedList': 'What was blocked',
        'adblock.blockedListHint': 'Each site Axis stopped on this page, with why it was blocked.',
        'adblock.type.script': 'Script',
        'adblock.type.request': 'Network request',
        'adblock.type.image': 'Image / pixel',
        'adblock.type.stylesheet': 'Stylesheet',
        'adblock.type.font': 'Font',
        'adblock.type.media': 'Media',
        'adblock.type.websocket': 'WebSocket',
        'adblock.type.ping': 'Beacon',
        'adblock.type.frame': 'Embedded frame',
        'adblock.type.page': 'Page',
        'adblock.type.misc': 'Request',

        'adblock.everythingElse': 'Everything else',
        'adblock.everythingElseHint': 'Blocked items that aren’t clearly ads or trackers, by kind.',
        'adblock.everythingElseEmpty': 'Uncategorized blocks',
        'adblock.type.request': 'Network requests',
        'adblock.type.image': 'Images & pixels',
        'adblock.type.stylesheet': 'Stylesheets',
        'adblock.type.websocket': 'WebSockets',
        'adblock.type.ping': 'Beacons',
        'adblock.type.frame': 'Embedded frames',
        'adblock.type.page': 'Pages',
        'adblock.type.misc': 'Other requests',
        'adblock.type.cspReport': 'Reports',

        'adblock.fingerprint': 'Fingerprinting',
        'adblock.fpActive': 'Active on this page',
        'adblock.fpReady': 'Ready',
        'adblock.fpOff': 'Off',
        'adblock.sessionTotal': 'Blocked this session',
        'adblock.sessionSplit': 'Ads · trackers · others',
        'adblock.type.script': 'Scripts',
        'adblock.type.xhr': 'Requests',
        'adblock.type.fetch': 'Requests',
        'adblock.type.image': 'Images',
        'adblock.type.stylesheet': 'Styles',
        'adblock.type.font': 'Fonts',
        'adblock.type.media': 'Media',
        'adblock.type.websocket': 'Sockets',
        'adblock.type.other': 'Other',
        'adblock.type.subFrame': 'Frames',
        'adblock.title': 'Privacy protection',
        'adblock.statusOn': 'Blocking ads, trackers, and fingerprinting on this site.',
        'adblock.statusOff': 'Ads, trackers, and fingerprinting are not blocked in this profile.',
        'adblock.statusAllowed': '{site} is allowed - ads, trackers, and fingerprinting are not blocked here.',
        'adblock.statusOnSite': 'Blocking ads, trackers, and fingerprinting on {site}.',
        'settings.adblock.title': 'Privacy protection',
        'settings.adblock.desc':
            'Blocks ads, trackers, and common fingerprinting tricks. Use the shield in the URL bar to turn it off everywhere or just for the current site.',
        'settings.incogAdblock.title': 'Privacy protection',
        'settings.incogAdblock.desc': 'Block ads, trackers, and fingerprinting in private windows.',
        'onboarding.features.adblock': 'Privacy protection',
        'onboarding.features.adblockDesc':
            'Blocks ads, trackers, and fingerprinting. Use the shield in the URL bar for site exceptions.',
        'settings.ai.hideKey': 'Hide key',
        'settings.ai.showKey': 'Show key',
        'settings.ai.pasteKeyFirst': 'Paste an API key first',
        'settings.ai.saveChangesFail': 'Could not save those changes',
        'settings.ai.saveKeyFail': 'Could not save that key',
        'ntp.widget.searchTickers': 'Search stocks or crypto…',
        'ntp.widget.searchCities': 'Search cities worldwide…',
        'ntp.widget.calendarType': 'Calendar type',
        'ntp.widget.weekStarts': 'Week starts on',
        'ntp.widget.tempUnit': 'Temperature unit',
        'ntp.widget.layout': 'Layout',
        'ntp.widget.auto': 'Auto',
        'ntp.widget.day': 'Day',
        'ntp.widget.week': 'Week',
        'ntp.widget.month': 'Month',
        'ntp.widget.sunday': 'Sunday',
        'ntp.widget.monday': 'Monday',
        'ntp.widget.gregorian': 'Gregorian',
        'ntp.widget.islamic': 'Islamic',
        'ntp.widget.hebrew': 'Hebrew',
        'ntp.widget.persian': 'Persian',
        'ntp.widget.chinese': 'Chinese',
        'ntp.askAi': 'Ask AI',
        'ai.thinking': 'Thinking…',
        'ai.noVision':
            'Your active provider does not support images. Switch to a vision-capable key in Settings → AI Chat.',
        'ai.needKey': 'Add an API key in Settings → AI Chat to use this feature.',
        'chrome.closeTab': 'Close tab',
        'chrome.renameTabAria': 'Rename tab',
        'chrome.renameGroupAria': 'Rename tab group',
        'chrome.loadError': 'Unable to load page',
        'chrome.loadErrorHint': 'Please check the URL and try again.',
        'chrome.loadErrorOffline': 'Unable to load page. Please check your internet connection.',
        'chrome.searchWith': 'Search {engine}',
        'chrome.switchProfilePrivate': 'Private browsing - switch profile',
        'chrome.currentProfile': 'Current profile: {name}',
        'chrome.switchProfileNamed': 'Switch profile ({name})',
        'ntp.widget.pickDate': 'Pick a date',
        'ntp.widget.focusDone': 'Focus session complete',
        'notes.new': 'New note',
        'notes.noContent': 'No content',
        'vault.saveFail': 'Could not save',
        'ext.installAgain': 'Install again',
        'ext.installing': 'Installing…',
        'ext.installed': 'Installed',
        'ext.tryAgain': 'Try again',
        'ext.installInAxis': 'Install in Axis',
        'ext.downloadingInstall': 'Downloading and installing…',
        'profile.deleteNamed': 'Delete “{name}”?',
        'profile.deleteBodyNamed':
            '“{name}” will be moved to trash with its tabs, cookies, history, passwords, extensions, and settings. You can restore it from trash or press ⌘Z right after deleting.',
        'settings.history.clearConfirm': 'Clear all history?',
        'settings.shortcuts.resetConfirm': 'Reset all shortcuts to defaults?',
        'settings.vault.deletePasswordConfirm': 'Are you sure you want to delete this saved password?',
        'settings.vault.deleteCardConfirm': 'Are you sure you want to delete this saved card?',
        'settings.vault.deleteAddressConfirm': 'Are you sure you want to delete this saved address?',
        'settings.vault.editPassword': 'Edit password',
        'settings.vault.addPassword': 'Add password',
        'settings.vault.editCard': 'Edit card',
        'settings.vault.addCard': 'Add card',
        'settings.vault.editAddress': 'Edit address',
        'settings.vault.addAddress': 'Add address',
        'settings.shortcut.pressKeys': 'Press keys…',
        'chrome.imageLoadFail': 'Unable to load image',
        'settings.vault.heading': 'Passwords, cards & addresses',
        'settings.vault.savedLocal': 'Saved locally on this Mac. Not synced.',
        'settings.vault.autofill': 'Autofill on sites',
        'settings.vault.passwords': 'Passwords',
        'settings.vault.cards': 'Cards',
        'settings.vault.addresses': 'Addresses',
        'settings.vault.addPasswordBtn': '+ Add password',
        'settings.vault.addCardBtn': '+ Add card',
        'settings.vault.addAddressBtn': '+ Add address',
        'settings.vault.website': 'Website',
        'settings.vault.actions': 'Actions',
        'settings.closeAria': 'Close Settings',
        'settings.shortcuts.resetBtn': 'Reset to Defaults',
        'history.clearAllShort': 'Clear All',
        'settings.startup.resume': 'Resume last profile',
        'settings.profiles.exportBtn': 'Export…',
        'update.noUpdateTitle': 'No update available',
        'update.upToDate': "You're up to date",
        'update.aheadMessage': '{app} {ver} is newer than the latest public release',
        'update.aheadDetail':
            "You're running {ver}, which is ahead of the latest release on GitHub ({remote}{note}). No update is needed.",
        'update.matchDetail': '{app} {ver} matches the latest release on GitHub{note}.',
        'update.prereleaseNote': ' (pre-release)',
        'update.compareFailTitle': 'Could not compare versions',
        'update.compareFailMessage': 'Update check finished with an unexpected version format',
        'update.compareFailDetail': 'This app reports {cur}. GitHub latest is {remote}.',
        'update.viewOnGithub': 'View on GitHub',
        'update.checkFailTitle': 'Could not check for updates',
        'update.checkFailMessage': 'Update check failed',
        'update.checkFailDetail':
            'Check your internet connection and try again.\n\nYou can also visit GitHub to download releases manually.',
        'update.openReleases': 'Open GitHub releases',
        'update.unpackaged':
            'This copy of Axis isn’t installed, so it can’t replace itself. Use a built app to update.',
        'update.noInstaller':
            'No installer for this computer was found. Open the release page on GitHub instead.',
        'update.downloadFail': 'Could not download the update.',
        'update.noReady': 'No update is ready.',
        'app.aboutVersion': 'Version {ver}\n\nCopyright © 2026 Abdelrahman Berchan.',
        'vault.windowsHelloFail':
            'Axis could not verify you with Windows Hello. Set up Windows Hello (PIN or biometrics), then try again. A simple Confirm is not enough to unlock vault data.',
        'vault.noDeviceAuth':
            'This system does not support device authentication for Axis vault data. Sensitive vault actions are blocked until an OS unlock method is available.',
        'profile.deleteAuthReason': 'Delete this profile',
        'settings.permissions.lead':
            'Choose Allow, Block, or Default (no override) for each site. Camera and Microphone both apply when a page requests media (e.g. video calls). Saved per origin (scheme + host + port).',
        'settings.permissions.urlPh': 'example.com or https://site.org/…',
        'settings.permissions.addSite': 'Add site',
        'settings.permissions.listAria': 'Per-site permissions',
        'settings.startup.alwaysPersonal': 'Always Personal',
        'settings.startup.alwaysSpecific': 'Always a specific profile',
        'settings.startup.sameWindow': 'Same profile as the current window',
        'settings.profiles.overviewLead':
            'Each profile keeps its own tabs, favorites, history, extensions, and passwords. Switch profiles, add new ones, rename, or delete from the profile menu at the bottom of the sidebar.',
        'settings.profiles.colFavorites': 'Favorites',
        'settings.profiles.colHistory': 'History',
        'settings.profiles.colPinned': 'Pinned',
        'settings.profiles.colExtensions': 'Extensions',
        'settings.profiles.colStorage': 'Storage',
        'settings.profiles.exportBackup': 'Export backup',
        'settings.profiles.importBackup': 'Import backup…',
        'settings.profiles.trashLead':
            'Deleted profiles stay here until you restore them or remove them permanently. You can also press ⌘Z right after deleting to bring a profile back.',
        'settings.vault.username': 'Username or email',
        'settings.vault.password': 'Password',
        'settings.vault.notesOptional': 'Notes (optional)',
        'settings.vault.keepBlank': 'Leave blank to keep current',
        'settings.vault.viewPassword': 'View password',
        'settings.vault.labelOptional': 'Label (optional)',
        'settings.vault.cardholder': 'Name on card',
        'settings.vault.cardNumber': 'Card number',
        'settings.vault.exp': 'Exp.',
        'settings.vault.year': 'Year',
        'settings.vault.cvv': 'CVV',
        'settings.vault.expires': 'Expires',
        'settings.vault.billingZip': 'Billing ZIP (optional)',
        'settings.vault.fullName': 'Full name',
        'settings.vault.organization': 'Company (optional)',
        'settings.vault.street': 'Street address',
        'settings.vault.street2': 'Apt, suite, etc. (optional)',
        'settings.vault.city': 'City',
        'settings.vault.state': 'State / province',
        'settings.vault.postal': 'ZIP / postal',
        'settings.vault.country': 'Country (optional)',
        'settings.vault.phone': 'Phone (optional)',
        'settings.vault.email': 'Email (optional)',
        'settings.vault.waitingAuth': 'Waiting for authentication…',
        'settings.vault.authCancelled': 'Authentication cancelled',
        'settings.vault.authFailed': 'Could not verify identity',
        'settings.vault.noPasswords': 'No saved passwords',
        'settings.vault.noCards': 'No saved cards',
        'settings.vault.noAddresses': 'No saved addresses',
        'settings.vault.viewCardNumber': 'View card number',
        'settings.vault.viewCvv': 'View CVV',
        'vault.savePasswordTitle': 'Save password?',
        'vault.saveCardTitle': 'Save this card?',
        'vault.saveAddressTitle': 'Save this address?',
        'vault.saveCardSubtitle': 'Payment card',
        'vault.saveAddressSubtitle': 'Address',
        'settings.shortcut.conflict':
            'This shortcut is already used by “{name}”. Disable that shortcut and use it here?',
        'settings.shortcuts.active': 'Active',
        'settings.shortcuts.disabledSection': 'Disabled',
        'settings.shortcuts.noneDisabled': 'No shortcuts are disabled',
        'common.loading': 'Loading…',
        'ext.emptyInstalled': 'No extensions installed',
        'ai.typeMessage': 'Type your message…',
        'chrome.switchToTab': 'Switch to Tab',
        'chrome.searchBadge': 'Search',
        'security.insecure': 'Connection is not secure',
        'security.insecureHint': 'Do not enter passwords or payment details on this site.',
        'security.localFile': 'Local file',
        'security.localPage': 'Local page',
        'security.localHint': 'No internet connection is used for this page.',
        'security.certUntrusted': 'Certificate is not trusted',
        'security.secure': 'Connection is secure',
        'security.secureHint': 'Your connection to {host} is private.',
        'security.unknown': 'Unable to determine security status for this page.',
        'security.fact.connection': 'Connection',
        'security.fact.protocol': 'Protocol',
        'security.fact.cipher': 'Cipher',
        'security.fact.certificate': 'Certificate',
        'security.fact.issuedBy': 'Issued by',
        'security.fact.validUntil': 'Valid until',
        'security.fact.certDetails': 'Certificate details',
        'security.fact.site': 'Site',
        'security.val.notEncrypted': 'Not encrypted',
        'security.val.encrypted': 'Encrypted',
        'security.val.encryptedProblem': 'Encrypted (certificate problem)',
        'security.val.local': 'Local',
        'security.val.reloadCert': 'Reload this page, then open the lock again.',
        'security.checking': 'Checking connection…',
        'ntp.widget.marketsHead': 'Markets',
        'ntp.widget.loadingQuotes': 'Loading quotes…',
        'ntp.widget.addSymbols': 'Add symbols in Settings',
        'ntp.widget.symbolsHint': 'e.g. AAPL, BTC, ETH',
        'ntp.widget.prevMonth': 'Previous month',
        'ntp.widget.nextMonth': 'Next month',
        'ntp.widget.jumpToday': 'Jump to today',
        'ntp.widget.wetAhead': 'Wet conditions ahead',
        'ntp.widget.clearAhead': 'Clear skies ahead',
        'ntp.widget.cloudsAhead': 'Clouds through the day',
        'ntp.widget.lowVis': 'Low visibility',
        'ntp.widget.hiLo': 'H {hi}° · L {lo}°',
        'ntp.widget.euAqi': 'EU AQI',
        'ntp.widget.usAqi': 'US AQI',
        'vault.af.account': 'Account',
        'vault.af.username': 'Username',
        'vault.af.site': 'Site',
        'vault.af.address': 'Address',
        'vault.af.note': 'Note',
        'vault.af.card': 'Card',
        'vault.af.expiry': 'Expiry',
        'vault.af.dateAdded': 'Date Added',
        'vault.af.savedLogin': 'Saved login',
        'menu.editFavoriteUrl': 'Edit Link…',
        'menu.duplicateFavorite': 'Duplicate',
        'menu.moveFavoriteLeft': 'Move Left',
        'menu.moveFavoriteRight': 'Move Right',
        'ntp.wmo.0': 'Clear',
        'ntp.wmo.1': 'Clear',
        'ntp.wmo.2': 'Cloudy',
        'ntp.wmo.3': 'Overcast',
        'ntp.wmo.45': 'Fog',
        'ntp.wmo.48': 'Fog',
        'ntp.wmo.51': 'Drizzle',
        'ntp.wmo.53': 'Drizzle',
        'ntp.wmo.55': 'Rain',
        'ntp.wmo.61': 'Rain',
        'ntp.wmo.63': 'Rain',
        'ntp.wmo.65': 'Heavy rain',
        'ntp.wmo.71': 'Snow',
        'ntp.wmo.73': 'Snow',
        'ntp.wmo.75': 'Snow',
        'ntp.wmo.80': 'Showers',
        'ntp.wmo.81': 'Showers',
        'ntp.wmo.82': 'Storms',
        'ntp.wmo.95': 'Storm',
        'ntp.wmo.96': 'Storm',
        'ntp.wmo.99': 'Storm',
        'ntp.wmo.unknown': '-',
        'ntp.widget.local': 'Local',
        'ntp.widget.precipRain': 'Rain',
        'ntp.widget.precipSnow': 'Snow',
        'ntp.widget.precipSoon': '{label} possible soon',
        'ntp.widget.precipInMin': '{label} possible in {mins}m',
        'ntp.widget.precipInHour': '{label} possible in {hours}h'
    });
    const packs = Object.create(null);
    const HIDDEN_VARIANTS = { 'en-GB': 'en', 'en-US': 'en', 'es-419': 'es', 'fr-CA': 'fr' };
    let requested = 'en';
    let resolved = 'en';

    function sanitizeLocale(raw) {
        if (raw == null) return '';
        const s = String(raw).trim().replace(/_/g, '-');
        if (!s || s.length > 16) return '';
        if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/.test(s)) return '';
        const parts = s.split('-');
        parts[0] = parts[0].toLowerCase();
        for (let i = 1; i < parts.length; i++) {
            parts[i] = parts[i].length === 2 ? parts[i].toUpperCase() : parts[i];
        }
        if (parts[0] === 'zh' && parts[1] === 'TW') return 'zh-TW';
        if (parts[0] === 'zh' && (parts[1] === 'CN' || parts[1] === 'Hans')) return 'zh-CN';
        if (parts[0] === 'zh' && parts[1] === 'Hant') return 'zh-TW';
        if (parts[0] === 'pt' && parts[1] === 'BR') return 'pt-BR';
        if (parts[0] === 'pt' && parts[1] === 'PT') return 'pt-PT';
        const joined = parts.join('-');
        if (HIDDEN_VARIANTS[joined]) return HIDDEN_VARIANTS[joined];
        if (parts[0] === 'en') return 'en';
        if (parts[0] === 'es') return 'es';
        if (parts[0] === 'fr' && parts[1] === 'CA') return 'fr';
        return joined;
    }

    function hasTable(code) {
        if (!code) return false;
        if (code === 'en') return true;
        return !!(packs[code] && typeof packs[code] === 'object');
    }

    function resolveLocale(code) {
        const loc = sanitizeLocale(code) || 'en';
        if (hasTable(loc)) return loc;
        const base = loc.split('-')[0];
        if (base === 'zh') {
            if (hasTable('zh-CN')) return 'zh-CN';
            if (hasTable('zh-TW')) return 'zh-TW';
        }
        if (base === 'pt') {
            if (hasTable('pt-BR')) return 'pt-BR';
            if (hasTable('pt-PT')) return 'pt-PT';
        }
        if (base === 'en') return 'en';
        if (hasTable(base)) return base;
        return 'en';
    }

    function tableFor(code) {
        const r = resolveLocale(code);
        if (r === 'en') return EN;
        return packs[r] || EN;
    }

    function t(key, vars) {
        if (!key) return '';
        const k = String(key);
        let s = tableFor(resolved)[k];
        if (s == null || s === '') s = EN[k];
        if (s == null) s = k;
        s = String(s);
        if (vars && typeof vars === 'object') {
            s = s.replace(/\{(\w+)\}/g, function (_, name) {
                return vars[name] != null ? String(vars[name]) : '';
            });
        }
        return s;
    }

    function registerPacks(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const [code, table] of Object.entries(obj)) {
            const loc = sanitizeLocale(code);
            if (!loc || loc === 'en' || !table || typeof table !== 'object') continue;
            packs[loc] = Object.assign(packs[loc] || {}, table);
        }
        resolved = resolveLocale(requested);
    }

    function setLocale(code) {
        requested = sanitizeLocale(code) || 'en';
        resolved = resolveLocale(requested);
        if (typeof document !== 'undefined' && document.documentElement) {
            document.documentElement.lang = requested;
            document.documentElement.removeAttribute('dir');
        }
        return resolved;
    }

    function applyToDom(root) {
        const doc = root && root.querySelectorAll ? root : (typeof document !== 'undefined' ? document : null);
        if (!doc) return;
        const scope = root && root.querySelectorAll ? root : document;
        const all = (selector) => {
            const nodes = Array.from(scope.querySelectorAll(selector));
            if (scope.nodeType === 1 && scope.matches?.(selector)) nodes.unshift(scope);
            return nodes;
        };
        all('[data-i18n]').forEach((el) => {
            const key = el.getAttribute('data-i18n');
            if (!key) return;
            el.textContent = t(key);
        });
        all('[data-i18n-html]').forEach((el) => {
            const key = el.getAttribute('data-i18n-html');
            if (!key) return;
            el.textContent = t(key);
        });
        all('[data-i18n-placeholder]').forEach((el) => {
            const key = el.getAttribute('data-i18n-placeholder');
            if (!key) return;
            el.setAttribute('placeholder', t(key));
        });
        all('[data-i18n-title]').forEach((el) => {
            const key = el.getAttribute('data-i18n-title');
            if (!key) return;
            el.setAttribute('title', t(key));
        });
        all('[data-i18n-aria]').forEach((el) => {
            const key = el.getAttribute('data-i18n-aria');
            if (!key) return;
            el.setAttribute('aria-label', t(key));
        });
    }

    function observeDom(doc) {
        const target = doc && doc.documentElement ? doc : (typeof document !== 'undefined' ? document : null);
        if (!target?.documentElement || typeof MutationObserver === 'undefined') return null;
        if (target.__axisI18nObserver) return target.__axisI18nObserver;
        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes || []) {
                    if (node?.nodeType === 1) applyToDom(node);
                }
                if (record.type === 'attributes' && record.target?.nodeType === 1) {
                    applyToDom(record.target);
                }
            }
        });
        observer.observe(target.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: [
                'data-i18n',
                'data-i18n-html',
                'data-i18n-placeholder',
                'data-i18n-title',
                'data-i18n-aria'
            ]
        });
        target.__axisI18nObserver = observer;
        return observer;
    }

    function displayName(code, inLocale) {
        const loc = sanitizeLocale(code) || code;
        try {
            const dn = new Intl.DisplayNames([inLocale || loc || 'en'], { type: 'language' });
            const name = dn.of(loc) || dn.of(loc.split('-')[0]);
            if (name) return name;
        } catch (_) {}
        return loc;
    }

    function collectLanguageCodes() {
        const set = new Set(['en']);
        Object.keys(packs).forEach((c) => {
                    const loc = sanitizeLocale(c);
            if (loc && !HIDDEN_VARIANTS[c] && hasTable(loc)) set.add(loc);
                });
        return Array.from(set);
    }

    function languageMeta(code) {
        const loc = resolveLocale(sanitizeLocale(code) || 'en');
        const nativeName = displayName(loc, loc);
        const englishName = displayName(loc, 'en');
                return {
            code: loc,
                    nativeName,
                    englishName,
            translated: hasTable(loc)
        };
    }

    function languageLabel(code) {
        const meta = languageMeta(code);
        if (
            meta.nativeName &&
            meta.englishName &&
            meta.nativeName.toLowerCase() !== meta.englishName.toLowerCase()
        ) {
            return meta.nativeName + ' · ' + meta.englishName;
        }
        return meta.nativeName || meta.englishName || meta.code;
    }

    function listLanguages() {
        return collectLanguageCodes()
            .map((code) => languageMeta(code))
            .sort((a, b) => {
                if (a.code === 'en' && b.code !== 'en') return -1;
                if (b.code === 'en' && a.code !== 'en') return 1;
                return a.englishName.localeCompare(b.englishName, 'en');
            });
    }

    function detectSystemLocale(hints) {
        const list = [];
        if (Array.isArray(hints)) list.push(...hints);
        if (typeof navigator !== 'undefined') {
            if (Array.isArray(navigator.languages)) list.push(...navigator.languages);
            if (navigator.language) list.push(navigator.language);
        }
        for (const raw of list) {
            const loc = sanitizeLocale(raw);
            if (!loc) continue;
            return loc;
        }
        return 'en';
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fillSelect(select, value) {
        if (!select) return;
        const current = resolveLocale(sanitizeLocale(value) || requested || 'en');
        const keep = select.value;
        const prev = select.value;
        select._axisI18nFilling = true;
        try {
            select.textContent = '';
            for (const lang of listLanguages()) {
                const opt = document.createElement('option');
                opt.value = lang.code;
                opt.textContent = languageLabel(lang.code);
                select.appendChild(opt);
            }
            const next = hasTable(current) || current === 'en' ? current : keep || 'en';
            select.value = next;
            if (!select.value) select.value = 'en';
        } finally {
            // Defer clearing so a sync change event from rebuild cannot re-enter save.
            setTimeout(() => {
                select._axisI18nFilling = false;
            }, 0);
        }
        void prev;
    }

    function mountPicker(container, opts) {
        if (!container) return null;
        const options = opts && typeof opts === 'object' ? opts : {};
        if (container._axisLangApi && !options.forceRemount) {
            if (typeof options.onChange === 'function') {
                container._axisLangApi.setOnChange(options.onChange);
            }
            container._axisLangApi.refresh(options.value);
            if (typeof options.disabled === 'boolean') {
                container._axisLangApi.setDisabled(options.disabled);
            }
            return container._axisLangApi;
        }
        if (typeof container._axisLangCleanup === 'function') {
            try { container._axisLangCleanup(); } catch (_) {}
        }
        let current = resolveLocale(sanitizeLocale(options.value) || requested || 'en');
        let open = false;
        let highlightIndex = -1;
        let onChange = typeof options.onChange === 'function' ? options.onChange : null;
        const searchKey = options.searchKey || 'onboarding.language.search';
        container.classList.add('axis-lang-picker');
        container.innerHTML =
            '<button type="button" class="axis-lang-trigger" aria-haspopup="listbox" aria-expanded="false">' +
            '<span class="axis-lang-trigger-copy">' +
            '<span class="axis-lang-trigger-name"></span>' +
            '<span class="axis-lang-trigger-sub"></span>' +
            '</span>' +
            '<span class="axis-lang-trigger-chevron" aria-hidden="true"></span>' +
            '</button>' +
            '<div class="axis-lang-pop" hidden>' +
            '<input type="search" class="axis-lang-search" autocomplete="off" spellcheck="false" />' +
            '<div class="axis-lang-list" role="listbox"></div>' +
            '</div>';
        const trigger = container.querySelector('.axis-lang-trigger');
        const nameEl = container.querySelector('.axis-lang-trigger-name');
        const subEl = container.querySelector('.axis-lang-trigger-sub');
        const pop = container.querySelector('.axis-lang-pop');
        const search = container.querySelector('.axis-lang-search');
        const list = container.querySelector('.axis-lang-list');
        function syncSearchCopy() {
            const label = t(searchKey);
            search.setAttribute('placeholder', label);
            search.setAttribute('aria-label', label);
        }
        syncSearchCopy();

        function items() {
            return Array.from(list.querySelectorAll('.axis-lang-item'));
        }

        function applyHighlight() {
            const btns = items();
            btns.forEach((btn, i) => {
                btn.classList.toggle('is-highlight', i === highlightIndex);
            });
            const active = btns[highlightIndex];
            if (active) {
                try { active.scrollIntoView({ block: 'nearest' }); } catch (_) {}
            }
        }

        function syncTrigger() {
            const meta = languageMeta(current);
            nameEl.textContent = meta.nativeName || meta.englishName;
            const showSub =
                meta.englishName &&
                meta.nativeName &&
                meta.englishName.toLowerCase() !== meta.nativeName.toLowerCase();
            subEl.textContent = showSub ? meta.englishName : '';
            subEl.hidden = !showSub;
            trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
            container.classList.toggle('is-open', open);
            pop.hidden = !open;
        }

        function paint(filter) {
            const q = String(filter || '').trim().toLowerCase();
            const langs = listLanguages().filter((lang) => {
                    if (!q) return true;
                    return (
                        lang.nativeName.toLowerCase().includes(q) ||
                        lang.englishName.toLowerCase().includes(q) ||
                        lang.code.toLowerCase().includes(q)
                    );
            });
            if (!langs.length) {
                highlightIndex = -1;
                list.innerHTML = '<div class="axis-lang-empty">' + escapeHtml(t('settings.searchEmpty')) + '</div>';
                return;
            }
            list.innerHTML = langs
                .map((lang) => {
                    const selected = lang.code === current;
                    const showSub =
                        lang.englishName &&
                        lang.nativeName &&
                        lang.englishName.toLowerCase() !== lang.nativeName.toLowerCase();
                    return (
                        '<button type="button" class="axis-lang-item' +
                        (selected ? ' is-selected' : '') +
                        '" role="option" aria-selected="' +
                        (selected ? 'true' : 'false') +
                        '" data-lang="' +
                        escapeHtml(lang.code) +
                        '"><span class="axis-lang-item-copy"><span class="axis-lang-item-native">' +
                        escapeHtml(lang.nativeName) +
                        '</span>' +
                        (showSub
                            ? '<span class="axis-lang-item-en">' + escapeHtml(lang.englishName) + '</span>'
                            : '') +
                        '</span><span class="axis-lang-item-check" aria-hidden="true"></span></button>'
                    );
                })
                .join('');
            highlightIndex = Math.max(0, langs.findIndex((lang) => lang.code === current));
            applyHighlight();
        }

        function positionPop() {
            const rect = trigger.getBoundingClientRect();
            const gap = 6;
            const maxH = 280;
            const spaceBelow = window.innerHeight - rect.bottom - 12;
            const spaceAbove = rect.top - 12;
            const openDown = spaceBelow >= 180 || spaceBelow >= spaceAbove;
            const height = Math.max(140, Math.min(maxH, openDown ? spaceBelow : spaceAbove));
            pop.style.position = 'fixed';
            pop.style.left = Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)) + 'px';
            pop.style.width = Math.max(180, rect.width) + 'px';
            pop.style.right = 'auto';
            pop.style.zIndex = '100000';
            if (openDown) {
                pop.style.top = rect.bottom + gap + 'px';
                pop.style.bottom = 'auto';
            } else {
                pop.style.top = 'auto';
                pop.style.bottom = window.innerHeight - rect.top + gap + 'px';
            }
            list.style.maxHeight = height - 52 + 'px';
        }

        function mountPopInBody() {
            if (pop.parentElement !== document.body) {
                document.body.appendChild(pop);
                pop.classList.add('axis-lang-pop--portal');
            }
        }

        function restorePop() {
            if (pop.parentElement !== container) {
                container.appendChild(pop);
            }
            pop.classList.remove('axis-lang-pop--portal');
            pop.style.position = '';
            pop.style.left = '';
            pop.style.right = '';
            pop.style.top = '';
            pop.style.bottom = '';
            pop.style.width = '';
            pop.style.zIndex = '';
            list.style.maxHeight = '';
        }

        function pick(code) {
            current = resolveLocale(code);
            options.value = current;
            setOpen(false);
            if (typeof onChange === 'function') onChange(current);
        }

        function setOpen(next) {
            open = !!next;
            if (open) {
                mountPopInBody();
                search.value = '';
                paint('');
                positionPop();
                requestAnimationFrame(() => {
                    positionPop();
                    try { search.focus(); } catch (_) {}
                    const selected = list.querySelector('.axis-lang-item.is-selected');
                    try { selected?.scrollIntoView({ block: 'nearest' }); } catch (_) {}
                });
            } else {
                restorePop();
            }
            syncTrigger();
        }

        function onDocPointer(e) {
            if (!open) return;
            if (container.contains(e.target) || pop.contains(e.target)) return;
            setOpen(false);
        }

        function onWinReposition() {
            if (!open) return;
            positionPop();
        }

        function onKey(e) {
            if (!open) {
                if (document.activeElement !== trigger) return;
                if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setOpen(true);
                }
                return;
            }
            const btns = items();
            if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                try { trigger.focus(); } catch (_) {}
                return;
            }
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                highlightIndex = Math.min(btns.length - 1, highlightIndex + 1);
                applyHighlight();
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                highlightIndex = Math.max(0, highlightIndex - 1);
                applyHighlight();
                return;
            }
            if (e.key === 'Enter' && highlightIndex >= 0 && btns[highlightIndex]) {
                e.preventDefault();
                pick(btns[highlightIndex].getAttribute('data-lang'));
            }
        }

        trigger.addEventListener('click', () => {
            if (trigger.disabled) return;
            setOpen(!open);
        });
        search.addEventListener('input', () => paint(search.value));
        list.addEventListener('click', (e) => {
            const btn = e.target && e.target.closest ? e.target.closest('[data-lang]') : null;
            if (!btn) return;
            pick(btn.getAttribute('data-lang'));
        });
        document.addEventListener('mousedown', onDocPointer, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', onWinReposition, true);
        window.addEventListener('scroll', onWinReposition, true);
        container._axisLangCleanup = function () {
            document.removeEventListener('mousedown', onDocPointer, true);
            document.removeEventListener('keydown', onKey, true);
            window.removeEventListener('resize', onWinReposition, true);
            window.removeEventListener('scroll', onWinReposition, true);
            try { restorePop(); } catch (_) {}
            container._axisLangApi = null;
        };

        syncTrigger();
        const api = {
            refresh(nextValue) {
                if (nextValue) {
                    current = resolveLocale(sanitizeLocale(nextValue) || current);
                    options.value = current;
                }
                syncSearchCopy();
                syncTrigger();
                if (open) paint(search.value);
            },
            setOnChange(fn) {
                onChange = typeof fn === 'function' ? fn : null;
            },
            setDisabled(disabled) {
                const on = !!disabled;
                trigger.disabled = on;
                container.classList.toggle('is-disabled', on);
                trigger.setAttribute('aria-disabled', on ? 'true' : 'false');
                if (on) setOpen(false);
            }
        };
        container._axisLangApi = api;
        if (options.disabled) api.setDisabled(true);
        return api;
    }

    return {
        t,
        setLocale,
        getLocale: () => requested,
        getResolvedLocale: () => resolved,
        registerPacks,
        applyToDom,
        observeDom,
        listLanguages,
        languageLabel,
        languageMeta,
        detectSystemLocale,
        mountPicker,
        fillSelect,
        sanitizeLocale,
        resolveLocale,
        hasPack: hasTable,
        /** Offline sync / tooling: full English string table (includes Object.assign merges). */
        getEnglishTable: () => Object.assign({}, EN),
        /** Offline sync / tooling: shallow copy of every registered non-EN pack. */
        dumpPacks: () => {
            const out = {};
            for (const [code, table] of Object.entries(packs)) {
                out[code] = Object.assign({}, table);
            }
            return out;
        },
        listLocales: () => Object.keys(packs).sort(),
        isBuiltinChromeTitle(title) {
            const known = new Set();
            const keys = ['chrome.newTab', 'chrome.newIncognito', 'chrome.aiChat', 'chrome.settings'];
            const locales = ['en'].concat(Object.keys(packs));
            for (const loc of locales) {
                const table = loc === 'en' ? EN : packs[loc];
                if (!table) continue;
                for (const key of keys) {
                    if (table[key]) known.add(String(table[key]));
                }
            }
            return known.has(String(title || ''));
        }
    };
});
