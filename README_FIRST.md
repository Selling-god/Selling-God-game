# KX EXCHANGE - ZERO NEXT Render Fix

이번 버전은 Next.js를 완전히 제거했습니다. Render에서 반복되던 `Not Found`/`output: export` 충돌을 없애기 위한 배포 전용 구조입니다.

## Web Service 권장 설정
- Root Directory: 비워두기
- Build Command: `npm run build`
- Start Command: `npm start`
- Health Check Path: `/healthz`
- Environment:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`npm install`도 필요 없습니다. 외부 npm 패키지를 하나도 사용하지 않습니다.

## 기존 Start Command가 남아 있어도 대응
- `npm start` -> 정상
- `node server.js` -> 정상
- `node game.js` -> 정상
- `node index.js` -> 정상

## Static Site라면
- Build Command: `npm run build`
- Publish Directory: `out`

## 정상 확인
- `/healthz` 접속 -> `KX_EXCHANGE_OK`
- 메인 화면 하단 빌드 표기 -> `KX-ZERO-NEXT-2026.09.03-E`

이 서버는 브라우저 경로에 대해 plain `Not Found`를 반환하는 코드가 아예 없습니다. 존재하지 않는 경로도 `index.html`로 되돌립니다.
