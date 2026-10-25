/** Pixel-aligned V5 skill action silhouettes. Each ROLE is drawn differently,
 * not the old single defense glyph for every E or the same nova for every R.
 * Purely visual: server decides all actual damage, movement, ally buffs, summons.
 */
import {jobArtProfile} from './job-signatures.js';
const TAU=Math.PI*2;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const roles=new Set([
 'weapon','cone','mark','blast','dash','combo','field','sunder','spin','life','stagger','pierce','ignite','freeze','resonance','chain','pull','slow','drain','push',
 'command','delayed','healing','execute','summon',
 'counter','parry','bastion','leap_trap','smoke','blink','aim','fury','meditate','stance','brew','rewind','rebirth','song','trap','pet','turret','healing_field','frost_field','star_field','lightning_rod','charge'
]);
const roleColors={
 counter:['#aee4ed','#e9fff3'],parry:['#ecd6aa','#fff0d2'],bastion:['#7ed5e4','#d9fcff'],
 mark:['#dab5f5','#fff4db'],execute:['#efa8dd','#fff1f5'],ignite:['#f37e67','#fff3b3'],freeze:['#8ecffc','#effaff'],
 chain:['#9abfff','#f7fbd5'],fury:['#ed6a63','#ffe39c'],brew:['#9fdc98','#efffd8'],heal:['#afe8a1','#f9ffdf'],
 healing:['#cbe3a8','#fff5db'],healing_field:['#b7e9b2','#f3fff4'],pet:['#d3c2e5','#f9e8fa'],summon:['#bda8d9','#f4eaff'],
 rewind:['#ade1e9','#fff7be'],slow:['#a6dadd','#fff2bf'],turret:['#dbba81','#ffffd6'],
 star_field:['#c9b4f7','#fffada'],storm_rod:['#99bcef','#f3f9ff'],lightning_rod:['#87a9ff','#d9fdff'],
 charge:['#f9b2b1','#fff4d5'],trap:['#dec497','#eaffde'],frost_field:['#a7c9f5','#edfaff'],
 song:['#ecc1e3','#fef3d5'],resonance:['#e6c7ff','#fff7f4'],push:['#84cde5','#e7fdff'],
 command:['#f2cc8b','#fff1ce']};
