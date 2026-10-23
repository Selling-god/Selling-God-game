import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {WebSocket as WS} from 'ws';
import {newCharacter} from '../server/game.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

async function startServer(port,mode='development',extra={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'starfall-network-'));
  const child=spawn(process.execPath,['server/index.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),NODE_ENV:mode,ALLOW_DEV_GUEST:'true',DEV_DATA_DIR:dir,SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:'',...extra},stdio:['ignore','pipe','pipe']});
  let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
  for(let i=0;i<80;i++){try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return {child,dir,log:()=>log,stop:async()=>{child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(6000)]);if(child.exitCode===null)child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});}};}catch{}await sleep(60);}
  child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});throw new Error(log||'server did not start');
}
class Client{
  constructor(port,id,origin){
    this.id=id;this.messages=[];this.pending=new Map();this.seq=0;this.bytes=0;
    this.ws=new WS(`ws://127.0.0.1:${port}/socket`,origin?{headers:{origin}}:{});
    this.ws.on('open',()=>this.emit('auth',{devId:id}));
    this.ws.on('message',raw=>{this.bytes+=raw.length;const m=JSON.parse(raw);this.messages.push(m);if(m.ack){this.pending.get(m.ack)?.(m.data);this.pending.delete(m.ack);}});
    this.ws.on('error',()=>{});
  }
  emit(event,data){this.ws.send(JSON.stringify({event,data}));}
  request(event,data){
    const id=++this.seq;
    return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('ack timed out: '+event));},6000);
      this.pending.set(id,data=>{clearTimeout(timer);resolve(data);});this.ws.send(JSON.stringify({event,data,id}));});
  }
  action(data){return this.request('action',{...data,nonce:data.nonce||randomUUID()});}
  async wait(event,predicate=()=>true,after=0){
    for(let i=0;i<140;i++){const match=this.messages.slice(after).find(m=>m.event===event&&predicate(m.data));if(match)return match.data;await sleep(40);}
    throw new Error('event timed out: '+event+' '+JSON.stringify(this.messages.slice(-2)));
  }
  last(event){return this.messages.filter(m=>m.event===event).at(-1)?.data;}
  close(){this.ws.close();}
}
test('real WebSocket: two players, party, movement, chat, idempotency, saving and reconnect',{timeout:30000},async()=>{
  const app=await startServer(3101),clients=[];
  try{
    const a=new Client(3101,randomUUID()),b=new Client(3101,randomUUID());clients.push(a,b);
    await Promise.all([a.wait('welcome'),b.wait('welcome')]);
    assert.equal((await a.request('join',{name:'WireAlice',classId:'guardian'})).ok,true);
    assert.equal((await b.request('join',{name:'WireBob',classId:'mage'})).ok,true);
    await a.wait('state',s=>s.players.some(p=>p.name==='WireBob'));
    await b.wait('state',s=>s.players.some(p=>p.name==='WireAlice'));
    assert.equal((await a.action({type:'partyInvite',id:b.id})).ok,true);await b.wait('partyInvite');
    assert.equal((await b.action({type:'partyAccept'})).ok,true);
    await a.wait('state',s=>s.party?.members.length===2);
    assert.equal((await a.request('chat',{channel:'party',text:'<img onerror=evil> hello'})).ok,true);
    const chat=await b.wait('chat',m=>m.text.includes('hello'));assert.equal(chat.text,'<img onerror=evil> hello');
    assert.equal((await a.request('action',{type:'buy',id:'potion'})).ok,false);
    const before=a.last('state').self.x;
    for(let i=0;i<5;i++){a.emit('input',{x:100000,y:0});await sleep(80);}
    a.emit('input',{x:0,y:0});await sleep(250);const after=a.last('state').self.x;
    assert.ok(after>before);assert.ok(after-before<100,'movement was speed-hacked');
    assert.equal((await a.action({type:'buy',id:'potion',count:-50})).ok,false);
    assert.equal((await a.action({type:'equip',id:'dawn_sword'})).ok,false);
    const nonce=randomUUID(),first=await a.action({type:'dash',nonce}),second=await a.action({type:'dash',nonce});
    assert.equal(first.ok,true);assert.deepEqual(second,first);
    await sleep(350);assert.equal((await a.request('save',{})).ok,true);
    const disk=JSON.parse(await fs.readFile(path.join(app.dir,a.id+'.json'),'utf8'));assert.equal(disk.name,'WireAlice');assert.equal(disk.gold,100);
    a.close();await sleep(150);const re=new Client(3101,a.id);clients.push(re);
    const welcome=await re.wait('welcome');assert.equal(welcome.existing,true);assert.equal(welcome.profile.name,'WireAlice');assert.equal(welcome.profile.gold,100);
    assert.ok(Math.abs(welcome.profile.x-disk.x)<35);
    const marker=re.messages.length,duplicate=new Client(3101,a.id);clients.push(duplicate);
    await duplicate.wait('welcome');await re.wait('replaced',()=>true,marker);
    const config=await (await fetch('http://127.0.0.1:3101/api/config')).json();
    assert.equal(config.devGuest,true);assert.equal(config.supabaseKey,'');assert.equal(config.SUPABASE_SERVICE_ROLE_KEY,undefined);
    const html=await fetch('http://127.0.0.1:3101/');assert.match(html.headers.get('content-security-policy'),/default-src 'self'/);
    assert.equal((await fetch('http://127.0.0.1:3101/server/index.js')).status,404);
    assert.equal((await fetch('http://127.0.0.1:3101/.env')).status,404);
  }finally{clients.forEach(x=>x.close());await app.stop();}
});
test('real WebSocket: two contributors see identical monster health and both receive loot',{timeout:18000},async()=>{
  const app=await startServer(3102),clients=[];
  try{
    const ids=[randomUUID(),randomUUID()];
    for(let i=0;i<2;i++){const p=newCharacter(ids[i],'Fighter'+i,'ranger');Object.assign(p,{zone:'forest',x:30*32+16,y:37*32+16});await fs.writeFile(path.join(app.dir,ids[i]+'.json'),JSON.stringify(p));}
    const [a,b]=ids.map(id=>new Client(3102,id));clients.push(a,b);
    await Promise.all([a.wait('state'),b.wait('state')]);
    const mob=a.last('state').mobs.find(x=>x.id==='forest_intro0');
    assert.ok(mob);assert.equal((await a.action({type:'target',id:mob.id})).ok,true);assert.equal((await b.action({type:'target',id:mob.id})).ok,true);
    assert.equal((await a.action({type:'attack',skill:'basic'})).ok,true);
    await sleep(230);
    const ma=a.last('state').mobs.find(x=>x.id===mob.id),mb=b.last('state').mobs.find(x=>x.id===mob.id);
    assert.ok(ma.hp<45);assert.equal(ma.hp,mb.hp);
    assert.equal((await b.action({type:'attack',skill:'basic'})).ok,true);
    await sleep(700);await a.action({type:'attack',skill:'basic'});
    const la=await a.wait('loot',x=>x.name?.includes('슬라임')),lb=await b.wait('loot',x=>x.name?.includes('슬라임'));
    assert.ok(la.gold>0);assert.ok(lb.gold>0);assert.ok(la.items.some(x=>x.id==='gel'));
  }finally{clients.forEach(x=>x.close());await app.stop();}
});
test('production refuses local guest authentication and cross-origin sockets',{timeout:12000},async()=>{
  const app=await startServer(3103,'production'),clients=[];
  try{
    const cfg=await (await fetch('http://127.0.0.1:3103/api/config')).json();assert.equal(cfg.devGuest,false);assert.equal(cfg.configured,false);
    const a=new Client(3103,randomUUID());clients.push(a);await a.wait('connect_error');
    const denied=new Client(3103,randomUUID(),'https://untrusted.example');clients.push(denied);
    const status=await new Promise(resolve=>{denied.ws.on('unexpected-response',(_req,res)=>{resolve(res.statusCode);res.resume();denied.ws.terminate();});});
    assert.equal(status,403);
  }finally{clients.forEach(x=>{try{x.close();}catch{}});await app.stop();}
});

