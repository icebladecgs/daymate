# Known Issues

## PWA Cache Staleness
- 증상: 배포 후에도 버전/화면이 예전 상태로 보임
- 원인: 서비스워커 캐시와 설치형 앱의 늦은 교체
- 대응: 캐시 키를 빌드별로 바꾸고 업데이트 배너 + skip waiting 흐름 사용
- **주의: 버전이 안 바뀌어 보이면 이 문제로 단정하지 말 것.** 아래 "Deploy Pipeline Silent Failure" 항목처럼 배포 자체가 실패했을 수도 있다. `curl -s https://daymate-beta.vercel.app/`로 서버 원본을 직접 확인해 캐시 문제인지 배포 자체가 안 된 건지 먼저 구분한다.

## Deploy Pipeline Silent Failure ✅ 2026-07-17 발견/수정
- 증상: 버전이 v404에서 3주 이상 안 올라감. 그 사이 커밋(v405~v427, `fdca1c2`/`19334f9` 등)은 GitHub엔 push됐지만 프로덕션엔 전혀 반영 안 됨
- 원인 두 가지가 겹침:
  1. `fdca1c2`(v422, 잠금화면 아침 알림)이 `vercel.json`에 하루 6회 실행되는 cron(`0,30 21,22,23 * * *`)을 추가했는데, Vercel Hobby 플랜은 cron이 하루 1회를 넘으면 배포 자체를 거부한다 — 이 커밋 이후 모든 `vercel deploy`가 실패
  2. 비슷한 시기(6/22) `VERCEL_TOKEN`이 만료되어 CLI 인증 자체도 안 됐음
  3. (부수 발견) `.vercelignore`가 없어서 `node_modules`(300MB+)까지 업로드되며 100MB 파일 크기 제한에도 걸림
- 아무도 배포 실패를 못 알아챈 이유: "GitHub push만 하면 자동 배포된다"는 잘못된 가정이 퍼져 있었음(실제로는 이 프로젝트에 GitHub-Vercel 자동 연동이 없음). 배포 후 실제 반영 여부를 검증하는 습관이 없었음
- 대응: push-morning cron을 하루 1회(07:00 KST 고정)로 축소, `.vercelignore` 추가, 새 토큰 발급. [[ops]]의 Deploy 섹션에 수동 배포 절차 + 검증 명령 정리함
- 후유증: push-morning(잠금화면 아침 할일 알림)이 이제 사용자 지정 알람 시간과 무관하게 07:00 KST에만 발송됨(이전엔 06:00~08:30 사이 사용자 설정 시간에 맞춰 발송). 사용자가 07:00 외 시간을 쓰고 있다면 알림이 안 갈 수 있음 — 확인 필요. 유연한 시간을 되살리려면 Vercel Pro 업그레이드 필요

## Cron/Push Infra Is Single-User Only (2026-09-21 발견)
- 증상 아님, **설계 제약**: "실제 알림(앱을 닫아도 오는 알림)이 필요한 기능"을 새로 만들 때 착각하기 쉬운 함정
- 현재 `api/push-morning.js`, `api/push-cron.js`, `api/smart-notify.js` 등 Vercel Cron으로 도는 함수들은 전부 `process.env.FIREBASE_USER_UID`(개발자 본인 uid)와 `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`에 고정돼 있다 — **여러 사용자를 대상으로 한 스케줄 알림이 아니라 개발자 개인 계정 전용**이다
- Web Push 자체(구독→저장→`api/push.js`로 1회성 발송)는 사용자별로 이미 되지만, "누구든 특정 시각에 자동으로 발송"해주는 사용자별 스케줄/큐는 없다
- 반대로 텔레그램 봇 대화(`api/telegram-webhook.js`)는 `tg_users` 컬렉션으로 사용자별 매핑이 돼 있어 진짜 멀티유저다 — 다만 사용자가 먼저 말을 걸어야 반응하는 방식이라 "능동적으로 먼저 알려주는" 용도로는 못 쓴다
- 새 기능에서 "생일 되면 알림 보내줘" 같은 요청을 받으면, 이 제약 때문에 지금 인프라로는 개발자 계정 하나만 가능하다는 걸 먼저 설명하고, 필요하면 사용자별 스케줄 인프라를 새로 만들지 말지부터 확인할 것

## Vercel Version Fallback
- 증상: 버전이 `v0`처럼 보일 수 있음
- 원인: 배포 환경에서 git metadata 부족
- 대응: 이전 생성 버전을 보존하는 fallback 사용

## Telegram Polling Conflict
- 증상: 봇이 바로 종료되거나 충돌
- 원인: Mac/Windows 동시 실행
- 대응: 한 머신만 활성화

## Large Home File Risk
- 증상: 홈 관련 변경 시 충돌/회귀 가능성 높음
- 원인: `Home.jsx`가 여전히 큼
- 대응: 새 기능은 가능하면 `src/components/home/`로 이동

## Home Customization Drag Instability
- 증상: 홈 구성 팝업에서 길게 눌러 섹션을 드래그해도 모바일/PWA에서 동작하지 않거나 매우 불안정함
- 원인: `dnd-kit` PointerSensor가 `touchstart → pointermove` 체인에 의존하는데, 모달 내 `overflow-y: auto` 스크롤 컨테이너가 `touchmove`를 가로채 드래그 핸들이 포인터를 잃음. iOS PWA standalone 모드에서 SafeArea + `position: fixed` 조합이 scroll-lock도 방해함
- 대응: 드래그를 포기하고 토글 + 위/아래 버튼 정렬 방식으로 단순화함. 8개 섹션 기준으로 화살표 방식 충분. 드래그를 복원하려면 모달 스크롤을 제거하거나 SortableContext를 모달 밖으로 빼야 함

## Monthly Goals Legacy Fallback ✅ 수정 완료
- 증상: 3월/4월 등 다른 월을 선택해도 월별 목표가 동일하게 보일 수 있음
- 원인: `goals.month` 레거시 fallback이 이미 `goals.months` 구조를 쓰는 데이터에도 다시 적용됨
- 대응: `src/utils/goals.js`의 `normalizeGoals()`에서 `hasStructuredMonths` 가드 추가. structured `months`가 있을 때는 레거시 fallback 미적용
- 자동 마이그레이션 불필요: `setMonthGoals()` 최초 호출 시 `months[YYYY-MM]` 구조로 자연 전환됨
