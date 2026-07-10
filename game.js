/*
====================================================
판매의 신 v2 수정 완전판
- 기존 기능 유지
- 계정별 플레이 정보 저장
- 3분 공용 주식 시세
- 계정별 보유 주식/평균 매수가 저장
- 오이장터와 주식을 휴대폰 앱 안에서 확인
주의: service_role 키는 절대 넣지 마세요.
====================================================
*/

const SUPABASE_URL = "https://qazjtevdljthbzmqmgrw.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_rIARlWBpKPvFAv_TtTdgaQ_Po-hOGmX";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let currentInventory = [];
let currentStocks = [];
let currentHoldings = [];
let currentActivities = [];
let toastTimer = null;
let realtimeChannel = null;

const itemEmoji = {
  "낡은 무선 이어폰": "🎧",
  "깨진 스마트폰": "📱",
  "빈티지 우산": "☂️",
  "정체불명의 카메라": "📷",
  "고장난 노트북": "💻",
  "희귀 레코드판": "💿",
  "오래된 동전": "🪙",
  "희귀 광석": "💎",
  "나무 조각상": "🗿"
};

document.addEventListener("DOMContentLoaded", initializeGame);

async function initializeGame() {
  updatePhoneTime();
  setInterval(updatePhoneTime, 30000);

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

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

/* ====================================================
인증
==================================================== */

function setAuthMode(mode) {
  authMode = mode;

  document
    .getElementById("nicknameWrap")
    .classList.toggle("hidden", mode !== "signup");

  document
    .getElementById("loginTab")
    .classList.toggle("active", mode === "login");

  document
    .getElementById("signupTab")
    .classList.toggle("active", mode === "signup");

  document.getElementById("authBtn").textContent =
    mode === "login" ? "로그인" : "회원가입";

  document.getElementById("authMsg").textContent = "";
}

async function submitAuth() {
  const nickname =
    document.getElementById("nickname").value.trim();

  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  const message =
    document.getElementById("authMsg");

  const button =
    document.getElementById("authBtn");

  message.textContent = "";

  if (!email || !password) {
    message.textContent =
      "이메일과 비밀번호를 입력해 주세요.";
    return;
  }

  if (password.length < 6) {
    message.textContent =
      "비밀번호는 6자 이상이어야 합니다.";
    return;
  }

  if (authMode === "signup" && nickname.length < 2) {
    message.textContent =
      "닉네임은 2글자 이상 입력해 주세요.";
    return;
  }

  button.disabled = true;
  button.textContent = "처리 중...";

  try {
    if (authMode === "signup") {
      const { data, error } =
        await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            data: {
              nickname
            }
          }
        });

      if (error) throw error;

      if (data.session) {
        currentUser = data.user;
        await enterGame();
      } else {
        message.textContent =
          "회원가입 완료. 이메일 인증 후 로그인해 주세요.";
      }
    } else {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      currentUser = data.user;
      await enterGame();
    }
  } catch (error) {
    message.textContent =
      translateAuthError(error.message);
  } finally {
    button.disabled = false;
    button.textContent =
      authMode === "login" ? "로그인" : "회원가입";
  }
}

function translateAuthError(message) {
  if (message.includes("Invalid login credentials")) {
    return "이메일 또는 비밀번호가 올바르지 않습니다.";
  }

  if (message.includes("User already registered")) {
    return "이미 가입된 이메일입니다.";
  }

  if (message.includes("Email not confirmed")) {
    return "이메일 인증을 먼저 완료해 주세요.";
  }

  if (message.includes("duplicate key")) {
    return "이미 사용 중인 닉네임입니다.";
  }

  return message;
}

async function enterGame() {
  showGameScreen();

  const { error } =
    await supabaseClient.rpc("ensure_player_save");

  if (error) {
    showToast("저장 데이터 생성 실패: " + error.message);
  }

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
  if (realtimeChannel) {
    await supabaseClient.removeChannel(realtimeChannel);
    realtimeChannel = null;
  }

  await supabaseClient.auth.signOut();

  currentUser = null;
  currentProfile = null;
  currentInventory = [];
  currentStocks = [];
  currentHoldings = [];

  closePhone();
  showAuthScreen();
  showToast("로그아웃되었습니다.");
}

