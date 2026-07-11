const SUPABASE_URL="https://qazjtevdljthbzmqmgrw.supabase.co";
const SUPABASE_ANON_KEY="sb_publishable_rIARlWBpKPvFAv_TtTdgaQ_Po-hOGmX";
const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

let authMode="login",currentUser=null,profile=null,inventory=[],stocks=[],holdings=[],collectibles=[],effects={},explore=null,auction=null,auctionChoices=[],sellerAuction=null,negotiation=null,job=null,selectedStock=null,toastTimer=null,realtime=null,negotiationSkills={},collectiblePage=1,casePage=1,decorationPage=1;

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
async function enterGame(){showGame();await db.rpc("ensure_player_save");await db.rpc("sync_skill_points_v15").catch(()=>{});await refreshAll();await grantStarterFundsIfNeeded();subscribe();setTimeout(hideBootScreen,280)}
function showAuth(){auth.classList.remove("hidden");game.classList.add("hidden");setTimeout(hideBootScreen,520)}
function showGame(){auth.classList.add("hidden");game.classList.remove("hidden");setTimeout(renderTradeDashboard,0)}
async function logout(){if(realtime)await db.removeChannel(realtime);await db.auth.signOut();showAuth()}
function openPage(name,btn){document.querySelectorAll(".page").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".nav button").forEach(x=>x.classList.remove("active"));document.getElementById("page-"+name).classList.add("active");btn?.classList.add("active");({inventory:loadInventory,pawnshop:loadPawnshop,auction:loadAuctionLobby,market:loadMarketHub,house:loadHouse,collection:loadCollectibles,jobs:resetJobPage}[name]||(()=>{}))()}
function openPageFromPhone(name){closePhone();openPage(name,document.querySelector(`[data-page="${name}"]`))}
async function refreshAll(){await updateStocks();await loadProfile();await Promise.all([loadInventory(),loadStocks(),loadCollectibles(),loadEffects()]);updateNetworth()}
async function loadProfile(){const{data,error}=await db.from("profiles").select("*").eq("id",currentUser.id).single();if(error)return toast(error.message);profile=data;renderTradeDashboard();nicknameTop.textContent=data.nickname;nicknameHero.textContent=data.nickname;phoneOwner.textContent=data.nickname;cashTop.textContent=money(data.cash);credit.textContent=data.credit_score;reputation.textContent=data.reputation;updateGachaButtons();const t=document.getElementById("titleTop");if(t)t.textContent=data.active_title||titleByProgress(data)}
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
  const recommended=Math.min(n.limit,Math.round(Math.max(n.npcOffer+1000,n.npcOffer*1.05,n.market*.98)));
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
      <div class="manual-offer advanced"><div class="offer-copy"><label>내 희망 판매가</label><small>추천 ${money(recommended)} · 최대 예상 ${money(n.limit)}</small></div><div class="offer-controls"><button onclick="adjustHaggleAsk(-10000)">-1만</button><button onclick="adjustHaggleAsk(-1000)">-1천</button><input id="haggleAsk" type="number" min="${n.npcOffer+1}" max="${n.limit}" value="${recommended}"><button onclick="adjustHaggleAsk(1000)">+1천</button><button onclick="adjustHaggleAsk(10000)">+1만</button><button class="recommend" onclick="setRecommendedHaggle(${recommended})">추천가</button></div></div>
      <div class="haggle-actions skill-grid">${actionHtml}</div>`}
    <button class="accept-now" onclick="acceptNpcCounter()">현재 제안 확정 · 순이익 ${profit>=0?'+':''}${money(profit)}</button>`;
  requestAnimationFrame(()=>{const chat=document.getElementById('negChat');if(chat)chat.scrollTop=chat.scrollHeight});
}
function adjustHaggleAsk(delta){const el=document.getElementById('haggleAsk'),n=negotiation;if(!el||!n)return;el.value=Math.max(n.npcOffer+1,Math.min(n.limit,Math.round(Number(el.value||n.npcOffer)+delta)))}
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
  const gain=Math.max(1,Math.round((target-n.npcOffer)*cfg.power*(.82+Math.random()*.28)));n.npcOffer=Math.min(n.limit,n.npcOffer+gain);n.mood="good";n.history.push({who:"npc",text:`좋아. ${money(n.npcOffer)}까지 올리지. ${n.patience<=1?'이게 거의 마지막 양보야.':'다음 제안도 들어보겠네.'}`});if(n.npcOffer>=n.limit||n.patience<=0)n.ended=true;renderNegotiation()
}
async function acceptNpcCounter(){
  const n=negotiation;if(!n)return;const final=Math.round(n.npcOffer),profit=negotiationProfit(n,final);
  if(n.type==="pawn")await pawnSell(n.id,"negotiated",Math.round(final/n.base*100));else{const{data,error}=await db.rpc("accept_npc_market_offer",{p_offer_id:n.offerId,p_final_price:final});if(error)return toast(error.message);await Promise.all([loadProfile(),loadNpcOffers(),loadInventory()])}
  saveTradeLedger({title:n.title,base:n.base,final,profit,rounds:n.round-1,persona:n.persona?.name||"NPC"});toast(`거래 성사 · 판매 ${money(final)} · 추가이익 ${profit>=0?'+':''}${money(profit)}`);closeNegotiation()
}
function closeNegotiation(){negotiation=null;negotiationModal.classList.add("hidden")}

