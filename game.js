const SUPABASE_URL="https://qazjtevdljthbzmqmgrw.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_rIARlWBpKPvFAv_TtTdgaQ_Po-hOGmX";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let authMode="login",currentUser=null,profile=null,inventory=[],stocks=[],holdings=[],collectibles=[],effects={},explore=null,auction=null,auctionChoices=[],sellerAuction=null,negotiation=null,job=null,selectedStock=null,toastTimer=null,realtime=null,negotiationSkills={},collectiblePage=1,casePage=1,decorationPage=1,chatBusy=false,auctionRotationTimer=null,marketRotationTimer=null,stockTickerTimer=null,chatRefreshTimer=null;

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
async function enterGame(){
  showGame();
  const{error:saveError}=await db.rpc("ensure_player_save");
  if(saveError){toast("저장 데이터 확인 실패: "+saveError.message);return}
  const { error: skillSyncError } = await db.rpc("sync_skill_points_v15");
  if(skillSyncError) console.warn("스킬 포인트 동기화 실패:", skillSyncError.message);
  await refreshAll();
  subscribe();
  startGlobalStockTicker();
  setTimeout(hideBootScreen,280);
}
function showAuth(){auth.classList.remove("hidden");game.classList.add("hidden");setTimeout(hideBootScreen,520)}
function showGame(){auth.classList.add("hidden");game.classList.remove("hidden");restoreChatUnreadState();setTimeout(renderTradeDashboard,0)}
async function logout(){
  if(stockTickerTimer){clearInterval(stockTickerTimer);stockTickerTimer=null;}
  if(realtime)await db.removeChannel(realtime);
  realtime=null;
  await db.auth.signOut();
  showAuth();
}
function openPage(name,btn){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));document.getElementById("page-"+name).classList.add("active");btn?.classList.add("active");({inventory:loadInventory,pawnshop:loadPawnshop,auction:loadAuctionLobby,appraisal:loadAppraisalCenterV37,restoration:loadRestorationCenter,market:loadMarketHub,house:loadHouse,collection:loadCollectibles,jobs:resetJobPage}[name]||(()=>{}))()}
function openPageFromPhone(name){closePhone();openPage(name,document.querySelector(`[data-page="${name}"]`))}
async function refreshAll(){
  await updateStocks();
  await loadProfile();
  await loadInventory();
  await loadStocks();
  await loadCollectibles();
  await loadEffects();
  updateNetworth();
}
async function loadProfile(){
  const{data,error}=await db.rpc("get_player_profile_v24");
  if(error){toast("저장 데이터를 불러오지 못했습니다: "+error.message);return}
  profile=Array.isArray(data)?data[0]:data;
  if(!profile){toast("저장 데이터가 없습니다.");return}
  renderTradeDashboard();
  nicknameTop.textContent=data.nickname;
  nicknameHero.textContent=data.nickname;
  phoneOwner.textContent=data.nickname;
  cashTop.textContent=money(data.cash);
  credit.textContent=data.credit_score;
  reputation.textContent=data.reputation;
  updateGachaButtons();
  const t=document.getElementById("titleTop");
  if(t)applyTitleBadge(t,data.active_title||titleByProgress(data));
}
async function grantStarterFundsIfNeeded(){
  // v24부터 시작 자금은 신규 계정 생성 시 서버에서 단 한 번만 지급합니다.
  // 기존 저장 데이터를 보호하기 위해 로그인 시 현금이나 명성을 절대 수정하지 않습니다.
  return;
}

const JOB_TYPES={
  logistics:{name:"물류센터 분류",icon:"📦",desc:"주문표와 같은 물건을 빠르게 골라 분류합니다."},
  cashier:{name:"편의점 계산",icon:"🧾",desc:"상품 가격을 더해 정확한 결제 금액을 선택합니다."},
  security:{name:"야간 보안",icon:"🔦",desc:"손님은 보내고 수상한 침입자만 빠르게 잡습니다."}
};
function resetJobPage(){
  clearJob();job=null;
  ["jobSelect","jobIntro","jobGame","jobResult"].forEach(id=>document.getElementById(id)?.classList.add("hidden"));
  document.getElementById("jobSelect")?.classList.remove("hidden");
  const stage=document.getElementById("jobStage");if(stage)stage.innerHTML="";
  const title=document.getElementById("jobPageTitle"),desc=document.getElementById("jobPageDesc");
  if(title)title.textContent="알바 선택";if(desc)desc.textContent="서로 다른 방식의 알바 3개 중 하나를 선택하세요.";
}
function selectJob(type){
  const info=JOB_TYPES[type];if(!info)return;
  job={type};
  jobSelect.classList.add("hidden");jobIntro.classList.remove("hidden");jobGame.classList.add("hidden");jobResult.classList.add("hidden");
  jobIntro.innerHTML=`<div class="job-intro-icon">${info.icon}</div><p class="eyebrow">SELECTED JOB</p><h2>${info.name}</h2><p>${info.desc}</p><div class="job-rules">${jobRules(type)}</div><div class="job-intro-actions"><button class="btn light" onclick="resetJobPage()">다른 알바</button><button class="btn primary" onclick="startJobMinigame('${type}')">근무 시작</button></div>`;
  jobPageTitle.textContent=info.name;jobPageDesc.textContent=info.desc;
}
function jobRules(type){
  if(type==="logistics")return "주문 아이콘과 같은 물건을 클릭하세요. 정답 물건은 매 라운드 반드시 등장합니다. 오배송 시 2초 감소.";
  if(type==="cashier")return "진열된 상품 가격의 합계를 계산해 정답 금액을 고르세요. 오답 시 실수가 올라가고 2초 감소.";
  return "초록 손님은 클릭하지 말고 빨간 침입자만 클릭하세요. 손님을 잡으면 실수 처리됩니다.";
}
async function startJobMinigame(type=job?.type||"logistics"){
  const{data,error}=await db.rpc("prepare_job_minigame_v2",{p_job_type:type});
  if(error)return toast(error.message);
  job={type,token:data.token,target:Number(data.target_count),time:Number(data.time_limit),score:0,miss:0,active:true,round:0};
  jobIntro.classList.add("hidden");jobResult.classList.add("hidden");jobGame.classList.remove("hidden");
  jobTarget.textContent=job.target;jobScore.textContent="0";jobTime.textContent=job.time;jobMiss.textContent="0";
  renderJobRound();
  job.interval=setInterval(()=>{if(!job?.active)return;job.time--;jobTime.textContent=job.time;if(job.time<=0)finishJobMinigame()},1000);
}
function renderJobRound(){
  if(!job?.active)return;
  job.round++;
  jobStage.className=`job-stage job-${job.type}`;
  if(job.type==="logistics")renderLogisticsRound();
  else if(job.type==="cashier")renderCashierRound();
  else renderSecurityRound();
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
function renderLogisticsRound(){
  const types=["📦","🧊","📕","🧸","🎮","⚽"],target=types[Math.floor(Math.random()*types.length)];
  job.order=target;jobOrder.textContent=target;
  // 정답을 먼저 넣고 나머지를 채워, 요구한 물건이 없는 불가능한 판을 원천 차단한다.
  const choices=[target];while(choices.length<6){const x=types[Math.floor(Math.random()*types.length)];if(!choices.includes(x))choices.push(x)}shuffle(choices);
  jobStage.innerHTML=`<div class="conveyor-lines"></div>`;
  choices.forEach((icon,i)=>{const b=document.createElement("button");b.className="job-box";b.textContent=icon;b.style.left=(7+(i%3)*31+Math.random()*5)+"%";b.style.top=(12+Math.floor(i/3)*45+Math.random()*8)+"%";b.onclick=()=>pickLogistics(icon);jobStage.appendChild(b)});
}
function pickLogistics(icon){
  if(!job?.active)return;
  if(icon===job.order)jobCorrect("분류 완료!");else jobWrong("오배송! 제한시간 -2초");
}
function renderCashierRound(){
  const catalog=[{i:"🥤",n:"음료",p:1800},{i:"🍙",n:"삼각김밥",p:1400},{i:"🍜",n:"컵라면",p:1700},{i:"🍫",n:"초콜릿",p:1200},{i:"🥪",n:"샌드위치",p:3200},{i:"🍦",n:"아이스크림",p:1600}];
  const basket=shuffle([...catalog]).slice(0,3),total=basket.reduce((s,x)=>s+x.p,0);job.order="🧾";jobOrder.textContent="계산";job.correct=total;
  const options=new Set([total]);while(options.size<4){const delta=[-1000,-500,500,1000,1500][Math.floor(Math.random()*5)];if(total+delta>0)options.add(total+delta)}
  jobStage.innerHTML=`<div class="cashier-counter"><div class="cashier-items">${basket.map(x=>`<div><span>${x.i}</span><b>${x.n}</b><small>${x.p.toLocaleString()}원</small></div>`).join("")}</div><div class="receipt-line">합계 금액은?</div><div class="cashier-options">${shuffle([...options]).map(v=>`<button onclick="pickCashier(${v})">${v.toLocaleString()}원</button>`).join("")}</div></div>`;
}
function pickCashier(value){if(!job?.active)return;value===job.correct?jobCorrect("정확한 계산!"):jobWrong("계산 실수! 제한시간 -2초")}
function renderSecurityRound(){
  job.order="🚨";jobOrder.textContent="침입자";jobStage.innerHTML=`<div class="security-hall"><div class="security-door">NIGHT SECURITY</div></div>`;
  const count=5,culprit=Math.floor(Math.random()*count);
  for(let i=0;i<count;i++){
    const bad=i===culprit,b=document.createElement("button");b.className=`security-person ${bad?"intruder":"visitor"}`;b.innerHTML=`<span>${bad?"🥷":"🙂"}</span><small>${bad?"수상함":"손님"}</small>`;
    b.style.left=(5+i*18+Math.random()*4)+"%";b.style.top=(18+Math.random()*55)+"%";b.onclick=()=>pickSecurity(bad);jobStage.appendChild(b)
  }
}
function pickSecurity(isIntruder){if(!job?.active)return;isIntruder?jobCorrect("침입자 검거!"):jobWrong("손님을 붙잡았습니다! 제한시간 -2초")}
function jobCorrect(message){
  job.score++;jobScore.textContent=job.score;toast(message);if(job.score>=job.target)finishJobMinigame();else setTimeout(renderJobRound,120)
}
function jobWrong(message){
  job.miss++;jobMiss.textContent=job.miss;job.time=Math.max(0,job.time-2);jobTime.textContent=job.time;toast(message);if(job.time<=0)finishJobMinigame();else setTimeout(renderJobRound,180)
}
function clearJob(){clearInterval(job?.interval);clearTimeout(job?.roundTimer)}
async function finishJobMinigame(){
  if(!job?.active)return;job.active=false;clearJob();
  const{data,error}=await db.rpc("complete_job_minigame_v2",{p_token:job.token,p_score:job.score,p_miss:job.miss});
  jobGame.classList.add("hidden");jobResult.classList.remove("hidden");
  if(error){jobResult.innerHTML=`<h2>정산 실패</h2><p>${esc(error.message)}</p><button class="btn primary" onclick="resetJobPage()">돌아가기</button>`;return}
  const success=Boolean(data.success),info=JOB_TYPES[job.type];
  jobResult.innerHTML=`<div class="job-result-icon">${success?"💵":"🧾"}</div><p class="eyebrow">${esc(info.name)}</p><h2>${success?"근무 완료":"목표 미달"}</h2><p>${job.score}회 성공 · 실수 ${job.miss}회</p><div class="job-pay">${success?"급여 "+money(data.reward):"이번 급여 0원"}</div><div class="job-intro-actions"><button class="btn light" onclick="resetJobPage()">알바 선택</button><button class="btn primary" onclick="selectJob('${job.type}')">다시 도전</button></div>`;
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
  const{data,error}=await db.from("user_items").select(`id,condition_score,is_listed,restoration_locked,items(id,name,category,average_price,rarity)`).eq("user_id",currentUser.id).order("acquired_at",{ascending:false});
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
const HAGGLE_SKILLS={
  market_data:{name:"시세 분석",icon:"📊",cost:1,desc:"시세 자료 제시 사용 가능",requires:null},
  storytelling:{name:"가치 스토리텔링",icon:"✨",cost:1,desc:"가치와 사연 강조 사용 가능",requires:null},
  quick_deal:{name:"즉시 거래 유도",icon:"💵",cost:2,desc:"현금 즉시 거래 전략 사용 가능",requires:"market_data"},
  silence_pressure:{name:"침묵의 압박",icon:"🤐",cost:2,desc:"말없이 기다려 NPC의 재제안을 유도",requires:"storytelling"},
  walkaway:{name:"협상 결렬 압박",icon:"🚪",cost:3,desc:"다른 곳에 팔겠다는 최후통첩",requires:"silence_pressure"}
};
function hasHaggleSkill(code){return !!negotiationSkills?.[code]}
function renderNegotiation(){
  negotiationModal.classList.remove("hidden");
  const n=negotiation,profit=negotiationProfit(n),profitPct=n.base?profit/n.base*100:0;
  const ceiling=Math.max(1,n.limit-n.base),progress=Math.max(0,Math.min(100,(n.npcOffer-n.base)/ceiling*100));
  const patiencePct=Math.max(0,n.patience/n.maxPatience*100);
  const recommended=Math.round(Math.max(n.npcOffer+1000,n.npcOffer*1.05,n.market*.98));
  const history=n.history.map(x=>`<div class="chat ${x.who}"><b>${x.who==="npc"?n.persona.name:"나"}</b><span>${esc(x.text)}</span></div>`).join("");
  const actions=[
    {code:"polite",icon:"🤝",name:"정중한 재제안",desc:"기본 기술 · 안전하지만 상승폭이 작음",free:true},
    {code:"evidence",skill:"market_data",icon:"📊",name:"시세 자료 제시",desc:"안전형 · 인내심 소모가 적음"},
    {code:"story",skill:"storytelling",icon:"✨",name:"가치와 사연 강조",desc:"균형형 · 성공 시 큰 폭 상승"},
    {code:"cash",skill:"quick_deal",icon:"💵",name:"지금 바로 현금 거래",desc:"빠른 계약을 조건으로 가격 인상"},
    {code:"silence",skill:"silence_pressure",icon:"🤐",name:"침묵하며 기다리기",desc:"가격을 말하지 않고 NPC 재제안 유도"},
    {code:"walkaway",skill:"walkaway",icon:"🚪",name:"다른 곳에 팔겠다고 압박",desc:"최고위험 · 성공 시 가장 큰 인상"}
  ];
  const actionHtml=actions.map(a=>{const unlocked=a.free||hasHaggleSkill(a.skill);return `<button class="haggle-skill-btn ${unlocked?'':'locked'}" ${unlocked?`onclick="submitNegotiationOffer('${a.code}')"`:`onclick="openSkillTreeFromNegotiation()"`}><b>${a.icon} ${a.name}</b><small>${unlocked?a.desc:`🔒 스킬 트리에서 ${HAGGLE_SKILLS[a.skill]?.name||''} 해금 필요`}</small></button>`}).join('');
  negotiationContent.innerHTML=`
    <div class="haggle-top"><div><p class="eyebrow">LIVE NEGOTIATION · ROUND ${n.round}</p><h2>${esc(n.title)}</h2></div><div class="dealer-profile"><strong>${n.persona.icon} ${n.persona.name}</strong><small>${n.persona.line}</small></div></div>
    <div class="deal-summary deluxe"><div><span>즉시 판매 기준</span><b>${money(n.base)}</b></div><div><span>참고 시세</span><b>${money(n.market)}</b></div><div class="offer-main"><span>현재 제안</span><b>${money(n.npcOffer)}</b></div><div class="profit-main"><span>확정 추가이익</span><b class="${profit>=0?'up':'down'}">${profit>=0?'+':''}${money(profit)}</b><small>${profitPct>=0?'+':''}${profitPct.toFixed(1)}%</small></div></div>
    <div class="haggle-bars"><label>NPC 인내심 <i><em style="width:${patiencePct}%"></em></i></label><label>흥정 성과 <i><em style="width:${progress}%"></em></i></label></div>
    <div id="negChat" class="neg-chat">${history}</div>
    ${n.ended?`<div class="final-offer"><b>최종 제안</b><strong>${money(n.npcOffer)}</strong><button onclick="acceptNpcCounter()">이 가격에 계약</button></div>`:`
      <div class="manual-offer advanced"><div class="offer-copy"><label>내 희망 판매가</label><small>추천 ${money(recommended)} · 희망가는 자유롭게 입력 가능</small></div><div class="offer-controls"><button onclick="adjustHaggleAsk(-10000)">-1만</button><button onclick="adjustHaggleAsk(-1000)">-1천</button><input id="haggleAsk" type="number" min="${n.npcOffer+1}" step="1000" value="${recommended}"><button onclick="adjustHaggleAsk(1000)">+1천</button><button onclick="adjustHaggleAsk(10000)">+1만</button><button class="recommend" onclick="setRecommendedHaggle(${recommended})">추천가</button></div></div>
      <div class="haggle-actions skill-grid">${actionHtml}</div>`}
    <button class="accept-now" onclick="acceptNpcCounter()">현재 제안 확정 · 순이익 ${profit>=0?'+':''}${money(profit)}</button>`;
  scrollNegotiationToLatest();
}
function adjustHaggleAsk(delta){const el=document.getElementById('haggleAsk'),n=negotiation;if(!el||!n)return;el.value=Math.max(n.npcOffer+1,Math.round(Number(el.value||n.npcOffer)+delta))}
function setRecommendedHaggle(value){const el=document.getElementById('haggleAsk');if(el)el.value=value}
function openSkillTreeFromNegotiation(){toast('휴대폰의 협상 스킬 앱에서 기술을 해금하세요.');closeNegotiation();openPhone();openPhoneApp('skills')}
function submitNegotiationOffer(style){
  const n=negotiation;if(!n||n.ended)return;
  const el=document.getElementById("haggleAsk"),ask=Math.max(n.npcOffer+1,Math.min(n.limit,Math.round(Number(el?.value)||n.npcOffer)));
  const configs={
    polite:{risk:.05,power:.34,cost:0,label:"예의를 갖춰 조금 더 좋은 가격을 부탁했다."},
    evidence:{risk:.10,power:.58,cost:0,label:"최근 거래 시세와 상태 자료를 근거로 제시했다."},
    story:{risk:.20,power:.74,cost:1,label:"물건의 희소성과 사연을 설득력 있게 설명했다."},
    cash:{risk:.16,power:.67,cost:1,label:"지금 바로 현금으로 거래하겠다는 조건을 제시했다."},
    silence:{risk:.24,power:.82,cost:1,label:"대답하지 않고 조용히 상대의 다음 제안을 기다렸다."},
    walkaway:{risk:.48,power:1.0,cost:2,label:"다른 구매자에게 팔겠다며 협상 결렬을 압박했다."}
  };
  const cfg=configs[style]||configs.polite;
  if(style!=='polite'){const need={evidence:'market_data',story:'storytelling',cash:'quick_deal',silence:'silence_pressure',walkaway:'walkaway'}[style];if(need&&!hasHaggleSkill(need))return toast('해당 협상 스킬을 먼저 해금하세요.')}
  const target=style==='silence'?Math.min(n.limit,Math.round(n.npcOffer+(n.limit-n.npcOffer)*(.22+Math.random()*.18))):ask;
  const gap=(target-n.npcOffer)/Math.max(1,n.limit-n.npcOffer),difficulty=Math.max(0,gap-n.persona.openness);
  const fail=Math.min(.88,cfg.risk+difficulty*.62+n.persona.pressure*(style==="walkaway"?.25:.05));
  n.history.push({who:"me",text:`${cfg.label}${style==='silence'?'':` 희망 가격은 ${money(target)}.`}`});n.round++;n.patience=Math.max(0,n.patience-cfg.cost);
  if(Math.random()<fail){n.mood="bad";n.patience=Math.max(0,n.patience-1);const cut=style==="walkaway"&&Math.random()<.4?Math.round((n.npcOffer-n.base)*.22):0;n.npcOffer=Math.max(n.base,n.npcOffer-cut);n.history.push({who:"npc",text:n.patience<=0?`이제 끝내지. ${money(n.npcOffer)}이 마지막 제안이야.`:`그 방법은 통하지 않아. ${cut?'내 제안을 오히려 낮추겠네.':'좀 더 현실적인 이야기를 하게.'}`});if(n.patience<=0)n.ended=true;renderNegotiation();return}
  const gain=Math.max(1,Math.round((target-n.npcOffer)*cfg.power*(.82+Math.random()*.28)));n.npcOffer=Math.min(n.limit,n.npcOffer+gain);n.mood="good";n.history.push({who:"npc",text:`좋아. ${money(n.npcOffer)}까지 올리지. ${n.patience<=1?'이게 거의 마지막 양보야.':'다음 제안도 들어보겠네.'}`});if(n.patience<=0)n.ended=true;renderNegotiation()
}
async function acceptNpcCounter(){
  const n=negotiation;if(!n)return;const final=Math.round(n.npcOffer),profit=negotiationProfit(n,final);
  if(n.type==="pawn")await pawnSell(n.id,"negotiated",Math.round(final/n.base*100));else{const{data,error}=await db.rpc("accept_npc_market_offer",{p_offer_id:n.offerId,p_final_price:final});if(error)return toast(error.message);await Promise.all([loadProfile(),loadNpcOffers(),loadInventory()])}
  saveTradeLedger({title:n.title,base:n.base,final,profit,rounds:n.round-1,persona:n.persona?.name||"NPC"});toast(`거래 성사 · 판매 ${money(final)} · 추가이익 ${profit>=0?'+':''}${money(profit)}`);closeNegotiation()
}
function closeNegotiation(){negotiation=null;negotiationModal.classList.add("hidden")}


function formatRotationTime(ms){const total=Math.max(0,Math.ceil(ms/1000)),m=Math.floor(total/60),sec=total%60;return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function startRotationCountdown(kind,refreshAt,bannerId,onExpire){
  if(kind==='auction'&&auctionRotationTimer)clearInterval(auctionRotationTimer);
  if(kind==='market'&&marketRotationTimer)clearInterval(marketRotationTimer);
  let fired=false,timer=null;
  const tick=()=>{const banner=document.getElementById(bannerId),span=banner?.querySelector('strong span'),left=new Date(refreshAt).getTime()-Date.now();if(span)span.textContent=formatRotationTime(left);if(left<=0&&!fired){fired=true;clearInterval(timer);if(kind==='auction')auctionRotationTimer=null;else marketRotationTimer=null;setTimeout(()=>onExpire?.(),300)}};
  tick();timer=setInterval(tick,1000);if(kind==='auction')auctionRotationTimer=timer;else marketRotationTimer=timer;
}

/* 경매 v13 */
function switchAuctionMode(mode,btn){document.querySelectorAll('.auction-tabs button').forEach(x=>x.classList.remove('active'));btn?.classList.add('active');auctionBuyPanel.classList.toggle('hidden',mode!=='buy');auctionSellPanel.classList.toggle('hidden',mode!=='sell');if(mode==='sell')fillAuctionSellItems();else loadAuctionLobby()}
async function loadAuction(){return loadAuctionLobby()}
async function loadAuctionLobby(){
  clearInterval(auction?.interval);auction=null;auctionHall.innerHTML='';
  const{data,error}=await db.rpc('get_auction_choices_v23');
  if(error){toast('경매 목록을 불러오지 못했습니다: '+error.message);auctionChoices=localAuctionChoices();renderAuctionChoices();return}
  auctionChoices=Array.isArray(data?.choices)?data.choices:[];
  renderAuctionChoices(data?.refresh_at);
}
function localAuctionChoices(){return inventory.slice(0,3).map((r,i)=>({item_id:r.items.id,item_name:r.items.name,category:r.items.category,rarity:r.items.rarity,condition_score:Math.max(75,r.condition_score),start_price:Math.max(1000,Math.round(itemValue(r.items.average_price,r.condition_score)*(.78+i*.06)))}))}
function renderAuctionChoices(refreshAt){
  const el=document.getElementById('auctionChoices');
  const cards=(auctionChoices||[]).map((a,i)=>{
    if(a.ended){
      return `<div class="auction-choice auction-slot-ended"><div class="auction-ended-seal">경매 종료</div><h3>${esc(a.item_name||'종료된 경매품')}</h3><p>다음 30분 교체 전까지 이 자리는 비어 있습니다.</p><small>새 상품 준비 중</small></div>`;
    }
    return `<button class="auction-choice ${rarityClass(a.rarity)}" onclick="enterAuctionChoice(${i})"><img src="${itemImage(a.item_name,a.category)}"><span class="badge ${rarityClass(a.rarity)}">${esc(a.rarity)}</span><h3>${esc(a.item_name)}</h3><div>상태 ${a.condition_score}/100</div><b>시작가 ${money(a.start_price)}</b><small>입장하기 →</small></button>`;
  }).join('');
  el.innerHTML=`<div id="auctionRotationBanner" class="rotation-banner auction-rotation"><div><b>프리미엄 경매 라인업</b><small>종료된 경매품은 다음 교체 전까지 다시 채워지지 않습니다.</small></div><strong>다음 교체 <span>--:--</span></strong></div>`+(cards||'<div class="panel empty-state">현재 경매품이 없습니다.</div>');
  if(refreshAt)startRotationCountdown('auction',refreshAt,'auctionRotationBanner',()=>{if(!auction)loadAuctionLobby()});
}
async function enterAuctionChoice(i){const c=auctionChoices[i];if(!c||c.ended)return toast('이미 종료된 경매입니다.');const{data,error}=await db.rpc('create_auction_choice_v31',{p_cycle_key:c.cycle_key,p_slot_no:c.slot_no});if(error)return toast(error.message);auction={id:data.auction_id,cycleKey:c.cycle_key,slotNo:c.slot_no,name:c.item_name,category:c.category,rarity:c.rarity,price:Number(data.current_price),highest:false,stopped:false,bids:0,countdown:0,log:[`경매 시작 ${money(data.current_price)}`]};document.getElementById('auctionChoices').classList.add('hidden');renderAuction();startAuctionLoop()}
function renderAuction(){if(!auction)return;auctionHall.innerHTML=`<div class="auction-card v13"><img src="${itemImage(auction.name,auction.category)}"><div><span class="badge ${rarityClass(auction.rarity)}">${esc(auction.rarity)}</span><h2>${esc(auction.name)}</h2><div class="bid-price"><span>현재 최고가</span><b>${money(auction.price)}</b>${auction.countdown?`<em>낙찰까지 ${auction.countdown}</em>`:''}</div><div id="auctionBidLog" class="bid-log">${auction.log.map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="auction-actions"><button class="btn light" onclick="playerBid(5)">+5%</button><button class="btn light" onclick="playerBid(12)">+12%</button><button class="btn primary" onclick="leaveAuction()">경매 나가기</button></div></div></div>`;requestAnimationFrame(()=>{const log=document.getElementById('auctionBidLog');if(log)log.scrollTop=log.scrollHeight})}
function leaveAuction(){clearInterval(auction?.interval);auction=null;document.getElementById('auctionChoices').classList.remove('hidden');auctionHall.innerHTML=''}
function startAuctionLoop(){clearInterval(auction.interval);auction.interval=setInterval(async()=>{if(!auction)return;const{data,error}=await db.rpc('npc_auction_step_v31',{p_auction_id:auction.id});if(error){clearInterval(auction.interval);return toast(error.message)}auction.price=Number(data.current_price);if(data.action==='hold'){auction.stopped=true;auction.log.push('추가 입찰이 없습니다. 3초 후 경매가 종료됩니다.');clearInterval(auction.interval);startAuctionCountdown()}else{auction.bids++;const bidder=data.bidder_name||'NPC 수집가';auction.log.push(data.action==='raise'?`${bidder} 입찰 +${money(data.increment)}`:`${bidder} 강한 입찰 +${money(data.increment)}`);renderAuction()}},1800)}
function startAuctionCountdown(){auction.countdown=3;renderAuction();const t=setInterval(async()=>{if(!auction)return clearInterval(t);auction.countdown--;renderAuction();if(auction.countdown<=0){clearInterval(t);const finished={...auction};if(auction.highest){const{data,error}=await db.rpc('claim_auction_v31',{p_auction_id:auction.id});if(error)return toast(error.message);if(data.won){toast('낙찰 성공 '+money(data.final_price));playSuccessSound();await Promise.all([loadProfile(),loadInventory()])}}else{const{data,error}=await db.rpc('close_auction_without_winner_v31',{p_auction_id:auction.id});if(error)console.warn(error.message);toast(data?.npc_won?`NPC 낙찰 ${money(data.final_price)}`:'입찰자가 없어 유찰되었습니다.')}auctionChoices=auctionChoices.map(x=>x.cycle_key===finished.cycleKey&&x.slot_no===finished.slotNo?{...x,ended:true}:x);leaveAuction();renderAuctionChoices()}},1000)}
async function playerBid(pct){if(!auction)return;const bid=Math.round(auction.price*(1+pct/100));const{data,error}=await db.rpc('place_auction_bid',{p_auction_id:auction.id,p_bid_amount:bid});if(error)return toast(error.message);auction.price=Number(data.current_price);auction.highest=true;auction.bids++;auction.log.push('내 입찰 '+money(bid));renderAuction()}
function fillAuctionSellItems(){auctionSellItem.innerHTML='<option value="">출품할 아이템 선택</option>';inventory.filter(x=>!x.is_listed).forEach(x=>auctionSellItem.add(new Option(`${x.items.name} · ${x.items.rarity} · 상태 ${x.condition_score}`,x.id)))}
async function startSellerAuction(){const id=auctionSellItem.value,r=inventory.find(x=>x.id===id);if(!r)return toast('출품할 아이템을 선택하세요.');const{data,error}=await db.rpc('start_npc_seller_auction_v13',{p_user_item_id:id});if(error)return toast(error.message);sellerAuction={session:data.session_id,item:r,current:Number(data.start_price),step:0,maxSteps:Number(data.max_steps),log:[`시작가 ${money(data.start_price)}`],countdown:0,lastBidAt:Date.now(),timer:null,ending:false};renderSellerAuction();runSellerAuction()}
function renderSellerAuction(){const s=sellerAuction;if(!s)return;sellerAuctionHall.innerHTML=`<div class="seller-live"><img src="${itemImage(s.item.items.name,s.item.items.category)}"><div><p class="eyebrow">NPC COLLECTOR BATTLE</p><h2>${esc(s.item.items.name)}</h2><div class="seller-price">현재 입찰가 <b>${money(s.current)}</b>${s.countdown?`<em class="seller-countdown">판매까지 ${s.countdown}</em>`:''}</div><div class="collector-row"><span>🧐 감정가</span><span>🤑 수집가</span><span>😎 리셀러</span></div><div id="sellerBidLog" class="bid-log">${s.log.map(x=>`<p>${esc(x)}</p>`).join('')}</div></div></div>`;requestAnimationFrame(()=>{const log=document.getElementById('sellerBidLog');if(log)log.scrollTop=log.scrollHeight})}
async function finishSellerAuctionAfterCountdown(){const s=sellerAuction;if(!s||s.ending)return;s.ending=true;const{data,error}=await db.rpc('finish_npc_seller_auction_v13',{p_session_id:s.session,p_final_price:s.current});if(error){s.ending=false;return toast(error.message)}toast(`판매 완료 ${money(data.final_price)}`);playSuccessSound();clearInterval(s.timer);sellerAuction=null;await Promise.all([loadProfile(),loadInventory()]);fillAuctionSellItems();sellerAuctionHall.innerHTML='<div class="auction-finished">3초 동안 추가 입찰이 없어 판매가 확정되었습니다.</div>'}
function startSellerAuctionCountdown(){const s=sellerAuction;if(!s||s.countdown||s.ending)return;s.countdown=3;s.log.push('추가 입찰이 없습니다. 3초 후 판매됩니다.');renderSellerAuction();const countdownTimer=setInterval(async()=>{if(!sellerAuction||sellerAuction!==s){clearInterval(countdownTimer);return}s.countdown--;renderSellerAuction();if(s.countdown<=0){clearInterval(countdownTimer);await finishSellerAuctionAfterCountdown()}},1000)}
function runSellerAuction(){const s=sellerAuction;if(!s)return;clearInterval(s.timer);s.timer=setInterval(()=>{if(!sellerAuction||sellerAuction!==s||s.ending){clearInterval(s.timer);return}if(s.countdown)return;const rarityWeight=rarityScore(s.item.items.rarity),cond=s.item.condition_score;const quality=Math.min(.96,.34+rarityWeight*.085+cond/220);const canBid=s.step<s.maxSteps&&Math.random()<quality;if(canBid){s.step++;const jump=.018+Math.random()*(.018+rarityWeight*.012+cond/3000);const before=s.current;s.current=Math.round(s.current*(1+jump));s.lastBidAt=Date.now();s.log.push(`${['감정가','수집가','리셀러'][s.step%3]} +${money(s.current-before)}`);renderSellerAuction();return}if(Date.now()-s.lastBidAt>=1800||s.step>=s.maxSteps)startSellerAuctionCountdown()},700)}
function rarityScore(r){return {'일반':0,'희귀':1,'초희귀':2,'진귀':3,'보물':4,'유물':5,'고대 유물':6}[r]??0}
function rarityClass(r){return 'rarity-'+rarityScore(r)}

/* 시장 */
function switchMarketTab(name,btn){document.querySelectorAll(".market-tabs button").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".market-panel").forEach(x=>x.classList.add("hidden"));btn.classList.add("active");document.getElementById("market-"+name).classList.remove("hidden");if(name==="offers")loadNpcOffers();if(name==="collectibles")loadCollectibleMarket()}
async function loadMarketHub(){await Promise.all([loadInventory(),loadMarket(),loadNpcOffers(),loadCollectibles(),loadCollectibleMarket()])}
function fillItemSelect(){sellItem.innerHTML=`<option value="">판매할 아이템</option>`;inventory.filter(x=>!x.is_listed).forEach(x=>sellItem.add(new Option(`${x.items.name} · 상태 ${x.condition_score}`,x.id)))}
async function createListing(){const id=sellItem.value,p=Math.floor(Number(sellPrice.value));if(!id||p<=0)return toast("아이템과 가격을 확인하세요.");const{error}=await db.rpc("create_market_listing",{p_user_item_id:id,p_price:p});if(error)return toast(error.message);sellPrice.value="";toast("장터 등록 완료");await Promise.all([loadInventory(),loadMarket()])}
async function loadMarket(){const{data,error}=await db.from("market_listings").select(`id,title,asking_price,seller_user_id,user_items(condition_score,items(category)),profiles:seller_user_id(nickname)`).eq("status","active").order("created_at",{ascending:false});if(error)return toast(error.message);marketList.innerHTML=(data||[]).map(r=>{const mine=r.seller_user_id===currentUser.id;return `<article class="market-card"><div class="item-image"><img src="${itemImage(r.title,r.user_items?.items?.category)}"></div><div class="market-body"><h3>${esc(r.title)}</h3><div class="meta">${esc(r.profiles?.nickname||"유저")} · 상태 ${r.user_items?.condition_score||"-"}</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?"light":"primary"} full" onclick="${mine?`cancelListing('${r.id}')`:`buyListing('${r.id}')`}">${mine?"판매 취소":"구매"}</button></div></article>`}).join("")||`<div class="panel" style="padding:20px">매물이 없습니다.</div>`}
async function buyListing(id){const{data,error}=await db.rpc("buy_market_listing",{p_listing_id:id});if(error)return toast(error.message);toast("구매 완료 "+money(data.final_price));await refreshAll();loadMarket()}
async function cancelListing(id){const{error}=await db.rpc("cancel_market_listing",{p_listing_id:id});if(error)return toast(error.message);await Promise.all([loadInventory(),loadMarket()])}
async function loadNpcOffers(){
  const{data:cycle,error:gerr}=await db.rpc('generate_npc_purchase_offers_v23');
  if(gerr)return toast(gerr.message);
  // 구매 전에는 condition_score 자체를 내려받지 않아 화면이나 개발자 도구에서 상태가 노출되지 않게 한다.
  const{data,error}=await db.from('npc_purchase_offers')
    .select(`id,asking_price,min_price,expires_at,items(id,name,category,rarity,average_price)`)
    .eq('user_id',currentUser.id).eq('status','active')
    .gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});
  if(error)return toast(error.message);
  npcOfferList.innerHTML=`<div id="marketRotationBanner" class="rotation-banner market-rotation"><div><b>중고 매물 라인업</b><small>실제 상태는 구매 후 전문 감정소에서만 확인할 수 있습니다.</small></div><strong>다음 교체 <span>--:--</span></strong></div>`+
    ((data||[]).map(o=>{
      const p=getNpcMarketPersona(o.id),rc=rarityClass(normalizeRarityV35(o.items.rarity));
      return `<article class="market-card npc-buy-card npc-theme-${p.theme}">
        <div class="npc-seller-strip"><span class="npc-mini-avatar">${p.face}</span><div><b>${esc(p.name)}</b><small>${esc(p.role)} · ${esc(p.temperament)}</small></div></div>
        <div class="item-image"><img src="${itemImage(o.items.name,o.items.category)}"></div>
        <div class="market-body"><h3 class="rarity-text ${rc}">${esc(o.items.name)}</h3><div class="meta rarity-text ${rc}">${esc(normalizeRarityV35(o.items.rarity))}</div><div class="meta hidden-condition-v383">🔒 상태 미감정 · 구매 후 감정소에서 확인</div><div class="price">판매가 ${money(o.asking_price)}</div><small class="market-hint">${esc(p.preview)}</small><button class="btn primary full" onclick="startNpcOffer('${o.id}')">${esc(p.name)}와 흥정</button></div>
      </article>`
    }).join('')||'<div class="panel" style="padding:20px">현재 NPC 판매 상품이 없습니다.</div>');
  if(cycle?.refresh_at)startRotationCountdown('market',cycle.refresh_at,'marketRotationBanner',loadNpcOffers);
}