/* ====================================================
프로필 / 전체 새로고침
==================================================== */

async function refreshAllData() {
  await updateGlobalStockMarket();

  await loadProfile();

  await Promise.all([
    loadStocks(),
    loadInventory(),
    loadMarket(),
    loadRanking(),
    loadBusinesses(),
    loadActivities()
  ]);

  updateNetWorth();
}

async function loadProfile() {
  if (!currentUser) return;

  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(
        "id,nickname,cash,credit_score,reputation,job_count,updated_at"
      )
      .eq("id", currentUser.id)
      .single();

  if (error) {
    showToast("프로필 오류: " + error.message);
    return;
  }

  currentProfile = data;
  updateProfileUI();
}

function updateProfileUI() {
  if (!currentProfile) return;

  document.getElementById("nicknameTop").textContent =
    currentProfile.nickname;

  document.getElementById("nicknameHero").textContent =
    currentProfile.nickname;

  document.getElementById("phoneOwner").textContent =
    currentProfile.nickname;

  document.getElementById("cashTop").textContent =
    formatMoney(currentProfile.cash);

  document.getElementById("credit").textContent =
    currentProfile.credit_score;

  document.getElementById("reputation").textContent =
    currentProfile.reputation;
}

/* ====================================================
알바 / 탐색
==================================================== */

async function quickJob() {
  const { data, error } =
    await supabaseClient.rpc("do_quick_job");

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(
    "포장 알바 완료! +" + formatMoney(data.reward)
  );

  await Promise.all([
    loadProfile(),
    loadActivities()
  ]);

  updateNetWorth();
}

async function explore(location) {
  const box =
    document.getElementById("exploreResult");

  box.classList.remove("hidden");
  box.innerHTML = "탐색 중입니다...";

  const { data, error } =
    await supabaseClient.rpc("explore_location", {
      p_location: location
    });

  if (error) {
    box.innerHTML =
      `<strong>오류:</strong> ${escapeHtml(error.message)}`;
    return;
  }

  if (data.caught) {
    box.innerHTML = `
      <h3>🚨 사람에게 들켰습니다.</h3>
      <p>명성 ${data.reputation_loss}점 감소</p>
    `;

    await Promise.all([
      loadProfile(),
      loadActivities()
    ]);

    return;
  }

  if (!data.success) {
    box.innerHTML = `
      <h3>아무것도 발견하지 못했습니다.</h3>
      <p>조금 뒤 다시 탐색해 보세요.</p>
    `;
    return;
  }

  box.innerHTML = `
    <h3>
      ${itemEmoji[data.item_name] || "📦"}
      ${escapeHtml(data.item_name)} 발견!
    </h3>
    <p>아이템 상태: ${data.condition_score}점</p>
    <p>
      평균가:
      ${
        data.average_price_known
          ? formatMoney(data.average_price)
          : "가격 미상 · 감정 필요"
      }
    </p>
  `;

  await Promise.all([
    loadInventory(),
    loadActivities()
  ]);

  updateNetWorth();
}

/* ====================================================
인벤토리
==================================================== */

