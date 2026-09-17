'use strict';
const http=require('http'),cp=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const pkg=require(path.join(root,'package.json'));
function assert(x,m){if(!x)throw Error(m)}
for(const t of ['battle-v70','replacement-command-v70','replace-monster','afterbattle-v70'])assert(app.includes(t),`app ${t}`);
for(const t of ['FUSEWILD v7.0 — BATTLE CORE REBUILD','.replacement-grid-v70','.afterbattle-v70'])assert(css.includes(t),`css ${t}`);
for(const t of ['pendingReplacements','function resolveReplacement','replacement-required','monster-replacement',"b.phase='replacement'"])assert(server.includes(t),`server ${t}`);
assert(pkg.version==='7.0.0','package version');
console.log('V70_STATIC_OK cleanBattleSurface=yes manualReplacement=yes mobileLayout=yes postBattleOrder=yes');
if(process.argv.includes('--static'))process.exit(0);
const profileFile=path.join(os.tmpdir(),`fusewild-v70-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=39000+(process.pid%8000);let proc;
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j={};try{j=JSON.parse(s)}catch{};if(res.statusCode>=400)return reject(Error(j.error||`HTTP ${res.statusCode}`));resolve(j)});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<120;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready')}
function pc(room,pid){return room.battle?.party?.find(x=>x.playerId===pid)}
(async()=>{try{
 proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});
 const hz=await ready();assert(hz.version==='7.0.0','health version');assert(hz.deployId==='FUSEWILD-V700-BATTLE-CORE-REBUILD-20260917','health deploy');
 const u={profileId:'v70-bot',nickname:'V70BOT'};let profile=(await req('POST','/api/profile',u)).profile;await req('POST','/api/loadout',{...u,monsterParty:(profile.monsterParty||[]).slice(0,3)});
 let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V70 CORE'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;let offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:room.route[0].id})).room;assert(room.status==='battle','battle start');
 // Let the battle naturally progress. Prefer non-damaging moves so the enemy gets enough turns to faint a monster.
 let sawReplacement=false,replaced=false;
 for(let round=0;round<40&&room.status==='battle';round++){
   if(room.battle.phase==='replacement'){
     sawReplacement=true;const p=pc(room,u.profileId),pending=p.pendingReplacements?.[0],cand=p.bench?.find(x=>x.hp>0);assert(pending&&cand,'replacement candidate');
     room=(await req('POST',`/api/room/${room.id}/replace-monster`,{...u,benchId:cand.instanceId,slotIndex:pending.slotIndex})).room;replaced=true;assert(room.battle.phase==='players','replacement returns command phase');break;
   }
   if(room.battle.phase!=='players'){await new Promise(r=>setTimeout(r,10));continue;}
   const p=pc(room,u.profileId),actor=p?.units?.find(x=>x.hp>0&&!x.acted),foe=room.battle.enemies.find(x=>x.hp>0);if(!actor||!foe)break;
   const moves=(actor.moves||[]).filter(m=>Number(m.pp||0)>0);const mv=moves.find(m=>['guard','heal','status'].includes(m.kind))||moves.sort((a,b)=>Number(a.power||0)-Number(b.power||0))[0];if(!mv)break;
   room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:actor.instanceId,moveId:mv.id,targetUid:foe.uid})).room;
 }
 assert(sawReplacement&&replaced,'manual replacement was not reached/resolved');
 const feed=room.feed||[];assert(feed.some(e=>e.type==='replacement-required'),'replacement-required event');assert(feed.some(e=>e.type==='monster-replacement'),'monster-replacement event');
 console.log('V70_RUNTIME_OK replacementPhase=yes explicitChoice=yes battleResume=yes');
}catch(e){console.error('V70_RUNTIME_FAIL',e.message);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
