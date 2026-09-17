# v7.2 적용

패치 ZIP의 파일을 기존 v7.1 프로젝트 루트에 그대로 덮어쓰세요.

1. `public/app.js`, `public/styles.css`, `server.js`, `package.json`, `scripts/build.js` 교체
2. `assets/enemies`, `assets/items`, `assets/relics`의 PNG 덮어쓰기
3. Render 재배포
4. 브라우저에서 Ctrl+F5 또는 모바일 브라우저 캐시 삭제 후 재접속

검증: `npm run build` 후 `node scripts/v72-quality-test.js`
