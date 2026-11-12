// 설정 찾기 (2026-11-05) — 설정 화면 항목 목록. 새 설정을 만들면 여기에도 한 줄 넣는다.
// page: 열 하위 화면, section: 열고 나서 내려갈 제목 글자(없으면 맨 위), words: 다른 말로 찾을 때 쓰는 단어
export const SETTINGS_PAGE_NAMES = {
  profile: "프로필 & 목표",
  recurring: "반복 할일",
  voiceDiaryQuestions: "AI 일기 질문",
  notifications: "알림 설정",
  telegram: "텔레그램 자동화",
  integrations: "Google 연동",
  friends: "친구 & 공유",
  app: "앱 관리",
};

export const ITEMS = [
  { page: "profile", label: "이름", section: "이름", words: "닉네임 프로필" },
  { page: "profile", label: "생년월일시", section: "생년월일시", words: "운세 사주 생일 출생시간" },
  { page: "profile", label: "연간 목표", section: "연간 목표", words: "올해 목표" },
  { page: "app", label: "출퇴근 시간", section: "출퇴근 시간", words: "출근 퇴근 근무 시간 퇴근 전 체크 오늘 양 나중에" },
  { page: "recurring", label: "반복 할일", words: "매일 요일 매주 매월 그만하기" },
  { page: "voiceDiaryQuestions", label: "AI 일기 질문", words: "음성 일기 녹음 말 AI와 일기 쓰기" },
  { page: "notifications", label: "할일·메모 알람", section: "할일·메모 알람", words: "알람 시간 정각 5분 전 10분 전" },
  { page: "notifications", label: "알림 켜기·끄기", section: "알림 ON/OFF", words: "푸시 권한 잠금화면" },
  { page: "notifications", label: "커뮤니티 채팅 알림", section: "커뮤니티 채팅 알림", words: "소셜 메시지 푸시" },
  { page: "notifications", label: "소리·진동", section: "소리 / 진동", words: "벨소리 무음 알림음" },
  { page: "notifications", label: "알림 시간", section: "알림 시간 설정", words: "아침 브리핑 잠금화면 아침 알림 기상 점심 저녁 밤 체크인" },
  { page: "notifications", label: "음성 알람", section: "음성 알람", words: "TTS 읽어주기" },
  { page: "telegram", label: "텔레그램 연결·브리핑", words: "봇 아침 자산 날씨 도시" },
  { page: "integrations", label: "구글 로그인·계정 동기화", section: "계정 동기화", words: "로그아웃 계정 로그인 구글" },
  { page: "integrations", label: "구글 캘린더", section: "구글 캘린더", words: "일정 연동 달력" },
  { page: "integrations", label: "구글 드라이브", section: "구글 드라이브", words: "파일 첨부 메모 저장 연동" },
  { page: "friends", label: "친구 초대", section: "친구 초대", words: "초대 코드" },
  { page: "friends", label: "친구에게 공유하기", section: "친구에게 공유하기", words: "링크" },
  { page: "app", label: "앱 설치", section: "앱 설치", words: "홈 화면 다운로드 PWA" },
  { page: "app", label: "백업·복구", section: "백업 & 복구", words: "저장 내보내기 가져오기 드라이브" },
  { page: "app", label: "앱 잠금", words: "비밀번호 지문 얼굴 잠그기 보안" },
  { page: "app", label: "수험생 모드", words: "시험 공부 오답 노트 D-day" },
  { page: "app", label: "화면 크기", section: "화면 디자인", words: "글씨 크기 글자 크게 작게 확대 배율 줌 100 110 120 130 눈" },
  { page: "app", label: "새 디자인", section: "화면 디자인", words: "화면 모양 예전 끝낸 할 일 완료 모으기" },
  { page: "app", label: "오늘 탭 칸 순서", section: "오늘 탭 칸 순서", words: "순서 위치 옮기기" },
  { page: "app", label: "협동 보스전", section: "협동 보스전", words: "보스 레이드 커뮤니티 게임 숨기기" },
  { page: "app", label: "오늘 탭에 보일 칸", section: "오늘 탭에 보일 칸", words: "숨기기 끄기 날씨 습관 언젠가 주간 내일 미리보기 저녁" },
  { page: "app", label: "성장 능력치", section: "성장 능력치", words: "XP 레벨 내 단어 스탯" },
  { page: "app", label: "메모 입력", section: "메모 입력", words: "자동완성 목록 번호 단축키" },
  { page: "app", label: "고급 설정", section: "고급 설정", words: "이벤트" },
  { page: "app", label: "모든 데이터 삭제", section: "위험 작업", words: "초기화 지우기 위험" },
];

const norm = (s) => (s || "").normalize("NFC").toLowerCase().replace(/\s+/g, "");

// 검색어가 없으면 null (메뉴를 그대로 보여 준다)
export function searchSettings(query) {
  const q = norm(query);
  if (!q) return null;
  return ITEMS.filter((it) => norm(`${it.label} ${it.words || ""} ${SETTINGS_PAGE_NAMES[it.page]}`).includes(q));
}
