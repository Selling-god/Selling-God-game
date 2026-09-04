(()=>{
const KX_COMPANY_BUILD='5.11.0-REAL-MANAGEMENT-RESPONSIVE';
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
let uiLastInteractionAt=0;
const COMPANY_SERVER_SYNC_MS=12000;
const COMPANY_VISUAL_TICK_MS=1000;

let session=null;
let state={
  stocks:[],ticker:'A101',candles:[],depth:[],news:[],clock:null,
  account:null,positions:[],orders:[],trades:[],ranking:[],
  bankDeposits:[],bankLoans:[],bankMeta:{},chartRanges:{},
  game:{events:[],predictions:[],shorts:[],ipos:[],subscriptions:[],dividends:[],short_adjustments:[],prediction_stats:{total:0,correct:0}},gameAvailable:true,gameError:'',
  company:{my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],media_campaigns:[],tax_records:[],events:[],press:[],my_history:[],projects:[],investment_income:[],investment_summary:{},world:null,control_case:null},
  companyAvailable:true,companyMode:'REMOTE',companyRpcMode:'AUTO',companyError:'',companyRegion:'국내',companyNotice:'',companySection:'dashboard',companyAnalysisId:null,companyAnalysis:null,companyMetric:'valuation',companySearch:'',
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
function ownerStakeOf(my){return Math.max(0,100-Number(my?.incoming_stake||0))}


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
  el.innerHTML=`<button class="news-flash-close" aria-label="닫기">×</button>
    <div class="news-flash-top"><span>기업 뉴스</span><time>${when}</time></div>
    <div class="news-flash-source">${escapeHtml(a?.outlet_name||'KX BUSINESS NEWS')} · ${escapeHtml(a?.company_name||'기업시장')}</div>
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
  const unseen=rows.filter(a=>(Number(a.id)||0)>lastCompanyPressId&&Number(a.company_id||0)!==myId).sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
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
function emptyCompany(){return {my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],media_campaigns:[],tax_records:[],events:[],press:[],my_history:[],projects:[],investment_income:[],investment_summary:{},world:null,control_case:null}}
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
    state.companyRpcMode='V59';state.company={...emptyCompany(),...d};
    state.companyAvailable=true;state.companyMode='REMOTE';state.companyError='';
    if(d?.world?.server_time){const t=Date.parse(d.world.server_time);if(Number.isFinite(t))companyServerOffsetMs=t-Date.now();}
    companyLastFetchAt=Date.now();if(runSync)companyLastAdvanceAt=companyLastFetchAt;
    syncCompanyClockAnchor(state.company?.world,state.clock);
    processCompanyIncome(state.company?.investment_income||[]);
    processCompanyPress(state.company?.press||[]);
    if(state.companyAnalysisId){
      try{state.companyAnalysis=await companyApi('PROFILE',{p_company_id:Number(state.companyAnalysisId)});}catch(_e){}
    }
  }catch(e){
    const raw=String(e?.message||'');
    state.companyAvailable=false;state.companyMode='REMOTE';state.company=emptyCompany();
    if(missingRpcError(e)){
      state.companyRpcMode='BROKEN';companyApiReady=false;
      state.companyError='회사 온라인 API(kx_company_api_v1)가 없습니다. KX_CORPORATE_RUN_ONLY_THIS_V59.sql 하나만 실행한 뒤 다시 확인해 주세요.';
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

function topNav(){
  const items=[
    ['company','경영 홈','dashboard'],
    ['company','사업 · 해외','operations'],
    ['company','기업 · M&A','competition'],
    ['company','뉴스 · IR','risk'],
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
      <div class="simple-onboarding-copy"><small>KX CORPORATE · ONLINE LEAGUE</small><h1>작은 회사를 세우고, 큰 기업들과 경쟁하세요</h1><p>처음에는 순위권 밖의 신생기업으로 시작합니다. 사업을 키우고, 뉴스를 읽고, 경쟁사 주가를 분석해 투자·인수하면서 글로벌 기업으로 성장하는 게임입니다.</p>
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
    <div class="takeover-board-note"><b>긴급 이사회</b><span>한 라운드에 하나의 방어 결정만 실행할 수 있습니다. 모든 선택에는 현금, 브랜드, 지분 희석 등 서로 다른 대가가 있습니다.</span>${companyMoneyInput('takeoverDefenseBudget','이번 대응 예산','1억 5000만')}</div>
    <div class="takeover-defense-grid">${actions.map(a=>{const used=(a[0]==='POISON_PILL'&&c.used_poison_pill)||(a[0]==='RIGHTS_ISSUE'&&c.used_rights_issue);return `<button data-company-defense="${a[0]}" ${used?'disabled':''}><small>${a[3]}</small><b>${a[1]}</b><span>${used?'이번 인수전에서 이미 사용함':a[2]}</span></button>`}).join('')}</div>
  </section>`;
}

function managementProjectMeta(type){
  const map={
    RND:['신기술 개발 프로젝트','6주기','중간','기술·제품 경쟁력을 올리고 완료 뒤 성과 매출이 들어옵니다.','장기 고수익'],
    QUALITY:['품질 혁신 프로젝트','4주기','낮음','품질과 고객 신뢰를 높여 리콜 위험을 낮추고 매출을 안정화합니다.','안정형'],
    CAPEX:['생산능력 확장','5주기','중간','설비를 늘려 운영능력과 생산량을 키우고 추가 현금흐름을 만듭니다.','중장기'],
    HIRING:['핵심 인재 영입','4주기','중간','인재를 채용해 기술·운영 역량을 높이고 후속 프로젝트 성공률을 높입니다.','성장형'],
    MARKETING:['시장 점유율 캠페인','3주기','높음','브랜드와 수요를 빠르게 끌어올리지만 성과 편차가 큽니다.','단기 변동'],
    WELFARE:['조직 안정화 프로그램','3주기','낮음','직원 사기와 생산성을 높여 장기적인 운영 손실을 줄입니다.','안정형'],
    COMPLIANCE:['준법·감사 고도화','3주기','낮음','규제·세무 리스크를 낮추고 신용과 기관 신뢰를 높입니다.','방어형']
  };
  return map[type]||[type,'-','-','회사 경영 프로젝트','-'];
}
function projectStatusLabel(p){
  if(p.status==='PAYBACK')return '성과 회수 중';
  if(p.status==='COMPLETED')return '완료';
  if(p.status==='FAILED')return '성과 부진';
  return '진행 중';
}
function renderManagementProjectBoard(my){
  const rows=[...(state.company?.projects||[])].sort((a,b)=>Number(b.id)-Number(a.id));
  const active=rows.filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).slice(0,8);
  const done=rows.filter(p=>!['ACTIVE','PAYBACK'].includes(String(p.status))).slice(0,6);
  return `<section class="management-project-board">
    <div class="company-section-head"><div><small>PROJECT PIPELINE</small><h2>진행 중인 경영 프로젝트</h2></div><span>버튼을 누른 즉시 능력치가 끝나는 방식이 아니라, 시간이 지나며 진행 → 성과발표 → 투자회수로 이어집니다.</span></div>
    <div class="project-grid">${active.length?active.map(p=>{const meta=managementProjectMeta(p.project_type),dur=Math.max(1,Number(p.duration_cycles)||1),prog=Math.min(dur,Number(p.progress_cycles)||0),pc=Math.round(prog/dur*100),budget=Number(p.budget)||0,real=Number(p.realized_return)||0,expected=Number(p.expected_return)||0,remain=Number(p.payout_cycles_remaining)||0;return `<article class="project-card status-${String(p.status||'ACTIVE').toLowerCase()} ${p.decision_pending?'decision-pending':''}"><div class="project-card-head"><span>${escapeHtml(p.project_type)}</span><b>${p.decision_pending?'이사회 결정 필요':projectStatusLabel(p)}</b></div><h3>${escapeHtml(p.title||meta[0])}</h3><p>${escapeHtml(p.outcome||meta[3])}</p><div class="project-progress"><i style="width:${p.status==='PAYBACK'||p.status==='COMPLETED'?100:pc}%"></i></div><div class="project-stats"><span>진행 <b>${p.status==='PAYBACK'?`회수 ${Math.max(0,remain)}회 남음`:`${prog}/${dur}주기`}</b></span><span>투자금 <b>${compactMoney(budget)}원</b></span><span>성공확률 <b>${Number(p.success_chance||0).toFixed(0)}%</b></span><span>실제 회수 <b class="${real>=budget?'up':''}">${compactMoney(real)}원</b></span></div>${p.decision_pending?`<div class="project-decision"><strong>중간 이사회 안건</strong><p>이 선택을 해야 프로젝트가 다음 단계로 진행됩니다.</p><div><button data-project-decision="${p.id}" data-project-choice="BOOST">추가 투자 +20%<small>성공확률 +10% · 기대수익 확대</small></button><button data-project-decision="${p.id}" data-project-choice="STEADY">기존 계획 유지<small>추가비용 없음 · 성공확률 +3%</small></button><button data-project-decision="${p.id}" data-project-choice="SCALE_DOWN">범위 축소<small>투자금 15% 회수 · 성공확률 +8%</small></button></div></div>`:`${p.decision_choice?`<small class="project-choice-note">중간 결정: ${escapeHtml(p.decision_choice)}</small>`:''}`}</article>`}).join(''):`<div class="empty project-empty">진행 중인 프로젝트가 없습니다. 아래에서 첫 프로젝트를 시작해 보세요.</div>`}</div>
    ${done.length?`<details class="project-history"><summary>완료된 프로젝트 ${done.length}개 보기</summary><div>${done.map(p=>`<article><span><b>${escapeHtml(p.title||p.project_type)}</b><small>${escapeHtml(p.outcome||projectStatusLabel(p))}</small></span><strong>${compactMoney(p.realized_return||0)}원 회수</strong></article>`).join('')}</div></details>`:''}
  </section>`;
}
function renderInvestmentReturnPanel(my){
  const sum=state.company?.investment_summary||{};
  const incomes=(state.company?.investment_income||[]).slice(0,10);
  const value=Number(sum.portfolio_value||0),cost=Number(sum.portfolio_cost||0),unreal=Number(sum.unrealized_pnl??(value-cost)),real=Number(sum.realized_pnl||0),divi=Number(sum.dividend_income||0),projectReturn=Number(sum.project_return||0),globalReturn=Number(sum.global_return||0);
  const cycle=Number(state.company?.world?.cycle_no||0),nextYield=6-(cycle%6||0),nextGlobal=4-(cycle%4||0);
  return `<section class="investment-return-panel"><div class="company-section-head"><div><small>RETURN DESK</small><h2>투자금이 어디서 돌아오는지</h2></div><span>경쟁사 지분·법인 주식의 평가손익과, 매각이익·배당·프로젝트 성과금·해외사업 현금유입을 한곳에서 보여줍니다.</span></div><div class="return-schedule"><span><b>배당·금융수익</b> 약 ${nextYield||6}주기 뒤 정산</span><span><b>해외사업 현금</b> 약 ${nextGlobal||4}주기 뒤 정산</span><span>서버는 회사별 요청이 아니라 <b>시장 전체를 한 번에 배치 정산</b>합니다.</span></div><div class="return-kpis"><article><small>전체 투자 평가액</small><b>${compactMoney(value)}원</b><span>투자원가 ${compactMoney(cost)}원</span></article><article><small>평가손익</small><b class="${unreal>=0?'up':'down'}">${unreal>=0?'+':''}${compactMoney(unreal)}원</b><span>아직 매도 전 손익</span></article><article><small>확정 매매손익</small><b class="${real>=0?'up':'down'}">${real>=0?'+':''}${compactMoney(real)}원</b><span>매도 결과가 법인현금에 반영</span></article><article><small>누적 현금유입</small><b class="up">${compactMoney(divi+projectReturn+globalReturn)}원</b><span>배당 ${compactMoney(divi)} · 프로젝트 ${compactMoney(projectReturn)} · 해외 ${compactMoney(globalReturn)}</span></article></div><div class="income-feed">${incomes.length?incomes.map(x=>`<article><span><b>${escapeHtml(x.source_name||x.source_code||'투자')}</b><small>${escapeHtml(x.income_label||x.income_type||'현금수익')} · 주기 #${Number(x.cycle_no)||0}</small></span><strong class="${Number(x.amount)>=0?'up':'down'}">${Number(x.amount)>=0?'+':''}${compactMoney(x.amount)}원</strong><em>${escapeHtml(x.note||'법인현금 반영')}</em></article>`).join(''):`<div class="empty compact">아직 확정된 현금수익이 없습니다. 프로젝트 성과·해외사업·배당·지분 매각이 발생하면 이곳에 실제 입금 내역이 쌓입니다.</div>`}</div></section>`;
}
function renderPeopleFinanceDesk(my){
  const employees=Math.max(0,Number(my.employees||0));
  const salary=Math.max(0,Number(my.avg_monthly_salary||0));
  const payroll=Math.max(0,Number(my.monthly_payroll||employees*salary));
  const fixed=Math.max(0,Number(my.monthly_fixed_cost||0));
  const runRate=payroll+fixed;
  const estCorp=Math.max(0,Number(my.estimated_corporate_tax||0));
  const estLocal=Math.max(0,Number(my.estimated_local_tax||0));
  const due=Math.max(0,Number(my.tax_due||0)+Number(my.tax_arrears||0));
  const cycle=Number(state.company?.world?.cycle_no||0);
  const nextSettlement=120-(cycle%120||0);
  const depts=[
    ['ENGINEERING','기술·R&D',Number(my.hr_engineering||0)],
    ['SALES','영업·마케팅',Number(my.hr_sales||0)],
    ['OPERATIONS','생산·운영',Number(my.hr_operations||0)],
    ['FINANCE','재무·준법',Number(my.hr_finance||0)],
    ['MANAGEMENT','경영지원',Number(my.hr_management||0)]
  ];
  return `<section class="corp-section people-finance-desk">
    <div class="company-section-head"><div><small>PEOPLE · PAYROLL · CASHFLOW</small><h2>인사·급여·고정비</h2></div><span>직원을 채용하면 인건비가 계속 발생하고, 급여 수준은 사기·생산성·이직률에 영향을 줍니다. 게임에서는 120경영주기를 한 회계 정산기간으로 압축합니다.</span></div>
    <div class="people-finance-kpis">
      <article><small>재직 인원</small><b>${nf.format(employees)}명</b><span>직원 사기 ${Number(my.employee_morale||0).toFixed(0)}</span></article>
      <article><small>평균 월급</small><b>${formatKrwSmart(salary||0)}</b><span>1인 기준</span></article>
      <article><small>월 급여 총액</small><b>${formatKrwSmart(payroll)}</b><span>경영주기마다 분할 지출</span></article>
      <article><small>월 고정 운영비</small><b>${formatKrwSmart(fixed)}</b><span>임차·서버·관리·유지비</span></article>
      <article><small>월 고정비 합계</small><b>${formatKrwSmart(runRate)}</b><span>현금이 자동으로 감소</span></article>
      <article class="${due>0?'warn':''}"><small>세금</small><b>${due>0?formatKrwSmart(due):`예상 ${formatKrwSmart(estCorp+estLocal)}`}</b><span>${due>0?'현재 납부·미납 세액':`실효세율 ${companyTaxRateText(my)}`}</span></article>
    </div>
    <div class="department-board">${depts.map(d=>`<article><span>${d[1]}</span><b>${nf.format(d[2])}명</b><small>${employees?`${(d[2]/employees*100).toFixed(1)}%`:'0%'}</small></article>`).join('')}</div>
    <div class="hr-action-layout">
      <form class="hr-action-card" id="companyHireForm"><div><small>RECRUIT</small><h3>직원 채용</h3><p>채용비용과 이후 월급이 실제 법인현금에서 나갑니다.</p></div><label>부서<select id="companyHireDepartment">${depts.map(d=>`<option value="${d[0]}">${d[1]}</option>`).join('')}</select></label><label>채용 인원<input id="companyHireCount" type="number" min="1" max="5000" value="10"></label>${companyMoneyInput('companyHireSalary','1인 월급','400만','예: 400만, 650만')}<button type="button" data-company-hr="HIRE">채용 진행</button></form>
      <form class="hr-action-card" id="companySalaryForm"><div><small>COMPENSATION</small><h3>급여 정책</h3><p>전 직원 평균 월급을 조정합니다. 급여 인상은 사기와 채용 경쟁력을 높이지만 고정비가 커집니다.</p></div>${companyMoneyInput('companySalaryAmount','새 평균 월급',salary?formatKrwSmart(salary):'400만','예: 450만, 700만')}<button type="button" data-company-hr="SET_SALARY">급여 정책 변경</button>${companyMoneyInput('companyBonusAmount','성과급 총액','3000만','예: 3000만, 1억')}<button type="button" data-company-hr="BONUS" class="secondary">성과급 지급</button></form>
      <form class="hr-action-card danger-card" id="companyLayoffForm"><div><small>WORKFORCE</small><h3>인력 조정</h3><p>감원은 고정비를 줄이지만 퇴직비용과 직원 사기·평판 하락이 발생할 수 있습니다.</p></div><label>부서<select id="companyLayoffDepartment">${depts.map(d=>`<option value="${d[0]}">${d[1]}</option>`).join('')}</select></label><label>감원 인원<input id="companyLayoffCount" type="number" min="1" max="5000" value="5"></label><button type="button" data-company-hr="LAYOFF" class="risk">인력 조정 실행</button></form>
    </div>
    <div class="accounting-runway"><span><b>현재 고정비</b>${formatKrwSmart(runRate)}/월</span><span><b>다음 회계 결산</b>약 ${nextSettlement||120}주기 뒤</span><span><b>최근 자동 운영비</b>${formatKrwSmart(Number(my.last_operating_cost||0))}</span><span><b>최근 부채 이자</b>${formatKrwSmart(Number(my.last_interest_cost||0))} · 연 ${Number(my.annual_interest_rate||6.5).toFixed(1)}%</span><span><b>누적 급여 비용</b>${formatKrwSmart(Number(my.payroll_accrued||0))}</span></div>
  </section>`;
}

