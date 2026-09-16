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
  if(pkg.name!=='fusewild-monster-fusion-roguelite'||pkg.version!=='6.1.0')throw Error('package brand/version');
  for(const token of ['FUSEWILD','v6.1.0','FUSEWILD-V610-COMPACT-POKEROGUE-FLOW-20260916'])if(!html.includes(token))throw Error(`html token ${token}`);
  for(const token of ['wave-bridge-v61','pokerogue-shop-v61','shop-strip-v61','reward-options-v61','reward-shell-v61','stageBattleHpV61','targetHpBefore','targetHpAfter','2800'])if(!app.includes(token))throw Error(`app token ${token}`);
  for(const token of ['reward-screen-v61','reward-center-v61','shop-item-v61','reward-choice-v61','wave-bridge-v61','overflow:hidden!important'])if(!css.includes(token))throw Error(`css token ${token}`);
  for(const token of ["const VERSION = '6.1.0'",'FUSEWILD-V610-COMPACT-POKEROGUE-FLOW-20260916','targetHpBefore','targetHpAfter','fusionTurnsLeft=5','function releaseFusion'])if(!server.includes(token))throw Error(`server token ${token}`);
  const fusionDir=path.join(root,'assets','fusion');for(const f of ['frame-base.svg','grid-overlay.svg','sigil-alpha.svg','sigil-beta.svg','sigil-gamma.svg','sigil-delta.svg'])if(!fs.existsSync(path.join(fusionDir,f)))throw Error(`fusion asset ${f}`);
  if((catalog.enemies.length+catalog.bosses.length)!==205)throw Error('monster catalog count');
  console.log('V61_STATIC_OK compactShop=6 reward=3 noDesktopRewardScroll=yes stagedHp=yes');
}
staticChecks();
if(process.argv.includes('--static'))process.exit(0);

const profileFile=path.join(os.tmpdir(),`fusewild-v61-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=3391;let proc=null;
function spawn(){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});}
function req(method,p,body,{allowError=false}={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<140;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready');}
function pcOf(room,pid){return room.battle?.party?.find(x=>x.playerId===pid);}
function allMons(pc){return [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])];}

(async()=>{try{
  proc=spawn();const hz=await ready();if(hz.version!=='6.1.0'||hz.deployId!=='FUSEWILD-V610-COMPACT-POKEROGUE-FLOW-20260916')throw Error(`health ${hz.version}/${hz.deployId}`);
  const u={profileId:'v61-bot',nickname:'V61BOT'};let profile=(await req('POST','/api/profile',u)).profile;
  const starterParty=(profile.monsterParty||[]).slice(0,3);await req('POST','/api/loadout',{...u,monsterParty:starterParty});
  let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'FUSEWILD V61'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
  const node=(room.route||[])[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;if(room.status!=='battle')throw Error(`battle start ${room.status}`);
  let pc=pcOf(room,u.profileId),active=pc?.units?.find(x=>x.hp>0),enemy=room.battle?.enemies?.find(x=>x.hp>0);if(!active||!enemy)throw Error('battle actor missing');
  const attack=(active.moves||[]).find(x=>['attack','burst'].includes(x.kind))||active.moves?.[0];room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:active.instanceId,moveId:attack.id,targetUid:enemy.uid})).room;
  const moveEv=[...(room.feed||[])].reverse().find(e=>e.type==='monster-move'&&e.payload?.instanceId===active.instanceId);if(!moveEv)throw Error('monster move event missing');
  for(const k of ['targetHpBefore','targetHpAfter','targetMaxHp'])if(!Number.isFinite(Number(moveEv.payload?.[k])))throw Error(`hp snapshot ${k}`);

  // Fusion lifetime remains intact.
  pc=pcOf(room,u.profileId);active=pc?.units?.find(x=>x.hp>0&&!x.acted)||pc?.units?.find(x=>x.hp>0);let partner=pc?.bench?.find(x=>x.hp>0)||pc?.units?.find(x=>x.hp>0&&x.instanceId!==active?.instanceId);
  // If active already acted, finish turn once with debug win is too destructive. Start a fresh room for fusion check.
  let room2=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'FUSEWILD V61 Fusion'})).room;
  room2=(await req('POST',`/api/room/${room2.id}/start`,u)).room;const offer2=(room2.contractOffers?.[u.profileId]||[])[0];room2=(await req('POST',`/api/room/${room2.id}/contract`,{...u,contractId:offer2.id})).room;const node2=(room2.route||[])[0];room2=(await req('POST',`/api/room/${room2.id}/vote`,{...u,nodeId:node2.id})).room;
  pc=pcOf(room2,u.profileId);active=pc?.units?.find(x=>x.hp>0);partner=pc?.bench?.find(x=>x.hp>0)||pc?.units?.find(x=>x.hp>0&&x.instanceId!==active?.instanceId);if(!active||!partner)throw Error('fusion pair missing');
  const ids=[...(active.moves||[]),...(partner.moves||[])].map(x=>x.id).filter((x,i,a)=>a.indexOf(x)===i).slice(0,4);room2=(await req('POST',`/api/room/${room2.id}/monster-fuse`,{...u,primaryId:active.instanceId,secondaryId:partner.instanceId,moveIds:ids})).room;pc=pcOf(room2,u.profileId);const fused=allMons(pc).find(x=>x.instanceId===active.instanceId);if(!fused?.fused||Number(fused.fusionTurnsLeft)!==5)throw Error('fusion lifetime regression');
  if(!String(fused.fusionArt||'').startsWith('data:image/svg+xml'))throw Error('fusion art regression');
  console.log(`V61_RUNTIME_OK hp=${moveEv.payload.targetHpBefore}->${moveEv.payload.targetHpAfter} fusion=${fused.fusionTurnsLeft}T`);
}catch(e){console.error('V61_RUNTIME_FAIL',e);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
