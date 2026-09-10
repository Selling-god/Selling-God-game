# RIFT DECK : ABYSS EXPEDITION v2.2.0

동적 Node 서버 기반의 1~4인 협동 카드 로그라이트입니다. 50층 던전, 보통/어려움/지옥 난이도, 315종 카드, 매 층 카드/아이템 드래프트, 일반 여행 카드 봉인, 복각 가챠를 유지하면서 v2.2에서 **Supabase 로그인/클라우드 저장**과 **전투 타격 연출**을 크게 확장했습니다.

PokeRogue의 빠른 반복 런/수집 긴장감과 덱빌딩 로그라이트의 적 의도·전투 후 선택 감각에서 장르적 영감을 받았지만, Pokemon/PokeRogue/Slay the Spire의 캐릭터·스프라이트·로고·고유 UI 자산을 복제하지 않습니다. 제공 자산과 UI/VFX는 RIFT DECK용 독자 구성입니다.

## v2.2 핵심

- Supabase Auth 계정 생성/로그인/로그아웃
- 게임용 `아이디 + 비밀번호 + 닉네임` 로그인 UI
- HttpOnly 세션 쿠키: 인증 토큰을 localStorage에 저장하지 않음
- 로그인 계정의 카드 컬렉션/덱/재화/봉인구/가챠 천장/난이도 기록을 `rift_profiles`에 영구 저장
- 최근 20회 원정 history + 진행 중인 `rift_rooms` snapshot 저장/서버 재시작 복구
- 같은 브라우저에서 사용하던 게스트 진행도를 첫 계정 생성/로그인 때 계정으로 승계
- 서버가 로그인 사용자의 Supabase UUID를 authoritative player id로 사용해 client profileId 위조 방지
- 화면 흔들림 3단계, 타격 hit-stop, 피격 플래시, 데미지/회복/방어 숫자, 방어 파괴
- 12속성별 파티클, 베기/충돌 VFX, 카드가 손에서 타깃으로 날아가는 cast animation
- 적 피격 recoil/사망 연출, 유닛 소환 연출, 보스 오라/등장 연출
- TURN / ENEMY PHASE / BOSS / VICTORY / DEFEAT 배너
- 전투 배경 미세 패럴랙스, 적 Intent pulse, 보상 카드 순차 등장
- 다층 procedural WebAudio SFX(타격/방어/회복/소환/보스 등)
- FX ON/OFF 옵션 및 OS `prefers-reduced-motion` 대응

## 기존 핵심 콘텐츠

- 카드 315종: 일반 96 / 희귀 84 / 초희귀 60 / 전설 48 / 신화 27
- 유닛 170 / 스펠 145
- 런 아이템 48종
- 일반 적 50종 / 보스 5종 / 바이옴 5종
- 던전 50층, 10/20/30/40/50층 보스
- 난이도 보통 / 어려움 / 지옥
- 1~4인 협동, 경로 투표, SSE 실시간 동기화
- 매 층 완료 후 각 플레이어별 카드 3 + 아이템 2 중심 랜덤 보상 후보에서 1개 선택
- 일반 여행 카드 흔적 봉인
- 기간 복각 가챠 / 전설·신화 천장 / 중복 잔광
- 컬렉션 / 시작 덱 8~16종 편성

## 실행

```bash
npm ci
npm run build
npm start
```

브라우저: `http://localhost:3000`

전체 검증:

```bash
npm test
```

테스트는 build, smoke, 4인 멀티, 실제 전투/보상, 지옥 50층 클리어, Supabase Auth mock 통합 테스트까지 실행합니다.

## Render

이미 만든 **Web Service**를 그대로 사용하면 됩니다.

```text
Build Command: npm ci && npm run build
Start Command: npm start
Node Version: 22
Health Check Path: /healthz
```

v2.2 배포 식별자: `RIFT-V2.2-20260910`

## Supabase 로그인/영구 저장

새 Supabase 프로젝트를 만들 필요가 없습니다. 기존 프로젝트에서 `supabase/RUN_THIS_IN_SUPABASE_RIFT_V22.sql`을 1회 실행한 뒤 Render Environment에 아래 값을 넣습니다.

```text
SUPABASE_URL
SUPABASE_SECRET_KEY        # 권장: sb_secret_...
# 또는 SUPABASE_SERVICE_ROLE_KEY (구형 service_role)
SUPABASE_PUBLISHABLE_KEY   # 선택: sb_publishable_...
# 또는 SUPABASE_ANON_KEY (구형 anon)
```

`SUPABASE_SECRET_KEY` 또는 구형 `SUPABASE_SERVICE_ROLE_KEY`는 **Render 서버 환경변수에만** 넣고 GitHub/public JS에는 절대로 넣지 않습니다. 비밀번호는 `rift_profiles`에 저장하지 않고 Supabase Auth가 관리합니다.

배포 후 `/healthz`에서 `version: 2.2.0`, `deployId: RIFT-V2.2-20260910`, `auth: supabase`가 보이면 로그인/저장이 활성화된 상태입니다.

자세한 순서는 `SUPABASE_SETUP_V22.txt`와 `RENDER_DEPLOY.md`를 참고하세요.

## 저장 범위

로그인 계정에는 다음이 영구 저장됩니다.

- 컬렉션 / 보유 수량
- 시작 덱
- 프리즘 / 잔광
- 기본·은빛·왕가 봉인구
- 전설/신화 가챠 천장
- 일반 여행/던전 횟수
- 난이도별 최고층/클리어
- 보스 격파 및 카드 봉인 기록
- 최근 20회 원정 이력(난이도/도달층/클리어 여부/획득 요약)
- 진행 중인 방/전투/런 상태 snapshot

v2.2부터 `rift_rooms` snapshot을 사용하므로 **Render 프로세스가 재시작되어도 최근 진행 중이던 방을 다시 복원**할 수 있습니다. 실시간 전투 판정은 여전히 Node 서버가 authoritative이며 Supabase는 영구 저장/복구 계층으로 사용합니다.
