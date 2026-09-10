'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-combat-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3201',PROFILE_FILE:profileFile},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3201,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<30;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const meta=await req('GET','/api/meta');const by=Object.fromEntries(meta.cards.map(c=>[c.id,c]));const u={profileId:'combat-bot',nickname:'전투봇'};await req('POST','/api/profile',u);
 let room;
 for(let attempt=0;attempt<12;attempt++){
   room=(await req('POST','/api/rooms/create',{...u,mode:'journey'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
   const combat=room.route.find(n=>['combat','elite','boss'].includes(n.kind));if(combat){room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:combat.id})).room;break;}
 }
 if(room.status!=='battle')throw Error('could not find combat route');
 let actions=0;
 while(room.status==='battle'&&actions<120){
   let me=room.battle.party[0],played=false;
   for(let i=0;i<me.hand.length;i++){
     const c=by[me.hand[i]];if(!c)continue;if(c.type==='unit'&&me.units.length>=3)continue;if(c.cost>me.energy)continue;
     room=(await req('POST',`/api/room/${room.id}/play`,{...u,handIndex:i,targetUid:room.battle.enemies.find(e=>e.hp>0)?.uid})).room;actions++;played=true;break;
   }
   if(room.status!=='battle')break;
   if(!played){room=(await req('POST',`/api/room/${room.id}/end-turn`,u)).room;actions++;}
 }
 if(room.status!=='reward')throw Error(`battle did not resolve: ${room.status}`);
 const opt=room.reward.options[0];if(!opt)throw Error('reward options missing');room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opt.id})).room;
 room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;if(room.status!=='route'||room.floor!==2)throw Error('reward continuation failed');
 console.log(`COMBAT_OK actions=${actions} floor=${room.floor}`);
}catch(e){console.error('COMBAT_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
