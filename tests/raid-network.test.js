import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {WebSocket as WS} from 'ws';
import {newCharacter} from '../server/game.js';
import {getStats} from '../shared/content.js';
import {createMap} from '../shared/world.js';
import {DUNGEONS,DUNGEON_ZONE} from '../shared/dungeons.js';
import {REALMS,realmWeapon} from '../shared/realms.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

/** The real server/protocol runs unchanged; only its listening address is local. */
async function startServer(existingDir){
 const dir=existingDir||await fs.mkdtemp(path.join(os.tmpdir(),'starfall-raid-wire-'));
 const preload=path.join(dir,'loopback-only.mjs');
 await fs.writeFile(preload,`import http from 'node:http';
const listen=http.Server.prototype.listen;
http.Server.prototype.listen=function(port,host,...args){
 if(port!==0||host!=='0.0.0.0')throw new Error('The network test only permits its ephemeral loopback listener.');
 this.once('listening',()=>process.stdout.write('RAID_TEST_PORT='+this.address().port+'\\n'));
 return listen.call(this,0,'127.0.0.1',...args);
};
`);
 const child=spawn(process.execPath,['--import',pathToFileURL(preload).href,'server/index.js'],{cwd:root,
  env:{...process.env,PORT:'0',NODE_ENV:'development',ALLOW_DEV_GUEST:'true',DEV_DATA_DIR:dir,
   SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:''},
  stdio:['ignore','pipe','pipe']});
 let log='',port=0;child.stdout.on('data',chunk=>{log+=chunk;port=Number(log.match(/RAID_TEST_PORT=(\d+)/)?.[1]||0);});child.stderr.on('data',chunk=>log+=chunk);
 const app={dir,child,log:()=>log,port:0,stop:async(keepStore=false)=>{
  if(child.exitCode===null){
   const ended=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');
   await Promise.race([ended,sleep(5000)]);
   if(child.exitCode===null){child.kill('SIGKILL');await ended;}
  }
  if(!keepStore)await fs.rm(dir,{recursive:true,force:true});
 }};
 for(let i=0;i<100;i++){
  if(child.exitCode!==null)break;
  if(port)try{const response=await fetch(`http://127.0.0.1:${port}/health`);if(response.ok){app.port=port;return app;}}catch{}
  await sleep(50);
 }
 await app.stop();throw new Error('Local raid test server did not start: '+log);
}

class Client{
 constructor(port,id){
  this.id=id;this.messages=[];this.pending=new Map();this.requestSeq=0;this.inputSeq=0;
  this.ws=new WS(`ws://127.0.0.1:${port}/socket`);
  this.ws.on('open',()=>this.emit('auth',{devId:id}));this.ws.on('error',()=>{});
  this.ws.on('message',raw=>{
   const message=JSON.parse(raw);this.messages.push(message);
   if(message.ack){this.pending.get(message.ack)?.(message.data);this.pending.delete(message.ack);}
  });
 }
 emit(event,data){this.ws.send(JSON.stringify({event,data}));}
 request(event,data){
  const id=++this.requestSeq;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('WS acknowledgement timed out: '+event));},6000);
   this.pending.set(id,result=>{clearTimeout(timer);resolve(result);});
   this.ws.send(JSON.stringify({event,data,id}));
  });
 }
 action(data){return this.request('action',{...data,nonce:randomUUID()});}
 input(x,y){const seq=++this.inputSeq;this.emit('input',{x,y,seq});return seq;}
 async wait(event,predicate=()=>true,after=0){
  for(let i=0;i<180;i++){
   const message=this.messages.slice(after).find(m=>m.event===event&&predicate(m.data));
   if(message)return message.data;await sleep(40);
  }
  throw new Error('WS event timed out: '+event+'; recent='+JSON.stringify(this.messages.slice(-2)));
 }
 last(event){return this.messages.filter(m=>m.event===event).at(-1)?.data;}
 async close(){
  if(this.ws.readyState===WS.CLOSED)return;
  const ended=new Promise(resolve=>this.ws.once('close',resolve));
  if(this.ws.readyState===WS.CONNECTING)this.ws.terminate();else this.ws.close();
  await Promise.race([ended,sleep(1500)]);if(this.ws.readyState!==WS.CLOSED)this.ws.terminate();
 }
}

