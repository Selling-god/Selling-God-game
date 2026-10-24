import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TITLE_CATALOG,TITLE_RENAMES,TITLE_BY_NAME,titleInfo,syncProgressTitles,migrateTitleNames} from '../shared/title-catalog.js';
import {newCharacter,hydrate,Game} from '../server/game.js';

// The patch must never change what an existing player's title progression earned.
test('320 distinct hand-authored titles retain stable IDs and unique aliases',()=>{
 assert.equal(TITLE_CATALOG.length,320);
 assert.equal(new Set(TITLE_CATALOG.map(t=>t.name)).size,320);
 assert.equal(new Set(TITLE_CATALOG.map(t=>t.id)).size,320);
 assert.equal(TITLE_RENAMES.size,320);
 assert.equal(TITLE_BY_NAME.size,330);
 assert.deepEqual(TITLE_CATALOG[0].id,'chronicle_01_01');
 assert.deepEqual(TITLE_CATALOG.at(-1).id,'chronicle_16_20');
 const ranks=['첫빛','작은씨앗','견습','새싹','초심','발견자','여행자','추적자','도전자','개척자','숙련자','길잡이','별지기','수호자','선봉','영웅','대가','전설','초월자','영원의별'];
 for(let i=0;i<320;i++){
  const row=TITLE_CATALOG[i],level=i%20;
  assert.ok(row.theme&&row.description&&Number.isFinite(row.goal)&&row.goal>0,row.name);
  assert.equal(row.rarity,level>=17?'legendary':level>=13?'epic':level>=9?'rare':level>=5?'uncommon':'common');
  assert.equal(TITLE_RENAMES.size,320);
  assert.equal(TITLE_BY_NAME.get(row.name),row);
 }
 const samples=[['꿈꾸는 별 · 첫빛','chronicle_01_01'],['끝없는 승부 · 영원의별','chronicle_02_20'],['숙련의 궤도 · 전설','chronicle_16_18']];
 for(const [oldName,id] of samples)assert.equal(titleInfo(oldName).id,id);
});

test('old earned names migrate one-to-one, preserving equipped choice and story title',()=>{
 const save=newCharacter('title-migrate-1','모험가','novice');
 save.titles=['별빛을 따라온 자','꿈꾸는 별 · 첫빛','불굴의 연금 · 영원의별','어둠을 지킨 사람','꿈꾸는 별 · 첫빛'];
 save.title='불굴의 연금 · 영원의별';
 save.gold=0;save.level=1;save.enhancements={};
 const loaded=hydrate(save);
 assert.equal(loaded.title,TITLE_RENAMES.get('불굴의 연금 · 영원의별'));
 assert.ok(loaded.titles.includes('어둠을 지킨 사람'));
 assert.ok(loaded.titles.includes(TITLE_RENAMES.get('꿈꾸는 별 · 첫빛')));
 assert.equal(loaded.titles.length,new Set(loaded.titles).size);
 assert.ok(!loaded.titles.some(t=>TITLE_RENAMES.has(t)));
 const before=loaded.titles.slice();
 syncProgressTitles(loaded);
 assert.deepEqual(loaded.titles,before,'No duplicate awards after migration');
});

test('previously earned gold title remains owned after spending the gold',()=>{
 const p={titles:['황금의 별 · 전설'],title:'황금의 별 · 전설',gold:0,level:1};
 migrateTitleNames(p);
 assert.equal(p.title,TITLE_RENAMES.get('황금의 별 · 전설'));
 assert.ok(p.titles.includes(p.title));
 syncProgressTitles(p);
 assert.ok(p.titles.includes(p.title));
});

test('title changes are server-checked and migrate for multiplayer snapshots',()=>{
 const game=new Game({send:()=>{},broadcast:()=>{}});
 const p=game.addPlayer(newCharacter('title-switcher','테스터','novice'));
 p.titles.push('꿈꾸는 별 · 여행자');p.title='꿈꾸는 별 · 여행자';
 game.mark(p);
 const changed=TITLE_RENAMES.get('꿈꾸는 별 · 여행자');
 assert.equal(p.title,changed);
 const available=game.privatePlayer(p);
 assert.ok(available.titles.includes(changed));
 assert.equal(game.action(p,{type:'title',title:'미획득 가짜 칭호'}).ok,false);
 assert.equal(game.action(p,{type:'title',title:changed}).ok,true);
 assert.equal(game.snapshot(p,true).self.title,changed);
});

test('HUD exposes a title panel button independent of settings',()=>{
 const root=new URL('../',import.meta.url);
 const html=readFileSync(new URL('public/index.html',root),'utf8');
 const main=readFileSync(new URL('client/main.js',root),'utf8');
 assert.match(html,/data-panel="titles"/);
 assert.match(main,/modal==='titles'/);
 assert.match(main,/data-act="equipTitle"/);
 assert.match(main,/title='칭호 보관함'/);
 assert.match(main,/renderTitleGallery\(p\)/);
 assert.doesNotMatch(main,/id="title-select"/);
});
