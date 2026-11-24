const desk=document.querySelector('#desk'),rows=desk.querySelector('#rows');
const el=id=>desk.querySelector('#'+id);
const labels={available:'Available',working:'Working',attention:'Needs you',finished:'Turn ended',unknown:'Status unknown',stopped:'Stopped'};
const icons={available:'○',working:'···',attention:'!',finished:'✓',unknown:'?',stopped:'■'};
const rank={attention:0,working:1,finished:2,stopped:3,available:4,unknown:5};
const examples=[
  {provider:'Claude Code',title:'Review the release notes',state:'attention',hue:22},
  {provider:'Codex',title:'Build the touchscreen menu',state:'working',hue:190},
  {provider:'Antigravity',title:'Compare display layouts',state:'finished',hue:282},
  {provider:'Claude Code',title:'Plan the next session',state:'available',hue:105}
];
let demo=false, data=null, connected=false, previous='',busy=false;
function render() {
  const list=demo?examples:[...(data?.sessions||[])].sort((a,b)=>rank[a.state]-rank[b.state]||b.updatedAt-a.updatedAt);
  const signature=JSON.stringify([demo,connected,list,data?.sources]);
  if (signature===previous) return;
  previous=signature;
  const doc=desk.ownerDocument,active=doc.activeElement?.dataset?.id;
  el('live').setAttribute('aria-pressed',String(!demo));el('demo').setAttribute('aria-pressed',String(demo));
  const attention=list.filter(s=>s.state==='attention').length;
  const working=list.filter(s=>s.state==='working').length;
  el('connection').textContent=demo?'Example chats · animation preview':!connected?'PC bridge offline':list.length+' chats · '+working+' working · '+attention+' need you';
  el('sources').textContent=demo?'Preview uses sample sessions.':!connected?'Start the Ghost Desk bridge to see live sessions.':
    ['Codex · '+data.sources.codex,'Claude Code · '+(data.sources.claudeDesktop||'Restart bridge'),
      'Antigravity · '+(data.sources.antigravity||'Restart bridge'),
      ...(data.sources.browser?['Browser · '+data.sources.browser+' connected']:[])].join('\n');
  rows.replaceChildren();
  for (const s of list) {
    const b=doc.createElement('button');b.className='row '+s.state;b.disabled=demo||!connected;b.dataset.id=s.id||'';
    b.title=s.title+' · '+labels[s.state];b.setAttribute('aria-label',(demo?'Preview ':'Open ')+s.provider+' chat, '+s.title+', '+labels[s.state]);
    b.dataset.provider=s.provider;
    b.innerHTML='<span class="ghost-tile" aria-hidden="true"><span class="ghost"></span></span><span class="copy"><strong></strong><span class="info"><span></span><span aria-hidden="true">/</span><span class="state"></span></span></span><span class="icon" aria-hidden="true"></span>';
    b.style.setProperty('--hue',s.hue);
    b.querySelector('strong').textContent=s.title;b.querySelector('.info span').textContent=s.provider;
    b.querySelector('.state').textContent=labels[s.state];b.querySelector('.icon').textContent=icons[s.state];
    b.onclick=async()=>{
      el('notice').textContent='Opening '+s.provider+'…';
      try {
        const r=await fetch('/v1/focus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:s.id})});
        const result=await r.json();
        el('notice').textContent=r.ok?(result.message||''):'Could not open that chat. Check that its client is still connected.';
      } catch {el('notice').textContent='PC bridge unavailable.';}
    };
    rows.append(b);
    if (active && active===s.id) b.focus({preventScroll:true});
  }
  if (!list.length) {
    const p=doc.createElement('p');p.className='placeholder';
    p.textContent=connected?'No recent chats detected. Open a chat in a connected client.':'Waiting for the PC bridge…';rows.append(p);
  }
}
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
el('live').onclick=()=>{demo=false;el('notice').textContent='';render();};
el('demo').onclick=()=>{demo=true;el('notice').textContent='';render();};
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
