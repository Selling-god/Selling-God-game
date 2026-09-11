from pathlib import Path
p=Path('public/app.js')
s=p.read_text(encoding='utf-8')

def replace_func(name,new):
    global s
    marker=f'  function {name}('
    start=s.find(marker)
    if start<0: raise SystemExit(f'missing function {name}')
    # brace scanner
    brace=s.find('{',start); depth=0; i=brace
    in_str=None; esc=False; template_depth=0
    # JS scanner sufficient for function text; count braces while respecting quotes/templates/comments imperfectly
    while i<len(s):
        ch=s[i]
        if in_str:
            if esc: esc=False
            elif ch=='\\': esc=True
            elif ch==in_str:
                in_str=None
            i+=1; continue
        if ch in "'\"`": in_str=ch; i+=1; continue
        if ch=='{': depth+=1
        elif ch=='}':
            depth-=1
            if depth==0:
                end=i+1
                s=s[:start]+new+s[end:]
                return
        i+=1
    raise SystemExit(f'unclosed function {name}')

replace_func('screenShake',"""  function screenShake(level='hit'){
    if(!fxOn())return;level=level==='medium'?'hit':level;const target=$('.battle-v40')||$('.battle-stage-v31')||$('.battle-screen')||document.body;const cls=`shake-${level}`;target.classList.remove('shake-soft','shake-hit','shake-heavy');void target.offsetWidth;target.classList.add(cls);setTimeout(()=>target.classList.remove(cls),level==='heavy'?390:level==='soft'?180:270);
    if(navigator.vibrate&&level==='heavy')navigator.vibrate(22);
  }""")

replace_func('monsterAttackEventFx',"""  function monsterAttackEventFx(payload){
    if(!fxOn()||!payload)return;const actor=$(`[data-monster="${CSS.escape(payload.instanceId||'')}"]`),target=$(`[data-enemy="${CSS.escape(payload.targetUid||'')}"]`);if(!actor||!target)return;
    const transformed=payload.form&&payload.form!=='BASE',fake={element:payload.element||'강철',rarity:transformed?'legendary':'common',power:payload.damage||8,effects:[{op:'damage',value:payload.damage||8}]},style=payload.archetype||'beast';
    attackLabelV40(actor,payload.skill||'ATTACK','ally');attackAfterimageV40(actor,1);actor.classList.add('attacking-v40');
    try{actor.animate(motionFramesV40(style,1,transformed),{duration:transformed?690:570,easing:'cubic-bezier(.14,.82,.16,1)'});}catch{}
    setTimeout(async()=>{
      if(['golem','tyrant','leviathan'].includes(style)){await eruptionFx(target,fake);screenShake(transformed?'heavy':'hit');}
      else if(['watcher','priest','drone'].includes(style)){await beamFx(actor,target,fake);}
      else if(['spirit','wraith','phoenix','mushroom'].includes(style)){await signatureProjectileFx(actor,target,fake);signatureImpactFx(target,fake,transformed?1.45:1.05);}
      else if(['wing'].includes(style)){await waveFx(actor,target,fake);}
      else {await meleeArcFx(target,fake,transformed||['assassin','knight','crab'].includes(style));}
      popNumber(target,`-${payload.damage||0}`,'damage');if(transformed)screenFlash('break');
    },['watcher','priest','drone'].includes(style)?220:150);
    setTimeout(()=>actor.classList.remove('attacking-v40'),820);
  }""")

