import { useMemo, useState } from "react";
import { formatKoreanDate } from "../utils/date.js";
import S from "../styles.js";

function highlight(text, query) {
  if (!query.trim()) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: "rgba(108,142,255,.35)", color: "var(--dm-text)", borderRadius: 2, padding: "0 1px" }}>
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function snippet(text, query, maxLen = 120) {
  if (!query.trim()) return text.slice(0, maxLen) + (text.length > maxLen ? "..." : "");
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text.slice(0, maxLen);
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 60);
  return (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");
}

const TYPE_META = {
  task:    { label: "할일",  color: "#4B6FFF", bg: "rgba(75,111,255,.12)" },
  memo:    { label: "메모",  color: "#6C8EFF", bg: "rgba(108,142,255,.12)" },
  journal: { label: "일기",  color: "#A78BFA", bg: "rgba(167,139,250,.12)" },
};

export default function SearchViewer({ plans, onClose, onOpenDate }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [];
    Object.entries(plans)
      .sort(([a], [b]) => b.localeCompare(a))
      .forEach(([ds, d]) => {
        const matches = [];

        if (tab === "all" || tab === "task") {
          (d.tasks || []).filter(t => t.title.trim()).forEach(t => {
            if (!q || t.title.toLowerCase().includes(q)) {
              matches.push({ type: "task", text: t.title, done: t.done });
            }
          });
        }

        if ((tab === "all" || tab === "memo") && d.memo?.trim()) {
          if (!q || d.memo.toLowerCase().includes(q)) {
            matches.push({ type: "memo", text: d.memo.trim() });
          }
        }

        if ((tab === "all" || tab === "journal") && d.journal?.body?.trim()) {
          if (!q || d.journal.body.toLowerCase().includes(q)) {
            matches.push({ type: "journal", text: d.journal.body.trim() });
          }
        }

        if (matches.length > 0) all.push({ ds, matches });
      });
    return all;
  }, [plans, query, tab]);

  const totalCount = results.reduce((a, r) => a + r.matches.length, 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--dm-bg)", zIndex: 500, display: "flex", flexDirection: "column" }}>
      <div style={{ ...S.topbar, flexShrink: 0 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>통합 검색</div>
          <div style={S.sub}>{query.trim() ? `${totalCount}개 결과` : "할일 · 메모 · 일기"}</div>
        </div>
      </div>

      <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
        <input
          style={{ ...S.input, marginBottom: 0 }}
          placeholder="🔍 검색어 입력..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0 }}>
        {[["all", "전체"], ["task", "할일"], ["memo", "메모"], ["journal", "일기"]].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} style={{ ...S.pill(tab === id), fontSize: 12, padding: "5px 12px" }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ ...S.content, paddingBottom: 32 }}>
        {results.length === 0 ? (
          <div style={{ padding: "48px 24px", textAlign: "center", color: "var(--dm-muted)", fontSize: 14, lineHeight: 1.8 }}>
            {query.trim() ? "검색 결과가 없어요." : "검색어를 입력하면\n모든 기록에서 찾아드려요."}
          </div>
        ) : results.map(({ ds, matches }) => (
          <div key={ds} style={S.card}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#6C8EFF", fontWeight: 900 }}>{formatKoreanDate(ds)}</div>
              {onOpenDate && (
                <button onClick={() => { onOpenDate(ds); onClose(); }}
                  style={{ fontSize: 11, color: "var(--dm-muted)", background: "transparent", border: "none", cursor: "pointer", padding: "2px 6px" }}>
                  열기 →
                </button>
              )}
            </div>
            {matches.map((m, i) => {
              const meta = TYPE_META[m.type];
              const snip = snippet(m.text, query);
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "7px 0", borderTop: i > 0 ? "1px solid var(--dm-row)" : "none" }}>
                  <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, background: meta.bg, borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 2 }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 13, color: m.done ? "var(--dm-muted)" : "var(--dm-text)", lineHeight: 1.6, textDecoration: m.done ? "line-through" : "none", flex: 1, wordBreak: "break-word" }}>
                    {highlight(snip, query)}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