async function loadInventory() {
  const target =
    document.getElementById("inventory");

  if (!currentUser) return;

  target.innerHTML =
    `<div class="empty">인벤토리를 불러오는 중입니다.</div>`;

  const { data, error } =
    await supabaseClient
      .from("user_items")
      .select(`
        id,
        condition_score,
        is_appraised,
        appraised_price,
        is_listed,
        acquired_at,
        items (
          id,
          name,
          category,
          average_price,
          is_average_price_known,
          rarity
        )
      `)
      .eq("user_id", currentUser.id)
      .order("acquired_at", {
        ascending: false
      });

  if (error) {
    target.innerHTML =
      `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }

  currentInventory = data || [];

  updateMarketItemSelect();

  if (currentInventory.length === 0) {
    target.innerHTML = `
      <div class="empty">
        보유한 물건이 없습니다.<br>
        탐색으로 아이템을 찾아보세요.
      </div>
    `;
    return;
  }

  target.innerHTML =
    currentInventory
      .map((userItem) => {
        const item = userItem.items;

        const value =
          userItem.is_appraised
            ? Number(userItem.appraised_price)
            : item.is_average_price_known
              ? calculateConditionPrice(
                  item.average_price,
                  userItem.condition_score
                )
              : null;

        return `
          <div class="item-card">
            <div>
              <span>
                ${itemEmoji[item.name] || "📦"}
              </span>
              <h3>${escapeHtml(item.name)}</h3>
            </div>

            <p>
              ${escapeHtml(item.rarity)}
              · 상태 ${userItem.condition_score}/100
              · 등급 ${getConditionGrade(userItem.condition_score)}
            </p>

            <div class="value">
              ${
                value !== null
                  ? formatMoney(value)
                  : "가격 미상"
              }
            </div>

            <div class="item-actions">
              ${
                !item.is_average_price_known &&
                !userItem.is_appraised
                  ? `
                    <button
                      class="primary"
                      onclick="appraiseItem('${userItem.id}')"
                    >
                      감정
                    </button>
                  `
                  : ""
              }

              ${
                userItem.is_listed
                  ? `
                    <button class="ghost" disabled>
                      판매 중
                    </button>
                  `
                  : `
                    <button
                      class="ghost"
                      onclick="openPhoneMarket()"
                    >
                      장터 판매
                    </button>
                  `
              }
            </div>
          </div>
        `;
      })
      .join("");

  renderWallet();
}

async function appraiseItem(userItemId) {
  const { data, error } =
    await supabaseClient.rpc("appraise_item", {
      p_user_item_id: userItemId,
      p_expert_level: "basic"
    });

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(
    "감정 완료: " +
    formatMoney(data.estimated_price)
  );

  await Promise.all([
    loadProfile(),
    loadInventory(),
    loadActivities()
  ]);

  updateNetWorth();
}

/* ====================================================
휴대폰
==================================================== */

function openPhone() {
  document
    .getElementById("phoneOverlay")
    .classList.remove("hidden");

  phoneHome();
  updatePhoneTime();
}

function closePhone() {
  document
    .getElementById("phoneOverlay")
    .classList.add("hidden");
}

function backdropClose(event) {
  if (event.target.id === "phoneOverlay") {
    closePhone();
  }
}

function phoneHome() {
  document
    .querySelectorAll(".phone-screen")
    .forEach((screen) => {
      screen.classList.add("hidden");
    });

  document
    .getElementById("phoneHome")
    .classList.remove("hidden");
}

async function openApp(name) {
  document
    .querySelectorAll(".phone-screen")
    .forEach((screen) => {
      screen.classList.add("hidden");
    });

  document
    .getElementById(`app-${name}`)
    .classList.remove("hidden");

  if (name === "stocks") {
    await refreshStockApp();
  }

  if (name === "market") {
    await loadMarket();
  }

  if (name === "wallet") {
    renderWallet();
  }

  if (name === "ranking") {
    await loadRanking();
  }
}

async function openPhoneMarket() {
  openPhone();
  await openApp("market");
}

function updatePhoneTime() {
  const element =
    document.getElementById("phoneTime");

  if (!element) return;

  element.textContent =
    new Date().toLocaleTimeString(
      "ko-KR",
      {
        hour: "2-digit",
        minute: "2-digit"
      }
    );
}

/* ====================================================
주식
==================================================== */

async function updateGlobalStockMarket() {
  const { error } =
    await supabaseClient.rpc(
      "update_global_stock_market"
    );

  if (error) {
    console.warn(
      "주식 시세 갱신:",
      error.message
    );
  }
}

async function refreshStockApp() {
  await updateGlobalStockMarket();
  await loadStocks();
}

async function loadStocks() {
  if (!currentUser) return;

  const target =
    document.getElementById("stockList");

  target.innerHTML =
    `<div class="empty">시세를 불러오는 중입니다.</div>`;

  const [
    { data: stockData, error: stockError },
    { data: holdingData, error: holdingError }
  ] = await Promise.all([
    supabaseClient
      .from("stocks")
      .select(
        "id,symbol,name,current_price,previous_price,is_active,history,updated_at"
      )
      .eq("is_active", true)
      .order("name"),

    supabaseClient
      .from("stock_holdings")
      .select(
        "stock_id,quantity,average_buy_price"
      )
      .eq("user_id", currentUser.id)
  ]);

  if (stockError || holdingError) {
    target.innerHTML =
      `<div class="empty">${
        escapeHtml(
          stockError?.message ||
          holdingError?.message
        )
      }</div>`;
    return;
  }

  currentStocks = stockData || [];
  currentHoldings = holdingData || [];

  let totalValue = 0;
  let totalProfit = 0;

  target.innerHTML =
    currentStocks
      .map((stock) => {
        const holding =
          currentHoldings.find(
            (row) =>
              row.stock_id === stock.id
          );

        const owned =
          Number(holding?.quantity || 0);

        const averageBuy =
          Number(holding?.average_buy_price || 0);

        const current =
          Number(stock.current_price);

        const previous =
          Number(stock.previous_price);

        const difference =
          current - previous;

        const rate =
          previous > 0
            ? difference / previous * 100
            : 0;

        const evaluation =
          owned * current;

        const invested =
          owned * averageBuy;

        const profit =
          evaluation - invested;

        const profitRate =
          invested > 0
            ? profit / invested * 100
            : 0;

        const history =
          normalizeStockHistory(
            stock.history,
            previous,
            current
          );

        totalValue += evaluation;
        totalProfit += profit;

        return `
          <div class="stock-row">
            <div class="stock-row-top">
              <div>
                <div class="stock-name">
                  ${escapeHtml(stock.name)}
                </div>
                <div class="stock-symbol">
                  ${escapeHtml(stock.symbol)}
                </div>
              </div>

              <div class="stock-price">
                ${formatMoney(current)}
                <div class="${
                  difference >= 0
                    ? "change-up"
                    : "change-down"
                }">
                  ${
                    difference >= 0
                      ? "+"
                      : ""
                  }${rate.toFixed(2)}%
                </div>
              </div>
            </div>

            <div class="stock-chart-wrap">
              ${createStockChartSvg(history)}
              <div class="range-box">
                <span>변동폭</span>
                <b class="${
                  rate >= 0
                    ? "change-up"
                    : "change-down"
                }">
                  ${rate >= 0 ? "+" : ""}${rate.toFixed(2)}%
                </b>
                <small>
                  저 ${formatMoney(Math.min(...history))}
                  · 고 ${formatMoney(Math.max(...history))}
                </small>
              </div>
            </div>

            <div class="holding-dashboard">
              <div>
                <span>보유 수량</span>
                <b>${owned.toLocaleString()}주</b>
              </div>
              <div>
                <span>내 평균 매수가</span>
                <b>${owned > 0 ? formatMoney(averageBuy) : "-"}</b>
              </div>
              <div>
                <span>현재 평가액</span>
                <b>${formatMoney(evaluation)}</b>
              </div>
              <div>
                <span>평가손익</span>
                <b class="${
                  profit >= 0
                    ? "change-up"
                    : "change-down"
                }">
                  ${profit >= 0 ? "+" : ""}${formatMoney(profit)}
                  <small>
                    (${profitRate >= 0 ? "+" : ""}${profitRate.toFixed(2)}%)
                  </small>
                </b>
              </div>
            </div>

            <div class="trade-row">
              <input
                id="stockQuantity-${stock.id}"
                type="number"
                min="1"
                value="1"
                aria-label="${escapeHtml(stock.name)} 거래 수량"
              >

              <button
                class="buy-btn"
                onclick="tradeStock('${stock.id}', 'buy')"
              >
                매수
              </button>

              <button
                class="sell-btn"
                onclick="tradeStock('${stock.id}', 'sell')"
              >
                매도
              </button>
            </div>
          </div>
        `;
      })
      .join("");

  document.getElementById("stockValue").textContent =
    formatMoney(totalValue);

  const profitElement =
    document.getElementById("stockProfit");

  if (profitElement) {
    profitElement.textContent =
      `${totalProfit >= 0 ? "+" : ""}${formatMoney(totalProfit)}`;

    profitElement.classList.toggle(
      "profit-up",
      totalProfit >= 0
    );

    profitElement.classList.toggle(
      "profit-down",
      totalProfit < 0
    );
  }

  updateNetWorth();
  renderWallet();
}

async function tradeStock(stockId, type) {
  const input =
    document.getElementById(
      `stockQuantity-${stockId}`
    );

  const quantity =
    Number(input.value);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast(
      "수량은 1 이상의 정수로 입력해 주세요."
    );
    return;
  }

  const functionName =
    type === "buy"
      ? "buy_stock_v2"
      : "sell_stock_v2";

  const { data, error } =
    await supabaseClient.rpc(
      functionName,
      {
        p_stock_id: stockId,
        p_quantity: quantity
      }
    );

  if (error) {
    showToast(error.message);
    return;
  }

  const amount =
    type === "buy"
      ? data.total
      : data.net;

  showToast(
    `${type === "buy" ? "매수" : "매도"} 완료 · ` +
    `${quantity}주 · ${formatMoney(amount)}`
  );

  await Promise.all([
    loadProfile(),
    loadStocks(),
    loadActivities()
  ]);

  updateNetWorth();
}

/* ====================================================
오이장터
==================================================== */

function updateMarketItemSelect() {
  const select =
    document.getElementById("sellItem");

  if (!select) return;

  select.innerHTML =
    `<option value="">판매할 물건</option>`;

  currentInventory
    .filter((item) => !item.is_listed)
    .forEach((item) => {
      const option =
        document.createElement("option");

      option.value = item.id;
      option.textContent =
        `${item.items.name} · 상태 ${item.condition_score}`;

      select.appendChild(option);
    });
}

async function createListing() {
  const userItemId =
    document.getElementById("sellItem").value;

  const askingPrice =
    Math.floor(
      Number(
        document.getElementById("sellPrice").value
      )
    );

  if (!userItemId) {
    showToast(
      "판매할 물건을 선택해 주세요."
    );
    return;
  }

  if (
    !Number.isFinite(askingPrice) ||
    askingPrice <= 0
  ) {
    showToast(
      "판매 가격을 올바르게 입력해 주세요."
    );
    return;
  }

  const { error } =
    await supabaseClient.rpc(
      "create_market_listing",
      {
        p_user_item_id: userItemId,
        p_price: askingPrice
      }
    );

  if (error) {
    showToast(error.message);
    return;
  }

  document.getElementById("sellPrice").value = "";

  showToast(
    "오이장터에 판매 등록했습니다."
  );

  await Promise.all([
    loadInventory(),
    loadMarket(),
    loadActivities()
  ]);
}

async function loadMarket() {
  const target =
    document.getElementById("marketList");

  target.innerHTML =
    `<div class="empty">매물을 불러오는 중입니다.</div>`;

  const { data, error } =
    await supabaseClient
      .from("market_listings")
      .select(`
        id,
        title,
        asking_price,
        seller_type,
        seller_user_id,
        npc_name,
        status,
        created_at,
        user_items (
          id,
          condition_score,
          items (
            name,
            average_price,
            is_average_price_known
          )
        ),
        profiles:seller_user_id (
          nickname
        )
      `)
      .eq("status", "active")
      .order("created_at", {
        ascending: false
      })
      .limit(50);

  if (error) {
    target.innerHTML =
      `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    target.innerHTML =
      `<div class="empty">현재 등록된 매물이 없습니다.</div>`;
    return;
  }

  target.innerHTML =
    data
      .map((listing) => {
        const mine =
          listing.seller_user_id ===
          currentUser?.id;

        const sellerName =
          listing.seller_type === "npc"
            ? listing.npc_name || "NPC 판매자"
            : listing.profiles?.nickname || "유저";

        return `
          <div class="market-row">
            <div class="market-row-top">
              <div>
                <b>
                  ${
                    itemEmoji[listing.title] ||
                    "📦"
                  }
                  ${escapeHtml(listing.title)}
                </b>
                <div class="market-meta">
                  판매자 ${escapeHtml(sellerName)}
                  ${
                    listing.user_items
                      ? `· 상태 ${listing.user_items.condition_score}`
                      : ""
                  }
                </div>
              </div>

              <strong>
                ${formatMoney(listing.asking_price)}
              </strong>
            </div>

            <button
              class="${mine ? "cancel" : ""}"
              onclick="${
                mine
                  ? `cancelListing('${listing.id}')`
                  : `buyListing('${listing.id}')`
              }"
            >
              ${mine ? "판매 취소" : "구매하기"}
            </button>
          </div>
        `;
      })
      .join("");
}

