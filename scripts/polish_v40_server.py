from pathlib import Path
p=Path('/mnt/data/rift_v40_work/server.js')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
 global s
 if old not in s: raise SystemExit('missing '+label)
 s=s.replace(old,new)

# Header
s=s.replace('RIFT DECK: ABYSS EXPEDITION v2.5','RIFT DECK: ABYSS EXPEDITION v4.0')
s=s.replace('- card/unit/spell combat inspired by deckbuilding roguelites','- captured-monster party combat commanded and evolved through spell cards')
s=s.replace('- journey encounters can permanently seal/capture cards','- journey encounters can permanently seal/capture monsters')

# publicMonster form art
rep("""    pointCost:monsterPointCost(m),captureBase:Number(m.captureBase||0.25),playerHp:Number(m.playerHp||m.hp||50),
    playerAtk:Number(m.playerAtk||m.atk||8),passive:clone(m.passive||{}),evolutionName:m.evolutionName||`${m.name} · 진화형`,
    resonanceName:m.resonanceName||`공명 ${m.name}`,abyssName:m.abyssName||`균열개화 ${m.name}`
""","""    pointCost:monsterPointCost(m),captureBase:Number(m.captureBase||0.25),playerHp:Number(m.playerHp||m.hp||50),
    playerAtk:Number(m.playerAtk||m.atk||8),passive:clone(m.passive||{}),evolutionName:m.evolutionName||`${m.name} · 진화형`,
    resonanceName:m.resonanceName||`공명 ${m.name}`,abyssName:m.abyssName||`균열개화 ${m.name}`,
    evolutionSprite:m.evolutionSprite||m.sprite,resonanceSprite:m.resonanceSprite||m.sprite,riftSprite:m.riftSprite||m.sprite
""",'publicMonster')

rep("""    instanceId: uid('mon'), speciesId:m.id, name:m.name, baseName:m.name, sprite:m.sprite, fusionSprite:null,
""","""    instanceId: uid('mon'), speciesId:m.id, name:m.name, baseName:m.name, sprite:m.sprite, baseSprite:m.sprite,
    evolutionSprite:m.evolutionSprite||m.sprite,resonanceSprite:m.resonanceSprite||m.sprite,riftSprite:m.riftSprite||m.sprite,fusionSprite:null,
""",'createRunMonster art')

# More useful monster damage modifier.
rep("""  if (source?.type === 'spell') v += Number(pc.itemMods.spellPower || 0);
  v *= 1 + Number(pc.itemMods.damagePct || 0);
""","""  if (source?.type === 'spell') v += Number(pc.itemMods.spellPower || 0);
  if (source?.type === 'monster') v += Number(pc.itemMods.unitPower || 0);
  v *= 1 + Number(pc.itemMods.damagePct || 0);
""",'modifiedDamage')

# Add monster burst to applyEffects after riftCharge.
rep("""    else if (fx.op === 'riftCharge' && targetMonster) targetMonster.rift = clamp(Number(targetMonster.rift||0)+v,0,5);
    else if (fx.op === 'energyDebt') pc.buffs.energyDebt += v;
""","""    else if (fx.op === 'riftCharge' && targetMonster) targetMonster.rift = clamp(Number(targetMonster.rift||0)+v,0,5);
    else if (fx.op === 'monsterBurst' && targetMonster && target) {
      const burstBase=Math.max(1,Math.round(Number(targetMonster.power||1)*Math.max(.15,v/100)));
      const burst=modifiedDamage(room,pc,burstBase,{type:'monster',element:targetMonster.element});
      const dealt=applyElementDamage(target,burst,targetMonster.element); pc.stats.damage+=dealt;
      battleLog(room,`${targetMonster.name} 연계 공격 → ${target.name} ${dealt} 피해.`);
      pushRoomEvent(room,'monster-burst',`${targetMonster.name} 연계 공격!`,{playerId:pc.playerId,instanceId:targetMonster.instanceId,targetUid:target.uid,element:targetMonster.element,archetype:targetMonster.archetype,damage:dealt,skill:source?.geneStyle||'연계 공격'});
    }
    else if (fx.op === 'energyDebt') pc.buffs.energyDebt += v;
""",'monsterBurst')

# Replace tactical chain with spell-to-monster command link, now that all cards are spells.
start=s.index('function updateTacticalChain(room, pc, card) {')
end=s.index('\nfunction updateBossPhase(room)',start)
new_chain="""function updateTacticalChain(room, pc, card, targetMonster=null, targetEnemy=null) {
  pc.chain ||= { count:0,lastType:null,lastClass:null,lastMonsterId:null,best:0,overdrives:0 };
  const chain=pc.chain, cls=card.cardClass||'support', sameMonster=targetMonster && chain.lastMonsterId===targetMonster.instanceId;
  const classChanged=!!chain.lastClass && chain.lastClass!==cls;
  const affinity=!!targetMonster && card.element===targetMonster.element;
  // Link grows when commands vary or when a spell resonates with the selected monster.
  if (!chain.count) chain.count=1;
  else if (sameMonster && (classChanged || affinity)) chain.count+=1;
  else chain.count=Math.max(1, affinity?2:1);
  chain.lastClass=cls; chain.lastType=card.type; chain.lastMonsterId=targetMonster?.instanceId||null;
  chain.best=Math.max(Number(chain.best||0),chain.count);
  const p=profiles[pc.playerId]; if(p)p.stats.bestChain=Math.max(Number(p.stats.bestChain||0),chain.best);
  let stage=''; const displayCount=chain.count;
  if(chain.count===3 && targetMonster){
    targetMonster.block+=5; targetMonster.resonance=clamp(Number(targetMonster.resonance||0)+1,0,6); drawCards(pc,1); stage='flow';
    battleLog(room,`${targetMonster.name} COMMAND LINK ×3 — 실드 +5 · RES +1 · 드로우 +1.`);
  } else if(chain.count>=5 && targetMonster){
    pc.energy+=1; targetMonster.gene=clamp(Number(targetMonster.gene||0)+1,0,8); targetMonster.rift=clamp(Number(targetMonster.rift||0)+1,0,5);
    chain.overdrives+=1; if(p)p.stats.overdrives=Number(p.stats.overdrives||0)+1; stage='overdrive';
    if(targetEnemy && targetEnemy.hp>0){
      const burst=modifiedDamage(room,pc,Math.round(targetMonster.power*1.15),{type:'monster',element:targetMonster.element});
      const dealt=applyElementDamage(targetEnemy,burst,targetMonster.element);pc.stats.damage+=dealt;
      pushRoomEvent(room,'monster-burst',`${targetMonster.name} RIFT DRIVE!`,{playerId:pc.playerId,instanceId:targetMonster.instanceId,targetUid:targetEnemy.uid,element:targetMonster.element,archetype:targetMonster.archetype,damage:dealt,skill:'RIFT DRIVE'});
    }
    battleLog(room,`${targetMonster.name} RIFT DRIVE — 에너지 +1 · GENE +1 · RIFT +1.`);
    chain.count=0;chain.lastClass=null;chain.lastType=null;chain.lastMonsterId=null;
  }
  return {stage,displayCount};
}
"""
s=s[:start]+new_chain+s[end:]

