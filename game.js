const SUPABASE_URL="https://qazjtevdljthbzmqmgrw.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_rIARlWBpKPvFAv_TtTdgaQ_Po-hOGmX";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let authMode="login",currentUser=null,profile=null,inventory=[],stocks=[],holdings=[],collectibles=[],effects={},explore=null,auction=null,auctionChoices=[],sellerAuction=null,negotiation=null,job=null,selectedStock=null,toastTimer=null,realtime=null,negotiationSkills={},collectiblePage=1,casePage=1,decorationPage=1,chatBusy=false,auctionRotationTimer=null,marketRotationTimer=null,stockTickerTimer=null,chatRefreshTimer=null,appraisedItemIds=new Set();

document.addEventListener("DOMContentLoaded",()=>{init();initPremiumUI()});
document.addEventListener("input",e=>{
  if(e.target?.matches?.("#nickname,#email,#password")){
    e.target.classList.remove("input-error");
    if(authMsg)authMsg.textContent="";
  }
});

async function init(){
  updatePhoneTime();setInterval(updatePhoneTime,30000);
  const{data:{session}}=await db.auth.getSession();
  if(session?.user){currentUser=session.user;await enterGame()}else showAuth();
  db.auth.onAuthStateChange((_e,s)=>currentUser=s?.user||null);
}
function setAuthMode(m){
  authMode=m;
  nicknameWrap.classList.toggle("hidden",m!=="signup");
  loginTab.classList.toggle("active",m==="login");
  signupTab.classList.toggle("active",m==="signup");
  authBtn.textContent=m==="login"?"로그인":"회원가입";
  authMsg.textContent="";
  nickname.classList.remove("input-error");
  email.classList.remove("input-error");
  password.classList.remove("input-error");
}
function showAuthValidation(message,input){
  authMsg.textContent=message;
  [nickname,email,password].forEach(el=>el?.classList.remove("input-error"));
  if(input){input.classList.add("input-error");input.focus();}
}
async function submitAuth(){
  const nick=nickname.value.trim(),mail=email.value.trim(),pw=password.value;
  if(authMode==="signup"&&nick.length<2){showAuthValidation("닉네임은 최소 2글자 이상 입력해 주세요.",nickname);return}
  if(authMode==="signup"&&nick.length>12){showAuthValidation("닉네임은 최대 12글자까지 사용할 수 있습니다.",nickname);return}
  if(!mail){showAuthValidation("이메일을 입력해 주세요.",email);return}
  if(!email.checkValidity()){showAuthValidation("올바른 이메일 형식으로 입력해 주세요.",email);return}
  if(pw.length<6){showAuthValidation("비밀번호는 최소 6글자 이상 입력해 주세요.",password);return}
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
function openPage(name,btn){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));document.getElementById("page-"+name).classList.add("active");btn?.classList.add("active");if(name==="collection"){collectiblePage=1;casePage=1;decorationPage=1;}({inventory:loadInventory,pawnshop:loadPawnshop,auction:loadAuctionLobby,appraisal:loadAppraisalCenterV37,restoration:loadRestorationCenter,market:loadMarketHub,house:loadHouse,collection:loadCollectibles,jobs:resetJobPage}[name]||(()=>{}))()}
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
  market_data:{name:"시세 분석",icon:"📊",cost:1,desc:"시세 자료 제시 사용 가능",requires:null,minReputation:0},
  storytelling:{name:"가치 스토리텔링",icon:"✨",cost:1,desc:"가치와 사연 강조 사용 가능",requires:null,minReputation:0},
  quick_deal:{name:"즉시 거래 유도",icon:"💵",cost:2,desc:"현금 즉시 거래 전략 사용 가능",requires:"market_data",minReputation:50},
  silence_pressure:{name:"침묵의 압박",icon:"🤐",cost:3,desc:"말없이 기다려 NPC의 재제안을 유도",requires:"storytelling",minReputation:100},
  walkaway:{name:"협상 결렬 압박",icon:"🚪",cost:4,desc:"다른 곳에 팔겠다는 최후통첩",requires:"silence_pressure",minReputation:250},
  price_anchor:{name:"가격 앵커링",icon:"🧲",cost:7,desc:"높은 기준 가격을 먼저 제시해 협상 범위를 끌어올림",requires:"walkaway",minReputation:500},
  master_close:{name:"최종 합의 설계",icon:"🏁",cost:12,desc:"상대의 마지막 양보를 끌어내는 고급 마무리 협상",requires:"price_anchor",minReputation:1000}
};
function hasHaggleSkill(code){
  const value=negotiationSkills?.[code];
  return value===true||value==='true'||value===1||value==='1';
}
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
    {code:"walkaway",skill:"walkaway",icon:"🚪",name:"다른 곳에 팔겠다고 압박",desc:"고위험 · 성공 시 큰 폭 인상"},
    {code:"anchor",skill:"price_anchor",icon:"🧲",name:"높은 기준가로 앵커링",desc:"고급 기술 · 협상 상한선을 강하게 압박"},
    {code:"master_close",skill:"master_close",icon:"🏁",name:"최종 합의 설계",desc:"최종 기술 · 성공 시 가장 큰 양보를 유도"}
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
    walkaway:{risk:.48,power:1.0,cost:2,label:"다른 구매자에게 팔겠다며 협상 결렬을 압박했다."},
    anchor:{risk:.36,power:1.16,cost:2,label:"높은 시장 기준가를 먼저 제시해 협상 범위를 끌어올렸다."},
    master_close:{risk:.30,power:1.34,cost:2,label:"지금 합의할 수 있는 최종 조건을 정교하게 제시했다."}
  };
  const cfg=configs[style]||configs.polite;
  if(style!=='polite'){const need={evidence:'market_data',story:'storytelling',cash:'quick_deal',silence:'silence_pressure',walkaway:'walkaway',anchor:'price_anchor',master_close:'master_close'}[style];if(need&&!hasHaggleSkill(need))return toast('해당 협상 스킬을 먼저 해금하세요.')}
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
function caseThemeKey(name=''){
  const n=String(name||'');
  if(/프리즘|오리진|레인보우|무지개/i.test(n))return 'prism';
  if(/크림슨|렐릭|홍염|불꽃|레드/i.test(n))return 'crimson';
  if(/골드|골든|크라운|황금/i.test(n))return 'gold';
  if(/아메시스트|오로라|퍼플|보라/i.test(n))return 'aurora';
  if(/라임|펄스|그린|초록/i.test(n))return 'lime';
  if(/오션|블루|바다|파도/i.test(n))return 'ocean';
  if(/네온|시티|도시|사이버/i.test(n))return 'neon';
  if(/스톤|그레이|그래파이트|회색/i.test(n))return 'stone';
  return 'default';
}

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
function switchCollectionTab(name,btn){document.querySelectorAll('.collection-tabs button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.collection-tab-panel').forEach(x=>x.classList.add('hidden'));btn?.classList.add('active');document.getElementById('collection-'+name)?.classList.remove('hidden');if(name==='decor'){collectiblePage=1;renderCollectiblePages();}else if(name==='case'){casePage=1;renderCasePages();}}
function updateGachaButtons(){const poor=!profile||Number(profile.cash)<300000;['decorGachaBtn','caseGachaBtn'].forEach(id=>{const b=document.getElementById(id);if(!b)return;b.disabled=poor;b.title=poor?'현금 30만원이 필요합니다.':'';});}
async function drawCollectible(type){if(!profile||Number(profile.cash)<300000){updateGachaButtons();return toast('뽑기에는 현금 30만원이 필요합니다.')}const btn=document.getElementById(type==='phone_case'?'caseGachaBtn':'decorGachaBtn');if(btn?.disabled)return;btn.disabled=true;const modal=document.getElementById('gachaModal');modal.classList.remove('hidden');modal.className='overlay gacha-spinning rarity-0';gachaRarity.textContent='두근두근...';gachaResultIcon.textContent=type==='phone_case'?'📱':'🏺';gachaResultName.textContent='캡슐 개봉 중';gachaResultName.className='';gachaResultEffect.textContent='빛이 강해집니다';playGachaBuild();await wait(1700);const{data,error}=await db.rpc('draw_collectible_v19',{p_type:type});if(error){closeGachaReveal();btn.disabled=false;updateGachaButtons();return toast(error.message)}const rank=rarityScore(data.rarity);modal.className=`overlay gacha-reveal rarity-${rank}`;gachaRarity.textContent=data.rarity;gachaResultIcon.textContent=data.icon||'✨';gachaResultName.textContent=data.name;gachaResultName.className=`rarity-text ${rarityClass(data.rarity)}`;gachaResultEffect.textContent=`${collectibleEffectLabel(data.effect_code,data.effect_name)} +${Number(data.effect_percent||0)}%`;rank>=4?playJackpotSound():playSuccessSound();await Promise.all([loadProfile(),loadCollectibles()]);updateNetworth();updateGachaButtons()}
function closeGachaReveal(){gachaModal.className='overlay hidden'}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function loadCollectibles(){
  const rows=[];
  const pageSize=1000;
  for(let from=0;;from+=pageSize){
    const{data,error}=await db.from('user_collectibles')
      .select(`id,is_equipped,is_placed,is_listed,acquired_at,collectibles(id,name,type,rarity,effect_code,effect_name,effect_percent,icon)`)
      .eq('user_id',currentUser.id)
      .order('acquired_at',{ascending:false})
      .range(from,from+pageSize-1);
    if(error)return toast(error.message);
    rows.push(...(data||[]));
    if(!data||data.length<pageSize)break;
  }
  collectibles=rows.map(r=>{
    if(r.collectibles?.rarity==='영웅')r.collectibles.rarity='진귀';
    if(r.collectibles){
      r.collectibles.effect_name=collectibleEffectLabel(r.collectibles.effect_code,r.collectibles.effect_name);
      r.collectibles.effect_percent=Number(r.collectibles.effect_percent||0);
    }
    return r;
  });

  const savedCaseId=String(profile?.equipped_phone_case_id||'');
  const equippedRow=collectibles.find(x=>String(x.id)===savedCaseId&&x.collectibles.type==='phone_case')||collectibles.find(x=>x.is_equipped&&x.collectibles.type==='phone_case');
  const equippedGroup=equippedRow?getGroupedCollectibles('phone_case').find(g=>g.rows.some(r=>r.id===equippedRow.id)):getGroupedCollectibles('phone_case').find(g=>g.equippedCount>0);
  const eqEl=document.getElementById('equippedCase');
  if(eqEl)eqEl.innerHTML=equippedGroup?groupedCollectibleRow(equippedGroup,{mode:'equipped'}):'<p class="muted">장착 케이스 없음</p>';

  try{ renderCollectiblePages(); }catch(error){ console.error('소장품 목록 렌더링 실패:',error); }
  try{ renderCasePages(); }catch(error){ console.error('케이스 목록 렌더링 실패:',error); }
  try{ applyPhoneCase(equippedRow); }catch(error){ console.error('케이스 테마 적용 실패:',error); }
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
  const theme=isCase?caseThemeKey(c.name):'';

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
    const canPlace=group.rows.some(r=>!r.is_placed&&!r.is_listed);
    const canUnplace=group.rows.some(r=>r.is_placed);
    const placeLabel=group.placedCount>0?'추가 배치':'배치';
    button=`<div class="collectible-actions">
      ${canPlace?`<button class="btn light" onclick="equipGroupedCollectible('${escAttr(String(c.id))}','place')">${placeLabel}</button>`:''}
      ${canUnplace?`<button class="btn unplace" onclick="equipGroupedCollectible('${escAttr(String(c.id))}','unplace')">1개 해제</button>`:''}
      ${!canPlace&&!canUnplace?'<button class="btn light" disabled>사용 불가</button>':''}
    </div>`;
  }

  return `<div class="collectible ${rc} ${isCase?'case-collectible':'decoration-collectible'}" ${isCase?`data-case-theme="${theme}" data-rarity="${rarityScore(c.rarity)}"`:''}>
    <div class="collectible-main">
      <div class="collectible-title-row">
        <span class="collectible-icon">${c.icon}</span>
        <b class="rarity-text ${rc}">${esc(c.name)}</b>
        ${countBadge}
      </div>
      <small><span class="rarity-text ${rc}">${esc(c.rarity)}</span> · ${esc(collectibleEffectText(c))} ${state}</small>
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
  let start=(collectiblePage-1)*pageSize;
  if(list.length>0&&start>=list.length){collectiblePage=1;start=0;}
  const pageRows=list.slice(start,start+pageSize);
  const el=document.getElementById('collectibleInventory');
  if(el)el.innerHTML=pageRows.map(group=>groupedCollectibleRow(group)).join('')||(list.length?'<p class="muted">이 페이지에 표시할 소장품이 없어 1페이지로 이동했습니다.</p>':'<p class="muted">소장품 없음</p>');
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
  let start=(casePage-1)*pageSize;
  if(list.length>0&&start>=list.length){casePage=1;start=0;}
  const pageRows=list.slice(start,start+pageSize);
  const el=document.getElementById('caseInventory');
  if(el)el.innerHTML=pageRows.map(group=>groupedCollectibleRow(group)).join('')||(list.length?'<p class="muted">이 페이지에 표시할 케이스가 없어 1페이지로 이동했습니다.</p>':'<p class="muted">보유 케이스 없음</p>');
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
  const theme=caseThemeKey(name);
  shell.dataset.case=name;
  shell.dataset.caseTheme=theme;
  shell.dataset.rarity=String(rarityScore(rarity));
  home.dataset.wallpaper=name;
  home.dataset.wallpaperTheme=theme;
  home.dataset.rarity=String(rarityScore(rarity));
  if(owner)owner.textContent=profile?.nickname||'판매왕';
}
function fillCollectibleSelect(){
  sellCollectible.innerHTML='<option value="">판매할 소장품</option>';
  collectibles.filter(x=>!x.is_equipped&&!x.is_placed&&!x.is_listed).forEach(x=>{
    const c=x.collectibles;
    const option=new Option(`[${c.rarity}] ${c.name} · ${collectibleEffectText(c)}`,x.id);
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
  host.innerHTML=`<div class="sell-preview-icon">${c.icon}</div><div><b class="rarity-text ${rc}">${esc(c.name)}</b><small><span class="rarity-text ${rc}">${esc(c.rarity)}</span> · ${esc(collectibleEffectText(c))}</small></div>`;
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
      <div class="market-body"><div class="collectible-market-seller">${mine?'내 매물':esc(r.profiles?.nickname||'유저의 매물')}</div><h3 class="rarity-text ${rc}">${esc(c.name)}</h3><div class="meta"><span class="rarity-chip ${rc}">${esc(c.rarity)}</span> · ${esc(collectibleEffectText(c))}</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?'light':'primary'} full" onclick="${mine?`cancelCollectible('${r.id}')`:`buyCollectible('${r.id}')`}">${mine?'판매 취소':'구매'}</button></div>
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
function houseSceneMarkup(tier){
  const scenes={
    basement:`<div class="room-ambience"></div><div class="basement-window"><span class="street-shadow"></span><i>☀️</i></div><div class="wall-pipe pipe-a"></div><div class="wall-pipe pipe-b"></div><div class="utility-box">⚡</div><div class="small-shelf"><span>📚</span><span>🪴</span></div><div class="floor-rug"></div><div class="room-lamp">💡</div>`,
    studio:`<div class="room-ambience"></div><div class="wide-window"><span class="city-silhouette"></span><i>☀️</i></div><div class="studio-bed"><span>🛏️</span></div><div class="studio-desk"><span>💻</span><i>🪴</i></div><div class="floor-rug"></div><div class="ceiling-light"></div>`,
    apartment:`<div class="room-ambience"></div><div class="panorama-window"><span class="city-silhouette"></span><i>🌤️</i></div><div class="sofa-set"><span>🛋️</span><i>☕</i></div><div class="media-wall">📺</div><div class="display-console"></div><div class="floor-rug luxury"></div><div class="ceiling-light modern"></div>`,
    penthouse:`<div class="room-ambience"></div><div class="skyline-window"><span class="night-city"></span><i>🌙</i></div><div class="penthouse-sofa">🛋️</div><div class="marble-table"><span>🥂</span></div><div class="art-wall">🖼️</div><div class="designer-lamp">💡</div><div class="floor-rug luxury"></div><div class="ceiling-light chandelier">✦</div>`,
    mansion:`<div class="room-ambience"></div><div class="mansion-window left"><i>🌳</i></div><div class="mansion-window right"><i>🌳</i></div><div class="grand-fireplace"><span>🔥</span></div><div class="grand-sofa">🛋️</div><div class="pedestal left"></div><div class="pedestal right"></div><div class="floor-rug royal"></div><div class="ceiling-light chandelier grand">✦</div><div class="wall-column col-a"></div><div class="wall-column col-b"></div>`,
    country_villa:`<div class="room-ambience"></div><div class="villa-glass lake"><span>🌊</span><i>🌲</i></div><div class="villa-sofa">🛋️</div><div class="stone-fireplace">🔥</div><div class="indoor-tree">🌿</div><div class="floor-rug luxury"></div>`,
    sky_residence:`<div class="room-ambience"></div><div class="sky-residence-window"><span class="night-city"></span><i>✈️</i></div><div class="floating-sofa">🛋️</div><div class="glass-table">🥂</div><div class="digital-art">◈</div><div class="ceiling-light chandelier">✦</div>`,
    hanok_estate:`<div class="room-ambience"></div><div class="hanok-window"><span>🎋</span><i>🌸</i></div><div class="hanok-table">🍵</div><div class="folding-screen">🏞️</div><div class="paper-lamp">🏮</div><div class="floor-rug hanji"></div>`,
    island_villa:`<div class="room-ambience"></div><div class="island-window"><span>🌊</span><i>🌴</i></div><div class="island-lounge">🛋️</div><div class="pool-edge">💧</div><div class="sunset-art">🌅</div><div class="floor-rug sand"></div>`,
    art_palace:`<div class="room-ambience"></div><div class="palace-arch left"></div><div class="palace-arch right"></div><div class="gallery-wall">🖼️</div><div class="museum-bench">🪑</div><div class="marble-statue">🏺</div><div class="ceiling-light chandelier grand">✦</div>`,
    legacy_castle:`<div class="room-ambience"></div><div class="castle-window"><span>🌌</span></div><div class="throne">👑</div><div class="legacy-vault">🔐</div><div class="grand-fireplace"><span>🔥</span></div><div class="royal-banner left">⚜</div><div class="royal-banner right">⚜</div><div class="floor-rug royal"></div>`
  };
  return scenes[tier]||scenes.basement;
}
async function loadHouse(){decorationPage=1;await Promise.all([loadProfile(),loadCollectibles(),loadEffects()]);const cap=Number(profile.house_capacity||1),placed=collectibles.filter(x=>x.is_placed&&x.collectibles.type==='decoration').slice(0,cap),tier=profile.property_tier||'basement';houseCapacityText.textContent=`${profile.property_name||'반지하'} · 장식 ${placed.length}/${cap}개 배치`;houseRoom.dataset.property=tier;houseRoom.innerHTML=`<div class="house-scene">${houseSceneMarkup(tier)}<div id="placedDecorations" class="placed-decorations">${placed.map((r,i)=>`<div class="placed slot-${i}"><span>${r.collectibles.icon}</span></div>`).join('')}</div><div class="room-vignette"></div></div>`;houseEffects.innerHTML=Object.entries(effects).map(([k,v])=>`<div class="effect"><span>${effectName(k)}</span><b>+${Number(v).toFixed(1)}%</b></div>`).join('')||'<p class="muted">활성 효과 없음</p>';renderDecorationPages()}
function renderDecorationPages(){
  const list=getGroupedCollectibles('decoration');
  const totalOwned=collectibles.filter(x=>x.collectibles?.type==='decoration').length;
  const pageSize=4;
  const total=Math.max(1,Math.ceil(list.length/pageSize));
  decorationPage=Math.min(Math.max(1,decorationPage),total);
  let start=(decorationPage-1)*pageSize;
  if(list.length&&start>=list.length){decorationPage=1;start=0;}
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
  const host=document.getElementById('skillTreeList');if(!host)return;

  // get_player_profile_v24 응답에 negotiation_skills가 포함되지 않는 구버전 DB도 있으므로
  // 스킬 화면을 열 때 profiles에서 실제 습득 상태를 직접 다시 읽는다.
  const {data:skillProfile,error:skillProfileError}=await db
    .from('profiles')
    .select('skill_points,reputation,negotiation_skills')
    .eq('id',currentUser.id)
    .maybeSingle();

  if(skillProfileError){
    console.warn('협상 스킬 상태 조회 실패:',skillProfileError.message);
    if(!profile)await loadProfile();
  }else if(skillProfile){
    negotiationSkills=skillProfile.negotiation_skills||{};
    profile={...(profile||{}),...skillProfile};
  }

  const points=Number(profile?.skill_points||0),reputation=Number(profile?.reputation||0);
  const rows=Object.entries(HAGGLE_SKILLS).map(([code,s])=>{
    const owned=hasHaggleSkill(code);
    const reqOk=!s.requires||hasHaggleSkill(s.requires);
    const repOk=reputation>=Number(s.minReputation||0);
    const unlocked=reqOk&&repOk;

    const allRequirements=[];
    if(s.requires)allRequirements.push(`선행 스킬: ${HAGGLE_SKILLS[s.requires].name}`);
    if(s.minReputation)allRequirements.push(`명성 ${Number(s.minReputation).toLocaleString('ko-KR')} 이상`);

    const missing=[];
    if(!reqOk)missing.push(`${HAGGLE_SKILLS[s.requires].name} 습득`);
    if(!repOk)missing.push(`명성 ${Number(s.minReputation).toLocaleString('ko-KR')} 달성 (현재 ${reputation.toLocaleString('ko-KR')})`);

    const buttonText=owned?'습득 완료':!unlocked?'잠김':points<s.cost?'포인트 부족':'습득';
    const guide=owned
      ? '<em class="skill-owned-guide">✓ 이미 습득한 스킬입니다.</em>'
      : !unlocked
        ? `<em class="skill-unlock-guide">🔒 해금 조건: ${missing.join(' + ')}</em>`
        : `<em class="skill-ready-guide">✓ 해금 완료 · ${s.cost}P를 사용해 습득 가능</em>`;

    return `<article class="skill-node ${owned?'owned':''} ${unlocked?'':'blocked'}">
      <div class="skill-icon">${s.icon}</div>
      <div class="skill-copy">
        <h3>${s.name}</h3>
        <p>${s.desc}</p>
        <small>${allRequirements.length?`전체 조건: ${allRequirements.join(' · ')}`:'전체 조건: 처음부터 해금'} · 비용 ${s.cost}P</small>
        ${guide}
      </div>
      <button ${owned||!unlocked||points<s.cost?'disabled':''} onclick="learnNegotiationSkill('${code}')">${buttonText}</button>
    </article>`;
  }).join('');

  host.innerHTML=`<div class="skill-point-card"><span>보유 스킬 포인트</span><b>${points}P</b><small>명성 50을 얻을 때마다 1포인트가 지급됩니다. 후반 스킬일수록 더 많은 포인트가 필요합니다.</small></div><div class="skill-tree">${rows}</div>`;
}
async function learnNegotiationSkill(code){
  const{error}=await db.rpc('learn_negotiation_skill_v15',{p_skill:code});
  if(error){
    await loadNegotiationSkills();
    return toast(error.message);
  }
  toast('협상 스킬을 습득했습니다.');
  await Promise.all([loadProfile(),loadNegotiationSkills()]);
}
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
  {tier:'mansion',name:'대저택',icon:'🏰',price:300000000,capacity:16,desc:'최고급 장식 전시를 위한 대형 저택'},
  {tier:'country_villa',name:'호숫가 별장',icon:'🏡',price:700000000,capacity:22,desc:'호수와 정원이 보이는 고급 휴양 별장'},
  {tier:'sky_residence',name:'스카이 레지던스',icon:'🌃',price:1500000000,capacity:28,desc:'초고층 전용 엘리베이터와 파노라마 전시관'},
  {tier:'hanok_estate',name:'한옥 대저택',icon:'🏯',price:3000000000,capacity:34,desc:'전통 정원과 고미술 전시실을 갖춘 대저택'},
  {tier:'island_villa',name:'프라이빗 아일랜드',icon:'🏝️',price:8000000000,capacity:42,desc:'섬 전체가 개인 전시장과 휴양 공간'},
  {tier:'art_palace',name:'아트 팰리스',icon:'🏛️',price:30000000000,capacity:54,desc:'국제급 갤러리와 수장고를 갖춘 예술 궁전'},
  {tier:'legacy_castle',name:'레거시 캐슬',icon:'🏰',price:100000000000,capacity:70,desc:'100억 자산가를 위한 성채형 컬렉션 박물관'}
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

function openPhoneApp(name){document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));const screen=document.getElementById('phone-'+name);if(!screen)return;screen.classList.remove('hidden');if(chatRefreshTimer){clearInterval(chatRefreshTimer);chatRefreshTimer=null}if(name==='stocks')refreshStocks();else if(name==='wallet')renderWallet();else if(name==='ranking')loadRanking();else if(name==='property')loadProperties();else if(name==='bank')loadBank();else if(name==='titles')loadTitles();else if(name==='chat'){const chatHost=document.getElementById('globalChatList');if(chatHost)delete chatHost.dataset.loadedOnce;loadChatMessages({forceBottom:true});chatRefreshTimer=setInterval(()=>{if(!document.getElementById('phone-chat')?.classList.contains('hidden'))loadChatMessages()},5000)}else if(name==='skills')loadNegotiationSkills()}

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
    walkaway:{risk:.48,power:1,cost:2,label:'다른 구매자에게 팔겠다며 협상 결렬을 압박했다.'},
    anchor:{risk:.36,power:1.16,cost:2,label:'높은 시장 기준가를 먼저 제시해 협상 범위를 끌어올렸다.'},
    master_close:{risk:.30,power:1.34,cost:2,label:'지금 합의할 수 있는 최종 조건을 정교하게 제시했다.'}
  };
  const cfg=configs[style]||configs.polite;
  if(style!=='polite'){
    const need={evidence:'market_data',story:'storytelling',cash:'quick_deal',silence:'silence_pressure',walkaway:'walkaway',anchor:'price_anchor',master_close:'master_close'}[style];
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
    {code:'walkaway',skill:'walkaway',icon:'🚪',name:'다른 곳에 팔겠다고 압박',desc:'고위험 · 성공 시 큰 폭 인상'},
    {code:'anchor',skill:'price_anchor',icon:'🧲',name:'높은 기준가로 앵커링',desc:'고급 기술 · 협상 상한선을 강하게 압박'},
    {code:'master_close',skill:'master_close',icon:'🏁',name:'최종 합의 설계',desc:'최종 기술 · 성공 시 가장 큰 양보를 유도'}
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
  if(name==='stocks')refreshStocks();else if(name==='wallet')renderWallet();else if(name==='ranking')loadRanking();else if(name==='property')loadProperties();else if(name==='bank')loadBank();else if(name==='business')loadBusiness();else if(name==='titles')loadTitles();else if(name==='chat'){const chatHost=document.getElementById('globalChatList');if(chatHost)delete chatHost.dataset.loadedOnce;loadChatMessages({forceBottom:true});chatRefreshTimer=setInterval(()=>{if(!document.getElementById('phone-chat')?.classList.contains('hidden'))loadChatMessages()},5000)}else if(name==='skills')loadNegotiationSkills();
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

loadChatMessages=async function(options={}){
  const host=document.getElementById('globalChatList');
  if(!host)return;
  const firstLoad=!host.dataset.loadedOnce;
  const oldTop=host.scrollTop;
  const oldHeight=host.scrollHeight;
  const wasNearBottom=oldHeight-oldTop-host.clientHeight<40;
  const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:60});
  if(error){host.innerHTML=`<p class="muted">${esc(error.message)}</p>`;return}
  const rows=Array.isArray(data)?data:[];
  host.innerHTML=rows.map(r=>`<article class="global-chat-message ${r.sender_user_id===currentUser.id?'mine':''}"><div class="chat-user"><strong>${esc(r.nickname)}</strong><span class="title-badge ${titleClass(r.active_title)}">${esc(r.active_title||'초보 장사꾼')}</span><time>${chatTime(r.created_at)}</time></div><p>${esc(r.chat_text)}</p></article>`).join('')||'<p class="muted chat-empty">첫 메시지를 남겨 보세요.</p>';
  host.dataset.loadedOnce='1';
  const latest=newestChatRow(rows);
  if(latest)rememberReliableChatLatest(getChatMessageId(latest));
  if(isChatScreenOpen())markChatRead(latest?.created_at||new Date().toISOString());
  requestAnimationFrame(()=>{
    if(options.forceBottom||firstLoad||wasNearBottom){
      host.scrollTop=host.scrollHeight;
    }else{
      const heightDelta=host.scrollHeight-oldHeight;
      host.scrollTop=Math.max(0,oldTop+heightDelta);
    }
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
  const screen=document.getElementById('phone-restoration');
  const jobsHost=screen?.querySelector('#restorationJobs');
  const invHost=screen?.querySelector('#restorationInventory');
  if(!jobsHost||!invHost)return;
  jobsHost.innerHTML='<div class="bank-loading">복원 작업을 확인하는 중...</div>';
  invHost.innerHTML='';
  await loadInventory();
  const [{data:jobsData,error:jobsError},{data:known,error:knownError}]=await Promise.all([
    db.rpc('get_restoration_jobs_v35'),
    db.from('user_item_appraisals_v38').select('user_item_id').eq('user_id',currentUser.id)
  ]);
  if(jobsError){jobsHost.innerHTML=`<div class="panel error-panel">${esc(jobsError.message)}</div>`;return;}
  if(knownError){jobsHost.innerHTML=`<div class="panel error-panel">${esc(knownError.message)}</div>`;return;}
  const jobs=Array.isArray(jobsData)?jobsData:[];
  const appraisedIds=new Set((known||[]).map(x=>String(x.user_item_id)));
  jobsHost.innerHTML=`<div class="restoration-capacity"><b>복원 작업 슬롯</b><span>${jobs.filter(x=>x.status==='active').length}/3 사용 중</span></div>`+(jobs.map(j=>{
    const ready=Number(j.remaining_seconds)<=0;
    return `<article class="restoration-job ${ready?'ready':''}"><span>${ready?'✨':'🛠️'}</span><div><b>${esc(j.item_name)}</b><small>${esc(j.rarity)} · 복원 전 ${j.old_condition}/100 · 예상 +${j.improve_amount}</small></div><em>${ready?'완료':`${j.remaining_seconds}초`}</em><button ${ready?'':'disabled'} onclick="claimRestorationV35('${j.job_id}')">${ready?'수령':'작업 중'}</button></article>`;
  }).join('')||'<div class="restoration-empty">현재 진행 중인 복원이 없습니다.</div>');
  const activeIds=new Set(jobs.filter(x=>x.status==='active').map(x=>String(x.user_item_id)));
  const appraisedOwned=inventory.filter(x=>!x.is_listed&&!x.restoration_locked&&!activeIds.has(String(x.id))&&appraisedIds.has(String(x.id)));
  const available=appraisedOwned.filter(x=>Number(x.condition_score)<100);
  const unappraisedCount=inventory.filter(x=>!x.is_listed&&!x.restoration_locked&&!activeIds.has(String(x.id))&&!appraisedIds.has(String(x.id))).length;
  let body='';
  if(available.length){
    body=`<div class="restoration-grid">${available.map(r=>{
      const cost=restorationCostV35(r),rank=rarityClass(normalizeRarityV35(r.items.rarity));
      return `<article class="restoration-card ${rank}"><img src="${itemImage(r.items.name,r.items.category)}"><div><span class="badge ${rank}">${esc(normalizeRarityV35(r.items.rarity))}</span><b class="rarity-text ${rank}">${esc(r.items.name)}</b><small>현재 상태 ${r.condition_score}/100</small><em>복원비 ${money(cost)}</em></div><button onclick="startRestorationV35('${r.id}')">30초 복원</button></article>`;
    }).join('')}</div>`;
  }else if(unappraisedCount>0){
    body='<div class="restoration-empty restoration-need-appraisal"><b>복원 가능한 감정 완료 아이템이 없습니다.</b><span>먼저 휴대폰의 감정소에서 아이템 상태를 확인해 주세요.</span><button onclick="openPhoneApp(\'appraisal\')">감정소로 이동</button></div>';
  }else{
    body='<div class="restoration-empty"><b>현재 복원할 아이템이 없습니다.</b><span>감정 완료 후 상태가 100 미만인 보유품만 복원할 수 있습니다.</span></div>';
  }
  invHost.innerHTML=`<h3>복원 가능한 보유품</h3>${body}`;
  if(restorationTimerV35)clearTimeout(restorationTimerV35);
  if(jobs.some(x=>x.status==='active'&&Number(x.remaining_seconds)>0))restorationTimerV35=setTimeout(loadRestorationCenter,1000);
}

async function startRestorationV35(id){
  const row=inventory.find(x=>String(x.id)===String(id));if(!row)return;
  const{data:known,error:knownError}=await db.from('user_item_appraisals_v38').select('user_item_id').eq('user_id',currentUser.id).eq('user_item_id',id).maybeSingle();
  if(knownError)return toast(knownError.message);
  if(!known)return toast('먼저 감정소에서 이 아이템의 상태를 확인해 주세요.');
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


/* =========================================================
   v38.7: purchased-item appraisal secrecy + pawnshop viewport fix
   ========================================================= */
function isItemAppraisedV387(id){return appraisedItemIds.has(String(id))}
function hiddenConditionTextV387(){return '🔒 상태 미감정 · 감정소에서 확인'}

loadInventory=async function(){
  const [itemsRes, appraisalRes]=await Promise.all([
    db.from('user_items').select(`id,condition_score,is_listed,restoration_locked,items(id,name,category,average_price,rarity)`).eq('user_id',currentUser.id).order('acquired_at',{ascending:false}),
    db.from('user_item_appraisals_v38').select('user_item_id').eq('user_id',currentUser.id)
  ]);
  if(itemsRes.error)return toast(itemsRes.error.message);
  inventory=itemsRes.data||[];
  appraisedItemIds=new Set((appraisalRes.data||[]).map(x=>String(x.user_item_id)));
  if(appraisalRes.error)console.warn('감정 기록 조회 실패:',appraisalRes.error.message);
  fillItemSelect();
  const homeCount=document.getElementById('homeInventoryCount');if(homeCount)homeCount.textContent=inventory.length;
  if(!inventory.length){inventoryEl().innerHTML='<div class="panel" style="padding:20px">가방이 비어 있습니다.</div>';return}
  inventoryEl().innerHTML=inventory.map(cardItem).join('');
};

cardItem=function(r){
  const i=r.items,known=isItemAppraisedV387(r.id),v=itemValue(i.average_price,r.condition_score),rc=rarityClass(normalizeRarityV35(i.rarity));
  return `<article class="item-card"><div class="item-image"><img src="${itemImage(i.name,i.category)}"></div><div class="item-body"><h3 class="rarity-text ${rc}">${esc(i.name)}</h3><div class="meta rarity-text ${rc}">${esc(i.category)} · ${esc(normalizeRarityV35(i.rarity))}</div>${known?`<div class="condition"><i style="width:${r.condition_score}%"></i></div><div class="meta">상태 ${r.condition_score}/100 · ${conditionLabelV383(r.condition_score)}</div><div class="price">평가액 ${money(v)}</div>`:`<div class="hidden-condition-v383">${hiddenConditionTextV387()}</div><div class="price muted-price">감정 후 가치 확인</div>`}<div class="item-actions"><button class="btn light" onclick="openPage('pawnshop',document.querySelector('[data-page=pawnshop]'))">전당포</button><button class="btn primary" onclick="openPage('market',document.querySelector('[data-page=market]'))">장터</button></div></div></article>`;
};

fillItemSelect=function(){
  sellItem.innerHTML='<option value="">판매할 아이템</option>';
  inventory.filter(x=>!x.is_listed&&!x.restoration_locked).forEach(x=>{
    const known=isItemAppraisedV387(x.id),fair=Math.round(Number(x.items.average_price||0)*conditionMultiplierV383(x.condition_score));
    sellItem.add(new Option(known?`${x.items.name} · 상태 ${x.condition_score} · 권장 ${money(fair)}`:`${x.items.name} · 상태 미감정`,x.id));
  });
  sellItem.onchange=()=>{
    const r=inventory.find(x=>String(x.id)===String(sellItem.value));if(!r||!sellPrice)return;
    const known=isItemAppraisedV387(r.id),fair=Math.max(1,Math.round(Number(r.items.average_price||0)*conditionMultiplierV383(r.condition_score)));
    if(known){sellPrice.value=fair;sellPrice.placeholder=`상태 반영 권장가 ${money(fair)}`}
    else{sellPrice.value='';sellPrice.placeholder='미감정 아이템 · 직접 판매가 입력'}
  };
};

loadPawnshop=async function(){
  await loadInventory();
  pawnshopList.innerHTML=inventory.filter(x=>!x.is_listed&&!x.restoration_locked).map(r=>{
    const known=isItemAppraisedV387(r.id),avg=Number(r.items.average_price||0),v=Math.round(avg*conditionMultiplierV383(r.condition_score)),diff=v-avg,rc=rarityClass(normalizeRarityV35(r.items.rarity));
    return `<article class="item-card pawn-v387-card"><div class="item-image"><img src="${itemImage(r.items.name,r.items.category)}"></div><div class="item-body"><h3 class="rarity-text ${rc}">${esc(r.items.name)}</h3>${known?`<div class="meta">상태 ${r.condition_score}/100 · ${conditionLabelV383(r.condition_score)}</div>`:`<div class="hidden-condition-v383">${hiddenConditionTextV387()}</div>`}<div class="price">즉시 매입가 ${money(v)}</div>${known?`<small class="condition-price-note ${diff>=0?'up':'down'}">평균 원가 대비 ${diff>=0?'+':''}${money(diff)}</small>`:`<small class="condition-price-note">전당포가 자체 평가한 매입가입니다.</small>`}<div class="item-actions"><button class="btn light" onclick="pawnSell('${r.id}','instant',100)">즉시 판매</button><button class="btn primary" onclick="startPawnNegotiation('${r.id}')">흥정 판매</button></div></div></article>`;
  }).join('')||'<div class="panel" style="padding:20px">판매할 아이템이 없습니다.</div>';
};

const appraiseOwnedItemV38_v387=appraiseOwnedItemV38;
appraiseOwnedItemV38=async function(id,cost){
  if(!confirm(`이 아이템을 ${money(cost)}에 감정할까요?`))return;
  const{data,error}=await db.rpc('appraise_owned_item_v38',{p_user_item_id:id});if(error)return toast(error.message);
  appraisedItemIds.add(String(id));
  toast(`감정 완료 · 상태 ${data.condition_score}/100`);
  await Promise.all([loadProfile(),loadInventory(),loadOwnedAppraisalV38()]);
};


/* ============================================================
   v39: 10/100 gacha + six luxury homes + high-net-worth foundation
   ============================================================ */
function gachaCostV39(count){return count===100?27000000:count===10?2850000:300000}
let gachaDrawingV407=false;
function gachaSkipEnabledV39(type){
  const id=type==='phone_case'?'gachaSkipCase':'gachaSkipDecor';
  return document.getElementById(id)?.checked===true;
}
function setGachaButtonsBusyV407(busy){
  document.querySelectorAll('.bulk-gacha-buttons button').forEach(btn=>{
    btn.disabled=!!busy;
    btn.classList.toggle('gacha-busy-v407',!!busy);
  });
}
function saveGachaSkipPreferenceV407(type,checked){
  try{localStorage.setItem(`sellingGod:gachaSkip:${type}`,checked?'1':'0')}catch(_e){}
}
function restoreGachaSkipPreferencesV407(){
  [['decoration','gachaSkipDecor'],['phone_case','gachaSkipCase']].forEach(([type,id])=>{
    const input=document.getElementById(id);if(!input)return;
    try{input.checked=localStorage.getItem(`sellingGod:gachaSkip:${type}`)==='1'}catch(_e){}
    if(input.dataset.boundV407)return;
    input.dataset.boundV407='1';
    input.addEventListener('change',()=>saveGachaSkipPreferenceV407(type,input.checked));
  });
}
async function drawCollectible(type,count=1){
  count=[1,10,100].includes(Number(count))?Number(count):1;
  if(gachaDrawingV407)return toast('현재 뽑기를 처리하고 있습니다.');
  const cost=gachaCostV39(count);
  if(!profile||Number(profile.cash)<cost)return toast(`${count}회 뽑기에는 ${money(cost)}이 필요합니다.`);

  restoreGachaSkipPreferencesV407();
  const skip=gachaSkipEnabledV39(type);
  const modal=document.getElementById('gachaModal');
  const summary=document.getElementById('gachaBulkSummary');
  gachaDrawingV407=true;
  setGachaButtonsBusyV407(true);

  try{
    if(summary){summary.classList.add('hidden');summary.innerHTML=''}

    if(skip){
      // 스킵 시에는 회전/흔들림 모달 자체를 띄우지 않는다.
      modal.className='overlay hidden';
      toast(`${count}회 뽑기 처리 중 · 연출 스킵`);
    }else{
      modal.classList.remove('hidden');
      modal.className='overlay gacha-spinning rarity-0';
      gachaRarity.textContent=count===1?'두근두근...':`${count}개 캡슐 개봉 중`;
      gachaResultIcon.textContent=type==='phone_case'?'📱':'🏺';
      gachaResultName.textContent='캡슐 개봉 중';
      gachaResultName.className='';
      gachaResultEffect.textContent='';
      playGachaBuild();
      await wait(count===1?1500:1900);
    }

    const{data,error}=await db.rpc('draw_collectibles_bulk_v39',{p_type:type,p_count:count});
    if(error)throw error;

    const rows=Array.isArray(data?.results)?data.results:(Array.isArray(data)?data:[]);
    if(!rows.length)throw new Error('뽑기 결과를 불러오지 못했습니다.');
    const highest=rows.reduce((a,b)=>rarityScore(b.rarity)>rarityScore(a?.rarity)?b:a,rows[0]);
    const rank=rarityScore(highest?.rarity||'일반');

    // 스킵 여부와 관계없이 결과는 즉시 한 번만 표시한다.
    modal.classList.remove('hidden');
    modal.className=`overlay gacha-reveal rarity-${rank} ${skip?'gacha-skipped-v407':''}`;
    gachaRarity.textContent=count===1?(highest?.rarity||'결과'):`${count}연속 결과 · 최고 ${highest?.rarity||'일반'}`;
    gachaResultIcon.textContent=highest?.icon||'✨';
    gachaResultName.textContent=count===1?(highest?.name||'결과 공개'):`${count}개 획득 완료`;
    gachaResultName.className=`rarity-text ${rarityClass(highest?.rarity||'일반')}`;
    gachaResultEffect.textContent=count===1?`${collectibleEffectLabel(highest?.effect_code,highest?.effect_name)} +${Number(highest?.effect_percent||0)}%`:`총 비용 ${money(data?.cost||cost)}${skip?' · 연출 스킵':''}`;

    if(count>1&&summary){
      const counts={};rows.forEach(r=>counts[r.rarity]=(counts[r.rarity]||0)+1);
      summary.innerHTML=`<div class="bulk-rarity-counts">${Object.entries(counts).sort((a,b)=>rarityScore(b[0])-rarityScore(a[0])).map(([r,n])=>`<span class="rarity-text ${rarityClass(r)}">${r} ${n}개</span>`).join('')}</div><div class="bulk-top-results">${rows.slice().sort((a,b)=>rarityScore(b.rarity)-rarityScore(a.rarity)).slice(0,12).map(r=>`<em class="${rarityClass(r.rarity)}">${r.icon||'✨'} ${esc(r.name)}</em>`).join('')}</div>`;
      summary.classList.remove('hidden');
    }

    rank>=4?playJackpotSound():playSuccessSound();
    await Promise.all([loadProfile(),loadCollectibles()]);
    updateNetworth();
  }catch(error){
    closeGachaReveal();
    toast(error?.message||'뽑기에 실패했습니다.');
  }finally{
    gachaDrawingV407=false;
    setGachaButtonsBusyV407(false);
    updateGachaButtons();
  }
}

setTimeout(restoreGachaSkipPreferencesV407,0);

let foundationTimerV39=null;
const FOUNDATION_TIERS_V39=[
 {tier:1,name:'프라이빗 쇼룸',price:1000000000,icon:'🖼️',desc:'예약제 컬렉션 쇼룸과 VIP 응접실'},
 {tier:2,name:'국제 갤러리',price:10000000000,icon:'🏛️',desc:'해외 컬렉터와 브랜드가 참여하는 전시관'},
 {tier:3,name:'경매 컨벤션 센터',price:30000000000,icon:'🔨',desc:'대형 경매·박람회를 직접 유치하는 복합시설'},
 {tier:4,name:'세계 판매왕 재단',price:100000000000,icon:'🌐',desc:'100억 규모의 글로벌 문화·거래 재단'}
];
async function loadFoundationV39(){
 const host=document.getElementById('foundationView');if(!host)return;host.innerHTML='<div class="bank-loading">재단 현황을 불러오는 중...</div>';
 const{data,error}=await db.rpc('get_foundation_status_v39');if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}
 const f=data?.foundation||{},active=data?.active_exhibition,current=Number(f.tier||0),cash=Number(profile?.cash||0);if(profile)profile.foundation_tier=current;
 const tierCards=FOUNDATION_TIERS_V39.map(t=>{const built=current>=t.tier,next=current+1===t.tier,afford=cash>=t.price;return `<article class="foundation-tier ${built?'built':''}"><span>${t.icon}</span><div><small>STAGE ${t.tier}</small><b>${t.name}</b><p>${t.desc}</p><strong>${money(t.price)}</strong></div><button ${built||!next||!afford?'disabled':''} onclick="buildFoundationV39(${t.tier})">${built?'완공':!next?'이전 단계 필요':!afford?'자금 부족':'건설'}</button></article>`}).join('');
 let content='';
 if(active){
   content=`<article class="foundation-active"><div><span>${active.icon}</span><b>${esc(active.name)}</b><small>운영비 ${money(active.budget)}</small></div><div><em>${active.ready?'정산 가능':String(active.remaining_seconds)+'초 남음'}</em><button ${active.ready?'':'disabled'} onclick="claimFoundationExhibitionV39()">${active.ready?'성과 정산':'행사 진행 중'}</button></div></article>`;
 }else{
   content=`<section class="foundation-projects"><h3>프라이빗 전시 프로젝트</h3>${foundationProjectCardV39('private_show',1,'🎟️','VIP 컬렉터 프리뷰',50000000,60,'초청 고객에게 희귀품을 선공개합니다.')}${foundationProjectCardV39('global_fair',2,'🌍','국제 아트페어',500000000,90,'해외 딜러와 브랜드를 유치합니다.')}${foundationProjectCardV39('auction_week',3,'🔨','판매왕 경매 주간',3000000000,120,'대형 경매와 특별전을 일주일간 운영합니다.')}${foundationProjectCardV39('world_expo',4,'👑','세계 컬렉터 엑스포',20000000000,180,'100억 재단만 열 수 있는 최고급 국제 행사입니다.')}</section>`;
 }
 host.innerHTML=`<section class="foundation-hero"><div><span>재단 가치</span><b>${money(f.total_invested||0)}</b><small>명성 점수 ${Number(f.prestige||0).toLocaleString('ko-KR')}P</small></div><em>${current?FOUNDATION_TIERS_V39[current-1].name:'설립 전'}</em></section><div class="foundation-tier-grid">${tierCards}</div>${content}`;
 if(foundationTimerV39)clearTimeout(foundationTimerV39);if(active&&!active.ready)foundationTimerV39=setTimeout(loadFoundationV39,1000);
}
function foundationProjectCardV39(code,req,icon,name,budget,sec,desc){const locked=Number(profile?.foundation_tier||0)<req;return `<article class="foundation-project ${locked?'locked':''}"><span>${icon}</span><div><b>${name}</b><small>${desc}</small><em>운영비 ${money(budget)} · ${sec}초</em></div><button ${locked?'disabled':''} onclick="startFoundationExhibitionV39('${code}')">${locked?`STAGE ${req} 필요`:'개최'}</button></article>`}
async function buildFoundationV39(tier){if(!confirm(`${FOUNDATION_TIERS_V39[tier-1].name}을 건설할까요?`))return;const{data,error}=await db.rpc('build_foundation_v39',{p_tier:tier});if(error)return toast(error.message);toast(`${data.name} 완공`);playSuccessSound();await Promise.all([loadProfile(),loadFoundationV39()]);updateNetworth()}
async function startFoundationExhibitionV39(code){if(!confirm('행사를 시작할까요? 운영비는 즉시 차감되며 결과는 서버에 저장됩니다.'))return;const{data,error}=await db.rpc('start_foundation_exhibition_v39',{p_code:code});if(error)return toast(error.message);toast(`${data.name} 시작`);await Promise.all([loadProfile(),loadFoundationV39()])}
async function claimFoundationExhibitionV39(){const{data,error}=await db.rpc('claim_foundation_exhibition_v39');if(error)return toast(error.message);toast(`${data.result_label} · 수익 ${money(data.payout)}`);playSuccessSound();await Promise.all([loadProfile(),loadFoundationV39()]);updateNetworth()}

const openPhoneAppV39=openPhoneApp;openPhoneApp=function(name){openPhoneAppV39(name);if(name==='foundation')loadFoundationV39()};


/* v39.1: 글로벌 무역 네트워크 + 럭셔리 브랜드 하우스 */
let tradeTimerV391=null,brandTimerV391=null;
const TRADE_TIERS_V391=[
 {tier:1,name:'수도권 물류 사무소',price:500000000,icon:'🏢',desc:'국내 도매 계약과 소형 수출을 관리합니다.'},
 {tier:2,name:'아시아 수출 허브',price:2000000000,icon:'🚢',desc:'항만 창고와 통관 인력을 확보합니다.'},
 {tier:3,name:'유럽 럭셔리 지사',price:10000000000,icon:'🌍',desc:'고가 상품의 해외 유통권을 직접 운영합니다.'},
 {tier:4,name:'글로벌 무역 본부',price:50000000000,icon:'🛰️',desc:'100억대 국제 공급 계약을 총괄합니다.'}
];
const BRAND_TIERS_V391=[
 {tier:1,name:'디자이너 스튜디오',price:1000000000,icon:'✏️',desc:'소규모 한정판 상품을 제작합니다.'},
 {tier:2,name:'플래그십 브랜드',price:5000000000,icon:'🏬',desc:'백화점과 주요 상권에 브랜드를 입점시킵니다.'},
 {tier:3,name:'글로벌 럭셔리 하우스',price:20000000000,icon:'💎',desc:'해외 홍보와 명품 라인을 운영합니다.'},
 {tier:4,name:'헤리티지 메종',price:100000000000,icon:'👑',desc:'100억 자산가만 도전할 수 있는 최고급 브랜드입니다.'}
];
function capitalTierCardsV391(items,current,cash,handler){return items.map(t=>{const built=current>=t.tier,next=current+1===t.tier,afford=cash>=t.price;return `<article class="capital-tier ${built?'built':''}"><span>${t.icon}</span><div><small>STAGE ${t.tier}</small><b>${t.name}</b><p>${t.desc}</p><strong>${money(t.price)}</strong></div><button ${built||!next||!afford?'disabled':''} onclick="${handler}(${t.tier})">${built?'운영 중':!next?'이전 단계 필요':!afford?'자금 부족':'확장'}</button></article>`}).join('')}
function capitalActiveCardV391(active,claimFn){if(!active)return '';return `<article class="capital-active"><div><span>${active.icon||'📦'}</span><div><b>${esc(active.name)}</b><small>투입 자금 ${money(active.capital||active.budget||0)}</small></div></div><div><em>${active.ready?'정산 가능':`${active.remaining_seconds}초 남음`}</em><button ${active.ready?'':'disabled'} onclick="${claimFn}()">${active.ready?'성과 정산':'진행 중'}</button></div></article>`}
async function loadTradeNetworkV391(){
 const host=document.getElementById('tradeNetworkView');if(!host)return;host.innerHTML='<div class="bank-loading">무역 현황을 불러오는 중...</div>';
 const{data,error}=await db.rpc('get_trade_network_status_v391');if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}
 const n=data?.network||{},active=data?.active_shipment,current=Number(n.tier||0),cash=Number(profile?.cash||0);
 const routes=[
  ['domestic',1,'🚚','국내 프리미엄 도매 계약',100000000,60,'소매점 체인에 한정 상품을 공급합니다.'],
  ['asia',2,'🚢','아시아 수출 선적',500000000,90,'환율과 통관 변수를 감수하고 수출합니다.'],
  ['europe',3,'✈️','유럽 럭셔리 유통 계약',2000000000,120,'고급 유통사와 대형 공급 계약을 체결합니다.'],
  ['global',4,'🛰️','글로벌 독점 공급 계약',10000000000,180,'100억대 자산가를 위한 초대형 국제 계약입니다.']
 ];
 const projects=active?capitalActiveCardV391(active,'claimTradeShipmentV391'):`<section class="capital-projects"><h3>진행할 무역 계약</h3>${routes.map(r=>capitalProjectCardV391(...r,current,'startTradeShipmentV391')).join('')}</section>`;
 host.innerHTML=`<section class="capital-hero trade"><div><span>누적 무역 이익</span><b>${money(n.total_profit||0)}</b><small>신뢰도 ${Number(n.reputation||0).toLocaleString('ko-KR')}P</small></div><em>${current?TRADE_TIERS_V391[current-1].name:'네트워크 설립 전'}</em></section><div class="capital-tier-grid">${capitalTierCardsV391(TRADE_TIERS_V391,current,cash,'upgradeTradeNetworkV391')}</div>${projects}`;
 if(tradeTimerV391)clearTimeout(tradeTimerV391);if(active&&!active.ready)tradeTimerV391=setTimeout(loadTradeNetworkV391,1000);
}
function capitalProjectCardV391(code,req,icon,name,capital,sec,desc,current,fn){const locked=current<req;return `<article class="capital-project ${locked?'locked':''}"><span>${icon}</span><div><b>${name}</b><small>${desc}</small><em>투입 ${money(capital)} · ${sec}초</em></div><button ${locked?'disabled':''} onclick="${fn}('${code}')">${locked?`STAGE ${req} 필요`:'계약 시작'}</button></article>`}
async function upgradeTradeNetworkV391(tier){if(!confirm(`${TRADE_TIERS_V391[tier-1].name}을 확장할까요?`))return;const{data,error}=await db.rpc('upgrade_trade_network_v391',{p_tier:tier});if(error)return toast(error.message);toast(`${data.name} 확장 완료`);playSuccessSound();await Promise.all([loadProfile(),loadTradeNetworkV391()]);updateNetworth()}
async function startTradeShipmentV391(code){if(!confirm('무역 계약을 시작할까요? 투입 자금은 즉시 차감되며 손실 가능성이 있습니다.'))return;const{data,error}=await db.rpc('start_trade_shipment_v391',{p_code:code});if(error)return toast(error.message);toast(`${data.name} 시작`);await Promise.all([loadProfile(),loadTradeNetworkV391()])}
async function claimTradeShipmentV391(){const{data,error}=await db.rpc('claim_trade_shipment_v391');if(error)return toast(error.message);toast(`${data.result_label} · 정산 ${money(data.payout)}`);playSuccessSound();await Promise.all([loadProfile(),loadTradeNetworkV391()]);updateNetworth()}

async function loadBrandHouseV391(){
 const host=document.getElementById('brandHouseView');if(!host)return;host.innerHTML='<div class="bank-loading">브랜드 현황을 불러오는 중...</div>';
 const{data,error}=await db.rpc('get_brand_house_status_v391');if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}
 const b=data?.brand||{},active=data?.active_campaign,current=Number(b.tier||0),cash=Number(profile?.cash||0);
 const campaigns=[
  ['limited',1,'👜','시즌 한정 컬렉션',200000000,60,'한정 수량으로 희소성과 마진을 높입니다.'],
  ['popup',2,'🏬','백화점 팝업 스토어',1000000000,90,'핵심 상권에서 브랜드 인지도를 끌어올립니다.'],
  ['ambassador',3,'🎬','글로벌 앰배서더 캠페인',5000000000,120,'세계적인 모델과 대규모 광고를 진행합니다.'],
  ['world_launch',4,'👑','월드 플래그십 런칭',20000000000,180,'100억 브랜드의 전 세계 동시 출시 행사입니다.']
 ];
 const projects=active?capitalActiveCardV391(active,'claimBrandCampaignV391'):`<section class="capital-projects"><h3>브랜드 캠페인</h3>${campaigns.map(r=>capitalProjectCardV391(...r,current,'startBrandCampaignV391')).join('')}</section>`;
 host.innerHTML=`<section class="capital-hero brand"><div><span>브랜드 누적 매출</span><b>${money(b.total_sales||0)}</b><small>브랜드 가치 ${money(b.brand_value||0)} · 명성 ${Number(b.prestige||0).toLocaleString('ko-KR')}P</small></div><em>${current?BRAND_TIERS_V391[current-1].name:'브랜드 설립 전'}</em></section><div class="capital-tier-grid">${capitalTierCardsV391(BRAND_TIERS_V391,current,cash,'buildBrandHouseV391')}</div>${projects}`;
 if(brandTimerV391)clearTimeout(brandTimerV391);if(active&&!active.ready)brandTimerV391=setTimeout(loadBrandHouseV391,1000);
}
async function buildBrandHouseV391(tier){if(!confirm(`${BRAND_TIERS_V391[tier-1].name}을 설립할까요?`))return;const{data,error}=await db.rpc('build_brand_house_v391',{p_tier:tier});if(error)return toast(error.message);toast(`${data.name} 설립 완료`);playSuccessSound();await Promise.all([loadProfile(),loadBrandHouseV391()]);updateNetworth()}
async function startBrandCampaignV391(code){if(!confirm('브랜드 캠페인을 시작할까요? 제작비는 즉시 차감되며 흥행 실패 가능성이 있습니다.'))return;const{data,error}=await db.rpc('start_brand_campaign_v391',{p_code:code});if(error)return toast(error.message);toast(`${data.name} 시작`);await Promise.all([loadProfile(),loadBrandHouseV391()])}
async function claimBrandCampaignV391(){const{data,error}=await db.rpc('claim_brand_campaign_v391');if(error)return toast(error.message);toast(`${data.result_label} · 매출 ${money(data.payout)}`);playSuccessSound();await Promise.all([loadProfile(),loadBrandHouseV391()]);updateNetworth()}

const openPhoneAppV391=openPhoneApp;openPhoneApp=function(name){openPhoneAppV391(name);if(name==='trade')loadTradeNetworkV391();else if(name==='brand')loadBrandHouseV391()};


// ============================================================
// v40: 판매왕 종합 경영 본부 - 10대 경영 시스템
// ============================================================
let managementStateV40=null;
const MGMT_SYSTEMS_V40=[
  ['franchise','🏪','체인점·프랜차이즈','상권별 매장을 확장하고 5분 단위 영업 수익을 정산합니다.'],
  ['staff','👥','직원 채용·인재 육성','직원 수준이 높을수록 제조·주문·전시 결과가 안정됩니다.'],
  ['manufacturing','🏭','자체 상품 제작','원가와 위험도가 다른 자체 상품을 생산하고 완성품을 정산합니다.'],
  ['orders','📦','고객 주문·의뢰','수집가·기업·왕실 고객의 제한 시간 납품 의뢰를 수행합니다.'],
  ['insurance','🛡️','보험 관리','사고와 사업 손실 일부를 보상받아 대규모 손실을 줄입니다.'],
  ['accounting','🧾','세금·회계 관리','발생 세금을 납부하고 회계사를 고용해 세율과 조사 위험을 낮춥니다.'],
  ['logistics','🚚','물류·배송 관리','배송 시설을 확장하고 일반·특급·보안 운송을 운영합니다.'],
  ['museum','🏛️','전시관·박물관','보유 소장품을 활용한 전시회를 열고 관람 수익을 얻습니다.'],
  ['loan','🏦','담보 대출·압류','집·회사·소장품을 담보로 큰 자금을 조달하고 만기 전에 상환합니다.'],
  ['family','👑','상속·가문','가문을 창설하고 명성과 신탁 자산을 쌓아 영구적인 유산을 만듭니다.']
];
function mgmtMoneyV40(v){return money(Number(v||0))}
function mgmtLevelV40(key){return Number(managementStateV40?.state?.[key+'_level']||0)}
function mgmtOperationV40(kind){return (managementStateV40?.operations||[]).find(x=>x.kind===kind&&x.status==='active')}
function mgmtRemainingV40(op){return Math.max(0,Math.ceil((new Date(op.resolves_at).getTime()-Date.now())/1000))}
function mgmtTabsV40(active='franchise'){
  return `<div class="mgmt-tabs-v40">${MGMT_SYSTEMS_V40.map(([k,i,n])=>`<button class="${k===active?'active':''}" onclick="renderManagementTabV40('${k}')"><span>${i}</span>${n}</button>`).join('')}</div>`;
}
async function loadManagementV40(){
  const host=document.getElementById('managementViewV40');if(!host)return;
  host.innerHTML='<div class="bank-loading">종합 경영 정보를 불러오는 중...</div>';
  const {data,error}=await db.rpc('get_management_status_v40');
  if(error){host.innerHTML=`<div class="mgmt-error-v40">${esc(error.message)}</div>`;return}
  managementStateV40=data;
  renderManagementTabV40(managementStateV40?.active_tab||'franchise');
}
function renderManagementTabV40(tab){
  if(!managementStateV40)return loadManagementV40();
  managementStateV40.active_tab=tab;
  const host=document.getElementById('managementViewV40');
  const head=`<div class="mgmt-summary-v40"><div><span>사용 가능 현금</span><b>${mgmtMoneyV40(managementStateV40.cash)}</b></div><div><span>미납 세금</span><b>${mgmtMoneyV40(managementStateV40.state.tax_due)}</b></div><div><span>가문 명성</span><b>${Number(managementStateV40.state.family_fame||0).toLocaleString()}</b></div></div>`;
  const [_,icon,name,desc]=MGMT_SYSTEMS_V40.find(x=>x[0]===tab)||MGMT_SYSTEMS_V40[0];
  host.innerHTML=head+mgmtTabsV40(tab)+`<div class="mgmt-section-head-v40"><span>${icon}</span><div><h3>${name}</h3><p>${desc}</p></div></div>`+renderManagementBodyV40(tab);
  if(['manufacturing','orders','logistics','museum'].includes(tab))setTimeout(()=>tickManagementV40(tab),1000);
}
function renderManagementBodyV40(tab){
  const s=managementStateV40.state;
  if(tab==='franchise'){
    const lv=mgmtLevelV40('franchise'), names=['미운영','동네 상점','대학가 지점','관광지 매장','도심 플래그십','전국 프랜차이즈'];
    const cost=[0,50000000,200000000,800000000,3000000000,10000000000][Math.min(lv+1,5)]||0;
    return `<div class="mgmt-tier-v40"><b>현재 단계 ${lv} · ${names[lv]||names[5]}</b><span>다음 확장비 ${cost?mgmtMoneyV40(cost):'최고 단계'}</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('franchise')" ${lv>=5?'disabled':''}>${lv>=5?'전국망 완성':'다음 상권 확장'}</button><button onclick="claimManagementPassiveV40('franchise')">영업 수익 정산</button></div><div class="mgmt-info-v40">직원·물류 수준이 높을수록 지점 매출이 증가하며, 최대 12시간까지 오프라인 수익이 누적됩니다.</div>`;
  }
  if(tab==='manufacturing'){
   const lv=mgmtLevelV40('manufacturing'),cost=mgmtNextCostV401('manufacturing',lv);
   return `<div class="mgmt-tier-v40"><b>제조 설비 ${lv}/5</b>${mgmtCostBadgeV401(cost)}</div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('manufacturing')" ${lv>=5?'disabled':''}>${lv>=5?'최고 제조 설비':'제조 설비 확장 · '+money(cost)}</button></div>`+renderOperationSystemV40('manufacturing',[['basic','생활형 자체 상품','2,000만 원','30초'],['luxury','프리미엄 한정판','1억 원','60초'],['signature','시그니처 컬렉션','5억 원','90초']]);
 }
 if(tab==='staff'){
    const lv=mgmtLevelV40('staff'), titles=['직원 없음','신입 판매원 팀','숙련 영업팀','전문 경영진','글로벌 임원진','최정예 인재 그룹'];
    return `<div class="mgmt-tier-v40"><b>인재 수준 ${lv} · ${titles[lv]||titles[5]}</b><span>운영 안정성 +${lv*6}%</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('staff')" ${lv>=5?'disabled':''}>교육·채용 투자</button></div><div class="mgmt-personnel-v40">${['영업','감정','협상','재고 관리','신뢰도'].map((x,i)=>`<div><span>${x}</span><b>${Math.min(100,20+lv*14+i*2)}</b></div>`).join('')}</div>`;
  }
  if(tab==='manufacturing')return renderOperationSystemV40('manufacturing',[['basic','생활형 자체 상품','2,000만 원','30초'],['luxury','프리미엄 한정판','1억 원','60초'],['signature','시그니처 컬렉션','5억 원','90초']]);
  if(tab==='orders')return renderOperationSystemV40('orders',[['collector','개인 수집가 의뢰','1,000만 원','30초'],['corporate','기업 대량 납품','8,000만 원','60초'],['royal','왕실·박물관 특별 의뢰','5억 원','90초']]);
  if(tab==='insurance'){
    const plan=s.insurance_plan||'none';
    return `<div class="mgmt-plan-grid-v40">${[['none','무보험','0원','손실 보상 없음'],['basic','기본 사업보험','1,000만 원','손실의 20% 보상'],['premium','종합 자산보험','5,000만 원','손실의 40% 보상'],['elite','VIP 전면보험','2억 원','손실의 65% 보상']].map(x=>`<button class="${plan===x[0]?'selected':''}" onclick="buyManagementInsuranceV40('${x[0]}')"><b>${x[1]}</b><span>${x[2]}</span><small>${x[3]}</small></button>`).join('')}</div><div class="mgmt-info-v40">보험료는 가입 시 1회 결제되며 다음 상품으로 변경할 때 새 보험료가 청구됩니다.</div>`;
  }
  if(tab==='accounting'){
    const lv=mgmtLevelV40('accountant');
    return `<div class="mgmt-tier-v40"><b>회계사 등급 ${lv}/5</b><span>예상 사업세율 ${Math.max(3,10-lv*1.4).toFixed(1)}%</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('accountant')" ${lv>=5?'disabled':''}>회계팀 강화</button><button onclick="payManagementTaxV40()">미납 세금 납부</button></div><div class="mgmt-info-v40">미납 세금이 장기간 누적되면 정산 수익에 가산금이 붙습니다. 전문 회계사는 세율과 가산금을 낮춥니다.</div>`;
  }
  if(tab==='logistics')return `<div class="mgmt-tier-v40"><b>물류 시설 ${mgmtLevelV40('logistics')}/5</b><span>배송 사고 위험 -${mgmtLevelV40('logistics')*8}%</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('logistics')" ${mgmtLevelV40('logistics')>=5?'disabled':''}>물류 시설 확장</button></div>`+renderOperationSystemV40('logistics',[['standard','일반 배송 계약','2,000만 원','30초'],['express','특급 배송망','1억 원','45초'],['secure','고가품 보안 운송','5억 원','60초']],true);
  if(tab==='museum')return `<div class="mgmt-tier-v40"><b>전시관 등급 ${mgmtLevelV40('museum')}/5</b><span>보유 소장품 ${managementStateV40.collectible_count||0}개</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('museum')" ${mgmtLevelV40('museum')>=5?'disabled':''}>전시관 확장</button><button onclick="claimManagementPassiveV40('museum')">상시 관람료 정산</button></div>`+renderOperationSystemV40('museum',[['vintage','빈티지 특별전','5,000만 원','45초'],['royal','왕실 보물전','3억 원','75초'],['ancient','고대 유물 대전','20억 원','120초']],true);
  if(tab==='loan'){
    const loans=managementStateV40.loans||[];
    return `<div class="mgmt-loan-create-v40"><select id="mgmtCollateralV40"><option value="house">보유 주택 담보</option><option value="business">회사 지분 담보</option><option value="collectible">소장품 담보</option><option value="stock">주식 담보</option></select><input id="mgmtLoanAmountV40" type="number" min="10000000" placeholder="대출 금액"><button onclick="takeManagementLoanV40()">담보 대출 실행</button></div><div class="mgmt-loans-v40">${loans.map(l=>`<div><b>${esc(l.collateral_type)} 담보 · ${mgmtMoneyV40(l.outstanding)}</b><span>만기 ${new Date(l.due_at).toLocaleString()}</span><button onclick="repayManagementLoanV40('${l.id}')">전액 상환</button></div>`).join('')||'<p>진행 중인 담보 대출이 없습니다.</p>'}</div><div class="mgmt-warning-v40">만기 이후에는 연체 이자가 붙고 담보 가치가 감소할 수 있습니다.</div>`;
  }
  if(tab==='family'){
    const lv=mgmtLevelV40('family'), fname=s.family_name||'';
    return `<div class="mgmt-family-v40"><div class="family-emblem-v40">${lv?'♛':'◇'}</div><div><b>${fname?esc(fname):'아직 가문이 없습니다'}</b><span>가문 단계 ${lv}/5 · 명성 ${Number(s.family_fame||0).toLocaleString()}</span></div></div>${lv===0?`<div class="mgmt-name-v40"><input id="mgmtFamilyNameV40" maxlength="16" placeholder="가문 이름"><button onclick="createManagementFamilyV40()">가문 창설 · 10억 원</button></div>`:`<div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('family')" ${lv>=5?'disabled':''}>가문 유산 확장</button><button onclick="donateManagementFamilyV40()">가문 신탁에 1억 기부</button></div>`}<div class="mgmt-info-v40">가문 명성은 박물관 전시, 세금 성실 납부, 사업 성공으로 올라가며 후반 칭호와 보너스의 기반이 됩니다.</div>`;
  }
  return '';
}
function renderOperationSystemV40(kind,opts,compact=false){
  const op=mgmtOperationV40(kind);
  if(op){const remain=mgmtRemainingV40(op);return `<div class="mgmt-operation-v40"><b>${esc(op.option_name||op.option_code)} 진행 중</b><span id="mgmtTimerV40">${remain>0?remain+'초 남음':'완료됨'}</span><button onclick="collectManagementOperationV40('${op.id}')" ${remain>0?'disabled':''}>${remain>0?'진행 중':'결과 정산'}</button></div>`}
  return `<div class="mgmt-option-grid-v40 ${compact?'compact':''}">${opts.map(o=>`<button onclick="startManagementOperationV40('${kind}','${o[0]}')"><b>${o[1]}</b><span>${o[2]}</span><small>${o[3]}</small></button>`).join('')}</div>`;
}
function tickManagementV40(tab){
  const screen=document.getElementById('phone-management');if(!screen||screen.classList.contains('hidden')||managementStateV40?.active_tab!==tab)return;
  const op=mgmtOperationV40(tab), el=document.getElementById('mgmtTimerV40');if(op&&el){const r=mgmtRemainingV40(op);el.textContent=r>0?r+'초 남음':'완료됨';if(r<=0){const b=el.parentElement?.querySelector('button');if(b){b.disabled=false;b.textContent='결과 정산'}}}
  setTimeout(()=>tickManagementV40(tab),1000);
}
async function managementRpcV40(name,args={}){const {data,error}=await db.rpc(name,args);if(error){toast(error.message);return null}toast(data?.message||'처리되었습니다.');await loadProfile();await loadManagementV40();return data}
async function upgradeManagementV40(system){await managementRpcV40('upgrade_management_system_v40',{p_system:system})}
async function claimManagementPassiveV40(system){await managementRpcV40('claim_management_passive_v40',{p_system:system})}
async function startManagementOperationV40(kind,option){await managementRpcV40('start_management_operation_v40',{p_kind:kind,p_option:option})}
async function collectManagementOperationV40(id){await managementRpcV40('collect_management_operation_v40',{p_operation_id:id})}
async function buyManagementInsuranceV40(plan){await managementRpcV40('buy_management_insurance_v40',{p_plan:plan})}
async function payManagementTaxV40(){await managementRpcV40('pay_management_tax_v40')}
async function takeManagementLoanV40(){const t=document.getElementById('mgmtCollateralV40')?.value,a=Math.floor(Number(document.getElementById('mgmtLoanAmountV40')?.value));if(!a)return toast('대출 금액을 입력하세요.');await managementRpcV40('take_collateral_loan_v40',{p_collateral_type:t,p_amount:a})}
async function repayManagementLoanV40(id){await managementRpcV40('repay_collateral_loan_v40',{p_loan_id:id})}
async function createManagementFamilyV40(){const n=document.getElementById('mgmtFamilyNameV40')?.value.trim();if(!n)return toast('가문 이름을 입력하세요.');await managementRpcV40('create_family_v40',{p_name:n})}
async function donateManagementFamilyV40(){await managementRpcV40('donate_family_v40',{p_amount:100000000})}
const openPhoneAppV40=openPhoneApp;openPhoneApp=function(name){openPhoneAppV40(name);if(name==='management')loadManagementV40()};


