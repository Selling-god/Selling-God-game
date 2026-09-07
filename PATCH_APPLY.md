# V6.4.1 UI / 버튼 오류 핫픽스

현재 V6.4.0에 적용하는 패치입니다.

## 교체 파일
- app.js
- styles.css
- public/app.js
- public/styles.css

같은 경로의 기존 파일을 위 파일로 교체하세요.

## Supabase
이번 패치는 프런트 UI/렌더링 오류 수정이므로 SQL을 다시 실행할 필요가 없습니다.

## 수정 내용
1. `renderCompanyCompactContext is not defined` 오류 수정
2. 경영/사업/직원/M&A/뉴스 메뉴 이동 시 화면이 멈추던 문제 수정
3. 경영권 방어 화면의 과도한 세로 여백 제거
4. 공격자 지분·우호 지분·방어력·맞지분·1% 지분가치를 5개 KPI 카드로 정리
5. 방어 수단 버튼 높이와 설명을 압축해 한 화면에서 더 많이 보이도록 조정
6. 비판 기사 / 회사 분석·인수 버튼이 렌더 오류 때문에 실행되지 않던 문제 해결

Render에서 `npm run build`를 사용하면 새 app.js/styles.css 기준으로 asset version이 자동 갱신됩니다.
