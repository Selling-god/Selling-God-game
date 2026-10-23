# 참고 자료와 라이선스

## 사용자가 제공한 시각 자료
Instagram 프로필 스크린샷에서 확인한 요소:
도트 단위가 보이는 캐릭터, 어두운 판타지 색감, 괴물 실루엣, 움직임을 전제로 한 캐릭터 연출.
게임은 이 넓은 시각적 방향을 참고했습니다.

스크린샷의 캐릭터·그림·로고·프로필 사진을 잘라 쓰거나 스프라이트로 변환하지 않았습니다.
`tools/generate_art.py`에서 자체 도형/픽셀 코드로 별도의 캐릭터·몬스터·건물·배경을 만들었습니다.
따라서 사용자가 제시한 전문 픽셀 작가의 세밀한 원화/애니메이션을 그대로 재현한 결과물은 아닙니다.
스크린샷 원본은 배포 ZIP에 포함하지 않았습니다.

## 제공된 링크와 접근 상태
아래 링크는 제작 시 접근을 시도했으나 접근 제한/요청 차단으로 내용을 확인하지 못했습니다.
영상별 구체적인 동작, 프레임 수, 기법을 봤다고 주장하지 않습니다.
아래 콘텐츠의 이미지·음악·영상 파일을 다운로드하거나 프로젝트에 배포하지 않았습니다.

- https://youtube.com/shorts/xGQfmXDaA6s
- https://www.instagram.com/p/DeWRVy8k8dl/
- https://www.instagram.com/p/Dej_qLTk9DR/
- https://www.instagram.com/reel/DeMT_UvJ6B4/
- https://www.instagram.com/reel/Dd0d8qKRFSs/
- https://www.instagram.com/reel/Der6ifEMig5/
- https://www.instagram.com/reel/DeuNbWpyy15/
- https://www.instagram.com/reel/DemyGYLkcUF/
- https://www.instagram.com/reel/DbWFCuONK54/
- https://www.instagram.com/reel/DddV7I3R4Fm/
- https://www.instagram.com/reel/DeT0K6GgEqG/
- https://www.instagram.com/reel/DeAAwtroH9R/
- https://www.instagram.com/reel/Ddve8A3BlZS/

## 추가 조사에 사용한 공식 자료
확인일: 2026-10-23. 서비스 정책과 API는 변경될 수 있습니다.

1. Render free service: https://render.com/docs/free
   휴면/콜드 스타트, 휘발성 파일시스템, 무료 한도, 단일 인스턴스 제한.
2. Render WebSockets: https://render.com/docs/websocket
   Web Service 연결, WSS, heartbeat/reconnect, 정상 종료 저장.
3. Supabase pricing: https://supabase.com/pricing
   무료 DB/egress/계정 한도와 프로젝트 일시 중지.
4. Supabase anonymous sign-ins: https://supabase.com/docs/guides/auth/auth-anonymous
   익명 사용자의 복구 제약, 이메일 연결/검증/비밀번호 설정.
5. Supabase custom SMTP: https://supabase.com/docs/guides/auth/auth-smtp
   기본 발송의 수신자/빈도 제약과 외부 발송 설정.
6. ws library: https://github.com/websockets/ws
   WebSocket 서버, heartbeat, payload 제한, 압축 API.
7. ws 8.18.3 release: https://github.com/websockets/ws/releases/tag/8.18.3
   배포 의존성에 지정한 버전의 존재를 확인했습니다.

## 실제 포함된 리소스
- 프로젝트 소스, 자체 생성 도트 이미지: 동봉한 LICENSE에 따름.
- WebSocket 라이브러리 `ws`: MIT. `npm ci`로 설치되는 별도 패키지이며 해당 패키지의 LICENSE에 따릅니다.
- Python Pillow: 선택적 아트 재생성 도구. 실행 배포에 필요하지 않으며 라이브러리 바이너리를 포함하지 않았습니다.
- Playwright: 선택적 브라우저 테스트 도구. 실행 배포에 필요하지 않으며 바이너리를 포함하지 않았습니다.
- 오디오: Web Audio oscillator로 생성한 짧은 효과음/간단한 멜로디. 외부 음원 없음.
- 폰트: 운영체제 폰트만 사용. 폰트 파일을 포함하지 않았습니다.
- Kenney 등의 공개 도트 자료는 조사 후보였으나 이 배포본에 사용하지 않았습니다.

의존성 바이너리, 기존 작가 작품, 사용자 원본 첨부파일, 개인 저장 데이터, 비밀키는 ZIP에 포함하지 않습니다.
