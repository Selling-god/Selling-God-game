# Selling God Extreme Realism v6.2.1 - 경영권 방어 버튼 Hotfix

## 적용 파일
기존 프로젝트에서 아래 파일을 교체하세요.

- `app.js`
- `styles.css`
- `public/app.js`
- `public/styles.css`

Supabase SQL은 이번 핫픽스에서 추가 실행할 필요가 없습니다.

## 수정 내용
- 경영권 방어 전략 버튼 클릭 이벤트를 독립 실행 함수로 분리했습니다.
- `긴급 자사주 매입 / 지분 매각 협상 / 백기사 / 포이즌필 / 유상증자 / 역인수` 버튼이 직접 DEFENSE API를 호출합니다.
- 클릭 즉시 `이사회 처리 중` 상태가 표시되어 클릭 여부를 확인할 수 있습니다.
- 방어 예산 부족, 인수전 종료/데이터 갱신 문제를 화면 상단 메시지로 표시합니다.
- 버튼에 `type="button"`, pointer-events, touch-action을 명시해 폼/레이아웃 간섭을 방지했습니다.
- `경영권 방어 현황 보기` 이동 버튼도 클릭 이벤트를 강화했습니다.
- 데스크톱/태블릿/모바일 방어 버튼 레이아웃을 추가했습니다.

## 확인
- `node --check` 통과
- `npm run build` 통과
- root / public / out / dist / build / site READY
