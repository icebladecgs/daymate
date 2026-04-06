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
- Mac one-shot refresh script 위치: `scripts/mac-refresh.sh`.
- Mac quick guide 위치: `MAC_WORKFLOW.md`.
- Mac에서 LaunchAgent로 봇을 관리 중이면 `pkill` 대신 `launchctl` 기반 stop/start를 사용해야 한다.
- LaunchAgent 템플릿 위치: `scripts/com.daymate.telegram-agent.plist.template`.
- Vercel 배포 모니터링은 환경변수 `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`를 사용한다.

## Recent Changes
### 2026-04-06 (Windows 작업분)
- 초대 플로우 개선 및 에이전트 ops 정비
- 브랜드 레이블 통일
- 인스톨 배너 클릭 가능 + 우선순위 조정
- **오늘 습관 드래그 순서 변경 기능 추가** (`@dnd-kit/core`, `@dnd-kit/sortable` 신규 의존성)
- **비공개 커뮤니티 4자리 암호 기능** — 서버사이드 검증 (`joinPublicCommunity`)
- `mode` useEffect ReferenceError 수정
- Vercel 빌드 버전 보존 / 캐시 버전 갱신 수정
- `index.html`, `sw.js`, `vite.config` 누락 파일 포함
- `telegram_agent.py` 추가 개선 (history 관리 등)
- Mac: git pull + npm install 완료 (2026-04-06)

### 이전 변경 이력 (요약)
- AI_WIKI 구조 및 루트 MEMORY.md 인덱스 추가
- Mac helper script, LaunchAgent 연동, MAC_WORKFLOW.md 정리
- `telegram_agent.py` 개선 (히스토리 단축, 컨텍스트 초과 처리, 환경변수화)
- 앱 버전 자동 생성(`scripts/generate-version.mjs`), Vite manual chunk 설정

## Current Risks / Notes
- Mac 쪽 저장소도 최신 코드로 `git pull` 되어 있어야 한다.
- Mac 쪽 `.env.local`도 Windows와 같은 값으로 맞아야 한다.
- Mac 쪽 파이썬 환경에도 `anthropic`, `python-telegram-bot`가 설치되어 있어야 한다.
- Mac에서 LaunchAgent가 봇을 KeepAlive 중이면 수동 `pkill` 만으로는 중지가 안 될 수 있다. 이 경우 `npm run tg:mac:stop` 또는 `launchctl bootout`을 사용한다.
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