const NPC_MARKET_PERSONAS=[
  {name:'강철수',role:'완고한 골동품상',face:'🧔🏻',body:'🧥',theme:'bronze',patience:5,openness:.34,temperament:'원칙주의',preview:'가격 근거가 없으면 쉽게 양보하지 않습니다.',likes:['evidence','polite'],dislikes:['walk'],line:'물건의 가치는 내가 제일 잘 알지. 근거를 가져오게.',success:'흠, 그 정도 근거라면 조금은 조정하지.',reject:'말만으로는 부족하네. 납득할 근거가 필요해.'},
  {name:'윤서아',role:'급전이 필요한 셀러',face:'👩🏻',body:'🧶',theme:'rose',patience:3,openness:.76,temperament:'조급함',preview:'빠른 결제 제안에 약하지만 오래 끌면 거래를 닫습니다.',likes:['cash','direct'],dislikes:['silence'],line:'오늘 안에 정리해야 해서요. 바로 결제하면 맞춰드릴게요.',success:'좋아요. 지금 결제한다면 그 가격에 가깝게 맞출게요.',reject:'너무 낮아요. 급하다고 헐값에 넘길 생각은 없어요.'},
  {name:'박도윤',role:'친절한 취미 수집가',face:'🙂',body:'🧢',theme:'green',patience:6,openness:.60,temperament:'대화형',preview:'예의 바른 제안과 물건의 상태 이야기를 좋아합니다.',likes:['polite','defect'],dislikes:['walk'],line:'서로 기분 좋게 거래하면 좋겠네요.',success:'말씀을 들어보니 일리가 있네요. 조금 낮춰드리죠.',reject:'그 가격은 제가 받아들이기 어렵네요. 중간을 찾아봐요.'},
  {name:'최미래',role:'데이터형 리셀러',face:'👩🏻‍💼',body:'📊',theme:'blue',patience:4,openness:.48,temperament:'계산적',preview:'시세와 수치에 반응하며 감정적인 압박에는 냉정합니다.',likes:['evidence','defect'],dislikes:['story','walk'],line:'최근 거래가와 상태 감가를 기준으로 이야기하죠.',success:'수치가 맞네요. 계산을 다시 해보니 조정 가능합니다.',reject:'그 제안은 데이터상 설명이 되지 않아요.'},
  {name:'한유진',role:'감성적인 빈티지 숍 사장',face:'👩🏻‍🎨',body:'🧣',theme:'violet',patience:5,openness:.57,temperament:'감성적',preview:'물건의 사연과 매력을 존중하면 호의적으로 반응합니다.',likes:['story','polite'],dislikes:['defect'],line:'이 물건에는 오래된 분위기가 있어요. 그 가치를 알아보시나요?',success:'그렇게 봐주신다면 좋은 분께 보내는 마음으로 양보할게요.',reject:'흠집만 이야기하면 이 물건의 매력을 놓치게 돼요.'},
  {name:'오태식',role:'흥정꾼 노점상',face:'😏',body:'🦺',theme:'orange',patience:4,openness:.52,temperament:'승부욕',preview:'과감한 제안을 즐기지만 약한 태도에는 버티는 편입니다.',likes:['walk','direct'],dislikes:['polite'],line:'흥정은 기세지! 어디 한번 제대로 불러봐.',success:'하하, 배짱이 마음에 드는군. 그 정도는 맞춰주지.',reject:'그 정도 기세로는 내 가격을 못 꺾어.'},
  {name:'이하늘',role:'첫 판매를 시작한 대학생',face:'🧑🏻',body:'🎒',theme:'sky',patience:5,openness:.68,temperament:'서툼',preview:'친절한 설명과 즉시 결제에 쉽게 마음이 움직입니다.',likes:['polite','cash'],dislikes:['walk'],line:'중고 거래가 처음이라 적당한 가격을 잘 모르겠어요.',success:'알겠습니다. 설명해 주신 가격이면 괜찮을 것 같아요.',reject:'그건 너무 낮은 것 같아요. 조금만 더 올려주세요.'},
  {name:'문세진',role:'희귀품 전문 브로커',face:'🕴🏻',body:'💼',theme:'black',patience:3,openness:.38,temperament:'냉정함',preview:'고급 물건일수록 자신감이 강하며 전략적인 제안만 통합니다.',likes:['evidence','walk'],dislikes:['polite','story'],line:'시간 낭비는 싫습니다. 현실적인 숫자만 제시하세요.',success:'좋습니다. 계산이 빠르시군요. 그 선까지 내려가죠.',reject:'거래 감각이 부족하시군요. 그 가격은 거절입니다.'}
];

function stringHash(v){let h=2166136261;for(const ch of String(v)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619)}return Math.abs(h)}
function getNpcMarketPersona(seed){return NPC_MARKET_PERSONAS[stringHash(seed)%NPC_MARKET_PERSONAS.length]}

async function startNpcOffer(id){
  const{data,error}=await db.from('npc_purchase_offers')
    .select(`id,asking_price,min_price,items(id,name,category,rarity)`)
    .eq('id',id).eq('status','active').single();
  if(error)return toast(error.message);
  const persona=getNpcMarketPersona(id);
  negotiation={type:'npc_buy',offerId:id,itemId:data.items.id,title:data.items.name,category:data.items.category,rarity:data.items.rarity,condition:null,asking:Number(data.asking_price),minPrice:Number(data.min_price),npcOffer:Number(data.asking_price),round:1,patience:persona.patience,maxPatience:persona.patience,persona,selectedStyle:'direct',history:[{who:'npc',text:persona.line},{who:'npc',text:`판매가는 ${money(data.asking_price)}입니다. 원하는 가격을 직접 제시해 보세요.`}],ended:false};
  renderNpcBuyNegotiation();
}

function applyNpcCharacter(persona){
  const room=document.querySelector('#negotiationModal .negotiation-room');
  const head=document.querySelector('#negotiationModal .negotiator-head');
  const torso=document.querySelector('#negotiationModal .negotiator-torso');
  const name=document.querySelector('#negotiationModal .negotiation-name');
  const sign=document.querySelector('#negotiationModal .negotiation-sign');
  if(room){room.className=`negotiation-room npc-market-room npc-theme-${persona.theme}`;room.dataset.persona=persona.name}
  if(head)head.textContent=persona.face;
  if(torso)torso.textContent=persona.body;
  if(name)name.textContent=persona.name;
  if(sign)sign.textContent=`${persona.name.toUpperCase()} · SECONDHAND DEAL`;
}

function renderNpcBuyNegotiation(){
  const n=negotiation;if(!n||n.type!=='npc_buy')return;
  negotiationModal.classList.remove('hidden');applyNpcCharacter(n.persona);
  const discount=n.asking-n.npcOffer,discountPct=n.asking?discount/n.asking*100:0;
  const recommended=Math.max(n.minPrice,Math.round(n.npcOffer-(n.npcOffer-n.minPrice)*.45));
  const patiencePct=Math.max(0,n.patience/n.maxPatience*100);
  const history=n.history.map(x=>`<div class="chat ${x.who}"><b>${x.who==='npc'?esc(n.persona.name):'나'}</b><span>${esc(x.text)}</span></div>`).join('');
  const tactics=[
    ['direct','💬','희망가만 제시','기본 제안 · 성격 영향이 가장 큼'],
    ['polite','🤝','정중하게 요청','안전형 · 친절한 판매자에게 효과적'],
    ['evidence','📊','시세 근거 제시','계산적·완고한 판매자에게 효과적'],
    ['defect','🔎','상태 흠집 지적','상태가 낮을수록 효과 상승'],
    ['story','✨','좋은 구매자임을 강조','감성적인 판매자에게 효과적'],
    ['cash','💵','즉시 결제 약속','급한 판매자에게 효과적'],
    ['walk','🚶','다른 매물과 비교','승부욕 강한 판매자에게 효과적']
  ];
  negotiationContent.innerHTML=`
    <div class="haggle-top"><div><p class="eyebrow">SECONDHAND NEGOTIATION · ROUND ${n.round}</p><h2>${esc(n.title)}</h2></div><div class="dealer-profile npc-profile-${n.persona.theme}"><strong>${n.persona.face} ${esc(n.persona.name)}</strong><small>${esc(n.persona.role)} · ${esc(n.persona.temperament)}</small><em>${esc(n.persona.preview)}</em></div></div>
    <div class="deal-summary deluxe buy-mode"><div><span>최초 판매가</span><b>${money(n.asking)}</b></div><div><span>판매자 마지노선</span><b>${money(n.minPrice)}</b></div><div class="offer-main"><span>현재 구매가</span><b>${money(n.npcOffer)}</b></div><div class="profit-main"><span>현재 절약액</span><b class="up">-${money(discount)}</b><small>${discountPct.toFixed(1)}% 할인</small></div></div>
    <div class="haggle-bars"><label>판매자 인내심 <i><em style="width:${patiencePct}%"></em></i></label><label>할인 진행 <i><em style="width:${Math.min(100,discount/Math.max(1,n.asking-n.minPrice)*100)}%"></em></i></label></div>
    <div id="negChat" class="neg-chat">${history}</div>
    ${n.ended?`<div class="final-offer"><b>최종 판매가</b><strong>${money(n.npcOffer)}</strong><button onclick="acceptNpcBuyDeal()">이 가격에 구매</button></div>`:`
      <div class="manual-offer advanced npc-offer-box"><div class="offer-copy"><label>내 희망 구매가</label><small>직접 입력 후 아래의 <b>희망가 제시</b> 버튼을 누르세요 · 추천 ${money(recommended)}</small></div><div class="offer-controls"><button onclick="adjustNpcBuyAsk(-10000)">-1만</button><button onclick="adjustNpcBuyAsk(-1000)">-1천</button><input id="npcBuyAsk" type="number" min="1" step="1000" inputmode="numeric" value="${recommended}" aria-label="내 희망 구매가"><button onclick="adjustNpcBuyAsk(1000)">+1천</button><button onclick="adjustNpcBuyAsk(10000)">+1만</button><button class="recommend" onclick="setNpcBuyRecommended(${recommended})">추천가</button></div></div>
      <div class="npc-tactic-grid">${tactics.map(([code,icon,title,desc])=>`<button class="npc-tactic ${n.selectedStyle===code?'selected':''}" onclick="selectNpcBuyStyle('${code}')"><b>${icon} ${title}</b><small>${desc}</small></button>`).join('')}</div>
      <button class="submit-price-offer" onclick="submitNpcBuyOffer()">💬 내 희망가 제시</button>
    `}
    <button class="accept-now" onclick="acceptNpcBuyDeal()">현재 가격으로 구매 · ${money(n.npcOffer)}</button>`;
  requestAnimationFrame(()=>{const chat=document.getElementById('negChat');if(chat)chat.scrollTop=chat.scrollHeight})
}

function selectNpcBuyStyle(style){if(!negotiation||negotiation.type!=='npc_buy')return;negotiation.selectedStyle=style;document.querySelectorAll('.npc-tactic').forEach(x=>x.classList.toggle('selected',x.getAttribute('onclick')?.includes(`'${style}'`)))}
function adjustNpcBuyAsk(delta){const el=document.getElementById('npcBuyAsk'),n=negotiation;if(!el||!n)return;const current=Number(el.value);const base=Number.isFinite(current)?current:n.npcOffer;el.value=Math.max(1,Math.round(base+delta))}
function setNpcBuyRecommended(v){const el=document.getElementById('npcBuyAsk');if(el)el.value=v}

function submitNpcBuyOffer(){
  const n=negotiation;if(!n||n.type!=='npc_buy'||n.ended)return;
  const style=n.selectedStyle||'direct';
  const el=document.getElementById('npcBuyAsk');
  const rawAsk=Number(el?.value);if(!Number.isFinite(rawAsk)||rawAsk<1)return toast('희망 구매가를 1원 이상으로 입력하세요.');const ask=Math.round(rawAsk);if(ask>=n.npcOffer)return toast('현재 구매가보다 낮은 가격을 제시하세요.');
  const cfg={
    direct:{risk:.16,power:.34,cost:1,label:'희망 가격을 단도직입적으로 제시했다.'},
    polite:{risk:.08,power:.28,cost:0,label:'예의를 갖춰 가격 조정을 부탁했다.'},
    evidence:{risk:.12,power:.52,cost:1,label:'최근 시세와 거래가를 근거로 제시했다.'},
    defect:{risk:.15,power:.50,cost:1,label:'상태와 흠집을 근거로 감가를 요청했다.'},
    story:{risk:.13,power:.44,cost:1,label:'물건을 아껴 쓸 구매자라는 점을 강조했다.'},
    cash:{risk:.17,power:.58,cost:1,label:'지금 바로 결제하겠다고 약속했다.'},
    walk:{risk:.38,power:.86,cost:2,label:'다른 매물과 비교하고 자리를 뜰 듯 행동했다.'}
  }[style];
  const liked=n.persona.likes.includes(style),disliked=n.persona.dislikes.includes(style);
  const conditionBonus=style==='defect'?(100-n.condition)/150:0;
  const matchBonus=liked?.13:disliked?-.14:0;
  const gap=(n.npcOffer-ask)/Math.max(1,n.npcOffer-n.minPrice);
  const fail=Math.max(.03,Math.min(.92,cfg.risk+Math.max(0,gap-(n.persona.openness+matchBonus))*.72-conditionBonus-(liked?.08:0)+(disliked?.15:0)));
  n.history.push({who:'me',text:`${cfg.label} 내 희망가는 ${money(ask)}.`});
  n.round++;n.patience=Math.max(0,n.patience-cfg.cost);
  if(Math.random()<fail){
    n.patience=Math.max(0,n.patience-1);
    const bounce=disliked&&Math.random()<.45?Math.round((n.asking-n.npcOffer)*.18):0;
    n.npcOffer=Math.min(n.asking,n.npcOffer+bounce);
    n.history.push({who:'npc',text:n.patience<=0?`더는 조정하지 않겠습니다. ${money(n.npcOffer)}이 최종 가격입니다.`:`${n.persona.reject}${bounce?` 오히려 가격을 ${money(n.npcOffer)}로 되돌리겠습니다.`:''}`});
    if(n.patience<=0)n.ended=true;renderNpcBuyNegotiation();return;
  }
  const personalityPower=liked?1.18:disliked?.72:1;
  const cut=Math.max(1,Math.round((n.npcOffer-ask)*cfg.power*personalityPower*(.82+Math.random()*.28)));
  n.npcOffer=Math.max(n.minPrice,n.npcOffer-cut);
  n.history.push({who:'npc',text:`${n.persona.success} ${money(n.npcOffer)}까지 낮추겠습니다.`});
  if(n.npcOffer<=n.minPrice||n.patience<=0)n.ended=true;
  renderNpcBuyNegotiation();
}

async function acceptNpcBuyDeal(){const n=negotiation;if(!n||n.type!=='npc_buy')return;const{data,error}=await db.rpc('purchase_npc_offer_v18',{p_offer_id:n.offerId,p_final_price:Math.round(n.npcOffer)});if(error)return toast(error.message);toast(`구매 완료 ${money(data.final_price)} · ${money(n.asking-data.final_price)} 절약`);playSuccessSound();closeNegotiation();await Promise.all([loadProfile(),loadInventory(),loadNpcOffers()]);updateNetworth()}

/* 소장품/집 */
function switchCollectionTab(name,btn){document.querySelectorAll('.collection-tabs button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.collection-tab-panel').forEach(x=>x.classList.add('hidden'));btn?.classList.add('active');document.getElementById('collection-'+name)?.classList.remove('hidden');}
function updateGachaButtons(){const poor=!profile||Number(profile.cash)<300000;['decorGachaBtn','caseGachaBtn'].forEach(id=>{const b=document.getElementById(id);if(!b)return;b.disabled=poor;b.title=poor?'현금 30만원이 필요합니다.':'';});}
async function drawCollectible(type){if(!profile||Number(profile.cash)<300000){updateGachaButtons();return toast('뽑기에는 현금 30만원이 필요합니다.')}const btn=document.getElementById(type==='phone_case'?'caseGachaBtn':'decorGachaBtn');if(btn?.disabled)return;btn.disabled=true;const modal=document.getElementById('gachaModal');modal.classList.remove('hidden');modal.className='overlay gacha-spinning rarity-0';gachaRarity.textContent='두근두근...';gachaResultIcon.textContent=type==='phone_case'?'📱':'🏺';gachaResultName.textContent='캡슐 개봉 중';gachaResultName.className='';gachaResultEffect.textContent='빛이 강해집니다';playGachaBuild();await wait(1700);const{data,error}=await db.rpc('draw_collectible_v19',{p_type:type});if(error){closeGachaReveal();btn.disabled=false;updateGachaButtons();return toast(error.message)}const rank=rarityScore(data.rarity);modal.className=`overlay gacha-reveal rarity-${rank}`;gachaRarity.textContent=data.rarity;gachaResultIcon.textContent=data.icon||'✨';gachaResultName.textContent=data.name;gachaResultName.className=`rarity-text ${rarityClass(data.rarity)}`;gachaResultEffect.textContent=`${data.effect_name} +${data.effect_percent}%`;rank>=4?playJackpotSound():playSuccessSound();await Promise.all([loadProfile(),loadCollectibles()]);updateNetworth();updateGachaButtons()}
function closeGachaReveal(){gachaModal.className='overlay hidden'}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function loadCollectibles(){
  const{data,error}=await db.from('user_collectibles').select(`id,is_equipped,is_placed,is_listed,collectibles(id,name,type,rarity,effect_code,effect_name,effect_percent,icon)`).eq('user_id',currentUser.id).order('acquired_at',{ascending:false});
  if(error)return toast(error.message);
  collectibles=(data||[]).map(r=>{
    if(r.collectibles?.rarity==='영웅')r.collectibles.rarity='진귀';
    return r;
  });

  const savedCaseId=String(profile?.equipped_phone_case_id||'');
  const equippedRow=collectibles.find(x=>String(x.id)===savedCaseId&&x.collectibles.type==='phone_case')||collectibles.find(x=>x.is_equipped&&x.collectibles.type==='phone_case');
  const equippedGroup=equippedRow?getGroupedCollectibles('phone_case').find(g=>g.rows.some(r=>r.id===equippedRow.id)):getGroupedCollectibles('phone_case').find(g=>g.equippedCount>0);
  const eqEl=document.getElementById('equippedCase');
  if(eqEl)eqEl.innerHTML=equippedGroup?groupedCollectibleRow(equippedGroup,{mode:'equipped'}):'<p class="muted">장착 케이스 없음</p>';

  renderCollectiblePages();
  renderCasePages();
  applyPhoneCase(equippedRow);
  fillCollectibleSelect();
  updateGachaButtons();
}

