'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Account, Candle, Clock, Depth, News, Order, Position, Ranking, Stock, Trade } from '../lib/types';

const nf = new Intl.NumberFormat('ko-KR');
const money = (v:number) => `${nf.format(Math.round(v))}원`;
const signed = (v:number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const SESSION_LABEL:Record<string,string> = { PREOPEN:'장전 동시호가', REGULAR:'정규장', CLOSING:'장마감 동시호가', AFTERHOURS:'시간외 단일가' };

function gameTime(minute:number) {
  const h=Math.floor(minute/60), m=minute%60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function Candles({ data, stock }:{data:Candle[];stock?:Stock}) {
  const width=900, height=330, pad=28;
  const rows=data.slice(-70);
  if (!stock || rows.length<2) return <div className="chart-empty">가격 데이터 생성 중…</div>;
  const max=Math.max(...rows.map(x=>x.high)), min=Math.min(...rows.map(x=>x.low));
  const span=Math.max(1,max-min), step=(width-pad*2)/rows.length;
  const y=(p:number)=>pad+(max-p)/span*(height-pad*2);
  return <svg viewBox={`0 0 ${width} ${height}`} className="candles" preserveAspectRatio="none">
    {[0,.25,.5,.75,1].map((k,i)=><line key={i} x1={0} x2={width} y1={pad+k*(height-pad*2)} y2={pad+k*(height-pad*2)} className="grid"/>)}
    {rows.map((c,i)=>{
      const x=pad+i*step+step/2, up=c.close>=c.open;
      return <g key={c.candle_no} className={up?'up':'down'}>
        <line x1={x} x2={x} y1={y(c.high)} y2={y(c.low)} />
        <rect x={x-Math.max(1,step*.28)} width={Math.max(2,step*.56)} y={Math.min(y(c.open),y(c.close))} height={Math.max(1,Math.abs(y(c.open)-y(c.close)))} />
      </g>;
    })}
    <text x={width-6} y={16} textAnchor="end" className="axis">고 {nf.format(max)}</text>
    <text x={width-6} y={height-7} textAnchor="end" className="axis">저 {nf.format(min)}</text>
  </svg>;
}

function AuthBox({ onDone }:{onDone:()=>void}) {
  const [mode,setMode]=useState<'login'|'signup'>('login');
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [nickname,setNickname]=useState(''); const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent){
    e.preventDefault(); setBusy(true); setMsg('');
    try {
      if(mode==='signup'){
        const {data,error}=await supabase.auth.signUp({email,password,options:{data:{nickname:nickname.trim()}}}); if(error) throw error;
        setMsg(data.session?'가입 완료':'가입 완료. 이메일 인증이 켜져 있다면 인증 후 로그인하세요.');
        if(data.session) onDone();
      } else {
        const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) throw error; onDone();
      }
    }catch(err){setMsg(err instanceof Error?err.message:'로그인 오류');}finally{setBusy(false);}
  }
  return <div className="auth-shell"><form className="auth-card" onSubmit={submit}>
    <div className="brand-mark">KX</div><h1>KX EXCHANGE</h1><p>실제 거래소 구조 기반 멀티플레이 주식 시뮬레이터</p>
    <div className="auth-tabs"><button type="button" className={mode==='login'?'on':''} onClick={()=>setMode('login')}>로그인</button><button type="button" className={mode==='signup'?'on':''} onClick={()=>setMode('signup')}>회원가입</button></div>
    {mode==='signup'&&<label>닉네임<input value={nickname} onChange={e=>setNickname(e.target.value)} maxLength={18} required /></label>}
    <label>이메일<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></label>
    <label>비밀번호<input type="password" value={password} onChange={e=>setPassword(e.target.value)} minLength={6} required /></label>
    <button className="primary" disabled={busy}>{busy?'처리 중…':mode==='login'?'시장 입장':'계정 만들기'}</button>{msg&&<small className="auth-msg">{msg}</small>}
  </form></div>;
}