/* ============================================================
   v40.1: costs, offline profits/taxes, large-inventory pagination
   ============================================================ */
const MGMT_UPGRADE_COSTS_V401={
 franchise:[50000000,200000000,800000000,3000000000,10000000000],
 staff:[30000000,150000000,600000000,2500000000,8000000000],
 manufacturing:[100000000,500000000,2000000000,10000000000,50000000000],
 accountant:[20000000,100000000,500000000,2000000000,10000000000],
 logistics:[50000000,250000000,1000000000,5000000000,20000000000],
 museum:[300000000,1500000000,7000000000,30000000000,100000000000],
 family:[0,5000000000,20000000000,100000000000,500000000000]
};
function mgmtNextCostV401(key,level){return MGMT_UPGRADE_COSTS_V401[key]?.[level]||0}
function mgmtCostBadgeV401(cost){if(!cost)return '<span class="mgmt-cost-v401 max">최고 단계</span>';const ok=Number(profile?.cash||0)>=cost;return `<span class="mgmt-cost-v401 ${ok?'afford':'short'}">필요 ${money(cost)}${ok?'':' · 부족 '+money(cost-Number(profile?.cash||0))}</span>`}

const renderManagementBodyV40Base=renderManagementBodyV40;
renderManagementBodyV40=function(tab){
 const s=managementStateV40?.state||{};
 if(tab==='staff'){
   const lv=mgmtLevelV40('staff'), titles=['직원 없음','신입 판매원 팀','숙련 영업팀','전문 경영진','글로벌 임원진','최정예 인재 그룹'],cost=mgmtNextCostV401('staff',lv);
   return `<div class="mgmt-tier-v40"><b>인재 수준 ${lv} · ${titles[lv]||titles[5]}</b>${mgmtCostBadgeV401(cost)}</div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('staff')" ${lv>=5?'disabled':''}>${lv>=5?'최고 인재 조직 완성':`교육·채용 투자 · ${money(cost)}`}</button></div><div class="mgmt-personnel-v40">${['영업','감정','협상','재고 관리','신뢰도'].map((x,i)=>`<div><span>${x}</span><b>${Math.min(100,20+lv*14+i*2)}</b></div>`).join('')}</div>`;
 }
 if(tab==='accounting'){
   const lv=mgmtLevelV40('accountant'),cost=mgmtNextCostV401('accountant',lv);
   return `<div class="mgmt-tier-v40"><b>회계사 등급 ${lv}/5</b>${mgmtCostBadgeV401(cost)}<span>예상 사업세율 ${Math.max(3,10-lv*1.4).toFixed(1)}%</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('accountant')" ${lv>=5?'disabled':''}>${lv>=5?'최고 회계팀':'회계팀 강화 · '+money(cost)}</button><button onclick="payManagementTaxV40()">미납 세금 ${money(s.tax_due||0)} 납부</button></div><div class="mgmt-info-v40">미접속 수익·예금 이자·보유 자산 관리세가 누적됩니다. 성실 납부 시 신용이 소폭 상승합니다.</div>`;
 }
 if(tab==='logistics'){
   const lv=mgmtLevelV40('logistics'),cost=mgmtNextCostV401('logistics',lv);
   return `<div class="mgmt-tier-v40"><b>물류 시설 ${lv}/5</b>${mgmtCostBadgeV401(cost)}<span>배송 사고 위험 -${lv*8}%</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('logistics')" ${lv>=5?'disabled':''}>${lv>=5?'최고 물류망':'물류 시설 확장 · '+money(cost)}</button></div>`+renderOperationSystemV40('logistics',[['standard','일반 배송 계약','2,000만 원','30초'],['express','특급 배송망','1억 원','45초'],['secure','고가품 보안 운송','5억 원','60초']],true);
 }
 if(tab==='museum'){
   const lv=mgmtLevelV40('museum'),cost=mgmtNextCostV401('museum',lv);
   return `<div class="mgmt-tier-v40"><b>전시관 등급 ${lv}/5</b>${mgmtCostBadgeV401(cost)}<span>보유 소장품 ${managementStateV40.collectible_count||0}개</span></div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('museum')" ${lv>=5?'disabled':''}>${lv>=5?'최고 전시관':'전시관 확장 · '+money(cost)}</button><button onclick="claimManagementPassiveV40('museum')">미접속 관람료 정산</button></div>`+renderOperationSystemV40('museum',[['vintage','빈티지 특별전','5,000만 원','45초'],['royal','왕실 보물전','3억 원','75초'],['ancient','고대 유물 대전','20억 원','120초']],true);
 }
 if(tab==='franchise'){
   const lv=mgmtLevelV40('franchise'),names=['미운영','동네 상점','대학가 지점','관광지 매장','도심 플래그십','전국 프랜차이즈'],cost=mgmtNextCostV401('franchise',lv);
   return `<div class="mgmt-tier-v40"><b>현재 단계 ${lv} · ${names[lv]||names[5]}</b>${mgmtCostBadgeV401(cost)}</div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('franchise')" ${lv>=5?'disabled':''}>${lv>=5?'전국망 완성':'다음 상권 확장 · '+money(cost)}</button><button onclick="claimManagementPassiveV40('franchise')">미접속 영업 수익 정산</button></div><div class="mgmt-info-v40">30분 단위로 최대 24시간까지 누적되며, 정산 수익에는 누진 사업세가 붙습니다.</div>`;
 }
 if(tab==='family'&&mgmtLevelV40('family')>0){
   const lv=mgmtLevelV40('family'),cost=mgmtNextCostV401('family',lv),fname=s.family_name||'';
   return `<div class="mgmt-family-v40"><div class="family-emblem-v40">♛</div><div><b>${esc(fname)}</b><span>가문 단계 ${lv}/5 · 명성 ${Number(s.family_fame||0).toLocaleString()}</span></div></div><div class="mgmt-tier-v40">${mgmtCostBadgeV401(cost)}</div><div class="mgmt-action-grid-v40"><button onclick="upgradeManagementV40('family')" ${lv>=5?'disabled':''}>${lv>=5?'가문 유산 완성':'가문 유산 확장 · '+money(cost)}</button><button onclick="donateManagementFamilyV40()">가문 신탁에 1억 기부</button></div>`;
 }
 return renderManagementBodyV40Base(tab);
};