function getGroupedCollectibles(type=null){
  const source=collectibles.filter(r=>!type||r.collectibles?.type===type);
  const groups=new Map();

  source.forEach(r=>{
    const c=r.collectibles;
    if(!c)return;
    const key=String(c.id||`${c.type}:${c.name}:${c.rarity}:${c.effect_code}:${c.effect_percent}`);
    if(!groups.has(key)){
      groups.set(key,{
        key,
        collectible:c,
        rows:[],
        count:0,
        equippedCount:0,
        placedCount:0,
        listedCount:0
      });
    }
    const group=groups.get(key);
    group.rows.push(r);
    group.count++;
    if(r.is_equipped)group.equippedCount++;
    if(r.is_placed)group.placedCount++;
    if(r.is_listed)group.listedCount++;
  });

  return [...groups.values()];
}

function groupedCollectibleRow(group,options={}){
  const c=group.collectible;
  const rc=rarityClass(c.rarity);
  const isCase=c.type==='phone_case';
  const mode=options.mode||'normal';
  const countBadge=group.count>1?`<span class="collectible-stack" aria-label="${group.count}개 보유">x${group.count}</span>`:'';

  let state='';
  let button='';

  if(isCase){
    if(group.equippedCount>0)state='<em class="collectible-state">장착됨</em>';
    if(mode==='equipped'||group.equippedCount>0){
      button='<button class="btn light" disabled>장착 중</button>';
    }else{
      button=`<button class="btn light" onclick="equipGroupedCollectible('${escAttr(String(c.id))}','equip')">장착</button>`;
    }
  }else{
    if(group.placedCount>0)state=`<em class="collectible-state">배치 ${group.placedCount}/${group.count}</em>`;
    const fullyPlaced=group.placedCount>=group.count;
    const canPlace=group.rows.some(r=>!r.is_placed&&!r.is_listed);
    const canUnplace=group.rows.some(r=>r.is_placed);
    const placeLabel=group.placedCount>0?'추가 배치':'배치';
    button=`<div class="collectible-actions">
      ${canPlace?`<button class="btn light" onclick="equipGroupedCollectible('${escAttr(String(c.id))}','place')">${placeLabel}</button>`:''}
      ${canUnplace?`<button class="btn unplace" onclick="equipGroupedCollectible('${escAttr(String(c.id))}','unplace')">1개 해제</button>`:''}
      ${!canPlace&&!canUnplace?'<button class="btn light" disabled>사용 불가</button>':''}
    </div>`;
  }

  return `<div class="collectible ${rc}">
    <div class="collectible-main">
      <div class="collectible-title-row">
        <span class="collectible-icon">${c.icon}</span>
        <b class="rarity-text ${rc}">${esc(c.name)}</b>
        ${countBadge}
      </div>
      <small><span class="rarity-text ${rc}">${esc(c.rarity)}</span> · ${esc(c.effect_name)} +${c.effect_percent}% ${state}</small>
    </div>
    ${button}
  </div>`;
}

async function equipGroupedCollectible(collectibleId,action){
  const pool=collectibles.filter(r=>String(r.collectibles?.id)===String(collectibleId));
  if(!pool.length)return toast('해당 소장품을 찾을 수 없습니다.');

  let target=null;
  if(action==='equip')target=pool.find(r=>!r.is_equipped&&!r.is_listed)||pool.find(r=>!r.is_equipped)||pool[0];
  else if(action==='place')target=pool.find(r=>!r.is_placed&&!r.is_listed)||pool.find(r=>!r.is_placed)||null;
  else if(action==='unplace')target=pool.find(r=>r.is_placed)||null;

  if(!target)return toast(action==='unplace'?'배치 해제할 소장품이 없습니다.':'사용 가능한 소장품이 없습니다.');
  await equipCollectible(target.id,action==='unplace'?'place':action);
}

function renderCollectiblePages(){
  const list=getGroupedCollectibles('decoration');
  const totalOwned=collectibles.filter(x=>x.collectibles?.type==='decoration').length;
  const pageSize=6;
  const total=Math.max(1,Math.ceil(list.length/pageSize));
  collectiblePage=Math.min(Math.max(1,collectiblePage),total);
  const start=(collectiblePage-1)*pageSize;
  const el=document.getElementById('collectibleInventory');
  if(el)el.innerHTML=list.slice(start,start+pageSize).map(group=>groupedCollectibleRow(group)).join('')||'<p class="muted">소장품 없음</p>';
  const info=document.getElementById('collectiblePageInfo');
  if(info)info.textContent=`${collectiblePage}P / ${total}P · 종류 ${list.length} · 총 ${totalOwned}개`;
  const prev=document.getElementById('collectiblePrev'),next=document.getElementById('collectibleNext');
  if(prev)prev.disabled=collectiblePage<=1;
  if(next)next.disabled=collectiblePage>=total;
}

function changeCollectiblePage(step){
  const total=Math.max(1,Math.ceil(getGroupedCollectibles('decoration').length/6));
  collectiblePage=Math.min(total,Math.max(1,collectiblePage+step));
  renderCollectiblePages();
}

function renderCasePages(){
  const list=getGroupedCollectibles('phone_case');
  const totalOwned=collectibles.filter(x=>x.collectibles?.type==='phone_case').length;
  const pageSize=6;
  const total=Math.max(1,Math.ceil(list.length/pageSize));
  casePage=Math.min(Math.max(1,casePage),total);
  const start=(casePage-1)*pageSize;
  const el=document.getElementById('caseInventory');
  if(el)el.innerHTML=list.slice(start,start+pageSize).map(group=>groupedCollectibleRow(group)).join('')||'<p class="muted">보유 케이스 없음</p>';
  const info=document.getElementById('casePageInfo');
  if(info)info.textContent=`${casePage}P / ${total}P · 종류 ${list.length} · 총 ${totalOwned}개`;
  const prev=document.getElementById('casePrev'),next=document.getElementById('caseNext');
  if(prev)prev.disabled=casePage<=1;
  if(next)next.disabled=casePage>=total;
}

function changeCasePage(step){
  const total=Math.max(1,Math.ceil(getGroupedCollectibles('phone_case').length/6));
  casePage=Math.min(total,Math.max(1,casePage+step));
  renderCasePages();
}

function collectibleRow(r){
  if(!r?.collectibles)return'';
  const c=r.collectibles;
  const group={collectible:c,rows:[r],count:1,equippedCount:r.is_equipped?1:0,placedCount:r.is_placed?1:0,listedCount:r.is_listed?1:0};
  return groupedCollectibleRow(group,{mode:r.is_equipped?'equipped':'normal'});
}

async function equipCollectible(id,action){
  const r=collectibles.find(x=>x.id===id);
  if(!r)return toast('소장품 정보를 찾지 못했습니다.');
  if(action==='place'){
    const placed=collectibles.filter(x=>x.is_placed&&x.collectibles.type==='decoration').length;
    const cap=Number(profile?.house_capacity||1);
    if(!r.is_placed&&placed>=cap)return toast(`현재 집에는 장식 ${cap}개까지만 배치할 수 있습니다.`);
  }
  const{error}=await db.rpc('equip_collectible',{p_user_collectible_id:id,p_action:action});
  if(error)return toast(error.message);
  await loadProfile();
  await loadCollectibles();
  await loadHouse();
  await loadEffects();
}

function applyPhoneCase(eq){
  const shell=document.querySelector('.phone-shell');
  const home=document.querySelector('.phone-home');
  const owner=document.getElementById('phoneOwner');
  if(!shell||!home)return;
  const name=eq?.collectibles?.name||'';
  const rarity=eq?.collectibles?.rarity||'일반';
  shell.dataset.case=name;
  shell.dataset.rarity=String(rarityScore(rarity));
  home.dataset.wallpaper=name;
  home.dataset.rarity=String(rarityScore(rarity));
  if(owner)owner.textContent=profile?.nickname||'판매왕';
}
function fillCollectibleSelect(){
  sellCollectible.innerHTML='<option value="">판매할 소장품</option>';
  collectibles.filter(x=>!x.is_equipped&&!x.is_placed&&!x.is_listed).forEach(x=>{
    const c=x.collectibles;
    const option=new Option(`[${c.rarity}] ${c.name} · ${c.effect_name} +${c.effect_percent}%`,x.id);
    option.dataset.rarity=c.rarity;
    sellCollectible.add(option);
  });
  renderCollectibleSellPreview();
}
function renderCollectibleSellPreview(){
  const host=document.getElementById('collectibleSellPreview');if(!host)return;
  const row=collectibles.find(x=>x.id===sellCollectible.value);
  if(!row){host.className='collectible-sell-preview empty';host.innerHTML='<span>소장품을 선택하면 등급과 효과를 미리 볼 수 있습니다.</span>';return}
  const c=row.collectibles,rc=rarityClass(c.rarity);
  host.className=`collectible-sell-preview ${rc}`;
  host.innerHTML=`<div class="sell-preview-icon">${c.icon}</div><div><b class="rarity-text ${rc}">${esc(c.name)}</b><small><span class="rarity-text ${rc}">${esc(c.rarity)}</span> · ${esc(c.effect_name)} +${c.effect_percent}%</small></div>`;
}
async function createCollectibleListing(){const id=sellCollectible.value,p=Math.floor(Number(collectiblePrice.value));if(!id||p<=0)return toast('소장품과 가격을 확인하세요.');const{error}=await db.rpc('create_collectible_listing',{p_user_collectible_id:id,p_price:p});if(error)return toast(error.message);collectiblePrice.value='';await loadCollectibleMarket()}
async function loadCollectibleMarket(){
  const{data,error}=await db.from('collectible_listings').select(`id,asking_price,seller_user_id,user_collectibles(collectibles(name,rarity,effect_name,effect_percent,icon)),profiles:seller_user_id(nickname)`).eq('status','active').order('created_at',{ascending:false});
  if(error)return toast(error.message);
  collectibleMarketList.innerHTML=(data||[]).map(r=>{
    const c=r.user_collectibles.collectibles,mine=r.seller_user_id===currentUser.id,rc=rarityClass(c.rarity);
    return `<article class="market-card collectible-market-card ${rc}">
      <div class="market-rarity-glow"></div>
      <div class="item-image collectible-market-icon">${c.icon}</div>
      <div class="market-body"><div class="collectible-market-seller">${mine?'내 매물':esc(r.profiles?.nickname||'유저의 매물')}</div><h3 class="rarity-text ${rc}">${esc(c.name)}</h3><div class="meta"><span class="rarity-chip ${rc}">${esc(c.rarity)}</span> · ${esc(c.effect_name)} +${c.effect_percent}%</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?'light':'primary'} full" onclick="${mine?`cancelCollectible('${r.id}')`:`buyCollectible('${r.id}')`}">${mine?'판매 취소':'구매'}</button></div>
    </article>`
  }).join('')||'<div class="panel" style="padding:20px">소장품 매물 없음</div>'
}
async function buyCollectible(id){
  const button=document.querySelector(`[onclick="buyCollectible('${id}')"]`);
  if(button){button.disabled=true;button.textContent='구매 처리 중...';}
  try{
    const{data,error}=await db.rpc('buy_collectible_listing',{p_listing_id:id});
    if(error)throw error;

    toast('구매 완료 '+money(data.final_price)+' · 바로 재판매할 수 있습니다.');
    playSuccessSound();

    // 서버 소유권 이전 직후 클라이언트 목록을 순서대로 다시 불러온다.
    // Promise.all로 동시에 읽으면 캐시/복제 지연 때문에 새 소장품이 판매 선택창에 늦게 나타날 수 있다.
    await loadProfile();
    await refreshCollectiblesAfterPurchase(data.user_collectible_id);
    await loadCollectibleMarket();

    // 현재 소장품 거래 탭을 보고 있다면 판매 선택창을 즉시 갱신한다.
    fillCollectibleSelect();
    const select=document.getElementById('sellCollectible');
    if(select&&data.user_collectible_id){
      const exists=[...select.options].some(o=>o.value===String(data.user_collectible_id));
      if(exists){
        select.value=String(data.user_collectible_id);
        renderCollectibleSellPreview();
      }
    }
    updateNetworth();
  }catch(error){
    toast(error?.message||'소장품 구매에 실패했습니다.');
  }finally{
    if(button){button.disabled=false;button.textContent='구매';}
  }
}

async function refreshCollectiblesAfterPurchase(expectedId){
  // Supabase 트랜잭션 완료 직후 읽기 지연이 생겨도 최대 3회 재확인한다.
  for(let attempt=0;attempt<3;attempt++){
    await loadCollectibles();
    if(!expectedId||collectibles.some(x=>String(x.id)===String(expectedId)))return true;
    await wait(180*(attempt+1));
  }
  return false;
}
async function cancelCollectible(id){const{error}=await db.rpc('cancel_collectible_listing',{p_listing_id:id});if(error)return toast(error.message);await loadCollectibleMarket()}
async function loadEffects(){const{data}=await db.rpc('get_active_effects');effects=data||{}}
async function loadHouse(){await Promise.all([loadProfile(),loadCollectibles(),loadEffects()]);const cap=Number(profile.house_capacity||1),placed=collectibles.filter(x=>x.is_placed&&x.collectibles.type==='decoration').slice(0,cap);houseCapacityText.textContent=`${profile.property_name||'반지하'} · 장식 ${placed.length}/${cap}개 배치`;houseRoom.dataset.property=profile.property_tier||'basement';placedDecorations.innerHTML=placed.map((r,i)=>`<div class="placed slot-${i}">${r.collectibles.icon}</div>`).join('');houseEffects.innerHTML=Object.entries(effects).map(([k,v])=>`<div class="effect"><span>${effectName(k)}</span><b>+${Number(v).toFixed(1)}%</b></div>`).join('')||'<p class="muted">활성 효과 없음</p>';renderDecorationPages()}
function renderDecorationPages(){
  const list=getGroupedCollectibles('decoration');
  const totalOwned=collectibles.filter(x=>x.collectibles?.type==='decoration').length;
  const pageSize=4;
  const total=Math.max(1,Math.ceil(list.length/pageSize));
  decorationPage=Math.min(Math.max(1,decorationPage),total);
  const start=(decorationPage-1)*pageSize;
  decorationInventory.innerHTML=list.slice(start,start+pageSize).map(group=>groupedCollectibleRow(group)).join('')||'<p class="muted">장식 없음</p>';
  const info=document.getElementById('decorationPageInfo');
  if(info)info.textContent=`${decorationPage}P / ${total}P · 종류 ${list.length} · 총 ${totalOwned}개`;
  const prev=document.getElementById('decorationPrev'),next=document.getElementById('decorationNext');
  if(prev)prev.disabled=decorationPage<=1;
  if(next)next.disabled=decorationPage>=total;
}
function changeDecorationPage(step){const total=Math.max(1,Math.ceil(getGroupedCollectibles('decoration').length/4));decorationPage=Math.min(total,Math.max(1,decorationPage+step));renderDecorationPages()}
function effectName(k){return{pawn_bonus:'전당포 판매가',market_bonus:'NPC 제안가',auction_discount:'경매 할인',stock_fee_discount:'주식 수수료',exploration_luck:'탐색 희귀도',gacha_luck:'뽑기 희귀도'}[k]||k}

/* 휴대폰/주식 */
function openPhone(){phoneOverlay.classList.remove("hidden");phoneHome();updatePhoneTime()}function closePhone(){phoneOverlay.classList.add("hidden");if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}}function phoneBackdrop(e){if(e.target.id==="phoneOverlay")closePhone()}function phoneHome(){document.querySelectorAll(".phone-screen").forEach(x=>x.classList.add("hidden"));document.getElementById("phoneHome").classList.remove("hidden");closeStockDetail()}function openPhoneApp(name){document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));const screen=document.getElementById('phone-'+name);if(!screen)return;screen.classList.remove('hidden');if(name==='stocks')refreshStocks();else if(name==='wallet')renderWallet();else if(name==='ranking')loadRanking();else if(name==='property')loadProperties();else if(name==='titles')loadTitles();else if(name==='chat')loadChatMessages();else if(name==='skills')loadNegotiationSkills()}
async function loadNegotiationSkills(){
  if(!profile)await loadProfile();
  const host=document.getElementById('skillTreeList');if(!host)return;
  const points=Number(profile.skill_points||0);
  const rows=Object.entries(HAGGLE_SKILLS).map(([code,s])=>{const owned=hasHaggleSkill(code),reqOk=!s.requires||hasHaggleSkill(s.requires);return `<article class="skill-node ${owned?'owned':''} ${reqOk?'':'blocked'}"><div class="skill-icon">${s.icon}</div><div><h3>${s.name}</h3><p>${s.desc}</p><small>${s.requires?`선행: ${HAGGLE_SKILLS[s.requires].name}`:'기본 단계'} · 비용 ${s.cost}P</small></div><button ${owned||!reqOk||points<s.cost?'disabled':''} onclick="learnNegotiationSkill('${code}')">${owned?'습득 완료':!reqOk?'선행 필요':points<s.cost?'포인트 부족':'습득'}</button></article>`}).join('');
  host.innerHTML=`<div class="skill-point-card"><span>보유 스킬 포인트</span><b>${points}P</b><small>명성 50을 얻을 때마다 1포인트가 지급됩니다.</small></div><div class="skill-tree">${rows}</div>`;
}
async function learnNegotiationSkill(code){const{data,error}=await db.rpc('learn_negotiation_skill_v15',{p_skill:code});if(error)return toast(error.message);toast('협상 스킬을 습득했습니다.');await loadProfile();loadNegotiationSkills()}
function updatePhoneTime(){phoneTime.textContent=new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}
async function updateStocks(){
  const{data,error}=await db.rpc("update_global_stock_market_v26");
  if(error){console.warn("주식 시세 갱신 실패",error.message);return null;}
  return data;
}
function startGlobalStockTicker(){
  if(stockTickerTimer)clearInterval(stockTickerTimer);
  stockTickerTimer=setInterval(async()=>{
    if(document.hidden||!currentUser)return;
    const result=await updateStocks();
    if(result?.updated)await loadStocks();
  },15000);
}
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden&&currentUser)updateStocks().then(result=>{if(result?.updated)loadStocks()});
});
async function refreshStocks(){await updateStocks();await loadStocks()}
async function loadStocks(){const[{data:s},{data:h}]=await Promise.all([db.from("stocks").select("id,symbol,name,current_price,previous_price,history").eq("is_active",true).order("name"),db.from("stock_holdings").select("*").eq("user_id",currentUser.id)]);stocks=s||[];holdings=h||[];renderSpendableFundsCard('stockSpendableFunds',spendableCash(),'주식 매수에 즉시 사용할 수 있는 금액');let total=0,profit=0;stockList.innerHTML=stocks.map(st=>{const hd=holdings.find(x=>x.stock_id===st.id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),prev=Number(st.previous_price),r=prev?(cur-prev)/prev*100:0,val=q*cur,p=val-q*avg;total+=val;profit+=p;return `<button class="stock-row" onclick="openStockDetail('${st.id}')"><div class="stock-name"><b>${esc(st.name)}</b><small>${esc(st.symbol)} · ${q}주</small></div><div class="stock-price"><b>${money(cur)}</b><small>현재가</small></div>${stockSvg(history(st.history,prev,cur),95,40,true)}<b class="stock-rate ${r>=0?"up":"down"}">${r>=0?"+":""}${r.toFixed(2)}%</b></button>`}).join("");stockValue.textContent=money(total);stockProfit.textContent=(profit>=0?"+":"")+money(profit);stockProfit.className=profit>=0?"up":"down";if(selectedStock)renderStockDetail(selectedStock);renderWallet()}
function openStockDetail(id){selectedStock=id;stockListView.classList.add("hidden");stockDetailView.classList.remove("hidden");renderStockDetail(id)}function closeStockDetail(){selectedStock=null;stockListView?.classList.remove("hidden");stockDetailView?.classList.add("hidden")}
function renderStockDetail(id){const st=stocks.find(x=>x.id===id),hd=holdings.find(x=>x.stock_id===id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),hist=history(st.history,st.previous_price,cur),val=q*cur,p=val-q*avg,cash=spendableCash(),maxBuy=cur>0?Math.floor(cash/cur):0;stockDetail.innerHTML=`<div class="detail-spendable"><span>실제 사용 가능 현금</span><b>${money(cash)}</b><small>현재가 기준 최대 ${maxBuy.toLocaleString('ko-KR')}주 매수 가능</small></div><div class="stock-detail-head"><h2>${esc(st.name)}</h2><strong>${money(cur)}</strong><small>현재가</small></div>${stockSvg(hist,340,220,false)}<div class="metrics"><div>보유 <b>${q}주</b></div><div>평균 <b>${q?money(avg):"-"}</b></div><div>평가액 <b>${money(val)}</b></div><div>손익 <b class="${p>=0?"up":"down"}">${p>=0?"+":""}${money(p)}</b></div></div><div class="trade"><input id="qty-${id}" type="number" min="1" value="1"><button class="buy" onclick="tradeStock('${id}','buy')">매수</button><button class="sell" onclick="tradeStock('${id}','sell')">매도</button></div>`}
async function tradeStock(id,type){const q=Number(document.getElementById("qty-"+id).value);const{error}=await db.rpc(type==="buy"?"buy_stock_v2":"sell_stock_v2",{p_stock_id:id,p_quantity:q});if(error)return toast(error.message);await Promise.all([loadProfile(),loadStocks()])}
function history(raw,prev,cur){
  let a=[];
  if(Array.isArray(raw)) a=raw;
  else try{a=JSON.parse(raw||"[]")}catch{}

  a=a.map(Number).filter(Number.isFinite);
  prev=Number(prev);
  cur=Number(cur);

  // 마지막 구간은 반드시 서버의 이전가 → 현재가가 되도록 고정한다.
  // 이 값이 목록에 표시되는 변동률과 정확히 같은 기준이다.
  while(a.length&&Math.abs(a.at(-1)-cur)<0.000001) a.pop();
  if(!a.length||Math.abs(a.at(-1)-prev)>=0.000001) a.push(prev);
  a.push(cur);

  if(a.length<3) a.unshift(prev);
  return a.slice(-32);
}

