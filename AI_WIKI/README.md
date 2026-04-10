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
# DayMate AI Wiki

이 폴더는 DayMate 프로젝트를 여러 AI 세션과 여러 머신에서 안정적으로 이어가기 위한 AI 전용 지식 레이어다.

원칙:
- 원본 코드/README를 대체하지 않는다.
- AI가 반복해서 다시 설명받아야 하는 운영 문맥, 결정 이유, 함정, 작업 히스토리를 축적한다.
- 민감한 값은 절대 기록하지 않는다.
- 큰 작업 후에는 `update-log.md`와 관련 도메인 문서를 짧게 갱신한다.

운영 방식:
- 큰 위키보다 살아 있는 짧은 위키를 유지한다.
- 사실, 함정, 결정 이유, 다음 작업자가 바로 써먹을 정보만 적는다.
- `update-log.md`는 작업 일지가 아니라 4줄 요약 로그로 유지한다.
- 가장 자주 보는 핵심 문서는 `frontend.md`, `ops.md`, `update-log.md` 세 개다.
- Claude, ChatGPT, Copilot 모두 같은 기준으로 이 폴더를 먼저 읽고 작업한다.

추천 읽기 순서:
1. `overview.md`
2. `frontend.md`
3. `ops.md`
4. `telegram.md`
5. `decisions.md`
6. `known-issues.md`
7. `update-log.md`

문서 역할:
- `overview.md`: 프로젝트 개요, 핵심 구조, 현재 운영 상태
- `frontend.md`: 화면 구성, 상태 흐름, 최근 UI 원칙
- `ops.md`: 배포, 버전, PWA, 캐시, 빌드/운영 메모
- `telegram.md`: 텔레그램 에이전트/멀티 머신 운영 메모
- `decisions.md`: 중요한 기술/제품 결정과 이유
- `known-issues.md`: 반복되는 문제와 우회법
- `update-log.md`: 짧은 작업 로그
