const SUPABASE_URL="https://qazjtevdljthbzmqmgrw.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_rIARlWBpKPvFAv_TtTdgaQ_Po-hOGmX";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let authMode="login",currentUser=null,profile=null,inventory=[],stocks=[],holdings=[],collectibles=[],effects={},explore=null,auction=null,negotiation=null,job=null,selectedStock=null,toastTimer=null,realtime=null;

document.addEventListener("DOMContentLoaded",()=>{init();initPremiumUI()});
async function init(){
  updatePhoneTime();setInterval(updatePhoneTime,30000);
  const{data:{session}}=await db.auth.getSession();
  if(session?.user){currentUser=session.user;await enterGame()}else showAuth();
  db.auth.onAuthStateChange((_e,s)=>currentUser=s?.user||null);
}
function setAuthMode(m){authMode=m;nicknameWrap.classList.toggle("hidden",m!=="signup");loginTab.classList.toggle("active",m==="login");signupTab.classList.toggle("active",m==="signup");authBtn.textContent=m==="login"?"로그인":"회원가입";authMsg.textContent=""}
async function submitAuth(){
  const nick=nickname.value.trim(),mail=email.value.trim(),pw=password.value;
  if(!mail||pw.length<6||(authMode==="signup"&&nick.length<2)){authMsg.textContent="입력값을 확인해 주세요.";return}
  authBtn.disabled=true;authBtn.textContent="처리 중...";
  try{
    if(authMode==="signup"){
      const{data,error}=await db.auth.signUp({email:mail,password:pw,options:{data:{nickname:nick}}});if(error)throw error;
      if(data.session){currentUser=data.user;await enterGame()}else authMsg.textContent="가입 완료. 이메일 인증 후 로그인하세요."
    }else{
      const{data,error}=await db.auth.signInWithPassword({email:mail,password:pw});if(error)throw error;currentUser=data.user;await enterGame()
    }
  }catch(e){authMsg.textContent=e.message}finally{authBtn.disabled=false;authBtn.textContent=authMode==="login"?"로그인":"회원가입"}
}
async function enterGame(){showGame();await db.rpc("ensure_player_save");await refreshAll();await grantStarterFundsIfNeeded();subscribe();setTimeout(hideBootScreen,280)}
function showAuth(){auth.classList.remove("hidden");game.classList.add("hidden");setTimeout(hideBootScreen,520)}
function showGame(){auth.classList.add("hidden");game.classList.remove("hidden");setTimeout(renderTradeDashboard,0)}
async function logout(){if(realtime)await db.removeChannel(realtime);await db.auth.signOut();showAuth()}
function openPage(name,btn){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));document.getElementById("page-"+name).classList.add("active");btn?.classList.add("active");({inventory:loadInventory,pawnshop:loadPawnshop,auction:loadAuction,market:loadMarketHub,house:loadHouse,collection:loadCollectibles,jobs:resetJobPage}[name]||(()=>{}))()}
function openPageFromPhone(name){closePhone();openPage(name,document.querySelector(`[data-page="${name}"]`))}
async function refreshAll(){await updateStocks();await loadProfile();await Promise.all([loadInventory(),loadStocks(),loadCollectibles(),loadEffects()]);updateNetworth()}
async function loadProfile(){const{data,error}=await db.from("profiles").select("*").eq("id",currentUser.id).single();if(error)return toast(error.message);profile=data;renderTradeDashboard();nicknameTop.textContent=data.nickname;nicknameHero.textContent=data.nickname;phoneOwner.textContent=data.nickname;cashTop.textContent=money(data.cash);credit.textContent=data.credit_score;reputation.textContent=data.reputation}
async function grantStarterFundsIfNeeded(){
  const key=`starter_v8_${currentUser.id}`;
  if(localStorage.getItem(key))return;
  const stockAssets=(holdings||[]).reduce((sum,h)=>sum+Number(h.shares||0),0);
  const hasAssets=(inventory||[]).length>0||stockAssets>0||(collectibles||[]).length>0;
  if(profile&&Number(profile.cash)===0&&!hasAssets){
    const{error}=await db.from("profiles").update({cash:500000}).eq("id",currentUser.id);
    if(!error){
      localStorage.setItem(key,"1");
      toast("시작 지원금 50만원이 지급되었습니다.");
      await loadProfile();
      updateNetworth();
    }
  }
}
function resetJobPage(){
  clearJob();
  job=null;
  const intro=document.getElementById("jobIntro"),gameEl=document.getElementById("jobGame"),result=document.getElementById("jobResult");
  if(intro)intro.classList.remove("hidden");
  if(gameEl)gameEl.classList.add("hidden");
  if(result){result.classList.add("hidden");result.innerHTML=""}
  const stage=document.getElementById("jobStage");if(stage)stage.innerHTML="";
}
async function startJobMinigame(){
  const{data,error}=await db.rpc("prepare_job_minigame");
  if(error)return toast(error.message);
  job={token:data.token,target:Number(data.target_count),time:Number(data.time_limit),score:0,miss:0,active:true};
  jobIntro.classList.add("hidden");jobResult.classList.add("hidden");jobGame.classList.remove("hidden");
  jobTarget.textContent=job.target;jobScore.textContent="0";jobTime.textContent=job.time;jobMiss.textContent="0";
  renderJobOrder();spawnJobBox();
  job.interval=setInterval(()=>{job.time--;jobTime.textContent=job.time;if(job.time<=0)finishJobMinigame()},1000);
}
function renderJobOrder(){
  const types=["📦","🧊","📕","🧸"];
  job.order=types[Math.floor(Math.random()*types.length)];
  jobOrder.textContent=job.order;
}
function spawnJobBox(){
  if(!job?.active)return;
  const types=["📦","🧊","📕","🧸"],stage=document.getElementById("jobStage");
  stage.innerHTML="";
  for(let i=0;i<4;i++){
    const icon=types.sort(()=>Math.random()-.5)[i];
    const b=document.createElement("button");b.className="job-box";b.textContent=icon;
    b.style.left=(8+Math.random()*72)+"%";b.style.top=(8+Math.random()*58)+"%";
    b.onclick=()=>pickJobBox(icon);stage.appendChild(b);
  }
}
function pickJobBox(icon){
  if(!job?.active)return;
  if(icon===job.order){job.score++;jobScore.textContent=job.score;renderJobOrder();spawnJobBox();if(job.score>=job.target)finishJobMinigame()}
  else{job.miss++;jobMiss.textContent=job.miss;job.time=Math.max(0,job.time-2);jobTime.textContent=job.time;toast("오배송! 제한시간 -2초");if(job.time<=0)finishJobMinigame()}
}
function clearJob(){clearInterval(job?.interval)}
async function finishJobMinigame(){
  if(!job?.active)return;job.active=false;clearJob();
  const{data,error}=await db.rpc("complete_job_minigame",{p_token:job.token,p_score:job.score,p_miss:job.miss});
  jobGame.classList.add("hidden");jobResult.classList.remove("hidden");
  if(error){jobResult.innerHTML=`<h2>정산 실패</h2><p>${esc(error.message)}</p><button class="btn primary" onclick="resetJobPage()">돌아가기</button>`;return}
  const success=Boolean(data.success);
  jobResult.innerHTML=`<div class="job-result-icon">${success?"💵":"🧾"}</div><h2>${success?"알바 완료":"목표 미달"}</h2><p>${job.score}개 처리 · 실수 ${job.miss}회</p><div class="job-pay">${success?"급여 "+money(data.reward):"이번 급여 0원"}</div><button class="btn primary" onclick="resetJobPage()">다시 도전</button>`;
  if(success){toast("알바비 "+money(data.reward)+" 지급");await loadProfile();updateNetworth()}
}

