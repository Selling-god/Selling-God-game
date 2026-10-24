import {enhancementSpec} from './rpg.js';
export const FORGE_STYLES={
  steady:{name:'정밀 타격',desc:'기본 성공률 · 기본 비용',color:'#c6cdbf'},
  focus:{name:'불꽃 담금질',desc:'추가 골드와 광석으로 성공률 +8%p',color:'#e4aa80'},
  celestial:{name:'별의 축복',desc:'기억의 가루 1개 추가로 성공률 +15%p',color:'#b3a5ee'}
};
export function forgeQuote(level,pity,itemLevel,mode='steady'){
  const base=enhancementSpec(level,pity,itemLevel);
  if(!Object.hasOwn(FORGE_STYLES,mode))return null;
  if(base.max)return {...base,mode};
  if(mode==='steady'||base.next<=3)return {...base,mode:base.next<=3?'steady':mode};
  const cost={...base.cost};let gold=base.gold,rate=base.rate;
  if(mode==='focus'){
    gold+=Math.ceil(base.gold*.5);cost.ore=(cost.ore||0)+2;rate=Math.min(1,rate+.08);
  }else{
    gold+=Math.ceil(base.gold*.8);cost.relic_dust=(cost.relic_dust||0)+1;rate=Math.min(1,rate+.15);
  }
  return {...base,gold,cost,rate,mode};
}
