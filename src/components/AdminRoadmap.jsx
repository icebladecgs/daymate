import { useEffect, useMemo, useState } from "react";
import { loadRoadmap, saveRoadmapItem, deleteRoadmapItem } from "../firebase.js";
import { sortRoadmap, roadmapToText, roadmapChecks, ROADMAP_STATUS, ROADMAP_PRI } from "../utils/roadmap.js";
import { toDateStr } from "../utils/date.js";
import S from "../styles.js";

// 관리자 화면 → 📋 업그레이드 탭 (2026-11-12). 휴대폰에서 떠오른 개선점을 적어 두는 곳.
// 개발 목록 원본은 저장소 docs/ROADMAP.md — Claude는 운영 Firestore를 못 읽어서 "목록 복사"로 대화에 붙여 넣는다.
const CHECK_STYLE = {
  ok: { label: "여유", color: "var(--dm-muted)", bg: "var(--dm-input)" },
  soon: { label: "곧", color: "#F59E0B", bg: "rgba(245,158,11,.12)" },
  now: { label: "갱신할 때", color: "#F87171", bg: "rgba(248,113,113,.12)" },
  late: { label: "표 끝남", color: "#fff", bg: "#F87171" },
};
const fmtDay = (iso) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}`; };

export default function AdminRoadmap() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState("");
  const [text, setText] = useState("");
  const [pri, setPri] = useState("normal");
  const [openId, setOpenId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [showDone, setShowDone] = useState(false);
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadRoadmap().then(setItems, (e) => {
      setItems([]);
      setErr(e?.code === "permission-denied" ? "보안 규칙(adminRoadmap)이 아직 게시되지 않았어요 — npm run rules:deploy" : "불러오지 못했어요");
    });
  }, []);

  const checks = useMemo(() => roadmapChecks(toDateStr()), []);
  const sorted = useMemo(() => sortRoadmap(items), [items]);
  const open = sorted.filter((i) => i.status !== "done");
  const done = sorted.filter((i) => i.status === "done");

  const save = async (item) => {
    setBusy(true); setErr("");
    try {
      const saved = await saveRoadmapItem(item);
      setItems((prev) => [...(prev || []).filter((x) => x.id !== saved.id), saved]);
      setBusy(false);
      return saved;
    } catch (e) {
      setErr(e?.code === "permission-denied" ? "저장 거절 — 보안 규칙(adminRoadmap) 게시가 필요해요" : "저장하지 못했어요");
      setBusy(false);
      return null;
    }
  };

  const add = async () => {
    const t = text.trim();
    if (!t || busy) return;
    if (await save({ text: t, pri, status: "todo" })) { setText(""); setPri("normal"); }
  };

  const remove = async (item) => {
    if (!window.confirm(`"${item.text}"을(를) 지울까요?\n지우면 되돌릴 수 없어요. 끝낸 일은 "✓ 끝냄"으로 남겨 두는 걸 추천해요.`)) return;
    setBusy(true);
    try { await deleteRoadmapItem(item.id); setItems((prev) => prev.filter((x) => x.id !== item.id)); setOpenId(null); }
    catch { setErr("지우지 못했어요"); }
    setBusy(false);
  };

  const copy = async () => {
    const out = roadmapToText(items);
    if (!out) { setCopied("복사할 할 일이 없어요"); return; }
    try { await navigator.clipboard.writeText(out); setCopied(`✓ ${open.length}개 복사됨 — Claude 대화에 붙여 넣으세요`); }
    catch { setCopied("복사하지 못했어요"); }
    setTimeout(() => setCopied(""), 4000);
  };

  const chipBtn = (on, color = "var(--dm-accent, #5B7CFA)") => ({
    fontSize: 13, fontWeight: 800, padding: "0 12px", minHeight: 36, borderRadius: 999, cursor: "pointer",
    border: `1.5px solid ${on ? color : "var(--dm-border)"}`, background: on ? color : "transparent",
    color: on ? "#fff" : "var(--dm-sub)",
  });

  // 컴포넌트가 아니라 함수로 그린다 — 안에서 컴포넌트를 만들면 글자를 칠 때마다 입력칸이 새로 생겨 커서가 빠진다
  const renderRow = (item) => {
    const st = ROADMAP_STATUS.find((s) => s.key === item.status) || ROADMAP_STATUS[1];
    const p = ROADMAP_PRI.find((x) => x.key === item.pri);
    const isOpen = openId === item.id;
    return (
      <div key={item.id} style={{ background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 12, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button aria-label={item.status === "done" ? "다시 할 일로" : "끝냄"} disabled={busy}
            onClick={() => save({ ...item, status: item.status === "done" ? "todo" : "done", doneAt: null })}
            style={{ width: 40, height: 40, padding: 0, flexShrink: 0, borderRadius: 999, cursor: "pointer", fontSize: 18,
              border: `2px solid ${item.status === "done" ? "#22C55E" : "var(--dm-border)"}`,
              background: item.status === "done" ? "#22C55E" : "transparent", color: "#fff" }}>
            {item.status === "done" ? "✓" : ""}
          </button>
          <div onClick={() => { setOpenId(isOpen ? null : item.id); setDraft({ ...item }); }} style={{ flex: 1, minWidth: 0, cursor: "pointer" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--dm-text)", lineHeight: 1.45, wordBreak: "break-word",
              textDecoration: item.status === "done" ? "line-through" : "none", opacity: item.status === "done" ? 0.6 : 1 }}>
              {p?.mark ? `${p.mark} ` : ""}{item.text}
            </div>
            <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
              {item.status === "doing" && <span style={{ color: st.color, fontWeight: 800 }}>● 하는 중</span>}
              <span>{fmtDay(item.createdAt)} 적음</span>
              {item.doneAt && <span>{fmtDay(item.doneAt)} 끝냄</span>}
              {item.from && <span>💬 문의·제안에서</span>}
              {item.note && !isOpen && <span>📝 메모</span>}
            </div>
          </div>
        </div>
        {isOpen && draft && (
          <div style={{ marginTop: 12, borderTop: "1px solid var(--dm-border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} maxLength={500}
              style={{ ...S.input, fontSize: 15, marginBottom: 0 }} />
            <textarea value={draft.note || ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} maxLength={3000} rows={4}
              placeholder="자세한 내용·조건 (선택)" style={{ ...S.input, fontSize: 14, resize: "vertical", marginBottom: 0 }} />
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROADMAP_STATUS.map((s) => (
                <button key={s.key} onClick={() => setDraft({ ...draft, status: s.key })} style={chipBtn(draft.status === s.key, s.color)}>{s.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ROADMAP_PRI.map((x) => (
                <button key={x.key} onClick={() => setDraft({ ...draft, pri: x.key })} style={chipBtn(draft.pri === x.key)}>{x.mark ? `${x.mark} ` : ""}{x.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button disabled={busy || !draft.text.trim()} onClick={async () => {
                if (await save({ ...draft, doneAt: draft.status === item.status ? item.doneAt : null })) setOpenId(null);
              }} style={{ ...S.btn, flex: 1, marginTop: 0, fontSize: 14 }}>저장</button>
              <button onClick={() => setOpenId(null)} style={{ ...S.btnGhost, flex: 1, marginTop: 0, fontSize: 14 }}>닫기</button>
              <button disabled={busy} onClick={() => remove(item)} style={{ ...S.btnGhost, flex: "0 0 auto", width: "auto", padding: "0 14px", marginTop: 0, fontSize: 14, color: "#F87171", borderColor: "rgba(248,113,113,.4)" }}>삭제</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ marginBottom: 80, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 기한 있는 점검 — 앱 안 표가 끝나기 전에 */}
      <div style={{ background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: 14 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--dm-text)", marginBottom: 10 }}>⏰ 기한 있는 점검</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {checks.map((c) => {
            const cs = CHECK_STYLE[c.state];
            return (
              <div key={c.id}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "var(--dm-text)", flex: 1 }}>{c.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 800, borderRadius: 999, padding: "2px 10px", color: cs.color, background: cs.bg }}>{cs.label}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--dm-muted)", marginTop: 3, lineHeight: 1.5 }}>
                  표 끝: {c.due} ({c.left >= 0 ? `${c.left}일 남음` : `${-c.left}일 지남`}) · 알림 {c.warnFrom}부터
                </div>
                {c.state !== "ok" && <div style={{ fontSize: 13, color: "var(--dm-sub)", marginTop: 2, lineHeight: 1.5 }}>{c.detail}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* 적기 */}
      <div style={{ background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 14, padding: 14 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing) add(); }}
            placeholder="업그레이드할 내용 한 줄" style={{ ...S.input, flex: 1, minWidth: 0, fontSize: 15, marginBottom: 0 }} />
          <button onClick={add} disabled={busy || !text.trim()} style={{ ...S.btn, width: "auto", padding: "0 16px", marginTop: 0, fontSize: 14 }}>추가</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {ROADMAP_PRI.map((x) => (
            <button key={x.key} onClick={() => setPri(x.key)} style={chipBtn(pri === x.key)}>{x.mark ? `${x.mark} ` : ""}{x.label}</button>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1, fontSize: 14, color: "var(--dm-sub)", fontWeight: 700 }}>남은 할 일 {open.length}개</div>
        <button onClick={copy} style={{ ...chipBtn(false), color: "var(--dm-accent, #5B7CFA)", borderColor: "var(--dm-accent, #5B7CFA)" }}>📋 목록 복사</button>
      </div>
      {copied && <div style={{ fontSize: 13, color: "#22C55E", fontWeight: 700, marginTop: -6 }}>{copied}</div>}
      {err && <div style={{ fontSize: 13, color: "#F87171", fontWeight: 700 }}>{err}</div>}
      {items === null && <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 14, padding: 20 }}>불러오는 중…</div>}
      {items && open.length === 0 && !err && <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 14, padding: 20 }}>남은 할 일이 없어요</div>}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {open.map(renderRow)}
      </div>

      {done.length > 0 && (
        <>
          <button onClick={() => setShowDone((v) => !v)} style={{ ...S.btnGhost, marginTop: 0, fontSize: 14 }}>
            {showDone ? "▲ 끝낸 것 접기" : `▼ 끝낸 것 보기 (${done.length})`}
          </button>
          {showDone && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>{done.map(renderRow)}</div>}
        </>
      )}

      <div style={{ fontSize: 13, color: "var(--dm-muted)", lineHeight: 1.6 }}>
        여기는 관리자만 보는 메모장이에요. 개발 목록 원본은 저장소의 docs/ROADMAP.md이고, Claude는 이 화면을 직접 못 읽어요 — "📋 목록 복사"로 붙여 넣어 주세요.
      </div>
    </div>
  );
}
