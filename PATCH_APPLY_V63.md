# FUSEWILD v6.3 패치 적용

1. 이 패치 ZIP의 내용을 기존 프로젝트 루트에 그대로 덮어씁니다.
2. Git에 커밋/푸시합니다.
3. Render에서는 반드시 **Static Site가 아니라 Web Service**를 사용합니다.
4. Build: `npm ci && npm run build`
5. Start: `npm start`
6. Health Check: `/healthz`
7. 기존 Static Site에 커스텀 도메인이 붙어 있다면 도메인을 해제한 뒤 새 Web Service에 연결합니다.

## 주요 변경
- 쓰러진 몬스터 자동 교체 삭제 → 사용자가 대기 몬스터를 직접 선택
- 기술명 → 이펙트 → HP 변화 → 효과 메시지 → 기절 → 교체 선택 순서로 전투 텍스트/화면 동기화
- 모바일 세로/가로 전투 레이아웃 전면 보정
- 모든 전투 UI 글자 겹침 방지/말줄임/스크롤 규칙 정리
- 전투 후 상점/무료 보상 UI를 화면 하단 압축형으로 재구성
- 융합 이미지 생성은 A 몬스터 실루엣을 중심(약 70%)으로 유지하고 B 특징을 보조적으로 합성
- 융합 캐시는 `assets/fusion/generated/<A-id>/...` 구조로 분산 가능
