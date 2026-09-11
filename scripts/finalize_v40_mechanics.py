from pathlib import Path
p=Path('server.js')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
    global s
    if old not in s:
        raise SystemExit(f'missing {label}')
    s=s.replace(old,new,1)

rep("""    pointCost:monsterPointCost(m), level:1, xp:0, hp:maxHp, maxHp, power, block:startBlock, counter:0,
    gene:0, resonance:0, rift:0, evolved:false, fused:false, fusionWith:null, resonanceTurns:0, abyssBloom:false,
    revived:false, firstHitTaken:false, summonedTurn:0, slotOrder:index
""","""    pointCost:monsterPointCost(m), level:1, xp:0, hp:maxHp, maxHp, power, block:startBlock, counter:0,
    gene:0, resonance:0, rift:0, evolved:false, fused:false, fusionWith:null, resonanceTurns:0, abyssBloom:false,
    secondaryArchetype:null, secondaryPassive:null, nextAttackBonus:0, kills:0,
    revived:false, firstHitTaken:false, summonedTurn:0, slotOrder:index
""",'createRunMonster extras')

start=s.index('function monsterDamage(room, pc, u, amount, source=null){')
end=s.index('\nfunction evolveMonster(',start)
old=s[start:end]
new="""function monsterDamage(room, pc, u, amount, source=null){
  let d=Math.max(0,Math.round(amount)); if(!u)return 0;
  // Monster-specific mitigation happens before shields so the shield value is easy to understand.
  if(u.archetype==='golem'||u.secondaryArchetype==='golem')d=Math.round(d*.90);
  if((u.archetype==='wing'||u.secondaryArchetype==='wing')&&!u.firstHitTaken){d=Math.round(d*.80);u.firstHitTaken=true;}
  const beforeMonsterBlock=Number(u.block||0);
  if(u.block>0){const x=Math.min(u.block,d);u.block-=x;d-=x;}
  if(beforeMonsterBlock>0&&u.block<=0&&(u.archetype==='crab'||u.secondaryArchetype==='crab')){
    u.nextAttackBonus=Number(u.nextAttackBonus||0)+4;
    pushRoomEvent(room,'monster-passive',`${u.name} 갑각 반격 준비!`,{playerId:pc.playerId,instanceId:u.instanceId,passive:'갑각 반격'});
  }
  // Team CORE shield is the second protection layer after the active monster's own shield.
  if(pc.block>0){const x=Math.min(pc.block,d);pc.block-=x;d-=x;}
  const before=u.hp;u.hp=clamp(u.hp-d,0,u.maxHp);const dealt=before-u.hp;pc.stats.monsterDamageTaken+=dealt;
  if(dealt>0)u.rift=clamp(Number(u.rift||0)+Math.max(1,Math.ceil(dealt/18)),0,5);
  let revived=false;
  if(u.hp<=0&&(u.archetype==='phoenix'||u.secondaryArchetype==='phoenix')&&!u.revived){u.revived=true;u.hp=Math.max(1,Math.round(u.maxHp*.25));revived=true;pushRoomEvent(room,'monster-passive',`${u.name} 재점화!`,{playerId:pc.playerId,instanceId:u.instanceId,passive:'재점화'});}
  if(!revived&&u.hp<=0){
    const pos=pc.units.findIndex(x=>x.instanceId===u.instanceId); if(pos>=0)pc.units.splice(pos,1); pc.ko.push(u); pc.hp=Math.max(1,pc.hp-Math.max(4,Math.round(pc.maxHp*.06)));
    if(pc.bench.length){const next=pc.bench.shift();next.block=Math.max(next.block||0,4);pc.units.splice(Math.min(pos<0?pc.units.length:pos,pc.units.length),0,next);pushRoomEvent(room,'monster-switch',`${next.name} 자동 출전!`,{playerId:pc.playerId,instanceId:next.instanceId,auto:true});}
    if(!pc.units.length&&!pc.bench.length){pc.down=true;pc.ended=true;}
  }
  pushRoomEvent(room,'monster-hit',`${u.name} ${dealt} 피해`,{playerId:pc.playerId,instanceId:u.instanceId,damage:dealt,ko:u.hp<=0&&!revived,revived,shieldBroken:beforeMonsterBlock>0&&u.block<=0});
  return dealt;
}
"""
s=s[:start]+new+s[end:]

