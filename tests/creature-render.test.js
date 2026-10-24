import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {MONSTERS} from '../shared/content.js';
import {REGION_ECOLOGY} from '../shared/encounters.js';
import {createMap} from '../shared/world.js';
import {paintCreature,drawCreature,creatureFrame,creatureCacheSize,clearCreatureCache,creatureHitTest} from '../client/creatures.js';
import {drawTerrainCell} from '../client/terrain-render.js';
import {drawEncounterOverlay,drawPhaseTransition} from '../client/encounters-ui.js';
const require=createRequire(import.meta.url);let native;
try{native=require('@napi-rs/canvas');}catch{if(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)try{native=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/@napi-rs/canvas');}catch{}}
const fingerprint=cv=>createHash('sha256').update(cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data).digest('hex');
const count=cv=>{const a=cv.getContext('2d').getImageData(0,0,cv.width,cv.height).data;let n=0;for(let i=3;i<a.length;i+=4)if(a[i])n++;return n;};

test('authoritative attack clocks select preparation, strike, recovery and return to idle',()=>{
 const mob={moving:false,dir:'w',phase:2,encounterPose:{kind:'charge',stage:'windup',starts:100,ends:900}};
 assert.equal(creatureFrame(mob,99).stage,'idle');assert.equal(creatureFrame(mob,400).stage,'windup');
 assert.equal(creatureFrame(mob,901).stage,'idle');assert.equal(creatureFrame(mob,400).phase,2);
 mob.encounterPose={kind:'leap',stage:'strike',starts:900,ends:1400};assert.equal(creatureFrame(mob,1100).kind,'leap');
 mob.encounterPose={kind:'leap',stage:'recover',starts:1400,ends:2200};assert.equal(creatureFrame(mob,1700).stage,'recover');
 mob.moving=true;mob.encounterPose={kind:'idle',stage:'move',starts:1900,ends:2900};
 assert.notEqual(creatureFrame(mob,2000).frame,creatureFrame(mob,2110).frame,'fresh idle snapshots do not freeze the walking cycle');
});

test('click targeting includes a tall monster body without changing its ground collision',()=>{
 const m={x:400,y:400},def=MONSTERS.dungeon_neme;
 assert.equal(creatureHitTest(def,m,{x:400,y:305}),true);
 assert.equal(creatureHitTest(def,m,{x:400,y:420}),false);
 assert.equal(creatureHitTest(def,m,{x:540,y:340}),false);
 assert.equal(m.x,400);assert.equal(m.y,400);
});

test('48 regional creatures have visible distinct raster identities and readable attack pose changes',{skip:!native},()=>{
 const hashes=new Set();let total=0;
 for(const roster of Object.values(REGION_ECOLOGY))for(const species of roster){
  const def=MONSTERS[species.id],cv=native.createCanvas(88,96),c=cv.getContext('2d');
  assert.ok(def?.creature,species.id);
  const draw=stage=>{c.clearRect(0,0,88,96);paintCreature(c,def,{kind:species.behavior,stage,frame:stage==='windup'?6:3,phase:0,moving:false,dir:'e'});return fingerprint(cv);};
  const wind=draw('windup');assert.ok(count(cv)>140,species.id+' is visible');
  const strike=draw('strike');assert.notEqual(wind,strike,species.id+' has a distinct strike pose');
  c.clearRect(0,0,88,96);paintCreature(c,def,{kind:'idle',stage:'idle',frame:0,phase:0,moving:false,dir:'e'});hashes.add(fingerprint(cv));total++;
 }
 assert.equal(total,48);assert.equal(hashes.size,48,'anatomy, accessories and palettes distinguish every regional entry');
});

test('three dungeon bodies and four raid bodies visibly transform at both phase boundaries',{skip:!native},()=>{
 for(const id of ['dungeon_arke','dungeon_neme','dungeon_astra','world_tempest','world_leviathan','world_glacier','world_eclipse']){
  const hashes=new Set(),cv=native.createCanvas(88,96),c=cv.getContext('2d');
  for(let phase=0;phase<3;phase++){c.clearRect(0,0,88,96);paintCreature(c,MONSTERS[id],{kind:'idle',stage:'idle',frame:1,phase,moving:false,dir:'e'});hashes.add(fingerprint(cv));}
  assert.equal(hashes.size,3,id+' has three different phase sprites');
 }
});

test('terrain artwork distinguishes blocking surfaces and real bridge/stair routes',{skip:!native},()=>{
 const cv=native.createCanvas(32,32),c=cv.getContext('2d'),hashes=new Set();
 for(let surface=0;surface<=8;surface++){
  const map={id:'forest',w:1,h:1,terrain:{style:'forest',surface:new Uint8Array([surface]),elevation:new Uint8Array([2])}};
  c.clearRect(0,0,32,32);drawTerrainCell(c,map,0,0,0,0);assert.equal(count(cv),1024);hashes.add(fingerprint(cv));
 }
 assert.equal(hashes.size,9);
 for(const id of ['desert','deepsea','sky','party_dungeon','party_archive','party_observatory']){
  const m=createMap(id);assert.ok(m.terrain);
  for(const feature of m.terrain.features||[])assert.ok(Number.isFinite(feature.x)&&Number.isFinite(feature.y));
 }
});

test('essential moving projectiles, residual hazards and phase cuts remain visible with cosmetics off',{skip:!native},()=>{
 const cv=native.createCanvas(900,600),c=cv.getContext('2d'),now=Date.now(),r={ctx:c,w:900,h:600,dpr:1,zoom:1,showEffects:false,lowPower:true,clock:0,createPixelCanvas:native.createCanvas,label(){},state:{self:{x:200,y:200}}};
 const view={projectiles:[{id:'p',owner:'b',x:220,y:220,angle:.4,radius:7,theme:'fire',ends:now+1000}],hazards:[{id:'h',x:180,y:180,radius:45,theme:'nature',activeAt:now-100,ends:now+2000}]};
 drawEncounterOverlay(r,view,100,'ground');drawEncounterOverlay(r,view,100,'foreground');assert.ok(count(cv)>1000);
 c.clearRect(0,0,900,600);
 const state={mobs:[{id:'boss',type:'dungeon_arke',phase:1,dir:'e'}],dungeon:{phaseTransition:{bossId:'boss',starts:now-500,ends:now+1300,phase:2,title:'OPEN FURNACE',description:'A second attack cycle awakens.',theme:'fire'}}};
 assert.equal(drawPhaseTransition(r,state,100),true);assert.ok(count(cv)>120000);
 state.dungeon.phaseTransition.ends=now-1;assert.equal(drawPhaseTransition(r,state,100),false);
});

test('creature sprite cache remains bounded during region and phase changes',{skip:!native},()=>{
 clearCreatureCache();const cv=native.createCanvas(260,260),r={ctx:cv.getContext('2d'),clock:0,createPixelCanvas:native.createCanvas,lowPower:true};
 for(const roster of Object.values(REGION_ECOLOGY))for(const species of roster)for(let phase=0;phase<3;phase++){
  drawCreature(r,{id:species.id,dir:'e',phase,moving:false},MONSTERS[species.id],130,220,0);
 }
 assert.ok(creatureCacheSize()<=128);assert.ok(count(cv)>0);
});
