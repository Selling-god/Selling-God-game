import {TILE} from './content.js';
import {LANDMARKS} from './expeditions.js';
import {VOCATION_SITES} from './vocation-sites.js';

const randFor=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
export function buildExpedition(id,z,portals){
 const w=z.width,h=z.height,rand=randFor(z.seed),tiles=new Uint8Array(w*h),blocked=new Uint8Array(w*h),reserved=new Uint8Array(w*h);
 const points=[...LANDMARKS.filter(p=>p.zone===id),...VOCATION_SITES.filter(p=>p.zone===id)];
 const props=[],resources=[],chests=[],encounters=[];
 const camp=points.find(p=>p.kind==='camp'),shrine=points.find(p=>p.kind==='trial');
 const cx=Math.floor(w/2),cy=Math.floor(h/2),ponds=Array.from({length:8},()=>[8+rand()*(w-16),8+rand()*(h-16),3+rand()*9,3+rand()*6]);
 const variant=z.sector%3;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const i=y*w+x,edge=x<2||y<2||x>=w-2||y>=h-2;
  const pond=ponds.some(([a,b,rx,ry])=>((x-a)/rx)**2+((y-b)/ry)**2<1);
  const river=(z.theme==='coast'||z.theme==='swamp')&&Math.abs(x-w*.56-Math.sin(y*.065+variant)*w*.15)<3.5;
  tiles[i]=pond||river?2:0;blocked[i]=edge||pond||river?1:0;
 }
 const clear=(tx,ty,r=1,kind=1)=>{
  for(let y=ty-r;y<=ty+r;y++)for(let x=tx-r;x<=tx+r;x++)if(x>1&&y>1&&x<w-2&&y<h-2){
   const i=y*w+x;blocked[i]=0;reserved[i]=1;tiles[i]=kind;
  }
 };
 const segment=(ax,ay,bx,by,r=1)=>{
  const n=Math.max(Math.abs(bx-ax),Math.abs(by-ay),1);
  for(let i=0;i<=n;i++)clear(Math.round(ax+(bx-ax)*i/n),Math.round(ay+(by-ay)*i/n),r);
 };
 const connect=(px,py)=>{
  const x=Math.floor(px/TILE),y=Math.floor(py/TILE);
  if(variant===1){segment(cx,cy,x,cy);segment(x,cy,x,y);}
  else {segment(cx,cy,cx,y);segment(cx,y,x,y);}
 };
 // Connected roads are reserved BEFORE scenery placement, avoiding O(n^2) clearing.
 for(const p of [...portals,...points]){connect(p.x,p.y);clear(Math.floor(p.x/TILE),Math.floor(p.y/TILE),p.kind==='trial'?8:p.kind==='camp'?5:2);}
 clear(z.spawn[0],z.spawn[1],3);
 // Nine encounter clearings and six optional caches, all connected to the road network.
 for(let i=0;i<9;i++){
  const tx=Math.floor(w*(.18+(i%3)*.31)),ty=Math.floor(h*(.17+Math.floor(i/3)*.32));
  const x=tx*TILE+16,y=ty*TILE+16;
  if(Math.hypot(x-camp.x,y-camp.y)<260||Math.hypot(x-shrine.x,y-shrine.y)<300)continue;
  connect(x,y);clear(tx,ty,4,0);encounters.push({x,y});
 }
 for(let i=0;i<6;i++){
  const tx=7+Math.floor(rand()*(w-14)),ty=7+Math.floor(rand()*(h-14)),x=tx*TILE+16,y=ty*TILE+16;
  connect(x,y);clear(tx,ty,1);chests.push({id:id+'_chest_'+i,x,y});
 }
 for(let i=0;i<42;i++){
  let tx,ty;
  do{tx=6+Math.floor(rand()*(w-12));ty=6+Math.floor(rand()*(h-12));}
  while(Math.hypot(tx*TILE+16-camp.x,ty*TILE+16-camp.y)<180||Math.hypot(tx*TILE+16-shrine.x,ty*TILE+16-shrine.y)<250);
  // Resource spurs stop near the nearest main road, so every node is reachable.
  connect(tx*TILE+16,ty*TILE+16);clear(tx,ty,1);
  resources.push({id:id+'_node_'+i,type:['herb','wood','ore'][i%3],x:tx*TILE+16,y:ty*TILE+16});
 }
 const tree={coast:'palm',desert:'desert_ruin',swamp:'giant_mushroom',frost:'frost_pine',sky:'sky_crystal',abyss:'void_crystal',observatory:'star_pillar'}[z.theme]||'tree';
 const small={desert:'cactus',frost:'ice_rock',swamp:'mushroom',sky:'rock',abyss:'crystal',observatory:'pillar'}[z.theme]||'bush';
 for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
  const i=y*w+x;if(reserved[i]||blocked[i])continue;
  const r=rand(),sprite=r<.08?tree:r<.14?small:r<.20?(z.theme==='frost'?'snow_grass':z.theme==='desert'?'desert_grass':'flowers'):null;
  if(!sprite)continue;
  props.push({id:id+'_prop_'+i,sprite,x:x*TILE+16,y:y*TILE+20,scale:.85+rand()*.3});
  if(r<.10)blocked[i]=1;
 }
 props.push({id:id+'_tent',sprite:'stall',x:camp.x-90,y:camp.y-50,scale:1});
 props.push({id:id+'_lantern',sprite:'lantern',x:camp.x+65,y:camp.y-35,scale:1});
 const boss={x:cx*TILE+16,y:cy*TILE+16,type:z.boss};
 clear(cx,cy,7); // Boss clearing is kept safe from decorative collisions.
 for(let i=props.length-1;i>=0;i--)if(Math.abs(props[i].x-boss.x)<8*TILE&&Math.abs(props[i].y-boss.y)<8*TILE)props.splice(i,1);
 props.push({id:id+'_bossaltar',sprite:'altar',x:boss.x,y:boss.y+28,scale:1.15});
 return {id,w,h,width:w*TILE,height:h*TILE,tiles,blocked,props,resources,chests,portals,npcs:[],relics:[],
  storyPoints:points,encounters,camp,trialArena:shrine,boss,eventArena:null};
}