/* 메인 미니게임(탐색 기능은 메인 UI에서 제거됨) */
async function prepareExplore(location){
  const{data,error}=await db.rpc("prepare_exploration",{p_location:location});if(error)return toast(error.message);
  explore={...data,location,score:0,time:Math.max(5,13-data.difficulty)};
  exploreModal.classList.remove("hidden");
  if(location==="street")streetGame();else if(location==="alley")memoryGame();else miningGame()
}
function preview(title,desc){return `<p class="eyebrow">EXPLORATION</p><h2>${title}</h2><p class="muted">${desc}</p><div class="preview"><div><span>예상 상태</span><b>${explore.target_condition}/100</b></div><div><span>난도</span><b>${explore.difficulty}/10</b></div><div><span>희귀도</span><b>${esc(explore.rarity_hint)}</b></div><div><span>지역</span><b>${{street:"길거리",alley:"뒷골목",mountain:"뒷산"}[explore.location]}</b></div></div>`}
function streetGame(){
  explore.required=4+explore.difficulty;
  exploreContent.innerHTML=preview("움직이는 상자를 클릭하세요",`${explore.time}초 안에 ${explore.required}개를 찾으세요.`)+`<div id="gameStage" class="game-stage"></div><p>남은 시간 <b id="time">${explore.time}</b>초 · <b id="score">0</b>/${explore.required}</p>`;
  spawnTarget();explore.interval=setInterval(()=>{explore.time--;time.textContent=explore.time;if(explore.time<=0)finishExplore(false,"시간 초과")},1000)
}
function spawnTarget(){gameStage.innerHTML="";const b=document.createElement("button");b.className="target";const s=Math.max(34,64-explore.difficulty*3);b.style.width=b.style.height=s+"px";b.style.left=(Math.random()*82+3)+"%";b.style.top=(Math.random()*72+5)+"%";b.textContent="📦";b.onclick=()=>{explore.score++;score.textContent=explore.score;explore.score>=explore.required?finishExplore(true):spawnTarget()};gameStage.appendChild(b)}
function memoryGame(){
  const a=["⬆️","⬇️","⬅️","➡️"],len=3+Math.ceil(explore.difficulty/2);explore.seq=Array.from({length:len},()=>a[Math.floor(Math.random()*4)]);explore.input=[];explore.lock=true;
  exploreContent.innerHTML=preview("방향 순서를 기억하세요",`${len}개의 방향을 순서대로 입력하세요.`)+`<div id="memory" class="memory">${explore.seq.join("")}</div><div class="memory-buttons">${a.map(x=>`<button onclick="pressMemory('${x}')">${x}</button>`).join("")}</div><p id="memoryStatus">잠시 후 사라집니다.</p>`;
  explore.timeout=setTimeout(()=>{memory.textContent="❓ ".repeat(len);memoryStatus.textContent="입력하세요.";explore.lock=false},Math.max(1000,3200-explore.difficulty*180))
}
function pressMemory(x){if(explore.lock)return;const i=explore.input.length;if(explore.seq[i]!==x)return finishExplore(false,"순서 오류");explore.input.push(x);memoryStatus.textContent=`${explore.input.length}/${explore.seq.length}`;if(explore.input.length===explore.seq.length)finishExplore(true)}
function miningGame(){
  const w=Math.max(8,32-explore.difficulty*2),l=50-w/2;explore.pos=0;explore.dir=1;explore.left=l;explore.right=l+w;
  exploreContent.innerHTML=preview("초록 구간에 멈추세요","상태가 좋을수록 성공 구간이 좁아집니다.")+`<div class="track"><div class="zone" style="left:${l}%;width:${w}%"></div><div id="marker" class="marker"></div></div><button class="big" onclick="stopMining()">지금 멈추기</button>`;
  explore.interval=setInterval(()=>{explore.pos+=explore.dir*(1.7+explore.difficulty*.18);if(explore.pos>=97)explore.dir=-1;if(explore.pos<=0)explore.dir=1;marker.style.left=explore.pos+"%"},24)
}
function stopMining(){finishExplore(explore.pos>=explore.left&&explore.pos<=explore.right,"구간 실패")}
function clearExplore(){clearInterval(explore?.interval);clearTimeout(explore?.timeout)}
async function finishExplore(ok,msg=""){
  clearExplore();
  if(!ok){exploreContent.innerHTML=`<h2>실패</h2><p>${esc(msg)}</p><button class="big" onclick="prepareExplore('${explore.location}')">다시 도전</button>`;return}
  const{data,error}=await db.rpc("complete_exploration",{p_token:explore.token});if(error)return exploreContent.innerHTML=`<p>${esc(error.message)}</p>`;
  exploreContent.innerHTML=`<div class="item-image"><img src="${itemImage(data.item_name,data.category)}"></div><h2>${esc(data.item_name)}</h2><p>${esc(data.category)} · ${esc(data.rarity)} · 상태 ${data.condition_score}/100</p><button class="big" onclick="closeExplore()">가방으로 보내기</button>`;
  await loadInventory()
}
function closeExplore(){clearExplore();exploreModal.classList.add("hidden")}

