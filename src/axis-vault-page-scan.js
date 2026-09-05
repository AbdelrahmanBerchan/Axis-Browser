'use strict';

/** Minimal scan injected into guest pages - must stay valid inside executeJavaScript(). */
const AXIS_VAULT_QUICK_SCAN_JS = `(()=>{try{
const vis=[...document.querySelectorAll("input")].filter(i=>!i.disabled&&!i.readOnly&&i.type!=="hidden"&&i.type!=="submit"&&i.type!=="button");
let login=null;let u="";let p="";
const pw=vis.find(i=>(i.type||"").toLowerCase()==="password");
if(pw&&pw.value){p=String(pw.value);const em=vis.find(i=>(i.type||"").toLowerCase()==="email");if(em&&em.value)u=String(em.value).trim();if(!u){const ix=vis.indexOf(pw);for(let j=ix-1;j>=0;j--){const t=(vis[j].type||"text").toLowerCase();if((t==="text"||t==="email"||t==="tel")&&vis[j].value){u=String(vis[j].value).trim();break;}}}}
const stash=window.__axisVaultLoginStash;if(stash&&stash.origin===(location.origin||"")&&Date.now()-(stash.at||0)<600000){if(!u&&stash.username)u=String(stash.username).trim();}
if(u&&p){login={type:"login",origin:location.origin||"",username:u,password:p,title:document.title||""};}
let card=null;
const numEl=vis.find(i=>{const ac=(i.autocomplete||"").toLowerCase();const nm=(i.name||"").toLowerCase();const id=(i.id||"").toLowerCase();return ac.includes("cc-number")||nm.includes("cardnumber")||id.includes("cardnumber")||((i.type||"").toLowerCase()==="tel"&&String(i.value||"").replace(/\\D/g,"").length>=13);});
if(numEl){const number=String(numEl.value||"").replace(/\\D/g,"");const nameEl=vis.find(i=>(i.autocomplete||"").toLowerCase().includes("cc-name"));const holder=nameEl?String(nameEl.value||"").trim():"";
let mo="",yr="";
const expEl=vis.find(i=>{const ac=(i.autocomplete||"").toLowerCase();return ac==="cc-exp"||(ac.includes("cc-exp")&&!ac.includes("month")&&!ac.includes("year"));});
if(expEl){const exp=String(expEl.value||"");const m=exp.match(/(\\d{1,2})\\D*(\\d{2,4})/);if(m){mo=m[1].padStart(2,"0");yr=m[2];if(yr.length===2)yr="20"+yr;}}
if(!mo||!yr){const monthEl=vis.find(i=>(i.autocomplete||"").toLowerCase()==="cc-exp-month"||/(exp.*month|month.*exp)/i.test((i.name||"")+" "+(i.id||"")));const yearEl=vis.find(i=>(i.autocomplete||"").toLowerCase()==="cc-exp-year"||/(exp.*year|year.*exp)/i.test((i.name||"")+" "+(i.id||"")));if(monthEl)mo=String(monthEl.value||"").replace(/\\D/g,"").padStart(2,"0").slice(-2);if(yearEl){yr=String(yearEl.value||"").replace(/\\D/g,"");if(yr.length===2)yr="20"+yr;}}
if(number.length>=13&&holder&&mo&&yr&&mo!=="00"){card={type:"card",label:"",cardholder:holder,number,expMonth:mo,expYear:yr,cvv:"",billingZip:"",masked:"•••• "+number.slice(-4)};}}
let address=null;
const line1El=vis.find(i=>{const ac=(i.autocomplete||"").toLowerCase();const nm=(i.name||"").toLowerCase();return ac==="street-address"||ac==="address-line1"||ac.includes("street-address")||nm.includes("street")||nm.includes("address1");});
const nameEl=vis.find(i=>{const ac=(i.autocomplete||"").toLowerCase();return ac==="name"||ac==="name shipping"||ac==="shipping name";})||vis.find(i=>(i.autocomplete||"").toLowerCase()==="given-name");
const cityEl=vis.find(i=>{const ac=(i.autocomplete||"").toLowerCase();const nm=(i.name||"").toLowerCase();return ac==="address-level2"||nm==="city"||nm.includes("city");});
const zipEl=vis.find(i=>{const ac=(i.autocomplete||"").toLowerCase();const nm=(i.name||"").toLowerCase();return ac==="postal-code"||ac.includes("postal")||nm.includes("zip")||nm.includes("postal");});
if(line1El&&nameEl&&(cityEl||zipEl)){const fullName=String(nameEl.value||"").trim();const addressLine1=String(line1El.value||"").trim();const city=cityEl?String(cityEl.value||"").trim():"";const postalCode=zipEl?String(zipEl.value||"").trim():"";if(fullName&&addressLine1&&(city||postalCode)){address={type:"address",label:"",fullName,organization:"",addressLine1,addressLine2:"",city,state:"",postalCode,country:"",phone:"",email:"",summary:addressLine1+(city?", "+city:postalCode?", "+postalCode:"")};}}
return{login,card,address};
}catch(e){return{login:null,card:null,address:null}}})()`;

module.exports = {
  AXIS_VAULT_PAGE_SCAN_JS: AXIS_VAULT_QUICK_SCAN_JS,
  AXIS_VAULT_QUICK_SCAN_JS
};
