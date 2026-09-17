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
  if(pkg.name!=='fusewild-monster-fusion-roguelite'||pkg.version!=='6.3.0')throw Error('package brand/version');
  for(const token of ['FUSEWILD','v6.3.0','FUSEWILD-V630-PHASE-SYNC-MOBILE-20260917'])if(!html.includes(token))throw Error(`html token ${token}`);
  for(const token of ['reward-pokerogue-v62','reward-party-strip-v62','stageBattleHpV62','stageStatusVisualV62','stageFusionVisualV62','stageFusionTurnV62','stageUnfusionVisualV62','targetHpBefore','targetHpAfter','replacement-command-v63','replacement-pick'])if(!app.includes(token))throw Error(`app token ${token}`);
  for(const token of ['reward-pokerogue-v62','reward-message-v62','reward-party-strip-v62','live-status-layer-v62','fusion-live-turn-v62','fusion-preview-art-v62','replacement-command-v63'])if(!css.includes(token))throw Error(`css token ${token}`);
  for(const token of ["const VERSION = '6.3.0'",'FUSEWILD-V630-PHASE-SYNC-MOBILE-20260917','fusionTurnsLeft=5','function releaseFusion','ensureFusionArtAsset','FUSION_GENERATED_DIR','function resolveReplacement','pendingReplacements'])if(!server.includes(token))throw Error(`server token ${token}`);
  const fusionDir=path.join(root,'assets','fusion');for(const f of ['frame-base.svg','grid-overlay.svg','sigil-alpha.svg','sigil-beta.svg','sigil-gamma.svg','sigil-delta.svg'])if(!fs.existsSync(path.join(fusionDir,f)))throw Error(`fusion asset ${f}`);
  if(!fs.existsSync(path.join(fusionDir,'generated')))throw Error('generated fusion folder missing');
  if((catalog.enemies.length+catalog.bosses.length)!==205)throw Error('monster catalog count');
  console.log('V63_STATIC_OK phaseSync=yes manualReplacement=yes mobileSafe=yes compactReward=yes fusionNestedCache=yes');
}
staticChecks();
if(process.argv.includes('--static'))process.exit(0);

