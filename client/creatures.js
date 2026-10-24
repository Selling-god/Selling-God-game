// Small, articulated pixel sprites. The server's attack clock selects every pose;
// the renderer never invents a damaging attack or changes an entity's hit position.
const TAU=Math.PI*2,cache=new Map(),W=88,H=96;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const CREATURE_CACHE_LIMIT=384;
export function creatureMetrics(def){
 const scale=def.creature?.scale||1,unit=(def.boss?1.05:1.3)*scale;
 return {unit,height:Math.ceil(72*unit)+8,shadow:Math.min(44,12*unit),width:72*unit};
}
export function creatureHitTest(def,mob,point){
 if(!def?.creature)return Math.hypot(mob.x-point.x,mob.y-point.y)<(def?.boss?60:34);
 const {unit}=creatureMetrics(def),dx=Math.abs(point.x-mob.x),dy=mob.y-point.y;
 return dx<=31*unit&&dy>=-8&&dy<=66*unit;
}
export function creatureFrame(mob,now){
 const p=mob.encounterPose||{},active=p.kind!=='idle'&&!['idle','move'].includes(p.stage)&&p.ends>now&&p.starts<=now;
 const progress=active?clamp((now-p.starts)/Math.max(1,p.ends-p.starts),0,.999):0;
 return {kind:active?p.kind:'idle',stage:active?p.stage:'idle',frame:active?Math.floor(progress*8):Math.floor(now/(mob.moving?110:310))%4,
  phase:clamp(mob.phase||0,0,2),form:mob.encounterForm,moving:!!mob.moving,dir:mob.dir||'s',burrowed:active&&p.burrowed};
}
class Ink{
 constructor(c){this.c=c;}
 rect(x,y,w,h,color){this.c.fillStyle=color;this.c.fillRect(Math.round(x+44),Math.round(y+80),Math.max(1,Math.round(w)),Math.max(1,Math.round(h)));}
 line(x0,y0,x1,y1,color,width=1){
  x0=Math.round(x0);y0=Math.round(y0);x1=Math.round(x1);y1=Math.round(y1);
  const dx=Math.abs(x1-x0),dy=-Math.abs(y1-y0),sx=x0<x1?1:-1,sy=y0<y1?1:-1;let err=dx+dy;
  for(let i=0;i<160;i++){this.rect(x0,y0,width,width,color);if(x0===x1&&y0===y1)break;const e=err*2;if(e>=dy){err+=dy;x0+=sx;}if(e<=dx){err+=dx;y0+=sy;}}
 }
 poly(points,color){
  const pts=points.map(([x,y])=>[Math.round(x),Math.round(y)]),low=Math.min(...pts.map(p=>p[1])),high=Math.max(...pts.map(p=>p[1]));
  for(let y=low;y<=high;y++){
   const xs=[];for(let i=0,j=pts.length-1;i<pts.length;j=i++){const a=pts[j],b=pts[i];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))xs.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}
   xs.sort((a,b)=>a-b);for(let i=0;i+1<xs.length;i+=2)this.rect(Math.ceil(xs[i]),y,Math.floor(xs[i+1])-Math.ceil(xs[i])+1,1,color);
  }
 }
 oval(x,y,rx,ry,color){for(let yy=-Math.floor(ry);yy<=ry;yy++){const span=Math.floor(rx*Math.sqrt(Math.max(0,1-yy*yy/(ry*ry))));this.rect(x-span,y+yy,span*2+1,1,color);}}
}
const QUADS=new Set(['wolf','fox','hound','ram','hare','gryphon','chimera','kirin','lizard','salamander']);
const BIRDS=new Set(['vulture','owl','harpy','phoenix','roc']);
const BUGS=new Set(['scarab','spider','mantis','crab','scorpion']);
const HUMANS=new Set(['knight','automaton','yeti','golem','gargoyle']);
const SPIRITS=new Set(['wraith','eye','jellyray','drone']);
const PLANTS=new Set(['sprout','mushroom','mandrake','treant','coral']);