rep("""  a.fused=true;a.fusionWith=b.speciesId;a.fusionSprite=b.sprite;a.secondaryElement=b.element;a.name=`${a.baseName} × ${b.baseName}`;a.maxHp=Math.round((a.maxHp+b.maxHp)*.76);a.hp=Math.round(a.maxHp*((ratioA+ratioB)/2));a.power=Math.round((a.power+b.power)*.72+3);a.pointCost=Math.min(10,Number(a.pointCost||1)+Number(b.pointCost||1));a.resonance=Math.max(a.resonance,b.resonance);a.rift=Math.max(a.rift,b.rift);
""","""  a.fused=true;a.fusionWith=b.speciesId;a.fusionSprite=b.sprite;a.secondaryElement=b.element;a.secondaryArchetype=b.archetype;a.secondaryPassive=clone(b.passive||{});a.name=`${a.baseName} × ${b.baseName}`;a.maxHp=Math.round((a.maxHp+b.maxHp)*.76);a.hp=Math.round(a.maxHp*((ratioA+ratioB)/2));a.power=Math.round((a.power+b.power)*.72+3);a.pointCost=Math.min(10,Number(a.pointCost||1)+Number(b.pointCost||1));a.resonance=Math.max(a.resonance,b.resonance);a.rift=Math.max(a.rift,b.rift);
""",'fusion secondary passive')

rep("""function castSpell(room, pc, c, target, targetMonster=null) {
  room.battle.teamSpellCount++; applyEffects(room,pc,c.effects,target,c,targetMonster);
  for(const ally of room.battle.party.filter(x=>!x.down))for(const u of ally.units){if(u.archetype==='drone'&&c.element===u.element)u.power+=1;if(u.archetype==='spirit'&&c.element===u.element)u.resonance=clamp(Number(u.resonance||0)+1,0,6);}
  battleLog(room,`${pc.nickname}이(가) ${c.name} 사용${targetMonster?` → ${targetMonster.name}`:''}.`);
}
""","""function castSpell(room, pc, c, target, targetMonster=null) {
  room.battle.teamSpellCount++; applyEffects(room,pc,c.effects,target,c,targetMonster);
  for(const ally of room.battle.party.filter(x=>!x.down))for(const u of ally.units){
    const drone=(u.archetype==='drone'||u.secondaryArchetype==='drone');
    const spirit=(u.archetype==='spirit'||u.secondaryArchetype==='spirit');
    if(drone&&c.element===u.element)u.nextAttackBonus=Number(u.nextAttackBonus||0)+4;
    if(spirit&&c.element===u.element)u.resonance=clamp(Number(u.resonance||0)+1,0,6);
  }
  battleLog(room,`${pc.nickname}이(가) ${c.name} 사용${targetMonster?` → ${targetMonster.name}`:''}.`);
}
""",'castSpell passive')

# combat grade counts monster damage too
rep("""function combatGrade(pc, battle) {
  const taken = Number(pc?.stats?.hpDamageTaken || 0);
  const ratio = pc?.maxHp ? taken / pc.maxHp : 1;
""","""function combatGrade(pc, battle) {
  const taken = Number(pc?.stats?.hpDamageTaken || 0) + Number(pc?.stats?.monsterDamageTaken || 0);
  const teamMonsterMax = [...(pc?.units||[]),...(pc?.bench||[]),...(pc?.ko||[])].reduce((n,u)=>n+Number(u.maxHp||0),0);
  const ratio = (Number(pc?.maxHp||0)+teamMonsterMax) ? taken / (Number(pc.maxHp||0)+teamMonsterMax) : 1;
""",'combat grade damage')

