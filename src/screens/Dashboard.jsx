import { Suspense } from "react";
import S from "../styles.js";

// PC 대시보드 — 틀만 있는 화면. 칸 안에는 실제 오늘·달력·메모 화면과 주간 일정 부품을 그대로 넣는다(App.jsx).
// 할일·메모 동작을 여기에 다시 만들지 않는다: 기본 화면을 고치면 대시보드도 저절로 같이 바뀌게 하기 위함.
// 칸 바로 아래 화면의 zIndex를 풀어야 달력 미리보기 같은 창이 옆 칸 뒤로 숨지 않는다.
const CSS = `
html:has(.dm-dash) { overflow: hidden; }
.dm-dash { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; background: var(--dm-bg); }
.dm-dash-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(320px, 1fr) minmax(400px, 1.7fr) minmax(300px, 1.15fr); overflow-x: auto; }
@media (min-width: 1500px) { .dm-dash-grid { zoom: 1.1; } }
/* 좁은 창(윈도우 배율 130%·화면 크기 120~130%로 앱이 받는 폭이 줄 때)에도 세 칸이 다 들어가게 — 1240 창 100%는 그대로 (2026-11-11) */
@media (max-width: 1180px) { .dm-dash-grid { grid-template-columns: minmax(265px, 1fr) minmax(340px, 1.7fr) minmax(250px, 1.15fr); } }
@media (max-width: 1290px) { [data-font="s120"] .dm-dash-grid { grid-template-columns: minmax(265px, 1fr) minmax(340px, 1.7fr) minmax(250px, 1.15fr); } }
@media (max-width: 1400px) { [data-font="s130"] .dm-dash-grid { grid-template-columns: minmax(265px, 1fr) minmax(340px, 1.7fr) minmax(250px, 1.15fr); } }
.dm-dash-col { min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; border-right: 1px solid var(--dm-border); }
.dm-dash-col:last-child { border-right: none; }
.dm-dash-col > *, .dm-dash-today > * { z-index: auto !important; }
.dm-dash .dm-cal-sheet { max-width: 560px; margin: 0 auto; }
.dm-dash-today > * { flex: 0 0 auto !important; overflow: visible !important; padding-bottom: 0 !important; }
.dm-dash-week { padding: 14px 16px 24px; box-sizing: border-box; }
.dm-dash-memo { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dm-dash-memo .dm-memo-panel { position: static !important; transform: none !important; max-width: none !important; flex: 1; min-height: 0; z-index: auto !important; }
.dm-dash .dm-cal-cell { min-height: 112px !important; padding: 5px 3px 6px !important; }
.dm-dash .dm-cal-day { font-size: 15px !important; }
.dm-dash .dm-cal-chip { font-size: 12px !important; line-height: 1.35 !important; padding: 1px 4px !important; margin-bottom: 2px !important; }
/* 1240 창에서 앞 몇 글자만 보이던 것 — 대시보드에서만 두 줄까지 줄바꿈 (2026-11-11) */
.dm-dash .dm-cal-chip { white-space: normal !important; word-break: keep-all; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
/* 메모 칸 맨 위 아이콘 줄: 좁은 칸(1240 창)에서 "저장"이 잘려서 대시보드에서만 간격을 줄인다 (2026-11-11 사용자 선택) */
.dm-dash .dm-memo-head { gap: 0 !important; flex-wrap: wrap; row-gap: 6px !important; padding-left: 10px !important; padding-right: 10px !important; }
.dm-dash .dm-memo-head > button[aria-label] { width: 32px !important; }
.dm-dash .dm-cal-more { font-size: 11px !important; }
`;

const loading = <div style={{ padding: 24, textAlign: "center", color: "var(--dm-muted)", fontSize: 14 }}>불러오는 중...</div>;
const barBtn = { padding: "8px 14px", borderRadius: 10, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", marginTop: 0 };

export default function Dashboard({ today, calendar, week, memo, onClose, onOpenManager }) {
  return (
    <div className="dm-dash">
      <style>{CSS}</style>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderBottom: "1px solid var(--dm-border)", background: "var(--dm-nav)", flexShrink: 0 }}>
        <div style={{ flex: 1, minWidth: 0, fontSize: 18, fontWeight: 900, color: "var(--dm-text)", fontFamily: S.sectionTitle.fontFamily }}>대시보드</div>
        <button onClick={onOpenManager} style={barBtn}>🗂 메모 관리자</button>
        <button onClick={onClose} style={barBtn}>✕ 닫기</button>
      </div>
      <div className="dm-dash-grid">
        <div className="dm-dash-col">
          <div className="dm-dash-today"><Suspense fallback={loading}>{today}</Suspense></div>
          <div className="dm-dash-week">
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--dm-text)", marginBottom: 10, fontFamily: S.sectionTitle.fontFamily }}>이번 주 할일</div>
            {week}
          </div>
        </div>
        <div className="dm-dash-col"><Suspense fallback={loading}>{calendar}</Suspense></div>
        <div className="dm-dash-col" style={{ overflowY: "hidden" }}>
          <div className="dm-dash-memo"><Suspense fallback={loading}>{memo}</Suspense></div>
        </div>
      </div>
    </div>
  );
}
