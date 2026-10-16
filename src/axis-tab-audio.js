'use strict';

/** Guest script: per-tab volume for media elements. */
const AXIS_TAB_AUDIO_GUEST_SCRIPT = String.raw`(function(){
if(window.__axisTabAudio)return;
var S={volume:1,mono:false,eq:'off',targetIndex:null};
var routes=new WeakMap();
var ctx=null;
function ac(){if(!ctx)ctx=new(window.AudioContext||window.webkitAudioContext)();if(ctx.state==='suspended')try{ctx.resume();}catch(e){}return ctx;}
function filters(a,p){
  var n=[];
  if(p==='voice'){var f=a.createBiquadFilter();f.type='peaking';f.frequency.value=2800;f.gain.value=5;f.Q.value=0.9;n.push(f);}
  else if(p==='bass'){var b=a.createBiquadFilter();b.type='lowshelf';b.frequency.value=180;b.gain.value=7;n.push(b);}
  else if(p==='dark'){var l=a.createBiquadFilter();l.type='lowshelf';l.frequency.value=140;l.gain.value=2;var h=a.createBiquadFilter();h.type='highshelf';h.frequency.value=3800;h.gain.value=-5;n.push(l,h);}
  return n;
}
function needsGraph(){return S.mono||S.eq!=='off'||S.volume>1.001;}
function detach(el){
  var r=routes.get(el);if(!r)return;
  try{if(r.src)r.src.disconnect();}catch(e){}
  routes.delete(el);
}
function wire(el){
  if(!el||(el.tagName!=='VIDEO'&&el.tagName!=='AUDIO'))return;
  detach(el);
  if(!needsGraph()){
    try{el.volume=Math.min(1,Math.max(0,S.volume));}catch(e){}
    routes.set(el,{el:el,plain:true});
    return;
  }
  try{
    var a=ac(),src=a.createMediaElementSource(el),gain=a.createGain();
    gain.gain.value=S.volume;
    var chain=filters(a,S.eq),head=src,tail=gain;
    if(S.mono){
      var split=a.createChannelSplitter(2),merge=a.createChannelMerger(1),gL=a.createGain(),gR=a.createGain();
      gL.gain.value=0.5;gR.gain.value=0.5;
      head.connect(split);
      split.connect(gL,0);split.connect(gR,1);
      gL.connect(merge,0,0);gR.connect(merge,0,0);
      head=merge;
    }
    var node=head;
    chain.forEach(function(f){node.connect(f);node=f;});
    node.connect(tail);tail.connect(a.destination);
    routes.set(el,{el:el,src:src,gain:gain,plain:false});
  }catch(e){
    try{el.volume=Math.min(1,Math.max(0,S.volume));}catch(e2){}
    routes.set(el,{el:el,plain:true});
  }
}
function applyAll(){
  routes.forEach(function(r){if(r.el)wire(r.el);});
  document.querySelectorAll('video,audio').forEach(function(el){if(!routes.has(el))wire(el);});
}
function scan(root){
  (root||document).querySelectorAll('video,audio').forEach(wire);
}
var mo=new MutationObserver(function(ms){
  ms.forEach(function(m){
    m.addedNodes.forEach(function(n){
      if(n.nodeType!==1)return;
      if(n.tagName==='VIDEO'||n.tagName==='AUDIO')wire(n);
      else if(n.querySelectorAll)scan(n);
    });
  });
});
try{mo.observe(document.documentElement,{childList:true,subtree:true});}catch(e){}
scan();
window.__axisTabAudio={
  configure:function(c){
    if(!c||typeof c!=='object')return false;
    if(c.volume!=null)S.volume=Math.max(0,Math.min(2,Number(c.volume)||0));
    if(c.mono!=null)S.mono=!!c.mono;
    if(c.eq!=null)S.eq=String(c.eq||'off');
    applyAll();
    return true;
  },
  setVolume:function(v,idx){
    S.volume=Math.max(0,Math.min(1,Number(v)||0));
    if(idx!=null&&!isNaN(idx))S.targetIndex=Number(idx);
    var list=document.querySelectorAll('video,audio');
    var target=idx!=null&&!isNaN(idx)?list[Number(idx)||0]:null;
    if(target){wire(target);return true;}
    list.forEach(function(el){wire(el);});
    return true;
  },
  setTargetIndex:function(i){S.targetIndex=i==null?null:Number(i);},
  getMediaState:function(){
    var list=document.querySelectorAll('video');
    var idx=S.targetIndex!=null&&!isNaN(S.targetIndex)?S.targetIndex:0;
    var v=list[idx];
    if(!v)return null;
    return{paused:!!v.paused,muted:!!v.muted,volume:v.volume,duration:v.duration,currentTime:v.currentTime,count:list.length};
  },
  toggleElementMute:function(idx){
    var v=document.querySelectorAll('video')[Number(idx)||0];
    if(!v)return false;
    v.muted=!v.muted;
    return v.muted;
  }
};
})();`;

