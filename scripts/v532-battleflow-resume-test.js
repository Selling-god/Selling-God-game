'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),port=3354,profileFile=path.join(os.tmpdir(),`riftdeck-v532-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
for(const token of ['battleExitFallbackTimer','monsterSignatureFxV532','recoverRoomSessionV532','/api/rooms/resume'])if(!app.includes(token))throw Error(`client token missing ${token}`);
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:String(port),PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body,allow=false){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allow)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);body?r.end(JSON.stringify(body)):r.end();});}
async function ready(){for(let i=0;i<80;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,80))}}throw Error('server not ready')}
(async()=>{try{
 const hz=await ready();if(hz.version!=='5.3.2'||hz.deployId!=='RIFT-V532-BATTLEFLOW-RESUME-FX-20260915')throw Error(`health ${hz.version}/${hz.deployId}`);
 const u={profileId:'v532-bot',nickname:'V532BOT'};let profile=(await req('POST','/api/profile',u)).profile;
 let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V532'})).room;
 room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 let resumed=(await req('POST','/api/rooms/resume',u)).room;if(!resumed||resumed.id!==room.id)throw Error('resume endpoint failed after start');
 const offer=(room.contractOffers?.[u.profileId]||[])[0];room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
 room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:room.route[0].id})).room;if(room.status!=='battle')throw Error('battle did not start');
 room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;if(room.status!=='reward')throw Error(`post battle not reward: ${room.status}`);if(!room.reward)throw Error('reward payload missing');
 // Resolve only the mandatory normal-wave reward path.
 const pid=u.profileId;let safety=0;
 while(room.status==='reward'&&safety++<20){
   const rw=room.reward;
   if(rw.skillOffers?.[pid]&&!rw.skillClaims?.[pid]){room=(await req('POST',`/api/room/${room.id}/skip-move`,u)).room;continue;}
   if(rw.rewriteOffers?.[pid]&&!rw.rewriteClaims?.[pid]){room=(await req('POST',`/api/room/${room.id}/skip-rewrite`,u)).room;continue;}
   if(rw.camp&&!rw.campBy?.[pid]){room=(await req('POST',`/api/room/${room.id}/camp`,{...u,mode:'rest'})).room;continue;}
   const relics=rw.relicOptions?.[pid]||[];if(relics.length&&!rw.relicClaims?.[pid]){room=(await req('POST',`/api/room/${room.id}/relic`,{...u,relicId:relics[0].id})).room;continue;}
   const opts=rw.playerOptions?.[pid]||[];if(opts.length&&!rw.claims?.[pid]){room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;continue;}
   room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;
 }
 if(room.status!=='route')throw Error(`continue after reward failed: ${room.status}`);if(room.floor!==2)throw Error(`floor did not advance: ${room.floor}`);
 resumed=(await req('POST','/api/rooms/resume',u)).room;if(!resumed||resumed.id!==room.id||resumed.floor!==2)throw Error('resume lost expedition progress');
 profile=(await req('POST','/api/profile',u)).profile;if(profile.activeRoomId!==room.id)throw Error(`profile activeRoomId missing ${profile.activeRoomId}`);
 console.log('V532_BATTLEFLOW_RESUME_OK',{room:room.id,floor:room.floor,status:room.status,signatureFx:true});
}catch(e){console.error('V532_BATTLEFLOW_RESUME_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
