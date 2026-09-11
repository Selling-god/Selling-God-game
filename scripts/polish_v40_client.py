from pathlib import Path
p=Path('/mnt/data/rift_v40_work/public/app.js')
s=p.read_text(encoding='utf-8')

def rep(old,new,label):
 global s
 if old not in s: raise SystemExit('missing '+label)
 s=s.replace(old,new)

# Add display sprite helper next to form helper.
rep("""  function monsterFormName(u){if(u?.fused)return'FUSION';if(u?.abyssBloom)return'RIFT BLOOM';if(Number(u?.resonanceTurns||0)>0)return'RESONANCE';if(u?.evolved)return'EVOLVED';return'BASE';}
""","""  function monsterFormName(u){if(u?.fused)return'FUSION';if(u?.abyssBloom)return'RIFT BLOOM';if(Number(u?.resonanceTurns||0)>0)return'RESONANCE';if(u?.evolved)return'EVOLVED';return'BASE';}
  function monsterDisplaySprite(u){if(!u)return'';if(u.abyssBloom)return u.riftSprite||u.sprite;if(Number(u.resonanceTurns||0)>0)return u.resonanceSprite||u.sprite;if(u.evolved)return u.evolutionSprite||u.sprite;return u.sprite||u.baseSprite||'';}
""",'monsterDisplaySprite')

# Effect UI and keywords for burst.
s=s.replace("riftCharge:'RIFT',damage:'DMG'","riftCharge:'RIFT',monsterBurst:'BURST',damage:'DMG'")
s=s.replace("riftCharge:['◆','RIFT','buff'],\n      damage:","riftCharge:['◆','RIFT','buff'],monsterBurst:['➤','즉시 공격','attack'],\n      damage:")

# Show gene style in role label.
s=s.replace("if(card?.cardClass==='gene')return{key:'growth',icon:'⌬',label:'강화'};","if(card?.cardClass==='gene')return{key:'growth',icon:'⌬',label:card?.geneStyle||'인자술'};")

# Improve monster portrait and expose passive in compact visual manner.
old="""  function monsterPortrait(m,opt={}){if(!m)return'';const selected=!!opt.selected;return `<button class="monster-card-v40 rarity-${esc(m.rarity||m.tier)} ${selected?'selected':''}" ${opt.action?`data-action="${opt.action}"`:''} ${opt.id?`data-monster-id="${esc(opt.id)}"`:''} title="${esc(m.passive?.name||'')} · ${esc(m.passive?.text||'')}"><span class="monster-cost-v40">${m.pointCost}P</span><img src="${esc(m.sprite)}" loading="lazy" alt=""><div><b>${esc(m.name)}</b><small>${esc(elementGlyph(m.element))} ${esc(m.element)} · ${esc(monsterRarityKo(m))}</small><em>${esc(m.passive?.name||m.skill||'')}</em></div></button>`;}
"""
new="""  function monsterPortrait(m,opt={}){if(!m)return'';const selected=!!opt.selected;return `<button class="monster-card-v40 rarity-${esc(m.rarity||m.tier)} ${selected?'selected':''}" ${opt.action?`data-action="${opt.action}"`:''} ${opt.id?`data-monster-id="${esc(opt.id)}"`:''} title="${esc(m.passive?.name||'')} · ${esc(m.passive?.text||'')}"><span class="monster-cost-v40">${m.pointCost}P</span><span class="monster-element-v40">${esc(elementGlyph(m.element))}</span><img src="${esc(m.sprite)}" loading="lazy" alt=""><div><b>${esc(m.name)}</b><small>${esc(m.element)} · ${esc(monsterRarityKo(m))}</small><em>${esc(m.passive?.name||m.skill||'고유 특성')}</em></div></button>`;}
"""
rep(old,new,'monsterPortrait')

# Replace monster actor sprite with form-specific sprite and archetype class; enemy gets archetype class.
s=s.replace("class=\"enemy-actor-v31 v40 ${state.selectedEnemy===e.uid?'selected':''}","class=\"enemy-actor-v31 v40 archetype-${enemyArchetypeName(e.name)} ${state.selectedEnemy===e.uid?'selected':''}")
s=s.replace("class=\"monster-actor-v40 filled element-${elementClass(u.element)} form-","class=\"monster-actor-v40 filled archetype-${esc(u.archetype||'construct')} element-${elementClass(u.element)} form-")
s=s.replace("<img src=\"${esc(u.sprite)}\" alt=\"\"><i></i></div>","<img src=\"${esc(monsterDisplaySprite(u))}\" alt=\"\"><i></i></div>")
# bench uses form sprite too
s=s.replace("<img src=\"${esc(u.sprite)}\"><span>${esc(shortLine(u.name,9))}</span>","<img src=\"${esc(monsterDisplaySprite(u))}\"><span>${esc(shortLine(u.name,9))}</span>")

