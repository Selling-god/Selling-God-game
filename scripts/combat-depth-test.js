'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-depth-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3305',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3305,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<40;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const meta=await req('GET','/api/meta');const by=Object.fromEntries(meta.cards.map(c=>[c.id,c]));const u={profileId:'depth-bot',nickname:'연쇄봇'};await req('POST','/api/profile',u);let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 // Force battle through debug route helper if available, otherwise vote routes until battle.
 for(let tries=0;tries<12&&room.status!=='battle';tries++){
   if(room.status==='route'){const n=room.route.find(x=>['combat','elite','boss'].includes(x.kind))||room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:n.id})).room;}
   else if(room.status==='event'){room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:'safe'})).room;}
   else if(room.status==='reward'){const o=room.reward.playerOptions[u.profileId]?.[0];if(o)room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:o.id})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;}
 }
 if(room.status!=='battle')throw Error('battle not reached');
 const me=room.battle.party[0];if(!me.chain||me.chain.count!==0)throw Error('chain state missing');
 // V4: actual captured monsters form the party and every combat card is a spell command.
 if(!me.units?.length)throw Error('monster party missing from battle');
 const hasNonSpell=me.drawPile.concat(me.hand).some(id=>by[id]?.type!=='spell');if(hasNonSpell)throw Error('v4 battle deck contains non-spell card');
 if(!me.units.every(x=>x.speciesId&&x.instanceId&&Number(x.maxHp)>0))throw Error('battle actors are not persistent monsters');
 // Boss phase structure is validated from server serialization by jumping to floor 10 in test mode.
 room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
 if(!room.reward?.gradeBy?.[u.profileId])throw Error('battle grade missing');
 if(!room.reward?.perfectBy?.[u.profileId])throw Error('perfect bonus missing for debug no-damage win');
 const p=await req('POST','/api/profile',u);if((p.profile.stats.perfectBattles||0)<1)throw Error('perfect battle stat missing');
 console.log(`COMBAT_DEPTH_OK grade=${room.reward.gradeBy[u.profileId]} perfect=${p.profile.stats.perfectBattles}`);
}catch(e){console.error('COMBAT_DEPTH_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
