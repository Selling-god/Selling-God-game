/**
 * Immutable scenery buckets. Network snapshots already use an area-of-interest radius;
 * this index keeps a large field's decorations out of the per-frame full-array scan.
 */
export const PROP_CELL=256;
export function indexScenery(map){
 const buckets=new Map();
 for(const p of map.props){
  const key=Math.floor(p.x/PROP_CELL)+','+Math.floor(p.y/PROP_CELL);
  if(!buckets.has(key))buckets.set(key,[]);
  buckets.get(key).push(p);
 }
 map.propBuckets=buckets;return map;
}
export function nearbyScenery(map,left,top,right,bottom){
 if(!map.propBuckets)indexScenery(map);
 const out=[];
 for(let y=Math.floor(top/PROP_CELL);y<=Math.floor(bottom/PROP_CELL);y++)
  for(let x=Math.floor(left/PROP_CELL);x<=Math.floor(right/PROP_CELL);x++){
   const cell=map.propBuckets.get(x+','+y);if(cell)out.push(...cell);
  }
 return out;
}