# Replace auto attack inner block with richer passives. Locate exact beginning and ending within enemyTurn.
old="""      let target=aliveEnemies(room)[0];if(!target)break;u.counter=Number(u.counter||0)+1;let power=Number(u.power||1);
      if(u.archetype==='beast'&&u.hp/u.maxHp>=.5)power*=1.15;if(u.archetype==='assassin'&&u.counter===1)power*=1.45;if(u.archetype==='knight'&&u.block>0)power*=1.10;if(u.archetype==='tyrant')u.power+=1;
      if(u.resonanceTurns>0)power*=1.35;if(u.abyssBloom)power*=1.40;if(pc.relics.includes('r005')&&b.tier==='boss')power+=4;power=modifiedDamage(room,pc,power,{type:'monster',element:u.element});
      let dealt=applyElementDamage(target,power,u.element);if(u.secondaryElement){const alt=Math.round(power*elementalMultiplier(u.secondaryElement,target.element));if(alt>dealt){target.hp=clamp(target.hp-(alt-dealt),0,target.maxHp);dealt=alt;}}
      pc.stats.damage+=dealt;monsterLevelGain(room,pc,u,1);if(u.archetype==='wraith'||u.abyssBloom)u.hp=clamp(u.hp+Math.max(1,Math.round(dealt*(u.abyssBloom?.20:.08))),0,u.maxHp);if(u.archetype==='serpent'&&Math.random()<.25)target.debuffs.weak++;if(u.archetype==='mushroom'&&u.counter%3===0)aliveEnemies(room).forEach(e=>{if(e!==target)applyDamage(e,2)});if(u.archetype==='leviathan')aliveEnemies(room).filter(e=>e!==target).forEach(e=>applyElementDamage(e,Math.round(power*.25),u.element));
      battleLog(room,`${u.name} → ${target.name} ${dealt} 피해.`);pushRoomEvent(room,'monster-attack',`${u.name} 공격!`,{playerId:pc.playerId,instanceId:u.instanceId,targetUid:target.uid,element:u.element,archetype:u.archetype,damage:dealt,form:monsterFormLabel(u),skill:u.passive?.name||u.role||'몬스터 공격'});const phases=updateBossPhase(room);for(const pe of phases)pushRoomEvent(room,'boss-phase',`${pe.name} 2단계!`,{enemyUid:pe.uid,enemyName:pe.name,phase:2});if(checkBattleEnd(room))return;
"""
new="""      let target=aliveEnemies(room)[0];if(!target)break;u.counter=Number(u.counter||0)+1;let power=Number(u.power||1);const archetypes=new Set([u.archetype,u.secondaryArchetype].filter(Boolean));
      if(archetypes.has('beast')&&u.hp/u.maxHp>=.5)power*=1.15;if(archetypes.has('assassin')&&u.counter===1)power*=1.45;if(archetypes.has('knight')&&u.block>0)power*=1.10;if(archetypes.has('tyrant'))u.power+=1;
      if(archetypes.has('watcher')&&elementalMultiplier(u.element,target.element)>1)power*=1.12;
      if(archetypes.has('puppet')&&Number(pc.lastMonsterDamage||0)>0)power+=Math.max(1,Math.round(pc.lastMonsterDamage*.15));
      if(Number(u.nextAttackBonus||0)>0){power+=Number(u.nextAttackBonus);u.nextAttackBonus=0;}
      if(u.resonanceTurns>0)power*=1.35;if(u.abyssBloom)power*=1.40;if(pc.relics.includes('r005')&&b.tier==='boss')power+=4;power=modifiedDamage(room,pc,power,{type:'monster',element:u.element});
      const wasAlive=target.hp>0;let dealt=applyElementDamage(target,power,u.element);if(u.secondaryElement){const alt=Math.round(power*elementalMultiplier(u.secondaryElement,target.element));if(alt>dealt){target.hp=clamp(target.hp-(alt-dealt),0,target.maxHp);dealt=alt;}}
      pc.stats.damage+=dealt;pc.lastMonsterDamage=dealt;monsterLevelGain(room,pc,u,1);
      if(archetypes.has('wraith')||u.abyssBloom)u.hp=clamp(u.hp+Math.max(1,Math.round(dealt*(u.abyssBloom?.20:.08))),0,u.maxHp);
      if(archetypes.has('serpent')&&Math.random()<.25)target.debuffs.weak++;
      if(archetypes.has('mushroom')&&u.counter%3===0)aliveEnemies(room).forEach(e=>{if(e!==target)applyDamage(e,2)});
      if(archetypes.has('leviathan'))aliveEnemies(room).filter(e=>e!==target).forEach(e=>applyElementDamage(e,Math.round(power*.25),u.element));
      if(archetypes.has('mimic')&&wasAlive&&target.hp<=0){const run=room.runState[pc.playerId];run.gold+=3;u.kills=Number(u.kills||0)+1;pushRoomEvent(room,'monster-passive',`${u.name} 탐욕 +3G`,{playerId:pc.playerId,instanceId:u.instanceId,passive:'탐욕',gold:3});}
      battleLog(room,`${u.name} → ${target.name} ${dealt} 피해.`);pushRoomEvent(room,'monster-attack',`${u.name} 공격!`,{playerId:pc.playerId,instanceId:u.instanceId,targetUid:target.uid,element:u.element,archetype:u.archetype,secondaryArchetype:u.secondaryArchetype||null,damage:dealt,form:monsterFormLabel(u),skill:u.passive?.name||u.role||'몬스터 공격'});const phases=updateBossPhase(room);for(const pe of phases)pushRoomEvent(room,'boss-phase',`${pe.name} 2단계!`,{enemyUid:pe.uid,enemyName:pe.name,phase:2});if(checkBattleEnd(room))return;
"""
rep(old,new,'autoattack passives')

