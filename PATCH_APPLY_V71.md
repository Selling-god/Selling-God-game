# v7.1 패치 적용

v7.0 프로젝트에 패치 ZIP의 파일을 같은 경로로 덮어씌우세요.

주요 교체 파일:
- `server.js`
- `public/app.js`
- `public/styles.css`
- `public/index.html`
- `public/version.json`
- `public/build-info.json`
- `package.json`
- `package-lock.json`
- `scripts/build.js`
- `scripts/v71-quality-test.js`

배포 전 권장 확인:

```bash
npm run build
node scripts/v71-quality-test.js
```

Render는 Static Site가 아니라 Web Service로 배포해야 합니다.
