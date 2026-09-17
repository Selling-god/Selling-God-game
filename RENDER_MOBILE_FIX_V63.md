# FUSEWILD v6.3 - Render / 휴대폰 접속 오류 해결

스크린샷의 "게임 서버 주소가 아닙니다" 화면은 휴대폰 해상도 오류가 아니라 **Render Static Site**에 접속했을 때 나오는 진단 페이지입니다.

## 가장 쉬운 해결
1. Render Dashboard에서 기존 Static Site는 그대로 두거나 비활성화합니다.
2. `New` -> `Web Service`를 선택합니다.
3. FUSEWILD Git 저장소를 연결합니다.
4. Build Command: `npm ci && npm run build`
5. Start Command: `npm start`
6. Health Check Path: `/healthz`
7. 배포 후 새 Web Service의 `https://....onrender.com` 주소로 접속합니다.
8. 커스텀 도메인을 쓰고 있다면 기존 Static Site에서 도메인을 해제하고 Web Service에 다시 연결합니다.

## render.yaml
v6.3의 `render.yaml`은 `type: web`, Node runtime, `npm start`, `/healthz`로 설정되어 있습니다. 새 Blueprint/Web Service를 만들 때 이 설정을 사용할 수 있습니다.

## 확인
Web Service 주소 뒤에 `/healthz`를 붙였을 때 JSON 안에 아래 값이 보이면 정상입니다.
- `service: FUSEWILD_SERVER`
- `version: 6.3.0`
- `deployId: FUSEWILD-V630-PHASE-SYNC-MOBILE-20260917`
