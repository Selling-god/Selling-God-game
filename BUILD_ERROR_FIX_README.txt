KX EXCHANGE - Render build error fix (2026.09.03-D)

이번 패치는 다음 오류를 직접 해결합니다:
  Error: export const dynamic = "force-static"/export const revalidate not configured on route "/api/version" with "output: export".

원인:
이전 배포본에 있던 app/api/version 및 app/api/market/tick 파일이 GitHub 저장소에 남아 있으면,
새 ZIP을 덮어쓰기만 해서는 삭제되지 않습니다. Next.js의 output:'export' 빌드는 남아 있는 API route를 발견하면 실패할 수 있습니다.

해결:
package.json의 build 명령이 다음 순서로 실행됩니다.
  node scripts/prepare-static.cjs && next build

prepare-static.cjs가 Render 빌드 직전에 아래 잔여 폴더를 자동 삭제합니다.
  app/api
  pages/api
  .next
  out

그 뒤 정적 Next.js 빌드를 새로 생성합니다.
따라서 GitHub에 이전 API route 파일이 남아 있어도 Render 빌드에는 포함되지 않습니다.

Render Web Service 설정:
- Root Directory: 비워두기
- Build Command: npm install && npm run build
- Start Command: npm start

Render Static Site 설정:
- Root Directory: 비워두기
- Build Command: npm install && npm run build
- Publish Directory: out

필수 환경변수:
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY

정상 빌드 후 로그인 화면에 다음 문구가 표시됩니다.
  STOCK BUILD · RENDER CLEAN BUILD 2026.09.03-D
