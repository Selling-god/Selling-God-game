import {REALMS,REALM_BY_ID,REALM_ZONES} from './realms.js';

const T=32;
export const REALM_BOSS_SPAWNS=Object.fromEntries(REALMS.map(r=>[r.sanctum,{x:28*T+16,y:15*T+16,type:r.boss}]));
const marker=(r,area,kind,index,name,x,y)=>({id:`realm_${r.id}_${area}_${kind}_${index}`,kind:'realmDevice',realmKind:kind,
 realm:r.id,realmArea:area,index,name,x,y,sprite:kind==='trace'?'relic_stone':kind==='gate'?'world_gate':kind==='exit'?'rune':'altar'});
function clear(map,x,y,r=2){
 const tx=Math.floor(x/T),ty=Math.floor(y/T);
 for(let yy=ty-r;yy<=ty+r;yy++)for(let xx=tx-r;xx<=tx+r;xx++)if(xx>2&&yy>2&&xx<map.w-3&&yy<map.h-3){map.blocked[yy*map.w+xx]=0;map.tiles[yy*map.w+xx]=1;}
 for(let i=map.props.length-1;i>=0;i--)if(Math.abs(map.props[i].x-x)<(r+1)*T&&Math.abs(map.props[i].y-y)<(r+1)*T)map.props.splice(i,1);
}
function road(map,a,b,r=1){
 const n=Math.ceil(Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y))/T);
 for(let i=0;i<=n;i++)clear(map,a.x+(b.x-a.x)*i/Math.max(1,n),a.y+(b.y-a.y)*i/Math.max(1,n),r);
}
export function decorateRealmEntrance(map,zone){
 const r=REALMS.find(r=>r.entryZone===map.id);if(!r||map.realmEntrance)return map;
 const spawn={x:zone.spawn[0]*T+16,y:zone.spawn[1]*T+16},c={x:spawn.x+9*T,y:spawn.y-6*T};
 const offsets=r.id==='mirror'?[[-3*T,-2*T],[3*T,-2*T],[-3*T,2*T],[3*T,2*T]]:
  r.id==='inferno'?[[-4*T,-2*T],[4*T,-2*T],[-4*T,2*T],[4*T,2*T]]:[[-4*T,0],[0,-3*T],[4*T,0]];
 const points=[marker(r,'entry','trace',0,'이름 없는 세계의 흔적',c.x,c.y+5*T),
  ...r.entranceNames.map((name,i)=>marker(r,'entry','puzzle',i,name,c.x+offsets[i][0],c.y+offsets[i][1])),
  marker(r,'entry','gate',0,'잠들어 있는 경계문',c.x+7*T,c.y+5*T)];
 road(map,spawn,c,2);
 for(const point of points){road(map,c,point,1);clear(map,point.x,point.y,2);}
 map.realmEntrance=r.id;map.realmMarkers=points;map.storyPoints||=[];map.storyPoints.push(...points);
 return map;
}
export function buildRealmMap(id,zone=REALM_ZONES[id]){
 const r=REALM_BY_ID[zone.realm],w=zone.width,h=zone.height,tiles=new Uint8Array(w*h),blocked=new Uint8Array(w*h),props=[];
 const area=zone.realmArea;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const edge=x<3||y<3||x>=w-3||y>=h-3;
  const pool=[[11,11],[44,11],[11,29],[44,29]].some(([cx,cy])=>((x-cx)/5)**2+((y-cy)/4)**2<1);
  const lane=Math.abs(x-28)<3||Math.abs(y-21)<2;
  tiles[y*w+x]=edge||pool?2:lane?1:0;blocked[y*w+x]=edge||pool?1:0;
  if(!edge&&!pool&&!lane&&(x*7+y*11)%53===0){
   const sprite=r.id==='heaven'?'star_pillar':r.id==='inferno'?'desert_ruin':'void_crystal';
   props.push({id:id+'_scenery_'+x+'_'+y,sprite,x:x*T+16,y:y*T+20,scale:1});blocked[y*w+x]=1;
  }
 }
 const spawn={x:28*T+16,y:35*T+16};
 const points=[marker(r,area,'exit',0,'바깥 세계로 돌아가기',28*T+16,37*T+16)];
 if(area==='garden'){
  points.push(marker(r,area,'trace',0,'세 번의 개인 서약',28*T+16,30*T+16));
  points.push(...r.trialNames.map((name,i)=>marker(r,area,'trial',i,name,(22+i*6)*T+16,25*T+16)));
  points.push(marker(r,area,'gate',0,'안쪽 성소의 문',28*T+16,6*T+16));
 }else{
  points.push(marker(r,area,'altar',0,'서약핵과 무기의 제단',28*T+16,6*T+16));
  points.push(marker(r,area,'back',0,'정원으로 돌아가기',24*T+16,35*T+16));
 }
 const map={id,w,h,width:w*T,height:h*T,tiles,blocked,props,resources:[],chests:[],portals:[],npcs:[],relics:[],
  storyPoints:points,realmMarkers:points,realm:id,encounters:[]};
 const center={x:28*T+16,y:21*T+16};
 road(map,spawn,center,2);
 for(const point of points){road(map,center,point,2);clear(map,point.x,point.y,2);}
 for(const [x,y]of [[19,16],[37,16],[19,21],[37,21]]){
  const point={x:x*T+16,y:y*T+16};road(map,center,point,1);clear(map,point.x,point.y,4);map.encounters.push(point);
 }
 if(area==='sanctum'){const b=REALM_BOSS_SPAWNS[id];road(map,center,b,2);clear(map,b.x,b.y,7);}
 clear(map,spawn.x,spawn.y,3);
 return map;
}
