# RIFT DECK v3.1.0 — VISUAL FIRST COMBAT

이번 버전은 텍스트를 읽는 게임처럼 보이던 문제를 줄이고, **픽셀 그래픽·캐릭터 움직임·카드 애니메이션·속성별 공격 이펙트가 먼저 보이는 전투**로 개편한 버전입니다.

핵심: 12속성 시그니처 VFX, 공격/회복/방어/소환 모션 분리, 한 화면 전투, 그래픽 중심 경로/보상/이벤트, 전투 카드 텍스트 최소화. 상세 설명은 카드 상세보기와 RUN/LOG 보조 UI에 남겨두었습니다.

# RIFT DECK v3.0.0 — FUN LOOP OVERHAUL

RIFT DECK는 Node 동적 서버 기반의 1~4인 협동 카드 로그라이트입니다. v3.0은 화면에 시스템을 계속 쌓기보다, `전투 → 성장 → 3개 보상 → 다음 전투`의 반복 자체가 재미있도록 핵심 루프를 다시 조정한 버전입니다.

## v3.0 핵심
- 경로 선택은 일반 층에서 2개로 단순화
- 층 보상은 기본 3개만 제시
- 현재 덱과 맞는 카드는 SYNERGY로 표시되고 실제 등장 가중치도 올라감
- 같은 카드를 반복 사용하면 CARD MASTERY가 쌓여 3회에 +, 8회에 ++로 자동 성장
- 전투마다 하나의 ENCOUNTER MODIFIER가 등장해 전투 규칙과 운영이 조금씩 달라짐
- STARTER CORE 1개 선택 후 곧바로 원정 진행
- 기존 카드 강화, 유물, RIFT BREAK, 보스 2페이즈, 50층 협동, 여행 포획은 유지

## Render
Build Command: `npm ci && npm run build`

Start Command: `npm start`

Health Check: `/healthz`

정상 배포 확인:
- version: `3.0.0`
- deployId: `RIFT-V3.0.0-FUN-LOOP-20260910`

Supabase SQL 구조 변경은 없습니다. 기존 로그인/저장이 정상이라면 SQL을 다시 실행할 필요가 없습니다.