# Give resonance activation a visible defensive spike and disallow duplicate active trigger wasting resource.
rep("""  }else if(mode==='resonance'){
    if(u.resonance<4)throw new Error('공명진화에는 RES 4가 필요합니다.');u.resonance-=4;u.resonanceTurns=3;prof.stats.resonanceEvolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 공명진화!`,{playerId,instanceId:u.instanceId,mode:'resonance'});
  }else if(mode==='rift'){
    if(u.rift<3||u.hp/u.maxHp>.60)throw new Error('균열개화에는 HP 60% 이하 + RIFT 3이 필요합니다.');u.rift-=3;u.abyssBloom=true;prof.stats.riftBlooms++;pushRoomEvent(room,'monster-evolve',`${u.name} 균열개화!`,{playerId,instanceId:u.instanceId,mode:'rift'});
""","""  }else if(mode==='resonance'){
    if(u.resonanceTurns>0)throw new Error('이미 공명진화 상태입니다.');if(u.resonance<4)throw new Error('공명진화에는 RES 4가 필요합니다.');u.resonance-=4;u.resonanceTurns=3;u.block=Number(u.block||0)+6;prof.stats.resonanceEvolutions++;pushRoomEvent(room,'monster-evolve',`${u.name} 공명진화!`,{playerId,instanceId:u.instanceId,mode:'resonance'});
  }else if(mode==='rift'){
    if(u.abyssBloom)throw new Error('이미 균열개화 상태입니다.');if(u.rift<3||u.hp/u.maxHp>.60)throw new Error('균열개화에는 HP 60% 이하 + RIFT 3이 필요합니다.');u.rift-=3;u.abyssBloom=true;u.nextAttackBonus=Number(u.nextAttackBonus||0)+5;prof.stats.riftBlooms++;pushRoomEvent(room,'monster-evolve',`${u.name} 균열개화!`,{playerId,instanceId:u.instanceId,mode:'rift'});
""",'transform polish')

p.write_text(s,encoding='utf-8')
print('finalized server mechanics')