/* 아이템/전당포 */
async function loadInventory(){
  const{data,error}=await db.from("user_items").select(`id,condition_score,is_listed,items(id,name,category,average_price,rarity)`).eq("user_id",currentUser.id).order("acquired_at",{ascending:false});
  if(error)return toast(error.message);inventory=data||[];fillItemSelect();
  const homeCount=document.getElementById("homeInventoryCount");
  if(homeCount)homeCount.textContent=inventory.length;
  if(!inventory.length){inventoryEl().innerHTML=`<div class="panel" style="padding:20px">가방이 비어 있습니다.</div>`;return}
  inventoryEl().innerHTML=inventory.map(cardItem).join("")
}
function inventoryEl(){return document.getElementById("inventory")}
function cardItem(r){const i=r.items,v=itemValue(i.average_price,r.condition_score);return `<article class="item-card"><div class="item-image"><img src="${itemImage(i.name,i.category)}"></div><div class="item-body"><h3>${esc(i.name)}</h3><div class="meta">${esc(i.category)} · ${esc(i.rarity)}</div><div class="condition"><i style="width:${r.condition_score}%"></i></div><div class="meta">상태 ${r.condition_score}/100</div><div class="price">${money(v)}</div><div class="item-actions"><button class="btn light" onclick="openPage('pawnshop',document.querySelector('[data-page=pawnshop]'))">전당포</button><button class="btn primary" onclick="openPage('market',document.querySelector('[data-page=market]'))">장터</button></div></div></article>`}
async function loadPawnshop(){await loadInventory();pawnshopList.innerHTML=inventory.filter(x=>!x.is_listed).map(r=>{const v=itemValue(r.items.average_price,r.condition_score);return `<article class="item-card"><div class="item-image"><img src="${itemImage(r.items.name,r.items.category)}"></div><div class="item-body"><h3>${esc(r.items.name)}</h3><div class="meta">상태 ${r.condition_score}/100</div><div class="price">원가 ${money(v)}</div><div class="item-actions"><button class="btn light" onclick="pawnSell('${r.id}','instant',100)">원가 판매</button><button class="btn primary" onclick="startPawnNegotiation('${r.id}')">흥정 판매</button></div></div></article>`}).join("")||`<div class="panel" style="padding:20px">판매할 아이템이 없습니다.</div>`}
async function pawnSell(id,mode,pct){const{data,error}=await db.rpc("sell_item_to_pawnshop",{p_user_item_id:id,p_mode:mode,p_offer_percent:pct});if(error)return toast(error.message);toast("판매 완료 "+money(data.final_price));await Promise.all([loadProfile(),loadPawnshop(),loadInventory()]);updateNetworth()}
function getTradeLedger(){try{return JSON.parse(localStorage.getItem(`trade_ledger_${currentUser?.id}`)||"[]")}catch{return[]}}
function saveTradeLedger(entry){if(!currentUser)return;const rows=getTradeLedger();rows.unshift({...entry,at:new Date().toISOString()});localStorage.setItem(`trade_ledger_${currentUser.id}`,JSON.stringify(rows.slice(0,30)));renderTradeDashboard()}
function renderTradeDashboard(){const host=document.getElementById("tradeDashboard");if(!host)return;const rows=getTradeLedger(),profit=rows.reduce((s,r)=>s+Number(r.profit||0),0),wins=rows.filter(r=>Number(r.profit)>0).length;host.innerHTML=`<div><span>누적 거래</span><b>${rows.length}건</b></div><div><span>누적 추가이익</span><b class="up">+${money(profit)}</b></div><div><span>성공 거래</span><b>${wins}건</b></div><div><span>평균 추가이익</span><b>${money(rows.length?profit/rows.length:0)}</b></div>`}
function startPawnNegotiation(id){
  const r=inventory.find(x=>x.id===id),base=itemValue(r.items.average_price,r.condition_score);
  const personalities=[
    {name:"신중한 감정가",icon:"🧐",patience:5,openness:.58,pressure:.22,line:"근거가 분명해야 돈을 더 쓰지."},
    {name:"성격 급한 수집가",icon:"😤",patience:3,openness:.76,pressure:.42,line:"시간 끌지 말고 핵심만 말해."},
    {name:"노련한 장사꾼",icon:"🦊",patience:4,openness:.66,pressure:.33,line:"나도 장사꾼이야. 허풍은 금방 알아보지."}
  ];
  const persona=personalities[Math.floor(Math.random()*personalities.length)];
  const maxPct=128+Math.min(20,Number(effects.pawn_bonus||0));
  const market=Math.round(base*(1.15+Math.random()*.12));
  const opening=Math.round(base*(1.01+Math.random()*.035));
  negotiation={type:"pawn",id,title:r.items.name,base,market,npcOffer:opening,limit:Math.min(Math.round(base*maxPct/100),Math.round(market*1.08)),round:1,patience:persona.patience,maxPatience:persona.patience,mood:"neutral",ended:false,persona,confidence:50,history:[{who:"npc",text:`${money(opening)}. 첫 제안은 이 정도일세.`}]};
  renderNegotiation()
}
function negotiationProfit(n,price=n.npcOffer){return Math.round(price-n.base)}
function renderNegotiation(){
  negotiationModal.classList.remove("hidden");
  const n=negotiation,profit=negotiationProfit(n),profitPct=n.base?profit/n.base*100:0;
  const ceiling=Math.max(1,n.limit-n.base),progress=Math.max(0,Math.min(100,(n.npcOffer-n.base)/ceiling*100));
  const patiencePct=Math.max(0,n.patience/n.maxPatience*100),mood=n.mood==="good"?"🙂":n.mood==="bad"?"😠":"🤨";
  const recommended=Math.min(n.limit,Math.round(Math.max(n.npcOffer*1.05,n.market*.98)));
  const history=n.history.slice(-5).map(x=>`<div class="chat ${x.who}"><b>${x.who==="npc"?n.persona.name:"나"}</b><span>${esc(x.text)}</span></div>`).join("");
  negotiationContent.innerHTML=`
    <div class="haggle-top"><div><p class="eyebrow">LIVE NEGOTIATION · ROUND ${n.round}</p><h2>${esc(n.title)}</h2></div><div class="dealer-profile"><strong>${n.persona.icon} ${n.persona.name}</strong><small>${n.persona.line}</small></div></div>
    <div class="deal-summary deluxe">
      <div><span>즉시 판매 기준</span><b>${money(n.base)}</b></div><div><span>참고 시세</span><b>${money(n.market)}</b></div><div class="offer-main"><span>현재 제안</span><b>${money(n.npcOffer)}</b></div><div class="profit-main"><span>확정 추가이익</span><b class="${profit>=0?'up':'down'}">${profit>=0?'+':''}${money(profit)}</b><small>${profitPct>=0?'+':''}${profitPct.toFixed(1)}%</small></div>
    </div>
    <div class="haggle-bars"><label>NPC 인내심 <i><em style="width:${patiencePct}%"></em></i></label><label>흥정 성과 <i><em style="width:${progress}%"></em></i></label></div>
    <div class="neg-chat">${history}</div>
    ${n.ended?`<div class="final-offer"><b>최종 제안</b><strong>${money(n.npcOffer)}</strong><button onclick="acceptNpcCounter()">이 가격에 계약</button></div>`:`
      <div class="manual-offer"><div><label>내 희망 판매가</label><small>추천 ${money(recommended)} · 최대 예상 ${money(n.limit)}</small></div><input id="haggleAsk" type="number" min="${n.npcOffer+1}" max="${n.limit}" value="${recommended}"></div>
      <div class="haggle-actions pro">
        <button onclick="submitNegotiationOffer('evidence')"><b>📊 시세 자료 제시</b><small>안전함 · 인내심 소모 적음</small></button>
        <button onclick="submitNegotiationOffer('story')"><b>✨ 가치와 사연 강조</b><small>균형형 · 성공 시 호감 상승</small></button>
        <button onclick="submitNegotiationOffer('walkaway')"><b>🚪 다른 곳에 팔겠다고 압박</b><small>고위험 · 큰 인상 가능</small></button>
      </div>`}
    <button class="accept-now" onclick="acceptNpcCounter()">현재 제안 확정 · 순이익 ${profit>=0?'+':''}${money(profit)}</button>`;
}
function submitNegotiationOffer(style){
  const n=negotiation;if(!n||n.ended)return;
  const el=document.getElementById("haggleAsk"),ask=Math.max(n.npcOffer+1,Math.min(n.limit,Math.round(Number(el?.value)||n.npcOffer)));
  const cfg={evidence:{risk:.10,power:.58,cost:0,label:"최근 거래 시세와 상태를 근거로 제시했다."},story:{risk:.22,power:.72,cost:1,label:"희소성과 물건의 가치를 설득력 있게 설명했다."},walkaway:{risk:.48,power:1.0,cost:2,label:"다른 구매자에게 팔겠다며 자리에서 일어날 듯 압박했다."}}[style];
  const gap=(ask-n.npcOffer)/Math.max(1,n.limit-n.npcOffer),difficulty=Math.max(0,gap-n.persona.openness);
  const fail=Math.min(.88,cfg.risk+difficulty*.65+n.persona.pressure*(style==="walkaway"?.25:.05));
  n.history.push({who:"me",text:`${cfg.label} 원하는 가격은 ${money(ask)}.`});n.round++;n.patience=Math.max(0,n.patience-cfg.cost);
  if(Math.random()<fail){n.mood="bad";n.patience=Math.max(0,n.patience-1);const cut=style==="walkaway"&&Math.random()<.35?Math.round((n.npcOffer-n.base)*.2):0;n.npcOffer=Math.max(n.base,n.npcOffer-cut);n.history.push({who:"npc",text:n.patience<=0?`더는 못 듣겠군. ${money(n.npcOffer)}이 마지막이야.`:`그 가격은 받아들일 수 없어. ${cut?"오히려 제안을 낮추겠네.":"근거를 더 가져오게."}`});if(n.patience<=0)n.ended=true;renderNegotiation();return}
  const gain=Math.max(1,Math.round((ask-n.npcOffer)*cfg.power*(.85+Math.random()*.25)));n.npcOffer=Math.min(n.limit,n.npcOffer+gain);n.mood="good";n.history.push({who:"npc",text:`좋아, ${money(n.npcOffer)}까지 올리지. 하지만 다음 제안은 신중하게 하게.`});if(n.npcOffer>=n.limit||n.patience<=0)n.ended=true;renderNegotiation()
}
async function acceptNpcCounter(){
  const n=negotiation;if(!n)return;const final=Math.round(n.npcOffer),profit=negotiationProfit(n,final);
  if(n.type==="pawn")await pawnSell(n.id,"negotiated",Math.round(final/n.base*100));else{const{data,error}=await db.rpc("accept_npc_market_offer",{p_offer_id:n.offerId,p_final_price:final});if(error)return toast(error.message);await Promise.all([loadProfile(),loadNpcOffers(),loadInventory()])}
  saveTradeLedger({title:n.title,base:n.base,final,profit,rounds:n.round-1,persona:n.persona?.name||"NPC"});toast(`거래 성사 · 판매 ${money(final)} · 추가이익 ${profit>=0?'+':''}${money(profit)}`);closeNegotiation()
}
function closeNegotiation(){negotiation=null;negotiationModal.classList.add("hidden")}

