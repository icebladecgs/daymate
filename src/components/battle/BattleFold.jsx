// 배틀 화면 칸 접기 (2026-11-10 사용자 요청 — "퀘스트·내 장비·상점·도전 상대는 평소 접혀 있다가 펴면 펴지게, 너무 복잡하다")
// 기본은 접힘, 펼친 상태는 기기마다 기억(dm_section_open_battle_* — accountSwap의 기기 설정 접두어).
// 접혀 있어도 제목 줄 오른쪽에 한 줄 요약(퀘스트 진행·골드 등)이 보인다.
import { useState } from "react";
import { UI } from "../../styles.js";
import { newDesignOn } from "../../utils/todayLook.js";
import { store } from "../../utils/storage.js";

export function useBattleFold(key, initial = false) {
  const storeKey = `dm_section_open_battle_${key}`;
  const [open, setOpen] = useState(() => { const v = store.get(storeKey, initial); return v === true; });
  const toggle = () => setOpen((v) => { store.set(storeKey, !v); return !v; });
  return [open, toggle];
}

export function FoldHeader({ title, summary, open, onToggle, summaryColor = "var(--dm-sub)" }) {
  return (
    <button onClick={onToggle} aria-expanded={open}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 40, padding: 0, background: "none", border: "none", borderRadius: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
      <span style={{ fontSize: newDesignOn() ? UI.title : 17, fontWeight: 900, color: "var(--dm-text)", whiteSpace: "nowrap" }}>{title}</span>
      {summary != null && summary !== "" && (
        <span style={{ marginLeft: "auto", minWidth: 0, fontSize: 14, fontWeight: 800, color: summaryColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontVariantNumeric: "tabular-nums" }}>{summary}</span>
      )}
      <span aria-hidden style={{ marginLeft: summary ? 0 : "auto", fontSize: 13, color: "var(--dm-muted)", flexShrink: 0, width: 18, textAlign: "right" }}>{open ? "▲" : "▼"}</span>
    </button>
  );
}