/* 경매 v13 */
function switchAuctionMode(mode,btn){document.querySelectorAll('.auction-tabs button').forEach(x=>x.classList.remove('active'));btn?.classList.add('active');auctionBuyPanel.classList.toggle('hidden',mode!=='buy');auctionSellPanel.classList.toggle('hidden',mode!=='sell');if(mode==='sell')fillAuctionSellItems();else loadAuctionLobby()}
async function loadAuction(){return loadAuctionLobby()}
async function loadAuctionLobby(){clearInterval(auction?.interval);auction=null;auctionHall.innerHTML='';const{data,error}=await db.rpc('get_auction_choices_v13');if(error){auctionChoices=localAuctionChoices();}else auctionChoices=data||[];renderAuctionChoices()}
function localAuctionChoices(){return inventory.slice(0,3).map((r,i)=>({item_id:r.items.id,item_name:r.items.name,category:r.items.category,rarity:r.items.rarity,condition_score:r.condition_score,start_price:Math.max(1000,Math.round(itemValue(r.items.average_price,r.condition_score)*(.55+i*.06)))}))}
function renderAuctionChoices(){const el=document.getElementById('auctionChoices');el.innerHTML=(auctionChoices||[]).map((a,i)=>`<button class="auction-choice" onclick="enterAuctionChoice(${i})"><img src="${itemImage(a.item_name,a.category)}"><span class="badge normal">${esc(a.rarity)}</span><h3>${esc(a.item_name)}</h3><div>상태 ${a.condition_score}/100</div><b>시작가 ${money(a.start_price)}</b><small>입장하기 →</small></button>`).join('')||'<div class="panel empty-state">현재 경매품이 없습니다.</div>'}
async function enterAuctionChoice(i){const c=auctionChoices[i];const{data,error}=await db.rpc('create_auction_choice_v13',{p_item_id:c.item_id,p_condition:c.condition_score,p_start_price:c.start_price});if(error)return toast(error.message);auction={id:data.auction_id,name:c.item_name,category:c.category,rarity:c.rarity,price:Number(data.current_price),highest:false,stopped:false,bids:0,countdown:0,log:[`경매 시작 ${money(data.current_price)}`]};document.getElementById('auctionChoices').classList.add('hidden');renderAuction();startAuctionLoop()}
function renderAuction(){if(!auction)return;auctionHall.innerHTML=`<div class="auction-card v13"><img src="${itemImage(auction.name,auction.category)}"><div><span class="badge normal">${esc(auction.rarity)}</span><h2>${esc(auction.name)}</h2><div class="bid-price"><span>현재 최고가</span><b>${money(auction.price)}</b>${auction.countdown?`<em>낙찰까지 ${auction.countdown}</em>`:''}</div><div class="bid-log">${auction.log.slice(-8).map(x=>`<p>${esc(x)}</p>`).join('')}</div><div class="auction-actions"><button class="btn light" onclick="playerBid(5)">+5%</button><button class="btn light" onclick="playerBid(12)">+12%</button><button class="btn primary" onclick="leaveAuction()">경매 나가기</button></div></div></div>`}
function leaveAuction(){clearInterval(auction?.interval);auction=null;document.getElementById('auctionChoices').classList.remove('hidden');auctionHall.innerHTML=''}
function startAuctionLoop(){clearInterval(auction.interval);auction.interval=setInterval(async()=>{if(!auction)return;const{data,error}=await db.rpc('npc_auction_step',{p_auction_id:auction.id});if(error){clearInterval(auction.interval);return toast(error.message)}auction.price=Number(data.current_price);if(data.action==='hold'){auction.stopped=true;auction.log.push('입찰이 멈췄습니다. 3초 카운트다운');clearInterval(auction.interval);startAuctionCountdown()}else{auction.bids++;auction.log.push(data.action==='raise'?`NPC 입찰 +${money(data.increment)}`:`NPC 강한 입찰 +${money(data.increment)}`);renderAuction()}},1800)}
function startAuctionCountdown(){auction.countdown=3;renderAuction();const t=setInterval(async()=>{if(!auction)return clearInterval(t);auction.countdown--;renderAuction();if(auction.countdown<=0){clearInterval(t);if(auction.highest){const{data,error}=await db.rpc('claim_auction',{p_auction_id:auction.id});if(error)return toast(error.message);if(data.won){toast('낙찰 성공 '+money(data.final_price));playSuccessSound();await Promise.all([loadProfile(),loadInventory()])}}else toast('입찰자가 없어 유찰되었습니다.');leaveAuction()}},1000)}
async function playerBid(pct){if(!auction)return;const bid=Math.round(auction.price*(1+pct/100));const{data,error}=await db.rpc('place_auction_bid',{p_auction_id:auction.id,p_bid_amount:bid});if(error)return toast(error.message);auction.price=Number(data.current_price);auction.highest=true;auction.bids++;auction.log.push('내 입찰 '+money(bid));renderAuction()}
function fillAuctionSellItems(){auctionSellItem.innerHTML='<option value="">출품할 아이템 선택</option>';inventory.filter(x=>!x.is_listed).forEach(x=>auctionSellItem.add(new Option(`${x.items.name} · ${x.items.rarity} · 상태 ${x.condition_score}`,x.id)))}
async function startSellerAuction(){const id=auctionSellItem.value,r=inventory.find(x=>x.id===id);if(!r)return toast('출품할 아이템을 선택하세요.');const{data,error}=await db.rpc('start_npc_seller_auction_v13',{p_user_item_id:id});if(error)return toast(error.message);sellerAuction={session:data.session_id,item:r,current:Number(data.start_price),step:0,maxSteps:Number(data.max_steps),log:[`시작가 ${money(data.start_price)}`],countdown:0,lastBidAt:Date.now(),timer:null,ending:false};renderSellerAuction();runSellerAuction()}
function renderSellerAuction(){const s=sellerAuction;if(!s)return;sellerAuctionHall.innerHTML=`<div class="seller-live"><img src="${itemImage(s.item.items.name,s.item.items.category)}"><div><p class="eyebrow">NPC COLLECTOR BATTLE</p><h2>${esc(s.item.items.name)}</h2><div class="seller-price">현재 입찰가 <b>${money(s.current)}</b>${s.countdown?`<em class="seller-countdown">판매까지 ${s.countdown}</em>`:''}</div><div class="collector-row"><span>🧐 감정가</span><span>🤑 수집가</span><span>😎 리셀러</span></div><div class="bid-log">${s.log.slice(-7).map(x=>`<p>${esc(x)}</p>`).join('')}</div></div></div>`}
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
async function loadNpcOffers(){const{error:gerr}=await db.rpc('generate_npc_purchase_offers_v18');if(gerr)return toast(gerr.message);const{data,error}=await db.from('npc_purchase_offers').select(`id,condition_score,asking_price,min_price,items(id,name,category,rarity,average_price)`).eq('user_id',currentUser.id).eq('status','active').gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false});if(error)return toast(error.message);npcOfferList.innerHTML=(data||[]).map(o=>`<article class="market-card npc-buy-card"><div class="item-image"><img src="${itemImage(o.items.name,o.items.category)}"></div><div class="market-body"><span class="badge normal">NPC 판매</span><h3>${esc(o.items.name)}</h3><div class="meta">${esc(o.items.rarity)} · 상태 ${o.condition_score}/100</div><div class="price">판매가 ${money(o.asking_price)}</div><small class="market-hint">흥정하면 더 싸게 구매할 수 있습니다.</small><button class="btn primary full" onclick="startNpcOffer('${o.id}')">가격 흥정하기</button></div></article>`).join('')||'<div class="panel" style="padding:20px">현재 NPC 판매 상품이 없습니다.</div>'}
async function startNpcOffer(id){const{data,error}=await db.from('npc_purchase_offers').select(`id,condition_score,asking_price,min_price,items(id,name,category,rarity)`).eq('id',id).eq('status','active').single();if(error)return toast(error.message);const personalities=[{name:'완고한 골동품상',icon:'🧔',patience:4,openness:.42,line:'터무니없는 가격은 받지 않소.'},{name:'급전이 필요한 상인',icon:'😓',patience:3,openness:.72,line:'오늘 안에만 팔리면 조금 깎아줄게요.'},{name:'친절한 수집가',icon:'🙂',patience:5,openness:.58,line:'합리적인 제안이면 생각해 보죠.'}];const persona=personalities[Math.floor(Math.random()*personalities.length)];negotiation={type:'npc_buy',offerId:id,itemId:data.items.id,title:data.items.name,category:data.items.category,rarity:data.items.rarity,condition:Number(data.condition_score),asking:Number(data.asking_price),minPrice:Number(data.min_price),npcOffer:Number(data.asking_price),round:1,patience:persona.patience,maxPatience:persona.patience,persona,history:[{who:'npc',text:`${money(data.asking_price)}에 내놓았습니다. 어느 정도를 생각하시나요?`}],ended:false};renderNpcBuyNegotiation()}
function renderNpcBuyNegotiation(){const n=negotiation;if(!n||n.type!=='npc_buy')return;negotiationModal.classList.remove('hidden');const discount=n.asking-n.npcOffer,discountPct=n.asking?discount/n.asking*100:0,recommended=Math.max(n.minPrice,Math.round(n.npcOffer-(n.npcOffer-n.minPrice)*.45));const patiencePct=Math.max(0,n.patience/n.maxPatience*100),history=n.history.map(x=>`<div class="chat ${x.who}"><b>${x.who==='npc'?n.persona.name:'나'}</b><span>${esc(x.text)}</span></div>`).join('');negotiationContent.innerHTML=`<div class="haggle-top"><div><p class="eyebrow">NPC PURCHASE NEGOTIATION · ROUND ${n.round}</p><h2>${esc(n.title)}</h2></div><div class="dealer-profile"><strong>${n.persona.icon} ${n.persona.name}</strong><small>${n.persona.line}</small></div></div><div class="deal-summary deluxe buy-mode"><div><span>최초 판매가</span><b>${money(n.asking)}</b></div><div><span>최저 가능가</span><b>${money(n.minPrice)}</b></div><div class="offer-main"><span>현재 구매가</span><b>${money(n.npcOffer)}</b></div><div class="profit-main"><span>절약 금액</span><b class="up">-${money(discount)}</b><small>${discountPct.toFixed(1)}% 할인</small></div></div><div class="haggle-bars"><label>판매자 인내심 <i><em style="width:${patiencePct}%"></em></i></label><label>가격 할인 진행 <i><em style="width:${Math.min(100,discount/Math.max(1,n.asking-n.minPrice)*100)}%"></em></i></label></div><div id="negChat" class="neg-chat">${history}</div>${n.ended?`<div class="final-offer"><b>최종 판매가</b><strong>${money(n.npcOffer)}</strong><button onclick="acceptNpcBuyDeal()">이 가격에 구매</button></div>`:`<div class="manual-offer advanced"><div class="offer-copy"><label>내 희망 구매가</label><small>추천 ${money(recommended)} · 최저 ${money(n.minPrice)}</small></div><div class="offer-controls"><button onclick="adjustNpcBuyAsk(-10000)">-1만</button><button onclick="adjustNpcBuyAsk(-1000)">-1천</button><input id="npcBuyAsk" type="number" min="${n.minPrice}" max="${n.npcOffer-1}" value="${recommended}"><button onclick="adjustNpcBuyAsk(1000)">+1천</button><button onclick="adjustNpcBuyAsk(10000)">+1만</button><button class="recommend" onclick="setNpcBuyRecommended(${recommended})">추천가</button></div></div><div class="haggle-actions skill-grid"><button class="haggle-skill-btn" onclick="submitNpcBuyOffer('polite')"><b>🤝 정중하게 할인 요청</b><small>안전형 · 할인폭이 작음</small></button><button class="haggle-skill-btn" onclick="submitNpcBuyOffer('defect')"><b>🔎 상태 흠집 지적</b><small>상태가 낮을수록 효과적</small></button><button class="haggle-skill-btn" onclick="submitNpcBuyOffer('cash')"><b>💵 즉시 결제 제안</b><small>중간 위험 · 빠른 할인</small></button><button class="haggle-skill-btn" onclick="submitNpcBuyOffer('walk')"><b>🚶 다른 매물 보러가기</b><small>고위험 · 성공 시 큰 할인</small></button></div>`}<button class="accept-now" onclick="acceptNpcBuyDeal()">현재 가격으로 구매 · ${money(n.npcOffer)}</button>`;requestAnimationFrame(()=>{const chat=document.getElementById('negChat');if(chat)chat.scrollTop=chat.scrollHeight})}
function adjustNpcBuyAsk(delta){const el=document.getElementById('npcBuyAsk'),n=negotiation;if(!el||!n)return;el.value=Math.max(n.minPrice,Math.min(n.npcOffer-1,Math.round(Number(el.value||n.npcOffer)+delta)))}
function setNpcBuyRecommended(v){const el=document.getElementById('npcBuyAsk');if(el)el.value=v}
function submitNpcBuyOffer(style){const n=negotiation;if(!n||n.type!=='npc_buy'||n.ended)return;const el=document.getElementById('npcBuyAsk'),ask=Math.max(n.minPrice,Math.min(n.npcOffer-1,Math.round(Number(el?.value)||n.npcOffer-1)));const cfg={polite:{risk:.08,power:.28,cost:0,label:'정중하게 가격 조정을 부탁했다.'},defect:{risk:.14,power:.48,cost:1,label:'물건 상태와 흠집을 근거로 가격을 낮춰 달라고 했다.'},cash:{risk:.18,power:.56,cost:1,label:'지금 바로 결제하겠다고 제안했다.'},walk:{risk:.42,power:.9,cost:2,label:'다른 매물을 보러 가겠다고 일어섰다.'}}[style];const conditionBonus=style==='defect'?(100-n.condition)/160:0;const gap=(n.npcOffer-ask)/Math.max(1,n.npcOffer-n.minPrice),fail=Math.min(.9,cfg.risk+Math.max(0,gap-n.persona.openness)*.68-conditionBonus);n.history.push({who:'me',text:`${cfg.label} 희망가는 ${money(ask)}.`});n.round++;n.patience=Math.max(0,n.patience-cfg.cost);if(Math.random()<fail){n.patience=Math.max(0,n.patience-1);n.history.push({who:'npc',text:n.patience<=0?`더는 어렵습니다. ${money(n.npcOffer)}이 최종 가격입니다.`:'그 가격은 너무 낮습니다. 조금 더 현실적으로 제안해 주세요.'});if(n.patience<=0)n.ended=true;renderNpcBuyNegotiation();return}const cut=Math.max(1,Math.round((n.npcOffer-ask)*cfg.power*(.82+Math.random()*.3)));n.npcOffer=Math.max(n.minPrice,n.npcOffer-cut);n.history.push({who:'npc',text:`좋습니다. ${money(n.npcOffer)}까지는 낮춰드리죠.`});if(n.npcOffer<=n.minPrice||n.patience<=0)n.ended=true;renderNpcBuyNegotiation()}
async function acceptNpcBuyDeal(){const n=negotiation;if(!n||n.type!=='npc_buy')return;const{data,error}=await db.rpc('purchase_npc_offer_v18',{p_offer_id:n.offerId,p_final_price:Math.round(n.npcOffer)});if(error)return toast(error.message);toast(`구매 완료 ${money(data.final_price)} · ${money(n.asking-data.final_price)} 절약`);playSuccessSound();closeNegotiation();await Promise.all([loadProfile(),loadInventory(),loadNpcOffers()]);updateNetworth()}

