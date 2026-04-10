# Telegram

## Agent Purpose
- `telegram_agent.py`는 텔레그램으로 DayMate 코드 수정/조회/배포를 돕는 로컬 개발 에이전트다.

## Runtime Rules
- Mac이 기본 상시 호스트다.
- Windows와 Mac에서 동시에 polling bot을 실행하지 않는다.

## Helper Commands
- Windows: `npm run tg:start`, `tg:stop`, `tg:restart`, `tg:status`
- Mac: `npm run tg:mac:start`, `tg:mac:stop`, `tg:mac:restart`, `tg:mac:status`, `tg:mac:logs`, `tg:mac:update`

## LaunchAgent
- Mac LaunchAgent 템플릿: `scripts/com.daymate.telegram-agent.plist.template`
- LaunchAgent가 KeepAlive 중이면 `pkill` 대신 헬퍼 스크립트/`launchctl` 기반 명령 사용

## Agent Workflow Notes
- 큰 파일은 전체를 읽기보다 검색 후 줄 범위 read를 우선한다.
- 최근에는 히스토리 trim, tool result 압축, 컨텍스트 초과 재시도 로직이 들어가 있다.
- 앞으로는 큰 작업 후 `AI_WIKI/update-log.md`와 관련 위키 문서를 짧게 갱신하도록 유도한다.
