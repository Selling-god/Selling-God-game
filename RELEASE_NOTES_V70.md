# FUSEWILD v7.0.0 — Battle Core Rebuild

이번 버전은 기능을 더 얹는 패치가 아니라, 전투 핵심 흐름을 다시 고정하는 버전입니다.

## 핵심 변경
- **기절 후 자동 출전 제거**: 대기열 첫 몬스터가 자동으로 나오는 코드를 제거했습니다.
- **Replacement Phase 도입**: 적 턴과 상태 처리가 끝난 뒤 `replacement` 단계가 열리고, 플레이어가 직접 다음 몬스터를 고릅니다.
- **전투 이벤트 순서 고정**: 기술 선언 → 이펙트 → HP 변화 → 결과/상성/상태 → 기절 → 교체 프롬프트 → 다음 턴 순서를 클라이언트 이벤트 큐에서 직렬화합니다.
- **전투 화면 재레이아웃**: 기존 v5/v6에서 누적된 화면 규칙 위에 독립적인 `battle-v70` 레이어를 만들어 전장/메시지/명령 영역이 서로 침범하지 않도록 했습니다.
- **모바일 전용 전투 레이아웃**: PC 화면을 축소하는 방식 대신 900px/480px 브레이크포인트에서 전장과 명령창 비율을 재구성했습니다.
- **긴 몬스터/융합 이름 보호**: status panel, command tile, replacement selector의 `min-width:0`, ellipsis, overflow 규칙을 통일했습니다.
- **전투 종료 화면 정리**: v6.4의 compact shop/reward 흐름을 유지하면서 v7에서 높이와 정보 밀도를 다시 제한했습니다.

## PokéRogue에서 참고한 구조적 원칙
공개된 PokéRogue 소스/문서에서 battle phase queue, switch phase, message UI, post-battle shop/reward cadence를 참고했습니다. 그래픽/코드를 복사하지 않고 FUSEWILD의 규칙으로 재구현했습니다.
- https://github.com/pagefaultgames/pokerogue
- https://wiki.pokerogue.net/guides:new_player_guide

## QA
- `npm run check` 통과
- `npm run build` 통과
- `scripts/v70-core-test.js` 정적/런타임 통과
  - replacement phase 진입
  - 플레이어가 대기 몬스터 직접 선택
  - 교체 후 battle command phase 복귀
- `scripts/shop-cadence-test.js` 통과
- `scripts/v63-trainer-heal-test.js` 통과

구버전 테스트 일부는 버전 문자열 자체를 6.x로 고정해 두었기 때문에 v7 전체 테스트 묶음에서는 버전 검증만으로 실패할 수 있습니다. v7용 테스트를 별도로 추가했습니다.
