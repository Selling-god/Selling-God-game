'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..');
const profileFile=path.join(os.tmpdir(),`riftdeck-v52-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
for(const token of ['monster-battle-v52','battle-dialog-v52','route-loading-v52','starter-choice-v52','queueAutoEncounter(r,node)']){if(!app.includes(token)&&!css.includes(token))throw Error(`V52 token missing: ${token}`);}
if(!css.includes('max-width:min(74%,220px)'))throw Error('V52 sprite size cap missing');
if(!css.includes('image-rendering:auto'))throw Error('V52 smooth image scaling missing');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3352',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body,allowError=false){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3352,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400&&!allowError)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve({status:res.statusCode,...j});});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<60;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready');}
(async()=>{try{
 const hz=await ready();if(hz.deployId!=='RIFT-V550-STATUS-COMMAND-RESUME-20260915')throw Error(`deploy id ${hz.deployId}`);
 const u={profileId:'v52-bot',nickname:'V52BOT'};await req('POST','/api/profile',u);
 let room=(await req('POST','/api/rooms/create',{...u,mode:'journey',difficulty:'normal',name:'V52 TEST'})).room;
 room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 if(room.status!=='route')throw Error(`route expected, got ${room.status}`);
 const offer=(room.contractOffers?.[u.profileId]||[])[0];if(!offer)throw Error('contract offer missing');
 room=(await req('POST',`/api/room/${room.id}/contract`,{...u,contractId:offer.id})).room;
 if(room.status!=='route')throw Error(`route should remain until vote, got ${room.status}`);
 const node=room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;
 if(room.status!=='battle')throw Error(`battle expected, got ${room.status}`);
 // The screenshot bug: a late/stale vote must not become HTTP 400.
 const stale=await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id},true);
 if(stale.status!==200||stale.room?.status!=='battle')throw Error(`stale vote race not idempotent: ${stale.status}/${stale.room?.status}`);
 console.log('V52_CLASSIC_BATTLE_OK staleVote=200 battleLayout=v52 spriteCap=220 smoothScale=true');
}catch(e){console.error('V52_CLASSIC_BATTLE_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