export const tacticalRoles=Object.freeze([...roles]);
function paintTacticalSkill(renderer,e,f){
 if(!e?.role||!roles.has(e.role)||!renderer?.ctx||!renderer.showEffects)return false;
 const c=renderer.ctx,r=e.role,t=clamp(f,0,1),fade=clamp((1-t)*3,0,1),a=.8*fade;
 const sx=e.x,sy=e.y-18,dx=(e.tx??e.x)-e.x,dy=(e.ty??e.y)-e.y,ang=Math.atan2(dy,dx)||0;
 const length=Math.hypot(dx,dy);
 const attacking=e.type==='attack';
 const x=attacking?Math.min(1,(t+.18)*1.8)*(e.tx??e.x)+(1-Math.min(1,(t+.18)*1.8))*e.x:e.x;
 const y=attacking?Math.min(1,(t+.18)*1.8)*(e.ty??e.y)+(1-Math.min(1,(t+.18)*1.8))*e.y:e.y;
 const [base,bright]=roleColors[r]||['#b7cded','#fff6d8'];
 c.save();c.globalAlpha=a;c.imageSmoothingEnabled=false;c.lineCap='butt';c.lineJoin='bevel';
 // World coordinates arrive already inside the zoomed, camera-following transform.
 const dot=(xx,yy,size=4,col=base)=>{c.fillStyle=col;c.fillRect(Math.round(xx-size/2),Math.round(yy-size/2),Math.round(size),Math.round(size));};
 const seg=(ax,ay,bx,by,w=4,col=base)=>{c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.moveTo(Math.round(ax),Math.round(ay));c.lineTo(Math.round(bx),Math.round(by));c.stroke();};
 const poly=(pts,col=base)=>{c.fillStyle=col;c.beginPath();c.moveTo(...pts[0]);for(const p of pts.slice(1))c.lineTo(...p);c.closePath();c.fill();};
 const arc=(cx,cy,rad,start=0,end=TAU,w=3,col=base)=>{c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.arc(Math.round(cx),Math.round(cy),Math.max(1,rad),start,end);c.stroke();};
 const star=(cx,cy,rad=14,n=5)=>{for(let j=0;j<n;j++){const aa=j*TAU/n+t;seg(cx,cy,cx+Math.cos(aa)*rad,cy+Math.sin(aa)*rad*.75,2,j%2?base:bright);}};
 const shards=(cx,cy,n=7,rad=35)=>{for(let i=0;i<n;i++){const aa=i*TAU/n+i*.08;dot(cx+Math.cos(aa)*rad*t,cy+Math.sin(aa)*rad*t*.7,3+i%3*2,i%2?base:bright);}};
 const aim=(cx,cy,rad=26)=>{arc(cx,cy,rad+t*6,.08,Math.PI*.93,3,base);arc(cx,cy,rad+t*6,Math.PI*1.08,TAU*.98,3,bright);seg(cx-rad-9,cy,cx-rad+2,cy,2,bright);seg(cx+rad-2,cy,cx+rad+9,cy,2,bright);dot(cx,cy,4,bright);};
 const blade=(cx,cy,a0,rad=49)=>{const spread=1.85,steps=8;
  for(let k=0;k<steps;k++){const a1=a0-spread/2+k*spread/(steps-1)+t*.8;
   dot(cx+Math.cos(a1)*(rad-k*.7),cy+Math.sin(a1)*(rad-k*.7)*.76,5+k%2*2,k%2?base:bright);}
  const tip=a0+spread/2+t*.8;seg(cx,cy,cx+Math.cos(tip)*rad,cy+Math.sin(tip)*rad*.78,4,base);};
 const lightning=(ax,ay,bx,by,seed=0)=>{const dist=Math.hypot(bx-ax,by-ay)||1;
  let p=[ax,ay];for(let i=1;i<=7;i++){const q=i/7,side=i===7?0:Math.sin(i*9+seed)*8;
   const nx=ax+(bx-ax)*q-(by-ay)/dist*side,ny=ay+(by-ay)*q+(bx-ax)/dist*side;
   seg(p[0],p[1],nx,ny,5,base);seg(p[0],p[1],nx,ny,2,bright);p=[nx,ny];}};
 const roots=(cx,cy,spread=32)=>{for(let i=-2;i<=2;i++){const rx=cx+i*spread/3;seg(rx,cy,rx+i*4,cy-22-8*(1-t),4,i%2?base:bright);dot(rx+i*4,cy-26-8*(1-t),7,base);}};
 const cross=(cx,cy,size=17)=>{dot(cx,cy,size*.65,bright);seg(cx-size,cy,cx+size,cy,5,base);seg(cx,cy-size,cx,cy+size,5,base);};
 const radial=(cx,cy,rad=42,n=10)=>{for(let i=0;i<n;i++){const aa=i*TAU/n+t*.4;seg(cx+Math.cos(aa)*rad*.45,cy+Math.sin(aa)*rad*.3,cx+Math.cos(aa)*rad*(.7+t*.7),cy+Math.sin(aa)*rad*(.7+t*.7)*.65,2,i%3?base:bright);}};
 switch(r){
  case 'weapon':{
   // Basic attacks share a key, never a silhouette: the actual equipped class
   // motif decides the blade, polearm, scythe, projectile, spell or gauntlet.
   const profile=jobArtProfile(e.job||e.classId||'novice');
   const motif=profile.motif,weapon=profile.weapon;
   const id=[...String(motif)].reduce((a,ch)=>a*31+ch.charCodeAt(0),7)>>>0;
   const k=id%7,swirl=(k-3)*.12,progress=clamp(t*1.85,0,1);
   const reach=40+Math.round(progress*27),heading=ang+swirl;
   if(/낫/.test(weapon)){
    // Draw the long pole first, then an unmistakable hooked blade.
    const baseX=sx-Math.cos(heading)*23,baseY=sy-Math.sin(heading)*20;
    const headX=sx+Math.cos(heading)*reach,headY=sy+Math.sin(heading)*reach;
    seg(baseX,baseY,headX,headY,5,bright);
    arc(headX,headY-12,34+progress*8,heading-2.3,heading+.15,7,base);
    arc(headX,headY-12,29+progress*8,heading-2.25,heading+.1,3,bright);
    shards(headX,headY-16,3+k%4,22);
   }else if(/창|삼지창|깃창/.test(weapon)){
    const xx=sx+Math.cos(heading)*reach,yy=sy+Math.sin(heading)*reach;
    seg(sx-Math.cos(heading)*28,sy-Math.sin(heading)*28,xx,yy,6,base);
    seg(sx-Math.cos(heading)*28,sy-Math.sin(heading)*28,xx,yy,2,bright);
    poly([[xx-7,yy-13],[xx+Math.cos(heading)*23,yy+Math.sin(heading)*23],[xx+8,yy+13]],bright);
    for(let i=0;i<3+k%3;i++)seg(xx-i*12,yy+i*3,xx+16-i*12,yy+i*3,2,base);
   }else if(/도끼|곡괭이/.test(weapon)){
    const xx=sx+Math.cos(heading)*reach*.66,yy=sy+Math.sin(heading)*reach*.66;
    seg(sx-25,sy+23,xx,yy-20,7,bright);
    poly([[xx-22,yy-37],[xx+15,yy-43],[xx+28,yy-15],[xx+2,yy+2],[xx-24,yy-11]],base);
    seg(xx-19,yy-32,xx+9,yy-37,3,bright);shards(xx,yy-23,4+k%3,15);
   }else if(/활|쇠뇌/.test(weapon)){
    const xx=sx+((e.tx??e.x)-sx)*progress,yy=sy+((e.ty??e.y)-sy)*progress;
    seg(sx,sy,xx,yy,4,bright);seg(xx-16,yy-4,xx+12,yy,3,base);
    poly([[xx+16,yy],[xx+5,yy-8],[xx+5,yy+8]],bright);
    if(k%2===0)star(sx,sy,12);
   }else if(/검|칼|발톱/.test(weapon)){
    const a0=heading-1.15+t*2.4;
    for(let i=0;i<6;i++){
      const a=a0+i*.18;
      seg(sx+Math.cos(a)*31,sy-12+Math.sin(a)*27,sx+Math.cos(a)*reach,sy-12+Math.sin(a)*reach*.82,i%2?3:5,i%2?bright:base);
    }
    // Blade and hilt, attached to the sprite's hand rather than a floating disk.
    seg(sx-4,sy+5,sx+Math.cos(a0+1)*reach,sy+Math.sin(a0+1)*reach,6,bright);
    seg(sx-11,sy+7,sx+8,sy-4,6,base);
   }else if(/권갑/.test(weapon)){
    for(let i=0;i<3;i++){
      const xx=sx+progress*45+i*11,yy=sy-17+Math.sin(t*9+i)*10;
      dot(xx,yy,17-i*3,i%2?base:bright);
    }
   }else{
    // Caster focus: a travelling projectile, elemental shape and a distinct
    // cadence derived from this profession's own weapon identity.
    const xx=sx+((e.tx??e.x)-sx)*progress,yy=sy+((e.ty??e.y)-sy)*progress-16;
    seg(sx,sy-16,xx,yy,3,base);
    for(let i=0;i<4+k%3;i++){
      const aa=i*TAU/(4+k%3)+t*3*(id%2?1:-1);
      dot(xx+Math.cos(aa)*(13+k),yy+Math.sin(aa)*(11+k),3+i%2*3,i%2?base:bright);
    }
    dot(xx,yy,10+k,bright);if(k%2===0)star(xx,yy,8+k);
   }
   break;
  }
  case 'cone' :case 'spin':case 'combo':case 'life':case 'drain':case 'execute':{
   const baseAngle=r==='spin'?t*TAU:ang;
   blade(sx,sy,baseAngle,r==='execute'?74:r==='spin'?60:48);
   if(r==='combo'||r==='execute')blade(sx-7,sy+5,baseAngle-1.1,41);
   if(r==='execute'||r==='drain')shards(x,y-15,r==='execute'?12:5,30);
   break;
  }
  case 'dash':case 'charge':case 'leap_trap':case 'smoke':case 'blink':{
   for(let i=0;i<5;i++){const q=i/5;dot(sx+dx*q*t,sy+dy*q*t-6,13-i*2,i%2?base:bright);}
   arc(x,y-14,14+20*t,-Math.PI*.6,Math.PI*.6,3,base);star(x,y-14,9);break;
  }
  case 'mark':case 'aim':case 'pierce':{
   if(r==='pierce'){lightning(sx,sy,x,y-16,2);for(let j=-1;j<=1;j++)seg(x-16,y+j*8,x+14,y+j*8,2,bright);}
   aim(r==='aim'?sx:x,r==='aim'?sy:y-18,r==='aim'?27:24);break;
  }
  case 'blast':case 'delayed':case 'stagger':case 'sunder':{
   radial(x,y-12,r==='delayed'?60:39,r==='stagger'?6:11);shards(x,y-15,9,36);
   if(r==='delayed'){seg(x+38,y-100,x+12,y-20,8,base);seg(x+36,y-90,x+14,y-28,4,bright);}
   if(r==='sunder')for(let i=0;i<3;i++)seg(x-40+i*24,y+5,x-23+i*21,y-21+i*3,5,bright);
   break;
  }
  case 'field':case 'frost_field':case 'star_field':case 'trap':case 'healing_field':case 'healing':{
   const rr=r==='healing'||r==='healing_field'?62:48;
   arc(x,y,rr*.7+rr*.3*t,Math.PI*.04,Math.PI*.96,3,base);
   if(r==='frost_field')for(let i=0;i<6;i++){const aa=i*TAU/6;seg(x,y-8,x+Math.cos(aa)*39,y-8+Math.sin(aa)*30,3,bright);}
   else if(r==='healing'||r==='healing_field') {roots(x,y,56);cross(x,y-35,10);}
   else if(r==='star_field')for(let i=0;i<6;i++){const aa=i*TAU/6+t;dot(x+Math.cos(aa)*35,y+Math.sin(aa)*25,6,bright);}
   else if(r==='trap')for(let i=-2;i<=2;i++)poly([[x+i*12-4,y],[x+i*12,y-19],[x+i*12+4,y]],i%2?base:bright);
   else roots(x,y,45);
   break;
  }
  case 'ignite':case 'fury':case 'rebirth':{
   for(let i=-3;i<=3;i++){const flameX=x+i*13;
    poly([[flameX-9,y+9],[flameX-3,y-8-12*t],[flameX+2,y-34-12*t+(i%2)*9],[flameX+10,y+8]],i%2?base:bright);}
   if(r==='rebirth')star(sx,sy-42,26);break;
  }
  case 'freeze':case 'slow':case 'rewind':{
   arc(x,y-18,30+t*9,0,TAU,4,base);
   for(let i=0;i<8;i++){const aa=i*TAU/8;seg(x+Math.cos(aa)*21,y-18+Math.sin(aa)*21,x+Math.cos(aa)*34,y-18+Math.sin(aa)*34,3,bright);}
   if(r!=='freeze'){seg(x,y-18,x+Math.cos(t*TAU)*19,y-18+Math.sin(t*TAU)*19,3,bright);seg(x,y-18,x-9,y-27,2,base);}
   else for(let i=0;i<5;i++)poly([[x+(i-2)*16,y+6],[x+(i-2)*16-5,y-17],[x+(i-2)*16+5,y-17]],i%2?base:bright);
   break;
  }
  case 'chain':case 'lightning_rod':{
   lightning(sx,sy,x,y-15,2);
   for(let j=0;j<3;j++)lightning(x,y-16,x+Math.cos(j*TAU/3)*46,y+Math.sin(j*TAU/3)*36,j);
   break;
  }
  case 'pull':case 'push':{
   for(let k=0;k<4;k++){const q=(k+t)%4/4;
    arc(x,y-15,16+q*60,Math.PI*.05,Math.PI*.95,3,k%2?base:bright);}
   seg(x,y-15,sx,sy,2,base);break;
  }
  case 'resonance':case 'song':{
   for(let i=0;i<4;i++)arc(sx,sy,16+i*15+t*18,-1.3,1.3,2,i%2?base:bright);
   for(let i=0;i<5;i++){const nx=sx+Math.cos(i*7)*36,ny=sy-22-i*8*t;dot(nx,ny,7,base);seg(nx+5,ny,nx+5,ny-17,2,bright);}
   break;
  }
  case 'counter':case 'parry':case 'bastion':{
   const xx=sx,yy=sy-3;
   poly([[xx-29,yy-24],[xx+29,yy-24],[xx+26,yy+16],[xx,yy+41],[xx-26,yy+16]],'#355263');
   seg(xx-26,yy-24,xx+26,yy-24,4,bright);seg(xx-26,yy-24,xx,yy+38,4,base);seg(xx+26,yy-24,xx,yy+38,4,base);
   if(r==='parry'){seg(xx-47,yy+22,xx+45,yy-34,6,bright);dot(xx+43,yy-36,10,base);}
   if(r==='bastion')for(let i=-2;i<=2;i++)dot(xx+i*20,yy+42,10,bright);
   else star(xx,yy,15);break;
  }
  case 'pet':case 'summon':{
   const points=[[x-26,y-5],[x-20,y-25],[x-11,y-11],[x+13,y-12],[x+20,y-26],[x+27,y-5],[x+20,y+12],[x-20,y+12]];
   poly(points,'#594869');dot(x-9,y-4,6,bright);dot(x+9,y-4,6,bright);
   for(let i=0;i<3;i++)dot(x+(i-1)*25,y+22+Math.sin(t*TAU+i)*7,5,base);
   break;
  }
  case 'turret':{
   dot(x,y-8,38,'#46576c');dot(x,y-8,25,base);seg(x,y-14,x+34,y-23,10,bright);
   dot(x-13,y+14,10,'#34424c');dot(x+13,y+14,10,'#34424c');
   if(t>.2)star(x+39,y-23,13);break;
  }
  case 'meditate':case 'stance':case 'brew':{
   arc(sx,sy,36+t*10,0,TAU,3,base);
   if(r==='brew'){poly([[sx-11,sy-25],[sx+10,sy-25],[sx+9,sy-9],[sx+17,sy+22],[sx-17,sy+22],[sx-9,sy-9]],'#547b6d');dot(sx,sy+10,12,bright);}
   else if(r==='meditate')star(sx,sy-14,20);
   else{dot(sx-20,sy-13,14,bright);dot(sx+20,sy-13,14,base);}
   break;
  }
  case 'command':{
   seg(sx,sy+22,sx,sy-63,5,bright);
   poly([[sx+3,sy-60],[sx+51,sy-49],[sx+34,sy-30],[sx+50,sy-15],[sx+3,sy-22]],base);
   radial(sx,sy+10,47,8);break;
  }
  default:radial(x,y-18,39,9);break;
 }
 // One small job-specific sign, never the huge uniform overlay from V4.
 if(e.job&&e.skill==='ultimate'){const h=[...e.job].reduce((n,ch)=>n+ch.charCodeAt(0),0);
  for(let j=0;j<3;j++){const aa=(j*2+h%7)*TAU/7+t;dot(x+Math.cos(aa)*67,y+Math.sin(aa)*44,5,j%2?base:bright);}
 }
 c.restore();return true;
}

