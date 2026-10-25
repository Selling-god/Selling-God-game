import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {CLASSES} from '../shared/content.js';
import {skillVisual} from '../shared/visuals.js';
import {drawClassCombatVFX,skillButtonPalette,classCombatVFXStats,clearClassCombatVFX} from '../client/combat-vfx-v6.js';

function fakeCtx(){const marks=[];const c={marks,globalAlpha:1,fillStyle:'#fff',strokeStyle:'#fff',lineWidth:2,
 save(){},restore(){},setTransform(){},clearRect(){},beginPath(){},moveTo(){marks.push('line');},lineTo(){marks.push('seg');},ellipse(){marks.push('ellipse');},stroke(){marks.push('stroke');},fill(){marks.push('fill');},fillRect(){marks.push('rect');},closePath(){},drawImage(){marks.push('blit');}};return c;}
function fakeRenderer(){const ctx=fakeCtx();return {ctx,showEffects:true,lowPower:false,createPixelCanvas:(w,h)=>({width:w,height:h,getContext:()=>fakeCtx()})};}
test('Every button swatch equals the matching ability effect palette',()=>{
 for(const [job,c] of Object.entries(CLASSES))for(const spec of c.skills){
  const pal=skillButtonPalette(job,spec.id),visual=skillVisual(job,spec.id);
  assert.equal(pal.primary,visual.primary,job+' '+spec.id);
  assert.equal(pal.light,visual.light,job+' '+spec.id);
  assert.ok(existsSync(new URL(`../public/assets/skill_${job}_${spec.id}.png`,import.meta.url)));
 }
});
test('all 39 jobs paint the entire 4-action kit without missing/invalid effects',()=>{
 const jobs=Object.entries(CLASSES);assert.equal(jobs.length,39);
 const buffer=new Array(156);let count=0;
 for(const [job,c] of jobs)for(const spec of c.skills){
  for(const phase of [.16,.4,.72]){
   const renderer={ctx:fakeCtx(),showEffects:true,lowPower:false};
   const effect={type:'skill',job,skill:spec.id,role:spec.role,x:100,y:140,tx:180,ty:116};
   assert.equal(drawClassCombatVFX(renderer,effect,phase),true,job+' '+spec.id);
   assert.ok(renderer.ctx.marks.length>0,job+' '+spec.id+' '+phase);
  }
  buffer[count++]=spec.id;
 }
 assert.equal(count,156);
});
test('V6 caches effects per event frame and clears on quality reset',()=>{
 const renderer=fakeRenderer(),e={type:'skill',id:'player',born:1,_pixelId:13,job:'eclipse_reaper',skill:'skill1',role:'drain',x:170,y:160,tx:200,ty:151};
 assert.equal(drawClassCombatVFX(renderer,e,.45),true);
 assert.equal(classCombatVFXStats(renderer).renders,1);
 assert.equal(drawClassCombatVFX(renderer,e,.45),true);
 assert.equal(classCombatVFXStats(renderer).renders,1);
 assert.equal(drawClassCombatVFX(renderer,e,.8),true);
 assert.equal(classCombatVFXStats(renderer).renders,2);
 clearClassCombatVFX(renderer);assert.equal(classCombatVFXStats(renderer).frames,0);
});
test('settings have new/classic reversible options and assets use a cache-busted path',()=>{
 const main=readFileSync(new URL('../client/main.js',import.meta.url),'utf8');
 const effects=readFileSync(new URL('../client/effects.js',import.meta.url),'utf8');
 assert.match(main,/setting-fxStyle/);assert.match(main,/v=v6-art/);
 assert.match(effects,/renderer\.fxStyle==='classic'/);
 assert.match(effects,/drawClassCombatVFX/);
});
