'use strict';
const http=require('http');
const cp=require('child_process');
const path=require('path');
const fs=require('fs');
const os=require('os');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const index=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const build=fs.readFileSync(path.join(root,'scripts','build.js'),'utf8');

function need(src,token,label){if(!src.includes(token))throw Error(`${label||'source'} missing: ${token}`);}
function staticChecks(){
  for(const token of [
    "const VERSION = '5.9.0'",
    "const FUSION_TURN_LIMIT = 5",
    'function restoreTemporaryFusion',
    'function advanceTemporaryFusion',
    "restoreAllTemporaryFusions(room,'battle-end')",
    'function fusionSpriteDataUri',
    'data:${mime};base64,',
    "'Cache-Control':'no-store, max-age=0'"
  ]) need(server,token,'server');
  for(const token of [
    'fusion-turn-badge-v59',
    'reward-count-${Math.min(6,Math.max(1,options.length))}',
    '&v=590',
    'const BATTLE_PACE_V57={turn:320',
    'Math.min(1.25,window.devicePixelRatio||1)',
    "$('.enemy-mon-v51.selected,.enemy-mon-v51')",
    "$('.active-mon-v51.selected,.active-mon-v51')",
    "sig?520:360",
    "sig?520:380"
  ]) need(app,token,'app');
  for(const token of [
    'html:has(body.visual-run-v31)',
    '.reward-v58 .reward-options-v51.reward-count-4',
    'overflow-y:auto!important',
    '.fusion-turn-badge-v59',
    'animation-play-state:paused!important'
  ]) need(css,token,'css');
  need(index,'RIFT-V590-FUSION-5TURN-FX-PERF-20260916','index');
  need(index,'5턴 융합','index');
  need(build,"deployId: 'RIFT-V590-FUSION-5TURN-FX-PERF-20260916'",'build');
  console.log('V59_STATIC_OK viewport=locked reward=autofit fusion=5turn embeddedSprite=yes fx=lowJank');
}
staticChecks();
if(process.argv.includes('--static'))process.exit(0);

