# RIFT DECK v2.2 Architecture

## Client
`public/index.html` + `public/styles.css` + `public/app.js`
- SPA UI, REST inputs, SSE authoritative room snapshots
- 로그인은 Node 서버 프록시를 통해 Supabase Auth 사용
- 브라우저 세션은 HttpOnly access/refresh cookie 사용
- 전투 VFX는 서버 snapshot 전후 HP/block/unit delta와 room feed event를 조합
- 카드 cast는 입력 순간 anticipation, 실제 피해/회복/방어는 서버 응답 후 feedback

## Server
`server.js`
- Node `http` Web Service
- 방/전투/드롭/보상/가챠 authoritative
- 1~4인 room + SSE
- Supabase Auth REST 연동
- 로그인 사용자는 Auth user UUID를 profile/player ID로 강제
- `rift_profiles`: 영구 progression + 최근 원정 history
- `rift_rooms`: active room/run snapshot (재시작/재접속 복구)
- JSON 파일은 로컬 개발 fallback

## Auth flow
AUTH UI -> `/api/auth/signup|login` -> Supabase Auth -> HttpOnly cookies -> authenticated `/api/profile` -> `rift_profiles`

Native EventSource에는 임의 Authorization header를 넣지 않고 같은 HttpOnly cookie로 SSE 사용자를 확인합니다.

## Persistence
영구 저장:
- collection / deck / currencies / seals / pity
- dungeon/journey stats and difficulty records
- recent expedition history (last 20)
- active room / battle / run state snapshots

방 snapshot은 서버에서 room event가 발생할 때 debounce하여 저장하고, Render 프로세스가 다시 시작되면 최근 active room을 복원합니다.

## Combat feedback
- card cast anticipation
- snapshot delta -> damage/heal/block popup, shield crack, enemy recoil, player impact
- screen shake + short hit-stop
- 12-element particles + slash trails
- boss aura/cut-in, turn/enemy phase/victory/defeat banners
- layered procedural WebAudio cues
- FX toggle + OS reduced-motion fallback
