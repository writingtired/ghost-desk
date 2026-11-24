import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const root = path.join(home, 'sessions');
const day = 86400000;
const limit = 1024 * 1024;
const cache = new Map();
let indexStamp = -1, names = new Map(), scanAt = 0, recent = [];
const uuidAtEnd = /([a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})\.jsonl$/i;
const boundaries=new Map([['task_started','working'],['task_complete','finished'],['turn_aborted','stopped']]);

// A long tool call can push the current turn's start beyond the ordinary
// 1 MiB tail. Recover its most recent boundary once when attaching mid-turn.
function earlierState(file,end) {
  const fd=fs.openSync(file,'r');
  const floor=Math.max(0,end-16*limit);
  let suffix='';
  try {
    while(end>floor) {
      const start=Math.max(floor,end-limit),buf=Buffer.alloc(end-start);
      const bytes=fs.readSync(fd,buf,0,buf.length,start);
      const lines=(buf.toString('utf8',0,bytes)+suffix).split('\n');
      suffix=start>0?lines.shift().slice(0,limit):'';
      for(let i=lines.length-1;i>=0;i--) {
        if (!/task_started|task_complete|turn_aborted/.test(lines[i])) continue;
        try {
          const r=JSON.parse(lines[i]);
          if (r.type==='event_msg' && boundaries.has(r.payload?.type)) {
            return {state:boundaries.get(r.payload.type),seen:Date.parse(r.timestamp)||0};
          }
        } catch { /* The scan can start or end inside a record. */ }
      }
      end=start;
    }
    return null;
  } finally {fs.closeSync(fd);}
}

function discover(folder, result) {
  for (const entry of fs.readdirSync(folder, {withFileTypes:true})) {
    const full = path.join(folder, entry.name);
    if (entry.isDirectory()) discover(full, result);
    const match = entry.isFile() && entry.name.match(uuidAtEnd);
    if (match) {
      const stamp = fs.statSync(full).mtimeMs;
      if (Date.now() - stamp < day) result.push({id:match[1], full, stamp});
    }
  }
}

function readNames() {
  try {
    const file = path.join(home, 'session_index.jsonl');
    const stamp = fs.statSync(file).mtimeMs;
    if (stamp === indexStamp) return;
    const next = new Map();
    for (const line of fs.readFileSync(file,'utf8').split('\n')) {
      try { const r = JSON.parse(line); if (r.thread_name) next.set(r.id, r.thread_name); } catch {}
    }
    names = next;
    indexStamp = stamp;
  } catch { /* A fresh installation may not have a title index yet. */ }
}

function inspect({id,full}) {
  const size = fs.statSync(full).size;
  let previous = cache.get(id);
  if (!previous || previous.offset > size) previous = {offset:0, state:'unknown', seen:0};
  if (size !== previous.offset) {
    const offset = Math.max(previous.offset,size-limit);
    const bytes = Buffer.alloc(size-offset);
    const fd = fs.openSync(full,'r');
    let count;
    try { count = fs.readSync(fd, bytes, 0, bytes.length, offset); } finally { fs.closeSync(fd); }
    const end = bytes.subarray(0,count).lastIndexOf(10);
    if (end >= 0) {
      const lines = bytes.subarray(0,end).toString('utf8').split('\n');
      if (offset > previous.offset) { lines.shift(); previous.state = 'unknown'; }
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          if (r.type !== 'event_msg') continue;
          const time = Date.parse(r.timestamp);
          if (!Number.isFinite(time)) continue;
          previous.state=boundaries.get(r.payload.type)||previous.state;
          previous.seen = time;
        } catch { /* Ignore partial or unrecognized records. */ }
      }
      if (previous.state==='unknown' && offset>previous.offset) {
        // Include the first partial line in the backward search.
        const boundary=earlierState(full,offset+bytes.indexOf(10)+1);
        if (boundary) {
          previous.state=boundary.state;
          previous.seen=Math.max(previous.seen,boundary.seen);
        }
      }
      previous.offset = offset+end+1;
    }
    cache.set(id,previous);
  }
  const state = previous.state === 'working' && Date.now()-previous.seen > 900000 ? 'unknown' : previous.state;
  return {id:'codex/'+id,provider:'Codex',title:(names.get(id)||'Chat '+id.slice(-6)).slice(0,100),
    state,updatedAt:previous.seen || fs.statSync(full).mtimeMs};
}

export function codexSnapshot() {
  if (!fs.existsSync(root)) return {sessions:[],health:'No local sessions found'};
  try {
    if (Date.now()-scanAt > 12000) {
      const found = [];
      discover(root,found);
      recent = found.sort((a,b)=>b.stamp-a.stamp).slice(0,48);
      const ids = new Set(recent.map(x=>x.id));
      for (const id of cache.keys()) if (!ids.has(id)) cache.delete(id);
      readNames();
      scanAt = Date.now();
    }
    const sessions = [];
    for (const item of recent) {
      try { sessions.push(inspect(item)); } catch { /* File may have been archived during a scan. */ }
    }
    return {sessions,health:'Local sessions · last 24 hours'};
  } catch { return {sessions:[],health:'Local session folder unavailable'}; }
}
