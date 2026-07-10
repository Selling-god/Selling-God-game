/*
판매의 신 v4
- 화면 분리형 타이쿤 UI
- 장소별 탐색 미니게임
- 약 300종 아이템
- 전당포 NPC 흥정
- 종목 목록/상세 그래프 분리
*/
const SUPABASE_URL = "https://qazjtevdljthbzmqmgrw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rIARlWBpKPvFAv_TtTdgaQ_Po-hOGmX";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let currentInventory = [];
let currentStocks = [];
let currentHoldings = [];
let selectedStockId = null;
let realtimeChannel = null;
let toastTimer = null;
let exploreState = null;

document.addEventListener("DOMContentLoaded", initializeGame);

async function initializeGame() {
  updatePhoneTime();
  setInterval(updatePhoneTime, 30000);

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await enterGame();
  } else {
    showAuthScreen();
  }

  supabaseClient.auth.onAuthStateChange((_event, sessionData) => {
    currentUser = sessionData?.user || null;
  });
}

/* 인증 */
function setAuthMode(mode) {
  authMode = mode;
  document.getElementById("nicknameWrap").classList.toggle("hidden", mode !== "signup");
  document.getElementById("loginTab").classList.toggle("active", mode === "login");
  document.getElementById("signupTab").classList.toggle("active", mode === "signup");
  document.getElementById("authBtn").textContent = mode === "login" ? "로그인" : "회원가입";
  document.getElementById("authMsg").textContent = "";
}

async function submitAuth() {
  const nickname = document.getElementById("nickname").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const message = document.getElementById("authMsg");
  const button = document.getElementById("authBtn");

  if (!email || !password) return message.textContent = "이메일과 비밀번호를 입력해 주세요.";
  if (password.length < 6) return message.textContent = "비밀번호는 6자 이상이어야 합니다.";
  if (authMode === "signup" && nickname.length < 2) return message.textContent = "닉네임은 2글자 이상 입력해 주세요.";

  button.disabled = true;
  button.textContent = "처리 중...";
  message.textContent = "";

  try {
    if (authMode === "signup") {
      const { data, error } = await supabaseClient.auth.signUp({
        email, password, options: { data: { nickname } }
      });
      if (error) throw error;
      if (data.session) {
        currentUser = data.user;
        await enterGame();
      } else {
        message.textContent = "회원가입 완료. 이메일 인증 후 로그인해 주세요.";
      }
    } else {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
      currentUser = data.user;
      await enterGame();
    }
  } catch (error) {
    message.textContent = translateAuthError(error.message);
  } finally {
    button.disabled = false;
    button.textContent = authMode === "login" ? "로그인" : "회원가입";
  }
}

function translateAuthError(message) {
  if (message.includes("Invalid login credentials")) return "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (message.includes("User already registered")) return "이미 가입된 이메일입니다.";
  if (message.includes("Email not confirmed")) return "이메일 인증을 먼저 완료해 주세요.";
  if (message.includes("duplicate key")) return "이미 사용 중인 닉네임입니다.";
  return message;
}

async function enterGame() {
  showGameScreen();
  const { error } = await supabaseClient.rpc("ensure_player_save");
  if (error) showToast("저장 데이터 생성 실패: " + error.message);
  await refreshAllData();
  subscribeRealtime();
}

function showAuthScreen() {
  document.getElementById("auth").classList.remove("hidden");
  document.getElementById("game").classList.add("hidden");
}
function showGameScreen() {
  document.getElementById("auth").classList.add("hidden");
  document.getElementById("game").classList.remove("hidden");
}
async function logout() {
  if (realtimeChannel) await supabaseClient.removeChannel(realtimeChannel);
  realtimeChannel = null;
  await supabaseClient.auth.signOut();
  currentUser = null;
  currentProfile = null;
  closePhone();
  showAuthScreen();
}

/* 페이지 */
function openGamePage(name, button) {
  document.querySelectorAll(".game-page").forEach(page => page.classList.remove("active-page"));
  document.querySelectorAll(".bottom-nav button").forEach(item => item.classList.remove("active"));
  document.getElementById(`page-${name}`).classList.add("active-page");
  button?.classList.add("active");
  if (name === "inventory") loadInventory();
  if (name === "business") loadBusinesses();
  if (name === "activity") loadActivities();
}

