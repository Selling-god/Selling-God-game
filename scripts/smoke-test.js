'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-smoke-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3299',PROFILE_FILE:profileFile},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3299,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<40;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const meta=await req('GET','/api/meta');if(meta.cards.length!==315)throw Error(`bad card count ${meta.cards.length}`);if(meta.items.length<40)throw Error('items too small');if(meta.maxDungeonFloor!==50)throw Error('max floor not 50');if(Object.keys(meta.difficulties).length!==3)throw Error('difficulty count mismatch');
 const u={profileId:'smoke-user',nickname:'스모크'};const p=await req('POST','/api/profile',u);if(!p.profile||p.profile.ownedCount<8)throw Error('profile init failed');
 const cr=await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'hard',name:'스모크 하드'});const room=cr.room;if(room.difficulty!=='hard'||room.maxFloor!==50)throw Error('dungeon config failed');
 const st=await req('POST',`/api/room/${room.id}/start`,u);if(st.room.status!=='route'||st.room.floor!==1)throw Error('dungeon start failed');
 console.log(`SMOKE_OK cards=${meta.cards.length} items=${meta.items.length} floorCap=${meta.maxDungeonFloor} room=${room.id}`);
}catch(e){console.error('SMOKE_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
