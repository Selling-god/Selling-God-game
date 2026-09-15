# RIFT DECK V5.1 QA REPORT

## 결과
- `npm run check`: PASS
- `npm test`: PASS
- 빌드: `BUILD_OK v5.1.0 deploy=RIFT-V51-COMBAT-UX-20260915`
- 50층 전체 진행 테스트: PASS
- 4인 멀티플레이: PASS
- 로그인/클라우드 룸: PASS
- 전투/보상/진화/균열/프리미엄 루프: PASS

## V5.1 전용 회귀 테스트
`V51_COMBAT_UX_OK double=true firstThenSecond=true skipBlocked=true turn=2 transitions<=2600ms`

검증 내용:
1. 8층 더블전투에서 출전 몬스터 2마리가 실제로 활성화됨.
2. 첫 몬스터 행동 전 턴 종료 요청이 서버에서 차단됨.
3. 첫 몬스터 행동 뒤 두 번째 몬스터가 `미행동` 상태로 남음.
4. 두 번째 몬스터 행동 전 턴 종료 요청도 차단됨.
5. 두 번째 몬스터까지 행동한 뒤에만 적 턴이 진행됨.
6. 클라이언트는 첫 행동 직후 다음 미행동 몬스터를 자동 선택하고 기술 메뉴를 유지함.

## 전투 후 진행 정지 회귀 테스트
`EXPEDITION_HUNT_OK ... postBattleGate=false`

- 야생 몬스터 봉인을 전투 중에 수행.
- 승리 뒤 구형 `room.capture` 진행 게이트가 생성되지 않음.
- V50 저장에 남아 있던 구형 capture 상태도 다음 진행 시 자동 정리.

## 몬스터 이미지 검사
- 전체 런타임 PNG: 820장
- 512×512: 800장
- 768×768: 20장 (보스 계열)
- 읽기 실패: 0
- 이미지 파일 해시 중복: 0 / 820

## UI/모바일
- 시작 원정 특성 화면을 단독 선택 화면으로 분리.
- 전투 루트 화면과 시작 선택 UI의 중첩 제거.
- 모바일 전투 명령 패널에서 보조 사이드 HUD를 숨기고 4개 주요 명령을 전체 폭으로 확대.
- 전투장과 명령 패널의 grid row를 분리하여 스프라이트가 하단 UI에 덮이지 않도록 함.
- 전환 애니메이션 최대 대기시간을 2.6초로 제한.

## Render
게임 본체는 Node Web Service가 필요합니다. `out/index.html`은 Static Site 오배포 확인용 진단 페이지이며 게임 본체가 아닙니다.
