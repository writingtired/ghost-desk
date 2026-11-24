import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createActivity} from './activity.mjs';
import {startDeviceLink} from './device-link.mjs';
import {randomUUID} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {codexSnapshot} from './codex.mjs';
import {createDesktopReader} from './desktop.mjs';

const run = promisify(execFile);
const port = Number(process.env.GHOST_DESK_PORT || 43821);
const host = '127.0.0.1:'+port;
const desktopSnapshot = createDesktopReader();
const origin = 'http://'+host;
const extension = 'chrome-extension://kceeadhohjmcidiobhonglfnmgffekik';
const states = new Set(['available','working','attention','finished','stopped','unknown']);
const providers = new Set(['Claude','Gemini','ChatGPT']);
const clients = new Map(), tickets = new Map();
const dataDir=process.env.GHOST_DESK_DATA || path.join(process.env.LOCALAPPDATA||os.homedir(),'Ghost Desk');
const activity=createActivity(path.join(dataDir,'activity-'+port+'.json'));
let boardConnected=false;
const files = new Map([['/',['index.html','text/html']],['/panel.css',['panel.css','text/css']],['/panel.js',['panel.js','text/javascript']],['/esp32',['display.html','text/html']],['/display.js',['display.js','text/javascript']],['/sprites.json',['sprites.json','application/json']],['/sprites.js',['sprites.js','text/javascript']]]);
const uuid = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

async function openDock() {
  const local=new URL('./Ghost Desk.exe',import.meta.url);
  const exe=fileURLToPath(fs.existsSync(local)?local:new URL('../Ghost Desk.exe',import.meta.url));
  const dock=spawn(exe,[String(port)],{detached:true,stdio:'ignore'});
  await once(dock,'spawn');
  dock.unref();
}

