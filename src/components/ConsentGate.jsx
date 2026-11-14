import { Fragment, useState } from "react";
import { createPortal } from "react-dom";
import termsMd from "../../docs/legal/terms.md?raw";
import privacyMd from "../../docs/legal/privacy.md?raw";
import { cleanLegal } from "../utils/consent.js";
import { useBackClose } from "../utils/useBackClose.js";

// 첫 로그인 동의 창 (2026-11-14, utils/consent.js) — 로그인한 계정에 동의 기록이 없으면 앱 위에 덮는다.
// 약관·방침은 "보기"로 앱 안에서 전문을 연다. 공개 전에는 꺼져 있고(CONSENT_ENABLED) 관리자가 미리 볼 수 있다(preview).
// 메모 관리자(900)·전국 지도(2000)보다 위 — zIndex 3000. 화면 크기 확대(.dm-phone zoom) 밖(body)에 그린다.

const ACCENT = "var(--dm-accent, #5B7CFA)";
const DOCS = {
  terms: { title: "이용약관", md: termsMd },
  privacy: { title: "개인정보처리방침", md: privacyMd },
};

export default function ConsentGate({ onAgree, onDecline, preview = false, onClosePreview }) {
  const [checks, setChecks] = useState({ terms: false, privacy: false, age14: false });
  const [doc, setDoc] = useState(null); // "terms" | "privacy"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useBackClose(() => onClosePreview?.(), preview);
  const all = checks.terms && checks.privacy && checks.age14;
  const toggleAll = () => setChecks(all ? { terms: false, privacy: false, age14: false } : { terms: true, privacy: true, age14: true });
  const agree = async () => {
    if (!all || busy) return;
    setBusy(true); setErr("");
    try { await onAgree(); } catch { setErr("저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요."); }
    setBusy(false);
  };

  const box = (on) => (
    <span aria-hidden="true" style={{ width: 24, height: 24, borderRadius: 7, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: on ? "none" : "2px solid var(--dm-border)", background: on ? ACCENT : "transparent", color: "#fff", fontSize: 15, fontWeight: 900 }}>{on ? "✓" : ""}</span>
  );
  const row = (key, label, docKey) => (
    <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, borderTop: "1px solid var(--dm-row)" }}>
      <button role="checkbox" aria-checked={checks[key]} onClick={() => setChecks(c => ({ ...c, [key]: !c[key] }))}
        style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10, padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "var(--dm-text)", fontSize: 16 }}>
        {box(checks[key])}
        <span><b style={{ color: ACCENT, fontWeight: 800 }}>[필수]</b> {label}</span>
      </button>
      {docKey && (
        <button onClick={() => setDoc(docKey)} style={{ flexShrink: 0, height: 40, padding: "0 12px", background: "none", border: "none", color: "var(--dm-sub)", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>보기</button>
      )}
    </div>
  );

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="서비스 이용 동의" style={{ position: "fixed", inset: 0, zIndex: 3000, background: "var(--dm-bg)", color: "var(--dm-text)", display: "flex", justifyContent: "center", overflowY: "auto" }}>
      <div style={{ width: "100%", maxWidth: 460, padding: "max(28px, env(safe-area-inset-top)) 20px calc(28px + env(safe-area-inset-bottom))", boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
        {preview && (
          <div style={{ fontSize: 14, fontWeight: 700, color: "#B45309", background: "rgba(245,158,11,.12)", border: "1px solid rgba(245,158,11,.35)", borderRadius: 10, padding: "8px 12px", marginBottom: 18 }}>
            미리 보기 — 지금은 꺼져 있어요. 공개할 때 켜면 모든 계정이 다음 로그인 때 이 화면을 봐요.
          </div>
        )}
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 8 }}>DayMate를 시작하기 전에</div>
        <div style={{ fontSize: 15, color: "var(--dm-sub)", lineHeight: 1.6, marginTop: 8 }}>
          계정에 기록을 안전하게 저장하려면 아래 내용에 동의해 주세요.
        </div>

        <div style={{ marginTop: 24, borderRadius: 14, background: "var(--dm-input)", padding: "4px 16px" }}>
          <button role="checkbox" aria-checked={all} onClick={toggleAll}
            style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, minHeight: 52, padding: "8px 0", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left", color: "var(--dm-text)", fontSize: 17, fontWeight: 900 }}>
            {box(all)} 모두 동의
          </button>
          {row("terms", "이용약관 동의", "terms")}
          {row("privacy", "개인정보 수집·이용 동의", "privacy")}
          {row("age14", "만 14세 이상이에요")}
        </div>
        <div style={{ fontSize: 14, color: "var(--dm-muted)", lineHeight: 1.6, marginTop: 12 }}>
          만 14세 미만은 가입할 수 없어요. AI 기능은 버튼을 누를 때만 내용을 보내요(자세한 내용은 개인정보처리방침).
        </div>

        {err && <div role="alert" style={{ fontSize: 14, color: "#EF4444", marginTop: 14 }}>{err}</div>}
        <div style={{ flex: 1, minHeight: 24 }} />
        <button onClick={agree} disabled={!all || busy}
          style={{ height: 52, borderRadius: 14, border: "none", background: all ? ACCENT : "var(--dm-row)", color: all ? "#fff" : "var(--dm-muted)", fontSize: 17, fontWeight: 900, cursor: all ? "pointer" : "default", fontFamily: "inherit", padding: 0 }}>
          {busy ? "저장하는 중…" : "동의하고 시작"}
        </button>
        <button onClick={onDecline} disabled={busy}
          style={{ height: 44, marginTop: 8, borderRadius: 12, border: "none", background: "none", color: "var(--dm-sub)", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
          {preview ? "닫기 (미리 보기)" : "동의하지 않음 (로그아웃)"}
        </button>
        {!preview && <div style={{ fontSize: 13, color: "var(--dm-muted)", textAlign: "center", marginTop: 4 }}>로그아웃해도 로그인 없이 이 기기에서는 계속 쓸 수 있어요.</div>}
      </div>
      {doc && <LegalDocSheet title={DOCS[doc].title} md={DOCS[doc].md} onClose={() => setDoc(null)} />}
    </div>,
    document.body,
  );
}

// 약관·방침 전문 보기
export function LegalDocSheet({ title, md, onClose }) {
  useBackClose(onClose);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 3010, background: "var(--dm-bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "max(12px, env(safe-area-inset-top)) 16px 10px", borderBottom: "1px solid var(--dm-border)" }}>
        <div style={{ flex: 1, fontSize: 19, fontWeight: 900, color: "var(--dm-text)" }}>{title}</div>
        <button onClick={onClose} aria-label="닫기" style={{ width: 40, height: 40, padding: 0, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 24, cursor: "pointer" }}>✕</button>
      </div>
      <div style={{ flex: 1, overflowY: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ width: "100%", maxWidth: 720, padding: "8px 20px calc(32px + env(safe-area-inset-bottom))", boxSizing: "border-box" }}>
          <LegalDoc md={cleanLegal(md)} />
        </div>
      </div>
    </div>
  );
}

