import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter} from '../server/game.js';
import {MONSTERS} from '../shared/content.js';
import {lineOfSight} from '../shared/world.js';

function scene(){
 const effects=[];
 const game=new Game({broadcast:(zone,event,data)=>{if(event==='fx')effects.push(data);}});
 game.now=Date.UTC(2026,0,1,0,15);
 const p=game.addPlayer(newCharacter('test-hero','Test hero','novice'));
 Object.assign(p,{zone:'forest',x:340,y:240,invulnerableUntil:0,lastCombat:game.now});
 p.hp=game.stats(p).maxHp;
 const w=game.worlds.get('forest');
 w.map={...w.map,w:32,h:24,blocked:new Uint8Array(32*24),terrain:null};
 for(let x=0;x<32;x++){w.map.blocked[x]=1;w.map.blocked[23*32+x]=1;}
 for(let y=0;y<24;y++){w.map.blocked[y*32]=1;w.map.blocked[y*32+31]=1;}
 w.mobs=[];w.casts=[];w.encounterHitAt=new Map();w.encounterHazards=[];w.encounterProjectiles=[];
 return {game,p,w,effects};
}
function missile(p,group='projectile-test'){
 return {id:'p1',castId:'flight',owner:'test-mob',monster:'slime',x:p.x-40,y:p.y-27,angle:0,radius:6,speed:400,
  damage:30,theme:'nature',group,boss:false,ends:Date.UTC(2026,0,1,0,16),dead:false};
}

test('basic monsters deal noticeable damage rather than single-digit scratches',()=>{
 assert.ok(MONSTERS.slime.atk>=28);
 assert.ok(MONSTERS.wolf.atk>=42);
 const {game,p}=scene();const hp=p.hp;
 game.damagePlayer(p,MONSTERS.slime.atk,{monster:true});
 assert.ok(hp-p.hp>=20,'a hit from the starter slime must be meaningful without one-shotting a fresh player');
 assert.ok(p.hp>0);
});

test('a shot visually passing through the avatar torso applies HP damage',()=>{
 const {game,p,w,effects}=scene();const shot=missile(p),hp=p.hp;
 game.encounters.tickProjectile(w,shot,[p],.1);
 assert.equal(shot.dead,true,'the projectile collides with the rendered body');
 assert.ok(p.hp<hp,'an upper-body hit must reduce HP');
 assert.ok(effects.some(e=>e.type==='hit'&&e.kind==='player'));
});

test('a missile clearly above the sprite is a miss',()=>{
 const {game,p,w}=scene();const shot=missile(p);shot.y=p.y-61;
 const hp=p.hp;game.encounters.tickProjectile(w,shot,[p],.1);
 assert.equal(shot.dead,false);assert.equal(p.hp,hp);
});

test('a circular telegraph damages everyone inside its marked ground area even with intervening scenery',()=>{
 const {game,p,w}=scene();p.x=340;
 const cast={id:'ground-test',x:160,y:p.y,radius:168,shape:'circle',group:'aoe',damage:33};
 for(let y=1;y<23;y++)w.map.blocked[y*32+8]=1;
 assert.equal(lineOfSight(w.map,cast,p),false);
 const hp=p.hp;game.encounters.damageCast(w,cast,[p]);
 assert.ok(p.hp<hp,'the telegraphed circle must use its visible shape, not hidden line-of-sight rejection');
});

test('monster defense cannot turn a visible landed attack into 1 HP in heavy gear',()=>{
 const {game,p}=scene();const normal=game.stats.bind(game);
 game.stats=hero=>({...normal(hero),def:1000});
 const hp=p.hp,damage=game.damagePlayer(p,40,{monster:true});
 assert.ok(damage>=14,'monster damage retains a 35% floor before class reductions');
 assert.equal(p.hp,hp-damage);
});

test('invulnerable contact leaves HP untouched and gives a throttled, readable dodge label',()=>{
 const {game,p,effects}=scene();const hp=p.hp;
 p.invulnerableUntil=game.now+2000;p.dashUntil=game.now+2000;
 assert.equal(game.damagePlayer(p,42,{monster:true}),0);assert.equal(p.hp,hp);
 assert.equal(effects.filter(e=>e.kind==='evade'&&e.amount==='회피').length,1);
 game.now+=120;game.damagePlayer(p,42,{monster:true});
 assert.equal(effects.filter(e=>e.kind==='evade').length,1,'do not flood the screen with evade feedback');
 game.now+=2200;assert.ok(game.damagePlayer(p,42,{monster:true})>0);
});

test('a single multi-projectile volley cannot apply several full hits in the same instant',()=>{
 const {game,p,w,effects}=scene();const hp=p.hp;
 const first=missile(p,'fan-one'),second=missile(p,'fan-one');second.id='p2';
 game.encounters.tickProjectile(w,first,[p],.1);game.encounters.tickProjectile(w,second,[p],.1);
 assert.ok(p.hp<hp);
 assert.equal(effects.filter(e=>e.kind==='player'&&e.type==='hit').length,1);
 assert.ok(effects.some(e=>e.kind==='evade'&&e.amount==='연속 공격 방어'));
});
