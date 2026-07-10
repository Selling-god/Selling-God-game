/*
====================================================
판매의 신 v1
중요: 아래 두 값을 Supabase에서 복사해서 넣어야 합니다.
service_role 키는 절대 넣지 마세요.
====================================================
*/

const SUPABASE_URL = "여기에_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "여기에_SUPABASE_ANON_또는_PUBLISHABLE_KEY";

/*
예시:

const SUPABASE_URL =
  "https://abcdefghijk.supabase.co";

const SUPABASE_ANON_KEY =
  "sb_publishable_xxxxxxxxxxxxxxxxx";
*/

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

let authMode = "login";
let currentUser = null;
let currentProfile = null;
let currentInventory = [];

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
  validateSupabaseSettings();

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session?.user) {
    currentUser = session.user;
    await enterGame();
  } else {
    showAuthScreen();
  }

  supabaseClient.auth.onAuthStateChange(
    async (_event, sessionData) => {
      if (sessionData?.user) {
        currentUser = sessionData.user;
      }
    }
  );
}

function validateSupabaseSettings() {
  if (
    SUPABASE_URL.includes("여기에_") ||
    SUPABASE_ANON_KEY.includes("여기에_")
  ) {
    showToast(
      "game.js 상단에 Supabase URL과 공개 키를 입력해야 합니다."
    );
  }
}

function changeAuthMode(mode) {
  authMode = mode;

  const nicknameField =
    document.getElementById("nickname-field");

  const loginTab =
    document.getElementById("login-tab");

  const signupTab =
    document.getElementById("signup-tab");

  const submitButton =
    document.getElementById("auth-submit-button");

  document.getElementById("auth-message").textContent = "";

  if (mode === "signup") {
    nicknameField.classList.remove("hidden");
    signupTab.classList.add("active");
    loginTab.classList.remove("active");
    submitButton.textContent = "회원가입";
  } else {
    nicknameField.classList.add("hidden");
    loginTab.classList.add("active");
    signupTab.classList.remove("active");
    submitButton.textContent = "로그인";
  }
}

async function submitAuth() {
  const nickname =
    document.getElementById("nickname").value.trim();

  const email =
    document.getElementById("email").value.trim();

  const password =
    document.getElementById("password").value;

  const message =
    document.getElementById("auth-message");

  const submitButton =
    document.getElementById("auth-submit-button");

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

  submitButton.disabled = true;
  submitButton.textContent = "처리 중...";

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

      if (error) {
        throw error;
      }

      if (data.session) {
        currentUser = data.user;
        await enterGame();
      } else {
        message.textContent =
          "회원가입이 완료되었습니다. 이메일 인증 메일을 확인해 주세요.";
      }
    } else {
      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) {
        throw error;
      }

      currentUser = data.user;
      await enterGame();
    }
  } catch (error) {
    message.textContent =
      translateAuthError(error.message);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent =
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

  await loadProfile();
  await Promise.all([
    loadStocks(),
    loadInventory(),
    loadMarket(),
    loadRankings(),
    loadBusinesses()
  ]);
}

function showAuthScreen() {
  document
    .getElementById("auth-screen")
    .classList.remove("hidden");

  document
    .getElementById("game-screen")
    .classList.add("hidden");
}

function showGameScreen() {
  document
    .getElementById("auth-screen")
    .classList.add("hidden");

  document
    .getElementById("game-screen")
    .classList.remove("hidden");
}

async function logout() {
  await supabaseClient.auth.signOut();

  currentUser = null;
  currentProfile = null;

  showAuthScreen();
  showToast("로그아웃되었습니다.");
}

async function loadProfile() {
  if (!currentUser) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select(
      "id, nickname, cash, credit_score, reputation"
    )
    .eq("id", currentUser.id)
    .single();

  if (error) {
    showToast(`프로필 오류: ${error.message}`);
    return;
  }

  currentProfile = data;
  updateProfileUI();
}

function updateProfileUI() {
  if (!currentProfile) {
    return;
  }

  document.getElementById("header-nickname").textContent =
    currentProfile.nickname;

  document.getElementById("cash-display").textContent =
    formatMoney(currentProfile.cash);

  document.getElementById("credit-display").textContent =
    `${currentProfile.credit_score} / 1000`;

  document.getElementById("reputation-display").textContent =
    `${currentProfile.reputation} / 100`;
}

