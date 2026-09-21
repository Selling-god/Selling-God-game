'use strict';
// End-to-end local HTTP test, including persisted-room restore and a paired damage comparison.
// A high-HP test encounter is seeded through the existing profile snapshot format.
const assert=require('node:assert/strict'),http=require('node:http'),cp=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const root=path.resolve(__dirname,'..'),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'fw-v8-relay-'));
const file=path.join(tmp,'profiles.json'),port=44000+(process.pid%4000);
fs.writeFileSync(file,'{}');
const user={profileId:'v8-relay-qa',nickname:'Relay QA'};
let proc,profile,room,checks=0;
const clone=x=>JSON.parse(JSON.stringify(x));
const check=(x,m)=>{assert.ok(x,m);checks++};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function req(method,url,body) { return new Promise((resolve,reject)=>{
 const r=http.request({host:'127.0.0.1',port,path:url,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{
  let text='';res.on('data',c=>text+=c);res.on('end',()=>{let data;try{data=JSON.parse(text)}catch{return reject(Error('Invalid JSON: '+text.slice(0,100)));}
  res.statusCode>=400?reject(Error(data.error||`HTTP ${res.statusCode}`)):resolve(data)});
 });r.on('error',reject);r.setTimeout(12000,()=>r.destroy(Error('HTTP timeout')));r.end(body?JSON.stringify(body):undefined);
});}
async function start() {
 proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:file,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SECRET_KEY:'',SUPABASE_SERVICE_ROLE_KEY:''},stdio:['ignore','ignore','inherit']});
 for(let i=0;i<100;i++){try{await req('GET','/healthz');return}catch{await sleep(60)}}
 throw Error('Server startup timeout');
}
async function stop(){if(!proc)return;const p=proc;proc=null;await new Promise(resolve=>{p.once('exit',resolve);p.kill('SIGTERM');setTimeout(()=>{p.kill('SIGKILL');resolve()},2500).unref()});await sleep(80);}
async function post(action,extra={}){const d=await req('POST',`/api/room/${room.id}/${action}`,{...user,...extra});room=d.room;return d;}
const pc=()=>room.battle.party.find(x=>x.playerId===user.profileId);
async function resumeSnapshot(snapshot) {
 await stop();
 const saved=JSON.parse(fs.readFileSync(file,'utf8'));
 saved[user.profileId]={...(saved[user.profileId]||profile),activeRoomId:snapshot.id,activeRoomSnapshot:clone(snapshot)};
 fs.writeFileSync(file,JSON.stringify(saved));
 await start();room=(await req('POST','/api/rooms/resume',user)).room;
 check(room?.status==='battle','persisted battle restored');
}
function bestAttack(mon) {if(!mon)throw Error('No living unacted combatant in the relay fixture');return mon.moves.filter(m=>['attack','burst'].includes(m.kind)&&m.pp>0).sort((a,b)=>Number(a.power)-Number(b.power))[0];}
async function attack() {
 const actor=pc().units.find(x=>x.hp>0&&!x.acted),target=room.battle.enemies.find(x=>x.hp>0),move=bestAttack(actor);
 check(!!move,'attack available');
 const pp=move.pp,before=room.seq;await post('move',{instanceId:actor.instanceId,moveId:move.id,targetUid:target.uid});
 const ev=room.feed.findLast(e=>e.type==='monster-move'&&e.seq>before&&e.payload.playerId===user.profileId);
 check(!!ev,'authoritative move event');
 check(ev.payload.pp===pp-1,'exactly one PP consumed');
 return ev.payload;
}
(async()=>{try{
 await start();profile=(await req('POST','/api/profile',user)).profile;
 room=(await req('POST','/api/rooms/create',{...user,mode:'journey',difficulty:'normal',name:'V8 relay fixture'})).room;
 await post('start');await post('contract',{contractId:room.contractOffers[user.profileId][0].id});await post('vote',{nodeId:room.route[0].id});
 check(room.status==='battle','new battle created');check(pc().elementRelay.elements.length===0,'new battle empty chain');
 const opening=clone(room),plans=new Map(room.battle.enemies.map(e=>[e.uid,e.intent?.moveId]));
 check(room.battle.enemies.every(e=>e.intent?.planned&&e.moves.some(m=>m.id===e.intent.moveId)),'opening intent names a real scheduled move');
 for(const enemy of opening.battle.enemies){enemy.hp=enemy.maxHp=100000;enemy.stagger=0;enemy.staggerMax=100000;}
 // Keep this intent probe independent of random enemy damage and forced swaps.
 for(const combatant of opening.battle.party)for(const m of [...combatant.units,...combatant.bench])m.hp=m.maxHp=5000;
 await resumeSnapshot(opening);
 check(room.battle.enemies.every(e=>e.intent?.moveId===plans.get(e.uid)),'scheduled moves survive server restart');
 const defender=pc().units[0],probe=defender.moves.find(m=>m.pp>0&&!m.sleep&&!m.freeze&&!m.shock&&!m.intentSeal);
 check(!!probe,'non-blocking move available for intent test');
 const seq=room.seq;await post('move',{instanceId:defender.instanceId,moveId:probe.id});
 for(const enemy of room.battle.enemies){
   const reply=room.feed.find(e=>e.seq>seq&&e.type==='enemy-attack'&&e.payload.enemyUid===enemy.uid);
   check(reply?.payload?.move?.id===plans.get(enemy.uid),`enemy executes the previewed move: expected=${plans.get(enemy.uid)} actual=${reply?.payload?.move?.id}; events=${room.feed.filter(e=>e.seq>seq).map(e=>e.type).join(',')}`);
 }
 check(room.battle.enemies.every(e=>e.intent?.planned),'next round has a new scheduled intent');
 const fixture=clone(room);
 // Use the existing fallback basic attack, not random enemy guard/status moves.
 // Fixed shield subtraction can make a +20% power change exceed a +35% HP-damage
 // change; exclude that unrelated variable from the paired multiplier fixture.
 for(const enemy of fixture.battle.enemies){enemy.hp=enemy.maxHp=100000;enemy.atk=1;enemy.block=0;enemy.moves=[];delete enemy.intent;delete enemy.plannedMoveId;enemy.stagger=0;enemy.staggerMax=10000;enemy.intent={type:'attack',value:1,icon:'',text:'QA'};}
 for(const combatant of fixture.battle.party){delete combatant.elementRelay;for(const m of [...combatant.units,...combatant.bench]){m.hp=m.maxHp=5000;m.majorStatus=null;m.statusTurns=0;}}
 await resumeSnapshot(fixture);check(!pc().elementRelay,'legacy snapshot without relay accepted');
 check(room.battle.enemies.every(e=>e.intent?.planned),'legacy enemy intent upgraded on resume');
 const used=[];
 for(let index=0;index<2;index++){
  const q=await attack();used.push(q.element);check(!q.elementRelay.burst,'first two no burst');
  check(pc().elementRelay.elements.length===index+1,'charge count persisted');
  const next=pc().bench.find(m=>m.hp>0&&!used.includes(m.element));
  check(!!next,'distinct starter available');
  const prior=clone(pc().elementRelay);await post('switch-monster',{activeId:pc().units[0].instanceId,benchId:next.instanceId});
  check(JSON.stringify(prior)===JSON.stringify(pc().elementRelay),'switch preserves chain');
 }
 const primed=clone(room);check(pc().elementRelay.elements.length===2,'third attack primed');
 check(room.battle.enemies.every(e=>e.block===0),'paired damage fixture has no flat shield subtraction');
 const boosted=await attack();
 check(boosted.elementRelay.burst,'third attack burst event');
 check(boosted.elementRelay.powerBonus===.2&&boosted.elementRelay.breakBonus===8,'bonus reported');
 check(pc().elementRelay.elements.length===0&&pc().elementRelay.activations===1,'charges consumed once');
 check(pc().stats.relayBursts===1,'combat stat records burst');
 const baseline=clone(primed);baseline.battle.party.find(x=>x.playerId===user.profileId).elementRelay={elements:[],activations:0};
 await resumeSnapshot(baseline);const plain=await attack();
 check(!plain.elementRelay.burst,'control has no burst');
 check(boosted.damage>plain.damage,'power bonus increases actual server damage');
 check(boosted.damage>=Math.floor(plain.damage*1.10)&&boosted.damage<=Math.ceil(plain.damage*1.35),`damage comparison in expected rounding range (${plain.damage} -> ${boosted.damage})`);
 await post('debug-win');check(room.status==='reward','reward reachable');
 if(room.reward.playerOptions?.[user.profileId]?.length)await post('salvage');
 await post('continue');
 if(room.status==='route')await post('vote',{nodeId:room.route[0].id});
 check(room.status==='battle','next encounter reachable');
 check(pc().elementRelay.elements.length===0&&pc().elementRelay.activations===0,'new encounter resets relay');
 console.log(`V8_RUNTIME_RELAY_OK checks=${checks} damage=${plain.damage}->${boosted.damage} pp=yes switch=yes restore=yes nextEncounter=yes intent=yes`);
}catch(e){console.error('V8_RUNTIME_RELAY_FAIL',e.stack);process.exitCode=1;}
finally{await stop();fs.rmSync(tmp,{recursive:true,force:true});}})();
