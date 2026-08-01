import { useMemo, useState } from "react";
import { formatKoreanDate } from "../utils/date.js";
import S from "../styles.js";
import JournalViewer from "./JournalViewer.jsx";
import LongMemoEditor from "../components/LongMemoEditor.jsx";
import { getTopKeywords } from "../utils/knowledge.js";

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

export default function SearchViewer({ plans, onClose, onOpenDate, onUpdateDayData = null, uid, setToast }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("memo");
  const [focusedResult, setFocusedResult] = useState(null);

  const topKeywords = useMemo(() => getTopKeywords(plans, 20), [plans]);

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

        if (tab === "all" || tab === "memo") {
          const memoItems = (d.memos && d.memos.length > 0)
            ? d.memos
            : (d.memo?.trim() ? [{ id: `legacy_${ds}`, text: d.memo.trim(), createdAt: '' }] : []);
          memoItems.forEach(m => {
            const text = (m.text || '').trim();
            if (text && (!q || text.toLowerCase().includes(q))) {
              matches.push({ type: "memo", id: m.id, text, createdAt: m.createdAt || '', photoUrl: m.photoUrl, photoPath: m.photoPath });
            }
          });
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

  if (focusedResult?.type === 'memo') {
    return (
      <LongMemoEditor
        initialId={focusedResult.memoId}
        initialText={focusedResult.text}
        initialPhotoUrl={focusedResult.photoUrl}
        initialPhotoPath={focusedResult.photoPath}
        subtitle={`${formatKoreanDate(focusedResult.ds)}${focusedResult.createdAt ? ` · ${focusedResult.createdAt}` : ''}`}
        onUpdate={(id, text) => onUpdateDayData?.(focusedResult.ds, prev => ({
          ...prev,
          memos: (prev.memos || []).map(m => m.id === id ? { ...m, text } : m),
        }))}
        onUpdatePhoto={(id, photo) => onUpdateDayData?.(focusedResult.ds, prev => ({
          ...prev,
          memos: (prev.memos || []).map(m => m.id === id ? { ...m, photoUrl: photo?.url || null, photoPath: photo?.path || null } : m),
        }))}
        onClose={() => setFocusedResult(null)}
        uid={uid}
        pathPrefix={uid ? `users/${uid}/memos` : undefined}
        onPhotoError={setToast}
      />
    );
  }

  if (focusedResult?.type === 'journal') {
    return <JournalViewer plans={plans} onClose={() => setFocusedResult(null)} focusDate={focusedResult.ds} onSaveEntry={async (dateStr, text) => {
      await onUpdateDayData?.(dateStr, (prev) => ({
        ...prev,
        journal: { ...(prev.journal || {}), body: text },
      }));
    }} />;
  }

  return (
    <div style={S.fullScreenPanel()}>
      <div style={{ ...S.topbar, flexShrink: 0 }}>
        <button onClick={onClose} style={{ ...S.btnGhost, width: 56, marginTop: 0, padding: 10 }}>←</button>
        <div style={{ flex: 1 }}>
          <div style={S.title}>통합 검색</div>
          <div style={S.sub}>{query.trim() ? `${totalCount}개 결과` : "할일 · 메모 · 일기"}</div>
        </div>
      </div>

      <div style={{ padding: "10px 16px 0", flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', fontSize: 15, pointerEvents: 'none', userSelect: 'none' }}>🔍</span>
          <input
            style={{ ...S.input, marginBottom: 0, paddingLeft: 38 }}
            placeholder="검색어 입력..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {!query.trim() && topKeywords.length > 0 && (
        <div style={{ padding: "8px 16px 4px", flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: "var(--dm-muted)", fontWeight: 700, marginBottom: 6 }}>자주 쓰는 키워드</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {topKeywords.slice(0, 12).map(k => (
              <button key={k.name} onClick={() => setQuery(k.name)}
                style={{ fontSize: 12, color: "#6C8EFF", background: "rgba(108,142,255,0.12)", border: "1px solid rgba(108,142,255,0.25)", borderRadius: 20, padding: "4px 11px", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}>
                {k.name} <span style={{ fontSize: 10, opacity: 0.7 }}>{k.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, padding: "8px 16px", flexShrink: 0 }}>
        {[["memo", "메모"], ["task", "할일"], ["journal", "일기"], ["all", "전체"]].map(([id, label]) => (
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
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (m.type === 'task') {
                      onOpenDate?.(ds);
                      onClose?.();
                      return;
                    }
                    if (m.type === 'memo') setFocusedResult({ type: 'memo', ds, memoId: m.id, text: m.text, createdAt: m.createdAt, photoUrl: m.photoUrl, photoPath: m.photoPath });
                    else if (m.type === 'journal') setFocusedResult({ type: 'journal', ds });
                  }}
                  style={{
                    width: '100%',
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    padding: "9px 0",
                    borderTop: i > 0 ? "1px solid var(--dm-row)" : "none",
                    background: 'transparent',
                    borderLeft: 'none',
                    borderRight: 'none',
                    borderBottom: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: 'inherit',
                  }}
                >
                  <span style={{ fontSize: 10, fontWeight: 900, color: meta.color, background: meta.bg, borderRadius: 4, padding: "2px 6px", flexShrink: 0, marginTop: 2 }}>
                    {meta.label}
                  </span>
                  <span style={{ fontSize: 13, color: m.done ? "var(--dm-muted)" : "var(--dm-text)", lineHeight: 1.6, textDecoration: m.done ? "line-through" : "none", flex: 1, wordBreak: "break-word" }}>
                    {highlight(snip, query)}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--dm-muted)', flexShrink: 0, marginTop: 1 }}>
                    {m.type === 'task' ? '열기' : '보기'} ›
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
