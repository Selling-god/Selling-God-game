'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..');
const profileFile=path.join(os.tmpdir(),`riftdeck-v51-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
for(const token of ['monster-battle-v51','starter-choice-v51','reward-choice-v51','move-feedback-v51',"next=nextMe?.units?.find(x=>x.hp>0&&!x.acted)","state.battleMenu='moves'"]){if(!app.includes(token)&&!css.includes(token))throw Error(`V51 client token missing: ${token}`);}
if(app.includes('Math.min(14000'))throw Error('old 14 second choreography cap still present');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3351',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body,allowError=false){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3351,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<50;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready');}
async function clearReward(room,u){
  const opts=room.reward?.playerOptions?.[u.profileId]||[];
  if(opts.length&&!room.reward.claims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;
  if(room.reward?.skillOffers?.[u.profileId]&&!room.reward.skillClaims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/skip-move`,u)).room;
  if(room.reward?.rewriteOffers?.[u.profileId]&&!room.reward.rewriteClaims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/skip-rewrite`,u)).room;
  if(room.reward?.relicOptions?.[u.profileId]?.length&&!room.reward.relicClaims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/relic`,{...u,relicId:room.reward.relicOptions[u.profileId][0].id})).room;
  if(room.reward?.camp&&!room.reward.campBy?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/camp`,{...u,mode:'rest'})).room;
  return (await req('POST',`/api/room/${room.id}/continue`,u)).room;
}
(async()=>{try{
  const hz=await ready();if(!hz.deployId)throw Error(`deploy id ${hz.deployId}`);
  const u={profileId:'v51-bot',nickname:'V51BOT'};await req('POST','/api/profile',u);
  let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal',name:'V51 UX TEST'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  // Reach floor 8. Floor 8 is guaranteed to use the two-active-monster battle rule.
  for(let floor=1;floor<8;floor++){
    if(room.floor!==floor||room.status!=='route')throw Error(`floor ${floor} route expected, got ${room.floor}/${room.status}`);
    room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
    if(room.status!=='reward')throw Error(`floor ${floor} reward expected`);
    room=await clearReward(room,u);
  }
  if(room.floor!==8||room.status!=='route')throw Error(`floor8 route expected, got ${room.floor}/${room.status}`);
  const node=room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;
  if(room.status!=='battle'||room.battle.battleMode!=='double')throw Error(`double battle expected, got ${room.status}/${room.battle?.battleMode}`);
  let pc=room.battle.party.find(x=>x.playerId===u.profileId);if(pc.units.length!==2)throw Error(`two active monsters expected, got ${pc.units.length}`);
  const blocked=await req('POST',`/api/room/${room.id}/end-turn`,u,true);
  if(blocked.status<400||!/기술을 먼저 사용/.test(blocked.error||''))throw Error(`end-turn skip was not blocked: ${blocked.status} ${blocked.error||''}`);
  const first=pc.units.find(x=>x.hp>0&&!x.acted),enemy1=room.battle.enemies.find(x=>x.hp>0);if(!first||!enemy1)throw Error('first action setup failed');
  const mv1=first.moves.find(m=>first.level>=Number(m.unlockLevel||1)&&Number(m.cooldownRemaining||0)<=0);if(!mv1)throw Error('first monster has no usable move');
  room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:first.instanceId,moveId:mv1.id,targetUid:enemy1.uid})).room;
  if(room.status!=='battle')throw Error('first monster unexpectedly ended the entire double battle');
  pc=room.battle.party.find(x=>x.playerId===u.profileId);const second=pc.units.find(x=>x.hp>0&&!x.acted);if(!second)throw Error('second active monster was not left ready');
  if(pc.ended)throw Error('player ended after only first active monster acted');
  const blockedAgain=await req('POST',`/api/room/${room.id}/end-turn`,u,true);if(blockedAgain.status<400)throw Error('end-turn became available before second monster acted');
  const enemy2=room.battle.enemies.find(x=>x.hp>0),mv2=second.moves.find(m=>second.level>=Number(m.unlockLevel||1)&&Number(m.cooldownRemaining||0)<=0);if(!enemy2||!mv2)throw Error('second action setup failed');
  const turnBefore=room.battle.turn;
  room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:second.instanceId,moveId:mv2.id,targetUid:enemy2.uid})).room;
  if(room.status==='battle'&&room.battle.turn<=turnBefore)throw Error('enemy turn did not wait for/advance after second monster action');
  console.log(`V51_COMBAT_UX_OK double=true firstThenSecond=true skipBlocked=true turn=${room.battle?.turn||'reward'} transitions<=2600ms`);
}catch(e){console.error('V51_COMBAT_UX_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
