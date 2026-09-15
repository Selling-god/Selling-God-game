'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),catalog=require(path.join(root,'data','catalog.json')),moves=require(path.join(root,'data','move-library.js'));
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8'),server=fs.readFileSync(path.join(root,'server.js'),'utf8');
for(const token of ['function nextRerollCost','function statusEffectFxV55','function tacticCommandFxV55','RIFT COMMAND','공명 지령','function fxOn(){return !!state.fx;}','state.profile?.activeRoomId'])if(!app.includes(token))throw Error(`client token ${token}`);
for(const token of ['.status-effect-fx-v55','.status-poison','.tactic-cast-v55','.move-grid-v52{height:auto','.combat-fx-root{display:block!important}'])if(!css.includes(token))throw Error(`css token ${token}`);
for(const token of ['activeRoomSnapshot','persistRoomFallbackToProfiles','status-tick','debuffs.poison','공명 지령'])if(!server.includes(token))throw Error(`server token ${token}`);
const monsters=[...(catalog.enemies||[]),...(catalog.bosses||[])];let poisonSigs=0;const names=new Set(),families=new Set();
for(const m of monsters){const sig=moves.speciesSignatureMove(m);if(!sig?.signature)throw Error(`signature ${m.id}`);names.add(sig.name);families.add(sig.fxFamily);if(sig.poison)poisonSigs++;}
if(names.size!==205)throw Error(`signature names ${names.size}`);if(families.size<18)throw Error(`fx families ${families.size}`);if(poisonSigs<2)throw Error(`poison signatures ${poisonSigs}`);
const profileFile=path.join(os.tmpdir(),`riftdeck-v55-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
function spawn(port){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1',SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''},stdio:['ignore','ignore','inherit']});}
function req(port,method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(port){for(let i=0;i<100;i++){try{return await req(port,'GET','/healthz')}catch{await new Promise(r=>setTimeout(r,60))}}throw Error('server not ready');}
(async()=>{let p1,p2;try{
 const port1=3371;p1=spawn(port1);const h1=await ready(port1);if(h1.version!=='5.5.0'||h1.deployId!=='RIFT-V550-STATUS-COMMAND-RESUME-20260915')throw Error(`health1 ${h1.version}/${h1.deployId}`);
 const u={profileId:'v55-resume-bot',nickname:'V55BOT'};await req(port1,'POST','/api/profile',u);
 let room=(await req(port1,'POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V55 RESUME'})).room;const roomId=room.id;
 room=(await req(port1,'POST',`/api/room/${room.id}/start`,u)).room;
 const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req(port1,'POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
 room=(await req(port1,'POST',`/api/room/${room.id}/vote`,{...u,nodeId:room.route[0].id})).room;if(room.status!=='battle')throw Error(`battle ${room.status}`);
 await new Promise(r=>setTimeout(r,800));
 p1.kill('SIGTERM');await new Promise(r=>setTimeout(r,260));p1=null;
 const raw=JSON.parse(fs.readFileSync(profileFile,'utf8'));const prof=raw[u.profileId];if(!prof?.activeRoomSnapshot||prof.activeRoomId!==roomId)throw Error('profile fallback snapshot missing');
 const port2=3372;p2=spawn(port2);const h2=await ready(port2);if(h2.version!=='5.5.0')throw Error(`health2 ${h2.version}`);
 const resumed=await req(port2,'POST','/api/rooms/resume',u);if(!resumed.room||resumed.room.id!==roomId||resumed.room.status!=='battle')throw Error(`resume ${resumed.room?.id}/${resumed.room?.status}`);
 console.log(`V55_STATUS_COMMAND_RESUME_OK signatures=${names.size} fxFamilies=${families.size} poisonSigs=${poisonSigs} resume=${resumed.room.id}`);
}catch(e){console.error('V55_STATUS_COMMAND_RESUME_FAIL',e);process.exitCode=1}finally{p1?.kill('SIGTERM');p2?.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