/* 경매 */
async function loadAuction(){
  const{data,error}=await db.rpc("get_or_create_auction");if(error)return auctionHall.innerHTML=`<p>${esc(error.message)}</p>`;
  auction={id:data.auction_id,name:data.item_name,category:data.category,rarity:data.rarity,price:Number(data.current_price),highest:data.player_highest,stopped:data.npc_stopped,log:[`시작가 ${money(data.current_price)}`]};
  renderAuction();if(!auction.stopped)startAuctionLoop()
}
function renderAuction(){auctionHall.innerHTML=`<div class="auction-card"><img src="${itemImage(auction.name,auction.category)}"><div><span class="badge normal">${esc(auction.rarity)}</span><h2>${esc(auction.name)}</h2><div class="bid-price"><span>현재 최고가</span><b>${money(auction.price)}</b></div><div class="bid-log">${auction.log.map(x=>`<p>${esc(x)}</p>`).join("")}</div><div class="auction-actions"><button class="btn light" onclick="playerBid(5)">+5%</button><button class="btn light" onclick="playerBid(12)">+12%</button><button class="btn primary" onclick="claimAuction()">낙찰 시도</button></div></div></div>`}
function startAuctionLoop(){clearInterval(auction.interval);auction.interval=setInterval(async()=>{const{data,error}=await db.rpc("npc_auction_step",{p_auction_id:auction.id});if(error){clearInterval(auction.interval);return toast(error.message)}auction.price=Number(data.current_price);if(data.action==="hold"){auction.stopped=true;auction.log.push("NPC 가격 유지 → 입찰 종료");clearInterval(auction.interval)}else if(data.action==="raise")auction.log.push("NPC 소폭 인상 +"+money(data.increment));else auction.log.push("NPC 대폭 인상 +"+money(data.increment));renderAuction()},2200)}
async function playerBid(pct){const bid=Math.round(auction.price*(1+pct/100));const{data,error}=await db.rpc("place_auction_bid",{p_auction_id:auction.id,p_bid_amount:bid});if(error)return toast(error.message);auction.price=Number(data.current_price);auction.highest=true;auction.log.push("플레이어 입찰 "+money(bid));renderAuction()}
async function claimAuction(){const{data,error}=await db.rpc("claim_auction",{p_auction_id:auction.id});if(error)return toast(error.message);if(!data.won)return toast("현재 최고 입찰자가 아니거나 NPC 입찰이 끝나지 않았습니다.");clearInterval(auction.interval);toast("낙찰 성공 "+money(data.final_price));await Promise.all([loadProfile(),loadInventory()]);loadAuction()}

