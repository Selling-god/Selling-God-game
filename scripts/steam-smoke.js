const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..'),app=fs.readFileSync(path.join(root,'public','app.js'),'utf8'),css=fs.readFileSync(path.join(root,'public','styles.css'),'utf8');
const errors=[];const need=(ok,msg)=>{if(!ok)errors.push(msg)};
for(const token of ["10.0.0-STEAM-QUALITY-GATE","function kxConfirm(","function kxAlert(","function renderStrategicBrief(","function renderCompanyReturnBriefing(","function renderRivalSnapshot(","data-return-brief-dismiss"])need(app.includes(token),`app missing ${token}`);
for(const token of ['.kx-decision-overlay','.strategic-brief','.ceo-return-brief','.executive-rival-row'])need(css.includes(token),`css missing ${token}`);
need(!/\b(?:alert|confirm)\s*\(/.test(app),'native alert/confirm detected');
need(!app.includes('takeoverOwnershipDetails'),'legacy takeover accordion detected');
const opens=(app.match(/`/g)||[]).length;need(opens%2===0,'template literal delimiter imbalance');
if(errors.length){console.error('[KX STEAM SMOKE] FAILED');errors.forEach(e=>console.error(' - '+e));process.exit(1)}
console.log('[KX STEAM SMOKE V10] PASS');console.log(' - custom decision UI');console.log(' - concise CEO home + strategic phase');console.log(' - return briefing');console.log(' - relevant rival intelligence');console.log(' - no native browser dialogs');
