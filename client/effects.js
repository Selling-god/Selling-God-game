import {drawClassCombatVFX} from './combat-vfx-v6.js';
import {drawTacticalSkill} from './tactical-skill-fx.js?v=v5-smooth';
import {jobArtProfile} from './job-signatures.js';
import {paintCombatChoreography,skillEffectBounds} from './combat-vfx.js';
import {drawPixelSkillSprite} from './pixel-skill-sprites.js';
import {skillVisual} from '../shared/visuals.js';
import {pixelLayer,pixelPalette,pixelEventKey,drawPixelImpact} from './pixel-effects.js';

const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const mix=(a,b,t)=>a+(b-a)*t;
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
const EFFECTS=new Set(['attack','skill','armorBreak','forge','soulRecover','dash','buff','level','gather','death']);
export function effectLifetime(e){
 if(e.type==='impact')return e.boss?850:500;
 if(e.type==='dash')return 420;
 if(e.type==='death')return 750;
 if(e.type==='attack'||e.type==='skill')return e.skill==='ultimate'?1450:e.skill==='skill2'?1200:e.skill==='basic'?450:900;
 return 1300;
}

function trimLine(p,x,y,tx,ty,v,width=6){p.line(x,y,tx,ty,v.ink,width+6);p.line(x,y,tx,ty,v.primary,width);p.line(x,y,tx,ty,v.light,Math.max(3,width*.3));}
function ground(p,x,y,r,v,width=3){p.arc(x,y,r,v.ink,width+3,.58);p.arc(x,y,r,v.primary,width,.58);p.arc(x,y-3,r*.8,v.light,3,.58);}
function shard(p,x,y,length,v,angle=0){
 const rotate=([xx,yy])=>[x+xx*Math.cos(angle)-yy*Math.sin(angle),y+xx*Math.sin(angle)+yy*Math.cos(angle)];
 const pts=[[0,-length],[length*.35,-length*.15],[length*.2,length*.25],[0,length*.5],[-length*.35,0]].map(rotate);
 p.poly(pts,v.dark);p.outline(pts,v.ink,6);p.poly([[-length*.1,-length*.85],[length*.28,-length*.1],[0,length*.35]].map(rotate),v.primary);
 p.line(...rotate([0,-length*.85]),...rotate([0,length*.2]),v.light,3);
}
function cross(p,x,y,size,v){
 p.rect(x-5,y-size-3,10,size*2+6,v.ink);p.rect(x-size-3,y-5,size*2+6,10,v.ink);
 p.rect(x-3,y-size,6,size*2,v.primary);p.rect(x-size,y-3,size*2,6,v.primary);p.dot(x,y,6,v.light);
}
function fragments(p,x,y,r,f,v,count=12,lift=0){
 for(let i=0;i<count;i++){
  const a=i*2.399963,rr=r*(.3+(i%5)*.15)*ease(f),xx=x+Math.cos(a)*rr,yy=y+Math.sin(a)*rr*.55-lift*Math.sin(f*Math.PI);
  if(i%4===0)p.spark(xx,yy,8*(1-f)+3,v.primary,v.light);else{p.dot(xx+2,yy+3,6+i%3*2,v.ink);p.dot(xx,yy,3+i%3*2,i%2?v.primary:v.light);}
 }
}
function ribbon(p,x,y,angle,r,v,f,index=0){
 const head=angle+.8+(f-.3)*1.2+index*.35,tail=head-2.4,thickness=8+14*(1-f);
 const strip=(outer,inner)=>{
  const points=[];for(let i=0;i<=16;i++){const a=tail+(head-tail)*i/16;points.push([x+Math.cos(a)*outer,y+Math.sin(a)*outer*.7]);}
  for(let i=16;i>=0;i--){const a=tail+(head-tail)*i/16;points.push([x+Math.cos(a)*inner,y+Math.sin(a)*inner*.7]);}return points;
 };
 p.poly(strip(r+4,r-thickness-4),v.ink);p.poly(strip(r,r-thickness),v.primary);p.poly(strip(r-1,r-5),v.light);
 const tip=[x+Math.cos(head)*r,y+Math.sin(head)*r*.7];p.spark(...tip,9*(1-f)+3,v.core,v.light);
}
function arrow(p,x,y,angle,v,length=29,width=6){
 const point=(along,across)=>[x+Math.cos(angle)*along-Math.sin(angle)*across,y+Math.sin(angle)*along+Math.cos(angle)*across];
 trimLine(p,...point(-length,0),x,y,v,width);
 const head=[point(10,0),point(-5,-9),point(-2,0),point(-5,9)];p.poly(head,v.light);p.outline(head,v.ink,3);
 p.line(...point(-length+8,-8),...point(-length+13,0),v.primary,3);p.line(...point(-length+8,8),...point(-length+13,0),v.primary,3);
 p.dot(...point(3,0),3,v.core);
}
function bolt(p,x,y,tx,ty,v,seed=0,width=5){
 const points=[[x,y]];for(let i=1;i<=8;i++){const f=i/8,noise=i===8?0:Math.sin(i*14+seed*3)*12;points.push([mix(x,tx,f)+noise,mix(y,ty,f)]);}
 p.outline(points,v.ink,width+6,false);p.outline(points,v.primary,width+2,false);p.outline(points,v.light,3,false);
}
function flame(p,x,y,size,v,f,seed=0){
 const h=size*(.85+.18*Math.sin(f*12+seed)),w=size*.4;
 const pts=[[x-w,y],[x-w*.8,y-h*.4],[x-w*.35,y-h*.32],[x-w*.2,y-h*.82],[x+w*.15,y-h],[x+w*.38,y-h*.4],[x+w*.7,y-h*.55],[x+w,y-h*.12],[x+w*.4,y+4]];
 p.poly(pts,v.ink);p.poly(pts.map(([xx,yy])=>[x+(xx-x)*.8,y+(yy-y)*.9]),v.primary);
 p.poly([[x-w*.45,y],[x-w*.2,y-h*.4],[x+w*.12,y-h*.62],[x+w*.44,y-h*.12],[x+w*.25,y]],v.light);p.dot(x,y-3,5,v.core);
}
function sigil(p,x,y,r,v,f,kind='runes'){
 ground(p,x,y,r,v);p.arc(x,y,r*.56,v.dark,6,.6);p.arc(x,y,r*.56,v.light,3,.6);
 for(let i=0;i<8;i++){
  const a=i*TAU/8+f*.3,xx=x+Math.cos(a)*r,yy=y+Math.sin(a)*r*.58;
  if(kind==='clock')p.line(xx,yy,xx-Math.cos(a)*9,yy-Math.sin(a)*5,v.light,3);
  else{p.diamond(xx,yy,6,v.primary,v.light);p.dot(xx,yy,3,v.core);}
 }
 if(kind==='clock'){p.line(x,y,x+Math.cos(f*6)*r*.65,y+Math.sin(f*6)*r*.38,v.light,3);p.line(x,y,x-r*.28,y-r*.24,v.primary,6);}
}
function wing(p,x,y,r,v,f){
 for(const side of [-1,1]){
  const points=[[0,4],[.24,-.35],[.46,-.64],[.77,-.78],[1,-.93],[.85,-.34],[.68,-.02],[.6,-.22],[.44,.12],[.4,-.02],[.2,.22]].map(([xx,yy])=>[x+xx*r*side,y+yy*r*(.7+Math.sin(f*Math.PI)*.3)]);
  p.poly(points,v.dark);p.outline(points,v.ink,6);
  for(let i=0;i<5;i++)p.line(x+side*r*.17,y+3,x+side*r*(.4+i*.13),y-r*(.06+i*.13),i%2?v.primary:v.light,i<2?6:3);
 }
 p.diamond(x,y-10,25,v.primary,v.light);
}
function shield(p,x,y,r,v,f){
 const pts=[[x-r*.7,y-r],[x+r*.7,y-r],[x+r,y-r*.4],[x+r*.7,y+r*.5],[x,y+r],[x-r*.7,y+r*.5],[x-r,y-r*.4]];
 p.alpha(.42,()=>p.poly(pts,v.dark));p.outline(pts,v.ink,9);p.outline(pts,v.primary,6);p.outline(pts,v.light,3);
 cross(p,x,y-r*.05,r*.35,v);for(let i=0;i<3;i++)p.spark(x+(i-1)*r*.7,y-r-6-Math.sin(f*Math.PI)*12,6,v.light,v.core);
}
function note(p,x,y,size,v){p.line(x,y,x,y-size,v.primary,3);p.line(x,y-size,x+size*.55,y-size+3,v.light,3);p.disk(x-4,y,5,v.primary,.65);}
function heart(p,x,y,scale,v){
 const rows=['0110110','1111111','1111111','0111110','0011100','0001000'];
 for(let yy=0;yy<rows.length;yy++)for(let xx=0;xx<7;xx++)if(rows[yy][xx]==='1')p.dot(x+(xx-3)*scale,y+(yy-3)*scale,scale,yy<2?v.light:v.primary);
}

