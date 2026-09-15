# RIFT DECK V53.1 — RUNMOD HOTFIX

- 전투 진입 직후 발생하던 `ReferenceError: runMod is not defined` 수정.
- 누락된 클라이언트 `runMod(run, key)` 헬퍼 복구.
- 봉인 확률 계산(`battleCaptureChanceUi`)이 런 아이템/유물 보너스를 정상 반영하도록 복구.
- 배포 ID를 `RIFT-V531-RUNMOD-HOTFIX-20260915`로 변경해 브라우저가 이전 `app.js`를 캐시에서 재사용하지 않도록 함.
- V53 장착 아이템/소지금/UI 개선은 그대로 유지.
