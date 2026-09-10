'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os');
const root=path.join(__dirname,'..'),profileFile=path.join(os.tmpdir(),`riftdeck-fun-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3308',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3308,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<40;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
(async()=>{try{
 await ready();const meta=await req('GET','/api/meta');const by=Object.fromEntries(meta.cards.map(c=>[c.id,c]));const u={profileId:'fun-bot',nickname:'FUNBOT'};await req('POST','/api/profile',u);
 let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;
 for(let tries=0;tries<12&&room.status==='route';tries++){
   const node=room.route.find(n=>n.kind==='combat')||room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;
   if(room.status==='battle')break;
   if(room.status==='event'){room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:'safe'})).room;}
   if(room.status==='reward'){const o=room.reward.playerOptions[u.profileId]?.[0];if(o)room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:o.id})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;}
 }
 if(room.status!=='battle')throw Error('battle not reached');
 if(!room.battle.modifier)throw Error('battle modifier missing');
 const me=room.battle.party[0];let idx=-1,cid='';for(let i=0;i<me.hand.length;i++){const c=by[me.hand[i]];if(!c)continue;const cost=Math.max(0,c.cost-(me.buffs.anyDiscount>0?1:(c.type==='spell'&&me.buffs.spellDiscount>0?1:0)));if(cost<=me.energy&&!(c.type==='unit'&&me.units.length>=3)){idx=i;cid=c.id;break;}}
 if(idx<0)throw Error('no playable card');
 room=(await req('POST',`/api/room/${room.id}/play`,{...u,handIndex:idx,targetUid:room.battle.enemies.find(e=>e.hp>0)?.uid})).room;
 if(Number(room.runState[u.profileId].mastery?.[cid]||0)<1)throw Error('card mastery did not increase');
 room=(await req('POST',`/api/room/${room.id}/debug-win`,u)).room;
 if(room.status!=='reward')throw Error('debug win did not create reward');
 const opts=room.reward.playerOptions[u.profileId]||[];if(opts.length<3||opts.length>4)throw Error(`reward count ${opts.length}`);
 const cards=opts.filter(o=>o.type==='card');if(!cards.length||cards.some(o=>typeof o.synergy!=='number'))throw Error('synergy metadata missing');
 console.log(`FUN_LOOP_OK modifier=${room.battle?.modifier?.id||'resolved'} mastery=${room.runState[u.profileId].mastery[cid]} rewards=${opts.length} synergy=${cards.map(c=>c.synergy).join(',')}`);
}catch(e){console.error('FUN_LOOP_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
