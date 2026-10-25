/**
 * Combat choreography v2. Every job draws its own weapon/element silhouette.
 * PixelPainter renders short, mostly transparent strokes; never cover the actor
 * with a giant opaque column, full-screen symbol or boss-style summoning disk.
 * Server damage/radius/cooldowns are intentionally not changed here.
 */
import {jobArtProfile} from './job-signatures.js';
const TAU=Math.PI*2;
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const ease=t=>1-(1-clamp(t,0,1))**3;
const mix=(a,b,t)=>a+(b-a)*t;
const TIERS={novice:0,common:1,rare:2,epic:3,hidden:4};
const BLADE_MOTIFS=new Set(['aegis','shadowsteps','spearline','mineshaft','bloodaxe','holyblade','citadel','runeblade','seal','afterimage','dragonfang','standard','eclipse','throne','lotusfist','wraith','shepherd']);
const MISSILE_MOTIFS=new Set(['falcon','crosshair','paw','turret','feather','spirit','spindle']);
export const jobEffectIdentity=job=>{
 const data=jobArtProfile(job);
 return {motif:data.motif,weapon:data.weapon,tier:data.tier,kind:BLADE_MOTIFS.has(data.motif)?'weapon':MISSILE_MOTIFS.has(data.motif)?'projectile':'spell'};
};
export function skillEffectBounds(e){
 const x=Number.isFinite(e.x)?e.x:0,y=Number.isFinite(e.y)?e.y:0;
 const tx=Number.isFinite(e.tx)?e.tx:x,ty=Number.isFinite(e.ty)?e.ty:y;
 const pad=e.skill==='ultimate'?162:e.skill==='skill2'?92:e.skill==='basic'?85:118;
 return {x:Math.min(x,tx)-pad,y:Math.min(y,ty)-pad-40,width:Math.abs(x-tx)+pad*2,height:Math.abs(y-ty)+pad*2+80};
}

