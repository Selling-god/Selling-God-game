# KX CORPORATE V11.0 QA Report

검사일: 2026-09-10

## Automated release pipeline
`npm run release` 최종 PASS.

- build / deploy-root synchronization: PASS
- JavaScript syntax: PASS
- Steam smoke: PASS
- game-logic invariants: PASS
- 17-workspace render matrix: PASS
- startup contract: PASS
- route integrity: PASS
- commercial quality audit: PASS

## Visual fixture pass
상용 UI의 대표 고밀도 화면을 1440px과 390px 뷰포트로 실제 브라우저 렌더링하여 확인했습니다.

- CEO dashboard: 1440 / 390, horizontal overflow 0
- M&A / control: 1440 / 390, horizontal overflow 0
- finance / management accounting: 1440 / 390, horizontal overflow 0

시각 QA 중 발견하여 수정한 항목:
- CEO 홈 영업이익과 재무 화면 영업이익 불일치
- `operating_expenses`/`net_profit` 별칭 누락
- 부분 데이터인데 완전한 `BALANCE SHEET`처럼 보이던 표현
- 매출채권/매입채무 잔액을 현금흐름 항목처럼 표시하던 의미 오류
- 모바일 회사가치 `억 원` 줄바꿈
- 모바일 사업운영 하위 메뉴가 가로 스와이프에 숨던 문제
- 회계기간 현금흐름 미확정치를 0으로 오해할 수 있는 표시
- 제품 확장 데이터가 늦을 때 기존 회사를 `시장 진입`으로 오분류할 수 있는 조건

## Production checks still required
이 보고서는 실제 production Supabase의 다중 사용자 경쟁 상태를 검증한 보고서가 아닙니다. 아래는 정식 유료 출시 전 실환경 테스트가 필요합니다.
- 거래/M&A 도중 네트워크 끊김
- 두 사용자 동시 지분 거래
- 장시간 플레이 후 재로그인
- 실제 Render cold start
- Windows Steam 빌드/Steamworks/Cloud
- 외부 사용자 10~30명 무설명 플레이테스트
