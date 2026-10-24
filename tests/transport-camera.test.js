import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Game,newCharacter,hydrate} from '../server/game.js';
import {WORLD_BOSSES} from '../shared/expansion.js';
import {bossWindow} from '../server/world-events.js';
import {createMap,isBlocked,moveEntity,dist} from '../shared/world.js';
import {cameraTarget,followCamera} from '../shared/camera.js';
import {LocalMotion} from '../client/motion.js';
import {Renderer} from '../client/render.js';

for(const def of WORLD_BOSSES)test(`${def.id}: direct arrival permits server and predicted movement in every direction`,()=>{
 const g=new Game({random:()=>.5});
 g.now=3600000*500+def.minute*60000+1000;
 const p=g.addPlayer(newCharacter(randomUUID(),'Arrival','guardian'));
 p.level=def.level;p.inputSeq=14;p.path=[{x:200,y:200}];p.dashUntil=g.now+190;p.dashVector={x:1,y:0};
 const epoch=p.motionId;
 g.events.spawn(def,bossWindow(def,g.now),{status:'active'});
 assert.equal(g.events.join(p,def.id).ok,true);
 assert.equal(p.zone,def.zone);
 assert.equal(p.motionId,epoch+1);
 assert.equal(p.dashUntil,0);
 assert.deepEqual(p.path,[]);
 assert.deepEqual(p.input,{x:0,y:0});
 const map=g.worlds.get(def.zone).map,start={x:p.x,y:p.y};
 assert.equal(isBlocked(map,start.x,start.y,10),false);
 for(const direction of [{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}]){
  const walk={...start};moveEntity(map,walk,direction.x*16,direction.y*16,10);
  assert.ok(dist(start,walk)>15.9,'arrival must have a free exit in each direction');
  const client=new LocalMotion(),state={...g.snapshot(p).self,hp:100};
  client.accept(state,p.zone,1000,map);
  client.step(map,direction,state,.05,1050,g.now+50);
  assert.ok(dist(start,client.position)>2,'client prediction must also escape the arrival');
 }
 g.setInput(p,{x:1,y:0,seq:15});g.tick(.05,g.now+50);
 assert.ok(p.x>start.x+2,'the next accepted movement packet moves the server character');
});

test('generic transport and old saves recover from the original blocked boss destination',()=>{
 const map=createMap('meadow'),arena=map.eventArena,bad={x:arena.x-210,y:arena.y+110};
 const g=new Game({random:()=>.5}),p=g.addPlayer(newCharacter(randomUUID(),'Recovery','guardian'));
 g.teleport(p,'meadow',bad.x,bad.y);
 assert.equal(isBlocked(map,p.x,p.y,10),false);
 const restored=hydrate({...newCharacter(randomUUID(),'Saved','guardian'),zone:'meadow',...bad});
 assert.equal(isBlocked(map,restored.x,restored.y,10),false);
 for(const actor of [p,restored]){
  const initial={x:actor.x,y:actor.y};moveEntity(map,actor,16,0,10);
  assert.ok(dist(initial,actor)>15.9,'safe recovery must allow movement immediately');
 }
});

test('same-zone transport discards old prediction corrections, paths and dashes',()=>{
 const map=createMap('meadow'),motion=new LocalMotion();
 const s={x:map.eventArena.x,y:map.eventArena.y,hp:100,speed:170,motionId:1,dashUntil:0};
 motion.accept(s,'meadow',1000,map);
 motion.path=[{x:s.x-100,y:s.y}];motion.correction={x:100,y:-80};motion.dash({x:1,y:0},1000);
 motion.lastDelta={x:25,y:10};
 const arrived={...s,x:s.x-128,y:s.y+64,motionId:2};
 motion.accept(arrived,'meadow',1020,map);
 assert.deepEqual(motion.path,[]);assert.deepEqual(motion.correction,{x:0,y:0});
 assert.deepEqual(motion.dashVector,{x:0,y:0});assert.deepEqual(motion.lastDelta,{x:0,y:0});
 motion.step(map,{x:0,y:0},arrived,.05,1070,1070);
 assert.deepEqual({x:motion.position.x,y:motion.position.y},{x:arrived.x,y:arrived.y});
 motion.step(map,{x:0,y:-1},arrived,.05,1120,1120);
 assert.ok(motion.position.y<arrived.y-2);
});

