import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {projectName} from './activity.mjs';

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

function initialProject(file) {
  const fd=fs.openSync(file,'r');
  try {
    const buffer=Buffer.alloc(65536),count=fs.readSync(fd,buffer,0,buffer.length,0);
    const first=buffer.toString('utf8',0,count).split('\n',1)[0];
    // Long session headers may include instructions after the working directory.
    const cwd=first.match(/"cwd"\s*:\s*("(?:\\.|[^"\\])*")/);
    return cwd?projectName(JSON.parse(cwd[1])):'';
  } catch {return '';} finally {fs.closeSync(fd);}
}

function applyRecord(previous,r,time) {
  const p=r.payload||{};
  const hadWait=previous.waits.size>0;
  if(r.type==='turn_context' && p.cwd)previous.project=projectName(p.cwd);
  if(r.type==='event_msg' && boundaries.has(p.type)) {
    previous.state=boundaries.get(p.type);previous.stateAt=time;previous.waits.clear();
  } else if(r.type==='response_item') {
    if(p.type==='function_call' && p.call_id && /^(?:functions\.)?request_user_input$/.test(p.name)) {
      previous.waits.set(p.call_id,{reason:'question',time});
    } else if(['function_call_output','custom_tool_call_output'].includes(p.type))previous.waits.delete(p.call_id);
  } else if(r.type==='event_msg' && p.call_id) {
    if(['exec_approval_request','apply_patch_approval_request'].includes(p.type))previous.waits.set(p.call_id,{reason:'approval',time});
    else if(['exec_command_begin','exec_command_end','patch_apply_begin','patch_apply_end','approval_response'].includes(p.type))previous.waits.delete(p.call_id);
  }
  if(hadWait && !previous.waits.size && previous.state==='working')previous.stateAt=time;
  if(r.type==='event_msg'||r.type==='response_item')previous.seen=Math.max(previous.seen,time);
}

function inspect({id,full}) {
  const size = fs.statSync(full).size;
  let previous = cache.get(id);
  if (!previous || previous.offset > size) previous = {offset:0,state:'unknown',seen:0,stateAt:0,waits:new Map(),project:initialProject(full)};
  if (size !== previous.offset) {
    const offset = Math.max(previous.offset,size-limit);
    const bytes = Buffer.alloc(size-offset);
    const fd = fs.openSync(full,'r');
    let count;
    try { count = fs.readSync(fd, bytes, 0, bytes.length, offset); } finally { fs.closeSync(fd); }
    const end = bytes.subarray(0,count).lastIndexOf(10);
    if (end >= 0) {
      const lines = bytes.subarray(0,end).toString('utf8').split('\n');
      if (offset > previous.offset) { lines.shift(); previous.state = 'unknown';previous.waits.clear(); }
      for (const line of lines) {
        try {
          const r = JSON.parse(line);
          const time = Date.parse(r.timestamp);
          if (!Number.isFinite(time)) continue;
          applyRecord(previous,r,time);
        } catch { /* Ignore partial or unrecognized records. */ }
      }
      if (previous.state==='unknown' && offset>previous.offset) {
        // Include the first partial line in the backward search.
        const boundary=earlierState(full,offset+bytes.indexOf(10)+1);
        if (boundary) {
          previous.state=boundary.state;previous.stateAt=boundary.seen;
          previous.seen=Math.max(previous.seen,boundary.seen);
        }
      }
      previous.offset = offset+end+1;
    }
    cache.set(id,previous);
  }
  const wait=previous.waits.entries().next().value;
  const state = wait?'attention':previous.state === 'working' && Date.now()-previous.seen > 900000 ? 'unknown' : previous.state;
  return {id:'codex/'+id,provider:'Codex',title:(names.get(id)||'Chat '+id.slice(-6)).slice(0,100),
    project:previous.project,reason:wait?.[1].reason||'',waitKey:wait?.[0]||'',stateAt:wait?.[1].time||previous.stateAt,state,updatedAt:previous.seen || fs.statSync(full).mtimeMs};
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
