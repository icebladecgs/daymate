# AI Shared Template

이 파일은 ChatGPT, Claude, Copilot 등 어떤 AI에게 작업을 넘길 때 공통으로 붙여 넣는 템플릿이다.
상세 프로젝트 문맥은 `AI_WIKI/` 문서를 먼저 읽는 것을 기본으로 한다.

## Rules
- 민감한 값은 적지 않는다.
- 실제 코드와 상태는 반드시 프로젝트 파일로 다시 확인한다.
- 필요한 부분만 수정하고, 불필요한 리팩토링은 피한다.
- 변경 파일과 변경 이유를 짧게 남긴다.
- 버전 관련 변경이 있으면 `APP_VERSION` 값을 수동 수정하지 말고, 자동 생성 방식을 유지한다.
- 배포/릴리즈 성격의 큰 변경이면 최근 변경 내역에 버전/빌드 영향 여부를 한 줄 적는다.
- `AI_WIKI`는 짧고 사실 위주로 유지한다. 긴 산문보다 함정, 결정 이유, 운영 규칙을 우선 기록한다.
- 큰 작업 후에는 `AI_WIKI/update-log.md`에 4줄 요약을 남긴다.
- 우선적으로 참고할 핵심 문서는 `AI_WIKI/frontend.md`, `AI_WIKI/ops.md`, `AI_WIKI/update-log.md`다.

## Copy Template

```md
이 프로젝트는 DayMate 앱입니다.

기술스택:
- React + Vite
- Firebase Auth / Firestore
- Vercel 배포
- PWA 웹앱

작업 원칙:
- 기존 구조 최대한 유지
- 불필요한 리팩토링 금지
- 변경 파일과 변경 이유를 명확히 설명
- 전체 파일을 새로 쓰지 말고 필요한 부분만 수정
- AI_WIKI는 짧은 사실/결정/함정 위주로 유지
- 큰 작업 후 AI_WIKI/update-log.md에 4줄 로그 추가
- 먼저 AI_WIKI/frontend.md, AI_WIKI/ops.md, AI_WIKI/update-log.md 확인

현재 작업:
- [여기에 현재 작업]

최근 변경:
- [여기에 최근 변경]
- [버전/빌드에 영향 있으면 한 줄 추가]

문제:
- [여기에 문제]

요청:
- [여기에 원하는 수정]
```

## Recommended Additions
- AI 위키 우선 읽기:
	- `AI_WIKI/overview.md`
	- `AI_WIKI/frontend.md`
	- `AI_WIKI/ops.md`
	- `AI_WIKI/telegram.md`
	- `AI_WIKI/decisions.md`
	- `AI_WIKI/known-issues.md`
	- `AI_WIKI/update-log.md`
- 참고 파일: [관련 파일 경로]
- 검증 방법: [빌드 / 테스트 / 수동 확인 방법]
- 제외 범위: [이번 작업에서 건드리지 말아야 할 것]
- 운영 상태: [Mac이 텔레그램 개발 봇 호스트인지 등]

## Example

```md
이 프로젝트는 DayMate 앱입니다.

기술스택:
- React + Vite
- Firebase Auth / Firestore
- Vercel 배포
- PWA 웹앱

작업 원칙:
- 기존 구조 최대한 유지
- 불필요한 리팩토링 금지
- 변경 파일과 변경 이유를 명확히 설명
- 전체 파일을 새로 쓰지 말고 필요한 부분만 수정

현재 작업:
- 텔레그램 개발 봇이 현재 실행 중인 OS를 혼동하지 않게 정리

최근 변경:
- telegram_agent.py에 search_files 도구 추가
- read_file이 줄 범위를 받도록 수정
- Vercel 토큰을 .env.local 환경변수로 이동
- 버전 문자열은 build 시 자동 생성되므로 수동 변경하지 않음

문제:
- 시스템 프롬프트에 Windows 고정 문구가 있어 Mac에서 동작해도 혼란스러운 설명이 나옴

요청:
- 텔레그램 개발 봇 프롬프트에서 OS를 단정하지 않도록 수정
- 변경 파일과 이유를 짧게 설명
```