/* 시장 */
function switchMarketTab(name,btn){document.querySelectorAll(".market-tabs button").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".market-panel").forEach(x=>x.classList.add("hidden"));btn.classList.add("active");document.getElementById("market-"+name).classList.remove("hidden");if(name==="offers")loadNpcOffers();if(name==="collectibles")loadCollectibleMarket()}
async function loadMarketHub(){await Promise.all([loadInventory(),loadMarket(),loadNpcOffers(),loadCollectibles(),loadCollectibleMarket()])}
function fillItemSelect(){sellItem.innerHTML=`<option value="">판매할 아이템</option>`;inventory.filter(x=>!x.is_listed).forEach(x=>sellItem.add(new Option(`${x.items.name} · 상태 ${x.condition_score}`,x.id)))}
async function createListing(){const id=sellItem.value,p=Math.floor(Number(sellPrice.value));if(!id||p<=0)return toast("아이템과 가격을 확인하세요.");const{error}=await db.rpc("create_market_listing",{p_user_item_id:id,p_price:p});if(error)return toast(error.message);sellPrice.value="";toast("장터 등록 완료");await Promise.all([loadInventory(),loadMarket()])}
async function loadMarket(){const{data,error}=await db.from("market_listings").select(`id,title,asking_price,seller_user_id,user_items(condition_score,items(category)),profiles:seller_user_id(nickname)`).eq("status","active").order("created_at",{ascending:false});if(error)return toast(error.message);marketList.innerHTML=(data||[]).map(r=>{const mine=r.seller_user_id===currentUser.id;return `<article class="market-card"><div class="item-image"><img src="${itemImage(r.title,r.user_items?.items?.category)}"></div><div class="market-body"><h3>${esc(r.title)}</h3><div class="meta">${esc(r.profiles?.nickname||"유저")} · 상태 ${r.user_items?.condition_score||"-"}</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?"light":"primary"} full" onclick="${mine?`cancelListing('${r.id}')`:`buyListing('${r.id}')`}">${mine?"판매 취소":"구매"}</button></div></article>`}).join("")||`<div class="panel" style="padding:20px">매물이 없습니다.</div>`}
async function buyListing(id){const{data,error}=await db.rpc("buy_market_listing",{p_listing_id:id});if(error)return toast(error.message);toast("구매 완료 "+money(data.final_price));await refreshAll();loadMarket()}
async function cancelListing(id){const{error}=await db.rpc("cancel_market_listing",{p_listing_id:id});if(error)return toast(error.message);await Promise.all([loadInventory(),loadMarket()])}
async function loadNpcOffers(){await db.rpc("generate_npc_market_offers");const{data,error}=await db.from("npc_market_offers").select(`id,offer_price,max_price,user_items(id,condition_score,items(name,category))`).eq("user_id",currentUser.id).eq("status","active").order("created_at",{ascending:false});if(error)return toast(error.message);npcOfferList.innerHTML=(data||[]).map(o=>`<article class="market-card"><div class="item-image"><img src="${itemImage(o.user_items.items.name,o.user_items.items.category)}"></div><div class="market-body"><span class="badge normal">NPC 제안</span><h3>${esc(o.user_items.items.name)}</h3><div class="price">${money(o.offer_price)}</div><button class="btn primary full" onclick="startNpcOffer('${o.id}')">거래하기</button></div></article>`).join("")||`<div class="panel" style="padding:20px">NPC 제안이 없습니다.</div>`}
async function startNpcOffer(id){const{data,error}=await db.from("npc_market_offers").select(`id,offer_price,max_price,user_items(items(name))`).eq("id",id).single();if(error)return toast(error.message);const opening=Number(data.offer_price);negotiation={type:"npc",offerId:id,title:data.user_items.items.name,base:opening,min:opening,npcOffer:opening,limit:Number(data.max_price),round:1,patience:4,mood:"neutral",ended:false,history:[{who:"npc",text:`${money(opening)}에 사고 싶습니다.`}]};renderNegotiation()}

