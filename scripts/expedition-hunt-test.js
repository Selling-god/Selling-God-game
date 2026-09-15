'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-hunt-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3311',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body,allowError=false){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3311,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<50;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
async function advanceNonBattle(room,u){
  if(room.status==='event') room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:'safe'})).room;
  if(room.status==='reward'){
    const opts=room.reward.playerOptions?.[u.profileId]||[];
    if(opts.length&&!room.reward.claims?.[u.profileId]) room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;
    if(room.reward.skillOffers?.[u.profileId]&&!room.reward.skillClaims?.[u.profileId]) room=(await req('POST',`/api/room/${room.id}/skip-move`,u)).room;
    if(room.reward.rewriteOffers?.[u.profileId]&&!room.reward.rewriteClaims?.[u.profileId]) room=(await req('POST',`/api/room/${room.id}/skip-rewrite`,u)).room;
    if(room.reward.relicOptions?.[u.profileId]?.length&&!room.reward.relicClaims?.[u.profileId]) room=(await req('POST',`/api/room/${room.id}/relic`,{...u,relicId:room.reward.relicOptions[u.profileId][0].id})).room;
    if(room.reward.camp&&!room.reward.campBy?.[u.profileId]) room=(await req('POST',`/api/room/${room.id}/camp`,{...u,mode:'rest'})).room;
    room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;
  }
  return room;
}
(async()=>{try{
  const hz=await ready(); if(hz.version!=='5.3.1')throw Error(`wrong API version ${hz.version}`); if(hz.deployId!=='RIFT-V531-RUNMOD-HOTFIX-20260915')throw Error(`wrong deploy id ${hz.deployId}`);
  const meta=await req('GET','/api/meta'); if(meta.monsters.length<205)throw Error(`monsters ${meta.monsters.length}`); if(meta.monsterRules.pointBudget!==10)throw Error('point budget');
  const u={profileId:'hunt-bot',nickname:'HUNTBOT'};
  let prof=(await req('POST','/api/profile',u)).profile;
  const starterMonsterCount=prof.monsterOwnedCount;if(starterMonsterCount!==3)throw Error(`starter monsters ${starterMonsterCount}`);
  let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal'})).room; room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  let reached=false;
  for(let tries=0;tries<24;tries++){
    if(room.status==='route'){const node=room.route.find(n=>n.kind==='combat')||room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;}
    if(room.status==='battle'){reached=true;break;} room=await advanceNonBattle(room,u);
  }
  if(!reached)throw Error('could not reach journey battle');
  const pc=room.battle.party.find(p=>p.playerId===u.profileId),actor=pc.units.find(x=>x.hp>0&&!x.acted),target=room.battle.enemies.find(e=>e.hp>0);
  if(!actor||!target)throw Error('capture target missing');
  const caughtId=target.id,wasOwned=!!prof.monsters[caughtId];
  // v5.1: capture happens during the battle and consumes this active monster's action.
  let cap=await req('POST',`/api/room/${room.id}/capture`,{...u,sealType:'basic',enemyUid:target.uid,instanceId:actor.instanceId});room=cap.room;prof=cap.profile;
  if(!cap.result.success)throw Error('test in-battle capture did not succeed'); if(!prof.monsters[caughtId])throw Error('captured monster not persisted');
  if(!wasOwned&&prof.monsterOwnedCount!==starterMonsterCount+1)throw Error(`owned monsters after capture ${prof.monsterOwnedCount}`);
  if(room.status==='battle')room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
  if(room.status!=='reward')throw Error(`expected reward after battle, got ${room.status}`); if(room.capture)throw Error('v5.1 must not create blocking post-battle capture state');
  // Prove the old repeated "capture or pass first" block is gone.
  room=await advanceNonBattle(room,u); if(room.status==='reward')throw Error('reward continue remained blocked');
  const load=await req('POST','/api/loadout',{...u,monsterParty:[caughtId],deck:prof.deck});prof=load.profile;if(!prof.monsterParty.includes(caughtId))throw Error('captured monster could not enter party');
  let dung=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal'})).room; dung=(await req('POST',`/api/room/${dung.id}/start`,u)).room;
  if(!dung.runState[u.profileId].monsters.some(m=>m.speciesId===caughtId))throw Error('captured monster missing from dungeon party');
  console.log(`EXPEDITION_HUNT_OK inBattleCapture=${caughtId} postBattleGate=false ownedMonsters=${prof.monsterOwnedCount}`);
}catch(e){console.error('EXPEDITION_HUNT_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
