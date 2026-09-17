# 보관된 레거시 테스트

여기 있는 테스트들은 **삭제된 게 아니라 은퇴**했습니다. 전부 같은 이유입니다:
자기 릴리스 시점의 **소스 문자열이 그대로 남아 있는지**를 검사하는데,
그 문자열들이 이후 버전에서 정당하게 제거되거나 이름이 바뀌었습니다.

| 테스트 | 찾고 있던 것 | 사라진 이유 |
|---|---|---|
| combat-test | 카드 사용 API (`/play`) | v5.6에서 몬스터 중심 전투로 전환하며 제거 |
| v54-signature-pacing-test | 카드 사용 API | 동일 |
| v34-expedition-party-test | `UNIT_DECK_MAX` | v4 유닛 덱 시스템 제거 |
| v41-active-monster-test | tactic 제한 | v4 전술 시스템 제거 |
| v57-battle-phase-fx-test | `reward-dialog-v57` | v6 보상 화면 재작업에서 클래스 제거 |
| v58-classic-flow-fusion-test | `fusionSpriteUrlV58` | 함수 개명 |
| v59-fusion-layout-perf-test | `const VERSION = '5.9.0'` | 버전 상승 |
| v60-cadence-brand-test | `AREA TRANSITION` | UI 문구 제거 |
| v61-ui-cadence-test | HTML 내 `v6.1.0` | 버전 상승 |

**교훈:** 테스트에 버전 문자열이나 CSS 클래스명을 하드코딩하지 마세요.
동작을 검사해야 다음 릴리스에서도 살아남습니다.
현재 살아 있는 테스트들은 `scripts/`에 있고 `npm test`로 전부 돌아갑니다.
