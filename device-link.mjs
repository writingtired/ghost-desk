import fs from 'node:fs';
import path from 'node:path';
import tls from 'node:tls';
import net from 'node:net';
import {createBoardUpdater} from './board-update.mjs';

const ranks=['attention','working','finished','stopped','available','unknown'];
const labels={working:'Working',attention:'Needs you',finished:'Turn ended',available:'Available',stopped:'Stopped',unknown:'Unknown'};
const current=s=>s.pin>0||s.review||s.state==='working'||s.state==='attention';
// The display uses the built-in Latin font. Keep the full session ID for routing.
const ascii=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^ -~]/gu,'?');
export function boardPage(sessions,all,page) {
  const list=sessions.filter(s=>all||current(s)).sort((a,b)=>
    Number(!a.pin)-Number(!b.pin)||(a.pin||0)-(b.pin||0)||ranks.indexOf(a.state)-ranks.indexOf(b.state)||
    Number(!!b.review)-Number(!!a.review)||b.updatedAt-a.updatedAt||a.id.localeCompare(b.id));
  const pages=Math.max(1,Math.ceil(list.length/4));
  page=Math.min(Math.max(0,page),pages-1);
  return {v:1,now:Date.now(),page,pages,all,total:sessions.length,quiet:sessions.filter(s=>!current(s)).length,
    attention:sessions.filter(s=>s.state==='attention').length,working:sessions.filter(s=>s.state==='working').length,
    reviews:sessions.filter(s=>s.review).length,items:list.slice(page*4,page*4+4).map(s=>({
    id:s.id,title:ascii(s.title).slice(0,48),context:ascii(s.project||('Chat '+s.id.slice(-6))).slice(0,32),provider:s.provider,
    reviewSince:s.review&&!s.muted?s.stateSince:undefined,
    hue:s.hue,pin:!!s.pin,state:s.review?'review':s.state,label:s.review?'Ready to review':s.reason==='approval'?'Approval requested':s.reason==='question'?'Question waiting':labels[s.state]||'Unknown'
  }))};
}

// Windows initiates the connection. Only the paired board and PC possess this TLS key.
export function startDeviceLink({dir,sessions,focus,status=()=>{},updater=createBoardUpdater(),port=43822,interval=2800}) {
  const file=path.join(dir,'board-v1.json');
  let socket=null,lastConfig='',attempt=0,closed=false;
  function connect() {
    if(closed)return;
    let config,raw='';
    try {raw=fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'');config=JSON.parse(raw);}catch{}
    if(raw!==lastConfig){socket?.destroy();socket=null;updater.reset();status(false);attempt=0;lastConfig=raw;}
    if(socket||!config||!/^ghostdesk-[a-f0-9]{12}$/.test(config.name)||net.isIP(config.ip)!==4||!/^[0-9a-f]{64}$/.test(config.key))return;
    const host=[config.ip,config.name+'.local'][attempt++%2];
    const client=tls.connect({host,port,family:4,minVersion:'TLSv1.2',maxVersion:'TLSv1.2',ciphers:'PSK-AES128-GCM-SHA256',
      // This suite authenticates both peers with the USB-provisioned random key.
      rejectUnauthorized:false,pskCallback:()=>({identity:'ghostdesk',psk:Buffer.from(config.key,'hex')})});
    socket=client;
    let buffer='',busy=false,visible=new Set();
    const deadline=setTimeout(()=>client.destroy(),4200);
    client.once('secureConnect',()=>{clearTimeout(deadline);client.setNoDelay(true);client.setTimeout(25000);});
    client.on('timeout',()=>client.destroy());
    client.on('error',()=>{});
    client.on('close',()=>{clearTimeout(deadline);if(socket===client){socket=null;updater.disconnect();status(false);}});
    client.setEncoding('utf8');
    client.on('data',async chunk=>{
      buffer+=chunk;
      if(buffer.length>512||busy)return client.destroy();
      if(!buffer.endsWith('\n'))return;
      busy=true;
      try{
        const req=JSON.parse(buffer);buffer='';
        if(socket!==client)return client.destroy();
        if(req.ota){
          const chunk=updater.transfer(req);
          if(chunk)client.write(chunk);
          return;
        }
        if(req.v!==1||!Number.isSafeInteger(req.page)||typeof req.all!=='boolean')return client.destroy();
        let msg='';
        if(req.open) {
          const result=visible.has(req.open)&&await focus(req.open);
          msg=!result?'Chat unavailable':result.target==='picker'?'Select chat in PC picker':result.target==='application'?'Choose chat on PC':'Opened on PC';
        }
        if(client.destroyed||socket!==client)return;
        const install=updater.poll(req);
        if(install){client.write(JSON.stringify(install)+'\n');return;}
        const view=boardPage(sessions(),req.all,req.page);
        visible=new Set(view.items.map(s=>s.id));
        if(!client.destroyed){client.write(JSON.stringify({...view,msg})+'\n');status(true);}
      }catch{client.destroy();}finally{busy=false;}
    });
  }
  const timer=setInterval(connect,interval);timer.unref();connect();
  return ()=>{closed=true;clearInterval(timer);socket?.destroy();};
}
