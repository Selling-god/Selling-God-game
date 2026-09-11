from pathlib import Path
p=Path('/mnt/data/rift_v40_work/server.js')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'MISSING {label}')
    s=s.replace(old,new,1)

s=s.replace("const VERSION = '3.4.0';","const VERSION = '4.0.0';")
s=s.replace("const DEPLOY_ID = 'RIFT-V3.4.0-EXPEDITION-PARTY-20260911';","const DEPLOY_ID = 'RIFT-V4.0.0-MONSTER-EVOLUTION-20260911';")
rep("""const STARTER_POOL = CATALOG.starterPool;
const DECK_MIN = 8;
const DECK_MAX = 16;
const UNIT_DECK_MAX = 6;
const SPELL_DECK_MAX = 10;
""","""const STARTER_POOL = CATALOG.starterPool;
const DECK_MIN = Number(CATALOG.spellDeck?.min || 8);
const DECK_MAX = Number(CATALOG.spellDeck?.max || 12);
const SPELL_DECK_MAX = DECK_MAX;
const MONSTER_PARTY_MAX = Number(CATALOG.monsterParty?.maxSlots || 6);
const MONSTER_POINT_BUDGET = Number(CATALOG.monsterParty?.pointBudget || 10);
const MONSTERS = [...ENEMIES, ...BOSSES];
const MONSTER_BY_ID = Object.fromEntries(MONSTERS.map(m => [m.id, m]));
const STARTER_MONSTERS = (CATALOG.monsterParty?.starterIds || ENEMIES.filter(e => e.tier === 'common').slice(0, 4).map(e => e.id)).filter(id => MONSTER_BY_ID[id]);
""",'constants')

# Replace persistent deck normalization helpers and add monster helpers
start=s.index('function normalizePersistentDeck(')
end=s.index('function elementalMultiplier(', start)
new_helpers="""function normalizePersistentDeck(deck, collection = {}) {
  const seen = new Set(), out = [];
  const take = id => {
    const c = CARD_BY_ID[id];
    if (!c || c.type !== 'spell' || seen.has(id) || !collection[id]) return;
    seen.add(id); out.push(id);
  };
  for (const id of Array.isArray(deck) ? deck : []) take(id);
  for (const id of STARTER_POOL) if (out.length < DECK_MIN) take(id);
  for (const c of CARDS) if (out.length < DECK_MIN && c.type === 'spell' && collection[c.id]) take(c.id);
  return out.slice(0, DECK_MAX);
}
function monsterPointCost(idOrMonster) {
  const m = typeof idOrMonster === 'string' ? MONSTER_BY_ID[idOrMonster] : idOrMonster;
  return Math.max(1, Number(m?.pointCost || 1));
}
function monsterPartyCost(ids) { return (ids || []).reduce((sum, id) => sum + monsterPointCost(id), 0); }
function normalizeMonsterParty(party, owned = {}) {
  const out = [], seen = new Set(); let points = 0;
  const take = id => {
    const m = MONSTER_BY_ID[id]; if (!m || !owned[id] || seen.has(id) || out.length >= MONSTER_PARTY_MAX) return;
    const cost = monsterPointCost(m); if (points + cost > MONSTER_POINT_BUDGET) return;
    seen.add(id); out.push(id); points += cost;
  };
  for (const id of Array.isArray(party) ? party : []) take(id);
  for (const id of STARTER_MONSTERS) if (!out.length || out.length < 3) take(id);
  return out;
}
function publicMonster(m) {
  if (!m) return null;
  return {
    id:m.id,name:m.name,tier:m.tier,rarity:m.monsterRarity||m.tier,element:m.element,biome:m.biome,
    archetype:m.archetype||'beast',role:m.role||'striker',sprite:m.sprite,skill:m.skill,
    pointCost:monsterPointCost(m),captureBase:Number(m.captureBase||0.25),playerHp:Number(m.playerHp||m.hp||50),
    playerAtk:Number(m.playerAtk||m.atk||8),passive:clone(m.passive||{}),evolutionName:m.evolutionName||`${m.name} · 진화형`,
    resonanceName:m.resonanceName||`공명 ${m.name}`,abyssName:m.abyssName||`균열개화 ${m.name}`
  };
}
function createRunMonster(speciesId, index = 0) {
  const m = MONSTER_BY_ID[speciesId] || MONSTER_BY_ID[STARTER_MONSTERS[0]];
  const maxHp = Math.max(28, Number(m.playerHp || m.hp || 44));
  const power = Math.max(4, Number(m.playerAtk || m.atk || 7));
  const startBlock = m.archetype === 'insect' ? 8 : 0;
  return {
    instanceId: uid('mon'), speciesId:m.id, name:m.name, baseName:m.name, sprite:m.sprite, fusionSprite:null,
    element:m.element, secondaryElement:null, archetype:m.archetype||'beast', role:m.role||'striker', passive:clone(m.passive||{}),
    pointCost:monsterPointCost(m), level:1, xp:0, hp:maxHp, maxHp, power, block:startBlock, counter:0,
    gene:0, resonance:0, rift:0, evolved:false, fused:false, fusionWith:null, resonanceTurns:0, abyssBloom:false,
    revived:false, firstHitTaken:false, summonedTurn:0, slotOrder:index
  };
}
function allCombatMonsters(pc) { return [...(pc?.units||[]), ...(pc?.bench||[]), ...(pc?.ko||[])]; }
function findCombatMonster(pc, instanceId) { return allCombatMonsters(pc).find(m => m.instanceId === instanceId) || pc?.units?.[0] || null; }
function monsterFormLabel(u) {
  if (u?.fused) return 'FUSION';
  if (u?.abyssBloom) return 'RIFT BLOOM';
  if (Number(u?.resonanceTurns||0)>0) return 'RESONANCE';
  if (u?.evolved) return 'EVOLVED';
  return 'BASE';
}

"""
s=s[:start]+new_helpers+s[end:]

