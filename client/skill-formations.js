/**
 * V3 skill-specific battle drawings. Q, E and R have fundamentally different
 * choreography; not the same class glyph scaled 3 times. All strokes are
 * nearest-neighbour PixelPainter commands in bounded local world coordinates.
 * Combat math and skill usage remain authoritative on the server.
 */
import {skillVisual} from '../shared/visuals.js';
import {jobArtProfile,JOB_ART_PROFILES} from './job-signatures.js';
const PI=Math.PI,TAU=2*PI;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const ease=n=>1-(1-clamp(n))**3;
const lerp=(a,b,f)=>a+(b-a)*f;
const IDS=Object.keys(JOB_ART_PROFILES);
const IDX=Object.freeze(Object.fromEntries(IDS.map((id,i)=>[id,i])));
const WEAPON_SHAPES=new Set(['sweep','crossSlash','runeSlash','blades','dance','daggers','scythe','eclipse','swords','lance','lances','shieldBash','fists','claws','wolves','runes']);
const PROJECTILE_SHAPES=new Set(['arrow','beam','cannon','rain','meteor','orb','threads','weave']);
export function formationIdentity(job,skill){
 const prof=jobArtProfile(job),s=skillVisual(job,skill);
 return Object.freeze({job:JOB_ART_PROFILES[job]?job:'novice',skill,weapon:prof.weapon,motif:prof.motif,tier:prof.tier,shape:s.shape,theme:s.theme});
}