replace_func('enemyAttackEventFx',"""  function enemyAttackEventFx(payload){
    if(!fxOn()||!payload)return;const actor=$(`[data-enemy="${CSS.escape(payload.enemyUid||'')}"]`),target=payload.targetMonsterId?$(`[data-monster="${CSS.escape(payload.targetMonsterId)}"]`):$('.team-core-v40');if(!actor||!target)return;
    const heavy=!!payload.heavy,fake={element:payload.element||'공허',rarity:heavy?'legendary':'common',power:payload.damage||8,effects:[{op:'damage',value:payload.damage||8}]},style=payload.style||'beast';
    attackLabelV40(actor,payload.skill||'ENEMY ATTACK','enemy');attackAfterimageV40(actor,-1);actor.classList.add('attacking-v40');
    try{actor.animate(motionFramesV40(style,-1,heavy),{duration:heavy?760:610,easing:'cubic-bezier(.14,.82,.16,1)'});}catch{}
    setTimeout(async()=>{
      if(['golem','tyrant','leviathan'].includes(style)){await eruptionFx(target,fake);}
      else if(['watcher','priest','drone'].includes(style)){await beamFx(actor,target,fake);}
      else if(['spirit','wraith','phoenix','mushroom'].includes(style)){await signatureProjectileFx(actor,target,fake);signatureImpactFx(target,fake,heavy?1.55:1.10);}
      else if(style==='wing'){await waveFx(actor,target,fake);}
      else {await meleeArcFx(target,fake,heavy||['assassin','knight','crab'].includes(style));}
      popNumber(target,`-${payload.damage||0}`,'damage player');screenShake(heavy?'heavy':'soft');
    },200);
    setTimeout(()=>actor.classList.remove('attacking-v40'),900);
  }""")

replace_func('acceptRoomUpdate',"""  function acceptRoomUpdate(next,{initial=false}={}){
    const prev=state.room;
    if(!initial&&prev&&Number(next?.seq||0)===Number(prev?.seq||0)&&next?.status===prev?.status)return;
    const after=initial?Number(next?.seq||0):Number(state.lastFxSeq||prev?.seq||0),changed=!!prev&&prev.status!==next?.status;
    const leavingBattle=!initial&&prev?.status==='battle'&&next?.status!=='battle';
    if(leavingBattle){
      // Keep the old battlefield visible while the final attacks/KO animations play.
      const choreography=playRoomEvents(next,after);state.lastFxSeq=Math.max(Number(state.lastFxSeq||0),Number(next?.seq||0));
      const delay=Math.min(2600,Math.max(520,choreography+120));
      setTimeout(()=>{state.room=next;renderRoom();playSceneCurtain(next);},delay);return;
    }
    state.room=next;state.lastFxSeq=Math.max(Number(state.lastFxSeq||0),Number(next?.seq||0));
    if(state.current.startsWith('room')||['route','battle','reward','event','end'].includes(state.current)||initial)renderRoom();
    if(changed&&!initial)playSceneCurtain(next);
    if(!initial)setTimeout(()=>{const choreography=playRoomEvents(next,after);setTimeout(()=>playCombatDelta(prev,next),Math.min(2400,Math.max(120,choreography+80)));},changed?260:0);
  }""")

# exact textual tweaks
old="""<button data-action="monster-evolve" data-mode="resonance" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.resonance<4?'disabled':''} title="RESONANCE 4">✦<small>공명</small></button><button data-action="monster-evolve" data-mode="rift" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.rift<3||selectedMon.hp/selectedMon.maxHp>.6?'disabled':''} title="HP 60%↓ + RIFT 3">◆<small>개화</small></button>"""
new="""<button data-action="monster-evolve" data-mode="resonance" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.resonanceTurns>0||selectedMon.resonance<4?'disabled':''} title="RESONANCE 4 · 3턴 초월">✦<small>공명</small></button><button data-action="monster-evolve" data-mode="rift" data-monster="${esc(selectedMon.instanceId)}" ${selectedMon.abyssBloom||selectedMon.rift<3||selectedMon.hp/selectedMon.maxHp>.6?'disabled':''} title="HP 60%↓ + RIFT 3 · 위험 초월">◆<small>개화</small></button>"""
if old in s:s=s.replace(old,new,1)
else: print('warning: control tweak not found')

# Add passive event handling after monster-hit case
needle="""      else if(ev.type==='monster-hit')later(()=>{const t=$(`[data-monster="${CSS.escape(ev.payload?.instanceId||'')}"]`);if(t){t.classList.add('monster-hit-v40');setTimeout(()=>t.classList.remove('monster-hit-v40'),420);}},160);
"""
insert=needle+"""      else if(ev.type==='monster-passive')later(()=>{const t=$(`[data-monster="${CSS.escape(ev.payload?.instanceId||'')}"]`);if(t){attackLabelV40(t,ev.payload?.passive||'PASSIVE','ally');shieldGainFx(t,ev.payload?.gold?0:4);}sound('reward');},260);
"""
if needle in s:s=s.replace(needle,insert,1)
else: print('warning: passive insertion not found')

p.write_text(s,encoding='utf-8')
print('finalized client choreography')
