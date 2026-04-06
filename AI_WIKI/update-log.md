# Update Log

작업 내역을 짧게 누적하는 로그.

## Template
### YYYY-MM-DD HH:MM
- 변경 사항
- 버전/빌드 영향: 있음/없음
- 검증 결과
- 다음 작업자 메모

## Entries

### 2026-04-06 (Windows → Mac 머지 필요, origin/main 기준 13 commits ahead)
- 초대 플로우 개선 및 에이전트 ops 정비
- 브랜드 레이블 통일
- 인스톨 배너 클릭 가능 + 우선순위 조정
- **오늘 습관 드래그 순서 변경 기능 추가** (`@dnd-kit/core`, `@dnd-kit/sortable` 의존성 신규 추가)
- **비공개 커뮤니티 4자리 암호 기능** — 서버사이드 검증 (`joinPublicCommunity`)
- `mode` useEffect ReferenceError 수정
- Vercel 빌드 버전 보존 / 캐시 버전 갱신 수정
- `index.html`, `sw.js`, `vite.config` 변경사항 누락 커밋 포함
- 버전/빌드 영향: 있음 (dnd-kit 패키지 추가, vite.config 변경)
- 검증 결과: Vercel 빌드 재시도 포함, 최종 커밋 d5f488d
- 다음 작업자 메모: Mac에서 `git pull && npm install` 필수 (dnd-kit 신규 패키지)

### 2026-04-05
- AI 세션 복원용 AI_WIKI 구조 추가 (README, update-log)
- 루트 MEMORY.md 인덱스 추가
- Mac/HandOff 문서의 시작 프롬프트를 AI_WIKI 기준으로 정렬
- 버전/빌드 영향: 없음
- 검증 결과: 문서 경로 존재 확인 및 시작 문구 반영 확인
- 다음 작업자 메모: 이후 큰 변경 시 HANDOFF.md와 본 로그를 함께 갱신
