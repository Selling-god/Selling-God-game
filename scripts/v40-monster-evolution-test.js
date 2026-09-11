'use strict';
const http=require('http'),cp=require('child_process'),path=require('path'),fs=require('fs'),os=require('os'),crypto=require('crypto');
const root=path.join(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data','catalog.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const monsters=[...catalog.enemies,...catalog.bosses];
if(monsters.length!==205)throw Error(`monster count ${monsters.length}`);
if(catalog.cards.length!==315||catalog.cards.some(c=>c.type!=='spell'))throw Error('v4 spell catalogue mismatch');
const genes=catalog.cards.filter(c=>c.cardClass==='gene');if(genes.length<150)throw Error(`gene spells ${genes.length}`);if(new Set(genes.map(c=>c.geneStyle)).size<5)throw Error('gene spell archetypes too few');
if(catalog.monsterParty?.maxSlots!==6||catalog.monsterParty?.pointBudget!==10)throw Error('monster point rules');
if(catalog.spellDeck?.min!==8||catalog.spellDeck?.max!==12)throw Error('spell rules');
if(Math.max(...monsters.map(m=>Number(m.pointCost||0)))<4)throw Error('strong monsters do not cost more points');
const formHashes=new Set();
for(const m of monsters){for(const key of ['sprite','evolutionSprite','resonanceSprite','riftSprite']){const rel=m[key];if(!rel)throw Error(`${m.id} missing ${key}`);const f=path.join(root,rel.replace(/^\//,''));if(!fs.existsSync(f))throw Error(`${m.id} missing file ${rel}`);if(key!=='sprite')formHashes.add(crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'));}}
if(formHashes.size<580)throw Error(`transformation visual diversity too low ${formHashes.size}/615`);
for(const r of catalog.relics){if(!r.art||!fs.existsSync(path.join(root,r.art.replace(/^\//,''))))throw Error(`relic art missing ${r.id}`);}
const relicHashes=new Set(catalog.relics.map(r=>crypto.createHash('sha1').update(fs.readFileSync(path.join(root,r.art.replace(/^\//,'')))).digest('hex')));if(relicHashes.size!==catalog.relics.length)throw Error('relic pixel art not unique');
const journeyOnlyRelics=catalog.relics.filter(r=>Array.isArray(r.modes)&&!r.modes.includes('dungeon'));if(!journeyOnlyRelics.length)throw Error('journey-only capture relics missing');
for(const token of ['renderExpeditionPrep','party-builder-v40','monster-actor-v40','monsterDisplaySprite','monsterAttackEventFx','enemyAttackEventFx','capture-cinematic-v34','COMMAND LINK'])if(!app.includes(token)&&!css.includes(token))throw Error(`client v4 token ${token}`);
for(const token of ['evolveMonster','fuseMonsters','switchMonster','monsterBurst','MONSTER_POINT_BUDGET','rewardRelicOptions'])if(!server.includes(token))throw Error(`server v4 token ${token}`);

const profileFile=path.join(os.tmpdir(),`riftdeck-v40-${process.pid}.json`);fs.writeFileSync(profileFile,'{}');
const proc=cp.spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3320',PROFILE_FILE:profileFile,TEST_MODE:'1'},stdio:['ignore','ignore','inherit']});
function req(method,p,body){return new Promise((resolve,reject)=>{const r=http.request({host:'127.0.0.1',port:3320,path:p,method,headers:body?{'Content-Type':'application/json'}:{}},res=>{let s='';res.on('data',c=>s+=c);res.on('end',()=>{let j;try{j=JSON.parse(s)}catch{j={raw:s}};if(res.statusCode>=400)return reject(new Error(j.error||`HTTP ${res.statusCode}`));resolve(j);});});r.on('error',reject);if(body)r.end(JSON.stringify(body));else r.end();});}
async function ready(){for(let i=0;i<50;i++){try{return await req('GET','/healthz')}catch{await new Promise(r=>setTimeout(r,100))}}throw Error('server not ready')}
async function toBattle(room,u){for(let n=0;n<20&&room.status!=='battle';n++){if(room.status==='route'){const node=room.route.find(x=>['combat','elite','boss'].includes(x.kind))||room.route[0];room=(await req('POST',`/api/room/${room.id}/vote`,{...u,nodeId:node.id})).room;}else if(room.status==='event'){room=(await req('POST',`/api/room/${room.id}/event`,{...u,choiceId:'safe'})).room;}else if(room.status==='reward'){const opts=room.reward.playerOptions?.[u.profileId]||[];if(opts.length&&!room.reward.claims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/reward`,{...u,rewardId:opts[0].id})).room;if(room.reward.relicOptions?.[u.profileId]?.length&&!room.reward.relicClaims?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/relic`,{...u,relicId:room.reward.relicOptions[u.profileId][0].id})).room;if(room.reward.camp&&!room.reward.campBy?.[u.profileId])room=(await req('POST',`/api/room/${room.id}/camp`,{...u,mode:'rest'})).room;room=(await req('POST',`/api/room/${room.id}/continue`,u)).room;}}
 return room;}
(async()=>{try{
  const hz=await ready();if(hz.version!=='4.1.0'||hz.monsters!==205)throw Error(`health ${hz.version}/${hz.monsters}`);
  const meta=await req('GET','/api/meta');if(meta.monsterRules.maxSlots!==6||meta.monsterRules.pointBudget!==10)throw Error('meta monster rules');
  const u={profileId:'v40-bot',nickname:'V40BOT'};let prof=(await req('POST','/api/profile',u)).profile;
  if(prof.monsterOwnedCount!==3)throw Error(`fresh starter monster count ${prof.monsterOwnedCount}`);
  const party=catalog.monsterParty.starterIds.slice(0,3);const load=(await req('POST','/api/loadout',{...u,monsterParty:party,deck:prof.deck})).profile;if(load.monsterParty.length!==3||load.monsterPartyCost!==3)throw Error('loadout save failed');
  let room=(await req('POST','/api/rooms/create',{...u,mode:'dungeon',difficulty:'normal'})).room;room=(await req('POST',`/api/room/${room.id}/start`,u)).room;room=await toBattle(room,u);if(room.status!=='battle')throw Error('battle not reached');
  let me=room.battle.party.find(x=>x.playerId===u.profileId);if(me.units.length!==1||me.bench.length!==2)throw Error(`single active/bench ${me.units.length}/${me.bench.length}`);if(me.hand.some(cid=>meta.cards.find(c=>c.id===cid)?.type!=='spell'))throw Error('non-spell in hand');
  // Standard evolution on the active monster.
  let a=me.units[0];room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:a.instanceId,level:3,gene:5})).room;room=(await req('POST',`/api/room/${room.id}/monster-evolve`,{...u,instanceId:a.instanceId,mode:'evolve'})).room;me=room.battle.party[0];a=[...me.units,...me.bench].find(x=>x.instanceId===a.instanceId);if(!a.evolved||!a.evolutionSprite)throw Error('standard evolution failed');
  // Resonance evolution may be prepared on a bench monster, matching the persistent party model.
  let b=me.bench[0];room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:b.instanceId,resonance:4})).room;room=(await req('POST',`/api/room/${room.id}/monster-evolve`,{...u,instanceId:b.instanceId,mode:'resonance'})).room;me=room.battle.party[0];b=[...me.units,...me.bench].find(x=>x.instanceId===b.instanceId);if(!(b.resonanceTurns>0)||!b.resonanceSprite)throw Error('resonance evolution failed');
  // Rift Bloom on the second bench monster.
  let c=me.bench[1];room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:c.instanceId,rift:3,hpRatio:.5})).room;room=(await req('POST',`/api/room/${room.id}/monster-evolve`,{...u,instanceId:c.instanceId,mode:'rift'})).room;me=room.battle.party[0];c=[...me.units,...me.bench].find(x=>x.instanceId===c.instanceId);if(!c.abyssBloom||!c.riftSprite)throw Error('rift bloom failed');
  // Fusion still consumes a partner.
  const primary=me.units[0],secondary=me.bench[0];room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:primary.instanceId,gene:2})).room;room=(await req('POST',`/api/room/${room.id}/debug-monster`,{...u,instanceId:secondary.instanceId,gene:2})).room;const beforeCount=room.battle.party[0].units.length+room.battle.party[0].bench.length;room=(await req('POST',`/api/room/${room.id}/monster-fuse`,{...u,primaryId:primary.instanceId,secondaryId:secondary.instanceId})).room;me=room.battle.party[0];const fused=[...me.units,...me.bench].find(x=>x.instanceId===primary.instanceId);if(!fused?.fused||!fused.secondaryElement||!fused.secondaryArchetype)throw Error('fusion failed');if(me.units.length+me.bench.length!==beforeCount-1)throw Error('fusion did not consume partner');
  // Switch the remaining bench monster into the single active slot.
  if(me.bench.length){const old=me.units[0].instanceId,benchId=me.bench[0].instanceId;room=(await req('POST',`/api/room/${room.id}/switch-monster`,{...u,activeId:old,benchId})).room;me=room.battle.party[0];if(!me.units.some(x=>x.instanceId===benchId))throw Error('single-active switch failed');}
  const stats=(await req('POST','/api/profile',u)).profile.stats;if(stats.evolutions<1||stats.resonanceEvolutions<1||stats.riftBlooms<1||stats.fusions<1)throw Error('transformation stats not persisted');
  console.log(`V40_MONSTER_EVOLUTION_OK monsters=${monsters.length} forms=${formHashes.size} spells=${catalog.cards.length} geneStyles=${new Set(genes.map(c=>c.geneStyle)).size} party=3-starter/single-active transforms=4 relicArt=${relicHashes.size}`);
}catch(e){console.error('V40_MONSTER_EVOLUTION_FAIL',e);process.exitCode=1}finally{proc.kill('SIGTERM');try{fs.unlinkSync(profileFile)}catch{}}})();
