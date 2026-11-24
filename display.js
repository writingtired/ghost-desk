import {drawGhost,label,context,age,samples} from './sprites.js';
const $=id=>document.getElementById(id),canvas=$('screen'),ctx=canvas.getContext('2d');
const tiles={'Claude':'#533b32','Claude Code':'#533b32','Codex':'#2c493e','ChatGPT':'#2c493e','Antigravity':'#33415b','Gemini':'#33415b'};
const motion=matchMedia('(prefers-reduced-motion: reduce)');
let data=[],selected='',page=0,regions=[],offline=false,token=0,stamp='';
function fit(text,x,y,width) {
  let value=text;
  while(value.length && ctx.measureText(value+(value===text?'':'…')).width>width)value=value.slice(0,-1);
  ctx.fillText(value+(value===text?'':'…'),x,y);
}
function render() {
  const w=canvas.width,h=canvas.height,cols=Math.floor((w-12)/52),rows=Math.floor((h-65)/52),per=cols*rows;
  page=Math.min(page,Math.max(0,Math.ceil(data.length/per)-1));
  const sid=data.find(s=>s.id===selected);
  ctx.fillStyle='#10171b';ctx.fillRect(0,0,w,h);ctx.font='bold 13px monospace';ctx.fillStyle='#eaf1ec';
  ctx.fillText(sid?'CHAT DETAIL':'CHAT ACTIVITY',8,19);ctx.font='11px monospace';regions=[];
  function region(title,x,y,width,height,click) {regions.push({title,x,y,width,height,click});}
  if(sid) {
    drawGhost(ctx,sid,12,41,2);
    ctx.font='bold 13px sans-serif';fit(sid.title,54,51,w-63);ctx.font='12px sans-serif';ctx.fillStyle='#bec9cb';fit(context(sid),54,71,w-63);
    ctx.fillStyle='#eaf1ec';ctx.fillText(label(sid),12,107);ctx.fillText(age(sid),12,127);
    ctx.fillText('‹ All chats',12,h-15);region('Back to ghosts',3,h-42,w-6,40,()=>{selected='';render();});
  } else {
    ctx.fillStyle='#a8b7b8';ctx.fillText(String(data.length),w-28,18);
    const list=data.slice(page*per,(page+1)*per),cell=Math.floor((w-12)/cols);
    if(!list.length)ctx.fillText(offline?'PC bridge offline':'No recent chats',10,64);
    list.forEach((s,i)=>{
      const x=6+i%cols*cell,y=29+Math.floor(i/cols)*52;
      ctx.fillStyle=tiles[s.provider]||'#364049';ctx.fillRect(x,y,cell-3,48);
      let shift=motion.matches?0:Math.round(Math.sin(performance.now()/230));
      drawGhost(ctx,s,x+Math.floor((cell-16)/2)+(s.state==='attention'?shift:0),y+7+(s.state==='working'?shift:0));
      ctx.fillStyle='#ecf2ef';ctx.font='10px sans-serif';fit(s.title,x+3,y+39,cell-9);
      region(s.title+' · '+context(s)+' · '+label(s),x,y,cell-3,48,()=>{selected=s.id;render();});
    });
    if(data.length>per) {
      ctx.fillStyle='#dee9e6';ctx.fillText('‹ Prev',8,h-14);ctx.fillText((page+1)+' / '+Math.ceil(data.length/per),w/2-14,h-14);ctx.fillText('Next ›',w-49,h-14);
      if(page>0)region('Previous page',2,h-39,75,37,()=>{page--;render();});
      if((page+1)*per<data.length)region('Next page',w-78,h-39,76,37,()=>{page++;render();});
    }
  }
  const status=sid?sid.title+' · '+context(sid)+' · '+label(sid):w+' × '+h+' pixels · '+(offline?'Bridge offline':data.length+' chats');
  if($('details').textContent!==status)$('details').textContent=status;
  const signature=JSON.stringify(regions.map(r=>[r.title,r.x,r.y,r.width,r.height]));
  if(signature!==stamp) {
    stamp=signature;$('targets').replaceChildren(...regions.map((r,i)=>{
      const b=document.createElement('button');b.setAttribute('aria-label',r.title);b.title=r.title;
      Object.assign(b.style,{left:r.x+'px',top:r.y+'px',width:r.width+'px',height:r.height+'px'});
      b.onclick=()=>regions[i]?.click();return b;
    }));
  }
}
async function load() {
  const request=++token,source=$('source').value;
  if(source==='live'){
    try {const response=await fetch('/v1/sessions',{signal:AbortSignal.timeout(4000)});if(!response.ok)throw Error();
      const snap=await response.json();if(request!==token)return;data=snap.sessions;offline=false;
    }catch{if(request!==token)return;offline=true;data=[];}
  }else{data=samples.slice(0,Number(source));offline=false;}
  render();
}
$('size').onchange=()=>{[canvas.width,canvas.height]=$('size').value.split(' × ').map(Number);page=0;render();};
$('source').onchange=()=>{selected='';page=0;load();};
load();setInterval(()=>{if(!document.hidden)render();},240);setInterval(()=>{if($('source').value==='live')load();},2500);
