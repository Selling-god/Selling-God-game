/** Deterministic area-wide Poisson-like spawn layout with a safe fallback.
 * Avoids the old 25-80px ring around encounter anchors and spreads returned mobs.
 * Does not affect world bosses, protected settlements or dungeon/realm spawns.
 */
import {isBlocked,dist} from './world.js';
import {insideVillage} from './village-layout.js';
const GOLDEN=2.399963229728653;
const frac=n=>n-Math.floor(n);
const safe=(map,pt,players,boss)=>!isBlocked(map,pt.x,pt.y,17)&&!insideVillage(map,pt.x,pt.y,72)&&
  !(map.portals||[]).some(q=>dist(q,pt)<160)&&!players.some(p=>dist(p,pt)<150)&&
  (!boss||dist(boss,pt)>240)&&(!map.camp||dist(map.camp,pt)>205)&&(!map.trialArena||dist(map.trialArena,pt)>250);
/** Picks a point >= ~180px from another *alive* monster wherever terrain allows. */
export function distributedSpawn(map,existing=[],rand=Math.random,{anchor=null,players=[],boss=null,seed=0}={}){
 const n=90,offset=(Number(rand())||.371)*10;
 const other=existing.filter(m=>m&&m.alive!==false&&Number.isFinite(m.x)&&Number.isFinite(m.y));
 let best=null,bestScore=-Infinity;
 const regionW=Math.max(5,map.w-12),regionH=Math.max(5,map.h-14);
 for(let i=0;i<n;i++){
  const v=i+seed*7+offset+.5;
  let pt;
  // More than 75% of candidates cover the WHOLE region, not one spawn cluster.
  if(anchor&&i%7===0){
   const angle=v*GOLDEN,d=190+frac(v*.618)*245;
   pt={x:anchor.x+Math.cos(angle)*d,y:anchor.y+Math.sin(angle)*d};
  }else{
   pt={x:(6+frac(v*.6180339887)*regionW)*32+16,
       y:(7+frac(v*.7548776662)*regionH)*32+16};
  }
  // Place the whole enemy body at a tile centre: corner-only collision sampling
  // otherwise misses a wall if the random point straddles two tile boundaries.
  pt={x:Math.round((pt.x-16)/32)*32+16,y:Math.round((pt.y-16)/32)*32+16};
  if(!safe(map,pt,players,boss)||isBlocked(map,pt.x,pt.y,14))continue;
  // This search runs during respawns and map creation. Avoid allocating an
  // array of distances for every candidate (90 x mobs) during server ticks.
  let nearestSq=other.length?Infinity:240*240;
  for(const m of other){
   const dx=m.x-pt.x,dy=m.y-pt.y,d2=dx*dx+dy*dy;
   if(d2<nearestSq)nearestSq=d2;
  }
  const nearest=Math.sqrt(nearestSq);
  const spacing=Math.min(300,nearest);
  const closeness=anchor?Math.min(260,dist(anchor,pt))*.02:0;
  const score=spacing-closeness;
  if(score>bestScore){bestScore=score;best=pt;}
  if(nearest>=205&&(!anchor||dist(anchor,pt)<650))break;
 }
 return best;
}
