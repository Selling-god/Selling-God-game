'use strict';
// V6.3 PokeRogue cadence test.
// Verifies the post-battle loop is: shop opens -> buy -> pick one free reward -> next wave,
// on EVERY battle wave (not only waves 4 and 9 as in v6.2.1).
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const PORT=3311;
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`fusewild-shop-${process.pid}.json`);
fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(PORT),PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:PORT,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}}if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);r.end(body?JSON.stringify(body):undefined);});}
async function ready(){for(let i=0;i<120;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}

(async()=>{try{
  await ready();
  const u={profileId:'shop-bot',nickname:'상점봇'};
  await req('POST','/api/profile',u);
  let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal',name:'상점 케이던스'})).room;
  room=(await req('POST',`/api/room/${room.id}/start`,u)).room;

  const stockByWave={};
  let purchases=0;

  for(let floor=1;floor<=12;floor++){
    // Enter a real combat node: debug-win from 'route' takes a shortcut path
    // that bypasses the post-battle reward builder.
    if(room.status==='route'){
      const node=(room.route||[]).find(n=>n.kind==='combat')||(room.route||[])[0];
      room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;
    }
    if(room.status==='event'){
      const c=room.event.choices[0];
      room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:c.id})).room;
    }
    if(room.status!=='battle'){ floor--; continue; }
    room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
    if(room.status!=='reward')throw Error(`wave ${floor}: no reward phase`);

    const shop=room.reward.shop;
    if(!Array.isArray(shop)||!shop.length)throw Error(`wave ${floor}: shop did not open (PokeRogue cadence requires a shop every battle wave)`);
    const waveInBiome=((floor-1)%10)+1;
    stockByWave[waveInBiome]=shop.length;

    // Services (HP / PP / status) must be purchasable after every battle too.
    if(!room.reward.serviceCosts)throw Error(`wave ${floor}: field services missing`);

    // Shop first: buy if affordable.
    const run=room.runState[u.profileId];
    const affordable=shop.find(x=>x.price<=run.gold);
    if(affordable){
      const before=room.runState[u.profileId].gold;
      room=(await req('POST',`/api/room/${room.id}/buy`,{...u,itemId:affordable.id,itemType:'item'})).room;
      const after=room.runState[u.profileId].gold;
      if(after>=before)throw Error(`wave ${floor}: purchase did not deduct gold`);
      purchases++;
    }

    // Then exactly one free reward.
    const opts=room.reward.playerOptions[u.profileId]||[];
    if(opts.length<3)throw Error(`wave ${floor}: expected >=3 free reward options, got ${opts.length}`);
    room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;
    room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;

    if(floor<12&&room.floor!==floor+1)throw Error(`wave ${floor}: did not advance`);
  }

  // Stock should scale with wave importance, not be flat.
  if(!(stockByWave[10]>stockByWave[1]))throw Error(`boss wave stock (${stockByWave[10]}) should exceed ordinary wave stock (${stockByWave[1]})`);
  if(purchases<3)throw Error(`only ${purchases} purchases were affordable across 12 waves; economy is too tight`);

  console.log(`SHOP_CADENCE_OK waves=12 purchases=${purchases} stock(normal/elite/boss)=${stockByWave[1]}/${stockByWave[5]}/${stockByWave[10]}`);
}catch(e){console.error('SHOP_CADENCE_FAIL',e.message||e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
