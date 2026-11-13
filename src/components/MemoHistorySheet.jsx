import { useState } from "react";
import { createPortal } from "react-dom";
import { memoHistoryOf, snapshotMemo, HIST_DAYS } from "../utils/memoHistory.js";
import { useBackClose } from "../utils/useBackClose.js";

// 🕘 이전 내용 (2026-11-13) — 이 기기에 남은 메모의 예전 글을 보고 되살린다. utils/memoHistory.js
// 되살리기 전에 지금 글도 기록에 남겨서, 되살린 것도 다시 되돌릴 수 있다.
const when = (at) => {
  const d = new Date(at), now = new Date();
  const p = (n) => String(n).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `오늘 ${hm}`;
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return `어제 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
};

export default function MemoHistorySheet({ memoId, currentText, onRestore, onClose, zIndex = 1500 }) {
  useBackClose(onClose);
  const [list] = useState(() => memoHistoryOf(memoId));
  const [pick, setPick] = useState(0);
  const sel = list[pick];
  const firstLine = (t) => String(t || "").split("\n").map((l) => l.trim()).find(Boolean) || "(빈 메모)";
  const restore = () => {
    if (!sel) return;
    snapshotMemo(memoId, currentText, true); // 지금 글도 남겨 두기
    onRestore(sel.text);
    onClose();
  };
  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex, background: "rgba(0,0,0,.5)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-label="이전 내용"
        style={{ width: "100%", maxWidth: 640, maxHeight: "86vh", display: "flex", flexDirection: "column", background: "var(--dm-bg)", borderRadius: "20px 20px 0 0", padding: "16px 16px 20px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 6 }}>
          <div style={{ flex: 1, fontSize: 19, fontWeight: 900, color: "var(--dm-text)" }}>🕘 이전 내용</div>
          <button onClick={onClose} aria-label="닫기" style={{ width: 40, height: 40, padding: 0, border: "none", background: "none", color: "var(--dm-muted)", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: "var(--dm-muted)", marginBottom: 10, lineHeight: 1.5 }}>고치기 전 글을 이 기기에 {HIST_DAYS}일 동안 남겨요. 다른 기기에서 고친 기록은 그 기기에 있어요.</div>
        {list.length === 0 ? (
          <div style={{ padding: "30px 0", textAlign: "center", fontSize: 15, color: "var(--dm-sub)" }}>아직 남은 이전 내용이 없어요</div>
        ) : (<>
          <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 8, flexShrink: 0 }}>
            {list.map((v, i) => (
              <button key={v.at} onClick={() => setPick(i)} aria-pressed={i === pick}
                style={{ flexShrink: 0, maxWidth: 170, padding: "8px 12px", borderRadius: 12, border: i === pick ? "1.5px solid var(--dm-accent, #5B7CFA)" : "1px solid var(--dm-border)", background: i === pick ? "var(--dm-accent-soft, rgba(91,124,250,.12))" : "var(--dm-input)", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: i === pick ? "var(--dm-accent, #5B7CFA)" : "var(--dm-text)" }}>{when(v.at)}</div>
                <div style={{ fontSize: 13, color: "var(--dm-sub)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{firstLine(v.text)}</div>
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 120, overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: "12px 14px", borderRadius: 12, background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 15, lineHeight: 1.7 }}>{sel?.text}</div>
          <div style={{ fontSize: 13, color: "var(--dm-muted)", margin: "8px 0" }}>{sel ? `${sel.text.length}자 · 지금 글 ${String(currentText || "").length}자` : ""}</div>
          <button onClick={restore} style={{ height: 48, border: "none", borderRadius: 12, background: "var(--dm-accent, #5B7CFA)", color: "#fff", fontSize: 16, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            이 내용으로 되살리기
          </button>
          <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 6, textAlign: "center" }}>지금 글도 기록에 남아서 다시 되돌릴 수 있어요</div>
        </>)}
      </div>
    </div>,
    document.body
  );
}