# Add attack label/afterimage helpers and replace event FX functions.
start=s.index('  function monsterAttackEventFx(payload)')
end=s.index('\n  function monsterTransformFx(payload)',start)
new_fx="""  function attackLabelV40(actor,label,kind='ally'){
    if(!actor||!label)return;const n=document.createElement('div');n.className=`attack-label-v40 ${kind}`;n.textContent=shortLine(label,18);actor.appendChild(n);setTimeout(()=>n.remove(),760);
  }
  function attackAfterimageV40(actor,dir=1){
    const img=actor?.querySelector('img');if(!img||!fxOn())return;const ghost=img.cloneNode(true);const r=img.getBoundingClientRect();ghost.className='attack-afterimage-v40';ghost.style.left=`${r.left}px`;ghost.style.top=`${r.top}px`;ghost.style.width=`${r.width}px`;ghost.style.height=`${r.height}px`;ghost.style.setProperty('--ghost-x',`${dir*48}px`);document.body.appendChild(ghost);setTimeout(()=>ghost.remove(),420);
  }
  function motionFramesV40(style,dir=1,heavy=false){
    const dx=dir*(heavy?104:72);
    if(['golem','tyrant','leviathan'].includes(style))return [{transform:'translate3d(0,0,0) scale(1)'},{transform:`translate3d(${dir*18}px,-22px,0) scale(1.18)`,offset:.30},{transform:`translate3d(${dir*dx}px,12px,0) scale(1.10,.94)`,offset:.58},{transform:'translate3d(0,0,0) scale(1)'}];
    if(['wing','spirit','wraith','phoenix'].includes(style))return [{transform:'translate3d(0,0,0) rotate(0)'},{transform:`translate3d(${dir*28}px,-44px,0) rotate(${dir*7}deg) scale(1.10)`,offset:.38},{transform:`translate3d(${dir*64}px,-10px,0) rotate(${dir*-5}deg)`,offset:.63},{transform:'translate3d(0,0,0) rotate(0)'}];
    if(['assassin','serpent','insect'].includes(style))return [{transform:'translate3d(0,0,0)'},{transform:`translate3d(${dir*-14}px,0,0) scale(.92,1.06)`,offset:.18},{transform:`translate3d(${dir*dx}px,-4px,0) scale(1.12,.96)`,offset:.48},{transform:`translate3d(${dir*4}px,0,0)`,offset:.76},{transform:'translate3d(0,0,0)'}];
    if(['priest','watcher','construct','drone','mushroom'].includes(style))return [{transform:'translate3d(0,0,0)',filter:'brightness(1)'},{transform:'translate3d(0,-13px,0) scale(1.12)',filter:'brightness(1.75)',offset:.48},{transform:'translate3d(0,0,0)',filter:'brightness(1)'}];
    return [{transform:'translate3d(0,0,0)'},{transform:`translate3d(${dir*dx}px,-8px,0) scale(1.10)`,offset:.48},{transform:`translate3d(${dir*8}px,0,0)`,offset:.74},{transform:'translate3d(0,0,0)'}];
  }
  function monsterAttackEventFx(payload){
    if(!fxOn()||!payload)return;const actor=$(`[data-monster="${CSS.escape(payload.instanceId||'')}"]`),target=$(`[data-enemy="${CSS.escape(payload.targetUid||'')}"]`);if(!actor||!target)return;
    const fake={element:payload.element||'강철',rarity:payload.form&&payload.form!=='BASE'?'legendary':'common',power:payload.damage||8,effects:[{op:'damage',value:payload.damage||8}]},style=payload.archetype||'beast';
    attackLabelV40(actor,payload.skill||'ATTACK','ally');attackAfterimageV40(actor,1);actor.classList.add('attacking-v40');
    try{actor.animate(motionFramesV40(style,1,payload.form&&payload.form!=='BASE'),{duration:560,easing:'cubic-bezier(.14,.82,.16,1)'});}catch{}
    setTimeout(()=>{signatureProjectileFx(actor,target,fake).then(()=>{signatureImpactFx(target,fake,payload.form&&payload.form!=='BASE'?1.45:1.08);popNumber(target,`-${payload.damage||0}`,'damage');});},style==='construct'||style==='watcher'||style==='priest'?210:170);
    setTimeout(()=>actor.classList.remove('attacking-v40'),640);
  }
  function enemyAttackEventFx(payload){
    if(!fxOn()||!payload)return;const actor=$(`[data-enemy="${CSS.escape(payload.enemyUid||'')}"]`),target=payload.targetMonsterId?$(`[data-monster="${CSS.escape(payload.targetMonsterId)}"]`):$('.team-core-v40');if(!actor||!target)return;
    const fake={element:payload.element||'공허',rarity:payload.heavy?'legendary':'common',power:payload.damage||8,effects:[{op:'damage',value:payload.damage||8}]},style=payload.style||'beast';
    attackLabelV40(actor,payload.skill||'ENEMY ATTACK','enemy');attackAfterimageV40(actor,-1);actor.classList.add('attacking-v40');
    try{actor.animate(motionFramesV40(style,-1,!!payload.heavy),{duration:payload.heavy?690:560,easing:'cubic-bezier(.14,.82,.16,1)'});}catch{}
    setTimeout(()=>{signatureProjectileFx(actor,target,fake).then(()=>{signatureImpactFx(target,fake,payload.heavy?1.5:1.12);popNumber(target,`-${payload.damage||0}`,'damage player');});screenShake(payload.heavy?'heavy':'soft');},220);
    setTimeout(()=>actor.classList.remove('attacking-v40'),760);
  }
  function monsterBurstEventFx(payload){
    if(!payload)return;const actor=$(`[data-monster="${CSS.escape(payload.instanceId||'')}"]`),target=$(`[data-enemy="${CSS.escape(payload.targetUid||'')}"]`);if(!actor||!target)return;attackLabelV40(actor,payload.skill||'LINK BURST','ally');screenFlash('break');attackAfterimageV40(actor,1);try{actor.animate([{transform:'scale(1)'},{transform:'scale(1.20)',filter:'brightness(1.8)',offset:.25},{transform:'translateX(92px) scale(1.08)',offset:.52},{transform:'scale(1)'}],{duration:620,easing:'cubic-bezier(.12,.86,.16,1)'});}catch{}setTimeout(()=>signatureProjectileFx(actor,target,{element:payload.element||'빛',rarity:'legendary',power:payload.damage||12,effects:[{op:'damage',value:payload.damage||12}]}).then(()=>{signatureImpactFx(target,{element:payload.element||'빛',rarity:'legendary',power:payload.damage||12,effects:[{op:'damage',value:payload.damage||12}]},1.55);popNumber(target,`-${payload.damage||0}`,'damage');screenShake('hit');}),170);
  }
"""
s=s[:start]+new_fx+s[end:]

