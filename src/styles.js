const S = {
  // 검색/일기/메모/긴메모 등 전체화면 편집 오버레이 — .phone과 동일한 430px 폭으로 고정
  fullScreenPanel: (bottom = 0) => ({
    position: "fixed",
    top: 0,
    bottom,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 430,
    background: "var(--dm-bg)",
    zIndex: 500,
    display: "flex",
    flexDirection: "column",
  }),
  app: {
    background: "var(--dm-bg)",
    color: "var(--dm-text)",
    fontFamily: "'Pretendard Variable','Pretendard','Inter','Apple SD Gothic Neo',sans-serif",
    minHeight: "100vh",
    width: "100%",
  },
  phone: {
    width: "100%",
    maxWidth: 430,
    minHeight: "100vh",
    margin: "0 auto",
    background: "var(--dm-phone)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 0 60px rgba(0,0,0,.5)",
    position: "relative",
  },
  content: {
    flex: 1,
    width: "100%",
    minWidth: 0,
    overflowY: "auto",
    overflowX: "hidden",
    paddingBottom: 90,
    boxSizing: "border-box",
    position: "relative",
    zIndex: 1,
  },
  topbar: {
    padding: "18px 20px 12px",
    borderBottom: "1px solid var(--dm-border)",
    background: "var(--dm-nav)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    position: "relative",
    zIndex: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: 900,
    fontFamily: "inherit", // 앱 글꼴(Pretendard)을 따른다 — 예전 Plus Jakarta Sans는 한글이 없어 제목 한글만 기기 글꼴로 나왔다 (2026-11-09)
    background: "var(--dm-title-grad)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  },
  sub: { fontSize: 12, color: "var(--dm-sub)", marginTop: 2 },
  card: {
    background: "var(--dm-card)",
    border: "1px solid var(--dm-card-line, rgba(255,255,255,0.06))",
    borderRadius: 20,
    padding: "14px 14px",
    margin: "0 16px 10px",
    boxSizing: "border-box",
    backdropFilter: "blur(16px)",
    WebkitBackdropFilter: "blur(16px)",
    boxShadow: "var(--dm-card-shadow, 0 4px 24px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.07))",
    position: "relative",
    zIndex: 1,
    transition: "box-shadow 0.2s ease, transform 0.2s ease",
  },
  sectionTitle: {
    padding: "22px 16px 8px",
    fontSize: 17,
    letterSpacing: "0.01em",
    color: "var(--dm-text)",
    fontWeight: 900,
    fontFamily: "inherit", // 앱 글꼴(Pretendard)을 따른다 — 예전 Plus Jakarta Sans는 한글이 없어 제목 한글만 기기 글꼴로 나왔다 (2026-11-09)
    textTransform: "none",
    display: "flex",
    alignItems: "center",
    gap: 8,
    position: "relative",
    zIndex: 1,
  },
  sectionEmoji: {
    fontSize: 22,
    lineHeight: 1,
  },
  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    background: "var(--dm-input)",
    border: "1.5px solid var(--dm-border)",
    color: "var(--dm-text)",
    fontSize: 14,
    fontFamily: "inherit",
    outline: "none",
    boxSizing: "border-box",
    wordBreak: "break-word",
    overflowWrap: "break-word",
  },
  btn: {
    width: "100%",
    marginTop: 10,
    padding: "13px 14px",
    borderRadius: 12,
    border: "none",
    background: "var(--dm-btn-bg, linear-gradient(135deg, #4B6FFF, #818cf8))",
    color: "#fff",
    fontSize: 14,
    fontWeight: 900,
    cursor: "pointer",
    fontFamily: "inherit",
    boxShadow: "0 4px 20px var(--dm-accent-soft, rgba(75,111,255,.35)), inset 0 1px 0 rgba(255,255,255,.15)",
    letterSpacing: "0.01em",
  },
  btnGhost: {
    width: "100%",
    marginTop: 10,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1.5px solid var(--dm-border2)",
    background: "rgba(255,255,255,0.04)",
    color: "var(--dm-sub)",
    fontSize: 14,
    fontWeight: 800,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  pill: (on) => ({
    padding: "7px 12px",
    borderRadius: 999,
    border: `1.5px solid ${on ? "var(--dm-accent-soft, rgba(108,142,255,.5))" : "var(--dm-border)"}`,
    background: on ? "var(--dm-accent-soft, rgba(108,142,255,.15))" : "var(--dm-pill-off)",
    color: on ? "#818cf8" : "var(--dm-sub)",
    fontSize: 12,
    fontWeight: 800,
    cursor: "pointer",
    whiteSpace: "nowrap",
  }),
  bottomNav: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 430,
    boxSizing: "border-box",
    background: "var(--dm-nav)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderTop: "none",
    borderRadius: "24px 24px 0 0",
    padding: "10px 8px 26px",
    display: "flex",
    justifyContent: "space-around",
    zIndex: 100,
    boxShadow: "0 -4px 32px var(--dm-accent-soft, rgba(75, 111, 255, 0.18))",
  },
  navItem: (active) => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    color: active ? "var(--dm-nav-active)" : "var(--dm-muted)",
    cursor: "pointer",
    padding: "6px 14px",
    borderRadius: 16,
    border: "none",
    background: active ? "var(--dm-nav-active-bg)" : "transparent",
    boxShadow: active ? "inset 0 0 0 1px var(--dm-nav-active-ring)" : "none",
    fontFamily: "inherit",
    transition: "all 0.2s ease",
    fontWeight: active ? 700 : 500,
    position: "relative",
  }),
  toast: {
    position: "fixed",
    bottom: 105,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--dm-toast-bg)",
    border: "1px solid var(--dm-toast-bd)",
    color: "#4ADE80",
    padding: "10px 18px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: 800,
    zIndex: 999,
    boxShadow: "0 4px 16px rgba(0,0,0,.35)",
    backdropFilter: "blur(12px)",
    WebkitBackdropFilter: "blur(12px)",
  },
};

