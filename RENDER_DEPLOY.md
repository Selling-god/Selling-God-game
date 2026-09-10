# Render 배포 - RIFT DECK v2.2

이미 정상 작동 중인 **RIFT DECK Web Service를 그대로 사용**합니다. 새 서비스를 다시 만들 필요 없습니다.

## 기존 명령은 그대로
- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Node Version: `22`
- Health Check: `/healthz`

## 로그인/클라우드 저장용 Environment
최소 2개만 필요합니다.

- `SUPABASE_URL` = 기존 Supabase Project URL
- `SUPABASE_SECRET_KEY` = 현재 Supabase Secret key (`sb_secret_...`) **권장**

기존 프로젝트에 예전 `service_role` 키만 있다면 두 번째 대신 아래를 써도 됩니다.
- `SUPABASE_SERVICE_ROLE_KEY` = 기존 service_role key

선택 사항:
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`)
- 또는 구형 `SUPABASE_ANON_KEY`

서버가 로그인 요청을 프록시하기 때문에 public/anon 키가 없어도 동작하도록 구성되어 있습니다.

## Supabase SQL
기존 Supabase -> SQL Editor에서 `supabase/RUN_THIS_IN_SUPABASE_RIFT_V22.sql`을 **1회** 실행합니다.

이 SQL은 RIFT 전용 `rift_profiles`, `rift_rooms`만 만들거나 보완하며 기존 `kx_*` 테이블을 삭제/변경하지 않습니다.

## 정상 확인
`https://게임주소/healthz`

핵심 값:
- `service`: `RIFT_DECK_SERVER`
- `version`: `2.2.0`
- `deployId`: `RIFT-V2.2-20260910`
- `auth`: `supabase`
- `cards`: `315`
- `maxDungeonFloor`: `50`

`auth: guest-only`이면 게임은 실행되지만 Supabase Environment가 빠져 있어 로그인/클라우드 저장이 비활성입니다.