# Sequential attack event queue in playRoomEvents. Replace function entirely.
start=s.index('  function playRoomEvents(next,afterSeq){')
end=s.index('\n  function playerNameFromRoom',start)
new_events="""  function playRoomEvents(next,afterSeq){
    if(!next?.feed)return 0;const events=next.feed.filter(ev=>Number(ev.seq)>Number(afterSeq||0));let combatDelay=0;
    const later=(fn,step=0)=>{setTimeout(fn,combatDelay);combatDelay+=step;};
    for(const ev of events){
      if(ev.type==='battle-start'){if(ev.payload?.tier==='boss'){screenShake('heavy');screenFlash('boss');showCenterBanner('BOSS','','boss');sound('boss');}else if(ev.payload?.tier==='elite'){showCenterBanner('ELITE','','turn');}}
      else if(ev.type==='turn')later(()=>showCenterBanner(`TURN ${next.battle?.turn||''}`,'','turn'),180);
      else if(ev.type==='monster-attack')later(()=>monsterAttackEventFx(ev.payload),600);
      else if(ev.type==='monster-burst')later(()=>monsterBurstEventFx(ev.payload),680);
      else if(ev.type==='enemy-attack')later(()=>enemyAttackEventFx(ev.payload),ev.payload?.heavy?760:620);
      else if(ev.type==='monster-hit')later(()=>{const t=$(`[data-monster="${CSS.escape(ev.payload?.instanceId||'')}"]`);if(t){t.classList.add('monster-hit-v40');setTimeout(()=>t.classList.remove('monster-hit-v40'),420);}},160);
      else if(ev.type==='monster-evolve')later(()=>monsterTransformFx(ev.payload),760);
      else if(ev.type==='monster-fuse')later(()=>{monsterTransformFx({...ev.payload,mode:'fusion'});showCenterBanner('FUSION','','victory');},820);
      else if(ev.type==='monster-level'&&ev.payload?.playerId===state.profileId)later(()=>showCenterBanner(`Lv.${ev.payload.level}`,'LEVEL UP','ally'),250);
      else if(ev.type==='card'&&ev.payload?.playerId!==state.profileId){later(()=>{const card=byId(state.meta.cards,ev.payload?.cardId)||{element:ev.payload?.element||'공허',type:'spell',rarity:'common',effects:[{op:'damage',value:1}]};const target=ev.payload?.targetUid?$(`[data-enemy="${CSS.escape(ev.payload.targetUid)}"]`):$('.monster-side-v40');if(target)signatureImpactFx(target,card,.85);},220);}
      else if(ev.type==='mastery'&&ev.payload?.playerId===state.profileId)later(()=>{showCenterBanner(ev.payload?.level===2?'++':'+','SPELL GROWTH','ally');sound('reward');},250);
      else if(ev.type==='chain'&&ev.payload?.playerId===state.profileId)later(()=>{if(ev.payload?.stage==='overdrive'){screenFlash('victory');screenShake('hit');showCenterBanner('RIFT DRIVE','','victory');sound('overdrive');}else{showCenterBanner('COMMAND LINK ×3','','ally');sound('chain');}},360);
      else if(ev.type==='enemy-break')later(()=>{const target=ev.payload?.enemyUid?$(`[data-enemy="${CSS.escape(ev.payload.enemyUid)}"]`):null;target?.classList.add('rift-broken-v26');screenFlash('break');screenShake('hit');if(target)signatureImpactFx(target,{element:'수정',rarity:'legendary',power:20,effects:[{op:'damage',value:20}]},1.4);showCenterBanner('BREAK','','victory');sound('overdrive');},420);
      else if(ev.type==='boss-phase')later(()=>{screenFlash('boss');screenShake('heavy');showCenterBanner('PHASE II','','boss');sound('boss');},500);
      else if(ev.type==='win')later(()=>{screenFlash('victory');screenShake('soft');showCenterBanner(ev.payload?.final?'ABYSS CLEAR':'VICTORY','','victory');sound('win');},420);
      else if(ev.type==='defeat')later(()=>{screenFlash('defeat');screenShake('heavy');showCenterBanner('DEFEAT','','defeat');sound('error');},420);
    }
    return combatDelay;
  }
"""
s=s[:start]+new_events+s[end:]

