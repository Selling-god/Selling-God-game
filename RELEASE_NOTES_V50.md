# RIFT DECK V50 — ORIGINAL PIXEL MONSTERS

## 핵심 변경

- 기본 몬스터 200종을 전부 새로운 오리지널 레트로 도트 스프라이트로 교체했습니다.
- 보스 5종도 별도 오리지널 스프라이트로 교체했습니다.
- 205종 기본 스프라이트는 파일 해시 기준 205/205가 서로 다릅니다.
- 기존의 같은 몸체에 색만 바꾸는 방식 대신 서로 다른 실루엣, 자세, 얼굴, 날개, 뿔, 갑각, 꼬리, 무기 형태를 사용합니다.
- 생성된 외형에 맞춰 200종 일반 몬스터와 5종 보스의 이름, 속성, archetype, 역할, 패시브 표시를 다시 정리했습니다.
- 진화 / 공명 / 균열개화 폼 615종을 새 기본 스프라이트를 기준으로 다시 생성했습니다.
  - 진화: 실루엣 장식/갑주/뿔/날개형 부속 추가
  - 공명: 속성 궤도, 결정, 링 효과 추가
  - 균열개화: 균열 촉수, 암흑 윤곽, 파편 효과 추가
- 보스 이미지는 384×384, 일반 몬스터는 256×256 투명 PNG로 정규화했습니다.
- 모든 스프라이트는 투명 여백을 확보해 실제 전투 UI에서 잘림을 줄였습니다.

## UI 개선

- V49 레트로 픽셀 UI를 유지하면서 V50 스프라이트 규격에 맞춰 전투 배치를 재조정했습니다.
- 싱글/더블 전투에서 아군과 적군을 독립 셀로 유지합니다.
- 더블 전투에서 각 몬스터가 자기 셀을 넘어가지 않도록 최대 크기를 제한했습니다.
- 긴 몬스터 이름은 상태창에서 2줄까지 표시되도록 수정해 이름이 잘려 보이는 문제를 줄였습니다.
- 보스는 별도 `is-boss-v50` 클래스로 더 크게 표시됩니다.
- PC / 태블릿 / 모바일 크기별 스프라이트 제한을 별도로 적용했습니다.

## 코드/자산

- `scripts/extract_v50_monsters.py`: 원본 콘셉트 시트에서 실제 게임용 투명 PNG를 만드는 추출/정규화 스크립트
- `scripts/update_v50_catalog.py`: 새 몬스터 이름/속성/archetype/패시브를 카탈로그에 적용하는 스크립트
- `scripts/generate_v50_forms.py`: 진화/공명/균열 폼 생성 스크립트
- `assets/source_sheets_v50/`: V50 제작에 사용한 오리지널 콘셉트 시트 원본
- `assets/enemies/`: 실제 게임에서 사용하는 기본 몬스터/보스 이미지
- `assets/monsters/forms/`: 진화/공명/균열개화 이미지

## 검증 결과

`npm test` 전체 통과:

- BUILD_OK
- SMOKE_OK
- MULTI_OK
- COMBAT_OK
- COMBAT_DEPTH_OK
- FIFTY_FLOOR_OK
- AUTH_OK
- CLOUD_ROOM_OK
- FUN_LOOP_OK
- VISUAL_FIRST_OK
- EXPEDITION_HUNT_OK
- GAME_FEEL_OK — creatures=205 / uniqueSprites=205
- V40_MONSTER_EVOLUTION_OK — forms=615
- V41_ACTIVE_MONSTER_OK
- V42_RIFT_REWRITE_OK
- V47_PREMIUM_LOOP_OK

추가 검사: 205종 기본 스프라이트 중 빈 이미지 0개, 캔버스 경계에 닿아 잘릴 가능성이 있는 이미지 0개.
