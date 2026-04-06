# AI_WIKI

DayMate 프로젝트용 AI 협업 위키.

## 목적
- 새 AI 세션에서 컨텍스트를 빠르게 복원
- 운영 규칙/주의사항을 한곳에서 확인
- 작업 로그를 축약 형태로 유지

## 필수 참조 순서
1. HANDOFF.md
2. AI_WIKI/update-log.md
3. AI_TEMPLATE.md

## 현재 상태 요약
- 프론트엔드: React + Vite
- 서버리스: api/ 아래 Vercel 함수
- 로컬 개발 봇: telegram_agent.py
- 텔레그램 개발 봇 기본 호스트: Mac
- 운영 원칙: Telegram polling 봇은 한 머신에서만 실행

## 운영 주의
- Mac LaunchAgent가 봇을 관리 중이면 수동 pkill 대신 launchctl 기반 stop/start 사용
- Mac 봇 실행 중 Windows tg:start 실행 시 polling 충돌 가능
- 코드 변경 후 Mac에서 git pull + 의존성 동기화 후 봇 재시작 권장

## 빠른 시작 메시지
"AI_WIKI/README.md, HANDOFF.md, AI_WIKI/update-log.md 읽고 지금 상태 파악해줘"

짧은 버전:

"핸드오프 읽고 이어서 작업 준비해줘"

## 업데이트 규칙
- 큰 변경 시 HANDOFF.md Recent Changes와 AI_WIKI/update-log.md 동시 갱신
- 장문 로그 붙여넣기 금지, 핵심 결과/판단만 기록
- 버전은 scripts/generate-version.mjs 자동 생성 원칙 유지
