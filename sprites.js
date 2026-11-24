const atlas=await (await fetch('/sprites.json')).json();
const inks={ink:'#191942',white:'#fff',amber:'#ffd267'};
export function drawGhost(ctx,s,x=0,y=0,scale=1) {
  ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
  ctx.fillStyle=s.state==='unknown'?'#768394':'hsl('+s.hue+' 78% 72%)';
  if(s.state==='stopped')ctx.globalAlpha=.65;
  atlas.body.forEach((row,y)=>{for(let x=0;x<16;x++)if(row[x]==='#')ctx.fillRect(x,y,1,1);});
  for(const [x,y,w,h,ink] of atlas.faces[s.review?'review':s.state]||atlas.faces.unknown) {
    ctx.fillStyle=inks[ink];ctx.fillRect(x,y,w,h);
  }
  ctx.restore();
}
export const labels={available:'Available',working:'Working',attention:'Needs you',finished:'Turn ended',unknown:'Status unknown',stopped:'Stopped'};
export const label=s=>s.review?'Ready to review':s.state==='attention'&&s.reason==='approval'?'Approval requested':s.state==='attention'&&s.reason==='question'?'Question waiting':labels[s.state];
export const context=s=>s.provider+' · '+(s.project||'Chat '+s.id.slice(-6));
export function age(s) {
  if(!s.stateSince)return 'time unknown';
  const m=Math.max(0,Math.floor((Date.now()-s.stateSince)/60000));
  return m<1?'just now':m<60?m+'m ago':m<1440?Math.floor(m/60)+'h ago':Math.floor(m/1440)+'d ago';
}
export const samples=Array.from({length:15},(_,i)=>{
  const states=['attention','working','finished','available','stopped','unknown','attention','finished'];
  const titles=['Review release notes','Build the touch menu','Compare screen layouts','Plan the next session','Revise the enclosure','Check battery usage','Choose a typeface','Review release notes','Polish the icons','Test sleep mode','Sketch the settings','Measure the redraw','Draft the guide','Review translations','Update the gallery'];
  const state=states[i%states.length];
  return {id:'sample-'+i,title:titles[i],provider:['Claude Code','Codex','Antigravity'][i%3],project:['Field Notes','Pocket Console','Display Lab','Studio'][i%4],
    state,hue:(22+i*137)%360,reason:state==='attention'?(i?'question':'approval'):'',review:i===2,pin:0,muted:false,stateSince:Date.now()-(i+2)*60000,updatedAt:Date.now()-i*60000};
});
