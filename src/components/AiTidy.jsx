// ✨ 메모 AI 정리 창 (2026-11-10) — 메모 탭 쓰기 칸·메모 열어 고치기·메모 관리자·포스트잇이 같이 쓴다.
// 정리 방식 고르기 → AI 정리본(직접 고칠 수 있음) / 내 글 / 바뀐 곳 비교 → [AI 것으로 바꾸기] [아래에 덧붙이기] [취소].
// 바꾼 뒤 5초 "↩ 되돌리기". 처음 한 번은 "메모가 AI로 전송돼요" 안내(기기마다 dm_ai_tidy_ok). 계산·지시문은 utils/memoTidy.js
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import UndoBar from "./UndoBar.jsx";
import { useUndo } from "../utils/useUndo.js";
import { useBackClose } from "../utils/useBackClose.js";
import { TIDY_MODES, TIDY_MAX_CHARS, lineDiff, changedLineCount, appendTidy } from "../utils/memoTidy.js";

const OK_KEY = "dm_ai_tidy_ok";
const consentGiven = () => { try { return localStorage.getItem(OK_KEY) === "true"; } catch { return false; } };

// 로그인 확인 → 서버 요청. firebase는 필요할 때만 불러온다(포스트잇 창을 가볍게 두려고)
async function requestTidy(text, mode) {
  const { auth } = await import("../firebase.js");
  await auth.authStateReady?.();
  if (!auth.currentUser) throw new Error("AI 정리는 로그인한 뒤 쓸 수 있어요");
  const { chatFetch } = await import("../api/chatFetch.js");
  const res = await chatFetch("/api/chat?action=memo-tidy", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, mode }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || typeof j.text !== "string") throw new Error(j.error || "AI 정리를 하지 못했어요");
  return j.text;
}

// getText: 지금 메모 글, setText(새 글): 그 화면의 저장 경로로 넣기. zIndex: 메모 관리자(900) 위에 뜨게
export function useAiTidy({ getText, setText, zIndex = 1500, notify }) {
  const [open, setOpen] = useState(false);
  const undo = useUndo();
  const start = () => {
    const t = getText() || "";
    if (!t.trim()) { notify?.("정리할 글을 먼저 써 주세요"); return; }
    if (t.length > TIDY_MAX_CHARS) { notify?.(`메모가 너무 길어요 (${TIDY_MAX_CHARS.toLocaleString()}자까지)`); return; }
    setOpen(true);
  };
  const apply = (next, label) => {
    const prev = getText() || "";
    setText(next);
    setOpen(false);
    undo.offer(label, () => setText(prev));
  };
  const ui = (
    <>
      {open && <AiTidySheet orig={getText() || ""} zIndex={zIndex} onClose={() => setOpen(false)} onApply={apply} />}
      <UndoBar bar={undo.bar} onUndo={undo.run} zIndex={zIndex + 10} />
    </>
  );
  return { open: start, ui };
}