export function paintCreature(c,def,state){
 const creature=def.creature||{},form=creature.form||'sprout',features=new Set(creature.features||[]),pal=creature.palette||['#152035','#38435a','#7384a1','#c3d5d1','#efe0a3'];
 const [ink,dark,mid,light,accent]=pal,p=new Ink(c),u=state.frame/7,wind=state.stage==='windup',hit=['strike','active'].includes(state.stage),rest=state.stage==='recover';
 const motion=state.moving?(state.frame%2?2:-2):0,kind=state.kind,phase=state.phase||0;
 const charge=/charge|rush|dash|lunge/.test(kind),slam=/slam|smash|stomp|hammer|guard/.test(kind),shoot=/shoot|shot|projectile|spit|beam|laser|fan|volley|breath|ranged|poison/.test(kind);
 const summon=/summon|chant|echo/.test(kind),jump=/leap|jump|pounce|meteor/.test(kind),dig=/burrow|emerge/.test(kind);
 const attack=hit?5:wind?-3-Math.round(u*3):rest?2:0;
 let y=state.moving?Math.abs(motion)/2:state.frame%2;
 if(wind&&(charge||jump||slam))y+=3+Math.round(u*3);
 if(hit&&jump)y-=Math.round(18*Math.sin((u*.7+.15)*Math.PI));
 if(dig){if(state.burrowed||(wind&&u>.55)){p.oval(0,-1,15,3,dark);for(let i=0;i<5;i++)p.rect(-14+i*6,-4-(i%2)*2,3,2,light);return;}y+=wind?Math.round(u*15):hit?Math.round((1-u)*12):0;}
 if(creature.hover)y-=5+Math.round(Math.sin(state.frame*Math.PI/2)*2);
 const R=(x,yy,w,h,col)=>p.rect(x,yy+y,w,h,col),O=(x,yy,rx,ry,col)=>p.oval(x,yy+y,rx,ry,col),L=(x,yy,tx,ty,col,w=1)=>p.line(x,yy+y,tx,ty+y,col,w),P=(pts,col)=>p.poly(pts.map(([x,yy])=>[x,yy+y]),col);
 const eye=(x,yy,w=2)=>{R(x-1,yy-1,w+2,3,ink);R(x,yy,w,1,accent);};
 const horn=(x,yy,sign)=>{P([[x,yy],[x+sign*5,yy-8],[x+sign*4,yy-1]],ink);L(x+sign,yy-1,x+sign*4,yy-6,light,2);};
 const wing=(side,yy,large=false)=>{
  const lift=wind&&shoot?-8:hit?-2:(state.frame%2?-6:2),span=(large?29:22)+phase*2;
  P([[side*5,yy],[side*span,yy-14+lift],[side*(span-3),yy+4],[side*19,yy],[side*14,yy+9],[side*7,yy+4]],ink);
  P([[side*6,yy],[side*(span-3),yy-11+lift],[side*19,yy],[side*14,yy+5]],mid);
  L(side*7,yy,side*(span-4),yy-10+lift,light,2);L(side*13,yy-2,side*18,yy+2,accent,1);
 };
 // Wing and tail silhouettes are rendered behind the articulated body.
 if(['dragon','gryphon','chimera','gargoyle'].includes(form)||features.has('wings')||features.has('clockwings')){wing(-1,-28,true);wing(1,-28,true);}
 if(QUADS.has(form)){
  const head=charge?attack:Math.round(attack*.6),bodyY=charge&&wind?2:0;
  // Four legs use separate diagonal gait phases; a lunge tucks the hind legs.
  for(const [i,x]of [-13,-5,6,12].entries()){const k=i%2?-motion:motion,fold=jump&&hit?-5:0;L(x,-14+bodyY,x+k+(i<2?-attack:attack),-3+fold,dark,4);R(x+k-1+(i<2?-attack:attack),-4+fold,6,4,ink);R(x+k+(i<2?-attack:attack),-3+fold,3,1,light);}
  L(-13,-21,-25,-25+motion,ink,5);L(-17,-24,-27,-31+motion,mid,3);
  O(0,-21+bodyY,17,10,ink);O(0,-23+bodyY,15,8,mid);O(-4,-26+bodyY,9,4,light);
  O(12+head,-29,9,9,ink);O(12+head,-30,7,7,mid);P([[15+head,-28],[27+head,-26],[25+head,-21],[14+head,-22]],ink);R(17+head,-27,9,4,light);R(25+head,-26,3,2,dark);eye(14+head,-31);
  if(form==='hare'){R(7+head,-51,4,17,ink);R(14+head,-48,4,14,ink);R(8+head,-49,2,13,light);R(15+head,-46,2,10,accent);O(-17,-20,4,4,light);}
  else if(form==='ram'){O(9+head,-34,7,6,ink);O(9+head,-34,5,4,accent);O(10+head,-34,3,2,dark);}
  else if(form==='lizard'||form==='salamander'){P([[6+head,-30],[-3+head,-39],[-7+head,-27],[2+head,-22]],dark);L(-15,-23,-33,-13,mid,5);for(let i=0;i<4;i++)R(-10+i*6,-29,3,3,accent);if(form==='salamander')P([[-31,-14],[-37,-19],[-33,-6],[-21,-12]],accent);}
  else {P([[7+head,-34],[7+head,-43],[13+head,-36]],ink);P([[14+head,-35],[20+head,-42],[20+head,-32]],ink);R(9+head,-39,2,4,light);}
  if(['hound','chimera'].includes(form))for(let i=0;i<5;i++){P([[-14+i*5,-29],[-11+i*5,-37-(i%2)*3],[-8+i*5,-29]],accent);}
  if(form==='fox'){P([[-13,-21],[-33,-27],[-35,-40],[-27,-33],[-15,-29]],mid);P([[-35,-40],[-32,-30],[-27,-33]],light);}
  if(form==='gryphon'){P([[17+head,-29],[30+head,-26],[22+head,-20]],accent);R(7+head,-36,8,3,light);}
  if(form==='chimera'){O(-8,-36,7,7,dark);horn(-11,-39,-1);eye(-5,-38);}
  if(form==='kirin'){for(const s of [-1,1]){L(10+head,-37,10+s*8+head,-55,accent,2);L(10+s*6+head,-49,10+s*14+head,-53,light,2);}L(-6,-29,-20,-39,light,3);L(-20,-39,-26,-35,accent,2);}
 }else if(BIRDS.has(form)){
  wing(-1,-27);wing(1,-27);
  for(const side of [-1,1]){L(side*5,-12,side*6+motion,-2,accent,2);R(side*6+motion-3,-2,7,2,ink);}
  P([[-8,-13],[0,2],[8,-13]],dark);O(0,-24,11,16,ink);O(0,-26,9,13,mid);O(1,-22,6,9,light);
  O(1,-40,9,8,ink);O(1,-40,7,6,mid);eye(-4,-42);eye(5,-42);
  P([[1,-39],[10+attack,-36],[1,-33]],accent);
  if(form==='owl'){O(-4,-41,4,4,light);O(5,-41,4,4,light);eye(-4,-42);eye(5,-42);horn(-7,-44,-1);horn(7,-44,1);}
  if(form==='harpy'){L(-9,-23,-18-attack,-13,light,3);L(9,-23,18+attack,-13,light,3);R(-6,-50,14,5,dark);}
  if(form==='phoenix'){for(let i=0;i<4;i++)P([[-6+i*4,-12],[-10+i*6,8-i%2*6],[-2+i*4,-13]],i%2?accent:light);horn(-3,-47,-1);horn(4,-47,1);}
  if(form==='vulture'){R(-3,-39,7,12,accent);R(-8,-30,16,4,light);}
  if(form==='roc'){for(const s of [-1,1]){P([[s*17,-27],[s*30,-38],[s*28,-22],[s*22,-26]],accent);L(s*5,-11,s*12,6,light,2);}R(-2,-52,5,8,accent);}
 }else if(BUGS.has(form)){
  const legs=form==='spider'?4:3;
  for(const side of [-1,1])for(let i=0;i<legs;i++){const yy=-23+i*7,bend=(i%2?motion:-motion);L(side*9,yy,side*(22+(i%2)*3),yy-5+bend,ink,3);L(side*(22+(i%2)*3),yy-5+bend,side*(25+(i%2)*3),yy+7+bend,mid,2);}
  O(0,-17,form==='scarab'?13:10,13,ink);O(0,-19,form==='scarab'?11:8,10,mid);O(-3,-22,5,7,light);
  if(form==='scarab'){L(0,-30,0,-7,dark,2);R(-7,-23,3,3,accent);R(5,-15,3,3,accent);horn(0,-30,1);}
  if(form==='crab'||form==='scorpion')for(const side of [-1,1]){const clawY=wind?-34-u*8:hit?-15:-27;L(side*8,-24,side*20,clawY,ink,5);O(side*(23+attack),clawY-2,7,7,ink);O(side*(23+attack),clawY-3,5,5,mid);R(side*(23+attack)-1,clawY-10,3,8,dark);}
  if(form==='mantis'){O(0,-34,8,6,ink);P([[-6,-35],[7,-35],[0,-26]],light);for(const s of [-1,1]){L(s*6,-29,s*(17+attack),-41+(hit?18:0),mid,3);L(s*(17+attack),-41+(hit?18:0),s*11,-25+(hit?15:0),accent,3);}}
  if(form==='scorpion'){L(0,-26,-5,-47,ink,5);L(-5,-47,9,-53,mid,4);P([[7,-54],[15,-48],[10,-43]],accent);}
  O(0,-28,7,5,ink);eye(-4,-29);eye(3,-29);
  if(form==='spider'){for(const x of [-6,-2,2,6])R(x,-31,2,2,accent);P([[-5,-25],[-3,-18],[-1,-25]],light);P([[1,-25],[3,-18],[5,-25]],light);}
 }else if(HUMANS.has(form)){
  const arm=wind&&(slam||summon)?-22-Math.round(u*9):hit?6:shoot?-13:-3;
  for(const s of [-1,1]){R(s<0?-10:3,-15+motion*s,7,13,ink);R(s<0?-8:4,-14+motion*s,4,9,mid);R(s<0?-13:3,-3+motion*s,11,4,dark);}
  P([[-13,-36],[13,-36],[11,-13],[-11,-13]],ink);R(-11,-34,22,19,mid);R(-8,-32,7,14,light);R(2,-31,8,6,dark);R(-3,-29,6,6,accent);
  for(const s of [-1,1]){L(s*13,-31,s*(18+(hit?5:0)),-20+arm,dark,6);O(s*(18+(hit?5:0)),-19+arm,5,5,ink);R(s*18-3,-21+arm,6,4,mid);}
  O(0,-42,9,10,ink);R(-7,-50,14,14,mid);R(-6,-48,5,5,light);R(-7,-42,14,3,dark);eye(-5,-41);eye(3,-41);
  if(form==='knight'){P([[-12,-36],[-17,-31],[-16,-5],[-7,-8]],dark);L(19,-21+arm,23,-44+arm,ink,4);L(20,-23+arm,24,-43+arm,light,2);R(16,-24+arm,12,3,accent);R(-3,-57,6,7,accent);}
  if(form==='automaton'){R(-13,-36,26,4,dark);R(-5,-30,10,10,ink);R(-3,-28,6,6,accent);R(-14,-48,5,9,dark);R(9,-48,5,9,dark);R(-6,-56,12,5,light);}
  if(form==='yeti'){for(let i=0;i<5;i++)P([[-13+i*6,-32],[-10+i*6,-20],[-7+i*6,-32]],light);horn(-9,-46,-1);horn(9,-46,1);R(-5,-37,10,3,ink);R(-4,-37,2,3,light);R(3,-37,2,3,light);}
  if(form==='gargoyle'){horn(-9,-48,-1);horn(9,-48,1);R(-7,-37,14,3,ink);for(const x of [-6,-1,4])R(x,-37,2,3,light);for(const s of [-1,1])L(s*9,-19,s*25,-6,accent,1);}
  if(features.has('hammer')||features.has('furnace')){R(19,-40+arm,4,25,accent);R(12,-48+arm,19,12,ink);R(14,-46+arm,15,8,dark);R(15,-46+arm,3,8,accent);R(-5,-28,10,11,dark);for(let j=0;j<3;j++)R(-4+j*3,-26,1,7,accent);}
 }else if(PLANTS.has(form)){
  for(const s of [-1,1]){L(s*5,-11,s*(11+motion),-2,dark,4);L(s*(11+motion),-2,s*17,0,mid,2);}
  O(0,-22,10,15,ink);O(-1,-23,8,13,mid);L(-4,-33,-6,-13,light,2);L(2,-30,4,-14,dark,2);
  const arm=wind&&summon?-43:hit?-18:-28;
  for(const s of [-1,1]){L(s*8,-26,s*19,arm,ink,4);L(s*9,-26,s*19,arm,mid,2);L(s*17,arm,s*22,arm-7,light,2);}
  if(form==='mushroom'){O(0,-39,21,9,ink);O(0,-41,19,7,mid);R(-17,-38,34,3,light);for(const [x,yy]of [[-9,-43],[3,-46],[11,-41]])R(x,yy,5,3,accent);}
  else if(form==='coral'){for(const s of [-1,1]){L(s*6,-30,s*12,-51,accent,4);L(s*12,-43,s*22,-48,accent,3);L(s*12,-43,s*8,-57,light,3);}R(-3,-52,5,17,mid);}
  else if(form==='treant'){P([[-19,-31],[-23,-43],[-13,-52],[1,-56],[18,-48],[21,-32]],dark);P([[-19,-38],[-13,-49],[0,-52],[15,-46],[18,-37]],mid);R(-12,-49,9,4,light);horn(-14,-47,-1);horn(13,-48,1);}
  else {P([[0,-35],[-18,-42],[-14,-51],[-3,-46],[0,-36]],mid);P([[0,-35],[5,-51],[16,-52],[14,-43],[0,-35]],light);L(0,-26,0,-44,dark,2);}
  eye(-5,-29);eye(3,-29);R(-2,-22,4,2,dark);
  if(form==='mandrake'){O(-3,-20,4,5,accent);R(-2,-21,3,4,ink);}
 }else if(SPIRITS.has(form)){
  const yy=form==='drone'?-26:-31;
  if(form==='wraith'){
   P([[-12,-35],[12,-35],[16,-5],[8,-10],[2,-2],[-4,-10],[-14,-4]],ink);P([[-10,-34],[10,-34],[12,-9],[4,-13],[-3,-7],[-11,-12]],mid);P([[-7,-32],[5,-34],[2,-12],[-6,-17]],light);
   for(const s of [-1,1]){const a=wind||summon?-40:hit?-23:-19;L(s*10,-29,s*(19+attack),a,dark,4);L(s*(19+attack),a,s*(22+attack),a-4,light,3);}
   O(0,-41,10,11,ink);P([[-8,-39],[0,-49],[8,-39],[5,-32],[-5,-32]],dark);eye(-5,-39);eye(3,-39);
  }else if(form==='jellyray'){
   for(let i=0;i<5;i++){const x=-12+i*6;L(x,-20,x+motion,-10,dark,2);L(x+motion,-10,x-motion,2+i%2*4,accent,1);}
   O(0,-31,19,12,ink);O(0,-33,17,10,mid);O(-4,-36,9,5,light);R(-15,-24,30,3,accent);eye(-5,-30);eye(4,-30);
  }else{
   O(0,yy,14,14,ink);O(0,yy-1,12,12,mid);O(0,yy,9,8,light);O(3+(hit?3:0),yy,5,6,dark);R(2+(hit?3:0),yy-3,3,5,accent);R(-5,yy-6,2,2,'#fff3d0');
   if(form==='drone')for(const s of [-1,1]){R(s<0?-28:16,-31,12,6,ink);R(s<0?-26:18,-30,8,3,light);R(s<0?-27:17,-35,12,2,accent);}
   else for(let i=0;i<5;i++){const x=-12+i*6;L(x,-19,x+motion,-7,dark,2);L(x+motion,-7,x-motion,-3,mid,2);}
  }
  if(features.has('book')){P([[12,-29],[22,-32],[31,-28],[30,-16],[21,-20],[12,-17]],ink);P([[13,-28],[21,-30],[21,-21],[13,-19]],light);P([[23,-30],[29,-27],[29,-18],[23,-21]],accent);}
 }else if(form==='manta'){
  P([[-4,-35],[-33,-42],[-24,-16],[-12,-13],[0,-20],[12,-13],[24,-16],[33,-42],[4,-35]],ink);
  P([[-4,-33],[-29,-38],[-22,-19],[-11,-17],[0,-24],[11,-17],[22,-19],[29,-38],[4,-33]],mid);
  for(const s of [-1,1]){L(s*5,-31,s*25,-27,light,2);L(s*8,-29,s*22,-22,accent,1);}O(0,-30,7,11,light);eye(-4,-33);eye(3,-33);L(0,-20,4+motion,-6,dark,3);L(4+motion,-6,-7+motion,4,accent,2);
 }else if(['eel','serpent','worm','centipede'].includes(form)){
  const coils=form==='worm'?3:5;
  for(let i=0;i<coils;i++){const x=Math.sin(i*1.3+state.frame*.5)*8,yy=-7-i*7;O(x,yy,10-i,7,ink);O(x-1,yy-1,8-i,5,i%2?mid:dark);R(x-4,yy-3,4,2,light);}
  O(5+attack,-35,9,8,ink);O(5+attack,-36,7,6,mid);eye(7+attack,-38);P([[8+attack,-32],[16+attack,-30],[9+attack,-27]],accent);
  if(form==='worm'){O(5+attack,-34,5,5,dark);for(const x of [1,5,9])R(x+attack,-38,2,2,light);}
  if(form==='serpent'){horn(1,-40,-1);horn(9,-40,1);}
  if(form==='eel'){L(-8,-28,-16,-35,accent,2);L(-5,-19,-15,-24,light,2);}
  if(form==='centipede'){for(let i=0;i<7;i++)for(const s of [-1,1]){L(s*7,-4-i*5,s*(17+(i%2)*motion),-1-i*5,dark,2);L(s*(17+(i%2)*motion),-1-i*5,s*22,-4-i*5,accent,1);}horn(0,-40,-1);horn(10,-40,1);}
 }else if(['frog','toad','turtle'].includes(form)){
  for(const s of [-1,1]){O(s*13,-8,8,5,ink);O(s*13,-9,6,3,mid);L(s*15,-9,s*(21+attack),-2,light,2);}
  O(0,-20,18,13,ink);O(0,-22,16,11,mid);O(-4,-25,10,7,light);
  if(form==='turtle'){for(let j=0;j<3;j++)for(let i=0;i<3;i++)R(-10+i*8,-30+j*7,6,5,j%2?dark:mid);O(17+attack,-15,7,6,ink);O(18+attack,-16,5,4,mid);eye(19+attack,-18);}
  else {for(const x of [-9,9]){O(x,-32,6,6,ink);O(x,-33,4,4,accent);R(x,-34,2,3,dark);}L(-10,-18,10,-18,ink,2);if(hit&&shoot)L(8,-17,30,-15,accent,2);if(form==='toad')for(const [x,yy]of [[-13,-21],[-6,-28],[4,-24],[10,-19]])R(x,yy,3,3,dark);}
 }else if(form==='bell'||form==='anvil'){
  if(form==='bell'){P([[-8,-46],[8,-46],[11,-34],[15,-19],[20,-13],[-20,-13],[-15,-19],[-11,-34]],ink);P([[-6,-44],[6,-44],[9,-32],[13,-20],[17,-16],[-17,-16],[-13,-20],[-9,-32]],mid);R(-7,-39,5,17,light);R(-18,-18,36,4,accent);L(0,-13,motion*2,-5,dark,3);O(motion*2,-4,5,5,accent);O(0,-50,4,4,ink);R(-1,-51,2,3,accent);}
  else{for(const s of [-1,1]){R(s<0?-15:6,-13+motion*s,9,11,ink);R(s<0?-13:8,-11+motion*s,5,7,mid);}P([[-26,-36],[26,-36],[21,-26],[10,-23],[10,-15],[-10,-15],[-10,-23],[-22,-26]],ink);P([[-23,-34],[23,-34],[18,-28],[-18,-28]],light);R(-9,-27,18,10,mid);R(-4,-26,8,6,dark);R(-2,-25,4,4,accent);L(20,-25,26,wind?-51:hit?-13:-35,accent,3);R(19,wind?-56:hit?-19:-41,15,8,dark);}
  if(phase>0){for(const s of [-1,1])L(s*13,-28,s*29,-43,accent,2);}
 }else if(form==='lotus'||form==='seraph'){
  if(form==='seraph')for(const yy of [-39,-28,-17]){wing(-1,yy);wing(1,yy);}
  if(form==='lotus')for(let i=0;i<8;i++){const a=i*TAU/8,rx=Math.cos(a),ry=Math.sin(a);P([[rx*5,-29+ry*5],[rx*25-ry*5,-29+ry*22+rx*5],[rx*29,-29+ry*27],[rx*25+ry*5,-29+ry*22-rx*5]],i%2?mid:light);}
  O(0,-30,8,12,ink);O(0,-31,6,10,accent);R(-2,-36,3,7,light);
  if(form==='seraph'){P([[-7,-22],[-13,-5],[0,-10],[13,-5],[7,-22]],light);R(-7,-45,14,3,ink);R(-5,-46,10,1,accent);for(const s of [-1,1])L(s*9,-30,s*20,wind?-43:-17,light,2);}
 }else if(form==='dragon'){
  L(-7,-16,-21,-7,ink,6);L(-21,-7,-33,-13,mid,4);P([[-35,-15],[-32,-20],[-28,-12]],accent);
  for(const s of [-1,1]){L(s*8,-17,s*14,-4,dark,5);R(s<0?-19:10,-4,10,4,ink);for(let j=0;j<3;j++)R((s<0?-18:11)+j*3,-3,2,2,light);}
  O(0,-26,14,19,ink);O(0,-27,12,17,mid);O(2,-23,7,12,light);for(let j=0;j<4;j++)L(-4,-31+j*6,8,-31+j*6,dark,1);
  O(6+attack,-44,11,9,ink);O(6+attack,-45,9,7,mid);P([[11+attack,-43],[24+attack,-41],[20+attack,-33],[9+attack,-35]],ink);R(13+attack,-41,9,5,mid);eye(9+attack,-47);horn(-1+attack,-50,-1);horn(10+attack,-50,1);R(18+attack,-36,2,3,light);
  for(const s of [-1,1])L(s*11,-32,s*(19+attack),wind?-38:hit?-14:-26,light,3);
 }else{
  // Explicit fallback also gives legacy slimes a squash, tell and bite pose.
  const squash=wind?4:hit?-4:motion;
  O(0,-15+squash,18-squash,15-squash,ink);O(0,-17+squash,16-squash,12-squash,mid);O(-6,-22+squash,6,3,light);eye(-6,-18+squash);eye(4,-18+squash);R(-2,-11+squash,6,hit?5:2,dark);
 }
 // Species accessories and permanent phase transformations change the silhouette.
 if(features.has('antlers'))for(const s of [-1,1]){L(s*6,-37,s*13,-56,accent,2);L(s*11,-49,s*20,-53,accent,2);L(s*13,-53,s*8,-58,light,2);}
 if(features.has('crown')||features.has('halo')||features.has('holy')){L(-11,-55,11,-55,accent,2);for(const x of [-10,0,10])R(x,-60,2,6,light);}
 if(features.has('fins'))for(const s of [-1,1])P([[s*8,-20],[s*24,-28],[s*17,-10]],accent);
 if(features.has('crystal')||features.has('ice'))for(const x of [-14,-6,7,16])P([[x-3,-27],[x,-40],[x+4,-26]],accent);
 if(features.has('orbit')||features.has('clock'))for(let i=0;i<4;i++){const a=i*TAU/4+state.frame*.15;R(Math.cos(a)*25-2,-34+Math.sin(a)*14,4,4,accent);}
 if(def.boss&&phase>0){
  for(const s of [-1,1]){horn(s*13,-37,s);L(s*15,-32,s*25,-22,accent,2);}
  if(phase===2){for(let i=0;i<6;i++){const a=i*TAU/6+state.frame*.16;R(Math.cos(a)*31-1,-32+Math.sin(a)*25,3,3,light);}R(-3,-28,6,7,accent);R(-1,-26,2,3,'#fff6d7');}
  if(features.has('furnace')){
   P([[-6,-34],[-17,-39],[-18,-17],[-6,-21]],dark);P([[6,-34],[17,-39],[18,-17],[6,-21]],dark);R(-7,-34,14,17,ink);R(-5,-32,10,13,phase===2?'#fff6cf':accent);R(-2,-29,4,8,light);
   for(const s of [-1,1]){R(s<0?-18:13,-45,5,9,ink);P([[s*15,-46],[s*20,-58],[s*17,-53],[s*13,-60],[s*11,-46]],phase===2?light:accent);}
  }
  if(features.has('book')){
   for(let i=0;i<phase+2;i++){const a=i*TAU/(phase+2)+state.frame*.1,xx=Math.cos(a)*28,yy=-30+Math.sin(a)*19;R(xx-3,yy-4,7,9,light);R(xx-1,yy-2,4,1,dark);R(xx-1,yy+1,3,1,dark);}
   if(phase===2){P([[-15,-51],[-19,-63],[-8,-57],[0,-66],[8,-57],[19,-63],[15,-51]],accent);R(-13,-54,26,4,light);}
  }
  if(features.has('orbit'))for(let i=0;i<(phase===2?6:3);i++){const a=i*TAU/(phase===2?6:3)+state.frame*.2,xx=Math.cos(a)*31,yy=-33+Math.sin(a)*18;O(xx,yy,4,4,ink);O(xx,yy,2,2,accent);}
  if(form==='turtle')for(let i=0;i<5;i++)P([[-16+i*7,-25],[-13+i*7,-42-phase*3-(i%2)*5],[-8+i*7,-25]],i%2?light:accent);
  if(form==='serpent')for(const s of [-1,1])P([[s*5,-30],[s*27,-45-phase*3],[s*21,-21],[s*8,-15]],s<0?dark:mid);
  if(form==='dragon'&&phase===2){wing(-1,-16,true);wing(1,-16,true);}
 }
 if(wind&&(shoot||summon)){
  const radius=3+Math.floor(u*4),x=summon?0:24,yy=summon?-57:-28;
  O(x,yy,radius+2,radius+2,dark);O(x,yy,radius,radius,accent);R(x-1,yy-1,2,2,light);
  for(let j=0;j<3;j++){const a=j*TAU/3+u*3;R(x+Math.cos(a)*(radius+6),yy+Math.sin(a)*(radius+6),2,2,accent);}
 }
 if(hit&&shoot){L(23,-28,36,-28,light,2);R(29,-32,3,9,accent);}
 if(rest){R(-4,-54,2,2,light);if(state.frame%2)R(5,-58,2,3,light);}
}