function seed(id,name,cls='guardian'){
 const p=newCharacter(id,name,cls),part=cls==='mage'?'staff':'sword';
 p.level=200;p.gold=20000;p.attributes={str:cls==='mage'?0:400,int:cls==='mage'?400:0,dex:0,luk:0,vit:396};
 p.inventory['end_dawnend_'+part]=1;p.inventory.end_dawnend_armor=1;p.inventory.end_dawnend_charm=1;
 p.equipment={weapon:'end_dawnend_'+part,armor:'end_dawnend_armor',charm:'end_dawnend_charm'};
 p.dungeons.tokens=11;p.dungeons.claims=['memory_archive'];
 p.dungeons.records.memory_archive={clears:2,attempts:3,wipes:1,bestMs:120000,firstAt:1700000000000};
 p.dungeons.daily.memory_archive='2026-10-23';
 p.realms.known=['heaven'];p.realms.unlocked=['heaven'];p.realms.trials=['heaven'];p.realms.cleared=['heaven'];
 p.realms.traces=['starweaver','tide_oracle'];p.realms.weapons.heaven={part,stable:true};
 p.inventory[realmWeapon('heaven',part,true)]=1;p.enhancements[realmWeapon('heaven',part,true)]=4;
 p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;return p;
}
const writeSeed=(app,p)=>fs.writeFile(path.join(app.dir,p.id+'.json'),JSON.stringify(p));
const readSave=(app,id)=>fs.readFile(path.join(app.dir,id+'.json'),'utf8').then(JSON.parse);

