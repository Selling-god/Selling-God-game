# FUSEWILD v6.0 — PokéRogue 진행 흐름 참고 메모

이번 수정은 PokéRogue의 소스 코드나 그래픽을 가져오는 방식이 아니라, 공개된 플레이 흐름을 참고해 FUSEWILD의 오리지널 시스템에 맞게 다시 구현했습니다.

## 확인한 공개 자료
- Official PokéRogue Wiki — New Player Guide  
  https://wiki.pokerogue.net/guides%3Anew_player_guide
- Official PokéRogue Wiki — Classic Mode  
  https://wiki.pokerogue.net/gameplay%3Amodes%3Aclassic
- `NEW END SCENE ft. Giga Kyogre - Classic Mode PokeRogue Gameplay` — no-commentary gameplay  
  https://www.youtube.com/watch?v=jNjSOtZtmKg
- `THE HARDEST DAILY RUN! *Full run*` — full-run gameplay  
  https://www.youtube.com/watch?v=TfuXcy3UwzY
- PokéRogue Daily Run full-run playlist examples  
  https://www.youtube.com/playlist?list=PLAK0PPNXZQJp-NKGVvPr4FrmvJjpxvXyS

## 코드에 반영한 핵심 구조
1. 웨이브 단위 전투
2. 적이 화면에 나온 뒤 실제 적을 기준으로 조우 텍스트 표시
3. 전투 종료 후 상점/회복/정비를 먼저 확인
4. 무작위 무료 보상 하나를 선택
5. 보상 확정 후 다음 웨이브로 자연스럽게 전환
6. 10웨이브 단위 보스/바이옴 리듬 유지
7. 전투 명령은 기술 / 파티 / 포획 중심의 명확한 계층으로 유지
8. FUSEWILD 고유 시스템인 **5턴 융합**을 별도 행동으로 추가

## 차이를 둔 부분
PokéRogue를 그대로 복제하지 않고 FUSEWILD의 몬스터, 속성, 공명/균열, 융합, 오리지널 기술/이미지 체계를 유지했습니다. 따라서 화면 구성과 흐름의 읽기 쉬운 리듬은 참고하되 데이터와 콘텐츠는 이 프로젝트 고유 자산을 사용합니다.
