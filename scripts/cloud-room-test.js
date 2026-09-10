'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-roomcloud-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const roomRows=new Map();
function readBody(req){return new Promise((resolve,reject)=>{let s='';req.on('data',c=>s+=c);req.on('end',()=>{try{resolve(s?JSON.parse(s):{})}catch(e){reject(e)}});});}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json'});res.end(data==null?'':JSON.stringify(data));}
const mock=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://mock');
  if(u.pathname==='/rest/v1/rift_profiles'&&req.method==='GET')return send(res,200,[]);
  if(u.pathname==='/rest/v1/rift_profiles'&&req.method==='POST'){await readBody(req);return send(res,204,null);}
  if(u.pathname==='/rest/v1/rift_rooms'&&req.method==='GET')return send(res,200,[...roomRows.values()]);
  if(u.pathname==='/rest/v1/rift_rooms'&&req.method==='POST'){const rows=await readBody(req);for(const row of rows||[])roomRows.set(row.room_id,row);return send(res,204,null);}
  if(u.pathname==='/rest/v1/rift_rooms'&&req.method==='DELETE'){const id=u.searchParams.get('room_id')?.replace(/^eq\./,'');if(id)roomRows.delete(id);return send(res,204,null);}
  send(res,404,{message:'mock route not found'});
}catch(e){send(res,500,{message:e.message});}});
function request(method,p,b){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3304,path:p,method,headers:b?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=s?JSON.parse(s):{}}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);r.end(b?JSON.stringify(b):undefined);});}
function spawnRift(){return cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3304',PROFILE_FILE:profileFile,SUPABASE_URL:'http://127.0.0.1:4318',SUPABASE_SECRET_KEY:'sb_secret_mock'},stdio:['ignore','ignore','inherit']});}
async function ready(){for(let i=0;i<60;i++){try{return await request('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,80))}}throw Error('rift server not ready');}
async function stop(proc){if(!proc||proc.killed)return;proc.kill('SIGTERM');await Promise.race([new Promise(r=>proc.once('exit',r)),new Promise(r=>setTimeout(r,1000))]);}
(async()=>{let first,second;try{
  await new Promise(resolve=>mock.listen(4318,'127.0.0.1',resolve));
  first=spawnRift();await ready();const u={profileId:'resume-guest',nickname:'복구봇'};await request('POST','/api/profile',u);let room=(await request('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'hard',name:'복구 테스트'})).room;room=(await request('POST',`/api/room/${room.id}/start`,u)).room;if(room.floor!==1||room.status!=='route')throw Error('room did not start');const id=room.id;
  await new Promise(r=>setTimeout(r,650));if(!roomRows.has(id))throw Error('room snapshot was not written');await stop(first);first=null;
  second=spawnRift();await ready();const restored=(await request('GET',`/api/room/${id}`)).room;if(restored.id!==id||restored.floor!==1||restored.status!=='route'||restored.difficulty!=='hard')throw Error('restored room mismatch');
  console.log(`CLOUD_ROOM_OK room=${id} floor=${restored.floor} status=${restored.status} difficulty=${restored.difficulty}`);
}catch(e){console.error('CLOUD_ROOM_FAIL',e);process.exitCode=1}finally{await stop(first);await stop(second);mock.close();try{fs.unlinkSync(profileFile)}catch{}}})();
