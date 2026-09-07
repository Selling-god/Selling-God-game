# V6.2 패치 적용 순서

1. 기존 프로젝트를 백업합니다.
2. 현재 배포 구조에 맞춰 아래 파일을 덮어씁니다.
   - root 정적 배포: `app.js`, `styles.css`
   - public 정적 배포: `public/app.js`, `public/styles.css`
   - 이 프로젝트는 빌드 시 여러 Publish Directory를 자동 동기화하므로 소스 프로젝트에서는 `public/` 파일을 기준으로 적용하면 됩니다.
3. Supabase SQL Editor에서 `RUN_THIS_IN_SUPABASE_V6.2.sql` 전체를 한 번 실행합니다.
4. SQL 마지막 결과에서 다음 항목을 확인합니다.
   - `realism_rpc_exists = true`
   - `hr_rpc_exists = true`
5. GitHub/Render를 다시 배포합니다.
6. Ctrl+Shift+R로 강력 새로고침합니다.

주의: 기본 `kx_company_api_v1` 자체가 없는 DB라면 V6.1.2 기본 회사 SQL부터 적용한 뒤 V6.2를 실행해야 합니다.