/* 프로필 */
async function refreshAllData() {
  await updateGlobalStockMarket();
  await loadProfile();
  await Promise.all([loadStocks(), loadInventory(), loadMarket(), loadRanking(), loadBusinesses(), loadActivities()]);
  updateNetWorth();
}
async function loadProfile() {
  if (!currentUser) return;
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id,nickname,cash,credit_score,reputation,job_count,updated_at")
    .eq("id", currentUser.id)
    .single();
  if (error) return showToast("프로필 오류: " + error.message);
  currentProfile = data;
  updateProfileUI();
}
function updateProfileUI() {
  if (!currentProfile) return;
  document.getElementById("nicknameTop").textContent = currentProfile.nickname;
  document.getElementById("nicknameHero").textContent = currentProfile.nickname;
  document.getElementById("phoneOwner").textContent = currentProfile.nickname;
  document.getElementById("cashTop").textContent = formatMoney(currentProfile.cash);
  document.getElementById("credit").textContent = currentProfile.credit_score;
  document.getElementById("reputation").textContent = currentProfile.reputation;
}
async function quickJob() {
  const { data, error } = await supabaseClient.rpc("do_quick_job");
  if (error) return showToast(error.message);
  showToast("포장 알바 완료! +" + formatMoney(data.reward));
  await Promise.all([loadProfile(), loadActivities()]);
  updateNetWorth();
}

/* 탐색 미니게임 */
function openExploreGame(location) {
  clearExploreState();
  document.getElementById("exploreModal").classList.remove("hidden");
  if (location === "street") startStreetGame();
  if (location === "alley") startAlleyGame();
  if (location === "mountain") startMountainGame();
}
function closeExploreGame() {
  clearExploreState();
  document.getElementById("exploreModal").classList.add("hidden");
}
function clearExploreState() {
  if (exploreState?.interval) clearInterval(exploreState.interval);
  if (exploreState?.timeout) clearTimeout(exploreState.timeout);
  exploreState = null;
}
function startStreetGame() {
  exploreState = { location:"street", score:0, time:12, interval:null };
  document.getElementById("exploreGameContent").innerHTML = `
    <div class="minigame-head"><p class="eyebrow">STREET SEARCH</p><h2>움직이는 상자를 6번 찾으세요</h2><p class="muted">12초 안에 상자를 클릭하면 탐색에 성공합니다.</p></div>
    <div id="streetStage" class="minigame-stage"></div>
    <div class="timer-row"><span>남은 시간 <b id="streetTime">12</b>초</span><span>찾은 상자 <b id="streetScore">0</b>/6</span></div>`;
  spawnStreetTarget();
  exploreState.interval = setInterval(() => {
    exploreState.time -= 1;
    document.getElementById("streetTime").textContent = exploreState.time;
    if (exploreState.time <= 0) finishExploreGame(false, "시간이 끝났습니다.");
  }, 1000);
}
function spawnStreetTarget() {
  const stage = document.getElementById("streetStage");
  if (!stage) return;
  stage.innerHTML = "";
  const target = document.createElement("button");
  target.className = "street-target";
  target.textContent = ["📦","🧰","🛍️","🗃️"][Math.floor(Math.random()*4)];
  target.style.left = `${Math.random()*78+4}%`;
  target.style.top = `${Math.random()*68+8}%`;
  target.onclick = () => {
    exploreState.score += 1;
    document.getElementById("streetScore").textContent = exploreState.score;
    if (exploreState.score >= 6) finishExploreGame(true);
    else spawnStreetTarget();
  };
  stage.appendChild(target);
}
function startAlleyGame() {
  const arrows = ["⬆️","⬇️","⬅️","➡️"];
  const sequence = Array.from({length:5}, () => arrows[Math.floor(Math.random()*4)]);
  exploreState = { location:"alley", sequence, input:[], locked:true };
  document.getElementById("exploreGameContent").innerHTML = `
    <div class="minigame-head"><p class="eyebrow">ALLEY MEMORY</p><h2>방향 순서를 기억하세요</h2><p class="muted">순서가 사라진 뒤 같은 순서로 입력하세요.</p></div>
    <div id="memoryDisplay" class="memory-display">${sequence.join("")}</div>
    <div class="memory-buttons">
      ${arrows.map(a => `<button onclick="pressMemory('${a}')">${a}</button>`).join("")}
    </div>
    <p id="memoryStatus" class="muted">3초 동안 기억하세요.</p>`;
  exploreState.timeout = setTimeout(() => {
    document.getElementById("memoryDisplay").textContent = "❓ ❓ ❓ ❓ ❓";
    document.getElementById("memoryStatus").textContent = "이제 순서대로 입력하세요.";
    exploreState.locked = false;
  }, 3000);
}
function pressMemory(arrow) {
  if (!exploreState || exploreState.locked) return;
  const index = exploreState.input.length;
  if (exploreState.sequence[index] !== arrow) return finishExploreGame(false, "순서가 틀렸습니다.");
  exploreState.input.push(arrow);
  document.getElementById("memoryStatus").textContent = `입력 ${exploreState.input.length}/5`;
  if (exploreState.input.length === exploreState.sequence.length) finishExploreGame(true);
}
function startMountainGame() {
  exploreState = { location:"mountain", position:0, direction:1, interval:null };
  document.getElementById("exploreGameContent").innerHTML = `
    <div class="minigame-head"><p class="eyebrow">MOUNTAIN MINING</p><h2>초록 구간에 채굴 바를 멈추세요</h2><p class="muted">정확한 타이밍에 멈출수록 발굴 성공률이 높아집니다.</p></div>
    <div class="mining-track"><div class="mining-zone"></div><div id="miningMarker" class="mining-marker"></div></div>
    <button class="big-action" onclick="stopMining()">지금 멈추기</button>`;
  exploreState.interval = setInterval(() => {
    exploreState.position += exploreState.direction * 2.2;
    if (exploreState.position >= 95) exploreState.direction = -1;
    if (exploreState.position <= 0) exploreState.direction = 1;
    document.getElementById("miningMarker").style.left = `${exploreState.position}%`;
  }, 28);
}
function stopMining() {
  if (!exploreState) return;
  const success = exploreState.position >= 35 && exploreState.position <= 65;
  finishExploreGame(success, success ? "" : "초록 구간을 벗어났습니다.");
}
async function finishExploreGame(success, failMessage="") {
  if (!exploreState) return;
  const location = exploreState.location;
  clearExploreState();

  if (!success) {
    document.getElementById("exploreGameContent").innerHTML = `
      <div class="result-screen"><h2>실패 😢</h2><p>${escapeHtml(failMessage)}</p><button class="big-action" onclick="openExploreGame('${location}')">다시 도전</button></div>`;
    return;
  }

  document.getElementById("exploreGameContent").innerHTML = `<div class="result-screen"><h2>미니게임 성공!</h2><p>아이템을 찾는 중입니다...</p></div>`;
  const { data, error } = await supabaseClient.rpc("explore_location", { p_location: location });
  if (error) {
    document.getElementById("exploreGameContent").innerHTML = `<div class="result-screen"><h2>오류</h2><p>${escapeHtml(error.message)}</p></div>`;
    return;
  }
  if (data.caught) {
    document.getElementById("exploreGameContent").innerHTML = `
      <div class="result-screen"><h2>🚨 발각되었습니다</h2><p>명성 ${data.reputation_loss} 감소</p><button class="big-action" onclick="closeExploreGame()">확인</button></div>`;
  } else {
    document.getElementById("exploreGameContent").innerHTML = `
      <div class="result-screen">
        <img class="result-item-image" src="${createItemImage(data.item_name, data.item_category || location)}">
        <h2>${escapeHtml(data.item_name)} 발견!</h2>
        <p>상태 ${data.condition_score}/100 · 탐색품은 대부분 낡고 손상되어 있습니다.</p>
        <button class="big-action" onclick="closeExploreGame()">창고로 보내기</button>
      </div>`;
  }
  await Promise.all([loadProfile(), loadInventory(), loadActivities()]);
}

