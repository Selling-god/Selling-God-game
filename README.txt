<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>판매의 신 v13</title>
  <link rel="stylesheet" href="style.css">
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
</head>
<body>
<div id="toast" class="toast"></div>

<section id="auth" class="screen auth-screen">
  <div class="auth-card panel">
    <div class="logo">👑</div>
    <p class="eyebrow">SELLING TYCOON ONLINE</p>
    <h1>판매의 신</h1>
    <p class="muted">로그인한 계정에 전당포·경매·중고장터·휴대폰 자산 정보가 저장됩니다.</p>
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
        <div class="simple-hub panel">
          <div class="hub-copy">
            <p class="eyebrow">SELLING TYCOON</p>
            <h1><span id="nicknameHero">판매왕</span>의 상점</h1>
            <p>오늘도 좋은 물건을 사고, 흥정하고, 더 높은 가격에 판매해 보세요.</p>
            <div class="hub-actions">
              <button class="hub-primary" onclick="openPage('pawnshop',document.querySelector('[data-page=pawnshop]'))">🏚️ 전당포 열기</button>
              <button onclick="openPage('auction',document.querySelector('[data-page=auction]'))">🔨 경매장</button>
              <button onclick="openPage('market',document.querySelector('[data-page=market]'))">🛒 중고장터</button>
              <button onclick="openPhone()">📱 휴대폰</button>
            </div>
          </div>
          <div class="hub-art">
            <div class="hub-shop-sign">SELLING GOD</div>
            <div class="hub-counter">💰</div>
            <div class="hub-tip">전당포에서 가방 속 물건을 선택한 뒤 원가 판매 또는 흥정을 진행하세요.</div>
          </div>
        </div>
      </section>

      <section id="page-inventory" class="page">
        <div class="title"><div><p class="eyebrow">INVENTORY</p><h1>내 가방</h1><p>수집한 아이템을 확인합니다.</p></div><button class="btn light" onclick="loadInventory()">새로고침</button></div>
        <div id="inventory" class="card-grid"></div>
      </section>

      <section id="page-pawnshop" class="page">
        <div class="pawn-game-shell">
          <div class="pawn-topbar">
            <div><p class="eyebrow">PAWNSHOP</p><h1>조 아저씨의 전당포</h1></div>
            <button class="btn light" onclick="loadPawnshop()">새로고침</button>
          </div>

          <div class="pawn-game-main">
            <section class="pawn-character-panel">
              <div class="pawn-character-bg"></div>
              <img class="pawn-character-img" src="assets/shop_npc.jpg" alt="전당포 주인 조 아저씨">
              <div class="pawn-character-dialogue">
                <span>조 아저씨</span>
                <b id="pawnDialogue">“팔 물건을 골라 보게. 괜찮은 물건이라면 제값은 쳐 주지.”</b>
              </div>
            </section>

            <section class="pawn-deal-panel">
              <div class="pawn-selected-card">
                <div id="pawnSelectedVisual" class="pawn-selected-visual"><div class="empty-item">?</div></div>
                <div class="pawn-selected-info">
                  <span id="pawnSelectedCategory" class="pawn-rarity">물건을 선택하세요</span>
                  <h2 id="pawnSelectedName">가방 속 물건 없음</h2>
                  <div class="pawn-stat"><span>상태</span><b id="pawnSelectedCondition">-</b></div>
                  <div class="pawn-condition"><i id="pawnSelectedBar" style="width:0%"></i></div>
                  <div class="pawn-price-box"><span>예상 매입가</span><b id="pawnSelectedPrice">0원</b></div>
                </div>
              </div>
              <div class="pawn-deal-actions">
                <button id="pawnInstantBtn" class="pawn-action sell" onclick="sellSelectedPawn()" disabled><b>원가 판매</b><small>안전하게 즉시 판매</small></button>
                <button id="pawnNegotiateBtn" class="pawn-action negotiate" onclick="negotiateSelectedPawn()" disabled><b>흥정하기</b><small>더 높은 가격에 도전</small></button>
              </div>
            </section>
          </div>

          <section class="pawn-bag-section">
            <div class="pawn-bag-head"><div><b>가방 속 물건</b><small>판매할 물건을 하나 선택하세요</small></div><span id="pawnItemCount">0개</span></div>
            <div id="pawnshopList" class="pawn-item-strip"></div>
          </section>
        </div>
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
