import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {randomUUID} from 'node:crypto';
import {CharacterStore} from '../server/store.js';
import {newCharacter} from '../server/game.js';

test('local persistence serializes concurrent writes and returns the last revision',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'starfall-store-'));
  try{
    const store=new CharacterStore({local:true,dir}),p=newCharacter(randomUUID(),'SaveMe','mage');
    await Promise.all(Array.from({length:30},(_,i)=>store.save({...p,gold:100+i,revision:i+1})));
    const loaded=await store.load(p.id);assert.equal(loaded.gold,129);assert.equal(loaded.revision,30);
    assert.equal(await store.nameAvailable('saveme','other'),false);assert.equal(await store.nameAvailable('saveme',p.id),true);
    assert.equal((await store.leaderboard())[0].name,'SaveMe');assert.equal((await fs.readdir(dir)).some(x=>x.endsWith('.tmp')),false);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('Supabase REST adapter authenticates server-side, upserts, loads and limits public leaderboard fields',async()=>{
  const seen=[],p=newCharacter(randomUUID(),'CloudMock','guardian');let saved;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    seen.push({url:req.url,headers:req.headers,method:req.method,body:body&&JSON.parse(body)});
    res.setHeader('Content-Type','application/json');
    if(req.url==='/auth/v1/user'){
      if(req.headers.authorization!=='Bearer valid-user-token'){res.statusCode=401;return res.end(JSON.stringify({message:'Invalid'}));}
      return res.end(JSON.stringify({id:p.id}));
    }
    if(req.method==='POST'){saved=JSON.parse(body);res.statusCode=201;return res.end();}
    if(req.url.includes('name=ilike.'))return res.end(JSON.stringify([]));
    if(req.url.includes('order=level'))return res.end(JSON.stringify([{name:p.name,class_id:p.classId,level:1,kills:5,bossKills:1,user_id:'must-not-leak'}]));
    res.end(JSON.stringify(saved?[{state:saved.state,revision:saved.revision}]:[]));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{
    const store=new CharacterStore({url:`http://127.0.0.1:${server.address().port}`,key:'sb_secret_MOCK'});
    assert.equal((await store.authenticate('valid-user-token')).id,p.id);
    await assert.rejects(store.authenticate('bad-token'));
    await store.save(p);assert.equal((await store.load(p.id)).name,p.name);
    assert.equal(await store.nameAvailable('test_name',p.id),true);
    assert.equal((await store.leaderboard())[0].user_id,undefined);
    assert.ok(seen.every(x=>x.headers.apikey==='sb_secret_MOCK'));
    const save=seen.find(x=>x.method==='POST');assert.equal(save.headers.prefer,'resolution=merge-duplicates,return=minimal');
    assert.equal(save.headers.authorization,undefined);
    assert.ok(seen.some(x=>x.url.includes('%5C_')));
  }finally{await new Promise(r=>server.close(r));}
});
test('a rejected save does not poison the next per-user save queue',async()=>{
  const store=new CharacterStore({url:'http://mock.invalid',key:'secret'});let attempt=0;
  store.request=async()=>{if(++attempt===1)throw new Error('temporary outage');};
  const p=newCharacter(randomUUID(),'Retry','mage');
  await assert.rejects(store.save(p));await store.save({...p,gold:777});
  await store.flush();assert.equal(attempt,2);assert.equal(store.errors,1);
});
