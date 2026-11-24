import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createActivity,projectName} from '../activity.mjs';

const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-activity-'));
try {
  let now=Date.now(),clock=()=>now,file=path.join(dir,'prefs.json'),store=createActivity(file,clock);
  const update=(state,extra={})=>{now+=2100;return store.update([{id:'a',state,title:'Private chat',project:'Private project',...extra}])[0];};
  const first=update('finished');assert.equal(first.review,false);
  update('working');const ready=update('finished');assert.equal(ready.review,true);
  assert.equal(store.action('a','review',false,first.stateSince),false);
  assert.ok(store.action('a','pin',true));assert.ok(store.action('a','mute',true));
  store=createActivity(file,clock);
  const restart=update('finished');assert.deepEqual([restart.hue,restart.review,restart.pin,restart.muted],[first.hue,true,1,true]);
  assert.ok(store.action('a','review',false,ready.stateSince));assert.equal(update('finished').review,false);
  let waiting=update('attention',{reason:'approval',waitKey:'one'});assert.equal(store.action('a','notify',true,waiting.stateSince),false);
  assert.ok(store.action('a','mute',false));assert.ok(store.action('a','notify',true,waiting.stateSince));
  assert.equal(store.action('a','notify',true,waiting.stateSince),false);
  store=createActivity(file,clock);
  assert.ok(update('attention',{reason:'approval',waitKey:'one'}).notified);
  const second=update('attention',{reason:'question',waitKey:'two'});assert.ok(second.stateSince>waiting.stateSince && !second.notified);
  assert.equal(store.action('a','notify',true,waiting.stateSince),false);
  assert.equal(update('stopped').review,false);
  update('working');store.update([]);assert.equal(update('finished').review,false);
  store.update([{id:'b',state:'working'}]);store.action('b','pin',true);assert.equal(store.update([{id:'b',state:'working'}])[0].pin,2);
  assert.ok(!fs.readFileSync(file,'utf8').includes('Private'));
  assert.equal(projectName('file:///D:/Work/Pixel%20Studio'),'Pixel Studio');

  process.env.CODEX_HOME=dir;
  const id=randomUUID(),logs=path.join(dir,'sessions'),log=path.join(logs,'rollout-'+id+'.jsonl');
  fs.mkdirSync(logs);
  // New guardian workers may appear before their title is indexed.
  for(let i=0;i<49;i++)fs.writeFileSync(path.join(logs,'rollout-'+randomUUID()+'.jsonl'),
    JSON.stringify({type:'session_meta',payload:{cwd:'C:/Work/Pocket Console',source:{subagent:{other:'guardian'}}}})+'\n');
  fs.writeFileSync(path.join(dir,'session_index.jsonl'),JSON.stringify({id,thread_name:'Guardian review'})+'\n');
  const write=(type,payload)=>fs.appendFileSync(log,JSON.stringify({timestamp:new Date().toISOString(),type,payload})+'\n');
  write('session_meta',{cwd:'C:/Work/Pocket Console'});write('event_msg',{type:'task_started'});
  const {codexSnapshot}=await import('../codex.mjs');
  assert.deepEqual(codexSnapshot().sessions.map(s=>s.id),['codex/'+id]);
  const sample=()=>codexSnapshot().sessions[0];
  assert.equal(sample().project,'Pocket Console');
  write('response_item',{type:'function_call',name:'functions.request_user_input',call_id:'ask'});
  assert.equal(sample().reason,'question');
  write('response_item',{type:'function_call_output',call_id:'unrelated'});assert.equal(sample().state,'attention');
  write('response_item',{type:'function_call_output',call_id:'ask'});assert.equal(sample().state,'working');
  write('event_msg',{type:'exec_approval_request',call_id:'exec'});assert.equal(sample().reason,'approval');
  write('event_msg',{type:'exec_command_begin',call_id:'exec'});assert.equal(sample().state,'working');
  write('event_msg',{type:'task_complete'});assert.equal(sample().state,'finished');
  console.log('Activity, durable review, pin slots, wait episodes, alert deduplication, workspace labels, and Codex wait resolution passed.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
