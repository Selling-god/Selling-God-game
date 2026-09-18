'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),port=43880+(process.pid%500),profileFile=path.join(os.tmpdir(),`fusewild-v75-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');let proc;
const assert=(x,m)=>{if(!x)throw Error(m)};
function req(method,p,body,allow=false){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j={};try{j=JSON.parse(s)}catch{};if(res.statusCode>=400&&!allow)return reject(Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<100;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,60))}}throw Error('server not ready')}
(async()=>{try{
 proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','ignore','inherit']});
 const hz=await ready();assert(hz.version==='7.5.0','version');
 const meta=await req('GET','/api/meta');const pick=meta.monsterPickup;assert(pick.singleCost===5000&&pick.tenCost===45000,'summon price');assert(Math.abs((pick.rates.legendary+pick.rates.mythic)-.003)<1e-12,'high rarity 0.30%');assert(pick.pity===300,'pity');
 const legacy=await req('POST','/api/gacha/pull',{profileId:'x',count:1},true);assert(legacy.status===410,'card gacha must be gone');
 const u={profileId:'v75-feedback-bot',nickname:'V75'};let profile=(await req('POST','/api/profile',u)).profile;
 let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal',name:'V75'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;assert(room.status==='reward','reward phase');
 const opts=room.reward.playerOptions[u.profileId]||[];assert(opts.length>=3,'reward choices');assert(opts.every(x=>x.type==='item'&&x.item?.held),'all free rewards must be held items');
 const target=room.runState[u.profileId].monsters[0];const chosen=opts[0];room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:chosen.id,targetInstanceId:target.instanceId})).room;
 const after=room.runState[u.profileId].monsters.find(x=>x.instanceId===target.instanceId);assert(after.heldItemId===chosen.item.id,'reward not equipped to selected monster');
 const catalog=require(path.join(root,'data','catalog.json'));const catalysts=catalog.items.filter(i=>i.held?.kind==='evolutionCatalyst');assert(catalysts.length>=4&&catalysts.every(i=>i.held.consume&&i.held.speciesIds?.length),'evolution catalysts');
 console.log(`V75_FEEDBACK_OK summon=0.30% cost=5000/45000 heldRewards=${opts.length} equipped=${chosen.item.name} catalysts=${catalysts.length}`);
}catch(e){console.error('V75_FEEDBACK_FAIL',e.message||e);process.exitCode=1}finally{proc?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
