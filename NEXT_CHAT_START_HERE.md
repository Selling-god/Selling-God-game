# RIFT DECK 다음 작업 시작점

현재 기준: **v2.2.0 / CLOUD LOGIN + PERSISTENT RUN + COMBAT IMPACT UPDATE**

## 이미 구현
- Node Web Service / 1~4인 authoritative co-op / SSE
- 50층 / 보통·어려움·지옥 / 10층 단위 보스
- 카드 315 / 아이템 48 / 적+보스 55 / 바이옴 5
- 매 층 개인 카드/아이템 보상 + 재굴림
- 일반 여행 카드 봉인 / 복각 가챠 / 컬렉션 / 덱
- Supabase Auth 게임 아이디+비밀번호 로그인
- HttpOnly 쿠키 세션 / Auth UUID 기반 authoritative player identity
- Supabase `rift_profiles` 영구 저장 + 최근 20개 원정 history
- Supabase `rift_rooms` active run snapshot + Render 재시작 후 room restore
- 게스트 진행도 첫 계정 연결 때 승계
- 화면 흔들림 3단계 / hit-stop / damage-heal-block popup / shield crack
- 12속성 particle / slash / card cast / enemy lunge-hit-death / unit summon
- boss/turn/enemy-phase/victory/defeat presentation
- layered procedural SFX + FX 토글 / reduced-motion

## npm test 검증
1. 빌드와 콘텐츠 개수
2. 기본 API/방 생성
3. 4인 멀티
4. 실제 카드 전투 -> 보상 -> 다음 층
5. 지옥 1~50층 완주 + 클리어 history
6. Mock Supabase 회원가입 -> 쿠키 세션 -> authenticated identity -> 로그아웃
7. Mock Supabase active room snapshot -> 서버 종료 -> 재시작 -> 방 복구

## 다음 우선순위
1. 카드 강화/각성/변이 + 속성/종족 시너지
2. 보스 2~3페이즈, 패턴 텔레그래프, 전용 컷인
3. WebSocket animation timeline (행동별 순차 연출)
4. 친구/초대/비밀번호 방/AFK/턴 타이머/관전
5. Daily Seed / Challenge / Infinite Abyss / 시즌 운영
6. 실제 독자 BGM/SFX asset pipeline + sprite frame animation
7. 계정 복구/비밀번호 변경/운영자 도구/제재·로그 시스템

## 지켜야 할 구조
- 피해/보상/가챠/포획은 server.js authoritative
- Secret/service_role key는 Render 서버 환경변수에서만 사용
- 브라우저에는 Secret/service key 또는 비밀번호 토큰을 저장하지 않음
- Pokemon/PokeRogue/Slay the Spire의 실제 아트, 로고, 캐릭터, 고유 UI를 복제하지 않음
