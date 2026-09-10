'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-multi-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3300',PROFILE_FILE:profileFile},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3300,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<40;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const users=['a','b','c','d'].map((id,i)=>({profileId:`multi-${id}`,nickname:`원정${i+1}`}));for(const u of users)await req('POST','/api/profile',u);
 let room=(await req('POST','/api/rooms/create',{...users[0],mode:'dungeon',difficulty:'hell',name:'4인 지옥 테스트'})).room;for(const u of users.slice(1))room=(await req('POST','/api/rooms/join',{...u,roomId:room.id})).room;if(room.players.length!==4)throw Error('four player join failed');if(room.difficulty!=='hell')throw Error('difficulty lost');
 room=(await req('POST',`/api/room/${room.id}/start`,users[0])).room;const nodeId=room.route[0].id;for(const u of users)room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId})).room;if(!['battle','reward','event'].includes(room.status))throw Error(`route resolve failed ${room.status}`);if(room.status==='battle'&&room.battle.party.length!==4)throw Error('battle party not four');
 console.log(`MULTI_OK room=${room.id} players=${room.players.length} difficulty=${room.difficulty} status=${room.status}`);
}catch(e){console.error('MULTI_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
