# Architecture

## Client

`public/index.html` + `public/styles.css` + `public/app.js`

- SPA처럼 화면을 교체하는 가벼운 브라우저 클라이언트
- Canvas 절차형 픽셀 그래픽
- REST로 플레이어 행동 전송
- EventSource(SSE)로 방 상태 실시간 수신
- WebAudio로 파일 없는 효과음 생성

## Server

`server.js`

- Node.js 기본 `http` 모듈만 사용
- 방/경로/전투/가챠/보상/포획을 서버가 판정
- 클라이언트가 데미지나 보상 결과를 직접 제출할 수 없는 구조
- 12시간 동안 비활성 런타임 방 유지
- Render의 `PORT` 환경변수 자동 사용

## Game loop

HOME → STARTER DECK → JOURNEY or DUNGEON → ROUTE → BATTLE/EVENT/REST/SHOP → REWARD → NEXT FLOOR

Dungeon: Floor 1 → ... → Boss 10 → ... → Boss 20 → ... → Final Boss 30 → CLEAR

Journey: 제한 없이 바이옴을 순환하며 카드 흔적 포획과 컬렉션 확장

## Realtime

`GET /api/room/:roomId/stream?profileId=...`

서버가 `room-update` 이벤트로 최신 authoritative room snapshot을 모든 참가자에게 보냅니다. 입력은 REST POST로 받기 때문에 메시지 순서를 서버에서 처리하기 쉽고, WebSocket 라이브러리 의존성 없이 Render에서 바로 실행됩니다.
