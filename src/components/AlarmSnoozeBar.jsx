import { createPortal } from "react-dom";
import { snoozeOptions } from "../utils/alarms.js";

// 할일 알림이 울리면 앱 위쪽에 뜨는 "나중에" 띠 (2026-11-06) — 메모 관리자(900)·대시보드 위에서도 보이게 앱 루트에 그린다
export default function AlarmSnoozeBar({ items, workHours, onSnooze, onClose }) {
  if (!items.length) return null;
  const item = items[0];
  const btn = { height: 34, padding: "0 10px", marginTop: 0, borderRadius: 9, border: "1px solid rgba(91,124,250,.45)", background: "rgba(91,124,250,.12)", color: "#5B7CFA", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" };
  return createPortal(
    <div role="status" style={{ position: "fixed", top: 10, left: "50%", transform: "translateX(-50%)", zIndex: 960, width: "calc(100% - 24px)", maxWidth: 406, boxSizing: "border-box", padding: "10px 12px", borderRadius: 14, background: "var(--dm-bg)", border: "1.5px solid rgba(91,124,250,.55)", boxShadow: "0 8px 28px rgba(0,0,0,.28)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: "var(--dm-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>⏰ {item.body}</span>
        {items.length > 1 && <span style={{ flexShrink: 0, fontSize: 13, color: "var(--dm-muted)" }}>외 {items.length - 1}개</span>}
        <button onClick={() => onClose(item)} aria-label="알림 닫기" style={{ width: 28, height: 28, padding: 0, marginTop: 0, flexShrink: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 13, color: "var(--dm-sub)" }}>다시 알림</span>
        {snoozeOptions(workHours).map((o) => (
          <button key={o.id} onClick={() => onSnooze(item, o.at)} style={btn}>{o.label}</button>
        ))}
      </div>
    </div>,
    document.querySelector(".dm-phone") || document.body
  );
}
