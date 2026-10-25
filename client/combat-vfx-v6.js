/** STARFALL V6 / action-first 2D pixel combat art.
 * Palette is shared with the skill-button source (shared/visuals.js).
 * Each cue is composed as ANTICIPATION -> HIT -> RECOVERY. Only presentation;
 * actual damage, hitboxes, cooldowns, unlocks and saves remain server-owned.
 * No full-screen solid overlays; silhouettes and impact points stay readable.
 */
import {skillVisual} from '../shared/visuals.js';
import {jobArtProfile} from './job-signatures.js';
const TAU=Math.PI*2;
const cap=(n,a=0,b=1)=>Math.min(b,Math.max(a,n));
const smooth=t=>{t=cap(t);return t*t*(3-2*t);};
const ease=t=>1-(1-cap(t))**3;
const lerp=(a,b,t)=>a+(b-a)*t;
const hash=s=>[...s].reduce((x,ch)=>(Math.imul(x,33)^ch.charCodeAt(0))>>>0,5381);
const MELEE=/검|칼|낫|도끼|창|곡괭이|망치|권갑|발톱/;
const RANGED=/활|쇠뇌/;
const POKES=/창|삼지창|깃창/;
const SCYTHE=/낫/;
const AXE=/도끼|곡괭이/;
const TWIN=/쌍검|단검|쌍단검|발톱/;
const FIST=/권갑/;
export const SKILL_VFX_VERSION='v6-art-20261025-b';
export function skillButtonPalette(job,skill='basic'){
 const v=skillVisual(job,skill);
 // The 40px skill icons use precisely these theme swatches.
 return {primary:v.primary,light:v.light,dark:v.dark,core:'#fff8df',shadow:'#182735',theme:v.theme};
}
export function skillArtIdentity(e){
 const job=e.job||e.classId||'novice';
 return {job,skill:e.skill||'basic',role:e.role||'weapon',weapon:jobArtProfile(job).weapon,palette:skillButtonPalette(job,e.skill)};
}
// A tiny deterministic PRNG makes every effect stable between frames.
function random(s){s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;}
function makeArtist(ctx,pal,alpha=1){
 const c=ctx;
 const rect=(x,y,w,h,col=pal.primary,a=1)=>{if(w<=0||h<=0)return;c.globalAlpha=alpha*a;c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));};
 const line=(ax,ay,bx,by,col=pal.primary,w=3,a=1)=>{c.globalAlpha=alpha*a;c.strokeStyle=col;c.lineWidth=w;c.lineCap='butt';c.lineJoin='bevel';c.beginPath();c.moveTo(Math.round(ax),Math.round(ay));c.lineTo(Math.round(bx),Math.round(by));c.stroke();};
 const poly=(points,col=pal.primary,a=1)=>{c.globalAlpha=alpha*a;c.fillStyle=col;c.beginPath();c.moveTo(Math.round(points[0][0]),Math.round(points[0][1]));for(const p of points.slice(1))c.lineTo(Math.round(p[0]),Math.round(p[1]));c.closePath();c.fill();};
 const ring=(x,y,r,color=pal.primary,w=3,start=0,end=TAU,a=1,flat=.6)=>{c.globalAlpha=alpha*a;c.strokeStyle=color;c.lineWidth=w;c.beginPath();c.ellipse(Math.round(x),Math.round(y),Math.max(1,Math.round(r)),Math.max(1,Math.round(r*flat)),0,start,end);c.stroke();};
 const star=(x,y,s=9,col=pal.light,a=1)=>{poly([[x,y-s],[x+s*.24,y-s*.28],[x+s,y],[x+s*.25,y+s*.2],[x,y+s],[x-s*.23,y+s*.2],[x-s,y],[x-s*.25,y-s*.27]],col,a);rect(x-1,y-1,2,2,pal.core,a);};
 const dust=(x,y,seed,n=8,r=48,lift=0)=>{for(let i=0;i<n;i++){const z=random(seed+i*41),angle=i*TAU/n+z*.5,rad=r*(.25+z*.65),px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad*.65-lift*z;rect(px,py,2+(i%3),2+(i%3),i%4===0?pal.core:i%2?pal.primary:pal.light,.55+.4*z);}};
 return {rect,line,poly,ring,star,dust};
}
function worldClip(e){const x=e.x,y=e.y,tx=e.tx??x,ty=e.ty??y;return [x,y,tx,ty];}
function blade(c,a,b,t,kind='sword',strength=1){
 // A real grip, hilt and double-shaded edge, not a monochrome arc/icon.
 const {line,poly,rect,star}=c,p=a.pal,ang=a.angle,sx=a.x,sy=a.y;
 const reach=(kind==='spear'?64:kind==='scythe'?53:kind==='axe'?46:46)*strength;
 const dx=Math.cos(ang),dy=Math.sin(ang),nx=-dy,ny=dx;
 const bx=sx-dx*14,by=sy-dy*14,headx=sx+dx*reach,heady=sy+dy*reach;
 const at=(along,normal=0)=>[sx+dx*along+nx*normal,sy+dy*along+ny*normal];
 line(...at(-19),...at(reach),p.shadow,kind==='scythe'?9:kind==='axe'?7:6);
 line(...at(-16),...at(reach),kind==='scythe'||kind==='axe'?'#8f745f':p.primary,kind==='scythe'?5:3);
 line(...at(0),...at(reach*.86),p.light,2);
 if(kind==='sword'){
  poly([at(4,-5),at(reach,-1),at(reach+12,0),at(reach,5),at(4,4)],p.light);
  poly([at(6,1),at(reach,2),at(reach+11,0),at(6,-1)],p.core);
  line(...at(-1,-11),...at(-1,11),p.shadow,6);line(...at(-1,-10),...at(-1,10),p.primary,4);
  rect(bx-3,by-3,5,5,p.dark);
 }else if(kind==='spear'){
  poly([at(reach-8,-7),at(reach+17,0),at(reach-8,7),at(reach-4,0)],p.light);
  line(...at(reach-8),...at(reach+14),p.core,2);
  line(...at(14,-7),...at(24,0),p.primary,3);line(...at(14,7),...at(24,0),p.primary,3);
 }else if(kind==='axe'){
  poly([at(reach-12,-22),at(reach+10,-20),at(reach+17,-11),at(reach+18,12),at(reach+10,23),at(reach-12,19),at(reach-4,0)],p.dark);
  poly([at(reach-8,-18),at(reach+8,-16),at(reach+14,-8),at(reach+14,11),at(reach+8,17),at(reach-7,14),at(reach-1,0)],p.primary);
  line(...at(reach+11,-13),...at(reach+13,12),p.core,4);
 }else if(kind==='scythe'){
  const arc=[];const sweep=1.75;for(let i=0;i<=13;i++){
   const aa=ang-1.6+i*sweep/13;arc.push([headx+Math.cos(aa)*34,heady+Math.sin(aa)*34]);}
  poly([at(reach-10,0),...arc,at(reach+5,2)],p.shadow);
  for(let i=0;i<arc.length-1;i++){const k=arc[i],m=arc[i+1];line(...k,...m,i<7?p.light:p.primary,i<5?6:4);}star(...arc[0],5,p.core,.85);
 }else if(kind==='dagger'){
  poly([at(reach*.35,-3),at(reach+9,0),at(reach*.35,5)],p.light);
  line(...at(-2,-7),...at(-2,7),p.primary,3);
 }
 return {headx,heady};
}
function paintSlash(c,{x,y,angle,start,end,progress,pal,scale=1,double=false,scythe=false}){
 // The trail follows the *actual* blade trajectory, not a floating full circle.
 const step=15,lo=lerp(start,end,cap(progress-.36)),hi=lerp(start,end,cap(progress));
 if(hi<=lo+.018)return;
 for(let j=0;j<3;j++){
  const rad=(scythe?63:47)*scale-(j*5),th=7-j*2,pts=[];
  for(let i=0;i<=step;i++){const aa=angle+lerp(lo,hi,i/step),rr=rad*(.92+.08*i/step);pts.push([x+Math.cos(aa)*rr,y+Math.sin(aa)*rr*.82]);}
  for(let i=1;i<pts.length;i++)c.line(...pts[i-1],...pts[i],j===0?pal.dark:j===1?pal.primary:pal.core,th,progress>.85?.5:1);
 }
 const tip=angle+hi;c.star(x+Math.cos(tip)*((scythe?63:47)*scale),y+Math.sin(tip)*((scythe?63:47)*scale)*.82,5,pal.core,.85);
}
function paintImpact(c,x,y,t,pal,intensity=1,seed=1){
 const burst=ease(cap((t-.25)/.65));if(t<.18)return;
 const fade=Math.pow(1-burst,.65);
 c.star(x,y,Math.max(2,14*intensity*fade),pal.light,fade);
 for(let i=0;i<9*intensity;i++){
  const aa=i*TAU/(9*intensity)+random(seed+i*29)*.25,rad=(5+37*burst)*(1+(i%3)*.12)*intensity;
  const xx=x+Math.cos(aa)*rad,yy=y+Math.sin(aa)*rad*.73;
  if(i%3===0)c.line(xx-3,yy,xx+3,yy+2,pal.core,2,fade);
  else c.rect(xx,yy,i%4===0?5:3,2+(i%3),i%2?pal.light:pal.primary,fade);
 }
}
function paintProjectile(c,{sx,sy,tx,ty,t,pal,kind='magic',strength=1,seed=7}){
 const fly=cap((t-.13)/.51),vx=tx-sx,vy=ty-sy,dist=Math.max(1,Math.hypot(vx,vy)),ux=vx/dist,uy=vy/dist,nx=-uy,ny=ux;
 const px=lerp(sx,tx,ease(fly)),py=lerp(sy,ty,ease(fly));
 if(t>.7){paintImpact(c,tx,ty,t,pal,strength,seed);return;}
 if(t<.13){c.star(sx,sy,5+fly*8,pal.light);return;}
 for(let i=5;i>=0;i--){const trail=i*8;
  c.rect(px-ux*trail-2,py-uy*trail-1,Math.max(2,7-i),Math.max(2,6-Math.floor(i*.6)),i%2?pal.primary:pal.light,.16+(1-i/6)*.52);}
 if(kind==='arrow'){
  c.line(px-ux*21,py-uy*21,px+ux*13,py+uy*13,pal.shadow,5);
  c.line(px-ux*19,py-uy*19,px+ux*12,py+uy*12,pal.light,3);
  c.poly([[px+ux*19,py+uy*19],[px+nx*6+ux*5,py+ny*6+uy*5],[px-nx*6+ux*5,py-ny*6+uy*5]],pal.core);
  for(const s of [-1,1])c.line(px-ux*16,py-uy*16,px-ux*22+nx*s*6,py-uy*22+ny*s*6,pal.primary,3);
 }else if(kind==='bolt'){
  const zig=5;for(let i=0;i<zig;i++){const d=i*10,cross=Math.sin(i*4.1+seed)*7;
   c.line(px-ux*d+nx*cross,py-uy*d+ny*cross,px-ux*(d+9)-nx*cross,py-uy*(d+9)-ny*cross,i%2?pal.primary:pal.core,5-i*.4);}
 }else{
  c.star(px,py,7*strength,pal.core);
  for(let i=0;i<5;i++){const a=i*TAU/5+t*5+seed*.2,r=11+Math.sin(t*8+i)*3;
   c.rect(px+Math.cos(a)*r,py+Math.sin(a)*r,4,3,i%2?pal.primary:pal.light,.86);}
 }
}
function paintGround(c,x,y,t,pal,{radius=52,kind='field',power=1,seed=4}={}){
 const lift=ease(cap(t*3)),fade=Math.min(1,(1-t)*4);
 if(!lift)return;
 c.ring(x,y,radius*lift,pal.dark,7,0,TAU,fade*.65);
 c.ring(x,y,radius*lift-3,pal.primary,2,0,TAU,fade*.8);
 for(let i=0;i<7;i++){
  const aa=i*TAU/7+seed*.1,rr=radius*(.3+.7*lift),xx=x+Math.cos(aa)*rr,yy=y+Math.sin(aa)*rr*.6;
  if(kind==='heal')c.star(xx,yy-12*(i%3),5,pal.light,fade);
  else if(kind==='ice'){c.poly([[xx,yy+2],[xx-4,yy-8-5*(i%3)],[xx,yy-22-5*(i%3)],[xx+5,yy-9]],pal.light,fade*.9);}
  else if(kind==='fire'){c.poly([[xx-5,yy],[xx-2,yy-14-(i%3)*5],[xx+3,yy-21-(i%3)*4],[xx+7,yy]],i%2?pal.primary:pal.light,fade);}
  else c.rect(xx,yy,4,5,i%2?pal.light:pal.primary,fade);
 }
}
function paintGuard(c,x,y,t,pal,kind='shield',seed=1){
 const active=ease(cap(t*5)),fade=Math.min(1,(1-t)*4);if(!active)return;
 if(kind==='shield'){
  const w=33+3*active,h=43;
  c.poly([[x-w,y-h*.65],[x,y-h],[x+w,y-h*.65],[x+w*.77,y+h*.45],[x,y+h],[x-w*.77,y+h*.45]],pal.shadow,fade*.62);
  c.line(x-w,y-h*.65,x,y-h,pal.light,5,fade);c.line(x,y-h,x+w,y-h*.65,pal.primary,5,fade);
  c.line(x+w,y-h*.65,x+w*.77,y+h*.45,pal.primary,5,fade);c.line(x+w*.77,y+h*.45,x,y+h,pal.light,5,fade);
  c.line(x,y-26,x,y+25,pal.light,5,fade);c.line(x-14,y-2,x+14,y-2,pal.light,5,fade);
  c.star(x+22,y-20,6,pal.core,fade);
 }else if(kind==='parry'){
  paintSlash(c,{x,y,angle:0,start:-2.6,end:.5,progress:active,pal,scale:.8});c.star(x+36,y-6,12,pal.core,fade);
 }else{
  for(let i=0;i<4;i++){const a=(i*TAU/4+t*TAU*.25);c.star(x+Math.cos(a)*32,y+Math.sin(a)*23,5,pal.light,fade);}
  c.ring(x,y+17,30*active,pal.primary,3,0,TAU,fade);
 }
}
function paintAfterimage(c,sx,sy,tx,ty,t,pal,seed=1,kind='blink'){
 const active=ease(cap((t-.04)/.6)),fade=1-ease(cap((t-.42)/.58));
 for(let i=0;i<5;i++){
  const a=active*(1-i*.18),x=lerp(sx,tx,a),y=lerp(sy,ty,a),alpha=fade*(.12+.16*(5-i)/5);
  c.poly([[x-9,y-22],[x,y-29],[x+10,y-22],[x+13,y+8],[x-12,y+8]],pal.primary,alpha);
  c.line(x-13,y-15,x+15,y-15,pal.light,2,alpha);
  for(let j=0;j<3;j++)c.rect(x+(j-1)*8,y+8,3,2,pal.core,alpha*.8);
 }
 c.star(lerp(sx,tx,active),lerp(sy,ty,active)-9,7,pal.light,fade);
}
function paintDevice(c,x,y,t,pal,kind='turret',seed=1){
 const make=ease(cap(t*3)),fade=Math.min(1,(1-t)*4),h=28*make;
 c.ring(x,y+6,29*make,pal.dark,5,0,TAU,fade*.5);
 if(kind==='turret'){
  c.rect(x-19,y-h,38,h,pal.shadow,fade);c.rect(x-15,y-h+3,30,8,pal.primary,fade);
  c.rect(x-8,y-h-9,16,13,pal.light,fade);c.rect(x+8,y-h-5,30,7,pal.dark,fade);c.rect(x+9,y-h-4,28,4,pal.light,fade);
  c.rect(x-15,y+1,8,9,pal.primary,fade);c.rect(x+8,y+1,8,9,pal.primary,fade);
 }else if(kind==='trap'){
  c.rect(x-21,y-8,42,14,pal.shadow,fade);for(let i=-2;i<=2;i++)c.poly([[x+i*9-4,y-7],[x+i*9,y-21*make],[x+i*9+4,y-7]],pal.light,fade);
  c.star(x,y-10,4,pal.core,fade);
 }else{
  c.poly([[x-18,y+7],[x-12,y-h],[x,y-h-13],[x+12,y-h],[x+18,y+7]],pal.dark,fade);
  c.star(x,y-h-6,11,pal.light,fade);
  for(let i=0;i<3;i++)c.rect(x-15+i*15,y+6,6,8,pal.primary,fade);
 }
}
function spellGlyph(c,x,y,t,pal,kind='magic',seed=1,power=1){
 const active=ease(cap(t*3)),fade=Math.min(1,(1-t)*4),rad=(14+15*active)*power;
 if(kind==='clock'){
  c.ring(x,y,rad,pal.primary,4,0,TAU,fade,.94);for(let k=0;k<12;k++){const a=k*TAU/12;c.line(x+Math.cos(a)*(rad-4),y+Math.sin(a)*(rad-4),x+Math.cos(a)*rad,y+Math.sin(a)*rad,pal.light,2,fade);}
  const turn=seed*.3+t*TAU*1.4;c.line(x,y,x+Math.cos(turn)*rad*.7,y+Math.sin(turn)*rad*.7,pal.light,3,fade);c.line(x,y,x+Math.cos(-turn*.6)*rad*.5,y+Math.sin(-turn*.6)*rad*.5,pal.core,2,fade);
 }else if(kind==='chain'){
  for(let i=0;i<4;i++){const a=seed*.4+i*TAU/4+t*1.5;c.ring(x+Math.cos(a)*rad*.6,y+Math.sin(a)*rad*.6,9,pal.primary,4,0,TAU,fade,1);}
 }else if(kind==='music'){
  for(let i=0;i<4;i++){const xx=x+(i-1.5)*15,yy=y-24*Math.sin(t*Math.PI)-10*(i%2);
   c.rect(xx,yy,9,6,pal.primary,fade);c.line(xx+7,yy,xx+7,yy-21,pal.light,3,fade);if(i%2)c.line(xx+7,yy-21,xx+17,yy-17,pal.light,3,fade);}
 }else if(kind==='star'){
  for(let i=0;i<7;i++){const a=i*TAU/7+seed*.14;c.star(x+Math.cos(a)*rad,y+Math.sin(a)*rad,4+(i%3),pal.light,fade);}
  c.star(x,y,10,pal.core,fade);
 }else if(kind==='ice'){
  for(let i=0;i<6;i++){const a=i*TAU/6;c.line(x,y,x+Math.cos(a)*rad,y+Math.sin(a)*rad,pal.light,3,fade);const xx=x+Math.cos(a)*rad,yy=y+Math.sin(a)*rad;c.line(xx-3,yy-4,xx+3,yy+4,pal.primary,2,fade);}
 }else if(kind==='flame'){
  for(let i=-2;i<=2;i++){const xx=x+i*10,hh=(21+(i%2)*9)*active;
   c.poly([[xx-7,y+10],[xx-2,y-hh*.6],[xx+3,y-hh-7],[xx+7,y+10]],i%2?pal.light:pal.primary,fade);}
 }else if(kind==='void'){
  c.ring(x,y,rad,pal.dark,7,Math.PI*.2,Math.PI*1.9,fade,1);c.ring(x+5,y-4,rad*.72,pal.light,3,-Math.PI*.5,Math.PI*.86,fade,1);
  c.star(x-10,y+3,7,pal.core,fade);
 }else{
  for(let i=0;i<6;i++){const a=i*TAU/6+t*1.5;const px=x+Math.cos(a)*rad,py=y+Math.sin(a)*rad;c.star(px,py,3+(i%2),i%2?pal.light:pal.primary,fade);}
  c.star(x,y,9,pal.light,fade);
 }
}
function chooseSpell(job,role,visualTheme){
 if(role==='rewind'||role==='slow'||job==='chronomancer')return 'clock';
 if(role==='chain'||role==='lightning_rod'||job==='stormcaller')return 'chain';
 if(role==='song'||role==='resonance'||job==='bard')return 'music';
 if(role==='star_field'||role==='mark'&&/stargazer|starweaver/.test(job))return 'star';
 if(role==='freeze'||role==='frost_field'||visualTheme==='ice')return 'ice';
 if(role==='ignite'||role==='fury'||visualTheme==='fire')return 'flame';
 if(['void','shadow'].includes(visualTheme))return 'void';
 return 'magic';
}
/** Renders a class's 4 different actions using the SAME palette as the ability icon.
 * Pixel phase count matches the frame-rate governor. No GPU shader requirement. */