# call chain with monster and target
s=s.replace("const chainResult=updateTacticalChain(room,pc,c),phaseShifts=updateBossPhase(room)","const chainResult=updateTacticalChain(room,pc,c,monster,target),phaseShifts=updateBossPhase(room)")

# Add skills/elements to attack event payloads.
s=s.replace("damage:dealt,form:monsterFormLabel(u)});","damage:dealt,form:monsterFormLabel(u),skill:u.passive?.name||u.role||'몬스터 공격'});")
s=s.replace("damage:d,style:e.archetype||'beast',heavy:e.intent.type==='heavy'});","damage:d,style:e.archetype||'beast',element:e.element||'공허',skill:e.skill||e.name,heavy:e.intent.type==='heavy'});")

# Filter relics by mode so capture-only relics don't pollute dungeon pools.
rep("""  const pool = RELICS.filter(r => !owned.has(r.id));
""","""  const pool = RELICS.filter(r => !owned.has(r.id) && (!Array.isArray(r.modes) || r.modes.includes(room.mode)));
""",'relic mode filter')
# Contract relic pool mode-aware (room accessible)
s=s.replace("const pool=RELICS.filter(r=>['common','rare'].includes(r.rarity));","const pool=RELICS.filter(r=>['common','rare'].includes(r.rarity)&&(!Array.isArray(r.modes)||r.modes.includes(room.mode)));")

# Rest heals monster roster too.
rep("""    const before=run.hp; run.hp=clamp(run.hp+heal,1,run.maxHp); label=`휴식 · HP +${run.hp-before}`;
""","""    const before=run.hp; run.hp=clamp(run.hp+heal,1,run.maxHp);
    for(const m of run.monsters||[]){const mh=Math.max(8,Math.round(m.maxHp*.30));m.hp=clamp(m.hp+mh,1,m.maxHp);m.block=0;}
    label=`휴식 · 코어 HP +${run.hp-before} · 몬스터 HP 30% 회복`;
""",'camp heal')
# biome heal monsters
rep("""      run.hp = clamp(run.hp + Math.round(run.maxHp * healPct), 1, run.maxHp);
""","""      run.hp = clamp(run.hp + Math.round(run.maxHp * healPct), 1, run.maxHp);
      for(const m of run.monsters||[])m.hp=clamp(m.hp+Math.round(m.maxHp*healPct),1,m.maxHp);
""",'biome heal')

# Synergy uses monster party, not now-removed unit card counts.
old="""function cardSynergy(run, card) {
  if (!run || !card) return 0;
  const top = runAffinity(run).slice(0,2).map(x=>x.element);
  let score = 0;
  if (top[0] === card.element) score += 2;
  else if (top[1] === card.element) score += 1;
  const types = (run.runDeck || []).map(id=>CARD_BY_ID[id]?.type).filter(Boolean);
  const units = types.filter(x=>x==='unit').length, spells = types.filter(x=>x==='spell').length;
  if ((units > spells + 3 && card.type === 'spell') || (spells > units + 3 && card.type === 'unit')) score += 1;
  return clamp(score,0,3);
}
"""
new="""function cardSynergy(run, card) {
  if (!run || !card) return 0;
  const top = runAffinity(run).slice(0,2).map(x=>x.element);
  const monsterElements=(run.monsters||[]).filter(m=>m.hp>0).map(m=>m.element);
  let score=0;
  if(monsterElements.includes(card.element))score+=2;
  else if(top[0]===card.element)score+=1;
  if(card.cardClass==='gene'&&monsterElements.includes(card.element))score+=1;
  if(card.cardClass==='support'&&top.length&&monsterElements.some(e=>top.includes(e)))score+=1;
  return clamp(score,0,3);
}
"""
rep(old,new,'cardSynergy')

# Copy form sprites into room's persisted monster state on legacy/migration run state if missing is handled client fallback; no DB change.
# Better defeat text.
s=s.replace('영구 획득한 카드와 재화는 유지됩니다.','영구 봉인한 몬스터와 보유 스펠·재화는 유지됩니다.')
s=s.replace('먼저 카드 흔적을 봉인하거나 지나가 주세요.','먼저 야생 몬스터를 봉인하거나 지나가 주세요.')

p.write_text(s,encoding='utf-8')
print('server polish applied')
