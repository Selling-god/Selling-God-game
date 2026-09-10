const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
let source=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const exportCode=`window.__KX_TEST__={state,formatKrwSmart,holdingStakeValue,companyIncomingDirectStake,aggregateIncomingHoldings,companyExternalOwnershipTotal,ownerStakeOf,companyStakeAgainstMe,companyOwnershipStructure,companyOutsideVotingCap,companyExplicitFounderStake,sanitizeCompanyPayload,renderTakeoverDesk,emptyCompany,runtimeErrorText,companyFinanceSnapshot,companyDisplayRevenue,companyDisplayOperatingProfit};`;
const idx=source.lastIndexOf('boot();');
if(idx<0)throw new Error('boot() marker not found');
source=source.slice(0,idx)+exportCode+source.slice(idx+'boot();'.length);

const store=new Map();
const storage={getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k),clear:()=>store.clear()};
const nullClass={add(){},remove(){},toggle(){return false},contains(){return false}};
const app={innerHTML:'',classList:nullClass};
const doc={
  getElementById:id=>id==='app'?app:null,
  querySelector:()=>null,querySelectorAll:()=>[],
  addEventListener(){},removeEventListener(){},
  body:{classList:nullClass,contains:()=>false,appendChild(){},removeChild(){}},
  documentElement:{classList:nullClass,style:{},requestFullscreen:async()=>{}},
  visibilityState:'visible',activeElement:null,fullscreenElement:null,
  createElement:()=>({style:{},classList:nullClass,appendChild(){},remove(){},setAttribute(){},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}})
};
const location={protocol:'http:',href:'http://qa.local/',replace(){}};
const sandbox={
  console,window:null,globalThis:null,document:doc,localStorage:storage,sessionStorage:storage,location,navigator:{clipboard:null},
  Intl,Date,Math,Number,String,Array,Object,Map,Set,JSON,RegExp,Error,Promise,URL,AbortController,
  setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},requestAnimationFrame:fn=>{if(typeof fn==='function')fn();return 0},cancelAnimationFrame(){},
  addEventListener(){},removeEventListener(){},scrollX:0,scrollY:0,scrollTo(){},innerWidth:1440,innerHeight:900,devicePixelRatio:1,
  fetch:async()=>({ok:false,json:async()=>({})}),performance:{now:()=>0},AudioContext:function(){},webkitAudioContext:function(){},
  structuredClone:global.structuredClone||((x)=>JSON.parse(JSON.stringify(x)))
};
sandbox.window=sandbox;sandbox.globalThis=sandbox;
vm.createContext(sandbox);
vm.runInContext(source,sandbox,{filename:'app.js',timeout:3000});
const T=sandbox.__KX_TEST__;
if(!T)throw new Error('test exports unavailable');
const errors=[];const ok=(cond,msg)=>{if(!cond)errors.push(msg)};const near=(a,b,e=.001)=>Math.abs(a-b)<=e;

ok(T.formatKrwSmart(-1250000000).startsWith('-'),'negative financial amounts must keep a minus sign');

// Player-facing errors must keep useful business messages but hide backend implementation details.
ok(T.runtimeErrorText(new Error('현금이 부족합니다.'))==='현금이 부족합니다.','business-rule errors should stay actionable for the player');
const technicalError=T.runtimeErrorText(new Error('PostgREST PGRST204 column cash_delta does not exist in schema cache'));
ok(!/PGRST|PostgREST|schema|column/i.test(technicalError),'backend schema details must never leak to the player');
const authError=T.runtimeErrorText(new Error('JWT expired HTTP 403'));
ok(authError.includes('로그인'),'expired auth errors should become a player-readable login message');
ok(T.runtimeErrorText(new Error('insufficient funds')).includes('현금'),'common English business errors should become Korean player messages');
ok(T.runtimeErrorText(new Error('Invalid login credentials')).includes('이메일'),'common auth failures should become Korean player messages');
ok(T.holdingStakeValue({stake:150})===100,'ownership must clamp to 100%');
ok(T.companyIncomingDirectStake({incoming_stake:180})===100,'aggregate outside ownership must clamp to 100%');

const dirty={
  my_company:{id:1,name:'QA',cash:'1000',valuation:'5000',revenue:'2000',profit:'-300',debt:'100',employees:'5',incoming_stake:'35'},
  companies:[{id:1,name:'QA',valuation:'5000',profit:'-300'},{id:1,name:'QA DUP',valuation:'9000'},{id:2,name:'Rival',valuation:'7000'}],
  incoming_holdings:[{holder_company_id:2,holder_name:'Rival',stake:120,market_value:'300'},{holder_company_id:3,holder_name:'Fund',stake:'5',market_value:'20'}],
  my_holdings:[{target_company_id:2,stake:130,market_value:'100'}],market_holdings:[]
};
const clean=T.sanitizeCompanyPayload(dirty);
ok(clean.companies.length===2,'duplicate company IDs must be removed from snapshots');
ok(clean.my_company.profit===-300,'sanitizer must preserve operating losses');