async function buyListing(listingId) {
  const { data, error } =
    await supabaseClient.rpc(
      "buy_market_listing",
      {
        p_listing_id: listingId
      }
    );

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(
    "거래 성공! " +
    formatMoney(data.final_price)
  );

  await refreshAllData();
}

async function cancelListing(listingId) {
  const { error } =
    await supabaseClient.rpc(
      "cancel_market_listing",
      {
        p_listing_id: listingId
      }
    );

  if (error) {
    showToast(error.message);
    return;
  }

  showToast("판매를 취소했습니다.");

  await Promise.all([
    loadInventory(),
    loadMarket(),
    loadActivities()
  ]);
}

/* ====================================================
사업
==================================================== */

async function buyBusiness(type, price) {
  if (!currentProfile) return;

  if (Number(currentProfile.cash) < price) {
    showToast("보유 자금이 부족합니다.");
    return;
  }

  const { data, error } =
    await supabaseClient.rpc(
      "buy_business",
      {
        p_business_type: type,
        p_purchase_price: price
      }
    );

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(
    data.business_name +
    " 사업을 구매했습니다."
  );

  await Promise.all([
    loadProfile(),
    loadBusinesses(),
    loadActivities()
  ]);

  updateNetWorth();
}

async function loadBusinesses() {
  const target =
    document.getElementById("businessList");

  if (!currentUser || !target) return;

  const { data, error } =
    await supabaseClient
      .from("user_businesses")
      .select(
        "id,business_type,business_name,level,income_per_minute,last_collected_at,created_at"
      )
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: false
      });

  if (error) {
    target.innerHTML =
      `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    target.innerHTML =
      `<div class="empty">아직 보유한 사업이 없습니다.</div>`;
    return;
  }

  target.innerHTML =
    data
      .map((business) => `
        <div class="business-row">
          <div>
            <strong>
              ${escapeHtml(business.business_name)}
            </strong>
            <p class="muted">
              레벨 ${business.level}
              · 분당 ${formatMoney(business.income_per_minute)}
            </p>
          </div>

          <button
            class="primary"
            onclick="collectBusinessIncome('${business.id}')"
          >
            수익 받기
          </button>
        </div>
      `)
      .join("");
}

async function collectBusinessIncome(businessId) {
  const { data, error } =
    await supabaseClient.rpc(
      "collect_business_income",
      {
        p_business_id: businessId
      }
    );

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(
    "사업 수익 " +
    formatMoney(data.collected_amount) +
    "을 받았습니다."
  );

  await Promise.all([
    loadProfile(),
    loadBusinesses(),
    loadActivities()
  ]);

  updateNetWorth();
}

/* ====================================================
랭킹 / 활동 / 자산
==================================================== */

async function loadRanking() {
  const target =
    document.getElementById("rankingList");

  const { data, error } =
    await supabaseClient
      .from("profiles")
      .select(
        "nickname,cash,credit_score"
      )
      .order("cash", {
        ascending: false
      })
      .limit(20);

  if (error) {
    target.innerHTML =
      `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }

  target.innerHTML =
    (data || [])
      .map((user, index) => `
        <div class="rank-row">
          <div>
            <span class="rank-number">
              ${index + 1}
            </span>
            <b>${escapeHtml(user.nickname)}</b>
          </div>

          <strong>
            ${formatMoney(user.cash)}
          </strong>
        </div>
      `)
      .join("");
}

