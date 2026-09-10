# KX CORPORATE V11.0 Source of Truth

## 직접 수정
1. `public/app.js`
2. `public/styles.css`
3. `public/index.html`
4. `scripts/*.js` 품질/빌드 검사
5. `package.json`
6. 필요 시 `render.yaml`

## 생성본
루트, `out/`, `dist/`, `build/`, `site/`의 app/styles/index/version은 `npm run build`가 생성합니다. 생성본을 직접 수정하지 않습니다.

## 배포
Render Static Site가 `./out`을 publish 하는 현재 구성을 유지합니다.
배포 전 `npm run release` PASS가 필수입니다.