export function paintSkillFormation(p,e,f,v,{lowPower=false,showEffects=true}={}){
 const job=JOB_ART_PROFILES[e.job]?e.job:'novice';
 const {shape,motif,tier}=formationIdentity(job,e.skill);
 const rank={novice:0,common:1,rare:2,epic:3,hidden:4}[tier]||0;
 const isUltimate=e.skill==='ultimate',isGuard=e.skill==='skill2';
 if(e.skill==='basic')return false;
 const t=clamp(f),impact=ease(clamp((t-.08)*2)),fade=1-clamp((t-.68)/.32);
 const sx=Number.isFinite(e.x)?e.x:0,sy=(Number.isFinite(e.y)?e.y:0)-24;
 const ex=Number.isFinite(e.tx)?e.tx:sx,ey=(Number.isFinite(e.ty)?e.ty:(Number.isFinite(e.y)?e.y:0))-24;
 const facing=Math.atan2(ey-sy,ex-sx||1);
 const ux=Math.cos(facing),uy=Math.sin(facing),nx=-uy,ny=ux;
 // Self-centered melee skills extend slightly in the direction of the target.
 const isSelf=(e.center==='self')&&!isGuard;
 const ox=isGuard?sx:isSelf?sx+ux*25:ex;
 const oy=isGuard?sy:isSelf?sy+uy*18:ey;
 const launch=PROJECTILE_SHAPES.has(shape)||shape==='lance'||shape==='lances'||shape==='wave';
 const x=launch&&!isGuard?lerp(sx,ox,impact):ox;
 const y=launch&&!isGuard?lerp(sy,oy,impact):oy;
 // Modest rare/heroic flourish; never scale giant opaque panels over the player.
 const size=(isUltimate?1.14:isGuard?.85:1)*(1+rank*.04);
 const primary=v.primary,light=v.light,ink=v.ink,deep=v.dark;
 const P=(a,b)=>[x+a*size,y+b*size];
 const L=(a,b,c,d,color=primary,width=4)=>p.line(...P(a,b),...P(c,d),color,Math.max(2,width*size));
 const O=(points,color=primary,width=4,closed=false)=>p.outline(points.map(([a,b])=>P(a,b)),color,Math.max(2,width*size),closed);
 const A=(a,b,r,color=primary,width=3,first=0,last=TAU)=>p.arc(...P(a,b),r*size,color,Math.max(2,width*size),.72,first,last);
 const D=(a,b,r=5,color=light)=>p.dot(...P(a,b),r*size,color);
 const G=(a,b,r=8,color=primary)=>p.diamond(...P(a,b),r*size,color);
 const S=(a,b,r=9,color=light)=>p.spark(...P(a,b),r*size,color,v.core);
 const Q=(pts,color=primary)=>p.poly(pts.map(([a,b])=>P(a,b)),color);
 const along=(n,tan=0)=>[ux*n+nx*tan,uy*n+ny*tan];
 const Slash=(offset=0,r=43,thick=5)=>{
   const arcs=[];const sweep=(.3+t*.85);
   for(let i=0;i<=9;i++){
     const a=facing+offset-1.65+sweep*(2.55*i/9);
     arcs.push([Math.cos(a)*r,Math.sin(a)*r*.73]);
   }
   O(arcs,ink,thick+3);O(arcs,primary,thick);O(arcs.slice(-4),light,2);S(...arcs.at(-1),6);
 };
 const Arrow=(distance=45,offset=0,barbed=false)=>{
   const start=along(-23,offset),tip=along(distance,offset),back=along(distance-14,offset);
   L(...start,...tip,ink,8);L(...start,...tip,light,3);
   const head=[[tip[0]+ux*7,tip[1]+uy*7],[back[0]+nx*8,back[1]+ny*8],[back[0]-nx*8,back[1]-ny*8]];
   Q(head,primary);
   if(barbed){L(...along(13,offset-8),...along(31,offset),primary,3);L(...along(13,offset+8),...along(31,offset),primary,3);}
 };
 const Star=(cx=0,cy=0,r=25,n=5,turn=-PI/2)=>{
   const pts=[];for(let i=0;i<n*2;i++){const a=turn+i*PI/n;const d=i%2?r*.43:r;pts.push([cx+Math.cos(a)*d,cy+Math.sin(a)*d]);}
   O(pts,primary,3,true);
 };
 const Spikes=(num=6,r=45,base=18)=>{for(let i=0;i<num;i++){const a=i*TAU/num+t*.12;L(Math.cos(a)*base,Math.sin(a)*base*.68,Math.cos(a)*r,Math.sin(a)*r*.68,i%2?primary:light,3);}};
 const Beads=(num=6,r=38,spin=1)=>{for(let i=0;i<num;i++){const a=i*TAU/num+t*spin;G(Math.cos(a)*r,Math.sin(a)*r*.74,4+i%3,i%2?primary:light);}};
 const Bolt=(offset=0,length=85)=>{
   const xx=offset*24;const pts=[[-9+xx,-length],[10+xx,-length*.69],[-4+xx,-length*.48],[12+xx,-length*.22],[0+xx,6]];
   O(pts,ink,9);O(pts,primary,5);O(pts,light,2);
 };
 const Flames=(count=4,power=1)=>{for(let i=0;i<count;i++){
   const xx=(i-(count-1)/2)*18,hh=(28+(i%3)*12)*power*(.4+.6*Math.sin(t*PI));
   O([[xx-8,14],[xx-6,-hh*.5],[xx+1,-hh],[xx+9,-hh*.38],[xx+7,14]],i%2?primary:light,4);
   L(xx+1,-hh*.34,xx+2,7,light,3);
 }};
 const Leaf=(a,b,s=1)=>Q([[a,b],[a+9*s,b-15*s],[a+19*s,b-19*s],[a+15*s,b-7*s]],primary);
 const Note=(a,b,k=1)=>{D(a,b+6,8*k,light);L(a+6,b+5,a+6,b-21*k,primary,4);L(a+6,b-21*k,a+18,b-18*k,light,3);};
 const Gear=(cx,cy,r=22,n=8)=>{A(cx,cy,r,primary,3);for(let i=0;i<n;i++){const a=i*TAU/n+t*.4;L(cx+Math.cos(a)*(r-5),cy+Math.sin(a)*(r-5),cx+Math.cos(a)*(r+7),cy+Math.sin(a)*(r+7),light,4);}D(cx,cy,7,deep);};
 const Wave=(shift=0,amp=12)=>{const pts=[];for(let i=0;i<=12;i++){const a=i/12;pts.push([-51+a*102,shift+Math.sin(a*PI*3-t*7)*amp]);}O(pts,primary,5);O(pts.slice(3,10),light,2);};
 const Shield=(r=28)=>{const pts=[[0,-r],[-r*.8,-r*.65],[-r*.68,r*.4],[0,r],[r*.68,r*.4],[r*.8,-r*.65]];O(pts,ink,9,true);O(pts,primary,5,true);L(0,-r*.6,0,r*.55,light,3);L(-r*.45,-r*.16,r*.45,-r*.16,light,3);};
 const Hourglass=(h=31)=>{O([[-18,-h],[18,-h],[0,0],[18,h],[-18,h],[0,0]],light,4,true);for(let i=0;i<3;i++)D(0,5+i*7-h*t*.3,4,primary);};
 const Eclipse=()=>{A(0,-6,32,primary,6,-1.7,2.1);A(9,-12,31,deep,3,0,2.9);G(-15,11,7,light);};
 const Ripple=(r=30)=>{A(0,7,r*(.58+.35*t),primary,4,-PI*.95,-PI*.05);A(0,7,r*(.72+.28*t),light,2,PI*.15,PI*.85);};
 const FxParticles=(num=7,r=55)=>{for(let i=0;i<num;i++){const a=i*2.39996+(t*.4),d=r*(.36+(i%4)*.18);D(Math.cos(a)*d,Math.sin(a)*d*.6-7,3+i%3,i%2?light:primary);}};
 const hand=(x0,y0)=>{L(x0-11,y0+12,x0+11,y0-10,ink,7);L(x0-11,y0+12,x0+11,y0-10,light,3);};
 const clazz=IDX[job]||0;

 if(!showEffects){ // Readable, job-specific silhouettes even with particles off.
   if(isGuard){
     if(['notes','stars','clock','runes'].includes(shape))Star(0,0,20,4+clazz%4);
     else if(['leaves','lotus','wings'].includes(shape))Beads(4+clazz%3,24);
     else if(['soul','spirits','flame'].includes(shape))Ripple(25);
     else Shield(18+clazz%3*2);
   }else if(WEAPON_SHAPES.has(shape)){
     Slash((clazz%5-2)*.12,24+clazz%4*3,3);
   }else if(launch){Arrow(28+clazz%5*3);}
   else Star(0,0,14+clazz%3,4+clazz%3);
   // A short asymmetric identity stroke distinguishes similar archetypes.
   L(-12+(clazz%8)*3,-28,4+(clazz%4)*4,-19,light,2);
   return true;
 }

 if(isGuard){
   // Every E skill is cast at the player's position, never at a distant enemy.
   switch(shape){
     case 'shield': Shield(31);Ripple(41);break;
     case 'barrier': Shield(24);A(0,0,41,light,3,PI*.16,PI*.85);Spikes(5,44,36);break;
     case 'fortress':for(const side of [-1,1]){Shield(20);L(side*34,-29,side*34,28,primary,5);G(side*34,-28,6);}break;
     case 'lotus':case 'leaves':case 'paw':for(let i=0;i<6;i++){const a=i*TAU/6+t*1.2,rx=Math.cos(a)*34,ry=Math.sin(a)*27;Leaf(rx,ry,.48);}Ripple(23);break;
     case 'cross':case 'bandage':L(-21,0,21,0,light,9);L(0,-23,0,21,light,9);Beads(4,30);break;
     case 'smoke':for(let i=0;i<5;i++){const xx=(i-2)*17;O([[xx,24],[xx-9,-8-14*t],[xx+7,-19-25*t],[xx+12,-34*t]],i%2?primary:deep,4);}break;
     case 'flame':Flames(4,.72);Ripple(27);break;
     case 'snow':case 'wind':for(let i=0;i<6;i++){const a=i*TAU/6+t;L(Math.cos(a)*14,Math.sin(a)*14,Math.cos(a)*41,Math.sin(a)*36,light,2);G(Math.cos(a)*38,Math.sin(a)*30,5);}break;
     case 'scope':A(0,0,32,primary,3);L(-46,0,46,0,light,2);L(0,-42,0,42,light,2);G(0,0,5);break;
     case 'notes':for(let i=0;i<5;i++)Note(-31+i*16,-17-(i%2)*12-t*20,.58);Wave(22,6);break;
     case 'gear':Gear(0,0,28);Gear(32,19,11,6);D(-32,-15,7,light);break;
     case 'clock':Hourglass(28);A(0,0,43,primary,3);L(0,0,Math.cos(t*TAU)*31,Math.sin(t*TAU)*31,light,3);break;
     case 'runes':Star(0,0,34,4,PI/4);Beads(6,41);break;
     case 'soul':case 'spirits':for(let i=0;i<5;i++){const a=i*TAU/5+t*.9;const xx=Math.cos(a)*31,yy=Math.sin(a)*27;G(xx,yy,8,i%2?primary:light);O([[xx,yy],[xx+7,yy-13],[xx,yy-22]],primary,2);}break;
     case 'rift':case 'eclipse':Eclipse();O([[-19,-21],[-8,-9],[4,-17],[16,9]],light,3);break;
     case 'wings':case 'dragon':for(let side of [-1,1]){O([[0,10],[side*19,-10],[side*42,-26],[side*37,8],[side*20,20]],side===1?primary:light,5);}break;
     case 'bubbles':for(let i=0;i<6;i++){const a=i*TAU/6+t;A(Math.cos(a)*30,Math.sin(a)*23,7+i%2*4,i%2?primary:light,2);}break;
     case 'stars':case 'crown':Star(0,0,29,6,t);Beads(5,40);break;
     case 'banner':L(-20,36,-20,-44,light,6);O([[-18,-43],[30,-35],[14,-16],[-18,-24]],primary,4,true);break;
     default:Ripple(31);Beads(6,35);break;
   }
   // Support magic is luminous and close to caster; no giant black vertical solid.
   if(t>.15){S(0,-11-11*t,7,light);if(rank>=3)FxParticles(lowPower?3:6,40);}
 }else{
   // Q and R attack effects are driven by their actual DIFFERENT skill shape,
   // not by the job's shared seal. Ultimate attacks have more stages/detail.
   const mult=isUltimate?1.24:1;
   switch(shape){
     case 'sweep':Slash(-.2,39*mult);if(motif==='bloodaxe'){Slash(.4,48,8);G(32,-10,8);}if(motif==='standard'){L(-18,38,-18,-43,light,5);O([[-15,-40],[21,-28],[8,-12],[-15,-17]],primary,4,true);}if(motif==='aegis')Shield(17);break;
     case 'crossSlash':Slash(-.6,42);Slash(.75,42);if(isUltimate)Spikes(7,56,35);break;
     case 'runeSlash':Slash(-.2,48);Star(0,0,25,6,t);if(isUltimate)Beads(8,45);break;
     case 'blades':case 'dance':case 'daggers':for(let i=0;i<(isUltimate?5:3);i++){Slash(-.8+i*.35,30+i*5,3);if(i%2===0)G(-23+i*15,21,5,light);}break;
     case 'scythe':case 'eclipse':Slash(.7,60,6);Eclipse();if(isUltimate)A(0,0,54,light,4,PI*.55,PI*1.66);break;
     case 'swords':for(let i=0;i<(isUltimate?5:3);i++){const xx=(i-(isUltimate?2:1))*25;O([[xx-7,-28-11*(i%2)],[xx,-51-11*(i%2)],[xx+7,-28-11*(i%2)],[xx,-3]],i%2?light:primary,4,true);L(xx,0,xx,20,light,3);}break;
     case 'lance':case 'lances':for(let i=0;i<(shape==='lances'?5:1);i++){const off=(i-(shape==='lances'?2:0))*12;Arrow(57+(i%2)*13,off,true);}if(isUltimate)FxParticles(8);break;
     case 'arrow':for(let i=0;i<(isUltimate?8:3);i++){const a=(i-(isUltimate?3.5:1))*.14;const dx=Math.cos(a)*64,dy=Math.sin(a)*42;L(-ux*15,-uy*15,dx,dy,i%2?light:primary,3);G(dx,dy,6);}break;
     case 'beam':L(...along(-65),...along(76),ink,isUltimate?13:9);L(...along(-65),...along(76),light,isUltimate?5:3);A(0,0,20,primary,3);if(isUltimate)Spikes(8,46,26);break;
     case 'cannon':Gear(-19,7,22,8);L(-8,0,70,0,ink,12);L(-8,0,70,0,light,5);for(let i=0;i<4;i++)S(43+i*8,Math.sin(i+t*6)*6,6,primary);break;
     case 'fists':for(let i=0;i<(isUltimate?7:4);i++){const xx=(i-2)*15,yy=(i%2?12:-15);L(xx-11,yy+10,xx+12,yy-10,i%2?light:primary,9);S(xx+9,yy-9,6);}break;
     case 'claws':case 'wolves':for(let i=-2;i<=2;i++){O([[i*9-17,-37],[i*12+5,-9],[i*14-2,28]],i%2?primary:light,4);}if(shape==='wolves')Beads(3,49);break;
     case 'shieldBash':Shield(26);O([[-30,20],[0,37],[31,20]],light,5);Spikes(6,52,29);break;
     case 'fortress':case 'rocks':case 'quake':for(let i=0;i<(isUltimate?7:4);i++){const xx=(i-(isUltimate?3:1.5))*22;O([[xx-12,18],[xx-11,-13-(i%3)*9],[xx,-25-(i%3)*8],[xx+13,-9],[xx+14,18]],i%2?primary:deep,5);L(xx,-10,xx+5,-26,light,3);}break;
     case 'flame':case 'inferno':Flames(isUltimate?7:4,isUltimate?1.45:1);if(isUltimate)Spikes(8,63,44);break;
     case 'icicles':case 'blizzard':for(let i=0;i<(isUltimate?9:5);i++){const xx=(i-(isUltimate?4:2))*17,drop=(i%3)*12;O([[xx-7,-30-drop],[xx,-67-drop+38*impact],[xx+7,-30-drop],[xx,19]],i%2?light:primary,3,true);}break;
     case 'lightning':case 'storm':for(let i=0;i<(isUltimate?5:3);i++)Bolt(i-(isUltimate?2:1),isUltimate?102:76);if(isUltimate)Spikes(7,66,48);break;
     case 'bomb':case 'alchemy':for(let i=0;i<6;i++){const a=i*TAU/6+t,rr=28+18*impact;A(Math.cos(a)*rr,Math.sin(a)*rr*.65,8+i%3*3,i%2?primary:light,3);}if(shape==='alchemy'){Gear(0,0,17,6);G(0,-25,6);}break;
     case 'spores':for(let i=0;i<(isUltimate?13:8);i++){const a=i*2.39996,rr=24+35*(i%4)/4;D(Math.cos(a)*rr,Math.sin(a)*rr*.6,6+i%3,i%2?primary:light);}O([[-31,24],[-17,-16],[0,-9],[13,-33],[31,-18]],primary,4);break;
     case 'vines':case 'garden':case 'tree':for(let i=0;i<(isUltimate?7:4);i++){const xx=(i-(isUltimate?3:1.5))*20;O([[xx,27],[xx-11,7],[xx+8,-15],[xx,-38-10*impact]],primary,4);Leaf(xx,-28,.67);}if(shape==='tree')O([[-34,-42],[0,-67],[35,-42]],light,5);break;
     case 'seasons':for(let i=0;i<4;i++){const a=i*PI/2+t*.35;G(Math.cos(a)*43,Math.sin(a)*31,8,i%2?light:primary);Leaf(Math.cos(a)*29,Math.sin(a)*22,.6);}Star(0,0,18,4,t);break;
     case 'notes':case 'symphony':for(let i=0;i<(isUltimate?9:5);i++)Note((i-(isUltimate?4:2))*14,-6-Math.sin(i+t*3)*20,.65);Wave(28,5);break;
     case 'clock':case 'timewarp':Hourglass(isUltimate?43:29);A(0,0,isUltimate?64:40,primary,3);L(0,0,Math.cos(t*6)*33,Math.sin(t*6)*33,light,3);break;
     case 'gear':case 'runes':Gear(0,0,isUltimate?43:27,shape==='gear'?12:6);for(let i=0;i<4;i++)G(Math.cos(i*PI/2+t)*44,Math.sin(i*PI/2+t)*32,6);break;
     case 'soul':case 'spirits':for(let i=0;i<(isUltimate?9:5);i++){const a=i*TAU/(isUltimate?9:5)+t*1.3,rr=32+19*impact;G(Math.cos(a)*rr,Math.sin(a)*rr*.68,7,i%2?primary:light);O([[Math.cos(a)*rr,Math.sin(a)*rr*.68],[Math.cos(a+0.2)*(rr+10),Math.sin(a+0.2)*(rr+10)]],primary,3);}break;
     case 'rift':case 'blackhole':case 'eclipse':Eclipse();O([[-43,-29],[-17,-6],[-28,13],[8,27],[36,-8]],light,5);if(isUltimate)Beads(9,66,-1);break;
     case 'wings':case 'phoenix':case 'dragon':for(const side of [-1,1]){O([[0,17],[side*19,-5],[side*49,-36],[side*41,5],[side*23,19]],side===1?primary:light,5);for(let j=0;j<3;j++)L(side*(20+j*10),-9-j*5,side*(32+j*9),19-j*5,light,2);}if(shape==='phoenix')Flames(3,1.1);if(shape==='dragon')Arrow(58,0,true);break;
     case 'wave':case 'tide':for(let i=0;i<(isUltimate?5:3);i++)Wave((i-1)*18,9+i*2);if(shape==='tide')for(let i=0;i<4;i++)A((i-2)*22,-22,8,light,2);break;
     case 'rain':for(let i=0;i<(isUltimate?9:6);i++){const xx=(i-(isUltimate?4:2.5))*17,fall=37+30*impact;L(xx-17,-fall,xx+8,19,i%2?light:primary,3);G(xx+8,19,5);}break;
     case 'meteor':for(let i=0;i<(isUltimate?5:2);i++){const xx=(i-(isUltimate?2:.5))*24;O([[xx+20,-62],[xx+5,-31],[xx-8,0],[xx-3,22]],primary,6);G(xx-3,19,10,light);}break;
     case 'orb':case 'burst':case 'supernova':Star(0,0,isUltimate?49:30,isUltimate?8:6,t);Spikes(isUltimate?10:6,isUltimate?71:46,20);S(0,0,14,light);break;
     case 'constellation':case 'stars':case 'threads':case 'weave':{
       const num=shape==='weave'?8:shape==='threads'?7:6;const nodes=[];
       for(let i=0;i<num;i++){const a=i*TAU/num+t*.27;nodes.push([Math.cos(a)*45,Math.sin(a)*35]);}
       for(let i=0;i<num;i++)O([nodes[i],nodes[(i+shape.length%3+2)%num]],i%2?light:primary,2);
       for(const xy of nodes)S(...xy,5,light);break;
     }
     case 'crown':O([[-35,-21],[-34,-55],[-17,-42],[0,-66],[17,-42],[34,-55],[35,-21]],light,5);Star(0,-28,15,5,t);break;
     case 'banner':L(-21,43,-21,-58,light,6);O([[-19,-57],[48,-43],[27,-15],[46,6],[-19,-13]],primary,5,true);Wave(32,6);break;
     case 'cross':L(-37,-15,37,-15,light,10);L(0,-52,0,28,primary,9);Beads(8,50);break;
     case 'pillars':for(let i=-2;i<=2;i++){L(i*26,22,i*26,-36-(i%2?15:0),i%2?primary:light,5);G(i*26,-39-(i%2?15:0),7);if(i%2===0)Star(i*26,5,8,4);}break;
     default:Star(0,0,27,5+clazz%4,t);FxParticles(6,50);break;
   }
   // For a few classes with the same type of spell, the physical weapon is
   // prominent too (guardian shield vs berserker axe vs marshal banner).
   if(motif==='bloodaxe'&&!isUltimate){O([[-19,-37],[25,-36],[19,-9]],light,6);}
   if(motif==='crosshair'){L(-53,0,53,0,light,2);L(0,-22,0,22,primary,2);}
   if(motif==='mineshaft'){O([[-36,8],[-24,-5],[10,-17],[30,17]],light,4);}
   if(motif==='whirlpool'&&shape==='tide'){A(0,0,43,light,3,t*2,t*2+PI*1.4);}
   if(motif==='hourglass'&&shape==='timewarp'){A(0,0,56,light,2,t*4,t*4+PI*1.8);}
   if(motif==='eclipse'&&shape==='eclipse'){Slash(.65,56,6);}
   if(motif==='spindle'&&shape==='weave'){G(0,0,14,light);}
   if(motif==='shepherd'&&shape==='blackhole'){for(let i=-1;i<=1;i++)O([[i*24,32],[i*26,-20],[i*19,-34]],primary,2);}
 }
 // Distinguishing micro-emblem: job-specific weapon index, asymmetric so two
 // bearers of similar elemental shapes never have identical signatures.
 const marks=(clazz%4)+2;const r=22+(clazz%5)*4+(isUltimate?21:0);
 p.alpha((.25+.30*fade)*Math.min(1,rank+1),()=>{
   for(let i=0;i<marks;i++){const a=(i+.6)*TAU/marks+(clazz%7)*.2;const rr=r+(i%2)*6;
     const xx=Math.cos(a)*rr,yy=Math.sin(a)*rr*.55;
     if((clazz+i)%3===0)G(xx,yy,4,primary);
     else L(xx-3,yy-4,xx+3,yy+4,i%2?light:primary,2);
   }
 });
 // Each formation visibly winds up, strikes and dissipates. The bright
 // moving tracer is small enough to avoid hiding the player underneath.
 if(t<.94){
   const a=t*TAU*.7+clazz*.17;
   p.alpha(.75*fade,()=>{
     S(Math.cos(a)*(18+rank*2),Math.sin(a)*13-27-9*t,4+3*Math.sin(PI*t),light);
     L(-11+24*t,-17-14*t,-4+24*t,-21-14*t,primary,2);
   });
 }
 if(isUltimate&&rank>=3){
   // Rarity is richer DETAIL, never an opaque pillar obstructing movement.
   for(let i=0;i<(lowPower?3:5);i++){
     const a=(i*TAU/5+t)*(motif==='eclipse'?-1:1),xx=Math.cos(a)*70,yy=Math.sin(a)*45;
     S(xx,yy,5+i%3,i%2?primary:light);
   }
 }
 return true;
}

