import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game,newCharacter} from '../server/game.js';
import {ITEMS,MONSTERS} from '../shared/content.js';
import {WORLD_BOSSES} from '../shared/expansion.js';
import {COSMETICS,COSMETIC_SLOTS,luxuryCosmeticPrice} from '../shared/personalization.js';

// These checks protect the fixes users explicitly requested on October 24.
test('cosmetic prices are five to ten times prior prices while starter sets remain free',()=>{
  const known=[['costume_00',560],['costume_07',8000],['aura_08',400],['wings_21',9500],['nametag_22',320],['entrance_36',9500]];
  for(const [id,oldPrice] of known){
    const cost=COSMETICS[id].price;
    assert.ok(cost>=oldPrice*5&&cost<=oldPrice*10+49,`${id}: ${oldPrice} => ${cost}`);
    assert.equal(cost,luxuryCosmeticPrice(oldPrice));
  }
  for(const slot of COSMETIC_SLOTS){
    const group=Object.values(COSMETICS).filter(x=>x.slot===slot);
    assert.ok(group.length>=100,slot);
    assert.equal(group.filter(x=>x.price===0).length,1,`${slot} retains exactly one free starter`);
    assert.ok(group.filter(x=>x.price>0).every(x=>x.price>=1300),`${slot} minimum paid cost`);
  }
  assert.equal(ITEMS.rename_ticket.buy,17600);
  assert.equal(ITEMS.portrait_ticket.buy,10500);
});

test('server uses increased catalogue price, debits exact gold and preserves equipped item',()=>{
  const game=new Game({random:()=>.46});
  const p=game.addPlayer(newCharacter('pricing-test','가격검증'));
  p.gold=1000000;
  const item=COSMETICS['costume_00'];
  const before=p.gold;
  const res=game.action(p,{type:'cosmeticBuy',id:item.id,price:1});
  assert.equal(res.ok,true);
  assert.equal(p.gold,before-item.price);
  assert.equal(p.vanity.slots.costume,item.id);
  assert.equal(game.action(p,{type:'cosmeticBuy',id:item.id}).ok,false);
});

test('server global chat announcements do not include ordinary bosses, but include world bosses',()=>{
  const announcements=[];
  const game=new Game({broadcast:(zone,channel,payload)=>announcements.push({zone,channel,payload}),random:()=>.46});
  game.addPlayer(newCharacter('btest','보스구분'));
  const zone='forest',boss='moss_guardian';
  assert.ok(MONSTERS[boss]?.boss);
  const local=game.makeMob('ordinary-boss',boss,800,800);
  game.killMob(zone,local);
  assert.equal(announcements.some(x=>x.channel==='system'||x.channel==='worldNotice'),false);
  const worldDef=WORLD_BOSSES[0];
  const worldBoss=game.makeMob('world-boss-test',worldDef.type,800,800);
  game.killMob(worldDef.zone,worldBoss);
  assert.ok(announcements.some(x=>x.channel==='worldNotice'&&x.payload.kind==='worldBoss'&&x.payload.event==='defeated'));
});

test('client filters local boss/trial notices out of chat, with official world boss tags',()=>{
  const script=readFileSync(new URL('../client/main.js',import.meta.url),'utf8');
  const worldEvents=readFileSync(new URL('../server/world-events.js',import.meta.url),'utf8');
  assert.match(script,/data\.kind==='worldBoss'&&\(data\.event==='spawn'/);
  assert.match(script,/data\.kind==='bossMechanic'/);
  assert.match(worldEvents,/kind:'worldBoss',event:'spawn'/);
  assert.doesNotMatch(script,/net\.on\('system',e=>addChat/);
});
