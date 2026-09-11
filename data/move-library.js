'use strict';

/**
 * RIFT DECK original monster move library.
 * This module intentionally does not copy move data, names, code, or assets from
 * any other game. It provides a large learnset/TM-like surface for the project's
 * own 12 elements and 20 monster archetypes.
 */

const ELEMENTS = ['화염','물','자연','빛','그림자','강철','바람','번개','별','시간','공허','수정'];

const ELEMENT_THEMES = {
  '화염': { roots:['잿불','홍련','용광','태양','화산','화염륜','적열'], forms:['베기','탄환','쇄도','장막','추격','폭발'] },
  '물': { roots:['물결','해류','청람','심해','포말','조류','수압'], forms:['치기','수탄','쇄도','장막','추격','분쇄'] },
  '자연': { roots:['덩굴','씨앗','수목','화원','녹음','포자','거목'], forms:['채찍','포격','쇄도','장막','추격','분쇄'] },
  '빛': { roots:['광휘','프리즘','성광','여명','백야','태양문','광륜'], forms:['일격','광선','쇄도','장막','추격','낙하'] },
  '그림자': { roots:['암영','흑막','심연','월식','망령','야음','흑월'], forms:['할퀴기','탄환','쇄도','은신','추격','절단'] },
  '강철': { roots:['철편','합금','자력','궤도','강철','기어','철성'], forms:['베기','포탄','쇄도','장벽','추격','강타'] },
  '바람': { roots:['돌풍','진공','회오리','폭풍','청풍','하늘칼','풍압'], forms:['치기','칼날','쇄도','장막','추격','난무'] },
  '번개': { roots:['전격','연쇄','전하','낙뢰','뇌광','볼트','천뢰'], forms:['찌르기','방전','쇄도','보호막','추격','폭주'] },
  '별': { roots:['성편','혜성','별무리','초신성','성운','천구','유성'], forms:['타격','투사','쇄도','장막','추격','낙하'] },
  '시간': { roots:['시차','역행','순간','크로노','초침','윤회','시간축'], forms:['타격','파동','쇄도','방벽','추격','붕괴'] },
  '공허': { roots:['공허','중력','무공','붕괴','암흑점','허상','영점'], forms:['물기','탄환','쇄도','장막','추격','분해'] },
  '수정': { roots:['수정','결정','빙정','유리','보석','결정핵','프랙탈'], forms:['찌르기','포화','쇄도','갑주','추격','폭쇄'] }
};

const ARCHETYPE_THEMES = {
  slime:['점액','분열','흡착','유동','포식','증식'], wing:['급강하','활공','익풍','공중제압','깃날','비상'],
  beast:['야성','사냥','포효','돌진','추적','발톱'], spirit:['정령','영맥','공명','혼광','유체','영혼'],
  watcher:['관측','초점','예측','주시','굴절','봉쇄'], insect:['키틴','군체','탈피','침각','갑각','날개막'],
  golem:['지각','암반','거석','진동','석벽','대지핵'], mimic:['탐욕','복제','위장','모방','포식상자','가짜보물'],
  priest:['성역','기도','축복','정화','성가','서약'], knight:['방패','성벽','기병','수호','결투','철진'],
  assassin:['암습','연참','그림자걸음','급소','침묵','잔상'], wraith:['흡혼','원혼','망령','영식','저주','유령화'],
  tyrant:['왕의압박','폭군','군림','위압','포고','왕좌'], serpent:['맹독','감김','독니','비늘','사행','독무'],
  crab:['갑각','집게','반격','해저갑주','횡보','수문'], mushroom:['포자','균사','발아','독버섯','균막','증식'],
  drone:['정밀','추적','레이더','포격','재밍','자동조준'], leviathan:['해일','심해','거체','파도압','격랑','잠행'],
  phoenix:['재점화','불사','회생','불꽃날개','재생','화신'], puppet:['모방','인형실','꼭두각시','연계','교체','가면']
};

const ARCH_FORMS = ['타격','전개','전환','극식'];
const UNIVERSAL_SCHOOLS = ['전위','수호','회복','교란','연계','공명','추적','파쇄','집중','역전','잔향','균열'];
const UNIVERSAL_FORMS = ['Ⅰ','Ⅱ','Ⅲ','Ⅳ','Ⅴ','Ⅵ','Ⅶ','Ⅷ','Ⅸ','Ⅹ'];

function slug(value){ return Buffer.from(String(value)).toString('hex').slice(0,24); }
function hash(value){ let h=2166136261; for(const ch of String(value)){h^=ch.codePointAt(0);h=Math.imul(h,16777619);} return h>>>0; }
function rotate(arr,n){ if(!arr.length)return[]; const x=((n%arr.length)+arr.length)%arr.length; return arr.slice(x).concat(arr.slice(0,x)); }
function clone(x){ return JSON.parse(JSON.stringify(x)); }