# Replace migrateProfile through profileView block
start=s.index('function migrateProfile(p) {')
end=s.index('function validDeck(deck) {', start)
profile_block="""function migrateProfile(p) {
  p.cloud = Boolean(p.cloud);
  p.accountId = p.accountId ? String(p.accountId) : '';
  p.gems = Number(p.gems ?? 2200);
  p.dust = Number(p.dust ?? 0);
  p.seals = p.seals || { basic: 15, silver: 6, royal: 1 };
  for (const k of ['basic', 'silver', 'royal']) p.seals[k] = Number(p.seals[k] || 0);
  p.pity = p.pity || { legendary: 0, mythic: 0 };
  p.collection = p.collection && typeof p.collection === 'object' ? p.collection : {};
  p.cardOrigins = p.cardOrigins && typeof p.cardOrigins === 'object' ? p.cardOrigins : {};
  for (const id of Object.keys(p.collection)) if (!CARD_BY_ID[id]) { delete p.collection[id]; delete p.cardOrigins[id]; }
  for (const cid of STARTER_POOL) {
    if (!p.collection[cid]) p.collection[cid] = 1;
    if (!p.cardOrigins[cid]) p.cardOrigins[cid] = 'starter';
  }
  for (const cid of Object.keys(p.collection)) if (!p.cardOrigins[cid]) p.cardOrigins[cid] = STARTER_POOL.includes(cid) ? 'starter' : 'legacy';

  p.monsters = p.monsters && typeof p.monsters === 'object' ? p.monsters : {};
  for (const id of Object.keys(p.monsters)) if (!MONSTER_BY_ID[id]) delete p.monsters[id];
  for (const mid of STARTER_MONSTERS) if (!p.monsters[mid]) p.monsters[mid] = 1;
  // Preserve veteran progress: legacy unit-card ownership unlocks a corresponding monster once.
  for (const [cid, count] of Object.entries(p.collection)) {
    const legacy = CARD_BY_ID[cid]?.legacyUnit;
    if (!legacy || !count) continue;
    const n = Math.max(0, Number(String(cid).replace(/\D/g,'')) - 1);
    const m = ENEMIES[n % ENEMIES.length];
    if (m && !p.monsters[m.id]) p.monsters[m.id] = 1;
  }
  p.monsterParty = normalizeMonsterParty(p.monsterParty, p.monsters);
  p.deck = normalizePersistentDeck(p.deck, p.collection);

  p.stats = p.stats || {};
  const defaults = {
    journeys:0,dungeons:0,dungeonClears:0,bosses:0,cardsCaught:0,monstersCaught:0,bestDungeonFloor:0,bestJourneyFloor:0,gachaPulls:0,
    journeyUnlocks:0,dungeonCardsPlayed:0,normalClears:0,hardClears:0,hellClears:0,bestNormalFloor:0,bestHardFloor:0,bestHellFloor:0,
    loginCount:0,lastLoginAt:0,perfectBattles:0,bestChain:0,overdrives:0,evolutions:0,fusions:0,resonanceEvolutions:0,riftBlooms:0
  };
  for (const [k,v] of Object.entries(defaults)) if (p.stats[k] == null) p.stats[k]=v;
  p.history = Array.isArray(p.history) ? p.history.filter(x => x && typeof x === 'object').slice(0,20) : [];
  return p;
}

function ensureProfile(profileId, nickname) {
  let p = profiles[profileId];
  if (!p) {
    p = profiles[profileId] = {
      id:profileId,nickname:sanitizeName(nickname),createdAt:Date.now(),lastSeenAt:Date.now(),gems:2200,dust:0,
      seals:{basic:15,silver:6,royal:1},pity:{legendary:0,mythic:0},collection:{},cardOrigins:{},deck:STARTER_POOL.slice(0,DECK_MIN),
      monsters:{},monsterParty:STARTER_MONSTERS.slice(0,3),stats:{},history:[],cloud:false,accountId:''
    };
  }
  migrateProfile(p); p.nickname=sanitizeName(nickname||p.nickname); p.lastSeenAt=Date.now(); return p;
}

function addCardToProfile(p, cardId, count = 1, save = true, origin = 'legacy') {
  const c = CARD_BY_ID[cardId]; if (!c) return;
  p.cardOrigins ||= {}; const old=Number(p.collection[cardId]||0); p.collection[cardId]=old+count;
  if(old===0)p.cardOrigins[cardId]=origin||'legacy'; if(old>0)p.dust+=Number(RARITY[c.rarity]?.dust||0)*count; if(save)saveProfiles();
}
function addMonsterToProfile(p, monsterId, count = 1, save = true) {
  const m=MONSTER_BY_ID[monsterId]; if(!m)return false; p.monsters ||= {}; const wasNew=!p.monsters[monsterId]; p.monsters[monsterId]=Number(p.monsters[monsterId]||0)+count;
  if(wasNew && p.monsterParty.length<3 && monsterPartyCost([...p.monsterParty,monsterId])<=MONSTER_POINT_BUDGET)p.monsterParty.push(monsterId);
  if(save)saveProfiles(); return wasNew;
}
function profileView(p) {
  return { id:p.id,nickname:p.nickname,gems:p.gems,dust:p.dust,seals:p.seals,pity:p.pity,collection:p.collection,cardOrigins:p.cardOrigins||{},deck:p.deck,
    monsters:p.monsters||{},monsterParty:p.monsterParty||[],monsterPartyCost:monsterPartyCost(p.monsterParty||[]),monsterPointBudget:MONSTER_POINT_BUDGET,
    stats:p.stats,history:p.history||[],ownedCount:Object.keys(p.collection).length,totalCards:CARDS.length,monsterOwnedCount:Object.keys(p.monsters||{}).length,
    totalMonsters:MONSTERS.length,cloud:Boolean(p.cloud),accountId:p.accountId||'' };
}

"""
s=s[:start]+profile_block+s[end:]

