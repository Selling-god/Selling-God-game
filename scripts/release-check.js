const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const targets = ['.', 'public', 'out', 'dist', 'build', 'site'];
const errors = [];
const notes = [];
const fail = msg => errors.push(msg);
const sha = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const file = (dir,name) => path.join(dir,name);
for (const name of ['index.html','app.js','styles.css','config.js','version.json']) if (!fs.existsSync(file(publicDir,name))) fail(`public/${name} missing`);
const appPath=file(publicDir,'app.js');
if (fs.existsSync(appPath)) {
  const app=fs.readFileSync(appPath,'utf8');
  try { new Function(app); notes.push('JavaScript syntax OK'); } catch (e) { fail(`JavaScript syntax: ${e.message}`); }
  const funcs=[...app.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
  const seen=new Map(); for(const n of funcs) seen.set(n,(seen.get(n)||0)+1);
  const dup=[...seen.entries()].filter(([,n])=>n>1);
  if(dup.length) fail(`duplicate functions: ${dup.map(([n,c])=>`${n} x${c}`).join(', ')}`);
  for (const forbidden of ['RUN_THIS_IN_SUPABASE','SQL Editor']) if(app.includes(forbidden)) fail(`internal release token remains: ${forbidden}`);
  if(app.includes('takeoverOwnershipDetails')) fail('legacy M&A accordion marker remains');
  const renderRefs=[...new Set([...app.matchAll(/\b(render[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map(m=>m[1]))];
  const renderDecl=new Set([...app.matchAll(/\bfunction\s+(render[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map(m=>m[1]));
  const missingRender=renderRefs.filter(n=>!renderDecl.has(n));
  if(missingRender.length) fail(`undefined render function references: ${missingRender.join(', ')}`);
  if(!app.includes("const KX_COMPANY_BUILD='11.0.0-STEAM-RETAIL-CANDIDATE'")) fail('release build marker mismatch');
  if(/\b(?:alert|confirm)\s*\(/.test(app)) fail('native browser alert/confirm remains; use KX decision UI');
  if(!app.includes('function renderStrategicBrief(')) fail('V9 strategic brief missing');
  if(!app.includes('function renderCompanyReturnBriefing(')) fail('return briefing missing');
  if(!app.includes('function verifyReleaseAssets(')) fail('runtime asset-version guard missing');
  if(!app.includes('function aggregateIncomingHoldings(')) fail('shareholder aggregation missing');
  if(!app.includes('외부 주주 전체')||!app.includes('경영권 위협')) fail('M&A ownership semantics missing');
}
const expectedApp=fs.existsSync(file(publicDir,'app.js'))?sha(file(publicDir,'app.js')):'';
const expectedCss=fs.existsSync(file(publicDir,'styles.css'))?sha(file(publicDir,'styles.css')):'';
for(const t of targets){
  const dir=t==='.'?root:path.join(root,t);
  for(const name of ['index.html','app.js','styles.css','config.js','version.json']) if(!fs.existsSync(file(dir,name))) fail(`${t}/${name} missing`);
  if(fs.existsSync(file(dir,'app.js'))&&sha(file(dir,'app.js'))!==expectedApp) fail(`${t}/app.js is stale`);
  if(fs.existsSync(file(dir,'styles.css'))&&sha(file(dir,'styles.css'))!==expectedCss) fail(`${t}/styles.css is stale`);
  if(fs.existsSync(file(dir,'index.html'))){
    const html=fs.readFileSync(file(dir,'index.html'),'utf8');
    if(!/styles\.css\?v=[a-f0-9]{12}/i.test(html)) fail(`${t}/index.html stylesheet cache key missing`);
    if(!/app\.js\?v=[a-f0-9]{12}/i.test(html)) fail(`${t}/index.html app cache key missing`);
  }
}
if(errors.length){ console.error('[KX RELEASE CHECK] FAILED'); errors.forEach(e=>console.error(' - '+e)); process.exit(1); }
console.log('[KX RELEASE CHECK] PASS');
notes.forEach(n=>console.log(' - '+n));
console.log(` - deploy roots synchronized: ${targets.join(', ')}`);
console.log(' - M&A legacy accordion absent');
console.log(' - cache-busted release assets present');
