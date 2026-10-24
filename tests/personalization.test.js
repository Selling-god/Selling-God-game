import test from 'node:test';
import assert from 'node:assert/strict';
import {Game,newCharacter,serialize,hydrate} from '../server/game.js';
import {ACHIEVEMENTS} from '../shared/expansion.js';
import {ITEMS,SHOP,getStats,NPCS} from '../shared/content.js';
import {COSMETICS,validPortrait,COSMETIC_SLOTS} from '../shared/personalization.js';
import {forgeQuote} from '../shared/forge.js';
import {expansionPanel,changeHonorView} from '../client/expansion-ui.js';
import {vanityPanel} from '../client/vanity-ui.js';
import {forgePanel} from '../client/forge-ui.js';

function setup(){
 const g=new Game({random:()=>.46});const p=g.addPlayer(newCharacter('one','PixelHero'));p.gold=100000;p.zone='town';
 p.lastCombat=0;g.now=Date.now();return {g,p};
}
const pixels='a'.repeat(24*32);
test('the catalogue has 300+ claimable, uniquely named titles, with earned-only stat bonuses',()=>{
 assert.ok(ACHIEVEMENTS.length>=300);
 assert.equal(new Set(ACHIEVEMENTS.map(a=>a.id)).size,ACHIEVEMENTS.length);
 assert.equal(new Set(ACHIEVEMENTS.map(a=>a.name)).size,ACHIEVEMENTS.length);
 assert.ok(ACHIEVEMENTS.filter(a=>a.stats).length>=30);
 const {g,p}=setup(),award=ACHIEVEMENTS.find(a=>a.stats?.atk);
 p.title=award.name;const before=getStats(p).atk;
 p.titles.push(award.name);const after=getStats(p).atk;
 assert.equal(after-before,award.stats.atk);
 assert.equal(g.action(p,{type:'title',title:'Unowned title'}).ok,false);
});
test('cosmetics are server-owned, bought with gold, equipped separately from gear and saved',()=>{
 const {g,p}=setup();const id=Object.keys(COSMETICS).find(id=>COSMETICS[id].slot==='aura'),item=COSMETICS[id];
 assert.equal(g.action(p,{type:'cosmeticEquip',slot:'aura',id}).ok,false);
 const oldGold=p.gold;
 assert.equal(g.action(p,{type:'cosmeticBuy',id}).ok,true);
 assert.equal(p.gold,oldGold-item.price);
 assert.equal(g.action(p,{type:'cosmeticBuy',id}).ok,false);
 assert.equal(g.action(p,{type:'cosmeticEquip',slot:'aura',id}).ok,true);
 assert.equal(g.action(p,{type:'cosmeticEquip',slot:'wings',id}).ok,false);
 assert.equal(p.vanity.slots.aura,id);
 assert.equal(serialize(p).vanity.slots.aura,id);
 assert.equal(hydrate(serialize(p)).vanity.slots.aura,id);
 assert.equal(g.publicPlayer(p).vanity.slots.aura,id);
 assert.equal(COSMETIC_SLOTS.length,5);
 const gear={...p.equipment};assert.deepEqual(p.equipment,gear);
 p.zone='forest';assert.equal(g.action(p,{type:'cosmeticBuy',id:Object.keys(COSMETICS).find(x=>x!==id)}).ok,false);
});
test('custom image requires consumable, stores only 24x32 indexed pixels and rejects invalid payload',()=>{
 const {g,p}=setup();
 assert.equal(SHOP.includes('portrait_ticket'),true);
 assert.equal(SHOP.includes('rename_ticket'),true);
 assert.equal(ITEMS.portrait_ticket.buy>0,true);
 assert.equal(validPortrait(pixels),true);
 assert.equal(validPortrait('f'.repeat(999999)),false);
 assert.equal(validPortrait('0'.repeat(24*32)),false);
 assert.equal(g.action(p,{type:'avatarApply',pixels}).ok,false);
 p.inventory.portrait_ticket=1;
 assert.equal(g.action(p,{type:'avatarApply',pixels:'hello'}).ok,false);
 assert.equal(g.action(p,{type:'avatarApply',pixels}).ok,true);
 assert.equal(p.inventory.portrait_ticket,0);
 assert.equal(g.publicPlayer(p).vanity.avatarPixels,pixels);
 const recovered=hydrate(serialize(p));assert.equal(recovered.vanity.avatarPixels,pixels);
 assert.equal(g.action(p,{type:'avatarClear'}).ok,true);
 assert.equal(p.vanity.avatarPixels,null);
 assert.equal(g.action(p,{type:'avatarApply',pixels}).ok,false);
});
test('server does not honor forged client rename actions',()=>{
 const {g,p}=setup();p.inventory.rename_ticket=1;
 assert.equal(g.action(p,{type:'renameConfirmed',name:'Hacker'}).ok,false);
 assert.equal(g.action(p,{type:'renameConfirmed',name:'Same',serverAuthorized:true}).ok,true);
 assert.equal(p.name,'Same');assert.equal(p.inventory.rename_ticket,0);
 assert.equal(g.action(p,{type:'renameConfirmed',name:'Again',serverAuthorized:true}).ok,false);
});
test('forge styles charge real different costs and chances while same rank persists on a failure',()=>{
 const {g,p}=setup();const smith=NPCS.find(n=>n.kind==='craft');p.x=smith.x;p.y=smith.y; p.level=30;p.inventory.ore=100;p.inventory.relic_dust=100;
 const id=p.equipment.weapon;p.enhancements[id]=4;
 const baseline=forgeQuote(4,0,1,'steady'),focus=forgeQuote(4,0,1,'focus'),celestial=forgeQuote(4,0,1,'celestial');
 assert.ok(focus.rate>baseline.rate&&celestial.rate>focus.rate);
 assert.ok(focus.gold>baseline.gold&&celestial.cost.relic_dust>baseline.cost.relic_dust);
 assert.equal(g.action(p,{type:'enhance',id,mode:'fake'}).ok,false);
 const gold=p.gold,ore=p.inventory.ore;
 const result=g.action(p,{type:'enhance',id,mode:'focus'});
 assert.equal(result.ok,true);assert.equal(result.mode,'focus');
 assert.equal(p.gold,gold-focus.gold);assert.equal(p.inventory.ore,ore-focus.cost.ore);
 assert.ok(p.enhancements[id]===4||p.enhancements[id]===5);
});
test('shop, forge and paginated honor views display safe actionable controls',()=>{
 const {p}=setup();
 const vanity=vanityPanel(p);
 assert.match(vanity.html,/portrait-file/);assert.match(vanity.html,/rename-input/);assert.match(vanity.html,/cosmeticBuy/);
 const forge=forgePanel(p,{id:p.equipment.weapon,mode:'steady',strikes:1,result:null});
 assert.match(forge.html,/forgeStrike/);assert.match(forge.html,/forgeMode/);
 changeHonorView({filter:'all',page:0});
 const view=expansionPanel('chronicle',{profile:p,tab:'achievements'});
 assert.match(view.html,/honorPage/);assert.match(view.html,/honorFilter/);
 assert.ok((view.html.match(/data-act="achievement"/g)||[]).length<=36);
});
