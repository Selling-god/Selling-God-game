const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=path.join(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'data','catalog.json'),'utf8'));
const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
function pngSize(buf){if(buf.toString('ascii',1,4)!=='PNG')throw Error('not png');return{w:buf.readUInt32BE(16),h:buf.readUInt32BE(20)};}
const all=[...catalog.enemies,...(catalog.bosses||[])];
if(all.length<205)throw Error(`expected at least 205 creatures, got ${all.length}`);
const hashes=new Set();
for(const e of all){
  const file=path.join(root,e.sprite.replace(/^\//,''));
  if(!fs.existsSync(file))throw Error(`missing sprite ${e.id}: ${file}`);
  const buf=fs.readFileSync(file);const {w,h}=pngSize(buf);
  if(e.id.startsWith('b')){if(w<320||h<320)throw Error(`boss sprite too small ${e.id} ${w}x${h}`);}
  else if(w<240||h<240)throw Error(`enemy sprite too small ${e.id} ${w}x${h}`);
  hashes.add(crypto.createHash('sha1').update(buf).digest('hex'));
}
if(hashes.size<195)throw Error(`creature sprite diversity too low: ${hashes.size}/${all.length} unique`);
for(const token of ['card-ability-v33','cardEffectRows','cardMotionProfile','enemyAttackStyle','shieldGainFx','shieldImpactFx','shieldBreakFx','shield-shell-v33'])if(!app.includes(token)&&!css.includes(token))throw Error(`missing v3.3 token ${token}`);
for(const token of ['combat-beam-v33','combat-wave-v33','ground-eruption-v33','ally-shield-dome-v33','archetype-beast','inspect-effects-v33'])if(!css.includes(token))throw Error(`missing CSS ${token}`);
console.log(`GAME_FEEL_OK creatures=${all.length} uniqueSprites=${hashes.size} cardAbilityUI=true shieldFX=true motionProfiles=true`);
