import { useEffect, useMemo, useState } from "react";
import { loadErrorLogs, deleteErrorLogs, purgeOldErrorLogs } from "../firebase.js";

// 관리자 화면 → 오류 탭. 같은 오류(문구가 같은 것)끼리 묶어서 보여 준다.
const fmt = (iso) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function AdminErrorLogs() {
  const [logs, setLogs] = useState(null);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState(null); // 펼친 묶음 key
  const [busy, setBusy] = useState(false);

  // 30일 지난 기록을 정리하고 최근 기록을 불러온다
  const fetchLogs = () => purgeOldErrorLogs().catch(() => {}).then(() => loadErrorLogs()).then(
    list => ({ list, error: "" }),
    e => ({ list: [], error: e?.code === "permission-denied" ? "보안 규칙에 errorLogs 규칙이 아직 없어요 (Firebase 콘솔에서 게시 필요)" : "불러오지 못했어요" }),
  );
  const apply = ({ list, error }) => { setLogs(list); setErr(error); };
  useEffect(() => { fetchLogs().then(apply); }, []);
  const load = () => { setLogs(null); fetchLogs().then(apply); };

  const groups = useMemo(() => {
    const map = new Map();
    for (const l of logs || []) {
      const key = `${l.kind}|${l.msg}`;
      if (!map.has(key)) map.set(key, { key, kind: l.kind, msg: l.msg, items: [] });
      map.get(key).items.push(l);
    }
    return [...map.values()].sort((a, b) => (b.items[0].at > a.items[0].at ? 1 : -1));
  }, [logs]);

  const today = new Date().toDateString();
  const todayCount = (logs || []).filter(l => new Date(l.at).toDateString() === today).length;

  const remove = async (ids, label) => {
    if (!window.confirm(`${label} 지울까요?`)) return;
    setBusy(true);
    try { await deleteErrorLogs(ids); setLogs(prev => prev.filter(l => !ids.includes(l.id))); } catch { setErr("지우지 못했어요"); }
    setBusy(false);
  };

  const chip = { fontSize: 10, fontWeight: 800, borderRadius: 6, padding: "1px 6px", background: "var(--dm-input)", color: "var(--dm-sub)" };

  return (
    <div style={{ marginBottom: 80 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ flex: 1, fontSize: 12, color: "var(--dm-muted)", lineHeight: 1.6 }}>
          오늘 {todayCount}건 · 최근 30일 {logs?.length ?? 0}건 · 같은 오류끼리 묶음
        </div>
        <button onClick={load} disabled={busy} style={{ fontSize: 12, fontWeight: 800, padding: "6px 10px", borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-card)", color: "var(--dm-sub)", cursor: "pointer" }}>새로고침</button>
        {logs?.length > 0 && (
          <button onClick={() => remove(logs.map(l => l.id), "오류 기록을 모두")} disabled={busy} style={{ fontSize: 12, fontWeight: 800, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(248,113,113,.4)", background: "transparent", color: "#F87171", cursor: "pointer" }}>모두 지우기</button>
        )}
      </div>
      {err && <div style={{ fontSize: 13, color: "#F87171", fontWeight: 700, marginBottom: 10 }}>{err}</div>}
      {logs === null && <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 13, padding: 20 }}>불러오는 중…</div>}
      {logs?.length === 0 && !err && <div style={{ textAlign: "center", color: "var(--dm-muted)", fontSize: 14, padding: 30 }}>✅ 최근 30일 동안 기록된 오류가 없어요</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {groups.map(g => {
          const latest = g.items[0];
          const users = new Set(g.items.map(i => i.uid)).size;
          const versions = [...new Set(g.items.map(i => i.version))];
          const wheres = [...new Set(g.items.map(i => i.where))];
          const isOpen = open === g.key;
          return (
            <div key={g.key} style={{ background: "var(--dm-card)", border: "1px solid var(--dm-border)", borderRadius: 12, padding: 12 }}>
              <div onClick={() => setOpen(isOpen ? null : g.key)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ ...chip, background: "rgba(248,113,113,.15)", color: "#F87171" }}>{g.items.length}회</span>
                  <span style={chip}>{g.kind}</span>
                  <span style={chip}>사용자 {users}명</span>
                  <span style={chip}>{versions.slice(0, 3).join(", ")}{versions.length > 3 ? " …" : ""}</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--dm-muted)" }}>최근 {fmt(latest.at)}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--dm-text)", fontWeight: 700, wordBreak: "break-word", lineHeight: 1.5 }}>{g.msg}</div>
                <div style={{ fontSize: 11, color: "var(--dm-muted)", marginTop: 4 }}>화면: {wheres.join(", ")}</div>
              </div>
              {isOpen && (
                <div style={{ marginTop: 10, borderTop: "1px solid var(--dm-border)", paddingTop: 10 }}>
                  {latest.stack && <pre style={{ fontSize: 10, color: "var(--dm-sub)", whiteSpace: "pre-wrap", wordBreak: "break-all", background: "var(--dm-input)", borderRadius: 8, padding: 8, margin: "0 0 8px" }}>{latest.stack}</pre>}
                  {g.items.slice(0, 10).map(i => (
                    <div key={i.id} style={{ fontSize: 11, color: "var(--dm-sub)", padding: "3px 0" }}>
                      {fmt(i.at)} · {i.version} · {i.where} · {i.platform} · {String(i.uid).slice(0, 6)}
                    </div>
                  ))}
                  {g.items.length > 10 && <div style={{ fontSize: 11, color: "var(--dm-muted)" }}>외 {g.items.length - 10}건</div>}
                  <button onClick={() => remove(g.items.map(i => i.id), `이 오류 ${g.items.length}건을`)} disabled={busy}
                    style={{ marginTop: 8, fontSize: 12, fontWeight: 800, padding: "6px 12px", borderRadius: 8, border: "1px solid rgba(248,113,113,.4)", background: "transparent", color: "#F87171", cursor: "pointer" }}>이 오류 지우기 (해결됨)</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
