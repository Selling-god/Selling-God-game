import {TILE} from './content.js';
import {RELICS} from './expansion.js';

// Stable tiles, separate layouts and two arena clearings. No network random map data.
export function buildFrontier(id,z,portals,npcs){
 const w=z.width,h=z.height,tiles=new Uint8Array(w*h),blocked=new Uint8Array(w*h),props=[],resources=[],chests=[];
 let seed=z.seed||41;
 const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const family=z.theme,water=family==='coast'||family==='swamp',snow=family==='frost',desert=family==='desert';
 const boss={x:42*TILE+16,y:12*TILE+16,type:z.boss};
 const eventArena={x:42*TILE+16,y:31*TILE+16};
 const relics=RELICS.filter(r=>r.zone===id).map(r=>({...r}));
 const road=(x,y)=>Math.abs(x-28)<=1||Math.abs(y-33)<=1||(y>=11&&y<=13&&x>=28&&x<=44)||(y>=29&&y<=32&&x>=28&&x<=44)||
   ((family==='desert'||family==='observatory')&&Math.abs(y-22)<=1);
 const arena=(x,y)=>Math.hypot(x-42,y-12)<6||Math.hypot(x-42,y-31)<6;
 const ponds=water?[[12,11,8,5],[17,30,6,4],[46,23,5,3]]:snow?[[13,10,6,4]]:family==='sky'?[[10,10,7,5],[12,29,6,5]]:family==='abyss'?[[10,11,7,5],[18,28,6,5]]:[[11,11,5,4]];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const n=y*w+x,edge=x<2||y<2||x>=w-2||y>=h-2;
  const pond=ponds.some(([a,b,rx,ry])=>((x-a)/rx)**2+((y-b)/ry)**2<1+Math.sin(x*.8+y)*.1);
  tiles[n]=road(x,y)||arena(x,y)?1:pond?2:0;blocked[n]=edge||pond&&!road(x,y)&&!arena(x,y)?1:0;
  if(!edge&&!blocked[n]&&tiles[n]===0){
   const r=rand(),solid=r<.10;
   let sprite;
   if(r<.075)sprite=desert?'desert_ruin':snow?'frost_pine':family==='coast'?'palm':family==='sky'?'sky_crystal':family==='abyss'?'void_crystal':family==='observatory'?'star_pillar':family==='swamp'?'giant_mushroom':'tree';
   else if(r<.13)sprite=desert?'cactus':snow?'ice_rock':family==='meadow'?'bush':'rock';
   else if(r<.23)sprite=family==='swamp'?'mushroom':desert?'desert_grass':snow?'snow_grass':'flowers';
   if(sprite){props.push({id:id+'_prop_'+n,sprite,x:x*TILE+16,y:y*TILE+20,scale:.8+rand()*.35});if(solid)blocked[n]=1;}
  }
 }
 const clear=(px,py,r=1)=>{
  const tx=Math.floor(px/TILE),ty=Math.floor(py/TILE);
  for(let yy=ty-r;yy<=ty+r;yy++)for(let xx=tx-r;xx<=tx+r;xx++)if(xx>1&&yy>1&&xx<w-2&&yy<h-2){blocked[yy*w+xx]=0;tiles[yy*w+xx]=1;}
  for(let i=props.length-1;i>=0;i--)if(Math.abs(props[i].x-px)<(r+1)*TILE&&Math.abs(props[i].y-py)<(r+1)*TILE)props.splice(i,1);
 };
 const corridor=(x,y)=>{
  const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);
  for(let xx=Math.min(tx,28);xx<=Math.max(tx,28);xx++)clear(xx*TILE+16,ty*TILE+16,1);
 };
 for(const point of [...portals,...npcs,...relics]){corridor(point.x,point.y);clear(point.x,point.y,1);}
 clear(z.spawn[0]*TILE+16,z.spawn[1]*TILE+16,2);
 for(let i=0;i<3;i++){
  const x=[9,19,47][i]*TILE+16,y=[36,6,22][i]*TILE+16;
  corridor(x,y);chests.push({id:`${id}_chest_${i}`,x,y});
 }
 for(let i=0;i<18;i++){
  for(let k=0;k<100;k++){
   const tx=5+Math.floor(rand()*(w-10)),ty=5+Math.floor(rand()*(h-10)),x=tx*TILE+16,y=ty*TILE+16;
   if(blocked[ty*w+tx]||Math.hypot(x-boss.x,y-boss.y)<220||Math.hypot(x-eventArena.x,y-eventArena.y)<220||resources.some(r=>Math.hypot(x-r.x,y-r.y)<60))continue;
   resources.push({id:`${id}_node_${i}`,type:['herb','wood','ore'][i%3],x,y});break;
  }
 }
 props.push({id:'altar',sprite:family==='frost'?'ice_altar':family==='abyss'?'void_altar':'altar',x:boss.x,y:boss.y+30,scale:1.2});
 if(['meadow','coast','frost','abyss'].includes(id))props.push({id:'event-altar',sprite:'world_gate',x:eventArena.x,y:eventArena.y+24,scale:1.1});
 return {id,w,h,width:w*TILE,height:h*TILE,tiles,blocked,props,resources,chests,portals,npcs,relics,eventArena};
}
