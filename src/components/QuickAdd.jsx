import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import Toast from "./Toast.jsx";
import { genMemoId, getMemoTimeStr } from "./MemoTimeline.jsx";
import { parseSchedule, parseMany, friendlySchedule } from "../utils/nlSchedule.js";
import { recurringLabel } from "../utils/recurring.js";
import { useBackClose, useAnySheetOpen } from "../utils/useBackClose.js";

// ＋ 빠른 추가 (2026-11-05) — 어느 탭에서든 할일·메모를 바로 넣는다. 할일 문장 해석은 오늘 탭 입력칸과 같다.
// 창은 화면 위쪽에 띄운다 — 아래쪽에 두면 휴대폰 키보드에 가려진다.
const ACCENT = "#5B7CFA";

const withNewTask = (list, task) => {
  const all = [...(list || [])];
  const empty = all.findIndex((t) => !t.title?.trim());
  if (empty >= 0) all[empty] = task;
  else all.push(task);
  return all;
};

function QuickAddSheet({ todayStr, setDayData, setRecurringTasks, onDone, onClose }) {
  useBackClose(onClose);
  const [kind, setKind] = useState("task");
  const [text, setText] = useState("");
  const [nlOff, setNlOff] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, [kind]);

  const isTask = kind === "task";
  const many = isTask && !nlOff ? parseMany(text) : null;
  const one = isTask && !nlOff && !many ? parseSchedule(text) : null;
  const preview = many || (one ? [one] : []);

  const putTask = (p, id) => {
    if (p.recurring && setRecurringTasks) {
      setRecurringTasks((prev) => [...(prev || []), { id: `r${id}`, title: p.title.slice(0, 40), days: p.recurring }]);
      return;
    }
    const task = { id: `t_${id}`, title: p.title.slice(0, 200), done: false, ...(p.time ? { time: p.time } : {}) };
    setDayData(p.date || todayStr, (prev) => ({ ...prev, tasks: withNewTask(prev?.tasks, task) }));
  };
  const submit = () => {
    const raw = text.trim();
    if (!raw) return;
    if (!isTask) {
      setDayData(todayStr, (prev) => ({ ...prev, memos: [...(prev?.memos || []), { id: genMemoId(), text: raw, createdAt: getMemoTimeStr() }] }));
      onDone("📝 오늘 메모에 넣었어요");
      return;
    }
    const now = Date.now();
    if (many) {
      many.forEach((p, i) => putTask(p, `${now}_${i}`));
      onDone(`📋 ${many.length}개를 넣었어요`);
      return;
    }
    putTask(one || { title: raw }, now);
    if (one?.recurring) onDone(`🔁 반복 할일로 등록했어요 (${recurringLabel(one.recurring)})`);
    else if (one?.date && one.date !== todayStr) onDone(`📅 ${friendlySchedule(one, todayStr, recurringLabel)}에 넣었어요`);
    else onDone("✅ 오늘 할일에 넣었어요");
  };

  const tab = (id, label) => (
    <button onClick={() => { setKind(id); setNlOff(false); }} aria-pressed={kind === id}
      style={{ flex: 1, height: 40, padding: 0, borderRadius: 10, border: `1.5px solid ${kind === id ? ACCENT : "var(--dm-border)"}`, background: kind === id ? "rgba(91,124,250,.14)" : "var(--dm-input)", color: kind === id ? ACCENT : "var(--dm-sub)", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>
      {label}
    </button>
  );

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1250, background: "rgba(0,0,0,.55)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "max(40px, env(safe-area-inset-top)) 12px 12px", boxSizing: "border-box" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 406, background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 18, padding: 14, boxSizing: "border-box" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {tab("task", "✅ 할일")}
          {tab("memo", "📝 메모")}
        </div>
        {isTask ? (
          <input ref={inputRef} value={text} onChange={(e) => { setText(e.target.value); setNlOff(false); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit(); }}
            placeholder="할 일 (예: 내일 오후 3시 회의)" maxLength={200} aria-label="할 일"
            style={{ ...S.input, marginBottom: 0 }} />
        ) : (
          <textarea ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} rows={4}
            placeholder="오늘 메모로 저장돼요" aria-label="메모" style={{ ...S.input, marginBottom: 0, resize: "none", lineHeight: 1.6 }} />
        )}
        {preview.length > 0 && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, marginTop: 8 }}>
            <div style={{ flex: 1, minWidth: 0, background: "rgba(91,124,250,.1)", border: "1px solid rgba(91,124,250,.3)", borderRadius: 10, padding: "7px 10px" }}>
              {preview.map((p, i) => (
                <div key={i} style={{ fontSize: 14, color: "var(--dm-text)", lineHeight: 1.45, wordBreak: "keep-all", overflowWrap: "anywhere" }}>
                  {p.recurring ? "🔁" : "📅"} <b style={{ color: ACCENT }}>{friendlySchedule(p, todayStr, recurringLabel) || "오늘"}</b> · {p.title}
                </div>
              ))}
            </div>
            <button onClick={() => setNlOff(true)} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-muted)", fontSize: 13, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>그냥 글자로</button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={onClose} style={{ flex: 1, height: 44, padding: 0, borderRadius: 12, border: "1px solid var(--dm-border)", background: "none", color: "var(--dm-muted)", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>취소</button>
          <button onClick={submit} disabled={!text.trim()} style={{ flex: 2, height: 44, padding: 0, borderRadius: 12, border: "none", background: ACCENT, color: "#fff", fontSize: 15, fontWeight: 800, cursor: text.trim() ? "pointer" : "default", opacity: text.trim() ? 1 : 0.5 }}>넣기</button>
        </div>
      </div>
    </div>,
    document.querySelector(".dm-phone") || document.body
  );
}

export default function QuickAdd({ todayStr, setDayData, setRecurringTasks }) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [typing, setTyping] = useState(false);
  const sheetOpen = useAnySheetOpen();

  // 입력 중에는 숨긴다 — 키보드 바로 위에 떠서 글자를 가린다
  useEffect(() => {
    const isField = (el) => el && (el.tagName === "TEXTAREA" || el.tagName === "SELECT" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "file"].includes(el.type)));
    const check = () => setTyping(isField(document.activeElement));
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", check);
    return () => { document.removeEventListener("focusin", check); document.removeEventListener("focusout", check); };
  }, []);

  return (
    <>
      {!open && !sheetOpen && !typing && (
        <button onClick={() => setOpen(true)} aria-label="빠른 추가" title="할일·메모 빠르게 넣기"
          style={{ position: "fixed", right: "max(16px, calc(50% - 199px))", bottom: 96, zIndex: 510, width: 56, height: 56, padding: 0, borderRadius: "50%", border: "none", background: ACCENT, color: "#fff", fontSize: 30, lineHeight: 1, cursor: "pointer", boxShadow: "0 6px 18px rgba(0,0,0,.28)", display: "flex", alignItems: "center", justifyContent: "center" }}>＋</button>
      )}
      {open && (
        <QuickAddSheet todayStr={todayStr} setDayData={setDayData} setRecurringTasks={setRecurringTasks}
          onClose={() => setOpen(false)} onDone={(msg) => { setOpen(false); setToast(msg); }} />
      )}
      {toast && <Toast msg={toast} onDone={() => setToast("")} />}
    </>
  );
}
