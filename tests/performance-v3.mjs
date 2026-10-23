/**
 * Local CPU/memory benchmark, no network and no Render capacity inference.
 * Uses simulated fixed dt. Auth, saves, TLS and network jitter are excluded.
 */
import {performance} from 'node:perf_hooks';
import {Game,newCharacter} from '../server/game.js';
import {ZONES,getStats} from '../shared/content.js';
import {atlasTotals} from '../shared/expeditions.js';
import {createMap,findPath,mapCacheInfo} from '../shared/world.js';
import {nearbyScenery} from '../shared/spatial.js';
function pct(a,p){return Number(a[Math.min(a.length-1,Math.floor(a.length*p))].toFixed(3));}
function run(scenario,regions,nearBoss=false){
 const g=new Game({random:()=>.5}),t=Date.parse('2026-10-23T03:11:00Z');g.now=t;const players=[];
 for(let i=0;i<24;i++){
  const p=g.addPlayer(newCharacter('bench'+i,'Bench'+i,['guardian','mage','ranger'][i%3]));p.level=30;
  p.zone=regions[i%regions.length];const z=ZONES[p.zone];p.x=(nearBoss?Math.floor(z.width/2)+i%4:z.spawn[0]+i%4)*32+16;
  p.y=(nearBoss?Math.floor(z.height/2)+i%3:z.spawn[1]+i%3)*32+16;
  p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;p.invulnerableUntil=t+999999;
  p.lastCombat=0;g.worlds.get(p.zone);players.push(p);
 }
 const ticks=[],snapshots=[],sizes=[];
 for(let i=0;i<600;i++){
  for(const p of players){g.setInput(p,{x:Math.sin(i/25)*.5,y:Math.cos(i/21)*.5,seq:i});if(i%20===0)g.action(p,{type:'attack',skill:'basic'});}
  let a=performance.now();g.tick(.05,t+i*50);ticks.push(performance.now()-a);
  if(i%2===0){
   a=performance.now();for(const p of players){const s=g.snapshot(p,i%100===0);const bytes=Buffer.byteLength(JSON.stringify(s));if(i>40)sizes.push(bytes);}
   snapshots.push(performance.now()-a);
  }
 }
 ticks.sort((a,b)=>a-b);snapshots.sort((a,b)=>a-b);sizes.sort((a,b)=>a-b);
 return {scenario,players:24,simulatedSeconds:30,regionsInWorldMemory:g.worlds.size,tickMs:{p50:pct(ticks,.5),p95:pct(ticks,.95),max:pct(ticks,1)},
  snapshotAndJSONFor24PlayersMs:{p50:pct(snapshots,.5),p95:pct(snapshots,.95),max:pct(snapshots,1)},
  snapshotBytesPerPlayer:{median:pct(sizes,.5),p95:pct(sizes,.95)},mapCache:mapCacheInfo()};
}
const report={mode:'Local simulated CPU benchmark, not network/cloud/FPS capacity',mapped:atlasTotals(ZONES),scenarios:[]};
report.scenarios.push(run('24 together in one large field, near enemies',['meadow_reach_4'],true));
report.scenarios.push(run('24 across eight provinces, near enemies',['meadow_reach_4','coast_reach_4','desert_reach_4','swamp_reach_4','frost_reach_4','sky_reach_4','abyss_reach_4','observatory_reach_4'],true));
report.scenarios.push(run('24 across 24 large fields, near camps',Object.keys(ZONES).filter(id=>ZONES[id].expedition).slice(0,24)));
const map=createMap('observatory_reach_8');
const a=performance.now(),path=findPath(map,{x:map.camp.x,y:map.camp.y},{x:map.trialArena.x,y:map.trialArena.y});
report.longRoute={waypoints:path.length,ms:Number((performance.now()-a).toFixed(3))};
report.scenery={allProps:map.props.length,viewportBucketProps:nearbyScenery(map,0,map.height-900,900,map.height).length};
report.memoryMiB=Object.fromEntries(Object.entries(process.memoryUsage()).map(([k,v])=>[k,Number((v/1048576).toFixed(1))]));
console.log(JSON.stringify(report,null,2));