async function loadActivities() {
  const target =
    document.getElementById("activities");

  if (!currentUser) return;

  const { data, error } =
    await supabaseClient
      .from("activity_logs")
      .select("message,created_at")
      .eq("user_id", currentUser.id)
      .order("created_at", {
        ascending: false
      })
      .limit(12);

  if (error) {
    target.innerHTML =
      `<div class="empty">${escapeHtml(error.message)}</div>`;
    return;
  }

  currentActivities = data || [];

  target.innerHTML =
    currentActivities.length
      ? currentActivities
          .map((row) => `
            <div class="activity-row">
              ${escapeHtml(row.message)}
            </div>
          `)
          .join("")
      : `<div class="empty">아직 활동 기록이 없습니다.</div>`;
}

function renderWallet() {
  const target =
    document.getElementById("walletView");

  if (!target || !currentProfile) return;

  const stockValue =
    currentHoldings.reduce((sum, holding) => {
      const stock =
        currentStocks.find(
          (item) =>
            item.id === holding.stock_id
        );

      return (
        sum +
        Number(holding.quantity) *
        Number(stock?.current_price || 0)
      );
    }, 0);

  const itemValue =
    currentInventory.reduce((sum, userItem) => {
      const item = userItem.items;

      const value =
        userItem.is_appraised
          ? Number(userItem.appraised_price)
          : item.is_average_price_known
            ? calculateConditionPrice(
                item.average_price,
                userItem.condition_score
              )
            : 0;

      return sum + value;
    }, 0);

  target.innerHTML = `
    <div class="wallet-card">
      <span>현금</span>
      <b>${formatMoney(currentProfile.cash)}</b>
    </div>

    <div class="wallet-card">
      <span>주식 평가액</span>
      <b>${formatMoney(stockValue)}</b>
    </div>

    <div class="wallet-card">
      <span>아이템 추정가</span>
      <b>${formatMoney(itemValue)}</b>
    </div>

    <div class="wallet-card">
      <span>신용 / 명성</span>
      <b>
        ${currentProfile.credit_score}
        /
        ${currentProfile.reputation}
      </b>
    </div>
  `;
}

