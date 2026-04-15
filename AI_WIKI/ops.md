# Ops

## Build / Version
- `npm run build` 전에 `npm run generate:version`이 자동 실행된다.
- `scripts/generate-version.mjs`가 `src/version.js`와 관련 메타를 생성한다.
- Vercel에서 git count를 못 읽는 경우를 대비한 버전 보존 로직이 들어가 있다.

## Deploy
- 프로덕션 URL: `https://daymate-beta.vercel.app`
- 일반 배포 명령: `vercel deploy --prod --yes`

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