function paintClassCombatV6(renderer,e,f){
 if(!renderer?.showEffects||!renderer?.ctx||!e||!['attack','skill'].includes(e.type))return false;
 if(!Number.isFinite(e.x)||!Number.isFinite(e.y))return false;
 const {job,skill,role,weapon,palette:pal}=skillArtIdentity(e);
 const [x,rawY,tx,ty]=worldClip(e),sy=rawY-21,ey=ty-19;
 const dx=tx-x,dy=ey-sy,angle=Math.atan2(dy,dx||1),power=skill==='ultimate'?1.3:1;
 const t=cap(f),actor=renderer.ctx;
 // Ground-situated effect, short bright contact, and pixels sized for actors.
 actor.save();actor.imageSmoothingEnabled=false;actor.lineCap='butt';actor.lineJoin='miter';
 const isLow=renderer.lowPower===true;
 const a=makeArtist(actor,pal);
 const seed=hash(job+':'+skill);
 const action=cap((t-.07)/.64),slashProg=ease(cap((t-.1)/.46));
 const fade=1-smooth((t-.63)/.37);
 const caster={x,y:sy,angle:angle-1.0+slashProg*1.65,pal};
 const isMelee=MELEE.test(weapon),isRanged=RANGED.test(weapon);
 const bladeKind=SCYTHE.test(weapon)?'scythe':AXE.test(weapon)?'axe':POKES.test(weapon)?'spear':TWIN.test(weapon)?'dagger':'sword';
 const spell=chooseSpell(job,role,skillVisual(job,skill).theme);
 // BASIC — readable physical weapon at the hand or an in-flight shot.
 if(skill==='basic'){
  if(isMelee&&!FIST.test(weapon)){
   const wind=t<.15?-1.05:ease(cap((t-.15)/.51))*2.4-1.05;
   if(TWIN.test(weapon)){
    blade(a,{...caster,x:x-7,y:sy+3,angle:angle+wind-.3},t,'dagger',.76);
    blade(a,{...caster,x:x+7,y:sy-5,angle:angle-wind+.5},t,'dagger',.69);
   }else blade(a,{...caster,angle:angle+wind},t,bladeKind,1);
   if(t>.13&&t<.78)paintSlash(a,{x,y:sy,angle:angle-.55,start:-.5,end:1.6,progress:slashProg,pal,scale:bladeKind==='axe'?1.2:1,scythe:bladeKind==='scythe'});
   if(t>.28)paintImpact(a,x+Math.cos(angle)*47,sy+Math.sin(angle)*34,t,pal,.6,seed);
  }else if(FIST.test(weapon)){
   for(let i=0;i<2;i++){const p=cap((t-.12-i*.1)/.4);a.rect(x+(i?12:-9)+Math.cos(angle)*p*33,sy-12+i*10,14,11,pal.primary,fade);a.star(x+Math.cos(angle)*(30+p*25),sy+(i-.5)*12,6,pal.light,fade);}
  }else{paintProjectile(a,{sx:x,sy,tx,ty:ey,t,pal,kind:isRanged?'arrow':spell==='chain'?'bolt':'magic',seed});}
  actor.restore();return true;
 }
 // Q — forward offensive identity: big spatial contact, different from E utility.
 if(skill==='skill1'){
  if(['mark','aim','pierce'].includes(role)){
   if(role==='pierce')paintProjectile(a,{sx:x,sy,tx,ty:ey,t,pal,kind:isRanged?'arrow':'bolt',strength:1.35,seed});
   else{spellGlyph(a,tx,ey,t,pal,role==='mark'&&job==='stargazer'?'star':'magic',seed);
    for(let i=0;i<4;i++){const aa=i*TAU/4+Math.PI/4,rad=24*(1+.2*slashProg);a.line(tx+Math.cos(aa)*rad,ey+Math.sin(aa)*rad,tx+Math.cos(aa)*(rad+11),ey+Math.sin(aa)*(rad+11),pal.light,3,fade);}}
  }else if(['weapon','dash','combo','cone','spin','drain','sunder','stagger','life','pull','push','execute'].includes(role)&&isMelee){
   if(['dash'].includes(role))paintAfterimage(a,x,sy,tx,ey,t,pal,seed);
   const reach=cap(Math.hypot(tx-x,ey-sy)/110,.25,1);
   const hx=lerp(x,tx,role==='dash'?.78:.45),hy=lerp(sy,ey,role==='dash'?.78:.45);
   if(TWIN.test(weapon)||role==='combo'){
    blade(a,{...caster,x:hx-6,y:hy,angle:angle-1.0+slashProg*2.1},t,'dagger',.9);
    if(t>.32)blade(a,{...caster,x:hx+7,y:hy+4,angle:angle+1.1-slashProg*2},t,'dagger',.7);
   }else blade(a,{...caster,x:hx,y:hy,angle:angle-.95+slashProg*2.1},t,bladeKind,1.1);
   if(t>.14)paintSlash(a,{x:tx,y:ey,angle:angle-.7,start:-.55,end:1.55,progress:slashProg,pal,scale:1.12,scythe:bladeKind==='scythe'});
   if(t>.31)paintImpact(a,tx,ey,t,pal,.83,seed);
  }else if(['ignite','freeze','blast','field','chain','resonance','slow','stagger'].includes(role)){
   if(role==='freeze'||role==='field')paintGround(a,tx,ty,t,pal,{radius:45,kind:spell==='ice'?'ice':spell==='flame'?'fire':'field',seed});
   else if(role==='ignite')paintGround(a,tx,ty,t,pal,{radius:42,kind:'fire',seed});
   paintProjectile(a,{sx:x,sy,tx,ty:ey,t,pal,kind:spell==='chain'?'bolt':'magic',seed});
   spellGlyph(a,tx,ey,t,pal,spell,seed);
  }else if(['command','resonance','mark'].includes(role))spellGlyph(a,tx,ey,t,pal,spell,seed);
  else{paintProjectile(a,{sx:x,sy,tx,ty:ey,t,pal,kind:isRanged?'arrow':'magic',seed});spellGlyph(a,tx,ey,t,pal,spell,seed);}
  actor.restore();return true;
 }
 // E — equipment/utility/stance/placement, never the universal generic shield.
 if(skill==='skill2'){
  if(['counter','parry','bastion'].includes(role))paintGuard(a,x,sy,t,pal,role==='parry'?'parry':'shield',seed);
  else if(['blink','smoke','leap_trap','charge'].includes(role)){
   paintAfterimage(a,x,sy,tx,ey,t,pal,seed,role);
   if(role==='leap_trap')paintDevice(a,tx,ty,t,pal,'trap',seed);
   if(role==='charge')paintSlash(a,{x:lerp(x,tx,.75),y:lerp(sy,ey,.75),angle,start:-1,end:1.1,progress:slashProg,pal,scale:1.1,scythe:SCYTHE.test(weapon)});
   if(role==='smoke')for(let i=0;i<6;i++){
    const xx=x+(random(seed+i*49)-.5)*50,yy=sy-10+(random(seed+i*71)-.5)*31;
    a.rect(xx,yy,11+i%3*3,7+i%2*3,pal.dark,fade*.43);
   }
  }else if(['trap','pet','turret','summon','lightning_rod'].includes(role))paintDevice(a,role==='turret'||role==='trap'?tx:x,role==='turret'||role==='trap'?ty:rawY,t,pal,role==='turret'?'turret':role==='trap'?'trap':'totem',seed);
  else if(['healing_field','healing','frost_field','star_field','song'].includes(role)){
   paintGround(a,x,rawY,t,pal,{radius:49,kind:role==='frost_field'?'ice':role==='star_field'?'field':'heal',seed});
   spellGlyph(a,x,sy-8,t,pal,spell,seed);
  }else if(['rewind','stance','meditate','brew','fury','rebirth','aim'].includes(role)){
   if(role==='rewind')paintAfterimage(a,x+42,sy,x,sy,t,pal,seed);
   if(role==='fury'||role==='rebirth')paintGround(a,x,rawY,t,pal,{radius:32,kind:'fire',seed});
   spellGlyph(a,x,sy-5,t,pal,role==='rewind'?'clock':spell,seed);
  }else{paintGround(a,x,rawY,t,pal,{radius:38,kind:'heal',seed});spellGlyph(a,x,sy,t,pal,spell,seed);}
  actor.restore();return true;
 }
 // R — distinctive FINISHER: dedicated center, aftershock and tier-controlled spark detail.
 if(skill==='ultimate'){
  const isSupport=['command','healing','song','summon'].includes(role);
  if(['weapon','execute','combo','spin','sunder','pierce','drain','stagger','dash','charge'].includes(role)&&isMelee){
   const hx=lerp(x,tx,.56),hy=lerp(sy,ey,.56);
   const endAngle=angle-1.3+ease(t)*3.0;
   blade(a,{...caster,x:hx,y:hy,angle:endAngle},t,bladeKind,1.26);
   if(t>.14){paintSlash(a,{x:hx,y:hy,angle:angle-.6,start:-1.1,end:1.9,progress:ease(cap((t-.12)/.52)),pal,scale:1.42,scythe:bladeKind==='scythe'});
    if(role==='combo'&&t>.35)paintSlash(a,{x:tx,y:ey,angle:angle+1.5,start:-.9,end:1.3,progress:ease(cap((t-.35)/.37)),pal,scale:.95});}
   if(t>.36)paintImpact(a,tx,ey,t,pal,1.25,seed);
  }else if(role==='execute'&&isRanged){
   paintProjectile(a,{sx:x,sy,tx,ty:ey,t,pal,kind:'arrow',strength:1.35,seed});
   if(t>.26){paintImpact(a,tx,ey,t,pal,1.3,seed);for(const sign of [-1,1])a.line(tx-24,ey+sign*11,tx+26,ey+sign*11,pal.light,2,fade);}
  }else if(['healing','command','song','rebirth','summon'].includes(role)){
   paintGround(a,x,rawY,t,pal,{radius:70,kind:role==='healing'?'heal':spell==='flame'?'fire':'field',seed});
   spellGlyph(a,x,sy-25,t,pal,spell,seed,1.4);
   if(role==='summon')for(let i=-1;i<=1;i++)paintDevice(a,x+i*43,rawY+(i%2)*12,t,pal,'totem',seed+i*51);
  }else if(['field','star_field','blast','delayed','chain','slow','mark'].includes(role)){
   paintGround(a,tx,ty,t,pal,{radius:69,kind:spell==='ice'?'ice':spell==='flame'?'fire':'field',seed});
   if(t>.25)paintImpact(a,tx,ey,t,pal,1.22,seed);
   spellGlyph(a,tx,ey-12,t,pal,spell,seed,1.35);
  }else{
   paintProjectile(a,{sx:x,sy,tx,ty:ey,t,pal,kind:isRanged?'arrow':'magic',strength:1.4,seed});
   paintGround(a,tx,ty,t,pal,{radius:54,kind:'field',seed});
  }
  if(!isLow&&t>.31&&t<.9){
   for(let i=0;i<8;i++){const xx=(isSupport?x:tx)+(random(seed+i*12)-.5)*100,yy=(isSupport?sy:ey)+(random(seed+i*21)-.5)*67;
    a.star(xx,yy,2+(i%3)*2,i%2?pal.primary:pal.light,fade*.7);}
  }
  actor.restore();return true;
 }
 actor.restore();return false;
}

