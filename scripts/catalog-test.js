'use strict';
const fs=require('fs');const path=require('path');const c=JSON.parse(fs.readFileSync(path.join(__dirname,'..','data','catalog.json'),'utf8'));
const ids=new Set(c.cards.map(x=>x.id));if(c.cards.length!==315)throw Error(`cards ${c.cards.length}`);if(ids.size!==315)throw Error('duplicate card ids');
for(const r of ['common','rare','ultra','legendary','mythic'])if(!c.cards.some(x=>x.rarity===r))throw Error(`missing rarity ${r}`);
for(const t of ['unit','spell'])if(!c.cards.some(x=>x.type===t))throw Error(`missing type ${t}`);
if(c.items.length<40)throw Error('not enough items');if(c.biomes.length!==5)throw Error('expected 5 biomes');if(c.bosses.length!==5)throw Error('expected 5 bosses');
if(Object.keys(c.difficulties).sort().join(',')!=='hard,hell,normal')throw Error('difficulty catalog mismatch');
console.log(`CATALOG_OK cards=${c.cards.length} items=${c.items.length} enemies=${c.enemies.length} bosses=${c.bosses.length}`);