function openPage(pageName, clickedButton) {
  document
    .querySelectorAll(".page")
    .forEach((page) => {
      page.classList.remove("active-page");
    });

  document
    .querySelectorAll(".menu-button")
    .forEach((button) => {
      button.classList.remove("active");
    });

  const targetPage =
    document.getElementById(`page-${pageName}`);

  if (targetPage) {
    targetPage.classList.add("active-page");
  }

  if (clickedButton) {
    clickedButton.classList.add("active");
  }

  if (pageName === "stocks") loadStocks();
  if (pageName === "inventory") loadInventory();
  if (pageName === "market") loadMarket();
  if (pageName === "rankings") loadRankings();
  if (pageName === "business") loadBusinesses();
}

function openPageByName(pageName) {
  const button = document.querySelector(
    `.menu-button[data-page="${pageName}"]`
  );

  openPage(pageName, button);
}

async function refreshAllData() {
  await Promise.all([
    loadProfile(),
    loadStocks(),
    loadInventory(),
    loadMarket(),
    loadRankings(),
    loadBusinesses()
  ]);

  showToast("전체 데이터를 새로고침했습니다.");
}

/* ====================================================
주식
==================================================== */

async function loadStocks() {
  const stockList =
    document.getElementById("stock-list");

  stockList.innerHTML =
    `<div class="empty-state">시세를 불러오는 중입니다.</div>`;

  const { data, error } = await supabaseClient
    .from("stocks")
    .select(
      "id, symbol, name, current_price, previous_price"
    )
    .eq("is_active", true)
    .order("name");

  if (error) {
    stockList.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    stockList.innerHTML =
      `<div class="empty-state">등록된 주식이 없습니다.</div>`;
    return;
  }

  stockList.innerHTML = data
    .map((stock) => {
      const current = Number(stock.current_price);
      const previous = Number(stock.previous_price);

      const difference = current - previous;

      const rate =
        previous > 0
          ? (difference / previous) * 100
          : 0;

      const rising = difference >= 0;

      return `
        <div class="stock-card">
          <div class="stock-top">
            <div>
              <span class="stock-symbol">
                ${escapeHtml(stock.symbol)}
              </span>

              <h2>${escapeHtml(stock.name)}</h2>
            </div>

            <strong class="${rising ? "up" : "down"}">
              ${rising ? "▲" : "▼"}
              ${Math.abs(rate).toFixed(2)}%
            </strong>
          </div>

          <div class="stock-price">
            ${formatMoney(current)}
          </div>

          <p class="${rising ? "up" : "down"}">
            ${rising ? "+" : "-"}
            ${formatMoney(Math.abs(difference))}
          </p>

          <div class="stock-trade-row">
            <input
              id="stock-quantity-${stock.id}"
              type="number"
              min="1"
              value="1"
              placeholder="수량"
            >

            <button
              class="buy-button"
              onclick="tradeStock('${stock.id}', 'buy')"
            >
              매수
            </button>

            <button
              class="sell-button"
              onclick="tradeStock('${stock.id}', 'sell')"
            >
              매도
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function tradeStock(stockId, type) {
  const input =
    document.getElementById(`stock-quantity-${stockId}`);

  const quantity = Number(input.value);

  if (!Number.isInteger(quantity) || quantity <= 0) {
    showToast("수량은 1 이상의 정수로 입력해 주세요.");
    return;
  }

  const functionName =
    type === "buy" ? "buy_stock" : "sell_stock";

  const { data, error } = await supabaseClient.rpc(
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

  showToast(
    `${type === "buy" ? "매수" : "매도"} 성공: ` +
    `${quantity}주, ${formatMoney(data.total)}`
  );

  await loadProfile();
  await loadStocks();
}

/* ====================================================
탐색
==================================================== */

async function exploreLocation(location) {
  const resultBox =
    document.getElementById("explore-result");

  resultBox.classList.remove("hidden");
  resultBox.innerHTML = "탐색 중입니다...";

  const { data, error } = await supabaseClient.rpc(
    "explore_location",
    {
      p_location: location
    }
  );

  if (error) {
    resultBox.innerHTML =
      `<strong>오류:</strong> ${escapeHtml(error.message)}`;
    return;
  }

  if (data.caught) {
    resultBox.innerHTML = `
      <h3>🚨 사람에게 들켰습니다!</h3>
      <p>발각 확률: ${data.caught_rate}%</p>
      <p>명성 ${data.reputation_loss}점 감소</p>
    `;

    await loadProfile();
    return;
  }

  if (!data.success) {
    resultBox.innerHTML = `
      <h3>아무것도 발견하지 못했습니다.</h3>
      <p>조금 뒤 다시 탐색해 보세요.</p>
    `;
    return;
  }

  resultBox.innerHTML = `
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
          : "알 수 없음 · 감정 필요"
      }
    </p>
  `;

  await loadInventory();
}

/* ====================================================
인벤토리
==================================================== */

async function loadInventory() {
  const inventoryList =
    document.getElementById("inventory-list");

  inventoryList.innerHTML =
    `<div class="empty-state">인벤토리를 불러오는 중입니다.</div>`;

  if (!currentUser) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("user_items")
    .select(`
      id,
      condition_score,
      is_appraised,
      appraised_price,
      is_listed,
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
    inventoryList.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    return;
  }

  currentInventory = data || [];

  updateMarketItemSelect();

  if (currentInventory.length === 0) {
    inventoryList.innerHTML = `
      <div class="empty-state">
        보유한 물건이 없습니다.<br>
        물건 탐색을 통해 아이템을 찾아보세요.
      </div>
    `;
    return;
  }

  inventoryList.innerHTML = currentInventory
    .map((userItem) => {
      const item = userItem.items;
      const grade =
        getConditionGrade(userItem.condition_score);

      const estimatedPrice =
        userItem.is_appraised
          ? userItem.appraised_price
          : item.is_average_price_known
            ? calculateConditionPrice(
                item.average_price,
                userItem.condition_score
              )
            : null;

      return `
        <div class="item-card">
          <div class="item-top">
            <div>
              <span class="tag">
                ${escapeHtml(item.rarity.toUpperCase())}
              </span>

              <h2>
                ${itemEmoji[item.name] || "📦"}
                ${escapeHtml(item.name)}
              </h2>
            </div>

            <strong>등급 ${grade}</strong>
          </div>

          <p>${escapeHtml(item.category)}</p>

          <div class="probability-box">
            <span>상태</span>
            <strong>${userItem.condition_score} / 100</strong>
          </div>

          <div class="condition-bar">
            <div
              class="condition-fill"
              style="width: ${userItem.condition_score}%"
            ></div>
          </div>

          <div class="probability-box">
            <span>예상 가치</span>
            <strong>
              ${
                estimatedPrice
                  ? formatMoney(estimatedPrice)
                  : "가격 미상"
              }
            </strong>
          </div>

          <div class="item-actions">
            ${
              !item.is_average_price_known &&
              !userItem.is_appraised
                ? `
                  <button
                    class="primary-button"
                    onclick="appraiseItem('${userItem.id}')"
                  >
                    전문가 감정
                  </button>
                `
                : ""
            }

            ${
              userItem.is_listed
                ? `
                  <button
                    class="secondary-button"
                    disabled
                  >
                    판매 중
                  </button>
                `
                : `
                  <button
                    class="secondary-button"
                    onclick="openPageByName('market')"
                  >
                    장터에 판매
                  </button>
                `
            }
          </div>
        </div>
      `;
    })
    .join("");
}