/* 소장품/집 */
async function drawCollectible(){const{data,error}=await db.rpc("draw_collectible");if(error)return toast(error.message);toast(`${data.rarity} ${data.name} · ${data.effect_name} +${data.effect_percent}%`);await Promise.all([loadProfile(),loadCollectibles()]);updateNetworth()}
async function loadCollectibles(){const{data,error}=await db.from("user_collectibles").select(`id,is_equipped,is_placed,is_listed,collectibles(id,name,type,rarity,effect_code,effect_name,effect_percent,icon)`).eq("user_id",currentUser.id).order("acquired_at",{ascending:false});if(error)return toast(error.message);collectibles=data||[];const eq=collectibles.find(x=>x.is_equipped&&x.collectibles.type==="phone_case");equippedCase.innerHTML=eq?collectibleRow(eq):`<p class="muted">장착 케이스 없음</p>`;collectibleInventory.innerHTML=collectibles.map(collectibleRow).join("")||`<p class="muted">소장품 없음</p>`;fillCollectibleSelect()}
function collectibleRow(r){const c=r.collectibles;return `<div class="collectible"><span>${c.icon} ${esc(c.name)}<br><small>${esc(c.rarity)} · ${esc(c.effect_name)} +${c.effect_percent}%</small></span><button class="btn light" onclick="${c.type==="phone_case"?`equipCollectible('${r.id}','equip')`:`equipCollectible('${r.id}','place')`}">${c.type==="phone_case"?(r.is_equipped?"장착 중":"장착"):(r.is_placed?"배치됨":"배치")}</button></div>`}
async function equipCollectible(id,action){const{error}=await db.rpc("equip_collectible",{p_user_collectible_id:id,p_action:action});if(error)return toast(error.message);await Promise.all([loadCollectibles(),loadHouse(),loadEffects()])}
function fillCollectibleSelect(){sellCollectible.innerHTML=`<option value="">판매할 소장품</option>`;collectibles.filter(x=>!x.is_equipped&&!x.is_placed&&!x.is_listed).forEach(x=>sellCollectible.add(new Option(`${x.collectibles.name} · ${x.collectibles.effect_percent}%`,x.id)))}
async function createCollectibleListing(){const id=sellCollectible.value,p=Math.floor(Number(collectiblePrice.value));if(!id||p<=0)return toast("소장품과 가격을 확인하세요.");const{error}=await db.rpc("create_collectible_listing",{p_user_collectible_id:id,p_price:p});if(error)return toast(error.message);collectiblePrice.value="";await loadCollectibleMarket()}
async function loadCollectibleMarket(){const{data,error}=await db.from("collectible_listings").select(`id,asking_price,seller_user_id,user_collectibles(collectibles(name,rarity,effect_name,effect_percent,icon)),profiles:seller_user_id(nickname)`).eq("status","active").order("created_at",{ascending:false});if(error)return toast(error.message);collectibleMarketList.innerHTML=(data||[]).map(r=>{const c=r.user_collectibles.collectibles,mine=r.seller_user_id===currentUser.id;return `<article class="market-card"><div class="item-image" style="display:grid;place-items:center;font-size:68px">${c.icon}</div><div class="market-body"><h3>${esc(c.name)}</h3><div class="meta">${esc(c.rarity)} · ${esc(c.effect_name)} +${c.effect_percent}%</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?"light":"primary"} full" onclick="${mine?`cancelCollectible('${r.id}')`:`buyCollectible('${r.id}')`}">${mine?"판매 취소":"구매"}</button></div></article>`}).join("")||`<div class="panel" style="padding:20px">소장품 매물 없음</div>`}
async function buyCollectible(id){const{data,error}=await db.rpc("buy_collectible_listing",{p_listing_id:id});if(error)return toast(error.message);toast("구매 완료 "+money(data.final_price));await Promise.all([loadProfile(),loadCollectibles(),loadCollectibleMarket()])}
async function cancelCollectible(id){const{error}=await db.rpc("cancel_collectible_listing",{p_listing_id:id});if(error)return toast(error.message);await loadCollectibleMarket()}
async function loadEffects(){const{data}=await db.rpc("get_active_effects");effects=data||{}}
async function loadHouse(){await Promise.all([loadCollectibles(),loadEffects()]);const placed=collectibles.filter(x=>x.is_placed&&x.collectibles.type==="decoration");placedDecorations.innerHTML=placed.map((r,i)=>`<div class="placed" style="left:${8+(i%4)*22}%;top:${34+Math.floor(i/4)*24}%">${r.collectibles.icon}</div>`).join("");houseEffects.innerHTML=Object.entries(effects).map(([k,v])=>`<div class="effect"><span>${effectName(k)}</span><b>+${Number(v).toFixed(1)}%</b></div>`).join("")||`<p class="muted">활성 효과 없음</p>`;decorationInventory.innerHTML=collectibles.filter(x=>x.collectibles.type==="decoration").map(collectibleRow).join("")||`<p class="muted">장식 없음</p>`}
function effectName(k){return{pawn_bonus:"전당포 판매가",market_bonus:"NPC 제안가",auction_discount:"경매 할인",stock_fee_discount:"주식 수수료",exploration_luck:"탐색 희귀도",gacha_luck:"뽑기 희귀도"}[k]||k}

/* 휴대폰/주식 */
function openPhone(){phoneOverlay.classList.remove("hidden");phoneHome();updatePhoneTime()}function closePhone(){phoneOverlay.classList.add("hidden")}function phoneBackdrop(e){if(e.target.id==="phoneOverlay")closePhone()}function phoneHome(){document.querySelectorAll(".phone-screen").forEach(x=>x.classList.add("hidden"));document.getElementById("phoneHome").classList.remove("hidden");closeStockDetail()}function openPhoneApp(name){document.querySelectorAll(".phone-screen").forEach(x=>x.classList.add("hidden"));document.getElementById("phone-"+name).classList.remove("hidden");name==="stocks"?refreshStocks():renderWallet()}function updatePhoneTime(){phoneTime.textContent=new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}
async function updateStocks(){await db.rpc("update_global_stock_market")}
async function refreshStocks(){await updateStocks();await loadStocks()}
async function loadStocks(){const[{data:s},{data:h}]=await Promise.all([db.from("stocks").select("id,symbol,name,current_price,previous_price,history").eq("is_active",true).order("name"),db.from("stock_holdings").select("*").eq("user_id",currentUser.id)]);stocks=s||[];holdings=h||[];let total=0,profit=0;stockList.innerHTML=stocks.map(st=>{const hd=holdings.find(x=>x.stock_id===st.id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),prev=Number(st.previous_price),r=prev?(cur-prev)/prev*100:0,val=q*cur,p=val-q*avg;total+=val;profit+=p;return `<button class="stock-row" onclick="openStockDetail('${st.id}')"><div class="stock-name"><b>${esc(st.name)}</b><small>${esc(st.symbol)} · ${q}주</small></div><div class="stock-price"><b>${money(cur)}</b><small>현재가</small></div>${stockSvg(history(st.history,prev,cur),95,40,true)}<b class="stock-rate ${r>=0?"up":"down"}">${r>=0?"+":""}${r.toFixed(2)}%</b></button>`}).join("");stockValue.textContent=money(total);stockProfit.textContent=(profit>=0?"+":"")+money(profit);stockProfit.className=profit>=0?"up":"down";if(selectedStock)renderStockDetail(selectedStock);renderWallet()}
function openStockDetail(id){selectedStock=id;stockListView.classList.add("hidden");stockDetailView.classList.remove("hidden");renderStockDetail(id)}function closeStockDetail(){selectedStock=null;stockListView?.classList.remove("hidden");stockDetailView?.classList.add("hidden")}
function renderStockDetail(id){const st=stocks.find(x=>x.id===id),hd=holdings.find(x=>x.stock_id===id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),hist=history(st.history,st.previous_price,cur),val=q*cur,p=val-q*avg;stockDetail.innerHTML=`<h2>${esc(st.name)}</h2>${stockSvg(hist,340,220,false)}<div class="metrics"><div>보유 <b>${q}주</b></div><div>평균 <b>${q?money(avg):"-"}</b></div><div>평가액 <b>${money(val)}</b></div><div>손익 <b class="${p>=0?"up":"down"}">${p>=0?"+":""}${money(p)}</b></div></div><div class="trade"><input id="qty-${id}" type="number" min="1" value="1"><button class="buy" onclick="tradeStock('${id}','buy')">매수</button><button class="sell" onclick="tradeStock('${id}','sell')">매도</button></div>`}
async function tradeStock(id,type){const q=Number(document.getElementById("qty-"+id).value);const{error}=await db.rpc(type==="buy"?"buy_stock_v2":"sell_stock_v2",{p_stock_id:id,p_quantity:q});if(error)return toast(error.message);await Promise.all([loadProfile(),loadStocks()])}
function history(raw,prev,cur){let a=[];if(Array.isArray(raw))a=raw;else try{a=JSON.parse(raw||"[]")}catch{}a=a.map(Number).filter(Number.isFinite);if(a.length<2)a=[Number(prev),Number(cur)];if(a.at(-1)!==Number(cur))a.push(Number(cur));return a.slice(-32)}
function stockSvg(a,w,h,small){const p=small?2:10,min=Math.min(...a),max=Math.max(...a),range=Math.max(max-min,1),pts=a.map((v,i)=>`${(p+i/Math.max(a.length-1,1)*(w-2*p)).toFixed(1)},${(h-p-(v-min)/range*(h-2*p)).toFixed(1)}`).join(" "),up=a.at(-1)>=a[0],c=up?"up":"down";return `<svg class="${small?"sparkline":"detail-chart"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polygon points="${p},${h-p} ${pts} ${w-p},${h-p}" class="fill-${c}"></polygon><polyline points="${pts}" class="line-${c}"></polyline></svg>`}
function renderWallet(){if(!profile)return;const sv=holdings.reduce((s,h)=>s+Number(h.quantity)*Number(stocks.find(x=>x.id===h.stock_id)?.current_price||0),0),iv=inventory.reduce((s,r)=>s+itemValue(r.items.average_price,r.condition_score),0),cv=collectibles.reduce((s,r)=>s+Number(r.collectibles.effect_percent)*10000,0);walletView.innerHTML=`<div class="wallet-card">현금 <b>${money(profile.cash)}</b></div><div class="wallet-card">주식 <b>${money(sv)}</b></div><div class="wallet-card">아이템 <b>${money(iv)}</b></div><div class="wallet-card">소장품 <b>${money(cv)}</b></div>`}
function updateNetworth(){if(!profile)return;const sv=holdings.reduce((s,h)=>s+Number(h.quantity)*Number(stocks.find(x=>x.id===h.stock_id)?.current_price||0),0),iv=inventory.reduce((s,r)=>s+itemValue(r.items.average_price,r.condition_score),0),cv=collectibles.reduce((s,r)=>s+Number(r.collectibles.effect_percent)*10000,0);networth.textContent=money(Number(profile.cash)+sv+iv+cv);renderWallet()}

