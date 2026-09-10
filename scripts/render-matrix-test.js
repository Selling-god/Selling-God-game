const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
let source=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const exportCode=`window.__KX_RENDER_TEST__={state,emptyCompany,renderCompanyRoom,sanitizeCompanyPayload};`;
const idx=source.lastIndexOf('boot();');
if(idx<0)throw new Error('boot() marker not found');
source=source.slice(0,idx)+exportCode+source.slice(idx+'boot();'.length);

const store=new Map();
const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()};
const nullClass={add(){},remove(){},toggle(){return false},contains(){return false}};
const app={innerHTML:'',classList:nullClass};
const doc={
  getElementById:id=>id==='app'?app:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},removeEventListener(){},
  body:{classList:nullClass,contains:()=>false,appendChild(){},removeChild(){}},
  documentElement:{classList:nullClass,style:{},requestFullscreen:async()=>{}},visibilityState:'visible',activeElement:null,fullscreenElement:null,
  createElement:()=>({style:{},classList:nullClass,appendChild(){},remove(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}})
};
const location={protocol:'http:',href:'http://qa.local/',replace(){}};
const sandbox={console,window:null,globalThis:null,document:doc,localStorage:storage,sessionStorage:storage,location,navigator:{clipboard:null},Intl,Date,Math,Number,String,Array,Object,Map,Set,JSON,RegExp,Error,Promise,URL,AbortController,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 0},cancelAnimationFrame(){},addEventListener(){},removeEventListener(){},scrollX:0,scrollY:0,scrollTo(){},innerWidth:1440,innerHeight:900,devicePixelRatio:1,fetch:async()=>({ok:false,json:async()=>({})}),performance:{now:()=>0},AudioContext:function(){},webkitAudioContext:function(){},structuredClone:global.structuredClone||((x)=>JSON.parse(JSON.stringify(x)))};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);vm.runInContext(source,sandbox,{filename:'app.js',timeout:3500});
const T=sandbox.__KX_RENDER_TEST__;if(!T)throw new Error('render test exports unavailable');

const my={id:1,name:'KX 테스트 기업',sector:'AI·반도체',home_country:'대한민국',status:'ACTIVE',cash:8500000000,valuation:125000000000,revenue:42000000000,previous_revenue:38000000000,profit:-1250000000,debt:7200000000,employees:128,share_price:18420,shares_outstanding:6786102,technology:72,brand:63,operations:68,product_quality:70,employee_morale:61,customer_trust:66,investor_sentiment:58,media_reputation:55,credit_score:71,governance:68,defense_power:19,global_level:1,global_share:0.4,domestic_share:2.8,monthly_payroll:650000000,monthly_fixed_cost:480000000,avg_monthly_salary:5080000,tax_due:340000000,tax_arrears:0,last_return_pct:-1.25,incoming_stake:22.5,hr_engineering:35,hr_sales:26,hr_operations:38,hr_finance:14,hr_management:15};
const rival={id:2,name:'한빛 데이터 시스템즈 인터내셔널',sector:'AI·반도체',home_country:'대한민국',status:'ACTIVE',cash:12000000000,valuation:150000000000,revenue:51000000000,profit:2800000000,debt:8000000000,employees:160,share_price:22100,technology:76,brand:67,operations:70,product_quality:74,employee_morale:65,customer_trust:69,investor_sentiment:62,media_reputation:61,credit_score:74,governance:70,defense_power:23,last_return_pct:0.7,ai_style:'GROWTH'};
const base={...T.emptyCompany(),my_company:my,companies:[my,rival],world:{cycle_no:247,cycle:247,day_no:3},talent_day:3,talent_available:true,realism_available:true,products:[],projects:[],events:[],press:[],finance_periods:[],incidents:[],due_diligence:[],recruit_pool:[],talents:[],poach_targets:[],talent_offers:[],my_markets:[],my_holdings:[],incoming_holdings:[{holder_company_id:10,holder_name:'Korea Growth Fund',holder_ticker:'KGF',holder_type:'기관',stake:12.5,market_value:15000000000},{holder_company_id:11,holder_name:'장기 가치투자 파트너스',holder_ticker:'LVP',holder_type:'기관',stake:10,market_value:12000000000}],market_holdings:[],stock_options:[],media_campaigns:[],tax_records:[],investment_income:[],investment_summary:{},macro:{},supply:{supply_risk:24,inventory_value:1200000000,accounts_receivable:900000000,accounts_payable:700000000},finance_live:{},control_case:null};
T.state.company=T.sanitizeCompanyPayload(base);T.state.companyAvailable=true;T.state.companyStale=false;T.state.companyNotice='';

const cases=[];
for(const tab of ['today','approvals','performance','progress'])cases.push(['dashboard',tab,'companyDashTab']);
for(const tab of ['products','projects','supply','finance','portfolio','global'])cases.push(['operations',tab,'companyOpsTab']);
for(const tab of ['talent','workforce'])cases.push(['people',tab,'companyPeopleTab']);
for(const tab of ['companies','war','control'])cases.push(['competition',tab,'companyCompetitionTab']);
for(const tab of ['news','compliance'])cases.push(['risk',tab,'companyRiskTab']);
const failures=[];
for(const [section,tab,key] of cases){
  T.state.companySection=section;T.state[key]=tab;
  try{
    const html=String(T.renderCompanyRoom()||'');
    if(html.length<250)failures.push(`${section}/${tab}: suspiciously short output`);
    if(/\b(?:NaN|Infinity|undefined)\b/.test(html))failures.push(`${section}/${tab}: invalid literal in rendered HTML`);
    if(html.includes('[object Object]'))failures.push(`${section}/${tab}: object leaked into UI`);
    const ids=[...html.matchAll(/\sid=["']([^"']+)["']/g)].map(m=>m[1]);
    const dupIds=[...new Set(ids.filter((id,i)=>ids.indexOf(id)!==i))];
    if(dupIds.length)failures.push(`${section}/${tab}: duplicate DOM id(s): ${dupIds.join(', ')}`);
    if(/<button\b[^>]*>\s*<\/button>/i.test(html))failures.push(`${section}/${tab}: empty button label`);
    if(!html.includes('company-page'))failures.push(`${section}/${tab}: company page wrapper missing`);
  }catch(err){failures.push(`${section}/${tab}: ${err&&err.stack?err.stack:err}`)}
}
if(failures.length){console.error('[KX RENDER MATRIX V10] FAILED');for(const f of failures)console.error(' - '+f);process.exit(1)}
console.log('[KX RENDER MATRIX V10] PASS');
console.log(` - ${cases.length} company workspaces rendered without exception/NaN/undefined leakage`);
console.log(' - dashboard 4 / operations 6 / people 2 / competition 3 / risk 2');
console.log(' - duplicate DOM IDs / empty button labels rejected');
