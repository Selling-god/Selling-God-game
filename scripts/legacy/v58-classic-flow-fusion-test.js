'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..');
const catalog=require(path.join(root,'data','catalog.json'));
const moves=require(path.join(root,'data','move-library.js'));
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const render=fs.readFileSync(path.join(root,'render.yaml'),'utf8');

let staticFxFamilyCount=0;
function staticChecks(){
  const monsters=[...(catalog.enemies||[]),...(catalog.bosses||[])];
  if(monsters.length!==205)throw Error(`monster count ${monsters.length}`);
  const sigNames=new Set(),fxFamilies=new Set();
  for(const mon of monsters){
    const list=moves.initialMoves(mon); if(list.length<4)throw Error(`move slots ${mon.id}`);
    const sig=list.find(m=>m.signature); if(!sig)throw Error(`signature ${mon.id}`);
    sigNames.add(sig.name); for(const mv of list)fxFamilies.add(mv.fxFamily);
  }
  if(sigNames.size!==205)throw Error(`signature names ${sigNames.size}`);
  if(fxFamilies.size<18)throw Error(`fx families ${fxFamilies.size}`); staticFxFamilyCount=fxFamilies.size;
  const allMoves=moves.MOVE_LIBRARY||[];const sleepCount=allMoves.filter(m=>Number(m.sleep||0)>0).length,freezeCount=allMoves.filter(m=>Number(m.freeze||0)>0).length;
  if(sleepCount<1||freezeCount<1)throw Error(`status move coverage sleep=${sleepCount} freeze=${freezeCount}`);
  for(const token of ['fusionSpriteUrlV58','battle-run','skip-moves-all','route-loading-v58','fusionDraft','openFusionBuilderV56','TURN FUSION','PP ${pp}/${max}','function moveSpectacleV56','function playerStatusEventFxV56','HP / PP KEEP','NO FREE HEAL // SHOP ONLY','FULL HEAL AFTER WAVE 10 KEEPER','battleTimelineUntil','battleExitPending','function nextRerollCost','function battleNarrateV57','function canvasMoveFxV57','function statusCinematicV57','function moveResultNarrationsV57','reward-dialog-v57','reward-stage-v31 reward-v51 reward-v57 reward-v58'])if(!app.includes(token))throw Error(`app token ${token}`);
  for(const token of ['root-command-v58','fusion-preview-v58','reward-v58 .reward-card-v57','route-loading-v58','family-slash','family-claw','family-bite','family-beam','family-thunder','family-flame','family-ice','family-toxin','family-shadow','family-meteor','family-quake','family-time','status-paralysis','status-sleep','status-freeze','fusion-cinematic-v56','boss-hp-segments-v56','combat-fx-canvas-v57','status-cinematic-v57','reward-card-v57','battle-dialog-v57.narrating-v57'])if(!css.includes(token))throw Error(`css token ${token}`);
  for(const token of ['function attemptRunBattle','function fusionSpriteSvg','function enemyActV58','function finishBattleRoundV58','function fuseMonsters','consumesAction:true','majorStatus','statusTurns','ppBonus','10웨이브 돌파 · HP / PP / 상태이상이 모두 회복되었습니다.','V5.6 원정 전투에서는 카드를 사용하지 않습니다.','hpSegmentsMax','boss-shield-break','function preEnemyActionStatus','function tryEnemyMajorStatus','enemy-status-turn','targetMonsterName','targetName:target?.name'])if(!server.includes(token))throw Error(`server token ${token}`);
  if(!/type:\s*web/.test(render)||!/startCommand:\s*npm start/.test(render)||!/healthCheckPath:\s*\/healthz/.test(render))throw Error('render web service config');
  console.log(`V58_STATIC_OK monsters=${monsters.length} signatures=${sigNames.size} fxFamilies=${fxFamilies.size} sleep=${sleepCount} freeze=${freezeCount}`);
}
staticChecks();
if(process.argv.includes('--static'))process.exit(0);