const profileFile=path.join(os.tmpdir(),`riftdeck-v59-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const port=3397;let proc=null;
function spawn(){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''},stdio:['ignore','ignore','inherit']});}
function req(method,p,body,{allowError=false}={}){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<120;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,50));}}throw Error('server not ready');}
function pcOf(room,pid){return room.battle?.party?.find(x=>x.playerId===pid);}
function allMons(pc){return [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])];}
async function chooseRoute(room,u){const node=(room.route||[])[0];if(!node)throw Error('route missing');return (await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;}
function fusionPair(room,u){const pc=pcOf(room,u.profileId),a=pc?.units?.find(x=>x.hp>0&&!x.fused),b=pc?.bench?.find(x=>x.hp>0&&!x.fused)||pc?.units?.find(x=>x.hp>0&&!x.fused&&x.instanceId!==a?.instanceId);return {pc,a,b};}
function fusionMoves(a,b){const map=new Map();for(const mv of [...(a?.moves||[]),...(b?.moves||[])])if(mv?.id&&!map.has(mv.id))map.set(mv.id,mv);return [...map.keys()].slice(0,4);}

(async()=>{try{
  proc=spawn();const hz=await ready();
  if(!hz.version||!hz.deployId)throw Error(`health ${hz.version}/${hz.deployId}`);
  const u={profileId:'v59-bot',nickname:'V59BOT'};
  let profile=(await req('POST','/api/profile',u)).profile;
  const party=(profile.monsterParty||[]).slice(0,3);if(party.length<2)throw Error('starter party too small');
  await req('POST','/api/loadout',{...u,monsterParty:party});
  let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V59 FUSION TIMER'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
  room=await chooseRoute(room,u);if(room.status!=='battle')throw Error(`battle start ${room.status}`);

  let {a,b}=fusionPair(room,u);if(!a||!b)throw Error('fusion pair missing');
  const primaryId=a.instanceId,secondaryId=b.instanceId;
  room=(await req('POST',`/api/room/${room.id}/monster-fuse`,{...u,primaryId,secondaryId,moveIds:fusionMoves(a,b)})).room;
  let pc=pcOf(room,u.profileId),fused=allMons(pc).find(x=>x.instanceId===primaryId);
  if(!fused?.fused||Number(fused.fusionTurnsRemaining)!==5)throw Error(`fusion start turns=${fused?.fusionTurnsRemaining}`);
  if(allMons(pc).some(x=>x.instanceId===secondaryId))throw Error('fusion partner not removed');
  const fuseEvent=[...(room.feed||[])].reverse().find(e=>e.type==='monster-fuse');
  if(Number(fuseEvent?.payload?.durationTurns)!==5)throw Error('fusion duration event mismatch');
  const fusionUrl=new URL(fuseEvent.payload.toSprite,'http://127.0.0.1');
  const fusionSvg=await req('GET',fusionUrl.pathname+fusionUrl.search,null,{allowError:true});
  const svg=String(fusionSvg.raw||'');
  if(fusionSvg.status!==200||!svg.includes('<svg')||!svg.includes('data:image/'))throw Error('fusion SVG does not embed monster art');

  // Freeze guarantees the fused monster consumes an action without damaging the enemy.
  // That lets the runtime contract prove an exact five-action release rather than relying on source text alone.
  for(let action=1;action<=5;action++){
    pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId);
    if(action<=5&&!fused?.fused)throw Error(`fusion ended early before action ${action}`);
    room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:primaryId,hpRatio:1,majorStatus:'freeze',statusTurns:99,speedStage:6,block:999})).room;
    pc=pcOf(room,u.profileId);fused=allMons(pc).find(x=>x.instanceId===primaryId);
    const mv=(fused.moves||[]).find(x=>Number(x.pp)>0)||(fused.moves||[])[0];const enemy=(room.battle?.enemies||[]).find(x=>x.hp>0);
    if(!mv||!enemy)throw Error(`timer setup missing action=${action}`);
    room=(await req('POST',`/api/room/${room.id}/move`,{...u,instanceId:primaryId,moveId:mv.id,targetUid:enemy.uid})).room;
    pc=pcOf(room,u.profileId);const primary=allMons(pc).find(x=>x.instanceId===primaryId),partner=allMons(pc).find(x=>x.instanceId===secondaryId);
    if(action<5){const expected=5-action;if(!primary?.fused||Number(primary.fusionTurnsRemaining)!==expected)throw Error(`timer action ${action}: ${primary?.fusionTurnsRemaining}`);if(partner)throw Error(`partner restored early action ${action}`);}
    else{if(primary?.fused)throw Error('fusion still active after action 5');if(!partner)throw Error('partner not restored after action 5');const end=[...(room.feed||[])].reverse().find(e=>e.type==='monster-unfuse');if(end?.payload?.reason!=='timer')throw Error(`timer release reason ${end?.payload?.reason}`);}
  }

  // Fuse once more and force battle victory: battle end must always restore both originals.
  ({a,b}=fusionPair(room,u));if(!a||!b)throw Error('second fusion pair missing');
  room=(await req('POST',`/api/room/${room.id}/monster-fuse`,{...u,primaryId:a.instanceId,secondaryId:b.instanceId,moveIds:fusionMoves(a,b)})).room;
  room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
  if(room.status!=='reward')throw Error(`debug win status ${room.status}`);
  const runMons=room.runState?.[u.profileId]?.monsters||[];
  const p1=runMons.find(x=>x.instanceId===a.instanceId),p2=runMons.find(x=>x.instanceId===b.instanceId);
  if(!p1||!p2||p1.fused||p2.fused)throw Error('battle-end fusion leaked into run roster');
  console.log(`V59_RUNTIME_OK room=${room.id} embeddedFusionArt=yes timer=5 battleEndRelease=yes`);
}catch(e){console.error('V59_FAIL',e);process.exitCode=1;}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