function stockSvg(a,w,h,small){
  const p=small?3:12;
  const prev=Number(a.at(-2)??a[0]??0);
  const cur=Number(a.at(-1)??prev);
  const up=cur>=prev;
  const c=up?"up":"down";

  // 자동 확대를 과도하게 하지 않고, ±3.5% 기준 축을 확보해
  // 0.2%와 3%의 움직임이 실제 크기 차이대로 보이게 한다.
  const expectedMove=Math.max(Math.abs(prev)*0.035,1);
  const dataMin=Math.min(...a,prev-expectedMove);
  const dataMax=Math.max(...a,prev+expectedMove);
  const range=Math.max(dataMax-dataMin,1);
  const x=i=>p+i/Math.max(a.length-1,1)*(w-2*p);
  const y=v=>h-p-(v-dataMin)/range*(h-2*p);
  const pts=a.map((v,i)=>`${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const baselineY=y(prev).toFixed(1);
  const lastX1=x(Math.max(0,a.length-2)).toFixed(1);
  const lastY1=y(prev).toFixed(1);
  const lastX2=x(a.length-1).toFixed(1);
  const lastY2=y(cur).toFixed(1);

  return `<svg class="${small?"sparkline":"detail-chart"}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="이전가 대비 현재 변동 그래프">
    <line x1="${p}" y1="${baselineY}" x2="${w-p}" y2="${baselineY}" class="stock-baseline"></line>
    <polygon points="${p},${baselineY} ${pts} ${w-p},${baselineY}" class="fill-${c}"></polygon>
    <polyline points="${pts}" class="line-${c} stock-history-line"></polyline>
    <line x1="${lastX1}" y1="${lastY1}" x2="${lastX2}" y2="${lastY2}" class="stock-last-move line-${c}"></line>
    <circle cx="${lastX2}" cy="${lastY2}" r="${small?2.6:4}" class="stock-last-dot dot-${c}"></circle>
  </svg>`;
}
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
function spendableCash(){return Math.max(0,Number(profile?.cash||0))}
function renderSpendableFundsCard(id,amount,subtitle='지금 바로 사용할 수 있는 현금'){
  const el=document.getElementById(id);if(!el)return;
  el.innerHTML=`<span>실제 사용 가능 현금</span><b>${money(amount)}</b><small>${esc(subtitle)}</small>`;
}
function esc(v){const d=document.createElement("div");d.textContent=v??"";return d.innerHTML}
function escAttr(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]||m))}
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

function subscribe(){
  if(realtime)return;
  realtime=db.channel("selling-god-v34")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"stocks"},loadStocks)
    .on("postgres_changes",{event:"*",schema:"public",table:"market_listings"},loadMarket)
    .on("postgres_changes",{event:"*",schema:"public",table:"collectible_listings"},loadCollectibleMarket)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"global_chat_messages"},handleRealtimeChatInsert)
    .subscribe();
}

let chatNoticeSequence=0;
async function handleRealtimeChatInsert(payload){
  const row=payload?.new||{};
  if(!document.getElementById("phone-chat")?.classList.contains("hidden")) loadChatMessages();
  if(!row.id || !currentUser || row.user_id===currentUser.id) return;

  let sender=null;
  try{
    const {data,error}=await db.rpc('get_global_chat_message_v34',{p_message_id:row.id});
    if(!error) sender=Array.isArray(data)?data[0]:data;
  }catch(error){
    console.warn('채팅 알림 발신자 조회 실패:',error);
  }

  showChatNotification({
    nickname:sender?.nickname||'새 메시지',
    active_title:sender?.active_title||'초보 장사꾼',
    chat_text:sender?.chat_text||row.message||'',
    created_at:sender?.created_at||row.created_at
  });
}

function showChatNotification(message){
  const stack=document.getElementById('chatNotificationStack');
  if(!stack)return;

  const notice=document.createElement('button');
  const id=++chatNoticeSequence;
  notice.type='button';
  notice.className='chat-phone-notice';
  notice.dataset.noticeId=String(id);
  notice.innerHTML=`
    <span class="chat-phone-notice-icon">💬</span>
    <span class="chat-phone-notice-copy">
      <span class="chat-phone-notice-head">
        <strong>${esc(message.nickname||'새 메시지')}</strong>
        <em class="title-badge ${titleClass(message.active_title)}">${esc(message.active_title||'초보 장사꾼')}</em>
      </span>
      <span class="chat-phone-notice-text">${esc(message.chat_text||'')}</span>
    </span>
    <span class="chat-phone-notice-time">지금</span>`;

  notice.addEventListener('click',()=>{
    notice.classList.add('leaving');
    setTimeout(()=>notice.remove(),180);
    openPhone();
    openPhoneApp('chat');
  });

  stack.prepend(notice);
  while(stack.children.length>3) stack.lastElementChild?.remove();
  requestAnimationFrame(()=>notice.classList.add('show'));
  playUiTone(784,.035);
  setTimeout(()=>playUiTone(1047,.025),90);
  setTimeout(()=>{
    if(!notice.isConnected)return;
    notice.classList.add('leaving');
    setTimeout(()=>notice.remove(),260);
  },5200);
}



const TITLE_RARITIES={
  '일반':0,'희귀':1,'초희귀':2,'진귀':3,'보물':4,'유물':5,'고대 유물':6
};
const TITLE_FALLBACKS={
  '초보 장사꾼':'일반','알바 새싹':'일반','떠오르는 판매왕':'희귀','믿음직한 거래인':'희귀','성실한 일꾼':'희귀',
  '첫 사장님':'일반','초보 경영자':'희귀','황금손 상인':'초희귀','백만장자':'초희귀','집 꾸미기 장인':'초희귀','연쇄 창업가':'초희귀','다점포 사장':'초희귀',
  '전설의 협상가':'진귀','경매의 지배자':'진귀','도시의 부동산왕':'진귀','지역 기업가':'진귀','브랜드 메이커':'진귀',
  '억만장자':'보물','명성의 화신':'보물','신용의 상징':'보물','중견기업 회장':'보물','산업 다각화의 귀재':'보물','고수익 경영자':'보물',
  '재계의 거물':'유물','대저택의 주인':'유물','일의 신':'유물','글로벌 CEO':'유물','재벌 총수':'유물','혁신의 아이콘':'유물',
  '기업 제국':'고대 유물','산업의 지배자':'고대 유물','세계 경제의 설계자':'고대 유물','판매의 신':'고대 유물','무한의 상인':'고대 유물'
};
function titleRarity(title){return TITLE_FALLBACKS[title]||'일반'}
function titleClass(title){return `title-rarity-${TITLE_RARITIES[titleRarity(title)]||0}`}
function titleByProgress(p){const n=Number(p?.reputation||0),cash=Number(p?.cash||0);if(cash>=5000000000&&n>=2000)return '판매의 신';if(cash>=1000000000)return '재계의 거물';if(cash>=100000000)return '억만장자';if(n>=500)return '전설의 협상가';if(n>=250)return '황금손 상인';if(n>=100)return '떠오르는 판매왕';return '초보 장사꾼'}
function applyTitleBadge(el,title,rarity=null){if(!el)return;el.textContent=title||'초보 장사꾼';el.classList.remove(...[0,1,2,3,4,5,6].map(i=>`title-rarity-${i}`));el.classList.add(`title-badge`,rarity?`title-rarity-${TITLE_RARITIES[rarity]||0}`:titleClass(title))}
async function loadRanking(){
  const{data,error}=await db.rpc('get_leaderboard_v21');
  if(error)return rankingList.innerHTML=`<p>${esc(error.message)}</p>`;
  rankingList.innerHTML=(data||[]).map((r,i)=>`<div class="rank-row ${r.user_id===currentUser.id?'me':''}"><b>${i+1}</b><span><strong>${esc(r.nickname)}</strong><small class="title-badge ${titleClass(r.active_title)}">${esc(r.active_title||'초보 장사꾼')}</small></span><em>${money(r.networth)}</em></div>`).join('');
}
async function loadTitles(){
  const{data,error}=await db.rpc('get_title_catalog_v21');
  if(error)return titleList.innerHTML=`<p>${esc(error.message)}</p>`;
  titleList.innerHTML=(data||[]).map(t=>`<div class="title-card ${t.unlocked?'unlocked':'locked'} title-card-rarity-${TITLE_RARITIES[t.rarity]||0}"><span class="title-medal">${esc(t.icon||'🎖️')}</span><div><b class="title-badge title-rarity-${TITLE_RARITIES[t.rarity]||0}">${esc(t.title_name)}</b><small>${esc(t.rarity)} · ${esc(t.condition_text)}</small></div><button ${t.unlocked?'':'disabled'} onclick="equipTitle('${escAttr(t.title_name)}')">${profile?.active_title===t.title_name?'사용 중':'장착'}</button></div>`).join('');
}
async function equipTitle(n){
  const{error}=await db.rpc('equip_title_v21',{p_title:n});
  if(error)return toast(error.message);
  profile.active_title=n;
  applyTitleBadge(document.getElementById('titleTop'),n);
  loadTitles();
  toast(`칭호 장착: ${n}`);
}

function chatTime(v){const d=new Date(v);return d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}
async function loadChatMessages(){
  const host=document.getElementById('globalChatList');
  if(!host)return;
  const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:60});
  if(error){host.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}
  host.innerHTML=(data||[]).map(r=>`<article class="global-chat-message ${r.sender_user_id===currentUser.id?'mine':''}"><div class="chat-user"><strong>${esc(r.nickname)}</strong><span class="title-badge ${titleClass(r.active_title)}">${esc(r.active_title||'초보 장사꾼')}</span><time>${chatTime(r.created_at)}</time></div><p>${esc(r.chat_text)}</p></article>`).join('')||'<p class="muted chat-empty">첫 메시지를 남겨 보세요.</p>';
  requestAnimationFrame(()=>{host.scrollTop=host.scrollHeight});
}
function handleChatKey(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChatMessage()}}
async function sendChatMessage(){
  if(chatBusy)return;
  const input=document.getElementById('globalChatInput'),btn=document.getElementById('globalChatSend');
  const text=(input?.value||'').trim();
  if(!text)return toast('메시지를 입력하세요.');
  if(text.length>120)return toast('채팅은 120자까지 입력할 수 있습니다.');
  chatBusy=true;if(btn)btn.disabled=true;
  const{error}=await db.rpc('send_global_chat_v31',{p_message:text});
  chatBusy=false;if(btn)btn.disabled=false;
  if(error)return toast(error.message);
  input.value='';
  await loadChatMessages();
}
function playSuccessSound(){playUiTone(880,.08);setTimeout(()=>playUiTone(1175,.08),90);setTimeout(()=>playUiTone(1568,.09),180)}
function playJackpotSound(){[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>playUiTone(f,.11),i*90))}
function playGachaBuild(){[220,277,330,392,466].forEach((f,i)=>setTimeout(()=>playUiTone(f,.04),i*260))}

document.addEventListener('pointerdown',e=>{if(e.target.closest('button,.clickable,[onclick]'))playUiTone(420,.025)},{passive:true});


/* ============================================================
   v25 BANK / PROPERTY / SAVE / REPUTATION UPDATE
============================================================ */
let bankState=null;

async function loadProfile(){
  const{data,error}=await db.rpc('get_player_profile_v24');
  if(error){toast('저장 데이터를 불러오지 못했습니다: '+error.message);return null}
  profile=Array.isArray(data)?data[0]:data;
  if(!profile){toast('저장 데이터가 없습니다.');return null}
  renderTradeDashboard();
  const map={nicknameTop:profile.nickname,nicknameHero:profile.nickname,phoneOwner:profile.nickname,cashTop:money(profile.cash),credit:profile.credit_score,reputation:profile.reputation};
  Object.entries(map).forEach(([id,v])=>{const el=document.getElementById(id);if(el)el.textContent=v});
  updateGachaButtons();
  const t=document.getElementById('titleTop');if(t)applyTitleBadge(t,profile.active_title||titleByProgress(profile));
  return profile;
}

async function manualSave(){
  const btn=document.getElementById('manualSaveBtn'),txt=document.getElementById('saveStateText');
  if(btn)btn.disabled=true;if(txt)txt.textContent='저장 확인 중';
  const{data,error}=await db.rpc('manual_save_v25');
  if(error){if(txt)txt.textContent='저장 실패';if(btn)btn.disabled=false;return toast('저장 확인 실패: '+error.message)}
  await refreshAll();
  if(txt)txt.textContent='저장 완료';
  toast('모든 자산과 진행 상황이 서버에 저장되어 있습니다.');
  setTimeout(()=>{if(txt)txt.textContent='자동 저장'},2200);
  if(btn)btn.disabled=false;
}

const PROPERTY_CATALOG=[
  {tier:'basement',name:'반지하',icon:'🪟',price:0,capacity:1,desc:'기본 주거지 · 장식 1개'},
  {tier:'studio',name:'원룸',icon:'🛏️',price:2000000,capacity:3,desc:'작지만 아늑한 첫 집'},
  {tier:'apartment',name:'아파트',icon:'🏢',price:12000000,capacity:6,desc:'본격적인 수집가의 공간'},
  {tier:'penthouse',name:'펜트하우스',icon:'🌆',price:80000000,capacity:10,desc:'도시 전망과 넉넉한 전시 공간'},
  {tier:'mansion',name:'대저택',icon:'🏰',price:300000000,capacity:16,desc:'최고급 장식 전시를 위한 대형 저택'}
];
async function loadProperties(){
  if(!profile)await loadProfile();
  const host=document.getElementById('propertyList');if(!host)return;
  const cap=Number(profile?.house_capacity||1),cash=spendableCash();
  host.innerHTML=`<div class="spendable-funds-card property-funds"><span>부동산 구매 가능 현금</span><b>${money(cash)}</b><small>구매 버튼을 누르면 이 현금에서 즉시 차감됩니다.</small></div><div class="property-current"><span>현재 거주지</span><b>${esc(profile?.property_name||'반지하')}</b><small>장식 슬롯 ${cap}개</small></div><div class="property-grid">${PROPERTY_CATALOG.map(x=>{const owned=cap>=x.capacity,current=cap===x.capacity,locked=cash<x.price,after=Math.max(0,cash-x.price),shortage=Math.max(0,x.price-cash);return `<article class="property-card ${current?'current':''}"><div class="property-art">${x.icon}</div><div><small>${x.tier.toUpperCase()}</small><h3>${x.name}</h3><p>${x.desc}</p><strong>${x.price?money(x.price):'기본 제공'}</strong>${!owned&&x.price?`<em class="property-afford ${locked?'short':''}">${locked?`부족 ${money(shortage)}`:`구매 후 ${money(after)} 남음`}</em>`:''}</div><button ${owned||locked?'disabled':''} onclick="buyProperty('${x.tier}')">${current?'거주 중':owned?'구매 완료':locked?'자금 부족':'구매'}</button></article>`}).join('')}</div>`;
}
async function buyProperty(tier){
  const{data,error}=await db.rpc('buy_property_v13',{p_tier:tier});
  if(error)return toast(error.message);
  toast(`${data.property_name} 구매 완료 · 장식 ${data.capacity}개 배치 가능`);playSuccessSound();
  await Promise.all([loadProfile(),loadProperties(),loadHouse()]);updateNetworth();
}

function formatRemaining(seconds){seconds=Math.max(0,Math.floor(Number(seconds)||0));const m=Math.floor(seconds/60),s=seconds%60;return `${m}:${String(s).padStart(2,'0')}`}
function bankInput(id){const n=Math.floor(Number(document.getElementById(id)?.value||0));return Number.isFinite(n)?n:0}
async function loadBank(){
  const host=document.getElementById('bankView');if(!host)return;
  host.innerHTML='<div class="bank-loading">이자와 대출 상태를 정산하는 중...</div>';
  const{data,error}=await db.rpc('get_bank_status_v25');
  if(error){host.innerHTML=`<div class="bank-error">${esc(error.message)}</div>`;return}
  bankState=data||{};await loadProfile();renderBank();updateNetworth();
}
function renderBank(){
  const host=document.getElementById('bankView');if(!host||!bankState)return;
  const b=bankState,loan=b.loan||null;
  host.innerHTML=`
    <div class="bank-hero"><div><span>판매은행 총 금융자산</span><b>${money(Number(b.deposit_balance||0)+Number(b.savings_balance||0))}</b></div><small>30분 단위 이자는 서버 시간으로 계산되며 로그아웃해도 유지됩니다.</small></div>
    <section class="bank-product deposit"><div class="bank-product-head"><span>💳</span><div><h3>자유 예금</h3><p>한도 없이 30분마다 복리 0.2%</p></div><b>${money(b.deposit_balance||0)}</b></div><div class="bank-actions"><input id="depositAmount" type="number" min="1" placeholder="금액"><button onclick="bankDeposit()">입금</button><button class="sub" onclick="bankWithdrawDeposit()">출금</button></div><small>다음 이자까지 약 ${formatRemaining(b.deposit_next_seconds)} 남음</small></section>
    <section class="bank-product savings"><div class="bank-product-head"><span>📈</span><div><h3>목표 적금</h3><p>30분마다 5% · 설정한 목표액에서 성장 종료</p></div><b>${money(b.savings_balance||0)}</b></div><div class="savings-progress"><i style="width:${Math.min(100,Number(b.savings_target||0)>0?Number(b.savings_balance||0)/Number(b.savings_target)*100:0)}%"></i></div><div class="bank-target">목표 ${money(b.savings_target||0)} · 다음 이자 ${formatRemaining(b.savings_next_seconds)}</div><div class="bank-actions savings-inputs"><input id="savingsAmount" type="number" min="1" placeholder="넣을 금액"><input id="savingsTarget" type="number" min="1" placeholder="목표 금액"><button onclick="bankSavingsDeposit()">적금 넣기</button><button class="sub" onclick="bankWithdrawSavings()">해지/출금</button></div></section>
    <section class="bank-product loan"><div class="bank-product-head"><span>🏦</span><div><h3>신용 대출</h3><p>15분 만기 · 이자 1% · 최소 5분 후 상환</p></div><b>한도 ${money(b.loan_limit||0)}</b></div>${loan?`<div class="loan-active"><div><span>상환액</span><b>${money(loan.due_amount)}</b></div><div><span>상환 가능</span><b>${loan.repay_available? '지금 가능':formatRemaining(loan.repay_available_seconds)}</b></div><div><span>만기까지</span><b class="${loan.overdue?'down':''}">${loan.overdue?'연체 '+formatRemaining(loan.overdue_seconds):formatRemaining(loan.due_seconds)}</b></div></div><button class="bank-repay" ${loan.repay_available?'':'disabled'} onclick="repayLoan()">전액 상환</button><small>${loan.overdue?'연체 신용 패널티가 적용됩니다.':'빠르게 상환할수록 신용 상승 폭이 커집니다.'}</small>`:`<div class="bank-actions"><input id="loanAmount" type="number" min="10000" step="10000" placeholder="대출 금액"><button onclick="takeLoan()">대출 실행</button></div><small>대출 직후 상환으로 신용을 복사하지 못하도록 5분간 상환이 잠깁니다.</small>`}</section>`;
}
async function bankCall(fn,args={},success='처리 완료'){const{data,error}=await db.rpc(fn,args);if(error)return toast(error.message);toast(success);playSuccessSound();await loadBank();return data}
async function bankDeposit(){const n=bankInput('depositAmount');if(n<=0)return toast('입금 금액을 입력하세요.');await bankCall('bank_deposit_v25',{p_amount:n},'예금 입금 완료')}
async function bankWithdrawDeposit(){const n=bankInput('depositAmount');if(n<=0)return toast('출금 금액을 입력하세요.');await bankCall('bank_withdraw_deposit_v25',{p_amount:n},'예금 출금 완료')}
async function bankSavingsDeposit(){const amount=bankInput('savingsAmount'),target=bankInput('savingsTarget');if(amount<=0||target<=0)return toast('넣을 금액과 목표 금액을 입력하세요.');await bankCall('bank_savings_deposit_v25',{p_amount:amount,p_target:target},'적금 입금 완료')}
async function bankWithdrawSavings(){if(!confirm('적금을 해지하고 현재 적립액 전부를 현금으로 받을까요?'))return;await bankCall('bank_withdraw_savings_v25',{},'적금 출금 완료')}
async function takeLoan(){const n=bankInput('loanAmount');if(n<=0)return toast('대출 금액을 입력하세요.');await bankCall('bank_take_loan_v25',{p_amount:n},'대출금이 지급되었습니다.')}
async function repayLoan(){if(!confirm('이자 1%를 포함한 대출금을 전액 상환할까요?'))return;const data=await bankCall('bank_repay_loan_v25',{},'대출 상환 완료');if(data?.credit_delta)toast(`대출 상환 완료 · 신용 ${data.credit_delta>0?'+':''}${data.credit_delta}`)}

function openPhoneApp(name){document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));const screen=document.getElementById('phone-'+name);if(!screen)return;screen.classList.remove('hidden');if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}if(name==='stocks')refreshStocks();else if(name==='wallet')renderWallet();else if(name==='ranking')loadRanking();else if(name==='property')loadProperties();else if(name==='bank')loadBank();else if(name==='titles')loadTitles();else if(name==='chat'){loadChatMessages();chatRefreshTimer=setInterval(()=>{if(!document.getElementById('phone-chat')?.classList.contains('hidden'))loadChatMessages()},5000)}else if(name==='skills')loadNegotiationSkills()}

function reputationToast(data,prefix='거래 완료'){
  if(!data)return toast(prefix);
  const label=data.reputation_label||'거래 완료',delta=Number(data.reputation_delta||0);
  toast(`${prefix} · ${label} · 명성 ${delta>=0?'+':''}${delta}`);
}
async function pawnSell(id,mode,pct){const{data,error}=await db.rpc('sell_item_to_pawnshop',{p_user_item_id:id,p_mode:mode,p_offer_percent:pct});if(error)return toast(error.message);reputationToast(data,'판매 '+money(data.final_price));await Promise.all([loadProfile(),loadPawnshop(),loadInventory()]);updateNetworth()}
async function finishSellerAuctionAfterCountdown(){const s=sellerAuction;if(!s||s.ending)return;s.ending=true;const{data,error}=await db.rpc('finish_npc_seller_auction_v13',{p_session_id:s.session,p_final_price:s.current});if(error){s.ending=false;return toast(error.message)}reputationToast(data,'경매 판매 '+money(data.final_price));playSuccessSound();clearInterval(s.timer);sellerAuction=null;await Promise.all([loadProfile(),loadInventory()]);fillAuctionSellItems();sellerAuctionHall.innerHTML='<div class="auction-finished">3초 동안 추가 입찰이 없어 판매가 확정되었습니다.</div>'}
async function acceptNpcBuyDeal(){const n=negotiation;if(!n||n.type!=='npc_buy')return;const{data,error}=await db.rpc('purchase_npc_offer_v18',{p_offer_id:n.offerId,p_final_price:Math.round(n.npcOffer)});if(error)return toast(error.message);reputationToast(data,`구매 ${money(data.final_price)} · ${money(n.asking-data.final_price)} 절약`);playSuccessSound();closeNegotiation();await Promise.all([loadProfile(),loadInventory(),loadNpcOffers()]);updateNetworth()}

/* =========================================================
   v27: 인내심 기반 거래 평가 및 명성 변동 표시
========================================================= */
function patienceTradeGrade(remaining,max){
  const r=Number(remaining),m=Number(max);
  if(!Number.isFinite(r)||!Number.isFinite(m)||m<=0)return{label:'거래 완료',delta:2,ratio:.5,cls:'trade-grade-normal'};
  const ratio=Math.max(0,Math.min(1,r/m));
  if(ratio>=.8)return{label:'완벽한 거래',delta:12,ratio,cls:'trade-grade-perfect'};
  if(ratio>=.55)return{label:'만족스러운 거래',delta:7,ratio,cls:'trade-grade-good'};
  if(ratio>=.3)return{label:'거래 완료',delta:3,ratio,cls:'trade-grade-normal'};
  if(ratio>0)return{label:'애매한 거래',delta:-2,ratio,cls:'trade-grade-awkward'};
  return{label:'최악의 거래',delta:-12,ratio:0,cls:'trade-grade-worst'};
}

function injectPatienceTradePreview(){
  const n=negotiation;
  if(!n)return;
  const host=document.querySelector('#negotiationContent .haggle-bars');
  if(!host||host.parentElement.querySelector('.patience-trade-preview'))return;
  const g=patienceTradeGrade(n.patience,n.maxPatience);
  const sign=g.delta>0?'+':'';
  const box=document.createElement('div');
  box.className=`patience-trade-preview ${g.cls}`;
  box.innerHTML=`<span>현재 거래 예상 평가</span><b>${g.label}</b><em>명성 ${sign}${g.delta}</em><small>남은 인내심에 따라 최종 평가가 결정됩니다.</small>`;
  host.insertAdjacentElement('afterend',box);
}

const renderNegotiationV26=renderNegotiation;
renderNegotiation=function(){renderNegotiationV26();injectPatienceTradePreview();};
const renderNpcBuyNegotiationV26=renderNpcBuyNegotiation;
renderNpcBuyNegotiation=function(){renderNpcBuyNegotiationV26();injectPatienceTradePreview();};

function reputationToast(data,prefix='거래 완료'){
  if(!data)return toast(prefix);
  const label=data.reputation_label||'거래 완료';
  const delta=Number(data.reputation_delta||0);
  const before=Number(data.reputation_before);
  const after=Number(data.reputation_after);
  const sign=delta>0?'+':'';
  const change=delta===0?'변동 없음':`${sign}${delta}`;
  const range=Number.isFinite(before)&&Number.isFinite(after)?` (${before} → ${after})`:'';
  toast(`${prefix} · ${label} · 명성 ${change}${range}`);
}

async function pawnSell(id,mode,pct,patienceRemaining=null,patienceMax=null){
  const rpc=mode==='negotiated'?'sell_item_to_pawnshop_v27':'sell_item_to_pawnshop_v27';
  const params={
    p_user_item_id:id,
    p_mode:mode,
    p_offer_percent:pct,
    p_patience_remaining:patienceRemaining,
    p_patience_max:patienceMax
  };
  const{data,error}=await db.rpc(rpc,params);
  if(error)return toast(error.message);
  reputationToast(data,'판매 '+money(data.final_price));
  await Promise.all([loadProfile(),loadPawnshop(),loadInventory()]);
  updateNetworth();
}

async function acceptNpcCounter(){
  const n=negotiation;if(!n)return;
  const final=Math.round(n.npcOffer),profit=negotiationProfit(n,final);
  if(n.type==='pawn'){
    await pawnSell(n.id,'negotiated',Math.round(final/n.base*100),n.patience,n.maxPatience);
  }else{
    const{data,error}=await db.rpc('accept_npc_market_offer_v27',{
      p_offer_id:n.offerId,
      p_final_price:final,
      p_patience_remaining:n.patience,
      p_patience_max:n.maxPatience
    });
    if(error)return toast(error.message);
    reputationToast(data,'판매 '+money(data.final_price));
    await Promise.all([loadProfile(),loadNpcOffers(),loadInventory()]);
  }
  saveTradeLedger({title:n.title,base:n.base,final,profit,rounds:n.round-1,persona:n.persona?.name||'NPC'});
  closeNegotiation();
}

async function acceptNpcBuyDeal(){
  const n=negotiation;if(!n||n.type!=='npc_buy')return;
  const{data,error}=await db.rpc('purchase_npc_offer_v27',{
    p_offer_id:n.offerId,
    p_final_price:Math.round(n.npcOffer),
    p_patience_remaining:n.patience,
    p_patience_max:n.maxPatience
  });
  if(error)return toast(error.message);
  reputationToast(data,`구매 ${money(data.final_price)} · ${money(n.asking-data.final_price)} 절약`);
  playSuccessSound();
  closeNegotiation();
  await Promise.all([loadProfile(),loadInventory(),loadNpcOffers()]);
  updateNetworth();
}


/* ============================================================
   v28 INITIAL PROFILE / STOCK COUNTDOWN / NETWORTH RANKING FIX
============================================================ */
let stockNextUpdateAt=null;
let stockCountdownTimer=null;

function setStockNextUpdate(value){
  if(!value)return;
  const d=new Date(value);
  if(!Number.isNaN(d.getTime()))stockNextUpdateAt=d;
  renderStockCountdown();
}

function renderStockCountdown(){
  const el=document.getElementById('stockNextUpdate');
  if(!el)return;
  if(!stockNextUpdateAt){el.textContent='시세 확인 중';return;}
  const seconds=Math.max(0,Math.ceil((stockNextUpdateAt.getTime()-Date.now())/1000));
  const min=Math.floor(seconds/60);
  const sec=seconds%60;
  el.textContent=seconds<=0?'곧 변동':`${min}분 ${String(sec).padStart(2,'0')}초 후`;
}

function startStockCountdown(){
  if(stockCountdownTimer)clearInterval(stockCountdownTimer);
  renderStockCountdown();
  stockCountdownTimer=setInterval(renderStockCountdown,1000);
}

async function updateStocks(){
  const{data,error}=await db.rpc('update_global_stock_market_v26');
  if(error){console.warn('주식 시세 갱신 실패',error.message);return null;}
  if(data?.next_update)setStockNextUpdate(data.next_update);
  return data;
}

async function syncStockClock(){
  const{data,error}=await db.from('stock_market_state').select('last_updated').eq('id',1).maybeSingle();
  if(error||!data?.last_updated)return;
  setStockNextUpdate(new Date(new Date(data.last_updated).getTime()+180000).toISOString());
}

async function enterGame(){
  const{error:saveError}=await db.rpc('ensure_player_save');
  if(saveError){toast('저장 데이터 확인 실패: '+saveError.message);showAuth();return;}
  const { error: skillSyncError } = await db.rpc('sync_skill_points_v15');
  if(skillSyncError) console.warn('스킬 포인트 동기화 실패:', skillSyncError.message);
  await loadProfile();
  if(!profile){showAuth();return;}
  showGame();
  await Promise.all([loadInventory(),loadStocks(),loadCollectibles(),loadEffects(),syncStockClock()]);
  await updateStocks();
  updateNetworth();
  subscribe();
  startGlobalStockTicker();
  startStockCountdown();
  setTimeout(hideBootScreen,280);
}

async function refreshAll(){
  await loadProfile();
  if(!profile)return;
  await Promise.all([loadInventory(),loadStocks(),loadCollectibles(),loadEffects(),syncStockClock()]);
  await updateStocks();
  updateNetworth();
}

async function loadRanking(){
  const{data,error}=await db.rpc('get_leaderboard_v28');
  if(error)return rankingList.innerHTML=`<p>${esc(error.message)}</p>`;
  rankingList.innerHTML=(data||[]).map((r,i)=>`<div class="rank-row ${r.user_id===currentUser.id?'me':''}"><b>${i+1}</b><span><strong>${esc(r.nickname)}</strong><small class="title-badge ${titleClass(r.active_title)}">${esc(r.active_title||'초보 장사꾼')}</small></span><em>${money(r.networth)}</em></div>`).join('');
}

const __v28Logout=logout;
logout=async function(){
  if(stockCountdownTimer){clearInterval(stockCountdownTimer);stockCountdownTimer=null;}
  stockNextUpdateAt=null;
  return __v28Logout();
};

/* ============================================================
   v29 NEGOTIATION CONTROL HOTFIX
   - inline onclick 의존 제거
   - 이벤트 위임으로 전당포/NPC 중고 흥정 버튼 안정화
   - 클릭 즉시 화면 피드백 및 오류 표시
============================================================ */
let negotiationControlBound=false;
let negotiationActionBusy=false;

function installNegotiationControls(){
  const host=document.getElementById('negotiationContent');
  if(!host||host.dataset.controlsBound==='1')return;
  host.dataset.controlsBound='1';
  host.addEventListener('click',async(e)=>{
    const btn=e.target.closest('[data-neg-action]');
    if(!btn||!host.contains(btn))return;
    e.preventDefault();
    if(negotiationActionBusy||btn.disabled)return;
    const action=btn.dataset.negAction;
    const value=btn.dataset.value;
    try{
      if(action==='pawn-style'){
        submitNegotiationOfferSafe(value);
      }else if(action==='pawn-adjust'){
        adjustHaggleAsk(Number(value||0));
      }else if(action==='pawn-recommend'){
        setRecommendedHaggle(Number(value||0));
      }else if(action==='pawn-accept'){
        negotiationActionBusy=true;setNegotiationButtonsDisabled(true);
        await acceptNpcCounterSafe();
      }else if(action==='npc-style'){
        selectNpcBuyStyle(value);
        renderNpcBuyNegotiationSafe('전략을 선택했습니다. 희망가를 입력한 뒤 제시하세요.','info');
      }else if(action==='npc-adjust'){
        adjustNpcBuyAsk(Number(value||0));
      }else if(action==='npc-recommend'){
        setNpcBuyRecommended(Number(value||0));
      }else if(action==='npc-submit'){
        submitNpcBuyOfferSafe();
      }else if(action==='npc-accept'){
        negotiationActionBusy=true;setNegotiationButtonsDisabled(true);
        await acceptNpcBuyDeal();
      }
    }catch(err){
      console.error('Negotiation action failed:',err);
      negotiationFeedback(`흥정 처리 중 오류: ${err?.message||err}`,'error');
      toast(`흥정 처리 중 오류: ${err?.message||err}`);
    }finally{
      negotiationActionBusy=false;
      setNegotiationButtonsDisabled(false);
    }
  });
  host.addEventListener('keydown',(e)=>{
    if(e.key!=='Enter')return;
    if(e.target?.id==='npcBuyAsk'){
      e.preventDefault();
      submitNpcBuyOfferSafe();
    }else if(e.target?.id==='haggleAsk'){
      e.preventDefault();
      submitNegotiationOfferSafe('polite');
    }
  });
}
function setNegotiationButtonsDisabled(disabled){
  document.querySelectorAll('#negotiationContent [data-neg-action]').forEach(b=>b.disabled=disabled);
}

function negotiationFeedback(message,type='info'){
  const host=document.getElementById('negotiationFeedback');
  if(!host)return;
  host.className=`negotiation-feedback ${type}`;
  host.textContent=message;
}

function submitNegotiationOfferSafe(style){
  const n=negotiation;
  if(!n||n.type!=='pawn'||n.ended)return;
  const el=document.getElementById('haggleAsk');
  const raw=Number(el?.value);
  if(!Number.isFinite(raw))return negotiationFeedback('희망 판매가를 숫자로 입력하세요.','error');
  const ask=Math.max(n.npcOffer+1,Math.round(raw));
  if(el)el.value=ask;
  const configs={
    polite:{risk:.05,power:.34,cost:0,label:'예의를 갖춰 조금 더 좋은 가격을 부탁했다.'},
    evidence:{risk:.10,power:.58,cost:0,label:'최근 거래 시세와 상태 자료를 근거로 제시했다.'},
    story:{risk:.20,power:.74,cost:1,label:'물건의 희소성과 사연을 설득력 있게 설명했다.'},
    cash:{risk:.16,power:.67,cost:1,label:'지금 바로 현금으로 거래하겠다는 조건을 제시했다.'},
    silence:{risk:.24,power:.82,cost:1,label:'대답하지 않고 조용히 상대의 다음 제안을 기다렸다.'},
    walkaway:{risk:.48,power:1,cost:2,label:'다른 구매자에게 팔겠다며 협상 결렬을 압박했다.'}
  };
  const cfg=configs[style]||configs.polite;
  if(style!=='polite'){
    const need={evidence:'market_data',story:'storytelling',cash:'quick_deal',silence:'silence_pressure',walkaway:'walkaway'}[style];
    if(need&&!hasHaggleSkill(need))return negotiationFeedback('해당 협상 스킬을 먼저 해금해야 합니다.','error');
  }
  const maxPatience=Math.max(1,Number(n.maxPatience||n.persona?.patience||1));
  n.maxPatience=maxPatience;
  const target=style==='silence'?Math.round(n.npcOffer+Math.max(1000,(n.limit-n.npcOffer)*(.22+Math.random()*.18))):ask;
  const softBudget=Math.max(n.npcOffer+1,Number(n.limit||n.market||n.npcOffer));
  const gap=(target-n.npcOffer)/Math.max(1,softBudget-n.npcOffer);
  const overBudget=Math.max(0,target-softBudget)/Math.max(1,softBudget);
  const difficulty=Math.max(0,gap-Number(n.persona?.openness||.5));
  const fail=Math.min(.97,cfg.risk+difficulty*.62+overBudget*1.85+Number(n.persona?.pressure||.2)*(style==='walkaway'?.25:.05));
  n.history.push({who:'me',text:`${cfg.label}${style==='silence'?'':` 희망 가격은 ${money(target)}.`}`});
  n.round+=1;
  n.patience=Math.max(0,Number(n.patience||0)-cfg.cost);
  if(Math.random()<fail){
    n.mood='bad';
    n.patience=Math.max(0,n.patience-1);
    const cut=style==='walkaway'&&Math.random()<.4?Math.round((n.npcOffer-n.base)*.22):0;
    n.npcOffer=Math.max(n.base,n.npcOffer-cut);
    n.history.push({who:'npc',text:n.patience<=0?`이제 끝내지. ${money(n.npcOffer)}이 마지막 제안이야.`:`그 방법은 통하지 않아. ${cut?'내 제안을 오히려 낮추겠네.':'좀 더 현실적인 이야기를 하게.'}`});
    if(n.patience<=0)n.ended=true;
    renderNegotiationSafe('제안이 거절되었습니다.','error');
    return;
  }
  const resistance=1/(1+Math.max(0,target-n.limit)/Math.max(1,n.limit)*2.8);
  const gain=Math.max(1,Math.round((target-n.npcOffer)*cfg.power*resistance*(.82+Math.random()*.28)));
  n.npcOffer=n.npcOffer+gain;
  n.mood='good';
  n.history.push({who:'npc',text:`좋아. ${money(n.npcOffer)}까지 올리지. ${n.patience<=1?'이게 거의 마지막 양보야.':'다음 제안도 들어보겠네.'}`});
  if(n.patience<=0)n.ended=true;
  renderNegotiationSafe(`제안 성공! 현재 제안이 ${money(n.npcOffer)}로 올랐습니다.`,'success');
}

function submitNpcBuyOfferSafe(){
  const n=negotiation;
  if(!n||n.type!=='npc_buy'||n.ended)return;
  const style=n.selectedStyle||'direct';
  const el=document.getElementById('npcBuyAsk');
  const raw=Number(el?.value);
  if(!Number.isFinite(raw))return negotiationFeedback('희망 구매가를 숫자로 입력하세요.','error');
  const ask=Math.max(1,Math.round(raw));
  if(ask>=n.npcOffer)return negotiationFeedback(`현재 구매가 ${money(n.npcOffer)}보다 낮은 금액을 제시하세요.`,'error');
  if(el)el.value=ask;
  const cfg={
    direct:{risk:.16,power:.34,cost:1,label:'희망 가격을 단도직입적으로 제시했다.'},
    polite:{risk:.08,power:.28,cost:0,label:'예의를 갖춰 가격 조정을 부탁했다.'},
    evidence:{risk:.12,power:.52,cost:1,label:'최근 시세와 거래가를 근거로 제시했다.'},
    defect:{risk:.15,power:.50,cost:1,label:'상태와 흠집을 근거로 감가를 요청했다.'},
    story:{risk:.13,power:.44,cost:1,label:'물건을 아껴 쓸 구매자라는 점을 강조했다.'},
    cash:{risk:.17,power:.58,cost:1,label:'지금 바로 결제하겠다고 약속했다.'},
    walk:{risk:.38,power:.86,cost:2,label:'다른 매물과 비교하고 자리를 뜰 듯 행동했다.'}
  }[style];
  const liked=n.persona.likes.includes(style),disliked=n.persona.dislikes.includes(style);
  const conditionBonus=style==='defect'?(100-n.condition)/150:0;
  const matchBonus=liked?.13:disliked?-.14:0;
  const gap=(n.npcOffer-ask)/Math.max(1,n.npcOffer-n.minPrice);
  const fail=Math.max(.03,Math.min(.92,cfg.risk+Math.max(0,gap-(n.persona.openness+matchBonus))*.72-conditionBonus-(liked?.08:0)+(disliked?.15:0)));
  n.history.push({who:'me',text:`${cfg.label} 내 희망가는 ${money(ask)}.`});
  n.round+=1;
  n.patience=Math.max(0,Number(n.patience||0)-cfg.cost);
  if(Math.random()<fail){
    n.patience=Math.max(0,n.patience-1);
    const bounce=disliked&&Math.random()<.45?Math.round((n.asking-n.npcOffer)*.18):0;
    n.npcOffer=Math.min(n.asking,n.npcOffer+bounce);
    n.history.push({who:'npc',text:n.patience<=0?`더는 조정하지 않겠습니다. ${money(n.npcOffer)}이 최종 가격입니다.`:`${n.persona.reject}${bounce?` 오히려 가격을 ${money(n.npcOffer)}로 되돌리겠습니다.`:''}`});
    if(n.patience<=0)n.ended=true;
    renderNpcBuyNegotiationSafe('판매자가 제안을 거절했습니다.','error');
    return;
  }
  const personalityPower=liked?1.18:disliked?.72:1;
  const cut=Math.max(1,Math.round((n.npcOffer-ask)*cfg.power*personalityPower*(.82+Math.random()*.28)));
  n.npcOffer=Math.max(n.minPrice,n.npcOffer-cut);
  n.history.push({who:'npc',text:`${n.persona.success} ${money(n.npcOffer)}까지 낮추겠습니다.`});
  if(n.npcOffer<=n.minPrice||n.patience<=0)n.ended=true;
  renderNpcBuyNegotiationSafe(`흥정 성공! 현재 구매가가 ${money(n.npcOffer)}로 내려갔습니다.`,'success');
}

function scrollNegotiationToLatest(){
  requestAnimationFrame(()=>{
    const chat=document.getElementById('negChat');
    if(chat)chat.scrollTop=chat.scrollHeight;
    const content=document.getElementById('negotiationContent');
    if(content&&content.scrollTop<0)content.scrollTop=0;
  });
}

function renderNegotiationSafe(feedback='',feedbackType='info'){
  const n=negotiation;
  if(!n||n.type!=='pawn')return;
  installNegotiationControls();
  negotiationModal.classList.remove('hidden');
  const profit=negotiationProfit(n),profitPct=n.base?profit/n.base*100:0;
  const ceiling=Math.max(1,n.limit-n.base),progress=Math.max(0,Math.min(100,(n.npcOffer-n.base)/ceiling*100));
  const maxPatience=Math.max(1,Number(n.maxPatience||n.persona?.patience||1));n.maxPatience=maxPatience;
  const patiencePct=Math.max(0,Math.min(100,Number(n.patience||0)/maxPatience*100));
  const recommended=Math.round(Math.max(n.npcOffer+1000,n.npcOffer*1.05,n.market*.98));
  const history=n.history.map(x=>`<div class="chat ${x.who}"><b>${x.who==='npc'?esc(n.persona.name):'나'}</b><span>${esc(x.text)}</span></div>`).join('');
  const actions=[
    {code:'polite',icon:'🤝',name:'정중한 재제안',desc:'기본 기술 · 안전하지만 상승폭이 작음',free:true},
    {code:'evidence',skill:'market_data',icon:'📊',name:'시세 자료 제시',desc:'안전형 · 인내심 소모가 적음'},
    {code:'story',skill:'storytelling',icon:'✨',name:'가치와 사연 강조',desc:'균형형 · 성공 시 큰 폭 상승'},
    {code:'cash',skill:'quick_deal',icon:'💵',name:'지금 바로 현금 거래',desc:'빠른 계약을 조건으로 가격 인상'},
    {code:'silence',skill:'silence_pressure',icon:'🤐',name:'침묵하며 기다리기',desc:'가격을 말하지 않고 NPC 재제안 유도'},
    {code:'walkaway',skill:'walkaway',icon:'🚪',name:'다른 곳에 팔겠다고 압박',desc:'최고위험 · 성공 시 가장 큰 인상'}
  ];
  const actionHtml=actions.map(a=>{const unlocked=a.free||hasHaggleSkill(a.skill);return `<button type="button" class="haggle-skill-btn ${unlocked?'':'locked'}" ${unlocked?`data-neg-action="pawn-style" data-value="${a.code}"`:`onclick="openSkillTreeFromNegotiation()"`}><b>${a.icon} ${a.name}</b><small>${unlocked?a.desc:`🔒 ${HAGGLE_SKILLS[a.skill]?.name||''} 해금 필요`}</small></button>`}).join('');
  negotiationContent.innerHTML=`
    <div class="haggle-top"><div><p class="eyebrow">LIVE NEGOTIATION · ROUND ${n.round}</p><h2>${esc(n.title)}</h2></div><div class="dealer-profile"><strong>${n.persona.icon} ${n.persona.name}</strong><small>${n.persona.line}</small></div></div>
    <div class="deal-summary deluxe"><div><span>즉시 판매 기준</span><b>${money(n.base)}</b></div><div><span>참고 시세</span><b>${money(n.market)}</b></div><div class="offer-main"><span>현재 제안</span><b>${money(n.npcOffer)}</b></div><div class="profit-main"><span>확정 추가이익</span><b class="${profit>=0?'up':'down'}">${profit>=0?'+':''}${money(profit)}</b><small>${profitPct>=0?'+':''}${profitPct.toFixed(1)}%</small></div></div>
    <div class="haggle-bars"><label>NPC 인내심 <i><em style="width:${patiencePct}%"></em></i></label><label>흥정 성과 <i><em style="width:${progress}%"></em></i></label></div>
    <div id="negotiationFeedback" class="negotiation-feedback ${feedbackType}">${esc(feedback||'희망가를 조절한 뒤 흥정 방식을 선택하세요.')}</div>
    <div id="negChat" class="neg-chat">${history}</div>
    ${n.ended?`<div class="final-offer"><b>최종 제안</b><strong>${money(n.npcOffer)}</strong><button type="button" data-neg-action="pawn-accept">이 가격에 계약</button></div>`:`
      <div class="manual-offer advanced"><div class="offer-copy"><label>내 희망 판매가</label><small>추천 ${money(recommended)} · 희망가는 자유롭게 입력 가능</small></div><div class="offer-controls"><button type="button" data-neg-action="pawn-adjust" data-value="-10000">-1만</button><button type="button" data-neg-action="pawn-adjust" data-value="-1000">-1천</button><input id="haggleAsk" type="number" min="${n.npcOffer+1}" step="1000" value="${recommended}"><button type="button" data-neg-action="pawn-adjust" data-value="1000">+1천</button><button type="button" data-neg-action="pawn-adjust" data-value="10000">+1만</button><button type="button" class="recommend" data-neg-action="pawn-recommend" data-value="${recommended}">추천가</button></div></div>
      <div class="haggle-actions skill-grid">${actionHtml}</div>`}
    <button type="button" class="accept-now" data-neg-action="pawn-accept">현재 제안 확정 · 순이익 ${profit>=0?'+':''}${money(profit)}</button>`;
  injectPatienceTradePreview();
  scrollNegotiationToLatest();
}

function renderNpcBuyNegotiationSafe(feedback='',feedbackType='info'){
  const n=negotiation;if(!n||n.type!=='npc_buy')return;
  installNegotiationControls();
  negotiationModal.classList.remove('hidden');applyNpcCharacter(n.persona);
  const discount=n.asking-n.npcOffer,discountPct=n.asking?discount/n.asking*100:0;
  const recommended=Math.max(n.minPrice,Math.round(n.npcOffer-(n.npcOffer-n.minPrice)*.45));
  const maxPatience=Math.max(1,Number(n.maxPatience||n.persona?.patience||1));n.maxPatience=maxPatience;
  const patiencePct=Math.max(0,Math.min(100,Number(n.patience||0)/maxPatience*100));
  const history=n.history.map(x=>`<div class="chat ${x.who}"><b>${x.who==='npc'?esc(n.persona.name):'나'}</b><span>${esc(x.text)}</span></div>`).join('');
  const tactics=[['direct','💬','희망가만 제시','기본 제안'],['polite','🤝','정중하게 요청','친절한 판매자에게 효과적'],['evidence','📊','시세 근거 제시','계산적인 판매자에게 효과적'],['defect','🔎','상태 흠집 지적','상태가 낮을수록 효과적'],['story','✨','좋은 구매자 강조','감성적인 판매자에게 효과적'],['cash','💵','즉시 결제 약속','급한 판매자에게 효과적'],['walk','🚶','다른 매물 비교','고위험 전략']];
  negotiationContent.innerHTML=`
    <div class="haggle-top"><div><p class="eyebrow">SECONDHAND NEGOTIATION · ROUND ${n.round}</p><h2>${esc(n.title)}</h2></div><div class="dealer-profile npc-profile-${n.persona.theme}"><strong>${n.persona.face} ${esc(n.persona.name)}</strong><small>${esc(n.persona.role)} · ${esc(n.persona.temperament)}</small><em>${esc(n.persona.preview)}</em></div></div>
    <div class="deal-summary deluxe buy-mode"><div><span>최초 판매가</span><b>${money(n.asking)}</b></div><div><span>판매자 마지노선</span><b>${money(n.minPrice)}</b></div><div class="offer-main"><span>현재 구매가</span><b>${money(n.npcOffer)}</b></div><div class="profit-main"><span>현재 절약액</span><b class="up">-${money(discount)}</b><small>${discountPct.toFixed(1)}% 할인</small></div></div>
    <div class="haggle-bars"><label>판매자 인내심 <i><em style="width:${patiencePct}%"></em></i></label><label>할인 진행 <i><em style="width:${Math.min(100,discount/Math.max(1,n.asking-n.minPrice)*100)}%"></em></i></label></div>
    <div id="negotiationFeedback" class="negotiation-feedback ${feedbackType}">${esc(feedback||'전략과 희망가를 선택한 뒤 제시 버튼을 누르세요.')}</div>
    <div id="negChat" class="neg-chat">${history}</div>
    ${n.ended?`<div class="final-offer"><b>최종 판매가</b><strong>${money(n.npcOffer)}</strong><button type="button" data-neg-action="npc-accept">이 가격에 구매</button></div>`:`
      <div class="manual-offer advanced npc-offer-box"><div class="offer-copy"><label>내 희망 구매가</label><small>1원부터 자유롭게 입력 가능 · 추천 ${money(recommended)}</small></div><div class="offer-controls"><button type="button" data-neg-action="npc-adjust" data-value="-10000">-1만</button><button type="button" data-neg-action="npc-adjust" data-value="-1000">-1천</button><input id="npcBuyAsk" type="number" min="1" step="1000" inputmode="numeric" value="${recommended}" aria-label="내 희망 구매가"><button type="button" data-neg-action="npc-adjust" data-value="1000">+1천</button><button type="button" data-neg-action="npc-adjust" data-value="10000">+1만</button><button type="button" class="recommend" data-neg-action="npc-recommend" data-value="${recommended}">추천가</button></div></div>
      <div class="npc-tactic-grid">${tactics.map(([code,icon,title,desc])=>`<button type="button" class="npc-tactic ${n.selectedStyle===code?'selected':''}" data-neg-action="npc-style" data-value="${code}"><b>${icon} ${title}</b><small>${desc}</small></button>`).join('')}</div>
      <button type="button" class="submit-price-offer" data-neg-action="npc-submit">💬 내 희망가 제시</button>`}
    <button type="button" class="accept-now" data-neg-action="npc-accept">현재 가격으로 구매 · ${money(n.npcOffer)}</button>`;
  injectPatienceTradePreview();
  scrollNegotiationToLatest();
}

async function acceptNpcCounterSafe(){
  const n=negotiation;if(!n)return;
  const final=Math.round(n.npcOffer),profit=negotiationProfit(n,final);
  if(n.type==='pawn'){
    const {data,error}=await db.rpc('sell_item_to_pawnshop_v27',{p_user_item_id:n.id,p_mode:'negotiated',p_offer_percent:Math.round(final/n.base*100),p_patience_remaining:n.patience,p_patience_max:n.maxPatience});
    if(error){negotiationFeedback(error.message,'error');return;}
    reputationToast(data,'판매 '+money(data.final_price));
    saveTradeLedger({title:n.title,base:n.base,final,profit,rounds:n.round-1,persona:n.persona?.name||'NPC'});
    closeNegotiation();
    await Promise.all([loadProfile(),loadPawnshop(),loadInventory()]);updateNetworth();
  }
}

const startPawnNegotiationV28=startPawnNegotiation;
startPawnNegotiation=function(id){startPawnNegotiationV28(id);renderNegotiationSafe();};
const startNpcOfferV28=startNpcOffer;
startNpcOffer=async function(id){await startNpcOfferV28(id);renderNpcBuyNegotiationSafe();};
renderNegotiation=renderNegotiationSafe;
renderNpcBuyNegotiation=renderNpcBuyNegotiationSafe;

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installNegotiationControls,{once:true});else installNegotiationControls();

/* ============================================================
   v33 BUSINESS DIRECTOR EDITION
   - 포트폴리오 대시보드 / 회사별 손익 분석 / 운영 전략
   - 전체 수익 수령 / 투자 회수기간 / 활동 기록
============================================================ */
let businessState=null,businessRefreshTimer=null,businessTab='overview';

const BUSINESS_STRATEGIES={
  balanced:{name:'균형 운영',icon:'⚖️',desc:'매출과 비용을 안정적으로 유지',gross:1,cost:1},
  growth:{name:'공격 성장',icon:'🚀',desc:'매출을 크게 늘리지만 운영비도 상승',gross:1.16,cost:1.13},
  efficiency:{name:'효율 경영',icon:'🧮',desc:'매출은 조금 낮지만 비용을 크게 절감',gross:.98,cost:.78},
  premium:{name:'프리미엄',icon:'💎',desc:'고급 상품과 서비스로 고수익을 노림',gross:1.24,cost:1.20}
};

function businessUpgradeCost(c,kind){
  const base=Number(c.buy_price||0);
  if(kind==='facility')return Math.round(base*(0.18+Number(c.facility_level||1)*0.12));
  if(kind==='staff')return Math.round(base*(0.10+(Number(c.staff_level||0)+1)*0.08));
  return Math.round(base*(0.14+(Number(c.product_level||0)+1)*0.11));
}
function businessRank(c){
  const score=Number(c.facility_level||1)+Number(c.staff_level||0)+Number(c.product_level||0);
  if(score>=27)return '초거대 기업';
  if(score>=23)return '글로벌 기업';
  if(score>=18)return '대기업';
  if(score>=12)return '중견기업';
  if(score>=7)return '지역 기업';
  return '동네 회사';
}
function businessRankProgress(c){
  const score=Number(c.facility_level||1)+Number(c.staff_level||0)+Number(c.product_level||0);
  const steps=[{n:'동네 회사',min:1,max:7},{n:'지역 기업',min:7,max:12},{n:'중견기업',min:12,max:18},{n:'대기업',min:18,max:23},{n:'글로벌 기업',min:23,max:27},{n:'초거대 기업',min:27,max:30}];
  const cur=steps.find(x=>score<x.max)||steps.at(-1);
  const pct=cur.max===cur.min?100:Math.max(0,Math.min(100,(score-cur.min)/(cur.max-cur.min)*100));
  const next=steps[steps.indexOf(cur)+1]?.n||'최고 등급';
  return{score,pct,next};
}
function businessCountdown(sec){sec=Math.max(0,Number(sec||0));const m=Math.floor(sec/60),ss=sec%60;return `${m}:${String(ss).padStart(2,'0')}`}
function businessDuration(ticks){
  if(!Number.isFinite(ticks)||ticks<=0)return '계산 불가';
  const mins=Math.ceil(ticks)*5;
  if(mins<60)return `약 ${mins}분`;
  const hours=Math.floor(mins/60),rest=mins%60;
  if(hours<24)return `약 ${hours}시간${rest?` ${rest}분`:''}`;
  return `약 ${(hours/24).toFixed(1)}일`;
}
function businessStrategy(c){return BUSINESS_STRATEGIES[c.strategy]||BUSINESS_STRATEGIES.balanced}
function estimateCompany(c,patch={}){
  const facility=Number(patch.facility_level??c.facility_level??1);
  const staff=Number(patch.staff_level??c.staff_level??0);
  const product=Number(patch.product_level??c.product_level??0);
  const rep=Number(patch.company_reputation??c.company_reputation??50);
  const strategy=BUSINESS_STRATEGIES[patch.strategy??c.strategy]||BUSINESS_STRATEGIES.balanced;
  const gross=Number(c.base_income||0)*(1+(facility-1)*.34)*(1+staff*.20)*(1+product*.29)*(.72+rep/180)*strategy.gross;
  const cost=Number(c.base_cost||0)*(1+(facility-1)*.13+staff*.17+product*.10)*strategy.cost;
  return{gross:Math.round(gross),cost:Math.round(cost),net:Math.round(Math.max(0,gross-cost)),margin:gross>0?Math.max(0,(gross-cost)/gross*100):0};
}
function projectedUpgrade(c,kind){
  const patch={};patch[`${kind}_level`]=Number(c[`${kind}_level`]||0)+1;
  const cur=estimateCompany(c),next=estimateCompany(c,patch),cost=businessUpgradeCost(c,kind),delta=Math.max(0,next.net-cur.net);
  return{cost,delta,payback:delta>0?cost/delta:Infinity,next};
}
function formatBusinessTime(value){
  if(!value)return '';
  const d=new Date(value);if(Number.isNaN(d.getTime()))return '';
  return d.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
}

async function loadBusiness({silent=false}={}){
  const host=document.getElementById('businessView');if(!host)return;
  if(!silent)host.innerHTML='<div class="business-loading"><span class="business-spinner"></span><b>기업 장부 정산 중</b><small>오프라인 운영 기록과 5분 정산을 서버에서 확인하고 있습니다.</small></div>';
  const{data,error}=await db.rpc('get_business_status_v33');
  if(error){host.innerHTML=`<div class="business-error"><b>사업 데이터를 불러오지 못했습니다.</b><p>${esc(error.message)}</p><small>v33 Supabase SQL 전체 실행 여부를 확인하세요.</small><button onclick="loadBusiness()">다시 시도</button></div>`;return}
  businessState=data||{};
  renderBusiness();
  if(!silent){await loadProfile();updateNetworth()}
  clearInterval(businessRefreshTimer);
  businessRefreshTimer=setInterval(()=>{
    if(document.getElementById('phone-business')?.classList.contains('hidden'))return;
    let reachedZero=false;
    document.querySelectorAll('[data-business-countdown]').forEach(el=>{
      const n=Math.max(0,Number(el.dataset.businessCountdown||0)-1);
      el.dataset.businessCountdown=n;el.textContent=businessCountdown(n);if(n===0)reachedZero=true;
    });
    if(reachedZero){clearInterval(businessRefreshTimer);loadBusiness({silent:true})}
  },1000);
}

function switchBusinessTab(tab){businessTab=tab;renderBusiness()}
function renderBusiness(){
  const host=document.getElementById('businessView');if(!host||!businessState)return;
  const catalog=businessState.catalog||[],owned=catalog.filter(c=>c.owned),available=catalog.filter(c=>!c.owned),p=businessState.portfolio||{};
  const tabs=[['overview','대시보드'],['companies','내 회사'],['acquire','회사 인수']];
  host.innerHTML=`
    <section class="business-command-center">
      <div class="business-command-copy"><span>BUSINESS DIRECTOR</span><h2>기업 경영 본부</h2><p>5분 단위 자동 정산 · 오프라인 수익 최대 8시간</p></div>
      <div class="business-command-value"><small>기업 제국 가치</small><b>${money(p.total_company_value||businessState.total_company_value||0)}</b><em>${Number(p.owned_count||businessState.owned_count||0)}개 회사 운영</em></div>
    </section>
    <nav class="business-tabs">${tabs.map(([k,v])=>`<button class="${businessTab===k?'active':''}" onclick="switchBusinessTab('${k}')">${v}</button>`).join('')}</nav>
    <div class="business-tab-body">${businessTab==='overview'?renderBusinessOverview(owned,p):businessTab==='companies'?renderBusinessCompanies(owned):renderBusinessAcquisition(available)}</div>`;
}
function renderBusinessOverview(owned,p){
  const totalCash=Number(p.total_company_cash||0),net=Number(p.total_net_per_tick||0),gross=Number(p.total_gross_per_tick||0),cost=Number(p.total_cost_per_tick||0),margin=gross?Math.max(0,(gross-cost)/gross*100):0,avgRep=Number(p.average_reputation||0);
  const recommendation=businessAdvisor(owned);
  return `
    <div class="business-kpi-grid">
      <div><span>회사 금고 합계</span><b>${money(totalCash)}</b><small>수령 가능한 사업 수익</small></div>
      <div><span>5분 순이익</span><b class="up">+${money(net)}</b><small>매출 ${money(gross)} · 비용 ${money(cost)}</small></div>
      <div><span>평균 평판</span><b>${avgRep.toFixed(1)}</b><small>100점 기준</small></div>
      <div><span>영업이익률</span><b>${margin.toFixed(1)}%</b><small>포트폴리오 전체</small></div>
    </div>
    <button class="business-collect-all" ${totalCash<=0?'disabled':''} onclick="collectAllBusinessCash()"><span>💰</span><div><b>전체 회사 수익 받기</b><small>${money(totalCash)}를 현금으로 이동</small></div></button>
    <section class="business-advisor"><div class="advisor-avatar">🧑‍💼</div><div><span>경영 고문 보고서</span><b>${esc(recommendation.title)}</b><p>${esc(recommendation.text)}</p></div></section>
    <div class="business-mini-company-grid">${owned.map(renderBusinessMiniCard).join('')||'<div class="business-empty">회사를 인수하면 포트폴리오 분석이 시작됩니다.</div>'}</div>
    <section class="business-activity"><div class="business-section-head"><h3>최근 경영 기록</h3><span>서버 저장</span></div>${renderBusinessActivity()}</section>`;
}
function businessAdvisor(owned){
  if(!owned.length)return{title:'첫 회사를 인수하세요',text:'동네 편의점은 낮은 조건과 안정적인 수익으로 사업 시스템을 익히기에 가장 좋습니다.'};
  const weak=[...owned].sort((a,b)=>Number(a.estimated_net_per_tick||0)-Number(b.estimated_net_per_tick||0))[0];
  if(Number(weak.company_reputation||0)<55)return{title:`${weak.custom_name||weak.name} 평판 관리 필요`,text:'회사 평판이 낮으면 매출 배율이 크게 줄어듭니다. 시설보다 상품 개발이나 안정적인 운영 전략을 우선 고려하세요.'};
  const options=owned.flatMap(c=>['facility','staff','product'].filter(k=>Number(c[`${k}_level`]||0)<10).map(k=>({c,k,...projectedUpgrade(c,k)}))).filter(x=>x.delta>0).sort((a,b)=>a.payback-b.payback);
  if(options[0]){const labels={facility:'시설',staff:'직원',product:'상품'};return{title:`${options[0].c.custom_name||options[0].c.name} ${labels[options[0].k]} 투자 추천`,text:`예상 순익이 5분당 ${money(options[0].delta)} 증가하며 투자금 회수까지 ${businessDuration(options[0].payback)}가 예상됩니다.`}}
  return{title:'기업 제국 완성 단계',text:'모든 핵심 투자가 완료되었습니다. 회사 금고 수령과 고급 회사 인수 조건 달성에 집중하세요.'};
}
function renderBusinessMiniCard(c){
  const rp=businessRankProgress(c),strategy=businessStrategy(c);
  return `<button class="business-mini-card theme-${esc(c.theme)}" onclick="businessTab='companies';renderBusiness();setTimeout(()=>document.getElementById('company-${c.company_id}')?.scrollIntoView({behavior:'smooth',block:'start'}),50)"><span>${c.icon}</span><div><small>${businessRank(c)} · ${strategy.icon} ${strategy.name}</small><b>${esc(c.custom_name||c.name)}</b><em>5분 +${money(c.estimated_net_per_tick||0)}</em><i><u style="width:${rp.pct}%"></u></i></div></button>`;
}
function renderBusinessActivity(){
  const rows=businessState.recent_activity||[];
  return rows.map(r=>`<div class="business-activity-row"><span>${r.icon||'📌'}</span><div><b>${esc(r.title||'경영 기록')}</b><small>${esc(r.company_name||'포트폴리오')} · ${formatBusinessTime(r.created_at)}</small><p>${esc(r.detail||'')}</p></div>${Number(r.amount||0)!==0?`<em class="${Number(r.amount)>0?'up':'down'}">${Number(r.amount)>0?'+':''}${money(r.amount)}</em>`:''}</div>`).join('')||'<div class="business-empty compact">아직 기록된 경영 활동이 없습니다.</div>';
}
function renderBusinessCompanies(owned){return `<div class="owned-company-list director">${owned.map(renderOwnedCompany).join('')||'<div class="business-empty">보유한 회사가 없습니다. 회사 인수 탭에서 첫 회사를 선택하세요.</div>'}</div>`}
function renderOwnedCompany(c){
  const name=esc(c.custom_name||c.name),cash=Number(c.company_cash||0),s=businessStrategy(c),rp=businessRankProgress(c),gross=Number(c.gross_per_tick||0),cost=Number(c.operating_cost_per_tick||0),net=Number(c.estimated_net_per_tick||0),margin=Number(c.margin_percent||0),value=Number(c.company_value||0);
  return `<article id="company-${c.company_id}" class="owned-company director-card theme-${esc(c.theme)}">
    <header class="company-banner premium"><span class="company-icon">${c.icon}</span><div><small>${businessRank(c)} · 평판 ${c.company_reputation}/100</small><h3>${name}</h3><p>${esc(c.description)}</p></div><button class="company-rename" onclick="renameBusinessCompany('${c.company_id}','${escAttr(name)}')" title="회사명 변경">✎</button></header>
    <div class="company-rank-progress"><div><span>기업 성장도 ${rp.score}/30</span><b>다음: ${rp.next}</b></div><i><em style="width:${rp.pct}%"></em></i></div>
    <div class="company-finance director"><div><span>회사 가치</span><b>${money(value)}</b></div><div><span>회사 금고</span><b>${money(cash)}</b></div><div><span>5분 매출</span><b>${money(gross)}</b></div><div><span>운영비</span><b class="down">-${money(cost)}</b></div><div><span>순이익</span><b class="up">+${money(net)}</b></div><div><span>이익률</span><b>${margin.toFixed(1)}%</b></div></div>
    <div class="company-settlement-strip"><span>다음 정산</span><b data-business-countdown="${c.next_settlement_seconds||0}">${businessCountdown(c.next_settlement_seconds)}</b><small>누적 매출 ${money(c.total_revenue||0)} · 누적 순익 ${money(c.total_profit||0)}</small></div>
    <div class="company-strategy"><div><b>운영 전략</b><small>${s.desc}</small></div><div class="strategy-buttons">${Object.entries(BUSINESS_STRATEGIES).map(([k,v])=>`<button class="${c.strategy===k?'active':''}" onclick="setBusinessStrategy('${c.company_id}','${k}')" title="${escAttr(v.desc)}">${v.icon}<span>${v.name}</span></button>`).join('')}</div></div>
    ${c.last_event?`<div class="company-event"><span>📣 최근 경영 이벤트</span><b>${esc(c.last_event)}</b></div>`:''}
    <div class="company-levels director">${renderCompanyLevel('시설','facility',c.facility_level,c,'🏗️','생산 공간과 기업 가치 증가')}${renderCompanyLevel('직원','staff',c.staff_level,c,'👥','판매력과 운영 효율 증가')}${renderCompanyLevel('상품','product',c.product_level,c,'🧪','상품 가치와 매출 배율 증가')}</div>
    <button class="collect-company" ${cash<=0?'disabled':''} onclick="collectBusinessCash('${c.company_id}')"><span>회사 수익 받기</span><b>${money(cash)}</b></button>
  </article>`;
}
function renderCompanyLevel(label,kind,level,c,icon,desc){
  const max=10,projection=projectedUpgrade(c,kind),canAfford=Number(profile?.cash||0)>=projection.cost;
  return `<div class="company-level director"><div class="level-head"><span>${icon}</span><div><b>${label} Lv.${level}</b><small>${desc}</small></div></div><div class="level-track">${Array.from({length:10},(_,i)=>`<i class="${i<Number(level)?'on':''}"></i>`).join('')}</div><div class="level-effect"><span>다음 순익</span><b class="up">+${money(projection.delta)} / 5분</b><small>회수 ${businessDuration(projection.payback)}</small></div><button ${Number(level)>=max||!canAfford?'disabled':''} onclick="upgradeBusiness('${c.company_id}','${kind}')">${Number(level)>=max?'MAX':`${money(projection.cost)} 투자`}</button></div>`;
}
function renderBusinessAcquisition(available){
  return `<section class="business-acquisition-intro"><span>🏦</span><div><b>기업 인수 시장</b><p>인수 가격뿐 아니라 기본 영업이익, 예상 회수기간, 명성·신용 조건을 함께 비교하세요.</p></div></section><div class="company-market director">${available.map(renderCompanyMarketCard).join('')||'<div class="business-empty">모든 회사를 인수했습니다. 이제 기업 제국 칭호에 도전하세요.</div>'}</div>`;
}
function renderCompanyMarketCard(c){
  const rep=Number(profile?.reputation||0),credit=Number(profile?.credit_score||0),cash=Number(profile?.cash||0),locked=rep<Number(c.required_reputation)||credit<Number(c.required_credit)||cash<Number(c.buy_price),est=estimateCompany({...c,facility_level:1,staff_level:0,product_level:0,company_reputation:50,strategy:'balanced'}),payback=est.net>0?Number(c.buy_price)/est.net:Infinity;
  return `<article class="company-buy-card director theme-${esc(c.theme)}"><div class="company-buy-top"><span>${c.icon}</span><div><small>5분 예상 순익 +${money(est.net)}</small><h3>${esc(c.name)}</h3></div><em>${businessDuration(payback)} 회수</em></div><p>${esc(c.description)}</p><div class="acquisition-finance"><div><span>인수가</span><b>${money(c.buy_price)}</b></div><div><span>기본 매출</span><b>${money(c.base_income)}</b></div><div><span>기본 비용</span><b>${money(c.base_cost)}</b></div><div><span>이익률</span><b>${est.margin.toFixed(1)}%</b></div></div><div class="company-requirements"><span class="${cash>=c.buy_price?'ok':'bad'}">현금 ${money(c.buy_price)}</span><span class="${rep>=c.required_reputation?'ok':'bad'}">명성 ${c.required_reputation}</span><span class="${credit>=c.required_credit?'ok':'bad'}">신용 ${c.required_credit}</span></div><button ${locked?'disabled':''} onclick="buyBusiness('${c.code}')">${locked?'인수 조건 부족':'회사 인수 계약'}</button></article>`;
}

async function businessRpc(fn,args,success){
  const buttons=[...document.querySelectorAll('#businessView button:not(:disabled)')];buttons.forEach(b=>b.disabled=true);
  try{const{data,error}=await db.rpc(fn,args);if(error)throw error;toast(success);playSuccessSound();await loadBusiness();return data}catch(e){toast(e.message||'사업 처리 중 오류가 발생했습니다.');return null}finally{buttons.forEach(b=>b.disabled=false)}
}
async function buyBusiness(code){if(!confirm('이 회사를 인수할까요? 인수 금액은 현금에서 즉시 차감됩니다.'))return;await businessRpc('buy_company_v33',{p_code:code},'회사 인수 계약이 완료되었습니다.')}
async function upgradeBusiness(id,kind){const labels={facility:'시설',staff:'직원',product:'상품 개발'};if(!confirm(`${labels[kind]} 투자를 진행할까요? 투자금은 개인 현금에서 차감됩니다.`))return;await businessRpc('upgrade_company_v33',{p_company_id:id,p_kind:kind},`${labels[kind]} 투자가 완료되었습니다.`)}
async function collectBusinessCash(id){const d=await businessRpc('collect_company_cash_v33',{p_company_id:id},'회사 수익을 현금으로 수령했습니다.');if(d?.amount)toast(`사업 수익 +${money(d.amount)}`)}
async function collectAllBusinessCash(){const d=await businessRpc('collect_all_company_cash_v33',{},'모든 회사의 수익을 한 번에 수령했습니다.');if(d?.amount)toast(`전체 사업 수익 +${money(d.amount)}`)}
async function setBusinessStrategy(id,strategy){const s=BUSINESS_STRATEGIES[strategy];if(!s)return;if(!confirm(`${s.name} 전략으로 변경할까요?\n${s.desc}`))return;await businessRpc('set_company_strategy_v33',{p_company_id:id,p_strategy:strategy},`운영 전략을 ${s.name}(으)로 변경했습니다.`)}
async function renameBusinessCompany(id,current){const name=prompt('새 회사명을 입력하세요. (2~16자)',current);if(name===null)return;await businessRpc('rename_company_v33',{p_company_id:id,p_name:name},'회사명이 변경되었습니다.')}

/* 기존 휴대폰 함수에 사업 앱 연결 */
function closePhone(){phoneOverlay.classList.add('hidden');if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}if(businessRefreshTimer){clearInterval(businessRefreshTimer);businessRefreshTimer=null}}
function phoneHome(){document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));document.getElementById('phoneHome').classList.remove('hidden');closeStockDetail();if(businessRefreshTimer){clearInterval(businessRefreshTimer);businessRefreshTimer=null}}
function openPhoneApp(name){
  document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));const screen=document.getElementById('phone-'+name);if(!screen)return;screen.classList.remove('hidden');
  if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}if(businessRefreshTimer){clearInterval(businessRefreshTimer);businessRefreshTimer=null}
  if(name==='stocks')refreshStocks();else if(name==='wallet')renderWallet();else if(name==='ranking')loadRanking();else if(name==='property')loadProperties();else if(name==='bank')loadBank();else if(name==='business')loadBusiness();else if(name==='titles')loadTitles();else if(name==='chat'){loadChatMessages();chatRefreshTimer=setInterval(()=>{if(!document.getElementById('phone-chat')?.classList.contains('hidden'))loadChatMessages()},5000)}else if(name==='skills')loadNegotiationSkills();
}

/* v32 총자산에 회사 가치 포함 */
async function loadBusinessStateSilent(){
  const{data,error}=await db.rpc('get_business_status_v33');
  if(!error)businessState=data||{};
}
function renderWallet(){
  if(!profile)return;
  const sv=holdings.reduce((s,h)=>s+Number(h.quantity)*Number(stocks.find(x=>x.id===h.stock_id)?.current_price||0),0),
        iv=inventory.reduce((s,r)=>s+itemValue(r.items.average_price,r.condition_score),0),
        cv=collectibles.reduce((s,r)=>s+Number(r.collectibles.effect_percent)*10000,0),
        bv=Number(businessState?.total_company_value||0),
        bank=Number(bankState?.deposit_balance||0)+Number(bankState?.savings_balance||0);
  walletView.innerHTML=`<div class="wallet-card">현금 <b>${money(profile.cash)}</b></div><div class="wallet-card">주식 <b>${money(sv)}</b></div><div class="wallet-card">아이템 <b>${money(iv)}</b></div><div class="wallet-card">소장품 <b>${money(cv)}</b></div><div class="wallet-card">사업 가치 <b>${money(bv)}</b></div>${bank?`<div class="wallet-card">은행 자산 <b>${money(bank)}</b></div>`:''}`;
}
function updateNetworth(){
  if(!profile)return;
  const sv=holdings.reduce((s,h)=>s+Number(h.quantity)*Number(stocks.find(x=>x.id===h.stock_id)?.current_price||0),0),iv=inventory.reduce((s,r)=>s+itemValue(r.items.average_price,r.condition_score),0),cv=collectibles.reduce((s,r)=>s+Number(r.collectibles.effect_percent)*10000,0),bv=Number(businessState?.total_company_value||0),bank=Number(bankState?.deposit_balance||0)+Number(bankState?.savings_balance||0);
  networth.textContent=money(Number(profile.cash)+sv+iv+cv+bv+bank);renderWallet();
}
async function enterGame(){
  const{error:saveError}=await db.rpc('ensure_player_save');if(saveError){toast('저장 데이터 확인 실패: '+saveError.message);showAuth();return}
  const{error:skillSyncError}=await db.rpc('sync_skill_points_v15');if(skillSyncError)console.warn('스킬 포인트 동기화 실패:',skillSyncError.message);
  await loadProfile();if(!profile){showAuth();return}showGame();
  await Promise.all([loadInventory(),loadStocks(),loadCollectibles(),loadEffects(),syncStockClock(),loadBusinessStateSilent()]);
  await updateStocks();updateNetworth();subscribe();startGlobalStockTicker();startStockCountdown();setTimeout(hideBootScreen,280);
}
async function refreshAll(){
  await loadProfile();if(!profile)return;
  await Promise.all([loadInventory(),loadStocks(),loadCollectibles(),loadEffects(),syncStockClock(),loadBusinessStateSilent()]);
  await updateStocks();updateNetworth();
}


/* ============================================================
   v33.2 HOTFIX: auction reputation, stable countdown, bank rules
   ============================================================ */
function renderSellerAuction(options={}){
  const s=sellerAuction;
  if(!s)return;
  const oldLog=document.getElementById('sellerBidLog');
  const oldTop=oldLog?oldLog.scrollTop:0;
  const wasNearBottom=oldLog?oldLog.scrollHeight-oldLog.scrollTop-oldLog.clientHeight<28:true;
  sellerAuctionHall.innerHTML=`<div class="seller-live"><img src="${itemImage(s.item.items.name,s.item.items.category)}"><div><p class="eyebrow">NPC COLLECTOR BATTLE</p><h2>${esc(s.item.items.name)}</h2><div class="seller-price">현재 입찰가 <b>${money(s.current)}</b><em id="sellerCountdownLabel" class="seller-countdown ${s.countdown?'':'hidden'}">${s.countdown?`판매까지 ${s.countdown}`:''}</em></div><div class="collector-row"><span>🧐 감정가</span><span>🤑 수집가</span><span>😎 리셀러</span></div><div id="sellerBidLog" class="bid-log">${s.log.map(x=>`<p>${esc(x)}</p>`).join('')}</div></div></div>`;
  requestAnimationFrame(()=>{
    const log=document.getElementById('sellerBidLog');
    if(!log)return;
    if(options.forceBottom||wasNearBottom)log.scrollTop=log.scrollHeight;
    else log.scrollTop=oldTop;
  });
}
function updateSellerAuctionCountdown(){
  const s=sellerAuction,label=document.getElementById('sellerCountdownLabel');
  if(!s||!label)return;
  label.classList.toggle('hidden',!s.countdown);
  label.textContent=s.countdown?`판매까지 ${s.countdown}`:'';
}
function startSellerAuctionCountdown(){
  const s=sellerAuction;
  if(!s||s.countdown||s.ending)return;
  s.countdown=3;
  s.log.push('추가 입찰이 없습니다. 3초 후 판매됩니다.');
  renderSellerAuction({forceBottom:true});
  const countdownTimer=setInterval(async()=>{
    if(!sellerAuction||sellerAuction!==s){clearInterval(countdownTimer);return;}
    s.countdown--;
    updateSellerAuctionCountdown();
    if(s.countdown<=0){
      clearInterval(countdownTimer);
      await finishSellerAuctionAfterCountdown();
    }
  },1000);
}
async function finishSellerAuctionAfterCountdown(){
  const s=sellerAuction;
  if(!s||s.ending)return;
  s.ending=true;
  const{data,error}=await db.rpc('finish_npc_seller_auction_v13',{p_session_id:s.session,p_final_price:s.current});
  if(error){s.ending=false;return toast(error.message);}
  reputationToast(data,'경매 판매 '+money(data.final_price));
  playSuccessSound();
  clearInterval(s.timer);
  sellerAuction=null;
  await Promise.all([loadProfile(),loadInventory()]);
  fillAuctionSellItems();
  sellerAuctionHall.innerHTML='<div class="auction-finished">3초 동안 추가 입찰이 없어 판매가 확정되었습니다.</div>';
}
function renderBank(){
  const host=document.getElementById('bankView');if(!host||!bankState)return;
  const b=bankState,loan=b.loan||null;
  const cash=spendableCash(),deposit=Number(b.deposit_balance||0),liquid=cash+deposit,due=Number(loan?.due_amount||0),netAfterLoan=Math.max(0,liquid-due);
  host.innerHTML=`
    <div class="bank-liquidity-grid"><div class="spendable-funds-card bank-cash"><span>지금 바로 쓸 수 있는 현금</span><b>${money(cash)}</b><small>게임 내 구매·투자에 즉시 사용 가능</small></div><div class="spendable-funds-card bank-liquid"><span>자유예금 출금 포함 가용액</span><b>${money(liquid)}</b><small>현금 ${money(cash)} + 자유예금 ${money(deposit)}</small></div>${loan?`<div class="spendable-funds-card bank-net"><span>대출 상환 후 순가용액</span><b>${money(netAfterLoan)}</b><small>가용액에서 상환액 ${money(due)} 차감 기준</small></div>`:''}</div>
    <div class="bank-hero"><div><span>판매은행 총 금융자산</span><b>${money(Number(b.deposit_balance||0)+Number(b.savings_balance||0))}</b></div><small>30분 단위 이자는 서버 시간으로 계산되며 로그아웃해도 유지됩니다.</small></div>
    <section class="bank-product deposit"><div class="bank-product-head"><span>💳</span><div><h3>자유 예금</h3><p>한도 없이 30분마다 복리 0.2%</p></div><b>${money(b.deposit_balance||0)}</b></div><div class="bank-actions"><input id="depositAmount" type="number" min="1" placeholder="금액"><button onclick="bankDeposit()">입금</button><button class="sub" onclick="bankWithdrawDeposit()">출금</button></div><small>다음 이자까지 약 ${formatRemaining(b.deposit_next_seconds)} 남음</small></section>
    <section class="bank-product savings"><div class="bank-product-head"><span>📈</span><div><h3>목표 적금</h3><p>30분마다 5% · 설정한 목표액에서 성장 종료</p></div><b>${money(b.savings_balance||0)}</b></div><div class="savings-progress"><i style="width:${Math.min(100,Number(b.savings_target||0)>0?Number(b.savings_balance||0)/Number(b.savings_target)*100:0)}%"></i></div><div class="bank-target">목표 ${money(b.savings_target||0)} · 다음 이자 ${formatRemaining(b.savings_next_seconds)}</div><div class="bank-actions savings-inputs"><input id="savingsAmount" type="number" min="1" placeholder="넣을 금액"><input id="savingsTarget" type="number" min="1" placeholder="목표 금액"><button onclick="bankSavingsDeposit()">적금 넣기</button><button class="sub" onclick="bankWithdrawSavings()">해지/출금</button></div></section>
    <section class="bank-product loan"><div class="bank-product-head"><span>🏦</span><div><h3>신용 대출</h3><p>15분 만기 · 이자 10% · 최소 3분 후 상환</p></div><b>한도 ${money(b.loan_limit||0)}</b></div>${loan?`<div class="loan-active"><div><span>대출 원금</span><b>${money(loan.principal)}</b></div><div><span>상환액</span><b>${money(loan.due_amount)}</b></div><div><span>상환 가능</span><b>${loan.repay_available?'지금 가능':formatRemaining(loan.repay_available_seconds)}</b></div><div><span>만기까지</span><b class="${loan.overdue?'down':''}">${loan.overdue?'연체 '+formatRemaining(loan.overdue_seconds):formatRemaining(loan.due_seconds)}</b></div></div><button class="bank-repay" ${loan.repay_available?'':'disabled'} onclick="repayLoan()">전액 상환</button><small>${loan.overdue?'연체로 신용점수가 하락했습니다. 상환해도 연체 패널티는 복구되지 않습니다.':'3분 이후 가능한 한 빨리 상환할수록 신용 상승 폭이 커집니다.'}</small>`:`<div class="bank-actions"><input id="loanAmount" type="number" min="10000" step="10000" max="${Number(b.loan_limit||0)}" placeholder="대출 금액"><button onclick="takeLoan()">대출 실행</button></div><small>신용점수가 높을수록 한도가 크게 증가합니다. 소액 반복 대출은 신용 보상이 매우 작습니다.</small>`}</section>`;
}
async function repayLoan(){
  if(!confirm('이자 10%를 포함한 대출금을 전액 상환할까요?'))return;
  const data=await bankCall('bank_repay_loan_v25',{},'대출 상환 완료');
  if(data&&Number.isFinite(Number(data.credit_delta))){
    const d=Number(data.credit_delta);
    toast(`대출 상환 완료 · 신용 ${d>=0?'+':''}${d}${Number.isFinite(Number(data.credit_before))?` (${data.credit_before} → ${data.credit_after})`:''}`);
  }
}


/* ============================================================
   v33.5 GLOBAL CHAT UNREAD BADGE
   ============================================================ */
function chatUnreadStorageKey(){
  return `sellingGodChatUnread:${currentUser?.id||'guest'}`;
}
function chatLastSeenStorageKey(){
  return `sellingGodChatLastSeen:${currentUser?.id||'guest'}`;
}
function updateChatUnreadDots(unread){
  const on=Boolean(unread);
  document.getElementById('phoneChatUnreadDot')?.classList.toggle('hidden',!on);
  document.getElementById('chatAppUnreadDot')?.classList.toggle('hidden',!on);
  document.getElementById('hudPhoneButton')?.classList.toggle('has-chat-unread',on);
  document.getElementById('chatAppButton')?.classList.toggle('has-chat-unread',on);
}
function setChatUnread(unread){
  const on=Boolean(unread);
  try{localStorage.setItem(chatUnreadStorageKey(),on?'1':'0')}catch{}
  updateChatUnreadDots(on);
}
function restoreChatUnreadState(){
  let unread=false;
  try{unread=localStorage.getItem(chatUnreadStorageKey())==='1'}catch{}
  updateChatUnreadDots(unread);
}
function markChatRead(latestCreatedAt=null){
  setChatUnread(false);
  try{localStorage.setItem(chatLastSeenStorageKey(),latestCreatedAt||new Date().toISOString())}catch{}
}
function isChatScreenOpen(){
  const phone=document.getElementById('phoneOverlay');
  const screen=document.getElementById('phone-chat');
  return Boolean(phone&&!phone.classList.contains('hidden')&&screen&&!screen.classList.contains('hidden'));
}
async function syncChatUnreadFromServer(){
  if(!currentUser)return;
  let lastSeen='';
  try{lastSeen=localStorage.getItem(chatLastSeenStorageKey())||''}catch{}
  const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:1});
  if(error||!Array.isArray(data)||!data.length)return;
  const latest=data[0];
  if(latest.sender_user_id===currentUser.id)return;
  if(!lastSeen||new Date(latest.created_at).getTime()>new Date(lastSeen).getTime())setChatUnread(true);
}

async function handleRealtimeChatInsert(payload){
  const row=payload?.new||{};
  if(!row.id||!currentUser||row.user_id===currentUser.id)return;

  if(isChatScreenOpen()){
    await loadChatMessages();
    markChatRead(row.created_at);
  }else{
    setChatUnread(true);
  }

  let sender=null;
  try{
    const {data,error}=await db.rpc('get_global_chat_message_v34',{p_message_id:row.id});
    if(!error)sender=Array.isArray(data)?data[0]:data;
  }catch(error){
    console.warn('채팅 알림 발신자 조회 실패:',error);
  }
  showChatNotification({
    nickname:sender?.nickname||'새 메시지',
    active_title:sender?.active_title||'초보 장사꾼',
    chat_text:sender?.chat_text||row.message||'',
    created_at:sender?.created_at||row.created_at
  });
}

async function loadChatMessages(){
  const host=document.getElementById('globalChatList');
  if(!host)return;
  const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:60});
  if(error){host.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}
  host.innerHTML=(data||[]).map(r=>`<article class="global-chat-message ${r.sender_user_id===currentUser.id?'mine':''}"><div class="chat-user"><strong>${esc(r.nickname)}</strong><span class="title-badge ${titleClass(r.active_title)}">${esc(r.active_title||'초보 장사꾼')}</span><time>${chatTime(r.created_at)}</time></div><p>${esc(r.chat_text)}</p></article>`).join('')||'<p class="muted chat-empty">첫 메시지를 남겨 보세요.</p>';
  const latest=(data||[])[0];
  if(isChatScreenOpen())markChatRead(latest?.created_at||new Date().toISOString());
  requestAnimationFrame(()=>{host.scrollTop=host.scrollHeight});
}

function openPhoneApp(name){
  document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));
  const screen=document.getElementById('phone-'+name);
  if(!screen)return;
  screen.classList.remove('hidden');
  if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}
  if(typeof businessRefreshTimer!=='undefined'&&businessRefreshTimer){clearInterval(businessRefreshTimer);businessRefreshTimer=null}
  if(name==='stocks')refreshStocks();
  else if(name==='wallet')renderWallet();
  else if(name==='ranking')loadRanking();
  else if(name==='property')loadProperties();
  else if(name==='bank')loadBank();
  else if(name==='business')loadBusiness();
  else if(name==='titles')loadTitles();
  else if(name==='chat'){
    markChatRead();
    loadChatMessages();
    chatRefreshTimer=setInterval(()=>{
      if(isChatScreenOpen())loadChatMessages();
    },5000);
  }else if(name==='skills')loadNegotiationSkills();
}

document.addEventListener('DOMContentLoaded',()=>{
  restoreChatUnreadState();
  setTimeout(syncChatUnreadFromServer,1800);
});

/* ============================================================
   v33.7 RELIABLE GLOBAL CHAT NOTIFICATIONS
   - Realtime + polling fallback
   - Correct newest-message detection (server rows are oldest -> newest)
   - Persistent unread badge
   - Popup deduplication
   ============================================================ */
let reliableChatPollTimer=null;
let reliableChatPollBusy=false;
let reliableChatLatestId=0;
const reliableChatNotifiedIds=new Set();

function chatLatestKnownStorageKey(){
  return `sellingGodChatLatestKnown:${currentUser?.id||'guest'}`;
}
function getChatMessageId(row){
  return Number(row?.message_id ?? row?.id ?? 0) || 0;
}
function newestChatRow(rows){
  if(!Array.isArray(rows)||!rows.length)return null;
  return rows.reduce((latest,row)=>getChatMessageId(row)>getChatMessageId(latest)?row:latest,rows[0]);
}
function rememberReliableChatLatest(id){
  const n=Number(id)||0;
  if(n<=0)return;
  reliableChatLatestId=Math.max(reliableChatLatestId,n);
  try{localStorage.setItem(chatLatestKnownStorageKey(),String(reliableChatLatestId))}catch{}
}
function stopReliableChatNotifications(){
  if(reliableChatPollTimer){clearInterval(reliableChatPollTimer);reliableChatPollTimer=null}
  reliableChatPollBusy=false;
  reliableChatLatestId=0;
  reliableChatNotifiedIds.clear();
}
async function fetchRecentChatRows(limit=20){
  const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:limit});
  if(error)throw error;
  return Array.isArray(data)?data:[];
}
async function initializeReliableChatNotifications(){
  stopReliableChatNotifications();
  if(!currentUser)return;
  let stored=0;
  try{stored=Number(localStorage.getItem(chatLatestKnownStorageKey())||0)||0}catch{}
  let rows=[];
  try{rows=await fetchRecentChatRows(20)}catch(error){console.warn('채팅 알림 초기화 실패:',error);return}
  const newest=newestChatRow(rows);
  const newestId=getChatMessageId(newest);
  reliableChatLatestId=Math.max(stored,newestId);
  rememberReliableChatLatest(reliableChatLatestId);

  let lastSeen='';
  try{lastSeen=localStorage.getItem(chatLastSeenStorageKey())||''}catch{}
  const unseenOther=rows.some(row=>{
    if(row.sender_user_id===currentUser.id)return false;
    if(!lastSeen)return false;
    return new Date(row.created_at).getTime()>new Date(lastSeen).getTime();
  });
  if(unseenOther&&!isChatScreenOpen())setChatUnread(true);

  reliableChatPollTimer=setInterval(pollReliableChatNotifications,3000);
}
async function processReliableIncomingChat(row,{showPopup=true}={}){
  if(!row||!currentUser)return;
  const id=getChatMessageId(row);
  if(id>0)rememberReliableChatLatest(id);
  if(row.sender_user_id===currentUser.id)return;

  if(isChatScreenOpen()){
    await loadChatMessages();
    markChatRead(row.created_at||new Date().toISOString());
    return;
  }

  setChatUnread(true);
  if(showPopup&&id>0&&!reliableChatNotifiedIds.has(id)){
    reliableChatNotifiedIds.add(id);
    showChatNotification({
      nickname:row.nickname||'새 메시지',
      active_title:row.active_title||'초보 장사꾼',
      chat_text:row.chat_text||row.message||'',
      created_at:row.created_at
    });
    if(reliableChatNotifiedIds.size>120){
      const first=reliableChatNotifiedIds.values().next().value;
      reliableChatNotifiedIds.delete(first);
    }
  }
}
async function pollReliableChatNotifications(){
  if(reliableChatPollBusy||!currentUser)return;
  reliableChatPollBusy=true;
  try{
    const rows=await fetchRecentChatRows(30);
    const incoming=rows
      .filter(row=>getChatMessageId(row)>reliableChatLatestId)
      .sort((a,b)=>getChatMessageId(a)-getChatMessageId(b));
    for(const row of incoming)await processReliableIncomingChat(row,{showPopup:true});
    const newest=newestChatRow(rows);
    if(newest)rememberReliableChatLatest(getChatMessageId(newest));
  }catch(error){
    console.warn('채팅 알림 확인 실패:',error);
  }finally{
    reliableChatPollBusy=false;
  }
}

handleRealtimeChatInsert=async function(payload){
  const raw=payload?.new||{};
  if(!raw?.id||!currentUser)return;
  const rawId=getChatMessageId(raw);
  if(rawId>0&&rawId<=reliableChatLatestId&&reliableChatNotifiedIds.has(rawId))return;
  let row={
    message_id:raw.id,
    sender_user_id:raw.user_id,
    chat_text:raw.message,
    created_at:raw.created_at
  };
  try{
    const{data,error}=await db.rpc('get_global_chat_message_v34',{p_message_id:raw.id});
    if(!error){const hydrated=Array.isArray(data)?data[0]:data;if(hydrated)row=hydrated}
  }catch(error){console.warn('실시간 채팅 정보 조회 실패:',error)}
  await processReliableIncomingChat(row,{showPopup:true});
};

loadChatMessages=async function(){
  const host=document.getElementById('globalChatList');
  if(!host)return;
  const wasNearBottom=host.scrollHeight-host.scrollTop-host.clientHeight<40;
  const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:60});
  if(error){host.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}
  const rows=Array.isArray(data)?data:[];
  host.innerHTML=rows.map(r=>`<article class="global-chat-message ${r.sender_user_id===currentUser.id?'mine':''}"><div class="chat-user"><strong>${esc(r.nickname)}</strong><span class="title-badge ${titleClass(r.active_title)}">${esc(r.active_title||'초보 장사꾼')}</span><time>${chatTime(r.created_at)}</time></div><p>${esc(r.chat_text)}</p></article>`).join('')||'<p class="muted chat-empty">첫 메시지를 남겨 보세요.</p>';
  const latest=newestChatRow(rows);
  if(latest)rememberReliableChatLatest(getChatMessageId(latest));
  if(isChatScreenOpen())markChatRead(latest?.created_at||new Date().toISOString());
  requestAnimationFrame(()=>{
    if(isChatScreenOpen()||wasNearBottom)host.scrollTop=host.scrollHeight;
  });
};

syncChatUnreadFromServer=async function(){
  if(!currentUser)return;
  try{
    const rows=await fetchRecentChatRows(20);
    const latest=newestChatRow(rows);
    if(!latest)return;
    rememberReliableChatLatest(getChatMessageId(latest));
    let lastSeen='';
    try{lastSeen=localStorage.getItem(chatLastSeenStorageKey())||''}catch{}
    const unseenOther=rows.some(row=>row.sender_user_id!==currentUser.id&&(!lastSeen||new Date(row.created_at).getTime()>new Date(lastSeen).getTime()));
    if(unseenOther&&!isChatScreenOpen())setChatUnread(true);
  }catch(error){console.warn('미확인 채팅 동기화 실패:',error)}
};

const enterGameBeforeReliableChat=enterGame;
enterGame=async function(){
  await enterGameBeforeReliableChat();
  if(currentUser&&profile){
    restoreChatUnreadState();
    await initializeReliableChatNotifications();
    await syncChatUnreadFromServer();
  }
};
const logoutBeforeReliableChat=logout;
logout=async function(){
  stopReliableChatNotifications();
  await logoutBeforeReliableChat();
};

const openPhoneAppBeforeReliableChat=openPhoneApp;
openPhoneApp=function(name){
  openPhoneAppBeforeReliableChat(name);
  if(name==='chat'){
    setChatUnread(false);
    setTimeout(async()=>{
      await loadChatMessages();
      const rows=await fetchRecentChatRows(1).catch(()=>[]);
      const latest=newestChatRow(rows);
      markChatRead(latest?.created_at||new Date().toISOString());
    },0);
  }
};

/* ============================================================
   v33.9 HOTFIX: stable auction countdown + instant relisting
   ============================================================ */
function renderAuction(options={}){
  if(!auction)return;
  const oldLog=document.getElementById('auctionBidLog');
  const oldTop=oldLog?oldLog.scrollTop:0;
  const wasNearBottom=oldLog?oldLog.scrollHeight-oldLog.scrollTop-oldLog.clientHeight<32:true;
  auctionHall.innerHTML=`<div class="auction-card v13"><img src="${itemImage(auction.name,auction.category)}"><div><span class="badge ${rarityClass(auction.rarity)}">${esc(auction.rarity)}</span><h2>${esc(auction.name)}</h2><div class="bid-price"><span>현재 최고가</span><b>${money(auction.price)}</b><em id="auctionCountdownLabel" class="${auction.countdown?'':'hidden'}">${auction.countdown?`낙찰까지 ${auction.countdown}`:''}</em></div><div id="auctionBidLog" class="bid-log">${auction.log.map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="auction-actions"><button class="btn light" onclick="playerBid(5)">+5%</button><button class="btn light" onclick="playerBid(12)">+12%</button><button class="btn primary" onclick="leaveAuction()">경매 나가기</button></div></div></div>`;
  requestAnimationFrame(()=>{
    const log=document.getElementById('auctionBidLog');
    if(!log)return;
    if(options.forceBottom||wasNearBottom)log.scrollTop=log.scrollHeight;
    else log.scrollTop=oldTop;
  });
}
function updateAuctionCountdownLabel(){
  const label=document.getElementById('auctionCountdownLabel');
  if(!label||!auction)return;
  label.classList.toggle('hidden',!auction.countdown);
  label.textContent=auction.countdown?`낙찰까지 ${auction.countdown}`:'';
}
async function refreshInventoryAfterAuction(userItemId){
  for(let i=0;i<3;i++){
    await loadInventory();
    if(!userItemId||inventory.some(x=>String(x.id)===String(userItemId)))break;
    await new Promise(r=>setTimeout(r,180*(i+1)));
  }
  fillAuctionSellItems();
  updateNetworth();
}
function startAuctionCountdown(){
  if(!auction)return;
  auction.countdown=3;
  auction.log.push('추가 입찰이 없습니다. 3초 후 경매가 종료됩니다.');
  renderAuction({forceBottom:true});
  const target=auction;
  const timer=setInterval(async()=>{
    if(!auction||auction!==target){clearInterval(timer);return;}
    auction.countdown--;
    updateAuctionCountdownLabel();
    if(auction.countdown>0)return;
    clearInterval(timer);
    const finished={...auction};
    if(auction.highest){
      const{data,error}=await db.rpc('claim_auction_v31',{p_auction_id:auction.id});
      if(error){auction.countdown=0;updateAuctionCountdownLabel();return toast(error.message);}
      if(data?.won){
        toast('낙찰 성공 '+money(data.final_price)+' · 바로 내 물건 출품에서 판매할 수 있습니다.');
        playSuccessSound();
        await loadProfile();
        await refreshInventoryAfterAuction(data.user_item_id);
      }
    }else{
      const{data,error}=await db.rpc('close_auction_without_winner_v31',{p_auction_id:auction.id});
      if(error)console.warn(error.message);
      toast(data?.npc_won?`NPC 낙찰 ${money(data.final_price)}`:'입찰자가 없어 유찰되었습니다.');
    }
    auctionChoices=auctionChoices.map(x=>x.cycle_key===finished.cycleKey&&x.slot_no===finished.slotNo?{...x,ended:true}:x);
    leaveAuction();
    renderAuctionChoices();
  },1000);
}
async function playerBid(pct){
  if(!auction)return;
  const bid=Math.round(auction.price*(1+pct/100));
  const{data,error}=await db.rpc('place_auction_bid',{p_auction_id:auction.id,p_bid_amount:bid});
  if(error)return toast(error.message);
  auction.price=Number(data.current_price);
  auction.highest=true;
  auction.bids++;
  auction.log.push('내 입찰 '+money(bid));
  renderAuction({forceBottom:true});
}
function fillAuctionSellItems(){
  const select=document.getElementById('auctionSellItem');
  if(!select)return;
  const previous=select.value;
  const available=inventory.filter(x=>!x.is_listed);
  select.innerHTML='<option value="">출품할 아이템 선택</option>';
  available.forEach(x=>select.add(new Option(`${x.items.name} · ${x.items.rarity} · 상태 ${x.condition_score}`,x.id)));
  if(available.some(x=>String(x.id)===String(previous)))select.value=previous;
  const button=select.closest('.auction-seller')?.querySelector('button');
  if(button)button.disabled=!available.length;
}

/* ============================================================
   v35 HIGH RISK + TIERED AUCTION + APPRAISAL/RESTORATION
   ============================================================ */
let auctionTierV35='normal';
let auctionAccessV35={normal:true,vip:false,vvip:false};
let restorationTimerV35=null;
let riskTimerV35=null;

const AUCTION_TIER_META_V35={
  normal:{name:'일반 경매장',icon:'🔨',pass:0,listingFee:0,minRarity:0,npcPower:1},
  vip:{name:'VIP 경매장',icon:'👑',pass:10000000,listingFee:2000000,minRarity:3,npcPower:1.8},
  vvip:{name:'VVIP 경매장',icon:'💎',pass:100000000,listingFee:20000000,minRarity:4,npcPower:3.5}
};

function normalizeRarityV35(r){
  if(r==='영웅')return '진귀';
  if(r==='전설'||r==='레전드')return '유물';
  return r||'일반';
}
function appraisalCostV35(r){
  return {'일반':5000,'희귀':12000,'초희귀':30000,'진귀':100000,'보물':500000,'유물':2000000,'고대 유물':10000000}[normalizeRarityV35(r)]||5000;
}
function restorationCostV35(row){
  const rank=rarityScore(normalizeRarityV35(row.items?.rarity));
  const damage=Math.max(1,100-Number(row.condition_score||0));
  return Math.max(10000,Math.round((rank+1)*(rank+1)*25000*(.45+damage/65)));
}

async function loadAuctionAccessV35(){
  const host=document.getElementById('auctionAccessPanel');
  const{data,error}=await db.rpc('get_auction_access_v35');
  if(error){if(host)host.innerHTML=`<div class="panel error-panel">${esc(error.message)}</div>`;return false;}
  auctionAccessV35={normal:true,vip:!!data?.vip_access,vvip:!!data?.vvip_access,vip_until:data?.vip_until,vvip_until:data?.vvip_until};
  if(host){
    const vipLeft=data?.vip_seconds>0?formatRotationTime(data.vip_seconds*1000):'미보유';
    const vvipLeft=data?.vvip_seconds>0?formatRotationTime(data.vvip_seconds*1000):'미보유';
    host.innerHTML=`<div class="auction-access-card normal"><span>🔨</span><div><b>일반 경매장</b><small>항상 입장 가능</small></div><em>OPEN</em></div>
      <div class="auction-access-card vip ${auctionAccessV35.vip?'owned':'locked'}"><span>👑</span><div><b>VIP 24시간권</b><small>${auctionAccessV35.vip?`남은 시간 ${vipLeft}`:'명성 300 · 신용 600 · 1,000만원'}</small></div><button ${auctionAccessV35.vip?'disabled':''} onclick="buyAuctionPassV35('vip')">${auctionAccessV35.vip?'입장 가능':'구매'}</button></div>
      <div class="auction-access-card vvip ${auctionAccessV35.vvip?'owned':'locked'}"><span>💎</span><div><b>VVIP 24시간권</b><small>${auctionAccessV35.vvip?`남은 시간 ${vvipLeft}`:'명성 1,000 · 신용 800 · 1억원'}</small></div><button ${auctionAccessV35.vvip?'disabled':''} onclick="buyAuctionPassV35('vvip')">${auctionAccessV35.vvip?'입장 가능':'구매'}</button></div>`;
  }
  return true;
}
async function buyAuctionPassV35(tier){
  const meta=AUCTION_TIER_META_V35[tier];
  if(!meta||tier==='normal')return;
  if(!confirm(`${meta.name} 24시간 입장권을 ${money(meta.pass)}에 구매할까요?`))return;
  const{data,error}=await db.rpc('buy_auction_pass_v35',{p_tier:tier});
  if(error)return toast(error.message);
  toast(`${meta.name} 입장권 구매 완료 · 24시간 이용 가능`);playSuccessSound();
  await Promise.all([loadProfile(),loadAuctionAccessV35()]);
  selectAuctionTier(tier,document.querySelector(`#auctionTierTabs [data-tier="${tier}"]`));
}
async function selectAuctionTier(tier,btn){
  if(tier!=='normal'&&!auctionAccessV35[tier]){
    toast(`${AUCTION_TIER_META_V35[tier].name} 입장권을 먼저 구매하세요.`);
    return;
  }
  auctionTierV35=tier;
  document.querySelectorAll('#auctionTierTabs button').forEach(x=>x.classList.toggle('active',x===btn));
  await loadAuctionLobby();
  fillAuctionSellItems();
}

const switchAuctionModeV34=switchAuctionMode;
switchAuctionMode=function(mode,btn){
  document.querySelectorAll('.auction-tabs button').forEach(x=>x.classList.remove('active'));btn?.classList.add('active');
  document.getElementById('auctionBuyPanel')?.classList.toggle('hidden',mode!=='buy');
  document.getElementById('auctionSellPanel')?.classList.toggle('hidden',mode!=='sell');
  if(mode==='sell')fillAuctionSellItems();
  else loadAuctionLobby();
};

loadAuctionLobby=async function(){
  clearInterval(auction?.interval);auction=null;
  const hall=document.getElementById('auctionHall');if(hall)hall.innerHTML='';
  await loadAuctionAccessV35();
  if(auctionTierV35!=='normal'&&!auctionAccessV35[auctionTierV35])auctionTierV35='normal';
  document.querySelectorAll('#auctionTierTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tier===auctionTierV35));
  const{data,error}=await db.rpc('get_auction_choices_v35',{p_tier:auctionTierV35});
  if(error){toast('경매 목록을 불러오지 못했습니다: '+error.message);return;}
  auctionChoices=Array.isArray(data?.choices)?data.choices:[];
  renderAuctionChoices(data?.refresh_at);
};

renderAuctionChoices=function(refreshAt){
  const el=document.getElementById('auctionChoices');if(!el)return;
  const meta=AUCTION_TIER_META_V35[auctionTierV35];
  const cards=(auctionChoices||[]).map((a,i)=>{
    if(a.ended)return `<div class="auction-choice auction-slot-ended"><div class="auction-ended-seal">경매 종료</div><h3>${esc(a.item_name||'종료된 경매품')}</h3><p>다음 교체 전까지 빈 자리로 유지됩니다.</p><small>새 상품 준비 중</small></div>`;
    const known=!!a.condition_known;
    const appraisal=Number(a.appraisal_cost||appraisalCostV35(a.rarity));
    return `<article class="auction-choice auction-premium-card ${rarityClass(a.rarity)} tier-${auctionTierV35}">
      <button class="auction-enter-zone" onclick="enterAuctionChoice(${i})"><img src="${itemImage(a.item_name,a.category)}"><h3 class="rarity-text ${rarityClass(a.rarity)}">${esc(a.item_name)}</h3><div class="auction-rarity-caption rarity-text ${rarityClass(a.rarity)}">${esc(a.rarity)}</div><div class="auction-secret-condition ${known?'known':''}">${known?`상태 ${a.condition_score}/100`:'상태 미감정 · 감정소에서 확인'}</div><b>시작가 ${money(a.start_price)}</b><small>경매장 입장 →</small></button>
    </article>`;
  }).join('');
  el.innerHTML=`<div id="auctionRotationBanner" class="rotation-banner auction-rotation tier-${auctionTierV35}"><div><b>${meta.icon} ${meta.name} 라인업</b><small>${auctionTierV35==='normal'?'진귀가 대부분이며 가끔 보물이 등장합니다.':auctionTierV35==='vip'?'진귀부터 유물까지 등장하며 NPC 자금력이 높습니다.':'보물이 기본이며 고대 유물까지 등장하는 초고액 시장입니다.'}</small></div><strong>다음 교체 <span>--:--</span></strong></div>`+(cards||'<div class="panel empty-state">현재 경매품이 없습니다.</div>');
  if(refreshAt)startRotationCountdown('auction',refreshAt,'auctionRotationBanner',()=>{if(!auction)loadAuctionLobby()});
};
async function appraiseAuctionItemV35(ev,i){
  ev?.stopPropagation();
  const a=auctionChoices[i];if(!a||a.ended||a.condition_known)return;
  const cost=Number(a.appraisal_cost||appraisalCostV35(a.rarity));
  if(!confirm(`${a.item_name}의 상태를 ${money(cost)}에 감정할까요?`))return;
  const{data,error}=await db.rpc('appraise_auction_item_v35',{p_cycle_key:a.cycle_key,p_slot_no:a.slot_no,p_tier:auctionTierV35});
  if(error)return toast(error.message);
  auctionChoices[i]={...a,condition_known:true,condition_score:Number(data.condition_score),appraisal_cost:Number(data.cost)};
  toast(`감정 완료 · 상태 ${data.condition_score}/100`);renderAuctionChoices();await loadProfile();
}
enterAuctionChoice=async function(i){
  const c=auctionChoices[i];if(!c||c.ended)return toast('이미 종료된 경매입니다.');
  const{data,error}=await db.rpc('create_auction_choice_v35',{p_cycle_key:c.cycle_key,p_slot_no:c.slot_no,p_tier:auctionTierV35});
  if(error)return toast(error.message);
  auction={id:data.auction_id,cycleKey:c.cycle_key,slotNo:c.slot_no,tier:auctionTierV35,name:c.item_name,category:c.category,rarity:c.rarity,price:Number(data.current_price),highest:false,stopped:false,bids:0,countdown:0,log:[`${AUCTION_TIER_META_V35[auctionTierV35].name} 시작 ${money(data.current_price)}`]};
  document.getElementById('auctionChoices')?.classList.add('hidden');renderAuction({forceBottom:true});startAuctionLoop();
};
const AUCTION_BIDDER_POOLS_V386={
  normal:['한도윤 수집가','윤서진 감정가','장미라 대표','박준혁 딜러','서하린 컬렉터','최민재 리셀러'],
  vip:['프리미엄 수집가','갤러리 대표','해외 딜러','재벌 2세','호텔 아트디렉터','사모펀드 매니저'],
  vvip:['아스트라 회장','크라운 재단','해외 왕실 대리인','익명 슈퍼 컬렉터','국제 경매 대리인','박물관 재단 이사']
};
function chooseAuctionBidderV386(tier,serverName,lastName){
  const pool=[...(AUCTION_BIDDER_POOLS_V386[tier]||AUCTION_BIDDER_POOLS_V386.normal)];
  if(serverName&&!pool.includes(serverName))pool.push(serverName);
  const candidates=pool.filter(name=>name!==lastName);
  return candidates[Math.floor(Math.random()*candidates.length)]||pool[0]||'NPC 수집가';
}
startAuctionLoop=function(){
  clearInterval(auction.interval);
  auction.interval=setInterval(async()=>{
    if(!auction)return;
    const{data,error}=await db.rpc('npc_auction_step_v35',{p_auction_id:auction.id});
    if(error){clearInterval(auction.interval);return toast(error.message);}
    auction.price=Number(data.current_price);
    if(data.action==='hold'){
      auction.stopped=true;clearInterval(auction.interval);startAuctionCountdown();
    }else{
      auction.bids++;
      const bidder=chooseAuctionBidderV386(auction.tier||auctionTierV35,data.bidder_name,auction.lastNpcBidder);
      auction.lastNpcBidder=bidder;
      auction.log.push(`${bidder} ${data.action==='jump'?'강한 ':''}입찰 +${money(data.increment)}`);
      renderAuction({forceBottom:true});
    }
  },auctionTierV35==='vvip'?1350:auctionTierV35==='vip'?1550:1800);
};

fillAuctionSellItems=function(){
  const select=document.getElementById('auctionSellItem');if(!select)return;
  const tier=document.getElementById('auctionSellTier')?.value||auctionTierV35||'normal';
  const meta=AUCTION_TIER_META_V35[tier];
  const previous=select.value;
  const available=inventory.filter(x=>!x.is_listed&&!x.restoration_locked&&rarityScore(normalizeRarityV35(x.items.rarity))>=meta.minRarity);
  select.innerHTML='<option value="">출품할 아이템 선택</option>';
  available.forEach(x=>select.add(new Option(`${x.items.name} · ${normalizeRarityV35(x.items.rarity)} · 상태 ${x.condition_score}`,x.id)));
  if(available.some(x=>String(x.id)===String(previous)))select.value=previous;
  const button=select.closest('.auction-seller')?.querySelector('button');if(button)button.disabled=!available.length;
};
startSellerAuction=async function(){
  const id=document.getElementById('auctionSellItem')?.value;
  const tier=document.getElementById('auctionSellTier')?.value||'normal';
  const r=inventory.find(x=>String(x.id)===String(id));if(!r)return toast('출품할 아이템을 선택하세요.');
  const meta=AUCTION_TIER_META_V35[tier];
  if(meta.listingFee&&!confirm(`${meta.name} 출품 수수료 ${money(meta.listingFee)}를 지불하고 등록할까요?`))return;
  const{data,error}=await db.rpc('start_npc_seller_auction_v35',{p_user_item_id:id,p_tier:tier});
  if(error)return toast(error.message);
  sellerAuction={session:data.session_id,item:r,tier,current:Number(data.start_price),step:0,maxSteps:Number(data.max_steps),log:[`${meta.name} 시작가 ${money(data.start_price)}${data.listing_fee?` · 수수료 ${money(data.listing_fee)}`:''}`],countdown:0,lastBidAt:Date.now(),timer:null,ending:false};
  await loadProfile();renderSellerAuction();runSellerAuction();
};
runSellerAuction=function(){
  const s=sellerAuction;if(!s)return;clearInterval(s.timer);
  const power=AUCTION_TIER_META_V35[s.tier||'normal'].npcPower;
  s.timer=setInterval(()=>{
    if(!sellerAuction||sellerAuction!==s||s.ending){clearInterval(s.timer);return;}
    if(s.countdown)return;
    const rarityWeight=rarityScore(normalizeRarityV35(s.item.items.rarity)),cond=s.item.condition_score;
    const quality=Math.min(.985,.38+rarityWeight*.075+cond/250+(power-1)*.09);
    const canBid=s.step<s.maxSteps&&Math.random()<quality;
    if(canBid){
      s.step++;
      const jump=(.018+Math.random()*(.024+rarityWeight*.012+cond/3200))*power;
      s.current=Math.round(s.current*(1+jump));
      const bidder=chooseAuctionBidderV386(s.tier||'normal',null,s.lastNpcBidder);
      s.lastNpcBidder=bidder;
      s.log.push(`${bidder} +${money(Math.round(s.current/(1+jump)*jump))}`);renderSellerAuction();
    }else startSellerAuctionCountdown();
  },s.tier==='vvip'?1050:s.tier==='vip'?1250:1550);
};

async function loadAppraisalCenterV37(){
  const host=document.getElementById('appraisalCenterList');
  if(!host)return;
  host.innerHTML='<div class="panel expert-loading">현재 경매품을 불러오는 중...</div>';
  await loadAuctionAccessV35();
  const tiers=['normal'];
  if(auctionAccessV35.vip)tiers.push('vip');
  if(auctionAccessV35.vvip)tiers.push('vvip');
  const groups=[];
  for(const tier of tiers){
    const{data,error}=await db.rpc('get_auction_choices_v35',{p_tier:tier});
    if(error){groups.push({tier,error:error.message,choices:[]});continue;}
    groups.push({tier,choices:Array.isArray(data?.choices)?data.choices:[],refreshAt:data?.refresh_at});
  }
  host.innerHTML=groups.map(group=>{
    const meta=AUCTION_TIER_META_V35[group.tier];
    const cards=group.choices.map(a=>{
      if(a.ended)return `<article class="appraisal-card ended"><div class="appraisal-image">⌛</div><div><b>종료된 경매품</b><small>다음 교체를 기다려 주세요.</small></div></article>`;
      const known=!!a.condition_known;
      const cost=Number(a.appraisal_cost||appraisalCostV35(a.rarity));
      return `<article class="appraisal-card ${rarityClass(a.rarity)}">
        <img src="${itemImage(a.item_name,a.category)}" alt="">
        <div class="appraisal-card-body"><small>${meta.icon} ${meta.name}</small><h3 class="rarity-text ${rarityClass(a.rarity)}">${esc(a.item_name)}</h3><p class="rarity-text ${rarityClass(a.rarity)}">${esc(a.rarity)}</p><strong>${known?`상태 ${a.condition_score}/100`:'상태 미확인'}</strong><button ${known?'disabled':''} onclick="appraiseCatalogItemV37('${group.tier}',${a.cycle_key},${a.slot_no},'${String(a.item_name).replace(/'/g,"\\'")}',${cost})">${known?'✓ 감정 완료':`감정 의뢰 · ${money(cost)}`}</button></div>
      </article>`;
    }).join('');
    return `<section class="appraisal-tier-section"><div class="appraisal-tier-head"><div><b>${meta.icon} ${meta.name}</b><small>가장 높은 등급 출현 확률 10%</small></div></div><div class="appraisal-tier-grid">${cards||'<div class="panel empty-state">감정 가능한 경매품이 없습니다.</div>'}</div></section>`;
  }).join('');
}
async function appraiseCatalogItemV37(tier,cycleKey,slotNo,itemName,cost){
  if(!confirm(`${itemName}의 상태를 ${money(cost)}에 감정할까요?`))return;
  const{data,error}=await db.rpc('appraise_auction_item_v35',{p_cycle_key:cycleKey,p_slot_no:slotNo,p_tier:tier});
  if(error)return toast(error.message);
  toast(`감정 완료 · ${itemName} 상태 ${data.condition_score}/100`);playSuccessSound();
  await Promise.all([loadProfile(),loadAppraisalCenterV37()]);
}

async function loadRestorationCenter(){
  const jobsHost=document.getElementById('restorationJobs'),invHost=document.getElementById('restorationInventory');
  if(!jobsHost||!invHost)return;
  await loadInventory();
  const{data,error}=await db.rpc('get_restoration_jobs_v35');
  if(error){jobsHost.innerHTML=`<div class="panel error-panel">${esc(error.message)}</div>`;return;}
  const jobs=Array.isArray(data)?data:[];
  jobsHost.innerHTML=`<div class="restoration-capacity"><b>복원 작업 슬롯</b><span>${jobs.filter(x=>x.status==='active').length}/3 사용 중</span></div>`+(jobs.map(j=>{
    const ready=Number(j.remaining_seconds)<=0;
    return `<article class="restoration-job ${ready?'ready':''}"><span>${ready?'✨':'🛠️'}</span><div><b>${esc(j.item_name)}</b><small>${esc(j.rarity)} · 복원 전 ${j.old_condition}/100 · 예상 +${j.improve_amount}</small></div><em>${ready?'완료':`${j.remaining_seconds}초`}</em><button ${ready?'':'disabled'} onclick="claimRestorationV35('${j.job_id}')">${ready?'수령':'작업 중'}</button></article>`;
  }).join('')||'<div class="restoration-empty">현재 진행 중인 복원이 없습니다.</div>');
  const activeIds=new Set(jobs.filter(x=>x.status==='active').map(x=>String(x.user_item_id)));
  const available=inventory.filter(x=>!x.is_listed&&!x.restoration_locked&&!activeIds.has(String(x.id))&&Number(x.condition_score)<100);
  invHost.innerHTML=`<h3>복원 가능한 보유품</h3><div class="restoration-grid">${available.map(r=>{
    const cost=restorationCostV35(r),rank=rarityClass(normalizeRarityV35(r.items.rarity));
    return `<article class="restoration-card ${rank}"><img src="${itemImage(r.items.name,r.items.category)}"><div><span class="badge ${rank}">${esc(normalizeRarityV35(r.items.rarity))}</span><b>${esc(r.items.name)}</b><small>현재 상태 ${r.condition_score}/100</small><em>복원비 ${money(cost)}</em></div><button onclick="startRestorationV35('${r.id}')">30초 복원</button></article>`;
  }).join('')||'<div class="restoration-empty">복원할 수 있는 아이템이 없습니다.</div>'}</div>`;
  if(restorationTimerV35)clearTimeout(restorationTimerV35);
  if(jobs.some(x=>x.status==='active'&&Number(x.remaining_seconds)>0))restorationTimerV35=setTimeout(loadRestorationCenter,1000);
}
async function startRestorationV35(id){
  const row=inventory.find(x=>String(x.id)===String(id));if(!row)return;
  const cost=restorationCostV35(row);
  if(!confirm(`${row.items.name}을 ${money(cost)}에 복원할까요? 작업 시간은 30초입니다.`))return;
  const{data,error}=await db.rpc('start_restoration_v35',{p_user_item_id:id});if(error)return toast(error.message);
  toast(`복원 시작 · ${data.improve_amount}점 상승 예정`);await Promise.all([loadProfile(),loadRestorationCenter()]);
}
async function claimRestorationV35(jobId){
  const{data,error}=await db.rpc('claim_restoration_v35',{p_job_id:jobId});if(error)return toast(error.message);
  toast(`복원 완료 · 상태 ${data.old_condition} → ${data.new_condition}`);playSuccessSound();await Promise.all([loadInventory(),loadRestorationCenter()]);
}

const loadNpcOffersV34=loadNpcOffers;
loadNpcOffers=async function(){
  await loadNpcOffersV34();
  document.querySelectorAll('#npcOfferList .market-card').forEach(card=>card.classList.add('rarity-priced-market'));
};

function riskProductCardV35(code,icon,name,min,duration,desc,odds){
  return `<article class="risk-product ${code}"><span>${icon}</span><div><b>${name}</b><small>${desc}</small><em>최소 ${money(min)} · ${duration}초 후 결과</em><p>${odds}</p></div><div class="risk-input"><input id="riskAmount-${code}" type="number" min="${min}" step="1000000" placeholder="투자 금액"><button onclick="startRiskV35('${code}')">투자 실행</button></div></article>`;
}
async function loadRiskDesk(){
  const host=document.getElementById('riskView');if(!host)return;
  const{data,error}=await db.rpc('get_risk_investment_v35');
  if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return;}
  const active=data?.active;
  host.innerHTML=`<div class="risk-warning project-warning"><b>📑 프로젝트 투자</b><p>상가 개발, 대량 재고 매입, 해외 유통 계약처럼 현실에서 가능한 고액 사업에 자금을 투입합니다. 공실·재고 실패·계약 파기 등으로 큰 손실이 날 수 있으며, 결과는 서버에서 시작 순간 확정됩니다.</p><strong>사용 가능 현금 ${money(profile?.cash||0)}</strong></div>`+
  (active?`<article class="risk-active"><div><span>${active.product_icon}</span><b>${esc(active.product_name)}</b><small>투자금 ${money(active.invested_amount)}</small></div><div><em>${active.ready?'정산 가능':`${active.remaining_seconds}초 남음`}</em><button ${active.ready?'':'disabled'} onclick="claimRiskV35()">${active.ready?'정산 결과 확인':'프로젝트 진행 중'}</button></div></article>`:
  `<div class="risk-products">${riskProductCardV35('venture','🏢','상가 리모델링 공동투자',10000000,60,'노후 상가를 매입·리모델링한 뒤 임대 또는 매각합니다.','공실·공사비 초과 위험 · 최대 4.5배')}${riskProductCardV35('futures','📦','대량 재고 선매입 계약',50000000,45,'유행 상품을 도매가로 대량 매입해 유통 마진을 노립니다.','재고 폭락 위험 · 최대 6배')}${riskProductCardV35('takeover','🚢','해외 독점 유통권 계약',200000000,90,'해외 브랜드의 국내 독점 유통권을 확보해 대형 계약을 추진합니다.','계약 파기·환율 위험 · 최대 8배')}</div>`);
  if(riskTimerV35)clearTimeout(riskTimerV35);
  if(active&&!active.ready)riskTimerV35=setTimeout(loadRiskDesk,1000);
}
async function startRiskV35(code){
  const amount=Math.floor(Number(document.getElementById(`riskAmount-${code}`)?.value||0));
  if(amount<=0)return toast('투자 금액을 입력하세요.');
  if(!confirm(`${money(amount)}을 투자할까요? 원금 전액 손실 가능성이 있습니다.`))return;
  const{data,error}=await db.rpc('start_risk_investment_v35',{p_product:code,p_amount:amount});if(error)return toast(error.message);
  toast('프로젝트 투자가 시작되었습니다. 결과는 서버에 안전하게 저장되었습니다.');await Promise.all([loadProfile(),loadRiskDesk()]);
}
async function claimRiskV35(){
  const{data,error}=await db.rpc('claim_risk_investment_v35');if(error)return toast(error.message);
  const profit=Number(data.payout)-Number(data.invested_amount);
  toast(`${data.result_label} · ${profit>=0?'+':''}${money(profit)}`);profit>=0?playSuccessSound():playClickSound();await Promise.all([loadProfile(),loadRiskDesk()]);updateNetworth();
}

const openPhoneAppV34Risk=openPhoneApp;
openPhoneApp=function(name){
  openPhoneAppV34Risk(name);
  if(name==='risk')loadRiskDesk();
};

const loadInventoryV34Restoration=loadInventory;
loadInventory=async function(){
  const result=await loadInventoryV34Restoration();
  return result;
};


/* ============================================================
   v38 STOCK/PROJECT/OWNED EXPERT SERVICE FIXES
   ============================================================ */
function stableStockSeedV38(symbol){return [...String(symbol||'STK')].reduce((a,c)=>((a*31+c.charCodeAt(0))>>>0),2166136261)>>>0}
function normalizedStockHistoryV38(st){
  let a=[];try{a=Array.isArray(st.history)?st.history:JSON.parse(st.history||'[]')}catch{}
  a=a.map(Number).filter(Number.isFinite);const cur=Number(st.current_price||0),prev=Number(st.previous_price||cur);
  const flat=a.length<5||Math.max(...a)-Math.min(...a)<Math.max(cur*.001,1);
  if(flat){let seed=stableStockSeedV38(st.symbol),v=prev||cur; a=[];for(let i=0;i<18;i++){seed=(seed*1664525+1013904223)>>>0;const drift=((seed/4294967296)-.48)*.012;v=Math.max(1,Math.round(v*(1+drift)));a.push(v)}a[a.length-2]=prev;a[a.length-1]=cur;}
  else {while(a.length&&a.at(-1)===cur)a.pop();a.push(prev,cur)}
  return a.slice(-32);
}
loadStocks=async function(){
 const[{data:s},{data:h}]=await Promise.all([db.from('stocks').select('id,symbol,name,current_price,previous_price,history').eq('is_active',true).order('current_price',{ascending:false}),db.from('stock_holdings').select('*').eq('user_id',currentUser.id)]);
 stocks=s||[];holdings=h||[];renderSpendableFundsCard('stockSpendableFunds',spendableCash(),'주식 매수에 즉시 사용할 수 있는 금액');let total=0,profit=0;
 stockList.innerHTML=stocks.map(st=>{const hd=holdings.find(x=>x.stock_id===st.id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),prev=Number(st.previous_price),r=prev?(cur-prev)/prev*100:0,val=q*cur,p=val-q*avg;total+=val;profit+=p;return `<button class="stock-row" onclick="openStockDetail('${st.id}')"><div class="stock-name"><b>${esc(st.name)}</b><small>${esc(st.symbol)} · ${q}주</small></div><div class="stock-price"><b>${money(cur)}</b><small>현재가</small></div>${stockSvg(normalizedStockHistoryV38(st),95,40,true)}<b class="stock-rate ${r>=0?'up':'down'}">${r>=0?'+':''}${r.toFixed(2)}%</b></button>`}).join('');stockValue.textContent=money(total);stockProfit.textContent=(profit>=0?'+':'')+money(profit);stockProfit.className=profit>=0?'up':'down';if(selectedStock)renderStockDetail(selectedStock);renderWallet();
};
renderStockDetail=function(id){const st=stocks.find(x=>x.id===id);if(!st)return;const hd=holdings.find(x=>x.stock_id===id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),hist=normalizedStockHistoryV38(st),val=q*cur,p=val-q*avg,cash=spendableCash(),maxBuy=cur>0?Math.floor(cash/cur):0;stockDetail.innerHTML=`<div class="detail-spendable"><span>실제 사용 가능 현금</span><b>${money(cash)}</b><small>현재가 기준 최대 ${maxBuy.toLocaleString('ko-KR')}주 매수 가능</small></div><div class="stock-detail-head"><h2>${esc(st.name)}</h2><strong>${money(cur)}</strong><small>현재가</small></div>${stockSvg(hist,340,220,false)}<div class="metrics"><div>보유 <b>${q}주</b></div><div>평균 <b>${q?money(avg):'-'}</b></div><div>평가액 <b>${money(val)}</b></div><div>손익 <b class="${p>=0?'up':'down'}">${p>=0?'+':''}${money(p)}</b></div></div><div class="trade"><input id="qty-${id}" type="number" min="1" value="1"><button class="buy" onclick="tradeStock('${id}','buy')">매수</button><button class="sell" onclick="tradeStock('${id}','sell')">매도</button></div>`};

async function loadOwnedAppraisalV38(){
 const host=document.getElementById('ownedAppraisalList');if(!host)return;host.innerHTML='<div class="bank-loading">보유품을 불러오는 중...</div>';await loadInventory();
 const{data:known,error}=await db.from('user_item_appraisals_v38').select('user_item_id').eq('user_id',currentUser.id);if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}const set=new Set((known||[]).map(x=>String(x.user_item_id)));
 host.innerHTML=`<div class="expert-phone-notice">감정료는 등급이 높을수록 크게 증가합니다. 감정 완료 후 실제 상태가 공개됩니다.</div>`+inventory.filter(x=>!x.is_listed).map(r=>{const c=appraisalCostV35(r.items.rarity),k=set.has(String(r.id)),rc=rarityClass(normalizeRarityV35(r.items.rarity));return `<article class="owned-expert-card"><img src="${itemImage(r.items.name,r.items.category)}"><div><b class="rarity-text ${rc}">${esc(r.items.name)}</b><small class="rarity-text ${rc}">${esc(normalizeRarityV35(r.items.rarity))}</small><em>${k?`상태 ${r.condition_score}/100`:'상태 미감정'}</em></div><button ${k?'disabled':''} onclick="appraiseOwnedItemV38('${r.id}',${c})">${k?'감정 완료':`감정 ${money(c)}`}</button></article>`}).join('')||'<div class="restoration-empty">감정할 보유품이 없습니다.</div>';
}
async function appraiseOwnedItemV38(id,cost){if(!confirm(`이 아이템을 ${money(cost)}에 감정할까요?`))return;const{data,error}=await db.rpc('appraise_owned_item_v38',{p_user_item_id:id});if(error)return toast(error.message);toast(`감정 완료 · 상태 ${data.condition_score}/100`);await Promise.all([loadProfile(),loadOwnedAppraisalV38()])}

const openPhoneAppV38=openPhoneApp;openPhoneApp=function(name){openPhoneAppV38(name);if(name==='appraisal')loadOwnedAppraisalV38();if(name==='restoration')loadRestorationCenter()};

loadRiskDesk=async function(){const host=document.getElementById('riskView');if(!host)return;const{data,error}=await db.rpc('get_risk_investment_v35');if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}const active=data?.active;const products=[
['venture','🏢','상가 리모델링 공동투자',10000000,60,'노후 상가를 개선해 임대·매각','공실·공사비 위험 · 최대 4.5배'],['futures','📦','대량 재고 선매입 계약',50000000,45,'유행 상품을 도매가로 선매입','재고 폭락 위험 · 최대 6배'],['takeover','🚢','해외 독점 유통권 계약',200000000,90,'해외 브랜드 국내 독점권 확보','계약 파기 위험 · 최대 8배'],['redevelop','🏗️','도심 재개발 지분 투자',300000000,120,'정비사업 지분을 선매입','사업 지연·분담금 위험 · 최대 7배'],['hotel','🏨','관광호텔 리뉴얼 펀드',500000000,100,'노후 호텔을 리브랜딩','객실 가동률 위험 · 최대 6.5배'],['logistics','🚚','물류센터 개발 프로젝트',800000000,110,'대형 임차인을 유치하는 물류센터 개발','공실·금리 위험 · 최대 7.5배'],['film','🎬','대형 콘텐츠 제작 투자',1000000000,75,'영화·드라마 제작비 공동 투자','흥행 실패 위험 · 최대 10배'],['datacenter','🖥️','데이터센터 건설 컨소시엄',2000000000,150,'전력 계약과 장기 임차를 기반으로 개발','인허가·전력비 위험 · 최대 9배']];host.innerHTML=`<div class="risk-warning project-warning"><b>📑 프로젝트 투자</b><p>현실적인 개발·유통·콘텐츠 사업에 투자합니다. 성공 시 큰 수익이 있지만 지연, 공실, 흥행 실패로 원금 대부분을 잃을 수 있습니다.</p><strong>사용 가능 현금 ${money(profile?.cash||0)}</strong></div>`+(active?`<article class="risk-active"><div><span>${active.product_icon}</span><b>${esc(active.product_name)}</b><small>투자금 ${money(active.invested_amount)}</small></div><div><em>${active.ready?'정산 가능':`${active.remaining_seconds}초 남음`}</em><button ${active.ready?'':'disabled'} onclick="claimRiskV35()">${active.ready?'정산 결과 확인':'프로젝트 진행 중'}</button></div></article>`:`<div class="risk-products">${products.map(x=>riskProductCardV35(...x)).join('')}</div>`);if(riskTimerV35)clearTimeout(riskTimerV35);if(active&&!active.ready)riskTimerV35=setTimeout(loadRiskDesk,1000)};

