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
  side:'BUY',type:'LIMIT',tif:'DAY',tab:'market'
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

async function ensureFreshBuild(){
  try{
    const r=await fetch(`/version.json?t=${Date.now()}`,{cache:'no-store'});
    if(!r.ok)return true;
    const remote=await r.json();
    const local=String(C.buildId||'');
    if(remote?.buildId && remote.buildId!==local){
      location.replace(`/?kxv=${encodeURIComponent(remote.buildId)}&t=${Date.now()}`);
      return false;
    }
  }catch(e){console.warn('build freshness check skipped',e)}
  return true;
}
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
    if(!lastSeenNewsId)lastSeenNewsId=maxId;
    else {
      const unseen=rows.filter(n=>(Number(n.id)||0)>lastSeenNewsId&&['BREAKING','EXTRA'].includes(n.severity)).sort((a,b)=>(Number(a.id)||0)-(Number(b.id)||0));
      if(unseen.length)showNewsFlash(unseen[unseen.length-1]);
    }
    lastSeenNewsId=Math.max(lastSeenNewsId,maxId);
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
const NEWS_SEV={NORMAL:'일반',BREAKING:'속보',EXTRA:'호외'};
const ORDER_STATUS={OPEN:'미체결',PARTIAL:'부분체결',FILLED:'체결완료',CANCELED:'취소',REJECTED:'거절'};
let syncBusy=false,syncRound=0;

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
function totalAssets(){
  return Number(state.account?.cash||0)+state.positions.reduce((sum,p)=>{
    const current=Number(state.stocks.find(s=>s.ticker===p.ticker)?.last_price)||0;
    return sum+Number(p.quantity)*current;
  },0);
}
function changeOf(stock){return ((Number(stock.last_price)-Number(stock.prev_close))/Math.max(1,Number(stock.prev_close)))*100}

function topNav(){
  const items=[['market','시장'],['portfolio','내 자산'],['orders','주문 내역'],['news','뉴스'],['ranking','랭킹']];
  return `<nav class="main-nav">${items.map(([k,label])=>`<button data-main-tab="${k}" class="${state.tab===k?'on':''}">${label}</button>`).join('')}</nav>`;
}

function renderWatch(s){
  return `<section class="panel watch">
    <div class="panel-title"><b>종목</b><small>${state.stocks.length}개</small></div>
    <div class="watch-list">${state.stocks.map(x=>{
      const c=changeOf(x);
      return `<button class="stockrow ${x.ticker===s.ticker?'on':''}" data-ticker="${x.ticker}">
        <span class="stock-name"><b>${escapeHtml(x.name)}</b><small>${escapeHtml(x.sector)}</small></span>
        <span class="stock-price"><b>${nf.format(x.last_price)}</b><small class="${c>=0?'up':'down'}">${pct(c)}</small></span>
      </button>`;
    }).join('')}</div>
  </section>`;
}

function renderChartPanel(s,ch){
  const keyNews=state.news.find(n=>n.ticker===s.ticker&&n.severity!=='NORMAL');
  const tape=state.trades.slice(0,5);
  return `<section class="panel chart-panel">
    <div class="stockhead">
      <div>
        <div class="stock-code">${s.ticker} · ${escapeHtml(s.sector)}</div>
        <h1>${escapeHtml(s.name)}</h1>
        <p>${escapeHtml(s.description)}</p>
      </div>
      <div class="quote"><b>${nf.format(s.last_price)}</b><strong class="${ch>=0?'up':'down'}">${pct(ch)}</strong></div>
    </div>
    <div class="ohlc">
      <span>시가 <b>${nf.format(s.open_price)}</b></span>
      <span>고가 <b>${nf.format(s.high_price)}</b></span>
      <span>저가 <b>${nf.format(s.low_price)}</b></span>
      <span>전일 <b>${nf.format(s.prev_close)}</b></span>
      <span>거래량 <b>${nf.format(s.volume)}</b></span>
    </div>
    ${keyNews?`<button class="headline-strip" data-main-tab="news"><span>${keyNews.severity==='EXTRA'?'호외':'속보'}</span><b>${escapeHtml(keyNews.headline)}</b></button>`:''}
    <div class="chartbox"><canvas id="chart"></canvas></div>
    <div class="tape">
      <div class="tape-head"><b>최근 체결</b><small>체결이 있을 때만 현재가가 변합니다</small></div>
      <div class="tape-list">${tape.length?tape.map(t=>`<div class="tape-row">
        <span>${new Date(t.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false})}</span>
        <b>${nf.format(t.price)}</b><span>${nf.format(t.quantity)}주</span>
      </div>`).join(''):`<div class="empty compact">아직 체결이 없습니다.</div>`}</div>
    </div>
  </section>`;
}