async function appraiseItem(userItemId) {
  const { data, error } = await supabaseClient.rpc(
    "appraise_item",
    {
      p_user_item_id: userItemId,
      p_expert_level: "basic"
    }
  );

  if (error) {
    showToast(error.message);
    return;
  }

  showToast(
    `감정 완료: 예상 가치 ${formatMoney(data.estimated_price)}`
  );

  await loadProfile();
  await loadInventory();
}

/* ====================================================
오이장터
==================================================== */

function updateMarketItemSelect() {
  const select =
    document.getElementById("market-item-select");

  if (!select) {
    return;
  }

  const availableItems =
    currentInventory.filter((item) => !item.is_listed);

  select.innerHTML =
    `<option value="">판매할 물건 선택</option>`;

  availableItems.forEach((item) => {
    const option = document.createElement("option");

    option.value = item.id;
    option.textContent =
      `${item.items.name} · 상태 ${item.condition_score}`;

    select.appendChild(option);
  });
}

async function createListing() {
  const userItemId =
    document.getElementById("market-item-select").value;

  const askingPrice = Number(
    document.getElementById("market-price-input").value
  );

  if (!userItemId) {
    showToast("판매할 물건을 선택해 주세요.");
    return;
  }

  if (!Number.isFinite(askingPrice) || askingPrice <= 0) {
    showToast("판매 가격을 올바르게 입력해 주세요.");
    return;
  }

  const selectedItem =
    currentInventory.find((item) => item.id === userItemId);

  if (!selectedItem) {
    showToast("아이템 정보를 찾을 수 없습니다.");
    return;
  }

  const { error } = await supabaseClient
    .from("market_listings")
    .insert({
      seller_user_id: currentUser.id,
      user_item_id: userItemId,
      seller_type: "user",
      title: selectedItem.items.name,
      asking_price: Math.floor(askingPrice),
      status: "active"
    });

  if (error) {
    showToast(error.message);
    return;
  }

  const { error: updateError } = await supabaseClient
    .from("user_items")
    .update({
      is_listed: true
    })
    .eq("id", userItemId)
    .eq("user_id", currentUser.id);

  if (updateError) {
    showToast(updateError.message);
    return;
  }

  showToast("오이장터에 판매 등록했습니다.");

  document.getElementById("market-price-input").value = "";

  await loadInventory();
  await loadMarket();
}

