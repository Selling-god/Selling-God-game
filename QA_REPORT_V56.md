# RIFT DECK V56 QA REPORT

## 검증 환경
- Node.js server syntax: PASS
- Browser client syntax (`public/app.js`): PASS
- Full V55 asset tree에 V56 코드 오버레이 후 빌드: PASS
- `npm test`: PASS

## V56 전용 자동 회귀 테스트
`V56_FUSION_PP_BATTLE_OK`

검사 항목:
1. 205종 몬스터 로딩
2. 205종 종별 전용기 존재 및 전용기 이름 205개 고유
3. 기술 FX family 21종 확인
4. Render `type: web`, `npm start`, `/healthz` 설정 확인
5. 카드 없는 몬스터 파티 loadout 저장
6. 전투 중 두 몬스터 융합
7. 융합이 실제 1행동을 소비하는 이벤트 확인
8. 융합 파트너가 파티에서 결합되고 lineage가 보존되는지 확인
9. 원정 전투 카드 사용 API 차단 확인
10. 기술 사용 시 PP 1 감소 확인
11. 다음 웨이브에서 감소한 PP가 그대로 유지되는지 확인
12. 10웨이브 이전에는 HP/PP 자동 완전 회복이 일어나지 않는 흐름 확인
13. 10웨이브 돌파 후 HP 완전 회복 확인
14. 10웨이브 돌파 후 PP 완전 회복 확인
15. 10웨이브 돌파 후 주요 상태이상 제거 확인
16. 11층 활성 원정 이어하기 API 확인
17. 보스 HP 세그먼트 및 보스 봉인 세그먼트 제한 코드 검증

## 전체 자산 빌드
Full 프로젝트에서 `npm run build` 결과:
- version: 5.6.0
- deploy: RIFT-V560-FUSION-PP-BATTLE-20260916
- monsters: 205
- items: 128
- dungeon floors: 50
- 기존 이미지 자산 검증: PASS

참고: 315개 카드 데이터는 과거 버전/아카이브 호환 때문에 파일에는 남아 있지만 V56 원정 전투에서는 사용하지 않습니다.

## 모바일 관련 검증 범위
코드와 Render Web Service 설정은 검증했습니다. 실제 사용자의 Render 계정 배포/도메인 연결은 이 환경에서 대신 변경할 수 없으므로, 휴대폰 접속 자체는 새 Web Service 배포 후 사용자가 확인해야 합니다. Static Site 주소로 접속하면 의도적으로 Web Service 안내 진단 페이지가 표시됩니다.