const profileFile=path.join(os.tmpdir(),`fusewild-v63-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=36000+(process.pid%12000);let proc=null;
function spawn(){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});}
function req(method,p,body,{allowError=false}={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<140;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready');}
function pcOf(room,pid){return room.battle?.party?.find(x=>x.playerId===pid);}
function allMons(pc){return [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])];}
async function resolveReplacementIfNeeded(room,u){if(room?.status!=='battle'||room?.battle?.phase!=='replacement')return room;const pc=pcOf(room,u.profileId);const pending=pc?.pendingReplacements?.[0],candidate=pc?.bench?.find(x=>x.hp>0);if(pending&&candidate)return (await req('POST',`/api/room/${room.id}/replacement`,{...u,benchId:candidate.instanceId,slotIndex:Number(pending.slotIndex||0)})).room;return room;}

(async()=>{try{
  proc=spawn();const hz=await ready();if(hz.version!=='6.3.0'||hz.deployId!=='FUSEWILD-V630-PHASE-SYNC-MOBILE-20260917')throw Error(`health ${hz.version}/${hz.deployId}`);
  const u={profileId:'v63-bot',nickname:'V63BOT'};let profile=(await req('POST','/api/profile',u)).profile;
  const starterParty=(profile.monsterParty||[]).slice(0,3);await req('POST','/api/loadout',{...u,monsterParty:starterParty});
  let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'FUSEWILD V63'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;const node=(room.route||[])[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;if(room.status!=='battle')throw Error(`battle start ${room.status}`);
  let pc=pcOf(room,u.profileId),active=pc?.units?.find(x=>x.hp>0),enemy=room.battle?.enemies?.find(x=>x.hp>0);if(!active||!enemy)throw Error('battle actor missing');
  const attack=(active.moves||[]).find(x=>['attack','burst'].includes(x.kind))||active.moves?.[0];room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:active.instanceId,moveId:attack.id,targetUid:enemy.uid})).room;const moveEv=[...(room.feed||[])].reverse().find(e=>e.type==='monster-move'&&e.payload?.instanceId===active.instanceId);if(!moveEv)throw Error('monster move event missing');for(const k of ['targetHpBefore','targetHpAfter','targetMaxHp'])if(!Number.isFinite(Number(moveEv.payload?.[k])))throw Error(`hp snapshot ${k}`);

  let room2=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'FUSEWILD V63 Fusion'})).room;room2=(await req('POST',`/api/room/${room2.id}/start`,u)).room;const offer2=(room2.contractOffers?.[u.profileId]||[])[0];room2=(await req('POST',`/api/room/${room2.id}/contract`,{...u,contractId:offer2.id})).room;const node2=(room2.route||[])[0];room2=(await req('POST',`/api/room/${room2.id}/vote`,{...u,nodeId:node2.id})).room;
  pc=pcOf(room2,u.profileId);active=pc?.units?.find(x=>x.hp>0);let partner=pc?.bench?.find(x=>x.hp>0)||pc?.units?.find(x=>x.hp>0&&x.instanceId!==active?.instanceId);if(!active||!partner)throw Error('fusion pair missing');
  const ids=[...(active.moves||[]),...(partner.moves||[])].map(x=>x.id).filter((x,i,a)=>a.indexOf(x)===i).slice(0,4);room2=(await req('POST',`/api/room/${room2.id}/monster-fuse`,{...u,primaryId:active.instanceId,secondaryId:partner.instanceId,moveIds:ids})).room;pc=pcOf(room2,u.profileId);let fused=allMons(pc).find(x=>x.instanceId===active.instanceId);if(!fused?.fused||Number(fused.fusionTurnsLeft)!==5)throw Error('fusion lifetime regression');if(!String(fused.fusionArt||'').startsWith('/assets/fusion/generated/')||!String(fused.fusionArt||'').includes('.png'))throw Error(`fusion art url regression: ${fused.fusionArt}`);
  const artRel=String(fused.fusionArt).split('?')[0].replace(/^\/assets\//,'');const artPath=path.join(root,'assets',artRel);if(!fs.existsSync(artPath))throw Error('fusion png not generated');const artBuf=fs.readFileSync(artPath);if(artBuf.length<8000||!artBuf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw Error('fusion art is not a real PNG');const fuseEv=[...(room2.feed||[])].reverse().find(e=>e.type==='monster-fuse');if(!fuseEv?.payload?.toSprite?.startsWith('/assets/fusion/generated/'))throw Error('fusion event art missing');if(Number(fuseEv.payload?.turnsLeft)!==5)throw Error('fusion event turns missing');
  for(let round=0;round<7&&room2.status==='battle';round++){
    let guard=0;
    while(room2.status==='battle'&&room2.battle?.phase==='players'&&guard++<8){
      pc=pcOf(room2,u.profileId);const actor=(pc?.units||[]).find(x=>x.hp>0&&!x.acted);const foe=(room2.battle?.enemies||[]).find(x=>x.hp>0);
      if(!actor||!foe)break;const mv=(actor.moves||[]).find(x=>Number(x.pp||0)>0&&['attack','burst'].includes(x.kind))||(actor.moves||[]).find(x=>Number(x.pp||0)>0);if(!mv)break;
      room2=(await req('POST',`/api/room/${room2.id}/move`,{...u,instanceId:actor.instanceId,moveId:mv.id,targetUid:foe.uid})).room;room2=await resolveReplacementIfNeeded(room2,u);
    }
    room2=await resolveReplacementIfNeeded(room2,u);
    if(room2.status==='battle'){pc=pcOf(room2,u.profileId);fused=allMons(pc).find(x=>x.instanceId===active.instanceId);if(!fused?.fused)break;}
  }
  if(room2.status==='battle'){pc=pcOf(room2,u.profileId);fused=allMons(pc).find(x=>x.instanceId===active.instanceId);if(fused?.fused)throw Error(`fusion did not expire: ${fused.fusionTurnsLeft}`);}
  console.log(`V63_RUNTIME_OK hp=${moveEv.payload.targetHpBefore}->${moveEv.payload.targetHpAfter} fusionArt=realPNG fiveTurnSplit=yes`);
}catch(e){console.error('V63_RUNTIME_FAIL',e);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