function updateNetWorth() {
  if (!currentProfile) return;

  const stockValue =
    currentHoldings.reduce((sum, holding) => {
      const stock =
        currentStocks.find(
          (item) =>
            item.id === holding.stock_id
        );

      return (
        sum +
        Number(holding.quantity) *
        Number(stock?.current_price || 0)
      );
    }, 0);

  const itemValue =
    currentInventory.reduce((sum, userItem) => {
      const item = userItem.items;

      const value =
        userItem.is_appraised
          ? Number(userItem.appraised_price)
          : item.is_average_price_known
            ? calculateConditionPrice(
                item.average_price,
                userItem.condition_score
              )
            : 0;

      return sum + value;
    }, 0);

  const total =
    Number(currentProfile.cash) +
    stockValue +
    itemValue;

  document.getElementById("networth").textContent =
    formatMoney(total);

  renderWallet();
}

function normalizeStockHistory(
  rawHistory,
  previous,
  current
) {
  let values = [];

  if (Array.isArray(rawHistory)) {
    values = rawHistory;
  } else if (typeof rawHistory === "string") {
    try {
      const parsed = JSON.parse(rawHistory);
      values = Array.isArray(parsed) ? parsed : [];
    } catch (_error) {
      values = [];
    }
  }

  values = values
    .map(Number)
    .filter(Number.isFinite)
    .slice(-24);

  if (values.length === 0) {
    values = [
      Number(previous) || Number(current) || 0,
      Number(current) || Number(previous) || 0
    ];
  } else if (
    values[values.length - 1] !== Number(current)
  ) {
    values.push(Number(current));
  }

  while (values.length < 8) {
    values.unshift(values[0]);
  }

  return values.slice(-24);
}

