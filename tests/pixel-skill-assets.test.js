import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {JOB_ART_PROFILES} from '../client/job-signatures.js';
import {
 PIXEL_SKILL_CELL,PIXEL_SKILL_FRAMES,PIXEL_SKILL_JOBS,PIXEL_SKILL_NAMES,
 PIXEL_SKILL_ATLAS_LIMIT,pixelSkillSheetURL,loadPixelSkillJob,
 drawPixelSkillSprite,pixelSkillStats
} from '../client/pixel-skill-sprites.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const folder=path.join(root,'public/assets/skillfx_v4');

test('all 39 careers have their own original four-action, twelve-frame PNG sprite sheet',()=>{
 const meta=JSON.parse(readFileSync(path.join(root,'public/assets/skillfx_v4.json'),'utf8'));
 assert.deepEqual(meta.skills,PIXEL_SKILL_NAMES);
 assert.deepEqual(meta.jobs,PIXEL_SKILL_JOBS);
 assert.equal(meta.jobs.length,39);
 assert.equal(meta.frames,12);
 for(const job of Object.keys(JOB_ART_PROFILES)){
  const file=path.join(folder,job+'.png');
  assert.equal(existsSync(file),true,`${job} sprite missing`);
  const data=readFileSync(file);
  assert.equal(data.subarray(1,4).toString(),'PNG');
  assert.equal(data.readUInt32BE(16),PIXEL_SKILL_CELL*PIXEL_SKILL_FRAMES);
  assert.equal(data.readUInt32BE(20),PIXEL_SKILL_CELL*PIXEL_SKILL_NAMES.length);
  assert.ok(data.length>1200,`${job} sprite unexpectedly small`);
  assert.ok(pixelSkillSheetURL(job).includes(job+'.png'));
 }
});

test('browserless test environment never loads or changes game state',async()=>{
 assert.equal(await loadPixelSkillJob('eclipse_reaper'),false);
 assert.equal(drawPixelSkillSprite({ctx:null},{job:'eclipse_reaper',x:0,y:0,skill:'basic'},.5),false);
 assert.equal(pixelSkillStats().loaded.length,0);
 assert.ok(PIXEL_SKILL_ATLAS_LIMIT<=12);
});
