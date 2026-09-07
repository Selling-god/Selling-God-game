# V6.3 패치 적용법

1. 기존 프로젝트를 백업합니다.
2. 패치 ZIP의 `app.js`, `styles.css`를 프로젝트 루트에 덮어씁니다.
3. `public/app.js`, `public/styles.css`도 동일하게 덮어씁니다.
4. Supabase SQL Editor에서 `RUN_THIS_IN_SUPABASE_V6.3.sql` 전체를 **한 번** 실행합니다.
5. Render/GitHub Pages 등 기존 방식으로 재배포합니다.
6. 브라우저에서 `Ctrl + Shift + R`로 강력 새로고침합니다.

기존 V6.2 SQL을 다시 실행할 필요는 없습니다.