# Replace validDeck and newRunPlayer
start=s.index('function validDeck(deck) {')
end=s.index('function itemStacks(', start)
run_block="""function validDeck(deck) {
  const d=[...new Set((Array.isArray(deck)?deck:[]).filter(x=>CARD_BY_ID[x]?.type==='spell'))];
  const base=d.length>=DECK_MIN?d:STARTER_POOL.filter(id=>CARD_BY_ID[id]?.type==='spell').slice(0,DECK_MIN);
  const out=[]; while(out.length<12&&base.length)out.push(base[out.length%base.length]); return out.slice(0,24);
}
function newRunPlayer(p) {
  const party=normalizeMonsterParty(p.monsterParty,p.monsters);
  return { playerId:p.id,nickname:p.nickname,maxHp:100,hp:100,runDeck:validDeck(p.deck),monsterParty:party,
    monsters:party.map((id,i)=>createRunMonster(id,i)),relics:[],items:{},upgrades:{},mastery:{},mods:{},fragments:0,gold:180,cardsAdded:0,itemsAdded:0,
    revivesUsed:0,rewardRerolls:0,removals:0,contract:null };
}

"""
s=s[:start]+run_block+s[end:]

# Replace makeCombatant
start=s.index('function makeCombatant(run, index) {')
end=s.index('function makeRoom(', start)
combatant="""function makeCombatant(run, index) {
  const relicEnergy=run.relics.includes('r004')?1:0, relicHpPenalty=run.relics.includes('r004')?8:0;
  const maxEnergy=3+relicEnergy+Math.floor(modTotal(run,'maxEnergy')), maxHp=Math.max(55,run.maxHp-relicHpPenalty), handLimit=10+Math.floor(modTotal(run,'handLimit'));
  const roster=(run.monsters?.length?run.monsters:(run.monsterParty||[]).map((id,i)=>createRunMonster(id,i))).map(clone);
  const active=roster.filter(m=>m.hp>0).slice(0,3), bench=roster.filter(m=>m.hp>0).slice(3), ko=roster.filter(m=>m.hp<=0);
  const pc={ playerId:run.playerId,nickname:run.nickname,index,maxHp,hp:Math.min(run.hp,maxHp),block:Math.floor(modTotal(run,'startBlock'))+(run.relics.includes('r006')?10:0),
    energy:maxEnergy+Math.floor(modTotal(run,'firstTurnEnergy')),maxEnergy,handLimit,drawPile:shuffle(run.runDeck),discard:[],exhaust:[],hand:[],units:active,bench,ko,
    ended:false,down:false,weak:0,upgrades:{...(run.upgrades||{})},itemMods:{unitPower:modTotal(run,'unitPower'),spellPower:modTotal(run,'spellPower'),damagePct:modTotal(run,'damagePct'),bossDamagePct:modTotal(run,'bossDamagePct'),blockPct:modTotal(run,'blockPct'),healPct:modTotal(run,'healPct'),damageReduction:Math.min(.55,modTotal(run,'damageReduction')),retainBlock:Math.min(.75,modTotal(run,'retainBlock')),thorns:modTotal(run,'thorns')},
    buffs:{nextAttack:run.relics.includes('r001')?4:0,spellDiscount:0,anyDiscount:Math.floor(modTotal(run,'startDiscount')),debuffImmune:false,thorns:modTotal(run,'thorns'),nextUnitBlock:0,teamSpellCount:0,energyDebt:0},
    relics:run.relics.slice(),chain:{count:0,lastType:null,best:0,overdrives:0},recallsUsed:0,switchesUsed:0,stats:{cardsPlayed:0,damage:0,healing:0,hpDamageTaken:0,monsterDamageTaken:0} };
  drawCards(pc,5+Math.floor(modTotal(run,'drawBonus'))+(run.relics.includes('r007')?1:0)); return pc;
}

"""
s=s[:start]+combatant+s[end:]

