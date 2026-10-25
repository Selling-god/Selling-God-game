/** Character-class silhouettes drawn in the hand, above equipped body layers.
 * Discrete pixel steps keep weapons readable at normal MMO zoom levels.
 */
export const JOB_WEAPONS={
 novice:'sword',guardian:'sword',ranger:'bow',mage:'staff',rogue:'daggers',priest:'staff',lancer:'spear',monk:'gauntlets',herbalist:'staff',miner:'hammer',
 berserker:'hammer',paladin:'sword',sentinel:'shield',sniper:'rifle',beastwarden:'bow',spellblade:'rune_sword',pyromancer:'staff',cryomancer:'staff',
 druid:'staff',bard:'lute',alchemist:'flask',engineer:'gun',rune_knight:'rune_sword',shadowdancer:'daggers',stormcaller:'staff',necromancer:'scythe',
 chronomancer:'staff',spiritwalker:'staff',dragonknight:'spear',stargazer:'staff',warlord:'axe',voidwalker:'blade',eclipse_reaper:'scythe',
 phoenix_heir:'staff',tide_oracle:'staff',starweaver:'staff',nameless_king:'sword',dawn_architect:'gauntlets',abyss_shepherd:'scythe'
};
export function weaponVisualForJob(job){return JOB_WEAPONS[job]||'sword';}
const COLOR={wood:'#83603c',woodLight:'#b69965',iron:'#aec2c5',ironLight:'#eff6e6',gold:'#e1c588',dark:'#334454',runic:'#c49beb',flame:'#ef8b60'};
export function drawHeldWeapon(ctx,other,x,y,dir='s',pose={active:false},t=0){
 const kind=weaponVisualForJob(other.classId);if(!ctx||other.dead)return;
 const face=dir==='w'?-1:1,atk=pose.active?1:other.attacking?.45:0;
 // Fixed world hand anchor; direction and attack frame control pivots.
 ctx.save();ctx.imageSmoothingEnabled=false;
 ctx.translate(Math.round(x+face*11),Math.round(y-25));ctx.scale(face,1);
 const rot=atk*(kind==='rifle'||kind==='bow'?-.22:kind==='scythe'?-1.05:kind==='hammer'?.9:1.2);
 ctx.rotate(rot);ctx.translate(0,Math.round(Math.sin(t/360)*1));
 const box=(u,v,w,h,color)=>{ctx.fillStyle=color;ctx.fillRect(u,v,w,h);};
 const line=(pts,color,width=3)=>{ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='square';ctx.lineJoin='miter';ctx.beginPath();pts.forEach(([u,v],i)=>i?ctx.lineTo(u,v):ctx.moveTo(u,v));ctx.stroke();};
 if(['sword','rune_sword','blade'].includes(kind)){
  box(-2,-4,5,14,COLOR.wood);box(-7,-8,16,4,COLOR.gold);box(-2,-35,5,28,kind==='blade'?COLOR.runic:COLOR.iron);
  box(-1,-34,2,22,COLOR.ironLight);box(-3,-39,7,7,kind==='rune_sword'?COLOR.runic:COLOR.ironLight);
  if(kind==='rune_sword')for(let i=0;i<3;i++)box(0,-29+i*7,3,3,COLOR.runic);
 }else if(kind==='scythe'){
  box(-2,-5,5,53,COLOR.wood);box(-2,-43,4,14,COLOR.woodLight);
  line([[0,-43],[7,-53],[22,-53],[32,-45]],COLOR.iron,7);
  line([[7,-54],[22,-54],[32,-45]],COLOR.ironLight,3);box(30,-46,4,4,COLOR.ironLight);
 }else if(kind==='spear'){
  box(-2,-9,4,51,COLOR.wood);box(-3,-33,6,5,COLOR.gold);box(-3,-45,7,15,COLOR.iron);box(-1,-52,3,10,COLOR.ironLight);
 }else if(kind==='hammer'||kind==='axe'){
  box(-2,-7,5,38,COLOR.wood);box(-1,-35,3,14,COLOR.woodLight);
  if(kind==='hammer'){box(-17,-51,35,17,COLOR.iron);box(-17,-48,35,4,COLOR.ironLight);box(-21,-47,7,12,COLOR.dark);box(16,-47,6,12,COLOR.dark);}
  else {box(-9,-48,19,16,COLOR.iron);box(5,-51,15,22,COLOR.ironLight);}
 }else if(kind==='bow'){
  line([[-4,-36],[6,-41],[13,-29],[16,-15],[11,0],[-1,7]],COLOR.woodLight,4);
  line([[-4,-36],[-1,7]],COLOR.ironLight,1.5);box(-4,-15,20,3,COLOR.iron);
 }else if(kind==='rifle'||kind==='gun'){
  box(-13,-8,26,12,COLOR.dark);box(-7,-9,19,5,COLOR.iron);box(10,-6,26,5,COLOR.ironLight);
  box(-8,4,6,9,COLOR.wood);box(1,3,8,6,COLOR.iron);if(kind==='rifle'){box(7,-15,8,7,COLOR.dark);box(14,-11,4,4,COLOR.gold);}
 }else if(kind==='gauntlets'){
  box(-7,-11,15,20,COLOR.iron);box(-6,-9,4,15,COLOR.gold);box(4,-7,4,15,COLOR.gold);
  box(-24,-5,12,14,COLOR.iron);box(-21,-3,8,4,COLOR.ironLight);
 }else if(kind==='shield'){
  box(-10,-4,5,20,COLOR.wood);box(-16,-26,26,28,COLOR.dark);box(-12,-23,18,23,COLOR.iron);box(-5,-18,7,16,COLOR.gold);
 }else if(kind==='lute'){
  box(-2,-43,5,37,COLOR.woodLight);box(-10,-10,20,23,COLOR.wood);box(-5,-4,10,12,COLOR.gold);for(let i=-3;i<=3;i+=3)box(i,-32,1,36,COLOR.ironLight);
 }else if(kind==='flask'){
  box(-3,-15,8,10,COLOR.iron);box(-9,-7,20,19,COLOR.runic);box(-8,1,18,10,COLOR.flame);box(-2,-19,5,6,COLOR.ironLight);
 }else{
  box(-3,-6,6,47,COLOR.wood);box(-2,-42,4,31,COLOR.woodLight);box(-9,-49,19,13,COLOR.gold);
  box(-5,-52,11,11,['pyromancer','phoenix_heir'].includes(other.classId)?COLOR.flame:['cryomancer','tide_oracle'].includes(other.classId)?'#82cce9':['necromancer','voidwalker'].includes(other.classId)?COLOR.runic:'#b9e7dc');
 }
 // A small hand overlays the grip; the arm moves with the weapon.
 if(!['shield','gauntlets'].includes(kind))box(-5,0,10,7,'#d8bd96');
 ctx.restore();
}