test('real WS raid: individual ready/cancel, leader start, live input, reconnect grace, party exit and cold-load persistence',{timeout:35000},async()=>{
 let app=await startServer();const clients=[];
 try{
  const def=DUNGEONS[0],gate=createMap(def.entryZone).dungeonEntrance,ids=[randomUUID(),randomUUID()];
  const saved=ids.map((id,i)=>{const p=seed(id,i?'RaidPartner':'RaidLeader',i?'mage':'guardian');Object.assign(p,{zone:def.entryZone,x:gate.x+i*20,y:gate.y});return p;});
  await Promise.all(saved.map(p=>writeSeed(app,p)));
  const [a,b]=ids.map(id=>new Client(app.port,id));clients.push(a,b);
  const welcomes=await Promise.all([a.wait('welcome'),b.wait('welcome')]);assert.ok(welcomes.every(w=>w.existing));
  await Promise.all([a.wait('state'),b.wait('state')]);
  assert.equal((await a.action({type:'partyInvite',id:b.id})).ok,true);await b.wait('partyInvite');
  assert.equal((await b.action({type:'partyAccept'})).ok,true);await a.wait('state',s=>s.party?.members.length===2);
  const opening=await a.action({type:'dungeonLobby',id:def.id});assert.equal(opening.ok,true,opening.error);
  const lobbyId=opening.lobbyId;
  await Promise.all([a.wait('state',s=>s.dungeon?.lobbyId===lobbyId),b.wait('state',s=>s.dungeon?.lobbyId===lobbyId)]);
  assert.equal((await a.action({type:'dungeonReady',lobbyId,ready:true})).ok,true);
  assert.equal((await a.action({type:'dungeonStart',lobbyId})).ok,false,'leader cannot approve for a partner');
  assert.equal((await b.action({type:'dungeonReady',lobbyId,ready:true})).ok,true);
  let after=a.messages.length;assert.equal((await b.action({type:'dungeonReady',lobbyId,ready:false})).ok,true);
  await a.wait('state',s=>s.dungeon?.members.some(m=>m.id===b.id&&!m.ready),after);
  assert.equal((await a.action({type:'dungeonStart',lobbyId})).ok,false,'cancelled consent must block entry');
  assert.equal((await b.action({type:'dungeonReady',lobbyId,ready:true})).ok,true);
  assert.equal((await b.action({type:'dungeonStart',lobbyId})).ok,false,'a prepared partner still cannot start the run');
  const start=await a.action({type:'dungeonStart',lobbyId});assert.equal(start.ok,true,start.error);
  const [firstA,firstB]=await Promise.all([a.wait('state',s=>s.zone===DUNGEON_ZONE&&s.dungeon?.runId===start.runId),b.wait('state',s=>s.zone===DUNGEON_ZONE&&s.dungeon?.runId===start.runId)]);
  assert.equal(firstA.dungeon.selfId,a.id);assert.equal(firstB.dungeon.selfId,b.id);assert.equal(firstA.dungeon.attempt,1);
  const baseline=firstA.self.x;after=a.messages.length;const seq=a.input(1,0);
  await a.wait('state',s=>s.self.inputSeq>=seq&&s.self.x>baseline+5,after);a.input(0,0);
  const encounter=await a.wait('state',s=>s.dungeon?.phase==='balance'&&s.dungeon.boss);
  const peer=await b.wait('state',s=>s.dungeon?.boss?.id===encounter.dungeon.boss.id);
  assert.equal(peer.dungeon.boss.hp,encounter.dungeon.boss.hp);assert.equal(encounter.dungeon.assignments.length,2);

  after=a.messages.length;await b.close();
  const paused=await a.wait('state',s=>s.dungeon?.state==='grace'&&s.dungeon.members.some(m=>m.id===b.id&&!m.online),after);
  assert.equal(paused.dungeon.runId,start.runId);assert.equal(paused.dungeon.inputBlocked,true);
  assert.ok(paused.dungeon.graceEnds-paused.t>28000);
  assert.equal((await a.action({type:'move',x:paused.self.x+80,y:paused.self.y})).ok,false);
  const freezeMark=a.messages.length;a.input(1,0);await sleep(220);
  const frozen=await a.wait('state',s=>s.dungeon?.state==='grace',freezeMark);assert.equal(frozen.self.x,paused.self.x);
  const re=new Client(app.port,b.id);clients.push(re);const welcome=await re.wait('welcome');
  assert.equal(welcome.existing,true);assert.equal(welcome.profile.zone,DUNGEON_ZONE);
  const [resumedA,resumedB]=await Promise.all([a.wait('state',s=>s.dungeon?.state==='active'&&s.dungeon.runId===start.runId&&s.dungeon.members.every(m=>m.online),freezeMark),re.wait('state',s=>s.dungeon?.state==='active'&&s.dungeon.runId===start.runId)]);
  assert.equal(resumedB.dungeon.boss.id,encounter.dungeon.boss.id);assert.equal(resumedB.dungeon.attempt,1);
  assert.ok(resumedA.dungeon.ends>paused.dungeon.ends,'the grace interval must extend the run deadline');
  assert.equal(resumedA.dungeon.inputBlocked,false);assert.equal(resumedA.dungeon.members.length,2);
  const reMark=re.messages.length,reSeq=re.input(-1,0);
  await re.wait('state',s=>s.self.inputSeq>=reSeq&&s.self.x<resumedB.self.x-5,reMark);re.input(0,0);

  const exitMark=a.messages.length;assert.equal((await a.action({type:'dungeonExit'})).ok,true);
  await Promise.all([a.wait('state',s=>s.zone===def.entryZone&&s.dungeon===null,exitMark),re.wait('state',s=>s.zone===def.entryZone&&s.dungeon===null,reMark)]);
  assert.equal((await a.request('save',{})).ok,true);assert.equal((await re.request('save',{})).ok,true);
  const disk=await Promise.all(ids.map(id=>readSave(app,id)));
  for(let i=0;i<2;i++){
   assert.equal(disk[i].zone,def.entryZone);assert.equal(disk[i].dungeons.returnPoint,null);
   assert.equal(disk[i].dungeons.records[def.id].attempts,1);assert.equal(disk[i].dungeons.lastResult.won,false);
   assert.equal(disk[i].dungeons.tokens,11);assert.deepEqual(disk[i].dungeons.claims,saved[i].dungeons.claims);
   assert.deepEqual(disk[i].dungeons.records.memory_archive,saved[i].dungeons.records.memory_archive);
   assert.deepEqual(disk[i].realms,saved[i].realms);
  }
  await Promise.all([a.close(),re.close()]);const dir=app.dir;await app.stop(true);app=await startServer(dir);
  for(let i=0;i<2;i++){
   const restored=new Client(app.port,ids[i]);clients.push(restored);const w=await restored.wait('welcome');
   assert.deepEqual(w.profile.dungeons,disk[i].dungeons);assert.equal(w.profile.zone,def.entryZone);
   for(const key of Object.keys(saved[i].realms))assert.deepEqual(w.profile.realms[key],saved[i].realms[key]);
  }
 }catch(error){error.message+='\nLocal server log:\n'+app.log();throw error;}
 finally{await Promise.allSettled(clients.map(client=>client.close()));await app.stop();}
});