/* 소장품/집 */
function switchCollectionTab(name,btn){document.querySelectorAll('.collection-tabs button').forEach(x=>x.classList.remove('active'));document.querySelectorAll('.collection-tab-panel').forEach(x=>x.classList.add('hidden'));btn?.classList.add('active');document.getElementById('collection-'+name)?.classList.remove('hidden');}
function updateGachaButtons(){const poor=!profile||Number(profile.cash)<300000;['decorGachaBtn','caseGachaBtn'].forEach(id=>{const b=document.getElementById(id);if(!b)return;b.disabled=poor;b.title=poor?'현금 30만원이 필요합니다.':'';});}
async function drawCollectible(type){if(!profile||Number(profile.cash)<300000){updateGachaButtons();return toast('뽑기에는 현금 30만원이 필요합니다.')}const btn=document.getElementById(type==='phone_case'?'caseGachaBtn':'decorGachaBtn');if(btn?.disabled)return;btn.disabled=true;const modal=document.getElementById('gachaModal');modal.classList.remove('hidden');modal.className='overlay gacha-spinning rarity-0';gachaRarity.textContent='두근두근...';gachaResultIcon.textContent=type==='phone_case'?'📱':'🏺';gachaResultName.textContent='캡슐 개봉 중';gachaResultName.className='';gachaResultEffect.textContent='빛이 강해집니다';playGachaBuild();await wait(1700);const{data,error}=await db.rpc('draw_collectible_v19',{p_type:type});if(error){closeGachaReveal();btn.disabled=false;updateGachaButtons();return toast(error.message)}const rank=rarityScore(data.rarity);modal.className=`overlay gacha-reveal rarity-${rank}`;gachaRarity.textContent=data.rarity;gachaResultIcon.textContent=data.icon||'✨';gachaResultName.textContent=data.name;gachaResultName.className=`rarity-text ${rarityClass(data.rarity)}`;gachaResultEffect.textContent=`${data.effect_name} +${data.effect_percent}%`;rank>=4?playJackpotSound():playSuccessSound();await Promise.all([loadProfile(),loadCollectibles()]);updateNetworth();updateGachaButtons()}
function closeGachaReveal(){gachaModal.className='overlay hidden'}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function loadCollectibles(){const{data,error}=await db.from('user_collectibles').select(`id,is_equipped,is_placed,is_listed,collectibles(id,name,type,rarity,effect_code,effect_name,effect_percent,icon)`).eq('user_id',currentUser.id).order('acquired_at',{ascending:false});if(error)return toast(error.message);collectibles=(data||[]).map(r=>{if(r.collectibles?.rarity==='영웅')r.collectibles.rarity='진귀';return r});const eq=collectibles.find(x=>x.is_equipped&&x.collectibles.type==='phone_case');const eqEl=document.getElementById('equippedCase');if(eqEl)eqEl.innerHTML=eq?collectibleRow(eq):'<p class="muted">장착 케이스 없음</p>';renderCollectiblePages();renderCasePages();applyPhoneCase(eq);fillCollectibleSelect();updateGachaButtons()}
function renderCollectiblePages(){const list=collectibles.filter(x=>x.collectibles.type==='decoration'),pageSize=6,total=Math.max(1,Math.ceil(list.length/pageSize));collectiblePage=Math.min(Math.max(1,collectiblePage),total);const start=(collectiblePage-1)*pageSize;const el=document.getElementById('collectibleInventory');if(el)el.innerHTML=list.slice(start,start+pageSize).map(collectibleRow).join('')||'<p class="muted">소장품 없음</p>';const info=document.getElementById('collectiblePageInfo');if(info)info.textContent=`${collectiblePage}P / ${total}P · 총 ${list.length}개`;const prev=document.getElementById('collectiblePrev'),next=document.getElementById('collectibleNext');if(prev)prev.disabled=collectiblePage<=1;if(next)next.disabled=collectiblePage>=total;}
function changeCollectiblePage(step){const total=Math.max(1,Math.ceil(collectibles.filter(x=>x.collectibles.type==='decoration').length/6));collectiblePage=Math.min(total,Math.max(1,collectiblePage+step));renderCollectiblePages()}
function renderCasePages(){const list=collectibles.filter(x=>x.collectibles.type==='phone_case'),pageSize=6,total=Math.max(1,Math.ceil(list.length/pageSize));casePage=Math.min(Math.max(1,casePage),total);const start=(casePage-1)*pageSize;const el=document.getElementById('caseInventory');if(el)el.innerHTML=list.slice(start,start+pageSize).map(collectibleRow).join('')||'<p class="muted">보유 케이스 없음</p>';const info=document.getElementById('casePageInfo');if(info)info.textContent=`${casePage}P / ${total}P · 총 ${list.length}개`;const prev=document.getElementById('casePrev'),next=document.getElementById('caseNext');if(prev)prev.disabled=casePage<=1;if(next)next.disabled=casePage>=total;}
function changeCasePage(step){const total=Math.max(1,Math.ceil(collectibles.filter(x=>x.collectibles.type==='phone_case').length/6));casePage=Math.min(total,Math.max(1,casePage+step));renderCasePages()}
function collectibleRow(r){const c=r.collectibles,rc=rarityClass(c.rarity);return `<div class="collectible ${rc}"><span>${c.icon} <b class="rarity-text ${rc}">${esc(c.name)}</b><br><small><span class="rarity-text ${rc}">${esc(c.rarity)}</span> · ${esc(c.effect_name)} +${c.effect_percent}%</small></span><button class="btn light" onclick="${c.type==='phone_case'?`equipCollectible('${r.id}','equip')`:`equipCollectible('${r.id}','place')`}">${c.type==='phone_case'?(r.is_equipped?'장착 중':'장착'):(r.is_placed?'배치됨':'배치')}</button></div>`}
async function equipCollectible(id,action){const r=collectibles.find(x=>x.id===id);if(action==='place'){const placed=collectibles.filter(x=>x.is_placed&&x.collectibles.type==='decoration').length,cap=Number(profile?.house_capacity||1);if(!r.is_placed&&placed>=cap)return toast(`현재 집에는 장식 ${cap}개까지만 배치할 수 있습니다.`)}const{error}=await db.rpc('equip_collectible',{p_user_collectible_id:id,p_action:action});if(error)return toast(error.message);await Promise.all([loadCollectibles(),loadHouse(),loadEffects()])}
function applyPhoneCase(eq){const shell=document.querySelector('.phone-shell'),home=document.querySelector('.phone-home');if(!shell||!home)return;const name=eq?.collectibles?.name||'',rarity=eq?.collectibles?.rarity||'일반';shell.dataset.case=name;shell.dataset.rarity=rarityScore(rarity);home.dataset.wallpaper=name;home.dataset.rarity=rarityScore(rarity);phoneOwner.textContent=profile?.nickname||'판매왕'}
function fillCollectibleSelect(){sellCollectible.innerHTML='<option value="">판매할 소장품</option>';collectibles.filter(x=>!x.is_equipped&&!x.is_placed&&!x.is_listed).forEach(x=>sellCollectible.add(new Option(`${x.collectibles.name} · ${x.collectibles.effect_percent}%`,x.id)))}
async function createCollectibleListing(){const id=sellCollectible.value,p=Math.floor(Number(collectiblePrice.value));if(!id||p<=0)return toast('소장품과 가격을 확인하세요.');const{error}=await db.rpc('create_collectible_listing',{p_user_collectible_id:id,p_price:p});if(error)return toast(error.message);collectiblePrice.value='';await loadCollectibleMarket()}
async function loadCollectibleMarket(){const{data,error}=await db.from('collectible_listings').select(`id,asking_price,seller_user_id,user_collectibles(collectibles(name,rarity,effect_name,effect_percent,icon)),profiles:seller_user_id(nickname)`).eq('status','active').order('created_at',{ascending:false});if(error)return toast(error.message);collectibleMarketList.innerHTML=(data||[]).map(r=>{const c=r.user_collectibles.collectibles,mine=r.seller_user_id===currentUser.id;return `<article class="market-card"><div class="item-image" style="display:grid;place-items:center;font-size:68px">${c.icon}</div><div class="market-body"><h3 class="rarity-text ${rarityClass(c.rarity)}">${esc(c.name)}</h3><div class="meta"><span class="rarity-text ${rarityClass(c.rarity)}">${esc(c.rarity)}</span> · ${esc(c.effect_name)} +${c.effect_percent}%</div><div class="price">${money(r.asking_price)}</div><button class="btn ${mine?'light':'primary'} full" onclick="${mine?`cancelCollectible('${r.id}')`:`buyCollectible('${r.id}')`}">${mine?'판매 취소':'구매'}</button></div></article>`}).join('')||'<div class="panel" style="padding:20px">소장품 매물 없음</div>'}
async function buyCollectible(id){const{data,error}=await db.rpc('buy_collectible_listing',{p_listing_id:id});if(error)return toast(error.message);toast('구매 완료 '+money(data.final_price));await Promise.all([loadProfile(),loadCollectibles(),loadCollectibleMarket()])}
async function cancelCollectible(id){const{error}=await db.rpc('cancel_collectible_listing',{p_listing_id:id});if(error)return toast(error.message);await loadCollectibleMarket()}
async function loadEffects(){const{data}=await db.rpc('get_active_effects');effects=data||{}}
async function loadHouse(){await Promise.all([loadProfile(),loadCollectibles(),loadEffects()]);const cap=Number(profile.house_capacity||1),placed=collectibles.filter(x=>x.is_placed&&x.collectibles.type==='decoration').slice(0,cap);houseCapacityText.textContent=`${profile.property_name||'반지하'} · 장식 ${placed.length}/${cap}개 배치`;houseRoom.dataset.property=profile.property_tier||'basement';placedDecorations.innerHTML=placed.map((r,i)=>`<div class="placed slot-${i}">${r.collectibles.icon}</div>`).join('');houseEffects.innerHTML=Object.entries(effects).map(([k,v])=>`<div class="effect"><span>${effectName(k)}</span><b>+${Number(v).toFixed(1)}%</b></div>`).join('')||'<p class="muted">활성 효과 없음</p>';renderDecorationPages()}
function renderDecorationPages(){const list=collectibles.filter(x=>x.collectibles.type==='decoration'),pageSize=4,total=Math.max(1,Math.ceil(list.length/pageSize));decorationPage=Math.min(Math.max(1,decorationPage),total);const start=(decorationPage-1)*pageSize;decorationInventory.innerHTML=list.slice(start,start+pageSize).map(collectibleRow).join('')||'<p class="muted">장식 없음</p>';const info=document.getElementById('decorationPageInfo');if(info)info.textContent=`${decorationPage}P / ${total}P · 총 ${list.length}개`;const prev=document.getElementById('decorationPrev'),next=document.getElementById('decorationNext');if(prev)prev.disabled=decorationPage<=1;if(next)next.disabled=decorationPage>=total;}
function changeDecorationPage(step){const total=Math.max(1,Math.ceil(collectibles.filter(x=>x.collectibles.type==='decoration').length/4));decorationPage=Math.min(total,Math.max(1,decorationPage+step));renderDecorationPages()}
function effectName(k){return{pawn_bonus:'전당포 판매가',market_bonus:'NPC 제안가',auction_discount:'경매 할인',stock_fee_discount:'주식 수수료',exploration_luck:'탐색 희귀도',gacha_luck:'뽑기 희귀도'}[k]||k}