async function loadMarket() {
  const marketList =
    document.getElementById("market-list");

  marketList.innerHTML =
    `<div class="empty-state">매물을 불러오는 중입니다.</div>`;

  const { data, error } = await supabaseClient
    .from("market_listings")
    .select(`
      id,
      title,
      asking_price,
      seller_type,
      seller_user_id,
      npc_name,
      status,
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
    });

  if (error) {
    marketList.innerHTML =
      `<div class="empty-state">${escapeHtml(error.message)}</div>`;
    return;
  }

  if (!data || data.length === 0) {
    marketList.innerHTML = `
      <div class="empty-state">
        현재 등록된 매물이 없습니다.
      </div>
    `;
    return;
  }

  marketList.innerHTML = data
    .map((listing) => {
      const isMine =
        listing.seller_user_id === currentUser?.id;

      const sellerName =
        listing.seller_type === "npc"
          ? listing.npc_name || "NPC 판매자"
          : listing.profiles?.nickname || "유저";

      const itemInfo = listing.user_items;
      const baseItem = itemInfo?.items;

      const averageValue =
        baseItem?.average_price &&
        itemInfo?.condition_score
          ? calculateConditionPrice(
              baseItem.average_price,
              itemInfo.condition_score
            )
          : null;

      const successRate =
        averageValue
          ? calculateNegotiationChance(
              listing.asking_price,
              averageValue
            )
          : null;

      return `
        <div class="market-card">
          <div class="market-top">
            <div>
              <span class="tag">
                ${
                  listing.seller_type === "npc"
                    ? "NPC"
                    : "USER"
                }
              </span>

              <h2>
                ${itemEmoji[listing.title] || "📦"}
                ${escapeHtml(listing.title)}
              </h2>
            </div>

            <strong>
              ${formatMoney(listing.asking_price)}
            </strong>
          </div>

          <p>판매자: ${escapeHtml(sellerName)}</p>

          ${
            itemInfo
              ? `<p>상태: ${itemInfo.condition_score} / 100</p>`
              : ""
          }

          ${
            successRate !== null
              ? `
                <div class="probability-box">
                  <span>현재 거래 성공 확률</span>
                  <strong>${successRate}%</strong>
                </div>
              `
              : ""
          }

          <div class="market-actions">
            ${
              isMine
                ? `
                  <button
                    class="secondary-button"
                    onclick="cancelListing('${listing.id}', '${itemInfo?.id || ""}')"
                  >
                    판매 취소
                  </button>
                `
                : `
                  <button
                    class="primary-button"
                    onclick="buyListing('${listing.id}')"
                  >
                    구매하기
                  </button>
                `
            }
          </div>
        </div>
      `;
    })
    .join("");
}

async function buyListing(listingId) {
  const { data, error } = await supabaseClient.rpc(
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
    `거래 성공! ${formatMoney(data.final_price)}에 구매했습니다.`
  );

  await refreshAllData();
}

async function cancelListing(listingId, userItemId) {
  const { error } = await supabaseClient
    .from("market_listings")
    .update({
      status: "cancelled"
    })
    .eq("id", listingId)
    .eq("seller_user_id", currentUser.id);

  if (error) {
    showToast(error.message);
    return;
  }

  if (userItemId) {
    await supabaseClient
      .from("user_items")
      .update({
        is_listed: false
      })
      .eq("id", userItemId)
      .eq("user_id", currentUser.id);
  }

  showToast("판매를 취소했습니다.");

  await loadInventory();
  await loadMarket();
}

function calculateNegotiationChance(
  askingPrice,
  averageValue
) {
  const credit = Number(
    currentProfile?.credit_score || 500
  );

  const reputation = Number(
    currentProfile?.reputation || 50
  );

  let creditBonus = 0;

  if (credit >= 800) creditBonus = 20;
  else if (credit >= 600) creditBonus = 10;
  else if (credit < 200) creditBonus = -15;
  else if (credit < 400) creditBonus = -5;

  let reputationBonus = 0;

  if (reputation >= 80) reputationBonus = 10;
  else if (reputation >= 60) reputationBonus = 5;
  else if (reputation < 20) reputationBonus = -20;
  else if (reputation < 40) reputationBonus = -10;

  const priceRatio = askingPrice / averageValue;

  let pricePenalty = 0;

  if (priceRatio >= 1.5) pricePenalty = 35;
  else if (priceRatio >= 1.3) pricePenalty = 25;
  else if (priceRatio >= 1.2) pricePenalty = 15;
  else if (priceRatio >= 1.1) pricePenalty = 8;

  return Math.max(
    5,
    Math.min(
      95,
      60 + creditBonus + reputationBonus - pricePenalty
    )
  );
}

/* ====================================================
사업
==================================================== */

async function buyBusiness(type, price) {
  if (!currentProfile) {
    return;
  }

  if (Number(currentProfile.cash) < price) {
    showToast("보유 자금이 부족합니다.");
    return;
  }

  const { data, error } = await supabaseClient.rpc(
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

  showToast(`${data.business_name} 사업을 구매했습니다.`);

  await loadProfile();
  await loadBusinesses();
}

async function loadBusinesses() {
  const businessList =
    document.getElementById("business-list");

  if (!businessList || !currentUser) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("user_businesses")
    .select(
      "id, business_type, business_name, level, income_per_minute, last_collected_at"
    )
    .eq("user_id", currentUser.id)
    .order("created_at", {
      ascending: false
    });

  if (error) {
    businessList.innerHTML =
      `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data || data.length === 0) {
    businessList.innerHTML =
      `<p class="sub-text">아직 보유한 사업이 없습니다.</p>`;
    return;
  }

  businessList.innerHTML = data
    .map((business) => {
      return `
        <div class="business-row">
          <div>
            <strong>
              ${escapeHtml(business.business_name)}
            </strong>

            <p class="sub-text">
              레벨 ${business.level} ·
              분당 ${formatMoney(business.income_per_minute)}
            </p>
          </div>

          <button
            class="primary-button"
            onclick="collectBusinessIncome('${business.id}')"
          >
            수익 받기
          </button>
        </div>
      `;
    })
    .join("");
}