// 출품 탭에서도 입장권이 없는 경매장은 선택/출품 불가
fillAuctionSellItems=function(){const select=document.getElementById('auctionSellItem');if(!select)return;const tier=document.getElementById('auctionSellTier')?.value||auctionTierV35||'normal',meta=AUCTION_TIER_META_V35[tier],unlocked=tier==='normal'||!!auctionAccessV35[tier],previous=select.value;select.innerHTML='<option value="">'+(unlocked?'출품할 아이템 선택':`${meta.name} 입장권을 먼저 구매하세요`)+'</option>';const available=unlocked?inventory.filter(x=>!x.is_listed&&!x.restoration_locked&&rarityScore(normalizeRarityV35(x.items.rarity))>=meta.minRarity):[];available.forEach(x=>select.add(new Option(`${x.items.name} · ${normalizeRarityV35(x.items.rarity)} · 상태 ${x.condition_score}`,x.id)));if(available.some(x=>String(x.id)===String(previous)))select.value=previous;select.disabled=!unlocked;const button=select.closest('.auction-seller')?.querySelector('button');if(button)button.disabled=!unlocked||!available.length};

/* ============================================================
   v38.3 HIDDEN CONDITION + CONDITION-BASED ECONOMY
   ============================================================ */
function conditionMultiplierV383(score){
  const s=Math.max(1,Math.min(100,Number(score||1)));
  if(s>=95)return 1.45;
  if(s>=85)return 1.25;
  if(s>=70)return 1.00;
  if(s>=55)return .78;
  if(s>=40)return .58;
  if(s>=25)return .40;
  return .22;
}
function conditionLabelV383(score){const s=Number(score||0);return s>=95?'최상':s>=85?'매우 좋음':s>=70?'좋음':s>=55?'보통':s>=40?'사용감 있음':s>=25?'손상 있음':'심각한 손상'}

