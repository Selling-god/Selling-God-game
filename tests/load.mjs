/** Opt-in, local-only load smoke test; not a Render capacity guarantee. */
import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {WebSocket} from 'ws';
import {newCharacter} from '../server/game.js';
import {getStats} from '../shared/content.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'starfall-load-'));
const clients=[],ids=Array.from({length:24},()=>randomUUID()),port=3104;
for(let i=0;i<24;i++){
  const p=newCharacter(ids[i],'Load'+i,['guardian','ranger','mage'][i%3]);
  p.zone=['forest','ruins','citadel'][i%3];p.level=15;p.x=(p.zone==='forest'?30:28)*32+16;p.y=33*32+16;
  p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
  await fs.writeFile(path.join(dir,p.id+'.json'),JSON.stringify(p));
}
const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,PORT:String(port),NODE_ENV:'development',ALLOW_DEV_GUEST:'true',DEV_DATA_DIR:dir,MAX_PLAYERS:'24',SUPABASE_URL:'',SUPABASE_ANON_KEY:'',SUPABASE_SERVICE_ROLE_KEY:'',SUPABASE_PUBLISHABLE_KEY:'',SUPABASE_SECRET_KEY:''},stdio:['ignore','pipe','pipe']});
let log='';child.stdout.on('data',x=>log+=x);child.stderr.on('data',x=>log+=x);
try{
  for(let i=0;i<100;i++){try{if((await fetch(`http://127.0.0.1:${port}/health`)).ok)break;}catch{}await sleep(50);}
  for(const id of ids){
    const c={bytes:0,states:0,welcomed:false,errors:[],ws:new WebSocket(`ws://127.0.0.1:${port}/socket`)};
    c.ws.on('open',()=>c.ws.send(JSON.stringify({event:'auth',data:{devId:id}})));
    c.ws.on('message',raw=>{c.bytes+=raw.length;const m=JSON.parse(raw);if(m.event==='welcome')c.welcomed=true;if(m.event==='state')c.states++;if(m.event==='connect_error')c.errors.push(m.data);});
    clients.push(c);
  }
  for(let i=0;i<100&&!clients.every(c=>c.welcomed);i++)await sleep(50);
  if(!clients.every(c=>c.welcomed))throw new Error('Not all 24 clients connected');
  clients.forEach(c=>{c.bytes=0;c.states=0;c.wireStart=c.ws._socket.bytesRead;});
  const start=performance.now();let k=0;
  const timer=setInterval(()=>{
    k++;for(const c of clients)if(c.ws.readyState===WebSocket.OPEN){
      c.ws.send(JSON.stringify({event:'input',data:{x:Math.sin(k/10),y:Math.cos(k/10)}}));
      if(k%9===0)c.ws.send(JSON.stringify({event:'action',data:{type:'attack',skill:'basic',nonce:randomUUID()}}));
    }
  },100);
  await sleep(6000);clearInterval(timer);
  const seconds=(performance.now()-start)/1000,bytes=clients.reduce((n,c)=>n+c.bytes,0);
  const wireBytes=clients.reduce((n,c)=>n+(c.ws._socket.bytesRead-c.wireStart),0);
  const report={compressedWireBytes:wireBytes,approximateWireMiBPerPlayerHour:Number((wireBytes/seconds/24*3600/1048576).toFixed(1)),negotiatedCompression:clients.every(c=>c.ws.extensions.includes('permessage-deflate')),clients:24,seconds:Number(seconds.toFixed(2)),allConnected:clients.every(c=>c.ws.readyState===WebSocket.OPEN),errors:clients.flatMap(c=>c.errors),minimumStateUpdates:Math.min(...clients.map(c=>c.states)),maximumStateUpdates:Math.max(...clients.map(c=>c.states)),totalPayloadBytes:bytes,averageKiBPerSecondPerClient:Number((bytes/seconds/24/1024).toFixed(2)),approximateMiBPerPlayerHour:Number((bytes/seconds/24*3600/1048576).toFixed(1)),notes:'Local Linux Node smoke test. Wire estimate excludes TLS/TCP overhead and initial page assets; not a free Render capacity, uptime, bandwidth or latency guarantee.'};
  console.log(JSON.stringify(report,null,2));if(!report.allConnected||report.errors.length)process.exitCode=1;
}finally{
  clients.forEach(c=>c.ws.close());child.kill('SIGTERM');await Promise.race([new Promise(r=>child.once('exit',r)),sleep(6000)]);
  if(child.exitCode===null)child.kill('SIGKILL');await fs.rm(dir,{recursive:true,force:true});
}