export default function Home(){
  const [session,setSession]=useState<Session|null>(null); const [ready,setReady]=useState(false);
  const [stocks,setStocks]=useState<Stock[]>([]); const [ticker,setTicker]=useState('A101'); const [candles,setCandles]=useState<Candle[]>([]); const [depth,setDepth]=useState<Depth[]>([]); const [news,setNews]=useState<News[]>([]); const [clock,setClock]=useState<Clock|null>(null);
  const [account,setAccount]=useState<Account|null>(null); const [positions,setPositions]=useState<Position[]>([]); const [orders,setOrders]=useState<Order[]>([]); const [trades,setTrades]=useState<Trade[]>([]); const [ranking,setRanking]=useState<Ranking[]>([]);
  const [side,setSide]=useState<'BUY'|'SELL'>('BUY'); const [orderType,setOrderType]=useState<'LIMIT'|'MARKET'>('LIMIT'); const [tif,setTif]=useState<'DAY'|'IOC'|'FOK'>('DAY'); const [qty,setQty]=useState(1); const [limitPrice,setLimitPrice]=useState(''); const [orderMsg,setOrderMsg]=useState(''); const [orderBusy,setOrderBusy]=useState(false);
  const [tab,setTab]=useState<'market'|'portfolio'|'orders'|'news'|'ranking'>('market'); const tickBusy=useRef(false);

  useEffect(()=>{ supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true);}); const {data:s}=supabase.auth.onAuthStateChange((_e,x)=>setSession(x)); return()=>s.subscription.unsubscribe();},[]);

  const selected=stocks.find(s=>s.ticker===ticker);
  const selectedImportantNews=news.find(n=>n.ticker===ticker && n.severity!=='NORMAL') ?? news.find(n=>n.severity==='EXTRA');
  const change=selected?((selected.last_price-selected.prev_close)/selected.prev_close*100):0;
  const posMap=useMemo(()=>Object.fromEntries(positions.map(p=>[p.ticker,p])),[positions]);
  const holdingsValue=positions.reduce((sum,p)=>sum+p.quantity*(stocks.find(s=>s.ticker===p.ticker)?.last_price??0),0);
  const totalAssets=(account?.cash??0)+holdingsValue;
  const asks=depth.filter(d=>d.side==='ASK').sort((a,b)=>b.price-a.price); const bids=depth.filter(d=>d.side==='BID').sort((a,b)=>b.price-a.price);
  const maxDepth=Math.max(1,...depth.map(d=>d.quantity));

  const loadPublic=useCallback(async()=>{
    const [{data:ss},{data:cc},{data:nn},{data:rr}] = await Promise.all([
      supabase.from('kx_stocks').select('*').order('ticker'), supabase.from('kx_market_clock').select('*').eq('id',1).single(), supabase.from('kx_news').select('*').order('id',{ascending:false}).limit(40), supabase.from('kx_leaderboard').select('*').order('total_assets',{ascending:false}).limit(100)
    ]);
    if(ss) setStocks(ss as Stock[]); if(cc) setClock(cc as Clock); if(nn) setNews(nn as News[]); if(rr) setRanking(rr as Ranking[]);
  },[]);
  const loadTicker=useCallback(async()=>{
    const [{data:c},{data:d},{data:t}] = await Promise.all([
      supabase.from('kx_candles').select('*').eq('ticker',ticker).order('candle_no',{ascending:false}).limit(90), supabase.rpc('kx_order_book',{p_ticker:ticker}), supabase.from('kx_trades').select('*').eq('ticker',ticker).order('id',{ascending:false}).limit(30)
    ]);
    if(c) setCandles((c as Candle[]).reverse()); if(d) setDepth(d as Depth[]); if(t) setTrades(t as Trade[]);
  },[ticker]);
  const loadPrivate=useCallback(async()=>{
    if(!session?.user) return;
    const uid=session.user.id;
    const [{data:a},{data:p},{data:o}] = await Promise.all([
      supabase.from('kx_accounts').select('cash,realized_pnl').eq('user_id',uid).single(), supabase.from('kx_positions').select('*').eq('user_id',uid).gt('quantity',0), supabase.from('kx_orders').select('*').eq('user_id',uid).order('created_at',{ascending:false}).limit(80)
    ]);
    if(a) setAccount(a as Account); if(p) setPositions(p as Position[]); if(o) setOrders(o as Order[]);
  },[session]);

  useEffect(()=>{if(!session)return; loadPublic();loadTicker();loadPrivate();},[session,loadPublic,loadTicker,loadPrivate]);
  useEffect(()=>{if(!session)return; const id=setInterval(async()=>{if(tickBusy.current)return;tickBusy.current=true;try{await fetch('/api/market/tick',{method:'POST'});await Promise.all([loadPublic(),loadTicker(),loadPrivate()]);}finally{tickBusy.current=false;}},5000); return()=>clearInterval(id);},[session,loadPublic,loadTicker,loadPrivate]);
  useEffect(()=>{if(selected) setLimitPrice(String(Math.round(selected.last_price)));},[ticker,selected?.last_price]);

  useEffect(()=>{
    if(!session)return;
    const ch=supabase.channel('kx-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'kx_stocks'},()=>loadPublic())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'kx_news'},()=>loadPublic())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'kx_trades'},()=>{loadTicker();loadPrivate();})
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[session,loadPublic,loadTicker,loadPrivate]);

  async function placeOrder(){
    if(!selected)return; setOrderBusy(true);setOrderMsg('');
    try{
      const args={p_ticker:selected.ticker,p_side:side,p_order_type:orderType,p_quantity:Math.max(1,Math.floor(qty)),p_limit_price:orderType==='LIMIT'?Number(limitPrice):null,p_tif:tif};
      const {data,error}=await supabase.rpc('kx_place_order',args); if(error)throw error;
      const o=(Array.isArray(data)?data[0]:data) as Order|undefined; setOrderMsg(o?.status==='FILLED'?`전량 체결 · 평균 ${money(o.avg_fill_price)}`:o?.filled?`부분 체결 ${o.filled}주 · 잔량 ${o.remaining}주`:`주문 접수 · ${o?.status??''}`);
      await Promise.all([loadPrivate(),loadTicker(),loadPublic()]);
    }catch(e){setOrderMsg(e instanceof Error?e.message:'주문 실패');}finally{setOrderBusy(false);}
  }
  async function cancelOrder(id:string){const {error}=await supabase.rpc('kx_cancel_order',{p_order:id});if(error)setOrderMsg(error.message);await Promise.all([loadPrivate(),loadTicker()]);}
  if(!ready)return <div className="boot">KX EXCHANGE INITIALIZING…</div>;
  if(!session)return <AuthBox onDone={()=>supabase.auth.getSession().then(({data})=>setSession(data.session))}/>;

  return <main className="terminal">
    <header className="topbar"><div className="topbrand"><b>KX</b><span><strong>KX EXCHANGE</strong><small>SIMULATED EQUITY MARKET</small></span></div><div className="market-clock"><span className={`session ${clock?.session.toLowerCase()}`}>{clock?SESSION_LABEL[clock.session]:'연결 중'}</span><b>DAY {clock?.game_day??'-'} · {clock?gameTime(clock.game_minute):'--:--'}</b><small>KX Composite {nf.format(clock?.index_value??1000)}</small></div><div className="asset-head"><small>TOTAL ASSETS</small><b>{money(totalAssets)}</b><span>현금 {money(account?.cash??0)}</span></div><button className="logout" onClick={()=>supabase.auth.signOut()}>로그아웃</button></header>

    <nav className="mobile-tabs">{(['market','portfolio','orders','news','ranking'] as const).map(x=><button key={x} className={tab===x?'on':''} onClick={()=>setTab(x)}>{x==='market'?'시장':x==='portfolio'?'자산':x==='orders'?'주문':x==='news'?'뉴스':'랭킹'}</button>)}</nav>

    <section className={`watch panel mobile-${tab==='market'?'show':'hide'}`}><header><b>종목</b><span>{stocks.length} LISTED</span></header><div className="watch-list">{stocks.map(s=>{const c=(s.last_price-s.prev_close)/s.prev_close*100;return <button key={s.ticker} className={`${ticker===s.ticker?'selected':''} ${c>0?'rise':c<0?'fall':''}`} onClick={()=>{setTicker(s.ticker);setTab('market')}}><span><b>{s.name}</b><small>{s.ticker} · {s.sector}</small></span><span><strong>{nf.format(s.last_price)}</strong><em>{signed(c)}</em></span></button>})}</div></section>

    <section className={`chart panel mobile-${tab==='market'?'show':'hide'}`}><header className="stock-head"><div><small>{selected?.ticker} · {selected?.sector}</small><h1>{selected?.name??'종목 선택'}</h1><p>{selected?.description}</p></div><div className={change>0?'rise':change<0?'fall':''}><b>{nf.format(selected?.last_price??0)}</b><strong>{signed(change)}</strong><small>전일 {nf.format(selected?.prev_close??0)}</small></div></header><div className="ohlc"><span>시가 <b>{nf.format(selected?.open_price??0)}</b></span><span>고가 <b>{nf.format(selected?.high_price??0)}</b></span><span>저가 <b>{nf.format(selected?.low_price??0)}</b></span><span>거래량 <b>{nf.format(selected?.volume??0)}</b></span><span>상한 <b>{nf.format(selected?.upper_limit??0)}</b></span><span>하한 <b>{nf.format(selected?.lower_limit??0)}</b></span></div>{selectedImportantNews&&<button className={`news-flash ${selectedImportantNews.sentiment>0?'positive':'negative'} ${selectedImportantNews.severity.toLowerCase()}`} onClick={()=>setTab('news')}><b>{selectedImportantNews.severity==='EXTRA'?'호외':'속보'}</b><span>{selectedImportantNews.headline}</span><em>NEWSROOM →</em></button>}<div className="chart-wrap"><Candles data={candles} stock={selected}/></div><div className="trades"><header><b>최근 체결</b><span>PRICE / QTY</span></header>{trades.slice(0,8).map(t=><div key={t.id}><span>{new Date(t.created_at).toLocaleTimeString('ko-KR',{hour12:false})}</span><b>{nf.format(t.price)}</b><em>{nf.format(t.quantity)}주</em><small>{t.source==='USER'?'USER↔USER':'시장 유동성'}</small></div>)}</div></section>

    <aside className={`book panel mobile-${tab==='market'?'show':'hide'}`}><header><b>10단계 호가</b><span>가격우선 · 시간우선</span></header><div className="depth asks">{asks.map((d,i)=><div key={`a${i}`}><i style={{width:`${d.quantity/maxDepth*100}%`}}/><b>{nf.format(d.price)}</b><span>{nf.format(d.quantity)}</span></div>)}</div><div className="last"><small>현재가</small><b>{nf.format(selected?.last_price??0)}</b><em>{signed(change)}</em></div><div className="depth bids">{bids.map((d,i)=><div key={`b${i}`}><i style={{width:`${d.quantity/maxDepth*100}%`}}/><b>{nf.format(d.price)}</b><span>{nf.format(d.quantity)}</span></div>)}</div></aside>

    <aside className={`order panel mobile-${tab==='market'?'show':'hide'}`}><header><b>주문</b><span>{SESSION_LABEL[clock?.session??'REGULAR']}</span></header><div className="side-tabs"><button className={side==='BUY'?'buy on':'buy'} onClick={()=>setSide('BUY')}>매수</button><button className={side==='SELL'?'sell on':'sell'} onClick={()=>setSide('SELL')}>매도</button></div><div className="order-types"><button className={orderType==='LIMIT'?'on':''} onClick={()=>setOrderType('LIMIT')}>지정가</button><button className={orderType==='MARKET'?'on':''} onClick={()=>setOrderType('MARKET')}>시장가</button></div>{orderType==='LIMIT'&&<label>주문가격<div className="input-money"><input inputMode="numeric" value={limitPrice} onChange={e=>setLimitPrice(e.target.value.replace(/[^0-9.]/g,''))}/><span>원</span></div></label>}<label>주문수량<div className="qty"><button onClick={()=>setQty(Math.max(1,qty-1))}>−</button><input type="number" min={1} value={qty} onChange={e=>setQty(Math.max(1,Number(e.target.value)||1))}/><button onClick={()=>setQty(qty+1)}>＋</button></div></label><label>체결조건<select value={tif} onChange={e=>setTif(e.target.value as 'DAY'|'IOC'|'FOK')}><option value="DAY">DAY · 미체결 잔량 유지</option><option value="IOC">IOC · 즉시체결 후 잔량취소</option><option value="FOK">FOK · 전량 즉시체결 아니면 취소</option></select></label><div className="order-est"><span>예상 주문금액<b>{money((orderType==='MARKET'?(selected?.last_price??0):Number(limitPrice)||0)*qty)}</b></span><span>보유수량<b>{nf.format(posMap[ticker]?.quantity??0)}주</b></span></div><button className={`submit-order ${side.toLowerCase()}`} disabled={orderBusy} onClick={placeOrder}>{orderBusy?'주문 전송 중…':`${selected?.name??''} ${side==='BUY'?'매수':'매도'} 주문`}</button>{orderMsg&&<div className="order-msg">{orderMsg}</div>}<small className="rules">시장가·지정가 · IOC/FOK · 부분체결 · 일일 ±30% 가격제한 · 1주 단위</small></aside>

    <section className={`portfolio panel mobile-${tab==='portfolio'?'show':'hide'}`}><header><b>내 포트폴리오</b><span>평가자산 {money(totalAssets)}</span></header><div className="asset-summary"><span><small>현금</small><b>{money(account?.cash??0)}</b></span><span><small>주식평가액</small><b>{money(holdingsValue)}</b></span><span><small>실현손익</small><b>{money(account?.realized_pnl??0)}</b></span></div><div className="table"><div className="th"><span>종목</span><span>수량</span><span>평균단가</span><span>현재가</span><span>평가손익</span></div>{positions.map(p=>{const s=stocks.find(x=>x.ticker===p.ticker);const pnl=p.quantity*((s?.last_price??0)-p.avg_price);return <button key={p.ticker} onClick={()=>{setTicker(p.ticker);setTab('market')}}><span><b>{s?.name??p.ticker}</b><small>{p.ticker}</small></span><span>{nf.format(p.quantity)}</span><span>{nf.format(Math.round(p.avg_price))}</span><span>{nf.format(s?.last_price??0)}</span><span className={pnl>=0?'rise':'fall'}>{money(pnl)}</span></button>})}</div></section>

    <section className={`open-orders panel mobile-${tab==='orders'?'show':'hide'}`}><header><b>주문/체결</b><span>최근 {orders.length}건</span></header><div className="table orders-table"><div className="th"><span>종목</span><span>구분</span><span>가격</span><span>주문/체결</span><span>상태</span></div>{orders.map(o=><div key={o.id}><span><b>{stocks.find(s=>s.ticker===o.ticker)?.name??o.ticker}</b><small>{new Date(o.created_at).toLocaleTimeString('ko-KR',{hour12:false})}</small></span><span className={o.side==='BUY'?'rise':'fall'}>{o.side==='BUY'?'매수':'매도'} · {o.order_type==='LIMIT'?'지정':'시장'}</span><span>{o.limit_price?nf.format(o.limit_price):'시장가'}</span><span>{nf.format(o.quantity)} / {nf.format(o.filled)}</span><span><b>{o.status}</b>{['OPEN','PARTIAL'].includes(o.status)&&<button className="cancel" onClick={()=>cancelOrder(o.id)}>취소</button>}</span></div>)}</div></section>

    <section className={`news panel mobile-${tab==='news'?'show':'hide'}`}><header><b>시장 뉴스룸</b><span>모든 투자자에게 동시 공개</span></header><div className="news-list">{news.map(n=><article key={n.id} className={`${n.sentiment>0?'positive':'negative'} ${n.severity.toLowerCase()}`} onClick={()=>n.ticker&&setTicker(n.ticker)}><div><span>{n.severity==='EXTRA'?'호외':n.severity==='BREAKING'?'속보':'뉴스'}</span><small>{n.ticker?stocks.find(s=>s.ticker===n.ticker)?.name:n.sector} · TICK {n.published_tick}</small></div><h3>{n.headline}</h3><p>{n.body}</p></article>)}</div></section>

    <section className={`ranking panel mobile-${tab==='ranking'?'show':'hide'}`}><header><b>총자산 랭킹</b><span>현금 + 보유주식 현재가 평가</span></header><div className="rank-list">{ranking.map((r,i)=><div key={r.user_id} className={r.user_id===session.user.id?'me':''}><b>{i+1}</b><span><strong>{r.nickname}</strong><small>실현 {money(r.realized_pnl)} · 미실현 {money(r.unrealized_pnl)}</small></span><em>{money(r.total_assets)}</em></div>)}</div></section>
  </main>;
}