test('real WS realm: altar tuning, unlocked re-entry and cold-load weapon/progression round trip',{timeout:20000},async()=>{
 let app=await startServer();const clients=[];
 try{
  const r=REALMS[0],id=randomUUID(),p=seed(id,'RealmWire'),altar=createMap(r.sanctum).realmMarkers.find(m=>m.realmKind==='altar');
  const old=realmWeapon(r.id,'sword'),next=realmWeapon(r.id,'sword',true);
  Object.assign(p,{zone:r.sanctum,x:altar.x,y:altar.y});p.realms.weapons.heaven.stable=false;
  delete p.inventory[next];delete p.enhancements[next];p.inventory[old]=1;p.equipment.weapon=old;p.enhancements[old]=6;p.enhancePity[old]=2;
  p.inventory[r.material]=6;p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
  await writeSeed(app,p);const client=new Client(app.port,id);clients.push(client);
  await client.wait('welcome');await client.wait('state',s=>s.realm?.area==='sanctum');
  assert.equal((await client.action({type:'realmTune',id:r.id,stable:true})).ok,true);
  assert.equal((await client.action({type:'realmTune',id:r.id,stable:true})).ok,false);
  assert.equal((await client.action({type:'realmExit'})).ok,true);
  await client.wait('state',s=>s.zone==='town');
  assert.equal((await client.action({type:'realmEnter',id:r.id})).ok,true);
  const garden=await client.wait('state',s=>s.zone===r.garden&&s.realm?.attuned);assert.equal(garden.realm.unlocked,true);
  assert.equal((await client.action({type:'realmExit'})).ok,true);await client.wait('state',s=>s.zone==='town');
  assert.equal((await client.request('save',{})).ok,true);const disk=await readSave(app,id);
  assert.equal(disk.inventory[old],0);assert.equal(disk.inventory[next],1);assert.equal(disk.equipment.weapon,next);
  assert.equal(disk.enhancements[next],6);assert.equal(disk.enhancePity[next],2);assert.equal(disk.gold,p.gold-r.level*5);
  assert.equal(disk.inventory[r.material],3);assert.equal(disk.realms.weapons.heaven.stable,true);
  assert.deepEqual(disk.dungeons,p.dungeons);
  await client.close();const dir=app.dir;await app.stop(true);app=await startServer(dir);
  const re=new Client(app.port,id);clients.push(re);const welcome=await re.wait('welcome');
  assert.equal(welcome.profile.zone,'town');assert.equal(welcome.profile.equipment.weapon,next);assert.equal(welcome.profile.enhancements[next],6);
  assert.equal(welcome.profile.realms.weapons.heaven.stable,true);assert.deepEqual(welcome.profile.realms.unlocked,['heaven']);
  assert.deepEqual(welcome.profile.dungeons,p.dungeons);assert.equal((await re.action({type:'realmEnter',id:r.id})).ok,true);
  await re.wait('state',s=>s.zone===r.garden&&s.realm?.attuned);
 }catch(error){error.message+='\nLocal server log:\n'+app.log();throw error;}
 finally{await Promise.allSettled(clients.map(client=>client.close()));await app.stop();}
});