// Supabase 기본 1,000행 제한 때문에 새 뽑기마다 오래된 소장품이 사라져 보이던 문제 해결
loadCollectibles=async function(){
  const pageSize=1000,rows=[];let from=0;
  while(true){
    const{data,error}=await db.from('user_collectibles').select(`id,is_equipped,is_placed,is_listed,acquired_at,collectibles(id,name,type,rarity,effect_code,effect_name,effect_percent,icon)`).eq('user_id',currentUser.id).order('acquired_at',{ascending:false}).range(from,from+pageSize-1);
    if(error){toast(error.message);return}
    rows.push(...(data||[]));if(!data||data.length<pageSize)break;from+=pageSize;
  }
  collectibles=rows.map(r=>{if(r.collectibles?.rarity==='영웅')r.collectibles.rarity='진귀';if(r.collectibles){r.collectibles.effect_name=collectibleEffectLabel(r.collectibles.effect_code,r.collectibles.effect_name);r.collectibles.effect_percent=Number(r.collectibles.effect_percent||0)}return r});
  const savedCaseId=String(profile?.equipped_phone_case_id||'');
  const equippedRow=collectibles.find(x=>String(x.id)===savedCaseId&&x.collectibles?.type==='phone_case')||collectibles.find(x=>x.is_equipped&&x.collectibles?.type==='phone_case');
  const equippedGroup=equippedRow?getGroupedCollectibles('phone_case').find(g=>g.rows.some(r=>r.id===equippedRow.id)):getGroupedCollectibles('phone_case').find(g=>g.equippedCount>0);
  const eqEl=document.getElementById('equippedCase');if(eqEl)eqEl.innerHTML=equippedGroup?groupedCollectibleRow(equippedGroup,{mode:'equipped'}):'<p class="muted">장착 케이스 없음</p>';
  try{renderCollectiblePages()}catch(e){console.error(e)}try{renderCasePages()}catch(e){console.error(e)}try{applyPhoneCase(equippedRow)}catch(e){console.error(e)}
  fillCollectibleSelect();updateGachaButtons();
};