// NPC 중고장터: 구매 전 상태 완전 비공개
loadNpcOffers=async function(){
  const{data:cycle,error:gerr}=await db.rpc('generate_npc_purchase_offers_v23');
  if(gerr)return toast(gerr.message);
  const{data,error}=await db.from('npc_purchase_offers')
    .select(`id,asking_price,min_price,expires_at,items(id,name,category,rarity,average_price)`)
    .eq('user_id',currentUser.id).eq('status','active')
    .gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});
  if(error)return toast(error.message);
  npcOfferList.innerHTML=`<div id="marketRotationBanner" class="rotation-banner market-rotation"><div><b>중고 매물 라인업</b><small>실제 상태는 구매 후 전문 감정소에서만 확인할 수 있습니다.</small></div><strong>다음 교체 <span>--:--</span></strong></div>`+
    ((data||[]).map(o=>{const p=getNpcMarketPersona(o.id),rc=rarityClass(normalizeRarityV35(o.items.rarity));return `<article class="market-card npc-buy-card npc-theme-${p.theme}">
      <div class="npc-seller-strip"><span class="npc-mini-avatar">${p.face}</span><div><b>${esc(p.name)}</b><small>${esc(p.role)} · ${esc(p.temperament)}</small></div></div>
      <div class="item-image"><img src="${itemImage(o.items.name,o.items.category)}"></div>
      <div class="market-body"><h3 class="rarity-text ${rc}">${esc(o.items.name)}</h3><div class="meta rarity-text ${rc}">${esc(normalizeRarityV35(o.items.rarity))}</div><div class="meta hidden-condition-v383">🔒 상태 미감정 · 구매 후 감정소에서 확인</div><div class="price">판매가 ${money(o.asking_price)}</div><small class="market-hint">${esc(p.preview)}</small><button class="btn primary full" onclick="startNpcOffer('${o.id}')">${esc(p.name)}와 흥정</button></div>
    </article>`}).join('')||'<div class="panel" style="padding:20px">현재 NPC 판매 상품이 없습니다.</div>');
  if(cycle?.refresh_at)startRotationCountdown('market',cycle.refresh_at,'marketRotationBanner',loadNpcOffers);
};

