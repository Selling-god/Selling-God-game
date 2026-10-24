import { EXPEDITION_ZONES } from './expeditions.js';
import { VOCATION_SITES } from './vocation-sites.js';
import { buildExpedition } from './expedition-world.js';
import { indexScenery } from './spatial.js';
import { FRONTIER, RELICS } from './expansion.js';
import { buildFrontier } from './frontier-world.js';
import { buildChallengeMap } from './challenge-world.js';
import { TILE, ZONES, NPCS } from './content.js';

export function seeded(seed) {
  let a=seed|0;
  return () => {a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};
}
export const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const PORTALS = {
  town: [{ id:'town_forest', x:24*TILE+16,y:4*TILE+16,to:'forest',tx:30*TILE+16,ty:40*TILE+16,name:'속삭이는 숲',level:1 }],
  forest: [
    {id:'forest_town',x:30*TILE+16,y:42*TILE+16,to:'town',tx:24*TILE+16,ty:7*TILE+16,name:'별여울 마을',level:1},
    {id:'forest_ruins',x:30*TILE+16,y:4*TILE+16,to:'ruins',tx:28*TILE+16,ty:38*TILE+16,name:'달잠 유적',level:5}
  ],
  ruins: [
    {id:'ruins_forest',x:28*TILE+16,y:40*TILE+16,to:'forest',tx:30*TILE+16,ty:7*TILE+16,name:'속삭이는 숲',level:1},
    {id:'ruins_citadel',x:28*TILE+16,y:4*TILE+16,to:'citadel',tx:28*TILE+16,ty:38*TILE+16,name:'재의 성채',level:9}
  ],
  citadel: [{id:'citadel_ruins',x:28*TILE+16,y:40*TILE+16,to:'ruins',tx:28*TILE+16,ty:7*TILE+16,name:'달잠 유적',level:5}]
};
export const BOSS_SPAWNS = {
  forest:{x:49*TILE+16,y:18*TILE+16,type:'moss_guardian'},
  ruins:{x:46*TILE+16,y:15*TILE+16,type:'moon_witch'},
  citadel:{x:28*TILE+16,y:13*TILE+16,type:'eclipse_dragon'}
};

// Branching roads, not a single linear corridor.
for(const z of FRONTIER)PORTALS[z.id]=[];
const edges=[
 ['town','meadow'],['forest','meadow'],['forest','swamp'],['meadow','coast'],
 ['coast','desert'],['desert','sky'],['swamp','ruins'],['citadel','frost'],
 ['frost','abyss'],['sky','observatory'],['abyss','observatory'],
 ...FRONTIER.filter(z=>z.parent).map(z=>[z.parent,z.id])
];
for(const [a,b]of edges){
 const aIndex=PORTALS[a].length,bIndex=PORTALS[b].length;
 const cell=(id,i)=>{
  const z=ZONES[id];
  return i%3===0?[4,Math.floor(z.height*.58)]:i%3===1?[z.width-5,Math.floor(z.height*.68)]:[Math.floor(z.width*.5),4];
 };
 const [ax,ay]=cell(a,aIndex),[bx,by]=cell(b,bIndex);
 PORTALS[a].push({id:`${a}_${b}`,x:ax*TILE+16,y:ay*TILE+16,to:b,tx:bx*TILE+16,ty:by*TILE+16,name:ZONES[b].name,level:ZONES[b].minLevel});
 PORTALS[b].push({id:`${b}_${a}`,x:bx*TILE+16,y:by*TILE+16,to:a,tx:ax*TILE+16,ty:ay*TILE+16,name:ZONES[a].name,level:ZONES[a].minLevel});
}
for(const z of FRONTIER)BOSS_SPAWNS[z.id]={x:42*TILE+16,y:12*TILE+16,type:z.boss};