async function loadTradeNetworkV401(){
 const host=document.getElementById('tradeNetworkView');if(!host)return;host.innerHTML='<div class="bank-loading">무역 현황을 불러오는 중...</div>';
 const{data,error}=await db.rpc('get_trade_network_status_v401');if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}
 const n=data?.network||{},active=data?.active_shipment,current=Number(n.tier||0),cash=Number(profile?.cash||0),pending=Number(data?.offline_reward||0);
 const projects=active?`<article class="capital-active"><b>${esc(active.name)}</b><span>${active.ready?'정산 가능':active.remaining_seconds+'초 남음'}</span><button ${active.ready?'':'disabled'} onclick="claimTradeShipmentV391()">계약 정산</button></article>`:`<div class="capital-project-grid">${[['domestic','국내 프리미엄 도매 계약',100000000,1],['asia','아시아 수출 선적',500000000,2],['europe','유럽 럭셔리 유통 계약',2000000000,3],['global','글로벌 독점 공급 계약',10000000000,4]].map(x=>`<button ${current<x[3]?'disabled':''} onclick="startTradeShipmentV391('${x[0]}')"><b>${x[1]}</b><span>필요 ${money(x[2])}</span></button>`).join('')}</div>`;
 host.innerHTML=`<section class="capital-hero trade"><div><span>누적 무역 이익</span><b>${money(n.total_profit||0)}</b><small>신뢰도 ${Number(n.reputation||0).toLocaleString()}P</small></div><em>${current?TRADE_TIERS_V391[current-1].name:'네트워크 설립 전'}</em></section><div class="offline-reward-v401"><div><span>미접속 무역 수익</span><b>${money(pending)}</b><small>30분 단위 · 세금 별도 누적</small></div><button ${pending<=0?'disabled':''} onclick="claimTradeOfflineV401()">수익 정산</button></div><div class="capital-tier-grid">${capitalTierCardsV391(TRADE_TIERS_V391,current,cash,'upgradeTradeNetworkV391')}</div>${projects}`;
}
async function claimTradeOfflineV401(){const{data,error}=await db.rpc('claim_trade_offline_v401');if(error)return toast(error.message);toast(`무역 미접속 수익 ${money(data.net_amount)} · 세금 ${money(data.tax_added)}`);await Promise.all([loadProfile(),loadTradeNetworkV401()]);updateNetworth()}
async function loadBrandHouseV401(){
 const host=document.getElementById('brandHouseView');if(!host)return;host.innerHTML='<div class="bank-loading">브랜드 현황을 불러오는 중...</div>';
 const{data,error}=await db.rpc('get_brand_house_status_v401');if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}
 const b=data?.brand||{},active=data?.active_campaign,current=Number(b.tier||0),cash=Number(profile?.cash||0),pending=Number(data?.offline_reward||0);
 const projects=active?`<article class="capital-active"><b>${esc(active.name)}</b><span>${active.ready?'정산 가능':active.remaining_seconds+'초 남음'}</span><button ${active.ready?'':'disabled'} onclick="claimBrandCampaignV391()">캠페인 정산</button></article>`:`<div class="capital-project-grid">${[['limited','시즌 한정 컬렉션',200000000,1],['popup','백화점 팝업 스토어',1000000000,2],['ambassador','글로벌 앰배서더',5000000000,3],['world_launch','월드 플래그십 런칭',20000000000,4]].map(x=>`<button ${current<x[3]?'disabled':''} onclick="startBrandCampaignV391('${x[0]}')"><b>${x[1]}</b><span>필요 ${money(x[2])}</span></button>`).join('')}</div>`;
 host.innerHTML=`<section class="capital-hero brand"><div><span>브랜드 누적 매출</span><b>${money(b.total_sales||0)}</b><small>브랜드 가치 ${money(b.brand_value||0)} · 명성 ${Number(b.prestige||0).toLocaleString()}P</small></div><em>${current?BRAND_TIERS_V391[current-1].name:'브랜드 설립 전'}</em></section><div class="offline-reward-v401"><div><span>미접속 브랜드 로열티</span><b>${money(pending)}</b><small>30분 단위 · 세금 별도 누적</small></div><button ${pending<=0?'disabled':''} onclick="claimBrandOfflineV401()">로열티 정산</button></div><div class="capital-tier-grid">${capitalTierCardsV391(BRAND_TIERS_V391,current,cash,'buildBrandHouseV391')}</div>${projects}`;
}
async function claimBrandOfflineV401(){const{data,error}=await db.rpc('claim_brand_offline_v401');if(error)return toast(error.message);toast(`브랜드 미접속 수익 ${money(data.net_amount)} · 세금 ${money(data.tax_added)}`);await Promise.all([loadProfile(),loadBrandHouseV401()]);updateNetworth()}
const openPhoneAppV401=openPhoneApp;openPhoneApp=function(name){openPhoneAppV401(name);if(name==='trade')loadTradeNetworkV401();else if(name==='brand')loadBrandHouseV401()};

