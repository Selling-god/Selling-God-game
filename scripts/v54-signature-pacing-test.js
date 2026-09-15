'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),catalog=require(path.join(root,'data','catalog.json')),moves=require(path.join(root,'data','move-library.js'));
const monsters=[...(catalog.enemies||[]),...(catalog.bosses||[])];
if(monsters.length!==205)throw Error(`monster count ${monsters.length}`);
const signatureIds=new Set(),signatureNames=new Set(),families=new Set(),statusKinds=new Set();
for(const mon of monsters){
  const list=moves.initialMoves(mon);if(list.length<4)throw Error(`initial moves ${mon.id}`);const sig=list[0];
  if(!sig?.signature||sig.id!==`sig:${mon.id}`)throw Error(`signature missing ${mon.id}`);
  if(!sig.name||!sig.element||!sig.fxFamily)throw Error(`signature metadata ${mon.id}`);
  signatureIds.add(sig.id);signatureNames.add(sig.name);
  for(const mv of list){if(!mv.fxFamily)throw Error(`fx family missing ${mon.id}/${mv.id}`);families.add(mv.fxFamily);}
  for(const k of ['burn','shock','weak','vulnerable','intentSeal','stagger','lifesteal','splash','shield','heal','resonance'])if(sig[k])statusKinds.add(k);
}
if(signatureIds.size!==205||signatureNames.size!==205)throw Error(`signature uniqueness ${signatureIds.size}/${signatureNames.size}`);
if(families.size<18)throw Error(`fx variety ${families.size}`);if(statusKinds.size<8)throw Error(`signature status variety ${statusKinds.size}`);
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8');
for(const token of ['RIFT COMMAND','move-effect-tags-v54','enemy-debuffs-v54','scheduleRewardAutoAdvanceV54','combatCinematicUntil','sameBattle','waitForCombatCinematicV54'])if(!app.includes(token))throw Error(`client token ${token}`);
for(const token of ['.move-btn-v54','.enemy-debuffs-v54','.tactic-guide-v54','.signature-v54','.combat-resolving-v54'])if(!css.includes(token))throw Error(`css token ${token}`);
for(const token of ['speciesSignatureMove','tacticAmp','appliedDebuffs','tactic-link'])if(!server.includes(token))throw Error(`server token ${token}`);
const port=3355,profileFile=path.join(os.tmpdir(),`riftdeck-v54-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<80;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,80))}}throw Error('server not ready');}
(async()=>{try{
 const hz=await ready();if(hz.version!=='5.5.0'||hz.deployId!=='RIFT-V550-STATUS-COMMAND-RESUME-20260915')throw Error(`health ${hz.version}/${hz.deployId}`);
 const meta=await req('GET','/api/meta'),u={profileId:'v54-bot',nickname:'V54BOT'};await req('POST','/api/profile',u);
 let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V54'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
 room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:room.route[0].id})).room;if(room.status!=='battle')throw Error(`battle ${room.status}`);
 let pc=room.battle.party.find(x=>x.playerId===u.profileId),unit=pc.units.find(x=>x.hp>0),enemy=room.battle.enemies.find(x=>x.hp>0);const sig=unit.moves.find(x=>x.signature);
 if(!sig||!sig.fxFamily)throw Error('combat signature missing');
 const hand=(pc.hand||[]).map((id,index)=>({id,index,card:(meta.cards||[]).find(c=>c.id===id)})).filter(x=>x.card&&Number(x.card.cost||0)<=Number(pc.energy||0)).sort((a,b)=>Number(a.card.cost||0)-Number(b.card.cost||0));
 if(hand.length){room=(await req('POST',`/api/room/${room.id}/play`,{...u,handIndex:hand[0].index,targetUid:enemy.uid,targetMonsterId:unit.instanceId})).room;pc=room.battle?.party?.find(x=>x.playerId===u.profileId);unit=pc?.units?.find(x=>x.instanceId===unit.instanceId);if(room.status==='battle'&&Number(unit?.tacticAmp||0)<=0)throw Error('RIFT COMMAND not charged');}
 if(room.status==='battle'){enemy=room.battle.enemies.find(x=>x.hp>0);room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:unit.instanceId,moveId:sig.id,targetUid:enemy.uid})).room;const ev=[...(room.feed||[])].reverse().find(x=>x.type==='monster-move'&&x.payload?.move?.id===sig.id);if(!ev?.payload?.signature||!ev.payload.fxFamily||!Array.isArray(ev.payload.effectSummary))throw Error('signature event payload incomplete');}
 console.log(`V54_SIGNATURE_PACING_OK signatures=${signatureIds.size} fxFamilies=${families.size} statuses=${statusKinds.size} link=true`);
}catch(e){console.error('V54_SIGNATURE_PACING_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