// Each province is a 3 x 3 traversable graph, not nine disconnected level selections.
for(const z of EXPEDITION_ZONES){
 PORTALS[z.id]=[];
 BOSS_SPAWNS[z.id]={x:Math.floor(z.width/2)*TILE+16,y:Math.floor(z.height/2)*TILE+16,type:ZONES[z.id].boss};
}
const joinRoad=(a,b,sideA,sideB)=>{
 const cell=(id,side)=>{const z=ZONES[id];return side==='n'?[Math.floor(z.width/2),4]:
 side==='s'?[Math.floor(z.width/2),z.height-5]:side==='e'?[z.width-5,Math.floor(z.height/2)]:[4,Math.floor(z.height/2)];};
 const [ax,ay]=cell(a,sideA),[bx,by]=cell(b,sideB);
 PORTALS[a].push({id:`${a}_to_${b}`,x:ax*TILE+16,y:ay*TILE+16,to:b,tx:bx*TILE+16,ty:by*TILE+16,name:ZONES[b].name,level:ZONES[b].minLevel});
 PORTALS[b].push({id:`${b}_to_${a}`,x:bx*TILE+16,y:by*TILE+16,to:a,tx:ax*TILE+16,ty:ay*TILE+16,name:ZONES[a].name,level:ZONES[a].minLevel});
};
for(const z of EXPEDITION_ZONES){
 const i=z.sector;
 if(i%3<2)joinRoad(z.id,`${z.province}_reach_${i+1}`,'e','w');
 if(i<6)joinRoad(z.id,`${z.province}_reach_${i+3}`,'s','n');
 if(i===0){
  const base=ZONES[z.province],x=(base.width-7)*TILE+16,y=(base.height-7)*TILE+16;
  const tx=4*TILE+16,ty=(z.height-12)*TILE+16;
  PORTALS[z.province].push({id:z.province+'_expedition',x,y,to:z.id,tx,ty,name:ZONES[z.id].name+' · 원정길',level:z.minLevel});
  PORTALS[z.id].push({id:z.id+'_home',x:tx,y:ty,to:z.province,tx:x,ty:y,name:base.name+' · 귀로',level:base.minLevel});
 }
}
const cache=new Map();
export const mapCacheInfo=()=>({size:cache.size,limit:10});
function remember(id,map){
 indexScenery(map);
 cache.delete(id);cache.set(id,map);
 while(cache.size>10)cache.delete(cache.keys().next().value);
 return map;
}