// Accounting invariants: never display a P&L where revenue - COGS - OPEX disagrees with operating profit.
T.state.company={...T.emptyCompany(),realism_available:true,finance_periods:[{period_no:4,revenue:42000000000,cogs:18300000000,operating_expenses:23100000000,operating_profit:600000000,net_profit:-1250000000}],finance_live:{},supply:{accounts_receivable:900000000,inventory_value:1200000000,accounts_payable:700000000}};
const financeMy={id:1,cash:8500000000,revenue:42000000000,profit:-1250000000,debt:7200000000,valuation:125000000000};
const fa=T.companyFinanceSnapshot(financeMy,false);
ok(near(fa.grossProfit,23700000000,1),'gross profit must always equal revenue minus COGS');
ok(near(fa.operatingExpenses,23100000000,1),'aggregate operating expense aliases must be recognized');
ok(near(fa.operatingProfit,600000000,1),'operating profit must reconcile exactly to gross profit minus OPEX');
ok(near(fa.netIncome,-1250000000,1),'net_profit alias must be honored as the reported bottom line');
ok(near(fa.nonOperating,1850000000,1),'unclassified non-operating/interest/tax bridge must reconcile operating profit to net income');
ok(near(fa.ar,900000000,1)&&near(fa.inventory,1200000000,1)&&near(fa.ap,700000000,1),'balance-sheet working-capital values must fall back to supply snapshot');
ok(!fa.operatingCashFlowKnown&&!fa.investingCashFlowKnown,'missing cash-flow data must remain unknown instead of being presented as exact zero');
ok(near(T.companyDisplayOperatingProfit(financeMy),600000000,1),'headline operating profit must agree with management accounting when accounting data exists');
const countClean=T.sanitizeCompanyPayload({my_company:{id:1,name:'Count QA',employees:'5.9',shares_outstanding:'100.8'},companies:[],incoming_holdings:[],my_holdings:[],market_holdings:[]});
ok(countClean.my_company.employees===5&&countClean.my_company.shares_outstanding===100,'employee/share counts must be non-negative integers');
ok(clean.incoming_holdings.reduce((a,h)=>a+Number(h.stake||0),0)<=100.0001,'aggregate outside voting ownership must never exceed 100%');
ok(clean.my_holdings[0].stake===100,'owned company stake must clamp at 100%');
const idOnly=T.sanitizeCompanyPayload({incoming_holdings:[{holder_company_id:77,holder_ticker:'ID77',stake:4.2,market_value:100}],my_holdings:[],market_holdings:[]});
ok(idOnly.incoming_holdings.length===1&&idOnly.incoming_holdings[0].stake===4.2,'valid shareholder rows must survive even when holder_name is missing');

// Reproduce the screenshot-type case: a player-founded independent company cannot silently become 0% founder owned.
T.state.company={...T.emptyCompany(),my_company:{id:1,owner_user_id:'USER-1',operator_type:'ME',name:'KX QA',valuation:8e12,cash:4e11,revenue:1e12,profit:8e10,debt:2e11,incoming_stake:100,defense_power:20,parent_name:null},companies:[],incoming_holdings:[
  {holder_company_id:101,holder_name:'Passive A',holder_ticker:'PA',holder_type:'기관',stake:45,market_value:3.6e12},
  {holder_company_id:102,holder_name:'Passive B',holder_ticker:'PB',holder_type:'기관',stake:35,market_value:2.8e12},
  {holder_company_id:103,holder_name:'Passive C',holder_ticker:'PC',holder_type:'기관',stake:20,market_value:1.6e12}
],my_holdings:[],events:[],press:[],control_case:null};
const ext=T.companyExternalOwnershipTotal(T.state.company.my_company);
const threat=T.companyStakeAgainstMe();
const owner=T.ownerStakeOf(T.state.company.my_company);
ok(near(ext,49),'independent founder-controlled company must cap unexplained outside voting ownership below control line');
ok(threat===0,'passive outside ownership must not be called a hostile takeover threat');
ok(near(owner,51),'player founder must retain majority unless an actual control/dilution event exists');
const structure=T.companyOwnershipStructure(T.state.company.my_company);
ok(structure.status.includes('창업자'),'independent majority-controlled company must be described as founder controlled');
const takeoverHtml=T.renderTakeoverDesk(T.state.company.my_company);
ok(takeoverHtml.includes('창업자·경영진 의결권')&&takeoverHtml.includes('51.00%'),'M&A screen must show a plausible founder voting block');
ok(takeoverHtml.includes('외부 주주 의결권')&&takeoverHtml.includes('49.00%'),'M&A screen must reconcile outside voting ownership');
ok(takeoverHtml.includes('의결권 합계')&&takeoverHtml.includes('100.00%'),'M&A screen must visibly reconcile voting ownership to 100%');
ok(takeoverHtml.includes('적대적 인수 지분')&&takeoverHtml.includes('0.00%'),'M&A screen must display evidenced hostile stake separately');

