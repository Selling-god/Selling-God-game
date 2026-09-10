# KX CORPORATE V11.0 - Steam Retail Candidate

극현실 온라인 회사 경영 시뮬레이션의 상용 출시 후보 소스입니다.
V11은 기능 수를 늘리는 것보다 **첫 화면 진입, 데이터 일관성, 경영 판단 동선, 모바일 가독성, 서버 권위, 회귀 테스트**를 우선합니다.

## Source of truth
직접 수정하는 런타임 원본은 아래 3개입니다.
- `public/app.js`
- `public/styles.css`
- `public/index.html`

루트와 `out/`, `dist/`, `build/`, `site/`는 `npm run build`가 같은 소스로 다시 생성합니다. 생성본을 따로 수정하지 마세요.

## Release gate
```bash
npm run release
```
다음 검사가 모두 통과해야 배포 후보로 취급합니다.
- JS/배포본 동기화
- Steam UI smoke test
- 게임 로직·회계·경영권 불변조건
- 17개 회사 업무 화면 렌더링
- 시작 화면 무한대기 방지 계약
- 경영 의사결정 라우팅
- 상용 품질 감사

## Online authority
현금, 주식, 지분, M&A, 인재 결과처럼 경제 상태를 바꾸는 값은 서버 확정값만 인정합니다. 서버 요청 실패를 브라우저에서 성공으로 꾸미지 않습니다.

## Supabase
V11 자체 때문에 새 SQL은 필요하지 않습니다. `RUN_THIS_IN_SUPABASE_V6.7_COMMUNITY.sql`은 CEO 라운지를 아직 설치하지 않은 환경만 위한 기존 파일입니다.

## Paid release
자동검사 통과는 실제 유료 출시 승인이 아닙니다. `STEAM_RELEASE_GATE_V1100.md`의 실사용 QA를 완료한 뒤 출시 여부를 판단하세요.
