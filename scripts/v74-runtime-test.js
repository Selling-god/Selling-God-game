'use strict';
const http=require('http'),cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..');
const profileFile=path.join(os.tmpdir(),`fusewild-v74-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=43000+(process.pid%5000);let proc;
const assert=(x,m)=>{if(!x)throw Error(m)};
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j={};try{j=JSON.parse(s)}catch{};if(res.statusCode>=400)return reject(Error(j.error||`HTTP ${res.statusCode}`));resolve(j)});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<120;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready')}
(async()=>{try{
 proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});
 const hz=await ready();assert(hz.version==='7.5.0','health version');assert(hz.deployId==='FUSEWILD-V750-POKEROGUE-UX-20260918','health deploy');assert(hz.monsters===205,'monster count');
 const u={profileId:'v74-bot',nickname:'V74BOT'};let profile=(await req('POST','/api/profile',u)).profile;
 await req('POST','/api/loadout',{...u,monsterParty:(profile.monsterParty||[]).slice(0,3)});
 let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V74 QA'})).room;
 room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 const offer=(room.contractOffers?.[u.profileId]||[])[0];assert(offer,'contract offer');
 room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
 room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:room.route[0].id})).room;assert(room.status==='battle','battle start');
 let moveEvent=false,lethal=false,win=false,replacementHandled=0;
 for(let step=0;step<120&&room.status==='battle';step++){
   if(room.battle?.phase==='replacement'){
     const p=room.battle.party.find(x=>x.playerId===u.profileId),pending=p?.pendingReplacements?.[0],cand=p?.bench?.find(x=>x.hp>0);
     if(pending&&cand){room=(await req('POST',`/api/room/${room.id}/replace-monster`,{...u,benchId:cand.instanceId,slotIndex:pending.slotIndex})).room;replacementHandled++;continue;}
   }
   if(room.battle?.phase!=='players'){await new Promise(r=>setTimeout(r,5));continue;}
   const p=room.battle.party.find(x=>x.playerId===u.profileId),actor=p?.units?.find(x=>x.hp>0&&!x.acted),foe=room.battle.enemies.find(x=>x.hp>0);if(!actor||!foe)break;
   const mv=(actor.moves||[]).filter(m=>Number(m.pp||0)>0).sort((a,b)=>Number(b.power||0)-Number(a.power||0))[0];if(!mv)break;
   const before=Number(room.seq||0);room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:actor.instanceId,moveId:mv.id,targetUid:foe.uid})).room;
   const fresh=(room.feed||[]).filter(e=>Number(e.seq)>before),mm=fresh.find(e=>e.type==='monster-move');
   if(mm){moveEvent=true;const q=mm.payload||{};assert(Number.isFinite(Number(q.targetHpBefore))&&Number.isFinite(Number(q.targetHpAfter)),'hp snapshots');if(Number(q.targetHpAfter)<=0){lethal=true;assert(Number(q.targetHpBefore)>0,'lethal before hp');}}
   if(fresh.some(e=>e.type==='win'))win=true;
 }
 assert(moveEvent,'move event');assert(lethal,'lethal event');if(room.status==='reward')win=win||(room.feed||[]).some(e=>e.type==='win');assert(win,'win event');assert(room.status==='reward'||room.status==='battle','valid post combat state');
 console.log(`V74_RUNTIME_OK move=yes lethalSnapshot=yes win=yes replacements=${replacementHandled}`);
}catch(e){console.error('V74_RUNTIME_FAIL',e.message);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
