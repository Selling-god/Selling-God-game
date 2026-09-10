# RIFT DECK v2.6.0 — Combat & Presentation Overhaul

RIFT DECK는 Node 동적 서버 기반의 1~4인 협동 카드 로그라이트입니다. 50층 던전, 일반 여행, 카드 수집, 복각 소환, Supabase 로그인/클라우드 저장을 기반으로 하며 v2.6에서는 **전투 화면/모션/던전 진행 연출과 전술 선택**을 크게 개선했습니다.

## v2.6 핵심

- 전투 화면을 16:9 기준 한 화면 중심으로 재배치
- 적 뒤 흰 사각형 제거: 적을 도트 스프라이트 + HUD로 표현
- 카드가 중앙으로 올라온 뒤 대상에게 날아가는 사용 애니메이션
- 속성 발사체, 적 돌진, 유닛 자동공격 돌진, 피격/사망/보스 idle 애니메이션
- 경로/전투/보상/사건 사이 픽셀 커튼 장면 전환
- 전투 로그는 LOG 드로어로 접어 화면 난잡함 감소
- **RIFT BREAK**: 피해 누적으로 적 자세 게이지를 붕괴시키면 취약 + 다음 행동 1회 봉쇄
- 1층 서약 화면과 일반 경로 화면을 분리해 한 번에 한 선택만 강조
- 층/바이옴/골드/파편/유물/심연 압력을 간결한 HUD로 통합
- 게스트에서 로그인 시 **기존 클라우드 기록 사용 / 현재 게스트 기록으로 교체**를 명시적으로 선택
- 중복 SSE 렌더 방지와 저사양 장치 파티클 자동 감소

## 기존 로그라이트 시스템

- 카드 315종 / 유물 22종 / 런 아이템 48종
- 원정 서약
- 필요 없는 보상 분해 + 균열 파편 재굴림
- 카드 + / ++ 강화
- 야영지 휴식 / 카드 제련 / 명상
- 덱 정제
- 심연 압력
- TACTICAL CHAIN / OVERDRIVE
- 보스 PHASE II
- 정예/보물/보스 유물 드래프트
- 1~4인 협동 + 서버 authoritative 판정 + SSE 동기화
- Supabase Auth / 클라우드 프로필 / 진행 중 방 snapshot 복구

## 실행

```bash
npm ci
npm run build
npm start
```

Render Web Service:

```text
Build Command: npm ci && npm run build
Start Command: npm start
Health Check: /healthz
```

전체 검증:

```bash
npm test
```

정상 배포 확인:

```text
version: 2.6.0
deployId: RIFT-V2.6.0-COMBAT-POLISH-20260910
```

상세 변경점은 `RELEASE_NOTES_v2_6.md`를 참고하세요.