/* 유틸 */
function closeByBackdrop(e,id){if(e.target.id===id)document.getElementById(id).classList.add("hidden")}
function itemValue(p,s){const m=s>=95?1.35:s>=85?1.18:s>=70?1:s>=50?.78:s>=30?.55:.3;return Math.round(Number(p||0)*m)}
function itemImage(name,category){
  const seed=hash(name);
  const palette=[
    ["#b77fd3","#a43d79"],["#d886a7","#b96f42"],["#80b7d8","#3e6f96"],
    ["#d3b265","#8f6438"],["#8fbd8b","#4f7f58"],["#c79175","#82513e"]
  ][seed%6];

  const descriptor=getItemVisual(name,category);
  const accent=palette[0],accent2=palette[1];

  let objectSvg="";
  if(descriptor.shape==="coin"){
    objectSvg=`<circle cx="260" cy="145" r="74" fill="#d6ad45" stroke="#7b5426" stroke-width="14"/>
      <circle cx="260" cy="145" r="51" fill="none" stroke="#f0d378" stroke-width="7"/>
      <text x="260" y="166" text-anchor="middle" font-size="54">${descriptor.icon}</text>`;
  }else if(descriptor.shape==="umbrella"){
    objectSvg=`<path d="M155 138 Q260 35 365 138 Q330 126 300 145 Q260 118 220 145 Q190 126 155 138Z" fill="${accent}" stroke="#6b3d3c" stroke-width="10"/>
      <path d="M260 135 V235 Q260 272 225 250" fill="none" stroke="#6e5238" stroke-width="15" stroke-linecap="round"/>`;
  }else if(descriptor.shape==="vase"){
    objectSvg=`<path d="M225 70 H295 L285 105 Q337 155 300 239 Q260 267 220 239 Q183 155 235 105Z" fill="${accent}" stroke="#704733" stroke-width="11"/>
      <path d="M224 158 Q260 130 296 158" fill="none" stroke="#f0cc86" stroke-width="10"/>`;
  }else if(descriptor.shape==="radio"){
    objectSvg=`<rect x="150" y="92" width="220" height="145" rx="20" fill="${accent}" stroke="#503c31" stroke-width="11"/>
      <circle cx="220" cy="165" r="46" fill="#3f4650"/><circle cx="320" cy="135" r="14" fill="#e1c56f"/>
      <rect x="284" y="174" width="57" height="11" fill="#513b2e"/><path d="M180 90 L325 40" stroke="#4a3a31" stroke-width="9"/>`;
  }else if(descriptor.shape==="book"){
    objectSvg=`<path d="M145 82 Q205 62 255 92 V234 Q205 204 145 226Z" fill="${accent}" stroke="#5b4030" stroke-width="10"/>
      <path d="M375 82 Q315 62 265 92 V234 Q315 204 375 226Z" fill="${accent2}" stroke="#5b4030" stroke-width="10"/>
      <path d="M260 92 V234" stroke="#5b4030" stroke-width="8"/>`;
  }else if(descriptor.shape==="camera"){
    objectSvg=`<rect x="145" y="95" width="230" height="145" rx="22" fill="${accent}" stroke="#463832" stroke-width="11"/>
      <circle cx="260" cy="168" r="55" fill="#243445" stroke="#d8c79b" stroke-width="12"/>
      <rect x="185" y="70" width="75" height="32" rx="8" fill="${accent2}"/>`;
  }else if(descriptor.shape==="clock"){
    objectSvg=`<circle cx="260" cy="150" r="91" fill="#f1e4c6" stroke="#735039" stroke-width="15"/>
      <path d="M260 150 L260 92 M260 150 L308 179" stroke="#3a2c24" stroke-width="11" stroke-linecap="round"/>
      <circle cx="260" cy="150" r="10" fill="#9b433b"/>`;
  }else if(descriptor.shape==="gem"){
    objectSvg=`<path d="M180 95 L230 55 H290 L340 95 L310 210 L260 255 L210 210Z" fill="${accent}" stroke="#334a5e" stroke-width="11"/>
      <path d="M180 95 H340 M230 55 L260 255 M290 55 L260 255" fill="none" stroke="#ffffff99" stroke-width="7"/>`;
  }else if(descriptor.shape==="tool"){
    objectSvg=`<path d="M175 230 L330 75" stroke="#6c4b31" stroke-width="24" stroke-linecap="round"/>
      <path d="M290 55 Q355 80 350 125 L310 105 L275 70Z" fill="${accent}" stroke="#46342c" stroke-width="10"/>`;
  }else{
    objectSvg=`<circle cx="260" cy="150" r="93" fill="${accent}" stroke="#563e31" stroke-width="11"/>
      <text x="260" y="185" text-anchor="middle" font-size="105">${descriptor.icon}</text>`;
  }

  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="520" height="320">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="${accent}"/><stop offset="1" stop-color="${accent2}"/>
      </linearGradient>
      <filter id="shadow"><feDropShadow dx="0" dy="9" stdDeviation="5" flood-opacity=".35"/></filter>
    </defs>
    <rect width="520" height="320" fill="url(#bg)"/>
    <circle cx="72" cy="63" r="41" fill="#ffffff20"/>
    <circle cx="440" cy="238" r="60" fill="#00000012"/>
    <g filter="url(#shadow)">${objectSvg}</g>
    <rect x="42" y="252" width="436" height="50" rx="13" fill="#fff9ed" stroke="#5a4030" stroke-width="5"/>
    <text x="260" y="285" text-anchor="middle" font-family="Arial" font-size="23" font-weight="700" fill="#2e261f">${escSvg(name.slice(0,15))}</text>
  </svg>`;
  return"data:image/svg+xml;charset=UTF-8,"+encodeURIComponent(svg)
}

function getItemVisual(name,category){
  const n=String(name);
  const tests=[
    [["동전","코인","메달"],"🪙","coin"],
    [["우산"],"☂️","umbrella"],
    [["항아리","도자기","병","화병","주전자"],"🏺","vase"],
    [["라디오","스피커","카세트","녹음기","앰프","턴테이블","CD"],"📻","radio"],
    [["책","도감","소설","만화","앨범","일지","노트","설명서"],"📖","book"],
    [["카메라"],"📷","camera"],
    [["시계","워치"],"🕰️","clock"],
    [["수정","원석","광석","보석","자수정","석영","흑요석","운석"],"💎","gem"],
    [["망치","드릴","스패너","펜치","톱","드라이버","렌치","공구"],"🔨","tool"],
    [["게임기"],"🎮","generic"],[["기타","악기","마이크"],"🎸","generic"],
    [["거울"],"🪞","generic"],[["나침반"],"🧭","generic"],[["전화기"],"☎️","generic"],
    [["의자","책상","선반","서랍","스툴","캐비닛"],"🪑","generic"],
    [["인형","곰","로봇","장난감","피규어"],"🧸","generic"],
    [["모자","셔츠","재킷","코트","조끼","스카프","청바지","신발"],"👕","generic"],
    [["프라이팬","냄비","식칼","도마","토스터","도시락"],"🍳","generic"]
  ];
  for(const [words,icon,shape] of tests)if(words.some(w=>n.includes(w)))return{icon,shape};
  const categoryMap={
    "전자기기":"⚡","생활용품":"🏠","수집품":"✨","골동품":"🏺","광물":"💎","공예품":"🧵",
    "의류":"👕","도서":"📚","완구":"🧸","주방용품":"🍳","음향기기":"🎵","스포츠":"🏅",
    "공구":"🔧","가구":"🪑","문구":"✏️"
  };
  return{icon:categoryMap[category]||"📦",shape:"generic"};
}
function hash(t){let h=2166136261;for(const c of t){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h)}
function escSvg(v){return String(v).replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[m]))}
function money(v){const n=Number(v)||0,u=[[1e20,"해"],[1e16,"경"],[1e12,"조"],[1e8,"억"],[1e4,"만"]];for(const[x,l]of u)if(Math.abs(n)>=x){const d=n/x;return Number(d.toFixed(Math.abs(d)>=100?0:Math.abs(d)>=10?1:2)).toLocaleString()+l+" 원"}return Math.floor(n).toLocaleString()+"원"}
function esc(v){const d=document.createElement("div");d.textContent=v??"";return d.innerHTML}
function toast(m){const t=document.getElementById("toast");t.textContent=m;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),3400)}


/* v11 premium presentation */
let soundEnabled=localStorage.getItem("sellingGodSound")!=="off",audioCtx=null;
function hideBootScreen(){document.getElementById("bootScreen")?.classList.add("hide")}
function initPremiumUI(){
  setTimeout(hideBootScreen,1800);
  const s=document.getElementById("soundToggle");if(s)s.textContent=soundEnabled?"🔊":"🔇";
  document.addEventListener("pointerdown",e=>{
    if(e.target.closest("button")){playUiTone(250,.025);const r=document.createElement("i");r.className="click-ring";r.style.left=e.clientX+"px";r.style.top=e.clientY+"px";document.getElementById("clickFxLayer")?.appendChild(r);setTimeout(()=>r.remove(),520)}
  });
  document.addEventListener("mouseover",e=>{if(e.target.closest("button"))playUiTone(520,.008)},true);
}
function toggleSound(){soundEnabled=!soundEnabled;localStorage.setItem("sellingGodSound",soundEnabled?"on":"off");const b=document.getElementById("soundToggle");if(b)b.textContent=soundEnabled?"🔊":"🔇";if(soundEnabled)playUiTone(660,.05);toast(soundEnabled?"효과음이 켜졌습니다.":"효과음이 꺼졌습니다.")}
function playUiTone(freq=330,vol=.02){
  if(!soundEnabled)return;try{audioCtx=audioCtx||new(window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.type="sine";o.frequency.value=freq;g.gain.setValueAtTime(vol,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.0001,audioCtx.currentTime+.075);o.connect(g);g.connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.08)}catch{}
}

function subscribe(){if(realtime)return;realtime=db.channel("selling-god-v11").on("postgres_changes",{event:"UPDATE",schema:"public",table:"stocks"},loadStocks).on("postgres_changes",{event:"*",schema:"public",table:"market_listings"},loadMarket).on("postgres_changes",{event:"*",schema:"public",table:"collectible_listings"},loadCollectibleMarket).subscribe()}
