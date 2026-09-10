# RIFT DECK v2 Architecture

## Client

`public/index.html` + `public/styles.css` + `public/app.js`

- 단일 페이지 게임 UI
- REST API로 플레이어 입력 전송
- EventSource(SSE)로 방 상태 실시간 수신
- 서버 snapshot을 기준으로 화면 재렌더
- 카드 315장/적 55종/바이옴 5종의 오리지널 PNG를 정적 자산으로 사용
- WebAudio 기반 전투/보상 효과음
- 데스크톱/태블릿/모바일 반응형 레이아웃

## Server

`server.js`

- Node.js 기본 `http` 기반 동적 서버
- 정적 파일 제공 + API + 방/런 상태 + 전투 엔진
- 클라이언트는 행동 의도만 제출하고 피해, 보상, 포획, 적 행동은 서버가 계산
- 1~4인 방과 SSE 구독자 브로드캐스트
- Render의 `PORT` 환경변수 자동 사용
- 던전 최대 층: 50
- 난이도: normal / hard / hell

## Game loop

HOME → DECK → JOURNEY 또는 DUNGEON → ROUTE → FLOOR CONTENT → PERSONAL REWARD → NEXT FLOOR

### Dungeon

Floor 1 → ... → Boss 10 → ... → Boss 20 → ... → Boss 30 → ... → Boss 40 → ... → Final Boss 50 → FINAL REWARD → CLEAR

각 층 콘텐츠가 끝날 때 플레이어별 무료 보상 draft를 생성합니다. 카드와 아이템 후보가 섞이며 각 플레이어가 독립적으로 1개를 고릅니다. 모든 참가자가 보상을 고르고 진행 확인을 하면 다음 층으로 이동합니다.

### Journey

층 제한 없이 바이옴을 순환하며 전투/사건/보상/카드 흔적 봉인을 반복합니다. 희귀 카드일수록 출현 및 봉인 확률이 낮습니다.

## Difficulty scaling

`data/catalog.json`의 `difficulties` 정의를 서버가 읽어 적 체력, 적 공격, 보상 가중치, 재화 보너스를 적용합니다. 난이도는 방 생성 시 결정되고 런 전체에서 유지됩니다.

## Reward system

`createFloorReward()`가 플레이어별 reward option을 만듭니다.

- 기본 5개 후보
- 카드 + 아이템 혼합
- 상위 등급 가중치는 층/전투 tier/난이도/런 아이템에 따라 변경
- 런 골드를 사용한 최대 5회 재굴림
- 카드: 영구 컬렉션 + 현재 런 덱
- 아이템: 현재 런 modifier stack

## Realtime

`GET /api/room/:roomId/stream?profileId=...`

서버는 `room-update` 이벤트로 authoritative room snapshot을 참가자에게 전파합니다. 실제 입력은 REST POST로 받아 서버에서 순서를 처리합니다.

## Persistence

현재 `data/profiles.json`은 로컬 개발용 프로필 어댑터입니다. Render 재배포/재시작까지 포함한 영구 저장에는 Supabase/Postgres 연동이 필요합니다. 런타임 방은 메모리 상태이므로 서버 프로세스 재시작 시 사라집니다.
