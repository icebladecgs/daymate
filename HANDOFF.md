# DayMate Handoff

이 파일은 짧은 handoff 엔트리만 남기는 요약 메모다.
상세한 AI 운영 지식은 `AI_WIKI/`를 기준 문서로 사용한다.

## Rules
- 큰 변경을 했으면 `AI_WIKI/update-log.md`와 관련 위키 문서를 먼저 갱신한다.
- 이 파일은 handoff 요약만 짧게 남긴다.
- 민감한 값은 적지 않는다. 토큰, 키, 비밀번호는 `.env.local` 같은 환경변수 파일에만 둔다.
- 길게 로그를 복붙하지 말고, 결과와 핵심 판단만 적는다.
- 미래 작업자는 이 파일을 읽고 이어서 작업하되, 실제 코드는 다시 확인한다.
- 새 AI에게 작업을 넘길 때는 `AI_WIKI/README.md`와 루트의 `AI_TEMPLATE.md`를 같이 사용하면 된다.
- 버전은 `scripts/generate-version.mjs`가 자동 생성하므로, 수동 버전 수정 대신 버전 영향 여부만 기록한다.
- 운영 원칙은 "큰 위키"보다 "짧고 살아 있는 위키"다. 핵심은 `frontend.md`, `ops.md`, `update-log.md` 유지다.

## Canonical AI Docs
- `AI_WIKI/README.md`
- `AI_WIKI/overview.md`
- `AI_WIKI/frontend.md`
- `AI_WIKI/ops.md`
- `AI_WIKI/telegram.md`
- `AI_WIKI/decisions.md`
- `AI_WIKI/known-issues.md`
- `AI_WIKI/update-log.md`

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
- Mac helper script는 LaunchAgent가 있으면 `launchctl` 기반으로 동작하도록 보강했다.
- Mac에서 외울 명령을 줄이기 위해 `MAC_WORKFLOW.md`와 `npm run tg:mac:update` 흐름을 정리했다.
- 홈 구성은 현재 `토글 + 위/아래 화살표` 정렬 방식으로 정리됐고, 모바일 드래그는 포기한 상태다.
- 홈 섹션 기본 순서 보정 로직을 넣어 기존 저장값에 없는 `level` 섹션이 맨 아래로 밀리지 않게 조정했다.
- 월별 목표가 3월/4월 동일하게 보이던 문제는 로컬 코드에서 수정했고 `npm run build`는 통과했다.

## Current Risks / Notes
- Mac 쪽 저장소도 최신 코드로 `git pull` 되어 있어야 한다.
- Mac 쪽 `.env.local`도 Windows와 같은 값으로 맞아야 한다.
- Mac 쪽 파이썬 환경에도 `anthropic`, `python-telegram-bot`가 설치되어 있어야 한다.
- Mac에서 LaunchAgent가 봇을 KeepAlive 중이면 수동 `pkill` 만으로는 중지가 안 될 수 있다. 이 경우 `npm run tg:mac:stop` 또는 `launchctl bootout`을 사용한다.
- Windows helper의 `tg:start`는 Mac 봇이 살아 있으면 충돌 때문에 바로 종료될 수 있다. 이 경우 먼저 Mac 봇을 끈 뒤 Windows에서 시작한다.
- 홈 구성 팝업의 모바일 드래그는 원인 미확정 상태로 남겨뒀다. 필요하면 Claude 등 다른 관점에서 `dnd-kit + modal + touch scroll` 조합을 별도 조사하면 된다.
- 월별 목표 수정은 아직 배포하지 않은 로컬 변경일 수 있으니, 이어받는 AI는 `src/utils/goals.js`와 마지막 배포 시점을 같이 확인해야 한다.

## Claude Handoff Focus
- 먼저 `AI_WIKI/README.md`, `AI_WIKI/frontend.md`, `AI_WIKI/known-issues.md`, `AI_WIKI/update-log.md` 순서로 읽는다.
- 홈 구성 쪽은 `src/components/home/HomeCustomizationModal.jsx`, `src/components/home/config.js`, `src/screens/Home.jsx`를 같이 본다.
- 월별 목표 쪽은 `src/utils/goals.js`, `src/screens/History.jsx`, `src/App.jsx`를 같이 본다.
- 현재 실무적으로 중요한 미해결 이슈는 `홈 구성 드래그 불안정 원인 분석`과 `월별 목표 구조의 자동 마이그레이션 여부` 두 가지다.

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