/* 아이템 */
async function loadInventory() {
  const target = document.getElementById("inventory");
  if (!currentUser) return;
  target.innerHTML = `<div class="empty">인벤토리를 불러오는 중입니다.</div>`;
  const { data, error } = await supabaseClient
    .from("user_items")
    .select(`id,condition_score,is_appraised,appraised_price,is_listed,acquired_at,
      items(id,name,category,average_price,is_average_price_known,rarity,location)`)
    .eq("user_id", currentUser.id)
    .order("acquired_at", { ascending:false });
  if (error) return target.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;

  currentInventory = data || [];
  updateMarketItemSelect();
  if (!currentInventory.length) return target.innerHTML = `<div class="empty">아직 아이템이 없습니다. 상권에서 탐색 미니게임을 성공해 보세요.</div>`;

  target.innerHTML = currentInventory.map(userItem => {
    const item = userItem.items;
    const value = userItem.is_appraised
      ? Number(userItem.appraised_price)
      : item.is_average_price_known
        ? calculateConditionPrice(item.average_price, userItem.condition_score)
        : null;
    return `
      <div class="item-card">
        <div class="item-image"><img src="${createItemImage(item.name, item.category)}" alt="${escapeHtml(item.name)}"></div>
        <div class="item-body">
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.category)} · ${escapeHtml(item.rarity)} · 상태 ${userItem.condition_score}/100</p>
          <div class="value">${value !== null ? formatMoney(value) : "가격 미상"}</div>
          <div class="item-actions">
            ${!item.is_average_price_known && !userItem.is_appraised ? `<button class="primary" onclick="appraiseItem('${userItem.id}')">감정</button>` : ""}
            ${userItem.is_listed ? `<button class="ghost" disabled>판매 중</button>` : `<button class="ghost" onclick="openPhoneMarket()">장터 판매</button>`}
          </div>
        </div>
      </div>`;
  }).join("");
  renderWallet();
}
function createItemImage(name, category) {
  const seed = hashString(name);
  const hue1 = seed % 360;
  const hue2 = (hue1 + 55 + seed % 80) % 360;
  const symbolMap = {
    "전자기기":"⚡","생활용품":"🏠","수집품":"✨","골동품":"🏺","광물":"💎",
    "공예품":"🧵","의류":"👕","도서":"📚","완구":"🧸","주방용품":"🍳",
    "음향기기":"🎵","스포츠":"🏅","공구":"🔧","가구":"🪑","문구":"✏️"
  };
  const symbol = symbolMap[category] || "📦";
  const short = name.slice(0, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="520" height="320">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop stop-color="hsl(${hue1},75%,78%)"/><stop offset="1" stop-color="hsl(${hue2},72%,58%)"/>
    </linearGradient></defs>
    <rect width="520" height="320" rx="28" fill="url(#g)"/>
    <circle cx="${80 + seed % 350}" cy="${65 + seed % 170}" r="${25 + seed % 50}" fill="rgba(255,255,255,.22)"/>
    <text x="260" y="158" text-anchor="middle" font-size="96">${symbol}</text>
    <rect x="55" y="235" width="410" height="52" rx="18" fill="rgba(255,255,255,.83)"/>
    <text x="260" y="270" text-anchor="middle" font-family="Arial" font-size="24" font-weight="700" fill="#24344c">${escapeSvg(short)}</text>
  </svg>`;
  return "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg);
}
function hashString(text) {
  let hash = 2166136261;
  for (let i=0;i<text.length;i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash);
}
function escapeSvg(value) {
  return String(value).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m]));
}
async function appraiseItem(id) {
  const { data, error } = await supabaseClient.rpc("appraise_item", { p_user_item_id:id, p_expert_level:"basic" });
  if (error) return showToast(error.message);
  showToast("감정 완료: " + formatMoney(data.estimated_price));
  await Promise.all([loadProfile(), loadInventory(), loadActivities()]);
  updateNetWorth();
}

/* 전당포 */
async function openPawnshop() {
  document.getElementById("pawnshopModal").classList.remove("hidden");
  await loadPawnshop();
}
function closePawnshop() { document.getElementById("pawnshopModal").classList.add("hidden"); }
async function loadPawnshop() {
  const target = document.getElementById("pawnshopList");
  target.innerHTML = `<div class="empty">전당포 물건을 정리하는 중입니다.</div>`;
  await supabaseClient.rpc("restock_pawnshop");
  const { data, error } = await supabaseClient
    .from("pawnshop_listings")
    .select(`id,npc_name,asking_price,condition_score,patience,status,items(id,name,category,rarity,average_price)`)
    .eq("status","active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at",{ascending:false})
    .limit(12);
  if (error) return target.innerHTML = `<div class="empty">${escapeHtml(error.message)}</div>`;
  target.innerHTML = (data || []).map(row => `
    <div class="pawn-card">
      <img src="${createItemImage(row.items.name,row.items.category)}" alt="${escapeHtml(row.items.name)}">
      <div class="pawn-body">
        <h3>${escapeHtml(row.items.name)}</h3>
        <p class="pawn-meta">${escapeHtml(row.items.rarity)} · 상태 ${row.condition_score}/100 · 인내심 ${row.patience}</p>
        <p>조 아저씨 제시가 <b>${formatMoney(row.asking_price)}</b></p>
        <div class="offer-buttons">
          <button onclick="negotiatePawn('${row.id}',70)">70%</button>
          <button onclick="negotiatePawn('${row.id}',82)">82%</button>
          <button onclick="negotiatePawn('${row.id}',92)">92%</button>
        </div>
        <div id="pawnStatus-${row.id}" class="pawn-status"></div>
      </div>
    </div>`).join("");
}
async function negotiatePawn(id, percent) {
  const { data, error } = await supabaseClient.rpc("negotiate_pawnshop", {
    p_listing_id:id, p_offer_percent:percent
  });
  const status = document.getElementById(`pawnStatus-${id}`);
  if (error) return status.textContent = error.message;
  if (data.accepted) {
    status.textContent = `거래 성사! ${formatMoney(data.final_price)}에 구매했습니다.`;
    await Promise.all([loadProfile(), loadInventory(), loadPawnshop(), loadActivities()]);
    updateNetWorth();
  } else if (data.closed) {
    status.textContent = "너무 낮은 가격을 불러 조 아저씨가 거래를 끝냈습니다.";
    setTimeout(loadPawnshop, 900);
  } else {
    status.textContent = `거절! “${formatMoney(data.counter_offer)}이면 생각해보지.” 남은 인내심 ${data.patience}`;
    setTimeout(loadPawnshop, 1100);
  }
}

/* 휴대폰 */
function openPhone() { document.getElementById("phoneOverlay").classList.remove("hidden"); phoneHome(); updatePhoneTime(); }
function closePhone() { document.getElementById("phoneOverlay").classList.add("hidden"); }
function backdropClose(event) { if (event.target.id === "phoneOverlay") closePhone(); }
function closeModalByBackdrop(event,id) { if (event.target.id === id) document.getElementById(id).classList.add("hidden"); }
function phoneHome() {
  document.querySelectorAll(".phone-screen").forEach(screen => screen.classList.add("hidden"));
  document.getElementById("phoneHome").classList.remove("hidden");
  closeStockDetail();
}
async function openApp(name) {
  document.querySelectorAll(".phone-screen").forEach(screen => screen.classList.add("hidden"));
  document.getElementById(`app-${name}`).classList.remove("hidden");
  if (name === "stocks") await refreshStockApp();
  if (name === "market") await loadMarket();
  if (name === "wallet") renderWallet();
  if (name === "ranking") await loadRanking();
}
async function openPhoneMarket() { openPhone(); await openApp("market"); }
function updatePhoneTime() {
  const el = document.getElementById("phoneTime");
  if (el) el.textContent = new Date().toLocaleTimeString("ko-KR",{hour:"2-digit",minute:"2-digit"});
}

/* 주식 */
async function updateGlobalStockMarket() {
  const { error } = await supabaseClient.rpc("update_global_stock_market");
  if (error) console.warn(error.message);
}
async function refreshStockApp() { await updateGlobalStockMarket(); await loadStocks(); }
async function loadStocks() {
  if (!currentUser) return;
  const target = document.getElementById("stockList");
  target.innerHTML = `<div class="empty">시세를 불러오는 중입니다.</div>`;

  const [{data:stockData,error:stockError},{data:holdingData,error:holdingError}] = await Promise.all([
    supabaseClient.from("stocks").select("id,symbol,name,current_price,previous_price,is_active,history,updated_at").eq("is_active",true).order("name"),
    supabaseClient.from("stock_holdings").select("stock_id,quantity,average_buy_price").eq("user_id",currentUser.id)
  ]);
  if (stockError || holdingError) return target.innerHTML = `<div class="empty">${escapeHtml(stockError?.message || holdingError?.message)}</div>`;

  currentStocks = stockData || [];
  currentHoldings = holdingData || [];
  let totalValue = 0;
  let totalProfit = 0;

  target.innerHTML = currentStocks.map(stock => {
    const holding = currentHoldings.find(h => h.stock_id === stock.id);
    const owned = Number(holding?.quantity || 0);
    const avg = Number(holding?.average_buy_price || 0);
    const current = Number(stock.current_price);
    const previous = Number(stock.previous_price);
    const rate = previous ? (current-previous)/previous*100 : 0;
    const evaluation = owned*current;
    const profit = evaluation-owned*avg;
    totalValue += evaluation;
    totalProfit += profit;
    const history = normalizeStockHistory(stock.history, previous, current);
    return `
      <button class="stock-compact" onclick="openStockDetail('${stock.id}')">
        <div><b>${escapeHtml(stock.name)}</b><small>${escapeHtml(stock.symbol)} · ${owned}주 보유</small></div>
        ${createStockSvg(history,100,42,true)}
        <b class="compact-change ${rate>=0?"change-up":"change-down"}">${rate>=0?"+":""}${rate.toFixed(2)}%</b>
      </button>`;
  }).join("");

  document.getElementById("stockValue").textContent = formatMoney(totalValue);
  const profitEl = document.getElementById("stockProfit");
  profitEl.textContent = `${totalProfit>=0?"+":""}${formatMoney(totalProfit)}`;
  profitEl.className = totalProfit>=0 ? "profit-up" : "profit-down";
  if (selectedStockId) renderStockDetail(selectedStockId);
  updateNetWorth();
  renderWallet();
}
function openStockDetail(id) {
  selectedStockId = id;
  document.getElementById("stockListView").classList.add("hidden");
  document.getElementById("stockDetailView").classList.remove("hidden");
  renderStockDetail(id);
}
function closeStockDetail() {
  selectedStockId = null;
  document.getElementById("stockListView")?.classList.remove("hidden");
  document.getElementById("stockDetailView")?.classList.add("hidden");
}
function renderStockDetail(id) {
  const stock = currentStocks.find(s => s.id === id);
  if (!stock) return;
  const holding = currentHoldings.find(h => h.stock_id === id);
  const owned = Number(holding?.quantity || 0);
  const avg = Number(holding?.average_buy_price || 0);
  const current = Number(stock.current_price);
  const previous = Number(stock.previous_price);
  const history = normalizeStockHistory(stock.history, previous, current);
  const evaluation = owned*current;
  const invested = owned*avg;
  const profit = evaluation-invested;
  const profitRate = invested ? profit/invested*100 : 0;
  const dayRate = previous ? (current-previous)/previous*100 : 0;
  const min = Math.min(...history), max = Math.max(...history);
  const amplitude = min ? (max-min)/min*100 : 0;

  document.getElementById("stockDetail").innerHTML = `
    <div class="stock-detail-card">
      <div class="detail-head">
        <div><h2>${escapeHtml(stock.name)}</h2><p>${escapeHtml(stock.symbol)}</p></div>
        <div class="${dayRate>=0?"change-up":"change-down"}"><b>${formatMoney(current)}</b><br>${dayRate>=0?"+":""}${dayRate.toFixed(2)}%</div>
      </div>
      ${createStockSvg(history,340,230,false)}
      <div class="detail-metrics">
        <div><span>최근 변동폭</span><b>${amplitude.toFixed(2)}%</b></div>
        <div><span>저가 / 고가</span><b>${formatMoney(min)} / ${formatMoney(max)}</b></div>
        <div><span>보유 수량</span><b>${owned.toLocaleString()}주</b></div>
        <div><span>내 평균 매수가</span><b>${owned ? formatMoney(avg) : "-"}</b></div>
        <div><span>현재 평가액</span><b>${formatMoney(evaluation)}</b></div>
        <div><span>평가손익</span><b class="${profit>=0?"change-up":"change-down"}">${profit>=0?"+":""}${formatMoney(profit)} (${profitRate>=0?"+":""}${profitRate.toFixed(2)}%)</b></div>
      </div>
      <div class="trade-row">
        <input id="stockQuantity-${stock.id}" type="number" min="1" value="1">
        <button class="buy-btn" onclick="tradeStock('${stock.id}','buy')">매수</button>
        <button class="sell-btn" onclick="tradeStock('${stock.id}','sell')">매도</button>
      </div>
    </div>`;
}
function normalizeStockHistory(raw, previous, current) {
  let values = [];
  if (Array.isArray(raw)) values = raw;
  else if (typeof raw === "string") { try { values = JSON.parse(raw); } catch {} }
  values = (Array.isArray(values)?values:[]).map(Number).filter(Number.isFinite).slice(-32);
  if (values.length < 2) values = generateFallbackHistory(previous,current,24);
  if (values[values.length-1] !== Number(current)) values.push(Number(current));
  return values.slice(-32);
}
function generateFallbackHistory(previous,current,count) {
  const end = Number(current)||100;
  const start = Number(previous)||end;
  const seed = Math.abs(Math.round(end+start));
  const values = [];
  let value = start*(0.92 + (seed%13)/100);
  for(let i=0;i<count-1;i++){
    const wave = Math.sin((i+seed%7)*0.9)*0.018;
    const noise = (((seed*(i+3))%19)-9)/500;
    value = Math.max(100,value*(1+wave+noise));
    values.push(Math.round(value));
  }
  values.push(end);
  return values;
}
function createStockSvg(values,width,height,compact) {
  const pad = compact?3:12, min=Math.min(...values), max=Math.max(...values), range=Math.max(max-min,1);
  const points = values.map((v,i)=>{
    const x=pad+i/Math.max(values.length-1,1)*(width-pad*2);
    const y=height-pad-(v-min)/range*(height-pad*2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const rising=values.at(-1)>=values[0];
  const cls=rising?"up":"down";
  const polygon=`${pad},${height-pad} ${points} ${width-pad},${height-pad}`;
  return `<svg class="${compact?"sparkline":"detail-chart"}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    ${compact?"":`<line x1="${pad}" y1="${height/2}" x2="${width-pad}" y2="${height/2}" class="chart-grid"/>`}
    <polygon points="${polygon}" class="chart-fill-${cls}"></polygon>
    <polyline points="${points}" class="chart-line-${cls}"></polyline>
  </svg>`;
}
async function tradeStock(stockId,type) {
  const input = document.getElementById(`stockQuantity-${stockId}`);
  const quantity = Number(input?.value);
  if (!Number.isInteger(quantity)||quantity<1) return showToast("수량은 1 이상의 정수로 입력해 주세요.");
  const fn = type==="buy"?"buy_stock_v2":"sell_stock_v2";
  const {data,error}=await supabaseClient.rpc(fn,{p_stock_id:stockId,p_quantity:quantity});
  if(error) return showToast(error.message);
  showToast(`${type==="buy"?"매수":"매도"} 완료 · ${quantity}주`);
  await Promise.all([loadProfile(),loadStocks(),loadActivities()]);
}

/* 장터 */
function updateMarketItemSelect() {
  const select=document.getElementById("sellItem");
  if(!select)return;
  select.innerHTML=`<option value="">판매할 물건</option>`;
  currentInventory.filter(i=>!i.is_listed).forEach(i=>{
    const option=document.createElement("option");
    option.value=i.id;option.textContent=`${i.items.name} · 상태 ${i.condition_score}`;
    select.appendChild(option);
  });
}
async function createListing() {
  const id=document.getElementById("sellItem").value;
  const price=Math.floor(Number(document.getElementById("sellPrice").value));
  if(!id||!Number.isFinite(price)||price<=0)return showToast("물건과 가격을 확인해 주세요.");
  const {error}=await supabaseClient.rpc("create_market_listing",{p_user_item_id:id,p_price:price});
  if(error)return showToast(error.message);
  document.getElementById("sellPrice").value="";
  showToast("오이장터에 등록했습니다.");
  await Promise.all([loadInventory(),loadMarket(),loadActivities()]);
}
async function loadMarket() {
  const target=document.getElementById("marketList");
  target.innerHTML=`<div class="empty">매물을 불러오는 중입니다.</div>`;
  const {data,error}=await supabaseClient.from("market_listings")
    .select(`id,title,asking_price,seller_type,seller_user_id,npc_name,status,created_at,
      user_items(id,condition_score,items(name,category)),profiles:seller_user_id(nickname)`)
    .eq("status","active").order("created_at",{ascending:false}).limit(50);
  if(error)return target.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;
  if(!data?.length)return target.innerHTML=`<div class="empty">등록된 매물이 없습니다.</div>`;
  target.innerHTML=data.map(row=>{
    const mine=row.seller_user_id===currentUser?.id;
    const seller=row.seller_type==="npc"?(row.npc_name||"NPC"):(row.profiles?.nickname||"유저");
    return `<div class="market-row">
      <div class="market-row-top"><div><b>${escapeHtml(row.title)}</b><div class="market-meta">${escapeHtml(seller)} · 상태 ${row.user_items?.condition_score||"-"}</div></div><strong>${formatMoney(row.asking_price)}</strong></div>
      <button class="${mine?"cancel":""}" onclick="${mine?`cancelListing('${row.id}')`:`buyListing('${row.id}')`}">${mine?"판매 취소":"구매하기"}</button>
    </div>`;
  }).join("");
}
async function buyListing(id) {
  const {data,error}=await supabaseClient.rpc("buy_market_listing",{p_listing_id:id});
  if(error)return showToast(error.message);
  showToast("구매 성공! "+formatMoney(data.final_price));
  await refreshAllData();
}
async function cancelListing(id) {
  const {error}=await supabaseClient.rpc("cancel_market_listing",{p_listing_id:id});
  if(error)return showToast(error.message);
  showToast("판매를 취소했습니다.");
  await Promise.all([loadInventory(),loadMarket(),loadActivities()]);
}

/* 사업/랭킹/활동 */
async function buyBusiness(type,price) {
  if(Number(currentProfile?.cash||0)<price)return showToast("보유 자금이 부족합니다.");
  const {data,error}=await supabaseClient.rpc("buy_business",{p_business_type:type,p_purchase_price:price});
  if(error)return showToast(error.message);
  showToast(data.business_name+" 구매 완료");
  await Promise.all([loadProfile(),loadBusinesses(),loadActivities()]);
}
async function loadBusinesses() {
  const target=document.getElementById("businessList");
  if(!currentUser||!target)return;
  const {data,error}=await supabaseClient.from("user_businesses")
    .select("id,business_name,level,income_per_minute,last_collected_at,created_at")
    .eq("user_id",currentUser.id).order("created_at",{ascending:false});
  if(error)return target.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;
  if(!data?.length)return target.innerHTML=`<div class="empty">보유한 사업이 없습니다.</div>`;
  target.innerHTML=data.map(b=>`<div class="business-row"><div><b>${escapeHtml(b.business_name)}</b><p class="muted">레벨 ${b.level} · 분당 ${formatMoney(b.income_per_minute)}</p></div><button class="primary" onclick="collectBusinessIncome('${b.id}')">수익 받기</button></div>`).join("");
}
async function collectBusinessIncome(id) {
  const {data,error}=await supabaseClient.rpc("collect_business_income",{p_business_id:id});
  if(error)return showToast(error.message);
  showToast("사업 수익 "+formatMoney(data.collected_amount));
  await Promise.all([loadProfile(),loadBusinesses(),loadActivities()]);
}
async function loadRanking() {
  const target=document.getElementById("rankingList");
  const {data,error}=await supabaseClient.from("profiles").select("nickname,cash,credit_score").order("cash",{ascending:false}).limit(20);
  if(error)return target.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;
  target.innerHTML=(data||[]).map((u,i)=>`<div class="rank-row"><div><span class="rank-number">${i+1}</span><b>${escapeHtml(u.nickname)}</b></div><strong>${formatMoney(u.cash)}</strong></div>`).join("");
}
async function loadActivities() {
  const target=document.getElementById("activities");
  if(!currentUser)return;
  const {data,error}=await supabaseClient.from("activity_logs").select("message,created_at").eq("user_id",currentUser.id).order("created_at",{ascending:false}).limit(30);
  if(error)return target.innerHTML=`<div class="empty">${escapeHtml(error.message)}</div>`;
  target.innerHTML=data?.length?data.map(x=>`<div class="activity-row">${escapeHtml(x.message)}</div>`).join(""):`<div class="empty">활동 기록이 없습니다.</div>`;
}
function renderWallet() {
  const target=document.getElementById("walletView");
  if(!target||!currentProfile)return;
  const stockValue=currentHoldings.reduce((sum,h)=>sum+Number(h.quantity)*Number(currentStocks.find(s=>s.id===h.stock_id)?.current_price||0),0);
  const itemValue=currentInventory.reduce((sum,u)=>{
    const i=u.items;const v=u.is_appraised?Number(u.appraised_price):i.is_average_price_known?calculateConditionPrice(i.average_price,u.condition_score):0;
    return sum+v;
  },0);
  target.innerHTML=`
    <div class="wallet-card"><span>현금</span><b>${formatMoney(currentProfile.cash)}</b></div>
    <div class="wallet-card"><span>주식 평가액</span><b>${formatMoney(stockValue)}</b></div>
    <div class="wallet-card"><span>아이템 추정가</span><b>${formatMoney(itemValue)}</b></div>
    <div class="wallet-card"><span>신용 / 명성</span><b>${currentProfile.credit_score} / ${currentProfile.reputation}</b></div>`;
}
function updateNetWorth() {
  if(!currentProfile)return;
  const stockValue=currentHoldings.reduce((sum,h)=>sum+Number(h.quantity)*Number(currentStocks.find(s=>s.id===h.stock_id)?.current_price||0),0);
  const itemValue=currentInventory.reduce((sum,u)=>sum+(u.is_appraised?Number(u.appraised_price):u.items.is_average_price_known?calculateConditionPrice(u.items.average_price,u.condition_score):0),0);
  document.getElementById("networth").textContent=formatMoney(Number(currentProfile.cash)+stockValue+itemValue);
  renderWallet();
}
function subscribeRealtime() {
  if(realtimeChannel)return;
  realtimeChannel=supabaseClient.channel("selling-god-v4")
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"stocks"},()=>loadStocks())
    .on("postgres_changes",{event:"*",schema:"public",table:"market_listings"},()=>loadMarket())
    .subscribe();
}

/* 공통 */
function calculateConditionPrice(price,score) {
  const multiplier=score>=95?1.3:score>=85?1.15:score>=70?1:score>=50?.8:score>=30?.6:.35;
  return Math.round(Number(price)*multiplier);
}
function formatMoney(value) {
  const amount=Number(value);if(!Number.isFinite(amount))return"0원";
  const units=[{value:1e20,label:"해"},{value:1e16,label:"경"},{value:1e12,label:"조"},{value:1e8,label:"억"},{value:1e4,label:"만"}];
  for(const u of units)if(Math.abs(amount)>=u.value){const d=amount/u.value;const digits=Math.abs(d)>=100?0:Math.abs(d)>=10?1:2;return Number(d.toFixed(digits)).toLocaleString()+u.label+" 원";}
  return Math.floor(amount).toLocaleString()+"원";
}
function escapeHtml(value){const d=document.createElement("div");d.textContent=value??"";return d.innerHTML;}
function showToast(message){const t=document.getElementById("toast");t.textContent=message;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),3500);}
