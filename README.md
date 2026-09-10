# RIFT DECK v2.7.0 — One-Screen Game Flow

RIFT DECK는 Node 동적 서버 기반의 1~4인 협동 카드 로그라이트입니다. 50층 던전, 일반 여행, 카드 수집/복각 소환, Supabase 로그인/클라우드 저장, 카드 강화, 유물, 원정 서약, 심연 압력, RIFT BREAK, TACTICAL CHAIN을 유지하면서 v2.7에서 플레이 화면을 크게 단순화했습니다.

## v2.7 핵심
- 데스크톱 원정/전투/보상/이벤트는 스크롤 없이 한 화면 중심으로 진행합니다.
- 한 순간에 한 가지 결정만 보여줍니다.
- 경로 선택: 층/HP/골드/파편/유물만 남기고 서약 또는 3개 경로만 중앙 표시.
- 전투: 플레이어/유닛은 왼쪽, 적은 오른쪽, 손패는 하단. 기본 화면에서는 HP/에너지/적 의도/손패/턴 종료에 집중.
- 보상: 야영 → 유물 → 카드/아이템 보상 → 포획 또는 상점 → 다음 층 순서로 단계별 표시.
- 상세 런 정보는 RUN 버튼, 전투 로그는 LOG 버튼, 덱 정제/카드 제련은 팝업으로 숨겨 화면을 단순하게 유지합니다.
- 긴 장면 전환을 짧은 픽셀 스와이프로 교체했습니다.

## 유지되는 주요 시스템
- 카드 315종
- 유물 22종
- 50층 던전 / 보통·어려움·지옥
- 1~4인 협동
- 일반 여행 카드 봉인
- 복각 소환
- Supabase Auth + 클라우드 저장
- 카드 + / ++ 강화
- 보상 분해 / 재굴림 / 균열 파편
- 원정 서약
- 심연 압력
- 보스 PHASE II
- RIFT BREAK
- TACTICAL CHAIN / OVERDRIVE

## Render
Build Command:
`npm ci && npm run build`

Start Command:
`npm start`

Health Check:
`/healthz`

정상 배포 확인:
- version: `2.7.0`
- deployId: `RIFT-V2.7.0-ONE-SCREEN-20260910`

Supabase SQL 구조 변경은 없습니다. v2.6에서 정상 로그인/저장이 되었다면 그대로 사용하면 됩니다.
