# FUSEWILD v6.4.0 — Post-Battle UI Rebuild

이 패치는 사용자가 업로드한 v6.3 프로젝트 기준입니다.

## 덮어쓸 파일
- `public/app.js`
- `public/styles.css`
- `public/index.html`
- `public/404.html`
- `index.html`
- `404.html`
- `server.js`
- `package.json`
- `scripts/build.js`
- `scripts/v64-postbattle-ui-test.js`
- `RELEASE_NOTES_V64.md`

## 적용
1. 패치 ZIP의 `FUSEWILD_V64_PATCH` 안 내용을 기존 프로젝트 루트에 그대로 덮어씁니다.
2. GitHub에 commit/push 합니다.
3. Render Web Service에서 최신 commit을 재배포합니다.
4. PC는 `Ctrl+F5`, 모바일은 브라우저 탭을 완전히 닫았다가 Web Service 주소로 다시 접속합니다.

## 확인 명령
```bash
npm run check
node scripts/v64-postbattle-ui-test.js
npm run build
node scripts/shop-cadence-test.js
node scripts/v63-trainer-heal-test.js
```

## 핵심
- 전투 종료 화면을 거대한 카드/패널 적층 방식에서 완전히 분리했습니다.
- 전투 배경 위에 `상점 아이콘 행 + 무료 보상 아이콘 행 + 현재 몬스터 상태 + 하단 설명창`만 남깁니다.
- 설명문은 하단 한 곳에서만 표시되어 텍스트가 서로 겹치지 않습니다.
- 모바일은 아이템 행을 가로 스와이프로 처리해 세로로 끝없이 늘어나지 않습니다.