// 작은 마크다운 그리기 — 제목(# ## ###)·목록(- / 1.)·표(|)·구분선·굵게(**)·기울임(*)
function inline(text) {
  return String(text).split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g).map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={i}>{p.slice(2, -2)}</b>;
    if (/^\*[^*]+\*$/.test(p)) return <i key={i}>{p.slice(1, -1)}</i>;
    if (/^`[^`]+`$/.test(p)) return <Fragment key={i}>{p.slice(1, -1)}</Fragment>;
    return <Fragment key={i}>{p}</Fragment>;
  });
}
function LegalDoc({ md }) {
  const lines = md.split("\n");
  const out = [];
  const text = { fontSize: 15, lineHeight: 1.7, color: "var(--dm-text)", margin: "6px 0" };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) continue;
    if (/^#\s/.test(l)) { out.push(<h1 key={i} style={{ fontSize: 22, fontWeight: 900, margin: "16px 0 8px", color: "var(--dm-text)" }}>{inline(l.slice(2))}</h1>); continue; }
    if (/^##\s/.test(l)) { out.push(<h2 key={i} style={{ fontSize: 18, fontWeight: 900, margin: "22px 0 6px", color: "var(--dm-text)" }}>{inline(l.slice(3))}</h2>); continue; }
    if (/^###\s/.test(l)) { out.push(<h3 key={i} style={{ fontSize: 16, fontWeight: 800, margin: "14px 0 4px", color: "var(--dm-text)" }}>{inline(l.slice(4))}</h3>); continue; }
    if (/^-{3,}\s*$/.test(l)) { out.push(<hr key={i} style={{ border: "none", borderTop: "1px solid var(--dm-border)", margin: "16px 0" }} />); continue; }
    if (/^\s*\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      i--;
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim());
      const [head, , ...body] = rows;
      out.push(
        <div key={i} style={{ overflowX: "auto", margin: "8px 0" }}>
          <table style={{ borderCollapse: "collapse", fontSize: 14, lineHeight: 1.5, minWidth: "100%" }}>
            <thead><tr>{cells(head).map((c, k) => <th key={k} style={{ textAlign: "left", padding: "6px 8px", borderBottom: "2px solid var(--dm-border)", color: "var(--dm-text)", whiteSpace: "nowrap" }}>{inline(c)}</th>)}</tr></thead>
            <tbody>{body.map((r, j) => <tr key={j}>{cells(r).map((c, k) => <td key={k} style={{ padding: "6px 8px", borderBottom: "1px solid var(--dm-row)", color: "var(--dm-sub)", verticalAlign: "top", minWidth: 90 }}>{inline(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>,
      );
      continue;
    }
    if (/^\s*(-|\d+\.)\s/.test(l)) {
      const ordered = /^\s*\d+\./.test(l);
      const items = [];
      while (i < lines.length && /^\s*(-|\d+\.)\s/.test(lines[i]) && /^\s*\d+\./.test(lines[i]) === ordered) { items.push(lines[i].replace(/^\s*(-|\d+\.)\s/, "")); i++; }
      i--;
      const Tag = ordered ? "ol" : "ul";
      out.push(<Tag key={i} style={{ ...text, paddingLeft: 22 }}>{items.map((it, k) => <li key={k} style={{ margin: "3px 0" }}>{inline(it)}</li>)}</Tag>);
      continue;
    }
    out.push(<p key={i} style={text}>{inline(l)}</p>);
  }
  return <div>{out}</div>;
}