function renderCompanyCommand(my){
  const core=['RND','QUALITY','CAPEX','HIRING','MARKETING','WELFARE'];
  const active=(state.company?.projects||[]).filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).length;
  const advanced=[['PRICE_WAR','가격 경쟁','즉시','점유율을 빠르게 확보하지만 이익·브랜드가 흔들릴 수 있습니다.'],['COSTCUT','구조조정','즉시','현금을 확보하지만 직원 사기와 평판이 떨어질 수 있습니다.'],['DIVIDEND','주주 배당','즉시','현금을 주주에게 돌려 투자자 신뢰를 높입니다.'],['COMPLIANCE','준법·감사 프로젝트','3주기','규제·세무 위험을 낮추는 방어 프로젝트입니다.'],['LOAN','기업 대출','즉시','현금을 확보하는 대신 부채와 신용 부담이 생깁니다.'],['REPAY','부채 상환','즉시','부채를 줄여 신용과 재무 안정성을 높입니다.']];
  return `<section class="corp-section ceo-command-section management-v54">
    <div class="company-section-head"><div><small>CEO STRATEGY</small><h2>이번에는 ‘프로젝트’를 시작합니다</h2></div><span>현재 진행·회수 중 ${active}개 · 핵심 프로젝트는 최대 4개까지 동시에 운영할 수 있습니다.</span></div>
    ${renderManagementProjectBoard(my)}
    <div class="project-launch-box"><div><b>신규 프로젝트 예산</b><span>투자금은 즉시 빠지지만, 프로젝트가 완료되면 성과에 따라 여러 경영주기에 걸쳐 현금이 돌아옵니다.</span></div>${companyMoneyInput('companyActionAmount','집행금액','1억')}</div>
    <div class="project-launch-grid">${core.map(k=>{const m=managementProjectMeta(k);return `<button data-company-action="${k}" class="project-launch"><div><small>${m[1]} · 위험 ${m[2]}</small><b>${m[0]}</b></div><p>${m[3]}</p><span>${m[4]} · 시작하기 →</span></button>`}).join('')}</div>
    <details class="advanced-management"><summary>재무·위기 대응 결정 보기</summary><div class="corp-action-grid advanced-grid">${advanced.map(a=>`<button data-company-action="${a[0]}" class="${['PRICE_WAR','LOAN','COSTCUT'].includes(a[0])?'risk':''}"><small>${a[2]}</small><b>${a[1]}</b><span>${a[3]}</span></button>`).join('')}</div></details>
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
  const cutoff=Date.now()-15*60*1000;
  const press=(state.company?.press||[]).filter(a=>!a.created_at||new Date(a.created_at).getTime()>=cutoff);
  const campaigns=state.company?.media_campaigns||[];
  const outlets=[
    {code:'GLOBAL_WIRE',name:'Global Finance Wire',kind:'글로벌 금융통신',cost:160000000,trust:'매우 높음',risk:'낮음',tone:'기관·해외 투자자 도달률이 높습니다.'},
    {code:'ECON_DAILY',name:'KX 경제일보',kind:'경제 전문지',cost:90000000,trust:'높음',risk:'낮음',tone:'실적과 사업 내용을 비교적 보수적으로 기사화합니다.'},
    {code:'BIZ_TV',name:'비즈니스24',kind:'대중 경제방송',cost:65000000,trust:'보통 이상',risk:'보통',tone:'대중 노출이 높아 단기 관심을 끌기 좋습니다.'},
    {code:'EDGE_MEDIA',name:'EDGE 미디어',kind:'온라인 경제매체',cost:35000000,trust:'보통',risk:'높음',tone:'저렴하지만 제목이 자극적으로 바뀔 수 있습니다.'},
    {code:'QUICK_BUZZ',name:'퀵버즈 경제',kind:'저가 온라인 매체',cost:15000000,trust:'낮음',risk:'매우 높음',tone:'비용은 싸지만 과장·오보 논란이 생길 확률이 큽니다.'},
    {code:'RUMOR_POST',name:'루머포스트',kind:'가십성 시장매체',cost:8000000,trust:'매우 낮음',risk:'극단적',tone:'홍보비는 매우 싸지만 오히려 기업 신뢰와 주가에 손해가 날 수 있습니다.'}
  ];
  const targets=[...(state.company?.companies||[])].filter(c=>c&&c.status!=='INACTIVE').sort((a,b)=>Number(b.valuation)-Number(a.valuation));
  return `<section class="corp-section media-desk-section newsroom-management clean-newsroom-management auto-newsroom">
    <div class="company-section-head"><div><small>NEWS · IR</small><h2>회사만 고르고, 기사는 언론사에 맡기세요</h2></div><span>기사 제목이나 내용을 직접 고르지 않습니다. 먼저 보도할 회사를 선택한 뒤 언론사를 고르면, 그 매체가 선택한 회사의 실적·기술·평판을 보고 자체적으로 기사를 작성합니다.</span></div>
    <div class="media-target-shell"><div><small>보도 대상 회사</small><b>어느 회사를 기사화할까요?</b><span>내 회사를 홍보할 수도 있고 경쟁사를 기사화할 수도 있습니다. 결과의 방향은 언론사 품질과 실제 회사 상태에 따라 달라집니다.</span></div><label><span>회사 선택</span><select id="companyMediaTarget">${targets.map(c=>`<option value="${c.id}" ${Number(c.id)===Number(my.id)?'selected':''}>${Number(c.id)===Number(my.id)?'[내 회사] ':''}${escapeHtml(c.name)} · ${escapeHtml(c.home_country)} · ${escapeHtml(c.sector)}</option>`).join('')}</select></label></div>
    <div class="auto-news-explain"><div><b>어떤 기사가 나올지는 보장되지 않습니다.</b><span>신뢰도 높은 언론사는 비싸지만 과장 보도 위험이 낮고, 값싼 매체는 비용을 아끼는 대신 이상한 제목·과장 기사로 역풍을 맞을 수 있습니다.</span></div><div class="auto-news-current"><span>내 투자자 심리 <b>${Number(my.investor_sentiment||50).toFixed(0)}</b></span><span>내 미디어 평판 <b>${Number(my.media_reputation||50).toFixed(0)}</b></span><span>내 최근 수급 <b class="${Number(my.investor_flow||0)>=0?'up':'down'}">${Number(my.investor_flow||0)>=0?'+':''}${compactMoney(my.investor_flow||0)}원</b></span></div></div>
    <div class="auto-outlet-grid">${outlets.map(o=>`<article class="auto-outlet-card risk-${o.risk==='극단적'?'extreme':o.risk==='매우 높음'?'very-high':o.risk==='높음'?'high':'normal'}"><div><small>${o.kind}</small><h3>${o.name}</h3><p>${o.tone}</p></div><dl><div><dt>보도 비용</dt><dd>${formatKrwSmart(o.cost)}</dd></div><div><dt>신뢰도</dt><dd>${o.trust}</dd></div><div><dt>역풍 위험</dt><dd>${o.risk}</dd></div></dl><button data-company-media="${o.code}" data-media-cost="${o.cost}" data-media-name="${o.name}">선택한 회사를 이 언론사에 맡기기</button></article>`).join('')}</div>
    <div class="published-news clean-published-news"><div class="company-section-head mini"><div><small>LIVE BUSINESS WIRE · 15 MIN</small><h3>최근 15분 기업 뉴스</h3></div><span>15분이 지난 뉴스는 서버에서도 자동 삭제되어 오래 쌓이지 않습니다.</span></div><div class="clean-news-list">${press.length?press.slice(0,24).map(a=>`<article class="press-article clean-press-article ${Number(a.sentiment_impact||0)<0?'negative':''}"><div class="press-meta"><b>${escapeHtml(a.outlet_name||'경제뉴스')}</b><span>${escapeHtml(a.company_name||'시장')}</span><time>${a.created_at?new Date(a.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div><h3>${escapeHtml(a.headline)}</h3><p>${escapeHtml(a.article_body||'')}</p><footer><span>${escapeHtml(a.country||'')}</span><em class="${Number(a.bot_flow||0)>=0?'up':'down'}">시장 수급 ${Number(a.bot_flow||0)>=0?'+':''}${compactMoney(a.bot_flow||0)}원</em></footer></article>`).join(''):`<div class="empty">최근 15분 안에 보도된 기업 뉴스가 없습니다.</div>`}</div></div>
    <details class="media-history"><summary>내 회사 언론 집행 기록</summary>${campaigns.length?campaigns.slice(0,8).map(c=>`<article><span><b>${escapeHtml(c.outlet_name)}</b><small>${c.backlash?'역풍 발생':'보도 완료'}</small></span><strong>${formatKrwSmart(c.budget)}</strong></article>`).join(''):`<div class="empty compact">아직 기록이 없습니다.</div>`}</details>
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
  const all=(state.company?.companies||[]).filter(c=>c.status!=='INACTIVE');
  const ranking=[...all].sort((a,b)=>Number(b.valuation)-Number(a.valuation));
  const myRank=ranking.findIndex(c=>Number(c.id)===Number(my.id))+1;
  const q=String(state.companySearch||'').trim().toLowerCase();
  const regionRows=all.filter(c=>state.companyRegion==='국내'?c.home_country==='대한민국':c.home_country!=='대한민국');
  const searched=q?all.filter(c=>[c.name,c.ticker,c.home_country,c.sector,c.owner_nickname,c.ai_style].some(v=>String(v||'').toLowerCase().includes(q))):regionRows;
  const ordered=[...searched].sort((a,b)=>{const am=Number(a.id)===Number(my.id),bm=Number(b.id)===Number(my.id);if(am!==bm)return am?-1:1;return Number(b.valuation)-Number(a.valuation)});
  const rows=ordered.slice(0,q?80:40);
  const globalRank=id=>ranking.findIndex(x=>Number(x.id)===Number(id))+1;
  return `<section class="corp-section competition-section clean-company-market">
    <div class="company-section-head"><div><small>COMPANY ANALYSIS</small><h2>기업 탐색 · 주가 분석 · 인수</h2></div><div class="analysis-head-actions"><span>내 순위 #${myRank||'-'} / ${ranking.length} · 법인현금 ${formatKrwSmart(my.cash)}</span><button data-main-tab="market" class="section-link">기존 증권시장 보기</button></div></div>
    <div class="company-browser-tools"><form id="companySearchForm" class="company-search-box"><span>⌕</span><input id="companySearchInput" value="${escapeHtml(state.companySearch||'')}" placeholder="회사명 · 국가 · 업종으로 찾기" autocomplete="off"><button type="submit">검색</button>${q?'<button type="button" id="companySearchClear" class="clear">지우기</button>':''}</form><div class="company-region-tabs"><button data-company-region="국내" class="${state.companyRegion==='국내'&&!q?'on':''}">국내 기업</button><button data-company-region="해외" class="${state.companyRegion==='해외'&&!q?'on':''}">해외 기업</button></div></div>
    <div class="company-browser-summary"><span>${q?`“${escapeHtml(state.companySearch)}” 검색 결과`:`${state.companyRegion} 기업`}</span><b>${rows.length}개</b><small>내 회사도 목록에서 직접 선택해 주가와 외부 지분을 확인할 수 있습니다.</small></div>
    <div class="company-analysis-layout clean-analysis-layout"><div class="company-browser clean-company-browser">${rows.length?rows.map(c=>{const self=Number(c.id)===Number(my.id),stake=self?ownerStakeOf(my):Number(c.acquired_stake||0),gap=Number(c.valuation)/Math.max(1,Number(my.valuation)),news=companyPressFor(c.id)[0],rank=globalRank(c.id),ret=Number(c.last_return_pct||0);return `<button class="company-browser-row clean-company-row ${self?'self-company-row':''} ${Number(state.companyAnalysisId)===Number(c.id)?'on':''}" data-company-analyze="${c.id}"><strong class="company-row-rank">${self?'MY':`#${rank||'-'}`}</strong><span class="company-row-identity"><b>${escapeHtml(c.name)}${self?' <em class="me-chip">내 회사</em>':''}</b><small>${companyTypeBadge(c)} ${escapeHtml(c.home_country)} · ${escapeHtml(c.sector)}</small>${news?`<em>${escapeHtml(news.outlet_name||'경제뉴스')} · ${escapeHtml(news.headline)}</em>`:'<em class="muted">최근 15분 보도 없음</em>'}</span><span class="company-row-value"><small>기업가치</small><b>${companyMarketValueText(c)}</b>${c.home_country!=='대한민국'?`<em>원화 ${compactMoney(c.valuation)}원</em>`:`<em>${self?'내 회사':`내 회사의 ${gap>=1?`${gap.toFixed(gap>99?0:1)}배`:`${(gap*100).toFixed(0)}%`}`}</em>`}</span><span class="company-row-quote"><small>현재 주가</small><b>${companySharePriceText(c)}</b><em class="${ret>=0?'up':'down'}">${ret>=0?'+':''}${ret.toFixed(2)}%</em></span><span class="company-row-stake"><small>${self?'내 경영진 지분':'내 지분'}</small><b>${stake.toFixed(1)}%</b><em>${self?`외부 ${Number(my.incoming_stake||0).toFixed(1)}%`:stake>=50?'경영권 확보':stake>=15?'주요 주주':stake>=5?'전략 지분':'미보유'}</em></span><i class="company-row-open">분석</i></button>`}).join(''):`<div class="empty company-search-empty">조건에 맞는 회사를 찾지 못했습니다.</div>`}</div><div id="companyAnalysisSlot" class="company-analysis-slot">${renderCompanyAnalysisPanel(my)}</div></div>
  </section>`;
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
    <div class="company-target-chart live-company-chart clean-live-chart"><div class="mini-chart-head"><div><b>공용 실시간 주가</b><small>모든 유저가 같은 서버 가격·캔들을 봅니다. 새 캔들이 생길 때 차트가 왼쪽으로 흐릅니다.</small></div><span class="live-dot">SHARED</span></div><canvas id="companyTargetChart"></canvas><div class="chart-decision-note"><span><small>매출</small><b>${compactMoney(c.revenue)}원</b></span><span><small>영업이익</small><b>${compactMoney(c.profit)}원</b></span><span><small>투자심리</small><b>${Number(c.investor_sentiment||50).toFixed(0)}</b></span><span><small>수급 방향</small><b class="${flow>=0?'up':'down'}">${flow>=0?'순매수':'순매도'}</b></span></div></div>
    <div class="analysis-news"><div class="analysis-subhead"><h3>최근 15분 관련 뉴스</h3><span>${press.length}건</span></div>${press.length?press.slice(0,4).map(a=>`<article><small>${escapeHtml(a.outlet_name||'경제뉴스')}</small><b>${escapeHtml(a.headline)}</b><p>${escapeHtml(a.article_body||'')}</p></article>`).join(''):`<div class="empty compact">최근 15분 안에 보도된 기사가 없습니다.</div>`}</div>
    ${self?`<div class="self-ownership-panel"><div><small>내 경영진·우호 지분</small><b>${stake.toFixed(2)}%</b><span>외부 세력 합계 ${Number(my.incoming_stake||0).toFixed(2)}% · 적대적 지분이 늘수록 이 비율이 낮아집니다.</span></div><button data-company-section-jump="competition" class="section-link">경영권 방어 현황 보기</button></div>`:`<div class="analysis-acquire"><div><small>현재 단계</small><b>${stage.label}</b><span>${controlled?'경영권 확보 완료':stage.desc}</span></div>${companyMoneyInput(`takeBudget_${c.id}`,'인수 예산','1억')}<button data-company-buy="${c.id}" ${controlled?'disabled':''}>장내 지분 매수</button><button data-company-tender="${c.id}" class="tender" ${stake<15||controlled?'disabled':''}>공개매수</button></div>`}
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
  return `<section class="corp-section takeover-section">
    <div class="company-section-head"><div><small>04 · M&A / CONTROL</small><h2>지분 인수와 경영권</h2></div><span>한 기업이 50% 이상을 확보하면 해당 회사가 자회사로 편입됩니다.</span></div>
    <div class="takeover-summary">
      <article class="owner-stake-card"><small>내 경영진·우호 지분</small><b>${ownerStakeOf(my).toFixed(2)}%</b><span>외부 세력이 지분을 사면 이 비율이 내려갑니다. 경영권 방어의 핵심 지표입니다.</span></article>
      <article class="${threat>=35?'danger':threat>=15?'warn':''}"><small>외부 세력 보유지분</small><b>${threat.toFixed(2)}%</b><span>${threat>=50?'경영권이 인수된 상태':threat>=35?'경영권 방어가 필요한 수준':threat>=15?'인수 움직임을 주시할 수준':'현재 경영권은 비교적 안정적'}</span></article>
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
    <div class="treasury-holdings">${holdings.length?holdings.map(h=>{const pnl=Number(h.pnl||0),rp=Number(h.realized_pnl||0),di=Number(h.dividend_income||0);return `<article><div><b>${escapeHtml(h.name)}</b><small>${escapeHtml(h.ticker)} · ${escapeHtml(h.market_area)} ${escapeHtml(h.market_country||'')} · ${escapeHtml(h.sector||'')}</small></div><span>${nf.format(Number(h.shares))}주<br><small>평균 ${won(h.avg_price)}</small></span><strong>${compactMoney(h.market_value)}원</strong><em class="${pnl>=0?'up':'down'}">평가 ${pnl>=0?'+':''}${compactMoney(pnl)}원<br><small>확정 ${rp>=0?'+':''}${compactMoney(rp)} · 배당 +${compactMoney(di)}</small></em></article>`}).join(''):`<div class="empty compact">회사 자금으로 보유한 전략투자가 없습니다.</div>`}</div>
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
    <div class="repair-steps"><article><b>1</b><span><strong>이번 패치의 SQL 실행</strong><small><code>KX_CORPORATE_RUN_ONLY_THIS_V59.sql</code> 전체를 Supabase SQL Editor에서 한 번 실행합니다.</small></span></article><article><b>2</b><span><strong>페이지 새로고침 없이 확인</strong><small>위의 ‘연결 다시 확인’을 누르면 통합 온라인 API를 바로 다시 검사합니다.</small></span></article><article><b>3</b><span><strong>온라인 모드만 사용</strong><small>로컬 BOT 모드로 전환하지 않으며 모든 회사 데이터는 서버에 저장됩니다.</small></span></article></div>
    <div class="repair-detail"><b>현재 오류</b><code>${err}</code><span>이 복구 SQL은 회사 서버 API만 보강하며 기존 회사·유저·주식·은행 데이터는 삭제하지 않습니다.</span></div>
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
  return `<section class="company-latest-news"><div class="company-section-head"><div><small>MARKET NEWS</small><h2>최근 기업 뉴스</h2></div><button data-company-section-jump="risk" class="section-link">뉴스·IR 전체 보기</button></div><div class="latest-news-grid">${rows.length?rows.map(a=>`<article class="${Number(a.sentiment_impact||0)<0?'negative':''}"><small>${escapeHtml(a.outlet_name||'경제뉴스')} · ${escapeHtml(a.company_name||'')}</small><b>${escapeHtml(a.headline)}</b><p>${escapeHtml(a.article_body||'')}</p></article>`).join(''):`<div class="empty">아직 보도된 뉴스가 없습니다.</div>`}</div></section>`;
}

function renderDashboardProgress(my){
  const allProjects=state.company?.projects||[];
  const projects=allProjects.filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).slice(0,4);
  const incomes=(state.company?.investment_income||[]).slice(0,5);
  const activeCount=allProjects.filter(p=>String(p.status)==='ACTIVE').length;
  const paybackCount=allProjects.filter(p=>String(p.status)==='PAYBACK').length;
  const realized=incomes.reduce((sum,x)=>sum+Number(x.amount||0),0);
  const totalReturn=projects.reduce((sum,p)=>sum+Number(p.realized_return||0),0);
  return `<section class="dashboard-progress refined-progress-panel"><div class="company-section-head"><div><small>WHAT IS HAPPENING NOW</small><h2>내 결정이 지금 어떻게 진행되고 있나</h2></div><button data-company-section-jump="operations" class="section-link">사업 운영 전체 보기</button></div><div class="dashboard-progress-summary"><article><small>실행 중 프로젝트</small><b>${activeCount}개</b><span>현재 돈을 쓰며 진행 중인 과제</span></article><article><small>회수 단계</small><b>${paybackCount}개</b><span>완료 후 수익을 돌려받는 단계</span></article><article><small>최근 확정 수익</small><b class="${realized>=0?'up':'down'}">${realized>=0?'+':''}${compactMoney(realized)}원</b><span>최근 기록된 법인현금 유입 합계</span></article><article><small>누적 회수 금액</small><b>${compactMoney(totalReturn)}원</b><span>현재 화면의 프로젝트에서 확인되는 회수 금액</span></article></div><div class="dashboard-progress-grid"><div class="dashboard-projects"><h3>진행 중 프로젝트</h3>${projects.length?projects.map(p=>{const d=Math.max(1,Number(p.duration_cycles)||1),n=Math.min(d,Number(p.progress_cycles)||0),pc=p.status==='PAYBACK'?100:Math.round(n/d*100);return `<article><span><b>${escapeHtml(p.title||p.project_type)}</b><small>${projectStatusLabel(p)} · ${p.status==='PAYBACK'?`회수 ${Number(p.payout_cycles_remaining||0)}회 남음`:`${n}/${d}주기 진행`}</small></span><div><i style="width:${pc}%"></i></div><strong>${compactMoney(p.realized_return||0)}원 회수</strong></article>`}).join(''):`<div class="empty compact">진행 중 프로젝트가 없습니다.</div>`}</div><div class="dashboard-income"><h3>최근 법인현금 유입</h3>${incomes.length?incomes.map(x=>`<article><span><b>${escapeHtml(x.source_name||'투자수익')}</b><small>${escapeHtml(x.income_label||x.income_type)}</small></span><strong class="${Number(x.amount)>=0?'up':'down'}">${Number(x.amount)>=0?'+':''}${compactMoney(x.amount)}원</strong></article>`).join(''):`<div class="empty compact">아직 확정된 투자 수익이 없습니다.</div>`}</div></div></section>`;
}
function renderCompanyWorkspace(my){
  const section=state.companySection||'dashboard';
  if(section==='operations')return `${renderCompanyCommand(my)}${renderPeopleFinanceDesk(my)}${renderInvestmentReturnPanel(my)}${renderCorporateMarket(my)}${renderGlobalExpansion(my)}<details class="management-details"><summary>회사 세부 상태 보기</summary>${renderCompanyPulse(my)}</details>`;
  if(section==='competition')return `${renderTakeoverCrisis(my)}${renderCompetitionBoard(my)}<details class="management-details"><summary>내 지분·경영권 현황 보기</summary>${renderTakeoverDesk(my)}</details>`;
  if(section==='risk')return `${renderMediaDesk(my)}<details class="management-details"><summary>세금·준법 관리</summary>${renderTaxOffice(my)}</details>`;
  return `${renderTakeoverCrisis(my)}${renderCompanyGrowthPanel(my)}${renderDashboardProgress(my)}${renderExecutiveAgenda(my)}${renderCompanyLatestNews(my)}`;
}

function renderCompanySubnav(my){
  const section=state.companySection||'dashboard';
  const active=(state.company?.projects||[]).filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).length;
  const threat=companyStakeAgainstMe();
  const newsCount=(state.company?.press||[]).length;
  const taxIssue=Number(my.tax_due||0)+Number(my.tax_arrears||0);
  const items=[
    ['dashboard','경영 홈','핵심 지표와 안건'],
    ['operations','사업 운영',active?`프로젝트 ${active}개 진행 중`:'새 프로젝트 시작'],
    ['competition','투자·M&A',threat>=15?`경영권 위험 ${threat.toFixed(1)}%`:'경쟁사 분석'],
    ['risk','뉴스·리스크',taxIssue>0?`세무 이슈 ${compactMoney(taxIssue)}원`:newsCount?`최근 뉴스 ${newsCount}건`:'IR·세무 점검']
  ];
  return `<nav class="company-section-switcher">${items.map(([k,title,desc])=>`<button data-company-section="${k}" class="${section===k?'on':''}"><b>${title}</b><span>${desc}</span></button>`).join('')}</nav>`;
}

function renderCompanyCompactContext(my,myRank,companies){
  return `<div class="company-compact-context"><div><small>LIVE COMPANY</small><b>${escapeHtml(my.name)}</b><span>${escapeHtml(my.sector)} · #${myRank||'-'} / ${companies.length}</span></div><div><span>주가 <b>${companySharePriceText(my)}</b></span><span>회사 가치 <b>${formatKrwSmart(my.valuation)}</b></span><span>법인현금 <b>${formatKrwSmart(my.cash)}</b></span></div></div>`;
}
function renderCompanySectionIntro(my){
  const section=state.companySection||'dashboard';
  const projects=(state.company?.projects||[]).filter(p=>['ACTIVE','PAYBACK'].includes(String(p.status))).length;
  const holdings=(state.company?.my_holdings||[]).length;
  const articles=(state.company?.press||[]).length;
  const map={
    operations:['BUSINESS COMMAND','사업 운영 · 해외 확장','R&D·설비·인재·품질 프로젝트와 해외사업을 관리합니다. 투자금이 어디에 쓰이고 언제 수익으로 돌아오는지 이 화면에서 확인하세요.',`진행 프로젝트 ${projects}개`],
    competition:['INVESTMENT & M&A','기업 분석 · 투자 · 인수','회사명·국가·업종으로 경쟁사를 찾고 주가 차트·뉴스·실적을 확인한 뒤 투자나 인수를 결정합니다.',`투자 기업 ${holdings}개`],
    risk:['NEWSROOM & RISK','뉴스 보도 · IR · 리스크','언론사를 선택하면 그 매체가 회사 상태를 바탕으로 기사를 자체 작성합니다. 비용이 싼 매체는 과장 보도와 역풍 위험이 더 큽니다.',`최근 15분 기사 ${articles}건`]
  };
  const x=map[section]||map.operations;
  return `<section class="company-section-intro section-${section}"><div><small>${x[0]}</small><h1>${x[1]}</h1><p>${x[2]}</p></div><strong>${x[3]}</strong></section>`;
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
  const health=Number(my.cash||0)>=Math.max(120000000,Number(my.revenue||0)*0.12)?'현금 여력 안정':'현금 여력 주의';
  const notice=state.companyNotice?escapeHtml(state.companyNotice):'위 메뉴를 누르면 해당 업무 화면이 바로 열립니다.';
  const dashboardHero=`<div class="company-hero-grid">
      <section class="company-hero-card">
        <div class="company-hero-head"><div><small>CEO OFFICE · LIVE MANAGEMENT</small><h1>${escapeHtml(my.name)}</h1><p>${escapeHtml(my.sector)} · 대한민국 · 전체 ${companies.length}개 회사 중 <b>#${myRank||'-'}</b> · ${companyScaleLabel(my.valuation)}</p></div><div class="company-hero-price"><small>현재 주가</small><b>${companySharePriceText(my)}</b><span class="${Number(my.last_return_pct||0)>=0?'up':'down'}">${Number(my.last_return_pct||0)>=0?'+':''}${Number(my.last_return_pct||0).toFixed(2)}%</span></div></div>
        <div class="company-hero-metrics">
          <article><small>회사 가치</small><b>${formatKrwSmart(my.valuation)}</b><span>법인 현금 ${formatKrwSmart(my.cash)}</span></article>
          <article><small>매출</small><b>${compactMoney(my.revenue)}원</b><span class="${grow>=0?'up':'down'}">전기 대비 ${pct(grow)}</span></article>
          <article><small>영업이익</small><b class="${Number(my.profit)>=0?'up':'down'}">${compactMoney(my.profit)}원</b><span>이익률 ${margin.toFixed(1)}%</span></article>
          <article><small>시장 점유율</small><b>${Number(my.domestic_share||0).toFixed(2)}%</b><span>글로벌 ${Number(my.global_share||0).toFixed(2)}%</span></article>
          <article class="${threat>=35?'danger':''}"><small>경영권 위험</small><b>${threat.toFixed(1)}%</b><span>${threat>=35?'방어 필요':'현재 안정'}</span></article>
        </div>
      </section>
      <aside class="company-briefing-card">
        <small>오늘의 브리핑</small><h3>지금 가장 먼저 볼 것</h3>
        <ul><li><b>사업 운영</b><span>진행 중 ${activeProjects}개 · 회수 단계 ${paybackProjects}개</span></li><li><b>현금 상태</b><span>${health}</span></li><li><b>최근 수익</b><span>${latestIncome?`${escapeHtml(latestIncome.source_name||'투자수익')} ${Number(latestIncome.amount)>=0?'+':''}${compactMoney(latestIncome.amount)}원`:'아직 확정 수익이 없습니다.'}</span></li><li><b>최근 뉴스</b><span>${shortHeadline}</span></li></ul>
        <div class="briefing-shortcuts"><button data-company-section="operations">사업 보기</button><button data-company-section="competition">M&A 보기</button><button data-company-section="risk">뉴스 보기</button></div>
      </aside>
    </div>`;
  const sectionTop=state.companySection==='dashboard'?dashboardHero:`${renderCompanyCompactContext(my,myRank,companies)}${renderCompanySectionIntro(my)}`;
  return `<main class="page-view company-page"><section class="panel page-panel company-shell management-first-shell v52-clean-shell corporate-ui-refresh">
    ${sectionTop}
    <div class="company-notice ui-refresh-notice ${state.companyNotice?'':'muted'}" id="companyMsg">${notice}</div>
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
  return `<main class="page-view narrow-view"><section class="panel page-panel company-ranking-page clean-ranking"><div class="page-title"><div><small>CORPORATE LEAGUE</small><h1>기업 순위</h1></div><span>전체 ${companies.length}개 회사${myRank?` · 내 회사 #${myRank}`:''}</span></div><div class="rank-explain">처음 만든 회사가 곧바로 상위권에 들지 않습니다. BOT 기업과 다른 유저 회사가 같은 온라인 시장에서 장기간 성장합니다.</div><h2 class="rank-subtitle">TOP 20</h2><div class="ranklist corporate-ranklist">${top.map((r,i)=>row(r,i+1)).join('')}</div>${around.length?`<h2 class="rank-subtitle my-zone">내 회사 주변 순위</h2><div class="ranklist corporate-ranklist around-rank">${around.map((r,i)=>row(r,Math.max(1,myIdx-3)+i+1)).join('')}</div>`:''}</section></main>`;
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
  let rows=[...(state.companyAnalysis?.history||[])].sort((a,b)=>Number(a.cycle_no)-Number(b.cycle_no)).slice(-MAX_SLOTS).map((r,i,arr)=>{
    const prev=i?Number(arr[i-1].close_price||arr[i-1].share_price||0):Number(r.open_price||r.share_price||r.close_price||0);
    let c=Number(r.close_price||r.share_price||prev),o=Number(r.open_price||prev||c),h=Number(r.high_price||Math.max(o,c)),l=Number(r.low_price||Math.min(o,c));
    if(!(c>0))c=prev||1;if(!(o>0))o=c;h=Math.max(Number(h)||c,o,c);l=Math.min(Number(l)||c,o,c);
    return {...r,_o:o,_c:c,_h:h,_l:l,_v:Math.max(0,Number(r.volume)||0)};
  }).filter(r=>r._c>0);
  if(!rows.length){const ctx=canvas.getContext('2d');ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#7b899c';ctx.font='12px sans-serif';ctx.textAlign='center';ctx.fillText('공용 주가 데이터가 쌓이는 중입니다.',Math.max(180,canvas.clientWidth/2),160);return;}
  const newest=Number(rows[rows.length-1]?.cycle_no||0);
  if(companyChartSeriesCache.id!==companyId){companyChartSeriesCache={id:companyId,lastCycle:newest,rows,panStartedAt:0};}
  else if(newest!==companyChartSeriesCache.lastCycle){companyChartSeriesCache={id:companyId,lastCycle:newest,rows,panStartedAt:performance.now()};}
  else if(companyChartSeriesCache.rows.length!==rows.length){companyChartSeriesCache.rows=rows;}
  rows=companyChartSeriesCache.rows.slice(-MAX_SLOTS);

  const dpr=window.devicePixelRatio||1,W=Math.max(420,canvas.clientWidth||650),H=340;
  if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr)}
  const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,W,H);
  const actualLo=Math.min(...rows.map(r=>r._l)),actualHi=Math.max(...rows.map(r=>r._h)),center=(actualHi+actualLo)/2||1;
  if(companyChartAxisCache.id!==companyId||!(companyChartAxisCache.hi>companyChartAxisCache.lo)){
    const band=Math.max(actualHi-actualLo,center*.16,1),mid=(actualHi+actualLo)/2;
    companyChartAxisCache={id:companyId,lo:Math.max(.01,mid-band*.65),hi:mid+band*.65};
  }else{
    const span=Math.max(1,companyChartAxisCache.hi-companyChartAxisCache.lo);
    // Never shrink/recenter while watching. Expand only after price genuinely leaves the fixed frame.
    if(actualHi>companyChartAxisCache.hi)companyChartAxisCache.hi=actualHi+span*.10;
    if(actualLo<companyChartAxisCache.lo)companyChartAxisCache.lo=Math.max(.01,actualLo-span*.10);
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
      <div class="brand"><div class="kxlogo">KX</div><strong>KX CORPORATE</strong><span class="online-mode-chip ${state.companyAvailable===false?'offline':'online'}">${state.companyAvailable===false?'ONLINE 연결 필요':'ONLINE · LIVE 5.11'}</span></div>
      ${topNav()}
      <div class="market-status corporate-cycle-status"><b data-live-company-cycle>경영주기 #${liveCompanyClock().cycle}</b><span data-live-game-clock>DAY ${liveCompanyClock().day} · ${gameTime(liveCompanyClock().minute)}</span><em>24분 = 1 DAY</em></div>
      <div class="header-money company-header-money"><div class="asset cash"><small>법인 현금</small><b>${legalCash}</b></div><div class="asset"><small>회사 가치</small><b>${companyValue}</b></div></div>
      <button class="tutorial-btn" id="tutorialBtn">튜토리얼</button><button class="logout" id="logout">로그아웃</button>
    </header>
    <div class="mobile-account-bar"><span>법인 현금 <b>${legalCash}</b></span><span>회사 가치 <b>${companyValue}</b></span></div>
    ${content}
    <nav class="mobile-nav management-mobile-nav">
      <button data-main-tab="company" data-company-section-nav="dashboard" class="${state.tab==='company'&&state.companySection==='dashboard'?'on':''}">경영</button>
      <button data-main-tab="company" data-company-section-nav="operations" class="${state.tab==='company'&&state.companySection==='operations'?'on':''}">사업</button>
      <button data-main-tab="company" data-company-section-nav="competition" class="${state.tab==='company'&&state.companySection==='competition'?'on':''}">M&A</button>
      <button data-main-tab="company" data-company-section-nav="risk" class="${state.tab==='company'&&state.companySection==='risk'?'on':''}">뉴스</button>
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
        const d=await companyApi('CREATE',{p_name:name,p_sector:sector});
        if(d?.ok===false)throw new Error(d.message||'회사 설립에 실패했습니다.');
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
    state.companyRegion=b.dataset.companyRegion||'국내';state.companySearch='';state.companyAnalysisId=null;state.companyAnalysis=null;companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};renderTerminal();
  });
  const companySearchForm=document.getElementById('companySearchForm');
  if(companySearchForm)companySearchForm.onsubmit=e=>{e.preventDefault();state.companySearch=String(document.getElementById('companySearchInput')?.value||'').trim();state.companyAnalysisId=null;state.companyAnalysis=null;companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};renderTerminal();};
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
    try{
      const d=await companyApi(route,body||{});
      if(d?.ok===false)throw new Error(d.message||'경영 결정을 처리하지 못했습니다.');
      state.companyNotice=d?.message||'경영 결정이 온라인 회사 데이터에 반영되었습니다.';
      await loadCompanyLayer(false,false);
      renderTerminal(true);
      return d;
    }catch(err){
      state.companyNotice='처리 실패: '+err.message;
      if(msg)msg.textContent=state.companyNotice;else alert(state.companyNotice);
    }
  };

  document.querySelectorAll('[data-project-decision]').forEach(b=>b.onclick=()=>{
    const projectId=Number(b.dataset.projectDecision),choice=b.dataset.projectChoice||'STEADY';
    const label=choice==='BOOST'?'추가 투자':choice==='SCALE_DOWN'?'범위 축소':'기존 계획 유지';
    companyRun('PROJECT_DECISION',{p_project_id:projectId,p_choice:choice},`${label}로 프로젝트 중간 결정을 확정할까요?`);
  });

  document.querySelectorAll('[data-company-action]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyAction;
    const amount=Math.max(0,parseCompanyMoney(document.getElementById('companyActionAmount')?.value,0));
    const labels={RND:'R&D 투자',QUALITY:'품질·안전 투자',MARKETING:'마케팅 투자',CAPEX:'설비 투자',HIRING:'핵심 인재 채용',WELFARE:'복지·보상 강화',PRICE_WAR:'가격 경쟁',COSTCUT:'비용 구조조정',DIVIDEND:'배당 실시',COMPLIANCE:'준법·감사 투자',LOAN:'기업 대출',REPAY:'부채 상환'};
    const risky=action==='PRICE_WAR'?'가격 경쟁은 점유율을 얻는 대신 이익과 브랜드에 부담이 생깁니다. ':action==='COSTCUT'?'구조조정은 현금을 개선하지만 직원 사기와 평판에 부담이 생깁니다. ':action==='LOAN'?'대출은 현금을 늘리지만 부채와 신용 부담이 커집니다. ':'';
    companyRun('kx_company_action',{p_action:action,p_amount:amount},`${risky}${labels[action]||'경영 결정'}을 실행할까요?`);
  });

  document.querySelectorAll('[data-company-defense]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyDefense;
    const amount=Math.max(40000000,parseCompanyMoney(document.getElementById('takeoverDefenseBudget')?.value,150000000));
    const labels={BUYBACK:'긴급 자사주 매입',NEGOTIATE:'공격 기업과 지분 매각 협상',WHITE_KNIGHT:'백기사 우호지분 확보',POISON_PILL:'포이즌필 발동',RIGHTS_ISSUE:'긴급 유상증자',COUNTER_TAKEOVER:'역인수·맞지분 전략'};
    const warnings={POISON_PILL:'강력한 방어 효과가 있지만 브랜드와 운영에 단기 부담이 생깁니다. ',RIGHTS_ISSUE:'신주 발행으로 공격자 지분이 희석되지만 기존 주주도 함께 희석됩니다. ',COUNTER_TAKEOVER:'상대 회사를 공격하는 만큼 많은 현금이 묶일 수 있습니다. '};
    companyRun('kx_company_defense',{p_action:action,p_budget:amount},`${warnings[action]||''}${labels[action]||'경영권 방어'}을 실행할까요? 인수전에서는 한 경영 라운드에 하나의 방어 결정만 할 수 있습니다.`);
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

  document.querySelectorAll('[data-company-tender]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companyTender);
    const amount=Math.max(50000000,parseCompanyMoney(document.getElementById(`takeBudget_${id}`)?.value,300000000));
    companyRun('kx_company_tender_offer',{p_target_company_id:id,p_budget:amount,p_premium_pct:15},`${formatKrwSmart(amount)} 한도로 공개매수를 시작할까요? 시장가에 15% 프리미엄을 지급해 더 많은 지분을 확보하지만 상대 회사의 경영권 방어 때문에 실제 매입량이 줄 수 있습니다.`);
  });

  document.querySelectorAll('[data-company-sell]').forEach(b=>b.onclick=()=>{
    const id=Number(b.dataset.companySell);
    const amount=Math.max(1000000,parseCompanyMoney(document.getElementById('companyActionAmount')?.value,100000000));
    companyRun('kx_company_sell_shares',{p_target_company_id:id,p_amount:amount},`${formatKrwSmart(amount)} 상당의 보유지분을 현재 기업가치 기준으로 일부 매각할까요?`);
  });

  document.querySelectorAll('[data-company-market-side]').forEach(b=>b.onclick=()=>{
    const ticker=document.getElementById('corpStockTicker')?.value;
    const side=b.dataset.companyMarketSide;
    const amount=Math.max(10000,parseCompanyMoney(document.getElementById('corpStockAmount')?.value,50000000));
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:side,p_amount:amount},`회사 자금으로 ${ticker}를 ${side==='BUY'?'매수':'매도'}할까요?`);
  });


  document.querySelectorAll('[data-company-quick-market-side]').forEach(b=>b.onclick=()=>{
    const ticker=selected()?.ticker;
    const side=b.dataset.companyQuickMarketSide;
    const amount=Math.max(1000000,parseCompanyMoney(document.getElementById('quickCorpAmount')?.value,50000000));
    companyRun('kx_company_trade_market',{p_ticker:ticker,p_side:side,p_amount:amount},`${escapeHtml(ticker)}를 회사 전략자산으로 ${side==='BUY'?'매수':'매도'}할까요? 이 거래의 손익·업종·해외 여부가 회사 경영지표에도 반영됩니다.`);
  });

  document.querySelectorAll('[data-company-analyze]').forEach(b=>b.onclick=async()=>{
    markUiInteraction();
    const id=Number(b.dataset.companyAnalyze),browser=document.querySelector('.clean-company-browser');
    const listScroll=browser?.scrollTop||0,pageX=scrollX,pageY=scrollY;
    state.companyAnalysisId=id;state.companyAnalysis=null;state.companySection='competition';
    companyChartAxisCache={id:null,lo:null,hi:null};companyChartSeriesCache={id:null,lastCycle:null,rows:[],panStartedAt:0};
    document.querySelectorAll('[data-company-analyze]').forEach(x=>x.classList.toggle('on',Number(x.dataset.companyAnalyze)===id));
    const slot=document.getElementById('companyAnalysisSlot');if(slot)slot.innerHTML=renderCompanyAnalysisLoading();
    try{
      const profile=await companyApi('PROFILE',{p_company_id:id});
      if(!profile?.company)throw new Error(profile?.message||'기업 프로필 응답이 비어 있습니다.');
      state.companyAnalysis=profile;
      const currentSlot=document.getElementById('companyAnalysisSlot');
      if(currentSlot){
        currentSlot.innerHTML=renderCompanyAnalysisPanel(state.company?.my_company||{});
        bind();bindCompanyMoneyInputs();
        requestAnimationFrame(()=>drawCompanyTargetChart());
      }else renderTerminal(true);
      const restored=document.querySelector('.clean-company-browser');if(restored)restored.scrollTop=listScroll;
      requestAnimationFrame(()=>scrollTo(pageX,pageY));
    }catch(err){
      state.companyNotice='기업 분석을 불러오지 못했습니다: '+err.message;
      const currentSlot=document.getElementById('companyAnalysisSlot');
      if(currentSlot)currentSlot.innerHTML=`<aside class="company-analysis-panel empty-analysis analysis-error"><div><b>기업 분석을 불러오지 못했습니다</b><p>${escapeHtml(err.message)}</p></div></aside>`;
      const restored=document.querySelector('.clean-company-browser');if(restored)restored.scrollTop=listScroll;
      requestAnimationFrame(()=>scrollTo(pageX,pageY));
    }
  });

  document.querySelectorAll('[data-company-metric]').forEach(b=>b.onclick=()=>{state.companyMetric=b.dataset.companyMetric||'valuation';renderTerminal();});


  document.querySelectorAll('[data-company-media]').forEach(b=>b.onclick=async()=>{
    const outlet=b.dataset.companyMedia,cost=Math.max(0,Number(b.dataset.mediaCost)||0),name=b.dataset.mediaName||'언론사';
    const targetId=Math.max(0,Number(document.getElementById('companyMediaTarget')?.value)||Number(state.company?.my_company?.id)||0);
    const target=(state.company?.companies||[]).find(c=>Number(c.id)===targetId)||state.company?.my_company;
    const risk=['QUICK_BUZZ','RUMOR_POST'].includes(outlet)?'저가 매체는 과장·오보로 역효과가 날 가능성이 큽니다. ':outlet==='EDGE_MEDIA'?'저렴한 온라인 매체라 자극적인 기사 위험이 있습니다. ':'';
    const result=await companyRun('kx_company_media_v52',{p_outlet:outlet,p_target_company_id:targetId},`${risk}${name}에 ${formatKrwSmart(cost)}을 지불하고 ${target?.name||'선택한 회사'} 보도를 맡길까요? 기사 제목과 내용은 언론사가 해당 회사 상태를 보고 자체 작성합니다.`);
    if(result?.headline)showCompanyPressFlash({headline:result.headline,article_body:result.article_body,outlet_name:result.outlet_name||name,bot_flow:result.bot_flow,company_id:result.target_company_id||targetId});
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
      :'온라인 연결에 실패했습니다. KX_CORPORATE_RUN_ONLY_THIS_V59.sql 실행 결과에서 api_exists=true인지 확인해 주세요.';
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
  app.innerHTML='<div class="boot"><div class="kxlogo">KX</div><b>KX CORPORATE</b><span>온라인 회사 리그·기업시장에 연결하는 중…</span></div>';
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
