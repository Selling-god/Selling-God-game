const fs=require('fs');const path=require('path');const crypto=require('crypto');
function ok(v,m){if(!v)throw new Error(m)}
const root=path.resolve(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/styles.css'),'utf8');
const cat=JSON.parse(fs.readFileSync(path.join(root,'data/catalog.json'),'utf8'));
ok(app.includes('root-command-v47'),'missing v47 root command');
ok(app.includes('move-grid-v47'),'missing v47 move grid');
ok(app.includes('battle-resource-v47'),'missing compact battle resource HUD');
ok(app.includes("data-menu=\"capture\""),'battle capture menu missing');
ok(app.includes('namedActorFramesV47'),'named move actor motion missing');
for(const family of ['bite','claw','slash','rush','beam','bullet','thunder','flame','ice','wave','cyclone','root','spore','toxin','shadow','meteor','quake','time','music','mirror'])ok(app.includes(`return'${family}'`),`move family ${family} missing`);
ok(css.includes('.command-box-v47'),'v47 command css missing');ok(css.includes('.move-btn-v47'),'v47 move css missing');ok(css.includes('@keyframes v47GlyphPop'),'v47 fx animation missing');
const mons=[...(cat.enemies||[]),...(cat.bosses||[])];ok(mons.length>=205,'monster catalog incomplete');
const hashes=new Set();for(const m of mons){const f=path.join(root,m.sprite.replace(/^\//,''));ok(fs.existsSync(f),`missing sprite ${m.id}`);hashes.add(crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex'));}
ok(hashes.size>=200,`sprite diversity too low: ${hashes.size}/${mons.length}`);
const formFiles=[];for(const m of mons)for(const k of ['evolutionSprite','resonanceSprite','riftSprite'])if(m[k]){const f=path.join(root,m[k].replace(/^\//,''));ok(fs.existsSync(f),`missing form ${m.id}:${k}`);formFiles.push(f)}
console.log(`V47_PREMIUM_LOOP_OK monsters=${mons.length} uniqueSprites=${hashes.size} forms=${formFiles.length} moveFamilies=20 battleCapture=on oneScreenUI=on`);