function AiTidySheet({ orig, zIndex, onClose, onApply }) {
  const [ok, setOk] = useState(consentGiven);
  const [mode, setMode] = useState("tidy");
  const [results, setResults] = useState({}); // { mode: 고친 글 } — 방식을 바꿔도 다시 보내지 않게
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState("ai");
  const reqId = useRef(0);
  useBackClose(onClose, true);

  const run = async (m) => {
    setMode(m); setErr("");
    if (results[m] != null) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const out = await requestTidy(orig, m);
      if (id === reqId.current) setResults((r) => ({ ...r, [m]: out }));
    } catch (e) {
      if (id === reqId.current) setErr(e.message || "AI 정리를 하지 못했어요");
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };
  const agree = () => { try { localStorage.setItem(OK_KEY, "true"); } catch { /* 무시 */ } setOk(true); run("tidy"); };
  // 이미 동의한 기기는 열자마자 기본 방식으로 정리
  useEffect(() => { if (consentGiven()) run("tidy"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ai = results[mode];
  const diff = ai != null ? lineDiff(orig, ai) : [];
  const changed = changedLineCount(diff);
  const C = { bg: "var(--dm-bg, #fff)", card: "var(--dm-card, #f4f4f6)", text: "var(--dm-text, #111)", sub: "var(--dm-sub, #555)", muted: "var(--dm-muted, #888)", border: "var(--dm-border, #ddd)", input: "var(--dm-input, #f1f1f3)", accent: "var(--dm-accent, #5B7CFA)" };
  const chip = (on) => ({ minHeight: 40, padding: "0 12px", borderRadius: 999, border: `1.5px solid ${on ? C.accent : C.border}`, background: on ? "rgba(91,124,250,.12)" : C.input, color: on ? C.accent : C.text, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  const tabBtn = (on) => ({ flex: 1, minHeight: 40, padding: 0, border: "none", borderBottom: `2.5px solid ${on ? C.accent : "transparent"}`, background: "none", color: on ? C.text : C.muted, fontSize: 15, fontWeight: on ? 900 : 700, cursor: "pointer", fontFamily: "inherit" });
  const bigBtn = (primary, disabled) => ({ flex: 1, minHeight: 46, padding: "0 8px", borderRadius: 12, border: primary ? "none" : `1.5px solid ${C.border}`, background: disabled ? C.input : primary ? C.accent : C.input, color: disabled ? C.muted : primary ? "#fff" : C.text, fontSize: 15, fontWeight: 900, cursor: disabled ? "default" : "pointer", fontFamily: "inherit", whiteSpace: "nowrap" });
  // 낮은 창(포스트잇·작은 창)에서 글 칸이 눌려 안 보이던 문제 (2026-11-10 사용자 제보) — 글 칸은 최소 높이를 두고 창 전체가 스크롤, 안내 문구는 숨김
  const short = typeof window !== "undefined" && window.innerHeight < 560;
  const box = { flex: "1 0 auto", minHeight: short ? 170 : 240, width: "100%", boxSizing: "border-box", padding: 12, borderRadius: 12, border: `1px solid ${C.border}`, background: C.input, color: C.text, fontSize: 15, lineHeight: 1.7, fontFamily: "inherit", overflowY: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" };

  return createPortal(
    <div role="dialog" aria-label="AI 정리" style={{ position: "fixed", inset: 0, zIndex, background: "rgba(0,0,0,.45)", display: "flex", justifyContent: "center", alignItems: "stretch" }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", maxWidth: 640, background: C.bg, color: C.text, display: "flex", flexDirection: "column", padding: short ? "8px 12px" : "12px 16px calc(12px + env(safe-area-inset-bottom))", boxSizing: "border-box", gap: short ? 8 : 10, overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ flex: 1, fontSize: 19, fontWeight: 900 }}>✨ AI 정리</span>
          <button onClick={onClose} aria-label="닫기" style={{ width: 40, height: 40, padding: 0, border: "none", background: "none", color: C.muted, fontSize: 20, cursor: "pointer" }}>✕</button>
        </div>

        {!ok ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 15, lineHeight: 1.7, padding: 14, borderRadius: 12, background: C.input, border: `1px solid ${C.border}` }}>
              이 메모의 글이 <b>AI(Anthropic) 서버로 전송</b>돼서 정리돼요.<br />
              DayMate 서버에는 저장하지 않지만, <b>비밀번호·카드 번호·회사 업무 자료</b>가 든 메모는 보내지 마세요.<br />
              <span style={{ color: C.sub, fontSize: 14 }}>잠긴 메모는 보낼 수 없어요. 이 안내는 이 기기에서 한 번만 나와요.</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={onClose} style={bigBtn(false)}>취소</button>
              <button onClick={agree} style={bigBtn(true)}>보내고 정리하기</button>
            </div>
          </div>
        ) : (<>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TIDY_MODES.map((m) => <button key={m.id} onClick={() => run(m.id)} title={m.desc} style={chip(mode === m.id)}>{m.label}</button>)}
          </div>
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
            <button onClick={() => setTab("ai")} style={tabBtn(tab === "ai")}>AI 정리</button>
            <button onClick={() => setTab("mine")} style={tabBtn(tab === "mine")}>내 글</button>
            <button onClick={() => setTab("diff")} style={tabBtn(tab === "diff")}>바뀐 곳{ai != null ? ` ${changed}` : ""}</button>
          </div>

          {loading && ai == null ? (
            <div style={{ ...box, display: "flex", alignItems: "center", justifyContent: "center", color: C.sub }}><span className="dm-spin" style={{ display: "inline-block", marginRight: 8 }}>⏳</span>AI가 정리하는 중…</div>
          ) : err && ai == null && tab !== "mine" ? (
            <div style={{ ...box, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: "#EF4444", fontWeight: 700, textAlign: "center" }}>
              {err}
              <button onClick={() => run(mode)} style={{ ...chip(false), color: C.text }}>다시 하기</button>
            </div>
          ) : tab === "mine" ? (
            <div style={box}>{orig}</div>
          ) : tab === "diff" ? (
            <div style={{ ...box, padding: 8 }}>
              {changed === 0 && <div style={{ color: C.sub, padding: 4 }}>바뀐 곳이 없어요</div>}
              {diff.map((d, i) => (
                <div key={i} style={{ padding: "1px 6px", borderRadius: 4, minHeight: "1.7em",
                  background: d.type === "add" ? "rgba(34,197,94,.16)" : d.type === "del" ? "rgba(239,68,68,.14)" : "transparent",
                  color: d.type === "del" ? "#EF4444" : d.type === "same" ? C.muted : C.text, textDecoration: d.type === "del" ? "line-through" : "none" }}>
                  <span aria-hidden style={{ display: "inline-block", width: 14, fontWeight: 900 }}>{d.type === "add" ? "+" : d.type === "del" ? "−" : ""}</span>{d.text}
                </div>
              ))}
            </div>
          ) : (
            <textarea value={ai ?? ""} onChange={(e) => setResults((r) => ({ ...r, [mode]: e.target.value }))} aria-label="AI 정리본 (고칠 수 있어요)" style={{ ...box, resize: "none", outline: "none" }} />
          )}

          <div style={{ display: short ? "none" : "block", fontSize: 13, color: C.sub, lineHeight: 1.5 }}>AI가 내용을 바꾸거나 빠뜨릴 수 있어요. "바뀐 곳"에서 확인하고, "AI 정리" 칸에서 직접 고칠 수 있어요.</div>
          <div style={{ display: "flex", gap: 8, position: "sticky", bottom: 0, background: C.bg, paddingTop: 4 }}>
            <button onClick={onClose} style={{ ...bigBtn(false), flex: "0 0 auto", padding: "0 16px" }}>취소</button>
            <button disabled={ai == null} onClick={() => onApply(appendTidy(orig, ai, mode), "✨ 아래에 덧붙였어요")} style={bigBtn(false, ai == null)}>아래에 덧붙이기</button>
            <button disabled={ai == null} onClick={() => onApply(ai, "✨ AI 정리로 바꿨어요")} style={bigBtn(true, ai == null)}>AI 것으로 바꾸기</button>
          </div>
        </>)}
      </div>
    </div>,
    document.body
  );
}
