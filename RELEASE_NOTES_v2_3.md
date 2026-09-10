# RIFT DECK v2.3.0 HIGH QUALITY

## 핵심 개선
- 전체 UI 글자 크기/대비/굵기 상향: 카드, 보상, 가챠, 로비, 프로필, 전투 로그 포함
- TACTICAL CHAIN: 같은 턴에 UNIT ↔ SPELL 교차 사용 시 연쇄 상승
  - 3연쇄: 카드 1장 드로우 + 방어 4
  - 5연쇄: OVERDRIVE, 에너지 +1 + 다음 공격 +6
- 보스 PHASE II: HP 50% 이하에서 공격력 상승, 보호막 전개, 공격 성향 강화
- 전투 등급 S/A/B/C 및 노데미지 PERFECT 보너스
- 카드 우클릭/모바일 길게 누르기로 큰 상세 보기
- 전설/신화 카드 홀로그램 광택, 선택 타겟 락온, 보스 폭주 연출 강화
- 기존 315카드 / 50층 / 3난이도 / 1~4인 협동 / Supabase 로그인·저장 유지

## Supabase
기존 v2.2 SQL을 실행했다면 추가 SQL 변경은 필요 없습니다. 새 기록(perfectBattles/bestChain/overdrives)은 기존 profile JSON에 포함됩니다.