test('v3 real WebSocket: mentor story, rejected remote claims, persisted journal and atlas',{timeout:20000},async()=>{
  const app=await startServer(3106),clients=[];
  try{
    const id=randomUUID(),p=newCharacter(id,'StoryWire','novice');
    Object.assign(p,{level:10,zone:'town',x:8*32+16,y:31*32+16});
    // Seed the mentor location and previous exploration only in the local test store.
    p.atlas={version:1,waypoints:['meadow_reach_0'],pages:['meadow_reach_0_tablet'],
      fog:{meadow_reach_0:[0,1]},contracts:{},reputation:{},trialClaims:{},surveyClaims:[]};
    await fs.writeFile(path.join(app.dir,id+'.json'),JSON.stringify(p));
    const a=new Client(3106,id);clients.push(a);await a.wait('welcome');
    const health=await (await fetch('http://127.0.0.1:3106/health')).json();
    assert.equal(health.version,'3.0.0');
    assert.equal((await a.action({type:'interact',id:'mentor_guardian'})).ok,true);
    const detail=await a.wait('storyView',d=>d.id==='guardian');
    assert.equal(detail.total,4);
    const nonce=randomUUID();
    assert.equal((await a.action({type:'storyAccept',id:'guardian',nonce})).ok,true);
    assert.equal((await a.action({type:'storyAccept',id:'guardian',nonce})).ok,true);
    assert.equal((await a.action({type:'storyClaim',id:'guardian',chapter:0})).ok,false);
    assert.equal((await a.action({type:'storyAccept',id:'voidwalker'})).ok,false);
    assert.equal((await a.action({type:'waypoint',id:'abyss_reach_8'})).ok,false);
    assert.equal((await a.action({type:'storyPause',id:'guardian'})).ok,true);
    assert.equal((await a.request('save',{})).ok,true);
    const disk=JSON.parse(await fs.readFile(path.join(app.dir,id+'.json'),'utf8'));
    assert.equal(disk.journey.quests.guardian.chapter,0);
    assert.equal(disk.journey.quests.guardian.active,false);
    assert.deepEqual(disk.atlas.fog.meadow_reach_0,[0,1]);
    a.close();await sleep(120);
    const b=new Client(3106,id);clients.push(b);const welcome=await b.wait('welcome');
    assert.equal(welcome.profile.journey.quests.guardian.active,false);
    assert.ok(welcome.profile.atlas.waypoints.includes('meadow_reach_0'));
    // Only current-region fog goes to the client, full exploration remains in storage.
    assert.equal(welcome.profile.atlas.fog.meadow_reach_0,undefined);
    assert.equal((await b.action({type:'storyResume',id:'guardian'})).ok,true);
    assert.equal((await b.action({type:'storyTrack',id:'guardian'})).ok,true);
  }finally{clients.forEach(x=>x.close());await app.stop();}
});
