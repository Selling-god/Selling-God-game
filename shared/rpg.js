/** Shared rules. The server remains authoritative for all character changes. */
export const ATTRIBUTES={
 str:{name:'힘',short:'STR',desc:'근접 공격력 +1.8 / 다른 계열 +0.55'},
 dex:{name:'민첩',short:'DEX',desc:'사격 공격력 +1.7 / 다른 계열 +0.5 · 이동 +0.3 · 치명타 +0.08%'},
 int:{name:'지능',short:'INT',desc:'마법 공격력 +1.8 / 다른 계열 +0.45 · 마나 +4 · 초당 마나회복 +0.03'},
 vit:{name:'체력',short:'VIT',desc:'최대 체력 +12 · 방어력 +0.4'},
 luk:{name:'행운',short:'LUK',desc:'치명타 확률 +0.22%'}
};
export const ATTRIBUTE_KEYS=Object.keys(ATTRIBUTES);
export const POINTS_PER_LEVEL=4;
export const MAX_ENHANCE=10;
export const DEATH_RULES={safeLevel:4,goldRate:.03,goldCap:500,xpRate:.03,graveMs:10*60000,weakMs:60000,goldRecovery:.8};
export const statBudget=level=>Math.max(0,(Math.min(30,Math.max(1,Math.floor(Number(level)||1)))-1)*POINTS_PER_LEVEL);
export const spentPoints=p=>ATTRIBUTE_KEYS.reduce((n,k)=>n+(p.attributes?.[k]||0),0);
export const freePoints=p=>Math.max(0,statBudget(p.level)-spentPoints(p));
export function cleanAttributes(input,level){
 let left=statBudget(level);
 return Object.fromEntries(ATTRIBUTE_KEYS.map(k=>{
  const n=Number(input?.[k]),v=Number.isSafeInteger(n)?Math.max(0,Math.min(n,100,left)):0;
  left-=v;return [k,v];
 }));
}
export function enhancementSpec(level,failures=0,itemLevel=1){
 level=Math.max(0,Math.min(MAX_ENHANCE,Math.floor(level||0)));
 if(level>=MAX_ENHANCE)return {max:true,level,rate:1,gold:0,cost:{}};
 const next=level+1;
 const rates=[1,1,1,.8,.7,.6,.5,.4,.3,.25];
 const rate=Math.min(1,Math.round((rates[level]+Math.max(0,failures)*.1)*100)/100);
 const cost={ore:next+1};
 if(next>=4)cost.relic_dust=Math.ceil((next-2)/2);
 if(next>=7)cost.world_token=next-6;
 return {max:false,level,next,rate,baseRate:rates[level],pity:failures,
  gold:60*next+(next>=4?(next-3)*100:0),cost};
}
export function enhancementBonus(slot,n=0){
 n=Math.max(0,Math.min(MAX_ENHANCE,Math.floor(n)));
 return slot==='weapon'?{atk:n*3+(n>=7?(n-6)*2:0)}:
 slot==='armor'?{def:n,hp:n>=4?(n-3)*8:0}:{def:n,mp:n>=4?(n-3)*4:0};
}
export function deathLoss(p,xpNeeded){
 if(p.level<=DEATH_RULES.safeLevel)return {gold:0,xp:0};
 return {gold:Math.min(DEATH_RULES.goldCap,Math.floor(Math.max(0,p.gold)*DEATH_RULES.goldRate)),
  xp:Math.min(Math.max(0,Math.floor(p.xp||0)),Math.floor(xpNeeded*DEATH_RULES.xpRate))};
}
export const resetPrice=p=>(p.statResets||0)===0?0:500;
export const equipmentVisual=id=>{
 if(!id)return null;
 const tier=id.startsWith('astral')?6:id.startsWith('boss_')?5:id.startsWith('horizon')||id==='explorer_coat'||id==='relic_charm'?5:
 id.startsWith('dawn')?4:id.startsWith('star')||id==='moon_robe'||id==='moon_charm'?3:
 id.startsWith('moon')||id==='moss_charm'?2:id==='leather'||id==='charm'?1:0;
 const palette=['#8c9c9d','#7eae8e','#a7cdda','#bcabdf','#edcd8a','#7ed2cb','#b6b6f3'];
 return {tier,color:palette[tier]};
};
