'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-50-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3302',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3302,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<40;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const u={profileId:'floor-bot',nickname:'50층봇'};await req('POST','/api/profile',u);let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'hell',name:'50층 테스트'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 for(let floor=1;floor<=50;floor++){
   if(room.floor!==floor||room.status!=='route')throw Error(`expected route floor ${floor}, got ${room.floor}/${room.status}`);
   room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;if(room.status!=='reward')throw Error(`debug reward failed at ${floor}`);
   const opts=room.reward.playerOptions[u.profileId];if(!opts?.length)throw Error(`no reward at ${floor}`);room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;
   if(floor<50&&room.floor!==floor+1)throw Error(`did not advance after ${floor}`);
 }
 if(room.status!=='cleared'||room.floor!==50)throw Error(`50 floor clear failed ${room.status}/${room.floor}`);const p=await req('POST','/api/profile',u);if((p.profile.stats.hellClears||0)<1)throw Error('hell clear stat missing');
 console.log(`FIFTY_FLOOR_OK floor=${room.floor} status=${room.status} hellClears=${p.profile.stats.hellClears}`);
}catch(e){console.error('FIFTY_FLOOR_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