function paintBasic(p,e,v,f){
 const angle=Math.atan2((e.ty??e.y)-e.y,(e.tx??e.x)-e.x),family=e.classId||'guardian';
 const weapon=jobArtProfile(e.job).weapon;
 if(family==='guardian'){
  if(/창|삼지창/.test(weapon))arrow(p,e.x+Math.cos(angle)*30,e.y-20+Math.sin(angle)*23,angle,v,56,5);
  else if(/도끼|낫|곡괭이/.test(weapon))ribbon(p,e.x,e.y-13,angle,59+ease(f)*18,v,f);
  else if(/쌍검|단검/.test(weapon)){ribbon(p,e.x-10,e.y-19,angle-.4,32+ease(f)*13,v,f);ribbon(p,e.x+10,e.y-13,angle+.4,35+ease(f)*13,v,f);}
  else ribbon(p,e.x,e.y-13,angle,44+ease(f)*13,v,f);
  if(f>.3&&f<.85)p.spark(e.x+Math.cos(angle)*45,e.y-12+Math.sin(angle)*32,13*(1-f),v.primary,v.core);
 }else{
  const travel=ease(Math.min(1,f*1.9)),x=mix(e.x,e.tx??e.x,travel),y=mix(e.y-24,(e.ty??e.y)-14,travel);
  for(let i=3;i>=1;i--){const tail=travel-i*.065;if(tail>0)p.alpha(.18+i*.08,()=>p.dot(mix(e.x,e.tx??e.x,tail),mix(e.y-24,(e.ty??e.y)-14,tail),family==='ranger'?3:6,v.primary));}
  if(family==='ranger')arrow(p,x,y,angle,v,22,3);
  else{p.disk(x,y,10,v.ink);p.disk(x,y,7,v.primary);p.dot(x-2,y-2,6,v.light);p.dot(x-3,y-3,3,v.core);}
  if(f>.45)p.spark(e.tx??e.x,(e.ty??e.y)-12,18*Math.sin((f-.45)/.55*Math.PI),v.primary,v.core);
 }
}
function paintDefense(p,e,v,f,count){
 const x=e.x,y=e.y-27,r=27+Math.sin(f*Math.PI)*8,shape=v.shape;
 ground(p,x,e.y,44+f*12,v);
 if(['shield','barrier','fortress'].includes(shape)){shield(p,x,y,r,v,f);if(shape==='fortress')for(const sign of [-1,1])p.rect(x+sign*49-5,y-18,10,44,v.primary);}
 else if(['cross','bandage','leaves','lotus','bubbles'].includes(shape)){
  for(let i=0;i<5;i++){
   const xx=x+Math.sin(i*4.2)*29,yy=y+26-f*65+i*5;
   if(shape==='cross'||shape==='bandage')cross(p,xx,yy,7,v);
   else if(shape==='bubbles'){p.arc(xx,yy,7+i%3,v.primary,3);p.dot(xx-3,yy-3,3,v.light);}
   else shard(p,xx,yy,10,v,i+f*.8);
  }
  if(shape==='cross')heart(p,x,y-14-f*15,3,v);
 }else if(['clock','runes','gear','scope','stars'].includes(shape)){
  sigil(p,x,y+18,46,v,f,shape==='clock'?'clock':'runes');
  if(shape==='scope'){p.line(x-28,y,x+28,y,v.light,3);p.line(x,y-28,x,y+28,v.light,3);}
 }else if(['wings','dragon','wind'].includes(shape))wing(p,x,y+12,65,v,f);
 else if(['rift','eclipse','smoke','soul'].includes(shape)){
  for(let i=0;i<3;i++){p.arc(x,y,26+i*6-f*8,i%2?v.primary:v.dark,6,.85);}
  fragments(p,x,y,48,f,v,count,40);
 }else if(shape==='notes')for(let i=0;i<6;i++)note(p,x+Math.sin(i*2.4)*33,y+20-f*65+i*4,13,v);
 else if(shape==='crown'){
  const points=[[x-22,y-16],[x-26,y-39],[x-10,y-29],[x,y-48],[x+10,y-29],[x+26,y-39],[x+22,y-16]];
  p.poly(points,v.primary);p.outline(points,v.ink,6);p.outline(points,v.light,3);p.diamond(x,y-25,7,v.core);
 }else if(shape==='banner'){
  trimLine(p,x+20,y-36,x+20,y+25,v,3);p.poly([[x+23,y-36],[x+52,y-30],[x+43,y-20],[x+51,y-10],[x+23,y-15]],v.primary);p.spark(x+32,y-25,7,v.light,v.core);
 }else if(shape==='flame')for(const sign of [-1,1])flame(p,x+sign*27,y+25,48,v,f,sign);
 else fragments(p,x,y,45,f,v,count,50);
}
function paintOffense(p,e,v,f,count){
 const ultimate=e.skill==='ultimate',shape=v.shape,angle=Math.atan2((e.ty??e.y)-e.y,(e.tx??e.x)-e.x);
 const cx=e.center==='self'?e.x:(e.tx??e.x),cy=e.center==='self'?e.y:(e.ty??e.y),radius=Math.min(220,Math.max(48,e.radius||(ultimate?150:80)));
 if(['sweep','crossSlash','runeSlash','blades','dance','daggers','scythe','eclipse'].includes(shape)){
  const n=['blades','dance','daggers'].includes(shape)?3:shape==='crossSlash'?2:1;
  for(let i=0;i<n;i++)ribbon(p,e.x+(i-(n-1)/2)*9,e.y-13,angle+(i%2?1.4:0),ultimate?92:66,v,f,i);
  if(['runeSlash','eclipse'].includes(shape))sigil(p,cx,cy,radius*.72,v,f);
  if(shape==='scythe')shard(p,e.x+Math.cos(angle)*45,e.y-30+Math.sin(angle)*30,55,v,angle+1.2);
 }else if(['arrow','beam','lance','lances','cannon'].includes(shape)){
  const travel=ease(Math.min(1,f*1.8)),x=mix(e.x,cx,travel),y=mix(e.y-25,cy-14,travel);
  if(shape==='beam'||shape==='cannon'){
   trimLine(p,e.x,e.y-25,cx,cy-14,v,(ultimate?20:11)*Math.sin(f*Math.PI)+4);
   for(let i=0;i<4;i++)p.spark(mix(e.x,cx,i/3),mix(e.y-25,cy-14,i/3),9*(1-f),v.primary,v.core);
   if(f>.2)ground(p,cx,cy,18+f*43,v,6);
  }else for(let i=0;i<(shape==='lances'?5:1);i++)arrow(p,x+(i-(shape==='lances'?2:0))*13,y,angle,v,shape==='arrow'?35:63,shape==='arrow'?4:7);
  if(f>.4)fragments(p,cx,cy-12,45,f,v,6);
 }else if(['lightning','storm'].includes(shape)){
  for(let i=0;i<(ultimate?5:3);i++){
   const x=cx+(i-(ultimate?2:1))*32,y=cy+Math.sin(i)*26;
   bolt(p,x-10,y-(ultimate?210:140),x,y,v,Math.floor(f*6)+i,ultimate?7:5);ground(p,x,y,18+f*28,v);
  }
 }else if(['icicles','blizzard'].includes(shape)){
  ground(p,cx,cy,radius*ease(f),v);
  for(let i=0;i<count;i++){const a=i*2.4,r=radius*.8*((i%5+1)/5),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.58;shard(p,x,y-95*(1-ease(f)),16+(i%4)*5,v,-.18);if(f>.4&&i%3===0)p.spark(x,y,10,v.light,v.core);}
 }else if(['flame','inferno','bomb','spores','alchemy'].includes(shape)){
  ground(p,cx,cy,radius*ease(f),v,6);
  for(let i=0;i<count;i++){
   const a=i*2.4,r=(16+radius*.65*ease(f))*((i%5+1)/5),x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.52;
   if(shape==='flame'||shape==='inferno')flame(p,x,y,(ultimate?65:42)*(1-f*.4),v,f,i);
   else{p.disk(x,y-f*20,9+i%4,v.dark);p.arc(x,y-f*20,7+i%4,v.primary,3);p.dot(x-2,y-f*20-3,3,v.light);}
  }
  if(shape==='alchemy')sigil(p,cx,cy,radius*.7,v,f);
 }else if(['vines','garden','tree','seasons'].includes(shape)){
  ground(p,cx,cy,radius*ease(f),v);
  for(let i=0;i<(ultimate?8:5);i++){
   const a=i*TAU/(ultimate?8:5),x=cx+Math.cos(a)*radius*.67,y=cy+Math.sin(a)*radius*.43,h=90*ease(f);
   const points=[[x,y],[x-8,y-h*.3],[x+6,y-h*.6],[x,y-h]];p.outline(points,v.ink,10,false);p.outline(points,v.primary,5,false);
   shard(p,x-11,y-h*.45,14,v,-.7);shard(p,x+10,y-h*.78,14,v,.8);
   if(ultimate)p.spark(x,y-h,8,v.light,v.core);
  }
 }else if(['rocks','quake','shieldBash','fortress'].includes(shape)){
  ground(p,cx,cy,radius*ease(f),v,8);
  for(let i=0;i<(ultimate?9:5);i++){
   const a=i*2.4,r=radius*ease(f)*.7,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r*.5,h=30+25*Math.sin(f*Math.PI);
   const pts=[[x-14,y],[x-14,y-h*.6],[x-3,y-h],[x+9,y-h*.8],[x+15,y-3]];p.poly(pts,v.dark);p.outline(pts,v.ink,5);p.line(x-3,y-h,x+9,y-h*.8,v.light,4);p.line(x-3,y-h,x-2,y-2,v.primary,5);
  }
 }else if(['fists','claws','wolves'].includes(shape)){
  for(let i=0;i<(ultimate?8:3);i++){
   const x=cx+Math.sin(i*2.4)*radius*.65,y=cy+Math.cos(i*2.4)*radius*.4;
   if(shape==='fists'){p.rect(x-12,y-13,24,20,v.dark);p.rect(x-9,y-16,18,12,v.primary);p.line(x-6,y-13,x-6,y-5,v.light,3);p.spark(x+6,y+3,12*(1-f),v.light,v.core);}
   else for(let j=0;j<3;j++)trimLine(p,x-14+j*9,y-28,x+j*9,y+10,v,4);
  }
 }else if(['notes','symphony'].includes(shape)){
  ground(p,cx,cy,radius*ease(f),v);
  for(let i=0;i<count;i++){const a=i*2.4+f,x=cx+Math.cos(a)*radius*ease(f),y=cy+Math.sin(a)*radius*ease(f)*.55-f*25;note(p,x,y,15+i%3*3,v);}
 }else if(['clock','timewarp','runes','gear'].includes(shape)){
  sigil(p,cx,cy,radius*(.65+.2*Math.sin(f*Math.PI)),v,shape==='timewarp'?1-f:f,['clock','timewarp'].includes(shape)?'clock':'runes');
  if(ultimate)sigil(p,cx,cy,radius*.34,v,-f);
 }else if(['soul','spirits','rift','blackhole'].includes(shape)){
  const r=24+radius*.5*Math.sin(f*Math.PI);p.disk(cx,cy-12,r,v.ink,.7);p.arc(cx,cy-12,r,v.dark,10,.7);p.arc(cx,cy-12,r*.9,v.primary,4,.7);
  for(let i=0;i<8;i++){const a=i*TAU/8+f*3,rr=radius*(1-f*.7),x=cx+Math.cos(a)*rr,y=cy-12+Math.sin(a)*rr*.65;p.spark(x,y,7,v.light,v.core);}
  p.spark(cx,cy-12,18*(1-f),v.primary,v.core);
 }else if(['wings','phoenix','dragon'].includes(shape)){
  const x=mix(e.x,cx,ease(f)),y=mix(e.y-15,cy-35,ease(f));wing(p,x,y,ultimate?108:67,v,f);
  if(shape==='phoenix')flame(p,x,y+18,60,v,f);fragments(p,cx,cy,radius*.75,f,v,count,45);
 }else if(['wave','tide'].includes(shape)){
  for(let i=0;i<(ultimate?5:3);i++){
   const spread=radius*ease(f),points=[];for(let j=0;j<=24;j++)points.push([cx-spread+j*spread/12,cy+(i-2)*17+Math.sin(j*.58-f*7+i)*13-f*22]);
   p.outline(points,v.ink,9,false);p.outline(points,v.primary,6,false);p.outline(points.map(([x,y])=>[x,y-3]),v.light,3,false);
  }
 }else if(['swords','pillars','rain','meteor'].includes(shape)){
  for(let i=0;i<(ultimate?9:4);i++){
   const x=cx+Math.sin(i*2.4)*radius*.7,y=cy+Math.cos(i*2.4)*radius*.45,fall=clamp(f*2-i*.04,0,1),yy=y-160*(1-fall);
   if(shape==='pillars'){p.alpha(.3,()=>p.rect(x-12,y-165*ease(f),24,165*ease(f),v.primary));p.line(x,y-165*ease(f),x,y,v.light,5);p.spark(x,y,17,v.light,v.core);}
   else if(shape==='meteor'){trimLine(p,x+28,yy-70,x,yy,v,9);p.disk(x,yy,17,v.dark);p.disk(x-2,yy-2,12,v.primary);p.spark(x-3,yy-4,7,v.light,v.core);}
   else if(shape==='rain')arrow(p,x,yy,Math.PI/2+.2,v,28,3);
   else{shard(p,x,yy,29,v,.12);p.line(x-9,yy-5,x+9,yy-3,v.light,5);}
   if(fall>.85)ground(p,x,y,16+(f-.4)*28,v);
  }
 }else if(['constellation','threads','weave','supernova','orb','burst','banner','crown','cross'].includes(shape)){
  const n=ultimate?8:5,points=Array.from({length:n},(_,i)=>{const a=i*TAU/n+f*.45;return [cx+Math.cos(a)*radius*.8*ease(f),cy+Math.sin(a)*radius*.5*ease(f)];});
  for(let i=0;i<n;i++){const a=points[i],b=points[(i+3)%n];p.line(...a,...b,v.dark,6);p.line(...a,...b,v.primary,3);p.spark(...a,ultimate?10:6,v.primary,v.core);}
  if(['supernova','orb','burst'].includes(shape)){const r=(ultimate?48:24)*Math.sin(f*Math.PI);p.disk(cx,cy-15,r,v.dark);p.disk(cx,cy-15,r*.62,v.primary);p.spark(cx,cy-15,r*1.35,v.light,v.core);}
  if(shape==='cross')cross(p,cx,cy-28,42,v);
  if(shape==='crown'){const pts=[[cx-42,cy-30],[cx-48,cy-78],[cx-18,cy-56],[cx,cy-98],[cx+18,cy-56],[cx+48,cy-78],[cx+42,cy-30]];p.poly(pts,v.dark);p.outline(pts,v.primary,8);p.outline(pts,v.light,3);p.diamond(cx,cy-48,12,v.light);}
  if(shape==='banner'){trimLine(p,cx,cy-100,cx,cy,v,6);p.poly([[cx+3,cy-100],[cx+66,cy-91],[cx+47,cy-69],[cx+65,cy-50],[cx+3,cy-58]],v.primary);p.spark(cx+25,cy-78,15,v.light,v.core);}
 }else{ground(p,cx,cy,radius*ease(f),v,6);fragments(p,cx,cy,radius,f,v,count,22);}
 if(ultimate&&f>.15&&f<.8)fragments(p,cx,cy,radius*.8,f,v,Math.min(count,10),25);
}