# Inject monster battle helper functions before playCard
anchor='function playCard(room, playerId, handIndex, targetUid) {'
idx=s.index(anchor)
monster_battle="""function monsterLevelGain(room, pc, u, amount = 1) {
  if(!u)return; u.xp=Number(u.xp||0)+amount; const need=2+Number(u.level||1)*2;
  if(u.xp>=need && u.level<12){u.xp-=need;u.level++;const oldMax=u.maxHp;u.maxHp=Math.round(u.maxHp*1.08+2);u.power=Math.round(u.power*1.08+1);u.hp=Math.min(u.maxHp,u.hp+(u.maxHp-oldMax)+4);battleLog(room,`${u.name} Lv.${u.level}!`);pushRoomEvent(room,'monster-level',`${u.name} 레벨 업!`,{playerId:pc.playerId,instanceId:u.instanceId,level:u.level});}
}
function monsterDamage(room, pc, u, amount, source=null){
  let d=Math.max(0,Math.round(amount)); if(!u)return 0;
  if(pc.block>0){const x=Math.min(pc.block,d);pc.block-=x;d-=x;}
  if(u.block>0){const x=Math.min(u.block,d);u.block-=x;d-=x;}
  if(u.archetype==='golem')d=Math.round(d*.90); if(u.archetype==='wing'&&!u.firstHitTaken){d=Math.round(d*.80);u.firstHitTaken=true;}
  const before=u.hp;u.hp=clamp(u.hp-d,0,u.maxHp);const dealt=before-u.hp;pc.stats.monsterDamageTaken+=dealt;
  if(dealt>0)u.rift=clamp(Number(u.rift||0)+Math.max(1,Math.ceil(dealt/18)),0,5);
  let revived=false;
  if(u.hp<=0&&u.archetype==='phoenix'&&!u.revived){u.revived=true;u.hp=Math.max(1,Math.round(u.maxHp*.25));revived=true;}
  if(!revived&&u.hp<=0){
    const pos=pc.units.findIndex(x=>x.instanceId===u.instanceId); if(pos>=0)pc.units.splice(pos,1); pc.ko.push(u); pc.hp=Math.max(1,pc.hp-Math.max(4,Math.round(pc.maxHp*.06)));
    if(pc.bench.length){const next=pc.bench.shift();next.block=Math.max(next.block||0,4);pc.units.splice(Math.min(pos<0?pc.units.length:pos,pc.units.length),0,next);pushRoomEvent(room,'monster-switch',`${next.name} 자동 출전!`,{playerId:pc.playerId,instanceId:next.instanceId,auto:true});}
    if(!pc.units.length&&!pc.bench.length){pc.down=true;pc.ended=true;}
  }
  pushRoomEvent(room,'monster-hit',`${u.name} ${dealt} 피해`,{playerId:pc.playerId,instanceId:u.instanceId,damage:dealt,ko:u.hp<=0&&!revived,revived});
  return dealt;
}
function evolveMonster(room, playerId, instanceId, mode='evolve'){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 진화할 수 없습니다.');const u=findCombatMonster(pc,instanceId);if(!u)throw new Error('몬스터를 찾을 수 없습니다.');
  const prof=profiles[playerId];
  if(mode==='evolve'){
    if(u.evolved)throw new Error('이미 진화했습니다.');if(u.level<3||u.gene<3)throw new Error('진화에는 Lv.3 + GENE 3이 필요합니다.');u.gene-=3;u.evolved=true;u.maxHp=Math.round(u.maxHp*1.28);u.hp=Math.min(u.maxHp,Math.round(u.hp*1.28+8));u.power=Math.round(u.power*1.25+2);u.name=MONSTER_BY_ID[u.speciesId]?.evolutionName||`${u.baseName} · 진화형`;prof.stats.evolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 진화!`,{playerId,instanceId:u.instanceId,mode:'evolve'});
  }else if(mode==='resonance'){
    if(u.resonance<4)throw new Error('공명진화에는 RES 4가 필요합니다.');u.resonance-=4;u.resonanceTurns=3;prof.stats.resonanceEvolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 공명진화!`,{playerId,instanceId:u.instanceId,mode:'resonance'});
  }else if(mode==='rift'){
    if(u.rift<3||u.hp/u.maxHp>.60)throw new Error('균열개화에는 HP 60% 이하 + RIFT 3이 필요합니다.');u.rift-=3;u.abyssBloom=true;prof.stats.riftBlooms++;pushRoomEvent(room,'monster-evolve',`${u.name} 균열개화!`,{playerId,instanceId:u.instanceId,mode:'rift'});
  }else throw new Error('알 수 없는 진화 방식입니다.');
  saveProfiles();return u;
}
function fuseMonsters(room,playerId,primaryId,secondaryId){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 융합할 수 없습니다.');
  const a=findCombatMonster(pc,primaryId),b=findCombatMonster(pc,secondaryId);if(!a||!b||a.instanceId===b.instanceId)throw new Error('서로 다른 몬스터 2마리를 선택하세요.');if(a.gene<2||b.gene<2)throw new Error('융합하려면 두 몬스터 모두 GENE 2가 필요합니다.');
  const ratioA=a.maxHp?Math.max(.05,a.hp/a.maxHp):1,ratioB=b.maxHp?Math.max(.05,b.hp/b.maxHp):1;a.gene=Math.max(0,a.gene-2);b.gene=Math.max(0,b.gene-2);
  a.fused=true;a.fusionWith=b.speciesId;a.fusionSprite=b.sprite;a.secondaryElement=b.element;a.name=`${a.baseName} × ${b.baseName}`;a.maxHp=Math.round((a.maxHp+b.maxHp)*.76);a.hp=Math.round(a.maxHp*((ratioA+ratioB)/2));a.power=Math.round((a.power+b.power)*.72+3);a.pointCost=Math.min(10,Number(a.pointCost||1)+Number(b.pointCost||1));a.resonance=Math.max(a.resonance,b.resonance);a.rift=Math.max(a.rift,b.rift);
  for(const arr of [pc.units,pc.bench,pc.ko]){const i=arr.findIndex(x=>x.instanceId===b.instanceId);if(i>=0)arr.splice(i,1);} profiles[playerId].stats.fusions++;saveProfiles();pushRoomEvent(room,'monster-fuse',`${a.name} 융합 완성!`,{playerId,instanceId:a.instanceId,secondaryId:b.instanceId});return a;
}
function switchMonster(room,playerId,activeId,benchId){
  const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended||room.battle?.phase!=='players')throw new Error('지금은 교대할 수 없습니다.');if(pc.switchesUsed>=1)throw new Error('몬스터 교대는 턴당 1회입니다.');
  const ai=pc.units.findIndex(x=>x.instanceId===activeId),bi=pc.bench.findIndex(x=>x.instanceId===benchId);if(ai<0||bi<0)throw new Error('교대 대상을 찾을 수 없습니다.');const a=pc.units[ai],b=pc.bench[bi];pc.units[ai]=b;pc.bench[bi]=a;pc.switchesUsed++;pushRoomEvent(room,'monster-switch',`${a.name} ↔ ${b.name}`,{playerId,activeId,benchId});return b;
}

"""
s=s[:idx]+monster_battle+s[idx:]

