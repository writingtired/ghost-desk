import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const day = 86400000;
const cleanTitle = (s,fallback) => (typeof s==='string' && s.trim() || fallback).slice(0,180);
function entries(dir) {
  try { return fs.readdirSync(dir,{withFileTypes:true}); }
  catch (e) { if (e.code==='ENOENT') return []; throw e; }
}
function alive(pid) {
  if (!Number.isSafeInteger(pid) || pid<=0) return false;
  try { process.kill(pid,0); return true; } catch { return false; }
}

function desktopRoots(home) {
  const data = path.join(home,'AppData','Local','Claude-Data');
  return [
    ...entries(data).filter(d=>d.isDirectory()).map(d=>path.join(data,d.name,'claude-code-sessions')),
    path.join(home,'AppData','Roaming','Claude','claude-code-sessions'),
    path.join(home,'AppData','Local','Packages','Claude_pzs8sxrjxfjjc','LocalCache','Roaming','Claude','claude-code-sessions')
  ];
}

// Retain just the session fields the panel needs. Some desktop metadata files
// also contain tool definitions and large summaries.
function readClaudeFiles(roots,cache) {
  const result=new Map(), seen=new Set();
  function visit(dir,depth) {
    for (const item of entries(dir)) {
      const file=path.join(dir,item.name);
      if (item.isDirectory() && depth<2) { visit(file,depth+1); continue; }
      if (!item.isFile() || !/^local_[\da-f-]{36}\.json$/i.test(item.name)) continue;
      try {
        seen.add(file);
        const stat=fs.statSync(file);
        let row=cache.get(file);
        if (!row || row.mtime!==stat.mtimeMs || row.size!==stat.size) {
          const s=JSON.parse(fs.readFileSync(file,'utf8'));
          const id=s.sessionId;
          if (item.name!==id+'.json' || !uuid.test(id.slice(6))) continue;
          row={id,mtime:stat.mtimeMs,size:stat.size,title:s.title,archived:s.isArchived===true,
            active:Number(s.lastActivityAt)||Number(s.createdAt)||0,turns:Number(s.completedTurns)||0,
            interrupted:s.interruptedAwaitingPerson===true,wrapped:!!s.turnWrapUp?.description};
          cache.set(file,row);
        }
        result.set(row.id,row);
      } catch { /* Desktop may be replacing a file. Retry next poll. */ }
    }
  }
  for (const root of roots) visit(root,0);
  for (const file of cache.keys()) if (!seen.has(file)) cache.delete(file);
  return result;
}

function claudeSnapshot(home,cache,isAlive,now) {
  const roots=desktopRoots(home), records=readClaudeFiles(roots,cache);
  const live=new Map(),registry=path.join(home,'.claude','sessions');
  for (const item of entries(registry)) {
    if (!/^\d+\.json$/.test(item.name)) continue;
    try {
      const s=JSON.parse(fs.readFileSync(path.join(registry,item.name),'utf8'));
      if (s.entrypoint!=='claude-desktop' || !/^local_/.test(s.hostSessionId) ||
          !uuid.test(s.hostSessionId.slice(6)) || s.pid!==Number.parseInt(item.name) || !isAlive(s.pid)) continue;
      const id=s.hostSessionId;
      if (!live.has(id) || Number(s.updatedAt)>Number(live.get(id).updatedAt)) live.set(id,s);
      if (!records.has(id)) records.set(id,{id,title:s.name,active:s.startedAt||0});
    } catch { /* Worker records disappear as workers exit. */ }
  }
  const sessions=[];
  for (const r of records.values()) {
    const worker=live.get(r.id);
    if (r.archived || (!worker && now-r.active>day)) continue;
    const states={busy:'working',shell:'working',waiting:'attention',idle:r.turns?'finished':'available'};
    let state=worker ? states[worker.status]||'unknown' : 'unknown';
    if (!worker && r.interrupted) state='stopped';
    else if (!worker && r.wrapped) state='finished';
    sessions.push({id:'claude-desktop/'+r.id,provider:'Claude Code',title:cleanTitle(r.title||worker?.name,'Claude '+r.id.slice(-6)),
      state,updatedAt:Math.max(r.active||0,Number(worker?.statusUpdatedAt)||0)});
  }
  return {sessions,health:roots.some(r=>fs.existsSync(r))||live.size?'Local sessions':'Waiting for a local Code session'};
}

