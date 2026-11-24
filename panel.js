import {drawGhost,label,context,age,samples} from './sprites.js';
const desk=document.querySelector('#desk'),rows=desk.querySelector('#rows');
const el=id=>desk.querySelector('#'+id);
const rank={attention:0,working:1,finished:2,stopped:3,available:4,unknown:5};
const current=s=>s.pin||s.review||s.state==='attention'||s.state==='working';
let demo=false,data=null,connected=false,previous='',busy=false,all=false,frozen=null,menu='',held=false;
function reset(){frozen=null;menu='';previous='';render();}
rows.onpointerenter=()=>{if(!frozen)frozen=[...rows.querySelectorAll('.row')].map(b=>b.chat);};
rows.onpointerleave=()=>{if(!menu&&frozen){frozen=null;render();}};
rows.onpointerdown=()=>held=true;
desk.ownerDocument.addEventListener('pointerup',()=>held=false,true);
rows.onpointerup=rows.onpointercancel=()=>held=false;
function actionButton(doc,text,fn){
  const b=doc.createElement('button');b.textContent=text;b.onclick=fn;return b;
}
async function post(route,body){
  const response=await fetch('/v1/'+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  if(!response.ok)throw Error();return response.json();
}
function render() {
  const list=demo?samples.slice(0,4):[...(data?.sessions||[])].sort((a,b)=>(!a.pin)-(!b.pin)||(a.pin||0)-(b.pin||0)||rank[a.state]-rank[b.state]||Number(b.review)-Number(a.review)||b.updatedAt-a.updatedAt);
  const quiet=list.filter(s=>!current(s)).length;
  const shown=frozen?frozen.map(old=>list.find(s=>s.id===old.id)||old):list.filter(s=>demo||all||current(s));
  const signature=JSON.stringify([demo,connected,shown.map(s=>[s.id,list.some(l=>l.id===s.id),s.project,s.title,s.provider,s.hue,s.state,s.reason,s.pin,s.review,s.muted,s.stateSince,s.state==='attention'?age(s):'']),list.length,quiet,all,menu,data?.sources]);
  if(signature===previous||held)return;
  previous=signature;
  const doc=desk.ownerDocument,active=doc.activeElement?.dataset?.id;
  el('live').setAttribute('aria-pressed',String(!demo));el('demo').setAttribute('aria-pressed',String(demo));
  const attention=list.filter(s=>s.state==='attention').length,working=list.filter(s=>s.state==='working').length;
  el('connection').textContent=demo?'Example chats · animation preview':!connected?'PC bridge offline':list.length+' chats · '+working+' working · '+attention+' need you';
  el('sources').textContent=demo?'Preview uses sample sessions.':!connected?'Open Ghost Desk to see live sessions.':
    ['Codex · '+data.sources.codex,'Claude Code · '+data.sources.claudeDesktop,'Antigravity · '+data.sources.antigravity,...(data.sources.browser?['Browser · '+data.sources.browser+' connected']:[])].join('\n');
  rows.replaceChildren();
  for(const s of shown){
    const wrap=doc.createElement('div');wrap.className='chat';wrap.dataset.provider=s.provider;
    const b=doc.createElement('button');b.className='row '+s.state;b.disabled=demo||!connected||!list.some(c=>c.id===s.id);b.chat=s;b.dataset.id=s.id;b.dataset.provider=s.provider;
    b.setAttribute('aria-label',(demo?'Preview ':'Open ')+s.title+', '+context(s)+', '+label(s));
    b.innerHTML='<span class="ghost-tile" aria-hidden="true"><canvas class="ghost" width="16" height="16"></canvas></span><span class="copy"><strong></strong><span class="info"></span></span><span class="status"><span class="state"></span><small></small></span>';
    b.title=s.title+'\n'+context(s)+'\n'+label(s)+' · '+age(s);
    drawGhost(b.querySelector('canvas').getContext('2d'),s);
    b.querySelector('strong').textContent=s.title;b.querySelector('.info').textContent=(s.pin?'★  ':'')+context(s);
    b.querySelector('.state').textContent=label(s);if(s.state==='attention')b.querySelector('small').textContent=age(s);
    b.onclick=async()=>{try{const r=await post('focus',{id:s.id});el('notice').textContent=r.message||'';await refresh();}catch{el('notice').textContent='Could not open this chat.';}};
    wrap.append(b);
    if(!demo&&!b.disabled){
      const more=actionButton(doc,'···',()=>{menu=menu===s.id?'':s.id;render();});
      more.className='chat-more';more.setAttribute('aria-label','Chat options for '+s.title);more.setAttribute('aria-expanded',String(menu===s.id));wrap.append(more);
      if(menu===s.id) {
        const actions=doc.createElement('div');actions.className='actions';
        const choices=[[s.pin?'Unpin chat':'Pin chat','pin',!s.pin],[s.muted?'Unmute alerts':'Mute alerts','mute',!s.muted]];
        if(s.review)choices.unshift(['Mark reviewed','review',false]);
        for(const [name,op,value] of choices)actions.append(actionButton(doc,name,async()=>{
          try{await post('chat',{id:s.id,op,value,since:s.stateSince});}catch{el('notice').textContent='This chat changed. Check its current status.';}
          menu='';frozen=null;await refresh();render();
        }));
        wrap.append(actions);
      }
    }
    rows.append(wrap);if(active===s.id)b.focus({preventScroll:true});
  }
  el('fold').hidden=demo||(!quiet&&!all)||!connected;el('fold').textContent=all?'Show current work':'+'+quiet+' other chat'+(quiet===1?'':'s');
  if(!shown.length){
    const p=doc.createElement('p');p.className='placeholder';p.textContent=!connected?'Waiting for the PC bridge…':list.length?'All quiet.':'No recent chats detected.';rows.append(p);
  }
}
el('fold').onclick=()=>{all=!all;reset();};
async function refresh() {
  if (busy) return;
  busy=true;
  try {
    const r=await fetch('/v1/sessions',{signal:AbortSignal.timeout(5000)});
    if (!r.ok) throw Error();
    data=await r.json();connected=true;
  } catch {data=null;connected=false;}
  finally {busy=false;render();}
}
el('live').onclick=()=>{demo=false;el('notice').textContent='';reset();};
el('demo').onclick=()=>{demo=true;el('notice').textContent='';reset();};
el('dock').onclick=async()=>{
  try {
    const response=await fetch('/v1/dock',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
    if(!response.ok) throw Error();
    window.documentPictureInPicture?.window?.close();
    el('notice').textContent='The Windows edge dock is open.';
  } catch {el('notice').textContent='Could not start the dock. Check that the updated PC bridge is running.';}
};
el('float').onclick=async()=>{
  if (!('documentPictureInPicture' in window)) {el('notice').textContent='Open this page in desktop Chrome or Edge to float the panel.';return;}
  try {
    const w=await documentPictureInPicture.requestWindow({width:350,height:540});
    const sheet=w.document.createElement('link');sheet.rel='stylesheet';sheet.href=new URL('/panel.css',location.href).href;
    w.document.head.append(sheet);w.document.documentElement.className='pip';w.document.title='Ghost Desk';
    w.document.body.append(desk);const back=document.createElement('p');back.textContent='Ghost Desk is floating. Keep this tab open.';document.body.append(back);
    w.addEventListener('pagehide',()=>{back.remove();document.body.append(desk);},{once:true});
  } catch {el('notice').textContent='The browser could not open a floating window.';}
};
refresh();setInterval(refresh,2200);
