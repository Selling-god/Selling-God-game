import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,newCharacter} from '../server/game.js';
import {NPCS,ITEMS,MONSTERS,getStats} from '../shared/content.js';
import {xpRequired} from '../shared/rpg.js';
import {HIDDEN_TITLES,TITLE_CATALOG,titleStatBonus,titleStatLabel,titleProgress} from '../shared/title-catalog.js';
import {syncHiddenTitles} from '../server/hidden-titles.js';

const source=file=>readFileSync(new URL('../'+file,import.meta.url),'utf8');
function trader(){
 const g=new Game({send:()=>{},broadcast:()=>{}}),p=g.addPlayer(newCharacter('batch-sale','Merchant Test','guardian'));
 const n=NPCS.find(n=>n.kind==='shop');
 Object.assign(p,{zone:n.zone,x:n.x,y:n.y});
 p.inventory.ore=83;
 return {g,p};
}

test('server supports 1, 10, custom and all-at-once sales with exact inventory and gold accounting',()=>{
 const {g,p}=trader(),initial=p.gold;
 const unit=ITEMS.ore.sell;
 for(const [amount,left] of [[1,82],[10,72],[17,55],[55,0]]){
  const result=g.action(p,{type:'sell',id:'ore',count:amount});
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(p.inventory.ore,left);
 }
 assert.equal(p.gold-initial,83*unit);
 assert.match(source('client/main.js'),/data-act="sellCount"/);
 assert.match(source('client/main.js'),/data-act="sellCustom"/);
 assert.match(source('client/main.js'),/전량/);
});

test('bad batch sale quantities and protected equipment never mutate inventory or gold',()=>{
 const {g,p}=trader(),before={gold:p.gold,ore:p.inventory.ore};
 for(const count of [0,-1,1.2,9999,10000,'invalid',null]){
  const result=g.action(p,{type:'sell',id:'ore',count});
  assert.equal(result.ok,false,String(count));
  assert.deepEqual({gold:p.gold,ore:p.inventory.ore},before);
 }
 const equipped=p.equipment.weapon;
 assert.equal(g.action(p,{type:'sell',id:equipped,count:1}).ok,false);
 p.enhancements.ore=1;
 assert.equal(g.action(p,{type:'sell',id:'ore',count:2}).ok,false);
 assert.deepEqual({gold:p.gold,ore:p.inventory.ore},before);
});

test('harder milestone targets and rarer title rewards scale with achievement difficulty',()=>{
 assert.equal(TITLE_CATALOG.length,320);
 assert.equal(HIDDEN_TITLES.length,12);
 assert.ok(TITLE_CATALOG.every(t=>t.goal>0&&t.bonus));
 const low=TITLE_CATALOG[0],high=TITLE_CATALOG[19];
 assert.ok(low.goal>=7&&high.goal>low.goal);
 assert.ok(titleStatBonus(high.name).atk>titleStatBonus(low.name).atk);
 assert.ok(titleStatBonus(high.name).hp>titleStatBonus(low.name).hp);
 assert.ok(titleStatBonus(HIDDEN_TITLES.at(-1).name).hp>titleStatBonus(high.name).hp);
 assert.match(titleStatLabel(high.name),/공격력/);
 assert.ok(TITLE_CATALOG[20].goal>5,'first combat title no longer unlocks after 5 kills');
});

test('only the equipped, actually owned title can change server-calculated statistics',()=>{
 const {g,p}=trader(),a=TITLE_CATALOG[5].name,b=TITLE_CATALOG[17].name;
 p.titles.push(a,b);
 const base=g.stats(p),previous=titleStatBonus(p.title),result=g.action(p,{type:'title',title:b}),bonus=titleStatBonus(b);
 assert.equal(result.ok,true);
 const active=g.stats(p);
 assert.equal(active.atk-base.atk,(bonus.atk||0)-(previous.atk||0));
 assert.equal(active.maxHp-base.maxHp,(bonus.hp||0)-(previous.hp||0));
 assert.equal(active.def-base.def,(bonus.def||0)-(previous.def||0));
 assert.equal(g.action(p,{type:'title',title:'가짜 절대자'}).ok,false);
 // A forged equipped name cannot modify stats if it was not earned.
 p.title='가짜 절대자';assert.equal(g.stats(p).atk,base.atk-(previous.atk||0));
 assert.equal(g.stats(p).maxHp,base.maxHp-(previous.hp||0));
});

test('all twelve secret titles have server-only unlock checks; their user-facing gallery never exposes conditions',()=>{
 const {g,p}=trader();
 assert.ok(HIDDEN_TITLES.every(t=>t.hidden&&!('metric' in t)&&!('goal' in t)));
 assert.equal(new Set(HIDDEN_TITLES.map(t=>t.name)).size,12);
 assert.ok(!source('shared/title-catalog.js').includes('achievementChecks'));
 assert.match(source('server/hidden-titles.js'),/achievementChecks/);
 assert.match(source('client/main.js'),/해금 방법 비공개/);
 assert.match(source('client/main.js'),/data\.hidden&&!has\?'':titleStatLabel/);
 assert.deepEqual(syncHiddenTitles(p),[]);
 p.level=35;p.kills=1200;
 const newly=syncHiddenTitles(p);
 assert.equal(newly.length,1);
 assert.equal(newly[0].name,HIDDEN_TITLES[0].name);
 assert.deepEqual(syncHiddenTitles(p),[],'repeated save and progress updates cannot duplicate an earned title');
});

test('progress and combat balance require more effort than base enemy and XP formula',()=>{
 assert.ok(xpRequired(1)>=300);
 assert.ok(xpRequired(20)>xpRequired(10)*2);
 assert.ok(MONSTERS.slime.hp>45,'common early monsters survive more than one hit');
 const low=newCharacter('novice-base','Newcomer','novice');
 const guardian=newCharacter('guardian-base','Fighter','guardian');
 const stats=getStats(low),classStats=getStats(guardian);
 assert.ok(stats.atk<classStats.atk,'starter class should not overpower early specialized jobs');
});

test('title popups are destroyed after a short timeout even with neon animations',()=>{
 const code=source('client/main.js');
 const start=code.indexOf('function showNextTitleAward(){'),end=code.indexOf('function beginGame(',start);
 assert.ok(start>=0&&end>start);
 const routine=code.slice(start,end);
 assert.match(routine,/setTimeout\(\(\)=>\{/);
 assert.match(routine,/root\.remove\(\)/);
 assert.match(routine,/,3000\)/);
});
