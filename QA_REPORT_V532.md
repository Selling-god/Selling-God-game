# RIFT DECK V53.2 QA REPORT

## 빌드
- version: 5.3.2
- deployId: RIFT-V532-BATTLEFLOW-RESUME-FX-20260915
- npm run build: PASS
- npm test 전체 회귀 테스트: PASS

## 이번 수정 전용 검사
- 전투 종료 -> reward 전환: PASS
- 전투 화면 고착 방지 1.8초 fallback: PASS
- 보상 처리 -> 다음 층 route 진입: PASS
- POST /api/rooms/resume 활성 원정 복구: PASS
- profile.activeRoomId 유지/복구: PASS
- 몬스터 speciesId + moveId 기반 signature FX: PASS
- V53.1 runMod 회귀 테스트: PASS

## 기존 기능 회귀 검사
- 50층 완주: PASS
- 4인 멀티: PASS
- 일반/더블 전투: PASS
- 봉인/포획: PASS
- 진화/균열/변형폼 615종: PASS
- 장착 아이템: PASS
- 로그인/클라우드 룸: PASS
- V52 Classic Battle UI: PASS

## 배포 확인
Render 배포 후 `/healthz`에서 아래 값을 확인하세요.
- version: 5.3.2
- deployId: RIFT-V532-BATTLEFLOW-RESUME-FX-20260915

Supabase가 연결된 배포 환경에서는 활성 방 스냅샷과 profile.activeRoomId를 이용해 서버 재시작/다른 기기에서도 이어하기를 복구합니다. Supabase가 비활성인 로컬 실행에서는 실행 중인 서버 메모리/로컬 저장 범위 내에서만 복구됩니다.
