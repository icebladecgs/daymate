import { parseMemoLines, parseInline } from "../utils/memoView.js";
import { openLink } from "../utils/links.js";

// 메모 "👁 보기" 화면 — 제목·목록·체크박스·링크·[[키워드]]·#태그를 읽기 좋게 그린다.
// 체크박스는 눌러서 바로 켜고 끈다(onToggle → 글의 [ ]/[x]만 바뀜). [[키워드]]·#태그는 onTag(이름)로 그 태그 목록을 연다.
// 더블클릭하면 편집으로 돌아간다(onEdit).
export default function MemoView({ text, onToggle, onTag, onEdit, placeholder = "내용이 없어요" }) {
  const rows = parseMemoLines(text);
  const accent = "#6C8EFF";

  const inline = (s) => parseInline(s).map((p, i) => {
    if (p.type === "bold") return <b key={i}>{p.value}</b>;
    if (p.type === "code") return <code key={i} style={{ padding: "1px 5px", borderRadius: 4, background: "var(--dm-row)", fontSize: "0.92em" }}>{p.value}</code>;
    if (p.type === "link") return <a key={i} href={p.href} onClick={e => { e.preventDefault(); openLink(p.href); }} style={{ color: accent, textDecoration: "underline", wordBreak: "break-all" }}>{p.value}</a>;
    if (p.type === "wiki" || p.type === "tag") {
      const label = p.type === "wiki" ? `[[${p.value}]]` : `#${p.value}`;
      return (
        <button key={i} onClick={() => onTag?.(p.value)} title={`'${p.value}' 들어간 기록 보기`}
          style={{ padding: "0 4px", margin: 0, border: "none", borderRadius: 4, background: "rgba(108,142,255,.12)", color: accent, font: "inherit", fontWeight: 700, cursor: "pointer" }}>
          {label}
        </button>
      );
    }
    return <span key={i}>{p.value}</span>;
  });

  const indent = (level) => ({ paddingLeft: level * 22 });
  return (
    <div onDoubleClick={e => { if (!e.target.closest("button,a,input")) onEdit?.(); }} title="더블클릭하면 편집"
      style={{ flex: 1, minHeight: 80, overflowY: "auto", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--dm-border)", background: "var(--dm-input)", color: "var(--dm-text)", fontSize: 14, lineHeight: 1.7, wordBreak: "break-word" }}>
      {!String(text || "").trim() && <div style={{ color: "var(--dm-muted)" }}>{placeholder}</div>}
      {rows.map(r => {
        if (r.type === "blank") return <div key={r.line} style={{ height: "0.7em" }} />;
        if (r.type === "hr") return <hr key={r.line} style={{ border: "none", borderTop: "1px solid var(--dm-border)", margin: "8px 0" }} />;
        if (r.type === "heading") {
          const size = { 1: 20, 2: 17, 3: 15.5 }[r.depth];
          return <div key={r.line} style={{ fontSize: size, fontWeight: 900, lineHeight: 1.4, margin: "8px 0 4px" }}>{inline(r.content)}</div>;
        }
        if (r.type === "quote") return <div key={r.line} style={{ borderLeft: "3px solid var(--dm-border)", paddingLeft: 10, color: "var(--dm-sub)" }}>{inline(r.content)}</div>;
        if (r.type === "check") {
          return (
            <label key={r.line} style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer", ...indent(r.level) }}>
              <input type="checkbox" checked={r.checked} onChange={() => onToggle?.(r.line)}
                style={{ width: 17, height: 17, margin: "0.25em 0 0", flexShrink: 0, accentColor: accent, cursor: "pointer" }} />
              <span style={{ textDecoration: r.checked ? "line-through" : "none", color: r.checked ? "var(--dm-muted)" : "inherit" }}>{inline(r.content)}</span>
            </label>
          );
        }
        if (r.type === "item") {
          const bullet = /^\d/.test(r.marker) ? r.marker : ["•", "◦", "▪"][r.level % 3];
          return (
            <div key={r.line} style={{ display: "flex", gap: 8, ...indent(r.level) }}>
              <span style={{ flexShrink: 0, minWidth: /^\d/.test(r.marker) ? 20 : 10, color: "var(--dm-sub)", textAlign: "right" }}>{bullet}</span>
              <span>{inline(r.content)}</span>
            </div>
          );
        }
        return <div key={r.line} style={indent(r.level)}>{inline(r.content)}</div>;
      })}
    </div>
  );
}
