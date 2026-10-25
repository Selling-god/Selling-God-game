/** Server-authoritative distinctive advanced-class combat effects. */
import {CLASSES,MONSTERS} from '../shared/content.js';
import {dist,moveEntity,isBlocked} from '../shared/world.js';
import {SPECIALTIES} from '../shared/class-specialties.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const allies=(g,p,r=260)=>{
 const party=g.parties.get(p.partyId);
 return [p,...(party?.members||[]).map(id=>g.players.get(id)).filter(a=>a&&a.id!==p.id&&a.active&&a.zone===p.zone&&a.hp>0&&g.sameInstance(p,a)&&dist(a,p)<=r)];
};
function heal(g,p,rate){const s=g.stats(p),before=p.hp;p.hp=Math.min(s.maxHp,p.hp+s.maxHp*rate);if(p.hp>before)g.mark(p);}
function healParty(g,p,rate){for(const a of allies(g,p)){const s=g.stats(a),before=a.hp;a.hp=Math.min(s.maxHp,a.hp+s.maxHp*rate);if(a.hp>before)g.mark(a);}}
function charge(p,amt=1){p.signature=p.signature||{stacks:0};p.signature.stacks=clamp((p.signature.stacks||0)+amt,0,8);return p.signature.stacks;}
function spend(p){const n=p.signature?.stacks||0;if(p.signature)p.signature.stacks=0;return n;}
function buff(p,kind,until){p.signature=p.signature||{stacks:0};p.signature[kind]=until;}
const active=(g,p,kind)=>g.now<(p.signature?.[kind]||0);
function dot(g,p,m,kind,power=.17,ticks=3){
 m.dots=m.dots.filter(d=>d.by!==p.id||d.kind!==kind);
 m.dots.push({by:p.id,kind,left:ticks,next:g.now+1000,damage:Math.max(1,Math.round(g.stats(p).atk*power))});
}
export function onSupport(g,p){
 const k=p.classId,s=p.signature||{stacks:0};
 switch(k){
 case 'guardian':case 'sentinel':case 'rune_knight':case 'nameless_king':charge(p,2);p.shieldUntil=g.now+7000;break;
 case 'ranger':charge(p,2);buff(p,'swiftUntil',g.now+6500);break;
 case 'mage':charge(p,3);p.mp=Math.min(g.stats(p).maxMp,p.mp+14);break;
 case 'rogue':case 'shadowdancer':buff(p,'ambushUntil',g.now+5000);p.invulnerableUntil=g.now+300;break;
 case 'priest':case 'herbalist':case 'bard':case 'tide_oracle':healParty(g,p,k==='priest'?.20:k==='bard'?.14:.10);break;
 case 'lancer':buff(p,'pierceUntil',g.now+6200);break;
 case 'monk':charge(p,2);heal(g,p,.07);break;
 case 'miner':buff(p,'fractureUntil',g.now+7200);break;
 case 'berserker':buff(p,'rageUntil',g.now+6500);break;
 case 'paladin':healParty(g,p,.11);for(const a of allies(g,p))a.shieldUntil=Math.max(a.shieldUntil||0,g.now+4300);break;
 case 'sniper':buff(p,'aimUntil',g.now+7000);charge(p,2);break;
 case 'beastwarden':buff(p,'packUntil',g.now+8800);break;
 case 'spellblade':charge(p,2);p.mp=Math.min(g.stats(p).maxMp,p.mp+10);break;
 case 'pyromancer':buff(p,'burnUntil',g.now+7800);break;
 case 'cryomancer':buff(p,'frostUntil',g.now+7800);break;
 case 'druid':charge(p,2);healParty(g,p,.10);break;
 case 'alchemist':charge(p,2);heal(g,p,.12);break;
 case 'engineer':case 'dawn_architect':buff(p,'turretUntil',g.now+(k==='engineer'?9000:11500));break;
 case 'stormcaller':buff(p,'chainUntil',g.now+8200);break;
 case 'necromancer':heal(g,p,.06);charge(p,1);break;
 case 'chronomancer':for(const key of ['basic','skill1','ultimate'])p.cooldowns[key]=Math.max(g.now,p.cooldowns[key]-4500||g.now);break;
 case 'spiritwalker':p.signature={...s,stacks:s.stacks||0,stance:s.stance==='healing'?'striking':'healing'};if(p.signature.stance==='healing')healParty(g,p,.16);break;
 case 'dragonknight':charge(p,2);buff(p,'dragonUntil',g.now+7000);break;
 case 'stargazer':charge(p,2);buff(p,'starUntil',g.now+9000);break;
 case 'warlord':charge(p,2);for(const a of allies(g,p)){heal(g,a,.13);buff(a,'moraleUntil',g.now+9000);}break;
 case 'voidwalker':buff(p,'blinkUntil',g.now+6000);p.invulnerableUntil=g.now+350;break;
 case 'eclipse_reaper':buff(p,'executeUntil',g.now+7500);break;
 case 'phoenix_heir':buff(p,'rebirthUntil',g.now+12000);break;
 case 'starweaver':charge(p,2);buff(p,'threadsUntil',g.now+10000);break;
 case 'abyss_shepherd':buff(p,'packUntil',g.now+9500);healParty(g,p,.09);break;
 }
}
export function beforeStrike(g,p,skillId,target){
 const k=p.classId,s=p.signature||{stacks:0},n=s.stacks||0;
 const fx={scale:1,crit:0,pierce:0,stun:0,slow:0,chain:0};
 if(skillId==='basic'&&k!=='necromancer')charge(p,1);
 if(skillId==='skill1')charge(p,1);
 switch(k){
 case 'guardian':if(skillId==='ultimate')fx.scale+=spend(p)*.13;break;
 case 'ranger':if(skillId==='ultimate'){fx.chain=2+Math.floor(spend(p)/2);fx.scale+=.20;}else if(skillId==='skill1')fx.pierce=.3;break;
 case 'mage':if(skillId==='ultimate'){fx.scale+=spend(p)*.16;p.mp=Math.min(g.stats(p).maxMp,p.mp+12+n*3);}break;
 case 'rogue':if(active(g,p,'ambushUntil')){fx.scale+=.95;fx.crit+=55;p.signature.ambushUntil=0;}else if(skillId==='skill1')fx.crit+=18;break;
 case 'priest':if(skillId==='ultimate'){healParty(g,p,.16+spend(p)*.013);}break;
 case 'lancer':fx.pierce=active(g,p,'pierceUntil')?.7:.35;if(skillId==='ultimate')fx.scale+=.38;break;
 case 'monk':if(skillId==='basic'&&n%3===2){fx.scale+=1.25;heal(g,p,.055);}break;
 case 'herbalist':if(skillId==='ultimate'){heal(g,p,.025*spend(p));fx.scale+=.35;}break;
 case 'miner':if(skillId==='skill1'||active(g,p,'fractureUntil'))fx.pierce=.45;break;
 case 'berserker':fx.scale+=.95*(1-p.hp/Math.max(1,g.stats(p).maxHp));if(active(g,p,'rageUntil'))fx.scale+=.25;if(skillId==='ultimate')heal(g,p,.08);break;
 case 'paladin':if(skillId==='skill1')heal(g,p,.055);if(skillId==='ultimate')healParty(g,p,.18);break;
 case 'sentinel':if(skillId==='ultimate'){fx.scale+=.1*spend(p);fx.stun=1200;}break;
 case 'sniper':if(active(g,p,'aimUntil')&&(skillId==='skill1'||skillId==='ultimate')){fx.scale+=.80;fx.crit+=45;}if(skillId==='ultimate')fx.pierce=.8;break;
 case 'beastwarden':fx.scale+=Math.min(.7,n*.09);if(skillId==='ultimate')fx.chain=2;break;
 case 'spellblade':if(skillId==='ultimate'){fx.scale+=spend(p)*.16;fx.chain=1;}break;
 case 'pyromancer':if(skillId==='ultimate')fx.scale+=spend(p)*.09;break;
 case 'cryomancer':if(skillId==='ultimate'){fx.slow=4800;fx.scale+=spend(p)*.09;}break;
 case 'druid':if(skillId==='ultimate'){healParty(g,p,.02*spend(p));fx.scale+=.2;}break;
 case 'bard':if(skillId==='ultimate'){healParty(g,p,.13+.01*spend(p));fx.chain=1;}break;
 case 'alchemist':if(skillId==='ultimate')fx.scale+=spend(p)*.1;break;
 case 'engineer':if(active(g,p,'turretUntil'))fx.chain=1;break;
 case 'rune_knight':if(skillId==='ultimate')fx.scale+=spend(p)*.17;break;
 case 'shadowdancer':if(active(g,p,'ambushUntil')){fx.crit+=55;fx.scale+=.60;p.signature.ambushUntil=0;}else if(n>=3&&skillId==='skill1'){fx.scale+=.8;spend(p);}break;
 case 'stormcaller':fx.chain=active(g,p,'chainUntil')?3:(skillId==='ultimate'?3:1);break;
 case 'necromancer':if(skillId==='ultimate'){fx.scale+=spend(p)*.19;heal(g,p,.06);}break;
 case 'chronomancer':if(skillId==='ultimate'){for(const key of ['skill1','skill2'])p.cooldowns[key]=g.now;fx.scale+=.3;}break;
 case 'spiritwalker':if(s.stance==='healing'){healParty(g,p,.02);fx.scale*=.75;}else fx.scale+=.25;break;
 case 'dragonknight':if(skillId==='ultimate'){fx.scale+=spend(p)*.15;heal(g,p,.045);}break;
 case 'stargazer':if(n>=2){fx.crit+=35;fx.scale+=.35;if(skillId==='ultimate')fx.chain=2;spend(p);}break;
 case 'warlord':if(active(g,p,'moraleUntil'))fx.scale+=.22;if(skillId==='ultimate'){fx.chain=2;healParty(g,p,.12);}break;
 case 'voidwalker':if(active(g,p,'blinkUntil')){fx.crit+=42;fx.scale+=.66;p.signature.blinkUntil=0;}if(skillId==='ultimate')fx.pierce=.6;break;
 case 'eclipse_reaper':if(target.hp/Math.max(1,target.maxHp)<.40){fx.scale+=1.0;fx.crit+=25;}if(active(g,p,'executeUntil'))fx.scale+=.25;break;
 case 'phoenix_heir':if(skillId==='ultimate'){fx.scale+=spend(p)*.11;heal(g,p,.1);}break;
 case 'tide_oracle':fx.slow=2500;if(skillId==='ultimate'){healParty(g,p,.10);fx.chain=1;}break;
 case 'starweaver':if(skillId==='ultimate'){fx.chain=1+Math.floor(spend(p)/3);fx.scale+=.24;}break;
 case 'nameless_king':if(skillId==='ultimate'){fx.pierce=1;fx.scale+=spend(p)*.13;}break;
 case 'dawn_architect':if(active(g,p,'turretUntil'))fx.chain=2;if(skillId==='ultimate')fx.scale+=.1*spend(p);break;
 case 'abyss_shepherd':if(active(g,p,'packUntil'))fx.chain=2;if(skillId==='ultimate'){fx.slow=4000;fx.scale+=.08*spend(p);}break;
 }
 if(skillId==='ultimate'&&n>0&&['ranger','mage','guardian','spellblade','dragonknight','rune_knight','starweaver','abyss_shepherd'].includes(k))p.signature.stacks=0;
 return fx;
}
export function afterStrike(g,p,m,skillId,fx,actual){
 const k=p.classId,s=p.signature||{stacks:0};
 if(k==='herbalist'||k==='alchemist'||k==='druid')dot(g,p,m,'poison',k==='alchemist'?.27:.17,4);
 if(k==='pyromancer'||k==='dragonknight'||k==='phoenix_heir'){
  const current=m.dots.find(d=>d.by===p.id&&d.kind==='burn');
  if(k==='pyromancer'&&skillId==='ultimate'&&current){m.hp=Math.max(0,m.hp-current.damage*current.left*1.1);current.left=0;}
  else dot(g,p,m,'burn',.19,4);
 }
 if(k==='cryomancer'){m.frostStacks=(m.frostStacks||0)+1;if(m.frostStacks>=3&&!MONSTERS[m.type].boss){m.stunUntil=g.now+950;m.frostStacks=0;}m.slowUntil=g.now+2500;}
 if(k==='miner'){m.fractureStacks=(m.fractureStacks||0)+1;if(m.fractureStacks>=3&&!MONSTERS[m.type].boss){m.stunUntil=g.now+900;m.fractureStacks=0;}}
 if(k==='beastwarden'||k==='abyss_shepherd')m.slowUntil=g.now+(k==='abyss_shepherd'?2700:1600);
 if(k==='sentinel')m.target=p.id;
 if(k==='eclipse_reaper'&&m.hp<=0)heal(g,p,.08);
 if(k==='necromancer'&&m.hp<=0)charge(p,2);
 if(k==='lancer'&&skillId==='skill1'&&!MONSTERS[m.type].boss){const length=24,dx=m.x-p.x,dy=m.y-p.y,dist0=Math.max(1,Math.hypot(dx,dy));moveEntity(g.worlds.get(p.zone).map,m,length*dx/dist0,length*dy/dist0,10);}
 if(k==='alchemist'&&(s.stacks||0)>=3){m.hp=Math.max(0,m.hp-Math.max(1,Math.round(g.stats(p).atk*.35)));spend(p);}
 if(k==='engineer'||k==='dawn_architect'){if(active(g,p,'turretUntil'))dot(g,p,m,'spark',k==='dawn_architect'?.31:.23,3);}
 if(k==='priest'&&skillId==='skill1')heal(g,p,.04);
 if(k==='spellblade'&&skillId==='skill1'){m.slowUntil=g.now+1300;}
 if(k==='chronomancer'&&skillId==='skill1')p.cooldowns.skill1=Math.max(g.now,p.cooldowns.skill1-850);
 if(fx.stun&&!MONSTERS[m.type].boss)m.stunUntil=g.now+fx.stun;
 if(fx.slow)m.slowUntil=g.now+fx.slow;
}
export function survive(g,p){
 if(p.classId!=='phoenix_heir'||!active(g,p,'rebirthUntil'))return false;
 p.signature.rebirthUntil=0;p.hp=Math.max(1,Math.round(g.stats(p).maxHp*.36));p.mp=Math.max(0,p.mp);p.invulnerableUntil=g.now+1200;
 g.toast(p,'불사조의 불씨가 당신을 한 번 살려냈습니다!','success');return true;
}
export function mechanicInfo(p){
 return SPECIALTIES[p.classId]?{name:SPECIALTIES[p.classId][0],desc:SPECIALTIES[p.classId][1],stacks:p.signature?.stacks||0,
  stance:p.signature?.stance||null}:null;
}