async function showLoginTaxV401(){
 const{data,error}=await db.rpc('get_login_tax_notice_v401');if(error){console.warn(error.message);return}
 if(!data||Number(data.total_due||0)<=0)return;
 const modal=document.getElementById('loginTaxModalV401');if(!modal)return;
 document.getElementById('loginTaxHoursV401').textContent=`${Number(data.offline_hours||0).toFixed(1)}시간`;
 document.getElementById('loginWealthTaxV401').textContent=money(data.wealth_tax_added||0);
 document.getElementById('loginIncomeTaxV401').textContent=money(Number(data.total_due||0)-Number(data.wealth_tax_added||0));
 document.getElementById('loginTotalTaxV401').textContent=money(data.total_due||0);
 const btn=document.getElementById('payLoginTaxBtnV401');btn.disabled=Number(profile?.cash||0)<Number(data.total_due||0);btn.textContent=btn.disabled?'현금 부족 · 세금 납부 필요':'세금 납부 후 게임 시작';
 modal.classList.remove('hidden');
}
async function payLoginTaxesV401(){const btn=document.getElementById('payLoginTaxBtnV401');btn.disabled=true;const{data,error}=await db.rpc('pay_all_taxes_v401');if(error){btn.disabled=false;return toast(error.message)}document.getElementById('loginTaxModalV401')?.classList.add('hidden');toast(`세금 ${money(data.amount)} 납부 · 신용 +${data.credit_gain}`);await loadProfile();updateNetworth()}
const enterGameV401=enterGame;enterGame=async function(){await enterGameV401();if(profile)setTimeout(showLoginTaxV401,250)};


