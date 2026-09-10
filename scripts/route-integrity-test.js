const fs=require('fs');const path=require('path');
const root=path.resolve(__dirname,'..');const app=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const allowed=new Set([
  'dashboard:today','dashboard:approvals','dashboard:performance','dashboard:progress',
  'operations:products','operations:projects','operations:supply','operations:finance','operations:portfolio','operations:global',
  'people:talent','people:workforce','competition:companies','competition:war','competition:control','risk:news','risk:compliance'
]);
const errors=[];const need=(ok,msg)=>{if(!ok)errors.push(msg)};
for(const m of app.matchAll(/data-company-route="([a-z]+:[a-z]+)"/g)) if(!allowed.has(m[1]))errors.push(`unknown literal company route: ${m[1]}`);
const functionBlock=(name,next)=>{const a=app.indexOf(`function ${name}(`),b=a<0?-1:app.indexOf(`\nfunction ${next}(`,a);return a>=0&&b>a?app.slice(a,b):''};
const agenda=functionBlock('renderExecutiveAgenda','renderRivalSnapshot');
const coach=functionBlock('companyCoachItems','renderMarketingGuide');
need(agenda.includes('data-company-route="${x[3]}"'),'board agenda uses precise route targets');
need(!agenda.includes('data-company-section-jump'),'board agenda does not fall back to broad section navigation');
need(coach.includes('competition:control')&&coach.includes('risk:compliance')&&coach.includes('operations:finance')&&coach.includes('people:workforce'),'coach routes major risks to their actual workspaces');
need(coach.includes('data-company-route="${x[3]}"'),'coach buttons use precise routes');
const nav=app.slice(app.indexOf("document.querySelectorAll('[data-main-tab]')"),app.indexOf("const communityRefresh=",app.indexOf("document.querySelectorAll('[data-main-tab]')")));
need(!nav.includes("state.companyOpsTab='products'")&&!nav.includes("state.companyCompetitionTab='companies'")&&!nav.includes("state.companyRiskTab='news'"),'top navigation preserves the CEO last-used subworkspace');
if(errors.length){console.error('[KX ROUTE INTEGRITY V11] FAILED');errors.forEach(e=>console.error(' - '+e));process.exit(1)}
console.log('[KX ROUTE INTEGRITY V11] PASS');
console.log(' - board/coach actions open the actual decision screen');
console.log(' - literal company routes stay inside the supported route map');
console.log(' - returning to a section preserves the last subworkspace');
