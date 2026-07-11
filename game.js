<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>판매의 신 v12 RELEASE</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="config.js"></script>
</head>
<body>
<div id="bootLoader" class="boot-loader"><div class="boot-card"><div class="boot-logo">👑</div><b>판매의 신</b><span id="bootText">게임 데이터를 불러오는 중...</span><div class="boot-bar"><i></i></div></div></div>
<div id="toast" class="toast" role="status" aria-live="polite"></div>
<div id="fatalError" class="fatal-error hidden"><div class="fatal-card"><h2>게임을 시작할 수 없습니다</h2><p id="fatalMessage"></p><button onclick="location.reload()">다시 시도</button></div></div>

<section id="auth" class="screen auth-screen">
  <div class="auth-card panel">
    <div class="logo">👑</div>
    <p class="eyebrow">SELLING TYCOON ONLINE</p>
    <h1>판매의 신</h1>
    <p class="muted">흥정·경매·거래·하우징이 계정에 저장됩니다. 서로 다른 거래 아이템 500종이 등장합니다.</p>
    <div class="tabs">
      <button id="loginTab" class="active" onclick="setAuthMode('login')">로그인</button>
      <button id="signupTab" onclick="setAuthMode('signup')">회원가입</button>
    </div>
    <label id="nicknameWrap" class="field hidden">닉네임<input id="nickname" maxlength="12"></label>
    <label class="field">이메일<input id="email" type="email"></label>
    <label class="field">비밀번호<input id="password" type="password" minlength="6"></label>
    <button id="authBtn" class="btn primary full" onclick="submitAuth()">로그인</button>
    <p id="authMsg" class="error"></p>
  </div>
</section>