async function collectBusinessIncome(businessId) {
  const { data, error } = await supabaseClient.rpc(
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
    `사업 수익 ${formatMoney(data.collected_amount)}을 받았습니다.`
  );

  await loadProfile();
  await loadBusinesses();
}

/* ====================================================
랭킹
==================================================== */

async function loadRankings() {
  const cashRanking =
    document.getElementById("cash-ranking");

  const creditRanking =
    document.getElementById("credit-ranking");

  const { data: cashData, error: cashError } =
    await supabaseClient
      .from("profiles")
      .select("nickname, cash")
      .order("cash", {
        ascending: false
      })
      .limit(20);

  const { data: creditData, error: creditError } =
    await supabaseClient
      .from("profiles")
      .select("nickname, credit_score")
      .order("credit_score", {
        ascending: false
      })
      .limit(20);

  if (cashError) {
    cashRanking.innerHTML =
      `<p>${escapeHtml(cashError.message)}</p>`;
  } else {
    cashRanking.innerHTML = createRankingRows(
      cashData,
      "cash"
    );
  }

  if (creditError) {
    creditRanking.innerHTML =
      `<p>${escapeHtml(creditError.message)}</p>`;
  } else {
    creditRanking.innerHTML = createRankingRows(
      creditData,
      "credit"
    );
  }
}

function createRankingRows(data, type) {
  if (!data || data.length === 0) {
    return `<p class="sub-text">랭킹 정보가 없습니다.</p>`;
  }

  return data
    .map((user, index) => {
      const value =
        type === "cash"
          ? formatMoney(user.cash)
          : `${user.credit_score}점`;

      return `
        <div class="rank-row">
          <div>
            <span class="rank-number">
              ${index + 1}
            </span>

            <strong>
              ${escapeHtml(user.nickname)}
            </strong>
          </div>

          <strong>${value}</strong>
        </div>
      `;
    })
    .join("");
}

/* ====================================================
공통 함수
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

  return Math.round(Number(averagePrice) * multiplier);
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
      const divided = amount / unit.value;

      const digits =
        Math.abs(divided) >= 100
          ? 0
          : Math.abs(divided) >= 10
            ? 1
            : 2;

      return (
        Number(divided.toFixed(digits)).toLocaleString() +
        unit.label +
        " 원"
      );
    }
  }

  return `${Math.floor(amount).toLocaleString()}원`;
}

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = value ?? "";
  return div.innerHTML;
}

let toastTimer = null;

function showToast(message) {
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}
