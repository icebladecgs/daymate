# DayMate Handoff

이 파일은 ChatGPT, Claude, Copilot 등 여러 AI가 같은 프로젝트를 이어서 작업할 때 참고하는 공용 메모다.

## Rules
- 큰 변경을 했으면 이 파일의 `Recent Changes`와 `Current State`를 짧게 갱신한다.
- 민감한 값은 적지 않는다. 토큰, 키, 비밀번호는 `.env.local` 같은 환경변수 파일에만 둔다.
- 길게 로그를 복붙하지 말고, 결과와 핵심 판단만 적는다.
- 미래 작업자는 이 파일을 읽고 이어서 작업하되, 실제 코드는 다시 확인한다.
- 새 AI에게 작업을 넘길 때는 루트의 `AI_TEMPLATE.md` 템플릿을 같이 사용하면 된다.
- 버전은 `scripts/generate-version.mjs`가 자동 생성하므로, 수동 버전 수정 대신 버전 영향 여부만 기록한다.

## Current State
- 프론트엔드: React + Vite.
- 서버리스: `api/` 아래 Vercel 함수.
- 로컬 텔레그램 개발 봇: `telegram_agent.py`.
- Python 의존성은 루트 `requirements.txt`로 고정했다.
- 환경변수 예시는 루트 `.env.local.example`에 정리했다.
- 앱 버전 표시는 `src/version.js`를 통해 노출되고, 이 파일은 build/dev 전에 자동 생성된다.
- 현재 운영 원칙: 텔레그램 개발 봇은 한 머신에서만 실행한다.
- 현재 상시 실행 머신: Mac.
- Windows 쪽 봇은 종료 상태로 두고, 필요할 때만 수동으로 올린다.

## Telegram Dev Bot
- Mac이 기본 호스트다.
- Windows와 Mac에서 동시에 `telegram_agent.py`를 실행하면 Telegram polling 충돌이 난다.
- Windows에서는 아래 명령으로 봇 상태를 제어할 수 있다.
  - `npm run tg:start`
  - `npm run tg:stop`
  - `npm run tg:restart`
  - `npm run tg:status`
- Windows helper script 위치: `scripts/telegram-agent.ps1`.
- Mac helper script 위치: `scripts/telegram-agent.sh`.
- Vercel 배포 모니터링은 환경변수 `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`를 사용한다.

## Recent Changes
- 챌린지 화면에서 참여자 레벨/XP 표시를 개선했다.
- 통계 화면에 내 레벨 진행 카드와 더 읽기 쉬운 랭킹 표현을 추가했다.
- `api/notify.js` 문법 오류를 수정했고, 여러 API에 로깅/보호 로직을 추가했다.
- 앱 버전은 `scripts/generate-version.mjs`로 자동 생성되며 `predev`, `prebuild`에 연결돼 있다.
- Vite manual chunk 설정으로 초기 번들을 줄였다.
- `telegram_agent.py`는 이제:
  - 히스토리를 더 짧게 유지한다.
  - tool 결과를 잘라서 저장한다.
  - 컨텍스트 초과 시 최근 요청만 남기고 재시도한다.
  - `search_files` 도구와 줄 범위 `read_file`을 사용한다.
  - 실행 환경을 Windows로 단정하지 않는다.
- `telegram_agent.py`의 Vercel 토큰 하드코딩은 제거했고 `.env.local` 환경변수로 옮겼다.
- Windows helper script와 Mac helper script를 추가해 봇 start/stop/status를 쉽게 했다.
- `.env.local.example`과 `requirements.txt`를 추가해 머신 이동/세팅을 단순화했다.

## Current Risks / Notes
- Mac 쪽 저장소도 최신 코드로 `git pull` 되어 있어야 한다.
- Mac 쪽 `.env.local`도 Windows와 같은 값으로 맞아야 한다.
- Mac 쪽 파이썬 환경에도 `anthropic`, `python-telegram-bot`가 설치되어 있어야 한다.
- Windows helper의 `tg:start`는 Mac 봇이 살아 있으면 충돌 때문에 바로 종료될 수 있다. 이 경우 먼저 Mac 봇을 끈 뒤 Windows에서 시작한다.

## Suggested Next Steps
- Mac helper script를 `launchd`에 연결하면 부팅 후 자동 복구가 쉬워진다.
- 필요하면 이 파일 대신 `AI_NOTES.md`를 추가로 만들어 더 자유로운 작업 로그를 분리해도 된다.

## Update Template
작업 후 아래 형식으로 짧게 갱신:

```
### YYYY-MM-DD HH:MM
- 무엇을 바꿨는지
- 버전/빌드 영향: 있음/없음
- 검증 결과
- 다음 작업자가 알아야 할 점
```