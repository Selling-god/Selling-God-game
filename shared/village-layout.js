// Shared geometry used by map generation, NPC placement and server combat safety.
// A settlement is an actual clearing in its province, not a portal-sized cluster.
export function villageLayout(zone){
  if(!zone||typeof zone.id!=='string')return null;
  if(zone.expedition||zone.challenge||zone.dungeon||zone.secretRealm)return null;
  if(zone.id==='town')return {cx:39,cy:27,rx:7,ry:6};
  // Keep the dragon's citadel arena far outside the town's no-combat border.
  if(zone.id==='citadel')return {cx:19,cy:29,rx:7,ry:6};
  let hash=2166136261;
  for(const letter of zone.id)hash=Math.imul(hash^letter.charCodeAt(0),16777619)>>>0;
  // Alternate distant inland clearings, far from the stock spawn at (28,37)
  // and from the boss/event grounds on the eastern side of frontier maps.
  const cx=18+((hash>>>8)%4)*2,cy=19+((hash>>>16)%2)*5;
  return {cx:Math.min(zone.width-15,cx),cy:Math.min(zone.height-12,cy),rx:7,ry:6};
}
export function insideVillage(map,x,y,padding=0){
  const v=map?.villageSafe;
  if(!v||!Number.isFinite(x)||!Number.isFinite(y))return false;
  return Math.abs(x-v.x)<=v.width/2+padding&&Math.abs(y-v.y)<=v.height/2+padding;
}
