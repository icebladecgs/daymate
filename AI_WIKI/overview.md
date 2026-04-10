# Overview

## Product
- DayMate는 개인 할일, 습관, 일기/메모, 커뮤니티, 챌린지, 텔레그램 자동화를 묶은 React + Vite 기반 PWA다.

## Stack
- Frontend: React 19, Vite 7
- Data: Firebase Auth / Firestore
- Deploy: Vercel
- Automation: Python `telegram_agent.py`
- PWA: `public/sw.js`, `manifest.json`

## Important Directories
- `src/screens/`: 주요 화면
- `src/components/`: 공용 UI
- `src/data/`: 클라이언트 도메인 모델/통계 계산
- `src/api/`: 브라우저 클라이언트용 연동 코드
- `api/`: Vercel 서버리스 함수
- `scripts/`: 버전 생성, 텔레그램 헬퍼 스크립트
- `AI_WIKI/`: AI 전용 지식 레이어

## Current Operating Rules
- 텔레그램 개발 봇은 한 머신에서만 실행한다.
- 현재 상시 호스트는 Mac이다.
- Windows에서는 필요할 때만 수동 실행한다.
- 버전 문자열은 수동 수정하지 않고 `scripts/generate-version.mjs`가 생성한다.

## Current Focus Areas
- 홈 화면 커스터마이징과 드래그 UX
- 설치형 앱 업데이트 흐름 개선
- 커뮤니티/챌린지 UX 품질 향상
- AI 문맥 축적 자동화
