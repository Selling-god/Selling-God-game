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
  companyAvailable:true,companyError:'',companyRegion:'국내',companyNotice:'',
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
function emptyCompany(){return {my_company:null,companies:[],my_markets:[],my_holdings:[],incoming_holdings:[],market_holdings:[],stock_options:[],events:[],world:null,control_case:null}}
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
    const d=runSync?await rpc('kx_game_sync',{}):await rpc('kx_game_snapshot',{});
    state.game=d&&typeof d==='object'?{...emptyGame(),...d}:emptyGame();
    state.gameAvailable=true;state.gameError='';
  }catch(e){
    const raw=String(e?.message||'');
    if(e?.status===404||raw.includes('kx_game_')||raw.includes('Could not find the function')){
      state.gameAvailable=false;state.gameError='Supabase에서 KX 게임 확장 SQL을 아직 찾을 수 없습니다.';
    }else{console.warn('game layer:',e);state.gameError=raw;}
  }
}
async function loadCompanyLayer(runSync=false,force=false){
  if(state.companyAvailable===false&&!force)return;
  try{
    const d=runSync?await rpc('kx_company_sync',{}):await rpc('kx_company_snapshot',{});
    state.company=d&&typeof d==='object'?{...emptyCompany(),...d}:emptyCompany();
    state.companyAvailable=true;state.companyError='';
  }catch(e){
    const raw=String(e?.message||'');
    if(e?.status===404||raw.includes('kx_company_')||raw.includes('Could not find the function')){
      state.companyAvailable=false;
      state.companyError='회사 경영 확장 SQL이 아직 Supabase에 설치되지 않았습니다.';
    }else{
      console.warn('company layer:',e);
      state.companyError=raw||'회사 경영 데이터를 불러오지 못했습니다.';
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
    if(full||state.tab==='company'||syncRound%3===0)await loadCompanyLayer(advance||full,full);
    renderTerminal();
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
  const items=[['company','회사 경영'],['market','증권시장'],['portfolio','개인 자산'],['orders','주문'],['news','뉴스'],['strategy','시장 전략'],['bank','은행'],['ranking','랭킹'],['learn','투자 기초']];
  return `<nav class="main-nav">${items.map(([k,label])=>`<button data-main-tab="${k}" class="${state.tab===k?'on':''}">${label}</button>`).join('')}</nav>`;
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


function companyTypeBadge(c){
  const type=c?.operator_type||(c?.is_bot?'BOT':c?.owner_user_id?'PLAYER':'BOT');
  return `<span class="corp-type ${type==='BOT'?'bot':type==='ME'?'me':'player'}">${type==='BOT'?'BOT 기업':type==='ME'?'내 회사':'유저 회사'}</span>`;
}
function companyCountryBadge(c){return `<span class="corp-country">${escapeHtml(c?.home_country||'대한민국')}</span>`}
function companyMarketStatus(m){
  const p=Number(m?.presence||0);
  return p>=70?'핵심시장':p>=40?'성장시장':p>=15?'진입시장':'시험진출';
}
function renderCompanyCreate(){
  const rivals=(state.company?.companies||[]).filter(c=>c.is_bot).slice(0,8);
  return `<main class="page-view company-page"><section class="panel page-panel company-shell">
    <div class="company-hero">
      <div class="company-hero-copy"><small>KX CORPORATE · STARTUP</small><h1>내 회사를 설립하고 시장에 들어가세요</h1><p>이제 이 게임의 중심은 개인 주식투자만이 아닙니다. 직접 회사를 만들고 국내 BOT·다른 유저 회사와 경쟁한 뒤, 해외시장으로 확장하고 상대 회사 지분까지 인수할 수 있습니다.</p>
        <div class="company-start-rules"><span><b>초기 법인자금</b> 10억원</span><span><b>시작시장</b> 대한민국</span><span><b>경쟁상대</b> BOT + 실제 유저 회사</span><span><b>확장</b> 미국·일본·독일·싱가포르·영국·인도·브라질</span></div>
      </div>
      <form id="companyCreateForm" class="company-create-card">
        <small>NEW COMPANY</small><h2>회사 설립</h2>
        <label>회사 이름<input id="companyName" maxlength="24" placeholder="예: 아스트라 테크" required></label>
        <label>종목 코드<input id="companyTicker" maxlength="6" placeholder="예: AST" required></label>
        <label>주력 산업<select id="companySector"><option>AI·반도체</option><option>게임·콘텐츠</option><option>모빌리티</option><option>바이오</option><option>핀테크</option><option>유통</option><option>에너지</option><option>로보틱스</option><option>산업재·자동화</option><option>기술·서비스</option></select></label>
        <button class="company-primary" type="submit">회사 설립하고 경영 시작</button>
        <p id="companyCreateMsg">회사 이름은 다른 유저와 구분되며, 종목 코드는 영문/숫자 2~6자로 사용합니다.</p>
      </form>
    </div>
    <section class="company-preview">
      <div class="company-section-head"><div><small>MARKET PREVIEW</small><h2>이미 시장에서 움직이는 경쟁사</h2></div><span>회사를 만들면 아래 기업들과 같은 시장에서 경쟁하게 됩니다.</span></div>
      <div class="company-rival-grid">${rivals.map((c,i)=>`<article><div>${companyTypeBadge(c)} ${companyCountryBadge(c)}</div><h3>${escapeHtml(c.name)}</h3><p>${escapeHtml(c.sector)} · ${escapeHtml(c.ai_style||'BOT')}</p><strong>${compactMoney(c.valuation)}원</strong><span>기업가치 순위 #${i+1}</span></article>`).join('')}</div>
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
    ['RND','R&D 투자','기술력·제품경쟁력 상승','장기 성장'],
    ['MARKETING','마케팅','브랜드·국내점유율 상승','시장 확대'],
    ['CAPEX','설비 투자','운영·품질·인력 상승','생산력'],
    ['HIRING','핵심 채용','인력·기술·운영 강화','성장 기반'],
    ['PRICE_WAR','가격 경쟁','점유율 상승, 이익·브랜드 부담','공격적'],
    ['COSTCUT','구조조정','현금흐름 개선, 브랜드 일부 하락','방어적'],
    ['LOAN','기업 대출','현금 확보, 부채와 이자 부담 증가','자금 조달'],
    ['REPAY','부채 상환','재무 안정성 개선','재무 관리']
  ];
  return `<section class="corp-section">
    <div class="company-section-head"><div><small>01 · CEO COMMAND</small><h2>경영 의사결정</h2></div><span>같은 돈을 어디에 쓰느냐에 따라 회사의 강점과 주가가 달라집니다.</span></div>
    <div class="corp-action-bar"><label>기본 집행금액<input id="companyActionAmount" type="number" min="10000000" step="10000000" value="${amount}"></label><span>현재 법인현금 <b>${won(my.cash)}</b></span></div>
    <div class="corp-action-grid">${actions.map(a=>`<button data-company-action="${a[0]}" class="${a[0]==='PRICE_WAR'||a[0]==='LOAN'?'risk':''}"><small>${a[3]}</small><b>${a[1]}</b><span>${a[2]}</span></button>`).join('')}</div>
  </section>`;
}

function renderCompetitionBoard(my){
  const all=(state.company?.companies||[]).filter(c=>Number(c.id)!==Number(my.id));
  const rows=all.filter(c=>state.companyRegion==='국내'?c.home_country==='대한민국':(c.home_country!=='대한민국'||Number(c.global_level)>0||Number(c.global_share)>0))
    .sort((a,b)=>Number(b.valuation)-Number(a.valuation)).slice(0,18);
  const myRank=[...(state.company?.companies||[])].sort((a,b)=>Number(b.valuation)-Number(a.valuation)).findIndex(c=>Number(c.id)===Number(my.id))+1;
  return `<section class="corp-section competition-section">
    <div class="company-section-head"><div><small>02 · COMPETITION</small><h2>${state.companyRegion==='국내'?'국내':'글로벌'} 경쟁 구도</h2></div><span>내 기업가치 전체 순위 <b>#${myRank||'-'}</b></span></div>
    <div class="company-region-tabs"><button data-company-region="국내" class="${state.companyRegion==='국내'?'on':''}">국내 경쟁</button><button data-company-region="해외" class="${state.companyRegion==='해외'?'on':''}">해외·글로벌 경쟁</button></div>
    <div class="competition-table">
      <div class="competition-row head"><span>기업</span><span>기업가치</span><span>주가</span><span>${state.companyRegion==='국내'?'국내':'글로벌'} 점유율</span><span>내 인수지분</span><span>인수</span></div>
      ${rows.length?rows.map((c,i)=>`<div class="competition-row">
        <span class="company-name-cell"><b>#${i+1} ${escapeHtml(c.name)}</b><small>${companyTypeBadge(c)} ${companyCountryBadge(c)} · ${escapeHtml(c.sector)}</small></span>
        <span><b>${compactMoney(c.valuation)}원</b><small>${pct(companyGrowth(c))} 매출성장</small></span>
        <span><b>${won(c.share_price)}</b><small>${escapeHtml(c.ticker)}</small></span>
        <span><b>${Number(state.companyRegion==='국내'?c.domestic_share:c.global_share).toFixed(2)}%</b><small>${escapeHtml(c.last_event||'경쟁 중')}</small></span>
        <span><b class="${Number(c.acquired_stake)>0?'up':''}">${Number(c.acquired_stake||0).toFixed(2)}%</b><small>누적 확보</small></span>
        <span class="takeover-cell"><input id="takeBudget_${c.id}" type="number" min="1000000" step="10000000" value="100000000"><button data-company-buy="${c.id}">지분 매입</button></span>
      </div>`).join(''):`<div class="empty">표시할 경쟁사가 없습니다.</div>`}
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
  return `<section class="corp-section corporate-market">
    <div class="company-section-head"><div><small>05 · CORPORATE TREASURY</small><h2>회사 자금으로 기존 주식시장 운용</h2></div><span>기존 KX 주식 시스템의 현재가를 그대로 사용해 법인자금을 운용합니다.</span></div>
    <div class="treasury-trade">
      <label>시장 종목<select id="corpStockTicker">${opts.map(s=>`<option value="${s.ticker}">${s.market_area==='해외'?'[해외]':'[국내]'} ${escapeHtml(s.name)} · ${escapeHtml(s.ticker)} · ${won(s.last_price)}</option>`).join('')}</select></label>
      <label>거래금액<input id="corpStockAmount" type="number" min="10000" step="10000" value="50000000"></label>
      <div><button data-company-market-side="BUY">법인 매수</button><button data-company-market-side="SELL" class="sell">법인 매도</button></div>
    </div>
    <div class="treasury-holdings">${holdings.length?holdings.map(h=>`<article><div><b>${escapeHtml(h.name)}</b><small>${escapeHtml(h.ticker)} · ${escapeHtml(h.market_area)} ${escapeHtml(h.market_country||'')}</small></div><span>${nf.format(Number(h.shares))}주</span><strong>${compactMoney(h.market_value)}원</strong><em class="${Number(h.pnl)>=0?'up':'down'}">${Number(h.pnl)>=0?'+':''}${compactMoney(h.pnl)}원</em></article>`).join(''):`<div class="empty compact">회사 자금으로 보유한 시장 주식이 없습니다.</div>`}</div>
  </section>`;
}

function renderCompanyEvents(){
  const rows=state.company?.events||[];
  return `<section class="corp-section corp-event-section">
    <div class="company-section-head"><div><small>06 · LIVE CORPORATE NEWS</small><h2>기업 시장 상황</h2></div><span>BOT 인수전·유저 회사의 성장·해외진출 결과가 같은 시장에 누적됩니다.</span></div>
    <div class="corp-event-feed">${rows.length?rows.slice(0,24).map(e=>{const cls=['TAKEOVER','TAKEOVER_BID'].includes(e.event_type)?'takeover':e.event_type==='DEFENSE'?'defense':e.event_type==='CONTROL'?'control':'';return `<article class="${cls}"><div><span>${escapeHtml(e.event_type)}</span><time>${e.created_at?new Date(e.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div><h3>${escapeHtml(e.title)}</h3><p>${escapeHtml(e.body)}</p><small>${escapeHtml(e.company_name||'시장 전체')}</small></article>`}).join(''):`<div class="empty">아직 기업 이벤트가 없습니다.</div>`}</div>
  </section>`;
}

function renderCompanyRoom(){
  if(state.companyAvailable===false){
    return `<main class="page-view company-page"><section class="panel page-panel company-shell"><div class="page-title"><div><small>KX CORPORATE</small><h1>회사 경영</h1></div><span>주식시장 위에 회사 경영·인수·해외경쟁을 추가하는 확장 모드</span></div><div class="company-install-note"><h2>회사 경영 확장 SQL을 먼저 한 번 실행해 주세요</h2><p>${escapeHtml(state.companyError||'kx_company_snapshot 함수를 찾을 수 없습니다.')}</p><code>SUPABASE_COMPANY_EXPANSION.sql</code><span>Supabase SQL Editor에서 패치 ZIP에 들어 있는 위 파일 전체를 실행하면 BOT 기업, 유저 회사, 지분 인수, 해외진출, 법인 주식운용이 활성화됩니다. 기존 주식·은행 기능은 삭제되지 않습니다.</span></div></section></main>`;
  }
  const my=state.company?.my_company;
  if(!my)return renderCompanyCreate();
  const grow=companyGrowth(my),margin=companyProfitMargin(my),debt=companyDebtRatio(my),threat=companyStakeAgainstMe();
  return `<main class="page-view company-page"><section class="panel page-panel company-shell">
    <div class="company-topline">
      <div><small>CEO OFFICE · ${escapeHtml(my.ticker)}</small><h1>${escapeHtml(my.name)}</h1><p>${escapeHtml(my.sector)} · 본사 ${escapeHtml(my.home_country)} · ${my.parent_name?`${escapeHtml(my.parent_name)} 계열사`:'독립 경영'}</p></div>
      <div class="company-share-quote"><small>기업 주가</small><b>${won(my.share_price)}</b><span class="${grow>=0?'up':'down'}">매출성장 ${pct(grow)}</span></div>
    </div>
    <div class="company-kpi-grid">
      <article><small>기업가치</small><b>${compactMoney(my.valuation)}원</b><span>시장평가</span></article>
      <article><small>법인 현금</small><b>${compactMoney(my.cash)}원</b><span>경영·투자 가용자금</span></article>
      <article><small>매출</small><b>${compactMoney(my.revenue)}원</b><span class="${grow>=0?'up':'down'}">${pct(grow)}</span></article>
      <article><small>영업이익</small><b class="${Number(my.profit)>=0?'up':'down'}">${compactMoney(my.profit)}원</b><span>이익률 ${margin.toFixed(1)}%</span></article>
      <article><small>부채</small><b>${compactMoney(my.debt)}원</b><span>기업가치 대비 ${debt.toFixed(1)}%</span></article>
      <article><small>국내 점유율</small><b>${Number(my.domestic_share||0).toFixed(2)}%</b><span>브랜드 ${Number(my.brand||0).toFixed(0)}</span></article>
      <article><small>글로벌 점유율</small><b>${Number(my.global_share||0).toFixed(2)}%</b><span>진출 레벨 ${Number(my.global_level||0)}/5</span></article>
      <article class="${threat>=35?'danger':''}"><small>외부 보유지분</small><b>${threat.toFixed(2)}%</b><span>${threat>=35?'인수 위험 상승':'경영권 방어 상태'}</span></article>
    </div>
    <div class="company-stat-strip"><span>기술력 <b>${Number(my.technology).toFixed(0)}</b></span><span>브랜드 <b>${Number(my.brand).toFixed(0)}</b></span><span>운영 <b>${Number(my.operations).toFixed(0)}</b></span><span>제품력 <b>${Number(my.product_quality).toFixed(0)}</b></span><span>임직원 <b>${nf.format(Number(my.employees))}명</b></span><span>최근 이슈 <b>${escapeHtml(my.last_event||'-')}</b></span></div>
    ${state.companyNotice?`<div class="company-notice" id="companyMsg">${escapeHtml(state.companyNotice)}</div>`:`<div class="company-notice muted" id="companyMsg">경영 결정은 법인 현금·매출·기술·브랜드·시장점유율·기업가치에 연결됩니다.</div>`}
    ${renderTakeoverCrisis(my)}
    ${renderCompanyCommand(my)}
    ${renderCompetitionBoard(my)}
    ${renderGlobalExpansion(my)}
    ${renderTakeoverDesk(my)}
    ${renderCorporateMarket(my)}
    ${renderCompanyEvents()}
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
      <div><small>총자산</small><b>${won(totalAssets())}</b></div>
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
      <article class="bank-product risk"><div class="bank-product-head"><span>레버리지 주의</span><h2>신용대출</h2><strong class="product-rate risk-rate">한도 ${won(state.bankMeta?.available_credit||0)} · 금리는 부채비율에 따라 산정</strong><p>대출금은 현금으로 들어오지만 총자산에서는 부채로 차감됩니다. 투자손실과 대출이자가 동시에 발생할 수 있습니다.</p></div><label>대출금액<input id="loanAmount" type="number" min="100000" step="10000" value="1000000"></label><label>상환기간<select id="loanMonths"><option value="6">6개월</option><option value="12">12개월</option><option value="24">24개월</option></select></label><button id="takeLoan">대출 신청</button></article>
    </div>
    <div class="bank-ledger"><section><h2>예금·적금 현황</h2>${depRows||'<div class="empty compact">가입한 예금·적금이 없습니다.</div>'}</section><section><h2>대출 현황</h2>${loanRows||'<div class="empty compact">대출이 없습니다.</div>'}</section></div>
    <div class="bank-msg" id="bankMsg">예금은 주문 가능 현금에서 빠지고, 대출은 부채로 총자산에서 차감됩니다.</div>
  </section></main>`;
}

function renderRanking(){
  const adj=new Map((state.game?.short_adjustments||[]).map(x=>[String(x.user_id),Number(x.equity)||0]));
  const rows=state.ranking.map(r=>({...r,total_assets:Number(r.total_assets||0)+(adj.get(String(r.user_id))||0)})).sort((a,b)=>Number(b.total_assets)-Number(a.total_assets));
  return `<main class="page-view narrow-view"><section class="panel page-panel">
    <div class="page-title"><div><small>RANKING</small><h1>총자산 랭킹</h1></div><span>공매도 담보·평가손익도 현재 가치로 반영</span></div>
    <div class="ranklist">${rows.length?rows.map((r,i)=>`<div class="rankrow">
      <strong>${i+1}</strong><span><b>${escapeHtml(r.nickname)}</b><small>실현손익 ${won(r.realized_pnl)}</small></span><b>${won(r.total_assets)}</b>
    </div>`).join(''):`<div class="empty">아직 랭킹에 등록된 플레이어가 없습니다.</div>`}</div>
  </section></main>`;
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
    {selector:'.watchlist-panel',kicker:'01 · 종목 선택',title:'먼저 어떤 종목을 볼지 고릅니다',text:'전체·국내·해외 필터와 종목 바로가기를 이용합니다. 종목을 바꾸면 가운데 차트와 오른쪽 호가·주문창이 그 종목 기준으로 바뀝니다.'},
    {selector:'.chartbox',kicker:'02 · 차트',title:'가격이 어떻게 움직였는지 확인합니다',text:'캔들은 시가·고가·저가·종가를 보여줍니다. 노랑 MA5, 보라 MA20, 초록 MA60은 최근 가격의 평균선이며 미래 가격을 보장하는 선이 아닙니다.'},
    {selector:'.trade-card',kicker:'03 · 호가와 주문',title:'호가를 보고 시장가·지정가를 선택합니다',text:'시장가는 빠른 체결을, 지정가는 원하는 가격을 우선합니다. 호가 탭에서 실제 매수·매도 대기 가격을 보고 주문 탭에서 수량과 가격을 정하세요.'},
    {selector:'[data-main-tab="news"]',kicker:'04 · 뉴스',title:'뉴스는 가격 변동의 재료입니다',text:'좋은 뉴스라고 무조건 오르는 것은 아닙니다. 어떤 기업·산업에 영향을 주는지, 이미 가격에 반영됐는지 함께 판단하세요.'},
    {selector:'[data-main-tab="portfolio"]',kicker:'05 · 내 자산',title:'수익률뿐 아니라 포트폴리오 전체를 봅니다',text:'보유 현금, 주식 평가액, 평균 매입가, 평가손익을 확인할 수 있습니다. 한 종목에 너무 몰려 있지는 않은지도 함께 보세요.'},
    {selector:'[data-tour="strategy"]',kicker:'06 · 시장 플레이',title:'이벤트가 생기면 직접 판단하고 거래합니다',text:'실적 발표, 루머 검증, 대형 계약, 배당, IPO가 시간에 따라 등장합니다. 결과가 공개되기 전에 판단을 남기고 실제 매수·매도 또는 공매도로 대응해 보세요.'},
    {selector:'[data-main-tab="ranking"]',kicker:'07 · 경쟁',title:'결국 승부는 내 자산 결과로 확인합니다',text:'별도 레벨이나 미션 점수는 없습니다. 같은 공용 시장에서 어떤 정보를 믿고 어떤 전략을 선택했는지에 따라 총자산 결과가 달라집니다.'}
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
  if(state.tab!=='market'){
    state.tab='market';renderTerminal();setTimeout(()=>startGuidedTour(startIndex),80);return;
  }
  startGuidedTour(startIndex);
}
function renderTerminal(){
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

  app.innerHTML=`<div class="terminal">
    <header class="top">
      <div class="brand"><div class="kxlogo">KX</div><strong>KX CORPORATE</strong></div>
      ${topNav()}
      <div class="market-status"><b>DAY ${state.clock?.game_day||1}</b><span>${gameTime(state.clock?.game_minute||0)}</span><em>${SESS[state.clock?.session]||'-'}</em><i class="market-regime ${(state.clock?.market_regime||'NEUTRAL').toLowerCase()}">${REGIME[state.clock?.market_regime||'NEUTRAL']||'중립'}장</i></div>
      <div class="header-money"><div class="asset cash"><small>개인 현금</small><b>${won(state.account?.cash)}</b></div><div class="asset"><small>개인 총자산</small><b>${won(totalAssets())}</b></div></div>
      <button class="tutorial-btn" id="tutorialBtn">튜토리얼</button><button class="logout" id="logout">로그아웃</button>
    </header>
    <div class="mobile-account-bar"><span>개인 현금 <b>${won(state.account?.cash)}</b></span><span>개인 총자산 <b>${won(totalAssets())}</b></span></div>
    ${content}
    <nav class="mobile-nav">
      <button data-main-tab="company" class="${state.tab==='company'?'on':''}">회사</button>
      <button data-main-tab="market" class="${state.tab==='market'?'on':''}">증권</button>
      <button data-main-tab="portfolio" class="${state.tab==='portfolio'?'on':''}">자산</button>
      <button data-main-tab="news" class="${state.tab==='news'?'on':''}">뉴스</button>
      <button data-main-tab="strategy" class="${state.tab==='strategy'?'on':''}">전략</button>
      <button data-main-tab="bank" class="${state.tab==='bank'?'on':''}">은행</button>
      <button data-main-tab="ranking" class="${state.tab==='ranking'?'on':''}">랭킹</button>
      <button data-main-tab="learn" class="${state.tab==='learn'?'on':''}">기초</button>
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
    if(next==='news')markNewsViewed();
    if(next==='news'||next==='ranking'){
      try{await loadPublicSnapshot(true,false)}catch(e){console.error(e)}
    }
    if(next==='company'){
      try{await loadCompanyLayer(true,true)}catch(e){console.error(e)}
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
  if(companyForm)companyForm.onsubmit=async e=>{
    e.preventDefault();
    const msg=document.getElementById('companyCreateMsg'),btn=companyForm.querySelector('button[type="submit"]');
    const name=document.getElementById('companyName')?.value.trim();
    const ticker=document.getElementById('companyTicker')?.value.trim().toUpperCase();
    const sector=document.getElementById('companySector')?.value;
    if(btn)btn.disabled=true;
    try{
      const d=await rpc('kx_company_create',{p_name:name,p_ticker:ticker,p_sector:sector});
      state.companyNotice=d?.message||'회사 설립이 완료되었습니다.';
      await loadCompanyLayer(true,true);renderTerminal();
    }catch(err){if(msg)msg.textContent=err.message;if(btn)btn.disabled=false}
  };

  document.querySelectorAll('[data-company-region]').forEach(b=>b.onclick=()=>{
    state.companyRegion=b.dataset.companyRegion||'국내';renderTerminal();
  });

  const companyRun=async(name,body,question)=>{
    if(question&&!confirm(question))return;
    const msg=document.getElementById('companyMsg');
    try{
      const d=await rpc(name,body);
      state.companyNotice=d?.message||'경영 결정이 반영되었습니다.';
      await loadCompanyLayer(true,true);renderTerminal();
    }catch(err){
      state.companyNotice='처리 실패: '+err.message;
      if(msg)msg.textContent=state.companyNotice;else alert(state.companyNotice);
    }
  };

  document.querySelectorAll('[data-company-action]').forEach(b=>b.onclick=()=>{
    const action=b.dataset.companyAction;
    const amount=Math.max(0,Math.floor(Number(document.getElementById('companyActionAmount')?.value)||0));
    const labels={RND:'R&D 투자',MARKETING:'마케팅 투자',CAPEX:'설비 투자',HIRING:'핵심 인재 채용',PRICE_WAR:'가격 경쟁',COSTCUT:'비용 구조조정',LOAN:'기업 대출',REPAY:'부채 상환'};
    const risky=action==='PRICE_WAR'?'가격 경쟁은 점유율을 얻는 대신 이익과 브랜드에 부담이 생깁니다. ':action==='LOAN'?'대출은 현금을 늘리지만 부채와 이자 부담이 커집니다. ':'';
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
  const loan=document.getElementById('takeLoan');if(loan)loan.onclick=()=>{const amount=Math.floor(Number(document.getElementById('loanAmount').value)||0),months=Number(document.getElementById('loanMonths').value)||6;bankRun('kx_bank_take_loan',{p_amount:amount,p_term_months:months},`${won(amount)}을 ${months}개월 신용대출로 받을까요? 대출금은 부채로 총자산에서 차감됩니다.`)};
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
  app.innerHTML='<div class="boot"><div class="kxlogo">KX</div><b>KX CORPORATE</b><span>기업·주식시장에 연결하는 중…</span></div>';
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
