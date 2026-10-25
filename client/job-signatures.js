// A distinct combat silhouette/weapon for each profession. These are visual only:
// combat, damage, cooldowns and persistence stay server-authoritative.
const JOB_ART={
 novice:['여행검','trail','novice'],
 guardian:['방패검','aegis','common'],ranger:['장궁','falcon','common'],mage:['성운 지팡이','aster','common'],
 rogue:['쌍단검','shadowsteps','common'],priest:['성광 성서','sanctuary','common'],
 lancer:['장창','spearline','common'],monk:['권갑','lotusfist','common'],
 herbalist:['덩굴 지팡이','seed','common'],miner:['전투 곡괭이','mineshaft','common'],
 berserker:['대전투도끼','bloodaxe','rare'],paladin:['성검','holyblade','rare'],
 sentinel:['철벽 방패','citadel','rare'],sniper:['장거리 쇠뇌','crosshair','rare'],
 beastwarden:['야수의 활','paw','rare'],spellblade:['마검','runeblade','rare'],
 pyromancer:['화염 지팡이','pyre','rare'],cryomancer:['빙결 지팡이','snowflake','rare'],
 druid:['고목 지팡이','oak','rare'],bard:['전투 하프','score','rare'],
 alchemist:['연금 폭탄','flask','rare'],engineer:['동력 포탑','turret','rare'],
 rune_knight:['룬 대검','seal','epic'],shadowdancer:['환영 쌍검','afterimage','epic'],
 stormcaller:['뇌전 지팡이','stormfork','epic'],necromancer:['사령 낫','wraith','epic'],
 chronomancer:['시계 지팡이','hourglass','epic'],spiritwalker:['정령 토템','spirit','epic'],
 dragonknight:['용의 창','dragonfang','epic'],stargazer:['별의 관측기','orion','epic'],
 warlord:['전쟁 깃발','standard','epic'],
 voidwalker:['공허의 발톱','voidtear','hidden'],eclipse_reaper:['월식 대낫','eclipse','hidden'],
 phoenix_heir:['불사조 깃창','feather','hidden'],tide_oracle:['해류의 삼지창','whirlpool','hidden'],
 starweaver:['별의 직조실','spindle','hidden'],nameless_king:['무명의 왕검','throne','hidden'],
 dawn_architect:['새벽의 설계기','architect','hidden'],abyss_shepherd:['심연의 목자지팡이','shepherd','hidden']
};
export const JOB_ART_PROFILES=Object.freeze(Object.fromEntries(Object.entries(JOB_ART).map(([id,[weapon,motif,tier]])=>[id,Object.freeze({weapon,motif,tier})])));
export function jobArtProfile(job){return JOB_ART_PROFILES[job]||JOB_ART_PROFILES.novice;}
const TAU=2*Math.PI;
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);

