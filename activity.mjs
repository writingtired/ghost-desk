import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function projectName(value) {
  if (typeof value!=='string') return '';
  let name=value.trim();
  if (/^file:\/\//i.test(name)) {
    try {name=decodeURIComponent(new URL(name).pathname);} catch {return '';}
  }
  return name.split(/[\\/]+/).filter(Boolean).at(-1)?.slice(0,80)||'';
}

// Store identity and activity markers only. Titles, paths and chat content stay out of the file.
export function createActivity(file,clock=Date.now) {
  let records=new Map(), visible=new Set(),dirty=false,retryAt=0;
  try {records=new Map(JSON.parse(fs.readFileSync(file,'utf8')).records);} catch(e) {
    if(e.code!=='ENOENT') console.warn('Could not read Ghost Desk activity history.');
  }
  const save=()=>{
    fs.mkdirSync(path.dirname(file),{recursive:true});
    fs.writeFileSync(file+'.tmp',JSON.stringify({records:[...records]}));
    fs.renameSync(file+'.tmp',file);
  };
  function hueFor(id,used) {
    let hue=createHash('sha256').update(id).digest().readUInt16BE(0)%360,best=hue,distance=-1;
    for(let i=0;i<360;i++,hue=(hue+137)%360) {
      const gap=used.reduce((n,h)=>Math.min(n,Math.abs(h-hue),360-Math.abs(h-hue)),180);
      if(gap>distance){best=hue;distance=gap;}
      if(gap>=24)break;
    }
    return best;
  }
  function update(sessions) {
    const now=clock(), used=sessions.flatMap(s=>records.has(s.id)?[records.get(s.id).hue]:[]);
    let changed=false;
    const result=sessions.map(s=>{
      let r=records.get(s.id);
      if(!r) {
        r={hue:hueFor(s.id,used),pin:0,muted:false,review:false};
        records.set(s.id,r);used.push(r.hue);changed=true;
      }
      const reason=s.state==='attention'?s.reason||'input':'';
      if(r.state!==s.state || r.reason!==reason || (s.waitKey && s.waitKey!==r.waitKey)) {
        r.review=s.state==='finished' && visible.has(s.id) && ['working','attention'].includes(r.state);
        const evidence=Number(s.stateAt);
        r.since=evidence>0 && evidence<=now?evidence:now;
        r.state=s.state;r.reason=reason;r.waitKey=s.waitKey||'';r.notified=false;changed=true;
      }
      return {...s,reason,hue:r.hue,stateSince:r.since,review:r.review,pin:r.pin,muted:r.muted,notified:r.notified};
    });
    visible=new Set(sessions.map(s=>s.id));
    dirty=dirty||changed;
    if(dirty && now>=retryAt) {
      try {save();dirty=false;} catch {retryAt=now+15000;console.warn('Activity history could not be saved. Retrying.');}
    }
    return result;
  }
  function action(id,op,value,since) {
    const r=records.get(id);
    if(!visible.has(id)||!r)return false;
    const old={...r};
    if(op==='review' && r.review && r.since===since)r.review=false;
    else if(op==='pin' && typeof value==='boolean') {
      if(!value)r.pin=0;
      else if(!r.pin) {
        const occupied=new Set([...records.values()].map(x=>x.pin));
        let slot=1;while(occupied.has(slot))slot++;
        r.pin=slot;
      }
    }
    else if(op==='mute' && typeof value==='boolean')r.muted=value;
    else if(op==='notify' && r.state==='attention' && r.since===since && !r.muted && !r.notified)r.notified=true;
    else return false;
    try {save();} catch(e){records.set(id,old);throw e;}
    return true;
  }
  return {update,action};
}
