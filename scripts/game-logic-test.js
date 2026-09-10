const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
let source=fs.readFileSync(path.join(root,'public','app.js'),'utf8');
const exportCode=`window.__KX_TEST__={state,formatKrwSmart,holdingStakeValue,companyIncomingDirectStake,aggregateIncomingHoldings,companyExternalOwnershipTotal,ownerStakeOf,companyStakeAgainstMe,sanitizeCompanyPayload,renderTakeoverDesk,emptyCompany,runtimeErrorText};`;
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
const countClean=T.sanitizeCompanyPayload({my_company:{id:1,name:'Count QA',employees:'5.9',shares_outstanding:'100.8'},companies:[],incoming_holdings:[],my_holdings:[],market_holdings:[]});
ok(countClean.my_company.employees===5&&countClean.my_company.shares_outstanding===100,'employee/share counts must be non-negative integers');
ok(clean.incoming_holdings[0].stake===100,'snapshot holder stake must clamp at 100%');
ok(clean.my_holdings[0].stake===100,'owned company stake must clamp at 100%');
const idOnly=T.sanitizeCompanyPayload({incoming_holdings:[{holder_company_id:77,holder_ticker:'ID77',stake:4.2,market_value:100}],my_holdings:[],market_holdings:[]});
ok(idOnly.incoming_holdings.length===1&&idOnly.incoming_holdings[0].stake===4.2,'valid shareholder rows must survive even when holder_name is missing');

// Reproduce the screenshot-type case: many passive outside holders but no hostile case.
T.state.company={...T.emptyCompany(),my_company:{id:1,name:'KX QA',valuation:8e12,cash:4e11,revenue:1e12,profit:8e10,debt:2e11,incoming_stake:80.5,defense_power:20},companies:[],incoming_holdings:[
  {holder_company_id:101,holder_name:'Passive A',holder_ticker:'PA',holder_type:'기관',stake:12.3,market_value:9e11},
  {holder_company_id:102,holder_name:'Passive B',holder_ticker:'PB',holder_type:'기관',stake:8.2,market_value:6e11},
  {holder_company_id:103,holder_name:'Passive C',holder_ticker:'PC',holder_type:'기관',stake:3.0,market_value:2e11}
],my_holdings:[],events:[],press:[],control_case:null};
const ext=T.companyExternalOwnershipTotal(T.state.company.my_company);
const threat=T.companyStakeAgainstMe();
const owner=T.ownerStakeOf(T.state.company.my_company);
ok(near(ext,80.5),'outside ownership total must use aggregate ownership');
ok(threat===0,'passive outside ownership must not be called a hostile takeover threat');
ok(near(owner,19.5),'friendly/management ownership must reconcile to 100%');
const takeoverHtml=T.renderTakeoverDesk(T.state.company.my_company);
ok(takeoverHtml.includes('외부 주주 전체')&&takeoverHtml.includes('80.50%'),'M&A screen must display aggregate outside ownership');
ok(takeoverHtml.includes('경영권 위협')&&takeoverHtml.includes('0.00%'),'M&A screen must display takeover threat separately');
ok(!takeoverHtml.includes('외부 세력 보유지분'),'old ambiguous takeover label must not render');
ok((takeoverHtml.match(/class="stake-row/g)||[]).length===3,'shareholder register should render each distinct holder once');

// Duplicate holder records aggregate rather than create contradictory duplicate rows.
T.state.company.incoming_holdings=[
  {holder_company_id:201,holder_name:'Same Fund',holder_ticker:'SF',stake:2.5,market_value:10},
  {holder_company_id:201,holder_name:'Same Fund',holder_ticker:'SF',stake:3.5,market_value:20}
];
const ag=T.aggregateIncomingHoldings();
ok(ag.length===1&&near(ag[0].stake,6),'duplicate shareholder records must aggregate into one 6% row');

if(errors.length){console.error('[KX GAME LOGIC TEST V10] FAILED');for(const e of errors)console.error(' - '+e);process.exit(1)}
console.log('[KX GAME LOGIC TEST V10] PASS');
console.log(' - signed loss display');
console.log(' - ownership invariant 0..100%');
console.log(' - snapshot duplicate/NaN/count hygiene');
console.log(' - passive holders != hostile takeover');
console.log(' - outside ownership reconciles with friendly stake');
console.log(' - duplicate shareholder aggregation');
console.log(' - player-facing backend error sanitization');