// A live takeover may legitimately break the founder majority; that transition must be explicit rather than silent.
T.state.company.control_case={status:'ACTIVE',attacker_company_id:101,attacker_name:'Passive A',stake:55,aggregate_stake:55};
T.state.company.incoming_holdings=[{holder_company_id:101,holder_name:'Passive A',holder_type:'적대적 인수자',stake:55,market_value:4.4e12}];
const contestedExt=T.companyExternalOwnershipTotal(T.state.company.my_company),contestedOwner=T.ownerStakeOf(T.state.company.my_company);
ok(near(contestedExt,55),'shareholder ledger must outrank a stale generic incoming_stake during a live contest');
ok(near(contestedOwner,45),'a live takeover can explicitly break founder majority without inventing 100% outside ownership');
ok(T.companyOwnershipStructure(T.state.company.my_company).contest,'loss of founder control must be tied to an explicit live contest');

// Explicit founder ownership is authoritative when no control contest is active.
T.state.company.control_case=null;T.state.company.my_company.incoming_stake=80;T.state.company.my_company.founder_stake_pct=72;
T.state.company.incoming_holdings=[{holder_company_id:201,holder_name:'Fund',stake:60,market_value:1}];
ok(near(T.companyExternalOwnershipTotal(T.state.company.my_company),28),'explicit founder stake must cap outside voting rights to the complementary percentage');
ok(near(T.ownerStakeOf(T.state.company.my_company),72),'founder and outside voting rights must reconcile exactly');

// Duplicate holder records aggregate rather than create contradictory duplicate rows.
T.state.company.my_company={id:9,is_bot:true,operator_type:'BOT',name:'QA BOT'};T.state.company.control_case=null;T.state.company.incoming_holdings=[
  {holder_company_id:201,holder_name:'Same Fund',holder_ticker:'SF',stake:2.5,market_value:10},
  {holder_company_id:201,holder_name:'Same Fund',holder_ticker:'SF',stake:3.5,market_value:20}
];
const ag=T.aggregateIncomingHoldings();
ok(ag.length===1&&near(ag[0].stake,6),'duplicate shareholder records must aggregate into one 6% row');

// Organizational and corporate-state consistency.
const org=T.sanitizeCompanyPayload({my_company:{id:5,owner_user_id:'U',operator_type:'ME',status:'ACTIVE',employees:10,shares_outstanding:0,global_share:2,global_level:0,hr_engineering:8,hr_sales:7,hr_operations:4,hr_finance:2,hr_management:1},companies:[],incoming_holdings:[],my_holdings:[],market_holdings:[]});
const deptTotal=['hr_engineering','hr_sales','hr_operations','hr_finance','hr_management'].reduce((a,k)=>a+Number(org.my_company[k]||0),0);
ok(org.my_company.shares_outstanding>=1,'an active company must have at least one issued share');
ok(deptTotal<=org.my_company.employees,'department headcount cannot exceed total employees');
ok(org.my_company.global_level>=1,'nonzero global market share requires a nonzero global operating level');

if(errors.length){console.error('[KX GAME LOGIC TEST V12] FAILED');for(const e of errors)console.error(' - '+e);process.exit(1)}
console.log('[KX GAME LOGIC TEST V12] PASS');
console.log(' - signed loss display');
console.log(' - ownership invariant 0..100%');
console.log(' - snapshot duplicate/NaN/count hygiene');
console.log(' - passive holders != hostile takeover');
console.log(' - founder voting control cannot silently disappear');
console.log(' - live takeover is the explicit path to founder control loss');
console.log(' - issued-share / headcount / global-presence consistency');
console.log(' - duplicate shareholder aggregation');
console.log(' - player-facing backend error sanitization');
console.log(' - P&L / working-capital accounting reconciliation');
console.log(' - missing cash-flow values stay explicitly unknown');
