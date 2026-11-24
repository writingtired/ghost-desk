import assert from 'node:assert/strict';
import tls from 'node:tls';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import {once} from 'node:events';
import {boardPage,startDeviceLink} from '../device-link.mjs';
import {createBoardUpdater,imageBuild,target} from '../board-update.mjs';
const updater=createBoardUpdater();
const payload=Buffer.alloc(19104,0);
payload[0]=0xe9;payload[23]=1;payload.writeUInt32LE(0xabcd5432,32);payload.write(target,96);
const firmware=Buffer.concat([payload,createHash('sha256').update(payload).digest()]);
const originalBuild='8'.repeat(64),newBuild=imageBuild(firmware);
assert.throws(()=>imageBuild(Buffer.alloc(256)),/Choose/);
assert.throws(()=>imageBuild(Buffer.concat([payload,Buffer.alloc(32)])),/checksum/);
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ghost-board-test-')),key=randomBytes(32);
const chats=Array.from({length:9},(_,i)=>({id:'sample/'+i,title:'Chat '+i,provider:'Codex',project:'Workspace',state:i<5?'working':'finished',review:i===6,hue:189,pin:i===7?1:0,updatedAt:i}));
const first=boardPage(chats,false,0);
const review={...chats[6],stateSince:Date.now()-35000};
const timed=boardPage([review],false,0);
assert.equal(timed.items[0].reviewSince,review.stateSince);
assert.ok(timed.now>=review.stateSince+35000);
assert.equal(boardPage([{...review,muted:true}],false,0).items[0].reviewSince,undefined);
assert.equal(boardPage([{...review,review:false}],true,0).items[0].reviewSince,undefined);
assert.equal(first.items.length,4);assert.equal(first.quiet,2);assert.equal(first.pages,2);assert.equal(first.items[0].id,'sample/7');
assert.equal(boardPage(chats,true,100).page,2);
let opened=[],linked=false,stop,client;
const server=tls.createServer({minVersion:'TLSv1.2',maxVersion:'TLSv1.2',ciphers:'PSK-AES128-GCM-SHA256',pskCallback:(sock,id)=>id==='ghostdesk'?key:null});
const file=path.join(dir,'board-v1.json'),config={name:'ghostdesk-001122334455',ip:'127.0.0.1',key:key.toString('hex')};
const event=(emitter,name)=>once(emitter,name,{signal:AbortSignal.timeout(10000)}).catch(e=>{throw Error(name+' timed out or failed: '+e.message);});
async function request(msg){
  const next=event(client,'data');client.write(JSON.stringify({v:1,page:0,all:false,...msg})+'\n');
  return JSON.parse((await next)[0].toString());
}
try {
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const rejected=event(server,'tlsClientError');
  fs.writeFileSync(file,JSON.stringify({...config,key:randomBytes(32).toString('hex')}));
  stop=startDeviceLink({dir,sessions:()=>chats,focus:async id=>{opened.push(id);return true;},status:b=>linked=b,updater,port:server.address().port,interval:50});
  await rejected;assert.equal(linked,false);assert.equal(opened.length,0);
  const ready=event(server,'secureConnection');
  fs.writeFileSync(file,JSON.stringify(config));[client]=await ready;
  assert.equal(client.getCipher().name,'PSK-AES128-GCM-SHA256');
  let v=await request({});assert.equal(v.items[0].id,'sample/7');assert.equal(linked,true);
  v=await request({open:'sample/8'});assert.equal(v.msg,'Chat unavailable');assert.equal(opened.length,0);
  v=await request({open:'sample/7'});assert.equal(v.msg,'Opened on PC');assert.deepEqual(opened,['sample/7']);
  v=await request({page:2,all:true});assert.equal(v.items.length,1);
  chats.splice(0);v=await request({});assert.equal(v.total,0);
  const reconnected=event(server,'secureConnection');client.destroy();
  // Update the pairing to mimic pairing over USB after a network change.
  fs.writeFileSync(file,JSON.stringify(config,null,2));[client]=await reconnected;
  assert.equal((await request({})).total,0);
  assert.throws(()=>updater.queue(firmware),/USB/);
  const poll={target,build:originalBuild};
  await request(poll);
  updater.queue(firmware);
  assert.throws(()=>updater.queue(firmware),/already in progress/);
  assert.equal((await request(poll)).ota,'install');
  let again=event(server,'secureConnection');client.destroy();[client]=await again;
  await request(poll);assert.equal(updater.info().phase,'error');
  updater.queue(firmware);
  const manifest=await request(poll);
  assert.equal(manifest.build,newBuild);assert.equal(manifest.size,firmware.length);
  const received=[];
  for(let offset=0;offset<manifest.size;offset+=8192){
    const length=Math.min(8192,manifest.size-offset);
    const packet=new Promise((resolve,reject)=>{
      const chunks=[];let bytes=0;
      const timer=setTimeout(()=>reject(Error('OTA packet timed out')),4000);
      function data(chunk){
        chunks.push(chunk);bytes+=chunk.length;
        if(bytes>=length){clearTimeout(timer);client.off('data',data);resolve(Buffer.concat(chunks));}
      }
      client.on('data',data);
    });
    client.write(JSON.stringify({ota:'read',offset})+'\n');
    received.push(await packet);
  }
  assert.deepEqual(Buffer.concat(received),firmware);
  client.write('{"ota":"boot"}\n');
  again=event(server,'secureConnection');client.end();[client]=await again;
  assert.equal(updater.info().phase,'rebooting');
  await request({target,build:newBuild});
  assert.equal(updater.info().phase,'done');assert.equal(updater.info().percent,100);
  assert.match(updater.queue(firmware).message,/already runs/);
  console.log('Wireless transfer passed legacy refusal, damaged image rejection, interrupted transfer, exact image delivery, reboot confirmation and same-version skip.');
  console.log('Board transport passed TLS key rejection, encrypted snapshots, desktop ordering, paging, focus, empty live list and reconnect.');
}finally{stop?.();client?.destroy();server.close();fs.rmSync(dir,{recursive:true,force:true});}
