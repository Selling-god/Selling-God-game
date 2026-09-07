# Selling God Serious Realism Hotfix v6.1.1

## 수정한 오류
브라우저 콘솔의 아래 오류를 수정했습니다.

- `ReferenceError: renderCompanyPulse is not defined`
- M&A 분석 화면에서 발생할 수 있던 `renderCompanyAnalysisLoading is not defined`
- 기업 목록 첫 진입 시 발생할 수 있던 `renderCompanyAnalysisPlaceholder is not defined`
- `companyRiskLabel`, `companyMood` 누락 복구

## 적용 방법
기존 프로젝트에서 아래 두 파일만 교체하세요.

- `/app.js`
- `/public/app.js`

`styles.css`나 Supabase SQL은 건드릴 필요가 없습니다.

## 검증
- `node --check app.js` 통과
- `node --check public/app.js` 통과
- `npm run build` 통과
- root / public / out / dist / build / site 모두 READY 확인
