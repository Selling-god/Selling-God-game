# FUSEWILD v6.3 - PokeRogue 전투 흐름 참고 정리

FUSEWILD는 PokeRogue의 코드/그래픽/사운드를 복사하지 않고, 공개 문서와 공개 소스에서 확인할 수 있는 **전투 순서와 정보 제시 방식**을 참고해 자체 코드로 재구현합니다.

참고한 공개 자료:
- PokeRogue Wiki New Player Guide: https://wiki.pokerogue.net/guides:new_player_guide
- PokeRogue command UI handler: https://github.com/pagefaultgames/pokerogue/blob/beta/src/ui/handlers/command-ui-handler.ts
- PokeRogue mystery encounter phases: https://github.com/pagefaultgames/pokerogue/blob/beta/src/phases/mystery-encounter-phases.ts

v6.3에 반영한 순서:
1. 실제 적이 배치된 뒤 조우 문구 표시
2. "무엇을 할까?" 명령 선택
3. 기술명 표시
4. 기술 이펙트
5. HP 바/숫자 변화
6. 데미지/급소/상성/상태 메시지
7. HP 0이면 기절 메시지와 기절 시각 상태
8. 플레이어 몬스터가 기절하면 자동 교체하지 않고 대기 몬스터 선택 화면
9. 선택한 몬스터를 출전시킨 뒤 다음 명령 단계
10. 승리 뒤 상점(선택) -> 무료 보상 1개 -> 다음 웨이브

이 순서를 서버의 battle phase와 클라이언트 narration timeline 양쪽에 반영해 설명문과 실제 화면 상태가 앞뒤로 어긋나는 문제를 줄였습니다.