<section id="game" class="screen hidden">
  <header class="hud">
    <div class="player">
      <div class="avatar">👑</div>
      <div><small>전당포 초보 사장</small><b id="nicknameTop">판매왕</b></div>
    </div>
    <div class="resources">
      <div><span>현금</span><b id="cashTop">0원</b></div>
      <div><span>신용</span><b id="credit">500</b></div>
      <div><span>명성</span><b id="reputation">50</b></div>
      <div><span>총자산</span><b id="networth">0원</b></div>
    </div>
    <div class="hud-buttons">
      <button onclick="openPhone()">📱</button>
      <button onclick="logout()">🚪</button>
    </div>
  </header>

  <div class="layout">
    <nav class="nav">
      <button class="active" data-page="city" onclick="openPage('city',this)">🎭<span>메인</span></button>
      <button data-page="inventory" onclick="openPage('inventory',this)">🎒<span>가방</span></button>
      <button data-page="pawnshop" onclick="openPage('pawnshop',this)">🏚️<span>전당포</span></button>
      <button data-page="auction" onclick="openPage('auction',this)">🔨<span>경매장</span></button>
      <button data-page="market" onclick="openPage('market',this)">🛒<span>중고장터</span></button>
      <button data-page="house" onclick="openPage('house',this)">🏠<span>내 집</span></button>
      <button data-page="collection" onclick="openPage('collection',this)">✨<span>소장품</span></button>
    </nav>

    <main class="stage">
      <section id="page-city" class="page active">
        <div class="premium-game-ui">
          <div class="premium-topbar">
            <div class="premium-title-wrap">
              <div class="premium-emblem">👑</div>
              <div>
                <p class="eyebrow">PAWNSHOP NEGOTIATION TYCOON</p>
                <h1>판매의 신</h1>
                <small>전설의 흥정가가 되어라</small>
              </div>
            </div>
            <div class="premium-stats">
              <div><span>현금</span><b id="premiumCash">500,000원</b></div>
              <div><span>신용도</span><b id="premiumCredit">500</b></div>
              <div><span>평판</span><b id="premiumRep">50</b></div>
              <div><span>총자산</span><b id="premiumNet">500,000원</b></div>
            </div>
          </div>

          <div class="premium-main-grid">
            <aside class="mission-board">
              <div class="board-title">오늘의 목표</div>
              <div class="mission-row"><span>물건 2개 판매하기</span><b id="missionSell">0 / 2</b></div>
              <div class="mission-progress"><i style="width:0%"></i></div>
              <div class="mission-reward">보상 +50,000원</div>
              <div class="mission-row"><span>흥정 3회 성공하기</span><b id="missionDeal">0 / 3</b></div>
              <div class="mission-progress"><i style="width:0%"></i></div>
              <div class="mission-reward">보상 신용도 +10</div>
              <button class="btn light" onclick="openPage('inventory',document.querySelector('[data-page=inventory]'))">가방 확인</button>
              <div class="market-note">
                <b>오늘의 시세</b>
                <span>골동품 ▲ 5%</span>
                <span>전자제품 ▼ 3%</span>
                <span>명품 ▲ 2%</span>
              </div>
            </aside>

            <section class="shop-stage premium-stage">
              <div class="shop-stage-bg"></div>
              <div class="npc-portrait">
                <img src="assets/shop_npc.jpg" alt="전당포 손님">
              </div>
              <div class="green-lamp">💡</div>
              <div class="service-bell">🔔</div>
              <div class="customer-dialogue">
                <span class="dialogue-name">손님</span>
                <b>“이거 참 오래됐는데, 누가 좀 봐주겠소?”</b>
                <p>당신 눈썰미라면 좋은 값을 쳐줄 것 같아서 말이오.</p>
              </div>
            </section>

            <aside class="appraisal-panel">
              <div class="appraisal-header">감정할 물건</div>
              <div id="premiumCurrentItem" class="premium-item-card">
                <img src="assets/umbrella.png" alt="빈티지 우산">
                <div>
                  <h2>빈티지 우산</h2>
                  <p>생활용품 · 일반</p>
                </div>
              </div>
              <div class="premium-condition">
                <span>상태 <b id="premiumCondition">50 / 100</b></span>
                <div><i id="premiumConditionBar" style="width:50%"></i></div>
              </div>
              <div class="premium-price-box">
                <span>예상 시세</span>
                <b id="premiumEstimate">17,900원</b>
              </div>
              <div class="decision-title">어떻게 하시겠습니까?</div>
              <div class="decision-buttons">
                <button class="decision sell-now" onclick="premiumQuickSell()"><span>🪙</span><b>원가 판매</b><small id="premiumSellPrice">17,900원</small></button>
                <button class="decision bargain" onclick="premiumBargain()"><span>🤝</span><b>흥정하기</b><small>더 좋은 가격 제안</small></button>
                <button class="decision reject" onclick="premiumReject()"><span>✕</span><b>거절하기</b><small>거래 안 함</small></button>
              </div>
            </aside>
          </div>

          <div class="premium-bag-strip">
            <div class="strip-title">가방 속 물건</div>
            <div id="premiumBag" class="premium-bag-list"></div>
          </div>

          <div class="premium-bottom-menu">
            <button onclick="openPage('pawnshop',document.querySelector('[data-page=pawnshop]'))">🏚️<span>전당포</span></button>
            <button onclick="openPage('auction',document.querySelector('[data-page=auction]'))">🔨<span>경매장</span></button>
            <button onclick="openPage('market',document.querySelector('[data-page=market]'))">🛒<span>중고장터</span></button>
            <button onclick="openPage('inventory',document.querySelector('[data-page=inventory]'))">🎒<span>내 가방</span></button>
            <button onclick="openPhone()">📱<span>휴대폰</span></button>
            <button onclick="openPage('house',document.querySelector('[data-page=house]'))">🏠<span>내 집</span></button>
          </div>
        </div>
      </section>

      <section id="page-inventory" class="page">
        <div class="title"><div><p class="eyebrow">INVENTORY</p><h1>내 가방</h1><p>수집한 아이템을 확인합니다.</p></div><button class="btn light" onclick="loadInventory()">새로고침</button></div>
        <div id="inventory" class="card-grid"></div>
      </section>

      <section id="page-pawnshop" class="page">
        <div class="title"><div><p class="eyebrow">PAWNSHOP</p><h1>조 아저씨의 전당포</h1><p>원가로 즉시 팔거나 흥정하여 더 비싸게 판매하세요.</p></div><button class="btn light" onclick="loadPawnshop()">새로고침</button></div>
        <div class="pawn-scene">
          <div class="pawn-room">
            <div class="pawn-back-sign">OLD JOE'S</div>
            <div class="pawn-shelf pawn-left">
              <span>📻</span><span>🏺</span><span>⌚</span><span>📚</span>
            </div>
            <div class="pawn-shelf pawn-right">
              <span>🎸</span><span>📷</span><span>🧭</span><span>💎</span>
            </div>
            <div class="pawn-dealer">
              <div class="pawn-face">🧓🏻</div>
              <div class="pawn-body">🦺</div>
            </div>
            <div class="pawn-counter">
              <div>🧾</div>
              <div class="pawn-item-slot">아이템을 선택하세요</div>
              <div>💰</div>
            </div>
            <div class="pawn-dialogue">
              <span>조 아저씨</span>
              <b>“원가에 바로 넘기겠나, 아니면 내 인내심을 시험해 보겠나?”</b>
            </div>
          </div>
        </div>
        <div id="pawnshopList" class="card-grid deal-inventory"></div>
      </section>

      <section id="page-auction" class="page">
        <div class="title"><div><p class="eyebrow">RARE AUCTION</p><h1>희귀품 경매장</h1><p>NPC는 소폭 인상·대폭 인상·가격 유지를 무작위로 선택합니다. 가격 유지가 나오면 NPC 입찰은 종료됩니다.</p></div><button class="btn light" onclick="loadAuction()">새 경매</button></div>
        <div id="auctionHall"></div>
      </section>

      <section id="page-market" class="page">
        <div class="title"><div><p class="eyebrow">SECONDHAND MARKET</p><h1>중고 장터</h1><p>일반 아이템과 소장품을 유저끼리 거래하거나 NPC 제안을 흥정할 수 있습니다.</p></div><button class="btn light" onclick="loadMarketHub()">새로고침</button></div>
        <div class="market-tabs">
          <button class="active" onclick="switchMarketTab('items',this)">아이템 거래</button>
          <button onclick="switchMarketTab('offers',this)">NPC 제안</button>
          <button onclick="switchMarketTab('collectibles',this)">소장품 거래</button>
        </div>
        <div id="market-items" class="market-panel">
          <div class="sell-form panel"><select id="sellItem"><option value="">판매할 아이템</option></select><input id="sellPrice" type="number" placeholder="희망 가격"><button class="btn primary" onclick="createListing()">등록</button></div>
          <div id="marketList" class="card-grid"></div>
        </div>
        <div id="market-offers" class="market-panel hidden"><div id="npcOfferList" class="card-grid"></div></div>
        <div id="market-collectibles" class="market-panel hidden">
          <div class="sell-form panel"><select id="sellCollectible"><option value="">판매할 소장품</option></select><input id="collectiblePrice" type="number" placeholder="희망 가격"><button class="btn primary" onclick="createCollectibleListing()">등록</button></div>
          <div id="collectibleMarketList" class="card-grid"></div>
        </div>
      </section>

      <section id="page-house" class="page">
        <div class="title"><div><p class="eyebrow">MY HOME</p><h1>내 집 꾸미기</h1><p>장식을 배치하면 표시된 특수 효과가 실제 적용됩니다.</p></div><button class="btn light" onclick="loadHouse()">새로고침</button></div>
        <div class="house-layout">
          <div id="houseRoom" class="house-room"><div class="window">☀️</div><div id="placedDecorations"></div></div>
          <aside class="house-side panel"><h3>활성 효과</h3><div id="houseEffects"></div><h3>보유 장식</h3><div id="decorationInventory"></div></aside>
        </div>
      </section>

      <section id="page-collection" class="page">
        <div class="title"><div><p class="eyebrow">COLLECTION GACHA</p><h1>소장품 뽑기</h1><p>휴대폰 케이스 스킨과 집 장식을 뽑습니다.</p></div></div>
        <div class="gacha-layout">
          <div class="machine"><div class="machine-glass">✨<br>🎁</div><button class="btn gacha-btn" onclick="drawCollectible()">1회 뽑기 · 10만원</button></div>
          <div class="panel collection-panel"><h3>장착 케이스</h3><div id="equippedCase"></div><h3>내 소장품</h3><div id="collectibleInventory"></div></div>
        </div>
      </section>
    </main>
  </div>

  <div id="exploreModal" class="overlay hidden" onclick="closeByBackdrop(event,'exploreModal')"><div class="modal panel"><button class="x" onclick="closeExplore()">×</button><div id="exploreContent"></div></div></div>
  <div id="negotiationModal" class="overlay hidden" onclick="closeByBackdrop(event,'negotiationModal')">
    <div class="modal negotiation-window">
      <button class="x" onclick="closeNegotiation()">×</button>
      <div class="negotiation-room">
        <div class="negotiation-sign">OLD JOE'S PAWNSHOP</div>
        <div class="negotiator-character">
          <div class="negotiator-head">🧓🏻</div>
          <div class="negotiator-torso">🦺</div>
        </div>
        <div class="negotiation-counter">
          <div class="negotiation-item">📦</div>
        </div>
        <div class="negotiation-name">조 아저씨</div>
        <div id="negotiationContent"></div>
      </div>
    </div>
  </div>

  <div id="phoneOverlay" class="phone-overlay hidden" onclick="phoneBackdrop(event)">
    <div class="phone-shell">
      <div class="phone-notch"></div><div class="phone-status"><span id="phoneTime"></span><span>판매폰 5G 🔋</span></div>
      <section id="phoneHome" class="phone-screen phone-home"><h2 id="phoneOwner">판매왕</h2><div class="apps">
        <button onclick="openPhoneApp('stocks')"><span class="app app-stock">📈</span>판매증권</button>
        <button onclick="openPageFromPhone('market')"><span class="app app-market">🛒</span>중고장터</button>
        <button onclick="openPageFromPhone('collection')"><span class="app app-gacha">🎁</span>소장품</button>
        <button onclick="openPhoneApp('wallet')"><span class="app app-wallet">💳</span>내 자산</button>
      </div></section>
      <section id="phone-stocks" class="phone-screen phone-app hidden">
        <div class="app-head"><button onclick="phoneHome()">‹</button><div><b>판매증권</b><small>종목을 눌러 상세 확인</small></div><button onclick="refreshStocks()">↻</button></div>
        <div id="stockListView"><div class="summary"><div><span>평가액</span><b id="stockValue">0원</b></div><div><span>평가손익</span><b id="stockProfit">0원</b></div></div><div id="stockList"></div></div>
        <div id="stockDetailView" class="hidden"><button class="back" onclick="closeStockDetail()">← 목록</button><div id="stockDetail"></div></div>
      </section>
      <section id="phone-wallet" class="phone-screen phone-app hidden"><div class="app-head"><button onclick="phoneHome()">‹</button><div><b>내 자산</b><small>계정 저장 정보</small></div><span></span></div><div id="walletView"></div></section>
      <button class="home-dot" onclick="phoneHome()">●</button><button class="phone-close" onclick="closePhone()">휴대폰 넣기</button>
    </div>
  </div>
</section>

<script src="game.js"></script>
</body>
</html>
