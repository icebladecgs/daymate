import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import S from "../styles.js";
import PhotoViewer from "./PhotoViewer.jsx";
import { createLockConfig, unlockSession, isUnlocked, lockNow, encryptMemo, decryptMemo, unlockedMemo } from "../utils/memoLock.js";
import { formatKoreanDate } from "../utils/date.js";

// 메모 잠금 창 — request: { id, action: 'lock' | 'open' }
//  · 잠금 비밀번호가 없으면 먼저 만들고(잊으면 복구 불가 안내), 있으면 비밀번호 확인(5분간 유지)
//  · lock: 메모를 암호화해서 바꿔 저장 / open: 풀어서 보여주고 고치기·잠금 풀기
export default function MemoLockSheet({ request, plans, cfg, onSaveCfg, onUpdateDayData, onClose, setToast }) {
  const found = (() => {
    for (const [ds, d] of Object.entries(plans || {})) {
      const m = (d?.memos || []).find(x => x.id === request.id);
      if (m) return { ds, memo: m };
    }
    return null;
  })();
  const [step, setStep] = useState(() => (!cfg ? "setup" : isUnlocked() ? "working" : "password"));
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [data, setData] = useState(null); // 풀린 내용 { text, photos, files }
  const [draft, setDraft] = useState("");
  const [viewer, setViewer] = useState(null);

  const replaceMemo = (next) => onUpdateDayData(found.ds, prev => ({ ...prev, memos: (prev.memos || []).map(m => (m.id === request.id ? next : m)) }));

  const proceed = async () => {
    setStep("working");
    try {
      if (request.action === "lock") {
        if (found.memo.locked) { onClose(); return; }
        replaceMemo(await encryptMemo(found.memo));
        setToast?.("🔒 메모를 잠갔어요");
        onClose();
        return;
      }
      if (!found.memo.locked) { onClose(); return; }
      const d = await decryptMemo(found.memo);
      setData(d);
      setDraft(d.text || "");
      setStep("view");
    } catch {
      setErr("메모를 열지 못했어요. 비밀번호를 다시 확인해 주세요.");
      lockNow();
      setStep("password");
    }
  };

  // 처음 열 때 이미 풀려 있으면 바로 진행
  useEffect(() => {
    if (!found) { setToast?.("메모를 찾을 수 없어요"); onClose(); return; }
    if (step === "working") queueMicrotask(proceed); // 이미 풀려 있으면 바로 진행 (렌더가 끝난 뒤)
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!found) return null;

  const setup = async () => {
    if (pw.length < 4) { setErr("비밀번호는 4자 이상으로 해 주세요"); return; }
    if (pw !== pw2) { setErr("두 비밀번호가 달라요"); return; }
    setStep("working");
    onSaveCfg(await createLockConfig(pw));
    setPw(""); setPw2("");
    proceed();
  };
  const unlock = async () => {
    setStep("working");
    const ok = await unlockSession(pw, cfg);
    setPw("");
    if (!ok) { setErr("비밀번호가 달라요"); setStep("password"); return; }
    setErr("");
    proceed();
  };
  const saveLocked = async () => {
    try {
      replaceMemo(await encryptMemo({ ...found.memo, text: draft, photos: data.photos, files: data.files }));
      setToast?.("🔒 잠긴 채로 저장했어요");
      onClose();
    } catch {
      setErr("5분이 지나 다시 잠겼어요. 비밀번호를 다시 넣어 주세요."); setStep("password");
    }
  };
  const removeLock = () => {
    if (!window.confirm("잠금을 풀까요? 이 메모는 일반 메모로 저장되어 서버에서도 읽을 수 있는 상태가 돼요.")) return;
    replaceMemo(unlockedMemo(found.memo, { ...data, text: draft }));
    setToast?.("🔓 잠금을 풀었어요");
    onClose();
  };

  const input = { ...S.input, marginBottom: 8 };
  const btn = (bg, color) => ({ flex: 1, padding: "11px 0", borderRadius: 10, border: "none", background: bg, color, fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" });
  const title = request.action === "lock" ? "🔒 메모 잠그기" : "🔒 잠긴 메모";
  // 메모 관리자(body, zIndex 900) 위에서도 열리므로 body에 그리고 그보다 위, 사진 보기(1000)보다는 아래
  const portalTarget = document.body;

  return createPortal(
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 950, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 430, maxHeight: "88vh", display: "flex", flexDirection: "column", background: "var(--dm-bg)", borderRadius: "20px 20px 0 0", padding: "16px 20px 20px", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 16, fontWeight: 900, color: "var(--dm-text)" }}>{title}</div>
          <button onClick={onClose} aria-label="닫기" style={{ background: "none", border: "none", color: "var(--dm-muted)", fontSize: 22, cursor: "pointer", padding: "0 4px" }}>✕</button>
        </div>

        {step === "setup" && (
          <>
            <div style={{ fontSize: 13, color: "var(--dm-sub)", lineHeight: 1.7, marginBottom: 12 }}>
              메모 잠금 비밀번호를 만들어 주세요. 잠근 메모는 이 기기에서 암호로 바꾼 뒤 저장되어, 서버나 관리자도 읽을 수 없어요.
              <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "rgba(248,113,113,.1)", border: "1px solid rgba(248,113,113,.35)", color: "#F87171", fontWeight: 700 }}>
                ⚠️ 비밀번호를 잊으면 잠근 메모는 누구도 되살릴 수 없어요. 꼭 기억해 두세요.
              </div>
            </div>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} placeholder="비밀번호 (4자 이상)" style={input} autoFocus />
            <input type="password" value={pw2} onChange={e => { setPw2(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && setup()} placeholder="비밀번호 확인" style={input} />
            {err && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>{err}</div>}
            <button onClick={setup} style={btn("#6C8EFF", "#fff")}>비밀번호 만들기</button>
          </>
        )}

        {step === "password" && (
          <>
            <div style={{ fontSize: 13, color: "var(--dm-sub)", marginBottom: 10 }}>메모 잠금 비밀번호를 넣어 주세요. (5분 동안 다시 묻지 않아요)</div>
            <input type="password" value={pw} onChange={e => { setPw(e.target.value); setErr(""); }} onKeyDown={e => e.key === "Enter" && unlock()} placeholder="비밀번호" style={input} autoFocus />
            {err && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>{err}</div>}
            <button onClick={unlock} style={btn("#6C8EFF", "#fff")}>확인</button>
          </>
        )}

        {step === "working" && <div style={{ padding: "24px 0", textAlign: "center", color: "var(--dm-muted)", fontSize: 13 }}>처리 중…</div>}

        {step === "view" && data && (
          <>
            <div style={{ fontSize: 12, color: "var(--dm-muted)", marginBottom: 8 }}>{formatKoreanDate(found.ds)}{found.memo.createdAt ? ` · ${found.memo.createdAt}` : ""}</div>
            <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={10}
              style={{ ...S.input, flex: 1, minHeight: 160, resize: "vertical", lineHeight: 1.7, fontSize: 14, fontFamily: "inherit", marginBottom: 10 }} />
            {data.photos?.length > 0 && (
              <div style={{ display: "flex", gap: 6, marginBottom: 10, overflowX: "auto" }}>
                {data.photos.map((p, i) => (
                  <img key={p.path || i} src={p.url} alt="첨부 사진" onClick={() => setViewer(i)}
                    style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 8, cursor: "zoom-in", flexShrink: 0 }} />
                ))}
              </div>
            )}
            {err && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>{err}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={removeLock} style={btn("var(--dm-input)", "var(--dm-sub)")}>🔓 잠금 풀기</button>
              <button onClick={saveLocked} style={btn("#6C8EFF", "#fff")}>🔒 잠근 채 저장</button>
            </div>
            <button onClick={() => { lockNow(); onClose(); }} style={{ marginTop: 10, background: "none", border: "none", color: "var(--dm-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              지금 바로 잠그기 (5분 기다리지 않고 다시 비밀번호 묻기)
            </button>
          </>
        )}
        {viewer !== null && <PhotoViewer photos={data.photos} index={viewer} onClose={() => setViewer(null)} />}
      </div>
    </div>,
    portalTarget,
  );
}
