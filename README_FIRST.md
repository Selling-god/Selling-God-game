# KX EXCHANGE - UNIVERSAL RENDER FIX

이 버전은 기존 Render 서비스가 Web Service인지 Static Site인지 헷갈리는 상황에서도 배포할 수 있도록 만든 호환 배포본입니다.

## 왜 이전 화면에서 `Not Found`가 나왔나
이전 프로젝트는 Next.js 서버 렌더링 방식이었는데, 현재 Render 서비스가 정적 사이트 방식으로 파일을 찾고 있으면 `.next` 빌드가 성공해도 루트에 `index.html`이 없어 Render가 앱까지 요청을 보내지 않고 `Not Found`를 반환할 수 있습니다.

이 버전은 `next build`가 반드시 `out/index.html`을 만들도록 정적 export를 사용합니다.
동시에 `server.js`도 `out` 폴더를 직접 서비스하기 때문에 Render Web Service에서도 같은 프로젝트를 그대로 실행할 수 있습니다.

## 1. GitHub 교체
ZIP 내부 파일을 GitHub 저장소 최상단에 올리세요.
`package.json`, `server.js`, `next.config.mjs`, `app`, `lib`, `public`, `supabase`가 저장소 첫 화면에 보여야 합니다.

## 2. Supabase
처음 설치라면 `supabase/001_schema.sql` 전체를 실행하세요.
이미 001_schema.sql을 실행했다면 `supabase/002_UNIVERSAL_RENDER_FIX.sql`만 추가 실행하세요.

## 3-A. Render가 Web Service인 경우
- Root Directory: 비움
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Environment:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY

그 뒤 Clear build cache & deploy.

정상 로그:
`[KX Exchange] static export server ready at http://0.0.0.0:xxxxx`

## 3-B. Render가 Static Site인 경우
- Root Directory: 비움
- Build Command: `npm install && npm run build`
- Publish Directory: `out`
- Environment:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY

이 경우 Start Command는 없습니다.

## 정상 확인
메인 주소에 접속하면 아래 문구가 보여야 합니다.
`KX EXCHANGE`
`STOCK BUILD · UNIVERSAL RENDER 2026.09.03-C`

이 버전은 더 이상 `/api/market/tick`을 사용하지 않습니다. 로그인한 플레이어들이 Supabase RPC를 호출하며, DB advisory lock 때문에 동시에 여러 플레이어가 접속해도 하나의 공용 시장만 진행됩니다.
