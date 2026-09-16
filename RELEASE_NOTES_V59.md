# RIFT DECK v5.9.0 - Fusion 5-Turn / Reward Viewport / Battle FX Performance Patch

이 패치는 v5.8 프로젝트에 덮어쓰는 실제 코드 패치입니다.

## 1. 보상 화면 / 불필요한 브라우저 스크롤
- 런 화면(route/battle/reward/event)은 브라우저 viewport 안에 고정됩니다.
- 페이지 자체의 가로/세로 스크롤이 생기지 않도록 `100vw / 100dvh` 기준으로 고정했습니다.
- 화면 높이가 부족할 때만 보상 패널 내부가 스크롤됩니다.
- 보상 4/5/6개는 데스크톱에서 한 줄에 맞춰 배치하도록 `reward-count-*` 그리드를 추가했습니다.
- 보상 카드, 전투 결과 요약, 상점 영역 높이를 줄여 잘림을 줄였습니다.

## 2. 융합 이미지가 링만 보이던 문제
- `/api/fusion-sprite` SVG 안에서 원본 몬스터 파일을 외부 URL로 다시 참조하던 방식을 제거했습니다.
- 서버가 실제 PNG/WebP/JPG/SVG 파일을 읽고 base64 data URI로 SVG 내부에 직접 포함합니다.
- `<img src="/api/fusion-sprite?...">` 환경에서도 두 몬스터 그림이 실제로 표시됩니다.
- 브라우저가 이전의 깨진 융합 SVG를 재사용하지 않도록 fusion URL에 `v=590` cache bust를 적용했습니다.
- fusion sprite API는 `Cache-Control: no-store`로 반환합니다.

## 3. 융합은 정확히 5회 행동 후 해제
- 융합 발동은 기존대로 행동 1회를 소비합니다.
- 발동 이후 융합 몬스터가 행동할 수 있는 횟수는 정확히 5회입니다.
- 기술 사용, 상태이상으로 행동 불가, 봉인 실패, 도주 실패처럼 행동을 소비한 경우 카운트가 1 감소합니다.
- 5회째 행동이 끝나면 즉시 두 원래 몬스터로 복귀합니다.
- 전투가 5회보다 먼저 끝나면 남은 턴과 관계없이 즉시 융합을 해제합니다.
- 전투 종료 뒤 보상 화면이나 다음 웨이브로 융합 상태가 넘어가지 않습니다.
- 융합 중 KO가 발생해도 원본 몬스터 복구 로직이 실행됩니다.
- UI에 남은 융합 턴을 표시합니다.

## 4. 기술 이펙트 누락 보강
- 서버 이벤트에 정확한 DOM 대상 ID가 없거나 렌더 타이밍으로 대상이 교체된 경우에도 현재 활성 아군/적을 fallback 대상으로 찾습니다.
- 일반 공격 / 버스트 / 기술 피드백 / 적 공격에 fallback target을 적용했습니다.
- 그래서 데미지는 처리됐는데 이펙트만 안 보이던 경우를 줄였습니다.

## 5. 전투 끊김 / 렉 완화
- 전투 메시지와 기술 연출 대기 시간을 크게 줄였습니다.
- Canvas 고비용 FX는 강한 기술/전용기 중심으로만 사용합니다.
- 저사양 CPU/메모리 환경에서는 Canvas 중첩을 피합니다.
- Canvas DPR은 최대 1.25로 제한했습니다.
- Canvas particle 수와 지속 시간을 줄였습니다.
- DOM particle 수와 animation 지속 시간도 줄였습니다.
- 전투 처리 중 배경 애니메이션을 잠시 멈춰 동시에 돌아가는 animation 수를 줄였습니다.

## 6. 캐시 / 버전
- `public/index.html`의 app.js/styles.css cache key를 v5.9 deploy id로 변경했습니다.
- package / package-lock / version.json / build-info / build script 버전을 5.9.0으로 맞췄습니다.

## 검증
다음 명령을 실제로 실행해 통과했습니다.

```text
npm run check
npm test
```

런타임 테스트에서 확인한 항목:
- 융합 시작 시 `fusionTurnsRemaining = 5`
- 1~4번째 행동 뒤 4/3/2/1로 감소
- 5번째 행동 뒤 자동 해제 및 파트너 복귀
- 전투 강제 종료 시 융합 자동 해제
- 다음 run roster에 fused 상태가 남지 않음
- fusion SVG가 `data:image/...;base64`로 실제 몬스터 이미지를 포함함
