import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {CLASSES} from '../shared/content.js';
import {KITS,UTILITY_RULES} from '../shared/combat-kits.js';
import {skillVisual} from '../shared/visuals.js';
import {drawClassCombatVFXV7,clearClassCombatVFXV7,classCombatVFXV7Stats} from '../client/combat-vfx-v7.js';
import {skillButtonPalette} from '../client/combat-vfx-v6.js';
function fakeCtx(){
 const marks=[];const push=(key,...args)=>marks.push(key+':'+args.slice(0,2).map(x=>typeof x==='number'?Math.round(x):String(x)).join(','));
 return {marks,globalAlpha:1,fillStyle:'#fff',strokeStyle:'#fff',lineWidth:3,
  save(){},restore(){},beginPath(){},closePath(){},moveTo(...p){push('M',...p);},lineTo(...p){push('L',...p);},ellipse(...p){push('O',...p);},stroke(){push('stroke');},fill(){push('fill');},fillRect(...p){push('rect',...p);},clearRect(){},setTransform(){},drawImage(){push('img');}};
}
function draw(job,skill,phase=.52){
 const frame=fakeCtx(),outside=fakeCtx(),r={ctx:outside,showEffects:true,lowPower:false,createPixelCanvas:(w,h)=>({width:w,height:h,getContext:()=>frame})};
 const effect={type:'skill',id:'actor',job,skill,x:80,y:140,tx:193,ty:137,born:42,_pixelId:job+skill};
 const result=drawClassCombatVFXV7(r,effect,phase);
 return {result,marks:frame.marks,renderer:r,event:effect};
}
test('all class actions have an original visual treatment; Q/E/R are not identical',()=>{
 assert.equal(Object.keys(CLASSES).length,39);
 for(const [job,c] of Object.entries(CLASSES)){
  const renders={};
  for(const spec of c.skills){
   const v=draw(job,spec.id);
   assert.equal(v.result,true,`${job} ${spec.id}`);
   assert.ok(v.marks.length>9,`${job} ${spec.id} (${v.marks.length} ops)`);
   renders[spec.id]=JSON.stringify(v.marks);
   const actual=skillButtonPalette(job,spec.id),expected=skillVisual(job,spec.id);
   assert.equal(actual.primary,expected.primary);
  }
  assert.notEqual(renders.skill1,renders.skill2,job+' Q vs E');
  assert.notEqual(renders.skill2,renders.ultimate,job+' E vs R');
  assert.notEqual(renders.basic,renders.skill1,job+' basic vs Q');
 }
});
test('E action is a functional utility type, not universally dodge',()=>{
 const roles=Object.values(UTILITY_RULES).map(x=>x.type);
 assert.ok(new Set(roles).size>=15);
 assert.ok(roles.filter(x=>['blink','smoke','charge','leap_trap'].includes(x)).length<13);
 for(const job of Object.keys(CLASSES))if(KITS[job])assert.ok(UTILITY_RULES[KITS[job].skill2],job);
});
test('bitmap cache reuses 20fps frames and resets correctly',()=>{
 const v=draw('engineer','skill2');const before=classCombatVFXV7Stats(v.renderer);
 assert.equal(before.draws,1);
 assert.equal(drawClassCombatVFXV7(v.renderer,v.event,.52),true);
 assert.equal(classCombatVFXV7Stats(v.renderer).draws,1);
 assert.equal(drawClassCombatVFXV7(v.renderer,v.event,.79),true);
 assert.equal(classCombatVFXV7Stats(v.renderer).draws,2);
 clearClassCombatVFXV7(v.renderer);
 assert.equal(classCombatVFXV7Stats(v.renderer).frames,0);
});
test('user provided MP3 and animation art are included without changing server skill definitions',()=>{
 const mp3=new URL('../public/assets/bgm_starfall_20261025.mp3',import.meta.url);
 assert.equal(existsSync(mp3),true);
 assert.ok(readFileSync(mp3).length>1000000);
 const effects=readFileSync(new URL('../client/effects.js',import.meta.url),'utf8');
 assert.match(effects,/drawClassCombatVFXV7/);
 assert.match(effects,/renderer\.fxStyle==='classic'/);
 const server=readFileSync(new URL('../server/index.js',import.meta.url),'utf8');
 assert.match(server,/'\.mp3':'audio\/mpeg'/);
});