function createStockChartSvg(values) {
  const width = 230;
  const height = 92;
  const padding = 8;

  const minimum = Math.min(...values);
  const maximum = Math.max(...values);
  const range = Math.max(maximum - minimum, 1);

  const points = values
    .map((value, index) => {
      const x =
        padding +
        (
          index /
          Math.max(values.length - 1, 1)
        ) *
        (width - padding * 2);

      const y =
        height -
        padding -
        (
          (value - minimum) /
          range
        ) *
        (height - padding * 2);

      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const isRising =
    values[values.length - 1] >= values[0];

  const lineClass =
    isRising
      ? "chart-line-up"
      : "chart-line-down";

  const fillClass =
    isRising
      ? "chart-fill-up"
      : "chart-fill-down";

  const polygonPoints =
    `${padding},${height - padding} ` +
    points +
    ` ${width - padding},${height - padding}`;

  return `
    <svg
      class="stock-chart"
      viewBox="0 0 ${width} ${height}"
      role="img"
      aria-label="최근 주가 변동 그래프"
      preserveAspectRatio="none"
    >
      <line x1="${padding}" y1="${height / 2}"
        x2="${width - padding}" y2="${height / 2}"
        class="chart-grid-line"></line>
      <polygon
        points="${polygonPoints}"
        class="${fillClass}"
      ></polygon>
      <polyline
        points="${points}"
        class="${lineClass}"
      ></polyline>
    </svg>
  `;
}

/* ====================================================
실시간 갱신
==================================================== */

function subscribeRealtime() {
  if (realtimeChannel) return;

  realtimeChannel =
    supabaseClient
      .channel("selling-god-v2-live")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "stocks"
        },
        () => loadStocks()
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "market_listings"
        },
        () => loadMarket()
      )
      .subscribe();
}

