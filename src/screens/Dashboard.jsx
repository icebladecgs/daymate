import { Suspense } from "react";
import S from "../styles.js";

// PC 대시보드 — 틀만 있는 화면. 칸 안에는 실제 오늘·달력·메모 화면과 주간 일정 부품을 그대로 넣는다(App.jsx).
// 할일·메모 동작을 여기에 다시 만들지 않는다: 기본 화면을 고치면 대시보드도 저절로 같이 바뀌게 하기 위함.
// 칸 바로 아래 화면의 zIndex를 풀어야 달력 미리보기 같은 창이 옆 칸 뒤로 숨지 않는다.
const CSS = `
.dm-dash { position: fixed; inset: 0; z-index: 150; display: flex; flex-direction: column; background: var(--dm-bg); }
.dm-dash-grid { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(300px, 1fr)); overflow-x: auto; }
.dm-dash-col { min-height: 0; min-width: 0; display: flex; flex-direction: column; overflow-y: auto; border-right: 1px solid var(--dm-border); }
.dm-dash-col:last-child { border-right: none; }
.dm-dash-col > * { z-index: auto !important; }
.dm-dash .dm-cal-sheet { max-width: 560px; margin: 0 auto; }
.dm-dash-week { flex: 0 1 auto; max-height: 58%; min-height: 0; overflow-y: auto; padding: 14px 16px; border-bottom: 1px solid var(--dm-border); box-sizing: border-box; }
.dm-dash-memo { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.dm-dash-memo .dm-memo-panel { position: static !important; transform: none !important; max-width: none !important; flex: 1; min-height: 0; z-index: auto !important; }
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
        <div className="dm-dash-col"><Suspense fallback={loading}>{today}</Suspense></div>
        <div className="dm-dash-col"><Suspense fallback={loading}>{calendar}</Suspense></div>
        <div className="dm-dash-col" style={{ overflowY: "hidden" }}>
          <div className="dm-dash-week">
            <div style={{ fontSize: 17, fontWeight: 900, color: "var(--dm-text)", marginBottom: 10, fontFamily: S.sectionTitle.fontFamily }}>이번 주 할일</div>
            {week}
          </div>
          <div className="dm-dash-memo"><Suspense fallback={loading}>{memo}</Suspense></div>
        </div>
      </div>
    </div>
  );
}
