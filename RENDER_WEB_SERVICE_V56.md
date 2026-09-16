# Render에서 휴대폰으로 RIFT DECK 실행하기

현재 휴대폰에 `RIFT DECK 게임 서버가 아닙니다` 화면이 뜬다면 게임 코드 문제가 아니라 **Static Site 주소**로 접속한 상태입니다.

RIFT DECK은 `/api/...` Node API가 필요한 동적 게임이므로 Render의 **Web Service**가 필요합니다.

## 가장 쉬운 방법
1. 수정된 V56을 GitHub 저장소에 올립니다.
2. Render Dashboard에서 `New` → `Blueprint`를 선택하고 저장소를 연결합니다.
3. V56의 `render.yaml`이 `type: web` 서비스를 생성하는지 확인합니다.
4. 배포가 끝나면 Web Service의 `https://...onrender.com` 주소를 엽니다.
5. `https://...onrender.com/healthz`에서 아래를 확인합니다.
   - `version`: `5.6.0`
   - `deployId`: `RIFT-V560-FUSION-PP-BATTLE-20260916`

## Web Service를 직접 만들 경우
- Runtime: Node
- Build Command: `npm ci && npm run build`
- Start Command: `npm start`
- Health Check Path: `/healthz`

## 중요
- 기존 Render **Static Site URL**은 사용하지 마세요.
- 커스텀 도메인을 쓰고 있다면 도메인이 Static Site가 아니라 새 Web Service를 가리키도록 바꿔야 합니다.
- 브라우저 캐시 때문에 이전 JS가 남아 보이면 강력 새로고침 후 다시 확인하세요.
