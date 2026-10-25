import {TILE} from './content.js';
// One safe, traversable village and a central warpstone in every major region.
// No new zone IDs: existing portals, saves, encounters and spawns remain valid.
export function addVillage(map,zone){
 if(!zone||zone.expedition||zone.dungeon||zone.challenge||zone.secretRealm)return map;
 const cx=zone.id==='town'?24:zone.spawn[0];
 const cy=zone.id==='town'?24:zone.spawn[1]-4;
 const minX=Math.max(3,cx-7),maxX=Math.min(map.w-4,cx+7);
 const minY=Math.max(3,cy-6),maxY=Math.min(map.h-4,cy+6);
 for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
  const n=y*map.w+x;map.blocked[n]=0;map.tiles[n]=Math.abs(x-cx)<=2||Math.abs(y-cy)<=2?3:1;if(map.terrain){map.terrain.surface[n]=1;map.terrain.elevation[n]=1;}
 }
 // Travel path to every class mentor and region service NPC. Physical obstacles
 // are removed on the walkway, not only at the dialogue marker.
 const targets=[...(map.npcs||[]),...(map.storyPoints||[])];
 for(const t of targets){
  const tx=Math.floor(t.x/TILE),ty=Math.floor(t.y/TILE);
  if(tx<2||ty<2||tx>map.w-3||ty>map.h-3)continue;
  let x=cx,y=cy;let guard=0;
  while((x!==tx||y!==ty)&&guard++<map.w+map.h){
   if(x!==tx)x+=Math.sign(tx-x);else y+=Math.sign(ty-y);
   for(let yy=y-1;yy<=y+1;yy++)for(let xx=x-1;xx<=x+1;xx++){
    if(xx<2||yy<2||xx>=map.w-2||yy>=map.h-2)continue;
    const n=yy*map.w+xx;map.blocked[n]=0;map.tiles[n]=1;if(map.terrain){map.terrain.surface[n]=1;map.terrain.elevation[n]=1;}
   }
  }
 }
 // Solid props overlapping the plaza or main walkway are visually removed,
 // avoiding invisible walls or a tree standing on top of a mentor.
 const clearNear=(x,y)=>{
  const tx=Math.floor(x/TILE),ty=Math.floor(y/TILE);
  if(tx<2||ty<2||tx>=map.w-2||ty>=map.h-2)return false;
  return !map.blocked[ty*map.w+tx]&&map.tiles[ty*map.w+tx]===1;
 };
 map.props=(map.props||[]).filter(o=>{
  const tx=Math.floor(o.x/TILE),ty=Math.floor(o.y/TILE);
  if(Math.abs(tx-cx)<=8&&Math.abs(ty-cy)<=7)return false;
  if(targets.some(t=>Math.hypot(t.x-o.x,t.y-o.y)<95))return false;
  return !clearNear(o.x,o.y)||Math.hypot(tx-cx,ty-cy)>10;
 });
 const stone={id:'village_stone_'+zone.id,kind:'warpstone',zone:zone.id,name:zone.name+' 귀환석',
  x:(cx+1)*TILE+16,y:cy*TILE+16,sprite:'world_gate',text:'발견한 다른 마을의 귀환석으로 이동합니다.'};
 map.villageStone=stone;
 map.storyPoints=(map.storyPoints||[]).filter(p=>p.id!==stone.id).concat(stone);
 map.props.push({id:'village_arch_'+zone.id,sprite:'world_gate',x:stone.x,y:stone.y+16,scale:1.05});
 if(zone.id!=='town'){
  const decoration=[['stall',-5,-4],['forge',5,-4],['campfire',0,3],['lantern',-7,4],['lantern',7,4]];
  for(const [sprite,dx,dy]of decoration)map.props.push({id:`village_${zone.id}_${sprite}_${dx}`,sprite,x:(cx+dx)*TILE+16,y:(cy+dy)*TILE+16,scale:1});
 }
 return map;
}
