# FUSEWILD v6.1 Patch Apply

기존 v6.0 프로젝트 루트에 패치 ZIP 내용을 그대로 덮어쓰세요.

주요 교체 파일:
- server.js
- public/app.js
- public/styles.css
- public/index.html
- package.json / package-lock.json
- scripts/build.js
- scripts/v61-ui-cadence-test.js
- POKEROGUE_FLOW_RESEARCH_V61.md
- RELEASE_NOTES_V61.md

적용 후 `npm install` 또는 `npm ci` 후 `npm test`를 실행하세요. 브라우저는 Ctrl+F5로 캐시를 강력 새로고침하세요.