test('zone changes and large server corrections reset the coordinate history',()=>{
 const motion=new LocalMotion(),map=createMap('coast');
 const s={x:500,y:500,hp:100,motionId:0};
 motion.accept(s,'town',1000,createMap('town'));
 motion.accept({...s,x:1300,y:1000},'coast',1100,map);
 assert.equal(motion.zone,'coast');assert.equal(motion.history.length,1);
 assert.equal(motion.position.x,1300);
 motion.accept({...s,x:700,y:700},'coast',1200,map);
 assert.equal(motion.history.length,1);assert.equal(motion.position.x,700);
});

test('map edges stay inside the central play area on phone, desktop and zoomed-out displays',()=>{
 const maps=[{width:5120,height:3584},{width:1792,height:1408},{width:1152,height:896},{width:160,height:128}];
 const viewports=[{width:390,height:844,zoom:1.28},{width:900,height:520,zoom:1.4},{width:1920,height:1080,zoom:1.6},{width:3840,height:2160,zoom:.96}];
 for(const map of maps)for(const viewport of viewports)for(const x of [16,map.width/2,map.width-16])for(const y of [16,map.height/2,map.height-16]){
  const camera=cameraTarget(map,{x,y},viewport);
  const screenX=.5+(x-camera.x)*viewport.zoom/viewport.width;
  const screenY=.5+(y-camera.y)*viewport.zoom/viewport.height;
  assert.ok(screenX>=.25&&screenX<=.75,JSON.stringify({map,viewport,x,screenX}));
  assert.ok(screenY>=.25&&screenY<=.75,JSON.stringify({map,viewport,y,screenY}));
 }
 const edge=cameraTarget(maps[0],{x:16,y:16},viewports[2]);
 assert.ok(edge.x-viewports[2].width/viewports[2].zoom/2<0,'edge following must allow decorative overscan');
});

test('camera follows smoothly at equal elapsed times and snaps on transport or viewport changes',()=>{
 const map={width:5120,height:3584},viewport={width:1920,height:1080,zoom:1.6};
 const target={x:3000,y:2000},old={x:2000,y:1500};
 const whole=followCamera(old,map,target,viewport,.1);
 const half=followCamera(followCamera(old,map,target,viewport,.05),map,target,viewport,.05);
 assert.ok(dist(whole,half)<1e-8);
 assert.ok(whole.x>old.x&&whole.x<target.x);
 assert.deepEqual(followCamera(old,map,target,viewport,.01,{snap:true}),cameraTarget(map,target,viewport));
 const resized={width:390,height:844,zoom:1.28};
 assert.deepEqual(followCamera(old,map,target,resized,0,{snap:true}),cameraTarget(map,target,resized));
});

test('portrait edge following stays between the upper tracker and the lower touch controls',()=>{
 const map={width:1792,height:1408},viewport={width:390,height:844,zoom:1.28};
 for(const x of [16,map.width/2,map.width-16])for(const y of [16,map.height/2,map.height-16]){
  const camera=cameraTarget(map,{x,y},viewport);
  const sx=.5+(x-camera.x)*viewport.zoom/viewport.width,sy=.5+(y-camera.y)*viewport.zoom/viewport.height;
  assert.ok(sx>=.44&&sx<=.56);assert.ok(sy>=.47&&sy<=.54);
 }
});

test('small maps and temporarily zero-sized viewports produce finite camera positions',()=>{
 const map={width:160,height:128},viewport={width:3840,height:2160,zoom:1};
 assert.deepEqual(cameraTarget(map,{x:16,y:16},viewport),{x:80,y:64});
 const camera=followCamera({x:NaN,y:Infinity},map,{x:NaN,y:Infinity},{width:0,height:0,zoom:0},.016);
 assert.ok(Number.isFinite(camera.x)&&Number.isFinite(camera.y));
});

test('world picking and screen rendering use the same coordinates with edge overscan and zoom',()=>{
 const map={width:1792,height:1408};
 for(const viewport of [{width:1920,height:1080,zoom:.96},{width:951,height:540,zoom:1.4},{width:390,height:844,zoom:1.28}]){
  const renderer=Object.assign(Object.create(Renderer.prototype),{w:viewport.width,h:viewport.height,zoom:viewport.zoom,dpr:1.5,
   camera:cameraTarget(map,{x:map.width-64,y:64},viewport)});
  for(const point of [{x:map.width-64,y:64},{x:0,y:0},{x:map.width,y:map.height}]){
   const screen=renderer.worldToScreen(point.x,point.y),picked=renderer.screenToWorld(screen.x,screen.y);
   assert.ok(dist(point,picked)<1e-8);
  }
 }
});
