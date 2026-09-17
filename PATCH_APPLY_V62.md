# FUSEWILD v6.2.1 패치 적용

기준: v6.1 또는 v6.2 초기본

1. 이 패치 ZIP의 파일을 프로젝트 루트에 경로 그대로 덮어씁니다.
2. `assets/fusion/generated/` 폴더가 존재하는지 확인합니다. 쓰기 가능한 배포 환경이어야 조합별 PNG를 캐시할 수 있습니다.
3. `npm install`은 새 외부 패키지가 없으므로 필요하지 않습니다. 기존 Node 환경 그대로 사용할 수 있습니다.
4. `npm test` 실행 후 배포합니다.
5. 배포 후 브라우저에서 Ctrl+F5로 강력 새로고침합니다.

핵심 교체 파일: `server.js`, `public/app.js`, `public/styles.css`, `public/index.html`, `scripts/build.js`, `package.json`, `assets/fusion/*`.
