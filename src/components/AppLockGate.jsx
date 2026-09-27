import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getAppLock, isAppLockOn, checkPin, lockWaitMs, failsLeft, clearAppLock } from "../utils/appLock.js";

// 앱 잠금 화면 — 앱을 켤 때, 그리고 앱을 벗어났다가 정한 시간(기본 5분) 넘게 지나 돌아올 때 비밀번호 4자리를 묻는다.
// 앱(App)은 뒤에서 그대로 떠서 동기화를 계속하고, 이 화면이 맨 위에서 가린다. 포스트잇 창(?view=sticky)은 이 잠금 밖이다.
export default function AppLockGate() {
  const [locked, setLocked] = useState(() => isAppLockOn());
  const hiddenAt = useRef(0);

  // 떠난 때: 휴대폰·브라우저는 visibilitychange, 데스크탑 앱은 창을 트레이로 숨기거나 최소화할 때
  // 앱이 보내는 dm:app-hidden / dm:app-shown (숨긴 창도 visibilityState가 visible로 남아서)
  useEffect(() => {
    const leave = () => { if (!hiddenAt.current) hiddenAt.current = Date.now(); };
    const back = () => {
      const cfg = getAppLock();
      if (cfg?.hash && hiddenAt.current && Date.now() - hiddenAt.current >= (cfg.idleMin ?? 5) * 60000) setLocked(true);
      hiddenAt.current = 0;
    };
    const onVis = () => (document.visibilityState === "hidden" ? leave() : back());
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("dm:app-hidden", leave);
    window.addEventListener("dm:app-shown", back);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("dm:app-hidden", leave);
      window.removeEventListener("dm:app-shown", back);
    };
  }, []);

  if (!locked) return null;
  return createPortal(<LockScreen onUnlock={() => setLocked(false)} />, document.body);
}

function LockScreen({ onUnlock }) {
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState("");
  const [wait, setWait] = useState(() => lockWaitMs());
  const [busy, setBusy] = useState(false);
  const pinRef = useRef(pin);
  pinRef.current = pin;

  // 입력 막힘 남은 시간 표시
  useEffect(() => {
    if (wait <= 0) return;
    const t = setInterval(() => setWait(lockWaitMs()), 500);
    return () => clearInterval(t);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async (p) => {
    setBusy(true);
    const ok = await checkPin(p);
    setBusy(false);
    if (ok) { onUnlock(); return; }
    setPin("");
    const w = lockWaitMs();
    setWait(w);
    setMsg(w > 0 ? "5번 틀려서 잠시 입력할 수 없어요" : `비밀번호가 달라요 (남은 횟수 ${failsLeft()}번)`);
  };

  const press = (d) => {
    if (busy || lockWaitMs() > 0) return;
    const next = (pinRef.current + d).slice(0, 4);
    setPin(next);
    setMsg("");
    if (next.length === 4) submit(next);
  };
  const back = () => { if (!busy) setPin(p => p.slice(0, -1)); };

  // PC 키보드 숫자 입력. 잠금 중에는 뒤쪽 앱으로 키가 가지 않게 막는다
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e) => {
      e.stopPropagation();
      if (/^\d$/.test(e.key)) { e.preventDefault(); pressRef.current(e.key); }
      else if (e.key === "Backspace") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const forgot = async () => {
    if (!window.confirm("잠금을 설정한 구글 계정으로 다시 로그인하면 잠금이 풀려요.\n풀린 뒤 설정 → 앱 관리에서 새 비밀번호를 정해 주세요.\n\n계속할까요?")) return;
    try {
      const { googleReauth } = await import("../firebase.js");
      const uid = await googleReauth();
      if (uid !== getAppLock()?.uid) { setMsg("잠금을 설정한 계정이 아니에요"); return; }
      clearAppLock();
      onUnlock();
    } catch (e) {
      const code = e?.code || e?.message || "";
      setMsg(code.includes("user-mismatch") ? "잠금을 설정한 계정으로 로그인해 주세요"
        : code.includes("no-user") ? "이 기기에 로그인 정보가 없어서 확인할 수 없어요"
        : code.includes("popup-closed") || code.includes("cancelled") ? "" : "확인하지 못했어요. 다시 시도해 주세요");
    }
  };

  const keyBtn = { width: 76, height: 76, padding: 0, borderRadius: "50%", border: "1px solid var(--dm-border)", background: "var(--dm-card)", color: "var(--dm-text)", fontSize: 28, fontWeight: 700, cursor: "pointer" };
  const waiting = wait > 0;

  return (
    <div role="dialog" aria-label="앱 잠금" style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "var(--dm-bg)", color: "var(--dm-text)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22, userSelect: "none", fontFamily: "inherit" }}>
      <div style={{ fontSize: 40 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 900 }}>비밀번호 4자리</div>
      <div style={{ display: "flex", gap: 18 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: "50%", border: "2px solid #6C8EFF", background: i < pin.length ? "#6C8EFF" : "transparent" }} />
        ))}
      </div>
      <div style={{ minHeight: 22, fontSize: 15, color: "#F87171", fontWeight: 700, textAlign: "center" }}>
        {waiting ? `${Math.ceil(wait / 1000)}초 뒤에 다시 입력할 수 있어요` : msg}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 76px)", gap: 16, opacity: waiting ? 0.4 : 1 }}>
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(d => (
          <button key={d} onClick={() => press(d)} style={keyBtn}>{d}</button>
        ))}
        <div />
        <button onClick={() => press("0")} style={keyBtn}>0</button>
        <button onClick={back} aria-label="지우기" style={{ ...keyBtn, border: "none", background: "transparent", fontSize: 24 }}>⌫</button>
      </div>
      <button onClick={forgot} style={{ marginTop: 6, padding: "8px 12px", border: "none", background: "transparent", color: "var(--dm-muted)", fontSize: 15, textDecoration: "underline", cursor: "pointer" }}>
        비밀번호를 잊었어요
      </button>
    </div>
  );
}
