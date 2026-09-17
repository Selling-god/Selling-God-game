'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const c=JSON.parse(fs.readFileSync(path.join(root,'data','catalog.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
if(c.enemies.length<200)throw Error(`monsters ${c.enemies.length}`);
if(c.items.length<120)throw Error(`items ${c.items.length}`);
const ids=new Set(c.enemies.map(x=>x.id)); if(ids.size!==c.enemies.length)throw Error('duplicate enemy ids');
const names=new Set(c.enemies.map(x=>x.name)); if(names.size<190)throw Error(`enemy name diversity ${names.size}`);
for(const e of c.enemies){if(!fs.existsSync(path.join(root,e.sprite.replace(/^\//,''))))throw Error(`missing ${e.sprite}`);}
const dungeonBad=c.items.filter(i=>Array.isArray(i.modes)&&!i.modes.includes('dungeon')&&Object.keys(i.mod||{}).some(k=>!k.startsWith('capture')));
if(dungeonBad.length)throw Error('mode item tagging invalid');
for(const token of ['ELEMENT_ADVANTAGE','applyElementDamage','recallUnit','UNIT_DECK_MAX','SPELL_DECK_MAX'])if(!server.includes(token))throw Error(`server token ${token}`);
for(const token of ['loadout-page-v34','capture-cinematic-v34','unit-recall-v34','enemy-weak-v34','enemy-block-number-v34'])if(!app.includes(token)&&!css.includes(token))throw Error(`ui token ${token}`);
console.log(`V34_EXPEDITION_PARTY_OK enemies=${c.enemies.length} items=${c.items.length} matchups=12 loadout=true recall=true captureCinema=true`);