function waitingForUser(transcript) {
  // Only explicit user-input states qualify. A generic waiting step can be a tool dependency.
  let fd;
  try {
    fd=fs.openSync(transcript,'r');
    const size=fs.fstatSync(fd).size, length=Math.min(size,65536), buf=Buffer.alloc(length);
    fs.readSync(fd,buf,0,length,size-length);
    const lines=buf.toString('utf8').trimEnd().split('\n');
    const step=JSON.parse(lines.at(-1));
    return ['WAITING_FOR_USER_INPUT','WAITING_FOR_APPROVAL','AWAITING_USER_INPUT'].includes(step.status) ||
      (step.status==='WAITING' && ['USER_INPUT','ASK_USER','REQUEST_USER_INPUT','REQUEST_APPROVAL'].includes(step.type));
  } catch { return false; } finally {if(fd!==undefined) fs.closeSync(fd);}
}

function antigravitySnapshot(home,now) {
  const dir=path.join(home,'.gemini','antigravity'), file=path.join(dir,'conversation_summaries.db');
  if (!fs.existsSync(file)) return {sessions:[],health:'Waiting for local conversations'};
  let database;
  try {
    let DatabaseSync;
    try { ({DatabaseSync}=require('node:sqlite')); } catch {return {sessions:[],health:'Requires Node.js 22.13 or newer'};}
    database=new DatabaseSync(file,{readOnly:true});
    const records=database.prepare(`SELECT conversation_id AS id,title,status,killed,not_fully_idle AS background,
      (SELECT count(*) FROM conversation_summaries other WHERE other.title=s.title COLLATE NOCASE
        OR substr(other.title,1,length(s.title)+1)=(s.title||' ') COLLATE NOCASE)=1 AS uniqueTitle,
      CAST((julianday(last_modified_time)-2440587.5)*86400000 AS INTEGER) AS updatedAt
      FROM conversation_summaries s WHERE coalesce(parent_conversation_id,'')=''
      AND julianday(last_modified_time)>=julianday(?,'unixepoch') ORDER BY last_modified_time DESC LIMIT 64`).all((now-day)/1000);
    const sessions=[];
    for(const r of records) {
      if (!uuid.test(r.id)) continue;
      let state='unknown';
      if (r.killed) state='stopped';
      else if (['CASCADE_RUN_STATUS_WAITING_FOR_USER_INPUT','CASCADE_RUN_STATUS_WAITING_FOR_APPROVAL'].includes(r.status)) state='attention';
      else if (r.status==='CASCADE_RUN_STATUS_RUNNING' || r.background) {
        const log=path.join(dir,'brain',r.id,'.system_generated','logs','transcript.jsonl');
        state=waitingForUser(log)?'attention':'working';
      } else if (r.status==='CASCADE_RUN_STATUS_IDLE') state='finished';
      sessions.push({id:'antigravity/'+r.id,provider:'Antigravity',title:cleanTitle(r.title,'Conversation '+r.id.slice(-6)),
        uniqueTitle:!!r.uniqueTitle && !!r.title && r.title.length<=180,state,updatedAt:r.updatedAt});
    }
    return {sessions,health:'Local conversations'};
  } catch { return {sessions:[],health:'Session index unavailable'}; }
  finally { database?.close(); }
}

export function createDesktopReader({home=os.homedir(),isAlive=alive,clock=Date.now}={}) {
  const cache=new Map();
  let snapshot, checked=0;
  return function read() {
    const now=clock();
    if (snapshot && now-checked<1500) return snapshot;
    let claude;
    try { claude=claudeSnapshot(home,cache,isAlive,now); }
    catch {claude={sessions:[],health:'Session directory unavailable'};}
    const ag=antigravitySnapshot(home,now);
    checked=now;
    snapshot={sessions:[...claude.sessions,...ag.sessions],sources:{claudeDesktop:claude.health,antigravity:ag.health}};
    return snapshot;
  };
}
