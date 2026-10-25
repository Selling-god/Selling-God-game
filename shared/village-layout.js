// Regional fast-travel stops, rather than one settlement after EVERY portal.
// At least three inter-region portal crossings separate any two stones.
// Stable IDs preserve existing discovered-stone data where a hub still exists.
export const SETTLEMENT_IDS=Object.freeze(['town','frost','sky','deepsea','stormcrown','dawnend']);
const settlementSet=new Set(SETTLEMENT_IDS);
export function hasVillage(zone){
 const id=typeof zone==='string'?zone:zone?.id;
 if(!settlementSet.has(id))return false;
 if(typeof zone!=='string'&&(zone?.expedition||zone?.challenge||zone?.dungeon||zone?.secretRealm))return false;
 return true;
}
export function villageLayout(zone){
 if(!zone||!hasVillage(zone)||!Number.isFinite(zone.width)||!Number.isFinite(zone.height))return null;
 if(zone.id==='town')return {cx:39,cy:27,rx:7,ry:6};
 // All portal exits are near map boundaries; the innermost plaza is a real
 // overland journey from any entry point, not beside the exit it came from.
 return {cx:Math.floor(zone.width/2),cy:Math.floor(zone.height/2),rx:7,ry:6};
}
export function insideVillage(map,x,y,padding=0){
 const v=map?.villageSafe;
 if(!v||!Number.isFinite(x)||!Number.isFinite(y))return false;
 return Math.abs(x-v.x)<=v.width/2+padding&&Math.abs(y-v.y)<=v.height/2+padding;
}
