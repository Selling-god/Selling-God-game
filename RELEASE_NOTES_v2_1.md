# RIFT DECK v2.1 - Deploy/Supabase Fix

- Render 배포 식별자: `RIFT-V2.1-20260910`
- 동적 Node Web Service용 `render.yaml` 재정리
- `/healthz` 및 `/api/version`에 버전, 배포 ID, 카드 수, 50층, 저장 방식 표시
- 기존 브라우저 Service Worker와 Cache 자동 해제
- JS/CSS 캐시를 `no-store`로 변경하고 URL 버전 쿼리 추가
- 정적 Render 서비스에 잘못 올렸을 경우 `out/index.html`이 진단 화면을 표시하도록 build guard 추가
- 기존 Supabase 프로젝트에 안전하게 추가할 `rift_profiles` 테이블 SQL 제공
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`가 설정되면 서버 프로필을 Supabase에도 동기화
- 기존 `kx_*` 테이블과 RPC는 삭제/수정하지 않음
- 기존 Selling-God 저장소 위에 전체 파일을 덮어쓴 상태에서도 npm build + Node server 동작 검증
