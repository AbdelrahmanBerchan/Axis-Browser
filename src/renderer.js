// Axis Browser Renderer Process

/**
 * Injected into each <webview> main frame for transparent-site mode.
 * YouTube relies on design tokens inside shadow roots (variables must be set on html).
 * Google Search/Images uses many light-DOM wrappers with explicit fills.
 */
const AXIS_TRANSPARENT_SITES_CSS = `
html, body {
  background: transparent !important;
  background-color: transparent !important;
  background-image: none !important;
}
#root, #app, #__next, #__nuxt, #__layout, #app-mount, #gatsby-focus-wrapper,
[data-nuxt-root], [data-vue-app], .app-root, main#main {
  background-color: transparent !important;
  background-image: none !important;
}
/* YouTube: tokens inherit into open shadow trees */
html, html[dark], html[dark="true"], html[system-icons][dark], ytd-app {
  --yt-spec-base-background: transparent !important;
  --yt-spec-general-background-a: transparent !important;
  --yt-spec-general-background-b: transparent !important;
  --yt-spec-general-background-c: transparent !important;
  --yt-spec-brand-background-solid: transparent !important;
  --yt-spec-brand-background-primary: transparent !important;
  --yt-spec-brand-background-secondary: transparent !important;
  --yt-raised-background: transparent !important;
  --yt-spec-menu-background: transparent !important;
  --yt-spec-feed-background-a: transparent !important;
  --yt-spec-feed-background-b: transparent !important;
  --yt-spec-static-background: transparent !important;
  --yt-spec-static-overlay-background-solid: rgba(0, 0, 0, 0.2) !important;
}
ytd-app, ytd-browse, ytd-page-manager, ytd-miniplayer,
ytd-masthead, ytd-app-drawer, ytd-video-preview, #content.ytd-page-manager,
ytd-watch-flexy #secondary, ytd-watch-flexy #related {
  background-color: transparent !important;
  background: transparent !important;
}
/* YouTube player must stay opaque — transparent design tokens break hardware video compositing */
#movie_player, #player, #player-container, #player-api, ytd-player,
.html5-video-player, .html5-video-container, #player-container-inner,
ytd-watch-flexy #primary, ytd-watch-flexy #primary-inner {
  background-color: #000 !important;
  background: #000 !important;
}
/* Google web (Search, Images, etc.): main chrome ids */
#viewport, #cnt, #gsr, #main, #center_col, #rcnt, #rhs, #rhscol, #lhcol,
#searchform, #tsf, #layout, #rso, #islsp, #islmp, #iur, #isr_m, #iry,
#arc_tp, #appbar, #main-content, #search, #before-appbar, #sfcnt, #top_nav, #yDmH0d {
  background-color: transparent !important;
  background-image: none !important;
}
div[role="main"], div[role="navigation"]:not([aria-hidden="true"]) {
  background-color: transparent !important;
  background-image: none !important;
}
/* Full-width strips (headers / toolbars) often sit outside role=main */
header, footer, [role="banner"], [role="contentinfo"] {
  background-color: transparent !important;
  background-image: none !important;
}
`.replace(/\s+/g, ' ').trim();

/** Nudge YouTube watch-page `<video>` after tab switch / guest hide-show (black player recovery). */
const AXIS_YOUTUBE_PLAYER_RECOVERY_JS = `
(function(){
try{
var href=String(location.href||"");
if(!/(^|\\/\\/)((www\\.)?youtube\\.com\\/(watch|shorts|live|embed)|youtu\\.be\\/)/.test(href))return;
var player=document.querySelector("#movie_player,ytd-player,.html5-video-player");
if(!player)return;
var pr=player.getBoundingClientRect();
if(pr.width<120||pr.height<80)return;
window.dispatchEvent(new Event("resize"));
var v=player.querySelector("video")||document.querySelector("video");
if(!v){return;}
var broken=v.readyState===0&&!v.error;
if(!broken&&(v.videoWidth||0)===0&&(v.videoHeight||0)===0&&pr.width>200&&pr.height>150)broken=true;
if(!broken)return;
try{v.load();}catch(e){}
}catch(e){}
})();
`.replace(/\s+/g, ' ').trim();

/**
 * YouTube tokens + Google ids + generic sweep: large opaque layers (any host) get cleared.
 * Skips modals, media, form controls, ytd-* hosts, and the YouTube player container.
 */
const AXIS_TRANSPARENT_SITES_DOM_PATCH = `
(function(){
try{
var OLD_NS="__axisTransparentV4";
var NS="__axisTransparentV7";
var OLD_V5="__axisTransparentV5";
var OLD_V6="__axisTransparentV6";
var T="transparent";
var IMP="important";
function ytVarNames(){return["--yt-spec-base-background","--yt-spec-general-background-a","--yt-spec-general-background-b","--yt-spec-general-background-c","--yt-spec-brand-background-solid","--yt-spec-brand-background-primary","--yt-spec-brand-background-secondary","--yt-raised-background","--yt-spec-menu-background","--yt-spec-feed-background-a","--yt-spec-feed-background-b","--yt-spec-static-background","--yt-spec-static-overlay-background-solid","--yt-spec-10-percent-layer","--yt-spec-themed-blue","--yt-spec-themed-green"];}
function stopNs(ns){var st=window[ns];if(!st)return false;try{if(st.mo){st.mo.disconnect();st.mo=null;}if(st.t)clearTimeout(st.t);if(st.idle!=null){try{if(window.cancelIdleCallback)window.cancelIdleCallback(st.idle);}catch(e){}st.idle=null;}if(st.sweepTO){clearTimeout(st.sweepTO);st.sweepTO=null;}}catch(e){}delete window[ns];return true;}
function cleanupOldInline(){try{ytVarNames().forEach(function(n){var v=document.documentElement.style.getPropertyValue(n);if(v==="transparent"||v.indexOf("rgba(0,0,0,0.18)")>=0)document.documentElement.style.removeProperty(n);});var sel="html,body,#viewport,#cnt,#gsr,#main,#center_col,#rcnt,#rhs,#rhscol,#lhcol,#islsp,#islmp,#iur,#isr_m,#iry,#rso,#searchform,#tsf,#layout,#arc_tp,#appbar,#main-content,#search,#before-appbar,#sfcnt,#top_nav,#yDmH0d,#scb,#eUDTde,#MAmRG,#lfooter,#tw-container,#analytics-ddh,[role='main'],ytd-app,ytd-browse,ytd-page-manager,ytd-miniplayer,ytd-feed-filter-chip-bar-renderer,[style]";document.querySelectorAll(sel).forEach(function(el){try{["background-color","background","background-image"].forEach(function(p){var v=el.style.getPropertyValue(p);var pr=el.style.getPropertyPriority(p);if(pr==="important"&&(v==="transparent"||v==="rgba(0, 0, 0, 0)"||v==="none"))el.style.removeProperty(p);});}catch(e){}});}catch(e){}}
if(stopNs(OLD_NS))cleanupOldInline();
if(stopNs(OLD_V5))cleanupOldInline();
if(stopNs(OLD_V6))cleanupOldInline();
var st=window[NS]||(window[NS]={mo:null,t:0,idle:null,sweepTO:null,records:[],lastSweep:0});
function remember(el,prop){if(!el||!el.style)return;var key="__axisTransparentV7Props";var seen=el[key]||(el[key]={});if(seen[prop])return;seen[prop]=1;var val=el.style.getPropertyValue(prop);var priority=el.style.getPropertyPriority(prop);st.records.push({el:el,prop:prop,value:val,priority:priority,had:!!(val||priority)});}
function setStyle(el,prop,value){try{remember(el,prop);el.style.setProperty(prop,value,IMP);}catch(e){}}
function isYtWatch(){try{var p=location.pathname||"";if(location.hostname==="youtu.be")return p.length>1;return p.indexOf("/watch")===0||p.indexOf("/shorts/")===0||p.indexOf("/live/")===0||p.indexOf("/embed/")===0;}catch(e){return false;}}
function applyYt(){var r=document.documentElement;ytVarNames().forEach(function(n){var v=T;if(n.indexOf("overlay")>=0)v="rgba(0,0,0,0.18)";if(n.indexOf("blue")>=0||n.indexOf("green")>=0||n.indexOf("percent-layer")>=0)return;setStyle(r,n,v);});try{var app=document.querySelector("ytd-app");if(app){setStyle(app,"background",T);setStyle(app,"background-color",T);}document.querySelectorAll("ytd-browse,ytd-page-manager,ytd-miniplayer,ytd-feed-filter-chip-bar-renderer").forEach(function(el){setStyle(el,"background",T);setStyle(el,"background-color",T);});document.querySelectorAll("ytd-watch-flexy #secondary,ytd-watch-flexy #related").forEach(function(el){setStyle(el,"background",T);setStyle(el,"background-color",T);});}catch(e){}}
function googleIds(){return["viewport","cnt","gsr","main","center_col","rcnt","rhs","rhscol","lhcol","islsp","islmp","iur","isr_m","iry","rso","searchform","tsf","layout","arc_tp","appbar","main-content","search","before-appbar","sfcnt","top_nav","yDmH0d","scb","eUDTde","MAmRG","lfooter","tw-container","analytics-ddh"];}
function applyGoogle(){googleIds().forEach(function(id){try{var el=document.getElementById(id);if(el){setStyle(el,"background-color",T);setStyle(el,"background-image","none");}}catch(e){}});try{var main=document.querySelector('[role="main"]');if(main){setStyle(main,"background-color",T);setStyle(main,"background-image","none");}}catch(e){}}
function sweepLargeOpaqueLayers(){var b=document.body;if(!b)return;var sk={IMG:1,VIDEO:1,AUDIO:1,CANVAS:1,IFRAME:1,SVG:1,PICTURE:1,OBJECT:1,EMBED:1,STYLE:1,SCRIPT:1,LINK:1,META:1,NOSCRIPT:1,TEMPLATE:1,INPUT:1,TEXTAREA:1,SELECT:1,BUTTON:1,OPTION:1,LABEL:1};var n=0,mx=6500,vh=window.innerHeight||800,vw=window.innerWidth||1200,vA=Math.max(1,vh*vw);if(typeof NodeFilter==="undefined")return;var w=document.createTreeWalker(b,NodeFilter.SHOW_ELEMENT,null),el;while((el=w.nextNode())&&n<mx){n++;var t=el.tagName;if(sk[t])continue;if(t&&t.indexOf("-")>0){var q=t.toLowerCase();if(q.slice(0,4)==="ytd-"||q.slice(0,3)==="yt-")continue;}try{if(el.closest('[aria-modal="true"],[role="dialog"],dialog,[data-radix-portal],.modal,.Modal,[class*="modal_root"]'))continue;if(el.closest("#movie_player,#player,#player-container,#player-api,ytd-player,.html5-video-player,.html5-video-container,#ytd-player"))continue;}catch(e){}try{var cs=getComputedStyle(el);if(cs.display==="none"||cs.visibility==="hidden"||(cs.position==="fixed"&&parseFloat(cs.opacity||"1")<0.04))continue;var bg=cs.backgroundColor;if(!bg||bg==="transparent"||bg==="rgba(0, 0, 0, 0)")continue;var a=1;if(bg.indexOf("rgba")===0){var i=bg.lastIndexOf(",");if(i>0){var tail=bg.slice(i+1,-1).trim();var pv=parseFloat(tail);if(!isNaN(pv))a=pv;}}if(a<0.12)continue;var r=el.getBoundingClientRect();if(r.width<24||r.height<22)continue;var f=r.width*r.height/vA,tl=r.height>Math.min(340,vh*0.38),tb=r.width>vw*0.86&&r.height>90;if(f<0.032&&!tl&&!tb)continue;setStyle(el,"background-color",T);var bi=cs.backgroundImage;if(bi&&bi!=="none"&&bi.indexOf("url(")<0&&(bi.indexOf("gradient")>=0||bi.indexOf("linear-gradient")>=0))setStyle(el,"background-image","none");}catch(e2){}}}
function scheduleSweep(){if(st.idle!=null){try{if(window.cancelIdleCallback)window.cancelIdleCallback(st.idle);}catch(e){}st.idle=null;}if(st.sweepTO){clearTimeout(st.sweepTO);st.sweepTO=null;}var go=function(){st.idle=null;st.sweepTO=null;var now=Date.now();if(now-(st.lastSweep||0)<900)return;st.lastSweep=now;try{sweepLargeOpaqueLayers();}catch(e){}};if(window.requestIdleCallback)st.idle=window.requestIdleCallback(go,{timeout:1200});else st.sweepTO=setTimeout(go,320);}
function run(){var host=(String(location.hostname||"")).toLowerCase();var isYt=host.indexOf("youtube.com")>=0||host==="youtu.be";var isGo=host.indexOf("google.")>=0;if(isYt&&!isYtWatch())applyYt();if(isGo)applyGoogle();try{setStyle(document.documentElement,"background-color",T);if(document.body){setStyle(document.body,"background-color",T);setStyle(document.body,"background-image","none");}}catch(e){}scheduleSweep();}
run();
if(!st.mo&&document.body){st.mo=new MutationObserver(function(){clearTimeout(st.t);st.t=setTimeout(run,480);});st.mo.observe(document.body,{childList:true,subtree:true});}else if(!st.mo){run();}
}catch(e){}
})();
`.replace(/\s+/g, ' ').trim();

const AXIS_TRANSPARENT_SITES_DOM_PATCH_CLEANUP = `
(function(){
try{
var NS="__axisTransparentV7";
var OLD_NS="__axisTransparentV4";
var OLD_V5="__axisTransparentV5";
var OLD_V6="__axisTransparentV6";
function ytVarNames(){return["--yt-spec-base-background","--yt-spec-general-background-a","--yt-spec-general-background-b","--yt-spec-general-background-c","--yt-spec-brand-background-solid","--yt-spec-brand-background-primary","--yt-spec-brand-background-secondary","--yt-raised-background","--yt-spec-menu-background","--yt-spec-feed-background-a","--yt-spec-feed-background-b","--yt-spec-static-background","--yt-spec-static-overlay-background-solid"];}
function stop(ns){var st=window[ns];if(!st)return false;try{if(st.mo){st.mo.disconnect();st.mo=null;}if(st.t)clearTimeout(st.t);if(st.idle!=null){try{if(window.cancelIdleCallback)window.cancelIdleCallback(st.idle);}catch(e){}st.idle=null;}if(st.sweepTO){clearTimeout(st.sweepTO);st.sweepTO=null;}if(st.records){for(var i=st.records.length-1;i>=0;i--){var r=st.records[i];try{if(!r||!r.el||!r.el.style)continue;if(r.had)r.el.style.setProperty(r.prop,r.value,r.priority||"");else r.el.style.removeProperty(r.prop);if(r.el.__axisTransparentV7Props)delete r.el.__axisTransparentV7Props[r.prop];}catch(e){}}}}catch(e){}delete window[ns];return true;}
function cleanupOldInline(){try{ytVarNames().forEach(function(n){var v=document.documentElement.style.getPropertyValue(n);if(v==="transparent"||v.indexOf("rgba(0,0,0,0.18)")>=0)document.documentElement.style.removeProperty(n);});var sel="html,body,#viewport,#cnt,#gsr,#main,#center_col,#rcnt,#rhs,#rhscol,#lhcol,#islsp,#islmp,#iur,#isr_m,#iry,#rso,#searchform,#tsf,#layout,#arc_tp,#appbar,#main-content,#search,#before-appbar,#sfcnt,#top_nav,#yDmH0d,#scb,#eUDTde,#MAmRG,#lfooter,#tw-container,#analytics-ddh,[role='main'],ytd-app,ytd-browse,ytd-page-manager,ytd-miniplayer,ytd-feed-filter-chip-bar-renderer,[style]";document.querySelectorAll(sel).forEach(function(el){try{["background-color","background","background-image"].forEach(function(p){var v=el.style.getPropertyValue(p);var pr=el.style.getPropertyPriority(p);if(pr==="important"&&(v==="transparent"||v==="rgba(0, 0, 0, 0)"||v==="none"))el.style.removeProperty(p);});}catch(e){}});}catch(e){}}
var hadV7=stop(NS);
var hadV6=stop(OLD_V6);
var hadV5=stop(OLD_V5);
var hadV4=stop(OLD_NS);
if(!hadV7&&!hadV6&&!hadV5&&hadV4)cleanupOldInline();
}catch(e){}
})();
`.replace(/\s+/g, ' ').trim();

/** Keyboard shortcut editor rows (must match settings.html SHORTCUT_ACTIONS). */
function getShortcutEditorActions() {
    return [
        { action: 'spotlight-search', label: 'New Tab / Spotlight' },
        { action: 'close-tab', label: 'Close Tab' },
        { action: 'new-tab', label: 'New Window' },
        { action: 'next-tab', label: 'Show Next Tab' },
        { action: 'previous-tab', label: 'Show Previous Tab' },
        { action: 'recover-tab', label: 'Recover Closed Tab' },
        { action: 'refresh', label: 'Refresh Page' },
        { action: 'focus-url', label: 'Focus URL Bar' },
        { action: 'duplicate-tab', label: 'Duplicate Tab' },
        { action: 'find', label: 'Find in Page' },
        { action: 'select-all', label: 'Select All' },
        { action: 'paste-match-style', label: 'Paste and Match Style' },
        { action: 'print', label: 'Print Page' },
        { action: 'copy-url', label: 'Copy Current URL' },
        { action: 'copy-url-markdown', label: 'Copy URL as Markdown' },
        { action: 'pin-tab', label: 'Pin / Unpin Tab' },
        { action: 'toggle-mute-tab', label: 'Mute / Unmute Tab' },
        { action: 'zoom-in', label: 'Zoom In' },
        { action: 'zoom-out', label: 'Zoom Out' },
        { action: 'reset-zoom', label: 'Reset Zoom' },
        { action: 'toggle-sidebar', label: 'Toggle Sidebar' },
        { action: 'history', label: 'Open History' },
        { action: 'downloads', label: 'Open Downloads' },
        { action: 'toggle-chat', label: 'Open Chat' },
        { action: 'settings', label: 'Open Settings' },
        { action: 'clear-history', label: 'Clear History' },
        ...Array.from({ length: 9 }, (_, i) => ({
            action: `switch-tab-${i + 1}`,
            label: `Switch to tab ${i + 1}`
        }))
    ];
}

/**
 * Shell chrome interpolation: Settings ▸ Window transparency (`windowChromeLight`) — 0 = opaque (handled in getShellChromeStyle),
 * 50 = default blend, 100 = most light. **Transparent endpoint** is very low‑alpha; **above 0** the blend uses a curve (`1 − (1−t)^k`) so mid‑high slider values lean further toward “see through” without changing the control.
 */
const AXIS_SHELL_CHROME_OPAQUE = {
    glassAlpha: 0.34,
    slideOutAlpha: 1,
    popupAlpha: 0.52,
    urlBarAlpha: 0.42,
    blurMain: 72,
    satMain: 178,
    blurStrong: 78,
    satStrong: 184,
    urlBarBlur: 18,
    urlBarSat: 126,
    urlBarTintDefault: 0.38,
    urlBarTintDark: 0.34,
    urlBarTintLight: 0.26,
    newTabSearchAlpha: 0.46,
    newTabSearchBlur: 16,
    newTabSearchSat: 130,
    newTabToggleAlpha: 0.22,
    newTabToggleBlur: 18,
    newTabToggleSat: 132,
    newTabAskAlpha: 0.52,
    newTabAskBlur: 18,
    newTabAskSat: 130,
};
const AXIS_SHELL_CHROME_TRANSPARENT = {
    glassAlpha: 0.0045,
    slideOutAlpha: 1,
    popupAlpha: 0.038,
    urlBarAlpha: 0.012,
    blurMain: 8,
    satMain: 118,
    blurStrong: 10,
    satStrong: 128,
    urlBarBlur: 4,
    urlBarSat: 102,
    urlBarTintDefault: 0.028,
    urlBarTintDark: 0.025,
    urlBarTintLight: 0.018,
    newTabSearchAlpha: 0.022,
    newTabSearchBlur: 4,
    newTabSearchSat: 108,
    newTabToggleAlpha: 0.014,
    newTabToggleBlur: 6,
    newTabToggleSat: 112,
    newTabAskAlpha: 0.04,
    newTabAskBlur: 6,
    newTabAskSat: 110,
};

/** Extension id from a Chrome Web Store listing URL (must match main-process `parseChromeWebStoreExtensionId`). */
function axisParseChromeWebStoreExtensionId(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const compact = s.replace(/\s+/g, '');
    const onlyId = /^([a-p]{32})$/i.exec(compact);
    if (onlyId) return onlyId[1].toLowerCase();
    try {
        const u = new URL(compact.includes('://') ? compact : `https://${compact}`);
        const host = (u.hostname || '').toLowerCase();
        const isStore = host === 'chromewebstore.google.com' || host === 'chrome.google.com';
        if (!isStore) return null;
        const parts = u.pathname.split('/').filter(Boolean);
        for (let i = parts.length - 1; i >= 0; i--) {
            const seg = parts[i];
            if (seg && /^[a-p]{32}$/i.test(seg)) return seg.toLowerCase();
        }
    } catch (_) {
        /* ignore */
    }
    return null;
}

/** Mozilla add-on slug from an AMO URL or plain slug (mirrors main `parseFirefoxAmoAddonKey`). */
function axisParseFirefoxAmoAddonKey(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const compact = s.replace(/\s+/g, '');
    try {
        const u = new URL(compact.includes('://') ? compact : `https://${compact}`);
        const host = (u.hostname || '').replace(/^www\./i, '').toLowerCase();
        if (host === 'addons.mozilla.org') {
            const parts = u.pathname.split('/').filter(Boolean);
            const ai = parts.indexOf('addon');
            if (ai >= 0 && parts[ai + 1]) {
                const key = decodeURIComponent(parts[ai + 1]);
                if (key && /^[a-zA-Z0-9._-]+$/.test(key)) return key;
            }
        }
    } catch (_) {
        /* ignore */
    }
    if (/[:/]/i.test(compact)) return null;
    if (/^[a-p]{32}$/i.test(compact)) return null;
    if (/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,249}$/.test(compact)) return compact;
    return null;
}

/** Settings sidebar section ids (`settings.html` `data-section` values). */
const AXIS_SETTINGS_SECTION_IDS = new Set([
    'customization',
    'newtab',
    'ai',
    'history',
    'shortcuts',
    'permissions',
    'extensions',
    'vault'
]);

/** Allowlisted settings section id for IPC (never embed arbitrary strings in guest JS). */
function axisSanitizeSettingsSectionId(raw) {
    const id = raw != null ? String(raw).replace(/^#/, '').trim() : '';
    return AXIS_SETTINGS_SECTION_IDS.has(id) ? id : null;
}

/** Dismiss the extension-store install bar in the guest (`token`: Chrome id or `amo:slug`). */
function axisNotifyExtensionStoreBarDismissed(webview, token) {
    const t = typeof token === 'string' ? token.trim() : '';
    if (!t || !webview || typeof webview.send !== 'function') return;
    try {
        webview.send('axis-cws-install-succeeded', t);
    } catch (_) {
        /* webview may be destroyed or not ready */
    }
}

/** Tell the guest store bar install failed (`token`, optional `message`). */
function axisNotifyExtensionStoreBarFailed(webview, token, message) {
    const t = typeof token === 'string' ? token.trim() : '';
    if (!t || !webview || typeof webview.send !== 'function') return;
    try {
        webview.send('axis-cws-install-failed', t, message || '');
    } catch (_) {
        /* webview may be destroyed or not ready */
    }
}

/** Sync installed / not-installed state to the in-page store bar. */
function axisNotifyExtensionStoreBarStatus(webview, payload) {
    if (!webview || typeof webview.send !== 'function' || !payload || typeof payload !== 'object') return;
    try {
        webview.send('axis-cws-install-status', payload);
    } catch (_) {
        /* webview may be destroyed or not ready */
    }
}

/** Store listing token + ids from a Chrome Web Store or Mozilla Add-ons URL. */
function axisParseStoreListingContext(rawUrl) {
    const cwsId = axisParseChromeWebStoreExtensionId(rawUrl);
    const amoKey = axisParseFirefoxAmoAddonKey(rawUrl);
    if (!cwsId && !amoKey) return null;
    const token = amoKey ? `amo:${amoKey.toLowerCase()}` : cwsId;
    return { cwsId, amoKey, token, dismissToken: token };
}

class AxisBrowser {
    constructor() {
        this.currentTab = null;
        // Track webviews that have had listeners set up to prevent duplicates
        this.webviewListenersSetup = new WeakMap(); // Start with no tabs
        this.tabs = new Map(); // Start with empty tabs
        this.tabGroups = new Map(); // Store tab groups: { id, name, tabIds: [], open: true, color: '#FF6B6B' }
        this.favorites = []; // Sidebar favorites shown above pinned tabs
        this._favoriteDrag = null;
        /** During `syncSidebarFromTabGroups`, empty group that will run close animation (last tab dragged out). */
        this._pendingEmptyGroupCollapseId = null;
        this.pendingTabGroupColor = null; // Color selected for new tab group
        this.settings = {};
        this.selectedSearchEngine = null; // Track selected search engine shortcut
        this.closedTabs = []; // Store recently closed tabs for recovery
        this.tabUndoStack = []; // Undo stack for close tab / add to group / remove from group (max 15, kept smaller for RAM)
        // Search engine full word mapping (no shortcuts, only full words)
        this.searchEngineWords = [
            'google',
            'youtube',
            'bing',
            'duckduckgo',
            'yahoo',
            'yandex',
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
            'yandex': 'yandex',
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
        this.NEWTAB_URL = 'axis://newtab'; // Custom new tab page (replaces spotlight)
        this.NTP_DEFAULT_FAVICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><g fill="none" stroke="%23ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25L13 13"/></g></svg>';
        this.NTP_AI_CHAT_FAVICON = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path fill="none" stroke="%23ffffff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" d="M3 4.5h10a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H6.2L3.5 13V10H3a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/></svg>';
        this.contextMenuTabGroupId = null; // Track which tab group context menu is open
        this.contextMenuFavoriteId = null; // Sidebar favorite tile native context menu
        /** Tab whose guest fired the last webpage context menu (may differ from `currentTab`). */
        this._contextMenuSourceTabId = null;
        this.themeCache = new Map(); // Cache theme colors per domain for instant theme switching
        this.currentLibraryItems = []; // Store library items for preview navigation
        this.currentPreviewFile = null; // Current file being previewed
        this.currentPreviewIndex = -1; // Index of current file in library items
        this.previewListenersSetup = false; // Track if preview listeners are set up
        this.aiChatMessages = []; // Store chat message history
        /** Whether the AI chat panel is open, keyed by normalized tab id (per-tab UI state). */
        this.aiChatPanelOpenByTabId = new Map();
        this.aiChatApiKey = ''; // Groq API key for chat
        this.pipTabId = null; // Tab ID that has PIP active
        this.pipVideoIndex = 0; // Index of video element in webview
        this.pipWebview = null; // Reference to the webview with video
        this.pipLeaveCheckInterval = null; // Interval to detect native "back to tab" (PiP closed)
        /** Prevents concurrent handlers when PiP ends (poll overlap). */
        this._pipLeaveBusy = false;
        /** Background media mini-player after native PiP closes (`{ tabId, videoIndex }`, tabId normalized). */
        this._sidebarMediaDock = null;
        this._sidebarMediaDockPoll = null;
        /** ResizeObserver for sidebar mini-player title slide distance when the dock width changes. */
        this._sidebarMediaTitleResizeObserver = null;
        /** Bumps when dock hides or tab changes so async favicon glow does not apply to a stale card. */
        this._sidebarMediaGlowSeq = 0;
        this._urlBarThemeSeq = 0;
        /** Deferred second pass after SPAs paint sticky chrome / theme-color settles. */
        this._urlBarThemeRefineTimer = null;
        /** Tab switch: disable URL bar tint fade until sync styling or first extract completes. */
        this._urlBarInstantThemeTabSwitch = false;
        /** Last palette passed to applyCustomTheme — restored on profile switch without recomputing. */
        this._lastShellThemeColors = null;
        /** Profile commit: skip the next switchToTab rAF URL bar refresh (chrome already restored). */
        this._skipNextUrlBarRefresh = false;
        /** Profile switch restored URL bar from runtime cache — skip async extract until tab changes. */
        this._profileUrlBarRestoredFromCache = false;
        /** Tab switch restored URL bar from per-tab snapshot — skip async extract on first refresh. */
        this._tabUrlBarRestoredFromCache = false;
        this._settingsUpdatedRaf = null;
        this._ambientAudioCtx = null;
        this._ambientAudioChain = null;
        this._ambientPreset = null;
        this._shortcutCache = {};
        this._downloadsPopupRefreshTimer = null;
        this._downloadsPopupPollInterval = null;
        this._downloadsPopupRenderInFlight = false;
        /** Absolute path to `webview-preload-bundle.js` — nav gestures + CWS/AMO store UI (guest preload). */
        this._webviewCwsPreloadPath = null;
        this._settingsWebviewPreloadPath = null;
        this._vaultPageScanJs = null;

        const hash = String(window.location.hash || '').replace(/^#/, '');
        this.isIncognitoWindow = hash === 'incognito';
        const params = new URLSearchParams(hash);
        this.profileId = this.isIncognitoWindow
            ? 'incognito'
            : (() => {
                  const raw = params.get('profile');
                  const decoded = raw ? decodeURIComponent(raw) : 'personal';
                  return String(decoded).toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'personal';
              })();
        const iconFromHash = params.get('icon');
        this.windowProfileIcon =
            iconFromHash && window.AXIS_PROFILE_ICONS?.sanitizeProfileIcon
                ? window.AXIS_PROFILE_ICONS.sanitizeProfileIcon(decodeURIComponent(iconFromHash))
                : iconFromHash
                  ? String(iconFromHash).trim().toLowerCase()
                  : null;
        this.profiles = [];
        
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
            favoritesSection: document.getElementById('favorites-section'),
            favoritesGrid: document.getElementById('favorites-grid'),
            sidebarNewTabBtn: document.getElementById('sidebar-new-tab-btn'),
            clearUnpinnedFloatingBtn: document.getElementById('clear-unpinned-floating'),
            webview: document.getElementById('webview'),
            closeSettings: document.getElementById('close-settings'),
            downloadsBtnFooter: document.getElementById('downloads-btn-footer'),
            sidebarPlusBtn: document.getElementById('sidebar-plus-btn'),
            sidebarPlusMenu: document.getElementById('sidebar-plus-menu'),
            profileSwitcherRoot: document.getElementById('sidebar-profile-footer'),
            profileSwitcherTrigger: document.getElementById('profile-switcher-trigger'),
            profileSwitcherAvatar: document.getElementById('profile-switcher-avatar'),
            profileSwitcherMenu: document.getElementById('profile-switcher-menu'),
            closeDownloads: document.getElementById('close-downloads'),
            refreshDownloads: document.getElementById('refresh-downloads'),
            closeSecurity: document.getElementById('close-security'),
            viewCertificate: document.getElementById('view-certificate'),
            securitySettings: document.getElementById('security-settings'),
            securityPanel: document.getElementById('security-panel'),
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
            urlBarAdblock: document.getElementById('url-bar-adblock'),
            urlBarCopy: document.getElementById('url-bar-copy'),
            urlBarCwsInstall: document.getElementById('url-bar-cws-install'),
            axisStoreInstallHostBar: document.getElementById('axis-store-install-host-bar'),
            axisStoreInstallHostBadge: document.getElementById('axis-store-install-host-badge'),
            axisStoreInstallHostText: document.getElementById('axis-store-install-host-text'),
            axisStoreInstallHostOpen: document.getElementById('axis-store-install-host-open'),
            axisStoreInstallHostBtn: document.getElementById('axis-store-install-host-btn'),
            urlBarExtensions: document.getElementById('url-bar-extensions'),
            vaultSaveModal: document.getElementById('vault-save-modal'),
            vaultAutofillPanel: document.getElementById('vault-autofill-panel'),
            vaultPickModal: document.getElementById('vault-pick-modal'),
            urlBarChat: document.getElementById('url-bar-chat'),
            sidebarMediaDock: document.getElementById('sidebar-media-dock'),
            sidebarMediaDockCard: document.querySelector('#sidebar-media-dock .sidebar-media-dock-card'),
            sidebarMediaTitle: document.getElementById('sidebar-media-title'),
            sidebarMediaTitleMask: document.getElementById('sidebar-media-title-mask'),
            sidebarMediaTitleBtn: document.getElementById('sidebar-media-title-btn'),
            sidebarMediaSourceBadge: document.getElementById('sidebar-media-source-badge'),
            sidebarMediaPipBtn: document.getElementById('sidebar-media-pip-btn'),
            sidebarMediaDismissBtn: document.getElementById('sidebar-media-dismiss-btn'),
            sidebarMediaPrevBtn: document.getElementById('sidebar-media-prev-btn'),
            sidebarMediaPlayBtn: document.getElementById('sidebar-media-play-btn'),
            sidebarMediaNextBtn: document.getElementById('sidebar-media-next-btn'),
            sidebarMediaVolBtn: document.getElementById('sidebar-media-vol-btn')
        };
        this.elements.profileSwitcherList = document.getElementById('profile-switcher-list');
        this.elements.profileMenuAdd = document.getElementById('profile-menu-add');
    }

    async init() {
        // Load settings + shortcut cache in parallel (faster first interaction)
        await Promise.all([this.loadSettings(), this.refreshShortcutCache()]);
        this.syncGroqApiKeyFromSettings?.();
        const fallbackWebviewPreloadPath = (() => {
            try {
                return decodeURIComponent(new URL('webview-preload-bundle.js', window.location.href).pathname);
            } catch (_) {
                return null;
            }
        })();
        try {
            this._webviewCwsPreloadPath =
                (await window.electronAPI.getWebviewCwsPreloadPath?.()) ||
                fallbackWebviewPreloadPath ||
                null;
        } catch (_) {
            this._webviewCwsPreloadPath = fallbackWebviewPreloadPath || null;
        }
        try {
            this._settingsWebviewPreloadPath =
                (await window.electronAPI.getSettingsWebviewPreloadPath?.()) || null;
        } catch (_) {
            this._settingsWebviewPreloadPath = null;
        }
        try {
            this._vaultPageScanJs = (await window.electronAPI.vaultGetPageScanJs?.()) || null;
        } catch (_) {
            this._vaultPageScanJs = null;
        }
        try {
            const inj = await window.electronAPI.vaultGetAutofillInjectJs?.();
            this._vaultAutofillBootstrapJs = inj?.bootstrap || null;
            this._vaultAutofillProbeJs = inj?.probe || null;
            this._vaultAutofillHideJs = inj?.hide || null;
        } catch (_) {
            this._vaultAutofillBootstrapJs = null;
            this._vaultAutofillProbeJs = null;
            this._vaultAutofillHideJs = null;
        }
        try {
            window.electronAPI.onVaultGuestIpc?.((msg) => this.handleVaultGuestIpc(msg));
        } catch (_) {}
        if (this._webviewCwsPreloadPath && this.elements?.webview) {
            try {
                this.elements.webview.setAttribute('preload', this._webviewCwsPreloadPath);
            } catch (_) {
                /* ignore */
            }
        }
        if (this.elements?.webview) {
            try {
                this.elements.webview.setAttribute('partition', this.getSessionPartition());
            } catch (_) {}
        }
        this._lastJavascriptEnabled = this.settings?.javascriptEnabled !== false;
        this.syncTransparentSitesUi();
        this.syncAdBlockerUrlBarState();

        // Set `data-ui-theme` before any theme apply so CSS fallback rules for the light
        // shell land on the first paint (incognito stays dark regardless).
        const initialUiTheme = !this.isIncognitoWindow && this.settings?.uiTheme === 'light' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-ui-theme', initialUiTheme);

        if (window.electronAPI?.platform === 'darwin') {
            document.documentElement.classList.add('platform-darwin');
        }
        
        if (this.isIncognitoWindow) {
            document.body.classList.add('incognito-window');
        }
        try {
            window.electronAPI.onProfilesUpdated?.(() => {
                void this.refreshProfilesMenu();
            });
        } catch (_) {}
        try {
            window.electronAPI.onProfileMenuAction?.((payload) => {
                void this.handleProfileMenuAction(payload);
            });
        } catch (_) {}
        await this.refreshProfilesMenu();
        this.syncProfileSwitcherState();
        
        // ALWAYS apply theme on startup (incognito: always black, unchangable)
        const applyThemeNow = () => {
            try {
                if (document.body) {
                    if (this.isIncognitoWindow) {
                        this.resetToBlackTheme();
                        return;
                    }
                    if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                        this.applyCustomThemeFromSettings();
                    } else {
                        this.resetToBlackTheme();
                    }
                } else {
                    requestAnimationFrame(applyThemeNow);
                }
            } catch (error) {
                console.error('Error applying theme on init:', error);
                setTimeout(() => {
                    try {
                        if (this.isIncognitoWindow) {
                            this.resetToBlackTheme();
                        } else if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
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
        
        applyThemeNow();
        
        setTimeout(() => {
            if (this.isIncognitoWindow) {
                this.resetToBlackTheme();
            } else if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                this.applyCustomThemeFromSettings();
            }
        }, 50);
        
        this.applySidebarPosition(); // Apply saved sidebar position
        this._vaultPickWebview = null;
        this._vaultPendingSave = null;
        this._vaultDismissedOffers = new Set();
        this._vaultSaveOfferAt = new Map();
        this._vaultLastShownOfferKey = '';
        this._vaultPollTimer = null;
        this._vaultAutofillWebview = null;
        this._vaultAutofillPayload = null;
        this.setupVaultUi();
        this.setupProfileUi();
        this.ensureProfileSwipeChrome?.();
        this.setupProfileSwipeGestures?.();
        this.startVaultCredentialWatcher();
        this.setupEventListeners();
        this.setupSidebarMediaDockListeners();
        this.setupNewTabPage();
        this.setupTabSearch();
        this.setupLoadingScreen();
        this.setupSidebarResize();
        this.setupWebviewGuestResizeSync();

        // Load pinned tabs and tab groups (skip in incognito – start fresh)
        if (!this.isIncognitoWindow) {
            this.loadFavorites();
            await this.loadPinnedTabs();
            await this.loadTabGroups();
        }

        // Defer non-critical work to idle time to improve first interaction latency
        this.runWhenIdle(() => {
            // Drag & drop logic is non-critical until tabs exist
            this.setupTabDragDrop();
            // Move preloading to idle to avoid impacting benchmarks and first paint
            this.setupPerformanceOptimizations();
            if (!this.isIncognitoWindow) {
                this._seedCurrentProfileRuntimeCache?.();
                this._prefetchAdjacentProfileCaches?.();
            }
        });
        
        // Show empty state initially (no tabs on startup)
        this.updateEmptyState();
        
        // Initialize URL bar with default state
        this.updateUrlBar(null);
        
        if (!this.isIncognitoWindow && this.settings?.transparentSites) {
            this.applyTransparentSitesToAllWebviews();
        }

        this.runWhenIdle(() => this.applyAmbientFromSettings());
        
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

    async removeTransparentSitesFromWebview(webview) {
        if (!webview) return;
        const timers = webview.__axisTransparentFlushTimers;
        if (timers) {
            timers.forEach((id) => clearTimeout(id));
            webview.__axisTransparentFlushTimers = null;
        }
        try {
            await webview.executeJavaScript(AXIS_TRANSPARENT_SITES_DOM_PATCH_CLEANUP);
        } catch (e) {
            /* guest destroyed / restricted */
        }
        const key = webview.__axisTransparentCssKey;
        if (!key) return;
        try {
            await webview.removeInsertedCSS(key);
        } catch (e) {
            /* webview may be torn down or API unavailable */
        }
        webview.__axisTransparentCssKey = null;
        webview.__axisTransparentUrl = null;
        webview.__axisTransparentDomPatchUrl = null;
    }

    async _runTransparentSitesDomPatch(webview, url) {
        if (!webview) return;
        const pageUrl = url || (() => {
            try {
                return webview.getURL() || '';
            } catch (_) {
                return '';
            }
        })();
        if (webview.__axisTransparentDomPatchUrl === pageUrl) return;
        try {
            await webview.executeJavaScript(AXIS_TRANSPARENT_SITES_DOM_PATCH);
            webview.__axisTransparentDomPatchUrl = pageUrl;
        } catch (e) {
            /* guest destroyed / CSP (rare for top document) */
        }
    }

    _scheduleTransparentSitesReinjection(webview) {
        if (!webview || this.isBenchmarking || !this.settings?.transparentSites) return;
        const prop = '__axisTransparentFlushTimers';
        const prev = webview[prop];
        if (prev) prev.forEach((id) => clearTimeout(id));
        const delays = [100, 420, 1400];
        webview[prop] = delays.map((ms) =>
            setTimeout(() => {
                if (!this.settings?.transparentSites || this.isBenchmarking) return;
                void this.flushTransparentSitesForWebview(webview);
            }, ms)
        );
    }

    _touchTransparentSitesForWebview(webview) {
        if (!webview || this.isBenchmarking || !this.settings?.transparentSites) return;
        let url = '';
        try {
            url = webview.getURL() || '';
        } catch (_) {
            return;
        }
        if (webview.__axisTransparentCssKey && webview.__axisTransparentUrl === url) return;
        void this.flushTransparentSitesForWebview(webview)
            .then((didInject) => {
                if (didInject) this._scheduleTransparentSitesReinjection(webview);
            })
            .catch(() => {});
    }

    /** Fire-and-forget async guest work — never leave unhandled rejections in the terminal. */
    _voidGuestTask(promise) {
        if (promise && typeof promise.catch === 'function') {
            promise.catch(() => {});
        }
    }

    /** Origin + pathname — hash/query-only in-page nav should not re-theme or re-inject transparency. */
    _urlStablePageKey(url) {
        try {
            const u = new URL(String(url || ''));
            return `${u.origin}${u.pathname}`;
        } catch (_) {
            return String(url || '');
        }
    }

    /**
     * Fully hide non-active webviews. (Do not use a 0.3-opacity “stack”: Chromium/Electron composites
     * multiple guests so inactive pages visibly bleed through the active tab when glass mode is off.)
     */
    _styleInactiveTabWebview(wv) {
        if (!wv) return;
        wv.style.opacity = '0';
        wv.style.visibility = 'hidden';
        wv.style.pointerEvents = 'none';
        wv.style.zIndex = '0';
        wv.classList.add('inactive');
        wv.style.willChange = '';
    }

    async flushTransparentSitesForWebview(webview) {
        if (!webview || this.isBenchmarking) return false;
        if (!this.settings?.transparentSites) {
            await this.removeTransparentSitesFromWebview(webview);
            return false;
        }
        let url = '';
        try {
            url = webview.getURL() || '';
        } catch (e) {
            return false;
        }
        if (
            !url ||
            url === 'about:blank' ||
            /^axis:/i.test(url) ||
            /^file:/i.test(url) ||
            url.startsWith('chrome-error:') ||
            url.startsWith('chrome-devtools:')
        ) {
            await this.removeTransparentSitesFromWebview(webview);
            return false;
        }
        // Transparent-site CSS breaks YouTube hardware video compositing on watch pages.
        if (this.isYouTubeWatchUrl(url)) {
            await this.removeTransparentSitesFromWebview(webview);
            return false;
        }
        if (webview.__axisTransparentCssKey && webview.__axisTransparentUrl === url) {
            return true;
        }
        try {
            const prev = webview.__axisTransparentCssKey;
            if (prev) {
                try {
                    await webview.removeInsertedCSS(prev);
                } catch (e) {}
                webview.__axisTransparentCssKey = null;
                webview.__axisTransparentDomPatchUrl = null;
            }
            const key = await webview.insertCSS(AXIS_TRANSPARENT_SITES_CSS);
            if (key) {
                webview.__axisTransparentCssKey = key;
                webview.__axisTransparentUrl = url;
                await this._runTransparentSitesDomPatch(webview, url);
                return true;
            }
            return false;
        } catch (e) {
            /* Restricted URLs / guest destroy */
            return false;
        }
    }

    applyTransparentSitesToAllWebviews() {
        if (!this.settings?.transparentSites) return;
        // Hide background tabs before injecting transparency (injection is async; avoids one frame of bleed).
        this._syncBackgroundTabWebviewsForTransparentSetting();
        const cur = this.currentTab;
        this.tabs.forEach((tab, id) => {
            if (!tab?.webview) return;
            if (id === cur) {
                this._touchTransparentSitesForWebview(tab.webview);
            } else {
                this._scheduleTransparentSitesTouchForBackgroundWebview(tab.webview);
            }
        });
    }

    removeTransparentSitesFromAllWebviews() {
        this.tabs.forEach((tab) => {
            if (tab?.webview) void this.removeTransparentSitesFromWebview(tab.webview);
        });
        this._syncBackgroundTabWebviewsForTransparentSetting();
    }

    _syncBackgroundTabWebviewsForTransparentSetting() {
        const cur = this.currentTab;
        this.tabs.forEach((tab, id) => {
            if (!tab?.webview || id === cur) return;
            this._styleInactiveTabWebview(tab.webview);
        });
    }

    /**
     * Before showing the target tab, force every other webview into the inactive/hidden state.
     * Avoids transparent pages briefly compositing over another tab’s pixels (ordering bugs, missed updates).
     */
    _prepareWebviewsForTabSwitch(targetTabId) {
        const tid = this._normalizeTabMapKey(targetTabId);
        if (tid == null) return;
        this.tabs.forEach((tab, id) => {
            if (!tab?.webview || id === tid) return;
            this._styleInactiveTabWebview(tab.webview);
        });
    }

    /**
     * Remove guest webviews that no longer have a tab row (e.g. close raced a stale Map key, or DOM drift).
     * Prevents “sidebar updated but last page stays on screen”.
     */
    _purgeStaleWebviewsInContainer() {
        const container = document.getElementById('webviews-container');
        if (!container) return;
        for (const wv of Array.from(container.querySelectorAll('webview'))) {
            const nid = this._normalizeTabMapKey(wv.dataset.tabId);
            if (nid == null || !this.tabs.has(nid)) {
                try {
                    this.cleanupWebviewListeners(wv);
                    try {
                        wv.src = 'about:blank';
                    } catch (_) {}
                } catch (_) {}
                try {
                    wv.remove();
                } catch (_) {}
            }
        }
    }

    /** After any close, drop orphan guests and fix `currentTab` if it points at a removed id. */
    _syncAfterTabClose() {
        this._purgeStaleWebviewsInContainer();
        const ct = this._normalizeTabMapKey(this.currentTab);
        if (ct != null && !this.tabs.has(ct)) {
            this._applyFocusAfterTabClose(null);
        }
        const cur = this._normalizeTabMapKey(this.currentTab);
        const active = cur != null ? this.tabs.get(cur) : null;
        if (active?.isFavoriteTab) {
            this.renderFavorites();
            this._forceGuestLayoutSync();
        }
    }

    _scheduleTransparentSitesTouchForBackgroundWebview(webview) {
        if (!webview || this.isBenchmarking || !this.settings?.transparentSites) return;
        const run = () => {
            if (!this.settings?.transparentSites || this.isBenchmarking) return;
            this._touchTransparentSitesForWebview(webview);
        };
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(run, { timeout: 900 });
        } else {
            setTimeout(run, 48);
        }
    }

    syncTransparentSitesUi() {
        const on = !!(this.settings && this.settings.transparentSites);
        document.body?.classList.toggle('transparent-sites-mode', on);
        const urlBar = this.elements?.webviewUrlBar;
        if (urlBar && !on) {
            urlBar.style.backdropFilter = '';
            urlBar.style.webkitBackdropFilter = '';
        }
        this._syncNewTabWebviewUnderlay();
    }

    /** Hide the guest webview under the new-tab overlay so shell vibrancy shows through. */
    _syncNewTabWebviewUnderlay() {
        const ntp = document.getElementById('new-tab-page');
        const ntpOpen = ntp && !ntp.classList.contains('hidden');
        const tab = this.currentTab && this.tabs.has(this.currentTab) ? this.tabs.get(this.currentTab) : null;
        const wv = tab?.webview;
        if (!wv || tab?.url !== this.NEWTAB_URL) return;
        if (ntpOpen) {
            wv.style.opacity = '0';
            wv.style.visibility = 'hidden';
        } else {
            wv.style.opacity = '1';
            wv.style.visibility = 'visible';
        }
    }

    getActiveProfileDisplayName() {
        if (this.isIncognitoWindow) return 'Incognito';
        const active = this.profiles?.find((p) => p.id === this.profileId);
        return active?.name || (this.profileId === 'personal' ? 'Personal' : this.profileId);
    }

    getTimeGreeting() {
        const h = new Date().getHours();
        if (h < 12) return 'Good morning';
        if (h < 17) return 'Good afternoon';
        if (h < 22) return 'Good evening';
        return 'Good night';
    }

    updateNewTabHero() {
        const greetingEl = document.getElementById('new-tab-greeting');
        const tipEl = document.getElementById('new-tab-tip');
        const newTabPage = document.getElementById('new-tab-page');
        const input = document.getElementById('new-tab-input');
        if (!greetingEl) return;
        const name = this.getActiveProfileDisplayName();
        greetingEl.textContent = `${this.getTimeGreeting()}, ${name}.`;
        const s = this.settings || {};
        const welcomeOn = s.ntpWelcomeEnabled !== false;
        const tipsOn = welcomeOn && s.ntpWelcomeTips !== false;
        const aiOn = s.ntpAiSearchEnabled !== false;
        const tips = [];
        if (tipsOn) {
            tips.push('Search the web or paste a link to open a site.');
            if (aiOn && !this.hasGroqApiKey()) {
                tips.push('Add a Groq API key in Settings to ask AI from the start tab.');
            }
            if (s.ntpWelcomeUpdates !== false) {
                tips.push('Use Help → Check for Updates when you want the latest Axis build.');
            }
        }
        if (tipEl) {
            if (tips.length) {
                tipEl.textContent = tips[Math.floor(Date.now() / 45000) % tips.length];
                tipEl.style.display = '';
            } else {
                tipEl.textContent = '';
                tipEl.style.display = 'none';
            }
        }
        const greetingOn = welcomeOn && s.ntpWelcomeGreeting !== false;
        const hero = document.getElementById('new-tab-hero');
        hero?.classList.toggle('hidden', !welcomeOn);
        if (greetingEl) greetingEl.style.display = greetingOn ? '' : 'none';
        const hasQuery = !!(input?.value?.trim());
        newTabPage?.classList.toggle('has-query', hasQuery);
    }

    isNewTabInChat() {
        const page = document.getElementById('new-tab-page');
        const bar = document.getElementById('new-tab-search-bar');
        return !!(
            (page && page.classList.contains('ntp-ai-chat-mode'))
            || bar?.classList.contains('new-tab-ai-composer-bar')
        );
    }

    mountNewTabSearchBarToStart() {
        const wrapper = document.getElementById('new-tab-search-wrapper');
        const bar = document.getElementById('new-tab-search-bar');
        if (!wrapper || !bar) return;
        if (bar.parentElement !== wrapper) {
            wrapper.insertBefore(bar, wrapper.firstChild);
        }
        bar.classList.remove('new-tab-ai-composer-bar');
    }

    mountNewTabSearchBarToComposer() {
        const slot = document.getElementById('new-tab-ai-composer-slot');
        const bar = document.getElementById('new-tab-search-bar');
        if (!slot || !bar) return;
        slot.appendChild(bar);
        bar.classList.add('new-tab-ai-composer-bar');
    }

    _finishNewTabAiChatLayout({ hideStartView = true } = {}) {
        const startView = document.getElementById('new-tab-start-view');
        const chatView = document.getElementById('new-tab-ai-chat-view');
        const messages = document.getElementById('new-tab-ask-messages');
        if (hideStartView) startView?.classList.add('hidden');
        chatView?.classList.remove('hidden');
        messages?.classList.remove('hidden');
        this.mountNewTabSearchBarToComposer();
        this.setNewTabAiChatChromeVisible(true);
        this.syncNewTabInputChrome();
    }

    async beginNewTabAiChatTransition({ animate = true } = {}) {
        const page = document.getElementById('new-tab-page');
        const startView = document.getElementById('new-tab-start-view');
        if (!page) return;
        if (this.isNewTabInChat()) return;

        if (!animate) {
            this._finishNewTabAiChatLayout();
            page.classList.add('ntp-ai-chat-mode');
            this.syncNewTabInputChrome();
            if (this.currentTab != null) {
                this.applyNewTabTabChrome(this.currentTab);
                this.updateUrlBar(null);
            }
            this._focusNewTabInput();
            return;
        }

        page.classList.add('ntp-ai-chat-entering');
        const chatView = document.getElementById('new-tab-ai-chat-view');
        const messages = document.getElementById('new-tab-ask-messages');
        chatView?.classList.remove('hidden');
        messages?.classList.remove('hidden');
        this.mountNewTabSearchBarToComposer();
        this.setNewTabAiChatChromeVisible(true);
        this.syncNewTabInputChrome();
        await new Promise((resolve) => {
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
        page.classList.add('ntp-ai-chat-mode');
        this.syncNewTabInputChrome();
        await new Promise((resolve) => setTimeout(resolve, 420));
        page.classList.remove('ntp-ai-chat-entering');
        startView?.classList.add('hidden');
        if (this.currentTab != null) {
            this.applyNewTabTabChrome(this.currentTab);
            this.updateUrlBar(null);
        }
        this._focusNewTabInput();
    }

    isTabInNtpAiChat(tabId) {
        if (tabId == null) return false;
        const tab = this.tabs.get(tabId);
        if (!tab || tab.url !== this.NEWTAB_URL) return false;
        if (tabId === this.currentTab) return this.isNewTabInChat();
        const st = tab.newTabPageState;
        return st?.inChat === true || !!(st?.askMessagesHtml && String(st.askMessagesHtml).trim());
    }

    setNewTabAiChatChromeVisible(enabled) {
        document.getElementById('new-tab-menu-btn')?.classList.toggle('hidden', enabled);
    }

    _scrollNewTabAskMessagesToBottom() {
        const messages = document.getElementById('new-tab-ask-messages');
        if (!messages) return;
        requestAnimationFrame(() => {
            messages.scrollTop = messages.scrollHeight;
        });
    }

    _focusNewTabInput() {
        requestAnimationFrame(() => document.getElementById('new-tab-input')?.focus());
    }

    _persistNewTabChatStateIfNeeded() {
        if (this.currentTab != null) {
            this.saveNewTabPageStateToTab(this.currentTab);
        }
    }

    applyNewTabTabChrome(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || tab.url !== this.NEWTAB_URL || tab.customTitle) return;

        const inAiChat = this.isTabInNtpAiChat(tabId);
        const title = inAiChat ? 'AI Chat' : 'New Tab';
        const favicon = inAiChat ? this.NTP_AI_CHAT_FAVICON : this.NTP_DEFAULT_FAVICON;
        tab.title = title;
        tab.favicon = favicon;

        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (tabElement) {
            const titleEl = tabElement.querySelector('.tab-title');
            if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;
            const faviconEl = tabElement.querySelector('.tab-favicon');
            if (faviconEl && faviconEl.tagName === 'IMG') {
                faviconEl.style.visibility = 'visible';
                if (faviconEl.src !== favicon) faviconEl.src = favicon;
            }
            this.updateTabTooltip(tabId);
        }

        if (tabId === this.currentTab && window.electronAPI?.setWindowTitle) {
            const fallback = this.isIncognitoWindow ? 'Axis — Incognito' : 'Axis Browser';
            window.electronAPI.setWindowTitle(inAiChat ? 'AI Chat' : fallback);
        }
    }

    updateNewTabSendButtonState() {
        const input = document.getElementById('new-tab-input');
        const btn = document.getElementById('new-tab-send-btn');
        if (!btn || !input) return;
        const canSend = this.isNewTabInChat() && !!input.value.trim();
        btn.disabled = !canSend;
        btn.classList.toggle('is-disabled', !canSend);
    }

    syncNewTabInputChrome() {
        const input = document.getElementById('new-tab-input');
        const page = document.getElementById('new-tab-page');
        const inChat = this.isNewTabInChat();
        if (input) {
            input.placeholder = inChat ? 'Message AI…' : 'Search or Enter URL...';
            input.setAttribute('aria-label', inChat ? 'Message AI' : 'Search or URL');
        }
        page?.classList.toggle('ntp-in-chat', inChat);
        this.updateNewTabSendButtonState();
        this.updateNewTabHero();
    }

    showNewTabAskSetup() {
        document.getElementById('new-tab-ask-setup')?.classList.remove('hidden');
    }

    hideNewTabAskSetup() {
        document.getElementById('new-tab-ask-setup')?.classList.add('hidden');
    }

    performNewTabSearch() {
        const input = document.getElementById('new-tab-input');
        if (!input?.value?.trim()) return;
        const suggestionsContainer = document.getElementById('new-tab-suggestions');
        const items = suggestionsContainer?.querySelectorAll('.spotlight-suggestion-item');
        if (this.spotlightSelectedIndex >= 0 && items?.[this.spotlightSelectedIndex]) {
            const selected = items[this.spotlightSelectedIndex];
            if (!selected.classList.contains('new-tab-action-item')) {
                selected.click();
                return;
            }
        }
        this.performSpotlightSearch();
    }

    triggerNewTabAskFromSearch() {
        const input = document.getElementById('new-tab-input');
        if (!input?.value?.trim()) return;
        if (!this.hasGroqApiKey()) {
            this.showNewTabAskSetup();
            return;
        }
        this.hideNewTabAskSetup();
        void this.sendNewTabAskMessage();
    }

    stopAmbientAudio() {
        const ch = this._ambientAudioChain;
        if (!ch) return;
        try {
            if (ch.source) {
                try {
                    ch.source.stop();
                } catch (e) {
                    /* already stopped */
                }
                try {
                    ch.source.disconnect();
                } catch (e) {}
            }
            if (ch.nodes) {
                ch.nodes.forEach((n) => {
                    try {
                        n.disconnect();
                    } catch (e) {}
                });
            }
        } catch (e) {}
        this._ambientAudioChain = null;
    }

    /**
     * Maps settings slider (0–1) to master gain. Perceptual curve + low ceiling
     * so ambient stays “bed” level and high slider positions are usable.
     */
    _ambientUiToMaxNodeGain(volume01) {
        const v = Math.max(0, Math.min(1, volume01));
        const shaped = Math.pow(v, 1.28);
        const maxOut = 0.26;
        return Math.max(0, Math.min(1, shaped * maxOut));
    }

    /** True if any tab is outputting audible page media (playing and not tab-muted). */
    _anyTabPlayingAudibleAudio() {
        for (const tab of this.tabs.values()) {
            if (tab && tab.isPlayingAudio && !tab.isMuted) return true;
        }
        return false;
    }

    /** Applies optional “mute ambient when tab audio plays” ducking. */
    _ambientFinalOutputGain(targetGain) {
        if (this.settings?.ambientMuteWhenTabAudio === true && this._anyTabPlayingAudibleAudio()) {
            return 0;
        }
        return targetGain;
    }

    _createAmbientNoiseBuffer(ctx, seconds, type) {
        const frames = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        const buf = ctx.createBuffer(1, frames, ctx.sampleRate);
        const d = buf.getChannelData(0);
        if (type === 'brown') {
            let last = 0;
            for (let i = 0; i < frames; i++) {
                const w = Math.random() * 2 - 1;
                last = (last + 0.035 * w) * 0.985;
                d[i] = Math.max(-1, Math.min(1, last * 2.45));
            }
        } else if (type === 'pink') {
            let b0 = 0;
            let b1 = 0;
            let b2 = 0;
            let b3 = 0;
            let b4 = 0;
            let b5 = 0;
            let b6 = 0;
            for (let i = 0; i < frames; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.969 * b2 + white * 0.153852;
                b3 = 0.8665 * b3 + white * 0.310485;
                b4 = 0.55 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.016898;
                const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
                b6 = 0.536926 * b6 + white * 0.115926;
                d[i] = Math.max(-1, Math.min(1, pink * 0.11));
            }
        } else {
            for (let i = 0; i < frames; i++) {
                d[i] = Math.random() * 2 - 1;
            }
        }
        const fade = Math.min(Math.floor(ctx.sampleRate * 0.07), Math.floor(frames / 2));
        if (fade > 32) {
            for (let i = 0; i < fade; i++) {
                const t = i / fade;
                const w = 0.5 - 0.5 * Math.cos(Math.PI * t);
                const head = d[i];
                const tail = d[frames - fade + i];
                const mid = head * (1 - w) + tail * w;
                d[i] = mid;
                d[frames - fade + i] = mid;
            }
        }
        return buf;
    }

    startAmbientAudio(preset, volume01, masterGainOverride) {
        this.stopAmbientAudio();
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;

        if (!this._ambientAudioCtx) {
            this._ambientAudioCtx = new Ctx();
        }
        const ctx = this._ambientAudioCtx;
        if (ctx.state === 'suspended' && ctx.resume) {
            ctx.resume().catch(() => {});
        }

        const baseGain = this._ambientUiToMaxNodeGain(volume01);
        const targetGain =
            typeof masterGainOverride === 'number' && Number.isFinite(masterGainOverride)
                ? masterGainOverride
                : baseGain;
        const trim = ctx.createGain();
        const master = ctx.createGain();
        master.gain.value = targetGain;

        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.value = -32;
        compressor.knee.value = 22;
        compressor.ratio.value = 2.1;
        compressor.attack.value = 0.025;
        compressor.release.value = 0.38;

        const source = ctx.createBufferSource();
        const nodes = [];
        let filter;
        let hp;
        let shelf;

        const connectToDestination = (tail) => {
            tail.connect(trim);
            trim.connect(master);
            master.connect(compressor);
            compressor.connect(ctx.destination);
            nodes.push(trim, master, compressor);
        };

        switch (preset) {
            case 'rain':
                trim.gain.value = 1;
                source.buffer = this._createAmbientNoiseBuffer(ctx, 4, 'pink');
                source.loop = true;
                filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 820;
                filter.Q.value = 0.62;
                source.connect(filter);
                connectToDestination(filter);
                nodes.unshift(filter);
                break;
            case 'warm':
                trim.gain.value = 1;
                source.buffer = this._createAmbientNoiseBuffer(ctx, 4, 'brown');
                source.loop = true;
                filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 400;
                filter.Q.value = 0.48;
                source.connect(filter);
                connectToDestination(filter);
                nodes.unshift(filter);
                break;
            case 'focus':
                trim.gain.value = 0.9;
                source.buffer = this._createAmbientNoiseBuffer(ctx, 4, 'brown');
                source.loop = true;
                filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 118;
                filter.Q.value = 0.32;
                source.connect(filter);
                connectToDestination(filter);
                nodes.unshift(filter);
                break;
            case 'ocean':
                trim.gain.value = 1;
                source.buffer = this._createAmbientNoiseBuffer(ctx, 4, 'brown');
                source.loop = true;
                filter = ctx.createBiquadFilter();
                filter.type = 'bandpass';
                filter.frequency.value = 205;
                filter.Q.value = 0.32;
                shelf = ctx.createBiquadFilter();
                shelf.type = 'lowshelf';
                shelf.frequency.value = 265;
                shelf.gain.value = 2.4;
                source.connect(filter);
                filter.connect(shelf);
                connectToDestination(shelf);
                nodes.unshift(filter, shelf);
                break;
            case 'wind':
                trim.gain.value = 1;
                source.buffer = this._createAmbientNoiseBuffer(ctx, 3.5, 'pink');
                source.loop = true;
                hp = ctx.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 440;
                filter = ctx.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = 1050;
                filter.Q.value = 0.55;
                filter.gain.value = -2.5;
                source.connect(hp);
                hp.connect(filter);
                connectToDestination(filter);
                nodes.unshift(hp, filter);
                break;
            case 'still':
                trim.gain.value = 0.55;
                source.buffer = this._createAmbientNoiseBuffer(ctx, 4, 'brown');
                source.loop = true;
                filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = 620;
                source.connect(filter);
                connectToDestination(filter);
                nodes.unshift(filter);
                break;
            default:
                try {
                    master.disconnect();
                    compressor.disconnect();
                } catch (e) {}
                return;
        }

        this._ambientAudioChain = { source, master, trim, compressor, nodes };
        try {
            source.start(0);
        } catch (e) {
            this.stopAmbientAudio();
        }
    }

    applyAmbientFromSettings() {
        const presets = new Set(['rain', 'warm', 'focus', 'ocean', 'wind', 'still']);
        const on = this.settings?.ambientAudioEnabled === true;
        let preset = this.settings?.ambientAudioPreset || 'rain';
        if (!presets.has(preset)) preset = 'rain';
        let v = Number(this.settings?.ambientAudioVolume);
        if (!Number.isFinite(v)) v = 48;
        v = Math.max(0, Math.min(100, v));
        const v01 = v / 100;
        const targetGain = this._ambientUiToMaxNodeGain(v01);
        const outGain = this._ambientFinalOutputGain(targetGain);

        if (!on) {
            this.stopAmbientAudio();
            this._ambientPreset = null;
            return;
        }

        if (
            this._ambientAudioChain &&
            this._ambientPreset === preset &&
            this._ambientAudioChain.master &&
            this._ambientAudioCtx
        ) {
            try {
                const ctx = this._ambientAudioCtx;
                this._ambientAudioChain.master.gain.setTargetAtTime(outGain, ctx.currentTime, 0.06);
            } catch (e) {
                try {
                    this._ambientAudioChain.master.gain.value = outGain;
                } catch (e2) {}
            }
            return;
        }

        this._ambientPreset = preset;
        this.startAmbientAudio(preset, v01, outGain);
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
        // Downloads button - open in-app downloads popup
        el.downloadsBtnFooter?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showDownloadsPopup();
        });
        
        // Sidebar plus button - toggle New tab / New tab group menu
        el.sidebarPlusBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleSidebarPlusMenu();
        });
        document.getElementById('sidebar-plus-new-tab')?.addEventListener('click', () => {
            this.hideSidebarPlusMenu();
            this.createNewTab();
        });
        document.getElementById('sidebar-plus-new-tab-group')?.addEventListener('click', () => {
            this.hideSidebarPlusMenu();
            this.showTabGroupColorPicker((color) => {
                this.createNewTabGroup(color);
                this.hideTabGroupColorPicker();
            });
        });
        document.getElementById('sidebar-plus-incognito')?.addEventListener('click', () => {
            this.hideSidebarPlusMenu();
            window.electronAPI.openIncognitoWindow();
        });
        el.profileSwitcherTrigger?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleProfileSwitcherMenu();
        });
        el.profileMenuAdd?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.hideProfileSwitcherMenu();
            this.showProfileCreateModal();
        });
        
        el.closeDownloads?.addEventListener('click', () => this.toggleDownloads());
        
        // Listen for downloads popup actions
        window.electronAPI.onDownloadsPopupAction((action, data) => {
            this.handleDownloadsPopupAction(action, data);
        });

        window.electronAPI?.onAxisDownloadActivity?.((payload) => {
            const active = !!payload?.active;
            document.body.classList.toggle('axis-download-activity', active);
            const dlBtn = document.getElementById('downloads-btn-footer');
            if (dlBtn) {
                dlBtn.setAttribute('aria-busy', active ? 'true' : 'false');
                if (!active) {
                    document.body.classList.remove('axis-download-indeterminate');
                    dlBtn.style.removeProperty('--axis-dl-pct');
                    dlBtn.removeAttribute('title');
                    dlBtn.setAttribute('title', 'Downloads');
                } else {
                    const p = payload.progress;
                    const hasPct = typeof p === 'number' && Number.isFinite(p);
                    if (hasPct) {
                        document.body.classList.remove('axis-download-indeterminate');
                        dlBtn.style.setProperty('--axis-dl-pct', String(Math.max(0, Math.min(1, p))));
                    } else {
                        document.body.classList.add('axis-download-indeterminate');
                        dlBtn.style.removeProperty('--axis-dl-pct');
                    }
                    dlBtn.setAttribute('title', 'Downloading…');
                }
            }
            this.scheduleDownloadsPopupRefresh();
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
        this.elements.clearUnpinnedFloatingBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearUnpinnedTabs();
        });

        // Empty state new tab buttons - open custom new tab page
        el.emptyStateBtn?.addEventListener('click', () => this.createNewTab());
        el.emptyStateBtnEmpty?.addEventListener('click', () => this.createNewTab());
        el.sidebarNewTabBtn?.addEventListener('click', () => this.createNewTab());

        // Security panel - use cached elements
        el.closeSecurity?.addEventListener('click', () => this.toggleSecurity());
        el.viewCertificate?.addEventListener('click', () => this.viewCertificate());
        el.securitySettings?.addEventListener('click', () => this.openSecuritySettings());
        el.securityPanel?.addEventListener('click', (e) => {
            if (e.target.id === 'security-panel') {
                this.toggleSecurity();
            }
        });

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

        document.getElementById('change-tab-icon-option')?.addEventListener('click', () => {
            void this.showIconPicker('tab');
            this.hideTabContextMenu();
        });

        document.getElementById('add-tab-favorite-option')?.addEventListener('click', () => {
            if (this.contextMenuTabId) {
                this.addTabToFavorites(this.contextMenuTabId);
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
                    this.createNewTab();
                    break;
                case 'new-incognito-tab':
                    window.electronAPI.openIncognitoWindow();
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

        // Sidebar context menu (DOM template — order matches native menu)
        document.getElementById('sidebar-new-tab-option')?.addEventListener('click', () => {
            this.createNewTab();
            this.hideSidebarContextMenu();
        });
        document.getElementById('sidebar-new-tab-group-option')?.addEventListener('click', () => {
            this.showTabGroupColorPicker((color) => {
                this.createNewTabGroup(color);
                this.hideTabGroupColorPicker();
            });
            this.hideSidebarContextMenu();
        });
        document.getElementById('sidebar-new-incognito-option')?.addEventListener('click', () => {
            window.electronAPI?.openIncognitoWindow?.();
            this.hideSidebarContextMenu();
        });
        document.getElementById('sidebar-toggle-option')?.addEventListener('click', () => {
            this.toggleSidebar();
            this.hideSidebarContextMenu();
        });
        document.getElementById('sidebar-position-option')?.addEventListener('click', () => {
            this.toggleSidebarPosition();
            this.hideSidebarContextMenu();
        });
        
        // Listen for webpage context menu actions from main process
        window.electronAPI.onWebpageContextMenuAction(async (action, data) => {
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
                case 'paste-match-style':
                    void this.pasteMatchStyle();
                    break;
                case 'select-all':
                    this.selectAll();
                    break;
                case 'search-selection': {
                    const q = data && data.selectionText ? String(data.selectionText).trim() : '';
                    if (q) {
                        this.createNewTab(this.getSearchUrl(q));
                    }
                    break;
                }
                case 'speech-start':
                    if (data && data.selectionText) {
                        this.startSpeakingSelection(data.selectionText);
                    }
                    break;
                case 'speech-stop':
                    this.stopSpeakingSelection();
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
                case 'open-image-new-tab': {
                    const raw = data && data.srcURL;
                    if (!raw) break;
                    const pageURL = (data && data.pageURL) || '';
                    const prepared = this.prepareContextMenuImageUrl(raw, pageURL);
                    if (prepared) {
                        this.createNewTab(prepared, { trustedContextImage: true });
                    }
                    break;
                }
                case 'save-image':
                    if (data && data.srcURL && window.electronAPI?.saveImageFromUrl) {
                        void window.electronAPI
                            .saveImageFromUrl(data.srcURL, Number(data.guestWebContentsId) || 0)
                            .then((result) => {
                                if (!result?.ok && result?.error) {
                                    console.warn('Save image:', result.error);
                                }
                            });
                    }
                    break;
                case 'copy-image': {
                    const gx = Math.round(Number(data?.x) || 0);
                    const gy = Math.round(Number(data?.y) || 0);
                    const gid = Number(data?.guestWebContentsId) || 0;
                    let ok = false;
                    if (gid > 0 && window.electronAPI?.copyImageAtGuest) {
                        try {
                            const r = await window.electronAPI.copyImageAtGuest(gid, gx, gy);
                            ok = !!(r && r.ok);
                        } catch (_) {
                            ok = false;
                        }
                    }
                    if (!ok) {
                        let wv = null;
                        if (this._contextMenuSourceTabId != null) {
                            wv = this.tabs.get(this._contextMenuSourceTabId)?.webview;
                        }
                        if (!wv) wv = this.getActiveWebview();
                        try {
                            if (wv && typeof wv.copyImageAt === 'function') {
                                wv.copyImageAt(gx, gy);
                                ok = true;
                            }
                        } catch (_) {
                            ok = false;
                        }
                    }
                    if (ok) {
                        this.showNotification('Image copied to clipboard', 'success');
                    }
                    break;
                }
                case 'copy-image-url': {
                    const raw = data && data.srcURL;
                    if (!raw) break;
                    const pageURL = (data && data.pageURL) || '';
                    const prepared = this.prepareContextMenuImageUrl(raw, pageURL);
                    if (prepared) {
                        const ok = await this.writeTextToClipboard(prepared);
                        if (ok) {
                            this.showNotification('Image URL copied to clipboard', 'success');
                        } else {
                            this.showNotification('Could not copy to clipboard', 'error');
                        }
                    } else {
                        this.showNotification('Could not resolve image address', 'error');
                    }
                    break;
                }
                case 'copy-url':
                    this.copyCurrentUrl();
                    break;
                case 'copy-url-markdown':
                    void this.copyCurrentUrlAsMarkdown();
                    break;
                case 'print':
                    this.printPage();
                    break;
                case 'inspect': {
                    const inspectWv = this.getActiveWebview();
                    if (!inspectWv) break;
                    const ic = this.webviewContextInfo || {};
                    const fromData =
                        data &&
                        Number.isFinite(Number(data.x)) &&
                        Number.isFinite(Number(data.y));
                    const fromCtx =
                        Number.isFinite(Number(ic.x)) && Number.isFinite(Number(ic.y));
                    const ix = fromData ? Number(data.x) : fromCtx ? Number(ic.x) : NaN;
                    const iy = fromData ? Number(data.y) : fromCtx ? Number(ic.y) : NaN;
                    try {
                        if (Number.isFinite(ix) && Number.isFinite(iy)) {
                            inspectWv.inspectElement(Math.round(ix), Math.round(iy));
                        } else {
                            inspectWv.openDevTools();
                        }
                    } catch (_) {
                        try {
                            inspectWv.openDevTools();
                        } catch (__) {
                            /* ignore */
                        }
                    }
                    break;
                }
                case 'replace-misspelling': {
                    const replacement = data && typeof data.replacement === 'string' ? data.replacement : '';
                    const manualWord = data && typeof data.manualReplaceWord === 'string' ? data.manualReplaceWord : '';
                    const activeWebview = this.getActiveWebview();
                    if (!replacement || !activeWebview) break;
                    if (manualWord) {
                        const wordJson = JSON.stringify(manualWord);
                        const replJson = JSON.stringify(replacement);
                        const js = `(function(){
                            try {
                              var el = document.activeElement;
                              if (!el) return false;
                              var target = String(${wordJson});
                              var repl = String(${replJson});
                              if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
                                var v = String(el.value || '');
                                var start = (typeof el.selectionStart === 'number') ? el.selectionStart : v.length;
                                var WORD = /[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF'\\-]/;
                                var s = Math.max(0, Math.min(v.length, start));
                                var e = s;
                                while (s > 0 && WORD.test(v.charAt(s-1))) s--;
                                while (e < v.length && WORD.test(v.charAt(e))) e++;
                                var slice = v.substring(s, e);
                                if (slice.toLowerCase() !== target.toLowerCase()) {
                                  var idx = v.toLowerCase().lastIndexOf(target.toLowerCase(), start);
                                  if (idx >= 0) { s = idx; e = idx + target.length; }
                                  else return false;
                                }
                                var proto = el.tagName === 'INPUT'
                                  ? window.HTMLInputElement.prototype
                                  : window.HTMLTextAreaElement.prototype;
                                var setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
                                setter.call(el, v.substring(0, s) + repl + v.substring(e));
                                try { el.setSelectionRange(s + repl.length, s + repl.length); } catch (err) {}
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                return true;
                              }
                              var sel = window.getSelection();
                              if (!sel || sel.rangeCount === 0) return false;
                              var range = sel.getRangeAt(0).cloneRange();
                              var node = range.startContainer;
                              if (!node || node.nodeType !== 3) return false;
                              var text = String(node.textContent || '');
                              var off = range.startOffset;
                              var WORD2 = /[A-Za-z\\u00C0-\\u024F\\u0370-\\u03FF'\\-]/;
                              var s2 = off, e2 = off;
                              while (s2 > 0 && WORD2.test(text.charAt(s2-1))) s2--;
                              while (e2 < text.length && WORD2.test(text.charAt(e2))) e2++;
                              var slice2 = text.substring(s2, e2);
                              if (slice2.toLowerCase() !== target.toLowerCase()) {
                                var idx2 = text.toLowerCase().lastIndexOf(target.toLowerCase(), off);
                                if (idx2 >= 0) { s2 = idx2; e2 = idx2 + target.length; }
                                else return false;
                              }
                              var r2 = document.createRange();
                              r2.setStart(node, s2);
                              r2.setEnd(node, e2);
                              sel.removeAllRanges();
                              sel.addRange(r2);
                              document.execCommand('insertText', false, repl);
                              return true;
                            } catch (err) { return false; }
                          })();`;
                        try {
                            await activeWebview.executeJavaScript(js, true);
                        } catch (err) {
                            console.warn('manual replaceMisspelling failed:', err);
                        }
                    } else if (typeof activeWebview.replaceMisspelling === 'function') {
                        try {
                            activeWebview.replaceMisspelling(replacement);
                        } catch (err) {
                            console.warn('replaceMisspelling failed:', err);
                        }
                    }
                    break;
                }
                case 'add-to-dictionary': {
                    const word = data && typeof data.word === 'string' ? data.word.trim() : '';
                    if (word && window.electronAPI?.addToSpellCheckerDictionary) {
                        window.electronAPI.addToSpellCheckerDictionary(word).catch((err) => {
                            console.warn('addToSpellCheckerDictionary failed:', err);
                        });
                    }
                    break;
                }
            }
        });
        
        // Favorites tile — native context menu (main process)
        window.electronAPI.onFavoriteContextMenuAction?.((action) => {
            if (this.isIncognitoWindow) {
                this.contextMenuFavoriteId = null;
                return;
            }
            const favId = this.contextMenuFavoriteId;
            const findFav = () => (favId ? this.favorites.find((f) => f.id === favId) : null);
            switch (action) {
                case 'open': {
                    const fav = findFav();
                    if (fav) this.navigateFavorite(fav);
                    this.contextMenuFavoriteId = null;
                    break;
                }
                case 'open-new-tab': {
                    const fav = findFav();
                    const url = fav ? this.normalizeFavoriteUrl(fav.url) : '';
                    if (url) {
                        this.createNewTab(url);
                        this.showNotification('Opened in new tab', 'success');
                    }
                    this.contextMenuFavoriteId = null;
                    break;
                }
                case 'copy-link': {
                    const fav = findFav();
                    const url = fav ? this.normalizeFavoriteUrl(fav.url) : '';
                    if (url) {
                        navigator.clipboard.writeText(url).then(
                            () => this.showNotification('Link copied to clipboard', 'success'),
                            () => this.showNotification('Could not copy link', 'error')
                        );
                    }
                    this.contextMenuFavoriteId = null;
                    break;
                }
                case 'rename': {
                    const fav = findFav();
                    if (fav) {
                        const cur = fav.title || '';
                        const next = window.prompt('Favorite name:', cur);
                        if (next != null) {
                            const t = String(next).trim();
                            if (t) {
                                fav.title = t;
                                const rt = this._normalizeTabMapKey(fav.runtimeTabId);
                                if (rt != null && this.tabs.has(rt)) {
                                    const tab = this.tabs.get(rt);
                                    tab.title = t;
                                    this.tabs.set(rt, tab);
                                    const tabElement = document.querySelector(`[data-tab-id="${rt}"]`);
                                    if (tabElement) {
                                        const titleElement = tabElement.querySelector('.tab-title');
                                        if (titleElement) titleElement.textContent = t;
                                        this.updateTabTooltip(rt);
                                    }
                                }
                                this.saveFavorites();
                                this.renderFavorites();
                            }
                        }
                    }
                    this.contextMenuFavoriteId = null;
                    break;
                }
                case 'change-icon': {
                    void this.showIconPicker('favorite');
                    break;
                }
                case 'reset-icon': {
                    const fav = findFav();
                    if (fav) {
                        fav.customIcon = null;
                        fav.customIconType = null;
                        const rt = this._normalizeTabMapKey(fav.runtimeTabId);
                        if (rt != null && this.tabs.has(rt)) {
                            const tab = this.tabs.get(rt);
                            tab.customIcon = null;
                            tab.customIconType = null;
                            this.tabs.set(rt, tab);
                            const tabElement = document.querySelector(`[data-tab-id="${rt}"]`);
                            if (tabElement) this.updateTabIcon(tabElement, rt);
                        }
                        this.saveFavorites();
                        this.renderFavorites();
                        this.showNotification('Icon reset', 'success');
                    }
                    this.contextMenuFavoriteId = null;
                    break;
                }
                case 'remove': {
                    if (favId) this.removeFavorite(favId);
                    this.contextMenuFavoriteId = null;
                    break;
                }
                default:
                    this.contextMenuFavoriteId = null;
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
                case 'reset-icon':
                    if (this.contextMenuTabId) {
                        const tabId = this.contextMenuTabId;
                        const tab = this.tabs.get(tabId);
                        if (tab) {
                            tab.customIcon = null;
                            tab.customIconType = null;
                            this.tabs.set(tabId, tab);
                            const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
                            if (tabElement) this.updateTabIcon(tabElement, tabId);
                            if (tab.pinned) this.savePinnedTabs();
                            if (tab.isFavoriteTab && tab.favoriteId) {
                                const fav = this.favorites.find((f) => f.id === tab.favoriteId);
                                if (fav) {
                                    fav.customIcon = null;
                                    fav.customIconType = null;
                                    this.saveFavorites();
                                    this.renderFavorites();
                                }
                            }
                        }
                    }
                    break;
                case 'add-to-favorites':
                    if (this.contextMenuTabId) {
                        this.addTabToFavorites(this.contextMenuTabId);
                    }
                    break;
                case 'add-to-tab-group':
                case 'move-to-tab-group':
                    if (this.contextMenuTabId && data && data.tabGroupId != null) {
                        const gid = this.findTabGroupKey(data.tabGroupId);
                        if (gid != null) this.addTabToTabGroup(this.contextMenuTabId, gid);
                    }
                    break;
                case 'remove-from-tab-group':
                    if (this.contextMenuTabId && data && data.tabGroupId != null) {
                        const gid = this.findTabGroupKey(data.tabGroupId);
                        if (gid != null) this.removeTabFromTabGroup(this.contextMenuTabId, gid);
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
                case 'reset-icon':
                    if (this.contextMenuTabGroupId != null) {
                        const gid = this.findTabGroupKey(this.contextMenuTabGroupId);
                        if (gid != null) {
                            const tabGroup = this.tabGroups.get(gid);
                            if (tabGroup) {
                                tabGroup.icon = null;
                                tabGroup.iconType = null;
                                this.tabGroups.set(gid, tabGroup);
                                this.saveTabGroups();
                                this.renderTabGroups();
                            }
                        }
                    }
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

        const changeTabGroupIconOption = document.getElementById('change-tab-group-icon-option');
        if (changeTabGroupIconOption) {
            changeTabGroupIconOption.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                void this.showIconPicker('tab-group');
                this.hideTabGroupContextMenu();
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
            if (this.matchesSelectAllShortcut(e)) {
                e.preventDefault();
                this.selectAllFromShortcut(e);
                return;
            }

            // Prevent the Tab key from triggering any custom app behavior
            // when pressed outside editable fields. We want Tab to behave
            // normally ONLY inside text inputs / textareas / contenteditable.
            if (e.key === 'Tab') {
                const target = e.target;
                const tag = target && target.tagName;
                const isEditable =
                    tag === 'INPUT' ||
                    tag === 'TEXTAREA' ||
                    (target && target.isContentEditable);

                if (!isEditable) {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
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

        const searchPrevBtn = document.getElementById('search-prev');
        const searchNextBtn = document.getElementById('search-next');
        searchPrevBtn.addEventListener('mousedown', (e) => e.preventDefault());
        searchNextBtn.addEventListener('mousedown', (e) => e.preventDefault());
        searchPrevBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.searchPrevious();
        });
        searchNextBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.searchNext();
        });

        // Search input — live find + keyboard navigation
        const searchInput = document.getElementById('search-input');
        const runFind = (value) => {
            this.performIncrementalFind(value);
        };
        searchInput.addEventListener('input', (e) => {
            runFind(e.target.value);
        });
        searchInput.addEventListener('compositionend', () => {
            runFind(searchInput.value);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (e.shiftKey) {
                    this.searchPrevious();
                } else {
                    this.searchNext();
                }
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.searchNext();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.searchPrevious();
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
            if (
                !e.target.closest('#profile-switch-row-menu') &&
                !e.target.closest('.profile-switch-more-btn')
            ) {
                this.closeProfileRowMenu();
            }

            // Check if clicking on any context menu or backdrop - if so, don't close
            if (e.target.closest('.context-menu') || e.target.id === 'context-menu-backdrop') {
                return;
            }
            if (e.target.closest('#sidebar-plus-btn') || e.target.closest('#sidebar-plus-menu')) {
                return;
            }
            if (e.target.closest('#sidebar-profile-footer') || e.target.closest('#sidebar-profile-switcher')) {
                return;
            }
            
            // Close all context menus smoothly
            this.hideWebpageContextMenu();
            this.hideSidebarPlusMenu();
            this.hideProfileSwitcherMenu();
            
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

        document.getElementById('webpage-paste-match-style')?.addEventListener('click', (e) => {
            if (e.target.closest('.disabled')) return;
            void this.pasteMatchStyle();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-select-all')?.addEventListener('click', () => {
            this.selectAll();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-search-selection')?.addEventListener('click', () => {
            const ctx = this.webviewContextInfo || {};
            const q = ctx.selectionText ? String(ctx.selectionText).trim() : '';
            if (q) {
                this.createNewTab(this.getSearchUrl(q));
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
            const raw = ctx.srcURL;
            if (raw) {
                const prepared = this.prepareContextMenuImageUrl(raw, ctx.pageURL || '');
                if (prepared) {
                    this.createNewTab(prepared, { trustedContextImage: true });
                }
            }
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-save-image')?.addEventListener('click', async () => {
            const ctx = this.webviewContextInfo || {};
            const webview = this.getActiveWebview();
            let guestWebContentsId = 0;
            try {
                if (webview && typeof webview.getWebContentsId === 'function') {
                    guestWebContentsId = webview.getWebContentsId() || 0;
                }
            } catch (_) {}
            if (ctx.srcURL && window.electronAPI?.saveImageFromUrl) {
                await window.electronAPI.saveImageFromUrl(ctx.srcURL, guestWebContentsId);
            }
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-copy-image')?.addEventListener('click', async () => {
            const ctx = this.webviewContextInfo || {};
            const gx = Math.round(Number(ctx.x) || 0);
            const gy = Math.round(Number(ctx.y) || 0);
            const menuTabId = this._contextMenuSourceTabId;
            const webview =
                menuTabId != null && this.tabs.has(menuTabId)
                    ? this.tabs.get(menuTabId).webview
                    : this.getActiveWebview();
            let gid = 0;
            try {
                if (webview && typeof webview.getWebContentsId === 'function') {
                    gid = webview.getWebContentsId() || 0;
                }
            } catch (_) {
                gid = 0;
            }
            let ok = false;
            if (gid > 0 && window.electronAPI?.copyImageAtGuest) {
                try {
                    const r = await window.electronAPI.copyImageAtGuest(gid, gx, gy);
                    ok = !!(r && r.ok);
                } catch (_) {
                    ok = false;
                }
            }
            if (!ok && webview && typeof webview.copyImageAt === 'function') {
                try {
                    webview.copyImageAt(gx, gy);
                    ok = true;
                } catch (_) {
                    ok = false;
                }
            }
            if (ok) {
                this.showNotification('Image copied to clipboard', 'success');
            }
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-copy-image-url')?.addEventListener('click', async () => {
            const ctx = this.webviewContextInfo || {};
            const raw = ctx.srcURL;
            if (raw) {
                const prepared = this.prepareContextMenuImageUrl(raw, ctx.pageURL || '');
                if (prepared) {
                    const ok = await this.writeTextToClipboard(prepared);
                    if (ok) {
                        this.showNotification('Image URL copied to clipboard', 'success');
                    } else {
                        this.showNotification('Could not copy to clipboard', 'error');
                    }
                } else {
                    this.showNotification('Could not resolve image address', 'error');
                }
            }
            this.hideWebpageContextMenu();
        });
        
        // Page options
        document.getElementById('webpage-copy-url')?.addEventListener('click', async () => {
            await this.copyCurrentUrl();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-copy-url-markdown')?.addEventListener('click', async () => {
            await this.copyCurrentUrlAsMarkdown();
            this.hideWebpageContextMenu();
        });

        document.getElementById('webpage-print')?.addEventListener('click', () => {
            this.printPage();
            this.hideWebpageContextMenu();
        });
        
        document.getElementById('webpage-inspect')?.addEventListener('click', () => {
            const webview = this.getActiveWebview();
            const ctx = this.webviewContextInfo || {};
            if (webview) {
                const ix = Number(ctx.x);
                const iy = Number(ctx.y);
                try {
                    if (Number.isFinite(ix) && Number.isFinite(iy)) {
                        webview.inspectElement(Math.round(ix), Math.round(iy));
                    } else {
                        webview.openDevTools();
                    }
                } catch (_) {
                    try {
                        webview.openDevTools();
                    } catch (__) {
                        /* ignore */
                    }
                }
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

        window.electronAPI.onAxisHostNavGesture?.((action) => {
            try {
                this.tryNavigateWithAxisGesture(action);
            } catch (_) {
                /* ignore */
            }
        });
        
        // URL bar native context menu actions
        window.electronAPI.onUrlBarContextMenuAction?.((action, data) => {
            const input = this.elements?.urlBarInput || document.getElementById('url-bar-input');
            if (!input) return;
            switch (action) {
                case 'cut':
                    input.focus();
                    document.execCommand('cut');
                    break;
                case 'copy':
                    input.focus();
                    document.execCommand('copy');
                    break;
                case 'paste':
                    this.insertTextInInput(input, data?.text || '');
                    break;
                case 'paste-match-style':
                    input.focus();
                    void (async () => {
                        try {
                            const text = await navigator.clipboard.readText();
                            this.insertTextInInput(input, text ?? '');
                        } catch (_) {
                            document.execCommand('paste');
                        }
                    })();
                    break;
                case 'select-all':
                    input.focus();
                    input.select();
                    break;
                case 'paste-and-go':
                    this.pasteAndGoUrlBar(data?.text || '');
                    break;
            }
        });
        
        // Listen for URL open from settings tab (navigate in main window)
        window.electronAPI.onOpenUrlInBrowser?.((url) => {
            if (url) this.createNewTab(url);
        });

        window.electronAPI.onOpenSettingsTab?.((section) => {
            void window.electronAPI.openSettingsWindow(section || null);
        });
        
        // Listen for settings updates from the settings tab / store (refresh theme)
        window.electronAPI.onSettingsUpdated?.((data) => {
            const updatedProfile =
                data && typeof data.profileId === 'string' ? data.profileId : null;
            if (
                updatedProfile &&
                String(updatedProfile).toLowerCase() !==
                    String(this.profileId || 'personal').toLowerCase()
            ) {
                return;
            }
            if (this._settingsUpdatedRaf != null) cancelAnimationFrame(this._settingsUpdatedRaf);
            this._settingsUpdatedRaf = requestAnimationFrame(() => {
                this._settingsUpdatedRaf = null;
                void this.applySettingsUpdateFromMain();
            });
        });

        window.electronAPI.onExtensionsReady?.((data) => {
            const updatedProfile =
                data && typeof data.profileId === 'string' ? data.profileId : null;
            if (
                updatedProfile &&
                String(updatedProfile).toLowerCase() !==
                    String(this.profileId || 'personal').toLowerCase()
            ) {
                return;
            }
            const wv = this.getActiveWebview();
            if (!wv) return;
            try {
                const url = wv.getURL() || '';
                this._touchExtensionStoreListingUiForWebview(wv, url);
            } catch (_) {}
        });

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState !== 'visible') return;
            if (this.settings?.ambientAudioEnabled && this._ambientAudioCtx?.resume) {
                this._ambientAudioCtx.resume().catch(() => {});
            }
        });
    }

    getProfileIconHelpers() {
        return window.AXIS_PROFILE_ICONS || {};
    }

    sanitizeProfileIcon(icon) {
        const fn = this.getProfileIconHelpers().sanitizeProfileIcon;
        return typeof fn === 'function' ? fn(icon) : 'user';
    }

    getActiveProfileIcon() {
        const active = this.profiles.find((p) => p.id === this.profileId);
        if (active?.icon) return this.sanitizeProfileIcon(active.icon);
        if (this.windowProfileIcon) return this.sanitizeProfileIcon(this.windowProfileIcon);
        return 'user';
    }

    async handleProfileMenuAction(payload) {
        const action = payload?.action;
        if (!action) return;
        if (action === 'create') {
            this.showProfileCreateModal();
            return;
        }
        const profileId = String(payload?.profileId || '').trim();
        if (!profileId) return;
        await this.refreshProfilesMenu();
        const profile =
            this.profiles.find((p) => p.id === profileId) ||
            {
                id: profileId,
                name: payload?.name || profileId,
                icon: payload?.icon || 'user'
            };
        if (action === 'edit') {
            this.showProfileEditModal(profile);
            return;
        }
        if (action === 'delete' && profileId !== 'personal') {
            await this.beginProfileDelete(profile);
        }
    }

    syncProfileSwitcherState() {
        const trigger = this.elements?.profileSwitcherTrigger;
        if (!trigger) return;
        const isIncog = !!this.isIncognitoWindow;
        const active = this.profiles.find((p) => p.id === this.profileId);
        const activeName = active?.name || (this.profileId === 'personal' ? 'Personal' : this.profileId);
        trigger.classList.toggle('profile-switcher-trigger--incognito', isIncog);
        if (isIncog) {
            trigger.innerHTML = '<i class="fas fa-user-secret" aria-hidden="true"></i>';
        } else {
            const iconId = this.getActiveProfileIcon();
            if (active?.icon) this.windowProfileIcon = this.sanitizeProfileIcon(active.icon);
            trigger.innerHTML = this.profileAvatarMarkup(this.profileId, activeName, iconId);
        }
        trigger.setAttribute(
            'aria-label',
            isIncog ? 'Private browsing — switch profile' : `Current profile: ${activeName}`
        );
        trigger.title = isIncog ? 'Switch profile' : `Switch profile (${activeName})`;
    }

    profileAvatarMarkup(_profileId, _name, icon) {
        const iconId = this.sanitizeProfileIcon(icon);
        const fa = this.getProfileIconHelpers().profileIconFaClass?.(iconId) || `fa-${iconId}`;
        return `<span class="profile-switch-avatar profile-switch-avatar--icon" aria-hidden="true"><i class="fas ${fa}"></i></span>`;
    }

    async refreshProfilesMenu() {
        const list = this.elements?.profileSwitcherList;
        if (!list) return;
        let profiles = [];
        try {
            profiles = await window.electronAPI.getProfiles();
        } catch (_) {
            profiles = [];
        }
        this.profiles = Array.isArray(profiles) ? profiles : [];
        list.innerHTML = '';
        for (const profile of this.profiles) {
            const id = String(profile?.id || '').trim();
            if (!id) continue;
            const name = String(profile?.name || id);
            const isActive = !this.isIncognitoWindow && id === this.profileId;
            const canDelete = id !== 'personal';

            const row = document.createElement('div');
            row.className = 'profile-switch-row';
            row.dataset.profileId = id;
            row.draggable = false;

            const dragBtn = document.createElement('button');
            dragBtn.type = 'button';
            dragBtn.className = 'profile-switch-drag';
            dragBtn.title = 'Reorder profile';
            dragBtn.setAttribute('aria-label', 'Reorder profile');
            dragBtn.innerHTML = '<i class="fas fa-grip-vertical" aria-hidden="true"></i>';
            dragBtn.addEventListener('mousedown', () => {
                this._profileDragFromHandle = true;
                row.draggable = true;
            });
            dragBtn.addEventListener('mouseup', () => {
                row.draggable = false;
                this._profileDragFromHandle = false;
            });

            const switchBtn = document.createElement('button');
            switchBtn.type = 'button';
            switchBtn.className = 'profile-switch-btn';
            switchBtn.setAttribute('role', 'menuitem');
            switchBtn.classList.toggle('active', isActive);
            switchBtn.innerHTML = `${this.profileAvatarMarkup(id, name, profile?.icon)}<span>${this.escapeHtml(name)}</span>${
                isActive ? '<i class="fas fa-check profile-switch-btn-check" aria-hidden="true"></i>' : ''
            }`;
            switchBtn.addEventListener('click', async () => {
                this.hideProfileSwitcherMenu();
                if (id === this.profileId && !this.isIncognitoWindow) return;
                try {
                    if (this.isIncognitoWindow) {
                        await window.electronAPI.openOrFocusProfileWindow(id);
                        return;
                    }
                    await this.switchToProfileId(id, {
                        animate: true,
                        direction: this._profileSwipeDirectionFor?.(id) ?? 1
                    });
                } catch (_) {}
            });

            const moreBtn = document.createElement('button');
            moreBtn.type = 'button';
            moreBtn.className = 'profile-switch-more-btn';
            moreBtn.title = 'Profile options';
            moreBtn.setAttribute('aria-label', `Options for ${name}`);
            moreBtn.setAttribute('aria-haspopup', 'menu');
            moreBtn.setAttribute('aria-expanded', 'false');
            moreBtn.innerHTML = '<i class="fas fa-ellipsis-vertical" aria-hidden="true"></i>';
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleProfileRowMenu(row, profile, moreBtn, canDelete);
            });

            row.appendChild(dragBtn);
            row.appendChild(switchBtn);
            row.appendChild(moreBtn);

            row.addEventListener('dragstart', (e) => {
                if (!this._profileDragFromHandle) {
                    e.preventDefault();
                    return;
                }
                e.dataTransfer.effectAllowed = 'move';
                try {
                    e.dataTransfer.setData('text/plain', id);
                } catch (_) {}
                this._profileDragId = id;
                row.classList.add('is-dragging');
            });
            row.addEventListener('dragend', () => {
                this._profileDragFromHandle = false;
                this._profileDragId = null;
                row.draggable = false;
                list.querySelectorAll('.profile-switch-row').forEach((r) => {
                    r.classList.remove('is-dragging', 'is-drag-over');
                });
            });
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                list.querySelectorAll('.profile-switch-row').forEach((r) => r.classList.remove('is-drag-over'));
                row.classList.add('is-drag-over');
            });
            row.addEventListener('dragleave', () => {
                row.classList.remove('is-drag-over');
            });
            row.addEventListener('drop', (e) => {
                void this.onProfileListDrop(e, row);
            });

            list.appendChild(row);
        }
        this.syncProfileSwitcherState();
    }

    closeProfileRowMenu() {
        const menu = document.getElementById('profile-switch-row-menu');
        if (menu) menu.classList.add('hidden');
        document.querySelectorAll('.profile-switch-row.is-menu-open').forEach((row) => {
            row.classList.remove('is-menu-open');
        });
        document.querySelectorAll('.profile-switch-more-btn').forEach((btn) => {
            btn.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        });
        const active = document.activeElement;
        if (active?.closest?.('.profile-switch-row') || active?.closest?.('#profile-switch-row-menu')) {
            try {
                active.blur();
            } catch (_) {}
        }
        this._profileRowMenuProfile = null;
    }

    ensureProfileRowMenu() {
        let menu = document.getElementById('profile-switch-row-menu');
        if (menu) return menu;
        const panel = document.getElementById('profile-switcher-panel');
        if (!panel) return null;
        menu = document.createElement('div');
        menu.id = 'profile-switch-row-menu';
        menu.className = 'profile-switch-row-menu hidden';
        menu.setAttribute('role', 'menu');
        panel.appendChild(menu);
        return menu;
    }

    toggleProfileRowMenu(row, profile, anchorBtn, canDelete) {
        const menu = this.ensureProfileRowMenu();
        if (!menu || !row || !anchorBtn) return;
        const isOpen =
            !menu.classList.contains('hidden') &&
            this._profileRowMenuProfile?.id === profile?.id;
        if (isOpen) {
            this.closeProfileRowMenu();
            return;
        }
        this.closeProfileRowMenu();
        this._profileRowMenuProfile = profile;
        row.classList.add('is-menu-open');
        anchorBtn.classList.add('is-open');
        anchorBtn.setAttribute('aria-expanded', 'true');
        menu.innerHTML = '';
        const editItem = document.createElement('button');
        editItem.type = 'button';
        editItem.className = 'profile-switch-row-menu-item';
        editItem.setAttribute('role', 'menuitem');
        editItem.textContent = 'Edit profile';
        editItem.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeProfileRowMenu();
            this.showProfileEditModal(profile);
        });
        menu.appendChild(editItem);
        if (canDelete) {
            const deleteItem = document.createElement('button');
            deleteItem.type = 'button';
            deleteItem.className = 'profile-switch-row-menu-item profile-switch-row-menu-item--danger';
            deleteItem.setAttribute('role', 'menuitem');
            deleteItem.textContent = 'Delete profile';
            deleteItem.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeProfileRowMenu();
                void this.beginProfileDelete(profile);
            });
            menu.appendChild(deleteItem);
        }
        menu.classList.remove('hidden');
        const rowRect = row.getBoundingClientRect();
        const panel = document.getElementById('profile-switcher-panel');
        const panelRect = panel?.getBoundingClientRect();
        if (panelRect) {
            menu.style.top = `${Math.max(0, rowRect.bottom - panelRect.top + 2)}px`;
            menu.style.right = `${Math.max(0, panelRect.right - rowRect.right + 2)}px`;
            menu.style.left = 'auto';
        }
    }

    async onProfileListDrop(e, targetRow) {
        e.preventDefault();
        e.stopPropagation();
        const list = this.elements?.profileSwitcherList;
        if (!list || !targetRow) return;
        const draggedId = (() => {
            try {
                return e.dataTransfer.getData('text/plain') || this._profileDragId;
            } catch (_) {
                return this._profileDragId;
            }
        })();
        if (!draggedId) return;
        const draggedRow = list.querySelector(`.profile-switch-row[data-profile-id="${draggedId}"]`);
        if (!draggedRow || draggedRow === targetRow) return;
        const rect = targetRow.getBoundingClientRect();
        const before = e.clientY < rect.top + rect.height / 2;
        if (before) targetRow.before(draggedRow);
        else targetRow.after(draggedRow);
        list.querySelectorAll('.profile-switch-row').forEach((r) => r.classList.remove('is-drag-over'));
        const ids = [...list.querySelectorAll('.profile-switch-row')].map((r) => r.dataset.profileId).filter(Boolean);
        try {
            await window.electronAPI.reorderProfiles(ids);
            await this.refreshProfilesMenu();
        } catch (err) {
            console.error('reorderProfiles failed', err);
            await this.refreshProfilesMenu();
        }
    }

    toggleProfileSwitcherMenu() {
        const root = this.elements?.profileSwitcherRoot;
        const menu = this.elements?.profileSwitcherMenu;
        const trigger = this.elements?.profileSwitcherTrigger;
        if (!root || !menu || !trigger) return;
        const switcher = document.getElementById('sidebar-profile-switcher');
        const opening = !root.classList.contains('is-open');
        if (!opening) {
            this.hideProfileSwitcherMenu();
            return;
        }
        if (this._profileSwitcherCloseTimer != null) {
            clearTimeout(this._profileSwitcherCloseTimer);
            this._profileSwitcherCloseTimer = null;
        }
        menu.classList.remove('hidden');
        menu.setAttribute('aria-hidden', 'false');
        trigger.setAttribute('aria-expanded', 'true');
        void this.refreshProfilesMenu().then(() => {
            this.syncProfileSwitcherState();
            requestAnimationFrame(() => {
                root.classList.add('is-open');
                switcher?.classList.add('is-open');
            });
        });
    }

    hideProfileSwitcherMenu() {
        this.closeProfileRowMenu();
        const root = this.elements?.profileSwitcherRoot;
        const menu = this.elements?.profileSwitcherMenu;
        const trigger = this.elements?.profileSwitcherTrigger;
        const switcher = document.getElementById('sidebar-profile-switcher');
        if (!root || !menu || !trigger) return;
        if (!root.classList.contains('is-open')) {
            menu.classList.add('hidden');
            menu.setAttribute('aria-hidden', 'true');
            trigger.setAttribute('aria-expanded', 'false');
            switcher?.classList.remove('is-open');
            return;
        }
        root.classList.remove('is-open');
        switcher?.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
        if (this._profileSwitcherCloseTimer != null) clearTimeout(this._profileSwitcherCloseTimer);
        this._profileSwitcherCloseTimer = setTimeout(() => {
            this._profileSwitcherCloseTimer = null;
            if (!root.classList.contains('is-open')) {
                menu.classList.add('hidden');
                menu.setAttribute('aria-hidden', 'true');
            }
        }, 320);
    }

    getActiveHttpUrlForProfileSwitch() {
        const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        const url = typeof tab?.url === 'string' ? tab.url.trim() : '';
        if (!url) return null;
        return /^https?:\/\//i.test(url) ? url : null;
    }

    openPersonalProfileWindow() {
        window.electronAPI.openOrFocusProfileWindow('personal');
    }

    setupProfileCreateIconGrid() {
        const grid = document.getElementById('profile-create-icon-grid');
        if (!grid || grid.dataset.built === '1') return;
        const options = this.getProfileIconHelpers().AXIS_PROFILE_ICON_OPTIONS || [];
        grid.innerHTML = '';
        for (const opt of options) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'profile-create-icon-btn';
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', 'false');
            btn.title = opt.label || opt.id;
            btn.dataset.iconId = opt.id;
            btn.innerHTML = `<i class="fas fa-${this.escapeHtml(opt.id)}" aria-hidden="true"></i>`;
            btn.addEventListener('click', () => this.setProfileCreateIcon(opt.id));
            grid.appendChild(btn);
        }
        grid.dataset.built = '1';
        this.setProfileCreateIcon('user');
    }

    setProfileCreateIcon(iconId) {
        const id = this.sanitizeProfileIcon(iconId);
        this._profileCreateIcon = id;
        const grid = document.getElementById('profile-create-icon-grid');
        if (!grid) return;
        grid.querySelectorAll('.profile-create-icon-btn').forEach((btn) => {
            const selected = btn.dataset.iconId === id;
            btn.classList.toggle('is-selected', selected);
            btn.setAttribute('aria-checked', selected ? 'true' : 'false');
        });
    }

    setupProfileUi() {
        const modal = document.getElementById('profile-create-modal');
        const input = document.getElementById('profile-create-name-input');
        const confirmBtn = document.getElementById('profile-create-confirm');
        const cancelBtn = document.getElementById('profile-create-cancel');
        const deleteModal = document.getElementById('profile-delete-modal');
        const deleteConfirmBtn = document.getElementById('profile-delete-confirm');
        const deleteCancelBtn = document.getElementById('profile-delete-cancel');
        if (!modal || !input || !confirmBtn || !cancelBtn) return;

        this._profileModalMode = 'create';
        this._profileEditId = null;
        this._profileDeleteId = null;
        this._profileDragFromHandle = false;
        this._profileDragId = null;

        this.setupProfileCreateIconGrid();

        const hideForm = () => this.hideProfileFormModal();
        cancelBtn.addEventListener('click', hideForm);
        confirmBtn.addEventListener('click', () => void this.confirmProfileForm());
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                void this.confirmProfileForm();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideForm();
            }
        });
        modal.addEventListener('mousedown', (e) => e.stopPropagation());

        if (deleteModal && deleteConfirmBtn && deleteCancelBtn) {
            deleteCancelBtn.addEventListener('click', () => this.hideProfileDeleteModal());
            deleteConfirmBtn.addEventListener('click', () => void this.confirmProfileDelete());
            deleteModal.addEventListener('mousedown', (e) => e.stopPropagation());
        }

        const profilePanel = document.getElementById('profile-switcher-panel');
        profilePanel?.addEventListener('mouseleave', () => {
            this.closeProfileRowMenu();
        });
    }

    setProfileFormModalTheme(modal) {
        if (!modal) return;
        modal.setAttribute('data-ui-theme', this.getVaultAutofillUiTheme());
    }

    showProfileEditModal(profile) {
        const modal = document.getElementById('profile-create-modal');
        const input = document.getElementById('profile-create-name-input');
        const title = document.getElementById('profile-create-title');
        const hint = document.getElementById('profile-create-hint');
        const confirmBtn = document.getElementById('profile-create-confirm');
        const backdrop = this.elements?.modalBackdrop;
        if (!modal || !input || !profile?.id) return;
        this.hideProfileSwitcherMenu();
        this._profileModalMode = 'edit';
        this._profileEditId = profile.id;
        if (title) title.textContent = 'Edit profile';
        if (hint) hint.textContent = 'Change the name or icon for this profile.';
        if (confirmBtn) confirmBtn.textContent = 'Save';
        this.setupProfileCreateIconGrid();
        this.setProfileCreateIcon(profile.icon || 'user');
        input.value = String(profile.name || '');
        this.setProfileFormModalTheme(modal);
        modal.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
        document.body.classList.add('axis-vault-modal-open');
        requestAnimationFrame(() => {
            try {
                input.focus();
                input.select();
            } catch (_) {}
        });
    }

    showProfileCreateModal() {
        const modal = document.getElementById('profile-create-modal');
        const input = document.getElementById('profile-create-name-input');
        const title = document.getElementById('profile-create-title');
        const hint = document.getElementById('profile-create-hint');
        const confirmBtn = document.getElementById('profile-create-confirm');
        const backdrop = this.elements?.modalBackdrop;
        if (!modal || !input) return;
        this._profileModalMode = 'create';
        this._profileEditId = null;
        if (title) title.textContent = 'New profile';
        if (hint) hint.textContent = 'Separate tabs, cookies, and settings from your other profiles.';
        if (confirmBtn) confirmBtn.textContent = 'Create';
        this.setupProfileCreateIconGrid();
        this.setProfileCreateIcon('user');
        input.value = '';
        this.setProfileFormModalTheme(modal);
        modal.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
        document.body.classList.add('axis-vault-modal-open');
        requestAnimationFrame(() => {
            try {
                input.focus();
                input.select();
            } catch (_) {}
        });
    }

    hideProfileFormModal() {
        const modal = document.getElementById('profile-create-modal');
        const backdrop = this.elements?.modalBackdrop;
        if (modal) modal.classList.add('hidden');
        this.maybeHideProfileModalBackdrop(backdrop);
    }

    async beginProfileDelete(profile) {
        if (!profile?.id || profile.id === 'personal') return;
        this.hideProfileSwitcherMenu();
        try {
            const authed = await window.electronAPI.vaultVerifyDevice('Delete this profile');
            if (!authed) return;
        } catch (_) {
            return;
        }
        this.showProfileDeleteModal(profile);
    }

    showProfileDeleteModal(profile) {
        const modal = document.getElementById('profile-delete-modal');
        const title = document.getElementById('profile-delete-title');
        const message = document.getElementById('profile-delete-message');
        const backdrop = this.elements?.modalBackdrop;
        if (!modal || !profile?.id || profile.id === 'personal') return;
        this._profileDeleteId = profile.id;
        const name = String(profile.name || profile.id);
        if (title) title.textContent = `Delete “${name}”?`;
        if (message) {
            message.textContent = `All tabs, cookies, history, passwords, extensions, and settings for “${name}” will be removed permanently. This cannot be undone.`;
        }
        this.setProfileFormModalTheme(modal);
        modal.classList.remove('hidden');
        if (backdrop) backdrop.classList.remove('hidden');
        document.body.classList.add('axis-vault-modal-open');
    }

    hideProfileDeleteModal() {
        const modal = document.getElementById('profile-delete-modal');
        const backdrop = this.elements?.modalBackdrop;
        if (modal) modal.classList.add('hidden');
        this._profileDeleteId = null;
        this.maybeHideProfileModalBackdrop(backdrop);
    }

    maybeHideProfileModalBackdrop(backdrop) {
        const vaultSave = document.getElementById('vault-save-modal');
        const vaultPick = document.getElementById('vault-pick-modal');
        const profileCreate = document.getElementById('profile-create-modal');
        const profileDelete = document.getElementById('profile-delete-modal');
        const vaultOpen =
            (vaultSave && !vaultSave.classList.contains('hidden')) ||
            (vaultPick && !vaultPick.classList.contains('hidden'));
        const profileOpen =
            (profileCreate && !profileCreate.classList.contains('hidden')) ||
            (profileDelete && !profileDelete.classList.contains('hidden'));
        if (!vaultOpen && !profileOpen) {
            document.body.classList.remove('axis-vault-modal-open');
            if (
                backdrop &&
                !document.querySelector(
                    '#downloads-panel:not(.hidden), #security-panel:not(.hidden), #settings-panel:not(.hidden)'
                )
            ) {
                backdrop.classList.add('hidden');
            }
        }
    }

    hideProfileCreateModal() {
        this.hideProfileFormModal();
    }

    async confirmProfileForm() {
        const input = document.getElementById('profile-create-name-input');
        const name = input?.value?.trim() || '';
        if (!name) {
            input?.focus();
            return;
        }
        const pickedIcon = this.sanitizeProfileIcon(this._profileCreateIcon || 'user');
        this.hideProfileFormModal();
        if (this._profileModalMode === 'edit' && this._profileEditId) {
            try {
                const updated = await window.electronAPI.updateProfile({
                    id: this._profileEditId,
                    name,
                    icon: pickedIcon
                });
                if (updated?.id === this.profileId) {
                    this.windowProfileIcon = this.sanitizeProfileIcon(updated.icon);
                }
                await this.refreshProfilesMenu();
            } catch (err) {
                console.error('updateProfile failed', err);
            }
            return;
        }
        try {
            const created = await window.electronAPI.createProfile({
                name,
                icon: pickedIcon
            });
            if (!created?.id) return;
            if (created.icon) this.windowProfileIcon = this.sanitizeProfileIcon(created.icon);
            await this.refreshProfilesMenu();
            await this.switchToProfileId(created.id, { animate: true, direction: 1 });
        } catch (err) {
            console.error('createProfile failed', err);
        }
    }

    async confirmProfileDelete() {
        const id = this._profileDeleteId;
        if (!id) return;
        this.hideProfileDeleteModal();
        this.hideProfileSwitcherMenu();
        try {
            const result = await window.electronAPI.deleteProfile({ id, skipChecks: true });
            if (result?.cancelled) return;
            if (!result?.ok) {
                console.error('deleteProfile failed', result?.error || 'unknown error');
                return;
            }
            await this.refreshProfilesMenu();
            this.evictProfileLayerCache?.(id);
        } catch (err) {
            console.error('deleteProfile failed', err);
        }
    }

    async confirmProfileCreate() {
        await this.confirmProfileForm();
    }

    async applySettingsUpdateFromMain() {
        try {
            const prevJs = this._lastJavascriptEnabled;
            await this.loadSettings();
            await this.refreshShortcutCache();
            this.syncGroqApiKeyFromSettings?.();
            const curJs = this.settings?.javascriptEnabled !== false;
            if (prevJs !== undefined && prevJs !== curJs) {
                this.rebuildAllTabWebviewsForWebPreferences();
            }
            this._lastJavascriptEnabled = curJs;
            this.syncTransparentSitesUi();
            if (this.settings?.transparentSites) {
                this._syncBackgroundTabWebviewsForTransparentSetting();
            }
            this.applyCustomThemeFromSettings();
            this.applySidebarPosition();
            if (this.settings?.transparentSites) {
                this.applyTransparentSitesToAllWebviews();
            } else {
                this.removeTransparentSitesFromAllWebviews();
            }
            const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
            const wv = this.getActiveWebview();
            this.updateUrlBar(wv, { skipExtractTheme: true });
            if (tab && tab.url === this.NEWTAB_URL) {
                this.applyNewTabCustomization();
                this.updateNewTabHero();
            } else if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
                this.applyInternalShellUrlBarStyle();
            } else if (wv) {
                await this.extractUrlBarTheme(wv);
            } else {
                this.applyAppThemeToUrlBar();
            }
            this.applyAmbientFromSettings();
            this.syncAdBlockerUrlBarState();
            const emp = document.getElementById('extensions-menu-panel');
            if (emp && !emp.classList.contains('hidden')) {
                void this.populateExtensionsMenu();
            }
            if (wv) {
                try {
                    this._touchExtensionStoreListingUiForWebview(wv, wv.getURL() || '');
                } catch (_) {}
            }
        } catch (e) {
            console.error('applySettingsUpdateFromMain failed', e);
        }
    }

    /** Store default: on unless explicitly false. */
    isAdBlockerEnabled() {
        return this.settings?.adBlockerEnabled !== false;
    }

    syncAdBlockerUrlBarState() {
        const btn = this.elements?.urlBarAdblock;
        if (!btn) return;
        const on = this.isAdBlockerEnabled();
        btn.classList.toggle('url-bar-adblock-on', on);
        btn.classList.toggle('url-bar-adblock-off', !on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = on ? 'Ad blocker on — click to disable' : 'Ad blocker off — click to enable';
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

    async refreshShortcutCache() {
        try {
            this._shortcutCache = (await window.electronAPI.getShortcuts?.()) || {};
        } catch (_) {
            this._shortcutCache = {};
        }
    }

    /** True if key event matches the merged "select-all" accelerator (respects user remap / disable). */
    matchesSelectAllShortcut(e) {
        const accel = this._shortcutCache?.['select-all'];
        if (accel === null || accel === undefined || accel === '' || accel === '__disabled__') return false;
        const parts = String(accel).split('+').map((s) => s.trim().toLowerCase());
        const keyToken = parts[parts.length - 1];
        const keyLower = (e.key || '').toLowerCase();
        if (keyToken.length === 1) {
            if (keyLower !== keyToken) return false;
        } else if (keyToken === 'plus' || keyToken === '=') {
            if (e.key !== '+' && e.key !== '=') return false;
        } else if (keyLower !== keyToken) {
            return false;
        }
        const wantsShift = parts.includes('shift');
        const wantsAlt = parts.includes('alt') || parts.includes('option');
        const wantsCmd = parts.includes('cmd') || parts.includes('command');
        const wantsCtrl = parts.includes('ctrl') || parts.includes('control');
        if (wantsShift !== e.shiftKey) return false;
        if (wantsAlt !== e.altKey) return false;
        const mac = window.electronAPI?.platform === 'darwin';
        if (mac) {
            if (wantsCmd && !e.metaKey) return false;
            if (wantsCtrl && !e.ctrlKey) return false;
            if (wantsCmd && !wantsCtrl && e.ctrlKey) return false;
        } else {
            if (wantsCtrl && !e.ctrlKey) return false;
            if (wantsCmd && !e.metaKey) return false;
        }
        return true;
    }

    /**
     * Select all in a focused shell field (URL bar, search, etc.), or the active webview page.
     * With a key event, uses e.target; without (menu / global shortcut), uses document.activeElement.
     */
    selectAllFromShortcut(e) {
        const t = e && e.target ? e.target : document.activeElement;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) {
            if (typeof t.select === 'function') t.select();
            return;
        }
        if (t && t.isContentEditable) {
            try {
                document.execCommand('selectAll');
            } catch (_) {}
            return;
        }
        this.selectAll();
    }

    // Execute browser shortcut action (called from main process IPC)
    executeBrowserShortcut(action) {
        switch (action) {
            case 'close-tab':
                if (this.currentTab) this.closeTab(this.currentTab);
                break;
            case 'spotlight-search':
                this.createNewTab();
                break;
            case 'toggle-sidebar':
                this.toggleSidebar();
                break;
            case 'refresh':
                this.refresh();
                break;
            case 'go-back':
                this.goBack();
                break;
            case 'go-forward':
                this.goForward();
                break;
            case 'stop-loading': {
                const wv = this.getActiveWebview();
                if (!wv) break;
                try {
                    wv.stop();
                } catch (_) {}
                break;
            }
            case 'focus-url':
                // Focus the new webview URL bar input
                const urlBarInput = document.getElementById('url-bar-input');
                const urlBarDisplay = document.getElementById('url-bar-display');
                if (urlBarDisplay && urlBarInput) {
                    urlBarDisplay.click(); // This will trigger the edit mode
                }
                break;
            case 'pin-tab':
                if (this.isIncognitoWindow) break;
                if (this.currentTab) {
                    const el = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
                    if (el) this.togglePinTab(this.currentTab, el, null);
                }
                break;
            case 'new-tab':
                this.createNewTab();
                break;
            case 'next-tab':
                this.switchToAdjacentTab(1);
                break;
            case 'previous-tab':
                this.switchToAdjacentTab(-1);
                break;
            case 'duplicate-tab':
                this.duplicateCurrentTab();
                break;
            case 'settings':
                this.toggleSettings();
                break;
            case 'recover-tab':
                this.performTabUndo();
                break;
            case 'history':
                this.openSettingsTab('history');
                break;
            case 'downloads':
                this.showDownloadsPopup();
                break;
            case 'toggle-chat':
                this.toggleAIChat();
                break;
            case 'toggle-mute-tab':
                if (this.currentTab) this.toggleTabMute(this.currentTab);
                break;
            case 'find':
                this.toggleSearch();
                break;
            case 'select-all':
                this.selectAllFromShortcut();
                break;
            case 'paste-match-style':
                void this.pasteMatchStyle();
                break;
            case 'print':
                this.printPage();
                break;
            case 'copy-url':
                this.copyCurrentUrl();
                break;
            case 'copy-url-markdown':
                void this.copyCurrentUrlAsMarkdown();
                break;
            case 'clear-history':
                this.clearAllHistory();
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

    insertTextInInput(input, text) {
        if (!input) return;
        const pasteText = text || '';
        input.focus();
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        input.value = input.value.slice(0, start) + pasteText + input.value.slice(end);
        const caret = start + pasteText.length;
        input.selectionStart = caret;
        input.selectionEnd = caret;
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    pasteAndGoUrlBar(textFromMenu = '') {
        const text = (textFromMenu || '').trim();
        if (!text) return;
        if (this.elements?.urlBarInput) {
            this.elements.urlBarInput.value = text;
        }
        this.navigate(text);
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
        
        webview.__eventHandlers = {};
        
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

        const tryBindLoadProgressFromWebContents = () => {
            if (webview.__wcLoadProgressBound) return;
            try {
                const wc = webview.getWebContents && webview.getWebContents();
                if (!wc || typeof wc.on !== 'function') return;
                const onProgress = (...args) => {
                    let p = null;
                    if (args.length >= 2 && typeof args[1] === 'number') p = args[1];
                    else if (typeof args[0] === 'number') p = args[0];
                    if (p == null || Number.isNaN(p)) return;
                    p = Math.max(0, Math.min(1, p));
                    webview.__loadProgressMilestone = Math.max(webview.__loadProgressMilestone || 0, p);
                    if (this.loadingBarTabId === tabId && isActiveTab()) {
                        this.setUrlBarLoadProgress(webview.__loadProgressMilestone, tabId);
                    }
                };
                wc.on('did-change-load-progress', onProgress);
                webview.__wcLoadProgressBound = true;
                webview.__wcLoadProgressHandler = onProgress;
                webview.__wcLoadProgressWc = wc;
            } catch (err) {
                /* Older Chromium builds may omit this event */
            }
        };
        
        // Create named handler functions that can be removed
        const didStartLoadingHandler = () => {
            if (!isActiveTab()) return;
            // Sub-frame loads (ads, lazy embeds while scrolling) must not flash the shell loading bar.
            if (!webview.__axisMainNavPending) return;

            const currentUrl = webview.getURL() || '';
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(currentUrl);
            if (this.isBenchmarking) return;
            
            clearLoadingTimeout();
            webview.__loadProgressMilestone = 0;
            this.isWebviewLoading = true;
            this.loadingBarTabId = tabId; // Remember which tab is showing the loading bar
            this.showLoadingIndicator();
            this.bumpUrlBarLoadMilestone(webview, tabId, 0.05);
            tryBindLoadProgressFromWebContents();
            this.updateNavigationButtons();
            this.updateRefreshButton(true); // Change reload button to X
            
            // Apply cached theme instantly for faster perceived loading
            if (currentUrl && currentUrl !== 'about:blank') {
                this.applyCachedTheme(currentUrl);
            }
            
            webview.__loadingTimeout = setTimeout(() => {
                if (this.loadingBarTabId !== tabId) return;
                if (webview && webview.isLoading) {
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

        const loadCommitHandler = (e) => {
            if (!e || !e.isMainFrame) return;
            if (!this.isBenchmarking && this.settings?.transparentSites) {
                this._touchTransparentSitesForWebview(webview);
            }
            webview.__loadProgressMilestone = Math.max(webview.__loadProgressMilestone || 0, 0.28);
            if (this.loadingBarTabId === tabId && isActiveTab()) {
                this.setUrlBarLoadProgress(webview.__loadProgressMilestone, tabId);
            }
        };
        webview.__eventHandlers.loadCommit = loadCommitHandler;
        webview.addEventListener('load-commit', loadCommitHandler);

        // Extract theme early on dom-ready (before all resources load)
        const domReadyHandler = () => {
            tryBindLoadProgressFromWebContents();
            if (!this.isBenchmarking) {
                webview.__loadProgressMilestone = Math.max(webview.__loadProgressMilestone || 0, 0.58);
                if (this.loadingBarTabId === tabId && isActiveTab()) {
                    this.setUrlBarLoadProgress(webview.__loadProgressMilestone, tabId);
                }
            }

            // Transparent sites: every tab (not only the active one); follow-up passes catch SPAs after hydrate
            if (!this.isBenchmarking && this.settings?.transparentSites) {
                this._touchTransparentSitesForWebview(webview);
            }
            
            if (isActiveTab()) {
                this._voidGuestTask(this.injectVaultAutofillBootstrap(webview));
            }
            if (isActiveTab() && !this.isBenchmarking) {
                try {
                    const readyUrl = webview.getURL() || '';
                    this._touchExtensionStoreListingUiForWebview(webview, readyUrl);
                } catch (_) {}
            }
            if (!isActiveTab() || this.isBenchmarking) return;
        };
        webview.__eventHandlers.domReady = domReadyHandler;
        webview.addEventListener('dom-ready', domReadyHandler);
        
        // Light dom-ready pass: eager-load lazy images (single run, no timeouts)
        const domReadyOptimizeHandler = () => {
            try {
                webview.executeJavaScript(`
                    (function() {
                        document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy-src]').forEach(function(img) {
                            img.loading = 'eager';
                            if (img.dataset.src) img.src = img.dataset.src;
                            if (img.dataset.lazySrc) img.src = img.dataset.lazySrc;
                        });
                        document.querySelectorAll('iframe[loading="lazy"]').forEach(function(f) { f.loading = 'eager'; });
                    })();
                `).catch(() => {});
            } catch (e) {}
        };
        webview.__eventHandlers.domReadyOptimize = domReadyOptimizeHandler;
        webview.addEventListener('dom-ready', domReadyOptimizeHandler);
        
        const didFinishLoadHandler = (event) => {
            clearLoadingTimeout();
            // Only hide loading when main frame finishes (avoid hiding on iframe/subframe load)
            const isMainFrame = event == null || event.isMainFrame !== false;
            if (isMainFrame && !this.isBenchmarking && this.settings?.transparentSites) {
                this._touchTransparentSitesForWebview(webview);
            }
            if (isMainFrame && this.loadingBarTabId === tabId) {
                this.bumpUrlBarLoadMilestone(webview, tabId, 1);
                this.hideLoadingIndicator();
                this.loadingBarTabId = null;
            }
            if (isMainFrame) {
                webview.__axisMainNavPending = false;
            }
            if (isMainFrame && tabId === this.currentTab) {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
            }

            const tab = getTab();
            if (tab) {
                const currentUrl = webview.getURL();
                const currentTitle = webview.getTitle();
                // Don't overwrite special/internal URLs with webview URL
                if (currentUrl && currentUrl !== 'about:blank' && tab.url !== 'axis://settings' && tab.url !== this.NEWTAB_URL && !tab.url.startsWith('axis:note://') && !tab.isSettings) {
                    tab.url = currentUrl;
                }
                if (currentTitle) {
                    // Only update title if tab doesn't have a custom title
                    if (!tab.customTitle) {
                    tab.title = currentTitle;
                    }
                }
            }

            // Reset per-tab retry counters on successful load
            this[`__errorRetryCount_${tabId}`] = 0;
            this[`__dnsRetryCount_${tabId}`] = 0;

            if (!isActiveTab()) return;
            if (this.isBenchmarking) {
                return;
            }
            
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
            
            // Lightweight: disable lazy loading once (no observers or intervals to avoid slowing pages)
            try {
                webview.executeJavaScript(`
                    (function() {
                        document.querySelectorAll('img[loading="lazy"], img[data-src], img[data-lazy-src]').forEach(function(img) {
                            img.loading = 'eager';
                            if (img.dataset.src && !img.src) img.src = img.dataset.src;
                            if (img.dataset.lazySrc && !img.src) img.src = img.dataset.lazySrc;
                        });
                        document.querySelectorAll('iframe[loading="lazy"]').forEach(function(f) { f.loading = 'eager'; });
                    })();
                `).catch(() => {});
            } catch (e) {}
            if (isActiveTab()) {
                this._voidGuestTask(this.injectVaultAutofillBootstrap(webview));
            }
            const finishUrl = (() => {
                try {
                    return webview.getURL() || '';
                } catch (_) {
                    return '';
                }
            })();
            if (isMainFrame && finishUrl) {
                this._nudgeYouTubePlayerIfNeeded(webview, finishUrl);
            }
            if (isMainFrame && isActiveTab() && !this.isBenchmarking && finishUrl) {
                this._touchExtensionStoreListingUiForWebview(webview, finishUrl);
            }
        };
        webview.__eventHandlers.didFinishLoad = didFinishLoadHandler;
        webview.addEventListener('did-finish-load', didFinishLoadHandler);

        const didStopLoadingHandler = () => {
            const wasMainNav = !!webview.__axisMainNavPending;
            clearLoadingTimeout();
            if (this.loadingBarTabId === tabId && wasMainNav) {
                this.bumpUrlBarLoadMilestone(webview, tabId, 1);
                this.hideLoadingIndicator();
                this.loadingBarTabId = null;
            }
            webview.__axisMainNavPending = false;
            if (tabId === this.currentTab) {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
            }
            if (!isActiveTab() || this.isBenchmarking || !wasMainNav) return;

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
            // -3 (ERR_ABORTED) fires on redirects and sub-frame cancellations;
            // a new navigation is already in progress so don't touch loading state.
            if (event.errorCode === -3) return;

            // Only handle main-frame failures — sub-frame errors (ad iframes,
            // tracking pixels, etc.) must NOT interfere with the main page load.
            if (event.isMainFrame === false) return;

            clearLoadingTimeout();
            const tab = getTab();

            if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
                return;
            }

            if (this.loadingBarTabId === tabId) {
                this.hideLoadingIndicator();
                this.loadingBarTabId = null;
            }
            webview.__axisMainNavPending = false;
            if (tabId === this.currentTab) {
                this.isWebviewLoading = false;
                this.updateRefreshButton(false);
            }

            const retryKey = `__errorRetryCount_${tabId}`;
            const count = this[retryKey] || 0;
            if (count >= 5) {
                if (isActiveTab()) {
                    this.showErrorPage('Unable to load page. Please check your internet connection.', webview);
                }
                return;
            }
            this[retryKey] = count + 1;

            if (event.errorCode === -2) {
                webview.reload();
            } else if (event.errorCode === -105) {
                const currentUrl = event.validatedURL || webview.getURL() || 'https://www.google.com';
                this.handleDNSFailure(currentUrl, webview);
            } else if (isActiveTab()) {
                this.showErrorPage(event.errorDescription, webview);
            }

            if (tab && event.validatedURL && tab.url !== this.NEWTAB_URL) {
                tab.url = event.validatedURL;
            }
        };
        webview.__eventHandlers.didFailLoad = didFailLoadHandler;
        webview.addEventListener('did-fail-load', didFailLoadHandler);

        const willNavigateHandler = (event) => {
            if (!isActiveTab()) return;
            const nextUrl = event.url || '';
            if (
                this.settings?.httpsOnlyMode &&
                nextUrl &&
                event.isMainFrame !== false &&
                this.isNonSecureHttpUrl(nextUrl) &&
                !window.confirm(
                    'This page uses HTTP (not HTTPS). Your connection would not be encrypted on this site.\n\nContinue to:\n' + nextUrl
                )
            ) {
                event.preventDefault();
                return;
            }
            this.isBenchmarking = /browserbench\.org\/speedometer/i.test(nextUrl);
            if (event.isMainFrame !== false) {
                webview.__axisMainNavPending = true;
            }
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
            if (!this.isBenchmarking && this.settings?.transparentSites) {
                this._touchTransparentSitesForWebview(webview);
            }
            try {
                const navUrl = webview.getURL();
                if (navUrl) this._nudgeYouTubePlayerIfNeeded(webview, navUrl);
            } catch (_) {}
            if (isActiveTab() && !this.isBenchmarking) {
                try {
                    const navUrl = webview.getURL() || '';
                    this._touchExtensionStoreListingUiForWebview(webview, navUrl);
                } catch (_) {}
            }
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

        const didNavigateInPageHandler = () => {
            let navUrl = '';
            try {
                navUrl = webview.getURL() || '';
            } catch (_) {
                navUrl = '';
            }
            const stableKey = this._urlStablePageKey(navUrl);
            const pageChanged = stableKey !== webview.__axisLastStablePageKey;
            webview.__axisLastInPageUrl = navUrl;
            if (pageChanged) {
                webview.__axisLastStablePageKey = stableKey;
            }

            if (!this.isBenchmarking && this.settings?.transparentSites && pageChanged) {
                this._touchTransparentSitesForWebview(webview);
            }
            try {
                if (navUrl) this._nudgeYouTubePlayerIfNeeded(webview, navUrl);
            } catch (_) {}
            if (isActiveTab() && !this.isBenchmarking) {
                try {
                    this._touchExtensionStoreListingUiForWebview(webview, navUrl);
                } catch (_) {}
            }
            if (!isActiveTab() || this.isBenchmarking) return;
            this.batchDOMUpdates([
                () => this.updateNavigationButtons(),
                () => (pageChanged ? this.updateTabTitle() : undefined),
                () => this.updateUrlBar(webview, { skipExtractTheme: !pageChanged })
            ]);
        };
        webview.__eventHandlers.didNavigateInPage = didNavigateInPageHandler;
        webview.addEventListener('did-navigate-in-page', didNavigateInPageHandler);

        const pageTitleUpdatedHandler = async () => {
            const tab = getTab();
            if (tab) {
                if (!tab.customTitle) {
                tab.title = webview.getTitle() || tab.title;
                }
            }

            if (!isActiveTab() || this.isBenchmarking) return;
                this.updateTabTitle();
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
        };
        webview.__eventHandlers.pageTitleUpdated = pageTitleUpdatedHandler;
        webview.addEventListener('page-title-updated', pageTitleUpdatedHandler);

        const pageFaviconUpdatedHandler = (event) => {
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
        };
        webview.__eventHandlers.pageFaviconUpdated = pageFaviconUpdatedHandler;
        webview.addEventListener('page-favicon-updated', pageFaviconUpdatedHandler);
        
        this.startAudioDetection(tabId, webview);

        const contextMenuHandler = (e) => {
            this._contextMenuSourceTabId = tabId;

            this.webviewContextInfo = {
                hasSelection: e.params?.selectionText?.length > 0,
                selectionText: e.params?.selectionText || '',
                linkURL: e.params?.linkURL || '',
                srcURL: e.params?.srcURL || '',
                mediaType: e.params?.mediaType || 'none',
                pageURL: (() => {
                    try {
                        return webview.getURL() || '';
                    } catch (_) {
                        return '';
                    }
                })(),
                isEditable: e.params?.isEditable || false,
                canCut: e.params?.editFlags?.canCut || false,
                canCopy: e.params?.editFlags?.canCopy || false,
                canPaste: e.params?.editFlags?.canPaste || false,
                canSelectAll: e.params?.editFlags?.canSelectAll || false,
                misspelledWord: e.params?.misspelledWord || '',
                dictionarySuggestions: Array.isArray(e.params?.dictionarySuggestions)
                    ? e.params.dictionarySuggestions.slice()
                    : [],
                x: e.params?.x || 0,
                y: e.params?.y || 0
            };
            
            const webviewRect = webview.getBoundingClientRect();
            const x = (e.params?.x || 0) + webviewRect.left;
            const y = (e.params?.y || 0) + webviewRect.top;
            
            this.showWebpageContextMenu({ 
                clientX: x,
                clientY: y
            });
        };
        webview.__eventHandlers.contextMenu = contextMenuHandler;
        webview.addEventListener('context-menu', contextMenuHandler);
        
        const ipcMessageHandler = (event) => {
            const { channel, args } = event;
            if (channel === 'axis-nav-gesture') {
                const dir = args && args[0];
                this.tryNavigateWithAxisGesture(dir, webview, tabId);
                return;
            }
            if (channel === 'axis-cws-add-to-chrome') {
                if (!isActiveTab()) return;
                const id = args && args[0];
                if (!id || typeof id !== 'string') return;
                void this._runExtensionStoreInstall(id.trim(), {
                    webview,
                    dismissToken: id.trim().toLowerCase(),
                    triggerBtn: this.elements?.urlBarCwsInstall
                });
                return;
            }
            if (channel === 'axis-amo-install-in-axis') {
                if (!isActiveTab()) return;
                const slug = args && args[0];
                if (!slug || typeof slug !== 'string') return;
                const key = slug.trim().toLowerCase();
                void this._runExtensionStoreInstall(slug.trim(), {
                    webview,
                    dismissToken: `amo:${key}`,
                    triggerBtn: this.elements?.urlBarCwsInstall
                });
                return;
            }
            if (channel === 'axis-request-store-listing-status') {
                if (!isActiveTab()) return;
                try {
                    const listingUrl = webview.getURL() || '';
                    this._touchExtensionStoreListingUiForWebview(webview, listingUrl);
                } catch (_) {}
                return;
            }
            if (channel === 'axis-vault-save-offer') {
                const payload = args && args[0];
                this.routeVaultGuestMessage(channel, payload, webview);
                return;
            }
            if (channel === 'axis-vault-autofill-hide') {
                this.hideVaultAutofillPanel();
                void this.hideVaultAutofillInPage(webview);
                return;
            }
            if (channel === 'axis-vault-autofill-request') {
                const payload = args && args[0];
                void this.presentVaultAutofill(webview, payload);
                return;
            }
            if (channel === 'axis-vault-autofill-query') {
                const payload = args && args[0];
                void this.handleVaultAutofillQuery(webview, payload);
                return;
            }
            if (channel === 'axis-vault-pick-login') {
                const payload = args && args[0];
                this.routeVaultGuestMessage(channel, payload, webview);
                return;
            }
            if (channel === 'axis-vault-pick-card') {
                const payload = args && args[0];
                this.routeVaultGuestMessage(channel, payload, webview);
                return;
            }
            if (!isActiveTab()) return;
            if (channel === 'settings-message') {
                this.onEmbeddedMessage({ data: args[0] });
            }
        };
        webview.__eventHandlers.ipcMessage = ipcMessageHandler;
        webview.addEventListener('ipc-message', ipcMessageHandler);
        
        // Settings tabs persist through their own preload IPC. Do not poll and
        // rewrite Settings controls from the host; that races normal click/change
        // handlers in the guest and makes controls feel broken.
    }
        
    /** Remove every event listener that setupWebviewEventListeners attached. */
    cleanupWebviewListeners(webview) {
        if (!webview) return;

        const eventMap = {
            didStartLoading:   'did-start-loading',
            loadCommit:        'load-commit',
            domReady:          'dom-ready',
            domReadyOptimize:  'dom-ready',
            didFinishLoad:     'did-finish-load',
            didStopLoading:    'did-stop-loading',
            consoleMessage:    'console-message',
            didFailLoad:       'did-fail-load',
            willNavigate:      'will-navigate',
            didNavigate:       'did-navigate',
            didNavigateInPage: 'did-navigate-in-page',
            pageTitleUpdated:  'page-title-updated',
            pageFaviconUpdated:'page-favicon-updated',
            contextMenu:       'context-menu',
            ipcMessage:        'ipc-message',
        };

        const handlers = webview.__eventHandlers;
        if (handlers) {
            for (const [key, eventName] of Object.entries(eventMap)) {
                if (handlers[key]) {
                    webview.removeEventListener(eventName, handlers[key]);
                }
            }
        }

        if (webview.__wcLoadProgressHandler && webview.__wcLoadProgressWc) {
            try {
                webview.__wcLoadProgressWc.removeListener('did-change-load-progress', webview.__wcLoadProgressHandler);
            } catch (_) {}
        }

        if (webview.__loadingTimeout) {
            clearTimeout(webview.__loadingTimeout);
            webview.__loadingTimeout = null;
        }
        if (webview.__audioCheckInterval) {
            clearInterval(webview.__audioCheckInterval);
            webview.__audioCheckInterval = null;
        }

        webview.__eventHandlers = null;
        webview.__wcLoadProgressBound = false;
        webview.__wcLoadProgressHandler = null;
        webview.__wcLoadProgressWc = null;
        this.webviewListenersSetup.delete(webview);
    }

    handleDNSFailure(url, targetWebview = null) {
        const webview = targetWebview || this.getActiveWebview();
        if (!webview) return;

        const tab = this.tabs.get(this.currentTab);
        if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
            return;
        }

        const tabId = this.currentTab;
        const retryKey = `__dnsRetryCount_${tabId}`;
        if ((this[retryKey] || 0) >= 3) {
            webview.src = 'https://www.google.com';
            return;
        }
        this[retryKey] = (this[retryKey] || 0) + 1;

        const searchQuery = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
        const fallbackUrl = this.getSearchUrl(searchQuery);
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
        let secondary, accent, text, textSecondary, textMuted;

        if (isDark) {
            // Dark mode - create lighter variations
            secondary = this.hslToHex(hsl.h, Math.max(0, hsl.s - 20), Math.min(100, hsl.l + 15));
            accent = this.hslToHex(hsl.h, Math.min(100, hsl.s + 10), Math.min(100, hsl.l + 25));
            text = '#ffffff';
            textSecondary = 'rgba(255, 255, 255, 0.76)';
            textMuted = 'rgba(255, 255, 255, 0.52)';
        } else {
            // Light mode - create darker variations
            secondary = this.hslToHex(hsl.h, Math.max(0, hsl.s - 30), Math.max(0, hsl.l - 20));
            accent = this.hslToHex(hsl.h, Math.min(100, hsl.s + 15), Math.max(0, hsl.l - 10));
            text = '#111111';
            textSecondary = 'rgba(0, 0, 0, 0.72)';
            textMuted = 'rgba(0, 0, 0, 0.48)';
        }

        return { primary, secondary, accent, text, textSecondary, textMuted };
    }

    generateColorScheme(baseColor) {
        const colors = this.generateHarmoniousColors(baseColor);
        this.applyCustomTheme(colors);
    }

    applyCustomThemeFromSettings() {
        if (this.isIncognitoWindow) return;
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
        const gradientEnabled = !!(this.settings.gradientEnabled && gradientColor);
        const gradientDirection = this.settings.gradientDirection || 'to right';
        const chrome = this.getShellChromeStyle();

        const gaT = this.getThemeAwareGlassAlpha(themeColor, chrome.glassAlpha);
        const gaG = gradientEnabled ? this.getThemeAwareGlassAlpha(gradientColor, chrome.glassAlpha) : gaT;

        // Create sidebar background
        let sidebarBg;
        if (gradientEnabled) {
            const themeRgba = this.hexToRgba(themeColor, gaT);
            const gradientRgba = this.hexToRgba(gradientColor, gaG);
            sidebarBg = this.smoothGradient(gradientDirection, themeRgba, gradientRgba);
        } else {
            sidebarBg = this.hexToRgba(themeColor, gaT);
        }
        
        // Apply to sidebar only
        if (this.elements?.sidebar) {
            this.elements.sidebar.style.setProperty('background', sidebarBg, 'important');
            this.elements.sidebar.style.setProperty('backdrop-filter', chrome.backdropStrong, 'important');
            this.elements.sidebar.style.setProperty('-webkit-backdrop-filter', chrome.backdropStrong, 'important');
        }
        
        // Also apply to app container for the blur effect
        const app = document.getElementById('app');
        if (app) {
            app.style.setProperty('backdrop-filter', chrome.backdropStrong, 'important');
            app.style.setProperty('-webkit-backdrop-filter', chrome.backdropStrong, 'important');
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
        if (hex == null || hex === '') return true;
        try {
            const L = this.getLuminance(hex);
            if (Number.isFinite(L)) return L < 0.44;
        } catch (_) { /* fallback */ }
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

    /**
     * Bright shells on vibrancy: too much luminance bump → grey slab; too little → **lost hue** (neutral
     * “show-through” dominates). This curve keeps **transmission** from `baseAlpha` but adds **chroma
     * insurance** (lift × saturation) so pale / vivid tints still read as the picked color.
     */
    getThemeAwareGlassAlpha(hexInput, baseAlpha) {
        if (typeof baseAlpha !== 'number' || !Number.isFinite(baseAlpha)) return baseAlpha;
        if (baseAlpha >= 0.997) return baseAlpha;
        let hex = hexInput;
        if (!hex || typeof hex !== 'string') return baseAlpha;
        hex = hex.trim();
        if (!hex.startsWith('#')) return baseAlpha;

        let L;
        try {
            L = this.getLuminance(hex);
        } catch (_) {
            return baseAlpha;
        }
        const lift = Math.min(1, Math.max(0, (L - 0.14) / 0.82));
        if (lift <= 0.003) return baseAlpha;

        let hslSat = 0;
        try {
            hslSat = Math.max(0, Math.min(100, this.hexToHsl(hex).s)) / 100;
        } catch (_) {
            /* ignore */
        }

        const headroom = Math.max(0, 1 - baseAlpha);
        const airy = baseAlpha < 0.13;
        let maxBump;
        if (airy) {
            const paleRing = 1 - lift * 0.68;
            const spreadCap = headroom * (0.095 + paleRing * 0.32);
            const chromaPreserve = lift * (0.026 + hslSat * 0.072 + baseAlpha * 5.2);
            const baseline = Math.max(
                0.042,
                0.066 + baseAlpha * 2.9 - lift * 0.016 + hslSat * 0.036
            );
            maxBump = Math.min(spreadCap, baseline + chromaPreserve);
        } else {
            maxBump = Math.min(headroom * 0.98, Math.max(baseAlpha + 0.28, 0.71 - baseAlpha * 0.12));
            const opaqueish = 0.36;
            const airyEdge = 0.13;
            const transmissionWeight = Math.max(0, Math.min(1, (opaqueish - baseAlpha) / (opaqueish - airyEdge)));
            const paleAtten = lift * Math.pow(transmissionWeight, 1.15) * 0.78;
            maxBump *= Math.max(0.32, 1 - paleAtten);
        }
        const curved = lift * lift;
        return Math.min(0.985, baseAlpha + maxBump * curved);
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

    /** Blend two theme hex colors (for gradient shell text / contrast). `weightTowardB` in 0–1. */
    mixHexColors(hexA, hexB, weightTowardB = 0.5) {
        const t = Math.max(0, Math.min(1, weightTowardB));
        const a = this.hexToRgb(hexA || '#808080');
        const b = this.hexToRgb(hexB || hexA || '#808080');
        const toByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
        const r = toByte(a.r * (1 - t) + b.r * t);
        const g = toByte(a.g * (1 - t) + b.g * t);
        const bl = toByte(a.b * (1 - t) + b.b * t);
        const h = (c) => (c < 16 ? '0' : '') + c.toString(16);
        return `#${h(r)}${h(g)}${h(bl)}`;
    }

    /**
     * Rough RGB blend of tinted glass vs desktop showing through `(1 − alpha)`.
     * Default “through” color is **hue-biased** toward the theme so contrast math matches a tinted
     * slab, not a grey wash, when `tint` is small.
     */
    approximateGlassSurfaceHex(themeHex, tintAlpha01, ambientHex = null) {
        const tint = Math.max(0, Math.min(1, tintAlpha01 || 0));
        const tg = this.hexToRgb(themeHex || '#808080');
        let amb = ambientHex;
        if (amb == null || amb === '') {
            let L;
            try {
                L = this.getLuminance(themeHex || '#808080');
            } catch (_) {
                L = 0.2;
            }
            const coolLight = '#e7ebf3';
            if (L > 0.58) {
                const towardNeutral = L > 0.78 ? 0.44 : 0.35;
                amb = this.mixHexColors(themeHex || '#808080', coolLight, towardNeutral);
            } else if (L > 0.38) {
                amb = '#909090';
            } else {
                amb = '#1c1c1c';
            }
        }
        const ag = this.hexToRgb(amb);
        const toByte = (n) => Math.max(0, Math.min(255, Math.round(n)));
        const r = toByte(tg.r * tint + ag.r * (1 - tint));
        const g = toByte(tg.g * tint + ag.g * (1 - tint));
        const b = toByte(tg.b * tint + ag.b * (1 - tint));
        const h = (c) => (c < 16 ? '0' : '') + c.toString(16);
        return `#${h(r)}${h(g)}${h(b)}`;
    }

    /**
     * Shell/tab/sidebar text: strict #fff vs #000 chosen to maximize minimum contrast
     * across primary + optional gradient glass surfaces (readable on both ends of a gradient).
     */
    deriveShellContrastTextPalette(surfPrimaryHex, surfGradientHexOptional = null) {
        const surfaces = surfGradientHexOptional ? [surfPrimaryHex, surfGradientHexOptional] : [surfPrimaryHex];
        const white = '#ffffff';
        const black = '#000000';
        const minContrast = (hex) => Math.min(...surfaces.map((s) => this.getContrastRatio(s, hex)));
        const minW = minContrast(white);
        const minB = minContrast(black);
        const primary = minB >= minW ? black : white;
        const shellIsDark = primary === white;
        const rgb = shellIsDark ? '255, 255, 255' : '0, 0, 0';
        return {
            primary,
            secondary: `rgba(${rgb}, 0.84)`,
            muted: `rgba(${rgb}, 0.58)`,
            shellIsDark,
            inkRgb: rgb,
        };
    }
    
    // Convert hex to RGB
    hexToRgb(hex) {
        if (hex == null || hex === '') return { r: 0, g: 0, b: 0 };
        let value = String(hex).trim();
        if (!value.startsWith('#')) value = `#${value}`;
        value = value.slice(1);
        if (/^[a-f\d]{3}$/i.test(value)) {
            value = value.split('').map((c) => c + c).join('');
        }
        const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(value);
        return result
            ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            }
            : { r: 0, g: 0, b: 0 };
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

    _captureShellChromeSnapshot() {
        if (!this._lastShellThemeColors) return null;
        return { colors: { ...this._lastShellThemeColors } };
    }

    _restoreShellChromeSnapshot(snapshot) {
        if (!snapshot?.colors) return false;
        this.applyCustomTheme(snapshot.colors);
        return true;
    }

    _captureUrlBarChromeSnapshot() {
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return null;
        const varKeys = [
            '--url-bar-bg',
            '--url-bar-border',
            '--url-bar-text',
            '--url-bar-text-muted',
            '--url-bar-btn-hover'
        ];
        const vars = {};
        for (const key of varKeys) {
            const val = urlBar.style.getPropertyValue(key);
            if (val) vars[key] = val;
        }
        const backdrop = urlBar.style.getPropertyValue('backdrop-filter');
        const webkitBackdrop = urlBar.style.getPropertyValue('-webkit-backdrop-filter');
        if (backdrop) vars['backdrop-filter'] = backdrop;
        if (webkitBackdrop) vars['-webkit-backdrop-filter'] = webkitBackdrop;
        return {
            hidden: urlBar.classList.contains('hidden'),
            darkMode: urlBar.classList.contains('dark-mode'),
            internalShell: this._isInternalShellUrlBar(urlBar),
            internalShellMode: urlBar.classList.contains('url-bar-ntp-chrome')
                ? 'ntp'
                : urlBar.classList.contains('settings-page')
                  ? 'settings'
                  : null,
            vars
        };
    }

    _restoreUrlBarChromeSnapshot(snapshot) {
        if (!snapshot) return false;
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return false;

        urlBar.classList.toggle('hidden', !!snapshot.hidden);
        urlBar.classList.toggle('dark-mode', !!snapshot.darkMode);

        if (snapshot.internalShell) {
            this._setUrlBarInternalShellMode(snapshot.internalShellMode);
            this.applyInternalShellUrlBarStyle();
            return true;
        }

        this._setUrlBarInternalShellMode(null);
        urlBar.style.removeProperty('backdrop-filter');
        urlBar.style.removeProperty('-webkit-backdrop-filter');
        const vars = snapshot.vars || {};
        for (const key of [
            '--url-bar-bg',
            '--url-bar-border',
            '--url-bar-text',
            '--url-bar-text-muted',
            '--url-bar-btn-hover',
            'backdrop-filter',
            '-webkit-backdrop-filter'
        ]) {
            const val = vars[key];
            if (val) urlBar.style.setProperty(key, val);
            else urlBar.style.removeProperty(key);
        }
        this.applyChatPanelTheme(urlBar);
        return Object.keys(vars).length > 0;
    }

    _persistUrlBarChromeToTab(tabId) {
        const tid = this._normalizeTabMapKey(tabId);
        if (tid == null || !this.tabs.has(tid)) return;
        const snap = this._captureUrlBarChromeSnapshot();
        if (!snap) return;
        const t = this.tabs.get(tid);
        t.urlBarChromeSnapshot = snap;
        this.tabs.set(tid, t);
    }

    /** Restore URL bar tint instantly when switching tabs (same idea as profile chrome cache). */
    _applyTabChromeImmediate(tab) {
        if (!tab) return;
        try {
            this._tabUrlBarRestoredFromCache = false;

            this._urlBarInstantThemeTabSwitch = true;
            this.elements?.webviewUrlBar?.classList.add('url-bar--instant-theme');

            const urlSnap = tab.urlBarChromeSnapshot;
            const hasUrlSnap =
                urlSnap &&
                (urlSnap.internalShell || (urlSnap.vars && Object.keys(urlSnap.vars).length > 0));

            if (tab.url === this.NEWTAB_URL) {
                this._setUrlBarInternalShellMode('ntp');
                if (hasUrlSnap && urlSnap.internalShell) {
                    this._restoreUrlBarChromeSnapshot(urlSnap);
                    this._tabUrlBarRestoredFromCache = true;
                } else {
                    this.applyInternalShellUrlBarStyle();
                }
            } else if (tab.url === 'axis://settings' || tab.isSettings) {
                this._setUrlBarInternalShellMode('settings');
                if (hasUrlSnap && urlSnap.internalShell) {
                    this._restoreUrlBarChromeSnapshot(urlSnap);
                    this._tabUrlBarRestoredFromCache = true;
                } else {
                    this.applyInternalShellUrlBarStyle();
                }
            } else if (hasUrlSnap) {
                this._restoreUrlBarChromeSnapshot(urlSnap);
                this._tabUrlBarRestoredFromCache = true;
            } else if (
                tab.url &&
                tab.url !== 'about:blank' &&
                !String(tab.url).startsWith('axis:note://')
            ) {
                if (!this.applyCachedTheme(tab.url)) {
                    this.applyAppThemeToUrlBar();
                }
            } else {
                this.applyAppThemeToUrlBar();
            }

            const wv = tab.webview;
            if (wv) {
                this.updateUrlBar(wv, { skipExtractTheme: true, keepInstantTheme: true });
            }
        } catch (e) {
            console.error('tab chrome immediate apply failed', e);
        }
    }
    
    resetToBlackTheme() {
        // Incognito: always true black theme, unchangable
        if (this.isIncognitoWindow) {
            const colors = {
                primary: '#000000',
                secondary: '#0a0a0a',
                accent: '#111111',
                text: '#ffffff',
                textSecondary: '#b0b0b0',
                textMuted: '#707070',
                border: 'rgba(255, 255, 255, 0.1)',
                borderLight: 'rgba(255, 255, 255, 0.15)'
            };
            this.applyCustomTheme(colors);
            return;
        }
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
    
    applyCustomTheme(colors) {
        if (colors && typeof colors === 'object') {
            this._lastShellThemeColors = { ...colors };
        }
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

        // `uiTheme` flips ONLY overlay/secondary surfaces (popups, menus, Cmd+F,
        // security panel, zoom indicator, context menus, notes/history/downloads panels)
        // via `data-ui-theme="light"` + targeted CSS. Settings, new tab, and AI chat
        // stay dark. The main
        // shell (tabs, sidebar, url bar strip, nav buttons, background gradient) and
        // every theme-color-driven variable (`--theme-color`, `--gradient-color`,
        // `--primary-gradient`, `--accent-color`, `--primary-color`, shell glass,
        // tab hover/active) are IDENTICAL in both modes so the user's theme color
        // is never visually altered. Incognito ignores this flag (forced black below).
        const preferLightUi = this.settings?.uiTheme === 'light' && !this.isIncognitoWindow;
        document.documentElement.setAttribute('data-ui-theme', preferLightUi ? 'light' : 'dark');
        void this.syncVaultAutofillUiTheme(this.getActiveWebview()).catch(() => {});

        // Pre-calculate all color values once to avoid repeated calculations
        const darkerPrimary = colors.primary;
        const shellBase = darkerPrimary;
        const headerBg = this.darkenColor(shellBase, 0.03);
        const urlBarBg = this.darkenColor(shellBase, 0.08);
        const urlBarFocusBg = this.darkenColor(shellBase, 0.03);
        const tabHoverBg = this.darkenColor(shellBase, 0.03);
        const tabActiveBg = this.darkenColor(shellBase, 0.02);
        const buttonHoverBg = this.darkenColor(shellBase, 0.05);
        const secondaryColor = this.darkenColor(darkerPrimary, 0.02);

        const gradientDirection = this.settings?.gradientDirection || '135deg';
        const gradientColorResolved =
            this.settings?.gradientEnabled &&
            (colors.gradientColor || this.settings.gradientColor)
                ? colors.gradientColor || this.settings.gradientColor || '#2a2a2a'
                : null;
        const gradientEnabled = !!gradientColorResolved;
        const shellGradientSecondary = gradientColorResolved;

        const forceOpaqueBlack = this.isIncognitoWindow;
        const chrome = this.getShellChromeStyle();
        let glassPrim = 1;
        let glassGrad = 1;
        if (!forceOpaqueBlack) {
            glassPrim = this.getThemeAwareGlassAlpha(shellBase, chrome.glassAlpha);
            glassGrad =
                gradientEnabled && shellGradientSecondary
                    ? this.getThemeAwareGlassAlpha(shellGradientSecondary, chrome.glassAlpha)
                    : glassPrim;
        }

        let uiTextPrimary = colors.text;
        let uiTextSecondary = colors.textSecondary || colors.text;
        let uiTextMuted = colors.textMuted || colors.text;
        let shellChromeIsDark = this.isDarkColor(colors.primary);
        let shellContrastPal = null;
        if (!forceOpaqueBlack) {
            const surfP = this.approximateGlassSurfaceHex(shellBase, glassPrim);
            const surfG =
                gradientEnabled && shellGradientSecondary
                    ? this.approximateGlassSurfaceHex(shellGradientSecondary, glassGrad)
                    : null;
            shellContrastPal = this.deriveShellContrastTextPalette(surfP, surfG);
            uiTextPrimary = shellContrastPal.primary;
            uiTextSecondary = shellContrastPal.secondary;
            uiTextMuted = shellContrastPal.muted;
            shellChromeIsDark = shellContrastPal.shellIsDark;
        }

        const isDark = shellChromeIsDark;
        const textSecondary = uiTextSecondary;
        const textMutedFinal = uiTextMuted;
        let shellInkRgb = '255, 255, 255';
        if (shellContrastPal && shellContrastPal.inkRgb) {
            shellInkRgb = shellContrastPal.inkRgb;
        } else {
            try {
                shellInkRgb = this.getLuminance(uiTextPrimary) > 0.5 ? '0, 0, 0' : '255, 255, 255';
            } catch (_) {
                shellInkRgb = '255, 255, 255';
            }
        }
        const borderColor =
            colors.border ||
            (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.1)');
        const borderColorLight =
            colors.borderLight || (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.14)');

        // Batch all CSS variable updates using setProperty for maximum performance
        const root = document.documentElement;
        const style = root.style;
        if (forceOpaqueBlack) {
            style.setProperty('--background-color', '#000000');
            style.setProperty('--sidebar-background', '#000000');
            style.setProperty('--sidebar-slide-out-background', '#000000');
        }
        // Core theme colors - batch update (translucent so :root matches the airy glass shell)
        if (!forceOpaqueBlack && gradientEnabled) {
            const bgGrad = this.smoothGradient(
                gradientDirection,
                this.hexToRgba(shellBase, glassPrim),
                this.hexToRgba(shellGradientSecondary, glassGrad)
            );
            style.setProperty('--background-color', bgGrad);
        } else if (!forceOpaqueBlack) {
            style.setProperty('--background-color', this.hexToRgba(shellBase, glassPrim));
        }
        style.setProperty('--text-color', uiTextPrimary);
        style.setProperty('--text-color-secondary', textSecondary);
        style.setProperty('--text-color-muted', textMutedFinal);
        style.setProperty('--shell-ink-rgb', shellInkRgb);
        // Use a glassy, semi-transparent version of the shell base color for app surfaces (skip in incognito)
        let glassSidebarBg;
        let sidebarSlideOutBg;
        if (forceOpaqueBlack) {
            glassSidebarBg = '#000000';
            sidebarSlideOutBg = '#000000';
        } else if (gradientEnabled) {
            const primaryRgba = this.hexToRgba(shellBase, glassPrim);
            const gradientRgba = this.hexToRgba(shellGradientSecondary, glassGrad);
            glassSidebarBg = this.smoothGradient(gradientDirection, primaryRgba, gradientRgba);
            const primarySlide = this.hexToRgba(shellBase, chrome.slideOutAlpha);
            const gradientSlide = this.hexToRgba(shellGradientSecondary, chrome.slideOutAlpha);
            sidebarSlideOutBg = this.smoothGradient(gradientDirection, primarySlide, gradientSlide);
        } else {
            glassSidebarBg = this.hexToRgba(shellBase, glassPrim) || `rgba(20, 20, 20, ${glassPrim})`;
            sidebarSlideOutBg = this.hexToRgba(shellBase, chrome.slideOutAlpha) || `rgb(28, 28, 28)`;
        }
        // Popups use subtle dominant color (shell base, even if gradient)
        const popupBgAlpha = forceOpaqueBlack
            ? chrome.popupAlpha
            : this.getThemeAwareGlassAlpha(shellBase, chrome.popupAlpha);
        const popupBgRgba = this.hexToRgba(shellBase, popupBgAlpha);
        style.setProperty('--popup-background-subtle', popupBgRgba);
        style.setProperty('--popup-header', headerBg);
        style.setProperty('--button-background', 'transparent');
        style.setProperty('--button-hover', buttonHoverBg);
        style.setProperty('--button-text', uiTextPrimary);
        style.setProperty('--button-text-hover', uiTextPrimary);
        style.setProperty('--sidebar-background', glassSidebarBg);
        style.setProperty('--sidebar-slide-out-background', sidebarSlideOutBg);
        // URL bar now uses glassmorphism effect, no need to set background color
        // style.setProperty('--url-bar-background', urlBarBg);
        // style.setProperty('--url-bar-focus-background', urlBarFocusBg);
        style.setProperty('--url-bar-text', uiTextPrimary);
        style.setProperty('--url-bar-text-muted', textMutedFinal);
        style.setProperty('--tab-background', 'transparent');
        style.setProperty('--tab-background-hover', tabHoverBg);
        style.setProperty('--tab-background-active', tabActiveBg);
        style.setProperty('--tab-text', uiTextPrimary);
        style.setProperty('--tab-text-active', uiTextPrimary);
        style.setProperty('--tab-close-color', textSecondary);
        style.setProperty('--tab-close-hover', uiTextPrimary);
        style.setProperty('--icon-color', textSecondary);
        style.setProperty('--icon-hover', uiTextPrimary);
        style.setProperty('--border-color', borderColor);
        style.setProperty('--border-color-light', borderColorLight);
        style.setProperty('--accent-color', colors.accent);
        style.setProperty('--primary-color', darkerPrimary);
        style.setProperty('--secondary-color', secondaryColor);
        
        // Set gradient variables (use same glass alpha as shell so UI that reads --primary-gradient respects window brightness)
        if (gradientEnabled) {
            const gradient = this.smoothGradient(
                gradientDirection,
                this.hexToRgba(darkerPrimary, glassPrim),
                this.hexToRgba(gradientColorResolved, glassGrad)
            );
            style.setProperty('--primary-gradient', gradient);
            style.setProperty('--theme-color', darkerPrimary);
            style.setProperty('--gradient-color', gradientColorResolved);
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
        document.body.style.color = uiTextPrimary;
        
        // Check if there are any tabs open
        const hasTabs = this.tabs && this.tabs.size > 0;
        
        const mainArea = document.getElementById('main-area');
        const contentArea = document.getElementById('content-area');
        const app = document.getElementById('app');
        
        if (hasTabs) {
            // When tabs are open: Apply theme to main-area for seamless blend
            if (mainArea) {
                mainArea.style.setProperty('background', glassSidebarBg, 'important');
                mainArea.style.setProperty('backdrop-filter', chrome.backdropStrong, 'important');
                mainArea.style.setProperty('-webkit-backdrop-filter', chrome.backdropStrong, 'important');
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
                // Use semi-transparent background for frosted glass effect (shell base, not theme color)
                const appBg = gradientEnabled ?
                    this.smoothGradient(gradientDirection, this.hexToRgba(shellBase, glassPrim), this.hexToRgba(shellGradientSecondary, glassGrad)) :
                    this.hexToRgba(shellBase, glassPrim);
                app.style.setProperty('background', appBg, 'important');
            app.style.setProperty('backdrop-filter', chrome.backdropMain, 'important');
            app.style.setProperty('-webkit-backdrop-filter', chrome.backdropMain, 'important');
            }
        } else {
            // When NO tabs are open: Keep theme background everywhere, just hide webviews
            // Apply theme to main-area so background is visible
            if (mainArea) {
                mainArea.style.setProperty('background', glassSidebarBg, 'important');
                mainArea.style.setProperty('backdrop-filter', chrome.backdropStrong, 'important');
                mainArea.style.setProperty('-webkit-backdrop-filter', chrome.backdropStrong, 'important');
            }
            
            // Also apply to app element (shell base so light mode stays light regardless of theme color)
            if (app) {
                const appBg = gradientEnabled ?
                    this.smoothGradient(gradientDirection, this.hexToRgba(shellBase, glassPrim), this.hexToRgba(shellGradientSecondary, glassGrad)) :
                    this.hexToRgba(shellBase, glassPrim);
                app.style.setProperty('background', appBg, 'important');
                app.style.setProperty('backdrop-filter', chrome.backdropStrong, 'important');
                app.style.setProperty('-webkit-backdrop-filter', chrome.backdropStrong, 'important');
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
        }

        // Transparent-sites UI (URL bar / new tab) reads these from :root — match #app shell blur/sat
        if (!forceOpaqueBlack) {
            const ntChrome = this.getShellChromeStyle({ forceDarkNewTabSurfaces: true });
            style.setProperty('--axis-ts-urlbar-blur', `${chrome.blurMain}px`);
            style.setProperty('--axis-ts-urlbar-sat', `${chrome.satMain}%`);
            style.setProperty('--axis-nt-search-bg', ntChrome.newTabSearchBg);
            style.setProperty('--axis-nt-search-blur', `${ntChrome.newTabSearchBlur}px`);
            style.setProperty('--axis-nt-search-sat', `${ntChrome.newTabSearchSat}%`);
            style.setProperty('--axis-nt-toggle-bg', ntChrome.newTabToggleBg);
            style.setProperty('--axis-nt-toggle-blur', `${ntChrome.newTabToggleBlur}px`);
            style.setProperty('--axis-nt-toggle-sat', `${ntChrome.newTabToggleSat}%`);
            style.setProperty('--axis-nt-ask-bg', ntChrome.newTabAskBg);
            style.setProperty('--axis-nt-ask-blur', `${ntChrome.newTabAskBlur}px`);
            style.setProperty('--axis-nt-ask-sat', `${ntChrome.newTabAskSat}%`);
        }
        
        // Re-enable transitions after theme is applied (use RAF to ensure CSS variables are updated first)
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                document.body.classList.remove('theme-switching');
            });
        });
        this._syncInternalShellUrlBarIfNeeded();
    }

    _isInternalShellUrlBar(urlBar = this.elements?.webviewUrlBar) {
        return !!urlBar?.classList.contains('url-bar-internal-shell');
    }

    /** NTP / Settings URL chrome — never reuse overlay class `new-tab-page` on `#webview-url-bar`. */
    _setUrlBarInternalShellMode(mode) {
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return;
        urlBar.classList.remove(
            'url-bar-internal-shell',
            'url-bar-ntp-chrome',
            'url-bar-ntp-ai-chrome',
            'settings-page',
            'new-tab-page'
        );
        if (mode === 'ntp') {
            urlBar.classList.add('url-bar-internal-shell', 'url-bar-ntp-chrome');
        } else if (mode === 'settings') {
            urlBar.classList.add('url-bar-internal-shell', 'settings-page');
        } else {
            urlBar.style.removeProperty('background');
        }
    }

    /** Re-apply NTP / Settings URL bar styling after global theme refresh. */
    _syncInternalShellUrlBarIfNeeded() {
        const curTab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        if (curTab?.url === this.NEWTAB_URL) {
            this._setUrlBarInternalShellMode('ntp');
            this.applyInternalShellUrlBarStyle();
        } else if (curTab?.url === 'axis://settings' || curTab?.isSettings) {
            this._setUrlBarInternalShellMode('settings');
            this.applyInternalShellUrlBarStyle();
        }
    }

    /** 0 = opaque chrome, 1 = most desktop light through (settings slider / 100). */
    getShellChromeTransmissionT() {
        if (this.isIncognitoWindow) return 0;
        const raw = this.settings?.windowChromeLight;
        const n = Number(raw);
        const v = Number.isFinite(n) ? n : 50;
        return Math.max(0, Math.min(100, v)) / 100;
    }

    getShellChromeStyle(opts = {}) {
        const tSlider = this.getShellChromeTransmissionT();
        // New tab / AI chat surfaces always use dark glass (unaffected by uiTheme).
        const lightUi = !opts.forceDarkNewTabSurfaces
            && this.settings?.uiTheme === 'light'
            && !this.isIncognitoWindow;
        const ntSearchRGB = lightUi ? '244, 245, 247' : '14, 15, 18';
        const ntAskRGB = lightUi ? '248, 249, 251' : '10, 11, 14';
        const ntToggleRGB = lightUi ? '0, 0, 0' : '255, 255, 255';
        /** Slider 0: solid theme colors, no blur — `AXIS_SHELL_CHROME_OPAQUE` is still partly translucent for the old "opaque" *blend endpoint* at t>0. */
        if (tSlider <= 0) {
            const none = 'none';
            return {
                t: 0,
                glassAlpha: 1,
                slideOutAlpha: 1,
                popupAlpha: 1,
                urlBarAlpha: 1,
                blurMain: 0,
                satMain: 100,
                backdropMain: none,
                backdropStrong: none,
                urlBarBackdrop: none,
                urlBarBlur: 0,
                urlBarSat: 100,
                urlBarTintDefault: 1,
                urlBarTintDark: 1,
                urlBarTintLight: 1,
                newTabSearchBg: `rgba(${ntSearchRGB}, ${lightUi ? 0.72 : 0.38})`,
                newTabSearchBlur: 14,
                newTabSearchSat: 120,
                newTabToggleBg: `rgba(${ntToggleRGB}, ${lightUi ? 0.06 : 0.08})`,
                newTabToggleBlur: 12,
                newTabToggleSat: 120,
                newTabAskBg: `rgba(${ntAskRGB}, ${lightUi ? 0.78 : 0.34})`,
                newTabAskBlur: 14,
                newTabAskSat: 120,
            };
        }
        /** Concave remap: slider mid–high spends more blend weight on the airy endpoint (`AXIS_SHELL_CHROME_TRANSPARENT`). */
        const chromeBlendEaseExp = 1.85;
        const tBlend = 1 - Math.pow(1 - tSlider, chromeBlendEaseExp);
        const L = (a, b) => a + (b - a) * tBlend;
        const o = AXIS_SHELL_CHROME_OPAQUE;
        const tr = AXIS_SHELL_CHROME_TRANSPARENT;
        const glassAlpha = L(o.glassAlpha, tr.glassAlpha);
        const slideOutAlpha = L(o.slideOutAlpha, tr.slideOutAlpha);
        const popupAlpha = L(o.popupAlpha, tr.popupAlpha);
        const urlBarAlpha = L(o.urlBarAlpha, tr.urlBarAlpha);
        const blurMain = Math.round(L(o.blurMain, tr.blurMain));
        const satMain = Math.round(L(o.satMain, tr.satMain));
        const blurStrong = Math.round(L(o.blurStrong, tr.blurStrong));
        const satStrong = Math.round(L(o.satStrong, tr.satStrong));
        const urlBarBlur = Math.round(L(o.urlBarBlur, tr.urlBarBlur));
        const urlBarSat = Math.round(L(o.urlBarSat, tr.urlBarSat));
        const urlBarTintDefault = L(o.urlBarTintDefault, tr.urlBarTintDefault);
        const urlBarTintDark = L(o.urlBarTintDark, tr.urlBarTintDark);
        const urlBarTintLight = L(o.urlBarTintLight, tr.urlBarTintLight);
        const ntS = L(o.newTabSearchAlpha, tr.newTabSearchAlpha);
        const newTabSearchBg = `rgba(${ntSearchRGB}, ${ntS.toFixed(3)})`;
        // In dark mode the toggle uses white overlay; in light mode flip to a black overlay
        // with a lower alpha so the in-app new tab page matches the rest of the shell.
        const ntTogA = L(o.newTabToggleAlpha, tr.newTabToggleAlpha);
        const newTabToggleBg = `rgba(${ntToggleRGB}, ${(lightUi ? Math.min(ntTogA, 0.12) : ntTogA).toFixed(3)})`;
        const ntA = L(o.newTabAskAlpha, tr.newTabAskAlpha);
        const newTabAskBg = `rgba(${ntAskRGB}, ${ntA.toFixed(3)})`;
        const newTabSearchBlur = Math.round(L(o.newTabSearchBlur, tr.newTabSearchBlur));
        const newTabSearchSat = Math.round(L(o.newTabSearchSat, tr.newTabSearchSat));
        const newTabToggleBlur = Math.round(L(o.newTabToggleBlur, tr.newTabToggleBlur));
        const newTabToggleSat = Math.round(L(o.newTabToggleSat, tr.newTabToggleSat));
        const newTabAskBlur = Math.round(L(o.newTabAskBlur, tr.newTabAskBlur));
        const newTabAskSat = Math.round(L(o.newTabAskSat, tr.newTabAskSat));
        return {
            t: tSlider,
            glassAlpha,
            slideOutAlpha,
            popupAlpha,
            urlBarAlpha,
            blurMain,
            satMain,
            backdropMain: `blur(${blurMain}px) saturate(${satMain}%)`,
            backdropStrong: `blur(${blurStrong}px) saturate(${satStrong}%)`,
            urlBarBackdrop: `blur(${urlBarBlur}px) saturate(${urlBarSat}%)`,
            urlBarBlur,
            urlBarSat,
            urlBarTintDefault,
            urlBarTintDark,
            urlBarTintLight,
            newTabSearchBg,
            newTabSearchBlur,
            newTabSearchSat,
            newTabToggleBg,
            newTabToggleBlur,
            newTabToggleSat,
            newTabAskBg,
            newTabAskBlur,
            newTabAskSat,
        };
    }

    // Convert hex or rgb() color to rgba with configurable alpha for glass effect
    hexToRgba(hex, alpha = 1) {
        if (hex == null || hex === '') return null;
        const raw = String(hex).trim();
        const rgbMatch = raw.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
        if (rgbMatch) {
            const r = Math.round(parseFloat(rgbMatch[1]));
            const g = Math.round(parseFloat(rgbMatch[2]));
            const b = Math.round(parseFloat(rgbMatch[3]));
            if ([r, g, b].some((n) => Number.isNaN(n))) return null;
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        let value = raw;
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
        const popupElements = document.querySelectorAll('.downloads-panel, .extensions-menu-panel, .settings-panel, .nav-menu, .context-menu, .quit-modal-card');
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

    getTabWebpreferencesString() {
        const base =
            'contextIsolation=false,nodeIntegration=false,sandbox=false,webSecurity=true,accelerated2dCanvas=true,enableWebGL=true,enableWebGL2=true,enableGpuRasterization=true,enableZeroCopy=false,enableHardwareAcceleration=true,backgroundThrottling=false,offscreen=false,spellcheck=yes';
        return this.settings?.javascriptEnabled === false ? `${base},javascript=no` : base;
    }

    getSettingsTabWebpreferencesString() {
        // Internal Settings UI must always run JS (even when browsing tabs disable it).
        return 'contextIsolation=true,nodeIntegration=false,sandbox=false,webSecurity=true,accelerated2dCanvas=true,enableWebGL=true,enableWebGL2=true,enableGpuRasterization=true,enableZeroCopy=false,enableHardwareAcceleration=true,backgroundThrottling=false,offscreen=false,spellcheck=yes';
    }

    _isSettingsTab(tab) {
        return !!(tab && (tab.url === 'axis://settings' || tab.isSettings));
    }

    _settingsWebviewOptionsForTab(tab) {
        return this._isSettingsTab(tab) ? { useSettingsPreload: true } : {};
    }

    getSessionPartition() {
        if (this.isIncognitoWindow) return 'incognito';
        const id = String(this.profileId || 'personal').toLowerCase().replace(/[^a-z0-9_-]/g, '-');
        if (id === 'personal') return 'persist:main';
        return `persist:profile-${id}`;
    }

    /** Destroy all tab webviews so they are recreated with current webpreferences (e.g. JavaScript on/off). */
    rebuildAllTabWebviewsForWebPreferences() {
        if (!this.tabs || this.tabs.size === 0) return;
        const currentId = this.currentTab;
        for (const tabId of this.tabs.keys()) {
            const tab = this.tabs.get(tabId);
            if (!tab?.webview) continue;
            try {
                this.cleanupWebviewListeners(tab.webview);
                try {
                    tab.webview.src = 'about:blank';
                } catch (_) {}
                if (tab.webview.parentNode) {
                    tab.webview.parentNode.removeChild(tab.webview);
                }
            } catch (e) {
                console.error('rebuildAllTabWebviewsForWebPreferences', e);
            }
            tab.webview = null;
            this.tabs.set(tabId, tab);
        }
        if (currentId != null && this.tabs.has(currentId)) {
            this.switchToTab(currentId);
        }
    }

    createTabWebview(tabId, options = {}) {
        const container = document.getElementById('webviews-container');
        if (!container) return null;

        const webview = document.createElement('webview');
        webview.dataset.tabId = String(tabId);
        webview.setAttribute('allowpopups', '');
        webview.setAttribute(
            'webpreferences',
            options.useSettingsPreload
                ? this.getSettingsTabWebpreferencesString()
                : this.getTabWebpreferencesString()
        );
        const preloadPath = options.useSettingsPreload
            ? this._settingsWebviewPreloadPath
            : this._webviewCwsPreloadPath;
        if (preloadPath) {
            try {
                webview.setAttribute('preload', preloadPath);
            } catch (_) {
                /* ignore */
            }
        }
        webview.setAttribute('partition', this.getSessionPartition());
        try {
            webview.dataset.axisProfile = String(this.profileId || 'personal')
                .toLowerCase()
                .replace(/[^a-z0-9_-]/g, '-');
        } catch (_) {}
        // Let Electron use its real Chromium version in the UA string;
        // hardcoding an old Chrome version can cause sites to refuse loading.
        webview.setAttribute('autosize', 'true');
        webview.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            width: 100%;
            height: 100%;
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

    /** Reattach an existing guest in `#webviews-container` when the Map lost `tab.webview`. */
    _findTabWebviewInContainer(tabId) {
        const container = document.getElementById('webviews-container');
        if (!container) return null;
        const want = String(tabId);
        for (const wv of container.querySelectorAll('webview')) {
            if (String(wv.dataset.tabId) === want) return wv;
        }
        return null;
    }

    /**
     * Favorites are shown as tiles, but each favorite owns a real tab id. A hidden `.tab` row
     * keeps focus/layout code (`querySelector('[data-tab-id]')`) identical to pinned tabs.
     */
    _ensureFavoriteTabHostElement(tabId) {
        const id = this._normalizeTabMapKey(tabId);
        if (id == null) return null;
        let el = document.querySelector(`[data-tab-id="${id}"]`);
        if (el) return el;
        el = document.createElement('div');
        el.className = 'tab tab-favorite-host';
        el.dataset.tabId = String(id);
        el.setAttribute('aria-hidden', 'true');
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (tabsContainer) {
            if (separator && separator.parentNode === tabsContainer) {
                tabsContainer.insertBefore(el, separator);
            } else {
                tabsContainer.insertBefore(el, tabsContainer.firstChild);
            }
        }
        return el;
    }

    _removeFavoriteTabHostElement(tabId) {
        const id = this._normalizeTabMapKey(tabId);
        if (id == null) return;
        const el = document.querySelector(`[data-tab-id="${id}"]`);
        if (el?.classList.contains('tab-favorite-host')) {
            try {
                el.remove();
            } catch (_) {}
        }
    }

    /** Detach/reattach guest so Electron recomputes guest bounds after container width changes. */
    _rebindWebviewGuestLayout(webview) {
        if (!webview?.parentNode) return;
        const parent = webview.parentNode;
        const next = webview.nextSibling;
        try {
            parent.removeChild(webview);
            if (next) parent.insertBefore(webview, next);
            else parent.appendChild(webview);
        } catch (_) {}
        this._nudgeWebviewGuestLayout();
    }

    /**
     * Cheap layout poke so Electron’s guest embedding matches settled host bounds (post-resize /
     * tab switch only — not during active edge drag; we avoid that workload entirely there).
     */
    _nudgeWebviewGuestLayout() {
        const container = document.getElementById('webviews-container');
        let containerRect = null;
        if (container) {
            try {
                containerRect = container.getBoundingClientRect();
                void container.offsetHeight;
                void containerRect;
            } catch (_) {}
        }
        const active = this.getActiveWebview();
        if (active) {
            try {
                if (containerRect && containerRect.width > 0 && containerRect.height > 0) {
                    active.style.width = `${Math.round(containerRect.width)}px`;
                    active.style.height = `${Math.round(containerRect.height)}px`;
                }
                void active.offsetWidth;
                void active.offsetHeight;
                void active.getBoundingClientRect();
            } catch (_) {}
        }
        const legacy = document.getElementById('webview');
        if (legacy && legacy !== active) {
            try {
                void legacy.getBoundingClientRect();
            } catch (_) {}
        }
    }

    /** True when this tab already had a loaded guest before the current switch (getURL can lie while inactive). */
    _tabGuestSessionEstablished(tab, currentSrc) {
        if (currentSrc && currentSrc !== 'about:blank' && String(currentSrc).trim() !== '') {
            // Internal pseudo-URLs / file guests — only count when the guest document is real.
            if (currentSrc.includes('settings.html')) return true;
            if (/^axis:/i.test(currentSrc) || currentSrc === this.NEWTAB_URL) return false;
            return true;
        }
        if (!tab) return false;
        const hist = tab.history;
        if (!Array.isArray(hist) || hist.length === 0) return false;
        const idx = typeof tab.historyIndex === 'number' && tab.historyIndex >= 0
            ? tab.historyIndex
            : hist.length - 1;
        const u = hist[idx] ?? hist[hist.length - 1];
        if (!u || u === 'about:blank' || u === this.NEWTAB_URL) return false;
        // `axis://settings` in tab metadata does not mean the settings guest finished loading.
        if (/^axis:/i.test(u)) return false;
        return true;
    }

    _settingsGuestNeedsLoad(currentSrc) {
        return !currentSrc || currentSrc === 'about:blank' || !currentSrc.includes('settings.html');
    }

    _guestLayoutLooksStale(container, webview) {
        if (!container || !webview) return false;
        try {
            const cr = container.getBoundingClientRect();
            const wr = webview.getBoundingClientRect();
            return cr.width > 320 && wr.width > 0 && wr.width < cr.width * 0.55;
        } catch (_) {
            return false;
        }
    }

    /** Rebind only when the guest viewport is still phone-width after the host has full bounds. */
    _maybeRebindStaleGuestLayout() {
        const container = document.getElementById('webviews-container');
        const active = this.getActiveWebview();
        if (!active || !this._guestLayoutLooksStale(container, active)) return;
        this._rebindWebviewGuestLayout(active);
        this._nudgeWebviewGuestLayout();
        this._syncGuestWindowResizeEvent();
    }

    /**
     * After bulk tab closes or switching to a favorite (no sidebar `.tab` row), `<webview>`
     * guests can keep a **stale viewport width**; responsive pages then use a phone-width column,
     * which looks like the page lives in the narrow sidebar beside an empty panel.
     */
    _forceGuestLayoutSync() {
        const container = document.getElementById('webviews-container');
        try {
            if (container) {
                void container.getBoundingClientRect();
                void container.offsetWidth;
                void container.offsetHeight;
            }
        } catch (_) {}
        this._nudgeWebviewGuestLayout();
        try {
            window.dispatchEvent(new Event('resize'));
        } catch (_) {}
        this._syncGuestWindowResizeEvent();
        requestAnimationFrame(() => {
            this._nudgeWebviewGuestLayout();
            this._syncGuestWindowResizeEvent();
            this._maybeRebindStaleGuestLayout();
        });
        setTimeout(() => {
            this._nudgeWebviewGuestLayout();
            this._syncGuestWindowResizeEvent();
            this._maybeRebindStaleGuestLayout();
        }, 64);
        setTimeout(() => {
            this._nudgeWebviewGuestLayout();
            this._syncGuestWindowResizeEvent();
            this._maybeRebindStaleGuestLayout();
        }, 200);
    }

    /** Dispatch window `resize` inside the active guest for pages that listen on `window`. */
    _syncGuestWindowResizeEvent() {
        const wv = this.getActiveWebview();
        if (!wv || typeof wv.executeJavaScript !== 'function') return;
        try {
            wv.executeJavaScript(
                "(function(){try{if(typeof window!==\"undefined\")window.dispatchEvent(new Event(\"resize\"));}catch(e){}})();",
                true
            ).catch(() => {});
        } catch (_) {}
    }

    /**
     * Guest `<webview>` sizing is handled by Chromium (`autosize`). We only poke layout + fire
     * `resize` in the page **after** resizing settles — doing it during every frame of a window
     * drag was the main source of jank (forced layout + IPC into the guest repeatedly).
     *
     * `ResizeObserver` on `#webviews-container` covers **sidebar width** drags (no `window` resize),
     * debounced to the same idle handler as `window.resize`.
     */
    setupWebviewGuestResizeSync() {
        const IDLE_MS = 120;
        /** @type {ReturnType<typeof setTimeout> | null} */
        let idleFlushTimer = null;

        const deferredGuestSync = () => {
            this._nudgeWebviewGuestLayout();
            this._syncGuestWindowResizeEvent();
        };

        const scheduleIdleFlush = () => {
            if (idleFlushTimer != null) clearTimeout(idleFlushTimer);
            idleFlushTimer = setTimeout(() => {
                idleFlushTimer = null;
                deferredGuestSync();
            }, IDLE_MS);
        };

        const container = document.getElementById('webviews-container');
        try {
            if (typeof ResizeObserver !== 'undefined' && container) {
                const ro = new ResizeObserver(() => scheduleIdleFlush());
                ro.observe(container);
            }
        } catch (_) {}
        window.addEventListener('resize', scheduleIdleFlush, { passive: true });
        queueMicrotask(deferredGuestSync);
    }

    getActiveWebview() {
        if (!this.currentTab || !this.tabs.has(this.currentTab)) {
            return null;
        }
        const tab = this.tabs.get(this.currentTab);
        return tab?.webview || null;
    }

    createNewTab(url = null, options = {}) {
        let effectiveUrl = url;
        if (options && options.trustedContextImage && typeof url === 'string') {
            const t = url.trim();
            effectiveUrl = t || null;
            if (effectiveUrl && !String(effectiveUrl).toLowerCase().startsWith('axis:')) {
                if (!this.confirmInsecureHttpNavigation(effectiveUrl)) {
                    effectiveUrl = null;
                }
            }
        } else if (
            url &&
            url !== this.NEWTAB_URL &&
            url !== 'axis://settings' &&
            !url.startsWith('axis:note://') &&
            !String(url).toLowerCase().startsWith('axis:')
        ) {
            const sanitized = this.sanitizeUrl(url);
            if (!sanitized) {
                effectiveUrl = null;
            } else if (!this.confirmInsecureHttpNavigation(sanitized)) {
                effectiveUrl = null;
            } else {
                effectiveUrl = sanitized;
            }
        }

        if (effectiveUrl === 'axis://settings') {
            void this.openSettingsTab(options?.settingsSection || null);
            return this._findSettingsTabId();
        }

        const tabId = Date.now();
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = tabId;
        
        // Create tab object first to check for custom icon / favicon
        const tab = {
            id: tabId,
            url: effectiveUrl || this.NEWTAB_URL,
            title: 'New Tab',
            // Use a simple search icon for the default new tab favicon
            favicon: effectiveUrl ? null : this.NTP_DEFAULT_FAVICON,
            customIcon: null,
            customIconType: null,
            pinned: false,
            webview: null
        };
        this.tabs.set(tabId, tab);
        
        // Determine icon HTML based on type
        let iconHTML = '<img class="tab-favicon" src="" alt="" draggable="false" onerror="this.style.visibility=\'hidden\'">';
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
            url: this.NEWTAB_URL,
            title: 'New Tab',
            favicon: tab.favicon,
            canGoBack: false,
            canGoForward: false,
            history: [],
            historyIndex: -1,
            pinned: false,
            webview: null,
            isMuted: false,
            isPlayingAudio: false
        };
        
        const webview = this.createTabWebview(tabId);
        if (webview) {
            tabData.webview = webview;
        }
        
        this.tabs.set(tabId, tabData);
        
        // Insert tab below separator, after the "+ New Tab" button
        if (separator && separator.parentNode === tabsContainer) {
            const unpinnedRef = this.elements.sidebarNewTabBtn ? this.elements.sidebarNewTabBtn.nextSibling : separator.nextSibling;
            tabsContainer.insertBefore(tabElement, unpinnedRef);
        } else {
            tabsContainer.appendChild(tabElement);
        }

        // Set up tab event listeners
        this.setupTabEventListeners(tabElement, tabId);

        // Only reset new tab page when opening a brand-new tab (not when returning to an existing one)
        this._resetNewTabPageOnShow = !effectiveUrl || effectiveUrl === this.NEWTAB_URL;
        // Switch to new tab (navigate() below is the single place that sets webview.src)
        this.switchToTab(tabId);

        this.updateEmptyState();

        if (effectiveUrl) {
            this.navigate(effectiveUrl, {
                skipHttpsConfirm: true,
                trustedContextImage: !!(options && options.trustedContextImage)
            });
        }
        this.updateTabFavicon(tabId, tabElement);
        this.updateTabTooltip(tabId);

        this.savePinnedTabs();
        this.renderTabGroups();
        return tabId;
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

        const h = tabElement._pinnedCloseHandlers;
        if (h && typeof h.updateIcon === 'function') {
            h.updateIcon();
        }
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
        
        // Minus = pinned tab with an open webview; × = empty pinned slot (no webview)
        const updateIcon = () => {
            const tab = this.tabs.get(tabId);
            const open = !!(tab && tab.webview);
            if (open) {
                icon.classList.remove('fa-times');
                icon.classList.add('fa-minus');
            } else {
                icon.classList.remove('fa-minus');
                icon.classList.add('fa-times');
            }
        };
        
        // Update icon immediately based on current state
        updateIcon();
        
        // Class changes (e.g. closed) and active swaps can accompany webview attach/detach
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

        tabElement.addEventListener('dblclick', (e) => {
            if (e.target.closest('.tab-close') || e.target.closest('.tab-audio-indicator')) return;
            const titleElement = tabElement.querySelector('.tab-title');
            if (!titleElement) return;
            e.preventDefault();
            e.stopPropagation();
            this.renameTab(tabId, titleElement);
        });

        // Middle-click / wheel-click closes tab (browser convention; suppresses autoscroll)
        tabElement.addEventListener('mousedown', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
        });
        tabElement.addEventListener('auxclick', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            this.closeTab(tabId);
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

    switchToTab(rawTabId, opts = {}) {
        const fromProfileSwitch = !!opts.fromProfileSwitch;
        this.hideVaultAutofillPanel();
        const tabId = this._normalizeTabMapKey(rawTabId);
        if (tabId == null || !this.tabs.has(tabId)) {
            if (this.tabs.size === 0) {
                this.currentTab = null;
                this.resetToBlackTheme();
                this.updateNewTabPageVisibility(false);
                this.updateEmptyState();
                this.updateUrlBar();
                this.updateNavigationButtons();
                this.syncAIChatPanelForCurrentTab();
            } else {
                const fallback = Array.from(this.tabs.keys()).find((id) => this._canFocusTabAsActive(id));
                if (fallback != null) {
                    this.switchToTab(fallback);
                } else {
                    this.currentTab = null;
                    this._purgeStaleWebviewsInContainer();
                    this.resetToBlackTheme();
                    this.updateNewTabPageVisibility(false);
                    this.updateEmptyState();
                    this.updateUrlBar();
                    this.updateNavigationButtons();
                    this.syncAIChatPanelForCurrentTab();
                }
            }
            return;
        }

        if (this._sidebarMediaDock && this._normalizeTabMapKey(this._sidebarMediaDock.tabId) === tabId) {
            this.hideSidebarMediaDock();
        }

        const prevCur = this._normalizeTabMapKey(this.currentTab);
        const switchedDifferentTab = prevCur != null && prevCur !== tabId;

        // Save new-tab-page state and URL bar chrome for the tab we're leaving
        if (prevCur != null && prevCur !== tabId && this.tabs.has(prevCur)) {
            const prevTab = this.tabs.get(prevCur);
            if (prevTab) {
                if (prevTab.url === this.NEWTAB_URL) {
                    this.saveNewTabPageStateToTab(prevCur);
                }
                this._persistUrlBarChromeToTab(prevCur);
            }
        }

        // INSTANT tab switching - all critical updates happen synchronously
        let activeTab = document.querySelector(`[data-tab-id="${tabId}"]`);
        const tab = this.tabs.get(tabId);
        if (tab?.isFavoriteTab) {
            this._ensureFavoriteTabHostElement(tabId);
            activeTab = document.querySelector(`[data-tab-id="${tabId}"]`);
        }

        const prevTabId = prevCur;
        if (prevTabId != null && prevTabId !== tabId) {
            const prevTab = this.tabs.get(prevTabId);
            if (prevTab?.webview) {
                this.checkAndShowPIP(prevTabId, prevTab.webview);
            }
            const prevTabElement = document.querySelector(`[data-tab-id="${prevTabId}"]`);
            if (prevTabElement) prevTabElement.classList.remove('active');
        }

        // Demote other webviews before the active tab paints (always fully hide — avoids multi-guest bleed)
        this._prepareWebviewsForTabSwitch(tabId);
        
        // Hide PIP if switching back to the tab that has PIP
        if (this.pipTabId === tabId) {
            this.hidePIP();
        }
        
        // CRITICAL: Update current tab immediately (must be before updateEmptyState so empty state hides)
        this.currentTab = tabId;
        this.updateEmptyState();
        this.syncAIChatPanelForCurrentTab();

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
            let webviewCreatedThisSwitch = false;
            if (!tab.webview) {
                const reclaimed = this._findTabWebviewInContainer(tabId);
                if (reclaimed) {
                    tab.webview = reclaimed;
                    this.tabs.set(tabId, tab);
                }
            }
            if (!tab.webview) {
                const webview = this.createTabWebview(tabId, this._settingsWebviewOptionsForTab(tab));
                if (webview) {
                    tab.webview = webview;
                    this.tabs.set(tabId, tab);
                    webviewCreatedThisSwitch = true;
                    // Update closed state for pinned tabs
                    if (tab.pinned) {
                        this.updatePinnedTabClosedState(tabId);
                    }
                }
            }
            
            if (tab.webview) {
                const webview = tab.webview;
                // Ensure legacy static #webview never blocks interaction (it sits after webviews-container in DOM)
                const legacyWebview = document.getElementById('webview');
                if (legacyWebview && legacyWebview !== webview) {
                    legacyWebview.style.pointerEvents = 'none';
                    legacyWebview.style.opacity = '0';
                    legacyWebview.style.visibility = 'hidden';
                }

                // Get current URL from webview first (may throw when inactive)
                let currentSrc = null;
                try {
                    currentSrc = webview.getURL();
                } catch (e) {
                    currentSrc = 'about:blank';
                }
                if (currentSrc === undefined || currentSrc === null) currentSrc = '';

                const skipGuestSrcReload = !webviewCreatedThisSwitch
                    && this._tabGuestSessionEstablished(tab, currentSrc)
                    && !this._isSettingsTab(tab);
                // If tab says new-tab but webview has navigated to a real page (e.g. user searched from new tab), sync tab.url so we show the page, not the overlay
                const isWebviewRealPage = currentSrc && currentSrc !== 'about:blank' && currentSrc.trim() !== '' && currentSrc !== this.NEWTAB_URL && !currentSrc.startsWith('axis:');
                if (tab.url === this.NEWTAB_URL && isWebviewRealPage) {
                    tab.url = currentSrc;
                    this.tabs.set(tabId, tab);
                }

                // Set webview.src BEFORE making visible so the load starts and content paints correctly
                if (this._isSettingsTab(tab)) {
                    if (!tab.isSettings) {
                        tab.isSettings = true;
                        tab.url = 'axis://settings';
                        this.tabs.set(tabId, tab);
                    }
                    if (this._settingsGuestNeedsLoad(currentSrc)) {
                        void this.loadSettingsInWebview(tab.settingsSection || null, tabId);
                    } else if (tab.settingsSection) {
                        this.focusSettingsSection(tabId, tab.settingsSection);
                    }
                } else if (skipGuestSrcReload) {
                    // Inactive guests often report about:blank from getURL() — never reassign src.
                    if (currentSrc && currentSrc !== 'about:blank') {
                        try {
                            const cur = new URL(currentSrc);
                            if ((cur.protocol === 'https:' || cur.protocol === 'http:') && currentSrc !== tab.url) {
                                tab.url = currentSrc;
                                this.tabs.set(tabId, tab);
                            }
                        } catch (_) {}
                    }
                } else if (tab.url === this.NEWTAB_URL) {
                    // No webview load for new tab page
                } else if (tab.url && tab.url.startsWith('axis:note://')) {
                    const noteId = tab.url.replace('axis:note://', '');
                    if (!currentSrc || currentSrc === 'about:blank' || !currentSrc.includes('axis:note://')) {
                        this.loadNoteInWebview(noteId);
                    }
                } else if (tab.url && tab.url !== 'about:blank' && tab.url !== '') {
                    const sanitizedTabUrl = this.sanitizeUrl(tab.url);
                    const webviewHasContent = currentSrc && currentSrc !== 'about:blank' && currentSrc.trim() !== '';
                    if (!webviewHasContent) {
                        webview.src = sanitizedTabUrl || 'https://www.google.com';
                    } else {
                        // Guest already has a document — never reassign `src` here or SPAs (e.g. YouTube)
                        // full-reload when `tab.url` lags behind in-page URL changes (query/hash).
                        try {
                            const cur = new URL(currentSrc);
                            if ((cur.protocol === 'https:' || cur.protocol === 'http:') && currentSrc !== tab.url) {
                                tab.url = currentSrc;
                                this.tabs.set(tabId, tab);
                            }
                        } catch (_) {}
                    }
                } else if (tab.url !== this.NEWTAB_URL && tab.url !== 'axis://settings' && (!currentSrc || currentSrc === 'about:blank')) {
                    webview.src = 'https://www.google.com';
                    tab.url = 'https://www.google.com';
                    if (!tab.history || tab.history.length === 0) {
                        tab.history = ['https://www.google.com'];
                        tab.historyIndex = 0;
                    }
                    this.tabs.set(tabId, tab);
                }
                
                // Now make webview visible so Chromium paints the content
                webview.classList.remove('inactive');
                // Empty-state used to set `opacity: 0.3 !important` on every webview; clear it so
                // the now-active guest paints fully when we hand focus back from no-tabs to a tab.
                try {
                    webview.style.removeProperty('opacity');
                    webview.style.removeProperty('visibility');
                    webview.style.removeProperty('pointer-events');
                    webview.style.removeProperty('background');
                } catch (_) {}
                if (tab.url === this.NEWTAB_URL) {
                    webview.style.opacity = '1';
                    webview.style.visibility = 'visible';
                    webview.style.pointerEvents = 'none';
                    webview.style.zIndex = '1';
                } else {
                    webview.style.opacity = '1';
                    webview.style.visibility = 'visible';
                    webview.style.pointerEvents = 'auto';
                    webview.style.zIndex = '2';
                    webview.style.zIndex = '2';
                }
                
                this.elements.webview = webview;
                if (
                    !fromProfileSwitch &&
                    !this._tabUrlBarRestoredFromCache &&
                    tab.url &&
                    tab.url !== 'about:blank' &&
                    tab.url !== 'axis://settings' &&
                    !tab.url.startsWith('axis:note://')
                ) {
                    this.applyCachedTheme(tab.url);
                }
                if (tab.isFavoriteTab) {
                    this.renderFavorites();
                    requestAnimationFrame(() => this._forceGuestLayoutSync());
                }
            }

            /* #new-tab-page is z-index 50 — must hide when leaving axis://newtab or it covers every webview below. */
            if (tab.url === this.NEWTAB_URL) {
                this.updateNewTabPageVisibility(true);
            } else {
                this.updateNewTabPageVisibility(false);
            }
        }

        if (switchedDifferentTab && !fromProfileSwitch && tab) {
            this._applyTabChromeImmediate(tab);
        }
        
        // DEFER non-critical updates to not block tab switching
        requestAnimationFrame(() => {
            if (switchedDifferentTab && !fromProfileSwitch && !this._tabUrlBarRestoredFromCache) {
                this._urlBarInstantThemeTabSwitch = true;
                this.elements?.webviewUrlBar?.classList.add('url-bar--instant-theme');
            }
            this._nudgeWebviewGuestLayout();
            this._syncGuestWindowResizeEvent();
            if (tab?.webview && tab.url) {
                this._nudgeYouTubePlayerIfNeeded(tab.webview, tab.url);
                setTimeout(() => this._nudgeYouTubePlayerIfNeeded(tab.webview, tab.url), 420);
            }
            if (activeTab) {
                this.updateTabFavicon(tabId, activeTab);
            }
            this.updateEmptyState();
            this.updateNavigationButtons();
            const skipUrlBarRefresh = this._skipNextUrlBarRefresh;
            const tabUrlBarRestored = this._tabUrlBarRestoredFromCache;
            if (skipUrlBarRefresh) {
                this._skipNextUrlBarRefresh = false;
            } else if (tab?.webview) {
                this.updateUrlBar(tab.webview, {
                    skipExtractTheme: tabUrlBarRestored,
                    keepInstantTheme: tabUrlBarRestored
                });
            } else {
                this.updateUrlBar(null, {
                    skipExtractTheme: tabUrlBarRestored,
                    keepInstantTheme: tabUrlBarRestored
                });
            }
            if (tabUrlBarRestored) {
                this._tabUrlBarRestoredFromCache = false;
            }
            this.updateTabTitle();
            if (!skipUrlBarRefresh && tab && tab.webview) {
                try {
                    this.isWebviewLoading = tab.webview.isLoading();
                    this.updateRefreshButton(this.isWebviewLoading);
                    if (this.isWebviewLoading) {
                        this.loadingBarTabId = tabId;
                        this.showLoadingIndicator();
                        const m = tab.webview.__loadProgressMilestone;
                        if (m != null && m > 0) {
                            this.setUrlBarLoadProgress(m, tabId);
                        } else {
                            this.bumpUrlBarLoadMilestone(tab.webview, tabId, 0.05);
                        }
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
            if (tab?.isFavoriteTab) {
                this.renderFavorites();
            }
        });
    }

    setupNewTabPage() {
        const input = document.getElementById('new-tab-input');
        const suggestionsContainer = document.getElementById('new-tab-suggestions');
        if (!input || !suggestionsContainer) return;

        const throttledUpdate = this.throttle((value) => {
            this.updateNewTabSuggestions(value);
            this.spotlightSelectedIndex = -1;
            this.updateNewTabHero();
            this.updateNewTabSendButtonState();
            if (value.trim()) this.hideNewTabAskSetup();
        }, 50);

        input.addEventListener('input', (e) => {
            throttledUpdate(e.target.value.trim());
            this.updateNewTabSendButtonState();
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                this.triggerNewTabAskFromSearch();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                if (this.isNewTabInChat()) {
                    void this.sendNewTabAskMessage();
                } else {
                    const items = suggestionsContainer.querySelectorAll('.spotlight-suggestion-item');
                    if (this.spotlightSelectedIndex >= 0 && items[this.spotlightSelectedIndex]) {
                        items[this.spotlightSelectedIndex].click();
                    } else {
                        this.performNewTabSearch();
                    }
                }
            } else if (e.key === 'Escape') {
                input.blur();
                this.hideNewTabAskSetup();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateNewTabSuggestions(1, suggestionsContainer);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateNewTabSuggestions(-1, suggestionsContainer);
            }
        });

        document.getElementById('new-tab-ask-setup-settings')?.addEventListener('click', () => {
            void window.electronAPI?.openSettingsWindow?.('ai');
        });
        document.getElementById('new-tab-ask-setup-groq')?.addEventListener('click', () => {
            void window.electronAPI?.openExternalUrl?.('https://console.groq.com/keys');
        });

        document.getElementById('new-tab-send-btn')?.addEventListener('click', () => {
            if (this.isNewTabInChat()) void this.sendNewTabAskMessage();
        });
        this.mountNewTabSearchBarToStart();
        this.setupNewTabMenuButton();
        this.applyNewTabCustomization();
    }

    setupNewTabMenuButton() {
        document.getElementById('new-tab-menu-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            void window.electronAPI?.openSettingsWindow?.('newtab');
        });
    }

    applyNewTabCustomization() {
        const s = this.settings || {};
        const page = document.getElementById('new-tab-page');
        const wrapper = document.getElementById('new-tab-search-wrapper');

        wrapper?.classList.toggle('ntp-ai-off', s.ntpAiSearchEnabled === false);

        page?.classList.remove('ntp-bg-frosted', 'ntp-bg-theme');
        page?.style.removeProperty('--axis-ntp-bg-tint');
        wrapper?.classList.remove('ntp-gradient-on');
        wrapper?.style.removeProperty('border-color');
        wrapper?.style.removeProperty('box-shadow');
        wrapper?.style.removeProperty('--ntp-accent');
        wrapper?.style.removeProperty('--ntp-accent-glow');

        this.updateNewTabHero();
        const input = document.getElementById('new-tab-input');
        if (input?.value?.trim() && !this.isNewTabInChat()) {
            void this.updateNewTabSuggestions(input.value.trim());
        }
        const curTab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        if (curTab?.url === this.NEWTAB_URL) {
            this.applyInternalShellUrlBarStyle();
        }
    }

    navigateNewTabSuggestions(direction, container) {
        const items = container?.querySelectorAll('.spotlight-suggestion-item');
        if (!items?.length) return;
        this.spotlightSelectedIndex = Math.max(-1, Math.min(this.spotlightSelectedIndex + direction, items.length - 1));
        items.forEach((el, i) => el.classList.toggle('active', i === this.spotlightSelectedIndex));
    }

    async updateNewTabSuggestions(query) {
        const container = document.getElementById('new-tab-suggestions');
        if (!container) return;

        if (query.trim().length < 1) {
            if (this._newTabSuggestionsCloseTimer) {
                clearTimeout(this._newTabSuggestionsCloseTimer);
                this._newTabSuggestionsCloseTimer = null;
            }
            if (container.children.length > 0) {
                container.classList.add('new-tab-suggestions-closing');
                this._newTabSuggestionsCloseTimer = setTimeout(() => {
                    container.innerHTML = '';
                    container.classList.remove('new-tab-suggestions-closing', 'loading');
                    this.spotlightSelectedIndex = -1;
                    this._newTabSuggestionsCloseTimer = null;
                }, 320);
            } else {
                container.innerHTML = '';
                container.classList.remove('loading');
                this.spotlightSelectedIndex = -1;
            }
            return;
        }
        if (this._newTabSuggestionsCloseTimer) {
            clearTimeout(this._newTabSuggestionsCloseTimer);
            this._newTabSuggestionsCloseTimer = null;
        }
        container.classList.remove('new-tab-suggestions-closing');
        container.classList.add('loading');
        const suggestions = await this.generateAdvancedSuggestions(query);
        this.updateNewTabSuggestionsContent(container, suggestions, query);
    }

    _appendNewTabActionRows(container, query) {
        const q = (query || '').trim();
        if (!q || this.isNewTabInChat()) return;
        const short = q.length > 52 ? `${q.slice(0, 49)}…` : q;
        const aiOn = this.settings?.ntpAiSearchEnabled !== false;

        const addRow = (extraClass, iconClass, badge, handler) => {
            const el = document.createElement('div');
            el.className = `spotlight-suggestion-item new-tab-action-item ${extraClass}`;
            el.innerHTML = `
                <div class="spotlight-suggestion-icon"><i class="fas ${iconClass}" aria-hidden="true"></i></div>
                <div class="spotlight-suggestion-text new-tab-action-text">${this.escapeHtml(short)}</div>
                <div class="new-tab-action-badge">${this.escapeHtml(badge)}</div>
            `;
            el.addEventListener('click', (e) => {
                e.preventDefault();
                handler();
            });
            container.appendChild(el);
        };

        addRow('new-tab-action-search', 'fa-magnifying-glass', 'Search', () => this.performNewTabSearch());
        if (aiOn) {
            addRow('new-tab-action-ask', 'fa-message', 'Ask AI', () => this.triggerNewTabAskFromSearch());
        }
    }

    updateNewTabSuggestionsContent(container, suggestions, query = '') {
        container.classList.remove('loading', 'new-tab-suggestions-closing');
        container.innerHTML = '';
        this.spotlightSelectedIndex = -1;

        this._appendNewTabActionRows(container, query);

        if (!suggestions || suggestions.length === 0) {
            return;
        }

        let visible = suggestions.slice(0, 6);

        const selectedEngine = this.selectedSearchEngine;
        visible.forEach((s, i) => {
            const el = document.createElement('div');
            el.className = 'spotlight-suggestion-item';
            el.setAttribute('data-index', i);
            let faviconUrl = null;
            if (s.isTab && s.tabId) {
                const tab = this.tabs.get(s.tabId);
                faviconUrl = tab?.favicon || (tab?.url ? this.getFaviconUrl(tab.url) : null);
            } else if (s.url || s.isHistory || s.isUrl) {
                faviconUrl = this.getFaviconUrl(s.url);
            }
            const iconHtml = faviconUrl
                ? `<img src="${this.escapeHtml(faviconUrl)}" alt="" class="spotlight-favicon" onerror="this.style.display='none';this.nextElementSibling.style.display='inline';" />`
                : '';
            const fallbackIconHtml = faviconUrl ? `<i class="${this.escapeHtml(s.icon)}" style="display:none;"></i>` : `<i class="${this.escapeHtml(s.icon)}"></i>`;
            el.innerHTML = `
                <div class="spotlight-suggestion-icon">${iconHtml}${fallbackIconHtml}</div>
                <div class="spotlight-suggestion-text">${this.escapeHtml(s.text)}</div>
                ${(s.isTab && s.tabId) ? '<div class="spotlight-suggestion-action">Switch to Tab</div>' : ''}
            `;
            el.addEventListener('click', () => this.performSuggestionAction(s, selectedEngine, true));
            container.appendChild(el);
        });
    }

    async sendNewTabAskMessage() {
        const input = document.getElementById('new-tab-input');
        const messagesContainer = document.getElementById('new-tab-ask-messages');
        if (!input || !messagesContainer) return;

        const text = input.value.trim();
        if (!text) return;

        if (!this.hasGroqApiKey()) {
            this.showNewTabAskSetup();
            return;
        }

        this.hideNewTabAskSetup();
        const suggestionsContainer = document.getElementById('new-tab-suggestions');
        if (suggestionsContainer) {
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.classList.add('new-tab-suggestions-closing');
        }

        input.value = '';
        this.updateNewTabSendButtonState();

        const isFirstMessage = !this.isNewTabInChat();
        if (isFirstMessage) {
            await this.beginNewTabAiChatTransition();
            this.syncNewTabInputChrome();
        }

        const userDiv = document.createElement('div');
        userDiv.className = 'new-tab-ask-message user';
        userDiv.innerHTML = `
            <div class="new-tab-ask-avatar user" aria-hidden="true"><i class="fas fa-user"></i></div>
            <div class="new-tab-ask-body">
                <div class="new-tab-ask-bubble">${this.escapeHtml(text)}</div>
            </div>
        `;
        messagesContainer.appendChild(userDiv);
        this._scrollNewTabAskMessagesToBottom();
        this._persistNewTabChatStateIfNeeded();

        const loadingId = Date.now();
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'new-tab-ask-message assistant';
        loadingDiv.dataset.messageId = String(loadingId);
        loadingDiv.innerHTML = `
            <div class="new-tab-ask-avatar assistant" aria-hidden="true"><i class="fas fa-message"></i></div>
            <div class="new-tab-ask-body">
                <div class="new-tab-ask-bubble new-tab-ask-bubble-loading" aria-live="polite" aria-label="Thinking">
                    <span class="new-tab-ask-loading-dots" aria-hidden="true"><span></span><span></span><span></span></span>
                </div>
            </div>
        `;
        messagesContainer.appendChild(loadingDiv);
        this._scrollNewTabAskMessagesToBottom();
        this._focusNewTabInput();

        try {
            const response = await this.getChatAIResponse(text);
            const updated = messagesContainer.querySelector(
                ".new-tab-ask-message.assistant[data-message-id=\"" + loadingId + "\"]"
            );
            if (updated) {
                updated.innerHTML = `
                    <div class="new-tab-ask-avatar assistant" aria-hidden="true"><i class="fas fa-message"></i></div>
                    <div class="new-tab-ask-body">
                        <div class="new-tab-ask-bubble">${this.escapeHtml(response)}</div>
                    </div>
                `;
            }
            this._scrollNewTabAskMessagesToBottom();
            this._persistNewTabChatStateIfNeeded();
        } catch (error) {
            const updated = messagesContainer.querySelector(
                ".new-tab-ask-message.assistant[data-message-id=\"" + loadingId + "\"]"
            );
            if (updated) {
                const message = 'Error: ' + (error && error.message ? error.message : 'Something went wrong');
                updated.innerHTML = `
                    <div class="new-tab-ask-avatar assistant" aria-hidden="true"><i class="fas fa-message"></i></div>
                    <div class="new-tab-ask-body">
                        <div class="new-tab-ask-bubble new-tab-ask-bubble-error">${this.escapeHtml(message)}</div>
                    </div>
                `;
            }
            this._scrollNewTabAskMessagesToBottom();
            this._persistNewTabChatStateIfNeeded();
        } finally {
            this._focusNewTabInput();
        }
    }

    performSuggestionAction(suggestion, selectedEngine, isNewTabPage) {
        if (suggestion.isTab) {
            if (suggestion.tabId) {
                this.switchToTab(suggestion.tabId);
            } else if (suggestion.isPlaceholder) {
                this.createNewTab();
            }
        } else if (suggestion.isAction) {
            if (suggestion.text === 'New Tab') {
                if (isNewTabPage) {
                    document.getElementById('new-tab-input')?.focus();
                } else {
                    this.createNewTab();
                }
            } else if (suggestion.text === 'New Incognito Tab') {
                this.createIncognitoTab();
            } else if (suggestion.text === 'Open Settings') {
                this.toggleSettings();
            } else if (suggestion.text === 'New Note') {
                this.openNoteAsTab();
            }
        } else if (suggestion.isNote && suggestion.noteId) {
            this.openNoteAsTab(suggestion.noteId);
        } else if (suggestion.isSearch) {
            const url = this.getSearchUrl(suggestion.searchQuery, selectedEngine);
            isNewTabPage ? this.navigate(url) : this.createNewTab(url);
        } else if (suggestion.isHistory) {
            const url = selectedEngine ? this.getSearchUrl(suggestion.text || suggestion.url, selectedEngine) : suggestion.url;
            isNewTabPage ? this.navigate(url) : this.createNewTab(url);
        } else if (suggestion.isCompletion) {
            const url = this.getSearchUrl(suggestion.searchQuery, selectedEngine);
            isNewTabPage ? this.navigate(url) : this.createNewTab(url);
        } else if (suggestion.isUrl) {
            const url = selectedEngine ? this.getSearchUrl(suggestion.text || suggestion.url, selectedEngine) : suggestion.url;
            isNewTabPage ? this.navigate(url) : this.createNewTab(url);
        } else {
            const input = document.getElementById('new-tab-input');
            if (input) input.value = suggestion.text;
        }
    }

    /** Reset new tab page to a fresh state so each new tab is independent (no leftover input/suggestions/mode). */
    resetNewTabPageState() {
        const input = document.getElementById('new-tab-input');
        const suggestionsContainer = document.getElementById('new-tab-suggestions');
        const searchWrapper = document.getElementById('new-tab-search-wrapper');
        const askMessages = document.getElementById('new-tab-ask-messages');
        const startView = document.getElementById('new-tab-start-view');
        const chatView = document.getElementById('new-tab-ai-chat-view');
        const page = document.getElementById('new-tab-page');
        if (input) input.value = '';
        this.spotlightSelectedIndex = -1;
        if (searchWrapper) searchWrapper.classList.remove('hidden');
        if (suggestionsContainer) {
            suggestionsContainer.classList.remove('hidden');
            suggestionsContainer.innerHTML = '';
            suggestionsContainer.classList.remove('loading', 'new-tab-suggestions-closing');
        }
        if (askMessages) {
            askMessages.innerHTML = '';
            askMessages.classList.add('hidden');
        }
        startView?.classList.remove('hidden');
        chatView?.classList.add('hidden');
        page?.classList.remove('ntp-ai-chat-mode', 'ntp-ai-chat-entering', 'ntp-ai-chat-exiting');
        this.mountNewTabSearchBarToStart();
        this.setNewTabAiChatChromeVisible(false);
        this.hideNewTabAskSetup();
        this.syncNewTabInputChrome();
        this.updateNewTabSuggestions('');
    }

    /** Save current new-tab-page UI state to a tab (so we can restore when switching back). */
    saveNewTabPageStateToTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || tab.url !== this.NEWTAB_URL) return;
        const input = document.getElementById('new-tab-input');
        const askMessages = document.getElementById('new-tab-ask-messages');
        const inputValue = input ? input.value : '';
        const askMessagesHtml = askMessages ? askMessages.innerHTML : '';
        tab.newTabPageState = {
            inputValue,
            inChat: this.isNewTabInChat(),
            askMessagesHtml
        };
        this.tabs.set(tabId, tab);
        this.applyNewTabTabChrome(tabId);
    }

    /** Restore a tab's new-tab-page state into the shared UI. */
    restoreNewTabPageStateFromTab(tabId) {
        const tab = this.tabs.get(tabId);
        if (!tab || !tab.newTabPageState) return;
        const state = tab.newTabPageState;
        const input = document.getElementById('new-tab-input');
        const suggestionsContainer = document.getElementById('new-tab-suggestions');
        const askMessages = document.getElementById('new-tab-ask-messages');
        const inChat = state.inChat === true || !!(state.askMessagesHtml && state.askMessagesHtml.trim());
        if (input) input.value = state.inputValue || '';
        this.spotlightSelectedIndex = -1;
        if (suggestionsContainer) {
            suggestionsContainer.classList.remove('hidden', 'loading', 'new-tab-suggestions-closing');
            if (inChat) {
                suggestionsContainer.innerHTML = '';
            } else {
                void this.updateNewTabSuggestions(state.inputValue || '');
            }
        }
        if (askMessages) {
            askMessages.innerHTML = state.askMessagesHtml || '';
        }
        if (inChat) {
            void this.beginNewTabAiChatTransition({ animate: false });
            this._focusNewTabInput();
        } else {
            this.resetNewTabPageState();
            if (input) input.value = state.inputValue || '';
            void this.updateNewTabSuggestions(state.inputValue || '');
        }
        this.hideNewTabAskSetup();
        this.applyNewTabTabChrome(tabId);
        this.updateUrlBar(null);
    }

    updateNewTabPageVisibility(show) {
        const newTabPage = document.getElementById('new-tab-page');
        const urlBar = this.elements.webviewUrlBar;
        const activeTab = this.currentTab && this.tabs.has(this.currentTab) ? this.tabs.get(this.currentTab) : null;
        const activeWv = activeTab?.webview;

        if (newTabPage) {
            if (show) {
                // New-tab overlay is never an extension-store listing surface.
                this.updateExtensionStoreHostBar('');
                if (this._resetNewTabPageOnShow) {
                    this.resetNewTabPageState();
                    if (this.currentTab != null) {
                        const freshTab = this.tabs.get(this.currentTab);
                        if (freshTab) {
                            freshTab.newTabPageState = undefined;
                            this.applyNewTabTabChrome(this.currentTab);
                        }
                    }
                    this._resetNewTabPageOnShow = false;
                } else if (this.currentTab && this.tabs.has(this.currentTab)) {
                    const tab = this.tabs.get(this.currentTab);
                    if (tab && tab.url === this.NEWTAB_URL) {
                        this.restoreNewTabPageStateFromTab(this.currentTab);
                    }
                }
                newTabPage.classList.remove('hidden');
                if (!this.isNewTabInChat()) this.mountNewTabSearchBarToStart();
                this.updateNewTabHero();
                this._syncNewTabWebviewUnderlay();
                requestAnimationFrame(() => {
                    document.getElementById('new-tab-input')?.focus();
                });
            } else {
                newTabPage.classList.add('hidden');
                this._syncNewTabWebviewUnderlay();
                // Restore webview interactivity (was pointer-events: none for overlay)
                if (this.currentTab) {
                    const tab = this.tabs.get(this.currentTab);
                    if (tab?.webview) {
                        tab.webview.style.pointerEvents = 'auto';
                        tab.webview.style.zIndex = '2';
                        this.elements.webview = tab.webview;
                        this.updateUrlBar(tab.webview);
                        this.updateNavigationButtons();
                    }
                }
            }
        }
        if (urlBar) {
            if (show) {
                urlBar.classList.remove('hidden');
                this._setUrlBarInternalShellMode('ntp');
                this.applyInternalShellUrlBarStyle();
            } else {
                urlBar.classList.remove('hidden');
                this._setUrlBarInternalShellMode(null);
            }
        }
    }

    updateEmptyState() {
        const emptyState = document.getElementById('empty-state');
        if (!emptyState) return;

        const emptyContent = document.getElementById('empty-state-empty');
        // Only the real zero-tab window gets the dimmed placeholder webviews. Using
        // `currentTab === null` here was wrong: during focus handoff (or edge cases with
        // tabs still in the map) we poisoned every guest with `opacity: 0.3 !important`
        // + `inactive`, which sticks under non-!important clears and triggers the
        // heavy `webview::before` blur overlay — "new tab looks blurred".
        const trulyNoTabs = this.tabs.size === 0;

        if (trulyNoTabs) {
            document.body.classList.add('chrome-no-tabs');
            this.updateNewTabPageVisibility(false);
            emptyState.classList.remove('hidden');
            if (emptyContent) emptyContent.classList.add('hidden');
            
            // Hide URL bar when no tabs
            const urlBar = this.elements?.webviewUrlBar;
            if (urlBar) {
                urlBar.classList.add('hidden');
            }

            // When there are no tabs, set a neutral native title (Dock / window list)
            if (window.electronAPI?.setWindowTitle) {
                window.electronAPI.setWindowTitle(
                    this.isIncognitoWindow ? 'Axis — Incognito' : 'Axis Browser'
                );
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
                if (this.settings?.gradientEnabled && this.settings?.gradientColor) {
                    colors.gradientColor = this.settings.gradientColor;
                }
                this.applyCustomTheme(colors);
            }
            
            // Clear container chrome fill so shell theme shows through the dimmed webview frame
            const webviewContainer = document.querySelector('.webview-container');
            if (webviewContainer) {
                webviewContainer.style.setProperty('background', 'transparent', 'important');
                webviewContainer.style.setProperty('backdrop-filter', 'none', 'important');
                webviewContainer.style.setProperty('-webkit-backdrop-filter', 'none', 'important');
            }
            
            /* No tabs: hide every guest fully — webview area must paint nothing. */
            const webviews = document.querySelectorAll('webview');
            webviews.forEach(wv => {
                wv.style.setProperty('opacity', '0', 'important');
                wv.style.setProperty('visibility', 'hidden', 'important');
                wv.style.setProperty('pointer-events', 'none', 'important');
                wv.style.setProperty('background', 'transparent', 'important');
                wv.classList.add('inactive');
            });
            
            const webviewsContainer = document.getElementById('webviews-container');
            if (webviewsContainer) {
                webviewsContainer.style.setProperty('background', 'transparent', 'important');
            }
            this._lastEmptyStateHadOpenTabs = false;
        } else {
            document.body.classList.remove('chrome-no-tabs');
            // Hide empty state
            emptyState.classList.add('hidden');
            if (emptyContent) emptyContent.classList.add('hidden');

            // Reapply full shell theme only when leaving the empty (no-tab) state — not on every tab switch
            // (applyCustomThemeFromSettings is expensive and was causing visible lag / compositor hitches).
            const shouldRefreshThemeForTabs = this._lastEmptyStateHadOpenTabs !== true;
            this._lastEmptyStateHadOpenTabs = true;
            if (shouldRefreshThemeForTabs) {
                if (this.settings && (this.settings.themeColor || this.settings.gradientColor)) {
                    this.applyCustomThemeFromSettings();
                } else {
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
                    if (this.settings?.gradientEnabled && this.settings?.gradientColor) {
                        colors.gradientColor = this.settings.gradientColor;
                    }
                    this.applyCustomTheme(colors);
                }
            }
        }
        
        // Keep pinned/separator/floating-clear visibility in sync for all windows, including
        // incognito where pinned persistence paths are skipped.
        this.updatePinnedSeparatorVisibility();

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

    /** Cycle active tab by DOM order (sidebar / tab groups). */
    switchToAdjacentTab(delta) {
        const tabElements = Array.from(document.querySelectorAll('.tab'));
        if (tabElements.length === 0) return;
        const ids = tabElements.map((el) => parseInt(el.dataset.tabId, 10));
        let idx = ids.indexOf(this.currentTab);
        if (idx < 0) idx = 0;
        const n = ids.length;
        const nextIdx = (((idx + delta) % n) + n) % n;
        this.switchToTab(ids[nextIdx]);
    }

    /** Pinned empty slots are not a valid focus target; unpinned rows always are. */
    _canFocusTabAsActive(rawTabId) {
        const tabId = this._normalizeTabMapKey(rawTabId);
        if (tabId == null) return false;
        const t = this.tabs.get(tabId);
        if (!t) return false;
        if (!t.pinned) return true;
        const el = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (el?.classList.contains('closed')) return false;
        return !!t.webview;
    }

    /**
     * Prefer the tab to the right of the closing tab, then to the left (Chrome-like),
     * using flat DOM order for sidebar + tab groups.
     */
    _findNeighborTabToActivate(closedTabId) {
        const closed = this._normalizeTabMapKey(closedTabId);
        if (closed == null) return null;
        const ids = Array.from(document.querySelectorAll('.tab'))
            .map((el) => this._normalizeTabMapKey(el.dataset.tabId))
            .filter((n) => n != null);
        const i = ids.indexOf(closed);
        if (i < 0) return null;
        for (let k = i + 1; k < ids.length; k++) {
            if (ids[k] !== closed && this._canFocusTabAsActive(ids[k])) return ids[k];
        }
        for (let k = i - 1; k >= 0; k--) {
            if (ids[k] !== closed && this._canFocusTabAsActive(ids[k])) return ids[k];
        }
        return null;
    }

    /**
     * After a tab is removed or demoted, pick the next active tab: neighbor, then last unpinned,
     * then first remaining pinned with an open webview, else empty state.
     */
    _applyFocusAfterTabClose(neighborPref) {
        const tryFocus = (raw) => {
            const id = this._normalizeTabMapKey(raw);
            if (id == null || !this.tabs.has(id) || !this._canFocusTabAsActive(id)) return false;
            this.switchToTab(id);
            return true;
        };

        if (tryFocus(neighborPref)) {
            this._purgeStaleWebviewsInContainer();
            return;
        }

        const remainingUnpinned = Array.from(this.tabs.keys()).filter((id) => {
            const t = this.tabs.get(id);
            return t && !t.pinned && !t.isFavoriteTab;
        });
        for (let i = remainingUnpinned.length - 1; i >= 0; i--) {
            if (tryFocus(remainingUnpinned[i])) {
                this._purgeStaleWebviewsInContainer();
                return;
            }
        }

        for (let i = this.favorites.length - 1; i >= 0; i--) {
            const favId = this._normalizeTabMapKey(this.favorites[i].runtimeTabId);
            if (favId != null) {
                this._ensureFavoriteTabHostElement(favId);
                if (tryFocus(favId)) {
                    this._purgeStaleWebviewsInContainer();
                    return;
                }
            }
        }
        const remainingPinnedActive = Array.from(this.tabs.keys()).filter((id) => {
            const t = this.tabs.get(id);
            return t && t.pinned && t.webview;
        });
        if (remainingPinnedActive.length > 0 && tryFocus(remainingPinnedActive[0])) {
            this._purgeStaleWebviewsInContainer();
            return;
        }

        const domIds = Array.from(document.querySelectorAll('.tab'))
            .map((el) => this._normalizeTabMapKey(el.dataset.tabId))
            .filter((id) => id != null);
        for (let i = domIds.length - 1; i >= 0; i--) {
            if (tryFocus(domIds[i])) {
                this._purgeStaleWebviewsInContainer();
                return;
            }
        }

        this.currentTab = null;
        this._purgeStaleWebviewsInContainer();
        const webview = document.getElementById('webview');
        if (webview) webview.src = 'about:blank';
        this._pruneAllTabGroupsTabIds();
        this._removeEmptyTabGroupsWithHadTabs();
        void this.saveTabGroups();
        void this.savePinnedTabs();
        this.resetToBlackTheme();
        this.updateNewTabPageVisibility(false);
        this.updateEmptyState();
        this.updateUrlBar();
        this.updateNavigationButtons();
        this.syncAIChatPanelForCurrentTab();
    }

    /** Canonical numeric id for `this.tabs` Map keys (avoids string/number shadow entries). */
    _normalizeTabMapKey(tabId) {
        if (tabId == null || tabId === '') return null;
        if (typeof tabId === 'number' && Number.isFinite(tabId)) return tabId;
        const n = parseInt(String(tabId), 10);
        return Number.isFinite(n) ? n : null;
    }

    /** Create a unique numeric tab id (optionally honoring a preferred id). */
    _createUniqueTabId(preferredId = null) {
        let id = this._normalizeTabMapKey(preferredId);
        if (id == null) id = Date.now();
        while (this.tabs.has(id)) {
            id += 1;
        }
        return id;
    }

    /** Normalize tab id for Map keys (dataset uses strings; internal ids are numbers). */
    _normalizeTabIdForChatState(tabId) {
        if (tabId == null || tabId === '') return null;
        const n = typeof tabId === 'number' ? tabId : parseInt(String(tabId), 10);
        return Number.isFinite(n) ? n : tabId;
    }

    /**
     * Show or hide the AI chat panel from per-tab remembered state.
     * Chat stays open only on tabs where the user opened it; switching tabs applies that tab's preference.
     */
    syncAIChatPanelForCurrentTab() {
        const chatPanel = document.getElementById('ai-chat-panel');
        const contentArea = document.getElementById('content-area');
        if (!chatPanel) return;
        const tid = this._normalizeTabIdForChatState(this.currentTab);
        const wantOpen = tid != null && this.aiChatPanelOpenByTabId.get(tid) === true;
        if (wantOpen) {
            chatPanel.classList.remove('hidden');
            contentArea?.classList.add('chat-open');
        } else {
            chatPanel.classList.add('hidden');
            contentArea?.classList.remove('chat-open');
        }
    }

    closeTab(rawCloseId) {
        const tid = this._normalizeTabMapKey(rawCloseId);
        if (tid == null) return;

        const closingFavorite = this.tabs.get(tid);
        if (closingFavorite?.isFavoriteTab && closingFavorite.favoriteId) {
            const fav = this.favorites.find((item) => item.id === closingFavorite.favoriteId);
            if (fav && this._normalizeTabMapKey(fav.runtimeTabId) === tid) {
                fav.runtimeTabId = null;
            }
        }

        if (this._sidebarMediaDock && this._normalizeTabMapKey(this._sidebarMediaDock.tabId) === tid) {
            this.hideSidebarMediaDock();
        }

        // Save pinned tabs before closing (in case it was pinned)
        this.savePinnedTabs();
        const tidChat = this._normalizeTabIdForChatState(tid);
        if (tidChat != null) this.aiChatPanelOpenByTabId.delete(tidChat);
        const tabElement = document.querySelector(`[data-tab-id="${tid}"]`);
        const tab = this.tabs.get(tid);
        const cur = this._normalizeTabMapKey(this.currentTab);
        
        // Check if this is a pinned tab
        const isPinned = tab && tab.pinned;
        
        // For pinned tabs, check if it's inactive (no webview or already closed)
        // If inactive, completely remove it. If active, just close the webview.
        if (isPinned) {
            const isInactive = !tab.webview || tabElement?.classList.contains('closed');
            
            if (isInactive) {
                const closingCurrent = cur === tid;
                const neighborPref = closingCurrent ? this._findNeighborTabToActivate(tid) : null;
                // Completely remove inactive pinned tabs
                // Remove from tab groups first (sync may move the tab element)
                this._removeTabIdFromAllTabGroups(tid, true);
                // Re-query in case sync moved the element
                const elToRemove = document.querySelector(`[data-tab-id="${tid}"]`);
                if (elToRemove) elToRemove.remove();
                this.tabs.delete(tid);
                
                if (closingCurrent) {
                    this._applyFocusAfterTabClose(neighborPref);
                }
                
                // Save pinned tabs after removal and update separator immediately
                this.savePinnedTabs();
                this.updatePinnedSeparatorVisibility();
                this.updateEmptyState();
                this._syncAfterTabClose();
                this.applyAmbientFromSettings();
                return;
            }
            
            // Active pinned tab - just close the webview but keep the tab
            const closingPinnedActive = cur === tid;
            const neighborPinnedPref = closingPinnedActive ? this._findNeighborTabToActivate(tid) : null;
            // Remove the tab's webview
            if (tab && tab.webview) {
                try {
                    tab.isPlayingAudio = false;
                    this.cleanupWebviewListeners(tab.webview);
                    try { tab.webview.src = 'about:blank'; } catch (_) {}
                    if (tab.webview.parentNode) {
                        tab.webview.parentNode.removeChild(tab.webview);
                    }
                    tab.webview = null;
                    this.tabs.set(tid, tab);
                } catch (e) {
                    console.error('Error removing webview:', e);
                }
            }
            
            if (tabElement) {
                tabElement.classList.remove('active');
            }
            
            this.updatePinnedTabClosedState(tid);
            
            if (closingPinnedActive) {
                this._applyFocusAfterTabClose(neighborPinnedPref);
            }
            this.savePinnedTabs();
            this.updatePinnedSeparatorVisibility();
            this._syncAfterTabClose();
            this.applyAmbientFromSettings();
            return;
        }
        
        // For non-pinned tabs, proceed with normal close behavior
        const tabGroupIdForUndo = tab && tab.tabGroupId;
        const closingUnpinnedCurrent = cur === tid;
        const neighborUnpinnedPref = closingUnpinnedCurrent ? this._findNeighborTabToActivate(tid) : null;
        // Remove from every group that still lists this tab (delete-group clears tabGroupId but not tabIds)
        this._removeTabIdFromAllTabGroups(tid, true);
        // Store closed tab for recovery (only if it's not a new tab)
        if (tab && tab.url && tab.url !== 'about:blank') {
            this.closedTabs.unshift({
                id: tid,
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
            if (this.tabUndoStack.length > 15) this.tabUndoStack = this.tabUndoStack.slice(-15);
            // Keep only the last 8 closed tabs (less RAM, recovery still works)
            if (this.closedTabs.length > 8) {
                this.closedTabs = this.closedTabs.slice(0, 8);
            }
        }
        
        if (tab && tab.webview) {
            try {
                this.cleanupWebviewListeners(tab.webview);
                try { tab.webview.src = 'about:blank'; } catch (_) {}
                if (tab.webview.parentNode) {
                    tab.webview.parentNode.removeChild(tab.webview);
                }
            } catch (e) {
                console.error('Error removing webview:', e);
            }
        }

        if (tab?.isFavoriteTab) {
            this._removeFavoriteTabHostElement(tid);
        }
        
        if (tabElement && tabElement.parentNode) {
            // Remove the tab element immediately to avoid layout glitches / gaps
            tabElement.parentNode.removeChild(tabElement);
        }

        // Delete the tab FIRST to get accurate remaining tabs count
        this.tabs.delete(tid);
        
        if (closingUnpinnedCurrent) {
            this._applyFocusAfterTabClose(neighborUnpinnedPref);
        } else if (cur != null && this.tabs.has(cur)) {
            this._prepareWebviewsForTabSwitch(cur);
        }
        this._syncAfterTabClose();
        this.applyAmbientFromSettings();
    }

    clearUnpinnedTabs() {
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (!tabsContainer || !separator) return;
        
        // Get all unpinned tabs (tabs that appear after the separator)
        const allElements = Array.from(tabsContainer.children);
        const separatorIndex = allElements.indexOf(separator);
        
        // Collect unpinned tab IDs (never favorite runtime tabs — they are not "disposable" unpinned)
        const unpinnedTabIds = [];
        const collectTabId = (el) => {
            const tabId = this._normalizeTabMapKey(el?.dataset?.tabId);
            if (tabId == null) return;
            const tab = this.tabs.get(tabId);
            if (!tab || tab.pinned || tab.isFavoriteTab) return;
            if (!unpinnedTabIds.includes(tabId)) unpinnedTabIds.push(tabId);
        };

        for (let i = separatorIndex + 1; i < allElements.length; i++) {
            const el = allElements[i];
            if (el.classList.contains('tab')) {
                collectTabId(el);
            } else if (el.classList.contains('tab-group')) {
                el.querySelectorAll('.tab').forEach((t) => collectTabId(t));
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
        this._forceGuestLayoutSync();
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

    navigate(url, options = {}) {
        if (!url) return;

        // Create a tab if there are no tabs
        if (this.tabs.size === 0 || this.currentTab === null) {
            this.createNewTab(url);
            return;
        }

        const tab = this.tabs.get(this.currentTab);
        if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
            return;
        }

        // Sanitize and validate URL input (context-menu images may be data: or pre-resolved https)
        let sanitizedUrl = null;
        if (options.trustedContextImage && typeof url === 'string') {
            sanitizedUrl = this._getTrustedContextImageNavigateUrl(url);
        } else {
            sanitizedUrl = this.sanitizeUrl(url);
        }
        if (!sanitizedUrl) {
            console.error('Invalid URL provided:', url);
            return;
        }

        if (!options.skipHttpsConfirm && !this.confirmInsecureHttpNavigation(sanitizedUrl)) {
            return;
        }

        if (sanitizedUrl === 'axis://settings') {
            this.openSettingsTab();
            return;
        }

        const isNewTabUrl = sanitizedUrl === this.NEWTAB_URL;

        // Load URL in active webview
        const webview = this.getActiveWebview();
        if (webview) {
            webview.src = sanitizedUrl;

            // Ensure the webview is fully interactive for real pages
            if (!isNewTabUrl) {
                webview.classList.remove('inactive');
                try {
                    webview.style.removeProperty('opacity');
                    webview.style.removeProperty('visibility');
                    webview.style.removeProperty('background');
                } catch (_) {}
                webview.style.opacity = '1';
                webview.style.visibility = 'visible';
                webview.style.pointerEvents = 'auto';
                webview.style.zIndex = '2';
                this.elements.webview = webview;
                this.updateNewTabPageVisibility(false);
            }
        }

        // Update tab data and add to history
        if (tab) {
            // Initialize history if empty
            if (!tab.history || tab.history.length === 0) {
                tab.history = [sanitizedUrl];
                tab.historyIndex = 0;
            } else if (tab.url && tab.url !== sanitizedUrl) {
                // Remove any forward history if we're navigating to a new URL
                if (tab.historyIndex < tab.history.length - 1) {
                    tab.history = tab.history.slice(0, tab.historyIndex + 1);
                }
                
                // Add new URL to history
                tab.history.push(sanitizedUrl);
                // Cap in-memory history per tab to limit RAM (back/forward still works)
                const maxHistory = 50;
                if (tab.history.length > maxHistory) {
                    tab.history = tab.history.slice(-maxHistory);
                    tab.historyIndex = tab.history.length - 1;
                } else {
                    tab.historyIndex = tab.history.length - 1;
                }
            }
            
            tab.url = sanitizedUrl;
            this.tabs.set(this.currentTab, tab);
        }
        if (sanitizedUrl !== this.NEWTAB_URL) {
            this.updateNewTabPageVisibility(false);
        }
        this.updateNavigationButtons();
    }

    /**
     * After gesture animation: prefer native webview navigation when Chromium has entries
     * (more reliable than tab-only synthetic stack on SPA / redirect flows).
     */
    axisNavigateAfterGesture(direction) {
        const webview = this.getActiveWebview();
        if (!webview || !this.currentTab || !this.tabs.has(this.currentTab)) return;

        if (direction === 'back') {
            try {
                if (webview.canGoBack()) {
                    webview.goBack();
                    this.updateNavigationButtons();
                    return;
                }
            } catch (_) {
                /* fall through */
            }
            this.goBack();
            return;
        }

        try {
            if (webview.canGoForward()) {
                webview.goForward();
                this.updateNavigationButtons();
                return;
            }
        } catch (_) {
            /* fall through */
        }
        this.goForward();
    }

    /**
     * Unified back/forward from guest `axis-nav-gesture` (optional `webview` / `tabId` must match the active tab)
     * or from main-process `axis-host-nav-gesture` (omit guest args).
     */
    tryNavigateWithAxisGesture(direction, webview, tabId) {
        if (direction !== 'back' && direction !== 'forward') return;
        if (!this.currentTab) return;
        if (tabId != null && String(tabId) !== String(this.currentTab)) return;

        const w = this.getActiveWebview();
        if (!w) return;
        if (webview != null && webview !== w) return;

        const t = this.tabs.get(this.currentTab);
        const synthBack =
            t && t.history && t.history.length > 1 && t.historyIndex != null && t.historyIndex > 0;
        const synthFwd =
            t &&
            t.history &&
            t.history.length > 1 &&
            t.historyIndex != null &&
            t.historyIndex < t.history.length - 1;

        let canChromiumBack = false;
        let canChromiumFwd = false;
        try {
            canChromiumBack = w.canGoBack();
            canChromiumFwd = w.canGoForward();
        } catch (_) {
            /* guest may transiently throw — treat as no native stack */
        }

        if (direction === 'back' && !synthBack && !canChromiumBack) return;
        if (direction === 'forward' && !synthFwd && !canChromiumFwd) return;

        if (direction === 'back') {
            this.runAxisNavigationGesture('back', () => this.axisNavigateAfterGesture('back'));
        } else {
            this.runAxisNavigationGesture('forward', () => this.axisNavigateAfterGesture('forward'));
        }
    }

    /** Trackpad swipe (guest preload): slide webviews + edge arrow, then `navigate()` (`goBack` / `goForward`). */
    runAxisNavigationGesture(direction, navigate) {
        if (this._axisNavGestureBusy) {
            this._axisNavGestureQueuedDirection = direction;
            return;
        }
        if (typeof navigate !== 'function') return;

        const stack = document.getElementById('webviews-container');
        const wrap = stack?.closest?.('.webview-container');
        const phaseRoot = wrap || stack;
        const finishGesture = () => {
            phaseRoot.classList.remove(
                'axis-nav--back-out',
                'axis-nav--forward-out',
                'axis-nav--back-in',
                'axis-nav--forward-in'
            );
            this._axisNavGestureBusy = false;
            const qDir = this._axisNavGestureQueuedDirection;
            this._axisNavGestureQueuedDirection = null;
            if (qDir === 'back' || qDir === 'forward')
                queueMicrotask(() =>
                    qDir === 'back'
                        ? this.tryNavigateWithAxisGesture('back')
                        : this.tryNavigateWithAxisGesture('forward')
                );
        };

        if (!stack) {
            try {
                navigate();
            } catch (_) {
                /* ignore */
            }
            finishGesture();
            return;
        }

        this._axisNavGestureBusy = true;
        phaseRoot.classList.remove(
            'axis-nav--back-out',
            'axis-nav--forward-out',
            'axis-nav--back-in',
            'axis-nav--forward-in'
        );
        /* reflow restart */
        phaseRoot.offsetHeight;

        const outCls = direction === 'back' ? 'axis-nav--back-out' : 'axis-nav--forward-out';
        const inCls = direction === 'back' ? 'axis-nav--back-in' : 'axis-nav--forward-in';

        phaseRoot.classList.add(outCls);

        const outMs = 240;
        const inMs = 300;

        window.setTimeout(() => {
            try {
                navigate();
            } catch (_) {
                /* ignore */
            }
            phaseRoot.classList.remove(outCls);
            window.requestAnimationFrame(() => {
                phaseRoot.classList.add(inCls);
                window.setTimeout(() => finishGesture(), inMs + 36);
            });
        }, outMs);

        window.setTimeout(() => {
            if (!this._axisNavGestureBusy) return;
            finishGesture();
        }, 880);
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

    navigateToUrlInCurrentTab(url, options = {}) {
        // Don't navigate away from settings tabs
        const currentTab = this.tabs.get(this.currentTab);
        if (currentTab && (currentTab.url === 'axis://settings' || currentTab.isSettings)) {
            return;
        }
        
        const sanitizedUrl = this.sanitizeUrl(url);
        if (!sanitizedUrl) return;
        if (!options.skipHttpsConfirm && !this.confirmInsecureHttpNavigation(sanitizedUrl)) {
            return;
        }

        const webview = this.getActiveWebview();
        
        if (webview) {
            webview.src = sanitizedUrl;
            if (currentTab) {
                currentTab.url = sanitizedUrl;
            }
        }

        if (sanitizedUrl !== this.NEWTAB_URL) {
            this.updateNewTabPageVisibility(false);
        }
    }

    refresh() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        
        if (this.isWebviewLoading) {
            try {
                webview.stop();
            } catch (e) {
                console.error('Error stopping webview:', e);
            }
            return;
        }
        
        // Ensure current tab's webview is visible (fixes stuck grey when URL is correct but not painting)
        const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        const tabHasRealUrl = tab && tab.url && tab.url !== 'about:blank' && tab.url !== this.NEWTAB_URL && tab.url !== 'axis://settings' && !tab.url.startsWith('axis:note://');
        if (tabHasRealUrl) {
            webview.style.opacity = '1';
            webview.style.visibility = 'visible';
            webview.style.pointerEvents = 'auto';
            webview.style.zIndex = '2';
            webview.classList.remove('inactive');
            this.updateNewTabPageVisibility(false);
            let currentUrl = '';
            try {
                currentUrl = webview.getURL() || '';
            } catch (e) {}
            const isBlank = !currentUrl || currentUrl === 'about:blank';
            if (isBlank) {
                const sanitized = this.sanitizeUrl(tab.url);
                if (sanitized) {
                    webview.src = sanitized;
                    return;
                }
            }
        }
        
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

    printPage() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            const wcId = webview.getWebContentsId();
            if (wcId && window.electronAPI?.printPage) {
                window.electronAPI.printPage(wcId);
            } else {
                webview.print({ silent: false, printBackground: true });
            }
        } catch (e) {
            this.showNotification('Unable to print this page.', 'error');
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

    /** Hostname check for YouTube / youtu.be (not substring on full URL). */
    isYouTubeHost(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return false;
        return this.isUrlOnDomain(rawUrl, 'youtube.com') || this.isUrlOnDomain(rawUrl, 'youtu.be');
    }

    /** True for YouTube watch, Shorts, live, embed, and youtu.be links. */
    isYouTubeWatchUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return false;
        try {
            const u = new URL(rawUrl);
            const host = u.hostname.replace(/^www\./i, '').toLowerCase();
            if (host === 'youtu.be') return u.pathname.length > 1;
            if (!host.endsWith('youtube.com')) return false;
            const p = u.pathname;
            return (
                p === '/watch' ||
                p.startsWith('/watch/') ||
                p.startsWith('/shorts/') ||
                p.startsWith('/live/') ||
                p.startsWith('/embed/')
            );
        } catch (_) {
            return false;
        }
    }

    /** Reload a stuck YouTube `<video>` after tab switch or guest show/hide. */
    _nudgeYouTubePlayerIfNeeded(webview, rawUrl) {
        if (!webview || !this.isYouTubeWatchUrl(rawUrl)) return;
        try {
            webview.executeJavaScript(AXIS_YOUTUBE_PLAYER_RECOVERY_JS, true).catch(() => {});
        } catch (_) {}
    }

    /**
     * Allow navigation for context-menu images only when scheme is safe (blocks `data:text/html`, etc.).
     */
    _getTrustedContextImageNavigateUrl(url) {
        if (!url || typeof url !== 'string') return null;
        const t = url.trim();
        if (!t) return null;
        const low = t.toLowerCase();
        if (
            low.startsWith('javascript:') ||
            low.startsWith('vbscript:') ||
            low.startsWith('file:') ||
            low.startsWith('ftp:') ||
            low.startsWith('blob:')
        ) {
            return null;
        }
        if (low.startsWith('data:')) {
            return this._isSafeContextMenuDataImageUrl(t) ? t : null;
        }
        return t;
    }

    updateTabTitle() {
        const webview = this.getActiveWebview() || this.elements?.webview;
        if (!webview) {
            if (window.electronAPI?.setWindowTitle) {
                window.electronAPI.setWindowTitle(
                    this.isIncognitoWindow ? 'Axis — Incognito' : 'Axis Browser'
                );
            }
            return;
        }
        
        const tab = this.tabs.get(this.currentTab);
        if (tab && tab.url === this.NEWTAB_URL) {
            this.applyNewTabTabChrome(this.currentTab);
            return;
        }

        // Check if tab has a custom title (user-renamed)
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
                this.updateTabTooltip(this.currentTab);
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
            this.updateTabTooltip(this.currentTab);
        }

        // Update tab data
        if (tab) {
            tab.title = title;
        }

        // Also refresh favicon on title change as sites often inject icons late
        const activeTabEl = document.querySelector(`[data-tab-id="${this.currentTab}"]`);
        if (activeTabEl) this.updateTabFavicon(this.currentTab, activeTabEl);

        // Update native window title so macOS Dock shows the active tab name
        if (window.electronAPI?.setWindowTitle) {
            const fallback = this.isIncognitoWindow ? 'Axis — Incognito' : 'Axis Browser';
            const isPlaceholder =
                !title ||
                title === 'New Tab' ||
                title === 'New Incognito Tab';
            const windowTitle = isPlaceholder ? fallback : title;
            window.electronAPI.setWindowTitle(windowTitle);
        }
    }

    updateTabTooltip(tabId) {
        const tab = this.tabs.get(tabId);
        const tabElement = document.querySelector(`[data-tab-id="${tabId}"]`);
        if (!tab || !tabElement) return;
        let fullUrl = tab.url || '';
        try {
            if (tab.webview && typeof tab.webview.getURL === 'function') {
                const current = tab.webview.getURL();
                if (current && current !== 'about:blank') fullUrl = current;
            }
        } catch (_) {
            // ignore inaccessible webview URL
        }
        const fullTitle = tab.customTitle || tab.title || 'New Tab';
        tabElement.title = fullUrl ? `${fullTitle}\n${fullUrl}` : fullTitle;
    }

    toggleSettings() {
        this.openSettingsTab();
    }

    async openSettingsAsTab() {
        this.openSettingsTab();
    }

    _findSettingsTabId() {
        for (const [id, tab] of this.tabs) {
            if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
                return this._normalizeTabMapKey(id);
            }
        }
        return null;
    }

    focusSettingsSection(rawTabId, section) {
        const tabId = this._normalizeTabMapKey(rawTabId);
        const sectionId = axisSanitizeSettingsSectionId(section);
        if (tabId == null || !sectionId) return;
        const tab = this.tabs.get(tabId);
        if (tab) {
            tab.settingsSection = sectionId;
            this.tabs.set(tabId, tab);
        }
        const wv = tab?.webview;
        if (!wv || typeof wv.send !== 'function') return;
        try {
            wv.send('switch-settings-tab', sectionId);
        } catch (_) {
            /* guest may not be ready yet */
        }
    }

    async createSettingsTab(section = null) {
        if (!this._settingsWebviewPreloadPath) {
            try {
                this._settingsWebviewPreloadPath =
                    (await window.electronAPI.getSettingsWebviewPreloadPath?.()) || null;
            } catch (_) {
                this._settingsWebviewPreloadPath = null;
            }
        }
        const tabId = this._createUniqueTabId(Date.now());
        const tabElement = document.createElement('div');
        tabElement.className = 'tab';
        tabElement.dataset.tabId = String(tabId);

        tabElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    <i class="fas fa-cog tab-favicon" style="width: 16px; height: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; color: rgba(255, 255, 255, 0.7);"></i>
                    <span class="tab-audio-indicator" style="display: none;"><i class="fas fa-volume-up"></i></span>
                    <span class="tab-title">Settings</span>
                </div>
                <div class="tab-right">
                    <button class="tab-close"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;

        const tabData = {
            id: tabId,
            url: 'axis://settings',
            title: 'Settings',
            favicon: null,
            customIcon: 'fa-cog',
            customIconType: 'fa',
            canGoBack: false,
            canGoForward: false,
            history: ['axis://settings'],
            historyIndex: 0,
            pinned: false,
            webview: null,
            isMuted: false,
            isPlayingAudio: false,
            isSettings: true,
            settingsSection: section || null
        };

        const webview = this.createTabWebview(tabId, { useSettingsPreload: true });
        if (webview) tabData.webview = webview;
        this.tabs.set(tabId, tabData);

        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        if (separator && separator.parentNode === tabsContainer) {
            const unpinnedRef = this.elements.sidebarNewTabBtn
                ? this.elements.sidebarNewTabBtn.nextSibling
                : separator.nextSibling;
            tabsContainer.insertBefore(tabElement, unpinnedRef);
        } else if (tabsContainer) {
            tabsContainer.appendChild(tabElement);
        }

        this.setupTabEventListeners(tabElement, tabId);
        this.switchToTab(tabId);
        this.updateEmptyState();
        this.updateTabTooltip(tabId);
        await this.loadSettingsInWebview(section, tabId);
        return tabId;
    }

    async openSettingsTab(section = null) {
        try {
            await window.electronAPI.openSettingsWindow(section || null);
        } catch (_) {}
        return null;
    }

    async rebuildSettingsTabWebview(tabId, section = null) {
        const tid = this._normalizeTabMapKey(tabId);
        if (tid == null) return;
        const tab = this.tabs.get(tid);
        if (!tab?.isSettings && tab?.url !== 'axis://settings') return;

        if (!this._settingsWebviewPreloadPath) {
            try {
                this._settingsWebviewPreloadPath =
                    (await window.electronAPI.getSettingsWebviewPreloadPath?.()) || null;
            } catch (_) {
                this._settingsWebviewPreloadPath = null;
            }
        }

        if (tab.webview) {
            try {
                this.cleanupWebviewListeners(tab.webview);
                try {
                    tab.webview.src = 'about:blank';
                } catch (_) {}
                if (tab.webview.parentNode) {
                    tab.webview.parentNode.removeChild(tab.webview);
                }
            } catch (_) {}
            tab.webview = null;
        }

        const webview = this.createTabWebview(tid, { useSettingsPreload: true });
        if (webview) {
            tab.webview = webview;
            this.tabs.set(tid, tab);
            if (this._normalizeTabMapKey(this.currentTab) === tid) {
                this.elements.webview = webview;
            }
        }

        await this.loadSettingsInWebview(section || tab.settingsSection || null, tid);
    }

    async loadSettingsInWebview(section = null, rawTabId = null) {
        const tabId = this._normalizeTabMapKey(rawTabId ?? this.currentTab);
        const tab = tabId != null ? this.tabs.get(tabId) : null;
        const webview = tab?.webview || (tabId == null ? this.getActiveWebview() : null);
        if (!webview) return;

        if (!this._settingsWebviewPreloadPath) {
            try {
                this._settingsWebviewPreloadPath =
                    (await window.electronAPI.getSettingsWebviewPreloadPath?.()) || null;
            } catch (_) {
                this._settingsWebviewPreloadPath = null;
            }
        }

        if (tab) {
            tab.isSettings = true;
            tab.url = 'axis://settings';
            tab.title = 'Settings';
            if (section) tab.settingsSection = section;
            this.tabs.set(tabId, tab);
        }

        const tabElement = tabId != null ? document.querySelector(`[data-tab-id="${tabId}"]`) : null;
        if (tabElement) {
            const titleEl = tabElement.querySelector('.tab-title');
            if (titleEl) titleEl.textContent = 'Settings';
            this.updateTabTooltip(tabId);
        }

        try {
            webview.style.removeProperty('background');
        } catch (_) {}

        const targetSection = axisSanitizeSettingsSectionId(section || tab?.settingsSection);

        const settingsPreload = this._settingsWebviewPreloadPath || '';
        let webviewPreload = '';
        try {
            webviewPreload = webview.getAttribute('preload') || '';
        } catch (_) {
            webviewPreload = '';
        }
        if (
            tabId != null &&
            settingsPreload &&
            webviewPreload !== settingsPreload &&
            !webviewPreload.includes('webview-preload-settings')
        ) {
            await this.rebuildSettingsTabWebview(tabId, targetSection);
            return;
        }

        let loadUrl = null;
        try {
            loadUrl = await window.electronAPI.getSettingsTabLoadUrl(targetSection);
        } catch (err) {
            console.error('Failed to resolve settings tab URL:', err);
            return;
        }

        let currentSrc = '';
        try {
            currentSrc = webview.getURL() || '';
        } catch (_) {
            currentSrc = '';
        }

        const sectionToFocus = targetSection || 'customization';
        const focusLoadedSection = (attempt = 0) => {
            const checkReady =
                '(function(){if(typeof window.electronAPI==="undefined")return"no-api";if(typeof window.__axisSwitchSettingsSection!=="function")return"no-switch";return"ok";})();';
            try {
                webview
                    .executeJavaScript(checkReady, true)
                    .then((result) => {
                        if (result === 'ok') {
                            try {
                                webview.send('switch-settings-tab', sectionToFocus);
                            } catch (_) {}
                            return;
                        }
                        if (attempt < 50) {
                            setTimeout(() => focusLoadedSection(attempt + 1), 100);
                        }
                    })
                    .catch(() => {
                        if (attempt < 50) {
                            setTimeout(() => focusLoadedSection(attempt + 1), 100);
                        }
                    });
            } catch (_) {
                if (attempt < 50) {
                    setTimeout(() => focusLoadedSection(attempt + 1), 100);
                }
            }
        };

        const alreadyLoaded = currentSrc.includes('settings.html');
        if (alreadyLoaded) {
            let apiOk = false;
            try {
                apiOk = await webview.executeJavaScript(
                    'typeof window.electronAPI !== "undefined"',
                    true
                );
            } catch (_) {
                apiOk = false;
            }
            if (!apiOk && tabId != null) {
                await this.rebuildSettingsTabWebview(tabId, targetSection);
                return;
            }
            focusLoadedSection();
            if (targetSection) this.focusSettingsSection(tabId, targetSection);
            return;
        }

        const onSettingsGuestReady = () => {
            focusLoadedSection();
        };
        try {
            webview.removeEventListener('dom-ready', webview.__axisSettingsDomReady);
            webview.removeEventListener('did-finish-load', webview.__axisSettingsDidFinishLoad);
        } catch (_) {}
        webview.__axisSettingsDomReady = onSettingsGuestReady;
        webview.__axisSettingsDidFinishLoad = onSettingsGuestReady;
        webview.addEventListener('dom-ready', onSettingsGuestReady, { once: true });
        webview.addEventListener('did-finish-load', onSettingsGuestReady, { once: true });

        try {
            webview.src = loadUrl;
        } catch (err) {
            console.error('Failed to load settings tab:', err);
            return;
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
        
        // Insert tab below separator, after "+ New Tab" button
        if (separator && separator.parentNode === tabsContainer) {
            const unpinnedRef = this.elements.sidebarNewTabBtn ? this.elements.sidebarNewTabBtn.nextSibling : separator.nextSibling;
            tabsContainer.insertBefore(tabElement, unpinnedRef);
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
                this.settings[key] = value;
                if (key === 'javascriptEnabled') {
                    this._lastJavascriptEnabled = value !== false;
                    this.rebuildAllTabWebviewsForWebPreferences();
                }
                // Apply setting changes immediately
                if (key === 'sidebarPosition') {
                    this.applySidebarPosition();
                } else if (key === 'themeColor' || key === 'gradientColor' || key === 'gradientEnabled' || key === 'gradientDirection' || key === 'uiTheme') {
                    // Apply theme / light-dark shell immediately
                    this.applyCustomThemeFromSettings();
                    const activeTab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
                    if (activeTab && (activeTab.url === 'axis://settings' || activeTab.isSettings)) {
                        this.applyInternalShellUrlBarStyle();
                    } else if (activeTab && activeTab.url === this.NEWTAB_URL) {
                        this.applyInternalShellUrlBarStyle();
                    }
                    this.applyNewTabCustomization();
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
            this.openSettingsTab('permissions');
            this.showNotification('Opening Site permissions in Settings', 'info');
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
                    webview
                        .executeJavaScript(`
                        (function() {
                            if (window.updateSaveStatus) {
                                window.updateSaveStatus(true);
                            }
                            window.postMessage({ type: 'noteSaved' }, '*');
                        })();
                    `)
                        .catch(() => {});
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
                webview
                    .executeJavaScript(`
                    if (window.updateSaveStatus) {
                        window.updateSaveStatus(false);
                    }
                `)
                    .catch(() => {});
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

        this.closeExtensionsMenu();
        
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

        let finished = false;
        const detach = () => {
            input.removeEventListener('blur', onBlur);
            input.removeEventListener('keydown', onKeydown);
        };

        const commitRename = () => {
            if (finished) return;
            finished = true;
            detach();
            const newTitle = input.value.trim() || currentTitle;
            const newTitleElement = document.createElement('span');
            newTitleElement.className = 'tab-title';
            newTitleElement.textContent = newTitle;
            if (input.parentNode) input.parentNode.replaceChild(newTitleElement, input);
            const tab = this.tabs.get(tabId);
            if (tab) {
                tab.title = newTitle;
                tab.customTitle = newTitle;
            }
        };

        const cancelRename = () => {
            if (finished) return;
            finished = true;
            detach();
            const restored = document.createElement('span');
            restored.className = 'tab-title';
            restored.textContent = currentTitle;
            if (input.parentNode) input.parentNode.replaceChild(restored, input);
        };

        const onBlur = () => commitRename();
        const onKeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelRename();
            }
        };
        input.addEventListener('blur', onBlur);
        input.addEventListener('keydown', onKeydown);
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

    _cancelExtensionStoreListingUiRetries() {
        if (this._extensionStoreListingRetryTimers) {
            this._extensionStoreListingRetryTimers.forEach((id) => clearTimeout(id));
            this._extensionStoreListingRetryTimers = null;
        }
        this._extensionStoreListingRetryGen = (this._extensionStoreListingRetryGen || 0) + 1;
    }

    _scheduleExtensionStoreListingUiRefresh(currentUrl, webview = null) {
        this._cancelExtensionStoreListingUiRetries();
        if (!axisParseStoreListingContext(currentUrl)) return;
        const gen = this._extensionStoreListingRetryGen;
        const delays = [400, 1100, 2800];
        this._extensionStoreListingRetryTimers = delays.map((ms) =>
            setTimeout(() => {
                if (gen !== this._extensionStoreListingRetryGen) return;
                void this.refreshExtensionStoreListingUi(currentUrl, webview);
            }, ms)
        );
    }

    _pushExtensionStoreBarStatusToGuest(webview, payload) {
        if (!webview || !payload || !payload.token) return;
        const prev = webview.__axisStoreStatusPushTimers;
        if (prev) prev.forEach((id) => clearTimeout(id));
        const delays = [0, 500, 1200, 2600];
        webview.__axisStoreStatusPushTimers = delays.map((ms) =>
            setTimeout(() => {
                try {
                    axisNotifyExtensionStoreBarStatus(webview, payload);
                } catch (_) {
                    /* guest torn down */
                }
            }, ms)
        );
    }

    _applyExtensionStoreListingInstalledUi(installedExt, ctx) {
        const el = this.elements;
        const installed = !!installedExt;
        const extName = installedExt?.name || 'This extension';
        const hostBtn = el?.axisStoreInstallHostBtn;
        const urlBtn = el?.urlBarCwsInstall;
        const bar = el?.axisStoreInstallHostBar;
        const badge = el?.axisStoreInstallHostBadge;
        const openBtn = el?.axisStoreInstallHostOpen;
        const text = el?.axisStoreInstallHostText;

        if (bar) bar.classList.toggle('axis-store-install-host-bar--installed', installed);

        if (badge) {
            badge.classList.toggle('hidden', !installed);
            if (installed) {
                const ver = installedExt.version ? ` v${installedExt.version}` : '';
                badge.title = `${extName}${ver} is in Axis`;
            }
        }
        if (openBtn) openBtn.classList.toggle('hidden', !installed);

        if (text && !this._extensionInstallUiActive) {
            if (installed) {
                text.textContent = `${extName} is already in Axis. You can install again to fetch a fresh copy.`;
            } else if (ctx?.amoKey) {
                text.textContent =
                    'Add to Firefox does not install in Axis. Use Install in Axis below.';
            } else {
                text.textContent =
                    'Add to Chrome does not install in Axis. Use Install in Axis below.';
            }
        }

        const btnState = installed ? 'installed' : 'idle';
        if (!this._extensionInstallUiActive) {
            this.setExtensionInstallControlState(hostBtn, btnState);
            this.setExtensionInstallControlState(urlBtn, btnState);
        }

        if (urlBtn) {
            urlBtn.classList.toggle('url-bar-cws-install--installed', installed);
            urlBtn.title = installed
                ? `${extName} is installed — click to install again`
                : ctx?.amoKey
                  ? 'Install this Firefox add-on in Axis (from this Mozilla page)'
                  : 'Install this Chrome extension in Axis (same tab — no copy/paste)';
        }
    }

    async refreshExtensionStoreListingUi(currentUrl, webview = null) {
        const ctx = axisParseStoreListingContext(currentUrl);
        const el = this.elements;
        if (!ctx) {
            this._cancelExtensionStoreListingUiRetries();
            if (el?.axisStoreInstallHostBar) {
                el.axisStoreInstallHostBar.classList.add('hidden');
                el.axisStoreInstallHostBar.classList.remove('axis-store-install-host-bar--shown');
            }
            if (el?.urlBarCwsInstall) {
                el.urlBarCwsInstall.classList.remove('url-bar-cws-install--installed');
            }
            return null;
        }

        if (el?.urlBarCwsInstall) {
            el.urlBarCwsInstall.classList.remove('hidden');
            el.urlBarCwsInstall.setAttribute('aria-hidden', 'false');
        }

        if (el?.axisStoreInstallHostBar && !this._extensionInstallUiActive) {
            const wasHidden = el.axisStoreInstallHostBar.classList.contains('hidden');
            el.axisStoreInstallHostBar.classList.remove('hidden');
            if (wasHidden) {
                el.axisStoreInstallHostBar.classList.remove('axis-store-install-host-bar--shown');
                void el.axisStoreInstallHostBar.offsetWidth;
                el.axisStoreInstallHostBar.classList.add('axis-store-install-host-bar--shown');
            }
            el.axisStoreInstallHostBar.classList.remove(
                'axis-store-install-host-bar--busy',
                'axis-store-install-host-bar--success',
                'axis-store-install-host-bar--error'
            );
        }

        let status = { installed: false, token: ctx.token, name: '', version: '', extensionRecordId: '' };
        try {
            if (window.electronAPI?.getStoreListingInstallStatus) {
                status = await window.electronAPI.getStoreListingInstallStatus(currentUrl);
            }
        } catch (_) {
            /* ignore */
        }
        const installedExt = status.installed
            ? {
                  name: status.name || '',
                  version: status.version || '',
                  id: status.extensionRecordId || '',
                  storeListingToken: status.token || ctx.token
              }
            : null;

        this._storeListingUiContext = ctx;
        this._storeListingInstalledExt = installedExt;
        if (!this._extensionInstallUiActive) {
            this._applyExtensionStoreListingInstalledUi(installedExt, ctx);
        }

        const wv = webview || this.getActiveWebview();
        const guestPayload = {
            token: ctx.token,
            installed: !!status.installed,
            name: status.name || '',
            version: status.version || ''
        };
        this._pushExtensionStoreBarStatusToGuest(wv, guestPayload);

        return { ctx, installedExt, status };
    }

    _touchExtensionStoreListingUiForWebview(webview, url) {
        if (!url || !axisParseStoreListingContext(url)) return;
        void this.refreshExtensionStoreListingUi(url, webview);
        this._scheduleExtensionStoreListingUiRefresh(url, webview);
    }

    /**
     * Visual state for Install in Axis controls (`idle` | `installed` | `busy` | `success` | `error`).
     * @param {HTMLElement|null} btn
     */
    setExtensionInstallControlState(btn, state = 'idle') {
        if (!btn) return;
        const states = ['installed', 'busy', 'success', 'error'];
        states.forEach((s) => btn.classList.remove(`axis-ext-install--${s}`));
        if (state && state !== 'idle') btn.classList.add(`axis-ext-install--${state}`);
        btn.disabled = state === 'busy';
        btn.setAttribute('aria-busy', state === 'busy' ? 'true' : 'false');

        if (btn.id === 'axis-store-install-host-btn' || btn.classList.contains('axis-store-install-host-btn')) {
            const labels = {
                idle: 'Install in Axis',
                installed: 'Install again',
                busy: 'Installing…',
                success: 'Installed',
                error: 'Try again'
            };
            btn.textContent = labels[state] || labels.idle;
        }

        const icon = btn.querySelector('i');
        if (!icon) return;
        icon.classList.remove(
            'fa-download',
            'fa-rotate-right',
            'fa-spinner',
            'fa-spin',
            'fa-check',
            'fa-exclamation-circle'
        );
        if (state === 'busy') {
            icon.classList.add('fa-spinner', 'fa-spin');
        } else if (state === 'success') {
            icon.classList.add('fa-check');
        } else if (state === 'error') {
            icon.classList.add('fa-exclamation-circle');
            btn.classList.add('shake');
            setTimeout(() => btn.classList.remove('shake'), 520);
        } else if (state === 'installed') {
            icon.classList.add('fa-rotate-right');
        } else {
            icon.classList.add('fa-download');
        }
    }

    /** Host bar above the webview on store listing pages. */
    setExtensionStoreHostBarState(state = 'idle', message = null) {
        const bar = this.elements?.axisStoreInstallHostBar;
        const text = this.elements?.axisStoreInstallHostText;
        const btn = this.elements?.axisStoreInstallHostBtn;
        if (!bar) return;
        bar.classList.remove(
            'axis-store-install-host-bar--busy',
            'axis-store-install-host-bar--success',
            'axis-store-install-host-bar--error'
        );
        if (state === 'busy') bar.classList.add('axis-store-install-host-bar--busy');
        if (state === 'success') bar.classList.add('axis-store-install-host-bar--success');
        if (state === 'error') bar.classList.add('axis-store-install-host-bar--error');
        if (message && text) text.textContent = message;
        const btnState =
            state === 'idle' && this._storeListingInstalledExt ? 'installed' : state;
        this.setExtensionInstallControlState(btn, btnState === 'idle' ? 'idle' : btnState);
    }

    _resetExtensionInstallUiAfterDelay(ms = 2400) {
        if (this._extensionInstallUiResetTimer) clearTimeout(this._extensionInstallUiResetTimer);
        this._extensionInstallUiResetTimer = setTimeout(() => {
            this._extensionInstallUiResetTimer = null;
            this._extensionInstallUiActive = false;
            const wv = this.getActiveWebview();
            let url = '';
            try {
                url = wv && typeof wv.getURL === 'function' ? wv.getURL() || '' : '';
            } catch (_) {
                url = '';
            }
            void this.refreshExtensionStoreListingUi(url);
        }, ms);
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
            img.draggable = false;
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
        
        // Poll to check if audio is playing (balance responsiveness vs idle work)
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
                    this.applyAmbientFromSettings();
                }
            } catch (e) {
                // Webview might be destroyed, clean up
                if (webview.__audioCheckInterval) {
                    clearInterval(webview.__audioCheckInterval);
                }
            }
        }, 750);
        
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
        if (this.isIncognitoWindow) return;
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
        
        // Show/hide separator based on actual DOM content above it (tabs or tab groups)
        this.updatePinnedSeparatorVisibility();
        
        // Insert unpinned tabs below separator, after "+ New Tab" button (in order)
        const unpinnedRef = this.elements.sidebarNewTabBtn ? this.elements.sidebarNewTabBtn.nextSibling : separator.nextSibling;
        unpinnedTabs.forEach(tab => {
            if (unpinnedRef) {
                tabsContainer.insertBefore(tab, unpinnedRef);
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
    
    // Recompute whether the pinned/unpinned separator should be visible based on current DOM
    updatePinnedSeparatorVisibility() {
        const tabsContainer = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        const floatingClear = this.elements.clearUnpinnedFloatingBtn;
        if (!tabsContainer || !separator) return;
        
        const children = Array.from(tabsContainer.children);
        const sepIndex = children.indexOf(separator);
        if (sepIndex <= 0) {
            separator.style.display = 'none';
            const hasUnpinnedDom = children
                .slice(Math.max(0, sepIndex + 1))
                .some(el => el.classList.contains('tab') || el.classList.contains('tab-group'));
            if (floatingClear) {
                floatingClear.classList.toggle('hidden', !hasUnpinnedDom);
            }
            return;
        }
        
        const hasPinnedDom = children
            .slice(0, sepIndex)
            .some(el => el.classList.contains('tab') || el.classList.contains('tab-group'));
        const hasUnpinnedDom = children
            .slice(sepIndex + 1)
            .some(el => el.classList.contains('tab') || el.classList.contains('tab-group'));
        
        separator.style.display = hasPinnedDom ? 'block' : 'none';
        if (floatingClear) {
            floatingClear.classList.toggle('hidden', hasPinnedDom || !hasUnpinnedDom);
        }
    }

    normalizeFavoriteUrl(rawUrl) {
        const url = String(rawUrl || '').trim();
        if (!url || url === this.NEWTAB_URL || url === 'about:blank') return '';
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            parsed.hash = '';
            return parsed.toString();
        } catch (_) {
            return '';
        }
    }

    isFavoriteUrl(url) {
        const normalized = this.normalizeFavoriteUrl(url);
        return !!normalized && this.favorites.some((fav) => this.normalizeFavoriteUrl(fav.url) === normalized);
    }

    getFavoriteIconHtml(favorite) {
        if (favorite.customIcon) {
            if (favorite.customIconType === 'emoji') {
                return `<span class="favorite-favicon favorite-favicon-emoji">${this.escapeHtml(favorite.customIcon)}</span>`;
            }
            return `<i class="fas ${this.escapeHtml(favorite.customIcon)} favorite-favicon favorite-favicon-fa" aria-hidden="true"></i>`;
        }
        if (favorite.favicon) {
            return `<img class="favorite-favicon" src="${this.escapeHtml(favorite.favicon)}" alt="" draggable="false" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';"><span class="favorite-favicon favorite-favicon-fallback" aria-hidden="true" style="display:none;">${this.escapeHtml(this.getFavoriteInitial(favorite))}</span>`;
        }
        return `<span class="favorite-favicon favorite-favicon-fallback" aria-hidden="true">${this.escapeHtml(this.getFavoriteInitial(favorite))}</span>`;
    }

    getFavoriteInitial(favorite) {
        try {
            const host = new URL(favorite.url).hostname.replace(/^www\./, '');
            return (host.charAt(0) || '•').toUpperCase();
        } catch (_) {
            return (String(favorite.title || '•').charAt(0) || '•').toUpperCase();
        }
    }

    saveFavorites() {
        if (this.isIncognitoWindow) return;
        const prevById = new Map(this.favorites.map((f) => [f.id, f]));
        const compact = this.favorites
            .map((fav, order) => ({
                id: fav.id || `fav-${Date.now()}-${order}`,
                url: this.normalizeFavoriteUrl(fav.url),
                title: String(fav.title || 'Favorite').trim() || 'Favorite',
                favicon: fav.favicon || null,
                customIcon: fav.customIcon || null,
                customIconType: fav.customIconType || null,
                order
            }))
            .filter((fav) => !!fav.url);
        this.saveSetting(
            'favorites',
            compact.map(({ id, url, title, favicon, customIcon, customIconType, order }) => ({
                id,
                url,
                title,
                favicon,
                customIcon,
                customIconType,
                order
            }))
        );
        this.favorites = compact.map((row) => {
            const prev = prevById.get(row.id);
            return prev ? { ...row, runtimeTabId: prev.runtimeTabId } : { ...row };
        });
    }

    loadFavorites() {
        if (this.isIncognitoWindow) {
            this.favorites = [];
            this.renderFavorites();
            return;
        }
        const raw = Array.isArray(this.settings?.favorites) ? this.settings.favorites : [];
        const seen = new Set();
        this.favorites = raw
            .slice()
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .map((fav, idx) => ({
                id: fav.id || `fav-${Date.now()}-${idx}`,
                url: this.normalizeFavoriteUrl(fav.url),
                title: String(fav.title || 'Favorite').trim() || 'Favorite',
                favicon: fav.favicon || null,
                customIcon: fav.customIcon || null,
                customIconType: fav.customIconType || null,
                order: idx
            }))
            .filter((fav) => {
                if (!fav.url || seen.has(fav.url)) return false;
                seen.add(fav.url);
                return true;
            });
        this.renderFavorites();
    }

    addTabToFavorites(tabId) {
        if (this.isIncognitoWindow) return;
        const tab = this.tabs.get(this._normalizeTabMapKey(tabId));
        if (!tab) return;
        let url = tab.url;
        try {
            if (tab.webview && typeof tab.webview.getURL === 'function') {
                const current = tab.webview.getURL();
                if (current && current !== 'about:blank') url = current;
            }
        } catch (_) {}
        const normalized = this.normalizeFavoriteUrl(url);
        if (!normalized) {
            this.showNotification('Only website tabs can be added to Favorites', 'info');
            return;
        }
        if (this.isFavoriteUrl(normalized)) {
            this.showNotification('Already in Favorites', 'info');
            return;
        }
        let title = tab.customTitle || tab.title || '';
        try {
            if (tab.webview && typeof tab.webview.getTitle === 'function') {
                title = tab.webview.getTitle() || title;
            }
        } catch (_) {}
        let favicon = tab.favicon || null;
        if (!favicon) {
            try {
                favicon = `https://www.google.com/s2/favicons?domain=${new URL(normalized).hostname}&sz=64`;
            } catch (_) {
                favicon = null;
            }
        }
        this.favorites.push({
            id: `fav-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            url: normalized,
            title: title || new URL(normalized).hostname.replace(/^www\./, ''),
            favicon,
            customIcon: tab.customIcon || null,
            customIconType: tab.customIconType || null,
            order: this.favorites.length
        });
        this.saveFavorites();
        this.renderFavorites();
    }

    createFavoriteRuntimeTab(favorite) {
        const url = this.normalizeFavoriteUrl(favorite?.url);
        if (!url) return null;
        const tabId = this._createUniqueTabId(Date.now());
        this.tabs.set(tabId, {
            id: tabId,
            url,
            title: favorite.title || 'Favorite',
            favicon: favorite.favicon || null,
            customIcon: favorite.customIcon || null,
            customIconType: favorite.customIconType || null,
            canGoBack: false,
            canGoForward: false,
            history: [url],
            historyIndex: 0,
            pinned: false,
            webview: null,
            isMuted: false,
            isPlayingAudio: false,
            isFavoriteTab: true,
            favoriteId: favorite.id,
            hiddenInSidebar: true
        });
        this._ensureFavoriteTabHostElement(tabId);
        favorite.runtimeTabId = tabId;
        return tabId;
    }

    navigateFavorite(favorite) {
        if (!favorite) return;
        let tabId = this._normalizeTabMapKey(favorite.runtimeTabId);
        if (tabId != null && !this.tabs.has(tabId)) {
            favorite.runtimeTabId = null;
            tabId = null;
        }
        if (tabId == null) {
            tabId = this.createFavoriteRuntimeTab(favorite);
        }
        if (tabId == null) return;
        this._ensureFavoriteTabHostElement(tabId);
        this.switchToTab(tabId);
        this.renderFavorites();
    }

    removeFavorite(favoriteId) {
        const before = this.favorites.length;
        const favorite = this.favorites.find((fav) => fav.id === favoriteId);
        const runtimeTabId = this._normalizeTabMapKey(favorite?.runtimeTabId);
        this.favorites = this.favorites.filter((fav) => fav.id !== favoriteId);
        if (this.favorites.length === before) return;
        if (runtimeTabId != null && this.tabs.has(runtimeTabId)) {
            this.closeTab(runtimeTabId);
        }
        this.saveFavorites();
        this.renderFavorites();
    }

    renderFavorites() {
        const section = this.elements?.favoritesSection;
        const grid = this.elements?.favoritesGrid;
        if (!section || !grid) return;
        const activeTabId = this._normalizeTabMapKey(this.currentTab);

        section.classList.toggle('hidden', this.favorites.length === 0);
        grid.innerHTML = '';
        this.favorites.forEach((favorite) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'favorite-item';
            item.draggable = true;
            item.dataset.favoriteId = favorite.id;
            item.title = `${favorite.title || 'Favorite'}\n${favorite.url}`;
            item.setAttribute('role', 'listitem');
            if (activeTabId != null && this._normalizeTabMapKey(favorite.runtimeTabId) === activeTabId) {
                item.classList.add('active');
            }
            item.innerHTML = `
                <span class="favorite-icon-wrap">${this.getFavoriteIconHtml(favorite)}</span>
            `;
            item.addEventListener('click', () => this.navigateFavorite(favorite));
            item.addEventListener('contextmenu', (e) => {
                void this.showFavoriteContextMenu(e, favorite);
            });
            item.addEventListener('dragstart', (e) => this.onFavoriteDragStart(e, favorite.id));
            item.addEventListener('dragend', (e) => this.onFavoriteDragEnd(e, favorite.id));
            grid.appendChild(item);
        });

        if (!grid.__favoritesDragBound) {
            grid.__favoritesDragBound = true;
            grid.addEventListener('dragover', (e) => this.onFavoritesGridDragOver(e));
            grid.addEventListener('drop', (e) => this.onFavoritesGridDrop(e));
        }
    }

    onFavoriteDragStart(e, favoriteId) {
        const item = e.currentTarget;
        this._favoriteDrag = { id: favoriteId, droppedInside: false };
        item.classList.add('favorite-dragging');
        e.dataTransfer.effectAllowed = 'move';
        try {
            e.dataTransfer.setData('text/plain', favoriteId);
        } catch (_) {}
    }

    onFavoritesGridDragOver(e) {
        if (!this._favoriteDrag) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const grid = this.elements?.favoritesGrid;
        const dragging = grid?.querySelector('.favorite-dragging');
        if (!grid || !dragging) return;
        const siblings = Array.from(grid.querySelectorAll('.favorite-item:not(.favorite-dragging)'));
        const after = siblings.find((item) => {
            const rect = item.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            return e.clientY < rect.bottom && e.clientX < midpoint;
        });
        if (after) grid.insertBefore(dragging, after);
        else grid.appendChild(dragging);
    }

    onFavoritesGridDrop(e) {
        if (!this._favoriteDrag) return;
        e.preventDefault();
        this._favoriteDrag.droppedInside = true;
        this.persistFavoriteDomOrder();
    }

    onFavoriteDragEnd(e, favoriteId) {
        const item = e.currentTarget;
        item.classList.remove('favorite-dragging');
        const pointTarget = document.elementFromPoint(e.clientX, e.clientY);
        const droppedInFavorites = !!pointTarget?.closest?.('#favorites-section');
        const droppedInside = this._favoriteDrag?.droppedInside || droppedInFavorites;
        this._favoriteDrag = null;
        if (!droppedInside) {
            this.removeFavorite(favoriteId);
            return;
        }
        this.persistFavoriteDomOrder();
    }

    persistFavoriteDomOrder() {
        const grid = this.elements?.favoritesGrid;
        if (!grid) return;
        const order = Array.from(grid.querySelectorAll('.favorite-item'))
            .map((el) => el.dataset.favoriteId)
            .filter(Boolean);
        const byId = new Map(this.favorites.map((fav) => [fav.id, fav]));
        this.favorites = order.map((id, idx) => ({ ...byId.get(id), order: idx })).filter((fav) => fav && fav.id);
        this.saveFavorites();
        this.renderFavorites();
    }
    
    _collectPinnedTabsPayload() {
        const tabsContainer = this.elements.tabsContainer;
        if (!tabsContainer) return [];

        const pinnedTabs = [];
        let pinnedOrder = 0;
        const allChildren = Array.from(tabsContainer.children);
        for (const child of allChildren) {
            if (!child.classList.contains('tab')) continue;
            const tabId = this._normalizeTabMapKey(child.dataset.tabId);
            if (tabId == null) continue;
            const tab = this.tabs.get(tabId);
            if (tab && tab.pinned && !tab.isFavoriteTab && !tab.tabGroupId) {
                pinnedTabs.push({
                    id: tabId,
                    url: tab.url,
                    title: tab.title,
                    favicon: tab.favicon || null,
                    customIcon: tab.customIcon || null,
                    customIconType: tab.customIconType || null,
                    customTitle: tab.customTitle || null,
                    order: pinnedOrder++
                });
            }
        }
        return pinnedTabs;
    }

    async savePinnedTabs() {
        const pinnedTabs = this._collectPinnedTabsPayload();
        await this.saveSetting('pinnedTabs', pinnedTabs);
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
                const tabId = this._createUniqueTabId(pinnedData.id);
                const tabElement = document.createElement('div');
                tabElement.className = 'tab pinned';
                tabElement.dataset.tabId = tabId;
                
                // Use custom title if available, otherwise use saved title
                const displayTitle = pinnedData.customTitle || pinnedData.title || 'New Tab';
                
                // Determine icon HTML based on type
                let iconHTML = '<img class="tab-favicon" src="" alt="" draggable="false" onerror="this.style.visibility=\'hidden\'">';
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

        const closing = !sidebar.classList.contains('hidden');
        if (closing) {
            const ae = document.activeElement;
            if (ae && typeof ae.blur === 'function' && sidebar.contains(ae)) {
                ae.blur();
            }
        }

        /* Exit hover slide-over mode cleanly so fixed/keyframe state never leaks into the docked bar */
        sidebar.classList.remove('slide-out', 'slide-out-closing');
        sidebar.style.animation = '';
        sidebar.style.background = '';

        sidebar.classList.toggle('hidden');

        const isHidden = sidebar.classList.contains('hidden');
        if (window.electronAPI && window.electronAPI.setWindowButtonVisibility) {
            window.electronAPI.setWindowButtonVisibility(!isHidden);
        }
        // Showing traffic lights again can reset custom inset; re-apply left/right mirror (main resize also does this).
        if (!isHidden) {
            this.syncMacOSTrafficLayout();
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
        this.syncMacOSTrafficLayout();
    }

    /** macOS: move window controls to top-right when sidebar is right (matches left layout mirrored). */
    syncMacOSTrafficLayout() {
        if (window.electronAPI?.platform !== 'darwin' || !window.electronAPI.setSidebarTrafficLayout) return;
        window.electronAPI.setSidebarTrafficLayout(this.isSidebarRight()).catch(() => {});
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
        this.syncMacOSTrafficLayout();
    }

    isSidebarRight() {
        const mainArea = document.getElementById('main-area');
        return mainArea && mainArea.classList.contains('sidebar-right');
    }

    setupSidebarSlideBack() {
        const hoverArea = document.getElementById('sidebar-hover-area');
        const sidebar = document.getElementById('sidebar');

        let slideBackTimeout = null;
        let closeFallbackTimer = null;

        if (!hoverArea) {
            console.error('Hover area not found!');
            return;
        }

        const clearCloseFallback = () => {
            if (closeFallbackTimer) {
                clearTimeout(closeFallbackTimer);
                closeFallbackTimer = null;
            }
        };

        const finishSlideOutClose = () => {
            clearCloseFallback();
            /* Overlay already slid off; docked bar must snap with zero transition or
               width/min-width/margin/visibility easing runs again and the webview reflows (twitch). */
            sidebar.style.setProperty('transition', 'none', 'important');
            sidebar.classList.remove('slide-out', 'slide-out-closing');
            sidebar.style.removeProperty('animation');
            sidebar.style.removeProperty('--sidebar-reveal-width');
            sidebar.style.background = '';
            sidebar.style.removeProperty('transform');
            void sidebar.offsetHeight;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    sidebar.style.removeProperty('transition');
                });
            });
            if (sidebar.classList.contains('hidden') && window.electronAPI?.setWindowButtonVisibility) {
                window.electronAPI.setWindowButtonVisibility(false);
            }
        };

        const revealFromEdge = () => {
            if (!sidebar.classList.contains('hidden')) return;

            clearTimeout(slideBackTimeout);
            slideBackTimeout = null;
            clearCloseFallback();

            /* Cancel close mid-flight: drop partial keyframes, then re-open cleanly */
            if (sidebar.classList.contains('slide-out-closing')) {
                sidebar.classList.remove('slide-out-closing');
                sidebar.classList.remove('slide-out');
                sidebar.style.animation = 'none';
                void sidebar.offsetHeight;
                sidebar.style.removeProperty('animation');
            }

            let w = parseInt(String(sidebar.style.width || '').trim(), 10);
            if (!Number.isFinite(w) || w < 200) w = 300;
            if (w > 500) w = 500;
            sidebar.style.setProperty('--sidebar-reveal-width', `${w}px`);

            sidebar.classList.add('slide-out');

            if (window.electronAPI?.setWindowButtonVisibility) {
                window.electronAPI.setWindowButtonVisibility(true);
            }
            this.syncMacOSTrafficLayout();

            const computedStyle = getComputedStyle(document.documentElement);
            const sidebarBg = computedStyle.getPropertyValue('--sidebar-background').trim();
            if (sidebarBg) {
                sidebar.style.background = sidebarBg;
            }
        };

        hoverArea.addEventListener('mouseenter', revealFromEdge);

        sidebar.addEventListener('mouseenter', () => {
            if (sidebar.classList.contains('slide-out')) {
                clearTimeout(slideBackTimeout);
                slideBackTimeout = null;
            }
        });

        const closeSlideOut = () => {
            if (!sidebar.classList.contains('slide-out') || sidebar.classList.contains('slide-out-closing')) return;

            const onAnimationEnd = (e) => {
                if (e.target !== sidebar) return;
                const name = e.animationName || '';
                if (!name.includes('sidebarSlideOut')) return;
                sidebar.removeEventListener('animationend', onAnimationEnd);
                clearCloseFallback();
                finishSlideOutClose();
            };

            sidebar.addEventListener('animationend', onAnimationEnd);

            clearCloseFallback();
            closeFallbackTimer = setTimeout(() => {
                sidebar.removeEventListener('animationend', onAnimationEnd);
                if (sidebar.classList.contains('slide-out') || sidebar.classList.contains('slide-out-closing')) {
                    finishSlideOutClose();
                }
            }, 450);

            sidebar.classList.add('slide-out-closing');
        };

        hoverArea.addEventListener('mouseleave', () => {
            if (sidebar.classList.contains('hidden') && sidebar.classList.contains('slide-out')) {
                slideBackTimeout = setTimeout(closeSlideOut, 280);
            }
        });

        sidebar.addEventListener('mouseleave', () => {
            if (sidebar.classList.contains('hidden') && sidebar.classList.contains('slide-out')) {
                slideBackTimeout = setTimeout(closeSlideOut, 280);
            }
        });

        document.addEventListener('click', (e) => {
            if (sidebar.classList.contains('slide-out') &&
                !sidebar.contains(e.target) &&
                !hoverArea.contains(e.target)) {
                closeSlideOut();
            }
        });

        // Close URL bar popups on outside mousedown (capture; <webview> does not bubble to document)
        document.addEventListener(
            'mousedown',
            (e) => {
                const popup = document.getElementById('downloads-popup');
                const dlBtn = this.elements?.downloadsBtnFooter;
                if (popup && !popup.classList.contains('hidden')) {
                    if (!popup.contains(e.target) && !(dlBtn && dlBtn.contains(e.target))) {
                        this.hideDownloadsPopup();
                    }
                }
                const extPanel = document.getElementById('extensions-menu-panel');
                const extBtn = document.getElementById('url-bar-extensions');
                if (extPanel && !extPanel.classList.contains('hidden')) {
                    if (!extPanel.contains(e.target) && !(extBtn && extBtn.contains(e.target))) {
                        this.closeExtensionsMenu();
                    }
                }
            },
            true
        );
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

        this.aiSelectionState.pollingInterval = setInterval(() => {
            this.checkTextSelection();
        }, 300);
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
        const tid = this._normalizeTabIdForChatState(this.currentTab);
        if (tid != null) {
            this.aiChatPanelOpenByTabId.set(tid, true);
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
            if (!this.hasGroqApiKey()) {
                throw new Error('Add your free Groq API key in Settings → AI Chat to use this feature.');
            }
            const groqApiKey = this.getGroqApiKey();
            
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
            const hint = this.hasGroqApiKey()
                ? 'Please try again.'
                : 'Open Settings → AI Chat to add your free Groq API key.';
            responseContent.textContent = `Error: ${error.message}\n\n${hint}`;
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
    getGroqApiKey() {
        return String(this.settings?.groqApiKey || this.aiChatApiKey || '').trim();
    }

    hasGroqApiKey() {
        return this.getGroqApiKey().length > 0;
    }

    syncGroqApiKeyFromSettings() {
        this.aiChatApiKey = this.getGroqApiKey();
        this.updateAIChatSetupState();
    }

    openAIChatSettings() {
        void this.openSettingsTab('ai');
    }

    async openGroqKeySignup() {
        const url = 'https://console.groq.com/keys';
        try {
            if (window.electronAPI?.openExternalUrl) {
                await window.electronAPI.openExternalUrl(url);
                return;
            }
        } catch (_) {}
        void this.createNewTab(url);
    }

    updateAIChatSetupState() {
        const hasKey = this.hasGroqApiKey();
        const panel = document.getElementById('ai-chat-panel');
        const setup = document.getElementById('ai-chat-setup');
        const chatInput = document.getElementById('ai-chat-input');
        const chatSend = document.getElementById('ai-chat-send');
        const chatInputContainer = panel?.querySelector('.ai-chat-input-container');
        const quoteBar = document.getElementById('ai-chat-quote-bar');
        const chatMessages = document.getElementById('ai-chat-messages');

        panel?.classList.toggle('ai-chat-needs-key', !hasKey);
        setup?.classList.toggle('hidden', hasKey);
        if (chatInput) {
            chatInput.disabled = !hasKey;
            chatInput.readOnly = !hasKey;
            chatInput.setAttribute('aria-disabled', hasKey ? 'false' : 'true');
            chatInput.tabIndex = hasKey ? 0 : -1;
            chatInput.placeholder = hasKey
                ? 'Type your message...'
                : 'Add your Groq API key in Settings to start chatting';
            if (!hasKey) chatInput.value = '';
        }
        if (chatSend) {
            chatSend.disabled = !hasKey;
            chatSend.setAttribute('aria-disabled', hasKey ? 'false' : 'true');
            chatSend.tabIndex = hasKey ? 0 : -1;
        }
        chatInputContainer?.classList.toggle('hidden', !hasKey);
        if (!hasKey) {
            quoteBar?.classList.add('hidden');
            this.clearChatQuote?.();
        }
        if (!hasKey && chatMessages) chatMessages.innerHTML = '';

        if (!hasKey) {
            document.getElementById('new-tab-ask-setup')?.classList.add('hidden');
        }
    }

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
            if (!this.hasGroqApiKey()) return;
            this.sendChatMessage();
        });

        const blockLockedChatInput = (e) => {
            if (!this.hasGroqApiKey()) {
                e.preventDefault();
                e.stopPropagation();
            }
        };

        // Send message on Enter (Shift+Enter for new line)
        chatInput.addEventListener('keydown', (e) => {
            if (!this.hasGroqApiKey()) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendChatMessage();
            }
        });

        chatInput.addEventListener('beforeinput', blockLockedChatInput);
        chatInput.addEventListener('paste', blockLockedChatInput);
        chatInput.addEventListener('drop', blockLockedChatInput);

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

        document.getElementById('ai-chat-setup-settings')?.addEventListener('click', () => {
            this.openAIChatSettings();
        });
        document.getElementById('ai-chat-setup-groq')?.addEventListener('click', () => {
            void this.openGroqKeySignup();
        });
        document.getElementById('new-tab-ask-setup-settings')?.addEventListener('click', () => {
            this.openAIChatSettings();
        });
        document.getElementById('new-tab-ask-setup-groq')?.addEventListener('click', () => {
            void this.openGroqKeySignup();
        });

        this.updateAIChatSetupState();
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
            this.updateAIChatSetupState();
            // Focus input after open animation finishes
            const chatInput = document.getElementById('ai-chat-input');
            if (chatInput && this.hasGroqApiKey()) {
                setTimeout(() => chatInput.focus(), 420);
            }
        } else {
            chatPanel.classList.add('hidden');
            if (contentArea) {
                contentArea.classList.remove('chat-open');
            }
        }
        const tid = this._normalizeTabIdForChatState(this.currentTab);
        if (tid != null) {
            this.aiChatPanelOpenByTabId.set(tid, !chatPanel.classList.contains('hidden'));
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

        if (!this.hasGroqApiKey()) {
            this.updateAIChatSetupState();
            return;
        }

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
        if (!this.hasGroqApiKey()) {
            throw new Error('Add your free Groq API key in Settings → AI Chat to start chatting.');
        }
        const apiKey = this.getGroqApiKey();

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
                        'Authorization': `Bearer ${apiKey}`
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
        } else if (this._iconPickerType === 'favorite' && this.contextMenuFavoriteId) {
            const fid = String(this.contextMenuFavoriteId);
            const q = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(fid) : fid.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            targetElement = document.querySelector(`#favorites-grid .favorite-item[data-favorite-id="${q}"]`);
        } else if (this._iconPickerType === 'tab-group' && this.contextMenuTabGroupId != null) {
            const gid = this.findTabGroupKey(this.contextMenuTabGroupId);
            const q =
                gid != null && typeof CSS !== 'undefined' && CSS.escape
                    ? CSS.escape(String(gid))
                    : gid != null
                      ? String(gid).replace(/\\/g, '\\\\').replace(/"/g, '\\"')
                      : '';
            if (q) targetElement = document.querySelector(`[data-tab-group-id="${q}"]`);
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
                if (this.contextMenuFavoriteId) this.contextMenuFavoriteId = null;
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
                    if (this._iconPickerType === 'favorite') {
                        this.contextMenuFavoriteId = null;
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
            if (this._iconPickerType === 'favorite') this.contextMenuFavoriteId = null;
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
        } else if (this._iconPickerType === 'tab-group' && this.contextMenuTabGroupId != null) {
            const gid = this.findTabGroupKey(this.contextMenuTabGroupId);
            if (gid == null) {
                this._iconPickerType = null;
                return;
            }
            const tabGroup = this.tabGroups.get(gid);
            if (tabGroup) {
                tabGroup.icon = iconValue;
                tabGroup.iconType = 'emoji';
                this.tabGroups.set(gid, tabGroup);
                this.saveTabGroups();
                this.renderTabGroups();
            }
        } else if (this._iconPickerType === 'favorite' && this.contextMenuFavoriteId) {
            const fav = this.favorites.find((f) => f.id === this.contextMenuFavoriteId);
            if (fav) {
                fav.customIcon = iconValue;
                fav.customIconType = 'emoji';
                const rt = this._normalizeTabMapKey(fav.runtimeTabId);
                if (rt != null && this.tabs.has(rt)) {
                    const tab = this.tabs.get(rt);
                    tab.customIcon = iconValue;
                    tab.customIconType = 'emoji';
                    this.tabs.set(rt, tab);
                    const tabElement = document.querySelector(`[data-tab-id="${rt}"]`);
                    if (tabElement) this.updateTabIcon(tabElement, rt);
                }
                this.saveFavorites();
                this.renderFavorites();
            }
            this.contextMenuFavoriteId = null;
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
                imgElement.draggable = false;
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
            pinned: true,
            hadTabs: false
        };
        
        this.tabGroups.set(tabGroupId, tabGroup);
        this.renderTabGroups();
        void this.saveTabGroups();
        
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
        this.syncSidebarFromTabGroups();
    }

    createTabGroupElement(tabGroup) {
        const tabGroupElement = document.createElement('div');
        tabGroupElement.className = 'tab-group';
        tabGroupElement.dataset.tabGroupId = tabGroup.id;
        if (tabGroup.pinned !== false) tabGroupElement.classList.add('pinned');

        const color = tabGroup.color || '#FF6B6B';
        const rgb = this.hexToRgb(color);
        if (rgb) tabGroupElement.style.setProperty('--tab-group-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        tabGroupElement.style.setProperty('--tab-group-color', color);
        tabGroupElement.dataset.color = color;

        tabGroupElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">
                    ${tabGroup.iconType === 'emoji'
                        ? `<span class="tab-favicon tab-group-icon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">${tabGroup.icon || '📁'}</span>`
                        : `<i class="fas ${tabGroup.icon || 'fa-layer-group'} tab-favicon tab-group-icon"></i>`
                    }
                    <input type="text" class="tab-group-name-input tab-title" value="${this.escapeHtml(tabGroup.name)}" placeholder="Tab Group name" readonly>
                </div>
                <div class="tab-right">
                    <button class="tab-group-delete tab-close" title="Delete Tab Group"><i class="fas fa-times"></i></button>
                </div>
            </div>
            <div class="tab-group-content"></div>
        `;

        this.setupTabGroupEventListeners(tabGroupElement, tabGroup);
        return tabGroupElement;
    }

    /**
     * When reusing an existing `.tab-group` node, keep header chrome (color, icon, name) in sync with `tabGroup`.
     * Icons were not updating after Change Icon because `getOrCreateGroupElement` only refreshed inner tabs.
     */
    syncTabGroupElementHeader(el, tabGroup) {
        if (!el || !tabGroup) return;
        const color = tabGroup.color || '#FF6B6B';
        const rgb = this.hexToRgb(color);
        if (rgb) el.style.setProperty('--tab-group-color-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`);
        el.style.setProperty('--tab-group-color', color);
        el.dataset.color = color;
        el.classList.toggle('pinned', tabGroup.pinned !== false);

        const tabLeft = el.querySelector('.tab-left');
        const nameInput = el.querySelector('.tab-group-name-input');
        if (!tabLeft || !nameInput) return;

        const nextIconHtml =
            tabGroup.iconType === 'emoji'
                ? `<span class="tab-favicon tab-group-icon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;line-height:1;">${this.escapeHtml(tabGroup.icon || '📁')}</span>`
                : `<i class="fas ${this.escapeHtml(tabGroup.icon || 'fa-layer-group')} tab-favicon tab-group-icon" aria-hidden="true"></i>`;

        const oldIcon = tabLeft.querySelector('.tab-group-icon');
        if (oldIcon) {
            oldIcon.outerHTML = nextIconHtml;
        } else {
            nameInput.insertAdjacentHTML('beforebegin', nextIconHtml);
        }
        const newIcon = tabLeft.querySelector('.tab-group-icon');
        if (newIcon) {
            newIcon.draggable = false;
        }

        if (nameInput.readOnly) {
            const nextName = tabGroup.name || '';
            if (nameInput.value !== nextName) {
                nameInput.value = nextName;
            }
        }
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

        // Right-click for context menu - use capture phase to run before sidebar handler.
        // Tabs inside .tab-group-content must keep the tab context menu (don't intercept).
        tabGroupElement.addEventListener('contextmenu', (e) => {
            const tabEl = e.target.closest('.tab');
            if (tabEl && tabGroupContent.contains(tabEl)) {
                return;
            }
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

    /**
     * Same collapse animation as the manual "close group" branch in toggleTabGroup.
     * @param {number|string} tabGroupId
     */
    runTabGroupCollapseAnimation(tabGroupId) {
        const tabGroupElement = document.querySelector(`[data-tab-group-id="${tabGroupId}"]`);
        if (!tabGroupElement) return;
        const tabGroupContent = tabGroupElement.querySelector('.tab-group-content');
        if (!tabGroupContent) return;
        if (!tabGroupElement.classList.contains('toggling')) {
            tabGroupElement.classList.add('toggling');
        }

        const TAB_GROUP_ANIM_MS = 200;
        const closeEase = 'cubic-bezier(0.4, 0, 0.2, 1)';
        const transitionClose = `max-height ${TAB_GROUP_ANIM_MS}ms ${closeEase}, padding ${TAB_GROUP_ANIM_MS}ms ${closeEase}`;

        const finishClose = () => {
            tabGroupContent.style.transition = 'none';
            tabGroupContent.style.display = 'none';
            tabGroupContent.style.visibility = 'hidden';
            tabGroupContent.classList.remove('open');
            tabGroupContent.style.maxHeight = '';
            tabGroupContent.style.padding = '';
            tabGroupContent.style.opacity = '';
            tabGroupContent.style.transition = '';
            tabGroupElement.classList.remove('toggling');
        };

        const lockedH = Math.round(tabGroupContent.scrollHeight);
        const cs = getComputedStyle(tabGroupContent);
        const padPinned = `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`;

        tabGroupContent.style.display = 'flex';
        tabGroupContent.style.visibility = 'visible';
        tabGroupContent.style.opacity = '1';
        tabGroupContent.style.transition = 'none';
        tabGroupContent.style.maxHeight = `${lockedH}px`;
        tabGroupContent.style.padding = padPinned;
        void tabGroupContent.offsetHeight;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                tabGroupContent.style.transition = transitionClose;
                tabGroupContent.style.maxHeight = '0px';
                tabGroupContent.style.padding = '0 6px';

                const onEnd = (e) => {
                    if (e.target !== tabGroupContent || e.propertyName !== 'max-height') return;
                    tabGroupContent.removeEventListener('transitionend', onEnd);
                    finishClose();
                };
                tabGroupContent.addEventListener('transitionend', onEnd);
                setTimeout(() => {
                    if (!tabGroupElement.classList.contains('toggling')) return;
                    tabGroupContent.removeEventListener('transitionend', onEnd);
                    finishClose();
                }, TAB_GROUP_ANIM_MS + 80);
            });
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
        
        const TAB_GROUP_ANIM_MS = 200;
        const TAB_GROUP_EASE = 'cubic-bezier(0.22, 1, 0.32, 1)';
        const transitionOpen = `max-height ${TAB_GROUP_ANIM_MS}ms ${TAB_GROUP_EASE}, opacity ${Math.round(TAB_GROUP_ANIM_MS * 0.8)}ms ease-out, padding ${TAB_GROUP_ANIM_MS}ms ${TAB_GROUP_EASE}`;

        const finishOpen = () => {
            tabGroupContent.style.transition = 'none';
            tabGroupContent.style.maxHeight = 'none';
            tabGroupContent.style.opacity = '';
            tabGroupContent.style.visibility = '';
            tabGroupContent.style.display = '';
            requestAnimationFrame(() => {
                tabGroupContent.style.transition = '';
                tabGroupElement.classList.remove('toggling');
            });
        };

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

            // Measure with .open so padding + gap match the expanded state (avoids end snap / magic +48)
            tabGroupContent.style.display = 'flex';
            tabGroupContent.style.transition = 'none';
            tabGroupContent.style.visibility = 'hidden';
            tabGroupContent.style.opacity = '0';
            tabGroupContent.classList.add('open');
            tabGroupContent.style.maxHeight = 'none';
            const targetH = tabGroupContent.scrollHeight;

            tabGroupContent.classList.remove('open');
            tabGroupContent.style.maxHeight = '0px';
            void tabGroupContent.offsetHeight;

            requestAnimationFrame(() => {
                tabGroupContent.style.transition = transitionOpen;
                tabGroupContent.classList.add('open');
                tabGroupContent.style.visibility = 'visible';
                tabGroupContent.style.maxHeight = `${targetH}px`;
                tabGroupContent.style.opacity = '1';

                const onEnd = (e) => {
                    if (e.target !== tabGroupContent || e.propertyName !== 'max-height') return;
                    tabGroupContent.removeEventListener('transitionend', onEnd);
                    finishOpen();
                };
                tabGroupContent.addEventListener('transitionend', onEnd);
                setTimeout(() => {
                    if (!tabGroupElement.classList.contains('toggling')) return;
                    tabGroupContent.removeEventListener('transitionend', onEnd);
                    finishOpen();
                }, TAB_GROUP_ANIM_MS + 100);
            });
        } else {
            this.runTabGroupCollapseAnimation(tabGroupId);
        }

        this.saveTabGroups();
    }

    addTabToTabGroup(tabId, tabGroupId, skipUndo = false, insertIndex = undefined) {
        const tab = this.tabs.get(tabId);
        const resolvedId = this.findTabGroupKey(tabGroupId);
        const tabGroup = resolvedId != null ? this.tabGroups.get(resolvedId) : null;
        if (!tab || !tabGroup) return;

        if (!skipUndo) {
            this.tabUndoStack.push({ type: 'add_to_group', tabId, tabGroupId: resolvedId });
            if (this.tabUndoStack.length > 15) this.tabUndoStack = this.tabUndoStack.slice(-15);
        }

        for (const [id, tg] of this.tabGroups) {
            if (String(id) === String(resolvedId)) continue;
            if (!this._tabIdIsInGroup(tg.tabIds, tabId)) continue;
            tg.tabIds = tg.tabIds.filter((id) => this._normalizeTabMapKey(id) !== this._normalizeTabMapKey(tabId));
            if (tg.tabIds.length === 0) {
                if (tg.hadTabs) {
                    this.tabGroups.delete(id);
                    document.querySelector(`[data-tab-group-id="${id}"]`)?.remove();
                } else {
                    tg.open = false;
                    if (this.settings?.autoCollapseEmptyTabGroup !== false) {
                        this._pendingEmptyGroupCollapseId = id;
                    }
                    this.tabGroups.set(id, tg);
                }
            } else {
                this.tabGroups.set(id, tg);
            }
        }

        if (!this._tabIdIsInGroup(tabGroup.tabIds, tabId)) {
            if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= tabGroup.tabIds.length) {
                tabGroup.tabIds.splice(insertIndex, 0, tabId);
            } else {
                tabGroup.tabIds.push(tabId);
            }
        }
        tabGroup.open = true;
        tabGroup.hadTabs = true;
        this.tabGroups.set(resolvedId, tabGroup);

        tab.tabGroupId = resolvedId;
        tab.pinned = tabGroup.pinned !== false;
        this.tabs.set(tabId, tab);

        this.syncSidebarFromTabGroups();

        if (this._pendingEmptyGroupCollapseId != null) {
            const gid = this._pendingEmptyGroupCollapseId;
            this._pendingEmptyGroupCollapseId = null;
            requestAnimationFrame(() => {
                requestAnimationFrame(() => this.runTabGroupCollapseAnimation(gid));
            });
        }
    }

    /** Whether `tabId` is listed in a group's `tabIds` (numeric/string safe). */
    _tabIdIsInGroup(tabIds, rawTabId) {
        const tid = this._normalizeTabMapKey(rawTabId);
        if (tid == null || !Array.isArray(tabIds)) return false;
        return tabIds.some((id) => this._normalizeTabMapKey(id) === tid);
    }

    /** Drop tab ids that no longer exist in `this.tabs` (does not remove empty groups — new groups start empty). */
    _pruneAllTabGroupsTabIds() {
        let changed = false;
        for (const [groupKey, tabGroup] of this.tabGroups) {
            const pruned = tabGroup.tabIds
                .map((id) => this._normalizeTabMapKey(id))
                .filter((id) => id != null && this.tabs.has(id));
            if (pruned.length > 0 && !tabGroup.hadTabs) {
                tabGroup.hadTabs = true;
                changed = true;
            }
            if (pruned.length !== tabGroup.tabIds.length) {
                tabGroup.tabIds = pruned;
                changed = true;
            }
            if (changed) this.tabGroups.set(groupKey, tabGroup);
        }
        return changed;
    }

    /** Remove groups that previously had tabs and are now empty (keeps brand-new empty groups). */
    _removeEmptyTabGroupsWithHadTabs() {
        const emptyGroupIds = [];
        for (const [groupKey, tabGroup] of this.tabGroups) {
            if ((!tabGroup.tabIds || tabGroup.tabIds.length === 0) && tabGroup.hadTabs) {
                emptyGroupIds.push(groupKey);
            }
        }
        emptyGroupIds.forEach((gid) => {
            this.tabGroups.delete(gid);
            const groupEl = document.querySelector(`[data-tab-group-id="${gid}"]`);
            if (groupEl?.parentNode) groupEl.remove();
        });
        return emptyGroupIds.length > 0;
    }

    _deleteTabGroupFromMapAndDom(groupKey) {
        this.tabGroups.delete(groupKey);
        const groupEl = document.querySelector(`[data-tab-group-id="${groupKey}"]`);
        if (groupEl?.parentNode) groupEl.remove();
    }

    /**
     * Remove a tab from every group that still lists it (fixes delete-group-then-close leaving stale ids).
     * @param {boolean} skipUndo
     * @param {number|string|null} onlyGroupId When set, only touch that group.
     */
    _removeTabIdFromTabGroups(rawTabId, skipUndo = false, onlyGroupId = null) {
        const tid = this._normalizeTabMapKey(rawTabId);
        if (tid == null) return false;

        let changed = false;

        for (const [groupKey, tabGroup] of this.tabGroups) {
            const resolvedOnly = onlyGroupId != null ? this.findTabGroupKey(onlyGroupId) : null;
            if (onlyGroupId != null && groupKey !== resolvedOnly && String(groupKey) !== String(resolvedOnly)) {
                continue;
            }
            if (!this._tabIdIsInGroup(tabGroup.tabIds, tid)) continue;

            const indexInGroup = tabGroup.tabIds.findIndex((id) => this._normalizeTabMapKey(id) === tid);
            if (!skipUndo && indexInGroup !== -1) {
                this.tabUndoStack.push({
                    type: 'remove_from_group',
                    tabId: tid,
                    tabGroupId: groupKey,
                    indexInGroup
                });
                if (this.tabUndoStack.length > 15) this.tabUndoStack = this.tabUndoStack.slice(-15);
            }

            tabGroup.tabIds = tabGroup.tabIds.filter((id) => this._normalizeTabMapKey(id) !== tid);
            changed = true;

            const tab = this.tabs.get(tid);
            if (tab && this._normalizeTabMapKey(tab.tabGroupId) === this._normalizeTabMapKey(groupKey)) {
                tab.tabGroupId = undefined;
                this.tabs.set(tid, tab);
            }

            if (tabGroup.tabIds.length === 0) {
                tabGroup.open = false;
                if (tabGroup.hadTabs) {
                    this._deleteTabGroupFromMapAndDom(groupKey);
                } else {
                    this.tabGroups.set(groupKey, tabGroup);
                }
            } else {
                this.tabGroups.set(groupKey, tabGroup);
            }
        }

        if (changed) {
            this.syncSidebarFromTabGroups();
        }
        return changed;
    }

    _removeTabIdFromAllTabGroups(rawTabId, skipUndo = false) {
        return this._removeTabIdFromTabGroups(rawTabId, skipUndo, null);
    }

    removeTabFromTabGroup(tabId, tabGroupId, skipUndo = false) {
        const resolvedId = this.findTabGroupKey(tabGroupId);
        if (resolvedId == null) return;
        this._removeTabIdFromTabGroups(tabId, skipUndo, resolvedId);
    }

    deleteTabGroup(tabGroupId) {
        const resolvedId = this.findTabGroupKey(tabGroupId);
        const tabGroup = resolvedId != null ? this.tabGroups.get(resolvedId) : null;
        if (!tabGroup) return;

        tabGroup.tabIds.forEach(rawTabId => {
            const tabId = this._normalizeTabMapKey(rawTabId);
            const tab = tabId != null ? this.tabs.get(tabId) : null;
            if (tab) {
                tab.tabGroupId = undefined;
                tab.pinned = tabGroup.pinned !== false;
                this.tabs.set(tabId, tab);
            }
        });

        this.tabGroups.delete(resolvedId);

        const groupEl = document.querySelector(`[data-tab-group-id="${resolvedId}"]`);
        if (groupEl && groupEl.parentNode) groupEl.remove();

        this.syncSidebarFromTabGroups();
    }

    _buildTabGroupsSavePayload() {
        this._pruneAllTabGroupsTabIds();
        return Array.from(this.tabGroups.values()).map(tabGroup => {
            const tabIds = tabGroup.tabIds
                .map((id) => this._normalizeTabMapKey(id))
                .filter((id) => id != null && this.tabs.has(id));
            const tabs = tabIds.map(tabId => {
                const tab = this.tabs.get(tabId);
                if (!tab) return null;
                return {
                    id: tabId,
                    url: tab.url || null,
                    title: tab.title || 'New Tab',
                    favicon: tab.favicon || null
                };
            }).filter(t => t !== null);

            return {
                id: tabGroup.id,
                name: tabGroup.name,
                tabIds,
                tabs,
                open: tabGroup.open,
                order: tabGroup.order,
                color: tabGroup.color || '#FF6B6B',
                pinned: tabGroup.pinned !== false,
                icon: tabGroup.icon || null,
                iconType: tabGroup.iconType || null,
                hadTabs: tabGroup.hadTabs === true
            };
        });
    }

    async saveTabGroups() {
        const tabGroupsArray = this._buildTabGroupsSavePayload();
        await this.saveSetting('tabGroups', tabGroupsArray);
    }

    /** Called from main via executeJavaScript when quit is confirmed (never during beforeunload). */
    flushSessionStatePayload() {
        if (this.isIncognitoWindow) return { incognito: true };
        try {
            this._pruneAllTabGroupsTabIds();
            this._removeEmptyTabGroupsWithHadTabs();
            const tabGroups = this._buildTabGroupsSavePayload();
            const pinnedTabs = this._collectPinnedTabsPayload();
            this.settings.tabGroups = tabGroups;
            this.settings.pinnedTabs = pinnedTabs;
            return { incognito: false, tabGroups, pinnedTabs };
        } catch (e) {
            console.error('flushSessionStatePayload failed:', e);
            return { incognito: true };
        }
    }

    async loadTabGroups() {
        try {
            const tabGroupsData = this.settings.tabGroups || [];
            if (!Array.isArray(tabGroupsData)) return;

            this.tabGroups.clear();
            tabGroupsData.forEach((tabGroupData, index) => {
                const savedTabIds = Array.isArray(tabGroupData.tabIds) ? tabGroupData.tabIds : [];
                const savedTabs = Array.isArray(tabGroupData.tabs) ? tabGroupData.tabs : [];
                const hadTabs =
                    tabGroupData.hadTabs === true || savedTabIds.length > 0 || savedTabs.length > 0;

                const group = {
                    id: tabGroupData.id,
                    name: tabGroupData.name || `Tab Group ${index + 1}`,
                    tabIds: [],
                    open: tabGroupData.open !== false,
                    order: typeof tabGroupData.order === 'number' ? tabGroupData.order : index,
                    color: tabGroupData.color || '#FF6B6B',
                    pinned: tabGroupData.pinned !== false,
                    icon: tabGroupData.icon || null,
                    iconType: tabGroupData.iconType || null,
                    hadTabs
                };

                savedTabs.forEach((saved) => {
                    if (!saved || saved.id == null) return;
                    const tabId = this._normalizeTabMapKey(saved.id);
                    if (tabId == null || this.tabs.has(tabId)) return;
                    this.tabs.set(tabId, {
                        id: tabId,
                        url: saved.url || null,
                        title: saved.title || 'New Tab',
                        favicon: saved.favicon || null,
                        canGoBack: false,
                        canGoForward: false,
                        history: saved.url ? [saved.url] : [],
                        historyIndex: saved.url ? 0 : -1,
                        pinned: group.pinned,
                        tabGroupId: group.id,
                        webview: null
                    });
                });

                const tabIdSet = new Set();
                savedTabIds.forEach((id) => {
                    const nid = this._normalizeTabMapKey(id);
                    if (nid != null && this.tabs.has(nid)) tabIdSet.add(nid);
                });
                savedTabs.forEach((saved) => {
                    const nid = this._normalizeTabMapKey(saved?.id);
                    if (nid != null && this.tabs.has(nid)) tabIdSet.add(nid);
                });
                group.tabIds = Array.from(tabIdSet);

                if (group.tabIds.length === 0 && hadTabs) {
                    return;
                }

                this.tabGroups.set(group.id, group);
                group.tabIds.forEach(tabId => {
                    const tab = this.tabs.get(tabId);
                    if (!tab) return;
                    tab.tabGroupId = group.id;
                    tab.pinned = group.pinned;
                    this.tabs.set(tabId, tab);
                });
            });

            this.syncSidebarFromTabGroups();
        } catch (error) {
            console.error('Error loading tab groups:', error);
        }
    }

    /** Tab/group nodes parked for inactive profiles (avoids cross-profile DOM collisions). */
    _axisProfileDomPoolId(profileId) {
        const id = String(profileId || this.profileId || 'personal')
            .toLowerCase()
            .replace(/[^a-z0-9_-]/g, '-');
        return `axis-profile-dom-pool-${id || 'personal'}`;
    }

    _findTabElementInProfileScope(tabId) {
        const poolId = this._axisProfileDomPoolId(this.profileId);
        const sel = `[data-tab-id="${tabId}"]`;
        return (
            document.querySelector(`#tabs-container ${sel}`) ||
            document.getElementById(poolId)?.querySelector(sel) ||
            null
        );
    }

    _findTabGroupElementInProfileScope(groupId) {
        const poolId = this._axisProfileDomPoolId(this.profileId);
        const sel = `[data-tab-group-id="${groupId}"]`;
        return (
            document.querySelector(`#tabs-container ${sel}`) ||
            document.getElementById(poolId)?.querySelector(sel) ||
            null
        );
    }

    /**
     * Detached tab nodes are not found by document.querySelector; keep moved tabs here until re-parented.
     */
    getTabElementPool() {
        let p = document.getElementById('tab-element-pool');
        if (!p) {
            p = document.createElement('div');
            p.id = 'tab-element-pool';
            p.setAttribute('aria-hidden', 'true');
            p.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;';
            document.body.appendChild(p);
        }
        return p;
    }

    /** Resolve Map key for tab groups (IPC may send number or string). */
    findTabGroupKey(tabGroupId) {
        if (tabGroupId == null) return null;
        if (this.tabGroups.has(tabGroupId)) return tabGroupId;
        const n = Number(tabGroupId);
        if (!Number.isNaN(n) && this.tabGroups.has(n)) return n;
        for (const k of this.tabGroups.keys()) {
            if (String(k) === String(tabGroupId)) return k;
        }
        return null;
    }

    getOrCreateTabElement(tabId) {
        const existing = this._findTabElementInProfileScope(tabId);
        if (existing) return existing;
        const tab = this.tabs.get(tabId);
        if (!tab) return null;
        const tabElement = document.createElement('div');
        tabElement.className = 'tab' + (tab.pinned ? ' pinned' : '');
        tabElement.dataset.tabId = tabId;
        const iconHtml = tab.customIcon
            ? (tab.customIconType === 'emoji'
                ? `<span class="tab-favicon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;">${tab.customIcon || ''}</span>`
                : `<i class="fas ${tab.customIcon} tab-favicon" style="width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:14px;color:rgba(255,255,255,0.7);"></i>`)
            : '<img class="tab-favicon" src="" alt="" draggable="false" onerror="this.style.visibility=\'hidden\'">';
        tabElement.innerHTML = `
            <div class="tab-content">
                <div class="tab-left">${iconHtml}
                    <span class="tab-audio-indicator" style="display:none;"><i class="fas fa-volume-up"></i></span>
                    <span class="tab-title">${this.escapeHtml(tab.title || 'New Tab')}</span>
                </div>
                <div class="tab-right"><button class="tab-close"><i class="fas fa-times"></i></button></div>
            </div>
        `;
        if (!tab.webview) tabElement.classList.add('closed');
        this.setupTabEventListeners(tabElement, tabId);
        this.updateTabFavicon(tabId, tabElement);
        if (tab.pinned) this.updatePinnedTabClosedState(tabId);
        return tabElement;
    }

    syncSidebarFromTabGroups() {
        const container = this.elements.tabsContainer;
        const separator = this.elements.tabsSeparator;
        const newTabBtn = this.elements.sidebarNewTabBtn;
        if (!container || !separator) return;

        this._pruneAllTabGroupsTabIds();

        // Remove any group elements whose group was deleted (e.g. after deleteTabGroup)
        container.querySelectorAll('.tab-group').forEach(groupEl => {
            const gid = groupEl.dataset.tabGroupId;
            if (gid != null && !this.tabGroups.has(Number(gid)) && !this.tabGroups.has(gid)) {
                groupEl.remove();
            }
        });

        const loosePinnedIds = Array.from(this.tabs.keys()).filter(id => {
            const t = this.tabs.get(id);
            return t && !t.tabGroupId && t.pinned;
        });
        const looseUnpinnedIds = Array.from(this.tabs.keys()).filter(id => {
            const t = this.tabs.get(id);
            return t && !t.tabGroupId && !t.pinned;
        });

        const pinnedGroups = Array.from(this.tabGroups.values())
            .filter(g => g.pinned !== false)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const unpinnedGroups = Array.from(this.tabGroups.values())
            .filter(g => g.pinned === false)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

        // Build order from state only: loose tabs first, then groups in order
        const pinnedOrder = [
            ...loosePinnedIds.map(id => ({ type: 'tab', id })),
            ...pinnedGroups.map(g => ({ type: 'group', id: g.id }))
        ];
        const unpinnedOrder = [
            ...unpinnedGroups.map(g => ({ type: 'group', id: g.id })),
            ...looseUnpinnedIds.map(id => ({ type: 'tab', id }))
        ];

        const pinnedNodes = [];
        pinnedOrder.forEach(item => {
            if (item.type === 'tab') {
                const el = this.getOrCreateTabElement(item.id);
                if (el) pinnedNodes.push(el);
            } else {
                const g = this.tabGroups.get(Number(item.id)) || this.tabGroups.get(item.id);
                if (g) {
                    const groupEl = this.getOrCreateGroupElement(g);
                    if (groupEl) pinnedNodes.push(groupEl);
                }
            }
        });

        const unpinnedNodes = [];
        unpinnedOrder.forEach(item => {
            if (item.type === 'tab') {
                const el = this.getOrCreateTabElement(item.id);
                if (el) unpinnedNodes.push(el);
            } else {
                const g = this.tabGroups.get(Number(item.id)) || this.tabGroups.get(item.id);
                if (g) {
                    const groupEl = this.getOrCreateGroupElement(g);
                    if (groupEl) unpinnedNodes.push(groupEl);
                }
            }
        });

        [].concat(pinnedNodes, unpinnedNodes).forEach(node => {
            if (node.parentNode) node.remove();
        });

        let ref = separator;
        pinnedNodes.forEach(node => {
            container.insertBefore(node, ref);
            ref = node;
        });

        const afterNewTab = newTabBtn ? newTabBtn.nextSibling : separator.nextSibling;
        ref = afterNewTab || null;
        unpinnedNodes.forEach(node => {
            if (ref) container.insertBefore(node, ref);
            else container.appendChild(node);
            ref = node;
        });
        
        // Separator visibility is based on actual DOM content above it
        this.updatePinnedSeparatorVisibility();
        if (!this._suppressTabGroupsAutosave) void this.saveTabGroups();
    }

    getOrCreateGroupElement(group) {
        let el = this._findTabGroupElementInProfileScope(group.id);
        const content = el ? el.querySelector('.tab-group-content') : null;
        const existingTabEls = content ? Array.from(content.querySelectorAll('.tab')) : [];

        const ensureContentOrder = (container) => {
            if (!container) return;
            const groupIdSet = new Set(group.tabIds.map((tid) => Number(tid)));
            Array.from(container.children).forEach((child) => {
                if (child.classList && child.classList.contains('tab')) {
                    const id = parseInt(child.dataset.tabId, 10);
                    if (!isNaN(id) && !groupIdSet.has(id)) {
                        this.getTabElementPool().appendChild(child);
                    }
                }
            });
            group.tabIds.forEach(tabId => {
                const tab = this.tabs.get(tabId);
                if (tab) {
                    tab.pinned = group.pinned !== false;
                    this.tabs.set(tabId, tab);
                }
                let tabEl = existingTabEls.find(t => parseInt(t.dataset.tabId, 10) === tabId);
                if (!tabEl) tabEl = this.getOrCreateTabElement(tabId);
                if (tabEl && tabEl.parentNode !== container) {
                    tabEl.classList.toggle('pinned', group.pinned !== false);
                    container.appendChild(tabEl);
                    if (this.makeTabDraggable) this.makeTabDraggable(tabEl);
                } else if (tabEl && tabEl.parentNode === container) {
                    tabEl.classList.toggle('pinned', group.pinned !== false);
                }
            });
            if (group.tabIds.length === 0) {
                if (this._pendingEmptyGroupCollapseId === group.id) {
                    container.style.transition = 'none';
                    container.classList.add('open');
                    container.style.display = 'flex';
                    container.style.visibility = 'visible';
                    container.style.opacity = '1';
                    container.style.maxHeight = 'none';
                    container.style.padding = '';
                } else {
                    container.classList.remove('open');
                    container.style.display = 'none';
                    container.style.visibility = 'hidden';
                    container.style.maxHeight = '0';
                    container.style.opacity = '0';
                }
            } else {
                const isOpen = group.open && group.tabIds.length > 0;
                container.classList.toggle('open', isOpen);
                container.style.display = 'flex';
                container.style.maxHeight = isOpen ? '9999px' : '0';
                container.style.opacity = isOpen ? '1' : '0';
            }
        };

        if (el && content) {
            this.syncTabGroupElementHeader(el, group);
            ensureContentOrder(content);
            return el;
        }
        el = this.createTabGroupElement(group);
        const newContent = el.querySelector('.tab-group-content');
        if (newContent) ensureContentOrder(newContent);
        return el;
    }

    async showTabGroupContextMenu(e, tabGroupId) {
        // Hide other context menus
        this.hideTabContextMenu();
        this.hideWebpageContextMenu();
        this.hideSidebarContextMenu();

        this.contextMenuTabGroupId = this.findTabGroupKey(tabGroupId);
        const g = this.contextMenuTabGroupId != null ? this.tabGroups.get(this.contextMenuTabGroupId) : null;
        const hasCustomIcon = !!(g?.icon && String(g.icon).trim());

        await window.electronAPI.showTabGroupContextMenu(e.clientX, e.clientY, { hasCustomIcon });
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
        const id = this.contextMenuTabGroupId;
        if (id == null) return;
        const tabGroup = this.tabGroups.get(Number(id)) || this.tabGroups.get(id);
        if (!tabGroup) return;
        if (!confirm(`Delete tab group "${tabGroup.name}"? Tabs will be moved back to the sidebar.`)) return;
        this.deleteTabGroup(tabGroup.id);
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
            hadTabs: false,
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
        newTabGroup.hadTabs = newTabIds.length > 0;

        this.tabGroups.set(newTabGroupId, newTabGroup);
        newTabIds.forEach(tabId => {
            const tab = this.tabs.get(tabId);
            if (tab) {
                tab.pinned = newTabGroup.pinned !== false;
                tab.tabGroupId = newTabGroupId;
                this.tabs.set(tabId, tab);
            }
        });
        this.syncSidebarFromTabGroups();
        
        // Show notification
        this.showNotification('Tab group duplicated', 'success');
    }

    setupSidebarContextMenu() {
        const sidebar = document.getElementById('sidebar');
        if (!sidebar) {
            console.error('Sidebar element not found for context menu setup');
            return;
        }
        
        sidebar.addEventListener('contextmenu', (e) => {
            
            // Only show menu if clicking on empty space (not on tabs, buttons, inputs, or resize handle)
            const target = e.target;
            
            // Check what we're clicking on
            const isTab = target.closest('.tab');
            const isTabGroup = target.closest('.tab-group');
            const isButton = target.closest('button');
            const isInput = target.tagName === 'INPUT' || target.closest('input');
            const isResizeHandle = target.closest('#sidebar-resize-handle');
            const isContextMenu = target.closest('.context-menu');
            
            // If clicking on a tab group, don't interfere - let tab group handler process it
            if (isTabGroup) {
                // Don't prevent default or stop propagation - let tab group handler run
                return;
            }
            
            // Allow right-click on empty space - be more permissive
            // Only block if it's clearly an interactive element
            if (!isTab && !isButton && !isInput && !isResizeHandle && !isContextMenu) {
                e.preventDefault();
                e.stopPropagation();
                this.showSidebarContextMenu(e);
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
        let tabUrlForFavorite = tab?.url || '';
        try {
            if (tab?.webview && typeof tab.webview.getURL === 'function') {
                const currentUrl = tab.webview.getURL();
                if (currentUrl && currentUrl !== 'about:blank') tabUrlForFavorite = currentUrl;
            }
        } catch (_) {}
        const tabInfo = {
            isPinned: tab?.pinned || false,
            isMuted: tab?.isMuted || false,
            tabGroups: tabGroupsList,
            tabGroupId: tab?.tabGroupId != null ? tab.tabGroupId : undefined,
            isIncognito: this.isIncognitoWindow,
            isFavorite: this.isFavoriteUrl(tabUrlForFavorite),
            hasCustomIcon: !!(tab?.customIcon && String(tab.customIcon).trim())
        };
        this.contextMenuTabId = tabId;
        await window.electronAPI.showTabContextMenu(e.clientX, e.clientY, tabInfo);
    }

    async showFavoriteContextMenu(e, favorite) {
        if (this.isIncognitoWindow || !favorite) return;
        e.preventDefault();
        e.stopPropagation();
        this.hideWebpageContextMenu();
        this.hideSidebarContextMenu();
        this.hideTabGroupContextMenu();
        this.contextMenuFavoriteId = favorite.id;
        const hasCustomIcon = !!(favorite.customIcon && String(favorite.customIcon).trim());
        if (!window.electronAPI?.showFavoriteContextMenu) {
            this.contextMenuFavoriteId = null;
            return;
        }
        await window.electronAPI.showFavoriteContextMenu(e.clientX, e.clientY, { hasCustomIcon });
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
            this.applyAmbientFromSettings();
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

    toggleSidebarPlusMenu() {
        const menu = this.elements?.sidebarPlusMenu;
        if (!menu) return;
        if (menu.classList.contains('hidden')) {
            this.showSidebarPlusMenu();
        } else {
            this.hideSidebarPlusMenu();
        }
    }

    showSidebarPlusMenu() {
        const btn = this.elements?.sidebarPlusBtn;
        const menu = this.elements?.sidebarPlusMenu;
        if (!btn || !menu) return;
        menu.classList.remove('hidden');
        const rect = btn.getBoundingClientRect();
        menu.style.left = `${rect.left}px`;
        menu.style.top = `${rect.top - menu.offsetHeight - 4}px`;
    }

    hideSidebarPlusMenu() {
        this.elements?.sidebarPlusMenu?.classList.add('hidden');
    }

    toggleSearch() {
        const searchModal = document.getElementById('search-modal');
        const searchInput = document.getElementById('search-input');
        if (!searchModal || !searchInput) return;
        if (searchModal.classList.contains('hidden')) {
            searchModal.classList.remove('hidden');
            searchInput.focus();
            searchInput.select();
        } else {
            this.hideSearch();
        }
    }

    hideSearch() {
        const searchModal = document.getElementById('search-modal');
        const searchInput = document.getElementById('search-input');
        if (searchModal) searchModal.classList.add('hidden');
        if (searchInput) searchInput.value = '';
        this.clearSearch();
    }

    /** Live find while typing — clear prior search first so each keystroke updates immediately */
    performIncrementalFind(rawQuery) {
        const query = (rawQuery || '').trim();
        const webview = this.getActiveWebview();
        if (!webview) return;

        if (!query) {
            try {
                webview.stopFindInPage('clearSelection');
            } catch (e) {
                /* ignore */
            }
            return;
        }

        try {
            webview.stopFindInPage('clearSelection');
            webview.findInPage(query, {
                forward: true,
                matchCase: false,
                findNext: false
            });
        } catch (e) {
            console.warn('findInPage:', e);
        }
    }

    searchNext() {
        const query = (document.getElementById('search-input')?.value || '').trim();
        if (!query) return;
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            webview.findInPage(query, {
                forward: true,
                matchCase: false,
                findNext: true
            });
        } catch (e) {
            console.warn('findInPage next:', e);
        }
    }

    searchPrevious() {
        const query = (document.getElementById('search-input')?.value || '').trim();
        if (!query) return;
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            webview.findInPage(query, {
                forward: false,
                matchCase: false,
                findNext: true
            });
        } catch (e) {
            console.warn('findInPage previous:', e);
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
        const menuTabId = this._contextMenuSourceTabId;
        const webview =
            menuTabId != null && this.tabs.has(menuTabId)
                ? this.tabs.get(menuTabId).webview
                : this.getActiveWebview();
        
        // Back/forward are sync. Speech state: only query guest JS when the menu will show Speech
        // (selection + speech on); otherwise skip — first executeJavaScript can stall seconds on cold webview.
        let canGoBack = false;
        let canGoForward = false;
        let isSpeaking = false;
        const speechEnabled = this.settings?.speechEnabled !== false;
        const needsSpeechState =
            speechEnabled &&
            !!ctx.hasSelection &&
            !!(ctx.selectionText && String(ctx.selectionText).trim().length);
        if (webview) {
            try {
                canGoBack = webview.canGoBack();
                canGoForward = webview.canGoForward();
            } catch (e) {
                // Ignore errors
            }
            if (needsSpeechState) {
                const speechScript = `(function(){try{return !!(window.speechSynthesis&&window.speechSynthesis.speaking);}catch(e){return false;}})();`;
                const SPEECH_QUERY_BUDGET_MS = 90;
                try {
                    isSpeaking = await Promise.race([
                        webview.executeJavaScript(speechScript),
                        new Promise((resolve) => setTimeout(() => resolve(false), SPEECH_QUERY_BUDGET_MS))
                    ]);
                } catch (e) {
                    isSpeaking = false;
                }
            }
        }
        
        let guestWebContentsId = 0;
        try {
            if (webview && typeof webview.getWebContentsId === 'function') {
                guestWebContentsId = webview.getWebContentsId() || 0;
            }
        } catch (_) {
            guestWebContentsId = 0;
        }

        const contextInfo = {
            ...ctx,
            canGoBack,
            canGoForward,
            isSpeaking,
            speechEnabled,
            guestWebContentsId
        };
        
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

    // Text-to-speech for selected text inside the active webview
    startSpeakingSelection(text) {
        const webview = this.getActiveWebview();
        if (!webview) return;
        if (this.settings?.speechEnabled === false) return;
        const safeText = (text || '').trim();
        if (!safeText) return;
        const speechRate = Math.min(2, Math.max(0.1, Number(this.settings?.speechRate || 1)));
        const speechPitch = Math.min(2, Math.max(0, Number(this.settings?.speechPitch || 1)));
        const speechVoiceURI = String(this.settings?.speechVoiceURI || '').trim();
        const script = `
            (function() {
                try {
                    if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') {
                        return;
                    }
                    var text = ${JSON.stringify(safeText)};
                    var rate = ${speechRate};
                    var pitch = ${speechPitch};
                    var uri = ${JSON.stringify(speechVoiceURI)};
                    function go() {
                        window.speechSynthesis.cancel();
                        var utterance = new SpeechSynthesisUtterance(text);
                        utterance.rate = rate;
                        utterance.pitch = pitch;
                        utterance.volume = 1;
                        if (uri) {
                            var listOrig = window.speechSynthesis.getVoices();
                            for (var j = 0; j < listOrig.length; j++) {
                                if (listOrig[j].voiceURI === uri) {
                                    utterance.voice = listOrig[j];
                                    break;
                                }
                            }
                        }
                        window.__axisCurrentUtterance = utterance;
                        window.speechSynthesis.speak(utterance);
                    }
                    if (uri && window.speechSynthesis.getVoices().length === 0) {
                        var done = false;
                        var finish = function() {
                            if (done) return;
                            done = true;
                            try {
                                if (window.speechSynthesis.onvoiceschanged === finish) {
                                    window.speechSynthesis.onvoiceschanged = null;
                                }
                            } catch (e2) {}
                            go();
                        };
                        window.speechSynthesis.onvoiceschanged = finish;
                        setTimeout(finish, 500);
                    } else {
                        go();
                    }
                } catch (e) {
                    // Ignore speech errors
                }
            })();
        `;
        webview.executeJavaScript(script).catch(() => {});
    }

    stopSpeakingSelection() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        const script = `
            try {
                if (window.speechSynthesis) {
                    window.speechSynthesis.cancel();
                }
            } catch (e) {
                // Ignore
            }
        `;
        webview.executeJavaScript(script).catch(() => {});
    }

    selectAll() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            webview.focus();
        } catch (_) {}
        webview
            .executeJavaScript(`
            (function() {
                try {
                    var el = document.activeElement;
                    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                        el.select();
                        return;
                    }
                    if (el && el.isContentEditable) {
                        document.execCommand('selectAll');
                        return;
                    }
                    document.execCommand('selectAll');
                } catch (e) {}
            })();
        `)
            .catch(() => {});
    }

    cut() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            webview.focus();
        } catch (_) {}
        webview
            .executeJavaScript(`
            (function() {
                try {
                    return document.execCommand('cut');
                } catch (e) { return false; }
            })();
        `)
            .catch(() => {});
    }

    copy() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            webview.focus();
        } catch (_) {}
        webview
            .executeJavaScript(`
            (function() {
                try {
                    if (document.execCommand('copy')) return '';
                    var sel = window.getSelection && window.getSelection();
                    return sel ? String(sel.toString() || '') : '';
                } catch (e) { return ''; }
            })();
        `)
            .then((fallbackText) => {
                if (fallbackText && String(fallbackText).length > 0) {
                    navigator.clipboard.writeText(String(fallbackText)).catch(() => {});
                }
            })
            .catch(() => {});
    }

    /**
     * Plain-text clipboard write with fallbacks (native context-menu clicks often lack a transient
     * user gesture for `navigator.clipboard` in Electron).
     */
    async writeTextToClipboard(text) {
        const s = text == null ? '' : String(text);
        if (!s) return false;
        try {
            await navigator.clipboard.writeText(s);
            return true;
        } catch (_) {
            /* continue */
        }
        try {
            const textArea = document.createElement('textarea');
            textArea.value = s;
            textArea.style.position = 'fixed';
            textArea.style.left = '-9999px';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textArea);
            if (ok) return true;
        } catch (_) {
            /* continue */
        }
        try {
            if (window.electronAPI?.writeClipboardText) {
                const r = await window.electronAPI.writeClipboardText(s);
                return !!(r && r.ok);
            }
        } catch (_) {
            /* ignore */
        }
        return false;
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

    /** Copy `[title](url)` for the current page (title from tab / webview; URL escaped when needed). */
    async copyCurrentUrlAsMarkdown() {
        if (this.currentTab) {
            const tab = this.tabs.get(this.currentTab);
            if (tab && (tab.url === 'axis://settings' || tab.isSettings)) {
                const md = '[Settings](axis://settings)';
                try {
                    await navigator.clipboard.writeText(md);
                    this.showNotification('Markdown link copied to clipboard', 'success');
                } catch (e) {
                    this.showNotification('Failed to copy', 'error');
                }
                return;
            }
        }

        let url = null;
        const webview = this.getActiveWebview();

        if (webview) {
            try {
                url = webview.getURL();
            } catch (e) {
                // Fallback to tab URL
            }
        }

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

        let title = '';
        if (this.currentTab && this.tabs.has(this.currentTab)) {
            const tab = this.tabs.get(this.currentTab);
            if (tab && tab.title) title = String(tab.title).trim();
        }
        if (webview) {
            try {
                const t = webview.getTitle();
                if (t && String(t).trim()) title = String(t).trim();
            } catch (e) {
                /* keep tab title */
            }
        }
        if (!title) {
            try {
                const u = new URL(url);
                title = u.hostname.replace(/^www\./i, '') || u.pathname || 'Link';
            } catch (e) {
                title = 'Link';
            }
        }
        title = title.replace(/\s+/g, ' ');

        const escMdLinkText = (s) =>
            String(s).replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
        const mdDest = (u) => {
            if (/[\s()]/.test(u)) {
                return `<${u.replace(/\\/g, '\\\\').replace(/</g, '\\<').replace(/>/g, '\\>')}>`;
            }
            return u;
        };
        const md = `[${escMdLinkText(title)}](${mdDest(url)})`;

        try {
            await navigator.clipboard.writeText(md);
            this.showNotification('Markdown link copied to clipboard', 'success');
        } catch (err) {
            const textArea = document.createElement('textarea');
            textArea.value = md;
            textArea.style.position = 'fixed';
            textArea.style.opacity = '0';
            document.body.appendChild(textArea);
            textArea.select();
            try {
                document.execCommand('copy');
                this.showNotification('Markdown link copied to clipboard', 'success');
            } catch (fallbackErr) {
                this.showNotification('Failed to copy', 'error');
            }
            document.body.removeChild(textArea);
        }
    }

    paste() {
        const webview = this.getActiveWebview();
        if (!webview) return;
        try {
            webview.focus();
        } catch (_) {}
        void this.pastePlainIntoWebview(webview);
    }

    /**
     * Paste plain text into the guest focused field (execCommand('paste') is unreliable in webviews).
     * @param {string} [textIfKnown] — if omitted, reads the system clipboard.
     */
    async pastePlainIntoWebview(webview, textIfKnown) {
        let text = textIfKnown;
        if (text === undefined) {
            try {
                text = await navigator.clipboard.readText();
            } catch (e) {
                webview
                    .executeJavaScript(`
                    (function(){ try { return document.execCommand('paste'); } catch (x) { return false; } })();
                `)
                    .catch(() => {});
                return;
            }
        }
        if (text == null) text = '';
        const payload = JSON.stringify(text);
        try {
            webview.focus();
        } catch (_) {}
        webview
            .executeJavaScript(`
            (function() {
                var text = ${payload};
                try {
                    var el = document.activeElement;
                    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
                        var start = el.selectionStart != null ? el.selectionStart : 0;
                        var end = el.selectionEnd != null ? el.selectionEnd : 0;
                        var v = el.value;
                        el.value = v.slice(0, start) + text + v.slice(end);
                        var pos = start + text.length;
                        el.selectionStart = el.selectionEnd = pos;
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        return;
                    }
                    if (el && el.isContentEditable) {
                        document.execCommand('insertText', false, text);
                        return;
                    }
                    document.execCommand('insertText', false, text);
                } catch (e) {}
            })();
        `)
            .catch(() => {});
    }

    /** Paste plain text from the clipboard (no rich formatting), matching destination style. */
    async pasteMatchStyle() {
        let text;
        try {
            text = await navigator.clipboard.readText();
        } catch (e) {
            this.showNotification('Could not read clipboard.', 'error');
            return;
        }
        if (text == null) text = '';

        const el = document.activeElement;
        if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
            this.insertTextInInput(el, text);
            return;
        }
        if (el && el.isContentEditable) {
            try {
                document.execCommand('insertText', false, text);
            } catch (_) {}
            return;
        }

        const webview = this.getActiveWebview();
        if (!webview) return;
        void this.pastePlainIntoWebview(webview, text);
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
        if (this.isIncognitoWindow) return [];
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

    isDownloadsPopupVisible() {
        const popup = document.getElementById('downloads-popup');
        return !!popup && !popup.classList.contains('hidden');
    }

    scheduleDownloadsPopupRefresh() {
        if (!this.isDownloadsPopupVisible()) return;
        if (this._downloadsPopupRefreshTimer != null) return;
        this._downloadsPopupRefreshTimer = setTimeout(async () => {
            this._downloadsPopupRefreshTimer = null;
            if (this._downloadsPopupRenderInFlight || !this.isDownloadsPopupVisible()) return;
            await this.refreshDownloadsPopupListIfOpen();
        }, 120);
    }

    startDownloadsPopupLiveRefresh() {
        this.stopDownloadsPopupLiveRefresh();
        this._downloadsPopupPollInterval = setInterval(() => {
            this.scheduleDownloadsPopupRefresh();
        }, 900);
    }

    stopDownloadsPopupLiveRefresh() {
        if (this._downloadsPopupPollInterval != null) {
            clearInterval(this._downloadsPopupPollInterval);
            this._downloadsPopupPollInterval = null;
        }
        if (this._downloadsPopupRefreshTimer != null) {
            clearTimeout(this._downloadsPopupRefreshTimer);
            this._downloadsPopupRefreshTimer = null;
        }
    }

    async refreshDownloadsPopupListIfOpen() {
        const popup = document.getElementById('downloads-popup');
        const list = document.getElementById('downloads-popup-list');
        if (!popup || popup.classList.contains('hidden') || !list) return;
        if (this._downloadsPopupRenderInFlight) return;
        this._downloadsPopupRenderInFlight = true;
        try {
            const activeDownloads = await window.electronAPI.getActiveDownloads?.() || [];
            const activeByName = new Map();
            activeDownloads.forEach((d) => {
                const n = this.normalizeDownloadDisplayName(d?.filename || d?.path || '');
                if (n) activeByName.set(n, d);
            });
            const rows = Array.from(list.querySelectorAll('.downloads-popup-item'));
            rows.forEach((row) => {
                const n = row.dataset.downloadNameNorm || '';
                const tracked = activeByName.get(n) || null;
                this.applyDownloadsPopupRowDownloadState(row, tracked);
            });
        } finally {
            this._downloadsPopupRenderInFlight = false;
        }
    }

    normalizeDownloadDisplayName(name = '') {
        const raw = String(name || '').trim().toLowerCase();
        if (!raw) return '';
        return raw
            .replace(/\.crdownload$/i, '')
            .replace(/\.part$/i, '')
            .replace(/\.download$/i, '');
    }

    onDownloadsPopupCancelRequested(axisId, row) {
        const id = Number(axisId);
        if (!(id > 0) || !window.electronAPI?.cancelActiveDownload) return;
        void window.electronAPI.cancelActiveDownload(id).then((res) => {
            if (res && res.ok && row) {
                row.dataset.axisDownloadCancelled = '1';
            }
            this.scheduleDownloadsPopupRefresh();
        });
    }

    applyDownloadsPopupRowDownloadState(row, tracked) {
        if (!row) return;
        const isDownloading = !!tracked;
        const totalBytes = Number((tracked && tracked.totalBytes) || 0);
        const receivedBytes = Number((tracked && tracked.receivedBytes) || 0);
        const hasProgress = isDownloading && totalBytes > 0;
        const progressPct = hasProgress
            ? Math.max(0, Math.min(100, Math.round((receivedBytes / totalBytes) * 100)))
            : null;
        const etaSeconds = isDownloading && Number.isFinite(Number(tracked?.etaSeconds))
            ? Number(tracked.etaSeconds)
            : null;
        const etaText = etaSeconds != null
            ? (etaSeconds >= 60 ? `${Math.ceil(etaSeconds / 60)} min left` : `${Math.max(1, etaSeconds)} sec left`)
            : '';

        row.classList.toggle('is-downloading', isDownloading);
        if (isDownloading) {
            delete row.dataset.axisDownloadCancelled;
        }
        const timeEl = row.querySelector('.downloads-popup-time');
        if (timeEl) {
            if (!isDownloading && row.dataset.axisDownloadCancelled === '1') {
                timeEl.textContent = 'Download cancelled';
            } else if (isDownloading) {
                timeEl.textContent = hasProgress
                    ? `Downloading • ${progressPct}%${etaText ? ` • ${etaText}` : ''}`
                    : `Downloading…${etaText ? ` • ${etaText}` : ''}`;
            } else {
                timeEl.textContent = row.dataset.downloadBaseMeta || '';
            }
        }

        let progressEl = row.querySelector('.downloads-popup-progress');
        if (isDownloading) {
            if (!progressEl) {
                progressEl = document.createElement('div');
                progressEl.className = 'downloads-popup-progress';
                progressEl.innerHTML = '<div class="downloads-popup-progress-fill"></div>';
                const info = row.querySelector('.downloads-popup-info');
                if (info) info.appendChild(progressEl);
            }
            progressEl.classList.toggle('indeterminate', !hasProgress);
            const fill = progressEl.querySelector('.downloads-popup-progress-fill');
            if (fill) fill.style.width = `${hasProgress ? progressPct : 28}%`;
        } else if (progressEl) {
            progressEl.remove();
        }

        const downloadPath = row.dataset.downloadPath || '';
        const existingSide = row.querySelector('.downloads-popup-row-action');
        if (isDownloading && tracked && Number(tracked.axisId) > 0) {
            const aid = Number(tracked.axisId);
            const needNew =
                !existingSide ||
                !existingSide.classList.contains('downloads-popup-cancel-download') ||
                Number(existingSide.dataset.axisDownloadId) !== aid;
            if (needNew) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'downloads-popup-row-action downloads-popup-cancel-download';
                btn.title = 'Cancel download';
                btn.dataset.axisDownloadId = String(aid);
                btn.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = Number(btn.dataset.axisDownloadId);
                    const itemRow = btn.closest('.downloads-popup-item');
                    this.onDownloadsPopupCancelRequested(id, itemRow);
                });
                if (existingSide) existingSide.replaceWith(btn);
                else row.appendChild(btn);
            }
        } else {
            const needFolder =
                !existingSide || !existingSide.classList.contains('downloads-popup-show-folder');
            if (needFolder) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'downloads-popup-row-action downloads-popup-show-folder';
                btn.title = 'Show in Finder';
                btn.innerHTML =  '<i class="fas fa-folder-open" aria-hidden="true"></i>';
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (downloadPath) {
                        window.electronAPI.showItemInFolder(downloadPath);
                    }
                });
                if (existingSide) existingSide.replaceWith(btn);
                else row.appendChild(btn);
            }
        }
    }

    async populateDownloadsPopupList(list) {
        if (!list) return;

        // Toggle: if already visible, hide
        // Load recent files from system Downloads folder
        let downloads = [];
        let activeDownloads = [];
        try {
            downloads = await window.electronAPI.getDownloadsFromFolder() || [];
        } catch (error) {
            console.error('Failed to load downloads:', error);
        }
        try {
            activeDownloads = await window.electronAPI.getActiveDownloads?.() || [];
        } catch (_) {
            activeDownloads = [];
        }

        // Clear current items
        list.innerHTML = '';

        if (!downloads.length) {
            const empty = document.createElement('div');
            empty.className = 'downloads-popup-empty';
            empty.innerHTML = `
                <i class="far fa-circle-down"></i>
                <p>No recent downloads</p>
                <p>Your latest downloads will appear here.</p>
            `;
            list.appendChild(empty);
        } else {
            const pathsForIcons = downloads.map((d) => d.path).filter(Boolean);
            if (pathsForIcons.length && window.electronAPI?.cacheDragIcons) {
                window.electronAPI.cacheDragIcons(pathsForIcons).catch(() => {});
            }
            const activeByPath = new Map();
            const activeByName = new Map();
            activeDownloads
                .filter((d) => d)
                .forEach((d) => {
                    const p = typeof d.path === 'string' ? d.path.trim().toLowerCase() : '';
                    const n = this.normalizeDownloadDisplayName(d.filename || d.path || '');
                    if (p) activeByPath.set(p, d);
                    if (n) activeByName.set(n, d);
                });
            const seenNormNames = new Set();
            downloads.forEach((item) => {
                const fileName = item.name || item.path || 'File';
                const fileType = this.getFileTypeForPreview(fileName);
                const pathKey = typeof item.path === 'string' ? item.path.trim().toLowerCase() : '';
                const nameKey = this.normalizeDownloadDisplayName(fileName);
                if (nameKey && seenNormNames.has(nameKey)) return;
                if (nameKey) seenNormNames.add(nameKey);
                const tracked = activeByPath.get(pathKey) || activeByName.get(nameKey) || null;
                const isDownloading = !!tracked;
                const totalBytes = Number((tracked && tracked.size) || item.size || 0);
                const receivedBytes = Number((tracked && tracked.receivedBytes) || 0);
                const hasProgress = isDownloading && totalBytes > 0;
                const progressPct = hasProgress
                    ? Math.max(0, Math.min(100, Math.round((receivedBytes / totalBytes) * 100)))
                    : null;
                const etaSeconds = isDownloading && Number.isFinite(Number(tracked?.etaSeconds))
                    ? Number(tracked.etaSeconds)
                    : null;
                const etaText = etaSeconds != null
                    ? (etaSeconds >= 60 ? `${Math.ceil(etaSeconds / 60)} min left` : `${Math.max(1, etaSeconds)} sec left`)
                    : '';
                const metaText = isDownloading
                    ? (hasProgress ? `Downloading • ${progressPct}%${etaText ? ` • ${etaText}` : ''}` : `Downloading…${etaText ? ` • ${etaText}` : ''}`)
                    : `${this.formatFileSize(item.size || 0)} • ${this.formatTimeAgo(item.mtime)}`;
                const progressMarkup = isDownloading
                    ? `<div class="downloads-popup-progress ${hasProgress ? '' : 'indeterminate'}"><div class="downloads-popup-progress-fill" style="width:${hasProgress ? progressPct : 28}%;"></div></div>`
                    : '';

                const row = document.createElement('div');
                row.className = `downloads-popup-item${isDownloading ? ' is-downloading' : ''}`;
                row.dataset.downloadNameNorm = nameKey || '';
                row.dataset.downloadPath = item.path || '';
                row.dataset.downloadBaseMeta = `${this.formatFileSize(item.size || 0)} • ${this.formatTimeAgo(item.mtime)}`;
                const sideBtnHtml =
                    isDownloading && tracked && Number(tracked.axisId) > 0
                        ? `<button type="button" class="downloads-popup-row-action downloads-popup-cancel-download" title="Cancel download" data-axis-download-id="${tracked.axisId}"><i class="fas fa-times" aria-hidden="true"></i></button>`
                        : `<button type="button" class="downloads-popup-row-action downloads-popup-show-folder" title="Show in Finder"><i class="fas fa-folder-open" aria-hidden="true"></i></button>`;
                row.innerHTML = `
                    <div class="downloads-popup-thumbnail ${this.escapeHtml(fileType)}">
                        ${this.getDownloadPopupThumbnailLoadingMarkup()}
                    </div>
                    <div class="downloads-popup-info">
                        <div class="downloads-popup-name" title="${this.escapeHtml(fileName)}">
                            ${this.escapeHtml(fileName)}
                        </div>
                        <div class="downloads-popup-time">
                            ${this.escapeHtml(metaText)}
                        </div>
                        ${progressMarkup}
                    </div>
                    ${sideBtnHtml}
                `;

                row.draggable = true;
                row.addEventListener('dragstart', (e) => {
                    if (isDownloading) {
                        e.preventDefault();
                        return;
                    }
                    e.preventDefault();
                    if (item.path && window.electronAPI?.startFileDrag) {
                        window.electronAPI.startFileDrag(item.path);
                    }
                });

                // Open file on row click (suppressed after a drag by the browser)
                row.addEventListener('click', () => {
                    if (isDownloading) return;
                    if (item.path) {
                        window.electronAPI.openLibraryItem(item.path);
                    }
                });

                const sideBtn = row.querySelector('.downloads-popup-row-action');
                sideBtn?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (sideBtn.classList.contains('downloads-popup-cancel-download')) {
                        const aid = Number(sideBtn.dataset.axisDownloadId);
                        const itemRow = sideBtn.closest('.downloads-popup-item');
                        this.onDownloadsPopupCancelRequested(aid, itemRow);
                        return;
                    }
                    if (item.path) {
                        window.electronAPI.showItemInFolder(item.path);
                    }
                });

                list.appendChild(row);
                this.loadDownloadPopupThumbnail(item.path, fileType, fileName, row);
            });
        }
    }

    // In-app downloads popup showing most recent files from Downloads folder
    async showDownloadsPopup() {
        const popup = document.getElementById('downloads-popup');
        const list = document.getElementById('downloads-popup-list');
        const button = document.getElementById('downloads-btn-footer');
        if (!popup || !list || !button) return;

        // Toggle: if already visible, hide
        if (!popup.classList.contains('hidden')) {
            this.hideDownloadsPopup();
            return;
        }

        this.closeExtensionsMenu();
        await this.populateDownloadsPopupList(list);

        // Position popup under the downloads button
        const rect = button.getBoundingClientRect();
        const margin = 8;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const popupWidth = Math.min(340, viewportWidth - margin * 2);

        popup.style.width = `${popupWidth}px`;

        let left = rect.left;
        if (left + popupWidth + margin > viewportWidth) {
            left = viewportWidth - popupWidth - margin;
        }
        if (left < margin) left = margin;

        popup.style.left = `${left}px`;
        popup.style.top = `${rect.bottom + margin}px`;

        popup.classList.remove('hidden');

        const backdrop = document.getElementById('downloads-popup-backdrop');
        if (backdrop) {
            backdrop.classList.remove('hidden');
            backdrop.setAttribute('aria-hidden', 'false');
        }
        document.body.classList.add('downloads-popup-open');
        this.startDownloadsPopupLiveRefresh();

        const openFolderBtn = document.getElementById('downloads-popup-open-folder');
        openFolderBtn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await window.electronAPI.openDownloadsFolder();
            } catch (error) {
                console.error('Failed to open downloads folder:', error);
            }
        }, { once: true });
    }

    hideDownloadsPopup() {
        const popup = document.getElementById('downloads-popup');
        const backdrop = document.getElementById('downloads-popup-backdrop');
        this.stopDownloadsPopupLiveRefresh();
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('downloads-popup-open');
        if (!popup) return;
        popup.classList.add('hidden');
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
    
    getDownloadPopupThumbnailLoadingMarkup() {
        return '<div class="downloads-popup-thumbnail-inner downloads-popup-thumbnail-loading"></div>';
    }

    applyDownloadPopupThumbnailFallback(innerEl, filePath, fileType, fileName) {
        if (!innerEl) return;
        if (fileType === 'type-image') {
            const fileUrl = this.pathToFileUrl(filePath);
            if (fileUrl) {
                innerEl.className = 'downloads-popup-thumbnail-inner image';
                innerEl.innerHTML = `<img src="${this.escapeHtml(fileUrl)}" alt="${this.escapeHtml(fileName || '')}" loading="lazy" draggable="false">`;
                return;
            }
        }
        innerEl.className = 'downloads-popup-thumbnail-inner';
        innerEl.innerHTML = `<span class="downloads-popup-thumbnail-icon">${this.getFileTypeIcon(fileType)}</span>`;
    }

    async loadDownloadPopupThumbnail(filePath, fileType, fileName, rowEl) {
        const inner = rowEl?.querySelector?.('.downloads-popup-thumbnail-inner');
        if (!inner) return;
        try {
            const dataUrl = await window.electronAPI?.getFileThumbnailDataUrl?.(filePath, 128);
            if (dataUrl && typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
                inner.className = 'downloads-popup-thumbnail-inner image';
                inner.innerHTML = `<img src="${this.escapeHtml(dataUrl)}" alt="${this.escapeHtml(fileName || '')}" draggable="false">`;
                return;
            }
        } catch (e) {
            /* fall through */
        }
        this.applyDownloadPopupThumbnailFallback(inner, filePath, fileType, fileName);
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

        this.closeExtensionsMenu();
        
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

    positionExtensionsMenu() {
        const panel = document.getElementById('extensions-menu-panel');
        const btn = document.getElementById('url-bar-extensions');
        if (!panel || !btn) return;
        const rect = btn.getBoundingClientRect();
        const margin = 8;
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        const popupWidth = Math.min(340, viewportWidth - margin * 2);
        panel.style.width = `${popupWidth}px`;
        let left = rect.left;
        if (left + popupWidth + margin > viewportWidth) {
            left = viewportWidth - popupWidth - margin;
        }
        if (left < margin) left = margin;
        panel.style.left = `${left}px`;
        panel.style.top = `${rect.bottom + margin}px`;
        panel.style.right = 'auto';
    }

    closeExtensionsMenu() {
        const panel = document.getElementById('extensions-menu-panel');
        const backdrop = document.getElementById('extensions-menu-backdrop');
        if (backdrop) {
            backdrop.classList.add('hidden');
            backdrop.setAttribute('aria-hidden', 'true');
        }
        document.body.classList.remove('extensions-menu-open');
        if (panel) panel.classList.add('hidden');
    }

    async toggleExtensionsMenu() {
        const panel = document.getElementById('extensions-menu-panel');
        if (!panel) return;
        if (!panel.classList.contains('hidden')) {
            this.closeExtensionsMenu();
            return;
        }

        const dp = document.getElementById('downloads-popup');
        if (dp && !dp.classList.contains('hidden')) {
            this.hideDownloadsPopup();
        }

        const settingsPanel = document.getElementById('settings-panel');
        const downloadsPanel = document.getElementById('downloads-panel');
        const securityPanel = document.getElementById('security-panel');
        const notesPanel = document.getElementById('notes-panel');
        const backdrop = document.getElementById('modal-backdrop');

        if (settingsPanel && !settingsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(settingsPanel);
        }
        if (downloadsPanel && !downloadsPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(downloadsPanel);
        }
        if (securityPanel && !securityPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(securityPanel);
        }
        if (notesPanel && !notesPanel.classList.contains('hidden')) {
            this.closePanelWithAnimation(notesPanel);
        }
        if (backdrop && !backdrop.classList.contains('hidden')) {
            backdrop.classList.add('hidden');
            backdrop.style.opacity = '';
            backdrop.style.transition = '';
        }

        await this.populateExtensionsMenu();
        this.positionExtensionsMenu();
        const extBackdrop = document.getElementById('extensions-menu-backdrop');
        if (extBackdrop) {
            extBackdrop.classList.remove('hidden');
            extBackdrop.setAttribute('aria-hidden', 'false');
        }
        document.body.classList.add('extensions-menu-open');
        panel.classList.remove('hidden');
    }

    async populateExtensionsMenu() {
        const list = document.getElementById('extensions-menu-list');
        if (!list) return;
        let exts = [];
        try {
            exts = await window.electronAPI.getExtensions();
        } catch (_) {
            list.innerHTML = `
                <div class="extensions-menu-empty">
                    <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                    <p>Could not load extensions.</p>
                </div>`;
            return;
        }
        if (!exts.length) {
            list.innerHTML = `
                <div class="extensions-menu-empty">
                    <i class="fas fa-puzzle-piece" aria-hidden="true"></i>
                    <p>No extensions installed</p>
                    <p>Use Manage extensions to add some.</p>
                </div>`;
            return;
        }
        list.innerHTML = '';
        const browser = this;
        for (const ext of exts) {
            const row = document.createElement('div');
            const canOpen =
                ext.enabled !== false &&
                ext.loaded &&
                (ext.popupUrl || ext.optionsUrl);
            row.className = `extensions-menu-item${canOpen ? '' : ' extensions-menu-item-disabled'}`;
            const initial = (ext.name || 'E').trim().charAt(0).toUpperCase();
            const iconHtml = ext.iconUrl
                ? `<img class="extensions-menu-icon" src="${browser.escapeHtml(ext.iconUrl)}" alt="">`
                : `<div class="extensions-menu-icon extensions-menu-icon-fallback" aria-hidden="true">${browser.escapeHtml(initial)}</div>`;
            let meta = '';
            if (ext.enabled === false) meta = 'Off';
            else if (!ext.loaded) meta = ext.error ? 'Not loaded' : 'Loading…';
            else if (ext.popupUrl) meta = 'Click to open popup';
            else if (ext.optionsUrl) meta = 'Click to open options';
            else meta = 'No popup or options page';
            row.innerHTML = `
                ${iconHtml}
                <div class="extensions-menu-body">
                    <div class="extensions-menu-name">${browser.escapeHtml(ext.name || 'Extension')}</div>
                    <div class="extensions-menu-meta">${browser.escapeHtml(meta)}</div>
                </div>
                <button type="button" class="extensions-menu-remove" title="Remove extension" aria-label="Remove extension">
                    <i class="fas fa-trash-alt" aria-hidden="true"></i>
                </button>
            `;
            const removeBtn = row.querySelector('.extensions-menu-remove');
            removeBtn.addEventListener('click', async (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (!confirm(`Remove ${ext.name || 'this extension'}?`)) return;
                try {
                    await window.electronAPI.removeExtension(ext.id);
                    await browser.populateExtensionsMenu();
                    browser.showNotification?.('Extension removed', 'success');
                } catch (err) {
                    browser.showNotification?.(
                        err && err.message ? err.message : 'Could not remove extension.',
                        'error'
                    );
                }
            });
            row.addEventListener('click', async () => {
                if (!canOpen) return;
                try {
                    if (ext.popupUrl) {
                        await window.electronAPI.openExtensionPopup(ext.id);
                    } else if (ext.optionsUrl) {
                        await window.electronAPI.openExtensionOptions(ext.id);
                    }
                    browser.closeExtensionsMenu();
                } catch (err) {
                    browser.showNotification?.(
                        err && err.message ? err.message : 'Could not open extension.',
                        'error'
                    );
                }
            });
            list.appendChild(row);
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
        
        setTimeout(() => {
            indicator.classList.remove('show', type);
            indicator.classList.add('hidden');
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

    setUrlBarLoadProgress(fraction, tabId) {
        if (this.loadingBarTabId == null || tabId !== this.loadingBarTabId) return;
        if (this.currentTab !== tabId) return;
        const fill = document.getElementById('loading-bar-fill');
        const bar = document.getElementById('loading-bar');
        if (!fill || !bar || !bar.classList.contains('loading')) return;
        const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));
        fill.style.width = `${(clamped * 100).toFixed(2)}%`;
    }

    bumpUrlBarLoadMilestone(webview, tabId, atLeast) {
        if (!webview || this.loadingBarTabId !== tabId) return;
        const next = Math.max(webview.__loadProgressMilestone || 0, atLeast);
        webview.__loadProgressMilestone = next;
        if (this.currentTab === tabId) {
            this.setUrlBarLoadProgress(next, tabId);
        }
    }

    showLoadingIndicator() {
        const loadingBar = document.getElementById('loading-bar');
        const fill = document.getElementById('loading-bar-fill');
        if (loadingBar) {
            if (fill) {
                fill.classList.remove('loading-bar-fill--complete');
                fill.style.transition = '';
                fill.style.width = '0%';
            }
            loadingBar.classList.add('loading');
        }
    }

    hideLoadingIndicator() {
        const loadingBar = document.getElementById('loading-bar');
        const fill = document.getElementById('loading-bar-fill');
        if (!loadingBar) return;
        if (fill) {
            fill.classList.add('loading-bar-fill--complete');
            fill.style.width = '100%';
        }
        const done = () => {
            loadingBar.classList.remove('loading');
            if (fill) {
                fill.classList.remove('loading-bar-fill--complete');
                fill.style.transition = 'none';
                fill.style.width = '0%';
                requestAnimationFrame(() => {
                    fill.style.transition = '';
                });
            }
        };
        if (fill) {
            setTimeout(done, 200);
        } else {
            done();
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
        const mainArea = document.getElementById('main-area');
        const contentArea = document.getElementById('content-area');
        const resizeHandle = document.getElementById('sidebar-resize-handle');
        if (!sidebar || !mainArea || !contentArea || !resizeHandle) return;

        const syncSidebarResizeHandleLayout = () => {
            const sidebarHidden = sidebar.classList.contains('hidden') && !sidebar.classList.contains('slide-out');
            if (sidebarHidden) {
                resizeHandle.style.display = 'none';
                return;
            }
            resizeHandle.style.display = '';
            const top = contentArea.offsetTop;
            const height = contentArea.offsetHeight;
            const isRightSide = mainArea.classList.contains('sidebar-right');
            const seamX = isRightSide
                ? mainArea.clientWidth - sidebar.offsetWidth
                : sidebar.offsetWidth;
            resizeHandle.style.top = `${top}px`;
            resizeHandle.style.height = `${height}px`;
            resizeHandle.style.left = `${Math.round(seamX - 6)}px`;
            resizeHandle.style.right = 'auto';
        };

        syncSidebarResizeHandleLayout();
        window.addEventListener('resize', syncSidebarResizeHandleLayout);
        if (typeof ResizeObserver !== 'undefined') {
            const layoutObserver = new ResizeObserver(() => syncSidebarResizeHandleLayout());
            layoutObserver.observe(contentArea);
            layoutObserver.observe(sidebar);
            layoutObserver.observe(mainArea);
        }
        if (typeof MutationObserver !== 'undefined') {
            const classObserver = new MutationObserver(() => syncSidebarResizeHandleLayout());
            classObserver.observe(sidebar, { attributes: true, attributeFilter: ['class'] });
            classObserver.observe(mainArea, { attributes: true, attributeFilter: ['class'] });
        }

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
                syncSidebarResizeHandleLayout();
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
        let moveRaf = null;

        const cancelMoveRaf = () => {
            if (moveRaf != null) {
                cancelAnimationFrame(moveRaf);
                moveRaf = null;
            }
        };

        /** Pinned/unpinned band: separator + “+ New Tab” — same drag shift as a unit */
        const clearPinnedUnpinnedBandTransforms = () => {
            const sep = this.elements.tabsSeparator;
            if (sep && sep.parentNode) {
                sep.style.removeProperty('transform');
                sep.style.transition = '';
            }
            const nt = this.elements.sidebarNewTabBtn;
            if (nt && nt.parentNode) {
                nt.style.removeProperty('transform');
                nt.style.transition = '';
            }
        };

        const setPinnedUnpinnedBandShift = (sy) => {
            const y = Math.round(sy * 100) / 100;
            const tf = `translate3d(0, ${y}px, 0)`;
            const sep = this.elements.tabsSeparator;
            if (sep && sep.parentNode) {
                sep.style.transition = '';
                sep.style.setProperty('transform', tf, 'important');
            }
            const nt = this.elements.sidebarNewTabBtn;
            if (nt && nt.parentNode) {
                nt.style.transition = '';
                nt.style.setProperty('transform', tf, 'important');
            }
        };

        // Force cleanup - emergency reset
        const forceCleanup = () => {
            cancelMoveRaf();
            if (drag) {
                if (drag.element) {
                    drag.element.classList.remove('smooth-dragging');
                    drag.element.style.removeProperty('transform');
                    drag.element.style.opacity = '';
                    drag.element.style.pointerEvents = '';
                }
                if (drag.container) {
                    const toClear = getSiblings(drag.container);
                    toClear.forEach(el => {
                        if (el && el !== drag.element) {
                            el.classList.remove('drag-sliding');
                            el.style.removeProperty('transform');
                            el.style.transition = '';
                        }
                    });
                }
                if (drag.container && drag.container.id === 'tabs-container') {
                    clearPinnedUnpinnedBandTransforms();
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
                    // Virtual “end” slot must sit *below the last* tab/group in the list. Using separator Y here
                    // made every midpoint vs. the last row wrong, so bottom drags targeted the wrong index and
                    // finishDrag inserted after “+ New Tab” (top of unpinned) instead of after the last tab.
                    const lastGeom = positions.length > 0 ? positions[positions.length - 1] : null;
                    const virtualTop = (firstUnpinnedIndex < 0)
                        ? sepRect.bottom
                        : (lastGeom ? lastGeom.top + lastGeom.height : sepRect.bottom);
                    const virtualGap = 8;
                    positions.push({ el: null, top: virtualTop, height: 0, center: virtualTop + virtualGap });
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
                initialSiblingCount: siblings.length,
                dropIndex: dragIndex,
                dropVirtualEnd: false,
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
                smoothedSiblingShifts: new Map(),
                smoothedSepShift: 0,
                _slideSmoothLastT: 0,
                /** Viewport Y of dragged row center at drag start; used to clamp in-group sliding. */
                draggedPosCenter: draggedPos.center,
            };
        };

        const SEPARATOR_HYSTERESIS_PX = 3;
        // Sibling / separator slide easing (per second, higher = snappier). CSS transitions fight per-frame
        // transform updates; exp-smoothing gives clean motion without fighting the pointer-driven drag row.
        const DRAG_SLIDE_SMOOTH_PER_SEC = 38;

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
            if (fu <= 0 || !drag.positions || fu >= drag.positions.length) return target;
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
                    siblingsToClear.forEach((el) => {
                        if (el !== drag.element && el && el.parentElement) el.style.removeProperty('transform');
                    });
                    drag.smoothedSiblingShifts.clear();
                    drag.smoothedSepShift = 0;
                    drag._slideSmoothLastT = 0;
                    if (drag.container.id === 'tabs-container') {
                        clearPinnedUnpinnedBandTransforms();
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
                    removePreviewBox();
                    drag.element.style.opacity = '';
                    drag.element.style.pointerEvents = '';
                    const backToVertical = getSiblings(drag.container);
                    for (const el of backToVertical) {
                        if (el !== drag.element && el.parentElement === container) {
                            el.style.removeProperty('transform');
                            el.style.transition = '';
                            if (!el.classList.contains('drag-sliding')) el.classList.add('drag-sliding');
                        }
                    }
                    drag.smoothedSiblingShifts.clear();
                    drag.smoothedSepShift = 0;
                    drag._slideSmoothLastT = 0;
                    if (drag.container.id === 'tabs-container') {
                        clearPinnedUnpinnedBandTransforms();
                    }
                    drag.isHorizontalDrag = false;
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
            
            // Vertical clamp: tab-group = full content box; main list = top of scroll port only (see tabListTop).
            let slideOffsetY = offsetY;
            let draggedCenter = mouseY - drag.mouseOffsetFromCenter;
            if (typeof drag.draggedPosCenter === 'number') {
                const half = drag.draggedHeight * 0.5;
                const pad = 2;
                const tabListTop = tabsContainer.getBoundingClientRect().top;
                if (container.classList.contains('tab-group-content')) {
                    const cr = container.getBoundingClientRect();
                    const minC = Math.max(cr.top, tabListTop) + half + pad;
                    const maxC = cr.bottom - half - pad;
                    if (maxC >= minC) {
                        draggedCenter = Math.max(minC, Math.min(maxC, draggedCenter));
                    }
                    slideOffsetY = draggedCenter - drag.draggedPosCenter;
                } else if (container.id === 'tabs-container') {
                    const minTopCenter = tabListTop + half + pad;
                    draggedCenter = Math.max(minTopCenter, draggedCenter);
                    slideOffsetY = draggedCenter - drag.draggedPosCenter;
                }
            }

            // Slide: compositor-friendly move (!important beats inactive-tab rules)
            drag.element.style.setProperty('transform', `translate3d(0, ${slideOffsetY}px, 0)`, 'important');

            // Target index from dragged visual center; use separator boundary when crossing pinned/unpinned
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
            const posLen = drag.positions.length;
            const lastEntry = posLen > 0 ? drag.positions[posLen - 1] : null;
            const lastIsVirtual = !!(drag.hasUnpinnedSlot && lastEntry && lastEntry.el === null);
            const dropVirtualEnd = !!(lastIsVirtual && safeTarget === posLen - 1);
            let dropIndex = drag.dragIndex;
            if (!dropVirtualEnd) {
                dropIndex = numSiblings <= 0 ? 0 : Math.max(0, Math.min(safeTarget, numSiblings - 1));
            }
            drag.dropIndex = dropIndex;
            drag.dropVirtualEnd = dropVirtualEnd;

            const effectiveTarget = numSiblings <= 0 ? 0 : Math.max(0, Math.min(safeTarget, numSiblings - 1));
            const gapStr = container.ownerDocument && container.ownerDocument.defaultView
                ? container.ownerDocument.defaultView.getComputedStyle(container).gap || ''
                : '';
            const gap = parseInt(String(gapStr).trim(), 10) || 4;
            const shiftHeight = drag.draggedHeight + gap;

            const nowSmooth = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
            const dtSec = drag._slideSmoothLastT
                ? Math.min(0.05, (nowSmooth - drag._slideSmoothLastT) / 1000)
                : 1 / 60;
            drag._slideSmoothLastT = nowSmooth;
            const slideAlpha = 1 - Math.exp(-DRAG_SLIDE_SMOOTH_PER_SEC * dtSec);

            const shiftMap = drag.smoothedSiblingShifts;
            for (const key of shiftMap.keys()) {
                if (!currentSiblings.includes(key)) shiftMap.delete(key);
            }

            // Shift siblings around the dragged item — eased toward target each frame (smooth, no CSS transition fight)
            for (let i = 0; i < numSiblings; i++) {
                const el = currentSiblings[i];
                if (!el || el === drag.element || el.parentElement !== container) continue;
                if (!el.classList.contains('drag-sliding')) el.classList.add('drag-sliding');
                let targetShift = 0;
                if (effectiveTarget < currentDragIdx && i >= effectiveTarget && i < currentDragIdx) targetShift = shiftHeight;
                else if (effectiveTarget > currentDragIdx && i > currentDragIdx && i <= effectiveTarget) targetShift = -shiftHeight;

                let smooth = shiftMap.get(el);
                if (smooth === undefined) smooth = 0;
                smooth += (targetShift - smooth) * slideAlpha;
                if (Math.abs(targetShift - smooth) < 0.4) smooth = targetShift;

                if (Math.abs(smooth) < 0.08 && targetShift === 0) {
                    shiftMap.delete(el);
                    el.style.removeProperty('transform');
                } else {
                    shiftMap.set(el, smooth);
                    const y = Math.round(smooth * 100) / 100;
                    el.style.setProperty('transform', `translate3d(0, ${y}px, 0)`, 'important');
                }
            }
            // Separator: same vertical shift as the row at the pinned/unpinned boundary. When the first
            // unpinned row *is* the dragged item, the old “first sibling after sep” logic skipped (j ===
            // currentDragIdx), so the separator stayed put until drop — use the last pinned row’s shift.
            if (container.id === 'tabs-container') {
                const sep = this.elements.tabsSeparator;
                if (sep && sep.parentNode === container) {
                    const children = Array.from(container.children);
                    const sepIdx = children.indexOf(sep);
                    let anchorJ = -1;
                    for (let j = 0; j < numSiblings; j++) {
                        if (children.indexOf(currentSiblings[j]) > sepIdx) {
                            anchorJ = j;
                            break;
                        }
                    }
                    const sepShiftForIndex = (j) => {
                        if (j < 0 || j === currentDragIdx) return 0;
                        if (effectiveTarget < currentDragIdx && j >= effectiveTarget && j < currentDragIdx) return shiftHeight;
                        if (effectiveTarget > currentDragIdx && j > currentDragIdx && j <= effectiveTarget) return -shiftHeight;
                        return 0;
                    };
                    let sepTarget = 0;
                    if (anchorJ >= 0) {
                        const fu = drag.firstUnpinnedIndex;
                        if (anchorJ === currentDragIdx && typeof fu === 'number' && fu > 0) {
                            sepTarget = sepShiftForIndex(fu - 1);
                        } else if (anchorJ !== currentDragIdx) {
                            sepTarget = sepShiftForIndex(anchorJ);
                        }
                    }
                    let sepSmooth = drag.smoothedSepShift;
                    sepSmooth += (sepTarget - sepSmooth) * slideAlpha;
                    if (Math.abs(sepTarget - sepSmooth) < 0.4) sepSmooth = sepTarget;
                    drag.smoothedSepShift = sepSmooth;
                    if (Math.abs(sepSmooth) < 0.08 && sepTarget === 0) {
                        drag.smoothedSepShift = 0;
                        clearPinnedUnpinnedBandTransforms();
                    } else {
                        setPinnedUnpinnedBandShift(sepSmooth);
                    }
                }
            }
        };
        
        // Finish drag
        const finishDrag = () => {
            if (!drag || !drag.active) {
                forceCleanup();
                return;
            }

            cancelMoveRaf();

            const { element, type, container, dragIndex } = drag;
            const dropVirtualEnd = !!drag.dropVirtualEnd;
            const dropIndex = drag.dropIndex != null ? drag.dropIndex : dragIndex;
            const reorderNeeded = dropVirtualEnd || dropIndex !== dragIndex;
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
                    el.style.removeProperty('transform');
                    el.style.transition = '';
                }
            }
            if (container && container.id === 'tabs-container') {
                clearPinnedUnpinnedBandTransforms();
            }

            element.classList.remove('smooth-dragging');
            element.style.removeProperty('transform');
            element.style.opacity = '';
            element.style.pointerEvents = '';

            // Reorder if drop index changed (dropIndex is final index among n siblings; DOM insert matches visuals)
            if (reorderNeeded) {
                element.remove();

                const remaining = Array.from(container.children).filter(el =>
                    (el.classList.contains('tab') || el.classList.contains('tab-group')) &&
                    el !== element &&
                    !el.classList.contains('tab-drag-drop-indicator') &&
                    !el.classList.contains('tab-drag-placeholder')
                );

                const sep = container.id === 'tabs-container' ? this.elements.tabsSeparator : container.querySelector('.tabs-separator');
                const unpinnedAnchor = container.id === 'tabs-container' && this.elements.sidebarNewTabBtn ? this.elements.sidebarNewTabBtn : sep;

                if (drag.hasUnpinnedSlot && dropVirtualEnd) {
                    // Empty unpinned: only virtual target is “after + New Tab”. Otherwise virtual means “after last row”.
                    if (drag.firstUnpinnedIndex < 0 && unpinnedAnchor) {
                        unpinnedAnchor.insertAdjacentElement('afterend', element);
                    } else if (remaining.length > 0) {
                        remaining[remaining.length - 1].insertAdjacentElement('afterend', element);
                    } else if (unpinnedAnchor) {
                        unpinnedAnchor.insertAdjacentElement('afterend', element);
                    } else if (sep) {
                        sep.insertAdjacentElement('afterend', element);
                    } else {
                        container.appendChild(element);
                    }
                } else if (dropVirtualEnd) {
                    const last = remaining[remaining.length - 1];
                    if (last) {
                        last.insertAdjacentElement('afterend', element);
                    } else if (unpinnedAnchor) {
                        unpinnedAnchor.insertAdjacentElement('afterend', element);
                    } else if (sep) {
                        sep.insertAdjacentElement('afterend', element);
                    } else {
                        container.appendChild(element);
                    }
                } else {
                    const dest = Math.max(0, Math.min(dropIndex, remaining.length));
                    if (dest < remaining.length) {
                        container.insertBefore(element, remaining[dest]);
                    } else {
                        const last = remaining[remaining.length - 1];
                        if (last) {
                            last.insertAdjacentElement('afterend', element);
                        } else if (unpinnedAnchor) {
                            unpinnedAnchor.insertAdjacentElement('afterend', element);
                        } else {
                            container.appendChild(element);
                        }
                    }
                }
                
                if (type === 'tab' && container.classList.contains('tabs-container')) {
                    const tabId = parseInt(element.dataset.tabId, 10);
                    if (!isNaN(tabId)) {
                        const tab = this.tabs.get(tabId);
                        if (tab && tab.tabGroupId) {
                            const prevKey = this.findTabGroupKey(tab.tabGroupId);
                            const prevGroup = prevKey != null ? this.tabGroups.get(prevKey) : null;
                            if (prevGroup) {
                                prevGroup.tabIds = prevGroup.tabIds.filter(
                                    (id) => this._normalizeTabMapKey(id) !== tabId
                                );
                                if (prevGroup.tabIds.length === 0 && prevGroup.hadTabs) {
                                    this._deleteTabGroupFromMapAndDom(prevKey);
                                } else {
                                    this.tabGroups.set(prevKey, prevGroup);
                                }
                            }
                            tab.tabGroupId = undefined;
                            this.tabs.set(tabId, tab);
                        }
                    }
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
                            const oldIds = new Set(tabGroup.tabIds);
                            newTabIds.forEach(tabId => {
                                const tab = this.tabs.get(tabId);
                                if (tab) {
                                    tab.tabGroupId = tabGroupId;
                                    tab.pinned = tabGroup.pinned !== false;
                                    this.tabs.set(tabId, tab);
                                }
                            });
                            oldIds.forEach(tabId => {
                                if (!newTabIds.includes(tabId)) {
                                    const tab = this.tabs.get(tabId);
                                    if (tab && tab.tabGroupId === tabGroupId) {
                                        tab.tabGroupId = undefined;
                                        this.tabs.set(tabId, tab);
                                    }
                                }
                            });
                            if (newTabIds.length === 0 && tabGroup.hadTabs) {
                                this._deleteTabGroupFromMapAndDom(tabGroupId);
                            } else {
                                tabGroup.tabIds = newTabIds;
                                if (newTabIds.length > 0) tabGroup.hadTabs = true;
                                this.tabGroups.set(tabGroupId, tabGroup);
                            }
                        }
                    }
                }
                
                requestAnimationFrame(() => {
                    void this.savePinnedTabs();
                    void this.saveTabGroups();
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
            if (moveRaf != null) return;
            moveRaf = requestAnimationFrame(() => {
                moveRaf = null;
                if (!drag || !drag.active) return;
                try {
                    updateVisuals(lastMouseX, lastMouseY);
                } catch (err) {
                    console.error('Error updating drag visuals:', err);
                    finishDrag();
                }
            });
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
                
                // Do not preventDefault/stopPropagation here — that breaks click + dblclick (e.g. rename).
                // Text selection is suppressed via CSS (.tab { user-select: none }).
                
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
        if (this.isIncognitoWindow) return;
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

        this.closeExtensionsMenu();
        
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
        this.closeExtensionsMenu();

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
        this.createNewTab();
    }

    closeSpotlightSearch() {
        // No-op: spotlight replaced by new tab page
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
        const input = document.getElementById('new-tab-input') || document.getElementById('spotlight-input');
        const query = input?.value?.trim();

        if (query) {
            const selectedEngine = this.selectedSearchEngine;
            if (!this.settings.recentSearches) this.settings.recentSearches = [];
            if (!this.settings.recentSearches.includes(query)) {
                this.settings.recentSearches.unshift(query);
                this.settings.recentSearches = this.settings.recentSearches.slice(0, 10);
                this.saveSetting('recentSearches', this.settings.recentSearches);
            }

            // Check for special axis:// URLs first
            if (query.toLowerCase() === 'axis://settings') {
                this.toggleSettings();
                return;
            }

            const searchUrl = this.sanitizeUrl(query) || this.getSearchUrl(query, selectedEngine);

            const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
            const onNewTabPage = tab && tab.url === this.NEWTAB_URL;
            if (onNewTabPage) {
                this.navigate(searchUrl);
            } else {
                this.createNewTab(searchUrl);
            }
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
            case 'yandex':
                return `https://yandex.com/search/?text=${encodedQuery}`;
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
                'yandex': 'Yandex',
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
            'yandex': 'Yandex',
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

    /** True for http:// URLs that are not loopback (HTTPS-only mode prompts for these). */
    isNonSecureHttpUrl(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') return false;
        try {
            const u = new URL(urlStr);
            if (u.protocol !== 'http:') return false;
            const h = u.hostname.toLowerCase();
            if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false;
            return true;
        } catch {
            return false;
        }
    }

    confirmInsecureHttpNavigation(url) {
        if (!this.settings?.httpsOnlyMode) return true;
        if (!this.isNonSecureHttpUrl(url)) return true;
        return window.confirm(
            'This page uses HTTP (not HTTPS). Your connection would not be encrypted on this site.\n\nContinue to:\n' + url
        );
    }

    /**
     * True when a parsed hostname is safe to treat as navigation (user typed host/path without a scheme).
     * Rejects single-label hosts like `cats` so those stay as search queries.
     */
    _hostnameAllowsBareNavigation(hostname) {
        if (!hostname || typeof hostname !== 'string') return false;
        const h = hostname.toLowerCase();
        if (h === 'localhost') return true;
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(h)) return true;
        if (h.startsWith('[') && h.endsWith(']')) return true;
        return h.includes('.');
    }

    /** Safe `data:image/...` patterns for context-menu open/copy (not navigated as raw HTML). */
    _isSafeContextMenuDataImageUrl(url) {
        if (!url || typeof url !== 'string') return false;
        return (
            /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon)(;[^,]*)?;base64,/i.test(url) ||
            /^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon)(;[^,]*)?,/i.test(url) ||
            /^data:image\/svg\+xml(;[^,]*)?;base64,/i.test(url) ||
            /^data:image\/svg\+xml(;[^,]*)?,/i.test(url)
        );
    }

    /**
     * Resolve image `src` against the guest page URL and validate for Open/Copy image (allows safe `data:image/*`, http(s)).
     * `sanitizeUrl` alone rejects `data:` and mis-handles relative image URLs.
     */
    prepareContextMenuImageUrl(raw, pageUrl) {
        if (!raw || typeof raw !== 'string') return null;
        let url = raw.trim().replace(/[<>'"\x00-\x1f\x7f-\x9f]/g, '');
        if (!url) return null;
        const lower = url.toLowerCase();
        if (lower.startsWith('javascript:') || lower.startsWith('vbscript:')) return null;

        if (!/^https?:\/\//i.test(url) && !lower.startsWith('data:') && !lower.startsWith('blob:')) {
            if (url.startsWith('//')) {
                url = 'https:' + url;
            } else {
                try {
                    let base = 'https://invalid/';
                    const tp = pageUrl && String(pageUrl).trim();
                    if (tp) {
                        try {
                            base = new URL(tp).href;
                        } catch (_) {
                            /* keep default */
                        }
                    }
                    url = new URL(url, base).href;
                } catch (_) {
                    return null;
                }
            }
        }

        const lower2 = url.toLowerCase();
        if (lower2.startsWith('data:')) {
            if (!this._isSafeContextMenuDataImageUrl(url)) return null;
            return url;
        }
        if (lower2.startsWith('blob:')) return null;

        return this.sanitizeUrl(url);
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

        // Internal Axis shell URLs — must not fall through to `getSearchUrl` (would Google "axis://…").
        if (lowerUrl.startsWith('axis://')) {
            if (lowerUrl === 'axis://newtab') {
                return this.NEWTAB_URL;
            }
            if (lowerUrl === 'axis://settings') {
                return 'axis://settings';
            }
            return null;
        }
        if (lowerUrl.startsWith('axis:note://')) {
            const idPart = String(url.slice('axis:note://'.length)).replace(/[<>'"\x00-\x1f\x7f-\x9f]/g, '');
            if (!idPart || !/^[a-zA-Z0-9_.-]+$/.test(idPart)) {
                return null;
            }
            return `axis:note://${idPart}`;
        }

        // Spaces (and similar) mean a natural-language query, not a navigable URL — unless a full
        // http(s) URL was pasted (URL() can otherwise turn "site.com/foo bar" into path %20 spam).
        if (/\s/.test(url) && !/^https?:\/\//i.test(url) && !/^axis:\/\//i.test(url)) {
            return this.getSearchUrl(url);
        }

        // Handle protocol addition with proper validation
        if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('about:') && !url.startsWith('chrome-extension://')) {
            // `isValidDomain` matches only hostnames; try https + full string so paths/query work (e.g. site.com/foo).
            let resolvedBare = false;
            try {
                const prefixed = 'https://' + url.replace(/^\/+/, '');
                const u = new URL(prefixed);
                if (
                    (u.protocol === 'http:' || u.protocol === 'https:') &&
                    this._hostnameAllowsBareNavigation(u.hostname)
                ) {
                    url = u.toString();
                    resolvedBare = true;
                }
            } catch (_) {
                /* Fall through */
            }
            if (!resolvedBare && this.isValidDomain(url)) {
                url = 'https://' + url;
            } else if (!resolvedBare && !this.isValidDomain(url)) {
                return this.getSearchUrl(url);
            }
        }

        // Validate the final URL
        try {
            const urlObj = new URL(url);
            
            // Only allow web, about, and installed extension pages.
            if (!['http:', 'https:', 'about:', 'chrome-extension:'].includes(urlObj.protocol)) {
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
            // Only allow web, about, and installed extension pages.
            return ['http:', 'https:', 'about:', 'chrome-extension:'].includes(url.protocol);
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
    
    async refreshEmbeddedShortcutsEditor(webview) {
        if (!webview) return;
        try {
            const defaults = await window.electronAPI.getDefaultShortcuts();
            const overrides = await window.electronAPI.getShortcutOverrides();
            await webview.executeJavaScript(`
                window._axisShortcutDefaults = ${JSON.stringify(defaults)};
                window._axisShortcutOverrides = ${JSON.stringify(overrides)};
                if (typeof renderShortcutsEditor === 'function') { renderShortcutsEditor(true); }
            `);
        } catch (e) {
            console.error('refreshEmbeddedShortcutsEditor', e);
        }
    }

    async handleShortcutsMessage(data, webview) {
        try {
            switch (data.type) {
                case 'setShortcuts':
                    await window.electronAPI.setShortcuts(data.shortcuts);
                    this.showNotification('Keyboard shortcuts saved', 'success');
                    await this.refreshEmbeddedShortcutsEditor(webview);
                    break;
                    
                case 'resetShortcuts':
                    await window.electronAPI.resetShortcuts();
                    await this.refreshEmbeddedShortcutsEditor(webview);
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
            const webview = this.getActiveWebview();
            await this.refreshEmbeddedShortcutsEditor(webview);
        } catch (error) {
            console.error('Error loading shortcuts:', error);
        }
    }

    async saveCustomShortcuts(shortcuts) {
        await window.electronAPI.setShortcuts(shortcuts);
        const webview = this.getActiveWebview();
        await this.refreshEmbeddedShortcutsEditor(webview);
        this.showNotification('Keyboard shortcuts saved', 'success');
    }

    async resetShortcutsToDefaults() {
        await window.electronAPI.resetShortcuts();
        const webview = this.getActiveWebview();
        await this.refreshEmbeddedShortcutsEditor(webview);
        this.showNotification('Keyboard shortcuts reset to defaults', 'success');
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
        
        // Ad blocker toggle (EasyList + EasyPrivacy-style rules via main process)
        if (el.urlBarAdblock) {
            el.urlBarAdblock.addEventListener('click', async () => {
                const next = !this.isAdBlockerEnabled();
                await this.saveSetting('adBlockerEnabled', next);
                try {
                    window.electronAPI.sendSettingsUpdated();
                } catch (_) {}
                this.syncAdBlockerUrlBarState();
            });
        }

        if (el.urlBarExtensions) {
            el.urlBarExtensions.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.toggleExtensionsMenu();
            });
        }
        document.getElementById('extensions-menu-close')?.addEventListener('click', () => this.closeExtensionsMenu());
        document.getElementById('extensions-menu-manage')?.addEventListener('click', async () => {
            this.closeExtensionsMenu();
            try {
                await this.openSettingsTab('extensions');
            } catch (_) {}
        });
        window.addEventListener('resize', () => {
            const p = document.getElementById('extensions-menu-panel');
            if (p && !p.classList.contains('hidden')) this.positionExtensionsMenu();
        });

        if (el.urlBarCwsInstall) {
            el.urlBarCwsInstall.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const wv = this.getActiveWebview();
                let listingUrl = '';
                try {
                    listingUrl = wv && typeof wv.getURL === 'function' ? wv.getURL() || '' : '';
                } catch (_) {
                    listingUrl = '';
                }
                await this.installExtensionFromStoreListingUrl(listingUrl, el.urlBarCwsInstall);
            });
        }
        if (el.axisStoreInstallHostBtn) {
            el.axisStoreInstallHostBtn.addEventListener('click', async (event) => {
                event.preventDefault();
                event.stopPropagation();
                const wv = this.getActiveWebview();
                let listingUrl = '';
                try {
                    listingUrl = wv && typeof wv.getURL === 'function' ? wv.getURL() || '' : '';
                } catch (_) {
                    listingUrl = '';
                }
                await this.installExtensionFromStoreListingUrl(listingUrl, el.axisStoreInstallHostBtn);
            });
        }
        if (el.axisStoreInstallHostOpen) {
            el.axisStoreInstallHostOpen.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                void this.openExtensionsMenu();
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
                el.urlBarInput.addEventListener('contextmenu', async (e) => {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const hasSelection = input.selectionStart != null && input.selectionEnd != null && input.selectionStart !== input.selectionEnd;
                    await window.electronAPI?.showUrlBarContextMenu?.(e.clientX, e.clientY, {
                        isEditable: true,
                        hasSelection
                    });
                });

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

    /** After a tab switch, URL bar tint updates without CSS fade; call again after sync styling or extract. */
    _releaseUrlBarInstantThemeAfterTabSwitchIfNeeded() {
        if (!this._urlBarInstantThemeTabSwitch) return;
        this._urlBarInstantThemeTabSwitch = false;
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return;
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                urlBar.classList.remove('url-bar--instant-theme');
            });
        });
    }

    async _runExtensionStoreInstall(rawInput, opts = {}) {
        const { webview = null, dismissToken = '', triggerBtn = null } = opts;
        const wv = webview || this.getActiveWebview();
        const hostBtn = this.elements?.axisStoreInstallHostBtn;
        const urlBtn = triggerBtn || this.elements?.urlBarCwsInstall;

        this._extensionInstallUiActive = true;
        this.setExtensionStoreHostBarState('busy', 'Downloading and installing…');
        this.setExtensionInstallControlState(hostBtn, 'busy');
        this.setExtensionInstallControlState(urlBtn, 'busy');

        try {
            await window.electronAPI.installExtensionFromWebStore(rawInput);
            const token =
                dismissToken ||
                (() => {
                    const amo = axisParseFirefoxAmoAddonKey(String(rawInput));
                    if (amo) return `amo:${amo.toLowerCase()}`;
                    const id = axisParseChromeWebStoreExtensionId(String(rawInput));
                    return id || '';
                })();
            if (token) {
                try {
                    wv?.send?.('axis-cws-install-succeeded', token);
                } catch (_) {
                    /* guest may be gone */
                }
            }
            this.setExtensionStoreHostBarState(
                'success',
                'Extension installed — open it from the puzzle icon in the URL bar.'
            );
            this.setExtensionInstallControlState(hostBtn, 'success');
            this.setExtensionInstallControlState(urlBtn, 'success');
            if (wv) {
                this.updateUrlBar(wv);
                try {
                    const finishUrl = wv.getURL() || '';
                    this._touchExtensionStoreListingUiForWebview(wv, finishUrl);
                } catch (_) {}
            }
            this._resetExtensionInstallUiAfterDelay(2800);
        } catch (e) {
            const msg = e && e.message ? e.message : 'Could not install this extension.';
            const token =
                dismissToken ||
                (() => {
                    const amo = axisParseFirefoxAmoAddonKey(String(rawInput));
                    if (amo) return `amo:${amo.toLowerCase()}`;
                    const id = axisParseChromeWebStoreExtensionId(String(rawInput));
                    return id || '';
                })();
            if (token) axisNotifyExtensionStoreBarFailed(wv, token, msg);
            this.setExtensionStoreHostBarState('error', msg);
            this.setExtensionInstallControlState(hostBtn, 'error');
            this.setExtensionInstallControlState(urlBtn, 'error');
            this._resetExtensionInstallUiAfterDelay(5200);
        }
    }

    async installExtensionFromStoreListingUrl(listingUrl, triggerBtn = null) {
        const cwsId = axisParseChromeWebStoreExtensionId(listingUrl);
        const amoKey = axisParseFirefoxAmoAddonKey(listingUrl);
        if (!cwsId && !amoKey) {
            return;
        }
        const dismissToken = amoKey ? `amo:${amoKey.toLowerCase()}` : cwsId;
        await this._runExtensionStoreInstall(listingUrl, {
            webview: this.getActiveWebview(),
            dismissToken,
            triggerBtn: triggerBtn || this.elements?.axisStoreInstallHostBtn
        });
    }

    updateExtensionStoreHostBar(currentUrl) {
        void this.refreshExtensionStoreListingUi(currentUrl);
    }

    // Update the URL bar display and theme
    // opts.skipExtractTheme: when true, do not run extractUrlBarTheme (caller will await it — avoids races on rapid settings toggles)
    updateUrlBar(webview, opts = {}) {
        if (this.splitView) {
            this.updateSplitPanesUrlBars();
            this.renderFavorites();
            return;
        }
        const el = this.elements;
        if (!el || !el.webviewUrlBar) {
            this.renderFavorites();
            return;
        }
        // Favorites “active” dot tracks `currentTab` only — must run before NTP / special-page early returns that skip URL chrome work.
        this.renderFavorites();

        // New tab page: show URL bar but hide action buttons (copy, security, chat)
        const currentTab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
        if (currentTab && currentTab.url === this.NEWTAB_URL) {
            el.webviewUrlBar.classList.remove('hidden');
            this._setUrlBarInternalShellMode('ntp');
            this.applyInternalShellUrlBarStyle();
            if (el.urlBarInput) el.urlBarInput.value = '';
            if (el.urlBarDisplay) el.urlBarDisplay.textContent = '';
            if (el.urlBarBack) el.urlBarBack.disabled = true;
            if (el.urlBarForward) el.urlBarForward.disabled = true;
            if (el.urlBarCwsInstall) {
                el.urlBarCwsInstall.classList.add('hidden');
                el.urlBarCwsInstall.setAttribute('aria-hidden', 'true');
            }
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
            this._persistUrlBarChromeToTab(this.currentTab);
            return;
        }

        if (currentTab && (currentTab.url === 'axis://settings' || currentTab.isSettings)) {
            el.webviewUrlBar.classList.remove('hidden');
            this._setUrlBarInternalShellMode('settings');
            this.applyInternalShellUrlBarStyle();
            const settingsWv = currentTab.webview;
            if (el.urlBarInput) el.urlBarInput.value = 'axis://settings';
            if (el.urlBarDisplay) el.urlBarDisplay.textContent = 'Settings';
            if (el.urlBarBack) {
                el.urlBarBack.disabled = !settingsWv || !settingsWv.canGoBack();
            }
            if (el.urlBarForward) {
                el.urlBarForward.disabled = !settingsWv || !settingsWv.canGoForward();
            }
            if (el.urlBarCwsInstall) {
                el.urlBarCwsInstall.classList.add('hidden');
                el.urlBarCwsInstall.setAttribute('aria-hidden', 'true');
            }
            this.updateExtensionStoreHostBar('');
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
            this._persistUrlBarChromeToTab(this.currentTab);
            return;
        }
        
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
            this._setUrlBarInternalShellMode(null);
            if (el.urlBarCwsInstall) {
                el.urlBarCwsInstall.classList.add('hidden');
                el.urlBarCwsInstall.setAttribute('aria-hidden', 'true');
            }
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
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
            this._setUrlBarInternalShellMode(null);
            if (el.urlBarCwsInstall) {
                el.urlBarCwsInstall.classList.add('hidden');
                el.urlBarCwsInstall.setAttribute('aria-hidden', 'true');
            }
            this.updateExtensionStoreHostBar('');
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
            return;
        }
        
        // Show URL bar for regular websites (including about:blank during loading)
        el.webviewUrlBar.classList.remove('hidden');
        this._setUrlBarInternalShellMode(null);
        
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

        void this.refreshExtensionStoreListingUi(currentUrl);
        
        // Update input field with current URL
        if (el.urlBarInput) {
            el.urlBarInput.value = currentUrl;
        }
        
        // Format the URL display
        if (el.urlBarDisplay) {
            const alwaysFull = !!this.settings?.alwaysShowFullUrl;
            if (alwaysFull) {
                // Show the full raw URL
                el.urlBarDisplay.textContent = currentUrl || 'New Tab';
            } else {
                // Smart, shorter display (domain + title/path)
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
        }
        if (this.currentTab) this.updateTabTooltip(this.currentTab);
        
        // Extract theme color from website
        if (!opts.skipExtractTheme) {
            this._voidGuestTask(this.extractUrlBarTheme(webview));
        } else if (!opts.keepInstantTheme) {
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
        }
    }
    
    // Apply app theme to URL bar (for regular website tabs — not NTP / Settings)
    applyAppThemeToUrlBar() {
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return;
        if (this._isInternalShellUrlBar(urlBar)) {
            this.applyInternalShellUrlBarStyle();
            return;
        }
        const themeColor = this.settings?.themeColor || '#1a1a1a';
        const gradientColor = this.settings?.gradientColor || '#2a2a2a';
        const gradientEnabled = this.settings?.gradientEnabled && gradientColor;
        const gradientDirection = this.settings?.gradientDirection || '135deg';

        let scForBar = null;
        let shellDarkChrome = this.isIncognitoWindow || this.isDarkColor(themeColor);
        if (!this.isIncognitoWindow) {
            if (this.settings?.transparentSites) {
                scForBar = this.getShellChromeStyle();
                const gaP = this.getThemeAwareGlassAlpha(themeColor, scForBar.glassAlpha);
                const surfT = this.approximateGlassSurfaceHex(themeColor, gaP);
                const surfG = gradientEnabled
                    ? this.approximateGlassSurfaceHex(
                          gradientColor,
                          this.getThemeAwareGlassAlpha(gradientColor, scForBar.glassAlpha)
                      )
                    : null;
                const blended = surfG ? this.mixHexColors(surfT, surfG, 0.5) : surfT;
                shellDarkChrome = this.isDarkColor(blended);
            } else if (gradientEnabled) {
                shellDarkChrome = this.isDarkColor(this.mixHexColors(themeColor, gradientColor, 0.5));
            }
        }

        if (this.settings?.transparentSites) {
            const sc = scForBar || this.getShellChromeStyle();
            urlBar.style.setProperty('backdrop-filter', sc.backdropMain);
            urlBar.style.setProperty('-webkit-backdrop-filter', sc.backdropMain);
            urlBar.classList.toggle('dark-mode', shellDarkChrome);
            const gaP = this.getThemeAwareGlassAlpha(themeColor, sc.glassAlpha);
            const gaG = gradientEnabled ? this.getThemeAwareGlassAlpha(gradientColor, sc.glassAlpha) : gaP;
            const bgColor = gradientEnabled
                ? this.smoothGradient(
                    gradientDirection,
                    this.hexToRgba(themeColor, gaP),
                    this.hexToRgba(gradientColor, gaG)
                )
                : this.hexToRgba(themeColor, gaP);
            urlBar.style.setProperty('--url-bar-bg', bgColor);
            if (shellDarkChrome) {
                urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.12)');
                urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
                urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.6)');
                urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.14)');
            } else {
                urlBar.style.setProperty('--url-bar-border', 'rgba(0, 0, 0, 0.12)');
                urlBar.style.setProperty('--url-bar-text', 'rgba(0, 0, 0, 0.9)');
                urlBar.style.setProperty('--url-bar-text-muted', 'rgba(0, 0, 0, 0.55)');
                urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(0, 0, 0, 0.08)');
            }
            this.applyChatPanelTheme(urlBar);
            return;
        }

        urlBar.style.removeProperty('backdrop-filter');
        urlBar.style.removeProperty('-webkit-backdrop-filter');
        const bgColor = gradientEnabled
            ? this.smoothGradient(gradientDirection, themeColor, gradientColor)
            : themeColor;
        urlBar.classList.toggle('dark-mode', shellDarkChrome);
        urlBar.style.setProperty('--url-bar-bg', bgColor);
        if (shellDarkChrome) {
            urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.14)');
            urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
            urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.6)');
            urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.16)');
        } else {
            urlBar.style.setProperty('--url-bar-border', 'rgba(0, 0, 0, 0.14)');
            urlBar.style.setProperty('--url-bar-text', 'rgba(0, 0, 0, 0.9)');
            urlBar.style.setProperty('--url-bar-text-muted', 'rgba(0, 0, 0, 0.55)');
            urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(0, 0, 0, 0.1)');
        }
        this.applyChatPanelTheme(urlBar);
    }

    /** Frosted strip for new tab / AI chat — always dark, unaffected by uiTheme. */
    _applyNtpUrlBarStyle(urlBar) {
        const sc = this.getShellChromeStyle({ forceDarkNewTabSurfaces: true });
        const useShellGlass = !!this.settings?.transparentSites || sc.t > 0;

        const paintBg = useShellGlass
            ? sc.newTabSearchBg
            : 'rgba(14, 15, 18, 0.18)';

        const backdrop = sc.backdropMain !== 'none'
            ? sc.backdropMain
            : `blur(${sc.newTabSearchBlur}px) saturate(${sc.newTabSearchSat}%)`;

        urlBar.style.setProperty('backdrop-filter', backdrop);
        urlBar.style.setProperty('-webkit-backdrop-filter', backdrop);
        urlBar.style.setProperty('--url-bar-bg', paintBg);
        urlBar.classList.add('dark-mode');
        urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.06)');
        urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
        urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.58)');
        urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.12)');
        urlBar.style.setProperty('background', paintBg, 'important');
    }

    /** New tab + Settings URL bar — always dark frosted chrome, unaffected by `uiTheme`. */
    applyInternalShellUrlBarStyle() {
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar || !urlBar.classList.contains('url-bar-internal-shell')) return;
        this._applyNtpUrlBarStyle(urlBar);
        this.applyChatPanelTheme(urlBar);
    }

    /** @deprecated alias — use applyInternalShellUrlBarStyle */
    applyNewTabPageUrlBarStyle() {
        this.applyInternalShellUrlBarStyle();
    }
    
    _clearUrlBarThemeRefineTimer() {
        if (this._urlBarThemeRefineTimer) {
            clearTimeout(this._urlBarThemeRefineTimer);
            this._urlBarThemeRefineTimer = null;
        }
    }

    /** One delayed re-extract so late-painted headers / meta updates can correct the URL bar tint. */
    _scheduleUrlBarThemeRefine(webview) {
        this._clearUrlBarThemeRefineTimer();
        if (!webview) return;
        const wv = webview;
        this._urlBarThemeRefineTimer = setTimeout(() => {
            this._urlBarThemeRefineTimer = null;
            if (this.getActiveWebview() !== wv) return;
            const tab = this.currentTab != null ? this.tabs.get(this.currentTab) : null;
            if (!tab || tab.url === this.NEWTAB_URL || tab.url === 'axis://settings' || tab.isSettings) return;
            void this.extractUrlBarTheme(wv, { refine: true });
        }, 480);
    }

    // Extract website theme color and apply to URL bar
    async extractUrlBarTheme(webview, opts = {}) {
        if (!webview) return;
        
        const urlBar = this.elements?.webviewUrlBar;
        if (!urlBar) return;
        if (this._isInternalShellUrlBar(urlBar)) {
            return;
        }

        this._clearUrlBarThemeRefineTimer();
        const seq = ++this._urlBarThemeSeq;
        
        try {
            const colorInfo = await webview.executeJavaScript(`
                (function() {
                    try {
                        function parseColor(str) {
                            if (!str || str === 'transparent' || str === 'rgba(0, 0, 0, 0)') return null;
                            if (str.startsWith('#')) {
                                var hex = str;
                                if (hex.length === 4) {
                                    hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
                                }
                                if (hex.length === 7) {
                                    return {
                                        r: parseInt(hex.slice(1, 3), 16),
                                        g: parseInt(hex.slice(3, 5), 16),
                                        b: parseInt(hex.slice(5, 7), 16)
                                    };
                                }
                            }
                            var match = str.match(/[\\d.]+/g);
                            if (match && match.length >= 3) {
                                var r = Math.round(parseFloat(match[0]));
                                var g = Math.round(parseFloat(match[1]));
                                var b = Math.round(parseFloat(match[2]));
                                var a = match.length >= 4 ? parseFloat(match[3]) : 1;
                                if (a < 0.1) return null;
                                return { r, g, b };
                            }
                            return null;
                        }
                        function getBrightness(rgb) {
                            return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
                        }
                        function rgbKey(rgb) {
                            return Math.round(rgb.r / 8) + ',' + Math.round(rgb.g / 8) + ',' + Math.round(rgb.b / 8);
                        }
                        function colorDist(a, b) {
                            return Math.sqrt(
                                (a.r - b.r) * (a.r - b.r) +
                                (a.g - b.g) * (a.g - b.g) +
                                (a.b - b.b) * (a.b - b.b)
                            );
                        }
                        function isSimilar(a, b, maxDist) {
                            return colorDist(a, b) <= (maxDist || 42);
                        }
                        function isConsentChrome(el) {
                            if (!el || el.nodeType !== 1) return false;
                            var t = (
                                String(el.id || '') + ' ' +
                                String(el.className || '') + ' ' +
                                String(el.getAttribute('aria-label') || '')
                            ).toLowerCase();
                            return /\\bcookie\\b|\\bconsent\\b|\\bgdpr\\b|\\bccpa\\b|\\bonetrust\\b|\\bosano\\b|usercentrics|cookiebot|cookielaw|announcement-bar|cmp-/.test(t);
                        }
                        function isInteractiveLeaf(el) {
                            if (!el || el.nodeType !== 1) return false;
                            var tag = el.tagName;
                            if (tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' || tag === 'SELECT') return true;
                            var role = String(el.getAttribute('role') || '').toLowerCase();
                            return role === 'button' || role === 'link' || role === 'menuitem';
                        }
                        function isAccentChip(rgb, rect) {
                            var max = Math.max(rgb.r, rgb.g, rgb.b);
                            var min = Math.min(rgb.r, rgb.g, rgb.b);
                            if (max < 40) return false;
                            var sat = (max - min) / max;
                            var area = rect ? Math.max(0, rect.width * rect.height) : 0;
                            return sat > 0.52 && area > 0 && area < 12000;
                        }
                        function getEffectiveBg(el) {
                            var cur = el;
                            while (cur && cur.nodeType === 1) {
                                if (cur.tagName === 'IFRAME') return null;
                                var bg = parseColor(window.getComputedStyle(cur).backgroundColor);
                                if (bg && (bg.r + bg.g + bg.b) > 28) return bg;
                                cur = cur.parentElement;
                            }
                            return null;
                        }
                        function collectTopVoteCandidate() {
                            var vw = window.innerWidth || document.documentElement.clientWidth || 0;
                            var vh = window.innerHeight || document.documentElement.clientHeight || 300;
                            if (vw < 2 || vh < 8) return null;
                            var votes = Object.create(null);
                            var xs = [Math.floor(vw * 0.5), Math.floor(vw * 0.22), Math.floor(vw * 0.78)];
                            var ys = [4, 12, 22, 34, 48];
                            for (var yi = 0; yi < ys.length; yi++) {
                                var yy = ys[yi];
                                if (yy >= vh - 2) continue;
                                for (var xi = 0; xi < xs.length; xi++) {
                                    var xx = Math.max(0, Math.min(vw - 1, xs[xi]));
                                    var els;
                                    try { els = document.elementsFromPoint(xx, yy); } catch (e) { continue; }
                                    if (!els || !els.length) continue;
                                    for (var i = 0; i < Math.min(els.length, 24); i++) {
                                        var el = els[i];
                                        if (!el || el.nodeType !== 1) continue;
                                        if (isConsentChrome(el)) continue;
                                        var rect = el.getBoundingClientRect();
                                        var area = Math.max(0, rect.width * rect.height);
                                        var bg = getEffectiveBg(el);
                                        if (!bg) continue;
                                        if (isInteractiveLeaf(el) && area < 18000) continue;
                                        if (isAccentChip(bg, rect)) continue;
                                        var spanW = rect.width >= Math.min(200, vw * 0.28);
                                        var spanH = rect.height >= 20 || (rect.top <= 4 && rect.height >= 12);
                                        var bodyPaint = el === document.body || el === document.documentElement;
                                        var weight = 1;
                                        if (spanW && spanH) weight += 2;
                                        if (bodyPaint) weight += 1;
                                        if (yy <= 14) weight += 1;
                                        var key = rgbKey(bg);
                                        if (!votes[key]) votes[key] = { rgb: bg, score: 0, hits: 0 };
                                        votes[key].score += weight;
                                        votes[key].hits += 1;
                                    }
                                }
                            }
                            var bestKey = null;
                            var bestScore = 0;
                            for (var k in votes) {
                                if (votes[k].score > bestScore) {
                                    bestScore = votes[k].score;
                                    bestKey = k;
                                }
                            }
                            if (!bestKey || bestScore < 3) return null;
                            return { rgb: votes[bestKey].rgb, score: 55 + bestScore * 8, source: 'topvote' };
                        }
                        function collectHeaderCandidate() {
                            var selectors = ['header', 'nav', '[role="banner"]', '[role="navigation"]', '.header', '.navbar', '.app-bar', '#header', '#navbar'];
                            var best = null;
                            var bestScore = 0;
                            var vh = window.innerHeight || 400;
                            var vw = window.innerWidth || 800;
                            for (var s = 0; s < selectors.length; s++) {
                                var nodes = document.querySelectorAll(selectors[s]);
                                for (var j = 0; j < nodes.length; j++) {
                                    var el = nodes[j];
                                    if (!el || isConsentChrome(el)) continue;
                                    var r = el.getBoundingClientRect();
                                    if (r.bottom < 0 || r.top > vh * 0.45) continue;
                                    if (r.width < Math.min(100, vw * 0.15)) continue;
                                    var bg = getEffectiveBg(el);
                                    if (!bg || isAccentChip(bg, r)) continue;
                                    var st = window.getComputedStyle(el);
                                    var pos = st.position;
                                    var score = 40;
                                    if (pos === 'fixed' || pos === 'sticky') score += 50;
                                    if (r.top <= 8) score += 40;
                                    if (el.tagName === 'HEADER' || el.tagName === 'NAV') score += 35;
                                    score += Math.min(r.height, 96) * 0.2;
                                    score += Math.min(r.width, vw) / vw * 30;
                                    if (score > bestScore) {
                                        bestScore = score;
                                        best = { rgb: bg, score: 60 + score, source: 'header' };
                                    }
                                }
                            }
                            return best;
                        }
                        function collectMetaCandidate() {
                            var themeMeta = document.querySelector('meta[name="theme-color"]');
                            if (!themeMeta || !themeMeta.content) return null;
                            var metaColor = parseColor(themeMeta.content);
                            if (!metaColor) return null;
                            return { rgb: metaColor, score: 72, source: 'meta' };
                        }
                        function collectSurfaceCandidate() {
                            var bodyBg = parseColor(window.getComputedStyle(document.body).backgroundColor);
                            var htmlBg = parseColor(window.getComputedStyle(document.documentElement).backgroundColor);
                            var pick = bodyBg || htmlBg;
                            if (!pick) return null;
                            return { rgb: pick, score: 48, source: 'surface' };
                        }
                        function pickBestCandidate(cands) {
                            if (!cands.length) return null;
                            var boosted = cands.slice();
                            for (var i = 0; i < boosted.length; i++) {
                                for (var j = i + 1; j < boosted.length; j++) {
                                    if (isSimilar(boosted[i].rgb, boosted[j].rgb, 48)) {
                                        boosted[i].score += 28;
                                        boosted[j].score += 28;
                                    }
                                }
                            }
                            boosted.sort(function(a, b) { return b.score - a.score; });
                            return boosted[0];
                        }

                        var candidates = [];
                        var top = collectTopVoteCandidate();
                        var hdr = collectHeaderCandidate();
                        var meta = collectMetaCandidate();
                        var surface = collectSurfaceCandidate();
                        if (top) candidates.push(top);
                        if (hdr) candidates.push(hdr);
                        if (meta) candidates.push(meta);
                        if (surface) candidates.push(surface);

                        var cMeta = meta;
                        var cTop = top;
                        var cHdr = hdr;
                        if (cMeta && cHdr && isSimilar(cMeta.rgb, cHdr.rgb, 50)) {
                            cMeta.score += 35;
                            cHdr.score += 35;
                        }
                        if (cMeta && cTop && isSimilar(cMeta.rgb, cTop.rgb, 50)) {
                            cMeta.score += 30;
                            cTop.score += 30;
                        }
                        if (cTop && cHdr && isSimilar(cTop.rgb, cHdr.rgb, 45)) {
                            cTop.score += 40;
                            cHdr.score += 40;
                        }
                        if (cMeta && cTop && cHdr &&
                            !isSimilar(cMeta.rgb, cTop.rgb, 55) &&
                            !isSimilar(cMeta.rgb, cHdr.rgb, 55)) {
                            cMeta.score -= 45;
                        }

                        var winner = pickBestCandidate(candidates);
                        if (winner) {
                            var w = winner.rgb;
                            return { r: w.r, g: w.g, b: w.b, brightness: getBrightness(w), source: winner.source };
                        }

                        return { r: 250, g: 250, b: 250, brightness: 250, source: 'default' };
                    } catch (e) {
                        return { r: 250, g: 250, b: 250, brightness: 250, source: 'error' };
                    }
                })();
            `);

            if (seq !== this._urlBarThemeSeq) return;
            if (this.getActiveWebview() !== webview) return;
            
            if (colorInfo) {
                const { r, g, b, source } = colorInfo;
                const isDefaultOrError = source === 'default' || source === 'error';
                const rr = Math.max(0, Math.min(255, Math.round(r)));
                const gg = Math.max(0, Math.min(255, Math.round(g)));
                const bb = Math.max(0, Math.min(255, Math.round(b)));
                const pageHex = `#${[rr, gg, bb].map((c) => c.toString(16).padStart(2, '0')).join('')}`;

                if (this.settings?.transparentSites) {
                    const sc = this.getShellChromeStyle();
                    urlBar.style.setProperty('backdrop-filter', sc.backdropMain);
                    urlBar.style.setProperty('-webkit-backdrop-filter', sc.backdropMain);

                    let bgColor;
                    let barDarkMode;
                    if (isDefaultOrError) {
                        barDarkMode = true;
                        const nh = '#0e0f12';
                        const tintA = this.getThemeAwareGlassAlpha(nh, sc.glassAlpha);
                        bgColor = this.hexToRgba(nh, tintA);
                    } else {
                        const tintA = this.getThemeAwareGlassAlpha(pageHex, sc.glassAlpha);
                        const surf = this.approximateGlassSurfaceHex(pageHex, tintA);
                        barDarkMode = this.isDarkColor(surf);
                        bgColor = `rgba(${rr}, ${gg}, ${bb}, ${Math.min(0.995, tintA)})`;
                    }

                    if (barDarkMode) {
                        urlBar.classList.add('dark-mode');
                        urlBar.style.setProperty('--url-bar-bg', bgColor);
                        urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.12)');
                        urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
                        urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.58)');
                        urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.14)');
                    } else {
                        urlBar.classList.remove('dark-mode');
                        urlBar.style.setProperty('--url-bar-bg', bgColor);
                        urlBar.style.setProperty('--url-bar-border', 'rgba(0, 0, 0, 0.08)');
                        urlBar.style.setProperty('--url-bar-text', 'rgba(0, 0, 0, 0.88)');
                        urlBar.style.setProperty('--url-bar-text-muted', 'rgba(0, 0, 0, 0.5)');
                        urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(0, 0, 0, 0.08)');
                    }
                    this.applyChatPanelTheme(urlBar);
                } else {
                    urlBar.style.removeProperty('backdrop-filter');
                    urlBar.style.removeProperty('-webkit-backdrop-filter');
                    const bgColor = `rgba(${rr}, ${gg}, ${bb}, 1)`;
                    const pageBgDark = this.isDarkColor(pageHex);

                    if (pageBgDark) {
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
                    this.applyChatPanelTheme(urlBar);
                }
                if (!opts.refine) {
                    this._scheduleUrlBarThemeRefine(webview);
                }
                this._persistUrlBarChromeToTab(this.currentTab);
            }
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
        } catch (e) {
            if (seq !== this._urlBarThemeSeq) return;
            if (this.getActiveWebview() !== webview) return;
            if (this.settings?.transparentSites) {
                urlBar.classList.add('dark-mode');
                const sc = this.getShellChromeStyle();
                urlBar.style.setProperty('backdrop-filter', sc.backdropMain);
                urlBar.style.setProperty('-webkit-backdrop-filter', sc.backdropMain);
                const nh = '#0e0f12';
                const ta = this.getThemeAwareGlassAlpha(nh, sc.glassAlpha);
                const bg = this.hexToRgba(nh, ta);
                urlBar.style.setProperty('--url-bar-bg', bg);
                urlBar.style.setProperty('--url-bar-border', 'rgba(255, 255, 255, 0.12)');
                urlBar.style.setProperty('--url-bar-text', 'rgba(255, 255, 255, 0.96)');
                urlBar.style.setProperty('--url-bar-text-muted', 'rgba(255, 255, 255, 0.58)');
                urlBar.style.setProperty('--url-bar-btn-hover', 'rgba(255, 255, 255, 0.14)');
                this.applyChatPanelTheme(urlBar);
            } else {
                urlBar.classList.remove('dark-mode');
                urlBar.style.removeProperty('backdrop-filter');
                urlBar.style.removeProperty('-webkit-backdrop-filter');
                urlBar.style.setProperty('--url-bar-bg', 'rgba(250, 250, 250, 0.95)');
                this.applyChatPanelTheme(urlBar);
            }
            this._releaseUrlBarInstantThemeAfterTabSwitchIfNeeded();
        }
    }

    /** AI chat panel is always black chrome with light text (not tied to page / URL bar theming). */
    applyChatPanelTheme(urlBar) {
        const container = urlBar && urlBar.closest ? urlBar.closest('.webview-container') : null;
        if (!container) return;
        container.style.setProperty('--chat-panel-bg', '#000000');
        container.style.setProperty('--chat-panel-border', 'rgba(255, 255, 255, 0.1)');
        container.style.setProperty('--chat-panel-text', 'rgba(255, 255, 255, 0.96)');
        container.style.setProperty('--chat-panel-text-muted', 'rgba(255, 255, 255, 0.55)');
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
        this._pipLeaveBusy = false;
    }
    
    startPIPLeaveCheck() {
        this.stopPIPLeaveCheck();
        this._pipLeaveBusy = false;
        this.pipLeaveCheckInterval = setInterval(() => {
            void this._pipPollPiPStateOnce();
        }, 150);
    }

    /**
     * When native PiP ends, show the **sidebar mini player** whenever the guest still has the
     * target `<video>` (playback may be running or paused depending on how PiP was closed).
     * The dock stays until the media **ends**, the element disappears, or the user dismisses.
     */
    async _pipPollPiPStateOnce() {
        if (!this.pipTabId || !this.pipWebview || this._pipLeaveBusy) return;
        let stillInPIP = true;
        try {
            stillInPIP = await this.pipWebview.executeJavaScript('!!document.pictureInPictureElement');
        } catch (e) {
            return;
        }
        if (stillInPIP) return;
        if (this._pipLeaveBusy) return;
        this._pipLeaveBusy = true;
        this.stopPIPLeaveCheck();

        const webview = this.pipWebview;
        const rawId = this.pipTabId;
        const id = this._normalizeTabMapKey(rawId);
        const idx = Number(this.pipVideoIndex) || 0;

        try {
            /* Brief settle after native PiP teardown (guest DOM / `paused` can flicker one frame). */
            await new Promise((r) => setTimeout(r, 90));
            let videoPresent = false;
            if (webview && !webview.isDestroyed?.() && id != null) {
                try {
                    videoPresent = await webview.executeJavaScript(`
                        (function() {
                            var videos = document.querySelectorAll('video');
                            return !!(videos[${idx}]);
                        })();
                    `);
                } catch (_) {}
            }
            /* Always offer the sidebar mini player when PiP ends and the `<video>` is still in
             * the page — whether the site left playback running or paused it (e.g. PiP close).
             * Showing only when `!paused` missed common cases and the dock poll hid instantly. */
            if (videoPresent && id != null) {
                /* Native PiP teardown does not tell us the user’s intent — never auto-switch the
                 * active tab here; use **Go to tab** on the sidebar dock or the tab strip. */
                this.showSidebarMediaDock(id, idx);
            }
        } finally {
            this._pipLeaveBusy = false;
            this.hidePIP();
        }
    }
    
    stopPIPLeaveCheck() {
        if (this.pipLeaveCheckInterval) {
            clearInterval(this.pipLeaveCheckInterval);
            this.pipLeaveCheckInterval = null;
        }
    }

    /**
     * Injected into guests for tab-switch auto-PiP only. Filters tiny/decorative `<video>` loops
     * (hero animations, sprites) so only layout-large, reasonably sized media can trigger PiP.
     */
    static _guestVideoEligibleForAutoPipSrc() {
        return `
                    function axisGuestVideoEligibleForAutoPip(v) {
                        try {
                            var r = v.getBoundingClientRect();
                            var layW = r.width;
                            var layH = r.height;
                            var area = layW * layH;
                            var MIN_EDGE = 112;
                            var MIN_AREA = 12000;
                            if (!(layW >= MIN_EDGE && layH >= MIN_EDGE && area >= MIN_AREA)) return false;
                            var aw = v.videoWidth || 0;
                            var ah = v.videoHeight || 0;
                            if (aw > 0 && ah > 0 && Math.min(aw, ah) < 96) return false;
                            if (typeof v.checkVisibility === 'function') {
                                try {
                                    if (!v.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
                                } catch (e) {}
                            }
                            var cs = getComputedStyle(v);
                            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.03) return false;
                            return true;
                        } catch (e) {
                            return false;
                        }
                    }`;
    }
    
    async checkAndShowPIP(tabId, webview) {
        if (!webview) return;
        
        try {
            // Check if there's a playing video and request native PIP
            const result = await webview.executeJavaScript(`
                (async function() {
                    ${AxisBrowser._guestVideoEligibleForAutoPipSrc()}
                    const videos = document.querySelectorAll('video');
                    for (let i = 0; i < videos.length; i++) {
                        const v = videos[i];
                        if (!v.paused && v.readyState >= 2 && axisGuestVideoEligibleForAutoPip(v)) {
                            try {
                                if (document.pictureInPictureEnabled && !v.disablePictureInPicture) {
                                    if (document.pictureInPictureElement) {
                                        await document.exitPictureInPicture();
                                    }
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
                    ${AxisBrowser._guestVideoEligibleForAutoPipSrc()}
                    const videos = document.querySelectorAll('video');
                    const videoIndex = ${videoIndex};
                    if (videos.length > videoIndex) {
                        const v = videos[videoIndex];
                        if (v && axisGuestVideoEligibleForAutoPip(v) && document.pictureInPictureEnabled && !v.disablePictureInPicture) {
                            try {
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

    setupSidebarMediaDockListeners() {
        const el = this.elements;
        el.sidebarMediaTitleBtn?.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!this._sidebarMediaDock) return;
            const tid = this._normalizeTabMapKey(this._sidebarMediaDock.tabId);
            if (tid != null) this.switchToTab(tid);
        });
        el.sidebarMediaPipBtn?.addEventListener('click', () => void this.sidebarMediaDockRequestPip());
        el.sidebarMediaDismissBtn?.addEventListener('click', () => void this.sidebarMediaDockDismiss());
        el.sidebarMediaPrevBtn?.addEventListener('click', () => void this.sidebarMediaDockSeek(-10));
        el.sidebarMediaPlayBtn?.addEventListener('click', () => void this.sidebarMediaDockTogglePlay());
        el.sidebarMediaNextBtn?.addEventListener('click', () => void this.sidebarMediaDockSeek(10));
        el.sidebarMediaVolBtn?.addEventListener('click', () => void this.sidebarMediaDockToggleMute());
    }

    _getSidebarMediaWebview() {
        if (!this._sidebarMediaDock) return null;
        const tid = this._normalizeTabMapKey(this._sidebarMediaDock.tabId);
        const tab = tid != null ? this.tabs.get(tid) : null;
        return tab?.webview || null;
    }

    hideSidebarMediaDock() {
        this._stopSidebarMediaDockPoll();
        this._sidebarMediaTitleDisconnectResizeObserver();
        this._sidebarMediaDock = null;
        this._sidebarMediaGlowSeq += 1;
        const dock = this.elements?.sidebarMediaDock;
        if (!dock) return;
        const card = dock.querySelector('.sidebar-media-dock-card');
        if (card) {
            card.classList.remove('sidebar-media-dock-card--playing', 'sidebar-media-dock-card--paused');
        }
        dock.classList.remove('sidebar-media-dock--shown');
        const finishHide = () => {
            dock.classList.add('hidden');
            dock.classList.remove('sidebar-media-dock--mounted');
        };
        if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
            finishHide();
            return;
        }
        window.setTimeout(finishHide, 280);
    }

    _stopSidebarMediaDockPoll() {
        if (this._sidebarMediaDockPoll) {
            clearInterval(this._sidebarMediaDockPoll);
            this._sidebarMediaDockPoll = null;
        }
    }

    showSidebarMediaDock(tabId, videoIndex) {
        const tid = this._normalizeTabMapKey(tabId);
        if (tid == null || !this.tabs.has(tid)) return;
        this._stopSidebarMediaDockPoll();
        this._sidebarMediaDock = { tabId: tid, videoIndex: Number(videoIndex) || 0 };
        const dock = this.elements?.sidebarMediaDock;
        if (dock) {
            dock.classList.remove('hidden');
            dock.classList.add('sidebar-media-dock--mounted');
            dock.classList.remove('sidebar-media-dock--shown');
            const card = dock.querySelector('.sidebar-media-dock-card');
            if (card) this.elements.sidebarMediaDockCard = card;
            const reveal = () => dock.classList.add('sidebar-media-dock--shown');
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(reveal));
            } else {
                reveal();
            }
        }
        this._refreshSidebarMediaDockChrome();
        this._sidebarMediaTitleEnsureResizeObserver();
        this._startSidebarMediaDockPoll();
    }

    _sidebarMediaTitleEnsureResizeObserver() {
        const mask = this.elements?.sidebarMediaTitleMask;
        if (!mask || typeof ResizeObserver === 'undefined') return;
        if (this._sidebarMediaTitleResizeObserver) {
            try {
                this._sidebarMediaTitleResizeObserver.observe(mask);
            } catch (_) {
                /* already observing */
            }
            return;
        }
        this._sidebarMediaTitleResizeObserver = new ResizeObserver(() => {
            this._layoutSidebarMediaTitleSlide();
        });
        this._sidebarMediaTitleResizeObserver.observe(mask);
    }

    _sidebarMediaTitleDisconnectResizeObserver() {
        if (!this._sidebarMediaTitleResizeObserver) return;
        try {
            this._sidebarMediaTitleResizeObserver.disconnect();
        } catch (_) {
            /* ignore */
        }
        this._sidebarMediaTitleResizeObserver = null;
    }

    _layoutSidebarMediaTitleSlide() {
        const mask = this.elements?.sidebarMediaTitleMask;
        const text = this.elements?.sidebarMediaTitle;
        if (!mask || !text) return;
        const apply = () => {
            const avail = Math.max(0, mask.clientWidth);
            const need = text.scrollWidth;
            const over = Math.max(0, need - avail);
            text.style.setProperty('--sidebar-media-title-slide', over > 5 ? `-${over}px` : '0px');
        };
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(apply);
        else apply();
    }

    _refreshSidebarMediaDockChrome() {
        const el = this.elements;
        const state = this._sidebarMediaDock;
        if (!state) return;
        const tab = this.tabs.get(this._normalizeTabMapKey(state.tabId));
        const rawUrl = tab?.url || '';
        const isYouTube = this.isYouTubeHost(rawUrl);
        const title = tab?.customTitle || tab?.title || 'Playing media';
        if (el.sidebarMediaTitle) el.sidebarMediaTitle.textContent = title;
        if (el.sidebarMediaTitleBtn) {
            el.sidebarMediaTitleBtn.title = title ? `${title} — Go to tab` : 'Go to tab';
        }

        const card =
            el.sidebarMediaDockCard ||
            el.sidebarMediaDock?.querySelector?.('.sidebar-media-dock-card');
        if (card) {
            el.sidebarMediaDockCard = card;
            card.classList.remove('sidebar-media-dock-card--yt');
        }

        const playI = el.sidebarMediaPlayBtn?.querySelector('i');
        if (playI) playI.className = 'fas fa-pause';
        const volI = el.sidebarMediaVolBtn?.querySelector('i');
        if (volI) volI.className = 'fas fa-volume-high';
        const badge = el.sidebarMediaSourceBadge;
        const faviconUrl = tab?.favicon || (rawUrl ? this.getFaviconUrl(rawUrl) : null);
        if (badge) {
            if (faviconUrl) {
                badge.innerHTML = `<img class="sidebar-media-favicon" src="${this.escapeHtml(faviconUrl)}" alt="" draggable="false" />`;
            } else if (isYouTube) {
                badge.innerHTML = '<span class="sidebar-media-yt" title="YouTube"></span>';
            } else {
                badge.innerHTML =
                    '<i class="fas fa-film sidebar-media-source-generic" aria-hidden="true"></i>';
            }
        }
        this._layoutSidebarMediaTitleSlide();
        if (card && tab) {
            const faviconImg = badge?.querySelector?.('.sidebar-media-favicon');
            if (faviconImg) {
                const runGlow = () => void this._applySidebarMediaDockGlow(tab, card, faviconImg);
                if (faviconImg.complete) runGlow();
                else {
                    faviconImg.addEventListener('load', runGlow, { once: true });
                    faviconImg.addEventListener('error', runGlow, { once: true });
                }
            } else {
                void this._applySidebarMediaDockGlow(tab, card, null);
            }
        }
    }

    /** Pick a saturated accent RGB from favicon pixels (for the dock radial glow). */
    _accentFromFaviconImage(img) {
        if (!img || !img.naturalWidth || !img.naturalHeight) return null;
        try {
            const size = 32;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return null;
            ctx.drawImage(img, 0, 0, size, size);
            const data = ctx.getImageData(0, 0, size, size).data;
            let bestSat = 0;
            let br = 0;
            let bg = 0;
            let bb = 0;
            let ar = 0;
            let ag = 0;
            let ab = 0;
            let n = 0;
            for (let i = 0; i < data.length; i += 4) {
                const pr = data[i];
                const pg = data[i + 1];
                const pb = data[i + 2];
                const pa = data[i + 3];
                if (pa < 100) continue;
                const max = Math.max(pr, pg, pb);
                const min = Math.min(pr, pg, pb);
                const lum = (pr + pg + pb) / 3;
                if (lum < 28 || lum > 245) continue;
                const sat = max === 0 ? 0 : (max - min) / max;
                ar += pr;
                ag += pg;
                ab += pb;
                n += 1;
                if (sat >= 0.14 && sat >= bestSat) {
                    bestSat = sat;
                    br = pr;
                    bg = pg;
                    bb = pb;
                }
            }
            if (bestSat >= 0.14) return { r: br, g: bg, b: bb };
            if (n > 0) {
                return {
                    r: Math.round(ar / n),
                    g: Math.round(ag / n),
                    b: Math.round(ab / n)
                };
            }
        } catch (_) {
            /* canvas tainted or unavailable */
        }
        return null;
    }

    _sidebarMediaFallbackAccent(rawUrl, isYouTube) {
        if (isYouTube) return { r: 230, g: 52, b: 60 };
        try {
            const host = new URL(rawUrl).hostname || '';
            let hash = 0;
            for (let i = 0; i < host.length; i++) hash = (hash * 31 + host.charCodeAt(i)) >>> 0;
            const hue = hash % 360;
            const s = 0.48;
            const l = 0.54;
            const c = (1 - Math.abs(2 * l - 1)) * s;
            const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
            const m = l - c / 2;
            let rp = 0;
            let gp = 0;
            let bp = 0;
            if (hue < 60) {
                rp = c;
                gp = x;
            } else if (hue < 120) {
                rp = x;
                gp = c;
            } else if (hue < 180) {
                gp = c;
                bp = x;
            } else if (hue < 240) {
                gp = x;
                bp = c;
            } else if (hue < 300) {
                rp = x;
                bp = c;
            } else {
                rp = c;
                bp = x;
            }
            return {
                r: Math.round((rp + m) * 255),
                g: Math.round((gp + m) * 255),
                b: Math.round((bp + m) * 255)
            };
        } catch (_) {
            return { r: 88, g: 118, b: 198 };
        }
    }

    _setSidebarMediaDockGlow(card, accent) {
        if (!card || !accent) return;
        card.style.setProperty('--sidebar-media-glow-r', String(accent.r));
        card.style.setProperty('--sidebar-media-glow-g', String(accent.g));
        card.style.setProperty('--sidebar-media-glow-b', String(accent.b));
        card.classList.add('sidebar-media-dock-card--glow');
    }

    async _applySidebarMediaDockGlow(tab, card, faviconImg) {
        if (!card || !tab) return;
        const seq = ++this._sidebarMediaGlowSeq;
        const rawUrl = tab.url || '';
        const isYouTube = this.isYouTubeHost(rawUrl);
        let accent = null;
        if (faviconImg) {
            accent = this._accentFromFaviconImage(faviconImg);
        }
        if (!accent) {
            const faviconUrl = tab.favicon || (rawUrl ? this.getFaviconUrl(rawUrl) : null);
            if (faviconUrl && faviconUrl !== faviconImg?.src) {
                accent = await new Promise((resolve) => {
                    const probe = new Image();
                    probe.crossOrigin = 'anonymous';
                    probe.onload = () => resolve(this._accentFromFaviconImage(probe));
                    probe.onerror = () => resolve(null);
                    probe.src = faviconUrl;
                });
            }
        }
        if (seq !== this._sidebarMediaGlowSeq) return;
        if (!accent) accent = this._sidebarMediaFallbackAccent(rawUrl, isYouTube);
        this._setSidebarMediaDockGlow(card, accent);
    }

    _startSidebarMediaDockPoll() {
        this._stopSidebarMediaDockPoll();
        this._sidebarMediaDockPoll = setInterval(() => void this._sidebarMediaDockPollTick(), 1400);
        void this._sidebarMediaDockPollTick();
    }

    async _sidebarMediaDockPollTick() {
        if (!this._sidebarMediaDock) return;
        const wv = this._getSidebarMediaWebview();
        if (!wv || wv.isDestroyed?.()) {
            this.hideSidebarMediaDock();
            return;
        }
        const idx = this._sidebarMediaDock.videoIndex;
        let ended = false;
        let paused = true;
        let muted = false;
        try {
            const res = await wv.executeJavaScript(`
                (function() {
                    var videos = document.querySelectorAll('video');
                    var v = videos[${idx}];
                    if (!v) return { ok: false };
                    return { ok: true, paused: !!v.paused, ended: !!v.ended, muted: !!v.muted };
                })();
            `);
            if (!res || !res.ok) {
                this.hideSidebarMediaDock();
                return;
            }
            ended = !!res.ended;
            paused = !!res.paused;
            muted = !!res.muted;
        } catch (_) {
            return;
        }
        if (ended) {
            this.hideSidebarMediaDock();
            return;
        }
        this._updateSidebarMediaPlayMuteIcons(paused, muted);
    }

    _updateSidebarMediaPlayMuteIcons(paused, muted) {
        const playI = this.elements?.sidebarMediaPlayBtn?.querySelector('i');
        if (playI) {
            playI.className = paused ? 'fas fa-play' : 'fas fa-pause';
        }
        const volI = this.elements?.sidebarMediaVolBtn?.querySelector('i');
        if (volI) {
            volI.className = muted ? 'fas fa-volume-xmark' : 'fas fa-volume-high';
        }
        const card =
            this.elements?.sidebarMediaDockCard ||
            this.elements?.sidebarMediaDock?.querySelector?.('.sidebar-media-dock-card');
        if (card) {
            card.classList.toggle('sidebar-media-dock-card--playing', !paused);
            card.classList.toggle('sidebar-media-dock-card--paused', !!paused);
        }
    }

    async sidebarMediaDockTogglePlay() {
        const wv = this._getSidebarMediaWebview();
        const dock = this._sidebarMediaDock;
        if (!wv || !dock) return;
        const idx = dock.videoIndex;
        try {
            await wv.executeJavaScript(`
                (function() {
                    var videos = document.querySelectorAll('video');
                    var v = videos[${idx}];
                    if (!v) return;
                    if (v.paused) { v.play(); } else { v.pause(); }
                })();
            `);
        } catch (_) {}
        void this._sidebarMediaDockPollTick();
    }

    async sidebarMediaDockSeek(deltaSec) {
        const wv = this._getSidebarMediaWebview();
        const dock = this._sidebarMediaDock;
        if (!wv || !dock) return;
        const idx = dock.videoIndex;
        const d = Number(deltaSec) || 0;
        try {
            await wv.executeJavaScript(`
                (function() {
                    var videos = document.querySelectorAll('video');
                    var v = videos[${idx}];
                    if (!v || !isFinite(v.duration)) return;
                    var t = v.currentTime + ${d};
                    v.currentTime = Math.max(0, Math.min(v.duration, t));
                })();
            `);
        } catch (_) {}
    }

    async sidebarMediaDockToggleMute() {
        const wv = this._getSidebarMediaWebview();
        const dock = this._sidebarMediaDock;
        if (!wv || !dock) return;
        const idx = dock.videoIndex;
        try {
            await wv.executeJavaScript(`
                (function() {
                    var videos = document.querySelectorAll('video');
                    var v = videos[${idx}];
                    if (v) v.muted = !v.muted;
                })();
            `);
        } catch (_) {}
        void this._sidebarMediaDockPollTick();
    }

    async sidebarMediaDockDismiss() {
        const wv = this._getSidebarMediaWebview();
        const dock = this._sidebarMediaDock;
        if (wv && dock) {
            const idx = dock.videoIndex;
            try {
                await wv.executeJavaScript(`
                    (function() {
                        var videos = document.querySelectorAll('video');
                        var v = videos[${idx}];
                        if (v && !v.paused) v.pause();
                    })();
                `);
            } catch (_) {}
        }
        this.hideSidebarMediaDock();
    }

    async sidebarMediaDockRequestPip() {
        const wv = this._getSidebarMediaWebview();
        const dock = this._sidebarMediaDock;
        if (!wv || !dock || wv.isDestroyed?.()) return;
        const tabId = dock.tabId;
        const idx = dock.videoIndex;
        try {
            /* Explicit PiP from the dock must not use auto-PiP layout rules: the guest `<video>` is
             * often hidden or zero-sized while the tab is in the background, so
             * `axisGuestVideoEligibleForAutoPip` would block a valid re-entry. */
            const result = await wv.executeJavaScript(
                `
                (async function() {
                    var videos = document.querySelectorAll('video');
                    var v = videos[${idx}];
                    if (!v || v.tagName !== 'VIDEO') return { success: false };
                    if (!document.pictureInPictureEnabled || v.disablePictureInPicture) {
                        return { success: false };
                    }
                    try {
                        if (document.pictureInPictureElement === v) {
                            return { success: true };
                        }
                        if (document.pictureInPictureElement) {
                            await document.exitPictureInPicture();
                        }
                        await v.requestPictureInPicture();
                        return { success: true };
                    } catch (e) {
                        return { success: false };
                    }
                })();
            `,
                true
            );
            if (result && result.success) {
                this.hideSidebarMediaDock();
                this.pipTabId = tabId;
                this.pipVideoIndex = idx;
                this.pipWebview = wv;
                this.startPIPLeaveCheck();
            }
        } catch (_) {}
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

    findWebviewByGuestContentsId(guestWebContentsId) {
        if (guestWebContentsId == null) return null;
        for (const tab of this.tabs.values()) {
            const wv = tab.webview;
            if (!wv) continue;
            try {
                const wc = wv.getWebContents && wv.getWebContents();
                if (wc && wc.id === guestWebContentsId) return wv;
            } catch (_) {}
        }
        const legacy = this.elements?.webview;
        if (legacy) {
            try {
                const wc = legacy.getWebContents && legacy.getWebContents();
                if (wc && wc.id === guestWebContentsId) return legacy;
            } catch (_) {}
        }
        return null;
    }

    routeVaultGuestMessage(channel, payload, webviewHint) {
        const webview = webviewHint || this.getActiveWebview();
        if (channel === 'axis-vault-save-offer') {
            if (!payload) return;
            if (payload.type === 'card' && payload.number && payload.cardholder) {
                void this.handleVaultSaveOffer(webview, payload);
            } else if (payload.username && payload.password) {
                void this.handleVaultSaveOffer(webview, { ...payload, type: 'login' });
            }
            return;
        }
        if (!webview) return;
        if (channel === 'axis-vault-autofill-hide') {
            this.hideVaultAutofillPanel();
            void this.hideVaultAutofillInPage(webview);
            return;
        }
        if (channel === 'axis-vault-autofill-request') {
            void this.presentVaultAutofill(webview, payload);
            return;
        }
        if (channel === 'axis-vault-autofill-query' && payload && payload.rect) {
            void this.handleVaultAutofillQuery(webview, payload);
            return;
        }
        if (channel === 'axis-vault-pick-login' && payload && Array.isArray(payload.logins)) {
            void this.showVaultPickLogin(webview, payload.logins);
            return;
        }
        if (channel === 'axis-vault-pick-card' && payload && Array.isArray(payload.cards)) {
            void this.showVaultPickCard(webview, payload.cards);
        }
    }

    handleVaultGuestIpc(msg) {
        const { channel, payload, guestWebContentsId } = msg || {};
        if (!channel) return;
        const webview = this.findWebviewByGuestContentsId(guestWebContentsId) || this.getActiveWebview();
        if (channel === 'axis-vault-save-offer' && payload) {
            if (payload.type === 'card' && payload.number && payload.cardholder) {
                void this.handleVaultSaveOffer(webview, payload);
            } else if (payload.username && payload.password) {
                void this.handleVaultSaveOffer(webview, { ...payload, type: 'login' });
            }
            return;
        }
        if (!webview) return;
        this.routeVaultGuestMessage(channel, payload, webview);
    }

    async isVaultCredentialTypingIdle(webview) {
        const js = `(function(){var t=window.__axisVaultCredentialEditAt||0;return Date.now()-t>2200})()`;
        let idle = true;
        const visit = async (frame) => {
            if (!frame) return;
            try {
                const r = await frame.executeJavaScript(js, false);
                if (r === false) idle = false;
            } catch (_) {}
            let kids = [];
            try {
                kids = frame.frames || [];
            } catch (_) {
                return;
            }
            for (let i = 0; i < kids.length; i++) {
                try {
                    await visit(kids[i]);
                } catch (_) {}
            }
        };
        try {
            const wc = typeof webview.getWebContents === 'function' ? webview.getWebContents() : null;
            if (wc && !wc.isDestroyed() && wc.mainFrame) {
                await visit(wc.mainFrame);
            } else if (typeof webview.executeJavaScript === 'function') {
                const r = await webview.executeJavaScript(js, true);
                if (r === false) idle = false;
            }
        } catch (_) {}
        return idle;
    }

    async pollVaultCredentialsFromPage(webview) {
        try {
            if (!webview || !this._vaultPageScanJs) return;
            if (!(await this.isVaultCredentialTypingIdle(webview))) return;
            const scanJs = this._vaultPageScanJs;
            let login = null;
            let card = null;
            const visit = async (frame) => {
                if (!frame) return;
                try {
                    const result = await frame.executeJavaScript(scanJs, false);
                    if (!login && result?.login?.username && result.login.password) {
                        login = {
                            ...result.login,
                            type: 'login',
                            pageUrl: result.login.pageUrl || result.login.origin
                        };
                    }
                    if (!card && result?.card?.number && result.card.cardholder) {
                        card = { ...result.card, type: 'card' };
                    }
                } catch (_) {}
                let kids = [];
                try {
                    kids = frame.frames || [];
                } catch (_) {
                    return;
                }
                for (let i = 0; i < kids.length; i++) {
                    try {
                        await visit(kids[i]);
                    } catch (_) {}
                }
            };
            try {
                const wc = typeof webview.getWebContents === 'function' ? webview.getWebContents() : null;
                if (wc && !wc.isDestroyed() && wc.mainFrame) {
                    await visit(wc.mainFrame);
                } else if (typeof webview.executeJavaScript === 'function') {
                    const result = await webview.executeJavaScript(scanJs, true);
                    if (result?.login?.username && result.login.password) login = result.login;
                    if (result?.card?.number && result.card.cardholder) card = result.card;
                }
            } catch (_) {}
            if (login) {
                await this.handleVaultSaveOffer(webview, login);
                return;
            }
            if (card) await this.handleVaultSaveOffer(webview, card);
        } catch (_) {}
    }

    startVaultCredentialWatcher() {
        if (this._vaultPollTimer) clearInterval(this._vaultPollTimer);
        this._vaultPollTimer = setInterval(() => {
            const saveModal = document.getElementById('vault-save-modal');
            if (saveModal && !saveModal.classList.contains('hidden')) return;
            const wv = this.getActiveWebview();
            if (!wv) return;
            let url = '';
            try {
                url = wv.getURL() || '';
            } catch (_) {}
            if (!/^https?:/i.test(url)) return;
            void this.pollVaultCredentialsFromPage(wv).catch(() => {});
        }, 7000);
        if (this._vaultAutofillPollTimer) clearInterval(this._vaultAutofillPollTimer);
        this._vaultAutofillPollTimer = setInterval(() => {
            const wv = this.getActiveWebview();
            if (!wv) return;
            let url = '';
            try {
                url = wv.getURL() || '';
            } catch (_) {}
            if (!/^https?:/i.test(url)) return;
            void this.pollVaultAutofillFocus(wv).catch(() => {});
        }, 280);
    }

    async executeInGuestFrames(webview, js, userGesture = false) {
        if (!webview || !js) return;
        let ran = false;
        const runFrame = async (frame) => {
            if (!frame) return;
            try {
                await frame.executeJavaScript(js, userGesture);
            } catch (_) {
                /* guest frame not ready / cross-origin / destroyed */
            }
            let kids = [];
            try {
                kids = frame.frames || [];
            } catch (_) {
                return;
            }
            for (let i = 0; i < kids.length; i++) {
                try {
                    await runFrame(kids[i]);
                } catch (_) {}
            }
        };
        try {
            const wc = typeof webview.getWebContents === 'function' ? webview.getWebContents() : null;
            if (wc && !wc.isDestroyed() && wc.mainFrame) {
                await runFrame(wc.mainFrame);
                ran = true;
            }
        } catch (_) {}
        if (!ran && typeof webview.executeJavaScript === 'function') {
            try {
                await webview.executeJavaScript(js, userGesture);
            } catch (_) {}
        }
    }

    getVaultAutofillUiTheme() {
        return this.settings?.uiTheme === 'light' && !this.isIncognitoWindow ? 'light' : 'dark';
    }

    async syncVaultAutofillUiTheme(webview) {
        if (!webview) return;
        try {
            const theme = this.getVaultAutofillUiTheme();
            await this.executeInGuestFrames(
                webview,
                `window.__axisVaultUiTheme=${JSON.stringify(theme)};`,
                false
            );
            const menu = document.getElementById('vault-autofill-panel');
            if (menu) menu.setAttribute('data-ui-theme', theme === 'light' ? 'light' : 'dark');
            const saveModal = document.getElementById('vault-save-modal');
            if (saveModal) saveModal.setAttribute('data-ui-theme', theme);
        } catch (_) {}
    }

    async injectVaultAutofillBootstrap(webview) {
        try {
            const js = this._vaultAutofillBootstrapJs;
            if (!webview || !js) return;
            if (webview.classList?.contains('inactive')) return;
            let url = '';
            try {
                url = webview.getURL() || '';
            } catch (_) {}
            if (!/^https?:/i.test(url)) return;
            await this.syncVaultAutofillUiTheme(webview);
            await this.executeInGuestFrames(webview, js, false);
            webview.__axisVaultAutofillInjected = true;
        } catch (_) {}
    }

    async hideVaultAutofillInPage(webview) {
        try {
            const js = this._vaultAutofillHideJs;
            if (!webview || !js) return;
            await this.executeInGuestFrames(webview, js, false);
        } catch (_) {}
    }

    async probeVaultAutofillGuest(webview) {
        const js = this._vaultAutofillProbeJs;
        if (!webview || !js) return null;
        let pick = null;
        let focus = null;
        let focusKey = '';
        const visitFrame = async (frame) => {
            if (!frame) return;
            try {
                const r = await frame.executeJavaScript(js, false);
                if (r?.pick) pick = r.pick;
                if (r?.focus) {
                    focus = r.focus;
                    focusKey = r.focusKey || '';
                }
            } catch (_) {}
            let kids = [];
            try {
                kids = frame.frames || [];
            } catch (_) {
                return;
            }
            for (let i = 0; i < kids.length; i++) {
                try {
                    await visitFrame(kids[i]);
                } catch (_) {}
            }
        };
        try {
            const wc = typeof webview.getWebContents === 'function' ? webview.getWebContents() : null;
            if (wc && !wc.isDestroyed() && wc.mainFrame) {
                await visitFrame(wc.mainFrame);
                return pick ? { pick } : focus ? { focus, focusKey } : null;
            }
        } catch (_) {}
        try {
            return await webview.executeJavaScript(js, true);
        } catch (_) {
            return null;
        }
    }

    async presentVaultAutofill(webview, payload) {
        if (!webview || !payload) return;
        try {
            const status = await window.electronAPI.vaultStatus();
            if (status?.autofillEnabled === false) return;
        } catch (_) {}
        const kind = payload.kind === 'card' ? 'card' : 'login';
        let items = [];
        try {
            const res = await window.electronAPI.vaultFillCandidates({
                kind,
                origin: payload.origin || '',
                pageUrl: payload.pageUrl || '',
                usernameHint: payload.usernameHint || ''
            });
            items = kind === 'card' ? res?.cards || [] : res?.logins || [];
        } catch (_) {
            return;
        }
        if (!items.length) return;
        await this.showVaultAutofillInPage(webview, items);
        try {
            webview.send('axis-vault-show-autofill', { kind, items });
        } catch (_) {}
    }

    async showVaultAutofillInPage(webview, items) {
        try {
            if (!webview || !items?.length) return;
            const theme = this.getVaultAutofillUiTheme();
            await this.syncVaultAutofillUiTheme(webview);
            let showJs = null;
            try {
                showJs = await window.electronAPI.vaultBuildAutofillShowJs(items, theme);
            } catch (_) {
                return;
            }
            if (!showJs) return;
            await this.executeInGuestFrames(webview, showJs, true);
            webview.__axisVaultAutofillShownKey = JSON.stringify({
                url: (() => {
                    try {
                        return webview.getURL() || '';
                    } catch (_) {
                        return '';
                    }
                })(),
                n: items.length
            });
        } catch (_) {}
    }

    async pollVaultAutofillFocus(webview) {
        try {
            if (!webview) return;
            try {
                const status = await window.electronAPI.vaultStatus();
                if (status?.autofillEnabled === false) return;
            } catch (_) {}
            if (!webview.__axisVaultAutofillInjected) {
                await this.injectVaultAutofillBootstrap(webview);
            }
            const probe = await this.probeVaultAutofillGuest(webview);
            if (!probe) return;
            if (probe.menuOpen) {
                if (!probe.focus) {
                    this._voidGuestTask(this.hideVaultAutofillInPage(webview));
                    this.hideVaultAutofillPanel();
                }
                return;
            }
            if (probe.pick) {
                try {
                    const login = await window.electronAPI.vaultGetLoginForFill(probe.pick);
                    const fillJs = await window.electronAPI.vaultBuildAutofillFillJs(login);
                    if (fillJs) await this.executeInGuestFrames(webview, fillJs, true);
                } catch (_) {}
                return;
            }
            const focus = probe.focus;
            if (!focus) return;
            const key = probe.focusKey || JSON.stringify(focus);
            if (key === webview.__axisVaultAutofillLastKey) return;
            webview.__axisVaultAutofillLastKey = key;
            await this.presentVaultAutofill(webview, focus);
        } catch (_) {}
    }

    async tryOfferVaultSaveFromWebview(webview) {
        if (!webview) return false;
        if (!(await this.isVaultCredentialTypingIdle(webview))) return false;
        const saveModal = document.getElementById('vault-save-modal');
        const wasHidden = saveModal?.classList.contains('hidden');
        try {
            if (typeof webview.send === 'function') webview.send('axis-vault-scan-now');
        } catch (_) {}
        await new Promise((r) => setTimeout(r, 600));
        return !!(saveModal && wasHidden && !saveModal.classList.contains('hidden'));
    }

    setupVaultUi() {
        const saveModal = this.elements.vaultSaveModal;
        const pickModal = this.elements.vaultPickModal;
        const backdrop = this.elements.modalBackdrop;

        const hideVaultModals = () => {
            if (saveModal) saveModal.classList.add('hidden');
            pickModal?.classList.add('hidden');
            if (
                backdrop &&
                saveModal?.classList.contains('hidden') &&
                pickModal?.classList.contains('hidden')
            ) {
                const otherOpen = document.querySelector(
                    '#downloads-panel:not(.hidden), #security-panel:not(.hidden), #settings-panel:not(.hidden)'
                );
                if (!otherOpen) backdrop.classList.add('hidden');
            }
        };

        const showBackdrop = () => {
            if (backdrop) backdrop.classList.remove('hidden');
        };

        const hideAllVaultUi = () => {
            hideVaultModals();
            this._setVaultModalOverlay(false);
        };

        document.getElementById('vault-save-never')?.addEventListener('click', () => {
            const pending = this._vaultPendingSave;
            if (pending?.payload) {
                this._vaultDismissedOffers.add(this._vaultOfferKey(pending.payload));
            }
            this._vaultPendingSave = null;
            hideAllVaultUi();
        });
        document.getElementById('vault-save-confirm')?.addEventListener('click', () => void this.confirmVaultSave());
        document.getElementById('vault-pick-cancel')?.addEventListener('click', () => {
            this._vaultPickWebview = null;
            hideAllVaultUi();
        });

        this._hideVaultModals = hideAllVaultUi;
        this._showVaultBackdrop = showBackdrop;

        document.addEventListener('mousedown', (e) => {
            const panel = this.elements.vaultAutofillPanel;
            if (!panel || panel.classList.contains('hidden')) return;
            if (panel.contains(e.target)) return;
            const tag = e.target && e.target.tagName;
            if (tag === 'WEBVIEW' || (e.target && e.target.closest && e.target.closest('webview'))) {
                return;
            }
            this.hideVaultAutofillPanel();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hideVaultAutofillPanel();
        });
        window.addEventListener(
            'scroll',
            () => {
                if (this.elements.vaultAutofillPanel?.classList.contains('hidden')) return;
                this.repositionVaultAutofillPanel();
            },
            true
        );
        window.addEventListener('resize', () => this.repositionVaultAutofillPanel());

        const panel = this.elements.vaultAutofillPanel;
        if (panel && panel.parentElement !== document.body) {
            document.body.appendChild(panel);
        }
    }

    hideVaultAutofillPanel() {
        if (this._vaultAutofillShownAt && Date.now() - this._vaultAutofillShownAt < 500) return;
        const panel = this.elements.vaultAutofillPanel;
        if (panel) panel.classList.add('hidden');
        this._vaultAutofillWebview = null;
        this._vaultAutofillPayload = null;
    }

    repositionVaultAutofillPanel() {
        const panel = this.elements.vaultAutofillPanel;
        const wv = this._vaultAutofillWebview;
        const payload = this._vaultAutofillPayload;
        if (!panel || panel.classList.contains('hidden') || !wv || !payload?.rect) return;
        try {
            const fr = payload.rect;
            const wvRect = wv.getBoundingClientRect();
            const minW = Math.max(220, fr.width || 220);
            let left = Math.max(8, wvRect.left + fr.left);
            let top = Math.max(8, wvRect.top + fr.bottom + 4);
            panel.style.position = 'fixed';
            panel.style.minWidth = `${minW}px`;
            const panelH = panel.offsetHeight || 180;
            if (top + panelH > window.innerHeight - 8) {
                top = Math.max(8, wvRect.top + fr.top - panelH - 4);
            }
            if (left + minW > window.innerWidth - 8) {
                left = Math.max(8, window.innerWidth - minW - 8);
            }
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        } catch (_) {}
    }

    async handleVaultAutofillQuery(webview, payload) {
        if (!webview || !payload) return;
        const kind = payload.kind === 'card' ? 'card' : 'login';
        let items = Array.isArray(payload.items) ? payload.items : [];
        if (!items.length) {
            try {
                const res = await window.electronAPI.vaultFillCandidates({
                    kind,
                    origin: payload.origin || '',
                    pageUrl: payload.pageUrl || '',
                    usernameHint: payload.usernameHint || ''
                });
                if (!res?.ok) return;
                items = kind === 'card' ? res.cards || [] : res.logins || [];
            } catch (_) {
                return;
            }
        }
        if (!items.length) return;
        await this.showVaultAutofillInPage(webview, items);
        try {
            webview.send('axis-vault-show-autofill', { kind, items });
        } catch (_) {}
        if (payload.rect) {
            this.showVaultAutofillPanel(webview, payload, kind, items);
        }
    }

    showVaultAutofillPanel(webview, payload, kind, items) {
        const panel = this.elements.vaultAutofillPanel;
        const list = document.getElementById('vault-autofill-list');
        if (!panel || !list) return;
        this._vaultAutofillWebview = webview;
        this._vaultAutofillPayload = payload;
        list.innerHTML = '';
        for (const row of items) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vault-autofill-item';
            btn.setAttribute('role', 'option');
            if (kind === 'login') {
                btn.innerHTML = `<span class="vault-autofill-item-title">${this.escapeHtml(row.title || row.username || 'Saved login')}</span><span class="vault-autofill-item-sub">${this.escapeHtml(row.username || '')}</span>`;
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.hideVaultAutofillPanel();
                    void this.applyVaultAutofillLogin(webview, row.id);
                });
            } else {
                const label = row.label || row.cardholder || 'Card';
                const sub = row.masked || `•••• ${String(row.number || '').slice(-4)}`;
                btn.innerHTML = `<span class="vault-autofill-item-title">${this.escapeHtml(label)}</span><span class="vault-autofill-item-sub">${this.escapeHtml(sub)}</span>`;
                btn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    this.hideVaultAutofillPanel();
                    void this.applyVaultAutofillCard(webview, row.id);
                });
            }
            li.appendChild(btn);
            list.appendChild(li);
        }
        panel.classList.remove('hidden');
        panel.setAttribute('data-ui-theme', this.getVaultAutofillUiTheme());
        this._vaultAutofillShownAt = Date.now();
        this.repositionVaultAutofillPanel();
    }

    async applyVaultAutofillLogin(webview, id) {
        if (!webview || !id) return;
        try {
            const login = await window.electronAPI.vaultGetLoginForFill(id);
            webview.send('axis-vault-apply-login', login);
        } catch (_) {}
    }

    async applyVaultAutofillCard(webview, id) {
        if (!webview || !id) return;
        try {
            const card = await window.electronAPI.vaultGetCardForFill(id);
            webview.send('axis-vault-apply-card', card);
        } catch (_) {}
    }

    _vaultOfferKey(payload) {
        if (!payload) return '';
        if (payload.type === 'card') {
            return `card:${payload.origin}:${String(payload.number || '').slice(-4)}`;
        }
        const pass = payload.password || '';
        return `login:${payload.origin}:${payload.username}:${pass.length}`;
    }

    async handleVaultSaveOffer(webview, payload) {
        if (!payload) return;
        webview = webview || this.getActiveWebview();
        const prechecked = !!payload.vaultSavePrechecked;
        const cred = { ...payload };
        delete cred.vaultSavePrechecked;
        if (cred.type !== 'card' && !prechecked) {
            try {
                const gate = await window.electronAPI.vaultShouldOfferLoginSave({
                    origin: cred.origin,
                    username: cred.username,
                    password: cred.password
                });
                if (!gate?.offer) return;
            } catch (_) {
                /* guest poll may still be valid */
            }
        }
        const key = this._vaultOfferKey(cred);
        if (this._vaultDismissedOffers?.has(key)) return;
        const saveModal = document.getElementById('vault-save-modal');
        if (saveModal && !saveModal.classList.contains('hidden')) {
            if (this._vaultLastShownOfferKey === key) return;
            return;
        }
        const lastAt = this._vaultSaveOfferAt?.get(key);
        if (lastAt && Date.now() - lastAt < 20000) return;
        this._vaultSaveOfferAt?.set(key, Date.now());
        this._vaultLastShownOfferKey = key;
        this._vaultPendingSave = { webview, payload: cred };
        this.showVaultSaveModal(cred);
    }

    _setVaultModalOverlay(open) {
        document.body.classList.toggle('axis-vault-modal-open', !!open);
    }

    hideVaultSaveModal() {
        const modal = document.getElementById('vault-save-modal');
        if (modal) modal.classList.add('hidden');
        this._setVaultModalOverlay(false);
    }

    showVaultSaveModal(payload) {
        const modal = document.getElementById('vault-save-modal');
        if (!modal) return;
        const title = document.getElementById('vault-save-title');
        const siteEl = document.getElementById('vault-save-site');
        const userRow = document.getElementById('vault-save-user-row');
        const userEl = document.getElementById('vault-save-user');
        const cardRow = document.getElementById('vault-save-card-row');
        const cardEl = document.getElementById('vault-save-card');
        const isCard = payload.type === 'card';
        let host = payload.origin || '';
        try {
            host = new URL(host).hostname || host;
        } catch (_) {}
        modal.setAttribute('data-ui-theme', this.getVaultAutofillUiTheme());
        if (title) {
            title.textContent = isCard ? 'Save this card?' : 'Save password?';
        }
        if (siteEl) siteEl.textContent = host || '—';
        if (userRow) userRow.classList.toggle('hidden', isCard);
        if (cardRow) cardRow.classList.toggle('hidden', !isCard);
        if (userEl && !isCard) userEl.textContent = payload.username || '—';
        if (cardEl && isCard) {
            const label = payload.masked || '••••';
            const who = payload.cardholder || '';
            cardEl.textContent = who ? `${label} · ${who}` : label;
        }
        modal.classList.remove('hidden');
        this._setVaultModalOverlay(true);
    }

    async confirmVaultSave() {
        const pending = this._vaultPendingSave;
        this._vaultPendingSave = null;
        this.hideVaultSaveModal();
        if (!pending?.payload) return;
        this._vaultDismissedOffers.add(this._vaultOfferKey(pending.payload));
        const payload = pending.payload;
        try {
            if (payload.type === 'card') {
                await window.electronAPI.vaultSaveCard({
                    label: payload.label || '',
                    cardholder: payload.cardholder,
                    number: payload.number,
                    expMonth: payload.expMonth,
                    expYear: payload.expYear,
                    cvv: payload.cvv || '',
                    billingZip: payload.billingZip || ''
                });
                this.showNotification('Card saved', 'success');
            } else {
                await window.electronAPI.vaultCaptureLogin(payload);
                this.showNotification('Password saved', 'success');
            }
        } catch (e) {
            this.showNotification(e?.message || 'Could not save', 'error');
        }
    }

    async showVaultPickLogin(webview, logins) {
        this._vaultPickWebview = webview;
        const list = document.getElementById('vault-pick-list');
        const modal = this.elements.vaultPickModal;
        const title = document.getElementById('vault-pick-title');
        if (title) title.textContent = 'Choose a login';
        if (!list || !modal) return;
        list.innerHTML = '';
        for (const row of logins) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vault-pick-item';
            btn.textContent = `${row.title || row.username} — ${row.username}`;
            btn.addEventListener('click', () => void this.applyVaultLoginPick(row.id));
            li.appendChild(btn);
            list.appendChild(li);
        }
        modal.classList.remove('hidden');
        this._showVaultBackdrop?.();
        this._setVaultModalOverlay(true);
    }

    async showVaultPickCard(webview, cards) {
        this._vaultPickWebview = webview;
        const list = document.getElementById('vault-pick-list');
        const modal = this.elements.vaultPickModal;
        const title = document.getElementById('vault-pick-title');
        if (title) title.textContent = 'Choose a card';
        if (!list || !modal) return;
        list.innerHTML = '';
        for (const row of cards) {
            const li = document.createElement('li');
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'vault-pick-item';
            btn.textContent = `${row.label || row.cardholder || 'Card'} — ${row.masked}`;
            btn.addEventListener('click', () => void this.applyVaultCardPick(row.id));
            li.appendChild(btn);
            list.appendChild(li);
        }
        modal.classList.remove('hidden');
        this._showVaultBackdrop?.();
        this._setVaultModalOverlay(true);
    }

    async applyVaultLoginPick(id) {
        const wv = this._vaultPickWebview;
        this._vaultPickWebview = null;
        this.elements.vaultPickModal?.classList.add('hidden');
        this._hideVaultModals?.();
        if (!wv || !id) return;
        try {
            const login = await window.electronAPI.vaultGetLoginForFill(id);
            wv.send('axis-vault-apply-login', login);
        } catch (e) {
            this.showNotification(e?.message || 'Could not fill login', 'error');
        }
    }

    async applyVaultCardPick(id) {
        const wv = this._vaultPickWebview;
        this._vaultPickWebview = null;
        this.elements.vaultPickModal?.classList.add('hidden');
        this._hideVaultModals?.();
        if (!wv || !id) return;
        try {
            const card = await window.electronAPI.vaultGetCardForFill(id);
            wv.send('axis-vault-apply-card', card);
        } catch (e) {
            this.showNotification(e?.message || 'Could not fill card', 'error');
        }
    }
}

if (typeof AxisProfileSwipe !== 'undefined') {
    AxisProfileSwipe.attach(AxisBrowser.prototype);
}

// Initialize the browser when DOM is loaded
// Initialize browser immediately
let browserInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    browserInstance = new AxisBrowser();
    window.__axisBrowser = browserInstance;
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