# Replace playCard function only, preserve summonUnit/recall after it
start=s.index('function playCard(room, playerId, handIndex, targetUid) {')
end=s.index('function summonUnit(', start)
play="""function playCard(room, playerId, handIndex, targetUid, targetMonsterId) {
  const b=room.battle;if(room.status!=='battle'||!b||b.phase!=='players')throw new Error('카드를 사용할 차례가 아닙니다.');const pc=getPc(room,playerId);if(!pc||pc.down||pc.ended)throw new Error('행동할 수 없습니다.');
  const index=Number(handIndex),cid=pc.hand[index],base=CARD_BY_ID[cid],run=room.runState[playerId],c=effectiveRunCard(run,base);if(!c||c.type!=='spell')throw new Error('스펠 카드가 없습니다.');
  const previewCost=Math.max(0,c.cost-(pc.buffs.anyDiscount>0?1:(pc.buffs.spellDiscount>0?1:0)));if(pc.energy<previewCost)throw new Error('에너지가 부족합니다.');const cost=resolveCost(pc,c);pc.energy-=cost;pc.hand.splice(index,1);pc.stats.cardsPlayed++;
  const target=aliveEnemies(room).find(e=>e.uid===targetUid)||aliveEnemies(room)[0];const monster=findCombatMonster(pc,targetMonsterId)||pc.units[0];castSpell(room,pc,c,target,monster);pc.discard.push(cid);const masteryResult=gainCardMastery(room,run,cid);
  if(monster){monsterLevelGain(room,pc,monster,1);if(c.element===monster.element){const extra=monster.archetype==='spirit'&&Math.random()<.35?2:1;monster.resonance=clamp(Number(monster.resonance||0)+extra,0,6);}if(c.cardClass==='gene')monster.gene=clamp(Number(monster.gene||0),0,8);}
  if(b.modifier?.everyThirdDraw&&pc.stats.cardsPlayed%3===0){drawCards(pc,b.modifier.everyThirdDraw);battleLog(room,`${b.modifier.name}: 카드 1장을 추가로 드로우했습니다.`);}
  const chainResult=updateTacticalChain(room,pc,c),phaseShifts=updateBossPhase(room),breakTargets=b.enemies.filter(e=>e.justBroken&&e.hp>0);for(const e of b.enemies)e.justBroken=false;if(checkBattleEnd(room))return;
  pushRoomEvent(room,'card',`${pc.nickname}: ${c.name}`,{playerId:pc.playerId,cardId:c.id,cardName:c.name,cardType:c.type,cardClass:c.cardClass,element:c.element,targetUid:target?.uid||null,targetMonsterId:monster?.instanceId||null,cost,chainCount:chainResult.displayCount,chainStage:chainResult.stage,upgradeLevel:Number(run.upgrades?.[c.id]||0),masteryXp:masteryResult?.xp||0});
  if(masteryResult&&masteryResult.level>Number(c.upgradeLevel||0))pushRoomEvent(room,'mastery',`${masteryResult.name} 성장!`,{playerId:pc.playerId,cardId:c.id,level:masteryResult.level,xp:masteryResult.xp});for(const e of breakTargets)pushRoomEvent(room,'enemy-break',`${e.name}의 균열 자세 붕괴!`,{enemyUid:e.uid,enemyName:e.name});if(chainResult.stage)pushRoomEvent(room,'chain',`${pc.nickname} ${chainResult.stage==='overdrive'?'오버드라이브':'전술 연쇄'} 발동!`,{playerId:pc.playerId,stage:chainResult.stage,count:chainResult.displayCount});for(const e of phaseShifts)pushRoomEvent(room,'boss-phase',`${e.name} 2단계!`,{enemyUid:e.uid,enemyName:e.name,phase:2});
}

"""
s=s[:start]+play+s[end:]

# Replace castSpell with targetMonster support
start=s.index('function castSpell(room, pc, c, target) {')
end=s.index('function updateTacticalChain(',start)
cast="""function castSpell(room, pc, c, target, targetMonster=null) {
  room.battle.teamSpellCount++; applyEffects(room,pc,c.effects,target,c,targetMonster);
  for(const ally of room.battle.party.filter(x=>!x.down))for(const u of ally.units){if(u.archetype==='drone'&&c.element===u.element)u.power+=1;if(u.archetype==='spirit'&&c.element===u.element)u.resonance=clamp(Number(u.resonance||0)+1,0,6);}
  battleLog(room,`${pc.nickname}이(가) ${c.name} 사용${targetMonster?` → ${targetMonster.name}`:''}.`);
}

"""
s=s[:start]+cast+s[end:]

# Replace applyEffects signature/body by adding targetMonster handling while retaining existing ops
start=s.index('function applyEffects(room, pc, effects, target, source) {')
end=s.index('function applyDamage(',start)
old=s[start:end]
new=old.replace('function applyEffects(room, pc, effects, target, source) {','function applyEffects(room, pc, effects, target, source, targetMonster=null) {')
new=new.replace("else if (fx.op === 'block') pc.block += modifiedBlock(pc, v);","else if (fx.op === 'block') { const val=modifiedBlock(pc,v); if(targetMonster) targetMonster.block+=val; else pc.block+=val; }")
new=new.replace("else if (fx.op === 'heal') { const before = pc.hp; pc.hp = clamp(pc.hp + modifiedHeal(pc, v), 0, pc.maxHp); pc.stats.healing += pc.hp - before; }","else if (fx.op === 'heal') { const val=modifiedHeal(pc,v); if(targetMonster){const before=targetMonster.hp;targetMonster.hp=clamp(targetMonster.hp+val,0,targetMonster.maxHp);pc.stats.healing+=targetMonster.hp-before;}else{const before=pc.hp;pc.hp=clamp(pc.hp+val,0,pc.maxHp);pc.stats.healing+=pc.hp-before;} }")
# inject new ops before final energyDebt branch
needle="    else if (fx.op === 'energyDebt') pc.buffs.energyDebt += v;\n"
insert="""    else if (fx.op === 'monsterBoost' && targetMonster) targetMonster.power += Math.max(1,Math.round(v*(1+Number(pc.itemMods.unitPower||0)*.02)));
    else if (fx.op === 'monsterShield' && targetMonster) targetMonster.block += modifiedBlock(pc,v);
    else if (fx.op === 'monsterHeal' && targetMonster) targetMonster.hp = clamp(targetMonster.hp + modifiedHeal(pc,v), 0, targetMonster.maxHp);
    else if (fx.op === 'geneCharge' && targetMonster) targetMonster.gene = clamp(Number(targetMonster.gene||0)+v,0,8);
    else if (fx.op === 'resonanceCharge' && targetMonster) targetMonster.resonance = clamp(Number(targetMonster.resonance||0)+v,0,6);
    else if (fx.op === 'riftCharge' && targetMonster) targetMonster.rift = clamp(Number(targetMonster.rift||0)+v,0,5);
    else if (fx.op === 'energyDebt') pc.buffs.energyDebt += v;
"""
if needle not in new: raise SystemExit('applyEffects insert needle missing')
new=new.replace(needle,insert,1)
s=s[:start]+new+s[end:]