export function createMap(id) {
  if(cache.has(id)){const map=cache.get(id);cache.delete(id);cache.set(id,map);return map;}
  const z=ZONES[id]; if(!z)throw new Error('Unknown zone');
  if(z.challenge)return remember(id,buildChallengeMap(id,z));
  if(z.expedition)return remember(id,buildExpedition(id,z,PORTALS[id]));
  if(z.seed){const map=buildFrontier(id,z,PORTALS[id],NPCS.filter(n=>n.zone===id));map.storyPoints=VOCATION_SITES.filter(s=>s.zone===id);return remember(id,map);}
  const {width:w,height:h}=z, seed={town:73,forest:928,ruins:1049,citadel:5408}[id], rand=seeded(seed);
  const tiles=new Uint8Array(w*h), blocked=new Uint8Array(w*h), props=[], resources=[], chests=[];
  const center=id==='town'?24:id==='forest'?30:28;
  const isPath=(x,y)=>Math.abs(x-center)<=2||Math.abs(y-(id==='town'?21:33))<=1||
    (id==='forest'&&Math.abs(y-18)<=1&&x>=29&&x<=52)||
    (id==='ruins'&&Math.abs(y-15)<=1&&x>=27&&x<=48)||
    (id==='citadel'&&Math.hypot(x-28,y-13)<7);
  const isArena=(x,y)=>id!=='town'&&Math.hypot(x-BOSS_SPAWNS[id].x/TILE,y-BOSS_SPAWNS[id].y/TILE)<6;
  const ponds=id==='town'?[[10,12,5,4]]:id==='forest'?[[13,13,6,4],[48,34,5,4]]:id==='ruins'?[[12,14,4,5]]:[[12,17,5,6],[45,27,5,5]];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const idx=y*w+x, border=x<2||y<2||x>=w-2||y>=h-2;
    const pond=ponds.some(([cx,cy,rx,ry])=>((x-cx)/rx)**2+((y-cy)/ry)**2<1+Math.sin(x*2+y)*.07);
    tiles[idx]=isPath(x,y)||isArena(x,y)?1:pond?2:0;
    if(border)blocked[idx]=1;
    if(pond&&!isPath(x,y)&&!isArena(x,y))blocked[idx]=1;
    if(id==='town'&&Math.hypot(x-24,y-21)<5){tiles[idx]=3;blocked[idx]=0;}
  }
  function prop(sprite,tx,ty,solid=true,scale=1){
    const x=tx*TILE+16,y=ty*TILE+20;
    props.push({id:`prop${props.length}`,sprite,x,y,scale});
    if(solid)blocked[Math.floor(ty)*w+Math.floor(tx)]=1;
  }
  if(id==='town'){
    const houses=[{x:16,y:16,s:'house_blue'},{x:30,y:16,s:'house_red'},{x:16,y:26,s:'house_red'},{x:31,y:27,s:'house_blue'}];
    for(const o of houses){
      prop(o.s,o.x,o.y,false);
      for(let dy=-2;dy<=0;dy++)for(let dx=-2;dx<=2;dx++)blocked[(o.y+dy)*w+o.x+dx]=1;
    }
    prop('stall',18,20,false);
    prop('forge',30,20,false);
    prop('well',22,18,true);
    prop('campfire',23,23,false);
    for(const [x,y] of [[21,15],[27,15],[20,24],[28,24],[23,8],[25,29]])prop('lantern',x,y,true);
    for(const [x,y] of [[14,21],[34,21],[20,29],[30,30]])prop('bench',x,y,true);
  }else{
    const b=BOSS_SPAWNS[id];
    props.push({id:'altar',sprite:'altar',x:b.x,y:b.y+40,scale:1.3});
    for(let a=0;a<8;a++){
      const ang=a*Math.PI/4;
      prop(id==='forest'?'rune':'pillar',Math.round(b.x/TILE+Math.cos(ang)*5.2),Math.round(b.y/TILE+Math.sin(ang)*5.2),true);
    }
  }
  // Scatter deterministic scenery; the walking grid is shared by client and server.
  for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
    if(blocked[y*w+x]||tiles[y*w+x]!==0||isPath(x,y)||isArena(x,y))continue;
    if(id==='town'&&x>12&&x<36&&y>12&&y<31)continue;
    const r=rand(), closeEdge=x<4||y<4||x>w-5||y>h-5;
    if(r<(closeEdge? .46:id==='town'? .13:.12)){
      prop(id==='town'||id==='forest'?(rand()>.25?'tree':'pine'):(id==='ruins'?(rand()>.35?'dead_tree':'pillar'):(rand()>.4?'dead_tree':'basalt')),x,y,true,0.9+rand()*.3);
    }else if(r<.19){
      prop(id==='citadel'?'basalt':'rock',x,y,true,.65+rand()*.35);
    }else if(r<.32){
      prop(id==='town'||id==='forest'?(rand()>.45?'flowers':'bush'):(id==='ruins'?'mushroom':'crystal'),x,y,false,.7+rand()*.4);
    }
  }
  // Clear a full route and each point of arrival. Decorative non-blocking props are kept.
  function clearAt(px,py,r=1){
    const tx=Math.floor(px/TILE),ty=Math.floor(py/TILE);
    for(let y=ty-r;y<=ty+r;y++)for(let x=tx-r;x<=tx+r;x++)if(x>1&&y>1&&x<w-2&&y<h-2){blocked[y*w+x]=0;tiles[y*w+x]=1;}
    for(let n=props.length-1;n>=0;n--)if(Math.abs(props[n].x-px)<(r+1)*TILE&&Math.abs(props[n].y-py)<(r+1)*TILE)props.splice(n,1);
  }
  for(const p of PORTALS[id])clearAt(p.x,p.y,2);
  clearAt(z.spawn[0]*TILE+16,z.spawn[1]*TILE+16,1);
  for(const n of NPCS.filter(n=>n.zone===id))clearAt(n.x,n.y,0);
  const map={id,w,h,width:w*TILE,height:h*TILE,tiles,blocked,props,resources,chests,portals:PORTALS[id],npcs:NPCS.filter(n=>n.zone===id)};
  if(id!=='town'){
    for(let i=0;i<22;i++){
      let p;
      for(let j=0;j<100;j++){
        p={x:(5+Math.floor(rand()*(w-10)))*TILE+16,y:(7+Math.floor(rand()*(h-14)))*TILE+16};
        if(!isBlocked(map,p.x,p.y,12)&&dist(p,BOSS_SPAWNS[id])>220&&!resources.some(a=>dist(a,p)<85))break;
      }
      if(isBlocked(map,p.x,p.y,12))continue;
      const type=id==='forest'?(i%3===0?'ore':i%3===1?'wood':'herb'):(id==='ruins'?(i%3===0?'herb':'ore'):(i%4===0?'herb':'ore'));
      resources.push({id:`${id}_node_${i}`,type,x:p.x,y:p.y});
    }
    const chestCells=id==='forest'?[[9,31],[53,9],[39,25]]:id==='ruins'?[[9,32],[50,30],[15,7]]:[[8,32],[48,10],[42,35]];
    chestCells.forEach(([x,y],i)=>{clearAt(x*TILE+16,y*TILE+16,0);chests.push({id:`${id}_chest_${i}`,x:x*TILE+16,y:y*TILE+16});});
  }
  map.relics=RELICS.filter(r=>r.zone===id).map(r=>({...r}));
  // Old worlds remain recognizable, with safe trails to added exits and relics.
  for(const target of [...PORTALS[id].slice(id==='forest'||id==='ruins'?2:1),...map.relics]){
    const ty=Math.floor(target.y/TILE),tx=Math.floor(target.x/TILE);
    for(let x=Math.min(tx,center);x<=Math.max(tx,center);x++)clearAt(x*TILE+16,ty*TILE+16,1);
    clearAt(target.x,target.y,1);
  }
  map.storyPoints=VOCATION_SITES.filter(s=>s.zone===id);
  for(const point of map.storyPoints){
    const tx=Math.floor(point.x/TILE),ty=Math.floor(point.y/TILE);
    for(let x=Math.min(tx,center);x<=Math.max(tx,center);x++)clearAt(x*TILE+16,ty*TILE+16,1);
    clearAt(point.x,point.y,1);
  }
  return remember(id,map);
}
export function isBlocked(map,x,y,r=10) {
  if(!Number.isFinite(x)||!Number.isFinite(y))return true;
  for(const [dx,dy] of [[-r,-r],[r,-r],[-r,r],[r,r]]){
    const tx=Math.floor((x+dx)/TILE),ty=Math.floor((y+dy)/TILE);
    if(tx<0||ty<0||tx>=map.w||ty>=map.h||map.blocked[ty*map.w+tx])return true;
  }
  return false;
}
// Arrival points must fit the whole character and leave room to start moving.
// A blocked destination falls back to the nearest safe tile connected to spawn.
export function findSafePosition(map,preferred,r=10) {
  const spawn=ZONES[map.id]?.spawn||[Math.floor(map.w/2),Math.floor(map.h/2)];
  const origin={x:spawn[0]*TILE+TILE/2,y:spawn[1]*TILE+TILE/2};
  const wanted=Number.isFinite(preferred?.x)&&Number.isFinite(preferred?.y)?preferred:origin;
  const exits=[[0,0],[-16,0],[16,0],[0,-16],[0,16]];
  const clear=p=>exits.every(([dx,dy])=>!isBlocked(map,p.x+dx,p.y+dy,r));
  if(clear(wanted))return {x:wanted.x,y:wanted.y};
  const center=n=>({x:(n%map.w)*TILE+TILE/2,y:Math.floor(n/map.w)*TILE+TILE/2});
  let start=-1,bestOrigin=Infinity;
  for(let n=0;n<map.w*map.h;n++){
    const pt=center(n);if(isBlocked(map,pt.x,pt.y,r))continue;
    const d=dist(pt,origin);if(d<bestOrigin){start=n;bestOrigin=d;}
  }
  if(start<0)return null;
  const seen=new Uint8Array(map.w*map.h),queue=[start];seen[start]=1;
  let best=null,bestDistance=Infinity,fallback=center(start),fallbackDistance=dist(fallback,wanted);
  for(let at=0;at<queue.length;at++){
    const n=queue[at],x=n%map.w,y=Math.floor(n/map.w),pt=center(n),d=dist(pt,wanted);
    if(d<fallbackDistance){fallback=pt;fallbackDistance=d;}
    if(d<bestDistance&&clear(pt)){best=pt;bestDistance=d;}
    for(const [dx,dy]of [[-1,0],[1,0],[0,-1],[0,1]]){
      const nx=x+dx,ny=y+dy,ni=ny*map.w+nx;
      if(nx<0||ny<0||nx>=map.w||ny>=map.h||seen[ni])continue;
      const next=center(ni);
      if(isBlocked(map,next.x,next.y,r)||isBlocked(map,(pt.x+next.x)/2,(pt.y+next.y)/2,r))continue;
      seen[ni]=1;queue.push(ni);
    }
  }
  return best||(queue.length>1?fallback:null);
}
export function moveEntity(map,p,dx,dy,r=10) {
  // Small substeps prevent tunneling through a wall during a dash.
  const count=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8));
  for(let i=0;i<count;i++){
    if(!isBlocked(map,p.x+dx/count,p.y,r))p.x+=dx/count;
    if(!isBlocked(map,p.x,p.y+dy/count,r))p.y+=dy/count;
  }
}
export function lineOfSight(map,a,b) {
  const n=Math.ceil(dist(a,b)/12);
  for(let i=1;i<n;i++)if(isBlocked(map,a.x+(b.x-a.x)*i/n,a.y+(b.y-a.y)*i/n,2))return false;
  return true;
}
export function findPath(map,from,to) {
 if(!Number.isFinite(from.x)||!Number.isFinite(from.y)||!Number.isFinite(to.x)||!Number.isFinite(to.y))return [];
 const sx=clamp(Math.floor(from.x/TILE),1,map.w-2),sy=clamp(Math.floor(from.y/TILE),1,map.h-2);
 let ex=clamp(Math.floor(to.x/TILE),2,map.w-3),ey=clamp(Math.floor(to.y/TILE),2,map.h-3);
 if(map.blocked[ey*map.w+ex]){
  let found=false;
  for(let r=1;r<=4&&!found;r++)for(let yy=ey-r;yy<=ey+r&&!found;yy++)for(let xx=ex-r;xx<=ex+r;xx++)
   if(xx>1&&yy>1&&xx<map.w-2&&yy<map.h-2&&!map.blocked[yy*map.w+xx]){ex=xx;ey=yy;found=true;break;}
  if(!found)return [];
 }
 const start=sy*map.w+sx,end=ey*map.w+ex;
 if(start===end)return [{x:ex*TILE+16,y:ey*TILE+16}];
 const size=map.w*map.h,g=new Float32Array(size).fill(Infinity),parent=new Int32Array(size).fill(-1),closed=new Uint8Array(size),heap=[];
 const h=n=>{const dx=Math.abs(n%map.w-ex),dy=Math.abs(Math.floor(n/map.w)-ey);return Math.max(dx,dy)+.41421356*Math.min(dx,dy);};
 const push=(n,f)=>{
  let i=heap.length;heap.push({n,f});
  while(i>0){const p=(i-1)>>1;if(heap[p].f<=f)break;heap[i]=heap[p];i=p;}heap[i]={n,f};
 };
 const pop=()=>{
  const root=heap[0],last=heap.pop();if(heap.length){
   let i=0;while(i*2+1<heap.length){let c=i*2+1;if(c+1<heap.length&&heap[c+1].f<heap[c].f)c++;if(last.f<=heap[c].f)break;heap[i]=heap[c];i=c;}heap[i]=last;
  }return root.n;
 };
 g[start]=0;push(start,h(start));let loops=0;
 const dirs=[[0,1],[1,0],[-1,0],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
 while(heap.length&&loops++<size*3){
  const cur=pop();if(closed[cur])continue;
  if(cur===end){const out=[];for(let v=end;v!==start;v=parent[v]){if(v<0)return [];out.push({x:(v%map.w)*TILE+16,y:Math.floor(v/map.w)*TILE+16});}return out.reverse();}
  closed[cur]=1;const cx=cur%map.w,cy=Math.floor(cur/map.w);
  for(const [dx,dy]of dirs){
   const x=cx+dx,y=cy+dy,n=y*map.w+x;
   if(x<1||y<1||x>=map.w-1||y>=map.h-1||map.blocked[n]||closed[n])continue;
   if(dx&&dy&&(map.blocked[cy*map.w+x]||map.blocked[y*map.w+cx]))continue;
   const ng=g[cur]+(dx&&dy?1.41421356:1);
   if(ng+1e-5<g[n]){g[n]=ng;parent[n]=cur;push(n,ng+h(n));}
  }
 }
 return [];
}
export function spawnPoint(map,rand,avoidCenter=false) {
  for(let i=0;i<300;i++){
    const p={x:(5+rand()*(map.w-10))*TILE,y:(6+rand()*(map.h-12))*TILE};
    if(!isBlocked(map,p.x,p.y,16)&&map.portals.every(q=>dist(p,q)>150)&&(!avoidCenter||Math.abs(p.x-map.width/2)>100))return p;
  }
  return {x:map.width/2+16,y:map.height/2+16};
}
