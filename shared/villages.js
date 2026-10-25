import {TILE} from './content.js';
import {villageLayout} from './village-layout.js';

// In-world settlements are distant waystations connected by walkable roads.
// Warpstones are real small obelisks (drawn client-side), never world-boss gates.
export function addVillage(map,zone){
 const layout=villageLayout(zone);
 if(!layout)return map;
 const {cx,cy,rx,ry}=layout;
 const put=(x,y,tile=1)=>{
  if(x<2||y<2||x>=map.w-2||y>=map.h-2)return;
  const n=y*map.w+x;map.blocked[n]=0;map.tiles[n]=tile;
  if(map.terrain){map.terrain.surface[n]=1;map.terrain.elevation[n]=1;}
 };
 // Leave enough room for four widely spaced services and a separate obelisk.
 for(let y=cy-ry;y<=cy+ry;y++)for(let x=cx-rx;x<=cx+rx;x++){
  const plaza=Math.abs(x-cx)<=3||Math.abs(y-cy)<=2;
  put(x,y,plaza?3:1);
 }
 const targets=[...(map.npcs||[]),...(map.storyPoints||[]),...(map.portals||[])];
 if(zone.spawn)targets.push({x:zone.spawn[0]*TILE+16,y:zone.spawn[1]*TILE+16});
 // Roads connect exits, service NPCs, professions and spawn to the distant hub.
 for(const t of targets){
  const tx=Math.floor(t.x/TILE),ty=Math.floor(t.y/TILE);
  if(tx<2||ty<2||tx>=map.w-2||ty>=map.h-2)continue;
  let x=cx,y=cy,guard=0;
  while((x!==tx||y!==ty)&&guard++<map.w+map.h){
   if(x!==tx)x+=Math.sign(tx-x);else y+=Math.sign(ty-y);
   for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++)put(xx,yy);
  }
 }
 // Remove solid decorations throughout the plaza and around working NPCs.
 map.props=(map.props||[]).filter(o=>{
  const tx=Math.floor(o.x/TILE),ty=Math.floor(o.y/TILE);
  if(Math.abs(tx-cx)<=rx+2&&Math.abs(ty-cy)<=ry+2)return false;
  if(targets.some(t=>Math.hypot(t.x-o.x,t.y-o.y)<70))return false;
  return true;
 });
 const stone={id:'village_stone_'+zone.id,kind:'warpstone',zone:zone.id,name:'귀환의 별기둥',
  x:cx*TILE+16,y:cy*TILE+16,sprite:'relic_stone',text:'이 마을의 귀환석을 활성화하고 다른 마을로 이동합니다.'};
 map.villageStone=stone;
 map.villageSafe={x:stone.x,y:stone.y,width:(rx*2+1)*TILE,height:(ry*2+1)*TILE};
 map.storyPoints=(map.storyPoints||[]).filter(p=>p.id!==stone.id).concat(stone);
 // Distinct regional town architecture, without a copy of the boss platform.
 const decorations=[
  ['stall',-7,-5,.85],['forge',7,-5,.85],['lantern',-8,-1,.85],
  ['lantern',8,-1,.85],['lantern',-7,5,.85],['lantern',7,5,.85]
 ];
 if(zone.id!=='town')for(const [sprite,dx,dy,scale]of decorations){
  map.props.push({id:`village_${zone.id}_${sprite}_${dx}_${dy}`,sprite,
   x:(cx+dx)*TILE+16,y:(cy+dy)*TILE+16,scale});
 }
 return map;
}
