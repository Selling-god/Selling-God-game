(()=>{
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

let session=null;
let state={
  stocks:[],ticker:'A101',candles:[],depth:[],news:[],clock:null,
  account:null,positions:[],orders:[],trades:[],ranking:[],
  bankDeposits:[],bankLoans:[],bankMeta:{},chartRanges:{},
  game:{events:[],predictions:[],shorts:[],ipos:[],subscriptions:[],dividends:[],short_adjustments:[],prediction_stats:{total:0,correct:0}},gameAvailable:true,gameError:'',
  company:{my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],events:[],world:null,control_case:null},
  companyAvailable:true,companyMode:'REMOTE',companyError:'',companyRegion:'국내',companyNotice:'',companySection:'dashboard',
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
function escapeHtml(x){return String(x??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}

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
const GUIDE_MODES={STANDARD:{label:'표준',short:'표준',desc:'핵심 보조선과 짧은 설명을 표시합니다.'}};
function guidanceMode(){return 'STANDARD'}
function guidanceInfo(){return GUIDE_MODES.STANDARD}
function setGuidanceMode(){localStorage.setItem(GUIDE_MODE_KEY,'STANDARD')}
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
function emptyCompany(){return {my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],media_campaigns:[],tax_records:[],events:[],world:null,control_case:null}}
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
    const drift=(Math.random()-.45)*.028+(b.ai_style==='GROWTH'?.006:0);
    b.previous_revenue=b.revenue;b.revenue=Math.max(120000000,b.revenue*(1+drift));b.profit=b.revenue*(.055+(b.technology+b.operations-120)/1200+(Math.random()-.5)*.025);
    b.valuation=Math.max(500000000,b.valuation*(1+drift*.7+(Math.random()-.48)*.018));b.share_price=Math.max(300,b.valuation/1000000);
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
    if(!d.control_case&&d.world.cycle_no>3&&Math.random()<.07){const candidates=d.companies.filter(x=>x.is_bot&&x.valuation>c.valuation*.85);if(candidates.length){const a=candidates[Math.floor(Math.random()*candidates.length)],stake=12+Math.random()*7;d.control_case={id:Date.now(),status:'ACTIVE',stage:'WATCH',started_cycle:d.world.cycle_no,deadline_cycle:d.world.cycle_no+12,cycles_left:12,attacker_company_id:a.id,attacker_name:a.name,attacker_ticker:a.ticker,attacker_country:a.home_country,attacker_type:'BOT',attacker_style:a.ai_style,stake,counter_stake:0,used_rights_issue:false,used_poison_pill:false};localEvent(d,'TAKEOVER','적대적 지분 매집 포착',`${a.name}이 장내·우호지분을 통해 우리 회사 지분을 모으기 시작했습니다.`)}}
    if(d.control_case){const t=d.control_case;t.cycles_left=Math.max(0,Number(t.deadline_cycle)-d.world.cycle_no);const pressure=Math.max(.4,1-Number(c.defense_power||0)/115);t.stake=Math.min(55,Number(t.stake||0)+(1.2+Math.random()*2.4)*pressure);t.stage=localTakeoverStage(t.stake);if(t.stake>=50){c.parent_name=t.attacker_name;c.last_event='경영권 인수';localEvent(d,'CONTROL','경영권 인수',`${t.attacker_name}의 보유지분이 50%를 넘어 경영권이 넘어갔습니다. 다시 지분을 낮추면 독립을 회복할 수 있습니다.`)} }
    if(c.product_quality<48&&Math.random()<.04){const cost=Math.max(10000000,c.revenue*.012);c.cash=Math.max(0,c.cash-cost);c.customer_trust=clamp(c.customer_trust-7);c.brand=clamp(c.brand-3);localEvent(d,'RECALL','품질 문제·리콜',`품질관리 부족으로 리콜이 발생해 ${won(cost)}의 비용과 고객신뢰 하락이 발생했습니다.`)}
    if(c.employee_morale<38&&Math.random()<.05){c.employees=Math.max(15,Math.round(c.employees*.94));c.technology=clamp(c.technology-2);localEvent(d,'HR','핵심인력 이탈','낮은 직원 사기로 핵심 인력이 퇴사했습니다. 복지·보상과 조직관리가 필요합니다.')}
    localRevalue(d);localIncomingSync(d);
  }
  saveLocalCompany(d);return d;
}
function activateLocalCompany(runSync=false){
  let d=loadLocalCompany();if(runSync)d=localTick(d);d.stock_options=(state.stocks||[]).filter(x=>Number(x.last_price)>0).map(x=>({ticker:x.ticker,name:x.name,last_price:x.last_price,sector:x.sector,market_area:x.market_area,market_country:x.market_country}));
  state.company=d;state.companyAvailable=true;state.companyMode='LOCAL';return d;
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
    const map={US:['미국','북미'],JP:['일본','동아시아'],DE:['독일','유럽'],SG:['싱가포르','동남아'],GB:['영국','유럽'],IN:['인도','남아시아'],BR:['브라질','남미']};const info=map[body.p_country_code]||[body.p_country_code,'해외'];const budget=Math.max(80000000,amt||200000000);if(spend(budget)<budget*.9)throw new Error('해외 진출 예산이 부족합니다.');let m=d.my_markets.find(x=>x.country_code===body.p_country_code);if(!m){m={company_id:c.id,country_code:body.p_country_code,country_name:info[0],region:info[1],presence:14,market_share:.3,revenue:0,established_at:new Date().toISOString()};d.my_markets.push(m)}else m.presence=clamp(m.presence+10*budget/200000000);m.market_share=Math.min(20,m.market_share+.6*budget/200000000);m.revenue+=budget*.18;c.global_share=clamp(c.global_share+.35*budget/200000000,0,60);c.global_level=Math.min(5,Math.max(c.global_level,d.my_markets.length));c.brand=clamp(c.brand+1.5);msg=`${info[0]} 사업에 투자해 현지 영향력과 글로벌 점유율을 확대했습니다.`;localEvent(d,'GLOBAL','해외 사업 확대',msg);
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
    const t=d.control_case;if(!t)throw new Error('현재 진행 중인 경영권 인수전이 없습니다.');const budget=Math.max(40000000,amt||150000000),a=body.p_action;if(a!=='RIGHTS_ISSUE'&&c.cash<budget)throw new Error('경영권 방어 예산이 부족합니다.');if(a!=='RIGHTS_ISSUE')c.cash-=budget;
    if(a==='BUYBACK'){t.stake=Math.max(0,t.stake-(4+budget/c.valuation*100));msg='긴급 자사주 매입으로 공격 기업의 실질 지분 압박을 낮췄습니다.'}
    if(a==='NEGOTIATE'){t.stake=Math.max(0,t.stake-(6+budget/c.valuation*120));msg='프리미엄 협상으로 공격 기업 지분 일부를 되샀습니다.'}
    if(a==='WHITE_KNIGHT'){c.defense_power=clamp(c.defense_power+30);t.stake=Math.max(0,t.stake-2);msg='백기사를 확보해 우호 의결권과 방어력이 크게 상승했습니다.'}
    if(a==='POISON_PILL'){if(t.used_poison_pill)throw new Error('이번 인수전에서 이미 포이즌필을 사용했습니다.');t.used_poison_pill=true;c.defense_power=clamp(c.defense_power+52);c.brand=clamp(c.brand-3);c.operations=clamp(c.operations-2);msg='포이즌필을 발동해 추가 인수 비용을 크게 높였습니다.'}
    if(a==='RIGHTS_ISSUE'){if(t.used_rights_issue)throw new Error('이번 인수전에서 이미 유상증자를 사용했습니다.');t.used_rights_issue=true;c.shares_outstanding*=1.22;t.stake=t.stake/1.22;c.cash+=budget*.65;c.investor_sentiment=clamp(c.investor_sentiment-3);msg='긴급 유상증자로 공격자 지분을 희석하고 추가 자금을 확보했습니다.'}
    if(a==='COUNTER_TAKEOVER'){t.stake=Math.max(0,t.stake-3);t.counter_stake=Number(t.counter_stake||0)+Math.min(12,budget/Math.max(1,d.companies.find(x=>x.id===t.attacker_company_id)?.valuation||1)*100);msg='공격 기업의 지분을 역으로 확보해 협상 압력을 높였습니다.'}
    t.stage=localTakeoverStage(t.stake);if(t.stake<10){localEvent(d,'DEFENSE','경영권 방어 성공',`${t.attacker_name}의 인수 시도를 사실상 무력화했습니다.`);d.control_case=null;c.parent_name=null}else{localEvent(d,'DEFENSE','긴급 이사회 방어조치',msg)}localIncomingSync(d);
  }
  localRevalue(d);saveLocalCompany(d);state.company=d;state.companyMode='LOCAL';return {message:msg};
}
function companyGrowth(c){return Number(c?.previous_revenue)>0?((Number(c.revenue)-Number(c.previous_revenue))/Number(c.previous_revenue))*100:0}
function companyProfitMargin(c){return Number(c?.revenue)>0?Number(c.profit)/Number(c.revenue)*100:0}
function companyDebtRatio(c){return Number(c?.valuation)>0?Number(c.debt)/Number(c.valuation)*100:0}
function companyStakeAgainstMe(){return Number(state.company?.my_company?.incoming_stake||0)}
function compactMoney(v){
  v=Number(v)||0;
  if(Math.abs(v)>=1000000000000)return `${(v/1000000000000).toFixed(1)}조`;
  if(Math.abs(v)>=100000000)return `${(v/100000000).toFixed(1)}억`;
  if(Math.abs(v)>=10000)return `${(v/10000).toFixed(1)}만`;
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
  try{
    const d=await req('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token}),auth:false});
    session=d;save();return true;
  }catch{return false}
}
async function validate(){
  if(!session?.access_token)return false;
  try{const u=await req('/auth/v1/user');session.user=u;save();return true}
  catch{return await refresh()}
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
async function loadCompanyLayer(runSync=false,force=false){
  const isMissing=e=>{const raw=String(e?.message||'');return e?.status===404||raw.includes('Could not find the function')||raw.includes('schema cache')||raw.includes('PGRST202')};
  try{
    let d=null,lastErr=null;
    const attempts=runSync
      ?['kx_company_sync_v5','kx_company_snapshot_v5','kx_company_sync','kx_company_snapshot']
      :['kx_company_snapshot_v5','kx_company_snapshot'];
    for(const name of attempts){
      try{d=await rpc(name,{});if(d)break}catch(e){lastErr=e;if(!isMissing(e)&&name.includes('snapshot'))throw e;}
    }
    if(!d)throw lastErr||new Error('회사 데이터를 불러오지 못했습니다.');
    state.company=d&&typeof d==='object'?{...emptyCompany(),...d}:emptyCompany();
    state.companyAvailable=true;
    state.companyMode='REMOTE';
    state.companyError='';
    if(runSync&&lastErr&&!isMissing(lastErr))state.companyNotice='온라인 회사 데이터는 연결되었습니다. 자동 경영주기 갱신 중 일부 처리가 지연되어 현재 스냅샷을 표시합니다.';
  }catch(e){
    const raw=String(e?.message||'');
    const missing=isMissing(e)||raw.includes('kx_company_');
    state.companyAvailable=false;
    state.companyMode='REMOTE';
    state.company=emptyCompany();
    state.companyError=missing
      ?'회사 경영 RPC를 찾지 못했습니다. 이번 패치의 KX_CORPORATE_V5_REPAIR.sql을 Supabase SQL Editor에서 실행한 뒤 연결 확인을 눌러 주세요.'
      :(raw||'온라인 회사 서버에 연결하지 못했습니다. Supabase 연결 상태를 확인해 주세요.');
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
    if(full||state.tab==='company'||syncRound%3===0)await loadCompanyLayer(advance||full,full);
    const editingCompanyForm=companyFormIsBeingEdited();
    rememberCompanyDraft();
    if(!editingCompanyForm)renderTerminal();
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

function topNav(){
  const items=[
    ['company','경영실','dashboard'],
    ['company','사업 운영','operations'],
    ['company','투자·인수','competition'],
    ['company','글로벌','global'],
    ['company','홍보·리스크','risk'],
    ['ranking','기업 순위','']
  ];
  return `<nav class="main-nav management-nav compact-management-nav">${items.map(([k,label,section])=>`<button data-main-tab="${k}" ${section?`data-company-section-nav="${section}"`:''} class="${state.tab===k&&(!section||state.companySection===section)?'on':''}">${label}</button>`).join('')}</nav>`;
}

function renderStockPicker(s){
  const filtered=state.stocks.filter(stockVisible).filter(x=>state.marketFilter==='ALL'||marketArea(x)===state.marketFilter);
  const pool=filtered.length?filtered:state.stocks;
  const sorted=[...pool].sort((a,b)=>Math.abs(changeOf(b))-Math.abs(changeOf(a)));
  const watch=[...(pool.some(x=>x.ticker===s.ticker)?[s]:[]),...sorted.filter(x=>x.ticker!==s.ticker)].slice(0,10);
  return `<aside class="watchlist-panel">
    <div class="watchlist-head"><div><small>WATCHLIST</small><b>종목 찾기</b></div><span>${pool.length} / ${state.stocks.length}</span></div>
    <div class="market-filter-tabs"><button data-market-filter="ALL" class="${state.marketFilter==='ALL'?'on':''}">전체</button><button data-market-filter="국내" class="${state.marketFilter==='국내'?'on':''}">국내</button><button data-market-filter="해외" class="${state.marketFilter==='해외'?'on':''}">해외</button></div>
    <label class="stock-search-select"><span>종목 바로가기</span><select id="stockSelect">${pool.map(x=>`<option value="${x.ticker}" ${x.ticker===s.ticker?'selected':''}>${marketArea(x)==='해외'?'[해외] ':'[국내] '}${escapeHtml(x.name)} · ${x.ticker}</option>`).join('')}</select></label>
    <div class="watchlist-list">${watch.map(x=>{const c=changeOf(x);return `<button data-ticker="${x.ticker}" class="watch-row ${x.ticker===s.ticker?'on':''}"><span><b>${escapeHtml(x.name)}</b><small>${marketArea(x)} · ${escapeHtml(x.sector)}</small></span><strong>${nf.format(x.last_price)}</strong><em class="${c>=0?'up':'down'}">${pct(c)}</em>${marketArea(x)==='해외'?`<small class="local-quote">${localPriceText(x)}</small>`:''}</button>`}).join('')}</div>
  </aside>`;
}

function renderCorporateMarketBridge(s){
  const my=state.companyAvailable!==false?state.company?.my_company:null;
  if(!my)return '';
  const same=String(my.sector||'')===String(s.sector||'');
  const overseas=marketArea(s)==='해외';
  const impact=same?'동종업종: 보유하면 기술·운영 시너지':overseas?'해외종목: 글로벌 시장정보·기관 관심 상승':'재무투자: 손익과 집중도가 신용·투자심리에 반영';
  return `<div class="market-company-bridge"><div><small>COMPANY LINK · ${escapeHtml(my.ticker)}</small><b>이 종목을 회사 전략자산으로 활용할 수 있습니다</b><span>${escapeHtml(impact)} · 법인현금 ${compactMoney(my.cash)}원 · 운용위험 ${Number(my.treasury_risk||0).toFixed(0)}</span></div><label>법인 예산<input id="quickCorpAmount" type="number" min="1000000" step="10000000" value="50000000"></label><div class="market-company-actions"><button data-company-quick-market-side="BUY">법인 전략매수</button><button data-company-quick-market-side="SELL" class="sell">법인 매도</button><button data-main-tab="company" class="ghost">CEO실</button></div></div>`;
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
        <h1>${escapeHtml(s.name)}</h1>
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
  const form=document.getElementById('companyCreateForm');
  return !!(form&&document.activeElement&&form.contains(document.activeElement));
}
function companyMarketStatus(m){
  const p=Number(m?.presence||0);
  return p>=70?'핵심시장':p>=40?'성장시장':p>=15?'진입시장':'시험진출';
}
function renderCompanyCreate(){
  const rivals=(state.company?.companies||[]).filter(c=>c&&c.status!=='INACTIVE').sort((a,b)=>Number(b.valuation)-Number(a.valuation)).slice(0,10);
  const draft=state.companyDraft||{name:'',sector:'AI·반도체'};
  return `<main class="page-view company-page"><section class="panel page-panel company-shell">
    <div class="company-hero">
      <div class="company-hero-copy"><small>KX CORPORATE · STARTUP</small><h1>내 회사를 설립하고 온라인 기업시장에 들어가세요</h1><p>플레이어는 작은 신생기업으로 시작합니다. 이미 시장에는 수백억~수천조원 규모의 BOT 기업과 다른 실제 유저 회사가 존재하며, 경영·투자·M&A를 통해 장기간 따라잡는 구조입니다.</p>
        <div class="company-start-rules"><span><b>초기 법인자금</b> 10억원</span><span><b>시작시장</b> 대한민국</span><span><b>경쟁상대</b> BOT + 실제 유저 회사</span><span><b>목표</b> 작은 회사 → 글로벌 대기업</span></div>
      </div>
      <form id="companyCreateForm" class="company-create-card">
        <small>NEW COMPANY</small><h2>회사 설립</h2>
        <label>회사 이름<input id="companyName" maxlength="40" value="${escapeHtml(draft.name||'')}" placeholder="예: 아스트라 테크놀로지" autocomplete="off" required></label>
        <label>주력 산업<select id="companySector"><option ${draft.sector==='AI·반도체'?'selected':''}>AI·반도체</option><option ${draft.sector==='게임·콘텐츠'?'selected':''}>게임·콘텐츠</option><option ${draft.sector==='모빌리티'?'selected':''}>모빌리티</option><option ${draft.sector==='바이오'?'selected':''}>바이오</option><option ${draft.sector==='핀테크'?'selected':''}>핀테크</option><option ${draft.sector==='유통'?'selected':''}>유통</option><option ${draft.sector==='에너지'?'selected':''}>에너지</option><option ${draft.sector==='로보틱스'?'selected':''}>로보틱스</option><option ${draft.sector==='산업재·자동화'?'selected':''}>산업재·자동화</option><option ${draft.sector==='기술·서비스'?'selected':''}>기술·서비스</option></select></label>
        <div class="auto-ticker-note"><b>상장 식별코드는 자동 발급</b><span>종목 코드는 플레이어가 입력하지 않아도 됩니다. 서버가 회사별 고유 코드를 자동으로 생성합니다.</span></div>
        <button class="company-primary" type="submit">회사 설립하고 경영 시작</button>
        <p id="companyCreateMsg">회사 이름은 최대 40자까지 입력할 수 있으며, 입력 중 온라인 동기화가 발생해도 내용이 끊기지 않도록 유지됩니다.</p>
      </form>
    </div>
    <section class="company-preview">
      <div class="company-section-head"><div><small>ONLINE COMPANY LEAGUE</small><h2>이미 시장에서 움직이는 회사</h2></div><span>초록색은 내 회사, 파란색은 실제 다른 유저, 금색은 BOT 회사로 표시됩니다.</span></div>
      <div class="company-legend"><span class="legend-me">내 회사</span><span class="legend-player">실제 유저 회사</span><span class="legend-bot">BOT 회사</span><em>기업가치는 현실의 회사 규모를 참고한 게임용 스케일입니다.</em></div>
      <div class="company-rival-grid">${rivals.map((c,i)=>{const type=companyOperatorType(c);return `<article class="operator-${type.toLowerCase()}"><div>${companyTypeBadge(c)} ${companyCountryBadge(c)}</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.sector)} · ${companyOwnerLabel(c)}</p><strong>${compactMoney(c.valuation)}원</strong><span>${companyScaleLabel(c.valuation)} · 가치 순위 #${i+1}</span></article>`}).join('')}</div>
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
  const c=state.company?.control_case;
  if(!c)return '';
  const stake=Number(c.stake||0),left=Math.max(0,Number(c.cycles_left||0));
  const defense=Number(my.defense_power||c.defense_power||0),counter=Number(c.counter_stake||0);
  const meta=takeoverStageMeta(c.stage,stake);
  const progress=Math.min(100,Math.max(2,stake/50*100));
  const actions=[
    ['BUYBACK','긴급 자사주 매입','시장에 직접 자금을 투입해 공격 기업 지분 일부를 되사옵니다.','즉시 지분↓'],
    ['NEGOTIATE','지분 매각 협상','공격 기업에 프리미엄을 제시해 보유지분 일부를 직접 되사옵니다.','비용↑ / 효과↑'],
    ['WHITE_KNIGHT','백기사 확보','우호 투자자와 의결권 협약을 맺어 추가 인수의 효율을 낮춥니다.','방어력 크게↑'],
    ['POISON_PILL','포이즌필 발동','추가 인수 비용을 크게 높입니다. 강력하지만 주주 반발과 경영 부담이 생깁니다.','강력 / 1회'],
    ['RIGHTS_ISSUE','긴급 유상증자','신주를 발행해 공격 기업의 지분율을 희석하고 동시에 현금을 확보합니다.','희석 / 1회'],
    ['COUNTER_TAKEOVER','역인수·맞지분','오히려 공격 기업의 지분을 사들여 협상 카드를 만들고 상대를 압박합니다.','공격적 방어']
  ];
  return `<section class="takeover-crisis ${meta[1]}">
    <div class="takeover-crisis-head">
      <div><small>BOARD EMERGENCY · HOSTILE TAKEOVER</small><h2>${meta[0]}</h2><p>${escapeHtml(meta[2])}</p></div>
      <div class="takeover-alarm"><span>공격 기업</span><b>${escapeHtml(c.attacker_name||'-')}</b><small>${escapeHtml(c.attacker_country||'')} · ${escapeHtml(c.attacker_type||'')} · ${escapeHtml(c.attacker_ticker||'')}</small></div>
    </div>
    <div class="takeover-pressure-grid">
      <article><small>상대 확보 지분</small><b>${stake.toFixed(2)}%</b><span>50% 이상이면 경영권 인수</span></article>
      <article><small>남은 대응 라운드</small><b>${left}</b><span>${left<=4?'최종 공개매수 임박':left<=8?'대응을 서둘러야 합니다':'아직 방어전략을 고를 시간이 있습니다'}</span></article>
      <article><small>경영권 방어력</small><b>${defense.toFixed(0)}</b><span>높을수록 상대의 추가 매입 효율 감소</span></article>
      <article><small>상대 회사 맞지분</small><b>${counter.toFixed(2)}%</b><span>10% 이상이면 역인수 협상 압박 효과</span></article>
    </div>
    <div class="takeover-progress"><div class="takeover-progress-label"><span>${escapeHtml(c.attacker_name||'공격 기업')} 지분</span><b>${stake.toFixed(2)}% / 50%</b></div><div class="takeover-progress-track"><i style="width:${progress}%"></i><em></em></div><small>방어를 하지 않으면 BOT이 인수전 마감 시 프리미엄을 붙인 최종 공개매수를 시도할 수 있습니다.</small></div>
    <div class="takeover-board-note"><b>긴급 이사회</b><span>한 라운드에 하나의 방어 결정만 실행할 수 있습니다. 모든 선택에는 현금, 브랜드, 지분 희석 등 서로 다른 대가가 있습니다.</span><label>이번 대응 예산<input id="takeoverDefenseBudget" type="number" min="40000000" step="10000000" value="150000000"></label></div>
    <div class="takeover-defense-grid">${actions.map(a=>{const used=(a[0]==='POISON_PILL'&&c.used_poison_pill)||(a[0]==='RIGHTS_ISSUE'&&c.used_rights_issue);return `<button data-company-defense="${a[0]}" ${used?'disabled':''}><small>${a[3]}</small><b>${a[1]}</b><span>${used?'이번 인수전에서 이미 사용함':a[2]}</span></button>`}).join('')}</div>
  </section>`;
}

function renderCompanyCommand(my){
  const amount=100000000;
  const actions=[
    ['RND','R&D 투자','기술력·제품경쟁력 상승','기술'],
    ['QUALITY','품질·안전 투자','제품력·고객신뢰 상승, 리콜 위험 감소','제품'],
    ['CAPEX','설비 투자','운영·생산력·고용 확대','생산'],
    ['HIRING','핵심 인재 채용','인력·기술·운영 강화','인재'],
    ['WELFARE','복지·보상 강화','직원 사기와 생산성 상승','조직'],
    ['MARKETING','마케팅','브랜드·시장점유율 상승','영업'],
    ['PRICE_WAR','가격 경쟁','점유율 상승, 이익·브랜드 부담','공격'],
    ['COSTCUT','구조조정','현금흐름 개선, 사기·브랜드 부담','방어'],
    ['DIVIDEND','배당 실시','주주 신뢰·투자수요 상승, 현금 감소','주주'],
    ['COMPLIANCE','준법·감사 투자','컴플라이언스·신용도 상승, 규제 위험 감소','준법'],
    ['LOAN','기업 대출','현금 확보, 부채·신용 부담 증가','조달'],
    ['REPAY','부채 상환','재무 안정성·신용도 개선','재무']
  ];
  return `<section class="corp-section ceo-command-section">
    <div class="company-section-head"><div><small>01 · CEO OFFICE</small><h2>CEO 경영 의사결정</h2></div><span>매출만 올리는 버튼이 아니라 제품·사람·주주·규제·재무가 서로 연결됩니다.</span></div>
    <div class="corp-action-bar"><label>기본 집행금액<input id="companyActionAmount" type="number" min="10000000" step="10000000" value="${amount}"></label><span>현재 법인현금 <b>${won(my.cash)}</b></span><span>신용점수 <b>${Number(my.credit_score||65).toFixed(0)}</b></span></div>
    <div class="corp-action-grid management-grid">${actions.map(a=>`<button data-company-action="${a[0]}" class="${['PRICE_WAR','LOAN','COSTCUT'].includes(a[0])?'risk':''}"><small>${a[3]}</small><b>${a[1]}</b><span>${a[2]}</span></button>`).join('')}</div>
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
  const campaigns=state.company?.media_campaigns||[];
  const outlets=[
    ['ECON_DAILY','KX 경제일보','국내 기관·개인 투자자','보수적이고 안정적인 노출'],
    ['BIZ_TV','비즈니스24','대중·개인 투자자','도달률이 높고 브랜드 효과가 큼'],
    ['GLOBAL_WIRE','Global Finance Wire','해외 기관·글로벌 투자자','비싸지만 해외 수요에 강함'],
    ['EDGE_MEDIA','EDGE 미디어','온라인·단기 매매 투자자','반응이 크지만 역풍 가능성도 큼']
  ];
  return `<section class="corp-section media-desk-section">
    <div class="company-section-head"><div><small>02 · MEDIA / IR</small><h2>언론·IR 전략</h2></div><span>광고·협찬임을 밝힌 기업 PR/IR 캠페인입니다. 성공하면 BOT 투자수요가 늘지만 과한 홍보는 역풍이 날 수 있습니다.</span></div>
    <div class="media-summary"><span>투자자 심리 <b>${Number(my.investor_sentiment||50).toFixed(0)}</b></span><span>미디어 평판 <b>${Number(my.media_reputation||50).toFixed(0)}</b></span><span>현재 기사 모멘텀 <b>${Number(my.media_momentum||0).toFixed(0)}</b></span><span>기관 관심도 <b>${Number(my.institutional_interest||35).toFixed(0)}</b></span></div>
    <div class="media-controls"><label>기사/PR 예산<input id="companyMediaBudget" type="number" min="20000000" step="10000000" value="70000000"></label><label>콘텐츠 유형<select id="companyMediaCampaign"><option value="IR_INTERVIEW">CEO·실적 IR 인터뷰</option><option value="PRODUCT_FEATURE">신제품·기술 특집</option><option value="GLOBAL_ROADSHOW">글로벌 투자자 로드쇼</option><option value="AGGRESSIVE_SPIN">공격적 이미지 메이킹</option></select></label></div>
    <div class="media-outlet-grid">${outlets.map(o=>`<button data-company-media="${o[0]}"><small>${o[2]}</small><b>${o[1]}</b><span>${o[3]}</span></button>`).join('')}</div>
    <div class="media-campaign-history"><h3>최근 보도·IR 집행</h3>${campaigns.length?campaigns.slice(0,6).map(c=>`<article><span><b>${escapeHtml(c.outlet_name)}</b><small>${escapeHtml(c.campaign_label||c.campaign_type)}</small></span><strong>${compactMoney(c.budget)}원</strong><em>${Number(c.sentiment_impact)>=0?'+':''}${Number(c.sentiment_impact||0).toFixed(1)} 투자심리</em></article>`).join(''):`<div class="empty compact">아직 집행한 언론·IR 캠페인이 없습니다.</div>`}</div>
  </section>`;
}

function renderTaxOffice(my){
  const due=Number(my.tax_due||0),arrears=Number(my.tax_arrears||0),risk=Number(my.audit_risk||0);
  const recs=state.company?.tax_records||[];
  return `<section class="corp-section tax-office-section">
    <div class="company-section-head"><div><small>03 · TAX / COMPLIANCE</small><h2>세금·세무 리스크</h2></div><span>게임에서는 분기 결산을 압축해 진행하며, 흑자에 단순화된 22% 법인세가 부과됩니다.</span></div>
    <div class="tax-ledger">
      <article><small>이번 고지세액</small><b>${compactMoney(due)}원</b><span>${due>0?'납부·절세검토·분납·신고누락 중 선택':'현재 납부할 고지 없음'}</span></article>
      <article class="${arrears>0?'danger':''}"><small>미납·추징 대상</small><b>${compactMoney(arrears)}원</b><span>오래 둘수록 조사 위험과 가산 부담 증가</span></article>
      <article class="${risk>=45?'danger':risk>=22?'warn':''}"><small>세무조사 위험</small><b>${risk.toFixed(0)}</b><span>${companyRiskLabel(risk)}</span></article>
      <article><small>준법 / 지배구조</small><b>${Number(my.compliance||75).toFixed(0)} / ${Number(my.governance||50).toFixed(0)}</b><span>낮으면 투자자·은행·규제기관 신뢰 하락</span></article>
    </div>
    <div class="tax-actions">
      <button data-company-tax="PAY" ${due+arrears<=0?'disabled':''}><small>정상 처리</small><b>세금 납부</b><span>고지세액과 미납액을 정리하고 신뢰를 높입니다.</span></button>
      <button data-company-tax="PLAN" ${due<=0?'disabled':''}><small>합법적 절세</small><b>세무 검토·절세</b><span>세무비용을 들여 납부세액을 일부 줄입니다.</span></button>
      <button data-company-tax="INSTALLMENT" ${due<=0?'disabled':''}><small>현금흐름</small><b>분할 납부</b><span>당장 현금을 아끼지만 잔액과 가산 부담이 남습니다.</span></button>
      <button data-company-tax="EVADE" class="risk" ${due<=0?'disabled':''}><small>불법·고위험</small><b>신고 누락 시도</b><span>당장은 세금을 피하지만 적발 시 추징·과징금·평판·거래 제한이 발생할 수 있습니다.</span></button>
      <button data-company-tax="CORRECT" ${arrears<=0?'disabled':''}><small>위기 수습</small><b>자진 정정</b><span>미납 상태를 스스로 정리해 향후 조사 위험을 낮춥니다.</span></button>
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

function renderCompetitionBoard(my){
  const all=(state.company?.companies||[]).filter(c=>Number(c.id)!==Number(my.id));
  const rows=all.filter(c=>state.companyRegion==='국내'?c.home_country==='대한민국':(c.home_country!=='대한민국'||Number(c.global_level)>0||Number(c.global_share)>0))
    .sort((a,b)=>Number(b.valuation)-Number(a.valuation)).slice(0,16);
  const myRank=[...(state.company?.companies||[])].sort((a,b)=>Number(b.valuation)-Number(a.valuation)).findIndex(c=>Number(c.id)===Number(my.id))+1;
  return `<section class="corp-section competition-section acquisition-market">
    <div class="company-section-head"><div><small>COMPANY MARKET</small><h2>${state.companyRegion==='국내'?'국내 기업':'글로벌 기업'} 투자·인수</h2></div><span>회사 가치 순위 <b>#${myRank||'-'}</b> · 법인현금 <b>${compactMoney(my.cash)}원</b></span></div>
    <div class="company-region-tabs"><button data-company-region="국내" class="${state.companyRegion==='국내'?'on':''}">국내 기업</button><button data-company-region="해외" class="${state.companyRegion==='해외'?'on':''}">해외 기업</button></div>
    <div class="acquisition-cards">
      ${rows.length?rows.map((c,i)=>{const stake=Number(c.acquired_stake||0),stage=acquisitionStage(stake),controlled=Number(c.parent_company_id)===Number(my.id)||stake>=50,type=companyOperatorType(c),gap=Number(c.valuation)/Math.max(1,Number(my.valuation));return `<article class="acquisition-card ${stage.cls} ${controlled?'controlled':''} operator-${type.toLowerCase()}">
        <div class="acq-company-head"><span><b>${escapeHtml(c.name)}</b><small>${companyTypeBadge(c)} ${companyCountryBadge(c)} · ${escapeHtml(c.sector)} · ${companyOwnerLabel(c)}</small></span><em>#${i+1}</em></div>
        <div class="acq-value"><span><small>회사 가치</small><b>${compactMoney(c.valuation)}원</b><em>${companyScaleLabel(c.valuation)}</em></span><span><small>내 회사 대비</small><b>${gap>=1?`${gap.toFixed(gap>=100?0:1)}배`:`${(gap*100).toFixed(0)}%`}</b><em>${gap>20?'장기 성장 목표':gap>5?'상당한 규모 차이':'경쟁 가능한 규모'}</em></span><span><small>${state.companyRegion==='국내'?'국내':'글로벌'} 점유율</small><b>${Number(state.companyRegion==='국내'?c.domestic_share:c.global_share).toFixed(2)}%</b></span></div>
        <div class="acq-stake"><div><small>내 보유지분</small><b>${stake.toFixed(2)}%</b><em>${stage.label}</em></div><div class="acq-progress"><i style="width:${Math.min(100,stake/50*100)}%"></i></div><span>${controlled?'경영권 확보 완료 · 자회사':stage.desc}</span></div>
        <div class="acq-actions"><label>인수 예산<input id="takeBudget_${c.id}" type="number" min="1000000" step="10000000" value="100000000"></label><button data-company-buy="${c.id}">장내 지분 매수</button><button data-company-tender="${c.id}" class="tender" ${stake<15||controlled?'disabled':''}>공개매수</button></div>
        <small class="acq-note">${controlled?'이미 경영권을 확보했습니다. 보유지분은 아래 지분 관리에서 매각할 수 있습니다.':stake>=15?'공개매수 가능 · 시장가격보다 프리미엄을 지급해 더 많은 지분을 한 번에 확보합니다.':'15% 이상 확보하면 공개매수가 열립니다.'}</small>
      </article>`}).join(''):`<div class="empty">표시할 경쟁사가 없습니다.</div>`}
    </div>
  </section>`;
}

function renderGlobalExpansion(my){
  const countries=[
    ['US','미국','세계 최대 소비·기술시장','높은 비용 / 높은 성장'],
    ['JP','일본','제조·콘텐츠·로봇 강국','품질 경쟁'],
    ['DE','독일','유럽 산업 중심시장','기술·신뢰 경쟁'],
    ['SG','싱가포르','동남아 금융·허브','글로벌 진출 거점'],
    ['GB','영국','금융·콘텐츠 시장','브랜드 경쟁'],
    ['IN','인도','고성장 대형시장','가격·규모 경쟁'],
    ['BR','브라질','남미 핵심시장','성장성 높은 시장']
  ];
  const markets=state.company?.my_markets||[];
  return `<section class="corp-section">
    <div class="company-section-head"><div><small>03 · GLOBAL EXPANSION</small><h2>해외 진출</h2></div><span>해외에 진출하면 글로벌 매출과 점유율이 생기고 해외 BOT들과 직접 경쟁합니다.</span></div>
    <div class="global-budget"><label>진출 투자금<input id="companyExpansionBudget" type="number" min="80000000" step="10000000" value="200000000"></label><span>글로벌 레벨 <b>${Number(my.global_level||0)}/5</b> · 글로벌 점유율 <b>${Number(my.global_share||0).toFixed(2)}%</b></span></div>
    <div class="global-country-grid">${countries.map(x=>{const m=markets.find(m=>m.country_code===x[0]);return `<article class="${m?'entered':''}"><div><span>${x[0]}</span>${m?`<b>${companyMarketStatus(m)}</b>`:'<b>미진출</b>'}</div><h3>${x[1]}</h3><p>${x[2]}</p><small>${m?`현지 영향력 ${Number(m.presence).toFixed(0)} · 점유율 ${Number(m.market_share).toFixed(2)}%`:x[3]}</small><button data-company-expand="${x[0]}">${m?'추가 투자':'시장 진출'}</button></article>`}).join('')}</div>
  </section>`;
}

function renderTakeoverDesk(my){
  const mine=state.company?.my_holdings||[];
  const incoming=state.company?.incoming_holdings||[];
  const threat=companyStakeAgainstMe();
  return `<section class="corp-section takeover-section">
    <div class="company-section-head"><div><small>04 · M&A / CONTROL</small><h2>지분 인수와 경영권</h2></div><span>한 기업이 50% 이상을 확보하면 해당 회사가 자회사로 편입됩니다.</span></div>
    <div class="takeover-summary">
      <article class="${threat>=35?'danger':threat>=15?'warn':''}"><small>내 회사 외부 보유지분</small><b>${threat.toFixed(2)}%</b><span>${threat>=50?'경영권이 인수된 상태':threat>=35?'경영권 방어가 필요한 수준':threat>=15?'인수 움직임을 주시할 수준':'현재 경영권은 비교적 안정적'}</span></article>
      <article><small>내가 투자한 경쟁사</small><b>${mine.length}개</b><span>지분을 쌓아 50%를 넘기면 자회사 편입</span></article>
      <article><small>현재 지배기업</small><b>${escapeHtml(my.parent_name||'없음')}</b><span>${my.parent_name?'방어로 상대 지분을 50% 아래로 낮추면 독립 회복 가능':'독립 경영 상태'}</span></article>
      <article class="${Number(my.defense_power||0)>=20?'safe':''}"><small>경영권 방어력</small><b>${Number(my.defense_power||0).toFixed(0)}</b><span>백기사·포이즌필 등으로 상승하며 시간이 지나면 서서히 약해집니다.</span></article>
    </div>
    <div class="takeover-columns">
      <div><h3>내 회사에 들어온 지분</h3>${incoming.length?incoming.map(h=>`<div class="stake-row"><span><b>${escapeHtml(h.holder_name)}</b><small>${escapeHtml(h.holder_type)} · ${escapeHtml(h.holder_ticker)}</small></span><strong class="${Number(h.stake)>=25?'down':''}">${Number(h.stake).toFixed(2)}%</strong><em>${compactMoney(h.market_value)}원</em></div>`).join(''):`<div class="empty compact">아직 외부 기업이 내 회사 지분을 확보하지 않았습니다.</div>`}</div>
      <div><h3>내 회사가 보유한 경쟁사 지분</h3>${mine.length?mine.map(h=>`<div class="stake-row owned"><span><b>${escapeHtml(h.target_name)}</b><small>${escapeHtml(h.target_ticker)} · ${escapeHtml(h.target_country)}</small></span><strong>${Number(h.stake).toFixed(2)}%</strong><em>${compactMoney(h.market_value)}원</em><button data-company-sell="${h.target_company_id}">일부 매각</button></div>`).join(''):`<div class="empty compact">아직 인수한 경쟁사 지분이 없습니다.</div>`}</div>
    </div>
  </section>`;
}

function renderCorporateMarket(my){
  const opts=(state.company?.stock_options||[]).slice(0,80);
  const holdings=state.company?.market_holdings||[];
  const pv=holdings.reduce((a,h)=>a+Number(h.market_value||0),0),pp=holdings.reduce((a,h)=>a+Number(h.pnl||0),0);
  return `<section class="corp-section corporate-market strategic-treasury">
    <div class="company-section-head"><div><small>07 · STRATEGIC TREASURY</small><h2>법인 전략투자·증권 운용</h2></div><span>이제 주식은 단순 돈벌이가 아닙니다. 동종산업·해외기업 투자는 기술·시장정보를 얻고, 손실·과도한 집중은 신용도와 투자심리를 떨어뜨립니다.</span></div>
    <div class="treasury-impact"><article><small>포트폴리오 가치</small><b>${compactMoney(pv)}원</b></article><article><small>평가손익</small><b class="${pp>=0?'up':'down'}">${pp>=0?'+':''}${compactMoney(pp)}원</b></article><article><small>운용 위험</small><b>${Number(my.treasury_risk||0).toFixed(0)}</b></article><article><small>신용점수</small><b>${Number(my.credit_score||65).toFixed(0)}</b></article></div>
    <div class="treasury-trade">
      <label>전략 투자 종목<select id="corpStockTicker">${opts.map(s=>`<option value="${s.ticker}">${s.market_area==='해외'?'[해외]':'[국내]'} ${escapeHtml(s.name)} · ${escapeHtml(s.sector)} · ${won(s.last_price)}</option>`).join('')}</select></label>
      <label>거래금액<input id="corpStockAmount" type="number" min="10000" step="10000" value="50000000"></label>
      <div><button data-company-market-side="BUY">법인 매수</button><button data-company-market-side="SELL" class="sell">법인 매도</button></div>
    </div>
    <div class="treasury-rule"><b>경영 영향</b><span>동종업종 보유 → 기술·운영 시너지</span><span>해외 종목 보유 → 글로벌 시장정보·기관 관심 증가</span><span>수익 → 투자자 심리·신용 상승</span><span>대규모 손실/집중 → 신용·주가 압박</span></div>
    <div class="treasury-holdings">${holdings.length?holdings.map(h=>`<article><div><b>${escapeHtml(h.name)}</b><small>${escapeHtml(h.ticker)} · ${escapeHtml(h.market_area)} ${escapeHtml(h.market_country||'')} · ${escapeHtml(h.sector||'')}</small></div><span>${nf.format(Number(h.shares))}주</span><strong>${compactMoney(h.market_value)}원</strong><em class="${Number(h.pnl)>=0?'up':'down'}">${Number(h.pnl)>=0?'+':''}${compactMoney(h.pnl)}원</em></article>`).join(''):`<div class="empty compact">회사 자금으로 보유한 전략투자가 없습니다.</div>`}</div>
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
  return `<div class="company-mode-banner online compact-online-banner"><div><span class="online-live-dot">LIVE</span><b>온라인 기업 리그</b><span>유저 회사와 BOT 기업의 경영·지분·인수 데이터가 같은 서버에서 진행됩니다.</span></div></div>`;
}
function renderCompanyOnlineRequired(){
  const err=escapeHtml(state.companyError||'온라인 회사 서버에 연결할 수 없습니다.');
  return `<main class="page-view company-page"><section class="panel page-panel company-shell connection-repair-shell">
    <div class="connection-repair-card">
      <div class="connection-repair-icon">!</div>
      <div class="connection-repair-copy"><small>ONLINE COMPANY SERVER</small><h1>회사 서버 연결을 복구해 주세요</h1><p>${err}</p></div>
      <button data-company-retry class="company-primary">연결 다시 확인</button>
    </div>
    <div class="repair-steps"><article><b>1</b><span><strong>이번 패치의 SQL 실행</strong><small><code>KX_CORPORATE_V5_REPAIR.sql</code> 전체를 Supabase SQL Editor에서 한 번 실행합니다.</small></span></article><article><b>2</b><span><strong>페이지 새로고침 없이 확인</strong><small>위의 ‘연결 다시 확인’을 누르면 새 RPC를 바로 다시 검사합니다.</small></span></article><article><b>3</b><span><strong>온라인 모드만 사용</strong><small>로컬 BOT 모드로 전환하지 않으며 모든 회사 데이터는 서버에 저장됩니다.</small></span></article></div>
    <div class="repair-detail"><b>현재 오류</b><code>${err}</code><span>기존 V4/V4.1 SQL을 이미 실행했더라도 이번 복구 SQL을 다시 실행해도 됩니다. 기존 회사 데이터는 삭제하지 않습니다.</span></div>
  </section></main>`;
}

function renderCompanySubnav(){
  return '';
}
function renderExecutiveAgenda(my){
  const issues=[];
  const t=state.company?.control_case;if(t)issues.push(['critical','경영권 방어 비상',`${escapeHtml(t.attacker_name||'경쟁사')} 지분 ${Number(t.stake||0).toFixed(1)}% · 즉시 이사회 대응 필요`,'competition']);
  if(Number(my.tax_due||0)+Number(my.tax_arrears||0)>0)issues.push(['warn','법인세 의사결정',`납부·미납/추징 대상 ${compactMoney(Number(my.tax_due||0)+Number(my.tax_arrears||0))}원`,'risk']);
  if(Number(my.employee_morale||60)<45)issues.push(['warn','핵심 인력 이탈 위험',`직원 사기 ${Number(my.employee_morale||0).toFixed(0)} · 복지/보상 또는 조직투자 필요`,'operations']);
  if(Number(my.product_quality||50)<52)issues.push(['warn','제품 품질 리스크',`제품력 ${Number(my.product_quality||0).toFixed(0)} · 리콜과 고객 신뢰 하락 가능성`,'operations']);
  if(Number(my.cash||0)<Math.max(120000000,Number(my.revenue||0)*.12))issues.push(['warn','현금흐름 주의',`법인 현금 ${compactMoney(my.cash)}원 · 투자/세금/M&A 대응 여력이 낮습니다.`,'competition']);
  if(Number(my.global_level||0)<2&&Number(my.valuation||0)>2400000000)issues.push(['opportunity','해외 진출 기회',`기업 규모에 비해 해외 사업 비중이 낮습니다. 글로벌 성장을 검토할 수 있습니다.`,'global']);
  if(Number(my.media_reputation||50)<45||Number(my.investor_sentiment||50)<45)issues.push(['opportunity','IR·평판 회복 필요',`미디어 평판 ${Number(my.media_reputation||0).toFixed(0)} · 투자자 심리 ${Number(my.investor_sentiment||0).toFixed(0)}`,'risk']);
  if(!issues.length)issues.push(['stable','경영 상태 안정','긴급 안건은 없습니다. 경쟁사 투자·해외진출·R&D 중 다음 성장 전략을 선택하세요.','operations']);
  return `<section class="executive-agenda"><div class="company-section-head"><div><small>BOARD AGENDA</small><h2>오늘의 이사회 안건</h2></div><span>주가를 보는 대신 지금 회사에서 해결해야 할 문제와 기회를 먼저 보여줍니다.</span></div><div class="agenda-grid">${issues.slice(0,6).map((x,i)=>`<button class="agenda-card ${x[0]}" data-company-section-jump="${x[3]}"><span>${i+1<10?'0':''}${i+1}</span><div><b>${x[1]}</b><small>${x[2]}</small></div><em>검토 →</em></button>`).join('')}</div></section>`;
}
function renderRivalSnapshot(my){
  const rivals=(state.company?.companies||[]).filter(x=>Number(x.id)!==Number(my.id)).sort((a,b)=>Number(b.valuation)-Number(a.valuation)).slice(0,6);
  return `<section class="executive-rivals"><div class="company-section-head"><div><small>COMPETITIVE INTELLIGENCE</small><h2>주요 경쟁사 동향</h2></div><button data-company-section-jump="competition" class="section-link">경쟁·M&A 전체 보기</button></div><div class="executive-rival-list">${rivals.map((r,i)=>{const ratio=Number(r.valuation)/Math.max(1,Number(my.valuation))*100;return `<article><strong>${i+1}</strong><div><b>${escapeHtml(r.name)}</b><small>${escapeHtml(r.home_country)} · ${escapeHtml(r.sector)} · ${companyOwnerLabel(r)}</small></div><span>${compactMoney(r.valuation)}원</span><em class="${ratio>120?'down':ratio<80?'up':''}">${ratio.toFixed(0)}%</em></article>`}).join('')}</div></section>`;
}
function renderCompanyWorkspace(my){
  const section=state.companySection||'dashboard';
  if(section==='operations')return `${renderCompanyCommand(my)}${renderCompanyPulse(my)}`;
  if(section==='competition')return `${renderTakeoverCrisis(my)}${renderAcquisitionGuide(my)}${renderCompetitionBoard(my)}${renderTakeoverDesk(my)}${renderCorporateMarket(my)}`;
  if(section==='global')return `${renderGlobalExpansion(my)}${renderRivalSnapshot(my)}`;
  if(section==='risk')return `${renderMediaDesk(my)}${renderTaxOffice(my)}${renderCompanyEvents()}`;
  return `${renderTakeoverCrisis(my)}${renderExecutiveAgenda(my)}${renderCompanyPulse(my)}${renderRivalSnapshot(my)}${renderCompanyEvents()}`;
}

function renderCompanyRoom(){
  if(state.companyAvailable===false)return renderCompanyOnlineRequired();
  const my=state.company?.my_company;
  if(!my)return `${renderCompanyModeBanner()}${renderCompanyCreate()}`;
  const grow=companyGrowth(my),margin=companyProfitMargin(my),debt=companyDebtRatio(my),threat=companyStakeAgainstMe();
  return `<main class="page-view company-page"><section class="panel page-panel company-shell management-first-shell">
    ${renderCompanyModeBanner()}
    <div class="company-topline management-topline">
      <div><small>MANAGEMENT HQ · ${escapeHtml(my.ticker)}</small><h1>${escapeHtml(my.name)}</h1><p>${escapeHtml(my.sector)} · 본사 ${escapeHtml(my.home_country)} · ${my.parent_name?`${escapeHtml(my.parent_name)} 계열사`:'독립 경영'} · 경영주기 #${Number(state.company?.world?.cycle_no||0)}</p></div>
      <div class="company-value-hero"><small>회사 가치</small><b>${compactMoney(my.valuation)}원</b><span>법인현금 ${compactMoney(my.cash)}원 · 주당가치 ${won(my.share_price)}</span></div>
    </div>
    <div class="company-kpi-grid management-kpis">
      <article><small>매출</small><b>${compactMoney(my.revenue)}원</b><span class="${grow>=0?'up':'down'}">전기 대비 ${pct(grow)}</span></article>
      <article><small>영업이익</small><b class="${Number(my.profit)>=0?'up':'down'}">${compactMoney(my.profit)}원</b><span>이익률 ${margin.toFixed(1)}%</span></article>
      <article><small>법인 현금</small><b>${compactMoney(my.cash)}원</b><span>운영·세금·투자·M&A 재원</span></article>
      <article><small>부채 / 신용</small><b>${compactMoney(my.debt)}원</b><span>부채비율 ${debt.toFixed(1)}% · 신용 ${Number(my.credit_score||65).toFixed(0)}</span></article>
      <article><small>국내 점유율</small><b>${Number(my.domestic_share||0).toFixed(2)}%</b><span>브랜드 ${Number(my.brand||0).toFixed(0)}</span></article>
      <article><small>글로벌 점유율</small><b>${Number(my.global_share||0).toFixed(2)}%</b><span>진출 레벨 ${Number(my.global_level||0)}/5</span></article>
      <article><small>조직 상태</small><b>${Number(my.employee_morale||0).toFixed(0)}</b><span>직원 사기 · ${nf.format(Number(my.employees||0))}명</span></article>
      <article class="${threat>=35?'danger':''}"><small>경영권 위험</small><b>${threat.toFixed(2)}%</b><span>${threat>=35?'적대적 인수 대응 필요':'경영권 안정'}</span></article>
    </div>
    <div class="company-stat-strip"><span>기술력 <b>${Number(my.technology).toFixed(0)}</b></span><span>제품력 <b>${Number(my.product_quality).toFixed(0)}</b></span><span>운영 <b>${Number(my.operations).toFixed(0)}</b></span><span>고객신뢰 <b>${Number(my.customer_trust||0).toFixed(0)}</b></span><span>투자자심리 <b>${Number(my.investor_sentiment||0).toFixed(0)}</b></span><span>준법 <b>${Number(my.compliance||0).toFixed(0)}</b></span><span>최근 이슈 <b>${escapeHtml(my.last_event||'-')}</b></span></div>
    ${state.companyNotice?`<div class="company-notice" id="companyMsg">${escapeHtml(state.companyNotice)}</div>`:`<div class="company-notice muted" id="companyMsg">경영실에서는 사업·조직·현금·세금·경영권을 한눈에 관리합니다.</div>`}
    ${renderCompanySubnav()}
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
  if(companies.length){
    return `<main class="page-view narrow-view"><section class="panel page-panel company-ranking-page"><div class="page-title"><div><small>CORPORATE LEAGUE</small><h1>회사 가치 순위</h1></div><span>주식 계좌 수익이 아니라 회사 자체의 가치와 경쟁력을 기준으로 순위를 매깁니다.</span></div><div class="ranklist corporate-ranklist">${companies.map((r,i)=>`<div class="rankrow ${r.operator_type==='ME'||Number(r.id)===Number(state.company?.my_company?.id)?'me':''}"><strong>${i+1}</strong><span><b>${escapeHtml(r.name)}</b><small>${companyTypeBadge(r)} ${escapeHtml(r.home_country||'')} · ${escapeHtml(r.sector||'')} · ${companyOwnerLabel(r)} · ${companyScaleLabel(r.valuation)}</small></span><b>${compactMoney(r.valuation)}원</b></div>`).join('')}</div></section></main>`;
  }
  return `<main class="page-view narrow-view"><section class="panel page-panel"><div class="page-title"><div><small>CORPORATE LEAGUE</small><h1>회사 가치 순위</h1></div><span>회사를 설립하면 국내외 BOT 회사와 기업가치 경쟁이 시작됩니다.</span></div><div class="empty">아직 회사 데이터가 없습니다.</div></section></main>`;
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

function tutorialSteps(){
  return [
    {selector:'[data-company-section-nav="dashboard"]',kicker:'01 · 경영실',title:'회사의 전체 상황부터 확인합니다',text:'매출·현금·조직·세금·경영권 위험을 먼저 보고 오늘의 이사회 안건을 처리합니다.'},
    {selector:'.executive-agenda',kicker:'02 · 이사회',title:'오늘 처리해야 할 경영 안건을 봅니다',text:'품질, 인재, 세금, 현금흐름, 적대적 인수처럼 지금 회사에 가장 중요한 문제와 기회가 자동으로 위에 올라옵니다.'},
    {selector:'[data-company-section-nav="operations"]',kicker:'03 · 사업 운영',title:'제품·인재·생산을 직접 경영합니다',text:'R&D, 품질, 채용, 설비, 복지와 구조조정이 서로 다른 회사 지표에 영향을 줍니다.'},
    {selector:'[data-company-section-nav="competition"]',kicker:'04 · 투자·인수',title:'다른 회사 주식을 사서 경영권을 확보할 수 있습니다',text:'장내 지분 매수에서 시작해 주요 주주가 되고, 공개매수로 50% 이상을 확보하면 상대 회사를 자회사로 편입합니다.'},
    {selector:'[data-main-tab="ranking"]',kicker:'05 · 경쟁',title:'승부는 회사 가치로 확인합니다',text:'회사 가치 순위에서 국내외 BOT과 다른 유저 회사보다 더 큰 기업을 만드는 것이 핵심 목표입니다.'}
  ];
}

function closeTutorial(){
  document.getElementById('kxTutorial')?.remove();
  document.body.classList.remove('tutorial-active');
  window.removeEventListener('resize',window.__kxTourResize||(()=>{}));
  window.removeEventListener('scroll',window.__kxTourResize||(()=>{}),true);
  window.__kxTourResize=null;
}
function startGuidedTour(startIndex=0){
  closeTutorial();
  const steps=tutorialSteps();let index=Math.max(0,Math.min(steps.length-1,Number(startIndex)||0));
  const root=document.createElement('div');root.id='kxTutorial';root.className='guided-tour';
  root.innerHTML=`<div class="tour-focus"></div><section class="tour-bubble" role="dialog" aria-live="polite"><button class="tour-close" aria-label="튜토리얼 닫기">×</button><div class="tour-step"></div><div class="tour-actions"><button data-tour-prev>이전</button><button data-tour-next>다음</button></div></section>`;
  document.body.appendChild(root);document.body.classList.add('tutorial-active');
  const focus=root.querySelector('.tour-focus'),bubble=root.querySelector('.tour-bubble'),stepBox=root.querySelector('.tour-step');
  function visibleTarget(selector){return [...document.querySelectorAll(selector)].find(el=>{const r=el.getBoundingClientRect();return r.width>2&&r.height>2})||document.querySelector(selector)}
  function place(){
    const step=steps[index],target=visibleTarget(step.selector);if(!target)return;
    const r=target.getBoundingClientRect(),pad=7;
    const left=Math.max(6,r.left-pad),top=Math.max(6,r.top-pad),right=Math.min(innerWidth-6,r.right+pad),bottom=Math.min(innerHeight-6,r.bottom+pad);
    focus.style.left=`${left}px`;focus.style.top=`${top}px`;focus.style.width=`${Math.max(20,right-left)}px`;focus.style.height=`${Math.max(20,bottom-top)}px`;
    const bw=Math.min(390,innerWidth-24);bubble.style.width=`${bw}px`;
    const bh=bubble.offsetHeight||210;let bx=Math.min(Math.max(12,left),innerWidth-bw-12);let by=bottom+14;
    if(by+bh>innerHeight-12)by=Math.max(12,top-bh-14);
    if(r.width>innerWidth*.72){bx=Math.max(12,(innerWidth-bw)/2);}
    bubble.style.left=`${bx}px`;bubble.style.top=`${by}px`;
  }
  function draw(){
    const step=steps[index];
    stepBox.innerHTML=`<small>${step.kicker} · ${index+1}/${steps.length}</small><h2>${step.title}</h2><p>${step.text}</p>`;
    root.querySelector('[data-tour-prev]').disabled=index===0;
    root.querySelector('[data-tour-next]').textContent=index===steps.length-1?'튜토리얼 끝내기':'다음';
    const target=visibleTarget(step.selector);if(target){target.scrollIntoView({block:'nearest',inline:'nearest'});setTimeout(place,40)}else setTimeout(place,40);
  }
  root.querySelector('.tour-close').onclick=closeTutorial;
  root.querySelector('[data-tour-prev]').onclick=()=>{if(index>0){index--;draw()}};
  root.querySelector('[data-tour-next]').onclick=()=>{if(index<steps.length-1){index++;draw()}else closeTutorial()};
  window.__kxTourResize=place;window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  draw();
}
function openTutorial(startIndex=0){
  if(state.tab!=='company'){
    state.tab='company';state.companySection='dashboard';renderTerminal();setTimeout(()=>startGuidedTour(startIndex),80);return;
  }
  startGuidedTour(startIndex);
}
function renderTerminal(){
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
  const legalCash=my?won(my.cash):'설립 전';
  const companyValue=my?`${compactMoney(my.valuation)}원`:'설립 전';

  app.innerHTML=`<div class="terminal management-first-terminal">
    <header class="top management-topbar">
      <div class="brand"><div class="kxlogo">KX</div><strong>KX CORPORATE</strong><span class="online-mode-chip ${state.companyAvailable===false?'offline':'online'}">${state.companyAvailable===false?'ONLINE 연결 필요':'ONLINE'}</span></div>
      ${topNav()}
      <div class="market-status corporate-cycle-status"><b>경영주기 #${Number(state.company?.world?.cycle_no||0)}</b><span>DAY ${state.clock?.game_day||1} · ${gameTime(state.clock?.game_minute||0)}</span><em>ONLINE LEAGUE</em></div>
      <div class="header-money company-header-money"><div class="asset cash"><small>법인 현금</small><b>${legalCash}</b></div><div class="asset"><small>회사 가치</small><b>${companyValue}</b></div></div>
      <button class="tutorial-btn" id="tutorialBtn">튜토리얼</button><button class="logout" id="logout">로그아웃</button>
    </header>
    <div class="mobile-account-bar"><span>법인 현금 <b>${legalCash}</b></span><span>회사 가치 <b>${companyValue}</b></span></div>
    ${content}
    <nav class="mobile-nav management-mobile-nav">
      <button data-main-tab="company" data-company-section-nav="dashboard" class="${state.tab==='company'&&state.companySection==='dashboard'?'on':''}">경영실</button>
      <button data-main-tab="company" data-company-section-nav="operations" class="${state.tab==='company'&&state.companySection==='operations'?'on':''}">사업</button>
      <button data-main-tab="company" data-company-section-nav="competition" class="${state.tab==='company'&&state.companySection==='competition'?'on':''}">인수</button>
      <button data-main-tab="company" data-company-section-nav="global" class="${state.tab==='company'&&state.companySection==='global'?'on':''}">글로벌</button>
      <button data-main-tab="company" data-company-section-nav="risk" class="${state.tab==='company'&&state.companySection==='risk'?'on':''}">리스크</button>
      <button data-main-tab="ranking" class="${state.tab==='ranking'?'on':''}">순위</button>
    </nav>
  </div>`;
  bind();
  if(state.tab==='market')drawChart();
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

  document.querySelectorAll('[data-main-tab]').forEach(b=>b.onclick=async()=>{
    rememberOrderInputs();
    const next=b.dataset.mainTab;
    state.tab=next;
    if(next==='company'&&b.dataset.companySectionNav)state.companySection=b.dataset.companySectionNav;
    if(next==='news')markNewsViewed();
    if(next==='news'||next==='ranking'){
      try{await loadPublicSnapshot(true,false)}catch(e){console.error(e)}
    }
    if(next==='company'){
      try{await loadCompanyLayer(true,false)}catch(e){console.error(e)}
    }
    renderTerminal();
  });

  document.querySelectorAll('[data-market-filter]').forEach(b=>b.onclick=()=>{
    rememberOrderInputs();
    state.marketFilter=b.dataset.marketFilter||'ALL';
    const pool=state.stocks.filter(stockVisible).filter(x=>state.marketFilter==='ALL'||marketArea(x)===state.marketFilter);
    if(pool.length&&!pool.some(x=>x.ticker===state.ticker)){state.ticker=pool[0].ticker;state.orderPrice=null;}
    renderTerminal();
  });
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
        const d=await rpc('kx_company_create',{p_name:name,p_ticker:'',p_sector:sector});
        state.companyDraft={name:'',sector:'AI·반도체'};
        state.companyNotice=d?.message||'회사 설립이 완료되었습니다.';
        await loadCompanyLayer(true,true);renderTerminal();
      }catch(err){if(msg)msg.textContent=err.message;if(btn)btn.disabled=false}
    };
  }

  document.querySelectorAll('[data-company-section],[data-company-section-jump]').forEach(b=>b.onclick=()=>{
    state.companySection=b.dataset.companySection||b.dataset.companySectionJump||'dashboard';state.tab='company';renderTerminal();
  });

  document.querySelectorAll('[data-company-region]').forEach(b=>b.onclick=()=>{
    state.companyRegion=b.dataset.companyRegion||'국내';renderTerminal();
  });

  const companyRun=async(name,body,question)=>{
    if(question&&!confirm(question))return;
    const msg=document.getElementById('companyMsg');
    try{
      const d=await rpc(name,body);
      state.companyNotice=d?.message||'경영 결정이 온라인 회사 데이터에 반영되었습니다.';
      await loadCompanyLayer(true,true);
      renderTerminal();
    }catch(err){
      state.companyNotice='처리 실패: '+err.message;
      if(msg)msg.textContent=state.companyNotice;else alert(state.companyNotice);
    }
  };

  document.querySelectorAll('[data-company-action]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyAction;
    const amount=Math.max(0,Math.floor(Number(document.getElementById('companyActionAmount')?.value)||0));
    const labels={RND:'R&D 투자',QUALITY:'품질·안전 투자',MARKETING:'마케팅 투자',CAPEX:'설비 투자',HIRING:'핵심 인재 채용',WELFARE:'복지·보상 강화',PRICE_WAR:'가격 경쟁',COSTCUT:'비용 구조조정',DIVIDEND:'배당 실시',COMPLIANCE:'준법·감사 투자',LOAN:'기업 대출',REPAY:'부채 상환'};
    const risky=action==='PRICE_WAR'?'가격 경쟁은 점유율을 얻는 대신 이익과 브랜드에 부담이 생깁니다. ':action==='COSTCUT'?'구조조정은 현금을 개선하지만 직원 사기와 평판에 부담이 생깁니다. ':action==='LOAN'?'대출은 현금을 늘리지만 부채와 신용 부담이 커집니다. ':'';
    companyRun('kx_company_action',{p_action:action,p_amount:amount},`${risky}${labels[action]||'경영 결정'}을 실행할까요?`);
  });

  document.querySelectorAll('[data-company-defense]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyDefense;
    const amount=Math.max(40000000,Math.floor(Number(document.getElementById('takeoverDefenseBudget')?.value)||150000000));
    const labels={BUYBACK:'긴급 자사주 매입',NEGOTIATE:'공격 기업과 지분 매각 협상',WHITE_KNIGHT:'백기사 우호지분 확보',POISON_PILL:'포이즌필 발동',RIGHTS_ISSUE:'긴급 유상증자',COUNTER_TAKEOVER:'역인수·맞지분 전략'};
    const warnings={POISON_PILL:'강력한 방어 효과가 있지만 브랜드와 운영에 단기 부담이 생깁니다. ',RIGHTS_ISSUE:'신주 발행으로 공격자 지분이 희석되지만 기존 주주도 함께 희석됩니다. ',COUNTER_TAKEOVER:'상대 회사를 공격하는 만큼 많은 현금이 묶일 수 있습니다. '};
    companyRun('kx_company_defense',{p_action:action,p_budget:amount},`${warnings[action]||''}${labels[action]||'경영권 방어'}을 실행할까요? 인수전에서는 한 경영 라운드에 하나의 방어 결정만 할 수 있습니다.`);
  });

  document.querySelectorAll('[data-company-expand]').forEach(b=>b.onclick=()=>{
    const code=b.dataset.companyExpand;
    const amount=Math.max(80000000,Math.floor(Number(document.getElementById('companyExpansionBudget')?.value)||200000000));
    companyRun('kx_company_expand',{p_country_code:code,p_budget:amount},`${won(amount)}을 투입해 해당 해외시장에 진출/추가투자할까요?`);
  });

  document.querySelectorAll('[data-company-buy]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companyBuy);
    const amount=Math.max(1000000,Math.floor(Number(document.getElementById(`takeBudget_${id}`)?.value)||100000000));
    companyRun('kx_company_buy_shares',{p_target_company_id:id,p_budget:amount},`${won(amount)} 한도에서 이 회사 지분을 매입할까요? 지분이 50%를 넘으면 자회사로 편입됩니다.`);
  });

  document.querySelectorAll('[data-company-tender]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companyTender);
    const amount=Math.max(50000000,Math.floor(Number(document.getElementById(`takeBudget_${id}`)?.value)||300000000));
    companyRun('kx_company_tender_offer',{p_target_company_id:id,p_budget:amount,p_premium_pct:15},`${won(amount)} 한도로 공개매수를 시작할까요? 시장가에 15% 프리미엄을 지급해 더 많은 지분을 확보하지만 상대 회사의 경영권 방어 때문에 실제 매입량이 줄 수 있습니다.`);
  });

  document.querySelectorAll('[data-company-sell]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companySell);
    const amount=Math.max(1000000,Math.floor(Number(document.getElementById('companyActionAmount')?.value)||100000000));
    companyRun('kx_company_sell_shares',{p_target_company_id:id,p_amount:amount},`${won(amount)} 상당의 보유지분을 현재 기업가치 기준으로 일부 매각할까요?`);
  });

  document.querySelectorAll('[data-company-market-side]').forEach(b=>b.onclick=()=>{
    const ticker=document.getElementById('corpStockTicker')?.value;
    const side=b.dataset.companyMarketSide;
    const amount=Math.max(10000,Math.floor(Number(document.getElementById('corpStockAmount')?.value)||50000000));
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:side,p_amount:amount},`회사 자금으로 ${ticker}를 ${side==='BUY'?'매수':'매도'}할까요?`);
  });


  document.querySelectorAll('[data-company-quick-market-side]').forEach(b=>b.onclick=()=>{
    const ticker=selected()?.ticker;
    const side=b.dataset.companyQuickMarketSide;
    const amount=Math.max(1000000,Math.floor(Number(document.getElementById('quickCorpAmount')?.value)||50000000));
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:side,p_amount:amount},`${escapeHtml(ticker)}를 회사 전략자산으로 ${side==='BUY'?'매수':'매도'}할까요? 이 거래의 손익·업종·해외 여부가 회사 경영지표에도 반영됩니다.`);
  });

  document.querySelectorAll('[data-company-media]').forEach(b=>b.onclick=()=>{
    const outlet=b.dataset.companyMedia;
    const campaign=document.getElementById('companyMediaCampaign')?.value||'IR_INTERVIEW';
    const budget=Math.max(20000000,Math.floor(Number(document.getElementById('companyMediaBudget')?.value)||70000000));
    const labels={ECON_DAILY:'KX 경제일보',BIZ_TV:'비즈니스24',GLOBAL_WIRE:'Global Finance Wire',EDGE_MEDIA:'EDGE 미디어'};
    const warn=campaign==='AGGRESSIVE_SPIN'?'공격적 이미지 메이킹은 단기 투자수요가 클 수 있지만 과장 논란이 생기면 역풍도 큽니다. ':'';
    companyRun('kx_company_media',{p_outlet:outlet,p_campaign:campaign,p_budget:budget},`${warn}${labels[outlet]||'언론사'}에 ${won(budget)} 규모의 PR/IR 캠페인을 집행할까요?`);
  });

  document.querySelectorAll('[data-company-tax]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyTax;
    const text={PAY:'현재 고지세액과 미납 세금을 납부할까요?',PLAN:'세무 전문가 비용을 들여 합법적 절세 검토를 진행할까요?',INSTALLMENT:'세금 일부만 먼저 납부하고 잔액을 이월할까요? 잔액에는 가산 부담과 조사 위험이 생깁니다.',EVADE:'신고 누락은 불법 고위험 선택입니다. 적발되면 원세금 외 추징·가산 부담, 평판 하락, 규제조사와 일시 거래 제한이 발생할 수 있습니다. 그래도 시도할까요?',CORRECT:'미납·누락 세금을 자진 정정해 정리할까요?'};
    companyRun('kx_company_tax',{p_action:action},text[action]||'세무 결정을 실행할까요?');
  });

  document.querySelectorAll('[data-company-retry]').forEach(b=>b.onclick=async()=>{
    b.disabled=true;b.textContent='온라인 연결 확인 중…';
    await loadCompanyLayer(true,true);
    state.companyNotice=state.companyAvailable
      ?'온라인 회사 경영 서버가 연결되었습니다. BOT과 다른 유저 회사가 같은 시장에서 경쟁합니다.'
      :'온라인 DB 연결에 실패했습니다. 필수 SQL 실행 여부와 Supabase 설정을 확인해 주세요.';
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

async function start(){
  localStorage.removeItem(LOCAL_COMPANY_KEY);
  state.companyMode='REMOTE';
  app.innerHTML='<div class="boot"><div class="kxlogo">KX</div><b>KX CORPORATE</b><span>온라인 회사 리그·기업시장에 연결하는 중…</span></div>';
  if(!session.user){
    try{session.user=await req('/auth/v1/user');save()}catch{}
  }
  try{await rpc('kx_join_exchange',{})}catch(e){console.warn('KX join marker skipped:',e.message)}
  await sync(true,true,true);
  const scheduleSharedSync=()=>{
    clearTimeout(marketSyncTimer);
    const now=Date.now();
    const delay=Math.max(350,5000-(now%5000)+120);
    marketSyncTimer=setTimeout(async()=>{await sync(true,false,false);scheduleSharedSync();},delay);
  };
  scheduleSharedSync();
  addEventListener('resize',()=>{if(document.getElementById('chart'))drawChart()});
}
async function boot(){
  if(!C.supabaseUrl||!C.supabaseAnonKey)return renderDiag();
  try{session=JSON.parse(localStorage.getItem(LS)||'null')}catch{}
  if(session&&await validate())return start();
  renderAuth();
}
boot();
})();
