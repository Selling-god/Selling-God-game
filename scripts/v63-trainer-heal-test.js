'use strict';
// V6.3: wave-10 trainer duels + mode-specific heal policy.
//  - wave 10 is a named NPC keeper fighting a 2-monster team (ace + biome partner)
//  - journey : full party heal after the keeper is beaten
//  - dungeon : NO free heal at any point; HP/PP carry the whole descent
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const PORT=3312, root=path.join(__dirname,'..');
const profileFile=path.join(os.tmpdir(),`fusewild-v63-${process.pid}.json`); fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(PORT),PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((res,rej)=>{const r=http.request({host:'127.0.0.1',port:PORT,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},x=>{let s='';x.on('data',c=>s+=c);x.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}}if(x.statusCode>=400)return rej(new Error(j.error||`HTTP ${x.statusCode}`));res(j);});});r.on('error',rej);r.end(body?JSON.stringify(body):undefined);});}
async function ready(){for(let i=0;i<120;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}

async function runTo10(u,mode){
  let room=(await req('POST','/api/rooms/create',{...u,mode,difficulty:'normal',name:`v63 ${mode}`})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
  let trainerSeen=null, duelEnemies=0;
  for(let floor=1;floor<=10;floor++){
    if(room.status==='route'){
      const node=(room.route||[]).find(n=>n.kind==='combat')||(room.route||[])[0];
      room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;
    }
    if(room.status==='event'){room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:room.event.choices[0].id})).room;}
    if(room.status!=='battle'){floor--;continue;}
    if(floor===10){
      trainerSeen=room.battle.trainer;
      duelEnemies=(room.battle.enemies||[]).length;
    }
    room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
    const opts=room.reward.playerOptions[u.profileId]||[];
    if(opts.length)room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;
    // Record HP right before crossing the biome boundary.
    if(floor===10){
      const before=room.runState[u.profileId];
      const hpBefore=(before.monsters||[]).map(m=>m.hp);
      const maxes=(before.monsters||[]).map(m=>m.maxHp);
      room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;
      const after=room.runState[u.profileId];
      return {room,trainerSeen,duelEnemies,hpBefore,maxes,hpAfter:(after.monsters||[]).map(m=>m.hp)};
    }
    room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;
  }
  throw Error('never reached wave 10');
}

(async()=>{try{
  await ready();

  // --- JOURNEY: trainer duel + heal on wave 10 ---
  const ju={profileId:'v63-journey',nickname:'여행봇'}; await req('POST','/api/profile',ju);
  const j=await runTo10(ju,'journey');
  if(!j.trainerSeen)throw Error('wave 10 has no trainer: expected a named NPC keeper duel');
  if(!j.trainerSeen.name||!j.trainerSeen.intro||!j.trainerSeen.defeat)throw Error('trainer is missing name/intro/defeat dialogue');
  if(j.duelEnemies<2)throw Error(`trainer duel should field 2 monsters, got ${j.duelEnemies}`);
  const healed=j.hpAfter.every((hp,i)=>hp===j.maxes[i]);
  if(!healed)throw Error(`journey: party should be fully healed after the keeper, got ${j.hpAfter.join('/')} of ${j.maxes.join('/')}`);

  // --- DUNGEON: same duel, but NO free heal ---
  const du={profileId:'v63-dungeon',nickname:'던전봇'}; await req('POST','/api/profile',du);
  const d=await runTo10(du,'dungeon');
  if(!d.trainerSeen)throw Error('dungeon wave 10 has no trainer duel');
  const damaged=d.hpBefore.some((hp,i)=>hp<d.maxes[i]);
  if(damaged){
    const wasHealed=d.hpAfter.every((hp,i)=>hp===d.maxes[i]);
    if(wasHealed)throw Error('dungeon must NOT auto-heal at wave 10; healing should cost money at the shop');
    const restored=d.hpAfter.some((hp,i)=>hp>d.hpBefore[i]);
    if(restored)throw Error('dungeon HP increased across the biome boundary without a purchase');
  }

  console.log(`V63_TRAINER_HEAL_OK trainer="${j.trainerSeen.name}" duelEnemies=${j.duelEnemies} journeyHeal=yes dungeonHeal=no dungeonHp=${d.hpBefore.join('/')}->${d.hpAfter.join('/')}`);
}catch(e){console.error('V63_TRAINER_HEAL_FAIL',e.message||e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