/* ====================================================
공통
==================================================== */

function calculateConditionPrice(
  averagePrice,
  conditionScore
) {
  let multiplier = 0.35;

  if (conditionScore >= 95) multiplier = 1.3;
  else if (conditionScore >= 85) multiplier = 1.15;
  else if (conditionScore >= 70) multiplier = 1;
  else if (conditionScore >= 50) multiplier = 0.8;
  else if (conditionScore >= 30) multiplier = 0.6;

  return Math.round(
    Number(averagePrice) *
    multiplier
  );
}

function getConditionGrade(score) {
  if (score >= 95) return "S";
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 50) return "C";
  if (score >= 30) return "D";
  return "E";
}

function formatMoney(value) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "0원";
  }

  const units = [
    { value: 1e20, label: "해" },
    { value: 1e16, label: "경" },
    { value: 1e12, label: "조" },
    { value: 1e8, label: "억" },
    { value: 1e4, label: "만" }
  ];

  for (const unit of units) {
    if (Math.abs(amount) >= unit.value) {
      const divided =
        amount / unit.value;

      const digits =
        Math.abs(divided) >= 100
          ? 0
          : Math.abs(divided) >= 10
            ? 1
            : 2;

      return (
        Number(
          divided.toFixed(digits)
        ).toLocaleString() +
        unit.label +
        " 원"
      );
    }
  }

  return (
    Math.floor(amount).toLocaleString() +
    "원"
  );
}

function escapeHtml(value) {
  const div =
    document.createElement("div");

  div.textContent = value ?? "";

  return div.innerHTML;
}

function showToast(message) {
  const toast =
    document.getElementById("toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}
