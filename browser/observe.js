// Read UI controls only. Conversation text never leaves the page.
let lastPath='', state='unknown', updatedAt=Date.now(), observedWork=false;
const visible = el=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
function sample() {
  if (location.pathname!==lastPath) {
    lastPath=location.pathname; state='unknown'; observedWork=false; updatedAt=Date.now();
  }
  const controls = [...document.querySelectorAll('button[aria-label],button[data-testid],button[title]')];
  const stop = controls.some(b=>visible(b) && (
    b.dataset.testid==='stop-button' ||
    /^stop( (generating|generation|response|streaming|answering|responding)( response)?)?$/i.test((b.getAttribute('aria-label')||b.title||'').trim())
  ));
  const approval = [...document.querySelectorAll('[role="dialog"] button,dialog[open] button,[role="alertdialog"] button')]
    .some(b=>visible(b) && /^(allow once|approve|approve once|allow this time|allow always)$/i.test((b.textContent||'').trim()));
  const composer = [...document.querySelectorAll('textarea,[contenteditable="true"][role="textbox"],#prompt-textarea,.ProseMirror[contenteditable="true"],rich-textarea [contenteditable="true"]')].some(visible);
  if (stop) observedWork=true;
  const next = approval?'attention':stop?'working':composer?(observedWork?'finished':'available'):'unknown';
  if (next!==state) {state=next;updatedAt=Date.now();}
  return {state,updatedAt,path:location.pathname};
}
let scheduled=false;
new MutationObserver(()=>{
  if (!scheduled) { scheduled=true; setTimeout(()=>{scheduled=false;sample();},180); }
}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-label','data-testid','contenteditable','hidden']});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if (message.type==='sample') reply(sample());
});