# Replace enemyTurn with monster-centric version
start=s.index('function enemyTurn(room) {')
end=s.index('function checkBattleEnd(room) {',start)
enemy_turn="""function enemyTurn(room) {
  const b=room.battle;b.phase='enemies';
  // Active monsters attack first. Cards are commands/enhancements; monsters are the actual party.
  for(const pc of b.party.filter(x=>!x.down)){
    for(const u of [...pc.units]){
      let target=aliveEnemies(room)[0];if(!target)break;u.counter=Number(u.counter||0)+1;let power=Number(u.power||1);
      if(u.archetype==='beast'&&u.hp/u.maxHp>=.5)power*=1.15;if(u.archetype==='assassin'&&u.counter===1)power*=1.45;if(u.archetype==='knight'&&u.block>0)power*=1.10;if(u.archetype==='tyrant')u.power+=1;
      if(u.resonanceTurns>0)power*=1.35;if(u.abyssBloom)power*=1.40;if(pc.relics.includes('r005')&&b.tier==='boss')power+=4;power=modifiedDamage(room,pc,power,{type:'monster',element:u.element});
      let dealt=applyElementDamage(target,power,u.element);if(u.secondaryElement){const alt=Math.round(power*elementalMultiplier(u.secondaryElement,target.element));if(alt>dealt){target.hp=clamp(target.hp-(alt-dealt),0,target.maxHp);dealt=alt;}}
      pc.stats.damage+=dealt;monsterLevelGain(room,pc,u,1);if(u.archetype==='wraith'||u.abyssBloom)u.hp=clamp(u.hp+Math.max(1,Math.round(dealt*(u.abyssBloom?.20:.08))),0,u.maxHp);if(u.archetype==='serpent'&&Math.random()<.25)target.debuffs.weak++;if(u.archetype==='mushroom'&&u.counter%3===0)aliveEnemies(room).forEach(e=>{if(e!==target)applyDamage(e,2)});if(u.archetype==='leviathan')aliveEnemies(room).filter(e=>e!==target).forEach(e=>applyElementDamage(e,Math.round(power*.25),u.element));
      battleLog(room,`${u.name} → ${target.name} ${dealt} 피해.`);pushRoomEvent(room,'monster-attack',`${u.name} 공격!`,{playerId:pc.playerId,instanceId:u.instanceId,targetUid:target.uid,element:u.element,archetype:u.archetype,damage:dealt,form:monsterFormLabel(u)});const phases=updateBossPhase(room);for(const pe of phases)pushRoomEvent(room,'boss-phase',`${pe.name} 2단계!`,{enemyUid:pe.uid,enemyName:pe.name,phase:2});if(checkBattleEnd(room))return;
    }
  }
  for(const e of aliveEnemies(room)){
    e.counter++;if(e.debuffs.burn>0){const d=applyDamage(e,e.debuffs.burn);e.debuffs.burn=Math.max(0,e.debuffs.burn-1);battleLog(room,`${e.name} 화상 ${d}.`);if(e.hp<=0){if(checkBattleEnd(room))return;continue;}}
    if(e.broken>0){e.broken=0;e.stagger=0;e.debuffs.vulnerable=Math.max(Number(e.debuffs.vulnerable||0),1);battleLog(room,`${e.name} BREAK — 행동 불가.`);e.intent=rollIntent(e,b.tier,room.difficulty);continue;}
    if(e.debuffs.intentSeal>0){e.debuffs.intentSeal--;battleLog(room,`${e.name} 행동 봉인.`);e.intent=rollIntent(e,b.tier,room.difficulty);continue;}
    const targets=b.party.filter(x=>!x.down);if(!targets.length)break;const t=choose(targets);
    if(['attack','heavy'].includes(e.intent.type)){
      let amount=e.intent.value;if(e.debuffs.weak>0)amount=Math.round(amount*.75);if(e.nextDamageHalf){amount=Math.round(amount*.5);e.nextDamageHalf=false;}
      const mon=t.units.length?choose(t.units):null;let d=0;if(mon)d=monsterDamage(room,t,mon,amount,e);else d=damagePc(room,t,amount,e);battleLog(room,`${e.name} → ${mon?mon.name:t.nickname} ${d} 피해.`);pushRoomEvent(room,'enemy-attack',`${e.name} 공격`,{enemyUid:e.uid,playerId:t.playerId,targetMonsterId:mon?.instanceId||null,damage:d,style:e.archetype||'beast',heavy:e.intent.type==='heavy'});
    }else if(e.intent.type==='guard'){e.block+=e.intent.value;battleLog(room,`${e.name} 방어 ${e.intent.value}.`);}else if(e.intent.type==='debuff'){if(!t.buffs.debuffImmune){t.weak++;battleLog(room,`${t.nickname} 약화 1.`);}}
    e.debuffs.vulnerable=Math.max(0,e.debuffs.vulnerable-1);e.debuffs.weak=Math.max(0,e.debuffs.weak-1);if(e.staggerMax&&!e.broken)e.stagger=Math.max(0,Number(e.stagger||0)-Math.ceil(e.staggerMax*.28));e.intent=rollIntent(e,b.tier,room.difficulty);
  }
  if(checkBattleEnd(room))return;if(b.party.every(x=>x.down))return loseBattle(room);b.turn++;
  for(const pc of b.party){if(pc.down)continue;pc.block=Math.round(pc.block*Number(pc.itemMods.retainBlock||0));pc.energy=Math.max(1,pc.maxEnergy-(pc.buffs.energyDebt>0?1:0));pc.buffs.energyDebt=Math.max(0,pc.buffs.energyDebt-1);pc.ended=false;pc.recallsUsed=0;pc.switchesUsed=0;pc.buffs.debuffImmune=false;pc.buffs.thorns=Math.max(pc.buffs.thorns,Number(pc.itemMods.thorns||0));pc.chain||={count:0,lastType:null,best:0,overdrives:0};pc.chain.count=0;pc.chain.lastType=null;pc.weak=Math.max(0,pc.weak-1);pc.discard.push(...pc.hand);pc.hand=[];drawCards(pc,5);
    for(const u of pc.units){if(u.resonanceTurns>0)u.resonanceTurns--;if(u.abyssBloom)u.hp=Math.max(1,u.hp-Math.max(1,Math.round(u.maxHp*.05)));if(u.archetype==='slime')u.hp=clamp(u.hp+Math.max(1,Math.round(u.maxHp*.03)),0,u.maxHp);}
    const priests=pc.units.filter(u=>u.archetype==='priest').length;if(priests){const all=[...pc.units,...pc.bench].filter(u=>u.hp>0).sort((a,z)=>a.hp/a.maxHp-z.hp/z.maxHp);if(all[0])all[0].hp=clamp(all[0].hp+3*priests,0,all[0].maxHp);}
  }
  b.phase='players';pushRoomEvent(room,'turn',`턴 ${b.turn} 시작.`);
}

"""
s=s[:start]+enemy_turn+s[end:]

