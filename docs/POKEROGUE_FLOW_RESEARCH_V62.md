# PokéRogue flow research used for FUSEWILD v6.2.1

FUSEWILD는 PokéRogue의 소스/그래픽/사운드를 복사하지 않고, 공개된 UI 구조와 플레이 리듬만 참고해 독자적으로 구현합니다.

확인한 핵심:
- 공식 신규 플레이어 가이드: 대부분의 전투 뒤 상점이 먼저 열리고, 구매 후 무료 보상 하나를 고른 뒤 다음 웨이브로 진행.
  - https://wiki.pokerogue.net/guides:new_player_guide
  - https://wiki.pokerogue.net/ko:guides:new_player_guide
- 공식 설정 문서: 게임 속도, HP 바 속도, UI/상점 오버레이 등 읽기/연출 속도를 사용자가 조절할 수 있도록 설계.
  - https://wiki.pokerogue.net/gameplay:settings
- 공개 GitHub 저장소: 화면을 고정 좌표계/게임 캔버스 중심으로 구성하고 메시지/선택 UI를 별도 핸들러로 순서화하는 구조를 확인.
  - https://github.com/pagefaultgames/pokerogue

v6.2.1에서는 이 관찰을 FUSEWILD의 전투 이벤트 큐, 하단 메시지창, 전투 후 하단 보상 덱, 큰 타입 스케일에 반영했습니다.