/** Transient per-action avatar movement. Cosmetic only: server collision/position
 * and every saved coordinate remain untouched. */
export function attackMotionPose(job,skill,ageMs,dx=1,dy=0){
 const duration=skill==='ultimate'?850:skill==='skill2'?660:skill==='skill1'?530:340;
 if(!Number.isFinite(ageMs)||ageMs<0||ageMs>=duration)return {dx:0,dy:0,frame:0,active:false};
 const prof=jobArtProfile(job),motif=prof.motif,rank={novice:0,common:1,rare:2,epic:3,hidden:4}[prof.tier]||0;
 const t=ageMs/duration,s=Math.sin(PI*t),len=Math.hypot(dx,dy),vx=len>1e-4?dx/len:1,vy=len>1e-4?dy/len:0;
 const spear=['spearline','dragonfang','whirlpool'].includes(motif);
 const ranged=['falcon','crosshair','paw','turret','feather','spirit','spindle'].includes(motif);
 const magic=['aster','sanctuary','seed','pyre','snowflake','oak','score','flask','stormfork','hourglass','orion','architect','wraith'].includes(motif);
 const power=1+rank*.1;
 const forward=skill==='skill2'?-3.2:skill==='ultimate'?7.5:ranged?-3.4:magic?2.2:spear?8.2:skill==='skill1'?6.5:4.4;
 const leap=skill==='ultimate'?-9:skill==='skill2'?-3:magic?-4:-2;
 const dir=skill==='skill2'?-1:1;
 return {dx:Math.round(vx*forward*power*s*dir*10)/10,
   dy:Math.round((vy*Math.abs(forward)*power*s*dir+leap*s)*10)/10,
   frame:skill==='skill2'?Math.min(3,Math.floor(t*4)):spear?Math.min(3,Math.floor(t*5)):ranged?Math.min(3,Math.floor(t*3)):Math.min(3,Math.floor(t*4)),
   active:true};
}