// 유저 중고나라: 구매자에게 상태를 숨기고, 판매자 본인에게만 상태와 기준가 표시
loadMarket=async function(){
  const{data,error}=await db.from('market_listings').select(`id,title,asking_price,seller_user_id,user_items(condition_score,items(category,average_price,rarity)),profiles:seller_user_id(nickname)`).eq('status','active').order('created_at',{ascending:false});
  if(error)return toast(error.message);
  marketList.innerHTML=(data||[]).map(r=>{const mine=r.seller_user_id===currentUser.id,ui=r.user_items,avg=Number(ui?.items?.average_price||0),fair=Math.round(avg*conditionMultiplierV383(ui?.condition_score));const rc=rarityClass(normalizeRarityV35(ui?.items?.rarity));return `<article class="market-card"><div class="item-image"><img src="${itemImage(r.title,ui?.items?.category)}"></div><div class="market-body"><h3 class="rarity-text ${rc}">${esc(r.title)}</h3><div class="meta">${esc(r.profiles?.nickname||'유저')}</div><div class="meta ${mine?'':'hidden-condition-v383'}">${mine?`상태 ${ui?.condition_score||'-'}/100 · 적정가 ${money(fair)}`:'🔒 상태 비공개 · 구매 후 감정 가능'}</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?'light':'primary'} full" onclick="${mine?`cancelListing('${r.id}')`:`buyListing('${r.id}')`}">${mine?'판매 취소':'구매'}</button></div></article>`}).join('')||'<div class="panel" style="padding:20px">매물이 없습니다.</div>';
};