function behaviorFor(i, scale=1){
  const v=i%12, tier=Math.floor(i/12); const p=Math.round((5+tier*2)*scale);
  if(v===0)return{kind:'attack',power:p+4,ratio:.76+.03*tier,accuracy:100,cooldown:0,summary:'빠르고 안정적인 공격'};
  if(v===1)return{kind:'attack',power:p+7,ratio:.96+.04*tier,accuracy:96,cooldown:1,resonance:1,summary:'속성 공명을 쌓는 공격'};
  if(v===2)return{kind:'burst',power:p+11,ratio:1.24+.05*tier,accuracy:90,cooldown:2,stagger:10+tier*2,summary:'BREAK에 강한 결정기'};
  if(v===3)return{kind:'guard',power:0,ratio:0,accuracy:100,cooldown:1,shield:10+tier*3,summary:'자신에게 보호막 부여'};
  if(v===4)return{kind:'attack',power:p+5,ratio:.88+.03*tier,accuracy:98,cooldown:1,stagger:14+tier*3,summary:'자세를 무너뜨리는 공격'};
  if(v===5)return{kind:'heal',power:0,ratio:0,accuracy:100,cooldown:2,heal:10+tier*4,summary:'자신의 체력 회복'};
  if(v===6)return{kind:'attack',power:p+4,ratio:.84+.03*tier,accuracy:97,cooldown:1,lifesteal:.25+Math.min(.15,tier*.03),summary:'피해 일부를 흡수'};
  if(v===7)return{kind:'status',power:0,ratio:0,accuracy:100,cooldown:2,boost:2+tier,resonance:1,summary:'전투력을 끌어올리는 전술'};
  if(v===8)return{kind:'attack',power:p+3,ratio:.78+.03*tier,accuracy:95,cooldown:1,splash:.35+Math.min(.2,tier*.04),summary:'주변 적에게 파급 피해'};
  if(v===9)return{kind:'guard',power:0,ratio:0,accuracy:100,cooldown:2,shield:7+tier*2,heal:6+tier*2,summary:'방어와 회복을 동시에 수행'};
  if(v===10)return{kind:'status',power:0,ratio:0,accuracy:100,cooldown:2,draw:1,resonance:2,summary:'스펠과 연계되는 공명 전술'};
  return{kind:'burst',power:p+9,ratio:1.12+.05*tier,accuracy:92,cooldown:2,vulnerable:1,stagger:8+tier*2,summary:'적에게 빈틈을 남기는 강공'};
}

const MOVE_LIBRARY=[];
const ELEMENT_MOVE_IDS={};
for(const element of ELEMENTS){
  const theme=ELEMENT_THEMES[element]; ELEMENT_MOVE_IDS[element]=[];
  theme.roots.forEach((root,ri)=>theme.forms.forEach((form,fi)=>{
    const idx=ri*theme.forms.length+fi; const id=`el:${slug(element)}:${idx}`; const move={id,name:`${root} ${form}`,element,icon:fi===3?'⬢':fi===5?'✹':'✦',...behaviorFor(idx,1)};
    MOVE_LIBRARY.push(move); ELEMENT_MOVE_IDS[element].push(id);
  }));
}

const ARCHETYPE_MOVE_IDS={};
Object.entries(ARCHETYPE_THEMES).forEach(([arch,roots])=>{
  ARCHETYPE_MOVE_IDS[arch]=[];
  roots.forEach((root,ri)=>ARCH_FORMS.forEach((form,fi)=>{
    const idx=ri*ARCH_FORMS.length+fi; const id=`arch:${arch}:${idx}`; const move={id,name:`${root} ${form}`,element:null,icon:fi===3?'✹':'◇',archetype:arch,...behaviorFor(idx+3,.92)};
    move.summary=`${root} 계통 · ${move.summary}`; MOVE_LIBRARY.push(move); ARCHETYPE_MOVE_IDS[arch].push(id);
  }));
});

const UNIVERSAL_MOVE_IDS=[];
UNIVERSAL_SCHOOLS.forEach((school,si)=>UNIVERSAL_FORMS.forEach((form,fi)=>{
  const idx=si*UNIVERSAL_FORMS.length+fi; const id=`uni:${si}:${fi}`; const move={id,name:`${school} 전술 ${form}`,element:null,icon:'◎',universal:true,...behaviorFor(idx+6,.82)};
  move.summary=`범용 ${school} 계통 · ${move.summary}`; MOVE_LIBRARY.push(move); UNIVERSAL_MOVE_IDS.push(id);
}));

const MOVE_BY_ID=Object.fromEntries(MOVE_LIBRARY.map(m=>[m.id,m]));

const LEVEL_MILESTONES=[1,1,1,1,8,11,14,17,20,24,28,32,36,41,46,51,56,62,68,74,81,88,95];

