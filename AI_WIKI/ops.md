# Ops

## Build / Version
- `npm run build` 전에 `npm run generate:version`이 자동 실행된다.
- `scripts/generate-version.mjs`가 `src/version.js`와 관련 메타를 생성한다.
- Vercel에서 git count를 못 읽는 경우를 대비한 버전 보존 로직이 들어가 있다.

## Deploy
- 프로덕션 URL: `https://daymate-beta.vercel.app`
- **GitHub push만으로는 배포되지 않는다.** 이 프로젝트는 GitHub-Vercel 자동 연동이 안 되어 있다. `git push` 후 반드시 아래 명령을 수동 실행해야 실제 프로덕션에 반영된다.
- 배포 명령: `TOKEN=$(sed -n 's/^VERCEL_TOKEN=//p' .env.local); vercel deploy --prod --yes --token "$TOKEN"`
- 배포 후 검증(브라우저/PWA 캐시에 속지 말고 서버 원본을 직접 확인): `curl -s https://daymate-beta.vercel.app/ | grep -oE 'assets/index-[A-Za-z0-9_-]+\.js'` 로 번들 해시를 뽑고, 그 JS 파일에서 `202[0-9]-[0-9]{2}-[0-9]{2}.*\([a-f0-9]{7}\)` 패턴을 grep해 커밋 해시/시각이 방금 만든 커밋과 일치하는지 확인
- `VERCEL_TOKEN`은 `.env.local`에 저장(gitignore됨). **조용히 만료될 수 있다** — 2026-06-22에 만료된 채 아무도 몰라서 3주간(v405~v427) 모든 배포가 실패한 채 방치된 적 있음([[known-issues]] 참고). `vercel whoami --token "$TOKEN"` 이 실패하면 https://vercel.com/account/tokens 에서 "No Expiration"으로 재발급
- `.vercelignore` 필수 — 없으면 `node_modules`(300MB+)까지 업로드되어 Vercel 100MB 파일 크기 제한에 걸려 배포가 실패한다
- `vercel.json`의 `crons`는 Hobby 플랜에서 **각 cron이 하루 1회를 초과하면 그 순간부터 이후 모든 배포가 실패한다.** cron 스케줄 추가/수정 시 24시간 내 1회 이하인지 항상 확인. 에러 메시지는 뜨지만 지켜보는 사람이 없으면 아무도 못 알아챔 → 배포 후 검증 단계를 절대 생략하지 말 것

## Admin Access
- 관리자 접근 기준은 `.env.local`의 `VITE_ADMIN_UID` 단일 값이다.
- 설정의 관리자 진입 버튼, 직접 `screen=admin` 접근 차단, 챌린지 종료/삭제 권한이 같은 기준을 사용한다.
- 다른 머신에서 이어받을 때도 같은 `VITE_ADMIN_UID`를 넣지 않으면 관리자 관련 기능이 모두 막힌다.

## PWA / Cache
- 서비스워커 캐시 키는 빌드별로 바뀐다.
- 설치형 앱 업데이트 흐름:
  - 새 서비스워커 설치 감지
  - 앱에서 업데이트 배너 표시
  - `SKIP_WAITING` 메시지로 즉시 교체
  - `controllerchange` 후 새로고침
- 업데이트 배너는 최근에 더 불투명한 스타일로 조정했다.

## Navigation / Scroll
- 화면 전환 시 현재 스크롤 가능한 루트를 찾아 `scrollTop = 0`으로 초기화한다.
- 달력 탭 진입 시 맨 위에서 시작하도록 최근 수정했다.