/* ============================================================
   v40.2 ACCRUING TAX NOTICE / 30-MINUTE GRACE / NEGATIVE CASH
============================================================ */
let taxNoticeStateV402=null;
let taxNoticeTimerV402=null;
let taxReminderBucketV402=null;

function formatTaxRemainV402(seconds){
  const s=Math.max(0,Math.floor(Number(seconds)||0));
  const m=Math.floor(s/60),sec=s%60;
  return `${m}분 ${String(sec).padStart(2,'0')}초`;
}
function applyNegativeCashStyleV402(){
  const negative=Number(profile?.cash||0)<0;
  ['cashTop'].forEach(id=>document.getElementById(id)?.classList.toggle('negative-money-v402',negative));
  document.querySelectorAll('.wallet-card b').forEach(el=>{
    if(el.parentElement?.textContent?.trim().startsWith('현금'))el.classList.toggle('negative-money-v402',negative);
  });
  document.body.classList.toggle('has-negative-cash-v402',negative);
}
const loadProfileV402Base=loadProfile;
loadProfile=async function(){const result=await loadProfileV402Base();applyNegativeCashStyleV402();return result};
const renderWalletV402Base=renderWallet;
renderWallet=function(){renderWalletV402Base();applyNegativeCashStyleV402()};

function showTaxPhoneNoticeV402(title,text,urgent=false){
  showChatNotification({nickname:title,active_title:urgent?'긴급 고지':'세금 안내',chat_text:text,created_at:new Date().toISOString()});
  const notices=document.querySelectorAll('.chat-phone-notice');
  const last=notices[notices.length-1];
  if(last){last.classList.add('tax-phone-notice-v402');if(urgent)last.classList.add('urgent');}
}
async function refreshTaxNoticeV402(showModal=false){
  const {data,error}=await db.rpc('get_login_tax_notice_v402');
  if(error){console.warn('세금 고지 조회 실패:',error.message);return null}
  taxNoticeStateV402=data||null;
  if(data?.auto_collected){
    await loadProfile();updateNetworth();
    showTaxPhoneNoticeV402('세금 자동 징수',`유예기간이 만료되어 ${money(data.auto_collected_amount||0)}이 자동 징수되었습니다. 현금이 부족하면 잔액이 음수로 표시됩니다.`,true);
  }
  const due=Number(data?.total_due||0);
  if(showModal&&due>0){
    const modal=document.getElementById('loginTaxModalV401');modal?.classList.remove('hidden');
    document.getElementById('loginTaxHoursV401').textContent=`${Number(data.offline_hours||0).toFixed(1)}시간`;
    document.getElementById('loginWealthTaxV401').textContent=money(data.wealth_tax_added||0);
    document.getElementById('loginIncomeTaxV401').textContent=money(Math.max(0,due-Number(data.wealth_tax_added||0)));
    document.getElementById('loginTotalTaxV401').textContent=money(due);
  }
  updateTaxDeadlineUIV402();
  return data;
}
function updateTaxDeadlineUIV402(){
  const d=taxNoticeStateV402||{};
  const box=document.getElementById('taxDeadlineBoxV402');
  const txt=document.getElementById('taxDeadlineTextV402');
  const defer=document.getElementById('deferLoginTaxBtnV402');
  const remaining=Math.max(0,Number(d.remaining_seconds||0));
  const deferred=!!d.deferred;
  if(box)box.classList.toggle('hidden',!deferred);
  if(txt)txt.textContent=remaining>0?formatTaxRemainV402(remaining):'만기 처리 중';
  if(defer){defer.disabled=deferred;defer.textContent=deferred?'유예 적용됨':'지금 낼 수 없음 · 30분 유예'}
  const pay=document.getElementById('payLoginTaxBtnV401');
  if(pay){pay.disabled=Number(profile?.cash||0)<Number(d.total_due||0);pay.textContent=pay.disabled?'현금 부족 · 유예 선택 가능':'지금 세금 납부'}
}
async function showLoginTaxV401(){
  const data=await refreshTaxNoticeV402(true);
  if(!data||Number(data.total_due||0)<=0)return;
  startTaxReminderTimerV402();
}
async function payLoginTaxesV402(){
  const btn=document.getElementById('payLoginTaxBtnV401');if(btn)btn.disabled=true;
  const{data,error}=await db.rpc('pay_all_taxes_v402');
  if(error){if(btn)btn.disabled=false;return toast(error.message)}
  document.getElementById('loginTaxModalV401')?.classList.add('hidden');
  taxNoticeStateV402=null;taxReminderBucketV402=null;
  toast(`세금 ${money(data.amount)} 납부 · 신용 +${data.credit_gain}`);
  await loadProfile();updateNetworth();
}
async function deferLoginTaxesV402(){
  const{data,error}=await db.rpc('defer_tax_notice_v402');
  if(error)return toast(error.message);
  toast(`30분 납부 유예 시작 · 신용 ${data.credit_delta}`);
  await loadProfile();
  taxNoticeStateV402=data;
  document.getElementById('loginTaxModalV401')?.classList.add('hidden');
  showTaxPhoneNoticeV402('세금 납부 유예',`납부 기한까지 ${formatTaxRemainV402(data.remaining_seconds)} 남았습니다. 은행 또는 종합 경영에서 세금을 납부하세요.`,true);
  startTaxReminderTimerV402();
}
function startTaxReminderTimerV402(){
  clearInterval(taxNoticeTimerV402);
  taxNoticeTimerV402=setInterval(async()=>{
    const data=await refreshTaxNoticeV402(false);if(!data)return;
    const due=Number(data.total_due||0),remaining=Number(data.remaining_seconds||0);
    if(due<=0){clearInterval(taxNoticeTimerV402);return}
    if(data.deferred){
      const bucket=remaining>1200?30:remaining>600?20:remaining>0?10:0;
      if(bucket!==taxReminderBucketV402&&(bucket===20||bucket===10||bucket===0)){
        taxReminderBucketV402=bucket;
        showTaxPhoneNoticeV402(bucket===0?'세금 납부 기한 만료':`세금 납부 ${bucket}분 전`,bucket===0?`${money(due)}이 자동 징수됩니다.`:`미납 세금 ${money(due)} · 남은 시간 ${formatTaxRemainV402(remaining)}`,true);
      }
    }
  },30000);
}
const payManagementTaxV40Base=payManagementTaxV40;
payManagementTaxV40=async function(){
  const{data,error}=await db.rpc('pay_all_taxes_v402');
  if(error)return toast(error.message);
  toast(`세금 ${money(data.amount)} 납부 · 신용 +${data.credit_gain}`);
  taxNoticeStateV402=null;await loadProfile();await loadManagementV40();updateNetworth();
};


