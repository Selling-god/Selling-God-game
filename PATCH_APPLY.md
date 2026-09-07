# V6.4 적용 방법

1. 기존 프로젝트를 백업합니다.
2. 패치 ZIP의 `app.js`, `styles.css`를 프로젝트 루트에 덮어씁니다.
3. `public/app.js`, `public/styles.css`도 같은 위치에 덮어씁니다.
4. Supabase SQL Editor에서 `RUN_THIS_IN_SUPABASE_V6.4.sql` 전체를 한 번 실행합니다.
5. Render/GitHub에 배포한 뒤 브라우저 강력 새로고침(Ctrl+Shift+R)을 합니다.

V6.4 SQL은 V6.3까지 적용된 DB를 전제로 하는 추가 마이그레이션입니다. 기존 데이터를 삭제하지 않습니다.