function defaultTabAudioState() {
    return { volume: 1, mono: false, eq: 'off' };
}

function normalizeTabAudioState(tab) {
    if (!tab) return;
    if (!tab.audio || typeof tab.audio !== 'object') tab.audio = defaultTabAudioState();
    const v = Number(tab.audio.volume);
    tab.audio.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    tab.audio.mono = !!tab.audio.mono;
    const eq = String(tab.audio.eq || 'off');
    tab.audio.eq = ['off', 'voice', 'bass', 'dark'].includes(eq) ? eq : 'off';
}

const AxisTabAudio = {
    GUEST_SCRIPT: AXIS_TAB_AUDIO_GUEST_SCRIPT,

    ensureTabState(tab) {
        normalizeTabAudioState(tab);
        return tab.audio;
    },

    async injectGuest(webview) {
        if (!webview) return false;
        try {
            await webview.executeJavaScript(AXIS_TAB_AUDIO_GUEST_SCRIPT, true);
            return true;
        } catch (_) {
            return false;
        }
    },

    async applyVolume(webview, volume, targetIndex = null) {
        if (!webview) return;
        const v = Math.max(0, Math.min(1, Number(volume) || 0));
        const idx =
            targetIndex != null && Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : null;
        const idxArg = idx != null ? String(idx) : 'null';
        const js = `(function(){
            if(window.__axisTabAudio&&window.__axisTabAudio.setVolume){
                return window.__axisTabAudio.setVolume(${v},${idxArg});
            }
            var list=document.querySelectorAll('video,audio');
            var target=${idxArg}!=null?list[${idxArg}]:null;
            if(target){target.volume=${v};return true;}
            list.forEach(function(el){el.volume=${v};});
            return true;
        })()`;
        try {
            await webview.executeJavaScript(js, true);
        } catch (_) {}
    },

    async applyToWebview(webview, audioState, targetIndex = null) {
        if (!webview || !audioState) return;
        const needsGraph =
            !!audioState.mono || (audioState.eq && audioState.eq !== 'off') || Number(audioState.volume) > 1.001;
        if (!needsGraph) {
            await this.applyVolume(webview, audioState.volume, targetIndex);
            return;
        }
        const cfg = {
            volume: audioState.volume,
            mono: audioState.mono,
            eq: audioState.eq
        };
        const idx =
            targetIndex != null && Number.isFinite(Number(targetIndex)) ? Number(targetIndex) : null;
        try {
            await webview.executeJavaScript(
                `(function(){
                    if(!window.__axisTabAudio){
                        ${AXIS_TAB_AUDIO_GUEST_SCRIPT}
                    }
                    window.__axisTabAudio.configure(${JSON.stringify(cfg)});
                    ${idx != null ? `window.__axisTabAudio.setTargetIndex(${idx});` : ''}
                    return true;
                })()`,
                true
            );
        } catch (_) {}
    },

    formatVolumeLabel(volume) {
        const pct = Math.round(Math.max(0, Math.min(1, Number(volume) || 0)) * 100);
        return `${pct}%`;
    }
};

if (typeof window !== 'undefined') {
    window.AxisTabAudio = AxisTabAudio;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AxisTabAudio, AXIS_TAB_AUDIO_GUEST_SCRIPT, defaultTabAudioState };
}
