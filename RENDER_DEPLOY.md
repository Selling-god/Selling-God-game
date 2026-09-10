# Render 배포 안내

## 화면에 보였던 오류 원인

이전 배포 로그의 핵심은 아래 한 줄입니다.

`npm error Missing script: "build"`

Render의 Build Command가 `npm run build`를 실행했는데 당시 `package.json`에 build 스크립트가 없어서 배포가 중단된 것입니다.

v2에는 다음이 실제로 들어 있습니다.

```json
"build": "node scripts/build.js"
```

`npm run build`는 빈 명령이 아니라 필수 파일, 315장 카드 데이터, 48개 아이템, 3개 난이도, 50층 설정, 375개 PNG 자산이 모두 존재하는지를 검사합니다.

## 권장 Render 설정

저장소 루트에 `package.json`, `server.js`, `render.yaml`이 직접 보여야 합니다. ZIP 바깥 폴더를 한 단계 더 만들어 올려서 루트가 어긋나지 않도록 주의하세요.

- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Node Version: `22`
- Health Check Path: `/healthz`

`render.yaml`에도 동일하게 기록되어 있습니다.

## 배포 직전 로컬 확인

```bash
npm ci
npm run check
npm test
npm start
```

실행 후 아래 주소가 JSON을 반환하면 서버가 정상입니다.

`/healthz`

## GitHub에 기존 v1 저장소가 있는 경우

이번 v2는 변경 범위가 매우 크기 때문에 가장 확실한 방법은 FULL ZIP의 내용을 저장소 루트에 교체하는 것입니다. 기존 프로필 파일을 보존해야 한다면 PATCH ZIP을 덮어쓰세요. PATCH ZIP에는 `data/profiles.json`을 넣지 않았습니다.

## 영구 저장 주의

Render의 로컬 파일 시스템은 장기 계정 데이터베이스 용도로 사용하면 안 됩니다. 현재 JSON 저장은 개발/테스트 단계용입니다. 공개 서비스 전에는 Supabase/Postgres로 프로필 어댑터를 바꾸는 것을 권장합니다.

## v2.1 중요: 예전 화면이 계속 보일 때

이 프로젝트는 Node 동적 서버입니다. 예전 `Selling-God` 정적 사이트를 그대로 사용하면 새 게임 서버가 실행되지 않습니다.

정상 Render 서비스 설정:
- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/healthz`

배포 후 `https://배포주소/healthz`를 열어 다음 값이 보여야 합니다.
- `service`: `RIFT_DECK_SERVER`
- `version`: `2.1.0`
- `deployId`: `RIFT-V2.1-20260910`
- `cards`: `315`
- `maxDungeonFloor`: `50`

정적 사이트로 잘못 배포하면 v2.1 빌드는 `out/index.html`에 진단 화면을 생성합니다. 따라서 새 빌드가 성공했는데도 예전 게임 화면이 보인다면 새 커밋/브랜치/서비스가 실제 배포 대상이 아닌 것입니다.

브라우저의 과거 Service Worker/Cache도 v2.1 클라이언트가 시작 시 자동 해제합니다.
