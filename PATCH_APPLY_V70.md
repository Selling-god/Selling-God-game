# FUSEWILD v7.0 패치 적용

1. 기존 프로젝트를 백업합니다.
2. 패치 ZIP의 파일을 프로젝트 루트에 그대로 덮어씁니다.
3. `npm ci` 실행 후 `npm run check`와 `npm run build`를 실행합니다.
4. Render에서는 Static Site가 아니라 **Web Service**로 배포합니다.
   - Build: `npm ci && npm run build`
   - Start: `npm start`
5. 기존 Supabase 환경변수를 새 Web Service의 Environment에 다시 입력합니다.
6. 배포 후 브라우저 캐시를 새로고침합니다(Ctrl+F5 / 모바일 사이트 데이터 새로고침).

## v7 확인 포인트
- 전투 중 내 몬스터가 쓰러지면 자동 교체되지 않아야 합니다.
- 대기 몬스터 목록에서 직접 하나를 선택해야 합니다.
- 선택 후 다음 턴 명령창으로 돌아와야 합니다.
- 모바일에서 전장과 하단 명령창이 서로 겹치지 않아야 합니다.
- 전투 종료 후 상점/무료 보상/설명창이 한 화면에서 서로 겹치지 않아야 합니다.