function renderBook(s,ch){
  const asks=state.depth.filter(d=>d.side==='ASK').sort((a,b)=>b.price-a.price).slice(-5);
  const bids=state.depth.filter(d=>d.side==='BID').sort((a,b)=>b.price-a.price).slice(0,5);
  const mx=Math.max(1,...[...asks,...bids].map(d=>Number(d.quantity)||0));
  return `<section class="panel book">
    <div class="panel-title"><b>주요 호가</b><small>상·하위 5단계</small></div>
    <div class="depth">
      ${asks.map(d=>`<div class="drow ask"><i style="width:${Math.min(100,d.quantity/mx*100)}%"></i><b>${nf.format(d.price)}</b><span>${nf.format(d.quantity)}</span></div>`).join('')}
      <div class="mid"><b>${nf.format(s.last_price)}</b><span class="${ch>=0?'up':'down'}">${pct(ch)}</span></div>
      ${bids.map(d=>`<div class="drow bid"><i style="width:${Math.min(100,d.quantity/mx*100)}%"></i><b>${nf.format(d.price)}</b><span>${nf.format(d.quantity)}</span></div>`).join('')}
    </div>
  </section>`;
}

function renderOrder(s){
  return `<section class="panel order">
    <div class="panel-title"><b>주문</b><small id="globalMsg"></small></div>
    <div class="order-body">
      <div class="tabs2">
        <button class="buy ${state.side==='BUY'?'on':''}" data-side="BUY">매수</button>
        <button class="sell ${state.side==='SELL'?'on':''}" data-side="SELL">매도</button>
      </div>
      <div class="order-grid">
        <label>주문 방식<select id="otype"><option value="LIMIT" ${state.type==='LIMIT'?'selected':''}>지정가</option><option value="MARKET" ${state.type==='MARKET'?'selected':''}>시장가</option></select></label>
        <label>수량<input id="qty" type="number" min="1" value="1"></label>
        <label id="priceWrap" class="span2">가격<input id="price" type="number" min="1" value="${Math.round(s.last_price)}"></label>
      </div>
      <details class="advanced">
        <summary>고급 체결 조건</summary>
        <label>체결 조건<select id="tif"><option value="DAY" ${state.tif==='DAY'?'selected':''}>DAY · 장 마감까지</option><option value="IOC" ${state.tif==='IOC'?'selected':''}>IOC · 즉시 체결 후 취소</option><option value="FOK" ${state.tif==='FOK'?'selected':''}>FOK · 전량 즉시 체결</option></select></label>
      </details>
      <button id="submitOrder" class="submit ${state.side==='BUY'?'buy':'sell'}">${state.side==='BUY'?'매수':'매도'} 주문</button>
      <div class="msg" id="orderMsg">가격은 실제 체결이 발생할 때만 움직입니다.</div>
    </div>
  </section>`;
}

function renderMarket(s,ch){
  return `<main class="market-workspace">
    ${renderWatch(s)}
    ${renderChartPanel(s,ch)}
    <aside class="trade-stack">${renderBook(s,ch)}${renderOrder(s)}</aside>
  </main>`;
}

