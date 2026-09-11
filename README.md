# RIFT DECK v4.1.0 — ACTIVE MONSTER BATTLE

RIFT DECK는 포획한 몬스터를 편성하고, 몬스터 고유 기술을 주 행동으로 사용하면서 플레이어의 스펠 카드로 전황을 보조하는 오리지널 픽셀 로그라이트입니다.

## 핵심 루프
`일반 여행 → 야생 몬스터 봉인 → 영구 해금 → 10P 파티 편성 → 여행/50층 던전 → 몬스터 기술 전투 → 기술 습득/교체 → 진화·융합·공명진화·균열개화`

## v4.1 전투
- 신규 계정 스타터: 3종
- 파티: 최대 6마리 / 10P
- 일반 전투: 활성 몬스터 1마리
- 더블 전투: 활성 몬스터 2마리
- 몬스터별 기술 슬롯 4개
- 레벨 조건 기술 개방
- 전투 후 SKILL DISC로 새 기술 습득/교체
- 플레이어 스펠 카드: 턴당 최대 2장 보조 전술
- 몬스터 교대, 속성 상성, BREAK, 방어막, 진화 4계통 유지
- 몬스터 205종 / 아이템 120종 / 스펠 카드 315종 / 50층

## 배포
- Build: `npm ci && npm run build`
- Start: `npm start`
- Health: `/healthz`
- version: `4.1.0`
- deployId: `RIFT-V4.1.0-ACTIVE-MONSTER-BATTLE-20260911`

Supabase 로그인은 기존 설정을 그대로 사용합니다. 추가 SQL은 필요하지 않습니다.

세부 변경: `RELEASE_NOTES_v4_1.md`
패치 적용: `PATCH_APPLY_V41.txt`
