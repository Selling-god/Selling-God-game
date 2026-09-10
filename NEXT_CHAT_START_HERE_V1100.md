# NEXT CHAT START HERE - KX CORPORATE V11.0

이 ZIP은 KX CORPORATE의 최신 Steam Retail Candidate 소스다.

먼저 `README.md`, `SOURCE_OF_TRUTH_V1100.md`, `RELEASE_NOTES_V1100.md`, `STEAM_RELEASE_GATE_V1100.md`를 읽고 전체 소스를 확인한다.

개발 원칙:
- 극현실 회사 경영 시뮬레이션의 무게감을 유지한다.
- 기존 정상 기능을 임의 삭제하거나 단순화하지 않는다.
- 기능 추가보다 플레이 흐름·정보 정확성·상호작용 안정성을 우선한다.
- 현금/지분/직원/M&A 등 경제 결과는 서버 확정값만 인정한다.
- 로딩 고정, 저장 초기화, 돈 복제, 지분 불일치, 버튼 무반응은 출시 차단급 오류다.
- UI가 작동하더라도 숫자 의미가 모순되면 게임적 오류로 취급한다.
- PC/태블릿/모바일에서 겹침, 잘림, 숨은 필수 가로 스와이프를 만들지 않는다.
- 긴 설명은 화면에 남발하지 않고 필요한 판단 근거만 짧게 제시한다.
- BOT은 서로 다른 전략을 갖고 플레이어 행동에 대응하는 방향으로 확장한다.
- 목표는 계속 상향되며 고정 엔딩은 없다.
- 수정 후 반드시 `npm run release`를 통과시킨다.
- 패치 제공 시 변경 파일만 묶고, 큰 버전에서는 전체 소스 ZIP도 함께 갱신한다.

V11 핵심 변경:
- 시작 네트워크 흐름 병렬화/timeout/watchdog
- 시작 중 뉴스 팝업 억제
- stale response 방지
- CEO 홈 돈의 흐름/세부 의사결정 딥링크
- 관리회계 일관성 및 거짓 Balance Sheet 제거
- 외부지분 vs 적대적 인수 위험 분리
- 모바일 운영 메뉴 전체 노출
- 17-workspace render QA + startup/route/logic/quality Gate

다음 우선순위는 실제 staging 환경에서 다중 사용자/재접속/네트워크 차단/장기 플레이 테스트 결과를 받아 차단급 문제부터 수정하는 것이다.