function renderPortfolio(){
  const holdings=state.positions.reduce((sum,p)=>{
    const cur=Number(state.stocks.find(x=>x.ticker===p.ticker)?.last_price)||0;
    return sum+Number(p.quantity)*cur;
  },0);
  return `<main class="page-view"><section class="panel page-panel">
    <div class="page-title"><div><small>MY ASSETS</small><h1>내 자산</h1></div><span>평가금액은 현재 체결가 기준</span></div>
    <div class="summary">
      <div><small>현금</small><b>${won(state.account?.cash)}</b></div>
      <div><small>주식 평가액</small><b>${won(holdings)}</b></div>
      <div><small>실현손익</small><b class="${Number(state.account?.realized_pnl)>=0?'up':'down'}">${won(state.account?.realized_pnl)}</b></div>
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
  return `<main class="page-view"><section class="panel page-panel">
    <div class="page-title"><div><small>MARKET NEWS</small><h1>시장 뉴스</h1></div><span>모든 접속자에게 같은 뉴스가 공개됩니다</span></div>
    <div class="newslist">${state.news.length?state.news.map(n=>{
      const sev=NEWS_SEV[n.severity]||n.severity||'일반';
      const mood=Number(n.sentiment)>=0?'호재':'악재';
      const sevClass=n.severity==='EXTRA'?'extra':n.severity==='BREAKING'?'breaking':'';
      return `<article class="newsitem">
        <div class="newsmeta"><span class="newsbadge ${sevClass}">${escapeHtml(sev)}</span><span>${escapeHtml(n.ticker||n.sector||'시장')}</span><span class="${Number(n.sentiment)>=0?'up':'down'}">${mood}</span><time>${n.created_at?new Date(n.created_at).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}):''}</time></div>
        <h3>${escapeHtml(n.headline)}</h3><p>${escapeHtml(n.body)}</p>
      </article>`;
    }).join(''):`<div class="empty">아직 발표된 뉴스가 없습니다.</div>`}</div>
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

function renderTerminal(){
  const s=selected();if(!s)return;
  const ch=changeOf(s);
  const content=state.tab==='market'?renderMarket(s,ch)
    :state.tab==='portfolio'?renderPortfolio()
    :state.tab==='orders'?renderOrders()
    :state.tab==='news'?renderNews()
    :renderRanking();

  app.innerHTML=`<div class="terminal">
    <header class="top">
      <div class="brand"><div class="kxlogo">KX</div><strong>KX EXCHANGE</strong></div>
      ${topNav()}
      <div class="market-status"><b>DAY ${state.clock?.game_day||1}</b><span>${gameTime(state.clock?.game_minute||0)}</span><em>${SESS[state.clock?.session]||'-'}</em></div>
      <div class="asset"><small>총자산</small><b>${won(totalAssets())}</b></div>
      <button class="logout" id="logout">로그아웃</button>
    </header>
    ${content}
    <nav class="mobile-nav">
      <button data-main-tab="market" class="${state.tab==='market'?'on':''}">시장</button>
      <button data-main-tab="portfolio" class="${state.tab==='portfolio'?'on':''}">자산</button>
      <button data-main-tab="orders" class="${state.tab==='orders'?'on':''}">주문</button>
      <button data-main-tab="news" class="${state.tab==='news'?'on':''}">뉴스</button>
      <button data-main-tab="ranking" class="${state.tab==='ranking'?'on':''}">랭킹</button>
    </nav>
  </div>`;
  bind();
  if(state.tab==='market')drawChart();
}

function bind(){
  document.getElementById('logout').onclick=logout;

  document.querySelectorAll('[data-main-tab]').forEach(b=>b.onclick=async()=>{
    const next=b.dataset.mainTab;
    state.tab=next;
    if(next==='news'||next==='ranking'){
      try{await loadPublicSnapshot(true,false)}catch(e){console.error(e)}
    }
    renderTerminal();
  });

  document.querySelectorAll('[data-ticker]').forEach(b=>b.onclick=async()=>{
    state.ticker=b.dataset.ticker;
    await loadPublicSnapshot(false,false);
    renderTerminal();
  });

  document.querySelectorAll('[data-side]').forEach(b=>b.onclick=()=>{
    state.side=b.dataset.side;
    renderTerminal();
  });

  const ot=document.getElementById('otype');
  if(ot){
    ot.onchange=()=>{
      state.type=ot.value;
      const pw=document.getElementById('priceWrap');
      if(pw)pw.style.display=state.type==='MARKET'?'none':'grid';
    };
    ot.onchange();
  }
  const tif=document.getElementById('tif');
  if(tif)tif.onchange=e=>state.tif=e.target.value;
  const submit=document.getElementById('submitOrder');
  if(submit)submit.onclick=placeOrder;

  document.querySelectorAll('[data-cancel]').forEach(b=>b.onclick=()=>cancelOrder(b.dataset.cancel));
}

async function placeOrder(){
  const s=selected(),msg=document.getElementById('orderMsg');
  try{
    const type=document.getElementById('otype').value;
    const body={
      p_ticker:s.ticker,p_side:state.side,p_order_type:type,
      p_quantity:Math.max(1,Math.floor(Number(document.getElementById('qty').value)||1)),
      p_limit_price:type==='LIMIT'?Number(document.getElementById('price').value):null,
      p_tif:document.getElementById('tif')?.value||state.tif||'DAY'
    };
    const d=await rpc('kx_place_order',body);
    const o=Array.isArray(d)?d[0]:d;
    msg.textContent=o?.status==='FILLED'?`전량 체결 · 평균 ${won(o.avg_fill_price)}`:`주문 접수 · ${ORDER_STATUS[o?.status]||o?.status||''}`;
    await sync(false,false,true);
  }catch(e){if(msg)msg.textContent=e.message}
}
async function cancelOrder(id){
  try{await rpc('kx_cancel_order',{p_order:id});await sync(false,false,true)}
  catch(e){alert(e.message)}
}

function drawChart(){
  const c=document.getElementById('chart');if(!c)return;
  const ctx=c.getContext('2d'),r=c.getBoundingClientRect(),dpr=devicePixelRatio||1;
  c.width=Math.max(300,Math.floor(r.width*dpr));c.height=Math.max(220,Math.floor(r.height*dpr));ctx.scale(dpr,dpr);
  const W=r.width,H=r.height,rows=state.candles.slice(-60);
  ctx.clearRect(0,0,W,H);
  ctx.strokeStyle='#202a36';ctx.lineWidth=1;
  for(let i=1;i<5;i++){const y=H*i/5;ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
  if(rows.length<2){ctx.fillStyle='#7f8da1';ctx.font='12px sans-serif';ctx.fillText('체결 데이터가 쌓이면 1분봉 차트가 표시됩니다.',20,30);return}
  const hi=Math.max(...rows.map(x=>Number(x.high))),lo=Math.min(...rows.map(x=>Number(x.low))),span=Math.max(1,hi-lo),pad=20;
  const step=(W-pad*2)/rows.length,y=p=>pad+(hi-p)/span*(H-pad*2);
  rows.forEach((x,i)=>{
    const xx=pad+i*step+step/2,up=Number(x.close)>=Number(x.open);
    ctx.strokeStyle=ctx.fillStyle=up?'#e95f65':'#5b87e5';
    ctx.beginPath();ctx.moveTo(xx,y(Number(x.high)));ctx.lineTo(xx,y(Number(x.low)));ctx.stroke();
    const yy=Math.min(y(Number(x.open)),y(Number(x.close)));
    const hh=Math.max(1,Math.abs(y(Number(x.open))-y(Number(x.close))));
    ctx.fillRect(xx-Math.max(1,step*.25),yy,Math.max(2,step*.50),hh);
  });
  ctx.fillStyle='#7f8da1';ctx.font='10px sans-serif';
  ctx.fillText(`고 ${nf.format(hi)}`,W-88,14);
  ctx.fillText(`저 ${nf.format(lo)}`,W-88,H-8);
}

async function start(){
  app.innerHTML='<div class="boot"><div class="kxlogo">KX</div><b>KX EXCHANGE</b><span>공용 시장에 연결하는 중…</span></div>';
  if(!session.user){
    try{session.user=await req('/auth/v1/user');save()}catch{}
  }
  try{await rpc('kx_join_exchange',{})}catch(e){console.warn('KX join marker skipped:',e.message)}
  await sync(true,true,true);
  setInterval(()=>sync(true,false,false),15000);
  setInterval(()=>ensureFreshBuild(),60000);
  addEventListener('resize',()=>{if(document.getElementById('chart'))drawChart()});
}
async function boot(){
  if(!(await ensureFreshBuild()))return;
  if(!C.supabaseUrl||!C.supabaseAnonKey)return renderDiag();
  try{session=JSON.parse(localStorage.getItem(LS)||'null')}catch{}
  if(session&&await validate())return start();
  renderAuth();
}
boot();
})();
