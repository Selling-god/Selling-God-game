# RIFT DECK v3.3.0 — GAME FEEL

v3.2의 탐험→봉인→영구 카드→던전 구조를 유지하면서 몬스터 외형, 카드 능력 가독성, 방어막, 공격/피격 연출을 상용 게임에 가까운 체감으로 다듬은 버전입니다.

자세한 변경점은 `RELEASE_NOTES_v3_3.md`를 참고하세요.


RIFT DECK는 Node 동적 서버 기반의 1~4인 협동 카드 로그라이트입니다.
현재 핵심 방향은 **PokeRogue류의 탐험/수집 성장감 + 카드 로그라이트 전투**이며, 텍스트보다 픽셀 그래픽과 선택/전투가 앞에 나오도록 구성합니다.

## v3.2 핵심 플레이 루프

`CARD HUNT 여행 → 야생 카드 봉인 → 영구 컬렉션 → 덱 편성 → 50층 던전`

일반 여행에서 전투를 이기면 카드 흔적을 발견합니다. 봉인에 성공한 카드는 계정에 영구 해금되어 보관함과 던전 시작 덱에 사용할 수 있습니다. 던전에서 나오는 카드 보상은 현재 RUN 성장용이며, 영구 보유 카드는 여행/복각 소환을 통해 넓히는 구조입니다.

## 콘텐츠

- 카드 315종
- 아이템 96종 + 픽셀 아이콘
- 적/보스 55종
- 5개 바이옴 / 25개 장면 배경
- 50층 던전
- 1~4인 협동
- Supabase 로그인/클라우드 저장
- CARD HUNT 봉인
- 복각 아카이브 소환
- 카드 강화/숙련도/COMBO/RIFT BREAK/보스 PHASE II

## Render

Build Command: `npm ci && npm run build`

Start Command: `npm start`

Health Check: `/healthz`

정상 배포 확인:
- version: `3.2.0`
- deployId: `RIFT-V3.2.0-EXPEDITION-HUNT-20260911`

Supabase SQL 구조 변경은 없습니다.
