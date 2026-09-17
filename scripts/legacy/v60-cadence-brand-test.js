'use strict';
const http=require('http');
const cp=require('child_process');
const fs=require('fs');
const os=require('os');
const path=require('path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const html=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const pkg=require(path.join(root,'package.json'));
const catalog=require(path.join(root,'data','catalog.json'));

function staticChecks(){
  if(pkg.name!=='fusewild-monster-fusion-roguelite'||!pkg.version)throw Error('package brand/version');
  for(const token of ['FUSEWILD','MONSTER FUSION ROGUELITE'])if(!html.includes(token))throw Error(`html token ${token}`);
  for(const token of ['FUSEWILD','encounterApproachDelay','AREA TRANSITION','상대의 이름과 실제 조우 설명은 전투 화면에 몬스터가 등장한 뒤 표시됩니다.','SHOP + REWARD','BETWEEN WAVES','rewardConfirmTimer','enemyNames','fusion-turns-v60','5턴 결합 · 전투 종료 시 해제','전투 종료 시 즉시 해제'])if(!app.includes(token))throw Error(`app token ${token}`);
  for(const token of ['FUSEWILD','encounter-approach-v60','pokerogue-shop-v60','fusion-turns-v60'])if(!css.includes(token))throw Error(`css token ${token}`);
  for(const token of ['FUSEWILD-V600-ROGUE-CADENCE-FUSION-20260916','enemyNames','fusionTurnsLeft=5','fusionStartTurn','function releaseFusion','function releaseAllFusions','function tickFusionDurations','reason:\'battle-end\'','fusionArtDataUri'])if(!server.includes(token))throw Error(`server token ${token}`);
  const fusionDir=path.join(root,'assets','fusion');for(const f of ['frame-base.svg','grid-overlay.svg','sigil-alpha.svg','sigil-beta.svg','sigil-gamma.svg','sigil-delta.svg'])if(!fs.existsSync(path.join(fusionDir,f)))throw Error(`fusion asset ${f}`);
  if((catalog.enemies.length+catalog.bosses.length)!==205)throw Error('monster catalog count');
  console.log('V60_STATIC_OK brand=FUSEWILD monsters=205 fusionAssets=6 cadence=shop-before-free-reward');
}
staticChecks();
if(process.argv.includes('--static'))process.exit(0);

const profileFile=path.join(os.tmpdir(),`fusewild-v60-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=3390;let proc=null;
function spawn(){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});}
function req(method,p,body,{allowError=false}={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<140;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready');}
function pcOf(room,pid){return room.battle?.party?.find(x=>x.playerId===pid);}
function allMons(pc){return [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])];}

(async()=>{try{
  proc=spawn();const hz=await ready();if(!hz.version||!hz.deployId)throw Error(`health ${hz.version}/${hz.deployId}`);
  const u={profileId:'v60-bot',nickname:'V60BOT'};let profile=(await req('POST','/api/profile',u)).profile;
  const starterParty=(profile.monsterParty||[]).slice(0,3);await req('POST','/api/loadout',{...u,monsterParty:starterParty});
  let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'FUSEWILD V60'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
  const node=(room.route||[])[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;if(room.status!=='battle')throw Error(`battle start ${room.status}`);
  const startEv=[...(room.feed||[])].reverse().find(e=>e.type==='battle-start');if(!startEv?.payload?.enemyNames?.length||!startEv?.payload?.encounterLabel)throw Error('battle start does not carry visible encounter names');

  let pc=pcOf(room,u.profileId),active=pc?.units?.find(x=>x.hp>0),partner=pc?.bench?.find(x=>x.hp>0)||pc?.units?.find(x=>x.hp>0&&x.instanceId!==active?.instanceId);if(!active||!partner)throw Error('fusion pair missing');
  const pool=[...(active.moves||[]),...(partner.moves||[])];const guard=pool.find(x=>x.kind==='guard'||x.kind==='status');if(!guard)throw Error('non-damaging fusion move missing');const ids=[guard.id,...pool.filter(x=>x.id!==guard.id).map(x=>x.id)].slice(0,4);
  const primaryId=active.instanceId,secondaryId=partner.instanceId;
  room=(await req('POST',`/api/room/${room.id}/monster-fuse`,{...u,primaryId,secondaryId,moveIds:ids})).room;pc=pcOf(room,u.profileId);let fused=allMons(pc).find(x=>x.instanceId===primaryId);
  if(!fused?.fused||Number(fused.fusionTurnsLeft)!==5)throw Error(`fusion lifetime init ${fused?.fusionTurnsLeft}`);if(!String(fused.fusionArt||'').startsWith('data:image/svg+xml'))throw Error('fusion art missing');if(String(fused.name).includes('×')||String(fused.name).split(/\s+/).length<2)throw Error(`fusion name ${fused.name}`);if(allMons(pc).some(x=>x.instanceId===secondaryId))throw Error('partner not merged');

  const chosenGuard=(fused.moves||[]).find(x=>x.id===guard.id)||(fused.moves||[]).find(x=>x.kind==='guard'||x.kind==='status');if(!chosenGuard)throw Error('guard not selected into fusion');
  for(let i=0;i<5;i++){
    let livePc=pcOf(room,u.profileId),live=allMons(livePc).find(x=>x.instanceId===primaryId);if(!live?.fused||!(livePc.units||[]).some(x=>x.instanceId===primaryId))throw Error(`fusion released/KO early before action ${i+1} turn=${room.battle?.turn} loc=${['units','bench','ko'].map(k=>k+':'+(livePc[k]||[]).map(x=>x.instanceId+'/'+x.hp+'/'+x.fused+'/'+x.fusionTurnsLeft).join('|')).join(',')}`);
    room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:live.instanceId,hpRatio:1})).room;livePc=pcOf(room,u.profileId);live=allMons(livePc).find(x=>x.instanceId===primaryId);const enemy=room.battle?.enemies?.find(x=>x.hp>0);room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:live.instanceId,moveId:chosenGuard.id,targetUid:enemy?.uid})).room;
    pc=pcOf(room,u.profileId);const after=allMons(pc).find(x=>x.instanceId===primaryId);if(i<4){const expected=4-i;if(!after?.fused||Number(after.fusionTurnsLeft)!==expected)throw Error(`fusion turn ${i+1} expected ${expected}, got ${after?.fusionTurnsLeft}`);}else{const restored=allMons(pc),a=restored.find(x=>x.instanceId===primaryId),b=restored.find(x=>x.instanceId===secondaryId);if(!a||!b||a.fused||b.fused)throw Error('fusion did not split after five turns');}
  }

  room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;if(room.status!=='reward')throw Error(`reward ${room.status}`);const runMons=room.runState[u.profileId]?.monsters||[];if(!runMons.some(x=>x.instanceId===primaryId)||!runMons.some(x=>x.instanceId===secondaryId)||runMons.some(x=>x.fused))throw Error('battle-end fusion cleanup/run persistence');
  console.log(`V60_RUNTIME_OK room=${room.id} enemy=${startEv.payload.enemyNames.join('/')} fusion=5T->split reward=${room.status}`);
}catch(e){console.error('V60_RUNTIME_FAIL',e);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
