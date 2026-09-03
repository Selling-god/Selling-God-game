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
  side:'BUY',type:'LIMIT',tif:'DAY',tab:'market',tradeTab:'book',
  orderQty:1,orderPrice:null,pendingOrder:null
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
  app.innerHTML=`<div class="diag"><div><h1>KX EXCHANGE 설정 필요</h1><p>Supabase 환경변수가 비어 있어 시장에 연결할 수 없습니다.</p><code>NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_ANON_KEY</code><p>Render Environment에 두 값을 넣고 다시 배포해 주세요.</p></div></div>`;
}

function renderAuth(){
  app.innerHTML=`<main class="auth"><form class="auth-card" id="authForm">
    <div class="kxlogo">KX</div>
    <h1>KX EXCHANGE</h1>
    <p>공용 호가와 실제 체결 구조를 사용하는 주식시장 시뮬레이션</p>
    <div class="auth-tabs"><button type="button" class="on" data-mode="login">로그인</button><button type="button" data-mode="signup">회원가입</button></div>
    <label id="nickWrap" style="display:none">닉네임<input id="nickname" maxlength="18"></label>
    <label>이메일<input id="email" type="email" required></label>
    <label>비밀번호<input id="password" type="password" minlength="6" required></label>
    <button class="primary" id="authSubmit">시장 입장</button>
    <small class="auth-msg" id="authMsg"></small>
  </form></main>`;
  let mode='login';
  document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{
    mode=b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('on',x===b));
    document.getElementById('nickWrap').style.display=mode==='signup'?'grid':'none';
    document.getElementById('authSubmit').textContent=mode==='signup'?'계정 만들기':'시장 입장';
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
async function sync(advance=false,full=false,forcePrivate=false){
  if(syncBusy)return;
  syncBusy=true;
  try{
    if(advance)syncRound++;
    const includeAux=full||syncRound%4===0;
    await loadPublicSnapshot(includeAux,advance);
    if(full||forcePrivate||syncRound%2===0)await loadPrivateSnapshot();
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
function totalAssets(){return Number(state.account?.cash||0)+stockAssets()+bankAssets()-bankDebt()}
function changeOf(stock){return ((Number(stock.last_price)-Number(stock.prev_close))/Math.max(1,Number(stock.prev_close)))*100}

function topNav(){
  const items=[['market','시장'],['portfolio','내 자산'],['orders','주문 내역'],['news','뉴스'],['bank','은행'],['ranking','랭킹']];
  return `<nav class="main-nav">${items.map(([k,label])=>`<button data-main-tab="${k}" class="${state.tab===k?'on':''}">${label}</button>`).join('')}</nav>`;
}

function renderStockPicker(s){
  const sorted=[...state.stocks].sort((a,b)=>Math.abs(changeOf(b))-Math.abs(changeOf(a)));
  const watch=[s,...sorted.filter(x=>x.ticker!==s.ticker)].slice(0,8);
  return `<aside class="watchlist-panel">
    <div class="watchlist-head"><div><small>WATCHLIST</small><b>관심 종목</b></div><span>${state.stocks.length} 종목</span></div>
    <label class="stock-search-select"><span>종목 바로가기</span><select id="stockSelect">${state.stocks.map(x=>`<option value="${x.ticker}" ${x.ticker===s.ticker?'selected':''}>${escapeHtml(x.name)} · ${x.ticker}</option>`).join('')}</select></label>
    <div class="watchlist-list">${watch.map(x=>{const c=changeOf(x);return `<button data-ticker="${x.ticker}" class="watch-row ${x.ticker===s.ticker?'on':''}"><span><b>${escapeHtml(x.name)}</b><small>${x.ticker} · ${escapeHtml(x.sector)}</small></span><strong>${nf.format(x.last_price)}</strong><em class="${c>=0?'up':'down'}">${pct(c)}</em></button>`}).join('')}</div>
  </aside>`;
}

function renderChartPanel(s,ch){
  const keyNews=state.news.find(n=>(n.ticker===s.ticker||(!n.ticker&&n.sector===s.sector))&&n.severity!=='NORMAL');
  const tape=state.trades.slice(0,4);
  const latestNews=state.news.slice(0,3);
  return `<section class="panel chart-panel balanced-chart">
    <div class="stockhead balanced-head">
      <div>
        <div class="stock-code">${s.ticker} · ${escapeHtml(s.sector)}</div>
        <h1>${escapeHtml(s.name)}</h1>
        <p>${escapeHtml(s.description)}</p>
      </div>
      <div class="quote"><b>${nf.format(s.last_price)}</b><strong class="${ch>=0?'up':'down'}">${pct(ch)}</strong></div>
    </div>
    <div class="ohlc balanced-ohlc">
      <span>시가 <b>${nf.format(s.open_price)}</b></span><span>고가 <b>${nf.format(s.high_price)}</b></span><span>저가 <b>${nf.format(s.low_price)}</b></span><span>전일 <b>${nf.format(s.prev_close)}</b></span><span>거래량 <b>${nf.format(s.volume)}</b></span>
    </div>
    ${latestNews.length?`<div class="news-wire"><span class="wire-live">LIVE</span><div class="wire-track">${latestNews.map(n=>`<button data-main-tab="news"><b>${n.severity==='EXTRA'?'호외':n.severity==='BREAKING'?'속보':'뉴스'}</b><span>${escapeHtml(n.headline)}</span><time>${n.created_at?new Date(n.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></button>`).join('')}</div></div>`:''}
    ${keyNews?`<button class="headline-strip" data-main-tab="news"><span>${keyNews.severity==='EXTRA'?'호외':'속보'}</span><b>${escapeHtml(keyNews.headline)}</b><small>기사 보기</small></button>`:''}
    <div class="chart-toolbar"><b>1분봉</b><span>최근 ${Math.min(60,state.candles.length)}개 봉</span><small>이상 체결값은 차트 표시 범위만 자동 보정</small></div>
    <div class="chartbox balanced-chartbox"><canvas id="chart"></canvas></div>
    <div class="tape compact-tape balanced-tape">
      <div class="tape-head"><b>최근 체결</b><small>실제 체결가가 현재가에 반영됩니다</small></div>
      <div class="tape-list">${tape.length?tape.map(t=>`<div class="tape-row"><span>${new Date(t.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span><b>${nf.format(t.price)}</b><span>${nf.format(t.quantity)}주</span></div>`).join(''):`<div class="empty compact">아직 체결이 없습니다.</div>`}</div>
    </div>
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

function renderOrder(s){
  const qty=Math.max(1,Math.floor(Number(state.orderQty)||1));
  const price=state.orderPrice==null?Math.round(Number(s.last_price)||0):state.orderPrice;
  return `<div class="trade-pane order-pane">
    <div class="order-body">
      <div class="tabs2"><button class="buy ${state.side==='BUY'?'on':''}" data-side="BUY">매수</button><button class="sell ${state.side==='SELL'?'on':''}" data-side="SELL">매도</button></div>
      <div class="order-grid">
        <label>주문 방식<select id="otype"><option value="LIMIT" ${state.type==='LIMIT'?'selected':''}>지정가</option><option value="MARKET" ${state.type==='MARKET'?'selected':''}>시장가</option></select></label>
        <label>수량<input id="qty" type="number" min="1" value="${qty}"></label>
        <label id="priceWrap" class="span2">지정 가격<input id="price" type="number" min="1" value="${Math.round(Number(price)||Number(s.last_price)||1)}"></label>
      </div>
      <div class="order-help" id="orderHelp">${state.type==='MARKET'?'시장가: 현재 호가에서 즉시 체결을 시도합니다. 실제 체결금액은 호가 상황에 따라 달라질 수 있습니다.':'지정가: 내가 정한 가격 이하(매수) 또는 이상(매도)에서만 체결됩니다.'}</div>
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

function renderPortfolio(){
  const holdings=stockAssets();
  const deposits=bankAssets(),loans=bankDebt();
  return `<main class="page-view"><section class="panel page-panel">
    <div class="page-title"><div><small>MY ASSETS</small><h1>내 자산</h1></div><span>평가금액은 현재 체결가 기준</span></div>
    <div class="summary asset-summary">
      <div><small>주문 가능 현금</small><b>${won(state.account?.cash)}</b></div>
      <div><small>주식 평가액</small><b>${won(holdings)}</b></div>
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
  return `<main class="page-view"><section class="panel page-panel newsroom">
    <div class="page-title newsroom-title"><div><small>KX MARKET NEWS · LIVE</small><h1>시장 뉴스</h1></div><span>가격·뉴스·발표 시각은 모든 접속자에게 동일합니다</span></div>
    ${lead?`<article class="lead-news ${lead.severity==='EXTRA'?'extra':lead.severity==='BREAKING'?'breaking':''}">
      <div class="newsmeta"><span class="newsbadge ${lead.severity==='EXTRA'?'extra':lead.severity==='BREAKING'?'breaking':''}">${NEWS_SEV[lead.severity]||'일반'}</span><span>${escapeHtml(lead.ticker||lead.sector||'시장')}</span><time>${lead.created_at?new Date(lead.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div>
      <h2>${escapeHtml(lead.headline)}</h2><p>${escapeHtml(lead.body)}</p>
    </article>`:''}
    <div class="newslist">${rest.length?rest.map(n=>{
      const sev=NEWS_SEV[n.severity]||n.severity||'일반';const mood=Number(n.sentiment)>=0?'매수 우위':'매도 우위';const sevClass=n.severity==='EXTRA'?'extra':n.severity==='BREAKING'?'breaking':'';
      return `<article class="newsitem"><div class="newsmeta"><span class="newsbadge ${sevClass}">${escapeHtml(sev)}</span><span>${escapeHtml(n.ticker||n.sector||'시장')}</span><span class="${Number(n.sentiment)>=0?'up':'down'}">${mood}</span><time>${n.created_at?new Date(n.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div><h3>${escapeHtml(n.headline)}</h3><p>${escapeHtml(n.body)}</p></article>`;
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
  return `<main class="page-view narrow-view"><section class="panel page-panel">
    <div class="page-title"><div><small>RANKING</small><h1>총자산 랭킹</h1></div><span>실제로 KX EXCHANGE에 참여한 계정만 표시</span></div>
    <div class="ranklist">${state.ranking.length?state.ranking.map((r,i)=>`<div class="rankrow">
      <strong>${i+1}</strong><span><b>${escapeHtml(r.nickname)}</b><small>실현손익 ${won(r.realized_pnl)}</small></span><b>${won(r.total_assets)}</b>
    </div>`).join(''):`<div class="empty">아직 랭킹에 등록된 플레이어가 없습니다.</div>`}</div>
  </section></main>`;
}

function openTutorial(){
  document.getElementById('kxTutorial')?.remove();
  const el=document.createElement('div');el.id='kxTutorial';el.className='tutorial-backdrop';
  el.innerHTML=`<section class="tutorial-card tutorial-card-wide" role="dialog" aria-modal="true" aria-label="KX EXCHANGE 튜토리얼">
    <button class="tutorial-close" aria-label="닫기">×</button>
    <div class="tutorial-kicker">KX EXCHANGE GUIDE</div><h2>처음 거래할 때 보는 안내</h2><p class="tutorial-intro">가격·뉴스·시장 시간은 모든 플레이어가 같은 공용 시장을 봅니다. 아래 흐름만 이해하면 바로 거래할 수 있습니다.</p>
    <div class="tutorial-basics">
      <article><b>시장가 주문</b><p><strong>가격을 정하지 않고 지금 시장에서 가장 유리한 호가부터 즉시 체결</strong>시키는 주문입니다. 빨리 사고팔 수 있지만 주문 수량이 크면 여러 호가에 걸쳐 체결되어 예상보다 비싸게 사거나 싸게 팔 수 있습니다.</p></article>
      <article><b>지정가 주문</b><p><strong>내가 원하는 가격을 직접 정하는 주문</strong>입니다. 매수는 지정한 가격 이하, 매도는 지정한 가격 이상에서만 체결됩니다. 가격이 오지 않으면 미체결로 남을 수 있습니다.</p></article>
    </div>
    <ol class="tutorial-steps">
      <li><b>1. 종목 고르기</b><span>왼쪽 관심 종목 또는 종목 바로가기에서 회사를 선택합니다.</span></li>
      <li><b>2. 차트 보기</b><span>캔들은 1분 동안의 시가·고가·저가·종가를 나타냅니다. 빨강/파랑 봉과 최근 체결 흐름을 함께 봅니다.</span></li>
      <li><b>3. 호가 보기</b><span>매도호가는 팔려는 가격, 매수호가는 사려는 가격입니다. 가장 가까운 호가부터 실제 주문이 체결됩니다.</span></li>
      <li><b>4. 주문하기</b><span>시장가 또는 지정가, 수량을 정하고 주문 확인 버튼을 누르면 예상 금액을 한 번 더 확인한 뒤 최종 주문합니다.</span></li>
      <li><b>5. 체결 조건</b><span>DAY는 장 마감까지 유지, IOC는 가능한 만큼 즉시 체결 후 나머지 취소, FOK는 전량 즉시 체결되지 않으면 전부 취소입니다.</span></li>
      <li><b>6. 뉴스 보기</b><span>속보·호외는 모든 플레이어에게 같은 뉴스 ID와 발표시각으로 공개됩니다. 뉴스는 매수·매도 주문 흐름에 영향을 줍니다.</span></li>
      <li><b>7. 자산 관리</b><span>내 자산에서 평균단가와 평가손익을 확인하고 주문 내역에서 미체결 주문을 취소할 수 있습니다.</span></li>
      <li><b>8. 손실이 나는 이유</b><span>약세장·불안장, 악재, 고평가 되돌림, 거래비용 때문에 주가는 실제로 하락할 수 있습니다. 고점 추격이나 대출 투자에는 손실 위험이 있습니다.</span></li>
      <li><b>9. 은행 이용</b><span>예금·적금은 현금이 묶이고 이자를 받습니다. 대출은 현금을 늘리지만 부채가 총자산에서 차감되고 매 DAY 이자와 원금 상환이 발생합니다.</span></li>
      <li><b>10. 핵심 원칙</b><span>가격은 브라우저마다 랜덤으로 움직이지 않습니다. 공용 시장에서 발생한 체결과 뉴스가 모든 플레이어에게 같은 현재가와 같은 시각으로 반영됩니다.</span></li>
    </ol>
    <div class="tutorial-tip"><b>처음이라면</b><span>종목 선택 → 뉴스 확인 → 호가 확인 → 소량 주문 → 체결 결과 확인 순서로 연습해 보세요.</span></div>
    <button class="tutorial-start">확인하고 시작하기</button>
  </section>`;
  document.body.appendChild(el);
  const close=()=>el.remove();el.querySelector('.tutorial-close').onclick=close;el.querySelector('.tutorial-start').onclick=close;el.onclick=e=>{if(e.target===el)close()};
}

function renderTerminal(){
  const s=selected();if(!s)return;
  const ch=changeOf(s);
  const content=state.tab==='market'?renderMarket(s,ch)
    :state.tab==='portfolio'?renderPortfolio()
    :state.tab==='orders'?renderOrders()
    :state.tab==='news'?renderNews()
    :state.tab==='bank'?renderBank()
    :renderRanking();

  app.innerHTML=`<div class="terminal">
    <header class="top">
      <div class="brand"><div class="kxlogo">KX</div><strong>KX EXCHANGE</strong></div>
      ${topNav()}
      <div class="market-status"><b>DAY ${state.clock?.game_day||1}</b><span>${gameTime(state.clock?.game_minute||0)}</span><em>${SESS[state.clock?.session]||'-'}</em><i class="market-regime ${(state.clock?.market_regime||'NEUTRAL').toLowerCase()}">${REGIME[state.clock?.market_regime||'NEUTRAL']||'중립'}장</i></div>
      <div class="header-money"><div class="asset cash"><small>보유 현금</small><b>${won(state.account?.cash)}</b></div><div class="asset"><small>총자산</small><b>${won(totalAssets())}</b></div></div>
      <button class="tutorial-btn" id="tutorialBtn">? 튜토리얼</button><button class="logout" id="logout">로그아웃</button>
    </header>
    ${content}
    <nav class="mobile-nav">
      <button data-main-tab="market" class="${state.tab==='market'?'on':''}">시장</button>
      <button data-main-tab="portfolio" class="${state.tab==='portfolio'?'on':''}">자산</button>
      <button data-main-tab="orders" class="${state.tab==='orders'?'on':''}">주문</button>
      <button data-main-tab="news" class="${state.tab==='news'?'on':''}">뉴스</button>
      <button data-main-tab="bank" class="${state.tab==='bank'?'on':''}">은행</button>
      <button data-main-tab="ranking" class="${state.tab==='ranking'?'on':''}">랭킹</button>
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
    <dl class="confirm-grid"><div><dt>주문 방식</dt><dd>${body.p_order_type==='MARKET'?'시장가':'지정가'}</dd></div><div><dt>수량</dt><dd>${nf.format(body.p_quantity)}주</dd></div>${body.p_order_type==='LIMIT'?`<div><dt>지정 가격</dt><dd>${nf.format(body.p_limit_price)}원</dd></div>`:`<div><dt>예상 평균가</dt><dd>약 ${nf.format(est.avg)}원</dd></div>`}<div class="wide"><dt>${buy?'예상 출금액':'예상 거래금액'}</dt><dd class="confirm-amount">약 ${won(est.amount)}</dd></div></dl>
    <p class="confirm-note">${escapeHtml(est.note)}${body.p_order_type==='MARKET'?'입니다. 시장가 주문은 주문 순간 호가 변화와 여러 가격대 체결 때문에 실제 금액이 달라질 수 있습니다.':''}</p>
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
    closeOrderConfirm();
    if(msg)msg.textContent=o?.status==='FILLED'?`전량 체결 · 평균 ${won(o.avg_fill_price)}`:`주문 접수 · ${ORDER_STATUS[o?.status]||o?.status||''}`;
    await sync(false,false,true);
  }catch(e){if(btn)btn.disabled=false;const note=document.querySelector('.confirm-note');if(note)note.textContent='주문 실패: '+e.message;else if(msg)msg.textContent=e.message;}
}

function bind(){
  document.getElementById('logout').onclick=logout;
  const tb=document.getElementById('tutorialBtn');if(tb)tb.onclick=openTutorial;

  document.querySelectorAll('[data-main-tab]').forEach(b=>b.onclick=async()=>{
    rememberOrderInputs();
    const next=b.dataset.mainTab;
    state.tab=next;
    if(next==='news'||next==='ranking'){
      try{await loadPublicSnapshot(true,false)}catch(e){console.error(e)}
    }
    renderTerminal();
  });

  document.querySelectorAll('[data-ticker]').forEach(b=>b.onclick=async()=>{rememberOrderInputs();state.ticker=b.dataset.ticker;state.orderPrice=null;await loadPublicSnapshot(false,false);renderTerminal();});
  const ss=document.getElementById('stockSelect');if(ss)ss.onchange=async()=>{rememberOrderInputs();state.ticker=ss.value;state.orderPrice=null;await loadPublicSnapshot(false,false);renderTerminal();};
  document.querySelectorAll('[data-trade-tab]').forEach(b=>b.onclick=()=>{rememberOrderInputs();state.tradeTab=b.dataset.tradeTab;renderTerminal();});

  document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{
    rememberOrderInputs();state.side=b.dataset.side;renderTerminal();
  });

  const ot=document.getElementById('otype');
  if(ot){
    ot.onchange=()=>{
      state.type=ot.value;
      const pw=document.getElementById('priceWrap');
      if(pw)pw.style.display=state.type==='MARKET'?'none':'grid';
      const oh=document.getElementById('orderHelp');if(oh)oh.textContent=state.type==='MARKET'?'시장가: 현재 호가에서 즉시 체결을 시도합니다. 실제 체결금액은 호가 상황에 따라 달라질 수 있습니다.':'지정가: 내가 정한 가격 이하(매수) 또는 이상(매도)에서만 체결됩니다.';
    };
    ot.onchange();
  }
  const qty=document.getElementById('qty');if(qty){qty.oninput=()=>state.orderQty=Math.max(1,Math.floor(Number(qty.value)||1));qty.onchange=qty.oninput;}
  const price=document.getElementById('price');if(price){price.oninput=()=>state.orderPrice=Math.max(1,Number(price.value)||1);price.onchange=price.oninput;}
  const tif=document.getElementById('tif');
  if(tif)tif.onchange=e=>state.tif=e.target.value;
  const submit=document.getElementById('submitOrder');
  if(submit)submit.onclick=placeOrder;

  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancel));

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
  const out=[];
  for(const row of src){
    if(out.length){
      const prev=out[out.length-1],gap=Number(row.candle_no)-Number(prev.candle_no);
      if(gap>1&&gap<=6){for(let n=1;n<gap;n++){out.push({candle_no:Number(prev.candle_no)+n,open:Number(prev.close),high:Number(prev.close),low:Number(prev.close),close:Number(prev.close),volume:0,synthetic:true})}}
    }
    out.push(row);
  }
  return out;
}
function chartRange(rows,ticker){
  const lows=rows.map(x=>Number(x.low)).filter(x=>x>0),highs=rows.map(x=>Number(x.high)).filter(x=>x>0);
  const actualLo=Math.min(...lows),actualHi=Math.max(...highs);if(!Number.isFinite(actualLo)||!Number.isFinite(actualHi))return {lo:1,hi:2};
  const last=Number(rows[rows.length-1]?.close)||actualLo,base=Math.max(1,actualHi-actualLo,last*.004);
  return {lo:Math.max(1,actualLo-base*.10),hi:actualHi+base*.10};
}

function drawChart(){
  const c=document.getElementById('chart');if(!c)return;
  const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;
  c.width=Math.max(300,Math.floor(r.width*dpr));c.height=Math.max(240,Math.floor(r.height*dpr));ctx.setTransform(dpr,0,0,dpr,0,0);
  const W=r.width,H=r.height,rows=normalizedCandles(state.candles).slice(-60);ctx.clearRect(0,0,W,H);
  const L=12,R=78,T=22,B=32,plotW=Math.max(100,W-L-R),plotH=Math.max(120,H-T-B);
  if(rows.length<2){ctx.fillStyle='#8897aa';ctx.font='13px sans-serif';ctx.fillText('체결 데이터가 쌓이면 1분봉 차트가 표시됩니다.',L+10,T+24);return}
  const rg=chartRange(rows,state.ticker),lo=rg.lo,hi=rg.hi,last=Number(rows[rows.length-1].close)||lo;
  const y=p=>T+(hi-Number(p))/(hi-lo)*plotH;
  ctx.lineWidth=1;ctx.strokeStyle='#202a36';ctx.fillStyle='#7f8da1';ctx.font='11px sans-serif';ctx.textAlign='left';
  for(let i=0;i<=4;i++){const yy=T+plotH*i/4;ctx.beginPath();ctx.moveTo(L,yy);ctx.lineTo(L+plotW,yy);ctx.stroke();ctx.fillText(nf.format(Math.round(hi-(hi-lo)*i/4)),L+plotW+10,yy+4)}
  const step=plotW/rows.length;
  rows.forEach((x,i)=>{const xx=L+i*step+step/2,op=Number(x.open),cl=Number(x.close),hg=Number(x.high),lw=Number(x.low),up=cl>=op;ctx.strokeStyle=ctx.fillStyle=up?'#e8666b':'#638be8';ctx.globalAlpha=x.synthetic?.42:1;ctx.beginPath();ctx.moveTo(xx,y(hg));ctx.lineTo(xx,y(lw));ctx.stroke();const yy=Math.min(y(op),y(cl)),hh=Math.max(2,Math.abs(y(op)-y(cl))),bw=Math.max(3,Math.min(12,step*.58));ctx.fillRect(xx-bw/2,yy,bw,hh);ctx.globalAlpha=1});
  const prevClose=Number(selected()?.prev_close||0);if(prevClose>=lo&&prevClose<=hi){ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='#59677a';ctx.beginPath();ctx.moveTo(L,y(prevClose));ctx.lineTo(L+plotW,y(prevClose));ctx.stroke();ctx.restore()}
  ctx.fillStyle='#77869a';ctx.font='10px sans-serif';ctx.textAlign='center';const marks=[0,Math.floor(rows.length/3),Math.floor(rows.length*2/3),rows.length-1];
  for(const idx of [...new Set(marks)]){const x=rows[idx];if(!x)continue;let label=x.created_at?new Date(x.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false}):`#${x.candle_no}`;ctx.fillText(label,L+idx*step+step/2,H-8)}
  ctx.textAlign='left';ctx.fillStyle='#9aa7b8';ctx.font='11px sans-serif';ctx.fillText(`현재 ${nf.format(Math.round(last))}`,L+8,T+14);
}

async function start(){
  app.innerHTML='<div class="boot"><div class="kxlogo">KX</div><b>KX EXCHANGE</b><span>공용 시장에 연결하는 중…</span></div>';
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
