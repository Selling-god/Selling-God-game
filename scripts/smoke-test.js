'use strict';
const http = require('http');
const cp = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const root = path.join(__dirname,'..');
const profileFile = path.join(os.tmpdir(),`riftdeck-smoke-${process.pid}.json`);
fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3199',PROFILE_FILE:profileFile},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3199,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let json;try{json=JSON.parse(s)}catch{json={raw:s}};if(res.statusCode>=400)return reject(new Error(json.error||`HTTP ${res.statusCode}`));resolve(json);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<30;i++){try{return await req('GET','/healthz');}catch{await new Promise(r=>setTimeout(r,100));}}throw new Error('server not ready');}
(async()=>{try{
  await ready();
  const meta=await req('GET','/api/meta');if(meta.cards.length<40)throw new Error('card catalog too small');
  const p=await req('POST','/api/profile',{profileId:'smoke-user',nickname:'스모크'});if(!p.profile||p.profile.ownedCount<8)throw new Error('profile init failed');
  const cr=await req('POST','/api/rooms/create',{profileId:'smoke-user',nickname:'스모크',mode:'journey'});const id=cr.room.id;if(!/^\d{6}$/.test(id))throw new Error('bad room code');
  const st=await req('POST',`/api/room/${id}/start`,{profileId:'smoke-user',nickname:'스모크'});if(st.room.status!=='route')throw new Error('journey did not enter route');
  const node=st.room.route[0];const vote=await req('POST',`/api/room/${id}/vote`,{profileId:'smoke-user',nickname:'스모크',nodeId:node.id});if(!['battle','reward','event'].includes(vote.room.status))throw new Error('route resolve failed');
  console.log(`SMOKE_OK cards=${meta.cards.length} room=${id} status=${vote.room.status}`);
}catch(e){console.error('SMOKE_FAIL',e);process.exitCode=1;}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