# Make accept update play events before delta so choreography is seen first; delayed aggregate delta avoids masking attacks.
old="""    if(changed&&!initial)playSceneCurtain(next);
    if(!initial)setTimeout(()=>{playCombatDelta(prev,next);playRoomEvents(next,after);},changed?260:0);
"""
new="""    if(changed&&!initial)playSceneCurtain(next);
    if(!initial)setTimeout(()=>{const choreography=playRoomEvents(next,after);setTimeout(()=>playCombatDelta(prev,next),Math.min(2400,Math.max(120,choreography+80)));},changed?260:0);
"""
rep(old,new,'accept choreography')

# Entrance selectors include monsters.
s=s.replace("const enemies=$$('.enemy-actor-v31'),units=$$('.unit-actor-v31.filled'),cards=", "const enemies=$$('.enemy-actor-v31'),units=$$('.monster-actor-v40.filled, .unit-actor-v31.filled'),cards=")

# In battle render, show selected monster form label + current power prominently. Replace head piece.
s=s.replace("<div class=\"monster-head-v40\"><b>${esc(shortLine(u.name,16))}</b><span>Lv.${u.level}</span></div>","<div class=\"monster-head-v40\"><b>${esc(shortLine(u.name,16))}</b><span>Lv.${u.level} · ATK ${u.power}</span></div><div class=\"monster-form-chip-v40\">${esc(monsterFormName(u))}</div>")

# Command link text in battle target hint and profile stats naming.
s=s.replace("공격 스펠은 적 / 인자술은 선택 몬스터","공격은 적 · 인자술은 선택 몬스터 · 같은 몬스터에 연계하면 LINK 상승")
s=s.replace("<small>최고 전술 연쇄</small>","<small>최고 COMMAND LINK</small>")
s=s.replace("<small>오버드라이브</small>","<small>RIFT DRIVE</small>")

# Capture step terminology.
s=s.replace("step='CARD HUNT'","step='MONSTER HUNT'")
s=s.replace("일반 여행에서는 한정 카드가 등장하지 않습니다.","복각 소환은 특수 스펠을 영구 획득하는 별도 아카이브입니다. 몬스터는 여행에서 봉인합니다.")

p.write_text(s,encoding='utf-8')
print('client polish applied')