export default S;

// UI 기준값 (2026-11-07, docs/UX-GUIDE.md와 같은 값 — 문서를 고치면 여기도, 여기를 고치면 문서도 고친다)
// 새 칸·화면은 숫자를 직접 쓰지 말고 이 값을 쓴다. 기존 화면은 탭별로 올릴 때 차례로 옮긴다(한꺼번에 바꾸지 않는다).
// 글씨 크기 기본값 large에서는 .dm-phone에 zoom 1.1이 걸려 화면에서 1.1배로 보인다.
export const UI = {
  gutter: 16,          // 화면 좌우 바깥 여백 (S.card margin)
  box: { radius: 20, pad: 14, gap: 12 }, // 새 디자인 둥근 칸(boxCard): 모서리·안쪽 여백·칸 사이
  titleGap: 16,        // 칸 제목 아래 여백 — 오늘 탭 secTitle. 제목 바로 밑에 내용을 붙이지 않는다
  headingGap: 14,      // SectionHeading(My 탭 계열) 제목 아래 여백
  controlGap: 14,      // 제목 줄 아래 한 줄짜리 조작부(‹ 날짜 › 등) 앞에 더 두는 여백 — 주간 일정
  rowGap: 10,          // 목록 줄 사이(습관 칸·주간 일정)
  rowGapDense: 5,      // 줄을 빽빽하게 보여 주는 곳(PC 대시보드 이번 주 할일)
  rowPadY: 10,         // 구분선 있는 줄의 위아래 안쪽 여백(언젠가할일)
  // 글자 크기 5단계 (2026-11-09 사용자 확정 — 화면마다 제목이 내용보다 작은 곳이 많았다). 새 디자인은 이 값만 쓴다. UX-GUIDE 2장
  pageTitle: 22,       // 화면 제목(맨 위 My·설정·커뮤니티…) — S.title에 dm-page-title 표시를 달면 index.css가 새 디자인에서 이 크기로
  title: 19,           // 칸 제목(굵게) (2026-11-07 사용자 확정)
  group: 17,           // 칸 안 묶음 이름(인생목표·올해 목표, 설정 "핵심 설정" 등, 굵게)
  item: 16,            // 목록 한 줄(할일·습관·언젠가할일·주간 일정·목표 항목). 2026-11-09 할일 17→16 ("할일 글씨가 너무 크다")
  sub: 13,             // 보조 글씨 최소 크기(CLAUDE.md 14.7). 아직 못 옮긴 화면에 9~12가 남아 있다 — 가이드 7장
  touch: 40,           // 새로 만드는 버튼의 누르는 칸 최소(2026-11-07 사용자 확정). 기존 작은 버튼은 탭별로 올릴 때 키운다
  chip: 34,            // 칩·보조 버튼 높이 (지금 코드의 값, 사용자 확정 아님)
  accent: 'var(--dm-accent, #5B7CFA)',   // 강조(파랑) — 밝은·어두운 화면 모두 보이는 색
  accent2: '#8B5CF6',  // 강조(보라)
};

// 기능별 둥근 칸 (2026-11-05) — S.card와 같은 모양이지만 쌓임 맥락을 만들지 않는다
// (backdropFilter·zIndex가 있으면 칸 안의 position: fixed 창이 칸에 갇히거나 아래 메뉴에 가려진다)
export const boxCard = { ...S.card, backdropFilter: "none", WebkitBackdropFilter: "none", position: "static", zIndex: "auto", marginBottom: UI.box.gap };