/* ============================================================
   v40.3 BANK TAX PAYMENT PANEL
============================================================ */
let bankTaxCountdownV403=null;

function bankTaxRemainingSecondsV403(){
  const d=taxNoticeStateV402||{};
  if(!d.deferred||!d.due_at)return 0;
  const end=new Date(d.due_at).getTime();
  return Math.max(0,Math.floor((end-Date.now())/1000));
}
function renderBankTaxPanelV403(){
  const host=document.getElementById('bankView');
  if(!host)return;
  host.querySelector('.bank-tax-panel-v403')?.remove();
  clearInterval(bankTaxCountdownV403);
  const d=taxNoticeStateV402||{};
  const due=Number(d.total_due||0);
  const cash=Number(profile?.cash||0);
  const deposit=Number(bankState?.deposit_balance||0);
  const deferred=!!d.deferred;
  const panel=document.createElement('section');
  panel.className='bank-product bank-tax-panel-v403'+(deferred?' deferred':'');
  panel.innerHTML=`<div class="bank-product-head"><span>🧾</span><div><h3>세금 납부 창구</h3><p>${due>0?'접속 고지서에 나온 미납 세금을 은행에서 납부할 수 있습니다.':'현재 납부할 세금이 없습니다.'}</p></div><b class="${due>0?'tax-due-v403':''}">${money(due)}</b></div>
    ${due>0?`<div class="bank-tax-status-v403"><div><span>보유 현금</span><b>${money(cash)}</b></div><div><span>자유예금</span><b>${money(deposit)}</b></div><div><span>납부 가능 자금</span><b>${money(cash+deposit)}</b></div>${deferred?`<div class="deadline"><span>납부 만기까지</span><b id="bankTaxDeadlineV403">${formatTaxRemainV402(bankTaxRemainingSecondsV403())}</b></div>`:''}</div>
    <div class="bank-tax-actions-v403"><button class="primary" ${cash<due?'disabled':''} onclick="payBankTaxCashV403()">현금으로 납부</button><button class="sub" ${cash+deposit<due||deposit<=0?'disabled':''} onclick="payBankTaxDepositV403()">현금 + 자유예금으로 납부</button></div>
    ${cash+deposit<due?`<small class="bank-tax-warning-v403">납부 가능 자금이 ${money(due-(cash+deposit))} 부족합니다. 대출 또는 다른 수익으로 자금을 마련해야 합니다.</small>`:`<small>자유예금 납부는 현금을 먼저 사용하고 부족한 금액만 예금에서 자동 출금합니다.</small>`}`:''}`;
  const hero=host.querySelector('.bank-hero');
  if(hero)hero.insertAdjacentElement('afterend',panel);else host.prepend(panel);
  if(deferred&&due>0){
    bankTaxCountdownV403=setInterval(()=>{
      const el=document.getElementById('bankTaxDeadlineV403');
      if(!el){clearInterval(bankTaxCountdownV403);return}
      const left=bankTaxRemainingSecondsV403();
      el.textContent=left>0?formatTaxRemainV402(left):'만기 처리 중';
      if(left<=0)clearInterval(bankTaxCountdownV403);
    },1000);
  }
}
async function payBankTaxCashV403(){
  const due=Number(taxNoticeStateV402?.total_due||0);
  if(due<=0)return toast('납부할 세금이 없습니다.');
  if(!confirm(`${money(due)}을 현금으로 납부할까요?`))return;
  const{data,error}=await db.rpc('pay_all_taxes_v402');
  if(error)return toast(error.message);
  taxNoticeStateV402=null;taxReminderBucketV402=null;
  toast(`세금 ${money(data.amount)} 납부 · 신용 +${data.credit_gain}`);
  await Promise.all([loadProfile(),loadBank(),loadManagementV40()]);
  updateNetworth();
}
async function payBankTaxDepositV403(){
  const due=Number(taxNoticeStateV402?.total_due||0);
  if(due<=0)return toast('납부할 세금이 없습니다.');
  if(!confirm(`${money(due)}을 현금과 자유예금에서 납부할까요? 부족분은 자유예금에서 자동 출금됩니다.`))return;
  const{data,error}=await db.rpc('pay_taxes_from_bank_v403');
  if(error)return toast(error.message);
  taxNoticeStateV402=null;taxReminderBucketV402=null;
  toast(`세금 ${money(data.amount)} 납부 · 예금 사용 ${money(data.deposit_used)} · 신용 +${data.credit_gain}`);
  await Promise.all([loadProfile(),loadBank(),loadManagementV40()]);
  updateNetworth();
}
const renderBankV403Base=renderBank;
renderBank=function(){renderBankV403Base();renderBankTaxPanelV403()};
const loadBankV403Base=loadBank;
loadBank=async function(){await refreshTaxNoticeV402(false);return loadBankV403Base()};


/* ============================================================
   v40.6 AUCTION VALUE CURVE + COLLECTIBLE AUCTION HOUSE
   ============================================================ */
let collectibleAuctionModeV406=false;

AUCTION_TIER_META_V35.collectible={name:'소장품 경매',icon:'🏛️',pass:0,listingFee:0,minRarity:5,npcPower:5.2};
AUCTION_BIDDER_POOLS_V386.collectible=['국립박물관 구매위원','왕실 컬렉션 대리인','세계문화재단 이사','익명 억만장자 수집가','글로벌 갤러리 회장','헤리티지 메종 오너','국제 유물 보존재단','초대형 패밀리오피스'];

const selectAuctionTierV406=selectAuctionTier;
selectAuctionTier=async function(tier,btn){
  if(tier==='collectible'){
    if(!auctionAccessV35.vvip){
      toast('소장품 경매는 VVIP 입장권을 보유해야 참여할 수 있습니다.');
      return;
    }
    auctionTierV35='collectible';
    collectibleAuctionModeV406=true;
    document.querySelectorAll('#auctionTierTabs button').forEach(x=>x.classList.toggle('active',x===btn));
    document.getElementById('auctionSellPanel')?.classList.add('hidden');
    document.getElementById('auctionBuyPanel')?.classList.remove('hidden');
    document.querySelectorAll('.auction-tabs button').forEach((x,i)=>x.classList.toggle('active',i===0));
    await loadAuctionLobby();
    return;
  }
  collectibleAuctionModeV406=false;
  return selectAuctionTierV406(tier,btn);
};

const switchAuctionModeV406=switchAuctionMode;
switchAuctionMode=function(mode,btn){
  if(auctionTierV35==='collectible'&&mode==='sell'){
    toast('소장품 경매의 개인 출품 기능은 별도 심사를 거쳐 추후 제공됩니다.');
    return;
  }
  return switchAuctionModeV406(mode,btn);
};

const loadAuctionLobbyV406=loadAuctionLobby;
loadAuctionLobby=async function(){
  if(auctionTierV35!=='collectible')return loadAuctionLobbyV406();
  clearInterval(auction?.interval);auction=null;
  const hall=document.getElementById('auctionHall');if(hall)hall.innerHTML='';
  await loadAuctionAccessV35();
  if(!auctionAccessV35.vvip){auctionTierV35='normal';collectibleAuctionModeV406=false;return loadAuctionLobbyV406();}
  document.querySelectorAll('#auctionTierTabs button').forEach(x=>x.classList.toggle('active',x.dataset.tier==='collectible'));
  const{data,error}=await db.rpc('get_collectible_auction_choices_v406');
  if(error){toast('소장품 경매 목록을 불러오지 못했습니다: '+error.message);return;}
  auctionChoices=Array.isArray(data?.choices)?data.choices:[];
  renderAuctionChoices(data?.refresh_at);
};

const renderAuctionChoicesV406=renderAuctionChoices;
renderAuctionChoices=function(refreshAt){
  if(auctionTierV35!=='collectible')return renderAuctionChoicesV406(refreshAt);
  const el=document.getElementById('auctionChoices');if(!el)return;
  const cards=(auctionChoices||[]).map((a,i)=>{
    if(a.ended)return `<div class="auction-choice auction-slot-ended"><div class="auction-ended-seal">경매 종료</div><h3>${esc(a.collectible_name||'종료된 소장품')}</h3><p>다음 교체 전까지 빈 자리로 유지됩니다.</p></div>`;
    const rc=rarityClass(a.rarity);
    return `<article class="auction-choice collectible-auction-card ${rc}">
      <button class="auction-enter-zone" onclick="enterAuctionChoice(${i})">
        <div class="collectible-auction-icon">${a.icon||'🏺'}</div>
        <h3 class="rarity-text ${rc}">${esc(a.collectible_name)}</h3>
        <div class="auction-rarity-caption rarity-text ${rc}">${esc(a.rarity)} · ${esc(a.type==='phone_case'?'케이스':'장식 소장품')}</div>
        <div class="collectible-auction-effect">${esc(a.effect_name||'특수 효과')} +${Number(a.effect_percent||0)}%</div>
        <b>시작가 ${money(a.start_price)}</b><small>초고액 경매 입장 →</small>
      </button>
    </article>`;
  }).join('');
  el.innerHTML=`<div id="auctionRotationBanner" class="rotation-banner auction-rotation tier-collectible"><div><b>🏛️ 소장품 특별 경매</b><small>유물은 최소 20억, 고대 유물은 최소 100억에서 시작하며 기관·재단·억만장자들이 치열하게 경쟁합니다.</small></div><strong>다음 교체 <span>--:--</span></strong></div>`+(cards||'<div class="panel empty-state">현재 특별 경매품이 없습니다.</div>');
  if(refreshAt)startRotationCountdown('auction',refreshAt,'auctionRotationBanner',()=>{if(!auction)loadAuctionLobby()});
};

const enterAuctionChoiceV406=enterAuctionChoice;
enterAuctionChoice=async function(i){
  if(auctionTierV35!=='collectible')return enterAuctionChoiceV406(i);
  const c=auctionChoices[i];if(!c||c.ended)return toast('이미 종료된 경매입니다.');
  const{data,error}=await db.rpc('create_collectible_auction_v406',{p_cycle_key:c.cycle_key,p_slot_no:c.slot_no});
  if(error)return toast(error.message);
  auction={id:data.auction_id,isCollectible:true,cycleKey:c.cycle_key,slotNo:c.slot_no,tier:'collectible',name:c.collectible_name,icon:c.icon,category:'collectible',rarity:c.rarity,price:Number(data.current_price),highest:false,stopped:false,bids:0,countdown:0,log:[`소장품 특별 경매 시작 ${money(data.current_price)}`]};
  document.getElementById('auctionChoices')?.classList.add('hidden');renderAuction({forceBottom:true});startAuctionLoop();
};

const renderAuctionV406=renderAuction;
renderAuction=function(options={}){
  if(!auction?.isCollectible)return renderAuctionV406(options);
  const oldLog=document.getElementById('auctionBidLog'),oldTop=oldLog?oldLog.scrollTop:0,wasNearBottom=oldLog?oldLog.scrollHeight-oldLog.scrollTop-oldLog.clientHeight<32:true;
  auctionHall.innerHTML=`<div class="auction-card v13 collectible-live-auction"><div class="collectible-live-icon ${rarityClass(auction.rarity)}">${auction.icon||'🏺'}</div><div><span class="badge ${rarityClass(auction.rarity)}">${esc(auction.rarity)}</span><h2 class="rarity-text ${rarityClass(auction.rarity)}">${esc(auction.name)}</h2><div class="bid-price"><span>현재 최고가</span><b>${money(auction.price)}</b><em id="auctionCountdownLabel" class="${auction.countdown?'':'hidden'}">${auction.countdown?`낙찰까지 ${auction.countdown}`:''}</em></div><div id="auctionBidLog" class="bid-log">${auction.log.map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="auction-actions"><button class="btn light" onclick="playerBid(5)">+5%</button><button class="btn light" onclick="playerBid(12)">+12%</button><button class="btn primary" onclick="leaveAuction()">경매 나가기</button></div></div></div>`;
  requestAnimationFrame(()=>{const log=document.getElementById('auctionBidLog');if(!log)return;if(options.forceBottom||wasNearBottom)log.scrollTop=log.scrollHeight;else log.scrollTop=oldTop;});
};

const startAuctionLoopV406=startAuctionLoop;
startAuctionLoop=function(){
  if(!auction?.isCollectible)return startAuctionLoopV406();
  clearInterval(auction.interval);
  auction.interval=setInterval(async()=>{
    if(!auction)return;
    const{data,error}=await db.rpc('npc_collectible_auction_step_v406',{p_auction_id:auction.id});
    if(error){clearInterval(auction.interval);return toast(error.message);}
    auction.price=Number(data.current_price);
    if(data.action==='hold'){auction.stopped=true;clearInterval(auction.interval);startAuctionCountdown();}
    else{auction.bids++;const bidder=chooseAuctionBidderV386('collectible',data.bidder_name,auction.lastNpcBidder);auction.lastNpcBidder=bidder;auction.log.push(`${bidder} ${data.action==='jump'?'대형 ':''}입찰 +${money(data.increment)}`);renderAuction({forceBottom:true});}
  },1100);
};

const playerBidV406=playerBid;
playerBid=async function(pct){
  if(!auction?.isCollectible)return playerBidV406(pct);
  const bid=Math.round(auction.price*(1+pct/100));
  const{data,error}=await db.rpc('place_collectible_auction_bid_v406',{p_auction_id:auction.id,p_bid_amount:bid});
  if(error)return toast(error.message);
  auction.price=Number(data.current_price);auction.highest=true;auction.bids++;auction.log.push('내 입찰 '+money(bid));renderAuction({forceBottom:true});
};

const startAuctionCountdownV406=startAuctionCountdown;
startAuctionCountdown=function(){
  if(!auction?.isCollectible)return startAuctionCountdownV406();
  auction.countdown=3;auction.log.push('추가 입찰이 없습니다. 3초 후 특별 경매가 종료됩니다.');renderAuction({forceBottom:true});
  const target=auction;
  const timer=setInterval(async()=>{
    if(!auction||auction!==target){clearInterval(timer);return;}
    auction.countdown--;updateAuctionCountdownLabel();if(auction.countdown>0)return;clearInterval(timer);
    const finished={...auction};
    if(auction.highest){
      const{data,error}=await db.rpc('claim_collectible_auction_v406',{p_auction_id:auction.id});
      if(error){auction.countdown=0;updateAuctionCountdownLabel();return toast(error.message);}
      if(data?.won){toast(`소장품 낙찰 성공 ${money(data.final_price)} · ${data.collectible_name}`);playJackpotSound();await Promise.all([loadProfile(),loadCollectibles()]);}
    }else{
      const{data,error}=await db.rpc('close_collectible_auction_v406',{p_auction_id:auction.id});
      if(error)console.warn(error.message);toast(data?.npc_won?`기관 낙찰 ${money(data.final_price)}`:'입찰자가 없어 유찰되었습니다.');
    }
    auctionChoices=auctionChoices.map(x=>x.cycle_key===finished.cycleKey&&x.slot_no===finished.slotNo?{...x,ended:true}:x);
    leaveAuction();renderAuctionChoices();
  },1000);
};