function snapshot() {
  const local = codexSnapshot();
  const desktop = desktopSnapshot();
  const sessions = [...local.sessions,...desktop.sessions];
  for (const [id,client] of clients) {
    if (Date.now()-client.seen > 60000) clients.delete(id);
    else sessions.push(...client.sessions);
  }
  return {version:1, sources:{codex:local.health,...desktop.sources,browser:clients.size},sessions:activity.update(sessions)};
}
async function body(req) {
  let length = 0;
  const chunks=[];
  for await (const chunk of req) {
    length+=chunk.length;
    if (length>262144) throw Error('Snapshot too large');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function sync(data) {
  if (!uuid.test(data.client) || !Array.isArray(data.sessions) || data.sessions.length>512) throw Error('Invalid snapshot');
  const sessions = data.sessions.map(s=>{
    if (!/^[a-f0-9]{32}$/.test(s.key) || !providers.has(s.provider) || !states.has(s.state) ||
        typeof s.title!=='string' || !Number.isFinite(s.updatedAt)) throw Error('Invalid session');
    return {id:'web/'+data.client+'/'+s.key, provider:s.provider,title:s.title.slice(0,100),state:s.state,reason:s.state==='attention'?'approval':'',stateAt:s.updatedAt,updatedAt:s.updatedAt};
  });
  if(new Set(sessions.map(s=>s.id)).size!==sessions.length)throw Error('Duplicate session');
  clients.set(data.client,{seen:Date.now(),sessions});
  const pending = [];
  for (const [token,t] of tickets) {
    if (t.client!==data.client) continue;
    const ack = data.acks?.find(a=>a.token===token);
    if (ack) t.finish(ack.ok === true);
    else if (!t.sent) { pending.push({token,key:t.key}); t.sent=true; }
  }
  return {pending};
}
async function focus(session) {
  const id=session.id;
  const [source,client,key] = id.split('/');
  if (source==='claude-desktop' && client.startsWith('local_') && uuid.test(client.slice(6))) {
    // The Desktop link uses the host's local_ ID, which differs from the CLI session UUID.
    await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "Start-Process -ErrorAction Stop -FilePath 'claude://claude.ai/epitaxy/"+client+"'"],{windowsHide:true,timeout:7000});
    return {ok:true,target:'session',message:'Sent the session link to Claude Desktop.'};
  }
  if (source==='antigravity' && uuid.test(client)) {
    const script=fs.readFileSync(new URL('./focus-antigravity.ps1',import.meta.url),'utf8');
    const {stdout}=await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],
      {windowsHide:true,timeout:16000,env:{...process.env,GHOST_DESK_CHAT_TITLE:session.title,GHOST_DESK_TITLE_UNIQUE:session.uniqueTitle?'yes':'no'}});
    if (stdout.trim()==='session') return {ok:true,target:'session',message:'Selected the conversation in Antigravity.'};
    if (stdout.trim()==='picker') return {ok:true,target:'picker',message:'Choose “'+session.title+'” in the Antigravity conversation picker.'};
    return {ok:true,target:'application',message:'Antigravity is open. Press Ctrl+K and choose “'+session.title+'”.'};
  }
  if (source==='codex' && uuid.test(client)) {
    await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',
      "Start-Process -ErrorAction Stop -FilePath 'codex://threads/"+client+"'"],{windowsHide:true,timeout:5000});
    return true;
  }
  const token = randomUUID();
  return new Promise(resolve=>{
    const finish = ok=>{clearTimeout(timer);tickets.delete(token);resolve(ok);};
    const timer = setTimeout(()=>finish(false),12000);
    tickets.set(token,{client,key,finish});
  });
}
async function openSession(id) {
  const session=snapshot().sessions.find(s=>s.id===id);
  const result=session?await focus(session):false;
  if(result && (result===true || result.target==='session') && session.review) {
    snapshot();activity.action(id,'review',false,session.stateSince);
  }
  return result;
}
const server = http.createServer(async(req,res)=>{
  const reply = (code,data,mime='application/json')=>{
    res.writeHead(code,{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'"});
    res.end(mime==='application/json'&&!Buffer.isBuffer(data)?JSON.stringify(data):data);
  };
  if (req.headers.host!==host) return reply(403,{error:'Host rejected'});
  const url=req.url;
  try {
    if (req.method==='GET' && files.has(url)) {
      const [file,mime]=files.get(url);
      return reply(200,fs.readFileSync(new URL('./'+file,import.meta.url)),mime);
    }
    if (req.method==='GET' && url==='/v1/sessions') return reply(200,snapshot());
    if (req.method==='GET' && url==='/v1/board') return reply(200,{version:1,connected:boardConnected});
    if (req.method==='POST' && req.headers['content-type']?.startsWith('application/json')) {
      if (url==='/v1/dock' && req.headers.origin===origin) {
        await openDock();
        return reply(200,{ok:true});
      }
      if (url==='/v1/sync' && req.headers.origin===extension) return reply(200,sync(await body(req)));
      if(url==='/v1/chat' && req.headers.origin===origin) {
        const {id,op,value,since}=await body(req);
        snapshot();
        const ok=activity.action(id,op,value,since);
        return reply(ok?200:409,{ok});
      }
      if (url==='/v1/focus' && req.headers.origin===origin) {
        const {id}=await body(req);
        const result=await openSession(id);
        return reply(result?200:409,typeof result==='object'?result:{ok:result});
      }
    }
    return reply(403,{error:'Unsupported request'});
  } catch { return reply(400,{error:'Unable to complete request'}); }
});
server.on('error',async e=>{
  if(e.code==='EADDRINUSE' && process.argv.includes('--open')) {
    try {
      const response=await fetch(origin+'/v1/dock',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(5000)});
      if(response.ok && (await response.json()).ok) return;
    } catch {}
  }
  console.error(e.code==='EADDRINUSE'?'Port '+port+' is already in use.':e.message);process.exitCode=1;
});
server.listen(port,'127.0.0.1',async()=>{
  if(port===43821) {
    const stop=startDeviceLink({dir:dataDir,sessions:()=>snapshot().sessions,focus:openSession,status:connected=>{boardConnected=connected;}});
    server.once('close',stop);
  }
  if(process.argv.includes('--managed')) {
    process.stdin.once('end',()=>process.exit(0));
    process.stdin.resume();
    console.log('GHOST_DESK_READY');
  } else {
    console.log('Ghost Desk is running at '+origin+'\nPress Ctrl+C to stop.');
  }
  if (process.argv.includes('--open')) {
    try { await openDock(); }
    catch { console.log('Could not start the dock. Open the address above for the browser panel.'); }
  }
});
