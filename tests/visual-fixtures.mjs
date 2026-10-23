
import fs from 'node:fs';
import {Game,newCharacter} from '../server/game.js';
import {jobBook} from '../server/progression.js';
import {CLASSES,ITEMS,ZONES,getStats,NPCS} from '../shared/content.js';
const game=new Game({random:()=>.3});
game.now=Date.parse('2026-10-23T03:01:00Z');game.events.tick(game.now);
const p=game.addPlayer(newCharacter('qa-offline','별빛모험가','stormcaller'));
p.level=24;p.gold=12500;p.inventory={...p.inventory,boss_tempest_staff:1,boss_tempest_armor:1,charm:1,ore:60,relic_dust:50,world_token:35};
p.equipment={weapon:'boss_tempest_staff',armor:'boss_tempest_armor',charm:'charm'};
p.enhancements={boss_tempest_staff:7,boss_tempest_armor:4};
p.enhancePity={boss_tempest_staff:2};p.attributes={str:0,dex:5,int:20,vit:10,luk:5};
p.discovery.jobs=['novice','guardian','mage','ranger','priest','pyromancer','stormcaller'];
p.discovery.visited=Object.keys(ZONES);p.discovery.relics=['forest_leaf','meadow_song','sky_bell'];
p.hp=getStats(p).maxHp;p.mp=getStats(p).maxMp;
const out={};
for(const zone of ['town','meadow','frost','observatory']){
 p.zone=zone;p.x=ZONES[zone].spawn[0]*32+16;p.y=ZONES[zone].spawn[1]*32+16;
 if(zone!=='town'){
  const m=game.worlds.get(zone).mobs.find(m=>m.type.startsWith('world_'))||game.worlds.get(zone).mobs.find(m=>m.id.endsWith('_boss'));
  p.x=m.x;p.y=m.y+110;p.target=m.id;m.hp=Math.floor(m.maxHp*.4);
 }
 out[zone]=game.snapshot(p,true);
}
p.zone='town';p.x=24*32+16;p.y=21*32+16;
out.profile=game.privatePlayer(p);out.book=jobBook(p);out.events=game.events.view(game.now);
out.classes=Object.keys(CLASSES);out.gear=Object.keys(ITEMS).filter(id=>ITEMS[id].type==='gear');
out.now=game.now;
fs.writeFileSync(process.argv[2]||'test-results/fixtures.json',JSON.stringify(out));