/* ============================================================
   v40.8 ONLINE 30-MIN TAX BILL / 5-MIN PRE-NOTICE / OFFLINE ACCRUAL
============================================================ */
let periodicTaxTimerV408=null;
let periodicTaxWarningKeyV408='';
let periodicTaxBillKeyV408='';
let periodicTaxBusyV408=false;

function taxCycleKeyV408(data){
  return String(data?.next_tax_at||'');
}

async function getPeriodicTaxStatusV408(){
  const {data,error}=await db.rpc('get_periodic_tax_status_v408');
  if(error){console.warn('30분 세금 주기 조회 실패:',error.message);return null}
  return data||null;
}

function updateTaxNoticeModalV408(data){
  if(!data)return;
  taxNoticeStateV402={
    ...(taxNoticeStateV402||{}),
    ...data,
    total_due:Number(data.total_due||0),
    wealth_tax_added:Number(data.accrued_amount||data.wealth_tax_added||0),
    offline_hours:Number(data.offline_hours||0),
    deferred:!!data.deferred,
    due_at:data.due_at||null,
    remaining_seconds:Number(data.grace_remaining_seconds||data.remaining_seconds||0)
  };
  const due=Number(data.total_due||0);
  const added=Number(data.accrued_amount||0);
  const modal=document.getElementById('loginTaxModalV401');
  if(!modal||due<=0)return;
  const hours=document.getElementById('loginTaxHoursV401');
  const wealth=document.getElementById('loginWealthTaxV401');
  const income=document.getElementById('loginIncomeTaxV401');
  const total=document.getElementById('loginTotalTaxV401');
  if(hours)hours.textContent=`${Number(data.offline_hours||0).toFixed(1)}시간`;
  if(wealth)wealth.textContent=money(added);
  if(income)income.textContent=money(Math.max(0,due-added));
  if(total)total.textContent=money(due);
  modal.classList.remove('hidden');
  updateTaxDeadlineUIV402();
}

async function runPeriodicTaxCheckV408({initial=false}={}){
  if(periodicTaxBusyV408||!profile||!currentUser)return;
  periodicTaxBusyV408=true;
  try{
    const data=await getPeriodicTaxStatusV408();
    if(!data)return;

    const nextSeconds=Math.max(0,Number(data.next_tax_seconds||0));
    const nextKey=taxCycleKeyV408(data);
    const periods=Math.max(0,Number(data.periods_accrued||0));
    const added=Math.max(0,Number(data.accrued_amount||0));
    const due=Math.max(0,Number(data.total_due||0));

    if(data.auto_collected){
      await loadProfile();
      updateNetworth();
      showTaxPhoneNoticeV402('세금 자동 징수',`납부 유예가 만료되어 ${money(data.auto_collected_amount||0)}이 자동 징수되었습니다.`,true);
    }

    // 접속 중 다음 30분 고지서가 오기 5분 전에 한 번만 알린다.
    if(nextSeconds>0&&nextSeconds<=300&&nextKey&&periodicTaxWarningKeyV408!==nextKey){
      periodicTaxWarningKeyV408=nextKey;
      showTaxPhoneNoticeV402('세금 고지서 5분 전',`다음 세금 고지서가 ${formatTaxRemainV402(nextSeconds)} 뒤 도착합니다.`,false);
    }

    // 30분 경계가 지나 새 세금이 실제로 누적된 경우 고지서를 띄운다.
    if(periods>0&&due>0){
      const billKey=`${nextKey}:${due}`;
      if(periodicTaxBillKeyV408!==billKey){
        periodicTaxBillKeyV408=billKey;
        periodicTaxWarningKeyV408='';
        if(!initial){
          showTaxPhoneNoticeV402('30분 세금 고지서',`${periods}회분 세금 ${money(added)}이 추가되어 총 미납액은 ${money(due)}입니다.`,true);
        }
        updateTaxNoticeModalV408(data);
        startTaxReminderTimerV402();
      }
    }

    // 이미 미납 세금이 있고 로그인 직후라면 기존 고지서를 보여준다.
    if(initial&&due>0){
      updateTaxNoticeModalV408(data);
      startTaxReminderTimerV402();
    }
  }finally{
    periodicTaxBusyV408=false;
  }
}

function startPeriodicTaxTimerV408(){
  clearInterval(periodicTaxTimerV408);
  runPeriodicTaxCheckV408({initial:true});
  periodicTaxTimerV408=setInterval(()=>runPeriodicTaxCheckV408(),30000);
}

const enterGameV408Base=enterGame;
enterGame=async function(){
  await enterGameV408Base();
  if(profile)setTimeout(startPeriodicTaxTimerV408,700);
};

/* ============================================================
   v40.10 FINAL HOTFIX
   - 브랜드 카운트다운 갱신 시 로열티 정산 카드 유지
   - 전체 채팅 알림/빨간점 실시간 + 타임스탬프 폴링 복구
   ============================================================ */
let brandStableTimerV4010=null;
let chatStableTimerV4010=null;
let chatStableBusyV4010=false;
let chatStableLastAtV4010='';
const chatStableNotifiedV4010=new Set();

function chatStableStorageKeyV4010(){
  return `sellingGodChatStableLastAt:${currentUser?.id||'guest'}`;
}
function chatRowStableKeyV4010(row){
  return String(row?.message_id??row?.id??`${row?.sender_user_id||''}:${row?.created_at||''}`);
}
function newestChatByTimeV4010(rows){
  if(!Array.isArray(rows)||!rows.length)return null;
  return rows.reduce((a,b)=>new Date(b?.created_at||0)>new Date(a?.created_at||0)?b:a,rows[0]);
}
function rememberChatTimeV4010(value){
  if(!value)return;
  if(!chatStableLastAtV4010||new Date(value)>new Date(chatStableLastAtV4010))chatStableLastAtV4010=value;
  try{localStorage.setItem(chatStableStorageKeyV4010(),chatStableLastAtV4010)}catch{}
}

async function loadBrandHouseStableV4010(){
  const host=document.getElementById('brandHouseView');
  if(!host)return;
  if(brandStableTimerV4010){clearTimeout(brandStableTimerV4010);brandStableTimerV4010=null}
  if(typeof brandTimerV391!=='undefined'&&brandTimerV391){clearTimeout(brandTimerV391);brandTimerV391=null}

  const previousScroll=host.scrollTop;
  const{data,error}=await db.rpc('get_brand_house_status_v401');
  if(error){host.innerHTML=`<div class="error-panel">${esc(error.message)}</div>`;return}

  const b=data?.brand||{};
  const active=data?.active_campaign;
  const current=Number(b.tier||0);
  const cash=Number(profile?.cash||0);
  const pending=Number(data?.offline_reward||0);
  const projects=active
    ?`<article class="capital-active"><b>${esc(active.name)}</b><span>${active.ready?'정산 가능':Math.max(0,Number(active.remaining_seconds||0))+'초 남음'}</span><button ${active.ready?'':'disabled'} onclick="claimBrandCampaignStableV4010()">캠페인 정산</button></article>`
    :`<div class="capital-project-grid">${[['limited','시즌 한정 컬렉션',200000000,1],['popup','백화점 팝업 스토어',1000000000,2],['ambassador','글로벌 앰배서더',5000000000,3],['world_launch','월드 플래그십 런칭',20000000000,4]].map(x=>`<button ${current<x[3]?'disabled':''} onclick="startBrandCampaignStableV4010('${x[0]}')"><b>${x[1]}</b><span>필요 ${money(x[2])}</span></button>`).join('')}</div>`;

  host.innerHTML=`<section class="capital-hero brand"><div><span>브랜드 누적 매출</span><b>${money(b.total_sales||0)}</b><small>브랜드 가치 ${money(b.brand_value||0)} · 명성 ${Number(b.prestige||0).toLocaleString()}P</small></div><em>${current?BRAND_TIERS_V391[current-1].name:'브랜드 설립 전'}</em></section>
  <div class="offline-reward-v401"><div><span>미접속 브랜드 로열티</span><b>${money(pending)}</b><small>30분 단위 · 세금 별도 누적</small></div><button ${pending<=0?'disabled':''} onclick="claimBrandOfflineStableV4010()">로열티 정산</button></div>
  <div class="capital-tier-grid">${capitalTierCardsV391(BRAND_TIERS_V391,current,cash,'buildBrandHouseStableV4010')}</div>${projects}`;
  host.scrollTop=previousScroll;

  if(active&&!active.ready&& !document.getElementById('phone-brand')?.classList.contains('hidden')){
    brandStableTimerV4010=setTimeout(loadBrandHouseStableV4010,1000);
  }
}
async function buildBrandHouseStableV4010(tier){
  if(!confirm(`${BRAND_TIERS_V391[tier-1].name}을 설립할까요?`))return;
  const{data,error}=await db.rpc('build_brand_house_v391',{p_tier:tier});
  if(error)return toast(error.message);
  toast(`${data.name} 설립 완료`);playSuccessSound();
  await loadProfile();await loadBrandHouseStableV4010();updateNetworth();
}
async function startBrandCampaignStableV4010(code){
  if(!confirm('브랜드 캠페인을 시작할까요? 제작비는 즉시 차감되며 흥행 실패 가능성이 있습니다.'))return;
  const{data,error}=await db.rpc('start_brand_campaign_v391',{p_code:code});
  if(error)return toast(error.message);
  toast(`${data.name} 시작`);await loadProfile();await loadBrandHouseStableV4010();
}
async function claimBrandCampaignStableV4010(){
  const{data,error}=await db.rpc('claim_brand_campaign_v391');
  if(error)return toast(error.message);
  toast(`${data.result_label} · 매출 ${money(data.payout)}`);playSuccessSound();
  await loadProfile();await loadBrandHouseStableV4010();updateNetworth();
}
async function claimBrandOfflineStableV4010(){
  const{data,error}=await db.rpc('claim_brand_offline_v401');
  if(error)return toast(error.message);
  toast(`브랜드 미접속 수익 ${money(data.net_amount)} · 세금 ${money(data.tax_added)}`);
  await loadProfile();await loadBrandHouseStableV4010();updateNetworth();
}

async function processChatStableV4010(row,{popup=true}={}){
  if(!row||!currentUser||row.sender_user_id===currentUser.id)return;
  const key=chatRowStableKeyV4010(row);
  if(isChatScreenOpen()){
    await loadChatMessages();
    markChatRead(row.created_at||new Date().toISOString());
    rememberChatTimeV4010(row.created_at);
    return;
  }
  setChatUnread(true);
  if(popup&&!chatStableNotifiedV4010.has(key)){
    chatStableNotifiedV4010.add(key);
    showChatNotification({
      nickname:row.nickname||'새 메시지',
      active_title:row.active_title||'초보 장사꾼',
      chat_text:row.chat_text||row.message||'',
      created_at:row.created_at||new Date().toISOString()
    });
    if(chatStableNotifiedV4010.size>150)chatStableNotifiedV4010.delete(chatStableNotifiedV4010.values().next().value);
  }
}
async function pollChatStableV4010(){
  if(chatStableBusyV4010||!currentUser)return;
  chatStableBusyV4010=true;
  try{
    const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:40});
    if(error)throw error;
    const rows=Array.isArray(data)?data:[];
    const baseline=chatStableLastAtV4010?new Date(chatStableLastAtV4010).getTime():0;
    const incoming=rows.filter(r=>new Date(r.created_at||0).getTime()>baseline).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
    for(const row of incoming)await processChatStableV4010(row,{popup:true});
    const newest=newestChatByTimeV4010(rows);
    if(newest)rememberChatTimeV4010(newest.created_at);
  }catch(error){console.warn('채팅 안정화 폴링 실패:',error)}finally{chatStableBusyV4010=false}
}
async function restartChatStableV4010(){
  if(chatStableTimerV4010){clearInterval(chatStableTimerV4010);chatStableTimerV4010=null}
  chatStableNotifiedV4010.clear();
  try{chatStableLastAtV4010=localStorage.getItem(chatStableStorageKeyV4010())||''}catch{chatStableLastAtV4010=''}

  try{
    const{data,error}=await db.rpc('get_global_chat_v31',{p_limit:40});
    if(!error){
      const rows=Array.isArray(data)?data:[];
      const newest=newestChatByTimeV4010(rows);
      if(!chatStableLastAtV4010&&newest)rememberChatTimeV4010(newest.created_at);
      let lastSeen='';try{lastSeen=localStorage.getItem(chatLastSeenStorageKey())||''}catch{}
      const unseen=rows.some(r=>r.sender_user_id!==currentUser.id&&lastSeen&&new Date(r.created_at)>new Date(lastSeen));
      if(unseen&&!isChatScreenOpen())setChatUnread(true);
    }
  }catch(error){console.warn('채팅 안정화 초기화 실패:',error)}

  // 기존 채널이 멈춰 있었을 수 있으므로 새로 연결한다.
  try{
    if(realtime){await db.removeChannel(realtime);realtime=null}
  }catch{}
  try{
    realtime=db.channel(`selling-god-chat-v4010-${currentUser.id}`)
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'stocks'},loadStocks)
      .on('postgres_changes',{event:'*',schema:'public',table:'market_listings'},loadMarket)
      .on('postgres_changes',{event:'*',schema:'public',table:'collectible_listings'},loadCollectibleMarket)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'global_chat_messages'},async payload=>{
        const raw=payload?.new||{};
        if(!raw?.id||raw.user_id===currentUser?.id)return;
        let row={message_id:raw.id,sender_user_id:raw.user_id,chat_text:raw.message,created_at:raw.created_at};
        try{const{data,error}=await db.rpc('get_global_chat_message_v34',{p_message_id:raw.id});if(!error){const h=Array.isArray(data)?data[0]:data;if(h)row=h}}catch{}
        await processChatStableV4010(row,{popup:true});
        rememberChatTimeV4010(row.created_at);
      }).subscribe();
  }catch(error){console.warn('채팅 실시간 재연결 실패:',error)}
  chatStableTimerV4010=setInterval(pollChatStableV4010,3000);
}

const openPhoneAppV4010Base=openPhoneApp;
openPhoneApp=function(name){
  openPhoneAppV4010Base(name);
  if(name==='brand'){
    if(typeof brandTimerV391!=='undefined'&&brandTimerV391){clearTimeout(brandTimerV391);brandTimerV391=null}
    setTimeout(loadBrandHouseStableV4010,0);
  }else if(brandStableTimerV4010){clearTimeout(brandStableTimerV4010);brandStableTimerV4010=null}
  if(name==='chat'){
    setChatUnread(false);
    setTimeout(async()=>{
      await loadChatMessages({forceBottom:true});
      const{data}=await db.rpc('get_global_chat_v31',{p_limit:1});
      const newest=newestChatByTimeV4010(Array.isArray(data)?data:[]);
      if(newest){markChatRead(newest.created_at);rememberChatTimeV4010(newest.created_at)}
    },0);
  }
};

const enterGameV4010Base=enterGame;
enterGame=async function(){
  await enterGameV4010Base();
  if(currentUser&&profile)setTimeout(restartChatStableV4010,900);
};

const logoutV4010Base=logout;
logout=async function(){
  if(brandStableTimerV4010){clearTimeout(brandStableTimerV4010);brandStableTimerV4010=null}
  if(chatStableTimerV4010){clearInterval(chatStableTimerV4010);chatStableTimerV4010=null}
  await logoutV4010Base();
};
