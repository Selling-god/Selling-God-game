const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const root=path.resolve(__dirname,'..');
const pub=path.join(root,'public');
const app=fs.readFileSync(path.join(pub,'app.js'),'utf8');
const css=fs.readFileSync(path.join(pub,'styles.css'),'utf8');
const html=fs.readFileSync(path.join(pub,'index.html'),'utf8');
const errors=[],notes=[];
const need=(ok,msg)=>{if(!ok)errors.push(msg);else notes.push(msg)};
const count=(needle,hay=app)=>hay.split(needle).length-1;

need(app.includes("const KX_COMPANY_BUILD='12.0.0-REALITY-CONSISTENCY'"),'V12 release marker');
need(app.includes('minlength="4"')&&app.includes('password.length<4'),'password rule is consistently minimum 4 characters');
need(!app.includes('비밀번호는 최소 6자')&&!app.includes('minlength="6"'),'no stale 6-character password rule');
need(count("if(f==='미국')")===1,'market filter has one US branch');
need(app.includes('function formatKrwSmart(v){')&&!app.includes('function formatKrwSmart(v){\n  v=Math.max(0'),'negative financial values are not clamped to zero');
need(app.includes('function aggregateIncomingHoldings(')&&app.includes('function companyExternalOwnershipTotal('),'shareholder aggregation is defined');
need(app.includes('function companyOutsideVotingCap(')&&app.includes('function companyOwnershipStructure('),'founder-control ownership reconciliation is defined');
need(app.includes("companyIsPlayerFounded(my)?49:100")&&app.includes('function companyOutsideVotingCap('),'independent founder-controlled player companies cannot silently lose majority control');
need(app.includes('창업자·경영진 의결권')&&app.includes('의결권 합계'),'M&A UI explicitly reconciles founder and outside voting rights');
need(app.includes('Generic incoming_stake is only a legacy fallback')&&app.includes('const direct=holders.length?0'),'shareholder ledger outranks stale generic aggregate ownership');
need(app.includes('p_founder_stake_pct:100')&&app.includes("p_ownership_model:'FOUNDER_CONTROLLED'"),'new remote company creation declares founder-controlled ownership model');
need(app.includes('employees:15')&&app.includes('founder_stake_pct:100'),'local company founding starts with plausible staffing and 100% founder ownership');
need(app.includes('deptTotal>out.employees'),'department headcount cannot exceed company headcount');
need(app.includes('global_share||0)>0&&Number(out.global_level||0)===0'),'global market share cannot coexist with zero global operating level');
need(app.includes('owner=ownerStakeOf(my)'),'takeover crisis uses total reconciled friendly ownership');
need(app.includes('function sanitizeCompanyPayload('),'server company snapshot sanitizer is enabled');
need(app.includes('외부 주주 전체')&&app.includes('경영권 위협'),'aggregate ownership and evidenced takeover threat are separately labelled');
need(!app.includes('외부 세력 합계'),'legacy ambiguous M&A aggregate label absent');
need(app.includes('A large passive shareholder is not automatically a hostile takeover')&&app.includes('if(!reason)return 0'),'passive shareholders are not misclassified as hostile takeover threats');
need(app.includes('companyStale=true')&&app.includes('마지막 정상 데이터 표시 중'),'transient company-sync failure retains last good snapshot');
need(app.includes('${renderCompanyModeBanner()}\n    ${sectionTop}'),'company room exposes sync health');
need(app.includes('.company-browser-list-v646,.clean-company-browser'),'company-list scroll capture uses current selector');
need(app.includes('function detailUiKey('),'details restore uses stable semantic keys');
need(app.includes('function verifyReleaseAssets(')&&app.includes("cache:'no-store'"),'runtime release-asset mismatch guard enabled');
need(app.includes('function retireLegacyCaches(')&&app.includes('navigator.serviceWorker.getRegistrations'),'legacy service-worker/cache retirement enabled');
need(app.includes("x.holder_company_id!=null||String(x.holder_name||'').trim()||String(x.holder_ticker||'').trim()"),'incoming shareholder sanitizer retains ID/ticker-only valid rows');
need(app.includes('companyActionBusy')&&app.includes('bankActionBusy')&&app.includes('communitySending'),'economic/community double-submit guards present');
need(app.includes('const KX_SERVER_AUTHORITY=true'),'commercial build uses server-authoritative economic/talent state');
need(app.includes('function renderCompanyLoadingRoom(')&&app.includes('startupHydrating'),'startup has a player-safe progressive hydration screen');
need(app.includes('function renderCeoMoneyBridge(')&&app.includes('MONEY TRACE'),'CEO home centralizes the money trail before deep financial drill-down');
need(app.includes('function companyFinanceSnapshot(')&&app.includes('operating_expenses')&&app.includes('net_profit'),'management accounting reconciler handles server field aliases');
need(app.includes('accountingCashFlow')&&app.includes('집계 대기'),'unknown cash-flow data is not displayed as false zero');
need(app.includes('WORKING CAPITAL')&&!app.includes('<b>BALANCE SHEET</b>'),'partial accounting data is not misrepresented as a balanced statutory balance sheet');
need(app.includes('재무현금흐름')&&app.includes('운전자본 변동'),'cash-flow desk separates flows from working-capital balances');
need(app.includes('startupWatchdog')&&app.includes('},8000);'),'startup cannot remain on hydration state indefinitely');
need(app.includes('companySnapshotEpoch')&&app.includes('epoch!==companySnapshotEpoch'),'stale optional company responses are rejected');
need(app.includes('function queueLiveFlash(')&&app.includes('flushPendingLiveFlash'),'live news is deferred until the main UI is ready');
need(!app.includes('data-company-section-jump="operations"')&&!app.includes('data-company-section-jump="people"')&&!app.includes('data-company-section-jump="competition"'),'core decision buttons avoid broad section-only routing');
need(app.includes('if(KX_SERVER_AUTHORITY)return false;'),'speculative economic fallback is disabled in commercial mode');
need(app.includes('if(!KX_SERVER_AUTHORITY&&localTalentPoachFallbackable')&&app.includes('if(!KX_SERVER_AUTHORITY&&localTalentTrainingFallbackable'),'client-only talent success fallbacks are disabled in commercial mode');
for(const jargon of ['패치 이전 과도 누적분','서버 원시지분','로컬 대체 연수비'])need(!app.includes(jargon),`player-facing developer jargon absent: ${jargon}`);
need(!/\b(?:alert|confirm)\s*\(/.test(app),'no native browser alert/confirm');
need(!app.includes('takeoverOwnershipDetails'),'legacy M&A accordion absent');
need(!/(^|\n)(<<<<<<<|=======|>>>>>>>)(\s|$)/m.test(app+css+html),'no unresolved merge markers');
need(!/href\s*=\s*["']#["']/i.test(app+html),'no hash-only links that can jump to page top');
need(!/javascript:/i.test(html),'no javascript: navigation links');
need(!/onclick\s*=\s*["']/i.test(app+html),'no inline onclick handlers in player-facing markup');
need(!/['"](?:[^'"]{0,80})['"]\s*\+\s*err\.message/.test(app),'raw backend err.message is not concatenated into player-facing UI');
need(!/(?:textContent\s*=|setAttribute\(\s*['"]data-error['"]\s*,|kxAlert\()[^;\n]{0,120}\b(?:e|err)\??\.message/.test(app),'raw catch exception messages are not bound directly to player UI');
need(!/\b(?:e|err)\?\.message\s*\|\|\s*String\(\s*(?:e|err)\s*\)/.test(app),'raw catch exception fallback is not exposed to player notices');
need(app.includes('const technical=/')&&app.includes('온라인 경영 데이터를 처리하는 중 문제가 발생했습니다.'),'technical backend errors are sanitized before player display');
const renderYaml=fs.readFileSync(path.join(root,'render.yaml'),'utf8');
for(const sw of ['/service-worker.js','/serviceworker.js','/sw.js'])need(renderYaml.includes(`- path: ${sw}`)&&renderYaml.includes('no-cache, no-store, must-revalidate'),`legacy worker cache header ${sw}`);
need((app.match(/`/g)||[]).length%2===0,'template literal delimiter balance');

// Duplicate named functions and missing render* functions.
const funcs=[...app.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]);
const seen=new Map();for(const n of funcs)seen.set(n,(seen.get(n)||0)+1);
const dup=[...seen.entries()].filter(([,n])=>n>1);need(!dup.length,dup.length?`no duplicate functions (${dup.map(([n,c])=>`${n} x${c}`).join(', ')})`:'no duplicate named functions');
const renderRefs=[...new Set([...app.matchAll(/\b(render[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map(m=>m[1]))];
const renderDecl=new Set([...app.matchAll(/\bfunction\s+(render[A-Z][A-Za-z0-9_$]*)\s*\(/g)].map(m=>m[1]));
const missing=renderRefs.filter(n=>!renderDecl.has(n));need(!missing.length,missing.length?`all render references defined (${missing.join(', ')})`:'all render references defined');

// Core responsive protection for the densest release screens.
for(const token of ['.quality-takeover-board','.shareholder-register','.stake-identity','.company-analysis-layout-v646','.retail-hydration-card','.ceo-money-bridge','.compact-online-banner','.accounting-pending','@media(max-width:760px)','grid-template-columns:repeat(3,minmax(0,1fr))!important']) need(css.includes(token),`CSS safeguard ${token}`);

// Deploy roots must be byte-identical after build.
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const dirName of ['.','public','out','dist','build','site']){
  const dir=dirName==='.'?root:path.join(root,dirName);
  for(const f of ['app.js','styles.css','index.html','version.json']) need(fs.existsSync(path.join(dir,f)),`${dirName}/${f} exists`);
  if(fs.existsSync(path.join(dir,'app.js')))need(sha(path.join(dir,'app.js'))===sha(path.join(pub,'app.js')),`${dirName}/app.js synchronized`);
  if(fs.existsSync(path.join(dir,'styles.css')))need(sha(path.join(dir,'styles.css'))===sha(path.join(pub,'styles.css')),`${dirName}/styles.css synchronized`);
}

if(errors.length){
  console.error('[KX QUALITY AUDIT V12] FAILED');
  for(const e of errors)console.error(' - '+e);
  process.exit(1);
}
console.log('[KX QUALITY AUDIT V12] PASS');
for(const n of notes)console.log(' - '+n);
