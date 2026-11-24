const patterns=['https://chatgpt.com/*','https://claude.ai/*','https://gemini.google.com/*'];
const config={
  'chatgpt.com':['ChatGPT',/^\/(?:$|(?:g\/[^/]+\/)?c\/[\w-]+\/?$|g\/[^/]+\/?$)/],
  'claude.ai':['Claude',/^\/(?:$|new\/?$|chat\/[\w-]+\/?$)/],
  'gemini.google.com':['Gemini',/^\/(?:u\/\d+\/)?(?:app(?:\/[\w-]+)?\/?)?$/]
};
let acks=[],busy=false;
const identities=new Map();
function locationInfo(tab) {
  if (!tab.url) return null;
  const u=new URL(tab.url), info=config[u.hostname];
  if (!info || !info[1].test(u.pathname)) return null;
  const path=u.pathname.replace(/\/$/,'');
  const saved=/(?:\/c\/|\/chat\/|\/app\/)[\w-]+$/.test(path);
  return {provider:info[0],path:u.pathname,identity:u.origin+path+(saved?'':'#'+tab.id)};
}
async function fingerprint(value) {
  if (!identities.has(value)) {
    const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
    identities.set(value,Array.from(hash.slice(0,16),b=>b.toString(16).padStart(2,'0')).join(''));
  }
  return identities.get(value);
}
async function sync() {
  if (busy) return;
  busy=true;
  try {
    let {client}=await chrome.storage.local.get('client');
    if (!client) {client=crypto.randomUUID();await chrome.storage.local.set({client});}
    const tabs=await chrome.tabs.query({url:patterns});
    const rows=new Map(), routes=new Map();
    for (const tab of tabs.sort((a,b)=>(b.lastAccessed||0)-(a.lastAccessed||0))) {
      const info=locationInfo(tab);
      if (!info) continue;
      const key=await fingerprint(info.identity);
      let observation;
      try {observation=await chrome.tabs.sendMessage(tab.id,{type:'sample'});} catch {}
      if (observation?.path!==info.path) observation=null;
      const row={key,provider:info.provider,title:tab.title||info.provider,state:observation?.state||'unknown',
        updatedAt:observation?.updatedAt||tab.lastAccessed||0};
      const priority={attention:0,working:1,finished:2,available:3,unknown:4};
      if (rows.has(key) && priority[rows.get(key).state]<=priority[row.state]) continue;
      rows.set(key,row);routes.set(key,{tab:tab.id,identity:info.identity});
    }
    const res=await fetch('http://127.0.0.1:43821/v1/sync',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({client,sessions:[...rows.values()],acks}),signal:AbortSignal.timeout(4000)});
    if (!res.ok) return;
    const data=await res.json();
    acks=[];
    for (const command of data.pending) {
      let ok=false;
      try {
        const route=routes.get(command.key),tab=await chrome.tabs.get(route.tab);
        if (locationInfo(tab)?.identity===route.identity) {
          await chrome.tabs.update(tab.id,{active:true});await chrome.windows.update(tab.windowId,{focused:true});ok=true;
        }
      } catch {}
      acks.push({token:command.token,ok});
    }
  } catch { /* The bridge is optional and can be stopped at any time. */ }
  finally {busy=false;}
}
chrome.alarms.create('refresh',{periodInMinutes:0.5});
chrome.alarms.onAlarm.addListener(sync);
chrome.tabs.onActivated.addListener(sync);
setInterval(sync,2200);
sync();