const profileFile=path.join(os.tmpdir(),`riftdeck-v58-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
let proc=null;const port=3386;
function spawn(){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''},stdio:['ignore','ignore','inherit']});}
function req(method,p,body,{allowError=false}={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<120;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50))}}throw Error('server not ready');}
function pcOf(room,pid){return room.battle?.party?.find(x=>x.playerId===pid);}
function allMons(pc){return [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])];}
async function chooseRoute(room,u){const node=(room.route||[])[0];if(!node)throw Error(`no route at floor ${room.floor}`);return (await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;}
async function clearReward(room,u){if(room.status!=='reward')throw Error(`expected reward got ${room.status}`);const opts=room.reward?.playerOptions?.[u.profileId]||[];if(opts.length&&!room.reward?.claims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/salvage`,u)).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;return room;}

(async()=>{try{
  proc=spawn();const hz=await ready();if(!hz.version||!hz.deployId)throw Error(`health ${hz.version}/${hz.deployId}`);
  // Run command: in TEST_MODE it must always succeed, advance a wave, and give no reward.
  const runner={profileId:'v58-run-bot',nickname:'RUNBOT'};let runProfile=(await req('POST','/api/profile',runner)).profile;const runParty=(runProfile.monsterParty||[]).slice(0,3);await req('POST','/api/loadout',{...runner,monsterParty:runParty});let runRoom=(await req('POST','/api/rooms/create',{...runner,mode:'journey',difficulty:'normal',name:'V58 RUN TEST'})).room;runRoom=(await req('POST',`/api/room/${runRoom.id}/start`,runner)).room;const runOffer=(runRoom.contractOffers?.[runner.profileId]||[])[0];runRoom=(await req('POST',`/api/room/${runRoom.id}/contract`,{...runner,contractId:runOffer.id})).room;runRoom=await chooseRoute(runRoom,runner);if(runRoom.status!=='battle')throw Error(`run test battle ${runRoom.status}`);const runPc=pcOf(runRoom,runner.profileId),runUnit=runPc?.units?.find(x=>x.hp>0&&!x.acted)||runPc?.units?.[0];const escaped=await req('POST',`/api/room/${runRoom.id}/run-battle`,{...runner,instanceId:runUnit.instanceId});if(!escaped.result?.success||escaped.room?.floor!==2||escaped.room?.status!=='route'||escaped.room?.reward)throw Error(`run flow failed ${escaped.result?.success}/${escaped.room?.floor}/${escaped.room?.status}`);

  const u={profileId:'v58-bot',nickname:'V58BOT'};await req('POST','/api/profile',u);
  let profile=(await req('POST','/api/profile',u)).profile;
  // V56 party loadout must work without any tactic/card deck payload.
  const starterParty=(profile.monsterParty||[]).slice(0,3);const load=await req('POST','/api/loadout',{...u,monsterParty:starterParty});if(!(load.profile?.monsterParty||[]).length)throw Error('monster-only loadout rejected');
  let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V58 BATTLE PHASE'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
  room=await chooseRoute(room,u);if(room.status!=='battle')throw Error(`floor1 battle ${room.status}`);

  let pc=pcOf(room,u.profileId),active=pc?.units?.find(x=>x.hp>0),partner=pc?.bench?.find(x=>x.hp>0)||pc?.units?.find(x=>x.hp>0&&x.instanceId!==active?.instanceId);
  if(!active||!partner)throw Error('fusion pair missing');
  const pool=new Map();for(const mv of [...(active.moves||[]),...(partner.moves||[])])if(mv?.id&&!pool.has(mv.id))pool.set(mv.id,mv);const moveIds=[...pool.keys()].slice(0,4);
  const primaryId=active.instanceId,secondaryId=partner.instanceId;
  room=(await req('POST',`/api/room/${room.id}/monster-fuse`,{...u,primaryId,secondaryId,moveIds})).room;
  pc=pcOf(room,u.profileId);let fused=allMons(pc).find(x=>x.instanceId===primaryId);if(!fused?.fused||!(fused.fusionLineage||[]).includes(partner.speciesId))throw Error('fusion data');if(allMons(pc).some(x=>x.instanceId===secondaryId))throw Error('fusion partner still present');
  const fuseEvent=[...(room.feed||[])].reverse().find(e=>e.type==='monster-fuse');if(!fuseEvent?.payload?.consumesAction)throw Error('fusion action cost missing');
  const fusionPath=new URL(fuseEvent.payload.toSprite,'http://127.0.0.1').pathname+new URL(fuseEvent.payload.toSprite,'http://127.0.0.1').search;const fusionSvg=await req('GET',fusionPath,null,{allowError:true});if(fusionSvg.status!==200||!String(fusionSvg.raw||'').includes('<svg'))throw Error('fusion composite sprite endpoint');

  // Card damage system is disabled in V56.
  const cardTry=await req('POST',`/api/room/${room.id}/play`,{...u,handIndex:0},{allowError:true});if(cardTry.status<400||!/카드를 사용하지 않습니다/.test(cardTry.error||''))throw Error('legacy card combat still active');

  // Fused monster can act next round; PP must decrease and remain persistent across waves.
  pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId);room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:fused.instanceId,hpRatio:1,majorStatus:null,statusTurns:0})).room;pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId);let enemy=room.battle.enemies.find(x=>x.hp>0);let mv=(fused.moves||[]).find(x=>Number(x.pp)>0&&['attack','burst'].includes(x.kind))||(fused.moves||[]).find(x=>Number(x.pp)>0);if(!mv)throw Error('usable move missing');const beforePp=Number(mv.pp);
  room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:fused.instanceId,moveId:mv.id,targetUid:enemy.uid})).room;
  pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId);mv=fused.moves.find(x=>x.id===mv.id);if(Number(mv.pp)!==beforePp-1)throw Error(`pp decrement ${beforePp}->${mv.pp}`);
  room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;if(room.status!=='reward')throw Error(`reward1 ${room.status}`);let runMon=(room.runState[u.profileId].monsters||[]).find(x=>x.instanceId===primaryId);const persistedPp=Number(runMon.moves.find(x=>x.id===mv.id).pp);
  room=await clearReward(room,u);if(room.floor!==2||room.status!=='route')throw Error(`floor2 route ${room.floor}/${room.status}`);room=await chooseRoute(room,u);pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId);if(!fused)throw Error('fused monster lost next wave');if(Number(fused.moves.find(x=>x.id===mv.id).pp)!==persistedPp)throw Error('PP did not persist');

  // Fast-forward to wave 10 with server-authoritative rewards. No free full heal before the biome boundary.
  while(room.floor<10){room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;room=await clearReward(room,u);room=await chooseRoute(room,u);}
  if(room.floor!==10||room.status!=='battle')throw Error(`wave10 ${room.floor}/${room.status}`);
  pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId)||pc.units[0];
  room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:fused.instanceId,hpRatio:.33,majorStatus:'poison',statusTurns:3,movePp:0})).room;
  room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;room=await clearReward(room,u);
  if(room.floor!==11||room.status!=='route')throw Error(`post10 ${room.floor}/${room.status}`);
  runMon=(room.runState[u.profileId].monsters||[]).find(x=>x.instanceId===fused.instanceId);if(!runMon)throw Error('run monster missing after wave10');if(Number(runMon.hp)!==Number(runMon.maxHp)||runMon.majorStatus)throw Error(`wave10 heal hp/status ${runMon.hp}/${runMon.maxHp}/${runMon.majorStatus}`);if((runMon.moves||[]).some(x=>Number(x.pp)!==Number(x.maxPp)))throw Error('wave10 PP not restored');

  // Resume API returns the server-authoritative active expedition.
  const resumed=(await req('POST','/api/rooms/resume',u)).room;if(!resumed||resumed.id!==room.id||resumed.floor!==11)throw Error('resume API failed');
  console.log(`V58_BATTLE_PHASE_FX_OK room=${room.id} floor=${room.floor} fused=${runMon.name} signatures=205 fxFamilies=${staticFxFamilyCount}`);
}catch(e){console.error('V58_BATTLE_PHASE_FX_FAIL',e);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