/** One raster per active skill, updated at 20-30 fps but composited at the
 * display refresh rate. Avoids recomputing 100+ vector strokes on every RAF.
 * Each renderer has a bounded LRU of canvases; no permanent skill atlases.
 */
const banks=new WeakMap();
export function clearTacticalFX(renderer){banks.delete(renderer);}
export function tacticalFXStats(renderer){
 const b=banks.get(renderer);
 return {entries:b?.frames.size||0,pixels:b?.pixels||0,rasterizations:b?.created||0};
}
export function drawTacticalSkill(renderer,e,f){
 if(!e?.role||!roles.has(e.role)||!renderer?.ctx||!renderer.showEffects)return false;
 if(![e.x,e.y].every(Number.isFinite))return false;
 const ex=Number.isFinite(e.tx)?e.tx:e.x,ey=Number.isFinite(e.ty)?e.ty:e.y;
 const left=Math.floor(Math.min(e.x,ex)-112),top=Math.floor(Math.min(e.y,ey)-176);
 const width=Math.ceil(Math.max(e.x,ex)+112-left),height=Math.ceil(Math.max(e.y,ey)+120-top);
 if(renderer.camera&&renderer.zoom&&renderer.w&&renderer.h){
  const halfX=renderer.w/renderer.zoom/2+140,halfY=renderer.h/renderer.zoom/2+140;
  if(left>renderer.camera.x+halfX||left+width<renderer.camera.x-halfX||top>renderer.camera.y+halfY||top+height<renderer.camera.y-halfY)return true;
 }
 // Oversized server coordinates or absence of a 2D offscreen surface falls back
 // to direct drawing without losing the attack or breaking SSR/test renders.
 if(width>760||height>650||typeof OffscreenCanvas==='undefined'&&typeof document==='undefined'&&!renderer.createPixelCanvas){
  return paintTacticalSkill(renderer,e,f);
 }
 let bank=banks.get(renderer);
 if(!bank){bank={frames:new Map(),pixels:0,created:0};banks.set(renderer,bank);}
 const key=String(e._pixelId??e.castId??`${e.id||''}:${e.born||0}:${e.skill||''}`);
 const scale=renderer.lowPower?.5:1,pixelWidth=Math.ceil(width*scale),pixelHeight=Math.ceil(height*scale);
 // Quantize phase to keep 60/120Hz compositing smooth without excess redraws.
 // f belongs to a skill of varying lifetime: quantization is phase-based.
 const slice=Math.floor(Math.max(0,Math.min(.99999,f))*(renderer.lowPower?12:20));
 let entry=bank.frames.get(key);
 if(entry&&(entry.width!==width||entry.height!==height||entry.left!==left||entry.top!==top||entry.scale!==scale)){
  bank.pixels-=entry.area;bank.frames.delete(key);entry=null;
 }
 if(!entry){
  const cv=renderer.createPixelCanvas?renderer.createPixelCanvas(pixelWidth,pixelHeight):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(pixelWidth,pixelHeight):document.createElement('canvas');
  if(!cv)return paintTacticalSkill(renderer,e,f);
  cv.width=pixelWidth;cv.height=pixelHeight;
  const ctx=cv.getContext('2d',{alpha:true});if(!ctx)return paintTacticalSkill(renderer,e,f);
  entry={canvas:cv,ctx,width,height,scale,left,top,area:pixelWidth*pixelHeight,slice:-1};
  bank.frames.set(key,entry);bank.pixels+=entry.area;
 }
 if(entry.slice!==slice){
  entry.ctx.setTransform(1,0,0,1,0,0);
  entry.ctx.clearRect(0,0,pixelWidth,pixelHeight);
  entry.ctx.setTransform(scale,0,0,scale,-left*scale,-top*scale);
  paintTacticalSkill({ctx:entry.ctx,showEffects:true},e,(slice+.5)/(renderer.lowPower?12:20));
  entry.slice=slice;bank.created++;
 }
 bank.frames.delete(key);bank.frames.set(key,entry);
 const cap=renderer.lowPower?650000:1900000,limit=renderer.lowPower?10:24;
 while(bank.frames.size>limit||bank.pixels>cap){
  const old=bank.frames.keys().next().value;
  if(old===undefined)break;
  // If a single large sprite exceeds the cache, render it now then evict.
  const drop=bank.frames.get(old);bank.frames.delete(old);bank.pixels-=drop.area;
 }
 const c=renderer.ctx;c.save();c.imageSmoothingEnabled=false;c.drawImage(entry.canvas,left,top,width,height);c.restore();
 return true;
}