/* 휴대폰/주식 */
function openPhone(){phoneOverlay.classList.remove("hidden");phoneHome();updatePhoneTime()}function closePhone(){phoneOverlay.classList.add("hidden")}function phoneBackdrop(e){if(e.target.id==="phoneOverlay")closePhone()}function phoneHome(){document.querySelectorAll(".phone-screen").forEach(x=>x.classList.add("hidden"));document.getElementById("phoneHome").classList.remove("hidden");closeStockDetail()}function openPhoneApp(name){document.querySelectorAll('.phone-screen').forEach(x=>x.classList.add('hidden'));document.getElementById('phone-'+name).classList.remove('hidden');if(name==='stocks')refreshStocks();else if(name==='wallet')renderWallet();else if(name==='ranking')loadRanking();else if(name==='property')loadProperties();else if(name==='titles')loadTitles();else if(name==='skills')loadNegotiationSkills()}
async function loadNegotiationSkills(){
  if(!profile)await loadProfile();
  const host=document.getElementById('skillTreeList');if(!host)return;
  const points=Number(profile.skill_points||0);
  const rows=Object.entries(HAGGLE_SKILLS).map(([code,s])=>{const owned=hasHaggleSkill(code),reqOk=!s.requires||hasHaggleSkill(s.requires);return `<article class="skill-node ${owned?'owned':''} ${reqOk?'':'blocked'}"><div class="skill-icon">${s.icon}</div><div><h3>${s.name}</h3><p>${s.desc}</p><small>${s.requires?`선행: ${HAGGLE_SKILLS[s.requires].name}`:'기본 단계'} · 비용 ${s.cost}P</small></div><button ${owned||!reqOk||points<s.cost?'disabled':''} onclick="learnNegotiationSkill('${code}')">${owned?'습득 완료':!reqOk?'선행 필요':points<s.cost?'포인트 부족':'습득'}</button></article>`}).join('');
  host.innerHTML=`<div class="skill-point-card"><span>보유 스킬 포인트</span><b>${points}P</b><small>명성 50을 얻을 때마다 1포인트가 지급됩니다.</small></div><div class="skill-tree">${rows}</div>`;
}
async function learnNegotiationSkill(code){const{data,error}=await db.rpc('learn_negotiation_skill_v15',{p_skill:code});if(error)return toast(error.message);toast('협상 스킬을 습득했습니다.');await loadProfile();loadNegotiationSkills()}
function updatePhoneTime(){phoneTime.textContent=new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"})}
async function updateStocks(){await db.rpc("update_global_stock_market")}
async function refreshStocks(){await updateStocks();await loadStocks()}
async function loadStocks(){const[{data:s},{data:h}]=await Promise.all([db.from("stocks").select("id,symbol,name,current_price,previous_price,history").eq("is_active",true).order("name"),db.from("stock_holdings").select("*").eq("user_id",currentUser.id)]);stocks=s||[];holdings=h||[];let total=0,profit=0;stockList.innerHTML=stocks.map(st=>{const hd=holdings.find(x=>x.stock_id===st.id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),prev=Number(st.previous_price),r=prev?(cur-prev)/prev*100:0,val=q*cur,p=val-q*avg;total+=val;profit+=p;return `<button class="stock-row" onclick="openStockDetail('${st.id}')"><div class="stock-name"><b>${esc(st.name)}</b><small>${esc(st.symbol)} · ${q}주</small></div><div class="stock-price"><b>${money(cur)}</b><small>현재가</small></div>${stockSvg(history(st.history,prev,cur),95,40,true)}<b class="stock-rate ${r>=0?"up":"down"}">${r>=0?"+":""}${r.toFixed(2)}%</b></button>`}).join("");stockValue.textContent=money(total);stockProfit.textContent=(profit>=0?"+":"")+money(profit);stockProfit.className=profit>=0?"up":"down";if(selectedStock)renderStockDetail(selectedStock);renderWallet()}
function openStockDetail(id){selectedStock=id;stockListView.classList.add("hidden");stockDetailView.classList.remove("hidden");renderStockDetail(id)}function closeStockDetail(){selectedStock=null;stockListView?.classList.remove("hidden");stockDetailView?.classList.add("hidden")}
function renderStockDetail(id){const st=stocks.find(x=>x.id===id),hd=holdings.find(x=>x.stock_id===id),q=Number(hd?.quantity||0),avg=Number(hd?.average_buy_price||0),cur=Number(st.current_price),hist=history(st.history,st.previous_price,cur),val=q*cur,p=val-q*avg;stockDetail.innerHTML=`<div class="stock-detail-head"><h2>${esc(st.name)}</h2><strong>${money(cur)}</strong><small>현재가</small></div>${stockSvg(hist,340,220,false)}<div class="metrics"><div>보유 <b>${q}주</b></div><div>평균 <b>${q?money(avg):"-"}</b></div><div>평가액 <b>${money(val)}</b></div><div>손익 <b class="${p>=0?"up":"down"}">${p>=0?"+":""}${money(p)}</b></div></div><div class="trade"><input id="qty-${id}" type="number" min="1" value="1"><button class="buy" onclick="tradeStock('${id}','buy')">매수</button><button class="sell" onclick="tradeStock('${id}','sell')">매도</button></div>`}
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


function titleByProgress(p){const n=Number(p?.reputation||0),cash=Number(p?.cash||0);if(cash>=100000000)return '억만장자';if(n>=500)return '전설의 협상가';if(n>=250)return '황금손 상인';if(n>=100)return '떠오르는 판매왕';return '초보 장사꾼'}
async function loadRanking(){const{data,error}=await db.rpc('get_leaderboard_v13');if(error)return rankingList.innerHTML=`<p>${esc(error.message)}</p>`;rankingList.innerHTML=(data||[]).map((r,i)=>`<div class="rank-row ${r.user_id===currentUser.id?'me':''}"><b>${i+1}</b><span><strong>${esc(r.nickname)}</strong><small>${esc(r.active_title||'초보 장사꾼')}</small></span><em>${money(r.networth)}</em></div>`).join('')}
const properties=[{tier:'basement',name:'반지하',capacity:1,price:0,icon:'🪟'},{tier:'studio',name:'원룸',capacity:3,price:2000000,icon:'🏠'},{tier:'apartment',name:'아파트',capacity:6,price:12000000,icon:'🏢'},{tier:'penthouse',name:'펜트하우스',capacity:10,price:80000000,icon:'🌆'},{tier:'mansion',name:'대저택',capacity:16,price:300000000,icon:'🏰'}];
function loadProperties(){const cur=Number(profile?.house_capacity||1);propertyList.innerHTML=properties.map(p=>`<div class="property-card ${cur>=p.capacity?'owned':''}"><span>${p.icon}</span><div><b>${p.name}</b><small>장식 슬롯 ${p.capacity}개</small><strong>${p.price?money(p.price):'기본 제공'}</strong></div><button ${cur>=p.capacity?'disabled':''} onclick="buyProperty('${p.tier}')">${cur===p.capacity?'현재 집':cur>p.capacity?'보유':'구매'}</button></div>`).join('')}
async function buyProperty(tier){const{data,error}=await db.rpc('buy_property_v13',{p_tier:tier});if(error)return toast(error.message);toast(`${data.property_name} 구매 완료`);await loadProfile();loadProperties();loadHouse()}
function loadTitles(){const options=[['초보 장사꾼',true,'기본 칭호'],['떠오르는 판매왕',Number(profile?.reputation)>=100,'명성 100'],['황금손 상인',Number(profile?.reputation)>=250,'명성 250'],['전설의 협상가',Number(profile?.reputation)>=500,'명성 500'],['억만장자',Number(profile?.cash)>=100000000,'현금 1억원']];titleList.innerHTML=options.map(([n,u,c])=>`<div class="title-card ${u?'unlocked':'locked'}"><span>🎖️</span><div><b>${n}</b><small>${c}</small></div><button ${u?'':'disabled'} onclick="equipTitle('${n}')">${profile?.active_title===n?'사용 중':'적용'}</button></div>`).join('')}
async function equipTitle(n){const{error}=await db.rpc('equip_title_v13',{p_title:n});if(error)return toast(error.message);profile.active_title=n;titleTop.textContent=n;loadTitles();toast(`칭호 적용: ${n}`)}
function playSuccessSound(){playUiTone(880,.08);setTimeout(()=>playUiTone(1175,.08),90);setTimeout(()=>playUiTone(1568,.09),180)}
function playJackpotSound(){[523,659,784,1047,1319].forEach((f,i)=>setTimeout(()=>playUiTone(f,.11),i*90))}
function playGachaBuild(){[220,277,330,392,466].forEach((f,i)=>setTimeout(()=>playUiTone(f,.04),i*260))}

document.addEventListener('pointerdown',e=>{if(e.target.closest('button,.clickable,[onclick]'))playUiTone(420,.025)},{passive:true});
