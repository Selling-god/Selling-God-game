'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-v53-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
for(const token of ['encounter-start','run-money-v53','open-held-item','equip-held-item','held-roster-v53'])if(!app.includes(token)&&!css.includes(token))throw Error(`V53 UI token missing: ${token}`);
if(!css.includes('.battle-money-v53'))throw Error('V53 battle money HUD missing');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3353',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3353,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<60;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready');}
(async()=>{try{
 const hz=await ready();if(!hz.version||!hz.deployId)throw Error(`health ${hz.version}/${hz.deployId}`);if(hz.items<128)throw Error(`items ${hz.items}`);
 const meta=await req('GET','/api/meta');for(const id of ['i121','i122','i123','i124','i125','i126','i127','i128']){const it=meta.items.find(x=>x.id===id);if(!it?.held)throw Error(`held item ${id} missing`);}
 const u={profileId:'v53-bot',nickname:'V53BOT'};await req('POST','/api/profile',u);
 let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V53 TEST'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
 const run=room.runState[u.profileId];if(Number(run.items?.i121||0)<1)throw Error('starter held berry missing');const mon=run.monsters[0];
 room=(await req('POST',`/api/room/${room.id}/equip-held`,{...u,instanceId:mon.instanceId,itemId:'i121'})).room;
 if(room.runState[u.profileId].monsters[0].heldItemId!=='i121')throw Error('held item did not persist on run monster');
 const node=room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;if(room.status!=='battle')throw Error(`battle expected ${room.status}`);
 const combat=room.battle.party.find(x=>x.playerId===u.profileId).units.find(x=>x.instanceId===mon.instanceId);if(combat?.heldItemId!=='i121')throw Error('held item missing in combatant');
 console.log(`V53_HELD_ITEM_OK items=${hz.items} encounterManual=true moneyHud=true held=${combat.heldItemId}`);
}catch(e){console.error('V53_HELD_ITEM_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
