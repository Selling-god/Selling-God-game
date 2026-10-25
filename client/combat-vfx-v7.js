/** STARFALL V7: action-specific pixel combat choreography.
 * Four genuinely distinct silhouettes per class. The ability ID is the input;
 * role only provides a fallback. All damage and persistence remain server side.
 * Geometry is painted in pixel-snapped layers and cached at 18-22 fps.
 */
import {KITS} from '../shared/combat-kits.js';
import {skillVisual} from '../shared/visuals.js';
import {jobArtProfile} from './job-signatures.js';
import {skillButtonPalette} from './combat-vfx-v6.js';
export const VFX_V7_VERSION='pixel-stage-20261025-1';
const TAU=Math.PI*2, PI=Math.PI;
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,Number(x)||0));
const ease=t=>1-(1-clamp(t))**3;
const smooth=t=>{t=clamp(t);return t*t*(3-2*t);};
const mix=(a,b,t)=>a+(b-a)*t;
const rand=(seed,k=1)=>{let x=(seed+Math.imul(k,0x9e3779b9))|0;x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
const hash=s=>[...String(s)].reduce((h,c)=>(Math.imul(h,33)^c.charCodeAt())>>>0,2166136261);
const norm=(x,y)=>{const d=Math.hypot(x,y)||1;return [x/d,y/d];};
const weaponType=weapon=>/낫/.test(weapon)?'scythe':/도끼|곡괭이/.test(weapon)?'axe':/창|삼지창|깃창/.test(weapon)?'spear':/단검|발톱|쌍검/.test(weapon)?'dagger':/검|칼/.test(weapon)?'sword':/권갑/.test(weapon)?'fist':/활|쇠뇌/.test(weapon)?'bow':'magic';
const qPhysical=new Set(['cleave','backstab','charge','combo_strike','armor_crack','bloodspin','holy_cut','shield_bash','piercing_shot','rune_combo','rune_slam','shadow_blades','dragon_charge','command_slash','rift_cut','soul_reap','royal_command']);
const eMobility=new Set(['leap_trap','mana_blink','smoke_step','mirror_step','void_blink','eclipse_dash','dragon_wings']);
const flameJobs=new Set(['pyromancer','phoenix_heir','dragonknight']);
const iceJobs=new Set(['cryomancer']);
function painter(c,p){
 const snap=x=>Math.round(x);
 const rect=(x,y,w,h,col=p.primary,alpha=1)=>{if(w<=0||h<=0||alpha<=0)return;c.globalAlpha=clamp(alpha);c.fillStyle=col;c.fillRect(snap(x),snap(y),Math.max(1,snap(w)),Math.max(1,snap(h)));};
 const path=(points,closed=true)=>{if(points.length<2)return;c.beginPath();c.moveTo(snap(points[0][0]),snap(points[0][1]));for(const pt of points.slice(1))c.lineTo(snap(pt[0]),snap(pt[1]));if(closed)c.closePath();};
 const poly=(points,col=p.primary,alpha=1)=>{if(points.length<3||alpha<=0)return;c.globalAlpha=clamp(alpha);c.fillStyle=col;path(points);c.fill();};
 const line=(ax,ay,bx,by,col=p.primary,w=3,alpha=1)=>{if(alpha<=0)return;c.globalAlpha=clamp(alpha);c.strokeStyle=col;c.lineWidth=Math.max(1,w);c.lineCap='square';c.lineJoin='bevel';path([[ax,ay],[bx,by]],false);c.stroke();};
 const stroke=(pts,col=p.primary,w=3,alpha=1,closed=false)=>{if(pts.length<2||alpha<=0)return;c.globalAlpha=clamp(alpha);c.strokeStyle=col;c.lineWidth=w;c.lineJoin='bevel';c.lineCap='square';path(pts,closed);c.stroke();};
 const ellipse=(x,y,r,col=p.primary,w=3,alpha=1,ry=.68,start=0,end=TAU)=>{if(alpha<=0||r<=0)return;c.globalAlpha=clamp(alpha);c.strokeStyle=col;c.lineWidth=w;c.beginPath();c.ellipse(snap(x),snap(y),Math.max(1,snap(r)),Math.max(1,snap(r*ry)),0,start,end);c.stroke();};
 const disk=(x,y,r,col=p.primary,alpha=1,ry=1)=>{if(alpha<=0||r<=0)return;c.globalAlpha=clamp(alpha);c.fillStyle=col;c.beginPath();c.ellipse(snap(x),snap(y),Math.max(1,snap(r)),Math.max(1,snap(r*ry)),0,0,TAU);c.fill();};
 const star=(x,y,r=7,col=p.light,alpha=1)=>poly([[x,y-r],[x+r*.22,y-r*.22],[x+r,y],[x+r*.2,y+r*.22],[x,y+r],[x-r*.2,y+r*.22],[x-r,y],[x-r*.22,y-r*.2]],col,alpha);
 const glitter=(x,y,n=10,r=55,f=1,seed=3)=>{for(let i=0;i<n;i++){const a=rand(seed,i*47+1)*TAU,rr=r*(.14+.9*rand(seed,i*31+2))*ease(f),size=i%4===0?4:2;rect(x+Math.cos(a)*rr,y+Math.sin(a)*rr*.68-size,size,size,i%6===0?p.core:i%2?p.light:p.primary,(1-f*.55)*(.5+.5*rand(seed,i*17)));}};
 const glow=(fn,blur=7)=>{c.save();c.shadowColor=p.primary;c.shadowBlur=blur;fn();c.restore();};
 return {c,p,rect,poly,line,stroke,ellipse,disk,star,glitter,glow};
}
function angles(x,y,tx,ty){const d=Math.atan2(ty-y,tx-x);return {d,ux:Math.cos(d),uy:Math.sin(d),nx:-Math.sin(d),ny:Math.cos(d)};}
function at(x,y,a,r,normal=0){return [x+Math.cos(a)*r-Math.sin(a)*normal,y+Math.sin(a)*r+Math.cos(a)*normal];}
function pointLine(a,x,y,tx,ty,p,alpha=1,w=5){a.line(x,y,tx,ty,p.dark,w+5,alpha*.7);a.line(x,y,tx,ty,p.primary,w,alpha);a.line(x+1,y-1,tx+1,ty-1,p.light,Math.max(2,w*.32),alpha);}
function sparkBurst(a,x,y,f,seed,size=24,count=12){const {p}=a;const appear=clamp((f-.14)*3);const fade=clamp((1-f)*2.0);if(!appear||!fade)return;
 a.star(x,y,size*(1-ease(clamp((f-.3)*2))*.8),p.core,fade);
 for(let i=0;i<count;i++){const angle=TAU*i/count+rand(seed,i)*.3,r=(6+size*2*ease(f))*rand(seed,i+11);const px=x+Math.cos(angle)*r,py=y+Math.sin(angle)*r*.73;a.line(px,py,px+Math.cos(angle)*9,py+Math.sin(angle)*7,i%3===0?p.core:i%2?p.primary:p.light,i%4===0?4:2,fade*.86);}
}
function dust(a,x,y,f,seed=1,n=9,rx=62){a.glitter(x,y,n,rx,f,seed);}
function roundHalo(a,x,y,r,f=1,width=3){const {p}=a;const grow=ease(clamp(f*1.7));a.ellipse(x,y,r*grow,p.dark,width+6,.45, .55);a.ellipse(x,y,r*grow,p.primary,width,.7,.55);a.ellipse(x,y,r*.72*grow,p.light,2,.7,.55);}
function swingRibbon(a,x,y,f,baseAngle,kind='sword',rank=1,scale=1){
 const {p}=a,phase=clamp((f-.13)/.56);if(phase<=0)return;
 const style={sword:[56,1.65,13],dagger:[44,2.2,9],axe:[58,1.38,18],scythe:[79,2.6,17],spear:[58,.75,6],fist:[40,1.15,9]}[kind]||[55,1.8,11];
 const [radius,span,thick]=style,arc=baseAngle-span*.55+span*ease(phase),start=arc-(.37+rank*.05),r=radius*scale;
 const pts=(rad,s,e)=>{const out=[];for(let j=0;j<=16;j++){const ang=mix(s,e,j/16);out.push([x+Math.cos(ang)*rad,y+Math.sin(ang)*rad*.77]);}return out;};
 const taper=(r0,r1,color,alpha)=>{const first=pts(r0,start,arc),back=pts(r1,arc,start);a.poly([...first,...back],color,alpha);};
 const alpha=clamp((1-f)*2.7);taper(r+8,r-thick-6,p.dark,alpha*.64);taper(r+3,r-thick-1,p.primary,alpha*.92);taper(r-1,r-thick*.55,p.light,alpha*.94);taper(r-3,r-thick*.7,p.core,alpha*.85);
 if(rank>=2)taper(r+8,r+4,p.light,alpha*.38);
 const tip=at(x,y,arc,r,0);a.star(...tip,7+rank,p.core,alpha);
 if(rank>=3){const arc2=arc-.27;for(let j=0;j<7;j++){const aa=arc2-j*.12;const rr=r+12+j*3;a.rect(x+Math.cos(aa)*rr,y+Math.sin(aa)*rr*.76,3+j%3,3,p.light,alpha*(1-j/8));}}
}
function holdWeapon(a,x,y,angle,kind,pow=1,f=1){const {p}=a;
 const len=(kind==='scythe'?68:kind==='spear'?72:kind==='axe'?54:kind==='dagger'?35:58)*pow;
 const origin=at(x,y,angle,-14),mid=at(x,y,angle,8),tip=at(x,y,angle,len);
 a.line(...origin,...tip,p.shadow,kind==='scythe'?9:7,f);a.line(...origin,...tip,kind==='scythe'||kind==='axe'?'#c3a987':p.primary,kind==='scythe'?5:4,f);
 a.line(...at(x,y,angle,-4),...at(x,y,angle,len*.78),p.light,2,f);
 if(kind==='sword'||kind==='dagger'){
  const s=kind==='dagger'?.55:1;
  a.poly([at(x,y,angle,7,-6*s),at(x,y,angle,len,0),at(x,y,angle,7,6*s)],p.dark,f);
  a.poly([at(x,y,angle,8,-4*s),at(x,y,angle,len+9*s,0),at(x,y,angle,8,3*s)],p.light,f);
  a.line(...at(x,y,angle,6,-11*s),...at(x,y,angle,6,11*s),p.shadow,7*s,f);
  a.line(...at(x,y,angle,6,-9*s),...at(x,y,angle,6,9*s),p.core,3*s,f);
 }else if(kind==='spear'){
  a.poly([at(x,y,angle,len-15,-9),at(x,y,angle,len+17,0),at(x,y,angle,len-15,9)],p.dark,f);
  a.poly([at(x,y,angle,len-12,-5),at(x,y,angle,len+15,0),at(x,y,angle,len-12,5)],p.light,f);
 }else if(kind==='axe'){
  a.poly([at(x,y,angle,len-12,-25),at(x,y,angle,len+16,-25),at(x,y,angle,len+23,-14),at(x,y,angle,len+23,12),at(x,y,angle,len+14,25),at(x,y,angle,len-12,22)],p.dark,f);
  a.poly([at(x,y,angle,len-9,-21),at(x,y,angle,len+13,-21),at(x,y,angle,len+19,-12),at(x,y,angle,len+19,12),at(x,y,angle,len+11,20),at(x,y,angle,len-9,18)],p.primary,f);
  a.line(...at(x,y,angle,len+17,-15),...at(x,y,angle,len+18,15),p.core,4,f);
 }else if(kind==='scythe'){
  const blade=[];for(let k=0;k<=14;k++){const ang=angle-2.25+(k/14)*2.3,rr=52-(k/14)*20;blade.push([tip[0]+Math.cos(ang)*rr,tip[1]+Math.sin(ang)*rr]);}
  a.poly([at(x,y,angle,len-9),...blade],p.dark,f);a.stroke(blade,p.primary,8,f);a.stroke(blade.slice(2,-2),p.light,4,f);a.line(...blade[0],...blade[1],p.core,2,f);
 }
}
function weaponAction(a,e,f,style,kind,rank){const {p}=a;const sx=e.x,sy=e.y-29,tx=e.tx??sx+45,ty=(e.ty??e.y)-23;const A=angles(sx,sy,tx,ty);const q=clamp((f-.11)/.68),motion=ease(q),power=style==='ultimate'?1.35:style==='skill1'?1.07:.74;
 const center=style==='ultimate'?[mix(sx,tx,.52),mix(sy,ty,.52)]:style==='basic'?[sx,sy]:[mix(sx,tx,.32),mix(sy,ty,.32)];
 const facing=A.d+mix(-1.45,1.42,motion);
 if(kind==='fist'){
  for(let j=0;j<(style==='ultimate'?7:style==='basic'?2:3);j++){
   const delay=j*.08,t=clamp((f-.12-delay)/.55);if(t<=0)continue;
   const punch=at(center[0],center[1],A.d,(10+38*ease(t))*power,(j%2?10:-10));
   a.poly([[punch[0]-10,punch[1]-8],[punch[0]+10,punch[1]-8],[punch[0]+12,punch[1]+9],[punch[0]-9,punch[1]+11]],j%2?p.primary:p.light,(1-t*.8));
   if(t>.4)sparkBurst(a,punch[0]+A.ux*16,punch[1]+A.uy*11,t,hash(e.job)+j,13);
  }
 }else if(kind==='bow'){
  const bowx=center[0]+A.ux*6,bowy=center[1]+A.uy*6;
  const arm=at(bowx,bowy,A.d+PI/2,21*power),arm2=at(bowx,bowy,A.d-PI/2,21*power);
  a.stroke([arm,at(bowx,bowy,A.d,15*power),arm2],p.dark,8,.9);a.stroke([arm,at(bowx,bowy,A.d,15*power),arm2],p.primary,4,.9);
  a.line(...arm,...arm2,p.light,2,.9);
 }else{
  if(style==='skill1'&&/쌍|단검/.test(jobArtProfile(e.job).weapon)){
   holdWeapon(a,center[0]-10,center[1]+4,facing-.38,'dagger',power,.95);
   holdWeapon(a,center[0]+10,center[1]-5,A.d+1.3-motion*2,'dagger',power,.9);
  }else holdWeapon(a,...center,facing,kind,power,.97);
  if(f>.15&&f<.94){swingRibbon(a,...center,f,A.d+(kind==='scythe'?-.3:0),kind,rank,power);
   if(style==='ultimate'&&f>.35)swingRibbon(a,center[0]+A.ux*21,center[1]+A.uy*12,clamp((f-.27)/.66),A.d+.55,kind,rank,power*.89);}
 }
 if(f>.26&&f<.96)sparkBurst(a,tx,ty,f,hash(e.job+':'+e.skill),12+14*power,style==='ultimate'?18:11);
}
function flight(a,sx,sy,tx,ty,f,shape='orb',seed=13,power=1){const {p}=a;const v=clamp((f-.1)/.61),pos=[mix(sx,tx,ease(v)),mix(sy,ty,ease(v))],vx=tx-sx,vy=ty-sy;const [ux,uy]=norm(vx,vy),nx=-uy,ny=ux;
 if(f<.12){a.star(sx,sy,14*power,p.light,.7);return;}
 if(v>=1){sparkBurst(a,tx,ty,f,seed,19*power);return;}
 for(let i=7;i>=0;i--){const d=i*9*power,x=pos[0]-ux*d,y=pos[1]-uy*d;a.rect(x-3,y-3,Math.max(2,8-i*.8),Math.max(2,8-i*.8),i%2?p.primary:p.light,(.9-i*.09)*clamp(1-v*.4));}
 if(shape==='arrow'){
  const st=[pos[0]-ux*26,pos[1]-uy*26],en=[pos[0]+ux*14,pos[1]+uy*14];pointLine(a,...st,...en,p,1,5);
  a.poly([[en[0]+ux*10,en[1]+uy*10],[en[0]-ux*5+nx*7,en[1]-uy*5+ny*7],[en[0]-ux*5-nx*7,en[1]-uy*5-ny*7]],p.core);
  a.line(st[0]+nx*6,st[1]+ny*6,st[0]-nx*6,st[1]-ny*6,p.light,3);
 }else if(shape==='lightning'){
  const path=[];for(let j=0;j<7;j++){const d=j*10,r=(j%2?8:-7)*power;path.push([pos[0]-ux*d+nx*r,pos[1]-uy*d+ny*r]);}
  a.stroke(path,p.dark,10);a.stroke(path,p.primary,6);a.stroke(path,p.core,3);
 }else if(shape==='flame'){
  a.disk(...pos,15*power,p.dark,.9);a.disk(...pos,12*power,p.primary,.98);a.disk(pos[0]+3,pos[1]-3,7*power,p.core,.95);
  for(let j=0;j<5;j++){const theta=j*TAU/5+v*4;const xx=pos[0]+Math.cos(theta)*18,yy=pos[1]+Math.sin(theta)*14;a.poly([[xx-5,yy+5],[xx+4,yy-16],[xx+7,yy+5]],p.light,.7);}
 }else if(shape==='ice'){
  const pt=[[pos[0]-14,pos[1]],[pos[0],pos[1]-22],[pos[0]+13,pos[1]],[pos[0],pos[1]+13]];
  a.poly(pt,p.dark);a.poly([[pos[0]-8,pos[1]],[pos[0],pos[1]-17],[pos[0]+8,pos[1]],[pos[0],pos[1]+9]],p.primary);a.line(pos[0]-2,pos[1]-13,pos[0]-2,pos[1]+6,p.core,3);
 }else{a.star(...pos,15*power,p.primary,.88);a.star(pos[0]-2,pos[1]-2,8*power,p.core,.98);}
}
function waves(a,x,y,f,kind='magic',power=1,seed=0){const {p}=a;const r=(24+52*ease(f))*power,alpha=clamp((1-f)*2.7);
 a.ellipse(x,y,r+4,p.dark,8,alpha*.55,.58);a.ellipse(x,y,r,p.primary,5,alpha,.58);a.ellipse(x,y,r*.73,p.light,2,alpha*.7,.58);
 if(kind==='flame')for(let i=0;i<8;i++){const ang=i*TAU/8;const px=x+Math.cos(ang)*r*.78,py=y+Math.sin(ang)*r*.48;a.poly([[px-8,py+5],[px+1,py-17-11*ease(f)],[px+9,py+4]],i%2?p.light:p.primary,alpha*.8);}
 if(kind==='ice')for(let i=0;i<8;i++){const ang=i*TAU/8,px=x+Math.cos(ang)*r*.64,py=y+Math.sin(ang)*r*.47;a.poly([[px-7,py+6],[px,py-27-7*ease(f)],[px+7,py+5]],i%2?p.light:p.primary,alpha);}
 if(kind==='nature')for(let i=0;i<7;i++){const ang=i*TAU/7+f;const px=x+Math.cos(ang)*r*.61,py=y+Math.sin(ang)*r*.45;a.poly([[px,py],[px+8,py-11],[px+17,py-6],[px+10,py+3]],p.light,alpha*.9);}
 dust(a,x,y,f,seed,6,r);
}
function glyph(a,x,y,f,kind='star',power=1){const {p}=a;const r=26*power,angle=f*.65;
 if(kind==='time'){
  a.ellipse(x,y,r+4,p.dark,7,.85,1);a.ellipse(x,y,r,p.primary,4,.95,1);
  for(let i=0;i<12;i++){const t=i*TAU/12;a.line(x+Math.cos(t)*r*.79,y+Math.sin(t)*r*.79,x+Math.cos(t)*r*.91,y+Math.sin(t)*r*.91,p.light,2);}
  a.line(x,y,x+Math.cos(f*TAU)*r*.73,y+Math.sin(f*TAU)*r*.73,p.core,4);a.line(x,y,x-Math.sin(f*2)*r*.38,y-Math.cos(f*2)*r*.38,p.primary,4);
 }else if(kind==='shield'){
  a.poly([[x,y-r-3],[x-r*.85,y-r*.65],[x-r*.7,y+r*.55],[x,y+r],[x+r*.7,y+r*.55],[x+r*.85,y-r*.65]],p.dark,.92);
  a.stroke([[x,y-r-3],[x-r*.85,y-r*.65],[x-r*.7,y+r*.55],[x,y+r],[x+r*.7,y+r*.55],[x+r*.85,y-r*.65]],p.primary,6,.98,true);
  a.line(x,y-r*.58,x,y+r*.61,p.light,3);a.line(x-r*.45,y-r*.1,x+r*.45,y-r*.1,p.core,3);
 }else if(kind==='music'){
  for(let i=0;i<5;i++)a.line(x-r*1.5,y-r*.7+i*9,x+r*1.5,y-r*.7+i*9,p.dark,2,.8);
  for(let i=0;i<4;i++){const xx=x+(i-1.5)*19,yy=y-4+(i%3)*9-r*.45*f;a.disk(xx,yy,5,p.light);a.line(xx+5,yy,xx+5,yy-21,p.primary,4);a.line(xx+5,yy-21,xx+16,yy-17,p.core,2);}
 }else if(kind==='cross'){
  a.rect(x-5,y-25,11,50,p.light,.95);a.rect(x-25,y-5,50,11,p.light,.95);a.rect(x-2,y-20,5,39,p.core);
 }else{
  const sides=kind==='rune'?6:kind==='constellation'?7:5;
  const points=[];for(let i=0;i<sides*2;i++){const t=i*PI/sides+angle;const rr=i%2?r*.42:r;points.push([x+Math.cos(t)*rr,y+Math.sin(t)*rr]);}
  a.stroke(points,p.dark,8,.72,true);a.stroke(points,p.primary,4,.9,true);a.star(x,y,9,p.core,.88);
 }
}
function drawWolf(a,x,y,f,seed,scale=1,ghost=false){const {p}=a;const alpha=ghost?.61:.98,hop=Math.sin(f*PI)*8;
 const P=(xx,yy)=>[x+xx*scale,y+yy*scale-hop];
 a.poly([P(-20,8),P(-25,-1),P(-13,-13),P(10,-14),P(20,-9),P(27,-20),P(31,-4),P(26,10),P(6,13),P(-10,13)],p.dark,alpha);
 a.poly([P(-16,7),P(-18,-3),P(-7,-10),P(13,-9),P(20,0),P(15,8)],p.primary,alpha);
 for(const z of [-12,12]){a.line(...P(z,7),...P(z-3,22),p.dark,6*scale,alpha);a.line(...P(z-1,9),...P(z-4,21),p.light,2*scale,alpha);}
 a.poly([P(12,-7),P(19,-24),P(24,-10)],p.light,alpha);a.rect(x+23*scale,y-5*scale-hop,4*scale,3*scale,p.core,alpha);
 a.line(...P(-21,-2),...P(-32,-15),p.light,4*scale,alpha);
}
function skeleton(a,x,y,f,seed,s=1){const {p}=a,hop=Math.sin(f*PI)*7,cy=y-hop;
 a.disk(x,cy-27*s,12*s,p.dark);a.disk(x,cy-28*s,9*s,p.light);for(const dx of [-5,4])a.rect(x+dx*s-2,cy-31*s,4*s,5*s,p.shadow);a.line(x,cy-16*s,x,cy+6*s,p.light,5*s);
 for(const dx of [-8,0,8])a.line(x-10*s,cy-8*s+dx*s*.18,x+10*s,cy-8*s+dx*s*.18,p.primary,3*s);
 for(const d of [-1,1]){a.line(x+d*9*s,cy-13*s,x+d*14*s,cy+6*s,p.light,4*s);a.line(x+d*5*s,cy+7*s,x+d*10*s,cy+24*s,p.light,4*s);}
 a.star(x+15*s,cy-33*s,3*s,p.core,.8);
}
function turret(a,x,y,f,seed,solar=false){const {p}=a,drop=(1-ease(f))*(-35);
 a.ellipse(x,y+8,26,p.dark,7,.9,.44);
 a.poly([[x-21,y],[x-15,y-17+drop],[x+14,y-17+drop],[x+24,y]],p.dark,.98);
 a.poly([[x-15,y-4],[x-10,y-15+drop],[x+9,y-15+drop],[x+15,y-4]],p.primary);
 a.rect(x-12,y-18+drop,24,7,p.light);a.line(x+6,y-13+drop,x+36,y-16+drop,p.dark,12);a.line(x+6,y-15+drop,x+37,y-17+drop,p.light,6);
 for(const d of [-1,1]){a.rect(x+d*15-5,y-1,10,8,p.shadow);a.rect(x+d*15-4,y,8,4,p.primary);}
 a.disk(x-5,y-9+drop,4,p.core);
 if(solar)for(let i=0;i<8;i++){const theta=TAU*i/8;const px=x-4+Math.cos(theta)*18,py=y-13+drop+Math.sin(theta)*18;a.line(px,py,px+Math.cos(theta)*9,py+Math.sin(theta)*9,p.light,3,.8);}
 else sparkBurst(a,x+39,y-16+drop,f,seed,12,8);
}
function banner(a,x,y,f,royal=false){const {p}=a;a.line(x-12,y+26,x-12,y-61,p.dark,10);a.line(x-13,y+24,x-13,y-60,p.core,4);
 const sway=Math.sin(f*10)*8;a.poly([[x-10,y-62],[x+34+sway,y-55],[x+19+sway,y-30],[x+35+sway,y-7],[x-10,y-15]],p.dark,.98);
 a.poly([[x-8,y-58],[x+27+sway,y-51],[x+12+sway,y-32],[x+28+sway,y-13],[x-8,y-20]],p.primary,.98);
 glyph(a,x+8+sway*.7,y-35,f,royal?'star':'cross',.48);a.star(x-12,y-62,7,p.light);
}
function tree(a,x,y,f,seed,wide=false){const {p}=a,grow=ease(clamp(f*2));const height=wide?69:49;
 a.line(x,y,x,y-height*grow,p.dark,wide?15:11);a.line(x+2,y-1,x+2,y-height*grow,p.primary,wide?9:6);
 for(let j=0;j<(wide?11:7);j++){const ang=TAU*j/7+rand(seed,j)*.6,xx=x+Math.cos(ang)*(wide?41:26)*grow,yy=y-height*.7+Math.sin(ang)*25*grow;
  a.poly([[xx-13*grow,yy],[xx,yy-21*grow],[xx+13*grow,yy]],p.dark);
  a.poly([[xx-10*grow,yy],[xx,yy-15*grow],[xx+10*grow,yy]],j%2?p.light:p.primary);}
 roundHalo(a,x,y,wide?46:32,f,3);
}
function crystalWall(a,x,y,f,count=5){const {p}=a,g=ease(clamp(f*2.8));
 for(let j=0;j<count;j++){const xx=x+(j-(count-1)/2)*20,hh=(35+(j%3)*17)*g;
  a.poly([[xx-13,y+8],[xx-10,y-hh*.66],[xx,y-hh],[xx+10,y-hh*.52],[xx+13,y+8]],p.dark,.97);
  a.poly([[xx-8,y+3],[xx-6,y-hh*.62],[xx,y-hh*.9],[xx+3,y+3]],p.primary,.98);
  a.line(xx-4,y-hh*.53,xx+1,y-hh*.83,p.core,3);
 }roundHalo(a,x,y,58,f,3);
}
function potion(a,x,y,f,seed,volatile=false){const {p}=a;const float=Math.sin(f*PI)*15;
 a.poly([[x-9,y-34-float],[x+8,y-34-float],[x+8,y-22-float],[x+22,y+1-float],[x+13,y+17-float],[x-13,y+17-float],[x-22,y+1-float],[x-9,y-22-float]],p.dark,.9);
 a.poly([[x-9,y-4-float],[x+9,y-4-float],[x+16,y+9-float],[x+11,y+13-float],[x-10,y+13-float],[x-16,y+8-float]],p.primary,.9);
 a.line(x-9,y-32-float,x+8,y-32-float,p.core,6);a.rect(x-13,y-41-float,26,7,'#cfa971');
 a.star(x-4,y+2-float,5,p.core);
 for(let j=0;j<6;j++){const dy=(f*.7+(j/6))%1;const xx=x+(rand(seed,j)-.5)*34;a.disk(xx,y-10-float-dy*55,2+j%3,p.light,.7);}
 if(volatile)roundHalo(a,x,y,43,f,3);
}
function radialLightning(a,x,y,f,seed,big=false){const {p}=a;const count=big?7:4;for(let j=0;j<count;j++){
  const theta=j*TAU/count+.3,r=(big?70:46)*ease(f);
  const path=[[x,y-10],[x+Math.cos(theta)*r*.34+9,y-10+Math.sin(theta)*r*.30],[x+Math.cos(theta)*r*.52-7,y-10+Math.sin(theta)*r*.49],[x+Math.cos(theta)*r,y-10+Math.sin(theta)*r]];
  a.stroke(path,p.dark,10,.95);a.stroke(path,p.primary,6,.95);a.stroke(path,p.core,2,.95);
 }sparkBurst(a,x,y-10,f,seed,15,big?21:10);
}
function drawUtility(a,e,f,ability,rank){const {p}=a,x=e.x,y=e.y-22,tx=e.tx??x,ty=(e.ty??e.y)-11,seed=hash(e.job+ability),n=ease(clamp(f*2));
 // Every E action has a specific world object / readable pose. Only actual travel
 // utilities draw displacement afterimages; supports and constructions never do.
 switch(ability){
  case 'guard_counter':case 'spear_parry':case 'royal_guard':case 'aegis_sanctuary':case 'rune_bastion':case 'fortress':{
   if(ability==='fortress'||ability==='rune_bastion')crystalWall(a,x,y+20,f,ability==='fortress'?6:4);
   else glyph(a,x,y-7,f,'shield',ability==='royal_guard'?1.45:1.12);
   if(ability==='spear_parry')holdWeapon(a,x-13,y+15,-.78,'spear',.85);
   if(ability==='aegis_sanctuary')for(const dx of [-33,33])glyph(a,x+dx,y-5,f,'cross',.5);
   if(ability==='royal_guard')a.star(x,y-54,12,p.core);
   sparkBurst(a,x+30,y-4,f,seed,14);break;}
  case 'leap_trap':case 'rock_mine':case 'flame_mine':{
   const xx=ability==='leap_trap'?tx:x+26,yy=ability==='leap_trap'?ty:y+28;
   a.disk(xx,yy,19,p.dark,.8,.4);for(let j=0;j<6;j++){const theta=j*TAU/6;const px=xx+Math.cos(theta)*13,py=yy+Math.sin(theta)*11;
    a.poly([[px-5,py+4],[px,py-11-5*n],[px+5,py+4]],ability==='flame_mine'?p.primary:p.light);}
   a.star(xx,yy-8,8,p.core);if(ability==='flame_mine')waves(a,xx,yy,f,'flame',.56,seed);
   if(ability==='leap_trap')for(let i=0;i<4;i++)a.rect(x-i*11,y-i*4,11,6,p.light,.52-i*.12);
   break;}
  case 'mana_blink':case 'void_blink':case 'smoke_step':case 'mirror_step':case 'eclipse_dash':case 'dragon_wings':{
   const portals=ability.includes('blink');const xx=clamp(Math.hypot(tx-x,ty-y),0,280)>20?tx:x+46;
   if(portals){for(const d of [0,1]){const cx=d?xx:x;a.ellipse(cx,y-8,22+f*8,p.dark,12,.7,1.3);a.ellipse(cx,y-8,19+f*8,p.primary,5,.96,1.3);a.star(cx,y-10,7,p.core,.7);}}
   else for(let i=0;i<4;i++){const alpha=(.56-i*.1)*(1-f*.55);const px=mix(x,xx,(i+1)/5);a.poly([[px-12,y+7],[px-11,y-27],[px+10,y-31],[px+11,y+7]],p.primary,alpha);}
   if(ability==='smoke_step'||ability==='mirror_step')for(let i=0;i<8;i++){const xx2=x+(rand(seed,i)-.5)*60,yy2=y+(rand(seed,i+14)-.5)*45;a.disk(xx2,yy2,9+i%3*3,p.dark,.27);}
   if(ability==='eclipse_dash')swingRibbon(a,xx,y,f,.2,'scythe',rank,1.12);
   if(ability==='dragon_wings')wings(a,xx,y,f,1.2);
   break;}
  case 'prayer_circle':case 'herb_garden':case 'tree_of_life':case 'tidal_pool':{
   const theme=ability==='tidal_pool'?'water':ability==='herb_garden'||ability==='tree_of_life'?'nature':'holy';waves(a,x,y+23,f,theme,1.0,seed);
   if(ability==='tree_of_life')tree(a,x,y+30,f,seed,true);
   else if(ability==='herb_garden')for(let i=0;i<5;i++){const theta=i*TAU/5;tree(a,x+Math.cos(theta)*30,y+20+Math.sin(theta)*18,f,seed+i,false);}
   else if(ability==='prayer_circle')glyph(a,x,y-18,f,'cross',1.12);
   else for(let i=0;i<6;i++){const t=i*TAU/6+f;const xx=x+Math.cos(t)*28,yy=y+Math.sin(t)*14+11;a.disk(xx,yy,7,p.light,.8,.55);}
   break;}
  case 'meditation':case 'blood_oath':case 'focus_aim':case 'rune_switch':case 'stance_cycle':case 'alchemical_brew':case 'rewind':case 'phoenix_heart':{
   if(ability==='meditation'){for(let i=0;i<7;i++){const theta=i*TAU/7+f,px=x+Math.cos(theta)*32,py=y+Math.sin(theta)*20;a.disk(px,py,5,p.light,.9);}glyph(a,x,y-9,f,'cross',.7);}
   else if(ability==='blood_oath'){for(let i=0;i<4;i++){const theta=i*TAU/4+f*2;const px=x+Math.cos(theta)*33,py=y+Math.sin(theta)*28;a.poly([[px-8,py+8],[px,py-16-12*n],[px+8,py+8]],p.primary);}waves(a,x,y+20,f,'flame',.64,seed);}
   else if(ability==='focus_aim'){glyph(a,tx,ty-10,f,'time',1.3);a.line(x,y,tx,ty-9,p.core,2,.35);for(let i=0;i<4;i++)a.line(tx-40+i*23,ty-35,tx-40+i*23,ty-25,p.light,2,.9);}
   else if(ability==='rune_switch'){for(let i=0;i<3;i++){const theta=i*TAU/3+f*2,xx=x+Math.cos(theta)*30,yy=y+Math.sin(theta)*23;glyph(a,xx,yy,f,'rune',.45);}}
   else if(ability==='stance_cycle'){for(let i=0;i<2;i++){const theta=i*PI+f*4,xx=x+Math.cos(theta)*26,yy=y+Math.sin(theta)*26;glyph(a,xx,yy,f,'star',.7);}}
   else if(ability==='alchemical_brew')potion(a,x,y,f,seed,true);
   else if(ability==='rewind'){glyph(a,x,y-9,1-f,'time',1.3);for(let i=0;i<3;i++){const xx=x-(i+1)*13;a.poly([[xx-7,y-18],[xx,y-31],[xx+7,y-18]],p.light,.55-i*.15);}}
   else {wings(a,x,y,f,.95);glyph(a,x,y-15,f,'cross',.86);}
   break;}
  case 'summon_wolf':case 'skeleton_servant':case 'shade_pack':{
   for(let i=0;i<(ability==='shade_pack'?3:1);i++){const xx=x+(i-(ability==='shade_pack'?1:0))*36,yy=y+23+(i%2)*9;
    if(ability==='skeleton_servant')skeleton(a,xx,yy,f,seed+i,.9);
    else drawWolf(a,xx,yy,f,seed+i,.85,ability==='shade_pack');}
   dust(a,x,y,f,seed,8,45);break;}
  case 'build_turret':case 'solar_turret':case 'storm_rod':case 'star_beacon':{
   if(ability==='storm_rod'){a.line(tx,ty+13,tx,ty-52,p.dark,10);a.line(tx+1,ty+11,tx+1,ty-50,p.light,5);a.star(tx,ty-55,10,p.core);radialLightning(a,tx,ty-42,f,seed);}
   else if(ability==='star_beacon'){glyph(a,tx,ty-15,f,'constellation',1.3);a.line(tx,ty,tx,ty-55,p.primary,4,.7);dust(a,tx,ty-20,f,seed,12,44);}
   else turret(a,tx,ty,f,seed,ability==='solar_turret');
   break;}
  case 'ice_wall':crystalWall(a,tx,ty,f,6);break;
  case 'battle_song':case 'war_banner':{
   if(ability==='war_banner')banner(a,x,y+15,f);
   else {glyph(a,x,y-22,f,'music',1.1);for(let i=0;i<4;i++){const yy=y+7+i*8;a.stroke([[x-47,yy],[x-15,yy-6-Math.sin(f*8+i)*5],[x+17,yy+4],[x+44,yy-3]],p.primary,3,.8);}}
   break;}
  case 'weave_threads':{
   glyph(a,x,y-10,f,'constellation',1.25);
   const nodes=[[tx-28,ty-30],[tx+27,ty-35],[tx+35,ty+8],[tx-32,ty+12],[tx,ty-10]];
   for(let i=0;i<nodes.length;i++)a.line(...nodes[i],...nodes[(i+2)%nodes.length],i%2?p.primary:p.light,3,.8);
   break;}
  default:glyph(a,x,y-10,f,'star',1);
 }
 if(rank>=3&&f>.1&&f<.84)dust(a,x,y-18,f,seed,rank*3,56);
}
function wings(a,x,y,f,scale=1){const {p}=a,s=Math.sin(PI*clamp(f));for(const d of [-1,1]){
 const pts=[[x,y+14],[x+d*20*scale,y-10],[x+d*(42+8*s)*scale,y-40],[x+d*32*scale,y-16],[x+d*60*scale,y-18],[x+d*38*scale,y+8],[x+d*17*scale,y+21]];
 a.poly(pts,p.dark,.8);a.poly(pts.slice(0,-1).map(([xx,yy])=>[x+(xx-x)*.9,y+(yy-y)*.88]),p.primary,.7);a.stroke([[x,y+12],[x+d*37*scale,y-20],[x+d*59*scale,y-19]],p.core,3,.95);
 }a.star(x,y-18,10,p.core,.8);
}
function qCast(a,e,f,ability,kind,rank){const {p}=a;const sx=e.x,sy=e.y-28,tx=e.tx??sx,ty=(e.ty??e.y)-24,seed=hash(e.job+':'+ability);
 if(qPhysical.has(ability)||weaponType(jobArtProfile(e.job).weapon)!=='magic'&&['soul_reap','rift_cut'].includes(ability)){
  weaponAction(a,e,f,'skill1',kind,rank);
  if(ability==='piercing_shot')flight(a,sx,sy,tx,ty,f,'arrow',seed,1.25);
  if(ability==='rune_combo'||ability==='rune_slam')glyph(a,tx,ty,f,'rune',.85);
  if(ability==='bloodspin')waves(a,tx,ty+23,f,'flame',.8,seed);
  if(ability==='soul_reap'){for(let j=0;j<6;j++){const xx=mix(tx,sx,ease(clamp((f-.3)*2)))+rand(seed,j)*23-12;const yy=mix(ty,sy,ease(clamp((f-.3)*2)))+rand(seed,j+7)*24-12;a.star(xx,yy,3,p.core,.8);}}
  return;
 }
 if(ability==='constellation'){ // Stargazer: connect a celestial constellation, never a star-weaver snare.
  const pts=[[-38,-5],[-18,-34],[9,-28],[35,-8],[21,29],[-26,23]].map(([xx,yy])=>[tx+xx,ty+yy]);
  for(let j=0;j<pts.length-1;j++)a.line(...pts[j],...pts[j+1],p.primary,3,.85);
  for(const pt of pts){a.star(...pt,8,p.light,.92);a.star(pt[0]-1,pt[1]-1,4,p.core,.9);}
  if(f>.3)glyph(a,tx,ty,f,'constellation',.75);return;
 }
 if(ability==='fate_thread'){ // Starweaver: a woven net of fate strands on the enemy.
  const pts=[[-39,-21],[-13,-41],[20,-34],[38,0],[14,31],[-27,28]].map(([xx,yy])=>[tx+xx,ty+yy]);
  for(let j=0;j<pts.length;j++){a.line(...pts[j],...pts[(j+2)%pts.length],j%2?p.light:p.primary,3,.81);a.star(...pts[j],4,p.core,.88);}
  a.line(tx-11,ty-11,tx+14,ty+13,p.core,4,.9);return;
 }
 if(['hunt_mark','wolf_mark','spirit_arrow','judgement'].includes(ability)){
  glyph(a,tx,ty,f,ability==='judgement'?'cross':'constellation',.85);a.ellipse(tx,ty,36,p.primary,3,.7,1);
  for(let j=0;j<4;j++){const theta=j*PI/2+f;const xx=tx+Math.cos(theta)*27,yy=ty+Math.sin(theta)*26;a.star(xx,yy,4,p.core,.9);}return;
 }
 if(['chain_lightning','time_rift'].includes(ability)){
  if(ability==='chain_lightning')radialLightning(a,tx,ty,f,seed);else{glyph(a,tx,ty-7,f,'time',1.1);waves(a,tx,ty,f,'magic',.74,seed);}return;
 }
 if(['poison_vines','seed_strike','poison_vines','abyss_bind'].includes(ability)){
  for(let j=0;j<5;j++){const xx=tx+(j-2)*18;const hh=36+rand(seed,j)*25;const curl=Math.sin(f*6+j)*14;
   a.stroke([[xx,ty+15],[xx-7,ty-hh*.35],[xx+curl,ty-hh],[xx+curl+11,ty-hh-15]],p.dark,8,.9);
   a.stroke([[xx,ty+15],[xx-7,ty-hh*.35],[xx+curl,ty-hh],[xx+curl+11,ty-hh-15]],p.primary,4,.9);
  }dust(a,tx,ty,f,seed,8,44);return;
 }
 if(ability==='frost_lance'){flight(a,sx,sy,tx,ty,f,'ice',seed,1.4);if(f>.65)sparkBurst(a,tx,ty,f,seed,26);return;}
 if(ability==='ignite'){flight(a,sx,sy,tx,ty,f,'flame',seed,1.4);if(f>.65)sparkBurst(a,tx,ty,f,seed,21);return;}
 if(ability==='flaming_wings'){wings(a,sx,sy,f,1.08);flight(a,sx,sy,tx,ty,f,'flame',seed,.78);for(let i=0;i<5;i++){const xx=tx+(i-2)*17;a.poly([[xx-6,ty+21],[xx,ty-6-(i%3)*12],[xx+7,ty+21]],p.primary,.7);}return;}
 if(['acid_flask','gearbomb','arcane_bomb'].includes(ability)){potion(a,tx,ty,f,seed,true);if(f>.36)waves(a,tx,ty+10,f,ability==='arcane_bomb'?'magic':'nature',.8,seed);return;}
 if(['discord','tidal_push'].includes(ability)){waves(a,tx,ty+15,f,ability==='tidal_push'?'water':'magic',1,seed);glyph(a,tx,ty-16,f,ability==='discord'?'music':'rune',.8);return;}
 const theme=skillVisual(e.job,'skill1').theme;
 const shape=theme==='fire'?'flame':theme==='ice'?'ice':theme==='thunder'?'lightning':/ranger|sniper/.test(e.job)?'arrow':'orb';
 flight(a,sx,sy,tx,ty,f,shape,seed,1.2);if(f>.45){sparkBurst(a,tx,ty,f,seed,25);if(rank>=2)glyph(a,tx,ty,f,'star',.8);}
}
function rain(a,x,y,f,seed,kind='arrow',count=12,spread=110){for(let j=0;j<count;j++){
 const rr=rand(seed,j*31),xx=x+(rr-.5)*spread,delay=(j%6)*.11,travel=clamp((f-delay)*1.9);
 if(travel<=0||travel>1)continue;const yy=y-120+travel*133;
 if(kind==='arrow'){a.line(xx-12,yy-21,xx+3,yy+8,a.p.dark,8);a.line(xx-12,yy-21,xx+3,yy+8,a.p.light,3);}
 else if(kind==='meteor'){a.poly([[xx-17,yy-19],[xx-3,yy-27],[xx+14,yy-4],[xx+5,yy+11]],a.p.dark);
  a.poly([[xx-17,yy-15],[xx-6,yy-22],[xx+9,yy-1],[xx+4,yy+9]],a.p.primary);a.line(xx-18,yy-32,xx-30,yy-46,a.p.light,4);}
 else {a.poly([[xx-10,yy],[xx,yy-39],[xx+9,yy+1]],a.p.primary);a.line(xx,yy-33,xx,yy,a.p.core,3);}
 if(travel>.76)sparkBurst(a,xx,y+12,travel,seed+j,8,4);
 }}
function ultimateCast(a,e,f,ability,kind,rank){const {p}=a;const sx=e.x,sy=e.y-29,tx=e.tx??sx,ty=(e.ty??e.y)-25,seed=hash(e.job+':'+ability);const theme=skillVisual(e.job,'ultimate').theme;
 const physical=['dagger_frenzy','piercing_line','hundred_fists','earthquake','berserk_frenzy','triple_rune','shadow_festival','kings_judgement','wall_of_steel'];
 if(physical.includes(ability)){
  if(ability==='wall_of_steel'||ability==='earthquake')crystalWall(a,tx,ty+28,f,ability==='wall_of_steel'?7:9);
  else weaponAction(a,e,f,'ultimate',kind,rank);
  if(ability==='triple_rune'){for(let j=0;j<3;j++)glyph(a,tx+Math.cos(TAU*j/3)*35,ty+Math.sin(TAU*j/3)*29,f,'rune',.68);}
  if(ability==='shadow_festival'||ability==='dagger_frenzy')for(let j=0;j<4;j++)swingRibbon(a,tx+(j-1.5)*15,ty,(f+j*.17)%1,(j*.9), 'dagger',rank,.9);
  return;
 }
 switch(ability){
  case 'crescent_execution':{
   // Two-stage giant lunar crescent crosses the target, not the Q soul siphon.
   const angle=angles(sx,sy,tx,ty).d;
   for(let j=0;j<2;j++){const phase=clamp((f-j*.24)/(.83-j*.13));if(phase<=0)continue;
    swingRibbon(a,tx+(j?15:-15),ty-10,phase,angle+(j?PI*.72:-PI*.22),'scythe',4,j?1.25:1.72);}
   a.disk(tx+16,ty-33,26,p.dark,.62);a.ellipse(tx+7,ty-40,25,p.light,5,.83,1);
   if(f>.42)sparkBurst(a,tx,ty-12,f,seed,45,25);break;}
  case 'rune_break':{
   for(let j=0;j<6;j++){const theta=j*TAU/6;const xx=tx+Math.cos(theta)*55,yy=ty+Math.sin(theta)*39;glyph(a,xx,yy,f,'rune',.52);a.line(xx,yy,tx,ty,p.primary,3,.73);}
   glyph(a,tx,ty,f,'rune',1.4);if(f>.38)crystalWall(a,tx,ty+25,f,3);sparkBurst(a,tx,ty,f,seed,36,21);break;}
  case 'taunt_banner':case 'war_charge':case 'royal_command':{
   banner(a,tx,ty+26,f,ability==='royal_command');
   for(let j=0;j<5;j++){const yy=ty-10+(j-2)*15;const x0=sx+20+j*3,xx=tx-26+(j%2)*18;
    a.line(x0,yy-35,xx,yy-35,p.dark,8,.7);a.line(x0,yy-35,xx,yy-35,p.primary,4,.85);a.star(xx,yy-35,6,p.core,.8);}
   if(f>.35)waves(a,tx,ty+25,f,'magic',1.12,seed);break;}
  case 'deadeye':{
   glyph(a,tx,ty-8,f,'time',1.55);a.line(sx,sy,tx,ty,p.dark,13,.9);a.line(sx,sy,tx,ty,p.primary,7,.94);a.line(sx,sy,tx,ty,p.core,3,.96);
   for(let j=0;j<4;j++){const t=j*PI/2+.6;a.line(tx+Math.cos(t)*26,ty+Math.sin(t)*26,tx+Math.cos(t)*60,ty+Math.sin(t)*60,p.light,3,.88);}
   sparkBurst(a,tx,ty,f,seed,45,24);break;}
  case 'arrow_rain':rain(a,tx,ty+26,f,seed,'arrow',17,140);break;
  case 'meteor':rain(a,tx,ty+24,f,seed,'meteor',7,126);if(f>.42)waves(a,tx,ty+22,f,'flame',1.23,seed);break;
  case 'sanctuary':case 'holy_crusade':case 'grand_chorus':case 'seasonal_ritual':{
   waves(a,sx,sy+23,f,ability==='seasonal_ritual'?'nature':'magic',1.16,seed);
   glyph(a,sx,sy-24,f,ability==='grand_chorus'?'music':ability==='seasonal_ritual'?'constellation':'cross',1.4);
   for(let j=0;j<7;j++){const theta=j*TAU/7+f*.8;const xx=sx+Math.cos(theta)*53,yy=sy+Math.sin(theta)*38;a.star(xx,yy,7,p.core,.9);}break;}
  case 'pack_hunt':case 'death_legion':case 'abyss_procession':{
   waves(a,tx,ty+24,f,'magic',1.06,seed);
   for(let i=0;i<(ability==='death_legion'?5:4);i++){const xx=tx+(i-2)*38,yy=ty+22+(i%2)*9;
    if(ability==='death_legion')skeleton(a,xx,yy,f,seed+i,.9);else drawWolf(a,xx,yy,f,seed+i,.92,ability==='abyss_procession');}break;}
  case 'firestorm':case 'rebirth_nova':case 'dragon_breath':{
   waves(a,tx,ty+28,f,'flame',1.45,seed);for(let j=0;j<9;j++){const theta=j*TAU/9+f,rr=(20+rand(seed,j)*68)*ease(f);const xx=tx+Math.cos(theta)*rr,yy=ty+Math.sin(theta)*rr*.63;
    a.poly([[xx-10,yy+8],[xx-4,yy-16-(j%3)*7],[xx+2,yy-29],[xx+12,yy+9]],j%2?p.light:p.primary,.94);}
   if(ability==='rebirth_nova')wings(a,tx,ty-21,f,1.9);
   break;}
  case 'blizzard':case 'root_prison':case 'thorn_bloom':{
   if(ability==='blizzard')rain(a,tx,ty+26,f,seed,'ice',15,162);
   else {for(let j=0;j<10;j++){const xx=tx+(j-5)*16;const hh=40+rand(seed,j)*40;a.stroke([[xx,ty+28],[xx-9,ty+12],[xx+13,ty-hh],[xx+3,ty-hh-13]],p.primary,7,.85);}}
   waves(a,tx,ty+26,f,ability==='blizzard'?'ice':'nature',1.2,seed);break;}
  case 'thunder_domain':radialLightning(a,tx,ty,f,seed,true);waves(a,tx,ty+25,f,'magic',1.25,seed);break;
  case 'overclock':case 'dawn_machine':{
   for(let i=-1;i<=1;i++)turret(a,tx+i*54,ty+20+(i%2)*15,f,seed+i,ability==='dawn_machine');
   waves(a,tx,ty+25,f,'magic',1.05,seed);break;}
  case 'time_collapse':{for(let j=0;j<5;j++)glyph(a,tx+Math.cos(TAU*j/5)*53,ty+Math.sin(TAU*j/5)*37,f,'time',.72);
   glyph(a,tx,ty,f,'time',1.5);sparkBurst(a,tx,ty,f,seed,40,20);break;}
  case 'supernova':{
   a.disk(tx,ty-11,34*ease(f),p.dark,.8);a.disk(tx,ty-11,24*ease(f),p.primary,.9);a.disk(tx,ty-11,14*ease(f),p.core,.98);
   for(let j=0;j<11;j++){const t=j*TAU/11,rr=35+65*ease(f);const px=tx+Math.cos(t)*rr,py=ty-11+Math.sin(t)*rr*.7;
    a.line(tx,ty-11,px,py,j%2?p.primary:p.light,3,.76);a.star(px,py,8,p.core,.91);}
   sparkBurst(a,tx,ty-11,f,seed,41,23);break;}
  case 'fate_constellation':{
   const pts=Array.from({length:9},(_,j)=>{const t=j*TAU/9;return [tx+Math.cos(t)*75,ty+Math.sin(t)*51];});
   for(let j=0;j<pts.length;j++){a.line(...pts[j],...pts[(j+3)%pts.length],j%2?p.light:p.primary,3,.8);a.star(...pts[j],5,p.core,.85);}
   glyph(a,tx,ty,f,'rune',1.05);sparkBurst(a,tx,ty,f,seed,27,15);break;}
  case 'transmutation':{potion(a,tx,ty,f,seed,true);waves(a,tx,ty+25,f,'nature',1.25,seed);for(let j=0;j<6;j++)a.star(tx+(j-3)*22,ty-35-(j%2)*24,8,p.core,.84);break;}
  case 'tidal_surge':{for(let j=0;j<5;j++){const yy=ty+26-j*15;const points=[];for(let k=0;k<13;k++){const xx=tx-110+k*18;points.push([xx,yy+Math.sin(k*.66+f*9+j)*17]);}a.stroke(points,p.dark,12,.83);a.stroke(points,p.primary,8,.92);a.stroke(points.slice(3,10),p.light,3,.92);}break;}
  default:{waves(a,tx,ty+25,f,theme==='fire'?'flame':theme==='ice'?'ice':'magic',1.3,seed);
   sparkBurst(a,tx,ty,f,seed,35,16);glyph(a,tx,ty-18,f,theme==='time'?'time':'star',1.05);break;}
 }
 if(rank>=3&&f>.25&&f<.9)dust(a,tx,ty,f,seed+73,rank*5,110);
}
function drawPixelCombatV7(ctx,e,f,rank){if(!ctx||!e?.job||!e.skill)return false;
 const kit=KITS[e.job]||KITS.novice;const action=kit?.[e.skill]||e.skill;
 const pal=skillButtonPalette(e.job,e.skill);const art=painter(ctx,pal);
 const p=jobArtProfile(e.job),kind=weaponType(p.weapon),t=clamp(f);
 ctx.save();ctx.imageSmoothingEnabled=false;ctx.lineJoin='bevel';ctx.lineCap='square';
 // The base cast is almost transparent: no dark opaque pillar or generic shield.
 if(e.skill==='basic'){
  if(kind==='magic')flight(art,e.x,e.y-26,e.tx??e.x+70,(e.ty??e.y)-22,t,flameJobs.has(e.job)?'flame':iceJobs.has(e.job)?'ice':e.job==='stormcaller'?'lightning':'orb',hash(e.job),.75);
  else {weaponAction(art,e,t,'basic',kind,rank);if(kind==='bow')flight(art,e.x,e.y-25,e.tx??e.x+80,(e.ty??e.y)-21,t,'arrow',hash(e.job),.82);}
 }else if(e.skill==='skill1')qCast(art,e,t,action,kind,rank);
 else if(e.skill==='skill2')drawUtility(art,e,t,action,rank);
 else if(e.skill==='ultimate')ultimateCast(art,e,t,action,kind,rank);
 else{ctx.restore();return false;}
 ctx.restore();return true;
}
const caches=new WeakMap();
export function clearClassCombatVFXV7(renderer){caches.delete(renderer);}
export function classCombatVFXV7Stats(renderer){const cache=caches.get(renderer);return {frames:cache?.frames.size||0,draws:cache?.draws||0,pixels:cache?.pixels||0};}
export function drawClassCombatVFXV7(renderer,e,f){
 if(!renderer?.ctx||!renderer?.showEffects||!['skill','attack'].includes(e?.type)||!Number.isFinite(e.x)||!Number.isFinite(e.y))return false;
 const c=renderer.ctx;if(typeof c.beginPath!=='function'||typeof c.ellipse!=='function')return false;
 const job=e.job||e.classId||'novice',spec={...e,job},rank={common:1,rare:2,epic:3,hidden:4}[jobArtProfile(job).tier]||1;
 const tx=Number.isFinite(e.tx)?e.tx:e.x,ty=Number.isFinite(e.ty)?e.ty:e.y;
 const lx=Math.floor(Math.min(e.x,tx)-174),ly=Math.floor(Math.min(e.y,ty)-196);
 const rw=Math.ceil(Math.max(e.x,tx)-lx+174),rh=Math.ceil(Math.max(e.y,ty)-ly+115);
 const drawDirect=()=>drawPixelCombatV7(c,spec,f,rank);
 if(rw>860||rh>750)return drawDirect();
 const makeCanvas=renderer.createPixelCanvas||(typeof OffscreenCanvas!=='undefined'?((w,h)=>new OffscreenCanvas(w,h)):typeof document!=='undefined'?((w,h)=>{const cn=document.createElement('canvas');cn.width=w;cn.height=h;return cn;}):null);
 if(!makeCanvas)return drawDirect();
 let bank=caches.get(renderer);if(!bank){bank={frames:new Map(),draws:0,pixels:0};caches.set(renderer,bank);}
 const key=String(e._pixelId??e.castId??`${e.id||''}:${e.born||0}:${job}:${e.skill}`);
 const scale=renderer.lowPower?.5:1,frame=Math.floor(clamp(f,0,.999)* (renderer.lowPower?13:20)),cw=Math.ceil(rw*scale),ch=Math.ceil(rh*scale);
 let entry=bank.frames.get(key);
 if(entry&&(entry.rw!==rw||entry.rh!==rh||entry.lx!==lx||entry.ly!==ly||entry.scale!==scale)){
  bank.frames.delete(key);bank.pixels-=entry.area;entry=null;
 }
 if(!entry){const canvas=makeCanvas(cw,ch),cx=canvas?.getContext?.('2d',{alpha:true});if(!cx||typeof cx.setTransform!=='function')return drawDirect();entry={canvas,cx,lx,ly,rw,rh,scale,area:cw*ch,frame:-1};bank.frames.set(key,entry);bank.pixels+=entry.area;}
 if(entry.frame!==frame){entry.cx.setTransform(1,0,0,1,0,0);entry.cx.clearRect(0,0,cw,ch);entry.cx.setTransform(scale,0,0,scale,-lx*scale,-ly*scale);drawPixelCombatV7(entry.cx,spec,(frame+.5)/(renderer.lowPower?13:20),rank);entry.frame=frame;bank.draws++;}
 bank.frames.delete(key);bank.frames.set(key,entry);
 const max=renderer.lowPower?12:24,px=renderer.lowPower?650000:1800000;
 while(bank.frames.size>max||bank.pixels>px){const first=bank.frames.keys().next().value;if(first===undefined)break;const old=bank.frames.get(first);bank.frames.delete(first);bank.pixels-=old.area;}
 c.save();c.imageSmoothingEnabled=false;c.drawImage(entry.canvas,lx,ly,rw,rh);c.restore();return true;
}
