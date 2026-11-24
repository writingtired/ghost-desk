import {createHash} from 'node:crypto';

export const target = 'GHOSTDESK_CYD2USB_OTA1';
export const maxImageSize = 0x140000;
const active = new Set(['queued', 'transferring', 'rebooting']);

export function imageBuild(bytes) {
  if (bytes.length < 256 || bytes.length > maxImageSize || bytes[0] !== 0xe9 ||
      bytes.readUInt16LE(12) !== 0 || bytes[23] !== 1 || bytes.readUInt32LE(32) !== 0xabcd5432 ||
      !bytes.includes(Buffer.from(target + '\0'))) throw Error('Choose a Ghost Desk dual-USB .ota.bin application image.');
  const digest = createHash('sha256').update(bytes.subarray(0, -32)).digest();
  if (!digest.equals(bytes.subarray(-32))) throw Error('The firmware checksum failed. Extract a fresh copy.');
  return digest.toString('hex');
}

export function createBoardUpdater() {
  let connected=false, build='', phase='idle', message='', percent=0;
  let bytes=null, expected='', offset=0, deadline=0;
  function finish(next, detail) {
    phase=next; message=detail; bytes=null; deadline=0;
  }
  function checkTime() {
    if (deadline && Date.now()>deadline) finish('error','Timed out waiting for the board. Check its power and Wi-Fi.');
  }
  function info() {
    checkTime();
    return {connected,capable:!!build,build,phase,message,percent};
  }
  function rebooting() {
    phase='rebooting'; message='Waiting for the board to restart and confirm the update.';
    bytes=null; percent=99; deadline=Date.now()+90000;
  }
  return {
    info,
    reset() {
      connected=false; build=''; percent=0; finish('idle','');
    },
    disconnect() {
      connected=false;
      if (phase==='transferring' && offset===bytes.length) rebooting();
      else if (phase==='queued'||phase==='transferring') finish('error','Transfer interrupted. Reconnect the board and retry.');
    },
    queue(image) {
      checkTime();
      if (active.has(phase)) throw Error('An update is already in progress.');
      if (!connected) throw Error('Connect the paired display to Ghost Desk first.');
      if (!build) throw Error('Enable wireless updates once over USB first.');
      expected=imageBuild(image);
      if (expected===build) {percent=100; finish('done','Your display already runs this firmware.');}
      else {
        bytes=image; offset=0; percent=0; phase='queued'; deadline=Date.now()+30000;
        message='Waiting for the paired display to start the update.';
      }
      return info();
    },
    poll(req) {
      checkTime();
      connected=true;
      build=req.target===target && /^[0-9a-f]{64}$/.test(req.build) ? req.build : '';
      if (phase==='rebooting') {
        if (build===expected) {percent=100; finish('done','Update complete. The display reconnected on the new firmware.');}
        else finish('error','The board reconnected without confirming the selected firmware.');
      }
      if (phase!=='queued') return;
      if (!build) {finish('error','The connected display requires the one-time USB upgrade.');return;}
      phase='transferring'; message='Sending firmware to the display.'; deadline=Date.now()+30000;
      return {v:1,ota:'install',target,build:expected,size:bytes.length};
    },
    transfer(req) {
      checkTime();
      if (phase!=='transferring') throw Error('Unexpected update request');
      if (req.ota==='failed') {finish('error','The board rejected the update. Check the firmware and retry.');return;}
      if (req.ota==='boot' && offset===bytes.length) {rebooting();return;}
      if (req.ota!=='read'||req.offset!==offset||offset>=bytes.length) {
        finish('error','Firmware transfer was interrupted by an unexpected request.');throw Error(message);
      }
      const chunk=bytes.subarray(offset,offset+8192);
      percent=Math.floor(99*offset/bytes.length); offset+=chunk.length; deadline=Date.now()+30000;
      return chunk;
    }
  };
}
