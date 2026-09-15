# RIFT DECK V52 QA

실행: `npm test`

최종 결과: PASS

통과 범위:
- build
- smoke
- 4인 multiplayer
- combat
- combat-depth
- 50층 전체 진행
- auth
- cloud room restore
- fun loop
- visual-first
- journey in-battle capture
- game feel / sprite diversity
- monster evolution / 615 forms
- active monster rules
- rift rewrite / biome fork
- V52 classic battle race test
- premium loop

V52 전용 검사:
- 전투 진입 후 늦게 도착한 `/vote` 요청 -> HTTP 200, 현재 battle 상태 유지
- 중복 route vote -> 안전한 no-op
- V52 battle classes 존재
- 기존 이미지 새로 추가하지 않는 표시 파이프라인
- single battle sprite max display 220px
- `image-rendering:auto` 확인

배포 식별자:
`RIFT-V52-CLASSIC-BATTLE-20260915`