export function drawCreature(renderer,mob,def,x,y,t,alpha=1){
 if(!def?.creature)return false;
 const now=Date.now()+(renderer.clock||0),state=creatureFrame(mob,now),facing=state.dir==='w'?-1:1;
 const key=JSON.stringify([def.name,def.creature,state]);let cv=cache.get(key);
 if(!cv){
  cv=renderer.createPixelCanvas?renderer.createPixelCanvas(W,H):typeof OffscreenCanvas!=='undefined'?new OffscreenCanvas(W,H):typeof document!=='undefined'?document.createElement('canvas'):null;
  if(!cv)return false;cv.width=W;cv.height=H;const c=cv.getContext('2d');c.imageSmoothingEnabled=false;paintCreature(c,def,state);cache.set(key,cv);
 }else{cache.delete(key);cache.set(key,cv);}
 const limit=renderer.lowPower?128:CREATURE_CACHE_LIMIT;while(cache.size>limit)cache.delete(cache.keys().next().value);
 const {unit}=creatureMetrics(def),c=renderer.ctx;
 c.save();c.globalAlpha=alpha;c.imageSmoothingEnabled=false;c.translate(Math.round(x),Math.round(y));c.scale(facing,1);c.drawImage(cv,-44*unit,-80*unit,W*unit,H*unit);c.restore();return true;
}
export function creatureCacheSize(){return cache.size;}
export function clearCreatureCache(){cache.clear();}