// Bounded 20 fps bitmap caching: do not redraw dozens of vectors every
// animation frame. No persistent cache keys, no changes to multiplayer state.
const fxBanks=new WeakMap();
export function clearClassCombatVFX(renderer){fxBanks.delete(renderer);}
export function classCombatVFXStats(renderer){const b=fxBanks.get(renderer);return {frames:b?.frames.size||0,pixels:b?.pixels||0,renders:b?.renders||0};}
export function drawClassCombatVFX(renderer,e,f){
 if(!renderer?.ctx||!renderer.showEffects||!Number.isFinite(e?.x)||!Number.isFinite(e?.y))return false;
 // Legacy pixel-only contexts (and headless renderers) do not have Canvas2D
 // path operations. Hand over to the established PixelPainter fallback.
 if(typeof renderer.ctx.beginPath!=='function'||typeof renderer.ctx.ellipse!=='function')return false;
 const tx=Number.isFinite(e.tx)?e.tx:e.x,ty=Number.isFinite(e.ty)?e.ty:e.y;
 const left=Math.floor(Math.min(e.x,tx)-120),top=Math.floor(Math.min(e.y,ty)-143);
 const width=Math.ceil(Math.max(e.x,tx)-left+120),height=Math.ceil(Math.max(e.y,ty)-top+103);
 // Distant projectiles cannot allocate huge offscreen textures.
 if(width>690||height>600)return paintClassCombatV6(renderer,e,f);
 if(renderer.camera&&renderer.w&&renderer.h&&renderer.zoom){
  const hw=renderer.w/renderer.zoom/2+155,hh=renderer.h/renderer.zoom/2+155;
  if(left>renderer.camera.x+hw||left+width<renderer.camera.x-hw||top>renderer.camera.y+hh||top+height<renderer.camera.y-hh)return true;
 }
 const makeCanvas=renderer.createPixelCanvas|| (typeof OffscreenCanvas!=='undefined'?((w,h)=>new OffscreenCanvas(w,h)):
  typeof document!=='undefined'?((w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;}):null);
 if(!makeCanvas)return paintClassCombatV6(renderer,e,f);
 let bank=fxBanks.get(renderer);
 if(!bank){bank={frames:new Map(),pixels:0,renders:0};fxBanks.set(renderer,bank);}
 const key=String(e._pixelId??e.castId??`${e.id||''}:${e.born||0}:${e.skill||''}:${e.role||''}`);
 const rate=renderer.lowPower?14:22,slice=Math.floor(cap(f,0,.999999)*rate);
 const scale=renderer.lowPower?.5:1;
 const cw=Math.max(1,Math.ceil(width*scale)),ch=Math.max(1,Math.ceil(height*scale));
 let entry=bank.frames.get(key);
 if(entry&&(entry.width!==width||entry.height!==height||entry.left!==left||entry.top!==top||entry.scale!==scale)){
  bank.frames.delete(key);bank.pixels-=entry.area;entry=null;
 }
 if(!entry){
  const canvas=makeCanvas(cw,ch),ctx=canvas?.getContext?.('2d',{alpha:true});
  if(!ctx||typeof ctx.setTransform!=='function'||typeof ctx.clearRect!=='function')return paintClassCombatV6(renderer,e,f);
  entry={canvas,ctx,left,top,width,height,scale,area:cw*ch,slice:-1};
  bank.frames.set(key,entry);bank.pixels+=entry.area;
 }
 if(entry.slice!==slice){
  entry.ctx.setTransform(1,0,0,1,0,0);entry.ctx.clearRect(0,0,cw,ch);
  entry.ctx.setTransform(scale,0,0,scale,-left*scale,-top*scale);
  paintClassCombatV6({ctx:entry.ctx,showEffects:true,lowPower:renderer.lowPower},e,(slice+.5)/rate);
  entry.slice=slice;bank.renders++;
 }
 bank.frames.delete(key);bank.frames.set(key,entry);
 const limit=renderer.lowPower?12:25,maxPixels=renderer.lowPower?800000:2000000;
 while(bank.frames.size>limit||bank.pixels>maxPixels){const id=bank.frames.keys().next().value;if(id===undefined)break;const old=bank.frames.get(id);bank.frames.delete(id);bank.pixels-=old.area;}
 renderer.ctx.save();renderer.ctx.imageSmoothingEnabled=false;
 renderer.ctx.drawImage(entry.canvas,left,top,width,height);renderer.ctx.restore();
 return true;
}
