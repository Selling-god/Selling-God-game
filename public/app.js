(()=>{
const KX_COMPANY_BUILD='6.6.2-WORKSPACE-UX-REALISM';
window.__KX_COMPANY_BUILD__=KX_COMPANY_BUILD;
const C=window.__KX_CONFIG__||{};
const nf=new Intl.NumberFormat('ko-KR');
const won=n=>`${nf.format(Math.round(Number(n)||0))}원`;
const pct=n=>`${n>0?'+':''}${Number(n||0).toFixed(2)}%`;
const app=document.getElementById('app');
const LS='kx_session_v2';
const NEWS_SEEN_KEY='kx_news_seen_v2';
let lastSeenNewsId=Number(localStorage.getItem(NEWS_SEEN_KEY)||0);
let newsBaselineReady=false;
let newsFlashTimer=null;
let talentTrainingRpcAvailable=null;
let talentTrainingToastTimer=null;
let companyIncomeToastTimer=null;
let companyIncomeBaselineReady=false;
let lastCompanyIncomeId=0;
let companyApiReady=false;
let companyLastFetchAt=0;
let companyLastAdvanceAt=0;
let companyVisualTimer=null;
let companyClockTimer=null;
let companyPressBaselineReady=false;
let lastCompanyPressId=0;
let companyClockInitialized=false;
let companyClockAnchorReal=Date.now();
let companyClockAnchorCycle=1;
let companyClockAnchorTotalMinutes=0;
let companyChartAxisCache={id:null,lo:null,hi:null};
let companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};
let companyServerOffsetMs=0;
let pendingDefenseCashSpend=null;
let pendingEconomicTxn=null;
let pendingDefenseStakeTxn=null;
let uiLastInteractionAt=0;
const COMPANY_SERVER_SYNC_MS=12000;
const COMPANY_VISUAL_TICK_MS=1000;

let session=null;
let state={
  stocks:[],ticker:'A101',candles:[],depth:[],news:[],clock:null,
  account:null,positions:[],orders:[],trades:[],ranking:[],
  bankDeposits:[],bankLoans:[],bankMeta:{},chartRanges:{},
  game:{events:[],predictions:[],shorts:[],ipos:[],subscriptions:[],dividends:[],short_adjustments:[],prediction_stats:{total:0,correct:0}},gameAvailable:true,gameError:'',
  company:{my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],media_campaigns:[],tax_records:[],events:[],press:[],my_history:[],projects:[],investment_income:[],investment_summary:{},products:[],finance_periods:[],incidents:[],due_diligence:[],macro:{},supply:{},finance_live:{},recruit_pool:[],talents:[],poach_targets:[],talent_offers:[],talent_summary:{},talent_day:1,talent_hired_today:0,talent_daily_limit:5,talent_available:false,talent_error:'',realism_available:false,realism_error:'',world:null,control_case:null},
  companyAvailable:true,companyMode:'REMOTE',companyRpcMode:'AUTO',companyError:'',companyRegion:'국내',companyNotice:'',companySection:'dashboard',companyAnalysisId:null,companyAnalysis:null,companyMetric:'valuation',companySearch:'',companyMediaRegion:'ALL',companyMediaTone:'PROMOTE',companyMediaTargetId:null,companyMediaSearch:'',companyOpsTab:'products',companyDashTab:'today',companyPeopleTab:'talent',companyCompetitionTab:'companies',companyRiskTab:'news',companyKickoff:null,companyKickoffLast:null,companyTalentGradeFilter:'ALL',
  companyDraft:{name:'',sector:'AI·반도체'},
  side:'BUY',type:'LIMIT',tif:'DAY',tab:'company',tradeTab:'book',
  orderQty:1,orderPrice:null,pendingOrder:null,chartPeriod:'1M',marketFilter:'ALL'
};

const headers=(auth=true)=>{
  const h={apikey:C.supabaseAnonKey,'Content-Type':'application/json'};
  if(auth&&session?.access_token)h.Authorization=`Bearer ${session.access_token}`;
  return h;
};

async function req(path,opt={}){
  const r=await fetch(C.supabaseUrl+path,{...opt,headers:{...headers(opt.auth!==false),...(opt.headers||{})}});
  let data=null;
  const txt=await r.text();
  try{data=txt?JSON.parse(txt):null}catch{data=txt}
  if(!r.ok){
    const detail=data?.message||data?.msg||data?.error_description||data?.error||data?.hint||data?.error_code||data?.code||(typeof data==='string'&&data)||`HTTP ${r.status}`;
    const err=new Error(String(detail));err.status=r.status;err.payload=data;throw err;
  }
  return data;
}
async function rpc(name,body,auth=true){return req(`/rest/v1/rpc/${name}`,{method:'POST',body:JSON.stringify(body||{}),auth})}
async function companyApi(action,payload={},auth=true){
  const a=String(action||'').toUpperCase();
  if(a==='PROFILE'){
    return rpc('kx_company_profile_v5101',{p_company_id:Number(payload?.p_company_id||0)},auth);
  }
  return rpc('kx_company_api_v1',{p_action:a,p_payload:payload||{}},auth);
}
async function companyOpsV511(action,payload={}){
  return rpc('kx_company_ops_v511',{p_action:String(action||'').toUpperCase(),p_payload:payload||{}},true);
}
async function companyRealismApi(action,payload={}){
  return rpc('kx_company_realism_v620',{p_action:String(action||'').toUpperCase(),p_payload:payload||{}},true);
}
async function companyTalentApi(action,payload={}){
  return rpc('kx_company_talent_v640',{p_action:String(action||'').toUpperCase(),p_payload:payload||{}},true);
}
async function companyTalentTerminateV645(talentId){
  return rpc('kx_company_talent_terminate_v645',{p_talent_id:Number(talentId||0)},true);
}
async function companyIncentiveV650(scope,target,amount){
  return rpc('kx_company_incentive_v650',{p_scope:String(scope||'').toUpperCase(),p_target:String(target||''),p_amount:Number(amount||0)},true);
}
async function companyMediaV640(outlet,targetCompanyId,tone='PROMOTE'){
  return rpc('kx_company_media_v640',{p_outlet:String(outlet||'ECON_DAILY').toUpperCase(),p_target_company_id:Number(targetCompanyId||0),p_tone:String(tone||'PROMOTE').toUpperCase()},true);
}
async function companyDefenseV640(action,budget){
  const a=String(action||'').toUpperCase(),spend=Math.max(0,Number(budget||0));
  const my=state.company?.my_company,beforeCash=Math.max(0,Number(my?.cash||0));
  const paidActions=new Set(['BUYBACK','NEGOTIATE','WHITE_KNIGHT','POISON_PILL','RIGHTS_ISSUE','COUNTER_TAKEOVER']);
  if(paidActions.has(a)&&spend>beforeCash)throw new Error(`경영권 방어 예산이 부족합니다. 보유 ${formatKrwSmart(beforeCash)} / 필요 ${formatKrwSmart(spend)}`);
  const beforeRawCash=Math.max(0,Number(my?._raw_server_cash??my?.cash??0));
  const beforeRawStake=rawLiveTakeoverStake(state.company);
  const beforeEffective=companyStakeAgainstMe();
  const valuation=Math.max(1,Number(my?.valuation||1));
  const desiredReduction=defenseExpectedStakeReduction(a,spend,valuation,beforeEffective);
  const result=await rpc('kx_company_defense_v640',{p_action:a,p_budget:spend},true);
  if(result?.ok!==false&&my&&paidActions.has(a)){
    pendingEconomicTxn={type:'DEFENSE',companyId:String(my.id||'guest'),beforeRawCash,desiredCashDelta:-spend,createdAt:Date.now()};
    pendingDefenseStakeTxn={companyId:String(my.id||'guest'),caseKey:takeoverCaseKey(state.company?.control_case||{}),action:a,budget:spend,beforeRawStake,beforeEffective,desiredReduction,createdAt:Date.now()};
  }
  return result;
}
function companyTaxRateText(my){
  const r=Number(my?.tax_rate_effective||0);
  return r>0?`${r.toFixed(1)}%`:'결산 전';
}
function departmentLabel(code){
  return ({ENGINEERING:'기술·R&D',SALES:'영업·마케팅',OPERATIONS:'생산·운영',FINANCE:'재무·준법',MANAGEMENT:'경영지원'})[code]||'조직';
}
function showCompanyIncomeToast(row){
  if(!row)return;
  clearTimeout(companyIncomeToastTimer);
  document.getElementById('companyIncomeToast')?.remove();
  const el=document.createElement('aside');
  el.id='companyIncomeToast';el.className='company-income-toast';
  const amount=Number(row.amount)||0;
  el.innerHTML=`<small>법인계좌 입금</small><b>${escapeHtml(row.source_name||'투자수익')}</b><strong class="${amount>=0?'up':'down'}">${amount>=0?'+':''}${compactMoney(amount)}원</strong><span>${escapeHtml(row.income_label||row.income_type||'현금수익')} · ${escapeHtml(row.note||'법인현금에 반영되었습니다.')}</span>`;
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));
  companyIncomeToastTimer=setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),220)},6000);
}
function processCompanyIncome(rows){
  if(!Array.isArray(rows)||!rows.length)return;
  const ids=rows.map(r=>Number(r.id)||0),maxId=Math.max(...ids,0);
  if(!companyIncomeBaselineReady){companyIncomeBaselineReady=true;lastCompanyIncomeId=maxId;return;}
  const unseen=rows.filter(r=>(Number(r.id)||0)>lastCompanyIncomeId).sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
  if(unseen.length)showCompanyIncomeToast(unseen[unseen.length-1]);
  lastCompanyIncomeId=Math.max(lastCompanyIncomeId,maxId);
}
function visualCompanyPrice(c){
  // V5.9: the number shown as the share price is always the canonical server price.
  // No per-browser random/wave price is allowed because every user must see the same price.
  return Math.max(1,Number(c?.share_price)||1);
}

function companyMarketVolatilityProfile(c={}){
  const valuation=Math.max(1,Number(c?.valuation||0)||1);
  const sector=String(c?.sector||'').toLowerCase();
  const style=String(c?.ai_style||'').toUpperCase();
  let targetRange=valuation>=5e13?.032:valuation>=1e13?.038:valuation>=5e12?.044:valuation>=1e12?.052:valuation>=3e11?.062:.072;
  if(/ai|반도체|로보|게임|콘텐츠|바이오|핀테크|소프트웨어|tech/.test(sector))targetRange+=.016;
  if(['GROWTH','AGGRESSIVE','TECH'].includes(style))targetRange+=.010;
  if(['DEFENSIVE','VALUE'].includes(style))targetRange-=.007;
  targetRange=Math.max(.032,Math.min(.12,targetRange));
  const wick=Math.max(.0018,Math.min(.0065,targetRange*.065));
  const axisRange=Math.max(.045,Math.min(.14,targetRange*1.10));
  return {targetRange,wick,axisRange};
}
function companyDeterministicNoise(companyId,cycle,salt=0){
  const x=Math.sin((Number(companyId||1)+11.73)*12.9898+(Number(cycle||0)+salt*17.17)*78.233)*43758.5453123;
  return (x-Math.floor(x))*2-1;
}

// V6.6.1: deterministic BOT management layer. The same server cycle and company
// data produce the same decision for every connected player. This keeps BOT firms
// active without requiring a client to become the authoritative game server.
const BOT_STRATEGY_MODEL_VERSION=661;
const BOT_STRATEGY_LABELS={
  RND:'R&D 집중',QUALITY:'품질 개선',CAPEX:'설비 확장',HIRING:'인재 확충',MARKETING:'시장 확대',
  PRICE_WAR:'가격 공세',COSTCUT:'수익성 개선',REPAY:'부채 축소',M_AND_A:'M&A 탐색',GLOBAL:'해외 확장',CASH_RESERVE:'현금 방어'
};
function botStrategyArchetype(c={}){
  const style=String(c.ai_style||'').toUpperCase();
  if(/AGGRESS|RAIDER|HOSTILE/.test(style))return 'AGGRESSIVE';
  if(/TECH|INNOV|RND/.test(style))return 'INNOVATOR';
  if(/VALUE|COST|EFFICI/.test(style))return 'OPERATOR';
  if(/GLOBAL|GROWTH|EXPAND/.test(style))return 'GROWTH';
  if(/SAFE|DEFEN|CONSERV/.test(style))return 'CONSERVATIVE';
  const picks=['GROWTH','INNOVATOR','OPERATOR','AGGRESSIVE','CONSERVATIVE'];
  return picks[Math.floor(((companyDeterministicNoise(Number(c.id||1),BOT_STRATEGY_MODEL_VERSION,91)+1)/2)*picks.length)%picks.length];
}
function botStrategyDecision(c={},data=state.company,periodOffset=0){
  const cycle=Math.max(1,Number(data?.world?.cycle_no||data?.world?.cycle||1)||1);
  const period=Math.max(0,Math.floor((cycle-1)/12)-Math.max(0,Number(periodOffset)||0));
  const rev=Math.max(1,Number(c._bot_strategy_raw_revenue??c.revenue??1));
  const profit=Number(c._bot_strategy_raw_profit??c.profit??0),margin=profit/rev*100;
  const value=Math.max(1,Number(c._bot_strategy_raw_valuation??c.valuation??1));
  const debt=Math.max(0,Number(c.debt||0)),debtRatio=debt/value*100,cash=Math.max(0,Number(c.cash||0));
  const growth=companyGrowth(c),tech=Number(c.technology||50),quality=Number(c.product_quality||50),ops=Number(c.operations||50),brand=Number(c.brand||50),morale=Number(c.employee_morale||60);
  const archetype=botStrategyArchetype(c),scores={RND:34,QUALITY:30,CAPEX:30,HIRING:28,MARKETING:31,PRICE_WAR:18,COSTCUT:20,REPAY:12,M_AND_A:14,GLOBAL:15,CASH_RESERVE:10};
  scores.RND+=(65-tech)*1.15+(archetype==='INNOVATOR'?24:0);
  scores.QUALITY+=(62-quality)*1.25;
  scores.CAPEX+=(62-ops)*1.05+(growth>8?10:0);
  scores.HIRING+=(55-morale)*.75+(tech>68?7:0);
  scores.MARKETING+=(62-brand)*.95+(growth<2?10:0)+(archetype==='GROWTH'?17:0);
  scores.PRICE_WAR+=(margin>8&&growth<1?17:0)+(archetype==='AGGRESSIVE'?23:0);
  scores.COSTCUT+=(8-margin)*3.1+(cash/value<.025?14:0)+(archetype==='OPERATOR'?18:0);
  scores.REPAY+=Math.max(0,debtRatio-14)*1.8+(archetype==='CONSERVATIVE'?13:0);
  scores.M_AND_A+=(value>=5000000000&&margin>6?17:0)+(cash/value>.06?10:0)+(archetype==='AGGRESSIVE'?18:0);
  scores.GLOBAL+=(value>=3500000000&&Number(c.global_share||0)<8?18:0)+(archetype==='GROWTH'?18:0);
  scores.CASH_RESERVE+=(cash/value<.018?38:0)+(margin<0?16:0)+(archetype==='CONSERVATIVE'?14:0);
  const keys=Object.keys(scores);
  for(const k of keys)scores[k]+=companyDeterministicNoise(Number(c.id||1)+period*13,BOT_STRATEGY_MODEL_VERSION,keys.indexOf(k)+101)*8;
  const action=keys.sort((a,b)=>scores[b]-scores[a])[0];
  const intensity=Math.max(.55,Math.min(1.35,.75+Math.abs(companyDeterministicNoise(Number(c.id||1),period+BOT_STRATEGY_MODEL_VERSION,131))*.6));
  return {period,cycle:period*12+1,action,label:BOT_STRATEGY_LABELS[action]||action,archetype,intensity,score:Math.round(scores[action])};
}
function applyBotBusinessStrategies(data=state.company){
  const bots=(data?.companies||[]).filter(c=>c&&c.status!=='INACTIVE'&&(c.is_bot||String(c.operator_type||'').toUpperCase()==='BOT'));
  const effects={
    RND:{rev:.010,margin:-.007,value:.018,technology:3.2},QUALITY:{rev:.012,margin:-.004,value:.012,product_quality:4.0},CAPEX:{rev:.024,margin:-.010,value:.017,operations:3.5},
    HIRING:{rev:.016,margin:-.011,value:.010,employee_morale:2.5},MARKETING:{rev:.030,margin:-.008,value:.015,brand:3.5},PRICE_WAR:{rev:.045,margin:-.030,value:-.006,brand:-1.2},
    COSTCUT:{rev:-.010,margin:.026,value:.012,employee_morale:-3.5},REPAY:{rev:0,margin:.004,value:.010},M_AND_A:{rev:.012,margin:-.009,value:.026},GLOBAL:{rev:.033,margin:-.016,value:.021},CASH_RESERVE:{rev:-.008,margin:.006,value:.006}
  };
  for(const c of bots){
    if(c._bot_strategy_raw_revenue==null)c._bot_strategy_raw_revenue=Math.max(1,Number(c.revenue||1));
    if(c._bot_strategy_raw_profit==null)c._bot_strategy_raw_profit=Number(c.profit||0);
    if(c._bot_strategy_raw_valuation==null)c._bot_strategy_raw_valuation=Math.max(1,Number(c.valuation||1));
    const d=botStrategyDecision(c,data),e=effects[d.action]||{},m=Number(d.intensity||1);
    const rawRev=Math.max(1,Number(c._bot_strategy_raw_revenue)),rawProfit=Number(c._bot_strategy_raw_profit),rawValue=Math.max(1,Number(c._bot_strategy_raw_valuation));
    c.revenue=Math.max(1,Math.round(rawRev*(1+Number(e.rev||0)*m)));
    c.profit=Math.round(rawProfit+rawRev*Number(e.margin||0)*m);
    c.valuation=Math.max(100000000,Math.round(rawValue*(1+Number(e.value||0)*m)/1000000)*1000000);
    for(const key of ['technology','product_quality','operations','employee_morale','brand'])if(Number.isFinite(Number(e[key])))c[key]=Math.max(0,Math.min(100,Number(c[key]||50)+Number(e[key])*m));
    const shares=Math.max(1,Number(c.shares_outstanding||1000000));c.share_price=Math.max(1,Math.round(c.valuation/shares));
    c._bot_strategy=d;
  }
  data.bot_strategies=bots.map(c=>({company_id:Number(c.id||0),name:c.name,...(c._bot_strategy||{})}));
  return data;
}
function botStrategyLabel(c={}){return c?._bot_strategy?.label||BOT_STRATEGY_LABELS[botStrategyDecision(c,state.company).action]||'균형 경영'}

const COMPANY_SHARED_MARKET_MODEL_VERSION=659;
function companySharedValuationFactor(c={}){
  const tech=Number(c.technology||50),brand=Number(c.brand||50),ops=Number(c.operations||50),quality=Number(c.product_quality||50),sent=Number(c.investor_sentiment||50);
  const qualityScore=Math.max(20,Math.min(95,(tech*.25+brand*.22+ops*.22+quality*.21+sent*.10)));
  const rev=Math.max(1,Number(c.revenue||1)),profit=Number(c.profit||0),margin=Math.max(-.20,Math.min(.35,profit/rev));
  const style=String(c.ai_style||'').toUpperCase();
  const styleAdj=style==='GROWTH'?.055:style==='AGGRESSIVE'?.04:style==='TECH'?.035:style==='DEFENSIVE'?.015:style==='VALUE'?-.015:0;
  const idNoise=companyDeterministicNoise(Number(c.id||1),COMPANY_SHARED_MARKET_MODEL_VERSION,43)*.075;
  return Math.max(.72,Math.min(1.38,.79+qualityScore/100*.38+margin*.42+styleAdj+idNoise));
}
function companyValuationClusterKey(v=0){const n=Math.max(1,Number(v)||1);const step=Math.max(100000000,Math.pow(10,Math.floor(Math.log10(n))-2));return Math.round(n/step)*step}
function applySharedCompanyMarketDifferentiation(data=state.company){
  const rows=(data?.companies||[]).filter(c=>c&&c.status!=='INACTIVE');
  const bots=rows.filter(c=>c.is_bot||String(c.operator_type||'').toUpperCase()==='BOT');
  if(bots.length<3)return data;
  const groups=new Map();
  for(const c of bots){const raw=Math.max(1,Number(c._raw_server_valuation??c.valuation)||1);const k=companyValuationClusterKey(raw),arr=groups.get(k)||[];arr.push(c);groups.set(k,arr)}
  const rawVals=bots.map(c=>Math.max(1,Number(c._raw_server_valuation??c.valuation)||1));
  const marketFlat=(Math.max(...rawVals)-Math.min(...rawVals))/Math.max(1,rawVals.reduce((a,b)=>a+b,0)/rawVals.length)<.035;
  for(const c of bots){
    const raw=Math.max(1,Number(c._raw_server_valuation??c.valuation)||1),group=groups.get(companyValuationClusterKey(raw))||[];
    if(!marketFlat&&group.length<3)continue;
    if(c._raw_server_valuation==null)c._raw_server_valuation=raw;
    if(c._raw_server_share_price==null)c._raw_server_share_price=Math.max(1,Number(c.share_price||raw/Math.max(1,Number(c.shares_outstanding||1000000))));
    const ordered=[...group].sort((a,b)=>Number(a.id||0)-Number(b.id||0)),pos=Math.max(0,ordered.findIndex(x=>Number(x.id)===Number(c.id)));
    const ordinalSpread=ordered.length>1?((pos/(ordered.length-1))-.5)*.34:0;
    const factor=Math.max(.66,Math.min(1.46,companySharedValuationFactor(c)*(1+ordinalSpread))),shares=Math.max(1,Number(c.shares_outstanding||1000000));
    const adjusted=Math.max(100000000,Math.round(raw*factor/1000000)*1000000);
    c.valuation=adjusted;c.share_price=Math.max(1,Math.round(adjusted/shares));c._shared_market_factor=factor;c._shared_market_diversified=true;
  }
  return data;
}


// V6.6.0: shared corporate-war layer. BOT firms fight each other in the same world
// instead of treating the player as the center of every conflict. The model is
// deterministic from server cycle + company ids, so every user sees the same feed.
const CORPORATE_WAR_MODEL_VERSION=660;
function corporateWarUnit(a=1,b=1,salt=0){return (companyDeterministicNoise(Number(a||1)+CORPORATE_WAR_MODEL_VERSION,Number(b||1)+salt*31.7,salt+71)+1)/2}
function corporateWarBots(data=state.company){return (data?.companies||[]).filter(c=>c&&c.status!=='INACTIVE'&&(c.is_bot||String(c.operator_type||'').toUpperCase()==='BOT')).sort((a,b)=>Number(a.id||0)-Number(b.id||0))}
function corporateWarReason(a,b){
  if(!a||!b)return '시장 경쟁';
  if(String(a.sector||'')===String(b.sector||''))return `${a.sector||'동종업계'} 주도권 경쟁`;
  const av=Math.max(1,Number(a.valuation||1)),bv=Math.max(1,Number(b.valuation||1)),ratio=av/bv;
  if(ratio>1.8)return '저평가 경쟁사 인수 기회';
  if(ratio<.55)return '대형 경쟁사 견제';
  return '사업영역·자본시장 경쟁';
}
function buildSharedCorporateWar(data=state.company){
  const bots=corporateWarBots(data),cycle=Math.max(1,Number(data?.world?.cycle_no||data?.world?.cycle||1)||1);
  if(bots.length<2){data.corporate_war={cycle,events:[],stakes:[],alliances:[],leaders:[]};return data.corporate_war;}
  const start=Math.max(1,cycle-17),stakes=new Map(),alliances=new Map(),momentum=new Map(),events=[];
  const pushMomentum=(id,v)=>momentum.set(Number(id),Math.max(-.09,Math.min(.09,Number(momentum.get(Number(id))||0)+v)));
  const addEvent=(cy,slot,type,actor,target,title,body,impact='',details={})=>events.push({
    id:`cw-${cy}-${slot}-${type}-${actor?.id||0}-${target?.id||0}`,cycle:cy,type,
    actor_id:Number(actor?.id||0),actor_name:actor?.name||'BOT',actor_valuation:Number(actor?.valuation||0),
    target_id:Number(target?.id||0),target_name:target?.name||'BOT',target_valuation:Number(target?.valuation||0),
    title,body,impact,...details
  });
  for(let cy=start;cy<=cycle;cy++){
    const eventCount=2+(corporateWarUnit(cy,bots.length,1)>.58?1:0);
    for(let slot=0;slot<eventCount;slot++){
      const ai=Math.floor(corporateWarUnit(cy,slot+13,2)*bots.length)%bots.length;
      let ti=Math.floor(corporateWarUnit(cy,slot+47,3)*bots.length)%bots.length;
      if(ti===ai)ti=(ti+1+slot)%bots.length;
      const a=bots[ai],b=bots[ti];if(!a||!b||Number(a.id)===Number(b.id))continue;
      const av=Math.max(1,Number(a.valuation||1)),bv=Math.max(1,Number(b.valuation||1)),strength=Math.max(.45,Math.min(2.4,Math.sqrt(av/bv)));
      const pairKey=`${Number(a.id)}>${Number(b.id)}`,curStake=Number(stakes.get(pairKey)||0);let roll=corporateWarUnit(Number(a.id)+cy,Number(b.id)+slot,4);const strategy=String(a?._bot_strategy?.action||'');if(strategy==='M_AND_A')roll=Math.min(roll,.37);else if(strategy==='HIRING'||strategy==='RND')roll=.43+(roll*.14);else if(strategy==='MARKETING'||strategy==='PRICE_WAR')roll=.61+(roll*.13);else if(strategy==='GLOBAL')roll=.77+(roll*.10);const reason=corporateWarReason(a,b);
      if(curStake>=12&&roll<.22){
        const cut=Math.min(curStake,.9+corporateWarUnit(cy,slot+81,5)*4.6),next=Math.max(0,curStake-cut),defenseSpend=Math.max(10000000,Math.round(bv*(cut/100)*(.72+corporateWarUnit(cy,slot+101,11)*.35)));
        stakes.set(pairKey,next);pushMomentum(b,.004);pushMomentum(a,-.002);
        addEvent(cy,slot,'DEFENSE',b,a,`${b.name}, ${a.name} 지분공세 방어`,`${b.name} 경영진이 자사주·우호지분 방어로 ${a.name}의 영향력을 낮췄습니다.`,`${cut.toFixed(2)}%p 방어`,{reason,before_stake:curStake,after_stake:next,delta_stake:-cut,deal_value:defenseSpend,actor_momentum:.004,target_momentum:-.002});
      }else if(roll<.42){
        const add=Math.max(.7,Math.min(7.5,(1.3+corporateWarUnit(cy,slot+23,6)*4.3)*strength)),next=Math.min(58,curStake+add),dealValue=Math.max(10000000,Math.round(bv*(add/100)*(1.01+corporateWarUnit(cy,slot+103,12)*.05)));
        stakes.set(pairKey,next);pushMomentum(a,.003);pushMomentum(b,-.003);
        const takeover=next>=50;
        addEvent(cy,slot,takeover?'CONTROL':'STAKE',a,b,takeover?`${a.name}, ${b.name} 경영권 확보`:`${a.name}, ${b.name} 지분 ${add.toFixed(2)}%p 추가 매집`,takeover?`${reason}. 누적 영향력이 과반을 넘어 BOT 기업 간 인수전에서 경영권을 확보했습니다.`:`${reason}을 이유로 ${a.name}이 ${b.name} 지분을 확대했습니다.`,takeover?'경영권 이동':`누적 ${next.toFixed(2)}%`,{reason,before_stake:curStake,after_stake:next,delta_stake:add,deal_value:dealValue,actor_momentum:.003,target_momentum:-.003});
        if(takeover){pushMomentum(a,.015);pushMomentum(b,-.018)}
      }else if(roll<.60){
        const score=Math.round(70+corporateWarUnit(cy,slot+31,7)*30),retention=Math.round(45+corporateWarUnit(cy,slot+133,13)*45);pushMomentum(a,.0035);pushMomentum(b,-.0045);
        addEvent(cy,slot,'POACH',a,b,`${a.name}, ${b.name} 핵심인재 스카우트`,`${a.name}이 보상과 성장기회를 제시해 ${b.name}의 상위권 인재 영입전에 들어갔습니다.`,`협상력 ${score}/100`,{reason:'핵심인재 확보 경쟁',negotiation_score:score,retention_score:retention,actor_momentum:.0035,target_momentum:-.0045});
      }else if(roll<.76){
        const neg=corporateWarUnit(cy,slot+44,8)>.45,actorMove=neg?.0025:.001,targetMove=neg?-.004:.0015;pushMomentum(a,actorMove);pushMomentum(b,targetMove);
        addEvent(cy,slot,'MEDIA',a,b,neg?`${a.name}, ${b.name} 겨냥 언론전`:`${a.name}·${b.name}, 공동시장 메시지`,neg?`${a.name}이 ${b.name}의 실적·전략을 겨냥한 공세적 IR/언론전을 벌였습니다.`:`두 회사가 시장 확대에 이해관계를 맞추며 우호적 메시지를 냈습니다.`,neg?'평판 압박':'투자심리 개선',{reason:neg?'실적·전략 견제':'시장 확대 공조',actor_momentum:actorMove,target_momentum:targetMove});
      }else if(roll<.89){
        const key=[Number(a.id),Number(b.id)].sort((x,y)=>x-y).join(':'),allianceScore=Math.round(68+corporateWarUnit(cy,slot+155,14)*28);alliances.set(key,{a_id:Number(a.id),a_name:a.name,b_id:Number(b.id),b_name:b.name,cycle:cy});pushMomentum(a,.002);pushMomentum(b,.002);
        addEvent(cy,slot,'ALLIANCE',a,b,`${a.name}·${b.name} 전략적 제휴`,`${a.name}과 ${b.name}이 공급망·공동투자 또는 해외시장 협력을 위한 전략적 제휴를 체결했습니다.`,`협력지수 ${allianceScore}/100`,{reason:'공급망·공동투자·해외시장 협력',alliance_score:allianceScore,actor_momentum:.002,target_momentum:.002});
      }else{
        const premium=8+Math.round(corporateWarUnit(cy,slot+55,9)*17),add=Math.max(2,Math.min(12,(3+corporateWarUnit(cy,slot+91,10)*7)*strength)),next=Math.min(58,curStake+add),dealValue=Math.max(10000000,Math.round(bv*(add/100)*(1+premium/100)));
        stakes.set(pairKey,next);pushMomentum(a,.006);pushMomentum(b,-.006);
        addEvent(cy,slot,next>=50?'CONTROL':'TENDER',a,b,next>=50?`${a.name}, 공개매수 끝에 ${b.name} 인수`:`${a.name}, ${b.name} 공개매수 선언`,`${reason}. 시장가 대비 ${premium}% 프리미엄을 제시하며 BOT끼리 공개매수전을 벌였습니다.`,next>=50?'인수 성공':`프리미엄 ${premium}%`,{reason,before_stake:curStake,after_stake:next,delta_stake:add,deal_value:dealValue,premium,actor_momentum:.006,target_momentum:-.006});
      }
    }
  }
  // Shared market consequences: recent wins/losses modestly move BOT valuations.
  for(const c of bots){
    const m=Math.max(-.06,Math.min(.06,Number(momentum.get(Number(c.id))||0)));
    c._corporate_war_momentum=m;
    if(Math.abs(m)>.00001){
      const before=Math.max(1,Number(c.valuation||1)),factor=1+m*.55,shares=Math.max(1,Number(c.shares_outstanding||1000000));
      c.valuation=Math.max(100000000,Math.round(before*factor/1000000)*1000000);c.share_price=Math.max(1,Math.round(c.valuation/shares));
      c._shared_market_factor=Math.max(.45,Math.min(1.8,Number(c._shared_market_factor||1)*factor));c._shared_market_diversified=true;
    }
  }
  const stakeRows=[...stakes.entries()].map(([key,stake])=>{const [aid,bid]=key.split('>').map(Number),a=bots.find(x=>Number(x.id)===aid),b=bots.find(x=>Number(x.id)===bid);return {attacker_id:aid,attacker_name:a?.name||'BOT',target_id:bid,target_name:b?.name||'BOT',stake:Number(stake||0)}}).filter(x=>x.stake>=3).sort((a,b)=>b.stake-a.stake);
  const leaders=bots.map(c=>({id:Number(c.id),name:c.name,momentum:Number(c._corporate_war_momentum||0),valuation:Number(c.valuation||0)})).sort((a,b)=>b.momentum-a.momentum||b.valuation-a.valuation).slice(0,5);
  data.corporate_war={cycle,events:events.sort((a,b)=>b.cycle-a.cycle||String(b.id).localeCompare(String(a.id))).slice(0,36),stakes:stakeRows.slice(0,18),alliances:[...alliances.values()].sort((a,b)=>b.cycle-a.cycle).slice(0,10),leaders};
  return data.corporate_war;
}
function corporateWarTypeLabel(type){return ({STAKE:'지분전',TENDER:'공개매수',CONTROL:'인수성공',DEFENSE:'방어',POACH:'인재전',MEDIA:'언론전',ALLIANCE:'동맹'})[String(type||'')]||'기업전쟁'}
function corporateWarTypeClass(type){return ['CONTROL','TENDER','STAKE'].includes(String(type||''))?'hostile':String(type)==='DEFENSE'?'defense':String(type)==='POACH'?'people':String(type)==='ALLIANCE'?'alliance':String(type)==='MEDIA'?'media':''}
function corporateWarMetricRows(e){
  const type=String(e?.type||''),rows=[];
  if(['STAKE','TENDER','CONTROL'].includes(type)){
    rows.push(['이번 확보',`${Number(e.delta_stake||0).toFixed(2)}%p`]);
    rows.push(['누적 지분',`${Number(e.after_stake||0).toFixed(2)}%`]);
    if(Number(e.deal_value)>0)rows.push(['투입액',formatKrwSmart(e.deal_value)]);
    if(type==='TENDER'&&Number.isFinite(Number(e.premium)))rows.push(['프리미엄',`${Number(e.premium).toFixed(0)}%`]);
  }else if(type==='DEFENSE'){
    rows.push(['방어 전',`${Number(e.before_stake||0).toFixed(2)}%`]);
    rows.push(['방어 후',`${Number(e.after_stake||0).toFixed(2)}%`]);
    rows.push(['감소폭',`${Math.abs(Number(e.delta_stake||0)).toFixed(2)}%p`]);
    if(Number(e.deal_value)>0)rows.push(['방어비',formatKrwSmart(e.deal_value)]);
  }else if(type==='POACH'){
    rows.push(['영입 협상력',`${Number(e.negotiation_score||0).toFixed(0)}/100`]);
    rows.push(['잔류 방어력',`${Number(e.retention_score||0).toFixed(0)}/100`]);
    rows.push(['공격사 기세',`${Number(e.actor_momentum||0)>=0?'+':''}${(Number(e.actor_momentum||0)*100).toFixed(2)}%`]);
    rows.push(['대상사 기세',`${Number(e.target_momentum||0)>=0?'+':''}${(Number(e.target_momentum||0)*100).toFixed(2)}%`]);
  }else if(type==='MEDIA'){
    rows.push(['공격사 기세',`${Number(e.actor_momentum||0)>=0?'+':''}${(Number(e.actor_momentum||0)*100).toFixed(2)}%`]);
    rows.push(['대상사 기세',`${Number(e.target_momentum||0)>=0?'+':''}${(Number(e.target_momentum||0)*100).toFixed(2)}%`]);
    rows.push(['공격사 가치',formatKrwSmart(e.actor_valuation||0)]);
    rows.push(['대상사 가치',formatKrwSmart(e.target_valuation||0)]);
  }else if(type==='ALLIANCE'){
    rows.push(['협력지수',`${Number(e.alliance_score||0).toFixed(0)}/100`]);
    rows.push(['A사 가치',formatKrwSmart(e.actor_valuation||0)]);
    rows.push(['B사 가치',formatKrwSmart(e.target_valuation||0)]);
    rows.push(['양측 기세','+0.20%']);
  }
  if(rows.length<4){
    if(!rows.some(x=>x[0].includes('공격사 가치')||x[0]==='A사 가치'))rows.push(['공격사 가치',formatKrwSmart(e.actor_valuation||0)]);
    if(!rows.some(x=>x[0].includes('대상사 가치')||x[0]==='B사 가치'))rows.push(['대상사 가치',formatKrwSmart(e.target_valuation||0)]);
  }
  return rows.slice(0,4);
}
function corporateWarCompanyLabels(e){
  const type=String(e?.type||'');
  if(type==='DEFENSE')return ['방어사','공격사'];
  if(type==='ALLIANCE')return ['회사 A','회사 B'];
  if(type==='MEDIA'&&Number(e?.target_momentum||0)>=0)return ['회사 A','회사 B'];
  return ['공격사','대상사'];
}
function renderCorporateWarLive(my,mode='compact'){
  const war=state.company?.corporate_war||buildSharedCorporateWar(state.company),events=war?.events||[],stakes=war?.stakes||[],leaders=war?.leaders||[];
  if(!events.length)return '';
  const show=events.slice(0,mode==='full'?16:8),hot=stakes[0];
  const cards=show.map(e=>{
    const metrics=corporateWarMetricRows(e),labels=corporateWarCompanyLabels(e);
    return `<article class="${corporateWarTypeClass(e.type)}"><div class="war-event-meta"><span>${corporateWarTypeLabel(e.type)}</span><small>CYCLE ${e.cycle}</small></div><div class="war-company-route"><button type="button" data-war-company-analyze="${Number(e.actor_id||0)}" title="${escapeHtml(e.actor_name)} 분석"><small>${labels[0]}</small><b>${escapeHtml(e.actor_name)}</b></button><i>→</i><button type="button" data-war-company-analyze="${Number(e.target_id||0)}" title="${escapeHtml(e.target_name)} 분석"><small>${labels[1]}</small><b>${escapeHtml(e.target_name)}</b></button></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.body)}</p><div class="war-event-numbers">${metrics.map(([label,value])=>`<span><small>${escapeHtml(label)}</small><b>${escapeHtml(String(value))}</b></span>`).join('')}</div><div class="war-event-foot"><span>${escapeHtml(e.reason||'기업 간 이해관계 경쟁')}</span><div><button type="button" data-war-company-analyze="${Number(e.actor_id||0)}">${escapeHtml(e.actor_name)} 분석</button><button type="button" class="primary" data-war-company-analyze="${Number(e.target_id||0)}">${escapeHtml(e.target_name)} 분석·참전</button></div></div></article>`;
  }).join('');
  return `<section class="corporate-war-live ${mode==='full'?'full':''}"><div class="company-section-head"><div><small>BOT CORPORATE WAR · SHARED WORLD</small><h2>기업전쟁 LIVE</h2></div><span>BOT 기업끼리 실제로 지분·M&A·인재·언론전을 진행합니다. 회사명이나 분석 버튼을 누르면 해당 기업의 상세 화면으로 바로 이동합니다.</span></div><div class="corporate-war-summary"><article><small>현재 BOT간 충돌</small><b>${events.filter(e=>e.cycle>=Number(war.cycle||0)-2).length}건</b><span>최근 3개 경영주기</span></article><article><small>가장 뜨거운 지분전</small><b>${hot?`${Number(hot.stake||0).toFixed(2)}%`:'—'}</b><span>${hot?`${escapeHtml(hot.attacker_name)} → ${escapeHtml(hot.target_name)}`:'진행 중인 대형 지분전 없음'}</span></article><article><small>내 회사 상태</small><b>${companyStakeAgainstMe()>0?`${companyStakeAgainstMe().toFixed(2)}% 위험`:'비표적'}</b><span>${companyStakeAgainstMe()>0?'실제 공격 근거가 있는 경우만 계산':'현재 BOT 전쟁의 특별 표적이 아닙니다.'}</span></article></div>${leaders.length?`<div class="corporate-war-leaders"><small>최근 기세</small>${leaders.slice(0,4).map((x,i)=>`<span><b>#${i+1} ${escapeHtml(x.name)}</b><em class="${x.momentum>=0?'up':'down'}">${x.momentum>=0?'+':''}${(x.momentum*100).toFixed(2)}%</em><small>${formatKrwSmart(x.valuation)}</small></span>`).join('')}</div>`:''}<div class="corporate-war-feed">${cards}</div>${mode==='compact'?`<div class="corporate-war-more"><button type="button" data-company-route="competition:war">기업전쟁 전체 보기</button></div>`:''}</section>`;
}
function alignCompanyProfileToSharedMarket(profile){
  const pc=profile?.company;if(!pc)return profile;
  const shared=(state.company?.companies||[]).find(c=>Number(c.id)===Number(pc.id));
  if(shared){
    pc._raw_server_valuation=Number(pc.valuation||0);pc._raw_server_share_price=Number(pc.share_price||0);
    pc.valuation=Number(shared.valuation||pc.valuation||0);pc.share_price=Number(shared.share_price||pc.share_price||0);
    pc._shared_market_factor=shared._shared_market_factor;pc._shared_market_diversified=shared._shared_market_diversified;pc._bot_strategy=shared._bot_strategy||null;
  }
  return profile;
}
function companyMarketAdjustedCandles(rawRows,company){
  const src=[...(rawRows||[])];
  const profile=companyMarketVolatilityProfile(company);
  const companyId=Number(company?.id||state.companyAnalysisId||1);
  const sharedFactor=company?._shared_market_diversified?Math.max(.5,Math.min(1.6,Number(company._shared_market_factor||1))):1;
  const base=src.map((r,i,arr)=>{
    const prev=(i?Number(arr[i-1].close_price||arr[i-1].share_price||0):Number(r.open_price||r.share_price||r.close_price||0))*sharedFactor;
    let c=Number(r.close_price||r.share_price||0)*sharedFactor||prev,o=Number(r.open_price||0)*sharedFactor||prev||c,h=Number(r.high_price||0)*sharedFactor||Math.max(o,c),l=Number(r.low_price||0)*sharedFactor||Math.min(o,c);
    if(!(c>0))c=prev||1;if(!(o>0))o=c;h=Math.max(Number(h)||c,o,c);l=Math.min(Number(l)||c,o,c);
    return {...r,_rawClose:c,_rawOpen:o,_rawHigh:h,_rawLow:l};
  }).filter(r=>r._rawClose>0);
  if(base.length<2)return base.map(r=>({...r,_o:r._rawOpen,_c:r._rawClose,_h:r._rawHigh,_l:r._rawLow,_v:Math.max(1,Number(r.volume)||1),_marketAdjusted:false}));
  const livePrice=Math.max(0,Number(company?.share_price||0));
  if(livePrice>0){
    const lastIndex=base.length-1,oldLast=base[lastIndex]._rawClose||livePrice;
    if(oldLast>0&&Math.abs(livePrice-oldLast)/oldLast<.20)base[lastIndex]._rawClose=livePrice;
  }
  const rawMin=Math.min(...base.map(r=>r._rawLow)),rawMax=Math.max(...base.map(r=>r._rawHigh)),rawMid=(rawMin+rawMax)/2||1;
  const rawRange=(rawMax-rawMin)/rawMid;
  const fill=Math.max(0,Math.min(1,(profile.targetRange-rawRange)/Math.max(.012,profile.targetRange*.78)));
  const amp=profile.targetRange*.34*fill;
  const offsets=base.map((r,i)=>{
    const cycle=Number(r.cycle_no||i+1);
    const phase=(companyId%37)*.19+COMPANY_SHARED_MARKET_MODEL_VERSION*.0001;
    const wave1=Math.sin(cycle*.23+phase)*amp*.58;
    const wave2=Math.sin(cycle*.071+phase*1.7)*amp*.36;
    const noise=companyDeterministicNoise(companyId,cycle,3)*amp*.26;
    const sentiment=(Number(company?.investor_sentiment||50)-50)/50*amp*.12;
    return wave1+wave2+noise+sentiment;
  });
  const anchor=offsets[offsets.length-1]||0;
  const adjusted=[];
  for(let i=0;i<base.length;i++){
    const r=base[i],cycle=Number(r.cycle_no||i+1);
    const c=Math.max(.01,r._rawClose*(1+(offsets[i]-anchor)));
    const prev=i?adjusted[i-1]._c:Math.max(.01,r._rawOpen*(1+(offsets[i]-anchor)*.72));
    const o=Math.max(.01,prev);
    const move=Math.abs(c-o)/Math.max(1,(c+o)/2);
    const wickBase=Math.max(profile.wick*.55,Math.min(profile.wick*1.9,profile.wick+move*.22));
    const upW=wickBase*(.55+.45*Math.abs(companyDeterministicNoise(companyId,cycle,7)));
    const dnW=wickBase*(.55+.45*Math.abs(companyDeterministicNoise(companyId,cycle,11)));
    const h=Math.max(o,c)*(1+upW),l=Math.max(.01,Math.min(o,c)*(1-dnW));
    const rawVol=Math.max(0,Number(r.volume)||0);
    const activity=1+Math.min(3,move/Math.max(.001,profile.wick))*1.15;
    const generated=Math.round((420+Math.abs(companyDeterministicNoise(companyId,cycle,19))*1180)*activity*(1+Math.min(4,Number(company?.valuation||0)/1e13)*.12));
    const v=Math.max(1,rawVol>0?Math.round(rawVol*(.72+activity*.28)):generated);
    adjusted.push({...r,_o:o,_c:c,_h:h,_l:l,_v:v,_marketAdjusted:fill>.05});
  }
  if(livePrice>0&&adjusted.length){
    const last=adjusted[adjusted.length-1],prev=adjusted.length>1?adjusted[adjusted.length-2]._c:last._o;
    last._c=livePrice;last._o=prev;last._h=Math.max(last._h,last._o,last._c);last._l=Math.min(last._l,last._o,last._c);
  }
  return adjusted;
}

function updateCompanyVisualQuotes(){
  if(state.tab!=='company')return;
  const now=Date.now();
  document.querySelectorAll('[data-company-live-price]').forEach(el=>{
    const id=Number(el.dataset.companyLivePrice)||0;
    let c=(state.company?.companies||[]).find(x=>Number(x.id)===id);
    if(!c&&Number(state.company?.my_company?.id)===id)c=state.company.my_company;
    if(!c&&Number(state.companyAnalysis?.company?.id)===id)c=state.companyAnalysis.company;
    if(c)el.textContent=companySharePriceText(c);
  });
  if(document.getElementById('companyTargetChart'))drawCompanyTargetChart();
}
function scheduleCompanyVisualTicker(){
  clearInterval(companyVisualTimer);companyVisualTimer=null;
  if(state.tab!=='company')return;
  updateCompanyVisualQuotes();
  companyVisualTimer=setInterval(updateCompanyVisualQuotes,COMPANY_VISUAL_TICK_MS);
}
function escapeHtml(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function markUiInteraction(){uiLastInteractionAt=Date.now()}
function uiIsBusy(){
  const a=document.activeElement,tag=String(a?.tagName||'').toUpperCase();
  if(['INPUT','TEXTAREA','SELECT'].includes(tag))return true;
  return Date.now()-uiLastInteractionAt<1400;
}
function captureUiState(){
  const active=document.activeElement;
  const fields={};
  document.querySelectorAll('input[id],textarea[id],select[id]').forEach(el=>{fields[el.id]={value:el.value,checked:!!el.checked}});
  return {x:scrollX,y:scrollY,activeId:active?.id||'',selectionStart:typeof active?.selectionStart==='number'?active.selectionStart:null,selectionEnd:typeof active?.selectionEnd==='number'?active.selectionEnd:null,fields,browserScroll:document.querySelector('.clean-company-browser')?.scrollTop||0,details:[...document.querySelectorAll('details')].map((d,i)=>d.open?i:-1).filter(i=>i>=0)};
}
function restoreUiState(ctx){
  if(!ctx)return;
  Object.entries(ctx.fields||{}).forEach(([id,v])=>{const el=document.getElementById(id);if(!el)return;el.value=v.value;if('checked' in el)el.checked=v.checked});
  document.querySelectorAll('details').forEach((d,i)=>{d.open=(ctx.details||[]).includes(i)});
  const browser=document.querySelector('.clean-company-browser');if(browser)browser.scrollTop=ctx.browserScroll||0;
  requestAnimationFrame(()=>{
    scrollTo(ctx.x||0,ctx.y||0);
    const el=ctx.activeId?document.getElementById(ctx.activeId):null;
    if(el){try{el.focus({preventScroll:true});if(ctx.selectionStart!=null&&el.setSelectionRange)el.setSelectionRange(ctx.selectionStart,ctx.selectionEnd??ctx.selectionStart)}catch(_e){}}
  });
}
function formatKrwSmart(v){
  v=Math.max(0,Number(v)||0);
  const jo=Math.floor(v/1e12),eok=Math.floor((v%1e12)/1e8);
  if(jo>0)return eok?`${nf.format(jo)}조 ${nf.format(eok)}억 원`:`${nf.format(jo)}조 원`;
  if(v>=1e8)return `${(v/1e8).toFixed(v>=1e10?1:2)}억 원`;
  if(v>=1e4)return `${(v/1e4).toFixed(1)}만 원`;
  return `${nf.format(Math.round(v))}원`;
}
function parseCompanyMoney(raw,fallback=0){
  if(raw==null)return Math.max(0,Number(fallback)||0);
  const src=String(raw).trim().replace(/[,\s원₩]/g,'');
  if(!src)return Math.max(0,Number(fallback)||0);
  if(/^\d+(?:\.\d+)?$/.test(src))return Math.max(0,Math.floor(Number(src)||0));
  const units={조:1e12,억:1e8,만:1e4};
  let total=0,matched=false;
  for(const m of src.matchAll(/(\d+(?:\.\d+)?)(조|억|만)/g)){
    total+=Number(m[1])*units[m[2]];matched=true;
  }
  return matched?Math.max(0,Math.floor(total)):Math.max(0,Number(fallback)||0);
}
function companyMoneyInput(id,label,value,placeholder='예: 5억, 1조 5000억'){
  return `<label class="money-input-shell human-money-shell"><span>${escapeHtml(label)}</span><input id="${id}" data-company-money-input type="text" inputmode="text" autocomplete="off" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}"><small data-company-money-preview="${id}"></small></label>`;
}
function bindCompanyMoneyInputs(){
  document.querySelectorAll('[data-company-money-input]').forEach(input=>{
    const paint=()=>{const el=document.querySelector(`[data-company-money-preview="${input.id}"]`);if(!el)return;const amount=parseCompanyMoney(input.value,0);el.textContent=amount>0?`입력 금액 · ${formatKrwSmart(amount)}`:'억·조 단위로 입력할 수 있습니다.';el.classList.toggle('invalid-money',amount<=0)};
    input.oninput=()=>{markUiInteraction();paint()};input.onfocus=markUiInteraction;paint();
  });
}
function companyCurrencyMeta(country){
  const m={
    '미국':{code:'USD',symbol:'$',name:'달러',fx:1330},
    '독일':{code:'EUR',symbol:'€',name:'유로',fx:1560},
    '영국':{code:'GBP',symbol:'£',name:'파운드',fx:1810},
    '일본':{code:'JPY',symbol:'¥',name:'엔',fx:9.1},
    '중국':{code:'CNY',symbol:'CN¥',name:'위안',fx:185}
  };
  return m[country]||{code:'KRW',symbol:'₩',name:'원',fx:1};
}
function koreanUnitNumber(v){
  v=Math.max(0,Number(v)||0);
  const jo=Math.floor(v/1e12),eok=Math.floor((v%1e12)/1e8);
  if(jo>0)return eok?`${nf.format(jo)}조 ${nf.format(eok)}억`:`${nf.format(jo)}조`;
  if(v>=1e8)return `${(v/1e8).toFixed(v>=1e10?1:2)}억`;
  if(v>=1e4)return `${(v/1e4).toFixed(1)}만`;
  return nf.format(Math.round(v));
}
function companyMarketValueText(c){
  const meta=companyCurrencyMeta(c?.home_country),krw=Math.max(0,Number(c?.valuation)||0);
  if(meta.code==='KRW')return `${koreanUnitNumber(krw)}원`;
  return `${koreanUnitNumber(krw/meta.fx)} ${meta.name}`;
}
function companySharePriceText(c){
  const meta=companyCurrencyMeta(c?.home_country),krw=Math.max(0,Number(c?.share_price)||0);
  if(meta.code==='KRW')return `${nf.format(Math.round(krw))}원`;
  const local=krw/meta.fx;
  if(meta.code==='JPY')return `${meta.symbol}${nf.format(Math.round(local))}`;
  return `${meta.symbol}${local>=1000?nf.format(Math.round(local)):local.toFixed(2)}`;
}
function companyMarketValueSubText(c){
  const country=String(c?.home_country||'대한민국');
  const krw=Math.max(0,Number(c?.valuation)||0);
  if(country==='대한민국')return `${escapeHtml(c?.sector||'기업')} · 원화 기준`;
  return `원화 환산 ${compactMoney(krw)}원`;
}
function companyRegionMatch(c,region){
  const country=String(c?.home_country||'대한민국');
  if(region==='국내')return country==='대한민국';
  if(region==='미국')return country==='미국';
  if(region==='중국')return country==='중국';
  if(region==='일본')return country==='일본';
  if(region==='유럽')return ['독일','영국','프랑스','이탈리아','스페인','네덜란드','스위스','스웨덴','노르웨이','덴마크','핀란드','벨기에','오스트리아','아일랜드','유럽'].includes(country);
  return true;
}
function projectEconomics(p){
  const budget=Math.max(0,Number(p?.budget)||0);
  const realized=Math.max(0,Number(p?.realized_return)||0);
  const expected=Math.max(0,Number(p?.expected_return)||0);
  const reference=(String(p?.status||'')==='ACTIVE'&&expected>0)?expected:Math.max(expected,realized);
  const net=realized-budget;
  const expectedNet=reference-budget;
  const roi=budget>0?net/budget*100:0;
  const expectedRoi=budget>0?expectedNet/budget*100:0;
  const directProfit=['RND','QUALITY','CAPEX','HIRING','MARKETING'].includes(String(p?.project_type||'').toUpperCase());
  return {budget,realized,expected,reference,net,expectedNet,roi,expectedRoi,directProfit};
}
function ownerStakeOf(my){const listed=(state.company?.incoming_holdings||[]).reduce((sum,h)=>sum+holdingStakeValue(h),0);const external=Math.max(listed,companyIncomingDirectStake(my),companyStakeAgainstMe());return Math.max(0,100-external)}


async function ensureFreshBuild(){return true}
function dismissNewsFlash(){
  clearTimeout(newsFlashTimer);
  const el=document.getElementById('kxNewsFlash');
  if(!el)return;
  el.classList.remove('show');
  setTimeout(()=>el.remove(),220);
}
function showNewsFlash(n){
  if(!n||!['BREAKING','EXTRA'].includes(n.severity))return;
  dismissNewsFlash();
  const extra=n.severity==='EXTRA';
  const el=document.createElement('aside');
  el.id='kxNewsFlash';
  el.className=`kx-news-flash ${extra?'extra':'breaking'}`;
  el.innerHTML=`<button class="news-flash-close" aria-label="닫기">×</button>
    <div class="news-flash-top"><span>${extra?'호외':'속보'}</span><time>${n.created_at?new Date(n.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'방금'}</time></div>
    <div class="news-flash-source">KX MARKET NEWS · ${escapeHtml(n.ticker||n.sector||'시장')}</div>
    <h2>${escapeHtml(n.headline)}</h2>
    <p>${escapeHtml(n.body)}</p>
    <small>클릭하면 시장 뉴스에서 자세히 확인합니다.</small>`;
  document.body.appendChild(el);
  el.querySelector('.news-flash-close').onclick=e=>{e.stopPropagation();dismissNewsFlash()};
  el.onclick=()=>{dismissNewsFlash();state.tab='news';renderTerminal()};
  requestAnimationFrame(()=>el.classList.add('show'));
  newsFlashTimer=setTimeout(dismissNewsFlash,extra?11000:7500);
}
function showCompanyPressFlash(a){
  if(!a)return;
  dismissNewsFlash();
  const el=document.createElement('aside');el.id='kxNewsFlash';el.className='kx-news-flash breaking company-press-flash';
  const amount=Number(a?.bot_flow||0),when=a?.created_at?new Date(a.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):'방금';
  const sourceCompany=(state.company?.companies||[]).find(c=>Number(c.id)===Number(a?.source_company_id||0));
  const sourceText=sourceCompany&&Number(sourceCompany.id)!==Number(a?.company_id)?` · 견제/의뢰 ${sourceCompany.name}`:'';
  el.innerHTML=`<button class="news-flash-close" aria-label="닫기">×</button>
    <div class="news-flash-top"><span>${a?.news_tone==='CRITICAL'?'경쟁·검증 뉴스':'기업 뉴스'}</span><time>${when}</time></div>
    <div class="news-flash-source">${escapeHtml(a?.outlet_name||'KX BUSINESS NEWS')} · ${escapeHtml(a?.company_name||'기업시장')}${escapeHtml(sourceText)}</div>
    <h2>${escapeHtml(a?.headline||'기업 보도')}</h2>
    <p>${escapeHtml(a?.article_body||'새 기업 뉴스가 시장에 반영되었습니다.')}</p>
    <div class="company-news-flash-impact"><b class="${amount>=0?'up':'down'}">BOT 수급 ${amount>=0?'+':''}${compactMoney(amount)}원</b><span>클릭해서 기업 분석·뉴스 확인</span></div>`;
  document.body.appendChild(el);
  el.querySelector('.news-flash-close').onclick=e=>{e.stopPropagation();dismissNewsFlash()};
  el.onclick=async()=>{
    dismissNewsFlash();state.tab='company';
    const id=Number(a?.company_id||0),myId=Number(state.company?.my_company?.id||0);
    if(id&&id!==myId){state.companySection='competition';state.companyAnalysisId=id;state.companyAnalysis=null;renderTerminal();try{state.companyAnalysis=await companyApi('PROFILE',{p_company_id:id});renderTerminal()}catch(_e){}}
    else{state.companySection='risk';renderTerminal()}
  };
  requestAnimationFrame(()=>el.classList.add('show'));clearTimeout(newsFlashTimer);newsFlashTimer=setTimeout(dismissNewsFlash,9000);
}
function processCompanyPress(rows){
  if(!Array.isArray(rows)||!rows.length)return;
  const ids=rows.map(a=>Number(a.id)||0),maxId=Math.max(...ids,0);
  if(!companyPressBaselineReady){companyPressBaselineReady=true;lastCompanyPressId=maxId;return;}
  const myId=Number(state.company?.my_company?.id||0);
  const unseen=rows.filter(a=>{const fresh=(Number(a.id)||0)>lastCompanyPressId,target=Number(a.company_id||0),source=Number(a.source_company_id||0);return fresh&&(target!==myId||(target===myId&&String(a.news_tone||'').toUpperCase()==='CRITICAL'&&source!==myId));}).sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
  if(unseen.length)showCompanyPressFlash(unseen[unseen.length-1]);
  lastCompanyPressId=Math.max(lastCompanyPressId,maxId);
}
function syncCompanyClockAnchor(world,clock){
  const serverCycle=Math.max(1,Number(world?.cycle_no)||1);
  const serverNow=world?.server_time?Date.parse(world.server_time):Date.now()+companyServerOffsetMs;
  const lastSim=world?.last_sim_at?Date.parse(world.last_sim_at):serverNow;
  const sinceTick=Number.isFinite(serverNow)&&Number.isFinite(lastSim)?Math.max(0,(serverNow-lastSim)/1000):0;
  // One shared management cycle is 12 real seconds = 12 game minutes. 120 cycles = 24 real minutes = 1 game day.
  companyClockInitialized=true;
  companyClockAnchorCycle=serverCycle;
  companyClockAnchorTotalMinutes=Math.max(0,(serverCycle-1)*12);
  companyClockAnchorReal=Date.now()-sinceTick*1000;
}
function liveCompanyClock(now=Date.now()){
  if(!companyClockInitialized)return {cycle:Math.max(1,Number(state.company?.world?.cycle_no)||1),day:Math.max(1,Number(state.clock?.game_day)||1),minute:Math.max(0,Number(state.clock?.game_minute)||0),totalMinutes:0};
  const elapsed=Math.max(0,(now-companyClockAnchorReal)/1000);
  const cycle=companyClockAnchorCycle+Math.floor(elapsed/12);
  const totalMinutes=companyClockAnchorTotalMinutes+Math.floor(elapsed); // 1 real second = 1 game minute -> 24 real minutes per game day
  return {cycle,day:Math.floor(totalMinutes/1440)+1,minute:((totalMinutes%1440)+1440)%1440,totalMinutes};
}
function updateLiveCompanyClock(){
  const c=liveCompanyClock();
  document.querySelectorAll('[data-live-company-cycle]').forEach(el=>el.textContent=`경영주기 #${c.cycle}`);
  document.querySelectorAll('[data-live-game-clock]').forEach(el=>el.textContent=`DAY ${c.day} · ${gameTime(c.minute)}`);
}
function scheduleCompanyClock(){clearInterval(companyClockTimer);updateLiveCompanyClock();companyClockTimer=setInterval(updateLiveCompanyClock,1000);}

function processIncomingNews(rows){
  if(!Array.isArray(rows)||!rows.length)return;
  const ids=rows.map(n=>Number(n.id)||0);
  const maxId=Math.max(...ids,0);
  if(!newsBaselineReady){
    newsBaselineReady=true;
    // Login/reload establishes a baseline. Only news published after this session starts pops live.
    lastSeenNewsId=maxId;
    localStorage.setItem(NEWS_SEEN_KEY,String(lastSeenNewsId));
    return;
  }
  const unseen=rows.filter(n=>(Number(n.id)||0)>lastSeenNewsId&&['BREAKING','EXTRA'].includes(n.severity)).sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
  if(unseen.length)showNewsFlash(unseen[unseen.length-1]);
  lastSeenNewsId=Math.max(lastSeenNewsId,maxId);
  localStorage.setItem(NEWS_SEEN_KEY,String(lastSeenNewsId));
}
function authErrorText(err){
  const p=err?.payload||{};
  const raw=[err?.message,p?.message,p?.msg,p?.error_description,p?.error,p?.error_code,p?.code].filter(Boolean).join(' ').toLowerCase();
  if(raw.includes('email_provider_disabled')||raw.includes('email signups are disabled')||raw.includes('email provider'))return 'Supabase에서 이메일 회원가입이 꺼져 있습니다. Authentication → Providers → Email 설정을 확인해 주세요.';
  if(raw.includes('signup_disabled')||raw.includes('signups not allowed'))return 'Supabase에서 신규 회원가입이 차단되어 있습니다.';
  if(raw.includes('invalid email')||raw.includes('unable to validate email')||raw.includes('email_address_invalid'))return '이메일 주소 형식을 확인해 주세요.';
  if(raw.includes('password')&&(raw.includes('short')||raw.includes('weak')||raw.includes('valid')))return '비밀번호가 보안 조건을 충족하지 않습니다.';
  if(raw.includes('already registered')||raw.includes('user_already_exists')||raw.includes('already been registered'))return '이미 가입된 이메일입니다. 로그인해 주세요.';
  if(err?.status===422)return `회원가입 요청이 거절되었습니다. (${err.message||'HTTP 422'})`;
  return err?.message||'인증 중 오류가 발생했습니다.';
}

function gameTime(m=0){return `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`}
const SESS={PREOPEN:'장전',REGULAR:'정규장',CLOSING:'장마감',AFTERHOURS:'시간외'};
const REGIME={BULL:'강세',NEUTRAL:'중립',BEAR:'약세',STRESS:'불안'};
const NEWS_SEV={NORMAL:'일반',BREAKING:'속보',EXTRA:'호외'};
const ORDER_STATUS={OPEN:'미체결',PARTIAL:'부분체결',FILLED:'체결완료',CANCELED:'취소',REJECTED:'거절'};
const GUIDE_MODE_KEY='kx_guidance_mode_v2';
const BASE_ASSET_PREFIX='kx_baseline_assets_v1';
const GUIDE_MODES={
  BEGINNER:{label:'초보 CEO',short:'초보',desc:'추천 행동·예상 효과·안전 예산을 적극적으로 보여줍니다.'},
  STANDARD:{label:'표준 경영',short:'표준',desc:'핵심 도움말만 남기고 판단은 플레이어가 직접 합니다.'},
  REALISTIC:{label:'극현실',short:'극현실',desc:'추천과 힌트를 최소화하고 실제 경영처럼 숫자와 결과만 보고 판단합니다.'}
};
function guidanceMode(){
  const saved=String(localStorage.getItem(GUIDE_MODE_KEY)||'').toUpperCase();
  return GUIDE_MODES[saved]?saved:'STANDARD';
}
function guidanceInfo(){return GUIDE_MODES[guidanceMode()]||GUIDE_MODES.BEGINNER}
function setGuidanceMode(mode='BEGINNER'){
  const next=GUIDE_MODES[String(mode).toUpperCase()]?String(mode).toUpperCase():'BEGINNER';
  localStorage.setItem(GUIDE_MODE_KEY,next);return next;
}
function scopedKey(prefix){return `${prefix}_${session?.user?.id||'guest'}`}
function baselineAssets(){
  const key=scopedKey(BASE_ASSET_PREFIX),current=Number(totalAssets())||0;
  let base=Number(localStorage.getItem(key)||0);
  if(base<=0&&current>0){base=current;localStorage.setItem(key,String(base))}
  return base||current||1;
}
function performanceSummary(){
  const base=baselineAssets(),now=Number(totalAssets())||0,ret=((now-base)/Math.max(1,base))*100;
  let tier={code:'SEED',label:'시드 투자자',next:'수익률 +3%'};
  if(ret>=30)tier={code:'MASTER',label:'포트폴리오 마스터',next:'집중도와 부채도 함께 관리'};
  else if(ret>=15)tier={code:'STRATEGIST',label:'전략가',next:'수익률 +30%'};
  else if(ret>=7)tier={code:'TRADER',label:'트레이더',next:'수익률 +15%'};
  else if(ret>=3)tier={code:'ANALYST',label:'애널리스트',next:'수익률 +7%'};
  else if(ret>=0)tier={code:'SCOUT',label:'시장 탐색자',next:'수익률 +3%'};
  else tier={code:'RECOVERY',label:'회복 구간',next:'원금 회복'};
  return {base,now,ret,tier};
}
function portfolioRiskSummary(){
  const rows=(state.positions||[]).filter(p=>Number(p.quantity)>0).map(p=>{const st=state.stocks.find(s=>s.ticker===p.ticker);return {p,st,value:Number(p.quantity)*(Number(st?.last_price)||0)}}).filter(x=>x.value>0);
  const invested=rows.reduce((a,x)=>a+x.value,0),largest=rows.reduce((m,x)=>x.value>m.value?x:m,{value:0,st:null});
  const concentration=invested>0?largest.value/invested*100:0;
  const debt=bankDebt(),assets=Math.max(1,Number(totalAssets())||1),debtRatio=debt/assets*100;
  let label='낮음';if(concentration>=70||debtRatio>=35)label='높음';else if(concentration>=45||debtRatio>=15)label='보통';
  return {invested,concentration,debt,debtRatio,label,largestName:largest.st?.name||'-'};
}
function renderMarketCoach(s){
  if(guidanceMode()!=='BEGINNER')return '';
  const regime=state.clock?.market_regime||'NEUTRAL',latest=state.news.find(n=>n.ticker===s.ticker)||state.news[0];
  const copy=regime==='BULL'?'강세장에서도 급등 추격은 가격 위험이 커질 수 있습니다. 호가와 거래량을 같이 확인하세요.':regime==='BEAR'?'약세장에서는 현금 비중과 손실 한도를 먼저 확인하는 연습이 도움이 됩니다.':regime==='STRESS'?'변동성이 큰 구간입니다. 시장가 주문은 예상 체결가와 차이가 커질 수 있습니다.':'중립장입니다. 한 방향을 단정하기보다 뉴스·호가·거래량을 함께 비교해 보세요.';
  return `<div class="market-coach"><div><small>BEGINNER COACH</small><b>${REGIME[regime]||'중립'}장 읽기</b></div><p>${copy}</p>${latest?`<span>최근 뉴스: ${escapeHtml(latest.headline)}</span>`:''}</div>`;
}
const META_KEY='kx_player_meta_v3';
function defaultMeta(){return {orders:0,limitOrders:0,marketOrders:0,filledOrders:0,newsViewed:false,profitableSells:0};}
function loadMeta(){try{return {...defaultMeta(),...(JSON.parse(localStorage.getItem(META_KEY)||'{}')||{})}}catch{return defaultMeta()}}
let playerMeta=loadMeta();
function saveMeta(){localStorage.setItem(META_KEY,JSON.stringify(playerMeta||defaultMeta()))}
const COMPANY_GAME_META_PREFIX='kx_company_gameplay_v1';
function companyGameMetaKey(){return `${COMPANY_GAME_META_PREFIX}_${session?.user?.id||'guest'}_${state.company?.my_company?.id||'new'}`}
function defaultCompanyGameMeta(){return {actions:0,projects:0,media:0,acquisitions:0,expansions:0,hr:0,tax:0,defenses:0,trades:0,decisions:0,lastAction:''}}
function companyGameMeta(){
  try{return {...defaultCompanyGameMeta(),...(JSON.parse(localStorage.getItem(companyGameMetaKey())||'{}')||{})}}catch{return defaultCompanyGameMeta()}
}
function recordCompanyGameAction(kind,detail=''){
  ensureCompanySeasonDay(state.company?.my_company||null);
  const m=companyGameMeta();m.actions=(Number(m.actions)||0)+1;
  if(kind&&Object.prototype.hasOwnProperty.call(m,kind))m[kind]=(Number(m[kind])||0)+1;
  m.lastAction=String(detail||kind||'경영 결정');localStorage.setItem(companyGameMetaKey(),JSON.stringify(m));
  const s=companySeasonMeta();s.streak=(Number(s.streak)||0)+1;s.bestStreak=Math.max(Number(s.bestStreak)||0,s.streak);s.scoreBonus=(Number(s.scoreBonus)||0)+12;
  const highlightMap={projects:['PROJECT','새 프로젝트 가동',`${String(detail||'경영 프로젝트')} 착수`],media:['MEDIA','언론 노출 발생','시장에 새로운 기업 뉴스가 나갔습니다.'],acquisitions:['M&A','지분전 시작','경쟁사 지분을 확보하며 M&A 게임이 시작됐습니다.'],expansions:['GLOBAL','해외시장 진출','새로운 국가에 사업 거점을 만들었습니다.'],defenses:['DEFENSE','경영권 방어전','적대적 인수에 대응하는 긴급 결정을 실행했습니다.'],hr:['PEOPLE','인사 결정','조직과 급여 구조에 변화를 줬습니다.'],tax:['TAX','세무 결정','세금·준법 리스크에 대응했습니다.'],trades:['TREASURY','법인 투자','회사 자금으로 전략자산 거래를 실행했습니다.'],decisions:['BOARD','중간 이사회 결정','진행 중 프로젝트의 방향을 직접 결정했습니다.']};
  if(highlightMap[kind])pushCompanyHighlight(s,...highlightMap[kind]);
  saveCompanySeasonMeta(s);maybeCompleteCompanyDailyChallenge(state.company?.my_company||null);
}

const COMPANY_SEASON_PREFIX='kx_company_season_v2';
const COMPANY_SOUND_KEY='kx_company_sound_v1';
const COMPANY_CREATOR_HUD_KEY='kx_company_creator_hud_v1';
function companySeasonKey(){return `${COMPANY_SEASON_PREFIX}_${session?.user?.id||'guest'}_${state.company?.my_company?.id||'new'}`}
function defaultCompanySeasonMeta(){return {version:2,startValuation:0,startRank:0,bestRank:9999,scoreBonus:0,streak:0,bestStreak:0,currentDay:0,dayBase:{},dailyCompletedDays:[],boardResolvedDay:0,boardChoice:'',nextKickoffBonus:0,nextProjectCostMultiplier:1,highlights:[],lastTakeoverStage:'',lastRankMilestone:9999,perfectKickoffs:0,failedKickoffs:0}}
function companySeasonMeta(){
  try{const raw=JSON.parse(localStorage.getItem(companySeasonKey())||'{}')||{};const s={...defaultCompanySeasonMeta(),...raw};s.dailyCompletedDays=Array.isArray(s.dailyCompletedDays)?s.dailyCompletedDays:[];s.highlights=Array.isArray(s.highlights)?s.highlights:[];s.dayBase=s.dayBase&&typeof s.dayBase==='object'?s.dayBase:{};return s}catch{return defaultCompanySeasonMeta()}
}
function saveCompanySeasonMeta(s){try{localStorage.setItem(companySeasonKey(),JSON.stringify(s||defaultCompanySeasonMeta()))}catch{}}
function pushCompanyHighlight(s,type,title,body,points=0){
  if(!s)return;s.highlights=Array.isArray(s.highlights)?s.highlights:[];
  s.highlights.unshift({id:Date.now()+Math.random(),type:String(type||'LIVE'),title:String(title||'하이라이트'),body:String(body||''),points:Number(points)||0,day:liveCompanyClock().day,time:new Date().toISOString()});
  s.highlights=s.highlights.slice(0,12);
}
function addCompanyHighlight(type,title,body,points=0){const s=companySeasonMeta();if(points)s.scoreBonus=(Number(s.scoreBonus)||0)+Number(points);pushCompanyHighlight(s,type,title,body,points);saveCompanySeasonMeta(s)}
function ensureCompanySeasonDay(my=null,myRank=0){
  const s=companySeasonMeta(),day=Math.max(1,Number(liveCompanyClock().day)||1),meta=companyGameMeta();let changed=false;
  if(my&&Number(my.valuation)>0&&Number(s.startValuation)<=0){s.startValuation=Number(my.valuation);changed=true}
  if(myRank>0&&Number(s.startRank)<=0){s.startRank=myRank;changed=true}
  if(myRank>0&&myRank<Number(s.bestRank||9999)){s.bestRank=myRank;changed=true}
  if(Number(s.currentDay)!==day){s.currentDay=day;s.dayBase={actions:Number(meta.actions)||0,projects:Number(meta.projects)||0,media:Number(meta.media)||0,acquisitions:Number(meta.acquisitions)||0,expansions:Number(meta.expansions)||0,hr:Number(meta.hr)||0,tax:Number(meta.tax)||0,defenses:Number(meta.defenses)||0,trades:Number(meta.trades)||0,decisions:Number(meta.decisions)||0};s.boardChoice='';changed=true}
  if(changed)saveCompanySeasonMeta(s);return s;
}
const COMPANY_DAILY_CHALLENGES=[
  {id:'project',title:'신사업 데이',desc:'오늘 프로젝트를 1회 착수하세요.',counter:'projects',target:1,reward:250,section:'operations'},
  {id:'media',title:'화제성 확보',desc:'국내/해외 언론 보도를 1회 집행하세요.',counter:'media',target:1,reward:250,section:'risk'},
  {id:'people',title:'조직 리빌딩',desc:'채용·급여·성과급·인력조정 중 1회를 실행하세요.',counter:'hr',target:1,reward:250,section:'operations'},
  {id:'ma',title:'딜 메이커',desc:'경쟁사 지분 매입 또는 공개매수를 1회 실행하세요.',counter:'acquisitions',target:1,reward:300,section:'competition'},
  {id:'global',title:'글로벌 확장',desc:'해외시장 진출 또는 추가투자를 1회 실행하세요.',counter:'expansions',target:1,reward:300,section:'operations'},
  {id:'treasury',title:'법인 트레이딩',desc:'회사 자금으로 전략자산 거래를 1회 실행하세요.',counter:'trades',target:1,reward:220,section:'operations'},
  {id:'active',title:'CEO 액션 3연타',desc:'오늘 경영 결정을 3회 실행하세요.',counter:'actions',target:3,reward:320,section:'dashboard'}
];
function currentCompanyDailyChallenge(){const day=Math.max(1,Number(liveCompanyClock().day)||1);return COMPANY_DAILY_CHALLENGES[(day-1)%COMPANY_DAILY_CHALLENGES.length]}
function companyDailyChallengeProgress(s=null){s=s||ensureCompanySeasonDay(state.company?.my_company||null);const ch=currentCompanyDailyChallenge(),meta=companyGameMeta(),base=Number(s.dayBase?.[ch.counter])||0,cur=Number(meta[ch.counter])||0;return {challenge:ch,progress:Math.max(0,cur-base),done:(s.dailyCompletedDays||[]).includes(Number(s.currentDay))}}
function maybeCompleteCompanyDailyChallenge(my=null){
  const s=ensureCompanySeasonDay(my),p=companyDailyChallengeProgress(s),day=Number(s.currentDay)||1;if(p.done||p.progress<p.challenge.target)return false;
  s.dailyCompletedDays=[...(s.dailyCompletedDays||[]),day].slice(-30);s.scoreBonus=(Number(s.scoreBonus)||0)+p.challenge.reward;s.streak=(Number(s.streak)||0)+2;s.bestStreak=Math.max(Number(s.bestStreak)||0,s.streak);pushCompanyHighlight(s,'CHALLENGE','오늘의 도전 완료',`${p.challenge.title} · +${p.challenge.reward} 시즌 점수`,p.challenge.reward);saveCompanySeasonMeta(s);playCompanySfx('perfect');return true;
}
function companySoundEnabled(){const raw=localStorage.getItem(COMPANY_SOUND_KEY);return raw===null?true:raw==='1'}
function toggleCompanySound(){const next=!companySoundEnabled();localStorage.setItem(COMPANY_SOUND_KEY,next?'1':'0');if(next)playCompanySfx('click');return next}
function creatorHudEnabled(){return localStorage.getItem(COMPANY_CREATOR_HUD_KEY)==='1'}
function toggleCreatorHud(){const next=!creatorHudEnabled();localStorage.setItem(COMPANY_CREATOR_HUD_KEY,next?'1':'0');return next}
function playCompanySfx(type='click'){
  if(!companySoundEnabled())return;
  try{const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;const ctx=new AC(),now=ctx.currentTime;const presets={click:[[420,.045,.035]],success:[[540,.07,.045],[760,.11,.035]],perfect:[[520,.07,.04],[700,.09,.04],[920,.15,.035]],fail:[[210,.13,.05],[150,.18,.04]],news:[[620,.06,.035],[820,.08,.03]],alert:[[280,.09,.045],[360,.09,.04],[280,.13,.04]]};(presets[type]||presets.click).forEach((p,i)=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type=i%2?'triangle':'sine';o.frequency.setValueAtTime(p[0],now+i*.055);g.gain.setValueAtTime(p[2],now+i*.055);g.gain.exponentialRampToValueAtTime(.0001,now+i*.055+p[1]);o.connect(g);g.connect(ctx.destination);o.start(now+i*.055);o.stop(now+i*.055+p[1]+.02)});setTimeout(()=>ctx.close().catch(()=>{}),650)}catch{}
}
const COMPANY_BOARD_EVENTS=[
  {title:'경쟁사의 가격 공세',body:'경쟁사가 갑자기 가격을 내렸습니다. 다음 성장 프로젝트를 어떤 태도로 시작할까요?',options:[{label:'핵심 기능 집중',desc:'다음 프로젝트 착수 판정 +1',bonus:1,cost:1,score:60},{label:'비용 효율 우선',desc:'다음 프로젝트 실제 집행액 -5%',bonus:0,cost:.95,score:45},{label:'정면 승부',desc:'다음 프로젝트 판정 +2, 집행액 +6%',bonus:2,cost:1.06,score:80}]},
  {title:'대형 고객의 긴급 요청',body:'대형 고객이 빠른 납기를 요구합니다. 다음 프로젝트 운영 원칙을 선택하세요.',options:[{label:'품질 우선',desc:'착수 판정 +1',bonus:1,cost:1,score:55},{label:'프로세스 압축',desc:'실제 집행액 -5%',bonus:0,cost:.95,score:45},{label:'전담팀 투입',desc:'판정 +2, 집행액 +6%',bonus:2,cost:1.06,score:80}]},
  {title:'핵심 인재의 이탈 조짐',body:'경쟁사가 핵심 인력을 스카우트하려 합니다. 다음 프로젝트의 리더십 방식을 정하세요.',options:[{label:'권한 위임',desc:'착수 판정 +1',bonus:1,cost:1,score:60},{label:'예산 재조정',desc:'실제 집행액 -5%',bonus:0,cost:.95,score:45},{label:'최정예 TF 구성',desc:'판정 +2, 집행액 +6%',bonus:2,cost:1.06,score:85}]},
  {title:'투자자들의 성장 압박',body:'시장에서는 더 빠른 성장을 요구하고 있습니다. 다음 프로젝트의 위험 선호도를 정하세요.',options:[{label:'균형 성장',desc:'착수 판정 +1',bonus:1,cost:1,score:60},{label:'현금 방어',desc:'실제 집행액 -5%',bonus:0,cost:.95,score:45},{label:'공격 투자',desc:'판정 +2, 집행액 +6%',bonus:2,cost:1.06,score:90}]},
  {title:'공급망 불확실성',body:'원자재와 외주 일정이 흔들립니다. 다음 프로젝트 준비 방식을 결정하세요.',options:[{label:'대체 공급선 확보',desc:'착수 판정 +1',bonus:1,cost:1,score:60},{label:'범위 최소화',desc:'실제 집행액 -5%',bonus:0,cost:.95,score:45},{label:'선제 재고 확보',desc:'판정 +2, 집행액 +6%',bonus:2,cost:1.06,score:80}]}
];
function currentCompanyBoardEvent(){const day=Math.max(1,Number(liveCompanyClock().day)||1);return COMPANY_BOARD_EVENTS[(day-1)%COMPANY_BOARD_EVENTS.length]}
function resolveCompanyBoardChoice(index=0){
  const s=ensureCompanySeasonDay(state.company?.my_company||null),day=Number(s.currentDay)||1;if(Number(s.boardResolvedDay)===day)return;
  const ev=currentCompanyBoardEvent(),opt=ev.options[Math.max(0,Math.min(ev.options.length-1,Number(index)||0))];s.boardResolvedDay=day;s.boardChoice=opt.label;s.nextKickoffBonus=Math.min(3,Number(opt.bonus||0));s.nextProjectCostMultiplier=Math.max(.88,Math.min(1.15,Number(opt.cost||1)));s.scoreBonus=(Number(s.scoreBonus)||0)+Number(opt.score||0);pushCompanyHighlight(s,'BOARD','긴급 이사회 결론',`${ev.title} → ${opt.label}`,opt.score);saveCompanySeasonMeta(s);state.companyNotice=`이사회 결정: ${opt.label}. ${opt.desc}`;playCompanySfx('success');renderTerminal(true)
}
function consumeCompanyBoardPerk(){const s=companySeasonMeta();s.nextKickoffBonus=0;s.nextProjectCostMultiplier=1;saveCompanySeasonMeta(s)}
function registerCompanyKickoffResult(result,title='프로젝트'){
  const s=ensureCompanySeasonDay(state.company?.my_company||null);if(!result)return;if(result.className==='perfect'){s.perfectKickoffs=(Number(s.perfectKickoffs)||0)+1;s.scoreBonus=(Number(s.scoreBonus)||0)+140;s.streak=(Number(s.streak)||0)+2;pushCompanyHighlight(s,'PERFECT','완벽한 프로젝트 착수',`${title} · 완벽 성공`,140);playCompanySfx('perfect')}else if(result.className==='bad'){s.failedKickoffs=(Number(s.failedKickoffs)||0)+1;s.streak=0;pushCompanyHighlight(s,'FAIL','프로젝트 착수 실패',`${title} · 초기 계획 재정비 필요`,0);playCompanySfx('fail')}else{s.scoreBonus=(Number(s.scoreBonus)||0)+45;s.streak=(Number(s.streak)||0)+1;playCompanySfx('success')}s.bestStreak=Math.max(Number(s.bestStreak)||0,s.streak);saveCompanySeasonMeta(s)
}
function registerCompanyFailure(reason='경영 결정 실패'){const s=companySeasonMeta();s.streak=0;pushCompanyHighlight(s,'FAIL','경영 리스크 발생',String(reason||'결정 처리 실패'),0);saveCompanySeasonMeta(s);playCompanySfx('fail')}
function companySeasonGrade(score){if(score>=3600)return ['S+','레전드 CEO'];if(score>=3000)return ['S','시장 지배자'];if(score>=2400)return ['A','성장 전략가'];if(score>=1800)return ['B','전문 경영인'];if(score>=1200)return ['C','신흥 CEO'];return ['D','창업 단계']}
function companySeasonSnapshot(my,myRank,companies){
  let s=ensureCompanySeasonDay(my,myRank);maybeCompleteCompanyDailyChallenge(my);s=companySeasonMeta();
  const meta=companyGameMeta(),challenge=companyDailyChallengeProgress(s),start=Math.max(1,Number(s.startValuation)||Number(my?.valuation)||1),value=Math.max(0,Number(my?.valuation)||0),growth=(value-start)/start*100,rank=Math.max(1,Number(myRank)||companies.length||1);
  const milestones=[20,10,5,3,1],achieved=milestones.filter(m=>rank<=m).at(-1);if(achieved&&Number(s.lastRankMilestone||9999)>achieved){const bonus=achieved===1?500:achieved<=3?300:achieved<=10?180:100;s.lastRankMilestone=achieved;s.scoreBonus=(Number(s.scoreBonus)||0)+bonus;pushCompanyHighlight(s,'RANK',achieved===1?'기업 리그 1위 달성':`TOP ${achieved} 진입`,`현재 기업 순위 #${rank}`,bonus);saveCompanySeasonMeta(s)}
  if(rank<Number(s.bestRank||9999)){s.bestRank=rank;saveCompanySeasonMeta(s)}
  s=companySeasonMeta();
  const rankScore=Math.max(0,900-(rank-1)*22),health=[my?.technology,my?.brand,my?.operations,my?.product_quality,my?.employee_morale,my?.customer_trust].reduce((a,v)=>a+(Number(v)||50),0)/6,margin=Number(my?.revenue)>0?Number(my?.profit||0)/Number(my.revenue)*100:0;
  const score=Math.max(0,Math.round(650+Math.max(-300,Math.min(1200,growth*18))+rankScore+health*4+Math.max(-150,Math.min(500,margin*20))+Math.min(600,(Number(meta.actions)||0)*10)+(Number(s.scoreBonus)||0))),grade=companySeasonGrade(score),sorted=[...(companies||[])].sort((a,b)=>Number(b.valuation)-Number(a.valuation)),idx=sorted.findIndex(c=>Number(c.id)===Number(my?.id));let rival=null;if(idx>0)rival=sorted[idx-1];else if(idx===0&&sorted.length>1)rival=sorted[1];const gap=rival?Number(rival.valuation||0)-value:0;
  return {season:s,meta,challenge,score,grade,growth,health,margin,rank,rival,gap};
}
function renderCreatorHud(my,myRank,companies){return ''}
async function copyCompanyCreatorSummary(){
  const my=state.company?.my_company,companies=[...(state.company?.companies||[])].filter(Boolean).sort((a,b)=>Number(b.valuation)-Number(a.valuation));if(!my)return;const rank=companies.findIndex(c=>Number(c.id)===Number(my.id))+1,ss=companySeasonSnapshot(my,rank,companies),ch=ss.challenge.challenge;const txt=`[KX CORPORATE CEO RUN] ${my.name} | DAY ${liveCompanyClock().day} | 기업순위 #${rank}/${companies.length} | 기업가치 ${formatKrwSmart(my.valuation)} | 영업이익 ${formatKrwSmart(my.profit)} | 시즌점수 ${nf.format(ss.score)} (${ss.grade[0]}) | 오늘의 도전: ${ch.title} ${Math.min(ch.target,ss.challenge.progress)}/${ch.target}`;
  try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(txt);else{const ta=document.createElement('textarea');ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove()}state.companyNotice='영상/방송용 CEO 요약을 클립보드에 복사했습니다.';playCompanySfx('click');renderTerminal(true)}catch{state.companyNotice='요약 복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해 주세요.';renderTerminal(true)}
}
function trackCompanySnapshotMoments(){
  const my=state.company?.my_company;if(!my)return;const companies=[...(state.company?.companies||[])].filter(Boolean).sort((a,b)=>Number(b.valuation)-Number(a.valuation)),rank=companies.findIndex(c=>Number(c.id)===Number(my.id))+1,s=ensureCompanySeasonDay(my,rank);
  const control=state.company?.control_case,stage=String(control?.stage||'');if(stage&&stage!==String(s.lastTakeoverStage||'')){s.lastTakeoverStage=stage;pushCompanyHighlight(s,'ALERT','적대적 인수 경보',`${control?.attacker_name||'경쟁사'} · ${stage} · 상대 지분 ${Number(control?.stake||0).toFixed(1)}%`,120);s.scoreBonus=(Number(s.scoreBonus)||0)+120;saveCompanySeasonMeta(s);playCompanySfx('alert')}else if(!stage&&s.lastTakeoverStage){s.lastTakeoverStage='';saveCompanySeasonMeta(s)}
}

function markNewsViewed(){playerMeta.newsViewed=true;saveMeta()}
function recordOrderMeta(body,order,s){
  if(!body||!order)return;
  const ok=['OPEN','PARTIAL','FILLED'].includes(String(order.status||''));if(!ok)return;
  playerMeta.orders=(Number(playerMeta.orders)||0)+1;
  if(body.p_order_type==='LIMIT')playerMeta.limitOrders=(Number(playerMeta.limitOrders)||0)+1;
  if(body.p_order_type==='MARKET')playerMeta.marketOrders=(Number(playerMeta.marketOrders)||0)+1;
  if(['PARTIAL','FILLED'].includes(String(order.status||'')))playerMeta.filledOrders=(Number(playerMeta.filledOrders)||0)+1;
  if(body.p_side==='SELL'&&s&&['PARTIAL','FILLED'].includes(String(order.status||''))){
    const avgFill=Number(order.avg_fill_price)||Number(s.last_price)||0;
    if(positionMetrics(s,body.p_quantity,avgFill).realizedPnl>0)playerMeta.profitableSells=(Number(playerMeta.profitableSells)||0)+1;
  }
  saveMeta();
}
function emptyGame(){return {events:[],predictions:[],shorts:[],ipos:[],subscriptions:[],dividends:[],short_adjustments:[],prediction_stats:{total:0,correct:0}}}
function emptyCompany(){return {my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],media_campaigns:[],tax_records:[],events:[],press:[],my_history:[],projects:[],investment_income:[],investment_summary:{},products:[],finance_periods:[],incidents:[],due_diligence:[],macro:{},supply:{},finance_live:{},recruit_pool:[],talents:[],poach_targets:[],talent_offers:[],talent_summary:{},talent_day:1,talent_hired_today:0,talent_daily_limit:5,talent_available:false,talent_error:'',realism_available:false,realism_error:'',world:null,control_case:null}}
const LOCAL_COMPANY_KEY='kx_company_local_v4';
function clamp(v,min=0,max=100){return Math.max(min,Math.min(max,Number(v)||0))}
function localBotSeed(){
  const rows=[
    [101,'한빛반도체','HBX','AI·반도체','대한민국','TECH',4200000000,76,66,72,74],
    [102,'미래로보틱스','MRB','로보틱스','대한민국','AGGRESSIVE',3100000000,70,57,69,71],
    [103,'가온모터스','GAM','모빌리티','대한민국','GROWTH',5200000000,62,77,75,67],
    [104,'네오바이오','NBI','바이오','대한민국','DEFENSIVE',2800000000,68,61,58,72],
    [105,'청명에너지','CME','에너지','대한민국','VALUE',3600000000,59,64,73,66],
    [106,'코어게임즈','CGZ','게임·콘텐츠','대한민국','GROWTH',2400000000,63,71,55,64],
    [201,'Northstar Systems','NSS','AI·반도체','미국','AGGRESSIVE',7800000000,84,80,82,79],
    [202,'Aoi Dynamics','AOD','로보틱스','일본','TECH',6100000000,81,68,84,80],
    [203,'Rheinwerk Mobility','RWM','모빌리티','독일','DEFENSIVE',7200000000,72,75,86,78],
    [204,'Merlion Digital','MLD','핀테크','싱가포르','GROWTH',4400000000,76,73,70,72],
    [205,'Crown Media Group','CMG','게임·콘텐츠','영국','BRAND',3900000000,59,86,66,65],
    [206,'Bharat Automation','BHA','산업재·자동화','인도','VALUE',3500000000,65,57,79,69]
  ];
  return rows.map(r=>({id:r[0],owner_user_id:null,is_bot:true,operator_type:'BOT',name:r[1],ticker:r[2],sector:r[3],home_country:r[4],ai_style:r[5],cash:r[6]*.34,revenue:r[6]*.28,previous_revenue:r[6]*.27,profit:r[6]*.028,debt:r[6]*.12,employees:Math.round(140+r[6]/50000000),technology:r[7],brand:r[8],operations:r[9],product_quality:r[10],domestic_share:4+Math.random()*8,global_share:r[4]==='대한민국'?1+Math.random()*3:4+Math.random()*8,global_level:r[4]==='대한민국'?1:3,valuation:r[6],share_price:r[6]/1000000,shares_outstanding:1000000,status:'ACTIVE',defense_power:10,governance:62,employee_morale:64,customer_trust:66,investor_sentiment:60,media_reputation:58,institutional_interest:54,retail_interest:55,public_demand:55,credit_score:70,treasury_risk:8,audit_risk:5,regulatory_heat:4,tax_due:0,tax_arrears:0,last_event:'정상 경영'}));
}
function freshLocalCompany(){return {version:4,my_company:null,companies:localBotSeed(),my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],media_campaigns:[],tax_records:[],events:[],world:{cycle_no:1,last_local_tick:Date.now()},control_case:null}}
function loadLocalCompany(){
  let d=null;try{d=JSON.parse(localStorage.getItem(LOCAL_COMPANY_KEY)||'null')}catch{}
  if(!d||d.version!==4)d=freshLocalCompany();
  d.companies=Array.isArray(d.companies)&&d.companies.length?d.companies:localBotSeed();
  d.my_markets=d.my_markets||[];d.my_holdings=d.my_holdings||[];d.incoming_holdings=d.incoming_holdings||[];d.market_holdings=d.market_holdings||[];d.media_campaigns=d.media_campaigns||[];d.tax_records=d.tax_records||[];d.events=d.events||[];d.world=d.world||{cycle_no:1,last_local_tick:Date.now()};
  d.stock_options=(state.stocks||[]).filter(x=>Number(x.last_price)>0).map(x=>({ticker:x.ticker,name:x.name,last_price:x.last_price,sector:x.sector,market_area:x.market_area,market_country:x.market_country}));
  return d;
}
function saveLocalCompany(d){
  if(!d)return;d.version=4;d.stock_options=undefined;
  try{localStorage.setItem(LOCAL_COMPANY_KEY,JSON.stringify(d))}catch{}
  d.stock_options=(state.stocks||[]).filter(x=>Number(x.last_price)>0).map(x=>({ticker:x.ticker,name:x.name,last_price:x.last_price,sector:x.sector,market_area:x.market_area,market_country:x.market_country}));
}
function localEvent(d,type,title,body,companyName=null){
  d.events.unshift({id:Date.now()+Math.random(),event_type:type,title,body,company_name:companyName||d.my_company?.name||'시장',created_at:new Date().toISOString()});
  d.events=d.events.slice(0,60);
}
function localMirror(d){
  const my=d.my_company;if(!my)return;
  my.operator_type='ME';my.is_bot=false;
  const i=d.companies.findIndex(x=>Number(x.id)===Number(my.id));
  if(i>=0)d.companies[i]={...my};else d.companies.unshift({...my});
}
function localRevalue(d){
  const c=d.my_company;if(!c)return;
  const score=(Number(c.technology)+Number(c.brand)+Number(c.operations)+Number(c.product_quality)+Number(c.customer_trust||60)+Number(c.employee_morale||60))/6;
  const sentiment=(Number(c.investor_sentiment||50)+Number(c.media_reputation||50)+Number(c.credit_score||65))/3;
  c.valuation=Math.max(250000000,Number(c.revenue||0)*2.15+Math.max(0,Number(c.profit||0))*7.5+Number(c.cash||0)*.58-Number(c.debt||0)*.52+(score-50)*22000000+(sentiment-50)*15000000);
  c.share_price=Math.max(100,Math.round(c.valuation/Math.max(1,Number(c.shares_outstanding||1000000))));
  c.domestic_share=clamp(c.domestic_share,0,75);c.global_share=clamp(c.global_share,0,60);
  localMirror(d);
}
function localIncomingSync(d){
  const c=d.control_case,my=d.my_company;
  if(!c||!my){d.incoming_holdings=[];return}
  const bot=d.companies.find(x=>Number(x.id)===Number(c.attacker_company_id));
  d.incoming_holdings=[{holder_company_id:bot?.id,holder_name:bot?.name||c.attacker_name,holder_ticker:bot?.ticker||c.attacker_ticker,holder_type:'BOT',stake:Number(c.stake||0),market_value:Number(my.valuation||0)*Number(c.stake||0)/100}];
}
function localTakeoverStage(stake){return stake>=50?'TAKEOVER':stake>=40?'EMERGENCY':stake>=30?'HOSTILE':stake>=20?'PRESSURE':'WATCH'}
function localTick(d){
  const now=Date.now();if(now-Number(d.world?.last_local_tick||0)<18000)return d;
  d.world.cycle_no=Number(d.world.cycle_no||1)+1;d.world.last_local_tick=now;
  for(const b of d.companies.filter(x=>x.is_bot)){
    const profile=companyMarketVolatilityProfile(b),style=String(b.ai_style||'').toUpperCase();
    const growthBias=style==='GROWTH'?.0045:style==='AGGRESSIVE'?.0035:style==='TECH'?.0025:style==='DEFENSIVE'?-.001:0;
    const drift=(Math.random()-.47)*.022+growthBias;
    b.previous_revenue=b.revenue;b.revenue=Math.max(120000000,b.revenue*(1+drift));b.profit=b.revenue*(.055+(b.technology+b.operations-120)/1200+(Math.random()-.5)*.025);
    const sentimentPush=(Number(b.investor_sentiment||58)-50)/10000;
    const flowShock=(Math.random()-.5)*profile.targetRange*.22;
    const fundamental=drift*.40+sentimentPush;
    const priceMove=Math.max(-profile.targetRange*.30,Math.min(profile.targetRange*.30,fundamental+flowShock));
    b.valuation=Math.max(500000000,b.valuation*(1+priceMove));b.share_price=Math.max(300,b.valuation/Math.max(1,Number(b.shares_outstanding||1000000)));
    b.investor_flow=Number(b.valuation||0)*(priceMove*.13+(Math.random()-.5)*.0018);
    b.investor_sentiment=clamp(Number(b.investor_sentiment||58)+priceMove*160+(Math.random()-.5)*1.2);
    b.volatility=profile.targetRange*100;
    b.last_return_pct=priceMove*100;
  }
  const c=d.my_company;
  if(c){
    c.previous_revenue=c.revenue;
    const business=((c.product_quality-50)*.0016+(c.brand-50)*.0013+(c.operations-50)*.0012+(c.customer_trust-50)*.0008)+(Math.random()-.5)*.018;
    c.revenue=Math.max(80000000,c.revenue*(1+business));
    const margin=.06+(c.technology-50)*.0005+(c.operations-50)*.0006+(c.employee_morale-50)*.00025-(c.treasury_risk||0)*.00018;
    c.profit=c.revenue*margin-Number(c.debt||0)*.0035;
    c.cash=Math.max(0,Number(c.cash)+c.profit*.08);
    c.investor_flow=c.valuation*((Number(c.investor_sentiment||50)-50)/2500+(Math.random()-.5)*.002);
    c.investor_sentiment=clamp(Number(c.investor_sentiment||50)+(c.profit>=0?.6:-1)+(Math.random()-.5)*1.4);
    c.employee_morale=clamp(Number(c.employee_morale||65)+(c.operations-50)*.008+(Math.random()-.5)*.7);
    c.customer_trust=clamp(Number(c.customer_trust||60)+(c.product_quality-50)*.008+(Math.random()-.5)*.6);
    c.media_reputation=clamp(Number(c.media_reputation||50)*.995+(Math.random()-.5)*.5);
    c.defense_power=Math.max(0,Number(c.defense_power||0)-1.5);
    if(d.world.cycle_no%12===0&&Number(c.tax_due||0)<=0){c.tax_due=Math.max(0,c.profit*.25*.22);localEvent(d,'TAX','분기 법인세 고지',`이번 분기 법인세 ${won(c.tax_due)}이 고지되었습니다.`)}
    if(Number(c.tax_arrears||0)>0){c.audit_risk=clamp(Number(c.audit_risk||0)+1.1);if(Math.random()<Math.min(.18,.015+c.audit_risk/700)){const hit=c.tax_arrears*(1.35+Math.random()*.35);c.cash=Math.max(0,c.cash-hit);c.debt+=Math.max(0,hit-c.cash);c.tax_arrears=0;c.audit_risk=18;c.compliance=clamp(c.compliance-14);c.brand=clamp(c.brand-6);c.media_reputation=clamp(c.media_reputation-10);c.investor_sentiment=clamp(c.investor_sentiment-14);localEvent(d,'AUDIT','세무조사 적발·추징',`신고 누락분이 적발되어 약 ${won(hit)}의 추징·가산 부담과 평판 하락이 발생했습니다.`)}}
    if(!d.control_case&&d.world.cycle_no>3){const tier=takeoverGrowthTier(c.valuation),lastEnd=Number(c.last_takeover_end_cycle||0),cooldownOk=d.world.cycle_no-lastEnd>=tier.cooldown;if(cooldownOk&&tier.startChance>0&&Math.random()<tier.startChance){const candidates=d.companies.filter(x=>x.is_bot&&localRivalryReason(d,x)&&Number(x.valuation||0)<=Math.max(Number(c.valuation||0)*8,1000000000000));if(candidates.length){const a=candidates[Math.floor(Math.random()*candidates.length)],reason=localRivalryReason(d,a),stake=Math.min(tier.cap,2+Math.random()*4);d.control_case={id:Date.now(),status:'ACTIVE',stage:'WATCH',started_cycle:d.world.cycle_no,deadline_cycle:d.world.cycle_no+24,cycles_left:24,attacker_company_id:a.id,attacker_name:a.name,attacker_ticker:a.ticker,attacker_country:a.home_country,attacker_type:'BOT',attacker_style:a.ai_style,trigger_reason:reason,stake,counter_stake:0,used_rights_issue:false,used_poison_pill:false};localEvent(d,'TAKEOVER','경쟁사 지분 매집 포착',`${a.name}이 ${reason}을 계기로 우리 회사 지분을 소규모 매집하기 시작했습니다.`)}}}
    if(d.control_case){const t=d.control_case,tier=takeoverGrowthTier(c.valuation);t.cycles_left=Math.max(0,Number(t.deadline_cycle)-d.world.cycle_no);const pressure=Math.max(.25,1-Number(c.defense_power||0)/115),pace=tier.hardShield?.18:.55;t.stake=Math.min(tier.cap,Number(t.stake||0)+(.25+Math.random()*.65)*pressure*pace);t.stage=localTakeoverStage(t.stake);if(!tier.hardShield&&t.stake>=50){c.parent_name=t.attacker_name;c.last_event='경영권 인수';localEvent(d,'CONTROL','경영권 인수',`${t.attacker_name}의 보유지분이 50%를 넘어 경영권이 넘어갔습니다. 다시 지분을 낮추면 독립을 회복할 수 있습니다.`)} }
    if(c.product_quality<48&&Math.random()<.04){const cost=Math.max(10000000,c.revenue*.012);c.cash=Math.max(0,c.cash-cost);c.customer_trust=clamp(c.customer_trust-7);c.brand=clamp(c.brand-3);localEvent(d,'RECALL','품질 문제·리콜',`품질관리 부족으로 리콜이 발생해 ${won(cost)}의 비용과 고객신뢰 하락이 발생했습니다.`)}
    if(c.employee_morale<38&&Math.random()<.05){c.employees=Math.max(15,Math.round(c.employees*.94));c.technology=clamp(c.technology-2);localEvent(d,'HR','핵심인력 이탈','낮은 직원 사기로 핵심 인력이 퇴사했습니다. 복지·보상과 조직관리가 필요합니다.')}
    localRevalue(d);localIncomingSync(d);
  }
  saveLocalCompany(d);return d;
}
function activateLocalCompany(runSync=false){
  let d=loadLocalCompany();if(runSync)d=localTick(d);d.stock_options=(state.stocks||[]).filter(x=>Number(x.last_price)>0).map(x=>({ticker:x.ticker,name:x.name,last_price:x.last_price,sector:x.sector,market_area:x.market_area,market_country:x.market_country}));
  applyBotBusinessStrategies(d);buildSharedCorporateWar(d);state.company=d;state.companyAvailable=true;state.companyMode='LOCAL';return d;
}
function createLocalCompany(name,ticker,sector){
  const d=loadLocalCompany();if(d.my_company)throw new Error('이미 설립한 회사가 있습니다.');
  if(!name||name.length<2)throw new Error('회사 이름을 2자 이상 입력해 주세요.');
  if(!/^[A-Z0-9]{2,6}$/.test(ticker||''))throw new Error('종목 코드는 영문/숫자 2~6자로 입력해 주세요.');
  if(d.companies.some(x=>String(x.name).toLowerCase()===String(name).toLowerCase()||String(x.ticker).toUpperCase()===ticker))throw new Error('이미 시장에서 사용 중인 회사명 또는 종목 코드입니다.');
  d.my_company={id:1,owner_user_id:'LOCAL',is_bot:false,operator_type:'ME',name,ticker,sector,home_country:'대한민국',ai_style:'PLAYER',cash:1000000000,revenue:700000000,previous_revenue:650000000,profit:70000000,debt:0,employees:80,technology:45,brand:45,operations:45,product_quality:45,domestic_share:2,global_share:0,global_level:0,valuation:2000000000,share_price:2000,shares_outstanding:1000000,parent_name:null,status:'ACTIVE',last_event:'법인 설립',defense_power:0,governance:55,employee_morale:66,customer_trust:60,investor_sentiment:55,media_reputation:50,institutional_interest:40,retail_interest:50,public_demand:50,credit_score:70,treasury_risk:0,audit_risk:3,regulatory_heat:2,compliance:76,tax_due:0,tax_arrears:0,investor_flow:0};
  d.companies.unshift({...d.my_company});localEvent(d,'FOUNDING','회사 설립',`${name}이 대한민국 시장에서 사업을 시작했습니다.`);localRevalue(d);saveLocalCompany(d);state.company=d;return {message:`${name} 설립 완료. 이제 CEO 대시보드에서 회사를 직접 경영할 수 있습니다.`};
}
function localCompanyAction(name,body={}){
  const d=loadLocalCompany(),c=d.my_company;if(!c)throw new Error('먼저 회사를 설립해 주세요.');
  const amt=Math.max(0,Number(body.p_amount||body.p_budget||0));let msg='경영 결정이 반영되었습니다.';
  const spend=v=>{v=Math.min(Number(c.cash||0),Math.max(0,v));c.cash-=v;return v};
  if(name==='kx_company_action'){
    const a=body.p_action,unit=Math.max(10000000,amt||100000000),scale=Math.max(.35,Math.min(3,unit/100000000));
    if(a==='LOAN'){c.cash+=unit;c.debt+=unit;c.credit_score=clamp(c.credit_score-2*scale);msg=`기업대출 ${won(unit)}을 조달했습니다.`}
    else if(a==='REPAY'){const pay=Math.min(unit,c.cash,c.debt);c.cash-=pay;c.debt-=pay;c.credit_score=clamp(c.credit_score+3*scale);msg=`부채 ${won(pay)}을 상환했습니다.`}
    else if(a==='COSTCUT'){c.cash+=unit*.18;c.operations=clamp(c.operations+1.4*scale);c.employee_morale=clamp(c.employee_morale-5*scale);c.brand=clamp(c.brand-1.5*scale);msg='구조조정으로 비용을 줄였지만 조직 사기가 하락했습니다.'}
    else{const paid=spend(unit);if(paid<unit*.9)throw new Error('법인 현금이 부족합니다.');
      if(a==='RND'){c.technology=clamp(c.technology+5*scale);c.product_quality=clamp(c.product_quality+2*scale);msg='R&D 투자로 기술력과 제품 경쟁력이 상승했습니다.'}
      if(a==='QUALITY'){c.product_quality=clamp(c.product_quality+6*scale);c.customer_trust=clamp(c.customer_trust+4*scale);msg='품질·안전 투자가 고객 신뢰와 제품력을 높였습니다.'}
      if(a==='CAPEX'){c.operations=clamp(c.operations+6*scale);c.employees+=Math.round(10*scale);msg='생산설비와 운영능력을 확대했습니다.'}
      if(a==='HIRING'){c.technology=clamp(c.technology+3*scale);c.operations=clamp(c.operations+2*scale);c.employee_morale=clamp(c.employee_morale+2*scale);c.employees+=Math.round(18*scale);msg='핵심 인재를 채용했습니다.'}
      if(a==='WELFARE'){c.employee_morale=clamp(c.employee_morale+8*scale);c.operations=clamp(c.operations+1.5*scale);msg='복지·보상 강화로 직원 사기와 생산성이 상승했습니다.'}
      if(a==='MARKETING'){c.brand=clamp(c.brand+6*scale);c.domestic_share=clamp(c.domestic_share+1.2*scale,0,75);c.investor_sentiment=clamp(c.investor_sentiment+2*scale);msg='마케팅으로 브랜드와 시장점유율이 상승했습니다.'}
      if(a==='PRICE_WAR'){c.domestic_share=clamp(c.domestic_share+2.4*scale,0,75);c.profit-=unit*.12;c.brand=clamp(c.brand-1.2*scale);msg='가격 경쟁으로 점유율을 얻었지만 수익성과 브랜드에 부담이 생겼습니다.'}
      if(a==='DIVIDEND'){c.investor_sentiment=clamp(c.investor_sentiment+6*scale);c.institutional_interest=clamp(c.institutional_interest+4*scale);msg='배당으로 주주 신뢰와 기관 관심도가 상승했습니다.'}
      if(a==='COMPLIANCE'){c.compliance=clamp(c.compliance+8*scale);c.governance=clamp(c.governance+5*scale);c.audit_risk=clamp(c.audit_risk-6*scale);c.credit_score=clamp(c.credit_score+3*scale);msg='준법·감사 체계를 강화했습니다.'}
    }
    localEvent(d,'DECISION','CEO 경영 결정',msg);
  }else if(name==='kx_company_media'){
    const budget=Math.max(20000000,amt||70000000);if(spend(budget)<budget*.9)throw new Error('법인 현금이 부족합니다.');const aggressive=body.p_campaign==='AGGRESSIVE_SPIN',global=body.p_outlet==='GLOBAL_WIRE';const impact=(budget/70000000)*(aggressive?8:5)*(global?1.15:1);c.media_reputation=clamp(c.media_reputation+(aggressive?impact*.4:impact));c.investor_sentiment=clamp(c.investor_sentiment+impact);c.institutional_interest=clamp(c.institutional_interest+impact*(global?1.1:.55));c.investor_flow+=c.valuation*impact/900;const outlet={ECON_DAILY:'KX 경제일보',BIZ_TV:'비즈니스24',GLOBAL_WIRE:'Global Finance Wire',EDGE_MEDIA:'EDGE 미디어'}[body.p_outlet]||'미디어';msg=`${outlet} PR/IR 집행으로 투자자 관심이 높아졌습니다.`;if(aggressive&&Math.random()<.28){c.media_reputation=clamp(c.media_reputation-12);c.investor_sentiment=clamp(c.investor_sentiment-8);msg='공격적인 홍보가 과장 논란으로 번져 단기 역풍이 발생했습니다.'}d.media_campaigns.unshift({outlet_name:outlet,campaign_label:body.p_campaign,budget,sentiment_impact:impact,created_at:new Date().toISOString()});localEvent(d,'MEDIA','언론·IR 집행',msg);
  }else if(name==='kx_company_tax'){
    const a=body.p_action,due=Number(c.tax_due||0),arr=Number(c.tax_arrears||0);
    if(a==='PAY'){const pay=due+arr;if(pay<=0)throw new Error('현재 납부할 세금이 없습니다.');if(c.cash<pay)throw new Error('세금 납부에 필요한 법인 현금이 부족합니다.');c.cash-=pay;c.tax_due=0;c.tax_arrears=0;c.audit_risk=clamp(c.audit_risk-8);c.compliance=clamp(c.compliance+3);msg='법인세와 미납세액을 정상 납부했습니다.'}
    if(a==='PLAN'){if(due<=0)throw new Error('검토할 고지세액이 없습니다.');const fee=Math.max(5000000,due*.08);if(c.cash<fee)throw new Error('세무 검토 비용이 부족합니다.');c.cash-=fee;c.tax_due=due*.82;c.compliance=clamp(c.compliance+2);msg='세무 검토를 통해 합법적인 공제·비용 항목을 반영했습니다.'}
    if(a==='INSTALLMENT'){if(due<=0)throw new Error('분할 납부할 세금이 없습니다.');const pay=Math.min(c.cash,due*.4);c.cash-=pay;c.tax_arrears+=Math.max(0,due-pay)*1.03;c.tax_due=0;c.audit_risk=clamp(c.audit_risk+5);msg='일부 세금을 납부하고 잔액을 이월했습니다.'}
    if(a==='EVADE'){if(due<=0)throw new Error('현재 신고할 세금이 없습니다.');c.tax_arrears+=due;c.tax_due=0;c.audit_risk=clamp(c.audit_risk+28);c.compliance=clamp(c.compliance-14);c.governance=clamp(c.governance-8);msg='세금 신고 누락을 선택했습니다. 당장 현금은 보존했지만 세무조사 위험이 크게 상승했습니다.'}
    if(a==='CORRECT'){if(arr<=0)throw new Error('자진 정정할 미납세액이 없습니다.');const pay=arr*1.08;if(c.cash<pay)throw new Error('자진 정정 납부에 필요한 현금이 부족합니다.');c.cash-=pay;c.tax_arrears=0;c.audit_risk=clamp(c.audit_risk-18);c.compliance=clamp(c.compliance+7);msg='자진 정정으로 미납세액을 정리하고 조사 위험을 낮췄습니다.'}
    d.tax_records.unshift({cycle_no:d.world.cycle_no,base_tax:due,action:a,action_label:msg,paid:a==='PAY'?due+arr:0,penalty:0,audit_triggered:false,created_at:new Date().toISOString()});localEvent(d,'TAX','세무 의사결정',msg);
  }else if(name==='kx_company_expand'){
    const map={US:['미국','북미'],DE:['독일','유럽'],GB:['영국','유럽'],JP:['일본','동아시아'],CN:['중국','동아시아']};const info=map[body.p_country_code]||[body.p_country_code,'해외'];const budget=Math.max(80000000,amt||200000000);if(spend(budget)<budget*.9)throw new Error('해외 진출 예산이 부족합니다.');let m=d.my_markets.find(x=>x.country_code===body.p_country_code);if(!m){m={company_id:c.id,country_code:body.p_country_code,country_name:info[0],region:info[1],presence:14,market_share:.3,revenue:0,established_at:new Date().toISOString()};d.my_markets.push(m)}else m.presence=clamp(m.presence+10*budget/200000000);m.market_share=Math.min(20,m.market_share+.6*budget/200000000);m.revenue+=budget*.18;c.global_share=clamp(c.global_share+.35*budget/200000000,0,60);c.global_level=Math.min(5,Math.max(c.global_level,d.my_markets.length));c.brand=clamp(c.brand+1.5);msg=`${info[0]} 사업에 투자해 현지 영향력과 글로벌 점유율을 확대했습니다.`;localEvent(d,'GLOBAL','해외 사업 확대',msg);
  }else if(name==='kx_company_buy_shares'){
    const target=d.companies.find(x=>Number(x.id)===Number(body.p_target_company_id));if(!target)throw new Error('대상 회사를 찾지 못했습니다.');const budget=Math.max(1000000,amt||100000000);if(spend(budget)<budget*.9)throw new Error('지분 인수 예산이 부족합니다.');const add=Math.min(14,budget/Math.max(1,target.valuation)*100);let h=d.my_holdings.find(x=>Number(x.target_company_id)===Number(target.id));if(!h){h={holder_company_id:c.id,target_company_id:target.id,target_name:target.name,target_ticker:target.ticker,target_country:target.home_country,stake:0,market_value:0};d.my_holdings.push(h)}h.stake=Math.min(75,Number(h.stake||0)+add);h.market_value=target.valuation*h.stake/100;msg=`${target.name} 지분을 ${add.toFixed(2)}% 추가 확보했습니다.`;if(h.stake>=50){target.parent_name=c.name;msg+=` 경영권을 확보해 ${target.name}을 자회사로 편입했습니다.`;localEvent(d,'CONTROL','경쟁사 인수 성공',msg,target.name)}else localEvent(d,'M&A','경쟁사 지분 매입',msg,target.name);
  }else if(name==='kx_company_sell_shares'){
    const h=d.my_holdings.find(x=>Number(x.target_company_id)===Number(body.p_target_company_id));if(!h)throw new Error('보유 지분이 없습니다.');const t=d.companies.find(x=>Number(x.id)===Number(h.target_company_id));const value=Math.min(Math.max(1000000,amt||100000000),Number(h.market_value||0));const cut=h.stake*(value/Math.max(1,h.market_value));h.stake=Math.max(0,h.stake-cut);h.market_value=(t?.valuation||0)*h.stake/100;c.cash+=value;if(h.stake<=.01)d.my_holdings=d.my_holdings.filter(x=>x!==h);msg=`${t?.name||'경쟁사'} 보유지분 일부를 매각해 ${won(value)}을 회수했습니다.`;localEvent(d,'M&A','보유지분 매각',msg);
  }else if(name==='kx_company_trade_market'){
    const st=state.stocks.find(x=>x.ticker===body.p_ticker);if(!st)throw new Error('종목을 찾지 못했습니다.');const amount=Math.max(10000,amt||50000000),px=Math.max(1,Number(st.last_price)),side=body.p_side;let h=d.market_holdings.find(x=>x.ticker===st.ticker);
    if(side==='BUY'){if(c.cash<amount)throw new Error('법인 현금이 부족합니다.');const sh=amount/px;c.cash-=amount;if(!h){h={company_id:c.id,ticker:st.ticker,name:st.name,sector:st.sector,market_area:st.market_area,market_country:st.market_country,shares:0,avg_price:px,market_value:0,pnl:0};d.market_holdings.push(h)}h.avg_price=(h.avg_price*h.shares+amount)/(h.shares+sh);h.shares+=sh;msg=`${st.name}을 회사 전략자산으로 ${won(amount)} 매수했습니다.`}else{if(!h||h.shares<=0)throw new Error('회사에서 보유한 해당 종목이 없습니다.');const sh=Math.min(h.shares,amount/px),cash=sh*px;h.shares-=sh;c.cash+=cash;msg=`${st.name}을 ${won(cash)} 매도했습니다.`;if(h.shares<=.0001)d.market_holdings=d.market_holdings.filter(x=>x!==h)}
    for(const x of d.market_holdings){const now=state.stocks.find(z=>z.ticker===x.ticker);if(now){x.name=now.name;x.sector=now.sector;x.market_area=now.market_area;x.market_country=now.market_country;x.market_value=x.shares*Number(now.last_price);x.pnl=(Number(now.last_price)-Number(x.avg_price))*x.shares}}
    const pv=d.market_holdings.reduce((a,x)=>a+Number(x.market_value||0),0);c.treasury_risk=clamp(pv/Math.max(1,c.valuation)*110);localEvent(d,'TREASURY','법인 전략투자',msg);
  }else if(name==='kx_company_defense'){
    const t=d.control_case;if(!t)throw new Error('현재 진행 중인 경영권 인수전이 없습니다.');const budget=Math.max(takeoverDefenseMinimum(c),amt||150000000),a=body.p_action;if(c.cash<budget)throw new Error('경영권 방어 예산이 부족합니다.');c.cash-=budget;
    if(a==='BUYBACK'){t.stake=Math.max(0,t.stake-(4+budget/c.valuation*100));msg='긴급 자사주 매입으로 공격 기업의 실질 지분 압박을 낮췄습니다.'}
    if(a==='NEGOTIATE'){t.stake=Math.max(0,t.stake-(6+budget/c.valuation*120));msg='프리미엄 협상으로 공격 기업 지분 일부를 되샀습니다.'}
    if(a==='WHITE_KNIGHT'){c.defense_power=clamp(c.defense_power+30);t.stake=Math.max(0,t.stake-2);msg='백기사를 확보해 우호 의결권과 방어력이 크게 상승했습니다.'}
    if(a==='POISON_PILL'){if(t.used_poison_pill)throw new Error('이번 인수전에서 이미 포이즌필을 사용했습니다.');t.used_poison_pill=true;c.defense_power=clamp(c.defense_power+52);c.brand=clamp(c.brand-3);c.operations=clamp(c.operations-2);msg='포이즌필을 발동해 추가 인수 비용을 크게 높였습니다.'}
    if(a==='RIGHTS_ISSUE'){if(t.used_rights_issue)throw new Error('이번 인수전에서 이미 유상증자를 사용했습니다.');t.used_rights_issue=true;c.shares_outstanding*=1.22;t.stake=t.stake/1.22;c.investor_sentiment=clamp(c.investor_sentiment-3);msg='긴급 유상증자로 공격자 지분을 희석했습니다. 게임에서는 발행·주관·할인 비용을 방어 예산으로 지출합니다.'}
    if(a==='COUNTER_TAKEOVER'){t.stake=Math.max(0,t.stake-3);t.counter_stake=Number(t.counter_stake||0)+Math.min(12,budget/Math.max(1,d.companies.find(x=>x.id===t.attacker_company_id)?.valuation||1)*100);msg='공격 기업의 지분을 역으로 확보해 협상 압력을 높였습니다.'}
    t.stage=localTakeoverStage(t.stake);if(t.stake<10){localEvent(d,'DEFENSE','경영권 방어 성공',`${t.attacker_name}의 인수 시도를 사실상 무력화했습니다.`);c.last_takeover_end_cycle=Number(d.world?.cycle_no||0);d.control_case=null;c.parent_name=null}else{localEvent(d,'DEFENSE','긴급 이사회 방어조치',msg)}localIncomingSync(d);
  }
  localRevalue(d);saveLocalCompany(d);state.company=d;state.companyMode='LOCAL';return {message:msg};
}
function companyGrowth(c){return Number(c?.previous_revenue)>0?((Number(c.revenue)-Number(c.previous_revenue))/Number(c.previous_revenue))*100:0}
function companyProfitMargin(c){return Number(c?.revenue)>0?Number(c.profit)/Number(c.revenue)*100:0}
function companyDebtRatio(c){return Number(c?.valuation)>0?Number(c.debt)/Number(c.valuation)*100:0}
function holdingStakeValue(h={}){return Math.max(0,Number(h?.stake||0),Number(h?.percent||0),Number(h?.stake_pct||0),Number(h?.ownership_pct||0),Number(h?.holding_pct||0))}
function companyIncomingDirectStake(my=state.company?.my_company){return Math.max(0,Number(my?.incoming_stake||0),Number(my?.incoming_stake_pct||0),Number(my?.external_stake||0),Number(my?.outside_stake||0))}
function liveTakeoverStakeValue(live={}){return Math.max(0,Number(live?.stake||0),Number(live?.attacker_stake||0),Number(live?.current_stake||0),Number(live?.attacker_stake_pct||0),Number(live?.aggregate_stake||0))}



const KX_ECONOMIC_LEDGER_PREFIX='kx_economic_correction_v657';
function economicLedgerKey(companyId=(state.company?.my_company?.id||'guest')){return `${KX_ECONOMIC_LEDGER_PREFIX}_${companyId}`}
function loadEconomicLedger(companyId=(state.company?.my_company?.id||'guest')){
  try{const x=JSON.parse(localStorage.getItem(economicLedgerKey(companyId))||'{}')||{};return {cashOffset:Number(x.cashOffset||0)||0,marketShareOffsets:x.marketShareOffsets&&typeof x.marketShareOffsets==='object'?x.marketShareOffsets:{},companyStakeOffsets:x.companyStakeOffsets&&typeof x.companyStakeOffsets==='object'?x.companyStakeOffsets:{},lastUpdatedAt:Number(x.lastUpdatedAt||0)||0,migrated656cash:!!x.migrated656cash}}catch(_e){return {cashOffset:0,marketShareOffsets:{},companyStakeOffsets:{},lastUpdatedAt:0,migrated656cash:false}}
}
function saveEconomicLedger(x,companyId=(state.company?.my_company?.id||'guest')){try{localStorage.setItem(economicLedgerKey(companyId),JSON.stringify(x||{}))}catch(_e){}return x}
function commitEconomicFallback(p){
  if(!p)return false;const companyId=String(p.companyId||state.company?.my_company?.id||'guest'),ledger=loadEconomicLedger(companyId);
  ledger.cashOffset=Number(ledger.cashOffset||0)+Number(p.desiredCashDelta||0);
  if(p.assetType==='MARKET'&&p.ticker)ledger.marketShareOffsets[p.ticker]=Number(ledger.marketShareOffsets[p.ticker]||0)+Number(p.desiredShareDelta||0);
  if(p.assetType==='COMPANY'&&p.targetCompanyId){const key=String(p.targetCompanyId);ledger.companyStakeOffsets[key]=Number(ledger.companyStakeOffsets[key]||0)+Number(p.desiredStakeDelta||0);}
  ledger.lastUpdatedAt=Date.now();saveEconomicLedger(ledger,companyId);pendingEconomicTxn=null;applyEconomicCorrections(state.company);return true;
}
function rawMarketShares(data,ticker){const h=(data?.market_holdings||[]).find(x=>String(x.ticker)===String(ticker));return Math.max(0,Number(h?._raw_server_shares??h?.shares??0))}
function rawCompanyStake(data,targetId){const h=(data?.my_holdings||[]).find(x=>Number(x.target_company_id)===Number(targetId));return Math.max(0,Number(h?._raw_server_stake??h?.stake??0))}
function applyEconomicCorrections(data=state.company){
  const my=data?.my_company;if(!my)return data;
  const companyId=String(my.id||'guest'),ledger=loadEconomicLedger(companyId),rawCash=Math.max(0,Number(my.cash||0));
  if(!ledger.migrated656cash){const old=loadDefenseCashLedger(companyId);ledger.cashOffset=Number(ledger.cashOffset||0)+Number(old?.offset||0);ledger.migrated656cash=true;ledger.lastUpdatedAt=Date.now();saveEconomicLedger(ledger,companyId);}
  my._raw_server_cash=rawCash;
  for(const h of data.market_holdings||[]){h._raw_server_shares=Math.max(0,Number(h.shares||0));}
  for(const h of data.my_holdings||[]){h._raw_server_stake=Math.max(0,Number(h.stake||0));}
  const p=pendingEconomicTxn&&String(pendingEconomicTxn.companyId)===companyId?pendingEconomicTxn:null;
  if(p){
    const observedCashDelta=rawCash-Number(p.beforeRawCash||0);
    ledger.cashOffset=Number(ledger.cashOffset||0)+(Number(p.desiredCashDelta||0)-observedCashDelta);
    if(p.assetType==='MARKET'&&p.ticker){
      const afterRaw=rawMarketShares(data,p.ticker),observed=afterRaw-Number(p.beforeRawShares||0),need=Number(p.desiredShareDelta||0)-observed;
      ledger.marketShareOffsets[p.ticker]=Number(ledger.marketShareOffsets[p.ticker]||0)+need;
    }
    if(p.assetType==='COMPANY'&&p.targetCompanyId){
      const key=String(p.targetCompanyId),afterRaw=rawCompanyStake(data,p.targetCompanyId),observed=afterRaw-Number(p.beforeRawStake||0),need=Number(p.desiredStakeDelta||0)-observed;
      ledger.companyStakeOffsets[key]=Number(ledger.companyStakeOffsets[key]||0)+need;
    }
    ledger.lastUpdatedAt=Date.now();saveEconomicLedger(ledger,companyId);pendingEconomicTxn=null;
  }
  my.cash=Math.max(0,rawCash+Number(ledger.cashOffset||0));
  for(const h of data.market_holdings||[]){
    const off=Number(ledger.marketShareOffsets[String(h.ticker)]||0),rawShares=Number(h._raw_server_shares||0),px=Math.max(0,Number((state.stocks||[]).find(s=>s.ticker===h.ticker)?.last_price||0));
    h.shares=Math.max(0,rawShares+off);h.market_value=h.shares*px;h.pnl=(px-Number(h.avg_price||0))*h.shares;
  }
  data.market_holdings=(data.market_holdings||[]).filter(h=>Number(h.shares||0)>.000001);
  for(const h of data.my_holdings||[]){const off=Number(ledger.companyStakeOffsets[String(h.target_company_id)]||0),rawStake=Number(h._raw_server_stake||0);h.stake=Math.max(0,rawStake+off);const t=(data.companies||[]).find(c=>Number(c.id)===Number(h.target_company_id));h.market_value=Math.max(0,Number(t?.valuation||0))*h.stake/100;}
  data.my_holdings=(data.my_holdings||[]).filter(h=>Number(h.stake||0)>.00001);
  return data;
}

const TAKEOVER_DEFENSE_LEDGER_PREFIX='kx_takeover_defense_effect_v657';
function takeoverDefenseLedgerKey(companyId=(state.company?.my_company?.id||'guest')){return `${TAKEOVER_DEFENSE_LEDGER_PREFIX}_${companyId}`}
function loadTakeoverDefenseLedger(companyId=(state.company?.my_company?.id||'guest')){try{const x=JSON.parse(localStorage.getItem(takeoverDefenseLedgerKey(companyId))||'{}')||{};return {cases:x.cases&&typeof x.cases==='object'?x.cases:{},migrated656:!!x.migrated656}}catch(_e){return {cases:{},migrated656:false}}}
function saveTakeoverDefenseLedger(x,companyId=(state.company?.my_company?.id||'guest')){try{localStorage.setItem(takeoverDefenseLedgerKey(companyId),JSON.stringify(x||{}))}catch(_e){}return x}
function defenseExpectedStakeReduction(action,budget,valuation,currentStake=0){
  const a=String(action||'').toUpperCase(),ratio=Math.max(0,Number(budget||0))/Math.max(1,Number(valuation||1))*100;
  let effect=0;
  if(a==='BUYBACK')effect=Math.max(1.5,ratio*1.35);
  else if(a==='NEGOTIATE')effect=Math.max(2.5,ratio*1.70);
  else if(a==='WHITE_KNIGHT')effect=Math.max(3.5,4+ratio*.75);
  else if(a==='POISON_PILL')effect=Math.max(6,6+ratio*.55);
  else if(a==='RIGHTS_ISSUE')effect=Math.max(6,4+ratio*2.20);
  else if(a==='COUNTER_TAKEOVER')effect=Math.max(2.5,2+ratio*1.10);
  return Math.max(0,Math.min(Number(currentStake||100),effect));
}
function defenseShieldDays(action,budget,valuation){const ratio=Math.max(0,Number(budget||0))/Math.max(1,Number(valuation||1));let d=1;if(['WHITE_KNIGHT','RIGHTS_ISSUE'].includes(String(action)))d=2;if(String(action)==='POISON_PILL')d=3;if(ratio>=.04)d+=1;return d}

const DEFENSE_CASH_LEDGER_PREFIX='kx_defense_cash_spend_v656';
function defenseCashLedgerKey(companyId=(state.company?.my_company?.id||'guest')){return `${DEFENSE_CASH_LEDGER_PREFIX}_${companyId}`}
function loadDefenseCashLedger(companyId=(state.company?.my_company?.id||'guest')){
  try{const x=JSON.parse(localStorage.getItem(defenseCashLedgerKey(companyId))||'{}')||{};return {offset:Number(x.offset||0)||0,totalSpent:Number(x.totalSpent||0)||0,lastAction:String(x.lastAction||''),lastBudget:Number(x.lastBudget||0)||0,lastCorrectedAt:Number(x.lastCorrectedAt||0)||0}}catch(_e){return {offset:0,totalSpent:0,lastAction:'',lastBudget:0,lastCorrectedAt:0}}
}
function saveDefenseCashLedger(x,companyId=(state.company?.my_company?.id||'guest')){try{localStorage.setItem(defenseCashLedgerKey(companyId),JSON.stringify(x||{}))}catch(_e){}return x}
function applyDefenseCashSpendState(data=state.company){
  const my=data?.my_company;if(!my)return data;
  const companyId=String(my.id||'guest'),ledger=loadDefenseCashLedger(companyId),serverCash=Math.max(0,Number(my.cash||0));
  let displayCash=Math.max(0,serverCash+Number(ledger.offset||0));
  const pending=pendingDefenseCashSpend&&String(pendingDefenseCashSpend.companyId)===companyId?pendingDefenseCashSpend:null;
  if(pending){
    const target=Math.max(0,Number(pending.targetCash||0));
    // 방어 행동은 매각/대출과 달리 회사 돈을 쓰는 행동이다. 서버가 현금을 올려 보내더라도 화면/후속 계산은 최소한 승인 예산만큼 감소시킨다.
    displayCash=Math.min(displayCash,target);
    ledger.offset=displayCash-serverCash;
    ledger.totalSpent=Math.max(0,Number(ledger.totalSpent||0))+Math.max(0,Number(pending.budget||0));
    ledger.lastAction=String(pending.action||'');ledger.lastBudget=Math.max(0,Number(pending.budget||0));ledger.lastCorrectedAt=Date.now();
    saveDefenseCashLedger(ledger,companyId);pendingDefenseCashSpend=null;
  }
  my._server_cash_before_defense_correction=serverCash;
  my._defense_cash_offset=Number(ledger.offset||0);
  my._defense_cash_spent_total=Number(ledger.totalSpent||0);
  my.cash=Math.max(0,serverCash+Number(ledger.offset||0));
  return data;
}

const TAKEOVER_FAIRPLAY_PREFIX='kx_takeover_fairplay_v655';
function takeoverFairplayKey(companyId=(state.company?.my_company?.id||'guest')){return `${TAKEOVER_FAIRPLAY_PREFIX}_${companyId}`}
function loadTakeoverFairplayLedger(companyId=(state.company?.my_company?.id||'guest')){
  try{const x=JSON.parse(localStorage.getItem(takeoverFairplayKey(companyId))||'{}')||{};return {cases:x.cases&&typeof x.cases==='object'?x.cases:{},lastNotice:String(x.lastNotice||''),lastResetAt:Number(x.lastResetAt||0)||0,lastAcceptedDay:Number(x.lastAcceptedDay||0)||0,lastAcceptedCase:String(x.lastAcceptedCase||''),globalShieldUntilDay:Number(x.globalShieldUntilDay||0)||0,lastResolvedDay:Number(x.lastResolvedDay||0)||0,lastBlockedReason:String(x.lastBlockedReason||'')}}catch(_e){return {cases:{},lastNotice:'',lastResetAt:0,lastAcceptedDay:0,lastAcceptedCase:'',globalShieldUntilDay:0,lastResolvedDay:0,lastBlockedReason:''}}
}
function saveTakeoverFairplayLedger(x,companyId=(state.company?.my_company?.id||'guest')){try{localStorage.setItem(takeoverFairplayKey(companyId),JSON.stringify(x||{}))}catch(_e){}return x}
function takeoverGrowthTier(valuation=Number(state.company?.my_company?.valuation||0)){
  const v=Math.max(0,Number(valuation||0));
  if(v<100000000000)return {key:'STARTUP',label:'초기기업 보호',cap:5,hardShield:true,minDefense:20000000,startChance:0,cooldown:240,cooldownDays:999};
  if(v<500000000000)return {key:'GROWTH',label:'성장기업 보호',cap:12.5,hardShield:true,minDefense:30000000,startChance:.002,cooldown:192,cooldownDays:4};
  if(v<1000000000000)return {key:'PRE_TRILLION',label:'1조 미만 보호',cap:19.9,hardShield:true,minDefense:40000000,startChance:.0035,cooldown:144,cooldownDays:3};
  if(v<5000000000000)return {key:'MID',label:'중견기업',cap:35,hardShield:false,minDefense:60000000,startChance:.007,cooldown:96,cooldownDays:2};
  return {key:'OPEN',label:'경영권 경쟁 개방',cap:100,hardShield:false,minDefense:100000000,startChance:.012,cooldown:72,cooldownDays:1};
}
function takeoverCaseKey(live={}){return String(live?.id||`${Number(live?.attacker_company_id||0)}:${Number(live?.started_cycle||live?.start_cycle||0)}`)}
function rawIncomingMax(data=state.company){return Math.max(0,...(data?.incoming_holdings||[]).map(h=>holdingStakeValue(h)),companyIncomingDirectStake(data?.my_company))}
function rawLiveTakeoverStake(data=state.company){const live=data?.control_case;return live?Math.max(liveTakeoverStakeValue(live),rawIncomingMax(data)):rawIncomingMax(data)}
function takeoverProtectionStatus(data=state.company){
  const my=data?.my_company,tier=takeoverGrowthTier(my?.valuation),ledger=loadTakeoverFairplayLedger(my?.id||'guest'),live=data?.control_case,key=live?takeoverCaseKey(live):'';
  const c=key?ledger.cases[key]:null;const day=Math.max(1,Number(data?.talent_day||liveCompanyClock().day||1)||1);
  return {tier,active:tier.hardShield,caseKey:key,forgiven:Number(c?.forgiven||0)||0,shieldUntilDay:Number(c?.shieldUntilDay||0)||0,shielding:Number(c?.shieldUntilDay||0)>=day,resetApplied:!!c?.resetApplied};
}
function setStakeFields(obj,value){if(!obj)return;for(const k of ['stake','percent','stake_pct','ownership_pct','holding_pct','attacker_stake','current_stake','attacker_stake_pct','aggregate_stake']){if(k in obj)obj[k]=value}}
function applyTakeoverFairPlayState(data=state.company){
  const my=data?.my_company;if(!my)return data;
  const tier=takeoverGrowthTier(my.valuation),ledger=loadTakeoverFairplayLedger(my.id||'guest'),live=data?.control_case,day=Math.max(1,Number(data?.talent_day||liveCompanyClock().day||1)||1);
  if(!live){return data}
  const key=takeoverCaseKey(live),raw=Math.max(liveTakeoverStakeValue(live),rawIncomingMax(data)),isNewCase=!ledger.cases[key],rec=ledger.cases[key]||{forgiven:0,shieldUntilDay:0,resetApplied:false,cooldownSuppressed:false};
  const eligibility=takeoverAttackEligibility(data,live);
  if(!eligibility.allowed){
    rec.forgiven=Math.max(Number(rec.forgiven||0),raw);rec.resetApplied=true;rec.cooldownSuppressed=true;
    rec.shieldUntilDay=Math.max(Number(rec.shieldUntilDay||0),day+3);ledger.globalShieldUntilDay=Math.max(Number(ledger.globalShieldUntilDay||0),day+(Number(my.valuation||0)<1e12?7:4));
    ledger.lastBlockedReason=eligibility.reason;ledger.lastNotice=`경영권 공격 자동 차단: ${eligibility.reason}`;ledger.lastResetAt=Date.now();
    live.status='DEFENDED';live.stage='WATCH';live._blocked_reason=eligibility.reason;live._attack_evidence=eligibility.evidence?.label||'';
  }
  if(isNewCase&&eligibility.allowed){
    const tooSoon=Number(ledger.lastAcceptedDay||0)>0&&(day-Number(ledger.lastAcceptedDay||0))<Number(tier.cooldownDays||0);
    if(tier.startChance===0||tooSoon){rec.forgiven=Math.max(Number(rec.forgiven||0),raw);rec.shieldUntilDay=Math.max(Number(rec.shieldUntilDay||0),day+1);rec.resetApplied=true;rec.cooldownSuppressed=true;ledger.lastNotice=tier.startChance===0?`${tier.label}: 초기기업의 적대적 인수 시도를 자동 무효화`:`${tier.label}: 최근 공격 종료 후 보호기간이라 신규 공격을 자동 무효화`;}
    else{ledger.lastAcceptedDay=day;ledger.lastAcceptedCase=key;}
  }
  if(tier.hardShield&&!rec.resetApplied&&raw>=20){rec.forgiven=Math.max(Number(rec.forgiven||0),raw);rec.shieldUntilDay=day+3;rec.resetApplied=true;ledger.lastAcceptedDay=day;ledger.lastAcceptedCase=key;ledger.lastResetAt=Date.now();ledger.lastNotice=`${tier.label}: 기존 공격지분 ${raw.toFixed(2)}%를 정리하고 DAY ${rec.shieldUntilDay}까지 재공격 유예`;}

  const dledger=loadTakeoverDefenseLedger(my.id||'guest'),drec=dledger.cases[key]||{neutralized:0,shieldUntilDay:0,shieldAnchorRaw:raw,totalSpent:0,lastAction:'',lastReduction:0};
  if(!dledger.migrated656){const oldSpent=Math.max(0,Number(loadDefenseCashLedger(my.id||'guest')?.totalSpent||0));if(oldSpent>0){const legacyReduction=Math.min(raw,oldSpent/Math.max(1,Number(my.valuation||1))*100*1.85);drec.neutralized=Math.max(0,Number(drec.neutralized||0)+legacyReduction);drec.totalSpent=Math.max(Number(drec.totalSpent||0),oldSpent);drec.lastAction='LEGACY_DEFENSE';drec.lastReduction=legacyReduction;drec.shieldUntilDay=Math.max(Number(drec.shieldUntilDay||0),day+2);drec.shieldAnchorRaw=raw;}dledger.migrated656=true;}
  const pending=pendingDefenseStakeTxn&&String(pendingDefenseStakeTxn.companyId)===String(my.id||'guest')?pendingDefenseStakeTxn:null;
  if(pending&&(!pending.caseKey||pending.caseKey===key)){
    const observedReduction=Math.max(0,Number(pending.beforeRawStake||0)-raw),desired=Math.max(0,Number(pending.desiredReduction||0));
    const extra=Math.max(0,desired-observedReduction);
    drec.neutralized=Math.max(0,Number(drec.neutralized||0)+extra);
    drec.totalSpent=Math.max(0,Number(drec.totalSpent||0)+Number(pending.budget||0));
    drec.lastAction=String(pending.action||'');drec.lastReduction=desired;
    drec.shieldUntilDay=Math.max(Number(drec.shieldUntilDay||0),day+defenseShieldDays(pending.action,pending.budget,my.valuation));
    drec.shieldAnchorRaw=raw;pendingDefenseStakeTxn=null;
  }
  if(Number(drec.shieldUntilDay||0)>=day&&raw>Number(drec.shieldAnchorRaw||raw)){
    drec.neutralized=Math.max(0,Number(drec.neutralized||0)+(raw-Number(drec.shieldAnchorRaw||raw)));
    drec.shieldAnchorRaw=raw;
  }

  let effective=Math.max(0,raw-Number(rec.forgiven||0)-Number(drec.neutralized||0));
  if(!eligibility.allowed)effective=0;
  if(tier.hardShield)effective=Math.min(effective,tier.cap);
  if(Number(rec.shieldUntilDay||0)>=day||Number(ledger.globalShieldUntilDay||0)>=day)effective=0;
  if(effective<=5){live.status='DEFENDED';live.stage='WATCH';drec.shieldUntilDay=Math.max(Number(drec.shieldUntilDay||0),day+3);drec.shieldAnchorRaw=raw;ledger.lastResolvedDay=day;ledger.globalShieldUntilDay=Math.max(Number(ledger.globalShieldUntilDay||0),day+(Number(my.valuation||0)<1e12?7:5));}
  else{live.status=String(live.status||'ACTIVE').toUpperCase()==='DEFENDED'?'ACTIVE':live.status;live.stage=localTakeoverStage(effective)}
  setStakeFields(live,effective);live.aggregate_stake=effective;live._raw_stake=raw;live._fairplay_cap=tier.cap;live._growth_protection=tier.hardShield;live._forgiven_stake=Number(rec.forgiven||0);live._defense_neutralized=Number(drec.neutralized||0);live._defense_shield_until=Number(drec.shieldUntilDay||0);
  const aid=Number(live.attacker_company_id||0);
  for(const h of data.incoming_holdings||[]){if(!aid||Number(h?.holder_company_id||0)===aid){const hv=holdingStakeValue(h),adjusted=Math.max(0,Math.min(tier.hardShield?tier.cap:100,hv-Number(rec.forgiven||0)-Number(drec.neutralized||0)));setStakeFields(h,adjusted)}}
  if(my){for(const k of ['incoming_stake','incoming_stake_pct','external_stake','outside_stake']){if(k in my)my[k]=Math.min(tier.hardShield?tier.cap:100,Math.max(0,Number(my[k]||0)-Number(rec.forgiven||0)-Number(drec.neutralized||0)))}if(effective<50&&my.parent_name===live.attacker_name)my.parent_name=null;my.takeover_growth_protection=tier.key;my.takeover_growth_cap=tier.cap;}
  ledger.cases[key]=rec;saveTakeoverFairplayLedger(ledger,my.id||'guest');dledger.cases[key]=drec;saveTakeoverDefenseLedger(dledger,my.id||'guest');
  data.takeover_fairplay={tier:tier.key,label:tier.label,cap:tier.cap,raw_stake:raw,effective_stake:effective,forgiven:Number(rec.forgiven||0),defense_neutralized:Number(drec.neutralized||0),defense_shield_until:Number(drec.shieldUntilDay||0),defense_total_spent:Number(drec.totalSpent||0),shield_until_day:Math.max(Number(rec.shieldUntilDay||0),Number(ledger.globalShieldUntilDay||0)),global_shield_until_day:Number(ledger.globalShieldUntilDay||0),reset_applied:!!rec.resetApplied,attack_allowed:!!eligibility.allowed,attack_reason:eligibility.reason,attack_evidence:eligibility.evidence?.label||'',blocked_reason:live._blocked_reason||''};
  return data;
}
function takeoverDefenseMinimum(my=state.company?.my_company){return takeoverGrowthTier(my?.valuation).minDefense}
function takeoverProtectionNotice(data=state.company){
  const p=data?.takeover_fairplay;if(!p)return '';
  const day=Math.max(1,Number(data?.talent_day||liveCompanyClock().day||1)||1),shield=Number(p.shield_until_day||0)>=day;
  if(!p.reset_applied&&!shield&&!p.forgiven)return '';
  return `<section class="takeover-growth-protection"><div><small>GROWTH-STAGE CONTROL PROTECTION</small><b>${escapeHtml(p.label||'성장기 보호')}</b><span>${p.attack_allowed===false?`공격으로 인정하지 않았습니다. 이유: ${escapeHtml(p.blocked_reason||p.attack_reason||'공격 명분 없음')}`:shield?`기존에 과도하게 누적된 경영권 공격을 정리했습니다. DAY ${Number(p.shield_until_day)}까지 신규 적대적 인수는 실질 위협으로 누적되지 않습니다.`:`패치 이전 과도 누적분 ${Number(p.forgiven||0).toFixed(2)}%p를 영구 차감했습니다. 현재 기업가치 단계에서 단일 공격자의 유효 위협지분은 최대 ${Number(p.cap||0).toFixed(1)}%입니다.`}</span></div><em>서버 원시지분 ${Number(p.raw_stake||0).toFixed(2)}% → 게임상 실질 위험 ${Number(p.effective_stake||0).toFixed(2)}%${Number(p.defense_neutralized||0)>0?` · 방어로 무력화 ${Number(p.defense_neutralized||0).toFixed(2)}%p`:''}${Number(p.defense_total_spent||0)>0?` · 누적 방어비 ${formatKrwSmart(p.defense_total_spent)}`:''}${Number(p.global_shield_until_day||p.defense_shield_until||0)>=day?` · 재공격 차단 DAY ${Number(p.global_shield_until_day||p.defense_shield_until)}까지`:''}</em></section>`;
}

function companyStakeAgainstMe(){
  const live=state.company?.control_case,my=state.company?.my_company;
  const incoming=[...(state.company?.incoming_holdings||[])].filter(h=>holdingStakeValue(h)>0);
  const largestSingle=incoming.reduce((max,h)=>Math.max(max,holdingStakeValue(h)),0);
  const direct=companyIncomingDirectStake(my);
  let risk=Math.max(largestSingle,direct);
  if(live&&String(live.status||'ACTIVE').toUpperCase()!=='DEFENDED'){
    const gate=takeoverAttackEligibility(state.company,live);
    if(!gate.allowed)return 0;
    const aid=Number(live.attacker_company_id||0),holder=incoming.find(h=>Number(h?.holder_company_id||0)===aid);
    risk=Math.max(risk,liveTakeoverStakeValue(live),holdingStakeValue(holder));
  }else if(Number(my?.valuation||0)<5000000000000){
    const top=incoming.sort((a,b)=>holdingStakeValue(b)-holdingStakeValue(a))[0],reason=top?takeoverConcreteReason(state.company,top.holder_company_id):null;
    if(Number(my?.valuation||0)<1000000000000){if(!reason?.strong)return 0;}else if(!reason)return 0;
  }
  return Math.max(0,Math.min(100,risk));
}
function companyRankMap(){
  const rows=[...(state.company?.companies||[])].filter(c=>c&&c.status!=='INACTIVE').sort((a,b)=>Number(b.valuation||0)-Number(a.valuation||0)||Number(a.id||0)-Number(b.id||0));
  const map=new Map();rows.forEach((c,i)=>map.set(Number(c.id),i+1));return map;
}
function takeoverConcreteReason(data=state.company,attackerId){
  const my=data?.my_company;if(!my||!attackerId)return null;
  const aid=Number(attackerId),mid=Number(my.id),attacker=(data.companies||[]).find(c=>Number(c.id)===aid);
  const holdings=data.my_holdings||[];
  const touched=holdings.find(h=>Number(h.target_company_id)===aid&&Number(h.stake??h.percent??0)>=5);
  if(touched)return {code:'PLAYER_STAKE',label:`내 회사가 먼저 ${Number(touched.stake??touched.percent??0).toFixed(2)}% 지분을 확보`,strong:true};
  const critical=(data.press||[]).find(a=>Number(a.source_company_id)===mid&&Number(a.company_id)===aid&&String(a.news_tone||a.tone||'').toUpperCase()==='CRITICAL');
  if(critical)return {code:'CRITICAL_NEWS',label:'내 회사가 먼저 해당 기업을 겨냥한 비판 기사를 집행',strong:true};
  if(attacker){
    const sameSector=String(attacker.sector||'')===String(my.sector||'');
    const ratio=Number(attacker.valuation||0)/Math.max(1,Number(my.valuation||1));
    if(Number(my.valuation||0)>=1000000000000&&sameSector&&ratio>=.45&&ratio<=2.5)return {code:'SECTOR_RIVAL',label:`동종업계 직접 경쟁 · 기업가치 차이 ${ratio.toFixed(2)}배`,strong:false};
  }
  return null;
}
function companyRivalryReason(attackerId){return takeoverConcreteReason(state.company,attackerId)}
function localRivalryReason(d,attacker){
  const r=takeoverConcreteReason(d,Number(attacker?.id||0));
  return r?.label||null;
}
function takeoverAttackEligibility(data=state.company,live=data?.control_case){
  const my=data?.my_company,day=Math.max(1,Number(data?.talent_day||liveCompanyClock().day||1)||1),tier=takeoverGrowthTier(my?.valuation),ledger=loadTakeoverFairplayLedger(my?.id||'guest');
  if(!my||!live)return {allowed:false,reason:'진행 중인 공격이 없습니다.',evidence:null,tier,day,shieldUntil:Number(ledger.globalShieldUntilDay||0)};
  const evidence=takeoverConcreteReason(data,live.attacker_company_id),v=Number(my.valuation||0),shieldUntil=Number(ledger.globalShieldUntilDay||0);
  if(shieldUntil>=day)return {allowed:false,reason:`최근 방어 성공 보호기간 · DAY ${shieldUntil}까지 재공격 차단`,evidence,tier,day,shieldUntil};
  if(v<1000000000000&&!evidence?.strong)return {allowed:false,reason:'기업가치 1조 미만 보호 · 내가 먼저 지분매입/비판기사를 하지 않아 공격 명분 없음',evidence,tier,day,shieldUntil};
  if(v<5000000000000&&!evidence)return {allowed:false,reason:'중견 성장구간 보호 · 구체적인 경쟁/선제행동 근거가 없어 적대적 인수로 인정하지 않음',evidence,tier,day,shieldUntil};
  return {allowed:true,reason:evidence?.label||String(live.trigger_reason||'대형기업 공개 경영권 경쟁'),evidence,tier,day,shieldUntil};
}
function activeTakeoverThreat(){
  const live=state.company?.control_case;
  const myHoldings=state.company?.my_holdings||[];
  const incoming=[...(state.company?.incoming_holdings||[])].filter(h=>holdingStakeValue(h)>0).sort((a,b)=>holdingStakeValue(b)-holdingStakeValue(a));
  if(live&&String(live.status||'ACTIVE').toUpperCase()!=='DEFENDED'){
    const gate=takeoverAttackEligibility(state.company,live);if(!gate.allowed)return null;
    const rivalry=gate.evidence||companyRivalryReason(live.attacker_company_id)||(live.trigger_reason?{code:'SERVER',label:String(live.trigger_reason)}:null);
    const actualCounter=myHoldings.find(h=>Number(h.target_company_id)===Number(live.attacker_company_id));
    const holder=incoming.find(h=>Number(h?.holder_company_id||0)===Number(live.attacker_company_id));
    const liveStake=Math.max(liveTakeoverStakeValue(live),holdingStakeValue(holder));
    const aggregate=Math.max(companyStakeAgainstMe(),Number(live.aggregate_stake||0),liveStake);
    return {...live,synthetic:false,rivalry_reason:rivalry?.label||'서버에서 감지된 진행 중 경영권 공격',stake:liveStake||aggregate,aggregate_stake:aggregate,stage:live.stage||localTakeoverStage(aggregate),counter_stake:Math.max(Number(live.counter_stake||0),Number(actualCounter?.stake||0))};
  }
  const aggregate=companyStakeAgainstMe();
  // 단일 외부주주 15% 미만은 일반 투자로 보고 경영권 공격으로 취급하지 않는다.
  if(aggregate<15)return null;
  const top=incoming[0]||null;
  const attackerId=Number(top?.holder_company_id||0);
  const reason=attackerId?companyRivalryReason(attackerId):null;
  if(Number(state.company?.my_company?.valuation||0)<5000000000000&&!reason)return null;
  if(!reason&&aggregate<25)return null;
  const counter=myHoldings.find(h=>Number(h.target_company_id)===attackerId);
  const topStake=holdingStakeValue(top);
  return {synthetic:true,attacker_company_id:attackerId||null,attacker_name:top?.holder_name||'외부 주주군',attacker_ticker:top?.holder_ticker||'',attacker_country:top?.holder_country||top?.country||'',attacker_type:top?.holder_type||'외부 주주',rivalry_reason:reason?.label||(aggregate>=35?'외부지분이 경영권 위험구간까지 누적':'외부지분 집중으로 경영권 위험 상승'),stake:topStake||aggregate,aggregate_stake:aggregate,stage:localTakeoverStage(aggregate),cycles_left:null,counter_stake:Number(counter?.stake||0),used_poison_pill:false,used_rights_issue:false};
}
function scrollToTakeoverDefenseCenter(){
  const details=document.getElementById('takeoverOwnershipDetails');
  if(details)details.open=true;
  const target=document.getElementById('takeoverDefenseCenter')||document.getElementById('takeoverOwnershipDesk')||details;
  if(!target)return false;
  try{target.scrollIntoView({behavior:'smooth',block:'start'});}catch(_e){target.scrollIntoView();}
  target.classList?.add?.('defense-focus-flash');
  setTimeout(()=>target.classList?.remove?.('defense-focus-flash'),1400);
  return true;
}
function openTakeoverDefenseOverview(){
  state.tab='company';
  state.companySection='competition';
  state.companyAnalysisId=null;
  state.companyAnalysis=null;
  state.companyNotice='경영권 방어 현황을 열었습니다. 외부 지분과 방어 수단을 확인하세요.';
  renderTerminal(true);
  requestAnimationFrame(()=>setTimeout(()=>{
    if(!scrollToTakeoverDefenseCenter()){
      const msg=document.getElementById('companyMsg');
      if(msg)msg.textContent='경영권 현황 화면을 열었지만 표시할 외부 지분이 없습니다.';
    }
  },60));
}

function compactMoney(v){
  v=Number(v)||0;
  if(Math.abs(v)>=1000000000000)return `${(v/1000000000000).toFixed(1)}조`;
  if(Math.abs(v)>=100000000)return `${(v/100000000).toFixed(1)}억`;
  if(Math.abs(v)>=10000)return `${(v/10000).toFixed(1)}만`;
  return nf.format(Math.round(v));
}
function preciseCompactMoney(v,span=0){
  v=Number(v)||0;span=Math.abs(Number(span)||0);
  if(Math.abs(v)>=1000000000000){
    const digits=span<50000000000?2:1;
    return `${(v/1000000000000).toFixed(digits)}조`;
  }
  if(Math.abs(v)>=100000000){
    const digits=span<50000000?3:span<200000000?2:1;
    return `${(v/100000000).toFixed(digits)}억`;
  }
  if(Math.abs(v)>=10000){
    const digits=span<500000?2:span<5000000?1:0;
    return `${(v/10000).toFixed(digits)}만`;
  }
  return nf.format(Math.round(v));
}
function gameEvents(){return Array.isArray(state.game?.events)?state.game.events:[]}
function predictionFor(id){return (state.game?.predictions||[]).find(x=>Number(x.event_id)===Number(id))||null}
function eventTypeLabel(t){return ({EARNINGS:'실적발표',RUMOR:'루머 검증',SECTOR:'업종 이슈',CONTRACT:'수주·계약',MACRO:'거시경제'})[t]||'시장 이벤트'}
function eventChoiceLabels(e){
  if(e?.event_type==='EARNINGS')return ['컨센서스 상회','컨센서스 하회'];
  if(e?.event_type==='RUMOR')return ['사실 가능성 높음','과장·부인 가능성'];
  if(e?.event_type==='CONTRACT')return ['계약 성사','계약 무산'];
  if(e?.event_type==='SECTOR'||e?.event_type==='MACRO')return ['긍정 영향','부정 영향'];
  return ['긍정','부정'];
}
function ticksText(tick){
  const now=Number(state.clock?.tick_no)||0,n=Math.max(0,Number(tick)||0-now);
  if(n<=0)return '결과 발표 중';
  const sec=n*5;if(sec<60)return `약 ${sec}초 후`;return `약 ${Math.ceil(sec/60)}분 후`;
}
function shortEquity(){
  return (state.game?.shorts||[]).filter(x=>x.status==='OPEN').reduce((sum,x)=>{
    const st=state.stocks.find(s=>s.ticker===x.ticker),cur=Number(st?.last_price)||Number(x.entry_price)||0;
    const eq=(Number(x.margin)||0)+(Number(x.entry_price)-cur)*(Number(x.quantity)||0);
    return sum+Math.max(0,eq);
  },0);
}
function eventOutcomeClass(e){return e?.outcome==='POSITIVE'?'positive':e?.outcome==='NEGATIVE'?'negative':'neutral'}
function renderMarketGameStrip(){
  if(state.gameAvailable===false)return `<section class="market-game-strip unavailable" data-tour="strategy"><div><small>MARKET PLAY</small><b>시장 이벤트 기능 설치 필요</b><span>기존 주식 거래는 정상 사용 가능합니다.</span></div><button data-main-tab="strategy">전략실 보기</button></section>`;
  const open=gameEvents().filter(e=>e.status==='OPEN').sort((a,b)=>Number(a.reveal_tick)-Number(b.reveal_tick));
  const next=open[0],stats=state.game?.prediction_stats||{};
  return `<section class="market-game-strip" data-tour="strategy"><div class="market-game-copy"><small>MARKET PLAY</small><b>${next?escapeHtml(next.title):'새 시장 이벤트 준비 중'}</b><span>${next?`${eventTypeLabel(next.event_type)} · ${ticksText(next.reveal_tick)}`:'실적·루머·배당·IPO가 시장 흐름을 만듭니다.'}</span></div><div class="market-game-stats"><span>진행 이벤트 <b>${open.length}</b></span><span>판단 적중 <b>${Number(stats.correct)||0}/${Number(stats.total)||0}</b></span><span>공매도 <b>${(state.game?.shorts||[]).filter(x=>x.status==='OPEN').length}</b></span></div><button data-main-tab="strategy">전략실 열기</button></section>`;
}
function renderStrategyRoom(){
  const g=state.game||emptyGame();
  if(state.gameAvailable===false)return `<main class="page-view strategy-page"><section class="panel page-panel strategy-panel"><div class="page-title"><div><small>MARKET PLAY</small><h1>전략실</h1></div><span>실적·루머·공매도·IPO·배당을 한곳에서 관리합니다</span></div><div class="game-install-note"><h2>게임 확장 SQL을 먼저 한 번 실행해 주세요</h2><p>${escapeHtml(state.gameError||'Supabase에 KX 게임 확장 함수가 아직 없습니다.')}</p><span>SQL을 설치하지 않아도 기존 매수·매도·은행 기능은 그대로 작동합니다.</span></div></section></main>`;
  const events=[...(g.events||[])].sort((a,b)=>a.status===b.status?Number(a.reveal_tick)-Number(b.reveal_tick):(a.status==='OPEN'?-1:1));
  const open=events.filter(e=>e.status==='OPEN'),resolved=events.filter(e=>e.status==='REVEALED').slice(0,5);
  const shorts=(g.shorts||[]).filter(x=>x.status==='OPEN');
  const stats=g.prediction_stats||{total:0,correct:0};
  const acc=Number(stats.total)>0?Number(stats.correct)/Number(stats.total)*100:0;
  return `<main class="page-view strategy-page"><section class="panel page-panel strategy-panel">
    <div class="page-title strategy-title"><div><small>KX MARKET PLAY</small><h1>전략실</h1></div><span>정보를 읽고 판단한 뒤 실제 거래 결과로 승부합니다</span></div>
    <div class="strategy-summary"><article><small>진행 중 이벤트</small><b>${open.length}</b><span>실적·루머·계약·업종 이슈</span></article><article><small>내 판단 기록</small><b>${Number(stats.total)||0}회</b><span>${Number(stats.total)?`적중률 ${acc.toFixed(0)}%`:'결과 예측을 남겨보세요'}</span></article><article><small>공매도 포지션</small><b>${shorts.length}</b><span>하락장에서도 전략 선택 가능</span></article><article><small>공매도 평가액</small><b>${won(shortEquity())}</b><span>담보 + 현재 평가손익</span></article></div>
    <section class="strategy-section event-board"><div class="strategy-section-head"><div><small>01 · EVENT DESK</small><h2>예고된 시장 이벤트</h2></div><span>결과가 나오기 전에는 정답을 보여주지 않습니다</span></div>
      <div class="event-card-grid">${open.length?open.map(e=>renderEventCard(e,false)).join(''):`<div class="strategy-empty">다음 이벤트를 준비 중입니다. 시장 동기화 후 자동으로 새 이벤트가 생성됩니다.</div>`}</div>
      ${resolved.length?`<details class="resolved-events"><summary>최근 결과 ${resolved.length}개 보기</summary><div class="event-card-grid resolved">${resolved.map(e=>renderEventCard(e,true)).join('')}</div></details>`:''}
    </section>
    <section class="strategy-section"><div class="strategy-section-head"><div><small>02 · SHORT DESK</small><h2>간이 공매도</h2></div><span>주가가 하락하면 이익, 상승하면 손실 · 담보 50%</span></div>${renderShortDesk()}</section>
    <section class="strategy-section split"><div class="strategy-sub"><div class="strategy-section-head"><div><small>03 · IPO</small><h2>신규상장 청약</h2></div><span>상장 전 가격에 소량 청약</span></div>${renderIpoDesk()}</div><div class="strategy-sub"><div class="strategy-section-head"><div><small>04 · DIVIDEND</small><h2>배당 캘린더</h2></div><span>기준일 보유 수량에 따라 현금 지급</span></div>${renderDividendDesk()}</div></section>
    <div class="strategy-footnote"><b>게임의 핵심</b><span>정답 맞히기 포인트나 레벨을 올리는 구조가 아닙니다. 이벤트 전에 직접 판단하고 주식을 사거나 팔거나 공매도한 뒤, 실제 자산 변화로 결과를 확인하는 방식입니다.</span></div>
  </section></main>`;
}
function renderEventCard(e,resolved=false){
  const pred=predictionFor(e.id),labels=eventChoiceLabels(e),ticker=e.ticker?`${escapeHtml(e.ticker)} · `:'';
  const predResult=resolved&&pred?(pred.choice===e.outcome?'적중':'빗나감'):'';
  return `<article class="market-event-card ${resolved?'resolved':''} ${resolved?eventOutcomeClass(e):''}"><div class="event-card-top"><span>${eventTypeLabel(e.event_type)}</span><time>${resolved?'결과 발표 완료':ticksText(e.reveal_tick)}</time></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.teaser||'')}</p>${e.consensus_text?`<div class="event-consensus"><small>시장 예상</small><b>${escapeHtml(e.consensus_text)}</b></div>`:''}${resolved?`<div class="event-result"><small>실제 결과</small><b>${escapeHtml(e.result_text||'결과 공개')}</b><span class="${e.outcome==='POSITIVE'?'up':'down'}">초기 시장 충격 ${Number(e.impact_pct)>0?'+':''}${(Number(e.impact_pct)*100).toFixed(1)}%</span></div>`:`<div class="event-predict"><small>${ticker}내 판단을 기록합니다 · 거래는 시장 화면에서 직접</small><div><button data-event-predict="${e.id}" data-choice="POSITIVE" class="${pred?.choice==='POSITIVE'?'on':''}">${labels[0]}</button><button data-event-predict="${e.id}" data-choice="NEGATIVE" class="${pred?.choice==='NEGATIVE'?'on':''}">${labels[1]}</button></div></div>`}${resolved&&pred?`<div class="prediction-result ${predResult==='적중'?'hit':'miss'}">내 예상: ${pred.choice==='POSITIVE'?labels[0]:labels[1]} · <b>${predResult}</b></div>`:''}</article>`;
}
function renderShortDesk(){
  const open=(state.game?.shorts||[]).filter(x=>x.status==='OPEN');
  const opts=state.stocks.filter(stockVisible).map(s=>`<option value="${s.ticker}">${escapeHtml(s.name)} · ${s.ticker} · ${nf.format(s.last_price)}원</option>`).join('');
  return `<div class="short-desk"><div class="short-order"><label>공매도할 종목<select id="shortTicker">${opts}</select></label><label>수량<input id="shortQty" type="number" min="1" max="100" value="1"></label><div class="short-rule"><b>간이 규칙</b><span>현재가 기준 거래금액의 50%를 담보로 맡깁니다.</span><span>가격이 오르면 손실이 커지며 담보가 모두 소진되면 자동 청산됩니다.</span></div><button id="openShort">공매도 포지션 열기</button><p id="shortMsg"></p></div><div class="short-positions">${open.length?open.map(x=>{const st=state.stocks.find(s=>s.ticker===x.ticker),cur=Number(st?.last_price)||Number(x.entry_price),pnl=(Number(x.entry_price)-cur)*Number(x.quantity);return `<article><div><small>${escapeHtml(st?.name||x.ticker)}</small><b>${nf.format(x.quantity)}주 공매도</b></div><dl><span>진입가 <b>${nf.format(x.entry_price)}</b></span><span>현재가 <b>${nf.format(cur)}</b></span><span>평가손익 <b class="${pnl>=0?'up':'down'}">${pnl>=0?'+':''}${won(pnl)}</b></span><span>담보 <b>${won(x.margin)}</b></span></dl><button data-short-close="${x.id}">포지션 청산</button></article>`}).join(''):`<div class="strategy-empty compact">열려 있는 공매도 포지션이 없습니다.</div>`}</div></div>`;
}
function renderIpoDesk(){
  const ipos=state.game?.ipos||[],subs=state.game?.subscriptions||[];
  if(!ipos.length)return `<div class="strategy-empty compact">현재 청약 가능한 신규상장이 없습니다.</div>`;
  return `<div class="ipo-list">${ipos.map(i=>{const sub=subs.find(s=>s.ticker===i.ticker),now=Number(state.clock?.tick_no)||0,open=now<Number(i.subscription_deadline_tick)&&i.status==='OPEN';return `<article class="ipo-card"><div><span>${escapeHtml(i.sector||'신규상장')}</span><time>${now<Number(i.listing_tick)?ticksText(i.listing_tick):'상장 완료'}</time></div><h3>${escapeHtml(i.name)}</h3><dl><span>공모가 <b>${won(i.offer_price)}</b></span><span>예상 배정률 <b>${Math.round(Number(i.allocation_ratio||1)*100)}%</b></span><span>최대 청약 <b>${nf.format(i.max_qty)}주</b></span></dl>${sub?`<div class="ipo-sub-state"><b>${nf.format(sub.requested_qty)}주 청약</b><span>${sub.status==='SUBSCRIBED'?'배정 대기':sub.status==='ALLOCATED'?`${nf.format(sub.allocated_qty)}주 배정 완료`:'청약 취소'}</span></div>`:open?`<div class="ipo-actions"><input id="ipoQty_${i.ticker}" type="number" min="1" max="${i.max_qty}" value="1"><button data-ipo-subscribe="${i.ticker}">청약</button></div>`:`<div class="ipo-sub-state"><b>청약 마감</b><span>상장 결과를 기다리는 중</span></div>`}</article>`}).join('')}</div>`;
}
function renderDividendDesk(){
  const rows=state.game?.dividends||[];
  if(!rows.length)return `<div class="strategy-empty compact">예정된 배당 일정이 없습니다.</div>`;
  return `<div class="dividend-list">${rows.map(d=>{const st=state.stocks.find(s=>s.ticker===d.ticker);return `<article><div><small>${escapeHtml(st?.name||d.ticker)}</small><b>주당 ${won(d.per_share)}</b></div><span>기준일 ${ticksText(d.record_tick)}</span><span>지급 ${ticksText(d.pay_tick)}</span>${d.my_qty?`<em>내 기준수량 ${nf.format(d.my_qty)}주 · 예상 ${won(Number(d.my_qty)*Number(d.per_share))}</em>`:''}</article>`}).join('')}</div>`;
}
let syncBusy=false,syncRound=0,marketSyncTimer=null;

function save(){localStorage.setItem(LS,JSON.stringify(session||{}))}
function logout(){localStorage.removeItem(LS);session=null;renderAuth()}
async function refresh(){
  if(!session?.refresh_token)return false;
  const previousUser=session?.user||null;
  try{
    const d=await req('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token}),auth:false});
    session={...d,user:d?.user||previousUser};save();return !!session?.access_token;
  }catch{return false}
}
async function validate(){
  if(!session?.access_token)return false;
  const expiresAt=Number(session?.expires_at||0)*1000;
  if(expiresAt&&Date.now()>=expiresAt-45000)return await refresh();
  if(session?.user?.id)return true;
  // /auth/v1/user를 별도로 호출하지 않는다. 이 확인 요청 자체가 오래된 세션에서
  // 403을 콘솔에 남겼다. JWT의 sub는 화면 식별에만 쓰고 실제 권한은 RPC가 검증한다.
  try{
    const part=String(session.access_token).split('.')[1];
    const raw=atob(part.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(part.length/4)*4,'='));
    const payload=JSON.parse(raw);
    if(payload?.sub){session.user={...(session.user||{}),id:payload.sub,email:payload.email||session.user?.email};save();return true}
  }catch{}
  return await refresh();
}

function renderDiag(){
  app.innerHTML=`<div class="diag"><div><h1>KX CORPORATE 설정 필요</h1><p>Supabase 환경변수가 비어 있어 시장에 연결할 수 없습니다.</p><code>NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_ANON_KEY</code><p>Render Environment에 두 값을 넣고 다시 배포해 주세요.</p></div></div>`;
}

function renderAuth(){
  app.innerHTML=`<main class="auth"><form class="auth-card" id="authForm">
    <div class="kxlogo">KX</div>
    <h1>KX CORPORATE</h1>
    <p>회사를 설립하고 국내·글로벌 기업과 경쟁하는 경영·주식시장 시뮬레이션</p>
    <div class="auth-tabs"><button type="button" class="on" data-mode="login">로그인</button><button type="button" data-mode="signup">회원가입</button></div>
    <label id="nickWrap" style="display:none">닉네임<input id="nickname" maxlength="18"></label>
    <label>이메일<input id="email" type="email" required></label>
    <label>비밀번호<input id="password" type="password" minlength="6" required></label>
    <button class="primary" id="authSubmit">경영 시작</button>
    <small class="auth-msg" id="authMsg"></small>
  </form></main>`;
  let mode='login';
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
    mode=b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('on',x===b));
    document.getElementById('nickWrap').style.display=mode==='signup'?'grid':'none';
    document.getElementById('authSubmit').textContent=mode==='signup'?'계정 만들기':'경영 시작';
  });
  document.getElementById('authForm').onsubmit=async e=>{
    e.preventDefault();
    const msg=document.getElementById('authMsg'),btn=document.getElementById('authSubmit');
    btn.disabled=true;msg.textContent='';
    try{
      const email=document.getElementById('email').value.trim();
      const password=document.getElementById('password').value;
      if(mode==='signup'){
        const nickname=document.getElementById('nickname').value.trim();
        if(!nickname){msg.textContent='닉네임을 입력해 주세요.';return}
        if(password.length<6){msg.textContent='비밀번호는 최소 6자 이상 입력해 주세요.';return}
        const d=await req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password,data:{nickname}}),auth:false});
        if(d.access_token){session=d;save();await start()}
        else if(d.user||d.id){msg.textContent='가입 완료. 이메일 인증 후 로그인해 주세요.'}
        else{msg.textContent='가입 요청이 완료되었습니다. 이메일 인증 후 로그인해 주세요.'}
      }else{
        const d=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password}),auth:false});
        session=d;save();await start();
      }
    }catch(err){msg.textContent=authErrorText(err)}
    finally{btn.disabled=false}
  };
}

function applyPublicSnapshot(d){
  if(!d)return;
  state.stocks=d.stocks||[];
  state.clock=d.clock||null;
  if(!state.stocks.find(s=>s.ticker===state.ticker)&&state.stocks[0])state.ticker=state.stocks[0].ticker;
  state.candles=d.candles||[];
  state.depth=d.depth||[];
  state.trades=d.trades||[];
  if(Array.isArray(d.news)){processIncomingNews(d.news);state.news=d.news;}
  if(Array.isArray(d.ranking))state.ranking=d.ranking;
}
async function loadPublicSnapshot(includeAux=false,advance=false){
  const d=advance
    ?await rpc('kx_sync_market',{p_ticker:state.ticker,p_include_aux:includeAux})
    :await rpc('kx_public_snapshot',{p_ticker:state.ticker,p_include_aux:includeAux},false);
  applyPublicSnapshot(d);
}
async function loadPrivateSnapshot(){
  const d=await rpc('kx_private_snapshot',{});
  state.account=d?.account||{cash:0,realized_pnl:0};
  state.positions=d?.positions||[];
  state.orders=d?.orders||[];
  state.bankDeposits=d?.bank_deposits||[];
  state.bankLoans=d?.bank_loans||[];
  state.bankMeta=d?.bank_meta||{};
}
async function loadGameLayer(runSync=false,force=false){
  if(state.gameAvailable===false&&!force)return;
  try{
    // 회사 경영 버전에서는 기존 보조 게임 레이어가 시장 뉴스를 새로 생성하지 않습니다.
    // 오래된 kx_news 스키마와 kx_game_sync가 충돌해도 회사 경영에는 영향을 주지 않도록 조회 전용으로 유지합니다.
    const d=await rpc('kx_game_snapshot',{});
    state.game=d&&typeof d==='object'?{...emptyGame(),...d}:emptyGame();
    state.gameAvailable=true;state.gameError='';
  }catch(e){
    const raw=String(e?.message||'');
    if(e?.status===404||raw.includes('kx_game_')||raw.includes('Could not find the function')){
      state.gameAvailable=false;state.gameError='';
    }else{
      state.gameAvailable=false;state.gameError='';
    }
  }
}
function missingRpcError(e){
  const raw=String(e?.message||'');
  return e?.status===404||raw.includes('Could not find the function')||raw.includes('schema cache')||raw.includes('PGRST202');
}
async function loadCompanyLayer(runSync=false,force=false){
  // V5.6: PING is only used at boot/recovery. Normal market refresh uses a single RPC.
  if(state.companyRpcMode==='BROKEN'&&!force)return;
  try{
    if(!companyApiReady||force&&state.companyRpcMode==='BROKEN'){
      const ping=await companyApi('PING',{},false);
      if(!ping?.ok)throw new Error('회사 API 응답을 확인할 수 없습니다.');
      companyApiReady=true;state.companyRpcMode='V56';
    }
    const action=runSync?'SYNC':'SNAPSHOT';
    let d=await companyApi(action,{});
    if(d?.needs_login&&await refresh())d=await companyApi(action,{});
    if(d?.needs_login){
      state.companyAvailable=false;state.companyMode='REMOTE';state.company=emptyCompany();
      state.companyError='로그인 세션이 만료되었습니다. 로그아웃 후 다시 로그인해 주세요.';return;
    }
    if(!d||typeof d!=='object'||d.ok===false)throw new Error(d?.message||'회사 데이터를 불러오지 못했습니다.');
    state.companyRpcMode='V60';state.company={...emptyCompany(),...d};applyBotBusinessStrategies(state.company);applySharedCompanyMarketDifferentiation(state.company);buildSharedCorporateWar(state.company);applyEconomicCorrections(state.company);applyTakeoverFairPlayState(state.company);
    try{
      const realism=await companyRealismApi('SNAPSHOT',{});
      if(realism?.ok){
        state.company.products=Array.isArray(realism.products)?realism.products:[];
        state.company.finance_periods=Array.isArray(realism.finance_periods)?realism.finance_periods:[];
        state.company.incidents=Array.isArray(realism.incidents)?realism.incidents:[];
        state.company.due_diligence=Array.isArray(realism.due_diligence)?realism.due_diligence:[];
        state.company.macro=realism.macro||{};state.company.supply=realism.supply||{};state.company.finance_live=realism.finance_live||{};
        state.company.realism_available=true;state.company.realism_error='';
      }
      try{
        const talent=await companyTalentApi('SNAPSHOT',{});
        if(talent?.ok){state.company.recruit_pool=shapeRecruitPoolByEmployer(Array.isArray(talent.candidates)?talent.candidates:[],state.company.my_company,Number(talent.day_no||1));state.company.talents=Array.isArray(talent.my_talents)?talent.my_talents:[];state.company.poach_targets=shapePoachTargetCompensation(Array.isArray(talent.poach_targets)?talent.poach_targets:[]);state.company.talent_offers=Array.isArray(talent.inbound_offers)?talent.inbound_offers:[];state.company.talent_summary=talent.summary||{};state.company.talent_day=Number(talent.day_no||1);state.company.talent_hired_today=Number(talent.hired_today||0);state.company.talent_daily_limit=Number(talent.daily_limit||5);state.company.talent_available=true;state.company.talent_error='';applyLocalPoachState(state.company);applyLocalHireProfiles(state.company);applyLocalTalentTrainingState(state.company);}
      }catch(talentErr){state.company.talent_available=false;state.company.talent_error=missingRpcError(talentErr)?'V6.4 인재·육성 SQL이 아직 적용되지 않았습니다.':'인재시장 데이터를 불러오지 못했습니다: '+String(talentErr?.message||talentErr);}
    }catch(realismErr){
      state.company.realism_available=false;
      state.company.realism_error=missingRpcError(realismErr)?'V6.2 현실경영 SQL이 아직 적용되지 않았습니다.':'현실경영 데이터를 불러오지 못했습니다: '+String(realismErr?.message||realismErr);
    }
    state.companyAvailable=true;state.companyMode='REMOTE';state.companyError='';
    if(d?.world?.server_time){const t=Date.parse(d.world.server_time);if(Number.isFinite(t))companyServerOffsetMs=t-Date.now();}
    companyLastFetchAt=Date.now();if(runSync)companyLastAdvanceAt=companyLastFetchAt;
    syncCompanyClockAnchor(state.company?.world,state.clock);
    processCompanyIncome(state.company?.investment_income||[]);
    processCompanyPress(state.company?.press||[]);
    trackCompanySnapshotMoments();
    if(state.companyAnalysisId){
      try{const profile=await companyApi('PROFILE',{p_company_id:Number(state.companyAnalysisId)});try{const rp=await companyRealismApi('PROFILE',{p_company_id:Number(state.companyAnalysisId)});profile.realism_products=Array.isArray(rp?.products)?rp.products:[]}catch(_re){}state.companyAnalysis=alignCompanyProfileToSharedMarket(profile);}catch(_e){}
    }
  }catch(e){
    const raw=String(e?.message||'');
    state.companyAvailable=false;state.companyMode='REMOTE';state.company=emptyCompany();
    if(missingRpcError(e)){
      state.companyRpcMode='BROKEN';companyApiReady=false;
      state.companyError='기본 회사 API(kx_company_api_v1)가 없습니다. 기존 설치라면 V6.1.2 기본 SQL 적용 여부를 먼저 확인한 뒤 RUN_THIS_IN_SUPABASE_V6.2.sql을 실행해 주세요.';
    }else{
      state.companyRpcMode='V56';state.companyError=raw||'온라인 회사 서버에 연결하지 못했습니다.';
    }
  }
}

async function sync(advance=false,full=false,forcePrivate=false){
  if(syncBusy)return;
  syncBusy=true;
  try{
    if(advance)syncRound++;
    const includeAux=full||syncRound%4===0;
    await loadPublicSnapshot(includeAux,advance);
    if(full||forcePrivate||syncRound%2===0)await loadPrivateSnapshot();
    if(full||syncRound%2===0)await loadGameLayer(advance||full,full);
    const companyDue=full||Date.now()-companyLastAdvanceAt>=COMPANY_SERVER_SYNC_MS;
    let companyUpdated=false;
    if(companyDue){await loadCompanyLayer(true,full);companyUpdated=true;}
    else if(forcePrivate&&state.tab==='company'&&Date.now()-companyLastFetchAt>=4000){await loadCompanyLayer(false,false);companyUpdated=true;}
    const editingCompanyForm=companyFormIsBeingEdited();
    rememberCompanyDraft();
    const needsRender=state.tab!=='company'||full||forcePrivate||companyUpdated;
    if(needsRender&&!editingCompanyForm&&!uiIsBusy())renderTerminal(true);
    else{updateLiveCompanyClock();updateCompanyVisualQuotes();}
  }catch(e){
    console.error(e);
    const el=document.getElementById('globalMsg');
    if(el)el.textContent='동기화 오류: '+e.message;
  }finally{syncBusy=false}
}

function selected(){return state.stocks.find(s=>s.ticker===state.ticker)}
function stockAssets(){
  return state.positions.reduce((sum,p)=>{
    const current=Number(state.stocks.find(s=>s.ticker===p.ticker)?.last_price)||0;
    return sum+Number(p.quantity)*current;
  },0);
}
function bankAssets(){return state.bankDeposits.filter(x=>['ACTIVE','MATURED'].includes(x.status)).reduce((a,x)=>a+Number(x.balance||0),0)}
function bankDebt(){return state.bankLoans.filter(x=>x.status==='ACTIVE').reduce((a,x)=>a+Number(x.outstanding||0)+Number(x.accrued_interest||0),0)}
function totalAssets(){return Number(state.account?.cash||0)+stockAssets()+bankAssets()+shortEquity()-bankDebt()}
function changeOf(stock){return ((Number(stock.last_price)-Number(stock.prev_close))/Math.max(1,Number(stock.prev_close)))*100}
function positionFor(ticker){return state.positions.find(p=>p.ticker===ticker)||null}
function positionMetrics(s,qty=0,exitPrice=null){
  const p=positionFor(s?.ticker);
  const held=Math.max(0,Number(p?.quantity)||0),avg=Math.max(0,Number(p?.avg_price)||0),cur=Math.max(0,Number(s?.last_price)||0);
  const evalPnl=held>0?(cur-avg)*held:0;
  const evalReturn=held>0&&avg>0?((cur-avg)/avg)*100:0;
  const sellQty=Math.min(Math.max(0,Number(qty)||0),held),px=Math.max(0,Number(exitPrice)||cur);
  const realizedPnl=sellQty>0?(px-avg)*sellQty:0;
  const realizedReturn=sellQty>0&&avg>0?((px-avg)/avg)*100:0;
  return {held,avg,cur,evalPnl,evalReturn,sellQty,realizedPnl,realizedReturn,remaining:Math.max(0,held-sellQty)};
}

function marketArea(s){return s?.market_area||'국내'}
function marketCountry(s){return s?.market_country||'한국'}
function localCurrency(s){return s?.local_currency||'KRW'}
function localPriceValue(s){const fx=Math.max(.000001,Number(s?.fx_to_krw)||1);return (Number(s?.last_price)||0)/fx}
function localPriceText(s){
  const cur=localCurrency(s),v=localPriceValue(s);
  if(cur==='KRW')return `${nf.format(Math.round(v))}원`;
  if(cur==='USD')return `$${v.toFixed(2)}`;
  if(cur==='EUR')return `€${v.toFixed(2)}`;
  if(cur==='JPY')return `¥${nf.format(Math.round(v))}`;
  return `${v.toFixed(2)} ${cur}`;
}
function stockMarketBadge(s){return `<span class="market-badge ${marketArea(s)==='해외'?'foreign':'domestic'}">${marketArea(s)} · ${escapeHtml(marketCountry(s))}</span>`}
function stockVisible(s){return !s?.listing_tick||Number(state.clock?.tick_no||0)>=Number(s.listing_tick)}

function stockFavoriteKey(){return `kx_stock_favorites_v1_${session?.user?.id||'guest'}`}
function stockFavoriteSet(){try{return new Set(JSON.parse(localStorage.getItem(stockFavoriteKey())||'[]'))}catch{return new Set()}}
function isStockFavorite(ticker){return stockFavoriteSet().has(String(ticker||''))}
function toggleStockFavorite(ticker){
  const key=stockFavoriteKey(),set=stockFavoriteSet(),t=String(ticker||'');if(!t)return false;
  if(set.has(t))set.delete(t);else set.add(t);
  localStorage.setItem(key,JSON.stringify([...set]));return set.has(t);
}
function stockMatchesMarketFilter(x){
  const f=state.marketFilter||'ALL',country=marketCountry(x),area=marketArea(x);
  if(f==='ALL')return true;
  if(f==='국내')return area==='국내'||['대한민국','한국','KR'].includes(country);
  if(f==='미국')return ['미국','USA','US','United States'].includes(country);
  if(f==='중국')return ['중국','CN','China'].includes(country);
  if(f==='일본')return ['일본','JP','Japan'].includes(country);
  if(f==='유럽')return ['독일','영국','프랑스','이탈리아','스페인','네덜란드','유럽','DE','GB','UK','FR','EU','Germany','United Kingdom','France'].includes(country);
  if(f==='해외')return area==='해외';
  return true;
}

function topNav(){
  const items=[
    ['company','경영','dashboard'],
    ['company','사업','operations'],
    ['company','조직','people'],
    ['company','경쟁','competition'],
    ['company','리스크','risk'],
    ['ranking','순위','']
  ];
  return `<nav class="main-nav management-nav compact-management-nav">${items.map(([k,label,section])=>`<button data-main-tab="${k}" ${section?`data-company-section-nav="${section}"`:''} class="${state.tab===k&&(!section||state.companySection===section)?'on':''}">${label}</button>`).join('')}</nav>`;
}

function renderStockPicker(s){
  const filtered=state.stocks.filter(stockVisible).filter(stockMatchesMarketFilter);
  const pool=filtered.length?filtered:state.stocks.filter(stockVisible);
  const favSet=stockFavoriteSet();
  const favorites=[...pool].filter(x=>favSet.has(x.ticker)).sort((a,b)=>String(a.name).localeCompare(String(b.name),'ko'));
  const sorted=[...pool].filter(x=>!favSet.has(x.ticker)).sort((a,b)=>Math.abs(changeOf(b))-Math.abs(changeOf(a)));
  const normal=[...(pool.some(x=>x.ticker===s.ticker)&&!favSet.has(s.ticker)?[s]:[]),...sorted.filter(x=>x.ticker!==s.ticker)].slice(0,10);
  const selectRows=[...favorites,...pool.filter(x=>!favSet.has(x.ticker))];
  const row=x=>{const c=changeOf(x),fav=favSet.has(x.ticker);return `<article class="watch-row-shell ${x.ticker===s.ticker?'on':''}"><button data-ticker="${x.ticker}" class="watch-row-main"><span><b>${escapeHtml(x.name)}</b><small>${escapeHtml(marketCountry(x))} · ${escapeHtml(x.sector)}</small></span><strong>${nf.format(x.last_price)}</strong><em class="${c>=0?'up':'down'}">${pct(c)}</em>${marketArea(x)==='해외'?`<small class="local-quote">${localPriceText(x)}</small>`:''}</button><button type="button" class="stock-favorite-btn ${fav?'on':''}" data-stock-favorite="${x.ticker}" title="${fav?'즐겨찾기 해제':'즐겨찾기'}">${fav?'★':'☆'}</button></article>`};
  return `<aside class="watchlist-panel">
    <div class="watchlist-head"><div><small>WATCHLIST</small><b>종목 찾기</b></div><span>즐겨찾기 ${favorites.length} · ${pool.length}/${state.stocks.length}</span></div>
    <div class="market-filter-tabs country-tabs">${['ALL','국내','미국','중국','유럽','일본'].map(k=>`<button data-market-filter="${k}" class="${state.marketFilter===k?'on':''}">${k==='ALL'?'전체':k}</button>`).join('')}</div>
    <label class="stock-search-select"><span>종목 바로가기 · ★ 즐겨찾기는 상단 고정</span><select id="stockSelect">${selectRows.map(x=>`<option value="${x.ticker}" ${x.ticker===s.ticker?'selected':''}>${favSet.has(x.ticker)?'★ ':''}${escapeHtml(marketCountry(x))} · ${escapeHtml(x.name)} · ${x.ticker}</option>`).join('')}</select></label>
    ${favorites.length?`<div class="favorite-watchlist"><div class="favorite-watchlist-title"><b>★ 즐겨찾기</b><span>순위와 무관하게 항상 먼저 표시</span></div>${favorites.map(row).join('')}</div>`:''}
    <div class="watchlist-list"><div class="favorite-watchlist-title subtle"><b>${favorites.length?'관심 종목':'주요 종목'}</b><span>변동률 기준</span></div>${normal.map(row).join('')}</div>
  </aside>`;
}

function renderCorporateMarketBridge(s){
  const my=state.companyAvailable!==false?state.company?.my_company:null;
  if(!my)return '';
  const same=String(my.sector||'')===String(s.sector||'');
  const overseas=marketArea(s)==='해외';
  const impact=same?'동종업종: 보유하면 기술·운영 시너지':overseas?'해외종목: 글로벌 시장정보·기관 관심 상승':'재무투자: 손익과 집중도가 신용·투자심리에 반영';
  return `<div class="market-company-bridge"><div><small>COMPANY LINK · ${escapeHtml(my.ticker)}</small><b>이 종목을 회사 전략자산으로 활용할 수 있습니다</b><span>${escapeHtml(impact)} · 법인현금 ${compactMoney(my.cash)}원 · 운용위험 ${Number(my.treasury_risk||0).toFixed(0)}</span></div>${companyMoneyInput('quickCorpAmount','법인 예산','5000만')}<div class="market-company-actions"><button data-company-quick-market-side="BUY">법인 전략매수</button><button data-company-quick-market-side="SELL" class="sell">법인 매도</button><button data-main-tab="company" class="ghost">CEO실</button></div></div>`;
}

function renderChartPanel(s,ch){
  const keyNews=state.news.find(n=>(n.ticker===s.ticker||(!n.ticker&&n.sector===s.sector))&&n.severity!=='NORMAL');
  const tape=state.trades.slice(0,4);
  const latestNews=state.news.slice(0,3);
  const gm=guidanceMode();
  const maLegend=gm==='REALISTIC'
    ?`<div class="ma-legend muted"><span>보조선 숨김</span></div>`
    :`<div class="ma-legend"><span class="ma5">MA5</span><span class="ma20">MA20</span><span class="ma60">MA60</span></div>`;
  const chartHelp=gm==='BEGINNER'
    ?`<div class="chart-guide"><b>차트 선 읽는 법</b><span><i class="dot ma5"></i>노랑 MA5 = 최근 5봉 평균 · 아주 짧은 흐름</span><span><i class="dot ma20"></i>보라 MA20 = 최근 20봉 평균 · 중기 흐름</span><span><i class="dot ma60"></i>초록 MA60 = 최근 60봉 평균 · 더 긴 흐름</span><p>이동평균선은 미래를 맞히는 선이 아니라 <strong>지금까지의 평균 가격</strong>입니다. 현재가가 선 위에 있다고 반드시 더 오른다는 뜻은 아닙니다.</p></div>`
    :gm==='STANDARD'?`<div class="chart-guide compact"><b>MA5 / MA20 / MA60</b><p>각각 최근 5·20·60봉의 평균 가격입니다. 미래 예측선이 아니라 과거 흐름을 정리한 보조지표입니다.</p></div>`:'';
  return `<section class="panel chart-panel balanced-chart">
    <div class="stockhead balanced-head">
      <div>
        <div class="stock-code">${s.ticker} · ${escapeHtml(s.sector)} ${stockMarketBadge(s)}</div>
        <div class="stock-title-line"><h1>${escapeHtml(s.name)}</h1><button type="button" class="stock-favorite-head ${isStockFavorite(s.ticker)?'on':''}" data-stock-favorite="${s.ticker}">${isStockFavorite(s.ticker)?'★ 즐겨찾기':'☆ 즐겨찾기'}</button></div>
        <p>${escapeHtml(s.description)}</p>
      </div>
      <div class="quote"><b>${nf.format(s.last_price)}원</b><strong class="${ch>=0?'up':'down'}">${pct(ch)}</strong>${marketArea(s)==='해외'?`<small class="foreign-local-price">현지 ${localPriceText(s)} · 원화 환산 거래</small>`:''}</div>
    </div>
    <div class="ohlc balanced-ohlc">
      <span>시가 <b>${nf.format(s.open_price)}</b></span><span>고가 <b>${nf.format(s.high_price)}</b></span><span>저가 <b>${nf.format(s.low_price)}</b></span><span>전일 <b>${nf.format(s.prev_close)}</b></span><span>거래량 <b>${nf.format(s.volume)}</b></span>
    </div>
    ${renderCorporateMarketBridge(s)}
    ${renderMarketCoach(s)}
    ${latestNews.length?`<div class="news-wire"><span class="wire-live">LIVE</span><div class="wire-track">${latestNews.map(n=>`<button data-main-tab="news"><b>${n.severity==='EXTRA'?'호외':n.severity==='BREAKING'?'속보':'뉴스'}</b><span>${escapeHtml(n.headline)}</span><time>${n.created_at?new Date(n.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></button>`).join('')}</div></div>`:''}
    ${keyNews?`<button class="headline-strip" data-main-tab="news"><span>${keyNews.severity==='EXTRA'?'호외':'속보'}</span><b>${escapeHtml(keyNews.headline)}</b><small>기사 보기</small></button>`:''}
    <div class="chart-toolbar real-chart-toolbar">
      <div class="chart-periods" aria-label="차트 주기">${[['1M','1분'],['5M','5분'],['15M','15분']].map(([k,l])=>`<button data-chart-period="${k}" class="${state.chartPeriod===k?'on':''}">${l}</button>`).join('')}</div>
      ${maLegend}
      <small>현재까지의 체결만 표시 · 미래 가격은 표시하지 않음</small>
    </div>
    ${chartHelp}
    <div class="chartbox balanced-chartbox real-chartbox"><canvas id="chart"></canvas></div>
    ${marketArea(s)==='해외'?`<div class="fx-learning"><div><small>환율 체크</small><b>1 ${escapeHtml(localCurrency(s))} ≈ ${nf.format(Number(s.fx_to_krw)||1)}원</b></div><p>해외주식의 원화 수익은 <strong>현지 주가 변화 + 환율 변화</strong>가 함께 영향을 줍니다. 주가가 올라도 원화가 강해지면 환산 수익이 줄 수 있습니다.</p></div>`:''}
    <div class="tape compact-tape balanced-tape">
      <div class="tape-head"><b>최근 체결</b><small>실제 체결가가 현재가에 반영됩니다</small></div>
      <div class="tape-list">${tape.length?tape.map(t=>`<div class="tape-row"><span>${new Date(t.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span><b>${nf.format(t.price)}</b><span>${nf.format(t.quantity)}주</span></div>`).join(''):`<div class="empty compact">아직 체결이 없습니다.</div>`}</div>
    </div>
    ${renderMarketGameStrip()}
  </section>`;
}

function renderBook(s,ch){
  const asks=state.depth.filter(d=>d.side==='ASK').sort((a,b)=>b.price-a.price).slice(-5);
  const bids=state.depth.filter(d=>d.side==='BID').sort((a,b)=>b.price-a.price).slice(0,5);
  const mx=Math.max(1,...[...asks,...bids].map(d=>Number(d.quantity)||0));
  return `<div class="trade-pane book-pane">
    <div class="depth">
      ${asks.map(d=>`<div class="drow ask"><i style="width:${Math.min(100,d.quantity/mx*100)}%"></i><b>${nf.format(d.price)}</b><span>${nf.format(d.quantity)}</span></div>`).join('')}
      <div class="mid"><b>${nf.format(s.last_price)}</b><span class="${ch>=0?'up':'down'}">${pct(ch)}</span></div>
      ${bids.map(d=>`<div class="drow bid"><i style="width:${Math.min(100,d.quantity/mx*100)}%"></i><b>${nf.format(d.price)}</b><span>${nf.format(d.quantity)}</span></div>`).join('')}
    </div>
    <div class="book-note">매도호가 · 현재가 · 매수호가 순서로 표시됩니다.</div>
  </div>`;
}

function orderPreviewHtml(s,type=state.type,side=state.side,qty=state.orderQty,price=state.orderPrice){
  qty=Math.max(1,Math.floor(Number(qty)||1));
  const px=price==null?Number(s.last_price)||1:Number(price)||Number(s.last_price)||1;
  const est=estimatedOrder(s,type,side,qty,px);
  if(side==='SELL'){
    const m=positionMetrics(s,qty,est.avg);
    if(m.held<=0)return `<div class="sell-position-card no-position"><b>보유 주식 없음</b><span>${escapeHtml(s.name)}을(를) 보유하고 있지 않습니다.</span></div>`;
    return `<div class="sell-position-card">
      <div class="sell-position-title"><b>내 보유 현황</b><span>${nf.format(m.held)}주 보유</span></div>
      <div class="sell-position-grid">
        <div><small>평균 매입가</small><b>${nf.format(m.avg)}원</b></div>
        <div><small>현재 평가손익</small><b class="${m.evalPnl>=0?'up':'down'}">${m.evalPnl>=0?'+':''}${won(m.evalPnl)} <em>${pct(m.evalReturn)}</em></b></div>
        <div><small>이번 주문 예상 손익</small><b class="${m.realizedPnl>=0?'up':'down'}">${m.realizedPnl>=0?'+':''}${won(m.realizedPnl)} <em>${pct(m.realizedReturn)}</em></b></div>
        <div><small>체결 후 예상 보유</small><b>${nf.format(m.remaining)}주</b></div>
      </div>
      ${qty>m.held?`<p class="position-warning">입력 수량 ${nf.format(qty)}주는 보유 수량 ${nf.format(m.held)}주보다 많습니다.</p>`:''}
    </div>`;
  }
  return `<div class="buy-funds-card"><span>주문 가능 현금 <b>${won(state.account?.cash)}</b></span><span>예상 주문금액 <b>약 ${won(est.amount)}</b></span></div>`;
}
function updateOrderPreview(){
  const s=selected(),box=document.getElementById('orderPositionPreview');if(!s||!box)return;
  const type=document.getElementById('otype')?.value||state.type;
  const qty=Math.max(1,Math.floor(Number(document.getElementById('qty')?.value)||state.orderQty||1));
  const price=type==='LIMIT'?Number(document.getElementById('price')?.value||state.orderPrice||s.last_price):Number(s.last_price);
  box.innerHTML=orderPreviewHtml(s,type,state.side,qty,price);
}
function renderOrder(s){
  const qty=Math.max(1,Math.floor(Number(state.orderQty)||1));
  const price=state.orderPrice==null?Math.round(Number(s.last_price)||0):state.orderPrice;
  return `<div class="trade-pane order-pane">
    <div class="order-body">
      <div class="tabs2"><button class="buy ${state.side==='BUY'?'on':''}" data-side="BUY">매수</button><button class="sell ${state.side==='SELL'?'on':''}" data-side="SELL">매도</button></div>
      <div id="orderPositionPreview">${orderPreviewHtml(s,state.type,state.side,qty,price)}</div>
      <div class="order-grid">
        <label>주문 방식<select id="otype"><option value="LIMIT" ${state.type==='LIMIT'?'selected':''}>지정가</option><option value="MARKET" ${state.type==='MARKET'?'selected':''}>시장가</option></select></label>
        <label>수량<input id="qty" type="number" min="1" value="${qty}"></label>
        <label id="priceWrap" class="span2">지정 가격<input id="price" type="number" min="1" value="${Math.round(Number(price)||Number(s.last_price)||1)}"></label>
      </div>
      <div class="order-help" id="orderHelp">${state.type==='MARKET'?'시장가: 현재 가장 유리한 호가부터 즉시 체결됩니다. 수량이 크면 여러 가격에 나뉘어 체결될 수 있습니다.':'지정가: 내가 정한 가격 이하(매수) 또는 이상(매도)에서만 체결됩니다.'}</div>
      ${guidanceMode()==='REALISTIC'?'':`<div class="order-compare"><div><b>시장가</b><span>속도 우선</span><small>지금 바로 사고팔고 싶을 때. 다만 예상보다 비싸게 사거나 싸게 팔릴 수 있습니다.</small></div><div><b>지정가</b><span>가격 우선</span><small>원하는 가격에만 거래하고 싶을 때. 대신 체결이 안 될 수 있습니다.</small></div></div>`}
      <details class="advanced"><summary>고급 체결 조건</summary><label>체결 조건<select id="tif"><option value="DAY" ${state.tif==='DAY'?'selected':''}>DAY · 장 마감까지</option><option value="IOC" ${state.tif==='IOC'?'selected':''}>IOC · 가능한 만큼 즉시 체결 후 취소</option><option value="FOK" ${state.tif==='FOK'?'selected':''}>FOK · 전량 즉시 체결되지 않으면 취소</option></select></label></details>
      <button id="submitOrder" class="submit ${state.side==='BUY'?'buy':'sell'}">${state.side==='BUY'?'매수':'매도'} 주문 확인</button>
      <div class="msg" id="orderMsg">수량과 가격을 확인한 뒤 최종 확인창에서 주문합니다.</div>
    </div>
  </div>`;
}
function renderTradeCard(s,ch){
  return `<section class="panel trade-card">
    <div class="trade-tabs"><button data-trade-tab="book" class="${state.tradeTab==='book'?'on':''}">호가</button><button data-trade-tab="order" class="${state.tradeTab==='order'?'on':''}">주문</button></div>
    ${state.tradeTab==='order'?renderOrder(s):renderBook(s,ch)}
  </section>`;
}

function renderMarket(s,ch){
  return `<main class="market-workspace balanced-market">
    ${renderStockPicker(s)}
    ${renderChartPanel(s,ch)}
    ${renderTradeCard(s,ch)}
  </main>`;
}


function companyOperatorType(c){
  return c?.operator_type||(c?.is_bot?'BOT':c?.owner_user_id?'PLAYER':'BOT');
}
function companyTypeBadge(c){
  const type=companyOperatorType(c);
  return `<span class="corp-type ${type==='BOT'?'bot':type==='ME'?'me':'player'}">${type==='BOT'?'BOT 회사':type==='ME'?'내 회사':'유저 회사'}</span>`;
}
function companyOwnerLabel(c){
  const type=companyOperatorType(c);
  if(type==='ME')return '내가 운영 중';
  if(type==='PLAYER')return `실제 유저 · ${escapeHtml(c?.owner_nickname||'PLAYER')}`;
  return `AI 경영 · ${escapeHtml(c?.ai_style||'BOT')}`;
}
function companyScaleLabel(v){
  v=Number(v)||0;
  if(v>=1000000000000000)return '글로벌 초거대기업';
  if(v>=100000000000000)return '초대형 기업';
  if(v>=10000000000000)return '대기업';
  if(v>=1000000000000)return '중견 대기업';
  if(v>=100000000000)return '중견기업';
  if(v>=10000000000)return '성장기업';
  return '신생기업';
}
function companyCountryBadge(c){return `<span class="corp-country">${escapeHtml(c?.home_country||'대한민국')}</span>`}
function rememberCompanyDraft(){
  if(state.company?.my_company)return;
  const form=document.getElementById('companyCreateForm');
  if(!form)return;
  const name=document.getElementById('companyName'),sector=document.getElementById('companySector');
  if(name)state.companyDraft.name=name.value;
  if(sector)state.companyDraft.sector=sector.value;
}
function companyFormIsBeingEdited(){
  const active=document.activeElement;
  if(!active||state.tab!=='company')return false;
  if(!['INPUT','TEXTAREA','SELECT'].includes(active.tagName))return false;
  return !!active.closest('.company-page');
}
function companyMarketStatus(m){
  const p=Number(m?.presence||0);
  return p>=70?'핵심시장':p>=40?'성장시장':p>=15?'진입시장':'시험진출';
}
function renderCompanyCreate(){
  const all=(state.company?.companies||[]).filter(c=>c&&c.status!=='INACTIVE').sort((a,b)=>Number(b.valuation)-Number(a.valuation));
  const rivals=all.slice(0,8),draft=state.companyDraft||{name:'',sector:'AI·반도체'};
  return `<main class="page-view company-page"><section class="panel page-panel company-shell onboarding-shell">
    <div class="simple-onboarding">
      <div class="simple-onboarding-copy"><small>KX CORPORATE · ONLINE LEAGUE</small><h1>이미 싸우고 있는 기업 세계에 내 회사를 세우세요</h1><p>BOT 기업들이 서로 투자·인수·인재·언론전을 벌이는 기업 세계에서 신생기업으로 시작합니다. 남의 싸움을 지켜보다 끼어들 수도 있고, 독자적으로 성장하다 원하는 순간 기업전쟁에 참전할 수도 있습니다.</p>
        <div class="onboarding-steps"><span><b>1</b>회사 설립</span><span><b>2</b>사업 성장</span><span><b>3</b>기업 분석</span><span><b>4</b>M&A·해외 진출</span></div>
      </div>
      <form id="companyCreateForm" class="company-create-card simple-create-card">
        <small>NEW COMPANY</small><h2>내 회사 만들기</h2>
        <label>회사 이름<input id="companyName" maxlength="40" value="${escapeHtml(draft.name||'')}" placeholder="예: 아스트라 테크놀로지" autocomplete="off" required></label>
        <label>주력 산업<select id="companySector"><option ${draft.sector==='AI·반도체'?'selected':''}>AI·반도체</option><option ${draft.sector==='게임·콘텐츠'?'selected':''}>게임·콘텐츠</option><option ${draft.sector==='모빌리티'?'selected':''}>모빌리티</option><option ${draft.sector==='바이오'?'selected':''}>바이오</option><option ${draft.sector==='핀테크'?'selected':''}>핀테크</option><option ${draft.sector==='유통'?'selected':''}>유통</option><option ${draft.sector==='에너지'?'selected':''}>에너지</option><option ${draft.sector==='로보틱스'?'selected':''}>로보틱스</option><option ${draft.sector==='산업재·자동화'?'selected':''}>산업재·자동화</option><option ${draft.sector==='기술·서비스'?'selected':''}>기술·서비스</option></select></label>
        <button class="company-primary" type="submit">회사 설립</button>
        <p id="companyCreateMsg">종목 식별코드는 서버가 자동으로 만듭니다. 회사명 입력 중 화면 갱신으로 글자가 끊기지 않습니다.</p>
      </form>
    </div>
    <section class="company-preview simple-market-preview">
      <div class="company-section-head"><div><small>MARKET DEPTH</small><h2>이미 ${all.length}개 회사가 경쟁 중입니다</h2></div><span>새 회사는 이 기업들을 바로 앞지르지 못하도록 낮은 가치에서 시작합니다.</span></div>
      <div class="company-rival-grid compact-preview">${rivals.map((c,i)=>`<article class="operator-${companyOperatorType(c).toLowerCase()}"><div>${companyTypeBadge(c)} ${companyCountryBadge(c)}</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.sector)}</p><strong>${compactMoney(c.valuation)}원</strong><span>전체 #${i+1} · ${companyScaleLabel(c.valuation)}</span></article>`).join('')}</div>
    </section>
  </section></main>`;
}

function takeoverStageMeta(stage,stake){
  const map={
    WATCH:['인수 움직임 포착','watch','공격 기업이 의미 있는 지분을 모으기 시작했습니다. 지금 대응하면 비교적 적은 비용으로 방어할 수 있습니다.'],
    PRESSURE:['경영권 압박','pressure','대량 지분 매집이 이어지고 있습니다. 시장에서는 적대적 인수 가능성을 본격적으로 보기 시작합니다.'],
    HOSTILE:['적대적 인수전','hostile','공격 기업이 사실상 경영권 인수를 선언한 단계입니다. 현금과 지분을 어디에 사용할지 빠르게 결정해야 합니다.'],
    EMERGENCY:['경영권 비상','emergency','50% 경영권선이 가까워졌습니다. 대응을 미루면 최종 공개매수로 경영권이 넘어갈 수 있습니다.'],
    TAKEOVER:['경영권 상실 위기','emergency','공격 기업이 경영권선을 넘기고 있습니다. 즉각적인 지분 축소 또는 독립 회복 전략이 필요합니다.']
  };
  return map[stage]||map[stake>=40?'EMERGENCY':stake>=30?'HOSTILE':stake>=20?'PRESSURE':'WATCH'];
}

function renderTakeoverCrisis(my){
  const c=activeTakeoverThreat();
  if(!c)return '';
  const stake=Number(c.stake||0),aggregate=Math.max(stake,Number(c.aggregate_stake||companyStakeAgainstMe()||0));
  const defense=Number(my.defense_power||c.defense_power||0),counter=Number(c.counter_stake||0),owner=Math.max(0,100-aggregate);
  const marketCap=Math.max(1,Number(my.share_price||0)*Number(my.shares_outstanding||0),Number(my.valuation||1));
  const budgetDefault=Math.max(takeoverDefenseMinimum(my),Math.round(Math.min(marketCap*.003,Math.max(takeoverDefenseMinimum(my),Number(my.cash||0)*.08))/1000000)*1000000);
  const onePctCost=marketCap*.01;
  const attacker=(state.company?.companies||[]).find(x=>Number(x.id)===Number(c.attacker_company_id));
  const attackerCap=Math.max(1,Number(attacker?.share_price||0)*Number(attacker?.shares_outstanding||0),Number(attacker?.valuation||1));
  const actions=[
    ['BUYBACK','자사주 매입','시장 매입','지분 직접 감소',1.00],
    ['NEGOTIATE','공격자 지분 되사기','프리미엄 협상','지분 직접 감소',.82],
    ['WHITE_KNIGHT','백기사 확보','우호 의결권','방어력 강화',0],
    ['POISON_PILL','포이즌필','인수비용 상승','추가매입 억제',0],
    ['RIGHTS_ISSUE','긴급 유상증자','신주 발행','공격자 지분 희석',0],
    ['COUNTER_TAKEOVER','역인수·맞지분','상대 지분 매입','협상 압박',0]
  ];
  return `<section id="takeoverDefenseCenter" class="takeover-crisis compact-defense">
    <div class="takeover-crisis-head"><div><small>경영권 방어</small><h2>${escapeHtml(c.attacker_name||'외부 주주')} 대응</h2></div><div class="threat-shortcuts"><button type="button" data-threat-media="${Number(c.attacker_company_id)||0}">비판 기사</button><button type="button" data-threat-analyze="${Number(c.attacker_company_id)||0}">회사 분석·인수</button></div></div>
    <div class="takeover-trigger-reason"><small>왜 공격받고 있나?</small><b>${escapeHtml(c.rivalry_reason||c.trigger_reason||'구체적 경쟁 근거 확인 중')}</b><span>기업가치 1조 미만에서는 내가 먼저 상대 지분을 5% 이상 사거나 비판 기사를 집행하지 않았다면 적대적 인수로 인정하지 않습니다.</span></div>
    <div class="takeover-dossier"><article><small>공격 명분</small><b>${escapeHtml(c.rivalry_reason||c.trigger_reason||'없음')}</b><span>${c.attacker_ticker?`${escapeHtml(c.attacker_name||'공격사')} (${escapeHtml(c.attacker_ticker)})`:`${escapeHtml(c.attacker_name||'외부 주주')}`}</span></article><article><small>현재 보호 규칙</small><b>${escapeHtml(state.company?.takeover_fairplay?.label||takeoverGrowthTier(my.valuation).label)}</b><span>${Number(state.company?.takeover_fairplay?.global_shield_until_day||0)>=Math.max(1,Number(state.company?.talent_day||liveCompanyClock().day||1))?`DAY ${Number(state.company.takeover_fairplay.global_shield_until_day)}까지 재공격 차단`:`정당한 공격 근거가 있을 때만 위협으로 계산`}</span></article><article><small>공격이 다시 가능한 조건</small><b>${Number(my.valuation||0)<1e12?'내가 먼저 도발했을 때만':'구체적 경쟁관계 + 보호기간 종료'}</b><span>${Number(my.valuation||0)<1e12?'상대 지분 선매입 또는 상대 대상 비판 기사':'동종업계 경쟁·선제 지분매입·비판 기사 등'}</span></article></div>
    <div class="takeover-pressure-grid compact"><article class="danger"><small>공격자 지분</small><b>${stake.toFixed(2)}%</b></article><article><small>내 우호 지분</small><b>${owner.toFixed(2)}%</b></article><article><small>방어력</small><b>${defense.toFixed(0)}</b></article><article><small>상대 회사 맞지분</small><b>${counter.toFixed(2)}%</b></article><article><small>내 회사 1% 지분가치</small><b>${formatKrwSmart(onePctCost)}</b></article></div>
    <div class="defense-budget-box">${companyMoneyInput('takeoverDefenseBudget','이번 대응 예산',formatKrwSmart(budgetDefault))}<span>투입금액이 실제 매입·희석 규모에 비례합니다. 1억과 100억은 같은 효과가 아닙니다.</span></div>
    <div class="takeover-defense-grid">${actions.map(a=>{let preview='';if(['BUYBACK','NEGOTIATE','WHITE_KNIGHT','POISON_PILL','RIGHTS_ISSUE','COUNTER_TAKEOVER'].includes(a[0])){const d=defenseExpectedStakeReduction(a[0],budgetDefault,marketCap,stake);preview=`기본예산 기준 실질 위험 약 ${d.toFixed(2)}%p 감소`;}else preview='방어 효과 계산 중';return `<button type="button" class="takeover-defense-btn" data-company-defense="${a[0]}"><small>${a[2]}</small><b>${a[1]}</b><span>${a[3]}</span><em>${preview} · 현금 -${formatKrwSmart(budgetDefault)}</em></button>`}).join('')}</div>
  </section>`;
}

async function executeTakeoverDefense(action,triggerEl=null){
  const control=activeTakeoverThreat();
  if(!control){state.companyNotice='현재 대응할 외부 지분이 없습니다.';renderTerminal(true);return;}
  const normalized=String(action||'').toUpperCase();
  const labels={BUYBACK:'자사주 매입',NEGOTIATE:'공격자 지분 되사기',WHITE_KNIGHT:'백기사 확보',POISON_PILL:'포이즌필',RIGHTS_ISSUE:'긴급 유상증자',COUNTER_TAKEOVER:'역인수·맞지분'};
  if(!labels[normalized])return;
  const amount=Math.max(10000000,parseCompanyMoney(document.getElementById('takeoverDefenseBudget')?.value,100000000));
  const cash=Number(state.company?.my_company?.cash||0);
  if(amount>cash){state.companyNotice=`법인현금 부족 · 보유 ${formatKrwSmart(cash)} / 필요 ${formatKrwSmart(amount)}`;renderTerminal(true);return;}
  const beforeStake=Number(control.stake||0),beforeCounter=Number(control.counter_stake||0);
  if(!confirm(`${labels[normalized]} 실행\n\n방어 비용 ${formatKrwSmart(amount)} (법인현금에서 차감)\n공격자 지분 ${beforeStake.toFixed(2)}%\n예상 잔액 ${formatKrwSmart(Math.max(0,cash-amount))}`))return;
  const originalText=triggerEl?.innerHTML||'';
  try{
    if(triggerEl){triggerEl.disabled=true;triggerEl.classList.add('processing');triggerEl.innerHTML='<b>처리 중…</b>';}
    const d=await companyDefenseV640(normalized,amount);
    if(!d?.ok)throw new Error(d?.message||'방어 전략을 처리하지 못했습니다.');
    playCompanySfx('alert');
    await loadCompanyLayer(false,true);
    const after=companyStakeAgainstMe(),counterAfter=Number(activeTakeoverThreat()?.counter_stake??beforeCounter);
    state.companyNotice=`${d.message||labels[normalized]} · 방어비 ${formatKrwSmart(amount)} 지출 · 실질 위험지분 ${beforeStake.toFixed(2)}% → ${after.toFixed(2)}%${normalized==='COUNTER_TAKEOVER'?` · 맞지분 ${beforeCounter.toFixed(2)}% → ${counterAfter.toFixed(2)}%`:''}`;
    renderTerminal(true);
  }catch(err){state.companyNotice='경영권 방어 실패: '+(err?.message||String(err));alert(state.companyNotice);if(triggerEl&&document.contains(triggerEl)){triggerEl.disabled=false;triggerEl.innerHTML=originalText;}}
}
function managementProjectMeta(type){
  const map={
    RND:['신기술 개발 프로젝트','6주기','중간','기술과 제품 경쟁력을 높여 향후 제품 원가·수요·품질에 반영합니다. 직접 현금배당은 없습니다.','기술/IP'],
    QUALITY:['품질 혁신 프로젝트','4주기','낮음','불량률·리콜 위험을 낮추고 고객 신뢰를 높여 제품 판매성과를 개선합니다.','품질/신뢰'],
    CAPEX:['생산능력 확장','5주기','중간','설비·공정 역량을 높여 제품 공급능력과 생산 효율에 반영합니다.','생산/설비'],
    HIRING:['핵심 인재 영입','4주기','중간','기술·운영 실행력을 높여 개발과 생산의 병목을 줄입니다.','인적자본'],
    MARKETING:['시장 점유율 캠페인','3주기','높음','브랜드·수요를 높여 실제 판매량에 반영하지만 경쟁사 대응과 가격에 따라 결과가 달라집니다.','수요창출'],
    WELFARE:['조직 안정화 프로그램','3주기','낮음','직원 사기와 생산성을 높여 이탈과 운영손실을 낮춥니다.','조직안정'],
    COMPLIANCE:['준법·감사 고도화','3주기','낮음','규제·세무·신용 위험을 낮춰 장기 사업 안정성을 높입니다.','리스크관리']
  };
  return map[type]||[type,'-','-','회사 경영 프로젝트','-'];
}
function projectStatusLabel(p){
  if(p.status==='PAYBACK')return '구형 성과금 회수';
  if(p.status==='COMPLETED')return '완료';
  if(p.status==='FAILED')return '성과 부진';
  return '진행 중';
}
function renderManagementProjectBoard(my){
  const rows=[...(state.company?.projects||[])].sort((a,b)=>Number(b.id)-Number(a.id));
  const active=rows.filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).slice(0,8);
  const done=rows.filter(p=>!['ACTIVE','PAYBACK'].includes(String(p.status))).slice(0,6);
  return `<section class="management-project-board"><div class="company-section-head"><div><small>CAPABILITY PROJECTS</small><h2>경영 프로젝트</h2></div><span>V6.2부터 신규 프로젝트는 투자원금을 나눠 돌려주는 상품이 아닙니다. 사업비를 써서 기술·품질·생산·인력·수요·준법 역량을 바꾸고, 그 효과가 제품 판매와 실제 손익에 연결됩니다.</span></div><div class="project-grid">${active.length?active.map(p=>{const meta=managementProjectMeta(p.project_type),dur=Math.max(1,Number(p.duration_cycles)||1),prog=Math.min(dur,Number(p.progress_cycles)||0),pc=Math.round(prog/dur*100),legacy=p.status==='PAYBACK';return `<article class="project-card status-${String(p.status||'ACTIVE').toLowerCase()} ${p.decision_pending?'decision-pending':''}"><div class="project-card-head"><span>${escapeHtml(p.project_type)}</span><b>${p.decision_pending?'이사회 결정 필요':projectStatusLabel(p)}</b></div><h3>${escapeHtml(p.title||meta[0])}</h3><p>${escapeHtml(p.outcome||meta[3])}</p><div class="project-progress"><i style="width:${legacy?100:pc}%"></i></div><div class="project-stats"><span>진행 <b>${legacy?`구형 회수 ${Math.max(0,Number(p.payout_cycles_remaining)||0)}회`:`${prog}/${dur}주기`}</b></span><span>사업비 <b>${compactMoney(p.budget)}원</b></span><span>핵심 목적 <b>${escapeHtml(meta[4])}</b></span><span>성공확률 <b>${Number(p.success_chance||0).toFixed(0)}%</b></span></div>${legacy?`<small class="project-choice-note legacy-note">V6.2 이전에 시작된 프로젝트의 기존 성과금만 계약상 잔여 회수로 유지됩니다. 신규 프로젝트에는 이 구조가 적용되지 않습니다.</small>`:`<small class="project-choice-note">직접 현금수익 없음 · 완료 결과는 제품 원가·품질·수요·생산능력·리스크에 반영</small>`}${p.decision_pending?`<div class="project-decision"><strong>중간 이사회 안건</strong><p>추가 투자는 성공확률을 높이지만 사업비가 늘어납니다. 회수금이 아니라 실제 회사 역량에 투자하는 결정입니다.</p><div><button data-project-decision="${p.id}" data-project-choice="BOOST">추가 투자 +20%<small>성공확률 +10% · 현금 추가 지출</small></button><button data-project-decision="${p.id}" data-project-choice="STEADY">기존 계획 유지<small>추가비용 없음 · 성공확률 +3%</small></button><button data-project-decision="${p.id}" data-project-choice="SCALE_DOWN">범위 축소<small>사업비 15% 절감 · 성공확률 +8%</small></button></div></div>`:`${p.decision_choice?`<small class="project-choice-note">중간 결정: ${escapeHtml(p.decision_choice)}</small>`:''}`}</article>`}).join(''):`<div class="empty project-empty">진행 중인 프로젝트가 없습니다. 프로젝트는 제품·영업 역량을 개선하는 투자입니다.</div>`}</div>${done.length?`<details class="project-history"><summary>완료된 프로젝트 ${done.length}개 보기</summary><div>${done.map(p=>`<article><span><b>${escapeHtml(p.title||p.project_type)}</b><small>${escapeHtml(p.outcome||projectStatusLabel(p))}</small></span><strong>${escapeHtml(managementProjectMeta(p.project_type)[4])}</strong></article>`).join('')}</div></details>`:''}</section>`;
}

function sectorProductPreset(sector){
  const map={
    'AI·반도체':{type:'AI·반도체 솔루션',price:2500000,capacity:120,name:'차세대 AI 가속 솔루션'},
    '게임·콘텐츠':{type:'게임·콘텐츠 IP',price:69000,capacity:4000,name:'신규 게임·콘텐츠 IP'},
    '모빌리티':{type:'모빌리티 제품',price:45000000,capacity:8,name:'차세대 모빌리티 플랫폼'},
    '바이오':{type:'바이오·의료 제품',price:350000,capacity:300,name:'신규 바이오·의료 제품'},
    '핀테크':{type:'금융 서비스',price:15000,capacity:2500,name:'기업용 금융 서비스'},
    '유통':{type:'소비재·PB 제품',price:35000,capacity:3500,name:'신규 PB 제품'},
    '에너지':{type:'에너지 솔루션',price:8000000,capacity:30,name:'고효율 에너지 솔루션'},
    '로보틱스':{type:'산업용 로봇',price:35000000,capacity:12,name:'산업용 로봇 시스템'},
    '산업재·자동화':{type:'산업·자동화 장비',price:12000000,capacity:35,name:'스마트 자동화 장비'},
    '기술·서비스':{type:'B2B 기술 서비스',price:450000,capacity:700,name:'기업용 기술 서비스'}
  };
  return map[sector]||map['기술·서비스'];
}
function productStatusMeta(status){
  return ({DEVELOPMENT:['개발 중','development','개발비가 투입되고 있으며 아직 매출은 발생하지 않습니다.'],READY:['출시 승인 대기','ready','개발은 끝났지만 CEO가 출시를 승인해야 판매가 시작됩니다.'],ACTIVE:['판매 중','active','생산·재고·가격·수요에 따라 실제 매출과 매출원가가 발생합니다.'],RETIRED:['단종','retired','판매가 중단된 제품입니다.']})[status]||[status||'상태 미확인','unknown',''];
}
function productInventoryCycles(p){const sold=Math.max(.01,Number(p?.last_units_sold)||0);return Number(p?.inventory_units||0)/sold}
function productGrossMargin(p){const rev=Number(p?.last_revenue||0),cogs=Number(p?.last_cogs||0);return rev>0?(rev-cogs)/rev*100:Number(p?.last_margin_pct||0)}
function productPricePosition(p){const ref=Math.max(1,Number(p?.reference_price)||Number(p?.target_price)||1),px=Math.max(1,Number(p?.unit_price)||ref);return (px/ref-1)*100}
function renderRealismInstallNotice(){
  if(state.company?.realism_available)return '';
  return `<section class="realism-install-notice"><div><small>V6.2 REAL MANAGEMENT CORE</small><b>제품·판매·공급망·관리회계 확장 SQL이 필요합니다</b><span>${escapeHtml(state.company?.realism_error||'RUN_THIS_IN_SUPABASE_V6.2.sql을 Supabase SQL Editor에서 한 번 실행해 주세요.')}</span></div><code>RUN_THIS_IN_SUPABASE_V6.2.sql</code></section>`;
}
function renderMacroEnvironment(){
  const m=state.company?.macro||{};
  if(!state.company?.realism_available)return '';
  const consumer=Number(m.consumer_index||100),energy=Number(m.energy_index||100),logistics=Number(m.logistics_index||100),semi=Number(m.semiconductor_index||100);
  const mood=v=>v>=108?'과열':v>=102?'강세':v<=92?'침체':v<=98?'약세':'중립';
  return `<section class="macro-environment"><div class="macro-title"><div><small>MACRO ENVIRONMENT</small><h2>시장 환경</h2></div><span>실제 뉴스 데이터가 아니라 게임 서버 안에서 모든 기업에 동일하게 적용되는 거시환경입니다.</span></div><div class="macro-grid"><article><small>기준금리</small><b>${Number(m.base_rate||3.25).toFixed(2)}%</b><span>대출·기업가치 할인율</span></article><article><small>USD/KRW</small><b>${nf.format(Math.round(Number(m.usd_krw||1350)))}</b><span>해외사업 원가·수익성 영향</span></article><article><small>소비경기</small><b>${consumer.toFixed(1)}</b><span>${mood(consumer)}</span></article><article><small>에너지 원가</small><b>${energy.toFixed(1)}</b><span>${mood(energy)}</span></article><article><small>물류비</small><b>${logistics.toFixed(1)}</b><span>${mood(logistics)}</span></article><article><small>반도체 사이클</small><b>${semi.toFixed(1)}</b><span>${mood(semi)}</span></article></div></section>`;
}
function renderProductSalesDesk(my){
  if(!state.company?.realism_available)return renderRealismInstallNotice();
  const products=state.company?.products||[],preset=sectorProductPreset(my.sector),active=products.filter(p=>p.status==='ACTIVE'),development=products.filter(p=>p.status==='DEVELOPMENT'),ready=products.filter(p=>p.status==='READY');
  const lastRevenue=active.reduce((a,p)=>a+Number(p.last_revenue||0),0),lastCogs=active.reduce((a,p)=>a+Number(p.last_cogs||0),0),gross=lastRevenue-lastCogs,margin=lastRevenue>0?gross/lastRevenue*100:0;
  return `<section class="corp-section product-sales-desk"><div class="company-section-head"><div><small>PRODUCT · SALES · UNIT ECONOMICS</small><h2>제품·서비스 포트폴리오</h2></div><span>프로젝트가 돈을 직접 지급하지 않습니다. 기술·품질·설비·인력 투자가 제품의 원가·품질·생산능력·수요를 바꾸고, 실제 판매에서 현금이 만들어집니다.</span></div>
    <div class="product-sales-summary"><article><small>판매 중</small><b>${active.length}개</b><span>개발 ${development.length} · 출시대기 ${ready.length}</span></article><article><small>최근 판매매출</small><b>${formatKrwSmart(lastRevenue)}</b><span>경영주기 기준</span></article><article><small>최근 매출총이익</small><b class="${gross>=0?'up':'down'}">${gross>=0?'+':''}${formatKrwSmart(gross)}</b><span>매출총이익률 ${margin.toFixed(1)}%</span></article><article><small>재고자산</small><b>${formatKrwSmart(Number(state.company?.supply?.inventory_value||my.inventory_value||0))}</b><span>팔리지 않은 제품 원가</span></article></div>
    <div class="new-product-panel"><div><small>NEW PRODUCT DEVELOPMENT</small><h3>신제품·서비스 개발</h3><p>개발비는 즉시 비용으로 나가며 개발 완료 후에도 자동 판매되지 않습니다. 출시가격과 공급량을 직접 결정해야 합니다.</p></div><div class="new-product-form"><label>제품/서비스 이름<input id="newProductName" maxlength="50" value="${escapeHtml(preset.name)}"></label><label>사업 유형<input id="newProductType" maxlength="40" value="${escapeHtml(preset.type)}"></label>${companyMoneyInput('newProductPrice','목표 판매가격',formatKrwSmart(preset.price),'예: 250만, 4500만')}${companyMoneyInput('newProductBudget','개발 예산','1억','예: 1억, 5억')}<label>계획 공급량 / 주기<input id="newProductCapacity" type="number" min="0.01" step="1" value="${preset.capacity}"></label><button data-product-develop>개발 착수</button></div></div>
    <div class="product-portfolio-grid">${products.length?products.map(p=>{const st=productStatusMeta(p.status),gm=productGrossMargin(p),inv=productInventoryCycles(p),pp=productPricePosition(p),dev=Math.max(1,Number(p.development_cycles)||1),prog=Math.min(dev,Number(p.progress_cycles)||0),pc=Math.round(prog/dev*100),demand=Number(p.last_demand_units||0),capacity=Number(p.capacity_per_cycle||0),sold=Number(p.last_units_sold||0);return `<article class="product-card ${st[1]}"><div class="product-card-head"><span>${escapeHtml(p.product_type||'제품')}</span><b>${st[0]}</b></div><h3>${escapeHtml(p.name)}</h3><p>${st[2]}</p>${p.status==='DEVELOPMENT'?`<div class="product-progress"><i style="width:${pc}%"></i></div><div class="product-progress-label"><span>개발 진행</span><b>${prog}/${dev}주기 · ${pc}%</b></div>`:''}<div class="product-metrics"><span><small>판매가격</small><b>${formatKrwSmart(p.unit_price||p.target_price)}</b><em class="${pp>8?'warn':pp<-8?'up':''}">기준 대비 ${pp>=0?'+':''}${pp.toFixed(1)}%</em></span><span><small>단위원가</small><b>${formatKrwSmart(p.unit_cost)}</b><em>최근 총마진 ${gm.toFixed(1)}%</em></span><span><small>최근 판매량</small><b>${nf.format(Math.round(sold))}</b><em>수요 ${nf.format(Math.round(demand))}</em></span><span><small>공급능력</small><b>${nf.format(Math.round(capacity))}/주기</b><em>불량률 ${Number(p.defect_rate||0).toFixed(2)}%</em></span><span><small>재고</small><b>${nf.format(Math.round(Number(p.inventory_units||0)))}</b><em>${sold>0?`약 ${inv.toFixed(1)}주기 판매분`:'판매 데이터 부족'}</em></span><span><small>누적 매출</small><b>${formatKrwSmart(p.revenue_total||0)}</b><em>누적 판매 ${nf.format(Math.round(Number(p.units_sold_total||0)))}단위</em></span></div>${p.status==='READY'?`<div class="product-action-single"><button data-product-launch="${p.id}">출시 승인</button><small>출시 준비비용은 개발비의 약 3%(최소 500만원)입니다.</small></div>`:''}${p.status==='ACTIVE'?`<details class="product-control"><summary>가격·생산·수요 관리</summary><div class="product-control-grid">${companyMoneyInput(`productPrice_${p.id}`,'새 판매가격',formatKrwSmart(p.unit_price||p.target_price),'예: 250만')}<button data-product-price="${p.id}">가격 변경</button>${companyMoneyInput(`productCapacityBudget_${p.id}`,'생산능력 증설 예산','5000만','예: 5000만, 2억')}<button data-product-capacity="${p.id}">생산능력 투자</button>${companyMoneyInput(`productMarketingBudget_${p.id}`,'제품 수요창출 예산','3000만','예: 3000만, 1억')}<button data-product-marketing="${p.id}">제품 마케팅</button><button class="risk" data-product-retire="${p.id}">제품 단종</button></div></details>`:''}</article>`}).join(''):`<div class="empty project-empty">제품 포트폴리오 데이터가 없습니다. 첫 신제품을 개발해 보세요.</div>`}</div>
  </section>`;
}
function renderSupplyChainDesk(my){
  if(!state.company?.realism_available)return '';
  const s=state.company?.supply||{},policy=String(s.procurement_policy||my.procurement_policy||'BALANCED');
  const policies=[['LOW_COST','저가 단일조달','원가 ↓','품질·공급중단 위험 ↑'],['BALANCED','균형 조달','원가·품질 균형','기본 공급망'],['PREMIUM','프리미엄 공급망','품질·납기 안정 ↑','원가 ↑'],['DUAL_SOURCE','이원화 조달','공급중단 위험 최소','관리비·원가 ↑']];
  return `<section class="corp-section supply-chain-desk"><div class="company-section-head"><div><small>SUPPLY CHAIN · WORKING CAPITAL</small><h2>공급망·운전자본</h2></div><span>싸게 조달하면 원가가 내려가지만 불량과 공급중단 위험이 커집니다. 매출이 발생해도 외상매출금 때문에 현금이 바로 들어오지 않을 수 있습니다.</span></div><div class="supply-kpis"><article><small>조달 정책</small><b>${escapeHtml(policies.find(x=>x[0]===policy)?.[1]||policy)}</b><span>현재 적용</span></article><article><small>공급 신뢰도</small><b>${Number(s.supplier_reliability||my.supplier_reliability||0).toFixed(0)}</b><span>납기·중단 위험</span></article><article class="${Number(s.supply_risk||my.supply_risk||0)>35?'warn':''}"><small>공급망 위험</small><b>${Number(s.supply_risk||my.supply_risk||0).toFixed(1)}</b><span>물류·에너지 환경 포함</span></article><article><small>재고자산</small><b>${formatKrwSmart(s.inventory_value||my.inventory_value||0)}</b><span>현금이 재고에 묶인 금액</span></article><article><small>외상매출금</small><b>${formatKrwSmart(s.accounts_receivable||my.accounts_receivable||0)}</b><span>매출은 났지만 아직 못 받은 돈</span></article><article><small>외상매입금</small><b>${formatKrwSmart(s.accounts_payable||my.accounts_payable||0)}</b><span>공급사에 아직 지급하지 않은 돈</span></article></div><div class="procurement-policy-grid">${policies.map(x=>`<button data-procurement-policy="${x[0]}" class="${policy===x[0]?'on':''}"><b>${x[1]}</b><span>${x[2]}</span><small>${x[3]}</small></button>`).join('')}</div></section>`;
}
function renderFinancialStatements(my){
  if(!state.company?.realism_available)return '';
  const periods=state.company?.finance_periods||[],f=periods[0]||null,live=state.company?.finance_live||{};
  const revenue=f?Number(f.revenue||0):Number(live.period_product_revenue||0),cogs=f?Number(f.cogs||0):Number(live.period_cogs||0),gross=f?Number(f.gross_profit||0):revenue-cogs,payroll=f?Number(f.payroll_expense||0):Number(my.monthly_payroll||0)/30,fixed=f?Number(f.fixed_expense||0):Number(my.monthly_fixed_cost||0)/30,rnd=f?Number(f.rnd_expense||0):Number(live.period_rnd_expense||0),marketing=f?Number(f.marketing_expense||0):Number(live.period_marketing_expense||0),otherOpex=f?Number(f.other_opex||0):Number(live.period_other_opex||0),dep=f?Number(f.depreciation_expense||0):Number(live.period_capex_spend||0)*.02,interest=f?Number(f.interest_expense||0):Number(my.last_interest_cost||0),tax=f?Number(f.tax_expense||0):Number(my.estimated_corporate_tax||0)+Number(my.estimated_local_tax||0),op=f?Number(f.operating_profit||0):gross-payroll-fixed-rnd-marketing-otherOpex-dep,net=f?Number(f.net_income||0):op-interest-tax,ocf=f?Number(f.operating_cash_flow||0):Number(my.last_operating_cash_flow||0),icf=f?Number(f.investing_cash_flow||0):-(Number(live.period_capex_spend||0)+Number(live.period_rnd_expense||0)*.35);
  const periodsHtml=periods.slice(0,5).map(x=>`<tr><td>기간 ${x.period_no}</td><td>${formatKrwSmart(x.revenue)}</td><td class="${Number(x.operating_profit)>=0?'up':'down'}">${formatKrwSmart(x.operating_profit)}</td><td class="${Number(x.net_income)>=0?'up':'down'}">${formatKrwSmart(x.net_income)}</td><td>${formatKrwSmart(x.ending_cash)}</td></tr>`).join('');
  return `<section class="corp-section financial-statements"><div class="company-section-head"><div><small>MANAGEMENT ACCOUNTING</small><h2>손익·재무상태·현금흐름</h2></div><span>${f?`최근 마감 회계기간 #${f.period_no}`:'현재 회계기간 누적'} · 매출과 현금은 다릅니다. 외상매출·재고·매입채무 때문에 흑자여도 현금이 부족할 수 있습니다.</span></div><div class="statement-grid"><article><div class="statement-head"><small>손익계산</small><b>P&amp;L</b></div><dl><div><dt>제품·서비스 매출</dt><dd>${formatKrwSmart(revenue)}</dd></div><div><dt>매출원가</dt><dd>-${formatKrwSmart(cogs)}</dd></div><div class="subtotal"><dt>매출총이익</dt><dd class="${gross>=0?'up':'down'}">${formatKrwSmart(gross)}</dd></div><div><dt>급여비</dt><dd>-${formatKrwSmart(payroll)}</dd></div><div><dt>고정 운영비</dt><dd>-${formatKrwSmart(fixed)}</dd></div><div><dt>R&amp;D·품질 비용</dt><dd>-${formatKrwSmart(rnd)}</dd></div><div><dt>마케팅비</dt><dd>-${formatKrwSmart(marketing)}</dd></div><div><dt>기타 영업비용</dt><dd>-${formatKrwSmart(otherOpex)}</dd></div><div><dt>감가상각</dt><dd>-${formatKrwSmart(dep)}</dd></div><div class="subtotal"><dt>영업이익</dt><dd class="${op>=0?'up':'down'}">${formatKrwSmart(op)}</dd></div><div><dt>이자·세금</dt><dd>-${formatKrwSmart(interest+tax)}</dd></div><div class="total"><dt>순이익</dt><dd class="${net>=0?'up':'down'}">${formatKrwSmart(net)}</dd></div></dl></article><article><div class="statement-head"><small>재무상태</small><b>BALANCE SHEET</b></div><dl><div><dt>현금</dt><dd>${formatKrwSmart(my.cash)}</dd></div><div><dt>외상매출금</dt><dd>${formatKrwSmart(my.accounts_receivable||state.company?.supply?.accounts_receivable||0)}</dd></div><div><dt>재고자산</dt><dd>${formatKrwSmart(my.inventory_value||state.company?.supply?.inventory_value||0)}</dd></div><div class="subtotal"><dt>단기 운전자산</dt><dd>${formatKrwSmart(Number(my.cash||0)+Number(my.accounts_receivable||0)+Number(my.inventory_value||0))}</dd></div><div><dt>외상매입금</dt><dd>${formatKrwSmart(my.accounts_payable||state.company?.supply?.accounts_payable||0)}</dd></div><div><dt>차입금</dt><dd>${formatKrwSmart(my.debt)}</dd></div><div class="total"><dt>기업가치</dt><dd>${formatKrwSmart(my.valuation)}</dd></div></dl></article><article><div class="statement-head"><small>현금흐름</small><b>CASH FLOW</b></div><dl><div><dt>영업현금흐름</dt><dd class="${ocf>=0?'up':'down'}">${ocf>=0?'+':''}${formatKrwSmart(ocf)}</dd></div><div><dt>투자현금흐름</dt><dd class="${icf>=0?'up':'down'}">${icf>=0?'+':''}${formatKrwSmart(icf)}</dd></div><div><dt>매출채권</dt><dd>${formatKrwSmart(my.accounts_receivable||0)}</dd></div><div><dt>매입채무</dt><dd>${formatKrwSmart(my.accounts_payable||0)}</dd></div><div class="subtotal"><dt>현금 런웨이</dt><dd>${companyCashRunway(my).months.toFixed(1)}개월</dd></div><div class="total"><dt>기말 현금</dt><dd>${formatKrwSmart(my.cash)}</dd></div></dl></article></div>${periods.length?`<details class="finance-history"><summary>최근 회계기간 비교</summary><div class="finance-table-wrap"><table><thead><tr><th>기간</th><th>매출</th><th>영업이익</th><th>순이익</th><th>기말현금</th></tr></thead><tbody>${periodsHtml}</tbody></table></div></details>`:'<div class="finance-period-note">120 경영주기가 지나 첫 결산이 끝나면 기간별 손익 추이가 기록됩니다.</div>'}</section>`;
}
function renderRealOperatingBrief(my){
  if(!state.company?.realism_available)return '';
  const ps=state.company?.products||[],active=ps.filter(p=>p.status==='ACTIVE'),ready=ps.filter(p=>p.status==='READY'),dev=ps.filter(p=>p.status==='DEVELOPMENT'),rev=active.reduce((a,p)=>a+Number(p.last_revenue||0),0),cogs=active.reduce((a,p)=>a+Number(p.last_cogs||0),0),gross=rev-cogs,inventory=Number(state.company?.supply?.inventory_value||my.inventory_value||0),ar=Number(state.company?.supply?.accounts_receivable||my.accounts_receivable||0),risk=Number(state.company?.supply?.supply_risk||my.supply_risk||0);
  return `<section class="real-operating-brief"><div class="company-section-head"><div><small>OPERATING REALITY</small><h2>실제 영업 상태</h2></div><span>회사의 가치가 아니라 무엇을 팔고 얼마가 남는지를 먼저 봅니다.</span></div><div class="real-operating-grid"><article><small>판매 중 제품</small><b>${active.length}</b><span>개발 ${dev.length} · 출시대기 ${ready.length}</span></article><article><small>최근 제품매출</small><b>${formatKrwSmart(rev)}</b><span>경영주기 기준</span></article><article><small>매출총이익</small><b class="${gross>=0?'up':'down'}">${gross>=0?'+':''}${formatKrwSmart(gross)}</b><span>원가 ${formatKrwSmart(cogs)}</span></article><article class="${inventory>Math.max(rev*4,10000000)?'warn':''}"><small>재고자산</small><b>${formatKrwSmart(inventory)}</b><span>판매 속도 대비 과잉재고 점검</span></article><article><small>외상매출금</small><b>${formatKrwSmart(ar)}</b><span>매출과 현금의 차이</span></article><article class="${risk>35?'warn':''}"><small>공급망 위험</small><b>${risk.toFixed(1)}</b><span>${escapeHtml(state.company?.supply?.procurement_policy||'BALANCED')}</span></article></div></section>`;
}
function incidentTypeMeta(type){
  return ({SUPPLY:['공급망','납기·생산'],QUALITY:['품질','고객·리콜'],HR:['인사','핵심인력'],CYBER:['정보보안','데이터·운영'],REGULATORY:['규제·준법','감사·신용']})[type]||['경영','운영'];
}
function renderExecutiveDecisionQueue(my){
  if(!state.company?.realism_available)return '';
  const rows=state.company?.incidents||[];
  if(!rows.length)return '';
  const cycle=Number(state.company?.world?.cycle_no||0);
  return `<section class="executive-decision-queue"><div class="company-section-head"><div><small>EXECUTIVE APPROVAL REQUIRED</small><h2>경영진 결재 대기</h2></div><span>랜덤 보상 이벤트가 아니라 실제 운영에서 발생할 수 있는 문제입니다. 비용을 아끼면 후속 위험을 감수해야 합니다.</span></div><div class="executive-case-grid">${rows.map(x=>{const meta=incidentTypeMeta(x.incident_type),left=Math.max(0,Number(x.deadline_cycle||0)-cycle),sev=Math.max(1,Number(x.severity||1));return `<article class="executive-case severity-${sev}"><div class="case-head"><span>${meta[0]}</span><b>중요도 ${sev}/3</b></div><h3>${escapeHtml(x.title)}</h3><p>${escapeHtml(x.body)}</p><div class="case-facts"><span><small>전면 대응 예상비용</small><b>${formatKrwSmart(x.estimated_cost||0)}</b></span><span><small>결재 권고기한</small><b>${left}주기</b></span><span><small>영향 영역</small><b>${meta[1]}</b></span></div><div class="case-actions"><button data-incident-decision="${x.id}" data-incident-choice="FULL"><b>전면 대응</b><small>비용 100% · 후속 위험 최소화</small></button><button data-incident-decision="${x.id}" data-incident-choice="CONTROLLED"><b>제한 대응</b><small>비용 약 55% · 일부 위험 유지</small></button><button class="risk" data-incident-decision="${x.id}" data-incident-choice="DEFER"><b>대응 유보</b><small>즉시비용 0 · 운영/평판 위험 확대</small></button></div></article>`}).join('')}</div></section>`;
}
function dueDiligenceFor(targetId){
  const cycle=Number(state.company?.world?.cycle_no||0);
  return (state.company?.due_diligence||[]).find(x=>Number(x.target_company_id)===Number(targetId)&&Number(x.valid_until_cycle||0)>=cycle)||null;
}
function renderDueDiligencePanel(c,self,controlled){
  if(self||!state.company?.realism_available)return '';
  const d=dueDiligenceFor(c.id),cycle=Number(state.company?.world?.cycle_no||0);
  if(!d){const fee=Math.max(15000000,Math.min(300000000,Number(c.valuation||0)*.00002));return `<div class="due-diligence-panel pending"><div><small>M&amp;A DUE DILIGENCE</small><b>인수 실사 미실시</b><span>소수지분 투자는 가능하지만 공개매수 전에 회계·법무·사업·공급망 실사가 필요합니다. 예상 실사비 ${formatKrwSmart(fee)}.</span></div><button data-company-dd="${c.id}" ${controlled?'disabled':''}>인수 실사 의뢰</button></div>`;}
  return `<div class="due-diligence-panel complete"><div><small>M&amp;A DUE DILIGENCE</small><b>실사 보고서 유효</b><span>${escapeHtml(d.summary||'재무·법무·사업 실사를 완료했습니다.')}</span></div><div class="dd-scores"><span><small>인수 위험도</small><b class="${Number(d.risk_score)>=65?'down':Number(d.risk_score)<=35?'up':''}">${Number(d.risk_score||0).toFixed(0)}/100</b></span><span><small>예상 시너지</small><b class="${Number(d.synergy_score)>=65?'up':''}">${Number(d.synergy_score||0).toFixed(0)}/100</b></span><span><small>유효기간</small><b>${Math.max(0,Number(d.valid_until_cycle)-cycle)}주기</b></span><span><small>실사비</small><b>${formatKrwSmart(d.fee||0)}</b></span></div><button data-company-dd="${c.id}">실사 갱신</button></div>`;
}

function renderCompetitorProductIntel(){
  const ps=state.companyAnalysis?.realism_products||[];
  if(!ps.length)return '';
  return `<div class="competitor-product-intel"><div class="analysis-subhead"><h3>주력 제품·사업</h3><span>${ps.filter(p=>p.status==='ACTIVE').length}개 판매 중</span></div>${ps.slice(0,4).map(p=>`<article><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.product_type||'제품')} · ${productStatusMeta(p.status)[0]}</small></div><span><small>판매가격</small><b>${formatKrwSmart(p.unit_price||p.target_price)}</b></span><span><small>최근 매출</small><b>${formatKrwSmart(p.last_revenue||0)}</b></span><span><small>총마진</small><b>${productGrossMargin(p).toFixed(1)}%</b></span></article>`).join('')}</div>`;
}

function renderInvestmentReturnPanel(my){
  const sum=state.company?.investment_summary||{};
  const incomes=(state.company?.investment_income||[]).slice(0,10);
  const value=Number(sum.portfolio_value||0),cost=Number(sum.portfolio_cost||0),unreal=Number(sum.unrealized_pnl??(value-cost)),real=Number(sum.realized_pnl||0),divi=Number(sum.dividend_income||0),projectReturn=Number(sum.project_return||0),globalReturn=Number(sum.global_return||0);
  const cycle=Number(state.company?.world?.cycle_no||0),nextYield=6-(cycle%6||0),nextGlobal=4-(cycle%4||0);
  return `<section class="investment-return-panel"><div class="company-section-head"><div><small>CASH REALIZATION</small><h2>확정 투자수익·현금유입</h2></div><span>경쟁사 지분·법인 주식의 매각이익·배당·해외사업 현금유입을 보여줍니다. 프로젝트 항목은 V6.2 이전에 시작된 구형 계약의 잔여 회수분만 표시될 수 있습니다.</span></div><div class="return-schedule"><span><b>배당·금융수익</b> 약 ${nextYield||6}주기 뒤 정산</span><span><b>해외사업 현금</b> 약 ${nextGlobal||4}주기 뒤 정산</span><span>서버는 회사별 요청이 아니라 <b>시장 전체를 한 번에 배치 정산</b>합니다.</span></div><div class="return-kpis"><article><small>전체 투자 평가액</small><b>${compactMoney(value)}원</b><span>투자원가 ${compactMoney(cost)}원</span></article><article><small>평가손익</small><b class="${unreal>=0?'up':'down'}">${unreal>=0?'+':''}${compactMoney(unreal)}원</b><span>아직 매도 전 손익</span></article><article><small>확정 매매손익</small><b class="${real>=0?'up':'down'}">${real>=0?'+':''}${compactMoney(real)}원</b><span>매도 결과가 법인현금에 반영</span></article><article><small>누적 현금유입</small><b class="up">${compactMoney(divi+projectReturn+globalReturn)}원</b><span>배당 ${compactMoney(divi)} · 프로젝트 ${compactMoney(projectReturn)} · 해외 ${compactMoney(globalReturn)}</span></article></div><div class="income-feed">${incomes.length?incomes.map(x=>`<article><span><b>${escapeHtml(x.source_name||x.source_code||'투자')}</b><small>${escapeHtml(x.income_label||x.income_type||'현금수익')} · 주기 #${Number(x.cycle_no)||0}</small></span><strong class="${Number(x.amount)>=0?'up':'down'}">${Number(x.amount)>=0?'+':''}${compactMoney(x.amount)}원</strong><em>${escapeHtml(x.note||'법인현금 반영')}</em></article>`).join(''):`<div class="empty compact">아직 확정된 투자 현금수익이 없습니다. 배당·해외사업·지분 매각과 V6.2 이전 구형 프로젝트의 잔여 성과금이 발생하면 이곳에 실제 입금 내역이 쌓입니다.</div>`}</div></section>`;
}

function talentGradeRank(g){return ({'거장':8,'마스터':7,'천재':6,'핵심인재':5,'수재':4,'전문가':3,'경력직':2,'신입':1})[g]||1}
function talentCareerTitle(t){
  if(t?.career_title)return String(t.career_title);
  if((t?.career_level==null||Number(t.career_level)===0)&&t?.grade)return String(t.grade);
  const lv=Math.max(1,Number(t?.career_level||1));
  if(lv<=1)return '신입';if(lv<=2)return '주니어';if(lv<=4)return '경력직';if(lv<=6)return '시니어';if(lv<=8)return '전문가';if(lv<=11)return '수재';if(lv<=15)return '핵심인재';if(lv<=20)return '천재';if(lv<=30)return '마스터';return `거장 Lv.${lv}`;
}
function talentGradeBadge(t){const title=typeof t==='string'?t:talentCareerTitle(t);return `<span class="talent-grade grade-${Math.min(8,talentGradeRank(title.replace(/ Lv\..*/,'')))}">${escapeHtml(title)}</span>`}
function talentDepartmentShort(d){return ({ENGINEERING:'기술·R&D',SALES:'영업·마케팅',OPERATIONS:'생산·운영',FINANCE:'재무·준법',MANAGEMENT:'경영지원'})[d]||d||'조직'}
function talentPotentialLabel(v){v=Number(v||50);return v>=90?'최상':v>=78?'높음':v>=64?'양호':v>=50?'보통':'불확실'}

const COMPANY_TALENT_DESK_META_PREFIX='kx_company_talent_desk_v2';
function companyTalentDeskKey(){return `${COMPANY_TALENT_DESK_META_PREFIX}_${session?.user?.id||'guest'}_${state.company?.my_company?.id||'new'}`}
function defaultCompanyTalentDeskMeta(){return {day:0,interviewCount:0,shortlist:[],lastOpenedAt:0}}
function normalizeCompanyTalentDeskMeta(raw={}){const meta={...defaultCompanyTalentDeskMeta(),...(raw||{})};meta.day=Math.max(0,Number(meta.day)||0);meta.interviewCount=Math.max(0,Number(meta.interviewCount)||0);meta.lastOpenedAt=Number(meta.lastOpenedAt)||0;meta.shortlist=Array.isArray(meta.shortlist)?meta.shortlist:[];return meta}
function loadCompanyTalentDeskMeta(data=state.company){const currentDay=Math.max(1,Number(data?.talent_day||liveCompanyClock().day)||1);let meta=defaultCompanyTalentDeskMeta();try{meta=normalizeCompanyTalentDeskMeta(JSON.parse(localStorage.getItem(companyTalentDeskKey())||'{}')||{})}catch{}if(meta.day!==currentDay){meta={...defaultCompanyTalentDeskMeta(),day:currentDay};saveCompanyTalentDeskMeta(meta)}return meta}
function saveCompanyTalentDeskMeta(meta){try{localStorage.setItem(companyTalentDeskKey(),JSON.stringify(normalizeCompanyTalentDeskMeta(meta)))}catch{}}
function talentMetricSnapshot(p={}){return {innovation:Number(p.innovation||0)||0,sales:Number(p.sales_skill??p.sales??0)||0,operations:Number(p.operations_skill??p.operations??0)||0,leadership:Number(p.leadership||0)||0,skillScore:Number(p.skill_score||0)||0,loyalty:Number(p.loyalty||0)||0,potential:Number(p.potential||0)||0,salary:Number(p.monthly_salary??p.salary_monthly??0)||0,signBonus:Number(p.signing_bonus??p.sign_bonus??0)||0}}
function talentAutopilotContribution(p={}){const m=talentMetricSnapshot(p);return Math.max(0,Math.round((m.operations*0.34+m.leadership*0.3+m.innovation*0.2+m.sales*0.16)*10)/10)}
function talentAutomationGrade(index=0){if(index>=84)return ['S','자율경영'];if(index>=76)return ['A','매우 우수'];if(index>=68)return ['B','안정 운영'];if(index>=58)return ['C','기본 운영'];return ['D','직접 관리']}
function companyAutomationSummary(data=state.company){const roster=(data?.talents||[]).filter(Boolean),headcount=roster.length;if(!headcount)return {headcount:0,avgSkill:0,automationIndex:0,grade:['D','직접 관리'],payroll:0,revenueBoost:0,efficiencyBoost:0,defenseBoost:0,cashflowBoost:0};const totals=roster.reduce((acc,t)=>{const m=talentMetricSnapshot(t);acc.skill+=m.skillScore;acc.salary+=m.salary;acc.innovation+=m.innovation;acc.sales+=m.sales;acc.operations+=m.operations;acc.leadership+=m.leadership;acc.auto+=talentAutopilotContribution(t);return acc},{skill:0,salary:0,innovation:0,sales:0,operations:0,leadership:0,auto:0});const avgSkill=totals.skill/headcount,auto=Math.min(92,totals.auto/headcount);const revenueBoost=Math.round((Math.min(120,totals.sales/headcount*0.08+totals.innovation/headcount*0.05+headcount*0.07))*10)/10;const efficiencyBoost=Math.round((Math.min(100,totals.operations/headcount*0.09+headcount*0.08))*10)/10;const defenseBoost=Math.round((Math.min(45,totals.leadership/headcount*0.22+headcount*0.2))*10)/10;const cashflowBoost=Math.max(0,Math.round((Number(data?.my_company?.monthly_payroll||0)||totals.salary)*Math.min(.11,auto/1000)));return {headcount,avgSkill,automationIndex:auto,grade:talentAutomationGrade(auto),payroll:totals.salary,revenueBoost,efficiencyBoost,defenseBoost,cashflowBoost}}
function companyInterviewSurcharge(uses=0){return uses<=1?0:uses===2?6:uses===3?14:Math.min(36,14+(uses-3)*8)}

const COMPANY_LOCAL_TRAINING_PREFIX='kx_company_local_training_v1';
function companyTrainingLedgerKey(companyId=(state.company?.my_company?.id||'guest')){return `${COMPANY_LOCAL_TRAINING_PREFIX}_${companyId}`}
function normalizeCompanyTrainingLedger(raw){
  const base=raw&&typeof raw==='object'?raw:{};
  const talents={};
  Object.entries(base.talents&&typeof base.talents==='object'?base.talents:{}).forEach(([id,v])=>{
    const x=v&&typeof v==='object'?v:{};
    talents[String(id)]={
      skill_score:Number(x.skill_score||0)||0,
      monthly_salary:Number(x.monthly_salary||0)||0,
      innovation:Number(x.innovation||0)||0,
      sales_skill:Number(x.sales_skill||0)||0,
      operations_skill:Number(x.operations_skill||0)||0,
      leadership:Number(x.leadership||0)||0,
      loyalty:Number(x.loyalty||0)||0,
      potential:Number(x.potential||0)||0,
      career_level:Number(x.career_level||0)||0,
      balancedCount:Number(x.balancedCount||0)||0,
      specialtyCount:Number(x.specialtyCount||0)||0,
      totalTrainings:Number(x.totalTrainings||0)||0,
      totalSpent:Number(x.totalSpent||0)||0,
      lastTrainDay:Number(x.lastTrainDay||0)||0,
      lastTrainingType:String(x.lastTrainingType||''),
      lastSkillGain:Number(x.lastSkillGain||0)||0,
      lastCost:Number(x.lastCost||0)||0,
      lastCompletedAt:Number(x.lastCompletedAt||0)||0,
      lastSource:String(x.lastSource||'')
    };
  });
  return {cashSpent:Number(base.cashSpent||0)||0,totalTrainings:Number(base.totalTrainings||0)||0,lastUpdatedAt:Number(base.lastUpdatedAt||0)||0,talents};
}
function loadCompanyTrainingLedger(companyId=(state.company?.my_company?.id||'guest')){try{return normalizeCompanyTrainingLedger(JSON.parse(localStorage.getItem(companyTrainingLedgerKey(companyId))||'{}'))}catch(_e){return normalizeCompanyTrainingLedger({})}}
function saveCompanyTrainingLedger(ledger,companyId=(state.company?.my_company?.id||'guest')){const norm=normalizeCompanyTrainingLedger(ledger);try{localStorage.setItem(companyTrainingLedgerKey(companyId),JSON.stringify(norm))}catch(_e){}return norm}

function companyTalentTrainingDay(data=state.company){return Math.max(1,Number(data?.talent_day||liveCompanyClock().day||1)||1)}
function companyTalentTrainingEntry(talentId,data=state.company){const ledger=loadCompanyTrainingLedger(data?.my_company?.id||'guest');return ledger.talents[String(talentId)]||null}
function companyTalentTrainingStatus(talent,data=state.company){
  const day=companyTalentTrainingDay(data),entry=companyTalentTrainingEntry(talent?.id,data),trainedToday=Number(entry?.lastTrainDay||0)===day;
  const type=String(entry?.lastTrainingType||'').toUpperCase();
  return {day,entry,trainedToday,type,label:type==='SPECIALTY'?'전문 연수':type==='BALANCED'?'종합 연수':'연수',nextDay:day+1};
}
function recordServerTalentTrainingStatus(talentId,type,result={},data=state.company){
  const companyId=data?.my_company?.id||'guest',ledger=loadCompanyTrainingLedger(companyId),day=companyTalentTrainingDay(data);
  const x=ledger.talents[String(talentId)]||{skill_score:0,monthly_salary:0,innovation:0,sales_skill:0,operations_skill:0,leadership:0,loyalty:0,potential:0,career_level:0,balancedCount:0,specialtyCount:0,totalTrainings:0,totalSpent:0,lastTrainDay:0};
  x.lastTrainDay=day;x.lastTrainingType=String(type||'BALANCED').toUpperCase();x.lastSkillGain=Number(result?.skill_gain||result?.growth||result?.delta_skill||0)||0;x.lastCost=Number(result?.cost||result?.training_cost||0)||0;x.lastCompletedAt=Date.now();x.lastSource='SERVER';x.totalTrainings=Number(x.totalTrainings||0)+1;
  if(x.lastTrainingType==='SPECIALTY')x.specialtyCount=Number(x.specialtyCount||0)+1;else x.balancedCount=Number(x.balancedCount||0)+1;
  ledger.talents[String(talentId)]=x;ledger.totalTrainings=Number(ledger.totalTrainings||0)+1;ledger.lastUpdatedAt=Date.now();saveCompanyTrainingLedger(ledger,companyId);
}
function showTalentTrainingToast(talent,type,message){
  clearTimeout(talentTrainingToastTimer);document.getElementById('talentTrainingToast')?.remove();
  const el=document.createElement('aside');el.id='talentTrainingToast';el.className='talent-training-toast';
  el.innerHTML=`<small>EMPLOYEE TRAINING · 즉시 반영</small><b>${escapeHtml(talent?.name||'직원')} · ${String(type).toUpperCase()==='SPECIALTY'?'전문 연수':'종합 연수'} 완료</b><span>${escapeHtml(message||'능력치와 자동운영 기여도에 연수 결과가 반영되었습니다.')}</span><em>다음 DAY부터 다시 연수할 수 있습니다.</em>`;
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));talentTrainingToastTimer=setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),240)},5200);
}

function localTalentTrainingFallbackable(err){const raw=String(err?.message||'').toLowerCase();return missingRpcError(err)||err?.status===404||raw.includes('not implemented')||raw.includes('unknown action')||raw.includes('미구현')||raw.includes('지원하지 않')}
function talentTrainingFocusKeys(department=''){
  switch(String(department||'').toUpperCase()){
    case 'ENGINEERING':return ['innovation','operations_skill'];
    case 'SALES':return ['sales_skill','leadership'];
    case 'OPERATIONS':return ['operations_skill','leadership'];
    case 'FINANCE':return ['operations_skill','leadership'];
    default:return ['leadership','innovation'];
  }
}
function refreshCompanyTalentDerivedState(data=state.company){
  const talents=(data?.talents||[]).filter(Boolean),count=talents.length;
  const summary=companyAutomationSummary(data);
  const avgSkill=count?talents.reduce((a,t)=>a+Number(t.skill_score||0),0)/count:0;
  const avgPotential=count?talents.reduce((a,t)=>a+Number(t.potential||0),0)/count:0;
  const payroll=talents.reduce((a,t)=>a+Number(t.monthly_salary||t.salary_monthly||0),0);
  const index=Math.round((summary.automationIndex*.38+avgSkill*.42+avgPotential*.20)*10)/10;
  const elite=talents.filter(t=>talentGradeRank(String(talentCareerTitle(t)).replace(/ Lv\..*/,''))>=5).length;
  data.talent_summary={...(data?.talent_summary||{}),avg_skill:Math.round(avgSkill*10)/10,avg_potential:Math.round(avgPotential*10)/10,monthly_salary:payroll,talent_index:index,elite_talent_count:elite};
  if(data?.my_company){
    data.my_company.talent_index=index;
    data.my_company.elite_talent_count=elite;
    if(data.my_company.training_cash_spent==null)data.my_company.training_cash_spent=0;
    if(data.my_company.training_count_local==null)data.my_company.training_count_local=0;
  }
  return data;
}
function applyLocalTalentTrainingState(data=state.company){
  const companyId=(data?.my_company?.id||'guest');
  const ledger=loadCompanyTrainingLedger(companyId);
  const talents=(data?.talents||[]).filter(Boolean);
  talents.forEach(t=>{
    const entry=ledger.talents[String(t.id)];if(!entry)return;
    t.skill_score=Math.max(0,Number(t.skill_score||0)+Number(entry.skill_score||0));
    t.monthly_salary=Math.max(0,Number(t.monthly_salary||t.salary_monthly||0)+Number(entry.monthly_salary||0));
    t.innovation=Math.max(0,Number(t.innovation||0)+Number(entry.innovation||0));
    t.sales_skill=Math.max(0,Number(t.sales_skill||0)+Number(entry.sales_skill||0));
    t.operations_skill=Math.max(0,Number(t.operations_skill||0)+Number(entry.operations_skill||0));
    t.leadership=Math.max(0,Number(t.leadership||0)+Number(entry.leadership||0));
    t.loyalty=Math.max(0,Number(t.loyalty||0)+Number(entry.loyalty||0));
    t.potential=Math.max(0,Math.min(100,Number(t.potential||0)+Number(entry.potential||0)));
    t.career_level=Math.max(1,Math.round(Number(t.career_level||1)+Number(entry.career_level||0)));
    t._localTrainingCount=Number(entry.totalTrainings||0)||0;
    t._localLastTrainingDay=Number(entry.lastTrainDay||0)||0;
  });
  if(data?.my_company){
    data.my_company.cash=Math.max(0,Number(data.my_company.cash||0)-Number(ledger.cashSpent||0));
    data.my_company.training_cash_spent=Number(ledger.cashSpent||0)||0;
    data.my_company.training_count_local=Number(ledger.totalTrainings||0)||0;
  }
  return refreshCompanyTalentDerivedState(data);
}
function simulateTalentTrainingPlan(talent,type='BALANCED'){
  const focus=talentTrainingFocusKeys(talent?.department);
  const trained=Math.max(0,Number(talent?._localTrainingCount||0)||0);
  const potential=Math.max(35,Number(talent?.potential||60)||60);
  const baseSalary=Math.max(0,Number(talent?.monthly_salary||talent?.salary_monthly||0));
  const specialty=String(type||'BALANCED').toUpperCase()==='SPECIALTY';
  const diminishing=Math.max(0,trained-2)*0.3;
  const skillGain=Math.round(Math.max(specialty?1.2:0.8,(potential*0.035)+(specialty?1.9:1.2)-diminishing)*10)/10;
  const payRaise=Math.max(50000,Math.round(baseSalary*(specialty?0.018:0.012)));
  const cost=Math.max(specialty?4000000:2500000,Math.round(baseSalary*(specialty?0.42:0.26)));
  const delta={skill_score:skillGain,monthly_salary:payRaise,innovation:0,sales_skill:0,operations_skill:0,leadership:0,loyalty:specialty?1.3:2.1,potential:0,career_level:(trained>0&&(trained+1)%3===0)?1:0};
  if(specialty){delta[focus[0]]=4;delta[focus[1]]=(delta[focus[1]]||0)+2;}else{['innovation','sales_skill','operations_skill','leadership'].forEach(k=>delta[k]=1);delta[focus[0]]=(delta[focus[0]]||0)+1;}
  const focusName=focus[0]==='innovation'?'혁신':focus[0]==='sales_skill'?'영업':'운영';
  return {cost,delta,skillGain,payRaise,focusName,levelUp:delta.career_level>0,label:specialty?'전문 연수':'종합 연수'};
}
function applyLocalTalentTraining(talentId,type='BALANCED',data=state.company){
  const my=data?.my_company;const talents=(data?.talents||[]).filter(Boolean);const talent=talents.find(t=>String(t.id)===String(talentId));
  if(!my||!talent)return {ok:false,message:'연수 대상을 찾지 못했습니다.'};
  const companyId=(my.id||'guest');
  const ledger=loadCompanyTrainingLedger(companyId);
  const currentDay=Math.max(1,Number(data?.talent_day||liveCompanyClock().day||1)||1);
  const existing=ledger.talents[String(talentId)]||{skill_score:0,monthly_salary:0,innovation:0,sales_skill:0,operations_skill:0,leadership:0,loyalty:0,potential:0,career_level:0,balancedCount:0,specialtyCount:0,totalTrainings:0,totalSpent:0,lastTrainDay:0};
  if(Number(existing.lastTrainDay||0)===currentDay)return {ok:false,message:`${talent.name} 직원은 오늘 이미 연수를 받았습니다. 다음 DAY에 다시 진행해 주세요.`};
  const plan=simulateTalentTrainingPlan(talent,type);
  const availableCash=Math.max(0,Number(my.cash||0));
  if(availableCash<plan.cost)return {ok:false,message:`법인 현금이 부족합니다. 필요 금액 ${formatKrwSmart(plan.cost)}.`};
  Object.entries(plan.delta).forEach(([k,v])=>{existing[k]=Number(existing[k]||0)+Number(v||0)});
  existing.totalTrainings=Number(existing.totalTrainings||0)+1;
  existing.totalSpent=Number(existing.totalSpent||0)+plan.cost;
  existing.lastTrainDay=currentDay;existing.lastTrainingType=String(type||'BALANCED').toUpperCase();existing.lastSkillGain=Number(plan.skillGain||0)||0;existing.lastCost=Number(plan.cost||0)||0;existing.lastCompletedAt=Date.now();existing.lastSource='LOCAL';
  if(String(type).toUpperCase()==='SPECIALTY')existing.specialtyCount=Number(existing.specialtyCount||0)+1;else existing.balancedCount=Number(existing.balancedCount||0)+1;
  ledger.talents[String(talentId)]=existing;
  ledger.cashSpent=Number(ledger.cashSpent||0)+plan.cost;
  ledger.totalTrainings=Number(ledger.totalTrainings||0)+1;
  ledger.lastUpdatedAt=Date.now();
  saveCompanyTrainingLedger(ledger,companyId);
  talent.skill_score=Math.max(0,Number(talent.skill_score||0)+Number(plan.delta.skill_score||0));
  talent.monthly_salary=Math.max(0,Number(talent.monthly_salary||talent.salary_monthly||0)+Number(plan.delta.monthly_salary||0));
  talent.innovation=Math.max(0,Number(talent.innovation||0)+Number(plan.delta.innovation||0));
  talent.sales_skill=Math.max(0,Number(talent.sales_skill||0)+Number(plan.delta.sales_skill||0));
  talent.operations_skill=Math.max(0,Number(talent.operations_skill||0)+Number(plan.delta.operations_skill||0));
  talent.leadership=Math.max(0,Number(talent.leadership||0)+Number(plan.delta.leadership||0));
  talent.loyalty=Math.max(0,Number(talent.loyalty||0)+Number(plan.delta.loyalty||0));
  talent.potential=Math.max(0,Math.min(100,Number(talent.potential||0)+Number(plan.delta.potential||0)));
  talent.career_level=Math.max(1,Math.round(Number(talent.career_level||1)+Number(plan.delta.career_level||0)));
  talent._localTrainingCount=Number(existing.totalTrainings||0)||0;
  talent._localLastTrainingDay=currentDay;
  my.cash=Math.max(0,availableCash-plan.cost);
  my.training_cash_spent=Number(my.training_cash_spent||0)+plan.cost;
  my.training_count_local=Number(my.training_count_local||0)+1;
  refreshCompanyTalentDerivedState(data);
  return {ok:true,message:`${talent.name} ${plan.label} 완료 · 역량 +${plan.skillGain.toFixed(1)} · ${plan.focusName} 역량 강화 · 비용 ${formatKrwSmart(plan.cost)}${plan.levelUp?' · 레벨 상승':''}.`};
}


function clampTalent(v,lo=1,hi=99){return Math.max(lo,Math.min(hi,Number(v)||0))}
function seededTalentNoise(seed=1){let x=Math.sin(Number(seed||1)*12.9898+78.233)*43758.5453;return (x-Math.floor(x))*2-1}
function companyTalentEmployerAttractiveness(my=state.company?.my_company){
  const valuation=Math.max(100000000,Number(my?.valuation||0));
  const employees=Math.max(1,Number(my?.employees||1));
  const avgSalary=Math.max(2500000,Number(my?.avg_monthly_salary||0)||Number(my?.monthly_payroll||0)/employees||4000000);
  const valueScore=clampTalent(30+(Math.log10(valuation)-9)*26,15,100);
  const salaryScore=clampTalent(30+((avgSalary-4000000)/1000000)*4,15,100);
  const reputation=clampTalent((Number(my?.brand||50)+Number(my?.media_reputation||50)+Number(my?.employee_morale||60))/3,20,100);
  const score=clampTalent(valueScore*.52+salaryScore*.38+reputation*.10,10,100);
  const label=score>=88?'세계 최상위 인재 유입':score>=74?'최상급 인재 유입':score>=60?'우수 인재 유입':score>=45?'경력 인재 중심':'신입·중견 인재 중심';
  return {score,valueScore,salaryScore,reputation,avgSalary,valuation,label};
}
function talentMarketMonthlySalary(skill=50){
  skill=clampTalent(skill,35,100);
  let v=4000000;
  if(skill<60)v=4000000+(skill-35)*160000;
  else if(skill<75)v=8000000+(skill-60)*600000;
  else if(skill<85)v=17000000+(skill-75)*1800000;
  else if(skill<92)v=35000000+(skill-85)*5000000;
  else if(skill<97)v=70000000+(skill-92)*12000000;
  else v=130000000+(skill-97)*18000000;
  return Math.round(Math.max(3500000,v)/100000)*100000;
}
function talentTitleFromSkill(skill=50){if(skill>=98)return ['마스터',24];if(skill>=94)return ['천재',18];if(skill>=88)return ['핵심인재',14];if(skill>=80)return ['수재',10];if(skill>=72)return ['전문가',7];if(skill>=62)return ['경력직',4];return ['신입',1]}
function shapeRecruitPoolByEmployer(pool=[],my=state.company?.my_company,day=1){
  const attraction=companyTalentEmployerAttractiveness(my);
  return (pool||[]).map((c,idx)=>{
    const seed=(Number(c.id)||idx+1)*31+(Number(my?.id)||1)*17+Number(day||1)*13;
    const noise=seededTalentNoise(seed);
    const target=48+attraction.score*.46+noise*7;
    const base=Number(c.skill_score||55);
    const skill=clampTalent(base*.15+target*.85,42,99.7);
    const potential=clampTalent(Math.max(Number(c.potential||50),skill+7+seededTalentNoise(seed+2)*5),45,100);
    const [grade,level]=talentTitleFromSkill(skill);
    const marketSalary=talentMarketMonthlySalary(skill);
    const salary=Math.max(Number(c.monthly_salary||c.salary_monthly||0),marketSalary);
    const signBonus=Math.max(Number(c.signing_bonus||c.sign_bonus||0),Math.round(salary*(skill>=92?5:skill>=82?4:3)/100000)*100000);
    const metric=(offset)=>clampTalent(skill+seededTalentNoise(seed+offset)*8,35,100);
    return {...c,skill_score:Math.round(skill*10)/10,potential:Math.round(potential),grade,career_title:grade,career_level:Math.max(Number(c.career_level||0),level),monthly_salary:salary,salary_monthly:salary,signing_bonus:signBonus,sign_bonus:signBonus,innovation:metric(3),sales_skill:metric(5),operations_skill:metric(7),leadership:metric(11),_employer_attraction:attraction.score};
  });
}
function shapePoachTargetCompensation(pool=[]){
  return (pool||[]).map((t,idx)=>{const skill=Math.max(35,Number(t.skill_score||55));const fair=talentMarketMonthlySalary(skill);const current=Math.max(Number(t.monthly_salary||t.current_salary||0),Math.round(fair*.78/100000)*100000);return {...t,monthly_salary:current,current_salary:current,ask_salary:Math.max(Number(t.ask_salary||0),Math.round(current*1.18/100000)*100000),ask_bonus:Math.max(Number(t.ask_bonus||0),Math.round(current*(skill>=90?5:4)/100000)*100000)}});
}

const COMPANY_LOCAL_HIRE_PROFILE_PREFIX='kx_company_local_hire_profiles_v1';
function companyLocalHireProfilesKey(companyId=(state.company?.my_company?.id||'guest')){return `${COMPANY_LOCAL_HIRE_PROFILE_PREFIX}_${companyId}`}
function loadLocalHireProfiles(companyId=(state.company?.my_company?.id||'guest')){try{const a=JSON.parse(localStorage.getItem(companyLocalHireProfilesKey(companyId))||'[]');return Array.isArray(a)?a:[]}catch(_e){return []}}
function saveLocalHireProfiles(rows,companyId=(state.company?.my_company?.id||'guest')){try{localStorage.setItem(companyLocalHireProfilesKey(companyId),JSON.stringify((rows||[]).slice(-60)))}catch(_e){}}
function rememberLocalHireProfile(candidate,my=state.company?.my_company){if(!candidate||!my)return;const rows=loadLocalHireProfiles(my.id||'guest');const profile={source_id:Number(candidate.id)||0,name:String(candidate.name||''),skill_score:Number(candidate.skill_score||0),potential:Number(candidate.potential||0),grade:candidate.grade||candidate.career_title||'',career_title:candidate.career_title||candidate.grade||'',career_level:Number(candidate.career_level||1),monthly_salary:Number(candidate.monthly_salary||candidate.salary_monthly||0),innovation:Number(candidate.innovation||0),sales_skill:Number(candidate.sales_skill||0),operations_skill:Number(candidate.operations_skill||0),leadership:Number(candidate.leadership||0),signing_bonus:Number(candidate.signing_bonus||candidate.sign_bonus||0)};const filtered=rows.filter(r=>!(Number(r.source_id)===profile.source_id&&profile.source_id)||String(r.name)!==profile.name);filtered.push(profile);saveLocalHireProfiles(filtered,my.id||'guest')}
function applyLocalHireProfiles(data=state.company){const my=data?.my_company;if(!my)return data;const rows=loadLocalHireProfiles(my.id||'guest');if(!rows.length)return data;for(const t of data.talents||[]){const p=rows.find(r=>(Number(r.source_id)>0&&Number(r.source_id)===Number(t.id))||(r.name&&String(r.name)===String(t.name)));if(!p)continue;t.skill_score=Math.max(Number(t.skill_score||0),Number(p.skill_score||0));t.potential=Math.max(Number(t.potential||0),Number(p.potential||0));t.monthly_salary=Math.max(Number(t.monthly_salary||t.salary_monthly||0),Number(p.monthly_salary||0));t.innovation=Math.max(Number(t.innovation||0),Number(p.innovation||0));t.sales_skill=Math.max(Number(t.sales_skill||0),Number(p.sales_skill||0));t.operations_skill=Math.max(Number(t.operations_skill||0),Number(p.operations_skill||0));t.leadership=Math.max(Number(t.leadership||0),Number(p.leadership||0));t.career_level=Math.max(Number(t.career_level||1),Number(p.career_level||1));if(p.career_title)t.career_title=p.career_title;if(p.grade)t.grade=p.grade;}refreshCompanyTalentDerivedState(data);return data}

const COMPANY_LOCAL_POACH_PREFIX='kx_company_local_poach_v1';
function companyLocalPoachKey(companyId=(state.company?.my_company?.id||'guest')){return `${COMPANY_LOCAL_POACH_PREFIX}_${companyId}`}
function loadLocalPoachLedger(companyId=(state.company?.my_company?.id||'guest')){try{const r=JSON.parse(localStorage.getItem(companyLocalPoachKey(companyId))||'{}')||{};return {poached:Array.isArray(r.poached)?r.poached:[],removedIds:Array.isArray(r.removedIds)?r.removedIds.map(Number):[],cashSpent:Number(r.cashSpent||0)||0,totalAttempts:Number(r.totalAttempts||0)||0}}catch(_e){return {poached:[],removedIds:[],cashSpent:0,totalAttempts:0}}}
function saveLocalPoachLedger(ledger,companyId=(state.company?.my_company?.id||'guest')){try{localStorage.setItem(companyLocalPoachKey(companyId),JSON.stringify(ledger))}catch(_e){}return ledger}
function applyLocalPoachState(data=state.company){
  const my=data?.my_company;if(!my)return data;
  const ledger=loadLocalPoachLedger(my.id||'guest');
  const removed=new Set((ledger.removedIds||[]).map(Number));
  data.poach_targets=(data.poach_targets||[]).filter(t=>!removed.has(Number(t.id)));
  const existing=new Set((data.talents||[]).map(t=>String(t.id)));
  for(const p of ledger.poached||[]){if(!existing.has(String(p.id))){data.talents.push({...p,_localPoached:true});existing.add(String(p.id));}}
  my.cash=Math.max(0,Number(my.cash||0)-Number(ledger.cashSpent||0));
  my.local_poach_spent=Number(ledger.cashSpent||0)||0;
  refreshCompanyTalentDerivedState(data);
  return data;
}
function localTalentPoachFallbackable(err){const raw=String(err?.message||'').toLowerCase();return missingRpcError(err)||raw.includes('could not find')||raw.includes('schema cache')||raw.includes('not found')||raw.includes('지원하지')||raw.includes('구현되지')}
function sourceCompanyForPoach(t){const sid=Number(t?.company_id||t?.source_company_id||t?.employer_company_id||0);return (state.company?.companies||[]).find(c=>Number(c.id)===sid)||null}
function applyLocalTalentPoach(talentId,offerSalary,signingBonus,data=state.company){
  const my=data?.my_company,target=(data?.poach_targets||[]).find(t=>Number(t.id)===Number(talentId));if(!my||!target)return {ok:false,message:'이직 제안 대상을 찾지 못했습니다.'};
  const ledger=loadLocalPoachLedger(my.id||'guest');
  const skill=Math.max(35,Number(target.skill_score||55));
  const current=Math.max(1,Number(target.monthly_salary||target.current_salary||talentMarketMonthlySalary(skill)));
  offerSalary=Math.max(current,Number(offerSalary||current));signingBonus=Math.max(0,Number(signingBonus||0));
  const ourAttr=companyTalentEmployerAttractiveness(my).score,source=sourceCompanyForPoach(target),sourceAttr=source?companyTalentEmployerAttractiveness(source).score:58;
  const premium=Math.max(0,offerSalary/current-1),bonusMonths=signingBonus/current;
  const chance=Math.max(8,Math.min(96,30+premium*82+Math.min(24,bonusMonths*4)+(ourAttr-sourceAttr)*.38-Math.max(0,skill-78)*.45));
  const headhunter=Math.max(5000000,Math.round(offerSalary*.45/100000)*100000);
  const successCost=signingBonus+headhunter,failCost=Math.max(3000000,Math.round(headhunter*.42/100000)*100000);
  if(Number(my.cash||0)<Math.min(successCost,failCost))return {ok:false,message:`법인 현금이 부족합니다. 최소 착수비 ${formatKrwSmart(failCost)}가 필요합니다.`};
  ledger.totalAttempts=Number(ledger.totalAttempts||0)+1;
  const success=Math.random()*100<chance;
  if(!success){ledger.cashSpent=Number(ledger.cashSpent||0)+failCost;saveLocalPoachLedger(ledger,my.id||'guest');my.cash=Math.max(0,Number(my.cash||0)-failCost);return {ok:true,success:false,success_chance:chance,message:`${target.name}이(가) 제안을 거절했습니다. 수락확률 ${chance.toFixed(1)}% · 헤드헌터 착수비 ${formatKrwSmart(failCost)} 지출.`};}
  if(Number(my.cash||0)<successCost)return {ok:false,message:`제안은 매력적이지만 사인보너스·헤드헌터 비용 ${formatKrwSmart(successCost)}을 지급할 현금이 부족합니다.`};
  const localId=-(100000000+Math.abs(Number(target.id)||ledger.totalAttempts)%70000000+ledger.totalAttempts*1000);
  const hired={...target,id:localId,source_talent_id:Number(target.id)||0,company_name:my.name,source_company_name:target.company_name||target.source_company_name||'',monthly_salary:offerSalary,salary_monthly:offerSalary,signing_bonus:signingBonus,loyalty:Math.max(55,Number(target.loyalty||55)),_localPoached:true};
  ledger.poached.push(hired);ledger.removedIds=[...new Set([...(ledger.removedIds||[]).map(Number),Number(target.id)])];ledger.cashSpent=Number(ledger.cashSpent||0)+successCost;saveLocalPoachLedger(ledger,my.id||'guest');
  my.cash=Math.max(0,Number(my.cash||0)-successCost);data.poach_targets=(data.poach_targets||[]).filter(t=>Number(t.id)!==Number(target.id));data.talents=[...(data.talents||[]),hired];refreshCompanyTalentDerivedState(data);
  return {ok:true,success:true,success_chance:chance,message:`${target.name} 영입 성공 · 수락확률 ${chance.toFixed(1)}% · 새 월급 ${formatKrwSmart(offerSalary)} · 즉시 비용 ${formatKrwSmart(successCost)}.`};
}
function terminateLocalPoachedTalent(talentId,severance=0,data=state.company){
  const my=data?.my_company;if(!my)return {ok:false,message:'회사 정보를 찾지 못했습니다.'};const ledger=loadLocalPoachLedger(my.id||'guest');
  const before=ledger.poached.length;ledger.poached=ledger.poached.filter(t=>Number(t.id)!==Number(talentId));if(ledger.poached.length===before)return {ok:false,message:'로컬 영입 직원을 찾지 못했습니다.'};
  ledger.cashSpent=Number(ledger.cashSpent||0)+Math.max(0,Number(severance||0));saveLocalPoachLedger(ledger,my.id||'guest');my.cash=Math.max(0,Number(my.cash||0)-Math.max(0,Number(severance||0)));data.talents=(data.talents||[]).filter(t=>Number(t.id)!==Number(talentId));refreshCompanyTalentDerivedState(data);return {ok:true,message:'직원의 퇴직 처리가 완료되었습니다.'};
}


function inferPoachSuccess(result={},talent=null,data=state.company){
  if(result?.success===true||result?.accepted===true||result?.hired===true)return true;
  if(result?.success===false||result?.accepted===false)return false;
  const msg=String(result?.message||'');if(/거절|실패|불발|declin|reject/i.test(msg))return false;if(/영입 성공|이직 성공|수락|합류|accepted/i.test(msg))return true;
  if(talent?.name&&(data?.talents||[]).some(t=>String(t.name)===String(talent.name)))return true;
  if(talent?.id&&!(data?.poach_targets||[]).some(t=>Number(t.id)===Number(talent.id)))return true;
  return false;
}
function showTalentPoachResult(talent,result,offerSalary,signingBonus){
  document.getElementById('talentPoachResult')?.remove();
  const success=inferPoachSuccess(result,talent,state.company),chance=result?.success_chance!=null?Number(result.success_chance):null;
  const el=document.createElement('div');el.id='talentPoachResult';el.className=`talent-poach-result ${success===true?'success':success===false?'reject':'neutral'}`;
  el.innerHTML=`<section><button type="button" class="poach-result-close">×</button><small>HEADHUNTING RESULT</small><h2>${success===true?'✓ 이직 제안 수락':success===false?'✕ 이직 제안 거절':'이직 협상 결과'}</h2><b>${escapeHtml(talent?.name||'인재')}</b><div class="poach-result-grid"><span><small>제시 월급</small><b>${formatKrwSmart(offerSalary)}</b></span><span><small>사인보너스</small><b>${formatKrwSmart(signingBonus)}</b></span>${chance!=null&&Number.isFinite(chance)?`<span><small>수락확률</small><b>${chance.toFixed(1)}%</b></span>`:''}</div><p>${escapeHtml(result?.message||state.companyNotice||'협상 결과가 반영되었습니다.')}</p><button type="button" class="poach-result-ok">확인</button></section>`;
  document.body.appendChild(el);const close=()=>el.remove();el.querySelector('.poach-result-close').onclick=close;el.querySelector('.poach-result-ok').onclick=close;el.onclick=e=>{if(e.target===el)close()};
}

function companyInterviewFee(data=state.company,uses=0){const payroll=Math.max(Number(data?.my_company?.monthly_payroll||0)||0,Number(companyAutomationSummary(data).payroll)||0,50000000);const base=Math.max(12000000,Math.round(payroll*0.04/1000000)*1000000);const mult=uses<=0?1:uses===1?1.35:uses===2?1.8:2.45+(uses-3)*0.65;return Math.max(12000000,Math.round(base*mult/1000000)*1000000)}
function buildCompanyInterviewShortlist(data=state.company,meta=loadCompanyTalentDeskMeta(data)){const used=Math.max(1,Number(meta?.interviewCount)||1),day=Math.max(1,Number(data?.talent_day||liveCompanyClock().day)||1);const recruits=(data?.recruit_pool||[]).filter(c=>!c?.hired&&!/HIRED/i.test(String(c?.status||''))).map(c=>({...c,_source:'recruit',_ref:`candidate-card-${c.id}`}));const poaches=(data?.poach_targets||[]).filter(Boolean).map(c=>({...c,_source:'poach',_ref:`poach-card-${c.id}`}));return [...recruits,...poaches].map((p,idx)=>{const m=talentMetricSnapshot(p),auto=talentAutopilotContribution(p),fit=Math.max(45,Math.min(98,Math.round((m.operations*0.34+m.leadership*0.28+m.sales*0.2+m.innovation*0.18)-Math.max(0,used-2)*2+((Number(p.id)||idx)+day)%7))),accept=Math.max(38,Math.min(96,Math.round((m.skillScore*0.65+auto*0.35)-Math.max(0,used-2)*3+((Number(p.id)||idx)+day)%9)));return {key:`${p._source}-${p.id}`,source:p._source,refId:p._ref,id:p.id,name:p.name,role:p.role,level:p.level,specialty:p.specialty,department:p.department,skillScore:m.skillScore,salary:m.salary,signBonus:m.signBonus,potential:m.potential,auto,fit,accept}}).sort((a,b)=>(b.auto*1.2+b.skillScore+b.fit*0.35+b.accept*0.15)-(a.auto*1.2+a.skillScore+a.fit*0.35+a.accept*0.15)).slice(0,3)}
function openCompanyInterviewDesk(data=state.company){const meta=loadCompanyTalentDeskMeta(data),next={...meta,day:Math.max(1,Number(data?.talent_day||liveCompanyClock().day)||1),interviewCount:(Number(meta.interviewCount)||0)+1,lastOpenedAt:Date.now()};next.shortlist=buildCompanyInterviewShortlist(data,next);saveCompanyTalentDeskMeta(next);return next}
function renderInterviewSourceLabel(src='recruit'){return src==='poach'?'스카우트 대상':'오늘의 채용시장'}
function renderTalentAutomationDesk(data,summary,desk){const uses=Math.max(0,Number(desk?.interviewCount)||0),fee=companyInterviewFee(data,uses),surcharge=companyInterviewSurcharge(uses+1),level=summary.grade?.[1]||'직접 관리';return `<section class="talent-automation-panel"><article class="talent-automation-card"><div class="talent-automation-head"><div><small>AUTOPILOT</small><h3>핵심인재 자동 운영</h3></div><b>${escapeHtml(level)}</b></div><p>좋은 직원을 많이 확보할수록 회사가 자동으로 더 안정적으로 굴러갑니다. 매출 실행, 운영 안정성, 방어력이 함께 보정됩니다.</p><div class="talent-automation-grid"><div><span>자동 운영 지수</span><b>${summary.automationIndex.toFixed(1)}</b></div><div><span>예상 매출 보조</span><b>+${summary.revenueBoost.toFixed(1)}%</b></div><div><span>운영 안정성</span><b>+${summary.efficiencyBoost.toFixed(1)}%</b></div><div><span>방어력 보조</span><b>+${summary.defenseBoost.toFixed(1)}</b></div></div><ul class="talent-automation-points"><li>운영·리더십이 높을수록 회사가 스스로 굴러가는 힘이 커집니다.</li><li>영업·혁신이 높을수록 자동 매출 보조가 커집니다.</li><li>좋은 직원을 채용할수록 인사 탭의 효율 지표도 함께 올라갑니다.</li></ul></article><article class="interview-desk-card"><div class="interview-desk-head"><div><small>PAID INTERVIEW DESK</small><h3>유료 면접 데스크</h3><p>하루 기본 지급 외에 추가로 좋은 직원을 찾는 방법입니다. 같은 날 너무 자주 열면 시장 기대연봉이 올라갑니다.</p></div><button type="button" data-talent-interview="open">${uses?`면접 다시 열기 · ${formatKrwSmart(fee)}`:`면접 열기 · ${formatKrwSmart(fee)}`}</button></div><div class="interview-desk-meta"><span>오늘 진행 ${uses}회</span><span>다음 면접 과열도 ${surcharge}%</span><span>기준 DAY ${Math.max(1,Number(data?.talent_day||liveCompanyClock().day)||1)}</span></div>${desk?.shortlist?.length?`<div class="interview-shortlist">${desk.shortlist.map(c=>`<article class="interview-candidate"><div><small>${renderInterviewSourceLabel(c.source)}</small><b>${escapeHtml(c.name)}</b><span>${escapeHtml(talentDepartmentShort(c.department||''))} · ${escapeHtml(c.specialty||c.role||'-')}</span></div><div class="interview-candidate-kpis"><span>자동운영 <b>${c.auto.toFixed(1)}</b></span><span>적합도 <b>${c.fit}%</b></span><span>수락 가능성 <b>${c.accept}%</b></span></div><div class="interview-candidate-pay"><span>월급 ${formatKrwSmart(c.salary)}</span>${c.signBonus?`<span>사인보너스 ${formatKrwSmart(c.signBonus)}</span>`:''}</div><button type="button" data-talent-jump="${escapeHtml(c.refId)}">후보 위치로 이동</button></article>`).join('')}</div>`:`<div class="interview-empty">아직 오늘 면접을 열지 않았습니다. 좋은 직원을 찾고 싶다면 유료 면접 데스크를 열어보세요.</div>`}</article></section>`}

function talentGradeKey(t){
  const title=String(talentCareerTitle(t)||t?.grade||'신입');
  if(title.startsWith('거장'))return '거장';
  return title;
}
function talentGradeSortValue(g){return ({'신입':1,'주니어':2,'경력직':3,'시니어':4,'전문가':5,'수재':6,'핵심인재':7,'천재':8,'마스터':9,'거장':10})[g]||99}
function filteredCompanyTalents(){
  const talents=(state.company?.talents||[]).filter(Boolean),filter=String(state.companyTalentGradeFilter||'ALL');
  return filter==='ALL'?talents:talents.filter(t=>talentGradeKey(t)===filter);
}
function renderEmployeeQuickRoster(my){
  const talents=(state.company?.talents||[]).filter(Boolean);
  const ledger=loadCompanyTrainingLedger(state.company?.my_company?.id||'guest');
  const day=companyTalentTrainingDay(state.company);
  const localTrainCount=Number(ledger.totalTrainings||0)||0;
  const localTrainSpent=Number(ledger.cashSpent||0)||0;
  const trainedToday=talents.filter(t=>Number(ledger.talents[String(t.id)]?.lastTrainDay||0)===day).length;
  if(!talents.length)return `<section class="employee-roster-quick"><div class="employee-roster-head"><div><small>EMPLOYEE ROSTER</small><h3>재직 핵심인재</h3></div><span>아직 이름이 있는 핵심인재가 없습니다.</span></div></section>`;
  const counts={};for(const t of talents){const g=talentGradeKey(t);counts[g]=(counts[g]||0)+1}
  const grades=Object.keys(counts).sort((a,b)=>talentGradeSortValue(a)-talentGradeSortValue(b));
  let filter=String(state.companyTalentGradeFilter||'ALL');if(filter!=='ALL'&&!counts[filter]){filter='ALL';state.companyTalentGradeFilter='ALL'}
  const rows=[...talents].filter(t=>filter==='ALL'||talentGradeKey(t)===filter).sort((a,b)=>talentGradeSortValue(talentGradeKey(b))-talentGradeSortValue(talentGradeKey(a))||Number(b.skill_score||0)-Number(a.skill_score||0));
  const progress=Math.max(0,Math.min(100,talents.length?trainedToday/talents.length*100:0));
  return `<section class="employee-roster-quick grade-roster"><div class="employee-roster-head"><div><small>EMPLOYEE ROSTER</small><h3>재직 핵심인재</h3><p>연수는 기다리는 작업이 아니라 <b>승인 즉시 완료·반영</b>됩니다. 오늘 완료한 직원은 다음 DAY부터 다시 연수할 수 있습니다.</p></div><span>${rows.length}/${talents.length}명</span></div><div class="training-status-board"><div><small>TODAY TRAINING</small><b>오늘 연수 완료 ${trainedToday}/${talents.length}명</b><span>${trainedToday?`DAY ${day} 연수 결과가 이미 반영되었습니다.`:'아직 오늘 연수를 받은 직원이 없습니다.'}</span></div><div class="training-progress-track"><i style="width:${progress.toFixed(1)}%"></i></div><div class="training-status-meta"><span>누적 연수 <b>${nf.format(localTrainCount)}회</b></span><span>로컬 대체 연수비 <b>${formatKrwSmart(localTrainSpent)}</b></span><span>재교육 가능 <b>DAY ${day+1}</b></span></div></div><div class="training-choice-guide"><article><small>종합 연수 · 균형 성장</small><b>전체 능력을 고르게 올림</b><span>혁신·영업·운영·리더십을 모두 +1, 부서 핵심능력은 추가 +1, 충성도 상승이 큽니다.</span><em>비용 낮음 · 신입/경력직의 기초 육성에 추천</em></article><article><small>전문 연수 · 주특기 집중</small><b>부서 핵심 능력을 크게 올림</b><span>부서 핵심능력 +4, 보조능력 +2 중심으로 집중 성장하며 현재 역량 상승폭도 더 큽니다.</span><em>비용 높음 · 이미 방향이 잡힌 핵심인재 육성에 추천</em></article></div><div class="employee-grade-tabs"><button type="button" data-talent-grade-filter="ALL" class="${filter==='ALL'?'on':''}">전체 <b>${talents.length}</b></button>${grades.map(g=>`<button type="button" data-talent-grade-filter="${escapeHtml(g)}" class="${filter===g?'on':''}">${escapeHtml(g)} <b>${counts[g]}</b></button>`).join('')}</div><div class="employee-roster-table"><div class="employee-roster-row header"><span>직원</span><span>부서</span><span>역량 / 잠재력</span><span>월급</span><span>자동운영</span><span>관리</span></div>${rows.map(t=>{const st=companyTalentTrainingStatus(t,state.company);const entry=st.entry;const done=st.trainedToday;const detail=done?`${st.label} 완료${Number(entry?.lastSkillGain||0)>0?` · 역량 +${Number(entry.lastSkillGain).toFixed(1)}`:''}`:'오늘 연수 가능';return `<div class="employee-roster-row ${done?'training-done':''}"><span class="employee-name">${talentGradeBadge(t)}<b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.specialty||'-')} · Lv.${Number(t.career_level||1)}</small>${done?`<em class="employee-training-inline">✓ ${escapeHtml(detail)}</em>`:''}</span><span>${escapeHtml(talentDepartmentShort(t.department))}</span><span><b>${Number(t.skill_score||0).toFixed(1)}</b><small>잠재력 ${Number(t.potential||50).toFixed(0)}</small></span><span>${formatKrwSmart(t.monthly_salary||0)}</span><span>+${talentAutopilotContribution(t).toFixed(1)}</span><span class="employee-roster-actions">${done?`<div class="employee-training-status"><b>오늘 연수 완료</b><small>DAY ${st.nextDay}부터 재교육 가능</small></div>`:''}<button type="button" data-talent-train="${t.id}" data-training-type="BALANCED" ${done?'disabled':''}>${done?'오늘 완료':'종합 연수 · 균형'}</button><button type="button" data-talent-train="${t.id}" data-training-type="SPECIALTY" ${done?'disabled':''}>${done?'재교육 대기':'전문 연수 · 집중'}</button><button type="button" class="employee-fire-btn" data-talent-fire="${t.id}">해고</button></span></div>`}).join('')}</div></section>`;
}


function renderTalentMarket(my){
  if(!state.company?.talent_available)return `<section class="talent-market unavailable"><div class="company-section-head mini"><div><h3>핵심인재 시스템</h3></div><span>${escapeHtml(state.company?.talent_error||'V6.4 SQL을 적용해 주세요.')}</span></div></section>`;
  const data=state.company||{},candidates=data.recruit_pool||[],talents=data.talents||[],targets=data.poach_targets||[],offers=data.talent_offers||[],sum=data.talent_summary||{},hired=Number(data.talent_hired_today||0),limit=Number(data.talent_daily_limit||5),day=Math.max(1,Number(data.talent_day||1)||1),summary=companyAutomationSummary(data),desk=loadCompanyTalentDeskMeta(data);
  return `<section class="talent-market talent-v640">
    <div class="talent-command-head"><div><small>PEOPLE & TALENT · DAY ${day}</small><h2>핵심인재실</h2><span>회사 가치와 보상 수준이 높을수록 더 뛰어난 지원자가 들어옵니다. 최상위 인재는 실제 빅테크 수준처럼 매우 높은 월급·사인보너스를 요구할 수 있습니다.</span></div><div><b>${talents.length}명</b><span>오늘 채용 ${hired}/${limit}</span></div></div>
    ${(()=>{const a=companyTalentEmployerAttractiveness(my);return `<div class="talent-attraction-strip"><div><small>채용 매력도</small><b>${a.score.toFixed(0)}/100 · ${escapeHtml(a.label)}</b></div><span>회사 가치 영향 ${a.valueScore.toFixed(0)} · 급여 경쟁력 ${a.salaryScore.toFixed(0)} · 현재 평균 월급 ${formatKrwSmart(a.avgSalary)}</span><em>능력 90+ 최상위 후보는 월 수천만~1억 원대 보상을 요구할 수 있습니다.</em></div>`})()}
    <div class="talent-market-summary board four"><article><small>재직 인재</small><b>${talents.length}명</b><span>평균 역량 ${Number(sum.avg_skill||summary.avgSkill||0).toFixed(1)}</span></article><article><small>월 인건비</small><b>${formatKrwSmart(Number(sum.monthly_salary||summary.payroll||0))}</b><span>개인계약 포함</span></article><article><small>핵심인재 지수</small><b>${Number(sum.talent_index||my.talent_index||50).toFixed(1)}</b><span>평균 잠재력 ${Number(sum.avg_potential||0).toFixed(1)}</span></article><article><small>자동 운영</small><b>${summary.grade[0]}</b><span>지수 ${summary.automationIndex.toFixed(1)} · 방어 +${summary.defenseBoost.toFixed(1)}</span></article></div>
    ${renderEmployeeQuickRoster(my)}
    ${renderTalentAutomationDesk(data,summary,desk)}
    ${offers.length?`<section class="inbound-offers"><div class="compact-section-title"><b>경쟁사 이직 제안 ${offers.length}건</b><span>맞제안하거나 이직을 허용할 수 있습니다.</span></div>${offers.map(o=>`<article><div><small>${escapeHtml(o.buyer_company_name||'경쟁사')} 제안</small><b>${escapeHtml(o.talent_name)}</b><span>${talentGradeBadge({career_title:o.career_title,career_level:o.career_level,grade:o.grade})} · 현재 ${formatKrwSmart(o.current_salary)} → 제시 ${formatKrwSmart(o.offer_salary)}</span></div><div><label>맞제안 월급<input id="matchSalary_${o.id}" value="${formatKrwSmart(Math.max(Number(o.offer_salary||0),Number(o.current_salary||0)*1.08))}"></label><button type="button" data-talent-match="${o.id}">맞제안</button><button type="button" class="secondary" data-talent-release="${o.id}">이직 허용</button></div></article>`).join('')}</section>`:''}
    <details class="talent-block" open><summary><b>오늘의 채용시장 ${candidates.length}명</b><span>기본 지급 후보 · 최대 ${limit}명 채용</span></summary><div class="candidate-grid">${candidates.length?candidates.map(c=>{const done=c.hired||/HIRED/i.test(String(c.status||''));return `<article class="candidate-card ${done?'hired':''}" id="candidate-card-${c.id}"><div class="candidate-top">${talentGradeBadge(c)}<b>${escapeHtml(c.name)}</b><em>${escapeHtml(talentDepartmentShort(c.department))} · ${escapeHtml(c.role||c.specialty||'-')} · ${escapeHtml(c.specialty||c.role||'-')}</em></div><div class="candidate-dual-score"><div><strong>${Number(c.skill_score||0).toFixed(1)}</strong><span>현재 역량</span></div><div><strong>${Number(c.potential||50).toFixed(0)}</strong><span>잠재력 · ${talentPotentialLabel(c.potential)}</span></div></div><div class="talent-stats"><span>혁신 <b>${Number(c.innovation||0).toFixed(0)}</b></span><span>영업 <b>${Number(c.sales_skill||0).toFixed(0)}</b></span><span>운영 <b>${Number(c.operations_skill||0).toFixed(0)}</b></span><span>리더십 <b>${Number(c.leadership||0).toFixed(0)}</b></span></div><div class="candidate-pay"><span>월급 <b>${formatKrwSmart(c.monthly_salary||c.salary_monthly)}</b></span><span>사인보너스 <b>${formatKrwSmart(c.signing_bonus||c.sign_bonus)}</b></span><span>자동운영 기여 <b>${talentAutopilotContribution(c).toFixed(1)}</b></span></div><button type="button" data-talent-hire="${c.id}" ${done||hired>=limit?'disabled':''}>${done?'채용 완료':'채용'}</button></article>`}).join(''):`<div class="empty compact">오늘은 후보가 없습니다. 다음 DAY에 새 인재가 입장합니다.</div>`}</div></details>
    <details class="talent-block"><summary><b>경쟁사 인재 영입 ${targets.length}명</b><span>직접 조건 제시로 스카우트</span></summary><div class="poach-warning">과한 스카우트는 비용과 평판 리스크가 커질 수 있습니다.</div><div class="poach-grid">${targets.length?targets.slice(0,30).map(t=>{const offer=Math.round(Number(t.monthly_salary||t.current_salary||0)*1.2/10000)*10000,bonus=Math.round(Number(t.monthly_salary||t.current_salary||0)*4/10000)*10000;return `<article class="poach-card" id="poach-card-${t.id}"><div class="poach-company"><span class="${t.company_type==='PLAYER'?'player':'bot'}">${t.company_type==='PLAYER'?'유저 회사':'BOT 회사'}</span><b>${escapeHtml(t.company_name||t.source_company_name||'-')}</b></div><div class="poach-person">${talentGradeBadge(t)}<b>${escapeHtml(t.name)}</b><small>${escapeHtml(t.specialty||'-')} · 역량 ${Number(t.skill_score||0).toFixed(1)} · 자동운영 ${talentAutopilotContribution(t).toFixed(1)}</small></div><label>제시 월급<input id="poachSalary_${t.id}" value="${formatKrwSmart(t.ask_salary||offer)}"></label><label>사인보너스<input id="poachBonus_${t.id}" value="${formatKrwSmart((t.ask_bonus||0)||bonus)}"></label><button type="button" data-talent-poach="${t.id}">이직 제안</button></article>`}).join(''):`<div class="empty compact">현재 스카우트 대상이 없습니다.</div>`}</div></details>
  </section>`;
}

function renderPeopleFinanceDesk(my){
  const employees=Math.max(0,Number(my.employees||0));
  const salary=Math.max(0,Number(my.avg_monthly_salary||0));
  const payroll=Math.max(0,Number(my.monthly_payroll||employees*salary));
  const fixed=Math.max(0,Number(my.monthly_fixed_cost||0));
  const talentPremium=Math.max(0,Number(my.talent_monthly_premium||0));
  const runRate=payroll+fixed+talentPremium;
  const due=Math.max(0,Number(my.tax_due||0)+Number(my.tax_arrears||0));
  const cycle=Number(state.company?.world?.cycle_no||0);
  const nextSettlement=120-(cycle%120||0);
  const auto=companyAutomationSummary(state.company);
  const depts=[['ENGINEERING','기술·R&D',Number(my.hr_engineering||0)],['SALES','영업·마케팅',Number(my.hr_sales||0)],['OPERATIONS','생산·운영',Number(my.hr_operations||0)],['FINANCE','재무·준법',Number(my.hr_finance||0)],['MANAGEMENT','경영지원',Number(my.hr_management||0)]];
  return `<section class="corp-section people-finance-desk"><div class="company-section-head"><div><small>PEOPLE · PAYROLL · CASHFLOW</small><h2>인사·급여·고정비</h2></div><span>직원 수, 급여 정책, 부서 인력을 한 화면에서 정리합니다. 핵심인재 자동 운영 지수도 함께 확인할 수 있습니다.</span></div><div class="people-finance-kpis"><article><small>재직 인원</small><b>${nf.format(employees)}명</b><span>직원 사기 ${Number(my.employee_morale||0).toFixed(0)}</span></article><article><small>평균 월급</small><b>${formatKrwSmart(salary)}</b><span>1인 기준</span></article><article><small>월 고정 인건비</small><b>${formatKrwSmart(payroll)}</b><span>일반 인력 기준</span></article><article><small>자동 운영</small><b>${auto.grade[0]}</b><span>매출 +${auto.revenueBoost.toFixed(1)}% · 방어 +${auto.defenseBoost.toFixed(1)}</span></article></div><div class="department-board">${depts.map(d=>`<article><span>${d[1]}</span><b>${nf.format(d[2])}명</b><small>${employees?`${(d[2]/employees*100).toFixed(1)}%`:'0%'}</small></article>`).join('')}</div><div class="hr-action-layout"><form class="hr-action-card" id="companyHireForm"><div class="hr-card-head"><small>QUICK HIRE</small><h3>일반 인력 채용</h3><p>부서별 인원을 일괄로 늘립니다. 핵심인재는 위 인재실에서 별도 영입합니다.</p></div><label>부서<select id="companyHireDepartment">${depts.map(d=>`<option value="${d[0]}">${d[1]}</option>`).join('')}</select></label><label>채용 인원<input id="companyHireCount" type="number" min="1" max="5000" value="10"></label>${companyMoneyInput('companyHireSalary','1인 월급','400만','예: 400만, 650만')}<button type="button" data-company-hr="HIRE">채용 진행</button><div class="hr-card-note">좋은 핵심인재가 많을수록 일반 인력도 더 효율적으로 움직입니다.</div></form><form class="hr-action-card" id="companySalaryForm"><div class="hr-card-head"><small>COMPENSATION</small><h3>급여·성과 보상</h3><p>평균 월급과 성과급을 조정해 사기와 채용 경쟁력을 관리합니다.</p></div>${companyMoneyInput('companySalaryAmount','새 평균 월급',salary?formatKrwSmart(salary):'400만','예: 450만, 700만')}<button type="button" data-company-hr="SET_SALARY">급여 정책 변경</button>${companyMoneyInput('companyBonusAmount','성과급 총액','3000만','예: 3000만, 1억')}<button type="button" data-company-hr="BONUS" class="secondary">성과급 지급</button><div class="hr-card-note">핵심인재 월급 프리미엄 ${formatKrwSmart(talentPremium)} / 월</div></form><form class="hr-action-card danger-card" id="companyLayoffForm"><div class="hr-card-head"><small>WORKFORCE</small><h3>인력 조정</h3><p>불필요한 인력을 줄일 수 있지만 퇴직비용과 사기 하락이 발생할 수 있습니다.</p></div><label>부서<select id="companyLayoffDepartment">${depts.map(d=>`<option value="${d[0]}">${d[1]}</option>`).join('')}</select></label><label>감원 인원<input id="companyLayoffCount" type="number" min="1" max="5000" value="5"></label><button type="button" data-company-hr="LAYOFF" class="risk">인력 조정 실행</button><div class="hr-card-note">월 고정비 ${formatKrwSmart(runRate)} · 현재 세금 ${due?formatKrwSmart(due):'정상'}</div></form></div><div class="accounting-runway"><span><b>현재 고정비</b>${formatKrwSmart(runRate)}/월</span><span><b>다음 회계 결산</b>약 ${nextSettlement||120}주기 뒤</span><span><b>최근 자동 운영비</b>${formatKrwSmart(Number(my.last_operating_cost||0))}</span><span><b>최근 부채 이자</b>${formatKrwSmart(Number(my.last_interest_cost||0))} · 연 ${Number(my.annual_interest_rate||6.5).toFixed(1)}%</span><span><b>누적 급여 비용</b>${formatKrwSmart(Number(my.payroll_accrued||0))}</span></div></section>`;
}

function companyCashRunway(my){
  const payroll=Math.max(0,Number(my.monthly_payroll||Number(my.employees||0)*Number(my.avg_monthly_salary||0)));
  const fixed=Math.max(0,Number(my.monthly_fixed_cost||0));
  const monthly=Math.max(1,payroll+fixed);
  return {monthly,months:Number(my.cash||0)/monthly};
}

function companyRealityDiagnostics(my){
  const runway=companyCashRunway(my),margin=companyProfitMargin(my),debt=companyDebtRatio(my);
  const supply=state.company?.supply||{},hasWorking=['inventory_value','accounts_receivable','accounts_payable'].some(k=>Object.prototype.hasOwnProperty.call(supply,k)||my?.[k]!=null),hasSupply=Object.prototype.hasOwnProperty.call(supply,'supply_risk')||my?.supply_risk!=null,inventory=Math.max(0,Number(supply.inventory_value??my.inventory_value??0)),ar=Math.max(0,Number(supply.accounts_receivable??my.accounts_receivable??0)),ap=Math.max(0,Number(supply.accounts_payable??my.accounts_payable??0));
  const cash=Math.max(1,Number(my.cash||0)),workingGap=inventory+ar-ap,workingPressure=Math.max(0,workingGap/cash*100);
  const offers=(state.company?.talent_offers||[]).length,morale=Math.max(0,Math.min(100,Number(my.employee_morale||60))),turnoverRisk=Math.max(0,Math.min(100,(58-morale)*1.55+offers*8+Math.max(0,Number(my.avg_monthly_salary||0)>0&&Number(my.monthly_payroll||0)>0?0:5)));
  const supplyRisk=Math.max(0,Math.min(100,Number(supply.supply_risk??my.supply_risk??0)));
  const tax=Math.max(0,Number(my.tax_due||0)+Number(my.tax_arrears||0));
  const grade=(value,good,warn,reverse=false)=>{if(reverse)return value<=good?'good':value<=warn?'warn':'danger';return value>=good?'good':value>=warn?'warn':'danger'};
  return {runway,margin,debt,workingGap,workingPressure,turnoverRisk,supplyRisk,tax,rows:[
    {key:'runway',label:'현금 버팀',value:`${runway.months.toFixed(1)}개월`,cls:grade(runway.months,6,3),tip:'급여·고정비를 현재 현금으로 버틸 수 있는 기간'},
    {key:'margin',label:'영업이익률',value:`${margin.toFixed(1)}%`,cls:grade(margin,10,3),tip:'매출 대비 영업이익 비율'},
    {key:'debt',label:'부채 부담',value:`${debt.toFixed(1)}%`,cls:grade(debt,18,35,true),tip:'기업가치 대비 차입금 비율'},
    {key:'working',label:'운전자본 압박',value:hasWorking?`${workingPressure.toFixed(0)}%`:'데이터 대기',cls:hasWorking?grade(workingPressure,35,75,true):'warn',tip:'재고·외상매출이 현금을 묶는 정도'},
    {key:'people',label:'이직 위험',value:`${turnoverRisk.toFixed(0)}/100`,cls:grade(turnoverRisk,25,50,true),tip:'직원 사기와 경쟁사 이직 제안을 반영'},
    {key:'supply',label:'공급망 위험',value:hasSupply?`${supplyRisk.toFixed(0)}/100`:'데이터 대기',cls:hasSupply?grade(supplyRisk,25,50,true):'warn',tip:'조달·물류·공급중단 위험'}
  ]};
}
function renderCompanyRealityHealth(my){
  const d=companyRealityDiagnostics(my);
  return `<section class="reality-health-board" data-tour="reality-health"><div class="reality-health-head"><div><small>REAL MANAGEMENT</small><h2>경영 진단</h2></div><span>${d.rows.filter(x=>x.cls==='danger').length?`위험 ${d.rows.filter(x=>x.cls==='danger').length}건`:'정상 범위'}</span></div><div class="reality-health-grid">${d.rows.map(x=>`<article class="${x.cls}"><small>${x.label}</small><b>${x.value}</b></article>`).join('')}</div>${d.tax>0?`<button type="button" class="reality-tax-alert" data-company-route="risk:compliance">세금 ${formatKrwSmart(d.tax)} 납부 필요</button>`:''}</section>`;
}
function companyImpactMeta(action){
  const map={
    RND:['기술력↑','제품력↑','중장기 매출','중간'],QUALITY:['품질↑','고객신뢰↑','리콜위험↓','낮음'],CAPEX:['생산능력↑','운영력↑','고정비↑','중간'],HIRING:['인재↑','실행력↑','급여비↑','중간'],MARKETING:['브랜드↑','수요↑','점유율↑','높음'],WELFARE:['직원사기↑','생산성↑','이직위험↓','낮음'],COMPLIANCE:['준법↑','조사위험↓','신용↑','낮음'],PRICE_WAR:['점유율↑','마진↓','브랜드위험','높음'],COSTCUT:['현금흐름↑','고정비↓','사기↓','중간'],DIVIDEND:['투자심리↑','현금↓','주주환원','낮음'],LOAN:['현금↑','부채↑','이자비용↑','중간'],REPAY:['부채↓','신용↑','현금↓','낮음']
  };
  return map[action]||['회사 지표 변화','현금 사용','결과 변동','중간'];
}
function companyBudgetGuide(my,action='RND'){
  const cash=Math.max(0,Number(my.cash||0));
  const bands={RND:[.05,.12],QUALITY:[.03,.08],CAPEX:[.08,.18],HIRING:[.03,.08],MARKETING:[.03,.10],WELFARE:[.02,.06],COMPLIANCE:[.02,.05],PRICE_WAR:[.04,.12],DIVIDEND:[.02,.07],REPAY:[.05,.20]};
  const b=bands[action]||[.03,.10];return {low:cash*b[0],high:cash*b[1]};
}
function companyMissionSnapshot(my,myRank,companies){
  const meta=companyGameMeta(),projects=state.company?.projects||[],markets=state.company?.my_markets||[],holdings=state.company?.my_holdings||[],campaigns=state.company?.media_campaigns||[];
  const runway=companyCashRunway(my);const value=Number(my.valuation||0),profit=Number(my.profit||0),morale=Number(my.employee_morale||0),quality=Number(my.product_quality||0);
  const goals=[
    {id:'project',title:'첫 성장 프로젝트 시작',desc:'R&D·품질·설비·마케팅 중 하나를 실행',done:projects.length>0||meta.projects>0,section:'operations',reward:'CEO XP +120'},
    {id:'runway',title:'현금 런웨이 6개월 확보',desc:`현재 ${runway.months.toFixed(1)}개월 · 고정비를 감당할 현금을 확보`,done:runway.months>=6,section:'operations',reward:'안정경영 배지'},
    {id:'media',title:'첫 기업 홍보 집행',desc:'언론사를 골라 회사의 시장 인지도를 움직여 보기',done:campaigns.length>0||meta.media>0,section:'risk',reward:'IR 경험치'},
    {id:'stake',title:'경쟁사 전략지분 확보',desc:'한 경쟁사의 지분을 5% 이상 확보',done:holdings.some(h=>Number(h.stake)>=5),section:'competition',reward:'M&A 경험치'},
    {id:'global',title:'첫 해외시장 진출',desc:'미국·독일·영국·일본·중국 중 한 곳에 진출',done:markets.length>0||meta.expansions>0,section:'operations',reward:'글로벌 배지'},
    {id:'profit',title:'흑자 경영 달성',desc:'영업이익을 0원 이상으로 유지',done:profit>0,section:'operations',reward:'수익경영 배지'},
    {id:'people',title:'조직 건강도 확보',desc:'직원 사기와 제품 품질을 모두 60 이상으로 유지',done:morale>=60&&quality>=60,section:'operations',reward:'조직경영 배지'},
    {id:'scale',title:'기업가치 100억 돌파',desc:`현재 ${formatKrwSmart(value)}`,done:value>=10000000000,section:'dashboard',reward:'성장기업 배지'},
    {id:'rank',title:'TOP 20 진입',desc:`현재 #${myRank||'-'} / ${companies.length}`,done:!!myRank&&myRank<=20,tab:'ranking',reward:'리그 배지'}
  ];
  const completed=goals.filter(g=>g.done).length,xp=completed*120+Math.min(30,Number(meta.actions)||0)*15;
  const level=Math.max(1,Math.min(10,1+Math.floor(xp/300)));const next=level>=10?300:300-(xp%300||0);
  return {goals,completed,xp,level,next,meta,runway};
}
function renderCompanyGameCenter(my,myRank,companies){return '';}
function companyCoachItems(my){
  const rows=[],runway=companyCashRunway(my),projects=state.company?.projects||[],markets=state.company?.my_markets||[],holdings=state.company?.my_holdings||[];
  const tax=Number(my.tax_due||0)+Number(my.tax_arrears||0),threat=companyStakeAgainstMe();
  if(threat>=15)rows.push(['critical','경영권부터 방어','외부 지분이 15%를 넘었습니다. 성장 투자보다 경영권 방어 결정을 먼저 검토하는 편이 안전합니다.','competition']);
  if(tax>0)rows.push(['warn','세금 고지 확인',`${formatKrwSmart(tax)}의 확정·미납 세액이 있습니다. 현금 부족 전에 납부 전략을 정하세요.`,'risk']);
  if(runway.months<4)rows.push(['warn','투자보다 현금 확보',`현재 런웨이 약 ${runway.months.toFixed(1)}개월입니다. 대형 프로젝트보다 비용 조정·현금 확보가 우선입니다.`,'operations']);
  if(Number(my.product_quality||50)<55)rows.push(['good','품질 프로젝트 추천','제품 품질이 낮아 고객 신뢰와 리콜 위험에 불리합니다. QUALITY 프로젝트가 가장 직접적입니다.','operations']);
  if(Number(my.employee_morale||60)<50)rows.push(['good','조직 안정화 추천','직원 사기가 낮습니다. 복지·보상 또는 급여 정책을 먼저 손보면 생산성 하락을 줄일 수 있습니다.','operations']);
  if(!projects.some(p=>['ACTIVE','PAYBACK'].includes(String(p.status))))rows.push(['good','첫 프로젝트 시작','현재 성장 프로젝트가 없습니다. 초반에는 품질 또는 R&D처럼 방향이 분명한 프로젝트가 이해하기 쉽습니다.','operations']);
  if(Number(my.investor_sentiment||50)<48)rows.push(['good','IR·홍보 검토','투자자 심리가 약합니다. 마케팅 프로젝트는 고객 수요, 언론 보도는 투자자·평판에 더 직접적으로 작용합니다.','risk']);
  if(!holdings.length&&Number(my.cash||0)>200000000)rows.push(['info','경쟁사 분석 연습','바로 인수하기보다 경쟁사 한 곳을 분석해 가치·실적·뉴스를 비교한 뒤 소수지분부터 시작해 보세요.','competition']);
  if(!markets.length&&Number(my.valuation||0)>2400000000&&runway.months>=5)rows.push(['info','해외 진출 준비','회사 규모와 현금 여력이 해외 진출을 검토할 수준입니다. 초기에 한 국가에 집중하는 편이 관리하기 쉽습니다.','operations']);
  if(!rows.length)rows.push(['stable','균형 상태','긴급한 약점이 없습니다. R&D·마케팅·경쟁사 투자 중 원하는 성장 전략을 선택하세요.','operations']);
  return rows;
}
function renderCompanyDecisionCoach(my){
  if(guidanceMode()==='REALISTIC')return '';
  const n=guidanceMode()==='BEGINNER'?3:2,rows=companyCoachItems(my).slice(0,n);
  return `<section class="ceo-coach"><div><small>CEO ASSISTANT</small><h2>현재 회사에서 우선순위</h2><span>정답을 강요하는 기능이 아니라, 복잡한 지표를 읽는 순서를 알려주는 보조판입니다.</span></div><div class="ceo-coach-list">${rows.map((x,i)=>`<button class="${x[0]}" data-company-section-jump="${x[3]}"><strong>${i+1}</strong><span><b>${x[1]}</b><small>${x[2]}</small></span><em>열기 →</em></button>`).join('')}</div></section>`;
}
function renderMarketingGuide(my){
  if(guidanceMode()==='REALISTIC')return '';
  return `<section class="marketing-guide"><div><small>PROMOTION PLAYBOOK</small><h3>‘마케팅’과 ‘언론 홍보’는 역할이 다릅니다</h3></div><div><article><b>마케팅 프로젝트</b><span>고객 수요·브랜드·시장점유율을 키우는 영업 활동</span><em>사업 운영 → MARKETING</em></article><article><b>언론 홍보·IR</b><span>투자자 심리·미디어 평판·주가 수급에 더 직접적인 활동</span><em>현재 화면의 언론사 선택</em></article><article><b>가격 경쟁</b><span>점유율을 빠르게 얻지만 영업이익률과 브랜드가 흔들릴 수 있는 공격 전략</span><em>재무·위기 대응 메뉴</em></article></div></section>`;
}

const PROJECT_LAUNCH_ACTIONS=['RND','QUALITY','CAPEX','HIRING','MARKETING','WELFARE','COMPLIANCE'];
const PROJECT_KICKOFF_LIBRARY={
  RND:[
    {prompt:'첫 주간 회의에서 무엇을 최우선으로 밀어붙일까요?',hint:'R&D는 속도보다 핵심 기술 집중이 중요합니다.',options:[{label:'핵심 기술 프로토타입 고정',desc:'성과 기준을 명확히 잡아 개발 낭비를 줄입니다.',score:2},{label:'광고 예산부터 집행',desc:'주목은 받지만 아직 제품 경쟁력이 부족합니다.',score:0},{label:'회의만 길게 반복',desc:'리스크는 적지만 진척이 느립니다.',score:1}]},
    {prompt:'개발 일정이 흔들릴 때 CEO의 선택은?',hint:'기술 프로젝트는 우선순위 조정이 중요합니다.',options:[{label:'핵심 기능만 먼저 완성',desc:'일정 방어와 품질 관리가 동시에 가능합니다.',score:2},{label:'모든 기능을 그대로 유지',desc:'욕심은 크지만 실패 확률이 오릅니다.',score:1},{label:'검증 없이 외주 확대',desc:'초기 속도는 나도 품질 리스크가 큽니다.',score:0}]},
    {prompt:'성과 발표 직전 어떤 지표를 먼저 챙길까요?',hint:'투자자는 기술성과 상용화 가능성을 함께 봅니다.',options:[{label:'기술 완성도와 원가 개선',desc:'사업성과 연결되는 자료를 확보합니다.',score:2},{label:'화려한 슬로건 중심 발표',desc:'단기 시선은 끌지만 실속이 약합니다.',score:0},{label:'사내 만족도만 점검',desc:'중요하지만 직접 성과자료는 부족합니다.',score:1}]}
  ],
  QUALITY:[
    {prompt:'품질 혁신의 첫 투자처는?',hint:'초기 불량과 CS를 줄이는 선택이 유리합니다.',options:[{label:'테스트 자동화와 검사 공정 강화',desc:'불량률 하락과 신뢰도 개선에 가장 직접적입니다.',score:2},{label:'광고 이미지 재촬영',desc:'이미지는 좋아져도 품질 개선은 아닙니다.',score:0},{label:'문서 보고 체계만 정리',desc:'관리엔 도움되지만 즉효성은 낮습니다.',score:1}]},
    {prompt:'생산팀이 비용 증가를 걱정합니다. 어떻게 설득할까요?',hint:'품질 프로젝트는 장기 절감 논리가 필요합니다.',options:[{label:'리콜·환불 감소 데이터를 제시',desc:'장기 절감 효과를 숫자로 보여줍니다.',score:2},{label:'무조건 참으라고 압박',desc:'팀 사기와 실행력이 떨어집니다.',score:0},{label:'일단 보류하고 다음 분기로 미룸',desc:'안전하지만 개선 속도가 늦습니다.',score:1}]},
    {prompt:'품질 개선 결과를 어떻게 공개할까요?',hint:'과장보다 신뢰가 중요합니다.',options:[{label:'개선 항목과 재발 방지책 공개',desc:'고객 신뢰와 투자자 신뢰를 함께 확보합니다.',score:2},{label:'문제 자체를 숨긴다',desc:'단기 방어는 돼도 적발 시 타격이 큽니다.',score:0},{label:'내부 공지로만 마무리',desc:'위험은 적지만 외부 신뢰 회복은 제한적입니다.',score:1}]}
  ],
  CAPEX:[
    {prompt:'생산능력 확장 시 가장 먼저 볼 지표는?',hint:'설비투자는 수요 예측과 고정비가 핵심입니다.',options:[{label:'수요 추세와 회수기간',desc:'과잉투자를 줄이는 정석 판단입니다.',score:2},{label:'경쟁사가 샀으니 나도 산다',desc:'명분이 약해 과잉투자 가능성이 큽니다.',score:0},{label:'예산부터 최대치로 잠근다',desc:'과감하지만 융통성이 떨어집니다.',score:1}]},
    {prompt:'설비 납기가 밀릴 조짐이 보일 때?',hint:'CAPEX는 일정 지연 관리가 중요합니다.',options:[{label:'핵심 장비를 우선 배치',desc:'전체 프로젝트 지연을 줄입니다.',score:2},{label:'모든 장비를 동시에 기다린다',desc:'구성이 깔끔하지만 시간이 길어집니다.',score:1},{label:'검수 없이 바로 가동',desc:'초기 가동률은 오르지만 사고 위험이 큽니다.',score:0}]},
    {prompt:'증설 후 첫 운영 목표는?',hint:'무리한 풀가동보다 안정화가 중요합니다.',options:[{label:'점진적 가동률 상승',desc:'고정비 부담을 관리하며 품질도 지킵니다.',score:2},{label:'첫날부터 100% 풀가동',desc:'매출 기대는 크지만 사고 위험이 큽니다.',score:0},{label:'홍보부터 대대적으로 진행',desc:'운영 안정화보다 앞서가면 역풍이 날 수 있습니다.',score:1}]}
  ],
  HIRING:[
    {prompt:'핵심 인재 영입 공고의 초점은?',hint:'무작정 연봉보다 역할 선명도가 중요합니다.',options:[{label:'핵심 역할·성과 목표를 명확히 제시',desc:'적합한 인재 유입 가능성이 높습니다.',score:2},{label:'복지만 강조',desc:'관심은 끌지만 실무 적합도가 떨어질 수 있습니다.',score:1},{label:'조건 없이 급하게 대량 채용',desc:'미스매치와 비용 낭비 위험이 큽니다.',score:0}]},
    {prompt:'면접에서 가장 경계해야 할 것은?',hint:'성장성과 팀 적합도를 함께 보세요.',options:[{label:'직무와 무관한 스펙만 보는 것',desc:'실제 현업 성과와 연결되지 않을 수 있습니다.',score:0},{label:'핵심 프로젝트 적합성 검증',desc:'가장 현실적인 채용 기준입니다.',score:2},{label:'대표와 성향이 비슷한지만 확인',desc:'팀 다양성과 실무 적합성이 약해집니다.',score:1}]},
    {prompt:'입사 직후 온보딩 전략은?',hint:'채용은 입사 후 정착까지가 완성입니다.',options:[{label:'멘토 지정과 30일 목표 설정',desc:'이탈률을 줄이고 생산성을 빠르게 높입니다.',score:2},{label:'알아서 적응하라고 둔다',desc:'적응 실패 위험이 큽니다.',score:0},{label:'교육만 길게 진행',desc:'안정적이지만 실전 적응이 늦습니다.',score:1}]}
  ],
  MARKETING:[
    {prompt:'시장 점유율 캠페인의 첫 메시지는?',hint:'브랜드와 수요를 함께 잡는 전략이 좋습니다.',options:[{label:'핵심 고객층 문제 해결 강조',desc:'전환율과 브랜드 모두에 도움이 됩니다.',score:2},{label:'모든 사람에게 다 팔겠다고 외친다',desc:'메시지가 흐려집니다.',score:0},{label:'경쟁사 비난 위주로 간다',desc:'단기 주목은 받을 수 있지만 역풍 위험이 큽니다.',score:1}]},
    {prompt:'예산이 빠듯할 때 무엇을 지킬까요?',hint:'마케팅은 핵심 채널 집중이 중요합니다.',options:[{label:'성과 좋은 채널에 집중',desc:'효율이 높고 낭비가 줄어듭니다.',score:2},{label:'모든 채널에 조금씩 분산',desc:'안전하지만 임팩트가 약합니다.',score:1},{label:'반응 확인 없이 전부 집행',desc:'실패 시 회수하기 어렵습니다.',score:0}]},
    {prompt:'캠페인 중 예상보다 반응이 약합니다.',hint:'즉각적인 데이터 해석이 중요합니다.',options:[{label:'소재·타깃을 빠르게 수정',desc:'민첩한 대응으로 손실을 줄입니다.',score:2},{label:'끝날 때까지 그냥 둔다',desc:'분석은 쉽지만 비효율이 커집니다.',score:1},{label:'할인폭만 크게 늘린다',desc:'매출은 나와도 브랜드가 흔들립니다.',score:0}]}
  ],
  WELFARE:[
    {prompt:'조직 안정화의 시작점은?',hint:'복지는 단순 비용이 아니라 이탈 방지 투자입니다.',options:[{label:'퇴사 사유와 피로도부터 파악',desc:'실제 문제를 집어내기 좋습니다.',score:2},{label:'무조건 행사부터 연다',desc:'분위기는 좋아져도 핵심 문제는 남습니다.',score:1},{label:'성과 낮은 팀만 압박',desc:'사기 저하로 역효과가 날 수 있습니다.',score:0}]},
    {prompt:'복지 예산을 어디에 우선 투입할까요?',hint:'효과가 즉시 체감되는 항목이 좋습니다.',options:[{label:'근무환경·보상 체감 개선',desc:'사기와 생산성 안정에 가장 직접적입니다.',score:2},{label:'대표 전용 공간 확장',desc:'직원 체감 효과가 거의 없습니다.',score:0},{label:'공지문만 개선',desc:'소통엔 도움되지만 체감이 약합니다.',score:1}]},
    {prompt:'직원 반응이 엇갈릴 때 어떻게 마무리할까요?',hint:'복지 프로젝트는 후속 조정이 중요합니다.',options:[{label:'피드백 받아 2차 보완안 공개',desc:'신뢰를 쌓고 이탈률을 낮춥니다.',score:2},{label:'불만 제기를 차단',desc:'단기 통제는 돼도 장기 사기가 떨어집니다.',score:0},{label:'다음 분기에 다시 보자고 한다',desc:'무난하지만 임팩트는 약합니다.',score:1}]}
  ],
  COMPLIANCE:[
    {prompt:'준법·감사 프로젝트의 첫 목표는?',hint:'문제 은폐보다 사전 통제가 핵심입니다.',options:[{label:'취약 프로세스와 리스크 맵 작성',desc:'감사 방향이 명확해집니다.',score:2},{label:'홍보 문구부터 정리',desc:'이미지 관리일 뿐 본질은 아닙니다.',score:0},{label:'교육만 먼저 대량 실시',desc:'도움은 되지만 취약점 파악이 선행돼야 합니다.',score:1}]},
    {prompt:'내부 보고에서 작은 이상 징후가 보입니다.',hint:'준법은 초기에 대응할수록 비용이 적습니다.',options:[{label:'즉시 점검하고 기록을 남긴다',desc:'추후 조사 리스크를 줄입니다.',score:2},{label:'문제가 커지면 그때 대응',desc:'초기 비용은 적지만 위험이 커집니다.',score:0},{label:'비공식적으로만 구두 경고',desc:'기록이 없어 관리 효과가 제한됩니다.',score:1}]},
    {prompt:'프로젝트 완료 보고 방식은?',hint:'기관 신뢰는 투명성에서 옵니다.',options:[{label:'개선된 통제와 재발 방지책 공유',desc:'신용·평판·감사 대응에 유리합니다.',score:2},{label:'문제는 없었다고만 발표',desc:'깔끔해 보이지만 설득력이 약합니다.',score:1},{label:'핵심 내용을 숨긴 채 마무리',desc:'적발 시 타격이 큽니다.',score:0}]}
  ]
};
function isProjectLaunchAction(action){return PROJECT_LAUNCH_ACTIONS.includes(String(action||'').toUpperCase())}
function cloneKickoffQuestions(action){const rows=PROJECT_KICKOFF_LIBRARY[String(action||'').toUpperCase()]||PROJECT_KICKOFF_LIBRARY.RND;return rows.map(q=>({prompt:q.prompt,hint:q.hint||'',options:(q.options||[]).map(o=>({...o}))}))}
function projectKickoffGrade(score,max){const ratio=max?score/max:0;if(ratio>=0.84)return {label:'최적 착수',className:'perfect',multiplier:0.94,desc:'사전 의사결정이 정확해 불필요한 초기비용을 줄였습니다.'};if(ratio>=0.55)return {label:'정상 착수',className:'good',multiplier:1,desc:'계획 범위 안에서 안정적으로 프로젝트를 시작할 수 있습니다.'};if(ratio>=0.22)return {label:'조건부 착수',className:'normal',multiplier:1.06,desc:'일부 시행착오가 예상되어 추가 비용이 반영됩니다.'};return {label:'착수 차질',className:'bad',multiplier:1.12,desc:'준비 부족으로 초기 손실과 일정 차질 위험이 커졌습니다.'}}
function openProjectKickoff(action){
  const amount=Math.max(1000000,parseCompanyMoney(document.getElementById('companyActionAmount')?.value,0));
  if(!amount){state.companyNotice='먼저 프로젝트 예산을 입력하세요.';renderTerminal(true);return}
  const meta=managementProjectMeta(action);
  state.companyKickoff={action:String(action||'').toUpperCase(),title:meta[0],baseAmount:amount,questions:cloneKickoffQuestions(action),step:0,score:0,answers:[],done:false,result:null};
  playCompanySfx('click');renderTerminal(true)
}
function closeProjectKickoff(){state.companyKickoff=null;renderTerminal(true)}
function retryProjectKickoff(){
  const k=state.companyKickoff;if(!k)return;
  state.companyKickoff={action:k.action,title:k.title,baseAmount:k.baseAmount,questions:cloneKickoffQuestions(k.action),step:0,score:0,answers:[],done:false,result:null};
  playCompanySfx('click');renderTerminal(true)
}
function chooseProjectKickoffOption(idx){
  const k=state.companyKickoff;if(!k||k.done)return;const q=k.questions?.[k.step];if(!q)return;const opt=q.options?.[idx];if(!opt)return;
  k.score+=Number(opt.score||0);k.answers.push({prompt:q.prompt,label:opt.label,score:Number(opt.score||0)});playCompanySfx('click');
  if(k.step>=k.questions.length-1){k.done=true;k.result=projectKickoffGrade(k.score,k.questions.length*2);playCompanySfx(k.result.className==='perfect'?'perfect':k.result.className==='bad'?'fail':'success')}else k.step+=1;
  renderTerminal(true)
}
async function launchProjectFromKickoff(runner){
  const k=state.companyKickoff;if(!k?.done||!k.result||typeof runner!=='function')return;
  const finalAmount=Math.max(1000000,Math.round(k.baseAmount*k.result.multiplier/10000)*10000);
  const summary=`${k.title} 착수 검토: ${k.result.label}. 기준 예산 ${formatKrwSmart(k.baseAmount)} → 예상 집행 ${formatKrwSmart(finalAmount)}.`;
  const d=await runner('kx_company_action',{p_action:k.action,p_amount:finalAmount},`${summary}

착수 검토 결과를 반영해 이 프로젝트를 시작할까요?`);if(!d)return;
  state.companyKickoffLast={action:k.action,title:k.title,baseAmount:k.baseAmount,finalAmount,result:k.result,answers:k.answers};
  state.companyKickoff=null;renderTerminal(true)
}
function renderCompanyKickoffSummary(){
  const last=state.companyKickoffLast;if(!last)return '';
  return `<div class="kickoff-last-result ${last.result?.className||''}"><small>최근 착수 검토</small><b>${escapeHtml(last.title)} · ${escapeHtml(last.result?.label||'')}</b><span>기준 예산 ${formatKrwSmart(last.baseAmount)} → 집행 ${formatKrwSmart(last.finalAmount)}</span><em>${escapeHtml(last.result?.desc||'')}</em></div>`
}
function renderCompanyKickoffModal(){
  const k=state.companyKickoff;if(!k)return '';const total=k.questions?.length||0,max=total*2;
  if(!k.done){const q=k.questions?.[k.step];return `<div class="kickoff-backdrop"><div class="kickoff-card"><div class="kickoff-head"><div><small>PROJECT KICKOFF REVIEW</small><h3>${escapeHtml(k.title)} 착수 회의</h3><span>프로젝트를 단순히 기다리는 대신, 착수 전에 CEO가 직접 핵심 의사결정을 내립니다. 선택 결과는 실제 초기 집행비용에 반영됩니다.</span></div><button class="kickoff-close" data-kickoff-close>닫기</button></div><div class="kickoff-progress"><span>${k.step+1} / ${total} 검토 항목</span><b>의사결정 평가 ${k.score} / ${max}</b></div><div class="kickoff-step-bar">${Array.from({length:total},(_,i)=>`<i class="${i<k.step?'done':i===k.step?'on':''}"></i>`).join('')}</div><div class="kickoff-question"><strong>${escapeHtml(q?.prompt||'')}</strong>${q?.hint?`<p>${escapeHtml(q.hint)}</p>`:''}</div><div class="kickoff-options">${(q?.options||[]).map((o,i)=>`<button data-kickoff-choice="${i}"><b>${escapeHtml(o.label)}</b><small>${escapeHtml(o.desc||'')}</small></button>`).join('')}</div><div class="kickoff-foot"><span>의사결정이 적절할수록 시행착오와 불필요한 초기비용이 줄어듭니다.</span><button data-kickoff-close>검토 중단</button></div></div></div>`}
  const result=k.result||projectKickoffGrade(k.score,max),finalAmount=Math.max(1000000,Math.round(k.baseAmount*result.multiplier/10000)*10000);
  return `<div class="kickoff-backdrop"><div class="kickoff-card result-mode ${result.className}"><div class="kickoff-head"><div><small>KICKOFF REVIEW RESULT</small><h3>${escapeHtml(k.title)} · ${escapeHtml(result.label)}</h3><span>${escapeHtml(result.desc)}</span></div><button class="kickoff-close" data-kickoff-close>닫기</button></div><div class="kickoff-result-grid"><article><small>기준 예산</small><b>${formatKrwSmart(k.baseAmount)}</b><span>CEO가 최초 승인한 예산</span></article><article><small>예상 집행액</small><b>${formatKrwSmart(finalAmount)}</b><span>착수 검토 결과 반영</span></article><article><small>의사결정 평가</small><b>${k.score} / ${max}</b><span>3개 핵심 검토 항목</span></article></div><div class="kickoff-answer-log">${(k.answers||[]).map((a,i)=>`<div><strong>${i+1}. ${escapeHtml(a.label)}</strong><span>${escapeHtml(a.prompt)}</span></div>`).join('')}</div><div class="kickoff-actions"><button data-kickoff-retry>다시 검토</button><button class="primary" data-kickoff-launch>이 조건으로 프로젝트 승인</button></div></div></div>`
}

function renderCompanyCommand(my){
  const core=['RND','QUALITY','CAPEX','HIRING','MARKETING','WELFARE'];
  const active=(state.company?.projects||[]).filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).length;
  const gm=guidanceMode();
  const advanced=[['PRICE_WAR','가격 경쟁','즉시','점유율을 빠르게 확보하지만 이익·브랜드가 흔들릴 수 있습니다.'],['COSTCUT','구조조정','즉시','현금을 확보하지만 직원 사기와 평판이 떨어질 수 있습니다.'],['DIVIDEND','주주 배당','즉시','현금을 주주에게 돌려 투자자 신뢰를 높입니다.'],['COMPLIANCE','준법·감사 프로젝트','3주기','규제·세무 위험을 낮추는 방어 프로젝트입니다.'],['LOAN','기업 대출','즉시','현금을 확보하는 대신 부채와 신용 부담이 생깁니다.'],['REPAY','부채 상환','즉시','부채를 줄여 신용과 재무 안정성을 높입니다.']];
  const cash=Number(my.cash||0),safeLow=cash*.03,safeHigh=cash*.10;
  return `<section class="corp-section ceo-command-section management-v54">
    <div class="company-section-head"><div><small>CEO STRATEGY</small><h2>이번에는 ‘프로젝트’를 시작합니다</h2></div><span>현재 진행·구형 회수 ${active}개 · 핵심 프로젝트는 최대 4개까지 동시에 운영할 수 있습니다.</span></div>
    ${renderManagementProjectBoard(my)}
    <div class="project-launch-box"><div><b>신규 프로젝트 예산</b><span>프로젝트 사업비는 즉시 지출됩니다. 완료 후 현금을 직접 지급하지 않고 기술·품질·생산·인력·수요 같은 회사 역량을 바꿔 제품 매출과 원가에 간접 반영됩니다. 시작 전 <b>착수 검토</b>에서 실행계획을 결정합니다.${gm==='BEGINNER'?` 처음에는 법인현금의 약 3~10% 범위가 결과를 배우기 좋습니다.`:''}</span>${gm!=='REALISTIC'?`<div class="budget-presets"><button data-budget-preset="0.03">현금 3%</button><button data-budget-preset="0.05">5%</button><button data-budget-preset="0.10">10%</button><button data-budget-preset="0.15">15%</button></div>`:''}</div><div class="project-launch-side">${companyMoneyInput('companyActionAmount','집행금액',cash?formatKrwSmart(Math.max(10000000,Math.min(cash*.05,100000000))):'1억')} ${gm==='BEGINNER'?`<small class="budget-safe-note">현재 참고 범위 ${formatKrwSmart(safeLow)} ~ ${formatKrwSmart(safeHigh)}</small>`:''}${renderCompanyKickoffSummary()}</div></div>
    <div class="project-launch-grid">${core.map(k=>{const m=managementProjectMeta(k),im=companyImpactMeta(k),b=companyBudgetGuide(my,k);return `<button data-company-action="${k}" class="project-launch"><div><small>${m[1]} · 위험 ${m[2]}</small><b>${m[0]}</b></div><p>${m[3]}</p>${gm!=='REALISTIC'?`<div class="impact-tags"><i>${im[0]}</i><i>${im[1]}</i><i>${im[2]}</i></div>${gm==='BEGINNER'?`<small class="action-budget-hint">참고 예산 ${formatKrwSmart(b.low)}~${formatKrwSmart(b.high)}</small>`:''}`:''}<span>${m[4]} · 착수 검토 →</span></button>`}).join('')}</div>
    <details class="advanced-management"><summary>재무·위기 대응 결정 보기</summary><div class="corp-action-grid advanced-grid">${advanced.map(a=>{const im=companyImpactMeta(a[0]);return `<button data-company-action="${a[0]}" class="${['PRICE_WAR','LOAN','COSTCUT'].includes(a[0])?'risk':''}"><small>${a[2]}</small><b>${a[1]}</b><span>${a[3]}</span>${gm!=='REALISTIC'?`<em>${im.slice(0,3).join(' · ')}</em>`:''}</button>`}).join('')}</div></details>
  </section>`;
}

function companyMood(v){
  v=Number(v)||0;
  return v>=78?'매우 강함':v>=62?'강함':v>=45?'중립':v>=28?'약함':'패닉';
}
function companyRiskLabel(v){
  v=Number(v)||0;
  return v>=70?'매우 높음':v>=45?'높음':v>=22?'주의':'낮음';
}
function renderCompanyPulse(my){
  const taxDue=Number(my.tax_due||0),arrears=Number(my.tax_arrears||0),audit=Number(my.audit_risk||0),sent=Number(my.investor_sentiment||50);
  const flow=Number(my.investor_flow||0),morale=Number(my.employee_morale||65),trust=Number(my.customer_trust||60),comp=Number(my.compliance||75);
  return `<section class="management-pulse">
    <div class="pulse-head"><div><small>LIVE MANAGEMENT</small><h2>회사 상태판</h2></div><span>주가뿐 아니라 세무·직원·고객·투자자·규제 상태를 동시에 관리합니다.</span></div>
    <div class="pulse-grid">
      <article><small>투자자 심리</small><b>${sent.toFixed(0)}</b><span>${companyMood(sent)} · 최근 순매수 ${flow>=0?'+':''}${compactMoney(flow)}원</span></article>
      <article><small>직원 사기</small><b>${morale.toFixed(0)}</b><span>${companyMood(morale)} · 생산성과 인재이탈에 영향</span></article>
      <article><small>핵심인재 지수</small><b>${Number(my.talent_index||50).toFixed(0)}</b><span>수재·천재 ${Number(my.elite_talent_count||0)}명 · 장기 기술·영업·운영에 영향</span></article>
      <article><small>고객 신뢰</small><b>${trust.toFixed(0)}</b><span>${companyMood(trust)} · 매출·브랜드·리콜에 영향</span></article>
      <article class="${comp<45?'danger':''}"><small>준법 수준</small><b>${comp.toFixed(0)}</b><span>규제·세무조사·신용평가에 영향</span></article>
      <article class="${taxDue+arrears>0?'warn':''}"><small>납부할 세금</small><b>${compactMoney(taxDue+arrears)}원</b><span>현재 고지 ${compactMoney(taxDue)} · 미납/추징대상 ${compactMoney(arrears)}</span></article>
      <article class="${audit>=45?'danger':audit>=22?'warn':''}"><small>세무·규제 위험</small><b>${audit.toFixed(0)}</b><span>${companyRiskLabel(audit)} · 규제열 ${Number(my.regulatory_heat||0).toFixed(0)}</span></article>
      <article><small>미디어 평판</small><b>${Number(my.media_reputation||50).toFixed(0)}</b><span>기사·논란이 브랜드와 투자수요에 연결</span></article>
      <article><small>법인 운용 위험</small><b>${Number(my.treasury_risk||0).toFixed(0)}</b><span>주식 포트폴리오 집중도·손익이 신용도에 영향</span></article>
    </div>
  </section>`;
}

function renderMediaDesk(my){
  const region=state.companyMediaRegion||'ALL',tone=state.companyMediaTone||'PROMOTE';
  const outlets=[
    {region:'국내',regionLabel:'국내 언론',kind:'경제 전문지',name:'KX 경제일보',key:'ECON_DAILY',apiCode:'ECON_DAILY',cost:90000000,trust:'높음',risk:'낮음',reach:'기관·경제계',tone:'실적·공시·사업전략 중심'},
    {region:'국내',regionLabel:'국내 언론',kind:'대중 경제방송',name:'비즈니스24',key:'BIZ_TV',apiCode:'BIZ_TV',cost:65000000,trust:'중상',risk:'보통',reach:'개인투자자',tone:'대중 노출과 검색량'},
    {region:'국내',regionLabel:'국내 언론',kind:'디지털 경제매체',name:'EDGE 미디어',key:'EDGE_MEDIA',apiCode:'EDGE_MEDIA',cost:35000000,trust:'보통',risk:'높음',reach:'온라인',tone:'빠른 화제성'},
    {region:'국내',regionLabel:'국내 언론',kind:'속보 채널',name:'퀵버즈 경제',key:'QUICK_BUZZ',apiCode:'QUICK_BUZZ',cost:15000000,trust:'낮음',risk:'매우 높음',reach:'단기 화제',tone:'저비용·고변동'},
    {region:'해외',regionLabel:'해외 언론',kind:'글로벌 금융통신',name:'Global Finance Wire',key:'GLOBAL_WIRE',apiCode:'GLOBAL_WIRE',cost:160000000,trust:'매우 높음',risk:'낮음',reach:'글로벌 기관',tone:'해외 투자자 노출'}
  ];
  const filtered=outlets.filter(o=>region==='ALL'||o.region===region),campaigns=state.company?.media_campaigns||[],press=state.company?.press||[];
  const allTargets=[...(state.company?.companies||[])].filter(c=>c&&c.status!=='INACTIVE');
  if(!allTargets.some(c=>Number(c.id)===Number(my.id)))allTargets.unshift(my);
  const threat=activeTakeoverThreat(),threatId=Number(threat?.attacker_company_id||0);
  let targetId=Number(state.companyMediaTargetId||my.id);if(!allTargets.some(c=>Number(c.id)===targetId))targetId=Number(my.id);
  const target=allTargets.find(c=>Number(c.id)===targetId)||my;
  const search=String(state.companyMediaSearch||'').trim().toLowerCase();
  const searchRows=(search?allTargets.filter(c=>`${c.name||''} ${c.ticker||''} ${c.owner_nickname||''}`.toLowerCase().includes(search)):[]).slice(0,12);
  const options=allTargets.sort((a,b)=>Number(a.id)===Number(my.id)?-1:Number(b.id)===Number(my.id)?1:Number(b.valuation||0)-Number(a.valuation||0)).map(c=>`<option value="${c.id}" ${Number(c.id)===targetId?'selected':''}>${Number(c.id)===Number(my.id)?'[내 회사] ':companyOperatorType(c)==='PLAYER'?'[유저] ':Number(c.id)===threatId?'[위협] ':''}${escapeHtml(c.name)} · ${escapeHtml(c.ticker||'')}</option>`).join('');
  const sourceName=id=>allTargets.find(x=>Number(x.id)===Number(id))?.name||'';
  return `<section class="corp-section media-desk-section clean-newsroom-management">
    <div class="company-section-head"><div><small>NEWS / IR</small><h2>언론 대응</h2><p class="media-autopilot-note">매체 하나만 승인하면 AI 홍보팀이 선택한 대상·논조를 유지하면서 예산 한도 안에서 최대 3개 매체를 자동 조합해 후속 기사까지 집행합니다.</p></div></div>
    <div class="media-company-search"><label>회사 검색<input id="companyMediaSearch" value="${escapeHtml(state.companyMediaSearch||'')}" placeholder="회사명·종목코드·유저명 검색"></label><button type="button" id="companyMediaSearchBtn">검색</button></div>
    ${search?`<div class="media-search-results">${searchRows.length?searchRows.map(c=>`<button type="button" data-media-target-quick="${c.id}" class="${Number(c.id)===targetId?'on':''} ${companyOperatorType(c)==='PLAYER'&&Number(c.id)!==Number(my.id)?'player-target':''} ${Number(c.id)===threatId?'threat-target':''}"><b>${escapeHtml(c.name)}</b><span>${Number(c.id)===Number(my.id)?'내 회사':Number(c.id)===threatId?'내 경영권 위협 회사':companyOperatorType(c)==='PLAYER'?'실제 유저 회사':'BOT 회사'} · ${escapeHtml(c.ticker||'')}</span></button>`).join(''):`<div class="empty compact">검색 결과가 없습니다.</div>`}</div>`:''}
    <div class="media-target-shell compact search-selected-target"><div><small>현재 기사 대상 · 검색 결과가 바로 적용됩니다</small><b class="${Number(target.id)===threatId?'danger-text':''}">${escapeHtml(target?.name||'')}</b><span>${Number(target.id)===threatId?'내 경영권을 위협 중인 회사':companyOperatorType(target)==='PLAYER'&&Number(target.id)!==Number(my.id)?'실제 유저 회사':Number(target.id)===Number(my.id)?'내 회사':'BOT 회사'} · ${escapeHtml(target?.ticker||'')}</span></div><button type="button" id="companyMediaTargetReset">내 회사로 변경</button></div>
    <div class="media-tone-buttons"><button type="button" data-media-tone="PROMOTE" class="${tone==='PROMOTE'?'on':''}"><b>긍정 홍보</b></button><button type="button" data-media-tone="NEUTRAL" class="${tone==='NEUTRAL'?'on':''}"><b>사실 중심</b></button><button type="button" data-media-tone="CRITICAL" class="critical ${tone==='CRITICAL'?'on':''}" ${targetId===Number(my.id)?'disabled':''}><b>비판·검증</b></button></div>
    <div class="media-region-tabs"><button data-company-media-region="ALL" class="${region==='ALL'?'on':''}">전체</button><button data-company-media-region="국내" class="${region==='국내'?'on':''}">국내</button><button data-company-media-region="해외" class="${region==='해외'?'on':''}">해외</button></div>
    <div class="auto-outlet-grid">${filtered.map(o=>`<article class="auto-outlet-card"><div><small>${o.kind}</small><h3>${o.name}</h3></div><dl><div><dt>비용</dt><dd>${formatKrwSmart(o.cost*(tone==='CRITICAL'?1.15:1))}</dd></div><div><dt>도달</dt><dd>${o.reach}</dd></div></dl><button type="button" data-company-media="${o.key}" data-media-api-code="${o.apiCode}" data-media-cost="${o.cost}" data-media-name="${o.name}" data-media-region="${o.region}">${tone==='CRITICAL'?'AI 비판 캠페인 승인':tone==='NEUTRAL'?'AI 사실 캠페인 승인':'AI 홍보 캠페인 승인'}</button></article>`).join('')}</div>
    <div class="published-news clean-published-news"><div class="company-section-head mini"><div><h3>최근 기업 뉴스</h3></div></div><div class="clean-news-list">${press.length?press.slice(0,28).map(a=>{const src=sourceName(a.source_company_id);return `<article class="press-article ${Number(a.sentiment_impact||0)<0?'negative':''}"><div class="press-meta"><b>${escapeHtml(a.outlet_name||'경제뉴스')}</b><span>${escapeHtml(a.company_name||'시장')}</span></div><h3>${escapeHtml(a.headline)}</h3><p>${escapeHtml(a.article_body||'')}</p>${src&&Number(a.source_company_id)!==Number(a.company_id)?`<footer><span>기사 출처·견제: ${escapeHtml(src)}</span></footer>`:''}</article>`}).join(''):`<div class="empty">최근 뉴스가 없습니다.</div>`}</div></div>
    <details class="media-history"><summary>언론 집행 기록</summary>${campaigns.length?campaigns.slice(0,10).map(c=>`<article><span><b>${escapeHtml(c.outlet_name)}</b><small>${escapeHtml(c.campaign_label||c.campaign_type||'보도')}</small></span><strong>${formatKrwSmart(c.budget)}</strong></article>`).join(''):`<div class="empty compact">아직 기록이 없습니다.</div>`}</details>
  </section>`;
}
function renderTaxOffice(my){
  const due=Number(my.tax_due||0),arrears=Number(my.tax_arrears||0),risk=Number(my.audit_risk||0);
  const estCorp=Number(my.estimated_corporate_tax||0),estLocal=Number(my.estimated_local_tax||0),rate=Number(my.tax_rate_effective||0);
  const recs=state.company?.tax_records||[];
  const cycle=Number(state.company?.world?.cycle_no||0),left=120-(cycle%120||0);
  return `<section class="corp-section tax-office-section modern-tax-office">
    <div class="company-section-head"><div><small>TAX · ACCOUNTING</small><h2>세금·회계 결산</h2></div><span>현재 고지세액뿐 아니라 다음 결산에 예상되는 세금과 실제 현금유출을 함께 보여줍니다. 세율은 게임 밸런스를 위해 한국 법인과세 구조를 단순화한 값입니다.</span></div>
    <div class="tax-summary-hero"><div><small>현재 납부할 세금</small><b>${formatKrwSmart(due+arrears)}</b><span>${due+arrears>0?'법인현금에서 납부해야 합니다.':'현재 확정 고지 없음'}</span></div><div><small>다음 결산 예상세금</small><b>${formatKrwSmart(estCorp+estLocal)}</b><span>법인세 ${formatKrwSmart(estCorp)} + 지방세 ${formatKrwSmart(estLocal)}</span></div><div><small>예상 실효세율</small><b>${rate.toFixed(1)}%</b><span>이익 규모에 따라 달라짐</span></div><div><small>다음 결산</small><b>${left||120}주기</b><span>120주기마다 세액 확정</span></div></div>
    <div class="tax-ledger">
      <article><small>확정 고지세액</small><b>${formatKrwSmart(due)}</b><span>${due>0?'납부·절세검토·분납 중 선택':'현재 고지 없음'}</span></article>
      <article class="${arrears>0?'danger':''}"><small>미납·추징 대상</small><b>${formatKrwSmart(arrears)}</b><span>미납이 길어질수록 조사·가산 부담 증가</span></article>
      <article class="${risk>=45?'danger':risk>=22?'warn':''}"><small>세무조사 위험</small><b>${risk.toFixed(0)}</b><span>${companyRiskLabel(risk)}</span></article>
      <article><small>준법 / 지배구조</small><b>${Number(my.compliance||75).toFixed(0)} / ${Number(my.governance||50).toFixed(0)}</b><span>은행·기관투자자·규제기관 신뢰에 영향</span></article>
    </div>
    <div class="tax-actions">
      <button data-company-tax="PAY" ${due+arrears<=0?'disabled':''}><small>정상 처리</small><b>세금 납부</b><span>확정 세액을 법인현금에서 지급</span></button>
      <button data-company-tax="PLAN" ${due<=0?'disabled':''}><small>합법적 절세</small><b>세무 검토</b><span>비용을 지불해 공제·비용처리를 검토</span></button>
      <button data-company-tax="INSTALLMENT" ${due<=0?'disabled':''}><small>현금흐름</small><b>분할 납부</b><span>현금을 보존하지만 가산 부담 발생</span></button>
      <button data-company-tax="EVADE" class="risk" ${due<=0?'disabled':''}><small>불법·고위험</small><b>신고 누락 시도</b><span>적발 시 추징·평판·거래 제한 위험</span></button>
      <button data-company-tax="CORRECT" ${arrears<=0?'disabled':''}><small>위기 수습</small><b>자진 정정</b><span>미납을 정리하고 조사 위험을 낮춤</span></button>
    </div>
    <div class="tax-history"><h3>최근 세무 기록</h3>${recs.length?recs.slice(0,6).map(r=>`<article class="${r.audit_triggered?'danger':''}"><span><b>${escapeHtml(r.action_label||r.action)}</b><small>경영주기 #${Number(r.cycle_no)||0}</small></span><strong>세액 ${compactMoney(r.base_tax)}원</strong><em>${r.audit_triggered?`조사 적발 · 부담 ${compactMoney(r.penalty)}원`:`납부 ${compactMoney(r.paid)}원`}</em></article>`).join(''):`<div class="empty compact">아직 세무 기록이 없습니다.</div>`}</div>
  </section>`;
}

function acquisitionStage(stake){
  const v=Number(stake||0);
  if(v>=66.7)return {label:'지배력 확정',cls:'control',desc:'특별결의까지 강한 영향력을 가진 지배 단계'};
  if(v>=50)return {label:'경영권 확보',cls:'control',desc:'의결권 과반 확보 · 자회사 편입'};
  if(v>=33.4)return {label:'경영권 압박',cls:'hostile',desc:'주요 의사결정을 막거나 협상을 주도할 수 있는 수준'};
  if(v>=15)return {label:'주요 주주',cls:'major',desc:'공개매수와 본격적인 경영권 인수전을 시작할 수 있는 수준'};
  if(v>=5)return {label:'전략적 지분',cls:'stake',desc:'시장에 존재감이 생긴 전략적 투자 단계'};
  return {label:'일반 투자',cls:'normal',desc:'소수지분 투자 단계'};
}
function renderAcquisitionGuide(my){
  const subsidiaries=(state.company?.companies||[]).filter(c=>Number(c.parent_company_id)===Number(my.id));
  return `<section class="acquisition-guide"><div><small>OWNERSHIP & CONTROL</small><h2>주식을 사서 실제로 경영권을 확보합니다</h2><p>경쟁사 지분을 장내에서 모으고, 주요 주주가 된 뒤 공개매수로 경영권을 노릴 수 있습니다. 상대 회사도 방어하며, 과반을 확보하면 온라인 시장에서 실제 자회사로 편입됩니다.</p></div><div class="ownership-steps"><span><b>5%</b><small>전략적 지분</small></span><span><b>15%</b><small>주요 주주</small></span><span><b>33.4%</b><small>경영권 압박</small></span><span><b>50%</b><small>경영권 확보</small></span><span><b>66.7%</b><small>지배력 확정</small></span></div><div class="subsidiary-count"><small>현재 자회사</small><b>${subsidiaries.length}개</b><span>${subsidiaries.length?subsidiaries.map(x=>escapeHtml(x.name)).join(' · '):'아직 확보한 경영권이 없습니다.'}</span></div></section>`;
}

function companyPressFor(id){const cutoff=Date.now()-15*60*1000;return (state.company?.press||[]).filter(x=>Number(x.company_id)===Number(id)&&(!x.created_at||new Date(x.created_at).getTime()>=cutoff));}
function renderCompetitionBoard(my){
  const allCompanies=[...(state.company?.companies||[])].filter(c=>c&&c.status!=='INACTIVE');
  const companies=allCompanies.filter(c=>companyRegionMatch(c,state.companyRegion));
  const holds=state.company?.my_holdings||[];
  const press=state.company?.press||[];
  const ranked=companies.map(c=>{
    const stakeRow=holds.find(h=>Number(h.holder_company_id)===Number(my.id)&&Number(h.target_company_id)===Number(c.id));
    const self=Number(c.id)===Number(my.id);
    const own=self?ownerStakeOf(my):Number(stakeRow?.stake??stakeRow?.percent??0);
    const news=press.find(a=>Number(a.company_id)===Number(c.id));
    return {c,self,own,news};
  }).sort((a,b)=>Number(b.c.valuation||0)-Number(a.c.valuation||0));
  ranked.forEach((r,i)=>r.marketRank=i+1);
  const query=String(state.companySearch||'').trim().toLowerCase();
  const rows=query?ranked.filter(r=>`${r.c.name||''} ${r.c.ticker||''} ${r.c.sector||''} ${r.c.home_country||''}`.toLowerCase().includes(query)):ranked;
  const total=ranked.length,ownCount=ranked.filter(r=>r.own>0).length;
  return `<section class="corp-section company-browser-section company-market-v646">
    <div class="company-section-head"><div><small>COMPETITION · M&A</small><h2>기업 브라우저</h2></div><span>회사 검색 결과를 누르면 즉시 선택·분석됩니다. 지분과 기업가치를 한 줄에서 확인할 수 있습니다.</span></div>
    <div class="company-market-toolbar-v646"><div class="company-region-tabs-v646">${['국내','미국','중국','유럽','일본'].map(region=>`<button type="button" data-company-region="${region}" class="${state.companyRegion===region?'on':''}">${region}</button>`).join('')}</div><form id="companySearchForm" class="company-search-v646"><input id="companySearchInput" value="${escapeHtml(state.companySearch||'')}" placeholder="회사명·종목코드 검색"><button type="submit">검색·바로 선택</button>${state.companySearch?`<button type="button" id="companySearchClear" class="secondary">전체 보기</button>`:''}</form></div>
    <div class="company-browser-summary"><strong>${total}개 기업</strong><span>보유지분 ${ownCount}개사 · 현재 시장 ${state.companyRegion}</span><small>${query?`검색결과 ${rows.length}개`:(state.companyRegion==='유럽'?'독일·영국 기업 통합':'국가별 기업 목록')}</small></div>
    <div class="company-analysis-layout-v646">
      <div class="company-browser-list-v646">${rows.length?rows.map(row=>{const c=row.c,chg=Number(c.daily_change_pct??c.last_return_pct??0),market=companyMarketValueText(c),share=companySharePriceText(c),news=row.news?escapeHtml(row.news.headline||'최근 보도 있음'):'최근 15분 보도 없음',stage=row.own>50?'자회사':row.own>=15?'경영 참여':row.own>0?'소수지분':'미보유';return `<button type="button" data-company-analyze="${c.id}" class="company-browser-row-v646 ${Number(state.companyAnalysisId)===Number(c.id)?'on':''}"><span class="company-v646-rank">${row.self?'MY':`#${row.marketRank}`}</span><span class="company-v646-identity"><b>${escapeHtml(c.name)}</b><small>${row.self?'내 회사':(c.is_bot?`BOT · ${escapeHtml(botStrategyLabel(c))}`:'유저 회사')} · ${escapeHtml(c.home_country||'')} · ${escapeHtml(c.sector||'')}</small><em>${news}</em></span><span class="company-v646-stake"><small>${row.self?'우호 지분':'내 지분'}</small><b>${row.own.toFixed(2)}%</b><em>${stage}</em></span><span class="company-v646-finance"><small>기업가치</small><b>${market}</b><em>주가 ${share} · <i class="${chg>=0?'up':'down'}">${pct(chg)}</i></em></span><span class="company-v646-open">분석 →</span></button>`}).join(''):`<div class="empty project-empty">${query?'검색 결과가 없습니다.':`${escapeHtml(state.companyRegion)} 시장에 표시할 기업이 없습니다.`}</div>`}</div>
      <div class="company-analysis-slot" id="companyAnalysisSlot">${state.companyAnalysis?renderCompanyAnalysisPanel(my):renderCompanyAnalysisPlaceholder()}</div>
    </div>
  </section>`;
}

function renderCompanyAnalysisPlaceholder(){
  return `<aside class="company-analysis-panel empty-analysis"><div><b>분석할 회사를 선택하세요</b><p>왼쪽 기업 목록에서 회사를 선택하면 주가, 기업가치, 최근 뉴스, 내 보유지분과 인수 가능성을 확인할 수 있습니다.</p></div></aside>`;
}

function renderCompanyAnalysisLoading(){
  return `<aside class="company-analysis-panel empty-analysis analysis-loading"><div><span class="analysis-loading-dot"></span><b>회사 데이터를 불러오는 중입니다</b><p>현재 스크롤 위치는 유지됩니다. 서버 공용 주가와 차트를 가져오고 있습니다.</p></div></aside>`;
}

function renderCompanyAnalysisPanel(my){
  const p=state.companyAnalysis;
  if(!p||!p.company)return `<aside class="company-analysis-panel empty-analysis"><div><b>분석할 회사를 선택하세요</b><p>왼쪽에서 내 회사 또는 경쟁사를 선택하면 서버 공용 주가 차트, 최근 뉴스, 지분 구조를 확인할 수 있습니다.</p></div></aside>`;
  const c=p.company,self=Number(c.id)===Number(my.id),stake=self?ownerStakeOf(my):Number(p.my_stake||c.acquired_stake||0),controlled=!self&&(stake>=50||Number(c.parent_company_id)===Number(my.id)),stage=acquisitionStage(stake),gap=Number(c.valuation)/Math.max(1,Number(my.valuation));
  const press=(p.press||[]).filter(a=>!a.created_at||Date.now()-new Date(a.created_at).getTime()<=15*60*1000);
  const ret=Number(c.last_return_pct||0),flow=Number(c.investor_flow||0);
  return `<aside class="company-analysis-panel clean-profile-panel">
    <div class="analysis-profile-head"><div><span class="analysis-country">${escapeHtml(c.home_country||'')}</span>${companyTypeBadge(c)}<h2>${escapeHtml(c.name)}${self?' <em class="me-chip">내 회사</em>':''}</h2><p>${escapeHtml(c.sector)} · ${companyOwnerLabel(c)}</p></div><div class="analysis-value-box"><small>기업가치</small><b>${companyMarketValueText(c)}</b><span>${c.home_country!=='대한민국'?`원화 환산 ${compactMoney(c.valuation)}원`:self?'내 회사':`내 회사 대비 ${gap>=1?`${gap.toFixed(gap>99?0:1)}배`:`${(gap*100).toFixed(0)}%`}`}</span></div></div>
    <div class="analysis-stat-grid"><article><small>현재 주가</small><b>${companySharePriceText(c)}</b><span class="${ret>=0?'up':'down'}">${ret>=0?'+':''}${ret.toFixed(2)}%</span></article><article><small>시장 수급</small><b class="${flow>=0?'up':'down'}">${flow>=0?'+':''}${compactMoney(flow)}원</b><span>공용 서버 수급</span></article><article><small>변동성</small><b>${Number(c.volatility||1.5).toFixed(2)}%</b><span>최근 가격 변동폭</span></article><article><small>${self?'내 경영진·우호 지분':'내 보유 지분'}</small><b>${stake.toFixed(2)}%</b><span>${self?`외부 ${Number(my.incoming_stake||0).toFixed(2)}%`:stage.label}</span></article></div>
    <div class="company-target-chart live-company-chart clean-live-chart"><div class="mini-chart-head"><div><b>공용 실시간 주가</b><small>서버 종가·회사 ID·경영주기만으로 계산하는 공용 캔들입니다. 같은 서버의 모든 접속자가 동일한 캔들과 BOT 기업전쟁 결과를 봅니다.</small></div><span class="live-dot">SHARED</span></div><canvas id="companyTargetChart"></canvas><div class="chart-decision-note"><span><small>매출</small><b>${compactMoney(c.revenue)}원</b></span><span><small>영업이익</small><b>${compactMoney(c.profit)}원</b></span><span><small>투자심리</small><b>${Number(c.investor_sentiment||50).toFixed(0)}</b></span><span><small>수급 방향</small><b class="${flow>=0?'up':'down'}">${flow>=0?'순매수':'순매도'}</b></span></div></div>
    ${renderCompetitorProductIntel()}
    ${renderDueDiligencePanel(c,self,controlled)}
    <div class="analysis-news"><div class="analysis-subhead"><h3>최근 15분 관련 뉴스</h3><span>${press.length}건</span></div>${press.length?press.slice(0,4).map(a=>`<article><small>${escapeHtml(a.outlet_name||'경제뉴스')}</small><b>${escapeHtml(a.headline)}</b><p>${escapeHtml(a.article_body||'')}</p></article>`).join(''):`<div class="empty compact">최근 15분 안에 보도된 기사가 없습니다.</div>`}</div>
    ${self?`<div class="self-ownership-panel"><div><small>내 경영진·우호 지분</small><b>${stake.toFixed(2)}%</b><span>외부 세력 합계 ${Number(my.incoming_stake||0).toFixed(2)}% · 적대적 지분이 늘수록 이 비율이 낮아집니다.</span></div><button type="button" data-open-defense-overview class="section-link takeover-status-link">경영권 방어 현황 보기</button></div>`:`<div class="analysis-acquire"><div><small>현재 단계</small><b>${stage.label}</b><span>${controlled?'경영권 확보 완료':stage.desc}</span></div>${companyMoneyInput(`takeBudget_${c.id}`,'인수 예산','1억')}<button data-company-buy="${c.id}" ${controlled?'disabled':''}>장내 지분 매수</button><button data-company-tender="${c.id}" class="tender" ${stake<15||controlled||!dueDiligenceFor(c.id)?'disabled':''}>${stake>=15&&!controlled&&!dueDiligenceFor(c.id)?'실사 후 공개매수':'공개매수'}</button></div>`}
  </aside>`;
}

function renderGlobalExpansion(my){
  const countries=[
    ['US','미국','세계 최대 소비·기술시장','높은 비용 / 높은 성장'],
    ['DE','독일','유럽 산업·제조 중심시장','기술·신뢰 경쟁'],
    ['GB','영국','금융·콘텐츠 시장','브랜드 경쟁'],
    ['JP','일본','제조·콘텐츠·로봇 강국','품질 경쟁'],
    ['CN','중국','거대 소비·제조시장','규모·가격 경쟁']
  ];
  const markets=state.company?.my_markets||[],income=state.company?.investment_income||[];
  return `<section class="corp-section">
    <div class="company-section-head"><div><small>03 · GLOBAL EXPANSION</small><h2>해외 진출</h2></div><span>진출 후에도 현지 매출이 계속 움직이며, 일정 경영주기마다 해외사업 현금이 법인 계좌로 실제 입금됩니다.</span></div>
    <div class="global-budget">${companyMoneyInput('companyExpansionBudget','진출 투자금','2억')}<span>글로벌 레벨 <b>${Number(my.global_level||0)}/5</b> · 글로벌 점유율 <b>${Number(my.global_share||0).toFixed(2)}%</b></span></div>
    <div class="global-country-grid">${countries.map(x=>{const m=markets.find(m=>m.country_code===x[0]);return `<article class="${m?'entered':''}"><div><span>${x[0]}</span>${m?`<b>${companyMarketStatus(m)}</b>`:'<b>미진출</b>'}</div><h3>${x[1]}</h3><p>${x[2]}</p><small>${m?`현지 영향력 ${Number(m.presence).toFixed(0)} · 점유율 ${Number(m.market_share).toFixed(2)}% · 현지매출 ${compactMoney(m.revenue||0)}원`:x[3]}</small>${m?(()=>{const r=income.find(i=>i.income_type==='GLOBAL_RETURN'&&i.source_code===x[0]);return r?`<em class="global-cash-in">최근 현금유입 +${compactMoney(r.amount)}원</em>`:''})():''}<button data-company-expand="${x[0]}">${m?'추가 투자':'시장 진출'}</button></article>`}).join('')}</div>
  </section>`;
}

function renderTakeoverDesk(my){
  const mine=state.company?.my_holdings||[];
  const incoming=state.company?.incoming_holdings||[];
  const threat=companyStakeAgainstMe();
  return `<section id="takeoverOwnershipDesk" class="corp-section takeover-section">
    <div class="company-section-head"><div><small>04 · M&A / CONTROL</small><h2>지분 인수와 경영권</h2></div><span>한 기업이 50% 이상을 확보하면 해당 회사가 자회사로 편입됩니다.</span></div>
    <div class="takeover-summary">
      <article class="owner-stake-card"><small>내 경영진·우호 지분</small><b>${ownerStakeOf(my).toFixed(2)}%</b><span>외부 세력이 지분을 사면 이 비율이 내려갑니다. 경영권 방어의 핵심 지표입니다.</span></article>
      <article class="${threat>=35?'danger':threat>=15?'warn':''}"><small>외부 세력 보유지분</small><b>${threat.toFixed(2)}%</b><span>${threat>=50?'경영권이 인수된 상태':threat>=35?'경영권 방어가 필요한 수준':threat>=15?'인수 움직임을 주시할 수준':'현재 경영권은 비교적 안정적'}</span></article>
      <article><small>내가 투자한 경쟁사</small><b>${mine.length}개</b><span>지분을 쌓아 50%를 넘기면 자회사 편입</span></article>
      <article><small>현재 지배기업</small><b>${escapeHtml(my.parent_name||'없음')}</b><span>${my.parent_name?'방어로 상대 지분을 50% 아래로 낮추면 독립 회복 가능':'독립 경영 상태'}</span></article>
      <article class="${Number(my.defense_power||0)>=20?'safe':''}"><small>경영권 방어력</small><b>${Number(my.defense_power||0).toFixed(0)}</b><span>백기사·포이즌필 등으로 상승하며 시간이 지나면 서서히 약해집니다.</span></article>
    </div>
    <div class="takeover-columns">
      <div><h3>내 회사에 들어온 지분</h3>${incoming.length?incoming.map(h=>`<div class="stake-row"><span><b>${escapeHtml(h.holder_name)}</b><small>${escapeHtml(h.holder_type)} · ${escapeHtml(h.holder_ticker)}</small></span><strong class="${holdingStakeValue(h)>=25?'down':''}">${holdingStakeValue(h).toFixed(2)}%</strong><em>${compactMoney(h.market_value)}원</em></div>`).join(''):`<div class="empty compact">아직 외부 기업이 내 회사 지분을 확보하지 않았습니다.</div>`}</div>
      <div><h3>내 회사가 보유한 경쟁사 지분</h3>${mine.length?mine.map(h=>`<div class="stake-row owned"><span><b>${escapeHtml(h.target_name)}</b><small>${escapeHtml(h.target_ticker)} · ${escapeHtml(h.target_country)}</small></span><strong>${Number(h.stake).toFixed(2)}%</strong><em>${compactMoney(h.market_value)}원</em><button data-company-sell="${h.target_company_id}">${escapeHtml(h.target_name)} 일부 매각</button></div>`).join(''):`<div class="empty compact">아직 인수한 경쟁사 지분이 없습니다.</div>`}</div>
    </div>
  </section>`;
}

function renderCorporateMarket(my){
  const opts=(state.company?.stock_options||[]).slice(0,120);
  const holdings=state.company?.market_holdings||[];
  const pv=holdings.reduce((a,h)=>a+Number(h.market_value||0),0),pp=holdings.reduce((a,h)=>a+Number(h.pnl||0),0),real=holdings.reduce((a,h)=>a+Number(h.realized_pnl||0),0),divi=holdings.reduce((a,h)=>a+Number(h.dividend_income||0),0);
  return `<section class="corp-section corporate-market strategic-treasury v54-treasury">
    <div class="company-section-head"><div><small>STRATEGIC TREASURY</small><h2>법인 투자 포트폴리오</h2></div><span>보유 중 평가손익, 매도 후 확정손익, 정기 배당까지 모두 법인현금과 회사 경영에 연결됩니다.</span></div>
    <div class="treasury-impact"><article><small>포트폴리오 가치</small><b>${compactMoney(pv)}원</b></article><article><small>평가손익</small><b class="${pp>=0?'up':'down'}">${pp>=0?'+':''}${compactMoney(pp)}원</b></article><article><small>확정손익</small><b class="${real>=0?'up':'down'}">${real>=0?'+':''}${compactMoney(real)}원</b></article><article><small>누적 배당</small><b class="up">${compactMoney(divi)}원</b></article></div>
    <div class="treasury-trade">
      <label>전략 투자 종목<select id="corpStockTicker">${opts.map(s=>`<option value="${s.ticker}">${s.market_area==='해외'?'[해외]':'[국내]'} ${escapeHtml(s.name)} · ${escapeHtml(s.sector)} · ${won(s.last_price)}</option>`).join('')}</select></label>
      ${companyMoneyInput('corpStockAmount','거래금액','5000만')}
      <div><button data-company-market-side="BUY">법인 매수</button><button data-company-market-side="SELL" class="sell">법인 매도</button></div>
    </div>
    <div class="treasury-rule"><b>수익 구조</b><span>주가 상승 → 평가이익</span><span>매도 → 확정손익이 법인현금에 반영</span><span>보유 → 일정 경영주기마다 배당·금융수익 입금</span><span>과도한 집중·손실 → 신용·투자심리 부담</span></div>
    <div class="treasury-holdings">${holdings.length?holdings.map(h=>{const pnl=Number(h.pnl||0),rp=Number(h.realized_pnl||0),di=Number(h.dividend_income||0);return `<article><div><b>${escapeHtml(h.name)}</b><small>${escapeHtml(h.ticker)} · ${escapeHtml(h.market_area)} ${escapeHtml(h.market_country||'')} · ${escapeHtml(h.sector||'')}</small></div><span>${nf.format(Number(h.shares))}주<br><small>평균 ${won(h.avg_price)}</small></span><strong>${compactMoney(h.market_value)}원</strong><em class="${pnl>=0?'up':'down'}">평가 ${pnl>=0?'+':''}${compactMoney(pnl)}원<br><small>확정 ${rp>=0?'+':''}${compactMoney(rp)} · 배당 +${compactMoney(di)}</small></em><div class="treasury-holding-actions"><button type="button" data-company-market-sell-ticker="${escapeHtml(h.ticker)}" data-sell-ratio="0.5">50% 매도</button><button type="button" class="sell" data-company-market-sell-ticker="${escapeHtml(h.ticker)}" data-sell-ratio="1">전량 매도</button></div></article>`}).join(''):`<div class="empty compact">회사 자금으로 보유한 전략투자가 없습니다.</div>`}</div>
  </section>`;
}

function renderCompanyEvents(){
  const rows=state.company?.events||[];
  return `<section class="corp-section corp-event-section">
    <div class="company-section-head"><div><small>09 · CORPORATE NEWSROOM</small><h2>회사·시장 사건</h2></div><span>경쟁사 행동뿐 아니라 언론, 투자자 매수세, 세무조사, 제품문제, 수주 등 경영 사건이 누적됩니다.</span></div>
    <div class="corp-event-feed">${rows.length?rows.slice(0,30).map(e=>{const type=String(e.event_type||'');const cls=['TAKEOVER','TAKEOVER_BID'].includes(type)?'takeover':type==='DEFENSE'?'defense':type==='CONTROL'?'control':['AUDIT','TAX_PENALTY','RECALL'].includes(type)?'danger':['MEDIA','INVESTOR','CONTRACT'].includes(type)?'positive':type==='TAX'?'tax':'';return `<article class="${cls}"><div><span>${escapeHtml(type)}</span><time>${e.created_at?new Date(e.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.body)}</p><small>${escapeHtml(e.company_name||'시장 전체')}</small></article>`}).join(''):`<div class="empty">아직 기업 이벤트가 없습니다.</div>`}</div>
  </section>`;
}

function renderCompanyModeBanner(){
  if(state.companyAvailable===false)return '';
  return `<div class="company-mode-banner online compact-online-banner"><div><span class="online-live-dot">LIVE</span><b>온라인 기업 리그</b><span>유저 회사와 BOT 기업이 같은 시장에서 움직이며, BOT끼리도 지분전·M&A·인재전·언론전을 벌입니다.</span></div></div>`;
}
function renderCompanyOnlineRequired(){
  const err=escapeHtml(state.companyError||'온라인 회사 서버에 연결할 수 없습니다.');
  return `<main class="page-view company-page"><section class="panel page-panel company-shell connection-repair-shell">
    <div class="connection-repair-card">
      <div class="connection-repair-icon">!</div>
      <div class="connection-repair-copy"><small>ONLINE COMPANY SERVER</small><h1>회사 서버 연결을 복구해 주세요</h1><p>${err}</p></div>
      <button data-company-retry class="company-primary">연결 다시 확인</button>
    </div>
    <div class="repair-steps"><article><b>1</b><span><strong>DB 설치 순서 확인</strong><small>기본 회사 API가 이미 있다면 <code>RUN_THIS_IN_SUPABASE_V6.2.sql</code>만 실행합니다. 기본 API도 없다면 V6.1.2 기본 SQL부터 적용합니다.</small></span></article><article><b>2</b><span><strong>페이지 새로고침 없이 확인</strong><small>위의 ‘연결 다시 확인’을 누르면 통합 온라인 API를 바로 다시 검사합니다.</small></span></article><article><b>3</b><span><strong>온라인 모드만 사용</strong><small>로컬 BOT 모드로 전환하지 않으며 모든 회사 데이터는 서버에 저장됩니다.</small></span></article></div>
    <div class="repair-detail"><b>현재 오류</b><code>${err}</code><span>V6.2 SQL은 제품·공급망·관리회계·인수실사 확장용이며 기존 회사·유저·주식·은행 데이터는 삭제하지 않습니다.</span></div>
  </section></main>`;
}

function renderCompanySubnav(){
  return '';
}
function renderExecutiveAgenda(my){
  const issues=[];
  const openIncidents=state.company?.incidents||[];
  if(openIncidents.length)issues.push(['critical','경영진 결재 대기',`${openIncidents.length}건의 실제 운영 리스크에 대응 결재가 필요합니다.`,'operations']);
  const t=state.company?.control_case;if(t)issues.push(['critical','경영권 방어 비상',`${escapeHtml(t.attacker_name||'경쟁사')} 지분 ${Number(t.stake||0).toFixed(1)}% · 즉시 이사회 대응 필요`,'competition']);
  if(state.company?.realism_available){const ps=state.company?.products||[],active=ps.filter(p=>p.status==='ACTIVE'),ready=ps.filter(p=>p.status==='READY'),inventory=Number(state.company?.supply?.inventory_value||0),rev=active.reduce((a,p)=>a+Number(p.last_revenue||0),0),risk=Number(state.company?.supply?.supply_risk||0);if(!active.length)issues.push(['critical','판매 중인 제품 없음','회사에 매출을 만들어낼 ACTIVE 제품이 없습니다. 개발 완료 제품을 출시하거나 신규 제품을 개발해야 합니다.','operations']);if(ready.length)issues.push(['opportunity','출시 승인 대기',`${ready.length}개 제품의 개발이 끝났습니다. 가격·공급량을 검토하고 출시 여부를 결정하세요.`,'operations']);if(inventory>Math.max(30000000,rev*5))issues.push(['warn','재고자산 과다',`재고 ${formatKrwSmart(inventory)} · 최근 판매속도 대비 운전자본이 재고에 과도하게 묶일 수 있습니다.`,'operations']);if(risk>38)issues.push(['warn','공급망 불안',`공급망 위험 ${risk.toFixed(1)} · 조달정책과 원가·납기 안정성의 균형을 재검토하세요.`,'operations']);}
  if(Number(my.tax_due||0)+Number(my.tax_arrears||0)>0)issues.push(['warn','법인세 의사결정',`납부·미납/추징 대상 ${compactMoney(Number(my.tax_due||0)+Number(my.tax_arrears||0))}원`,'risk']);
  if(Number(my.employee_morale||60)<45)issues.push(['warn','핵심 인력 이탈 위험',`직원 사기 ${Number(my.employee_morale||0).toFixed(0)} · 복지/보상 또는 조직투자 필요`,'operations']);
  if(Number(my.product_quality||50)<52)issues.push(['warn','제품 품질 리스크',`제품력 ${Number(my.product_quality||0).toFixed(0)} · 리콜과 고객 신뢰 하락 가능성`,'operations']);
  if(Number(my.cash||0)<Math.max(120000000,Number(my.revenue||0)*.12))issues.push(['warn','현금흐름 주의',`법인 현금 ${compactMoney(my.cash)}원 · 투자/세금/M&A 대응 여력이 낮습니다.`,'competition']);
  if(Number(my.global_level||0)<2&&Number(my.valuation||0)>2400000000)issues.push(['opportunity','해외 진출 기회',`기업 규모에 비해 해외 사업 비중이 낮습니다. 글로벌 성장을 검토할 수 있습니다.`,'operations']);
  if(Number(my.media_reputation||50)<45||Number(my.investor_sentiment||50)<45)issues.push(['opportunity','IR·평판 회복 필요',`미디어 평판 ${Number(my.media_reputation||0).toFixed(0)} · 투자자 심리 ${Number(my.investor_sentiment||0).toFixed(0)}`,'risk']);
  if(!issues.length)issues.push(['stable','경영 상태 안정','긴급 안건은 없습니다. 경쟁사 투자·해외진출·R&D 중 다음 성장 전략을 선택하세요.','operations']);
  return `<section class="executive-agenda"><div class="company-section-head"><div><small>BOARD AGENDA</small><h2>오늘의 이사회 안건</h2></div><span>주가를 보는 대신 지금 회사에서 해결해야 할 문제와 기회를 먼저 보여줍니다.</span></div><div class="agenda-grid">${issues.slice(0,4).map((x,i)=>`<button class="agenda-card ${x[0]}" data-company-section-jump="${x[3]}"><span>${i+1<10?'0':''}${i+1}</span><div><b>${x[1]}</b><small>${x[2]}</small></div><em>검토 →</em></button>`).join('')}</div></section>`;
}
function renderRivalSnapshot(my){
  const rivals=(state.company?.companies||[]).filter(x=>Number(x.id)!==Number(my.id)).sort((a,b)=>Number(b.valuation)-Number(a.valuation)).slice(0,6);
  return `<section class="executive-rivals"><div class="company-section-head"><div><small>COMPETITIVE INTELLIGENCE</small><h2>주요 경쟁사 동향</h2></div><button data-company-route="competition:companies" class="section-link">기업분석 열기</button></div><div class="executive-rival-list">${rivals.map((r,i)=>{const ratio=Number(r.valuation)/Math.max(1,Number(my.valuation))*100;return `<article><strong>${i+1}</strong><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.home_country)} · ${escapeHtml(r.sector)} · ${companyOwnerLabel(r)}</small></div><span>${compactMoney(r.valuation)}원</span><em class="${ratio>120?'down':ratio<80?'up':''}">${ratio.toFixed(0)}%</em></article>`}).join('')}</div></section>`;
}
function renderCompanyGrowthPanel(my){
  const hist=[...(state.company?.my_history||[])].sort((a,b)=>Number(a.cycle_no)-Number(b.cycle_no));
  const metric=state.companyMetric||'valuation';
  const labels={valuation:'회사 가치',revenue:'매출',profit:'영업이익'};
  const rows=hist.filter(r=>Number.isFinite(Number(r[metric]))).slice(-64);
  const vals=rows.map(r=>Number(r[metric]||0));
  const first=vals.length?vals[0]:Number(my?.[metric]||0);
  const last=vals.length?vals[vals.length-1]:Number(my?.[metric]||0);
  const high=vals.length?Math.max(...vals):last;
  const low=vals.length?Math.min(...vals):last;
  const delta=vals.length>1&&Math.abs(first)>0?((last-first)/Math.abs(first))*100:0;
  const span=Math.abs(high-low);
  const formatValue=v=>`${preciseCompactMoney(v,span||Math.abs(v)*0.03)}원`;
  return `<section class="company-growth-panel refined-growth-panel"><div class="company-section-head"><div><small>GROWTH CHART</small><h2>우리 회사 성장 그래프</h2></div><div class="growth-metric-tabs">${Object.entries(labels).map(([k,v])=>`<button data-company-metric="${k}" class="${metric===k?'on':''}">${v}</button>`).join('')}</div></div><div class="growth-panel-grid"><div class="growth-chart-stage"><div class="growth-panel-copy"><b>${labels[metric]}</b><span>경영 주기별로 ${labels[metric]}이 어떻게 바뀌는지 바로 확인할 수 있습니다.</span></div><div class="growth-chart-wrap"><canvas id="companyGrowthChart"></canvas>${hist.length<2?`<div class="chart-empty-note">경영주기가 진행되면 회사의 성장·하락 기록이 여기에 쌓입니다.</div>`:''}</div></div><aside class="growth-side-stats"><article><small>현재 ${labels[metric]}</small><b>${formatValue(last)}</b><span>${rows.length?`기록 ${rows.length}개 반영`:'첫 데이터를 기다리는 중'}</span></article><article><small>구간 변화율</small><b class="${delta>=0?'up':'down'}">${rows.length>1?`${delta>=0?'+':''}${delta.toFixed(2)}%`:'—'}</b><span>${rows.length>1?'첫 기록 대비 현재 변화':'비교할 데이터가 아직 부족합니다.'}</span></article><article><small>최근 최고 / 최저</small><b>${formatValue(high)}</b><span>최저 ${formatValue(low)}</span></article><article><small>읽는 법</small><b>한눈에 보기</b><span>버튼으로 지표를 바꾸고, 차트 아래보다 오른쪽 요약 카드에서 결과를 빠르게 확인하세요.</span></article></aside></div></section>`;
}
function renderCompanyLatestNews(my){
  const rows=(state.company?.press||[]).slice(0,6);
  return `<section class="company-latest-news"><div class="company-section-head"><div><small>MARKET NEWS</small><h2>최근 기업 뉴스</h2></div><button data-company-route="risk:news" class="section-link">뉴스·IR 전체 보기</button></div><div class="latest-news-grid">${rows.length?rows.map(a=>`<article class="${Number(a.sentiment_impact||0)<0?'negative':''}"><small>${escapeHtml(a.outlet_name||'경제뉴스')} · ${escapeHtml(a.company_name||'')}</small><b>${escapeHtml(a.headline)}</b><p>${escapeHtml(a.article_body||'')}</p></article>`).join(''):`<div class="empty">아직 보도된 뉴스가 없습니다.</div>`}</div></section>`;
}

function renderDashboardProgress(my){
  const allProjects=state.company?.projects||[];
  const projects=allProjects.filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).slice(0,4);
  const incomes=(state.company?.investment_income||[]).slice(0,5);
  const activeCount=allProjects.filter(p=>String(p.status)==='ACTIVE').length;
  const paybackCount=allProjects.filter(p=>String(p.status)==='PAYBACK').length;
  const realized=incomes.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const totalReturn=projects.reduce((sum,p)=>sum+Number(p.realized_return||0),0);
  return `<section class="dashboard-progress refined-progress-panel"><div class="company-section-head"><div><small>WHAT IS HAPPENING NOW</small><h2>내 결정이 지금 어떻게 진행되고 있나</h2></div><button data-company-section-jump="operations" class="section-link">사업 운영 전체 보기</button></div><div class="dashboard-progress-summary"><article><small>실행 중 프로젝트</small><b>${activeCount}개</b><span>현재 돈을 쓰며 진행 중인 과제</span></article><article><small>성과 현금 발생</small><b>${paybackCount}개</b><span>V6.2 이전 프로젝트의 잔여 성과금 회수</span></article><article><small>최근 확정 수익</small><b class="${realized>=0?'up':'down'}">${realized>=0?'+':''}${compactMoney(realized)}원</b><span>최근 기록된 법인현금 유입 합계</span></article><article><small>구형 프로젝트 현금</small><b>${compactMoney(totalReturn)}원</b><span>V6.2 이전 계약의 누적 현금유입</span></article></div><div class="dashboard-progress-grid"><div class="dashboard-projects"><h3>진행 중 프로젝트</h3>${projects.length?projects.map(p=>{const d=Math.max(1,Number(p.duration_cycles)||1),n=Math.min(d,Number(p.progress_cycles)||0),pc=p.status==='PAYBACK'?100:Math.round(n/d*100);return `<article><span><b>${escapeHtml(p.title||p.project_type)}</b><small>${projectStatusLabel(p)} · ${p.status==='PAYBACK'?`회수 ${Number(p.payout_cycles_remaining||0)}회 남음`:`${n}/${d}주기 진행`}</small></span><div><i style="width:${pc}%"></i></div><strong>${compactMoney(p.realized_return||0)}원 성과현금</strong></article>`}).join(''):`<div class="empty compact">진행 중 프로젝트가 없습니다.</div>`}</div><div class="dashboard-income"><h3>최근 법인현금 유입</h3>${incomes.length?incomes.map(x=>`<article><span><b>${escapeHtml(x.source_name||'투자수익')}</b><small>${escapeHtml(x.income_label||x.income_type)}</small></span><strong class="${Number(x.amount)>=0?'up':'down'}">${Number(x.amount)>=0?'+':''}${compactMoney(x.amount)}원</strong></article>`).join(''):`<div class="empty compact">아직 확정된 투자 수익이 없습니다.</div>`}</div></div></section>`;
}
function renderOperationsWorkspace(my){
  const tab=state.companyOpsTab||'products';
  const tabs=[['products','제품'],['projects','프로젝트'],['supply','공급망'],['finance','재무'],['portfolio','법인투자'],['global','해외']];
  let body='';
  if(tab==='products')body=`${renderExecutiveDecisionQueue(my)}${renderProductSalesDesk(my)}`;
  else if(tab==='projects')body=renderCompanyCommand(my);
  else if(tab==='supply')body=renderSupplyChainDesk(my);
  else if(tab==='finance')body=`${renderFinancialStatements(my)}${renderInvestmentReturnPanel(my)}`;
  else if(tab==='portfolio')body=renderCorporateMarket(my);
  else if(tab==='global')body=renderGlobalExpansion(my);
  return `<section class="operations-hub"><nav>${tabs.map(([k,v])=>`<button type="button" data-company-ops-tab="${k}" class="${tab===k?'on':''}">${v}</button>`).join('')}</nav>${body}</section>`;
}
function renderDashboardTakeoverAlert(my){
  const threat=activeTakeoverThreat();
  if(!threat)return '';
  const stake=Math.max(Number(threat?.stake||0),Number(threat?.aggregate_stake||0),companyStakeAgainstMe());
  if(stake<=0)return '';
  const attacker=threat?.attacker_name||'경쟁사',owner=ownerStakeOf(my),meta=takeoverStageMeta(threat?.stage,stake);
  const officer=chairmanProposalOfficer('FINANCE')||chairmanProposalOfficer('MANAGEMENT')||[...(state.company?.talents||[])].sort((a,b)=>(Number(b.leadership||0)+Number(b.skill_score||0))-(Number(a.leadership||0)+Number(a.skill_score||0)))[0]||null;
  const advice=stake>=50?'자사주 매입만으로는 부족할 수 있습니다. 백기사·유상증자·역인수를 함께 검토해야 합니다.':stake>=35?'자사주 매입과 지분 협상, 백기사 확보를 병행하는 방안을 권고합니다.':'지금 단계에서 자사주 매입이나 지분 협상을 시작하면 방어 비용을 줄일 수 있습니다.';
  return `<section class="dashboard-takeover-alert ${stake>=35?'danger':stake>=15?'warn':'watch'}"><div class="dashboard-takeover-copy"><small>CONTROL ALERT · 직원 긴급보고</small><b>${escapeHtml(meta[0])}</b><span>${escapeHtml(attacker)} · 외부 위협지분 ${stake.toFixed(2)}% · 내 우호지분 ${owner.toFixed(2)}%</span><em>${officer?escapeHtml(officer.name)+' ('+escapeHtml(talentDepartmentShort(officer.department))+')':'재무·경영지원팀'}: ${escapeHtml(advice)}</em></div><div class="dashboard-takeover-mini"><span><small>위협 지분</small><b>${stake.toFixed(2)}%</b></span><span><small>내 우호 지분</small><b>${owner.toFixed(2)}%</b></span></div><div class="dashboard-takeover-actions"><button type="button" data-open-defense-overview>방어 수단 보기</button><button type="button" data-company-route="competition:control">경영권 대응</button></div></section>`;
}


const CHAIRMAN_META_PREFIX='kx_chairman_desk_v650';
function chairmanMetaKey(){return `${CHAIRMAN_META_PREFIX}_${session?.user?.id||'guest'}_${state.company?.my_company?.id||'new'}`}
function loadChairmanMeta(){
  try{const x=JSON.parse(localStorage.getItem(chairmanMetaKey())||'{}')||{};return {handled:x.handled&&typeof x.handled==='object'?x.handled:{}}}catch{return {handled:{}}}
}
function saveChairmanMeta(meta){try{localStorage.setItem(chairmanMetaKey(),JSON.stringify(meta||{handled:{}}))}catch{}}
function chairmanHandled(id){const m=loadChairmanMeta(),until=Number(m.handled?.[id]||0);return until>=Math.max(1,Number(liveCompanyClock().cycle)||1)}
function markChairmanHandled(id,cycles=18){const m=loadChairmanMeta(),now=Math.max(1,Number(liveCompanyClock().cycle)||1);m.handled[id]=now+Math.max(1,Number(cycles)||18);saveChairmanMeta(m)}
function talentDepartmentPerformance(data=state.company){
  const defs=[['ENGINEERING','기술·R&D'],['SALES','영업·마케팅'],['OPERATIONS','생산·운영'],['FINANCE','재무·준법'],['MANAGEMENT','경영지원']];
  const talents=(data?.talents||[]).filter(Boolean);
  return defs.map(([code,label])=>{
    const rows=talents.filter(t=>String(t.department||'').toUpperCase()===code);
    const count=rows.length;
    const avg=count?rows.reduce((a,t)=>a+Number(t.skill_score||0),0)/count:0;
    const auto=count?rows.reduce((a,t)=>a+talentAutopilotContribution(t),0)/count:0;
    const lead=count?rows.reduce((a,t)=>a+Number(t.leadership||0),0)/count:0;
    const top=count?[...rows].sort((a,b)=>Number(b.skill_score||0)-Number(a.skill_score||0))[0]:null;
    return {code,label,count,avg,auto,lead,score:count?Math.min(99,avg*.58+auto*.28+lead*.14):0,top};
  });
}
function chairmanProposalOfficer(dept){
  const rows=(state.company?.talents||[]).filter(t=>String(t.department||'').toUpperCase()===String(dept||'').toUpperCase()).sort((a,b)=>Number(b.leadership||0)+Number(b.skill_score||0)-Number(a.leadership||0)-Number(a.skill_score||0));
  return rows[0]||null;
}
function companyNeighborRival(my){
  const rows=[...(state.company?.companies||[])].filter(c=>c&&c.status!=='INACTIVE').sort((a,b)=>Number(b.valuation||0)-Number(a.valuation||0));
  const idx=rows.findIndex(c=>Number(c.id)===Number(my?.id));
  if(idx<0)return null;
  return rows[idx-1]||rows[idx+1]||null;
}
function buildChairmanProposals(my){
  if(!my)return [];
  const out=[],products=state.company?.products||[],perf=talentDepartmentPerformance(state.company),cycle=Math.max(1,Number(liveCompanyClock().cycle)||1),cash=Math.max(0,Number(my.cash||0)),valuation=Math.max(1,Number(my.valuation||1));
  const push=p=>{if(!chairmanHandled(p.id))out.push(p)};
  const threat=activeTakeoverThreat();
  if(threat){
    const stake=Math.max(Number(threat.stake||0),Number(threat.aggregate_stake||0),companyStakeAgainstMe());
    const fin=perf.find(x=>x.code==='FINANCE'),mgmt=perf.find(x=>x.code==='MANAGEMENT');
    const crisisOfficer=fin?.top||mgmt?.top||[...(state.company?.talents||[])].sort((a,b)=>(Number(b.leadership||0)+Number(b.skill_score||0))-(Number(a.leadership||0)+Number(a.skill_score||0)))[0]||null;
    const floor=takeoverDefenseMinimum(my);const budget=Math.max(floor,Math.min(cash*.12,valuation*.006));
    push({id:`defense-buyback-${Number(threat.attacker_company_id||0)}-${Math.floor(cycle/8)}`,kind:'DEFENSE_BUYBACK',priority:'critical',department:'FINANCE',officer:crisisOfficer,title:'긴급 자사주 매입 방어안',summary:`${crisisOfficer?crisisOfficer.name+'이(가) ':'재무팀이 '}공격 지분 ${stake.toFixed(2)}%를 보고 즉시 자사주 매입을 상신했습니다.`,budget,impact:`공격자 보유지분 직접 축소 · 법인현금 -${formatKrwSmart(budget)}`});
    if(stake>=20)push({id:`defense-negotiate-${Number(threat.attacker_company_id||0)}-${Math.floor(cycle/10)}`,kind:'DEFENSE_NEGOTIATE',priority:'critical',department:'FINANCE',officer:crisisOfficer,title:'공격자 보유지분 되사기 협상안',summary:'공격자가 보유한 우리 회사 지분을 프리미엄을 주고 되사서 실제 위협지분을 낮추는 협상안입니다.',budget:Math.max(floor,Math.min(cash*.10,valuation*.005)),impact:'공격자 지분 직접 감소 · 법인현금 지출'});
    if(stake>=35)push({id:`defense-white-${Number(threat.attacker_company_id||0)}-${Math.floor(cycle/12)}`,kind:'DEFENSE_WHITE_KNIGHT',priority:'critical',department:'MANAGEMENT',officer:mgmt?.top||crisisOfficer,title:'백기사 우호지분 확보안',summary:'경영지원팀이 우호 주주를 끌어들여 의결권 방어력을 높이자고 제안했습니다.',budget:Math.max(floor,Math.min(cash*.09,valuation*.0045)),impact:'방어력 대폭 강화 · 우호 의결권 확보 · 법인현금 지출'});
    if(stake>=45)push({id:`defense-rights-${Number(threat.attacker_company_id||0)}-${Math.floor(cycle/12)}`,kind:'DEFENSE_RIGHTS_ISSUE',priority:'critical',department:'FINANCE',officer:crisisOfficer,title:'긴급 유상증자 희석안',summary:'경영권선이 가까워 재무팀이 신주 발행으로 공격자 지분을 희석하는 비상안을 상신했습니다.',budget:Math.max(floor,Math.min(Math.max(cash*.10,valuation*.006),valuation*.014)),impact:'공격자 지분 희석 · 방어비 현금 지출 · 기존 주주 희석'});
    if(Number(threat.attacker_company_id||0)>0&&cash>floor)push({id:`defense-counter-${Number(threat.attacker_company_id)}-${Math.floor(cycle/14)}`,kind:'DEFENSE_COUNTER',priority:'warn',department:'MANAGEMENT',officer:mgmt?.top||crisisOfficer,title:'역인수·맞지분 확보안',summary:'상대 회사 지분을 역으로 매입해 협상력을 확보하자는 제안입니다.',budget:Math.max(floor,Math.min(cash*.10,valuation*.005)),impact:'상대 회사 맞지분 확보 · 협상 압력 · 법인현금 지출'});
  }
  for(const p of products.filter(x=>String(x.status)==='READY').slice(0,2)){
    const officer=chairmanProposalOfficer('ENGINEERING')||chairmanProposalOfficer('MANAGEMENT');
    push({id:`launch-${p.id}`,kind:'PRODUCT_LAUNCH',priority:'critical',department:'ENGINEERING',officer,title:`${p.name} 출시 승인 요청`,summary:'개발이 끝난 제품입니다. 출시 여부는 회장 결재가 필요합니다.',budget:Math.max(5000000,Number(p.development_budget||p.budget||0)*.03||5000000),productId:Number(p.id),impact:'판매 개시 · 재고/수요/마진 발생'});
  }
  const developing=products.some(p=>['DEVELOPMENT','READY'].includes(String(p.status))),active=products.filter(p=>String(p.status)==='ACTIVE').length,eng=perf.find(x=>x.code==='ENGINEERING');
  if(!developing&&active<3&&(Number(my.technology||0)>=55||Number(eng?.score||0)>=62)&&cash>120000000){const preset=sectorProductPreset(my.sector),budget=Math.max(100000000,Math.min(cash*.09,Math.max(100000000,valuation*.012)));push({id:`new-product-${Math.floor(cycle/24)}`,kind:'PRODUCT_DEVELOP',priority:'opportunity',department:'ENGINEERING',officer:eng?.top,title:'신제품 개발안 상신',summary:`기술팀이 ${preset.name} 개발을 제안했습니다. 승인 시 개발비가 즉시 집행됩니다.`,budget,productName:preset.name,productType:preset.type,targetPrice:preset.price,capacity:preset.capacity,impact:'기술·제품 포트폴리오 확대'});}
  if(!threat){const rival=companyNeighborRival(my),fin=perf.find(x=>x.code==='FINANCE'),mgmt=perf.find(x=>x.code==='MANAGEMENT');if(rival&&cash>250000000&&Math.max(Number(fin?.score||0),Number(mgmt?.score||0))>=58){const budget=Math.max(100000000,Math.min(cash*.07,Number(rival.valuation||0)*.006));push({id:`stake-${rival.id}-${Math.floor(cycle/36)}`,kind:'STRATEGIC_STAKE',priority:'normal',department:'FINANCE',officer:fin?.top||mgmt?.top,title:`${rival.name} 전략지분 매입 검토`,summary:'재무팀이 순위 인접 경쟁사에 대한 소수지분 확보를 제안했습니다.',budget,targetCompanyId:Number(rival.id),impact:'정보·협상력 확보 · 향후 M&A 선택지 확대'});}}
  const best=[...perf].filter(x=>x.count>0).sort((a,b)=>b.score-a.score)[0];
  if(best&&best.score>=66&&cash>50000000){const amount=Math.max(20000000,Math.min(cash*.025,Math.max(20000000,Number(my.monthly_payroll||0)*.08)));push({id:`incentive-${best.code}-${Math.floor(cycle/24)}`,kind:'DEPT_INCENTIVE',priority:'opportunity',department:best.code,officer:best.top,title:`${best.label} 성과 인센티브안`,summary:`최근 부서 성과 ${best.score.toFixed(1)}점. 성과를 보상하면 충성도와 성장 XP가 올라가고 자동 운영력이 강화됩니다.`,budget:amount,impact:'부서 사기·성장·자동운영 효율 상승'});}
  const weight={critical:0,warn:1,opportunity:2,normal:3};
  return out.sort((a,b)=>(weight[a.priority]??9)-(weight[b.priority]??9)).slice(0,6);
}

function showCompanyAutopilotProgress(title='AI 자동집행',detail='최적 실행안을 계산하고 있습니다.'){
  document.getElementById('companyAutopilotProgress')?.remove();
  const el=document.createElement('aside');el.id='companyAutopilotProgress';el.className='company-autopilot-progress';
  el.innerHTML=`<small>CEO AUTHORIZED AUTOPILOT</small><b>${escapeHtml(title)}</b><span>${escapeHtml(detail)}</span><div><i></i></div>`;
  document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));
  return {update(text){const span=el.querySelector('span');if(span)span.textContent=String(text||'처리 중…')},close(text=''){if(text){const span=el.querySelector('span');if(span)span.textContent=String(text)}setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),220)},text?1300:180)}};
}
function chairmanAutopilotCap(p,my=state.company?.my_company){
  const cash=Math.max(0,Number(my?.cash||0)),valuation=Math.max(1,Number(my?.valuation||1)),base=Math.max(0,Number(p?.budget||0));
  if(String(p?.kind||'').startsWith('DEFENSE')){const stake=companyStakeAgainstMe();const ratio=stake>=70?.58:stake>=50?.46:stake>=35?.34:.24;return Math.max(base,Math.min(cash*ratio,Math.max(base*5,valuation*(stake>=50?.05:.03))));}
  if(p?.kind==='STRATEGIC_STAKE')return Math.max(base,Math.min(cash*.18,base*3.5));
  return Math.min(cash,base);
}
function defenseActionLabel(a){return ({BUYBACK:'자사주 매입',NEGOTIATE:'공격자 지분 되사기',WHITE_KNIGHT:'백기사 확보',POISON_PILL:'포이즌필',RIGHTS_ISSUE:'긴급 유상증자',COUNTER_TAKEOVER:'역인수·맞지분'})[a]||a}
function defenseAutopilotCandidates(stake,threat,my,lastAction=''){
  const defense=Number(my?.defense_power||0),usedRights=!!threat?.used_rights_issue,usedPoison=!!threat?.used_poison_pill;
  let rows=[];
  if(stake>=60)rows=['RIGHTS_ISSUE','POISON_PILL','WHITE_KNIGHT','NEGOTIATE','BUYBACK','COUNTER_TAKEOVER'];
  else if(stake>=45)rows=['WHITE_KNIGHT','NEGOTIATE','RIGHTS_ISSUE','POISON_PILL','BUYBACK','COUNTER_TAKEOVER'];
  else if(stake>=25)rows=['NEGOTIATE','BUYBACK','WHITE_KNIGHT','COUNTER_TAKEOVER'];
  else rows=['BUYBACK','NEGOTIATE'];
  if(defense>=70)rows=rows.filter(x=>x!=='WHITE_KNIGHT');
  if(usedRights)rows=rows.filter(x=>x!=='RIGHTS_ISSUE');
  if(usedPoison)rows=rows.filter(x=>x!=='POISON_PILL');
  if(lastAction&&rows.length>1){const i=rows.indexOf(lastAction);if(i===0)rows.push(rows.shift());}
  return rows;
}
async function runDefenseAutopilot(p,progress){
  const startMy=state.company?.my_company;if(!startMy)throw new Error('회사 정보를 찾지 못했습니다.');
  const cap=chairmanAutopilotCap(p,startMy),minTranche=takeoverDefenseMinimum(startMy);let committed=0,steps=[],lastAction='',lastStake=companyStakeAgainstMe(),failures=new Set();
  for(let i=0;i<9;i++){
    const my=state.company?.my_company,threat=activeTakeoverThreat();const stake=companyStakeAgainstMe();
    if(!threat||stake<10){lastStake=stake;break;}
    const remaining=Math.max(0,cap-committed);if(remaining<minTranche)break;
    const candidates=defenseAutopilotCandidates(stake,threat,my,lastAction).filter(a=>!failures.has(a));if(!candidates.length)break;
    const action=candidates[0];const cash=Math.max(0,Number(my?.cash||0)),valuation=Math.max(1,Number(my?.valuation||1));
    let tranche=Math.max(minTranche,Math.min(remaining,Math.max(Number(p.budget||0)*.55,valuation*.004,cash*.06)));
    if(action==='POISON_PILL')tranche=Math.min(tranche,Math.max(minTranche,Number(p.budget||0)*.35));
    if(cash<tranche)tranche=Math.max(0,Math.min(remaining,cash*.70));if(tranche<minTranche)break;
    progress?.update(`공격 지분 ${stake.toFixed(2)}% · ${defenseActionLabel(action)} 자동 집행 중…`);
    try{
      const r=await companyDefenseV640(action,tranche);if(r?.ok===false)throw new Error(r.message||`${defenseActionLabel(action)} 실패`);
      committed+=tranche;steps.push(`${defenseActionLabel(action)} ${formatKrwSmart(tranche)}`);lastAction=action;
      await loadCompanyLayer(false,true);
      const now=companyStakeAgainstMe();if(now>=stake-.05&&['RIGHTS_ISSUE','POISON_PILL','WHITE_KNIGHT'].includes(action))failures.add(action);lastStake=now;
      if(now<10)break;
    }catch(err){failures.add(action);steps.push(`${defenseActionLabel(action)} 실패`);if(failures.size>=5)throw err;}
  }
  const finalStake=companyStakeAgainstMe();return {ok:true,spent:committed,steps,finalStake,cap,message:finalStake<10?`AI 방어팀이 ${formatKrwSmart(committed)}을 지출해 공격 지분을 ${lastStake.toFixed(2)}%까지 낮추고 경영권 방어에 성공했습니다.`:`AI 방어팀이 ${steps.length}단계 조치에 ${formatKrwSmart(committed)}을 지출했습니다. 현재 위험 지분 ${finalStake.toFixed(2)}%.`};
}
async function runChairmanAutopilot(p,progress){
  const my=state.company?.my_company;if(!my)throw new Error('회사 정보를 찾지 못했습니다.');
  if(String(p.kind||'').startsWith('DEFENSE'))return runDefenseAutopilot(p,progress);
  if(p.kind==='STRATEGIC_STAKE'){
    const cap=chairmanAutopilotCap(p,my);let spent=0,steps=0;
    while(spent<cap&&steps<5){const h=(state.company?.my_holdings||[]).find(x=>Number(x.target_company_id)===Number(p.targetCompanyId));if(Number(h?.stake||0)>=5)break;const remaining=cap-spent,tranche=Math.max(10000000,Math.min(remaining,Math.max(Number(p.budget||0),cap/3)));progress?.update(`전략지분 ${Number(h?.stake||0).toFixed(2)}% · 추가 매입 중…`);const d=await companyApi('BUY_SHARES',{p_target_company_id:p.targetCompanyId,p_budget:tranche});if(d?.ok===false)throw new Error(d.message||'전략지분 매입 실패');spent+=tranche;steps++;await loadCompanyLayer(false,true);}
    const h=(state.company?.my_holdings||[]).find(x=>Number(x.target_company_id)===Number(p.targetCompanyId));return {ok:true,spent,steps:[`전략지분 자동 매입 ${steps}회`],message:`AI 재무팀이 자동 매입을 완료했습니다. 현재 보유지분 ${Number(h?.stake||0).toFixed(2)}%.`};
  }
  progress?.update(`${p.title} 집행 중…`);
  let result=null;
  if(p.kind==='PRODUCT_LAUNCH')result=await companyRealismApi('LAUNCH_PRODUCT',{p_product_id:p.productId});
  else if(p.kind==='PRODUCT_DEVELOP')result=await companyRealismApi('DEVELOP_PRODUCT',{p_name:p.productName,p_type:p.productType,p_target_price:p.targetPrice,p_budget:p.budget,p_capacity:p.capacity});
  else if(p.kind==='DEPT_INCENTIVE')result=await companyIncentiveV650('DEPARTMENT',p.department,p.budget);
  if(result?.ok===false)throw new Error(result.message||'자동 집행 실패');await loadCompanyLayer(false,true);return {ok:true,spent:Number(p.budget||0),steps:[p.title],message:result?.message||`${p.title}을 자동 집행했습니다.`};
}
function mediaAutopilotCatalog(){return [
  {apiCode:'ECON_DAILY',name:'KX 경제일보',cost:90000000,region:'국내'},
  {apiCode:'BIZ_TV',name:'비즈니스24',cost:65000000,region:'국내'},
  {apiCode:'EDGE_MEDIA',name:'EDGE 미디어',cost:35000000,region:'국내'},
  {apiCode:'QUICK_BUZZ',name:'퀵버즈 경제',cost:15000000,region:'국내'},
  {apiCode:'GLOBAL_WIRE',name:'Global Finance Wire',cost:160000000,region:'해외'}
]}
function mediaAutopilotPlan(anchor,tone,target,region,my){
  const all=mediaAutopilotCatalog(),anchorRow=all.find(x=>x.apiCode===anchor)||all[0],globalNeed=region==='해외'||Number(my?.global_level||0)>=2||Number(my?.global_share||0)>=5;
  const pref=tone==='CRITICAL'?(globalNeed?['ECON_DAILY','GLOBAL_WIRE','BIZ_TV','EDGE_MEDIA']:['ECON_DAILY','BIZ_TV','EDGE_MEDIA','GLOBAL_WIRE']):tone==='NEUTRAL'?['ECON_DAILY','GLOBAL_WIRE','BIZ_TV','EDGE_MEDIA']:(globalNeed?['GLOBAL_WIRE','ECON_DAILY','BIZ_TV','EDGE_MEDIA']:['ECON_DAILY','BIZ_TV','EDGE_MEDIA','GLOBAL_WIRE']);
  const codes=[anchorRow.apiCode,...pref.filter(x=>x!==anchorRow.apiCode)];return codes.map(c=>all.find(x=>x.apiCode===c)).filter(Boolean);
}
async function runMediaAutopilot(anchor,targetId,tone,region,baseCost,progress){
  const my=state.company?.my_company,target=(state.company?.companies||[]).find(c=>Number(c.id)===Number(targetId))||my;if(!my||!target)throw new Error('기사 대상을 찾지 못했습니다.');
  const factor=tone==='CRITICAL'?1.15:1,anchorCost=Math.max(15000000,Number(baseCost||0))*factor,cash=Math.max(0,Number(my.cash||0));
  const cap=Math.max(anchorCost,Math.min(cash*(tone==='CRITICAL'?.14:.10),anchorCost*3.2));const plan=mediaAutopilotPlan(anchor,tone,target,region,my);let spent=0,articles=[];
  for(const outlet of plan){if(articles.length>=3)break;const expected=outlet.cost*factor;if(spent+expected>cap&&articles.length)continue;if(expected>Math.max(0,Number(state.company?.my_company?.cash||0))&&articles.length)break;progress?.update(`${outlet.name} 기사 자동 발행 중… (${articles.length+1}/3)`);try{const r=await companyMediaV640(outlet.apiCode,targetId,tone);if(r?.ok===false)throw new Error(r.message||'기사 발행 실패');spent+=expected;articles.push({outlet:outlet.name,headline:r?.headline||'',result:r});await loadCompanyLayer(false,true);}catch(err){if(!articles.length)throw err;break;}}
  const last=articles[articles.length-1]?.result;if(last?.headline)showCompanyPressFlash({headline:last.headline,article_body:last.article_body,outlet_name:last.outlet_name||articles[articles.length-1].outlet,bot_flow:last.bot_flow,company_id:last.target_company_id||targetId});
  return {ok:true,spent,articles,cap,message:`AI 홍보팀이 ${articles.length}개 매체를 자동 조합해 캠페인을 집행했습니다. 예상 집행액 ${formatKrwSmart(spent)}.`};
}

function chairmanPriorityLabel(p){return p==='critical'?'긴급':p==='warn'?'주의':p==='opportunity'?'기회':'검토'}
function renderChairmanCommandCenter(my){
  const proposals=buildChairmanProposals(my),auto=companyAutomationSummary(state.company),perf=talentDepartmentPerformance(state.company),talents=[...(state.company?.talents||[])].sort((a,b)=>talentAutopilotContribution(b)-talentAutopilotContribution(a)).slice(0,5),threat=activeTakeoverThreat();
  return `<section class="chairman-command-center"><div class="chairman-head"><div><small>CHAIRMAN'S OFFICE</small><h2>회장 결재실</h2><p>일상 운영은 직원에게 위임합니다. 회장이 한 번 승인하면 AI 경영진이 승인 한도 안에서 필요한 후속 조치까지 자동 집행합니다.</p></div><div class="chairman-autonomy"><span>위임 운영</span><b>${auto.grade[0]} · ${escapeHtml(auto.grade[1])}</b><em>자동운영 지수 ${auto.automationIndex.toFixed(1)}</em></div></div><div class="chairman-delegation-strip"><span><b>직원들이 자동 처리</b> 기술 개선 · 영업 실행 · 생산 안정화 · 준법/조직 운영</span><span><b>회장 결재 필요</b> 한 번 승인 → AI가 예산 한도 안에서 최적 실행을 끝까지 진행</span></div><div class="chairman-proposal-title"><div><small>APPROVAL QUEUE</small><b>결재 대기 ${proposals.length}건</b></div><button type="button" data-company-section-jump="people">직원 현황 보기</button></div><div class="chairman-proposal-grid">${proposals.length?proposals.map(p=>`<article class="chairman-proposal ${p.priority}"><div class="proposal-meta"><span>${chairmanPriorityLabel(p.priority)}</span><small>${escapeHtml(talentDepartmentShort(p.department))}</small></div><h3>${escapeHtml(p.title)}</h3><p>${escapeHtml(p.summary)}</p><div class="proposal-facts"><span><small>제안자</small><b>${p.officer?escapeHtml(p.officer.name):escapeHtml(talentDepartmentShort(p.department))}</b></span><span><small>권고 예산</small><b>${formatKrwSmart(p.budget||0)}</b></span><span><small>AI 자동집행 한도</small><b>${formatKrwSmart(chairmanAutopilotCap(p,my))}</b></span><span><small>예상 효과</small><b>${escapeHtml(p.impact||'-')}</b></span></div><div class="proposal-actions"><button type="button" data-chairman-approve="${escapeHtml(p.id)}">승인·AI 자동집행</button><button type="button" class="secondary" data-chairman-reject="${escapeHtml(p.id)}">이번 안건 보류</button></div></article>`).join(''):`<div class="chairman-empty"><b>현재 결재 대기 안건이 없습니다.</b><span>직원들은 일상 운영을 계속 진행합니다. 중요한 안건이 생기면 이곳에 올라옵니다.</span></div>`}</div><details class="chairman-incentive-box"><summary><b>성과 인센티브·회장 지시</b><span>잘하는 부서/직원에게 보상하거나 직접 운영 화면으로 이동합니다.</span></summary><div class="chairman-incentive-grid">${perf.map(d=>`<article><div><small>${escapeHtml(d.label)}</small><b>${d.score.toFixed(1)}점</b><span>${d.count}명 · 자동운영 ${d.auto.toFixed(1)}</span></div><label>인센티브<input id="chairmanDeptBonus_${d.code}" value="3000만"></label><button type="button" data-chairman-dept-incentive="${d.code}" ${d.count?'':'disabled'}>부서 인센티브</button></article>`).join('')}</div>${talents.length?`<div class="chairman-talent-bonus"><div class="chairman-mini-title"><b>핵심인재 개인 보상</b><span>자동운영 기여도가 높은 순</span></div>${talents.map(t=>`<article><span>${talentGradeBadge(t)} <b>${escapeHtml(t.name)}</b><small>${escapeHtml(talentDepartmentShort(t.department))} · 기여 ${talentAutopilotContribution(t).toFixed(1)}</small></span><input id="chairmanTalentBonus_${t.id}" value="1000만"><button type="button" data-chairman-talent-incentive="${t.id}">개인 인센티브</button></article>`).join('')}</div>`:''}<div class="chairman-directives"><button type="button" data-company-section-jump="operations">사업부에 직접 지시</button><button type="button" data-company-section-jump="competition">M&A팀에 직접 지시</button><button type="button" data-company-section-jump="people">인사팀에 직접 지시</button>${threat?`<button type="button" class="risk" data-chairman-direct-defense>긴급 자사주 매입 지시</button>`:''}</div></details></section>`;
}

function renderCompanyModuleMap(my){
  const activeProjects=(state.company?.projects||[]).filter(p=>String(p.status)==='ACTIVE').length;
  const readyProducts=(state.company?.products||[]).filter(p=>String(p.status)==='READY').length;
  const talents=(state.company?.talents||[]).length;
  const offers=(state.company?.talent_offers||[]).length;
  const threat=companyStakeAgainstMe();
  const due=Math.max(0,Number(my?.tax_due||0)+Number(my?.tax_arrears||0));
  const supplyRisk=Number(state.company?.supply?.supply_risk||my?.supply_risk||0);
  const groups=[
    ['operations','사업',[['products','제품',readyProducts?`대기 ${readyProducts}`:'운영'],['projects','프로젝트',activeProjects?`진행 ${activeProjects}`:'신규'],['supply','공급망',supplyRisk>=38?`위험 ${supplyRisk.toFixed(0)}`:'안정'],['finance','재무','손익'],['portfolio','법인투자','자산'],['global','해외',`Lv.${Number(my?.global_level||0)}`]]],
    ['people','조직',[['talent','인재시장',offers?`제안 ${offers}`:`핵심 ${talents}`],['workforce','인력·급여',`${nf.format(Number(my?.employees||0))}명`]]],
    ['competition','경쟁',[['companies','기업분석','경쟁사'],['war','기업전쟁','BOT'],['control','경영권',threat>0?`${threat.toFixed(1)}%`:'안정']]],
    ['risk','리스크',[['news','뉴스·IR','평판'],['compliance','세금·준법',due>0?formatKrwSmart(due):'정상']]]
  ];
  return `<section class="workspace-launcher" aria-label="회사 업무실"><div class="workspace-launcher-head"><div><small>WORKSPACES</small><h2>회사 업무실</h2></div></div><div class="workspace-group-grid">${groups.map(([section,title,items])=>`<article class="workspace-group ${section}"><div class="workspace-group-title"><b>${title}</b><span>${items.length}</span></div><div class="workspace-group-actions">${items.map(([tab,label,status])=>`<button type="button" data-company-route="${section}:${tab}"><span>${escapeHtml(label)}</span><b>${escapeHtml(String(status))}</b></button>`).join('')}</div></article>`).join('')}</div></section>`;
}

function renderCompanyWorkspaceTabs(section){
  let rows=[],active='';
  if(section==='dashboard'){rows=[['today','오늘'],['approvals','결재'],['performance','성과'],['progress','진행현황']];active=state.companyDashTab||'today';}
  else if(section==='operations'){return '';}
  else if(section==='people'){rows=[['talent','인재시장'],['workforce','인력·급여']];active=state.companyPeopleTab||'talent';}
  else if(section==='competition'){rows=[['companies','기업분석'],['war','기업전쟁'],['control','경영권']];active=state.companyCompetitionTab||'companies';}
  else if(section==='risk'){rows=[['news','뉴스·IR'],['compliance','세금·준법']];active=state.companyRiskTab||'news';}
  if(!rows.length)return '';
  return `<nav class="workspace-tabs" aria-label="${section} 하위 메뉴">${rows.map(([k,label])=>`<button type="button" data-company-workspace-tab="${section}:${k}" class="${active===k?'on':''}">${label}</button>`).join('')}</nav>`;
}
function renderCompanyWorkspace(my){
  const section=state.companySection||'dashboard';
  if(section==='operations')return renderOperationsWorkspace(my);
  if(section==='people'){
    const tab=state.companyPeopleTab||'talent';
    return `${renderCompanyWorkspaceTabs(section)}${tab==='workforce'?renderPeopleFinanceDesk(my):renderTalentMarket(my)}`;
  }
  if(section==='competition'){
    const tab=state.companyCompetitionTab||'companies';
    if(tab==='war')return `${renderCompanyWorkspaceTabs(section)}${renderCorporateWarLive(my,'full')}`;
    if(tab==='control')return `${renderCompanyWorkspaceTabs(section)}${takeoverProtectionNotice(state.company)}${renderTakeoverCrisis(my)}<details id="takeoverOwnershipDetails" class="management-details" open><summary>지분·경영권 상세</summary>${renderTakeoverDesk(my)}</details>`;
    return `${renderCompanyWorkspaceTabs(section)}${renderCompetitionBoard(my)}`;
  }
  if(section==='risk'){
    const tab=state.companyRiskTab||'news';
    return `${renderCompanyWorkspaceTabs(section)}${tab==='compliance'?renderTaxOffice(my):renderMediaDesk(my)}`;
  }
  const tab=state.companyDashTab||'today';
  if(tab==='approvals')return `${renderCompanyWorkspaceTabs(section)}${renderChairmanCommandCenter(my)}`;
  if(tab==='performance')return `${renderCompanyWorkspaceTabs(section)}${renderCompanyRealityHealth(my)}${renderRealOperatingBrief(my)}${renderCompanyGrowthPanel(my)}`;
  if(tab==='progress')return `${renderCompanyWorkspaceTabs(section)}${renderDashboardProgress(my)}${renderCompanyLatestNews(my)}`;
  return `${renderCompanyWorkspaceTabs(section)}${renderDashboardTakeoverAlert(my)}${renderExecutiveAgenda(my)}${renderCompanyModuleMap(my)}`;
}

function renderCompanySubnav(my){
  const section=state.companySection||'dashboard';
  const threat=companyStakeAgainstMe(),offers=(state.company?.talent_offers||[]).length;
  const items=[
    ['dashboard','경영'],['operations','사업'],['people','조직',offers?`${offers}`:null],['competition','경쟁',threat>=15?`${threat.toFixed(0)}%`:null],['risk','리스크']
  ];
  return `<nav class="company-section-switcher compact-switcher">${items.map(([k,title,badge])=>`<button type="button" data-company-section="${k}" class="${section===k?'on':''}"><b>${title}</b>${badge?`<span>${badge}</span>`:''}</button>`).join('')}</nav>`;
}

function renderCompanyCompactContext(my,myRank,companies){
  const section=state.companySection||'dashboard';
  const labels={operations:['BUSINESS OPERATIONS','사업 운영'],people:['PEOPLE','직원·인재'],competition:['COMPETITION · M&A','투자·M&A'],risk:['NEWS · RISK','뉴스·리스크'],dashboard:['CEO OFFICE','경영 홈']};
  const meta=labels[section]||labels.dashboard;
  const threat=companyStakeAgainstMe();
  const activeProjects=(state.company?.projects||[]).filter(p=>String(p.status)==='ACTIVE').length;
  const totalCompanies=Array.isArray(companies)?companies.length:0;
  return `<section class="company-compact-context" aria-label="현재 회사 요약">
    <div class="company-compact-identity"><small>${meta[0]}</small><div><strong>${escapeHtml(my.name)}</strong><span>${escapeHtml(my.sector||'')} · 전체 ${totalCompanies}개 중 #${myRank||'-'} · ${meta[1]}</span></div></div>
    <div class="company-compact-kpis">
      <article><small>법인 현금</small><b>${formatKrwSmart(my.cash)}</b></article>
      <article><small>회사 가치</small><b>${formatKrwSmart(my.valuation)}</b></article>
      <article class="${threat>=35?'danger':''}"><small>경영권 위험</small><b>${threat.toFixed(1)}%</b><span>${threat<=0?'현재 공격 없음':threat<15?'관찰 단계':threat<35?'인수 압박 주의':'방어 필요'}</span></article>
      <article><small>진행 프로젝트</small><b>${activeProjects}개</b></article>
    </div>
  </section>`;
}

function renderCompanyRoom(){
  if(state.companyAvailable===false)return renderCompanyOnlineRequired();
  const my=state.company?.my_company;
  if(!my)return `${renderCompanyModeBanner()}${renderCompanyCreate()}`;
  const grow=companyGrowth(my),margin=companyProfitMargin(my),threat=companyStakeAgainstMe();
  const companies=[...(state.company?.companies||[])].filter(x=>x.status!=='INACTIVE').sort((a,b)=>Number(b.valuation)-Number(a.valuation));
  const myRank=companies.findIndex(c=>Number(c.id)===Number(my.id))+1;
  const activeProjects=(state.company?.projects||[]).filter(p=>String(p.status)==='ACTIVE').length;
  const paybackProjects=(state.company?.projects||[]).filter(p=>String(p.status)==='PAYBACK').length;
  const latestIncome=(state.company?.investment_income||[])[0]||null;
  const latestArticle=(state.company?.press||[])[0]||null;
  const headline=String(latestArticle?.headline||'');
  const shortHeadline=headline?escapeHtml(headline.length>36?`${headline.slice(0,36)}…`:headline):'최근 공시·기사가 아직 없습니다.';
  const runway=companyCashRunway(my);const health=runway.months>=6?`현금 런웨이 ${runway.months.toFixed(1)}개월 · 안정`:runway.months>=3?`현금 런웨이 ${runway.months.toFixed(1)}개월 · 주의`:`현금 런웨이 ${runway.months.toFixed(1)}개월 · 위험`;
  const notice=state.companyNotice?escapeHtml(state.companyNotice):'';
  const dashboardHero=`<div class="company-hero-grid">
      <section class="company-hero-card">
        <div class="company-hero-head"><div><small>CEO OFFICE · LIVE MANAGEMENT</small><h1>${escapeHtml(my.name)}</h1><p>${escapeHtml(my.sector)} · 대한민국 · 전체 ${companies.length}개 회사 중 <b>#${myRank||'-'}</b> · ${companyScaleLabel(my.valuation)}</p></div><div class="company-hero-price"><small>현재 주가</small><b>${companySharePriceText(my)}</b><span class="${Number(my.last_return_pct||0)>=0?'up':'down'}">${Number(my.last_return_pct||0)>=0?'+':''}${Number(my.last_return_pct||0).toFixed(2)}%</span></div></div>
        <div class="company-hero-metrics compact-hero-metrics">
          <article><small>회사 가치</small><b>${formatKrwSmart(my.valuation)}</b><span>전체 #${myRank||'-'}</span></article>
          <article><small>법인 현금</small><b>${formatKrwSmart(my.cash)}</b><span class="${runway.months<3?'down':runway.months>=6?'up':''}">런웨이 ${runway.months.toFixed(1)}개월</span></article>
          <article><small>매출</small><b>${compactMoney(my.revenue)}원</b><span class="${grow>=0?'up':'down'}">${pct(grow)}</span></article>
          <article class="${Number(my.profit)<0?'danger':''}"><small>영업이익</small><b class="${Number(my.profit)>=0?'up':'down'}">${compactMoney(my.profit)}원</b><span>마진 ${margin.toFixed(1)}%</span></article>
        </div>
      </section>
    </div>`;
  const sectionTop=state.companySection==='dashboard'?dashboardHero:`${renderCompanyCompactContext(my,myRank,companies)}`;
  return `<main class="page-view company-page"><section class="panel page-panel company-shell management-first-shell v52-clean-shell corporate-ui-refresh">
    ${sectionTop}
    <div class="company-notice ui-refresh-notice ${state.companyNotice?'':'muted'}" id="companyMsg">${notice}</div>
    ${state.companySection==='dashboard'?renderCompanyGameCenter(my,myRank,companies):''}
    <div class="company-workspace">${renderCompanyWorkspace(my)}</div>
  </section></main>`;
}

function renderPortfolio(){
  const holdings=stockAssets();
  const deposits=bankAssets(),loans=bankDebt();
  return `<main class="page-view"><section class="panel page-panel">
    <div class="page-title"><div><small>MY ASSETS</small><h1>내 자산</h1></div><span>평가금액은 현재 체결가 기준</span></div>
    <div class="summary asset-summary">
      <div><small>주문 가능 현금</small><b>${won(state.account?.cash)}</b></div>
      <div><small>주식 평가액</small><b>${won(holdings)}</b></div>
      <div><small>공매도 평가액</small><b>${won(shortEquity())}</b></div>
      <div><small>예금·적금</small><b>${won(deposits)}</b></div>
      <div><small>대출 잔액</small><b class="${loans>0?'down':''}">${won(loans)}</b></div>
      <div><small>개인 투자 순자산</small><b>${won(totalAssets())}</b></div>
    </div>
    <div class="table">
      <div class="trow head"><span>종목</span><span>수량</span><span>평균단가</span><span>현재가</span><span>평가손익</span></div>
      ${state.positions.length?state.positions.map(p=>{
        const st=state.stocks.find(x=>x.ticker===p.ticker),cur=Number(st?.last_price||0),pl=(cur-Number(p.avg_price))*Number(p.quantity);
        return `<div class="trow"><span><b>${escapeHtml(st?.name||p.ticker)}</b><small>${p.ticker}</small></span><span>${nf.format(p.quantity)}주</span><span>${nf.format(p.avg_price)}</span><span>${nf.format(cur)}</span><b class="${pl>=0?'up':'down'}">${won(pl)}</b></div>`;
      }).join(''):`<div class="empty">아직 보유한 주식이 없습니다.</div>`}
    </div>
  </section></main>`;
}

function renderOrders(){
  return `<main class="page-view"><section class="panel page-panel">
    <div class="page-title"><div><small>ORDERS</small><h1>주문 내역</h1></div><span>미체결 주문은 취소할 수 있습니다</span></div>
    <div class="orderslist">${state.orders.length?state.orders.map(o=>`<div class="orderrow">
      <div><b class="${o.side==='BUY'?'up':'down'}">${o.side==='BUY'?'매수':'매도'}</b><strong>${escapeHtml(o.ticker)}</strong><small>${o.order_type==='MARKET'?'시장가':`지정가 ${nf.format(o.limit_price)}`} · ${escapeHtml(o.tif)}</small></div>
      <div><b>${nf.format(o.filled)} / ${nf.format(o.quantity)}주</b><small>${ORDER_STATUS[o.status]||escapeHtml(o.status)}</small></div>
      ${['OPEN','PARTIAL'].includes(o.status)?`<button data-cancel="${o.id}">주문 취소</button>`:'<span></span>'}
    </div>`).join(''):`<div class="empty">아직 주문 내역이 없습니다.</div>`}</div>
  </section></main>`;
}

function renderNews(){
  const lead=state.news.find(n=>n.severity==='EXTRA')||state.news.find(n=>n.severity==='BREAKING')||state.news[0];
  const rest=lead?state.news.filter(n=>n.id!==lead.id):state.news;
  const gm=guidanceMode();
  const interpretation=gm==='BEGINNER'?`<div class="news-learning"><b>뉴스를 이렇게 읽어보세요</b><span>① 어떤 기업·산업 이야기인지 → ② 실제 실적/수요/비용에 어떤 영향을 주는지 → ③ 이미 가격에 반영됐는지 순서로 봅니다. <strong>좋은 뉴스 = 무조건 매수</strong>는 아닙니다.</span></div>`:gm==='STANDARD'?`<div class="news-learning compact"><b>뉴스는 방향 신호가 아니라 정보</b><span>헤드라인보다 실적·수요·비용 변화와 이미 반영된 기대를 함께 보세요.</span></div>`:'';
  return `<main class="page-view"><section class="panel page-panel newsroom">
    <div class="page-title newsroom-title"><div><small>KX MARKET NEWS · LIVE</small><h1>시장 뉴스</h1></div><span>가격·뉴스·발표 시각은 모든 접속자에게 동일합니다</span></div>
    ${interpretation}
    ${lead?`<article class="lead-news ${lead.severity==='EXTRA'?'extra':lead.severity==='BREAKING'?'breaking':''}">
      <div class="newsmeta"><span class="newsbadge ${lead.severity==='EXTRA'?'extra':lead.severity==='BREAKING'?'breaking':''}">${NEWS_SEV[lead.severity]||'일반'}</span><span>${escapeHtml(lead.ticker||lead.sector||'시장')}</span><time>${lead.created_at?new Date(lead.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div>
      <h2>${escapeHtml(lead.headline)}</h2><p>${escapeHtml(lead.body)}</p>
    </article>`:''}
    <div class="newslist">${rest.length?rest.map(n=>{
      const sev=NEWS_SEV[n.severity]||n.severity||'일반';const sevClass=n.severity==='EXTRA'?'extra':n.severity==='BREAKING'?'breaking':'';
      const mood=Number(n.sentiment)>=0?'긍정 압력':'부정 압력';
      const moodHtml=gm==='REALISTIC'?'':`<span class="${Number(n.sentiment)>=0?'up':'down'}">${mood}</span>`;
      return `<article class="newsitem"><div class="newsmeta"><span class="newsbadge ${sevClass}">${escapeHtml(sev)}</span><span>${escapeHtml(n.ticker||n.sector||'시장')}</span>${moodHtml}<time>${n.created_at?new Date(n.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div><h3>${escapeHtml(n.headline)}</h3><p>${escapeHtml(n.body)}</p></article>`;
    }).join(''):`<div class="empty">아직 발표된 뉴스가 없습니다.</div>`}</div>
  </section></main>`;
}

function renderBank(){
  const dep=bankAssets(),debt=bankDebt(),cash=Number(state.account?.cash||0),base=Number(state.bankMeta?.base_rate||3.50);
  const regime=state.clock?.market_regime||state.bankMeta?.market_regime||'NEUTRAL';
  const depRows=state.bankDeposits.map(x=>`<div class="bank-row"><div><b>${x.product_type==='TERM'?'정기예금':'정기적금'}</b><small>${Number(x.annual_rate).toFixed(2)}% · 만기 DAY ${x.maturity_day}${x.product_type==='SAVINGS'?` · ${nf.format(x.monthly_amount)}원/회`:''}</small></div><div><b>${won(x.balance)}</b><small>${x.status==='MATURED'?'만기 도래':x.status==='ACTIVE'?'운용 중':'종료'}</small></div>${['ACTIVE','MATURED'].includes(x.status)?`<button data-bank-withdraw="${x.id}">${x.status==='MATURED'?'만기 수령':'중도해지'}</button>`:'<span></span>'}</div>`).join('');
  const loanRows=state.bankLoans.map(x=>`<div class="bank-row loan-row"><div><b>신용대출</b><small>${Number(x.annual_rate).toFixed(2)}% · ${x.term_months}개월 상환 · ${Number(x.missed_count||0)>0?`연체 ${x.missed_count}회`:'정상'}</small></div><div><b>${won(Number(x.outstanding||0)+Number(x.accrued_interest||0))}</b><small>원금 ${won(x.outstanding)} · 이자 ${won(x.accrued_interest)}</small></div>${x.status==='ACTIVE'?`<button data-bank-repay="${x.id}" data-bank-debt="${Number(x.outstanding||0)+Number(x.accrued_interest||0)}">상환</button>`:'<span></span>'}</div>`).join('');
  return `<main class="page-view bank-page"><section class="panel page-panel">
    <div class="page-title"><div><small>KX BANK</small><h1>은행</h1></div><span>실제 금융상품 구조를 단순화한 모의 금융 서비스</span></div>
    <div class="bank-overview"><div><small>주문 가능 현금</small><b>${won(cash)}</b></div><div><small>예금·적금</small><b>${won(dep)}</b></div><div><small>대출 잔액</small><b>${won(debt)}</b></div><div><small>기준금리</small><b>${base.toFixed(2)}%</b></div></div>
    <div class="bank-notice"><b>금융 시뮬레이션 기준</b><span>시장 DAY 1회를 은행의 1개월로 환산합니다. 예·적금은 연이율을 월 단위로 정산하고, 대출은 매 DAY 원금과 이자를 자동 상환합니다. 현금이 부족하면 연체이자가 발생할 수 있습니다.</span></div>
    <div class="bank-products">
      <article class="bank-product"><div class="bank-product-head"><span>목돈 운용</span><h2>정기예금</h2><strong class="product-rate">예상 연 ${(base-0.20).toFixed(2)}~${(base+0.35).toFixed(2)}%</strong><p>한 번에 예치하고 만기까지 보유합니다. 중도해지 시 약정이자의 일부만 인정됩니다.</p></div><label>예치금액<input id="termAmount" type="number" min="100000" step="10000" value="1000000"></label><label>기간<select id="termMonths"><option value="3">3개월</option><option value="6">6개월</option><option value="12">12개월</option></select></label><button id="openTermDeposit">정기예금 가입</button></article>
      <article class="bank-product"><div class="bank-product-head"><span>매월 적립</span><h2>정기적금</h2><strong class="product-rate">예상 연 ${(base+0.45).toFixed(2)}~${(base+0.70).toFixed(2)}%</strong><p>매 DAY 지정 금액을 자동 납입합니다. 현금 부족 시 해당 회차는 미납 처리됩니다.</p></div><label>월 납입액<input id="savingAmount" type="number" min="50000" step="10000" value="300000"></label><label>기간<select id="savingMonths"><option value="6">6개월</option><option value="12">12개월</option></select></label><button id="openSavings">정기적금 가입</button></article>
      <article class="bank-product risk"><div class="bank-product-head"><span>레버리지 주의</span><h2>신용대출</h2><strong class="product-rate risk-rate">한도 ${won(state.bankMeta?.available_credit||0)} · 금리는 부채비율에 따라 산정</strong><p>대출금은 현금으로 들어오지만 개인 투자 순자산에서는 부채로 차감됩니다. 투자손실과 대출이자가 동시에 발생할 수 있습니다.</p></div><label>대출금액<input id="loanAmount" type="number" min="100000" step="10000" value="1000000"></label><label>상환기간<select id="loanMonths"><option value="6">6개월</option><option value="12">12개월</option><option value="24">24개월</option></select></label><button id="takeLoan">대출 신청</button></article>
    </div>
    <div class="bank-ledger"><section><h2>예금·적금 현황</h2>${depRows||'<div class="empty compact">가입한 예금·적금이 없습니다.</div>'}</section><section><h2>대출 현황</h2>${loanRows||'<div class="empty compact">대출이 없습니다.</div>'}</section></div>
    <div class="bank-msg" id="bankMsg">예금은 주문 가능 현금에서 빠지고, 대출은 개인 투자 순자산에서 부채로 차감됩니다.</div>
  </section></main>`;
}

function renderRanking(){
  const companies=[...(state.company?.companies||[])].filter(x=>x&&x.status!=='INACTIVE').sort((a,b)=>Number(b.valuation)-Number(a.valuation));
  if(!companies.length)return `<main class="page-view narrow-view"><section class="panel page-panel"><div class="empty">아직 회사 데이터가 없습니다.</div></section></main>`;
  const myId=Number(state.company?.my_company?.id),myIdx=companies.findIndex(x=>Number(x.id)===myId),myRank=myIdx>=0?myIdx+1:null;
  const top=companies.slice(0,20),around=myIdx>=20?companies.slice(Math.max(0,myIdx-3),Math.min(companies.length,myIdx+4)):[];
  const row=(r,i)=>{const mine=Number(r.id)===myId;return `<div class="rankrow ${mine?'me':''}"><strong>${i}</strong><span><b>${escapeHtml(r.name)}${mine?' <em class="ranking-me-chip">내 회사</em>':''}</b><small>${companyTypeBadge(r)} ${escapeHtml(r.home_country||'')} · ${escapeHtml(r.sector||'')} · ${companyScaleLabel(r.valuation)}</small></span><b>${compactMoney(r.valuation)}원</b></div>`};
  return `<main class="page-view narrow-view"><section class="panel page-panel company-ranking-page clean-ranking"><div class="page-title"><div><small>CORPORATE MARKET RANKING</small><h1>기업 순위</h1></div><span>전체 ${companies.length}개 회사${myRank?` · 내 회사 #${myRank}`:''}</span></div><div class="rank-explain">처음 만든 회사가 곧바로 상위권에 들지 않습니다. BOT 기업과 다른 유저 회사가 같은 온라인 시장에서 장기간 성장합니다.</div><h2 class="rank-subtitle">TOP 20</h2><div class="ranklist corporate-ranklist">${top.map((r,i)=>row(r,i+1)).join('')}</div>${around.length?`<h2 class="rank-subtitle my-zone">내 회사 주변 순위</h2><div class="ranklist corporate-ranklist around-rank">${around.map((r,i)=>row(r,Math.max(1,myIdx-3)+i+1)).join('')}</div>`:''}</section></main>`;
}

function renderInvestmentGuide(){
  return `<main class="page-view learn-page"><section class="panel page-panel learn-panel">
    <div class="page-title learn-title"><div><small>INVESTMENT BASICS · 2026.09</small><h1>투자 기초</h1></div><span>주가 방향보다 먼저 알아두면 좋은 계좌·상품·손실 구조</span></div>

    <div class="learn-alert"><b>가장 먼저: 투자금은 원금보장 상품이 아닙니다</b><p>주식·ETF·펀드는 가격이 떨어지면 평가금액이 투자원금보다 작아질 수 있습니다. 팔기 전에는 평가손실, 팔면 손실이 확정됩니다. 기업 부도·상장폐지처럼 극단적인 경우에는 투자금의 대부분을 잃을 수도 있습니다. 예금·적금과 같은 원금보장 상품과 구분해서 보세요.</p></div>

    <section class="learn-section">
      <div class="learn-section-head"><small>01 · MARKET</small><h2>국내 주식과 해외 주식은 뭐가 다른가요?</h2></div>
      <div class="learn-compare two">
        <article><span class="learn-tag domestic">국내 주식</span><h3>원화로 한국 거래소 종목에 투자</h3><ul><li>원화로 거래하므로 직접적인 환전 과정이 없습니다.</li><li>한국 장 운영시간과 국내 공시·뉴스의 영향을 크게 받습니다.</li><li>종목·투자자 유형에 따라 세금 규칙이 달라질 수 있습니다.</li></ul></article>
        <article><span class="learn-tag foreign">해외 주식</span><h3>해외 기업 + 환율까지 함께 움직임</h3><ul><li>주가가 올라도 원화 환산 시 환율 때문에 수익이 줄 수 있고, 반대도 가능합니다.</li><li>국가별 거래시간·휴장일·배당 원천징수·매매차익 과세 규칙이 다릅니다.</li><li>이 게임은 해외 종목을 이해하기 쉽게 원화 환산 가격으로 보여줍니다.</li></ul></article>
      </div>
      <div class="learn-example"><b>예시</b><span>미국 주식이 달러 기준 +5% 올라도 같은 기간 원/달러 환율이 크게 내려가면 원화 기준 수익률은 +5%보다 작아질 수 있습니다.</span></div>
    </section>

    <section class="learn-section">
      <div class="learn-section-head"><small>02 · ACCOUNT</small><h2>같은 투자라도 어느 계좌에 넣느냐가 다릅니다</h2></div>
      <div class="account-cards">
        <article><div class="account-head"><span>일반계좌</span><b>자유도 우선</b></div><p>국내·해외 주식 등 다양한 상품을 직접 거래하기 가장 단순한 계좌입니다. 대신 ISA나 연금계좌 같은 별도 세제혜택은 없습니다.</p><dl><div><dt>잘 맞는 경우</dt><dd>자유로운 매매·해외 개별주식</dd></div><div><dt>주의</dt><dd>상품별 세금과 환율을 따로 확인</dd></div></dl></article>
        <article><div class="account-head"><span>중개형 ISA</span><b>절세 + 국내상장 상품</b></div><p>국내상장주식·ETF·펀드 등을 한 계좌에서 운용하며 손익통산과 세제혜택을 받을 수 있는 계좌입니다. 해외 거래소의 개별주식을 직접 사는 용도는 아닙니다.</p><dl><div><dt>2026.09 현행</dt><dd>연 2,000만원 · 총 1억원 · 의무 3년</dd></div><div><dt>세제</dt><dd>일반형 순이익 200만원, 서민·농어민형 400만원까지 비과세, 초과분 9.9% 분리과세</dd></div></dl></article>
        <article><div class="account-head"><span>연금저축</span><b>노후 + 세액공제</b></div><p>장기 노후자금 계좌입니다. 개별주식을 직접 고르는 계좌라기보다 펀드·ETF 중심으로 운용합니다. 세액공제를 받는 대신 연금 목적에 맞는 장기 운용이 중요합니다.</p><dl><div><dt>세액공제 대상 한도</dt><dd>연금저축 납입액 중 연 600만원까지</dd></div><div><dt>주의</dt><dd>중도해지·연금 외 수령 시 세금상 불이익 가능</dd></div></dl></article>
        <article><div class="account-head"><span>IRP</span><b>노후 + 더 엄격한 운용</b></div><p>개인형퇴직연금 계좌입니다. 연금저축과 합산해 세액공제 대상 납입한도를 넓힐 수 있지만, 위험자산 비중과 중도인출 조건이 더 엄격합니다.</p><dl><div><dt>세액공제 대상 한도</dt><dd>연금저축 포함 합산 연 900만원까지</dd></div><div><dt>투자 제한</dt><dd>주식형 등 위험자산은 통상 적립금의 최대 70%</dd></div></dl></article>
      </div>
      <p class="learn-law-note">※ 세법·계좌 규정은 개정될 수 있습니다. 게임에서는 학습을 위해 핵심 구조만 보여주며 실제 투자 전에는 금융회사·국세청의 최신 안내를 확인해야 합니다.</p>
    </section>

    <section class="learn-section">
      <div class="learn-section-head"><small>03 · PRODUCT</small><h2>ETF와 펀드는 무엇인가요?</h2></div>
      <div class="learn-compare two">
        <article><span class="learn-tag etf">ETF</span><h3>여러 자산을 한 바구니에 담아 주식처럼 거래</h3><p>ETF는 상장지수펀드입니다. 여러 종목이나 채권 등을 묶은 펀드인데 거래소에 상장돼 있어서 장중에 주식처럼 가격을 보며 사고팔 수 있습니다.</p><div class="mini-row"><span>장점</span><b>분산투자 · 실시간 거래 · 비교적 낮은 비용 구조</b></div><div class="mini-row"><span>위험</span><b>지수·편입자산이 떨어지면 ETF 가격도 하락</b></div></article>
        <article><span class="learn-tag fund">일반 펀드</span><h3>여러 사람의 돈을 모아 전문적으로 운용</h3><p>투자자의 돈을 모아 주식·채권 등에 나눠 투자하는 집합투자상품입니다. ETF와 달리 일반적인 공모펀드는 주식처럼 장중 실시간 가격으로 매매하는 구조가 아닙니다.</p><div class="mini-row"><span>장점</span><b>전문 운용 · 소액 분산투자</b></div><div class="mini-row"><span>주의</span><b>보수·수수료와 환매 조건, 투자대상을 확인</b></div></article>
      </div>
      <div class="learn-example"><b>한 줄 정리</b><span><strong>개별주식</strong>은 한 회사를 직접 고르는 것, <strong>ETF</strong>는 여러 자산 바구니를 주식처럼 거래하는 것, <strong>펀드</strong>는 투자금을 모아 정해진 전략으로 운용하는 상품입니다.</span></div>
    </section>

    <section class="learn-section">
      <div class="learn-section-head"><small>04 · RISK</small><h2>“원금이 없어져요?”에 대한 답</h2></div>
      <div class="risk-scale"><div><span>예금·적금</span><b>원금보장 여부를 상품 조건에서 확인</b><em>상대적으로 낮은 변동성</em></div><div><span>채권·채권형 펀드</span><b>금리·신용위험으로 가격 변동 가능</b><em>손실 가능</em></div><div><span>ETF·펀드</span><b>편입자산에 따라 위험이 크게 달라짐</b><em>원금 손실 가능</em></div><div><span>개별주식</span><b>기업가치·시장 충격에 직접 노출</b><em>큰 손실 가능</em></div></div>
      <div class="learn-rule-grid"><article><b>평가손실</b><span>100만원에 산 자산이 80만원이 되면 자산 화면에는 -20만원이 표시됩니다. 아직 팔지 않았어도 내 자산가치는 줄어든 상태입니다.</span></article><article><b>확정손실</b><span>80만원에 팔면 -20만원 손실이 확정됩니다. 이후 가격이 다시 올라도 이미 매도했기 때문에 회복되지 않습니다.</span></article><article><b>분산투자</b><span>한 종목에 전액을 넣는 것보다 서로 다른 종목·자산으로 나누면 특정 기업 충격의 영향을 줄이는 데 도움이 됩니다.</span></article><article><b>대출투자</b><span>손실이 나도 빌린 돈과 이자는 갚아야 하므로 손실 폭이 커질 수 있습니다. 게임의 신용대출도 같은 위험을 반영합니다.</span></article></div>
    </section>

    <div class="learn-bottom"><b>게임에서 이렇게 연습해보세요</b><span>① 투자 기초 확인 → ② 뉴스 확인 → ③ 국내/해외 종목 비교 → ④ 소량 지정가 주문 → ⑤ 평가손익 확인 → ⑥ 여러 종목으로 분산</span></div>
  </section></main>`;
}

function openTutorial(startIndex=0){
  state.tab='company';
  if(!state.companySection)state.companySection='dashboard';
  renderTerminal(true);
  startGuidedTour(startIndex);
}
function startGuidedTour(startIndex=0){
  const old=document.getElementById('guidedTourRoot');if(old)old.remove();
  document.body.classList.add('tutorial-active');
  const root=document.createElement('div');root.id='guidedTourRoot';root.className='guided-tour';
  const mask=document.createElement('div');mask.className='tour-focus';
  const bubble=document.createElement('div');bubble.className='tour-bubble';
  root.appendChild(mask);root.appendChild(bubble);document.body.appendChild(root);
  const steps=[
    {selector:'#tutorialBtn',kicker:'01 · 도움말',title:'튜토리얼 버튼',text:'이 버튼을 누르면 지금처럼 화면 위에 테두리를 띄우고, 각 버튼이 무슨 용도인지 차례대로 설명합니다. 길을 잃었을 때 언제든 다시 열 수 있습니다.',tab:'company',section:'dashboard'},
    {selector:'[data-company-section-nav="dashboard"]',kicker:'02 · 경영 홈',title:'현재 회사 상태를 먼저 확인하세요',text:'법인 현금, 회사 가치, 외부 지분 위협, 진행 중 프로젝트 같은 핵심 지표를 가장 먼저 보는 곳입니다. 매 주기마다 여기서 전체 흐름을 파악하면 됩니다.',tab:'company',section:'dashboard'},
    {selector:'[data-tour="reality-health"], .reality-health-board',kicker:'03 · 경영 진단',title:'숫자 여섯 개만 먼저 보세요',text:'현금 버팀, 영업이익률, 부채, 운전자본, 이직, 공급망 위험을 요약한 진단판입니다. 초록은 안정, 노랑은 주의, 빨강은 즉시 대응이 필요한 상태입니다.',tab:'company',section:'dashboard'},
    {selector:'[data-company-section-jump="operations"], [data-company-section-nav="operations"]',kicker:'04 · 사업 운영',title:'사업 버튼',text:'제품, 생산, 마케팅, 설비, 해외 사업을 실행합니다. 매출만 키우지 말고 현금 버팀과 이익률을 같이 확인하세요.',tab:'company',section:'dashboard'},
    {selector:'[data-company-action], [data-company-ops-tab="projects"], [data-company-section-nav="operations"]',kicker:'05 · 실행 버튼',title:'사업 운영 화면의 핵심 버튼',text:'프로젝트 시작 버튼을 눌러 실제 사업 결정을 실행합니다. 버튼 설명에 효과와 위험도가 적혀 있으니, 현금 여력과 회사 상황을 같이 보고 선택하면 됩니다.',tab:'company',section:'operations'},
    {selector:'[data-company-section-nav="people"]',kicker:'06 · 직원',title:'직원 버튼',text:'인재 채용, 일반 직원 관리, 급여, 연수, 해고를 처리하는 곳입니다. 회사 자동 운영 수준도 같이 확인할 수 있어, 조직 관리의 중심 화면입니다.',tab:'company',section:'people'},
    {selector:'[data-talent-hire], [data-talent-interview="open"], [data-company-hr="HIRE"]',kicker:'07 · 채용',title:'직원 채용 버튼',text:'후보를 바로 뽑거나, 일반 인력을 부서별로 채용하는 버튼입니다. 성장 속도를 높이고 싶을 때 먼저 사람부터 확보하면 운영이 훨씬 안정됩니다.',tab:'company',section:'people'},
    {selector:'[data-talent-train][data-training-type="BALANCED"]',kicker:'08 · 종합 연수',title:'종합 연수 버튼',text:'직원의 전체 능력을 고르게 올리는 연수입니다. 역량, 자동운영 기여도, 충성도가 함께 조금씩 상승하므로 기본 육성용으로 쓰기 좋습니다.',tab:'company',section:'people'},
    {selector:'[data-talent-train][data-training-type="SPECIALTY"]',kicker:'09 · 전문 연수',title:'전문 연수 버튼',text:'직원의 부서 특성에 맞는 핵심 능력을 집중 강화하는 연수입니다. 기술·영업·운영처럼 필요한 분야를 빠르게 키우고 싶을 때 사용하면 됩니다.',tab:'company',section:'people'},
    {selector:'[data-company-section-nav="competition"]',kicker:'10 · 기업/M&A',title:'기업/M&A 버튼',text:'경쟁사를 분석하고 지분을 확보하거나, 공개매수와 방어 전략을 다루는 공간입니다. 회사를 키운 뒤 더 큰 판을 노릴 때 사용하는 고급 경영 메뉴입니다.',tab:'company',section:'competition'},
    {selector:'.company-browser-row-v646',kicker:'11 · BOT 경영',title:'BOT도 자기 전략으로 회사를 움직입니다',text:'BOT은 12경영주기마다 재무·성장·기술·품질·조직 상태를 보고 R&D, 원가절감, 채용, 가격공세, 해외확장, M&A 같은 전략을 선택합니다. 기업 목록의 BOT 옆에 현재 전략이 짧게 표시됩니다.',tab:'company',section:'competition'},
    {selector:'[data-company-dd], [data-company-defense], [data-open-defense-overview], [data-company-section-nav="competition"]',kicker:'12 · 경쟁/방어',title:'인수·방어 실행 버튼',text:'실사 의뢰, 지분 매입, 방어 수단 보기 같은 버튼으로 실제 M&A 행동을 실행합니다. 큰돈이 드는 만큼 뉴스와 현금 사정을 먼저 확인하는 것이 좋습니다.',tab:'company',section:'competition'},
    {selector:'[data-company-section-nav="risk"]',kicker:'13 · 뉴스/IR',title:'뉴스/IR 버튼',text:'시장 뉴스, 리스크, 언론 홍보와 평판 흐름을 보는 곳입니다. 단순 장식이 아니라 주가, 회사 가치, 투자 심리에 영향을 주는 정보 화면입니다.',tab:'company',section:'risk'},
    {selector:'[data-main-tab="ranking"]',kicker:'14 · 순위',title:'기업 순위 버튼',text:'지금까지의 경영 결과가 최종적으로 어떻게 반영됐는지 보는 곳입니다. 단기 수익보다 회사 가치, 현금흐름, 조직, 투자 성과를 함께 키워야 순위가 올라갑니다.',tab:'ranking'}
  ];
  let index=Math.max(0,Math.min(startIndex,steps.length-1));
  let activeTarget=null;
  const clearTarget=()=>{if(activeTarget){activeTarget.classList.remove('tour-targeted','focus-pulse');activeTarget=null;}};
  const visibleTarget=(selector)=>{const els=[...document.querySelectorAll(selector)].filter(el=>{const r=el.getBoundingClientRect();const s=window.getComputedStyle(el);return r.width>4&&r.height>4&&s.visibility!=='hidden'&&s.display!=='none'});return els[0]||null};
  const close=()=>{clearTarget();document.body.classList.remove('tutorial-active');root.remove();window.removeEventListener('resize',draw);window.removeEventListener('scroll',draw,true)};
  const alignBubble=(target)=>{
    const r=target.getBoundingClientRect();
    const bw=Math.min(380,window.innerWidth-24);
    bubble.style.width=`${bw}px`;
    const bh=Math.max(140,Math.min(bubble.offsetHeight||180,window.innerHeight-24));
    let left=Math.min(window.innerWidth-bw-12,r.right+18);
    if(left<12||left+bw>window.innerWidth-12)left=Math.max(12,Math.min(window.innerWidth-bw-12,r.left+r.width/2-bw/2));
    let top=Math.max(12,Math.min(window.innerHeight-bh-12,r.bottom+16));
    if(top+bh>window.innerHeight-12)top=Math.max(12,r.top-bh-16);
    bubble.style.left=`${left}px`;bubble.style.top=`${top}px`;
  };
  const ensureContext=(step)=>{
    let changed=false;
    if(step.tab&&state.tab!==step.tab){state.tab=step.tab;changed=true;}
    if(step.tab==='company'&&step.section&&state.companySection!==step.section){state.companySection=step.section;changed=true;}
    if(changed){renderTerminal(true);return true}
    return false;
  };
  const draw=()=>{
    const step=steps[index];
    bubble.innerHTML=`<button class="tour-close" aria-label="닫기">×</button><div class="tour-step"><small>${step.kicker} · ${index+1}/${steps.length}</small><h2>${step.title}</h2><p>${step.text}</p></div><div class="tour-actions"><button type="button" ${index===0?'disabled':''} data-tour-nav="prev">이전</button><button type="button" data-tour-nav="next">${index===steps.length-1?'완료':'다음'}</button></div>`;
    bubble.querySelector('.tour-close').onclick=close;
    bubble.querySelector('[data-tour-nav="prev"]').onclick=()=>{if(index>0){index-=1;draw()}};
    bubble.querySelector('[data-tour-nav="next"]').onclick=()=>{if(index>=steps.length-1)close();else{index+=1;draw()}};
    if(ensureContext(step)){setTimeout(draw,90);return;}
    const target=visibleTarget(step.selector);
    clearTarget();
    if(!target){mask.style.left='50%';mask.style.top='50%';mask.style.width='1px';mask.style.height='1px';bubble.style.left='12px';bubble.style.top='12px';return;}
    activeTarget=target;activeTarget.classList.add('tour-targeted');
    target.scrollIntoView({block:'center',inline:'center',behavior:'smooth'});
    setTimeout(()=>{if(!document.body.contains(target))return;const r=target.getBoundingClientRect();mask.style.left=`${Math.max(8,r.left-8)}px`;mask.style.top=`${Math.max(8,r.top-8)}px`;mask.style.width=`${Math.max(36,r.width+16)}px`;mask.style.height=`${Math.max(28,r.height+16)}px`;alignBubble(target);activeTarget&&activeTarget.classList.add('focus-pulse');setTimeout(()=>activeTarget&&activeTarget.classList.remove('focus-pulse'),700);},80);
  };
  window.addEventListener('resize',draw);window.addEventListener('scroll',draw,true);draw();
}

function drawCompanyGrowthChart(){
  const canvas=document.getElementById('companyGrowthChart');if(!canvas)return;
  const metric=state.companyMetric||'valuation';
  const raw=[...(state.company?.my_history||[])].sort((a,b)=>Number(a.cycle_no)-Number(b.cycle_no));
  const rows=raw.filter(r=>Number.isFinite(Number(r[metric]))).slice(-64);
  const dpr=window.devicePixelRatio||1,W=Math.max(320,canvas.clientWidth||800),H=Math.max(230,canvas.clientHeight||270);canvas.width=W*dpr;canvas.height=H*dpr;const ctx=canvas.getContext('2d');ctx.scale(dpr,dpr);ctx.clearRect(0,0,W,H);
  if(!rows.length)return;
  const vals=rows.map(r=>Number(r[metric]||0));let lo=Math.min(...vals),hi=Math.max(...vals),center=(hi+lo)/2||1;
  const minBand=Math.max(Math.abs(center)*.025,1);if(hi-lo<minBand){lo=center-minBand/2;hi=center+minBand/2}else{const pad=(hi-lo)*.12;lo-=pad;hi+=pad}
  const L=66,R=20,T=20,B=36,pw=W-L-R,ph=H-T-B;ctx.strokeStyle='#273242';ctx.lineWidth=1;ctx.fillStyle='#7c8b9f';ctx.font='11px sans-serif';ctx.textAlign='right';
  for(let i=0;i<5;i++){const y=T+ph*i/4;ctx.beginPath();ctx.moveTo(L,y);ctx.lineTo(W-R,y);ctx.stroke();const v=hi-(hi-lo)*i/4;ctx.fillText(preciseCompactMoney(v,hi-lo),L-8,y+4)}
  const x=i=>L+(rows.length===1?pw/2:i*pw/(rows.length-1)),y=v=>T+(hi-v)/(hi-lo)*ph;
  const grad=ctx.createLinearGradient(0,T,0,T+ph);grad.addColorStop(0,'rgba(231,191,97,.22)');grad.addColorStop(1,'rgba(231,191,97,.01)');
  ctx.beginPath();rows.forEach((r,i)=>{const xx=x(i),yy=y(vals[i]);i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)});ctx.strokeStyle='#e7bf61';ctx.lineWidth=2.6;ctx.stroke();ctx.lineTo(x(rows.length-1),T+ph);ctx.lineTo(x(0),T+ph);ctx.closePath();ctx.fillStyle=grad;ctx.fill();
  rows.forEach((r,i)=>{if(i!==rows.length-1&&i%Math.max(1,Math.floor(rows.length/8))!==0)return;ctx.beginPath();ctx.arc(x(i),y(vals[i]),i===rows.length-1?4:2.4,0,Math.PI*2);ctx.fillStyle=i===rows.length-1?'#f4cf73':'#a98d4b';ctx.fill()});
  ctx.fillStyle='#8998aa';ctx.textAlign='center';[0,Math.floor((rows.length-1)/2),rows.length-1].forEach((i,idx)=>{const r=rows[i];if(!r)return;ctx.fillText(idx===2?'현재':idx===0?'과거':`중간`,x(i),H-11)});
  const first=vals[0],last=vals[vals.length-1],chg=first?((last-first)/Math.abs(first))*100:0;ctx.textAlign='left';ctx.fillStyle=chg>=0?'#79d7a7':'#ef7e86';ctx.font='bold 12px sans-serif';ctx.fillText(`${chg>=0?'+':''}${chg.toFixed(2)}%`,L,T+13);
}
function drawCompanyTargetChart(){
  const canvas=document.getElementById('companyTargetChart');if(!canvas)return;
  const MAX_SLOTS=60;
  const liveCompany=state.companyAnalysis?.company;
  const companyId=Number(liveCompany?.id||state.companyAnalysisId||0);
  const rawHistory=[...(state.companyAnalysis?.history||[])].sort((a,b)=>Number(a.cycle_no)-Number(b.cycle_no)).slice(-MAX_SLOTS);
  let rows=companyMarketAdjustedCandles(rawHistory,liveCompany);
  if(!rows.length){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#7b899c';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('공용 주가 데이터가 쌓이는 중입니다.',Math.max(180,canvas.clientWidth/2),160);return;}
  const newest=Number(rows[rows.length-1]?.cycle_no||0);
  if(companyChartSeriesCache.id!==companyId){companyChartSeriesCache={id:companyId,lastCycle:newest,rows,panStartedAt:0};}
  else if(newest!==companyChartSeriesCache.lastCycle){companyChartSeriesCache={id:companyId,lastCycle:newest,rows,panStartedAt:performance.now()};}
  else{companyChartSeriesCache.rows=rows;}
  rows=companyChartSeriesCache.rows.slice(-MAX_SLOTS);

  const dpr=window.devicePixelRatio||1,W=Math.max(420,canvas.clientWidth||650),H=340;
  if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr)}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const actualLo=Math.min(...rows.map(r=>r._l)),actualHi=Math.max(...rows.map(r=>r._h)),center=(actualHi+actualLo)/2||1;
  const profile=companyMarketVolatilityProfile(liveCompany||{});
  const naturalSpan=Math.max(1,actualHi-actualLo);
  const minSpan=Math.max(1,center*profile.axisRange);
  const span=Math.max(naturalSpan*1.18,minSpan);
  const mid=(actualHi+actualLo)/2;
  const targetLo=Math.max(.01,mid-span/2),targetHi=mid+span/2;
  if(companyChartAxisCache.id!==companyId||!(companyChartAxisCache.hi>companyChartAxisCache.lo))companyChartAxisCache={id:companyId,lo:targetLo,hi:targetHi};
  else{
    const oldSpan=Math.max(1,companyChartAxisCache.hi-companyChartAxisCache.lo),newSpan=targetHi-targetLo;
    const shift=Math.abs((companyChartAxisCache.hi+companyChartAxisCache.lo)/2-mid)/Math.max(1,mid);
    const spanDiff=Math.abs(newSpan-oldSpan)/oldSpan;
    if(shift>.018||spanDiff>.16||actualHi>companyChartAxisCache.hi||actualLo<companyChartAxisCache.lo){
      companyChartAxisCache.lo=companyChartAxisCache.lo*.65+targetLo*.35;
      companyChartAxisCache.hi=companyChartAxisCache.hi*.65+targetHi*.35;
      if(actualHi>companyChartAxisCache.hi)companyChartAxisCache.hi=actualHi+span*.06;
      if(actualLo<companyChartAxisCache.lo)companyChartAxisCache.lo=Math.max(.01,actualLo-span*.06);
    }
  }
  const lo=companyChartAxisCache.lo,hi=companyChartAxisCache.hi;
  const L=76,R=82,T=22,B=54,volH=46,priceH=H-T-B-volH,pw=W-L-R,step=pw/MAX_SLOTS,bw=Math.max(4,Math.min(9,step*.62));
  let pan=0;
  if(companyChartSeriesCache.panStartedAt){const progress=Math.min(1,(performance.now()-companyChartSeriesCache.panStartedAt)/520);pan=1-(1-Math.pow(1-progress,3));pan=1-pan;if(progress<1)requestAnimationFrame(drawCompanyTargetChart);else companyChartSeriesCache.panStartedAt=0;}
  const startSlot=Math.max(0,MAX_SLOTS-rows.length),x=i=>L+(startSlot+i+pan)*step+step/2,y=v=>T+(hi-v)/(hi-lo)*priceH;
  ctx.strokeStyle='#273242';ctx.fillStyle='#718095';ctx.font='10px sans-serif';ctx.textAlign='right';
  for(let i=0;i<5;i++){const yy=T+priceH*i/4;ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(W-R,yy);ctx.stroke();const val=hi-(hi-lo)*i/4;ctx.fillText(nf.format(Math.round(val)),L-8,yy+3)}
  const maxVol=Math.max(1,...rows.map(r=>r._v),1);
  rows.forEach((r,i)=>{const xx=x(i);if(xx<L-step||xx>W-R+step)return;const up=r._c>=r._o,vc=(Math.min(r._v,maxVol)/maxVol)*volH;ctx.fillStyle=up?'rgba(230,107,112,.22)':'rgba(102,141,232,.22)';ctx.fillRect(xx-bw/2,T+priceH+volH-vc,bw,vc);ctx.strokeStyle=up?'#e66b70':'#668de8';ctx.fillStyle=up?'#e66b70':'#668de8';ctx.beginPath();ctx.moveTo(xx,y(r._h));ctx.lineTo(xx,y(r._l));ctx.stroke();const top=Math.min(y(r._o),y(r._c)),height=Math.max(1.5,Math.abs(y(r._o)-y(r._c)));ctx.fillRect(xx-bw/2,top,bw,height)});
  const last=rows[rows.length-1],lastY=Math.max(T,Math.min(T+priceH,y(last._c)));ctx.save();ctx.setLineDash([5,4]);ctx.strokeStyle='#d7bd72';ctx.beginPath();ctx.moveTo(L,lastY);ctx.lineTo(W-R,lastY);ctx.stroke();ctx.restore();ctx.fillStyle='#d7bd72';ctx.textAlign='left';ctx.font='bold 10px sans-serif';ctx.fillText(nf.format(Math.round(last._c)),W-R+6,lastY+3);
  ctx.fillStyle='#7b899c';ctx.textAlign='center';const marks=[0,Math.floor((rows.length-1)/2),rows.length-1];marks.forEach((i,idx)=>{const r=rows[i];if(r)ctx.fillText(idx===2?'현재':idx===0?`T-${rows.length-1}`:`T-${rows.length-1-i}`,x(i),H-10)});
  const first=rows[0]._c,chg=first?((last._c-first)/first)*100:0;ctx.textAlign='left';ctx.fillStyle=chg>=0?'#e66b70':'#668de8';ctx.font='bold 12px sans-serif';ctx.fillText(`구간 ${chg>=0?'+':''}${chg.toFixed(2)}%`,L,T+12);
}
function renderTerminal(preserve=false){
  const uiCtx=preserve?captureUiState():null;
  rememberCompanyDraft();
  const s=selected();if(!s)return;
  const ch=changeOf(s);
  const content=state.tab==='company'?renderCompanyRoom()
    :state.tab==='market'?renderMarket(s,ch)
    :state.tab==='portfolio'?renderPortfolio()
    :state.tab==='orders'?renderOrders()
    :state.tab==='news'?renderNews()
    :state.tab==='strategy'?renderStrategyRoom()
    :state.tab==='learn'?renderInvestmentGuide()
    :state.tab==='bank'?renderBank()
    :renderRanking();
  const my=state.company?.my_company;
  const legalCash=my?formatKrwSmart(my.cash):'설립 전';
  const companyValue=my?formatKrwSmart(my.valuation):'설립 전';

  app.innerHTML=`<div class="terminal management-first-terminal">
    <header class="top management-topbar">
      <div class="brand"><div class="kxlogo">KX</div><strong>KX CORPORATE</strong><span class="online-mode-chip ${state.companyAvailable===false?'offline':'online'}">${state.companyAvailable===false?'ONLINE 연결 필요':'ONLINE · LIVE 6.6.2'}</span></div>
      ${topNav()}
      <div class="market-status corporate-cycle-status"><b data-live-company-cycle>경영주기 #${liveCompanyClock().cycle}</b><span data-live-game-clock>DAY ${liveCompanyClock().day} · ${gameTime(liveCompanyClock().minute)}</span><em>24분 = 1 DAY</em></div>
      <div class="header-money company-header-money"><div class="asset cash"><small>법인 현금</small><b>${legalCash}</b></div><div class="asset"><small>회사 가치</small><b>${companyValue}</b></div></div>
<button class="tutorial-btn" id="tutorialBtn">튜토리얼</button><button class="logout" id="logout">로그아웃</button>
    </header>
    <div class="mobile-account-bar"><span>법인 현금 <b>${legalCash}</b></span><span>회사 가치 <b>${companyValue}</b></span></div>
    ${content}
    ${state.tab==='company'?renderCompanyKickoffModal():''}
    <nav class="mobile-nav management-mobile-nav">
      <button data-main-tab="company" data-company-section-nav="dashboard" class="${state.tab==='company'&&state.companySection==='dashboard'?'on':''}">경영</button>
      <button data-main-tab="company" data-company-section-nav="operations" class="${state.tab==='company'&&state.companySection==='operations'?'on':''}">사업</button>
      <button data-main-tab="company" data-company-section-nav="people" class="${state.tab==='company'&&state.companySection==='people'?'on':''}">조직</button>
      <button data-main-tab="company" data-company-section-nav="competition" class="${state.tab==='company'&&state.companySection==='competition'?'on':''}">경쟁</button>
      <button data-main-tab="company" data-company-section-nav="risk" class="${state.tab==='company'&&state.companySection==='risk'?'on':''}">리스크</button>
      <button data-main-tab="ranking" class="${state.tab==='ranking'?'on':''}">순위</button>
    </nav>
  </div>`;
  bind();
  if(state.tab==='market')drawChart();
  if(state.tab==='company'){requestAnimationFrame(()=>{drawCompanyGrowthChart();drawCompanyTargetChart();});}
  scheduleCompanyVisualTicker();
  if(preserve)restoreUiState(uiCtx);
}

function rememberOrderInputs(){
  const qty=document.getElementById('qty');
  const price=document.getElementById('price');
  const tif=document.getElementById('tif');
  const otype=document.getElementById('otype');
  if(qty)state.orderQty=Math.max(1,Math.floor(Number(qty.value)||1));
  if(price)state.orderPrice=Math.max(1,Number(price.value)||1);
  if(tif)state.tif=tif.value;
  if(otype)state.type=otype.value;
}
function estimatedOrder(s,type,side,qty,limitPrice){
  qty=Math.max(1,Math.floor(Number(qty)||1));
  if(type==='LIMIT'){
    const px=Math.max(1,Number(limitPrice)||Number(s.last_price)||1);
    return {amount:px*qty,avg:px,filledEstimate:qty,note:'지정가 기준 주문금액'};
  }
  const wantSide=side==='BUY'?'ASK':'BID';
  const levels=state.depth.filter(d=>d.side===wantSide&&Number(d.quantity)>0).sort((a,b)=>side==='BUY'?Number(a.price)-Number(b.price):Number(b.price)-Number(a.price));
  let remain=qty,amount=0,filled=0;
  for(const d of levels){const take=Math.min(remain,Number(d.quantity)||0);if(take<=0)continue;amount+=take*Number(d.price);filled+=take;remain-=take;if(remain<=0)break;}
  if(filled<=0){const px=Number(s.last_price)||1;return {amount:px*qty,avg:px,filledEstimate:0,note:'현재가 기준 단순 예상'};}
  const avg=amount/filled;
  if(remain>0)amount+=remain*avg;
  return {amount,avg,filledEstimate:filled,note:remain>0?'현재 표시 호가 + 잔여 수량 추정':'현재 호가 기준 예상'};
}
function closeOrderConfirm(){document.getElementById('kxOrderConfirm')?.remove();state.pendingOrder=null;}
function showOrderConfirm(body){
  const s=selected();if(!s)return;
  const est=estimatedOrder(s,body.p_order_type,body.p_side,body.p_quantity,body.p_limit_price);
  state.pendingOrder=body;
  document.getElementById('kxOrderConfirm')?.remove();
  const el=document.createElement('div');el.id='kxOrderConfirm';el.className='order-confirm-backdrop';
  const buy=body.p_side==='BUY';
  el.innerHTML=`<section class="order-confirm-card" role="dialog" aria-modal="true" aria-label="주문 최종 확인">
    <div class="confirm-kicker">ORDER CONFIRMATION</div><h2>${buy?'매수':'매도'} 주문을 확인해 주세요</h2>
    <div class="confirm-stock"><span>${escapeHtml(s.name)} <small>${s.ticker}</small></span><b>${nf.format(s.last_price)}원</b></div>
    ${(()=>{const m=positionMetrics(s,body.p_quantity,est.avg);return `<dl class="confirm-grid"><div><dt>주문 방식</dt><dd>${body.p_order_type==='MARKET'?'시장가':'지정가'}</dd></div><div><dt>수량</dt><dd>${nf.format(body.p_quantity)}주</dd></div>${body.p_order_type==='LIMIT'?`<div><dt>지정 가격</dt><dd>${nf.format(body.p_limit_price)}원</dd></div>`:`<div><dt>예상 평균가</dt><dd>약 ${nf.format(est.avg)}원</dd></div>`}${!buy?`<div><dt>보유 수량</dt><dd>${nf.format(m.held)}주</dd></div><div><dt>평균 매입가</dt><dd>${nf.format(m.avg)}원</dd></div><div><dt>예상 실현손익</dt><dd class="${m.realizedPnl>=0?'up':'down'}">${m.realizedPnl>=0?'+':''}${won(m.realizedPnl)} (${pct(m.realizedReturn)})</dd></div><div><dt>체결 후 예상 보유</dt><dd>${nf.format(m.remaining)}주</dd></div>`:''}<div class="wide"><dt>${buy?'예상 출금액':'예상 거래금액'}</dt><dd class="confirm-amount">약 ${won(est.amount)}</dd></div></dl>`})()}
    <p class="confirm-note">${escapeHtml(est.note)}${body.p_order_type==='MARKET'?'입니다. 시장가 주문은 주문 순간 호가 변화와 여러 가격대 체결 때문에 실제 금액이 달라질 수 있습니다.':''}</p>
    <div class="confirm-risk"><b>원금손실 가능</b><span>주식은 예금이 아닙니다. 매수 후 가격이 하락하면 투자원금보다 평가금액이 작아질 수 있습니다.</span></div>
    <div class="confirm-actions"><button id="cancelConfirm">돌아가기</button><button id="finalConfirm" class="${buy?'buy':'sell'}">${buy?'매수':'매도'} 최종 주문</button></div>
  </section>`;
  document.body.appendChild(el);
  el.querySelector('#cancelConfirm').onclick=closeOrderConfirm;
  el.onclick=e=>{if(e.target===el)closeOrderConfirm()};
  el.querySelector('#finalConfirm').onclick=executePendingOrder;
}
async function executePendingOrder(){
  const body=state.pendingOrder;if(!body)return;
  const btn=document.getElementById('finalConfirm');if(btn)btn.disabled=true;
  const msg=document.getElementById('orderMsg');
  try{
    const d=await rpc('kx_place_order',body);const o=Array.isArray(d)?d[0]:d;
    const s=selected();
    recordOrderMeta(body,o,s);
    closeOrderConfirm();
    if(msg)msg.textContent=o?.status==='FILLED'?`전량 체결 · 평균 ${won(o.avg_fill_price)}`:`주문 접수 · ${ORDER_STATUS[o?.status]||o?.status||''}`;
    await sync(false,false,true);
  }catch(e){if(btn)btn.disabled=false;const note=document.querySelector('.confirm-note');if(note)note.textContent='주문 실패: '+e.message;else if(msg)msg.textContent=e.message;}
}

function bind(){
  document.getElementById('logout').onclick=logout;
  const tb=document.getElementById('tutorialBtn');if(tb)tb.onclick=()=>openTutorial(0);
  bindCompanyMoneyInputs();

  document.querySelectorAll('[data-main-tab]').forEach(b=>b.onclick=()=>{
    rememberOrderInputs();
    const next=b.dataset.mainTab;
    state.tab=next;
    if(next==='company'&&b.dataset.companySectionNav){
      state.companySection=b.dataset.companySectionNav;
      if(state.companySection==='dashboard')state.companyDashTab='today';
      if(state.companySection==='operations')state.companyOpsTab='products';
      if(state.companySection==='people')state.companyPeopleTab='talent';
      if(state.companySection==='competition')state.companyCompetitionTab='companies';
      if(state.companySection==='risk')state.companyRiskTab='news';
    }
    if(next==='news')markNewsViewed();
    renderTerminal(true);
    (async()=>{
      try{
        if(next==='news'||next==='ranking')await loadPublicSnapshot(true,false);
        if(next==='company')await loadCompanyLayer(true,false);
      }catch(e){console.error('navigation refresh failed:',e)}
      if(state.tab===next)renderTerminal(true);
    })();
  });

  document.querySelectorAll('[data-market-filter]').forEach(b=>b.onclick=()=>{
    rememberOrderInputs();
    state.marketFilter=b.dataset.marketFilter||'ALL';
    const pool=state.stocks.filter(stockVisible).filter(stockMatchesMarketFilter);
    if(pool.length&&!pool.some(x=>x.ticker===state.ticker)){state.ticker=pool[0].ticker;state.orderPrice=null;}
    renderTerminal();
  });
  document.querySelectorAll('[data-stock-favorite]').forEach(b=>b.onclick=e=>{e.preventDefault();e.stopPropagation();const on=toggleStockFavorite(b.dataset.stockFavorite);state.companyNotice=on?'즐겨찾기에 추가했습니다. 해당 종목은 목록 최상단에 고정됩니다.':'즐겨찾기에서 해제했습니다.';renderTerminal(true);});
  document.querySelectorAll('[data-ticker]').forEach(b=>b.onclick=async()=>{rememberOrderInputs();state.ticker=b.dataset.ticker;state.orderPrice=null;await loadPublicSnapshot(false,false);renderTerminal();});
  const ss=document.getElementById('stockSelect');if(ss)ss.onchange=async()=>{rememberOrderInputs();state.ticker=ss.value;state.orderPrice=null;await loadPublicSnapshot(false,false);renderTerminal();};
  document.querySelectorAll('[data-trade-tab]').forEach(b=>b.onclick=()=>{rememberOrderInputs();state.tradeTab=b.dataset.tradeTab;renderTerminal();});
  document.querySelectorAll('[data-chart-period]').forEach(b=>b.onclick=()=>{state.chartPeriod=b.dataset.chartPeriod||'1M';drawChart();document.querySelectorAll('[data-chart-period]').forEach(x=>x.classList.toggle('on',x===b));});

  document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{
    rememberOrderInputs();state.side=b.dataset.side;renderTerminal();
  });

  const ot=document.getElementById('otype');
  if(ot){
    ot.onchange=()=>{
      state.type=ot.value;
      const pw=document.getElementById('priceWrap');
      if(pw)pw.style.display=state.type==='MARKET'?'none':'grid';
      const oh=document.getElementById('orderHelp');if(oh)oh.textContent=state.type==='MARKET'?'시장가: 현재 가장 유리한 호가부터 즉시 체결됩니다. 수량이 크면 여러 가격에 나뉘어 체결될 수 있습니다.':'지정가: 내가 정한 가격 이하(매수) 또는 이상(매도)에서만 체결됩니다.';
      updateOrderPreview();
    };
    ot.onchange();
  }
  const qty=document.getElementById('qty');if(qty){qty.oninput=()=>{state.orderQty=Math.max(1,Math.floor(Number(qty.value)||1));updateOrderPreview()};qty.onchange=qty.oninput;}
  const price=document.getElementById('price');if(price){price.oninput=()=>{state.orderPrice=Math.max(1,Number(price.value)||1);updateOrderPreview()};price.onchange=price.oninput;}
  const tif=document.getElementById('tif');
  if(tif)tif.onchange=e=>state.tif=e.target.value;
  const submit=document.getElementById('submitOrder');
  if(submit)submit.onclick=placeOrder;

  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancel));

  const companyForm=document.getElementById('companyCreateForm');
  if(companyForm){
    const nameInput=document.getElementById('companyName'),sectorInput=document.getElementById('companySector');
    if(nameInput)nameInput.oninput=()=>{state.companyDraft.name=nameInput.value};
    if(sectorInput)sectorInput.onchange=()=>{state.companyDraft.sector=sectorInput.value};
    companyForm.onsubmit=async e=>{
      e.preventDefault();
      rememberCompanyDraft();
      const msg=document.getElementById('companyCreateMsg'),btn=companyForm.querySelector('button[type="submit"]');
      const name=(state.companyDraft.name||'').trim();
      const sector=state.companyDraft.sector||'기술·서비스';
      if(btn)btn.disabled=true;
      try{
        const d=await companyApi('CREATE',{p_name:name,p_sector:sector});
        if(d?.ok===false)throw new Error(d.message||'회사 설립에 실패했습니다.');
        state.companyDraft={name:'',sector:'AI·반도체'};
        state.companyNotice=d?.message||'회사 설립이 완료되었습니다.';
        await loadCompanyLayer(true,true);renderTerminal();
      }catch(err){if(msg)msg.textContent=err.message;if(btn)btn.disabled=false}
    };
  }

  document.querySelectorAll('[data-open-defense-overview]').forEach(b=>b.onclick=(e)=>{
    e?.preventDefault?.();e?.stopPropagation?.();
    openTakeoverDefenseOverview();
  });

  document.querySelectorAll('[data-company-section],[data-company-section-jump]').forEach(b=>b.onclick=(e)=>{
    e?.preventDefault?.();e?.stopPropagation?.();
    const nextSection=b.dataset.companySection||b.dataset.companySectionJump||'dashboard';
    state.companySection=nextSection;state.tab='company';
    if(nextSection==='dashboard')state.companyDashTab='today';
    else if(nextSection==='operations')state.companyOpsTab='products';
    else if(nextSection==='people')state.companyPeopleTab='talent';
    else if(nextSection==='competition')state.companyCompetitionTab='companies';
    else if(nextSection==='risk')state.companyRiskTab='news';
    renderTerminal(true);
  });
  document.querySelectorAll('[data-company-route]').forEach(b=>b.onclick=(e)=>{
    e?.preventDefault?.();e?.stopPropagation?.();
    const [section,tab]=(b.dataset.companyRoute||'dashboard:today').split(':');
    state.tab='company';state.companySection=section||'dashboard';
    if(section==='dashboard')state.companyDashTab=tab||'today';
    else if(section==='operations')state.companyOpsTab=tab||'products';
    else if(section==='people')state.companyPeopleTab=tab||'talent';
    else if(section==='competition')state.companyCompetitionTab=tab||'companies';
    else if(section==='risk')state.companyRiskTab=tab||'news';
    renderTerminal(true);
  });
  document.querySelectorAll('[data-company-workspace-tab]').forEach(b=>b.onclick=(e)=>{
    e?.preventDefault?.();e?.stopPropagation?.();
    const [section,tab]=(b.dataset.companyWorkspaceTab||'dashboard:today').split(':');
    state.companySection=section||state.companySection;state.tab='company';
    if(section==='dashboard')state.companyDashTab=tab||'today';
    else if(section==='people')state.companyPeopleTab=tab||'talent';
    else if(section==='competition')state.companyCompetitionTab=tab||'companies';
    else if(section==='risk')state.companyRiskTab=tab||'news';
    renderTerminal(true);
  });
  document.querySelectorAll('[data-guide-mode]').forEach(b=>b.onclick=()=>{
    setGuidanceMode(b.dataset.guideMode||'BEGINNER');state.companyNotice=`플레이 도움 모드를 ${guidanceInfo().label}(으)로 변경했습니다.`;playCompanySfx('click');renderTerminal(true);
  });
  document.querySelectorAll('[data-creator-hud-toggle]').forEach(b=>b.onclick=()=>{const on=toggleCreatorHud();state.companyNotice=on?'방송 HUD를 켰습니다. 영상 녹화 시 핵심 숫자가 화면에 고정됩니다.':'방송 HUD를 껐습니다.';playCompanySfx('click');renderTerminal(true);});
  document.querySelectorAll('[data-company-sound-toggle]').forEach(b=>b.onclick=()=>{const on=toggleCompanySound();state.companyNotice=on?'경영 효과음을 켰습니다.':'경영 효과음을 껐습니다.';renderTerminal(true);});
  document.querySelectorAll('[data-copy-season-summary]').forEach(b=>b.onclick=()=>copyCompanyCreatorSummary());
  document.querySelectorAll('[data-board-choice]').forEach(b=>b.onclick=()=>resolveCompanyBoardChoice(Number(b.dataset.boardChoice)||0));
  document.querySelectorAll('[data-budget-preset]').forEach(b=>b.onclick=()=>{
    const my=state.company?.my_company,input=document.getElementById('companyActionAmount');if(!my||!input)return;
    const ratio=Math.max(0,Number(b.dataset.budgetPreset)||0),amount=Math.max(1000000,Math.floor(Number(my.cash||0)*ratio));input.value=formatKrwSmart(amount);input.dispatchEvent(new Event('input',{bubbles:true}));
  });

  document.querySelectorAll('[data-company-region]').forEach(b=>b.onclick=()=>{
    state.companyRegion=b.dataset.companyRegion||'국내';state.companySearch='';state.companyAnalysisId=null;state.companyAnalysis=null;companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};renderTerminal();
  });
  const companySearchForm=document.getElementById('companySearchForm');
  if(companySearchForm)companySearchForm.onsubmit=e=>{e.preventDefault();state.companySearch=String(document.getElementById('companySearchInput')?.value||'').trim();state.companyAnalysisId=null;state.companyAnalysis=null;companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};renderTerminal();const first=document.querySelector('[data-company-analyze]');if(first)first.click();};
  const companySearchClear=document.getElementById('companySearchClear');
  if(companySearchClear)companySearchClear.onclick=()=>{state.companySearch='';state.companyAnalysisId=null;state.companyAnalysis=null;companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};renderTerminal();};

  const companyRun=async(name,body,question)=>{
    if(question&&!confirm(question))return;
    const msg=document.getElementById('companyMsg');
    const route={
      kx_company_action:'MANAGE',kx_company_defense:'DEFENSE',kx_company_expand:'EXPAND',
      kx_company_buy_shares:'BUY_SHARES',kx_company_tender_offer:'TENDER',kx_company_sell_shares:'SELL_SHARES',
      kx_company_trade_market:'TRADE_MARKET',kx_company_media_v52:'MEDIA',kx_company_tax:'TAX'
    }[name]||name;
    let pending=null;
    try{
      const myBefore=state.company?.my_company,companyId=String(myBefore?.id||'guest'),beforeRawCash=Math.max(0,Number(myBefore?._raw_server_cash??myBefore?.cash??0));
      if(route==='TRADE_MARKET'){
        const ticker=String(body?.p_ticker||''),side=String(body?.p_side||'BUY').toUpperCase(),amount=Math.max(0,Number(body?.p_amount||0)),st=(state.stocks||[]).find(x=>x.ticker===ticker),px=Math.max(1,Number(st?.last_price||0));
        const h=(state.company?.market_holdings||[]).find(x=>x.ticker===ticker),displayShares=Math.max(0,Number(h?.shares||0)),beforeRawShares=Math.max(0,Number(h?._raw_server_shares??h?.shares??0));
        const qty=side==='BUY'?amount/px:Math.min(displayShares,amount/px),desiredShareDelta=side==='BUY'?qty:-qty,desiredCashDelta=side==='BUY'?-amount:qty*px;
        pending={type:'MARKET_TRADE',assetType:'MARKET',companyId,beforeRawCash,desiredCashDelta,ticker,beforeRawShares,desiredShareDelta,createdAt:Date.now()};
      }else if(route==='SELL_SHARES'){
        const targetId=Number(body?.p_target_company_id||0),h=(state.company?.my_holdings||[]).find(x=>Number(x.target_company_id)===targetId);if(!h)throw new Error('매각할 보유지분을 찾지 못했습니다.');
        const value=Math.min(Math.max(0,Number(body?.p_amount||0)),Math.max(0,Number(h.market_value||0))),displayStake=Math.max(0,Number(h.stake||0)),cut=displayStake*(value/Math.max(1,Number(h.market_value||0))),beforeRawStake=Math.max(0,Number(h?._raw_server_stake??h?.stake??0));
        pending={type:'COMPANY_STAKE_SELL',assetType:'COMPANY',companyId,beforeRawCash,desiredCashDelta:value,targetCompanyId:targetId,beforeRawStake,desiredStakeDelta:-cut,createdAt:Date.now()};
      }
      const d=await companyApi(route,body||{});
      if(d?.ok!==false&&pending)pendingEconomicTxn=pending;
      if(d?.ok===false)throw new Error(d.message||'경영 결정을 처리하지 못했습니다.');
      state.companyNotice=d?.message||'경영 결정이 온라인 회사 데이터에 반영되었습니다.';
      const projectActions=['RND','QUALITY','CAPEX','HIRING','MARKETING','WELFARE','COMPLIANCE'];
      const kind=route==='MANAGE'?(projectActions.includes(String(body?.p_action||''))?'projects':null):route==='MEDIA'?'media':['BUY_SHARES','TENDER'].includes(route)?'acquisitions':route==='EXPAND'?'expansions':route==='TAX'?'tax':route==='DEFENSE'?'defenses':route==='TRADE_MARKET'?'trades':route==='PROJECT_DECISION'?'decisions':null;
      if(['MANAGE','MEDIA','BUY_SHARES','TENDER','EXPAND','TAX','DEFENSE','TRADE_MARKET','PROJECT_DECISION'].includes(route))recordCompanyGameAction(kind,body?.p_action||route);
      if(!(route==='MANAGE'&&projectActions.includes(String(body?.p_action||''))))playCompanySfx(route==='MEDIA'?'news':route==='DEFENSE'?'alert':'success');
      await loadCompanyLayer(false,false);
      renderTerminal(true);
      return d;
    }catch(err){
      const sellFallback=pending&&((route==='TRADE_MARKET'&&String(body?.p_side||'').toUpperCase()==='SELL')||route==='SELL_SHARES');
      if(sellFallback&&commitEconomicFallback(pending)){
        state.companyNotice=route==='SELL_SHARES'?'서버 매각 처리 오류를 우회해 보유지분 매각을 정상 반영했습니다. 매각대금은 법인현금에 더해졌습니다.':'서버 매도 처리 오류를 우회해 보유 주식 매도를 정상 반영했습니다. 매도대금은 법인현금에 더해졌습니다.';
        recordCompanyGameAction('trades',route);playCompanySfx('success');renderTerminal(true);return {ok:true,local_fallback:true,message:state.companyNotice};
      }
      state.companyNotice='처리 실패: '+err.message;registerCompanyFailure(err.message||'경영 결정 실패');
      if(msg)msg.textContent=state.companyNotice;else alert(state.companyNotice);
    }
  };

  const companyRealismRun=async(action,body,question)=>{
    if(question&&!confirm(question))return null;
    try{
      const d=await companyRealismApi(action,body||{});if(d?.ok===false)throw new Error(d.message||'현실경영 결정을 처리하지 못했습니다.');
      state.companyNotice=d?.message||'경영 결정이 제품·재무 데이터에 반영되었습니다.';playCompanySfx('success');
      await loadCompanyLayer(false,false);renderTerminal(true);return d;
    }catch(err){state.companyNotice='처리 실패: '+err.message;const msg=document.getElementById('companyMsg');if(msg)msg.textContent=state.companyNotice;else alert(state.companyNotice);return null;}
  };


  document.querySelectorAll('[data-chairman-reject]').forEach(b=>b.onclick=()=>{markChairmanHandled(String(b.dataset.chairmanReject||''),24);state.companyNotice='안건을 이번 회차에서 보류했습니다. 상황이 계속되면 직원이 다시 상신할 수 있습니다.';renderTerminal(true)});
  document.querySelectorAll('[data-chairman-approve]').forEach(b=>b.onclick=async()=>{
    const id=String(b.dataset.chairmanApprove||''),p=buildChairmanProposals(state.company?.my_company).find(x=>x.id===id);if(!p)return;
    const cap=chairmanAutopilotCap(p,state.company?.my_company);
    if(!confirm(`${p.title}
권고 예산: ${formatKrwSmart(p.budget||0)}
AI 자동집행 최대 한도: ${formatKrwSmart(cap)}

한 번 승인하면 AI 경영진이 이 한도 안에서 필요한 후속 조치를 반복 실행하고, 목표가 달성되거나 한도에 도달하면 자동으로 멈춥니다. 승인할까요?`))return;
    const progress=showCompanyAutopilotProgress(p.title,'승인 완료 · AI 경영진이 최적 실행 순서를 계산합니다.');
    try{b.disabled=true;b.textContent='AI 자동집행 중…';const result=await runChairmanAutopilot(p,progress);markChairmanHandled(id,p.kind.startsWith('DEFENSE')?10:36);state.companyNotice=result?.message||'AI 자동집행이 완료되었습니다.';playCompanySfx('success');progress.close(state.companyNotice);await loadCompanyLayer(false,true);renderTerminal(true);}catch(err){state.companyNotice='AI 자동집행 실패: '+(err?.message||String(err));progress.close(state.companyNotice);alert(state.companyNotice);renderTerminal(true);}
  });
  document.querySelectorAll('[data-chairman-dept-incentive]').forEach(b=>b.onclick=async()=>{
    const dept=String(b.dataset.chairmanDeptIncentive||''),amount=Math.max(5000000,parseCompanyMoney(document.getElementById(`chairmanDeptBonus_${dept}`)?.value,30000000));
    if(!confirm(`${talentDepartmentShort(dept)}에 ${formatKrwSmart(amount)}의 성과 인센티브를 지급할까요?\n법인현금이 지출되고 부서 인재의 충성도·성장·자동운영 효율이 올라갑니다.`))return;
    try{b.disabled=true;const d=await companyIncentiveV650('DEPARTMENT',dept,amount);if(!d?.ok)throw new Error(d?.message||'인센티브 지급 실패');state.companyNotice=d.message;playCompanySfx('success');await loadCompanyLayer(false,true);renderTerminal(true)}catch(err){alert('인센티브 지급 실패: '+err.message);renderTerminal(true)}
  });
  document.querySelectorAll('[data-chairman-talent-incentive]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.chairmanTalentIncentive||0),t=(state.company?.talents||[]).find(x=>Number(x.id)===id),amount=Math.max(1000000,parseCompanyMoney(document.getElementById(`chairmanTalentBonus_${id}`)?.value,10000000));if(!t)return;
    if(!confirm(`${t.name}에게 ${formatKrwSmart(amount)}의 개인 인센티브를 지급할까요?`))return;
    try{b.disabled=true;const d=await companyIncentiveV650('TALENT',String(id),amount);if(!d?.ok)throw new Error(d?.message||'개인 인센티브 지급 실패');state.companyNotice=d.message;playCompanySfx('success');await loadCompanyLayer(false,true);renderTerminal(true)}catch(err){alert('개인 인센티브 지급 실패: '+err.message);renderTerminal(true)}
  });
  document.querySelectorAll('[data-chairman-direct-defense]').forEach(b=>b.onclick=async()=>{
    const my=state.company?.my_company;if(!my)return;const budget=Math.max(takeoverDefenseMinimum(my),Math.min(Number(my.cash||0)*.12,Number(my.valuation||0)*.006));if(!confirm(`재무팀에 ${formatKrwSmart(budget)} 한도로 긴급 자사주 매입 방어를 지시할까요?\n승인하면 해당 금액은 법인현금에서 지출됩니다.\n예상 잔액 ${formatKrwSmart(Math.max(0,Number(my.cash||0)-budget))}`))return;
    try{b.disabled=true;const d=await companyDefenseV640('BUYBACK',budget);if(!d?.ok)throw new Error(d?.message||'방어 지시 실패');state.companyNotice=d.message||'긴급 방어 지시가 실행되었습니다.';playCompanySfx('alert');await loadCompanyLayer(false,true);renderTerminal(true)}catch(err){alert('방어 지시 실패: '+err.message);renderTerminal(true)}
  });

  document.querySelectorAll('[data-product-develop]').forEach(b=>b.onclick=()=>{
    const name=String(document.getElementById('newProductName')?.value||'').trim(),type=String(document.getElementById('newProductType')?.value||'').trim();
    const price=Math.max(100,parseCompanyMoney(document.getElementById('newProductPrice')?.value,0)),budget=Math.max(10000000,parseCompanyMoney(document.getElementById('newProductBudget')?.value,100000000)),capacity=Math.max(.01,Number(document.getElementById('newProductCapacity')?.value)||1);
    companyRealismRun('DEVELOP_PRODUCT',{p_name:name,p_type:type,p_target_price:price,p_budget:budget,p_capacity:capacity},`${name||'신제품'} 개발에 ${formatKrwSmart(budget)}을 집행할까요? 개발비는 원금 회수형 투자가 아니라 실제 비용이며, 개발 완료 뒤 출시 승인이 필요합니다.`);
  });
  document.querySelectorAll('[data-product-launch]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.productLaunch),p=(state.company?.products||[]).find(x=>Number(x.id)===id);companyRealismRun('LAUNCH_PRODUCT',{p_product_id:id},`${p?.name||'제품'} 출시를 승인할까요? 출시 후 가격·수요·생산·재고에 따라 실제 매출과 원가가 발생합니다.`)});
  document.querySelectorAll('[data-product-price]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.productPrice),price=Math.max(100,parseCompanyMoney(document.getElementById(`productPrice_${id}`)?.value,0));companyRealismRun('SET_PRODUCT_PRICE',{p_product_id:id,p_price:price},`판매가격을 ${formatKrwSmart(price)}으로 변경할까요? 가격을 올리면 단위마진은 커질 수 있지만 수요가 감소할 수 있습니다.`)});
  document.querySelectorAll('[data-product-capacity]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.productCapacity),budget=Math.max(10000000,parseCompanyMoney(document.getElementById(`productCapacityBudget_${id}`)?.value,50000000));companyRealismRun('EXPAND_PRODUCT_CAPACITY',{p_product_id:id,p_budget:budget},`${formatKrwSmart(budget)}을 설비·생산능력에 투자할까요? 현금은 즉시 지출되고 이후 생산능력에 반영됩니다.`)});
  document.querySelectorAll('[data-product-marketing]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.productMarketing),budget=Math.max(5000000,parseCompanyMoney(document.getElementById(`productMarketingBudget_${id}`)?.value,30000000));companyRealismRun('PRODUCT_MARKETING',{p_product_id:id,p_budget:budget},`${formatKrwSmart(budget)}의 제품 마케팅을 집행할까요? 수요는 증가할 수 있지만 실제 판매는 가격과 경쟁사 대응에도 영향을 받습니다.`)});
  document.querySelectorAll('[data-product-retire]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.productRetire),p=(state.company?.products||[]).find(x=>Number(x.id)===id);companyRealismRun('RETIRE_PRODUCT',{p_product_id:id},`${p?.name||'제품'}을 단종할까요? 남은 재고가 있다면 재고자산은 즉시 사라지지 않습니다.`)});
  document.querySelectorAll('[data-procurement-policy]').forEach(b=>b.onclick=()=>{const policy=b.dataset.procurementPolicy,label={LOW_COST:'저가 단일조달',BALANCED:'균형 조달',PREMIUM:'프리미엄 공급망',DUAL_SOURCE:'이원화 조달'}[policy]||policy;companyRealismRun('PROCUREMENT_POLICY',{p_policy:policy},`조달정책을 '${label}'(으)로 변경할까요? 원가·품질·납기 안정성이 함께 달라집니다.`)});

  document.querySelectorAll('[data-project-decision]').forEach(b=>b.onclick=()=>{
    const projectId=Number(b.dataset.projectDecision),choice=b.dataset.projectChoice||'STEADY';
    const label=choice==='BOOST'?'추가 투자':choice==='SCALE_DOWN'?'범위 축소':'기존 계획 유지';
    companyRun('PROJECT_DECISION',{p_project_id:projectId,p_choice:choice},`${label}로 프로젝트 중간 결정을 확정할까요?`);
  });

  document.querySelectorAll('[data-kickoff-choice]').forEach(b=>b.onclick=()=>chooseProjectKickoffOption(Number(b.dataset.kickoffChoice)||0));
  document.querySelectorAll('[data-kickoff-close]').forEach(b=>b.onclick=()=>closeProjectKickoff());
  document.querySelectorAll('[data-kickoff-retry]').forEach(b=>b.onclick=()=>retryProjectKickoff());
  document.querySelectorAll('[data-kickoff-launch]').forEach(b=>b.onclick=()=>launchProjectFromKickoff(companyRun));

  document.querySelectorAll('[data-company-action]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyAction;
    const amount=Math.max(0,parseCompanyMoney(document.getElementById('companyActionAmount')?.value,0));
    if(isProjectLaunchAction(action)){openProjectKickoff(action);return;}
    const labels={RND:'R&D 투자',QUALITY:'품질·안전 투자',MARKETING:'마케팅 투자',CAPEX:'설비 투자',HIRING:'핵심 인재 채용',WELFARE:'복지·보상 강화',PRICE_WAR:'가격 경쟁',COSTCUT:'비용 구조조정',DIVIDEND:'배당 실시',COMPLIANCE:'준법·감사 투자',LOAN:'기업 대출',REPAY:'부채 상환'};
    const risky=action==='PRICE_WAR'?'가격 경쟁은 점유율을 얻는 대신 이익과 브랜드에 부담이 생깁니다. ':action==='COSTCUT'?'구조조정은 현금을 개선하지만 직원 사기와 평판에 부담이 생깁니다. ':action==='LOAN'?'대출은 현금을 늘리지만 부채와 신용 부담이 커집니다. ':'';
    const cash=Number(state.company?.my_company?.cash||0),ratio=cash>0?amount/cash*100:0,impact=companyImpactMeta(action);const after=['LOAN'].includes(action)?cash+amount:Math.max(0,cash-amount);
    const context=guidanceMode()==='REALISTIC'?'':`\n\n예상 영향: ${impact.slice(0,3).join(' · ')}\n집행 규모: 현재 법인현금의 ${ratio.toFixed(1)}% · 집행 후 단순 현금 ${formatKrwSmart(after)}`;
    companyRun('kx_company_action',{p_action:action,p_amount:amount},`${risky}${labels[action]||'경영 결정'}을 실행할까요?${context}`);
  });

  document.querySelectorAll('[data-company-defense]').forEach(b=>b.onclick=(e)=>{
    e.preventDefault();e.stopPropagation();
    executeTakeoverDefense(b.dataset.companyDefense,b);
  });

  document.querySelectorAll('[data-company-expand]').forEach(b=>b.onclick=()=>{
    const code=b.dataset.companyExpand;
    const amount=Math.max(80000000,parseCompanyMoney(document.getElementById('companyExpansionBudget')?.value,200000000));
    companyRun('kx_company_expand',{p_country_code:code,p_budget:amount},`${formatKrwSmart(amount)}을 투입해 해당 해외시장에 진출/추가투자할까요?`);
  });

  document.querySelectorAll('[data-company-buy]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companyBuy);
    const amount=Math.max(1000000,parseCompanyMoney(document.getElementById(`takeBudget_${id}`)?.value,100000000));
    companyRun('kx_company_buy_shares',{p_target_company_id:id,p_budget:amount},`${formatKrwSmart(amount)} 한도에서 이 회사 지분을 매입할까요? 지분이 50%를 넘으면 자회사로 편입됩니다.`);
  });

  document.querySelectorAll('[data-company-dd]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companyDd||0);
    if(!id)return;
    companyRealismRun('DUE_DILIGENCE',{p_target_company_id:id},'회계·법무·사업·공급망 실사를 의뢰할까요? 실사비는 대상 기업 규모에 따라 산정되며 법인현금에서 지출됩니다.');
  });

  document.querySelectorAll('[data-incident-decision]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.incidentDecision||0),choice=b.dataset.incidentChoice||'CONTROLLED';
    const names={FULL:'전면 대응',CONTROLLED:'제한 대응',DEFER:'대응 유보'};
    companyRealismRun('INCIDENT_DECISION',{p_incident_id:id,p_choice:choice},`${names[choice]||'대응'}으로 결재할까요? 비용 절감과 후속 운영위험이 서로 교환관계에 있습니다.`);
  });

  document.querySelectorAll('[data-company-tender]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companyTender);
    if(!dueDiligenceFor(id)){alert('공개매수 전에 유효한 인수 실사 보고서가 필요합니다. 먼저 인수 실사를 진행해 주세요.');return;}
    const amount=Math.max(50000000,parseCompanyMoney(document.getElementById(`takeBudget_${id}`)?.value,300000000));
    companyRun('kx_company_tender_offer',{p_target_company_id:id,p_budget:amount,p_premium_pct:15},`${formatKrwSmart(amount)} 한도로 공개매수를 시작할까요? 실사 결과를 확인한 뒤 시장가에 15% 프리미엄을 지급합니다. 상대 회사의 경영권 방어 때문에 실제 매입량이 줄 수 있습니다.`);
  });

  document.querySelectorAll('[data-company-sell]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companySell),h=(state.company?.my_holdings||[]).find(x=>Number(x.target_company_id)===id);if(!h){alert('매각할 보유지분을 찾지 못했습니다.');return;}
    const amount=Math.min(Math.max(1000000,parseCompanyMoney(document.getElementById('companyActionAmount')?.value,Math.min(100000000,Number(h.market_value||0)))),Number(h.market_value||0));
    const pct=Number(h.market_value||0)>0?Number(h.stake||0)*(amount/Number(h.market_value||1)):0;
    companyRun('kx_company_sell_shares',{p_target_company_id:id,p_amount:amount},`${h.target_name||'경쟁사'} (${h.target_ticker||'-'}) 지분을 매각합니다.

현재 보유 ${Number(h.stake||0).toFixed(2)}% · 평가액 ${formatKrwSmart(h.market_value||0)}
이번 매각 약 ${pct.toFixed(2)}%p / ${formatKrwSmart(amount)}
매각대금은 법인현금에 +${formatKrwSmart(amount)}로 들어옵니다.

진행할까요?`);
  });

  document.querySelectorAll('[data-company-market-side]').forEach(b=>b.onclick=()=>{
    const ticker=document.getElementById('corpStockTicker')?.value,side=b.dataset.companyMarketSide,st=(state.stocks||[]).find(x=>x.ticker===ticker),h=(state.company?.market_holdings||[]).find(x=>x.ticker===ticker);
    const requested=Math.max(10000,parseCompanyMoney(document.getElementById('corpStockAmount')?.value,50000000));
    if(side==='SELL'&&(!h||Number(h.shares||0)<=0)){state.companyNotice=`${st?.name||ticker}은(는) 현재 법인 포트폴리오에 보유하고 있지 않습니다. 아래 보유종목 카드의 매도 버튼을 이용하세요.`;renderTerminal(true);return;}
    const amount=side==='SELL'?Math.min(requested,Number(h.market_value||0)):requested;
    const cashChange=side==='SELL'?`법인현금 +${formatKrwSmart(amount)}`:`법인현금 -${formatKrwSmart(amount)}`;
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:side,p_amount:amount},`${st?.name||ticker} (${ticker})를 ${side==='BUY'?'매수':'매도'}합니다.
거래금액 ${formatKrwSmart(amount)} · ${cashChange}${side==='SELL'?`
현재 보유 ${nf.format(Number(h.shares||0))}주 · 평가액 ${formatKrwSmart(h.market_value||0)}`:''}

진행할까요?`);
  });


  document.querySelectorAll('[data-company-market-sell-ticker]').forEach(b=>b.onclick=()=>{
    const ticker=String(b.dataset.companyMarketSellTicker||''),ratio=Math.max(.01,Math.min(1,Number(b.dataset.sellRatio||1))),h=(state.company?.market_holdings||[]).find(x=>x.ticker===ticker),st=(state.stocks||[]).find(x=>x.ticker===ticker);if(!h||Number(h.shares||0)<=0){alert('이미 매도되어 보유수량이 없습니다.');return;}
    const amount=Math.max(1,Number(h.market_value||0)*ratio),qty=Number(h.shares||0)*ratio;
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:'SELL',p_amount:amount},`${st?.name||h.name||ticker} (${ticker}) 매도

매도 수량 약 ${nf.format(qty)}주 (${Math.round(ratio*100)}%)
예상 매도대금 ${formatKrwSmart(amount)}
법인현금 +${formatKrwSmart(amount)}

내가 보유한 주식을 파는 것이므로 현금은 증가합니다. 진행할까요?`);
  });

  document.querySelectorAll('[data-company-quick-market-side]').forEach(b=>b.onclick=()=>{
    const ticker=selected()?.ticker,side=b.dataset.companyQuickMarketSide,st=(state.stocks||[]).find(x=>x.ticker===ticker),h=(state.company?.market_holdings||[]).find(x=>x.ticker===ticker);
    const requested=Math.max(1000000,parseCompanyMoney(document.getElementById('quickCorpAmount')?.value,50000000));
    if(side==='SELL'&&(!h||Number(h.shares||0)<=0)){state.companyNotice=`${st?.name||ticker}은(는) 법인 포트폴리오에 보유하고 있지 않아 매도할 수 없습니다.`;renderTerminal(true);return;}
    const amount=side==='SELL'?Math.min(requested,Number(h.market_value||0)):requested;
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:side,p_amount:amount},`${st?.name||ticker} (${ticker}) ${side==='BUY'?'매수':'매도'}

거래금액 ${formatKrwSmart(amount)}
${side==='BUY'?`법인현금 -${formatKrwSmart(amount)}`:`보유 ${nf.format(Number(h.shares||0))}주 · 법인현금 +${formatKrwSmart(amount)}`}

진행할까요?`);
  });

  const focusCompanyAnalysisPanel=()=>requestAnimationFrame(()=>{const el=document.getElementById('companyAnalysisSlot');if(el)el.scrollIntoView({behavior:'smooth',block:'center'});});
  const regionForCompany=c=>{const country=String(c?.home_country||'').toLowerCase();if(/대한민국|한국|korea/.test(country))return '국내';if(/미국|usa|united states|america/.test(country))return '미국';if(/중국|china/.test(country))return '중국';if(/일본|japan/.test(country))return '일본';if(/독일|영국|프랑스|이탈리아|스페인|네덜란드|스웨덴|노르웨이|핀란드|덴마크|germany|united kingdom|france|italy|spain|netherlands|sweden|norway|finland|denmark|europe/.test(country))return '유럽';return state.companyRegion||'국내';};
  const loadCompanyAnalysis=async(id,{fromWar=false}={})=>{
    const c=(state.company?.companies||[]).find(x=>Number(x.id)===Number(id));if(!id||!c){state.companyNotice='선택한 회사를 찾지 못했습니다.';renderTerminal(true);return;}
    state.tab='company';state.companySection='competition';state.companyCompetitionTab='companies';state.companyAnalysisId=id;state.companyAnalysis=null;
    if(fromWar){state.companyRegion=regionForCompany(c);state.companySearch=String(c.name||'');}
    companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};
    state.companyNotice=`${c.name} 기업 분석을 불러오는 중입니다.`;renderTerminal(true);focusCompanyAnalysisPanel();
    const localFallback=()=>{const h=(state.company?.my_holdings||[]).find(x=>Number(x.target_company_id)===id);return alignCompanyProfileToSharedMarket({company:{...c},my_stake:Number(h?.stake??h?.percent??0),press:companyPressFor(id),realism_products:[]});};
    try{
      const profile=await companyApi('PROFILE',{p_company_id:id});if(!profile?.company)throw new Error(profile?.message||'기업 프로필 응답이 비어 있습니다.');
      try{const rp=await companyRealismApi('PROFILE',{p_company_id:id});profile.realism_products=Array.isArray(rp?.products)?rp.products:[]}catch(_realismProfileErr){profile.realism_products=[]}
      if(Number(state.companyAnalysisId)!==id)return;state.companyAnalysis=alignCompanyProfileToSharedMarket(profile);state.companyNotice=`${c.name} 분석을 열었습니다.`;renderTerminal(true);focusCompanyAnalysisPanel();requestAnimationFrame(()=>drawCompanyTargetChart());
    }catch(err){
      if(Number(state.companyAnalysisId)!==id)return;state.companyAnalysis=localFallback();state.companyNotice=`${c.name} 상세 서버 응답이 지연되어 공용 시장 데이터로 먼저 열었습니다.`;renderTerminal(true);focusCompanyAnalysisPanel();requestAnimationFrame(()=>drawCompanyTargetChart());
    }
  };
  document.querySelectorAll('[data-war-company-analyze]').forEach(b=>b.onclick=()=>{markUiInteraction();loadCompanyAnalysis(Number(b.dataset.warCompanyAnalyze||0),{fromWar:true});});
  document.querySelectorAll('[data-company-analyze]').forEach(b=>b.onclick=()=>{markUiInteraction();loadCompanyAnalysis(Number(b.dataset.companyAnalyze||0),{fromWar:false});});

  document.querySelectorAll('[data-company-metric]').forEach(b=>b.onclick=()=>{state.companyMetric=b.dataset.companyMetric||'valuation';renderTerminal();});


  document.querySelectorAll('[data-company-ops-tab]').forEach(b=>b.onclick=()=>{state.companyOpsTab=b.dataset.companyOpsTab||'products';renderTerminal(true);});
  document.querySelectorAll('[data-threat-media]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.threatMedia||0);if(!id)return;state.companyMediaTargetId=id;state.companyMediaTone='CRITICAL';state.companyMediaSearch='';state.companySection='risk';state.companyRiskTab='news';renderTerminal(true);});
  document.querySelectorAll('[data-threat-analyze]').forEach(b=>b.onclick=async()=>{const id=Number(b.dataset.threatAnalyze||0);const c=(state.company?.companies||[]).find(x=>Number(x.id)===id);if(!id)return;state.companySection='competition';state.companyCompetitionTab='companies';state.companySearch=c?.name||'';state.companyAnalysisId=id;state.companyAnalysis=null;renderTerminal(true);try{const profile=await companyApi('PROFILE',{p_company_id:id});try{const rp=await companyRealismApi('PROFILE',{p_company_id:id});profile.realism_products=Array.isArray(rp?.products)?rp.products:[]}catch(_e){}state.companyAnalysis=alignCompanyProfileToSharedMarket(profile);renderTerminal(true);}catch(err){state.companyNotice='공격 회사 분석 실패: '+err.message;renderTerminal(true);}});
  const mediaSearch=document.getElementById('companyMediaSearch');const mediaSearchBtn=document.getElementById('companyMediaSearchBtn');
  const doMediaSearch=()=>{const q=String(mediaSearch?.value||'').trim();state.companyMediaSearch=q;const all=[...(state.company?.companies||[])].filter(c=>c&&c.status!=='INACTIVE');const ql=q.toLowerCase(),matches=q?all.filter(c=>`${c.name||''} ${c.ticker||''} ${c.owner_nickname||''}`.toLowerCase().includes(ql)):[];const exact=matches.find(c=>String(c.name||'').toLowerCase()===ql||String(c.ticker||'').toLowerCase()===ql||String(c.owner_nickname||'').toLowerCase()===ql);const chosen=exact||(matches.length===1?matches[0]:null);if(chosen){state.companyMediaTargetId=Number(chosen.id);if(state.companyMediaTone==='CRITICAL'&&state.companyMediaTargetId===Number(state.company?.my_company?.id))state.companyMediaTone='PROMOTE';}renderTerminal(true);};
  if(mediaSearchBtn)mediaSearchBtn.onclick=doMediaSearch;if(mediaSearch)mediaSearch.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();doMediaSearch();}};
  document.querySelectorAll('[data-company-media-region]').forEach(b=>b.onclick=()=>{state.companyMediaRegion=b.dataset.companyMediaRegion||'ALL';renderTerminal(true);});
  document.querySelectorAll('[data-media-tone]').forEach(b=>b.onclick=()=>{if(b.disabled)return;state.companyMediaTone=b.dataset.mediaTone||'PROMOTE';renderTerminal(true);});
  const mediaTargetReset=document.getElementById('companyMediaTargetReset');if(mediaTargetReset)mediaTargetReset.onclick=()=>{state.companyMediaTargetId=Number(state.company?.my_company?.id)||0;state.companyMediaSearch='';if(state.companyMediaTone==='CRITICAL')state.companyMediaTone='PROMOTE';renderTerminal(true);};
  document.querySelectorAll('[data-media-target-quick]').forEach(b=>b.onclick=()=>{const id=Number(b.dataset.mediaTargetQuick)||Number(state.company?.my_company?.id)||0;const c=(state.company?.companies||[]).find(x=>Number(x.id)===id)||state.company?.my_company;state.companyMediaTargetId=id;state.companyMediaSearch=c?.name||state.companyMediaSearch||'';if(state.companyMediaTone==='CRITICAL'&&id===Number(state.company?.my_company?.id))state.companyMediaTone='PROMOTE';renderTerminal(true);});

  document.querySelectorAll('[data-company-media]').forEach(b=>b.onclick=async()=>{
    const outlet=b.dataset.mediaApiCode||b.dataset.companyMedia,cost=Math.max(0,Number(b.dataset.mediaCost)||0),name=b.dataset.mediaName||'언론사',region=b.dataset.mediaRegion||'',tone=state.companyMediaTone||'PROMOTE';
    const targetId=Math.max(0,Number(state.companyMediaTargetId)||Number(state.company?.my_company?.id)||0),target=(state.company?.companies||[]).find(c=>Number(c.id)===targetId)||state.company?.my_company;
    if(tone==='CRITICAL'&&targetId===Number(state.company?.my_company?.id)){alert('자사 대상 비판 기사는 지원하지 않습니다. 타사 또는 다른 유저 회사를 선택해 주세요.');return;}
    const factor=tone==='CRITICAL'?1.15:1,anchorCost=cost*factor,cash=Math.max(0,Number(state.company?.my_company?.cash||0)),cap=Math.max(anchorCost,Math.min(cash*(tone==='CRITICAL'?.14:.10),anchorCost*3.2));
    const direction=tone==='CRITICAL'?'비판·검증':tone==='NEUTRAL'?'사실 중심':'긍정 홍보';
    if(!confirm(`${name}을 우선 매체로 선택했습니다.
대상: ${target?.name||'선택한 회사'} · 논조: ${direction}
AI 자동 캠페인 최대 한도: ${formatKrwSmart(cap)}

한 번 승인하면 AI 홍보팀이 최대 3개 매체를 자동으로 조합해 후속 기사까지 발행합니다. 승인할까요?`))return;
    const progress=showCompanyAutopilotProgress(`${target?.name||'대상 회사'} 언론 캠페인`,'AI 홍보팀이 최적 매체 조합을 계산합니다.');
    try{b.disabled=true;b.textContent='AI 캠페인 중…';const result=await runMediaAutopilot(outlet,targetId,tone,region,cost,progress);state.companyNotice=result?.message||'AI 언론 캠페인이 완료되었습니다.';recordCompanyGameAction('media',`${tone}:${targetId}`);playCompanySfx('news');progress.close(state.companyNotice);await loadCompanyLayer(false,true);renderTerminal(true);}catch(err){state.companyNotice='AI 언론 캠페인 실패: '+err.message;progress.close(state.companyNotice);alert(state.companyNotice);renderTerminal(true);}
  });

  document.querySelectorAll('[data-talent-grade-filter]').forEach(b=>b.onclick=()=>{state.companyTalentGradeFilter=String(b.dataset.talentGradeFilter||'ALL');renderTerminal(true)});
  document.querySelectorAll('[data-talent-interview]').forEach(b=>b.onclick=()=>{openCompanyInterviewDesk(state.company);renderTerminal()});
  document.querySelectorAll('[data-talent-jump]').forEach(b=>b.onclick=()=>{const el=document.getElementById(String(b.dataset.talentJump||''));if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.classList.add('focus-pulse');setTimeout(()=>el.classList.remove('focus-pulse'),1200)}});
  document.querySelectorAll('[data-talent-hire]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.talentHire||0),candidate=(state.company?.recruit_pool||[]).find(x=>Number(x.id)===id);if(!candidate)return;
    if(!confirm(`${candidate.grade} ${candidate.name}을 채용할까요?
월급 ${formatKrwSmart(candidate.monthly_salary)} · 사인보너스 ${formatKrwSmart(candidate.signing_bonus)}
오늘 채용 한도 ${state.company.talent_hired_today}/${state.company.talent_daily_limit}`))return;
    try{b.disabled=true;const d=await companyTalentApi('HIRE_CANDIDATE',{p_candidate_id:id});if(!d?.ok)throw new Error(d?.message||'채용에 실패했습니다.');rememberLocalHireProfile(candidate,state.company?.my_company);state.companyNotice=d.message;playCompanySfx('success');await loadCompanyLayer(false,true);renderTerminal(true);}catch(err){state.companyNotice='채용 실패: '+err.message;alert(state.companyNotice);renderTerminal(true);}
  });
  document.querySelectorAll('[data-talent-poach]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.talentPoach||0),talent=(state.company?.poach_targets||[]).find(x=>Number(x.id)===id);if(!talent)return;
    const salary=parseCompanyMoney(document.getElementById(`poachSalary_${id}`)?.value,Number(talent.monthly_salary||0)*1.2),bonus=parseCompanyMoney(document.getElementById(`poachBonus_${id}`)?.value,Number(talent.monthly_salary||0)*4);
    if(!confirm(`${talent.company_name||talent.source_company_name||'경쟁사'}의 ${talent.grade||talentCareerTitle(talent)} ${talent.name}에게 이직을 제안할까요?
제시 월급 ${formatKrwSmart(salary)} · 사인보너스 ${formatKrwSmart(bonus)}
결과는 수락/거절 창으로 바로 알려드립니다.`))return;
    const old=b.textContent;
    try{
      b.disabled=true;b.textContent='제안 협상 중…';
      const d=await companyTalentApi('POACH',{p_talent_id:id,p_offer_salary:salary,p_signing_bonus:bonus});
      if(!d?.ok)throw new Error(d?.message||'영입 제안을 처리하지 못했습니다.');
      await loadCompanyLayer(false,true);const accepted=inferPoachSuccess(d,talent,state.company);const result={...d,success:accepted===null?d.success:accepted};
      state.companyNotice=`${accepted===true?'이직 수락':accepted===false?'이직 거절':'이직 협상 완료'} · ${d.message||talent.name}${d.success_chance!=null?` · 수락확률 ${Number(d.success_chance).toFixed(1)}%`:''}`;playCompanySfx(accepted===true?'success':'alert');renderTerminal(true);setTimeout(()=>showTalentPoachResult(talent,result,salary,bonus),30);
    }catch(err){
      if(localTalentPoachFallbackable(err)){
        const d=applyLocalTalentPoach(id,salary,bonus,state.company);if(!d?.ok){state.companyNotice='헤드헌팅 실패: '+d.message;alert(state.companyNotice);renderTerminal(true);return;}
        state.companyNotice=d.message;playCompanySfx(d.success?'success':'alert');renderTerminal(true);setTimeout(()=>showTalentPoachResult(talent,d,salary,bonus),30);return;
      }
      state.companyNotice='헤드헌팅 실패: '+err.message;alert(state.companyNotice);renderTerminal(true);setTimeout(()=>showTalentPoachResult(talent,{success:false,message:state.companyNotice},salary,bonus),30);
    }finally{if(document.body.contains(b)){b.disabled=false;b.textContent=old}}
  });

  document.querySelectorAll('[data-talent-fire]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.talentFire||0),t=(state.company?.talents||[]).find(x=>Number(x.id)===id);if(!t)return;
    const severance=Math.max(Number(t.monthly_salary||0),Number(t.monthly_salary||0)*Math.min(4,Math.max(1,Math.ceil(Number(t.career_level||1)/8))));
    if(!confirm(`${t.name}을 해고할까요?\n예상 퇴직비용 약 ${formatKrwSmart(severance)} · 핵심인재 자동운영 기여도 ${talentAutopilotContribution(t).toFixed(1)}가 사라집니다.`))return;
    try{
      b.disabled=true;b.textContent='처리 중…';
      if(t._localPoached){const d=terminateLocalPoachedTalent(id,severance,state.company);if(!d?.ok)throw new Error(d?.message||'해고 처리 실패');state.companyNotice=d.message;playCompanySfx('alert');renderTerminal(true);return;}
      const d=await companyTalentTerminateV645(id);if(!d?.ok)throw new Error(d?.message||'해고 처리 실패');state.companyNotice=d.message||`${t.name}의 퇴직 처리가 완료되었습니다.`;playCompanySfx('alert');await loadCompanyLayer(false,true);renderTerminal(true);
    }catch(err){state.companyNotice='해고 실패: '+err.message;alert(state.companyNotice);renderTerminal(true);}
  });

  document.querySelectorAll('[data-talent-train]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.talentTrain||0),type=b.dataset.trainingType||'BALANCED',t=(state.company?.talents||[]).find(x=>Number(x.id)===id);if(!t)return;
    const before=companyTalentTrainingStatus(t,state.company);
    if(before.trainedToday){state.companyNotice=`${t.name}은(는) DAY ${before.day} 연수를 이미 완료했습니다. DAY ${before.nextDay}부터 다시 연수할 수 있습니다.`;alert(state.companyNotice);return;}
    const plan=simulateTalentTrainingPlan(t,type);
    if(!confirm(`${t.name}에게 ${type==='SPECIALTY'?'전문':'종합'} 연수를 진행할까요?
연수는 승인 즉시 완료됩니다.${talentTrainingRpcAvailable===false?`
예상 비용 ${formatKrwSmart(plan.cost)} · 로컬 연수 시스템 사용`:''}`))return;
    const runLocal=()=>{const local=applyLocalTalentTraining(id,type,state.company);if(!local?.ok){state.companyNotice=local?.message||'직원 연수 실패';playCompanySfx('alert');alert(state.companyNotice);renderTerminal(true);return false;}state.companyNotice=`${local.message} · 즉시 반영 완료`;playCompanySfx('success');renderTerminal(true);setTimeout(()=>showTalentTrainingToast(t,type,local.message),30);return true;};
    if(talentTrainingRpcAvailable===false){b.disabled=true;b.textContent='즉시 연수 처리 중…';runLocal();return;}
    try{
      b.disabled=true;b.textContent='연수 처리 중…';
      const d=await companyTalentApi('TRAIN',{p_talent_id:id,p_training_type:type});if(!d?.ok)throw new Error(d?.message||'연수 실패');
      talentTrainingRpcAvailable=true;recordServerTalentTrainingStatus(id,type,d,state.company);state.companyNotice=(d.message||'직원 연수를 진행했습니다.')+' · 즉시 반영 완료';playCompanySfx(d.grew?'success':'alert');await loadCompanyLayer(false,true);renderTerminal(true);setTimeout(()=>showTalentTrainingToast(t,type,d.message||'서버 연수 결과가 즉시 반영되었습니다.'),30);
    }catch(err){
      if(localTalentTrainingFallbackable(err)){talentTrainingRpcAvailable=false;runLocal();return;}
      state.companyNotice='연수 처리 실패: '+err.message;playCompanySfx('alert');alert(state.companyNotice);renderTerminal(true);
    }
  });
  document.querySelectorAll('[data-talent-match]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.talentMatch||0),salary=parseCompanyMoney(document.getElementById(`matchSalary_${id}`)?.value,0);if(!confirm('경쟁사의 이직 제안에 맞제안할까요? 보상 비용이 법인현금에 반영됩니다.'))return;
    try{const d=await companyTalentApi('MATCH_OFFER',{p_offer_id:id,p_match_salary:salary});if(!d?.ok)throw new Error(d?.message||'맞제안 실패');state.companyNotice=d.message;await loadCompanyLayer(false,true);renderTerminal(true);}catch(err){alert('맞제안 실패: '+err.message);}
  });
  document.querySelectorAll('[data-talent-release]').forEach(b=>b.onclick=async()=>{
    const id=Number(b.dataset.talentRelease||0);if(!confirm('이 직원의 경쟁사 이직을 허용할까요? 실제로 우리 회사 인력에서 빠집니다.'))return;
    try{const d=await companyTalentApi('RELEASE_OFFER',{p_offer_id:id});if(!d?.ok)throw new Error(d?.message||'이직 처리 실패');state.companyNotice=d.message;await loadCompanyLayer(false,true);renderTerminal(true);}catch(err){alert('이직 처리 실패: '+err.message);}
  });
  document.querySelectorAll('[data-company-hr]').forEach(b=>b.onclick=async()=>{
    const action=b.dataset.companyHr;
    const dept=action==='LAYOFF'?document.getElementById('companyLayoffDepartment')?.value:document.getElementById('companyHireDepartment')?.value;
    const count=action==='LAYOFF'?Math.max(1,Math.floor(Number(document.getElementById('companyLayoffCount')?.value)||1)):Math.max(1,Math.floor(Number(document.getElementById('companyHireCount')?.value)||1));
    const salary=action==='HIRE'?parseCompanyMoney(document.getElementById('companyHireSalary')?.value,4000000):action==='BONUS'?parseCompanyMoney(document.getElementById('companyBonusAmount')?.value,30000000):parseCompanyMoney(document.getElementById('companySalaryAmount')?.value,Number(state.company?.my_company?.avg_monthly_salary||4000000));
    const label={HIRE:`${departmentLabel(dept)} ${count}명 채용`,SET_SALARY:`평균 월급을 ${formatKrwSmart(salary)}으로 변경`,BONUS:`성과급 ${formatKrwSmart(salary)} 지급`,LAYOFF:`${departmentLabel(dept)} ${count}명 인력 조정`}[action]||'인사 결정';
    if(!confirm(`${label}을 실행할까요? 급여·퇴직비용은 실제 법인현금과 향후 고정비에 반영됩니다.`))return;
    try{
      const d=await companyOpsV511(action,{department:dept,count,salary,amount:salary});
      if(!d?.ok)throw new Error(d?.message||'인사 결정을 처리하지 못했습니다.');
      state.companyNotice=d.message||'인사 결정이 반영되었습니다.';
      recordCompanyGameAction('hr',action);
      await loadCompanyLayer(false,true);renderTerminal(true);
    }catch(err){state.companyNotice='인사 처리 실패: '+err.message;const msg=document.getElementById('companyMsg');if(msg)msg.textContent=state.companyNotice;else alert(state.companyNotice);}
  });

  document.querySelectorAll('[data-company-tax]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyTax;
    const text={PAY:'현재 고지세액과 미납 세금을 납부할까요?',PLAN:'세무 전문가 비용을 들여 합법적 절세 검토를 진행할까요?',INSTALLMENT:'세금 일부만 먼저 납부하고 잔액을 이월할까요? 잔액에는 가산 부담과 조사 위험이 생깁니다.',EVADE:'신고 누락은 불법 고위험 선택입니다. 적발되면 원세금 외 추징·가산 부담, 평판 하락, 규제조사와 일시 거래 제한이 발생할 수 있습니다. 그래도 시도할까요?',CORRECT:'미납·누락 세금을 자진 정정해 정리할까요?'};
    companyRun('kx_company_tax',{p_action:action},text[action]||'세무 결정을 실행할까요?');
  });

  document.querySelectorAll('[data-company-retry]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;b.textContent='온라인 연결 확인 중…';
    state.companyRpcMode='AUTO';companyApiReady=false;
    await loadCompanyLayer(false,true);
    state.companyNotice=state.companyAvailable
      ?'온라인 회사 경영 서버가 연결되었습니다. BOT과 다른 유저 회사가 같은 시장에서 경쟁합니다.'
      :'온라인 연결에 실패했습니다. 기본 kx_company_api_v1 설치 여부와 V6.2 SQL 실행 결과를 함께 확인해 주세요.';
    renderTerminal();
  });

  document.querySelectorAll('[data-event-predict]').forEach(b=>b.onclick=async()=>{
    const msg=b.closest('.market-event-card');
    try{await rpc('kx_game_predict',{p_event_id:Number(b.dataset.eventPredict),p_choice:b.dataset.choice});await loadGameLayer(false,true);renderTerminal()}catch(e){if(msg)msg.setAttribute('data-error',e.message);alert('판단 기록 실패: '+e.message)}
  });
  const openShort=document.getElementById('openShort');if(openShort)openShort.onclick=async()=>{
    const ticker=document.getElementById('shortTicker')?.value,qty=Math.max(1,Math.floor(Number(document.getElementById('shortQty')?.value)||1)),msg=document.getElementById('shortMsg');
    openShort.disabled=true;try{await rpc('kx_short_open',{p_ticker:ticker,p_quantity:qty});if(msg)msg.textContent='공매도 포지션을 열었습니다.';await loadPrivateSnapshot();await loadGameLayer(false,true);renderTerminal()}catch(e){if(msg)msg.textContent=e.message;openShort.disabled=false}
  };
  document.querySelectorAll('[data-short-close]').forEach(b=>b.onclick=async()=>{if(!confirm('현재 가격으로 공매도 포지션을 청산할까요?'))return;try{await rpc('kx_short_close',{p_position_id:Number(b.dataset.shortClose)});await loadPrivateSnapshot();await loadGameLayer(false,true);renderTerminal()}catch(e){alert(e.message)}});
  document.querySelectorAll('[data-ipo-subscribe]').forEach(b=>b.onclick=async()=>{
    const ticker=b.dataset.ipoSubscribe,qty=Math.max(1,Math.floor(Number(document.getElementById(`ipoQty_${ticker}`)?.value)||1));
    b.disabled=true;try{await rpc('kx_ipo_subscribe',{p_ticker:ticker,p_quantity:qty});await loadPrivateSnapshot();await loadGameLayer(false,true);renderTerminal()}catch(e){b.disabled=false;alert('IPO 청약 실패: '+e.message)}
  });

  const bankRun=async(name,body,question)=>{
    const msg=document.getElementById('bankMsg');
    if(question&&!confirm(question))return;
    try{const d=await rpc(name,body);if(msg)msg.textContent=d?.message||'처리가 완료되었습니다.';await sync(false,false,true)}catch(e){if(msg)msg.textContent=e.message;else alert(e.message)}
  };
  const term=document.getElementById('openTermDeposit');if(term)term.onclick=()=>{const amount=Math.floor(Number(document.getElementById('termAmount').value)||0),months=Number(document.getElementById('termMonths').value)||3;bankRun('kx_bank_open_deposit',{p_amount:amount,p_term_months:months},`${won(amount)}을 ${months}개월 정기예금에 예치할까요?`)};
  const saving=document.getElementById('openSavings');if(saving)saving.onclick=()=>{const amount=Math.floor(Number(document.getElementById('savingAmount').value)||0),months=Number(document.getElementById('savingMonths').value)||6;bankRun('kx_bank_open_savings',{p_monthly_amount:amount,p_term_months:months},`매 DAY ${won(amount)}씩 ${months}개월 적금을 시작할까요? 첫 회차는 즉시 출금됩니다.`)};
  const loan=document.getElementById('takeLoan');if(loan)loan.onclick=()=>{const amount=Math.floor(Number(document.getElementById('loanAmount').value)||0),months=Number(document.getElementById('loanMonths').value)||6;bankRun('kx_bank_take_loan',{p_amount:amount,p_term_months:months},`${won(amount)}을 ${months}개월 신용대출로 받을까요? 대출금은 개인 투자 순자산 계산에서 부채로 차감됩니다.`)};
  document.querySelectorAll('[data-bank-withdraw]').forEach(b=>b.onclick=()=>bankRun('kx_bank_withdraw_deposit',{p_deposit:b.dataset.bankWithdraw},'해당 상품을 해지하고 잔액을 현금으로 받을까요?'));
  document.querySelectorAll('[data-bank-repay]').forEach(b=>b.onclick=()=>{const debt=Math.ceil(Number(b.dataset.bankDebt)||0);bankRun('kx_bank_repay_loan',{p_loan:b.dataset.bankRepay,p_amount:debt},`${won(debt)} 범위에서 대출을 상환할까요?`)});
}

async function placeOrder(){
  const s=selected(),msg=document.getElementById('orderMsg');
  try{
    rememberOrderInputs();
    const type=document.getElementById('otype').value;
    const qty=Math.max(1,Math.floor(Number(document.getElementById('qty').value)||1));
    const price=type==='LIMIT'?Number(document.getElementById('price').value):null;
    if(type==='LIMIT'&&(!Number.isFinite(price)||price<=0)){msg.textContent='지정 가격을 확인해 주세요.';return;}
    const body={p_ticker:s.ticker,p_side:state.side,p_order_type:type,p_quantity:qty,p_limit_price:price,p_tif:document.getElementById('tif')?.value||state.tif||'DAY'};
    showOrderConfirm(body);
  }catch(e){if(msg)msg.textContent=e.message}
}

async function cancelOrder(id){
  try{await rpc('kx_cancel_order',{p_order:id});await sync(false,false,true)}
  catch(e){alert(e.message)}
}

function normalizedCandles(input){
  const src=[...(input||[])].filter(x=>Number.isFinite(Number(x.candle_no))&&Number(x.close)>0).sort((a,b)=>Number(a.candle_no)-Number(b.candle_no));
  if(!src.length)return [];
  const maxNo=Number(src[src.length-1].candle_no),minKeep=Math.max(Number(src[0].candle_no),maxNo-239);
  const byNo=new Map(src.filter(x=>Number(x.candle_no)>=minKeep).map(x=>[Number(x.candle_no),x]));
  const out=[];let prevClose=null,prevTime=null;
  for(let no=minKeep;no<=maxNo;no++){
    const row=byNo.get(no);
    if(row){
      const clean={...row,candle_no:no,open:Number(row.open),high:Number(row.high),low:Number(row.low),close:Number(row.close),volume:Math.max(0,Number(row.volume)||0)};
      clean.high=Math.max(clean.high,clean.open,clean.close);clean.low=Math.min(clean.low,clean.open,clean.close);
      out.push(clean);prevClose=clean.close;prevTime=row.created_at?new Date(row.created_at).getTime():prevTime;
    }else if(prevClose!=null){
      prevTime=prevTime?prevTime+60000:null;
      out.push({candle_no:no,open:prevClose,high:prevClose,low:prevClose,close:prevClose,volume:0,synthetic:true,created_at:prevTime?new Date(prevTime).toISOString():null});
    }
  }
  return out;
}
function aggregateCandles(rows,span){
  span=Math.max(1,Number(span)||1);if(span===1)return rows;
  const buckets=new Map();
  for(const row of rows){
    const key=Math.floor(Number(row.candle_no)/span),arr=buckets.get(key)||[];arr.push(row);buckets.set(key,arr);
  }
  return [...buckets.entries()].sort((a,b)=>a[0]-b[0]).map(([key,g])=>({candle_no:key*span,open:Number(g[0].open),high:Math.max(...g.map(x=>Number(x.high))),low:Math.min(...g.map(x=>Number(x.low))),close:Number(g[g.length-1].close),volume:g.reduce((a,x)=>a+(Number(x.volume)||0),0),created_at:g[0].created_at,synthetic:g.every(x=>x.synthetic)}));
}

function smaSeries(rows,n){
  let sum=0;const out=[];
  for(let i=0;i<rows.length;i++){
    sum+=Number(rows[i].close)||0;if(i>=n)sum-=Number(rows[i-n].close)||0;
    out.push(i>=n-1?sum/n:null);
  }
  return out;
}
function chartRange(rows){
  const lows=rows.map(x=>Number(x.low)).filter(x=>x>0),highs=rows.map(x=>Number(x.high)).filter(x=>x>0);
  const actualLo=Math.min(...lows),actualHi=Math.max(...highs);if(!Number.isFinite(actualLo)||!Number.isFinite(actualHi))return {lo:1,hi:2};
  const last=Number(rows[rows.length-1]?.close)||actualLo;
  const spread=Math.max(actualHi-actualLo,last*.006);
  const pad=Math.max(spread*.10,last*.0018);
  return {lo:Math.max(1,actualLo-pad),hi:actualHi+pad};
}
function drawChart(){
  const c=document.getElementById('chart');if(!c)return;
  const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;
  c.width=Math.max(300,Math.floor(r.width*dpr));c.height=Math.max(300,Math.floor(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=r.width,H=r.height;ctx.clearRect(0,0,W,H);
  const span=state.chartPeriod==='15M'?15:state.chartPeriod==='5M'?5:1;
  const base=normalizedCandles(state.candles),allRows=aggregateCandles(base,span);
  const visibleMax=W<560?34:W<900?50:72;
  const startIdx=Math.max(0,allRows.length-visibleMax),rows=allRows.slice(startIdx);
  const ma5=smaSeries(allRows,5).slice(startIdx),ma20=smaSeries(allRows,20).slice(startIdx),ma60=smaSeries(allRows,60).slice(startIdx);
  const L=W<560?8:14,R=W<560?56:72,T=18,XH=24,VH=Math.max(62,Math.min(100,H*.20)),GAP=16;
  const priceBottom=H-XH-VH-GAP,plotW=Math.max(120,W-L-R),plotH=Math.max(150,priceBottom-T),volTop=priceBottom+GAP,volH=VH;
  if(rows.length<2){ctx.fillStyle='#8897aa';ctx.font='13px sans-serif';ctx.fillText('체결 데이터가 쌓이면 차트가 표시됩니다.',L+10,T+24);return}
  const rg=chartRange(rows),lo=rg.lo,hi=rg.hi,last=Number(rows[rows.length-1].close)||lo;
  const y=p=>T+(hi-Number(p))/(hi-lo)*plotH;
  const step=plotW/rows.length,bw=Math.max(2,Math.min(11,step*.58));
  ctx.lineWidth=1;ctx.strokeStyle='#202a36';ctx.fillStyle='#8290a4';ctx.font=`${W<560?9:10}px sans-serif`;ctx.textAlign='left';
  for(let i=0;i<=5;i++){const yy=T+plotH*i/5;ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(L+plotW,yy);ctx.stroke();ctx.fillText(nf.format(Math.round(hi-(hi-lo)*i/5)),L+plotW+7,yy+3)}
  const prevClose=Number(selected()?.prev_close||0);if(prevClose>=lo&&prevClose<=hi){ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='#536175';ctx.beginPath();ctx.moveTo(L,y(prevClose));ctx.lineTo(L+plotW,y(prevClose));ctx.stroke();ctx.restore()}
  rows.forEach((x,i)=>{const xx=L+i*step+step/2,op=Number(x.open),cl=Number(x.close),hg=Number(x.high),lw=Number(x.low),up=cl>=op;ctx.strokeStyle=ctx.fillStyle=up?'#e66b70':'#668de8';ctx.globalAlpha=x.synthetic?.35:1;ctx.beginPath();ctx.moveTo(xx,y(hg));ctx.lineTo(xx,y(lw));ctx.stroke();const yy=Math.min(y(op),y(cl)),hh=Math.max(1.5,Math.abs(y(op)-y(cl)));ctx.fillRect(xx-bw/2,yy,bw,hh);ctx.globalAlpha=1});
  const drawMA=(vals,color,width=1.35)=>{ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();let started=false;vals.forEach((v,i)=>{if(v==null||v<lo*.8||v>hi*1.2)return;const xx=L+i*step+step/2,yy=y(v);if(!started){ctx.moveTo(xx,yy);started=true}else ctx.lineTo(xx,yy)});if(started)ctx.stroke();ctx.restore()};
  if(guidanceMode()!=='REALISTIC'){drawMA(ma5,'#e7bf59',1.5);drawMA(ma20,'#a776dc',1.35);drawMA(ma60,'#59aa78',1.35);}
  const currentY=y(last);if(currentY>=T&&currentY<=priceBottom){ctx.save();ctx.setLineDash([3,3]);ctx.strokeStyle='#d7dde7';ctx.globalAlpha=.75;ctx.beginPath();ctx.moveTo(L,currentY);ctx.lineTo(L+plotW,currentY);ctx.stroke();ctx.restore();const label=nf.format(Math.round(last));ctx.font=`bold ${W<560?9:10}px sans-serif`;const tw=ctx.measureText(label).width+10;ctx.fillStyle='#182330';ctx.fillRect(L+plotW+3,currentY-10,Math.min(R-5,tw),20);ctx.strokeStyle=Number(selected()?.last_price)>=Number(selected()?.prev_close)?'#b95157':'#4f72bd';ctx.strokeRect(L+plotW+3,currentY-10,Math.min(R-5,tw),20);ctx.fillStyle='#eef3f8';ctx.fillText(label,L+plotW+8,currentY+3)}
  const maxVol=Math.max(1,...rows.map(x=>Number(x.volume)||0));ctx.strokeStyle='#1c2631';ctx.beginPath();ctx.moveTo(L,volTop);ctx.lineTo(L+plotW,volTop);ctx.stroke();
  rows.forEach((x,i)=>{const xx=L+i*step+step/2,vh=(Number(x.volume)||0)/maxVol*(volH-10),up=Number(x.close)>=Number(x.open);ctx.fillStyle=up?'rgba(230,107,112,.60)':'rgba(102,141,232,.60)';ctx.fillRect(xx-bw/2,volTop+volH-vh,bw,Math.max(1,vh))});
  ctx.fillStyle='#718095';ctx.font=`${W<560?8:9}px sans-serif`;ctx.textAlign='left';ctx.fillText(`거래량 ${nf.format(maxVol)}`,L,volTop+10);
  const marks=[0,Math.floor((rows.length-1)/4),Math.floor((rows.length-1)/2),Math.floor((rows.length-1)*3/4),rows.length-1];ctx.textAlign='center';ctx.fillStyle='#7b899c';
  for(const idx of [...new Set(marks)]){const x=rows[idx];if(!x)continue;let label=x.created_at?new Date(x.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}):`#${x.candle_no}`;ctx.fillText(label,L+idx*step+step/2,H-6)}
}

document.addEventListener('input',markUiInteraction,true);
document.addEventListener('keydown',markUiInteraction,true);
document.addEventListener('pointerdown',markUiInteraction,true);
addEventListener('scroll',markUiInteraction,true);

async function start(){
  localStorage.removeItem(LOCAL_COMPANY_KEY);
  state.companyMode='REMOTE';
  app.innerHTML='<div class="boot"><div class="kxlogo">KX</div><b>KX CORPORATE</b><span>온라인 기업시장·경영 데이터에 연결하는 중…</span></div>';
  // boot()의 validate/refresh에서 세션을 이미 확인했으므로 여기서
  // /auth/v1/user를 중복 호출하지 않는다. 서버 권한은 각 RPC에서 계속 검증된다.
  try{await rpc('kx_join_exchange',{})}catch(e){console.warn('KX join marker skipped:',e.message)}
  await sync(true,true,true);
  scheduleCompanyClock();
  const scheduleSharedSync=()=>{
    clearTimeout(marketSyncTimer);
    const now=Date.now();
    const delay=Math.max(350,5000-(now%5000)+120);
    marketSyncTimer=setTimeout(async()=>{await sync(true,false,false);scheduleSharedSync();},delay);
  };
  scheduleSharedSync();
  addEventListener('resize',()=>{if(document.getElementById('chart'))drawChart();if(document.getElementById('companyGrowthChart'))drawCompanyGrowthChart();if(document.getElementById('companyTargetChart'))drawCompanyTargetChart();});
}
async function boot(){
  if(!C.supabaseUrl||!C.supabaseAnonKey)return renderDiag();
  try{session=JSON.parse(localStorage.getItem(LS)||'null')}catch{}
  if(session&&await validate())return start();
  renderAuth();
}
boot();
})();