// All primitives are coarse pixel-ink primitives; no sprites or added asset requests.
export function paintJobSignature(p,e,f,v){
 const info=jobArtProfile(e.job||'novice'),{motif,tier}=info;
 if(motif==='trail')return;
 const ultimate=e.skill==='ultimate',defensive=e.skill==='skill2',basic=e.skill==='basic';
 const rank={common:1,rare:2,epic:3,hidden:4}[tier]||1;
 const sf=(basic?.58:defensive?.82:ultimate?1.6:1)*(.80+rank*.10);
 const tx=e.tx??e.x,ty=e.ty??e.y;
 const travel=ease(Math.min(1,f*1.65));
 const ax=defensive||e.center==='self'?e.x:(basic?e.x+(tx-e.x)*travel:tx);
 const ay=defensive||e.center==='self'?e.y-36:(basic?e.y-28+(ty-e.y)*travel:ty-30);
 const X=a=>ax+a*sf,Y=a=>ay+a*sf;
 const ln=(x1,y1,x2,y2,color=v.primary,w=3)=>p.line(X(x1),Y(y1),X(x2),Y(y2),color,w*sf);
 const dia=(x,y,r=8,color=v.light)=>p.diamond(X(x),Y(y),r*sf,color,v.ink);
 const dot=(x,y,r=4,color=v.light)=>p.dot(X(x),Y(y),r*sf,color);
 const arc=(r,color=v.primary,width=4,phase=0)=>p.arc(X(0),Y(0),r*sf,color,width*sf,.82,phase,phase+TAU);
 const spark=(x,y,r=11,color=v.light)=>p.spark(X(x),Y(y),r*sf,color,v.primary);
 const disk=(x,y,r=12,color=v.dark)=>p.disk(X(x),Y(y),r*sf,color,.84);
 const verts=(points,color=v.primary)=>p.poly(points.map(([x,y])=>[X(x),Y(y)]),color);
 const slash=(dir=1,r=35)=>{ln(-r,-r*.5,r,r*.5, v.ink,9);ln(-r,-r*.5,r,r*.5,v.primary,6);ln(-r,-r*.5,r,r*.5,v.light,2);if(dir===-1)ln(-r,r*.5,r,-r*.5,v.light,3);};
 const star=(r=24,n=5,phase=-Math.PI/2)=>{
  const pts=[];for(let i=0;i<n*2;i++){const a=phase+i*Math.PI/n,rr=i%2?r*.45:r;pts.push([X(Math.cos(a)*rr),Y(Math.sin(a)*rr)]);}
  p.outline([...pts,pts[0]],v.primary,4*sf,false);for(let i=0;i<n;i++)spark(Math.cos(i*TAU/n)*r,Math.sin(i*TAU/n)*r,4);
 };
 const chain=(fromX,fromY,toX,toY,n=4)=>{
  for(let i=0;i<n;i++){const a=i/n,b=(i+1)/n;
   const x=fromX+(toX-fromX)*a,y=fromY+(toY-fromY)*a;
   ln(x,y,fromX+(toX-fromX)*b,fromY+(toY-fromY)*b,i%2?v.light:v.primary,5);}
 };
 const petals=(n=6,r=30)=>{for(let i=0;i<n;i++){const a=i*TAU/n+f,dx=Math.cos(a)*r,dy=Math.sin(a)*r;dia(dx,dy,6,i%2?v.light:v.primary);}};
 const wings=()=>{for(const side of [-1,1]){verts([[0,0],[side*20,-20],[side*53,-35],[side*42,-5],[side*23,13]],v.dark);ln(0,0,side*43,-23,v.light,5);ln(0,0,side*33,3,v.primary,4);}};
 const gear=(r=24,n=8)=>{arc(r,v.primary,5);for(let i=0;i<n;i++){const a=i*TAU/n+f*.3;
  ln(Math.cos(a)*(r-5),Math.sin(a)*(r-5),Math.cos(a)*(r+8),Math.sin(a)*(r+8),v.light,5);}disk(0,0,6,v.ink);};
 const bolts=()=>{for(const d of [-1,1]){const coords=[[-d*15,-40],[d*7,-17],[-d*6,-12],[d*15,28]];
  p.outline(coords.map(([x,y])=>[X(x),Y(y)]),v.ink,9*sf,false);
  p.outline(coords.map(([x,y])=>[X(x),Y(y)]),v.light,4*sf,false);}};
 const crest=()=>{verts([[-22,-16],[22,-16],[17,14],[0,30],[-17,14]],v.dark);ln(-18,-12,18,-12,v.light,3);dia(0,0,8);};
 switch(motif){
  case 'aegis':crest();slash(1,24);break;
  case 'falcon':wings();ln(-25,20,25,-20,v.light);dia(25,-20,7);break;
  case 'aster':star(31,6,f*.4);disk(0,0,9,v.light);break;
  case 'shadowsteps':for(const side of [-1,1])slash(side,24+side*8);petals(3,28);break;
  case 'sanctuary':ln(-31,0,31,0,v.light,9);ln(0,-34,0,33,v.light,9);arc(39,v.primary,3);break;
  case 'spearline':ln(-46,22,45,-22,v.light,7);verts([[50,-27],[27,-29],[38,-10]],v.primary);break;
  case 'lotusfist':petals(8,21);disk(-13,0,11,v.primary);disk(13,0,11,v.primary);break;
  case 'seed':for(const side of [-1,1]){ln(0,30,side*26,-24,v.primary,5);dia(side*26,-29,9);}petals(4,19);break;
  case 'mineshaft':ln(-23,-28,18,27,v.light,9);ln(-43,-34,29,-34,v.primary,11);spark(18,27,13);break;
  case 'bloodaxe':for(const side of [-1,1]){ln(side*12,32,side*12,-26,v.ink,8);verts([[side*12,-31],[side*43,-26],[side*29,-5],[side*12,-15]],v.primary);}chain(-36,19,36,19);break;
  case 'holyblade':slash(-1,39);arc(38,v.light,5);dia(0,-44,12);break;
  case 'citadel':for(const x of [-32,-11,10,31]){p.rect(X(x-8),Y(7),17*sf,23*sf,v.primary);p.rect(X(x-5),Y(-8),11*sf,16*sf,v.light);}crest();break;
  case 'crosshair':arc(31,v.light,3);ln(-43,0,43,0,v.primary);ln(0,-43,0,43,v.primary);dia(0,0,6,v.light);break;
  case 'paw':for(const x of [-17,17])for(const yy of [-24,0])disk(x,yy,7,v.light);disk(0,20,16,v.primary);break;
  case 'runeblade':slash(-1,38);for(let i=0;i<5;i++)dia((i-2)*14,-24+Math.sin(i+f*3)*8,6);break;
  case 'pyre':for(let i=0;i<5;i++){const x=(i-2)*17;verts([[x-12,28],[x,-33-10*Math.sin(f+i)],[x+11,18],[x+3,7]],i%2?v.primary:v.light);}break;
  case 'snowflake':for(let i=0;i<6;i++){const a=i*TAU/6;ln(0,0,Math.cos(a)*40,Math.sin(a)*40,v.light);dia(Math.cos(a)*40,Math.sin(a)*40,5);}break;
  case 'oak':ln(0,35,0,-28,v.dark,16);for(const x of [-29,-13,13,29])disk(x,-14-Math.abs(x)*.2,14,v.primary);disk(0,-33,17,v.light);break;
  case 'score':for(let i=0;i<4;i++)ln(-43,-25+i*12,43,-25+i*12,v.primary,2);for(let i=0;i<5;i++){dot(-33+i*18,15-i%3*15,7,v.light);ln(-28+i*18,11-i%3*15,-28+i*18,-22-i%3*15,v.light,3);}break;
  case 'flask':verts([[-13,-37],[13,-37],[10,-17],[26,18],[13,30],[-13,30],[-26,18],[-10,-17]],v.dark);p.rect(X(-19),Y(5),38*sf,19*sf,v.primary);dot(-7,11,5);dot(12,1,4);break;
  case 'turret':p.rect(X(-34),Y(-15),68*sf,40*sf,v.dark);p.rect(X(-23),Y(-22),46*sf,12*sf,v.primary);ln(12,-18,54,-18,v.light,11);gear(18,6);break;
  case 'seal':star(36,4,Math.PI/4);gear(29,8);slash(1,43);break;
  case 'afterimage':for(let i=-1;i<=1;i++){p.alpha(.28+(i+1)*.23,()=>{ln(-33+i*12,-29,30+i*12,24,v.light,5);ln(-30+i*12,27,32+i*12,-25,v.primary,4);});}break;
  case 'stormfork':bolts();arc(38,v.primary,2);break;
  case 'wraith':disk(0,-5,28,v.dark);for(const sign of [-1,1]){dia(sign*14,-14,8,v.light);ln(sign*16,17,sign*34,40,v.primary,5);}slash(1,21);break;
  case 'hourglass':verts([[-26,-39],[26,-39],[0,0],[26,39],[-26,39],[0,0]],v.dark);ln(-26,-39,26,-39,v.light,5);ln(-26,39,26,39,v.light,5);dia(0,0,7);break;
  case 'spirit':for(let i=0;i<4;i++){const a=i*TAU/4+f,xx=Math.cos(a)*33,yy=Math.sin(a)*27;dia(xx,yy,11);ln(0,0,xx,yy,v.primary,3);}star(15,5);break;
  case 'dragonfang':wings();verts([[-11,8],[0,-44],[12,8],[4,32]],v.primary);dia(0,-35,6);break;
  case 'orion':star(34,7);for(let i=0;i<5;i++){const a=i*TAU/5;ln(Math.cos(a)*15,Math.sin(a)*15,Math.cos(a)*35,Math.sin(a)*35,v.light,2);}break;
  case 'standard':ln(-24,-49,-24,42,v.light,8);verts([[-22,-49],[40,-38],[18,-17],[43,3],[-22,-9]],v.primary);arc(22,v.light,3);break;
  case 'voidtear':disk(0,0,40,v.ink);for(let i=0;i<7;i++){const a=i*TAU/7;ln(Math.cos(a)*15,Math.sin(a)*15,Math.cos(a)*48,Math.sin(a)*48,v.primary,6);}dia(0,0,9);break;
  case 'eclipse':disk(0,0,37,v.primary);disk(11,-9,35,v.ink);arc(47,v.light,3,-f);slash(-1,35);break;
  case 'feather':wings();for(let i=-2;i<=2;i++){const y=-26+i*13;ln(0,0,30+Math.abs(i)*5,y,v.light,4);dia(31+Math.abs(i)*5,y,6);}break;
  case 'whirlpool':for(let i=0;i<3;i++){const r=15+i*14;arc(r,i%2?v.light:v.primary,5,f*3+i);}ln(0,-53,0,32,v.light,8);for(const x of [-19,0,19])ln(x,-53,x,-31,v.light,6);break;
  case 'spindle':for(let i=0;i<5;i++){const a=i*TAU/5+f,xx=Math.cos(a)*44,yy=Math.sin(a)*30;ln(0,0,xx,yy,v.light,2);dia(xx,yy,7);}gear(13,5);break;
  case 'throne':verts([[-43,-15],[-31,-52],[-12,-30],[0,-60],[12,-30],[31,-52],[43,-15]],v.primary);ln(-43,-15,43,-15,v.light,7);slash(1,42);break;
  case 'architect':gear(40,12);star(21,8,f);for(const side of [-1,1]){ln(side*54,-35,side*54,35,v.light,4);ln(side*48,0,side*36,0,v.primary,4);}break;
  case 'shepherd':ln(-20,40,-20,-27,v.light,9);arc(29,v.primary,9,-Math.PI);for(let i=0;i<5;i++)dia(28*Math.cos(i*TAU/5),28*Math.sin(i*TAU/5),6,v.dark);disk(0,0,15,v.ink);break;
 }
 // Difficult professions have additional, deliberately different layers.
 if(rank>=3&&(ultimate||e.skill==='skill1')){
   for(let i=0;i<rank+2;i++){const a=i*TAU/(rank+2)+f*.5;
     spark(Math.cos(a)*(44+rank*7),Math.sin(a)*(31+rank*5),rank>=4?10:6,i%2?v.light:v.primary);}
 }
 if(rank===4&&ultimate){arc(69,v.light,3,f*.4);arc(75,v.primary,3,-f*.3);}
}