function levelMovePool(monster){
  const seed=hash(monster.id); const el=rotate(ELEMENT_MOVE_IDS[monster.element]||UNIVERSAL_MOVE_IDS,seed%42);
  const ar=rotate(ARCHETYPE_MOVE_IDS[monster.archetype]||UNIVERSAL_MOVE_IDS,(seed>>>4)%24);
  const uni=rotate(UNIVERSAL_MOVE_IDS,(seed>>>9)%120);
  const pool=[]; let ei=0,ai=0,ui=0;
  while(pool.length<LEVEL_MILESTONES.length){
    const mode=pool.length%5;
    const id=mode===1||mode===4?ar[ai++%ar.length]:mode===3?uni[ui++%uni.length]:el[ei++%el.length];
    if(id&&!pool.includes(id))pool.push(id);
  }
  return pool;
}

function speciesLearnset(monster){
  const pool=levelMovePool(monster);
  // Every starter needs at least one direct attack and one utility option. We swap
  // candidates before assigning level milestones so the learnset remains unique.
  const starter=pool.slice(0,4).map(id=>MOVE_BY_ID[id]);
  if(!starter.some(m=>m&&['attack','burst'].includes(m.kind))){const j=pool.findIndex((id,i)=>i>=4&&['attack','burst'].includes(MOVE_BY_ID[id]?.kind));if(j>=4)[pool[3],pool[j]]=[pool[j],pool[3]];}
  const first4=pool.slice(0,4).map(id=>MOVE_BY_ID[id]);
  if(!first4.some(m=>m&&!['attack','burst'].includes(m.kind))){const j=pool.findIndex((id,i)=>i>=4&&!['attack','burst'].includes(MOVE_BY_ID[id]?.kind));if(j>=4)[pool[2],pool[j]]=[pool[j],pool[2]];}
  return pool.map((id,i)=>{const base=clone(MOVE_BY_ID[id]);base.element=base.element||monster.element;base.learnLevel=LEVEL_MILESTONES[i];base.unlockLevel=LEVEL_MILESTONES[i];base.source='level';return base;});
}

function initialMoves(monster){ return speciesLearnset(monster).slice(0,4).map(m=>({...m,unlockLevel:1,learnLevel:1})); }

function levelMovesBetween(monster,fromExclusive,toInclusive){
  return speciesLearnset(monster).filter(m=>Number(m.learnLevel)>Number(fromExclusive)&&Number(m.learnLevel)<=Number(toInclusive));
}

function skillDiscPool(monster){
  const seed=hash(`${monster.id}:disc`); const used=new Set(speciesLearnset(monster).map(x=>x.id));
  const mixed=[
    ...rotate(ELEMENT_MOVE_IDS[monster.element]||[],seed%42),
    ...rotate(ARCHETYPE_MOVE_IDS[monster.archetype]||[],(seed>>>3)%24),
    ...rotate(UNIVERSAL_MOVE_IDS,(seed>>>7)%120)
  ];
  const out=[];
  for(const id of mixed){if(!used.has(id)&&!out.includes(id)){const m=clone(MOVE_BY_ID[id]);m.element=m.element||monster.element;m.unlockLevel=1;m.learnLevel=0;m.source='disc';out.push(m);}if(out.length>=32)break;}
  return out;
}

function discChoices(monster,level=1,count=3,nonce=0){
  const pool=skillDiscPool(monster); if(!pool.length)return[]; const seed=hash(`${monster.id}:${level}:${nonce}`); return rotate(pool,seed%pool.length).slice(0,count).map(clone);
}

function evolutionLevel(monster){
  const cost=Math.max(1,Number(monster.pointCost||1));
  if(monster.tier==='boss')return 30;
  if(cost>=5)return 27;if(cost===4)return 24;if(cost===3)return 21;if(cost===2)return 18;return 16;
}

function xpNeededForLevel(level){
  const l=Math.max(1,Number(level||1));
  return Math.round(28+l*6.2+Math.pow(l,1.22)*2.6);
}

function battleXpForFloor(floor,tier='common',difficulty='normal'){
  const f=Math.max(1,Number(floor||1)); const tierBonus=tier==='boss'?30:tier==='elite'?16:0; const diff=difficulty==='hell'?1.12:difficulty==='hard'?1.06:1;
  return Math.round((22+f*1.45+tierBonus)*diff);
}

function movePoolCountFor(monster){ return new Set([...speciesLearnset(monster).map(x=>x.id),...skillDiscPool(monster).map(x=>x.id)]).size; }

module.exports={
  MOVE_LIBRARY,MOVE_BY_ID,ELEMENT_MOVE_IDS,ARCHETYPE_MOVE_IDS,UNIVERSAL_MOVE_IDS,
  speciesLearnset,initialMoves,levelMovesBetween,skillDiscPool,discChoices,
  evolutionLevel,xpNeededForLevel,battleXpForFloor,movePoolCountFor
};