/** The main renderer receives one nearest-neighbor bitmap per effect, regardless of its rotation. */
export function drawSkillEffect(renderer,e,t){
 if(e.type==='impact')return drawPixelImpact(renderer,e,t);
 if(!EFFECTS.has(e.type))return false;
 if(!Number.isFinite(e.x)||!Number.isFinite(e.y))return true;
 const duration=effectLifetime(e),age=t-e.born;if(age<0||age>duration)return true;
 // Server ticks can start many skills together. Stagger bitmap refreshes across frames.
 const stride=renderer.lowPower?80:50,eventKey=pixelEventKey(e);
 const seed=typeof eventKey==='number'?eventKey:[...String(eventKey)].reduce((n,ch)=>(n*31+ch.charCodeAt(0))>>>0,0);
 const phase=seed*17%stride,frame=Math.floor((age+phase)/stride),f=clamp((frame*stride-phase)/duration,0,1),fade=Math.min(1,(1-f)*3);
 const visual=skillVisual(e.job||e.classId||'novice',e.skill),v={...pixelPalette(e.theme||visual.theme),shape:visual.shape};
 const ultimate=e.skill==='ultimate',isSkill=e.type==='attack'||e.type==='skill',count=renderer.lowPower?6:ultimate?16:10;
 // Dedicated frame-by-frame original pixel animation is drawn before the old
 // generic painter. The latter remains only as an asset-load fallback.
 // A selectable classic fallback makes visual updates reversible without
 // rolling back the authoritative V5 combat, inventory or saves.
 if(isSkill&&renderer.fxStyle==='classic'&&drawPixelSkillSprite(renderer,e,f))return true;
 if(isSkill&&renderer.fxStyle!=='classic'&&drawClassCombatVFX(renderer,e,f))return true;
 if(isSkill&&drawPixelSkillSprite(renderer,e,f))return true;
 if(isSkill&&drawTacticalSkill(renderer,e,f))return true;
 const radius=isSkill?Math.min(225,Math.max(e.skill==='basic'?55:90,e.radius||(ultimate?160:90))):110;
 const tx=isSkill?(e.tx??e.x):e.x,ty=isSkill?(e.ty??e.y):e.y;
 const box=isSkill?skillEffectBounds(e):{x:Math.min(e.x,tx)-radius-35,y:Math.min(e.y,ty)-(ultimate?245:160)-radius*.5,width:Math.abs(tx-e.x)+(radius+35)*2,height:Math.abs(ty-e.y)+(ultimate?245:160)+radius*1.5+35};
 pixelLayer(renderer,`skill:${eventKey}:${frame}`,box,p=>{
  if(isSkill){
   // The old job icon was painted ON TOP of a giant shared attack (and could
   // hide the character as a dark rectangular pillar). One restrained bespoke
   // weapon/element choreography now owns each job's entire attack silhouette.
   paintCombatChoreography(p,e,f,v,{lowPower:renderer.lowPower,showEffects:renderer.showEffects});
   return;
  }
  if(!renderer.showEffects){
   if(e.type==='dash')p.outline([[e.x-24,e.y],[e.x-6,e.y-8],[e.x+12,e.y]],v.primary,3,false);
   else if(e.skill==='skill2'||e.type==='buff'||e.type==='soulRecover')cross(p,e.x,e.y-32-f*20,10,v);
   else{ground(p,tx,ty,22+f*25,v);p.spark(tx,ty-12,10*(1-f),v.light,v.core);}
   return;
  }
  if(e.type==='dash'){
   const defaults={n:{x:0,y:-1},s:{x:0,y:1},e:{x:1,y:0},w:{x:-1,y:0}},d=defaults[e.direction]||{x:1,y:0};
   const dx=Number.isFinite(e.dx)?e.dx:d.x,dy=Number.isFinite(e.dy)?e.dy:d.y,angle=Math.atan2(dy,dx);
   for(let i=0;i<(renderer.lowPower?3:5);i++){
    const distance=(i*14+f*60),x=e.x+dx*distance,y=e.y+dy*distance-20;
    p.alpha(.65-i*.09,()=>{p.arc(x,y,12+f*8,v.primary,3,.85,angle+1.9,angle+4.4);p.line(x-dx*14,y-dy*14,x+dx*3,y+dy*3,v.light,3);});
   }
  }else if(e.type==='forge'){
   const forge=pixelPalette(e.success===false?'earth':'holy');ground(p,e.x,e.y,24+f*48,forge);
   shard(p,e.x,e.y-30-f*15,28,forge,.12);fragments(p,e.x,e.y-28,86,f,forge,count,45);
   if(e.success!==false)p.spark(e.x,e.y-50,28*(1-f),forge.light,forge.core);
  }else if(e.type==='buff'||e.type==='soulRecover'){
   const healing=pixelPalette(e.type==='soulRecover'?'water':e.color==='#8fbcf0'?'star':'holy');
   ground(p,e.x,e.y,28+f*24,healing);heart(p,e.x,e.y-32-f*35,3,healing);
   for(let i=0;i<4;i++)cross(p,e.x+Math.sin(i*3.4)*28,e.y-10-f*60+i*7,6,healing);
  }else if(e.type==='level'){
   const gold=pixelPalette('holy');ground(p,e.x,e.y,24+f*66,gold,5);
   for(let i=0;i<7;i++){const x=e.x+Math.sin(i*2.4)*48,y=e.y-15-f*110+(i%3)*12;p.spark(x,y,8,gold.primary,gold.core);}
   p.outline([[e.x-13,e.y-43-f*25],[e.x,e.y-60-f*25],[e.x+13,e.y-43-f*25]],gold.light,6,false);
  }else if(e.type==='gather'){
   const earth=pixelPalette('nature');for(let i=0;i<6;i++)shard(p,e.x+Math.cos(i)*30*f,e.y-18-Math.sin(f*Math.PI)*35,9,earth,i*.7);
  }else{
   const tone=pixelPalette(e.theme||(e.type==='death'?'shadow':'steel'));
   fragments(p,e.x,e.y-22,e.type==='death'?65:85,f,tone,count,35);
   if(e.type==='armorBreak')for(let i=0;i<4;i++)shard(p,e.x+Math.cos(i*1.6)*f*65,e.y-20-f*40,12,tone,i+f);
  }
 },{alpha:fade});
 return true;
}