export function paintCombatChoreography(p,e,f,palette,{lowPower=false,showEffects=true}={}){
 const profile=jobEffectIdentity(e.job||'novice'),motif=profile.motif,level=TIERS[profile.tier]||0;
 const skill=['basic','skill1','skill2','ultimate'].includes(e.skill)?e.skill:'skill1';
 const ultimate=skill==='ultimate',defense=skill==='skill2',basic=skill==='basic';
 const intensity=basic?.57:defense?.78:ultimate?1.38:1;
 const born=clamp(f,0,1),out=(1-born)**.5,grow=ease(Math.min(1,born*2.1));
 // Windup -> active swing -> release: different animation frames must not
 // look like a static floating icon pasted in front of the character.
 const pulse=.68+.39*Math.sin(Math.PI*born);
 const scale=intensity*(1+Math.max(0,level-1)*.055)*pulse;
 const sx=e.x,sy=e.y-22,tx=Number.isFinite(e.tx)?e.tx:sx+40,ty=(Number.isFinite(e.ty)?e.ty:e.y)-19;
 const dx=tx-sx,dy=ty-sy,angle=Math.hypot(dx,dy)>4?Math.atan2(dy,dx):-Math.PI/4;
 const travel=ease(clamp((born-.02)*1.9,0,1));
 const caster=defense||e.center==='self';
 const X=caster?sx:mix(sx,tx,travel),Y=caster?sy:mix(sy,ty,travel);
 const c=palette,ink=c.ink,primary=c.primary,light=c.light,core=c.core;
 const W=n=>Math.max(2,n*scale),R=n=>n*scale;
 const pt=(x,y)=>[X+x*scale,Y+y*scale];
 const line=(x1,y1,x2,y2,col=primary,w=3)=>p.line(...pt(x1,y1),...pt(x2,y2),col,W(w));
 const stroke=(points,col=primary,w=3,closed=false)=>p.outline(points.map(([x,y])=>pt(x,y)),col,W(w),closed);
 const circ=(x,y,r,col=primary,w=3,a=0,b=TAU)=>p.arc(...pt(x,y),R(r),col,W(w),.75,a,b);
 const bead=(x,y,r=4,col=light)=>p.dot(...pt(x,y),R(r),col);
 const gem=(x,y,r=7,col=primary)=>p.diamond(...pt(x,y),R(r),col);
 const flare=(x,y,r=10,col=light)=>p.spark(...pt(x,y),R(r),col,core);
 const shade=(x,y,r=7,col=c.dark)=>p.disk(...pt(x,y),R(r),col,.84);
 const polys=(list,col=primary)=>p.poly(list.map(([x,y])=>pt(x,y)),col);
 const weaponSlash=(turn=0,r=34,weight=5)=>{
  const a=angle+turn-(1-grow)*.34;const path=[];for(let j=0;j<=10;j++){
   const theta=a-1.0+j*2/10;path.push([Math.cos(theta)*r,Math.sin(theta)*r*.75]);
  }
  stroke(path,ink,weight+3);stroke(path,primary,weight);stroke(path.slice(4,9),light,2);
  flare(...path[9],6);
 };
 const thrust=(spread=0,length=55,barbed=false)=>{
  const a=angle+spread,ux=Math.cos(a),uy=Math.sin(a),nx=-uy,ny=ux;
  line(-ux*17,-uy*17,ux*length,uy*length,ink,9);
  line(-ux*17,-uy*17,ux*length,uy*length,primary,5);
  line(ux*8,uy*8,ux*length,uy*length,light,2);
  polys([[ux*(length+12),uy*(length+12)],
   [ux*(length-12)+nx*9,uy*(length-12)+ny*9],
   [ux*(length-6),uy*(length-6)],
   [ux*(length-12)-nx*9,uy*(length-12)-ny*9]],light);
  if(barbed)for(const side of [-1,1])line(ux*27+nx*side*10,uy*27+ny*side*10,ux*48,uy*48,light,2);
 };
 const links=(list,w=3)=>stroke(list,primary,w);
 const rays=(amount=6,r=36,rr=10)=>{
  for(let j=0;j<amount;j++){const a=j*TAU/amount+born*.3;
   line(Math.cos(a)*(r-rr),Math.sin(a)*(r-rr)*.75,Math.cos(a)*r,Math.sin(a)*r*.75,j%3?primary:light,2);
  }
 };
 const star=(points=5,r=21,rot=-Math.PI/2)=>{
  const path=[];for(let j=0;j<points*2;j++){const a=rot+j*Math.PI/points;path.push([Math.cos(a)*(j%2?r*.48:r),Math.sin(a)*(j%2?r*.48:r)]);}stroke(path,primary,3,true);
 };
 const lightning=(pts)=>{stroke(pts,ink,8);stroke(pts,primary,5);stroke(pts,light,2);};
 const petals=(num=5,r=27)=>{for(let j=0;j<num;j++){const a=j*TAU/num+born;
  gem(Math.cos(a)*r,Math.sin(a)*r*.8,4+(j%3),j%2?light:primary);}};
 const wave=(shift=0,length=53,amp=10)=>{const points=[];for(let j=0;j<=12;j++){const t=j/12;
  points.push([-length/2+length*t,shift+Math.sin(t*TAU+born*6)*amp*t]);}links(points,4);stroke(points.slice(3,11),light,2);};
 const dotTrail=(start,finish,n=5)=>{for(let j=0;j<n;j++){const t=j/(n-1),alpha=1-t;
  p.alpha(alpha*.65,()=>p.dot(mix(start[0],finish[0],t),mix(start[1],finish[1],t),2+j%3,primary));}};
 const stone=(x,y,k=1)=>{polys([[x-6*k,y+6*k],[x-8*k,y-4*k],[x+2*k,y-12*k],[x+9*k,y-2*k],[x+6*k,y+6*k]],c.dark);line(x-2*k,y+3*k,x+3*k,y-7*k,light,2);};
 const miniStaff=()=>{line(-14,30,10,-33,c.dark,7);line(-14,30,10,-33,primary,3);gem(10,-35,10,light);};
 const active=showEffects;
 // Extremely rare and ultimate skills gain intricate *strokes*, not giant opaque icons.
 if((ultimate||level>=3)&&active){const amount=lowPower?4:level>=4?9:6;
  for(let i=0;i<amount;i++){const a=i*TAU/amount+born*.8,rad=(ultimate?57:38)+(i%2)*9;
   p.alpha((ultimate?.73:.45)*out,()=>bead(Math.cos(a)*rad,Math.sin(a)*rad*.7-6,i%3+3,i%2?primary:light));
  }
 }
 if(defense&&active){circ(0,11,27,primary,3,-Math.PI*.9,-Math.PI*.1);circ(0,11,31,c.dark,2,Math.PI*.1,Math.PI*.85);}
 
 switch(motif){
  case 'trail':weaponSlash(0,33,4);break;
  case 'aegis':{
   weaponSlash(-.1,33,4);polys([[-23,-18],[-2,-27],[17,-12],[12,10],[-9,23],[-24,9]],c.dark);
   stroke([[-23,-18],[-2,-27],[17,-12],[12,10],[-9,23],[-24,9]],light,3,true);line(-5,-12,-5,10,light,3);break;}
  case 'falcon':{
   if(!defense)thrust(0,53,1);for(const side of [-1,1])stroke([[side*5,8],[side*19,-7],[side*28,-20],[side*39,-23]],side===1?primary:light,3);break;}
  case 'aster':{star(6,22,Math.PI/6+born*.25);circ(0,0,29,primary,2);bead(0,0,7,light);petals(5,34);break;}
  case 'shadowsteps':{weaponSlash(-.6,26,3);weaponSlash(.9,23,3);stroke([[-29,-19],[-10,-27],[10,-9]],c.dark,3);petals(3,26);break;}
  case 'sanctuary':{circ(0,3,26,light,3);line(-22,0,22,0,light,5);line(0,-26,0,25,primary,5);rays(8,39,8);break;}
  case 'spearline':{thrust(0,67,true);for(let k=-1;k<=1;k++)line(-8,-8+k*8,18,1+k*8,light,2);break;}
  case 'lotusfist':{for(let i=-1;i<=1;i++){const x=i*17-2,y=i%2?-8:4;
   shade(x,y,10,primary);gem(x+4,y-5,6,light);}petals(6,29);break;}
  case 'seed':{stroke([[0,26],[6,8],[-10,-10],[-3,-24]],primary,5);for(const s of [-1,1]){
   polys([[s*5,9],[s*22,-1],[s*24,-14],[s*12,-6]],primary);gem(s*12,-21,5,light);}break;}
  case 'mineshaft':{line(-27,-24,23,24,c.dark,9);line(-27,-24,23,24,light,4);
   stroke([[-38,-29],[-13,-39],[17,-30],[33,-21]],primary,9);for(let j=0;j<4;j++)stone(-20+j*13,16+(j%2)*10,.55);break;}
  case 'bloodaxe':{weaponSlash(-.35,51,9);line(-16,30,8,-34,ink,10);line(-16,30,8,-34,light,4);
   polys([[8,-29],[28,-37],[35,-11],[12,-10]],primary);for(let j=0;j<4;j++)bead(-17+j*12,28+j%2*5,4,primary);break;}
  case 'holyblade':{weaponSlash(.1,41,5);thrust(-.2,41);flare(0,-29,17,light);rays(7,43,8);break;}
  case 'citadel':{for(let j=0;j<3;j++)stone((j-1)*22,5,1.3);stroke([[-33,-13],[33,-13],[33,21],[-33,21]],primary,4,true);flare(0,-17,10);break;}
  case 'crosshair':{const rad=23+(1-grow)*7;circ(0,0,rad,primary,3);
   for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])line(Math.cos(a)*26,Math.sin(a)*26,Math.cos(a)*38,Math.sin(a)*38,light,3);
   bead(0,0,3,light);if(!defense)line(-45,0,45,0,light,2);break;}
  case 'paw':{for(let j=0;j<4;j++){const x=(j-1.5)*13;bead(x,-14-Math.abs(j-1.5)*4,6,primary);}shade(0,9,16,primary);petals(3,36);break;}
  case 'runeblade':{weaponSlash(-.35,41,5);for(let j=0;j<4;j++)gem((j-1.5)*13,-25+Math.sin(j+born*4)*5,5,light);break;}
  case 'pyre':{for(let j=-1;j<=1;j++){
    polys([[j*20-8,17],[j*20-6,-9],[j*20+2,-33-(j%2)*12-8*Math.sin(born*9+j)],[j*20+10,-11],[j*20+9,17]],primary);
    polys([[j*20-3,13],[j*20+1,-14],[j*20+5,10]],light);}for(let j=0;j<4;j++)bead(j*14-21,-32-j%2*7,4,light);break;}
  case 'snowflake':{for(let j=0;j<6;j++){const a=j*TAU/6;line(0,0,Math.cos(a)*41,Math.sin(a)*37,light,3);
   const x=Math.cos(a)*25,y=Math.sin(a)*22;line(x-5,y-6,x+5,y+6,primary,2);}
   gem(0,0,8,light);break;}
  case 'oak':{stroke([[0,32],[2,16],[0,-13],[-13,-29]],c.dark,9);stroke([[0,32],[0,-17],[17,-33]],primary,5);
   for(let j=0;j<6;j++){const a=j*TAU/6;gem(Math.cos(a)*29,Math.sin(a)*23-7,7,j%2?light:primary);}break;}
  case 'score':{for(let i=0;i<4;i++)line(-41,-18+i*9,41,-18+i*9,c.dark,2);
   for(let j=0;j<5;j++){const x=-31+j*16,y=-6+(j%3)*8;shade(x,y,7,primary);line(x+5,y,x+5,y-22,light,3);}wave(27,72,6);break;}
  case 'flask':{polys([[-10,-30],[10,-30],[9,-14],[24,16],[13,26],[-13,26],[-24,16],[-9,-14]],c.dark);
   stroke([[-10,-30],[10,-30],[9,-14],[24,16],[13,26],[-13,26],[-24,16],[-9,-14]],light,4,true);
   for(let j=0;j<5;j++)bead(-17+j*8,-23-(j%3)*7,4,primary);break;}
  case 'turret':{p.rect(...pt(-28,6),R(56),R(22),c.dark);p.rect(...pt(-22,0),R(35),R(13),primary);
   line(8,-1,48,-1,c.dark,11);line(8,-1,48,-1,light,5);circ(-12,18,10,light,4);
   for(let j=0;j<4;j++)bead(54+j*9,Math.sin(j+born*5)*6-2,5-j%2,light);break;}
  case 'seal':{star(4,32,Math.PI/4);circ(0,0,24,primary,3);weaponSlash(.2,46,5);petals(4,43);break;}
  case 'afterimage':{for(let j=0;j<3;j++){const dx=(j-1)*14,alpha=(j+1)*.24;
   p.alpha(alpha,()=>{line(-27+dx,-26,25+dx,22,light,5);line(-23+dx,20,22+dx,-27,primary,4);});}break;}
  case 'stormfork':{lightning([[-30,-47],[-11+8*Math.sin(born*12),-24],[-19,-11],[8+5*Math.cos(born*10),5],[1,29]]);
   lightning([[22,-38],[4-6*Math.sin(born*14),-15],[14,1],[-8,22]]);for(let j=0;j<4;j++)bead(-24+j*14,31,4,light);break;}
  case 'wraith':{circ(0,-9,26,primary,4,Math.PI*.12,Math.PI*1.8);
   for(let j=-1;j<=1;j++){gem(j*20,-20+(j%2)*8,7,light);stroke([[j*19,0],[j*27,16],[j*18,32]],c.dark,4);}break;}
  case 'hourglass':{stroke([[-18,-30],[18,-30],[0,0],[18,30],[-18,30],[0,0]],primary,4,true);
   line(-18,-30,18,-30,light,4);line(-18,30,18,30,light,4);for(let j=0;j<4;j++)bead(0,-12+j*9+(born*7)%9,3,light);break;}
  case 'spirit':{for(let j=0;j<4;j++){const a=j*TAU/4+born*1.8,x=Math.cos(a)*33,y=Math.sin(a)*27;
   circ(x,y,8,primary,2);bead(x,y,4,light);line(0,0,x*.74,y*.74,c.dark,2);}break;}
  case 'dragonfang':{thrust(-.15,67,true);for(const side of [-1,1])stroke([[0,0],[side*28,-17],[side*43,-32],[side*56,-29]],light,4);
   for(let j=0;j<3;j++)bead(-20+j*18,-35,5,primary);break;}
  case 'orion':{const nodes=[[-34,10],[-18,-25],[8,-39],[29,-13],[25,26],[-10,33]];
   stroke(nodes,primary,3,true);for(const [x,y]of nodes)flare(x,y,6,light);star(5,17,Math.PI/7);break;}
  case 'standard':{line(-26,39,-26,-45,ink,9);line(-26,39,-26,-45,light,4);
   polys([[-23,-45],[36,-32],[13,-12],[30,6],[-23,-8]],c.dark);
   stroke([[-23,-45],[36,-32],[13,-12],[30,6],[-23,-8]],primary,5,true);wave(18,69,6);break;}
  case 'voidtear':{stroke([[-29,-27],[-10,-13],[-19,0],[6,9],[-4,33]],primary,6);
   stroke([[18,-33],[7,-15],[23,0],[7,16],[29,29]],light,3);for(let j=0;j<5;j++)bead(-28+j*13,Math.sin(j*3+born*2)*23,3,c.dark);break;}
  case 'eclipse':{circ(0,-4,32,primary,6,.25,Math.PI*1.9);circ(8,-11,30,c.dark,4,Math.PI*.3,Math.PI*1.2);
   weaponSlash(.5,47,5);gem(-23,20,7,light);break;}
  case 'feather':{for(const side of [-1,1]){
   for(let j=0;j<4;j++)stroke([[0,12],[side*(16+j*8),-5-j*5],[side*(19+j*11),-15-j*8]],j%2?light:primary,3);
   }for(let j=0;j<4;j++)gem(j*13-20,27,5,primary);break;}
  case 'whirlpool':{for(let i=0;i<3;i++)circ(0,0,16+i*11,i%2?light:primary,4,born*1.5+i,born*1.5+i+Math.PI*1.36);
   thrust(-.1,40,true);bead(0,0,7,light);break;}
  case 'spindle':{const nodes=Array.from({length:6},(_,i)=>[Math.cos(i*TAU/6+born*.7)*36,Math.sin(i*TAU/6+born*.7)*30]);
   for(let j=0;j<nodes.length;j++){line(...nodes[j],...nodes[(j+2)%nodes.length],j%2?light:primary,2);gem(...nodes[j],5,primary);}break;}
  case 'throne':{weaponSlash(-.15,48,6);stroke([[-35,-20],[-38,-47],[-16,-33],[0,-54],[16,-33],[38,-47],[35,-20]],light,4);
   gem(0,-31,9,primary);break;}
  case 'architect':{circ(0,0,36,primary,4);for(let j=0;j<10;j++){const a=j*TAU/10+born*.3;
   line(Math.cos(a)*31,Math.sin(a)*31,Math.cos(a)*43,Math.sin(a)*43,light,3);}circ(0,0,13,light,3);
   for(let j=0;j<3;j++)stroke([[j*18-34,-39],[j*18-34,37],[j*18-15,37]],c.dark,2);break;}
  case 'shepherd':{line(-25,38,-25,-30,light,7);circ(-9,-31,17,primary,6,Math.PI*1.02,Math.PI*2.03);
   for(let j=0;j<4;j++){const a=j*TAU/4+born*1.6,x=Math.cos(a)*29+12,y=Math.sin(a)*24;
    circ(x,y,8,primary,2);bead(x,y,4,light);}break;}
  default:{miniStaff();flare(0,0,11);}
 }
 if(active&&!lowPower){
  const particles=basic?2:defense?3:ultimate?6:4;
  for(let j=0;j<particles;j++){const a=j*2.399+born*.8,rad=(12+j*7)*grow;
   p.alpha(.72*out,()=>bead(Math.cos(a)*rad,Math.sin(a)*rad*.63-(j%2)*12,2+(j%3),j%2?primary:light));
  }
 }
 if(ultimate&&active){
  // Finishers follow the weapon and lore. A repeated generic circular halo
  // previously made ALL 38 ultimate abilities look like the same recolor.
  const m=1+level*.12,phase=(born-.25)*Math.PI;
  switch(motif){
   case 'aegis':case 'citadel':case 'holyblade':case 'sanctuary':
    for(let i=0;i<4;i++){
     const x=(i-1.5)*24,y=32+Math.abs(i-1.5)*7;
     stroke([[x-13,y+2],[x,y-28],[x+13,y+2]],i%2?light:primary,3);
    }break;
   case 'bloodaxe':case 'mineshaft':case 'dragonfang':
    for(let i=0;i<4;i++){const a=angle+(i-1.5)*.36;
     stroke([[Math.cos(a)*28,Math.sin(a)*28],[Math.cos(a)*78,Math.sin(a)*78]],i%2?primary:light,i%2?5:3);
     stone(Math.cos(a)*69,Math.sin(a)*50,.5);
    }break;
   case 'spearline':case 'runeblade':case 'seal':case 'throne':
    for(let i=-1;i<=1;i++){const a=i*.38+phase*.12;
     const x=Math.cos(a)*62,y=Math.sin(a)*35;
     line(0,i*13,x,y,i?primary:light,3);gem(x,y,7,i?primary:light);
    }break;
   case 'shadowsteps':case 'afterimage':case 'eclipse':case 'wraith':case 'voidtear':
    for(let i=0;i<4;i++){const a=angle+i*.7-1.1;
     stroke([[Math.cos(a)*18,Math.sin(a)*18-5],[Math.cos(a+.3)*62,Math.sin(a+.3)*46]],i%2?primary:light,4);
    }break;
   case 'falcon':case 'crosshair':case 'paw':case 'turret':
    for(let i=-2;i<=2;i++){const a=angle+i*.12,dist=40+i%2*9;
     stroke([[-Math.cos(a)*dist,-Math.sin(a)*dist],[Math.cos(a)*83,Math.sin(a)*65]],i%2?primary:light,3);
    }break;
   case 'feather':case 'spirit':case 'seed':case 'oak':case 'lotusfist':
    for(let i=0;i<7;i++){const a=i*TAU/7+born;
     gem(Math.cos(a)*69,Math.sin(a)*48,5+(i%3)*2,i%2?light:primary);
    }break;
   case 'pyre':case 'stormfork':case 'snowflake':case 'whirlpool':
    for(let i=-2;i<=2;i++){
     stroke([[i*22,-75],[i*19+Math.sin(i+born*4)*9,-36],[i*14,20]],i%2?primary:light,3);
     flare(i*15,24,8,light);
    }break;
   case 'score':case 'spindle':case 'orion':case 'aster':case 'hourglass':case 'architect':
    for(let i=0;i<6;i++){const a=i*TAU/6+born*.38;
     const r=63+i%2*12;line(Math.cos(a)*r,Math.sin(a)*r*.7,Math.cos(a+1.7)*r*.65,Math.sin(a+1.7)*r*.5,i%2?primary:light,2);
     gem(Math.cos(a)*r,Math.sin(a)*r*.7,4,light);
    }break;
   default:
    for(let i=0;i<6;i++){const a=i*TAU/6+born*1.2;
     line(Math.cos(a)*42,Math.sin(a)*36,Math.cos(a+.15)*71,Math.sin(a+.15)*56,primary,3);
     bead(Math.cos(a)*71,Math.sin(a)*56,4,i%2?light:primary);
    }break;
  }
  // Hidden effects are brighter and more intricate, but stay sparse enough
  // that terrain, enemies, damage numbers and the player remain readable.
  if(level>=3)for(let i=0;i<level+2;i++){
   const a=(i*.92+(motif.length%7)*.37)+born*.65,r=46+(i%3)*13;
   p.alpha(out*.8,()=>flare(Math.cos(a)*r,Math.sin(a)*r*.76-9,4+(i%2)*3,i%2?light:primary));
  }
 }
 // Tiny directional travel streak for all ranged professions; a short glyph
 // remains visible even when the projectile has already reached the target.
 if(profile.kind==='projectile'&&!defense){const head=[X,Y],tail=[mix(sx,tx,Math.max(0,travel-.18)),mix(sy,ty,Math.max(0,travel-.18))];
  if(Math.hypot(head[0]-tail[0],head[1]-tail[1])>5)dotTrail(tail,head,lowPower?3:5);
 }
}
