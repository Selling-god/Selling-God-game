'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data','catalog.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
if(catalog.version!=='4.1.0')throw Error(`catalog ${catalog.version}`);
if((catalog.monsterParty?.starterIds||[]).length!==3)throw Error('fresh starter count must be 3');
if(catalog.battleRules?.singleActive!==1||catalog.battleRules?.doubleActive!==2||catalog.battleRules?.moveSlots!==4)throw Error('battle rules mismatch');
for(const token of ['home-menu-v41','root-command-v41','move-grid-v41','skill-disc-grid-v41','party-loadout','move-use','SKILL DISC'])if(!app.includes(token)&&!css.includes(token))throw Error(`v41 client token missing ${token}`);
const profileFile=path.join(os.tmpdir(),`riftdeck-v41-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3341',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3341,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<50;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
async function toBattle(room,u){for(let i=0;i<20&&room.status!=='battle';i++){if(room.status==='route'){const n=room.route.find(x=>x.kind==='combat')||room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:n.id})).room;}else if(room.status==='event'){room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:'safe'})).room;}else if(room.status==='reward'){if(room.reward.skillOffers?.[u.profileId]&&!room.reward.skillClaims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/skip-move`,u)).room;const opts=room.reward.playerOptions?.[u.profileId]||[];if(opts.length&&!room.reward.claims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;if(room.reward.relicOptions?.[u.profileId]?.length&&!room.reward.relicClaims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/relic`,{...u,relicId:room.reward.relicOptions[u.profileId][0].id})).room;if(room.reward.camp&&!room.reward.campBy?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/camp`,{...u,mode:'rest'})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;}}
 return room;}
(async()=>{try{
 const hz=await ready();if(hz.version!=='4.1.0')throw Error(`health ${hz.version}`);
 const meta=await req('GET','/api/meta');if(meta.battleRules.singleActive!==1||meta.battleRules.moveSlots!==4)throw Error('meta battle rules');
 const u={profileId:'v41-bot',nickname:'V41BOT'};let prof=(await req('POST','/api/profile',u)).profile;
 if(prof.monsterOwnedCount!==3)throw Error(`fresh starters ${prof.monsterOwnedCount}`);
 if(prof.monsterParty.length!==3)throw Error(`starter party ${prof.monsterParty.length}`);
 // Loadout editing must persist.
 const reversed=[...prof.monsterParty].reverse();prof=(await req('POST','/api/loadout',{...u,monsterParty:reversed,deck:prof.deck})).profile;if(prof.monsterParty.join(',')!==reversed.join(','))throw Error('party loadout did not persist');
 let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;room=await toBattle(room,u);if(room.status!=='battle')throw Error('battle not reached');
 let me=room.battle.party[0];if(room.battle.battleMode!=='single'||me.units.length!==1||me.bench.length!==2)throw Error(`not 1-active battle ${room.battle.battleMode} ${me.units.length}/${me.bench.length}`);
 let mon=me.units[0];if(!Array.isArray(mon.moves)||mon.moves.length!==4)throw Error(`move slots ${mon.moves?.length}`);if(me.tacticLimit!==2)throw Error(`tactic limit ${me.tacticLimit}`);
 const first=mon.moves.find(m=>mon.level>=Number(m.unlockLevel||1)&&Number(m.cooldownRemaining||0)<=0);const enemy=room.battle.enemies.find(e=>e.hp>0);if(!first||!enemy)throw Error('move target setup');
 room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:mon.instanceId,moveId:first.id,targetUid:enemy.uid})).room;
 if(!room.feed.some(ev=>ev.type==='monster-move'))throw Error('monster move event missing');
 if(room.status==='battle'&&room.battle.party[0].stats.movesUsed<1)throw Error('move stat not updated');
 // Force a level-up marker, then verify post-battle skill disc and replacement.
 if(room.status==='battle'){
   me=room.battle.party[0];mon=me.units[0];room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:mon.instanceId,level:2})).room;
   // The server offers skill discs on elites/bosses/4F; mark one level-up via a few tactical/move actions when possible.
   for(let t=0;t<2&&room.status==='battle';t++){
     me=room.battle.party[0];mon=me.units[0];const e=room.battle.enemies.find(x=>x.hp>0);const mv=(mon.moves||[]).find(m=>mon.level>=Number(m.unlockLevel||1)&&Number(m.cooldownRemaining||0)<=0);if(mv&&!mon.acted)room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:mon.instanceId,moveId:mv.id,targetUid:e.uid})).room;
   }
 }
 if(room.status==='battle')room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
 if(room.status!=='reward')throw Error(`reward not reached ${room.status}`);
 // First-floor normal may not roll a disc unless levelup occurred; API/renderer support is still required.
 const offer=room.reward.skillOffers?.[u.profileId];if(offer){if(offer.moves.length<3)throw Error('skill disc choices');const before=room.runState[u.profileId].monsters.find(x=>x.instanceId===offer.instanceId).moves[0].id;room=(await req('POST',`/api/room/${room.id}/learn-move`,{...u,moveId:offer.moves[0].id,replaceIndex:0})).room;const after=room.runState[u.profileId].monsters.find(x=>x.instanceId===offer.instanceId).moves[0].id;if(after===before)throw Error('move replacement failed');}
 console.log(`V41_ACTIVE_MONSTER_OK starters=3 active=1 bench=2 moves=4 tactics=2 skillDisc=${offer?'tested':'supported'} mainMenu=true`);
}catch(e){console.error('V41_ACTIVE_MONSTER_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