# Replace syncRunHealth with monster sync
start=s.index('function syncRunHealth(room) {')
end=s.index('\nfunction ',start+20)
sync="""function syncRunHealth(room) {
  if(!room.battle)return;
  for(const pc of room.battle.party){const run=room.runState[pc.playerId];if(!run)continue;run.hp=pc.hp<=0?Math.max(1,Math.round(run.maxHp*.20)):Math.min(run.maxHp,pc.hp);const merged=allCombatMonsters(pc);run.monsters=merged.map(clone);}
}
"""
s=s[:start]+sync+s[end:]

# Replace capture encounter and attempt/pass functions
start=s.index('function makeCaptureEncounter(')
end=s.index('function salvageReward(',start)
capture_enc="""function makeCaptureEncounter(floor,tier,room){
  const profile=profiles[room.players?.[0]?.id], defeated=(room.battle?.enemies||[]).map(e=>MONSTER_BY_ID[e.id]).filter(Boolean);let pool=defeated.length?defeated:ENEMIES.filter(e=>e.biome===currentBiome(room).id);
  if(process.env.TEST_MODE==='1'&&profile){pool=[pool.find(m=>!profile.monsters?.[m.id])||pool[0]];}
  const m=weighted(pool,x=>{let w=x.tier==='ultra'?0.45:x.tier==='rare'?1.3:2.4;if(profile&&!profile.monsters?.[x.id])w*=2.8;if(tier==='elite'&&x.tier==='ultra')w*=2.4;if(tier==='boss'&&x.tier==='boss')w*=4;return w;})||pool[0];
  return {id:uid('wild'),monsterId:m.id,monster:publicMonster(m),attemptedBy:[],escaped:false,caughtBy:null,newDiscovery:profile?!profile.monsters?.[m.id]:true,source:'journey'};
}

"""
s=s[:start]+capture_enc+s[end:]
start=s.index('function attemptCapture(')
end=s.index('function rarityRoll(',start)
capture_funcs="""function attemptCapture(room,playerId,sealType){
  if(room.mode!=='journey'||room.status!=='reward'||!room.capture||room.capture.escaped)throw new Error('봉인할 야생 몬스터가 없습니다.');const cap=room.capture;if(cap.attemptedBy.includes(playerId))throw new Error('이미 봉인을 시도했습니다.');const p=profiles[playerId],run=room.runState[playerId],seal=String(sealType||'basic'),mult={basic:1,silver:1.8,royal:3.5}[seal];if(!mult)throw new Error('봉인구 종류 오류');if((p.seals[seal]||0)<=0)throw new Error('봉인구가 없습니다.');p.seals[seal]--;cap.attemptedBy.push(playerId);const m=MONSTER_BY_ID[cap.monsterId];let chance=Number(m.captureBase||.25)*mult;if(run?.relics.includes('r003'))chance+=.08;chance+=modTotal(run,'captureBonus');const hardCap=m.tier==='boss'?.28:m.tier==='ultra'?.62:m.tier==='rare'?.88:.97;chance=Math.min(hardCap,chance);const success=process.env.TEST_MODE==='1'?true:Math.random()<chance;
  if(success){const wasNew=addMonsterToProfile(p,m.id,1,false);p.stats.monstersCaught=Number(p.stats.monstersCaught||0)+1;p.stats.cardsCaught=Number(p.stats.cardsCaught||0)+1;if(wasNew)p.stats.journeyUnlocks=Number(p.stats.journeyUnlocks||0)+1;cap.caughtBy=playerId;cap.escaped=true;saveProfiles();pushRoomEvent(room,'capture',`${m.name} 봉인 성공!`,{monsterId:m.id});}
  else{const escapeReduction=modTotal(run,'captureEscapeReduction'),escapeChance=Math.max(.10,.38-escapeReduction);if(Math.random()<escapeChance)cap.escaped=true;saveProfiles();pushRoomEvent(room,'capture-fail',cap.escaped?`${m.name}이(가) 달아났습니다.`:`${m.name} 봉인 실패. 아직 전장에 남아 있습니다.`,{monsterId:m.id});}
  return {success,chance,escaped:cap.escaped,monster:publicMonster(m),newDiscovery:!p.monsters?.[m.id]?true:cap.newDiscovery};
}
function passCapture(room,playerId){if(room.mode!=='journey'||room.status!=='reward'||!room.capture||room.capture.escaped)throw new Error('지나갈 야생 몬스터가 없습니다.');if(!room.capture.attemptedBy.includes(playerId))room.capture.attemptedBy.push(playerId);room.capture.escaped=true;pushRoomEvent(room,'capture-pass',`${playerName(room,playerId)} 님이 야생 몬스터를 지나쳤습니다.`);return{passed:true};}

"""
s=s[:start]+capture_funcs+s[end:]