// 판매 아이템 선택 시 상태를 반영한 권장가 자동 표시
fillItemSelect=function(){
  sellItem.innerHTML='<option value="">판매할 아이템</option>';
  inventory.filter(x=>!x.is_listed&&!x.restoration_locked).forEach(x=>{const fair=Math.round(Number(x.items.average_price||0)*conditionMultiplierV383(x.condition_score));sellItem.add(new Option(`${x.items.name} · 상태 ${x.condition_score} · 권장 ${money(fair)}`,x.id))});
  sellItem.onchange=()=>{const r=inventory.find(x=>String(x.id)===String(sellItem.value));if(r&&sellPrice){sellPrice.value=Math.max(1,Math.round(Number(r.items.average_price||0)*conditionMultiplierV383(r.condition_score)));sellPrice.placeholder=`상태 반영 권장가 ${money(Number(sellPrice.value))}`}};
};

// 전당포: 상태에 따른 실질 감가/프리미엄을 명확히 표시
loadPawnshop=async function(){
  await loadInventory();
  pawnshopList.innerHTML=inventory.filter(x=>!x.is_listed&&!x.restoration_locked).map(r=>{const avg=Number(r.items.average_price||0),v=Math.round(avg*conditionMultiplierV383(r.condition_score)),diff=v-avg;return `<article class="item-card"><div class="item-image"><img src="${itemImage(r.items.name,r.items.category)}"></div><div class="item-body"><h3 class="rarity-text ${rarityClass(normalizeRarityV35(r.items.rarity))}">${esc(r.items.name)}</h3><div class="meta">상태 ${r.condition_score}/100 · ${conditionLabelV383(r.condition_score)}</div><div class="price">즉시 매입가 ${money(v)}</div><small class="condition-price-note ${diff>=0?'up':'down'}">평균 원가 대비 ${diff>=0?'+':''}${money(diff)}</small><div class="item-actions"><button class="btn light" onclick="pawnSell('${r.id}','instant',100)">즉시 판매</button><button class="btn primary" onclick="startPawnNegotiation('${r.id}')">흥정 판매</button></div></div></article>`}).join('')||'<div class="panel" style="padding:20px">판매할 아이템이 없습니다.</div>';
};

// 보유 자산 평가도 같은 상태 가격 공식을 사용
itemValue=function(price,score){return Math.round(Number(price||0)*conditionMultiplierV383(score))};
