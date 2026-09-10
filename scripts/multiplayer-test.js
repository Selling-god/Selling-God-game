'use strict';
const http=require('http');
const cp=require('child_process');
const path=require('path');
const fs=require('fs');
const os=require('os');
const root=path.join(__dirname,'..');const profileFile=path.join(os.tmpdir(),`riftdeck-multi-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3200',PROFILE_FILE:profileFile},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3200,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<30;i++){try{return await req('GET','/healthz');}catch{await new Promise(r=>setTimeout(r,100));}}throw new Error('server not ready');}
(async()=>{try{
  await ready();const users=['a','b','c','d'].map((id,i)=>({profileId:`multi-${id}`,nickname:`원정${i+1}`}));
  for(const u of users)await req('POST','/api/profile',u);
  let room=(await req('POST','/api/rooms/create',{...users[0],mode:'dungeon',name:'4인 테스트'})).room;
  for(const u of users.slice(1))room=(await req('POST','/api/rooms/join',{...u,roomId:room.id})).room;
  if(room.players.length!==4)throw new Error('four player join failed');
  room=(await req('POST',`/api/room/${room.id}/start`,users[0])).room;if(room.status!=='route')throw new Error('dungeon start failed');const nodeId=room.route[0].id;
  for(const u of users)room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId})).room;
  if(!['battle','reward','event'].includes(room.status))throw new Error('group route resolution failed');
  if(room.status==='battle'&&room.battle.party.length!==4)throw new Error('battle party not four');
  console.log(`MULTI_OK room=${room.id} players=${room.players.length} status=${room.status}`);
}catch(e){console.error('MULTI_FAIL',e);process.exitCode=1;}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
