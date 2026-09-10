'use strict';
const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
const required=['server.js','public/index.html','public/app.js','public/styles.css','data/catalog.json'];
for(const rel of required){const p=path.join(root,rel);if(!fs.existsSync(p))throw new Error(`BUILD_FAIL missing ${rel}`);}
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
if(catalog.cards.length!==315)throw new Error(`BUILD_FAIL expected 315 cards, got ${catalog.cards.length}`);
if(catalog.items.length<40)throw new Error(`BUILD_FAIL expected >=40 items, got ${catalog.items.length}`);
if(Object.keys(catalog.difficulties||{}).length!==3)throw new Error('BUILD_FAIL expected 3 difficulties');
let missing=[];
for(const c of catalog.cards){const p=path.join(root,c.art.replace(/^\//,''));if(!fs.existsSync(p))missing.push(c.art);}
for(const b of catalog.biomes){const p=path.join(root,b.background.replace(/^\//,''));if(!fs.existsSync(p))missing.push(b.background);}
for(const e of [...catalog.enemies,...catalog.bosses]){const p=path.join(root,e.sprite.replace(/^\//,''));if(!fs.existsSync(p))missing.push(e.sprite);}
if(missing.length)throw new Error(`BUILD_FAIL missing ${missing.length} assets: ${missing.slice(0,5).join(', ')}`);
const info={version:'2.0.0',builtAt:new Date().toISOString(),cards:catalog.cards.length,items:catalog.items.length,enemies:catalog.enemies.length+catalog.bosses.length,maxDungeonFloor:50,difficulties:Object.keys(catalog.difficulties)};
fs.writeFileSync(path.join(root,'public','build-info.json'),JSON.stringify(info,null,2));
console.log(`BUILD_OK v${info.version} cards=${info.cards} items=${info.items} enemies=${info.enemies} floors=${info.maxDungeonFloor}`);
