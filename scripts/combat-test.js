'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-combat-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3301',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3301,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<40;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const meta=await req('GET','/api/meta');const by=Object.fromEntries(meta.cards.map(c=>[c.id,c]));const u={profileId:'combat-bot',nickname:'전투봇'};await req('POST','/api/profile',u);
 let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 // Find a combat node. Retry rooms if first floor route has no combat.
 for(let tries=0;tries<10&&room.status==='route';tries++){
   const node=room.route.find(n=>n.kind==='combat')||room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;if(room.status==='battle')break;
   if(room.status==='reward'){const opt=room.reward.playerOptions[u.profileId][0];room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opt.id})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;}
   if(room.status==='event'){room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:'safe'})).room;const opt=room.reward.playerOptions[u.profileId][0];room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opt.id})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;}
 }
 if(room.status!=='battle')throw Error('could not reach battle');let actions=0;
 while(room.status==='battle'&&actions<180){
   const me=room.battle.party[0];
   // Tactical cards are optional support; use at most one affordable spell before the monster move.
   if(Number(me.tacticsUsed||0)<1&&me.hand.length){
     let idx=-1;for(let i=0;i<me.hand.length;i++){const c=by[me.hand[i]];if(!c)continue;const preview=Math.max(0,c.cost-(me.buffs.anyDiscount>0?1:(me.buffs.spellDiscount>0?1:0)));if(preview<=me.energy){idx=i;break;}}
     if(idx>=0){room=(await req('POST',`/api/room/${room.id}/play`,{...u,handIndex:idx,targetUid:room.battle.enemies.find(e=>e.hp>0)?.uid,targetMonsterId:me.units[0]?.instanceId})).room;actions++;if(room.status!=='battle')break;}
   }
   const pc=room.battle.party[0],mon=pc.units.find(x=>!x.acted)||pc.units[0],enemy=room.battle.enemies.find(e=>e.hp>0);
   if(mon&&!mon.acted&&enemy){const mv=(mon.moves||[]).find(m=>mon.level>=Number(m.unlockLevel||1)&&Number(m.cooldownRemaining||0)<=0);if(mv){room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:mon.instanceId,moveId:mv.id,targetUid:enemy.uid})).room;actions++;continue;}}
   room=(await req('POST',`/api/room/${room.id}/end-turn`,u)).room;actions++;
 }
 if(room.status!=='reward')throw Error(`battle did not resolve: ${room.status}`);const opts=room.reward.playerOptions[u.profileId];if(!opts||opts.length<3)throw Error('compact reward options missing');if(!opts.some(o=>o.type==='card')||!opts.some(o=>o.type==='item'))throw Error('reward must mix card/item');
 const beforeGold=room.runState[u.profileId].gold;const rr=await req('POST',`/api/room/${room.id}/reroll`,u);room=rr.room;if(room.runState[u.profileId].gold>=beforeGold)throw Error('reroll did not spend gold');const opt=room.reward.playerOptions[u.profileId][0];room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opt.id})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;if(room.floor<2||room.status!=='route')throw Error('reward continuation failed');
 console.log(`COMBAT_OK actions=${actions} nextFloor=${room.floor} rewardTypes=card+item`);
}catch(e){console.error('COMBAT_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
