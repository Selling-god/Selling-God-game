import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameQualityGovernor} from '../client/frame-quality.js';
import {drawTacticalSkill,tacticalFXStats,clearTacticalFX} from '../client/tactical-skill-fx.js';
import {KITS,Q_ACTIONS,R_ACTIONS,UTILITY_RULES} from '../shared/combat-kits.js';
import {fieldRespawnDelay} from '../shared/respawn.js';
import {MONSTERS} from '../shared/content.js';

function noopCanvas(){
 const c={drawCalls:0};
 for(const name of ['save','restore','setTransform','clearRect','fillRect','stroke','fill','beginPath','moveTo','lineTo','closePath','arc','rect','translate','scale'])c[name]=()=>{};
 c.drawImage=()=>c.drawCalls++;
 return c;
}
const buildRenderer=()=>{
 const c=noopCanvas(),stat={built:0};
 return {ctx:c,showEffects:true,lowPower:false,
  createPixelCanvas:(w,h)=>{stat.built++;const cv={width:w,height:h};cv.getContext=()=>cv.ctx||(cv.ctx=noopCanvas());return cv;},stat};
};
test('sustained expensive frames switch to reduced GPU fill, brief hitches do not',()=>{
 const g=new FrameQualityGovernor();let t=1000;
 assert.equal(g.report(88,16,t),false);
 for(let i=0;i<10;i++)assert.equal(g.report(3,16,t+=16),false);
 assert.equal(g.reduced,false);
 for(let i=0;i<45;i++)g.report(23,16,t+=16);
 assert.equal(g.reduced,true);
 assert.equal(g.report(100,500,t+=500,{visible:false}),false);
 assert.equal(g.reduced,true);
 for(let i=0;i<420;i++)g.report(5,16,t+=32);
 assert.equal(g.reduced,false);
});
test('manual low-power setting bypasses governor automatic switching',()=>{
 const g=new FrameQualityGovernor();
 for(let i=0;i<140;i++)assert.equal(g.report(35,16,i*17,{manual:true}),false);
 assert.equal(g.reduced,false);
});
test('live pixel attack cache reuses the same tactical raster on repeated screen frames',()=>{
 const renderer=buildRenderer();
 const e={type:'attack',job:'eclipse_reaper',role:'weapon',id:'hero',_pixelId:1,skill:'basic',born:100,x:140,y:145,tx:185,ty:128};
 assert.equal(drawTacticalSkill(renderer,e,.4),true);
 const start=tacticalFXStats(renderer);
 assert.equal(start.rasterizations,1);assert.equal(start.entries,1);assert.equal(renderer.stat.built,1);
 assert.equal(drawTacticalSkill(renderer,e,.4),true);
 assert.equal(tacticalFXStats(renderer).rasterizations,1);
 assert.equal(renderer.ctx.drawCalls,2);
 assert.equal(drawTacticalSkill(renderer,e,.62),true);
 assert.equal(tacticalFXStats(renderer).rasterizations,2);
 clearTacticalFX(renderer);assert.equal(tacticalFXStats(renderer).entries,0);
});
test('reduced GPU mode uses half-resolution tactical raster, even at larger dimensions',()=>{
 const renderer=buildRenderer();renderer.lowPower=true;
 const e={type:'skill',job:'mage',role:'blast',_pixelId:10,skill:'skill1',x:150,y:200,tx:290,ty:120};
 assert.equal(drawTacticalSkill(renderer,e,.32),true);
 const stat=tacticalFXStats(renderer);assert.equal(stat.entries,1);
 const x=Math.ceil((Math.max(e.x,e.tx)+112-Math.floor(Math.min(e.x,e.tx)-112))*.5);
 assert.equal(renderer.stat.built,1);assert.ok(stat.pixels<x*700);
});
test('off-screen effects are culled before expensive draw or sprite allocation',()=>{
 const renderer=buildRenderer();renderer.camera={x:2000,y:2000};renderer.w=800;renderer.h=700;renderer.zoom=1.5;
 const e={type:'attack',job:'ranger',role:'mark',_pixelId:13,skill:'skill1',x:100,y:100,tx:120,ty:100};
 assert.equal(drawTacticalSkill(renderer,e,.3),true);
 assert.equal(renderer.stat.built,0);assert.equal(tacticalFXStats(renderer).rasterizations,0);
});
test('all 38 professions retain distinct skill roles, visible basics, and slow respawns',()=>{
 for(const [job,kit]of Object.entries(KITS)){
  const roles=['weapon',Q_ACTIONS[kit.skill1],UTILITY_RULES[kit.skill2].type,R_ACTIONS[kit.ultimate]];
  const renderer=buildRenderer();
  for(const [index,role]of roles.entries()){
   const e={type:'attack',job,role,_pixelId:index+1,skill:['basic','skill1','skill2','ultimate'][index],x:180,y:140,tx:235,ty:128};
   assert.equal(drawTacticalSkill(renderer,e,.4),true,`${job}/${role}`);
  }
  assert.equal(tacticalFXStats(renderer).rasterizations,4,job);
 }
 assert.ok(fieldRespawnDelay(MONSTERS.slime,()=>0)>=80000);
});
test('new map chunks are generated over multiple frames rather than a single blocking burst',async()=>{
 const {GroundChunks}=await import('../client/ground-chunks.js');
 const previous=globalThis.document;
 const emptyCtx=noopCanvas();
 globalThis.document={createElement(){return {width:0,height:0,getContext:()=>emptyCtx};}};
 try{
  const ground=new GroundChunks();const w=80,h=80;
  const map={id:'forest',w,h,width:w*32,height:h*32,tiles:new Uint8Array(w*h),terrain:null};
  const meta={};for(let i=0;i<8;i++)meta[`tile_forest_0_${i}`]={x:0,y:0};
  const ctx=noopCanvas(),camera={x:1200,y:800};
  ground.draw(ctx,map,camera,950,700,{},meta,false);
  assert.ok(ground.lastNew<=4,`first frame built ${ground.lastNew} chunks`);
  assert.ok(ground.deferred>0,'test should expose uncached chunk placeholders');
  for(let i=0;i<7;i++)ground.draw(ctx,map,camera,950,700,{},meta,false);
  assert.equal(ground.deferred,0,'all visible tiles eventually become real terrain');
 }finally{if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