# Fix winBattle to capture defeated before reward: makeCaptureEncounter uses room.battle still present, okay.

# Add loadout endpoint before /api/deck
needle="""    if (p === '/api/deck' && req.method === 'POST') {
"""
loadout="""    if (p === '/api/loadout' && req.method === 'POST') {
      const b=await parseBody(req),prof=await authProfile(req,res,b);const party=normalizeMonsterParty(b.monsterParty,prof.monsters||{});if(!party.length)throw new Error('몬스터를 최소 1마리 선택하세요.');if(party.length>MONSTER_PARTY_MAX||monsterPartyCost(party)>MONSTER_POINT_BUDGET)throw new Error(`몬스터 포인트는 ${MONSTER_POINT_BUDGET} 이하여야 합니다.`);
      const seen=new Set(),deck=(Array.isArray(b.deck)?b.deck:[]).filter(cid=>CARD_BY_ID[cid]?.type==='spell'&&prof.collection[cid]>0&&!seen.has(cid)&&seen.add(cid)).slice(0,DECK_MAX);if(deck.length<DECK_MIN)throw new Error(`스펠 덱은 최소 ${DECK_MIN}종이 필요합니다.`);prof.monsterParty=party;prof.deck=deck;saveProfiles();return ok(res,{profile:profileView(prof)});
    }
"""
if needle not in s: raise SystemExit('deck endpoint anchor missing')
s=s.replace(needle,loadout+needle,1)
# Simplify /api/deck validation to spells only
start=s.index("    if (p === '/api/deck' && req.method === 'POST') {")
end=s.index("    if (p === '/api/gacha/pull'",start)
deck_ep="""    if (p === '/api/deck' && req.method === 'POST') {
      const b=await parseBody(req),prof=await authProfile(req,res,b),seen=new Set();const raw=(Array.isArray(b.deck)?b.deck:[]).filter(cid=>CARD_BY_ID[cid]?.type==='spell'&&prof.collection[cid]>0&&!seen.has(cid)&&seen.add(cid)).slice(0,DECK_MAX);if(raw.length<DECK_MIN)throw new Error(`스펠 덱은 최소 ${DECK_MIN}종이 필요합니다.`);prof.deck=raw;saveProfiles();return ok(res,{profile:profileView(prof)});
    }
"""
s=s[:start]+deck_ep+s[end:]

# Meta output add monsters/rules
s=s.replace("cards: CARDS.map(publicCard), items: ITEMS.map(publicItem), rarities: RARITY, elements: ELEMENTS, elementMatchups: ELEMENT_ADVANTAGE, biomes: BIOMES,","cards: CARDS.map(publicCard), items: ITEMS.map(publicItem), monsters: MONSTERS.map(publicMonster), rarities: RARITY, elements: ELEMENTS, elementMatchups: ELEMENT_ADVANTAGE, monsterRules:{maxSlots:MONSTER_PARTY_MAX,pointBudget:MONSTER_POINT_BUDGET}, spellRules:{min:DECK_MIN,max:DECK_MAX}, biomes: BIOMES,")
# Health count already monsters count.
# API actions: play target monster; add evolution/fuse/switch
s=s.replace("if (action === 'play') { playCard(room, prof.id, b.handIndex, b.targetUid); return ok(res, { room: roomView(room) }); }","if (action === 'play') { playCard(room, prof.id, b.handIndex, b.targetUid, b.targetMonsterId); return ok(res, { room: roomView(room) }); }")
needle="""        if (action === 'recall-unit') { const unit = recallUnit(room, prof.id, b.instanceId); return ok(res, { result:{ name:unit.name, cardId:unit.cardId }, room: roomView(room) }); }
"""
replace="""        if (action === 'recall-unit') { const unit = recallUnit(room, prof.id, b.instanceId); return ok(res, { result:{ name:unit.name, cardId:unit.cardId }, room: roomView(room) }); }
        if (action === 'monster-evolve') { const unit=evolveMonster(room,prof.id,b.instanceId,b.mode); return ok(res,{result:{name:unit.name,mode:b.mode},room:roomView(room),profile:profileView(profiles[prof.id])}); }
        if (action === 'monster-fuse') { const unit=fuseMonsters(room,prof.id,b.primaryId,b.secondaryId); return ok(res,{result:{name:unit.name},room:roomView(room),profile:profileView(profiles[prof.id])}); }
        if (action === 'switch-monster') { const unit=switchMonster(room,prof.id,b.activeId,b.benchId); return ok(res,{result:{name:unit.name},room:roomView(room)}); }
"""
if needle not in s: raise SystemExit('action insert missing')
s=s.replace(needle,replace,1)

p.write_text(s,encoding='utf-8')
print('server v40 patched')
