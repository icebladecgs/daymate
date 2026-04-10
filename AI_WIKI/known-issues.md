# Known Issues

## PWA Cache Staleness
- 증상: 배포 후에도 버전/화면이 예전 상태로 보임
- 원인: 서비스워커 캐시와 설치형 앱의 늦은 교체
- 대응: 캐시 키를 빌드별로 바꾸고 업데이트 배너 + skip waiting 흐름 사용

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
